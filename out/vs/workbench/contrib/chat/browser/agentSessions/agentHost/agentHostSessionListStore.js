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
import { CancellationToken } from "../../../../../../base/common/cancellation.js";
import { Emitter } from "../../../../../../base/common/event.js";
import { Disposable } from "../../../../../../base/common/lifecycle.js";
import { extUriBiasedIgnorePathCase } from "../../../../../../base/common/resources.js";
import { URI } from "../../../../../../base/common/uri.js";
import { AgentSession } from "../../../../../../platform/agentHost/common/agentService.js";
import { ActionType } from "../../../../../../platform/agentHost/common/state/sessionActions.js";
import { readSessionMultiRootMetadata, SessionStatus } from "../../../../../../platform/agentHost/common/state/sessionState.js";
import { IWorkspaceContextService } from "../../../../../../platform/workspace/common/workspace.js";
let AgentHostSessionListStore = class extends Disposable {
  constructor(_connection, _workspaceContextService) {
    super();
    this._connection = _connection;
    this._workspaceContextService = _workspaceContextService;
    this._onDidChangeSessions = this._register(new Emitter());
    this.onDidChangeSessions = this._onDidChangeSessions.event;
    this._entries = /* @__PURE__ */ new Map();
    /**
     * Backend session keys for sessions a controller created locally (via
     * `newChatSessionItem`) that the backend has not yet announced. Tracked here
     * so per-provider controllers stay stateless; cleared once the backend
     * surfaces or removes the session.
     */
    this._pendingNewSessions = /* @__PURE__ */ new Set();
    this._cacheValid = false;
    /**
     * Incremented whenever the in-memory list is mutated outside of
     * {@link refresh}. Used to detect races where a `root/sessionAdded`,
     * `root/sessionRemoved`, or `root/sessionSummaryChanged` notification
     * arrives while a `listSessions()` round-trip is in flight.
     */
    this._mutationGeneration = 0;
    this._register(this._connection.onDidNotification((n) => this._onNotification(n)));
    this._register(this._workspaceContextService.onDidChangeWorkspaceFolders(() => {
      this._cacheValid = false;
      void this.refresh(CancellationToken.None);
    }));
  }
  getSessions(provider) {
    return [...this._entries.values()].filter((entry) => entry.provider === provider);
  }
  /** Record a session created locally before the backend has announced it. */
  addPendingNewSession(provider, rawId) {
    this._pendingNewSessions.add(this._key(provider, rawId));
  }
  /** Whether a session was created locally and the backend has not surfaced it yet. */
  isPendingNewSession(provider, rawId) {
    return this._pendingNewSessions.has(this._key(provider, rawId));
  }
  resetCache() {
    this._cacheValid = false;
    this._mutationGeneration++;
  }
  async disposeSession(provider, rawId) {
    await this._connection.disposeSession(AgentSession.uri(provider, rawId));
  }
  setSessionArchived(provider, rawId, archived) {
    this._setSessionFlag(provider, rawId, SessionStatus.IsArchived, archived, {
      type: ActionType.SessionIsArchivedChanged,
      isArchived: archived
    });
  }
  setSessionRead(provider, rawId, isRead) {
    this._setSessionFlag(provider, rawId, SessionStatus.IsRead, isRead, {
      type: ActionType.SessionIsReadChanged,
      isRead
    });
  }
  /**
   * Optimistically flips a session-scoped status flag and dispatches the owning
   * action, so the host can fan the change out to other connected clients. An
   * uncached session still dispatches; the summary notification seeds the entry.
   */
  _setSessionFlag(provider, rawId, flag, set, action) {
    const session = AgentSession.uri(provider, rawId);
    const key = this._key(provider, rawId);
    const cached = this._entries.get(key);
    let updated;
    if (cached) {
      const status = set ? cached.summary.status | flag : cached.summary.status & ~flag;
      if (status === cached.summary.status && cached.statusKnown) {
        return;
      }
      updated = { ...cached, statusKnown: true, summary: { ...cached.summary, status } };
    }
    this._mutationGeneration++;
    this._connection.dispatch(session.toString(), action);
    if (updated) {
      this._entries.set(key, updated);
      this._onDidChangeSessions.fire({ addedOrUpdated: [updated] });
    }
  }
  removeSession(provider, rawId) {
    this._mutationGeneration++;
    this._removeSessionFromList(provider, rawId);
  }
  _removeSessionFromList(provider, rawId) {
    const key = this._key(provider, rawId);
    this._pendingNewSessions.delete(key);
    const entry = this._entries.get(key);
    if (!entry) {
      return;
    }
    this._entries.delete(key);
    this._onDidChangeSessions.fire({ removed: [this._toRemoval(entry)] });
  }
  async refresh(token) {
    if (this._refreshInFlight) {
      return this._refreshInFlight;
    }
    this._refreshInFlight = this._doRefresh(token);
    try {
      await this._refreshInFlight;
    } finally {
      this._refreshInFlight = void 0;
    }
  }
  async _doRefresh(token) {
    if (this._cacheValid) {
      return;
    }
    const previousEntries = [...this._entries.values()];
    const startGeneration = this._mutationGeneration;
    let sessions;
    try {
      sessions = await this._connection.listSessions();
    } catch {
      if (startGeneration !== this._mutationGeneration) {
        return;
      }
      if (this._entries.size === 0) {
        return;
      }
      this._entries.clear();
      this._onDidChangeSessions.fire({ removed: previousEntries.map((entry) => this._toRemoval(entry)) });
      return;
    }
    if (startGeneration !== this._mutationGeneration) {
      return this._doRefresh(token);
    }
    const nextEntries = [];
    for (const session of sessions) {
      const entry = this._makeEntryFromMetadata(session);
      if (entry) {
        if (this._isSessionInWorkspace(entry)) {
          nextEntries.push(entry);
        }
      }
    }
    this._entries.clear();
    for (const entry of nextEntries) {
      const key = this._key(entry.provider, entry.rawId);
      this._entries.set(key, entry);
      this._pendingNewSessions.delete(key);
    }
    this._cacheValid = true;
    const nextKeys = new Set(nextEntries.map((entry) => this._key(entry.provider, entry.rawId)));
    const removed = previousEntries.filter((entry) => !nextKeys.has(this._key(entry.provider, entry.rawId))).map((entry) => this._toRemoval(entry));
    if (nextEntries.length === 0 && removed.length === 0) {
      return;
    }
    this._onDidChangeSessions.fire({
      ...nextEntries.length > 0 ? { addedOrUpdated: nextEntries } : void 0,
      ...removed.length > 0 ? { removed } : void 0
    });
  }
  _onNotification(notification) {
    if (notification.type === "root/sessionAdded") {
      const entry = this._makeEntryFromSummary(notification.summary);
      if (!entry) {
        return;
      }
      const key = this._key(entry.provider, entry.rawId);
      if (!this._isSessionInWorkspace(entry)) {
        return;
      }
      this._mutationGeneration++;
      this._entries.set(key, entry);
      this._pendingNewSessions.delete(key);
      this._onDidChangeSessions.fire({ addedOrUpdated: [entry] });
    } else if (notification.type === "root/sessionRemoved") {
      const provider = AgentSession.provider(notification.session);
      if (!provider) {
        return;
      }
      this.removeSession(provider, AgentSession.id(notification.session));
    } else if (notification.type === "root/sessionSummaryChanged") {
      const provider = AgentSession.provider(notification.session);
      if (!provider) {
        return;
      }
      const rawId = AgentSession.id(notification.session);
      const key = this._key(provider, rawId);
      const cached = this._entries.get(key);
      if (!cached) {
        return;
      }
      const updated = {
        provider,
        rawId,
        statusKnown: cached.statusKnown || notification.changes.status !== void 0,
        summary: { ...cached.summary, ...notification.changes }
      };
      if (!this._isSessionInWorkspace(updated)) {
        this._mutationGeneration++;
        this._removeSessionFromList(provider, rawId);
        return;
      }
      this._mutationGeneration++;
      this._entries.set(key, updated);
      this._onDidChangeSessions.fire({ addedOrUpdated: [updated] });
    }
  }
  _makeEntryFromMetadata(session) {
    const provider = AgentSession.provider(session.session);
    if (!provider) {
      return void 0;
    }
    const rawId = AgentSession.id(session.session);
    return {
      provider,
      rawId,
      statusKnown: session.status !== void 0,
      summary: {
        resource: session.session.toString(),
        provider,
        title: session.summary ?? `Session ${rawId.substring(0, 8)}`,
        status: session.status ?? SessionStatus.Idle,
        activity: session.activity,
        createdAt: new Date(session.startTime).toISOString(),
        modifiedAt: new Date(session.modifiedTime).toISOString(),
        changes: session.changes,
        workingDirectories: session.workingDirectories?.map((d) => d.toString()),
        // The repository root a worktree-isolated session belongs to; the
        // workspace filter matches on it because the worktree itself lives
        // outside the repository folder.
        ...session.project ? { project: { uri: session.project.uri.toString(), displayName: session.project.displayName } } : {},
        // Carry `_meta` so the adoptable-legacy marker survives into the list
        // item; consumers use it to avoid passively restoring (and thereby
        // migrating) an un-adopted legacy Copilot CLI session.
        ...session._meta !== void 0 ? { _meta: session._meta } : {}
      }
    };
  }
  _makeEntryFromSummary(summary) {
    const provider = summary.provider || AgentSession.provider(summary.resource);
    if (!provider) {
      return void 0;
    }
    return {
      provider,
      rawId: AgentSession.id(summary.resource),
      statusKnown: true,
      summary
    };
  }
  /** Uses workspace-file provenance for multi-root workspaces and path containment otherwise. */
  _isSessionInWorkspace(entry) {
    const workingDirectories = this._containmentCandidates(entry.summary);
    const workspace = this._workspaceContextService.getWorkspace();
    const folders = workspace.folders;
    const configuration = workspace.configuration;
    const multiRoot = readSessionMultiRootMetadata(entry.summary._meta);
    if (multiRoot) {
      if (URI.isUri(configuration)) {
        return extUriBiasedIgnorePathCase.isEqual(URI.parse(multiRoot.workspaceFile), configuration);
      }
      return folders.length === 0 || this._matchesAnyFolder(workingDirectories, folders);
    }
    if (folders.length === 0) {
      return true;
    }
    return this._matchesAnyFolder(workingDirectories, folders);
  }
  _matchesAnyFolder(workingDirectories, folders) {
    return workingDirectories.some(
      (directory) => folders.some((folder) => extUriBiasedIgnorePathCase.isEqualOrParent(directory, folder.uri))
    );
  }
  /**
   * The directories a session may be matched against a workspace folder by: its
   * working directories plus its server-owned project (repository) root. A
   * worktree-isolated session runs out of a directory outside the repository
   * (`<repo>.worktrees/<name>` for agent-host worktrees, `copilot-worktrees/`
   * for legacy extension-host ones), so working directories alone would hide it
   * from a window opened on that repository; its project root is the primary
   * repository root and restores the match.
   */
  _containmentCandidates(summary) {
    const candidates = summary.workingDirectories?.map((directory) => URI.parse(directory)) ?? [];
    if (summary.project?.uri) {
      candidates.push(URI.parse(summary.project.uri));
    }
    return candidates;
  }
  _toRemoval(entry) {
    return {
      provider: entry.provider,
      rawId: entry.rawId,
      session: AgentSession.uri(entry.provider, entry.rawId)
    };
  }
  _key(provider, rawId) {
    return `${provider}://${rawId}`;
  }
};
AgentHostSessionListStore = __decorateClass([
  __decorateParam(1, IWorkspaceContextService)
], AgentHostSessionListStore);
export {
  AgentHostSessionListStore
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXGNoYXRcXGJyb3dzZXJcXGFnZW50U2Vzc2lvbnNcXGFnZW50SG9zdFxcYWdlbnRIb3N0U2Vzc2lvbkxpc3RTdG9yZS50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB7IENhbmNlbGxhdGlvblRva2VuIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vY2FuY2VsbGF0aW9uLmpzJztcbmltcG9ydCB7IEVtaXR0ZXIsIEV2ZW50IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vZXZlbnQuanMnO1xuaW1wb3J0IHsgRGlzcG9zYWJsZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBleHRVcmlCaWFzZWRJZ25vcmVQYXRoQ2FzZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3Jlc291cmNlcy5qcyc7XG5pbXBvcnQgeyBVUkkgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi91cmkuanMnO1xuaW1wb3J0IHsgQWdlbnRTZXNzaW9uLCB0eXBlIElBZ2VudFNlc3Npb25NZXRhZGF0YSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2FnZW50SG9zdC9jb21tb24vYWdlbnRTZXJ2aWNlLmpzJztcbmltcG9ydCB7IEFjdGlvblR5cGUsIHR5cGUgSUlzQXJjaGl2ZWRDaGFuZ2VkQWN0aW9uLCB0eXBlIElJc1JlYWRDaGFuZ2VkQWN0aW9uLCB0eXBlIElOb3RpZmljYXRpb24sIHR5cGUgU2Vzc2lvbkFjdGlvbiB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2FnZW50SG9zdC9jb21tb24vc3RhdGUvc2Vzc2lvbkFjdGlvbnMuanMnO1xuaW1wb3J0IHsgcmVhZFNlc3Npb25NdWx0aVJvb3RNZXRhZGF0YSwgU2Vzc2lvblN0YXR1cywgdHlwZSBTZXNzaW9uU3VtbWFyeSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2FnZW50SG9zdC9jb21tb24vc3RhdGUvc2Vzc2lvblN0YXRlLmpzJztcbmltcG9ydCB7IElXb3Jrc3BhY2VDb250ZXh0U2VydmljZSwgdHlwZSBJV29ya3NwYWNlRm9sZGVyIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vd29ya3NwYWNlL2NvbW1vbi93b3Jrc3BhY2UuanMnO1xuXG4vKipcbiAqIE1pbmltYWwgYWdlbnQtaG9zdCBjb25uZWN0aW9uIHN1cmZhY2UgbmVlZGVkIGJ5IHRoZSBzZXNzaW9uIGxpc3Qgc3RvcmUuXG4gKi9cbmV4cG9ydCBpbnRlcmZhY2UgSUFnZW50SG9zdFNlc3Npb25MaXN0Q29ubmVjdGlvbiB7XG5cdHJlYWRvbmx5IG9uRGlkTm90aWZpY2F0aW9uOiBFdmVudDxJTm90aWZpY2F0aW9uPjtcblx0bGlzdFNlc3Npb25zKCk6IFByb21pc2U8SUFnZW50U2Vzc2lvbk1ldGFkYXRhW10+O1xuXHRkaXNwb3NlU2Vzc2lvbihzZXNzaW9uOiBVUkkpOiBQcm9taXNlPHZvaWQ+O1xuXHRkaXNwYXRjaChjaGFubmVsOiBzdHJpbmcsIGFjdGlvbjogU2Vzc2lvbkFjdGlvbik6IHZvaWQ7XG59XG5cbi8qKlxuICogUHJvdmlkZXItdGFnZ2VkIGJhY2tlbmQgc2Vzc2lvbiBlbnRyeSBvd25lZCBieSB0aGUgc2hhcmVkIHNlc3Npb24tbGlzdCBzdG9yZS5cbiAqL1xuZXhwb3J0IGludGVyZmFjZSBJQWdlbnRIb3N0U2Vzc2lvbkxpc3RFbnRyeSB7XG5cdHJlYWRvbmx5IHByb3ZpZGVyOiBzdHJpbmc7XG5cdHJlYWRvbmx5IHJhd0lkOiBzdHJpbmc7XG5cdHJlYWRvbmx5IHN1bW1hcnk6IFNlc3Npb25TdW1tYXJ5O1xuXHQvKipcblx0ICogV2hldGhlciB7QGxpbmsgc3VtbWFyeX0ncyBzdGF0dXMgY2FtZSBmcm9tIHRoZSBob3N0LiBgbGlzdFNlc3Npb25zKClgXG5cdCAqIG1ldGFkYXRhIGNhcnJpZXMgbm8gc3RhdHVzIGZvciBhIGNvbGQgc2Vzc2lvbiB0aGF0IGhhcyBuZXZlciBiZWVuIG1hcmtlZFxuXHQgKiByZWFkIG9yIGFyY2hpdmVkLCBhbmQgYFNlc3Npb25TdW1tYXJ5LnN0YXR1c2AgaXMgcmVxdWlyZWQgXHUyMDE0IHNvIHRoZSBzdGF0dXNcblx0ICogaXMgc3ludGhlc2l6ZWQgYW5kIHRoZSBzZXNzaW9uLXNjb3BlZCBmbGFncyBvbiBpdCBtZWFuIG5vdGhpbmcuXG5cdCAqL1xuXHRyZWFkb25seSBzdGF0dXNLbm93bjogYm9vbGVhbjtcbn1cblxuLyoqXG4gKiBQcm92aWRlci10YWdnZWQgYmFja2VuZCBzZXNzaW9uIHJlbW92YWwgZW1pdHRlZCBieSB0aGUgc2hhcmVkIHNlc3Npb24tbGlzdCBzdG9yZS5cbiAqL1xuZXhwb3J0IGludGVyZmFjZSBJQWdlbnRIb3N0U2Vzc2lvbkxpc3RSZW1vdmFsIHtcblx0cmVhZG9ubHkgcHJvdmlkZXI6IHN0cmluZztcblx0cmVhZG9ubHkgcmF3SWQ6IHN0cmluZztcblx0cmVhZG9ubHkgc2Vzc2lvbjogVVJJO1xufVxuXG4vKipcbiAqIEJhY2tlbmQgc2Vzc2lvbiBkZWx0YSBlbWl0dGVkIGJ5IHRoZSBzaGFyZWQgc2Vzc2lvbi1saXN0IHN0b3JlLiBFdmVyeSBkZWx0YVxuICogY2FycmllcyB0aGUgYWZmZWN0ZWQgZW50cmllcywgc28gY29uc3VtZXJzIGNhbiBhcHBseSB0aGVtIGluY3JlbWVudGFsbHk6XG4gKiBuYXJyb3cgbm90aWZpY2F0aW9ucyBjYXJyeSB0aGUgc2luZ2xlIGNoYW5nZWQvcmVtb3ZlZCBlbnRyeSwgd2hpbGUgYSByZWZyZXNoXG4gKiBjYXJyaWVzIHRoZSBmdWxsIGN1cnJlbnQgZW50cnkgc2V0IChwbHVzIGFueSBzZXNzaW9ucyB0aGF0IGRyb3BwZWQgb3V0KS5cbiAqL1xuZXhwb3J0IGludGVyZmFjZSBJQWdlbnRIb3N0U2Vzc2lvbkxpc3REZWx0YSB7XG5cdHJlYWRvbmx5IGFkZGVkT3JVcGRhdGVkPzogcmVhZG9ubHkgSUFnZW50SG9zdFNlc3Npb25MaXN0RW50cnlbXTtcblx0cmVhZG9ubHkgcmVtb3ZlZD86IHJlYWRvbmx5IElBZ2VudEhvc3RTZXNzaW9uTGlzdFJlbW92YWxbXTtcbn1cblxuLyoqXG4gKiBTaGFyZWQgcHJvdmlkZXItYWdub3N0aWMgY2FjaGUgb2YgYWdlbnQtaG9zdCBzZXNzaW9ucy4gSXQgb3ducyB0aGVcbiAqIHByb3ZpZGVyLXdpZGUgbGlzdFNlc3Npb25zIHJlZnJlc2gsIHdvcmtzcGFjZSBmaWx0ZXJpbmcsIGFuZCByb290IHNlc3Npb25cbiAqIG5vdGlmaWNhdGlvbnMuIFBlci1wcm92aWRlciBsaXN0IGNvbnRyb2xsZXJzIHByb2plY3QgdGhpcyBzdGF0ZSBpbnRvIGNoYXRcbiAqIHNlc3Npb24gaXRlbXMuXG4gKi9cbmV4cG9ydCBjbGFzcyBBZ2VudEhvc3RTZXNzaW9uTGlzdFN0b3JlIGV4dGVuZHMgRGlzcG9zYWJsZSB7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfb25EaWRDaGFuZ2VTZXNzaW9ucyA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPElBZ2VudEhvc3RTZXNzaW9uTGlzdERlbHRhPigpKTtcblx0cmVhZG9ubHkgb25EaWRDaGFuZ2VTZXNzaW9ucyA9IHRoaXMuX29uRGlkQ2hhbmdlU2Vzc2lvbnMuZXZlbnQ7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfZW50cmllcyA9IG5ldyBNYXA8c3RyaW5nLCBJQWdlbnRIb3N0U2Vzc2lvbkxpc3RFbnRyeT4oKTtcblx0LyoqXG5cdCAqIEJhY2tlbmQgc2Vzc2lvbiBrZXlzIGZvciBzZXNzaW9ucyBhIGNvbnRyb2xsZXIgY3JlYXRlZCBsb2NhbGx5ICh2aWFcblx0ICogYG5ld0NoYXRTZXNzaW9uSXRlbWApIHRoYXQgdGhlIGJhY2tlbmQgaGFzIG5vdCB5ZXQgYW5ub3VuY2VkLiBUcmFja2VkIGhlcmVcblx0ICogc28gcGVyLXByb3ZpZGVyIGNvbnRyb2xsZXJzIHN0YXkgc3RhdGVsZXNzOyBjbGVhcmVkIG9uY2UgdGhlIGJhY2tlbmRcblx0ICogc3VyZmFjZXMgb3IgcmVtb3ZlcyB0aGUgc2Vzc2lvbi5cblx0ICovXG5cdHByaXZhdGUgcmVhZG9ubHkgX3BlbmRpbmdOZXdTZXNzaW9ucyA9IG5ldyBTZXQ8c3RyaW5nPigpO1xuXHRwcml2YXRlIF9jYWNoZVZhbGlkID0gZmFsc2U7XG5cdHByaXZhdGUgX3JlZnJlc2hJbkZsaWdodDogUHJvbWlzZTx2b2lkPiB8IHVuZGVmaW5lZDtcblx0LyoqXG5cdCAqIEluY3JlbWVudGVkIHdoZW5ldmVyIHRoZSBpbi1tZW1vcnkgbGlzdCBpcyBtdXRhdGVkIG91dHNpZGUgb2Zcblx0ICoge0BsaW5rIHJlZnJlc2h9LiBVc2VkIHRvIGRldGVjdCByYWNlcyB3aGVyZSBhIGByb290L3Nlc3Npb25BZGRlZGAsXG5cdCAqIGByb290L3Nlc3Npb25SZW1vdmVkYCwgb3IgYHJvb3Qvc2Vzc2lvblN1bW1hcnlDaGFuZ2VkYCBub3RpZmljYXRpb25cblx0ICogYXJyaXZlcyB3aGlsZSBhIGBsaXN0U2Vzc2lvbnMoKWAgcm91bmQtdHJpcCBpcyBpbiBmbGlnaHQuXG5cdCAqL1xuXHRwcml2YXRlIF9tdXRhdGlvbkdlbmVyYXRpb24gPSAwO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX2Nvbm5lY3Rpb246IElBZ2VudEhvc3RTZXNzaW9uTGlzdENvbm5lY3Rpb24sXG5cdFx0QElXb3Jrc3BhY2VDb250ZXh0U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF93b3Jrc3BhY2VDb250ZXh0U2VydmljZTogSVdvcmtzcGFjZUNvbnRleHRTZXJ2aWNlLFxuXHQpIHtcblx0XHRzdXBlcigpO1xuXG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5fY29ubmVjdGlvbi5vbkRpZE5vdGlmaWNhdGlvbihuID0+IHRoaXMuX29uTm90aWZpY2F0aW9uKG4pKSk7XG5cblx0XHQvLyBSZS1mZXRjaCB0aGUgc2Vzc2lvbiBsaXN0IHdoZW5ldmVyIHRoZSBzZXQgb2YgVlMgQ29kZSB3b3Jrc3BhY2Vcblx0XHQvLyBmb2xkZXJzIGNoYW5nZXMsIHNpbmNlIGZpbHRlcmluZyBkZXBlbmRzIG9uIGl0LiBUaGUgYWdlbnQgaG9zdCBpdHNlbGZcblx0XHQvLyBkb2Vzbid0IGtub3cgd2hpY2ggd29ya3NwYWNlIHRoaXMgVlMgQ29kZSB3aW5kb3cgaGFzIG9wZW4uXG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5fd29ya3NwYWNlQ29udGV4dFNlcnZpY2Uub25EaWRDaGFuZ2VXb3Jrc3BhY2VGb2xkZXJzKCgpID0+IHtcblx0XHRcdHRoaXMuX2NhY2hlVmFsaWQgPSBmYWxzZTtcblx0XHRcdHZvaWQgdGhpcy5yZWZyZXNoKENhbmNlbGxhdGlvblRva2VuLk5vbmUpO1xuXHRcdH0pKTtcblx0fVxuXG5cdGdldFNlc3Npb25zKHByb3ZpZGVyOiBzdHJpbmcpOiByZWFkb25seSBJQWdlbnRIb3N0U2Vzc2lvbkxpc3RFbnRyeVtdIHtcblx0XHRyZXR1cm4gWy4uLnRoaXMuX2VudHJpZXMudmFsdWVzKCldLmZpbHRlcihlbnRyeSA9PiBlbnRyeS5wcm92aWRlciA9PT0gcHJvdmlkZXIpO1xuXHR9XG5cblx0LyoqIFJlY29yZCBhIHNlc3Npb24gY3JlYXRlZCBsb2NhbGx5IGJlZm9yZSB0aGUgYmFja2VuZCBoYXMgYW5ub3VuY2VkIGl0LiAqL1xuXHRhZGRQZW5kaW5nTmV3U2Vzc2lvbihwcm92aWRlcjogc3RyaW5nLCByYXdJZDogc3RyaW5nKTogdm9pZCB7XG5cdFx0dGhpcy5fcGVuZGluZ05ld1Nlc3Npb25zLmFkZCh0aGlzLl9rZXkocHJvdmlkZXIsIHJhd0lkKSk7XG5cdH1cblxuXHQvKiogV2hldGhlciBhIHNlc3Npb24gd2FzIGNyZWF0ZWQgbG9jYWxseSBhbmQgdGhlIGJhY2tlbmQgaGFzIG5vdCBzdXJmYWNlZCBpdCB5ZXQuICovXG5cdGlzUGVuZGluZ05ld1Nlc3Npb24ocHJvdmlkZXI6IHN0cmluZywgcmF3SWQ6IHN0cmluZyk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiB0aGlzLl9wZW5kaW5nTmV3U2Vzc2lvbnMuaGFzKHRoaXMuX2tleShwcm92aWRlciwgcmF3SWQpKTtcblx0fVxuXG5cdHJlc2V0Q2FjaGUoKTogdm9pZCB7XG5cdFx0dGhpcy5fY2FjaGVWYWxpZCA9IGZhbHNlO1xuXHRcdHRoaXMuX211dGF0aW9uR2VuZXJhdGlvbisrO1xuXHR9XG5cblx0YXN5bmMgZGlzcG9zZVNlc3Npb24ocHJvdmlkZXI6IHN0cmluZywgcmF3SWQ6IHN0cmluZyk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGF3YWl0IHRoaXMuX2Nvbm5lY3Rpb24uZGlzcG9zZVNlc3Npb24oQWdlbnRTZXNzaW9uLnVyaShwcm92aWRlciwgcmF3SWQpKTtcblx0fVxuXG5cdHNldFNlc3Npb25BcmNoaXZlZChwcm92aWRlcjogc3RyaW5nLCByYXdJZDogc3RyaW5nLCBhcmNoaXZlZDogYm9vbGVhbik6IHZvaWQge1xuXHRcdHRoaXMuX3NldFNlc3Npb25GbGFnKHByb3ZpZGVyLCByYXdJZCwgU2Vzc2lvblN0YXR1cy5Jc0FyY2hpdmVkLCBhcmNoaXZlZCwge1xuXHRcdFx0dHlwZTogQWN0aW9uVHlwZS5TZXNzaW9uSXNBcmNoaXZlZENoYW5nZWQsXG5cdFx0XHRpc0FyY2hpdmVkOiBhcmNoaXZlZCxcblx0XHR9KTtcblx0fVxuXG5cdHNldFNlc3Npb25SZWFkKHByb3ZpZGVyOiBzdHJpbmcsIHJhd0lkOiBzdHJpbmcsIGlzUmVhZDogYm9vbGVhbik6IHZvaWQge1xuXHRcdHRoaXMuX3NldFNlc3Npb25GbGFnKHByb3ZpZGVyLCByYXdJZCwgU2Vzc2lvblN0YXR1cy5Jc1JlYWQsIGlzUmVhZCwge1xuXHRcdFx0dHlwZTogQWN0aW9uVHlwZS5TZXNzaW9uSXNSZWFkQ2hhbmdlZCxcblx0XHRcdGlzUmVhZCxcblx0XHR9KTtcblx0fVxuXG5cdC8qKlxuXHQgKiBPcHRpbWlzdGljYWxseSBmbGlwcyBhIHNlc3Npb24tc2NvcGVkIHN0YXR1cyBmbGFnIGFuZCBkaXNwYXRjaGVzIHRoZSBvd25pbmdcblx0ICogYWN0aW9uLCBzbyB0aGUgaG9zdCBjYW4gZmFuIHRoZSBjaGFuZ2Ugb3V0IHRvIG90aGVyIGNvbm5lY3RlZCBjbGllbnRzLiBBblxuXHQgKiB1bmNhY2hlZCBzZXNzaW9uIHN0aWxsIGRpc3BhdGNoZXM7IHRoZSBzdW1tYXJ5IG5vdGlmaWNhdGlvbiBzZWVkcyB0aGUgZW50cnkuXG5cdCAqL1xuXHRwcml2YXRlIF9zZXRTZXNzaW9uRmxhZyhwcm92aWRlcjogc3RyaW5nLCByYXdJZDogc3RyaW5nLCBmbGFnOiBTZXNzaW9uU3RhdHVzLCBzZXQ6IGJvb2xlYW4sIGFjdGlvbjogSUlzQXJjaGl2ZWRDaGFuZ2VkQWN0aW9uIHwgSUlzUmVhZENoYW5nZWRBY3Rpb24pOiB2b2lkIHtcblx0XHRjb25zdCBzZXNzaW9uID0gQWdlbnRTZXNzaW9uLnVyaShwcm92aWRlciwgcmF3SWQpO1xuXHRcdGNvbnN0IGtleSA9IHRoaXMuX2tleShwcm92aWRlciwgcmF3SWQpO1xuXHRcdGNvbnN0IGNhY2hlZCA9IHRoaXMuX2VudHJpZXMuZ2V0KGtleSk7XG5cdFx0bGV0IHVwZGF0ZWQ6IElBZ2VudEhvc3RTZXNzaW9uTGlzdEVudHJ5IHwgdW5kZWZpbmVkO1xuXHRcdGlmIChjYWNoZWQpIHtcblx0XHRcdGNvbnN0IHN0YXR1cyA9IHNldCA/IGNhY2hlZC5zdW1tYXJ5LnN0YXR1cyB8IGZsYWcgOiBjYWNoZWQuc3VtbWFyeS5zdGF0dXMgJiB+ZmxhZztcblx0XHRcdGlmIChzdGF0dXMgPT09IGNhY2hlZC5zdW1tYXJ5LnN0YXR1cyAmJiBjYWNoZWQuc3RhdHVzS25vd24pIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXHRcdFx0Ly8gVGhlIGZsYWcgaXMgbm93IG1lYW5pbmdmdWwgd2hhdGV2ZXIgdGhlIGhvc3QgaGFkIHNhaWQgYmVmb3JlOiB0aGlzXG5cdFx0XHQvLyBkaXNwYXRjaCBpcyB3aGF0IGVzdGFibGlzaGVzIGl0LlxuXHRcdFx0dXBkYXRlZCA9IHsgLi4uY2FjaGVkLCBzdGF0dXNLbm93bjogdHJ1ZSwgc3VtbWFyeTogeyAuLi5jYWNoZWQuc3VtbWFyeSwgc3RhdHVzIH0gfTtcblx0XHR9XG5cblx0XHR0aGlzLl9tdXRhdGlvbkdlbmVyYXRpb24rKztcblx0XHR0aGlzLl9jb25uZWN0aW9uLmRpc3BhdGNoKHNlc3Npb24udG9TdHJpbmcoKSwgYWN0aW9uKTtcblx0XHRpZiAodXBkYXRlZCkge1xuXHRcdFx0dGhpcy5fZW50cmllcy5zZXQoa2V5LCB1cGRhdGVkKTtcblx0XHRcdHRoaXMuX29uRGlkQ2hhbmdlU2Vzc2lvbnMuZmlyZSh7IGFkZGVkT3JVcGRhdGVkOiBbdXBkYXRlZF0gfSk7XG5cdFx0fVxuXHR9XG5cblx0cmVtb3ZlU2Vzc2lvbihwcm92aWRlcjogc3RyaW5nLCByYXdJZDogc3RyaW5nKTogdm9pZCB7XG5cdFx0Ly8gQnVtcCB0aGUgZ2VuZXJhdGlvbiB1bmNvbmRpdGlvbmFsbHkgXHUyMDE0IGV2ZW4gd2hlbiB0aGUgZW50cnkgaXNuJ3QgcHJlc2VudFxuXHRcdC8vIGxvY2FsbHkuIEEgYHJvb3Qvc2Vzc2lvblJlbW92ZWRgIChvciBhbiBvcHRpbWlzdGljIGRlbGV0ZSkgY2FuIGFycml2ZVxuXHRcdC8vIHdoaWxlIGEgYGxpc3RTZXNzaW9ucygpYCBpcyBpbiBmbGlnaHQgd2hvc2Ugc25hcHNob3QgcHJlZGF0ZXMgdGhlXG5cdFx0Ly8gcmVtb3ZhbDsgaW52YWxpZGF0aW5nIHRoYXQgc25hcHNob3QgaGVyZSBwcmV2ZW50cyBgX2RvUmVmcmVzaGAgZnJvbVxuXHRcdC8vIHJlc3VycmVjdGluZyB0aGUganVzdC1yZW1vdmVkIHNlc3Npb24uXG5cdFx0dGhpcy5fbXV0YXRpb25HZW5lcmF0aW9uKys7XG5cdFx0dGhpcy5fcmVtb3ZlU2Vzc2lvbkZyb21MaXN0KHByb3ZpZGVyLCByYXdJZCk7XG5cdH1cblxuXHRwcml2YXRlIF9yZW1vdmVTZXNzaW9uRnJvbUxpc3QocHJvdmlkZXI6IHN0cmluZywgcmF3SWQ6IHN0cmluZyk6IHZvaWQge1xuXHRcdGNvbnN0IGtleSA9IHRoaXMuX2tleShwcm92aWRlciwgcmF3SWQpO1xuXHRcdC8vIEFuIGFubm91bmNlZCBvciBkZWxldGVkIHNlc3Npb24gaXMgbm8gbG9uZ2VyIHBlbmRpbmcsIGV2ZW4gd2hlbiBubyB2aXNpYmxlIGVudHJ5IGV4aXN0cy5cblx0XHR0aGlzLl9wZW5kaW5nTmV3U2Vzc2lvbnMuZGVsZXRlKGtleSk7XG5cdFx0Y29uc3QgZW50cnkgPSB0aGlzLl9lbnRyaWVzLmdldChrZXkpO1xuXHRcdGlmICghZW50cnkpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHR0aGlzLl9lbnRyaWVzLmRlbGV0ZShrZXkpO1xuXHRcdHRoaXMuX29uRGlkQ2hhbmdlU2Vzc2lvbnMuZmlyZSh7IHJlbW92ZWQ6IFt0aGlzLl90b1JlbW92YWwoZW50cnkpXSB9KTtcblx0fVxuXG5cdGFzeW5jIHJlZnJlc2godG9rZW46IENhbmNlbGxhdGlvblRva2VuKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0aWYgKHRoaXMuX3JlZnJlc2hJbkZsaWdodCkge1xuXHRcdFx0cmV0dXJuIHRoaXMuX3JlZnJlc2hJbkZsaWdodDtcblx0XHR9XG5cblx0XHR0aGlzLl9yZWZyZXNoSW5GbGlnaHQgPSB0aGlzLl9kb1JlZnJlc2godG9rZW4pO1xuXHRcdHRyeSB7XG5cdFx0XHRhd2FpdCB0aGlzLl9yZWZyZXNoSW5GbGlnaHQ7XG5cdFx0fSBmaW5hbGx5IHtcblx0XHRcdHRoaXMuX3JlZnJlc2hJbkZsaWdodCA9IHVuZGVmaW5lZDtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIF9kb1JlZnJlc2godG9rZW46IENhbmNlbGxhdGlvblRva2VuKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0aWYgKHRoaXMuX2NhY2hlVmFsaWQpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCBwcmV2aW91c0VudHJpZXMgPSBbLi4udGhpcy5fZW50cmllcy52YWx1ZXMoKV07XG5cdFx0Y29uc3Qgc3RhcnRHZW5lcmF0aW9uID0gdGhpcy5fbXV0YXRpb25HZW5lcmF0aW9uO1xuXHRcdGxldCBzZXNzaW9uczogSUFnZW50U2Vzc2lvbk1ldGFkYXRhW107XG5cdFx0dHJ5IHtcblx0XHRcdHNlc3Npb25zID0gYXdhaXQgdGhpcy5fY29ubmVjdGlvbi5saXN0U2Vzc2lvbnMoKTtcblx0XHR9IGNhdGNoIHtcblx0XHRcdC8vIElmIG5vdGlmaWNhdGlvbnMgbXV0YXRlZCB0aGUgbGlzdCB3aGlsZSB3ZSB3ZXJlIGZldGNoaW5nLCB0aGVcblx0XHRcdC8vIGluLW1lbW9yeSBzdGF0ZSBpcyBtb3JlIHVwLXRvLWRhdGUgdGhhbiBvdXIgZmFpbGVkIGZldGNoLlxuXHRcdFx0aWYgKHN0YXJ0R2VuZXJhdGlvbiAhPT0gdGhpcy5fbXV0YXRpb25HZW5lcmF0aW9uKSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblx0XHRcdGlmICh0aGlzLl9lbnRyaWVzLnNpemUgPT09IDApIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXHRcdFx0dGhpcy5fZW50cmllcy5jbGVhcigpO1xuXHRcdFx0dGhpcy5fb25EaWRDaGFuZ2VTZXNzaW9ucy5maXJlKHsgcmVtb3ZlZDogcHJldmlvdXNFbnRyaWVzLm1hcChlbnRyeSA9PiB0aGlzLl90b1JlbW92YWwoZW50cnkpKSB9KTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHQvLyBJZiBub3RpZmljYXRpb25zIG11dGF0ZWQgdGhlIGxpc3QgYmV0d2VlbiB0aGUgcmVxdWVzdCBhbmQgcmVzcG9uc2UsXG5cdFx0Ly8gb3VyIHNuYXBzaG90IGlzIHN0YWxlLiBEaXNjYXJkIGl0IGFuZCByZS1mZXRjaCBpbnN0ZWFkIG9mIG92ZXJ3cml0aW5nXG5cdFx0Ly8gdGhlIGp1c3QtdXBkYXRlZCBlbnRyaWVzLlxuXHRcdGlmIChzdGFydEdlbmVyYXRpb24gIT09IHRoaXMuX211dGF0aW9uR2VuZXJhdGlvbikge1xuXHRcdFx0cmV0dXJuIHRoaXMuX2RvUmVmcmVzaCh0b2tlbik7XG5cdFx0fVxuXG5cdFx0Y29uc3QgbmV4dEVudHJpZXM6IElBZ2VudEhvc3RTZXNzaW9uTGlzdEVudHJ5W10gPSBbXTtcblx0XHRmb3IgKGNvbnN0IHNlc3Npb24gb2Ygc2Vzc2lvbnMpIHtcblx0XHRcdGNvbnN0IGVudHJ5ID0gdGhpcy5fbWFrZUVudHJ5RnJvbU1ldGFkYXRhKHNlc3Npb24pO1xuXHRcdFx0aWYgKGVudHJ5KSB7XG5cdFx0XHRcdGlmICh0aGlzLl9pc1Nlc3Npb25JbldvcmtzcGFjZShlbnRyeSkpIHtcblx0XHRcdFx0XHRuZXh0RW50cmllcy5wdXNoKGVudHJ5KTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblxuXHRcdHRoaXMuX2VudHJpZXMuY2xlYXIoKTtcblx0XHRmb3IgKGNvbnN0IGVudHJ5IG9mIG5leHRFbnRyaWVzKSB7XG5cdFx0XHRjb25zdCBrZXkgPSB0aGlzLl9rZXkoZW50cnkucHJvdmlkZXIsIGVudHJ5LnJhd0lkKTtcblx0XHRcdHRoaXMuX2VudHJpZXMuc2V0KGtleSwgZW50cnkpO1xuXHRcdFx0Ly8gQSBsb2NhbGx5LWNyZWF0ZWQgc2Vzc2lvbiB0aGF0IG5vdyBhcHBlYXJzIGluIHRoZSBiYWNrZW5kIGxpc3QgaXMgbm9cblx0XHRcdC8vIGxvbmdlciBwZW5kaW5nLlxuXHRcdFx0dGhpcy5fcGVuZGluZ05ld1Nlc3Npb25zLmRlbGV0ZShrZXkpO1xuXHRcdH1cblx0XHR0aGlzLl9jYWNoZVZhbGlkID0gdHJ1ZTtcblxuXHRcdC8vIEZpcmUgdGhlIGZ1bGwgY3VycmVudCBlbnRyeSBzZXQgKGVhY2ggY29udHJvbGxlciBwcm9qZWN0cyBvbmx5IGl0cyBvd25cblx0XHQvLyBwcm92aWRlcikgcGx1cyBhbnkgc2Vzc2lvbnMgdGhhdCBkcm9wcGVkIG91dC4gQ29uc3VtZXJzIGFwcGx5IHRoaXNcblx0XHQvLyBpbmNyZW1lbnRhbGx5IGFuZCByZS1zb3J0LCBzbyBhIHByZWNpc2UgcGVyLWl0ZW0gZGlmZiBpcyB1bm5lY2Vzc2FyeS5cblx0XHRjb25zdCBuZXh0S2V5cyA9IG5ldyBTZXQobmV4dEVudHJpZXMubWFwKGVudHJ5ID0+IHRoaXMuX2tleShlbnRyeS5wcm92aWRlciwgZW50cnkucmF3SWQpKSk7XG5cdFx0Y29uc3QgcmVtb3ZlZCA9IHByZXZpb3VzRW50cmllc1xuXHRcdFx0LmZpbHRlcihlbnRyeSA9PiAhbmV4dEtleXMuaGFzKHRoaXMuX2tleShlbnRyeS5wcm92aWRlciwgZW50cnkucmF3SWQpKSlcblx0XHRcdC5tYXAoZW50cnkgPT4gdGhpcy5fdG9SZW1vdmFsKGVudHJ5KSk7XG5cdFx0aWYgKG5leHRFbnRyaWVzLmxlbmd0aCA9PT0gMCAmJiByZW1vdmVkLmxlbmd0aCA9PT0gMCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdHRoaXMuX29uRGlkQ2hhbmdlU2Vzc2lvbnMuZmlyZSh7XG5cdFx0XHQuLi4obmV4dEVudHJpZXMubGVuZ3RoID4gMCA/IHsgYWRkZWRPclVwZGF0ZWQ6IG5leHRFbnRyaWVzIH0gOiB1bmRlZmluZWQpLFxuXHRcdFx0Li4uKHJlbW92ZWQubGVuZ3RoID4gMCA/IHsgcmVtb3ZlZCB9IDogdW5kZWZpbmVkKSxcblx0XHR9KTtcblx0fVxuXG5cdHByaXZhdGUgX29uTm90aWZpY2F0aW9uKG5vdGlmaWNhdGlvbjogSU5vdGlmaWNhdGlvbik6IHZvaWQge1xuXHRcdGlmIChub3RpZmljYXRpb24udHlwZSA9PT0gJ3Jvb3Qvc2Vzc2lvbkFkZGVkJykge1xuXHRcdFx0Y29uc3QgZW50cnkgPSB0aGlzLl9tYWtlRW50cnlGcm9tU3VtbWFyeShub3RpZmljYXRpb24uc3VtbWFyeSk7XG5cdFx0XHRpZiAoIWVudHJ5KSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblx0XHRcdGNvbnN0IGtleSA9IHRoaXMuX2tleShlbnRyeS5wcm92aWRlciwgZW50cnkucmF3SWQpO1xuXHRcdFx0aWYgKCF0aGlzLl9pc1Nlc3Npb25JbldvcmtzcGFjZShlbnRyeSkpIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXHRcdFx0dGhpcy5fbXV0YXRpb25HZW5lcmF0aW9uKys7XG5cdFx0XHR0aGlzLl9lbnRyaWVzLnNldChrZXksIGVudHJ5KTtcblx0XHRcdC8vIFRoZSBiYWNrZW5kIGhhcyBub3cgYW5ub3VuY2VkIHRoaXMgc2Vzc2lvbiwgc28gaXQgaXMgbm8gbG9uZ2VyIGFcblx0XHRcdC8vIGxvY2FsbHktcGVuZGluZyBuZXcgc2Vzc2lvbi5cblx0XHRcdHRoaXMuX3BlbmRpbmdOZXdTZXNzaW9ucy5kZWxldGUoa2V5KTtcblx0XHRcdHRoaXMuX29uRGlkQ2hhbmdlU2Vzc2lvbnMuZmlyZSh7IGFkZGVkT3JVcGRhdGVkOiBbZW50cnldIH0pO1xuXHRcdH0gZWxzZSBpZiAobm90aWZpY2F0aW9uLnR5cGUgPT09ICdyb290L3Nlc3Npb25SZW1vdmVkJykge1xuXHRcdFx0Y29uc3QgcHJvdmlkZXIgPSBBZ2VudFNlc3Npb24ucHJvdmlkZXIobm90aWZpY2F0aW9uLnNlc3Npb24pO1xuXHRcdFx0aWYgKCFwcm92aWRlcikge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cdFx0XHR0aGlzLnJlbW92ZVNlc3Npb24ocHJvdmlkZXIsIEFnZW50U2Vzc2lvbi5pZChub3RpZmljYXRpb24uc2Vzc2lvbikpO1xuXHRcdH0gZWxzZSBpZiAobm90aWZpY2F0aW9uLnR5cGUgPT09ICdyb290L3Nlc3Npb25TdW1tYXJ5Q2hhbmdlZCcpIHtcblx0XHRcdGNvbnN0IHByb3ZpZGVyID0gQWdlbnRTZXNzaW9uLnByb3ZpZGVyKG5vdGlmaWNhdGlvbi5zZXNzaW9uKTtcblx0XHRcdGlmICghcHJvdmlkZXIpIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXHRcdFx0Y29uc3QgcmF3SWQgPSBBZ2VudFNlc3Npb24uaWQobm90aWZpY2F0aW9uLnNlc3Npb24pO1xuXHRcdFx0Y29uc3Qga2V5ID0gdGhpcy5fa2V5KHByb3ZpZGVyLCByYXdJZCk7XG5cdFx0XHRjb25zdCBjYWNoZWQgPSB0aGlzLl9lbnRyaWVzLmdldChrZXkpO1xuXHRcdFx0aWYgKCFjYWNoZWQpIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXG5cdFx0XHRjb25zdCB1cGRhdGVkOiBJQWdlbnRIb3N0U2Vzc2lvbkxpc3RFbnRyeSA9IHtcblx0XHRcdFx0cHJvdmlkZXIsXG5cdFx0XHRcdHJhd0lkLFxuXHRcdFx0XHRzdGF0dXNLbm93bjogY2FjaGVkLnN0YXR1c0tub3duIHx8IG5vdGlmaWNhdGlvbi5jaGFuZ2VzLnN0YXR1cyAhPT0gdW5kZWZpbmVkLFxuXHRcdFx0XHRzdW1tYXJ5OiB7IC4uLmNhY2hlZC5zdW1tYXJ5LCAuLi5ub3RpZmljYXRpb24uY2hhbmdlcyB9LFxuXHRcdFx0fTtcblx0XHRcdGlmICghdGhpcy5faXNTZXNzaW9uSW5Xb3Jrc3BhY2UodXBkYXRlZCkpIHtcblx0XHRcdFx0dGhpcy5fbXV0YXRpb25HZW5lcmF0aW9uKys7XG5cdFx0XHRcdHRoaXMuX3JlbW92ZVNlc3Npb25Gcm9tTGlzdChwcm92aWRlciwgcmF3SWQpO1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cblx0XHRcdHRoaXMuX211dGF0aW9uR2VuZXJhdGlvbisrO1xuXHRcdFx0dGhpcy5fZW50cmllcy5zZXQoa2V5LCB1cGRhdGVkKTtcblx0XHRcdHRoaXMuX29uRGlkQ2hhbmdlU2Vzc2lvbnMuZmlyZSh7IGFkZGVkT3JVcGRhdGVkOiBbdXBkYXRlZF0gfSk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBfbWFrZUVudHJ5RnJvbU1ldGFkYXRhKHNlc3Npb246IElBZ2VudFNlc3Npb25NZXRhZGF0YSk6IElBZ2VudEhvc3RTZXNzaW9uTGlzdEVudHJ5IHwgdW5kZWZpbmVkIHtcblx0XHRjb25zdCBwcm92aWRlciA9IEFnZW50U2Vzc2lvbi5wcm92aWRlcihzZXNzaW9uLnNlc3Npb24pO1xuXHRcdGlmICghcHJvdmlkZXIpIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXG5cdFx0Y29uc3QgcmF3SWQgPSBBZ2VudFNlc3Npb24uaWQoc2Vzc2lvbi5zZXNzaW9uKTtcblxuXHRcdHJldHVybiB7XG5cdFx0XHRwcm92aWRlcixcblx0XHRcdHJhd0lkLFxuXHRcdFx0c3RhdHVzS25vd246IHNlc3Npb24uc3RhdHVzICE9PSB1bmRlZmluZWQsXG5cdFx0XHRzdW1tYXJ5OiB7XG5cdFx0XHRcdHJlc291cmNlOiBzZXNzaW9uLnNlc3Npb24udG9TdHJpbmcoKSxcblx0XHRcdFx0cHJvdmlkZXIsXG5cdFx0XHRcdHRpdGxlOiBzZXNzaW9uLnN1bW1hcnkgPz8gYFNlc3Npb24gJHtyYXdJZC5zdWJzdHJpbmcoMCwgOCl9YCxcblx0XHRcdFx0c3RhdHVzOiBzZXNzaW9uLnN0YXR1cyA/PyBTZXNzaW9uU3RhdHVzLklkbGUsXG5cdFx0XHRcdGFjdGl2aXR5OiBzZXNzaW9uLmFjdGl2aXR5LFxuXHRcdFx0XHRjcmVhdGVkQXQ6IG5ldyBEYXRlKHNlc3Npb24uc3RhcnRUaW1lKS50b0lTT1N0cmluZygpLFxuXHRcdFx0XHRtb2RpZmllZEF0OiBuZXcgRGF0ZShzZXNzaW9uLm1vZGlmaWVkVGltZSkudG9JU09TdHJpbmcoKSxcblx0XHRcdFx0Y2hhbmdlczogc2Vzc2lvbi5jaGFuZ2VzLFxuXHRcdFx0XHR3b3JraW5nRGlyZWN0b3JpZXM6IHNlc3Npb24ud29ya2luZ0RpcmVjdG9yaWVzPy5tYXAoZCA9PiBkLnRvU3RyaW5nKCkpLFxuXHRcdFx0XHQvLyBUaGUgcmVwb3NpdG9yeSByb290IGEgd29ya3RyZWUtaXNvbGF0ZWQgc2Vzc2lvbiBiZWxvbmdzIHRvOyB0aGVcblx0XHRcdFx0Ly8gd29ya3NwYWNlIGZpbHRlciBtYXRjaGVzIG9uIGl0IGJlY2F1c2UgdGhlIHdvcmt0cmVlIGl0c2VsZiBsaXZlc1xuXHRcdFx0XHQvLyBvdXRzaWRlIHRoZSByZXBvc2l0b3J5IGZvbGRlci5cblx0XHRcdFx0Li4uKHNlc3Npb24ucHJvamVjdCA/IHsgcHJvamVjdDogeyB1cmk6IHNlc3Npb24ucHJvamVjdC51cmkudG9TdHJpbmcoKSwgZGlzcGxheU5hbWU6IHNlc3Npb24ucHJvamVjdC5kaXNwbGF5TmFtZSB9IH0gOiB7fSksXG5cdFx0XHRcdC8vIENhcnJ5IGBfbWV0YWAgc28gdGhlIGFkb3B0YWJsZS1sZWdhY3kgbWFya2VyIHN1cnZpdmVzIGludG8gdGhlIGxpc3Rcblx0XHRcdFx0Ly8gaXRlbTsgY29uc3VtZXJzIHVzZSBpdCB0byBhdm9pZCBwYXNzaXZlbHkgcmVzdG9yaW5nIChhbmQgdGhlcmVieVxuXHRcdFx0XHQvLyBtaWdyYXRpbmcpIGFuIHVuLWFkb3B0ZWQgbGVnYWN5IENvcGlsb3QgQ0xJIHNlc3Npb24uXG5cdFx0XHRcdC4uLihzZXNzaW9uLl9tZXRhICE9PSB1bmRlZmluZWQgPyB7IF9tZXRhOiBzZXNzaW9uLl9tZXRhIH0gOiB7fSksXG5cdFx0XHR9LFxuXHRcdH07XG5cdH1cblxuXHRwcml2YXRlIF9tYWtlRW50cnlGcm9tU3VtbWFyeShzdW1tYXJ5OiBTZXNzaW9uU3VtbWFyeSk6IElBZ2VudEhvc3RTZXNzaW9uTGlzdEVudHJ5IHwgdW5kZWZpbmVkIHtcblx0XHRjb25zdCBwcm92aWRlciA9IHN1bW1hcnkucHJvdmlkZXIgfHwgQWdlbnRTZXNzaW9uLnByb3ZpZGVyKHN1bW1hcnkucmVzb3VyY2UpO1xuXHRcdGlmICghcHJvdmlkZXIpIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXHRcdHJldHVybiB7XG5cdFx0XHRwcm92aWRlcixcblx0XHRcdHJhd0lkOiBBZ2VudFNlc3Npb24uaWQoc3VtbWFyeS5yZXNvdXJjZSksXG5cdFx0XHRzdGF0dXNLbm93bjogdHJ1ZSxcblx0XHRcdHN1bW1hcnksXG5cdFx0fTtcblx0fVxuXG5cdC8qKiBVc2VzIHdvcmtzcGFjZS1maWxlIHByb3ZlbmFuY2UgZm9yIG11bHRpLXJvb3Qgd29ya3NwYWNlcyBhbmQgcGF0aCBjb250YWlubWVudCBvdGhlcndpc2UuICovXG5cdHByaXZhdGUgX2lzU2Vzc2lvbkluV29ya3NwYWNlKGVudHJ5OiBJQWdlbnRIb3N0U2Vzc2lvbkxpc3RFbnRyeSk6IGJvb2xlYW4ge1xuXHRcdGNvbnN0IHdvcmtpbmdEaXJlY3RvcmllcyA9IHRoaXMuX2NvbnRhaW5tZW50Q2FuZGlkYXRlcyhlbnRyeS5zdW1tYXJ5KTtcblx0XHRjb25zdCB3b3Jrc3BhY2UgPSB0aGlzLl93b3Jrc3BhY2VDb250ZXh0U2VydmljZS5nZXRXb3Jrc3BhY2UoKTtcblx0XHRjb25zdCBmb2xkZXJzID0gd29ya3NwYWNlLmZvbGRlcnM7XG5cdFx0Y29uc3QgY29uZmlndXJhdGlvbiA9IHdvcmtzcGFjZS5jb25maWd1cmF0aW9uO1xuXHRcdGNvbnN0IG11bHRpUm9vdCA9IHJlYWRTZXNzaW9uTXVsdGlSb290TWV0YWRhdGEoZW50cnkuc3VtbWFyeS5fbWV0YSk7XG5cdFx0aWYgKG11bHRpUm9vdCkge1xuXHRcdFx0Ly8gQSBtdWx0aS1yb290IHdpbmRvdyBtYXRjaGVzIHN0cmljdGx5IGJ5IHdvcmtzcGFjZS1maWxlIGlkZW50aXR5IHNvIHR3b1xuXHRcdFx0Ly8gZGlmZmVyZW50IGAuY29kZS13b3Jrc3BhY2VgIGZpbGVzIHRoYXQgc2hhcmUgYSBmb2xkZXIgZG9uJ3QgY3Jvc3Mgb3Zlci5cblx0XHRcdGlmIChVUkkuaXNVcmkoY29uZmlndXJhdGlvbikpIHtcblx0XHRcdFx0cmV0dXJuIGV4dFVyaUJpYXNlZElnbm9yZVBhdGhDYXNlLmlzRXF1YWwoVVJJLnBhcnNlKG11bHRpUm9vdC53b3Jrc3BhY2VGaWxlKSwgY29uZmlndXJhdGlvbik7XG5cdFx0XHR9XG5cdFx0XHQvLyBBbiBlbXB0eSB3aW5kb3cgc2hvd3MgZXZlcnkgc2Vzc2lvbjsgYSBzaW5nbGUtZm9sZGVyIChvciBvdGhlclxuXHRcdFx0Ly8gbm9uLW11bHRpLXJvb3QpIHdpbmRvdyBmYWxscyBiYWNrIHRvIHdvcmtpbmctZGlyZWN0b3J5IGNvbnRhaW5tZW50LlxuXHRcdFx0cmV0dXJuIGZvbGRlcnMubGVuZ3RoID09PSAwIHx8IHRoaXMuX21hdGNoZXNBbnlGb2xkZXIod29ya2luZ0RpcmVjdG9yaWVzLCBmb2xkZXJzKTtcblx0XHR9XG5cdFx0aWYgKGZvbGRlcnMubGVuZ3RoID09PSAwKSB7XG5cdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHR9XG5cdFx0cmV0dXJuIHRoaXMuX21hdGNoZXNBbnlGb2xkZXIod29ya2luZ0RpcmVjdG9yaWVzLCBmb2xkZXJzKTtcblx0fVxuXG5cdHByaXZhdGUgX21hdGNoZXNBbnlGb2xkZXIod29ya2luZ0RpcmVjdG9yaWVzOiByZWFkb25seSBVUklbXSwgZm9sZGVyczogcmVhZG9ubHkgSVdvcmtzcGFjZUZvbGRlcltdKTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuIHdvcmtpbmdEaXJlY3Rvcmllcy5zb21lKGRpcmVjdG9yeSA9PlxuXHRcdFx0Zm9sZGVycy5zb21lKGZvbGRlciA9PiBleHRVcmlCaWFzZWRJZ25vcmVQYXRoQ2FzZS5pc0VxdWFsT3JQYXJlbnQoZGlyZWN0b3J5LCBmb2xkZXIudXJpKSlcblx0XHQpO1xuXHR9XG5cblx0LyoqXG5cdCAqIFRoZSBkaXJlY3RvcmllcyBhIHNlc3Npb24gbWF5IGJlIG1hdGNoZWQgYWdhaW5zdCBhIHdvcmtzcGFjZSBmb2xkZXIgYnk6IGl0c1xuXHQgKiB3b3JraW5nIGRpcmVjdG9yaWVzIHBsdXMgaXRzIHNlcnZlci1vd25lZCBwcm9qZWN0IChyZXBvc2l0b3J5KSByb290LiBBXG5cdCAqIHdvcmt0cmVlLWlzb2xhdGVkIHNlc3Npb24gcnVucyBvdXQgb2YgYSBkaXJlY3Rvcnkgb3V0c2lkZSB0aGUgcmVwb3NpdG9yeVxuXHQgKiAoYDxyZXBvPi53b3JrdHJlZXMvPG5hbWU+YCBmb3IgYWdlbnQtaG9zdCB3b3JrdHJlZXMsIGBjb3BpbG90LXdvcmt0cmVlcy9gXG5cdCAqIGZvciBsZWdhY3kgZXh0ZW5zaW9uLWhvc3Qgb25lcyksIHNvIHdvcmtpbmcgZGlyZWN0b3JpZXMgYWxvbmUgd291bGQgaGlkZSBpdFxuXHQgKiBmcm9tIGEgd2luZG93IG9wZW5lZCBvbiB0aGF0IHJlcG9zaXRvcnk7IGl0cyBwcm9qZWN0IHJvb3QgaXMgdGhlIHByaW1hcnlcblx0ICogcmVwb3NpdG9yeSByb290IGFuZCByZXN0b3JlcyB0aGUgbWF0Y2guXG5cdCAqL1xuXHRwcml2YXRlIF9jb250YWlubWVudENhbmRpZGF0ZXMoc3VtbWFyeTogU2Vzc2lvblN1bW1hcnkpOiByZWFkb25seSBVUklbXSB7XG5cdFx0Y29uc3QgY2FuZGlkYXRlcyA9IHN1bW1hcnkud29ya2luZ0RpcmVjdG9yaWVzPy5tYXAoZGlyZWN0b3J5ID0+IFVSSS5wYXJzZShkaXJlY3RvcnkpKSA/PyBbXTtcblx0XHRpZiAoc3VtbWFyeS5wcm9qZWN0Py51cmkpIHtcblx0XHRcdGNhbmRpZGF0ZXMucHVzaChVUkkucGFyc2Uoc3VtbWFyeS5wcm9qZWN0LnVyaSkpO1xuXHRcdH1cblx0XHRyZXR1cm4gY2FuZGlkYXRlcztcblx0fVxuXG5cdHByaXZhdGUgX3RvUmVtb3ZhbChlbnRyeTogSUFnZW50SG9zdFNlc3Npb25MaXN0RW50cnkpOiBJQWdlbnRIb3N0U2Vzc2lvbkxpc3RSZW1vdmFsIHtcblx0XHRyZXR1cm4ge1xuXHRcdFx0cHJvdmlkZXI6IGVudHJ5LnByb3ZpZGVyLFxuXHRcdFx0cmF3SWQ6IGVudHJ5LnJhd0lkLFxuXHRcdFx0c2Vzc2lvbjogQWdlbnRTZXNzaW9uLnVyaShlbnRyeS5wcm92aWRlciwgZW50cnkucmF3SWQpLFxuXHRcdH07XG5cdH1cblxuXHRwcml2YXRlIF9rZXkocHJvdmlkZXI6IHN0cmluZywgcmF3SWQ6IHN0cmluZyk6IHN0cmluZyB7XG5cdFx0cmV0dXJuIGAke3Byb3ZpZGVyfTovLyR7cmF3SWR9YDtcblx0fVxufVxuIl0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7Ozs7QUFLQSxTQUFTLHlCQUF5QjtBQUNsQyxTQUFTLGVBQXNCO0FBQy9CLFNBQVMsa0JBQWtCO0FBQzNCLFNBQVMsa0NBQWtDO0FBQzNDLFNBQVMsV0FBVztBQUNwQixTQUFTLG9CQUFnRDtBQUN6RCxTQUFTLGtCQUFvSDtBQUM3SCxTQUFTLDhCQUE4QixxQkFBMEM7QUFDakYsU0FBUyxnQ0FBdUQ7QUFzRHpELElBQU0sNEJBQU4sY0FBd0MsV0FBVztBQUFBLEVBdUJ6RCxZQUNrQixhQUMwQiwwQkFDMUM7QUFDRCxVQUFNO0FBSFc7QUFDMEI7QUF2QjVDLFNBQWlCLHVCQUF1QixLQUFLLFVBQVUsSUFBSSxRQUFvQyxDQUFDO0FBQ2hHLFNBQVMsc0JBQXNCLEtBQUsscUJBQXFCO0FBRXpELFNBQWlCLFdBQVcsb0JBQUksSUFBd0M7QUFPeEU7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUEsU0FBaUIsc0JBQXNCLG9CQUFJLElBQVk7QUFDdkQsU0FBUSxjQUFjO0FBUXRCO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBLFNBQVEsc0JBQXNCO0FBUTdCLFNBQUssVUFBVSxLQUFLLFlBQVksa0JBQWtCLE9BQUssS0FBSyxnQkFBZ0IsQ0FBQyxDQUFDLENBQUM7QUFLL0UsU0FBSyxVQUFVLEtBQUsseUJBQXlCLDRCQUE0QixNQUFNO0FBQzlFLFdBQUssY0FBYztBQUNuQixXQUFLLEtBQUssUUFBUSxrQkFBa0IsSUFBSTtBQUFBLElBQ3pDLENBQUMsQ0FBQztBQUFBLEVBQ0g7QUFBQSxFQUVBLFlBQVksVUFBeUQ7QUFDcEUsV0FBTyxDQUFDLEdBQUcsS0FBSyxT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
