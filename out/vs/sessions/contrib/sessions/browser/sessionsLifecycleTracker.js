import { hash } from "../../../../base/common/hash.js";
import { Disposable } from "../../../../base/common/lifecycle.js";
import { Schemas } from "../../../../base/common/network.js";
import { StorageScope, StorageTarget } from "../../../../platform/storage/common/storage.js";
import { classifySessionWorkspaceTopology, getSessionsTelemetryProviderId, hashSessionIdForTelemetry } from "../../../common/sessionsTelemetry.js";
const APP_LAUNCH_COUNT_KEY = "agentSessions.telemetry.summary.appLaunchCount";
const SESSIONS_KEY = "agentSessions.telemetry.summary.sessions";
const TOTAL_SESSIONS_KEY = "agentSessions.telemetry.totalSessions";
const WORKSPACE_SESSIONS_KEY = "agentSessions.telemetry.workspaceSessions";
const PROVIDER_SESSIONS_KEY = "agentSessions.telemetry.providerSessions";
const MAX_TRACKED_SESSIONS = 2e3;
class SessionsLifecycleTracker extends Disposable {
  constructor(_storageService) {
    super();
    this._storageService = _storageService;
    const previousAppLaunches = this._storageService.getNumber(APP_LAUNCH_COUNT_KEY, StorageScope.APPLICATION, 0);
    this._appLaunchCount = previousAppLaunches + 1;
    this._storageService.store(APP_LAUNCH_COUNT_KEY, this._appLaunchCount, StorageScope.APPLICATION, StorageTarget.MACHINE);
    this._stats = this._load();
  }
  /** Record a request that creates a new chat for the given session. Bumps both `requestsSent` and `chatCount`. */
  recordNewChatRequestSent(session) {
    this._recordRequestSent(
      session,
      /* isNewChat */
      true
    );
  }
  /** Record a follow-up request within an existing chat. Bumps `requestsSent` but not `chatCount`. */
  recordRequestSent(session) {
    this._recordRequestSent(
      session,
      /* isNewChat */
      false
    );
  }
  _recordRequestSent(session, isNewChat) {
    const entry = this._ensure(session);
    entry.requestsSent++;
    if (isNewChat) {
      entry.chatCount++;
    }
    if (entry.firstRequestSentAt === 0) {
      entry.firstRequestSentAt = Date.now();
      entry.firstRequestSentInThisClient = true;
    }
    this._updateChangesSummary(entry, session);
    this._save();
  }
  /**
   * Records task-related state observed at the time of the first user
   * request for the given session. Only the first call per tracked session
   * has an effect; subsequent calls are ignored.
   */
  recordFirstRequestTaskInfo(session, info) {
    const entry = this._stats.get(session.sessionId);
    if (!entry || entry.hasWorktreeCreatedTask !== void 0) {
      return;
    }
    entry.hasWorktreeCreatedTask = info.hasWorktreeCreatedTask;
    entry.configuredTasksCount = info.configuredTasksCount;
    this._save();
  }
  /** Increment a named counter. Creates a tracking entry if the session is not yet tracked. */
  bumpCounter(session, key) {
    const entry = this._ensure(session);
    entry[key]++;
    this._updateChangesSummary(entry, session);
    this._save();
  }
  /** Refresh observed change summary for a tracked session. No-op when not tracked. */
  updateSessionState(session) {
    const entry = this._stats.get(session.sessionId);
    if (!entry) {
      return;
    }
    this._updateChangesSummary(entry, session);
    this._save();
  }
  /**
   * Increments the persisted user-request counters (total, per-workspace,
   * per-provider) and returns the new values. Should be called once per
   * brand-new session the user starts from the Agents window.
   */
  incrementAndGetUserRequestCounters(session) {
    const providerId = getSessionsTelemetryProviderId(session.providerId);
    const workspaceUri = session.workspace.get()?.uri.toString();
    const userSessionsTotal = this._storageService.getNumber(TOTAL_SESSIONS_KEY, StorageScope.APPLICATION, 0) + 1;
    this._storageService.store(TOTAL_SESSIONS_KEY, userSessionsTotal, StorageScope.APPLICATION, StorageTarget.MACHINE);
    const providerCounts = this._readProviderCounterMap();
    const userSessionsForProvider = (providerCounts[providerId] ?? 0) + 1;
    providerCounts[providerId] = userSessionsForProvider;
    this._storageService.store(PROVIDER_SESSIONS_KEY, JSON.stringify(providerCounts), StorageScope.APPLICATION, StorageTarget.MACHINE);
    let userSessionsInWorkspace = 0;
    if (workspaceUri) {
      const workspaceCounts = this._readCounterMap(WORKSPACE_SESSIONS_KEY);
      userSessionsInWorkspace = (workspaceCounts[workspaceUri] ?? 0) + 1;
      workspaceCounts[workspaceUri] = userSessionsInWorkspace;
      this._storageService.store(WORKSPACE_SESSIONS_KEY, JSON.stringify(workspaceCounts), StorageScope.APPLICATION, StorageTarget.MACHINE);
    }
    return { userSessionsTotal, userSessionsInWorkspace, userSessionsForProvider };
  }
  /** Reads the persisted user-request counters without incrementing them. */
  getUserRequestCounters(session) {
    return this._readUserRequestCounters(session.providerId, session.workspace.get()?.uri.toString());
  }
  /** Whether the given session id has a tracking entry. */
  isTracked(sessionId) {
    return this._stats.has(sessionId);
  }
  /** Snapshot of tracked session ids. */
  getTrackedIds() {
    return [...this._stats.keys()];
  }
  /** Snapshot of tracked sessions as `(sessionId, providerId)` pairs. */
  getTrackedEntries() {
    const result = [];
    for (const [sessionId, entry] of this._stats) {
      result.push({ sessionId, providerId: entry.providerId });
    }
    return result;
  }
  /**
   * Build a summary for the given tracked session and remove its entry.
   * Returns `undefined` if the session was not tracked (e.g., already
   * finalized by a competing event).
   */
  finalize(sessionId, reason, finalSession) {
    const entry = this._stats.get(sessionId);
    if (!entry) {
      return void 0;
    }
    if (finalSession) {
      this._updateChangesSummary(entry, finalSession);
    }
    this._stats.delete(sessionId);
    this._save();
    return buildSummary(sessionId, entry, reason, this._appLaunchCount, this._readUserRequestCountersForSummary(entry));
  }
  // -- internals -------------------------------------------------------------
  _readUserRequestCountersForSummary(entry) {
    return this._readUserRequestCounters(entry.providerId, entry.workspaceUriString || void 0);
  }
  _readUserRequestCounters(providerId, workspaceUri) {
    const userSessionsTotal = this._storageService.getNumber(TOTAL_SESSIONS_KEY, StorageScope.APPLICATION, 0);
    const providerCounts = this._readProviderCounterMap();
    const userSessionsForProvider = providerCounts[getSessionsTelemetryProviderId(providerId)] ?? 0;
    let userSessionsInWorkspace = 0;
    if (workspaceUri) {
      const workspaceCounts = this._readCounterMap(WORKSPACE_SESSIONS_KEY);
      userSessionsInWorkspace = workspaceCounts[workspaceUri] ?? 0;
    }
    return { userSessionsTotal, userSessionsInWorkspace, userSessionsForProvider };
  }
  _readProviderCounterMap() {
    const storedCounts = this._readCounterMap(PROVIDER_SESSIONS_KEY);
    const providerCounts = {};
    for (const [providerId, count] of Object.entries(storedCounts)) {
      const telemetryProviderId = getSessionsTelemetryProviderId(providerId);
      providerCounts[telemetryProviderId] = (providerCounts[telemetryProviderId] ?? 0) + count;
    }
    return providerCounts;
  }
  _readCounterMap(key) {
    const raw = this._storageService.get(key, StorageScope.APPLICATION);
    if (!raw) {
      return {};
    }
    try {
      const parsed = JSON.parse(raw);
      return parsed && typeof parsed === "object" ? parsed : {};
    } catch {
      return {};
    }
  }
  _ensure(session) {
    const id = session.sessionId;
    let entry = this._stats.get(id);
    if (!entry) {
      if (this._stats.size >= MAX_TRACKED_SESSIONS) {
        this._evictOldest();
      }
      entry = createEntry(session, this._appLaunchCount);
      this._stats.set(id, entry);
    }
    return entry;
  }
  _updateChangesSummary(entry, session) {
    const summary = session.changesSummary?.get();
    if (summary) {
      entry.filesChanged = summary.files;
      entry.linesAdded = summary.additions;
      entry.linesDeleted = summary.deletions;
      return;
    }
    let files = 0;
    let additions = 0;
    let deletions = 0;
    for (const change of session.changes.get()) {
      files++;
      additions += change.insertions;
      deletions += change.deletions;
    }
    entry.filesChanged = files;
    entry.linesAdded = additions;
    entry.linesDeleted = deletions;
  }
  _evictOldest() {
    let oldestId;
    let oldestTime = Number.POSITIVE_INFINITY;
    for (const [id, entry] of this._stats) {
      if (entry.firstObservedAt < oldestTime) {
        oldestTime = entry.firstObservedAt;
        oldestId = id;
      }
    }
    if (oldestId !== void 0) {
      this._stats.delete(oldestId);
    }
  }
  _load() {
    const raw = this._storageService.get(SESSIONS_KEY, StorageScope.APPLICATION);
    const map = /* @__PURE__ */ new Map();
    if (!raw) {
      return map;
    }
    try {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === "object") {
        for (const [id, value] of Object.entries(parsed)) {
          if (value && typeof value === "object") {
            map.set(id, value);
          }
        }
      }
    } catch {
    }
    return map;
  }
  _save() {
    if (this._stats.size === 0) {
      this._storageService.remove(SESSIONS_KEY, StorageScope.APPLICATION);
      return;
    }
    const obj = {};
    for (const [id, entry] of this._stats) {
      obj[id] = entry;
    }
    this._storageService.store(SESSIONS_KEY, JSON.stringify(obj), StorageScope.APPLICATION, StorageTarget.MACHINE);
  }
}
function createEntry(session, appLaunchCount) {
  const workspace = session.workspace.get();
  const workspaceUriString = workspace?.uri.toString() ?? "";
  const hasWorktree = workspace?.folders.some((folder) => folder.gitRepository?.workTreeUri !== void 0) ?? false;
  const hasGit = workspace?.folders.some((folder) => folder.gitRepository !== void 0) ?? false;
  const isVirtual = workspace ? workspace.uri.scheme !== Schemas.file : false;
  const folders = workspace?.folders ?? [];
  const topology = classifySessionWorkspaceTopology(folders.length, folders.filter((folder) => folder.gitRepository !== void 0).length);
  return {
    providerId: session.providerId,
    providerType: session.sessionType,
    sessionResourceUri: session.resource.toString(),
    workspaceUriString,
    isolationKind: hasWorktree ? "worktree" : "folder",
    hasGitRepository: hasGit,
    isVirtualWorkspace: isVirtual,
    isMultiRoot: topology.isMultiRoot,
    folderCount: topology.folderCount,
    gitFolderCount: topology.gitFolderCount,
    nonGitFolderCount: topology.nonGitFolderCount,
    firstRequestSentInThisClient: false,
    hasWorktreeCreatedTask: void 0,
    configuredTasksCount: void 0,
    firstObservedAt: Date.now(),
    firstRequestSentAt: 0,
    appLaunchCountAtFirstObserved: appLaunchCount,
    requestsSent: 0,
    chatCount: 0,
    feedbackAdded: 0,
    feedbackConverted: 0,
    feedbackReplyAdded: 0,
    feedbackSubmitted: 0,
    createPullRequest: 0,
    createDraftPullRequest: 0,
    updatePullRequest: 0,
    mergePullRequest: 0,
    checkoutPullRequest: 0,
    initializeRepository: 0,
    commit: 0,
    commitAndSync: 0,
    sessionRestored: 0,
    stickinessToggled: 0,
    maximizeToggled: 0,
    chatDeleted: 0,
    chatRenamed: 0,
    sessionRenamed: 0,
    fixCIChecks: 0,
    taskRun: 0,
    filesChanged: 0,
    linesAdded: 0,
    linesDeleted: 0
  };
}
function buildSummary(sessionId, entry, reason, appLaunchCount, requestCounters) {
  const now = Date.now();
  return {
    agentSessionId: hashSessionIdForTelemetry(sessionId),
    providerId: getSessionsTelemetryProviderId(entry.providerId),
    providerType: entry.providerType,
    isolationKind: entry.isolationKind,
    workspaceHash: entry.workspaceUriString ? hash(entry.workspaceUriString).toString(16) : "",
    hasGitRepository: entry.hasGitRepository,
    isVirtualWorkspace: entry.isVirtualWorkspace,
    // Back-compat: entries persisted before these fields existed default to 0/false.
    isMultiRoot: entry.isMultiRoot ?? false,
    folderCount: entry.folderCount ?? 0,
    gitFolderCount: entry.gitFolderCount ?? 0,
    nonGitFolderCount: entry.nonGitFolderCount ?? 0,
    doneReason: reason,
    firstRequestSentInThisClient: entry.firstRequestSentInThisClient,
    hasWorktreeCreatedTask: entry.hasWorktreeCreatedTask,
    configuredTasksCount: entry.configuredTasksCount,
    timeSinceFirstObservedMs: now - entry.firstObservedAt,
    timeSinceFirstRequestMs: entry.firstRequestSentAt > 0 ? now - entry.firstRequestSentAt : -1,
    appLaunchesSinceFirstObserved: appLaunchCount - entry.appLaunchCountAtFirstObserved,
    requestsSent: entry.requestsSent,
    chatCount: entry.chatCount,
    feedbackAdded: entry.feedbackAdded,
    feedbackConverted: entry.feedbackConverted,
    feedbackReplyAdded: entry.feedbackReplyAdded,
    feedbackSubmitted: entry.feedbackSubmitted,
    createPullRequest: entry.createPullRequest,
    createDraftPullRequest: entry.createDraftPullRequest,
    updatePullRequest: entry.updatePullRequest,
    mergePullRequest: entry.mergePullRequest,
    checkoutPullRequest: entry.checkoutPullRequest,
    initializeRepository: entry.initializeRepository,
    commit: entry.commit,
    commitAndSync: entry.commitAndSync,
    sessionRestored: entry.sessionRestored,
    stickinessToggled: entry.stickinessToggled,
    maximizeToggled: entry.maximizeToggled,
    chatDeleted: entry.chatDeleted,
    chatRenamed: entry.chatRenamed,
    sessionRenamed: entry.sessionRenamed,
    fixCIChecks: entry.fixCIChecks,
    taskRun: entry.taskRun,
    filesChanged: entry.filesChanged,
    linesAdded: entry.linesAdded,
    linesDeleted: entry.linesDeleted,
    userSessionsTotal: requestCounters.userSessionsTotal,
    userSessionsInWorkspace: requestCounters.userSessionsInWorkspace,
    userSessionsForProvider: requestCounters.userSessionsForProvider
  };
}
export {
  MAX_TRACKED_SESSIONS,
  SESSIONS_KEY,
  SessionsLifecycleTracker,
  TOTAL_SESSIONS_KEY
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxzZXNzaW9uc1xcY29udHJpYlxcc2Vzc2lvbnNcXGJyb3dzZXJcXHNlc3Npb25zTGlmZWN5Y2xlVHJhY2tlci50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB7IGhhc2ggfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9oYXNoLmpzJztcbmltcG9ydCB7IERpc3Bvc2FibGUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgU2NoZW1hcyB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL25ldHdvcmsuanMnO1xuaW1wb3J0IHsgSVN0b3JhZ2VTZXJ2aWNlLCBTdG9yYWdlU2NvcGUsIFN0b3JhZ2VUYXJnZXQgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9zdG9yYWdlL2NvbW1vbi9zdG9yYWdlLmpzJztcbmltcG9ydCB7IElTZXNzaW9uIH0gZnJvbSAnLi4vLi4vLi4vc2VydmljZXMvc2Vzc2lvbnMvY29tbW9uL3Nlc3Npb24uanMnO1xuaW1wb3J0IHsgY2xhc3NpZnlTZXNzaW9uV29ya3NwYWNlVG9wb2xvZ3ksIGdldFNlc3Npb25zVGVsZW1ldHJ5UHJvdmlkZXJJZCwgaGFzaFNlc3Npb25JZEZvclRlbGVtZXRyeSB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9zZXNzaW9uc1RlbGVtZXRyeS5qcyc7XG5cbi8qKiBTdG9yYWdlIGtleSBmb3IgdGhlIGN1bXVsYXRpdmUgbnVtYmVyIG9mIHRpbWVzIHRoaXMgY2xpZW50IGhhcyBiZWVuIGxhdW5jaGVkLiAqL1xuY29uc3QgQVBQX0xBVU5DSF9DT1VOVF9LRVkgPSAnYWdlbnRTZXNzaW9ucy50ZWxlbWV0cnkuc3VtbWFyeS5hcHBMYXVuY2hDb3VudCc7XG4vKiogU3RvcmFnZSBrZXkgZm9yIHRoZSBwZXItc2Vzc2lvbiBsaWZlY3ljbGUgc3RhdHMgbWFwIChKU09OIGVuY29kZWQpLiBFeHBvcnRlZCBmb3IgdGVzdHMuICovXG5leHBvcnQgY29uc3QgU0VTU0lPTlNfS0VZID0gJ2FnZW50U2Vzc2lvbnMudGVsZW1ldHJ5LnN1bW1hcnkuc2Vzc2lvbnMnO1xuLyoqIFN0b3JhZ2Uga2V5IGZvciB0aGUgY3VtdWxhdGl2ZSBudW1iZXIgb2Ygc2Vzc2lvbnMgc3RhcnRlZCBmcm9tIHRoZSBBZ2VudHMgd2luZG93IGFjcm9zcyBhbGwgd29ya3NwYWNlcyBhbmQgcHJvdmlkZXJzLiAqL1xuZXhwb3J0IGNvbnN0IFRPVEFMX1NFU1NJT05TX0tFWSA9ICdhZ2VudFNlc3Npb25zLnRlbGVtZXRyeS50b3RhbFNlc3Npb25zJztcbi8qKiBTdG9yYWdlIGtleSBmb3IgdGhlIGN1bXVsYXRpdmUgbnVtYmVyIG9mIHNlc3Npb25zIHN0YXJ0ZWQgaW4gZWFjaCB3b3Jrc3BhY2UgKEpTT04gZW5jb2RlZCBtYXAgb2Ygd29ya3NwYWNlIFVSSSAtPiBjb3VudCkuICovXG5jb25zdCBXT1JLU1BBQ0VfU0VTU0lPTlNfS0VZID0gJ2FnZW50U2Vzc2lvbnMudGVsZW1ldHJ5LndvcmtzcGFjZVNlc3Npb25zJztcbi8qKiBTdG9yYWdlIGtleSBmb3IgdGhlIGN1bXVsYXRpdmUgbnVtYmVyIG9mIHNlc3Npb25zIHN0YXJ0ZWQgZm9yIGVhY2ggc2Vzc2lvbnMgcHJvdmlkZXIgKEpTT04gZW5jb2RlZCBtYXAgb2YgcHJvdmlkZXJJZCAtPiBjb3VudCkuICovXG5jb25zdCBQUk9WSURFUl9TRVNTSU9OU19LRVkgPSAnYWdlbnRTZXNzaW9ucy50ZWxlbWV0cnkucHJvdmlkZXJTZXNzaW9ucyc7XG4vKiogSGFyZCBjYXAgb24gdGhlIG51bWJlciBvZiB0cmFja2VkIHNlc3Npb25zIHRvIHByZXZlbnQgdW5ib3VuZGVkIHN0b3JhZ2UgZ3Jvd3RoLiBFeHBvcnRlZCBmb3IgdGVzdHMuICovXG5leHBvcnQgY29uc3QgTUFYX1RSQUNLRURfU0VTU0lPTlMgPSAyMDAwO1xuXG4vKiogUmVhc29uIGEgc2Vzc2lvbiBpcyBjb25zaWRlcmVkIFwiZG9uZVwiIGFuZCB0aGUgc3VtbWFyeSBpcyBlbWl0dGVkLiAqL1xuZXhwb3J0IHR5cGUgU2Vzc2lvbkRvbmVSZWFzb24gPSAnYXJjaGl2ZWQnIHwgJ2RlbGV0ZWQnIHwgJ2FyY2hpdmVkUmVtb3RlbHknIHwgJ2RlbGV0ZWRSZW1vdGVseSc7XG5cbi8qKlxuICogQ3VtdWxhdGl2ZSB1c2VyLXJlcXVlc3QgY291bnRlcnMgbWFpbnRhaW5lZCBieSB7QGxpbmsgU2Vzc2lvbnNMaWZlY3ljbGVUcmFja2VyfS5cbiAqIFRoZSB2YWx1ZXMgYXJlIHJldHVybmVkIHBvc3QtaW5jcmVtZW50IGJ5XG4gKiB7QGxpbmsgU2Vzc2lvbnNMaWZlY3ljbGVUcmFja2VyLmluY3JlbWVudEFuZEdldFVzZXJSZXF1ZXN0Q291bnRlcnN9LCBvciByZWFkXG4gKiB1bmNoYW5nZWQgdmlhIHtAbGluayBTZXNzaW9uc0xpZmVjeWNsZVRyYWNrZXIuZ2V0VXNlclJlcXVlc3RDb3VudGVyc30uXG4gKi9cbmV4cG9ydCBpbnRlcmZhY2UgSVVzZXJSZXF1ZXN0Q291bnRlcnMge1xuXHRyZWFkb25seSB1c2VyU2Vzc2lvbnNUb3RhbDogbnVtYmVyO1xuXHRyZWFkb25seSB1c2VyU2Vzc2lvbnNJbldvcmtzcGFjZTogbnVtYmVyO1xuXHRyZWFkb25seSB1c2VyU2Vzc2lvbnNGb3JQcm92aWRlcjogbnVtYmVyO1xufVxuXG4vKiogS2V5cyBvZiB7QGxpbmsgSVN0b3JlZFNlc3Npb25TdGF0c30gdGhhdCBob2xkIHNpbXBsZSBpbmNyZW1lbnRhYmxlIGNvdW50ZXJzLiAqL1xuZXhwb3J0IHR5cGUgU2Vzc2lvbkxpZmVjeWNsZUNvdW50ZXJLZXkgPVxuXHR8ICdmZWVkYmFja0FkZGVkJyB8ICdmZWVkYmFja0NvbnZlcnRlZCcgfCAnZmVlZGJhY2tSZXBseUFkZGVkJyB8ICdmZWVkYmFja1N1Ym1pdHRlZCdcblx0fCAnY3JlYXRlUHVsbFJlcXVlc3QnIHwgJ2NyZWF0ZURyYWZ0UHVsbFJlcXVlc3QnIHwgJ3VwZGF0ZVB1bGxSZXF1ZXN0JyB8ICdtZXJnZVB1bGxSZXF1ZXN0JyB8ICdjaGVja291dFB1bGxSZXF1ZXN0J1xuXHR8ICdpbml0aWFsaXplUmVwb3NpdG9yeScgfCAnY29tbWl0JyB8ICdjb21taXRBbmRTeW5jJ1xuXHR8ICdzZXNzaW9uUmVzdG9yZWQnIHwgJ3N0aWNraW5lc3NUb2dnbGVkJyB8ICdtYXhpbWl6ZVRvZ2dsZWQnXG5cdHwgJ2NoYXREZWxldGVkJyB8ICdjaGF0UmVuYW1lZCcgfCAnc2Vzc2lvblJlbmFtZWQnIHwgJ2ZpeENJQ2hlY2tzJyB8ICd0YXNrUnVuJztcblxuLyoqXG4gKiBQZXJzaXN0ZWQgc2hhcGUgb2YgYSBzaW5nbGUgdHJhY2tlZCBzZXNzaW9uLiBTdG9yZWQgYXMgYSBKU09OIHZhbHVlIGluIHRoZVxuICogYXBwbGljYXRpb24tc2NvcGVkIHN0b3JhZ2Ugc28gdGhhdCB0cmFja2luZyBzdXJ2aXZlcyBhcHAgcmVzdGFydHMgYW5kXG4gKiBzcGFucyBhY3Jvc3Mgd29ya3NwYWNlcy5cbiAqL1xuaW50ZXJmYWNlIElTdG9yZWRTZXNzaW9uU3RhdHMge1xuXHQvLyBTZXNzaW9uIGFuZCB3b3Jrc3BhY2UgY29udGV4dCBjYXB0dXJlZCBhdCBmaXJzdCBvYnNlcnZhdGlvbi5cblx0cHJvdmlkZXJJZDogc3RyaW5nO1xuXHRwcm92aWRlclR5cGU6IHN0cmluZztcblx0c2Vzc2lvblJlc291cmNlVXJpOiBzdHJpbmc7XG5cdHdvcmtzcGFjZVVyaVN0cmluZzogc3RyaW5nO1xuXHRpc29sYXRpb25LaW5kOiAnd29ya3RyZWUnIHwgJ2ZvbGRlcic7XG5cdGhhc0dpdFJlcG9zaXRvcnk6IGJvb2xlYW47XG5cdGlzVmlydHVhbFdvcmtzcGFjZTogYm9vbGVhbjtcblx0Ly8gVG9wb2xvZ3kgZmllbGRzIGFyZSBvcHRpb25hbCBzbyByb3dzIHBlcnNpc3RlZCBiZWZvcmUgdGhleSBleGlzdGVkIHN0aWxsXG5cdC8vIGxvYWQ7IGBjcmVhdGVFbnRyeWAgYWx3YXlzIHNldHMgdGhlbSBhbmQgYGJ1aWxkU3VtbWFyeWAgZGVmYXVsdHMgdGhlbS5cblx0aXNNdWx0aVJvb3Q/OiBib29sZWFuO1xuXHRmb2xkZXJDb3VudD86IG51bWJlcjtcblx0Z2l0Rm9sZGVyQ291bnQ/OiBudW1iZXI7XG5cdG5vbkdpdEZvbGRlckNvdW50PzogbnVtYmVyO1xuXG5cdC8vIE9yaWdpblxuXHRmaXJzdFJlcXVlc3RTZW50SW5UaGlzQ2xpZW50OiBib29sZWFuO1xuXG5cdC8vIFRhc2sgc3RhdGUgb2JzZXJ2ZWQgYXQgdGhlIHRpbWUgb2YgdGhlIGZpcnN0IHJlcXVlc3QgKG9ubHkgc2V0IG9uY2UpLlxuXHQvLyBgdW5kZWZpbmVkYCB1bnRpbCByZWNvcmRlZC5cblx0aGFzV29ya3RyZWVDcmVhdGVkVGFzazogYm9vbGVhbiB8IHVuZGVmaW5lZDtcblx0Y29uZmlndXJlZFRhc2tzQ291bnQ6IG51bWJlciB8IHVuZGVmaW5lZDtcblxuXHQvLyBUaW1pbmcgKG1zIGVwb2NoKVxuXHRmaXJzdE9ic2VydmVkQXQ6IG51bWJlcjtcblx0Zmlyc3RSZXF1ZXN0U2VudEF0OiBudW1iZXI7XG5cblx0Ly8gQXBwIGxhdW5jaGVzXG5cdGFwcExhdW5jaENvdW50QXRGaXJzdE9ic2VydmVkOiBudW1iZXI7XG5cblx0Ly8gUGVyLWV2ZW50IGNvdW50ZXJzXG5cdHJlcXVlc3RzU2VudDogbnVtYmVyO1xuXHRjaGF0Q291bnQ6IG51bWJlcjtcblx0ZmVlZGJhY2tBZGRlZDogbnVtYmVyO1xuXHRmZWVkYmFja0NvbnZlcnRlZDogbnVtYmVyO1xuXHRmZWVkYmFja1JlcGx5QWRkZWQ6IG51bWJlcjtcblx0ZmVlZGJhY2tTdWJtaXR0ZWQ6IG51bWJlcjtcblx0Y3JlYXRlUHVsbFJlcXVlc3Q6IG51bWJlcjtcblx0Y3JlYXRlRHJhZnRQdWxsUmVxdWVzdDogbnVtYmVyO1xuXHR1cGRhdGVQdWxsUmVxdWVzdDogbnVtYmVyO1xuXHRtZXJnZVB1bGxSZXF1ZXN0OiBudW1iZXI7XG5cdGNoZWNrb3V0UHVsbFJlcXVlc3Q6IG51bWJlcjtcblx0aW5pdGlhbGl6ZVJlcG9zaXRvcnk6IG51bWJlcjtcblx0Y29tbWl0OiBudW1iZXI7XG5cdGNvbW1pdEFuZFN5bmM6IG51bWJlcjtcblx0c2Vzc2lvblJlc3RvcmVkOiBudW1iZXI7XG5cdHN0aWNraW5lc3NUb2dnbGVkOiBudW1iZXI7XG5cdG1heGltaXplVG9nZ2xlZDogbnVtYmVyO1xuXHRjaGF0RGVsZXRlZDogbnVtYmVyO1xuXHRjaGF0UmVuYW1lZDogbnVtYmVyO1xuXHRzZXNzaW9uUmVuYW1lZDogbnVtYmVyO1xuXHRmaXhDSUNoZWNrczogbnVtYmVyO1xuXHR0YXNrUnVuOiBudW1iZXI7XG5cblx0Ly8gRW5kIHN0YXRlIChyZWZyZXNoZWQgb24gZXZlcnkgaW50ZXJhY3Rpb24pXG5cdGZpbGVzQ2hhbmdlZDogbnVtYmVyO1xuXHRsaW5lc0FkZGVkOiBudW1iZXI7XG5cdGxpbmVzRGVsZXRlZDogbnVtYmVyO1xufVxuXG4vKipcbiAqIEZsYXQgc3VtbWFyeSBwcm9kdWNlZCBieSB7QGxpbmsgU2Vzc2lvbnNMaWZlY3ljbGVUcmFja2VyLmZpbmFsaXplfS4gVGhlXG4gKiBzaGFwZSBtYXRjaGVzIHRoZSBmaWVsZHMgb2YgdGhlIGBhZ2VudHMvc2Vzc2lvblN1bW1hcnlgIHRlbGVtZXRyeSBldmVudFxuICogZGVjbGFyZWQgaW4gYHNlc3Npb25zVGVsZW1ldHJ5LmNvbnRyaWJ1dGlvbi50c2AuXG4gKi9cbmV4cG9ydCBpbnRlcmZhY2UgSVNlc3Npb25MaWZlY3ljbGVTdW1tYXJ5IHtcblx0YWdlbnRTZXNzaW9uSWQ6IHN0cmluZztcblx0cHJvdmlkZXJJZDogc3RyaW5nO1xuXHRwcm92aWRlclR5cGU6IHN0cmluZztcblx0aXNvbGF0aW9uS2luZDogJ3dvcmt0cmVlJyB8ICdmb2xkZXInO1xuXHR3b3Jrc3BhY2VIYXNoOiBzdHJpbmc7XG5cdGhhc0dpdFJlcG9zaXRvcnk6IGJvb2xlYW47XG5cdGlzVmlydHVhbFdvcmtzcGFjZTogYm9vbGVhbjtcblx0aXNNdWx0aVJvb3Q6IGJvb2xlYW47XG5cdGZvbGRlckNvdW50OiBudW1iZXI7XG5cdGdpdEZvbGRlckNvdW50OiBudW1iZXI7XG5cdG5vbkdpdEZvbGRlckNvdW50OiBudW1iZXI7XG5cdGRvbmVSZWFzb246IFNlc3Npb25Eb25lUmVhc29uO1xuXHRmaXJzdFJlcXVlc3RTZW50SW5UaGlzQ2xpZW50OiBib29sZWFuO1xuXHRoYXNXb3JrdHJlZUNyZWF0ZWRUYXNrOiBib29sZWFuIHwgdW5kZWZpbmVkO1xuXHRjb25maWd1cmVkVGFza3NDb3VudDogbnVtYmVyIHwgdW5kZWZpbmVkO1xuXHR0aW1lU2luY2VGaXJzdE9ic2VydmVkTXM6IG51bWJlcjtcblx0dGltZVNpbmNlRmlyc3RSZXF1ZXN0TXM6IG51bWJlcjtcblx0YXBwTGF1bmNoZXNTaW5jZUZpcnN0T2JzZXJ2ZWQ6IG51bWJlcjtcblx0cmVxdWVzdHNTZW50OiBudW1iZXI7XG5cdGNoYXRDb3VudDogbnVtYmVyO1xuXHRmZWVkYmFja0FkZGVkOiBudW1iZXI7XG5cdGZlZWRiYWNrQ29udmVydGVkOiBudW1iZXI7XG5cdGZlZWRiYWNrUmVwbHlBZGRlZDogbnVtYmVyO1xuXHRmZWVkYmFja1N1Ym1pdHRlZDogbnVtYmVyO1xuXHRjcmVhdGVQdWxsUmVxdWVzdDogbnVtYmVyO1xuXHRjcmVhdGVEcmFmdFB1bGxSZXF1ZXN0OiBudW1iZXI7XG5cdHVwZGF0ZVB1bGxSZXF1ZXN0OiBudW1iZXI7XG5cdG1lcmdlUHVsbFJlcXVlc3Q6IG51bWJlcjtcblx0Y2hlY2tvdXRQdWxsUmVxdWVzdDogbnVtYmVyO1xuXHRpbml0aWFsaXplUmVwb3NpdG9yeTogbnVtYmVyO1xuXHRjb21taXQ6IG51bWJlcjtcblx0Y29tbWl0QW5kU3luYzogbnVtYmVyO1xuXHRzZXNzaW9uUmVzdG9yZWQ6IG51bWJlcjtcblx0c3RpY2tpbmVzc1RvZ2dsZWQ6IG51bWJlcjtcblx0bWF4aW1pemVUb2dnbGVkOiBudW1iZXI7XG5cdGNoYXREZWxldGVkOiBudW1iZXI7XG5cdGNoYXRSZW5hbWVkOiBudW1iZXI7XG5cdHNlc3Npb25SZW5hbWVkOiBudW1iZXI7XG5cdGZpeENJQ2hlY2tzOiBudW1iZXI7XG5cdHRhc2tSdW46IG51bWJlcjtcblx0ZmlsZXNDaGFuZ2VkOiBudW1iZXI7XG5cdGxpbmVzQWRkZWQ6IG51bWJlcjtcblx0bGluZXNEZWxldGVkOiBudW1iZXI7XG5cdHVzZXJTZXNzaW9uc1RvdGFsOiBudW1iZXI7XG5cdHVzZXJTZXNzaW9uc0luV29ya3NwYWNlOiBudW1iZXI7XG5cdHVzZXJTZXNzaW9uc0ZvclByb3ZpZGVyOiBudW1iZXI7XG59XG5cbi8qKlxuICogVHJhY2tzIHBlci1zZXNzaW9uIGxpZmVjeWNsZSBzdGF0cyBmb3IgdGhlIGBhZ2VudHMvc2Vzc2lvblN1bW1hcnlgIHRlbGVtZXRyeVxuICogZXZlbnQuIFRyYWNraW5nIHN0YXJ0cyB0aGUgZmlyc3QgdGltZSB0aGUgdXNlciBpbnRlcmFjdHMgd2l0aCBhIHNlc3Npb24gaW5cbiAqIHRoaXMgY2xpZW50IChzZW5kaW5nIGEgcmVxdWVzdCwgcnVubmluZyBhIHNlc3Npb24tc2NvcGVkIGNvbW1hbmQsIGFkZGluZ1xuICogZmVlZGJhY2ssIFx1MjAyNikgYW5kIGVuZHMgd2hlbiB0aGUgc2Vzc2lvbiBpcyBjb25zaWRlcmVkIGRvbmUgXHUyMDE0IGxvY2FsbHlcbiAqIGFyY2hpdmVkL2RlbGV0ZWQgb3Igb2JzZXJ2ZWQgYXMgYXJjaGl2ZWQvZGVsZXRlZCB2aWEgdGhlIHByb3ZpZGVyIChpLmUuLFxuICogdGhlIHVzZXIgZmluaXNoZWQgaXQgaW4gYSBkaWZmZXJlbnQgY2xpZW50KS5cbiAqXG4gKiBTdGF0ZSBpcyBwZXJzaXN0ZWQgaW4gYXBwbGljYXRpb24tc2NvcGVkIHN0b3JhZ2Ugc28gYSBzZXNzaW9uIG9wZW5lZCB0b2RheVxuICogYW5kIGFyY2hpdmVkIG5leHQgd2VlayBcdTIwMTQgcG9zc2libHkgYWNyb3NzIG1hbnkgYXBwIGxhdW5jaGVzIGFuZCBpbiBhXG4gKiBkaWZmZXJlbnQgd29ya3NwYWNlIFx1MjAxNCBzdGlsbCBwcm9kdWNlcyBhIHNpbmdsZSBzdW1tYXJ5IGV2ZW50IGNvdmVyaW5nIHRoZVxuICogZW50aXJlIGxpZmV0aW1lLlxuICovXG5leHBvcnQgY2xhc3MgU2Vzc2lvbnNMaWZlY3ljbGVUcmFja2VyIGV4dGVuZHMgRGlzcG9zYWJsZSB7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfYXBwTGF1bmNoQ291bnQ6IG51bWJlcjtcblx0cHJpdmF0ZSByZWFkb25seSBfc3RhdHM6IE1hcDxzdHJpbmcsIElTdG9yZWRTZXNzaW9uU3RhdHM+O1xuXG5cdGNvbnN0cnVjdG9yKHByaXZhdGUgcmVhZG9ubHkgX3N0b3JhZ2VTZXJ2aWNlOiBJU3RvcmFnZVNlcnZpY2UpIHtcblx0XHRzdXBlcigpO1xuXG5cdFx0Y29uc3QgcHJldmlvdXNBcHBMYXVuY2hlcyA9IHRoaXMuX3N0b3JhZ2VTZXJ2aWNlLmdldE51bWJlcihBUFBfTEFVTkNIX0NPVU5UX0tFWSwgU3RvcmFnZVNjb3BlLkFQUExJQ0FUSU9OLCAwKTtcblx0XHR0aGlzLl9hcHBMYXVuY2hDb3VudCA9IHByZXZpb3VzQXBwTGF1bmNoZXMgKyAxO1xuXHRcdHRoaXMuX3N0b3JhZ2VTZXJ2aWNlLnN0b3JlKEFQUF9MQVVOQ0hfQ09VTlRfS0VZLCB0aGlzLl9hcHBMYXVuY2hDb3VudCwgU3RvcmFnZVNjb3BlLkFQUExJQ0FUSU9OLCBTdG9yYWdlVGFyZ2V0Lk1BQ0hJTkUpO1xuXG5cdFx0dGhpcy5fc3RhdHMgPSB0aGlzLl9sb2FkKCk7XG5cdH1cblxuXHQvKiogUmVjb3JkIGEgcmVxdWVzdCB0aGF0IGNyZWF0ZXMgYSBuZXcgY2hhdCBmb3IgdGhlIGdpdmVuIHNlc3Npb24uIEJ1bXBzIGJvdGggYHJlcXVlc3RzU2VudGAgYW5kIGBjaGF0Q291bnRgLiAqL1xuXHRyZWNvcmROZXdDaGF0UmVxdWVzdFNlbnQoc2Vzc2lvbjogSVNlc3Npb24pOiB2b2lkIHtcblx0XHR0aGlzLl9yZWNvcmRSZXF1ZXN0U2VudChzZXNzaW9uLCAvKiBpc05ld0NoYXQgKi8gdHJ1ZSk7XG5cdH1cblxuXHQvKiogUmVjb3JkIGEgZm9sbG93LXVwIHJlcXVlc3Qgd2l0aGluIGFuIGV4aXN0aW5nIGNoYXQuIEJ1bXBzIGByZXF1ZXN0c1NlbnRgIGJ1dCBub3QgYGNoYXRDb3VudGAuICovXG5cdHJlY29yZFJlcXVlc3RTZW50KHNlc3Npb246IElTZXNzaW9uKTogdm9pZCB7XG5cdFx0dGhpcy5fcmVjb3JkUmVxdWVzdFNlbnQoc2Vzc2lvbiwgLyogaXNOZXdDaGF0ICovIGZhbHNlKTtcblx0fVxuXG5cdHByaXZhdGUgX3JlY29yZFJlcXVlc3RTZW50KHNlc3Npb246IElTZXNzaW9uLCBpc05ld0NoYXQ6IGJvb2xlYW4pOiB2b2lkIHtcblx0XHRjb25zdCBlbnRyeSA9IHRoaXMuX2Vuc3VyZShzZXNzaW9uKTtcblx0XHRlbnRyeS5yZXF1ZXN0c1NlbnQrKztcblx0XHRpZiAoaXNOZXdDaGF0KSB7XG5cdFx0XHRlbnRyeS5jaGF0Q291bnQrKztcblx0XHR9XG5cdFx0aWYgKGVudHJ5LmZpcnN0UmVxdWVzdFNlbnRBdCA9PT0gMCkge1xuXHRcdFx0ZW50cnkuZmlyc3RSZXF1ZXN0U2VudEF0ID0gRGF0ZS5ub3coKTtcblx0XHRcdGVudHJ5LmZpcnN0UmVxdWVzdFNlbnRJblRoaXNDbGllbnQgPSB0cnVlO1xuXHRcdH1cblx0XHR0aGlzLl91cGRhdGVDaGFuZ2VzU3VtbWFyeShlbnRyeSwgc2Vzc2lvbik7XG5cdFx0dGhpcy5fc2F2ZSgpO1xuXHR9XG5cblx0LyoqXG5cdCAqIFJlY29yZHMgdGFzay1yZWxhdGVkIHN0YXRlIG9ic2VydmVkIGF0IHRoZSB0aW1lIG9mIHRoZSBmaXJzdCB1c2VyXG5cdCAqIHJlcXVlc3QgZm9yIHRoZSBnaXZlbiBzZXNzaW9uLiBPbmx5IHRoZSBmaXJzdCBjYWxsIHBlciB0cmFja2VkIHNlc3Npb25cblx0ICogaGFzIGFuIGVmZmVjdDsgc3Vic2VxdWVudCBjYWxscyBhcmUgaWdub3JlZC5cblx0ICovXG5cdHJlY29yZEZpcnN0UmVxdWVzdFRhc2tJbmZvKHNlc3Npb246IElTZXNzaW9uLCBpbmZvOiB7IHJlYWRvbmx5IGhhc1dvcmt0cmVlQ3JlYXRlZFRhc2s6IGJvb2xlYW47IHJlYWRvbmx5IGNvbmZpZ3VyZWRUYXNrc0NvdW50OiBudW1iZXIgfSk6IHZvaWQge1xuXHRcdGNvbnN0IGVudHJ5ID0gdGhpcy5fc3RhdHMuZ2V0KHNlc3Npb24uc2Vzc2lvbklkKTtcblx0XHRpZiAoIWVudHJ5IHx8IGVudHJ5Lmhhc1dvcmt0cmVlQ3JlYXRlZFRhc2sgIT09IHVuZGVmaW5lZCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRlbnRyeS5oYXNXb3JrdHJlZUNyZWF0ZWRUYXNrID0gaW5mby5oYXNXb3JrdHJlZUNyZWF0ZWRUYXNrO1xuXHRcdGVudHJ5LmNvbmZpZ3VyZWRUYXNrc0NvdW50ID0gaW5mby5jb25maWd1cmVkVGFza3NDb3VudDtcblx0XHR0aGlzLl9zYXZlKCk7XG5cdH1cblxuXHQvKiogSW5jcmVtZW50IGEgbmFtZWQgY291bnRlci4gQ3JlYXRlcyBhIHRyYWNraW5nIGVudHJ5IGlmIHRoZSBzZXNzaW9uIGlzIG5vdCB5ZXQgdHJhY2tlZC4gKi9cblx0YnVtcENvdW50ZXIoc2Vzc2lvbjogSVNlc3Npb24sIGtleTogU2Vzc2lvbkxpZmVjeWNsZUNvdW50ZXJLZXkpOiB2b2lkIHtcblx0XHRjb25zdCBlbnRyeSA9IHRoaXMuX2Vuc3VyZShzZXNzaW9uKTtcblx0XHRlbnRyeVtrZXldKys7XG5cdFx0dGhpcy5fdXBkYXRlQ2hhbmdlc1N1bW1hcnkoZW50cnksIHNlc3Npb24pO1xuXHRcdHRoaXMuX3NhdmUoKTtcblx0fVxuXG5cdC8qKiBSZWZyZXNoIG9ic2VydmVkIGNoYW5nZSBzdW1tYXJ5IGZvciBhIHRyYWNrZWQgc2Vzc2lvbi4gTm8tb3Agd2hlbiBub3QgdHJhY2tlZC4gKi9cblx0dXBkYXRlU2Vzc2lvblN0YXRlKHNlc3Npb246IElTZXNzaW9uKTogdm9pZCB7XG5cdFx0Y29uc3QgZW50cnkgPSB0aGlzLl9zdGF0cy5nZXQoc2Vzc2lvbi5zZXNzaW9uSWQpO1xuXHRcdGlmICghZW50cnkpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0dGhpcy5fdXBkYXRlQ2hhbmdlc1N1bW1hcnkoZW50cnksIHNlc3Npb24pO1xuXHRcdHRoaXMuX3NhdmUoKTtcblx0fVxuXG5cdC8qKlxuXHQgKiBJbmNyZW1lbnRzIHRoZSBwZXJzaXN0ZWQgdXNlci1yZXF1ZXN0IGNvdW50ZXJzICh0b3RhbCwgcGVyLXdvcmtzcGFjZSxcblx0ICogcGVyLXByb3ZpZGVyKSBhbmQgcmV0dXJucyB0aGUgbmV3IHZhbHVlcy4gU2hvdWxkIGJlIGNhbGxlZCBvbmNlIHBlclxuXHQgKiBicmFuZC1uZXcgc2Vzc2lvbiB0aGUgdXNlciBzdGFydHMgZnJvbSB0aGUgQWdlbnRzIHdpbmRvdy5cblx0ICovXG5cdGluY3JlbWVudEFuZEdldFVzZXJSZXF1ZXN0Q291bnRlcnMoc2Vzc2lvbjogSVNlc3Npb24pOiBJVXNlclJlcXVlc3RDb3VudGVycyB7XG5cdFx0Y29uc3QgcHJvdmlkZXJJZCA9IGdldFNlc3Npb25zVGVsZW1ldHJ5UHJvdmlkZXJJZChzZXNzaW9uLnByb3ZpZGVySWQpO1xuXHRcdGNvbnN0IHdvcmtzcGFjZVVyaSA9IHNlc3Npb24ud29ya3NwYWNlLmdldCgpPy51cmkudG9TdHJpbmcoKTtcblxuXHRcdGNvbnN0IHVzZXJTZXNzaW9uc1RvdGFsID0gdGhpcy5fc3RvcmFnZVNlcnZpY2UuZ2V0TnVtYmVyKFRPVEFMX1NFU1NJT05TX0tFWSwgU3RvcmFnZVNjb3BlLkFQUExJQ0FUSU9OLCAwKSArIDE7XG5cdFx0dGhpcy5fc3RvcmFnZVNlcnZpY2Uuc3RvcmUoVE9UQUxfU0VTU0lPTlNfS0VZLCB1c2VyU2Vzc2lvbnNUb3RhbCwgU3RvcmFnZVNjb3BlLkFQUExJQ0FUSU9OLCBTdG9yYWdlVGFyZ2V0Lk1BQ0hJTkUpO1xuXG5cdFx0Y29uc3QgcHJvdmlkZXJDb3VudHMgPSB0aGlzLl9yZWFkUHJvdmlkZXJDb3VudGVyTWFwKCk7XG5cdFx0Y29uc3QgdXNlclNlc3Npb25zRm9yUHJvdmlkZXIgPSAocHJvdmlkZXJDb3VudHNbcHJvdmlkZXJJZF0gPz8gMCkgKyAxO1xuXHRcdHByb3ZpZGVyQ291bnRzW3Byb3ZpZGVySWRdID0gdXNlclNlc3Npb25zRm9yUHJvdmlkZXI7XG5cdFx0dGhpcy5fc3RvcmFnZVNlcnZpY2Uuc3RvcmUoUFJPVklERVJfU0VTU0lPTlNfS0VZLCBKU09OLnN0cmluZ2lmeShwcm92aWRlckNvdW50cyksIFN0b3JhZ2VTY29wZS5BUFBMSUNBVElPTiwgU3RvcmFnZVRhcmdldC5NQUNISU5FKTtcblxuXHRcdGxldCB1c2VyU2Vzc2lvbnNJbldvcmtzcGFjZSA9IDA7XG5cdFx0aWYgKHdvcmtzcGFjZVVyaSkge1xuXHRcdFx0Y29uc3Qgd29ya3NwYWNlQ291bnRzID0gdGhpcy5fcmVhZENvdW50ZXJNYXAoV09SS1NQQUNFX1NFU1NJT05TX0tFWSk7XG5cdFx0XHR1c2VyU2Vzc2lvbnNJbldvcmtzcGFjZSA9ICh3b3Jrc3BhY2VDb3VudHNbd29ya3NwYWNlVXJpXSA/PyAwKSArIDE7XG5cdFx0XHR3b3Jrc3BhY2VDb3VudHNbd29ya3NwYWNlVXJpXSA9IHVzZXJTZXNzaW9uc0luV29ya3NwYWNlO1xuXHRcdFx0dGhpcy5fc3RvcmFnZVNlcnZpY2Uuc3RvcmUoV09SS1NQQUNFX1NFU1NJT05TX0tFWSwgSlNPTi5zdHJpbmdpZnkod29ya3NwYWNlQ291bnRzKSwgU3RvcmFnZVNjb3BlLkFQUExJQ0FUSU9OLCBTdG9yYWdlVGFyZ2V0Lk1BQ0hJTkUpO1xuXHRcdH1cblxuXHRcdHJldHVybiB7IHVzZXJTZXNzaW9uc1RvdGFsLCB1c2VyU2Vzc2lvbnNJbldvcmtzcGFjZSwgdXNlclNlc3Npb25zRm9yUHJvdmlkZXIgfTtcblx0fVxuXG5cdC8qKiBSZWFkcyB0aGUgcGVyc2lzdGVkIHVzZXItcmVxdWVzdCBjb3VudGVycyB3aXRob3V0IGluY3JlbWVudGluZyB0aGVtLiAqL1xuXHRnZXRVc2VyUmVxdWVzdENvdW50ZXJzKHNlc3Npb246IElTZXNzaW9uKTogSVVzZXJSZXF1ZXN0Q291bnRlcnMge1xuXHRcdHJldHVybiB0aGlzLl9yZWFkVXNlclJlcXVlc3RDb3VudGVycyhzZXNzaW9uLnByb3ZpZGVySWQsIHNlc3Npb24ud29ya3NwYWNlLmdldCgpPy51cmkudG9TdHJpbmcoKSk7XG5cdH1cblxuXHQvKiogV2hldGhlciB0aGUgZ2l2ZW4gc2Vzc2lvbiBpZCBoYXMgYSB0cmFja2luZyBlbnRyeS4gKi9cblx0aXNUcmFja2VkKHNlc3Npb25JZDogc3RyaW5nKTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuIHRoaXMuX3N0YXRzLmhhcyhzZXNzaW9uSWQpO1xuXHR9XG5cblx0LyoqIFNuYXBzaG90IG9mIHRyYWNrZWQgc2Vzc2lvbiBpZHMuICovXG5cdGdldFRyYWNrZWRJZHMoKTogc3RyaW5nW10ge1xuXHRcdHJldHVybiBbLi4udGhpcy5fc3RhdHMua2V5cygpXTtcblx0fVxuXG5cdC8qKiBTbmFwc2hvdCBvZiB0cmFja2VkIHNlc3Npb25zIGFzIGAoc2Vzc2lvbklkLCBwcm92aWRlcklkKWAgcGFpcnMuICovXG5cdGdldFRyYWNrZWRFbnRyaWVzKCk6IHJlYWRvbmx5IHsgcmVhZG9ubHkgc2Vzc2lvbklkOiBzdHJpbmc7IHJlYWRvbmx5IHByb3ZpZGVySWQ6IHN0cmluZyB9W10ge1xuXHRcdGNvbnN0IHJlc3VsdDogeyBzZXNzaW9uSWQ6IHN0cmluZzsgcHJvdmlkZXJJZDogc3RyaW5nIH1bXSA9IFtdO1xuXHRcdGZvciAoY29uc3QgW3Nlc3Npb25JZCwgZW50cnldIG9mIHRoaXMuX3N0YXRzKSB7XG5cdFx0XHRyZXN1bHQucHVzaCh7IHNlc3Npb25JZCwgcHJvdmlkZXJJZDogZW50cnkucHJvdmlkZXJJZCB9KTtcblx0XHR9XG5cdFx0cmV0dXJuIHJlc3VsdDtcblx0fVxuXG5cdC8qKlxuXHQgKiBCdWlsZCBhIHN1bW1hcnkgZm9yIHRoZSBnaXZlbiB0cmFja2VkIHNlc3Npb24gYW5kIHJlbW92ZSBpdHMgZW50cnkuXG5cdCAqIFJldHVybnMgYHVuZGVmaW5lZGAgaWYgdGhlIHNlc3Npb24gd2FzIG5vdCB0cmFja2VkIChlLmcuLCBhbHJlYWR5XG5cdCAqIGZpbmFsaXplZCBieSBhIGNvbXBldGluZyBldmVudCkuXG5cdCAqL1xuXHRmaW5hbGl6ZShzZXNzaW9uSWQ6IHN0cmluZywgcmVhc29uOiBTZXNzaW9uRG9uZVJlYXNvbiwgZmluYWxTZXNzaW9uPzogSVNlc3Npb24pOiBJU2Vzc2lvbkxpZmVjeWNsZVN1bW1hcnkgfCB1bmRlZmluZWQge1xuXHRcdGNvbnN0IGVudHJ5ID0gdGhpcy5fc3RhdHMuZ2V0KHNlc3Npb25JZCk7XG5cdFx0aWYgKCFlbnRyeSkge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cdFx0aWYgKGZpbmFsU2Vzc2lvbikge1xuXHRcdFx0dGhpcy5fdXBkYXRlQ2hhbmdlc1N1bW1hcnkoZW50cnksIGZpbmFsU2Vzc2lvbik7XG5cdFx0fVxuXHRcdHRoaXMuX3N0YXRzLmRlbGV0ZShzZXNzaW9uSWQpO1xuXHRcdHRoaXMuX3NhdmUoKTtcblx0XHRyZXR1cm4gYnVpbGRTdW1tYXJ5KHNlc3Npb25JZCwgZW50cnksIHJlYXNvbiwgdGhpcy5fYXBwTGF1bmNoQ291bnQsIHRoaXMuX3JlYWRVc2VyUmVxdWVzdENvdW50ZXJzRm9yU3VtbWFyeShlbnRyeSkpO1xuXHR9XG5cblx0Ly8gLS0gaW50ZXJuYWxzIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cblxuXHRwcml2YXRlIF9yZWFkVXNlclJlcXVlc3RDb3VudGVyc0ZvclN1bW1hcnkoZW50cnk6IElTdG9yZWRTZXNzaW9uU3RhdHMpOiBJVXNlclJlcXVlc3RDb3VudGVycyB7XG5cdFx0cmV0dXJuIHRoaXMuX3JlYWRVc2VyUmVxdWVzdENvdW50ZXJzKGVudHJ5LnByb3ZpZGVySWQsIGVudHJ5LndvcmtzcGFjZVVyaVN0cmluZyB8fCB1bmRlZmluZWQpO1xuXHR9XG5cblx0cHJpdmF0ZSBfcmVhZFVzZXJSZXF1ZXN0Q291bnRlcnMocHJvdmlkZXJJZDogc3RyaW5nLCB3b3Jrc3BhY2VVcmk6IHN0cmluZyB8IHVuZGVmaW5lZCk6IElVc2VyUmVxdWVzdENvdW50ZXJzIHtcblx0XHRjb25zdCB1c2VyU2Vzc2lvbnNUb3RhbCA9IHRoaXMuX3N0b3JhZ2VTZXJ2aWNlLmdldE51bWJlcihUT1RBTF9TRVNTSU9OU19LRVksIFN0b3JhZ2VTY29wZS5BUFBMSUNBVElPTiwgMCk7XG5cdFx0Y29uc3QgcHJvdmlkZXJDb3VudHMgPSB0aGlzLl9yZWFkUHJvdmlkZXJDb3VudGVyTWFwKCk7XG5cdFx0Y29uc3QgdXNlclNlc3Npb25zRm9yUHJvdmlkZXIgPSBwcm92aWRlckNvdW50c1tnZXRTZXNzaW9uc1RlbGVtZXRyeVByb3ZpZGVySWQocHJvdmlkZXJJZCldID8/IDA7XG5cdFx0bGV0IHVzZXJTZXNzaW9uc0luV29ya3NwYWNlID0gMDtcblx0XHRpZiAod29ya3NwYWNlVXJpKSB7XG5cdFx0XHRjb25zdCB3b3Jrc3BhY2VDb3VudHMgPSB0aGlzLl9yZWFkQ291bnRlck1hcChXT1JLU1BBQ0VfU0VTU0lPTlNfS0VZKTtcblx0XHRcdHVzZXJTZXNzaW9uc0luV29ya3NwYWNlID0gd29ya3NwYWNlQ291bnRzW3dvcmtzcGFjZVVyaV0gPz8gMDtcblx0XHR9XG5cdFx0cmV0dXJuIHsgdXNlclNlc3Npb25zVG90YWwsIHVzZXJTZXNzaW9uc0luV29ya3NwYWNlLCB1c2VyU2Vzc2lvbnNGb3JQcm92aWRlciB9O1xuXHR9XG5cblx0cHJpdmF0ZSBfcmVhZFByb3ZpZGVyQ291bnRlck1hcCgpOiBSZWNvcmQ8c3RyaW5nLCBudW1iZXI+IHtcblx0XHRjb25zdCBzdG9yZWRDb3VudHMgPSB0aGlzLl9yZWFkQ291bnRlck1hcChQUk9WSURFUl9TRVNTSU9OU19LRVkpO1xuXHRcdGNvbnN0IHByb3ZpZGVyQ291bnRzOiBSZWNvcmQ8c3RyaW5nLCBudW1iZXI+ID0ge307XG5cdFx0Zm9yIChjb25zdCBbcHJvdmlkZXJJZCwgY291bnRdIG9mIE9iamVjdC5lbnRyaWVzKHN0b3JlZENvdW50cykpIHtcblx0XHRcdGNvbnN0IHRlbGVtZXRyeVByb3ZpZGVySWQgPSBnZXRTZXNzaW9uc1RlbGVtZXRyeVByb3ZpZGVySWQocHJvdmlkZXJJZCk7XG5cdFx0XHRwcm92aWRlckNvdW50c1t0ZWxlbWV0cnlQcm92aWRlcklkXSA9IChwcm92aWRlckNvdW50c1t0ZWxlbWV0cnlQcm92aWRlcklkXSA/PyAwKSArIGNvdW50O1xuXHRcdH1cblx0XHRyZXR1cm4gcHJvdmlkZXJDb3VudHM7XG5cdH1cblxuXHRwcml2YXRlIF9yZWFkQ291bnRlck1hcChrZXk6IHN0cmluZyk6IFJlY29yZDxzdHJpbmcsIG51bWJlcj4ge1xuXHRcdGNvbnN0IHJhdyA9IHRoaXMuX3N0b3JhZ2VTZXJ2aWNlLmdldChrZXksIFN0b3JhZ2VTY29wZS5BUFBMSUNBVElPTik7XG5cdFx0aWYgKCFyYXcpIHtcblx0XHRcdHJldHVybiB7fTtcblx0XHR9XG5cdFx0dHJ5IHtcblx0XHRcdGNvbnN0IHBhcnNlZCA9IEpTT04ucGFyc2UocmF3KTtcblx0XHRcdHJldHVybiAocGFyc2VkICYmIHR5cGVvZiBwYXJzZWQgPT09ICdvYmplY3QnKSA/IHBhcnNlZCBhcyBSZWNvcmQ8c3RyaW5nLCBudW1iZXI+IDoge307XG5cdFx0fSBjYXRjaCB7XG5cdFx0XHRyZXR1cm4ge307XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBfZW5zdXJlKHNlc3Npb246IElTZXNzaW9uKTogSVN0b3JlZFNlc3Npb25TdGF0cyB7XG5cdFx0Y29uc3QgaWQgPSBzZXNzaW9uLnNlc3Npb25JZDtcblx0XHRsZXQgZW50cnkgPSB0aGlzLl9zdGF0cy5nZXQoaWQpO1xuXHRcdGlmICghZW50cnkpIHtcblx0XHRcdGlmICh0aGlzLl9zdGF0cy5zaXplID49IE1BWF9UUkFDS0VEX1NFU1NJT05TKSB7XG5cdFx0XHRcdHRoaXMuX2V2aWN0T2xkZXN0KCk7XG5cdFx0XHR9XG5cdFx0XHRlbnRyeSA9IGNyZWF0ZUVudHJ5KHNlc3Npb24sIHRoaXMuX2FwcExhdW5jaENvdW50KTtcblx0XHRcdHRoaXMuX3N0YXRzLnNldChpZCwgZW50cnkpO1xuXHRcdH1cblx0XHRyZXR1cm4gZW50cnk7XG5cdH1cblxuXHRwcml2YXRlIF91cGRhdGVDaGFuZ2VzU3VtbWFyeShlbnRyeTogSVN0b3JlZFNlc3Npb25TdGF0cywgc2Vzc2lvbjogSVNlc3Npb24pOiB2b2lkIHtcblx0XHRjb25zdCBzdW1tYXJ5ID0gc2Vzc2lvbi5jaGFuZ2VzU3VtbWFyeT8uZ2V0KCk7XG5cdFx0aWYgKHN1bW1hcnkpIHtcblx0XHRcdGVudHJ5LmZpbGVzQ2hhbmdlZCA9IHN1bW1hcnkuZmlsZXM7XG5cdFx0XHRlbnRyeS5saW5lc0FkZGVkID0gc3VtbWFyeS5hZGRpdGlvbnM7XG5cdFx0XHRlbnRyeS5saW5lc0RlbGV0ZWQgPSBzdW1tYXJ5LmRlbGV0aW9ucztcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0bGV0IGZpbGVzID0gMDtcblx0XHRsZXQgYWRkaXRpb25zID0gMDtcblx0XHRsZXQgZGVsZXRpb25zID0gMDtcblx0XHRmb3IgKGNvbnN0IGNoYW5nZSBvZiBzZXNzaW9uLmNoYW5nZXMuZ2V0KCkpIHtcblx0XHRcdGZpbGVzKys7XG5cdFx0XHRhZGRpdGlvbnMgKz0gY2hhbmdlLmluc2VydGlvbnM7XG5cdFx0XHRkZWxldGlvbnMgKz0gY2hhbmdlLmRlbGV0aW9ucztcblx0XHR9XG5cdFx0ZW50cnkuZmlsZXNDaGFuZ2VkID0gZmlsZXM7XG5cdFx0ZW50cnkubGluZXNBZGRlZCA9IGFkZGl0aW9ucztcblx0XHRlbnRyeS5saW5lc0RlbGV0ZWQgPSBkZWxldGlvbnM7XG5cdH1cblxuXHRwcml2YXRlIF9ldmljdE9sZGVzdCgpOiB2b2lkIHtcblx0XHRsZXQgb2xkZXN0SWQ6IHN0cmluZyB8IHVuZGVmaW5lZDtcblx0XHRsZXQgb2xkZXN0VGltZSA9IE51bWJlci5QT1NJVElWRV9JTkZJTklUWTtcblx0XHRmb3IgKGNvbnN0IFtpZCwgZW50cnldIG9mIHRoaXMuX3N0YXRzKSB7XG5cdFx0XHRpZiAoZW50cnkuZmlyc3RPYnNlcnZlZEF0IDwgb2xkZXN0VGltZSkge1xuXHRcdFx0XHRvbGRlc3RUaW1lID0gZW50cnkuZmlyc3RPYnNlcnZlZEF0O1xuXHRcdFx0XHRvbGRlc3RJZCA9IGlkO1xuXHRcdFx0fVxuXHRcdH1cblx0XHRpZiAob2xkZXN0SWQgIT09IHVuZGVmaW5lZCkge1xuXHRcdFx0dGhpcy5fc3RhdHMuZGVsZXRlKG9sZGVzdElkKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIF9sb2FkKCk6IE1hcDxzdHJpbmcsIElTdG9yZWRTZXNzaW9uU3RhdHM+IHtcblx0XHRjb25zdCByYXcgPSB0aGlzLl9zdG9yYWdlU2VydmljZS5nZXQoU0VTU0lPTlNfS0VZLCBTdG9yYWdlU2NvcGUuQVBQTElDQVRJT04pO1xuXHRcdGNvbnN0IG1hcCA9IG5ldyBNYXA8c3RyaW5nLCBJU3RvcmVkU2Vzc2lvblN0YXRzPigpO1xuXHRcdGlmICghcmF3KSB7XG5cdFx0XHRyZXR1cm4gbWFwO1xuXHRcdH1cblx0XHR0cnkge1xuXHRcdFx0Y29uc3QgcGFyc2VkID0gSlNPTi5wYXJzZShyYXcpO1xuXHRcdFx0aWYgKHBhcnNlZCAmJiB0eXBlb2YgcGFyc2VkID09PSAnb2JqZWN0Jykge1xuXHRcdFx0XHRmb3IgKGNvbnN0IFtpZCwgdmFsdWVdIG9mIE9iamVjdC5lbnRyaWVzKHBhcnNlZCBhcyBSZWNvcmQ8c3RyaW5nLCB1bmtub3duPikpIHtcblx0XHRcdFx0XHRpZiAodmFsdWUgJiYgdHlwZW9mIHZhbHVlID09PSAnb2JqZWN0Jykge1xuXHRcdFx0XHRcdFx0bWFwLnNldChpZCwgdmFsdWUgYXMgSVN0b3JlZFNlc3Npb25TdGF0cyk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fSBjYXRjaCB7XG5cdFx0XHQvLyBJZ25vcmUgY29ycnVwdCBzdG9yYWdlOyBzdGFydCBmcmVzaC5cblx0XHR9XG5cdFx0cmV0dXJuIG1hcDtcblx0fVxuXG5cdHByaXZhdGUgX3NhdmUoKTogdm9pZCB7XG5cdFx0aWYgKHRoaXMuX3N0YXRzLnNpemUgPT09IDApIHtcblx0XHRcdHRoaXMuX3N0b3JhZ2VTZXJ2aWNlLnJlbW92ZShTRVNTSU9OU19LRVksIFN0b3JhZ2VTY29wZS5BUFBMSUNBVElPTik7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGNvbnN0IG9iajogUmVjb3JkPHN0cmluZywgSVN0b3JlZFNlc3Npb25TdGF0cz4gPSB7fTtcblx0XHRmb3IgKGNvbnN0IFtpZCwgZW50cnldIG9mIHRoaXMuX3N0YXRzKSB7XG5cdFx0XHRvYmpbaWRdID0gZW50cnk7XG5cdFx0fVxuXHRcdHRoaXMuX3N0b3JhZ2VTZXJ2aWNlLnN0b3JlKFNFU1NJT05TX0tFWSwgSlNPTi5zdHJpbmdpZnkob2JqKSwgU3RvcmFnZVNjb3BlLkFQUExJQ0FUSU9OLCBTdG9yYWdlVGFyZ2V0Lk1BQ0hJTkUpO1xuXHR9XG59XG5cbmZ1bmN0aW9uIGNyZWF0ZUVudHJ5KHNlc3Npb246IElTZXNzaW9uLCBhcHBMYXVuY2hDb3VudDogbnVtYmVyKTogSVN0b3JlZFNlc3Npb25TdGF0cyB7XG5cdGNvbnN0IHdvcmtzcGFjZSA9IHNlc3Npb24ud29ya3NwYWNlLmdldCgpO1xuXHRjb25zdCB3b3Jrc3BhY2VVcmlTdHJpbmcgPSB3b3Jrc3BhY2U/LnVyaS50b1N0cmluZygpID8/ICcnO1xuXHRjb25zdCBoYXNXb3JrdHJlZSA9IHdvcmtzcGFjZT8uZm9sZGVycy5zb21lKGZvbGRlciA9PiBmb2xkZXIuZ2l0UmVwb3NpdG9yeT8ud29ya1RyZWVVcmkgIT09IHVuZGVmaW5lZCkgPz8gZmFsc2U7XG5cdGNvbnN0IGhhc0dpdCA9IHdvcmtzcGFjZT8uZm9sZGVycy5zb21lKGZvbGRlciA9PiBmb2xkZXIuZ2l0UmVwb3NpdG9yeSAhPT0gdW5kZWZpbmVkKSA/PyBmYWxzZTtcblx0Y29uc3QgaXNWaXJ0dWFsID0gd29ya3NwYWNlID8gd29ya3NwYWNlLnVyaS5zY2hlbWUgIT09IFNjaGVtYXMuZmlsZSA6IGZhbHNlO1xuXHRjb25zdCBmb2xkZXJzID0gd29ya3NwYWNlPy5mb2xkZXJzID8/IFtdO1xuXHRjb25zdCB0b3BvbG9neSA9IGNsYXNzaWZ5U2Vzc2lvbldvcmtzcGFjZVRvcG9sb2d5KGZvbGRlcnMubGVuZ3RoLCBmb2xkZXJzLmZpbHRlcihmb2xkZXIgPT4gZm9sZGVyLmdpdFJlcG9zaXRvcnkgIT09IHVuZGVmaW5lZCkubGVuZ3RoKTtcblx0cmV0dXJuIHtcblx0XHRwcm92aWRlcklkOiBzZXNzaW9uLnByb3ZpZGVySWQsXG5cdFx0cHJvdmlkZXJUeXBlOiBzZXNzaW9uLnNlc3Npb25UeXBlLFxuXHRcdHNlc3Npb25SZXNvdXJjZVVyaTogc2Vzc2lvbi5yZXNvdXJjZS50b1N0cmluZygpLFxuXHRcdHdvcmtzcGFjZVVyaVN0cmluZyxcblx0XHRpc29sYXRpb25LaW5kOiBoYXNXb3JrdHJlZSA/ICd3b3JrdHJlZScgOiAnZm9sZGVyJyxcblx0XHRoYXNHaXRSZXBvc2l0b3J5OiBoYXNHaXQsXG5cdFx0aXNWaXJ0dWFsV29ya3NwYWNlOiBpc1ZpcnR1YWwsXG5cdFx0aXNNdWx0aVJvb3Q6IHRvcG9sb2d5LmlzTXVsdGlSb290LFxuXHRcdGZvbGRlckNvdW50OiB0b3BvbG9neS5mb2xkZXJDb3VudCxcblx0XHRnaXRGb2xkZXJDb3VudDogdG9wb2xvZ3kuZ2l0Rm9sZGVyQ291bnQsXG5cdFx0bm9uR2l0Rm9sZGVyQ291bnQ6IHRvcG9sb2d5Lm5vbkdpdEZvbGRlckNvdW50LFxuXHRcdGZpcnN0UmVxdWVzdFNlbnRJblRoaXNDbGllbnQ6IGZhbHNlLFxuXHRcdGhhc1dvcmt0cmVlQ3JlYXRlZFRhc2s6IHVuZGVmaW5lZCxcblx0XHRjb25maWd1cmVkVGFza3NDb3VudDogdW5kZWZpbmVkLFxuXHRcdGZpcnN0T2JzZXJ2ZWRBdDogRGF0ZS5ub3coKSxcblx0XHRmaXJzdFJlcXVlc3RTZW50QXQ6IDAsXG5cdFx0YXBwTGF1bmNoQ291bnRBdEZpcnN0T2JzZXJ2ZWQ6IGFwcExhdW5jaENvdW50LFxuXHRcdHJlcXVlc3RzU2VudDogMCxcblx0XHRjaGF0Q291bnQ6IDAsXG5cdFx0ZmVlZGJhY2tBZGRlZDogMCxcblx0XHRmZWVkYmFja0NvbnZlcnRlZDogMCxcblx0XHRmZWVkYmFja1JlcGx5QWRkZWQ6IDAsXG5cdFx0ZmVlZGJhY2tTdWJtaXR0ZWQ6IDAsXG5cdFx0Y3JlYXRlUHVsbFJlcXVlc3Q6IDAsXG5cdFx0Y3JlYXRlRHJhZnRQdWxsUmVxdWVzdDogMCxcblx0XHR1cGRhdGVQdWxsUmVxdWVzdDogMCxcblx0XHRtZXJnZVB1bGxSZXF1ZXN0OiAwLFxuXHRcdGNoZWNrb3V0UHVsbFJlcXVlc3Q6IDAsXG5cdFx0aW5pdGlhbGl6ZVJlcG9zaXRvcnk6IDAsXG5cdFx0Y29tbWl0OiAwLFxuXHRcdGNvbW1pdEFuZFN5bmM6IDAsXG5cdFx0c2Vzc2lvblJlc3RvcmVkOiAwLFxuXHRcdHN0aWNraW5lc3NUb2dnbGVkOiAwLFxuXHRcdG1heGltaXplVG9nZ2xlZDogMCxcblx0XHRjaGF0RGVsZXRlZDogMCxcblx0XHRjaGF0UmVuYW1lZDogMCxcblx0XHRzZXNzaW9uUmVuYW1lZDogMCxcblx0XHRmaXhDSUNoZWNrczogMCxcblx0XHR0YXNrUnVuOiAwLFxuXHRcdGZpbGVzQ2hhbmdlZDogMCxcblx0XHRsaW5lc0FkZGVkOiAwLFxuXHRcdGxpbmVzRGVsZXRlZDogMCxcblx0fTtcbn1cblxuZnVuY3Rpb24gYnVpbGRTdW1tYXJ5KHNlc3Npb25JZDogc3RyaW5nLCBlbnRyeTogSVN0b3JlZFNlc3Npb25TdGF0cywgcmVhc29uOiBTZXNzaW9uRG9uZVJlYXNvbiwgYXBwTGF1bmNoQ291bnQ6IG51bWJlciwgcmVxdWVzdENvdW50ZXJzOiBJVXNlclJlcXVlc3RDb3VudGVycyk6IElTZXNzaW9uTGlmZWN5Y2xlU3VtbWFyeSB7XG5cdGNvbnN0IG5vdyA9IERhdGUubm93KCk7XG5cdHJldHVybiB7XG5cdFx0YWdlbnRTZXNzaW9uSWQ6IGhhc2hTZXNzaW9uSWRGb3JUZWxlbWV0cnkoc2Vzc2lvbklkKSxcblx0XHRwcm92aWRlcklkOiBnZXRTZXNzaW9uc1RlbGVtZXRyeVByb3ZpZGVySWQoZW50cnkucHJvdmlkZXJJZCksXG5cdFx0cHJvdmlkZXJUeXBlOiBlbnRyeS5wcm92aWRlclR5cGUsXG5cdFx0aXNvbGF0aW9uS2luZDogZW50cnkuaXNvbGF0aW9uS2luZCxcblx0XHR3b3Jrc3BhY2VIYXNoOiBlbnRyeS53b3Jrc3BhY2VVcmlTdHJpbmcgPyBoYXNoKGVudHJ5LndvcmtzcGFjZVVyaVN0cmluZykudG9TdHJpbmcoMTYpIDogJycsXG5cdFx0aGFzR2l0UmVwb3NpdG9yeTogZW50cnkuaGFzR2l0UmVwb3NpdG9yeSxcblx0XHRpc1ZpcnR1YWxXb3Jrc3BhY2U6IGVudHJ5LmlzVmlydHVhbFdvcmtzcGFjZSxcblx0XHQvLyBCYWNrLWNvbXBhdDogZW50cmllcyBwZXJzaXN0ZWQgYmVmb3JlIHRoZXNlIGZpZWxkcyBleGlzdGVkIGRlZmF1bHQgdG8gMC9mYWxzZS5cblx0XHRpc011bHRpUm9vdDogZW50cnkuaXNNdWx0aVJvb3QgPz8gZmFsc2UsXG5cdFx0Zm9sZGVyQ291bnQ6IGVudHJ5LmZvbGRlckNvdW50ID8/IDAsXG5cdFx0Z2l0Rm9sZGVyQ291bnQ6IGVudHJ5LmdpdEZvbGRlckNvdW50ID8/IDAsXG5cdFx0bm9uR2l0Rm9sZGVyQ291bnQ6IGVudHJ5Lm5vbkdpdEZvbGRlckNvdW50ID8/IDAsXG5cdFx0ZG9uZVJlYXNvbjogcmVhc29uLFxuXHRcdGZpcnN0UmVxdWVzdFNlbnRJblRoaXNDbGllbnQ6IGVudHJ5LmZpcnN0UmVxdWVzdFNlbnRJblRoaXNDbGllbnQsXG5cdFx0aGFzV29ya3RyZWVDcmVhdGVkVGFzazogZW50cnkuaGFzV29ya3RyZWVDcmVhdGVkVGFzayxcblx0XHRjb25maWd1cmVkVGFza3NDb3VudDogZW50cnkuY29uZmlndXJlZFRhc2tzQ291bnQsXG5cdFx0dGltZVNpbmNlRmlyc3RPYnNlcnZlZE1zOiBub3cgLSBlbnRyeS5maXJzdE9ic2VydmVkQXQsXG5cdFx0dGltZVNpbmNlRmlyc3RSZXF1ZXN0TXM6IGVudHJ5LmZpcnN0UmVxdWVzdFNlbnRBdCA+IDAgPyAobm93IC0gZW50cnkuZmlyc3RSZXF1ZXN0U2VudEF0KSA6IC0xLFxuXHRcdGFwcExhdW5jaGVzU2luY2VGaXJzdE9ic2VydmVkOiBhcHBMYXVuY2hDb3VudCAtIGVudHJ5LmFwcExhdW5jaENvdW50QXRGaXJzdE9ic2VydmVkLFxuXHRcdHJlcXVlc3RzU2VudDogZW50cnkucmVxdWVzdHNTZW50LFxuXHRcdGNoYXRDb3VudDogZW50cnkuY2hhdENvdW50LFxuXHRcdGZlZWRiYWNrQWRkZWQ6IGVudHJ5LmZlZWRiYWNrQWRkZWQsXG5cdFx0ZmVlZGJhY2tDb252ZXJ0ZWQ6IGVudHJ5LmZlZWRiYWNrQ29udmVydGVkLFxuXHRcdGZlZWRiYWNrUmVwbHlBZGRlZDogZW50cnkuZmVlZGJhY2tSZXBseUFkZGVkLFxuXHRcdGZlZWRiYWNrU3VibWl0dGVkOiBlbnRyeS5mZWVkYmFja1N1Ym1pdHRlZCxcblx0XHRjcmVhdGVQdWxsUmVxdWVzdDogZW50cnkuY3JlYXRlUHVsbFJlcXVlc3QsXG5cdFx0Y3JlYXRlRHJhZnRQdWxsUmVxdWVzdDogZW50cnkuY3JlYXRlRHJhZnRQdWxsUmVxdWVzdCxcblx0XHR1cGRhdGVQdWxsUmVxdWVzdDogZW50cnkudXBkYXRlUHVsbFJlcXVlc3QsXG5cdFx0bWVyZ2VQdWxsUmVxdWVzdDogZW50cnkubWVyZ2VQdWxsUmVxdWVzdCxcblx0XHRjaGVja291dFB1bGxSZXF1ZXN0OiBlbnRyeS5jaGVja291dFB1bGxSZXF1ZXN0LFxuXHRcdGluaXRpYWxpemVSZXBvc2l0b3J5OiBlbnRyeS5pbml0aWFsaXplUmVwb3NpdG9yeSxcblx0XHRjb21taXQ6IGVudHJ5LmNvbW1pdCxcblx0XHRjb21taXRBbmRTeW5jOiBlbnRyeS5jb21taXRBbmRTeW5jLFxuXHRcdHNlc3Npb25SZXN0b3JlZDogZW50cnkuc2Vzc2lvblJlc3RvcmVkLFxuXHRcdHN0aWNraW5lc3NUb2dnbGVkOiBlbnRyeS5zdGlja2luZXNzVG9nZ2xlZCxcblx0XHRtYXhpbWl6ZVRvZ2dsZWQ6IGVudHJ5Lm1heGltaXplVG9nZ2xlZCxcblx0XHRjaGF0RGVsZXRlZDogZW50cnkuY2hhdERlbGV0ZWQsXG5cdFx0Y2hhdFJlbmFtZWQ6IGVudHJ5LmNoYXRSZW5hbWVkLFxuXHRcdHNlc3Npb25SZW5hbWVkOiBlbnRyeS5zZXNzaW9uUmVuYW1lZCxcblx0XHRmaXhDSUNoZWNrczogZW50cnkuZml4Q0lDaGVja3MsXG5cdFx0dGFza1J1bjogZW50cnkudGFza1J1bixcblx0XHRmaWxlc0NoYW5nZWQ6IGVudHJ5LmZpbGVzQ2hhbmdlZCxcblx0XHRsaW5lc0FkZGVkOiBlbnRyeS5saW5lc0FkZGVkLFxuXHRcdGxpbmVzRGVsZXRlZDogZW50cnkubGluZXNEZWxldGVkLFxuXHRcdHVzZXJTZXNzaW9uc1RvdGFsOiByZXF1ZXN0Q291bnRlcnMudXNlclNlc3Npb25zVG90YWwsXG5cdFx0dXNlclNlc3Npb25zSW5Xb3Jrc3BhY2U6IHJlcXVlc3RDb3VudGVycy51c2VyU2Vzc2lvbnNJbldvcmtzcGFjZSxcblx0XHR1c2VyU2Vzc2lvbnNGb3JQcm92aWRlcjogcmVxdWVzdENvdW50ZXJzLnVzZXJTZXNz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
