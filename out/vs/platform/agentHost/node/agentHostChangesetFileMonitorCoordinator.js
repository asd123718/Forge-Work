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
import { SequencerByKey } from "../../../base/common/async.js";
import { Disposable, DisposableMap, ReferenceCollection } from "../../../base/common/lifecycle.js";
import { URI } from "../../../base/common/uri.js";
import { buildBranchChangesetUri, buildSessionChangesetUri, buildUncommittedChangesetUri } from "../common/changesetUri.js";
import { parseSubagentSessionUri } from "../common/state/sessionState.js";
import { DEFAULT_AGENT_HOST_WATCH_EXCLUDES, IAgentHostFileMonitorService } from "./agentHostFileMonitorService.js";
import { IAgentHostGitService } from "../common/agentHostGitService.js";
import { resolveSessionRepositories } from "./agentHostSessionRepositories.js";
import { IAgentHostStateManager } from "./agentHostStateManager.js";
import { getEffectiveWorkingDirectories, getEffectiveWorkingDirectory } from "./agentConfigurationService.js";
import { ILogService } from "../../log/common/log.js";
import { IAgentHostGitStateService } from "../common/agentHostGitStateService.js";
class WatchInterestReferenceCollection extends ReferenceCollection {
  constructor(_create, _destroy) {
    super();
    this._create = _create;
    this._destroy = _destroy;
  }
  createReferencedObject(sessionStr) {
    this._create(sessionStr);
    return sessionStr;
  }
  destroyReferencedObject(sessionStr) {
    this._destroy(sessionStr);
  }
}
let ChangesetFileMonitorCoordinator = class extends Disposable {
  constructor(_stateManager, _fileMonitorService, _gitService, _gitStateService, _logService) {
    super();
    this._stateManager = _stateManager;
    this._fileMonitorService = _fileMonitorService;
    this._gitService = _gitService;
    this._gitStateService = _gitStateService;
    this._logService = _logService;
    /** Per-subscription references into the per-session watch-interest collection. */
    this._watchInterestReferences = this._register(new DisposableMap());
    this._watchInterestCollection = new WatchInterestReferenceCollection(
      (sessionStr) => this._attachWatcherIfPossible(sessionStr),
      (sessionStr) => this._destroyWatchInterest(sessionStr)
    );
    /** Sessions waiting for materialization before a root watcher can attach. */
    this._pendingWatchInterest = /* @__PURE__ */ new Set();
    /** Session URI string to a stable signature of the working-directory set that produced the current root attachments. */
    this._sessionWorkingDirectories = /* @__PURE__ */ new Map();
    /** Session URI string to the set of repository-root URI strings it is watching. */
    this._sessionRoots = /* @__PURE__ */ new Map();
    /** Repository-root URI string to sessions currently fanned out from that root. */
    this._rootSessions = /* @__PURE__ */ new Map();
    /** Repository-root URI string to the shared monitor acquisition. */
    this._rootWatchAcquisitions = this._register(new DisposableMap());
    /** Repository-root URI string to the canonical repository root URI. */
    this._rootUris = /* @__PURE__ */ new Map();
    /** Active session URI string to repository-root URI string. */
    this._activeSessionRoots = /* @__PURE__ */ new Map();
    /** Repository-root URI string to sessions currently active against that root. */
    this._rootActiveSessions = /* @__PURE__ */ new Map();
    /** Active sessions whose repository root cannot yet be resolved. */
    this._unresolvedActiveSessions = /* @__PURE__ */ new Set();
    this._watchAttachmentSequencer = new SequencerByKey();
    this._activeTurnSequencer = new SequencerByKey();
  }
  trackSessionChanges(subscriptionKey, sessionStr) {
    if (!this._watchInterestReferences.has(subscriptionKey)) {
      this._watchInterestReferences.set(subscriptionKey, this._watchInterestCollection.acquire(sessionStr));
    }
  }
  untrackSessionChanges(subscriptionKey) {
    this._watchInterestReferences.deleteAndDispose(subscriptionKey);
  }
  onSessionRestored(sessionStr) {
    this._retryWatchAttachment(sessionStr);
  }
  onSessionMaterialized(sessionStr) {
    this._retryWatchAttachment(sessionStr);
  }
  /**
   * Re-attach a session's root watchers when its effective working-directory
   * set changes (a folder added or removed, e.g. in the Editor Window). The
   * signature guard in `_attachWatcherIfPossible` makes an unchanged set a
   * no-op, so this is cheap; an active (mid-turn) session is instead re-attached
   * by the turn lifecycle on turn end.
   */
  onSessionWorkingDirectoriesChanged(sessionStr) {
    this._retryWatchAttachment(sessionStr);
  }
  onSessionDisposed(sessionStr) {
    this.untrackSessionChanges(buildUncommittedChangesetUri(sessionStr));
    this.untrackSessionChanges(buildSessionChangesetUri(sessionStr));
    this.untrackSessionChanges(buildBranchChangesetUri(sessionStr));
    this.untrackSessionChanges(sessionStr);
    this._removeActiveSession(sessionStr);
    this._destroyWatchInterest(sessionStr);
  }
  onSessionTurnActiveChanged(sessionStr, active) {
    this._activeTurnSequencer.queue(sessionStr, async () => {
      if (active) {
        await this._markSessionActive(sessionStr);
      } else {
        this._markSessionInactive(sessionStr);
      }
    });
  }
  _destroyWatchInterest(sessionStr) {
    this._pendingWatchInterest.delete(sessionStr);
    this._releaseSessionRoots(sessionStr);
  }
  _retryWatchAttachment(sessionStr) {
    if (this._shouldAttachSession(sessionStr) || this._pendingWatchInterest.has(sessionStr)) {
      this._attachWatcherIfPossible(sessionStr);
    }
  }
  _hasWatchInterest(sessionStr) {
    return this._watchInterestReferences.has(sessionStr) || this._watchInterestReferences.has(buildBranchChangesetUri(sessionStr)) || this._watchInterestReferences.has(buildUncommittedChangesetUri(sessionStr)) || this._watchInterestReferences.has(buildSessionChangesetUri(sessionStr));
  }
  _attachWatcherIfPossible(sessionStr) {
    this._watchAttachmentSequencer.queue(sessionStr, async () => {
      if (!this._shouldAttachSession(sessionStr)) {
        return;
      }
      const workingDirectories = getEffectiveWorkingDirectories(this._stateManager, sessionStr);
      if (!workingDirectories || workingDirectories.length === 0) {
        this._pendingWatchInterest.add(sessionStr);
        this._releaseSessionRoots(sessionStr);
        return;
      }
      const workingDirectoryUris = [];
      for (const workingDirectory of workingDirectories) {
        try {
          workingDirectoryUris.push(URI.parse(workingDirectory));
        } catch (err) {
          this._logService.warn(`[ChangesetFileMonitorCoordinator] Failed to parse working directory URI for ${sessionStr}: ${workingDirectory}`, err);
        }
      }
      if (workingDirectoryUris.length === 0) {
        this._pendingWatchInterest.add(sessionStr);
        this._releaseSessionRoots(sessionStr);
        return;
      }
      const signature = this._workingDirectoriesSignature(workingDirectories);
      if (this._sessionRoots.has(sessionStr) && this._sessionWorkingDirectories.get(sessionStr) === signature) {
        this._pendingWatchInterest.delete(sessionStr);
        return;
      }
      const { gitRepositories } = await resolveSessionRepositories(workingDirectoryUris, this._gitService);
      if (!this._shouldAttachSession(sessionStr)) {
        return;
      }
      if (gitRepositories.length === 0) {
        this._pendingWatchInterest.delete(sessionStr);
        this._releaseSessionRoots(sessionStr);
        return;
      }
      this._pendingWatchInterest.delete(sessionStr);
      this._attachSessionToRoots(sessionStr, gitRepositories, signature);
    });
  }
  _attachSessionToRoots(sessionStr, repositoryRoots, signature) {
    const desiredRoots = /* @__PURE__ */ new Map();
    for (const repositoryRoot of repositoryRoots) {
      desiredRoots.set(repositoryRoot.toString(), repositoryRoot);
    }
    const current = this._sessionRoots.get(sessionStr);
    if (current) {
      for (const rootStr of [...current]) {
        if (!desiredRoots.has(rootStr)) {
          current.delete(rootStr);
          this._detachRootSession(sessionStr, rootStr);
        }
      }
    }
    let sessionRoots = this._sessionRoots.get(sessionStr);
    if (!sessionRoots) {
      sessionRoots = /* @__PURE__ */ new Set();
      this._sessionRoots.set(sessionStr, sessionRoots);
    }
    let allRootsWatched = true;
    for (const [rootStr, repositoryRoot] of desiredRoots) {
      let sessions = this._rootSessions.get(rootStr);
      if (!sessions) {
        sessions = /* @__PURE__ */ new Set();
        this._rootSessions.set(rootStr, sessions);
        this._rootUris.set(rootStr, repositoryRoot);
      }
      sessions.add(sessionStr);
      sessionRoots.add(rootStr);
      if (!this._ensureRootWatcher(rootStr, repositoryRoot)) {
        allRootsWatched = false;
      }
    }
    if (allRootsWatched) {
      this._sessionWorkingDirectories.set(sessionStr, signature);
    } else {
      this._sessionWorkingDirectories.delete(sessionStr);
    }
  }
  _releaseSessionRoots(sessionStr) {
    this._sessionWorkingDirectories.delete(sessionStr);
    const rootStrs = this._sessionRoots.get(sessionStr);
    if (!rootStrs) {
      return;
    }
    this._sessionRoots.delete(sessionStr);
    for (const rootStr of rootStrs) {
      this._detachRootSession(sessionStr, rootStr);
    }
  }
  /**
   * Removes a session from one repository root's fan-out set, disposing the
   * shared root watcher once the last referencing session drops it.
   */
  _detachRootSession(sessionStr, rootStr) {
    const sessions = this._rootSessions.get(rootStr);
    if (!sessions) {
      return;
    }
    sessions.delete(sessionStr);
    if (sessions.size === 0) {
      this._rootSessions.delete(rootStr);
      this._rootUris.delete(rootStr);
      this._rootWatchAcquisitions.deleteAndDispose(rootStr);
    }
  }
  _workingDirectoriesSignature(workingDirectories) {
    return workingDirectories.join("\0");
  }
  _onRootChanged(rootStr) {
    if (this._isRootActive(rootStr)) {
      return;
    }
    const sessions = this._rootSessions.get(rootStr);
    if (!sessions || sessions.size === 0) {
      return;
    }
    const sessionsToRefresh = [...sessions].filter((session) => {
      return this._hasWatchInterest(session) && !!this._sessionRoots.get(session)?.has(rootStr) && !this._activeSessionRoots.has(session) && !this._unresolvedActiveSessions.has(session) && !!this._stateManager.getSessionState(session);
    });
    if (sessionsToRefresh.length === 0) {
      return;
    }
    for (const session of sessionsToRefresh) {
      const primaryWorkingDirectory = getEffectiveWorkingDirectory(this._stateManager, session);
      if (!primaryWorkingDirectory) {
        continue;
      }
      let primaryWorkingDirectoryUri;
      try {
        primaryWorkingDirectoryUri = URI.parse(primaryWorkingDirectory);
      } catch (err) {
        this._logService.warn(`[ChangesetFileMonitorCoordinator] Failed to parse primary working directory URI for ${session}: ${primaryWorkingDirectory}`, err);
        continue;
      }
      void this._gitStateService.refreshSessionGitState(session, primaryWorkingDirectoryUri);
    }
  }
  _shouldAttachSession(sessionStr) {
    return this._hasWatchInterest(sessionStr) && !this._activeSessionRoots.has(sessionStr) && !this._unresolvedActiveSessions.has(sessionStr);
  }
  _isRootActive(rootStr) {
    return (this._rootActiveSessions.get(rootStr)?.size ?? 0) > 0;
  }
  /**
   * Ensures a shared watcher exists for a root. Returns false only when
   * acquisition failed (the caller retries that root later); an
   * already-watched or turn-suspended active root counts as handled.
   */
  _ensureRootWatcher(rootStr, repositoryRoot) {
    if (this._isRootActive(rootStr) || this._rootWatchAcquisitions.has(rootStr)) {
      return true;
    }
    const sessions = this._rootSessions.get(rootStr);
    if (!sessions || sessions.size === 0) {
      return true;
    }
    const rootWatchAcquisition = this._fileMonitorService.acquire(repositoryRoot, () => this._onRootChanged(rootStr), {
      excludes: DEFAULT_AGENT_HOST_WATCH_EXCLUDES,
      debounceMs: 750
    });
    if (!rootWatchAcquisition) {
      for (const session of sessions) {
        this._pendingWatchInterest.add(session);
      }
      return false;
    }
    this._rootWatchAcquisitions.set(rootStr, rootWatchAcquisition);
    return true;
  }
  _suspendRootWatcher(rootStr) {
    this._rootWatchAcquisitions.deleteAndDispose(rootStr);
  }
  async _markSessionActive(sessionStr) {
    this._removeActiveSession(sessionStr);
    this._pendingWatchInterest.delete(sessionStr);
    const repositoryRoot = await this._resolveActivityRepositoryRoot(sessionStr);
    if (!repositoryRoot) {
      this._unresolvedActiveSessions.add(sessionStr);
      this._releaseSessionRoots(sessionStr);
      return;
    }
    const rootStr = repositoryRoot.toString();
    let activeSessions = this._rootActiveSessions.get(rootStr);
    if (!activeSessions) {
      activeSessions = /* @__PURE__ */ new Set();
      this._rootActiveSessions.set(rootStr, activeSessions);
    }
    activeSessions.add(sessionStr);
    this._activeSessionRoots.set(sessionStr, rootStr);
    this._rootUris.set(rootStr, repositoryRoot);
    this._suspendRootWatcher(rootStr);
    this._releaseSessionRoots(sessionStr);
  }
  _markSessionInactive(sessionStr) {
    const rootStr = this._removeActiveSession(sessionStr);
    if (rootStr) {
      const repositoryRoot = this._rootUris.get(rootStr);
      if (repositoryRoot) {
        this._ensureRootWatcher(rootStr, repositoryRoot);
      }
    }
    if (this._hasWatchInterest(sessionStr) || this._pendingWatchInterest.has(sessionStr)) {
      this._attachWatcherIfPossible(sessionStr);
    }
  }
  _removeActiveSession(sessionStr) {
    this._unresolvedActiveSessions.delete(sessionStr);
    const rootStr = this._activeSessionRoots.get(sessionStr);
    if (!rootStr) {
      return void 0;
    }
    this._activeSessionRoots.delete(sessionStr);
    const activeSessions = this._rootActiveSessions.get(rootStr);
    if (activeSessions) {
      activeSessions.delete(sessionStr);
      if (activeSessions.size === 0) {
        this._rootActiveSessions.delete(rootStr);
      }
    }
    return rootStr;
  }
  async _resolveActivityRepositoryRoot(sessionStr) {
    const workingDirectory = this._getActivityWorkingDirectory(sessionStr);
    if (!workingDirectory) {
      return void 0;
    }
    let workingDirectoryUri;
    try {
      workingDirectoryUri = URI.parse(workingDirectory);
    } catch (err) {
      this._logService.warn(`[ChangesetFileMonitorCoordinator] Failed to parse active working directory URI for ${sessionStr}: ${workingDirectory}`, err);
      return void 0;
    }
    return this._gitService.getRepositoryRoot(workingDirectoryUri);
  }
  _getActivityWorkingDirectory(sessionStr) {
    const workingDirectory = getEffectiveWorkingDirectory(this._stateManager, sessionStr);
    if (workingDirectory) {
      return workingDirectory;
    }
    const parsedSubagent = parseSubagentSessionUri(sessionStr);
    if (!parsedSubagent) {
      return void 0;
    }
    return getEffectiveWorkingDirectory(this._stateManager, parsedSubagent.parentSession.toString());
  }
};
ChangesetFileMonitorCoordinator = __decorateClass([
  __decorateParam(0, IAgentHostStateManager),
  __decorateParam(1, IAgentHostFileMonitorService),
  __decorateParam(2, IAgentHostGitService),
  __decorateParam(3, IAgentHostGitStateService),
  __decorateParam(4, ILogService)
], ChangesetFileMonitorCoordinator);
export {
  ChangesetFileMonitorCoordinator
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxwbGF0Zm9ybVxcYWdlbnRIb3N0XFxub2RlXFxhZ2VudEhvc3RDaGFuZ2VzZXRGaWxlTW9uaXRvckNvb3JkaW5hdG9yLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IHsgU2VxdWVuY2VyQnlLZXkgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9hc3luYy5qcyc7XG5pbXBvcnQgeyBEaXNwb3NhYmxlLCBEaXNwb3NhYmxlTWFwLCBJUmVmZXJlbmNlLCBSZWZlcmVuY2VDb2xsZWN0aW9uIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IFVSSSB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL3VyaS5qcyc7XG5pbXBvcnQgeyBidWlsZEJyYW5jaENoYW5nZXNldFVyaSwgYnVpbGRTZXNzaW9uQ2hhbmdlc2V0VXJpLCBidWlsZFVuY29tbWl0dGVkQ2hhbmdlc2V0VXJpIH0gZnJvbSAnLi4vY29tbW9uL2NoYW5nZXNldFVyaS5qcyc7XG5pbXBvcnQgeyBwYXJzZVN1YmFnZW50U2Vzc2lvblVyaSB9IGZyb20gJy4uL2NvbW1vbi9zdGF0ZS9zZXNzaW9uU3RhdGUuanMnO1xuaW1wb3J0IHsgREVGQVVMVF9BR0VOVF9IT1NUX1dBVENIX0VYQ0xVREVTLCBJQWdlbnRIb3N0RmlsZU1vbml0b3JTZXJ2aWNlIH0gZnJvbSAnLi9hZ2VudEhvc3RGaWxlTW9uaXRvclNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSUFnZW50SG9zdEdpdFNlcnZpY2UgfSBmcm9tICcuLi9jb21tb24vYWdlbnRIb3N0R2l0U2VydmljZS5qcyc7XG5pbXBvcnQgeyByZXNvbHZlU2Vzc2lvblJlcG9zaXRvcmllcyB9IGZyb20gJy4vYWdlbnRIb3N0U2Vzc2lvblJlcG9zaXRvcmllcy5qcyc7XG5pbXBvcnQgeyBBZ2VudEhvc3RTdGF0ZU1hbmFnZXIsIElBZ2VudEhvc3RTdGF0ZU1hbmFnZXIgfSBmcm9tICcuL2FnZW50SG9zdFN0YXRlTWFuYWdlci5qcyc7XG5pbXBvcnQgeyBnZXRFZmZlY3RpdmVXb3JraW5nRGlyZWN0b3JpZXMsIGdldEVmZmVjdGl2ZVdvcmtpbmdEaXJlY3RvcnkgfSBmcm9tICcuL2FnZW50Q29uZmlndXJhdGlvblNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSUxvZ1NlcnZpY2UgfSBmcm9tICcuLi8uLi9sb2cvY29tbW9uL2xvZy5qcyc7XG5pbXBvcnQgeyBJQWdlbnRIb3N0R2l0U3RhdGVTZXJ2aWNlIH0gZnJvbSAnLi4vY29tbW9uL2FnZW50SG9zdEdpdFN0YXRlU2VydmljZS5qcyc7XG5cbmNsYXNzIFdhdGNoSW50ZXJlc3RSZWZlcmVuY2VDb2xsZWN0aW9uIGV4dGVuZHMgUmVmZXJlbmNlQ29sbGVjdGlvbjxzdHJpbmc+IHtcblx0Y29uc3RydWN0b3IoXG5cdFx0cHJpdmF0ZSByZWFkb25seSBfY3JlYXRlOiAoc2Vzc2lvblN0cjogc3RyaW5nKSA9PiB2b2lkLFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX2Rlc3Ryb3k6IChzZXNzaW9uU3RyOiBzdHJpbmcpID0+IHZvaWQsXG5cdCkge1xuXHRcdHN1cGVyKCk7XG5cdH1cblxuXHRwcm90ZWN0ZWQgY3JlYXRlUmVmZXJlbmNlZE9iamVjdChzZXNzaW9uU3RyOiBzdHJpbmcpOiBzdHJpbmcge1xuXHRcdHRoaXMuX2NyZWF0ZShzZXNzaW9uU3RyKTtcblx0XHRyZXR1cm4gc2Vzc2lvblN0cjtcblx0fVxuXG5cdHByb3RlY3RlZCBkZXN0cm95UmVmZXJlbmNlZE9iamVjdChzZXNzaW9uU3RyOiBzdHJpbmcpOiB2b2lkIHtcblx0XHR0aGlzLl9kZXN0cm95KHNlc3Npb25TdHIpO1xuXHR9XG59XG5cbi8qKlxuICogS2VlcHMgc3RhdGljIGNoYW5nZXNldCBjYXRhbG9ndWUgZW50cmllcyBmcmVzaCB3aGlsZSBhIGNsaWVudCBpcyBvYnNlcnZpbmcgYVxuICogc2Vzc2lvbiBvciBvbmUgb2YgaXRzIHN0YXRpYyBjaGFuZ2VzZXQgcmVzb3VyY2VzLlxuICpcbiAqIFRoZSBnZW5lcmljIHtAbGluayBJQWdlbnRIb3N0RmlsZU1vbml0b3JTZXJ2aWNlfSBvd25zIGZvbGRlciB3YXRjaGluZyBhbmRcbiAqIGRlYm91bmNlIG1lY2hhbmljczsgdGhpcyBjb29yZGluYXRvciBvd25zIHRoZSBjaGFuZ2VzZXQtc3BlY2lmaWMgbGlmZWN5Y2xlOlxuICogc3Vic2NyaXB0aW9uIGludGVyZXN0LCBzZXNzaW9uIG1hdGVyaWFsaXphdGlvbiwgcmVwb3NpdG9yeS1yb290IHJlc29sdXRpb24sXG4gKiByb290LWxldmVsIHdhdGNoZXIgc2hhcmluZywgYW5kIHJlZnJlc2ggZmFub3V0LlxuICpcbiAqIFdlIG9ubHkgbW9uaXRvciByb290cyB3aGlsZSBhdCBsZWFzdCBvbmUgY2xpZW50IGlzIHN1YnNjcmliZWQgdG8gYSBzZXNzaW9uIG9yXG4gKiBzdGF0aWMgY2hhbmdlc2V0IHRoYXQgbmVlZHMgZnJlc2ggY2hhbmdlc2V0IGNvdW50cy4gV2UgZG8gbm90IG1vbml0b3Igd2hpbGUgYVxuICogc2Vzc2lvbiBvbiB0aGF0IHJvb3QgaXMgYWN0aXZlbHkgcnVubmluZyBhIHR1cm46IGFnZW50L3Rvb2wgZWRpdHMgbWFkZSBkdXJpbmdcbiAqIHRoZSB0dXJuIGFyZSBjYXB0dXJlZCBieSB0aGUgdHVybiBsaWZlY3ljbGUsIGFuZCB0aGUgc3RhdGljIGNoYW5nZXNldHMgYXJlXG4gKiByZWNvbXB1dGVkIG9uY2Ugd2hlbiB0aGUgdHVybiBjb21wbGV0ZXMuIFdhdGNoaW5nIGR1cmluZyB0aGUgdHVybiB3b3VsZCBhZGRcbiAqIGR1cGxpY2F0ZSBmaWxlLXN5c3RlbSBub2lzZSB3aXRob3V0IGltcHJvdmluZyBjb3JyZWN0bmVzcy5cbiAqL1xuZXhwb3J0IGNsYXNzIENoYW5nZXNldEZpbGVNb25pdG9yQ29vcmRpbmF0b3IgZXh0ZW5kcyBEaXNwb3NhYmxlIHtcblxuXHQvKiogUGVyLXN1YnNjcmlwdGlvbiByZWZlcmVuY2VzIGludG8gdGhlIHBlci1zZXNzaW9uIHdhdGNoLWludGVyZXN0IGNvbGxlY3Rpb24uICovXG5cdHByaXZhdGUgcmVhZG9ubHkgX3dhdGNoSW50ZXJlc3RSZWZlcmVuY2VzID0gdGhpcy5fcmVnaXN0ZXIobmV3IERpc3Bvc2FibGVNYXA8c3RyaW5nLCBJUmVmZXJlbmNlPHN0cmluZz4+KCkpO1xuXHRwcml2YXRlIHJlYWRvbmx5IF93YXRjaEludGVyZXN0Q29sbGVjdGlvbiA9IG5ldyBXYXRjaEludGVyZXN0UmVmZXJlbmNlQ29sbGVjdGlvbihcblx0XHRzZXNzaW9uU3RyID0+IHRoaXMuX2F0dGFjaFdhdGNoZXJJZlBvc3NpYmxlKHNlc3Npb25TdHIpLFxuXHRcdHNlc3Npb25TdHIgPT4gdGhpcy5fZGVzdHJveVdhdGNoSW50ZXJlc3Qoc2Vzc2lvblN0ciksXG5cdCk7XG5cdC8qKiBTZXNzaW9ucyB3YWl0aW5nIGZvciBtYXRlcmlhbGl6YXRpb24gYmVmb3JlIGEgcm9vdCB3YXRjaGVyIGNhbiBhdHRhY2guICovXG5cdHByaXZhdGUgcmVhZG9ubHkgX3BlbmRpbmdXYXRjaEludGVyZXN0ID0gbmV3IFNldDxzdHJpbmc+KCk7XG5cdC8qKiBTZXNzaW9uIFVSSSBzdHJpbmcgdG8gYSBzdGFibGUgc2lnbmF0dXJlIG9mIHRoZSB3b3JraW5nLWRpcmVjdG9yeSBzZXQgdGhhdCBwcm9kdWNlZCB0aGUgY3VycmVudCByb290IGF0dGFjaG1lbnRzLiAqL1xuXHRwcml2YXRlIHJlYWRvbmx5IF9zZXNzaW9uV29ya2luZ0RpcmVjdG9yaWVzID0gbmV3IE1hcDxzdHJpbmcsIHN0cmluZz4oKTtcblx0LyoqIFNlc3Npb24gVVJJIHN0cmluZyB0byB0aGUgc2V0IG9mIHJlcG9zaXRvcnktcm9vdCBVUkkgc3RyaW5ncyBpdCBpcyB3YXRjaGluZy4gKi9cblx0cHJpdmF0ZSByZWFkb25seSBfc2Vzc2lvblJvb3RzID0gbmV3IE1hcDxzdHJpbmcsIFNldDxzdHJpbmc+PigpO1xuXHQvKiogUmVwb3NpdG9yeS1yb290IFVSSSBzdHJpbmcgdG8gc2Vzc2lvbnMgY3VycmVudGx5IGZhbm5lZCBvdXQgZnJvbSB0aGF0IHJvb3QuICovXG5cdHByaXZhdGUgcmVhZG9ubHkgX3Jvb3RTZXNzaW9ucyA9IG5ldyBNYXA8c3RyaW5nLCBTZXQ8c3RyaW5nPj4oKTtcblx0LyoqIFJlcG9zaXRvcnktcm9vdCBVUkkgc3RyaW5nIHRvIHRoZSBzaGFyZWQgbW9uaXRvciBhY3F1aXNpdGlvbi4gKi9cblx0cHJpdmF0ZSByZWFkb25seSBfcm9vdFdhdGNoQWNxdWlzaXRpb25zID0gdGhpcy5fcmVnaXN0ZXIobmV3IERpc3Bvc2FibGVNYXA8c3RyaW5nPigpKTtcblx0LyoqIFJlcG9zaXRvcnktcm9vdCBVUkkgc3RyaW5nIHRvIHRoZSBjYW5vbmljYWwgcmVwb3NpdG9yeSByb290IFVSSS4gKi9cblx0cHJpdmF0ZSByZWFkb25seSBfcm9vdFVyaXMgPSBuZXcgTWFwPHN0cmluZywgVVJJPigpO1xuXHQvKiogQWN0aXZlIHNlc3Npb24gVVJJIHN0cmluZyB0byByZXBvc2l0b3J5LXJvb3QgVVJJIHN0cmluZy4gKi9cblx0cHJpdmF0ZSByZWFkb25seSBfYWN0aXZlU2Vzc2lvblJvb3RzID0gbmV3IE1hcDxzdHJpbmcsIHN0cmluZz4oKTtcblx0LyoqIFJlcG9zaXRvcnktcm9vdCBVUkkgc3RyaW5nIHRvIHNlc3Npb25zIGN1cnJlbnRseSBhY3RpdmUgYWdhaW5zdCB0aGF0IHJvb3QuICovXG5cdHByaXZhdGUgcmVhZG9ubHkgX3Jvb3RBY3RpdmVTZXNzaW9ucyA9IG5ldyBNYXA8c3RyaW5nLCBTZXQ8c3RyaW5nPj4oKTtcblx0LyoqIEFjdGl2ZSBzZXNzaW9ucyB3aG9zZSByZXBvc2l0b3J5IHJvb3QgY2Fubm90IHlldCBiZSByZXNvbHZlZC4gKi9cblx0cHJpdmF0ZSByZWFkb25seSBfdW5yZXNvbHZlZEFjdGl2ZVNlc3Npb25zID0gbmV3IFNldDxzdHJpbmc+KCk7XG5cdHByaXZhdGUgcmVhZG9ubHkgX3dhdGNoQXR0YWNobWVudFNlcXVlbmNlciA9IG5ldyBTZXF1ZW5jZXJCeUtleTxzdHJpbmc+KCk7XG5cdHByaXZhdGUgcmVhZG9ubHkgX2FjdGl2ZVR1cm5TZXF1ZW5jZXIgPSBuZXcgU2VxdWVuY2VyQnlLZXk8c3RyaW5nPigpO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdEBJQWdlbnRIb3N0U3RhdGVNYW5hZ2VyIHByaXZhdGUgcmVhZG9ubHkgX3N0YXRlTWFuYWdlcjogQWdlbnRIb3N0U3RhdGVNYW5hZ2VyLFxuXHRcdEBJQWdlbnRIb3N0RmlsZU1vbml0b3JTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2ZpbGVNb25pdG9yU2VydmljZTogSUFnZW50SG9zdEZpbGVNb25pdG9yU2VydmljZSxcblx0XHRASUFnZW50SG9zdEdpdFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfZ2l0U2VydmljZTogSUFnZW50SG9zdEdpdFNlcnZpY2UsXG5cdFx0QElBZ2VudEhvc3RHaXRTdGF0ZVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfZ2l0U3RhdGVTZXJ2aWNlOiBJQWdlbnRIb3N0R2l0U3RhdGVTZXJ2aWNlLFxuXHRcdEBJTG9nU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9sb2dTZXJ2aWNlOiBJTG9nU2VydmljZSxcblx0KSB7XG5cdFx0c3VwZXIoKTtcblx0fVxuXG5cdHRyYWNrU2Vzc2lvbkNoYW5nZXMoc3Vic2NyaXB0aW9uS2V5OiBzdHJpbmcsIHNlc3Npb25TdHI6IHN0cmluZyk6IHZvaWQge1xuXHRcdGlmICghdGhpcy5fd2F0Y2hJbnRlcmVzdFJlZmVyZW5jZXMuaGFzKHN1YnNjcmlwdGlvbktleSkpIHtcblx0XHRcdHRoaXMuX3dhdGNoSW50ZXJlc3RSZWZlcmVuY2VzLnNldChzdWJzY3JpcHRpb25LZXksIHRoaXMuX3dhdGNoSW50ZXJlc3RDb2xsZWN0aW9uLmFjcXVpcmUoc2Vzc2lvblN0cikpO1xuXHRcdH1cblx0fVxuXG5cdHVudHJhY2tTZXNzaW9uQ2hhbmdlcyhzdWJzY3JpcHRpb25LZXk6IHN0cmluZyk6IHZvaWQge1xuXHRcdHRoaXMuX3dhdGNoSW50ZXJlc3RSZWZlcmVuY2VzLmRlbGV0ZUFuZERpc3Bvc2Uoc3Vic2NyaXB0aW9uS2V5KTtcblx0fVxuXG5cdG9uU2Vzc2lvblJlc3RvcmVkKHNlc3Npb25TdHI6IHN0cmluZyk6IHZvaWQge1xuXHRcdHRoaXMuX3JldHJ5V2F0Y2hBdHRhY2htZW50KHNlc3Npb25TdHIpO1xuXHR9XG5cblx0b25TZXNzaW9uTWF0ZXJpYWxpemVkKHNlc3Npb25TdHI6IHN0cmluZyk6IHZvaWQge1xuXHRcdHRoaXMuX3JldHJ5V2F0Y2hBdHRhY2htZW50KHNlc3Npb25TdHIpO1xuXHR9XG5cblx0LyoqXG5cdCAqIFJlLWF0dGFjaCBhIHNlc3Npb24ncyByb290IHdhdGNoZXJzIHdoZW4gaXRzIGVmZmVjdGl2ZSB3b3JraW5nLWRpcmVjdG9yeVxuXHQgKiBzZXQgY2hhbmdlcyAoYSBmb2xkZXIgYWRkZWQgb3IgcmVtb3ZlZCwgZS5nLiBpbiB0aGUgRWRpdG9yIFdpbmRvdykuIFRoZVxuXHQgKiBzaWduYXR1cmUgZ3VhcmQgaW4gYF9hdHRhY2hXYXRjaGVySWZQb3NzaWJsZWAgbWFrZXMgYW4gdW5jaGFuZ2VkIHNldCBhXG5cdCAqIG5vLW9wLCBzbyB0aGlzIGlzIGNoZWFwOyBhbiBhY3RpdmUgKG1pZC10dXJuKSBzZXNzaW9uIGlzIGluc3RlYWQgcmUtYXR0YWNoZWRcblx0ICogYnkgdGhlIHR1cm4gbGlmZWN5Y2xlIG9uIHR1cm4gZW5kLlxuXHQgKi9cblx0b25TZXNzaW9uV29ya2luZ0RpcmVjdG9yaWVzQ2hhbmdlZChzZXNzaW9uU3RyOiBzdHJpbmcpOiB2b2lkIHtcblx0XHR0aGlzLl9yZXRyeVdhdGNoQXR0YWNobWVudChzZXNzaW9uU3RyKTtcblx0fVxuXG5cdG9uU2Vzc2lvbkRpc3Bvc2VkKHNlc3Npb25TdHI6IHN0cmluZyk6IHZvaWQge1xuXHRcdHRoaXMudW50cmFja1Nlc3Npb25DaGFuZ2VzKGJ1aWxkVW5jb21taXR0ZWRDaGFuZ2VzZXRVcmkoc2Vzc2lvblN0cikpO1xuXHRcdHRoaXMudW50cmFja1Nlc3Npb25DaGFuZ2VzKGJ1aWxkU2Vzc2lvbkNoYW5nZXNldFVyaShzZXNzaW9uU3RyKSk7XG5cdFx0dGhpcy51bnRyYWNrU2Vzc2lvbkNoYW5nZXMoYnVpbGRCcmFuY2hDaGFuZ2VzZXRVcmkoc2Vzc2lvblN0cikpO1xuXHRcdHRoaXMudW50cmFja1Nlc3Npb25DaGFuZ2VzKHNlc3Npb25TdHIpO1xuXHRcdHRoaXMuX3JlbW92ZUFjdGl2ZVNlc3Npb24oc2Vzc2lvblN0cik7XG5cdFx0dGhpcy5fZGVzdHJveVdhdGNoSW50ZXJlc3Qoc2Vzc2lvblN0cik7XG5cdH1cblxuXHRvblNlc3Npb25UdXJuQWN0aXZlQ2hhbmdlZChzZXNzaW9uU3RyOiBzdHJpbmcsIGFjdGl2ZTogYm9vbGVhbik6IHZvaWQge1xuXHRcdHRoaXMuX2FjdGl2ZVR1cm5TZXF1ZW5jZXIucXVldWUoc2Vzc2lvblN0ciwgYXN5bmMgKCkgPT4ge1xuXHRcdFx0aWYgKGFjdGl2ZSkge1xuXHRcdFx0XHRhd2FpdCB0aGlzLl9tYXJrU2Vzc2lvbkFjdGl2ZShzZXNzaW9uU3RyKTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdHRoaXMuX21hcmtTZXNzaW9uSW5hY3RpdmUoc2Vzc2lvblN0cik7XG5cdFx0XHR9XG5cdFx0fSk7XG5cdH1cblxuXHRwcml2YXRlIF9kZXN0cm95V2F0Y2hJbnRlcmVzdChzZXNzaW9uU3RyOiBzdHJpbmcpOiB2b2lkIHtcblx0XHR0aGlzLl9wZW5kaW5nV2F0Y2hJbnRlcmVzdC5kZWxldGUoc2Vzc2lvblN0cik7XG5cdFx0dGhpcy5fcmVsZWFzZVNlc3Npb25Sb290cyhzZXNzaW9uU3RyKTtcblx0fVxuXG5cdHByaXZhdGUgX3JldHJ5V2F0Y2hBdHRhY2htZW50KHNlc3Npb25TdHI6IHN0cmluZyk6IHZvaWQge1xuXHRcdGlmICh0aGlzLl9zaG91bGRBdHRhY2hTZXNzaW9uKHNlc3Npb25TdHIpIHx8IHRoaXMuX3BlbmRpbmdXYXRjaEludGVyZXN0LmhhcyhzZXNzaW9uU3RyKSkge1xuXHRcdFx0dGhpcy5fYXR0YWNoV2F0Y2hlcklmUG9zc2libGUoc2Vzc2lvblN0cik7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBfaGFzV2F0Y2hJbnRlcmVzdChzZXNzaW9uU3RyOiBzdHJpbmcpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gdGhpcy5fd2F0Y2hJbnRlcmVzdFJlZmVyZW5jZXMuaGFzKHNlc3Npb25TdHIpXG5cdFx0XHR8fCB0aGlzLl93YXRjaEludGVyZXN0UmVmZXJlbmNlcy5oYXMoYnVpbGRCcmFuY2hDaGFuZ2VzZXRVcmkoc2Vzc2lvblN0cikpXG5cdFx0XHR8fCB0aGlzLl93YXRjaEludGVyZXN0UmVmZXJlbmNlcy5oYXMoYnVpbGRVbmNvbW1pdHRlZENoYW5nZXNldFVyaShzZXNzaW9uU3RyKSlcblx0XHRcdHx8IHRoaXMuX3dhdGNoSW50ZXJlc3RSZWZlcmVuY2VzLmhhcyhidWlsZFNlc3Npb25DaGFuZ2VzZXRVcmkoc2Vzc2lvblN0cikpO1xuXHR9XG5cblx0cHJpdmF0ZSBfYXR0YWNoV2F0Y2hlcklmUG9zc2libGUoc2Vzc2lvblN0cjogc3RyaW5nKTogdm9pZCB7XG5cdFx0dGhpcy5fd2F0Y2hBdHRhY2htZW50U2VxdWVuY2VyLnF1ZXVlKHNlc3Npb25TdHIsIGFzeW5jICgpID0+IHtcblx0XHRcdGlmICghdGhpcy5fc2hvdWxkQXR0YWNoU2Vzc2lvbihzZXNzaW9uU3RyKSkge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cdFx0XHRjb25zdCB3b3JraW5nRGlyZWN0b3JpZXMgPSBnZXRFZmZlY3RpdmVXb3JraW5nRGlyZWN0b3JpZXModGhpcy5fc3RhdGVNYW5hZ2VyLCBzZXNzaW9uU3RyKTtcblx0XHRcdGlmICghd29ya2luZ0RpcmVjdG9yaWVzIHx8IHdvcmtpbmdEaXJlY3Rvcmllcy5sZW5ndGggPT09IDApIHtcblx0XHRcdFx0dGhpcy5fcGVuZGluZ1dhdGNoSW50ZXJlc3QuYWRkKHNlc3Npb25TdHIpO1xuXHRcdFx0XHR0aGlzLl9yZWxlYXNlU2Vzc2lvblJvb3RzKHNlc3Npb25TdHIpO1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cdFx0XHRjb25zdCB3b3JraW5nRGlyZWN0b3J5VXJpczogVVJJW10gPSBbXTtcblx0XHRcdGZvciAoY29uc3Qgd29ya2luZ0RpcmVjdG9yeSBvZiB3b3JraW5nRGlyZWN0b3JpZXMpIHtcblx0XHRcdFx0dHJ5IHtcblx0XHRcdFx0XHR3b3JraW5nRGlyZWN0b3J5VXJpcy5wdXNoKFVSSS5wYXJzZSh3b3JraW5nRGlyZWN0b3J5KSk7XG5cdFx0XHRcdH0gY2F0Y2ggKGVycikge1xuXHRcdFx0XHRcdHRoaXMuX2xvZ1NlcnZpY2Uud2FybihgW0NoYW5nZXNldEZpbGVNb25pdG9yQ29vcmRpbmF0b3JdIEZhaWxlZCB0byBwYXJzZSB3b3JraW5nIGRpcmVjdG9yeSBVUkkgZm9yICR7c2Vzc2lvblN0cn06ICR7d29ya2luZ0RpcmVjdG9yeX1gLCBlcnIpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0XHRpZiAod29ya2luZ0RpcmVjdG9yeVVyaXMubGVuZ3RoID09PSAwKSB7XG5cdFx0XHRcdHRoaXMuX3BlbmRpbmdXYXRjaEludGVyZXN0LmFkZChzZXNzaW9uU3RyKTtcblx0XHRcdFx0dGhpcy5fcmVsZWFzZVNlc3Npb25Sb290cyhzZXNzaW9uU3RyKTtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXHRcdFx0Y29uc3Qgc2lnbmF0dXJlID0gdGhpcy5fd29ya2luZ0RpcmVjdG9yaWVzU2lnbmF0dXJlKHdvcmtpbmdEaXJlY3Rvcmllcyk7XG5cdFx0XHRpZiAodGhpcy5fc2Vzc2lvblJvb3RzLmhhcyhzZXNzaW9uU3RyKSAmJiB0aGlzLl9zZXNzaW9uV29ya2luZ0RpcmVjdG9yaWVzLmdldChzZXNzaW9uU3RyKSA9PT0gc2lnbmF0dXJlKSB7XG5cdFx0XHRcdHRoaXMuX3BlbmRpbmdXYXRjaEludGVyZXN0LmRlbGV0ZShzZXNzaW9uU3RyKTtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXHRcdFx0Y29uc3QgeyBnaXRSZXBvc2l0b3JpZXMgfSA9IGF3YWl0IHJlc29sdmVTZXNzaW9uUmVwb3NpdG9yaWVzKHdvcmtpbmdEaXJlY3RvcnlVcmlzLCB0aGlzLl9naXRTZXJ2aWNlKTtcblx0XHRcdGlmICghdGhpcy5fc2hvdWxkQXR0YWNoU2Vzc2lvbihzZXNzaW9uU3RyKSkge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cdFx0XHRpZiAoZ2l0UmVwb3NpdG9yaWVzLmxlbmd0aCA9PT0gMCkge1xuXHRcdFx0XHR0aGlzLl9wZW5kaW5nV2F0Y2hJbnRlcmVzdC5kZWxldGUoc2Vzc2lvblN0cik7XG5cdFx0XHRcdHRoaXMuX3JlbGVhc2VTZXNzaW9uUm9vdHMoc2Vzc2lvblN0cik7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblx0XHRcdHRoaXMuX3BlbmRpbmdXYXRjaEludGVyZXN0LmRlbGV0ZShzZXNzaW9uU3RyKTtcblx0XHRcdHRoaXMuX2F0dGFjaFNlc3Npb25Ub1Jvb3RzKHNlc3Npb25TdHIsIGdpdFJlcG9zaXRvcmllcywgc2lnbmF0dXJlKTtcblx0XHR9KTtcblx0fVxuXG5cdHByaXZhdGUgX2F0dGFjaFNlc3Npb25Ub1Jvb3RzKHNlc3Npb25TdHI6IHN0cmluZywgcmVwb3NpdG9yeVJvb3RzOiByZWFkb25seSBVUklbXSwgc2lnbmF0dXJlOiBzdHJpbmcpOiB2b2lkIHtcblx0XHRjb25zdCBkZXNpcmVkUm9vdHMgPSBuZXcgTWFwPHN0cmluZywgVVJJPigpO1xuXHRcdGZvciAoY29uc3QgcmVwb3NpdG9yeVJvb3Qgb2YgcmVwb3NpdG9yeVJvb3RzKSB7XG5cdFx0XHRkZXNpcmVkUm9vdHMuc2V0KHJlcG9zaXRvcnlSb290LnRvU3RyaW5nKCksIHJlcG9zaXRvcnlSb290KTtcblx0XHR9XG5cblx0XHQvLyBEZXRhY2ggZnJvbSByb290cyB0aGlzIHNlc3Npb24gbm8gbG9uZ2VyIHJlc29sdmVzIHRvIChydW5zIG9uIGVhY2ggcmUtYXR0YWNoKS4gQW4gaWRsZVxuXHRcdC8vIHN1YnNjcmliZWQgc2Vzc2lvbiByZS1hdHRhY2hlcyBhcyBzb29uIGFzIGl0cyB3b3JraW5nLWRpcmVjdG9yeSBzZXQgY2hhbmdlcyAodmlhXG5cdFx0Ly8gYG9uU2Vzc2lvbldvcmtpbmdEaXJlY3Rvcmllc0NoYW5nZWRgKTsgYW4gYWN0aXZlIHNlc3Npb24gcmUtYXR0YWNoZXMgYXQgdHVybiBlbmQuXG5cdFx0Y29uc3QgY3VycmVudCA9IHRoaXMuX3Nlc3Npb25Sb290cy5nZXQoc2Vzc2lvblN0cik7XG5cdFx0aWYgKGN1cnJlbnQpIHtcblx0XHRcdGZvciAoY29uc3Qgcm9vdFN0ciBvZiBbLi4uY3VycmVudF0pIHtcblx0XHRcdFx0aWYgKCFkZXNpcmVkUm9vdHMuaGFzKHJvb3RTdHIpKSB7XG5cdFx0XHRcdFx0Y3VycmVudC5kZWxldGUocm9vdFN0cik7XG5cdFx0XHRcdFx0dGhpcy5fZGV0YWNoUm9vdFNlc3Npb24oc2Vzc2lvblN0ciwgcm9vdFN0cik7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cblx0XHRsZXQgc2Vzc2lvblJvb3RzID0gdGhpcy5fc2Vzc2lvblJvb3RzLmdldChzZXNzaW9uU3RyKTtcblx0XHRpZiAoIXNlc3Npb25Sb290cykge1xuXHRcdFx0c2Vzc2lvblJvb3RzID0gbmV3IFNldDxzdHJpbmc+KCk7XG5cdFx0XHR0aGlzLl9zZXNzaW9uUm9vdHMuc2V0KHNlc3Npb25TdHIsIHNlc3Npb25Sb290cyk7XG5cdFx0fVxuXHRcdGxldCBhbGxSb290c1dhdGNoZWQgPSB0cnVlO1xuXHRcdGZvciAoY29uc3QgW3Jvb3RTdHIsIHJlcG9zaXRvcnlSb290XSBvZiBkZXNpcmVkUm9vdHMpIHtcblx0XHRcdGxldCBzZXNzaW9ucyA9IHRoaXMuX3Jvb3RTZXNzaW9ucy5nZXQocm9vdFN0cik7XG5cdFx0XHRpZiAoIXNlc3Npb25zKSB7XG5cdFx0XHRcdHNlc3Npb25zID0gbmV3IFNldDxzdHJpbmc+KCk7XG5cdFx0XHRcdHRoaXMuX3Jvb3RTZXNzaW9ucy5zZXQocm9vdFN0ciwgc2Vzc2lvbnMpO1xuXHRcdFx0XHR0aGlzLl9yb290VXJpcy5zZXQocm9vdFN0ciwgcmVwb3NpdG9yeVJvb3QpO1xuXHRcdFx0fVxuXHRcdFx0c2Vzc2lvbnMuYWRkKHNlc3Npb25TdHIpO1xuXHRcdFx0c2Vzc2lvblJvb3RzLmFkZChyb290U3RyKTtcblx0XHRcdGlmICghdGhpcy5fZW5zdXJlUm9vdFdhdGNoZXIocm9vdFN0ciwgcmVwb3NpdG9yeVJvb3QpKSB7XG5cdFx0XHRcdGFsbFJvb3RzV2F0Y2hlZCA9IGZhbHNlO1xuXHRcdFx0fVxuXHRcdH1cblx0XHQvLyBDYWNoZSB0aGUgc2lnbmF0dXJlIG9ubHkgd2hlbiBldmVyeSByb290IHdhcyB3YXRjaGVkOyBhIGZhaWxlZFxuXHRcdC8vIGFjcXVpc2l0aW9uIGlzIHRoZW4gcmV0cmllZCBvbiB0aGUgbmV4dCByZS1hdHRhY2ggKG5vdCBza2lwcGVkKS5cblx0XHRpZiAoYWxsUm9vdHNXYXRjaGVkKSB7XG5cdFx0XHR0aGlzLl9zZXNzaW9uV29ya2luZ0RpcmVjdG9yaWVzLnNldChzZXNzaW9uU3RyLCBzaWduYXR1cmUpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHR0aGlzLl9zZXNzaW9uV29ya2luZ0RpcmVjdG9yaWVzLmRlbGV0ZShzZXNzaW9uU3RyKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIF9yZWxlYXNlU2Vzc2lvblJvb3RzKHNlc3Npb25TdHI6IHN0cmluZyk6IHZvaWQge1xuXHRcdHRoaXMuX3Nlc3Npb25Xb3JraW5nRGlyZWN0b3JpZXMuZGVsZXRlKHNlc3Npb25TdHIpO1xuXHRcdGNvbnN0IHJvb3RTdHJzID0gdGhpcy5fc2Vzc2lvblJvb3RzLmdldChzZXNzaW9uU3RyKTtcblx0XHRpZiAoIXJvb3RTdHJzKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdHRoaXMuX3Nlc3Npb25Sb290cy5kZWxldGUoc2Vzc2lvblN0cik7XG5cdFx0Zm9yIChjb25zdCByb290U3RyIG9mIHJvb3RTdHJzKSB7XG5cdFx0XHR0aGlzLl9kZXRhY2hSb290U2Vzc2lvbihzZXNzaW9uU3RyLCByb290U3RyKTtcblx0XHR9XG5cdH1cblxuXHQvKipcblx0ICogUmVtb3ZlcyBhIHNlc3Npb24gZnJvbSBvbmUgcmVwb3NpdG9yeSByb290J3MgZmFuLW91dCBzZXQsIGRpc3Bvc2luZyB0aGVcblx0ICogc2hhcmVkIHJvb3Qgd2F0Y2hlciBvbmNlIHRoZSBsYXN0IHJlZmVyZW5jaW5nIHNlc3Npb24gZHJvcHMgaXQuXG5cdCAqL1xuXHRwcml2YXRlIF9kZXRhY2hSb290U2Vzc2lvbihzZXNzaW9uU3RyOiBzdHJpbmcsIHJvb3RTdHI6IHN0cmluZyk6IHZvaWQge1xuXHRcdGNvbnN0IHNlc3Npb25zID0gdGhpcy5fcm9vdFNlc3Npb25zLmdldChyb290U3RyKTtcblx0XHRpZiAoIXNlc3Npb25zKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdHNlc3Npb25zLmRlbGV0ZShzZXNzaW9uU3RyKTtcblx0XHRpZiAoc2Vzc2lvbnMuc2l6ZSA9PT0gMCkge1xuXHRcdFx0dGhpcy5fcm9vdFNlc3Npb25zLmRlbGV0ZShyb290U3RyKTtcblx0XHRcdHRoaXMuX3Jvb3RVcmlzLmRlbGV0ZShyb290U3RyKTtcblx0XHRcdHRoaXMuX3Jvb3RXYXRjaEFjcXVpc2l0aW9ucy5kZWxldGVBbmREaXNwb3NlKHJvb3RTdHIpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgX3dvcmtpbmdEaXJlY3Rvcmllc1NpZ25hdHVyZSh3b3JraW5nRGlyZWN0b3JpZXM6IHJlYWRvbmx5IHN0cmluZ1tdKTogc3RyaW5nIHtcblx0XHRyZXR1cm4gd29ya2luZ0RpcmVjdG9yaWVzLmpvaW4oJ1xcdTAwMDAnKTtcblx0fVxuXG5cdHByaXZhdGUgX29uUm9vdENoYW5nZWQocm9vdFN0cjogc3RyaW5nKTogdm9pZCB7XG5cdFx0aWYgKHRoaXMuX2lzUm9vdEFjdGl2ZShyb290U3RyKSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRjb25zdCBzZXNzaW9ucyA9IHRoaXMuX3Jvb3RTZXNzaW9ucy5nZXQocm9vdFN0cik7XG5cdFx0aWYgKCFzZXNzaW9ucyB8fCBzZXNzaW9ucy5zaXplID09PSAwKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGNvbnN0IHNlc3Npb25zVG9SZWZyZXNoID0gWy4uLnNlc3Npb25zXS5maWx0ZXIoc2Vzc2lvbiA9PiB7XG5cdFx0XHRyZXR1cm4gdGhpcy5faGFzV2F0Y2hJbnRlcmVzdChzZXNzaW9uKVxuXHRcdFx0XHQmJiAhIXRoaXMuX3Nlc3Npb25Sb290cy5nZXQoc2Vzc2lvbik/Lmhhcyhyb290U3RyKVxuXHRcdFx0XHQmJiAhdGhpcy5fYWN0aXZlU2Vzc2lvblJvb3RzLmhhcyhzZXNzaW9uKVxuXHRcdFx0XHQmJiAhdGhpcy5fdW5yZXNvbHZlZEFjdGl2ZVNlc3Npb25zLmhhcyhzZXNzaW9uKVxuXHRcdFx0XHQmJiAhIXRoaXMuX3N0YXRlTWFuYWdlci5nZXRTZXNzaW9uU3RhdGUoc2Vzc2lvbik7XG5cdFx0fSk7XG5cdFx0aWYgKHNlc3Npb25zVG9SZWZyZXNoLmxlbmd0aCA9PT0gMCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGZvciAoY29uc3Qgc2Vzc2lvbiBvZiBzZXNzaW9uc1RvUmVmcmVzaCkge1xuXHRcdFx0Ly8gQWx3YXlzIHJlZnJlc2ggZnJvbSB0aGUgUFJJTUFSWSB3b3JraW5nIGRpcmVjdG9yeSwgbmV2ZXIgdGhlIGNoYW5nZWQgcm9vdDogYnJhbmNoL1BSIGlzIGFcblx0XHRcdC8vIHByaW1hcnktcmVwbyBjb25jZXB0LCB3aGlsZSB0aGUgZG93bnN0cmVhbSBzdW1tYXJ5IHJlY29tcHV0ZSByZS1kaWZmcyBFVkVSWSByZXBvIFx1MjAxNCBzbyBhXG5cdFx0XHQvLyBzZWNvbmRhcnkgY2hhbmdlIHN0aWxsIHJlZmxlY3RzIHdpdGhvdXQgbWlzLWF0dHJpYnV0aW5nIGl0cyBicmFuY2gvUFIuIFRocm90dGxlZCBkb3duc3RyZWFtLlxuXHRcdFx0Y29uc3QgcHJpbWFyeVdvcmtpbmdEaXJlY3RvcnkgPSBnZXRFZmZlY3RpdmVXb3JraW5nRGlyZWN0b3J5KHRoaXMuX3N0YXRlTWFuYWdlciwgc2Vzc2lvbik7XG5cdFx0XHRpZiAoIXByaW1hcnlXb3JraW5nRGlyZWN0b3J5KSB7XG5cdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0fVxuXHRcdFx0bGV0IHByaW1hcnlXb3JraW5nRGlyZWN0b3J5VXJpOiBVUkk7XG5cdFx0XHR0cnkge1xuXHRcdFx0XHRwcmltYXJ5V29ya2luZ0RpcmVjdG9yeVVyaSA9IFVSSS5wYXJzZShwcmltYXJ5V29ya2luZ0RpcmVjdG9yeSk7XG5cdFx0XHR9IGNhdGNoIChlcnIpIHtcblx0XHRcdFx0dGhpcy5fbG9nU2VydmljZS53YXJuKGBbQ2hhbmdlc2V0RmlsZU1vbml0b3JDb29yZGluYXRvcl0gRmFpbGVkIHRvIHBhcnNlIHByaW1hcnkgd29ya2luZyBkaXJlY3RvcnkgVVJJIGZvciAke3Nlc3Npb259OiAke3ByaW1hcnlXb3JraW5nRGlyZWN0b3J5fWAsIGVycik7XG5cdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0fVxuXHRcdFx0dm9pZCB0aGlzLl9naXRTdGF0ZVNlcnZpY2UucmVmcmVzaFNlc3Npb25HaXRTdGF0ZShzZXNzaW9uLCBwcmltYXJ5V29ya2luZ0RpcmVjdG9yeVVyaSk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBfc2hvdWxkQXR0YWNoU2Vzc2lvbihzZXNzaW9uU3RyOiBzdHJpbmcpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gdGhpcy5faGFzV2F0Y2hJbnRlcmVzdChzZXNzaW9uU3RyKVxuXHRcdFx0JiYgIXRoaXMuX2FjdGl2ZVNlc3Npb25Sb290cy5oYXMoc2Vzc2lvblN0cilcblx0XHRcdCYmICF0aGlzLl91bnJlc29sdmVkQWN0aXZlU2Vzc2lvbnMuaGFzKHNlc3Npb25TdHIpO1xuXHR9XG5cblx0cHJpdmF0ZSBfaXNSb290QWN0aXZlKHJvb3RTdHI6IHN0cmluZyk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiAodGhpcy5fcm9vdEFjdGl2ZVNlc3Npb25zLmdldChyb290U3RyKT8uc2l6ZSA/PyAwKSA+IDA7XG5cdH1cblxuXHQvKipcblx0ICogRW5zdXJlcyBhIHNoYXJlZCB3YXRjaGVyIGV4aXN0cyBmb3IgYSByb290LiBSZXR1cm5zIGZhbHNlIG9ubHkgd2hlblxuXHQgKiBhY3F1aXNpdGlvbiBmYWlsZWQgKHRoZSBjYWxsZXIgcmV0cmllcyB0aGF0IHJvb3QgbGF0ZXIpOyBhblxuXHQgKiBhbHJlYWR5LXdhdGNoZWQgb3IgdHVybi1zdXNwZW5kZWQgYWN0aXZlIHJvb3QgY291bnRzIGFzIGhhbmRsZWQuXG5cdCAqL1xuXHRwcml2YXRlIF9lbnN1cmVSb290V2F0Y2hlcihyb290U3RyOiBzdHJpbmcsIHJlcG9zaXRvcnlSb290OiBVUkkpOiBib29sZWFuIHtcblx0XHRpZiAodGhpcy5faXNSb290QWN0aXZlKHJvb3RTdHIpIHx8IHRoaXMuX3Jvb3RXYXRjaEFjcXVpc2l0aW9ucy5oYXMocm9vdFN0cikpIHtcblx0XHRcdHJldHVybiB0cnVlO1xuXHRcdH1cblx0XHRjb25zdCBzZXNzaW9ucyA9IHRoaXMuX3Jvb3RTZXNzaW9ucy5nZXQocm9vdFN0cik7XG5cdFx0aWYgKCFzZXNzaW9ucyB8fCBzZXNzaW9ucy5zaXplID09PSAwKSB7XG5cdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHR9XG5cdFx0Y29uc3Qgcm9vdFdhdGNoQWNxdWlzaXRpb24gPSB0aGlzLl9maWxlTW9uaXRvclNlcnZpY2UuYWNxdWlyZShyZXBvc2l0b3J5Um9vdCwgKCkgPT4gdGhpcy5fb25Sb290Q2hhbmdlZChyb290U3RyKSwge1xuXHRcdFx0ZXhjbHVkZXM6IERFRkFVTFRfQUdFTlRfSE9TVF9XQVRDSF9FWENMVURFUyxcblx0XHRcdGRlYm91bmNlTXM6IDc1MCxcblx0XHR9KTtcblx0XHRpZiAoIXJvb3RXYXRjaEFjcXVpc2l0aW9uKSB7XG5cdFx0XHRmb3IgKGNvbnN0IHNlc3Npb24gb2Ygc2Vzc2lvbnMpIHtcblx0XHRcdFx0dGhpcy5fcGVuZGluZ1dhdGNoSW50ZXJlc3QuYWRkKHNlc3Npb24pO1xuXHRcdFx0fVxuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH1cblx0XHR0aGlzLl9yb290V2F0Y2hBY3F1aXNpdGlvbnMuc2V0KHJvb3RTdHIsIHJvb3RXYXRjaEFjcXVpc2l0aW9uKTtcblx0XHRyZXR1cm4gdHJ1ZTtcblx0fVxuXG5cdHByaXZhdGUgX3N1c3BlbmRSb290V2F0Y2hlcihyb290U3RyOiBzdHJpbmcpOiB2b2lkIHtcblx0XHR0aGlzLl9yb290V2F0Y2hBY3F1aXNpdGlvbnMuZGVsZXRlQW5kRGlzcG9zZShyb290U3RyKTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgX21hcmtTZXNzaW9uQWN0aXZlKHNlc3Npb25TdHI6IHN0cmluZyk6IFByb21pc2U8dm9pZD4ge1xuXHRcdHRoaXMuX3JlbW92ZUFjdGl2ZVNlc3Npb24oc2Vzc2lvblN0cik7XG5cdFx0dGhpcy5fcGVuZGluZ1dhdGNoSW50ZXJlc3QuZGVsZXRlKHNlc3Npb25TdHIpO1xuXHRcdGNvbnN0IHJlcG9zaXRvcnlSb290ID0gYXdhaXQgdGhpcy5fcmVzb2x2ZUFjdGl2aXR5UmVwb3NpdG9yeVJvb3Qoc2Vzc2lvblN0cik7XG5cdFx0aWYgKCFyZXBvc2l0b3J5Um9vdCkge1xuXHRcdFx0dGhpcy5fdW5yZXNvbHZlZEFjdGl2ZVNlc3Npb25zLmFkZChzZXNzaW9uU3RyKTtcblx0XHRcdHRoaXMuX3JlbGVhc2VTZXNzaW9uUm9vdHMoc2Vzc2lvblN0cik7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGNvbnN0IHJvb3RTdHIgPSByZXBvc2l0b3J5Um9vdC50b1N0cmluZygpO1xuXHRcdGxldCBhY3RpdmVTZXNzaW9ucyA9IHRoaXMuX3Jvb3RBY3RpdmVTZXNzaW9ucy5nZXQocm9vdFN0cik7XG5cdFx0aWYgKCFhY3RpdmVTZXNzaW9ucykge1xuXHRcdFx0YWN0aXZlU2Vzc2lvbnMgPSBuZXcgU2V0PHN0cmluZz4oKTtcblx0XHRcdHRoaXMuX3Jvb3RBY3RpdmVTZXNzaW9ucy5zZXQocm9vdFN0ciwgYWN0aXZlU2Vzc2lvbnMpO1xuXHRcdH1cblx0XHRhY3RpdmVTZXNzaW9ucy5hZGQoc2Vzc2lvblN0cik7XG5cdFx0dGhpcy5fYWN0aXZlU2Vzc2lvblJvb3RzLnNldChzZXNzaW9uU3RyLCByb290U3RyKTtcblx0XHR0aGlzLl9yb290VXJpcy5zZXQocm9vdFN0ciwgcmVwb3NpdG9yeVJvb3QpO1xuXHRcdHRoaXMuX3N1c3BlbmRSb290V2F0Y2hlcihyb290U3RyKTtcblx0XHQvLyBSZWxlYXNlIEFMTCBpZGxlIGF0dGFjaG1lbnRzIGR1cmluZyB0aGUgdHVybiAodHVybiBlZGl0cyBhcmUgY2FwdHVyZWQgYnkgdGhlIHR1cm4gbGlmZWN5Y2xlKS5cblx0XHQvLyBQcmltYXJ5IGFjdGl2ZS1yb290IHRyYWNraW5nIGFib3ZlIGtlZXBzIHRoZSBwcmltYXJ5IHN1c3BlbmRlZDsgdGhlIHN1bW1hcnkgcmVjb21wdXRlcyBhdCB0dXJuIGVuZC5cblx0XHR0aGlzLl9yZWxlYXNlU2Vzc2lvblJvb3RzKHNlc3Npb25TdHIpO1xuXHR9XG5cblx0cHJpdmF0ZSBfbWFya1Nlc3Npb25JbmFjdGl2ZShzZXNzaW9uU3RyOiBzdHJpbmcpOiB2b2lkIHtcblx0XHRjb25zdCByb290U3RyID0gdGhpcy5fcmVtb3ZlQWN0aXZlU2Vzc2lvbihzZXNzaW9uU3RyKTtcblx0XHRpZiAocm9vdFN0cikge1xuXHRcdFx0Y29uc3QgcmVwb3NpdG9yeVJvb3QgPSB0aGlzLl9yb290VXJpcy5nZXQocm9vdFN0cik7XG5cdFx0XHRpZiAocmVwb3NpdG9yeVJvb3QpIHtcblx0XHRcdFx0dGhpcy5fZW5zdXJlUm9vdFdhdGNoZXIocm9vdFN0ciwgcmVwb3NpdG9yeVJvb3QpO1xuXHRcdFx0fVxuXHRcdH1cblx0XHRpZiAodGhpcy5faGFzV2F0Y2hJbnRlcmVzdChzZXNzaW9uU3RyKSB8fCB0aGlzLl9wZW5kaW5nV2F0Y2hJbnRlcmVzdC5oYXMoc2Vzc2lvblN0cikpIHtcblx0XHRcdHRoaXMuX2F0dGFjaFdhdGNoZXJJZlBvc3NpYmxlKHNlc3Npb25TdHIpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgX3JlbW92ZUFjdGl2ZVNlc3Npb24oc2Vzc2lvblN0cjogc3RyaW5nKTogc3RyaW5nIHwgdW5kZWZpbmVkIHtcblx0XHR0aGlzLl91bnJlc29sdmVkQWN0aXZlU2Vzc2lvbnMuZGVsZXRlKHNlc3Npb25TdHIpO1xuXHRcdGNvbnN0IHJvb3RTdHIgPSB0aGlzLl9hY3RpdmVTZXNzaW9uUm9vdHMuZ2V0KHNlc3Npb25TdHIpO1xuXHRcdGlmICghcm9vdFN0cikge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cdFx0dGhpcy5fYWN0aXZlU2Vzc2lvblJvb3RzLmRlbGV0ZShzZXNzaW9uU3RyKTtcblx0XHRjb25zdCBhY3RpdmVTZXNzaW9ucyA9IHRoaXMuX3Jvb3RBY3RpdmVTZXNzaW9ucy5nZXQocm9vdFN0cik7XG5cdFx0aWYgKGFjdGl2ZVNlc3Npb25zKSB7XG5cdFx0XHRhY3RpdmVTZXNzaW9ucy5kZWxldGUoc2Vzc2lvblN0cik7XG5cdFx0XHRpZiAoYWN0aXZlU2Vzc2lvbnMuc2l6ZSA9PT0gMCkge1xuXHRcdFx0XHR0aGlzLl9yb290QWN0aXZlU2Vzc2lvbnMuZGVsZXRlKHJvb3RTdHIpO1xuXHRcdFx0fVxuXHRcdH1cblx0XHRyZXR1cm4gcm9vdFN0cjtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgX3Jlc29sdmVBY3Rpdml0eVJlcG9zaXRvcnlSb290KHNlc3Npb25TdHI6IHN0cmluZyk6IFByb21pc2U8VVJJIHwgdW5kZWZpbmVkPiB7XG5cdFx0Y29uc3Qgd29ya2luZ0RpcmVjdG9yeSA9IHRoaXMuX2dldEFjdGl2aXR5V29ya2luZ0RpcmVjdG9yeShzZXNzaW9uU3RyKTtcblx0XHRpZiAoIXdvcmtpbmdEaXJlY3RvcnkpIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXHRcdGxldCB3b3JraW5nRGlyZWN0b3J5VXJpOiBVUkk7XG5cdFx0dHJ5IHtcblx0XHRcdHdvcmtpbmdEaXJlY3RvcnlVcmkgPSBVUkkucGFyc2Uod29ya2luZ0RpcmVjdG9yeSk7XG5cdFx0fSBjYXRjaCAoZXJyKSB7XG5cdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLndhcm4oYFtDaGFuZ2VzZXRGaWxlTW9uaXRvckNvb3JkaW5hdG9yXSBGYWlsZWQgdG8gcGFyc2UgYWN0aXZlIHdvcmtpbmcgZGlyZWN0b3J5IFVSSSBmb3IgJHtzZXNzaW9uU3RyfTogJHt3b3JraW5nRGlyZWN0b3J5fWAsIGVycik7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblx0XHRyZXR1cm4gdGhpcy5fZ2l0U2VydmljZS5nZXRSZXBvc2l0b3J5Um9vdCh3b3JraW5nRGlyZWN0b3J5VXJpKTtcblx0fVxuXG5cdHByaXZhdGUgX2dldEFjdGl2aXR5V29ya2luZ0RpcmVjdG9yeShzZXNzaW9uU3RyOiBzdHJpbmcpOiBzdHJpbmcgfCB1bmRlZmluZWQge1xuXHRcdGNvbnN0IHdvcmtpbmdEaXJlY3RvcnkgPSBnZXRFZmZlY3RpdmVXb3JraW5nRGlyZWN0b3J5KHRoaXMuX3N0YXRlTWFuYWdlciwgc2Vzc2lvblN0cik7XG5cdFx0aWYgKHdvcmtpbmdEaXJlY3RvcnkpIHtcblx0XHRcdHJldHVybiB3b3JraW5nRGlyZWN0b3J5O1xuXHRcdH1cblx0XHRjb25zdCBwYXJzZWRTdWJhZ2VudCA9IHBhcnNlU3ViYWdlbnRTZXNzaW9uVXJpKHNlc3Npb25TdHIpO1xuXHRcdGlmICghcGFyc2VkU3ViYWdlbnQpIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXHRcdHJldHVybiBnZXRFZmZlY3RpdmVXb3JraW5nRGlyZWN0b3J5KHRoaXMuX3N0YXRlTWFuYWdlciwgcGFyc2VkU3ViYWdlbnQucGFyZW50U2Vzc2lvbi50b1N0cmluZygpKTtcblx0fVxufVxuIl0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7Ozs7QUFLQSxTQUFTLHNCQUFzQjtBQUMvQixTQUFTLFlBQVksZUFBMkIsMkJBQTJCO0FBQzNFLFNBQVMsV0FBVztBQUNwQixTQUFTLHlCQUF5QiwwQkFBMEIsb0NBQW9DO0FBQ2hHLFNBQVMsK0JBQStCO0FBQ3hDLFNBQVMsbUNBQW1DLG9DQUFvQztBQUNoRixTQUFTLDRCQUE0QjtBQUNyQyxTQUFTLGtDQUFrQztBQUMzQyxTQUFnQyw4QkFBOEI7QUFDOUQsU0FBUyxnQ0FBZ0Msb0NBQW9DO0FBQzdFLFNBQVMsbUJBQW1CO0FBQzVCLFNBQVMsaUNBQWlDO0FBRTFDLE1BQU0seUNBQXlDLG9CQUE0QjtBQUFBLEVBQzFFLFlBQ2tCLFNBQ0EsVUFDaEI7QUFDRCxVQUFNO0FBSFc7QUFDQTtBQUFBLEVBR2xCO0FBQUEsRUFFVSx1QkFBdUIsWUFBNEI7QUFDNUQsU0FBSyxRQUFRLFVBQVU7QUFDdkIsV0FBTztBQUFBLEVBQ1I7QUFBQSxFQUVVLHdCQUF3QixZQUEwQjtBQUMzRCxTQUFLLFNBQVMsVUFBVTtBQUFBLEVBQ3pCO0FBQ0Q7QUFrQk8sSUFBTSxrQ0FBTixjQUE4QyxXQUFXO0FBQUEsRUE2Qi9ELFlBQzBDLGVBQ00scUJBQ1IsYUFDSyxrQkFDZCxhQUM3QjtBQUNELFVBQU07QUFObUM7QUFDTTtBQUNSO0FBQ0s7QUFDZDtBQS9CL0I7QUFBQSxTQUFpQiwyQkFBMkIsS0FBSyxVQUFVLElBQUksY0FBMEMsQ0FB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
