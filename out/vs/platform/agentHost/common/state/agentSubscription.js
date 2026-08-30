import { assertNever } from "../../../../base/common/assert.js";
import { Emitter } from "../../../../base/common/event.js";
import { Disposable } from "../../../../base/common/lifecycle.js";
import { ResourceMap } from "../../../../base/common/map.js";
import { observableFromEvent } from "../../../../base/common/observable.js";
import { URI } from "../../../../base/common/uri.js";
import { ActionType, isChangesetAction, isChatAction, isAnnotationsAction, isSessionAction } from "./sessionActions.js";
import { changesetReducer, chatReducer, annotationsReducer, rootReducer, sessionReducer } from "./sessionReducers.js";
import { terminalReducer } from "./protocol/reducers.js";
import { isAhpRootChannel, StateComponents } from "./sessionState.js";
class BaseAgentSubscription extends Disposable {
  constructor(clientId, log) {
    super();
    this._onDidChange = this._register(new Emitter());
    this.onDidChange = this._onDidChange.event;
    this._onDidError = this._register(new Emitter());
    this.onDidError = this._onDidError.event;
    this._onWillApplyAction = this._register(new Emitter());
    this.onWillApplyAction = this._onWillApplyAction.event;
    this._onDidApplyAction = this._register(new Emitter());
    this.onDidApplyAction = this._onDidApplyAction.event;
    this._clientId = clientId;
    this._log = log;
  }
  get value() {
    if (this._error) {
      return this._error;
    }
    return this._getOptimisticState() ?? this._confirmedState;
  }
  get verifiedValue() {
    return this._confirmedState;
  }
  /**
   * Apply an initial snapshot from the server.
   */
  handleSnapshot(state, fromSeq) {
    this._confirmedState = state;
    this._error = void 0;
    this._onSnapshotApplied(fromSeq);
    this._onDidChange.fire(this.value);
  }
  /**
   * Mark this subscription as failed.
   */
  setError(error) {
    this._error = error;
    this._onDidError.fire(error);
  }
  /**
   * Process an incoming action envelope. The subscription determines
   * whether the action is relevant via {@link _isRelevantEnvelope}.
   */
  receiveEnvelope(envelope) {
    if (!this._isRelevantEnvelope(envelope)) {
      return;
    }
    if (this._confirmedState === void 0) {
      if (!this._bufferedEnvelopes) {
        this._bufferedEnvelopes = [];
      }
      this._bufferedEnvelopes.push(envelope);
      return;
    }
    const isOwnAction = envelope.origin?.clientId === this._clientId;
    this._onWillApplyAction.fire(envelope);
    this._reconcile(envelope, isOwnAction);
    this._onDidApplyAction.fire(envelope);
  }
  /** Return optimistic state if write-ahead is active, otherwise `undefined`. */
  _getOptimisticState() {
    return void 0;
  }
  /** Hook called after a snapshot is applied. Replays buffered actions. */
  _onSnapshotApplied(_fromSeq) {
    const buffered = this._bufferedEnvelopes;
    if (buffered) {
      this._bufferedEnvelopes = void 0;
      for (const envelope of buffered) {
        if (envelope.serverSeq > _fromSeq) {
          const isOwnAction = envelope.origin?.clientId === this._clientId;
          this._reconcile(envelope, isOwnAction);
        }
      }
    }
  }
  /**
   * Default reconciliation: apply to confirmed, fire change event.
   * Session subscriptions override this for write-ahead.
   */
  _reconcile(envelope, _isOwnAction) {
    this._confirmedState = this._applyReducer(this._confirmedState, envelope.action);
    this._onDidChange.fire(this.value);
  }
}
class RootStateSubscription extends BaseAgentSubscription {
  _applyReducer(state, action) {
    return rootReducer(state, action, this._log);
  }
  _isRelevantEnvelope(envelope) {
    return isAhpRootChannel(envelope.channel) && envelope.action.type.startsWith("root/");
  }
}
class SessionStateSubscription extends BaseAgentSubscription {
  constructor(sessionUri, clientId, seqAllocator, log) {
    super(clientId, log);
    this._pendingActions = [];
    this._sessionUri = sessionUri;
    this._seqAllocator = seqAllocator;
  }
  /**
   * Optimistically apply a session action. Returns the clientSeq to send
   * to the server so it can echo back for reconciliation.
   */
  applyOptimistic(action) {
    const clientSeq = this._seqAllocator();
    this._pendingActions.push({ clientSeq, action });
    const base = this._optimisticState ?? this.verifiedValue;
    if (base) {
      this._optimisticState = sessionReducer(base, action, this._log);
      this._onDidChange.fire(this._optimisticState);
    }
    return clientSeq;
  }
  _getOptimisticState() {
    return this._optimisticState;
  }
  _applyReducer(state, action) {
    return sessionReducer(state, action, this._log);
  }
  _isRelevantEnvelope(envelope) {
    return isSessionAction(envelope.action) && envelope.channel === this._sessionUri;
  }
  _onSnapshotApplied(fromSeq) {
    super._onSnapshotApplied(fromSeq);
    this._recomputeOptimistic();
  }
  _reconcile(envelope, isOwnAction) {
    if (isOwnAction && envelope.origin) {
      const idx = this._pendingActions.findIndex((p) => p.clientSeq === envelope.origin.clientSeq);
      if (idx !== -1) {
        if (!envelope.rejectionReason) {
          this._confirmedApply(envelope.action);
        }
        this._pendingActions.splice(idx, 1);
      } else if (!envelope.rejectionReason) {
        this._confirmedApply(envelope.action);
      }
    } else if (!envelope.rejectionReason) {
      this._confirmedApply(envelope.action);
    }
    this._recomputeOptimistic();
  }
  _confirmedApply(action) {
    if (this._confirmedState) {
      this._confirmedState = this._applyReducer(this._confirmedState, action);
    }
  }
  _recomputeOptimistic() {
    const confirmed = this._confirmedState;
    if (!confirmed) {
      this._optimisticState = void 0;
      return;
    }
    if (this._pendingActions.length === 0) {
      this._optimisticState = void 0;
      this._onDidChange.fire(confirmed);
      return;
    }
    let state = confirmed;
    for (const pending of this._pendingActions) {
      state = sessionReducer(state, pending.action, this._log);
    }
    this._optimisticState = state;
    this._onDidChange.fire(state);
  }
  /**
   * Clear pending actions for this session (e.g., on unsubscribe).
   */
  clearPending() {
    this._pendingActions.length = 0;
    this._optimisticState = void 0;
  }
  /**
   * Snapshot of the currently-pending optimistic actions, with the session
   * URI included so callers can re-issue them across a reconnect. The
   * actions remain in the subscription so the optimistic state continues
   * to reflect them — the client must explicitly drop entries echoed back
   * by the server.
   */
  getPendingActions() {
    return this._pendingActions.map((p) => ({ clientSeq: p.clientSeq, action: p.action, channel: this._sessionUri }));
  }
  /**
   * Drop the pending entry whose `clientSeq` matches the supplied value.
   * Used during reconnect to evict actions the server already echoed back
   * in the replay buffer so they're not resent.
   */
  dropPendingByClientSeq(clientSeq) {
    const idx = this._pendingActions.findIndex((p) => p.clientSeq === clientSeq);
    if (idx === -1) {
      return false;
    }
    this._pendingActions.splice(idx, 1);
    return true;
  }
}
class ChatStateSubscription extends BaseAgentSubscription {
  constructor(chatUri, clientId, seqAllocator, log) {
    super(clientId, log);
    this._pendingActions = [];
    this._chatUri = chatUri;
    this._seqAllocator = seqAllocator;
  }
  /**
   * Optimistically apply a chat action. Returns the clientSeq to send to
   * the server so it can echo back for reconciliation.
   */
  applyOptimistic(action) {
    const clientSeq = this._seqAllocator();
    this._pendingActions.push({ clientSeq, action });
    const base = this._optimisticState ?? this.verifiedValue;
    if (base) {
      this._optimisticState = chatReducer(base, action, this._log);
      this._onDidChange.fire(this._optimisticState);
    }
    return clientSeq;
  }
  _getOptimisticState() {
    return this._optimisticState;
  }
  _applyReducer(state, action) {
    return chatReducer(state, action, this._log);
  }
  _isRelevantEnvelope(envelope) {
    return isChatAction(envelope.action) && envelope.channel === this._chatUri;
  }
  _onSnapshotApplied(fromSeq) {
    super._onSnapshotApplied(fromSeq);
    this._recomputeOptimistic();
  }
  _reconcile(envelope, isOwnAction) {
    if (isOwnAction && envelope.origin) {
      const idx = this._pendingActions.findIndex((p) => p.clientSeq === envelope.origin.clientSeq);
      if (idx !== -1) {
        if (!envelope.rejectionReason) {
          this._confirmedApply(envelope.action);
        }
        this._pendingActions.splice(idx, 1);
      } else if (!envelope.rejectionReason) {
        this._confirmedApply(envelope.action);
      }
    } else if (!envelope.rejectionReason) {
      this._promotePendingTurnStartIfTerminal(envelope.action);
      this._confirmedApply(envelope.action);
    }
    this._recomputeOptimistic();
  }
  _promotePendingTurnStartIfTerminal(action) {
    if (!isChatAction(action)) {
      return;
    }
    if (action.type !== ActionType.ChatTurnComplete && action.type !== ActionType.ChatTurnCancelled && action.type !== ActionType.ChatError) {
      return;
    }
    const index = this._pendingActions.findIndex((p) => p.action.type === ActionType.ChatTurnStarted && p.action.turnId === action.turnId);
    if (index === -1) {
      return;
    }
    const [{ action: pendingAction }] = this._pendingActions.splice(index, 1);
    if (this._confirmedState && (!this._confirmedState.activeTurn || this._confirmedState.activeTurn.id !== action.turnId)) {
      this._confirmedState = this._applyReducer(this._confirmedState, pendingAction);
    }
  }
  _confirmedApply(action) {
    if (this._confirmedState) {
      this._confirmedState = this._applyReducer(this._confirmedState, action);
    }
  }
  _recomputeOptimistic() {
    const confirmed = this._confirmedState;
    if (!confirmed) {
      this._optimisticState = void 0;
      return;
    }
    if (this._pendingActions.length === 0) {
      this._optimisticState = void 0;
      this._onDidChange.fire(confirmed);
      return;
    }
    let state = confirmed;
    for (const pending of this._pendingActions) {
      state = chatReducer(state, pending.action, this._log);
    }
    this._optimisticState = state;
    this._onDidChange.fire(state);
  }
  clearPending() {
    this._pendingActions.length = 0;
    this._optimisticState = void 0;
  }
  getPendingActions() {
    return this._pendingActions.map((p) => ({ clientSeq: p.clientSeq, action: p.action, channel: this._chatUri }));
  }
  dropPendingByClientSeq(clientSeq) {
    const idx = this._pendingActions.findIndex((p) => p.clientSeq === clientSeq);
    if (idx === -1) {
      return false;
    }
    this._pendingActions.splice(idx, 1);
    return true;
  }
}
class TerminalStateSubscription extends BaseAgentSubscription {
  constructor(terminalUri, clientId, log) {
    super(clientId, log);
    this._terminalUri = terminalUri;
  }
  _applyReducer(state, action) {
    return terminalReducer(state, action, this._log);
  }
  _isRelevantEnvelope(envelope) {
    return envelope.action.type.startsWith("terminal/") && envelope.channel === this._terminalUri;
  }
}
class ChangesetStateSubscription extends BaseAgentSubscription {
  constructor(changesetUri, clientId, seqAllocator, log) {
    super(clientId, log);
    this._pendingActions = [];
    this._changesetUri = changesetUri;
    this._seqAllocator = seqAllocator;
  }
  /**
   * Optimistically apply a changeset action and return its client sequence.
   */
  applyOptimistic(action) {
    const clientSeq = this._seqAllocator();
    this._pendingActions.push({ clientSeq, action });
    const base = this._optimisticState ?? this.verifiedValue;
    if (base) {
      this._optimisticState = changesetReducer(base, action, this._log);
      this._onDidChange.fire(this._optimisticState);
    }
    return clientSeq;
  }
  _getOptimisticState() {
    return this._optimisticState;
  }
  _applyReducer(state, action) {
    return changesetReducer(state, action, this._log);
  }
  _isRelevantEnvelope(envelope) {
    return isChangesetAction(envelope.action) && envelope.channel === this._changesetUri;
  }
  _onSnapshotApplied(fromSeq) {
    super._onSnapshotApplied(fromSeq);
    this._recomputeOptimistic();
  }
  _reconcile(envelope, isOwnAction) {
    if (isOwnAction && envelope.origin) {
      const index = this._pendingActions.findIndex((pending) => pending.clientSeq === envelope.origin.clientSeq);
      if (index !== -1) {
        if (!envelope.rejectionReason) {
          this._confirmedApply(envelope.action);
        }
        this._pendingActions.splice(index, 1);
      } else {
        this._confirmedApply(envelope.action);
      }
    } else {
      this._confirmedApply(envelope.action);
    }
    this._recomputeOptimistic();
  }
  _confirmedApply(action) {
    if (this._confirmedState) {
      this._confirmedState = this._applyReducer(this._confirmedState, action);
    }
  }
  _recomputeOptimistic() {
    const confirmed = this._confirmedState;
    if (!confirmed) {
      this._optimisticState = void 0;
      return;
    }
    if (this._pendingActions.length === 0) {
      this._optimisticState = void 0;
      this._onDidChange.fire(confirmed);
      return;
    }
    let state = confirmed;
    for (const pending of this._pendingActions) {
      state = changesetReducer(state, pending.action, this._log);
    }
    this._optimisticState = state;
    this._onDidChange.fire(state);
  }
}
class AnnotationsStateSubscription extends BaseAgentSubscription {
  constructor(annotationsUri, clientId, seqAllocator, log) {
    super(clientId, log);
    this._pendingActions = [];
    this._annotationsUri = annotationsUri;
    this._seqAllocator = seqAllocator;
  }
  /**
   * Optimistically apply an annotations action. Returns the clientSeq to
   * send to the server so it can echo back for reconciliation.
   */
  applyOptimistic(action) {
    const clientSeq = this._seqAllocator();
    this._pendingActions.push({ clientSeq, action });
    const base = this._optimisticState ?? this.verifiedValue;
    if (base) {
      this._optimisticState = annotationsReducer(base, action, this._log);
      this._onDidChange.fire(this._optimisticState);
    }
    return clientSeq;
  }
  _getOptimisticState() {
    return this._optimisticState;
  }
  _applyReducer(state, action) {
    return annotationsReducer(state, action, this._log);
  }
  _isRelevantEnvelope(envelope) {
    return isAnnotationsAction(envelope.action) && envelope.channel === this._annotationsUri;
  }
  _onSnapshotApplied(fromSeq) {
    super._onSnapshotApplied(fromSeq);
    this._recomputeOptimistic();
  }
  _reconcile(envelope, isOwnAction) {
    if (isOwnAction && envelope.origin) {
      const idx = this._pendingActions.findIndex((p) => p.clientSeq === envelope.origin.clientSeq);
      if (idx !== -1) {
        if (!envelope.rejectionReason) {
          this._confirmedApply(envelope.action);
        }
        this._pendingActions.splice(idx, 1);
      } else {
        this._confirmedApply(envelope.action);
      }
    } else {
      this._confirmedApply(envelope.action);
    }
    this._recomputeOptimistic();
  }
  _confirmedApply(action) {
    if (this._confirmedState) {
      this._confirmedState = this._applyReducer(this._confirmedState, action);
    }
  }
  _recomputeOptimistic() {
    const confirmed = this._confirmedState;
    if (!confirmed) {
      this._optimisticState = void 0;
      return;
    }
    if (this._pendingActions.length === 0) {
      this._optimisticState = void 0;
      this._onDidChange.fire(confirmed);
      return;
    }
    let state = confirmed;
    for (const pending of this._pendingActions) {
      state = annotationsReducer(state, pending.action, this._log);
    }
    this._optimisticState = state;
    this._onDidChange.fire(state);
  }
}
class AgentSubscriptionManager extends Disposable {
  constructor(clientId, seqAllocator, log, subscribe, unsubscribe) {
    super();
    this._subscriptions = new ResourceMap();
    this._inflightCreates = new ResourceMap();
    this._referenceOwnerIds = 0;
    this._clientId = clientId;
    this._seqAllocator = seqAllocator;
    this._log = log;
    this._subscribe = subscribe;
    this._unsubscribe = unsubscribe;
    this._rootState = this._register(new RootStateSubscription(clientId, log));
  }
  /** The always-live root state subscription. */
  get rootState() {
    return this._rootState;
  }
  /**
   * Initialize the root state from a snapshot received during the
   * connection handshake.
   */
  handleRootSnapshot(state, fromSeq) {
    this._rootState.handleSnapshot(state, fromSeq);
  }
  /**
   * Returns an existing subscription without affecting its refcount.
   * Returns `undefined` if no subscription is active for the given resource.
   */
  getSubscriptionUnmanaged(resource) {
    const entry = this._subscriptions.get(resource);
    return entry?.sub;
  }
  /**
   * Returns the in-flight `createSession` Promise for this URI, or `undefined` if no create is pending. Used by
   * callers that need to gate their own work on a still-running eager `createSession` (e.g. the chat handler awaits
   * this before deciding whether the sessions provider's eager-create raced first send).
   */
  getInflightSessionCreate(resource) {
    return this._inflightCreates.get(resource);
  }
  /**
   * Register an in-flight `createSession` Promise for a session URI. Any
   * subscribe issued for this resource while the create is pending waits
   * for the Promise before issuing the wire-level subscribe.
   */
  trackSessionCreate(resource, promise) {
    this._inflightCreates.set(resource, promise);
    void promise.finally(() => {
      if (this._inflightCreates.get(resource) === promise) {
        this._inflightCreates.delete(resource);
      }
    }).catch(() => {
    });
  }
  /**
   * Get or create a refcounted subscription to any resource. Disposing
   * the returned reference decrements the refcount; when it reaches zero
   * the subscription is torn down and the server is notified.
   *
   * `owner` names the caller holding the reference so inspection surfaces
   * (see {@link getActiveSubscriptions}) can attribute who is retaining a
   * subscription. Use a stable, human-readable identifier such as the
   * acquiring class name.
   */
  getSubscription(kind, resource, owner) {
    const existing = this._subscriptions.get(resource);
    if (existing) {
      if (existing.sub.value instanceof Error) {
        this._subscriptions.delete(resource);
        this._disposeSubscriptionEntry(resource, existing);
      } else {
        existing.refCount++;
        return this._acquireReference(resource, existing, owner);
      }
    }
    const key = resource.toString();
    const sub = this._createSubscription(kind, key);
    const entry = { sub, kind, refCount: 1, holders: /* @__PURE__ */ new Map() };
    this._subscriptions.set(resource, entry);
    void (async () => {
      const inflight = this._inflightCreates.get(resource);
      if (inflight) {
        try {
          await inflight;
        } catch {
        }
      }
      try {
        const snapshot = await this._subscribe(resource);
        if (this._subscriptions.get(resource) === entry) {
          sub.handleSnapshot(snapshot.state, snapshot.fromSeq);
        }
      } catch (err) {
        if (this._subscriptions.get(resource) === entry) {
          sub.setError(err instanceof Error ? err : new Error(String(err)));
        }
      }
    })();
    return this._acquireReference(resource, entry, owner);
  }
  /**
   * Register `owner` as a holder of `entry` and return a reference whose
   * disposal removes that holder and releases the subscription. The
   * caller is responsible for the matching refcount increment (a fresh
   * entry starts at 1; an existing entry is bumped before calling this).
   */
  _acquireReference(resource, entry, owner) {
    const ownerId = ++this._referenceOwnerIds;
    entry.holders.set(ownerId, owner);
    let isDisposed = false;
    return {
      object: entry.sub,
      dispose: () => {
        if (isDisposed) {
          return;
        }
        isDisposed = true;
        entry.holders.delete(ownerId);
        this._releaseSubscription(resource, entry);
      }
    };
  }
  _disposeSubscriptionEntry(resource, entry) {
    this._tryUnsubscribe(resource);
    if (entry.sub instanceof SessionStateSubscription || entry.sub instanceof ChatStateSubscription) {
      entry.sub.clearPending();
    }
    entry.sub.dispose();
  }
  _tryUnsubscribe(resource) {
    try {
      this._unsubscribe(resource);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this._log(`Failed to unsubscribe ${resource.toString()}: ${message}`);
    }
  }
  /**
   * Route an incoming action envelope to all active subscriptions.
   */
  receiveEnvelope(envelope) {
    this._rootState.receiveEnvelope(envelope);
    for (const { sub } of this._subscriptions.values()) {
      sub.receiveEnvelope(envelope);
    }
  }
  /**
   * Dispatch a client action. Applies optimistically to the relevant
   * subscription if applicable, then returns the clientSeq.
   *
   * `channel` is the protocol URI string identifying the channel the
   * action targets (a session URI for session actions, etc.).
   */
  dispatchOptimistic(channel, action) {
    if (isSessionAction(action)) {
      const entry = this._subscriptions.get(URI.parse(channel));
      if (entry?.sub instanceof SessionStateSubscription) {
        return entry.sub.applyOptimistic(action);
      }
    } else if (isChatAction(action)) {
      const entry = this._subscriptions.get(URI.parse(channel));
      if (entry?.sub instanceof ChatStateSubscription) {
        return entry.sub.applyOptimistic(action);
      }
    } else if (isChangesetAction(action)) {
      const entry = this._subscriptions.get(URI.parse(channel));
      if (entry?.sub instanceof ChangesetStateSubscription) {
        return entry.sub.applyOptimistic(action);
      }
    } else if (isAnnotationsAction(action)) {
      const entry = this._subscriptions.get(URI.parse(channel));
      if (entry?.sub instanceof AnnotationsStateSubscription) {
        return entry.sub.applyOptimistic(action);
      }
    }
    return this._seqAllocator();
  }
  /**
   * URIs currently subscribed to via {@link getSubscription}. Used to
   * build the `subscriptions` payload for a `reconnect` RPC so the
   * server can restore them in one round-trip.
   *
   * Does NOT include the always-live root state, which the protocol
   * client manages separately.
   */
  currentSubscriptionUris() {
    return [...this._subscriptions.keys()];
  }
  /**
   * Read-only descriptors of every active resource subscription, for
   * inspection/debug surfaces. Does NOT include the always-live root
   * state, which the connection exposes separately via {@link rootState}.
   */
  getActiveSubscriptions() {
    const out = [];
    for (const [resource, entry] of this._subscriptions) {
      const value = entry.sub.value;
      const status = value === void 0 ? "pending" : value instanceof Error ? "error" : "snapshot";
      out.push({ resource, kind: entry.kind, refCount: entry.refCount, holders: this._summarizeHolders(entry), status });
    }
    return out;
  }
  /** Group an entry's holders by owner name, sorted by descending count. */
  _summarizeHolders(entry) {
    const counts = /* @__PURE__ */ new Map();
    for (const owner of entry.holders.values()) {
      counts.set(owner, (counts.get(owner) ?? 0) + 1);
    }
    return [...counts.entries()].map(([owner, count]) => ({ owner, count })).sort((a, b) => b.count - a.count);
  }
  /**
   * Snapshot of every pending optimistic action across all session
   * subscriptions. Callers use this to replay actions after a transport
   * reconnect; entries are kept on their subscriptions until they're
   * either echoed back by the server or explicitly dropped via
   * {@link dropPendingSessionAction}.
   */
  getPendingSessionActions() {
    const out = [];
    for (const { sub } of this._subscriptions.values()) {
      if (sub instanceof SessionStateSubscription || sub instanceof ChatStateSubscription) {
        out.push(...sub.getPendingActions());
      }
    }
    return out;
  }
  /**
   * Remove a single pending optimistic action for a session by its
   * `clientSeq`. Used during reconnect to evict actions the server
   * already processed (and replayed back to us) so they're not resent.
   */
  dropPendingSessionAction(sessionUri, clientSeq) {
    const entry = this._subscriptions.get(URI.parse(sessionUri));
    if (entry?.sub instanceof SessionStateSubscription || entry?.sub instanceof ChatStateSubscription) {
      entry.sub.dropPendingByClientSeq(clientSeq);
    }
  }
  /**
   * Apply a fresh snapshot to a subscribed resource — used when the server
   * responds to a `reconnect` request with `type: 'snapshot'` because the
   * replay buffer no longer covers the client's gap. Routes to the root
   * subscription when {@link ROOT_STATE_URI} matches, otherwise reseats the
   * matching entry in {@link _subscriptions}. Unknown resources are ignored.
   */
  applyReconnectSnapshot(resource, state, fromSeq, preservePending = false) {
    if (isAhpRootChannel(resource)) {
      this._rootState.handleSnapshot(state, fromSeq);
      return;
    }
    const entry = this._subscriptions.get(URI.parse(resource));
    if (!entry) {
      return;
    }
    if (!preservePending && (entry.sub instanceof SessionStateSubscription || entry.sub instanceof ChatStateSubscription)) {
      entry.sub.clearPending();
    }
    entry.sub.handleSnapshot(state, fromSeq);
  }
  /**
   * Mark a set of subscriptions as no longer resumable on the server
   * (reported via `ReconnectReplayResult.missing`). The subscriptions
   * themselves stay alive so consumers continue to hold valid references,
   * but their value transitions to an `Error` until they're recreated.
   */
  markSubscriptionsMissing(missing) {
    for (const resource of missing) {
      const entry = this._subscriptions.get(resource);
      if (entry) {
        if (entry.sub instanceof SessionStateSubscription || entry.sub instanceof ChatStateSubscription) {
          entry.sub.clearPending();
        }
        entry.sub.setError(new Error(`Subscription no longer available after reconnect: ${resource.toString()}`));
      }
    }
  }
  _createSubscription(kind, key) {
    switch (kind) {
      case StateComponents.Session:
        return new SessionStateSubscription(key, this._clientId, this._seqAllocator, this._log);
      case StateComponents.Chat:
        return new ChatStateSubscription(key, this._clientId, this._seqAllocator, this._log);
      case StateComponents.Terminal:
        return new TerminalStateSubscription(key, this._clientId, this._log);
      case StateComponents.Changeset:
        return new ChangesetStateSubscription(key, this._clientId, this._seqAllocator, this._log);
      case StateComponents.Annotations:
        return new AnnotationsStateSubscription(key, this._clientId, this._seqAllocator, this._log);
      case StateComponents.Root:
        throw new Error("_createSubscription: root subscription is managed separately");
      default:
        assertNever(kind, `_createSubscription: unsupported StateComponents kind: ${kind}`);
    }
  }
  _releaseSubscription(resource, expected) {
    const entry = this._subscriptions.get(resource);
    if (!entry || expected && entry !== expected) {
      return;
    }
    entry.refCount--;
    if (entry.refCount <= 0) {
      this._subscriptions.delete(resource);
      this._disposeSubscriptionEntry(resource, entry);
    }
  }
  dispose() {
    for (const [resource, entry] of this._subscriptions) {
      this._tryUnsubscribe(resource);
      entry.sub.dispose();
    }
    this._subscriptions.clear();
    super.dispose();
  }
}
function isActionEnvelopeRelevantToSubscriptionUris(envelope, subscribedUris) {
  if (isAhpRootChannel(envelope.channel)) {
    for (const uri of subscribedUris) {
      if (isAhpRootChannel(uri)) {
        return true;
      }
    }
    return false;
  }
  for (const uri of subscribedUris) {
    if (uri === envelope.channel) {
      return true;
    }
  }
  return false;
}
function observableFromSubscription(owner, sub) {
  return observableFromEvent(owner, sub.onDidChange, () => {
    const v = sub.value;
    return v instanceof Error ? void 0 : v;
  });
}
export {
  AgentSubscriptionManager,
  AnnotationsStateSubscription,
  ChangesetStateSubscription,
  ChatStateSubscription,
  RootStateSubscription,
  SessionStateSubscription,
  TerminalStateSubscription,
  isActionEnvelopeRelevantToSubscriptionUris,
  observableFromSubscription
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxwbGF0Zm9ybVxcYWdlbnRIb3N0XFxjb21tb25cXHN0YXRlXFxhZ2VudFN1YnNjcmlwdGlvbi50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB7IGFzc2VydE5ldmVyIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vYXNzZXJ0LmpzJztcbmltcG9ydCB7IEVtaXR0ZXIsIEV2ZW50IH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vZXZlbnQuanMnO1xuaW1wb3J0IHsgRGlzcG9zYWJsZSwgSVJlZmVyZW5jZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBSZXNvdXJjZU1hcCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL21hcC5qcyc7XG5pbXBvcnQgeyBJT2JzZXJ2YWJsZSwgb2JzZXJ2YWJsZUZyb21FdmVudCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL29ic2VydmFibGUuanMnO1xuaW1wb3J0IHsgVVJJIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdXJpLmpzJztcbmltcG9ydCB7IEFjdGlvbkVudmVsb3BlLCBBY3Rpb25UeXBlLCBDaGFuZ2VzZXRBY3Rpb24sIENoYXRBY3Rpb24sIEFubm90YXRpb25zQWN0aW9uLCBDbGllbnRBbm5vdGF0aW9uc0FjdGlvbiwgQ2xpZW50Q2hhbmdlc2V0QWN0aW9uLCBJUm9vdENvbmZpZ0NoYW5nZWRBY3Rpb24sIFNlc3Npb25BY3Rpb24sIFN0YXRlQWN0aW9uLCBpc0NoYW5nZXNldEFjdGlvbiwgaXNDaGF0QWN0aW9uLCBpc0Fubm90YXRpb25zQWN0aW9uLCBpc1Nlc3Npb25BY3Rpb24gfSBmcm9tICcuL3Nlc3Npb25BY3Rpb25zLmpzJztcbmltcG9ydCB7IGNoYW5nZXNldFJlZHVjZXIsIGNoYXRSZWR1Y2VyLCBhbm5vdGF0aW9uc1JlZHVjZXIsIHJvb3RSZWR1Y2VyLCBzZXNzaW9uUmVkdWNlciB9IGZyb20gJy4vc2Vzc2lvblJlZHVjZXJzLmpzJztcbmltcG9ydCB7IHRlcm1pbmFsUmVkdWNlciB9IGZyb20gJy4vcHJvdG9jb2wvcmVkdWNlcnMuanMnO1xuaW1wb3J0IHR5cGUgeyBSb290QWN0aW9uLCBTZXNzaW9uQWN0aW9uIGFzIElQcm90b2NvbFNlc3Npb25BY3Rpb24sIENoYXRBY3Rpb24gYXMgSVByb3RvY29sQ2hhdEFjdGlvbiwgVGVybWluYWxBY3Rpb24gfSBmcm9tICcuL3Byb3RvY29sL2FjdGlvbi1vcmlnaW4uZ2VuZXJhdGVkLmpzJztcbmltcG9ydCB0eXBlIHsgQW5ub3RhdGlvbnNTdGF0ZSwgQ2hhbmdlc2V0U3RhdGUsIENoYXRTdGF0ZSwgUm9vdFN0YXRlLCBTZXNzaW9uU3RhdGUsIFRlcm1pbmFsU3RhdGUgfSBmcm9tICcuL3Byb3RvY29sL3N0YXRlLmpzJztcbmltcG9ydCB0eXBlIHsgSVN0YXRlU25hcHNob3QgfSBmcm9tICcuL3Nlc3Npb25Qcm90b2NvbC5qcyc7XG5pbXBvcnQgeyBpc0FocFJvb3RDaGFubmVsLCBST09UX1NUQVRFX1VSSSwgU3RhdGVDb21wb25lbnRzIH0gZnJvbSAnLi9zZXNzaW9uU3RhdGUuanMnO1xuXG4vLyAtLS0gUHVibGljIEFQSSAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuXG4vKipcbiAqIEEgcmVhZC1vbmx5IHN1YnNjcmlwdGlvbiB0byBhbiBhZ2VudCBob3N0IHJlc291cmNlIChyb290LCBzZXNzaW9uLCBvciB0ZXJtaW5hbCkuXG4gKlxuICogU3Vic2NyaXB0aW9ucyBhcmUgaHlkcmF0ZWQgZnJvbSBhbiBpbml0aWFsIHNlcnZlciBzbmFwc2hvdCBhbmQga2VwdCBpbiBzeW5jXG4gKiB2aWEgYWN0aW9uIGVudmVsb3Blcy4gU2Vzc2lvbiBzdWJzY3JpcHRpb25zIHN1cHBvcnQgd3JpdGUtYWhlYWRcbiAqIHJlY29uY2lsaWF0aW9uIFx1MjAxNCBvcHRpbWlzdGljIHN0YXRlIGlzIGxheWVyZWQgb24gdG9wIG9mIGNvbmZpcm1lZCBzdGF0ZS5cbiAqL1xuZXhwb3J0IGludGVyZmFjZSBJQWdlbnRTdWJzY3JpcHRpb248VD4ge1xuXHQvKipcblx0ICogVGhlIGN1cnJlbnQgc3RhdGUgdmFsdWUuIEZvciB3cml0ZS1haGVhZCBzdWJzY3JpcHRpb25zIChzZXNzaW9ucykgdGhpc1xuXHQgKiByZWZsZWN0cyB0aGUgb3B0aW1pc3RpYyBzdGF0ZSAoY29uZmlybWVkICsgcGVuZGluZyByZXBsYXllZCkuIEZvclxuXHQgKiBzZXJ2ZXItb25seSBzdWJzY3JpcHRpb25zIChyb290LCB0ZXJtaW5hbCkgdGhpcyBlcXVhbHMgYHZlcmlmaWVkVmFsdWVgLlxuXHQgKlxuXHQgKiBgdW5kZWZpbmVkYCB1bnRpbCB0aGUgZmlyc3Qgc25hcHNob3QgYXJyaXZlcy4gQW4gYEVycm9yYCBpZiBzdWJzY3JpcHRpb25cblx0ICogZmFpbGVkLlxuXHQgKi9cblx0cmVhZG9ubHkgdmFsdWU6IFQgfCBFcnJvciB8IHVuZGVmaW5lZDtcblxuXHQvKipcblx0ICogVGhlIHNlcnZlci1jb25maXJtZWQgc3RhdGUgd2l0aCBubyBwZW5kaW5nIG9wdGltaXN0aWMgYWN0aW9ucyBhcHBsaWVkLlxuXHQgKiBgdW5kZWZpbmVkYCB1bnRpbCB0aGUgZmlyc3Qgc25hcHNob3QgYXJyaXZlcy5cblx0ICovXG5cdHJlYWRvbmx5IHZlcmlmaWVkVmFsdWU6IFQgfCB1bmRlZmluZWQ7XG5cblx0LyoqIEZpcmVzIHdoZW4ge0BsaW5rIHZhbHVlfSBjaGFuZ2VzIChvcHRpbWlzdGljIG9yIGNvbmZpcm1lZCkuICovXG5cdHJlYWRvbmx5IG9uRGlkQ2hhbmdlOiBFdmVudDxUPjtcblxuXHQvKiogRmlyZXMgd2hlbiB0aGUgc3Vic2NyaXB0aW9uIGVudGVycyBhbiBlcnJvciBzdGF0ZS4gKi9cblx0cmVhZG9ubHkgb25EaWRFcnJvcj86IEV2ZW50PEVycm9yPjtcblxuXHQvKiogRmlyZXMgYmVmb3JlIGEgc2VydmVyLW9yaWdpbmF0ZWQgYWN0aW9uIGlzIGFwcGxpZWQgdG8gdGhpcyBzdWJzY3JpcHRpb24ncyBzdGF0ZS4gKi9cblx0cmVhZG9ubHkgb25XaWxsQXBwbHlBY3Rpb246IEV2ZW50PEFjdGlvbkVudmVsb3BlPjtcblxuXHQvKiogRmlyZXMgYWZ0ZXIgYSBzZXJ2ZXItb3JpZ2luYXRlZCBhY3Rpb24gaXMgYXBwbGllZCB0byB0aGlzIHN1YnNjcmlwdGlvbidzIHN0YXRlLiAqL1xuXHRyZWFkb25seSBvbkRpZEFwcGx5QWN0aW9uOiBFdmVudDxBY3Rpb25FbnZlbG9wZT47XG59XG5cbi8qKlxuICogUmVhZC1vbmx5IHNuYXBzaG90IGRlc2NyaWJpbmcgYSBzaW5nbGUgYWN0aXZlIHJlc291cmNlIHN1YnNjcmlwdGlvbi4gVXNlZCBieVxuICogaW5zcGVjdGlvbi9kZWJ1ZyBzdXJmYWNlcyB0aGF0IGVudW1lcmF0ZSBldmVyeXRoaW5nIGEgY29ubmVjdGlvbiBpcyBjdXJyZW50bHlcbiAqIHN1YnNjcmliZWQgdG8uIERvZXMgbm90IGluY2x1ZGUgdGhlIGFsd2F5cy1saXZlIHJvb3Qgc3RhdGUuXG4gKi9cbmV4cG9ydCBpbnRlcmZhY2UgSUFjdGl2ZVN1YnNjcmlwdGlvbkluZm8ge1xuXHQvKiogVGhlIHByb3RvY29sIHJlc291cmNlIFVSSSBzdWJzY3JpYmVkIHRvLiAqL1xuXHRyZWFkb25seSByZXNvdXJjZTogVVJJO1xuXHQvKiogV2hpY2ggc3RhdGUgY29tcG9uZW50IHRoaXMgc3Vic2NyaXB0aW9uIHRyYWNrcy4gKi9cblx0cmVhZG9ubHkga2luZDogU3RhdGVDb21wb25lbnRzO1xuXHQvKiogTnVtYmVyIG9mIG91dHN0YW5kaW5nIHtAbGluayBJUmVmZXJlbmNlfSBob2xkZXJzLiAqL1xuXHRyZWFkb25seSByZWZDb3VudDogbnVtYmVyO1xuXHQvKipcblx0ICogVGhlIG5hbWVkIG93bmVycyBjdXJyZW50bHkgaG9sZGluZyBhIHJlZmVyZW5jZSB0byB0aGlzIHN1YnNjcmlwdGlvbixcblx0ICogd2l0aCBob3cgbWFueSByZWZlcmVuY2VzIGVhY2ggaG9sZHMuIE5hbWVzIGNvbWUgZnJvbSB0aGUgYG93bmVyYFxuXHQgKiBhcmd1bWVudCBwYXNzZWQgdG8ge0BsaW5rIEFnZW50U3Vic2NyaXB0aW9uTWFuYWdlci5nZXRTdWJzY3JpcHRpb259LlxuXHQgKi9cblx0cmVhZG9ubHkgaG9sZGVyczogcmVhZG9ubHkgSUFjdGl2ZVN1YnNjcmlwdGlvbkhvbGRlcltdO1xuXHQvKipcblx0ICogTGlmZWN5Y2xlIHN0YXR1cyBkZXJpdmVkIGZyb20gdGhlIHN1YnNjcmlwdGlvbidzIHZhbHVlOlxuXHQgKiBgcGVuZGluZ2AgYmVmb3JlIHRoZSBmaXJzdCBzbmFwc2hvdCwgYGVycm9yYCBpZiBpdCBmYWlsZWQsIG90aGVyd2lzZVxuXHQgKiBgc25hcHNob3RgLlxuXHQgKi9cblx0cmVhZG9ubHkgc3RhdHVzOiAncGVuZGluZycgfCAnc25hcHNob3QnIHwgJ2Vycm9yJztcbn1cblxuLyoqIEEgbmFtZWQgb3duZXIgaG9sZGluZyBvbmUgb3IgbW9yZSByZWZlcmVuY2VzIHRvIGEgc3Vic2NyaXB0aW9uLiAqL1xuZXhwb3J0IGludGVyZmFjZSBJQWN0aXZlU3Vic2NyaXB0aW9uSG9sZGVyIHtcblx0cmVhZG9ubHkgb3duZXI6IHN0cmluZztcblx0cmVhZG9ubHkgY291bnQ6IG51bWJlcjtcbn1cblxuLy8gLS0tIEJhc2UgSW1wbGVtZW50YXRpb24gLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cblxuLyoqXG4gKiBCYXNlIGNsYXNzIGZvciBhZ2VudCBzdWJzY3JpcHRpb25zLiBIYW5kbGVzIGVudmVsb3BlIHJlY2VwdGlvbiwgY29uZmlybWVkXG4gKiBzdGF0ZSBtYW5hZ2VtZW50LCBhbmQgYWN0aW9uIGV2ZW50IGVtaXNzaW9uLlxuICpcbiAqIFN1YmNsYXNzZXMgcHJvdmlkZSB0aGUgcmVkdWNlciBhbmQgb3B0aW9uYWxseSBvdmVycmlkZSByZWNvbmNpbGlhdGlvblxuICogYmVoYXZpb3IuXG4gKi9cbmFic3RyYWN0IGNsYXNzIEJhc2VBZ2VudFN1YnNjcmlwdGlvbjxUPiBleHRlbmRzIERpc3Bvc2FibGUgaW1wbGVtZW50cyBJQWdlbnRTdWJzY3JpcHRpb248VD4ge1xuXG5cdHByb3RlY3RlZCBfY29uZmlybWVkU3RhdGU6IFQgfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgX2Vycm9yOiBFcnJvciB8IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSBfYnVmZmVyZWRFbnZlbG9wZXM6IEFjdGlvbkVudmVsb3BlW10gfCB1bmRlZmluZWQ7XG5cblx0cHJvdGVjdGVkIHJlYWRvbmx5IF9vbkRpZENoYW5nZSA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPFQ+KCkpO1xuXHRyZWFkb25seSBvbkRpZENoYW5nZTogRXZlbnQ8VD4gPSB0aGlzLl9vbkRpZENoYW5nZS5ldmVudDtcblxuXHRwcm90ZWN0ZWQgcmVhZG9ubHkgX29uRGlkRXJyb3IgPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjxFcnJvcj4oKSk7XG5cdHJlYWRvbmx5IG9uRGlkRXJyb3I6IEV2ZW50PEVycm9yPiA9IHRoaXMuX29uRGlkRXJyb3IuZXZlbnQ7XG5cblx0cHJvdGVjdGVkIHJlYWRvbmx5IF9vbldpbGxBcHBseUFjdGlvbiA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPEFjdGlvbkVudmVsb3BlPigpKTtcblx0cmVhZG9ubHkgb25XaWxsQXBwbHlBY3Rpb246IEV2ZW50PEFjdGlvbkVudmVsb3BlPiA9IHRoaXMuX29uV2lsbEFwcGx5QWN0aW9uLmV2ZW50O1xuXG5cdHByb3RlY3RlZCByZWFkb25seSBfb25EaWRBcHBseUFjdGlvbiA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPEFjdGlvbkVudmVsb3BlPigpKTtcblx0cmVhZG9ubHkgb25EaWRBcHBseUFjdGlvbjogRXZlbnQ8QWN0aW9uRW52ZWxvcGU+ID0gdGhpcy5fb25EaWRBcHBseUFjdGlvbi5ldmVudDtcblxuXHRwcm90ZWN0ZWQgcmVhZG9ubHkgX2NsaWVudElkOiBzdHJpbmc7XG5cdHByb3RlY3RlZCByZWFkb25seSBfbG9nOiAobXNnOiBzdHJpbmcpID0+IHZvaWQ7XG5cblx0Y29uc3RydWN0b3IoY2xpZW50SWQ6IHN0cmluZywgbG9nOiAobXNnOiBzdHJpbmcpID0+IHZvaWQpIHtcblx0XHRzdXBlcigpO1xuXHRcdHRoaXMuX2NsaWVudElkID0gY2xpZW50SWQ7XG5cdFx0dGhpcy5fbG9nID0gbG9nO1xuXHR9XG5cblx0Z2V0IHZhbHVlKCk6IFQgfCBFcnJvciB8IHVuZGVmaW5lZCB7XG5cdFx0aWYgKHRoaXMuX2Vycm9yKSB7XG5cdFx0XHRyZXR1cm4gdGhpcy5fZXJyb3I7XG5cdFx0fVxuXHRcdHJldHVybiB0aGlzLl9nZXRPcHRpbWlzdGljU3RhdGUoKSA/PyB0aGlzLl9jb25maXJtZWRTdGF0ZTtcblx0fVxuXG5cdGdldCB2ZXJpZmllZFZhbHVlKCk6IFQgfCB1bmRlZmluZWQge1xuXHRcdHJldHVybiB0aGlzLl9jb25maXJtZWRTdGF0ZTtcblx0fVxuXG5cdC8qKlxuXHQgKiBBcHBseSBhbiBpbml0aWFsIHNuYXBzaG90IGZyb20gdGhlIHNlcnZlci5cblx0ICovXG5cdGhhbmRsZVNuYXBzaG90KHN0YXRlOiBULCBmcm9tU2VxOiBudW1iZXIpOiB2b2lkIHtcblx0XHR0aGlzLl9jb25maXJtZWRTdGF0ZSA9IHN0YXRlO1xuXHRcdHRoaXMuX2Vycm9yID0gdW5kZWZpbmVkO1xuXHRcdHRoaXMuX29uU25hcHNob3RBcHBsaWVkKGZyb21TZXEpO1xuXHRcdHRoaXMuX29uRGlkQ2hhbmdlLmZpcmUodGhpcy52YWx1ZSBhcyBUKTtcblx0fVxuXG5cdC8qKlxuXHQgKiBNYXJrIHRoaXMgc3Vic2NyaXB0aW9uIGFzIGZhaWxlZC5cblx0ICovXG5cdHNldEVycm9yKGVycm9yOiBFcnJvcik6IHZvaWQge1xuXHRcdHRoaXMuX2Vycm9yID0gZXJyb3I7XG5cdFx0dGhpcy5fb25EaWRFcnJvci5maXJlKGVycm9yKTtcblx0fVxuXG5cdC8qKlxuXHQgKiBQcm9jZXNzIGFuIGluY29taW5nIGFjdGlvbiBlbnZlbG9wZS4gVGhlIHN1YnNjcmlwdGlvbiBkZXRlcm1pbmVzXG5cdCAqIHdoZXRoZXIgdGhlIGFjdGlvbiBpcyByZWxldmFudCB2aWEge0BsaW5rIF9pc1JlbGV2YW50RW52ZWxvcGV9LlxuXHQgKi9cblx0cmVjZWl2ZUVudmVsb3BlKGVudmVsb3BlOiBBY3Rpb25FbnZlbG9wZSk6IHZvaWQge1xuXHRcdGlmICghdGhpcy5faXNSZWxldmFudEVudmVsb3BlKGVudmVsb3BlKSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdC8vIEJ1ZmZlciBhY3Rpb25zIHRoYXQgYXJyaXZlIGJlZm9yZSB0aGUgc25hcHNob3QgaGFzIGJlZW4gYXBwbGllZC5cblx0XHQvLyBUaGV5J3JlIHJlcGxheWVkIGluIF9vblNuYXBzaG90QXBwbGllZCgpLlxuXHRcdGlmICh0aGlzLl9jb25maXJtZWRTdGF0ZSA9PT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRpZiAoIXRoaXMuX2J1ZmZlcmVkRW52ZWxvcGVzKSB7XG5cdFx0XHRcdHRoaXMuX2J1ZmZlcmVkRW52ZWxvcGVzID0gW107XG5cdFx0XHR9XG5cdFx0XHR0aGlzLl9idWZmZXJlZEVudmVsb3Blcy5wdXNoKGVudmVsb3BlKTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCBpc093bkFjdGlvbiA9IGVudmVsb3BlLm9yaWdpbj8uY2xpZW50SWQgPT09IHRoaXMuX2NsaWVudElkO1xuXHRcdHRoaXMuX29uV2lsbEFwcGx5QWN0aW9uLmZpcmUoZW52ZWxvcGUpO1xuXG5cdFx0dGhpcy5fcmVjb25jaWxlKGVudmVsb3BlLCBpc093bkFjdGlvbik7XG5cblx0XHR0aGlzLl9vbkRpZEFwcGx5QWN0aW9uLmZpcmUoZW52ZWxvcGUpO1xuXHR9XG5cblx0LyoqIEFwcGx5IHRoZSByZWR1Y2VyIHRvIGNvbmZpcm1lZCBzdGF0ZS4gU3ViY2xhc3NlcyBtdXN0IGltcGxlbWVudC4gKi9cblx0cHJvdGVjdGVkIGFic3RyYWN0IF9hcHBseVJlZHVjZXIoc3RhdGU6IFQsIGFjdGlvbjogU3RhdGVBY3Rpb24pOiBUO1xuXG5cdC8qKiBXaGV0aGVyIHRoZSBnaXZlbiBlbnZlbG9wZSB0YXJnZXRzIHRoaXMgc3Vic2NyaXB0aW9uLiAqL1xuXHRwcm90ZWN0ZWQgYWJzdHJhY3QgX2lzUmVsZXZhbnRFbnZlbG9wZShlbnZlbG9wZTogQWN0aW9uRW52ZWxvcGUpOiBib29sZWFuO1xuXG5cdC8qKiBSZXR1cm4gb3B0aW1pc3RpYyBzdGF0ZSBpZiB3cml0ZS1haGVhZCBpcyBhY3RpdmUsIG90aGVyd2lzZSBgdW5kZWZpbmVkYC4gKi9cblx0cHJvdGVjdGVkIF9nZXRPcHRpbWlzdGljU3RhdGUoKTogVCB8IHVuZGVmaW5lZCB7XG5cdFx0cmV0dXJuIHVuZGVmaW5lZDsgLy8gTm8gd3JpdGUtYWhlYWQgYnkgZGVmYXVsdFxuXHR9XG5cblx0LyoqIEhvb2sgY2FsbGVkIGFmdGVyIGEgc25hcHNob3QgaXMgYXBwbGllZC4gUmVwbGF5cyBidWZmZXJlZCBhY3Rpb25zLiAqL1xuXHRwcm90ZWN0ZWQgX29uU25hcHNob3RBcHBsaWVkKF9mcm9tU2VxOiBudW1iZXIpOiB2b2lkIHtcblx0XHQvLyBSZXBsYXkgYW55IGFjdGlvbnMgdGhhdCBhcnJpdmVkIGJlZm9yZSB0aGUgc25hcHNob3Rcblx0XHRjb25zdCBidWZmZXJlZCA9IHRoaXMuX2J1ZmZlcmVkRW52ZWxvcGVzO1xuXHRcdGlmIChidWZmZXJlZCkge1xuXHRcdFx0dGhpcy5fYnVmZmVyZWRFbnZlbG9wZXMgPSB1bmRlZmluZWQ7XG5cdFx0XHRmb3IgKGNvbnN0IGVudmVsb3BlIG9mIGJ1ZmZlcmVkKSB7XG5cdFx0XHRcdC8vIE9ubHkgcmVwbGF5IGFjdGlvbnMgd2l0aCBzZXJ2ZXJTZXEgPiBmcm9tU2VxIChzbmFwc2hvdCBpcyBhdXRob3JpdGF0aXZlIHVwIHRvIGZyb21TZXEpXG5cdFx0XHRcdGlmIChlbnZlbG9wZS5zZXJ2ZXJTZXEgPiBfZnJvbVNlcSkge1xuXHRcdFx0XHRcdGNvbnN0IGlzT3duQWN0aW9uID0gZW52ZWxvcGUub3JpZ2luPy5jbGllbnRJZCA9PT0gdGhpcy5fY2xpZW50SWQ7XG5cdFx0XHRcdFx0dGhpcy5fcmVjb25jaWxlKGVudmVsb3BlLCBpc093bkFjdGlvbik7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cdH1cblxuXHQvKipcblx0ICogRGVmYXVsdCByZWNvbmNpbGlhdGlvbjogYXBwbHkgdG8gY29uZmlybWVkLCBmaXJlIGNoYW5nZSBldmVudC5cblx0ICogU2Vzc2lvbiBzdWJzY3JpcHRpb25zIG92ZXJyaWRlIHRoaXMgZm9yIHdyaXRlLWFoZWFkLlxuXHQgKi9cblx0cHJvdGVjdGVkIF9yZWNvbmNpbGUoZW52ZWxvcGU6IEFjdGlvbkVudmVsb3BlLCBfaXNPd25BY3Rpb246IGJvb2xlYW4pOiB2b2lkIHtcblx0XHR0aGlzLl9jb25maXJtZWRTdGF0ZSA9IHRoaXMuX2FwcGx5UmVkdWNlcih0aGlzLl9jb25maXJtZWRTdGF0ZSEsIGVudmVsb3BlLmFjdGlvbik7XG5cdFx0dGhpcy5fb25EaWRDaGFuZ2UuZmlyZSh0aGlzLnZhbHVlIGFzIFQpO1xuXHR9XG59XG5cbi8vIC0tLSBSb290IFN0YXRlIFN1YnNjcmlwdGlvbiAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG5cbi8qKlxuICogU3Vic2NyaXB0aW9uIHRvIHRoZSByb290IHN0YXRlIGF0IGBhZ2VudGhvc3Q6L3Jvb3RgLlxuICogU2VydmVyLW9ubHkgbXV0YXRpb25zIFx1MjAxNCBubyB3cml0ZS1haGVhZC5cbiAqL1xuZXhwb3J0IGNsYXNzIFJvb3RTdGF0ZVN1YnNjcmlwdGlvbiBleHRlbmRzIEJhc2VBZ2VudFN1YnNjcmlwdGlvbjxSb290U3RhdGU+IHtcblxuXHRwcm90ZWN0ZWQgb3ZlcnJpZGUgX2FwcGx5UmVkdWNlcihzdGF0ZTogUm9vdFN0YXRlLCBhY3Rpb246IFN0YXRlQWN0aW9uKTogUm9vdFN0YXRlIHtcblx0XHRyZXR1cm4gcm9vdFJlZHVjZXIoc3RhdGUsIGFjdGlvbiBhcyBSb290QWN0aW9uLCB0aGlzLl9sb2cpO1xuXHR9XG5cblx0cHJvdGVjdGVkIG92ZXJyaWRlIF9pc1JlbGV2YW50RW52ZWxvcGUoZW52ZWxvcGU6IEFjdGlvbkVudmVsb3BlKTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuIGlzQWhwUm9vdENoYW5uZWwoZW52ZWxvcGUuY2hhbm5lbCkgJiYgZW52ZWxvcGUuYWN0aW9uLnR5cGUuc3RhcnRzV2l0aCgncm9vdC8nKTtcblx0fVxufVxuXG4vLyAtLS0gU2Vzc2lvbiBTdGF0ZSBTdWJzY3JpcHRpb24gLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuXG5pbnRlcmZhY2UgSVBlbmRpbmdBY3Rpb24ge1xuXHRyZWFkb25seSBjbGllbnRTZXE6IG51bWJlcjtcblx0cmVhZG9ubHkgYWN0aW9uOiBTZXNzaW9uQWN0aW9uO1xufVxuXG4vKipcbiAqIEEgcGVuZGluZyBvcHRpbWlzdGljIGFjdGlvbiBhd2FpdGluZyBzZXJ2ZXIgY29uZmlybWF0aW9uLCBwYWlyZWQgd2l0aCB0aGVcbiAqIGNoYW5uZWwgaXQgd2FzIGRpc3BhdGNoZWQgdG8gc28gaXQgY2FuIGJlIHJlcGxheWVkIGFjcm9zcyBhIHJlY29ubmVjdC4gVGhlXG4gKiBjaGFubmVsIGlzIGEgc2Vzc2lvbiBjaGFubmVsIGZvciB7QGxpbmsgU2Vzc2lvblN0YXRlU3Vic2NyaXB0aW9ufSBhY3Rpb25zIGFuZFxuICogYSBjaGF0IGNoYW5uZWwgZm9yIHtAbGluayBDaGF0U3RhdGVTdWJzY3JpcHRpb259IGFjdGlvbnMuXG4gKi9cbmV4cG9ydCBpbnRlcmZhY2UgSVBlbmRpbmdEaXNwYXRjaEFjdGlvbiB7XG5cdHJlYWRvbmx5IGNsaWVudFNlcTogbnVtYmVyO1xuXHQvKiogVGhlIG9wdGltaXN0aWMgYWN0aW9uIGF3YWl0aW5nIGNvbmZpcm1hdGlvbi4gKi9cblx0cmVhZG9ubHkgYWN0aW9uOiBTZXNzaW9uQWN0aW9uIHwgQ2hhdEFjdGlvbjtcblx0LyoqIFVSSSBvZiB0aGUgY2hhbm5lbCB0aGlzIGFjdGlvbiB0YXJnZXRzLCBhcyBzdG9yZWQgb24gdGhlIHN1YnNjcmlwdGlvbi4gKi9cblx0cmVhZG9ubHkgY2hhbm5lbDogc3RyaW5nO1xufVxuXG4vKipcbiAqIFN1YnNjcmlwdGlvbiB0byBhIHNlc3Npb24gYXQgYGNvcGlsb3Q6Lzx1dWlkPmAuXG4gKiBTdXBwb3J0cyB3cml0ZS1haGVhZCByZWNvbmNpbGlhdGlvbiBmb3IgY2xpZW50LWRpc3BhdGNoYWJsZSBhY3Rpb25zLlxuICovXG5leHBvcnQgY2xhc3MgU2Vzc2lvblN0YXRlU3Vic2NyaXB0aW9uIGV4dGVuZHMgQmFzZUFnZW50U3Vic2NyaXB0aW9uPFNlc3Npb25TdGF0ZT4ge1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX3BlbmRpbmdBY3Rpb25zOiBJUGVuZGluZ0FjdGlvbltdID0gW107XG5cdHByaXZhdGUgX29wdGltaXN0aWNTdGF0ZTogU2Vzc2lvblN0YXRlIHwgdW5kZWZpbmVkO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9zZXNzaW9uVXJpOiBzdHJpbmc7XG5cdHByaXZhdGUgcmVhZG9ubHkgX3NlcUFsbG9jYXRvcjogKCkgPT4gbnVtYmVyO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdHNlc3Npb25Vcmk6IHN0cmluZyxcblx0XHRjbGllbnRJZDogc3RyaW5nLFxuXHRcdHNlcUFsbG9jYXRvcjogKCkgPT4gbnVtYmVyLFxuXHRcdGxvZzogKG1zZzogc3RyaW5nKSA9PiB2b2lkLFxuXHQpIHtcblx0XHRzdXBlcihjbGllbnRJZCwgbG9nKTtcblx0XHR0aGlzLl9zZXNzaW9uVXJpID0gc2Vzc2lvblVyaTtcblx0XHR0aGlzLl9zZXFBbGxvY2F0b3IgPSBzZXFBbGxvY2F0b3I7XG5cdH1cblxuXHQvKipcblx0ICogT3B0aW1pc3RpY2FsbHkgYXBwbHkgYSBzZXNzaW9uIGFjdGlvbi4gUmV0dXJucyB0aGUgY2xpZW50U2VxIHRvIHNlbmRcblx0ICogdG8gdGhlIHNlcnZlciBzbyBpdCBjYW4gZWNobyBiYWNrIGZvciByZWNvbmNpbGlhdGlvbi5cblx0ICovXG5cdGFwcGx5T3B0aW1pc3RpYyhhY3Rpb246IFNlc3Npb25BY3Rpb24pOiBudW1iZXIge1xuXHRcdGNvbnN0IGNsaWVudFNlcSA9IHRoaXMuX3NlcUFsbG9jYXRvcigpO1xuXHRcdHRoaXMuX3BlbmRpbmdBY3Rpb25zLnB1c2goeyBjbGllbnRTZXEsIGFjdGlvbiB9KTtcblx0XHQvLyBBcHBseSBvbiB0b3Agb2YgY3VycmVudCBvcHRpbWlzdGljXG5cdFx0Y29uc3QgYmFzZSA9IHRoaXMuX29wdGltaXN0aWNTdGF0ZSA/PyB0aGlzLnZlcmlmaWVkVmFsdWU7XG5cdFx0aWYgKGJhc2UpIHtcblx0XHRcdHRoaXMuX29wdGltaXN0aWNTdGF0ZSA9IHNlc3Npb25SZWR1Y2VyKGJhc2UsIGFjdGlvbiBhcyBJUHJvdG9jb2xTZXNzaW9uQWN0aW9uLCB0aGlzLl9sb2cpO1xuXHRcdFx0dGhpcy5fb25EaWRDaGFuZ2UuZmlyZSh0aGlzLl9vcHRpbWlzdGljU3RhdGUpO1xuXHRcdH1cblx0XHRyZXR1cm4gY2xpZW50U2VxO1xuXHR9XG5cblx0cHJvdGVjdGVkIG92ZXJyaWRlIF9nZXRPcHRpbWlzdGljU3RhdGUoKTogU2Vzc2lvblN0YXRlIHwgdW5kZWZpbmVkIHtcblx0XHRyZXR1cm4gdGhpcy5fb3B0aW1pc3RpY1N0YXRlO1xuXHR9XG5cblx0cHJvdGVjdGVkIG92ZXJyaWRlIF9hcHBseVJlZHVjZXIoc3RhdGU6IFNlc3Npb25TdGF0ZSwgYWN0aW9uOiBTdGF0ZUFjdGlvbik6IFNlc3Npb25TdGF0ZSB7XG5cdFx0cmV0dXJuIHNlc3Npb25SZWR1Y2VyKHN0YXRlLCBhY3Rpb24gYXMgSVByb3RvY29sU2Vzc2lvbkFjdGlvbiwgdGhpcy5fbG9nKTtcblx0fVxuXG5cdHByb3RlY3RlZCBvdmVycmlkZSBfaXNSZWxldmFudEVudmVsb3BlKGVudmVsb3BlOiBBY3Rpb25FbnZlbG9wZSk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiBpc1Nlc3Npb25BY3Rpb24oZW52ZWxvcGUuYWN0aW9uKSAmJiBlbnZlbG9wZS5jaGFubmVsID09PSB0aGlzLl9zZXNzaW9uVXJpO1xuXHR9XG5cblx0cHJvdGVjdGVkIG92ZXJyaWRlIF9vblNuYXBzaG90QXBwbGllZChmcm9tU2VxOiBudW1iZXIpOiB2b2lkIHtcblx0XHQvLyBSZXBsYXkgYnVmZmVyZWQgYWN0aW9ucyBmaXJzdFxuXHRcdHN1cGVyLl9vblNuYXBzaG90QXBwbGllZChmcm9tU2VxKTtcblx0XHQvLyBSZS1hcHBseSBwZW5kaW5nIGFjdGlvbnMgb24gdG9wIG9mIG5ldyBjb25maXJtZWQgc3RhdGVcblx0XHR0aGlzLl9yZWNvbXB1dGVPcHRpbWlzdGljKCk7XG5cdH1cblxuXHRwcm90ZWN0ZWQgb3ZlcnJpZGUgX3JlY29uY2lsZShlbnZlbG9wZTogQWN0aW9uRW52ZWxvcGUsIGlzT3duQWN0aW9uOiBib29sZWFuKTogdm9pZCB7XG5cdFx0Ly8gQSByZWplY3RlZCBlbnZlbG9wZSBtdXN0IG5ldmVyIG11dGF0ZSBjb25maXJtZWQgc3RhdGUgXHUyMDE0IGl0IG9ubHkgcm9sbHNcblx0XHQvLyBiYWNrIHRoZSBvcmlnaW5hdGluZyBjbGllbnQncyBtYXRjaGluZyBvcHRpbWlzdGljIGFjdGlvbi4gR3VhcmRpbmcgYWxsXG5cdFx0Ly8gYXBwbHkgYnJhbmNoZXMgYWxzbyBwcmV2ZW50cyBhIGJyb2FkY2FzdCByZWplY3Rpb24gZnJvbSBsZWFraW5nIHRoZVxuXHRcdC8vIHJlamVjdGVkIGFjdGlvbiBpbnRvIGEgbm9uLW9yaWdpbiBjbGllbnQncyBzdGF0ZS5cblx0XHRpZiAoaXNPd25BY3Rpb24gJiYgZW52ZWxvcGUub3JpZ2luKSB7XG5cdFx0XHRjb25zdCBpZHggPSB0aGlzLl9wZW5kaW5nQWN0aW9ucy5maW5kSW5kZXgocCA9PiBwLmNsaWVudFNlcSA9PT0gZW52ZWxvcGUub3JpZ2luIS5jbGllbnRTZXEpO1xuXHRcdFx0aWYgKGlkeCAhPT0gLTEpIHtcblx0XHRcdFx0aWYgKCFlbnZlbG9wZS5yZWplY3Rpb25SZWFzb24pIHtcblx0XHRcdFx0XHR0aGlzLl9jb25maXJtZWRBcHBseShlbnZlbG9wZS5hY3Rpb24pO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHRoaXMuX3BlbmRpbmdBY3Rpb25zLnNwbGljZShpZHgsIDEpO1xuXHRcdFx0fSBlbHNlIGlmICghZW52ZWxvcGUucmVqZWN0aW9uUmVhc29uKSB7XG5cdFx0XHRcdHRoaXMuX2NvbmZpcm1lZEFwcGx5KGVudmVsb3BlLmFjdGlvbik7XG5cdFx0XHR9XG5cdFx0fSBlbHNlIGlmICghZW52ZWxvcGUucmVqZWN0aW9uUmVhc29uKSB7XG5cdFx0XHR0aGlzLl9jb25maXJtZWRBcHBseShlbnZlbG9wZS5hY3Rpb24pO1xuXHRcdH1cblx0XHR0aGlzLl9yZWNvbXB1dGVPcHRpbWlzdGljKCk7XG5cdH1cblxuXHRwcml2YXRlIF9jb25maXJtZWRBcHBseShhY3Rpb246IFN0YXRlQWN0aW9uKTogdm9pZCB7XG5cdFx0aWYgKHRoaXMuX2NvbmZpcm1lZFN0YXRlKSB7XG5cdFx0XHR0aGlzLl9jb25maXJtZWRTdGF0ZSA9IHRoaXMuX2FwcGx5UmVkdWNlcih0aGlzLl9jb25maXJtZWRTdGF0ZSwgYWN0aW9uKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIF9yZWNvbXB1dGVPcHRpbWlzdGljKCk6IHZvaWQge1xuXHRcdGNvbnN0IGNvbmZpcm1lZCA9IHRoaXMuX2NvbmZpcm1lZFN0YXRlO1xuXHRcdGlmICghY29uZmlybWVkKSB7XG5cdFx0XHR0aGlzLl9vcHRpbWlzdGljU3RhdGUgPSB1bmRlZmluZWQ7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0aWYgKHRoaXMuX3BlbmRpbmdBY3Rpb25zLmxlbmd0aCA9PT0gMCkge1xuXHRcdFx0dGhpcy5fb3B0aW1pc3RpY1N0YXRlID0gdW5kZWZpbmVkOyAvLyBObyBwZW5kaW5nIFx1MjE5MiB2YWx1ZSBmYWxscyB0aHJvdWdoIHRvIGNvbmZpcm1lZFxuXHRcdFx0dGhpcy5fb25EaWRDaGFuZ2UuZmlyZShjb25maXJtZWQpO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGxldCBzdGF0ZSA9IGNvbmZpcm1lZDtcblx0XHRmb3IgKGNvbnN0IHBlbmRpbmcgb2YgdGhpcy5fcGVuZGluZ0FjdGlvbnMpIHtcblx0XHRcdHN0YXRlID0gc2Vzc2lvblJlZHVjZXIoc3RhdGUsIHBlbmRpbmcuYWN0aW9uIGFzIElQcm90b2NvbFNlc3Npb25BY3Rpb24sIHRoaXMuX2xvZyk7XG5cdFx0fVxuXHRcdHRoaXMuX29wdGltaXN0aWNTdGF0ZSA9IHN0YXRlO1xuXHRcdHRoaXMuX29uRGlkQ2hhbmdlLmZpcmUoc3RhdGUpO1xuXHR9XG5cblx0LyoqXG5cdCAqIENsZWFyIHBlbmRpbmcgYWN0aW9ucyBmb3IgdGhpcyBzZXNzaW9uIChlLmcuLCBvbiB1bnN1YnNjcmliZSkuXG5cdCAqL1xuXHRjbGVhclBlbmRpbmcoKTogdm9pZCB7XG5cdFx0dGhpcy5fcGVuZGluZ0FjdGlvbnMubGVuZ3RoID0gMDtcblx0XHR0aGlzLl9vcHRpbWlzdGljU3RhdGUgPSB1bmRlZmluZWQ7XG5cdH1cblxuXHQvKipcblx0ICogU25hcHNob3Qgb2YgdGhlIGN1cnJlbnRseS1wZW5kaW5nIG9wdGltaXN0aWMgYWN0aW9ucywgd2l0aCB0aGUgc2Vzc2lvblxuXHQgKiBVUkkgaW5jbHVkZWQgc28gY2FsbGVycyBjYW4gcmUtaXNzdWUgdGhlbSBhY3Jvc3MgYSByZWNvbm5lY3QuIFRoZVxuXHQgKiBhY3Rpb25zIHJlbWFpbiBpbiB0aGUgc3Vic2NyaXB0aW9uIHNvIHRoZSBvcHRpbWlzdGljIHN0YXRlIGNvbnRpbnVlc1xuXHQgKiB0byByZWZsZWN0IHRoZW0gXHUyMDE0IHRoZSBjbGllbnQgbXVzdCBleHBsaWNpdGx5IGRyb3AgZW50cmllcyBlY2hvZWQgYmFja1xuXHQgKiBieSB0aGUgc2VydmVyLlxuXHQgKi9cblx0Z2V0UGVuZGluZ0FjdGlvbnMoKTogSVBlbmRpbmdEaXNwYXRjaEFjdGlvbltdIHtcblx0XHRyZXR1cm4gdGhpcy5fcGVuZGluZ0FjdGlvbnMubWFwKHAgPT4gKHsgY2xpZW50U2VxOiBwLmNsaWVudFNlcSwgYWN0aW9uOiBwLmFjdGlvbiwgY2hhbm5lbDogdGhpcy5fc2Vzc2lvblVyaSB9KSk7XG5cdH1cblxuXHQvKipcblx0ICogRHJvcCB0aGUgcGVuZGluZyBlbnRyeSB3aG9zZSBgY2xpZW50U2VxYCBtYXRjaGVzIHRoZSBzdXBwbGllZCB2YWx1ZS5cblx0ICogVXNlZCBkdXJpbmcgcmVjb25uZWN0IHRvIGV2aWN0IGFjdGlvbnMgdGhlIHNlcnZlciBhbHJlYWR5IGVjaG9lZCBiYWNrXG5cdCAqIGluIHRoZSByZXBsYXkgYnVmZmVyIHNvIHRoZXkncmUgbm90IHJlc2VudC5cblx0ICovXG5cdGRyb3BQZW5kaW5nQnlDbGllbnRTZXEoY2xpZW50U2VxOiBudW1iZXIpOiBib29sZWFuIHtcblx0XHRjb25zdCBpZHggPSB0aGlzLl9wZW5kaW5nQWN0aW9ucy5maW5kSW5kZXgocCA9PiBwLmNsaWVudFNlcSA9PT0gY2xpZW50U2VxKTtcblx0XHRpZiAoaWR4ID09PSAtMSkge1xuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH1cblx0XHR0aGlzLl9wZW5kaW5nQWN0aW9ucy5zcGxpY2UoaWR4LCAxKTtcblx0XHRyZXR1cm4gdHJ1ZTtcblx0fVxufVxuXG4vLyAtLS0gQ2hhdCBTdGF0ZSBTdWJzY3JpcHRpb24gLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuXG5pbnRlcmZhY2UgSVBlbmRpbmdDaGF0QWN0aW9uIHtcblx0cmVhZG9ubHkgY2xpZW50U2VxOiBudW1iZXI7XG5cdHJlYWRvbmx5IGFjdGlvbjogQ2hhdEFjdGlvbjtcbn1cblxuLyoqXG4gKiBTdWJzY3JpcHRpb24gdG8gYSBjaGF0IGNoYW5uZWwgKGUuZy4gYSBzZXNzaW9uJ3MgZGVmYXVsdCBjaGF0IFVSSSkuIFR1cm5zLFxuICogdG9vbCBjYWxscyBhbmQgcGVuZGluZy9pbnB1dCBzdGF0ZSBtb3ZlZCBvZmYgdGhlIHNlc3Npb24gb250byB0aGUgY2hhdFxuICogY2hhbm5lbCBpbiB0aGUgbXVsdGktY2hhdCBwcm90b2NvbCwgc28gdGhpcyBzdWJzY3JpcHRpb24gY2FycmllcyB0aGVcbiAqIGNvbnZlcnNhdGlvbiBjb250ZW50cy4gU3VwcG9ydHMgd3JpdGUtYWhlYWQgcmVjb25jaWxpYXRpb24gZm9yXG4gKiBjbGllbnQtZGlzcGF0Y2hhYmxlIGNoYXQgYWN0aW9ucyAodHVybiBzdGFydHMsIGNvbmZpcm1hdGlvbnMsIGV0Yy4pLlxuICovXG5leHBvcnQgY2xhc3MgQ2hhdFN0YXRlU3Vic2NyaXB0aW9uIGV4dGVuZHMgQmFzZUFnZW50U3Vic2NyaXB0aW9uPENoYXRTdGF0ZT4ge1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX3BlbmRpbmdBY3Rpb25zOiBJUGVuZGluZ0NoYXRBY3Rpb25bXSA9IFtdO1xuXHRwcml2YXRlIF9vcHRpbWlzdGljU3RhdGU6IENoYXRTdGF0ZSB8IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSByZWFkb25seSBfY2hhdFVyaTogc3RyaW5nO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9zZXFBbGxvY2F0b3I6ICgpID0+IG51bWJlcjtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRjaGF0VXJpOiBzdHJpbmcsXG5cdFx0Y2xpZW50SWQ6IHN0cmluZyxcblx0XHRzZXFBbGxvY2F0b3I6ICgpID0+IG51bWJlcixcblx0XHRsb2c6IChtc2c6IHN0cmluZykgPT4gdm9pZCxcblx0KSB7XG5cdFx0c3VwZXIoY2xpZW50SWQsIGxvZyk7XG5cdFx0dGhpcy5fY2hhdFVyaSA9IGNoYXRVcmk7XG5cdFx0dGhpcy5fc2VxQWxsb2NhdG9yID0gc2VxQWxsb2NhdG9yO1xuXHR9XG5cblx0LyoqXG5cdCAqIE9wdGltaXN0aWNhbGx5IGFwcGx5IGEgY2hhdCBhY3Rpb24uIFJldHVybnMgdGhlIGNsaWVudFNlcSB0byBzZW5kIHRvXG5cdCAqIHRoZSBzZXJ2ZXIgc28gaXQgY2FuIGVjaG8gYmFjayBmb3IgcmVjb25jaWxpYXRpb24uXG5cdCAqL1xuXHRhcHBseU9wdGltaXN0aWMoYWN0aW9uOiBDaGF0QWN0aW9uKTogbnVtYmVyIHtcblx0XHRjb25zdCBjbGllbnRTZXEgPSB0aGlzLl9zZXFBbGxvY2F0b3IoKTtcblx0XHR0aGlzLl9wZW5kaW5nQWN0aW9ucy5wdXNoKHsgY2xpZW50U2VxLCBhY3Rpb24gfSk7XG5cdFx0Y29uc3QgYmFzZSA9IHRoaXMuX29wdGltaXN0aWNTdGF0ZSA/PyB0aGlzLnZlcmlmaWVkVmFsdWU7XG5cdFx0aWYgKGJhc2UpIHtcblx0XHRcdHRoaXMuX29wdGltaXN0aWNTdGF0ZSA9IGNoYXRSZWR1Y2VyKGJhc2UsIGFjdGlvbiBhcyBJUHJvdG9jb2xDaGF0QWN0aW9uLCB0aGlzLl9sb2cpO1xuXHRcdFx0dGhpcy5fb25EaWRDaGFuZ2UuZmlyZSh0aGlzLl9vcHRpbWlzdGljU3RhdGUpO1xuXHRcdH1cblx0XHRyZXR1cm4gY2xpZW50U2VxO1xuXHR9XG5cblx0cHJvdGVjdGVkIG92ZXJyaWRlIF9nZXRPcHRpbWlzdGljU3RhdGUoKTogQ2hhdFN0YXRlIHwgdW5kZWZpbmVkIHtcblx0XHRyZXR1cm4gdGhpcy5fb3B0aW1pc3RpY1N0YXRlO1xuXHR9XG5cblx0cHJvdGVjdGVkIG92ZXJyaWRlIF9hcHBseVJlZHVjZXIoc3RhdGU6IENoYXRTdGF0ZSwgYWN0aW9uOiBTdGF0ZUFjdGlvbik6IENoYXRTdGF0ZSB7XG5cdFx0cmV0dXJuIGNoYXRSZWR1Y2VyKHN0YXRlLCBhY3Rpb24gYXMgSVByb3RvY29sQ2hhdEFjdGlvbiwgdGhpcy5fbG9nKTtcblx0fVxuXG5cdHByb3RlY3RlZCBvdmVycmlkZSBfaXNSZWxldmFudEVudmVsb3BlKGVudmVsb3BlOiBBY3Rpb25FbnZlbG9wZSk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiBpc0NoYXRBY3Rpb24oZW52ZWxvcGUuYWN0aW9uKSAmJiBlbnZlbG9wZS5jaGFubmVsID09PSB0aGlzLl9jaGF0VXJpO1xuXHR9XG5cblx0cHJvdGVjdGVkIG92ZXJyaWRlIF9vblNuYXBzaG90QXBwbGllZChmcm9tU2VxOiBudW1iZXIpOiB2b2lkIHtcblx0XHRzdXBlci5fb25TbmFwc2hvdEFwcGxpZWQoZnJvbVNlcSk7XG5cdFx0dGhpcy5fcmVjb21wdXRlT3B0aW1pc3RpYygpO1xuXHR9XG5cblx0cHJvdGVjdGVkIG92ZXJyaWRlIF9yZWNvbmNpbGUoZW52ZWxvcGU6IEFjdGlvbkVudmVsb3BlLCBpc093bkFjdGlvbjogYm9vbGVhbik6IHZvaWQge1xuXHRcdC8vIEEgcmVqZWN0ZWQgZW52ZWxvcGUgbXVzdCBuZXZlciBtdXRhdGUgY29uZmlybWVkIHN0YXRlIFx1MjAxNCBpdCBvbmx5IHJvbGxzXG5cdFx0Ly8gYmFjayB0aGUgb3JpZ2luYXRpbmcgY2xpZW50J3MgbWF0Y2hpbmcgb3B0aW1pc3RpYyBhY3Rpb24uIEd1YXJkaW5nIGFsbFxuXHRcdC8vIGFwcGx5IGJyYW5jaGVzIGFsc28gcHJldmVudHMgYSBicm9hZGNhc3QgcmVqZWN0aW9uIGZyb20gbGVha2luZyB0aGVcblx0XHQvLyByZWplY3RlZCBhY3Rpb24gaW50byBhIG5vbi1vcmlnaW4gY2xpZW50J3Mgc3RhdGUuXG5cdFx0aWYgKGlzT3duQWN0aW9uICYmIGVudmVsb3BlLm9yaWdpbikge1xuXHRcdFx0Y29uc3QgaWR4ID0gdGhpcy5fcGVuZGluZ0FjdGlvbnMuZmluZEluZGV4KHAgPT4gcC5jbGllbnRTZXEgPT09IGVudmVsb3BlLm9yaWdpbiEuY2xpZW50U2VxKTtcblx0XHRcdGlmIChpZHggIT09IC0xKSB7XG5cdFx0XHRcdGlmICghZW52ZWxvcGUucmVqZWN0aW9uUmVhc29uKSB7XG5cdFx0XHRcdFx0dGhpcy5fY29uZmlybWVkQXBwbHkoZW52ZWxvcGUuYWN0aW9uKTtcblx0XHRcdFx0fVxuXHRcdFx0XHR0aGlzLl9wZW5kaW5nQWN0aW9ucy5zcGxpY2UoaWR4LCAxKTtcblx0XHRcdH0gZWxzZSBpZiAoIWVudmVsb3BlLnJlamVjdGlvblJlYXNvbikge1xuXHRcdFx0XHR0aGlzLl9jb25maXJtZWRBcHBseShlbnZlbG9wZS5hY3Rpb24pO1xuXHRcdFx0fVxuXHRcdH0gZWxzZSBpZiAoIWVudmVsb3BlLnJlamVjdGlvblJlYXNvbikge1xuXHRcdFx0dGhpcy5fcHJvbW90ZVBlbmRpbmdUdXJuU3RhcnRJZlRlcm1pbmFsKGVudmVsb3BlLmFjdGlvbik7XG5cdFx0XHR0aGlzLl9jb25maXJtZWRBcHBseShlbnZlbG9wZS5hY3Rpb24pO1xuXHRcdH1cblx0XHR0aGlzLl9yZWNvbXB1dGVPcHRpbWlzdGljKCk7XG5cdH1cblxuXHRwcml2YXRlIF9wcm9tb3RlUGVuZGluZ1R1cm5TdGFydElmVGVybWluYWwoYWN0aW9uOiBTdGF0ZUFjdGlvbik6IHZvaWQge1xuXHRcdC8vIEEgYmFja2VuZC1vcmlnaW5hdGVkIHRlcm1pbmFsIHR1cm4gYWN0aW9uIG1heSBhcnJpdmUgd2l0aG91dCB0aGUgY2xpZW50U2VxXG5cdFx0Ly8gdGhhdCB3b3VsZCBub3JtYWxseSBjb25maXJtIG91ciBvcHRpbWlzdGljIHR1cm4gc3RhcnQuIFByb21vdGUgdGhhdCBzdGFydFxuXHRcdC8vIGZpcnN0IHNvIHRoZSB0ZXJtaW5hbCBhY3Rpb24gY2FuIGNsb3NlIGl0IGluc3RlYWQgb2YgbGVhdmluZyBpdCBwZW5kaW5nLlxuXHRcdGlmICghaXNDaGF0QWN0aW9uKGFjdGlvbikpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0aWYgKGFjdGlvbi50eXBlICE9PSBBY3Rpb25UeXBlLkNoYXRUdXJuQ29tcGxldGUgJiYgYWN0aW9uLnR5cGUgIT09IEFjdGlvblR5cGUuQ2hhdFR1cm5DYW5jZWxsZWQgJiYgYWN0aW9uLnR5cGUgIT09IEFjdGlvblR5cGUuQ2hhdEVycm9yKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGNvbnN0IGluZGV4ID0gdGhpcy5fcGVuZGluZ0FjdGlvbnMuZmluZEluZGV4KHAgPT4gcC5hY3Rpb24udHlwZSA9PT0gQWN0aW9uVHlwZS5DaGF0VHVyblN0YXJ0ZWQgJiYgcC5hY3Rpb24udHVybklkID09PSBhY3Rpb24udHVybklkKTtcblx0XHRpZiAoaW5kZXggPT09IC0xKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGNvbnN0IFt7IGFjdGlvbjogcGVuZGluZ0FjdGlvbiB9XSA9IHRoaXMuX3BlbmRpbmdBY3Rpb25zLnNwbGljZShpbmRleCwgMSk7XG5cdFx0aWYgKHRoaXMuX2NvbmZpcm1lZFN0YXRlICYmICghdGhpcy5fY29uZmlybWVkU3RhdGUuYWN0aXZlVHVybiB8fCB0aGlzLl9jb25maXJtZWRTdGF0ZS5hY3RpdmVUdXJuLmlkICE9PSBhY3Rpb24udHVybklkKSkge1xuXHRcdFx0dGhpcy5fY29uZmlybWVkU3RhdGUgPSB0aGlzLl9hcHBseVJlZHVjZXIodGhpcy5fY29uZmlybWVkU3RhdGUsIHBlbmRpbmdBY3Rpb24pO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgX2NvbmZpcm1lZEFwcGx5KGFjdGlvbjogU3RhdGVBY3Rpb24pOiB2b2lkIHtcblx0XHRpZiAodGhpcy5fY29uZmlybWVkU3RhdGUpIHtcblx0XHRcdHRoaXMuX2NvbmZpcm1lZFN0YXRlID0gdGhpcy5fYXBwbHlSZWR1Y2VyKHRoaXMuX2NvbmZpcm1lZFN0YXRlLCBhY3Rpb24pO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgX3JlY29tcHV0ZU9wdGltaXN0aWMoKTogdm9pZCB7XG5cdFx0Y29uc3QgY29uZmlybWVkID0gdGhpcy5fY29uZmlybWVkU3RhdGU7XG5cdFx0aWYgKCFjb25maXJtZWQpIHtcblx0XHRcdHRoaXMuX29wdGltaXN0aWNTdGF0ZSA9IHVuZGVmaW5lZDtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0aWYgKHRoaXMuX3BlbmRpbmdBY3Rpb25zLmxlbmd0aCA9PT0gMCkge1xuXHRcdFx0dGhpcy5fb3B0aW1pc3RpY1N0YXRlID0gdW5kZWZpbmVkO1xuXHRcdFx0dGhpcy5fb25EaWRDaGFuZ2UuZmlyZShjb25maXJtZWQpO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRsZXQgc3RhdGUgPSBjb25maXJtZWQ7XG5cdFx0Zm9yIChjb25zdCBwZW5kaW5nIG9mIHRoaXMuX3BlbmRpbmdBY3Rpb25zKSB7XG5cdFx0XHRzdGF0ZSA9IGNoYXRSZWR1Y2VyKHN0YXRlLCBwZW5kaW5nLmFjdGlvbiBhcyBJUHJvdG9jb2xDaGF0QWN0aW9uLCB0aGlzLl9sb2cpO1xuXHRcdH1cblx0XHR0aGlzLl9vcHRpbWlzdGljU3RhdGUgPSBzdGF0ZTtcblx0XHR0aGlzLl9vbkRpZENoYW5nZS5maXJlKHN0YXRlKTtcblx0fVxuXG5cdGNsZWFyUGVuZGluZygpOiB2b2lkIHtcblx0XHR0aGlzLl9wZW5kaW5nQWN0aW9ucy5sZW5ndGggPSAwO1xuXHRcdHRoaXMuX29wdGltaXN0aWNTdGF0ZSA9IHVuZGVmaW5lZDtcblx0fVxuXG5cdGdldFBlbmRpbmdBY3Rpb25zKCk6IElQZW5kaW5nRGlzcGF0Y2hBY3Rpb25bXSB7XG5cdFx0cmV0dXJuIHRoaXMuX3BlbmRpbmdBY3Rpb25zLm1hcChwID0+ICh7IGNsaWVudFNlcTogcC5jbGllbnRTZXEsIGFjdGlvbjogcC5hY3Rpb24sIGNoYW5uZWw6IHRoaXMuX2NoYXRVcmkgfSkpO1xuXHR9XG5cblx0ZHJvcFBlbmRpbmdCeUNsaWVudFNlcShjbGllbnRTZXE6IG51bWJlcik6IGJvb2xlYW4ge1xuXHRcdGNvbnN0IGlkeCA9IHRoaXMuX3BlbmRpbmdBY3Rpb25zLmZpbmRJbmRleChwID0+IHAuY2xpZW50U2VxID09PSBjbGllbnRTZXEpO1xuXHRcdGlmIChpZHggPT09IC0xKSB7XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXHRcdHRoaXMuX3BlbmRpbmdBY3Rpb25zLnNwbGljZShpZHgsIDEpO1xuXHRcdHJldHVybiB0cnVlO1xuXHR9XG59XG5cbi8vIC0tLSBUZXJtaW5hbCBTdGF0ZSBTdWJzY3JpcHRpb24gLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG5cbi8qKlxuICogU3Vic2NyaXB0aW9uIHRvIGEgdGVybWluYWwgYXQgYW4gYWdlbnQtaG9zdCB0ZXJtaW5hbCBVUkkuXG4gKiBTZXJ2ZXItb25seSBtdXRhdGlvbnMgXHUyMDE0IG5vIHdyaXRlLWFoZWFkICh0ZXJtaW5hbCBJL08gaXMgc2lkZS1lZmZlY3Qtb25seSkuXG4gKi9cbmV4cG9ydCBjbGFzcyBUZXJtaW5hbFN0YXRlU3Vic2NyaXB0aW9uIGV4dGVuZHMgQmFzZUFnZW50U3Vic2NyaXB0aW9uPFRlcm1pbmFsU3RhdGU+IHtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF90ZXJtaW5hbFVyaTogc3RyaW5nO1xuXG5cdGNvbnN0cnVjdG9yKHRlcm1pbmFsVXJpOiBzdHJpbmcsIGNsaWVudElkOiBzdHJpbmcsIGxvZzogKG1zZzogc3RyaW5nKSA9PiB2b2lkKSB7XG5cdFx0c3VwZXIoY2xpZW50SWQsIGxvZyk7XG5cdFx0dGhpcy5fdGVybWluYWxVcmkgPSB0ZXJtaW5hbFVyaTtcblx0fVxuXG5cdHByb3RlY3RlZCBvdmVycmlkZSBfYXBwbHlSZWR1Y2VyKHN0YXRlOiBUZXJtaW5hbFN0YXRlLCBhY3Rpb246IFN0YXRlQWN0aW9uKTogVGVybWluYWxTdGF0ZSB7XG5cdFx0cmV0dXJuIHRlcm1pbmFsUmVkdWNlcihzdGF0ZSwgYWN0aW9uIGFzIFRlcm1pbmFsQWN0aW9uLCB0aGlzLl9sb2cpO1xuXHR9XG5cblx0cHJvdGVjdGVkIG92ZXJyaWRlIF9pc1JlbGV2YW50RW52ZWxvcGUoZW52ZWxvcGU6IEFjdGlvbkVudmVsb3BlKTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuIGVudmVsb3BlLmFjdGlvbi50eXBlLnN0YXJ0c1dpdGgoJ3Rlcm1pbmFsLycpICYmIGVudmVsb3BlLmNoYW5uZWwgPT09IHRoaXMuX3Rlcm1pbmFsVXJpO1xuXHR9XG59XG5cbi8vIC0tLSBDaGFuZ2VzZXQgU3RhdGUgU3Vic2NyaXB0aW9uIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG5cbi8qKlxuICogU3Vic2NyaXB0aW9uIHRvIGEgY2hhbmdlc2V0IGF0IGFuIGV4cGFuZGVkIGNoYW5nZXNldCBVUkkgKGUuZy5cbiAqIGA8c2Vzc2lvblVyaT4vY2hhbmdlc2V0L3Nlc3Npb25gKS5cbiAqXG4gKiBDaGFuZ2VzZXQgcmV2aWV3IGFjdGlvbnMgYXJlIGNsaWVudC1kaXNwYXRjaGFibGUsIHNvIHRoaXMgc3Vic2NyaXB0aW9uXG4gKiBzdXBwb3J0cyB3cml0ZS1haGVhZCByZWNvbmNpbGlhdGlvbi5cbiAqL1xuZXhwb3J0IGNsYXNzIENoYW5nZXNldFN0YXRlU3Vic2NyaXB0aW9uIGV4dGVuZHMgQmFzZUFnZW50U3Vic2NyaXB0aW9uPENoYW5nZXNldFN0YXRlPiB7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfcGVuZGluZ0FjdGlvbnM6IHsgcmVhZG9ubHkgY2xpZW50U2VxOiBudW1iZXI7IHJlYWRvbmx5IGFjdGlvbjogQ2xpZW50Q2hhbmdlc2V0QWN0aW9uIH1bXSA9IFtdO1xuXHRwcml2YXRlIF9vcHRpbWlzdGljU3RhdGU6IENoYW5nZXNldFN0YXRlIHwgdW5kZWZpbmVkO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9jaGFuZ2VzZXRVcmk6IHN0cmluZztcblx0cHJpdmF0ZSByZWFkb25seSBfc2VxQWxsb2NhdG9yOiAoKSA9PiBudW1iZXI7XG5cblx0Y29uc3RydWN0b3IoY2hhbmdlc2V0VXJpOiBzdHJpbmcsIGNsaWVudElkOiBzdHJpbmcsIHNlcUFsbG9jYXRvcjogKCkgPT4gbnVtYmVyLCBsb2c6IChtc2c6IHN0cmluZykgPT4gdm9pZCkge1xuXHRcdHN1cGVyKGNsaWVudElkLCBsb2cpO1xuXHRcdHRoaXMuX2NoYW5nZXNldFVyaSA9IGNoYW5nZXNldFVyaTtcblx0XHR0aGlzLl9zZXFBbGxvY2F0b3IgPSBzZXFBbGxvY2F0b3I7XG5cdH1cblxuXHQvKipcblx0ICogT3B0aW1pc3RpY2FsbHkgYXBwbHkgYSBjaGFuZ2VzZXQgYWN0aW9uIGFuZCByZXR1cm4gaXRzIGNsaWVudCBzZXF1ZW5jZS5cblx0ICovXG5cdGFwcGx5T3B0aW1pc3RpYyhhY3Rpb246IENsaWVudENoYW5nZXNldEFjdGlvbik6IG51bWJlciB7XG5cdFx0Y29uc3QgY2xpZW50U2VxID0gdGhpcy5fc2VxQWxsb2NhdG9yKCk7XG5cdFx0dGhpcy5fcGVuZGluZ0FjdGlvbnMucHVzaCh7IGNsaWVudFNlcSwgYWN0aW9uIH0pO1xuXHRcdGNvbnN0IGJhc2UgPSB0aGlzLl9vcHRpbWlzdGljU3RhdGUgPz8gdGhpcy52ZXJpZmllZFZhbHVlO1xuXHRcdGlmIChiYXNlKSB7XG5cdFx0XHR0aGlzLl9vcHRpbWlzdGljU3RhdGUgPSBjaGFuZ2VzZXRSZWR1Y2VyKGJhc2UsIGFjdGlvbiwgdGhpcy5fbG9nKTtcblx0XHRcdHRoaXMuX29uRGlkQ2hhbmdlLmZpcmUodGhpcy5fb3B0aW1pc3RpY1N0YXRlKTtcblx0XHR9XG5cdFx0cmV0dXJuIGNsaWVudFNlcTtcblx0fVxuXG5cdHByb3RlY3RlZCBvdmVycmlkZSBfZ2V0T3B0aW1pc3RpY1N0YXRlKCk6IENoYW5nZXNldFN0YXRlIHwgdW5kZWZpbmVkIHtcblx0XHRyZXR1cm4gdGhpcy5fb3B0aW1pc3RpY1N0YXRlO1xuXHR9XG5cblx0cHJvdGVjdGVkIG92ZXJyaWRlIF9hcHBseVJlZHVjZXIoc3RhdGU6IENoYW5nZXNldFN0YXRlLCBhY3Rpb246IFN0YXRlQWN0aW9uKTogQ2hhbmdlc2V0U3RhdGUge1xuXHRcdHJldHVybiBjaGFuZ2VzZXRSZWR1Y2VyKHN0YXRlLCBhY3Rpb24gYXMgQ2hhbmdlc2V0QWN0aW9uLCB0aGlzLl9sb2cpO1xuXHR9XG5cblx0cHJvdGVjdGVkIG92ZXJyaWRlIF9pc1JlbGV2YW50RW52ZWxvcGUoZW52ZWxvcGU6IEFjdGlvbkVudmVsb3BlKTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuIGlzQ2hhbmdlc2V0QWN0aW9uKGVudmVsb3BlLmFjdGlvbikgJiYgZW52ZWxvcGUuY2hhbm5lbCA9PT0gdGhpcy5fY2hhbmdlc2V0VXJpO1xuXHR9XG5cblx0cHJvdGVjdGVkIG92ZXJyaWRlIF9vblNuYXBzaG90QXBwbGllZChmcm9tU2VxOiBudW1iZXIpOiB2b2lkIHtcblx0XHRzdXBlci5fb25TbmFwc2hvdEFwcGxpZWQoZnJvbVNlcSk7XG5cdFx0dGhpcy5fcmVjb21wdXRlT3B0aW1pc3RpYygpO1xuXHR9XG5cblx0cHJvdGVjdGVkIG92ZXJyaWRlIF9yZWNvbmNpbGUoZW52ZWxvcGU6IEFjdGlvbkVudmVsb3BlLCBpc093bkFjdGlvbjogYm9vbGVhbik6IHZvaWQge1xuXHRcdGlmIChpc093bkFjdGlvbiAmJiBlbnZlbG9wZS5vcmlnaW4pIHtcblx0XHRcdGNvbnN0IGluZGV4ID0gdGhpcy5fcGVuZGluZ0FjdGlvbnMuZmluZEluZGV4KHBlbmRpbmcgPT4gcGVuZGluZy5jbGllbnRTZXEgPT09IGVudmVsb3BlLm9yaWdpbiEuY2xpZW50U2VxKTtcblx0XHRcdGlmIChpbmRleCAhPT0gLTEpIHtcblx0XHRcdFx0aWYgKCFlbnZlbG9wZS5yZWplY3Rpb25SZWFzb24pIHtcblx0XHRcdFx0XHR0aGlzLl9jb25maXJtZWRBcHBseShlbnZlbG9wZS5hY3Rpb24pO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHRoaXMuX3BlbmRpbmdBY3Rpb25zLnNwbGljZShpbmRleCwgMSk7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHR0aGlzLl9jb25maXJtZWRBcHBseShlbnZlbG9wZS5hY3Rpb24pO1xuXHRcdFx0fVxuXHRcdH0gZWxzZSB7XG5cdFx0XHR0aGlzLl9jb25maXJtZWRBcHBseShlbnZlbG9wZS5hY3Rpb24pO1xuXHRcdH1cblx0XHR0aGlzLl9yZWNvbXB1dGVPcHRpbWlzdGljKCk7XG5cdH1cblxuXHRwcml2YXRlIF9jb25maXJtZWRBcHBseShhY3Rpb246IFN0YXRlQWN0aW9uKTogdm9pZCB7XG5cdFx0aWYgKHRoaXMuX2NvbmZpcm1lZFN0YXRlKSB7XG5cdFx0XHR0aGlzLl9jb25maXJtZWRTdGF0ZSA9IHRoaXMuX2FwcGx5UmVkdWNlcih0aGlzLl9jb25maXJtZWRTdGF0ZSwgYWN0aW9uKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIF9yZWNvbXB1dGVPcHRpbWlzdGljKCk6IHZvaWQge1xuXHRcdGNvbnN0IGNvbmZpcm1lZCA9IHRoaXMuX2NvbmZpcm1lZFN0YXRlO1xuXHRcdGlmICghY29uZmlybWVkKSB7XG5cdFx0XHR0aGlzLl9vcHRpbWlzdGljU3RhdGUgPSB1bmRlZmluZWQ7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0aWYgKHRoaXMuX3BlbmRpbmdBY3Rpb25zLmxlbmd0aCA9PT0gMCkge1xuXHRcdFx0dGhpcy5fb3B0aW1pc3RpY1N0YXRlID0gdW5kZWZpbmVkO1xuXHRcdFx0dGhpcy5fb25EaWRDaGFuZ2UuZmlyZShjb25maXJtZWQpO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGxldCBzdGF0ZSA9IGNvbmZpcm1lZDtcblx0XHRmb3IgKGNvbnN0IHBlbmRpbmcgb2YgdGhpcy5fcGVuZGluZ0FjdGlvbnMpIHtcblx0XHRcdHN0YXRlID0gY2hhbmdlc2V0UmVkdWNlcihzdGF0ZSwgcGVuZGluZy5hY3Rpb24sIHRoaXMuX2xvZyk7XG5cdFx0fVxuXHRcdHRoaXMuX29wdGltaXN0aWNTdGF0ZSA9IHN0YXRlO1xuXHRcdHRoaXMuX29uRGlkQ2hhbmdlLmZpcmUoc3RhdGUpO1xuXHR9XG59XG5cbnR5cGUgTWFuYWdlZFN1YnNjcmlwdGlvbiA9IFNlc3Npb25TdGF0ZVN1YnNjcmlwdGlvbiB8IENoYXRTdGF0ZVN1YnNjcmlwdGlvbiB8IFRlcm1pbmFsU3RhdGVTdWJzY3JpcHRpb24gfCBDaGFuZ2VzZXRTdGF0ZVN1YnNjcmlwdGlvbiB8IEFubm90YXRpb25zU3RhdGVTdWJzY3JpcHRpb247XG5cbi8vIC0tLSBBbm5vdGF0aW9ucyBTdGF0ZSBTdWJzY3JpcHRpb24gLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG5cbmludGVyZmFjZSBJUGVuZGluZ0Fubm90YXRpb25zQWN0aW9uIHtcblx0cmVhZG9ubHkgY2xpZW50U2VxOiBudW1iZXI7XG5cdHJlYWRvbmx5IGFjdGlvbjogQW5ub3RhdGlvbnNBY3Rpb247XG59XG5cbi8qKlxuICogU3Vic2NyaXB0aW9uIHRvIGEgc2Vzc2lvbidzIGFubm90YXRpb25zIGNoYW5uZWwgKGUuZy5cbiAqIGA8c2Vzc2lvblVyaT4vYW5ub3RhdGlvbnNgKS5cbiAqXG4gKiBBbm5vdGF0aW9ucyBhY3Rpb25zIGFyZSBjbGllbnQtZGlzcGF0Y2hhYmxlLCBzbyB0aGlzIHN1YnNjcmlwdGlvbiBzdXBwb3J0c1xuICogd3JpdGUtYWhlYWQgcmVjb25jaWxpYXRpb246IG9wdGltaXN0aWMgc3RhdGUgaXMgbGF5ZXJlZCBvbiB0b3Agb2YgY29uZmlybWVkXG4gKiBzdGF0ZSBhbmQgcmVjb25jaWxlZCBhcyB0aGUgc2VydmVyIGVjaG9lcyB0aGUgY2xpZW50J3Mgb3duIGFjdGlvbnMgYmFjay5cbiAqXG4gKiBMaWtlIHtAbGluayBDaGFuZ2VzZXRTdGF0ZVN1YnNjcmlwdGlvbn0sIHRoZSBzdWJzY3JpcHRpb24gZG9lcyBOT1RcbiAqIHNlbGYtdGVhci1kb3duIG9uIGxpZmVjeWNsZSBldmVudHM7IGNsZWFudXAgaXMgZHJpdmVuIGV4dGVybmFsbHkgYnkgdGhlXG4gKiBob2xkZXIgcmVsZWFzaW5nIGl0cyBgSVJlZmVyZW5jZWAuXG4gKi9cbmV4cG9ydCBjbGFzcyBBbm5vdGF0aW9uc1N0YXRlU3Vic2NyaXB0aW9uIGV4dGVuZHMgQmFzZUFnZW50U3Vic2NyaXB0aW9uPEFubm90YXRpb25zU3RhdGU+IHtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9wZW5kaW5nQWN0aW9uczogSVBlbmRpbmdBbm5vdGF0aW9uc0FjdGlvbltdID0gW107XG5cdHByaXZhdGUgX29wdGltaXN0aWNTdGF0ZTogQW5ub3RhdGlvbnNTdGF0ZSB8IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSByZWFkb25seSBfYW5ub3RhdGlvbnNVcmk6IHN0cmluZztcblx0cHJpdmF0ZSByZWFkb25seSBfc2VxQWxsb2NhdG9yOiAoKSA9PiBudW1iZXI7XG5cblx0Y29uc3RydWN0b3IoYW5ub3RhdGlvbnNVcmk6IHN0cmluZywgY2xpZW50SWQ6IHN0cmluZywgc2VxQWxsb2NhdG9yOiAoKSA9PiBudW1iZXIsIGxvZzogKG1zZzogc3RyaW5nKSA9PiB2b2lkKSB7XG5cdFx0c3VwZXIoY2xpZW50SWQsIGxvZyk7XG5cdFx0dGhpcy5fYW5ub3RhdGlvbnNVcmkgPSBhbm5vdGF0aW9uc1VyaTtcblx0XHR0aGlzLl9zZXFBbGxvY2F0b3IgPSBzZXFBbGxvY2F0b3I7XG5cdH1cblxuXHQvKipcblx0ICogT3B0aW1pc3RpY2FsbHkgYXBwbHkgYW4gYW5ub3RhdGlvbnMgYWN0aW9uLiBSZXR1cm5zIHRoZSBjbGllbnRTZXEgdG9cblx0ICogc2VuZCB0byB0aGUgc2VydmVyIHNvIGl0IGNhbiBlY2hvIGJhY2sgZm9yIHJlY29uY2lsaWF0aW9uLlxuXHQgKi9cblx0YXBwbHlPcHRpbWlzdGljKGFjdGlvbjogQW5ub3RhdGlvbnNBY3Rpb24pOiBudW1iZXIge1xuXHRcdGNvbnN0IGNsaWVudFNlcSA9IHRoaXMuX3NlcUFsbG9jYXRvcigpO1xuXHRcdHRoaXMuX3BlbmRpbmdBY3Rpb25zLnB1c2goeyBjbGllbnRTZXEsIGFjdGlvbiB9KTtcblx0XHRjb25zdCBiYXNlID0gdGhpcy5fb3B0aW1pc3RpY1N0YXRlID8/IHRoaXMudmVyaWZpZWRWYWx1ZTtcblx0XHRpZiAoYmFzZSkge1xuXHRcdFx0dGhpcy5fb3B0aW1pc3RpY1N0YXRlID0gYW5ub3RhdGlvbnNSZWR1Y2VyKGJhc2UsIGFjdGlvbiwgdGhpcy5fbG9nKTtcblx0XHRcdHRoaXMuX29uRGlkQ2hhbmdlLmZpcmUodGhpcy5fb3B0aW1pc3RpY1N0YXRlKTtcblx0XHR9XG5cdFx0cmV0dXJuIGNsaWVudFNlcTtcblx0fVxuXG5cdHByb3RlY3RlZCBvdmVycmlkZSBfZ2V0T3B0aW1pc3RpY1N0YXRlKCk6IEFubm90YXRpb25zU3RhdGUgfCB1bmRlZmluZWQge1xuXHRcdHJldHVybiB0aGlzLl9vcHRpbWlzdGljU3RhdGU7XG5cdH1cblxuXHRwcm90ZWN0ZWQgb3ZlcnJpZGUgX2FwcGx5UmVkdWNlcihzdGF0ZTogQW5ub3RhdGlvbnNTdGF0ZSwgYWN0aW9uOiBTdGF0ZUFjdGlvbik6IEFubm90YXRpb25zU3RhdGUge1xuXHRcdHJldHVybiBhbm5vdGF0aW9uc1JlZHVjZXIoc3RhdGUsIGFjdGlvbiBhcyBBbm5vdGF0aW9uc0FjdGlvbiwgdGhpcy5fbG9nKTtcblx0fVxuXG5cdHByb3RlY3RlZCBvdmVycmlkZSBfaXNSZWxldmFudEVudmVsb3BlKGVudmVsb3BlOiBBY3Rpb25FbnZlbG9wZSk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiBpc0Fubm90YXRpb25zQWN0aW9uKGVudmVsb3BlLmFjdGlvbikgJiYgZW52ZWxvcGUuY2hhbm5lbCA9PT0gdGhpcy5fYW5ub3RhdGlvbnNVcmk7XG5cdH1cblxuXHRwcm90ZWN0ZWQgb3ZlcnJpZGUgX29uU25hcHNob3RBcHBsaWVkKGZyb21TZXE6IG51bWJlcik6IHZvaWQge1xuXHRcdHN1cGVyLl9vblNuYXBzaG90QXBwbGllZChmcm9tU2VxKTtcblx0XHR0aGlzLl9yZWNvbXB1dGVPcHRpbWlzdGljKCk7XG5cdH1cblxuXHRwcm90ZWN0ZWQgb3ZlcnJpZGUgX3JlY29uY2lsZShlbnZlbG9wZTogQWN0aW9uRW52ZWxvcGUsIGlzT3duQWN0aW9uOiBib29sZWFuKTogdm9pZCB7XG5cdFx0aWYgKGlzT3duQWN0aW9uICYmIGVudmVsb3BlLm9yaWdpbikge1xuXHRcdFx0Y29uc3QgaWR4ID0gdGhpcy5fcGVuZGluZ0FjdGlvbnMuZmluZEluZGV4KHAgPT4gcC5jbGllbnRTZXEgPT09IGVudmVsb3BlLm9yaWdpbiEuY2xpZW50U2VxKTtcblx0XHRcdGlmIChpZHggIT09IC0xKSB7XG5cdFx0XHRcdGlmICghZW52ZWxvcGUucmVqZWN0aW9uUmVhc29uKSB7XG5cdFx0XHRcdFx0dGhpcy5fY29uZmlybWVkQXBwbHkoZW52ZWxvcGUuYWN0aW9uKTtcblx0XHRcdFx0fVxuXHRcdFx0XHR0aGlzLl9wZW5kaW5nQWN0aW9ucy5zcGxpY2UoaWR4LCAxKTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdHRoaXMuX2NvbmZpcm1lZEFwcGx5KGVudmVsb3BlLmFjdGlvbik7XG5cdFx0XHR9XG5cdFx0fSBlbHNlIHtcblx0XHRcdHRoaXMuX2NvbmZpcm1lZEFwcGx5KGVudmVsb3BlLmFjdGlvbik7XG5cdFx0fVxuXHRcdHRoaXMuX3JlY29tcHV0ZU9wdGltaXN0aWMoKTtcblx0fVxuXG5cdHByaXZhdGUgX2NvbmZpcm1lZEFwcGx5KGFjdGlvbjogU3RhdGVBY3Rpb24pOiB2b2lkIHtcblx0XHRpZiAodGhpcy5fY29uZmlybWVkU3RhdGUpIHtcblx0XHRcdHRoaXMuX2NvbmZpcm1lZFN0YXRlID0gdGhpcy5fYXBwbHlSZWR1Y2VyKHRoaXMuX2NvbmZpcm1lZFN0YXRlLCBhY3Rpb24pO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgX3JlY29tcHV0ZU9wdGltaXN0aWMoKTogdm9pZCB7XG5cdFx0Y29uc3QgY29uZmlybWVkID0gdGhpcy5fY29uZmlybWVkU3RhdGU7XG5cdFx0aWYgKCFjb25maXJtZWQpIHtcblx0XHRcdHRoaXMuX29wdGltaXN0aWNTdGF0ZSA9IHVuZGVmaW5lZDtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRpZiAodGhpcy5fcGVuZGluZ0FjdGlvbnMubGVuZ3RoID09PSAwKSB7XG5cdFx0XHR0aGlzLl9vcHRpbWlzdGljU3RhdGUgPSB1bmRlZmluZWQ7IC8vIE5vIHBlbmRpbmcgXHUyMTkyIHZhbHVlIGZhbGxzIHRocm91Z2ggdG8gY29uZmlybWVkXG5cdFx0XHR0aGlzLl9vbkRpZENoYW5nZS5maXJlKGNvbmZpcm1lZCk7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0bGV0IHN0YXRlID0gY29uZmlybWVkO1xuXHRcdGZvciAoY29uc3QgcGVuZGluZyBvZiB0aGlzLl9wZW5kaW5nQWN0aW9ucykge1xuXHRcdFx0c3RhdGUgPSBhbm5vdGF0aW9uc1JlZHVjZXIoc3RhdGUsIHBlbmRpbmcuYWN0aW9uLCB0aGlzLl9sb2cpO1xuXHRcdH1cblx0XHR0aGlzLl9vcHRpbWlzdGljU3RhdGUgPSBzdGF0ZTtcblx0XHR0aGlzLl9vbkRpZENoYW5nZS5maXJlKHN0YXRlKTtcblx0fVxufVxuXG50eXBlIE1hbmFnZWRTdWJzY3JpcHRpb25FbnRyeSA9IHsgc3ViOiBNYW5hZ2VkU3Vic2NyaXB0aW9uOyBraW5kOiBTdGF0ZUNvbXBvbmVudHM7IHJlZkNvdW50OiBudW1iZXI7IGhvbGRlcnM6IE1hcDxudW1iZXIsIHN0cmluZz4gfTtcblxuLy8gLS0tIFN1YnNjcmlwdGlvbiBNYW5hZ2VyIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cblxuXG4vKipcbiAqIE1hbmFnZXMgdGhlIGxpZmVjeWNsZSBvZiByZXNvdXJjZSBzdWJzY3JpcHRpb25zIGZvciBhbiBhZ2VudCBjb25uZWN0aW9uLlxuICpcbiAqIFByb3ZpZGVzIHJlZmNvdW50ZWQgYWNjZXNzIHZpYSB7QGxpbmsgZ2V0U3Vic2NyaXB0aW9ufSBcdTIwMTQgdGhlIHN1YnNjcmlwdGlvblxuICogaXMgY3JlYXRlZCBvbiBmaXJzdCBhY3F1aXJlLCBzdWJzY3JpYmVzIHRvIHRoZSBzZXJ2ZXIsIGFuZCBzdGF5cyBhbGl2ZVxuICogdW50aWwgdGhlIGxhc3QgcmVmZXJlbmNlIGlzIGRpc3Bvc2VkLlxuICpcbiAqIFRoZSBjb25uZWN0aW9uIGZlZWRzIGFjdGlvbiBlbnZlbG9wZXMgdG8gYWxsIGFjdGl2ZSBzdWJzY3JpcHRpb25zIHZpYVxuICoge0BsaW5rIHJlY2VpdmVFbnZlbG9wZX0uXG4gKi9cbmV4cG9ydCBjbGFzcyBBZ2VudFN1YnNjcmlwdGlvbk1hbmFnZXIgZXh0ZW5kcyBEaXNwb3NhYmxlIHtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9zdWJzY3JpcHRpb25zID0gbmV3IFJlc291cmNlTWFwPE1hbmFnZWRTdWJzY3JpcHRpb25FbnRyeT4oKTtcblx0cHJpdmF0ZSByZWFkb25seSBfaW5mbGlnaHRDcmVhdGVzID0gbmV3IFJlc291cmNlTWFwPFByb21pc2U8dW5rbm93bj4+KCk7XG5cdHByaXZhdGUgX3JlZmVyZW5jZU93bmVySWRzID0gMDtcblx0cHJpdmF0ZSByZWFkb25seSBfcm9vdFN0YXRlOiBSb290U3RhdGVTdWJzY3JpcHRpb247XG5cdHByaXZhdGUgcmVhZG9ubHkgX2NsaWVudElkOiBzdHJpbmc7XG5cdHByaXZhdGUgcmVhZG9ubHkgX3NlcUFsbG9jYXRvcjogKCkgPT4gbnVtYmVyO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9sb2c6IChtc2c6IHN0cmluZykgPT4gdm9pZDtcblx0cHJpdmF0ZSByZWFkb25seSBfc3Vic2NyaWJlOiAocmVzb3VyY2U6IFVSSSkgPT4gUHJvbWlzZTxJU3RhdGVTbmFwc2hvdD47XG5cdHByaXZhdGUgcmVhZG9ubHkgX3Vuc3Vic2NyaWJlOiAocmVzb3VyY2U6IFVSSSkgPT4gdm9pZDtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRjbGllbnRJZDogc3RyaW5nLFxuXHRcdHNlcUFsbG9jYXRvcjogKCkgPT4gbnVtYmVyLFxuXHRcdGxvZzogKG1zZzogc3RyaW5nKSA9PiB2b2lkLFxuXHRcdHN1YnNjcmliZTogKHJlc291cmNlOiBVUkkpID0+IFByb21pc2U8SVN0YXRlU25hcHNob3Q+LFxuXHRcdHVuc3Vic2NyaWJlOiAocmVzb3VyY2U6IFVSSSkgPT4gdm9pZCxcblx0KSB7XG5cdFx0c3VwZXIoKTtcblx0XHR0aGlzLl9jbGllbnRJZCA9IGNsaWVudElkO1xuXHRcdHRoaXMuX3NlcUFsbG9jYXRvciA9IHNlcUFsbG9jYXRvcjtcblx0XHR0aGlzLl9sb2cgPSBsb2c7XG5cdFx0dGhpcy5fc3Vic2NyaWJlID0gc3Vic2NyaWJlO1xuXHRcdHRoaXMuX3Vuc3Vic2NyaWJlID0gdW5zdWJzY3JpYmU7XG5cdFx0dGhpcy5fcm9vdFN0YXRlID0gdGhpcy5fcmVnaXN0ZXIobmV3IFJvb3RTdGF0ZVN1YnNjcmlwdGlvbihjbGllbnRJZCwgbG9nKSk7XG5cdH1cblxuXHQvKiogVGhlIGFsd2F5cy1saXZlIHJvb3Qgc3RhdGUgc3Vic2NyaXB0aW9uLiAqL1xuXHRnZXQgcm9vdFN0YXRlKCk6IElBZ2VudFN1YnNjcmlwdGlvbjxSb290U3RhdGU+IHtcblx0XHRyZXR1cm4gdGhpcy5fcm9vdFN0YXRlO1xuXHR9XG5cblx0LyoqXG5cdCAqIEluaXRpYWxpemUgdGhlIHJvb3Qgc3RhdGUgZnJvbSBhIHNuYXBzaG90IHJlY2VpdmVkIGR1cmluZyB0aGVcblx0ICogY29ubmVjdGlvbiBoYW5kc2hha2UuXG5cdCAqL1xuXHRoYW5kbGVSb290U25hcHNob3Qoc3RhdGU6IFJvb3RTdGF0ZSwgZnJvbVNlcTogbnVtYmVyKTogdm9pZCB7XG5cdFx0dGhpcy5fcm9vdFN0YXRlLmhhbmRsZVNuYXBzaG90KHN0YXRlLCBmcm9tU2VxKTtcblx0fVxuXG5cdC8qKlxuXHQgKiBSZXR1cm5zIGFuIGV4aXN0aW5nIHN1YnNjcmlwdGlvbiB3aXRob3V0IGFmZmVjdGluZyBpdHMgcmVmY291bnQuXG5cdCAqIFJldHVybnMgYHVuZGVmaW5lZGAgaWYgbm8gc3Vic2NyaXB0aW9uIGlzIGFjdGl2ZSBmb3IgdGhlIGdpdmVuIHJlc291cmNlLlxuXHQgKi9cblx0Z2V0U3Vic2NyaXB0aW9uVW5tYW5hZ2VkPFQ+KHJlc291cmNlOiBVUkkpOiBJQWdlbnRTdWJzY3JpcHRpb248VD4gfCB1bmRlZmluZWQge1xuXHRcdGNvbnN0IGVudHJ5ID0gdGhpcy5fc3Vic2NyaXB0aW9ucy5nZXQocmVzb3VyY2UpO1xuXHRcdHJldHVybiBlbnRyeT8uc3ViIGFzIElBZ2VudFN1YnNjcmlwdGlvbjxUPiB8IHVuZGVmaW5lZDtcblx0fVxuXG5cdC8qKlxuXHQgKiBSZXR1cm5zIHRoZSBpbi1mbGlnaHQgYGNyZWF0ZVNlc3Npb25gIFByb21pc2UgZm9yIHRoaXMgVVJJLCBvciBgdW5kZWZpbmVkYCBpZiBubyBjcmVhdGUgaXMgcGVuZGluZy4gVXNlZCBieVxuXHQgKiBjYWxsZXJzIHRoYXQgbmVlZCB0byBnYXRlIHRoZWlyIG93biB3b3JrIG9uIGEgc3RpbGwtcnVubmluZyBlYWdlciBgY3JlYXRlU2Vzc2lvbmAgKGUuZy4gdGhlIGNoYXQgaGFuZGxlciBhd2FpdHNcblx0ICogdGhpcyBiZWZvcmUgZGVjaWRpbmcgd2hldGhlciB0aGUgc2Vzc2lvbnMgcHJvdmlkZXIncyBlYWdlci1jcmVhdGUgcmFjZWQgZmlyc3Qgc2VuZCkuXG5cdCAqL1xuXHRnZXRJbmZsaWdodFNlc3Npb25DcmVhdGUocmVzb3VyY2U6IFVSSSk6IFByb21pc2U8dW5rbm93bj4gfCB1bmRlZmluZWQge1xuXHRcdHJldHVybiB0aGlzLl9pbmZsaWdodENyZWF0ZXMuZ2V0KHJlc291cmNlKTtcblx0fVxuXG5cdC8qKlxuXHQgKiBSZWdpc3RlciBhbiBpbi1mbGlnaHQgYGNyZWF0ZVNlc3Npb25gIFByb21pc2UgZm9yIGEgc2Vzc2lvbiBVUkkuIEFueVxuXHQgKiBzdWJzY3JpYmUgaXNzdWVkIGZvciB0aGlzIHJlc291cmNlIHdoaWxlIHRoZSBjcmVhdGUgaXMgcGVuZGluZyB3YWl0c1xuXHQgKiBmb3IgdGhlIFByb21pc2UgYmVmb3JlIGlzc3VpbmcgdGhlIHdpcmUtbGV2ZWwgc3Vic2NyaWJlLlxuXHQgKi9cblx0dHJhY2tTZXNzaW9uQ3JlYXRlKHJlc291cmNlOiBVUkksIHByb21pc2U6IFByb21pc2U8dW5rbm93bj4pOiB2b2lkIHtcblx0XHR0aGlzLl9pbmZsaWdodENyZWF0ZXMuc2V0KHJlc291cmNlLCBwcm9taXNlKTtcblx0XHQvLyBUaGlzIGJyYW5jaCBvbmx5IG9ic2VydmVzIHNldHRsZW1lbnQgdG8gZXZpY3QgdGhlIGluZmxpZ2h0IGVudHJ5OyB0aGVcblx0XHQvLyBgY3JlYXRlU2Vzc2lvbmAgY2FsbGVyIChhbmQgdGhlIHNlcnZlciwgdmlhIGxvZ1NlcnZpY2UuZXJyb3IpIG93bnMgdGhlXG5cdFx0Ly8gcmVzdWx0LiBgZmluYWxseWAgcmUtcmFpc2VzIGEgcmVqZWN0aW9uLCBzbyB3aXRob3V0IHRoaXMgdHJhaWxpbmdcblx0XHQvLyBgY2F0Y2hgIGFuIGV4cGVjdGVkIGNyZWF0ZSBmYWlsdXJlIChlLmcuIEFIUF9BVVRIX1JFUVVJUkVEKSB3b3VsZCBiZVxuXHRcdC8vIHJlcG9ydGVkIGEgc2Vjb25kIHRpbWUgYXMgYW4gdW5oYW5kbGVkIHJlamVjdGlvbi5cblx0XHR2b2lkIHByb21pc2UuZmluYWxseSgoKSA9PiB7XG5cdFx0XHRpZiAodGhpcy5faW5mbGlnaHRDcmVhdGVzLmdldChyZXNvdXJjZSkgPT09IHByb21pc2UpIHtcblx0XHRcdFx0dGhpcy5faW5mbGlnaHRDcmVhdGVzLmRlbGV0ZShyZXNvdXJjZSk7XG5cdFx0XHR9XG5cdFx0fSkuY2F0Y2goKCkgPT4geyB9KTtcblx0fVxuXG5cdC8qKlxuXHQgKiBHZXQgb3IgY3JlYXRlIGEgcmVmY291bnRlZCBzdWJzY3JpcHRpb24gdG8gYW55IHJlc291cmNlLiBEaXNwb3Npbmdcblx0ICogdGhlIHJldHVybmVkIHJlZmVyZW5jZSBkZWNyZW1lbnRzIHRoZSByZWZjb3VudDsgd2hlbiBpdCByZWFjaGVzIHplcm9cblx0ICogdGhlIHN1YnNjcmlwdGlvbiBpcyB0b3JuIGRvd24gYW5kIHRoZSBzZXJ2ZXIgaXMgbm90aWZpZWQuXG5cdCAqXG5cdCAqIGBvd25lcmAgbmFtZXMgdGhlIGNhbGxlciBob2xkaW5nIHRoZSByZWZlcmVuY2Ugc28gaW5zcGVjdGlvbiBzdXJmYWNlc1xuXHQgKiAoc2VlIHtAbGluayBnZXRBY3RpdmVTdWJzY3JpcHRpb25zfSkgY2FuIGF0dHJpYnV0ZSB3aG8gaXMgcmV0YWluaW5nIGFcblx0ICogc3Vic2NyaXB0aW9uLiBVc2UgYSBzdGFibGUsIGh1bWFuLXJlYWRhYmxlIGlkZW50aWZpZXIgc3VjaCBhcyB0aGVcblx0ICogYWNxdWlyaW5nIGNsYXNzIG5hbWUuXG5cdCAqL1xuXHRnZXRTdWJzY3JpcHRpb248VD4oa2luZDogU3RhdGVDb21wb25lbnRzLCByZXNvdXJjZTogVVJJLCBvd25lcjogc3RyaW5nKTogSVJlZmVyZW5jZTxJQWdlbnRTdWJzY3JpcHRpb248VD4+IHtcblx0XHRjb25zdCBleGlzdGluZyA9IHRoaXMuX3N1YnNjcmlwdGlvbnMuZ2V0KHJlc291cmNlKTtcblx0XHRpZiAoZXhpc3RpbmcpIHtcblx0XHRcdGlmIChleGlzdGluZy5zdWIudmFsdWUgaW5zdGFuY2VvZiBFcnJvcikge1xuXHRcdFx0XHQvLyBGYWlsZWQgc3Vic2NyaXB0aW9ucyBzaG91bGQgbm90IHBvaXNvbiB0aGUgcmVzb3VyY2UgZm9yZXZlci4gRXZpY3Rcblx0XHRcdFx0Ly8gdGhlIGVycm9yZWQgZW50cnkgc28gdGhpcyBhY3F1aXJlIHBlcmZvcm1zIGEgZnJlc2ggc3Vic2NyaWJlLlxuXHRcdFx0XHR0aGlzLl9zdWJzY3JpcHRpb25zLmRlbGV0ZShyZXNvdXJjZSk7XG5cdFx0XHRcdHRoaXMuX2Rpc3Bvc2VTdWJzY3JpcHRpb25FbnRyeShyZXNvdXJjZSwgZXhpc3RpbmcpO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0ZXhpc3RpbmcucmVmQ291bnQrKztcblx0XHRcdFx0cmV0dXJuIHRoaXMuX2FjcXVpcmVSZWZlcmVuY2U8VD4ocmVzb3VyY2UsIGV4aXN0aW5nLCBvd25lcik7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0Ly8gQ3JlYXRlIG5ldyBzdWJzY3JpcHRpb24gYmFzZWQgb24gY2FsbGVyLXNwZWNpZmllZCBraW5kXG5cdFx0Y29uc3Qga2V5ID0gcmVzb3VyY2UudG9TdHJpbmcoKTtcblx0XHRjb25zdCBzdWIgPSB0aGlzLl9jcmVhdGVTdWJzY3JpcHRpb24oa2luZCwga2V5KTtcblx0XHRjb25zdCBlbnRyeTogTWFuYWdlZFN1YnNjcmlwdGlvbkVudHJ5ID0geyBzdWIsIGtpbmQsIHJlZkNvdW50OiAxLCBob2xkZXJzOiBuZXcgTWFwKCkgfTtcblx0XHR0aGlzLl9zdWJzY3JpcHRpb25zLnNldChyZXNvdXJjZSwgZW50cnkpO1xuXG5cdFx0Ly8gS2ljayBvZmYgc2VydmVyIHN1YnNjcmlwdGlvbiBhc3luY2hyb25vdXNseS5cblx0XHQvLyBDYXB0dXJlIHRoZSBlbnRyeSByZWZlcmVuY2Ugc28gd2UgY2FuIHZhbGlkYXRlIGl0IGhhc24ndCBiZWVuXG5cdFx0Ly8gcmVwbGFjZWQgYnkgYSBuZXcgc3Vic2NyaXB0aW9uIGZvciB0aGUgc2FtZSBrZXkgKHJhY2UgZ3VhcmQpLlxuXHRcdHZvaWQgKGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IGluZmxpZ2h0ID0gdGhpcy5faW5mbGlnaHRDcmVhdGVzLmdldChyZXNvdXJjZSk7XG5cdFx0XHRpZiAoaW5mbGlnaHQpIHtcblx0XHRcdFx0dHJ5IHtcblx0XHRcdFx0XHRhd2FpdCBpbmZsaWdodDtcblx0XHRcdFx0fSBjYXRjaCB7XG5cdFx0XHRcdFx0Ly8gU3dhbGxvdyBcdTIwMTQgZmFsbCB0aHJvdWdoIHRvIHN1YnNjcmliZSBzbyB0aGUgZXJyb3Jcblx0XHRcdFx0XHQvLyBzdXJmYWNlcyBjb25zaXN0ZW50bHkgdmlhIHNldEVycm9yKCkgb24gdGhlXG5cdFx0XHRcdFx0Ly8gc3Vic2NyaXB0aW9uLCBtYXRjaGluZyB0aGUgbm8taW5mbGlnaHQgcGF0aC5cblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdFx0dHJ5IHtcblx0XHRcdFx0Y29uc3Qgc25hcHNob3QgPSBhd2FpdCB0aGlzLl9zdWJzY3JpYmUocmVzb3VyY2UpO1xuXHRcdFx0XHRpZiAodGhpcy5fc3Vic2NyaXB0aW9ucy5nZXQocmVzb3VyY2UpID09PSBlbnRyeSkge1xuXHRcdFx0XHRcdHN1Yi5oYW5kbGVTbmFwc2hvdChzbmFwc2hvdC5zdGF0ZSBhcyBuZXZlciwgc25hcHNob3QuZnJvbVNlcSk7XG5cdFx0XHRcdH1cblx0XHRcdH0gY2F0Y2ggKGVycikge1xuXHRcdFx0XHRpZiAodGhpcy5fc3Vic2NyaXB0aW9ucy5nZXQocmVzb3VyY2UpID09PSBlbnRyeSkge1xuXHRcdFx0XHRcdHN1Yi5zZXRFcnJvcihlcnIgaW5zdGFuY2VvZiBFcnJvciA/IGVyciA6IG5ldyBFcnJvcihTdHJpbmcoZXJyKSkpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fSkoKTtcblxuXHRcdHJldHVybiB0aGlzLl9hY3F1aXJlUmVmZXJlbmNlPFQ+KHJlc291cmNlLCBlbnRyeSwgb3duZXIpO1xuXHR9XG5cblx0LyoqXG5cdCAqIFJlZ2lzdGVyIGBvd25lcmAgYXMgYSBob2xkZXIgb2YgYGVudHJ5YCBhbmQgcmV0dXJuIGEgcmVmZXJlbmNlIHdob3NlXG5cdCAqIGRpc3Bvc2FsIHJlbW92ZXMgdGhhdCBob2xkZXIgYW5kIHJlbGVhc2VzIHRoZSBzdWJzY3JpcHRpb24uIFRoZVxuXHQgKiBjYWxsZXIgaXMgcmVzcG9uc2libGUgZm9yIHRoZSBtYXRjaGluZyByZWZjb3VudCBpbmNyZW1lbnQgKGEgZnJlc2hcblx0ICogZW50cnkgc3RhcnRzIGF0IDE7IGFuIGV4aXN0aW5nIGVudHJ5IGlzIGJ1bXBlZCBiZWZvcmUgY2FsbGluZyB0aGlzKS5cblx0ICovXG5cdHByaXZhdGUgX2FjcXVpcmVSZWZlcmVuY2U8VD4ocmVzb3VyY2U6IFVSSSwgZW50cnk6IE1hbmFnZWRTdWJzY3JpcHRpb25FbnRyeSwgb3duZXI6IHN0cmluZyk6IElSZWZlcmVuY2U8SUFnZW50U3Vic2NyaXB0aW9uPFQ+PiB7XG5cdFx0Y29uc3Qgb3duZXJJZCA9ICsrdGhpcy5fcmVmZXJlbmNlT3duZXJJZHM7XG5cdFx0ZW50cnkuaG9sZGVycy5zZXQob3duZXJJZCwgb3duZXIpO1xuXG5cdFx0bGV0IGlzRGlzcG9zZWQgPSBmYWxzZTtcblx0XHRyZXR1cm4ge1xuXHRcdFx0b2JqZWN0OiBlbnRyeS5zdWIgYXMgdW5rbm93biBhcyBJQWdlbnRTdWJzY3JpcHRpb248VD4sXG5cdFx0XHRkaXNwb3NlOiAoKSA9PiB7XG5cdFx0XHRcdGlmIChpc0Rpc3Bvc2VkKSB7XG5cdFx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGlzRGlzcG9zZWQgPSB0cnVlO1xuXHRcdFx0XHRlbnRyeS5ob2xkZXJzLmRlbGV0ZShvd25lcklkKTtcblx0XHRcdFx0dGhpcy5fcmVsZWFzZVN1YnNjcmlwdGlvbihyZXNvdXJjZSwgZW50cnkpO1xuXHRcdFx0fSxcblx0XHR9O1xuXHR9XG5cblx0cHJpdmF0ZSBfZGlzcG9zZVN1YnNjcmlwdGlvbkVudHJ5KHJlc291cmNlOiBVUkksIGVudHJ5OiBNYW5hZ2VkU3Vic2NyaXB0aW9uRW50cnkpOiB2b2lkIHtcblx0XHR0aGlzLl90cnlVbnN1YnNjcmliZShyZXNvdXJjZSk7XG5cdFx0aWYgKGVudHJ5LnN1YiBpbnN0YW5jZW9mIFNlc3Npb25TdGF0ZVN1YnNjcmlwdGlvbiB8fCBlbnRyeS5zdWIgaW5zdGFuY2VvZiBDaGF0U3RhdGVTdWJzY3JpcHRpb24pIHtcblx0XHRcdGVudHJ5LnN1Yi5jbGVhclBlbmRpbmcoKTtcblx0XHR9XG5cdFx0ZW50cnkuc3ViLmRpc3Bvc2UoKTtcblx0fVxuXG5cdHByaXZhdGUgX3RyeVVuc3Vic2NyaWJlKHJlc291cmNlOiBVUkkpOiB2b2lkIHtcblx0XHR0cnkge1xuXHRcdFx0dGhpcy5fdW5zdWJzY3JpYmUocmVzb3VyY2UpO1xuXHRcdH0gY2F0Y2ggKGVycm9yKSB7XG5cdFx0XHRjb25zdCBtZXNzYWdlID0gZXJyb3IgaW5zdGFuY2VvZiBFcnJvciA/IGVycm9yLm1lc3NhZ2UgOiBTdHJpbmcoZXJyb3IpO1xuXHRcdFx0dGhpcy5fbG9nKGBGYWlsZWQgdG8gdW5zdWJzY3JpYmUgJHtyZXNvdXJjZS50b1N0cmluZygpfTogJHttZXNzYWdlfWApO1xuXHRcdH1cblx0fVxuXG5cdC8qKlxuXHQgKiBSb3V0ZSBhbiBpbmNvbWluZyBhY3Rpb24gZW52ZWxvcGUgdG8gYWxsIGFjdGl2ZSBzdWJzY3JpcHRpb25zLlxuXHQgKi9cblx0cmVjZWl2ZUVudmVsb3BlKGVudmVsb3BlOiBBY3Rpb25FbnZlbG9wZSk6IHZvaWQge1xuXHRcdC8vIFJvb3Qgc3RhdGUgZ2V0cyBhbGwgcm9vdCBhY3Rpb25zXG5cdFx0dGhpcy5fcm9vdFN0YXRlLnJlY2VpdmVFbnZlbG9wZShlbnZlbG9wZSk7XG5cdFx0Ly8gT3RoZXIgc3Vic2NyaXB0aW9ucyBnZXQgZmlsdGVyZWQgYWN0aW9uc1xuXHRcdGZvciAoY29uc3QgeyBzdWIgfSBvZiB0aGlzLl9zdWJzY3JpcHRpb25zLnZhbHVlcygpKSB7XG5cdFx0XHRzdWIucmVjZWl2ZUVudmVsb3BlKGVudmVsb3BlKTtcblx0XHR9XG5cdH1cblxuXHQvKipcblx0ICogRGlzcGF0Y2ggYSBjbGllbnQgYWN0aW9uLiBBcHBsaWVzIG9wdGltaXN0aWNhbGx5IHRvIHRoZSByZWxldmFudFxuXHQgKiBzdWJzY3JpcHRpb24gaWYgYXBwbGljYWJsZSwgdGhlbiByZXR1cm5zIHRoZSBjbGllbnRTZXEuXG5cdCAqXG5cdCAqIGBjaGFubmVsYCBpcyB0aGUgcHJvdG9jb2wgVVJJIHN0cmluZyBpZGVudGlmeWluZyB0aGUgY2hhbm5lbCB0aGVcblx0ICogYWN0aW9uIHRhcmdldHMgKGEgc2Vzc2lvbiBVUkkgZm9yIHNlc3Npb24gYWN0aW9ucywgZXRjLikuXG5cdCAqL1xuXHRkaXNwYXRjaE9wdGltaXN0aWMoY2hhbm5lbDogc3RyaW5nLCBhY3Rpb246IFNlc3Npb25BY3Rpb24gfCBDaGF0QWN0aW9uIHwgVGVybWluYWxBY3Rpb24gfCBDbGllbnRDaGFuZ2VzZXRBY3Rpb24gfCBDbGllbnRBbm5vdGF0aW9uc0FjdGlvbiB8IElSb290Q29uZmlnQ2hhbmdlZEFjdGlvbik6IG51bWJlciB7XG5cdFx0aWYgKGlzU2Vzc2lvbkFjdGlvbihhY3Rpb24pKSB7XG5cdFx0XHRjb25zdCBlbnRyeSA9IHRoaXMuX3N1YnNjcmlwdGlvbnMuZ2V0KFVSSS5wYXJzZShjaGFubmVsKSk7XG5cdFx0XHRpZiAoZW50cnk/LnN1YiBpbnN0YW5jZW9mIFNlc3Npb25TdGF0ZVN1YnNjcmlwdGlvbikge1xuXHRcdFx0XHRyZXR1cm4gZW50cnkuc3ViLmFwcGx5T3B0aW1pc3RpYyhhY3Rpb24pO1xuXHRcdFx0fVxuXHRcdH0gZWxzZSBpZiAoaXNDaGF0QWN0aW9uKGFjdGlvbikpIHtcblx0XHRcdGNvbnN0IGVudHJ5ID0gdGhpcy5fc3Vic2NyaXB0aW9ucy5nZXQoVVJJLnBhcnNlKGNoYW5uZWwpKTtcblx0XHRcdGlmIChlbnRyeT8uc3ViIGluc3RhbmNlb2YgQ2hhdFN0YXRlU3Vic2NyaXB0aW9uKSB7XG5cdFx0XHRcdHJldHVybiBlbnRyeS5zdWIuYXBwbHlPcHRpbWlzdGljKGFjdGlvbik7XG5cdFx0XHR9XG5cdFx0fSBlbHNlIGlmIChpc0NoYW5nZXNldEFjdGlvbihhY3Rpb24pKSB7XG5cdFx0XHRjb25zdCBlbnRyeSA9IHRoaXMuX3N1YnNjcmlwdGlvbnMuZ2V0KFVSSS5wYXJzZShjaGFubmVsKSk7XG5cdFx0XHRpZiAoZW50cnk/LnN1YiBpbnN0YW5jZW9mIENoYW5nZXNldFN0YXRlU3Vic2NyaXB0aW9uKSB7XG5cdFx0XHRcdHJldHVybiBlbnRyeS5zdWIuYXBwbHlPcHRpbWlzdGljKGFjdGlvbik7XG5cdFx0XHR9XG5cdFx0fSBlbHNlIGlmIChpc0Fubm90YXRpb25zQWN0aW9uKGFjdGlvbikpIHtcblx0XHRcdGNvbnN0IGVudHJ5ID0gdGhpcy5fc3Vic2NyaXB0aW9ucy5nZXQoVVJJLnBhcnNlKGNoYW5uZWwpKTtcblx0XHRcdGlmIChlbnRyeT8uc3ViIGluc3RhbmNlb2YgQW5ub3RhdGlvbnNTdGF0ZVN1YnNjcmlwdGlvbikge1xuXHRcdFx0XHRyZXR1cm4gZW50cnkuc3ViLmFwcGx5T3B0aW1pc3RpYyhhY3Rpb24pO1xuXHRcdFx0fVxuXHRcdH1cblx0XHRyZXR1cm4gdGhpcy5fc2VxQWxsb2NhdG9yKCk7XG5cdH1cblxuXHQvKipcblx0ICogVVJJcyBjdXJyZW50bHkgc3Vic2NyaWJlZCB0byB2aWEge0BsaW5rIGdldFN1YnNjcmlwdGlvbn0uIFVzZWQgdG9cblx0ICogYnVpbGQgdGhlIGBzdWJzY3JpcHRpb25zYCBwYXlsb2FkIGZvciBhIGByZWNvbm5lY3RgIFJQQyBzbyB0aGVcblx0ICogc2VydmVyIGNhbiByZXN0b3JlIHRoZW0gaW4gb25lIHJvdW5kLXRyaXAuXG5cdCAqXG5cdCAqIERvZXMgTk9UIGluY2x1ZGUgdGhlIGFsd2F5cy1saXZlIHJvb3Qgc3RhdGUsIHdoaWNoIHRoZSBwcm90b2NvbFxuXHQgKiBjbGllbnQgbWFuYWdlcyBzZXBhcmF0ZWx5LlxuXHQgKi9cblx0Y3VycmVudFN1YnNjcmlwdGlvblVyaXMoKTogVVJJW10ge1xuXHRcdHJldHVybiBbLi4udGhpcy5fc3Vic2NyaXB0aW9ucy5rZXlzKCldO1xuXHR9XG5cblx0LyoqXG5cdCAqIFJlYWQtb25seSBkZXNjcmlwdG9ycyBvZiBldmVyeSBhY3RpdmUgcmVzb3VyY2Ugc3Vic2NyaXB0aW9uLCBmb3Jcblx0ICogaW5zcGVjdGlvbi9kZWJ1ZyBzdXJmYWNlcy4gRG9lcyBOT1QgaW5jbHVkZSB0aGUgYWx3YXlzLWxpdmUgcm9vdFxuXHQgKiBzdGF0ZSwgd2hpY2ggdGhlIGNvbm5lY3Rpb24gZXhwb3NlcyBzZXBhcmF0ZWx5IHZpYSB7QGxpbmsgcm9vdFN0YXRlfS5cblx0ICovXG5cdGdldEFjdGl2ZVN1YnNjcmlwdGlvbnMoKTogcmVhZG9ubHkgSUFjdGl2ZVN1YnNjcmlwdGlvbkluZm9bXSB7XG5cdFx0Y29uc3Qgb3V0OiBJQWN0aXZlU3Vic2NyaXB0aW9uSW5mb1tdID0gW107XG5cdFx0Zm9yIChjb25zdCBbcmVzb3VyY2UsIGVudHJ5XSBvZiB0aGlzLl9zdWJzY3JpcHRpb25zKSB7XG5cdFx0XHRjb25zdCB2YWx1ZSA9IGVudHJ5LnN1Yi52YWx1ZTtcblx0XHRcdGNvbnN0IHN0YXR1cyA9IHZhbHVlID09PSB1bmRlZmluZWQgPyAncGVuZGluZycgOiB2YWx1ZSBpbnN0YW5jZW9mIEVycm9yID8gJ2Vycm9yJyA6ICdzbmFwc2hvdCc7XG5cdFx0XHRvdXQucHVzaCh7IHJlc291cmNlLCBraW5kOiBlbnRyeS5raW5kLCByZWZDb3VudDogZW50cnkucmVmQ291bnQsIGhvbGRlcnM6IHRoaXMuX3N1bW1hcml6ZUhvbGRlcnMoZW50cnkpLCBzdGF0dXMgfSk7XG5cdFx0fVxuXHRcdHJldHVybiBvdXQ7XG5cdH1cblxuXHQvKiogR3JvdXAgYW4gZW50cnkncyBob2xkZXJzIGJ5IG93bmVyIG5hbWUsIHNvcnRlZCBieSBkZXNjZW5kaW5nIGNvdW50LiAqL1xuXHRwcml2YXRlIF9zdW1tYXJpemVIb2xkZXJzKGVudHJ5OiBNYW5hZ2VkU3Vic2NyaXB0aW9uRW50cnkpOiBJQWN0aXZlU3Vic2NyaXB0aW9uSG9sZGVyW10ge1xuXHRcdGNvbnN0IGNvdW50cyA9IG5ldyBNYXA8c3RyaW5nLCBudW1iZXI+KCk7XG5cdFx0Zm9yIChjb25zdCBvd25lciBvZiBlbnRyeS5ob2xkZXJzLnZhbHVlcygpKSB7XG5cdFx0XHRjb3VudHMuc2V0KG93bmVyLCAoY291bnRzLmdldChvd25lcikgPz8gMCkgKyAxKTtcblx0XHR9XG5cdFx0cmV0dXJuIFsuLi5jb3VudHMuZW50cmllcygpXVxuXHRcdFx0Lm1hcCgoW293bmVyLCBjb3VudF0pID0+ICh7IG93bmVyLCBjb3VudCB9KSlcblx0XHRcdC5zb3J0KChhLCBiKSA9PiBiLmNvdW50IC0gYS5jb3VudCk7XG5cdH1cblxuXHQvKipcblx0ICogU25hcHNob3Qgb2YgZXZlcnkgcGVuZGluZyBvcHRpbWlzdGljIGFjdGlvbiBhY3Jvc3MgYWxsIHNlc3Npb25cblx0ICogc3Vic2NyaXB0aW9ucy4gQ2FsbGVycyB1c2UgdGhpcyB0byByZXBsYXkgYWN0aW9ucyBhZnRlciBhIHRyYW5zcG9ydFxuXHQgKiByZWNvbm5lY3Q7IGVudHJpZXMgYXJlIGtlcHQgb24gdGhlaXIgc3Vic2NyaXB0aW9ucyB1bnRpbCB0aGV5J3JlXG5cdCAqIGVpdGhlciBlY2hvZWQgYmFjayBieSB0aGUgc2VydmVyIG9yIGV4cGxpY2l0bHkgZHJvcHBlZCB2aWFcblx0ICoge0BsaW5rIGRyb3BQZW5kaW5nU2Vzc2lvbkFjdGlvbn0uXG5cdCAqL1xuXHRnZXRQZW5kaW5nU2Vzc2lvbkFjdGlvbnMoKTogSVBlbmRpbmdEaXNwYXRjaEFjdGlvbltdIHtcblx0XHRjb25zdCBvdXQ6IElQZW5kaW5nRGlzcGF0Y2hBY3Rpb25bXSA9IFtdO1xuXHRcdGZvciAoY29uc3QgeyBzdWIgfSBvZiB0aGlzLl9zdWJzY3JpcHRpb25zLnZhbHVlcygpKSB7XG5cdFx0XHRpZiAoc3ViIGluc3RhbmNlb2YgU2Vzc2lvblN0YXRlU3Vic2NyaXB0aW9uIHx8IHN1YiBpbnN0YW5jZW9mIENoYXRTdGF0ZVN1YnNjcmlwdGlvbikge1xuXHRcdFx0XHRvdXQucHVzaCguLi5zdWIuZ2V0UGVuZGluZ0FjdGlvbnMoKSk7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdHJldHVybiBvdXQ7XG5cdH1cblxuXHQvKipcblx0ICogUmVtb3ZlIGEgc2luZ2xlIHBlbmRpbmcgb3B0aW1pc3RpYyBhY3Rpb24gZm9yIGEgc2Vzc2lvbiBieSBpdHNcblx0ICogYGNsaWVudFNlcWAuIFVzZWQgZHVyaW5nIHJlY29ubmVjdCB0byBldmljdCBhY3Rpb25zIHRoZSBzZXJ2ZXJcblx0ICogYWxyZWFkeSBwcm9jZXNzZWQgKGFuZCByZXBsYXllZCBiYWNrIHRvIHVzKSBzbyB0aGV5J3JlIG5vdCByZXNlbnQuXG5cdCAqL1xuXHRkcm9wUGVuZGluZ1Nlc3Npb25BY3Rpb24oc2Vzc2lvblVyaTogc3RyaW5nLCBjbGllbnRTZXE6IG51bWJlcik6IHZvaWQge1xuXHRcdGNvbnN0IGVudHJ5ID0gdGhpcy5fc3Vic2NyaXB0aW9ucy5nZXQoVVJJLnBhcnNlKHNlc3Npb25VcmkpKTtcblx0XHRpZiAoZW50cnk/LnN1YiBpbnN0YW5jZW9mIFNlc3Npb25TdGF0ZVN1YnNjcmlwdGlvbiB8fCBlbnRyeT8uc3ViIGluc3RhbmNlb2YgQ2hhdFN0YXRlU3Vic2NyaXB0aW9uKSB7XG5cdFx0XHRlbnRyeS5zdWIuZHJvcFBlbmRpbmdCeUNsaWVudFNlcShjbGllbnRTZXEpO1xuXHRcdH1cblx0fVxuXG5cdC8qKlxuXHQgKiBBcHBseSBhIGZyZXNoIHNuYXBzaG90IHRvIGEgc3Vic2NyaWJlZCByZXNvdXJjZSBcdTIwMTQgdXNlZCB3aGVuIHRoZSBzZXJ2ZXJcblx0ICogcmVzcG9uZHMgdG8gYSBgcmVjb25uZWN0YCByZXF1ZXN0IHdpdGggYHR5cGU6ICdzbmFwc2hvdCdgIGJlY2F1c2UgdGhlXG5cdCAqIHJlcGxheSBidWZmZXIgbm8gbG9uZ2VyIGNvdmVycyB0aGUgY2xpZW50J3MgZ2FwLiBSb3V0ZXMgdG8gdGhlIHJvb3Rcblx0ICogc3Vic2NyaXB0aW9uIHdoZW4ge0BsaW5rIFJPT1RfU1RBVEVfVVJJfSBtYXRjaGVzLCBvdGhlcndpc2UgcmVzZWF0cyB0aGVcblx0ICogbWF0Y2hpbmcgZW50cnkgaW4ge0BsaW5rIF9zdWJzY3JpcHRpb25zfS4gVW5rbm93biByZXNvdXJjZXMgYXJlIGlnbm9yZWQuXG5cdCAqL1xuXHRhcHBseVJlY29ubmVjdFNuYXBzaG90KHJlc291cmNlOiBzdHJpbmcsIHN0YXRlOiB1bmtub3duLCBmcm9tU2VxOiBudW1iZXIsIHByZXNlcnZlUGVuZGluZyA9IGZhbHNlKTogdm9pZCB7XG5cdFx0aWYgKGlzQWhwUm9vdENoYW5uZWwocmVzb3VyY2UpKSB7XG5cdFx0XHR0aGlzLl9yb290U3RhdGUuaGFuZGxlU25hcHNob3Qoc3RhdGUgYXMgUm9vdFN0YXRlLCBmcm9tU2VxKTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0Y29uc3QgZW50cnkgPSB0aGlzLl9zdWJzY3JpcHRpb25zLmdldChVUkkucGFyc2UocmVzb3VyY2UpKTtcblx0XHRpZiAoIWVudHJ5KSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdC8vIENsZWFyIGFueSBwZW5kaW5nIG9wdGltaXN0aWMgYWN0aW9ucyBiZWZvcmUgcmVzZWF0aW5nIGNvbmZpcm1lZFxuXHRcdC8vIHN0YXRlIFxcdTIwMTQgdGhleSB3ZXJlIHByZWRpY2F0ZWQgb24gdGhlIHByZS1kaXNjb25uZWN0IGNvbmZpcm1lZFxuXHRcdC8vIHN0YXRlIGFuZCB3b24ndCByZWNvbmNpbGUgY29ycmVjdGx5IGFnYWluc3QgYSBmcmVzaCBzbmFwc2hvdC5cblx0XHRpZiAoIXByZXNlcnZlUGVuZGluZyAmJiAoZW50cnkuc3ViIGluc3RhbmNlb2YgU2Vzc2lvblN0YXRlU3Vic2NyaXB0aW9uIHx8IGVudHJ5LnN1YiBpbnN0YW5jZW9mIENoYXRTdGF0ZVN1YnNjcmlwdGlvbikpIHtcblx0XHRcdGVudHJ5LnN1Yi5jbGVhclBlbmRpbmcoKTtcblx0XHR9XG5cdFx0ZW50cnkuc3ViLmhhbmRsZVNuYXBzaG90KHN0YXRlIGFzIG5ldmVyLCBmcm9tU2VxKTtcblx0fVxuXG5cdC8qKlxuXHQgKiBNYXJrIGEgc2V0IG9mIHN1YnNjcmlwdGlvbnMgYXMgbm8gbG9uZ2VyIHJlc3VtYWJsZSBvbiB0aGUgc2VydmVyXG5cdCAqIChyZXBvcnRlZCB2aWEgYFJlY29ubmVjdFJlcGxheVJlc3VsdC5taXNzaW5nYCkuIFRoZSBzdWJzY3JpcHRpb25zXG5cdCAqIHRoZW1zZWx2ZXMgc3RheSBhbGl2ZSBzbyBjb25zdW1lcnMgY29udGludWUgdG8gaG9sZCB2YWxpZCByZWZlcmVuY2VzLFxuXHQgKiBidXQgdGhlaXIgdmFsdWUgdHJhbnNpdGlvbnMgdG8gYW4gYEVycm9yYCB1bnRpbCB0aGV5J3JlIHJlY3JlYXRlZC5cblx0ICovXG5cdG1hcmtTdWJzY3JpcHRpb25zTWlzc2luZyhtaXNzaW5nOiByZWFkb25seSBVUklbXSk6IHZvaWQge1xuXHRcdGZvciAoY29uc3QgcmVzb3VyY2Ugb2YgbWlzc2luZykge1xuXHRcdFx0Y29uc3QgZW50cnkgPSB0aGlzLl9zdWJzY3JpcHRpb25zLmdldChyZXNvdXJjZSk7XG5cdFx0XHRpZiAoZW50cnkpIHtcblx0XHRcdFx0aWYgKGVudHJ5LnN1YiBpbnN0YW5jZW9mIFNlc3Npb25TdGF0ZVN1YnNjcmlwdGlvbiB8fCBlbnRyeS5zdWIgaW5zdGFuY2VvZiBDaGF0U3RhdGVTdWJzY3JpcHRpb24pIHtcblx0XHRcdFx0XHRlbnRyeS5zdWIuY2xlYXJQZW5kaW5nKCk7XG5cdFx0XHRcdH1cblx0XHRcdFx0ZW50cnkuc3ViLnNldEVycm9yKG5ldyBFcnJvcihgU3Vic2NyaXB0aW9uIG5vIGxvbmdlciBhdmFpbGFibGUgYWZ0ZXIgcmVjb25uZWN0OiAke3Jlc291cmNlLnRvU3RyaW5nKCl9YCkpO1xuXHRcdFx0fVxuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgX2NyZWF0ZVN1YnNjcmlwdGlvbihraW5kOiBTdGF0ZUNvbXBvbmVudHMsIGtleTogc3RyaW5nKTogTWFuYWdlZFN1YnNjcmlwdGlvbiB7XG5cdFx0c3dpdGNoIChraW5kKSB7XG5cdFx0XHRjYXNlIFN0YXRlQ29tcG9uZW50cy5TZXNzaW9uOlxuXHRcdFx0XHRyZXR1cm4gbmV3IFNlc3Npb25TdGF0ZVN1YnNjcmlwdGlvbihrZXksIHRoaXMuX2NsaWVudElkLCB0aGlzLl9zZXFBbGxvY2F0b3IsIHRoaXMuX2xvZyk7XG5cdFx0XHRjYXNlIFN0YXRlQ29tcG9uZW50cy5DaGF0OlxuXHRcdFx0XHRyZXR1cm4gbmV3IENoYXRTdGF0ZVN1YnNjcmlwdGlvbihrZXksIHRoaXMuX2NsaWVudElkLCB0aGlzLl9zZXFBbGxvY2F0b3IsIHRoaXMuX2xvZyk7XG5cdFx0XHRjYXNlIFN0YXRlQ29tcG9uZW50cy5UZXJtaW5hbDpcblx0XHRcdFx0cmV0dXJuIG5ldyBUZXJtaW5hbFN0YXRlU3Vic2NyaXB0aW9uKGtleSwgdGhpcy5fY2xpZW50SWQsIHRoaXMuX2xvZyk7XG5cdFx0XHRjYXNlIFN0YXRlQ29tcG9uZW50cy5DaGFuZ2VzZXQ6XG5cdFx0XHRcdHJldHVybiBuZXcgQ2hhbmdlc2V0U3RhdGVTdWJzY3JpcHRpb24oa2V5LCB0aGlzLl9jbGllbnRJZCwgdGhpcy5fc2VxQWxsb2NhdG9yLCB0aGlzLl9sb2cpO1xuXHRcdFx0Y2FzZSBTdGF0ZUNvbXBvbmVudHMuQW5ub3RhdGlvbnM6XG5cdFx0XHRcdHJldHVybiBuZXcgQW5ub3RhdGlvbnNTdGF0ZVN1YnNjcmlwdGlvbihrZXksIHRoaXMuX2NsaWVudElkLCB0aGlzLl9zZXFBbGxvY2F0b3IsIHRoaXMuX2xvZyk7XG5cdFx0XHRjYXNlIFN0YXRlQ29tcG9uZW50cy5Sb290OlxuXHRcdFx0XHR0aHJvdyBuZXcgRXJyb3IoJ19jcmVhdGVTdWJzY3JpcHRpb246IHJvb3Qgc3Vic2NyaXB0aW9uIGlzIG1hbmFnZWQgc2VwYXJhdGVseScpO1xuXHRcdFx0ZGVmYXVsdDpcblx0XHRcdFx0YXNzZXJ0TmV2ZXIoa2luZCwgYF9jcmVhdGVTdWJzY3JpcHRpb246IHVuc3VwcG9ydGVkIFN0YXRlQ29tcG9uZW50cyBraW5kOiAke2tpbmR9YCk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBfcmVsZWFzZVN1YnNjcmlwdGlvbihyZXNvdXJjZTogVVJJLCBleHBlY3RlZD86IE1hbmFnZWRTdWJzY3JpcHRpb25FbnRyeSk6IHZvaWQge1xuXHRcdGNvbnN0IGVudHJ5ID0gdGhpcy5fc3Vic2NyaXB0aW9ucy5nZXQocmVzb3VyY2UpO1xuXHRcdC8vIEEgZmFpbGVkIHN1YnNjcmlwdGlvbiBjYW4gYmUgZXZpY3RlZCBhbmQgcmVwbGFjZWQgd2hpbGUgb2xkIHJlZmVyZW5jZXNcblx0XHQvLyBzdGlsbCBleGlzdDsgc3RhbGUgZGlzcG9zYWxzIG11c3Qgbm90IHJlbGVhc2UgdGhlIHJlcGxhY2VtZW50IGVudHJ5LlxuXHRcdGlmICghZW50cnkgfHwgKGV4cGVjdGVkICYmIGVudHJ5ICE9PSBleHBlY3RlZCkpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0ZW50cnkucmVmQ291bnQtLTtcblx0XHRpZiAoZW50cnkucmVmQ291bnQgPD0gMCkge1xuXHRcdFx0dGhpcy5fc3Vic2NyaXB0aW9ucy5kZWxldGUocmVzb3VyY2UpO1xuXHRcdFx0dGhpcy5fZGlzcG9zZVN1YnNjcmlwdGlvbkVudHJ5KHJlc291cmNlLCBlbnRyeSk7XG5cdFx0fVxuXHR9XG5cblx0b3ZlcnJpZGUgZGlzcG9zZSgpOiB2b2lkIHtcblx0XHRmb3IgKGNvbnN0IFtyZXNvdXJjZSwgZW50cnldIG9mIHRoaXMuX3N1YnNjcmlwdGlvbnMpIHtcblx0XHRcdHRoaXMuX3RyeVVuc3Vic2NyaWJlKHJlc291cmNlKTtcblx0XHRcdGVudHJ5LnN1Yi5kaXNwb3NlKCk7XG5cdFx0fVxuXHRcdHRoaXMuX3N1YnNjcmlwdGlvbnMuY2xlYXIoKTtcblx0XHRzdXBlci5kaXNwb3NlKCk7XG5cdH1cbn1cblxuLyoqIFJldHVybnMgd2hldGhlciBhbiBhY3Rpb24gZW52ZWxvcGUgdGFyZ2V0cyBvbmUgb2YgdGhlIHN1YnNjcmliZWQgY2hhbm5lbCBVUklzLiAqL1xuZXhwb3J0IGZ1bmN0aW9uIGlzQWN0aW9uRW52ZWxvcGVSZWxldmFudFRvU3Vic2NyaXB0aW9uVXJpcyhlbnZlbG9wZTogQWN0aW9uRW52ZWxvcGUsIHN1YnNjcmliZWRVcmlzOiBJdGVyYWJsZTxzdHJpbmc+KTogYm9vbGVhbiB7XG5cdGlmIChpc0FocFJvb3RDaGFubmVsKGVudmVsb3BlLmNoYW5uZWwpKSB7XG5cdFx0Zm9yIChjb25zdCB1cmkgb2Ygc3Vic2NyaWJlZFVyaXMpIHtcblx0XHRcdGlmIChpc0FocFJvb3RDaGFubmVsKHVyaSkpIHtcblx0XHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdHJldHVybiBmYWxzZTtcblx0fVxuXHRmb3IgKGNvbnN0IHVyaSBvZiBzdWJzY3JpYmVkVXJpcykge1xuXHRcdGlmICh1cmkgPT09IGVudmVsb3BlLmNoYW5uZWwpIHtcblx0XHRcdHJldHVybiB0cnVlO1xuXHRcdH1cblx0fVxuXHRyZXR1cm4gZmFsc2U7XG59XG5cbi8vIC0tLSBPYnNlcnZhYmxlIEFkYXB0ZXIgLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG5cbi8qKlxuICogQWRhcHRzIGFuIHtAbGluayBJQWdlbnRTdWJzY3JpcHRpb259IGludG8gYW4ge0BsaW5rIElPYnNlcnZhYmxlfSBvZiB0aGVcbiAqIHN1YnNjcmlwdGlvbidzIHZhbHVlLiBFcnJvcnMgYW5kIHRoZSBwcmUtc25hcHNob3QgcGhhc2UgYXJlIHN1cmZhY2VkIGFzXG4gKiBgdW5kZWZpbmVkYDsgY29uc3VtZXJzIHRoYXQgbmVlZCB0aGUgZXJyb3IgaXRzZWxmIHNob3VsZCByZWFkXG4gKiB7QGxpbmsgSUFnZW50U3Vic2NyaXB0aW9uLnZhbHVlfSBkaXJlY3RseS5cbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIG9ic2VydmFibGVGcm9tU3Vic2NyaXB0aW9uPFQ+KG93bmVyOiBvYmplY3QgfCB1bmRlZmluZWQsIHN1YjogSUFnZW50U3Vic2NyaXB0aW9uPFQ+KTogSU9ic2VydmFibGU8VCB8IHVuZGVmaW5lZD4ge1xuXHRyZXR1cm4gb2JzZXJ2YWJsZUZyb21FdmVudChvd25lciwgc3ViLm9uRGlkQ2hhbmdlLCAoKSA9PiB7XG5cdFx0Y29uc3QgdiA9IHN1Yi52YWx1ZTtcblx0XHRyZXR1cm4gdiBpbnN0YW5jZW9mIEVycm9yID8gdW5kZWZpbmVkIDogdjtcblx0fSk7XG59XG4iXSwKICAibWFwcGluZ3MiOiAiQUFLQSxTQUFTLG1CQUFtQjtBQUM1QixTQUFTLGVBQXNCO0FBQy9CLFNBQVMsa0JBQThCO0FBQ3ZDLFNBQVMsbUJBQW1CO0FBQzVCLFNBQXNCLDJCQUEyQjtBQUNqRCxTQUFTLFdBQVc7QUFDcEIsU0FBeUIsWUFBa0ssbUJBQW1CLGNBQWMscUJBQXFCLHVCQUF1QjtBQUN4USxTQUFTLGtCQUFrQixhQUFhLG9CQUFvQixhQUFhLHNCQUFzQjtBQUMvRixTQUFTLHVCQUF1QjtBQUloQyxTQUFTLGtCQUFrQyx1QkFBdUI7QUFrRmxFLE1BQWUsOEJBQWlDLFdBQTRDO0FBQUEsRUFxQjNGLFlBQVksVUFBa0IsS0FBNEI7QUFDekQsVUFBTTtBQWhCUCxTQUFtQixlQUFlLEtBQUssVUFBVSxJQUFJLFFBQVcsQ0FBQztBQUNqRSxTQUFTLGNBQXdCLEtBQUssYUFBYTtBQUVuRCxTQUFtQixjQUFjLEtBQUssVUFBVSxJQUFJLFFBQWUsQ0FBQztBQUNwRSxTQUFTLGFBQTJCLEtBQUssWUFBWTtBQUVyRCxTQUFtQixxQkFBcUIsS0FBSyxVQUFVLElBQUksUUFBd0IsQ0FBQztBQUNwRixTQUFTLG9CQUEyQyxLQUFLLG1CQUFtQjtBQUU1RSxTQUFtQixvQkFBb0IsS0FBSyxVQUFVLElBQUksUUFBd0IsQ0FBQztBQUNuRixTQUFTLG1CQUEwQyxLQUFLLGtCQUFrQjtBQU96RSxTQUFLLFlBQVk7QUFDakIsU0FBSyxPQUFPO0FBQUEsRUFDYjtBQUFBLEVBRUEsSUFBSSxRQUErQjtBQUNsQyxRQUFJLEtBQUssUUFBUTtBQUNoQixhQUFPLEtBQUs7QUFBQSxJQUNiO0FBQ0EsV0FBTyxLQUFLLG9CQUFvQixLQUFLLEtBQUs7QUFBQSxFQUMzQztBQUFBLEVBRUEsSUFBSSxnQkFBK0I7QUFDbEMsV0FBTyxLQUFLO0FBQUEsRUFDYjtBQUFBO0FBQUE7QUFBQTtBQUFBLEVBS0EsZUFBZSxPQUFVLFNBQXVCO0FBQy9DLFNBQUssa0JBQWtCO0FBQ3ZCLFNBQUssU0FBUztBQUNkLFNBQUssbUJBQW1CLE9BQU87QUFDL0IsU0FBSyxhQUFhLEtBQUssS0FBSyxLQUFVO0FBQUEsRUFDdkM7QUFBQTtBQUFBO0FBQUE7QUFBQSxFQUtBLFNBQVMsT0FBb0I7QUFDNUIsU0FBSyxTQUFTO0FBQ2QsU0FBSyxZQUFZLEtBQUssS0FBSztBQUFBLEVBQzVCO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQSxFQU1BLGdCQUFnQixVQUFnQztBQUMvQyxRQUFJLENBQUMsS0FBSyxvQkFBb0IsUUFBUSxHQUFHO0FBQ3hDO0FBQUEsSUFDRDtBQUlBLFFBQUksS0FBSyxvQkFBb0IsUUFBVztBQUN2QyxVQUFJLENBQUMsS0FBSyxvQkFBb0I7QUFDN0IsYUFBSyxxQkFBcUIsQ0FBQztBQUFBLE1BQzVCO0FBQ0EsV0FBSyxtQkFBbUIsS0FBSyxRQUFRO0FBQ3JDO0FBQUEsSUFDRDtBQUVBLFVBQU0sY0FBYyxTQUFTLFFBQVEsYUFBYSxLQUFLO0FBQ3ZELFNBQUssbUJBQW1CLEtBQUssUUFBUTtBQUVyQyxTQUFLLFdBQVcsVUFBVSxXQUFXO0FBRXJDLFNBQUssa0JBQWtCLEtBQUssUUFBUTtBQUFBLEVBQ3JDO0FBQUE7QUFBQSxFQVNVLHNCQUFxQztBQUM5QyxXQUFPO0FBQUEsRUFDUjtBQUFBO0FBQUEsRUFHVSxtQkFBbUIsVUFBd0I7QUFFcEQsVUFBTSxXQUFXLEtBQUs7QUFDdEIsUUFBSSxVQUFVO0FBQ2IsV0FBSyxxQkFBcUI7QUFDMUIsaUJBQVcsWUFBWSxVQUFVO0FBRWhDLFlBQUksU0FBUyxZQUFZLFVBQVU7QUFDbEMsZ0JBQU0sY0FBYyxTQUFTLFFBQVEsYUFBYSxLQUFLO0FBQ3ZELGVBQUssV0FBVyxVQUFVLFdBQVc7QUFBQSxRQUN0QztBQUFBLE1BQ0Q7QUFBQSxJQUNEO0FBQUEsRUFDRDtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUEsRUFNVSxXQUFXLFVBQTBCLGNBQTZCO0FBQzNFLFNBQUssa0JBQWtCLEtBQUssY0FBYyxLQUFLLGlCQUFrQixTQUFTLE1BQU07QUFDaEYsU0FBSyxhQUFhLEtBQUssS0FBSyxLQUFVO0FBQUEsRUFDdkM7QUFDRDtBQVFPLE1BQU0sOEJBQThCLHNCQUFpQztBQUFBLEVBRXhELGNBQWMsT0FBa0IsUUFBZ0M7QUFDbEYsV0FBTyxZQUFZLE9BQU8sUUFBc0IsS0FBSyxJQUFJO0FBQUEsRUFDMUQ7QUFBQSxFQUVtQixvQkFBb0IsVUFBbUM7QUFDekUsV0FBTyxpQkFBaUIsU0FBUyxPQUFPLEtBQUssU0FBUyxPQUFPLEtBQUssV0FBVyxPQUFPO0FBQUEsRUFDckY7QUFDRDtBQTJCTyxNQUFNLGlDQUFpQyxzQkFBb0M7QUFBQSxFQU9qRixZQUNDLFlBQ0EsVUFDQSxjQUNBLEtBQ0M7QUFDRCxVQUFNLFVBQVUsR0FBRztBQVhwQixTQUFpQixrQkFBb0MsQ0FBQztBQVlyRCxTQUFLLGNBQWM7QUFDbkIsU0FBSyxnQkFBZ0I7QUFBQSxFQUN0QjtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUEsRUFNQSxnQkFBZ0IsUUFBK0I7QUFDOUMsVUFBTSxZQUFZLEtBQUssY0FBYztBQUNyQyxTQUFLLGdCQUFnQixLQUFLLEVBQUUsV0FBVyxPQUFPLENBQUM7QUFFL0MsVUFBTSxPQUFPLEtBQUssb0JBQW9CLEtBQUs7QUFDM0MsUUFBSSxNQUFNO0FBQ1QsV0FBSyxtQkFBbUIsZUFBZSxNQUFNLFFBQWtDLEtBQUssSUFBSTtBQUN4RixXQUFLLGFBQWEsS0FBSyxLQUFLLGdCQUFnQjtBQUFBLElBQzdDO0FBQ0EsV0FBTztBQUFBLEVBQ1I7QUFBQSxFQUVtQixzQkFBZ0Q7QUFDbEUsV0FBTyxLQUFLO0FBQUEsRUFDYjtBQUFBLEVBRW1CLGNBQWMsT0FBcUIsUUFBbUM7QUFDeEYsV0FBTyxlQUFlLE9BQU8sUUFBa0MsS0FBSyxJQUFJO0FBQUEsRUFDekU7QUFBQSxFQUVtQixvQkFBb0IsVUFBbUM7QUFDekUsV0FBTyxnQkFBZ0IsU0FBUyxNQUFNLEtBQUssU0FBUyxZQUFZLEtBQUs7QUFBQSxFQUN0RTtBQUFBLEVBRW1CLG1CQUFtQixTQUF1QjtBQUU1RCxVQUFNLG1CQUFtQixPQUFPO0FBRWhDLFNBQUsscUJBQXFCO0FBQUEsRUFDM0I7QUFBQSxFQUVtQixXQUFXLFVBQTBCLGFBQTRCO0FBS25GLFFBQUksZUFBZSxTQUFTLFFBQVE7QUFDbkMsWUFBTSxNQUFNLEtBQUssZ0JBQWdCLFVBQVUsT0FBSyxFQUFFLGNBQWMsU0FBUyxPQUFRLFNBQVM7QUFDMUYsVUFBSSxRQUFRLElBQUk7QUFDZixZQUFJLENBQUMsU0FBUyxpQkFBaUI7QUFDOUIsZUFBSyxnQkFBZ0IsU0FBUyxNQUFNO0FBQUEsUUFDckM7QUFDQSxhQUFLLGdCQUFnQixPQUFPLEtBQUssQ0FBQztBQUFBLE1BQ25DLFdBQVcsQ0FBQyxTQUFTLGlCQUFpQjtBQUNyQyxhQUFLLGdCQUFnQixTQUFTLE1BQU07QUFBQSxNQUNyQztBQUFBLElBQ0QsV0FBVyxDQUFDLFNBQVMsaUJBQWlCO0FBQ3JDLFdBQUssZ0JBQWdCLFNBQVMsTUFBTTtBQUFBLElBQ3JDO0FBQ0EsU0FBSyxxQkFBcUI7QUFBQSxFQUMzQjtBQUFBLEVBRVEsZ0JBQWdCLFFBQTJCO0FBQ2xELFFBQUksS0FBSyxpQkFBaUI7QUFDekIsV0FBSyxrQkFBa0IsS0FBSyxjQUFjLEtBQUssaUJBQWlCLE1BQU07QUFBQSxJQUN2RTtBQUFBLEVBQ0Q7QUFBQSxFQUVRLHVCQUE2QjtBQUNwQyxVQUFNLFlBQVksS0FBSztBQUN2QixRQUFJLENBQUMsV0FBVztBQUNmLFdBQUssbUJBQW1CO0FBQ3hCO0FBQUEsSUFDRDtBQUVBLFFBQUksS0FBSyxnQkFBZ0IsV0FBVyxHQUFHO0FBQ3RDLFdBQUssbUJBQW1CO0FBQ3hCLFdBQUssYUFBYSxLQUFLLFNBQVM7QUFDaEM7QUFBQSxJQUNEO0FBRUEsUUFBSSxRQUFRO0FBQ1osZUFBVyxXQUFXLEtBQUssaUJBQWlCO0FBQzNDLGNBQVEsZUFBZSxPQUFPLFFBQVEsUUFBa0MsS0FBSyxJQUFJO0FBQUEsSUFDbEY7QUFDQSxTQUFLLG1CQUFtQjtBQUN4QixTQUFLLGFBQWEsS0FBSyxLQUFLO0FBQUEsRUFDN0I7QUFBQTtBQUFBO0FBQUE7QUFBQSxFQUtBLGVBQXFCO0FBQ3BCLFNBQUssZ0JBQWdCLFNBQVM7QUFDOUIsU0FBSyxtQkFBbUI7QUFBQSxFQUN6QjtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUEsRUFTQSxvQkFBOEM7QUFDN0MsV0FBTyxLQUFLLGdCQUFnQixJQUFJLFFBQU0sRUFBRSxXQUFXLEVBQUUsV0FBVyxRQUFRLEVBQUUsUUFBUSxTQUFTLEtBQUssWUFBWSxFQUFFO0FBQUEsRUFDL0c7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUEsRUFPQSx1QkFBdUIsV0FBNEI7QUFDbEQsVUFBTSxNQUFNLEtBQUssZ0JBQWdCLFVBQVUsT0FBSyxFQUFFLGNBQWMsU0FBUztBQUN6RSxRQUFJLFFBQVEsSUFBSTtBQUNmLGFBQU87QUFBQSxJQUNSO0FBQ0EsU0FBSyxnQkFBZ0IsT0FBTyxLQUFLLENBQUM7QUFDbEMsV0FBTztBQUFBLEVBQ1I7QUFDRDtBQWdCTyxNQUFNLDhCQUE4QixzQkFBaUM7QUFBQSxFQU8zRSxZQUNDLFNBQ0EsVUFDQSxjQUNBLEtBQ0M7QUFDRCxVQUFNLFVBQVUsR0FBRztBQVhwQixTQUFpQixrQkFBd0MsQ0FBQztBQVl6RCxTQUFLLFdBQVc7QUFDaEIsU0FBSyxnQkFBZ0I7QUFBQSxFQUN0QjtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUEsRUFNQSxnQkFBZ0IsUUFBNEI7QUFDM0MsVUFBTSxZQUFZLEtBQUssY0FBYztBQUNyQyxTQUFLLGdCQUFnQixLQUFLLEVBQUUsV0FBVyxPQUFPLENBQUM7QUFDL0MsVUFBTSxPQUFPLEtBQUssb0JBQW9CLEtBQUs7QUFDM0MsUUFBSSxNQUFNO0FBQ1QsV0FBSyxtQkFBbUIsWUFBWSxNQUFNLFFBQStCLEtBQUssSUFBSTtBQUNsRixXQUFLLGFBQWEsS0FBSyxLQUFLLGdCQUFnQjtBQUFBLElBQzdDO0FBQ0EsV0FBTztBQUFBLEVBQ1I7QUFBQSxFQUVtQixzQkFBNkM7QUFDL0QsV0FBTyxLQUFLO0FBQUEsRUFDYjtBQUFBLEVBRW1CLGNBQWMsT0FBa0IsUUFBZ0M7QUFDbEYsV0FBTyxZQUFZLE9BQU8sUUFBK0IsS0FBSyxJQUFJO0FBQUEsRUFDbkU7QUFBQSxFQUVtQixvQkFBb0IsVUFBbUM7QUFDekUsV0FBTyxhQUFhLFNBQVMsTUFBTSxLQUFLLFNBQVMsWUFBWSxLQUFLO0FBQUEsRUFDbkU7QUFBQSxFQUVtQixtQkFBbUIsU0FBdUI7QUFDNUQsVUFBTSxtQkFBbUIsT0FBTztBQUNoQyxTQUFLLHFCQUFxQjtBQUFBLEVBQzNCO0FBQUEsRUFFbUIsV0FBVyxVQUEwQixhQUE0QjtBQUtuRixRQUFJLGVBQWUsU0FBUyxRQUFRO0FBQ25DLFlBQU0sTUFBTSxLQUFLLGdCQUFnQixVQUFVLE9BQUssRUFBRSxjQUFjLFNBQVMsT0FBUSxTQUFTO0FBQzFGLFVBQUksUUFBUSxJQUFJO0FBQ2YsWUFBSSxDQUFDLFNBQVMsaUJBQWlCO0FBQzlCLGVBQUssZ0JBQWdCLFNBQVMsTUFBTTtBQUFBLFFBQ3JDO0FBQ0EsYUFBSyxnQkFBZ0IsT0FBTyxLQUFLLENBQUM7QUFBQSxNQUNuQyxXQUFXLENBQUMsU0FBUyxpQkFBaUI7QUFDckMsYUFBSyxnQkFBZ0IsU0FBUyxNQUFNO0FBQUEsTUFDckM7QUFBQSxJQUNELFdBQVcsQ0FBQyxTQUFTLGlCQUFpQjtBQUNyQyxXQUFLLG1DQUFtQyxTQUFTLE1BQU07QUFDdkQsV0FBSyxnQkFBZ0IsU0FBUyxNQUFNO0FBQUEsSUFDckM7QUFDQSxTQUFLLHFCQUFxQjtBQUFBLEVBQzNCO0FBQUEsRUFFUSxtQ0FBbUMsUUFBMkI7QUFJckUsUUFBSSxDQUFDLGFBQWEsTUFBTSxHQUFHO0FBQzFCO0FBQUEsSUFDRDtBQUNBLFFBQUksT0FBTyxTQUFTLFdBQVcsb0JBQW9CLE9BQU8sU0FBUyxXQUFXLHFCQUFxQixPQUFPLFNBQVMsV0FBVyxXQUFXO0FBQ3hJO0FBQUEsSUFDRDtBQUNBLFVBQU0sUUFBUSxLQUFLLGdCQUFnQixVQUFVLE9BQUssRUFBRSxPQUFPLFNBQVMsV0FBVyxtQkFBbUIsRUFBRSxPQUFPLFdBQVcsT0FBTyxNQUFNO0FBQ25JLFFBQUksVUFBVSxJQUFJO0FBQ2pCO0FBQUEsSUFDRDtBQUNBLFVBQU0sQ0FBQyxFQUFFLFFBQVEsY0FBYyxDQUFDLElBQUksS0FBSyxnQkFBZ0IsT0FBTyxPQUFPLENBQUM7QUFDeEUsUUFBSSxLQUFLLG9CQUFvQixDQUFDLEtBQUssZ0JBQWdCLGNBQWMsS0FBSyxnQkFBZ0IsV0FBVyxPQUFPLE9BQU8sU0FBUztBQUN2SCxXQUFLLGtCQUFrQixLQUFLLGNBQWMsS0FBSyxpQkFBaUIsYUFBYTtBQUFBLElBQzlFO0FBQUEsRUFDRDtBQUFBLEVBRVEsZ0JBQWdCLFFBQTJCO0FBQ2xELFFBQUksS0FBSyxpQkFBaUI7QUFDekIsV0FBSyxrQkFBa0IsS0FBSyxjQUFjLEtBQUssaUJBQWlCLE1BQU07QUFBQSxJQUN2RTtBQUFBLEVBQ0Q7QUFBQSxFQUVRLHVCQUE2QjtBQUNwQyxVQUFNLFlBQVksS0FBSztBQUN2QixRQUFJLENBQUMsV0FBVztBQUNmLFdBQUssbUJBQW1CO0FBQ3hCO0FBQUEsSUFDRDtBQUNBLFFBQUksS0FBSyxnQkFBZ0IsV0FBVyxHQUFHO0FBQ3RDLFdBQUssbUJBQW1CO0FBQ3hCLFdBQUssYUFBYSxLQUFLLFNBQVM7QUFDaEM7QUFBQSxJQUNEO0FBQ0EsUUFBSSxRQUFRO0FBQ1osZUFBVyxXQUFXLEtBQUssaUJBQWlCO0FBQzNDLGNBQVEsWUFBWSxPQUFPLFFBQVEsUUFBK0IsS0FBSyxJQUFJO0FBQUEsSUFDNUU7QUFDQSxTQUFLLG1CQUFtQjtBQUN4QixTQUFLLGFBQWEsS0FBSyxLQUFLO0FBQUEsRUFDN0I7QUFBQSxFQUVBLGVBQXFCO0FBQ3BCLFNBQUssZ0JBQWdCLFNBQVM7QUFDOUIsU0FBSyxtQkFBbUI7QUFBQSxFQUN6QjtBQUFBLEVBRUEsb0JBQThDO0FBQzdDLFdBQU8sS0FBSyxnQkFBZ0IsSUFBSSxRQUFNLEVBQUUsV0FBVyxFQUFFLFdBQVcsUUFBUSxFQUFFLFFBQVEsU0FBUyxLQUFLLFNBQVMsRUFBRTtBQUFBLEVBQzVHO0FBQUEsRUFFQSx1QkFBdUIsV0FBNEI7QUFDbEQsVUFBTSxNQUFNLEtBQUssZ0JBQWdCLFVBQVUsT0FBSyxFQUFFLGNBQWMsU0FBUztBQUN6RSxRQUFJLFFBQVEsSUFBSTtBQUNmLGFBQU87QUFBQSxJQUNSO0FBQ0EsU0FBSyxnQkFBZ0IsT0FBTyxLQUFLLENBQUM7QUFDbEMsV0FBTztBQUFBLEVBQ1I7QUFDRDtBQVFPLE1BQU0sa0NBQWtDLHNCQUFxQztBQUFBLEVBSW5GLFlBQVksYUFBcUIsVUFBa0IsS0FBNEI7QUFDOUUsVUFBTSxVQUFVLEdBQUc7QUFDbkIsU0FBSyxlQUFlO0FBQUEsRUFDckI7QUFBQSxFQUVtQixjQUFjLE9BQXNCLFFBQW9DO0FBQzFGLFdBQU8sZ0JBQWdCLE9BQU8sUUFBMEIsS0FBSyxJQUFJO0FBQUEsRUFDbEU7QUFBQSxFQUVtQixvQkFBb0IsVUFBbUM7QUFDekUsV0FBTyxTQUFTLE9BQU8sS0FBSyxXQUFXLFdBQVcsS0FBSyxTQUFTLFlBQVksS0FBSztBQUFBLEVBQ2xGO0FBQ0Q7QUFXTyxNQUFNLG1DQUFtQyxzQkFBc0M7QUFBQSxFQU9yRixZQUFZLGNBQXNCLFVBQWtCLGNBQTRCLEtBQTRCO0FBQzNHLFVBQU0sVUFBVSxHQUFHO0FBTnBCLFNBQWlCLGtCQUE0RixDQUFDO0FBTzdHLFNBQUssZ0JBQWdCO0FBQ3JCLFNBQUssZ0JBQWdCO0FBQUEsRUFDdEI7QUFBQTtBQUFBO0FBQUE7QUFBQSxFQUtBLGdCQUFnQixRQUF1QztBQUN0RCxVQUFNLFlBQVksS0FBSyxjQUFjO0FBQ3JDLFNBQUssZ0JBQWdCLEtBQUssRUFBRSxXQUFXLE9BQU8sQ0FBQztBQUMvQyxVQUFNLE9BQU8sS0FBSyxvQkFBb0IsS0FBSztBQUMzQyxRQUFJLE1BQU07QUFDVCxXQUFLLG1CQUFtQixpQkFBaUIsTUFBTSxRQUFRLEtBQUssSUFBSTtBQUNoRSxXQUFLLGFBQWEsS0FBSyxLQUFLLGdCQUFnQjtBQUFBLElBQzdDO0FBQ0EsV0FBTztBQUFBLEVBQ1I7QUFBQSxFQUVtQixzQkFBa0Q7QUFDcEUsV0FBTyxLQUFLO0FBQUEsRUFDYjtBQUFBLEVBRW1CLGNBQWMsT0FBdUIsUUFBcUM7QUFDNUYsV0FBTyxpQkFBaUIsT0FBTyxRQUEyQixLQUFLLElBQUk7QUFBQSxFQUNwRTtBQUFBLEVBRW1CLG9CQUFvQixVQUFtQztBQUN6RSxXQUFPLGtCQUFrQixTQUFTLE1BQU0sS0FBSyxTQUFTLFlBQVksS0FBSztBQUFBLEVBQ3hFO0FBQUEsRUFFbUIsbUJBQW1CLFNBQXVCO0FBQzVELFVBQU0sbUJBQW1CLE9BQU87QUFDaEMsU0FBSyxxQkFBcUI7QUFBQSxFQUMzQjtBQUFBLEVBRW1CLFdBQVcsVUFBMEIsYUFBNEI7QUFDbkYsUUFBSSxlQUFlLFNBQVMsUUFBUTtBQUNuQyxZQUFNLFFBQVEsS0FBSyxnQkFBZ0IsVUFBVSxhQUFXLFFBQVEsY0FBYyxTQUFTLE9BQVEsU0FBUztBQUN4RyxVQUFJLFVBQVUsSUFBSTtBQUNqQixZQUFJLENBQUMsU0FBUyxpQkFBaUI7QUFDOUIsZUFBSyxnQkFBZ0IsU0FBUyxNQUFNO0FBQUEsUUFDckM7QUFDQSxhQUFLLGdCQUFnQixPQUFPLE9BQU8sQ0FBQztBQUFBLE1BQ3JDLE9BQU87QUFDTixhQUFLLGdCQUFnQixTQUFTLE1BQU07QUFBQSxNQUNyQztBQUFBLElBQ0QsT0FBTztBQUNOLFdBQUssZ0JBQWdCLFNBQVMsTUFBTTtBQUFBLElBQ3JDO0FBQ0EsU0FBSyxxQkFBcUI7QUFBQSxFQUMzQjtBQUFBLEVBRVEsZ0JBQWdCLFFBQTJCO0FBQ2xELFFBQUksS0FBSyxpQkFBaUI7QUFDekIsV0FBSyxrQkFBa0IsS0FBSyxjQUFjLEtBQUssaUJBQWlCLE1BQU07QUFBQSxJQUN2RTtBQUFBLEVBQ0Q7QUFBQSxFQUVRLHVCQUE2QjtBQUNwQyxVQUFNLFlBQVksS0FBSztBQUN2QixRQUFJLENBQUMsV0FBVztBQUNmLFdBQUssbUJBQW1CO0FBQ3hCO0FBQUEsSUFDRDtBQUVBLFFBQUksS0FBSyxnQkFBZ0IsV0FBVyxHQUFHO0FBQ3RDLFdBQUssbUJBQW1CO0FBQ3hCLFdBQUssYUFBYSxLQUFLLFNBQVM7QUFDaEM7QUFBQSxJQUNEO0FBRUEsUUFBSSxRQUFRO0FBQ1osZUFBVyxXQUFXLEtBQUssaUJBQWlCO0FBQzNDLGNBQVEsaUJBQWlCLE9BQU8sUUFBUSxRQUFRLEtBQUssSUFBSTtBQUFBLElBQzFEO0FBQ0EsU0FBSyxtQkFBbUI7QUFDeEIsU0FBSyxhQUFhLEtBQUssS0FBSztBQUFBLEVBQzdCO0FBQ0Q7QUF1Qk8sTUFBTSxxQ0FBcUMsc0JBQXdDO0FBQUEsRUFPekYsWUFBWSxnQkFBd0IsVUFBa0IsY0FBNEIsS0FBNEI7QUFDN0csVUFBTSxVQUFVLEdBQUc7QUFOcEIsU0FBaUIsa0JBQStDLENBQUM7QUFPaEUsU0FBSyxrQkFBa0I7QUFDdkIsU0FBSyxnQkFBZ0I7QUFBQSxFQUN0QjtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUEsRUFNQSxnQkFBZ0IsUUFBbUM7QUFDbEQsVUFBTSxZQUFZLEtBQUssY0FBYztBQUNyQyxTQUFLLGdCQUFnQixLQUFLLEVBQUUsV0FBVyxPQUFPLENBQUM7QUFDL0MsVUFBTSxPQUFPLEtBQUssb0JBQW9CLEtBQUs7QUFDM0MsUUFBSSxNQUFNO0FBQ1QsV0FBSyxtQkFBbUIsbUJBQW1CLE1BQU0sUUFBUSxLQUFLLElBQUk7QUFDbEUsV0FBSyxhQUFhLEtBQUssS0FBSyxnQkFBZ0I7QUFBQSxJQUM3QztBQUNBLFdBQU87QUFBQSxFQUNSO0FBQUEsRUFFbUIsc0JBQW9EO0FBQ3RFLFdBQU8sS0FBSztBQUFBLEVBQ2I7QUFBQSxFQUVtQixjQUFjLE9BQXlCLFFBQXVDO0FBQ2hHLFdBQU8sbUJBQW1CLE9BQU8sUUFBNkIsS0FBSyxJQUFJO0FBQUEsRUFDeEU7QUFBQSxFQUVtQixvQkFBb0IsVUFBbUM7QUFDekUsV0FBTyxvQkFBb0IsU0FBUyxNQUFNLEtBQUssU0FBUyxZQUFZLEtBQUs7QUFBQSxFQUMxRTtBQUFBLEVBRW1CLG1CQUFtQixTQUF1QjtBQUM1RCxVQUFNLG1CQUFtQixPQUFPO0FBQ2hDLFNBQUsscUJBQXFCO0FBQUEsRUFDM0I7QUFBQSxFQUVtQixXQUFXLFVBQTBCLGFBQTRCO0FBQ25GLFFBQUksZUFBZSxTQUFTLFFBQVE7QUFDbkMsWUFBTSxNQUFNLEtBQUssZ0JBQWdCLFVBQVUsT0FBSyxFQUFFLGNBQWMsU0FBUyxPQUFRLFNBQVM7QUFDMUYsVUFBSSxRQUFRLElBQUk7QUFDZixZQUFJLENBQUMsU0FBUyxpQkFBaUI7QUFDOUIsZUFBSyxnQkFBZ0IsU0FBUyxNQUFNO0FBQUEsUUFDckM7QUFDQSxhQUFLLGdCQUFnQixPQUFPLEtBQUssQ0FBQztBQUFBLE1BQ25DLE9BQU87QUFDTixhQUFLLGdCQUFnQixTQUFTLE1BQU07QUFBQSxNQUNyQztBQUFBLElBQ0QsT0FBTztBQUNOLFdBQUssZ0JBQWdCLFNBQVMsTUFBTTtBQUFBLElBQ3JDO0FBQ0EsU0FBSyxxQkFBcUI7QUFBQSxFQUMzQjtBQUFBLEVBRVEsZ0JBQWdCLFFBQTJCO0FBQ2xELFFBQUksS0FBSyxpQkFBaUI7QUFDekIsV0FBSyxrQkFBa0IsS0FBSyxjQUFjLEtBQUssaUJBQWlCLE1BQU07QUFBQSxJQUN2RTtBQUFBLEVBQ0Q7QUFBQSxFQUVRLHVCQUE2QjtBQUNwQyxVQUFNLFlBQVksS0FBSztBQUN2QixRQUFJLENBQUMsV0FBVztBQUNmLFdBQUssbUJBQW1CO0FBQ3hCO0FBQUEsSUFDRDtBQUVBLFFBQUksS0FBSyxnQkFBZ0IsV0FBVyxHQUFHO0FBQ3RDLFdBQUssbUJBQW1CO0FBQ3hCLFdBQUssYUFBYSxLQUFLLFNBQVM7QUFDaEM7QUFBQSxJQUNEO0FBRUEsUUFBSSxRQUFRO0FBQ1osZUFBVyxXQUFXLEtBQUssaUJBQWlCO0FBQzNDLGNBQVEsbUJBQW1CLE9BQU8sUUFBUSxRQUFRLEtBQUssSUFBSTtBQUFBLElBQzVEO0FBQ0EsU0FBSyxtQkFBbUI7QUFDeEIsU0FBSyxhQUFhLEtBQUssS0FBSztBQUFBLEVBQzdCO0FBQ0Q7QUFpQk8sTUFBTSxpQ0FBaUMsV0FBVztBQUFBLEVBWXhELFlBQ0MsVUFDQSxjQUNBLEtBQ0EsV0FDQSxhQUNDO0FBQ0QsVUFBTTtBQWpCUCxTQUFpQixpQkFBaUIsSUFBSSxZQUFzQztBQUM1RSxTQUFpQixtQkFBbUIsSUFBSSxZQUE4QjtBQUN0RSxTQUFRLHFCQUFxQjtBQWdCNUIsU0FBSyxZQUFZO0FBQ2pCLFNBQUssZ0JBQWdCO0FBQ3JCLFNBQUssT0FBTztBQUNaLFNBQUssYUFBYTtBQUNsQixTQUFLLGVBQWU7QUFDcEIsU0FBSyxhQUFhLEtBQUssVUFBVSxJQUFJLHNCQUFzQixVQUFVLEdBQUcsQ0FBQztBQUFBLEVBQzFFO0FBQUE7QUFBQSxFQUdBLElBQUksWUFBMkM7QUFDOUMsV0FBTyxLQUFLO0FBQUEsRUFDYjtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUEsRUFNQSxtQkFBbUIsT0FBa0IsU0FBdUI7QUFDM0QsU0FBSyxXQUFXLGVBQWUsT0FBTyxPQUFPO0FBQUEsRUFDOUM7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBLEVBTUEseUJBQTRCLFVBQWtEO0FBQzdFLFVBQU0sUUFBUSxLQUFLLGVBQWUsSUFBSSxRQUFRO0FBQzlDLFdBQU8sT0FBTztBQUFBLEVBQ2Y7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUEsRUFPQSx5QkFBeUIsVUFBNkM7QUFDckUsV0FBTyxLQUFLLGlCQUFpQixJQUFJLFFBQVE7QUFBQSxFQUMxQztBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQSxFQU9BLG1CQUFtQixVQUFlLFNBQWlDO0FBQ2xFLFNBQUssaUJBQWlCLElBQUksVUFBVSxPQUFPO0FBTTNDLFNBQUssUUFBUSxRQUFRLE1BQU07QUFDMUIsVUFBSSxLQUFLLGlCQUFpQixJQUFJLFFBQVEsTUFBTSxTQUFTO0FBQ3BELGFBQUssaUJBQWlCLE9BQU8sUUFBUTtBQUFBLE1BQ3RDO0FBQUEsSUFDRCxDQUFDLEVBQUUsTUFBTSxNQUFNO0FBQUEsSUFBRSxDQUFDO0FBQUEsRUFDbkI7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBLEVBWUEsZ0JBQW1CLE1BQXVCLFVBQWUsT0FBa0Q7QUFDMUcsVUFBTSxXQUFXLEtBQUssZUFBZSxJQUFJLFFBQVE7QUFDakQsUUFBSSxVQUFVO0FBQ2IsVUFBSSxTQUFTLElBQUksaUJBQWlCLE9BQU87QUFHeEMsYUFBSyxlQUFlLE9BQU8sUUFBUTtBQUNuQyxhQUFLLDBCQUEwQixVQUFVLFFBQVE7QUFBQSxNQUNsRCxPQUFPO0FBQ04saUJBQVM7QUFDVCxlQUFPLEtBQUssa0JBQXFCLFVBQVUsVUFBVSxLQUFLO0FBQUEsTUFDM0Q7QUFBQSxJQUNEO0FBR0EsVUFBTSxNQUFNLFNBQVMsU0FBUztBQUM5QixVQUFNLE1BQU0sS0FBSyxvQkFBb0IsTUFBTSxHQUFHO0FBQzlDLFVBQU0sUUFBa0MsRUFBRSxLQUFLLE1BQU0sVUFBVSxHQUFHLFNBQVMsb0JBQUksSUFBSSxFQUFFO0FBQ3JGLFNBQUssZUFBZSxJQUFJLFVBQVUsS0FBSztBQUt2QyxVQUFNLFlBQVk7QUFDakIsWUFBTSxXQUFXLEtBQUssaUJBQWlCLElBQUksUUFBUTtBQUNuRCxVQUFJLFVBQVU7QUFDYixZQUFJO0FBQ0gsZ0JBQU07QUFBQSxRQUNQLFFBQVE7QUFBQSxRQUlSO0FBQUEsTUFDRDtBQUNBLFVBQUk7QUFDSCxjQUFNLFdBQVcsTUFBTSxLQUFLLFdBQVcsUUFBUTtBQUMvQyxZQUFJLEtBQUssZUFBZSxJQUFJLFFBQVEsTUFBTSxPQUFPO0FBQ2hELGNBQUksZUFBZSxTQUFTLE9BQWdCLFNBQVMsT0FBTztBQUFBLFFBQzdEO0FBQUEsTUFDRCxTQUFTLEtBQUs7QUFDYixZQUFJLEtBQUssZUFBZSxJQUFJLFFBQVEsTUFBTSxPQUFPO0FBQ2hELGNBQUksU0FBUyxlQUFlLFFBQVEsTUFBTSxJQUFJLE1BQU0sT0FBTyxHQUFHLENBQUMsQ0FBQztBQUFBLFFBQ2pFO0FBQUEsTUFDRDtBQUFBLElBQ0QsR0FBRztBQUVILFdBQU8sS0FBSyxrQkFBcUIsVUFBVSxPQUFPLEtBQUs7QUFBQSxFQUN4RDtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBLEVBUVEsa0JBQXFCLFVBQWUsT0FBaUMsT0FBa0Q7QUFDOUgsVUFBTSxVQUFVLEVBQUUsS0FBSztBQUN2QixVQUFNLFFBQVEsSUFBSSxTQUFTLEtBQUs7QUFFaEMsUUFBSSxhQUFhO0FBQ2pCLFdBQU87QUFBQSxNQUNOLFFBQVEsTUFBTTtBQUFBLE1BQ2QsU0FBUyxNQUFNO0FBQ2QsWUFBSSxZQUFZO0FBQ2Y7QUFBQSxRQUNEO0FBQ0EscUJBQWE7QUFDYixjQUFNLFFBQVEsT0FBTyxPQUFPO0FBQzVCLGFBQUsscUJBQXFCLFVBQVUsS0FBSztBQUFBLE1BQzFDO0FBQUEsSUFDRDtBQUFBLEVBQ0Q7QUFBQSxFQUVRLDBCQUEwQixVQUFlLE9BQXVDO0FBQ3ZGLFNBQUssZ0JBQWdCLFFBQVE7QUFDN0IsUUFBSSxNQUFNLGVBQWUsNEJBQTRCLE1BQU0sZUFBZSx1QkFBdUI7QUFDaEcsWUFBTSxJQUFJLGFBQWE7QUFBQSxJQUN4QjtBQUNBLFVBQU0sSUFBSSxRQUFRO0FBQUEsRUFDbkI7QUFBQSxFQUVRLGdCQUFnQixVQUFxQjtBQUM1QyxRQUFJO0FBQ0gsV0FBSyxhQUFhLFFBQVE7QUFBQSxJQUMzQixTQUFTLE9BQU87QUFDZixZQUFNLFVBQVUsaUJBQWlCLFFBQVEsTUFBTSxVQUFVLE9BQU8sS0FBSztBQUNyRSxXQUFLLEtBQUsseUJBQXlCLFNBQVMsU0FBUyxDQUFDLEtBQUssT0FBTyxFQUFFO0FBQUEsSUFDckU7QUFBQSxFQUNEO0FBQUE7QUFBQTtBQUFBO0FBQUEsRUFLQSxnQkFBZ0IsVUFBZ0M7QUFFL0MsU0FBSyxXQUFXLGdCQUFnQixRQUFRO0FBRXhDLGVBQVcsRUFBRSxJQUFJLEtBQUssS0FBSyxlQUFlLE9BQU8sR0FBRztBQUNuRCxVQUFJLGdCQUFnQixRQUFRO0FBQUEsSUFDN0I7QUFBQSxFQUNEO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQSxFQVNBLG1CQUFtQixTQUFpQixRQUEwSTtBQUM3SyxRQUFJLGdCQUFnQixNQUFNLEdBQUc7QUFDNUIsWUFBTSxRQUFRLEtBQUssZUFBZSxJQUFJLElBQUksTUFBTSxPQUFPLENBQUM7QUFDeEQsVUFBSSxPQUFPLGVBQWUsMEJBQTBCO0FBQ25ELGVBQU8sTUFBTSxJQUFJLGdCQUFnQixNQUFNO0FBQUEsTUFDeEM7QUFBQSxJQUNELFdBQVcsYUFBYSxNQUFNLEdBQUc7QUFDaEMsWUFBTSxRQUFRLEtBQUssZUFBZSxJQUFJLElBQUksTUFBTSxPQUFPLENBQUM7QUFDeEQsVUFBSSxPQUFPLGVBQWUsdUJBQXVCO0FBQ2hELGVBQU8sTUFBTSxJQUFJLGdCQUFnQixNQUFNO0FBQUEsTUFDeEM7QUFBQSxJQUNELFdBQVcsa0JBQWtCLE1BQU0sR0FBRztBQUNyQyxZQUFNLFFBQVEsS0FBSyxlQUFlLElBQUksSUFBSSxNQUFNLE9BQU8sQ0FBQztBQUN4RCxVQUFJLE9BQU8sZUFBZSw0QkFBNEI7QUFDckQsZUFBTyxNQUFNLElBQUksZ0JBQWdCLE1BQU07QUFBQSxNQUN4QztBQUFBLElBQ0QsV0FBVyxvQkFBb0IsTUFBTSxHQUFHO0FBQ3ZDLFlBQU0sUUFBUSxLQUFLLGVBQWUsSUFBSSxJQUFJLE1BQU0sT0FBTyxDQUFDO0FBQ3hELFVBQUksT0FBTyxlQUFlLDhCQUE4QjtBQUN2RCxlQUFPLE1BQU0sSUFBSSxnQkFBZ0IsTUFBTTtBQUFBLE1BQ3hDO0FBQUEsSUFDRDtBQUNBLFdBQU8sS0FBSyxjQUFjO0FBQUEsRUFDM0I7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUEsRUFVQSwwQkFBaUM7QUFDaEMsV0FBTyxDQUFDLEdBQUcsS0FBSyxlQUFlLEtBQUssQ0FBQztBQUFBLEVBQ3RDO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBLEVBT0EseUJBQTZEO0FBQzVELFVBQU0sTUFBaUMsQ0FBQztBQUN4QyxlQUFXLENBQUMsVUFBVSxLQUFLLEtBQUssS0FBSyxnQkFBZ0I7QUFDcEQsWUFBTSxRQUFRLE1BQU0sSUFBSTtBQUN4QixZQUFNLFNBQVMsVUFBVSxTQUFZLFlBQVksaUJBQWlCLFFBQVEsVUFBVTtBQUNwRixVQUFJLEtBQUssRUFBRSxVQUFVLE1BQU0sTUFBTSxNQUFNLFVBQVUsTUFBTSxVQUFVLFNBQVMsS0FBSyxrQkFBa0IsS0FBSyxHQUFHLE9BQU8sQ0FBQztBQUFBLElBQ2xIO0FBQ0EsV0FBTztBQUFBLEVBQ1I7QUFBQTtBQUFBLEVBR1Esa0JBQWtCLE9BQThEO0FBQ3ZGLFVBQU0sU0FBUyxvQkFBSSxJQUFvQjtBQUN2QyxlQUFXLFNBQVMsTUFBTSxRQUFRLE9BQU8sR0FBRztBQUMzQyxhQUFPLElBQUksUUFBUSxPQUFPLElBQUksS0FBSyxLQUFLLEtBQUssQ0FBQztBQUFBLElBQy9DO0FBQ0EsV0FBTyxDQUFDLEdBQUcsT0FBTyxRQUFRLENBQUMsRUFDekIsSUFBSSxDQUFDLENBQUMsT0FBTyxLQUFLLE9BQU8sRUFBRSxPQUFPLE1BQU0sRUFBRSxFQUMxQyxLQUFLLENBQUMsR0FBRyxNQUFNLEVBQUUsUUFBUSxFQUFFLEtBQUs7QUFBQSxFQUNuQztBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUEsRUFTQSwyQkFBcUQ7QUFDcEQsVUFBTSxNQUFnQyxDQUFDO0FBQ3ZDLGVBQVcsRUFBRSxJQUFJLEtBQUssS0FBSyxlQUFlLE9BQU8sR0FBRztBQUNuRCxVQUFJLGVBQWUsNEJBQTRCLGVBQWUsdUJBQXVCO0FBQ3BGLFlBQUksS0FBSyxHQUFHLElBQUksa0JBQWtCLENBQUM7QUFBQSxNQUNwQztBQUFBLElBQ0Q7QUFDQSxXQUFPO0FBQUEsRUFDUjtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQSxFQU9BLHlCQUF5QixZQUFvQixXQUF5QjtBQUNyRSxVQUFNLFFBQVEsS0FBSyxlQUFlLElBQUksSUFBSSxNQUFNLFVBQVUsQ0FBQztBQUMzRCxRQUFJLE9BQU8sZUFBZSw0QkFBNEIsT0FBTyxlQUFlLHVCQUF1QjtBQUNsRyxZQUFNLElBQUksdUJBQXVCLFNBQVM7QUFBQSxJQUMzQztBQUFBLEVBQ0Q7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBLEVBU0EsdUJBQXVCLFVBQWtCLE9BQWdCLFNBQWlCLGtCQUFrQixPQUFhO0FBQ3hHLFFBQUksaUJBQWlCLFFBQVEsR0FBRztBQUMvQixXQUFLLFdBQVcsZUFBZSxPQUFvQixPQUFPO0FBQzFEO0FBQUEsSUFDRDtBQUNBLFVBQU0sUUFBUSxLQUFLLGVBQWUsSUFBSSxJQUFJLE1BQU0sUUFBUSxDQUFDO0FBQ3pELFFBQUksQ0FBQyxPQUFPO0FBQ1g7QUFBQSxJQUNEO0FBSUEsUUFBSSxDQUFDLG9CQUFvQixNQUFNLGVBQWUsNEJBQTRCLE1BQU0sZUFBZSx3QkFBd0I7QUFDdEgsWUFBTSxJQUFJLGFBQWE7QUFBQSxJQUN4QjtBQUNBLFVBQU0sSUFBSSxlQUFlLE9BQWdCLE9BQU87QUFBQSxFQUNqRDtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBLEVBUUEseUJBQXlCLFNBQStCO0FBQ3ZELGVBQVcsWUFBWSxTQUFTO0FBQy9CLFlBQU0sUUFBUSxLQUFLLGVBQWUsSUFBSSxRQUFRO0FBQzlDLFVBQUksT0FBTztBQUNWLFlBQUksTUFBTSxlQUFlLDRCQUE0QixNQUFNLGVBQWUsdUJBQXVCO0FBQ2hHLGdCQUFNLElBQUksYUFBYTtBQUFBLFFBQ3hCO0FBQ0EsY0FBTSxJQUFJLFNBQVMsSUFBSSxNQUFNLHFEQUFxRCxTQUFTLFNBQVMsQ0FBQyxFQUFFLENBQUM7QUFBQSxNQUN6RztBQUFBLElBQ0Q7QUFBQSxFQUNEO0FBQUEsRUFFUSxvQkFBb0IsTUFBdUIsS0FBa0M7QUFDcEYsWUFBUSxNQUFNO0FBQUEsTUFDYixLQUFLLGdCQUFnQjtBQUNwQixlQUFPLElBQUkseUJBQXlCLEtBQUssS0FBSyxXQUFXLEtBQUssZUFBZSxLQUFLLElBQUk7QUFBQSxNQUN2RixLQUFLLGdCQUFnQjtBQUNwQixlQUFPLElBQUksc0JBQXNCLEtBQUssS0FBSyxXQUFXLEtBQUssZUFBZSxLQUFLLElBQUk7QUFBQSxNQUNwRixLQUFLLGdCQUFnQjtBQUNwQixlQUFPLElBQUksMEJBQTBCLEtBQUssS0FBSyxXQUFXLEtBQUssSUFBSTtBQUFBLE1BQ3BFLEtBQUssZ0JBQWdCO0FBQ3BCLGVBQU8sSUFBSSwyQkFBMkIsS0FBSyxLQUFLLFdBQVcsS0FBSyxlQUFlLEtBQUssSUFBSTtBQUFBLE1BQ3pGLEtBQUssZ0JBQWdCO0FBQ3BCLGVBQU8sSUFBSSw2QkFBNkIsS0FBSyxLQUFLLFdBQVcsS0FBSyxlQUFlLEtBQUssSUFBSTtBQUFBLE1BQzNGLEtBQUssZ0JBQWdCO0FBQ3BCLGNBQU0sSUFBSSxNQUFNLDhEQUE4RDtBQUFBLE1BQy9FO0FBQ0Msb0JBQVksTUFBTSwwREFBMEQsSUFBSSxFQUFFO0FBQUEsSUFDcEY7QUFBQSxFQUNEO0FBQUEsRUFFUSxxQkFBcUIsVUFBZSxVQUEyQztBQUN0RixVQUFNLFFBQVEsS0FBSyxlQUFlLElBQUksUUFBUTtBQUc5QyxRQUFJLENBQUMsU0FBVSxZQUFZLFVBQVUsVUFBVztBQUMvQztBQUFBLElBQ0Q7QUFDQSxVQUFNO0FBQ04sUUFBSSxNQUFNLFlBQVksR0FBRztBQUN4QixXQUFLLGVBQWUsT0FBTyxRQUFRO0FBQ25DLFdBQUssMEJBQTBCLFVBQVUsS0FBSztBQUFBLElBQy9DO0FBQUEsRUFDRDtBQUFBLEVBRVMsVUFBZ0I7QUFDeEIsZUFBVyxDQUFDLFVBQVUsS0FBSyxLQUFLLEtBQUssZ0JBQWdCO0FBQ3BELFdBQUssZ0JBQWdCLFFBQVE7QUFDN0IsWUFBTSxJQUFJLFFBQVE7QUFBQSxJQUNuQjtBQUNBLFNBQUssZUFBZSxNQUFNO0FBQzFCLFVBQU0sUUFBUTtBQUFBLEVBQ2Y7QUFDRDtBQUdPLFNBQVMsMkNBQTJDLFVBQTBCLGdCQUEyQztBQUMvSCxNQUFJLGlCQUFpQixTQUFTLE9BQU8sR0FBRztBQUN2QyxlQUFXLE9BQU8sZ0JBQWdCO0FBQ2pDLFVBQUksaUJBQWlCLEdBQUcsR0FBRztBQUMxQixlQUFPO0FBQUEsTUFDUjtBQUFBLElBQ0Q7QUFDQSxXQUFPO0FBQUEsRUFDUjtBQUNBLGFBQVcsT0FBTyxnQkFBZ0I7QUFDakMsUUFBSSxRQUFRLFNBQVMsU0FBUztBQUM3QixhQUFPO0FBQUEsSUFDUjtBQUFBLEVBQ0Q7QUFDQSxTQUFPO0FBQ1I7QUFVTyxTQUFTLDJCQUE4QixPQUEyQixLQUF3RDtBQUNoSSxTQUFPLG9CQUFvQixPQUFPLElBQUksYUFBYSxNQUFNO0FBQ3hELFVBQU0sSUFBSSxJQUFJO0FBQ2QsV0FBTyxhQUFhLFFBQVEsU0FBWTtBQUFBLEVBQ3pDLENBQUM7QUFDRjsiLAogICJuYW1lcyI6IFtdCn0K
