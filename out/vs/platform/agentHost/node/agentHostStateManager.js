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
import { RunOnceScheduler } from "../../../base/common/async.js";
import { Emitter } from "../../../base/common/event.js";
import { Disposable } from "../../../base/common/lifecycle.js";
import { equals } from "../../../base/common/objects.js";
import { ILogService } from "../../log/common/log.js";
import { createDecorator } from "../../instantiation/common/instantiation.js";
import { TelemetryLevel } from "../../telemetry/common/telemetry.js";
import { ActionType, isRootAction, isSessionAction, isChatAction, isChangesetAction, isAnnotationsAction } from "../common/state/sessionActions.js";
import { rootReducer, sessionReducer, chatReducer, changesetReducer, annotationsReducer } from "../common/state/sessionReducers.js";
import { createRootState, createSessionState, createChatState, createDefaultChatSummary, chatSummaryFromState, buildDefaultChatUri, parseDefaultChatUri, parseRequiredSessionUriFromChatUri, isAhpChatChannel, isDefaultChatUri, mergeSessionWithDefaultChat, isAhpRootChannel, SessionLifecycle, withHostBuildInfo, ROOT_STATE_URI, ChangesetStatus, SessionStatus } from "../common/state/sessionState.js";
import { AgentHostTelemetryLevelConfigKey, platformRootSchema, telemetryLevelToAgentHostConfigValue } from "../common/agentHostSchema.js";
import { SessionConfigKey } from "../common/sessionConfigKeys.js";
import { parseChangesetUri } from "../common/changesetUri.js";
import { buildAnnotationsUri, isAnnotationsUri } from "../common/annotationsUri.js";
import { AgentHostChangesetStateCache } from "./agentHostChangesetStateCache.js";
import { arrayEquals, structuralEquals } from "../../../base/common/equals.js";
import { preserveProviderBackedRootConfigValues } from "../common/agentCustomizationSettings.js";
var SessionUse = /* @__PURE__ */ ((SessionUse2) => {
  SessionUse2[SessionUse2["UnusedDraft"] = 0] = "UnusedDraft";
  SessionUse2[SessionUse2["Used"] = 1] = "Used";
  return SessionUse2;
})(SessionUse || {});
class SessionSummaryNotifier extends Disposable {
  constructor(_getSummary, _emit) {
    super();
    this._getSummary = _getSummary;
    this._emit = _emit;
    /** Last summary announced to clients (via sessionAdded or sessionSummaryChanged). */
    this._lastNotified = /* @__PURE__ */ new Map();
    /** Sessions whose summary changed since the last flush. */
    this._dirty = /* @__PURE__ */ new Set();
    this._scheduler = this._register(new RunOnceScheduler(() => this._flushAll(), 100));
  }
  /** Records `summary` as the last value announced to clients for `session`. */
  announce(session, summary) {
    this._lastNotified.set(session, summary);
  }
  /** Whether `session` has already been announced to clients. */
  isAnnounced(session) {
    return this._lastNotified.has(session);
  }
  /** The last summary announced to clients for `session`, if any. */
  getAnnounced(session) {
    return this._lastNotified.get(session);
  }
  /** Marks `session` dirty and schedules a debounced flush. */
  markDirty(session) {
    this._dirty.add(session);
    this._scheduler.schedule();
  }
  /** Whether `session` has a pending (unflushed) summary change. */
  isDirty(session) {
    return this._dirty.has(session);
  }
  /** Drops the pending dirty flag for `session` without flushing it. */
  clearDirty(session) {
    this._dirty.delete(session);
  }
  /** Drops all notification bookkeeping for `session`. */
  remove(session) {
    this._lastNotified.delete(session);
    this._dirty.delete(session);
  }
  _flushAll() {
    for (const session of this._dirty) {
      this.flush(session);
    }
    this._dirty.clear();
  }
  /**
   * Emits a `root/sessionSummaryChanged` notification for `session` if its
   * current summary differs from the last announced one, then advances the
   * snapshot. Does NOT clear the dirty flag — callers own that bookkeeping.
   */
  flush(session) {
    const current = this._getSummary(session);
    const lastNotified = this._lastNotified.get(session);
    if (!current || !lastNotified) {
      return;
    }
    const changes = {};
    if (current.title !== lastNotified.title) {
      changes.title = current.title;
    }
    if (current.status !== lastNotified.status) {
      changes.status = current.status;
    }
    if (current.activity !== lastNotified.activity) {
      changes.activity = current.activity;
    }
    if (current.modifiedAt !== lastNotified.modifiedAt) {
      changes.modifiedAt = current.modifiedAt;
    }
    if (current.project !== lastNotified.project) {
      changes.project = current.project;
    }
    if (current.changes !== lastNotified.changes) {
      changes.changes = current.changes;
    }
    if (current.workingDirectories !== lastNotified.workingDirectories) {
      changes.workingDirectories = current.workingDirectories;
    }
    if (current._meta !== lastNotified._meta) {
      changes._meta = current._meta;
    }
    this._lastNotified.set(session, current);
    if (Object.keys(changes).length > 0) {
      this._emit(session, changes);
    }
  }
}
const IAgentHostStateManager = createDecorator("agentHostStateManager");
let AgentHostStateManager = class extends Disposable {
  constructor(_logService, options = {}) {
    super();
    this._logService = _logService;
    this._serverSeq = 0;
    /**
     * Authoritative per-session state, keyed by session URI string. Each entry
     * bundles the flat {@link SessionState} with the catalog-only fields that
     * are not part of the state (`createdAt`, `modifiedAt`, `changes`). The
     * root-channel {@link SessionSummary} catalog view is derived on demand from
     * an entry via {@link getSessionSummary} (its `_meta` is the same object as
     * {@link SessionState._meta}); the host streams catalog deltas via
     * `root/sessionSummaryChanged`.
     */
    this._sessionStates = /* @__PURE__ */ new Map();
    /**
     * Authoritative chat catalog, keyed by chat channel URI. Every catalog
     * summary has an entry, while only resolved chats have a {@link ChatState}.
     */
    this._chatEntries = /* @__PURE__ */ new Map();
    /**
     * Per-channel annotation states for the `<session>/annotations` channel.
     * Unlike changesets (server-owned), annotation actions are
     * client-dispatchable and lazily create their state on first write.
     */
    this._annotations = /* @__PURE__ */ new Map();
    /**
     * Active turns per session, keyed by session URI string with the value
     * being the set of that session's chat channel URIs that currently have an
     * active turn. A session is "active" while at least one of its chats is
     * streaming — this stays correct for multi-chat sessions whose chats can run
     * concurrent turns (e.g. agent-team / sub-agent workers), where the previous
     * single-flag-per-session model would clear too early. Active state is
     * derived from `state.activeTurn` (the source of truth maintained by the
     * session reducer) — never from raw action turn-ids — so that mismatched or
     * out-of-order turn lifecycle actions can't desync it from reality. The
     * session count (`size`) drives `RootActiveSessionsChanged` and
     * `hasActiveSessions`, which together gate `--enable-remote-auto-shutdown`.
     */
    this._sessionsWithActiveTurn = /* @__PURE__ */ new Map();
    this._onDidEmitEnvelope = this._register(new Emitter());
    this.onDidEmitEnvelope = this._onDidEmitEnvelope.event;
    this._onDidEmitNotification = this._register(new Emitter());
    this.onDidEmitNotification = this._onDidEmitNotification.event;
    this._onDidChangeSessionActiveTurn = this._register(new Emitter());
    this.onDidChangeSessionActiveTurn = this._onDidChangeSessionActiveTurn.event;
    this._onDidChangeSessionTitle = this._register(new Emitter());
    this.onDidChangeSessionTitle = this._onDidChangeSessionTitle.event;
    this._onDidChangeSessionConfig = this._register(new Emitter());
    this.onDidChangeSessionConfig = this._onDidChangeSessionConfig.event;
    this._onDidChangeSessionWorkingDirectories = this._register(new Emitter());
    this.onDidChangeSessionWorkingDirectories = this._onDidChangeSessionWorkingDirectories.event;
    this._log = (msg) => this._logService.warn(`[AgentHostStateManager] ${msg}`);
    this._changesets = new AgentHostChangesetStateCache(options.changesetStateRetention);
    this._rootState = createRootState();
    this._rootState = {
      ...this._rootState,
      config: {
        schema: platformRootSchema.toProtocol(),
        values: platformRootSchema.validateOrDefault({}, {
          [SessionConfigKey.Permissions]: { allow: [], deny: [] },
          [AgentHostTelemetryLevelConfigKey]: telemetryLevelToAgentHostConfigValue(TelemetryLevel.USAGE)
        })
      },
      _meta: withHostBuildInfo(this._rootState._meta, options.hostBuildInfo)
    };
    this._summaryNotifier = this._register(new SessionSummaryNotifier(
      (session) => {
        const entry = this._sessionStates.get(session);
        return entry ? this._toSummary(session, entry) : void 0;
      },
      (session, changes) => this._onDidEmitNotification.fire({
        type: "root/sessionSummaryChanged",
        channel: ROOT_STATE_URI,
        session,
        changes
      })
    ));
  }
  get hasActiveSessions() {
    return this._sessionsWithActiveTurn.size > 0;
  }
  /**
   * Whether the given session currently has an active turn — i.e. a request is
   * in progress on any of its chats. Stays `true` while at least one chat is
   * streaming, so it remains correct for multi-chat sessions running
   * concurrent turns.
   */
  hasActiveTurn(sessionKey) {
    return this._sessionsWithActiveTurn.has(sessionKey);
  }
  // ---- State accessors ----------------------------------------------------
  get rootState() {
    return this._rootState;
  }
  getSessionState(sessionOrChat) {
    const isChat = isAhpChatChannel(sessionOrChat);
    const session = this._resolveOwningSession(sessionOrChat);
    if (session === void 0) {
      return void 0;
    }
    const entry = this._sessionStates.get(session);
    if (!entry) {
      return void 0;
    }
    const chatUri = isChat ? sessionOrChat : buildDefaultChatUri(session);
    return mergeSessionWithDefaultChat(entry.state, this._chatEntries.get(chatUri)?.state);
  }
  /**
   * Whether a session is still an unused draft minted by this process, or
   * `undefined` when the session is not currently in state. Accepts either a
   * session URI or one of its chat channel URIs.
   *
   * Callers about to destroy durable data must use this rather than checking
   * whether the session currently looks empty.
   */
  isUnusedDraft(sessionOrChat) {
    const session = this._resolveOwningSession(sessionOrChat);
    if (session === void 0) {
      return void 0;
    }
    const entry = this._sessionStates.get(session);
    return entry && entry.use === 0 /* UnusedDraft */;
  }
  /** Permanently marks a session as used, so it is never auto-collected. */
  _markSessionUsed(session) {
    const entry = this._sessionStates.get(session);
    if (entry) {
      entry.use = 1 /* Used */;
    }
  }
  _resolveOwningSession(sessionOrChat) {
    return isAhpChatChannel(sessionOrChat) ? parseDefaultChatUri(sessionOrChat) : sessionOrChat;
  }
  /**
   * Returns the root-channel {@link SessionSummary} catalog entry for a
   * session, or `undefined` when the session is unknown. The summary is
   * derived on demand from the session's {@link ISessionEntry}: its metadata
   * fields and `_meta` come straight off the live {@link SessionState}, while
   * the catalog-only `resource` / `createdAt` / `modifiedAt` / `changes` come
   * from the entry.
   */
  getSessionSummary(session) {
    const entry = this._sessionStates.get(session);
    return entry ? this._toSummary(session, entry) : void 0;
  }
  /** Returns an unrestored session's last surfaced summary, if any. */
  getSurfacedSessionSummary(session) {
    return this._sessionStates.has(session) ? void 0 : this._summaryNotifier.getAnnounced(session);
  }
  /**
   * Projects an {@link ISessionEntry} into its root-channel
   * {@link SessionSummary}. The summary's `_meta` is the same object as
   * {@link SessionState._meta} — the host treats the two as identical.
   */
  _toSummary(session, entry) {
    const { state } = entry;
    const summary = {
      resource: session,
      provider: state.provider,
      title: state.title,
      status: state.status,
      createdAt: entry.createdAt,
      modifiedAt: entry.modifiedAt
    };
    if (state.activity !== void 0) {
      summary.activity = state.activity;
    }
    if (state.project !== void 0) {
      summary.project = state.project;
    }
    if (state.workingDirectories !== void 0) {
      summary.workingDirectories = state.workingDirectories;
    }
    if (state.annotations !== void 0) {
      summary.annotations = state.annotations;
    }
    if (entry.changes !== void 0) {
      summary.changes = entry.changes;
    }
    if (state._meta !== void 0) {
      summary._meta = state._meta;
    }
    return summary;
  }
  /**
   * Whether the {@link SessionSummary}-relevant fields of two session states
   * are field-equal. Used to decide whether a session action mutated anything
   * the root-channel catalog cares about.
   */
  _summaryFieldsEqual(a, b) {
    return a.title === b.title && a.status === b.status && a.activity === b.activity && a.project === b.project && a.workingDirectories === b.workingDirectories && a.annotations === b.annotations && a._meta === b._meta;
  }
  /**
   * Returns the authoritative {@link ChatState} for a session's default
   * chat, or `undefined` when the session is unknown. Use this when the
   * caller specifically needs conversation contents (turns, activeTurn,
   * pending/input state) rather than the session summary.
   */
  getDefaultChatState(session) {
    return this._chatEntries.get(buildDefaultChatUri(session))?.state;
  }
  /** Returns already-hydrated state without triggering resolution or I/O. */
  getChatState(chat) {
    return this._chatEntries.get(chat)?.state;
  }
  /**
   * Returns a chat's {@link ChatOrigin} from its catalog summary, not its
   * (lazily-materialized) {@link ChatState}: a restored chat registers its
   * summary — origin included — up front, before state resolves via
   * {@link resolveChatState}. Origin is immutable, so no hydration is needed.
   */
  getChatOrigin(chat) {
    return this._chatEntries.get(chat)?.summary.origin;
  }
  /**
   * Resolves a restored chat's provider backing and history when necessary.
   * Concurrent calls for one entry share its resolver; a failed attempt can
   * be retried unless the entry was removed or replaced.
   */
  resolveChatState(chat) {
    const entry = this._chatEntries.get(chat);
    if (!entry || !entry.valid) {
      return Promise.resolve(void 0);
    }
    if (entry.state) {
      return Promise.resolve(entry.state);
    }
    if (!entry.resolver) {
      return Promise.resolve(void 0);
    }
    if (entry.inFlight) {
      return entry.inFlight;
    }
    const inFlight = (async () => {
      const restored = await entry.resolver(entry.providerData);
      if (!entry.valid || this._chatEntries.get(chat) !== entry) {
        throw new Error(`Restored chat was invalidated while resolving: ${chat}`);
      }
      if (!entry.state) {
        entry.state = { ...createChatState(entry.summary), turns: restored.turns, draft: restored.draft ?? entry.draft };
        entry.resolver = void 0;
        if (restored.turns.length > 0) {
          this._markSessionUsed(entry.session);
        }
      }
      return entry.state;
    })();
    entry.inFlight = inFlight;
    void inFlight.then(
      () => {
        if (entry.inFlight === inFlight) {
          entry.inFlight = void 0;
        }
      },
      () => {
        if (entry.inFlight === inFlight) {
          entry.inFlight = void 0;
        }
      }
    );
    return inFlight;
  }
  /** Replaces a chat's opaque, agent-owned provider data without interpreting it. */
  updateChatProviderData(chat, providerData) {
    const entry = this._chatEntries.get(chat);
    if (entry) {
      entry.providerData = providerData;
    }
  }
  /**
   * Seeds the conversation contents (turns) of a session's default chat.
   * Used by the fork flow, which materializes a new session pre-populated
   * with a slice of the source session's turns.
   */
  seedDefaultChatTurns(session, turns) {
    const chatState = this._chatEntries.get(buildDefaultChatUri(session))?.state;
    if (chatState) {
      chatState.turns = turns;
    }
    if (turns.length > 0) {
      this._markSessionUsed(session);
    }
  }
  get serverSeq() {
    return this._serverSeq;
  }
  getSessionUris() {
    return [...this._sessionStates.keys()];
  }
  /**
   * Summaries eligible to be overlaid onto a provider's `listSessions`
   * snapshot when that snapshot is missing them. A session qualifies if it
   * has materialized (lifecycle !== {@link SessionLifecycle.Creating}) — this
   * covers the transient-drop case where a provider briefly omits a
   * just-materialized session — or if it is still provisional but has had any
   * turn activity (an in-flight turn, or a completed turn whose materialize
   * event has not landed yet; the first turn can start before materialization
   * completes). Idle provisional sessions (created but not yet materialized
   * and with no turn activity, e.g. the new-session composer's eagerly-created
   * session before its first message) are excluded so they don't leak into
   * the session list (#321269).
   */
  getOverlaySessionSummaries() {
    const summaries = [];
    for (const [key, entry] of this._sessionStates) {
      if (this._isIdleProvisional(key, entry.state.lifecycle)) {
        continue;
      }
      summaries.push(this._toSummary(key, entry));
    }
    return summaries;
  }
  /**
   * Whether a session is created but not yet materialized ({@link SessionLifecycle.Creating})
   * with no turn activity — e.g. the new-session composer's eagerly-created
   * session before its first message. Such sessions must not leak into the
   * session list (#321269). Returns `false` if the session has no tracked state.
   */
  isIdleProvisionalSession(session) {
    const entry = this._sessionStates.get(session);
    return entry ? this._isIdleProvisional(session, entry.state.lifecycle) : false;
  }
  _isIdleProvisional(session, lifecycle) {
    const chat = this._chatEntries.get(buildDefaultChatUri(session))?.state;
    return lifecycle === SessionLifecycle.Creating && !chat?.activeTurn && (chat?.turns.length ?? 0) === 0;
  }
  /**
   * Returns all session URIs whose keys start with the given prefix.
   * Used to discover subagent sessions for a given parent.
   */
  getSessionUrisWithPrefix(prefix) {
    const result = [];
    for (const key of this._sessionStates.keys()) {
      if (key.startsWith(prefix)) {
        result.push(key);
      }
    }
    return result;
  }
  // ---- Snapshots ----------------------------------------------------------
  /**
   * Returns a state snapshot for a given resource URI.
   * The `fromSeq` in the snapshot is the current serverSeq at snapshot time;
   * the client should process subsequent envelopes with serverSeq > fromSeq.
   */
  getSnapshot(resource) {
    if (isAhpRootChannel(resource)) {
      return {
        resource: ROOT_STATE_URI,
        state: this._rootState,
        fromSeq: this._serverSeq
      };
    }
    const changesetState = this._changesets.get(resource);
    if (changesetState) {
      return {
        resource,
        state: changesetState,
        fromSeq: this._serverSeq
      };
    }
    if (isAhpChatChannel(resource)) {
      const chatState = this._chatEntries.get(resource)?.state;
      if (!chatState) {
        return void 0;
      }
      return {
        resource,
        state: chatState,
        fromSeq: this._serverSeq
      };
    }
    if (isAnnotationsUri(resource)) {
      return {
        resource,
        state: this._annotations.get(resource) ?? { annotations: [] },
        fromSeq: this._serverSeq
      };
    }
    const entry = this._sessionStates.get(resource);
    if (!entry) {
      return void 0;
    }
    return {
      resource,
      state: entry.state,
      fromSeq: this._serverSeq
    };
  }
  /** Read-only accessor for callers that only need to inspect a changeset (not subscribe). */
  getChangesetState(changeset) {
    return this._changesets.get(changeset);
  }
  /** Reconsiders changeset state retention after subscribers or computes release their pins. */
  onChangesetLivenessChanged() {
    this._changesets.trimEvictableEntries();
  }
  // ---- Session lifecycle --------------------------------------------------
  /**
   * Creates a new session in state with `lifecycle: 'creating'`.
   * Returns the initial session state.
   *
   * By default a {@link NotificationType.SessionAdded} notification is
   * emitted so clients see the new session immediately. Pass
   * `options.emitNotification: false` to defer the notification — a typical
   * use is for **provisional** sessions that exist on the server but should
   * not appear in client session lists until they have been persisted by
   * the agent (e.g. on the first message that materializes an SDK session
   * and writes its on-disk metadata). Call {@link markSessionPersisted}
   * afterwards to fire the deferred notification.
   */
  createSession(summary, options) {
    const key = summary.resource;
    const existing = this._sessionStates.get(key);
    if (existing) {
      this._logService.warn(`[AgentHostStateManager] Session already exists: ${key}`);
      return existing.state;
    }
    const state = createSessionState(summary);
    this._sessionStates.set(key, this._newEntry(state, summary, 0 /* UnusedDraft */));
    this._ensureDefaultChat(key, summary);
    this._logService.trace(`[AgentHostStateManager] Created session: ${key}`);
    if (options?.emitNotification !== false) {
      this._summaryNotifier.announce(key, summary);
      this._onDidEmitNotification.fire({
        type: "root/sessionAdded",
        channel: ROOT_STATE_URI,
        summary
      });
    }
    return state;
  }
  /** Builds the authoritative {@link ISessionEntry} for a freshly seeded state. */
  _newEntry(state, summary, use) {
    return { state, createdAt: summary.createdAt, modifiedAt: summary.modifiedAt, changes: summary.changes, use };
  }
  /**
   * Fire a {@link NotificationType.SessionAdded} notification for a session
   * whose creation was deferred via `createSession({ emitNotification: false })`.
   *
   * Propagates the materialization-resolved catalog fields (`project`,
   * `workingDirectory`, `modifiedAt`, `changes`) from the supplied summary
   * onto the session entry so subscribers see them. The reducer-owned metadata
   * (`title`, `status`, `activity`) is intentionally NOT copied back — the live
   * state is authoritative for those. No-ops for sessions that were already
   * announced (idempotent).
   */
  markSessionPersisted(session, summary, force = false) {
    const key = session.toString();
    const entry = this._sessionStates.get(key);
    if (!entry) {
      this._logService.warn(`[AgentHostStateManager] markSessionPersisted: unknown session ${key}`);
      return;
    }
    if (!force && this._summaryNotifier.isAnnounced(key)) {
      return;
    }
    entry.state = { ...entry.state, project: summary.project, workingDirectories: summary.workingDirectories };
    entry.modifiedAt = summary.modifiedAt;
    entry.changes = summary.changes;
    const full = this._toSummary(key, entry);
    this._summaryNotifier.announce(key, full);
    this._onDidEmitNotification.fire({
      type: "root/sessionAdded",
      channel: ROOT_STATE_URI,
      summary: full
    });
  }
  /**
   * Announce a legacy Copilot CLI session that the provider discovered on disk
   * (surfaced as adoptable) after startup, so clients add it to their list
   * without a manual reload. Does NOT create persistent state — the session is
   * materialized on demand when the user opens it (restore/adopt). No-ops if
   * the session is already in state or was already announced.
   */
  announceSurfacedSession(summary) {
    const key = summary.resource;
    if (this._sessionStates.has(key)) {
      this._logService.trace(`[AgentHostStateManager] announceSurfacedSession: already in state ${key}`);
      return;
    }
    if (this._summaryNotifier.isAnnounced(key)) {
      this._logService.trace(`[AgentHostStateManager] announceSurfacedSession: already announced ${key}`);
      return;
    }
    this._summaryNotifier.announce(key, summary);
    this._onDidEmitNotification.fire({
      type: "root/sessionAdded",
      channel: ROOT_STATE_URI,
      summary
    });
  }
  /** Removes a surfaced session without affecting a live session. */
  retractSurfacedSession(session) {
    if (this._sessionStates.has(session)) {
      return;
    }
    this._summaryNotifier.remove(session);
    this._onDidEmitNotification.fire({
      type: "root/sessionRemoved",
      channel: ROOT_STATE_URI,
      session
    });
  }
  /**
   * Restores a session from a previous server lifetime into the state manager
   * with pre-populated turns. The session is created in `ready` lifecycle
   * state since it already exists on the backend.
   *
   * Unlike {@link createSession}, this does NOT emit a `sessionAdded`
   * notification because the session is already known to clients via
   * `listSessions`. When the session was previously surfaced with a different
   * summary (e.g. adoptable-legacy), a `sessionSummaryChanged` delta is emitted
   * so clients update the entry in place instead of dropping it.
   */
  restoreSession(summary, turns, options) {
    const key = summary.resource;
    const existing = this._sessionStates.get(key);
    if (existing) {
      this._logService.warn(`[AgentHostStateManager] Session already exists (restore): ${key}`);
      return existing.state;
    }
    const state = {
      ...createSessionState(summary),
      lifecycle: SessionLifecycle.Ready
    };
    this._sessionStates.set(key, this._newEntry(state, summary, 1 /* Used */));
    this._ensureDefaultChat(key, summary, turns, options?.draft, options?.defaultChatTitle);
    if (this._summaryNotifier.isAnnounced(key)) {
      this._summaryNotifier.flush(key);
    } else {
      this._summaryNotifier.announce(key, summary);
    }
    this._logService.trace(`[AgentHostStateManager] Restored session: ${key} (${turns.length} turns)`);
    return state;
  }
  /**
   * Creates the default {@link ChatState} for a session and records it as
   * the session's single chat. VS Code models every session as having
   * exactly one chat — its default chat — whose URI is derived
   * deterministically from the session URI. The chat is seeded with any
   * pre-populated `turns` (used by {@link restoreSession}).
   *
   * The session's `chats` catalog and `defaultChat` pointer are updated
   * in place rather than via dispatched actions: there are no subscribers
   * at creation/restore time, so the snapshot a client later receives on
   * subscribe already reflects the default chat.
   */
  _ensureDefaultChat(sessionKey, summary, turns, draft, defaultChatTitle) {
    const chatUri = buildDefaultChatUri(sessionKey);
    const chatSummary = { ...createDefaultChatSummary(summary, chatUri), title: defaultChatTitle ?? "" };
    this._chatEntries.set(chatUri, {
      session: sessionKey,
      summary: chatSummary,
      state: { ...createChatState(chatSummary), turns: turns ?? [], draft },
      valid: true
    });
    const entry = this._sessionStates.get(sessionKey);
    if (entry) {
      entry.state.chats = [chatSummary];
      entry.state.defaultChat = chatUri;
    }
  }
  /**
   * Adds an additional (non-default) chat to an existing session. Creates
   * the chat's authoritative {@link ChatState}, registers it in the session's
   * catalog via a dispatched {@link ActionType.SessionChatAdded} action (so
   * live subscribers refresh), and returns the new chat's summary.
   *
   * The chat inherits the session's model/agent/working-directory scope. It
   * is a no-op (returning the existing summary) when a chat with the same URI
   * already exists.
   *
   * When `options.providerData` is supplied it is recorded verbatim as the
   * peer chat's opaque, agent-owned restore blob. The StateManager never
   * parses it. The default chat never carries `providerData`.
   *
   * `options.origin` records how the chat came into existence (fork, side
   * chat, tool spawn). Omitting it defaults to {@link ChatOriginKind.User}
   * via {@link createDefaultChatSummary}, so every catalog chat has an origin.
   */
  addChat(session, chatUri, options) {
    const entry = this._sessionStates.get(session);
    if (!entry) {
      this._logService.warn(`[AgentHostStateManager] addChat for unknown session: ${session}`);
      return void 0;
    }
    const sessionState = entry.state;
    const existing = sessionState.chats.find((c) => c.resource === chatUri);
    if (existing) {
      return existing;
    }
    const defaultChatUri = sessionState.defaultChat ?? buildDefaultChatUri(session);
    const defaultEntry = sessionState.chats.find((c) => c.resource === defaultChatUri);
    if (defaultEntry && !defaultEntry.title && sessionState.title) {
      this.updateChatTitle(session, defaultChatUri, sessionState.title);
    }
    const chatSummary = {
      ...createDefaultChatSummary(this._toSummary(session, entry), chatUri),
      title: options?.title ?? "",
      status: SessionStatus.Idle,
      ...options?.origin ? { origin: options.origin } : {},
      interactivity: options?.interactivity
    };
    this._chatEntries.set(chatUri, {
      session,
      summary: chatSummary,
      state: { ...createChatState(chatSummary), turns: options?.turns ?? [] },
      providerData: options?.providerData,
      valid: true
    });
    this.dispatchServerAction(session, { type: ActionType.SessionChatAdded, summary: chatSummary });
    return chatSummary;
  }
  /**
   * Registers a restored peer chat in the parent session's catalog without
   * creating conversation state. The state-manager-owned resolver installs a
   * complete state only through {@link resolveChatState}.
   */
  registerRestoredChatSummary(session, chatUri, options) {
    const entry = this._sessionStates.get(session);
    if (!entry) {
      this._logService.warn(`[AgentHostStateManager] registerRestoredChatSummary for unknown session: ${session}`);
      return void 0;
    }
    const sessionState = entry.state;
    const existing = sessionState.chats.find((c) => c.resource === chatUri);
    if (existing) {
      const existingEntry = this._chatEntries.get(chatUri);
      if (existingEntry && !existingEntry.state && options.resolver) {
        existingEntry.providerData = options.providerData;
        existingEntry.draft = options.draft;
        existingEntry.resolver = options.resolver;
      }
      return existing;
    }
    const chatSummary = {
      ...createDefaultChatSummary(this._toSummary(session, entry), chatUri),
      title: options.title ?? "",
      status: SessionStatus.Idle,
      // A persisted catalog entry with no recorded origin is a plain
      // user-created chat; keep the default rather than restoring it
      // without provenance.
      ...options.origin ? { origin: options.origin } : {},
      interactivity: options.interactivity
    };
    sessionState.chats = [...sessionState.chats, chatSummary];
    this._chatEntries.set(chatUri, {
      session,
      summary: chatSummary,
      providerData: options.providerData,
      draft: options.draft,
      resolver: options.resolver,
      valid: true
    });
    return chatSummary;
  }
  /**
   * Removes an additional chat from a session. Deletes its
   * {@link ChatState}, dispatches {@link ActionType.SessionChatRemoved}, and
   * — if the removed chat was the default — repoints `defaultChat` to the
   * first remaining chat. The default chat itself cannot be removed in
   * isolation; it lives and dies with its session.
   */
  removeChat(session, chatUri) {
    const entry = this._sessionStates.get(session);
    if (!entry || !entry.state.chats.some((c) => c.resource === chatUri)) {
      return;
    }
    const sessionState = entry.state;
    if (chatUri === sessionState.defaultChat || isDefaultChatUri(chatUri)) {
      this._logService.warn(`[AgentHostStateManager] refusing to remove default chat: ${chatUri}`);
      return;
    }
    this._removeChatActiveTurn(session, chatUri);
    this._invalidateChatEntry(chatUri);
    this.dispatchServerAction(session, { type: ActionType.SessionChatRemoved, chat: chatUri });
  }
  /**
   * Invalidates restored chat resolution before a session's asynchronous
   * teardown starts. Session removal subsequently drops the entries entirely.
   */
  invalidateSessionChatResolutions(session) {
    for (const entry of this._chatEntries.values()) {
      if (entry.session === session) {
        entry.valid = false;
      }
    }
  }
  /**
   * Renames a single chat within a session independently of the session
   * title. Updates the chat's authoritative {@link ChatState} title (so
   * later `chatSummaryFromState` projections stay consistent) and dispatches
   * a {@link ActionType.SessionChatUpdated} so the session's catalog entry and
   * live subscribers reflect the new title. Works for the default chat too —
   * giving it a non-empty title that no longer inherits the session title.
   */
  updateChatTitle(session, chatUri, title) {
    const chatState = this._chatEntries.get(chatUri)?.state;
    if (chatState) {
      const entry = this._chatEntries.get(chatUri);
      entry.state = { ...chatState, title };
    }
    this.dispatchServerAction(session, { type: ActionType.SessionChatUpdated, chat: chatUri, changes: { title } });
  }
  /**
   * Removes a session from in-memory state without emitting a
   * {@link NotificationType.SessionRemoved} notification.
   * Use {@link deleteSession} when the session is being permanently deleted
   * and clients need to be notified of its removal.
   *
   * Any pending summary change is flushed synchronously before the session is
   * torn down, so clients receive the final status (e.g. Idle after a turn
   * completes) even when the session is evicted before the scheduler fires.
   * A {@link NotificationType.SessionSummaryChanged} notification may therefore
   * be emitted as a side-effect of this call.
   *
   * Per-session changesets are intentionally NOT torn down here: this method
   * is also used as an idle-eviction (LRU) hook (see
   * `AgentService._maybeEvictIdleSession`) and the session list view keeps a
   * changeset subscription open per visible row to render the diff chip.
   * Tearing down on eviction would clear the chip on the list while the row
   * is still on screen. Permanent-delete paths (`deleteSession`,
   * `removeSubagentSessions`) call `disposeSessionChangesets` explicitly
   * before invoking `removeSession`.
   */
  removeSession(session) {
    const entry = this._sessionStates.get(session);
    if (!entry) {
      return;
    }
    this.invalidateSessionChatResolutions(session);
    if (this._summaryNotifier.isDirty(session)) {
      this._summaryNotifier.flush(session);
    }
    if (this._sessionsWithActiveTurn.delete(session)) {
      this._onDidChangeSessionActiveTurn.fire({ session, active: false });
      this.dispatchServerAction(ROOT_STATE_URI, { type: ActionType.RootActiveSessionsChanged, activeSessions: this._sessionsWithActiveTurn.size });
    }
    for (const chat of entry.state.chats) {
      this._invalidateChatEntry(chat.resource);
    }
    this._invalidateChatEntry(buildDefaultChatUri(session));
    this._sessionStates.delete(session);
    this._summaryNotifier.remove(session);
    this._logService.trace(`[AgentHostStateManager] Removed session: ${session}`);
  }
  /**
   * Permanently deletes a session from state and emits a
   * {@link NotificationType.SessionRemoved} notification so that clients
   * know the session is no longer accessible.
   *
   * Sessions whose creation was deferred via
   * `createSession({ emitNotification: false })` and never persisted via
   * {@link markSessionPersisted} are removed silently — no client knows
   * about them, so a `SessionRemoved` would be noise (or worse, would
   * cause clients to drop a session URI they had eagerly subscribed to).
   */
  deleteSession(session) {
    const wasAnnounced = this._summaryNotifier.isAnnounced(session);
    this._summaryNotifier.clearDirty(session);
    this.disposeSessionChangesets(session);
    this.disposeSessionAnnotations(session);
    this.removeSession(session);
    if (wasAnnounced) {
      this._onDidEmitNotification.fire({
        type: "root/sessionRemoved",
        channel: ROOT_STATE_URI,
        session
      });
    }
  }
  // ---- Session meta -------------------------------------------------------
  /**
   * Replaces `state._meta` on a session by dispatching a
   * {@link ActionType.SessionMetaChanged} action so the change flows
   * through the action envelope (and thus to all live subscribers).
   *
   * The full `_meta` object is replaced (not merged) so callers stay in
   * control of the convention for their own keys; use the `withSessionXxx`
   * helpers in `sessionState.ts` to combine slots.
   */
  setSessionMeta(session, meta) {
    this.dispatchServerAction(session, { type: ActionType.SessionMetaChanged, _meta: meta });
  }
  /**
   * Seeds or replaces a session's resolved {@link SessionConfigState} on the
   * live session state. Unlike mid-session {@link ActionType.SessionConfigChanged}
   * updates (which merge values onto an existing config), this establishes
   * the initial config and is therefore an in-place mutation of the
   * authoritative state object so the value is present in the first snapshot
   * a subscriber receives. Use this from create/restore flows where the
   * config is resolved asynchronously after the session state already exists
   * in the map — reading back through {@link getSessionState} would return a
   * detached composite copy and stranding the mutation there.
   */
  setSessionConfig(session, config) {
    const entry = this._sessionStates.get(session);
    if (!entry) {
      this._logService.warn(`[AgentHostStateManager] setSessionConfig: unknown session ${session}`);
      return;
    }
    entry.state.config = config;
  }
  /**
   * Seeds or replaces the session's effective customizations directly on the
   * authoritative in-memory state. Used by create/restore flows to ensure the
   * first snapshot already contains customizations.
   */
  setSessionCustomizations(session, customizations) {
    const entry = this._sessionStates.get(session);
    if (!entry) {
      this._logService.warn(`[AgentHostStateManager] setSessionCustomizations: unknown session ${session}`);
      return;
    }
    entry.state.customizations = customizations ? [...customizations] : void 0;
  }
  // ---- Changeset registry -------------------------------------------------
  /**
   * Registers a server-side changeset so that subscribers can attach to its
   * URI. The changeset is created with the supplied initial status (default
   * {@link ChangesetStatus.Computing}); subsequent file/operation/status
   * mutations flow through {@link dispatchChangesetAction} on the
   * canonical `<sessionUri>/changeset/<changesetId>` URI.
   *
   * Idempotent: a second call with the same URI is a no-op so producers
   * can safely re-register on session resume without double-creating
   * state.
   *
   * Callers construct `changesetUri` via {@link buildSessionChangesetUri}
   * for the session-wide entry, or {@link buildChangesetUri} for any
   * other catalogue entry.
   *
   * Returns the supplied changeset URI for caller convenience.
   */
  registerChangeset(changesetUri, initialStatus = ChangesetStatus.Computing) {
    this._changesets.register(changesetUri, initialStatus);
    return changesetUri;
  }
  /**
   * Updates the aggregate `changes` for a session.
   *
   * There is no dedicated action for this field: the value is purely
   * informational (chip rendering on the session list), so the write
   * piggybacks on the existing `sessionSummaryChanged` notification
   * path. We update the session entry, mark the session dirty, and let
   * the summary notifier's flush pick the new value up via its
   * `current.changes !== lastNotified.changes` diff.
   */
  setSessionSummaryChanges(session, changes) {
    const entry = this._sessionStates.get(session);
    if (!entry) {
      this._logService.warn(`[AgentHostStateManager] setSessionSummaryChanges: unknown session ${session}`);
      return;
    }
    if (structuralEquals(entry.changes, changes)) {
      return;
    }
    entry.changes = changes;
    this._summaryNotifier.markDirty(session);
  }
  /**
   * Replaces the catalogue entries on `state.changesets` for `session` by
   * dispatching a {@link ActionType.SessionChangesetsChanged} action.
   * Subscribers see the mutation in the standard session action stream —
   * the catalogue lives on session state and is not its own subscribable
   * resource. Aggregate `changes` counts (additions / deletions /
   * files) are propagated separately via {@link setSessionSummaryChanges}.
   *
   * Producers call this after each compute pass to keep the list of
   * available changesets (with their `changeKind`) in sync so observers
   * can render the correct entries without subscribing to each one.
   */
  setSessionChangesets(session, changesets) {
    const entry = this._sessionStates.get(session);
    if (!entry) {
      this._logService.warn(`[AgentHostStateManager] setSessionChangesets: unknown session ${session}`);
      return;
    }
    const state = entry.state;
    if (arrayEquals(state.changesets ?? [], changesets ?? [], structuralEquals)) {
      return;
    }
    const next = changesets ? changesets.slice() : void 0;
    this.dispatchServerAction(session, {
      type: ActionType.SessionChangesetsChanged,
      changesets: next
    });
  }
  /**
   * Tear down a changeset. Dispatches {@link ActionType.ChangesetCleared}
   * so subscribers see an empty file list, then deletes the local state
   * so a fresh `getChangesetState` returns `undefined` and forces the
   * producer to re-create the changeset on next subscribe.
   *
   * Per the spec, the server SHOULD also unsubscribe its clients after
   * dispatching this action; for VS Code-internal clients that happens
   * via the `notify/sessionRemoved` notification, which the workbench-side
   * provider correlates to release any held subscriptions.
   *
   * Safe to call for a URI that was never registered: producers typically
   * iterate over a candidate set on session disposal and emit dispose
   * actions defensively.
   */
  disposeChangeset(changeset) {
    if (!this._changesets.has(changeset)) {
      return;
    }
    this.dispatchServerAction(changeset, {
      type: ActionType.ChangesetCleared
    });
    this._changesets.delete(changeset);
  }
  /**
   * Disposes every changeset whose URI is nested under `session` (i.e.
   * matches `<session>/changeset/...`). Used to cascade cleanup when a
   * session itself is removed.
   */
  disposeSessionChangesets(session) {
    const toDispose = [];
    for (const uri of this._changesets.keys()) {
      const parsed = parseChangesetUri(uri);
      if (parsed && parsed.sessionUri === session) {
        toDispose.push(uri);
      }
    }
    for (const uri of toDispose) {
      this.disposeChangeset(uri);
    }
  }
  /**
   * Drops the annotation state nested under `session` (i.e. the
   * `<session>/annotations` channel). Used to cascade cleanup when a
   * session itself is removed. Subscriptions are released via the
   * forthcoming `sessionRemoved` notification.
   */
  disposeSessionAnnotations(session) {
    this._annotations.delete(buildAnnotationsUri(session));
  }
  // ---- Turn tracking ------------------------------------------------------
  /**
   * Registers a mapping from turnId to session URI so that incoming
   * provider events (which carry only session URI) can be associated
   * with the correct active turn.
   */
  getActiveTurnId(sessionOrChat) {
    const chatUri = isAhpChatChannel(sessionOrChat) ? sessionOrChat : buildDefaultChatUri(sessionOrChat);
    return this._chatEntries.get(chatUri)?.state?.activeTurn?.id;
  }
  // ---- Action dispatch ----------------------------------------------------
  /**
   * Dispatch a server-originated action (from the agent backend).
   * The action is applied to state via the reducer and emitted as an
   * envelope with no origin (server-produced).
   *
   * `channel` identifies the channel the action targets — `ROOT_STATE_URI`
   * for root actions, a session URI for session actions, a terminal URI
   * for terminal actions, an expanded changeset URI for changeset actions.
   */
  dispatchServerAction(channel, action) {
    this._applyAndEmit(channel, action, void 0);
  }
  /**
   * Dispatch a client-originated action (write-ahead from a renderer).
   * The action is applied to state and emitted with the client's origin
   * so the originating client can reconcile.
   */
  dispatchClientAction(channel, action, origin, clientContext) {
    return this._applyAndEmit(channel, action, origin, clientContext);
  }
  /**
   * Reject a client-originated action without applying it to state. Emits an
   * {@link ActionEnvelope} that carries the original {@link ActionOrigin} and a
   * {@link ActionEnvelope.rejectionReason | rejectionReason} so the originating
   * client can reconcile (roll back) its optimistic write-ahead action through
   * the normal path instead of leaving it pending until reconnect. The reducer
   * is deliberately NOT run, so no synchronized state changes.
   */
  rejectClientAction(channel, action, origin, reason) {
    const envelope = {
      channel,
      action,
      serverSeq: ++this._serverSeq,
      origin,
      rejectionReason: reason
    };
    this._logService.trace(`[AgentHostStateManager] Emitting rejection envelope: seq=${envelope.serverSeq}, channel=${envelope.channel}, type=${action.type}, origin=${origin.clientId}:${origin.clientSeq}, reason=${reason}`);
    this._onDidEmitEnvelope.fire(envelope);
  }
  // ---- Internal -----------------------------------------------------------
  _invalidateChatEntry(chat) {
    const entry = this._chatEntries.get(chat);
    if (entry) {
      entry.valid = false;
      this._chatEntries.delete(chat);
    }
  }
  _synchronizeChatEntries(session, summaries) {
    const expected = new Set(summaries.map((summary) => summary.resource));
    for (const summary of summaries) {
      const existing = this._chatEntries.get(summary.resource);
      if (existing) {
        existing.summary = summary;
        if (existing.state) {
          existing.state = { ...existing.state, ...summary };
        }
      } else {
        this._chatEntries.set(summary.resource, {
          session,
          summary,
          valid: true
        });
      }
    }
    for (const [chat, entry] of this._chatEntries) {
      if (entry.session === session && !expected.has(chat)) {
        this._invalidateChatEntry(chat);
      }
    }
  }
  _applyAndEmit(channel, action, origin, clientContext) {
    let resultingState = void 0;
    if (action.type === ActionType.RootConfigChanged && action.replace) {
      action = {
        ...action,
        config: preserveProviderBackedRootConfigValues(this._rootState, action.config)
      };
    }
    if (isRootAction(action)) {
      if (action.type === ActionType.RootConfigChanged && this._rootState.config) {
        const current = this._rootState.config.values;
        const patch = action.config;
        const isNoOp = action.replace ? equals(current, patch) : equals({ ...current, ...patch }, current);
        if (isNoOp) {
          return this._rootState;
        }
      }
      this._rootState = rootReducer(this._rootState, action, this._log);
      resultingState = this._rootState;
    }
    if (isSessionAction(action)) {
      const sessionAction = action;
      const key = channel;
      const entry = this._sessionStates.get(key);
      if (entry) {
        const previousState = entry.state;
        const newState = sessionReducer(previousState, sessionAction, this._log);
        const summaryChanged = !this._summaryFieldsEqual(previousState, newState);
        entry.state = newState;
        this._synchronizeChatEntries(key, newState.chats);
        if (previousState.title !== newState.title) {
          this._onDidChangeSessionTitle.fire({ session: key, title: newState.title });
        }
        if (sessionAction.type === ActionType.SessionConfigChanged) {
          this._onDidChangeSessionConfig.fire({ session: key, previous: previousState.config, current: newState.config, clientContext });
        }
        if (previousState.workingDirectories !== newState.workingDirectories) {
          this._onDidChangeSessionWorkingDirectories.fire({ session: key });
        }
        if (summaryChanged) {
          this._summaryNotifier.markDirty(key);
        }
        resultingState = newState;
      } else if (!isAhpChatChannel(key)) {
        this._logService.warn(`[AgentHostStateManager] Action for unknown session: ${key}, type=${action.type}`);
      }
    }
    if (isChatAction(action)) {
      if (!isAhpChatChannel(channel)) {
        throw new Error(`[AgentHostStateManager] Chat action dispatched to non-chat channel: ${channel}, type=${action.type}`);
      }
      const chatAction = action;
      const sessionKey = parseRequiredSessionUriFromChatUri(channel);
      const chatEntry = this._chatEntries.get(channel);
      const chat = chatEntry?.state;
      if (chat && chatEntry && sessionKey !== void 0) {
        const newChat = chatReducer(chat, chatAction, this._log);
        chatEntry.state = newChat;
        this._onChatStateChanged(sessionKey, channel, chat, newChat);
        resultingState = newChat;
      } else {
        this._logService.warn(`[AgentHostStateManager] Action for unknown chat: ${channel}, type=${action.type}`);
      }
    }
    if (isChangesetAction(action)) {
      const changesetAction = action;
      const key = channel;
      const state = this._changesets.get(key);
      if (!state) {
        this._logService.warn(`[AgentHostStateManager] Action for unknown changeset: ${key}, type=${action.type}`);
        return void 0;
      }
      const newState = changesetReducer(state, changesetAction, this._log);
      if (newState !== state) {
        this._changesets.set(key, newState);
      }
      resultingState = newState;
    }
    if (isAnnotationsAction(action)) {
      const annotationsAction = action;
      const key = channel;
      const state = this._annotations.get(key) ?? { annotations: [] };
      const newState = annotationsReducer(state, annotationsAction, this._log);
      if (newState !== state) {
        this._annotations.set(key, newState);
      }
      resultingState = newState;
    }
    const envelope = {
      channel,
      action,
      serverSeq: ++this._serverSeq,
      origin
    };
    this._logService.trace(`[AgentHostStateManager] Emitting envelope: seq=${envelope.serverSeq}, channel=${envelope.channel}, type=${action.type}${origin ? `, origin=${origin.clientId}:${origin.clientSeq}` : ""}`);
    this._onDidEmitEnvelope.fire(envelope);
    return resultingState;
  }
  /**
   * Removes a single chat from its session's active-turn set, firing the
   * session-level active flip ({@link onDidChangeSessionActiveTurn} +
   * {@link ActionType.RootActiveSessionsChanged}) when this clears the
   * session's last active chat. Safe to call for chats that aren't currently
   * tracked as active — it is a no-op in that case. Used both when a turn
   * ends and when a chat is removed mid-turn, so the session can't be
   * stranded as permanently "active".
   */
  _removeChatActiveTurn(sessionKey, chatUri) {
    const activeChats = this._sessionsWithActiveTurn.get(sessionKey);
    if (!activeChats || !activeChats.delete(chatUri)) {
      return;
    }
    if (activeChats.size === 0) {
      this._sessionsWithActiveTurn.delete(sessionKey);
      this._onDidChangeSessionActiveTurn.fire({ session: sessionKey, active: false });
      this.dispatchServerAction(ROOT_STATE_URI, { type: ActionType.RootActiveSessionsChanged, activeSessions: this._sessionsWithActiveTurn.size });
    }
  }
  /**
   * Bridges a default-chat state transition back onto its owning session.
   *
   * The protocol moved turn lifecycle (and therefore the derived
   * activity status) onto the chat channel. To preserve VS Code's
   * single-chat behaviour we:
   *  - track active-turn transitions (driving `RootActiveSessionsChanged`
   *    and `hasActiveSessions`, which gate `--enable-remote-auto-shutdown`),
   *    keyed by the owning session URI;
   *  - mirror the chat's denormalized `status`/`activity`/`modifiedAt`
   *    onto the session summary so the session list reflects progress;
   *  - forward the chat's own `status` to the session `chats` catalog (via a
   *    {@link ActionType.SessionChatUpdated}) so per-chat tabs reflect that
   *    chat's progress, not just the aggregated session summary; and
   *  - keep the session's `chats` catalog entry in sync.
   */
  _onChatStateChanged(sessionKey, chatUri, prev, next) {
    if (next.turns.length > 0 || next.activeTurn) {
      this._markSessionUsed(sessionKey);
    }
    const hadActive = !!prev.activeTurn;
    const hasActive = !!next.activeTurn;
    if (hadActive !== hasActive) {
      if (hasActive) {
        let activeChats = this._sessionsWithActiveTurn.get(sessionKey);
        const wasSessionActive = !!activeChats?.size;
        if (!activeChats) {
          activeChats = /* @__PURE__ */ new Set();
          this._sessionsWithActiveTurn.set(sessionKey, activeChats);
        }
        activeChats.add(chatUri);
        if (!wasSessionActive) {
          this._onDidChangeSessionActiveTurn.fire({ session: sessionKey, active: true });
          this.dispatchServerAction(ROOT_STATE_URI, { type: ActionType.RootActiveSessionsChanged, activeSessions: this._sessionsWithActiveTurn.size });
        }
      } else {
        this._removeChatActiveTurn(sessionKey, chatUri);
      }
    }
    const entry = this._sessionStates.get(sessionKey);
    if (!entry) {
      return;
    }
    const sessionState = entry.state;
    const nextEntry = chatSummaryFromState(next);
    const prevEntry = sessionState.chats.find((c) => c.resource === chatUri);
    const chats = sessionState.chats.map((c) => c.resource === chatUri ? nextEntry : c);
    if (prevEntry?.status !== nextEntry.status) {
      this.dispatchServerAction(sessionKey, {
        type: ActionType.SessionChatUpdated,
        chat: chatUri,
        changes: { status: nextEntry.status, activity: nextEntry.activity }
      });
    }
    const aggregate = this._aggregateChatSummaries(chats, sessionState.defaultChat);
    const newStatus = aggregate.status !== void 0 ? this._mergeSessionStatus(sessionState.status, aggregate.status) : sessionState.status;
    const statusChanged = newStatus !== sessionState.status;
    const activityChanged = aggregate.activity !== sessionState.activity;
    entry.state = {
      ...sessionState,
      chats,
      ...statusChanged ? { status: newStatus } : void 0,
      ...activityChanged ? { activity: aggregate.activity } : void 0
    };
    const newModifiedAt = aggregate.modifiedAt !== void 0 ? new Date(aggregate.modifiedAt).toISOString() : void 0;
    const modifiedAtChanged = newModifiedAt !== void 0 && newModifiedAt !== entry.modifiedAt;
    if (modifiedAtChanged) {
      entry.modifiedAt = newModifiedAt;
    }
    if (statusChanged || activityChanged || modifiedAtChanged) {
      this._summaryNotifier.markDirty(sessionKey);
    }
  }
  /**
   * Aggregates a session's chat catalog into the derived session-summary
   * fields per the protocol rules: activity bits come from the default chat
   * (else the most recently modified chat) with `InputNeeded`/`Error`/
   * `InProgress` promoted whenever any chat raises them; the `activity` string
   * follows the chat driving the resulting status; `modifiedAt` is the max
   * across chats. Promotion precedence is `InputNeeded` > `Error` >
   * `InProgress`, so a running peer (sub) chat surfaces as `InProgress` on the
   * session even when the default chat is idle.
   */
  _aggregateChatSummaries(chats, defaultChat) {
    if (chats.length === 0) {
      return {};
    }
    const activityMask = ~(SessionStatus.IsRead | SessionStatus.IsArchived);
    const base = (defaultChat !== void 0 ? chats.find((c) => c.resource === defaultChat) : void 0) ?? chats.reduce((a, b) => Date.parse(b.modifiedAt) > Date.parse(a.modifiedAt) ? b : a);
    let status = base.status & activityMask;
    let driver = base;
    const errorChat = chats.find((c) => (c.status & SessionStatus.Error) === SessionStatus.Error);
    const inputChat = chats.find((c) => (c.status & SessionStatus.InputNeeded) === SessionStatus.InputNeeded);
    const inProgressChat = chats.find((c) => (c.status & SessionStatus.InputNeeded) === SessionStatus.InProgress);
    if (inputChat) {
      status = SessionStatus.InputNeeded;
      driver = inputChat;
    } else if (errorChat) {
      status = SessionStatus.Error;
      driver = errorChat;
    } else if (inProgressChat) {
      status = SessionStatus.InProgress;
      driver = inProgressChat;
    }
    const modifiedAt = chats.reduce((max, c) => Math.max(max, Date.parse(c.modifiedAt)), 0);
    return { status, activity: driver.activity, modifiedAt };
  }
  /**
   * Combines the chat's activity status bits with the session summary's
   * own metadata flags (IsRead / IsArchived) which live in the high bits
   * of {@link SessionStatus} and are owned by the session, not the chat.
   */
  _mergeSessionStatus(sessionStatus, chatStatus) {
    const metaFlags = sessionStatus & (SessionStatus.IsRead | SessionStatus.IsArchived);
    const activityBits = chatStatus & ~(SessionStatus.IsRead | SessionStatus.IsArchived);
    return activityBits | metaFlags;
  }
  /**
   * Emit a generic progress notification on the root channel, correlated to
   * the originating request by {@link ProgressParams.progressToken}. Routed to
   * clients through the same {@link onDidEmitNotification} path as session
   * notifications, so both the local (IPC proxy) and remote (WebSocket
   * {@link ProtocolServerHandler}) renderers receive it without any
   * transport-specific special casing. Progress for host-level work (e.g. a
   * shared SDK download) rides the root channel rather than a per-session one.
   */
  emitProgress(progress) {
    this._onDidEmitNotification.fire({
      type: "root/progress",
      channel: ROOT_STATE_URI,
      ...progress
    });
  }
  /**
   * Emit an `auth/required` notification on the root channel, asking the
   * client to obtain a fresh token and push it via `authenticate`. Rides the
   * same {@link onDidEmitNotification} path as {@link emitProgress}, so both
   * local (IPC proxy) and remote (WebSocket) renderers receive it. Used for
   * host-level auth requirements (e.g. an agent whose transport flip makes a
   * credential newly required) rather than a per-session one.
   */
  emitAuthRequired(params) {
    this._onDidEmitNotification.fire({
      type: "auth/required",
      channel: ROOT_STATE_URI,
      ...params
    });
  }
  dispose() {
    for (const entry of this._chatEntries.values()) {
      entry.valid = false;
    }
    this._chatEntries.clear();
    super.dispose();
  }
};
AgentHostStateManager = __decorateClass([
  __decorateParam(0, ILogService)
], AgentHostStateManager);
function resolveChatStateForUri(stateManager, chatUri) {
  const peerState = stateManager.getChatState(chatUri);
  if (peerState) {
    return peerState;
  }
  if (!isAhpChatChannel(chatUri)) {
    return stateManager.getDefaultChatState(chatUri);
  }
  if (isDefaultChatUri(chatUri)) {
    return stateManager.getDefaultChatState(parseRequiredSessionUriFromChatUri(chatUri));
  }
  return void 0;
}
export {
  AgentHostStateManager,
  IAgentHostStateManager,
  resolveChatStateForUri
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxwbGF0Zm9ybVxcYWdlbnRIb3N0XFxub2RlXFxhZ2VudEhvc3RTdGF0ZU1hbmFnZXIudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgeyBSdW5PbmNlU2NoZWR1bGVyIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vYXN5bmMuanMnO1xuaW1wb3J0IHsgRW1pdHRlciwgRXZlbnQgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9ldmVudC5qcyc7XG5pbXBvcnQgeyBEaXNwb3NhYmxlIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IGVxdWFscyB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL29iamVjdHMuanMnO1xuaW1wb3J0IHsgSUxvZ1NlcnZpY2UgfSBmcm9tICcuLi8uLi9sb2cvY29tbW9uL2xvZy5qcyc7XG5pbXBvcnQgeyBjcmVhdGVEZWNvcmF0b3IgfSBmcm9tICcuLi8uLi9pbnN0YW50aWF0aW9uL2NvbW1vbi9pbnN0YW50aWF0aW9uLmpzJztcbmltcG9ydCB7IFRlbGVtZXRyeUxldmVsIH0gZnJvbSAnLi4vLi4vdGVsZW1ldHJ5L2NvbW1vbi90ZWxlbWV0cnkuanMnO1xuaW1wb3J0IHsgQWN0aW9uVHlwZSwgQWN0aW9uRW52ZWxvcGUsIEFjdGlvbk9yaWdpbiwgSU5vdGlmaWNhdGlvbiwgSVJvb3RDb25maWdDaGFuZ2VkQWN0aW9uLCBTZXNzaW9uQWN0aW9uLCBDaGF0QWN0aW9uLCBSb290QWN0aW9uLCBTdGF0ZUFjdGlvbiwgVGVybWluYWxBY3Rpb24sIENoYW5nZXNldEFjdGlvbiwgQ2xpZW50Q2hhbmdlc2V0QWN0aW9uLCBBbm5vdGF0aW9uc0FjdGlvbiwgQ2xpZW50QW5ub3RhdGlvbnNBY3Rpb24sIGlzUm9vdEFjdGlvbiwgaXNTZXNzaW9uQWN0aW9uLCBpc0NoYXRBY3Rpb24sIGlzQ2hhbmdlc2V0QWN0aW9uLCBpc0Fubm90YXRpb25zQWN0aW9uLCB0eXBlIEF1dGhSZXF1aXJlZFBhcmFtcywgdHlwZSBQcm9ncmVzc1BhcmFtcyB9IGZyb20gJy4uL2NvbW1vbi9zdGF0ZS9zZXNzaW9uQWN0aW9ucy5qcyc7XG5pbXBvcnQgdHlwZSB7IElTdGF0ZVNuYXBzaG90IH0gZnJvbSAnLi4vY29tbW9uL3N0YXRlL3Nlc3Npb25Qcm90b2NvbC5qcyc7XG5pbXBvcnQgeyByb290UmVkdWNlciwgc2Vzc2lvblJlZHVjZXIsIGNoYXRSZWR1Y2VyLCBjaGFuZ2VzZXRSZWR1Y2VyLCBhbm5vdGF0aW9uc1JlZHVjZXIgfSBmcm9tICcuLi9jb21tb24vc3RhdGUvc2Vzc2lvblJlZHVjZXJzLmpzJztcbmltcG9ydCB7IGNyZWF0ZVJvb3RTdGF0ZSwgY3JlYXRlU2Vzc2lvblN0YXRlLCBjcmVhdGVDaGF0U3RhdGUsIGNyZWF0ZURlZmF1bHRDaGF0U3VtbWFyeSwgY2hhdFN1bW1hcnlGcm9tU3RhdGUsIGJ1aWxkRGVmYXVsdENoYXRVcmksIHBhcnNlRGVmYXVsdENoYXRVcmksIHBhcnNlUmVxdWlyZWRTZXNzaW9uVXJpRnJvbUNoYXRVcmksIGlzQWhwQ2hhdENoYW5uZWwsIGlzRGVmYXVsdENoYXRVcmksIG1lcmdlU2Vzc2lvbldpdGhEZWZhdWx0Q2hhdCwgaXNBaHBSb290Q2hhbm5lbCwgU2Vzc2lvbkxpZmVjeWNsZSwgd2l0aEhvc3RCdWlsZEluZm8sIHR5cGUgQ2hhbmdlc2V0LCB0eXBlIENoYW5nZXNldFN0YXRlLCB0eXBlIEFubm90YXRpb25zU3RhdGUsIHR5cGUgQ2hhdFN0YXRlLCB0eXBlIENoYXRTdW1tYXJ5LCB0eXBlIEN1c3RvbWl6YXRpb24sIHR5cGUgSVNlc3Npb25XaXRoRGVmYXVsdENoYXQsIHR5cGUgTWVzc2FnZSwgdHlwZSBSb290U3RhdGUsIHR5cGUgU2Vzc2lvbkNvbmZpZ1N0YXRlLCB0eXBlIFNlc3Npb25NZXRhLCB0eXBlIFNlc3Npb25TdGF0ZSwgdHlwZSBTZXNzaW9uU3VtbWFyeSwgdHlwZSBUdXJuLCB0eXBlIFVSSSwgUk9PVF9TVEFURV9VUkksIENoYW5nZXNldFN0YXR1cywgSUhvc3RCdWlsZEluZm8sIFNlc3Npb25TdGF0dXMgfSBmcm9tICcuLi9jb21tb24vc3RhdGUvc2Vzc2lvblN0YXRlLmpzJztcbmltcG9ydCB7IEFnZW50SG9zdFRlbGVtZXRyeUxldmVsQ29uZmlnS2V5LCBJUGVybWlzc2lvbnNWYWx1ZSwgcGxhdGZvcm1Sb290U2NoZW1hLCB0ZWxlbWV0cnlMZXZlbFRvQWdlbnRIb3N0Q29uZmlnVmFsdWUgfSBmcm9tICcuLi9jb21tb24vYWdlbnRIb3N0U2NoZW1hLmpzJztcbmltcG9ydCB7IFNlc3Npb25Db25maWdLZXkgfSBmcm9tICcuLi9jb21tb24vc2Vzc2lvbkNvbmZpZ0tleXMuanMnO1xuaW1wb3J0IHsgcGFyc2VDaGFuZ2VzZXRVcmkgfSBmcm9tICcuLi9jb21tb24vY2hhbmdlc2V0VXJpLmpzJztcbmltcG9ydCB7IGJ1aWxkQW5ub3RhdGlvbnNVcmksIGlzQW5ub3RhdGlvbnNVcmkgfSBmcm9tICcuLi9jb21tb24vYW5ub3RhdGlvbnNVcmkuanMnO1xuaW1wb3J0IHsgQWdlbnRIb3N0Q2hhbmdlc2V0U3RhdGVDYWNoZSwgdHlwZSBJQWdlbnRIb3N0Q2hhbmdlc2V0U3RhdGVSZXRlbnRpb25PcHRpb25zIH0gZnJvbSAnLi9hZ2VudEhvc3RDaGFuZ2VzZXRTdGF0ZUNhY2hlLmpzJztcbmltcG9ydCB7IENoYW5nZXNTdW1tYXJ5LCBDaGF0SW50ZXJhY3Rpdml0eSwgdHlwZSBDaGF0T3JpZ2luIH0gZnJvbSAnLi4vY29tbW9uL3N0YXRlL3Byb3RvY29sL3N0YXRlLmpzJztcbmltcG9ydCB7IGFycmF5RXF1YWxzLCBzdHJ1Y3R1cmFsRXF1YWxzIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vZXF1YWxzLmpzJztcbmltcG9ydCB7IHByZXNlcnZlUHJvdmlkZXJCYWNrZWRSb290Q29uZmlnVmFsdWVzIH0gZnJvbSAnLi4vY29tbW9uL2FnZW50Q3VzdG9taXphdGlvblNldHRpbmdzLmpzJztcbmltcG9ydCB0eXBlIHsgSUFnZW50SG9zdENsaWVudFRlbGVtZXRyeUNvbnRleHQgfSBmcm9tICcuLi9jb21tb24vYWdlbnRIb3N0VGVsZW1ldHJ5LmpzJztcblxuZXhwb3J0IGludGVyZmFjZSBJQWdlbnRIb3N0U3RhdGVNYW5hZ2VyT3B0aW9ucyB7XG5cdHJlYWRvbmx5IGNoYW5nZXNldFN0YXRlUmV0ZW50aW9uPzogSUFnZW50SG9zdENoYW5nZXNldFN0YXRlUmV0ZW50aW9uT3B0aW9ucztcblx0LyoqXG5cdCAqIEJ1aWxkIGluZm9ybWF0aW9uIGFib3V0IHRoZSBwcm9ncmFtIGhvc3RpbmcgdGhlIGFnZW50IGhvc3QuIFdoZW5cblx0ICogcHJvdmlkZWQsIGl0IGlzIHB1Ymxpc2hlZCBvbiB7QGxpbmsgUm9vdFN0YXRlLl9tZXRhfSBzbyBjbGllbnRzIGNhbiBzZWVcblx0ICogd2hpY2ggYnVpbGQgaXMgaG9zdGluZyB0aGVtLlxuXHQgKi9cblx0cmVhZG9ubHkgaG9zdEJ1aWxkSW5mbz86IElIb3N0QnVpbGRJbmZvO1xufVxuXG4vKipcbiAqIFdoZXRoZXIgYSBzZXNzaW9uIGlzIHN0aWxsIGFuIHVudXNlZCBkcmFmdDogbWludGVkIGJ5IHRoaXMgcHJvY2VzcyBhbmQgbmV2ZXJcbiAqIHVzZWQuIE9ubHkgc3VjaCBhIHNlc3Npb24gaXMgc2FmZSB0byBkZXN0cm95IGF1dG9tYXRpY2FsbHkuXG4gKlxuICogRGVsaWJlcmF0ZWx5IG5vdCBkZXJpdmVkIGZyb20gdGhlIGN1cnJlbnQgdHVybiBjb3VudC4gQW4gZW1wdHkgc2Vzc2lvbiBpc1xuICogYWxzbyB3aGF0IGEgZmFpbGVkIGhpc3RvcnkgbG9hZCBwcm9kdWNlcywgYW5kIHdoYXQgYSB0cnVuY2F0ZS10by16ZXJvIGxlYXZlc1xuICogYmVoaW5kIFx1MjAxNCBuZWl0aGVyIG1lYW5zIHRoZSBzZXNzaW9uIGlzIGRpc3Bvc2FibGUuIFRoZSBmbGFnIGxhdGNoZXMgdG8gYGZhbHNlYFxuICogb24gZmlyc3QgdXNlIGFuZCBuZXZlciByZXR1cm5zIHRvIGB0cnVlYC5cbiAqL1xuY29uc3QgZW51bSBTZXNzaW9uVXNlIHtcblx0VW51c2VkRHJhZnQsXG5cdFVzZWQsXG59XG5cbi8qKlxuICogQXV0aG9yaXRhdGl2ZSBwZXItc2Vzc2lvbiByZWNvcmQgaGVsZCBieSB0aGUgc3RhdGUgbWFuYWdlci4gQnVuZGxlcyB0aGUgZmxhdFxuICoge0BsaW5rIFNlc3Npb25TdGF0ZX0gd2l0aCB0aGUge0BsaW5rIFNlc3Npb25TdW1tYXJ5fSBjYXRhbG9nLW9ubHkgZmllbGRzIHRoYXRcbiAqIGRvIG5vdCBsaXZlIG9uIHRoZSBzdGF0ZS4gVGhlIHNlc3Npb24gVVJJIChjYXRhbG9nIGByZXNvdXJjZWApIGlzIHRoZSBtYXBcbiAqIGtleSwgYW5kIHRoZSBjYXRhbG9nIGBfbWV0YWAgaXMgdGhlIHNhbWUgb2JqZWN0IGFzIHtAbGluayBTZXNzaW9uU3RhdGUuX21ldGF9LFxuICogc28gdGhlIG9ubHkgZXh0cmEgZmllbGRzIHRoZSByZWNvcmQgY2FycmllcyBhcmUgdGhlIHRpbWVzdGFtcHMgYW5kIHRoZVxuICogYWdncmVnYXRlIGNoYW5nZSBjb3VudHMuXG4gKi9cbmludGVyZmFjZSBJU2Vzc2lvbkVudHJ5IHtcblx0c3RhdGU6IFNlc3Npb25TdGF0ZTtcblx0LyoqIENyZWF0aW9uIHRpbWVzdGFtcCAoSVNPIDg2MDEpLiBDYXRhbG9nLW9ubHk7IGltbXV0YWJsZSBhZnRlciBjcmVhdGlvbi4gKi9cblx0cmVhZG9ubHkgY3JlYXRlZEF0OiBzdHJpbmc7XG5cdC8qKiBMYXN0IG1vZGlmaWNhdGlvbiB0aW1lc3RhbXAgKElTTyA4NjAxKS4gQ2F0YWxvZy1vbmx5OyBkZXJpdmVkIGZyb20gY2hhdCBhZ2dyZWdhdGlvbi4gKi9cblx0bW9kaWZpZWRBdDogc3RyaW5nO1xuXHQvKiogQWdncmVnYXRlIGZpbGUtY2hhbmdlIGNvdW50cyBmb3IgdGhlIHNlc3Npb24td2lkZSBjaGFuZ2VzZXQuIENhdGFsb2ctb25seS4gKi9cblx0Y2hhbmdlcz86IENoYW5nZXNTdW1tYXJ5O1xuXHQvKiogV2hldGhlciB0aGlzIHNlc3Npb24gaXMgc3RpbGwgYW4gdW51c2VkIGRyYWZ0LiBMYXRjaGVzIHRvIGBVc2VkYC4gKi9cblx0dXNlOiBTZXNzaW9uVXNlO1xufVxuXG5pbnRlcmZhY2UgSVJlc3RvcmVkQ2hhdFN0YXRlIHtcblx0cmVhZG9ubHkgdHVybnM6IFR1cm5bXTtcblx0cmVhZG9ubHkgZHJhZnQ/OiBNZXNzYWdlO1xufVxuXG50eXBlIFJlc3RvcmVkQ2hhdFJlc29sdmVyID0gKHByb3ZpZGVyRGF0YTogc3RyaW5nIHwgdW5kZWZpbmVkKSA9PiBQcm9taXNlPElSZXN0b3JlZENoYXRTdGF0ZT47XG5cbi8qKlxuICogQXV0aG9yaXRhdGl2ZSByZWNvcmQgZm9yIG9uZSBjaGF0IGluIGEgc2Vzc2lvbiBjYXRhbG9nLiBBIHJlc3RvcmVkIHBlZXIgY2hhdFxuICogaGFzIGEgc3VtbWFyeSBiZWZvcmUgaXQgaGFzIGNvbnZlcnNhdGlvbiBzdGF0ZTsgcmVzb2x1dGlvbiBhdG9taWNhbGx5XG4gKiBpbnN0YWxscyB0aGF0IHN0YXRlIG9ubHkgYWZ0ZXIgaXRzIHByb3ZpZGVyIGhpc3RvcnkgaXMgcmVhZHkuXG4gKi9cbmludGVyZmFjZSBJQ2hhdEVudHJ5IHtcblx0cmVhZG9ubHkgc2Vzc2lvbjogc3RyaW5nO1xuXHRzdW1tYXJ5OiBDaGF0U3VtbWFyeTtcblx0c3RhdGU/OiBDaGF0U3RhdGU7XG5cdHByb3ZpZGVyRGF0YT86IHN0cmluZztcblx0ZHJhZnQ/OiBNZXNzYWdlO1xuXHRyZXNvbHZlcj86IFJlc3RvcmVkQ2hhdFJlc29sdmVyO1xuXHRpbkZsaWdodD86IFByb21pc2U8Q2hhdFN0YXRlIHwgdW5kZWZpbmVkPjtcblx0dmFsaWQ6IGJvb2xlYW47XG59XG5cbi8qKlxuICogRW5jYXBzdWxhdGVzIHRoZSByb290LWNoYW5uZWwgc3VtbWFyeS1ub3RpZmljYXRpb24gYm9va2tlZXBpbmcgZm9yIHRoZVxuICoge0BsaW5rIEFnZW50SG9zdFN0YXRlTWFuYWdlcn06IHRoZSBsYXN0IHtAbGluayBTZXNzaW9uU3VtbWFyeX0gYW5ub3VuY2VkIHRvXG4gKiBjbGllbnRzIHBlciBzZXNzaW9uICh0aGUgZGlmZiBiYXNlbGluZSkgYW5kIHRoZSBzZXQgb2Ygc2Vzc2lvbnMgd2hvc2Ugc3VtbWFyeVxuICogY2hhbmdlZCBzaW5jZSB0aGUgbGFzdCBkZWJvdW5jZWQgZmx1c2guIFRoZSBzbmFwc2hvdCBtYXAgYW5kIHRoZSBkaXJ0eSBzZXRcbiAqIGFyZSBhbHdheXMgbXV0YXRlZCBpbiBsb2Nrc3RlcCwgc28ga2VlcGluZyB0aGVtIHRvZ2V0aGVyIFx1MjAxNCByYXRoZXIgdGhhbiBhcyB0d29cbiAqIGxvb3NlIGZpZWxkcyBvbiB0aGUgbWFuYWdlciBcdTIwMTQga2VlcHMgdGhlIGRpZmZpbmcgc3RhdGUgY29oZXNpdmUuXG4gKlxuICogVGhlIGN1cnJlbnQgc3VtbWFyeSBmb3IgYSBzZXNzaW9uIGlzIHNvdXJjZWQgdmlhIHRoZSBpbmplY3RlZCBgZ2V0U3VtbWFyeWBcbiAqIGNhbGxiYWNrOyBkaWZmLWJhc2VkIGByb290L3Nlc3Npb25TdW1tYXJ5Q2hhbmdlZGAgbm90aWZpY2F0aW9ucyBhcmUgZW1pdHRlZFxuICogdGhyb3VnaCBgZW1pdGAuXG4gKi9cbmNsYXNzIFNlc3Npb25TdW1tYXJ5Tm90aWZpZXIgZXh0ZW5kcyBEaXNwb3NhYmxlIHtcblxuXHQvKiogTGFzdCBzdW1tYXJ5IGFubm91bmNlZCB0byBjbGllbnRzICh2aWEgc2Vzc2lvbkFkZGVkIG9yIHNlc3Npb25TdW1tYXJ5Q2hhbmdlZCkuICovXG5cdHByaXZhdGUgcmVhZG9ubHkgX2xhc3ROb3RpZmllZCA9IG5ldyBNYXA8c3RyaW5nLCBTZXNzaW9uU3VtbWFyeT4oKTtcblxuXHQvKiogU2Vzc2lvbnMgd2hvc2Ugc3VtbWFyeSBjaGFuZ2VkIHNpbmNlIHRoZSBsYXN0IGZsdXNoLiAqL1xuXHRwcml2YXRlIHJlYWRvbmx5IF9kaXJ0eSA9IG5ldyBTZXQ8c3RyaW5nPigpO1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX3NjaGVkdWxlciA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBSdW5PbmNlU2NoZWR1bGVyKCgpID0+IHRoaXMuX2ZsdXNoQWxsKCksIDEwMCkpO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX2dldFN1bW1hcnk6IChzZXNzaW9uOiBzdHJpbmcpID0+IFNlc3Npb25TdW1tYXJ5IHwgdW5kZWZpbmVkLFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX2VtaXQ6IChzZXNzaW9uOiBzdHJpbmcsIGNoYW5nZXM6IFBhcnRpYWw8U2Vzc2lvblN1bW1hcnk+KSA9PiB2b2lkLFxuXHQpIHtcblx0XHRzdXBlcigpO1xuXHR9XG5cblx0LyoqIFJlY29yZHMgYHN1bW1hcnlgIGFzIHRoZSBsYXN0IHZhbHVlIGFubm91bmNlZCB0byBjbGllbnRzIGZvciBgc2Vzc2lvbmAuICovXG5cdGFubm91bmNlKHNlc3Npb246IHN0cmluZywgc3VtbWFyeTogU2Vzc2lvblN1bW1hcnkpOiB2b2lkIHtcblx0XHR0aGlzLl9sYXN0Tm90aWZpZWQuc2V0KHNlc3Npb24sIHN1bW1hcnkpO1xuXHR9XG5cblx0LyoqIFdoZXRoZXIgYHNlc3Npb25gIGhhcyBhbHJlYWR5IGJlZW4gYW5ub3VuY2VkIHRvIGNsaWVudHMuICovXG5cdGlzQW5ub3VuY2VkKHNlc3Npb246IHN0cmluZyk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiB0aGlzLl9sYXN0Tm90aWZpZWQuaGFzKHNlc3Npb24pO1xuXHR9XG5cblx0LyoqIFRoZSBsYXN0IHN1bW1hcnkgYW5ub3VuY2VkIHRvIGNsaWVudHMgZm9yIGBzZXNzaW9uYCwgaWYgYW55LiAqL1xuXHRnZXRBbm5vdW5jZWQoc2Vzc2lvbjogc3RyaW5nKTogU2Vzc2lvblN1bW1hcnkgfCB1bmRlZmluZWQge1xuXHRcdHJldHVybiB0aGlzLl9sYXN0Tm90aWZpZWQuZ2V0KHNlc3Npb24pO1xuXHR9XG5cblx0LyoqIE1hcmtzIGBzZXNzaW9uYCBkaXJ0eSBhbmQgc2NoZWR1bGVzIGEgZGVib3VuY2VkIGZsdXNoLiAqL1xuXHRtYXJrRGlydHkoc2Vzc2lvbjogc3RyaW5nKTogdm9pZCB7XG5cdFx0dGhpcy5fZGlydHkuYWRkKHNlc3Npb24pO1xuXHRcdHRoaXMuX3NjaGVkdWxlci5zY2hlZHVsZSgpO1xuXHR9XG5cblx0LyoqIFdoZXRoZXIgYHNlc3Npb25gIGhhcyBhIHBlbmRpbmcgKHVuZmx1c2hlZCkgc3VtbWFyeSBjaGFuZ2UuICovXG5cdGlzRGlydHkoc2Vzc2lvbjogc3RyaW5nKTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuIHRoaXMuX2RpcnR5LmhhcyhzZXNzaW9uKTtcblx0fVxuXG5cdC8qKiBEcm9wcyB0aGUgcGVuZGluZyBkaXJ0eSBmbGFnIGZvciBgc2Vzc2lvbmAgd2l0aG91dCBmbHVzaGluZyBpdC4gKi9cblx0Y2xlYXJEaXJ0eShzZXNzaW9uOiBzdHJpbmcpOiB2b2lkIHtcblx0XHR0aGlzLl9kaXJ0eS5kZWxldGUoc2Vzc2lvbik7XG5cdH1cblxuXHQvKiogRHJvcHMgYWxsIG5vdGlmaWNhdGlvbiBib29ra2VlcGluZyBmb3IgYHNlc3Npb25gLiAqL1xuXHRyZW1vdmUoc2Vzc2lvbjogc3RyaW5nKTogdm9pZCB7XG5cdFx0dGhpcy5fbGFzdE5vdGlmaWVkLmRlbGV0ZShzZXNzaW9uKTtcblx0XHR0aGlzLl9kaXJ0eS5kZWxldGUoc2Vzc2lvbik7XG5cdH1cblxuXHRwcml2YXRlIF9mbHVzaEFsbCgpOiB2b2lkIHtcblx0XHRmb3IgKGNvbnN0IHNlc3Npb24gb2YgdGhpcy5fZGlydHkpIHtcblx0XHRcdHRoaXMuZmx1c2goc2Vzc2lvbik7XG5cdFx0fVxuXHRcdHRoaXMuX2RpcnR5LmNsZWFyKCk7XG5cdH1cblxuXHQvKipcblx0ICogRW1pdHMgYSBgcm9vdC9zZXNzaW9uU3VtbWFyeUNoYW5nZWRgIG5vdGlmaWNhdGlvbiBmb3IgYHNlc3Npb25gIGlmIGl0c1xuXHQgKiBjdXJyZW50IHN1bW1hcnkgZGlmZmVycyBmcm9tIHRoZSBsYXN0IGFubm91bmNlZCBvbmUsIHRoZW4gYWR2YW5jZXMgdGhlXG5cdCAqIHNuYXBzaG90LiBEb2VzIE5PVCBjbGVhciB0aGUgZGlydHkgZmxhZyBcdTIwMTQgY2FsbGVycyBvd24gdGhhdCBib29ra2VlcGluZy5cblx0ICovXG5cdGZsdXNoKHNlc3Npb246IHN0cmluZyk6IHZvaWQge1xuXHRcdGNvbnN0IGN1cnJlbnQgPSB0aGlzLl9nZXRTdW1tYXJ5KHNlc3Npb24pO1xuXHRcdGNvbnN0IGxhc3ROb3RpZmllZCA9IHRoaXMuX2xhc3ROb3RpZmllZC5nZXQoc2Vzc2lvbik7XG5cdFx0aWYgKCFjdXJyZW50IHx8ICFsYXN0Tm90aWZpZWQpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCBjaGFuZ2VzOiBQYXJ0aWFsPFNlc3Npb25TdW1tYXJ5PiA9IHt9O1xuXHRcdGlmIChjdXJyZW50LnRpdGxlICE9PSBsYXN0Tm90aWZpZWQudGl0bGUpIHsgY2hhbmdlcy50aXRsZSA9IGN1cnJlbnQudGl0bGU7IH1cblx0XHRpZiAoY3VycmVudC5zdGF0dXMgIT09IGxhc3ROb3RpZmllZC5zdGF0dXMpIHsgY2hhbmdlcy5zdGF0dXMgPSBjdXJyZW50LnN0YXR1czsgfVxuXHRcdGlmIChjdXJyZW50LmFjdGl2aXR5ICE9PSBsYXN0Tm90aWZpZWQuYWN0aXZpdHkpIHsgY2hhbmdlcy5hY3Rpdml0eSA9IGN1cnJlbnQuYWN0aXZpdHk7IH1cblx0XHRpZiAoY3VycmVudC5tb2RpZmllZEF0ICE9PSBsYXN0Tm90aWZpZWQubW9kaWZpZWRBdCkgeyBjaGFuZ2VzLm1vZGlmaWVkQXQgPSBjdXJyZW50Lm1vZGlmaWVkQXQ7IH1cblx0XHRpZiAoY3VycmVudC5wcm9qZWN0ICE9PSBsYXN0Tm90aWZpZWQucHJvamVjdCkgeyBjaGFuZ2VzLnByb2plY3QgPSBjdXJyZW50LnByb2plY3Q7IH1cblx0XHRpZiAoY3VycmVudC5jaGFuZ2VzICE9PSBsYXN0Tm90aWZpZWQuY2hhbmdlcykgeyBjaGFuZ2VzLmNoYW5nZXMgPSBjdXJyZW50LmNoYW5nZXM7IH1cblx0XHRpZiAoY3VycmVudC53b3JraW5nRGlyZWN0b3JpZXMgIT09IGxhc3ROb3RpZmllZC53b3JraW5nRGlyZWN0b3JpZXMpIHsgY2hhbmdlcy53b3JraW5nRGlyZWN0b3JpZXMgPSBjdXJyZW50LndvcmtpbmdEaXJlY3RvcmllczsgfVxuXHRcdGlmIChjdXJyZW50Ll9tZXRhICE9PSBsYXN0Tm90aWZpZWQuX21ldGEpIHsgY2hhbmdlcy5fbWV0YSA9IGN1cnJlbnQuX21ldGE7IH1cblxuXHRcdHRoaXMuX2xhc3ROb3RpZmllZC5zZXQoc2Vzc2lvbiwgY3VycmVudCk7XG5cblx0XHRpZiAoT2JqZWN0LmtleXMoY2hhbmdlcykubGVuZ3RoID4gMCkge1xuXHRcdFx0dGhpcy5fZW1pdChzZXNzaW9uLCBjaGFuZ2VzKTtcblx0XHR9XG5cdH1cbn1cblxuLyoqXG4gKiBTZXJ2ZXItc2lkZSBzdGF0ZSBtYW5hZ2VyIGZvciB0aGUgc2Vzc2lvbnMgcHJvY2VzcyBwcm90b2NvbC5cbiAqXG4gKiBNYWludGFpbnMgdGhlIGF1dGhvcml0YXRpdmUgc3RhdGUgdHJlZSAocm9vdCArIHBlci1zZXNzaW9uKSwgYXBwbGllcyBhY3Rpb25zXG4gKiB0aHJvdWdoIHB1cmUgcmVkdWNlcnMsIGFzc2lnbnMgbW9ub3RvbmljIHNlcXVlbmNlIG51bWJlcnMsIGFuZCBlbWl0c1xuICoge0BsaW5rIEFjdGlvbkVudmVsb3BlfXMgZm9yIHN1YnNjcmliZWQgY2xpZW50cy5cbiAqL1xuZXhwb3J0IGNvbnN0IElBZ2VudEhvc3RTdGF0ZU1hbmFnZXIgPSBjcmVhdGVEZWNvcmF0b3I8QWdlbnRIb3N0U3RhdGVNYW5hZ2VyPignYWdlbnRIb3N0U3RhdGVNYW5hZ2VyJyk7XG5cbmV4cG9ydCBjbGFzcyBBZ2VudEhvc3RTdGF0ZU1hbmFnZXIgZXh0ZW5kcyBEaXNwb3NhYmxlIHtcblx0ZGVjbGFyZSByZWFkb25seSBfc2VydmljZUJyYW5kOiB1bmRlZmluZWQ7XG5cblx0cHJpdmF0ZSBfc2VydmVyU2VxID0gMDtcblxuXHRwcml2YXRlIF9yb290U3RhdGU6IFJvb3RTdGF0ZTtcblxuXHQvKipcblx0ICogQXV0aG9yaXRhdGl2ZSBwZXItc2Vzc2lvbiBzdGF0ZSwga2V5ZWQgYnkgc2Vzc2lvbiBVUkkgc3RyaW5nLiBFYWNoIGVudHJ5XG5cdCAqIGJ1bmRsZXMgdGhlIGZsYXQge0BsaW5rIFNlc3Npb25TdGF0ZX0gd2l0aCB0aGUgY2F0YWxvZy1vbmx5IGZpZWxkcyB0aGF0XG5cdCAqIGFyZSBub3QgcGFydCBvZiB0aGUgc3RhdGUgKGBjcmVhdGVkQXRgLCBgbW9kaWZpZWRBdGAsIGBjaGFuZ2VzYCkuIFRoZVxuXHQgKiByb290LWNoYW5uZWwge0BsaW5rIFNlc3Npb25TdW1tYXJ5fSBjYXRhbG9nIHZpZXcgaXMgZGVyaXZlZCBvbiBkZW1hbmQgZnJvbVxuXHQgKiBhbiBlbnRyeSB2aWEge0BsaW5rIGdldFNlc3Npb25TdW1tYXJ5fSAoaXRzIGBfbWV0YWAgaXMgdGhlIHNhbWUgb2JqZWN0IGFzXG5cdCAqIHtAbGluayBTZXNzaW9uU3RhdGUuX21ldGF9KTsgdGhlIGhvc3Qgc3RyZWFtcyBjYXRhbG9nIGRlbHRhcyB2aWFcblx0ICogYHJvb3Qvc2Vzc2lvblN1bW1hcnlDaGFuZ2VkYC5cblx0ICovXG5cdHByaXZhdGUgcmVhZG9ubHkgX3Nlc3Npb25TdGF0ZXMgPSBuZXcgTWFwPHN0cmluZywgSVNlc3Npb25FbnRyeT4oKTtcblxuXHQvKipcblx0ICogQXV0aG9yaXRhdGl2ZSBjaGF0IGNhdGFsb2csIGtleWVkIGJ5IGNoYXQgY2hhbm5lbCBVUkkuIEV2ZXJ5IGNhdGFsb2dcblx0ICogc3VtbWFyeSBoYXMgYW4gZW50cnksIHdoaWxlIG9ubHkgcmVzb2x2ZWQgY2hhdHMgaGF2ZSBhIHtAbGluayBDaGF0U3RhdGV9LlxuXHQgKi9cblx0cHJpdmF0ZSByZWFkb25seSBfY2hhdEVudHJpZXMgPSBuZXcgTWFwPHN0cmluZywgSUNoYXRFbnRyeT4oKTtcblxuXHQvKiogRXhwYW5kZWQgY2hhbmdlc2V0IHN0YXRlcywgc2VwYXJhdGVkIGZyb20gcHJvdG9jb2wgc2VxdWVuY2luZyBzbyBjYWNoZSBwb2xpY3kgc3RheXMgbG9jYWwuICovXG5cdHByaXZhdGUgcmVhZG9ubHkgX2NoYW5nZXNldHM6IEFnZW50SG9zdENoYW5nZXNldFN0YXRlQ2FjaGU7XG5cblx0LyoqXG5cdCAqIFBlci1jaGFubmVsIGFubm90YXRpb24gc3RhdGVzIGZvciB0aGUgYDxzZXNzaW9uPi9hbm5vdGF0aW9uc2AgY2hhbm5lbC5cblx0ICogVW5saWtlIGNoYW5nZXNldHMgKHNlcnZlci1vd25lZCksIGFubm90YXRpb24gYWN0aW9ucyBhcmVcblx0ICogY2xpZW50LWRpc3BhdGNoYWJsZSBhbmQgbGF6aWx5IGNyZWF0ZSB0aGVpciBzdGF0ZSBvbiBmaXJzdCB3cml0ZS5cblx0ICovXG5cdHByaXZhdGUgcmVhZG9ubHkgX2Fubm90YXRpb25zID0gbmV3IE1hcDxzdHJpbmcsIEFubm90YXRpb25zU3RhdGU+KCk7XG5cblx0LyoqXG5cdCAqIEFjdGl2ZSB0dXJucyBwZXIgc2Vzc2lvbiwga2V5ZWQgYnkgc2Vzc2lvbiBVUkkgc3RyaW5nIHdpdGggdGhlIHZhbHVlXG5cdCAqIGJlaW5nIHRoZSBzZXQgb2YgdGhhdCBzZXNzaW9uJ3MgY2hhdCBjaGFubmVsIFVSSXMgdGhhdCBjdXJyZW50bHkgaGF2ZSBhblxuXHQgKiBhY3RpdmUgdHVybi4gQSBzZXNzaW9uIGlzIFwiYWN0aXZlXCIgd2hpbGUgYXQgbGVhc3Qgb25lIG9mIGl0cyBjaGF0cyBpc1xuXHQgKiBzdHJlYW1pbmcgXHUyMDE0IHRoaXMgc3RheXMgY29ycmVjdCBmb3IgbXVsdGktY2hhdCBzZXNzaW9ucyB3aG9zZSBjaGF0cyBjYW4gcnVuXG5cdCAqIGNvbmN1cnJlbnQgdHVybnMgKGUuZy4gYWdlbnQtdGVhbSAvIHN1Yi1hZ2VudCB3b3JrZXJzKSwgd2hlcmUgdGhlIHByZXZpb3VzXG5cdCAqIHNpbmdsZS1mbGFnLXBlci1zZXNzaW9uIG1vZGVsIHdvdWxkIGNsZWFyIHRvbyBlYXJseS4gQWN0aXZlIHN0YXRlIGlzXG5cdCAqIGRlcml2ZWQgZnJvbSBgc3RhdGUuYWN0aXZlVHVybmAgKHRoZSBzb3VyY2Ugb2YgdHJ1dGggbWFpbnRhaW5lZCBieSB0aGVcblx0ICogc2Vzc2lvbiByZWR1Y2VyKSBcdTIwMTQgbmV2ZXIgZnJvbSByYXcgYWN0aW9uIHR1cm4taWRzIFx1MjAxNCBzbyB0aGF0IG1pc21hdGNoZWQgb3Jcblx0ICogb3V0LW9mLW9yZGVyIHR1cm4gbGlmZWN5Y2xlIGFjdGlvbnMgY2FuJ3QgZGVzeW5jIGl0IGZyb20gcmVhbGl0eS4gVGhlXG5cdCAqIHNlc3Npb24gY291bnQgKGBzaXplYCkgZHJpdmVzIGBSb290QWN0aXZlU2Vzc2lvbnNDaGFuZ2VkYCBhbmRcblx0ICogYGhhc0FjdGl2ZVNlc3Npb25zYCwgd2hpY2ggdG9nZXRoZXIgZ2F0ZSBgLS1lbmFibGUtcmVtb3RlLWF1dG8tc2h1dGRvd25gLlxuXHQgKi9cblx0cHJpdmF0ZSByZWFkb25seSBfc2Vzc2lvbnNXaXRoQWN0aXZlVHVybiA9IG5ldyBNYXA8c3RyaW5nLCBTZXQ8c3RyaW5nPj4oKTtcblxuXHQvKipcblx0ICogUm9vdC1jaGFubmVsIHN1bW1hcnkgbm90aWZpY2F0aW9uIGJvb2trZWVwaW5nOiB0aGUgZGlmZiBiYXNlbGluZSAobGFzdFxuXHQgKiBhbm5vdW5jZWQgc3VtbWFyeSBwZXIgc2Vzc2lvbikgYW5kIHRoZSBkaXJ0eSBzZXQsIGRlYm91bmNlZCBpbnRvXG5cdCAqIGByb290L3Nlc3Npb25TdW1tYXJ5Q2hhbmdlZGAgbm90aWZpY2F0aW9ucy4gQXNzaWduZWQgaW4gdGhlIGNvbnN0cnVjdG9yXG5cdCAqIHNpbmNlIGl0IGNsb3NlcyBvdmVyIHtAbGluayBfdG9TdW1tYXJ5fSBhbmQge0BsaW5rIF9vbkRpZEVtaXROb3RpZmljYXRpb259LlxuXHQgKi9cblx0cHJpdmF0ZSByZWFkb25seSBfc3VtbWFyeU5vdGlmaWVyOiBTZXNzaW9uU3VtbWFyeU5vdGlmaWVyO1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX29uRGlkRW1pdEVudmVsb3BlID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8QWN0aW9uRW52ZWxvcGU+KCkpO1xuXHRyZWFkb25seSBvbkRpZEVtaXRFbnZlbG9wZTogRXZlbnQ8QWN0aW9uRW52ZWxvcGU+ID0gdGhpcy5fb25EaWRFbWl0RW52ZWxvcGUuZXZlbnQ7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfb25EaWRFbWl0Tm90aWZpY2F0aW9uID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8SU5vdGlmaWNhdGlvbj4oKSk7XG5cdHJlYWRvbmx5IG9uRGlkRW1pdE5vdGlmaWNhdGlvbjogRXZlbnQ8SU5vdGlmaWNhdGlvbj4gPSB0aGlzLl9vbkRpZEVtaXROb3RpZmljYXRpb24uZXZlbnQ7XG5cdHByaXZhdGUgcmVhZG9ubHkgX29uRGlkQ2hhbmdlU2Vzc2lvbkFjdGl2ZVR1cm4gPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjx7IHNlc3Npb246IHN0cmluZzsgYWN0aXZlOiBib29sZWFuIH0+KCkpO1xuXHRyZWFkb25seSBvbkRpZENoYW5nZVNlc3Npb25BY3RpdmVUdXJuOiBFdmVudDx7IHNlc3Npb246IHN0cmluZzsgYWN0aXZlOiBib29sZWFuIH0+ID0gdGhpcy5fb25EaWRDaGFuZ2VTZXNzaW9uQWN0aXZlVHVybi5ldmVudDtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkRpZENoYW5nZVNlc3Npb25UaXRsZSA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPHsgc2Vzc2lvbjogc3RyaW5nOyB0aXRsZTogc3RyaW5nIH0+KCkpO1xuXHRyZWFkb25seSBvbkRpZENoYW5nZVNlc3Npb25UaXRsZTogRXZlbnQ8eyBzZXNzaW9uOiBzdHJpbmc7IHRpdGxlOiBzdHJpbmcgfT4gPSB0aGlzLl9vbkRpZENoYW5nZVNlc3Npb25UaXRsZS5ldmVudDtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkRpZENoYW5nZVNlc3Npb25Db25maWcgPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjx7IHNlc3Npb246IFVSSTsgcHJldmlvdXM6IFNlc3Npb25Db25maWdTdGF0ZSB8IHVuZGVmaW5lZDsgY3VycmVudDogU2Vzc2lvbkNvbmZpZ1N0YXRlIHwgdW5kZWZpbmVkOyBjbGllbnRDb250ZXh0PzogSUFnZW50SG9zdENsaWVudFRlbGVtZXRyeUNvbnRleHQgfT4oKSk7XG5cdHJlYWRvbmx5IG9uRGlkQ2hhbmdlU2Vzc2lvbkNvbmZpZzogRXZlbnQ8eyBzZXNzaW9uOiBVUkk7IHByZXZpb3VzOiBTZXNzaW9uQ29uZmlnU3RhdGUgfCB1bmRlZmluZWQ7IGN1cnJlbnQ6IFNlc3Npb25Db25maWdTdGF0ZSB8IHVuZGVmaW5lZDsgY2xpZW50Q29udGV4dD86IElBZ2VudEhvc3RDbGllbnRUZWxlbWV0cnlDb250ZXh0IH0+ID0gdGhpcy5fb25EaWRDaGFuZ2VTZXNzaW9uQ29uZmlnLmV2ZW50O1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX29uRGlkQ2hhbmdlU2Vzc2lvbldvcmtpbmdEaXJlY3RvcmllcyA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPHsgc2Vzc2lvbjogc3RyaW5nIH0+KCkpO1xuXHRyZWFkb25seSBvbkRpZENoYW5nZVNlc3Npb25Xb3JraW5nRGlyZWN0b3JpZXM6IEV2ZW50PHsgc2Vzc2lvbjogc3RyaW5nIH0+ID0gdGhpcy5fb25EaWRDaGFuZ2VTZXNzaW9uV29ya2luZ0RpcmVjdG9yaWVzLmV2ZW50O1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdEBJTG9nU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9sb2dTZXJ2aWNlOiBJTG9nU2VydmljZSxcblx0XHRvcHRpb25zOiBJQWdlbnRIb3N0U3RhdGVNYW5hZ2VyT3B0aW9ucyA9IHt9LFxuXHQpIHtcblx0XHRzdXBlcigpO1xuXHRcdHRoaXMuX2NoYW5nZXNldHMgPSBuZXcgQWdlbnRIb3N0Q2hhbmdlc2V0U3RhdGVDYWNoZShvcHRpb25zLmNoYW5nZXNldFN0YXRlUmV0ZW50aW9uKTtcblx0XHR0aGlzLl9yb290U3RhdGUgPSBjcmVhdGVSb290U3RhdGUoKTtcblx0XHQvLyBTZWVkIHRoZSBob3N0LWxldmVsIGNvbmZpZ3VyYXRpb24gc2NoZW1hICsgZGVmYXVsdCB2YWx1ZXMgc28gdGhhdFxuXHRcdC8vIFJvb3RDb25maWdDaGFuZ2VkIGFjdGlvbnMgY2FuIG1lcmdlIGludG8gaXQsIGFuZCBjbGllbnRzIHNlZSB0aGVcblx0XHQvLyBzY2hlbWEgaW1tZWRpYXRlbHkgdXBvbiBzdWJzY3JpYmluZyB0byBgYWdlbnRob3N0Oi9yb290YC4gU2VlXG5cdFx0Ly8gYHBsYXRmb3JtUm9vdFNjaGVtYWAgZm9yIHRoZSBzZXQgb2YgcGxhdGZvcm0tb3duZWQgcHJvcGVydGllcy5cblx0XHR0aGlzLl9yb290U3RhdGUgPSB7XG5cdFx0XHQuLi50aGlzLl9yb290U3RhdGUsXG5cdFx0XHRjb25maWc6IHtcblx0XHRcdFx0c2NoZW1hOiBwbGF0Zm9ybVJvb3RTY2hlbWEudG9Qcm90b2NvbCgpLFxuXHRcdFx0XHR2YWx1ZXM6IHBsYXRmb3JtUm9vdFNjaGVtYS52YWxpZGF0ZU9yRGVmYXVsdCh7fSwge1xuXHRcdFx0XHRcdFtTZXNzaW9uQ29uZmlnS2V5LlBlcm1pc3Npb25zXTogeyBhbGxvdzogW10sIGRlbnk6IFtdIH0gc2F0aXNmaWVzIElQZXJtaXNzaW9uc1ZhbHVlLFxuXHRcdFx0XHRcdFtBZ2VudEhvc3RUZWxlbWV0cnlMZXZlbENvbmZpZ0tleV06IHRlbGVtZXRyeUxldmVsVG9BZ2VudEhvc3RDb25maWdWYWx1ZShUZWxlbWV0cnlMZXZlbC5VU0FHRSksXG5cdFx0XHRcdH0pLFxuXHRcdFx0fSxcblx0XHRcdF9tZXRhOiB3aXRoSG9zdEJ1aWxkSW5mbyh0aGlzLl9yb290U3RhdGUuX21ldGEsIG9wdGlvbnMuaG9zdEJ1aWxkSW5mbyksXG5cdFx0fTtcblx0XHR0aGlzLl9zdW1tYXJ5Tm90aWZpZXIgPSB0aGlzLl9yZWdpc3RlcihuZXcgU2Vzc2lvblN1bW1hcnlOb3RpZmllcihcblx0XHRcdHNlc3Npb24gPT4ge1xuXHRcdFx0XHRjb25zdCBlbnRyeSA9IHRoaXMuX3Nlc3Npb25TdGF0ZXMuZ2V0KHNlc3Npb24pO1xuXHRcdFx0XHRyZXR1cm4gZW50cnkgPyB0aGlzLl90b1N1bW1hcnkoc2Vzc2lvbiwgZW50cnkpIDogdW5kZWZpbmVkO1xuXHRcdFx0fSxcblx0XHRcdChzZXNzaW9uLCBjaGFuZ2VzKSA9PiB0aGlzLl9vbkRpZEVtaXROb3RpZmljYXRpb24uZmlyZSh7XG5cdFx0XHRcdHR5cGU6ICdyb290L3Nlc3Npb25TdW1tYXJ5Q2hhbmdlZCcsXG5cdFx0XHRcdGNoYW5uZWw6IFJPT1RfU1RBVEVfVVJJLFxuXHRcdFx0XHRzZXNzaW9uLFxuXHRcdFx0XHRjaGFuZ2VzLFxuXHRcdFx0fSksXG5cdFx0KSk7XG5cdH1cblx0cHJpdmF0ZSByZWFkb25seSBfbG9nID0gKG1zZzogc3RyaW5nKSA9PiB0aGlzLl9sb2dTZXJ2aWNlLndhcm4oYFtBZ2VudEhvc3RTdGF0ZU1hbmFnZXJdICR7bXNnfWApO1xuXG5cdGdldCBoYXNBY3RpdmVTZXNzaW9ucygpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gdGhpcy5fc2Vzc2lvbnNXaXRoQWN0aXZlVHVybi5zaXplID4gMDtcblx0fVxuXG5cdC8qKlxuXHQgKiBXaGV0aGVyIHRoZSBnaXZlbiBzZXNzaW9uIGN1cnJlbnRseSBoYXMgYW4gYWN0aXZlIHR1cm4gXHUyMDE0IGkuZS4gYSByZXF1ZXN0IGlzXG5cdCAqIGluIHByb2dyZXNzIG9uIGFueSBvZiBpdHMgY2hhdHMuIFN0YXlzIGB0cnVlYCB3aGlsZSBhdCBsZWFzdCBvbmUgY2hhdCBpc1xuXHQgKiBzdHJlYW1pbmcsIHNvIGl0IHJlbWFpbnMgY29ycmVjdCBmb3IgbXVsdGktY2hhdCBzZXNzaW9ucyBydW5uaW5nXG5cdCAqIGNvbmN1cnJlbnQgdHVybnMuXG5cdCAqL1xuXHRoYXNBY3RpdmVUdXJuKHNlc3Npb25LZXk6IHN0cmluZyk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiB0aGlzLl9zZXNzaW9uc1dpdGhBY3RpdmVUdXJuLmhhcyhzZXNzaW9uS2V5KTtcblx0fVxuXG5cdC8vIC0tLS0gU3RhdGUgYWNjZXNzb3JzIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cblxuXHRnZXQgcm9vdFN0YXRlKCk6IFJvb3RTdGF0ZSB7XG5cdFx0cmV0dXJuIHRoaXMuX3Jvb3RTdGF0ZTtcblx0fVxuXG5cdGdldFNlc3Npb25TdGF0ZShzZXNzaW9uT3JDaGF0OiBVUkkpOiBJU2Vzc2lvbldpdGhEZWZhdWx0Q2hhdCB8IHVuZGVmaW5lZCB7XG5cdFx0Ly8gQWNjZXB0IGVpdGhlciBhIHNlc3Npb24gVVJJIG9yIG9uZSBvZiBpdHMgY2hhdCBjaGFubmVsIFVSSXMuIFdoZW4gYVxuXHRcdC8vIGNoYXQgVVJJIGlzIGdpdmVuIHRoZSBjb252ZXJzYXRpb24gY29udGVudHMgYXJlIHRha2VuIGZyb20gdGhhdCBjaGF0LFxuXHRcdC8vIHdoaWxlIHRoZSBzZXNzaW9uIHN1bW1hcnkvY29uZmlnIGNvbWUgZnJvbSB0aGUgb3duaW5nIHNlc3Npb24uXG5cdFx0Y29uc3QgaXNDaGF0ID0gaXNBaHBDaGF0Q2hhbm5lbChzZXNzaW9uT3JDaGF0KTtcblx0XHRjb25zdCBzZXNzaW9uID0gdGhpcy5fcmVzb2x2ZU93bmluZ1Nlc3Npb24oc2Vzc2lvbk9yQ2hhdCk7XG5cdFx0aWYgKHNlc3Npb24gPT09IHVuZGVmaW5lZCkge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cdFx0Y29uc3QgZW50cnkgPSB0aGlzLl9zZXNzaW9uU3RhdGVzLmdldChzZXNzaW9uKTtcblx0XHRpZiAoIWVudHJ5KSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblx0XHRjb25zdCBjaGF0VXJpID0gaXNDaGF0ID8gc2Vzc2lvbk9yQ2hhdCA6IGJ1aWxkRGVmYXVsdENoYXRVcmkoc2Vzc2lvbik7XG5cdFx0cmV0dXJuIG1lcmdlU2Vzc2lvbldpdGhEZWZhdWx0Q2hhdChlbnRyeS5zdGF0ZSwgdGhpcy5fY2hhdEVudHJpZXMuZ2V0KGNoYXRVcmkpPy5zdGF0ZSk7XG5cdH1cblxuXHQvKipcblx0ICogV2hldGhlciBhIHNlc3Npb24gaXMgc3RpbGwgYW4gdW51c2VkIGRyYWZ0IG1pbnRlZCBieSB0aGlzIHByb2Nlc3MsIG9yXG5cdCAqIGB1bmRlZmluZWRgIHdoZW4gdGhlIHNlc3Npb24gaXMgbm90IGN1cnJlbnRseSBpbiBzdGF0ZS4gQWNjZXB0cyBlaXRoZXIgYVxuXHQgKiBzZXNzaW9uIFVSSSBvciBvbmUgb2YgaXRzIGNoYXQgY2hhbm5lbCBVUklzLlxuXHQgKlxuXHQgKiBDYWxsZXJzIGFib3V0IHRvIGRlc3Ryb3kgZHVyYWJsZSBkYXRhIG11c3QgdXNlIHRoaXMgcmF0aGVyIHRoYW4gY2hlY2tpbmdcblx0ICogd2hldGhlciB0aGUgc2Vzc2lvbiBjdXJyZW50bHkgbG9va3MgZW1wdHkuXG5cdCAqL1xuXHRpc1VudXNlZERyYWZ0KHNlc3Npb25PckNoYXQ6IFVSSSk6IGJvb2xlYW4gfCB1bmRlZmluZWQge1xuXHRcdGNvbnN0IHNlc3Npb24gPSB0aGlzLl9yZXNvbHZlT3duaW5nU2Vzc2lvbihzZXNzaW9uT3JDaGF0KTtcblx0XHRpZiAoc2Vzc2lvbiA9PT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblx0XHRjb25zdCBlbnRyeSA9IHRoaXMuX3Nlc3Npb25TdGF0ZXMuZ2V0KHNlc3Npb24pO1xuXHRcdHJldHVybiBlbnRyeSAmJiBlbnRyeS51c2UgPT09IFNlc3Npb25Vc2UuVW51c2VkRHJhZnQ7XG5cdH1cblxuXHQvKiogUGVybWFuZW50bHkgbWFya3MgYSBzZXNzaW9uIGFzIHVzZWQsIHNvIGl0IGlzIG5ldmVyIGF1dG8tY29sbGVjdGVkLiAqL1xuXHRwcml2YXRlIF9tYXJrU2Vzc2lvblVzZWQoc2Vzc2lvbjogVVJJKTogdm9pZCB7XG5cdFx0Y29uc3QgZW50cnkgPSB0aGlzLl9zZXNzaW9uU3RhdGVzLmdldChzZXNzaW9uKTtcblx0XHRpZiAoZW50cnkpIHtcblx0XHRcdGVudHJ5LnVzZSA9IFNlc3Npb25Vc2UuVXNlZDtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIF9yZXNvbHZlT3duaW5nU2Vzc2lvbihzZXNzaW9uT3JDaGF0OiBVUkkpOiBVUkkgfCB1bmRlZmluZWQge1xuXHRcdHJldHVybiBpc0FocENoYXRDaGFubmVsKHNlc3Npb25PckNoYXQpID8gcGFyc2VEZWZhdWx0Q2hhdFVyaShzZXNzaW9uT3JDaGF0KSA6IHNlc3Npb25PckNoYXQ7XG5cdH1cblxuXHQvKipcblx0ICogUmV0dXJucyB0aGUgcm9vdC1jaGFubmVsIHtAbGluayBTZXNzaW9uU3VtbWFyeX0gY2F0YWxvZyBlbnRyeSBmb3IgYVxuXHQgKiBzZXNzaW9uLCBvciBgdW5kZWZpbmVkYCB3aGVuIHRoZSBzZXNzaW9uIGlzIHVua25vd24uIFRoZSBzdW1tYXJ5IGlzXG5cdCAqIGRlcml2ZWQgb24gZGVtYW5kIGZyb20gdGhlIHNlc3Npb24ncyB7QGxpbmsgSVNlc3Npb25FbnRyeX06IGl0cyBtZXRhZGF0YVxuXHQgKiBmaWVsZHMgYW5kIGBfbWV0YWAgY29tZSBzdHJhaWdodCBvZmYgdGhlIGxpdmUge0BsaW5rIFNlc3Npb25TdGF0ZX0sIHdoaWxlXG5cdCAqIHRoZSBjYXRhbG9nLW9ubHkgYHJlc291cmNlYCAvIGBjcmVhdGVkQXRgIC8gYG1vZGlmaWVkQXRgIC8gYGNoYW5nZXNgIGNvbWVcblx0ICogZnJvbSB0aGUgZW50cnkuXG5cdCAqL1xuXHRnZXRTZXNzaW9uU3VtbWFyeShzZXNzaW9uOiBVUkkpOiBTZXNzaW9uU3VtbWFyeSB8IHVuZGVmaW5lZCB7XG5cdFx0Y29uc3QgZW50cnkgPSB0aGlzLl9zZXNzaW9uU3RhdGVzLmdldChzZXNzaW9uKTtcblx0XHRyZXR1cm4gZW50cnkgPyB0aGlzLl90b1N1bW1hcnkoc2Vzc2lvbiwgZW50cnkpIDogdW5kZWZpbmVkO1xuXHR9XG5cblx0LyoqIFJldHVybnMgYW4gdW5yZXN0b3JlZCBzZXNzaW9uJ3MgbGFzdCBzdXJmYWNlZCBzdW1tYXJ5LCBpZiBhbnkuICovXG5cdGdldFN1cmZhY2VkU2Vzc2lvblN1bW1hcnkoc2Vzc2lvbjogc3RyaW5nKTogU2Vzc2lvblN1bW1hcnkgfCB1bmRlZmluZWQge1xuXHRcdHJldHVybiB0aGlzLl9zZXNzaW9uU3RhdGVzLmhhcyhzZXNzaW9uKSA/IHVuZGVmaW5lZCA6IHRoaXMuX3N1bW1hcnlOb3RpZmllci5nZXRBbm5vdW5jZWQoc2Vzc2lvbik7XG5cdH1cblxuXHQvKipcblx0ICogUHJvamVjdHMgYW4ge0BsaW5rIElTZXNzaW9uRW50cnl9IGludG8gaXRzIHJvb3QtY2hhbm5lbFxuXHQgKiB7QGxpbmsgU2Vzc2lvblN1bW1hcnl9LiBUaGUgc3VtbWFyeSdzIGBfbWV0YWAgaXMgdGhlIHNhbWUgb2JqZWN0IGFzXG5cdCAqIHtAbGluayBTZXNzaW9uU3RhdGUuX21ldGF9IFx1MjAxNCB0aGUgaG9zdCB0cmVhdHMgdGhlIHR3byBhcyBpZGVudGljYWwuXG5cdCAqL1xuXHRwcml2YXRlIF90b1N1bW1hcnkoc2Vzc2lvbjogc3RyaW5nLCBlbnRyeTogSVNlc3Npb25FbnRyeSk6IFNlc3Npb25TdW1tYXJ5IHtcblx0XHRjb25zdCB7IHN0YXRlIH0gPSBlbnRyeTtcblx0XHRjb25zdCBzdW1tYXJ5OiBTZXNzaW9uU3VtbWFyeSA9IHtcblx0XHRcdHJlc291cmNlOiBzZXNzaW9uLFxuXHRcdFx0cHJvdmlkZXI6IHN0YXRlLnByb3ZpZGVyLFxuXHRcdFx0dGl0bGU6IHN0YXRlLnRpdGxlLFxuXHRcdFx0c3RhdHVzOiBzdGF0ZS5zdGF0dXMsXG5cdFx0XHRjcmVhdGVkQXQ6IGVudHJ5LmNyZWF0ZWRBdCxcblx0XHRcdG1vZGlmaWVkQXQ6IGVudHJ5Lm1vZGlmaWVkQXQsXG5cdFx0fTtcblx0XHRpZiAoc3RhdGUuYWN0aXZpdHkgIT09IHVuZGVmaW5lZCkgeyBzdW1tYXJ5LmFjdGl2aXR5ID0gc3RhdGUuYWN0aXZpdHk7IH1cblx0XHRpZiAoc3RhdGUucHJvamVjdCAhPT0gdW5kZWZpbmVkKSB7IHN1bW1hcnkucHJvamVjdCA9IHN0YXRlLnByb2plY3Q7IH1cblx0XHRpZiAoc3RhdGUud29ya2luZ0RpcmVjdG9yaWVzICE9PSB1bmRlZmluZWQpIHsgc3VtbWFyeS53b3JraW5nRGlyZWN0b3JpZXMgPSBzdGF0ZS53b3JraW5nRGlyZWN0b3JpZXM7IH1cblx0XHRpZiAoc3RhdGUuYW5ub3RhdGlvbnMgIT09IHVuZGVmaW5lZCkgeyBzdW1tYXJ5LmFubm90YXRpb25zID0gc3RhdGUuYW5ub3RhdGlvbnM7IH1cblx0XHRpZiAoZW50cnkuY2hhbmdlcyAhPT0gdW5kZWZpbmVkKSB7IHN1bW1hcnkuY2hhbmdlcyA9IGVudHJ5LmNoYW5nZXM7IH1cblx0XHRpZiAoc3RhdGUuX21ldGEgIT09IHVuZGVmaW5lZCkgeyBzdW1tYXJ5Ll9tZXRhID0gc3RhdGUuX21ldGE7IH1cblx0XHRyZXR1cm4gc3VtbWFyeTtcblx0fVxuXG5cdC8qKlxuXHQgKiBXaGV0aGVyIHRoZSB7QGxpbmsgU2Vzc2lvblN1bW1hcnl9LXJlbGV2YW50IGZpZWxkcyBvZiB0d28gc2Vzc2lvbiBzdGF0ZXNcblx0ICogYXJlIGZpZWxkLWVxdWFsLiBVc2VkIHRvIGRlY2lkZSB3aGV0aGVyIGEgc2Vzc2lvbiBhY3Rpb24gbXV0YXRlZCBhbnl0aGluZ1xuXHQgKiB0aGUgcm9vdC1jaGFubmVsIGNhdGFsb2cgY2FyZXMgYWJvdXQuXG5cdCAqL1xuXHRwcml2YXRlIF9zdW1tYXJ5RmllbGRzRXF1YWwoYTogU2Vzc2lvblN0YXRlLCBiOiBTZXNzaW9uU3RhdGUpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gYS50aXRsZSA9PT0gYi50aXRsZVxuXHRcdFx0JiYgYS5zdGF0dXMgPT09IGIuc3RhdHVzXG5cdFx0XHQmJiBhLmFjdGl2aXR5ID09PSBiLmFjdGl2aXR5XG5cdFx0XHQmJiBhLnByb2plY3QgPT09IGIucHJvamVjdFxuXHRcdFx0JiYgYS53b3JraW5nRGlyZWN0b3JpZXMgPT09IGIud29ya2luZ0RpcmVjdG9yaWVzXG5cdFx0XHQmJiBhLmFubm90YXRpb25zID09PSBiLmFubm90YXRpb25zXG5cdFx0XHQmJiBhLl9tZXRhID09PSBiLl9tZXRhO1xuXHR9XG5cblx0LyoqXG5cdCAqIFJldHVybnMgdGhlIGF1dGhvcml0YXRpdmUge0BsaW5rIENoYXRTdGF0ZX0gZm9yIGEgc2Vzc2lvbidzIGRlZmF1bHRcblx0ICogY2hhdCwgb3IgYHVuZGVmaW5lZGAgd2hlbiB0aGUgc2Vzc2lvbiBpcyB1bmtub3duLiBVc2UgdGhpcyB3aGVuIHRoZVxuXHQgKiBjYWxsZXIgc3BlY2lmaWNhbGx5IG5lZWRzIGNvbnZlcnNhdGlvbiBjb250ZW50cyAodHVybnMsIGFjdGl2ZVR1cm4sXG5cdCAqIHBlbmRpbmcvaW5wdXQgc3RhdGUpIHJhdGhlciB0aGFuIHRoZSBzZXNzaW9uIHN1bW1hcnkuXG5cdCAqL1xuXHRnZXREZWZhdWx0Q2hhdFN0YXRlKHNlc3Npb246IFVSSSk6IENoYXRTdGF0ZSB8IHVuZGVmaW5lZCB7XG5cdFx0cmV0dXJuIHRoaXMuX2NoYXRFbnRyaWVzLmdldChidWlsZERlZmF1bHRDaGF0VXJpKHNlc3Npb24pKT8uc3RhdGU7XG5cdH1cblxuXHQvKiogUmV0dXJucyBhbHJlYWR5LWh5ZHJhdGVkIHN0YXRlIHdpdGhvdXQgdHJpZ2dlcmluZyByZXNvbHV0aW9uIG9yIEkvTy4gKi9cblx0Z2V0Q2hhdFN0YXRlKGNoYXQ6IFVSSSk6IENoYXRTdGF0ZSB8IHVuZGVmaW5lZCB7XG5cdFx0cmV0dXJuIHRoaXMuX2NoYXRFbnRyaWVzLmdldChjaGF0KT8uc3RhdGU7XG5cdH1cblxuXHQvKipcblx0ICogUmV0dXJucyBhIGNoYXQncyB7QGxpbmsgQ2hhdE9yaWdpbn0gZnJvbSBpdHMgY2F0YWxvZyBzdW1tYXJ5LCBub3QgaXRzXG5cdCAqIChsYXppbHktbWF0ZXJpYWxpemVkKSB7QGxpbmsgQ2hhdFN0YXRlfTogYSByZXN0b3JlZCBjaGF0IHJlZ2lzdGVycyBpdHNcblx0ICogc3VtbWFyeSBcdTIwMTQgb3JpZ2luIGluY2x1ZGVkIFx1MjAxNCB1cCBmcm9udCwgYmVmb3JlIHN0YXRlIHJlc29sdmVzIHZpYVxuXHQgKiB7QGxpbmsgcmVzb2x2ZUNoYXRTdGF0ZX0uIE9yaWdpbiBpcyBpbW11dGFibGUsIHNvIG5vIGh5ZHJhdGlvbiBpcyBuZWVkZWQuXG5cdCAqL1xuXHRnZXRDaGF0T3JpZ2luKGNoYXQ6IFVSSSk6IENoYXRPcmlnaW4gfCB1bmRlZmluZWQge1xuXHRcdHJldHVybiB0aGlzLl9jaGF0RW50cmllcy5nZXQoY2hhdCk/LnN1bW1hcnkub3JpZ2luO1xuXHR9XG5cblx0LyoqXG5cdCAqIFJlc29sdmVzIGEgcmVzdG9yZWQgY2hhdCdzIHByb3ZpZGVyIGJhY2tpbmcgYW5kIGhpc3Rvcnkgd2hlbiBuZWNlc3NhcnkuXG5cdCAqIENvbmN1cnJlbnQgY2FsbHMgZm9yIG9uZSBlbnRyeSBzaGFyZSBpdHMgcmVzb2x2ZXI7IGEgZmFpbGVkIGF0dGVtcHQgY2FuXG5cdCAqIGJlIHJldHJpZWQgdW5sZXNzIHRoZSBlbnRyeSB3YXMgcmVtb3ZlZCBvciByZXBsYWNlZC5cblx0ICovXG5cdHJlc29sdmVDaGF0U3RhdGUoY2hhdDogVVJJKTogUHJvbWlzZTxDaGF0U3RhdGUgfCB1bmRlZmluZWQ+IHtcblx0XHRjb25zdCBlbnRyeSA9IHRoaXMuX2NoYXRFbnRyaWVzLmdldChjaGF0KTtcblx0XHRpZiAoIWVudHJ5IHx8ICFlbnRyeS52YWxpZCkge1xuXHRcdFx0cmV0dXJuIFByb21pc2UucmVzb2x2ZSh1bmRlZmluZWQpO1xuXHRcdH1cblx0XHRpZiAoZW50cnkuc3RhdGUpIHtcblx0XHRcdHJldHVybiBQcm9taXNlLnJlc29sdmUoZW50cnkuc3RhdGUpO1xuXHRcdH1cblx0XHRpZiAoIWVudHJ5LnJlc29sdmVyKSB7XG5cdFx0XHRyZXR1cm4gUHJvbWlzZS5yZXNvbHZlKHVuZGVmaW5lZCk7XG5cdFx0fVxuXHRcdGlmIChlbnRyeS5pbkZsaWdodCkge1xuXHRcdFx0cmV0dXJuIGVudHJ5LmluRmxpZ2h0O1xuXHRcdH1cblxuXHRcdGNvbnN0IGluRmxpZ2h0ID0gKGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IHJlc3RvcmVkID0gYXdhaXQgZW50cnkucmVzb2x2ZXIhKGVudHJ5LnByb3ZpZGVyRGF0YSk7XG5cdFx0XHRpZiAoIWVudHJ5LnZhbGlkIHx8IHRoaXMuX2NoYXRFbnRyaWVzLmdldChjaGF0KSAhPT0gZW50cnkpIHtcblx0XHRcdFx0dGhyb3cgbmV3IEVycm9yKGBSZXN0b3JlZCBjaGF0IHdhcyBpbnZhbGlkYXRlZCB3aGlsZSByZXNvbHZpbmc6ICR7Y2hhdH1gKTtcblx0XHRcdH1cblx0XHRcdGlmICghZW50cnkuc3RhdGUpIHtcblx0XHRcdFx0ZW50cnkuc3RhdGUgPSB7IC4uLmNyZWF0ZUNoYXRTdGF0ZShlbnRyeS5zdW1tYXJ5KSwgdHVybnM6IHJlc3RvcmVkLnR1cm5zLCBkcmFmdDogcmVzdG9yZWQuZHJhZnQgPz8gZW50cnkuZHJhZnQgfTtcblx0XHRcdFx0ZW50cnkucmVzb2x2ZXIgPSB1bmRlZmluZWQ7XG5cdFx0XHRcdGlmIChyZXN0b3JlZC50dXJucy5sZW5ndGggPiAwKSB7XG5cdFx0XHRcdFx0dGhpcy5fbWFya1Nlc3Npb25Vc2VkKGVudHJ5LnNlc3Npb24pO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm4gZW50cnkuc3RhdGU7XG5cdFx0fSkoKTtcblx0XHRlbnRyeS5pbkZsaWdodCA9IGluRmxpZ2h0O1xuXHRcdHZvaWQgaW5GbGlnaHQudGhlbihcblx0XHRcdCgpID0+IHtcblx0XHRcdFx0aWYgKGVudHJ5LmluRmxpZ2h0ID09PSBpbkZsaWdodCkge1xuXHRcdFx0XHRcdGVudHJ5LmluRmxpZ2h0ID0gdW5kZWZpbmVkO1xuXHRcdFx0XHR9XG5cdFx0XHR9LFxuXHRcdFx0KCkgPT4ge1xuXHRcdFx0XHRpZiAoZW50cnkuaW5GbGlnaHQgPT09IGluRmxpZ2h0KSB7XG5cdFx0XHRcdFx0ZW50cnkuaW5GbGlnaHQgPSB1bmRlZmluZWQ7XG5cdFx0XHRcdH1cblx0XHRcdH0sXG5cdFx0KTtcblx0XHRyZXR1cm4gaW5GbGlnaHQ7XG5cdH1cblxuXHQvKiogUmVwbGFjZXMgYSBjaGF0J3Mgb3BhcXVlLCBhZ2VudC1vd25lZCBwcm92aWRlciBkYXRhIHdpdGhvdXQgaW50ZXJwcmV0aW5nIGl0LiAqL1xuXHR1cGRhdGVDaGF0UHJvdmlkZXJEYXRhKGNoYXQ6IFVSSSwgcHJvdmlkZXJEYXRhOiBzdHJpbmcgfCB1bmRlZmluZWQpOiB2b2lkIHtcblx0XHRjb25zdCBlbnRyeSA9IHRoaXMuX2NoYXRFbnRyaWVzLmdldChjaGF0KTtcblx0XHRpZiAoZW50cnkpIHtcblx0XHRcdGVudHJ5LnByb3ZpZGVyRGF0YSA9IHByb3ZpZGVyRGF0YTtcblx0XHR9XG5cdH1cblxuXHQvKipcblx0ICogU2VlZHMgdGhlIGNvbnZlcnNhdGlvbiBjb250ZW50cyAodHVybnMpIG9mIGEgc2Vzc2lvbidzIGRlZmF1bHQgY2hhdC5cblx0ICogVXNlZCBieSB0aGUgZm9yayBmbG93LCB3aGljaCBtYXRlcmlhbGl6ZXMgYSBuZXcgc2Vzc2lvbiBwcmUtcG9wdWxhdGVkXG5cdCAqIHdpdGggYSBzbGljZSBvZiB0aGUgc291cmNlIHNlc3Npb24ncyB0dXJucy5cblx0ICovXG5cdHNlZWREZWZhdWx0Q2hhdFR1cm5zKHNlc3Npb246IFVSSSwgdHVybnM6IFR1cm5bXSk6IHZvaWQge1xuXHRcdGNvbnN0IGNoYXRTdGF0ZSA9IHRoaXMuX2NoYXRFbnRyaWVzLmdldChidWlsZERlZmF1bHRDaGF0VXJpKHNlc3Npb24pKT8uc3RhdGU7XG5cdFx0aWYgKGNoYXRTdGF0ZSkge1xuXHRcdFx0Y2hhdFN0YXRlLnR1cm5zID0gdHVybnM7XG5cdFx0fVxuXHRcdGlmICh0dXJucy5sZW5ndGggPiAwKSB7XG5cdFx0XHR0aGlzLl9tYXJrU2Vzc2lvblVzZWQoc2Vzc2lvbik7XG5cdFx0fVxuXHR9XG5cblx0Z2V0IHNlcnZlclNlcSgpOiBudW1iZXIge1xuXHRcdHJldHVybiB0aGlzLl9zZXJ2ZXJTZXE7XG5cdH1cblxuXHRnZXRTZXNzaW9uVXJpcygpOiBzdHJpbmdbXSB7XG5cdFx0cmV0dXJuIFsuLi50aGlzLl9zZXNzaW9uU3RhdGVzLmtleXMoKV07XG5cdH1cblxuXHQvKipcblx0ICogU3VtbWFyaWVzIGVsaWdpYmxlIHRvIGJlIG92ZXJsYWlkIG9udG8gYSBwcm92aWRlcidzIGBsaXN0U2Vzc2lvbnNgXG5cdCAqIHNuYXBzaG90IHdoZW4gdGhhdCBzbmFwc2hvdCBpcyBtaXNzaW5nIHRoZW0uIEEgc2Vzc2lvbiBxdWFsaWZpZXMgaWYgaXRcblx0ICogaGFzIG1hdGVyaWFsaXplZCAobGlmZWN5Y2xlICE9PSB7QGxpbmsgU2Vzc2lvbkxpZmVjeWNsZS5DcmVhdGluZ30pIFx1MjAxNCB0aGlzXG5cdCAqIGNvdmVycyB0aGUgdHJhbnNpZW50LWRyb3AgY2FzZSB3aGVyZSBhIHByb3ZpZGVyIGJyaWVmbHkgb21pdHMgYVxuXHQgKiBqdXN0LW1hdGVyaWFsaXplZCBzZXNzaW9uIFx1MjAxNCBvciBpZiBpdCBpcyBzdGlsbCBwcm92aXNpb25hbCBidXQgaGFzIGhhZCBhbnlcblx0ICogdHVybiBhY3Rpdml0eSAoYW4gaW4tZmxpZ2h0IHR1cm4sIG9yIGEgY29tcGxldGVkIHR1cm4gd2hvc2UgbWF0ZXJpYWxpemVcblx0ICogZXZlbnQgaGFzIG5vdCBsYW5kZWQgeWV0OyB0aGUgZmlyc3QgdHVybiBjYW4gc3RhcnQgYmVmb3JlIG1hdGVyaWFsaXphdGlvblxuXHQgKiBjb21wbGV0ZXMpLiBJZGxlIHByb3Zpc2lvbmFsIHNlc3Npb25zIChjcmVhdGVkIGJ1dCBub3QgeWV0IG1hdGVyaWFsaXplZFxuXHQgKiBhbmQgd2l0aCBubyB0dXJuIGFjdGl2aXR5LCBlLmcuIHRoZSBuZXctc2Vzc2lvbiBjb21wb3NlcidzIGVhZ2VybHktY3JlYXRlZFxuXHQgKiBzZXNzaW9uIGJlZm9yZSBpdHMgZmlyc3QgbWVzc2FnZSkgYXJlIGV4Y2x1ZGVkIHNvIHRoZXkgZG9uJ3QgbGVhayBpbnRvXG5cdCAqIHRoZSBzZXNzaW9uIGxpc3QgKCMzMjEyNjkpLlxuXHQgKi9cblx0Z2V0T3ZlcmxheVNlc3Npb25TdW1tYXJpZXMoKTogU2Vzc2lvblN1bW1hcnlbXSB7XG5cdFx0Y29uc3Qgc3VtbWFyaWVzOiBTZXNzaW9uU3VtbWFyeVtdID0gW107XG5cdFx0Zm9yIChjb25zdCBba2V5LCBlbnRyeV0gb2YgdGhpcy5fc2Vzc2lvblN0YXRlcykge1xuXHRcdFx0aWYgKHRoaXMuX2lzSWRsZVByb3Zpc2lvbmFsKGtleSwgZW50cnkuc3RhdGUubGlmZWN5Y2xlKSkge1xuXHRcdFx0XHRjb250aW51ZTtcblx0XHRcdH1cblx0XHRcdHN1bW1hcmllcy5wdXNoKHRoaXMuX3RvU3VtbWFyeShrZXksIGVudHJ5KSk7XG5cdFx0fVxuXHRcdHJldHVybiBzdW1tYXJpZXM7XG5cdH1cblxuXHQvKipcblx0ICogV2hldGhlciBhIHNlc3Npb24gaXMgY3JlYXRlZCBidXQgbm90IHlldCBtYXRlcmlhbGl6ZWQgKHtAbGluayBTZXNzaW9uTGlmZWN5Y2xlLkNyZWF0aW5nfSlcblx0ICogd2l0aCBubyB0dXJuIGFjdGl2aXR5IFx1MjAxNCBlLmcuIHRoZSBuZXctc2Vzc2lvbiBjb21wb3NlcidzIGVhZ2VybHktY3JlYXRlZFxuXHQgKiBzZXNzaW9uIGJlZm9yZSBpdHMgZmlyc3QgbWVzc2FnZS4gU3VjaCBzZXNzaW9ucyBtdXN0IG5vdCBsZWFrIGludG8gdGhlXG5cdCAqIHNlc3Npb24gbGlzdCAoIzMyMTI2OSkuIFJldHVybnMgYGZhbHNlYCBpZiB0aGUgc2Vzc2lvbiBoYXMgbm8gdHJhY2tlZCBzdGF0ZS5cblx0ICovXG5cdGlzSWRsZVByb3Zpc2lvbmFsU2Vzc2lvbihzZXNzaW9uOiBzdHJpbmcpOiBib29sZWFuIHtcblx0XHRjb25zdCBlbnRyeSA9IHRoaXMuX3Nlc3Npb25TdGF0ZXMuZ2V0KHNlc3Npb24pO1xuXHRcdHJldHVybiBlbnRyeSA/IHRoaXMuX2lzSWRsZVByb3Zpc2lvbmFsKHNlc3Npb24sIGVudHJ5LnN0YXRlLmxpZmVjeWNsZSkgOiBmYWxzZTtcblx0fVxuXG5cdHByaXZhdGUgX2lzSWRsZVByb3Zpc2lvbmFsKHNlc3Npb246IHN0cmluZywgbGlmZWN5Y2xlOiBTZXNzaW9uTGlmZWN5Y2xlKTogYm9vbGVhbiB7XG5cdFx0Ly8gVHVybiBhY3Rpdml0eSBsaXZlcyBvbiB0aGUgc2Vzc2lvbidzIGRlZmF1bHQgY2hhdCBhZnRlciB0aGUgbXVsdGktY2hhdFxuXHRcdC8vIHByb3RvY29sIG1vdmUsIHNvIGNvbnN1bHQgdGhhdCBjaGF0J3MgdHVybnMvYWN0aXZlVHVybi5cblx0XHRjb25zdCBjaGF0ID0gdGhpcy5fY2hhdEVudHJpZXMuZ2V0KGJ1aWxkRGVmYXVsdENoYXRVcmkoc2Vzc2lvbikpPy5zdGF0ZTtcblx0XHRyZXR1cm4gbGlmZWN5Y2xlID09PSBTZXNzaW9uTGlmZWN5Y2xlLkNyZWF0aW5nICYmICFjaGF0Py5hY3RpdmVUdXJuICYmIChjaGF0Py50dXJucy5sZW5ndGggPz8gMCkgPT09IDA7XG5cdH1cblxuXHQvKipcblx0ICogUmV0dXJucyBhbGwgc2Vzc2lvbiBVUklzIHdob3NlIGtleXMgc3RhcnQgd2l0aCB0aGUgZ2l2ZW4gcHJlZml4LlxuXHQgKiBVc2VkIHRvIGRpc2NvdmVyIHN1YmFnZW50IHNlc3Npb25zIGZvciBhIGdpdmVuIHBhcmVudC5cblx0ICovXG5cdGdldFNlc3Npb25VcmlzV2l0aFByZWZpeChwcmVmaXg6IHN0cmluZyk6IHN0cmluZ1tdIHtcblx0XHRjb25zdCByZXN1bHQ6IHN0cmluZ1tdID0gW107XG5cdFx0Zm9yIChjb25zdCBrZXkgb2YgdGhpcy5fc2Vzc2lvblN0YXRlcy5rZXlzKCkpIHtcblx0XHRcdGlmIChrZXkuc3RhcnRzV2l0aChwcmVmaXgpKSB7XG5cdFx0XHRcdHJlc3VsdC5wdXNoKGtleSk7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdHJldHVybiByZXN1bHQ7XG5cdH1cblxuXHQvLyAtLS0tIFNuYXBzaG90cyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG5cblx0LyoqXG5cdCAqIFJldHVybnMgYSBzdGF0ZSBzbmFwc2hvdCBmb3IgYSBnaXZlbiByZXNvdXJjZSBVUkkuXG5cdCAqIFRoZSBgZnJvbVNlcWAgaW4gdGhlIHNuYXBzaG90IGlzIHRoZSBjdXJyZW50IHNlcnZlclNlcSBhdCBzbmFwc2hvdCB0aW1lO1xuXHQgKiB0aGUgY2xpZW50IHNob3VsZCBwcm9jZXNzIHN1YnNlcXVlbnQgZW52ZWxvcGVzIHdpdGggc2VydmVyU2VxID4gZnJvbVNlcS5cblx0ICovXG5cdGdldFNuYXBzaG90KHJlc291cmNlOiBVUkkpOiBJU3RhdGVTbmFwc2hvdCB8IHVuZGVmaW5lZCB7XG5cdFx0aWYgKGlzQWhwUm9vdENoYW5uZWwocmVzb3VyY2UpKSB7XG5cdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRyZXNvdXJjZTogUk9PVF9TVEFURV9VUkksXG5cdFx0XHRcdHN0YXRlOiB0aGlzLl9yb290U3RhdGUsXG5cdFx0XHRcdGZyb21TZXE6IHRoaXMuX3NlcnZlclNlcSxcblx0XHRcdH07XG5cdFx0fVxuXG5cdFx0Ly8gQ2hhbmdlc2V0IFVSSXMgYXJlIG5lc3RlZCB1bmRlciB0aGVpciBzZXNzaW9uIFVSSTsgY2hlY2sgdGhlbVxuXHRcdC8vIGJlZm9yZSBmYWxsaW5nIGJhY2sgdG8gdGhlIHNlc3Npb24gbWFwIHNvIGEgc2Vzc2lvbiB3aG9zZSBVUklcblx0XHQvLyBoYXBwZW5zIHRvIHNoYXJlIGEgcHJlZml4IHdpdGggYSBjaGFuZ2VzZXQgbmV2ZXIgY29sbGlkZXMuXG5cdFx0Y29uc3QgY2hhbmdlc2V0U3RhdGUgPSB0aGlzLl9jaGFuZ2VzZXRzLmdldChyZXNvdXJjZSk7XG5cdFx0aWYgKGNoYW5nZXNldFN0YXRlKSB7XG5cdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRyZXNvdXJjZSxcblx0XHRcdFx0c3RhdGU6IGNoYW5nZXNldFN0YXRlLFxuXHRcdFx0XHRmcm9tU2VxOiB0aGlzLl9zZXJ2ZXJTZXEsXG5cdFx0XHR9O1xuXHRcdH1cblxuXHRcdC8vIENoYXQgY2hhbm5lbCBVUklzIHJlc29sdmUgdG8gcGVyLWNoYXQgY29udmVyc2F0aW9uIHN0YXRlLlxuXHRcdGlmIChpc0FocENoYXRDaGFubmVsKHJlc291cmNlKSkge1xuXHRcdFx0Y29uc3QgY2hhdFN0YXRlID0gdGhpcy5fY2hhdEVudHJpZXMuZ2V0KHJlc291cmNlKT8uc3RhdGU7XG5cdFx0XHRpZiAoIWNoYXRTdGF0ZSkge1xuXHRcdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdFx0fVxuXHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0cmVzb3VyY2UsXG5cdFx0XHRcdHN0YXRlOiBjaGF0U3RhdGUsXG5cdFx0XHRcdGZyb21TZXE6IHRoaXMuX3NlcnZlclNlcSxcblx0XHRcdH07XG5cdFx0fVxuXG5cdFx0Ly8gQW5ub3RhdGlvbiBVUklzIGFyZSBuZXN0ZWQgdW5kZXIgdGhlaXIgc2Vzc2lvbiBVUkkgYXMgd2VsbC4gVGhleSBhcmVcblx0XHQvLyBjbGllbnQtZGlzcGF0Y2hhYmxlIGFuZCBsYXppbHkgY3JlYXRlZCwgc28gcmV0dXJuIGFuIGVtcHR5IHN0YXRlIGZvclxuXHRcdC8vIGEgd2VsbC1mb3JtZWQgYW5ub3RhdGlvbnMgVVJJIGV2ZW4gYmVmb3JlIHRoZSBmaXJzdCB3cml0ZS5cblx0XHRpZiAoaXNBbm5vdGF0aW9uc1VyaShyZXNvdXJjZSkpIHtcblx0XHRcdHJldHVybiB7XG5cdFx0XHRcdHJlc291cmNlLFxuXHRcdFx0XHRzdGF0ZTogdGhpcy5fYW5ub3RhdGlvbnMuZ2V0KHJlc291cmNlKSA/PyB7IGFubm90YXRpb25zOiBbXSB9LFxuXHRcdFx0XHRmcm9tU2VxOiB0aGlzLl9zZXJ2ZXJTZXEsXG5cdFx0XHR9O1xuXHRcdH1cblxuXHRcdGNvbnN0IGVudHJ5ID0gdGhpcy5fc2Vzc2lvblN0YXRlcy5nZXQocmVzb3VyY2UpO1xuXHRcdGlmICghZW50cnkpIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHtcblx0XHRcdHJlc291cmNlLFxuXHRcdFx0c3RhdGU6IGVudHJ5LnN0YXRlLFxuXHRcdFx0ZnJvbVNlcTogdGhpcy5fc2VydmVyU2VxLFxuXHRcdH07XG5cdH1cblxuXHQvKiogUmVhZC1vbmx5IGFjY2Vzc29yIGZvciBjYWxsZXJzIHRoYXQgb25seSBuZWVkIHRvIGluc3BlY3QgYSBjaGFuZ2VzZXQgKG5vdCBzdWJzY3JpYmUpLiAqL1xuXHRnZXRDaGFuZ2VzZXRTdGF0ZShjaGFuZ2VzZXQ6IFVSSSk6IENoYW5nZXNldFN0YXRlIHwgdW5kZWZpbmVkIHtcblx0XHRyZXR1cm4gdGhpcy5fY2hhbmdlc2V0cy5nZXQoY2hhbmdlc2V0KTtcblx0fVxuXG5cdC8qKiBSZWNvbnNpZGVycyBjaGFuZ2VzZXQgc3RhdGUgcmV0ZW50aW9uIGFmdGVyIHN1YnNjcmliZXJzIG9yIGNvbXB1dGVzIHJlbGVhc2UgdGhlaXIgcGlucy4gKi9cblx0b25DaGFuZ2VzZXRMaXZlbmVzc0NoYW5nZWQoKTogdm9pZCB7XG5cdFx0dGhpcy5fY2hhbmdlc2V0cy50cmltRXZpY3RhYmxlRW50cmllcygpO1xuXHR9XG5cblx0Ly8gLS0tLSBTZXNzaW9uIGxpZmVjeWNsZSAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuXG5cdC8qKlxuXHQgKiBDcmVhdGVzIGEgbmV3IHNlc3Npb24gaW4gc3RhdGUgd2l0aCBgbGlmZWN5Y2xlOiAnY3JlYXRpbmcnYC5cblx0ICogUmV0dXJucyB0aGUgaW5pdGlhbCBzZXNzaW9uIHN0YXRlLlxuXHQgKlxuXHQgKiBCeSBkZWZhdWx0IGEge0BsaW5rIE5vdGlmaWNhdGlvblR5cGUuU2Vzc2lvbkFkZGVkfSBub3RpZmljYXRpb24gaXNcblx0ICogZW1pdHRlZCBzbyBjbGllbnRzIHNlZSB0aGUgbmV3IHNlc3Npb24gaW1tZWRpYXRlbHkuIFBhc3Ncblx0ICogYG9wdGlvbnMuZW1pdE5vdGlmaWNhdGlvbjogZmFsc2VgIHRvIGRlZmVyIHRoZSBub3RpZmljYXRpb24gXHUyMDE0IGEgdHlwaWNhbFxuXHQgKiB1c2UgaXMgZm9yICoqcHJvdmlzaW9uYWwqKiBzZXNzaW9ucyB0aGF0IGV4aXN0IG9uIHRoZSBzZXJ2ZXIgYnV0IHNob3VsZFxuXHQgKiBub3QgYXBwZWFyIGluIGNsaWVudCBzZXNzaW9uIGxpc3RzIHVudGlsIHRoZXkgaGF2ZSBiZWVuIHBlcnNpc3RlZCBieVxuXHQgKiB0aGUgYWdlbnQgKGUuZy4gb24gdGhlIGZpcnN0IG1lc3NhZ2UgdGhhdCBtYXRlcmlhbGl6ZXMgYW4gU0RLIHNlc3Npb25cblx0ICogYW5kIHdyaXRlcyBpdHMgb24tZGlzayBtZXRhZGF0YSkuIENhbGwge0BsaW5rIG1hcmtTZXNzaW9uUGVyc2lzdGVkfVxuXHQgKiBhZnRlcndhcmRzIHRvIGZpcmUgdGhlIGRlZmVycmVkIG5vdGlmaWNhdGlvbi5cblx0ICovXG5cdGNyZWF0ZVNlc3Npb24oc3VtbWFyeTogU2Vzc2lvblN1bW1hcnksIG9wdGlvbnM/OiB7IHJlYWRvbmx5IGVtaXROb3RpZmljYXRpb24/OiBib29sZWFuIH0pOiBTZXNzaW9uU3RhdGUge1xuXHRcdGNvbnN0IGtleSA9IHN1bW1hcnkucmVzb3VyY2U7XG5cdFx0Y29uc3QgZXhpc3RpbmcgPSB0aGlzLl9zZXNzaW9uU3RhdGVzLmdldChrZXkpO1xuXHRcdGlmIChleGlzdGluZykge1xuXHRcdFx0dGhpcy5fbG9nU2VydmljZS53YXJuKGBbQWdlbnRIb3N0U3RhdGVNYW5hZ2VyXSBTZXNzaW9uIGFscmVhZHkgZXhpc3RzOiAke2tleX1gKTtcblx0XHRcdHJldHVybiBleGlzdGluZy5zdGF0ZTtcblx0XHR9XG5cblx0XHRjb25zdCBzdGF0ZSA9IGNyZWF0ZVNlc3Npb25TdGF0ZShzdW1tYXJ5KTtcblx0XHR0aGlzLl9zZXNzaW9uU3RhdGVzLnNldChrZXksIHRoaXMuX25ld0VudHJ5KHN0YXRlLCBzdW1tYXJ5LCBTZXNzaW9uVXNlLlVudXNlZERyYWZ0KSk7XG5cdFx0dGhpcy5fZW5zdXJlRGVmYXVsdENoYXQoa2V5LCBzdW1tYXJ5KTtcblxuXHRcdHRoaXMuX2xvZ1NlcnZpY2UudHJhY2UoYFtBZ2VudEhvc3RTdGF0ZU1hbmFnZXJdIENyZWF0ZWQgc2Vzc2lvbjogJHtrZXl9YCk7XG5cblx0XHRpZiAob3B0aW9ucz8uZW1pdE5vdGlmaWNhdGlvbiAhPT0gZmFsc2UpIHtcblx0XHRcdC8vIEFubm91bmNpbmcgdGhlIHN1bW1hcnkgdG8gdGhlIG5vdGlmaWVyIGlzIHdoYXQgbWFrZXNcblx0XHRcdC8vIGl0cyBsYXRlciBmbHVzaCBlbWl0IGluY3JlbWVudGFsIHVwZGF0ZXMgYW5kIHdoYXQgbWFrZXNcblx0XHRcdC8vIGBtYXJrU2Vzc2lvblBlcnNpc3RlZGAgYSBuby1vcC4gUHJvdmlzaW9uYWwgc2Vzc2lvbnNcblx0XHRcdC8vIGludGVudGlvbmFsbHkgc2tpcCBib3RoIHVudGlsIHRoZXkgYXJlIHBlcnNpc3RlZC5cblx0XHRcdHRoaXMuX3N1bW1hcnlOb3RpZmllci5hbm5vdW5jZShrZXksIHN1bW1hcnkpO1xuXHRcdFx0dGhpcy5fb25EaWRFbWl0Tm90aWZpY2F0aW9uLmZpcmUoe1xuXHRcdFx0XHR0eXBlOiAncm9vdC9zZXNzaW9uQWRkZWQnLFxuXHRcdFx0XHRjaGFubmVsOiBST09UX1NUQVRFX1VSSSxcblx0XHRcdFx0c3VtbWFyeSxcblx0XHRcdH0pO1xuXHRcdH1cblxuXHRcdHJldHVybiBzdGF0ZTtcblx0fVxuXG5cdC8qKiBCdWlsZHMgdGhlIGF1dGhvcml0YXRpdmUge0BsaW5rIElTZXNzaW9uRW50cnl9IGZvciBhIGZyZXNobHkgc2VlZGVkIHN0YXRlLiAqL1xuXHRwcml2YXRlIF9uZXdFbnRyeShzdGF0ZTogU2Vzc2lvblN0YXRlLCBzdW1tYXJ5OiBTZXNzaW9uU3VtbWFyeSwgdXNlOiBTZXNzaW9uVXNlKTogSVNlc3Npb25FbnRyeSB7XG5cdFx0cmV0dXJuIHsgc3RhdGUsIGNyZWF0ZWRBdDogc3VtbWFyeS5jcmVhdGVkQXQsIG1vZGlmaWVkQXQ6IHN1bW1hcnkubW9kaWZpZWRBdCwgY2hhbmdlczogc3VtbWFyeS5jaGFuZ2VzLCB1c2UgfTtcblx0fVxuXG5cdC8qKlxuXHQgKiBGaXJlIGEge0BsaW5rIE5vdGlmaWNhdGlvblR5cGUuU2Vzc2lvbkFkZGVkfSBub3RpZmljYXRpb24gZm9yIGEgc2Vzc2lvblxuXHQgKiB3aG9zZSBjcmVhdGlvbiB3YXMgZGVmZXJyZWQgdmlhIGBjcmVhdGVTZXNzaW9uKHsgZW1pdE5vdGlmaWNhdGlvbjogZmFsc2UgfSlgLlxuXHQgKlxuXHQgKiBQcm9wYWdhdGVzIHRoZSBtYXRlcmlhbGl6YXRpb24tcmVzb2x2ZWQgY2F0YWxvZyBmaWVsZHMgKGBwcm9qZWN0YCxcblx0ICogYHdvcmtpbmdEaXJlY3RvcnlgLCBgbW9kaWZpZWRBdGAsIGBjaGFuZ2VzYCkgZnJvbSB0aGUgc3VwcGxpZWQgc3VtbWFyeVxuXHQgKiBvbnRvIHRoZSBzZXNzaW9uIGVudHJ5IHNvIHN1YnNjcmliZXJzIHNlZSB0aGVtLiBUaGUgcmVkdWNlci1vd25lZCBtZXRhZGF0YVxuXHQgKiAoYHRpdGxlYCwgYHN0YXR1c2AsIGBhY3Rpdml0eWApIGlzIGludGVudGlvbmFsbHkgTk9UIGNvcGllZCBiYWNrIFx1MjAxNCB0aGUgbGl2ZVxuXHQgKiBzdGF0ZSBpcyBhdXRob3JpdGF0aXZlIGZvciB0aG9zZS4gTm8tb3BzIGZvciBzZXNzaW9ucyB0aGF0IHdlcmUgYWxyZWFkeVxuXHQgKiBhbm5vdW5jZWQgKGlkZW1wb3RlbnQpLlxuXHQgKi9cblx0bWFya1Nlc3Npb25QZXJzaXN0ZWQoc2Vzc2lvbjogVVJJLCBzdW1tYXJ5OiBTZXNzaW9uU3VtbWFyeSwgZm9yY2UgPSBmYWxzZSk6IHZvaWQge1xuXHRcdGNvbnN0IGtleSA9IHNlc3Npb24udG9TdHJpbmcoKTtcblx0XHRjb25zdCBlbnRyeSA9IHRoaXMuX3Nlc3Npb25TdGF0ZXMuZ2V0KGtleSk7XG5cdFx0aWYgKCFlbnRyeSkge1xuXHRcdFx0dGhpcy5fbG9nU2VydmljZS53YXJuKGBbQWdlbnRIb3N0U3RhdGVNYW5hZ2VyXSBtYXJrU2Vzc2lvblBlcnNpc3RlZDogdW5rbm93biBzZXNzaW9uICR7a2V5fWApO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHQvLyBUaGUgbm90aWZpZXIgcmVjb3JkcyBhIHNlc3Npb24ncyBhbm5vdW5jZWQgc3VtbWFyeSB3aGVuZXZlciBpdCBoYXNcblx0XHQvLyBiZWVuIHN1cmZhY2VkIHRvIGNsaWVudHMgKGVpdGhlciB0aHJvdWdoIGBjcmVhdGVTZXNzaW9uYCBvciBoZXJlKTtcblx0XHQvLyB1c2luZyBpdCBhcyB0aGUgaWRlbXBvdGVuY3kgY2hlY2sga2VlcHMgdXMgZnJvbSBmaXJpbmcgYFNlc3Npb25BZGRlZGBcblx0XHQvLyB0d2ljZSBmb3IgYSBzZXNzaW9uIHdob3NlIGNyZWF0aW9uIHdhcyBub3QgZGVmZXJyZWQuIGBmb3JjZWAgb3ZlcnJpZGVzXG5cdFx0Ly8gdGhpcyBmb3IgYWRvcHQsIHdoZXJlIGByZXN0b3JlU2Vzc2lvbmAgbWFya3MgdGhlIHN1bW1hcnkgYW5ub3VuY2VkXG5cdFx0Ly8gd2l0aG91dCBldmVyIGVtaXR0aW5nLCBzbyBjbGllbnRzIChlLmcuIHRoZSB3b3Jrc3BhY2Utc2NvcGVkIGVkaXRvclxuXHRcdC8vIHNlc3Npb24gbGlzdCkgdGhhdCByZWx5IG9uIHRoZSBub3RpZmljYXRpb24gd291bGQgb3RoZXJ3aXNlIG1pc3MgaXQgXHUyMDE0XG5cdFx0Ly8gYSByZWR1bmRhbnQgcmUtYW5ub3VuY2UgaXMgaGFybWxlc3MgKGBTZXNzaW9uQWRkZWRgIGlzIGlkZW1wb3RlbnQpLlxuXHRcdGlmICghZm9yY2UgJiYgdGhpcy5fc3VtbWFyeU5vdGlmaWVyLmlzQW5ub3VuY2VkKGtleSkpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0Ly8gUHJvcGFnYXRlIHRoZSBtYXRlcmlhbGl6YXRpb24tcmVzb2x2ZWQgZmllbGRzIHNvIHN1YnNjcmliZXJzIGNhbGxpbmdcblx0XHQvLyBgZ2V0U2Vzc2lvblN0YXRlYCAvIGBnZXRTZXNzaW9uU3VtbWFyeWAgc2VlIHRoZSByZXNvbHZlZCB3b3JraW5nXG5cdFx0Ly8gZGlyZWN0b3J5IC8gcHJvamVjdC4gV2UgZG9uJ3QgbmVlZCB0byBzY2hlZHVsZSBhXG5cdFx0Ly8gYFNlc3Npb25TdW1tYXJ5Q2hhbmdlZGAgZmx1c2ggYmVjYXVzZSB0aGUgdXBjb21pbmcgYFNlc3Npb25BZGRlZGBcblx0XHQvLyBub3RpZmljYXRpb24gY2FycmllcyB0aGUgY29tcGxldGUgc3VtbWFyeSBhbHJlYWR5LlxuXHRcdGVudHJ5LnN0YXRlID0geyAuLi5lbnRyeS5zdGF0ZSwgcHJvamVjdDogc3VtbWFyeS5wcm9qZWN0LCB3b3JraW5nRGlyZWN0b3JpZXM6IHN1bW1hcnkud29ya2luZ0RpcmVjdG9yaWVzIH07XG5cdFx0ZW50cnkubW9kaWZpZWRBdCA9IHN1bW1hcnkubW9kaWZpZWRBdDtcblx0XHRlbnRyeS5jaGFuZ2VzID0gc3VtbWFyeS5jaGFuZ2VzO1xuXHRcdGNvbnN0IGZ1bGwgPSB0aGlzLl90b1N1bW1hcnkoa2V5LCBlbnRyeSk7XG5cdFx0dGhpcy5fc3VtbWFyeU5vdGlmaWVyLmFubm91bmNlKGtleSwgZnVsbCk7XG5cdFx0dGhpcy5fb25EaWRFbWl0Tm90aWZpY2F0aW9uLmZpcmUoe1xuXHRcdFx0dHlwZTogJ3Jvb3Qvc2Vzc2lvbkFkZGVkJyxcblx0XHRcdGNoYW5uZWw6IFJPT1RfU1RBVEVfVVJJLFxuXHRcdFx0c3VtbWFyeTogZnVsbCxcblx0XHR9KTtcblx0fVxuXG5cdC8qKlxuXHQgKiBBbm5vdW5jZSBhIGxlZ2FjeSBDb3BpbG90IENMSSBzZXNzaW9uIHRoYXQgdGhlIHByb3ZpZGVyIGRpc2NvdmVyZWQgb24gZGlza1xuXHQgKiAoc3VyZmFjZWQgYXMgYWRvcHRhYmxlKSBhZnRlciBzdGFydHVwLCBzbyBjbGllbnRzIGFkZCBpdCB0byB0aGVpciBsaXN0XG5cdCAqIHdpdGhvdXQgYSBtYW51YWwgcmVsb2FkLiBEb2VzIE5PVCBjcmVhdGUgcGVyc2lzdGVudCBzdGF0ZSBcdTIwMTQgdGhlIHNlc3Npb24gaXNcblx0ICogbWF0ZXJpYWxpemVkIG9uIGRlbWFuZCB3aGVuIHRoZSB1c2VyIG9wZW5zIGl0IChyZXN0b3JlL2Fkb3B0KS4gTm8tb3BzIGlmXG5cdCAqIHRoZSBzZXNzaW9uIGlzIGFscmVhZHkgaW4gc3RhdGUgb3Igd2FzIGFscmVhZHkgYW5ub3VuY2VkLlxuXHQgKi9cblx0YW5ub3VuY2VTdXJmYWNlZFNlc3Npb24oc3VtbWFyeTogU2Vzc2lvblN1bW1hcnkpOiB2b2lkIHtcblx0XHRjb25zdCBrZXkgPSBzdW1tYXJ5LnJlc291cmNlO1xuXHRcdGlmICh0aGlzLl9zZXNzaW9uU3RhdGVzLmhhcyhrZXkpKSB7XG5cdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLnRyYWNlKGBbQWdlbnRIb3N0U3RhdGVNYW5hZ2VyXSBhbm5vdW5jZVN1cmZhY2VkU2Vzc2lvbjogYWxyZWFkeSBpbiBzdGF0ZSAke2tleX1gKTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0aWYgKHRoaXMuX3N1bW1hcnlOb3RpZmllci5pc0Fubm91bmNlZChrZXkpKSB7XG5cdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLnRyYWNlKGBbQWdlbnRIb3N0U3RhdGVNYW5hZ2VyXSBhbm5vdW5jZVN1cmZhY2VkU2Vzc2lvbjogYWxyZWFkeSBhbm5vdW5jZWQgJHtrZXl9YCk7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdHRoaXMuX3N1bW1hcnlOb3RpZmllci5hbm5vdW5jZShrZXksIHN1bW1hcnkpO1xuXHRcdHRoaXMuX29uRGlkRW1pdE5vdGlmaWNhdGlvbi5maXJlKHtcblx0XHRcdHR5cGU6ICdyb290L3Nlc3Npb25BZGRlZCcsXG5cdFx0XHRjaGFubmVsOiBST09UX1NUQVRFX1VSSSxcblx0XHRcdHN1bW1hcnksXG5cdFx0fSk7XG5cdH1cblxuXHQvKiogUmVtb3ZlcyBhIHN1cmZhY2VkIHNlc3Npb24gd2l0aG91dCBhZmZlY3RpbmcgYSBsaXZlIHNlc3Npb24uICovXG5cdHJldHJhY3RTdXJmYWNlZFNlc3Npb24oc2Vzc2lvbjogc3RyaW5nKTogdm9pZCB7XG5cdFx0aWYgKHRoaXMuX3Nlc3Npb25TdGF0ZXMuaGFzKHNlc3Npb24pKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdHRoaXMuX3N1bW1hcnlOb3RpZmllci5yZW1vdmUoc2Vzc2lvbik7XG5cdFx0dGhpcy5fb25EaWRFbWl0Tm90aWZpY2F0aW9uLmZpcmUoe1xuXHRcdFx0dHlwZTogJ3Jvb3Qvc2Vzc2lvblJlbW92ZWQnLFxuXHRcdFx0Y2hhbm5lbDogUk9PVF9TVEFURV9VUkksXG5cdFx0XHRzZXNzaW9uLFxuXHRcdH0pO1xuXHR9XG5cblx0LyoqXG5cdCAqIFJlc3RvcmVzIGEgc2Vzc2lvbiBmcm9tIGEgcHJldmlvdXMgc2VydmVyIGxpZmV0aW1lIGludG8gdGhlIHN0YXRlIG1hbmFnZXJcblx0ICogd2l0aCBwcmUtcG9wdWxhdGVkIHR1cm5zLiBUaGUgc2Vzc2lvbiBpcyBjcmVhdGVkIGluIGByZWFkeWAgbGlmZWN5Y2xlXG5cdCAqIHN0YXRlIHNpbmNlIGl0IGFscmVhZHkgZXhpc3RzIG9uIHRoZSBiYWNrZW5kLlxuXHQgKlxuXHQgKiBVbmxpa2Uge0BsaW5rIGNyZWF0ZVNlc3Npb259LCB0aGlzIGRvZXMgTk9UIGVtaXQgYSBgc2Vzc2lvbkFkZGVkYFxuXHQgKiBub3RpZmljYXRpb24gYmVjYXVzZSB0aGUgc2Vzc2lvbiBpcyBhbHJlYWR5IGtub3duIHRvIGNsaWVudHMgdmlhXG5cdCAqIGBsaXN0U2Vzc2lvbnNgLiBXaGVuIHRoZSBzZXNzaW9uIHdhcyBwcmV2aW91c2x5IHN1cmZhY2VkIHdpdGggYSBkaWZmZXJlbnRcblx0ICogc3VtbWFyeSAoZS5nLiBhZG9wdGFibGUtbGVnYWN5KSwgYSBgc2Vzc2lvblN1bW1hcnlDaGFuZ2VkYCBkZWx0YSBpcyBlbWl0dGVkXG5cdCAqIHNvIGNsaWVudHMgdXBkYXRlIHRoZSBlbnRyeSBpbiBwbGFjZSBpbnN0ZWFkIG9mIGRyb3BwaW5nIGl0LlxuXHQgKi9cblx0cmVzdG9yZVNlc3Npb24oc3VtbWFyeTogU2Vzc2lvblN1bW1hcnksIHR1cm5zOiBUdXJuW10sIG9wdGlvbnM/OiB7IHJlYWRvbmx5IGRyYWZ0PzogTWVzc2FnZTsgcmVhZG9ubHkgZGVmYXVsdENoYXRUaXRsZT86IHN0cmluZyB9KTogU2Vzc2lvblN0YXRlIHtcblx0XHRjb25zdCBrZXkgPSBzdW1tYXJ5LnJlc291cmNlO1xuXHRcdGNvbnN0IGV4aXN0aW5nID0gdGhpcy5fc2Vzc2lvblN0YXRlcy5nZXQoa2V5KTtcblx0XHRpZiAoZXhpc3RpbmcpIHtcblx0XHRcdHRoaXMuX2xvZ1NlcnZpY2Uud2FybihgW0FnZW50SG9zdFN0YXRlTWFuYWdlcl0gU2Vzc2lvbiBhbHJlYWR5IGV4aXN0cyAocmVzdG9yZSk6ICR7a2V5fWApO1xuXHRcdFx0cmV0dXJuIGV4aXN0aW5nLnN0YXRlO1xuXHRcdH1cblxuXHRcdGNvbnN0IHN0YXRlOiBTZXNzaW9uU3RhdGUgPSB7XG5cdFx0XHQuLi5jcmVhdGVTZXNzaW9uU3RhdGUoc3VtbWFyeSksXG5cdFx0XHRsaWZlY3ljbGU6IFNlc3Npb25MaWZlY3ljbGUuUmVhZHksXG5cdFx0fTtcblx0XHR0aGlzLl9zZXNzaW9uU3RhdGVzLnNldChrZXksIHRoaXMuX25ld0VudHJ5KHN0YXRlLCBzdW1tYXJ5LCBTZXNzaW9uVXNlLlVzZWQpKTtcblx0XHR0aGlzLl9lbnN1cmVEZWZhdWx0Q2hhdChrZXksIHN1bW1hcnksIHR1cm5zLCBvcHRpb25zPy5kcmFmdCwgb3B0aW9ucz8uZGVmYXVsdENoYXRUaXRsZSk7XG5cdFx0Ly8gQSBzZXNzaW9uIHRoYXQgd2FzIHByZXZpb3VzbHkgc3VyZmFjZWQgKGUuZy4gYW5ub3VuY2VkIGFzIGFuXG5cdFx0Ly8gYWRvcHRhYmxlLWxlZ2FjeSBzZXNzaW9uKSBpcyBhbHJlYWR5IGtub3duIHRvIGNsaWVudHMgd2l0aCBhIGRpZmZlcmVudFxuXHRcdC8vIHN1bW1hcnkuIEVtaXQgdGhlIGRlbHRhIHNvIHRoZXkgdXBkYXRlIHRoZSBlbnRyeSBpbiBwbGFjZSBcdTIwMTQgY2xlYXJpbmcgdGhlXG5cdFx0Ly8gYWRvcHRhYmxlIG1hcmtlciBcdTIwMTQgcmF0aGVyIHRoYW4gZHJvcHBpbmcgdGhlIGp1c3Qtb3BlbmVkIHNlc3Npb24gb24gdGhlXG5cdFx0Ly8gbmV4dCBsaXN0IHJlY29uY2lsZS4gTmV2ZXItYW5ub3VuY2VkIHNlc3Npb25zIHJlY29yZCB0aGUgc3VtbWFyeSBzaWxlbnRseS5cblx0XHRpZiAodGhpcy5fc3VtbWFyeU5vdGlmaWVyLmlzQW5ub3VuY2VkKGtleSkpIHtcblx0XHRcdHRoaXMuX3N1bW1hcnlOb3RpZmllci5mbHVzaChrZXkpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHR0aGlzLl9zdW1tYXJ5Tm90aWZpZXIuYW5ub3VuY2Uoa2V5LCBzdW1tYXJ5KTtcblx0XHR9XG5cblx0XHR0aGlzLl9sb2dTZXJ2aWNlLnRyYWNlKGBbQWdlbnRIb3N0U3RhdGVNYW5hZ2VyXSBSZXN0b3JlZCBzZXNzaW9uOiAke2tleX0gKCR7dHVybnMubGVuZ3RofSB0dXJucylgKTtcblxuXHRcdHJldHVybiBzdGF0ZTtcblx0fVxuXG5cdC8qKlxuXHQgKiBDcmVhdGVzIHRoZSBkZWZhdWx0IHtAbGluayBDaGF0U3RhdGV9IGZvciBhIHNlc3Npb24gYW5kIHJlY29yZHMgaXQgYXNcblx0ICogdGhlIHNlc3Npb24ncyBzaW5nbGUgY2hhdC4gVlMgQ29kZSBtb2RlbHMgZXZlcnkgc2Vzc2lvbiBhcyBoYXZpbmdcblx0ICogZXhhY3RseSBvbmUgY2hhdCBcdTIwMTQgaXRzIGRlZmF1bHQgY2hhdCBcdTIwMTQgd2hvc2UgVVJJIGlzIGRlcml2ZWRcblx0ICogZGV0ZXJtaW5pc3RpY2FsbHkgZnJvbSB0aGUgc2Vzc2lvbiBVUkkuIFRoZSBjaGF0IGlzIHNlZWRlZCB3aXRoIGFueVxuXHQgKiBwcmUtcG9wdWxhdGVkIGB0dXJuc2AgKHVzZWQgYnkge0BsaW5rIHJlc3RvcmVTZXNzaW9ufSkuXG5cdCAqXG5cdCAqIFRoZSBzZXNzaW9uJ3MgYGNoYXRzYCBjYXRhbG9nIGFuZCBgZGVmYXVsdENoYXRgIHBvaW50ZXIgYXJlIHVwZGF0ZWRcblx0ICogaW4gcGxhY2UgcmF0aGVyIHRoYW4gdmlhIGRpc3BhdGNoZWQgYWN0aW9uczogdGhlcmUgYXJlIG5vIHN1YnNjcmliZXJzXG5cdCAqIGF0IGNyZWF0aW9uL3Jlc3RvcmUgdGltZSwgc28gdGhlIHNuYXBzaG90IGEgY2xpZW50IGxhdGVyIHJlY2VpdmVzIG9uXG5cdCAqIHN1YnNjcmliZSBhbHJlYWR5IHJlZmxlY3RzIHRoZSBkZWZhdWx0IGNoYXQuXG5cdCAqL1xuXHRwcml2YXRlIF9lbnN1cmVEZWZhdWx0Q2hhdChzZXNzaW9uS2V5OiBzdHJpbmcsIHN1bW1hcnk6IFNlc3Npb25TdW1tYXJ5LCB0dXJucz86IFR1cm5bXSwgZHJhZnQ/OiBNZXNzYWdlLCBkZWZhdWx0Q2hhdFRpdGxlPzogc3RyaW5nKTogdm9pZCB7XG5cdFx0Y29uc3QgY2hhdFVyaSA9IGJ1aWxkRGVmYXVsdENoYXRVcmkoc2Vzc2lvbktleSk7XG5cdFx0Ly8gRW1wdHkgdGl0bGUgbWVhbnMgXCJpbmhlcml0IHRoZSBzZXNzaW9uIHRpdGxlXCI7IGEgcGVyc2lzdGVkIGluZGVwZW5kZW50XG5cdFx0Ly8gcmVuYW1lIChgZGVmYXVsdENoYXRUaXRsZWApIGlzIHNlZWRlZCBiYWNrIGhlcmUgc28gaXQgc3Vydml2ZXMgcmVzdG9yZS5cblx0XHRjb25zdCBjaGF0U3VtbWFyeTogQ2hhdFN1bW1hcnkgPSB7IC4uLmNyZWF0ZURlZmF1bHRDaGF0U3VtbWFyeShzdW1tYXJ5LCBjaGF0VXJpKSwgdGl0bGU6IGRlZmF1bHRDaGF0VGl0bGUgPz8gJycgfTtcblx0XHR0aGlzLl9jaGF0RW50cmllcy5zZXQoY2hhdFVyaSwge1xuXHRcdFx0c2Vzc2lvbjogc2Vzc2lvbktleSxcblx0XHRcdHN1bW1hcnk6IGNoYXRTdW1tYXJ5LFxuXHRcdFx0c3RhdGU6IHsgLi4uY3JlYXRlQ2hhdFN0YXRlKGNoYXRTdW1tYXJ5KSwgdHVybnM6IHR1cm5zID8/IFtdLCBkcmFmdCB9LFxuXHRcdFx0dmFsaWQ6IHRydWUsXG5cdFx0fSk7XG5cdFx0Y29uc3QgZW50cnkgPSB0aGlzLl9zZXNzaW9uU3RhdGVzLmdldChzZXNzaW9uS2V5KTtcblx0XHRpZiAoZW50cnkpIHtcblx0XHRcdC8vIFVwZGF0ZSB0aGUgc2Vzc2lvbidzIGNoYXQgY2F0YWxvZyBpbiBwbGFjZSBzbyB0aGUgb2JqZWN0XG5cdFx0XHQvLyBpZGVudGl0eSByZXR1cm5lZCBieSBgY3JlYXRlU2Vzc2lvbmAvYHJlc3RvcmVTZXNzaW9uYCBzdGF5c1xuXHRcdFx0Ly8gbGl2ZSBpbiB0aGUgbWFwLiBDYWxsZXJzIChlLmcuIGBBZ2VudFNlcnZpY2UuY3JlYXRlU2Vzc2lvbmApXG5cdFx0XHQvLyBtdXRhdGUgdGhlIHJldHVybmVkIHN0YXRlIGRpcmVjdGx5IChgc3RhdGUuY29uZmlnID0gXHUyMDI2YCksIHNvXG5cdFx0XHQvLyByZXBsYWNpbmcgdGhlIG1hcCBlbnRyeSB3aXRoIGEgZnJlc2ggY2xvbmUgaGVyZSB3b3VsZCBzdHJhbmRcblx0XHRcdC8vIHRob3NlIG11dGF0aW9ucyBvbiBhIGRldGFjaGVkIG9iamVjdC5cblx0XHRcdGVudHJ5LnN0YXRlLmNoYXRzID0gW2NoYXRTdW1tYXJ5XTtcblx0XHRcdGVudHJ5LnN0YXRlLmRlZmF1bHRDaGF0ID0gY2hhdFVyaTtcblx0XHR9XG5cdH1cblxuXHQvKipcblx0ICogQWRkcyBhbiBhZGRpdGlvbmFsIChub24tZGVmYXVsdCkgY2hhdCB0byBhbiBleGlzdGluZyBzZXNzaW9uLiBDcmVhdGVzXG5cdCAqIHRoZSBjaGF0J3MgYXV0aG9yaXRhdGl2ZSB7QGxpbmsgQ2hhdFN0YXRlfSwgcmVnaXN0ZXJzIGl0IGluIHRoZSBzZXNzaW9uJ3Ncblx0ICogY2F0YWxvZyB2aWEgYSBkaXNwYXRjaGVkIHtAbGluayBBY3Rpb25UeXBlLlNlc3Npb25DaGF0QWRkZWR9IGFjdGlvbiAoc29cblx0ICogbGl2ZSBzdWJzY3JpYmVycyByZWZyZXNoKSwgYW5kIHJldHVybnMgdGhlIG5ldyBjaGF0J3Mgc3VtbWFyeS5cblx0ICpcblx0ICogVGhlIGNoYXQgaW5oZXJpdHMgdGhlIHNlc3Npb24ncyBtb2RlbC9hZ2VudC93b3JraW5nLWRpcmVjdG9yeSBzY29wZS4gSXRcblx0ICogaXMgYSBuby1vcCAocmV0dXJuaW5nIHRoZSBleGlzdGluZyBzdW1tYXJ5KSB3aGVuIGEgY2hhdCB3aXRoIHRoZSBzYW1lIFVSSVxuXHQgKiBhbHJlYWR5IGV4aXN0cy5cblx0ICpcblx0ICogV2hlbiBgb3B0aW9ucy5wcm92aWRlckRhdGFgIGlzIHN1cHBsaWVkIGl0IGlzIHJlY29yZGVkIHZlcmJhdGltIGFzIHRoZVxuXHQgKiBwZWVyIGNoYXQncyBvcGFxdWUsIGFnZW50LW93bmVkIHJlc3RvcmUgYmxvYi4gVGhlIFN0YXRlTWFuYWdlciBuZXZlclxuXHQgKiBwYXJzZXMgaXQuIFRoZSBkZWZhdWx0IGNoYXQgbmV2ZXIgY2FycmllcyBgcHJvdmlkZXJEYXRhYC5cblx0ICpcblx0ICogYG9wdGlvbnMub3JpZ2luYCByZWNvcmRzIGhvdyB0aGUgY2hhdCBjYW1lIGludG8gZXhpc3RlbmNlIChmb3JrLCBzaWRlXG5cdCAqIGNoYXQsIHRvb2wgc3Bhd24pLiBPbWl0dGluZyBpdCBkZWZhdWx0cyB0byB7QGxpbmsgQ2hhdE9yaWdpbktpbmQuVXNlcn1cblx0ICogdmlhIHtAbGluayBjcmVhdGVEZWZhdWx0Q2hhdFN1bW1hcnl9LCBzbyBldmVyeSBjYXRhbG9nIGNoYXQgaGFzIGFuIG9yaWdpbi5cblx0ICovXG5cdGFkZENoYXQoc2Vzc2lvbjogVVJJLCBjaGF0VXJpOiBVUkksIG9wdGlvbnM/OiB7IHJlYWRvbmx5IHRpdGxlPzogc3RyaW5nOyByZWFkb25seSB0dXJucz86IFR1cm5bXTsgcmVhZG9ubHkgb3JpZ2luPzogQ2hhdE9yaWdpbjsgcmVhZG9ubHkgcHJvdmlkZXJEYXRhPzogc3RyaW5nOyByZWFkb25seSBpbnRlcmFjdGl2aXR5PzogQ2hhdEludGVyYWN0aXZpdHkgfSk6IENoYXRTdW1tYXJ5IHwgdW5kZWZpbmVkIHtcblx0XHRjb25zdCBlbnRyeSA9IHRoaXMuX3Nlc3Npb25TdGF0ZXMuZ2V0KHNlc3Npb24pO1xuXHRcdGlmICghZW50cnkpIHtcblx0XHRcdHRoaXMuX2xvZ1NlcnZpY2Uud2FybihgW0FnZW50SG9zdFN0YXRlTWFuYWdlcl0gYWRkQ2hhdCBmb3IgdW5rbm93biBzZXNzaW9uOiAke3Nlc3Npb259YCk7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblx0XHRjb25zdCBzZXNzaW9uU3RhdGUgPSBlbnRyeS5zdGF0ZTtcblx0XHRjb25zdCBleGlzdGluZyA9IHNlc3Npb25TdGF0ZS5jaGF0cy5maW5kKGMgPT4gYy5yZXNvdXJjZSA9PT0gY2hhdFVyaSk7XG5cdFx0aWYgKGV4aXN0aW5nKSB7XG5cdFx0XHRyZXR1cm4gZXhpc3Rpbmc7XG5cdFx0fVxuXG5cdFx0Ly8gQSBzZXNzaW9uIGdhaW5zIGl0cyBmaXJzdCBhZGRpdGlvbmFsIGNoYXQgaGVyZTogc25hcHNob3QgdGhlIGN1cnJlbnRcblx0XHQvLyBzZXNzaW9uIHRpdGxlIG9udG8gdGhlIHN0aWxsLWluaGVyaXRpbmcgZGVmYXVsdCBjaGF0IHNvIHRoZSB0d29cblx0XHQvLyB0aXRsZXMgYmVjb21lIGZ1bGx5IGluZGVwZW5kZW50LiBXaXRob3V0IHRoaXMgdGhlIGRlZmF1bHQgY2hhdCBrZWVwc1xuXHRcdC8vIGFuIGVtcHR5IHRpdGxlICg9IGluaGVyaXQgdGhlIHNlc3Npb24gdGl0bGUpLCBzbyByZW5hbWluZyB0aGUgc2Vzc2lvblxuXHRcdC8vIHdvdWxkIGFsc28gbW92ZSB0aGUgZGVmYXVsdCBjaGF0IHRhYiBhbmQgdmljZS12ZXJzYS5cblx0XHRjb25zdCBkZWZhdWx0Q2hhdFVyaSA9IHNlc3Npb25TdGF0ZS5kZWZhdWx0Q2hhdCA/PyBidWlsZERlZmF1bHRDaGF0VXJpKHNlc3Npb24pO1xuXHRcdGNvbnN0IGRlZmF1bHRFbnRyeSA9IHNlc3Npb25TdGF0ZS5jaGF0cy5maW5kKGMgPT4gYy5yZXNvdXJjZSA9PT0gZGVmYXVsdENoYXRVcmkpO1xuXHRcdGlmIChkZWZhdWx0RW50cnkgJiYgIWRlZmF1bHRFbnRyeS50aXRsZSAmJiBzZXNzaW9uU3RhdGUudGl0bGUpIHtcblx0XHRcdHRoaXMudXBkYXRlQ2hhdFRpdGxlKHNlc3Npb24sIGRlZmF1bHRDaGF0VXJpLCBzZXNzaW9uU3RhdGUudGl0bGUpO1xuXHRcdH1cblxuXHRcdGNvbnN0IGNoYXRTdW1tYXJ5OiBDaGF0U3VtbWFyeSA9IHtcblx0XHRcdC4uLmNyZWF0ZURlZmF1bHRDaGF0U3VtbWFyeSh0aGlzLl90b1N1bW1hcnkoc2Vzc2lvbiwgZW50cnkpLCBjaGF0VXJpKSxcblx0XHRcdHRpdGxlOiBvcHRpb25zPy50aXRsZSA/PyAnJyxcblx0XHRcdHN0YXR1czogU2Vzc2lvblN0YXR1cy5JZGxlLFxuXHRcdFx0Li4uKG9wdGlvbnM/Lm9yaWdpbiA/IHsgb3JpZ2luOiBvcHRpb25zLm9yaWdpbiB9IDoge30pLFxuXHRcdFx0aW50ZXJhY3Rpdml0eTogb3B0aW9ucz8uaW50ZXJhY3Rpdml0eSxcblx0XHR9O1xuXHRcdHRoaXMuX2NoYXRFbnRyaWVzLnNldChjaGF0VXJpLCB7XG5cdFx0XHRzZXNzaW9uLFxuXHRcdFx0c3VtbWFyeTogY2hhdFN1bW1hcnksXG5cdFx0XHRzdGF0ZTogeyAuLi5jcmVhdGVDaGF0U3RhdGUoY2hhdFN1bW1hcnkpLCB0dXJuczogb3B0aW9ucz8udHVybnMgPz8gW10gfSxcblx0XHRcdHByb3ZpZGVyRGF0YTogb3B0aW9ucz8ucHJvdmlkZXJEYXRhLFxuXHRcdFx0dmFsaWQ6IHRydWUsXG5cdFx0fSk7XG5cdFx0dGhpcy5kaXNwYXRjaFNlcnZlckFjdGlvbihzZXNzaW9uLCB7IHR5cGU6IEFjdGlvblR5cGUuU2Vzc2lvbkNoYXRBZGRlZCwgc3VtbWFyeTogY2hhdFN1bW1hcnkgfSk7XG5cdFx0cmV0dXJuIGNoYXRTdW1tYXJ5O1xuXHR9XG5cblx0LyoqXG5cdCAqIFJlZ2lzdGVycyBhIHJlc3RvcmVkIHBlZXIgY2hhdCBpbiB0aGUgcGFyZW50IHNlc3Npb24ncyBjYXRhbG9nIHdpdGhvdXRcblx0ICogY3JlYXRpbmcgY29udmVyc2F0aW9uIHN0YXRlLiBUaGUgc3RhdGUtbWFuYWdlci1vd25lZCByZXNvbHZlciBpbnN0YWxscyBhXG5cdCAqIGNvbXBsZXRlIHN0YXRlIG9ubHkgdGhyb3VnaCB7QGxpbmsgcmVzb2x2ZUNoYXRTdGF0ZX0uXG5cdCAqL1xuXHRyZWdpc3RlclJlc3RvcmVkQ2hhdFN1bW1hcnkoc2Vzc2lvbjogVVJJLCBjaGF0VXJpOiBVUkksIG9wdGlvbnM6IHsgcmVhZG9ubHkgdGl0bGU/OiBzdHJpbmc7IHJlYWRvbmx5IG9yaWdpbj86IENoYXRPcmlnaW47IHJlYWRvbmx5IGludGVyYWN0aXZpdHk/OiBDaGF0SW50ZXJhY3Rpdml0eTsgcmVhZG9ubHkgZHJhZnQ/OiBNZXNzYWdlOyByZWFkb25seSBwcm92aWRlckRhdGE/OiBzdHJpbmc7IHJlYWRvbmx5IHJlc29sdmVyPzogUmVzdG9yZWRDaGF0UmVzb2x2ZXIgfSk6IENoYXRTdW1tYXJ5IHwgdW5kZWZpbmVkIHtcblx0XHRjb25zdCBlbnRyeSA9IHRoaXMuX3Nlc3Npb25TdGF0ZXMuZ2V0KHNlc3Npb24pO1xuXHRcdGlmICghZW50cnkpIHtcblx0XHRcdHRoaXMuX2xvZ1NlcnZpY2Uud2FybihgW0FnZW50SG9zdFN0YXRlTWFuYWdlcl0gcmVnaXN0ZXJSZXN0b3JlZENoYXRTdW1tYXJ5IGZvciB1bmtub3duIHNlc3Npb246ICR7c2Vzc2lvbn1gKTtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXHRcdGNvbnN0IHNlc3Npb25TdGF0ZSA9IGVudHJ5LnN0YXRlO1xuXHRcdGNvbnN0IGV4aXN0aW5nID0gc2Vzc2lvblN0YXRlLmNoYXRzLmZpbmQoYyA9PiBjLnJlc291cmNlID09PSBjaGF0VXJpKTtcblx0XHRpZiAoZXhpc3RpbmcpIHtcblx0XHRcdGNvbnN0IGV4aXN0aW5nRW50cnkgPSB0aGlzLl9jaGF0RW50cmllcy5nZXQoY2hhdFVyaSk7XG5cdFx0XHRpZiAoZXhpc3RpbmdFbnRyeSAmJiAhZXhpc3RpbmdFbnRyeS5zdGF0ZSAmJiBvcHRpb25zLnJlc29sdmVyKSB7XG5cdFx0XHRcdGV4aXN0aW5nRW50cnkucHJvdmlkZXJEYXRhID0gb3B0aW9ucy5wcm92aWRlckRhdGE7XG5cdFx0XHRcdGV4aXN0aW5nRW50cnkuZHJhZnQgPSBvcHRpb25zLmRyYWZ0O1xuXHRcdFx0XHRleGlzdGluZ0VudHJ5LnJlc29sdmVyID0gb3B0aW9ucy5yZXNvbHZlcjtcblx0XHRcdH1cblx0XHRcdHJldHVybiBleGlzdGluZztcblx0XHR9XG5cdFx0Y29uc3QgY2hhdFN1bW1hcnk6IENoYXRTdW1tYXJ5ID0ge1xuXHRcdFx0Li4uY3JlYXRlRGVmYXVsdENoYXRTdW1tYXJ5KHRoaXMuX3RvU3VtbWFyeShzZXNzaW9uLCBlbnRyeSksIGNoYXRVcmkpLFxuXHRcdFx0dGl0bGU6IG9wdGlvbnMudGl0bGUgPz8gJycsXG5cdFx0XHRzdGF0dXM6IFNlc3Npb25TdGF0dXMuSWRsZSxcblx0XHRcdC8vIEEgcGVyc2lzdGVkIGNhdGFsb2cgZW50cnkgd2l0aCBubyByZWNvcmRlZCBvcmlnaW4gaXMgYSBwbGFpblxuXHRcdFx0Ly8gdXNlci1jcmVhdGVkIGNoYXQ7IGtlZXAgdGhlIGRlZmF1bHQgcmF0aGVyIHRoYW4gcmVzdG9yaW5nIGl0XG5cdFx0XHQvLyB3aXRob3V0IHByb3ZlbmFuY2UuXG5cdFx0XHQuLi4ob3B0aW9ucy5vcmlnaW4gPyB7IG9yaWdpbjogb3B0aW9ucy5vcmlnaW4gfSA6IHt9KSxcblx0XHRcdGludGVyYWN0aXZpdHk6IG9wdGlvbnMuaW50ZXJhY3Rpdml0eSxcblx0XHR9O1xuXHRcdHNlc3Npb25TdGF0ZS5jaGF0cyA9IFsuLi5zZXNzaW9uU3RhdGUuY2hhdHMsIGNoYXRTdW1tYXJ5XTtcblx0XHR0aGlzLl9jaGF0RW50cmllcy5zZXQoY2hhdFVyaSwge1xuXHRcdFx0c2Vzc2lvbixcblx0XHRcdHN1bW1hcnk6IGNoYXRTdW1tYXJ5LFxuXHRcdFx0cHJvdmlkZXJEYXRhOiBvcHRpb25zLnByb3ZpZGVyRGF0YSxcblx0XHRcdGRyYWZ0OiBvcHRpb25zLmRyYWZ0LFxuXHRcdFx0cmVzb2x2ZXI6IG9wdGlvbnMucmVzb2x2ZXIsXG5cdFx0XHR2YWxpZDogdHJ1ZSxcblx0XHR9KTtcblx0XHRyZXR1cm4gY2hhdFN1bW1hcnk7XG5cdH1cblxuXHQvKipcblx0ICogUmVtb3ZlcyBhbiBhZGRpdGlvbmFsIGNoYXQgZnJvbSBhIHNlc3Npb24uIERlbGV0ZXMgaXRzXG5cdCAqIHtAbGluayBDaGF0U3RhdGV9LCBkaXNwYXRjaGVzIHtAbGluayBBY3Rpb25UeXBlLlNlc3Npb25DaGF0UmVtb3ZlZH0sIGFuZFxuXHQgKiBcdTIwMTQgaWYgdGhlIHJlbW92ZWQgY2hhdCB3YXMgdGhlIGRlZmF1bHQgXHUyMDE0IHJlcG9pbnRzIGBkZWZhdWx0Q2hhdGAgdG8gdGhlXG5cdCAqIGZpcnN0IHJlbWFpbmluZyBjaGF0LiBUaGUgZGVmYXVsdCBjaGF0IGl0c2VsZiBjYW5ub3QgYmUgcmVtb3ZlZCBpblxuXHQgKiBpc29sYXRpb247IGl0IGxpdmVzIGFuZCBkaWVzIHdpdGggaXRzIHNlc3Npb24uXG5cdCAqL1xuXHRyZW1vdmVDaGF0KHNlc3Npb246IFVSSSwgY2hhdFVyaTogVVJJKTogdm9pZCB7XG5cdFx0Y29uc3QgZW50cnkgPSB0aGlzLl9zZXNzaW9uU3RhdGVzLmdldChzZXNzaW9uKTtcblx0XHRpZiAoIWVudHJ5IHx8ICFlbnRyeS5zdGF0ZS5jaGF0cy5zb21lKGMgPT4gYy5yZXNvdXJjZSA9PT0gY2hhdFVyaSkpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0Y29uc3Qgc2Vzc2lvblN0YXRlID0gZW50cnkuc3RhdGU7XG5cdFx0aWYgKGNoYXRVcmkgPT09IHNlc3Npb25TdGF0ZS5kZWZhdWx0Q2hhdCB8fCBpc0RlZmF1bHRDaGF0VXJpKGNoYXRVcmkpKSB7XG5cdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLndhcm4oYFtBZ2VudEhvc3RTdGF0ZU1hbmFnZXJdIHJlZnVzaW5nIHRvIHJlbW92ZSBkZWZhdWx0IGNoYXQ6ICR7Y2hhdFVyaX1gKTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0Ly8gRHJvcCB0aGUgY2hhdCBmcm9tIGl0cyBzZXNzaW9uJ3MgYWN0aXZlLXR1cm4gc2V0IGJlZm9yZSBkZWxldGluZyBpdHNcblx0XHQvLyBzdGF0ZS4gQSBwZWVyIGNoYXQgY2FuIGJlIHJlbW92ZWQgd2hpbGUgaXQgc3RpbGwgaGFzIGFuIGFjdGl2ZSB0dXJuO1xuXHRcdC8vIGJlY2F1c2UgYWN0aXZlLXR1cm4gdHJhY2tpbmcgaXMgZHJpdmVuIGJ5IGNoYXQgc3RhdGUgdHJhbnNpdGlvbnMsXG5cdFx0Ly8gZGVsZXRpbmcgdGhlIENoYXRTdGF0ZSBoZXJlIHdpdGhvdXQgdGhpcyB3b3VsZCBzdHJhbmQgdGhlIGNoYXQgVVJJIGluXG5cdFx0Ly8gdGhlIGFjdGl2ZSBzZXQgZm9yZXZlciwga2VlcGluZyB0aGUgc2Vzc2lvbiBwZXJtYW5lbnRseSBcImFjdGl2ZVwiXG5cdFx0Ly8gKGFjdGl2ZVNlc3Npb25zID4gMCkgYW5kIGxlYXZpbmcgY2hhbmdlc2V0IG9wZXJhdGlvbnMgZGlzYWJsZWQuXG5cdFx0dGhpcy5fcmVtb3ZlQ2hhdEFjdGl2ZVR1cm4oc2Vzc2lvbiwgY2hhdFVyaSk7XG5cdFx0dGhpcy5faW52YWxpZGF0ZUNoYXRFbnRyeShjaGF0VXJpKTtcblx0XHR0aGlzLmRpc3BhdGNoU2VydmVyQWN0aW9uKHNlc3Npb24sIHsgdHlwZTogQWN0aW9uVHlwZS5TZXNzaW9uQ2hhdFJlbW92ZWQsIGNoYXQ6IGNoYXRVcmkgfSk7XG5cdH1cblxuXHQvKipcblx0ICogSW52YWxpZGF0ZXMgcmVzdG9yZWQgY2hhdCByZXNvbHV0aW9uIGJlZm9yZSBhIHNlc3Npb24ncyBhc3luY2hyb25vdXNcblx0ICogdGVhcmRvd24gc3RhcnRzLiBTZXNzaW9uIHJlbW92YWwgc3Vic2VxdWVudGx5IGRyb3BzIHRoZSBlbnRyaWVzIGVudGlyZWx5LlxuXHQgKi9cblx0aW52YWxpZGF0ZVNlc3Npb25DaGF0UmVzb2x1dGlvbnMoc2Vzc2lvbjogVVJJKTogdm9pZCB7XG5cdFx0Zm9yIChjb25zdCBlbnRyeSBvZiB0aGlzLl9jaGF0RW50cmllcy52YWx1ZXMoKSkge1xuXHRcdFx0aWYgKGVudHJ5LnNlc3Npb24gPT09IHNlc3Npb24pIHtcblx0XHRcdFx0ZW50cnkudmFsaWQgPSBmYWxzZTtcblx0XHRcdH1cblx0XHR9XG5cdH1cblxuXHQvKipcblx0ICogUmVuYW1lcyBhIHNpbmdsZSBjaGF0IHdpdGhpbiBhIHNlc3Npb24gaW5kZXBlbmRlbnRseSBvZiB0aGUgc2Vzc2lvblxuXHQgKiB0aXRsZS4gVXBkYXRlcyB0aGUgY2hhdCdzIGF1dGhvcml0YXRpdmUge0BsaW5rIENoYXRTdGF0ZX0gdGl0bGUgKHNvXG5cdCAqIGxhdGVyIGBjaGF0U3VtbWFyeUZyb21TdGF0ZWAgcHJvamVjdGlvbnMgc3RheSBjb25zaXN0ZW50KSBhbmQgZGlzcGF0Y2hlc1xuXHQgKiBhIHtAbGluayBBY3Rpb25UeXBlLlNlc3Npb25DaGF0VXBkYXRlZH0gc28gdGhlIHNlc3Npb24ncyBjYXRhbG9nIGVudHJ5IGFuZFxuXHQgKiBsaXZlIHN1YnNjcmliZXJzIHJlZmxlY3QgdGhlIG5ldyB0aXRsZS4gV29ya3MgZm9yIHRoZSBkZWZhdWx0IGNoYXQgdG9vIFx1MjAxNFxuXHQgKiBnaXZpbmcgaXQgYSBub24tZW1wdHkgdGl0bGUgdGhhdCBubyBsb25nZXIgaW5oZXJpdHMgdGhlIHNlc3Npb24gdGl0bGUuXG5cdCAqL1xuXHR1cGRhdGVDaGF0VGl0bGUoc2Vzc2lvbjogVVJJLCBjaGF0VXJpOiBVUkksIHRpdGxlOiBzdHJpbmcpOiB2b2lkIHtcblx0XHRjb25zdCBjaGF0U3RhdGUgPSB0aGlzLl9jaGF0RW50cmllcy5nZXQoY2hhdFVyaSk/LnN0YXRlO1xuXHRcdGlmIChjaGF0U3RhdGUpIHtcblx0XHRcdGNvbnN0IGVudHJ5ID0gdGhpcy5fY2hhdEVudHJpZXMuZ2V0KGNoYXRVcmkpITtcblx0XHRcdGVudHJ5LnN0YXRlID0geyAuLi5jaGF0U3RhdGUsIHRpdGxlIH07XG5cdFx0fVxuXHRcdHRoaXMuZGlzcGF0Y2hTZXJ2ZXJBY3Rpb24oc2Vzc2lvbiwgeyB0eXBlOiBBY3Rpb25UeXBlLlNlc3Npb25DaGF0VXBkYXRlZCwgY2hhdDogY2hhdFVyaSwgY2hhbmdlczogeyB0aXRsZSB9IH0pO1xuXHR9XG5cblx0LyoqXG5cdCAqIFJlbW92ZXMgYSBzZXNzaW9uIGZyb20gaW4tbWVtb3J5IHN0YXRlIHdpdGhvdXQgZW1pdHRpbmcgYVxuXHQgKiB7QGxpbmsgTm90aWZpY2F0aW9uVHlwZS5TZXNzaW9uUmVtb3ZlZH0gbm90aWZpY2F0aW9uLlxuXHQgKiBVc2Uge0BsaW5rIGRlbGV0ZVNlc3Npb259IHdoZW4gdGhlIHNlc3Npb24gaXMgYmVpbmcgcGVybWFuZW50bHkgZGVsZXRlZFxuXHQgKiBhbmQgY2xpZW50cyBuZWVkIHRvIGJlIG5vdGlmaWVkIG9mIGl0cyByZW1vdmFsLlxuXHQgKlxuXHQgKiBBbnkgcGVuZGluZyBzdW1tYXJ5IGNoYW5nZSBpcyBmbHVzaGVkIHN5bmNocm9ub3VzbHkgYmVmb3JlIHRoZSBzZXNzaW9uIGlzXG5cdCAqIHRvcm4gZG93biwgc28gY2xpZW50cyByZWNlaXZlIHRoZSBmaW5hbCBzdGF0dXMgKGUuZy4gSWRsZSBhZnRlciBhIHR1cm5cblx0ICogY29tcGxldGVzKSBldmVuIHdoZW4gdGhlIHNlc3Npb24gaXMgZXZpY3RlZCBiZWZvcmUgdGhlIHNjaGVkdWxlciBmaXJlcy5cblx0ICogQSB7QGxpbmsgTm90aWZpY2F0aW9uVHlwZS5TZXNzaW9uU3VtbWFyeUNoYW5nZWR9IG5vdGlmaWNhdGlvbiBtYXkgdGhlcmVmb3JlXG5cdCAqIGJlIGVtaXR0ZWQgYXMgYSBzaWRlLWVmZmVjdCBvZiB0aGlzIGNhbGwuXG5cdCAqXG5cdCAqIFBlci1zZXNzaW9uIGNoYW5nZXNldHMgYXJlIGludGVudGlvbmFsbHkgTk9UIHRvcm4gZG93biBoZXJlOiB0aGlzIG1ldGhvZFxuXHQgKiBpcyBhbHNvIHVzZWQgYXMgYW4gaWRsZS1ldmljdGlvbiAoTFJVKSBob29rIChzZWVcblx0ICogYEFnZW50U2VydmljZS5fbWF5YmVFdmljdElkbGVTZXNzaW9uYCkgYW5kIHRoZSBzZXNzaW9uIGxpc3QgdmlldyBrZWVwcyBhXG5cdCAqIGNoYW5nZXNldCBzdWJzY3JpcHRpb24gb3BlbiBwZXIgdmlzaWJsZSByb3cgdG8gcmVuZGVyIHRoZSBkaWZmIGNoaXAuXG5cdCAqIFRlYXJpbmcgZG93biBvbiBldmljdGlvbiB3b3VsZCBjbGVhciB0aGUgY2hpcCBvbiB0aGUgbGlzdCB3aGlsZSB0aGUgcm93XG5cdCAqIGlzIHN0aWxsIG9uIHNjcmVlbi4gUGVybWFuZW50LWRlbGV0ZSBwYXRocyAoYGRlbGV0ZVNlc3Npb25gLFxuXHQgKiBgcmVtb3ZlU3ViYWdlbnRTZXNzaW9uc2ApIGNhbGwgYGRpc3Bvc2VTZXNzaW9uQ2hhbmdlc2V0c2AgZXhwbGljaXRseVxuXHQgKiBiZWZvcmUgaW52b2tpbmcgYHJlbW92ZVNlc3Npb25gLlxuXHQgKi9cblx0cmVtb3ZlU2Vzc2lvbihzZXNzaW9uOiBVUkkpOiB2b2lkIHtcblx0XHRjb25zdCBlbnRyeSA9IHRoaXMuX3Nlc3Npb25TdGF0ZXMuZ2V0KHNlc3Npb24pO1xuXHRcdGlmICghZW50cnkpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0dGhpcy5pbnZhbGlkYXRlU2Vzc2lvbkNoYXRSZXNvbHV0aW9ucyhzZXNzaW9uKTtcblxuXHRcdC8vIEZsdXNoIGFueSBwZW5kaW5nIHN1bW1hcnkgbm90aWZpY2F0aW9uIGJlZm9yZSB0ZWFyaW5nIGRvd24gc3RhdGUgc29cblx0XHQvLyB0aGF0IHRoZSBmaW5hbCBzdGF0dXMgKGUuZy4gSWRsZSkgcmVhY2hlcyBjbGllbnRzIGV2ZW4gaWYgdGhlIHNlc3Npb25cblx0XHQvLyBpcyBldmljdGVkIHdpdGhpbiB0aGUgc2NoZWR1bGVyJ3MgZGVib3VuY2Ugd2luZG93LlxuXHRcdGlmICh0aGlzLl9zdW1tYXJ5Tm90aWZpZXIuaXNEaXJ0eShzZXNzaW9uKSkge1xuXHRcdFx0dGhpcy5fc3VtbWFyeU5vdGlmaWVyLmZsdXNoKHNlc3Npb24pO1xuXHRcdH1cblxuXHRcdC8vIENsZWFuIHVwIGFjdGl2ZSB0dXJuIHRyYWNraW5nLiBXZSBtdXN0IGRpc3BhdGNoXG5cdFx0Ly8gYFJvb3RBY3RpdmVTZXNzaW9uc0NoYW5nZWRgIGlmIHRoZSBjb3VudCBhY3R1YWxseSBjaGFuZ2VzIHNvIHRoYXRcblx0XHQvLyBkb3duc3RyZWFtIGNvbnN1bWVycyAoZS5nLiB0aGUgc2VydmVyIGxpZmV0aW1lIHRyYWNrZXIgZHJpdmluZ1xuXHRcdC8vIGAtLWVuYWJsZS1yZW1vdGUtYXV0by1zaHV0ZG93bmApIHJlbGVhc2UgdGhlaXIgaG9sZCBvbiB0aGUgcHJvY2Vzcy5cblx0XHQvLyBXaXRob3V0IHRoaXMsIGV2aWN0aW5nIGEgc2Vzc2lvbiB0aGF0IHN0aWxsIGhhcyBhbiBhY3RpdmUgdHVyblxuXHRcdC8vIHNpbGVudGx5IHN0cmFuZHMgdGhlIGFjdGl2ZS1zZXNzaW9ucyBjb3VudCBhYm92ZSB6ZXJvIGZvcmV2ZXIuXG5cdFx0aWYgKHRoaXMuX3Nlc3Npb25zV2l0aEFjdGl2ZVR1cm4uZGVsZXRlKHNlc3Npb24pKSB7XG5cdFx0XHR0aGlzLl9vbkRpZENoYW5nZVNlc3Npb25BY3RpdmVUdXJuLmZpcmUoeyBzZXNzaW9uLCBhY3RpdmU6IGZhbHNlIH0pO1xuXHRcdFx0dGhpcy5kaXNwYXRjaFNlcnZlckFjdGlvbihST09UX1NUQVRFX1VSSSwgeyB0eXBlOiBBY3Rpb25UeXBlLlJvb3RBY3RpdmVTZXNzaW9uc0NoYW5nZWQsIGFjdGl2ZVNlc3Npb25zOiB0aGlzLl9zZXNzaW9uc1dpdGhBY3RpdmVUdXJuLnNpemUgfSk7XG5cdFx0fVxuXG5cdFx0Ly8gVGVhciBkb3duIGV2ZXJ5IGNoYXQgb3duZWQgYnkgdGhlIHNlc3Npb24sIG5vdCBqdXN0IHRoZSBkZWZhdWx0XG5cdFx0Ly8gY2hhdDogYWRkaXRpb25hbCBwZWVyIGNoYXRzIGVhY2ggaG9sZCB0aGVpciBvd24gQ2hhdFN0YXRlLlxuXHRcdGZvciAoY29uc3QgY2hhdCBvZiBlbnRyeS5zdGF0ZS5jaGF0cykge1xuXHRcdFx0dGhpcy5faW52YWxpZGF0ZUNoYXRFbnRyeShjaGF0LnJlc291cmNlKTtcblx0XHR9XG5cdFx0dGhpcy5faW52YWxpZGF0ZUNoYXRFbnRyeShidWlsZERlZmF1bHRDaGF0VXJpKHNlc3Npb24pKTtcblx0XHR0aGlzLl9zZXNzaW9uU3RhdGVzLmRlbGV0ZShzZXNzaW9uKTtcblx0XHR0aGlzLl9zdW1tYXJ5Tm90aWZpZXIucmVtb3ZlKHNlc3Npb24pO1xuXHRcdHRoaXMuX2xvZ1NlcnZpY2UudHJhY2UoYFtBZ2VudEhvc3RTdGF0ZU1hbmFnZXJdIFJlbW92ZWQgc2Vzc2lvbjogJHtzZXNzaW9ufWApO1xuXHR9XG5cblx0LyoqXG5cdCAqIFBlcm1hbmVudGx5IGRlbGV0ZXMgYSBzZXNzaW9uIGZyb20gc3RhdGUgYW5kIGVtaXRzIGFcblx0ICoge0BsaW5rIE5vdGlmaWNhdGlvblR5cGUuU2Vzc2lvblJlbW92ZWR9IG5vdGlmaWNhdGlvbiBzbyB0aGF0IGNsaWVudHNcblx0ICoga25vdyB0aGUgc2Vzc2lvbiBpcyBubyBsb25nZXIgYWNjZXNzaWJsZS5cblx0ICpcblx0ICogU2Vzc2lvbnMgd2hvc2UgY3JlYXRpb24gd2FzIGRlZmVycmVkIHZpYVxuXHQgKiBgY3JlYXRlU2Vzc2lvbih7IGVtaXROb3RpZmljYXRpb246IGZhbHNlIH0pYCBhbmQgbmV2ZXIgcGVyc2lzdGVkIHZpYVxuXHQgKiB7QGxpbmsgbWFya1Nlc3Npb25QZXJzaXN0ZWR9IGFyZSByZW1vdmVkIHNpbGVudGx5IFx1MjAxNCBubyBjbGllbnQga25vd3Ncblx0ICogYWJvdXQgdGhlbSwgc28gYSBgU2Vzc2lvblJlbW92ZWRgIHdvdWxkIGJlIG5vaXNlIChvciB3b3JzZSwgd291bGRcblx0ICogY2F1c2UgY2xpZW50cyB0byBkcm9wIGEgc2Vzc2lvbiBVUkkgdGhleSBoYWQgZWFnZXJseSBzdWJzY3JpYmVkIHRvKS5cblx0ICovXG5cdGRlbGV0ZVNlc3Npb24oc2Vzc2lvbjogVVJJKTogdm9pZCB7XG5cdFx0Y29uc3Qgd2FzQW5ub3VuY2VkID0gdGhpcy5fc3VtbWFyeU5vdGlmaWVyLmlzQW5ub3VuY2VkKHNlc3Npb24pO1xuXHRcdC8vIERyb3AgYW55IHBlbmRpbmcgc3VtbWFyeSBkaWZmOiB0aGUgZm9ydGhjb21pbmcgU2Vzc2lvblJlbW92ZWQgbm90aWZpY2F0aW9uXG5cdFx0Ly8gc3VwZXJzZWRlcyBpdCBhbmQgd2UgZG9uJ3Qgd2FudCB0byBlbWl0IHNwdXJpb3VzIFNlc3Npb25TdW1tYXJ5Q2hhbmdlZFxuXHRcdC8vIGV2ZW50cyBqdXN0IGJlZm9yZSB0aGUgc2Vzc2lvbiBkaXNhcHBlYXJzIGZyb20gdGhlIGNsaWVudCdzIHZpZXcuXG5cdFx0dGhpcy5fc3VtbWFyeU5vdGlmaWVyLmNsZWFyRGlydHkoc2Vzc2lvbik7XG5cdFx0Ly8gVGVhciBkb3duIHBlci1zZXNzaW9uIGNoYW5nZXNldHMgZmlyc3Qgc28gc3Vic2NyaWJlcnMgc2VlIHRoZVxuXHRcdC8vIGZpbmFsIGBjaGFuZ2VzZXQvY2xlYXJlZGAgZW52ZWxvcGUgYmVmb3JlIHRoZSBzZXNzaW9uIGl0c2VsZiBnb2VzXG5cdFx0Ly8gYXdheS4gVGhlIGVudmVsb3BlcyBmbG93IHRocm91Z2ggdGhlIHNhbWUgZW1pdHRlciBhcyBldmVyeXRoaW5nXG5cdFx0Ly8gZWxzZSwgc28gY2FsbGVycyBvYnNlcnZpbmcgYG9uRGlkRW1pdEVudmVsb3BlYCBnZXQgYSBkZXRlcm1pbmlzdGljXG5cdFx0Ly8gb3JkZXI6IGNoYW5nZXNldC9jbGVhcmVkIChwZXIgY2hhbmdlc2V0KSBcdTIxOTIgc2Vzc2lvbiByZW1vdmFsLlxuXHRcdHRoaXMuZGlzcG9zZVNlc3Npb25DaGFuZ2VzZXRzKHNlc3Npb24pO1xuXHRcdHRoaXMuZGlzcG9zZVNlc3Npb25Bbm5vdGF0aW9ucyhzZXNzaW9uKTtcblx0XHR0aGlzLnJlbW92ZVNlc3Npb24oc2Vzc2lvbik7XG5cdFx0aWYgKHdhc0Fubm91bmNlZCkge1xuXHRcdFx0dGhpcy5fb25EaWRFbWl0Tm90aWZpY2F0aW9uLmZpcmUoe1xuXHRcdFx0XHR0eXBlOiAncm9vdC9zZXNzaW9uUmVtb3ZlZCcsXG5cdFx0XHRcdGNoYW5uZWw6IFJPT1RfU1RBVEVfVVJJLFxuXHRcdFx0XHRzZXNzaW9uLFxuXHRcdFx0fSk7XG5cdFx0fVxuXHR9XG5cblx0Ly8gLS0tLSBTZXNzaW9uIG1ldGEgLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuXG5cdC8qKlxuXHQgKiBSZXBsYWNlcyBgc3RhdGUuX21ldGFgIG9uIGEgc2Vzc2lvbiBieSBkaXNwYXRjaGluZyBhXG5cdCAqIHtAbGluayBBY3Rpb25UeXBlLlNlc3Npb25NZXRhQ2hhbmdlZH0gYWN0aW9uIHNvIHRoZSBjaGFuZ2UgZmxvd3Ncblx0ICogdGhyb3VnaCB0aGUgYWN0aW9uIGVudmVsb3BlIChhbmQgdGh1cyB0byBhbGwgbGl2ZSBzdWJzY3JpYmVycykuXG5cdCAqXG5cdCAqIFRoZSBmdWxsIGBfbWV0YWAgb2JqZWN0IGlzIHJlcGxhY2VkIChub3QgbWVyZ2VkKSBzbyBjYWxsZXJzIHN0YXkgaW5cblx0ICogY29udHJvbCBvZiB0aGUgY29udmVudGlvbiBmb3IgdGhlaXIgb3duIGtleXM7IHVzZSB0aGUgYHdpdGhTZXNzaW9uWHh4YFxuXHQgKiBoZWxwZXJzIGluIGBzZXNzaW9uU3RhdGUudHNgIHRvIGNvbWJpbmUgc2xvdHMuXG5cdCAqL1xuXHRzZXRTZXNzaW9uTWV0YShzZXNzaW9uOiBVUkksIG1ldGE6IFNlc3Npb25NZXRhIHwgdW5kZWZpbmVkKTogdm9pZCB7XG5cdFx0dGhpcy5kaXNwYXRjaFNlcnZlckFjdGlvbihzZXNzaW9uLCB7IHR5cGU6IEFjdGlvblR5cGUuU2Vzc2lvbk1ldGFDaGFuZ2VkLCBfbWV0YTogbWV0YSB9KTtcblx0fVxuXG5cdC8qKlxuXHQgKiBTZWVkcyBvciByZXBsYWNlcyBhIHNlc3Npb24ncyByZXNvbHZlZCB7QGxpbmsgU2Vzc2lvbkNvbmZpZ1N0YXRlfSBvbiB0aGVcblx0ICogbGl2ZSBzZXNzaW9uIHN0YXRlLiBVbmxpa2UgbWlkLXNlc3Npb24ge0BsaW5rIEFjdGlvblR5cGUuU2Vzc2lvbkNvbmZpZ0NoYW5nZWR9XG5cdCAqIHVwZGF0ZXMgKHdoaWNoIG1lcmdlIHZhbHVlcyBvbnRvIGFuIGV4aXN0aW5nIGNvbmZpZyksIHRoaXMgZXN0YWJsaXNoZXNcblx0ICogdGhlIGluaXRpYWwgY29uZmlnIGFuZCBpcyB0aGVyZWZvcmUgYW4gaW4tcGxhY2UgbXV0YXRpb24gb2YgdGhlXG5cdCAqIGF1dGhvcml0YXRpdmUgc3RhdGUgb2JqZWN0IHNvIHRoZSB2YWx1ZSBpcyBwcmVzZW50IGluIHRoZSBmaXJzdCBzbmFwc2hvdFxuXHQgKiBhIHN1YnNjcmliZXIgcmVjZWl2ZXMuIFVzZSB0aGlzIGZyb20gY3JlYXRlL3Jlc3RvcmUgZmxvd3Mgd2hlcmUgdGhlXG5cdCAqIGNvbmZpZyBpcyByZXNvbHZlZCBhc3luY2hyb25vdXNseSBhZnRlciB0aGUgc2Vzc2lvbiBzdGF0ZSBhbHJlYWR5IGV4aXN0c1xuXHQgKiBpbiB0aGUgbWFwIFx1MjAxNCByZWFkaW5nIGJhY2sgdGhyb3VnaCB7QGxpbmsgZ2V0U2Vzc2lvblN0YXRlfSB3b3VsZCByZXR1cm4gYVxuXHQgKiBkZXRhY2hlZCBjb21wb3NpdGUgY29weSBhbmQgc3RyYW5kaW5nIHRoZSBtdXRhdGlvbiB0aGVyZS5cblx0ICovXG5cdHNldFNlc3Npb25Db25maWcoc2Vzc2lvbjogVVJJLCBjb25maWc6IFNlc3Npb25Db25maWdTdGF0ZSB8IHVuZGVmaW5lZCk6IHZvaWQge1xuXHRcdGNvbnN0IGVudHJ5ID0gdGhpcy5fc2Vzc2lvblN0YXRlcy5nZXQoc2Vzc2lvbik7XG5cdFx0aWYgKCFlbnRyeSkge1xuXHRcdFx0dGhpcy5fbG9nU2VydmljZS53YXJuKGBbQWdlbnRIb3N0U3RhdGVNYW5hZ2VyXSBzZXRTZXNzaW9uQ29uZmlnOiB1bmtub3duIHNlc3Npb24gJHtzZXNzaW9ufWApO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRlbnRyeS5zdGF0ZS5jb25maWcgPSBjb25maWc7XG5cdH1cblxuXHQvKipcblx0ICogU2VlZHMgb3IgcmVwbGFjZXMgdGhlIHNlc3Npb24ncyBlZmZlY3RpdmUgY3VzdG9taXphdGlvbnMgZGlyZWN0bHkgb24gdGhlXG5cdCAqIGF1dGhvcml0YXRpdmUgaW4tbWVtb3J5IHN0YXRlLiBVc2VkIGJ5IGNyZWF0ZS9yZXN0b3JlIGZsb3dzIHRvIGVuc3VyZSB0aGVcblx0ICogZmlyc3Qgc25hcHNob3QgYWxyZWFkeSBjb250YWlucyBjdXN0b21pemF0aW9ucy5cblx0ICovXG5cdHNldFNlc3Npb25DdXN0b21pemF0aW9ucyhzZXNzaW9uOiBVUkksIGN1c3RvbWl6YXRpb25zOiByZWFkb25seSBDdXN0b21pemF0aW9uW10gfCB1bmRlZmluZWQpOiB2b2lkIHtcblx0XHRjb25zdCBlbnRyeSA9IHRoaXMuX3Nlc3Npb25TdGF0ZXMuZ2V0KHNlc3Npb24pO1xuXHRcdGlmICghZW50cnkpIHtcblx0XHRcdHRoaXMuX2xvZ1NlcnZpY2Uud2FybihgW0FnZW50SG9zdFN0YXRlTWFuYWdlcl0gc2V0U2Vzc2lvbkN1c3RvbWl6YXRpb25zOiB1bmtub3duIHNlc3Npb24gJHtzZXNzaW9ufWApO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRlbnRyeS5zdGF0ZS5jdXN0b21pemF0aW9ucyA9IGN1c3RvbWl6YXRpb25zID8gWy4uLmN1c3RvbWl6YXRpb25zXSA6IHVuZGVmaW5lZDtcblx0fVxuXG5cdC8vIC0tLS0gQ2hhbmdlc2V0IHJlZ2lzdHJ5IC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cblxuXHQvKipcblx0ICogUmVnaXN0ZXJzIGEgc2VydmVyLXNpZGUgY2hhbmdlc2V0IHNvIHRoYXQgc3Vic2NyaWJlcnMgY2FuIGF0dGFjaCB0byBpdHNcblx0ICogVVJJLiBUaGUgY2hhbmdlc2V0IGlzIGNyZWF0ZWQgd2l0aCB0aGUgc3VwcGxpZWQgaW5pdGlhbCBzdGF0dXMgKGRlZmF1bHRcblx0ICoge0BsaW5rIENoYW5nZXNldFN0YXR1cy5Db21wdXRpbmd9KTsgc3Vic2VxdWVudCBmaWxlL29wZXJhdGlvbi9zdGF0dXNcblx0ICogbXV0YXRpb25zIGZsb3cgdGhyb3VnaCB7QGxpbmsgZGlzcGF0Y2hDaGFuZ2VzZXRBY3Rpb259IG9uIHRoZVxuXHQgKiBjYW5vbmljYWwgYDxzZXNzaW9uVXJpPi9jaGFuZ2VzZXQvPGNoYW5nZXNldElkPmAgVVJJLlxuXHQgKlxuXHQgKiBJZGVtcG90ZW50OiBhIHNlY29uZCBjYWxsIHdpdGggdGhlIHNhbWUgVVJJIGlzIGEgbm8tb3Agc28gcHJvZHVjZXJzXG5cdCAqIGNhbiBzYWZlbHkgcmUtcmVnaXN0ZXIgb24gc2Vzc2lvbiByZXN1bWUgd2l0aG91dCBkb3VibGUtY3JlYXRpbmdcblx0ICogc3RhdGUuXG5cdCAqXG5cdCAqIENhbGxlcnMgY29uc3RydWN0IGBjaGFuZ2VzZXRVcmlgIHZpYSB7QGxpbmsgYnVpbGRTZXNzaW9uQ2hhbmdlc2V0VXJpfVxuXHQgKiBmb3IgdGhlIHNlc3Npb24td2lkZSBlbnRyeSwgb3Ige0BsaW5rIGJ1aWxkQ2hhbmdlc2V0VXJpfSBmb3IgYW55XG5cdCAqIG90aGVyIGNhdGFsb2d1ZSBlbnRyeS5cblx0ICpcblx0ICogUmV0dXJucyB0aGUgc3VwcGxpZWQgY2hhbmdlc2V0IFVSSSBmb3IgY2FsbGVyIGNvbnZlbmllbmNlLlxuXHQgKi9cblx0cmVnaXN0ZXJDaGFuZ2VzZXQoY2hhbmdlc2V0VXJpOiBVUkksIGluaXRpYWxTdGF0dXM6IENoYW5nZXNldFN0YXR1cyA9IENoYW5nZXNldFN0YXR1cy5Db21wdXRpbmcpOiBVUkkge1xuXHRcdHRoaXMuX2NoYW5nZXNldHMucmVnaXN0ZXIoY2hhbmdlc2V0VXJpLCBpbml0aWFsU3RhdHVzKTtcblx0XHRyZXR1cm4gY2hhbmdlc2V0VXJpO1xuXHR9XG5cblx0LyoqXG5cdCAqIFVwZGF0ZXMgdGhlIGFnZ3JlZ2F0ZSBgY2hhbmdlc2AgZm9yIGEgc2Vzc2lvbi5cblx0ICpcblx0ICogVGhlcmUgaXMgbm8gZGVkaWNhdGVkIGFjdGlvbiBmb3IgdGhpcyBmaWVsZDogdGhlIHZhbHVlIGlzIHB1cmVseVxuXHQgKiBpbmZvcm1hdGlvbmFsIChjaGlwIHJlbmRlcmluZyBvbiB0aGUgc2Vzc2lvbiBsaXN0KSwgc28gdGhlIHdyaXRlXG5cdCAqIHBpZ2d5YmFja3Mgb24gdGhlIGV4aXN0aW5nIGBzZXNzaW9uU3VtbWFyeUNoYW5nZWRgIG5vdGlmaWNhdGlvblxuXHQgKiBwYXRoLiBXZSB1cGRhdGUgdGhlIHNlc3Npb24gZW50cnksIG1hcmsgdGhlIHNlc3Npb24gZGlydHksIGFuZCBsZXRcblx0ICogdGhlIHN1bW1hcnkgbm90aWZpZXIncyBmbHVzaCBwaWNrIHRoZSBuZXcgdmFsdWUgdXAgdmlhIGl0c1xuXHQgKiBgY3VycmVudC5jaGFuZ2VzICE9PSBsYXN0Tm90aWZpZWQuY2hhbmdlc2AgZGlmZi5cblx0ICovXG5cdHNldFNlc3Npb25TdW1tYXJ5Q2hhbmdlcyhzZXNzaW9uOiBVUkksIGNoYW5nZXM6IENoYW5nZXNTdW1tYXJ5IHwgdW5kZWZpbmVkKTogdm9pZCB7XG5cdFx0Y29uc3QgZW50cnkgPSB0aGlzLl9zZXNzaW9uU3RhdGVzLmdldChzZXNzaW9uKTtcblx0XHRpZiAoIWVudHJ5KSB7XG5cdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLndhcm4oYFtBZ2VudEhvc3RTdGF0ZU1hbmFnZXJdIHNldFNlc3Npb25TdW1tYXJ5Q2hhbmdlczogdW5rbm93biBzZXNzaW9uICR7c2Vzc2lvbn1gKTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0aWYgKHN0cnVjdHVyYWxFcXVhbHMoZW50cnkuY2hhbmdlcywgY2hhbmdlcykpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRlbnRyeS5jaGFuZ2VzID0gY2hhbmdlcztcblxuXHRcdHRoaXMuX3N1bW1hcnlOb3RpZmllci5tYXJrRGlydHkoc2Vzc2lvbik7XG5cdH1cblxuXHQvKipcblx0ICogUmVwbGFjZXMgdGhlIGNhdGFsb2d1ZSBlbnRyaWVzIG9uIGBzdGF0ZS5jaGFuZ2VzZXRzYCBmb3IgYHNlc3Npb25gIGJ5XG5cdCAqIGRpc3BhdGNoaW5nIGEge0BsaW5rIEFjdGlvblR5cGUuU2Vzc2lvbkNoYW5nZXNldHNDaGFuZ2VkfSBhY3Rpb24uXG5cdCAqIFN1YnNjcmliZXJzIHNlZSB0aGUgbXV0YXRpb24gaW4gdGhlIHN0YW5kYXJkIHNlc3Npb24gYWN0aW9uIHN0cmVhbSBcdTIwMTRcblx0ICogdGhlIGNhdGFsb2d1ZSBsaXZlcyBvbiBzZXNzaW9uIHN0YXRlIGFuZCBpcyBub3QgaXRzIG93biBzdWJzY3JpYmFibGVcblx0ICogcmVzb3VyY2UuIEFnZ3JlZ2F0ZSBgY2hhbmdlc2AgY291bnRzIChhZGRpdGlvbnMgLyBkZWxldGlvbnMgL1xuXHQgKiBmaWxlcykgYXJlIHByb3BhZ2F0ZWQgc2VwYXJhdGVseSB2aWEge0BsaW5rIHNldFNlc3Npb25TdW1tYXJ5Q2hhbmdlc30uXG5cdCAqXG5cdCAqIFByb2R1Y2VycyBjYWxsIHRoaXMgYWZ0ZXIgZWFjaCBjb21wdXRlIHBhc3MgdG8ga2VlcCB0aGUgbGlzdCBvZlxuXHQgKiBhdmFpbGFibGUgY2hhbmdlc2V0cyAod2l0aCB0aGVpciBgY2hhbmdlS2luZGApIGluIHN5bmMgc28gb2JzZXJ2ZXJzXG5cdCAqIGNhbiByZW5kZXIgdGhlIGNvcnJlY3QgZW50cmllcyB3aXRob3V0IHN1YnNjcmliaW5nIHRvIGVhY2ggb25lLlxuXHQgKi9cblx0c2V0U2Vzc2lvbkNoYW5nZXNldHMoc2Vzc2lvbjogVVJJLCBjaGFuZ2VzZXRzOiByZWFkb25seSBDaGFuZ2VzZXRbXSB8IHVuZGVmaW5lZCk6IHZvaWQge1xuXHRcdGNvbnN0IGVudHJ5ID0gdGhpcy5fc2Vzc2lvblN0YXRlcy5nZXQoc2Vzc2lvbik7XG5cdFx0aWYgKCFlbnRyeSkge1xuXHRcdFx0dGhpcy5fbG9nU2VydmljZS53YXJuKGBbQWdlbnRIb3N0U3RhdGVNYW5hZ2VyXSBzZXRTZXNzaW9uQ2hhbmdlc2V0czogdW5rbm93biBzZXNzaW9uICR7c2Vzc2lvbn1gKTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0Y29uc3Qgc3RhdGUgPSBlbnRyeS5zdGF0ZTtcblxuXHRcdC8vIFNraXAgZGlzcGF0Y2ggd2hlbiB0aGUgY2F0YWxvZ3VlIGlzIGZpZWxkLWVxdWFsIHRvIHRoZSBleGlzdGluZyBvbmUuXG5cdFx0Ly8gUHJvZHVjZXJzIGNhbGwgdGhpcyBhZnRlciBldmVyeSBjb21wdXRlIHBhc3MsIHNvIGR1cGxpY2F0ZSBjYWxsc1xuXHRcdC8vIGFyZSBjb21tb24gYW5kIHdvdWxkIG90aGVyd2lzZSBicm9hZGNhc3QgYSByZWR1bmRhbnQgZW52ZWxvcGUgdG9cblx0XHQvLyBldmVyeSBzdWJzY3JpYmVyLlxuXHRcdGlmIChhcnJheUVxdWFscyhzdGF0ZS5jaGFuZ2VzZXRzID8/IFtdLCBjaGFuZ2VzZXRzID8/IFtdLCBzdHJ1Y3R1cmFsRXF1YWxzKSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHQvLyBUYWtlIGEgZGVmZW5zaXZlIGNvcHkgc28gY2FsbGVycyBjYW4ndCBtdXRhdGUgdGhlIGNhdGFsb2d1ZSBhcnJheVxuXHRcdC8vIGFmdGVyIGRpc3BhdGNoOyB0aGUgcmVkdWNlciBvdGhlcndpc2Ugc3RvcmVzIHRoZSByZWZlcmVuY2UgYXMtaXMuXG5cdFx0Y29uc3QgbmV4dCA9IGNoYW5nZXNldHMgPyBjaGFuZ2VzZXRzLnNsaWNlKCkgOiB1bmRlZmluZWQ7XG5cdFx0dGhpcy5kaXNwYXRjaFNlcnZlckFjdGlvbihzZXNzaW9uLCB7XG5cdFx0XHR0eXBlOiBBY3Rpb25UeXBlLlNlc3Npb25DaGFuZ2VzZXRzQ2hhbmdlZCxcblx0XHRcdGNoYW5nZXNldHM6IG5leHQsXG5cdFx0fSk7XG5cdH1cblxuXHQvKipcblx0ICogVGVhciBkb3duIGEgY2hhbmdlc2V0LiBEaXNwYXRjaGVzIHtAbGluayBBY3Rpb25UeXBlLkNoYW5nZXNldENsZWFyZWR9XG5cdCAqIHNvIHN1YnNjcmliZXJzIHNlZSBhbiBlbXB0eSBmaWxlIGxpc3QsIHRoZW4gZGVsZXRlcyB0aGUgbG9jYWwgc3RhdGVcblx0ICogc28gYSBmcmVzaCBgZ2V0Q2hhbmdlc2V0U3RhdGVgIHJldHVybnMgYHVuZGVmaW5lZGAgYW5kIGZvcmNlcyB0aGVcblx0ICogcHJvZHVjZXIgdG8gcmUtY3JlYXRlIHRoZSBjaGFuZ2VzZXQgb24gbmV4dCBzdWJzY3JpYmUuXG5cdCAqXG5cdCAqIFBlciB0aGUgc3BlYywgdGhlIHNlcnZlciBTSE9VTEQgYWxzbyB1bnN1YnNjcmliZSBpdHMgY2xpZW50cyBhZnRlclxuXHQgKiBkaXNwYXRjaGluZyB0aGlzIGFjdGlvbjsgZm9yIFZTIENvZGUtaW50ZXJuYWwgY2xpZW50cyB0aGF0IGhhcHBlbnNcblx0ICogdmlhIHRoZSBgbm90aWZ5L3Nlc3Npb25SZW1vdmVkYCBub3RpZmljYXRpb24sIHdoaWNoIHRoZSB3b3JrYmVuY2gtc2lkZVxuXHQgKiBwcm92aWRlciBjb3JyZWxhdGVzIHRvIHJlbGVhc2UgYW55IGhlbGQgc3Vic2NyaXB0aW9ucy5cblx0ICpcblx0ICogU2FmZSB0byBjYWxsIGZvciBhIFVSSSB0aGF0IHdhcyBuZXZlciByZWdpc3RlcmVkOiBwcm9kdWNlcnMgdHlwaWNhbGx5XG5cdCAqIGl0ZXJhdGUgb3ZlciBhIGNhbmRpZGF0ZSBzZXQgb24gc2Vzc2lvbiBkaXNwb3NhbCBhbmQgZW1pdCBkaXNwb3NlXG5cdCAqIGFjdGlvbnMgZGVmZW5zaXZlbHkuXG5cdCAqL1xuXHRkaXNwb3NlQ2hhbmdlc2V0KGNoYW5nZXNldDogVVJJKTogdm9pZCB7XG5cdFx0aWYgKCF0aGlzLl9jaGFuZ2VzZXRzLmhhcyhjaGFuZ2VzZXQpKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdHRoaXMuZGlzcGF0Y2hTZXJ2ZXJBY3Rpb24oY2hhbmdlc2V0LCB7XG5cdFx0XHR0eXBlOiBBY3Rpb25UeXBlLkNoYW5nZXNldENsZWFyZWQsXG5cdFx0fSk7XG5cdFx0dGhpcy5fY2hhbmdlc2V0cy5kZWxldGUoY2hhbmdlc2V0KTtcblx0fVxuXG5cdC8qKlxuXHQgKiBEaXNwb3NlcyBldmVyeSBjaGFuZ2VzZXQgd2hvc2UgVVJJIGlzIG5lc3RlZCB1bmRlciBgc2Vzc2lvbmAgKGkuZS5cblx0ICogbWF0Y2hlcyBgPHNlc3Npb24+L2NoYW5nZXNldC8uLi5gKS4gVXNlZCB0byBjYXNjYWRlIGNsZWFudXAgd2hlbiBhXG5cdCAqIHNlc3Npb24gaXRzZWxmIGlzIHJlbW92ZWQuXG5cdCAqL1xuXHRkaXNwb3NlU2Vzc2lvbkNoYW5nZXNldHMoc2Vzc2lvbjogVVJJKTogdm9pZCB7XG5cdFx0Ly8gQ29sbGVjdCBmaXJzdCBiZWNhdXNlIGBkaXNwb3NlQ2hhbmdlc2V0YCBtdXRhdGVzIHRoZSB1bmRlcmx5aW5nXG5cdFx0Ly8gbWFwIHZpYSBpdHMgZW52ZWxvcGUgaGFuZGxlci5cblx0XHRjb25zdCB0b0Rpc3Bvc2U6IFVSSVtdID0gW107XG5cdFx0Zm9yIChjb25zdCB1cmkgb2YgdGhpcy5fY2hhbmdlc2V0cy5rZXlzKCkpIHtcblx0XHRcdGNvbnN0IHBhcnNlZCA9IHBhcnNlQ2hhbmdlc2V0VXJpKHVyaSk7XG5cdFx0XHRpZiAocGFyc2VkICYmIHBhcnNlZC5zZXNzaW9uVXJpID09PSBzZXNzaW9uKSB7XG5cdFx0XHRcdHRvRGlzcG9zZS5wdXNoKHVyaSk7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdGZvciAoY29uc3QgdXJpIG9mIHRvRGlzcG9zZSkge1xuXHRcdFx0dGhpcy5kaXNwb3NlQ2hhbmdlc2V0KHVyaSk7XG5cdFx0fVxuXHR9XG5cblx0LyoqXG5cdCAqIERyb3BzIHRoZSBhbm5vdGF0aW9uIHN0YXRlIG5lc3RlZCB1bmRlciBgc2Vzc2lvbmAgKGkuZS4gdGhlXG5cdCAqIGA8c2Vzc2lvbj4vYW5ub3RhdGlvbnNgIGNoYW5uZWwpLiBVc2VkIHRvIGNhc2NhZGUgY2xlYW51cCB3aGVuIGFcblx0ICogc2Vzc2lvbiBpdHNlbGYgaXMgcmVtb3ZlZC4gU3Vic2NyaXB0aW9ucyBhcmUgcmVsZWFzZWQgdmlhIHRoZVxuXHQgKiBmb3J0aGNvbWluZyBgc2Vzc2lvblJlbW92ZWRgIG5vdGlmaWNhdGlvbi5cblx0ICovXG5cdGRpc3Bvc2VTZXNzaW9uQW5ub3RhdGlvbnMoc2Vzc2lvbjogVVJJKTogdm9pZCB7XG5cdFx0dGhpcy5fYW5ub3RhdGlvbnMuZGVsZXRlKGJ1aWxkQW5ub3RhdGlvbnNVcmkoc2Vzc2lvbikpO1xuXHR9XG5cblx0Ly8gLS0tLSBUdXJuIHRyYWNraW5nIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuXG5cdC8qKlxuXHQgKiBSZWdpc3RlcnMgYSBtYXBwaW5nIGZyb20gdHVybklkIHRvIHNlc3Npb24gVVJJIHNvIHRoYXQgaW5jb21pbmdcblx0ICogcHJvdmlkZXIgZXZlbnRzICh3aGljaCBjYXJyeSBvbmx5IHNlc3Npb24gVVJJKSBjYW4gYmUgYXNzb2NpYXRlZFxuXHQgKiB3aXRoIHRoZSBjb3JyZWN0IGFjdGl2ZSB0dXJuLlxuXHQgKi9cblx0Z2V0QWN0aXZlVHVybklkKHNlc3Npb25PckNoYXQ6IFVSSSk6IHN0cmluZyB8IHVuZGVmaW5lZCB7XG5cdFx0Y29uc3QgY2hhdFVyaSA9IGlzQWhwQ2hhdENoYW5uZWwoc2Vzc2lvbk9yQ2hhdCkgPyBzZXNzaW9uT3JDaGF0IDogYnVpbGREZWZhdWx0Q2hhdFVyaShzZXNzaW9uT3JDaGF0KTtcblx0XHRyZXR1cm4gdGhpcy5fY2hhdEVudHJpZXMuZ2V0KGNoYXRVcmkpPy5zdGF0ZT8uYWN0aXZlVHVybj8uaWQ7XG5cdH1cblxuXHQvLyAtLS0tIEFjdGlvbiBkaXNwYXRjaCAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG5cblx0LyoqXG5cdCAqIERpc3BhdGNoIGEgc2VydmVyLW9yaWdpbmF0ZWQgYWN0aW9uIChmcm9tIHRoZSBhZ2VudCBiYWNrZW5kKS5cblx0ICogVGhlIGFjdGlvbiBpcyBhcHBsaWVkIHRvIHN0YXRlIHZpYSB0aGUgcmVkdWNlciBhbmQgZW1pdHRlZCBhcyBhblxuXHQgKiBlbnZlbG9wZSB3aXRoIG5vIG9yaWdpbiAoc2VydmVyLXByb2R1Y2VkKS5cblx0ICpcblx0ICogYGNoYW5uZWxgIGlkZW50aWZpZXMgdGhlIGNoYW5uZWwgdGhlIGFjdGlvbiB0YXJnZXRzIFx1MjAxNCBgUk9PVF9TVEFURV9VUklgXG5cdCAqIGZvciByb290IGFjdGlvbnMsIGEgc2Vzc2lvbiBVUkkgZm9yIHNlc3Npb24gYWN0aW9ucywgYSB0ZXJtaW5hbCBVUklcblx0ICogZm9yIHRlcm1pbmFsIGFjdGlvbnMsIGFuIGV4cGFuZGVkIGNoYW5nZXNldCBVUkkgZm9yIGNoYW5nZXNldCBhY3Rpb25zLlxuXHQgKi9cblx0ZGlzcGF0Y2hTZXJ2ZXJBY3Rpb24oY2hhbm5lbDogVVJJLCBhY3Rpb246IFN0YXRlQWN0aW9uKTogdm9pZCB7XG5cdFx0dGhpcy5fYXBwbHlBbmRFbWl0KGNoYW5uZWwsIGFjdGlvbiwgdW5kZWZpbmVkKTtcblx0fVxuXG5cdC8qKlxuXHQgKiBEaXNwYXRjaCBhIGNsaWVudC1vcmlnaW5hdGVkIGFjdGlvbiAod3JpdGUtYWhlYWQgZnJvbSBhIHJlbmRlcmVyKS5cblx0ICogVGhlIGFjdGlvbiBpcyBhcHBsaWVkIHRvIHN0YXRlIGFuZCBlbWl0dGVkIHdpdGggdGhlIGNsaWVudCdzIG9yaWdpblxuXHQgKiBzbyB0aGUgb3JpZ2luYXRpbmcgY2xpZW50IGNhbiByZWNvbmNpbGUuXG5cdCAqL1xuXHRkaXNwYXRjaENsaWVudEFjdGlvbihjaGFubmVsOiBVUkksIGFjdGlvbjogU2Vzc2lvbkFjdGlvbiB8IENoYXRBY3Rpb24gfCBUZXJtaW5hbEFjdGlvbiB8IENsaWVudENoYW5nZXNldEFjdGlvbiB8IENsaWVudEFubm90YXRpb25zQWN0aW9uIHwgSVJvb3RDb25maWdDaGFuZ2VkQWN0aW9uLCBvcmlnaW46IEFjdGlvbk9yaWdpbiwgY2xpZW50Q29udGV4dD86IElBZ2VudEhvc3RDbGllbnRUZWxlbWV0cnlDb250ZXh0KTogdW5rbm93biB7XG5cdFx0cmV0dXJuIHRoaXMuX2FwcGx5QW5kRW1pdChjaGFubmVsLCBhY3Rpb24sIG9yaWdpbiwgY2xpZW50Q29udGV4dCk7XG5cdH1cblxuXHQvKipcblx0ICogUmVqZWN0IGEgY2xpZW50LW9yaWdpbmF0ZWQgYWN0aW9uIHdpdGhvdXQgYXBwbHlpbmcgaXQgdG8gc3RhdGUuIEVtaXRzIGFuXG5cdCAqIHtAbGluayBBY3Rpb25FbnZlbG9wZX0gdGhhdCBjYXJyaWVzIHRoZSBvcmlnaW5hbCB7QGxpbmsgQWN0aW9uT3JpZ2lufSBhbmQgYVxuXHQgKiB7QGxpbmsgQWN0aW9uRW52ZWxvcGUucmVqZWN0aW9uUmVhc29uIHwgcmVqZWN0aW9uUmVhc29ufSBzbyB0aGUgb3JpZ2luYXRpbmdcblx0ICogY2xpZW50IGNhbiByZWNvbmNpbGUgKHJvbGwgYmFjaykgaXRzIG9wdGltaXN0aWMgd3JpdGUtYWhlYWQgYWN0aW9uIHRocm91Z2hcblx0ICogdGhlIG5vcm1hbCBwYXRoIGluc3RlYWQgb2YgbGVhdmluZyBpdCBwZW5kaW5nIHVudGlsIHJlY29ubmVjdC4gVGhlIHJlZHVjZXJcblx0ICogaXMgZGVsaWJlcmF0ZWx5IE5PVCBydW4sIHNvIG5vIHN5bmNocm9uaXplZCBzdGF0ZSBjaGFuZ2VzLlxuXHQgKi9cblx0cmVqZWN0Q2xpZW50QWN0aW9uKGNoYW5uZWw6IFVSSSwgYWN0aW9uOiBTdGF0ZUFjdGlvbiwgb3JpZ2luOiBBY3Rpb25PcmlnaW4sIHJlYXNvbjogc3RyaW5nKTogdm9pZCB7XG5cdFx0Y29uc3QgZW52ZWxvcGU6IEFjdGlvbkVudmVsb3BlID0ge1xuXHRcdFx0Y2hhbm5lbCxcblx0XHRcdGFjdGlvbixcblx0XHRcdHNlcnZlclNlcTogKyt0aGlzLl9zZXJ2ZXJTZXEsXG5cdFx0XHRvcmlnaW4sXG5cdFx0XHRyZWplY3Rpb25SZWFzb246IHJlYXNvbixcblx0XHR9O1xuXHRcdHRoaXMuX2xvZ1NlcnZpY2UudHJhY2UoYFtBZ2VudEhvc3RTdGF0ZU1hbmFnZXJdIEVtaXR0aW5nIHJlamVjdGlvbiBlbnZlbG9wZTogc2VxPSR7ZW52ZWxvcGUuc2VydmVyU2VxfSwgY2hhbm5lbD0ke2VudmVsb3BlLmNoYW5uZWx9LCB0eXBlPSR7YWN0aW9uLnR5cGV9LCBvcmlnaW49JHtvcmlnaW4uY2xpZW50SWR9OiR7b3JpZ2luLmNsaWVudFNlcX0sIHJlYXNvbj0ke3JlYXNvbn1gKTtcblx0XHR0aGlzLl9vbkRpZEVtaXRFbnZlbG9wZS5maXJlKGVudmVsb3BlKTtcblx0fVxuXG5cdC8vIC0tLS0gSW50ZXJuYWwgLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cblxuXHRwcml2YXRlIF9pbnZhbGlkYXRlQ2hhdEVudHJ5KGNoYXQ6IFVSSSk6IHZvaWQge1xuXHRcdGNvbnN0IGVudHJ5ID0gdGhpcy5fY2hhdEVudHJpZXMuZ2V0KGNoYXQpO1xuXHRcdGlmIChlbnRyeSkge1xuXHRcdFx0ZW50cnkudmFsaWQgPSBmYWxzZTtcblx0XHRcdHRoaXMuX2NoYXRFbnRyaWVzLmRlbGV0ZShjaGF0KTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIF9zeW5jaHJvbml6ZUNoYXRFbnRyaWVzKHNlc3Npb246IFVSSSwgc3VtbWFyaWVzOiByZWFkb25seSBDaGF0U3VtbWFyeVtdKTogdm9pZCB7XG5cdFx0Y29uc3QgZXhwZWN0ZWQgPSBuZXcgU2V0KHN1bW1hcmllcy5tYXAoc3VtbWFyeSA9PiBzdW1tYXJ5LnJlc291cmNlKSk7XG5cdFx0Zm9yIChjb25zdCBzdW1tYXJ5IG9mIHN1bW1hcmllcykge1xuXHRcdFx0Y29uc3QgZXhpc3RpbmcgPSB0aGlzLl9jaGF0RW50cmllcy5nZXQoc3VtbWFyeS5yZXNvdXJjZSk7XG5cdFx0XHRpZiAoZXhpc3RpbmcpIHtcblx0XHRcdFx0ZXhpc3Rpbmcuc3VtbWFyeSA9IHN1bW1hcnk7XG5cdFx0XHRcdGlmIChleGlzdGluZy5zdGF0ZSkge1xuXHRcdFx0XHRcdGV4aXN0aW5nLnN0YXRlID0geyAuLi5leGlzdGluZy5zdGF0ZSwgLi4uc3VtbWFyeSB9O1xuXHRcdFx0XHR9XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHR0aGlzLl9jaGF0RW50cmllcy5zZXQoc3VtbWFyeS5yZXNvdXJjZSwge1xuXHRcdFx0XHRcdHNlc3Npb24sXG5cdFx0XHRcdFx0c3VtbWFyeSxcblx0XHRcdFx0XHR2YWxpZDogdHJ1ZSxcblx0XHRcdFx0fSk7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdGZvciAoY29uc3QgW2NoYXQsIGVudHJ5XSBvZiB0aGlzLl9jaGF0RW50cmllcykge1xuXHRcdFx0aWYgKGVudHJ5LnNlc3Npb24gPT09IHNlc3Npb24gJiYgIWV4cGVjdGVkLmhhcyhjaGF0KSkge1xuXHRcdFx0XHR0aGlzLl9pbnZhbGlkYXRlQ2hhdEVudHJ5KGNoYXQpO1xuXHRcdFx0fVxuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgX2FwcGx5QW5kRW1pdChjaGFubmVsOiBVUkksIGFjdGlvbjogU3RhdGVBY3Rpb24sIG9yaWdpbjogQWN0aW9uT3JpZ2luIHwgdW5kZWZpbmVkLCBjbGllbnRDb250ZXh0PzogSUFnZW50SG9zdENsaWVudFRlbGVtZXRyeUNvbnRleHQpOiB1bmtub3duIHtcblx0XHRsZXQgcmVzdWx0aW5nU3RhdGU6IHVua25vd24gPSB1bmRlZmluZWQ7XG5cdFx0aWYgKGFjdGlvbi50eXBlID09PSBBY3Rpb25UeXBlLlJvb3RDb25maWdDaGFuZ2VkICYmIGFjdGlvbi5yZXBsYWNlKSB7XG5cdFx0XHRhY3Rpb24gPSB7XG5cdFx0XHRcdC4uLmFjdGlvbixcblx0XHRcdFx0Y29uZmlnOiBwcmVzZXJ2ZVByb3ZpZGVyQmFja2VkUm9vdENvbmZpZ1ZhbHVlcyh0aGlzLl9yb290U3RhdGUsIGFjdGlvbi5jb25maWcpLFxuXHRcdFx0fTtcblx0XHR9XG5cdFx0Ly8gQXBwbHkgdG8gc3RhdGVcblx0XHRpZiAoaXNSb290QWN0aW9uKGFjdGlvbikpIHtcblx0XHRcdC8vIGBSb290Q29uZmlnQ2hhbmdlZGAgY2FuIGJlIGEgdHJ1ZSBuby1vcDogdGhlIHJlZHVjZXIgbWVyZ2VzL3JlcGxhY2VzXG5cdFx0XHQvLyB2YWx1ZXMgZXZlbiB3aGVuIHRoZSBwYXRjaCBtYXRjaGVzIHRoZSBjdXJyZW50IHN0YXRlLCBhbmQgcmUtZW1pdHRpbmdcblx0XHRcdC8vIGl0IHdvdWxkIGNhdXNlIGNsaWVudHMgb2JzZXJ2aW5nIHJvb3RTdGF0ZS5vbkRpZENoYW5nZSB0byByZWFjdCBhbmRcblx0XHRcdC8vIHBvdGVudGlhbGx5IHJlLWRpc3BhdGNoIGluIGEgbG9vcC4gQ2hlY2sgdGhlIGFjdGlvbidzIG93biBwYXRjaFxuXHRcdFx0Ly8gYWdhaW5zdCBjdXJyZW50IHZhbHVlcyBiZWZvcmUgcnVubmluZyB0aGUgcmVkdWNlciBzbyB3ZSBhdm9pZFxuXHRcdFx0Ly8gYWxsb2NhdGluZyBhIG5ldyBzdGF0ZSBvYmplY3QgYXQgYWxsLlxuXHRcdFx0aWYgKGFjdGlvbi50eXBlID09PSBBY3Rpb25UeXBlLlJvb3RDb25maWdDaGFuZ2VkICYmIHRoaXMuX3Jvb3RTdGF0ZS5jb25maWcpIHtcblx0XHRcdFx0Y29uc3QgY3VycmVudCA9IHRoaXMuX3Jvb3RTdGF0ZS5jb25maWcudmFsdWVzO1xuXHRcdFx0XHRjb25zdCBwYXRjaCA9IGFjdGlvbi5jb25maWc7XG5cdFx0XHRcdGNvbnN0IGlzTm9PcCA9IGFjdGlvbi5yZXBsYWNlXG5cdFx0XHRcdFx0PyBlcXVhbHMoY3VycmVudCwgcGF0Y2gpXG5cdFx0XHRcdFx0OiBlcXVhbHMoeyAuLi5jdXJyZW50LCAuLi5wYXRjaCB9LCBjdXJyZW50KTtcblx0XHRcdFx0aWYgKGlzTm9PcCkge1xuXHRcdFx0XHRcdHJldHVybiB0aGlzLl9yb290U3RhdGU7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHRcdHRoaXMuX3Jvb3RTdGF0ZSA9IHJvb3RSZWR1Y2VyKHRoaXMuX3Jvb3RTdGF0ZSwgYWN0aW9uIGFzIFJvb3RBY3Rpb24sIHRoaXMuX2xvZyk7XG5cdFx0XHRyZXN1bHRpbmdTdGF0ZSA9IHRoaXMuX3Jvb3RTdGF0ZTtcblx0XHR9XG5cblx0XHRpZiAoaXNTZXNzaW9uQWN0aW9uKGFjdGlvbikpIHtcblx0XHRcdGNvbnN0IHNlc3Npb25BY3Rpb24gPSBhY3Rpb24gYXMgU2Vzc2lvbkFjdGlvbjtcblx0XHRcdGNvbnN0IGtleSA9IGNoYW5uZWw7XG5cdFx0XHRjb25zdCBlbnRyeSA9IHRoaXMuX3Nlc3Npb25TdGF0ZXMuZ2V0KGtleSk7XG5cdFx0XHRpZiAoZW50cnkpIHtcblx0XHRcdFx0Y29uc3QgcHJldmlvdXNTdGF0ZSA9IGVudHJ5LnN0YXRlO1xuXHRcdFx0XHRjb25zdCBuZXdTdGF0ZSA9IHNlc3Npb25SZWR1Y2VyKHByZXZpb3VzU3RhdGUsIHNlc3Npb25BY3Rpb24sIHRoaXMuX2xvZyk7XG5cdFx0XHRcdGNvbnN0IHN1bW1hcnlDaGFuZ2VkID0gIXRoaXMuX3N1bW1hcnlGaWVsZHNFcXVhbChwcmV2aW91c1N0YXRlLCBuZXdTdGF0ZSk7XG5cdFx0XHRcdGVudHJ5LnN0YXRlID0gbmV3U3RhdGU7XG5cdFx0XHRcdHRoaXMuX3N5bmNocm9uaXplQ2hhdEVudHJpZXMoa2V5LCBuZXdTdGF0ZS5jaGF0cyk7XG5cblx0XHRcdFx0aWYgKHByZXZpb3VzU3RhdGUudGl0bGUgIT09IG5ld1N0YXRlLnRpdGxlKSB7XG5cdFx0XHRcdFx0dGhpcy5fb25EaWRDaGFuZ2VTZXNzaW9uVGl0bGUuZmlyZSh7IHNlc3Npb246IGtleSwgdGl0bGU6IG5ld1N0YXRlLnRpdGxlIH0pO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGlmIChzZXNzaW9uQWN0aW9uLnR5cGUgPT09IEFjdGlvblR5cGUuU2Vzc2lvbkNvbmZpZ0NoYW5nZWQpIHtcblx0XHRcdFx0XHR0aGlzLl9vbkRpZENoYW5nZVNlc3Npb25Db25maWcuZmlyZSh7IHNlc3Npb246IGtleSwgcHJldmlvdXM6IHByZXZpb3VzU3RhdGUuY29uZmlnLCBjdXJyZW50OiBuZXdTdGF0ZS5jb25maWcsIGNsaWVudENvbnRleHQgfSk7XG5cdFx0XHRcdH1cblx0XHRcdFx0Ly8gVGhlIHJlZHVjZXIgcmV0dXJucyB0aGUgU0FNRSBzdGF0ZSBvYmplY3Qgd2hlbiBhIHdvcmtpbmctZGlyZWN0b3J5XG5cdFx0XHRcdC8vIGFjdGlvbiBpcyBhIG5vLW9wLCBzbyBhIHJlZmVyZW5jZSBjaGFuZ2UgaGVyZSBtZWFucyB0aGUgZWZmZWN0aXZlXG5cdFx0XHRcdC8vIHNldCBhY3R1YWxseSBjaGFuZ2VkLiBNdWx0aS1yb290IG9wZXJhdGlvbiBzdXBwcmVzc2lvbiAodHVybiAvXG5cdFx0XHRcdC8vIGNvbXBhcmUtdHVybnMpIGRlcGVuZHMgb24gdGhpcyBzZXQsIHNvIGNvbnN1bWVycyByZWZyZXNoIG9wZXJhdGlvbnMuXG5cdFx0XHRcdGlmIChwcmV2aW91c1N0YXRlLndvcmtpbmdEaXJlY3RvcmllcyAhPT0gbmV3U3RhdGUud29ya2luZ0RpcmVjdG9yaWVzKSB7XG5cdFx0XHRcdFx0dGhpcy5fb25EaWRDaGFuZ2VTZXNzaW9uV29ya2luZ0RpcmVjdG9yaWVzLmZpcmUoeyBzZXNzaW9uOiBrZXkgfSk7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHQvLyBXaGVuIHRoZSByZWR1Y2VyIHRvdWNoZWQgYSBzdW1tYXJ5LXJlbGV2YW50IGZpZWxkLCBub3RpZnlcblx0XHRcdFx0Ly8gcm9vdC1jaGFubmVsIGNsaWVudHMgb2YgdGhlIGRlcml2ZWQtc3VtbWFyeSBkZWx0YS5cblx0XHRcdFx0aWYgKHN1bW1hcnlDaGFuZ2VkKSB7XG5cdFx0XHRcdFx0dGhpcy5fc3VtbWFyeU5vdGlmaWVyLm1hcmtEaXJ0eShrZXkpO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0cmVzdWx0aW5nU3RhdGUgPSBuZXdTdGF0ZTtcblx0XHRcdH0gZWxzZSBpZiAoIWlzQWhwQ2hhdENoYW5uZWwoa2V5KSkge1xuXHRcdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLndhcm4oYFtBZ2VudEhvc3RTdGF0ZU1hbmFnZXJdIEFjdGlvbiBmb3IgdW5rbm93biBzZXNzaW9uOiAke2tleX0sIHR5cGU9JHthY3Rpb24udHlwZX1gKTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRpZiAoaXNDaGF0QWN0aW9uKGFjdGlvbikpIHtcblx0XHRcdGlmICghaXNBaHBDaGF0Q2hhbm5lbChjaGFubmVsKSkge1xuXHRcdFx0XHR0aHJvdyBuZXcgRXJyb3IoYFtBZ2VudEhvc3RTdGF0ZU1hbmFnZXJdIENoYXQgYWN0aW9uIGRpc3BhdGNoZWQgdG8gbm9uLWNoYXQgY2hhbm5lbDogJHtjaGFubmVsfSwgdHlwZT0ke2FjdGlvbi50eXBlfWApO1xuXHRcdFx0fVxuXG5cdFx0XHRjb25zdCBjaGF0QWN0aW9uID0gYWN0aW9uIGFzIENoYXRBY3Rpb247XG5cdFx0XHRjb25zdCBzZXNzaW9uS2V5ID0gcGFyc2VSZXF1aXJlZFNlc3Npb25VcmlGcm9tQ2hhdFVyaShjaGFubmVsKTtcblx0XHRcdGNvbnN0IGNoYXRFbnRyeSA9IHRoaXMuX2NoYXRFbnRyaWVzLmdldChjaGFubmVsKTtcblx0XHRcdGNvbnN0IGNoYXQgPSBjaGF0RW50cnk/LnN0YXRlO1xuXHRcdFx0aWYgKGNoYXQgJiYgY2hhdEVudHJ5ICYmIHNlc3Npb25LZXkgIT09IHVuZGVmaW5lZCkge1xuXHRcdFx0XHRjb25zdCBuZXdDaGF0ID0gY2hhdFJlZHVjZXIoY2hhdCwgY2hhdEFjdGlvbiwgdGhpcy5fbG9nKTtcblx0XHRcdFx0Y2hhdEVudHJ5LnN0YXRlID0gbmV3Q2hhdDtcblx0XHRcdFx0dGhpcy5fb25DaGF0U3RhdGVDaGFuZ2VkKHNlc3Npb25LZXksIGNoYW5uZWwsIGNoYXQsIG5ld0NoYXQpO1xuXHRcdFx0XHRyZXN1bHRpbmdTdGF0ZSA9IG5ld0NoYXQ7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLndhcm4oYFtBZ2VudEhvc3RTdGF0ZU1hbmFnZXJdIEFjdGlvbiBmb3IgdW5rbm93biBjaGF0OiAke2NoYW5uZWx9LCB0eXBlPSR7YWN0aW9uLnR5cGV9YCk7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0aWYgKGlzQ2hhbmdlc2V0QWN0aW9uKGFjdGlvbikpIHtcblx0XHRcdGNvbnN0IGNoYW5nZXNldEFjdGlvbiA9IGFjdGlvbiBhcyBDaGFuZ2VzZXRBY3Rpb247XG5cdFx0XHRjb25zdCBrZXkgPSBjaGFubmVsO1xuXHRcdFx0Y29uc3Qgc3RhdGUgPSB0aGlzLl9jaGFuZ2VzZXRzLmdldChrZXkpO1xuXHRcdFx0aWYgKCFzdGF0ZSkge1xuXHRcdFx0XHQvLyBVbmtub3duIGNoYW5nZXNldDogbG9nIGFuZCBiYWlsIGJlZm9yZSBlbnZlbG9wZSBjcmVhdGlvbi5cblx0XHRcdFx0Ly8gUm91dGluZyB0aGUgYWN0aW9uIHRvIHN1YnNjcmliZXJzIChJc3N1ZSAxKSBtYWtlc1xuXHRcdFx0XHQvLyBvcnBoYW4gZW52ZWxvcGVzIGNsaWVudC12aXNpYmxlLCBzbyB3ZSBtdXN0IGRyb3AgdGhlbVxuXHRcdFx0XHQvLyBoZXJlIHJhdGhlciB0aGFuIGxldHRpbmcgdGhlbSBhZHZhbmNlIGBfc2VydmVyU2VxYC5cblx0XHRcdFx0dGhpcy5fbG9nU2VydmljZS53YXJuKGBbQWdlbnRIb3N0U3RhdGVNYW5hZ2VyXSBBY3Rpb24gZm9yIHVua25vd24gY2hhbmdlc2V0OiAke2tleX0sIHR5cGU9JHthY3Rpb24udHlwZX1gKTtcblx0XHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHRcdH1cblx0XHRcdGNvbnN0IG5ld1N0YXRlID0gY2hhbmdlc2V0UmVkdWNlcihzdGF0ZSwgY2hhbmdlc2V0QWN0aW9uLCB0aGlzLl9sb2cpO1xuXHRcdFx0aWYgKG5ld1N0YXRlICE9PSBzdGF0ZSkge1xuXHRcdFx0XHR0aGlzLl9jaGFuZ2VzZXRzLnNldChrZXksIG5ld1N0YXRlKTtcblx0XHRcdH1cblx0XHRcdHJlc3VsdGluZ1N0YXRlID0gbmV3U3RhdGU7XG5cdFx0fVxuXG5cdFx0aWYgKGlzQW5ub3RhdGlvbnNBY3Rpb24oYWN0aW9uKSkge1xuXHRcdFx0Y29uc3QgYW5ub3RhdGlvbnNBY3Rpb24gPSBhY3Rpb24gYXMgQW5ub3RhdGlvbnNBY3Rpb247XG5cdFx0XHRjb25zdCBrZXkgPSBjaGFubmVsO1xuXHRcdFx0Ly8gQW5ub3RhdGlvbnMgYXJlIGNsaWVudC1kaXNwYXRjaGFibGUgYW5kIGxhemlseSBjcmVhdGVkOiBzZWVkIGFuXG5cdFx0XHQvLyBlbXB0eSBzdGF0ZSBvbiBmaXJzdCB3cml0ZSByYXRoZXIgdGhhbiBkcm9wcGluZyB0aGUgYWN0aW9uLlxuXHRcdFx0Y29uc3Qgc3RhdGUgPSB0aGlzLl9hbm5vdGF0aW9ucy5nZXQoa2V5KSA/PyB7IGFubm90YXRpb25zOiBbXSB9O1xuXHRcdFx0Y29uc3QgbmV3U3RhdGUgPSBhbm5vdGF0aW9uc1JlZHVjZXIoc3RhdGUsIGFubm90YXRpb25zQWN0aW9uLCB0aGlzLl9sb2cpO1xuXHRcdFx0aWYgKG5ld1N0YXRlICE9PSBzdGF0ZSkge1xuXHRcdFx0XHR0aGlzLl9hbm5vdGF0aW9ucy5zZXQoa2V5LCBuZXdTdGF0ZSk7XG5cdFx0XHR9XG5cdFx0XHRyZXN1bHRpbmdTdGF0ZSA9IG5ld1N0YXRlO1xuXHRcdH1cblxuXHRcdC8vIEVtaXQgZW52ZWxvcGVcblx0XHRjb25zdCBlbnZlbG9wZTogQWN0aW9uRW52ZWxvcGUgPSB7XG5cdFx0XHRjaGFubmVsLFxuXHRcdFx0YWN0aW9uLFxuXHRcdFx0c2VydmVyU2VxOiArK3RoaXMuX3NlcnZlclNlcSxcblx0XHRcdG9yaWdpbixcblx0XHR9O1xuXG5cdFx0dGhpcy5fbG9nU2VydmljZS50cmFjZShgW0FnZW50SG9zdFN0YXRlTWFuYWdlcl0gRW1pdHRpbmcgZW52ZWxvcGU6IHNlcT0ke2VudmVsb3BlLnNlcnZlclNlcX0sIGNoYW5uZWw9JHtlbnZlbG9wZS5jaGFubmVsfSwgdHlwZT0ke2FjdGlvbi50eXBlfSR7b3JpZ2luID8gYCwgb3JpZ2luPSR7b3JpZ2luLmNsaWVudElkfToke29yaWdpbi5jbGllbnRTZXF9YCA6ICcnfWApO1xuXHRcdHRoaXMuX29uRGlkRW1pdEVudmVsb3BlLmZpcmUoZW52ZWxvcGUpO1xuXG5cdFx0cmV0dXJuIHJlc3VsdGluZ1N0YXRlO1xuXHR9XG5cblx0LyoqXG5cdCAqIFJlbW92ZXMgYSBzaW5nbGUgY2hhdCBmcm9tIGl0cyBzZXNzaW9uJ3MgYWN0aXZlLXR1cm4gc2V0LCBmaXJpbmcgdGhlXG5cdCAqIHNlc3Npb24tbGV2ZWwgYWN0aXZlIGZsaXAgKHtAbGluayBvbkRpZENoYW5nZVNlc3Npb25BY3RpdmVUdXJufSArXG5cdCAqIHtAbGluayBBY3Rpb25UeXBlLlJvb3RBY3RpdmVTZXNzaW9uc0NoYW5nZWR9KSB3aGVuIHRoaXMgY2xlYXJzIHRoZVxuXHQgKiBzZXNzaW9uJ3MgbGFzdCBhY3RpdmUgY2hhdC4gU2FmZSB0byBjYWxsIGZvciBjaGF0cyB0aGF0IGFyZW4ndCBjdXJyZW50bHlcblx0ICogdHJhY2tlZCBhcyBhY3RpdmUgXHUyMDE0IGl0IGlzIGEgbm8tb3AgaW4gdGhhdCBjYXNlLiBVc2VkIGJvdGggd2hlbiBhIHR1cm5cblx0ICogZW5kcyBhbmQgd2hlbiBhIGNoYXQgaXMgcmVtb3ZlZCBtaWQtdHVybiwgc28gdGhlIHNlc3Npb24gY2FuJ3QgYmVcblx0ICogc3RyYW5kZWQgYXMgcGVybWFuZW50bHkgXCJhY3RpdmVcIi5cblx0ICovXG5cdHByaXZhdGUgX3JlbW92ZUNoYXRBY3RpdmVUdXJuKHNlc3Npb25LZXk6IHN0cmluZywgY2hhdFVyaTogc3RyaW5nKTogdm9pZCB7XG5cdFx0Y29uc3QgYWN0aXZlQ2hhdHMgPSB0aGlzLl9zZXNzaW9uc1dpdGhBY3RpdmVUdXJuLmdldChzZXNzaW9uS2V5KTtcblx0XHRpZiAoIWFjdGl2ZUNoYXRzIHx8ICFhY3RpdmVDaGF0cy5kZWxldGUoY2hhdFVyaSkpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRpZiAoYWN0aXZlQ2hhdHMuc2l6ZSA9PT0gMCkge1xuXHRcdFx0dGhpcy5fc2Vzc2lvbnNXaXRoQWN0aXZlVHVybi5kZWxldGUoc2Vzc2lvbktleSk7XG5cdFx0XHR0aGlzLl9vbkRpZENoYW5nZVNlc3Npb25BY3RpdmVUdXJuLmZpcmUoeyBzZXNzaW9uOiBzZXNzaW9uS2V5LCBhY3RpdmU6IGZhbHNlIH0pO1xuXHRcdFx0dGhpcy5kaXNwYXRjaFNlcnZlckFjdGlvbihST09UX1NUQVRFX1VSSSwgeyB0eXBlOiBBY3Rpb25UeXBlLlJvb3RBY3RpdmVTZXNzaW9uc0NoYW5nZWQsIGFjdGl2ZVNlc3Npb25zOiB0aGlzLl9zZXNzaW9uc1dpdGhBY3RpdmVUdXJuLnNpemUgfSk7XG5cdFx0fVxuXHR9XG5cblx0LyoqXG5cdCAqIEJyaWRnZXMgYSBkZWZhdWx0LWNoYXQgc3RhdGUgdHJhbnNpdGlvbiBiYWNrIG9udG8gaXRzIG93bmluZyBzZXNzaW9uLlxuXHQgKlxuXHQgKiBUaGUgcHJvdG9jb2wgbW92ZWQgdHVybiBsaWZlY3ljbGUgKGFuZCB0aGVyZWZvcmUgdGhlIGRlcml2ZWRcblx0ICogYWN0aXZpdHkgc3RhdHVzKSBvbnRvIHRoZSBjaGF0IGNoYW5uZWwuIFRvIHByZXNlcnZlIFZTIENvZGUnc1xuXHQgKiBzaW5nbGUtY2hhdCBiZWhhdmlvdXIgd2U6XG5cdCAqICAtIHRyYWNrIGFjdGl2ZS10dXJuIHRyYW5zaXRpb25zIChkcml2aW5nIGBSb290QWN0aXZlU2Vzc2lvbnNDaGFuZ2VkYFxuXHQgKiAgICBhbmQgYGhhc0FjdGl2ZVNlc3Npb25zYCwgd2hpY2ggZ2F0ZSBgLS1lbmFibGUtcmVtb3RlLWF1dG8tc2h1dGRvd25gKSxcblx0ICogICAga2V5ZWQgYnkgdGhlIG93bmluZyBzZXNzaW9uIFVSSTtcblx0ICogIC0gbWlycm9yIHRoZSBjaGF0J3MgZGVub3JtYWxpemVkIGBzdGF0dXNgL2BhY3Rpdml0eWAvYG1vZGlmaWVkQXRgXG5cdCAqICAgIG9udG8gdGhlIHNlc3Npb24gc3VtbWFyeSBzbyB0aGUgc2Vzc2lvbiBsaXN0IHJlZmxlY3RzIHByb2dyZXNzO1xuXHQgKiAgLSBmb3J3YXJkIHRoZSBjaGF0J3Mgb3duIGBzdGF0dXNgIHRvIHRoZSBzZXNzaW9uIGBjaGF0c2AgY2F0YWxvZyAodmlhIGFcblx0ICogICAge0BsaW5rIEFjdGlvblR5cGUuU2Vzc2lvbkNoYXRVcGRhdGVkfSkgc28gcGVyLWNoYXQgdGFicyByZWZsZWN0IHRoYXRcblx0ICogICAgY2hhdCdzIHByb2dyZXNzLCBub3QganVzdCB0aGUgYWdncmVnYXRlZCBzZXNzaW9uIHN1bW1hcnk7IGFuZFxuXHQgKiAgLSBrZWVwIHRoZSBzZXNzaW9uJ3MgYGNoYXRzYCBjYXRhbG9nIGVudHJ5IGluIHN5bmMuXG5cdCAqL1xuXHRwcml2YXRlIF9vbkNoYXRTdGF0ZUNoYW5nZWQoc2Vzc2lvbktleTogc3RyaW5nLCBjaGF0VXJpOiBzdHJpbmcsIHByZXY6IENoYXRTdGF0ZSwgbmV4dDogQ2hhdFN0YXRlKTogdm9pZCB7XG5cdFx0Ly8gQW55IHR1cm4gYWN0aXZpdHkgcGVybWFuZW50bHkgcmV0aXJlcyB0aGUgc2Vzc2lvbidzIHVudXNlZC1kcmFmdFxuXHRcdC8vIHN0YXR1cywgc28gYSBsYXRlciB0cnVuY2F0ZS10by16ZXJvIGNhbm5vdCBtYWtlIGl0IGxvb2sgY29sbGVjdGFibGUuXG5cdFx0aWYgKG5leHQudHVybnMubGVuZ3RoID4gMCB8fCBuZXh0LmFjdGl2ZVR1cm4pIHtcblx0XHRcdHRoaXMuX21hcmtTZXNzaW9uVXNlZChzZXNzaW9uS2V5KTtcblx0XHR9XG5cdFx0Ly8gQWN0aXZlIHR1cm4gdHJhY2tpbmcgXHUyMDE0IGRlcml2ZSBmcm9tIHRoZSByZWR1Y2VyJ3MgdmlldyBvZiBzdGF0ZSxcblx0XHQvLyBuZXZlciBmcm9tIHJhdyBhY3Rpb24gdHVybi1pZHMsIHNvIG91dC1vZi1vcmRlciBsaWZlY3ljbGUgYWN0aW9uc1xuXHRcdC8vIGNhbid0IGRlc3luYyB0aGUgY291bnQgZnJvbSByZWFsaXR5LiBUcmFjayBhY3RpdmUgdHVybnMgcGVyIGNoYXQgc28gYVxuXHRcdC8vIHNlc3Npb24gc3RheXMgYWN0aXZlIHVudGlsIEFMTCBvZiBpdHMgY29uY3VycmVudCBjaGF0IHR1cm5zIGZpbmlzaDtcblx0XHQvLyBvbmx5IG5vdGlmeSB3aGVuIHRoZSBzZXNzaW9uJ3Mgb3ZlcmFsbCBhY3RpdmUgc3RhdGUgYWN0dWFsbHkgZmxpcHMuXG5cdFx0Y29uc3QgaGFkQWN0aXZlID0gISFwcmV2LmFjdGl2ZVR1cm47XG5cdFx0Y29uc3QgaGFzQWN0aXZlID0gISFuZXh0LmFjdGl2ZVR1cm47XG5cdFx0aWYgKGhhZEFjdGl2ZSAhPT0gaGFzQWN0aXZlKSB7XG5cdFx0XHRpZiAoaGFzQWN0aXZlKSB7XG5cdFx0XHRcdGxldCBhY3RpdmVDaGF0cyA9IHRoaXMuX3Nlc3Npb25zV2l0aEFjdGl2ZVR1cm4uZ2V0KHNlc3Npb25LZXkpO1xuXHRcdFx0XHRjb25zdCB3YXNTZXNzaW9uQWN0aXZlID0gISFhY3RpdmVDaGF0cz8uc2l6ZTtcblx0XHRcdFx0aWYgKCFhY3RpdmVDaGF0cykge1xuXHRcdFx0XHRcdGFjdGl2ZUNoYXRzID0gbmV3IFNldDxzdHJpbmc+KCk7XG5cdFx0XHRcdFx0dGhpcy5fc2Vzc2lvbnNXaXRoQWN0aXZlVHVybi5zZXQoc2Vzc2lvbktleSwgYWN0aXZlQ2hhdHMpO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGFjdGl2ZUNoYXRzLmFkZChjaGF0VXJpKTtcblx0XHRcdFx0aWYgKCF3YXNTZXNzaW9uQWN0aXZlKSB7XG5cdFx0XHRcdFx0dGhpcy5fb25EaWRDaGFuZ2VTZXNzaW9uQWN0aXZlVHVybi5maXJlKHsgc2Vzc2lvbjogc2Vzc2lvbktleSwgYWN0aXZlOiB0cnVlIH0pO1xuXHRcdFx0XHRcdHRoaXMuZGlzcGF0Y2hTZXJ2ZXJBY3Rpb24oUk9PVF9TVEFURV9VUkksIHsgdHlwZTogQWN0aW9uVHlwZS5Sb290QWN0aXZlU2Vzc2lvbnNDaGFuZ2VkLCBhY3RpdmVTZXNzaW9uczogdGhpcy5fc2Vzc2lvbnNXaXRoQWN0aXZlVHVybi5zaXplIH0pO1xuXHRcdFx0XHR9XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHR0aGlzLl9yZW1vdmVDaGF0QWN0aXZlVHVybihzZXNzaW9uS2V5LCBjaGF0VXJpKTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRjb25zdCBlbnRyeSA9IHRoaXMuX3Nlc3Npb25TdGF0ZXMuZ2V0KHNlc3Npb25LZXkpO1xuXHRcdGlmICghZW50cnkpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0Y29uc3Qgc2Vzc2lvblN0YXRlID0gZW50cnkuc3RhdGU7XG5cblx0XHQvLyBNaXJyb3IgZGVub3JtYWxpemVkIGNoYXQgc3VtbWFyeSBmaWVsZHMgb250byB0aGUgc2Vzc2lvbiwgYWdncmVnYXRpbmdcblx0XHQvLyBhY3Jvc3MgdGhlIHdob2xlIGNoYXQgY2F0YWxvZyBwZXIgdGhlIFNlc3Npb25TdW1tYXJ5IHJ1bGVzLlxuXHRcdGNvbnN0IG5leHRFbnRyeSA9IGNoYXRTdW1tYXJ5RnJvbVN0YXRlKG5leHQpO1xuXHRcdGNvbnN0IHByZXZFbnRyeSA9IHNlc3Npb25TdGF0ZS5jaGF0cy5maW5kKGMgPT4gYy5yZXNvdXJjZSA9PT0gY2hhdFVyaSk7XG5cdFx0Y29uc3QgY2hhdHMgPSBzZXNzaW9uU3RhdGUuY2hhdHMubWFwKGMgPT4gYy5yZXNvdXJjZSA9PT0gY2hhdFVyaSA/IG5leHRFbnRyeSA6IGMpO1xuXG5cdFx0Ly8gRm9yd2FyZCB0aGUgY2hhdCdzIG93biBzdGF0dXMgdG8gdGhlIHNlc3Npb24gY2F0YWxvZyBzbyBmdWxsXG5cdFx0Ly8gU2Vzc2lvblN0YXRlIHN1YnNjcmliZXJzICh0aGUgcGVyLWNoYXQgdGFicykgcmVmbGVjdCB0aGlzIGNoYXQnc1xuXHRcdC8vIHByb2dyZXNzIFx1MjAxNCBub3QganVzdCB0aGUgYWdncmVnYXRlZCBzZXNzaW9uIHN1bW1hcnkuIFN0YXR1cyBjaGFuZ2VzXG5cdFx0Ly8gYXQgbW9zdCBhIGNvdXBsZSBvZiB0aW1lcyBwZXIgdHVybiwgc28gdGhpcyB3b24ndCBmbG9vZCB0aGUgY2hhbm5lbC5cblx0XHRpZiAocHJldkVudHJ5Py5zdGF0dXMgIT09IG5leHRFbnRyeS5zdGF0dXMpIHtcblx0XHRcdHRoaXMuZGlzcGF0Y2hTZXJ2ZXJBY3Rpb24oc2Vzc2lvbktleSwge1xuXHRcdFx0XHR0eXBlOiBBY3Rpb25UeXBlLlNlc3Npb25DaGF0VXBkYXRlZCxcblx0XHRcdFx0Y2hhdDogY2hhdFVyaSxcblx0XHRcdFx0Y2hhbmdlczogeyBzdGF0dXM6IG5leHRFbnRyeS5zdGF0dXMsIGFjdGl2aXR5OiBuZXh0RW50cnkuYWN0aXZpdHkgfSxcblx0XHRcdH0pO1xuXHRcdH1cblxuXHRcdGNvbnN0IGFnZ3JlZ2F0ZSA9IHRoaXMuX2FnZ3JlZ2F0ZUNoYXRTdW1tYXJpZXMoY2hhdHMsIHNlc3Npb25TdGF0ZS5kZWZhdWx0Q2hhdCk7XG5cdFx0Y29uc3QgbmV3U3RhdHVzID0gYWdncmVnYXRlLnN0YXR1cyAhPT0gdW5kZWZpbmVkID8gdGhpcy5fbWVyZ2VTZXNzaW9uU3RhdHVzKHNlc3Npb25TdGF0ZS5zdGF0dXMsIGFnZ3JlZ2F0ZS5zdGF0dXMpIDogc2Vzc2lvblN0YXRlLnN0YXR1cztcblx0XHRjb25zdCBzdGF0dXNDaGFuZ2VkID0gbmV3U3RhdHVzICE9PSBzZXNzaW9uU3RhdGUuc3RhdHVzO1xuXHRcdGNvbnN0IGFjdGl2aXR5Q2hhbmdlZCA9IGFnZ3JlZ2F0ZS5hY3Rpdml0eSAhPT0gc2Vzc2lvblN0YXRlLmFjdGl2aXR5O1xuXHRcdGVudHJ5LnN0YXRlID0ge1xuXHRcdFx0Li4uc2Vzc2lvblN0YXRlLFxuXHRcdFx0Y2hhdHMsXG5cdFx0XHQuLi4oc3RhdHVzQ2hhbmdlZCA/IHsgc3RhdHVzOiBuZXdTdGF0dXMgfSA6IHVuZGVmaW5lZCksXG5cdFx0XHQuLi4oYWN0aXZpdHlDaGFuZ2VkID8geyBhY3Rpdml0eTogYWdncmVnYXRlLmFjdGl2aXR5IH0gOiB1bmRlZmluZWQpLFxuXHRcdH07XG5cblx0XHQvLyBSb2xsIHRoZSBhZ2dyZWdhdGVkIGBtb2RpZmllZEF0YCBpbnRvIHRoZSBjYXRhbG9nLW9ubHkgdGltZXN0YW1wLlxuXHRcdGNvbnN0IG5ld01vZGlmaWVkQXQgPSBhZ2dyZWdhdGUubW9kaWZpZWRBdCAhPT0gdW5kZWZpbmVkID8gbmV3IERhdGUoYWdncmVnYXRlLm1vZGlmaWVkQXQpLnRvSVNPU3RyaW5nKCkgOiB1bmRlZmluZWQ7XG5cdFx0Y29uc3QgbW9kaWZpZWRBdENoYW5nZWQgPSBuZXdNb2RpZmllZEF0ICE9PSB1bmRlZmluZWQgJiYgbmV3TW9kaWZpZWRBdCAhPT0gZW50cnkubW9kaWZpZWRBdDtcblx0XHRpZiAobW9kaWZpZWRBdENoYW5nZWQpIHtcblx0XHRcdGVudHJ5Lm1vZGlmaWVkQXQgPSBuZXdNb2RpZmllZEF0O1xuXHRcdH1cblxuXHRcdGlmIChzdGF0dXNDaGFuZ2VkIHx8IGFjdGl2aXR5Q2hhbmdlZCB8fCBtb2RpZmllZEF0Q2hhbmdlZCkge1xuXHRcdFx0dGhpcy5fc3VtbWFyeU5vdGlmaWVyLm1hcmtEaXJ0eShzZXNzaW9uS2V5KTtcblx0XHR9XG5cdH1cblxuXHQvKipcblx0ICogQWdncmVnYXRlcyBhIHNlc3Npb24ncyBjaGF0IGNhdGFsb2cgaW50byB0aGUgZGVyaXZlZCBzZXNzaW9uLXN1bW1hcnlcblx0ICogZmllbGRzIHBlciB0aGUgcHJvdG9jb2wgcnVsZXM6IGFjdGl2aXR5IGJpdHMgY29tZSBmcm9tIHRoZSBkZWZhdWx0IGNoYXRcblx0ICogKGVsc2UgdGhlIG1vc3QgcmVjZW50bHkgbW9kaWZpZWQgY2hhdCkgd2l0aCBgSW5wdXROZWVkZWRgL2BFcnJvcmAvXG5cdCAqIGBJblByb2dyZXNzYCBwcm9tb3RlZCB3aGVuZXZlciBhbnkgY2hhdCByYWlzZXMgdGhlbTsgdGhlIGBhY3Rpdml0eWAgc3RyaW5nXG5cdCAqIGZvbGxvd3MgdGhlIGNoYXQgZHJpdmluZyB0aGUgcmVzdWx0aW5nIHN0YXR1czsgYG1vZGlmaWVkQXRgIGlzIHRoZSBtYXhcblx0ICogYWNyb3NzIGNoYXRzLiBQcm9tb3Rpb24gcHJlY2VkZW5jZSBpcyBgSW5wdXROZWVkZWRgID4gYEVycm9yYCA+XG5cdCAqIGBJblByb2dyZXNzYCwgc28gYSBydW5uaW5nIHBlZXIgKHN1YikgY2hhdCBzdXJmYWNlcyBhcyBgSW5Qcm9ncmVzc2Agb24gdGhlXG5cdCAqIHNlc3Npb24gZXZlbiB3aGVuIHRoZSBkZWZhdWx0IGNoYXQgaXMgaWRsZS5cblx0ICovXG5cdHByaXZhdGUgX2FnZ3JlZ2F0ZUNoYXRTdW1tYXJpZXMoY2hhdHM6IHJlYWRvbmx5IENoYXRTdW1tYXJ5W10sIGRlZmF1bHRDaGF0OiBVUkkgfCB1bmRlZmluZWQpOiB7IHN0YXR1cz86IFNlc3Npb25TdGF0dXM7IGFjdGl2aXR5Pzogc3RyaW5nOyBtb2RpZmllZEF0PzogbnVtYmVyIH0ge1xuXHRcdGlmIChjaGF0cy5sZW5ndGggPT09IDApIHtcblx0XHRcdHJldHVybiB7fTtcblx0XHR9XG5cdFx0Y29uc3QgYWN0aXZpdHlNYXNrID0gfihTZXNzaW9uU3RhdHVzLklzUmVhZCB8IFNlc3Npb25TdGF0dXMuSXNBcmNoaXZlZCk7XG5cdFx0Y29uc3QgYmFzZSA9IChkZWZhdWx0Q2hhdCAhPT0gdW5kZWZpbmVkID8gY2hhdHMuZmluZChjID0+IGMucmVzb3VyY2UgPT09IGRlZmF1bHRDaGF0KSA6IHVuZGVmaW5lZClcblx0XHRcdD8/IGNoYXRzLnJlZHVjZSgoYSwgYikgPT4gRGF0ZS5wYXJzZShiLm1vZGlmaWVkQXQpID4gRGF0ZS5wYXJzZShhLm1vZGlmaWVkQXQpID8gYiA6IGEpO1xuXHRcdGxldCBzdGF0dXMgPSBiYXNlLnN0YXR1cyAmIGFjdGl2aXR5TWFzaztcblx0XHRsZXQgZHJpdmVyID0gYmFzZTtcblx0XHRjb25zdCBlcnJvckNoYXQgPSBjaGF0cy5maW5kKGMgPT4gKGMuc3RhdHVzICYgU2Vzc2lvblN0YXR1cy5FcnJvcikgPT09IFNlc3Npb25TdGF0dXMuRXJyb3IpO1xuXHRcdGNvbnN0IGlucHV0Q2hhdCA9IGNoYXRzLmZpbmQoYyA9PiAoYy5zdGF0dXMgJiBTZXNzaW9uU3RhdHVzLklucHV0TmVlZGVkKSA9PT0gU2Vzc2lvblN0YXR1cy5JbnB1dE5lZWRlZCk7XG5cdFx0Ly8gYElucHV0TmVlZGVkYCBpcyBhIHN1cGVyc2V0IG9mIHRoZSBgSW5Qcm9ncmVzc2AgYml0LCBzbyBleGNsdWRlXG5cdFx0Ly8gaW5wdXQtbmVlZGVkIGNoYXRzIGhlcmUgdG8gZmluZCBvbmUgdGhhdCBpcyBwdXJlbHkgc3RyZWFtaW5nLlxuXHRcdGNvbnN0IGluUHJvZ3Jlc3NDaGF0ID0gY2hhdHMuZmluZChjID0+IChjLnN0YXR1cyAmIFNlc3Npb25TdGF0dXMuSW5wdXROZWVkZWQpID09PSBTZXNzaW9uU3RhdHVzLkluUHJvZ3Jlc3MpO1xuXHRcdGlmIChpbnB1dENoYXQpIHtcblx0XHRcdHN0YXR1cyA9IFNlc3Npb25TdGF0dXMuSW5wdXROZWVkZWQ7XG5cdFx0XHRkcml2ZXIgPSBpbnB1dENoYXQ7XG5cdFx0fSBlbHNlIGlmIChlcnJvckNoYXQpIHtcblx0XHRcdHN0YXR1cyA9IFNlc3Npb25TdGF0dXMuRXJyb3I7XG5cdFx0XHRkcml2ZXIgPSBlcnJvckNoYXQ7XG5cdFx0fSBlbHNlIGlmIChpblByb2dyZXNzQ2hhdCkge1xuXHRcdFx0c3RhdHVzID0gU2Vzc2lvblN0YXR1cy5JblByb2dyZXNzO1xuXHRcdFx0ZHJpdmVyID0gaW5Qcm9ncmVzc0NoYXQ7XG5cdFx0fVxuXHRcdGNvbnN0IG1vZGlmaWVkQXQgPSBjaGF0cy5yZWR1Y2UoKG1heCwgYykgPT4gTWF0aC5tYXgobWF4LCBEYXRlLnBhcnNlKGMubW9kaWZpZWRBdCkpLCAwKTtcblx0XHRyZXR1cm4geyBzdGF0dXMsIGFjdGl2aXR5OiBkcml2ZXIuYWN0aXZpdHksIG1vZGlmaWVkQXQgfTtcblx0fVxuXG5cdC8qKlxuXHQgKiBDb21iaW5lcyB0aGUgY2hhdCdzIGFjdGl2aXR5IHN0YXR1cyBiaXRzIHdpdGggdGhlIHNlc3Npb24gc3VtbWFyeSdzXG5cdCAqIG93biBtZXRhZGF0YSBmbGFncyAoSXNSZWFkIC8gSXNBcmNoaXZlZCkgd2hpY2ggbGl2ZSBpbiB0aGUgaGlnaCBiaXRzXG5cdCAqIG9mIHtAbGluayBTZXNzaW9uU3RhdHVzfSBhbmQgYXJlIG93bmVkIGJ5IHRoZSBzZXNzaW9uLCBub3QgdGhlIGNoYXQuXG5cdCAqL1xuXHRwcml2YXRlIF9tZXJnZVNlc3Npb25TdGF0dXMoc2Vzc2lvblN0YXR1czogU2Vzc2lvblN0YXR1cywgY2hhdFN0YXR1czogU2Vzc2lvblN0YXR1cyk6IFNlc3Npb25TdGF0dXMge1xuXHRcdGNvbnN0IG1ldGFGbGFncyA9IHNlc3Npb25TdGF0dXMgJiAoU2Vzc2lvblN0YXR1cy5Jc1JlYWQgfCBTZXNzaW9uU3RhdHVzLklzQXJjaGl2ZWQpO1xuXHRcdGNvbnN0IGFjdGl2aXR5Qml0cyA9IGNoYXRTdGF0dXMgJiB+KFNlc3Npb25TdGF0dXMuSXNSZWFkIHwgU2Vzc2lvblN0YXR1cy5Jc0FyY2hpdmVkKTtcblx0XHRyZXR1cm4gYWN0aXZpdHlCaXRzIHwgbWV0YUZsYWdzO1xuXHR9XG5cblx0LyoqXG5cdCAqIEVtaXQgYSBnZW5lcmljIHByb2dyZXNzIG5vdGlmaWNhdGlvbiBvbiB0aGUgcm9vdCBjaGFubmVsLCBjb3JyZWxhdGVkIHRvXG5cdCAqIHRoZSBvcmlnaW5hdGluZyByZXF1ZXN0IGJ5IHtAbGluayBQcm9ncmVzc1BhcmFtcy5wcm9ncmVzc1Rva2VufS4gUm91dGVkIHRvXG5cdCAqIGNsaWVudHMgdGhyb3VnaCB0aGUgc2FtZSB7QGxpbmsgb25EaWRFbWl0Tm90aWZpY2F0aW9ufSBwYXRoIGFzIHNlc3Npb25cblx0ICogbm90aWZpY2F0aW9ucywgc28gYm90aCB0aGUgbG9jYWwgKElQQyBwcm94eSkgYW5kIHJlbW90ZSAoV2ViU29ja2V0XG5cdCAqIHtAbGluayBQcm90b2NvbFNlcnZlckhhbmRsZXJ9KSByZW5kZXJlcnMgcmVjZWl2ZSBpdCB3aXRob3V0IGFueVxuXHQgKiB0cmFuc3BvcnQtc3BlY2lmaWMgc3BlY2lhbCBjYXNpbmcuIFByb2dyZXNzIGZvciBob3N0LWxldmVsIHdvcmsgKGUuZy4gYVxuXHQgKiBzaGFyZWQgU0RLIGRvd25sb2FkKSByaWRlcyB0aGUgcm9vdCBjaGFubmVsIHJhdGhlciB0aGFuIGEgcGVyLXNlc3Npb24gb25lLlxuXHQgKi9cblx0ZW1pdFByb2dyZXNzKHByb2dyZXNzOiBPbWl0PFByb2dyZXNzUGFyYW1zLCAnY2hhbm5lbCc+KTogdm9pZCB7XG5cdFx0dGhpcy5fb25EaWRFbWl0Tm90aWZpY2F0aW9uLmZpcmUoe1xuXHRcdFx0dHlwZTogJ3Jvb3QvcHJvZ3Jlc3MnLFxuXHRcdFx0Y2hhbm5lbDogUk9PVF9TVEFURV9VUkksXG5cdFx0XHQuLi5wcm9ncmVzcyxcblx0XHR9KTtcblx0fVxuXG5cdC8qKlxuXHQgKiBFbWl0IGFuIGBhdXRoL3JlcXVpcmVkYCBub3RpZmljYXRpb24gb24gdGhlIHJvb3QgY2hhbm5lbCwgYXNraW5nIHRoZVxuXHQgKiBjbGllbnQgdG8gb2J0YWluIGEgZnJlc2ggdG9rZW4gYW5kIHB1c2ggaXQgdmlhIGBhdXRoZW50aWNhdGVgLiBSaWRlcyB0aGVcblx0ICogc2FtZSB7QGxpbmsgb25EaWRFbWl0Tm90aWZpY2F0aW9ufSBwYXRoIGFzIHtAbGluayBlbWl0UHJvZ3Jlc3N9LCBzbyBib3RoXG5cdCAqIGxvY2FsIChJUEMgcHJveHkpIGFuZCByZW1vdGUgKFdlYlNvY2tldCkgcmVuZGVyZXJzIHJlY2VpdmUgaXQuIFVzZWQgZm9yXG5cdCAqIGhvc3QtbGV2ZWwgYXV0aCByZXF1aXJlbWVudHMgKGUuZy4gYW4gYWdlbnQgd2hvc2UgdHJhbnNwb3J0IGZsaXAgbWFrZXMgYVxuXHQgKiBjcmVkZW50aWFsIG5ld2x5IHJlcXVpcmVkKSByYXRoZXIgdGhhbiBhIHBlci1zZXNzaW9uIG9uZS5cblx0ICovXG5cdGVtaXRBdXRoUmVxdWlyZWQocGFyYW1zOiBPbWl0PEF1dGhSZXF1aXJlZFBhcmFtcywgJ2NoYW5uZWwnPik6IHZvaWQge1xuXHRcdHRoaXMuX29uRGlkRW1pdE5vdGlmaWNhdGlvbi5maXJlKHtcblx0XHRcdHR5cGU6ICdhdXRoL3JlcXVpcmVkJyxcblx0XHRcdGNoYW5uZWw6IFJPT1RfU1RBVEVfVVJJLFxuXHRcdFx0Li4ucGFyYW1zLFxuXHRcdH0pO1xuXHR9XG5cblx0b3ZlcnJpZGUgZGlzcG9zZSgpOiB2b2lkIHtcblx0XHRmb3IgKGNvbnN0IGVudHJ5IG9mIHRoaXMuX2NoYXRFbnRyaWVzLnZhbHVlcygpKSB7XG5cdFx0XHRlbnRyeS52YWxpZCA9IGZhbHNlO1xuXHRcdH1cblx0XHR0aGlzLl9jaGF0RW50cmllcy5jbGVhcigpO1xuXHRcdHN1cGVyLmRpc3Bvc2UoKTtcblx0fVxufVxuXG4vKipcbiAqIFJlc29sdmVzIHRoZSBhdXRob3JpdGF0aXZlIHtAbGluayBDaGF0U3RhdGV9IGZvciBhIGNoYXQgVVJJLCB3aGV0aGVyIGl0IG5hbWVzXG4gKiBhIHBlZXIgY2hhdCBvciBhIHNlc3Npb24ncyBkZWZhdWx0IGNoYXQgKGFkZHJlc3NlZCBieSB0aGUgc2Vzc2lvbiBVUkkgb3IgdGhlXG4gKiBkZWZhdWx0IGNoYXQgVVJJKS4gUmV0dXJucyBgdW5kZWZpbmVkYCB3aGVuIHRoZSBjaGF0IGlzIHVua25vd24uXG4gKlxuICogU2hhcmVkIGJ5IHRoZSBjaGF0IGNvbXBsZXRpb24gcHJvdmlkZXIgYW5kIHRoZSBzZXJ2ZXItc2lkZSBjaGF0LWF0dGFjaG1lbnRcbiAqIHJlc29sdmVyIHNvIGJvdGggZGVyaXZlIGEgcmVmZXJlbmNlZCBjaGF0J3MgdHVybnMgdGhlIHNhbWUgd2F5LlxuICovXG5leHBvcnQgZnVuY3Rpb24gcmVzb2x2ZUNoYXRTdGF0ZUZvclVyaShzdGF0ZU1hbmFnZXI6IEFnZW50SG9zdFN0YXRlTWFuYWdlciwgY2hhdFVyaTogc3RyaW5nKTogQ2hhdFN0YXRlIHwgdW5kZWZpbmVkIHtcblx0Y29uc3QgcGVlclN0YXRlID0gc3RhdGVNYW5hZ2VyLmdldENoYXRTdGF0ZShjaGF0VXJpKTtcblx0aWYgKHBlZXJTdGF0ZSkge1xuXHRcdHJldHVybiBwZWVyU3RhdGU7XG5cdH1cblx0aWYgKCFpc0FocENoYXRDaGFubmVsKGNoYXRVcmkpKSB7XG5cdFx0cmV0dXJuIHN0YXRlTWFuYWdlci5nZXREZWZhdWx0Q2hhdFN0YXRlKGNoYXRVcmkpO1xuXHR9XG5cdGlmIChpc0RlZmF1bHRDaGF0VXJpKGNoYXRVcmkpKSB7XG5cdFx0cmV0dXJuIHN0YXRlTWFuYWdlci5nZXREZWZhdWx0Q2hhdFN0YXRlKHBhcnNlUmVxdWlyZWRTZXNzaW9uVXJpRnJvbUNoYXRVcmkoY2hhdFVyaSkpO1xuXHR9XG5cdHJldHVybiB1bmRlZmluZWQ7XG59XG4iXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7OztBQUtBLFNBQVMsd0JBQXdCO0FBQ2pDLFNBQVMsZUFBc0I7QUFDL0IsU0FBUyxrQkFBa0I7QUFDM0IsU0FBUyxjQUFjO0FBQ3ZCLFNBQVMsbUJBQW1CO0FBQzVCLFNBQVMsdUJBQXVCO0FBQ2hDLFNBQVMsc0JBQXNCO0FBQy9CLFNBQVMsWUFBMk8sY0FBYyxpQkFBaUIsY0FBYyxtQkFBbUIsMkJBQXlFO0FBRTdYLFNBQVMsYUFBYSxnQkFBZ0IsYUFBYSxrQkFBa0IsMEJBQTBCO0FBQy9GLFNBQVMsaUJBQWlCLG9CQUFvQixpQkFBaUIsMEJBQTBCLHNCQUFzQixxQkFBcUIscUJBQXFCLG9DQUFvQyxrQkFBa0Isa0JBQWtCLDZCQUE2QixrQkFBa0Isa0JBQWtCLG1CQUF5UyxnQkFBZ0IsaUJBQWlDLHFCQUFxQjtBQUNqcEIsU0FBUyxrQ0FBcUQsb0JBQW9CLDRDQUE0QztBQUM5SCxTQUFTLHdCQUF3QjtBQUNqQyxTQUFTLHlCQUF5QjtBQUNsQyxTQUFTLHFCQUFxQix3QkFBd0I7QUFDdEQsU0FBUyxvQ0FBbUY7QUFFNUYsU0FBUyxhQUFhLHdCQUF3QjtBQUM5QyxTQUFTLDhDQUE4QztBQXNCdkQsSUFBVyxhQUFYLGtCQUFXQSxnQkFBWDtBQUNDLEVBQUFBLHdCQUFBO0FBQ0EsRUFBQUEsd0JBQUE7QUFGVSxTQUFBQTtBQUFBLEdBQUE7QUE0RFgsTUFBTSwrQkFBK0IsV0FBVztBQUFBLEVBVS9DLFlBQ2tCLGFBQ0EsT0FDaEI7QUFDRCxVQUFNO0FBSFc7QUFDQTtBQVRsQjtBQUFBLFNBQWlCLGdCQUFnQixvQkFBSSxJQUE0QjtBQUdqRTtBQUFBLFNBQWlCLFNBQVMsb0JBQUksSUFBWTtBQUUxQyxTQUFpQixhQUFhLEtBQUssVUFBVSxJQUFJLGlCQUFpQixNQUFNLEtBQUssVUFBVSxHQUFHLEdBQUcsQ0FBQztBQUFBLEVBTzlGO0FBQUE7QUFBQSxFQUdBLFNBQVMsU0FBaUIsU0FBK0I7QUFDeEQsU0FBSyxjQUFjLElBQUksU0FBUyxPQUFPO0FBQUEsRUFDeEM7QUFBQTtBQUFBLEVBR0EsWUFBWSxTQUEwQjtBQUNyQyxXQUFPLEtBQUssY0FBYyxJQUFJLE9BQU87QUFBQSxFQUN0QztBQUFBO0FBQUEsRUFHQSxhQUFhLFNBQTZDO0FBQ3pELFdBQU8sS0FBSyxjQUFjLElBQUksT0FBTztBQUFBLEVBQ3RDO0FBQUE7QUFBQSxFQUdBLFVBQVUsU0FBdUI7QUFDaEMsU0FBSyxPQUFPLElBQUksT0FBTztBQUN2QixTQUFLLFdBQVcsU0FBUztBQUFBLEVBQzFCO0FBQUE7QUFBQSxFQUdBLFFBQVEsU0FBMEI7QUFDakMsV0FBTyxLQUFLLE9BQU8sSUFBSSxPQUFPO0FBQUEsRUFDL0I7QUFBQTtBQUFBLEVBR0EsV0FBVyxTQUF1QjtBQUNqQyxTQUFLLE9BQU8sT0FBTyxPQUFPO0FBQUEsRUFDM0I7QUFBQTtBQUFBLEVBR0EsT0FBTyxTQUF1QjtBQUM3QixTQUFLLGNBQWMsT0FBTyxPQUFPO0FBQ2pDLFNBQUssT0FBTyxPQUFPLE9BQU87QUFBQSxFQUMzQjtBQUFBLEVBRVEsWUFBa0I7QUFDekIsZUFBVyxXQUFXLEtBQUssUUFBUTtBQUNsQyxXQUFLLE1BQU0sT0FBTztBQUFBLElBQ25CO0FBQ0EsU0FBSyxPQUFPLE1BQU07QUFBQSxFQUNuQjtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQSxFQU9BLE1BQU0sU0FBdUI7QUFDNUIsVUFBTSxVQUFVLEtBQUssWUFBWSxPQUFPO0FBQ3hDLFVBQU0sZUFBZSxLQUFLLGNBQWMsSUFBSSxPQUFPO0FBQ25ELFFBQUksQ0FBQyxXQUFXLENBQUMsY0FBYztBQUM5QjtBQUFBLElBQ0Q7QUFFQSxVQUFNLFVBQW1DLENBQUM7QUFDMUMsUUFBSSxRQUFRLFVBQVUsYUFBYSxPQUFPO0FBQUUsY0FBUSxRQUFRLFFBQVE7QUFBQSxJQUFPO0FBQzNFLFFBQUksUUFBUSxXQUFXLGFBQWEsUUFBUTtBQUFFLGNBQVEsU0FBUyxRQUFRO0FBQUEsSUFBUTtBQUMvRSxRQUFJLFFBQVEsYUFBYSxhQUFhLFVBQVU7QUFBRSxjQUFRLFdBQVcsUUFBUTtBQUFBLElBQVU7QUFDdkYsUUFBSSxRQUFRLGVBQWUsYUFBYSxZQUFZO0FBQUUsY0FBUSxhQUFhLFFBQVE7QUFBQSxJQUFZO0FBQy9GLFFBQUksUUFBUSxZQUFZLGFBQWEsU0FBUztBQUFFLGNBQVEsVUFBVSxRQUFRO0FBQUEsSUFBUztBQUNuRixRQUFJLFFBQVEsWUFBWSxhQUFhLFNBQVM7QUFBRSxjQUFRLFVBQVUsUUFBUTtBQUFBLElBQVM7QUFDbkYsUUFBSSxRQUFRLHVCQUF1QixhQUFhLG9CQUFvQjtBQUFFLGNBQVEscUJBQXFCLFFBQVE7QUFBQSxJQUFvQjtBQUMvSCxRQUFJLFFBQVEsVUFBVSxhQUFhLE9BQU87QUFBRSxjQUFRLFFBQVEsUUFBUTtBQUFBLElBQU87QUFFM0UsU0FBSyxjQUFjLElBQUksU0FBUyxPQUFPO0FBRXZDLFFBQUksT0FBTyxLQUFLLE9BQU8sRUFBRSxTQUFTLEdBQUc7QUFDcEMsV0FBSyxNQUFNLFNBQVMsT0FBTztBQUFBLElBQzVCO0FBQUEsRUFDRDtBQUNEO0FBU08sTUFBTSx5QkFBeUIsZ0JBQXVDLHVCQUF1QjtBQUU3RixJQUFNLHdCQUFOLGNBQW9DLFdBQVc7QUFBQSxFQTBFckQsWUFDK0IsYUFDOUIsVUFBeUMsQ0FBQyxHQUN6QztBQUNELFVBQU07QUFId0I7QUF4RS9CLFNBQVEsYUFBYTtBQWFyQjtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQSxTQUFpQixpQkFBaUIsb0JBQUksSUFBMkI7QUFNakU7QUFBQTtBQUFBO0FBQUE7QUFBQSxTQUFpQixlQUFlLG9CQUFJLElBQXdCO0FBVTVEO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQSxTQUFpQixlQUFlLG9CQUFJLElBQThCO0FBZWxFO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUEsU0FBaUIsMEJBQTBCLG9CQUFJLElBQXlCO0FBVXhFLFNBQWlCLHFCQUFxQixLQUFLLFVBQVUsSUFBSSxRQUF3QixDQUFDO0FBQ2xGLFNBQVMsb0JBQTJDLEtBQUssbUJBQW1CO0FBRTVFLFNBQWlCLHlCQUF5QixLQUFLLFVBQVUsSUFBSSxRQUF1QixDQUFDO0FBQ3JGLFNBQVMsd0JBQThDLEtBQUssdUJBQXVCO0FBQ25GLFNBQWlCLGdDQUFnQyxLQUFLLFVBQVUsSUFBSSxRQUE4QyxDQUFDO0FBQ25ILFNBQVMsK0JBQTRFLEtBQUssOEJBQThCO0FBRXhILFNBQWlCLDJCQUEyQixLQUFLLFVBQVUsSUFBSSxRQUE0QyxDQUFDO0FBQzVHLFNBQVMsMEJBQXFFLEtBQUsseUJBQXlCO0FBRTVHLFNBQWlCLDRCQUE0QixLQUFLLFVBQVUsSUFBSSxRQUErSixDQUFDO0FBQ2hPLFNBQVMsMkJBQXlMLEtBQUssMEJBQTBCO0FBRWpPLFNBQWlCLHdDQUF3QyxLQUFLLFVBQVUsSUFBSSxRQUE2QixDQUFDO0FBQzFHLFNBQVMsdUNBQW1FLEtBQUssc0NBQXNDO0FBcUN2SCxTQUFpQixPQUFPLENBQUMsUUFBZ0IsS0FBSyxZQUFZLEtBQUssMkJBQTJCLEdBQUcsRUFBRTtBQTlCOUYsU0FBSyxjQUFjLElBQUksNkJBQTZCLFFBQVEsdUJBQXVCO0FBQ25GLFNBQUssYUFBYSxnQkFBZ0I7QUFLbEMsU0FBSyxhQUFhO0FBQUEsTUFDakIsR0FBRyxLQUFLO0FBQUEsTUFDUixRQUFRO0FBQUEsUUFDUCxRQUFRLG1CQUFtQixXQUFXO0FBQUEsUUFDdEMsUUFBUSxtQkFBbUIsa0JBQWtCLENBQUMsR0FBRztBQUFBLFVBQ2hELENBQUMsaUJBQWlCLFdBQVcsR0FBRyxFQUFFLE9BQU8sQ0FBQyxHQUFHLE1BQU0sQ0FBQyxFQUFFO0FBQUEsVUFDdEQsQ0FBQyxnQ0FBZ0MsR0FBRyxxQ0FBcUMsZUFBZSxLQUFLO0FBQUEsUUFDOUYsQ0FBQztBQUFBLE1BQ0Y7QUFBQSxNQUNBLE9BQU8sa0JBQWtCLEtBQUssV0FBVyxPQUFPLFFBQVEsYUFBYTtBQUFBLElBQ3RFO0FBQ0EsU0FBSyxtQkFBbUIsS0FBSyxVQUFVLElBQUk7QUFBQSxNQUMxQyxhQUFXO0FBQ1YsY0FBTSxRQUFRLEtBQUssZUFBZSxJQUFJLE9BQU87QUFDN0MsZUFBTyxRQUFRLEtBQUssV0FBVyxTQUFTLEtBQUssSUFBSTtBQUFBLE1BQ2xEO0FBQUEsTUFDQSxDQUFDLFNBQVMsWUFBWSxLQUFLLHVCQUF1QixLQUFLO0FBQUEsUUFDdEQsTUFBTTtBQUFBLFFBQ04sU0FBUztBQUFBLFFBQ1Q7QUFBQSxRQUNBO0FBQUEsTUFDRCxDQUFDO0FBQUEsSUFDRixDQUFDO0FBQUEsRUFDRjtBQUFBLEVBR0EsSUFBSSxvQkFBNkI7QUFDaEMsV0FBTyxLQUFLLHdCQUF3QixPQUFPO0FBQUEsRUFDNUM7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQSxFQVFBLGNBQWMsWUFBNkI7QUFDMUMsV0FBTyxLQUFLLHdCQUF3QixJQUFJLFVBQVU7QUFBQSxFQUNuRDtBQUFBO0FBQUEsRUFJQSxJQUFJLFlBQXVCO0FBQzFCLFdBQU8sS0FBSztBQUFBLEVBQ2I7QUFBQSxFQUVBLGdCQUFnQixlQUF5RDtBQUl4RSxVQUFNLFNBQVMsaUJBQWlCLGFBQWE7QUFDN0MsVUFBTSxVQUFVLEtBQUssc0JBQXNCLGFBQWE7QUFDeEQsUUFBSSxZQUFZLFFBQVc7QUFDMUIsYUFBTztBQUFBLElBQ1I7QUFDQSxVQUFNLFFBQVEsS0FBSyxlQUFlLElBQUksT0FBTztBQUM3QyxRQUFJLENBQUMsT0FBTztBQUNYLGFBQU87QUFBQSxJQUNSO0FBQ0EsVUFBTSxVQUFVLFNBQVMsZ0JBQWdCLG9CQUFvQixPQUFPO0FBQ3BFLFdBQU8sNEJBQTRCLE1BQU0sT0FBTyxLQUFLLGFBQWEsSUFBSSxPQUFPLEdBQUcsS0FBSztBQUFBLEVBQ3RGO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBLEVBVUEsY0FBYyxlQUF5QztBQUN0RCxVQUFNLFVBQVUsS0FBSyxzQkFBc0IsYUFBYTtBQUN4RCxRQUFJLFlBQVksUUFBVztBQUMxQixhQUFPO0FBQUEsSUFDUjtBQUNBLFVBQU0sUUFBUSxLQUFLLGVBQWUsSUFBSSxPQUFPO0FBQzdDLFdBQU8sU0FBUyxNQUFNLFFBQVE7QUFBQSxFQUMvQjtBQUFBO0FBQUEsRUFHUSxpQkFBaUIsU0FBb0I7QUFDNUMsVUFBTSxRQUFRLEtBQUssZUFBZSxJQUFJLE9BQU87QUFDN0MsUUFBSSxPQUFPO0FBQ1YsWUFBTSxNQUFNO0FBQUEsSUFDYjtBQUFBLEVBQ0Q7QUFBQSxFQUVRLHNCQUFzQixlQUFxQztBQUNsRSxXQUFPLGlCQUFpQixhQUFhLElBQUksb0JBQW9CLGFBQWEsSUFBSTtBQUFBLEVBQy9FO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBLEVBVUEsa0JBQWtCLFNBQTBDO0FBQzNELFVBQU0sUUFBUSxLQUFLLGVBQWUsSUFBSSxPQUFPO0FBQzdDLFdBQU8sUUFBUSxLQUFLLFdBQVcsU0FBUyxLQUFLLElBQUk7QUFBQSxFQUNsRDtBQUFBO0FBQUEsRUFHQSwwQkFBMEIsU0FBNkM7QUFDdEUsV0FBTyxLQUFLLGVBQWUsSUFBSSxPQUFPLElBQUksU0FBWSxLQUFLLGlCQUFpQixhQUFhLE9BQU87QUFBQSxFQUNqRztBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQSxFQU9RLFdBQVcsU0FBaUIsT0FBc0M7QUFDekUsVUFBTSxFQUFFLE1BQU0sSUFBSTtBQUNsQixVQUFNLFVBQTBCO0FBQUEsTUFDL0IsVUFBVTtBQUFBLE1BQ1YsVUFBVSxNQUFNO0FBQUEsTUFDaEIsT0FBTyxNQUFNO0FBQUEsTUFDYixRQUFRLE1BQU07QUFBQSxNQUNkLFdBQVcsTUFBTTtBQUFBLE1BQ2pCLFlBQVksTUFBTTtBQUFBLElBQ25CO0FBQ0EsUUFBSSxNQUFNLGFBQWEsUUFBVztBQUFFLGNBQVEsV0FBVyxNQUFNO0FBQUEsSUFBVTtBQUN2RSxRQUFJLE1BQU0sWUFBWSxRQUFXO0FBQUUsY0FBUSxVQUFVLE1BQU07QUFBQSxJQUFTO0FBQ3BFLFFBQUksTUFBTSx1QkFBdUIsUUFBVztBQUFFLGNBQVEscUJBQXFCLE1BQU07QUFBQSxJQUFvQjtBQUNyRyxRQUFJLE1BQU0sZ0JBQWdCLFFBQVc7QUFBRSxjQUFRLGNBQWMsTUFBTTtBQUFBLElBQWE7QUFDaEYsUUFBSSxNQUFNLFlBQVksUUFBVztBQUFFLGNBQVEsVUFBVSxNQUFNO0FBQUEsSUFBUztBQUNwRSxRQUFJLE1BQU0sVUFBVSxRQUFXO0FBQUUsY0FBUSxRQUFRLE1BQU07QUFBQSxJQUFPO0FBQzlELFdBQU87QUFBQSxFQUNSO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBLEVBT1Esb0JBQW9CLEdBQWlCLEdBQTBCO0FBQ3RFLFdBQU8sRUFBRSxVQUFVLEVBQUUsU0FDakIsRUFBRSxXQUFXLEVBQUUsVUFDZixFQUFFLGFBQWEsRUFBRSxZQUNqQixFQUFFLFlBQVksRUFBRSxXQUNoQixFQUFFLHVCQUF1QixFQUFFLHNCQUMzQixFQUFFLGdCQUFnQixFQUFFLGVBQ3BCLEVBQUUsVUFBVSxFQUFFO0FBQUEsRUFDbkI7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQSxFQVFBLG9CQUFvQixTQUFxQztBQUN4RCxXQUFPLEtBQUssYUFBYSxJQUFJLG9CQUFvQixPQUFPLENBQUMsR0FBRztBQUFBLEVBQzdEO0FBQUE7QUFBQSxFQUdBLGFBQWEsTUFBa0M7QUFDOUMsV0FBTyxLQUFLLGFBQWEsSUFBSSxJQUFJLEdBQUc7QUFBQSxFQUNyQztBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBLEVBUUEsY0FBYyxNQUFtQztBQUNoRCxXQUFPLEtBQUssYUFBYSxJQUFJLElBQUksR0FBRyxRQUFRO0FBQUEsRUFDN0M7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUEsRUFPQSxpQkFBaUIsTUFBMkM7QUFDM0QsVUFBTSxRQUFRLEtBQUssYUFBYSxJQUFJLElBQUk7QUFDeEMsUUFBSSxDQUFDLFNBQVMsQ0FBQyxNQUFNLE9BQU87QUFDM0IsYUFBTyxRQUFRLFFBQVEsTUFBUztBQUFBLElBQ2pDO0FBQ0EsUUFBSSxNQUFNLE9BQU87QUFDaEIsYUFBTyxRQUFRLFFBQVEsTUFBTSxLQUFLO0FBQUEsSUFDbkM7QUFDQSxRQUFJLENBQUMsTUFBTSxVQUFVO0FBQ3BCLGFBQU8sUUFBUSxRQUFRLE1BQVM7QUFBQSxJQUNqQztBQUNBLFFBQUksTUFBTSxVQUFVO0FBQ25CLGFBQU8sTUFBTTtBQUFBLElBQ2Q7QUFFQSxVQUFNLFlBQVksWUFBWTtBQUM3QixZQUFNLFdBQVcsTUFBTSxNQUFNLFNBQVUsTUFBTSxZQUFZO0FBQ3pELFVBQUksQ0FBQyxNQUFNLFNBQVMsS0FBSyxhQUFhLElBQUksSUFBSSxNQUFNLE9BQU87QUFDMUQsY0FBTSxJQUFJLE1BQU0sa0RBQWtELElBQUksRUFBRTtBQUFBLE1BQ3pFO0FBQ0EsVUFBSSxDQUFDLE1BQU0sT0FBTztBQUNqQixjQUFNLFFBQVEsRUFBRSxHQUFHLGdCQUFnQixNQUFNLE9BQU8sR0FBRyxPQUFPLFNBQVMsT0FBTyxPQUFPLFNBQVMsU0FBUyxNQUFNLE1BQU07QUFDL0csY0FBTSxXQUFXO0FBQ2pCLFlBQUksU0FBUyxNQUFNLFNBQVMsR0FBRztBQUM5QixlQUFLLGlCQUFpQixNQUFNLE9BQU87QUFBQSxRQUNwQztBQUFBLE1BQ0Q7QUFDQSxhQUFPLE1BQU07QUFBQSxJQUNkLEdBQUc7QUFDSCxVQUFNLFdBQVc7QUFDakIsU0FBSyxTQUFTO0FBQUEsTUFDYixNQUFNO0FBQ0wsWUFBSSxNQUFNLGFBQWEsVUFBVTtBQUNoQyxnQkFBTSxXQUFXO0FBQUEsUUFDbEI7QUFBQSxNQUNEO0FBQUEsTUFDQSxNQUFNO0FBQ0wsWUFBSSxNQUFNLGFBQWEsVUFBVTtBQUNoQyxnQkFBTSxXQUFXO0FBQUEsUUFDbEI7QUFBQSxNQUNEO0FBQUEsSUFDRDtBQUNBLFdBQU87QUFBQSxFQUNSO0FBQUE7QUFBQSxFQUdBLHVCQUF1QixNQUFXLGNBQXdDO0FBQ3pFLFVBQU0sUUFBUSxLQUFLLGFBQWEsSUFBSSxJQUFJO0FBQ3hDLFFBQUksT0FBTztBQUNWLFlBQU0sZUFBZTtBQUFBLElBQ3RCO0FBQUEsRUFDRDtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQSxFQU9BLHFCQUFxQixTQUFjLE9BQXFCO0FBQ3ZELFVBQU0sWUFBWSxLQUFLLGFBQWEsSUFBSSxvQkFBb0IsT0FBTyxDQUFDLEdBQUc7QUFDdkUsUUFBSSxXQUFXO0FBQ2QsZ0JBQVUsUUFBUTtBQUFBLElBQ25CO0FBQ0EsUUFBSSxNQUFNLFNBQVMsR0FBRztBQUNyQixXQUFLLGlCQUFpQixPQUFPO0FBQUEsSUFDOUI7QUFBQSxFQUNEO0FBQUEsRUFFQSxJQUFJLFlBQW9CO0FBQ3ZCLFdBQU8sS0FBSztBQUFBLEVBQ2I7QUFBQSxFQUVBLGlCQUEyQjtBQUMxQixXQUFPLENBQUMsR0FBRyxLQUFLLGVBQWUsS0FBSyxDQUFDO0FBQUEsRUFDdEM7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBLEVBZUEsNkJBQStDO0FBQzlDLFVBQU0sWUFBOEIsQ0FBQztBQUNyQyxlQUFXLENBQUMsS0FBSyxLQUFLLEtBQUssS0FBSyxnQkFBZ0I7QUFDL0MsVUFBSSxLQUFLLG1CQUFtQixLQUFLLE1BQU0sTUFBTSxTQUFTLEdBQUc7QUFDeEQ7QUFBQSxNQUNEO0FBQ0EsZ0JBQVUsS0FBSyxLQUFLLFdBQVcsS0FBSyxLQUFLLENBQUM7QUFBQSxJQUMzQztBQUNBLFdBQU87QUFBQSxFQUNSO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUEsRUFRQSx5QkFBeUIsU0FBMEI7QUFDbEQsVUFBTSxRQUFRLEtBQUssZUFBZSxJQUFJLE9BQU87QUFDN0MsV0FBTyxRQUFRLEtBQUssbUJBQW1CLFNBQVMsTUFBTSxNQUFNLFNBQVMsSUFBSTtBQUFBLEVBQzFFO0FBQUEsRUFFUSxtQkFBbUIsU0FBaUIsV0FBc0M7QUFHakYsVUFBTSxPQUFPLEtBQUssYUFBYSxJQUFJLG9CQUFvQixPQUFPLENBQUMsR0FBRztBQUNsRSxXQUFPLGNBQWMsaUJBQWlCLFlBQVksQ0FBQyxNQUFNLGVBQWUsTUFBTSxNQUFNLFVBQVUsT0FBTztBQUFBLEVBQ3RHO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQSxFQU1BLHlCQUF5QixRQUEwQjtBQUNsRCxVQUFNLFNBQW1CLENBQUM7QUFDMUIsZUFBVyxPQUFPLEtBQUssZUFBZSxLQUFLLEdBQUc7QUFDN0MsVUFBSSxJQUFJLFdBQVcsTUFBTSxHQUFHO0FBQzNCLGVBQU8sS0FBSyxHQUFHO0FBQUEsTUFDaEI7QUFBQSxJQUNEO0FBQ0EsV0FBTztBQUFBLEVBQ1I7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQSxFQVNBLFlBQVksVUFBMkM7QUFDdEQsUUFBSSxpQkFBaUIsUUFBUSxHQUFHO0FBQy9CLGFBQU87QUFBQSxRQUNOLFVBQVU7QUFBQSxRQUNWLE9BQU8sS0FBSztBQUFBLFFBQ1osU0FBUyxLQUFLO0FBQUEsTUFDZjtBQUFBLElBQ0Q7QUFLQSxVQUFNLGlCQUFpQixLQUFLLFlBQVksSUFBSSxRQUFRO0FBQ3BELFFBQUksZ0JBQWdCO0FBQ25CLGFBQU87QUFBQSxRQUNOO0FBQUEsUUFDQSxPQUFPO0FBQUEsUUFDUCxTQUFTLEtBQUs7QUFBQSxNQUNmO0FBQUEsSUFDRDtBQUdBLFFBQUksaUJBQWlCLFFBQVEsR0FBRztBQUMvQixZQUFNLFlBQVksS0FBSyxhQUFhLElBQUksUUFBUSxHQUFHO0FBQ25ELFVBQUksQ0FBQyxXQUFXO0FBQ2YsZUFBTztBQUFBLE1BQ1I7QUFDQSxhQUFPO0FBQUEsUUFDTjtBQUFBLFFBQ0EsT0FBTztBQUFBLFFBQ1AsU0FBUyxLQUFLO0FBQUEsTUFDZjtBQUFBLElBQ0Q7QUFLQSxRQUFJLGlCQUFpQixRQUFRLEdBQUc7QUFDL0IsYUFBTztBQUFBLFFBQ047QUFBQSxRQUNBLE9BQU8sS0FBSyxhQUFhLElBQUksUUFBUSxLQUFLLEVBQUUsYUFBYSxDQUFDLEVBQUU7QUFBQSxRQUM1RCxTQUFTLEtBQUs7QUFBQSxNQUNmO0FBQUEsSUFDRDtBQUVBLFVBQU0sUUFBUSxLQUFLLGVBQWUsSUFBSSxRQUFRO0FBQzlDLFFBQUksQ0FBQyxPQUFPO0FBQ1gsYUFBTztBQUFBLElBQ1I7QUFFQSxXQUFPO0FBQUEsTUFDTjtBQUFBLE1BQ0EsT0FBTyxNQUFNO0FBQUEsTUFDYixTQUFTLEtBQUs7QUFBQSxJQUNmO0FBQUEsRUFDRDtBQUFBO0FBQUEsRUFHQSxrQkFBa0IsV0FBNEM7QUFDN0QsV0FBTyxLQUFLLFlBQVksSUFBSSxTQUFTO0FBQUEsRUFDdEM7QUFBQTtBQUFBLEVBR0EsNkJBQW1DO0FBQ2xDLFNBQUssWUFBWSxxQkFBcUI7QUFBQSxFQUN2QztBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQSxFQWlCQSxjQUFjLFNBQXlCLFNBQWlFO0FBQ3ZHLFVBQU0sTUFBTSxRQUFRO0FBQ3BCLFVBQU0sV0FBVyxLQUFLLGVBQWUsSUFBSSxHQUFHO0FBQzVDLFFBQUksVUFBVTtBQUNiLFdBQUssWUFBWSxLQUFLLG1EQUFtRCxHQUFHLEVBQUU7QUFDOUUsYUFBTyxTQUFTO0FBQUEsSUFDakI7QUFFQSxVQUFNLFFBQVEsbUJBQW1CLE9BQU87QUFDeEMsU0FBSyxlQUFlLElBQUksS0FBSyxLQUFLLFVBQVUsT0FBTyxTQUFTLG1CQUFzQixDQUFDO0FBQ25GLFNBQUssbUJBQW1CLEtBQUssT0FBTztBQUVwQyxTQUFLLFlBQVksTUFBTSw0Q0FBNEMsR0FBRyxFQUFFO0FBRXhFLFFBQUksU0FBUyxxQkFBcUIsT0FBTztBQUt4QyxXQUFLLGlCQUFpQixTQUFTLEtBQUssT0FBTztBQUMzQyxXQUFLLHVCQUF1QixLQUFLO0FBQUEsUUFDaEMsTUFBTTtBQUFBLFFBQ04sU0FBUztBQUFBLFFBQ1Q7QUFBQSxNQUNELENBQUM7QUFBQSxJQUNGO0FBRUEsV0FBTztBQUFBLEVBQ1I7QUFBQTtBQUFBLEVBR1EsVUFBVSxPQUFxQixTQUF5QixLQUFnQztBQUMvRixXQUFPLEVBQUUsT0FBTyxXQUFXLFFBQVEsV0FBVyxZQUFZLFFBQVEsWUFBWSxTQUFTLFFBQVEsU0FBUyxJQUFJO0FBQUEsRUFDN0c7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUEsRUFhQSxxQkFBcUIsU0FBYyxTQUF5QixRQUFRLE9BQWE7QUFDaEYsVUFBTSxNQUFNLFFBQVEsU0FBUztBQUM3QixVQUFNLFFBQVEsS0FBSyxlQUFlLElBQUksR0FBRztBQUN6QyxRQUFJLENBQUMsT0FBTztBQUNYLFdBQUssWUFBWSxLQUFLLGlFQUFpRSxHQUFHLEVBQUU7QUFDNUY7QUFBQSxJQUNEO0FBU0EsUUFBSSxDQUFDLFNBQVMsS0FBSyxpQkFBaUIsWUFBWSxHQUFHLEdBQUc7QUFDckQ7QUFBQSxJQUNEO0FBTUEsVUFBTSxRQUFRLEVBQUUsR0FBRyxNQUFNLE9BQU8sU0FBUyxRQUFRLFNBQVMsb0JBQW9CLFFBQVEsbUJBQW1CO0FBQ3pHLFVBQU0sYUFBYSxRQUFRO0FBQzNCLFVBQU0sVUFBVSxRQUFRO0FBQ3hCLFVBQU0sT0FBTyxLQUFLLFdBQVcsS0FBSyxLQUFLO0FBQ3ZDLFNBQUssaUJBQWlCLFNBQVMsS0FBSyxJQUFJO0FBQ3hDLFNBQUssdUJBQXVCLEtBQUs7QUFBQSxNQUNoQyxNQUFNO0FBQUEsTUFDTixTQUFTO0FBQUEsTUFDVCxTQUFTO0FBQUEsSUFDVixDQUFDO0FBQUEsRUFDRjtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUEsRUFTQSx3QkFBd0IsU0FBK0I7QUFDdEQsVUFBTSxNQUFNLFFBQVE7QUFDcEIsUUFBSSxLQUFLLGVBQWUsSUFBSSxHQUFHLEdBQUc7QUFDakMsV0FBSyxZQUFZLE1BQU0scUVBQXFFLEdBQUcsRUFBRTtBQUNqRztBQUFBLElBQ0Q7QUFDQSxRQUFJLEtBQUssaUJBQWlCLFlBQVksR0FBRyxHQUFHO0FBQzNDLFdBQUssWUFBWSxNQUFNLHNFQUFzRSxHQUFHLEVBQUU7QUFDbEc7QUFBQSxJQUNEO0FBQ0EsU0FBSyxpQkFBaUIsU0FBUyxLQUFLLE9BQU87QUFDM0MsU0FBSyx1QkFBdUIsS0FBSztBQUFBLE1BQ2hDLE1BQU07QUFBQSxNQUNOLFNBQVM7QUFBQSxNQUNUO0FBQUEsSUFDRCxDQUFDO0FBQUEsRUFDRjtBQUFBO0FBQUEsRUFHQSx1QkFBdUIsU0FBdUI7QUFDN0MsUUFBSSxLQUFLLGVBQWUsSUFBSSxPQUFPLEdBQUc7QUFDckM7QUFBQSxJQUNEO0FBQ0EsU0FBSyxpQkFBaUIsT0FBTyxPQUFPO0FBQ3BDLFNBQUssdUJBQXVCLEtBQUs7QUFBQSxNQUNoQyxNQUFNO0FBQUEsTUFDTixTQUFTO0FBQUEsTUFDVDtBQUFBLElBQ0QsQ0FBQztBQUFBLEVBQ0Y7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUEsRUFhQSxlQUFlLFNBQXlCLE9BQWUsU0FBMEY7QUFDaEosVUFBTSxNQUFNLFFBQVE7QUFDcEIsVUFBTSxXQUFXLEtBQUssZUFBZSxJQUFJLEdBQUc7QUFDNUMsUUFBSSxVQUFVO0FBQ2IsV0FBSyxZQUFZLEtBQUssNkRBQTZELEdBQUcsRUFBRTtBQUN4RixhQUFPLFNBQVM7QUFBQSxJQUNqQjtBQUVBLFVBQU0sUUFBc0I7QUFBQSxNQUMzQixHQUFHLG1CQUFtQixPQUFPO0FBQUEsTUFDN0IsV0FBVyxpQkFBaUI7QUFBQSxJQUM3QjtBQUNBLFNBQUssZUFBZSxJQUFJLEtBQUssS0FBSyxVQUFVLE9BQU8sU0FBUyxZQUFlLENBQUM7QUFDNUUsU0FBSyxtQkFBbUIsS0FBSyxTQUFTLE9BQU8sU0FBUyxPQUFPLFNBQVMsZ0JBQWdCO0FBTXRGLFFBQUksS0FBSyxpQkFBaUIsWUFBWSxHQUFHLEdBQUc7QUFDM0MsV0FBSyxpQkFBaUIsTUFBTSxHQUFHO0FBQUEsSUFDaEMsT0FBTztBQUNOLFdBQUssaUJBQWlCLFNBQVMsS0FBSyxPQUFPO0FBQUEsSUFDNUM7QUFFQSxTQUFLLFlBQVksTUFBTSw2Q0FBNkMsR0FBRyxLQUFLLE1BQU0sTUFBTSxTQUFTO0FBRWpHLFdBQU87QUFBQSxFQUNSO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUEsRUFjUSxtQkFBbUIsWUFBb0IsU0FBeUIsT0FBZ0IsT0FBaUIsa0JBQWlDO0FBQ3pJLFVBQU0sVUFBVSxvQkFBb0IsVUFBVTtBQUc5QyxVQUFNLGNBQTJCLEVBQUUsR0FBRyx5QkFBeUIsU0FBUyxPQUFPLEdBQUcsT0FBTyxvQkFBb0IsR0FBRztBQUNoSCxTQUFLLGFBQWEsSUFBSSxTQUFTO0FBQUEsTUFDOUIsU0FBUztBQUFBLE1BQ1QsU0FBUztBQUFBLE1BQ1QsT0FBTyxFQUFFLEdBQUcsZ0JBQWdCLFdBQVcsR0FBRyxPQUFPLFNBQVMsQ0FBQyxHQUFHLE1BQU07QUFBQSxNQUNwRSxPQUFPO0FBQUEsSUFDUixDQUFDO0FBQ0QsVUFBTSxRQUFRLEtBQUssZUFBZSxJQUFJLFVBQVU7QUFDaEQsUUFBSSxPQUFPO0FBT1YsWUFBTSxNQUFNLFFBQVEsQ0FBQyxXQUFXO0FBQ2hDLFlBQU0sTUFBTSxjQUFjO0FBQUEsSUFDM0I7QUFBQSxFQUNEO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUEsRUFvQkEsUUFBUSxTQUFjLFNBQWMsU0FBbU07QUFDdE8sVUFBTSxRQUFRLEtBQUssZUFBZSxJQUFJLE9BQU87QUFDN0MsUUFBSSxDQUFDLE9BQU87QUFDWCxXQUFLLFlBQVksS0FBSyx3REFBd0QsT0FBTyxFQUFFO0FBQ3ZGLGFBQU87QUFBQSxJQUNSO0FBQ0EsVUFBTSxlQUFlLE1BQU07QUFDM0IsVUFBTSxXQUFXLGFBQWEsTUFBTSxLQUFLLE9BQUssRUFBRSxhQUFhLE9BQU87QUFDcEUsUUFBSSxVQUFVO0FBQ2IsYUFBTztBQUFBLElBQ1I7QUFPQSxVQUFNLGlCQUFpQixhQUFhLGVBQWUsb0JBQW9CLE9BQU87QUFDOUUsVUFBTSxlQUFlLGFBQWEsTUFBTSxLQUFLLE9BQUssRUFBRSxhQUFhLGNBQWM7QUFDL0UsUUFBSSxnQkFBZ0IsQ0FBQyxhQUFhLFNBQVMsYUFBYSxPQUFPO0FBQzlELFdBQUssZ0JBQWdCLFNBQVMsZ0JBQWdCLGFBQWEsS0FBSztBQUFBLElBQ2pFO0FBRUEsVUFBTSxjQUEyQjtBQUFBLE1BQ2hDLEdBQUcseUJBQXlCLEtBQUssV0FBVyxTQUFTLEtBQUssR0FBRyxPQUFPO0FBQUEsTUFDcEUsT0FBTyxTQUFTLFNBQVM7QUFBQSxNQUN6QixRQUFRLGNBQWM7QUFBQSxNQUN0QixHQUFJLFNBQVMsU0FBUyxFQUFFLFFBQVEsUUFBUSxPQUFPLElBQUksQ0FBQztBQUFBLE1BQ3BELGVBQWUsU0FBUztBQUFBLElBQ3pCO0FBQ0EsU0FBSyxhQUFhLElBQUksU0FBUztBQUFBLE1BQzlCO0FBQUEsTUFDQSxTQUFTO0FBQUEsTUFDVCxPQUFPLEVBQUUsR0FBRyxnQkFBZ0IsV0FBVyxHQUFHLE9BQU8sU0FBUyxTQUFTLENBQUMsRUFBRTtBQUFBLE1BQ3RFLGNBQWMsU0FBUztBQUFBLE1BQ3ZCLE9BQU87QUFBQSxJQUNSLENBQUM7QUFDRCxTQUFLLHFCQUFxQixTQUFTLEVBQUUsTUFBTSxXQUFXLGtCQUFrQixTQUFTLFlBQVksQ0FBQztBQUM5RixXQUFPO0FBQUEsRUFDUjtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQSxFQU9BLDRCQUE0QixTQUFjLFNBQWMsU0FBNk87QUFDcFMsVUFBTSxRQUFRLEtBQUssZUFBZSxJQUFJLE9BQU87QUFDN0MsUUFBSSxDQUFDLE9BQU87QUFDWCxXQUFLLFlBQVksS0FBSyw0RUFBNEUsT0FBTyxFQUFFO0FBQzNHLGFBQU87QUFBQSxJQUNSO0FBQ0EsVUFBTSxlQUFlLE1BQU07QUFDM0IsVUFBTSxXQUFXLGFBQWEsTUFBTSxLQUFLLE9BQUssRUFBRSxhQUFhLE9BQU87QUFDcEUsUUFBSSxVQUFVO0FBQ2IsWUFBTSxnQkFBZ0IsS0FBSyxhQUFhLElBQUksT0FBTztBQUNuRCxVQUFJLGlCQUFpQixDQUFDLGNBQWMsU0FBUyxRQUFRLFVBQVU7QUFDOUQsc0JBQWMsZUFBZSxRQUFRO0FBQ3JDLHNCQUFjLFFBQVEsUUFBUTtBQUM5QixzQkFBYyxXQUFXLFFBQVE7QUFBQSxNQUNsQztBQUNBLGFBQU87QUFBQSxJQUNSO0FBQ0EsVUFBTSxjQUEyQjtBQUFBLE1BQ2hDLEdBQUcseUJBQXlCLEtBQUssV0FBVyxTQUFTLEtBQUssR0FBRyxPQUFPO0FBQUEsTUFDcEUsT0FBTyxRQUFRLFNBQVM7QUFBQSxNQUN4QixRQUFRLGNBQWM7QUFBQTtBQUFBO0FBQUE7QUFBQSxNQUl0QixHQUFJLFFBQVEsU0FBUyxFQUFFLFFBQVEsUUFBUSxPQUFPLElBQUksQ0FBQztBQUFBLE1BQ25ELGVBQWUsUUFBUTtBQUFBLElBQ3hCO0FBQ0EsaUJBQWEsUUFBUSxDQUFDLEdBQUcsYUFBYSxPQUFPLFdBQVc7QUFDeEQsU0FBSyxhQUFhLElBQUksU0FBUztBQUFBLE1BQzlCO0FBQUEsTUFDQSxTQUFTO0FBQUEsTUFDVCxjQUFjLFFBQVE7QUFBQSxNQUN0QixPQUFPLFFBQVE7QUFBQSxNQUNmLFVBQVUsUUFBUTtBQUFBLE1BQ2xCLE9BQU87QUFBQSxJQUNSLENBQUM7QUFDRCxXQUFPO0FBQUEsRUFDUjtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUEsRUFTQSxXQUFXLFNBQWMsU0FBb0I7QUFDNUMsVUFBTSxRQUFRLEtBQUssZUFBZSxJQUFJLE9BQU87QUFDN0MsUUFBSSxDQUFDLFNBQVMsQ0FBQyxNQUFNLE1BQU0sTUFBTSxLQUFLLE9BQUssRUFBRSxhQUFhLE9BQU8sR0FBRztBQUNuRTtBQUFBLElBQ0Q7QUFDQSxVQUFNLGVBQWUsTUFBTTtBQUMzQixRQUFJLFlBQVksYUFBYSxlQUFlLGlCQUFpQixPQUFPLEdBQUc7QUFDdEUsV0FBSyxZQUFZLEtBQUssNERBQTRELE9BQU8sRUFBRTtBQUMzRjtBQUFBLElBQ0Q7QUFPQSxTQUFLLHNCQUFzQixTQUFTLE9BQU87QUFDM0MsU0FBSyxxQkFBcUIsT0FBTztBQUNqQyxTQUFLLHFCQUFxQixTQUFTLEVBQUUsTUFBTSxXQUFXLG9CQUFvQixNQUFNLFFBQVEsQ0FBQztBQUFBLEVBQzFGO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQSxFQU1BLGlDQUFpQyxTQUFvQjtBQUNwRCxlQUFXLFNBQVMsS0FBSyxhQUFhLE9BQU8sR0FBRztBQUMvQyxVQUFJLE1BQU0sWUFBWSxTQUFTO0FBQzlCLGNBQU0sUUFBUTtBQUFBLE1BQ2Y7QUFBQSxJQUNEO0FBQUEsRUFDRDtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQSxFQVVBLGdCQUFnQixTQUFjLFNBQWMsT0FBcUI7QUFDaEUsVUFBTSxZQUFZLEtBQUssYUFBYSxJQUFJLE9BQU8sR0FBRztBQUNsRCxRQUFJLFdBQVc7QUFDZCxZQUFNLFFBQVEsS0FBSyxhQUFhLElBQUksT0FBTztBQUMzQyxZQUFNLFFBQVEsRUFBRSxHQUFHLFdBQVcsTUFBTTtBQUFBLElBQ3JDO0FBQ0EsU0FBSyxxQkFBcUIsU0FBUyxFQUFFLE1BQU0sV0FBVyxvQkFBb0IsTUFBTSxTQUFTLFNBQVMsRUFBRSxNQUFNLEVBQUUsQ0FBQztBQUFBLEVBQzlHO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUEsRUF1QkEsY0FBYyxTQUFvQjtBQUNqQyxVQUFNLFFBQVEsS0FBSyxlQUFlLElBQUksT0FBTztBQUM3QyxRQUFJLENBQUMsT0FBTztBQUNYO0FBQUEsSUFDRDtBQUNBLFNBQUssaUNBQWlDLE9BQU87QUFLN0MsUUFBSSxLQUFLLGlCQUFpQixRQUFRLE9BQU8sR0FBRztBQUMzQyxXQUFLLGlCQUFpQixNQUFNLE9BQU87QUFBQSxJQUNwQztBQVFBLFFBQUksS0FBSyx3QkFBd0IsT0FBTyxPQUFPLEdBQUc7QUFDakQsV0FBSyw4QkFBOEIsS0FBSyxFQUFFLFNBQVMsUUFBUSxNQUFNLENBQUM7QUFDbEUsV0FBSyxxQkFBcUIsZ0JBQWdCLEVBQUUsTUFBTSxXQUFXLDJCQUEyQixnQkFBZ0IsS0FBSyx3QkFBd0IsS0FBSyxDQUFDO0FBQUEsSUFDNUk7QUFJQSxlQUFXLFFBQVEsTUFBTSxNQUFNLE9BQU87QUFDckMsV0FBSyxxQkFBcUIsS0FBSyxRQUFRO0FBQUEsSUFDeEM7QUFDQSxTQUFLLHFCQUFxQixvQkFBb0IsT0FBTyxDQUFDO0FBQ3RELFNBQUssZUFBZSxPQUFPLE9BQU87QUFDbEMsU0FBSyxpQkFBaUIsT0FBTyxPQUFPO0FBQ3BDLFNBQUssWUFBWSxNQUFNLDRDQUE0QyxPQUFPLEVBQUU7QUFBQSxFQUM3RTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQSxFQWFBLGNBQWMsU0FBb0I7QUFDakMsVUFBTSxlQUFlLEtBQUssaUJBQWlCLFlBQVksT0FBTztBQUk5RCxTQUFLLGlCQUFpQixXQUFXLE9BQU87QUFNeEMsU0FBSyx5QkFBeUIsT0FBTztBQUNyQyxTQUFLLDBCQUEwQixPQUFPO0FBQ3RDLFNBQUssY0FBYyxPQUFPO0FBQzFCLFFBQUksY0FBYztBQUNqQixXQUFLLHVCQUF1QixLQUFLO0FBQUEsUUFDaEMsTUFBTTtBQUFBLFFBQ04sU0FBUztBQUFBLFFBQ1Q7QUFBQSxNQUNELENBQUM7QUFBQSxJQUNGO0FBQUEsRUFDRDtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUEsRUFhQSxlQUFlLFNBQWMsTUFBcUM7QUFDakUsU0FBSyxxQkFBcUIsU0FBUyxFQUFFLE1BQU0sV0FBVyxvQkFBb0IsT0FBTyxLQUFLLENBQUM7QUFBQSxFQUN4RjtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQSxFQWFBLGlCQUFpQixTQUFjLFFBQThDO0FBQzVFLFVBQU0sUUFBUSxLQUFLLGVBQWUsSUFBSSxPQUFPO0FBQzdDLFFBQUksQ0FBQyxPQUFPO0FBQ1gsV0FBSyxZQUFZLEtBQUssNkRBQTZELE9BQU8sRUFBRTtBQUM1RjtBQUFBLElBQ0Q7QUFDQSxVQUFNLE1BQU0sU0FBUztBQUFBLEVBQ3RCO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBLEVBT0EseUJBQXlCLFNBQWMsZ0JBQTREO0FBQ2xHLFVBQU0sUUFBUSxLQUFLLGVBQWUsSUFBSSxPQUFPO0FBQzdDLFFBQUksQ0FBQyxPQUFPO0FBQ1gsV0FBSyxZQUFZLEtBQUsscUVBQXFFLE9BQU8sRUFBRTtBQUNwRztBQUFBLElBQ0Q7QUFDQSxVQUFNLE1BQU0saUJBQWlCLGlCQUFpQixDQUFDLEdBQUcsY0FBYyxJQUFJO0FBQUEsRUFDckU7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQSxFQXFCQSxrQkFBa0IsY0FBbUIsZ0JBQWlDLGdCQUFnQixXQUFnQjtBQUNyRyxTQUFLLFlBQVksU0FBUyxjQUFjLGFBQWE7QUFDckQsV0FBTztBQUFBLEVBQ1I7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBLEVBWUEseUJBQXlCLFNBQWMsU0FBMkM7QUFDakYsVUFBTSxRQUFRLEtBQUssZUFBZSxJQUFJLE9BQU87QUFDN0MsUUFBSSxDQUFDLE9BQU87QUFDWCxXQUFLLFlBQVksS0FBSyxxRUFBcUUsT0FBTyxFQUFFO0FBQ3BHO0FBQUEsSUFDRDtBQUNBLFFBQUksaUJBQWlCLE1BQU0sU0FBUyxPQUFPLEdBQUc7QUFDN0M7QUFBQSxJQUNEO0FBRUEsVUFBTSxVQUFVO0FBRWhCLFNBQUssaUJBQWlCLFVBQVUsT0FBTztBQUFBLEVBQ3hDO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUEsRUFjQSxxQkFBcUIsU0FBYyxZQUFvRDtBQUN0RixVQUFNLFFBQVEsS0FBSyxlQUFlLElBQUksT0FBTztBQUM3QyxRQUFJLENBQUMsT0FBTztBQUNYLFdBQUssWUFBWSxLQUFLLGlFQUFpRSxPQUFPLEVBQUU7QUFDaEc7QUFBQSxJQUNEO0FBQ0EsVUFBTSxRQUFRLE1BQU07QUFNcEIsUUFBSSxZQUFZLE1BQU0sY0FBYyxDQUFDLEdBQUcsY0FBYyxDQUFDLEdBQUcsZ0JBQWdCLEdBQUc7QUFDNUU7QUFBQSxJQUNEO0FBR0EsVUFBTSxPQUFPLGFBQWEsV0FBVyxNQUFNLElBQUk7QUFDL0MsU0FBSyxxQkFBcUIsU0FBUztBQUFBLE1BQ2xDLE1BQU0sV0FBVztBQUFBLE1BQ2pCLFlBQVk7QUFBQSxJQUNiLENBQUM7QUFBQSxFQUNGO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUEsRUFpQkEsaUJBQWlCLFdBQXNCO0FBQ3RDLFFBQUksQ0FBQyxLQUFLLFlBQVksSUFBSSxTQUFTLEdBQUc7QUFDckM7QUFBQSxJQUNEO0FBQ0EsU0FBSyxxQkFBcUIsV0FBVztBQUFBLE1BQ3BDLE1BQU0sV0FBVztBQUFBLElBQ2xCLENBQUM7QUFDRCxTQUFLLFlBQVksT0FBTyxTQUFTO0FBQUEsRUFDbEM7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUEsRUFPQSx5QkFBeUIsU0FBb0I7QUFHNUMsVUFBTSxZQUFtQixDQUFDO0FBQzFCLGVBQVcsT0FBTyxLQUFLLFlBQVksS0FBSyxHQUFHO0FBQzFDLFlBQU0sU0FBUyxrQkFBa0IsR0FBRztBQUNwQyxVQUFJLFVBQVUsT0FBTyxlQUFlLFNBQVM7QUFDNUMsa0JBQVUsS0FBSyxHQUFHO0FBQUEsTUFDbkI7QUFBQSxJQUNEO0FBQ0EsZUFBVyxPQUFPLFdBQVc7QUFDNUIsV0FBSyxpQkFBaUIsR0FBRztBQUFBLElBQzFCO0FBQUEsRUFDRDtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBLEVBUUEsMEJBQTBCLFNBQW9CO0FBQzdDLFNBQUssYUFBYSxPQUFPLG9CQUFvQixPQUFPLENBQUM7QUFBQSxFQUN0RDtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBLEVBU0EsZ0JBQWdCLGVBQXdDO0FBQ3ZELFVBQU0sVUFBVSxpQkFBaUIsYUFBYSxJQUFJLGdCQUFnQixvQkFBb0IsYUFBYTtBQUNuRyxXQUFPLEtBQUssYUFBYSxJQUFJLE9BQU8sR0FBRyxPQUFPLFlBQVk7QUFBQSxFQUMzRDtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUEsRUFhQSxxQkFBcUIsU0FBYyxRQUEyQjtBQUM3RCxTQUFLLGNBQWMsU0FBUyxRQUFRLE1BQVM7QUFBQSxFQUM5QztBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQSxFQU9BLHFCQUFxQixTQUFjLFFBQWtJLFFBQXNCLGVBQTJEO0FBQ3JQLFdBQU8sS0FBSyxjQUFjLFNBQVMsUUFBUSxRQUFRLGFBQWE7QUFBQSxFQUNqRTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQSxFQVVBLG1CQUFtQixTQUFjLFFBQXFCLFFBQXNCLFFBQXNCO0FBQ2pHLFVBQU0sV0FBMkI7QUFBQSxNQUNoQztBQUFBLE1BQ0E7QUFBQSxNQUNBLFdBQVcsRUFBRSxLQUFLO0FBQUEsTUFDbEI7QUFBQSxNQUNBLGlCQUFpQjtBQUFBLElBQ2xCO0FBQ0EsU0FBSyxZQUFZLE1BQU0sNERBQTRELFNBQVMsU0FBUyxhQUFhLFNBQVMsT0FBTyxVQUFVLE9BQU8sSUFBSSxZQUFZLE9BQU8sUUFBUSxJQUFJLE9BQU8sU0FBUyxZQUFZLE1BQU0sRUFBRTtBQUMxTixTQUFLLG1CQUFtQixLQUFLLFFBQVE7QUFBQSxFQUN0QztBQUFBO0FBQUEsRUFJUSxxQkFBcUIsTUFBaUI7QUFDN0MsVUFBTSxRQUFRLEtBQUssYUFBYSxJQUFJLElBQUk7QUFDeEMsUUFBSSxPQUFPO0FBQ1YsWUFBTSxRQUFRO0FBQ2QsV0FBSyxhQUFhLE9BQU8sSUFBSTtBQUFBLElBQzlCO0FBQUEsRUFDRDtBQUFBLEVBRVEsd0JBQXdCLFNBQWMsV0FBeUM7QUFDdEYsVUFBTSxXQUFXLElBQUksSUFBSSxVQUFVLElBQUksYUFBVyxRQUFRLFFBQVEsQ0FBQztBQUNuRSxlQUFXLFdBQVcsV0FBVztBQUNoQyxZQUFNLFdBQVcsS0FBSyxhQUFhLElBQUksUUFBUSxRQUFRO0FBQ3ZELFVBQUksVUFBVTtBQUNiLGlCQUFTLFVBQVU7QUFDbkIsWUFBSSxTQUFTLE9BQU87QUFDbkIsbUJBQVMsUUFBUSxFQUFFLEdBQUcsU0FBUyxPQUFPLEdBQUcsUUFBUTtBQUFBLFFBQ2xEO0FBQUEsTUFDRCxPQUFPO0FBQ04sYUFBSyxhQUFhLElBQUksUUFBUSxVQUFVO0FBQUEsVUFDdkM7QUFBQSxVQUNBO0FBQUEsVUFDQSxPQUFPO0FBQUEsUUFDUixDQUFDO0FBQUEsTUFDRjtBQUFBLElBQ0Q7QUFDQSxlQUFXLENBQUMsTUFBTSxLQUFLLEtBQUssS0FBSyxjQUFjO0FBQzlDLFVBQUksTUFBTSxZQUFZLFdBQVcsQ0FBQyxTQUFTLElBQUksSUFBSSxHQUFHO0FBQ3JELGFBQUsscUJBQXFCLElBQUk7QUFBQSxNQUMvQjtBQUFBLElBQ0Q7QUFBQSxFQUNEO0FBQUEsRUFFUSxjQUFjLFNBQWMsUUFBcUIsUUFBa0MsZUFBMkQ7QUFDckosUUFBSSxpQkFBMEI7QUFDOUIsUUFBSSxPQUFPLFNBQVMsV0FBVyxxQkFBcUIsT0FBTyxTQUFTO0FBQ25FLGVBQVM7QUFBQSxRQUNSLEdBQUc7QUFBQSxRQUNILFFBQVEsdUNBQXVDLEtBQUssWUFBWSxPQUFPLE1BQU07QUFBQSxNQUM5RTtBQUFBLElBQ0Q7QUFFQSxRQUFJLGFBQWEsTUFBTSxHQUFHO0FBT3pCLFVBQUksT0FBTyxTQUFTLFdBQVcscUJBQXFCLEtBQUssV0FBVyxRQUFRO0FBQzNFLGNBQU0sVUFBVSxLQUFLLFdBQVcsT0FBTztBQUN2QyxjQUFNLFFBQVEsT0FBTztBQUNyQixjQUFNLFNBQVMsT0FBTyxVQUNuQixPQUFPLFNBQVMsS0FBSyxJQUNyQixPQUFPLEVBQUUsR0FBRyxTQUFTLEdBQUcsTUFBTSxHQUFHLE9BQU87QUFDM0MsWUFBSSxRQUFRO0FBQ1gsaUJBQU8sS0FBSztBQUFBLFFBQ2I7QUFBQSxNQUNEO0FBQ0EsV0FBSyxhQUFhLFlBQVksS0FBSyxZQUFZLFFBQXNCLEtBQUssSUFBSTtBQUM5RSx1QkFBaUIsS0FBSztBQUFBLElBQ3ZCO0FBRUEsUUFBSSxnQkFBZ0IsTUFBTSxHQUFHO0FBQzVCLFlBQU0sZ0JBQWdCO0FBQ3RCLFlBQU0sTUFBTTtBQUNaLFlBQU0sUUFBUSxLQUFLLGVBQWUsSUFBSSxHQUFHO0FBQ3pDLFVBQUksT0FBTztBQUNWLGNBQU0sZ0JBQWdCLE1BQU07QUFDNUIsY0FBTSxXQUFXLGVBQWUsZUFBZSxlQUFlLEtBQUssSUFBSTtBQUN2RSxjQUFNLGlCQUFpQixDQUFDLEtBQUssb0JBQW9CLGVBQWUsUUFBUTtBQUN4RSxjQUFNLFFBQVE7QUFDZCxhQUFLLHdCQUF3QixLQUFLLFNBQVMsS0FBSztBQUVoRCxZQUFJLGNBQWMsVUFBVSxTQUFTLE9BQU87QUFDM0MsZUFBSyx5QkFBeUIsS0FBSyxFQUFFLFNBQVMsS0FBSyxPQUFPLFNBQVMsTUFBTSxDQUFDO0FBQUEsUUFDM0U7QUFDQSxZQUFJLGNBQWMsU0FBUyxXQUFXLHNCQUFzQjtBQUMzRCxlQUFLLDBCQUEwQixLQUFLLEVBQUUsU0FBUyxLQUFLLFVBQVUsY0FBYyxRQUFRLFNBQVMsU0FBUyxRQUFRLGNBQWMsQ0FBQztBQUFBLFFBQzlIO0FBS0EsWUFBSSxjQUFjLHVCQUF1QixTQUFTLG9CQUFvQjtBQUNyRSxlQUFLLHNDQUFzQyxLQUFLLEVBQUUsU0FBUyxJQUFJLENBQUM7QUFBQSxRQUNqRTtBQUlBLFlBQUksZ0JBQWdCO0FBQ25CLGVBQUssaUJBQWlCLFVBQVUsR0FBRztBQUFBLFFBQ3BDO0FBRUEseUJBQWlCO0FBQUEsTUFDbEIsV0FBVyxDQUFDLGlCQUFpQixHQUFHLEdBQUc7QUFDbEMsYUFBSyxZQUFZLEtBQUssdURBQXVELEdBQUcsVUFBVSxPQUFPLElBQUksRUFBRTtBQUFBLE1BQ3hHO0FBQUEsSUFDRDtBQUVBLFFBQUksYUFBYSxNQUFNLEdBQUc7QUFDekIsVUFBSSxDQUFDLGlCQUFpQixPQUFPLEdBQUc7QUFDL0IsY0FBTSxJQUFJLE1BQU0sdUVBQXVFLE9BQU8sVUFBVSxPQUFPLElBQUksRUFBRTtBQUFBLE1BQ3RIO0FBRUEsWUFBTSxhQUFhO0FBQ25CLFlBQU0sYUFBYSxtQ0FBbUMsT0FBTztBQUM3RCxZQUFNLFlBQVksS0FBSyxhQUFhLElBQUksT0FBTztBQUMvQyxZQUFNLE9BQU8sV0FBVztBQUN4QixVQUFJLFFBQVEsYUFBYSxlQUFlLFFBQVc7QUFDbEQsY0FBTSxVQUFVLFlBQVksTUFBTSxZQUFZLEtBQUssSUFBSTtBQUN2RCxrQkFBVSxRQUFRO0FBQ2xCLGFBQUssb0JBQW9CLFlBQVksU0FBUyxNQUFNLE9BQU87QUFDM0QseUJBQWlCO0FBQUEsTUFDbEIsT0FBTztBQUNOLGFBQUssWUFBWSxLQUFLLG9EQUFvRCxPQUFPLFVBQVUsT0FBTyxJQUFJLEVBQUU7QUFBQSxNQUN6RztBQUFBLElBQ0Q7QUFFQSxRQUFJLGtCQUFrQixNQUFNLEdBQUc7QUFDOUIsWUFBTSxrQkFBa0I7QUFDeEIsWUFBTSxNQUFNO0FBQ1osWUFBTSxRQUFRLEtBQUssWUFBWSxJQUFJLEdBQUc7QUFDdEMsVUFBSSxDQUFDLE9BQU87QUFLWCxhQUFLLFlBQVksS0FBSyx5REFBeUQsR0FBRyxVQUFVLE9BQU8sSUFBSSxFQUFFO0FBQ3pHLGVBQU87QUFBQSxNQUNSO0FBQ0EsWUFBTSxXQUFXLGlCQUFpQixPQUFPLGlCQUFpQixLQUFLLElBQUk7QUFDbkUsVUFBSSxhQUFhLE9BQU87QUFDdkIsYUFBSyxZQUFZLElBQUksS0FBSyxRQUFRO0FBQUEsTUFDbkM7QUFDQSx1QkFBaUI7QUFBQSxJQUNsQjtBQUVBLFFBQUksb0JBQW9CLE1BQU0sR0FBRztBQUNoQyxZQUFNLG9CQUFvQjtBQUMxQixZQUFNLE1BQU07QUFHWixZQUFNLFFBQVEsS0FBSyxhQUFhLElBQUksR0FBRyxLQUFLLEVBQUUsYUFBYSxDQUFDLEVBQUU7QUFDOUQsWUFBTSxXQUFXLG1CQUFtQixPQUFPLG1CQUFtQixLQUFLLElBQUk7QUFDdkUsVUFBSSxhQUFhLE9BQU87QUFDdkIsYUFBSyxhQUFhLElBQUksS0FBSyxRQUFRO0FBQUEsTUFDcEM7QUFDQSx1QkFBaUI7QUFBQSxJQUNsQjtBQUdBLFVBQU0sV0FBMkI7QUFBQSxNQUNoQztBQUFBLE1BQ0E7QUFBQSxNQUNBLFdBQVcsRUFBRSxLQUFLO0FBQUEsTUFDbEI7QUFBQSxJQUNEO0FBRUEsU0FBSyxZQUFZLE1BQU0sa0RBQWtELFNBQVMsU0FBUyxhQUFhLFNBQVMsT0FBTyxVQUFVLE9BQU8sSUFBSSxHQUFHLFNBQVMsWUFBWSxPQUFPLFFBQVEsSUFBSSxPQUFPLFNBQVMsS0FBSyxFQUFFLEVBQUU7QUFDak4sU0FBSyxtQkFBbUIsS0FBSyxRQUFRO0FBRXJDLFdBQU87QUFBQSxFQUNSO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUEsRUFXUSxzQkFBc0IsWUFBb0IsU0FBdUI7QUFDeEUsVUFBTSxjQUFjLEtBQUssd0JBQXdCLElBQUksVUFBVTtBQUMvRCxRQUFJLENBQUMsZUFBZSxDQUFDLFlBQVksT0FBTyxPQUFPLEdBQUc7QUFDakQ7QUFBQSxJQUNEO0FBRUEsUUFBSSxZQUFZLFNBQVMsR0FBRztBQUMzQixXQUFLLHdCQUF3QixPQUFPLFVBQVU7QUFDOUMsV0FBSyw4QkFBOEIsS0FBSyxFQUFFLFNBQVMsWUFBWSxRQUFRLE1BQU0sQ0FBQztBQUM5RSxXQUFLLHFCQUFxQixnQkFBZ0IsRUFBRSxNQUFNLFdBQVcsMkJBQTJCLGdCQUFnQixLQUFLLHdCQUF3QixLQUFLLENBQUM7QUFBQSxJQUM1STtBQUFBLEVBQ0Q7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBLEVBa0JRLG9CQUFvQixZQUFvQixTQUFpQixNQUFpQixNQUF1QjtBQUd4RyxRQUFJLEtBQUssTUFBTSxTQUFTLEtBQUssS0FBSyxZQUFZO0FBQzdDLFdBQUssaUJBQWlCLFVBQVU7QUFBQSxJQUNqQztBQU1BLFVBQU0sWUFBWSxDQUFDLENBQUMsS0FBSztBQUN6QixVQUFNLFlBQVksQ0FBQyxDQUFDLEtBQUs7QUFDekIsUUFBSSxjQUFjLFdBQVc7QUFDNUIsVUFBSSxXQUFXO0FBQ2QsWUFBSSxjQUFjLEtBQUssd0JBQXdCLElBQUksVUFBVTtBQUM3RCxjQUFNLG1CQUFtQixDQUFDLENBQUMsYUFBYTtBQUN4QyxZQUFJLENBQUMsYUFBYTtBQUNqQix3QkFBYyxvQkFBSSxJQUFZO0FBQzlCLGVBQUssd0JBQXdCLElBQUksWUFBWSxXQUFXO0FBQUEsUUFDekQ7QUFDQSxvQkFBWSxJQUFJLE9BQU87QUFDdkIsWUFBSSxDQUFDLGtCQUFrQjtBQUN0QixlQUFLLDhCQUE4QixLQUFLLEVBQUUsU0FBUyxZQUFZLFFBQVEsS0FBSyxDQUFDO0FBQzdFLGVBQUsscUJBQXFCLGdCQUFnQixFQUFFLE1BQU0sV0FBVywyQkFBMkIsZ0JBQWdCLEtBQUssd0JBQXdCLEtBQUssQ0FBQztBQUFBLFFBQzVJO0FBQUEsTUFDRCxPQUFPO0FBQ04sYUFBSyxzQkFBc0IsWUFBWSxPQUFPO0FBQUEsTUFDL0M7QUFBQSxJQUNEO0FBRUEsVUFBTSxRQUFRLEtBQUssZUFBZSxJQUFJLFVBQVU7QUFDaEQsUUFBSSxDQUFDLE9BQU87QUFDWDtBQUFBLElBQ0Q7QUFDQSxVQUFNLGVBQWUsTUFBTTtBQUkzQixVQUFNLFlBQVkscUJBQXFCLElBQUk7QUFDM0MsVUFBTSxZQUFZLGFBQWEsTUFBTSxLQUFLLE9BQUssRUFBRSxhQUFhLE9BQU87QUFDckUsVUFBTSxRQUFRLGFBQWEsTUFBTSxJQUFJLE9BQUssRUFBRSxhQUFhLFVBQVUsWUFBWSxDQUFDO0FBTWhGLFFBQUksV0FBVyxXQUFXLFVBQVUsUUFBUTtBQUMzQyxXQUFLLHFCQUFxQixZQUFZO0FBQUEsUUFDckMsTUFBTSxXQUFXO0FBQUEsUUFDakIsTUFBTTtBQUFBLFFBQ04sU0FBUyxFQUFFLFFBQVEsVUFBVSxRQUFRLFVBQVUsVUFBVSxTQUFTO0FBQUEsTUFDbkUsQ0FBQztBQUFBLElBQ0Y7QUFFQSxVQUFNLFlBQVksS0FBSyx3QkFBd0IsT0FBTyxhQUFhLFdBQVc7QUFDOUUsVUFBTSxZQUFZLFVBQVUsV0FBVyxTQUFZLEtBQUssb0JBQW9CLGFBQWEsUUFBUSxVQUFVLE1BQU0sSUFBSSxhQUFhO0FBQ2xJLFVBQU0sZ0JBQWdCLGNBQWMsYUFBYTtBQUNqRCxVQUFNLGtCQUFrQixVQUFVLGFBQWEsYUFBYTtBQUM1RCxVQUFNLFFBQVE7QUFBQSxNQUNiLEdBQUc7QUFBQSxNQUNIO0FBQUEsTUFDQSxHQUFJLGdCQUFnQixFQUFFLFFBQVEsVUFBVSxJQUFJO0FBQUEsTUFDNUMsR0FBSSxrQkFBa0IsRUFBRSxVQUFVLFVBQVUsU0FBUyxJQUFJO0FBQUEsSUFDMUQ7QUFHQSxVQUFNLGdCQUFnQixVQUFVLGVBQWUsU0FBWSxJQUFJLEtBQUssVUFBVSxVQUFVLEVBQUUsWUFBWSxJQUFJO0FBQzFHLFVBQU0sb0JBQW9CLGtCQUFrQixVQUFhLGtCQUFrQixNQUFNO0FBQ2pGLFFBQUksbUJBQW1CO0FBQ3RCLFlBQU0sYUFBYTtBQUFBLElBQ3BCO0FBRUEsUUFBSSxpQkFBaUIsbUJBQW1CLG1CQUFtQjtBQUMxRCxXQUFLLGlCQUFpQixVQUFVLFVBQVU7QUFBQSxJQUMzQztBQUFBLEVBQ0Q7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBLEVBWVEsd0JBQXdCLE9BQStCLGFBQWtHO0FBQ2hLLFFBQUksTUFBTSxXQUFXLEdBQUc7QUFDdkIsYUFBTyxDQUFDO0FBQUEsSUFDVDtBQUNBLFVBQU0sZUFBZSxFQUFFLGNBQWMsU0FBUyxjQUFjO0FBQzVELFVBQU0sUUFBUSxnQkFBZ0IsU0FBWSxNQUFNLEtBQUssT0FBSyxFQUFFLGFBQWEsV0FBVyxJQUFJLFdBQ3BGLE1BQU0sT0FBTyxDQUFDLEdBQUcsTUFBTSxLQUFLLE1BQU0sRUFBRSxVQUFVLElBQUksS0FBSyxNQUFNLEVBQUUsVUFBVSxJQUFJLElBQUksQ0FBQztBQUN0RixRQUFJLFNBQVMsS0FBSyxTQUFTO0FBQzNCLFFBQUksU0FBUztBQUNiLFVBQU0sWUFBWSxNQUFNLEtBQUssUUFBTSxFQUFFLFNBQVMsY0FBYyxXQUFXLGNBQWMsS0FBSztBQUMxRixVQUFNLFlBQVksTUFBTSxLQUFLLFFBQU0sRUFBRSxTQUFTLGNBQWMsaUJBQWlCLGNBQWMsV0FBVztBQUd0RyxVQUFNLGlCQUFpQixNQUFNLEtBQUssUUFBTSxFQUFFLFNBQVMsY0FBYyxpQkFBaUIsY0FBYyxVQUFVO0FBQzFHLFFBQUksV0FBVztBQUNkLGVBQVMsY0FBYztBQUN2QixlQUFTO0FBQUEsSUFDVixXQUFXLFdBQVc7QUFDckIsZUFBUyxjQUFjO0FBQ3ZCLGVBQVM7QUFBQSxJQUNWLFdBQVcsZ0JBQWdCO0FBQzFCLGVBQVMsY0FBYztBQUN2QixlQUFTO0FBQUEsSUFDVjtBQUNBLFVBQU0sYUFBYSxNQUFNLE9BQU8sQ0FBQyxLQUFLLE1BQU0sS0FBSyxJQUFJLEtBQUssS0FBSyxNQUFNLEVBQUUsVUFBVSxDQUFDLEdBQUcsQ0FBQztBQUN0RixXQUFPLEVBQUUsUUFBUSxVQUFVLE9BQU8sVUFBVSxXQUFXO0FBQUEsRUFDeEQ7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUEsRUFPUSxvQkFBb0IsZUFBOEIsWUFBMEM7QUFDbkcsVUFBTSxZQUFZLGlCQUFpQixjQUFjLFNBQVMsY0FBYztBQUN4RSxVQUFNLGVBQWUsYUFBYSxFQUFFLGNBQWMsU0FBUyxjQUFjO0FBQ3pFLFdBQU8sZUFBZTtBQUFBLEVBQ3ZCO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUEsRUFXQSxhQUFhLFVBQWlEO0FBQzdELFNBQUssdUJBQXVCLEtBQUs7QUFBQSxNQUNoQyxNQUFNO0FBQUEsTUFDTixTQUFTO0FBQUEsTUFDVCxHQUFHO0FBQUEsSUFDSixDQUFDO0FBQUEsRUFDRjtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQSxFQVVBLGlCQUFpQixRQUFtRDtBQUNuRSxTQUFLLHVCQUF1QixLQUFLO0FBQUEsTUFDaEMsTUFBTTtBQUFBLE1BQ04sU0FBUztBQUFBLE1BQ1QsR0FBRztBQUFBLElBQ0osQ0FBQztBQUFBLEVBQ0Y7QUFBQSxFQUVTLFVBQWdCO0FBQ3hCLGVBQVcsU0FBUyxLQUFLLGFBQWEsT0FBTyxHQUFHO0FBQy9DLFlBQU0sUUFBUTtBQUFBLElBQ2Y7QUFDQSxTQUFLLGFBQWEsTUFBTTtBQUN4QixVQUFNLFFBQVE7QUFBQSxFQUNmO0FBQ0Q7QUE1Z0RhLHdCQUFOO0FBQUEsRUEyRUo7QUFBQSxHQTNFVTtBQXNoRE4sU0FBUyx1QkFBdUIsY0FBcUMsU0FBd0M7QUFDbkgsUUFBTSxZQUFZLGFBQWEsYUFBYSxPQUFPO0FBQ25ELE1BQUksV0FBVztBQUNkLFdBQU87QUFBQSxFQUNSO0FBQ0EsTUFBSSxDQUFDLGlCQUFpQixPQUFPLEdBQUc7QUFDL0IsV0FBTyxhQUFhLG9CQUFvQixPQUFPO0FBQUEsRUFDaEQ7QUFDQSxNQUFJLGlCQUFpQixPQUFPLEdBQUc7QUFDOUIsV0FBTyxhQUFhLG9CQUFvQixtQ0FBbUMsT0FBTyxDQUFDO0FBQUEsRUFDcEY7QUFDQSxTQUFPO0FBQ1I7IiwKICAibmFtZXMiOiBbIlNlc3Npb25Vc2UiXQp9Cg==
