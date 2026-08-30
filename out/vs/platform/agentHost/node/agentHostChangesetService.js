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
import { disposableTimeout, Limiter, SequencerByKey } from "../../../base/common/async.js";
import { StopWatch } from "../../../base/common/stopwatch.js";
import { toErrorMessage } from "../../../base/common/errorMessage.js";
import { Disposable, DisposableMap } from "../../../base/common/lifecycle.js";
import { URI } from "../../../base/common/uri.js";
import { ILogService } from "../../log/common/log.js";
import {
  buildBranchChangesetUri,
  buildCompareTurnsChangesetUri,
  buildSessionChangesetUri,
  buildTurnChangesetUri,
  buildUncommittedChangesetUri,
  parseChangesetUri,
  ChangesetKind,
  buildDefaultChangesetCatalog
} from "../common/changesetUri.js";
import { ISessionDataService } from "../common/sessionDataService.js";
import { ActionType } from "../common/state/sessionActions.js";
import {
  ChangesetStatus,
  readSessionGitState,
  isDefaultChatUri,
  SessionLifecycle
} from "../common/state/sessionState.js";
import { IAgentHostStateManager } from "./agentHostStateManager.js";
import { IAgentConfigurationService } from "./agentConfigurationService.js";
import { IAgentHostGitService, META_DIFF_BASE_BRANCH, resolveDiffBaseBranchName } from "../common/agentHostGitService.js";
import { IAgentHostCheckpointService } from "../common/agentHostCheckpointService.js";
import { NodeWorkerDiffComputeService } from "./diffComputeService.js";
import { computeSessionDiffs, computeTurnDiffs, computeUnionedDiffs } from "./sessionDiffAggregator.js";
import { CHANGESET_DB_METADATA_KEYS, CHANGES_SUMMARY_METADATA_KEYS, META_CHANGES_SUMMARY, META_CHANGESET_BRANCH, META_CHANGESET_SESSION, META_LEGACY_DIFFS } from "../common/agentHostChangesetService.js";
import { IAgentHostChangesetSubscriptionService } from "../common/agentHostChangesetSubscriptionService.js";
import { IAgentHostChangesetOperationService } from "../common/agentHostChangesetOperationService.js";
import { IAgentHostReviewService } from "../common/agentHostReviewService.js";
import { extUriBiasedIgnorePathCase, relativePath } from "../../../base/common/resources.js";
import { isMultiRootSession } from "../common/agentHostWorkingDirectories.js";
import { resolveSessionRepositories } from "./agentHostSessionRepositories.js";
import { dedupeSessionFileDiffs, evaluateMultiRootDiffSources } from "./agentHostMultiRootDiff.js";
import { ITelemetryService } from "../../telemetry/common/telemetry.js";
import { reportAgentHostStaticChangesetComputed, reportAgentHostTurnChangesetComputed } from "./agentHostChangesetTelemetry.js";
const MAX_TURN_DIFF_REPOSITORY_CONCURRENCY = 5;
function staticChangesetUri(session, kind) {
  return kind === "branch" ? buildBranchChangesetUri(session) : buildSessionChangesetUri(session);
}
function persistKeyFor(kind) {
  return kind === "branch" ? META_CHANGESET_BRANCH : META_CHANGESET_SESSION;
}
function summariseDiffs(diffs) {
  if (!diffs) {
    return void 0;
  }
  let additions = 0;
  let deletions = 0;
  for (const d of diffs) {
    additions += d.diff?.added ?? 0;
    deletions += d.diff?.removed ?? 0;
  }
  return { additions, deletions, files: diffs.length };
}
function computeChangesSummaryFromLiveState(session) {
  const sessionDiffs = session?.status === ChangesetStatus.Ready ? session.files.map((f) => f.edit) : void 0;
  return summariseDiffs(sessionDiffs);
}
function computeChangesSummaryFromPersistedDiffs(sessionDiffs) {
  return summariseDiffs(sessionDiffs);
}
function tryParsePersistedDiffs(raw, sessionUri, kind, log) {
  if (!raw) {
    return void 0;
  }
  try {
    return JSON.parse(raw);
  } catch (err) {
    log.warn(`[AgentHostChangesetService] Failed to parse persisted ${kind} diffs for ${sessionUri}: ${toErrorMessage(err)}`);
    return void 0;
  }
}
let AgentHostChangesetService = class extends Disposable {
  constructor(_stateManager, _logService, _sessionDataService, _gitService, _checkpointService, _configurationService, _changesetOperationService, _changesetSubscriptions, _reviewService, _telemetryService) {
    super();
    this._stateManager = _stateManager;
    this._logService = _logService;
    this._sessionDataService = _sessionDataService;
    this._gitService = _gitService;
    this._checkpointService = _checkpointService;
    this._configurationService = _configurationService;
    this._changesetOperationService = _changesetOperationService;
    this._changesetSubscriptions = _changesetSubscriptions;
    this._reviewService = _reviewService;
    this._telemetryService = _telemetryService;
    /** Serializes per-session diff computations to avoid races with stale previousDiffs. */
    this._diffComputationSequencer = new SequencerByKey();
    /** Per-session debounce timers for mid-turn diff computation. */
    this._debouncedDiffTimers = this._register(new DisposableMap());
    /** Per-`(session, turnId)` debounce timers for mid-turn per-turn changeset recomputation. */
    this._perTurnDebouncedDiffTimers = this._register(new DisposableMap());
    this._activeStaticComputes = /* @__PURE__ */ new Set();
    /**
     * Sessions whose static changeset refresh was requested before the
     * working directory was known (provisional / not-yet-materialized
     * sessions). Drained from {@link onWorkingDirectoryAvailable} once the
     * working directory is set, which recomputes every changeset still
     * subscribed for the session.
     *
     * Firing a refresh before the working directory is known would compute
     * against a missing directory and the git path would bail, so we defer
     * instead and re-run once materialization / restore populates it.
     */
    this._pendingMaterialization = /* @__PURE__ */ new Set();
    this._diffComputeService = this._createDiffComputeService();
  }
  /** Creates the diff-count service; overridable so tests can supply a synchronous in-process computer. */
  _createDiffComputeService() {
    return this._register(new NodeWorkerDiffComputeService(this._logService));
  }
  /**
   * Returns true when at least one client is subscribed to `changeset`
   * under `session`.
   */
  _hasSubscription(session, changeset) {
    return this._changesetSubscriptions.getSessionSubscriptions(session).has(changeset);
  }
  _hasWorkingDirectory(session) {
    return !!this._configurationService.getEffectiveWorkingDirectories(session)?.[0];
  }
  registerStaticChangesets(session) {
    this._stateManager.registerChangeset(buildBranchChangesetUri(session));
    this._stateManager.registerChangeset(buildUncommittedChangesetUri(session));
    this._stateManager.registerChangeset(buildSessionChangesetUri(session));
  }
  restoreStaticChangeset(session, kind, diffs) {
    const changesetUri = this._stateManager.registerChangeset(staticChangesetUri(session, kind));
    this._publishChangesetDiffs(session, changesetUri, diffs);
  }
  parsePersistedStaticChangesets(sessionUri, metadata) {
    const persistedBranch = tryParsePersistedDiffs(metadata.branchRaw, sessionUri, "branch", this._logService);
    const persistedSession = tryParsePersistedDiffs(metadata.sessionRaw, sessionUri, "session", this._logService) ?? tryParsePersistedDiffs(metadata.legacyRaw, sessionUri, "session (legacy)", this._logService);
    return { branch: persistedBranch, session: persistedSession };
  }
  applyPersistedStaticChangesets(sessionUri, diffs) {
    this._seedIfEmpty(sessionUri, "branch", diffs.branch);
    this._seedIfEmpty(sessionUri, "session", diffs.session);
  }
  restorePersistedStaticChangesets(sessionUri, metadata) {
    const parsed = this.parsePersistedStaticChangesets(sessionUri, metadata);
    this.applyPersistedStaticChangesets(sessionUri, parsed);
    return parsed;
  }
  persistChangesSummary(sessionUri, summary) {
    this._persistSessionFlag(sessionUri, META_CHANGES_SUMMARY, JSON.stringify(summary));
  }
  getListMetadataKeys(sessionUri) {
    const liveSummaryChanges = this._stateManager.getSessionSummary(sessionUri)?.changes;
    if (liveSummaryChanges) {
      return void 0;
    }
    const liveSession = this._stateManager.getChangesetState(buildSessionChangesetUri(sessionUri));
    if (liveSession?.status === ChangesetStatus.Ready) {
      return CHANGES_SUMMARY_METADATA_KEYS;
    }
    return CHANGESET_DB_METADATA_KEYS;
  }
  computeListEntryChanges(sessionUri, metadata) {
    if (this._stateManager.getSessionState(sessionUri)) {
      return void 0;
    }
    const changesSummary = metadata[META_CHANGES_SUMMARY];
    if (changesSummary !== void 0) {
      try {
        return JSON.parse(changesSummary);
      } catch (error) {
        return void 0;
      }
    }
    const liveSession = this._stateManager.getChangesetState(buildBranchChangesetUri(sessionUri));
    const liveChanges = computeChangesSummaryFromLiveState(liveSession);
    if (liveChanges) {
      this.persistChangesSummary(sessionUri, liveChanges);
      return liveChanges;
    }
    const branchRaw = metadata[META_CHANGESET_BRANCH];
    const legacyRaw = metadata[META_LEGACY_DIFFS];
    if (branchRaw === void 0 && legacyRaw === void 0) {
      return void 0;
    }
    const restored = this.parsePersistedStaticChangesets(sessionUri, { branchRaw, legacyRaw });
    const persistedChanges = computeChangesSummaryFromPersistedDiffs(restored.branch);
    if (persistedChanges) {
      this.persistChangesSummary(sessionUri, persistedChanges);
      return persistedChanges;
    }
    return void 0;
  }
  isStaticChangesetComputeActive(changesetUri) {
    return this._activeStaticComputes.has(changesetUri);
  }
  _seedIfEmpty(session, kind, diffs) {
    if (!diffs) {
      return;
    }
    const existing = this._stateManager.getChangesetState(staticChangesetUri(session, kind));
    if (existing && existing.files.length > 0) {
      return;
    }
    this.restoreStaticChangeset(session, kind, diffs);
  }
  refreshChangesetCatalog(session) {
    const state = this._stateManager.getSessionState(session);
    if (!state || state?.lifecycle === SessionLifecycle.CreationFailed) {
      return;
    }
    const changesets = buildDefaultChangesetCatalog(session, state);
    this._stateManager.setSessionChangesets(session, changesets);
  }
  refreshBranchChangeset(session) {
    if (!this._hasWorkingDirectory(session)) {
      this._pendingMaterialization.add(session);
      return;
    }
    this._scheduleStaticRecompute(session, "branch", void 0, this._markStaticChangesetComputing(session, "branch"));
  }
  refreshSessionChangeset(session) {
    if (!this._hasWorkingDirectory(session)) {
      this._pendingMaterialization.add(session);
      return;
    }
    this._scheduleStaticRecompute(session, "session", void 0, this._markStaticChangesetComputing(session, "session"));
  }
  /**
   * Drains static changeset refreshes that were deferred because the
   * session's working directory was not yet known. Called by the
   * coordinator once a session is materialized or restored. Recomputes
   * every changeset still subscribed for the session; subscriptions that
   * dropped while the working directory was unknown are naturally skipped.
   */
  onWorkingDirectoryAvailable(session) {
    if (this._pendingMaterialization.delete(session)) {
      this.recomputeSubscribedChangesets(session);
    }
  }
  /**
   * Recomputes every changeset currently subscribed for `session`. Each
   * subscribed changeset is dispatched to its kind-specific recompute; the
   * recomputes self-defer when the working directory is still unknown.
   */
  recomputeSubscribedChangesets(session) {
    const subscriptions = this._changesetSubscriptions.getSessionSubscriptions(session);
    if (subscriptions.size === 0) {
      return;
    }
    for (const changeset of subscriptions) {
      const parsed = parseChangesetUri(changeset);
      switch (parsed?.kind) {
        case ChangesetKind.Branch:
          this.refreshBranchChangeset(session);
          break;
        case ChangesetKind.Session:
          this.refreshSessionChangeset(session);
          break;
        case ChangesetKind.Uncommitted:
          void this.computeUncommittedChangeset(session);
          break;
        case ChangesetKind.Turn:
          if (parsed.turnId !== void 0) {
            void this.computeTurnChangeset(session, parsed.turnId);
          }
          break;
        default:
          if (changeset === session) {
            this.refreshBranchChangeset(session);
            this.refreshSessionChangeset(session);
          }
          break;
      }
    }
  }
  /**
   * Forgets any deferred static changeset refreshes queued for a session
   * that is being disposed.
   */
  onSessionDisposed(session) {
    this._pendingMaterialization.delete(session);
  }
  computeTurnChangeset(session, turnId) {
    return this._computeTurnChangeset(session, turnId, false);
  }
  async _computeTurnChangeset(session, turnId, reportTelemetry, clientContext) {
    const turnUri = this._stateManager.registerChangeset(buildTurnChangesetUri(session, turnId));
    const stopWatch = StopWatch.create();
    let outcome = "error";
    let result;
    let fileCount;
    try {
      let ref;
      try {
        ref = this._sessionDataService.openDatabase(URI.parse(session));
      } catch (err) {
        this._logService.warn(`[AgentHostChangesetService] Failed to open session database for turn diff: ${session}`, err);
        this._stateManager.dispatchServerAction(turnUri, {
          type: ActionType.ChangesetStatusChanged,
          status: ChangesetStatus.Error,
          error: { errorType: "computeFailed", message: err instanceof Error ? err.message : String(err) }
        });
        outcome = "dbOpenFailed";
        return turnUri;
      }
      try {
        result = await this._computeTurnDiffsPreferCheckpoint(session, ref.object, turnId);
        outcome = result.outcome;
        fileCount = result.diffs.length;
        this._publishChangesetDiffs(session, turnUri, result.diffs);
      } catch (err) {
        this._logService.warn(`[AgentHostChangesetService] Failed to compute turn diffs for ${session}/${turnId}`, err);
        this._stateManager.dispatchServerAction(turnUri, {
          type: ActionType.ChangesetStatusChanged,
          status: ChangesetStatus.Error,
          error: { errorType: "computeFailed", message: err instanceof Error ? err.message : String(err) }
        });
        outcome = "error";
      } finally {
        ref.dispose();
      }
      return turnUri;
    } finally {
      if (reportTelemetry) {
        const workingDirectories = this._configurationService.getEffectiveWorkingDirectories(session);
        reportAgentHostTurnChangesetComputed(this._telemetryService, session, turnId, {
          outcome,
          durationMs: stopWatch.elapsed(),
          isMultiRoot: isMultiRootSession(workingDirectories),
          folderCount: workingDirectories?.length ?? 0,
          ...outcome === "computed" && fileCount !== void 0 ? { fileCount } : {},
          multiRoot: result?.multiRoot
        }, clientContext);
      }
    }
  }
  async computeCompareTurnsChangeset(session, originalTurnId, modifiedTurnId) {
    const compareUri = this._stateManager.registerChangeset(buildCompareTurnsChangesetUri(session, originalTurnId, modifiedTurnId));
    let ref;
    try {
      ref = this._sessionDataService.openDatabase(URI.parse(session));
    } catch (err) {
      this._logService.warn(`[AgentHostChangesetService] Failed to open session database for compare-turns diff: ${session}`, err);
      this._stateManager.dispatchServerAction(compareUri, {
        type: ActionType.ChangesetStatusChanged,
        status: ChangesetStatus.Error,
        error: { errorType: "computeFailed", message: err instanceof Error ? err.message : String(err) }
      });
      return compareUri;
    }
    try {
      const sessionUri = URI.parse(session);
      const [originalCurrentRef, modifiedPair] = await Promise.all([
        this._checkpointService.getTurnCheckpointPair(sessionUri, originalTurnId).then((p) => p?.current),
        this._checkpointService.getTurnCheckpointPair(sessionUri, modifiedTurnId)
      ]);
      if (!originalCurrentRef || !modifiedPair) {
        const missing = !originalCurrentRef && !modifiedPair ? "both turns" : !originalCurrentRef ? "original turn" : "modified turn";
        this._stateManager.dispatchServerAction(compareUri, {
          type: ActionType.ChangesetStatusChanged,
          status: ChangesetStatus.Error,
          error: { errorType: "computeFailed", message: `No checkpoint available for ${missing}; compare requires git-backed sessions.` }
        });
        return compareUri;
      }
      if (originalCurrentRef === modifiedPair.current) {
        this._publishChangesetDiffs(session, compareUri, []);
        return compareUri;
      }
      const workingDir = await this._resolveWorkingDirectory(session);
      if (!workingDir) {
        this._stateManager.dispatchServerAction(compareUri, {
          type: ActionType.ChangesetStatusChanged,
          status: ChangesetStatus.Error,
          error: { errorType: "computeFailed", message: "No working directory recorded for session; compare requires git-backed sessions." }
        });
        return compareUri;
      }
      const diffs = await this._gitService.computeFileDiffsBetweenRefs(workingDir, {
        sessionUri: session,
        fromRef: originalCurrentRef,
        toRef: modifiedPair.current
      });
      if (diffs === void 0) {
        this._stateManager.dispatchServerAction(compareUri, {
          type: ActionType.ChangesetStatusChanged,
          status: ChangesetStatus.Error,
          error: { errorType: "computeFailed", message: `Failed to compute compare-turns diff from git (${originalCurrentRef}..${modifiedPair.current}).` }
        });
        return compareUri;
      }
      this._publishChangesetDiffs(session, compareUri, diffs);
    } catch (err) {
      this._logService.warn(`[AgentHostChangesetService] Failed to compute compare-turns diffs for ${session}/${originalTurnId}/${modifiedTurnId}`, err);
      this._stateManager.dispatchServerAction(compareUri, {
        type: ActionType.ChangesetStatusChanged,
        status: ChangesetStatus.Error,
        error: { errorType: "computeFailed", message: err instanceof Error ? err.message : String(err) }
      });
    } finally {
      ref.dispose();
    }
    return compareUri;
  }
  computeUncommittedChangeset(session) {
    return this._computeUncommittedChangeset(session, void 0, false);
  }
  async _computeUncommittedChangeset(session, turnId, reportTelemetry, clientContext) {
    const uncommittedUri = this._stateManager.registerChangeset(buildUncommittedChangesetUri(session));
    if (!this._hasSubscription(session, uncommittedUri)) {
      return uncommittedUri;
    }
    if (!this._hasWorkingDirectory(session)) {
      this._pendingMaterialization.add(session);
      return uncommittedUri;
    }
    const statusBeforeCompute = this._stateManager.getChangesetState(uncommittedUri)?.status;
    if (statusBeforeCompute !== ChangesetStatus.Computing) {
      this._stateManager.dispatchServerAction(uncommittedUri, {
        type: ActionType.ChangesetStatusChanged,
        status: ChangesetStatus.Computing
      });
    }
    const stopWatch = StopWatch.create();
    const workingDirectories = this._configurationService.getEffectiveWorkingDirectories(session);
    let outcome = "error";
    let fileCount;
    try {
      const diffs = await this._computeUncommittedDiffs(session);
      if (diffs === void 0) {
        this._stateManager.dispatchServerAction(uncommittedUri, {
          type: ActionType.ChangesetStatusChanged,
          status: ChangesetStatus.Error,
          error: { errorType: "computeFailed", message: "Failed to compute uncommitted diff from git." }
        });
        outcome = "gitUnavailable";
        return uncommittedUri;
      }
      this._publishChangesetDiffs(session, uncommittedUri, diffs);
      fileCount = diffs.length;
      outcome = "computed";
    } catch (err) {
      this._logService.warn(`[AgentHostChangesetService] Failed to compute uncommitted diffs for ${session}`, err);
      this._stateManager.dispatchServerAction(uncommittedUri, {
        type: ActionType.ChangesetStatusChanged,
        status: ChangesetStatus.Error,
        error: { errorType: "computeFailed", message: err instanceof Error ? err.message : String(err) }
      });
      outcome = "error";
    } finally {
      if (reportTelemetry) {
        reportAgentHostStaticChangesetComputed(this._telemetryService, session, turnId, {
          kind: "uncommitted",
          outcome,
          durationMs: stopWatch.elapsed(),
          isMultiRoot: isMultiRootSession(workingDirectories),
          folderCount: workingDirectories?.length ?? 0,
          ...outcome === "computed" && fileCount !== void 0 ? { fileCount } : {}
        }, clientContext);
      }
    }
    return uncommittedUri;
  }
  async _computeUncommittedDiffs(session) {
    const workingDirectory = this._stateManager.getSessionState(session)?.workingDirectories?.[0];
    if (!workingDirectory) {
      return void 0;
    }
    let workingDirectoryUri;
    try {
      workingDirectoryUri = URI.parse(workingDirectory);
    } catch {
      return void 0;
    }
    return this._gitService.computeSessionFileDiffs(workingDirectoryUri, {
      sessionUri: session
    });
  }
  async _computeTurnDiffsPreferCheckpoint(session, db, turnId) {
    const trackedSource = this._openTrackedTurnSource(session, db, turnId);
    try {
      if (!trackedSource.sessionUri) {
        return { diffs: [], outcome: "computed" };
      }
      const workingDirectories = this._configurationService.getEffectiveWorkingDirectories(session);
      if (isMultiRootSession(workingDirectories)) {
        return this._computeMultiFolderTurnDiffs(session, trackedSource.sessionUri, trackedSource.db, turnId, workingDirectories);
      }
      const diffs = await this._computeSingleFolderTurnDiffs(session, trackedSource.sessionUri, trackedSource.db, turnId);
      return { diffs, outcome: "computed" };
    } finally {
      trackedSource.dispose();
    }
  }
  /**
   * The single-folder per-turn diff: prefer the checkpoint-ref git diff of the
   * primary working directory, else fall back to the SDK-tracked aggregator.
   */
  async _computeSingleFolderTurnDiffs(session, trackedSession, db, turnId) {
    const pair = await this._checkpointService.getTurnCheckpointPair(URI.parse(session), turnId);
    if (pair && pair.parent !== pair.current) {
      const workingDir = await this._resolveWorkingDirectory(session);
      if (workingDir) {
        const fromRefDiffs = await this._gitService.computeFileDiffsBetweenRefs(workingDir, {
          sessionUri: session,
          fromRef: pair.parent,
          toRef: pair.current
        });
        if (fromRefDiffs) {
          return fromRefDiffs;
        }
      }
    } else if (pair && pair.parent === pair.current) {
      return [];
    }
    return computeTurnDiffs(trackedSession, db, this._diffComputeService, turnId);
  }
  _openTrackedTurnSource(session, defaultDatabase, turnId) {
    const sessionState = this._stateManager.getSessionState(session);
    if (!sessionState) {
      return { sessionUri: session, db: defaultDatabase, dispose: () => {
      } };
    }
    const owningResources = [];
    if (sessionState.activeTurn?.id === turnId || (sessionState.turns ?? []).some((turn) => turn.id === turnId)) {
      owningResources.push(session);
    }
    for (const chat2 of sessionState.chats ?? []) {
      if (isDefaultChatUri(chat2.resource)) {
        continue;
      }
      const chatState = this._stateManager.getChatState(chat2.resource);
      if (chatState?.activeTurn?.id === turnId || chatState?.turns.some((turn) => turn.id === turnId)) {
        owningResources.push(chat2.resource);
      }
    }
    if (owningResources.length > 1) {
      this._logService.warn(`[AgentHostChangesetService] Turn id ${turnId} is shared by multiple chats in ${session}; skipping ambiguous tracked-file fallback`);
      return { sessionUri: void 0, db: defaultDatabase, dispose: () => {
      } };
    }
    if (owningResources.length === 0 || owningResources[0] === session) {
      return { sessionUri: session, db: defaultDatabase, dispose: () => {
      } };
    }
    const chat = owningResources[0];
    const chatDatabase = this._sessionDataService.openDatabase(URI.parse(chat));
    return { sessionUri: chat, db: chatDatabase.object, dispose: () => chatDatabase.dispose() };
  }
  /**
   * The multi-folder per-turn diff: diff each unique git repository once (in
   * parallel) from its checkpoint pair and add the tracked edits scoped to
   * the non-git folders. Per-folder failures are logged and skipped so one
   * folder never fails the whole turn changeset.
   */
  async _computeMultiFolderTurnDiffs(session, trackedSession, db, turnId, workingDirectories) {
    const sessionUri = URI.parse(session);
    const workingDirectoryUris = this._parseWorkingDirectoryUris(session, workingDirectories);
    let gitRepositories;
    let nonGitDirectories;
    try {
      ({ gitRepositories, nonGitDirectories } = await resolveSessionRepositories(workingDirectoryUris, this._gitService, (directory, err) => {
        this._logService.error(`[AgentHostChangesetService] Failed to resolve repository root for ${directory.toString()} in multi-folder turn ${session}/${turnId}; treating it as a non-git folder.`, err);
      }));
    } catch (err) {
      this._logService.error(`[AgentHostChangesetService] Failed to resolve repositories for multi-folder turn ${session}/${turnId}`, err);
      return { diffs: [], outcome: "resolveFailed" };
    }
    const limiter = new Limiter(MAX_TURN_DIFF_REPOSITORY_CONCURRENCY);
    const [perRepoDiffs, nonGitDiffs] = await Promise.all([
      Promise.all(gitRepositories.map((repoRoot) => limiter.queue(() => this._computeRepoTurnDiffs(session, trackedSession, sessionUri, db, turnId, repoRoot)))),
      this._computeNonGitTurnDiffsFromTrackedEdits(session, trackedSession, db, turnId, nonGitDirectories)
    ]).finally(() => limiter.dispose());
    const diffs = dedupeSessionFileDiffs([...perRepoDiffs.map((r) => r.diffs), nonGitDiffs]);
    return {
      diffs,
      outcome: "computed",
      multiRoot: {
        uniqueGitFolderCount: gitRepositories.length,
        nonGitFolderCount: nonGitDirectories.length,
        trackedEditFallbackFolderCount: perRepoDiffs.filter((r) => r.usedFallback).length
      }
    };
  }
  /**
   * Computes one git repository's per-turn diff from its checkpoint pair.
   * When the git diff is unavailable (missing checkpoint pair, `undefined`
   * diff, or an error), that repository falls back to its tracked edits so
   * one repo's git failure never drops the folder — mirroring the
   * single-folder path's edit-tracker fallback. `usedFallback` reports whether
   * that fallback was taken. Every git failure is logged as an error.
   */
  async _computeRepoTurnDiffs(session, trackedSession, sessionUri, db, turnId, repoRoot) {
    try {
      const pair = await this._checkpointService.getTurnCheckpointPair(sessionUri, turnId, repoRoot);
      if (!pair) {
        this._logService.error(`[AgentHostChangesetService] No checkpoint pair for multi-folder turn ${session}/${turnId} in repository ${repoRoot.toString()}; falling back to tracked edits for that repository.`);
        return { diffs: await this._computeRepoTurnDiffsFromTrackedEdits(session, trackedSession, db, turnId, repoRoot), usedFallback: true };
      }
      if (pair.parent === pair.current) {
        return { diffs: [], usedFallback: false };
      }
      const diffs = await this._gitService.computeFileDiffsBetweenRefs(repoRoot, {
        sessionUri: session,
        fromRef: pair.parent,
        toRef: pair.current
      });
      if (!diffs) {
        this._logService.error(`[AgentHostChangesetService] Git turn diff unavailable for multi-folder turn ${session}/${turnId} in repository ${repoRoot.toString()}; falling back to tracked edits for that repository.`);
        return { diffs: await this._computeRepoTurnDiffsFromTrackedEdits(session, trackedSession, db, turnId, repoRoot), usedFallback: true };
      }
      return { diffs, usedFallback: false };
    } catch (err) {
      this._logService.error(`[AgentHostChangesetService] Failed to compute git turn diff for multi-folder turn ${session}/${turnId} in repository ${repoRoot.toString()}; falling back to tracked edits for that repository.`, err);
      return { diffs: await this._computeRepoTurnDiffsFromTrackedEdits(session, trackedSession, db, turnId, repoRoot), usedFallback: true };
    }
  }
  /**
   * Computes one git repository's per-turn diff from the **edit tracker's
   * recorded file edits** (the session DB `file_edits` table written by
   * `FileEditTracker`), scoped to that repo root — NOT from git.
   *
   * Used as the per-repo fallback when the repository's git turn diff is
   * unavailable (missing checkpoint pair, `undefined` diff, or an error).
   * Unlike the git path, this only sees changes the agent made through tracked
   * edits. Scoping to the repo root keeps the git/non-git partition intact.
   * Logs and returns an empty list if the fallback itself fails, so the folder
   * contributes nothing rather than failing the whole turn.
   */
  async _computeRepoTurnDiffsFromTrackedEdits(session, trackedSession, db, turnId, repoRoot) {
    try {
      return await computeTurnDiffs(trackedSession, db, this._diffComputeService, turnId, [repoRoot]);
    } catch (err) {
      this._logService.error(`[AgentHostChangesetService] Tracked-edit fallback turn diff failed for multi-folder turn ${session}/${turnId} in repository ${repoRoot.toString()}`, err);
      return [];
    }
  }
  /**
   * Computes the session's non-git folders' per-turn diff from the **edit
   * tracker's recorded file edits** (the session DB `file_edits` table written
   * by `FileEditTracker`), scoped to those folder roots. Non-git folders have
   * no git to diff, so tracked edits are their only source (not a fallback).
   *
   * Scoping to the non-git roots keeps the git/non-git partition intact, so
   * git-folder edits (already covered by their git diff) are not
   * double-counted. Returns an empty list when there are no non-git folders,
   * and logs and returns an empty list on failure, so this never fails the
   * whole turn.
   */
  async _computeNonGitTurnDiffsFromTrackedEdits(session, trackedSession, db, turnId, nonGitDirectories) {
    if (nonGitDirectories.length === 0) {
      return [];
    }
    try {
      return await computeTurnDiffs(trackedSession, db, this._diffComputeService, turnId, nonGitDirectories);
    } catch (err) {
      this._logService.error(`[AgentHostChangesetService] Failed to compute non-git tracked-edit turn diff for multi-folder turn ${session}/${turnId}`, err);
      return [];
    }
  }
  /**
   * Parses a session's working-directory strings into URIs, logging and
   * skipping any that fail to parse so a malformed entry never fails the turn.
   */
  _parseWorkingDirectoryUris(session, workingDirectories) {
    const uris = [];
    for (const workingDirectory of workingDirectories) {
      try {
        uris.push(URI.parse(workingDirectory));
      } catch (err) {
        this._logService.warn(`[AgentHostChangesetService] Skipping unparseable working directory '${workingDirectory}' for session ${session}`, err);
      }
    }
    return uris;
  }
  /**
   * Recomputes and publishes the all-folder `summary.changes` chip for a
   * multi-folder session, writing both `META_CHANGES_SUMMARY` and the in-memory
   * summary. Sums every git repo's branch delta plus the non-git folders' edits
   * recorded by the edit tracker (`FileEditTracker`). Per-repo failures are
   * skipped and the fan-out runs at bounded concurrency; if all sources fail
   * the cached summary is preserved instead of writing zero.
   */
  async _updateMultiFolderChangesSummary(session, db, workingDirectories, primaryBranchDiffs) {
    const workingDirectoryUris = this._parseWorkingDirectoryUris(session, workingDirectories);
    let gitRepositories;
    let nonGitDirectories;
    try {
      ({ gitRepositories, nonGitDirectories } = await resolveSessionRepositories(workingDirectoryUris, this._gitService));
    } catch (err) {
      this._logService.error(`[AgentHostChangesetService] Failed to resolve repositories for multi-folder branch summary ${session}`, err);
      return;
    }
    const primaryRepositoryRoot = workingDirectoryUris.length > 0 ? await this._gitService.getRepositoryRoot(workingDirectoryUris[0]) : void 0;
    const primaryRepositoryKey = primaryRepositoryRoot ? extUriBiasedIgnorePathCase.getComparisonKey(primaryRepositoryRoot) : void 0;
    const sessionBaseBranch = await this._resolveBranchBaseBranch(session, db);
    const limiter = new Limiter(MAX_TURN_DIFF_REPOSITORY_CONCURRENCY);
    const [perRepoDiffs, nonGitDiffs] = await Promise.all([
      Promise.all(gitRepositories.map((repoRoot) => limiter.queue(async () => {
        try {
          const isPrimary = primaryRepositoryKey !== void 0 && extUriBiasedIgnorePathCase.getComparisonKey(repoRoot) === primaryRepositoryKey;
          if (isPrimary && primaryBranchDiffs) {
            return primaryBranchDiffs;
          }
          const baseBranch = isPrimary ? sessionBaseBranch : (await this._gitService.getDefaultBranch(repoRoot))?.name;
          return await this._computeRepoBranchDiffs(session, repoRoot, baseBranch);
        } catch (err) {
          this._logService.error(`[AgentHostChangesetService] Failed to compute branch diff for multi-folder branch summary ${session} in repository ${repoRoot.toString()}`, err);
          return void 0;
        }
      }))),
      this._computeNonGitBranchDiffs(session, db, nonGitDirectories)
    ]).finally(() => limiter.dispose());
    const orderedSources = [...perRepoDiffs];
    if (nonGitDirectories.length > 0) {
      orderedSources.push(nonGitDiffs);
    }
    const evaluation = evaluateMultiRootDiffSources(orderedSources);
    if (evaluation.outcome === "failed") {
      this._logService.warn(`[AgentHostChangesetService] No diff source available for multi-folder branch summary ${session}; preserving the cached summary.`);
      return;
    }
    let additions = 0;
    let deletions = 0;
    let files = 0;
    for (const diffs of evaluation.availableSources) {
      const summary = summariseDiffs(diffs);
      if (summary) {
        additions += summary.additions ?? 0;
        deletions += summary.deletions ?? 0;
        files += summary.files ?? 0;
      }
    }
    const changesSummary = { additions, deletions, files };
    this.persistChangesSummary(session, changesSummary);
    this._stateManager.setSessionSummaryChanges(session, changesSummary);
  }
  /**
   * Computes one git repository's branch diff for the multi-folder summary,
   * logging and returning `undefined` on any failure so a single repo never
   * fails the whole aggregate and an unavailable repo is counted as such (not
   * as a spurious zero). Uses the same `computeSessionFileDiffs` primitive as
   * the primary branch changeset, threading the resolved `baseBranch` so
   * committed-on-branch work is counted (not just uncommitted).
   */
  async _computeRepoBranchDiffs(session, repoRoot, baseBranch) {
    try {
      const diffs = await this._gitService.computeSessionFileDiffs(repoRoot, { sessionUri: session, baseBranch });
      if (!diffs) {
        this._logService.error(`[AgentHostChangesetService] Git branch diff unavailable for multi-folder branch summary ${session} in repository ${repoRoot.toString()}; skipping that repository.`);
        return void 0;
      }
      return diffs;
    } catch (err) {
      this._logService.error(`[AgentHostChangesetService] Failed to compute git branch diff for multi-folder branch summary ${session} in repository ${repoRoot.toString()}`, err);
      return void 0;
    }
  }
  /**
   * The session-level DB-tracked edits for the non-git folders, scoped to
   * those roots so the multi-folder summary counts non-git folder changes
   * (git folders are already covered by their branch diff, and the git/non-git
   * partition keeps the two disjoint). Uses full-session aggregation so a file
   * edited across several turns counts once. Callers only treat this as a
   * source when there ARE non-git folders; it returns `undefined` on failure
   * so a failed non-git source is counted as unavailable rather than empty.
   */
  async _computeNonGitBranchDiffs(session, db, nonGitDirectories) {
    if (nonGitDirectories.length === 0) {
      return [];
    }
    try {
      return await computeSessionDiffs(session, db, this._diffComputeService, void 0, nonGitDirectories);
    } catch (err) {
      this._logService.error(`[AgentHostChangesetService] Failed to compute non-git DB branch summary for multi-folder session ${session}`, err);
      return void 0;
    }
  }
  async _resolveWorkingDirectory(session) {
    const workingDirectories = this._configurationService.getEffectiveWorkingDirectories(session);
    return workingDirectories && workingDirectories.length > 0 ? URI.parse(workingDirectories[0]) : void 0;
  }
  // ---- Lifecycle hooks invoked by AgentSideEffects -----------------------
  onToolCallEditsApplied(session, turnId, clientContext) {
    this._scheduleDebouncedDiffComputation(session, turnId, clientContext);
    if (this._hasSubscription(session, buildTurnChangesetUri(session, turnId))) {
      this._scheduleDebouncedTurnDiffComputation(session, turnId, clientContext);
    }
  }
  onTurnComplete(session, turnId, clientContext) {
    this._cancelDebouncedDiffComputation(session);
    if (turnId !== void 0) {
      this._cancelDebouncedTurnDiffComputation(session, turnId);
      if (this._hasSubscription(session, buildTurnChangesetUri(session, turnId))) {
        this._scheduleTurnRecompute(session, turnId, true, clientContext);
      }
    }
    if (this._hasSubscription(session, buildUncommittedChangesetUri(session))) {
      this._scheduleUncommittedRecompute(session, turnId, true, clientContext);
    }
    this._scheduleStaticRecompute(session, "branch", turnId, void 0, true, clientContext);
    this._scheduleStaticRecompute(session, "session", turnId, void 0, true, clientContext);
  }
  onSessionTruncated(session) {
    this._scheduleStaticRecompute(session, "branch", void 0, void 0, true);
    this._scheduleStaticRecompute(session, "session", void 0, void 0, true);
  }
  // ---- Internal compute pipeline -----------------------------------------
  /**
   * Schedules a debounced session-changeset recomputation. Uncommitted
   * recomputes ride the same turn-complete path; mid-turn debounce only
   * makes sense for the SDK-tracked session-wide diff (which sees fresh
   * `tool_complete` events between turn boundaries).
   */
  _scheduleDebouncedDiffComputation(session, turnId, clientContext) {
    this._debouncedDiffTimers.set(session, disposableTimeout(() => {
      this._debouncedDiffTimers.deleteAndDispose(session);
      this._scheduleStaticRecompute(session, "branch", turnId, void 0, false, clientContext);
      this._scheduleStaticRecompute(session, "session", turnId, void 0, false, clientContext);
    }, AgentHostChangesetService._DIFF_DEBOUNCE_MS));
  }
  /**
   * Cancels any pending debounced diff computation for a session.
   * Called at turn end before the final (non-debounced) computation.
   */
  _cancelDebouncedDiffComputation(session) {
    this._debouncedDiffTimers.deleteAndDispose(session);
  }
  /**
   * Schedules a debounced per-turn changeset recomputation. Mirrors
   * {@link _scheduleDebouncedDiffComputation} but uses a per-
   * `(session, turnId)` map key so a long-running per-turn compute
   * doesn't block the static session recompute path (and vice versa).
   */
  _scheduleDebouncedTurnDiffComputation(session, turnId, clientContext) {
    const key = `${session}\0${turnId}`;
    this._perTurnDebouncedDiffTimers.set(key, disposableTimeout(() => {
      this._perTurnDebouncedDiffTimers.deleteAndDispose(key);
      this._scheduleTurnRecompute(session, turnId, false, clientContext);
    }, AgentHostChangesetService._DIFF_DEBOUNCE_MS));
  }
  /**
   * Cancels any pending debounced per-turn diff computation for a
   * `(session, turnId)`. Called at turn end before the final
   * (non-debounced) per-turn computation.
   */
  _cancelDebouncedTurnDiffComputation(session, turnId) {
    this._perTurnDebouncedDiffTimers.deleteAndDispose(`${session}\0${turnId}`);
  }
  /**
   * Queues a per-turn recompute on a per-`(session, turnId)` sequencer
   * key so back-to-back recomputes for the same turn serialise, but
   * recomputes for different turns (or for the static `session` /
   * `uncommitted` slots) run independently. Fire-and-forget — failures
   * are logged inside `computeTurnChangeset` and do not fail the turn.
   */
  _scheduleTurnRecompute(session, turnId, reportTelemetry = false, clientContext) {
    this._diffComputationSequencer.queue(`${session}\0turn\0${turnId}`, () => this._computeTurnChangeset(session, turnId, reportTelemetry, clientContext).then(() => void 0));
  }
  _scheduleUncommittedRecompute(session, turnId, reportTelemetry = false, clientContext) {
    this._diffComputationSequencer.queue(`${session}\0uncommitted`, () => this._computeUncommittedChangeset(session, turnId, reportTelemetry, clientContext).then(() => void 0));
  }
  /**
   * Schedules a static changeset (`uncommitted` or `session`) recompute,
   * serialised per-session so back-to-back triggers don't race against
   * stale `previousDiffs` reads. Fire-and-forget — failures are logged
   * but do not fail the turn.
   */
  _scheduleStaticRecompute(session, kind, changedTurnId, statusBeforeRefresh, reportTelemetry = false, clientContext) {
    this._diffComputationSequencer.queue(`${session}\0${kind}`, () => this._doComputeStaticChangeset(session, kind, changedTurnId, statusBeforeRefresh, reportTelemetry, clientContext));
  }
  _markStaticChangesetComputing(session, kind) {
    const changesetUri = staticChangesetUri(session, kind);
    this._stateManager.registerChangeset(changesetUri);
    const status = this._stateManager.getChangesetState(changesetUri)?.status;
    if (status !== ChangesetStatus.Computing) {
      this._stateManager.dispatchServerAction(changesetUri, {
        type: ActionType.ChangesetStatusChanged,
        status: ChangesetStatus.Computing
      });
    }
    return status;
  }
  async _doComputeStaticChangeset(session, kind, changedTurnId, statusBeforeRefresh, reportTelemetry = false, clientContext) {
    const changesetUri = staticChangesetUri(session, kind);
    const stopWatch = StopWatch.create();
    const workingDirectories = this._configurationService.getEffectiveWorkingDirectories(session);
    let outcome = "error";
    let fileCount = 0;
    let incrementalUsed = false;
    let usedEditTrackerFallback = false;
    const emitStaticTelemetry = () => {
      if (reportTelemetry) {
        reportAgentHostStaticChangesetComputed(this._telemetryService, session, changedTurnId, {
          kind,
          outcome,
          durationMs: stopWatch.elapsed(),
          isMultiRoot: isMultiRootSession(workingDirectories),
          folderCount: workingDirectories?.length ?? 0,
          ...outcome === "computed" ? { fileCount } : {},
          ...kind === "session" ? { incrementalUsed, usedEditTrackerFallback } : {}
        }, clientContext);
      }
    };
    this._activeStaticComputes.add(changesetUri);
    const statusBeforeCompute = statusBeforeRefresh ?? this._stateManager.getChangesetState(changesetUri)?.status;
    let ref;
    try {
      ref = this._sessionDataService.openDatabase(URI.parse(session));
    } catch (err) {
      this._logService.warn(`[AgentHostChangesetService] Failed to open session database for ${kind} diff computation: ${session}`, err);
      this._restoreStaticChangesetStatus(changesetUri, statusBeforeCompute);
      this._activeStaticComputes.delete(changesetUri);
      this._stateManager.onChangesetLivenessChanged();
      outcome = "dbOpenFailed";
      emitStaticTelemetry();
      return;
    }
    this._stateManager.registerChangeset(changesetUri);
    try {
      let diffs = await this._tryComputeGitDiffs(session, ref.object, kind);
      if (!diffs) {
        if (kind === "branch") {
          const workingDirectories2 = this._configurationService.getEffectiveWorkingDirectories(session);
          if (isMultiRootSession(workingDirectories2)) {
            await this._updateMultiFolderChangesSummary(session, ref.object, workingDirectories2);
          }
          this._logService.debug(`[AgentHostChangesetService] Branch git diff unavailable for ${session}; preserving cached changeset. previousStatus=${statusBeforeCompute ?? "unknown"} cachedFiles=${this._stateManager.getChangesetState(changesetUri)?.files.length ?? 0}`);
          this._restoreStaticChangesetStatus(changesetUri, statusBeforeCompute);
          outcome = "preserved";
          return;
        }
        usedEditTrackerFallback = true;
        const peerSources = this._openPeerChatSources(session);
        try {
          if (peerSources.length > 0) {
            const sources = [
              { sessionUri: session, db: ref.object },
              ...peerSources.map((p) => ({ sessionUri: p.sessionUri, db: p.ref.object }))
            ];
            diffs = await computeUnionedDiffs(sources, this._diffComputeService);
          } else {
            let incremental;
            if (changedTurnId) {
              const previousDiffs = this._readPreviousChangesetDiffs(changesetUri);
              if (previousDiffs) {
                incremental = { changedTurnId, previousDiffs: [...previousDiffs] };
                incrementalUsed = true;
              }
            }
            diffs = await computeSessionDiffs(session, ref.object, this._diffComputeService, incremental);
          }
        } finally {
          for (const peer of peerSources) {
            peer.ref.dispose();
          }
        }
      }
      const reviewed = kind === ChangesetKind.Branch ? await this._computeReviewedInfo(session, ref.object) : void 0;
      this._publishChangesetDiffs(session, changesetUri, diffs, reviewed);
      fileCount = diffs.length;
      outcome = "computed";
      this._persistSessionFlag(session, persistKeyFor(kind), JSON.stringify(diffs));
      if (kind === ChangesetKind.Branch) {
        this._persistSessionFlag(session, META_LEGACY_DIFFS, JSON.stringify(diffs));
        const workingDirectories2 = this._configurationService.getEffectiveWorkingDirectories(session);
        if (isMultiRootSession(workingDirectories2)) {
          await this._updateMultiFolderChangesSummary(session, ref.object, workingDirectories2, diffs);
        } else {
          const changesSummary = summariseDiffs(diffs) ?? { additions: 0, deletions: 0, files: 0 };
          this.persistChangesSummary(session, changesSummary);
          this._stateManager.setSessionSummaryChanges(session, changesSummary);
        }
      }
    } catch (err) {
      this._logService.warn(`[AgentHostChangesetService] Failed to compute ${kind} diffs`, err);
      this._stateManager.dispatchServerAction(changesetUri, {
        type: ActionType.ChangesetStatusChanged,
        status: ChangesetStatus.Error,
        error: { errorType: "computeFailed", message: err instanceof Error ? err.message : String(err) }
      });
      outcome = "error";
    } finally {
      this._activeStaticComputes.delete(changesetUri);
      this._stateManager.onChangesetLivenessChanged();
      ref.dispose();
      emitStaticTelemetry();
    }
  }
  /**
   * Refresh requests optimistically mark static changesets as Computing
   * while preserving their current files. Some refresh paths intentionally
   * do not publish a replacement file list (for example, uncommitted git
   * diff is temporarily unavailable), so restore the previous non-computing
   * status instead of leaving a stale cached snapshot stuck as Computing.
   */
  _restoreStaticChangesetStatus(changesetUri, status) {
    if (!status || status === ChangesetStatus.Computing) {
      return;
    }
    this._stateManager.dispatchServerAction(changesetUri, {
      type: ActionType.ChangesetStatusChanged,
      status
    });
  }
  /**
   * Reads the previous diff list back out of the changeset state so the
   * incremental aggregator can avoid recomputing files that haven't
   * changed.
   */
  _readPreviousChangesetDiffs(changesetUri) {
    const state = this._stateManager.getChangesetState(changesetUri);
    if (!state || state.files.length === 0) {
      return void 0;
    }
    return state.files.map((f) => f.edit);
  }
  /**
   * Translates the new file list into a sequence of changeset/* actions
   * (fileSet, fileRemoved) and moves the changeset to `ready` once the
   * fresh file list has been applied.
   */
  _publishChangesetDiffs(session, changesetUri, diffs, reviewed) {
    const operations = this._changesetOperationService.getOperations(session, changesetUri);
    const files = [];
    for (const edit of diffs) {
      const id = edit.after?.uri ?? edit.before?.uri;
      if (!id) {
        continue;
      }
      if (reviewed) {
        const relPath = relativePath(reviewed.repoRoot, URI.parse(id));
        files.push({
          id,
          edit,
          reviewed: relPath ? reviewed.paths.has(relPath) : false
        });
      } else {
        files.push({ id, edit });
      }
    }
    this._stateManager.dispatchServerAction(changesetUri, {
      type: ActionType.ChangesetContentChanged,
      files,
      operations: operations ? [...operations] : void 0
    });
    const status = this._stateManager.getChangesetState(changesetUri)?.status;
    if (status !== ChangesetStatus.Ready) {
      this._stateManager.dispatchServerAction(changesetUri, {
        type: ActionType.ChangesetStatusChanged,
        status: ChangesetStatus.Ready
      });
    }
  }
  /**
   * Opens the databases for every non-default (peer) chat in a multi-chat
   * session. Each peer chat records its file edits into its own database
   * keyed by the chat URI, so the session changeset must union those
   * databases with the session DB. Returns an empty array for single-chat
   * sessions. Callers MUST dispose every returned `ref`.
   */
  _openPeerChatSources(session) {
    const chats = this._stateManager.getSessionState(session)?.chats ?? [];
    const sources = [];
    for (const chat of chats) {
      if (isDefaultChatUri(chat.resource)) {
        continue;
      }
      try {
        const ref = this._sessionDataService.openDatabase(URI.parse(chat.resource));
        sources.push({ sessionUri: chat.resource, ref });
      } catch (err) {
        this._logService.warn(`[AgentHostChangesetService] Failed to open peer chat database for session changes: ${chat.resource}`, err);
      }
    }
    return sources;
  }
  /**
   * Returns the turn id whose checkpoint best represents the latest state of
   * the session's shared working tree. For single-chat sessions this is the
   * default chat's last turn. For multi-chat sessions it is the last turn of
   * the most-recently-modified chat (peer-chat turn checkpoints are stored
   * under the session URI keyed by their turn id). Returns `undefined` when
   * no chat has any turns.
   */
  _latestTurnIdAcrossChats(session) {
    const sessionState = this._stateManager.getSessionState(session);
    if (!sessionState) {
      return void 0;
    }
    const chats = sessionState.chats ?? [];
    if (chats.length <= 1) {
      return sessionState.turns.at(-1)?.id;
    }
    let bestTurnId;
    let bestModifiedAt = "";
    for (const chat of chats) {
      const turns = isDefaultChatUri(chat.resource) ? sessionState.turns : this._stateManager.getChatState(chat.resource)?.turns;
      const lastTurnId = turns?.at(-1)?.id;
      if (lastTurnId && chat.modifiedAt >= bestModifiedAt) {
        bestModifiedAt = chat.modifiedAt;
        bestTurnId = lastTurnId;
      }
    }
    return bestTurnId;
  }
  /**
   * Computes diffs for a static changeset by shelling out to git.
   * Returns the diff list when the session has a working directory and
   * that directory is a git work tree; returns `undefined` otherwise so
   * the caller can fall back to the edit-tracker aggregator (for
   * `kind: 'session'`) or preserve cached state (for `kind: 'branch'`).
   *
   * For `kind: 'session'` the diff is computed between the baseline
   * checkpoint ref and the latest turn checkpoint ref.
   * For `kind: 'branch'` the diff is computed against the merge-base
   * with {@link META_DIFF_BASE_BRANCH} when one is set; without a base
   * branch git falls back to `HEAD`.
   */
  async _tryComputeGitDiffs(session, db, kind) {
    const workingDirectory = this._stateManager.getSessionState(session)?.workingDirectories?.[0];
    if (!workingDirectory) {
      return void 0;
    }
    let workingDirectoryUri;
    try {
      workingDirectoryUri = URI.parse(workingDirectory);
    } catch {
      return void 0;
    }
    if (kind === "session") {
      const latestTurnId = this._latestTurnIdAcrossChats(session);
      if (!latestTurnId) {
        return void 0;
      }
      const sessionUri = URI.parse(session);
      const [baseline, pair] = await Promise.all([
        this._checkpointService.getBaselineCheckpoint(sessionUri),
        this._checkpointService.getTurnCheckpointPair(sessionUri, latestTurnId)
      ]);
      if (!baseline || !pair) {
        return void 0;
      }
      try {
        return await this._gitService.computeFileDiffsBetweenRefs(workingDirectoryUri, {
          sessionUri: session,
          fromRef: baseline,
          toRef: pair.current
        });
      } catch (err) {
        this._logService.warn(`[AgentHostChangesetService] git-driven ${kind} diff computation failed; falling back to edit-tracker`, err);
        return void 0;
      }
    }
    const baseBranch = await this._resolveBranchBaseBranch(session, db);
    try {
      return await this._gitService.computeSessionFileDiffs(workingDirectoryUri, {
        sessionUri: session,
        baseBranch
      });
    } catch (err) {
      this._logService.warn(`[AgentHostChangesetService] git-driven ${kind} diff computation failed; falling back to edit-tracker`, err);
      return void 0;
    }
  }
  /**
   * Resolves the Branch Changes base branch, reused by the diff computation
   * and the review-status lookup so both are keyed on the same baseline.
   */
  async _resolveBranchBaseBranch(session, db) {
    const persistedBaseBranch = await db.getMetadata(META_DIFF_BASE_BRANCH);
    const gitStateBaseBranch = readSessionGitState(this._stateManager.getSessionState(session)?._meta)?.baseBranchName;
    if (!persistedBaseBranch && gitStateBaseBranch) {
      this._logService.debug(`[AgentHostChangesetService] Using _meta.git base branch fallback for Branch Changes in ${session}: ${gitStateBaseBranch}`);
    }
    return resolveDiffBaseBranchName(persistedBaseBranch, gitStateBaseBranch);
  }
  /**
   * Computes the reviewed-paths overlay for the Branch changeset: the
   * repository root (used to key file ids to repo-relative paths) and the set
   * of reviewed repo-relative paths. Returns `undefined` when the session has
   * no git working directory (review status is then simply omitted).
   */
  async _computeReviewedInfo(session, db) {
    const workingDirectory = this._stateManager.getSessionState(session)?.workingDirectories?.[0];
    if (!workingDirectory) {
      return void 0;
    }
    let workingDirectoryUri;
    try {
      workingDirectoryUri = URI.parse(workingDirectory);
    } catch {
      return void 0;
    }
    const repoRoot = await this._gitService.getRepositoryRoot(workingDirectoryUri);
    if (!repoRoot) {
      return void 0;
    }
    const baseBranch = await this._resolveBranchBaseBranch(session, db);
    const paths = await this._reviewService.getReviewedPaths(session, workingDirectoryUri, baseBranch);
    return { repoRoot, paths };
  }
  /**
   * Persists a session metadata key/value pair to the session database.
   * Counterpart in `agentSideEffects.ts` (`AgentSideEffects._persistSessionFlag`):
   * keep both copies in sync if the signature changes. Duplicated rather
   * than lifted because the two consumers persist disjoint metadata
   * (changeset diffs here vs. customTitle / isRead / isArchived /
   * configValues there) and a shared util would only have two callers.
   */
  _persistSessionFlag(session, key, value) {
    const ref = this._sessionDataService.openDatabase(URI.parse(session));
    ref.object.setMetadata(key, value).catch((err) => {
      this._logService.warn(`[AgentHostChangesetService] Failed to persist ${key}`, err);
    }).finally(() => {
      ref.dispose();
    });
  }
};
AgentHostChangesetService._DIFF_DEBOUNCE_MS = 5e3;
AgentHostChangesetService = __decorateClass([
  __decorateParam(0, IAgentHostStateManager),
  __decorateParam(1, ILogService),
  __decorateParam(2, ISessionDataService),
  __decorateParam(3, IAgentHostGitService),
  __decorateParam(4, IAgentHostCheckpointService),
  __decorateParam(5, IAgentConfigurationService),
  __decorateParam(6, IAgentHostChangesetOperationService),
  __decorateParam(7, IAgentHostChangesetSubscriptionService),
  __decorateParam(8, IAgentHostReviewService),
  __decorateParam(9, ITelemetryService)
], AgentHostChangesetService);
export {
  AgentHostChangesetService
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxwbGF0Zm9ybVxcYWdlbnRIb3N0XFxub2RlXFxhZ2VudEhvc3RDaGFuZ2VzZXRTZXJ2aWNlLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IHsgZGlzcG9zYWJsZVRpbWVvdXQsIExpbWl0ZXIsIFNlcXVlbmNlckJ5S2V5IH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vYXN5bmMuanMnO1xuaW1wb3J0IHsgU3RvcFdhdGNoIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vc3RvcHdhdGNoLmpzJztcbmltcG9ydCB7IHRvRXJyb3JNZXNzYWdlIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vZXJyb3JNZXNzYWdlLmpzJztcbmltcG9ydCB7IERpc3Bvc2FibGUsIERpc3Bvc2FibGVNYXAgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgVVJJIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vdXJpLmpzJztcbmltcG9ydCB7IElMb2dTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vbG9nL2NvbW1vbi9sb2cuanMnO1xuaW1wb3J0IHtcblx0YnVpbGRCcmFuY2hDaGFuZ2VzZXRVcmksXG5cdGJ1aWxkQ29tcGFyZVR1cm5zQ2hhbmdlc2V0VXJpLFxuXHRidWlsZFNlc3Npb25DaGFuZ2VzZXRVcmksXG5cdGJ1aWxkVHVybkNoYW5nZXNldFVyaSxcblx0YnVpbGRVbmNvbW1pdHRlZENoYW5nZXNldFVyaSxcblx0cGFyc2VDaGFuZ2VzZXRVcmksXG5cdENoYW5nZXNldEtpbmQsXG5cdGJ1aWxkRGVmYXVsdENoYW5nZXNldENhdGFsb2csXG59IGZyb20gJy4uL2NvbW1vbi9jaGFuZ2VzZXRVcmkuanMnO1xuaW1wb3J0IHsgSURpZmZDb21wdXRlU2VydmljZSB9IGZyb20gJy4uL2NvbW1vbi9kaWZmQ29tcHV0ZVNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSVNlc3Npb25EYXRhYmFzZSwgSVNlc3Npb25EYXRhU2VydmljZSB9IGZyb20gJy4uL2NvbW1vbi9zZXNzaW9uRGF0YVNlcnZpY2UuanMnO1xuaW1wb3J0IHR5cGUgeyBDaGFuZ2VzZXRTdGF0ZSwgQ2hhbmdlc1N1bW1hcnkgfSBmcm9tICcuLi9jb21tb24vc3RhdGUvcHJvdG9jb2wvc3RhdGUuanMnO1xuaW1wb3J0IHsgQWN0aW9uVHlwZSB9IGZyb20gJy4uL2NvbW1vbi9zdGF0ZS9zZXNzaW9uQWN0aW9ucy5qcyc7XG5pbXBvcnQge1xuXHRDaGFuZ2VzZXRTdGF0dXMsXG5cdHR5cGUgQ2hhbmdlc2V0RmlsZSxcblx0dHlwZSBJU2Vzc2lvbkZpbGVEaWZmLFxuXHR0eXBlIFVSSSBhcyBQcm90b2NvbFVSSSxcblx0cmVhZFNlc3Npb25HaXRTdGF0ZSxcblx0aXNEZWZhdWx0Q2hhdFVyaSxcblx0U2Vzc2lvbkxpZmVjeWNsZSxcbn0gZnJvbSAnLi4vY29tbW9uL3N0YXRlL3Nlc3Npb25TdGF0ZS5qcyc7XG5pbXBvcnQgeyBBZ2VudEhvc3RTdGF0ZU1hbmFnZXIsIElBZ2VudEhvc3RTdGF0ZU1hbmFnZXIgfSBmcm9tICcuL2FnZW50SG9zdFN0YXRlTWFuYWdlci5qcyc7XG5pbXBvcnQgeyBJQWdlbnRDb25maWd1cmF0aW9uU2VydmljZSB9IGZyb20gJy4vYWdlbnRDb25maWd1cmF0aW9uU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJQWdlbnRIb3N0R2l0U2VydmljZSwgTUVUQV9ESUZGX0JBU0VfQlJBTkNILCByZXNvbHZlRGlmZkJhc2VCcmFuY2hOYW1lIH0gZnJvbSAnLi4vY29tbW9uL2FnZW50SG9zdEdpdFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSUFnZW50SG9zdENoZWNrcG9pbnRTZXJ2aWNlIH0gZnJvbSAnLi4vY29tbW9uL2FnZW50SG9zdENoZWNrcG9pbnRTZXJ2aWNlLmpzJztcbmltcG9ydCB7IE5vZGVXb3JrZXJEaWZmQ29tcHV0ZVNlcnZpY2UgfSBmcm9tICcuL2RpZmZDb21wdXRlU2VydmljZS5qcyc7XG5pbXBvcnQgeyBjb21wdXRlU2Vzc2lvbkRpZmZzLCBjb21wdXRlVHVybkRpZmZzLCBjb21wdXRlVW5pb25lZERpZmZzLCB0eXBlIElJbmNyZW1lbnRhbERpZmZPcHRpb25zLCB0eXBlIElTZXNzaW9uRGlmZlNvdXJjZSB9IGZyb20gJy4vc2Vzc2lvbkRpZmZBZ2dyZWdhdG9yLmpzJztcbmltcG9ydCB7IElBZ2VudEhvc3RDaGFuZ2VzZXRTZXJ2aWNlLCBJUGVyc2lzdGVkQ2hhbmdlc2V0TWV0YWRhdGEsIElSZXN0b3JlZENoYW5nZXNldERpZmZzLCBDSEFOR0VTRVRfREJfTUVUQURBVEFfS0VZUywgQ0hBTkdFU19TVU1NQVJZX01FVEFEQVRBX0tFWVMsIE1FVEFfQ0hBTkdFU19TVU1NQVJZLCBNRVRBX0NIQU5HRVNFVF9CUkFOQ0gsIE1FVEFfQ0hBTkdFU0VUX1NFU1NJT04sIE1FVEFfTEVHQUNZX0RJRkZTLCBTdGF0aWNDaGFuZ2VzZXRLaW5kIH0gZnJvbSAnLi4vY29tbW9uL2FnZW50SG9zdENoYW5nZXNldFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSUFnZW50SG9zdENoYW5nZXNldFN1YnNjcmlwdGlvblNlcnZpY2UgfSBmcm9tICcuLi9jb21tb24vYWdlbnRIb3N0Q2hhbmdlc2V0U3Vic2NyaXB0aW9uU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJQWdlbnRIb3N0Q2hhbmdlc2V0T3BlcmF0aW9uU2VydmljZSB9IGZyb20gJy4uL2NvbW1vbi9hZ2VudEhvc3RDaGFuZ2VzZXRPcGVyYXRpb25TZXJ2aWNlLmpzJztcbmltcG9ydCB7IElBZ2VudEhvc3RSZXZpZXdTZXJ2aWNlIH0gZnJvbSAnLi4vY29tbW9uL2FnZW50SG9zdFJldmlld1NlcnZpY2UuanMnO1xuaW1wb3J0IHsgZXh0VXJpQmlhc2VkSWdub3JlUGF0aENhc2UsIHJlbGF0aXZlUGF0aCB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL3Jlc291cmNlcy5qcyc7XG5pbXBvcnQgeyBpc011bHRpUm9vdFNlc3Npb24gfSBmcm9tICcuLi9jb21tb24vYWdlbnRIb3N0V29ya2luZ0RpcmVjdG9yaWVzLmpzJztcbmltcG9ydCB7IHJlc29sdmVTZXNzaW9uUmVwb3NpdG9yaWVzIH0gZnJvbSAnLi9hZ2VudEhvc3RTZXNzaW9uUmVwb3NpdG9yaWVzLmpzJztcbmltcG9ydCB7IGRlZHVwZVNlc3Npb25GaWxlRGlmZnMsIGV2YWx1YXRlTXVsdGlSb290RGlmZlNvdXJjZXMgfSBmcm9tICcuL2FnZW50SG9zdE11bHRpUm9vdERpZmYuanMnO1xuaW1wb3J0IHsgSVRlbGVtZXRyeVNlcnZpY2UgfSBmcm9tICcuLi8uLi90ZWxlbWV0cnkvY29tbW9uL3RlbGVtZXRyeS5qcyc7XG5pbXBvcnQgeyByZXBvcnRBZ2VudEhvc3RTdGF0aWNDaGFuZ2VzZXRDb21wdXRlZCwgcmVwb3J0QWdlbnRIb3N0VHVybkNoYW5nZXNldENvbXB1dGVkLCB0eXBlIElNdWx0aVJvb3RUdXJuRGlmZk1ldHJpY3MsIHR5cGUgU3RhdGljQ2hhbmdlc2V0T3V0Y29tZSwgdHlwZSBUdXJuQ2hhbmdlc2V0T3V0Y29tZSB9IGZyb20gJy4vYWdlbnRIb3N0Q2hhbmdlc2V0VGVsZW1ldHJ5LmpzJztcbmltcG9ydCB0eXBlIHsgSUFnZW50SG9zdENsaWVudFRlbGVtZXRyeUNvbnRleHQgfSBmcm9tICcuLi9jb21tb24vYWdlbnRIb3N0VGVsZW1ldHJ5LmpzJztcblxuLyoqXG4gKiBNYXhpbXVtIG51bWJlciBvZiBwZXItcmVwb3NpdG9yeSBnaXQgZGlmZnMgYSBtdWx0aS1mb2xkZXIgZmFuLW91dCBydW5zIGF0XG4gKiBvbmNlLiBFdmVyeSByZXNvbHZlZCByZXBvc2l0b3J5IGlzIGRpZmZlZDsgdGhpcyBvbmx5IGJvdW5kcyBob3cgbWFueSBgZ2l0YFxuICogY2hpbGQgcHJvY2Vzc2VzIHJ1biBjb25jdXJyZW50bHkgXHUyMDE0IG1pcnJvcmluZyB0aGUgYnVpbHQtaW4gZ2l0IGV4dGVuc2lvbidzXG4gKiBgTGltaXRlcig1KWAgZm9yIHJlZnJlc2hpbmcgbWFueSByZXBvc2l0b3JpZXMgKHNlZVxuICogYGV4dGVuc2lvbnMvZ2l0L3NyYy9tb2RlbC50c2ApIFx1MjAxNCBzbyBhIG1hbnktcmVwb3NpdG9yeSBzZXNzaW9uIGNhbm5vdCBzcGF3biBhblxuICogdW5ib3VuZGVkIG51bWJlciBvZiBnaXQgcHJvY2Vzc2VzIGF0IG9uY2UuXG4gKi9cbmNvbnN0IE1BWF9UVVJOX0RJRkZfUkVQT1NJVE9SWV9DT05DVVJSRU5DWSA9IDU7XG5cbmZ1bmN0aW9uIHN0YXRpY0NoYW5nZXNldFVyaShzZXNzaW9uOiBQcm90b2NvbFVSSSwga2luZDogU3RhdGljQ2hhbmdlc2V0S2luZCk6IFByb3RvY29sVVJJIHtcblx0cmV0dXJuIGtpbmQgPT09ICdicmFuY2gnXG5cdFx0PyBidWlsZEJyYW5jaENoYW5nZXNldFVyaShzZXNzaW9uKVxuXHRcdDogYnVpbGRTZXNzaW9uQ2hhbmdlc2V0VXJpKHNlc3Npb24pO1xufVxuXG5mdW5jdGlvbiBwZXJzaXN0S2V5Rm9yKGtpbmQ6IFN0YXRpY0NoYW5nZXNldEtpbmQpOiBzdHJpbmcge1xuXHRyZXR1cm4ga2luZCA9PT0gJ2JyYW5jaCdcblx0XHQ/IE1FVEFfQ0hBTkdFU0VUX0JSQU5DSFxuXHRcdDogTUVUQV9DSEFOR0VTRVRfU0VTU0lPTjtcbn1cblxuLyoqXG4gKiBBIHBlci10dXJuIGRpZmYgY29tcHV0YXRpb24gcmVzdWx0OiB0aGUgbWVyZ2VkIGZpbGUgZGlmZnMgdG8gcHVibGlzaCwgdGhlXG4gKiBjb21wdXRlIG91dGNvbWUsIGFuZCBcdTIwMTQgZm9yIG11bHRpLXJvb3QgdHVybnMgb25seSBcdTIwMTQgdGhlIGZhbi1vdXQgbWV0cmljcyB0aGF0XG4gKiBmZWVkIHtAbGluayByZXBvcnRBZ2VudEhvc3RUdXJuQ2hhbmdlc2V0Q29tcHV0ZWR9LiBgbXVsdGlSb290YCBpcyBgdW5kZWZpbmVkYFxuICogZm9yIHNpbmdsZS1yb290IHR1cm5zIGFuZCBmb3IgYSByZXNvbHZlIGZhaWx1cmUsIHNvIHRlbGVtZXRyeSBuZXZlciBmYWJyaWNhdGVzXG4gKiBmYW4tb3V0IHZhbHVlcy5cbiAqL1xuaW50ZXJmYWNlIElUdXJuRGlmZlJlc3VsdCB7XG5cdHJlYWRvbmx5IGRpZmZzOiByZWFkb25seSBJU2Vzc2lvbkZpbGVEaWZmW107XG5cdHJlYWRvbmx5IG91dGNvbWU6ICdjb21wdXRlZCcgfCAncmVzb2x2ZUZhaWxlZCc7XG5cdHJlYWRvbmx5IG11bHRpUm9vdD86IElNdWx0aVJvb3RUdXJuRGlmZk1ldHJpY3M7XG59XG5cbi8qKlxuICogU3VtcyB0aGUgcGVyLWZpbGUgZGlmZiBjb3VudHMgaW50byB0aGUge0BsaW5rIENoYW5nZXNTdW1tYXJ5fSBzaGFwZVxuICogdGhhdCBsaXZlcyBvbiBgc3VtbWFyeS5jaGFuZ2VzYC4gUmV0dXJucyBgdW5kZWZpbmVkYCBmb3IgYW4gdW5kZWZpbmVkXG4gKiBpbnB1dCBzbyBjYWxsZXJzIGNhbiBkaXN0aW5ndWlzaCBcIm5vIGRhdGEgeWV0XCIgZnJvbSBcImRhdGEsIHplcm8gY2hhbmdlc1wiLlxuICovXG5mdW5jdGlvbiBzdW1tYXJpc2VEaWZmcyhkaWZmczogcmVhZG9ubHkgSVNlc3Npb25GaWxlRGlmZltdIHwgdW5kZWZpbmVkKTogQ2hhbmdlc1N1bW1hcnkgfCB1bmRlZmluZWQge1xuXHRpZiAoIWRpZmZzKSB7XG5cdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0fVxuXHRsZXQgYWRkaXRpb25zID0gMDtcblx0bGV0IGRlbGV0aW9ucyA9IDA7XG5cdGZvciAoY29uc3QgZCBvZiBkaWZmcykge1xuXHRcdGFkZGl0aW9ucyArPSBkLmRpZmY/LmFkZGVkID8/IDA7XG5cdFx0ZGVsZXRpb25zICs9IGQuZGlmZj8ucmVtb3ZlZCA/PyAwO1xuXHR9XG5cdHJldHVybiB7IGFkZGl0aW9ucywgZGVsZXRpb25zLCBmaWxlczogZGlmZnMubGVuZ3RoIH07XG59XG5cbi8qKlxuICogRGVyaXZlcyB0aGUgYHN1bW1hcnkuY2hhbmdlc2AgYWdncmVnYXRlIGZvciBhbiB1bm9wZW5lZCBzZXNzaW9uIGZyb21cbiAqIHRoZSByZWFkeSBsaXZlIHtAbGluayBDaGFuZ2VzZXRTdGF0ZX0gb2YgdGhlIGNhdGFsb2d1ZSBlbnRyeSB3aG9zZVxuICogYGNoYW5nZUtpbmQgPT09ICdzZXNzaW9uJ2AgXHUyMDE0IHR5cGljYWxseSBiZWNhdXNlIGEgcHJldmlvdXNcbiAqIGByZXN0b3JlU3RhdGljQ2hhbmdlc2V0YCB3YXJtZWQgdGhlIGNhY2hlIGJlZm9yZSB0aGUgc2Vzc2lvbiBpdHNlbGZcbiAqIHdhcyBhdHRhY2hlZC5cbiAqXG4gKiBSZXR1cm5zIGB1bmRlZmluZWRgIHdoZW4gbm8gbGl2ZSBzZXNzaW9uLXdpZGUgc3RhdGUgaXMgcmVhZHksIHNvXG4gKiBgbGlzdFNlc3Npb25zYCBsZWF2ZXMgdGhlIGBjaGFuZ2VzYCBmaWVsZCB1bnNldCBmb3Igc2Vzc2lvbnMgd2l0aG91dFxuICogdXNhYmxlIGNvdW50cyBcdTIwMTQgcHJlc2VydmluZyB0aGUgbG9uZy1zdGFuZGluZyBjb250cmFjdCB0aGF0IHVub3BlbmVkXG4gKiBzZXNzaW9ucyB3aXRob3V0IGxpdmUgb3IgcGVyc2lzdGVkIGRhdGEgYWR2ZXJ0aXNlIG5vIGFnZ3JlZ2F0ZS5cbiAqXG4gKiBPbmx5IHRoZSBgY2hhbmdlS2luZDogJ3Nlc3Npb24nYCBlbnRyeSBmZWVkcyB0aGUgc3VtbWFyeTsgb3RoZXIga2luZHNcbiAqIChgJ3VuY29tbWl0dGVkJ2AsIGAndHVybidgLCBgJ2NvbXBhcmUtdHVybnMnYCkgZGVzY3JpYmUgc2xpY2VzLCBub3RcbiAqIHRoZSBzZXNzaW9uLWxldmVsIGZvb3RwcmludC4gVGhlIHN0YXRpYyBjYXRhbG9ndWUgaXRzZWxmIChidWlsdCBieVxuICoge0BsaW5rIGJ1aWxkRGVmYXVsdENoYW5nZXNldENhdGFsb2d9KSBpcyBpbmRlcGVuZGVudCBvZiBjb3VudHMgYW5kXG4gKiBpcyBzZWVkZWQgb25jZSBhdCBzZXNzaW9uIGNyZWF0aW9uLlxuICovXG5mdW5jdGlvbiBjb21wdXRlQ2hhbmdlc1N1bW1hcnlGcm9tTGl2ZVN0YXRlKFxuXHRzZXNzaW9uOiBDaGFuZ2VzZXRTdGF0ZSB8IHVuZGVmaW5lZCxcbik6IENoYW5nZXNTdW1tYXJ5IHwgdW5kZWZpbmVkIHtcblx0Y29uc3Qgc2Vzc2lvbkRpZmZzID0gc2Vzc2lvbj8uc3RhdHVzID09PSBDaGFuZ2VzZXRTdGF0dXMuUmVhZHkgPyBzZXNzaW9uLmZpbGVzLm1hcChmID0+IGYuZWRpdCkgOiB1bmRlZmluZWQ7XG5cdHJldHVybiBzdW1tYXJpc2VEaWZmcyhzZXNzaW9uRGlmZnMpO1xufVxuXG4vKipcbiAqIERlcml2ZXMgdGhlIGBzdW1tYXJ5LmNoYW5nZXNgIGFnZ3JlZ2F0ZSBmb3IgYW4gdW5vcGVuZWQgc2Vzc2lvbiBmcm9tXG4gKiBwYXJzZWQgcGVyc2lzdGVkIGRpZmZzIGZvciB0aGUgYGNoYW5nZUtpbmQ6ICdzZXNzaW9uJ2AgY2F0YWxvZ3VlXG4gKiBlbnRyeS4gUmV0dXJucyBgdW5kZWZpbmVkYCB3aGVuIHRoZSBzZXNzaW9uLXdpZGUgYmxvYiBpcyBhYnNlbnQgc29cbiAqIG1hbGZvcm1lZCBtZXRhZGF0YSBsZWF2ZXMgYHN1bW1hcnkuY2hhbmdlc2AgdW5zZXQuXG4gKi9cbmZ1bmN0aW9uIGNvbXB1dGVDaGFuZ2VzU3VtbWFyeUZyb21QZXJzaXN0ZWREaWZmcyhcblx0c2Vzc2lvbkRpZmZzOiByZWFkb25seSBJU2Vzc2lvbkZpbGVEaWZmW10gfCB1bmRlZmluZWQsXG4pOiBDaGFuZ2VzU3VtbWFyeSB8IHVuZGVmaW5lZCB7XG5cdHJldHVybiBzdW1tYXJpc2VEaWZmcyhzZXNzaW9uRGlmZnMpO1xufVxuXG4vKipcbiAqIFBhcnNlcyBhIEpTT04tc2VyaWFsaXNlZCB7QGxpbmsgSVNlc3Npb25GaWxlRGlmZn1bXSBibG9iIGZyb20gc2Vzc2lvblxuICogbWV0YWRhdGEuIFJldHVybnMgYHVuZGVmaW5lZGAgZm9yIG1pc3Npbmcgb3IgbWFsZm9ybWVkIGlucHV0LCBsb2dnaW5nIGFcbiAqIHdhcm5pbmcgdGhhdCBuYW1lcyBgc2Vzc2lvblVyaWAgYW5kIGBraW5kYCBzbyBvcGVyYXRvcnMgY2FuIGNvcnJlbGF0ZSB0aGVcbiAqIGZhaWx1cmUgd2l0aCBhIHNwZWNpZmljIHNlc3Npb24vY2hhbmdlc2V0IHNsb3QuIE5ldmVyIHRocm93cy5cbiAqL1xuZnVuY3Rpb24gdHJ5UGFyc2VQZXJzaXN0ZWREaWZmcyhyYXc6IHN0cmluZyB8IHVuZGVmaW5lZCwgc2Vzc2lvblVyaTogc3RyaW5nLCBraW5kOiBzdHJpbmcsIGxvZzogSUxvZ1NlcnZpY2UpOiBJU2Vzc2lvbkZpbGVEaWZmW10gfCB1bmRlZmluZWQge1xuXHRpZiAoIXJhdykge1xuXHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdH1cblx0dHJ5IHtcblx0XHRyZXR1cm4gSlNPTi5wYXJzZShyYXcpIGFzIElTZXNzaW9uRmlsZURpZmZbXTtcblx0fSBjYXRjaCAoZXJyKSB7XG5cdFx0bG9nLndhcm4oYFtBZ2VudEhvc3RDaGFuZ2VzZXRTZXJ2aWNlXSBGYWlsZWQgdG8gcGFyc2UgcGVyc2lzdGVkICR7a2luZH0gZGlmZnMgZm9yICR7c2Vzc2lvblVyaX06ICR7dG9FcnJvck1lc3NhZ2UoZXJyKX1gKTtcblx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHR9XG59XG5cbmV4cG9ydCBjbGFzcyBBZ2VudEhvc3RDaGFuZ2VzZXRTZXJ2aWNlIGV4dGVuZHMgRGlzcG9zYWJsZSBpbXBsZW1lbnRzIElBZ2VudEhvc3RDaGFuZ2VzZXRTZXJ2aWNlIHtcblx0ZGVjbGFyZSByZWFkb25seSBfc2VydmljZUJyYW5kOiB1bmRlZmluZWQ7XG5cblx0LyoqIFNoYXJlZCBkaWZmIGNvbXB1dGUgc2VydmljZSBmb3IgY2FsY3VsYXRpbmcgbGluZS1sZXZlbCBkaWZmcyBpbiBhIHdvcmtlciB0aHJlYWQuICovXG5cdHByaXZhdGUgcmVhZG9ubHkgX2RpZmZDb21wdXRlU2VydmljZTogSURpZmZDb21wdXRlU2VydmljZTtcblx0LyoqIFNlcmlhbGl6ZXMgcGVyLXNlc3Npb24gZGlmZiBjb21wdXRhdGlvbnMgdG8gYXZvaWQgcmFjZXMgd2l0aCBzdGFsZSBwcmV2aW91c0RpZmZzLiAqL1xuXHRwcml2YXRlIHJlYWRvbmx5IF9kaWZmQ29tcHV0YXRpb25TZXF1ZW5jZXIgPSBuZXcgU2VxdWVuY2VyQnlLZXk8c3RyaW5nPigpO1xuXHQvKiogUGVyLXNlc3Npb24gZGVib3VuY2UgdGltZXJzIGZvciBtaWQtdHVybiBkaWZmIGNvbXB1dGF0aW9uLiAqL1xuXHRwcml2YXRlIHJlYWRvbmx5IF9kZWJvdW5jZWREaWZmVGltZXJzID0gdGhpcy5fcmVnaXN0ZXIobmV3IERpc3Bvc2FibGVNYXA8c3RyaW5nPigpKTtcblx0LyoqIFBlci1gKHNlc3Npb24sIHR1cm5JZClgIGRlYm91bmNlIHRpbWVycyBmb3IgbWlkLXR1cm4gcGVyLXR1cm4gY2hhbmdlc2V0IHJlY29tcHV0YXRpb24uICovXG5cdHByaXZhdGUgcmVhZG9ubHkgX3BlclR1cm5EZWJvdW5jZWREaWZmVGltZXJzID0gdGhpcy5fcmVnaXN0ZXIobmV3IERpc3Bvc2FibGVNYXA8c3RyaW5nPigpKTtcblx0cHJpdmF0ZSByZWFkb25seSBfYWN0aXZlU3RhdGljQ29tcHV0ZXMgPSBuZXcgU2V0PFByb3RvY29sVVJJPigpO1xuXHRwcml2YXRlIHN0YXRpYyByZWFkb25seSBfRElGRl9ERUJPVU5DRV9NUyA9IDUwMDA7XG5cblx0LyoqXG5cdCAqIFNlc3Npb25zIHdob3NlIHN0YXRpYyBjaGFuZ2VzZXQgcmVmcmVzaCB3YXMgcmVxdWVzdGVkIGJlZm9yZSB0aGVcblx0ICogd29ya2luZyBkaXJlY3Rvcnkgd2FzIGtub3duIChwcm92aXNpb25hbCAvIG5vdC15ZXQtbWF0ZXJpYWxpemVkXG5cdCAqIHNlc3Npb25zKS4gRHJhaW5lZCBmcm9tIHtAbGluayBvbldvcmtpbmdEaXJlY3RvcnlBdmFpbGFibGV9IG9uY2UgdGhlXG5cdCAqIHdvcmtpbmcgZGlyZWN0b3J5IGlzIHNldCwgd2hpY2ggcmVjb21wdXRlcyBldmVyeSBjaGFuZ2VzZXQgc3RpbGxcblx0ICogc3Vic2NyaWJlZCBmb3IgdGhlIHNlc3Npb24uXG5cdCAqXG5cdCAqIEZpcmluZyBhIHJlZnJlc2ggYmVmb3JlIHRoZSB3b3JraW5nIGRpcmVjdG9yeSBpcyBrbm93biB3b3VsZCBjb21wdXRlXG5cdCAqIGFnYWluc3QgYSBtaXNzaW5nIGRpcmVjdG9yeSBhbmQgdGhlIGdpdCBwYXRoIHdvdWxkIGJhaWwsIHNvIHdlIGRlZmVyXG5cdCAqIGluc3RlYWQgYW5kIHJlLXJ1biBvbmNlIG1hdGVyaWFsaXphdGlvbiAvIHJlc3RvcmUgcG9wdWxhdGVzIGl0LlxuXHQgKi9cblx0cHJpdmF0ZSByZWFkb25seSBfcGVuZGluZ01hdGVyaWFsaXphdGlvbiA9IG5ldyBTZXQ8UHJvdG9jb2xVUkk+KCk7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0QElBZ2VudEhvc3RTdGF0ZU1hbmFnZXIgcHJpdmF0ZSByZWFkb25seSBfc3RhdGVNYW5hZ2VyOiBBZ2VudEhvc3RTdGF0ZU1hbmFnZXIsXG5cdFx0QElMb2dTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2xvZ1NlcnZpY2U6IElMb2dTZXJ2aWNlLFxuXHRcdEBJU2Vzc2lvbkRhdGFTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX3Nlc3Npb25EYXRhU2VydmljZTogSVNlc3Npb25EYXRhU2VydmljZSxcblx0XHRASUFnZW50SG9zdEdpdFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfZ2l0U2VydmljZTogSUFnZW50SG9zdEdpdFNlcnZpY2UsXG5cdFx0QElBZ2VudEhvc3RDaGVja3BvaW50U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9jaGVja3BvaW50U2VydmljZTogSUFnZW50SG9zdENoZWNrcG9pbnRTZXJ2aWNlLFxuXHRcdEBJQWdlbnRDb25maWd1cmF0aW9uU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9jb25maWd1cmF0aW9uU2VydmljZTogSUFnZW50Q29uZmlndXJhdGlvblNlcnZpY2UsXG5cdFx0QElBZ2VudEhvc3RDaGFuZ2VzZXRPcGVyYXRpb25TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2NoYW5nZXNldE9wZXJhdGlvblNlcnZpY2U6IElBZ2VudEhvc3RDaGFuZ2VzZXRPcGVyYXRpb25TZXJ2aWNlLFxuXHRcdEBJQWdlbnRIb3N0Q2hhbmdlc2V0U3Vic2NyaXB0aW9uU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9jaGFuZ2VzZXRTdWJzY3JpcHRpb25zOiBJQWdlbnRIb3N0Q2hhbmdlc2V0U3Vic2NyaXB0aW9uU2VydmljZSxcblx0XHRASUFnZW50SG9zdFJldmlld1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfcmV2aWV3U2VydmljZTogSUFnZW50SG9zdFJldmlld1NlcnZpY2UsXG5cdFx0QElUZWxlbWV0cnlTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX3RlbGVtZXRyeVNlcnZpY2U6IElUZWxlbWV0cnlTZXJ2aWNlLFxuXHQpIHtcblx0XHRzdXBlcigpO1xuXHRcdHRoaXMuX2RpZmZDb21wdXRlU2VydmljZSA9IHRoaXMuX2NyZWF0ZURpZmZDb21wdXRlU2VydmljZSgpO1xuXHR9XG5cblx0LyoqIENyZWF0ZXMgdGhlIGRpZmYtY291bnQgc2VydmljZTsgb3ZlcnJpZGFibGUgc28gdGVzdHMgY2FuIHN1cHBseSBhIHN5bmNocm9ub3VzIGluLXByb2Nlc3MgY29tcHV0ZXIuICovXG5cdHByb3RlY3RlZCBfY3JlYXRlRGlmZkNvbXB1dGVTZXJ2aWNlKCk6IElEaWZmQ29tcHV0ZVNlcnZpY2Uge1xuXHRcdHJldHVybiB0aGlzLl9yZWdpc3RlcihuZXcgTm9kZVdvcmtlckRpZmZDb21wdXRlU2VydmljZSh0aGlzLl9sb2dTZXJ2aWNlKSk7XG5cdH1cblxuXHQvKipcblx0ICogUmV0dXJucyB0cnVlIHdoZW4gYXQgbGVhc3Qgb25lIGNsaWVudCBpcyBzdWJzY3JpYmVkIHRvIGBjaGFuZ2VzZXRgXG5cdCAqIHVuZGVyIGBzZXNzaW9uYC5cblx0ICovXG5cdHByaXZhdGUgX2hhc1N1YnNjcmlwdGlvbihzZXNzaW9uOiBQcm90b2NvbFVSSSwgY2hhbmdlc2V0OiBQcm90b2NvbFVSSSk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiB0aGlzLl9jaGFuZ2VzZXRTdWJzY3JpcHRpb25zLmdldFNlc3Npb25TdWJzY3JpcHRpb25zKHNlc3Npb24pLmhhcyhjaGFuZ2VzZXQpO1xuXHR9XG5cblx0cHJpdmF0ZSBfaGFzV29ya2luZ0RpcmVjdG9yeShzZXNzaW9uOiBQcm90b2NvbFVSSSk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiAhIXRoaXMuX2NvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldEVmZmVjdGl2ZVdvcmtpbmdEaXJlY3RvcmllcyhzZXNzaW9uKT8uWzBdO1xuXHR9XG5cblx0cmVnaXN0ZXJTdGF0aWNDaGFuZ2VzZXRzKHNlc3Npb246IFByb3RvY29sVVJJKTogdm9pZCB7XG5cdFx0dGhpcy5fc3RhdGVNYW5hZ2VyLnJlZ2lzdGVyQ2hhbmdlc2V0KGJ1aWxkQnJhbmNoQ2hhbmdlc2V0VXJpKHNlc3Npb24pKTtcblx0XHR0aGlzLl9zdGF0ZU1hbmFnZXIucmVnaXN0ZXJDaGFuZ2VzZXQoYnVpbGRVbmNvbW1pdHRlZENoYW5nZXNldFVyaShzZXNzaW9uKSk7XG5cdFx0dGhpcy5fc3RhdGVNYW5hZ2VyLnJlZ2lzdGVyQ2hhbmdlc2V0KGJ1aWxkU2Vzc2lvbkNoYW5nZXNldFVyaShzZXNzaW9uKSk7XG5cdH1cblxuXHRyZXN0b3JlU3RhdGljQ2hhbmdlc2V0KHNlc3Npb246IFByb3RvY29sVVJJLCBraW5kOiBTdGF0aWNDaGFuZ2VzZXRLaW5kLCBkaWZmczogcmVhZG9ubHkgSVNlc3Npb25GaWxlRGlmZltdKTogdm9pZCB7XG5cdFx0Y29uc3QgY2hhbmdlc2V0VXJpID0gdGhpcy5fc3RhdGVNYW5hZ2VyLnJlZ2lzdGVyQ2hhbmdlc2V0KHN0YXRpY0NoYW5nZXNldFVyaShzZXNzaW9uLCBraW5kKSk7XG5cdFx0dGhpcy5fcHVibGlzaENoYW5nZXNldERpZmZzKHNlc3Npb24sIGNoYW5nZXNldFVyaSwgZGlmZnMpO1xuXHR9XG5cblx0cGFyc2VQZXJzaXN0ZWRTdGF0aWNDaGFuZ2VzZXRzKHNlc3Npb25Vcmk6IFByb3RvY29sVVJJLCBtZXRhZGF0YTogSVBlcnNpc3RlZENoYW5nZXNldE1ldGFkYXRhKTogSVJlc3RvcmVkQ2hhbmdlc2V0RGlmZnMge1xuXHRcdGNvbnN0IHBlcnNpc3RlZEJyYW5jaCA9IHRyeVBhcnNlUGVyc2lzdGVkRGlmZnMobWV0YWRhdGEuYnJhbmNoUmF3LCBzZXNzaW9uVXJpLCAnYnJhbmNoJywgdGhpcy5fbG9nU2VydmljZSk7XG5cblx0XHQvLyBMZWdhY3kgYGRpZmZzYCBpcyB0aGUgbWlncmF0aW9uIGZhbGxiYWNrIGZvciB0aGUgc2Vzc2lvbi13aWRlXG5cdFx0Ly8gY2hhbmdlc2V0IG9ubHkgXHUyMDE0IGl0IG5ldmVyIGNhcnJpZWQgdW5jb21taXR0ZWQgc3RhdGUuXG5cdFx0Y29uc3QgcGVyc2lzdGVkU2Vzc2lvbiA9IHRyeVBhcnNlUGVyc2lzdGVkRGlmZnMobWV0YWRhdGEuc2Vzc2lvblJhdywgc2Vzc2lvblVyaSwgJ3Nlc3Npb24nLCB0aGlzLl9sb2dTZXJ2aWNlKVxuXHRcdFx0Pz8gdHJ5UGFyc2VQZXJzaXN0ZWREaWZmcyhtZXRhZGF0YS5sZWdhY3lSYXcsIHNlc3Npb25VcmksICdzZXNzaW9uIChsZWdhY3kpJywgdGhpcy5fbG9nU2VydmljZSk7XG5cblx0XHRyZXR1cm4geyBicmFuY2g6IHBlcnNpc3RlZEJyYW5jaCwgc2Vzc2lvbjogcGVyc2lzdGVkU2Vzc2lvbiB9O1xuXHR9XG5cblx0YXBwbHlQZXJzaXN0ZWRTdGF0aWNDaGFuZ2VzZXRzKHNlc3Npb25Vcmk6IFByb3RvY29sVVJJLCBkaWZmczogSVJlc3RvcmVkQ2hhbmdlc2V0RGlmZnMpOiB2b2lkIHtcblx0XHQvLyBgc2VlZElmRW1wdHlgOiBvbmx5IHJlc2VlZCBwZXJzaXN0ZWQgZGlmZnMgd2hlbiB0aGUgbWF0Y2hpbmcgbGl2ZVxuXHRcdC8vIGNoYW5nZXNldCBzdGF0ZSBpcyBhYnNlbnQgb3IgZW1wdHkuIExpdmUgc3RhdGUgKGUuZy4gZnJvbSBhIHByaW9yXG5cdFx0Ly8gcmVmcmVzaCBpbiB0aGlzIGxpZmV0aW1lKSBpcyBhbHdheXMgbW9yZSBhdXRob3JpdGF0aXZlIHRoYW4gYVxuXHRcdC8vIHBvdGVudGlhbGx5LXN0YWxlIHBlcnNpc3RlZCBibG9iOyB3aXRob3V0IHRoaXMgZ3VhcmQgYSBmcmVzaFxuXHRcdC8vIGByZXN0b3JlUGVyc2lzdGVkU3RhdGljQ2hhbmdlc2V0c2AgY2FsbCB3b3VsZCBjbG9iYmVyIGl0LlxuXHRcdHRoaXMuX3NlZWRJZkVtcHR5KHNlc3Npb25VcmksICdicmFuY2gnLCBkaWZmcy5icmFuY2gpO1xuXHRcdHRoaXMuX3NlZWRJZkVtcHR5KHNlc3Npb25VcmksICdzZXNzaW9uJywgZGlmZnMuc2Vzc2lvbik7XG5cdH1cblxuXHRyZXN0b3JlUGVyc2lzdGVkU3RhdGljQ2hhbmdlc2V0cyhzZXNzaW9uVXJpOiBQcm90b2NvbFVSSSwgbWV0YWRhdGE6IElQZXJzaXN0ZWRDaGFuZ2VzZXRNZXRhZGF0YSk6IElSZXN0b3JlZENoYW5nZXNldERpZmZzIHtcblx0XHRjb25zdCBwYXJzZWQgPSB0aGlzLnBhcnNlUGVyc2lzdGVkU3RhdGljQ2hhbmdlc2V0cyhzZXNzaW9uVXJpLCBtZXRhZGF0YSk7XG5cdFx0dGhpcy5hcHBseVBlcnNpc3RlZFN0YXRpY0NoYW5nZXNldHMoc2Vzc2lvblVyaSwgcGFyc2VkKTtcblx0XHRyZXR1cm4gcGFyc2VkO1xuXHR9XG5cblx0cGVyc2lzdENoYW5nZXNTdW1tYXJ5KHNlc3Npb25Vcmk6IFByb3RvY29sVVJJLCBzdW1tYXJ5OiBDaGFuZ2VzU3VtbWFyeSk6IHZvaWQge1xuXHRcdHRoaXMuX3BlcnNpc3RTZXNzaW9uRmxhZyhzZXNzaW9uVXJpLCBNRVRBX0NIQU5HRVNfU1VNTUFSWSwgSlNPTi5zdHJpbmdpZnkoc3VtbWFyeSkpO1xuXHR9XG5cblx0Z2V0TGlzdE1ldGFkYXRhS2V5cyhzZXNzaW9uVXJpOiBQcm90b2NvbFVSSSk6IFJlY29yZDxzdHJpbmcsIHRydWU+IHwgdW5kZWZpbmVkIHtcblx0XHQvLyBBIGxvYWRlZCBzZXNzaW9uJ3MgbGl2ZSBgc3VtbWFyeS5jaGFuZ2VzYCBpcyBhdXRob3JpdGF0aXZlIFx1MjAxNCBpdCBhbHJlYWR5XG5cdFx0Ly8gcmVmbGVjdHMgZXZlcnkgZm9sZGVyIChzaW5nbGUtZm9sZGVyOiBicmFuY2gtZGVyaXZlZDsgbXVsdGktZm9sZGVyOlxuXHRcdC8vIHRoZSBhbGwtZm9sZGVyIGFnZ3JlZ2F0ZSkgXHUyMDE0IHNvIG5vdGhpbmcgbmVlZHMgdG8gYmUgcmVhZCBmcm9tIHRoZSBEQi5cblx0XHRjb25zdCBsaXZlU3VtbWFyeUNoYW5nZXMgPSB0aGlzLl9zdGF0ZU1hbmFnZXIuZ2V0U2Vzc2lvblN1bW1hcnkoc2Vzc2lvblVyaSk/LmNoYW5nZXM7XG5cdFx0aWYgKGxpdmVTdW1tYXJ5Q2hhbmdlcykge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cdFx0Ly8gT3RoZXJ3aXNlIHRoZSBwZXJzaXN0ZWQgYE1FVEFfQ0hBTkdFU19TVU1NQVJZYCBpcyBhdXRob3JpdGF0aXZlIGZvciB0aGVcblx0XHQvLyBjaGlwLiBBIHJlYWR5IGxpdmUgYGNoYW5nZUtpbmQ6ICdzZXNzaW9uJ2AgY2hhbmdlc2V0IGlzIE5PVCBzdWZmaWNpZW50OlxuXHRcdC8vIGluIGEgbXVsdGktZm9sZGVyIHNlc3Npb24gaXQgaXMgUFJJTUFSWS1PTkxZLCBzbyBkZXJpdmluZyB0aGUgY2hpcCBmcm9tXG5cdFx0Ly8gaXQgd291bGQgcmVpbnRyb2R1Y2UgdGhlIHByaW1hcnktb25seSBjb3VudCAoYW5kIGNsb2JiZXIgdGhlIHBlcnNpc3RlZFxuXHRcdC8vIGFsbC1mb2xkZXIgdmFsdWUpIGFmdGVyIGFuIGlkbGUgZXZpY3Rpb24gdGhhdCBrZWVwcyBjaGFuZ2VzZXRzIGNhY2hlZFxuXHRcdC8vIGJ1dCBkcm9wcyB0aGUgbGl2ZSBzdW1tYXJ5LiBSZXF1ZXN0IHRoZSBzbWFsbCBzdW1tYXJ5IGtleSAobm90IHRoZVxuXHRcdC8vIGxhcmdlIGRpZmYgYmxvYnMpIHNvIHRoZSBhbGwtZm9sZGVyIGFnZ3JlZ2F0ZSBpcyBsb2FkZWQgYW5kIHByZWZlcnJlZC5cblx0XHRjb25zdCBsaXZlU2Vzc2lvbiA9IHRoaXMuX3N0YXRlTWFuYWdlci5nZXRDaGFuZ2VzZXRTdGF0ZShidWlsZFNlc3Npb25DaGFuZ2VzZXRVcmkoc2Vzc2lvblVyaSkpO1xuXHRcdGlmIChsaXZlU2Vzc2lvbj8uc3RhdHVzID09PSBDaGFuZ2VzZXRTdGF0dXMuUmVhZHkpIHtcblx0XHRcdC8vIFRoaXMgaXMgdGhlIFwiZXZpY3RlZC1idXQtd2FybVwiIHN0YXRlOiB0byBzYXZlIG1lbW9yeSB0aGUgaG9zdCBkcm9wc1xuXHRcdFx0Ly8gYSBzZXNzaW9uJ3MgbGl2ZSBgc3VtbWFyeS5jaGFuZ2VzYCBidXQgZGVsaWJlcmF0ZWx5IGtlZXBzIGl0c1xuXHRcdFx0Ly8gY2hhbmdlc2V0IG9iamVjdHMgY2FjaGVkIHNvIGEgc3RpbGwtdmlzaWJsZSBsaXN0IHJvdyBjYW4gYmUgZHJhd24uXG5cdFx0XHQvLyBUaGUga2V5cyB3ZSByZXR1cm4gaGVyZSBhcmUgbWVyZ2VkIGludG8gdGhlIHNpbmdsZSBiYXRjaGVkIERCIHJlYWRcblx0XHRcdC8vIGluIGBBZ2VudFNlcnZpY2UubGlzdFNlc3Npb25zYCwgdGhlbiBoYW5kZWQgdG9cblx0XHRcdC8vIGBjb21wdXRlTGlzdEVudHJ5Q2hhbmdlc2AsIHdoaWNoIHByZWZlcnMgYE1FVEFfQ0hBTkdFU19TVU1NQVJZYCBvdmVyXG5cdFx0XHQvLyByZS1kZXJpdmluZyBmcm9tIHRoZSBwcmltYXJ5LW9ubHkgYnJhbmNoIGNoYW5nZXNldC5cblx0XHRcdC8vXG5cdFx0XHQvLyBXb3JrZWQgZXhhbXBsZSBvZiB0aGUgYnVnIHRoaXMgYXZvaWRzICh3aHkgd2UgbXVzdCBOT1QgcmV0dXJuXG5cdFx0XHQvLyBgdW5kZWZpbmVkYCBoZXJlIGZvciBtdWx0aS1yb290KTpcblx0XHRcdC8vICAgMS4gTXVsdGktcm9vdCBzZXNzaW9uOiByZXBvQSAocHJpbWFyeSkgNSBmaWxlcyArMTIvLTMsIHJlcG9CIDNcblx0XHRcdC8vICAgICAgZmlsZXMgKzgvLTIuXG5cdFx0XHQvLyAgIDIuIEFsbC1mb2xkZXIgY2hpcCA9IDggZmlsZXMsICsyMC8tNSwgc2F2ZWQgdG9cblx0XHRcdC8vICAgICAgYE1FVEFfQ0hBTkdFU19TVU1NQVJZYDsgdGhlIGxpc3Qgc2hvd3MgXCI4IGZpbGVzICsyMCAtNVwiLlxuXHRcdFx0Ly8gICAzLiBTZXNzaW9uIGdvZXMgaWRsZSAtPiBldmljdGVkLWJ1dC13YXJtIChsaXZlIHN1bW1hcnkgZHJvcHBlZCxcblx0XHRcdC8vICAgICAgdGhlIGNoYW5nZXNldCBvYmplY3RzIGtlcHQgY2FjaGVkKS5cblx0XHRcdC8vICAgNC4gTGlzdCByZWZyZXNoZXMuIElmIHdlIHJldHVybmVkIGB1bmRlZmluZWRgLCBubyBzdW1tYXJ5IGtleSBpc1xuXHRcdFx0Ly8gICAgICByZWFkLCBzbyBgY29tcHV0ZUxpc3RFbnRyeUNoYW5nZXNgIHJlYnVpbGRzIHRoZSBjaGlwIGZyb20gdGhlXG5cdFx0XHQvLyAgICAgIGJyYW5jaCBjaGFuZ2VzZXQgKHByaW1hcnktb25seSkgPSA1IGZpbGVzICsxMi8tMyBhbmQgcGVyc2lzdHNcblx0XHRcdC8vICAgICAgaXQsIE9WRVJXUklUSU5HIHRoZSBEQiBgezgsKzIwLC01fWAgd2l0aCBgezUsKzEyLC0zfWAuXG5cdFx0XHQvLyAgIDUuIFRoZSByb3cgbm93IHNob3dzIHRoZSB3cm9uZyBudW1iZXIgQU5EIHRoZSBjb3JyZWN0IGFsbC1mb2xkZXJcblx0XHRcdC8vICAgICAgdmFsdWUgaXMgZHVyYWJseSBjb3JydXB0ZWQuXG5cdFx0XHQvLyBSZXR1cm5pbmcgdGhlIHN1bW1hcnkga2V5IGtlZXBzIHRoZSBjaGlwIGF0IHRoZSBhbGwtZm9sZGVyIHZhbHVlIGFuZFxuXHRcdFx0Ly8gbmV2ZXIgbGV0cyB0aGUgcHJpbWFyeS1vbmx5IGNvdW50IGJlIHdyaXR0ZW4gYmFjay5cblx0XHRcdHJldHVybiBDSEFOR0VTX1NVTU1BUllfTUVUQURBVEFfS0VZUztcblx0XHR9XG5cdFx0Ly8gQ29sZCBzZXNzaW9uOiBub3RoaW5nIGxpdmUgdG8gbGVhbiBvbiwgc28gcmVhZCB0aGUgZnVsbCBzZXQgKHN1bW1hcnlcblx0XHQvLyBwbHVzIHRoZSBwZXJzaXN0ZWQgZGlmZiBibG9icywgd2hpY2ggbWF5IGJlIHRoZSBvbmx5IHJlbWFpbmluZyBzb3VyY2UpLlxuXHRcdHJldHVybiBDSEFOR0VTRVRfREJfTUVUQURBVEFfS0VZUztcblx0fVxuXG5cdGNvbXB1dGVMaXN0RW50cnlDaGFuZ2VzKHNlc3Npb25Vcmk6IFByb3RvY29sVVJJLCBtZXRhZGF0YTogUmVjb3JkPHN0cmluZywgc3RyaW5nIHwgdW5kZWZpbmVkPik6IENoYW5nZXNTdW1tYXJ5IHwgdW5kZWZpbmVkIHtcblx0XHQvLyBMb2FkZWQgc2Vzc2lvbjogdGhlIGNhbGxlciBoYXMgYWxyZWFkeSBwcm9qZWN0ZWRcblx0XHQvLyBgc3RhdGUuc3VtbWFyeS5jaGFuZ2VzYCBvbnRvIHRoZSBlbnRyeS4gTm90aGluZyB0byBvdmVybGF5LlxuXHRcdGlmICh0aGlzLl9zdGF0ZU1hbmFnZXIuZ2V0U2Vzc2lvblN0YXRlKHNlc3Npb25VcmkpKSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblxuXHRcdC8vIENoZWNrIGlmIHRoZSBtZXRhZGF0YSBjb250YWlucyB0aGUgY2hhbmdlcyBzdW1tYXJ5LiBJbiB0aGUgcGFzdCB3ZVxuXHRcdC8vIHVzZWQgdG8gc3RvcmUgdGhlIGNoYW5nZXNldHMgaW4gdGhlIHNlc3Npb24gZGF0YWJhc2UgYnV0IHdlIGhhdmVcblx0XHQvLyBzaW5jZSBtb3ZlZCB0byBhIG1vcmUgZWZmaWNpZW50IHN0b3JhZ2UgbWVjaGFuaXNtIGJ5IG9ubHkgc3RvcmluZ1xuXHRcdC8vIHRoZSBjaGFuZ2VzIHN1bW1hcnkuXG5cdFx0Y29uc3QgY2hhbmdlc1N1bW1hcnkgPSBtZXRhZGF0YVtNRVRBX0NIQU5HRVNfU1VNTUFSWV07XG5cdFx0aWYgKGNoYW5nZXNTdW1tYXJ5ICE9PSB1bmRlZmluZWQpIHtcblx0XHRcdHRyeSB7XG5cdFx0XHRcdHJldHVybiBKU09OLnBhcnNlKGNoYW5nZXNTdW1tYXJ5KSBhcyBDaGFuZ2VzU3VtbWFyeTtcblx0XHRcdH0gY2F0Y2ggKGVycm9yKSB7XG5cdFx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0Ly8gUmVhZCBsaXZlIHN0YXRlIGZvciBhbiB1bm9wZW5lZCBzZXNzaW9uOiBzeW50aGVzaXNlIHRoZSBhZ2dyZWdhdGVcblx0XHQvLyBmcm9tIHRoZSBsaXZlIGBjaGFuZ2VLaW5kOiAnYnJhbmNoJ2AgY2hhbmdlc2V0IHN0YXRlLiBDb3VudHMgc3RheVxuXHRcdC8vIGluIGxvY2tzdGVwIHdpdGggdGhlIGFjdHVhbCBjaGFuZ2VzZXQgc3RhdGUgZm9yIHRoZSBzZXNzaW9uLWxpc3QgY2hpcC5cblx0XHRjb25zdCBsaXZlU2Vzc2lvbiA9IHRoaXMuX3N0YXRlTWFuYWdlci5nZXRDaGFuZ2VzZXRTdGF0ZShidWlsZEJyYW5jaENoYW5nZXNldFVyaShzZXNzaW9uVXJpKSk7XG5cdFx0Y29uc3QgbGl2ZUNoYW5nZXMgPSBjb21wdXRlQ2hhbmdlc1N1bW1hcnlGcm9tTGl2ZVN0YXRlKGxpdmVTZXNzaW9uKTtcblx0XHRpZiAobGl2ZUNoYW5nZXMpIHtcblx0XHRcdC8vIE1pZ3JhdGUgdGhlIGNoYW5nZXMgc3VtbWFyeSB0byB0aGUgbmV3IHN0b3JhZ2UgbWVjaGFuaXNtLlxuXHRcdFx0dGhpcy5wZXJzaXN0Q2hhbmdlc1N1bW1hcnkoc2Vzc2lvblVyaSwgbGl2ZUNoYW5nZXMpO1xuXHRcdFx0cmV0dXJuIGxpdmVDaGFuZ2VzO1xuXHRcdH1cblxuXHRcdC8vIE5vIGxpdmUgc291cmNlIFx1MjAxNCB0cnkgcGVyc2lzdGVkIGJsb2JzIChpZiB0aGUgY2FsbGVyIGJhdGNoZWQgdGhlbSkuXG5cdFx0Y29uc3QgYnJhbmNoUmF3ID0gbWV0YWRhdGFbTUVUQV9DSEFOR0VTRVRfQlJBTkNIXTtcblx0XHRjb25zdCBsZWdhY3lSYXcgPSBtZXRhZGF0YVtNRVRBX0xFR0FDWV9ESUZGU107XG5cdFx0aWYgKGJyYW5jaFJhdyA9PT0gdW5kZWZpbmVkICYmIGxlZ2FjeVJhdyA9PT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblx0XHRjb25zdCByZXN0b3JlZCA9IHRoaXMucGFyc2VQZXJzaXN0ZWRTdGF0aWNDaGFuZ2VzZXRzKHNlc3Npb25VcmksIHsgYnJhbmNoUmF3LCBsZWdhY3lSYXcgfSk7XG5cblx0XHQvLyBgbGlzdFNlc3Npb25zYCBtdXN0IG5vdCBzZWVkIGZ1bGwgY2hhbmdlc2V0IHN0YXRlIGZvciBldmVyeSByb3c7IGl0XG5cdFx0Ly8gb25seSBwYXJzZXMgcGVyc2lzdGVkIGJsb2JzIGVub3VnaCB0byByZW5kZXIgdGhlIGNoaXAgYWdncmVnYXRlLlxuXHRcdC8vIE9uY2UgdGhlIHNlc3Npb24gaXMgb3BlbmVkIHZpYSBgcmVzdG9yZVNlc3Npb25gLCB0aGUgbGl2ZSBvdmVybGF5IGluXG5cdFx0Ly8gYEFnZW50U2VydmljZS5saXN0U2Vzc2lvbnNgIHJlcGxhY2VzIHRoaXMgcGFyc2Utb25seSBhZ2dyZWdhdGUuXG5cdFx0Y29uc3QgcGVyc2lzdGVkQ2hhbmdlcyA9IGNvbXB1dGVDaGFuZ2VzU3VtbWFyeUZyb21QZXJzaXN0ZWREaWZmcyhyZXN0b3JlZC5icmFuY2gpO1xuXHRcdGlmIChwZXJzaXN0ZWRDaGFuZ2VzKSB7XG5cdFx0XHQvLyBNaWdyYXRlIHRoZSBjaGFuZ2VzIHN1bW1hcnkgdG8gdGhlIG5ldyBzdG9yYWdlIG1lY2hhbmlzbS5cblx0XHRcdHRoaXMucGVyc2lzdENoYW5nZXNTdW1tYXJ5KHNlc3Npb25VcmksIHBlcnNpc3RlZENoYW5nZXMpO1xuXHRcdFx0cmV0dXJuIHBlcnNpc3RlZENoYW5nZXM7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0fVxuXG5cdGlzU3RhdGljQ2hhbmdlc2V0Q29tcHV0ZUFjdGl2ZShjaGFuZ2VzZXRVcmk6IFByb3RvY29sVVJJKTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuIHRoaXMuX2FjdGl2ZVN0YXRpY0NvbXB1dGVzLmhhcyhjaGFuZ2VzZXRVcmkpO1xuXHR9XG5cblx0cHJpdmF0ZSBfc2VlZElmRW1wdHkoc2Vzc2lvbjogUHJvdG9jb2xVUkksIGtpbmQ6IFN0YXRpY0NoYW5nZXNldEtpbmQsIGRpZmZzOiByZWFkb25seSBJU2Vzc2lvbkZpbGVEaWZmW10gfCB1bmRlZmluZWQpOiB2b2lkIHtcblx0XHRpZiAoIWRpZmZzKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGNvbnN0IGV4aXN0aW5nID0gdGhpcy5fc3RhdGVNYW5hZ2VyLmdldENoYW5nZXNldFN0YXRlKHN0YXRpY0NoYW5nZXNldFVyaShzZXNzaW9uLCBraW5kKSk7XG5cdFx0aWYgKGV4aXN0aW5nICYmIGV4aXN0aW5nLmZpbGVzLmxlbmd0aCA+IDApIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0dGhpcy5yZXN0b3JlU3RhdGljQ2hhbmdlc2V0KHNlc3Npb24sIGtpbmQsIGRpZmZzKTtcblx0fVxuXG5cdHJlZnJlc2hDaGFuZ2VzZXRDYXRhbG9nKHNlc3Npb246IFByb3RvY29sVVJJKTogdm9pZCB7XG5cdFx0Y29uc3Qgc3RhdGUgPSB0aGlzLl9zdGF0ZU1hbmFnZXIuZ2V0U2Vzc2lvblN0YXRlKHNlc3Npb24pO1xuXHRcdGlmICghc3RhdGUgfHwgc3RhdGU/LmxpZmVjeWNsZSA9PT0gU2Vzc2lvbkxpZmVjeWNsZS5DcmVhdGlvbkZhaWxlZCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IGNoYW5nZXNldHMgPSBidWlsZERlZmF1bHRDaGFuZ2VzZXRDYXRhbG9nKHNlc3Npb24sIHN0YXRlKTtcblx0XHR0aGlzLl9zdGF0ZU1hbmFnZXIuc2V0U2Vzc2lvbkNoYW5nZXNldHMoc2Vzc2lvbiwgY2hhbmdlc2V0cyk7XG5cdH1cblxuXHRyZWZyZXNoQnJhbmNoQ2hhbmdlc2V0KHNlc3Npb246IFByb3RvY29sVVJJKTogdm9pZCB7XG5cdFx0aWYgKCF0aGlzLl9oYXNXb3JraW5nRGlyZWN0b3J5KHNlc3Npb24pKSB7XG5cdFx0XHR0aGlzLl9wZW5kaW5nTWF0ZXJpYWxpemF0aW9uLmFkZChzZXNzaW9uKTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0dGhpcy5fc2NoZWR1bGVTdGF0aWNSZWNvbXB1dGUoc2Vzc2lvbiwgJ2JyYW5jaCcsIHVuZGVmaW5lZCwgdGhpcy5fbWFya1N0YXRpY0NoYW5nZXNldENvbXB1dGluZyhzZXNzaW9uLCAnYnJhbmNoJykpO1xuXHR9XG5cblx0cmVmcmVzaFNlc3Npb25DaGFuZ2VzZXQoc2Vzc2lvbjogUHJvdG9jb2xVUkkpOiB2b2lkIHtcblx0XHRpZiAoIXRoaXMuX2hhc1dvcmtpbmdEaXJlY3Rvcnkoc2Vzc2lvbikpIHtcblx0XHRcdHRoaXMuX3BlbmRpbmdNYXRlcmlhbGl6YXRpb24uYWRkKHNlc3Npb24pO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHR0aGlzLl9zY2hlZHVsZVN0YXRpY1JlY29tcHV0ZShzZXNzaW9uLCAnc2Vzc2lvbicsIHVuZGVmaW5lZCwgdGhpcy5fbWFya1N0YXRpY0NoYW5nZXNldENvbXB1dGluZyhzZXNzaW9uLCAnc2Vzc2lvbicpKTtcblx0fVxuXG5cdC8qKlxuXHQgKiBEcmFpbnMgc3RhdGljIGNoYW5nZXNldCByZWZyZXNoZXMgdGhhdCB3ZXJlIGRlZmVycmVkIGJlY2F1c2UgdGhlXG5cdCAqIHNlc3Npb24ncyB3b3JraW5nIGRpcmVjdG9yeSB3YXMgbm90IHlldCBrbm93bi4gQ2FsbGVkIGJ5IHRoZVxuXHQgKiBjb29yZGluYXRvciBvbmNlIGEgc2Vzc2lvbiBpcyBtYXRlcmlhbGl6ZWQgb3IgcmVzdG9yZWQuIFJlY29tcHV0ZXNcblx0ICogZXZlcnkgY2hhbmdlc2V0IHN0aWxsIHN1YnNjcmliZWQgZm9yIHRoZSBzZXNzaW9uOyBzdWJzY3JpcHRpb25zIHRoYXRcblx0ICogZHJvcHBlZCB3aGlsZSB0aGUgd29ya2luZyBkaXJlY3Rvcnkgd2FzIHVua25vd24gYXJlIG5hdHVyYWxseSBza2lwcGVkLlxuXHQgKi9cblx0b25Xb3JraW5nRGlyZWN0b3J5QXZhaWxhYmxlKHNlc3Npb246IFByb3RvY29sVVJJKTogdm9pZCB7XG5cdFx0aWYgKHRoaXMuX3BlbmRpbmdNYXRlcmlhbGl6YXRpb24uZGVsZXRlKHNlc3Npb24pKSB7XG5cdFx0XHR0aGlzLnJlY29tcHV0ZVN1YnNjcmliZWRDaGFuZ2VzZXRzKHNlc3Npb24pO1xuXHRcdH1cblx0fVxuXG5cdC8qKlxuXHQgKiBSZWNvbXB1dGVzIGV2ZXJ5IGNoYW5nZXNldCBjdXJyZW50bHkgc3Vic2NyaWJlZCBmb3IgYHNlc3Npb25gLiBFYWNoXG5cdCAqIHN1YnNjcmliZWQgY2hhbmdlc2V0IGlzIGRpc3BhdGNoZWQgdG8gaXRzIGtpbmQtc3BlY2lmaWMgcmVjb21wdXRlOyB0aGVcblx0ICogcmVjb21wdXRlcyBzZWxmLWRlZmVyIHdoZW4gdGhlIHdvcmtpbmcgZGlyZWN0b3J5IGlzIHN0aWxsIHVua25vd24uXG5cdCAqL1xuXHRyZWNvbXB1dGVTdWJzY3JpYmVkQ2hhbmdlc2V0cyhzZXNzaW9uOiBQcm90b2NvbFVSSSk6IHZvaWQge1xuXHRcdGNvbnN0IHN1YnNjcmlwdGlvbnMgPSB0aGlzLl9jaGFuZ2VzZXRTdWJzY3JpcHRpb25zLmdldFNlc3Npb25TdWJzY3JpcHRpb25zKHNlc3Npb24pO1xuXHRcdGlmIChzdWJzY3JpcHRpb25zLnNpemUgPT09IDApIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0Zm9yIChjb25zdCBjaGFuZ2VzZXQgb2Ygc3Vic2NyaXB0aW9ucykge1xuXHRcdFx0Y29uc3QgcGFyc2VkID0gcGFyc2VDaGFuZ2VzZXRVcmkoY2hhbmdlc2V0KTtcblx0XHRcdHN3aXRjaCAocGFyc2VkPy5raW5kKSB7XG5cdFx0XHRcdGNhc2UgQ2hhbmdlc2V0S2luZC5CcmFuY2g6XG5cdFx0XHRcdFx0dGhpcy5yZWZyZXNoQnJhbmNoQ2hhbmdlc2V0KHNlc3Npb24pO1xuXHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHRjYXNlIENoYW5nZXNldEtpbmQuU2Vzc2lvbjpcblx0XHRcdFx0XHR0aGlzLnJlZnJlc2hTZXNzaW9uQ2hhbmdlc2V0KHNlc3Npb24pO1xuXHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHRjYXNlIENoYW5nZXNldEtpbmQuVW5jb21taXR0ZWQ6XG5cdFx0XHRcdFx0dm9pZCB0aGlzLmNvbXB1dGVVbmNvbW1pdHRlZENoYW5nZXNldChzZXNzaW9uKTtcblx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0Y2FzZSBDaGFuZ2VzZXRLaW5kLlR1cm46XG5cdFx0XHRcdFx0aWYgKHBhcnNlZC50dXJuSWQgIT09IHVuZGVmaW5lZCkge1xuXHRcdFx0XHRcdFx0dm9pZCB0aGlzLmNvbXB1dGVUdXJuQ2hhbmdlc2V0KHNlc3Npb24sIHBhcnNlZC50dXJuSWQpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0ZGVmYXVsdDpcblx0XHRcdFx0XHQvLyBBIHBsYWluIHNlc3Npb24gVVJJIHN1YnNjcmlwdGlvbiAoQWdlbnRzIFdpbmRvdyBsaXN0IC9cblx0XHRcdFx0XHQvLyBkZXRhaWwgb2JzZXJ2aW5nIHRoZSBzZXNzaW9uKSBpbXBsaWNpdGx5IG9ic2VydmVzIHRoZVxuXHRcdFx0XHRcdC8vIGNhdGFsb2d1ZSdzIHN0YXRpYyBjaGFuZ2VzZXRzIFx1MjAxNCByZWZyZXNoIGJvdGguXG5cdFx0XHRcdFx0aWYgKGNoYW5nZXNldCA9PT0gc2Vzc2lvbikge1xuXHRcdFx0XHRcdFx0dGhpcy5yZWZyZXNoQnJhbmNoQ2hhbmdlc2V0KHNlc3Npb24pO1xuXHRcdFx0XHRcdFx0dGhpcy5yZWZyZXNoU2Vzc2lvbkNoYW5nZXNldChzZXNzaW9uKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG5cblx0LyoqXG5cdCAqIEZvcmdldHMgYW55IGRlZmVycmVkIHN0YXRpYyBjaGFuZ2VzZXQgcmVmcmVzaGVzIHF1ZXVlZCBmb3IgYSBzZXNzaW9uXG5cdCAqIHRoYXQgaXMgYmVpbmcgZGlzcG9zZWQuXG5cdCAqL1xuXHRvblNlc3Npb25EaXNwb3NlZChzZXNzaW9uOiBQcm90b2NvbFVSSSk6IHZvaWQge1xuXHRcdHRoaXMuX3BlbmRpbmdNYXRlcmlhbGl6YXRpb24uZGVsZXRlKHNlc3Npb24pO1xuXHR9XG5cblx0Y29tcHV0ZVR1cm5DaGFuZ2VzZXQoc2Vzc2lvbjogUHJvdG9jb2xVUkksIHR1cm5JZDogc3RyaW5nKTogUHJvbWlzZTxQcm90b2NvbFVSST4ge1xuXHRcdC8vIFR1cm4gdGVsZW1ldHJ5IGlzIGVtaXR0ZWQgYXQgdGhlIHR1cm4gYm91bmRhcnkgKG9uVHVybkNvbXBsZXRlKTsgdGhpcyBzdWJzY3JpYmUtdHJpZ2dlcmVkIHJlY29tcHV0ZSBkb2VzIG5vdCByZXBvcnQuXG5cdFx0cmV0dXJuIHRoaXMuX2NvbXB1dGVUdXJuQ2hhbmdlc2V0KHNlc3Npb24sIHR1cm5JZCwgZmFsc2UpO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBfY29tcHV0ZVR1cm5DaGFuZ2VzZXQoc2Vzc2lvbjogUHJvdG9jb2xVUkksIHR1cm5JZDogc3RyaW5nLCByZXBvcnRUZWxlbWV0cnk6IGJvb2xlYW4sIGNsaWVudENvbnRleHQ/OiBJQWdlbnRIb3N0Q2xpZW50VGVsZW1ldHJ5Q29udGV4dCk6IFByb21pc2U8UHJvdG9jb2xVUkk+IHtcblx0XHRjb25zdCB0dXJuVXJpID0gdGhpcy5fc3RhdGVNYW5hZ2VyLnJlZ2lzdGVyQ2hhbmdlc2V0KGJ1aWxkVHVybkNoYW5nZXNldFVyaShzZXNzaW9uLCB0dXJuSWQpKTtcblx0XHRjb25zdCBzdG9wV2F0Y2ggPSBTdG9wV2F0Y2guY3JlYXRlKCk7XG5cdFx0bGV0IG91dGNvbWU6IFR1cm5DaGFuZ2VzZXRPdXRjb21lID0gJ2Vycm9yJztcblx0XHRsZXQgcmVzdWx0OiBJVHVybkRpZmZSZXN1bHQgfCB1bmRlZmluZWQ7XG5cdFx0bGV0IGZpbGVDb3VudDogbnVtYmVyIHwgdW5kZWZpbmVkO1xuXHRcdHRyeSB7XG5cdFx0XHRsZXQgcmVmOiBSZXR1cm5UeXBlPElTZXNzaW9uRGF0YVNlcnZpY2VbJ29wZW5EYXRhYmFzZSddPjtcblx0XHRcdHRyeSB7XG5cdFx0XHRcdHJlZiA9IHRoaXMuX3Nlc3Npb25EYXRhU2VydmljZS5vcGVuRGF0YWJhc2UoVVJJLnBhcnNlKHNlc3Npb24pKTtcblx0XHRcdH0gY2F0Y2ggKGVycikge1xuXHRcdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLndhcm4oYFtBZ2VudEhvc3RDaGFuZ2VzZXRTZXJ2aWNlXSBGYWlsZWQgdG8gb3BlbiBzZXNzaW9uIGRhdGFiYXNlIGZvciB0dXJuIGRpZmY6ICR7c2Vzc2lvbn1gLCBlcnIpO1xuXHRcdFx0XHR0aGlzLl9zdGF0ZU1hbmFnZXIuZGlzcGF0Y2hTZXJ2ZXJBY3Rpb24odHVyblVyaSwge1xuXHRcdFx0XHRcdHR5cGU6IEFjdGlvblR5cGUuQ2hhbmdlc2V0U3RhdHVzQ2hhbmdlZCxcblx0XHRcdFx0XHRzdGF0dXM6IENoYW5nZXNldFN0YXR1cy5FcnJvcixcblx0XHRcdFx0XHRlcnJvcjogeyBlcnJvclR5cGU6ICdjb21wdXRlRmFpbGVkJywgbWVzc2FnZTogZXJyIGluc3RhbmNlb2YgRXJyb3IgPyBlcnIubWVzc2FnZSA6IFN0cmluZyhlcnIpIH0sXG5cdFx0XHRcdH0pO1xuXHRcdFx0XHRvdXRjb21lID0gJ2RiT3BlbkZhaWxlZCc7XG5cdFx0XHRcdHJldHVybiB0dXJuVXJpO1xuXHRcdFx0fVxuXHRcdFx0dHJ5IHtcblx0XHRcdFx0Ly8gUHJlZmVyIHRoZSBjaGVja3BvaW50LXJlZiBnaXQgZGlmZiB3aGVuIGF2YWlsYWJsZSBcdTIwMTQgdGhhdCBwYXRoXG5cdFx0XHRcdC8vIGNhcHR1cmVzIHRlcm1pbmFsLXRvb2wgZWRpdHMgdGhlIEZpbGVFZGl0VHJhY2tlciBwaXBlbGluZVxuXHRcdFx0XHQvLyAoYGZpbGVfZWRpdHNgIHJvd3MpIG1pc3Nlcy4gRmFsbHMgYmFjayB0byB0aGUgU0RLLXRyYWNrZWRcblx0XHRcdFx0Ly8gYWdncmVnYXRvciB3aGVuIGNoZWNrcG9pbnRzIGFyZW4ndCBzZXQgdXAgKG5vbi1naXQgZm9sZGVyXG5cdFx0XHRcdC8vIGlzb2xhdGlvbiwgYmFzZWxpbmUgbmV2ZXIgY2FwdHVyZWQsIG9yIGNhcHR1cmUgZmFpbHVyZSkuXG5cdFx0XHRcdHJlc3VsdCA9IGF3YWl0IHRoaXMuX2NvbXB1dGVUdXJuRGlmZnNQcmVmZXJDaGVja3BvaW50KHNlc3Npb24sIHJlZi5vYmplY3QsIHR1cm5JZCk7XG5cdFx0XHRcdG91dGNvbWUgPSByZXN1bHQub3V0Y29tZTtcblx0XHRcdFx0ZmlsZUNvdW50ID0gcmVzdWx0LmRpZmZzLmxlbmd0aDtcblx0XHRcdFx0dGhpcy5fcHVibGlzaENoYW5nZXNldERpZmZzKHNlc3Npb24sIHR1cm5VcmksIHJlc3VsdC5kaWZmcyk7XG5cdFx0XHR9IGNhdGNoIChlcnIpIHtcblx0XHRcdFx0dGhpcy5fbG9nU2VydmljZS53YXJuKGBbQWdlbnRIb3N0Q2hhbmdlc2V0U2VydmljZV0gRmFpbGVkIHRvIGNvbXB1dGUgdHVybiBkaWZmcyBmb3IgJHtzZXNzaW9ufS8ke3R1cm5JZH1gLCBlcnIpO1xuXHRcdFx0XHR0aGlzLl9zdGF0ZU1hbmFnZXIuZGlzcGF0Y2hTZXJ2ZXJBY3Rpb24odHVyblVyaSwge1xuXHRcdFx0XHRcdHR5cGU6IEFjdGlvblR5cGUuQ2hhbmdlc2V0U3RhdHVzQ2hhbmdlZCxcblx0XHRcdFx0XHRzdGF0dXM6IENoYW5nZXNldFN0YXR1cy5FcnJvcixcblx0XHRcdFx0XHRlcnJvcjogeyBlcnJvclR5cGU6ICdjb21wdXRlRmFpbGVkJywgbWVzc2FnZTogZXJyIGluc3RhbmNlb2YgRXJyb3IgPyBlcnIubWVzc2FnZSA6IFN0cmluZyhlcnIpIH0sXG5cdFx0XHRcdH0pO1xuXHRcdFx0XHRvdXRjb21lID0gJ2Vycm9yJztcblx0XHRcdH0gZmluYWxseSB7XG5cdFx0XHRcdHJlZi5kaXNwb3NlKCk7XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm4gdHVyblVyaTtcblx0XHR9IGZpbmFsbHkge1xuXHRcdFx0aWYgKHJlcG9ydFRlbGVtZXRyeSkge1xuXHRcdFx0XHRjb25zdCB3b3JraW5nRGlyZWN0b3JpZXMgPSB0aGlzLl9jb25maWd1cmF0aW9uU2VydmljZS5nZXRFZmZlY3RpdmVXb3JraW5nRGlyZWN0b3JpZXMoc2Vzc2lvbik7XG5cdFx0XHRcdHJlcG9ydEFnZW50SG9zdFR1cm5DaGFuZ2VzZXRDb21wdXRlZCh0aGlzLl90ZWxlbWV0cnlTZXJ2aWNlLCBzZXNzaW9uLCB0dXJuSWQsIHtcblx0XHRcdFx0XHRvdXRjb21lLFxuXHRcdFx0XHRcdGR1cmF0aW9uTXM6IHN0b3BXYXRjaC5lbGFwc2VkKCksXG5cdFx0XHRcdFx0aXNNdWx0aVJvb3Q6IGlzTXVsdGlSb290U2Vzc2lvbih3b3JraW5nRGlyZWN0b3JpZXMpLFxuXHRcdFx0XHRcdGZvbGRlckNvdW50OiB3b3JraW5nRGlyZWN0b3JpZXM/Lmxlbmd0aCA/PyAwLFxuXHRcdFx0XHRcdC4uLihvdXRjb21lID09PSAnY29tcHV0ZWQnICYmIGZpbGVDb3VudCAhPT0gdW5kZWZpbmVkID8geyBmaWxlQ291bnQgfSA6IHt9KSxcblx0XHRcdFx0XHRtdWx0aVJvb3Q6IHJlc3VsdD8ubXVsdGlSb290LFxuXHRcdFx0XHR9LCBjbGllbnRDb250ZXh0KTtcblx0XHRcdH1cblx0XHR9XG5cdH1cblxuXHRhc3luYyBjb21wdXRlQ29tcGFyZVR1cm5zQ2hhbmdlc2V0KHNlc3Npb246IFByb3RvY29sVVJJLCBvcmlnaW5hbFR1cm5JZDogc3RyaW5nLCBtb2RpZmllZFR1cm5JZDogc3RyaW5nKTogUHJvbWlzZTxQcm90b2NvbFVSST4ge1xuXHRcdGNvbnN0IGNvbXBhcmVVcmkgPSB0aGlzLl9zdGF0ZU1hbmFnZXIucmVnaXN0ZXJDaGFuZ2VzZXQoYnVpbGRDb21wYXJlVHVybnNDaGFuZ2VzZXRVcmkoc2Vzc2lvbiwgb3JpZ2luYWxUdXJuSWQsIG1vZGlmaWVkVHVybklkKSk7XG5cdFx0bGV0IHJlZjogUmV0dXJuVHlwZTxJU2Vzc2lvbkRhdGFTZXJ2aWNlWydvcGVuRGF0YWJhc2UnXT47XG5cdFx0dHJ5IHtcblx0XHRcdHJlZiA9IHRoaXMuX3Nlc3Npb25EYXRhU2VydmljZS5vcGVuRGF0YWJhc2UoVVJJLnBhcnNlKHNlc3Npb24pKTtcblx0XHR9IGNhdGNoIChlcnIpIHtcblx0XHRcdHRoaXMuX2xvZ1NlcnZpY2Uud2FybihgW0FnZW50SG9zdENoYW5nZXNldFNlcnZpY2VdIEZhaWxlZCB0byBvcGVuIHNlc3Npb24gZGF0YWJhc2UgZm9yIGNvbXBhcmUtdHVybnMgZGlmZjogJHtzZXNzaW9ufWAsIGVycik7XG5cdFx0XHR0aGlzLl9zdGF0ZU1hbmFnZXIuZGlzcGF0Y2hTZXJ2ZXJBY3Rpb24oY29tcGFyZVVyaSwge1xuXHRcdFx0XHR0eXBlOiBBY3Rpb25UeXBlLkNoYW5nZXNldFN0YXR1c0NoYW5nZWQsXG5cdFx0XHRcdHN0YXR1czogQ2hhbmdlc2V0U3RhdHVzLkVycm9yLFxuXHRcdFx0XHRlcnJvcjogeyBlcnJvclR5cGU6ICdjb21wdXRlRmFpbGVkJywgbWVzc2FnZTogZXJyIGluc3RhbmNlb2YgRXJyb3IgPyBlcnIubWVzc2FnZSA6IFN0cmluZyhlcnIpIH0sXG5cdFx0XHR9KTtcblx0XHRcdHJldHVybiBjb21wYXJlVXJpO1xuXHRcdH1cblx0XHR0cnkge1xuXHRcdFx0Y29uc3Qgc2Vzc2lvblVyaSA9IFVSSS5wYXJzZShzZXNzaW9uKTtcblx0XHRcdGNvbnN0IFtvcmlnaW5hbEN1cnJlbnRSZWYsIG1vZGlmaWVkUGFpcl0gPSBhd2FpdCBQcm9taXNlLmFsbChbXG5cdFx0XHRcdHRoaXMuX2NoZWNrcG9pbnRTZXJ2aWNlLmdldFR1cm5DaGVja3BvaW50UGFpcihzZXNzaW9uVXJpLCBvcmlnaW5hbFR1cm5JZCkudGhlbihwID0+IHA/LmN1cnJlbnQpLFxuXHRcdFx0XHR0aGlzLl9jaGVja3BvaW50U2VydmljZS5nZXRUdXJuQ2hlY2twb2ludFBhaXIoc2Vzc2lvblVyaSwgbW9kaWZpZWRUdXJuSWQpLFxuXHRcdFx0XSk7XG5cdFx0XHRpZiAoIW9yaWdpbmFsQ3VycmVudFJlZiB8fCAhbW9kaWZpZWRQYWlyKSB7XG5cdFx0XHRcdC8vIE9uZSBvZiB0aGUgdHVybnMgaGFzIG5vIGNoZWNrcG9pbnQgXHUyMDE0IGVpdGhlciBpdCdzIGFuXG5cdFx0XHRcdC8vIHVua25vd24gaWQsIHRoZSBzZXNzaW9uIGlzbid0IGdpdC1iYWNrZWQsIG9yIHRoZVxuXHRcdFx0XHQvLyBiYXNlbGluZSAvIGNhcHR1cmUgZmFpbGVkLiBObyBlZGl0LXRyYWNrZXIgZmFsbGJhY2tcblx0XHRcdFx0Ly8gZXhpc3RzIGZvciBiZXR3ZWVuLXR3by10dXJucyBjb21wYXJpc29ucy5cblx0XHRcdFx0Y29uc3QgbWlzc2luZyA9ICFvcmlnaW5hbEN1cnJlbnRSZWYgJiYgIW1vZGlmaWVkUGFpclxuXHRcdFx0XHRcdD8gJ2JvdGggdHVybnMnXG5cdFx0XHRcdFx0OiAhb3JpZ2luYWxDdXJyZW50UmVmXG5cdFx0XHRcdFx0XHQ/ICdvcmlnaW5hbCB0dXJuJ1xuXHRcdFx0XHRcdFx0OiAnbW9kaWZpZWQgdHVybic7XG5cdFx0XHRcdHRoaXMuX3N0YXRlTWFuYWdlci5kaXNwYXRjaFNlcnZlckFjdGlvbihjb21wYXJlVXJpLCB7XG5cdFx0XHRcdFx0dHlwZTogQWN0aW9uVHlwZS5DaGFuZ2VzZXRTdGF0dXNDaGFuZ2VkLFxuXHRcdFx0XHRcdHN0YXR1czogQ2hhbmdlc2V0U3RhdHVzLkVycm9yLFxuXHRcdFx0XHRcdGVycm9yOiB7IGVycm9yVHlwZTogJ2NvbXB1dGVGYWlsZWQnLCBtZXNzYWdlOiBgTm8gY2hlY2twb2ludCBhdmFpbGFibGUgZm9yICR7bWlzc2luZ307IGNvbXBhcmUgcmVxdWlyZXMgZ2l0LWJhY2tlZCBzZXNzaW9ucy5gIH0sXG5cdFx0XHRcdH0pO1xuXHRcdFx0XHRyZXR1cm4gY29tcGFyZVVyaTtcblx0XHRcdH1cblx0XHRcdGlmIChvcmlnaW5hbEN1cnJlbnRSZWYgPT09IG1vZGlmaWVkUGFpci5jdXJyZW50KSB7XG5cdFx0XHRcdC8vIFNhbWUgZW5kcG9pbnQgb24gYm90aCBzaWRlcyBcdTIwMTQgZGlmZiBpcyBlbXB0eSBieVxuXHRcdFx0XHQvLyBjb25zdHJ1Y3Rpb24gKGNvdmVycyBjb21wYXJlKHR1cm4sIHR1cm4pIGFuZCB0aGUgbm8tb3Bcblx0XHRcdFx0Ly8gdHVybiBjYXNlIHdoZXJlIHR3byBhZGphY2VudCB0dXJucyBzaGFyZSBhIHJlZikuXG5cdFx0XHRcdHRoaXMuX3B1Ymxpc2hDaGFuZ2VzZXREaWZmcyhzZXNzaW9uLCBjb21wYXJlVXJpLCBbXSk7XG5cdFx0XHRcdHJldHVybiBjb21wYXJlVXJpO1xuXHRcdFx0fVxuXHRcdFx0Y29uc3Qgd29ya2luZ0RpciA9IGF3YWl0IHRoaXMuX3Jlc29sdmVXb3JraW5nRGlyZWN0b3J5KHNlc3Npb24pO1xuXHRcdFx0aWYgKCF3b3JraW5nRGlyKSB7XG5cdFx0XHRcdHRoaXMuX3N0YXRlTWFuYWdlci5kaXNwYXRjaFNlcnZlckFjdGlvbihjb21wYXJlVXJpLCB7XG5cdFx0XHRcdFx0dHlwZTogQWN0aW9uVHlwZS5DaGFuZ2VzZXRTdGF0dXNDaGFuZ2VkLFxuXHRcdFx0XHRcdHN0YXR1czogQ2hhbmdlc2V0U3RhdHVzLkVycm9yLFxuXHRcdFx0XHRcdGVycm9yOiB7IGVycm9yVHlwZTogJ2NvbXB1dGVGYWlsZWQnLCBtZXNzYWdlOiAnTm8gd29ya2luZyBkaXJlY3RvcnkgcmVjb3JkZWQgZm9yIHNlc3Npb247IGNvbXBhcmUgcmVxdWlyZXMgZ2l0LWJhY2tlZCBzZXNzaW9ucy4nIH0sXG5cdFx0XHRcdH0pO1xuXHRcdFx0XHRyZXR1cm4gY29tcGFyZVVyaTtcblx0XHRcdH1cblx0XHRcdGNvbnN0IGRpZmZzID0gYXdhaXQgdGhpcy5fZ2l0U2VydmljZS5jb21wdXRlRmlsZURpZmZzQmV0d2VlblJlZnMod29ya2luZ0Rpciwge1xuXHRcdFx0XHRzZXNzaW9uVXJpOiBzZXNzaW9uLFxuXHRcdFx0XHRmcm9tUmVmOiBvcmlnaW5hbEN1cnJlbnRSZWYsXG5cdFx0XHRcdHRvUmVmOiBtb2RpZmllZFBhaXIuY3VycmVudCxcblx0XHRcdH0pO1xuXHRcdFx0aWYgKGRpZmZzID09PSB1bmRlZmluZWQpIHtcblx0XHRcdFx0Ly8gYGNvbXB1dGVGaWxlRGlmZnNCZXR3ZWVuUmVmc2AgcmV0dXJucyB1bmRlZmluZWQgdG8gc2lnbmFsIGFcblx0XHRcdFx0Ly8gZ2l0IGZhaWx1cmUgKG5vdCBhIGdpdCB3b3JrIHRyZWUsIGJhZCByZWYsIHRyYW5zcG9ydCBlcnJvcixcblx0XHRcdFx0Ly8gZXRjLikgYW5kIGFuIGVtcHR5IGFycmF5IHRvIHNpZ25hbCBcIm5vIGNoYW5nZXNcIi4gQ29sbGFwc2luZ1xuXHRcdFx0XHQvLyBib3RoIGludG8gW10gd291bGQgbWFzayByZWFsIGZhaWx1cmVzIGFzIGFuIGVtcHR5IFJlYWR5XG5cdFx0XHRcdC8vIHNuYXBzaG90IFx1MjAxNCBzdXJmYWNlIHRoZSBmYWlsdXJlIGV4cGxpY2l0bHkgaW5zdGVhZC5cblx0XHRcdFx0dGhpcy5fc3RhdGVNYW5hZ2VyLmRpc3BhdGNoU2VydmVyQWN0aW9uKGNvbXBhcmVVcmksIHtcblx0XHRcdFx0XHR0eXBlOiBBY3Rpb25UeXBlLkNoYW5nZXNldFN0YXR1c0NoYW5nZWQsXG5cdFx0XHRcdFx0c3RhdHVzOiBDaGFuZ2VzZXRTdGF0dXMuRXJyb3IsXG5cdFx0XHRcdFx0ZXJyb3I6IHsgZXJyb3JUeXBlOiAnY29tcHV0ZUZhaWxlZCcsIG1lc3NhZ2U6IGBGYWlsZWQgdG8gY29tcHV0ZSBjb21wYXJlLXR1cm5zIGRpZmYgZnJvbSBnaXQgKCR7b3JpZ2luYWxDdXJyZW50UmVmfS4uJHttb2RpZmllZFBhaXIuY3VycmVudH0pLmAgfSxcblx0XHRcdFx0fSk7XG5cdFx0XHRcdHJldHVybiBjb21wYXJlVXJpO1xuXHRcdFx0fVxuXHRcdFx0dGhpcy5fcHVibGlzaENoYW5nZXNldERpZmZzKHNlc3Npb24sIGNvbXBhcmVVcmksIGRpZmZzKTtcblx0XHR9IGNhdGNoIChlcnIpIHtcblx0XHRcdHRoaXMuX2xvZ1NlcnZpY2Uud2FybihgW0FnZW50SG9zdENoYW5nZXNldFNlcnZpY2VdIEZhaWxlZCB0byBjb21wdXRlIGNvbXBhcmUtdHVybnMgZGlmZnMgZm9yICR7c2Vzc2lvbn0vJHtvcmlnaW5hbFR1cm5JZH0vJHttb2RpZmllZFR1cm5JZH1gLCBlcnIpO1xuXHRcdFx0dGhpcy5fc3RhdGVNYW5hZ2VyLmRpc3BhdGNoU2VydmVyQWN0aW9uKGNvbXBhcmVVcmksIHtcblx0XHRcdFx0dHlwZTogQWN0aW9uVHlwZS5DaGFuZ2VzZXRTdGF0dXNDaGFuZ2VkLFxuXHRcdFx0XHRzdGF0dXM6IENoYW5nZXNldFN0YXR1cy5FcnJvcixcblx0XHRcdFx0ZXJyb3I6IHsgZXJyb3JUeXBlOiAnY29tcHV0ZUZhaWxlZCcsIG1lc3NhZ2U6IGVyciBpbnN0YW5jZW9mIEVycm9yID8gZXJyLm1lc3NhZ2UgOiBTdHJpbmcoZXJyKSB9LFxuXHRcdFx0fSk7XG5cdFx0fSBmaW5hbGx5IHtcblx0XHRcdHJlZi5kaXNwb3NlKCk7XG5cdFx0fVxuXHRcdHJldHVybiBjb21wYXJlVXJpO1xuXHR9XG5cblx0Y29tcHV0ZVVuY29tbWl0dGVkQ2hhbmdlc2V0KHNlc3Npb246IFByb3RvY29sVVJJKTogUHJvbWlzZTxQcm90b2NvbFVSST4ge1xuXHRcdHJldHVybiB0aGlzLl9jb21wdXRlVW5jb21taXR0ZWRDaGFuZ2VzZXQoc2Vzc2lvbiwgdW5kZWZpbmVkLCBmYWxzZSk7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIF9jb21wdXRlVW5jb21taXR0ZWRDaGFuZ2VzZXQoc2Vzc2lvbjogUHJvdG9jb2xVUkksIHR1cm5JZDogc3RyaW5nIHwgdW5kZWZpbmVkLCByZXBvcnRUZWxlbWV0cnk6IGJvb2xlYW4sIGNsaWVudENvbnRleHQ/OiBJQWdlbnRIb3N0Q2xpZW50VGVsZW1ldHJ5Q29udGV4dCk6IFByb21pc2U8UHJvdG9jb2xVUkk+IHtcblx0XHRjb25zdCB1bmNvbW1pdHRlZFVyaSA9IHRoaXMuX3N0YXRlTWFuYWdlci5yZWdpc3RlckNoYW5nZXNldChidWlsZFVuY29tbWl0dGVkQ2hhbmdlc2V0VXJpKHNlc3Npb24pKTtcblx0XHRpZiAoIXRoaXMuX2hhc1N1YnNjcmlwdGlvbihzZXNzaW9uLCB1bmNvbW1pdHRlZFVyaSkpIHtcblx0XHRcdHJldHVybiB1bmNvbW1pdHRlZFVyaTtcblx0XHR9XG5cblx0XHQvLyBEZWZlciB1bnRpbCB0aGUgd29ya2luZyBkaXJlY3RvcnkgaXMga25vd24uIENvbXB1dGluZyBub3cgd291bGQgYmFpbFxuXHRcdC8vIGluIHRoZSBnaXQgcGF0aCAodGhlcmUgaXMgbm8gU0RLIGVkaXQtdHJhY2tlciBmYWxsYmFjayBmb3IgdGhlXG5cdFx0Ly8gdW5jb21taXR0ZWQgc2xvdCk7IGBvbldvcmtpbmdEaXJlY3RvcnlBdmFpbGFibGVgIHJlLXJ1bnMgdGhlIHJlZnJlc2hcblx0XHQvLyBvbmNlIG1hdGVyaWFsaXphdGlvbiAvIHJlc3RvcmUgcG9wdWxhdGVzIHRoZSBkaXJlY3RvcnkuXG5cdFx0aWYgKCF0aGlzLl9oYXNXb3JraW5nRGlyZWN0b3J5KHNlc3Npb24pKSB7XG5cdFx0XHR0aGlzLl9wZW5kaW5nTWF0ZXJpYWxpemF0aW9uLmFkZChzZXNzaW9uKTtcblx0XHRcdHJldHVybiB1bmNvbW1pdHRlZFVyaTtcblx0XHR9XG5cblx0XHRjb25zdCBzdGF0dXNCZWZvcmVDb21wdXRlID0gdGhpcy5fc3RhdGVNYW5hZ2VyLmdldENoYW5nZXNldFN0YXRlKHVuY29tbWl0dGVkVXJpKT8uc3RhdHVzO1xuXHRcdGlmIChzdGF0dXNCZWZvcmVDb21wdXRlICE9PSBDaGFuZ2VzZXRTdGF0dXMuQ29tcHV0aW5nKSB7XG5cdFx0XHR0aGlzLl9zdGF0ZU1hbmFnZXIuZGlzcGF0Y2hTZXJ2ZXJBY3Rpb24odW5jb21taXR0ZWRVcmksIHtcblx0XHRcdFx0dHlwZTogQWN0aW9uVHlwZS5DaGFuZ2VzZXRTdGF0dXNDaGFuZ2VkLFxuXHRcdFx0XHRzdGF0dXM6IENoYW5nZXNldFN0YXR1cy5Db21wdXRpbmcsXG5cdFx0XHR9KTtcblx0XHR9XG5cblx0XHRjb25zdCBzdG9wV2F0Y2ggPSBTdG9wV2F0Y2guY3JlYXRlKCk7XG5cdFx0Y29uc3Qgd29ya2luZ0RpcmVjdG9yaWVzID0gdGhpcy5fY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0RWZmZWN0aXZlV29ya2luZ0RpcmVjdG9yaWVzKHNlc3Npb24pO1xuXHRcdGxldCBvdXRjb21lOiBTdGF0aWNDaGFuZ2VzZXRPdXRjb21lID0gJ2Vycm9yJztcblx0XHRsZXQgZmlsZUNvdW50OiBudW1iZXIgfCB1bmRlZmluZWQ7XG5cdFx0dHJ5IHtcblx0XHRcdGNvbnN0IGRpZmZzID0gYXdhaXQgdGhpcy5fY29tcHV0ZVVuY29tbWl0dGVkRGlmZnMoc2Vzc2lvbik7XG5cdFx0XHRpZiAoZGlmZnMgPT09IHVuZGVmaW5lZCkge1xuXHRcdFx0XHQvLyBHaXQgdW5hdmFpbGFibGUgKG5vIHdvcmtpbmcgZGlyZWN0b3J5LCBub3QgYSBnaXQgd29ya1xuXHRcdFx0XHQvLyB0cmVlLCBvciB0aGUgZ2l0IGNvbW1hbmQgcmV0dXJuZWQgbm90aGluZykuIFN1cmZhY2UgYXNcblx0XHRcdFx0Ly8gRXJyb3IgcmF0aGVyIHRoYW4gcHJlc2VydmluZyBjYWNoZWQgc3RhdGUgXHUyMDE0IG5vIFNES1xuXHRcdFx0XHQvLyBlZGl0LXRyYWNrZXIgZmFsbGJhY2sgZXhpc3RzIGZvciB0aGUgdW5jb21taXR0ZWQgc2xvdC5cblx0XHRcdFx0dGhpcy5fc3RhdGVNYW5hZ2VyLmRpc3BhdGNoU2VydmVyQWN0aW9uKHVuY29tbWl0dGVkVXJpLCB7XG5cdFx0XHRcdFx0dHlwZTogQWN0aW9uVHlwZS5DaGFuZ2VzZXRTdGF0dXNDaGFuZ2VkLFxuXHRcdFx0XHRcdHN0YXR1czogQ2hhbmdlc2V0U3RhdHVzLkVycm9yLFxuXHRcdFx0XHRcdGVycm9yOiB7IGVycm9yVHlwZTogJ2NvbXB1dGVGYWlsZWQnLCBtZXNzYWdlOiAnRmFpbGVkIHRvIGNvbXB1dGUgdW5jb21taXR0ZWQgZGlmZiBmcm9tIGdpdC4nIH0sXG5cdFx0XHRcdH0pO1xuXHRcdFx0XHRvdXRjb21lID0gJ2dpdFVuYXZhaWxhYmxlJztcblx0XHRcdFx0cmV0dXJuIHVuY29tbWl0dGVkVXJpO1xuXHRcdFx0fVxuXG5cdFx0XHR0aGlzLl9wdWJsaXNoQ2hhbmdlc2V0RGlmZnMoc2Vzc2lvbiwgdW5jb21taXR0ZWRVcmksIGRpZmZzKTtcblx0XHRcdGZpbGVDb3VudCA9IGRpZmZzLmxlbmd0aDtcblx0XHRcdG91dGNvbWUgPSAnY29tcHV0ZWQnO1xuXHRcdH0gY2F0Y2ggKGVycikge1xuXHRcdFx0dGhpcy5fbG9nU2VydmljZS53YXJuKGBbQWdlbnRIb3N0Q2hhbmdlc2V0U2VydmljZV0gRmFpbGVkIHRvIGNvbXB1dGUgdW5jb21taXR0ZWQgZGlmZnMgZm9yICR7c2Vzc2lvbn1gLCBlcnIpO1xuXHRcdFx0dGhpcy5fc3RhdGVNYW5hZ2VyLmRpc3BhdGNoU2VydmVyQWN0aW9uKHVuY29tbWl0dGVkVXJpLCB7XG5cdFx0XHRcdHR5cGU6IEFjdGlvblR5cGUuQ2hhbmdlc2V0U3RhdHVzQ2hhbmdlZCxcblx0XHRcdFx0c3RhdHVzOiBDaGFuZ2VzZXRTdGF0dXMuRXJyb3IsXG5cdFx0XHRcdGVycm9yOiB7IGVycm9yVHlwZTogJ2NvbXB1dGVGYWlsZWQnLCBtZXNzYWdlOiBlcnIgaW5zdGFuY2VvZiBFcnJvciA/IGVyci5tZXNzYWdlIDogU3RyaW5nKGVycikgfSxcblx0XHRcdH0pO1xuXHRcdFx0b3V0Y29tZSA9ICdlcnJvcic7XG5cdFx0fSBmaW5hbGx5IHtcblx0XHRcdGlmIChyZXBvcnRUZWxlbWV0cnkpIHtcblx0XHRcdFx0cmVwb3J0QWdlbnRIb3N0U3RhdGljQ2hhbmdlc2V0Q29tcHV0ZWQodGhpcy5fdGVsZW1ldHJ5U2VydmljZSwgc2Vzc2lvbiwgdHVybklkLCB7XG5cdFx0XHRcdFx0a2luZDogJ3VuY29tbWl0dGVkJyxcblx0XHRcdFx0XHRvdXRjb21lLFxuXHRcdFx0XHRcdGR1cmF0aW9uTXM6IHN0b3BXYXRjaC5lbGFwc2VkKCksXG5cdFx0XHRcdFx0aXNNdWx0aVJvb3Q6IGlzTXVsdGlSb290U2Vzc2lvbih3b3JraW5nRGlyZWN0b3JpZXMpLFxuXHRcdFx0XHRcdGZvbGRlckNvdW50OiB3b3JraW5nRGlyZWN0b3JpZXM/Lmxlbmd0aCA/PyAwLFxuXHRcdFx0XHRcdC4uLihvdXRjb21lID09PSAnY29tcHV0ZWQnICYmIGZpbGVDb3VudCAhPT0gdW5kZWZpbmVkID8geyBmaWxlQ291bnQgfSA6IHt9KSxcblx0XHRcdFx0fSwgY2xpZW50Q29udGV4dCk7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHVuY29tbWl0dGVkVXJpO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBfY29tcHV0ZVVuY29tbWl0dGVkRGlmZnMoc2Vzc2lvbjogUHJvdG9jb2xVUkkpOiBQcm9taXNlPHJlYWRvbmx5IElTZXNzaW9uRmlsZURpZmZbXSB8IHVuZGVmaW5lZD4ge1xuXHRcdGNvbnN0IHdvcmtpbmdEaXJlY3RvcnkgPSB0aGlzLl9zdGF0ZU1hbmFnZXIuZ2V0U2Vzc2lvblN0YXRlKHNlc3Npb24pPy53b3JraW5nRGlyZWN0b3JpZXM/LlswXTtcblx0XHRpZiAoIXdvcmtpbmdEaXJlY3RvcnkpIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXG5cdFx0bGV0IHdvcmtpbmdEaXJlY3RvcnlVcmk6IFVSSTtcblx0XHR0cnkge1xuXHRcdFx0d29ya2luZ0RpcmVjdG9yeVVyaSA9IFVSSS5wYXJzZSh3b3JraW5nRGlyZWN0b3J5KTtcblx0XHR9IGNhdGNoIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHRoaXMuX2dpdFNlcnZpY2UuY29tcHV0ZVNlc3Npb25GaWxlRGlmZnMod29ya2luZ0RpcmVjdG9yeVVyaSwge1xuXHRcdFx0c2Vzc2lvblVyaTogc2Vzc2lvbixcblx0XHR9KTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgX2NvbXB1dGVUdXJuRGlmZnNQcmVmZXJDaGVja3BvaW50KHNlc3Npb246IFByb3RvY29sVVJJLCBkYjogSVNlc3Npb25EYXRhYmFzZSwgdHVybklkOiBzdHJpbmcpOiBQcm9taXNlPElUdXJuRGlmZlJlc3VsdD4ge1xuXHRcdGNvbnN0IHRyYWNrZWRTb3VyY2UgPSB0aGlzLl9vcGVuVHJhY2tlZFR1cm5Tb3VyY2Uoc2Vzc2lvbiwgZGIsIHR1cm5JZCk7XG5cdFx0Ly8gTXVsdGktZm9sZGVyIHNlc3Npb25zIGFnZ3JlZ2F0ZSBldmVyeSBmb2xkZXIncyBjaGFuZ2VzOyBzaW5nbGUtIGFuZFxuXHRcdC8vIHplcm8tZm9sZGVyIHNlc3Npb25zIGtlZXAgdGhlIGV4aXN0aW5nIHNpbmdsZS1yZXBvIGJlaGF2aW9yIGV4YWN0bHkuXG5cdFx0dHJ5IHtcblx0XHRcdGlmICghdHJhY2tlZFNvdXJjZS5zZXNzaW9uVXJpKSB7XG5cdFx0XHRcdHJldHVybiB7IGRpZmZzOiBbXSwgb3V0Y29tZTogJ2NvbXB1dGVkJyB9O1xuXHRcdFx0fVxuXHRcdFx0Y29uc3Qgd29ya2luZ0RpcmVjdG9yaWVzID0gdGhpcy5fY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0RWZmZWN0aXZlV29ya2luZ0RpcmVjdG9yaWVzKHNlc3Npb24pO1xuXHRcdFx0aWYgKGlzTXVsdGlSb290U2Vzc2lvbih3b3JraW5nRGlyZWN0b3JpZXMpKSB7XG5cdFx0XHRcdHJldHVybiB0aGlzLl9jb21wdXRlTXVsdGlGb2xkZXJUdXJuRGlmZnMoc2Vzc2lvbiwgdHJhY2tlZFNvdXJjZS5zZXNzaW9uVXJpLCB0cmFja2VkU291cmNlLmRiLCB0dXJuSWQsIHdvcmtpbmdEaXJlY3RvcmllcyEpO1xuXHRcdFx0fVxuXHRcdFx0Y29uc3QgZGlmZnMgPSBhd2FpdCB0aGlzLl9jb21wdXRlU2luZ2xlRm9sZGVyVHVybkRpZmZzKHNlc3Npb24sIHRyYWNrZWRTb3VyY2Uuc2Vzc2lvblVyaSwgdHJhY2tlZFNvdXJjZS5kYiwgdHVybklkKTtcblx0XHRcdHJldHVybiB7IGRpZmZzLCBvdXRjb21lOiAnY29tcHV0ZWQnIH07XG5cdFx0fSBmaW5hbGx5IHtcblx0XHRcdHRyYWNrZWRTb3VyY2UuZGlzcG9zZSgpO1xuXHRcdH1cblx0fVxuXG5cdC8qKlxuXHQgKiBUaGUgc2luZ2xlLWZvbGRlciBwZXItdHVybiBkaWZmOiBwcmVmZXIgdGhlIGNoZWNrcG9pbnQtcmVmIGdpdCBkaWZmIG9mIHRoZVxuXHQgKiBwcmltYXJ5IHdvcmtpbmcgZGlyZWN0b3J5LCBlbHNlIGZhbGwgYmFjayB0byB0aGUgU0RLLXRyYWNrZWQgYWdncmVnYXRvci5cblx0ICovXG5cdHByaXZhdGUgYXN5bmMgX2NvbXB1dGVTaW5nbGVGb2xkZXJUdXJuRGlmZnMoc2Vzc2lvbjogUHJvdG9jb2xVUkksIHRyYWNrZWRTZXNzaW9uOiBQcm90b2NvbFVSSSwgZGI6IElTZXNzaW9uRGF0YWJhc2UsIHR1cm5JZDogc3RyaW5nKTogUHJvbWlzZTxyZWFkb25seSBJU2Vzc2lvbkZpbGVEaWZmW10+IHtcblx0XHRjb25zdCBwYWlyID0gYXdhaXQgdGhpcy5fY2hlY2twb2ludFNlcnZpY2UuZ2V0VHVybkNoZWNrcG9pbnRQYWlyKFVSSS5wYXJzZShzZXNzaW9uKSwgdHVybklkKTtcblx0XHRpZiAocGFpciAmJiBwYWlyLnBhcmVudCAhPT0gcGFpci5jdXJyZW50KSB7XG5cdFx0XHRjb25zdCB3b3JraW5nRGlyID0gYXdhaXQgdGhpcy5fcmVzb2x2ZVdvcmtpbmdEaXJlY3Rvcnkoc2Vzc2lvbik7XG5cdFx0XHRpZiAod29ya2luZ0Rpcikge1xuXHRcdFx0XHRjb25zdCBmcm9tUmVmRGlmZnMgPSBhd2FpdCB0aGlzLl9naXRTZXJ2aWNlLmNvbXB1dGVGaWxlRGlmZnNCZXR3ZWVuUmVmcyh3b3JraW5nRGlyLCB7XG5cdFx0XHRcdFx0c2Vzc2lvblVyaTogc2Vzc2lvbixcblx0XHRcdFx0XHRmcm9tUmVmOiBwYWlyLnBhcmVudCxcblx0XHRcdFx0XHR0b1JlZjogcGFpci5jdXJyZW50LFxuXHRcdFx0XHR9KTtcblx0XHRcdFx0aWYgKGZyb21SZWZEaWZmcykge1xuXHRcdFx0XHRcdHJldHVybiBmcm9tUmVmRGlmZnM7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9IGVsc2UgaWYgKHBhaXIgJiYgcGFpci5wYXJlbnQgPT09IHBhaXIuY3VycmVudCkge1xuXHRcdFx0Ly8gQSBuby1vcCB0dXJuIGNoZWNrcG9pbnQgcmV1c2VzIHRoZSBwYXJlbnQgcmVmIChzbyBwZXItdHVyblxuXHRcdFx0Ly8gZGlmZiBpcyBlbXB0eSBieSBjb25zdHJ1Y3Rpb24pIFx1MjAxNCBzaG9ydC1jaXJjdWl0IHRvIGFuIGVtcHR5XG5cdFx0XHQvLyBsaXN0IGluc3RlYWQgb2YgYXNraW5nIGdpdCBmb3IgdGhlIChlbXB0eSkgZGlmZi5cblx0XHRcdHJldHVybiBbXTtcblx0XHR9XG5cdFx0Ly8gRmFsbGJhY2s6IFNESy10cmFja2VkIGZpbGVfZWRpdHMgYWdncmVnYXRvci5cblx0XHRyZXR1cm4gY29tcHV0ZVR1cm5EaWZmcyh0cmFja2VkU2Vzc2lvbiwgZGIsIHRoaXMuX2RpZmZDb21wdXRlU2VydmljZSwgdHVybklkKTtcblx0fVxuXG5cdHByaXZhdGUgX29wZW5UcmFja2VkVHVyblNvdXJjZShzZXNzaW9uOiBQcm90b2NvbFVSSSwgZGVmYXVsdERhdGFiYXNlOiBJU2Vzc2lvbkRhdGFiYXNlLCB0dXJuSWQ6IHN0cmluZyk6IHsgcmVhZG9ubHkgc2Vzc2lvblVyaTogUHJvdG9jb2xVUkkgfCB1bmRlZmluZWQ7IHJlYWRvbmx5IGRiOiBJU2Vzc2lvbkRhdGFiYXNlOyBkaXNwb3NlKCk6IHZvaWQgfSB7XG5cdFx0Y29uc3Qgc2Vzc2lvblN0YXRlID0gdGhpcy5fc3RhdGVNYW5hZ2VyLmdldFNlc3Npb25TdGF0ZShzZXNzaW9uKTtcblx0XHRpZiAoIXNlc3Npb25TdGF0ZSkge1xuXHRcdFx0cmV0dXJuIHsgc2Vzc2lvblVyaTogc2Vzc2lvbiwgZGI6IGRlZmF1bHREYXRhYmFzZSwgZGlzcG9zZTogKCkgPT4geyB9IH07XG5cdFx0fVxuXG5cdFx0Y29uc3Qgb3duaW5nUmVzb3VyY2VzOiBQcm90b2NvbFVSSVtdID0gW107XG5cdFx0aWYgKHNlc3Npb25TdGF0ZS5hY3RpdmVUdXJuPy5pZCA9PT0gdHVybklkIHx8IChzZXNzaW9uU3RhdGUudHVybnMgPz8gW10pLnNvbWUodHVybiA9PiB0dXJuLmlkID09PSB0dXJuSWQpKSB7XG5cdFx0XHRvd25pbmdSZXNvdXJjZXMucHVzaChzZXNzaW9uKTtcblx0XHR9XG5cdFx0Zm9yIChjb25zdCBjaGF0IG9mIHNlc3Npb25TdGF0ZS5jaGF0cyA/PyBbXSkge1xuXHRcdFx0aWYgKGlzRGVmYXVsdENoYXRVcmkoY2hhdC5yZXNvdXJjZSkpIHtcblx0XHRcdFx0Y29udGludWU7XG5cdFx0XHR9XG5cdFx0XHRjb25zdCBjaGF0U3RhdGUgPSB0aGlzLl9zdGF0ZU1hbmFnZXIuZ2V0Q2hhdFN0YXRlKGNoYXQucmVzb3VyY2UpO1xuXHRcdFx0aWYgKGNoYXRTdGF0ZT8uYWN0aXZlVHVybj8uaWQgPT09IHR1cm5JZCB8fCBjaGF0U3RhdGU/LnR1cm5zLnNvbWUodHVybiA9PiB0dXJuLmlkID09PSB0dXJuSWQpKSB7XG5cdFx0XHRcdG93bmluZ1Jlc291cmNlcy5wdXNoKGNoYXQucmVzb3VyY2UpO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdGlmIChvd25pbmdSZXNvdXJjZXMubGVuZ3RoID4gMSkge1xuXHRcdFx0dGhpcy5fbG9nU2VydmljZS53YXJuKGBbQWdlbnRIb3N0Q2hhbmdlc2V0U2VydmljZV0gVHVybiBpZCAke3R1cm5JZH0gaXMgc2hhcmVkIGJ5IG11bHRpcGxlIGNoYXRzIGluICR7c2Vzc2lvbn07IHNraXBwaW5nIGFtYmlndW91cyB0cmFja2VkLWZpbGUgZmFsbGJhY2tgKTtcblx0XHRcdHJldHVybiB7IHNlc3Npb25Vcmk6IHVuZGVmaW5lZCwgZGI6IGRlZmF1bHREYXRhYmFzZSwgZGlzcG9zZTogKCkgPT4geyB9IH07XG5cdFx0fVxuXHRcdGlmIChvd25pbmdSZXNvdXJjZXMubGVuZ3RoID09PSAwIHx8IG93bmluZ1Jlc291cmNlc1swXSA9PT0gc2Vzc2lvbikge1xuXHRcdFx0cmV0dXJuIHsgc2Vzc2lvblVyaTogc2Vzc2lvbiwgZGI6IGRlZmF1bHREYXRhYmFzZSwgZGlzcG9zZTogKCkgPT4geyB9IH07XG5cdFx0fVxuXG5cdFx0Y29uc3QgY2hhdCA9IG93bmluZ1Jlc291cmNlc1swXTtcblx0XHRjb25zdCBjaGF0RGF0YWJhc2UgPSB0aGlzLl9zZXNzaW9uRGF0YVNlcnZpY2Uub3BlbkRhdGFiYXNlKFVSSS5wYXJzZShjaGF0KSk7XG5cdFx0cmV0dXJuIHsgc2Vzc2lvblVyaTogY2hhdCwgZGI6IGNoYXREYXRhYmFzZS5vYmplY3QsIGRpc3Bvc2U6ICgpID0+IGNoYXREYXRhYmFzZS5kaXNwb3NlKCkgfTtcblx0fVxuXG5cdC8qKlxuXHQgKiBUaGUgbXVsdGktZm9sZGVyIHBlci10dXJuIGRpZmY6IGRpZmYgZWFjaCB1bmlxdWUgZ2l0IHJlcG9zaXRvcnkgb25jZSAoaW5cblx0ICogcGFyYWxsZWwpIGZyb20gaXRzIGNoZWNrcG9pbnQgcGFpciBhbmQgYWRkIHRoZSB0cmFja2VkIGVkaXRzIHNjb3BlZCB0b1xuXHQgKiB0aGUgbm9uLWdpdCBmb2xkZXJzLiBQZXItZm9sZGVyIGZhaWx1cmVzIGFyZSBsb2dnZWQgYW5kIHNraXBwZWQgc28gb25lXG5cdCAqIGZvbGRlciBuZXZlciBmYWlscyB0aGUgd2hvbGUgdHVybiBjaGFuZ2VzZXQuXG5cdCAqL1xuXHRwcml2YXRlIGFzeW5jIF9jb21wdXRlTXVsdGlGb2xkZXJUdXJuRGlmZnMoc2Vzc2lvbjogUHJvdG9jb2xVUkksIHRyYWNrZWRTZXNzaW9uOiBQcm90b2NvbFVSSSwgZGI6IElTZXNzaW9uRGF0YWJhc2UsIHR1cm5JZDogc3RyaW5nLCB3b3JraW5nRGlyZWN0b3JpZXM6IHJlYWRvbmx5IHN0cmluZ1tdKTogUHJvbWlzZTxJVHVybkRpZmZSZXN1bHQ+IHtcblx0XHRjb25zdCBzZXNzaW9uVXJpID0gVVJJLnBhcnNlKHNlc3Npb24pO1xuXHRcdGNvbnN0IHdvcmtpbmdEaXJlY3RvcnlVcmlzID0gdGhpcy5fcGFyc2VXb3JraW5nRGlyZWN0b3J5VXJpcyhzZXNzaW9uLCB3b3JraW5nRGlyZWN0b3JpZXMpO1xuXG5cdFx0bGV0IGdpdFJlcG9zaXRvcmllczogcmVhZG9ubHkgVVJJW107XG5cdFx0bGV0IG5vbkdpdERpcmVjdG9yaWVzOiByZWFkb25seSBVUklbXTtcblx0XHR0cnkge1xuXHRcdFx0Ly8gSXNvbGF0ZSBwZXItcm9vdCBmYWlsdXJlczogYSBkaXJlY3Rvcnkgd2hvc2UgcmVwb3NpdG9yeS1yb290XG5cdFx0XHQvLyBsb29rdXAgZmFpbHMgaXMgdHJlYXRlZCBhcyBhIG5vbi1naXQgZm9sZGVyIGFuZCByb3V0ZWQgdGhyb3VnaCB0aGVcblx0XHRcdC8vIERCLXRyYWNrZWQgZmFsbGJhY2sgYmVsb3csIHNvIG9uZSByZXBvJ3MgZ2l0IGZhaWx1cmUgbmV2ZXIgZHJvcHNcblx0XHRcdC8vIHRoZSB3aG9sZSB0dXJuIGNoYW5nZXNldC5cblx0XHRcdCh7IGdpdFJlcG9zaXRvcmllcywgbm9uR2l0RGlyZWN0b3JpZXMgfSA9IGF3YWl0IHJlc29sdmVTZXNzaW9uUmVwb3NpdG9yaWVzKHdvcmtpbmdEaXJlY3RvcnlVcmlzLCB0aGlzLl9naXRTZXJ2aWNlLCAoZGlyZWN0b3J5LCBlcnIpID0+IHtcblx0XHRcdFx0dGhpcy5fbG9nU2VydmljZS5lcnJvcihgW0FnZW50SG9zdENoYW5nZXNldFNlcnZpY2VdIEZhaWxlZCB0byByZXNvbHZlIHJlcG9zaXRvcnkgcm9vdCBmb3IgJHtkaXJlY3RvcnkudG9TdHJpbmcoKX0gaW4gbXVsdGktZm9sZGVyIHR1cm4gJHtzZXNzaW9ufS8ke3R1cm5JZH07IHRyZWF0aW5nIGl0IGFzIGEgbm9uLWdpdCBmb2xkZXIuYCwgZXJyKTtcblx0XHRcdH0pKTtcblx0XHR9IGNhdGNoIChlcnIpIHtcblx0XHRcdHRoaXMuX2xvZ1NlcnZpY2UuZXJyb3IoYFtBZ2VudEhvc3RDaGFuZ2VzZXRTZXJ2aWNlXSBGYWlsZWQgdG8gcmVzb2x2ZSByZXBvc2l0b3JpZXMgZm9yIG11bHRpLWZvbGRlciB0dXJuICR7c2Vzc2lvbn0vJHt0dXJuSWR9YCwgZXJyKTtcblx0XHRcdHJldHVybiB7IGRpZmZzOiBbXSwgb3V0Y29tZTogJ3Jlc29sdmVGYWlsZWQnIH07XG5cdFx0fVxuXG5cdFx0Ly8gRGlmZiBldmVyeSByZXNvbHZlZCByZXBvc2l0b3J5LCBidXQgYm91bmQgaG93IG1hbnkgcGVyLXJlcG8gZ2l0IGRpZmZzXG5cdFx0Ly8gcnVuIGF0IG9uY2Ugc28gYSBtYW55LXJlcG9zaXRvcnkgc2Vzc2lvbiBjYW5ub3Qgc3Bhd24gYW4gdW5ib3VuZGVkXG5cdFx0Ly8gbnVtYmVyIG9mIGdpdCBwcm9jZXNzZXMgKHNlZSBNQVhfVFVSTl9ESUZGX1JFUE9TSVRPUllfQ09OQ1VSUkVOQ1kpLlxuXHRcdGNvbnN0IGxpbWl0ZXIgPSBuZXcgTGltaXRlcjx7IHJlYWRvbmx5IGRpZmZzOiByZWFkb25seSBJU2Vzc2lvbkZpbGVEaWZmW107IHJlYWRvbmx5IHVzZWRGYWxsYmFjazogYm9vbGVhbiB9PihNQVhfVFVSTl9ESUZGX1JFUE9TSVRPUllfQ09OQ1VSUkVOQ1kpO1xuXHRcdGNvbnN0IFtwZXJSZXBvRGlmZnMsIG5vbkdpdERpZmZzXSA9IGF3YWl0IFByb21pc2UuYWxsKFtcblx0XHRcdFByb21pc2UuYWxsKGdpdFJlcG9zaXRvcmllcy5tYXAocmVwb1Jvb3QgPT4gbGltaXRlci5xdWV1ZSgoKSA9PiB0aGlzLl9jb21wdXRlUmVwb1R1cm5EaWZmcyhzZXNzaW9uLCB0cmFja2VkU2Vzc2lvbiwgc2Vzc2lvblVyaSwgZGIsIHR1cm5JZCwgcmVwb1Jvb3QpKSkpLFxuXHRcdFx0dGhpcy5fY29tcHV0ZU5vbkdpdFR1cm5EaWZmc0Zyb21UcmFja2VkRWRpdHMoc2Vzc2lvbiwgdHJhY2tlZFNlc3Npb24sIGRiLCB0dXJuSWQsIG5vbkdpdERpcmVjdG9yaWVzKSxcblx0XHRdKS5maW5hbGx5KCgpID0+IGxpbWl0ZXIuZGlzcG9zZSgpKTtcblxuXHRcdC8vIE1lcmdlIGV2ZXJ5IHNvdXJjZSwga2VlcGluZyB0aGUgZmlyc3Qgb2NjdXJyZW5jZSBvZiBlYWNoIGZpbGUuIFRoZSBnaXRcblx0XHQvLyBzb3VyY2VzIGFyZSBwYXNzZWQgYWhlYWQgb2YgdGhlIG5vbi1naXQgc291cmNlIHNvIGEgZ2l0IGRpZmYgd2lucyBvdmVyXG5cdFx0Ly8gYSBEQi10cmFja2VkIGVkaXQgZm9yIHRoZSBzYW1lIGZpbGUsIGFuZCBmaWxlcyBhcmUgY29tcGFyZWQgd2l0aCB0aGVcblx0XHQvLyBhZ2VudCBob3N0J3MgcGF0aC1jYXNlIGJpYXMgKHNlZSBgZGVkdXBlU2Vzc2lvbkZpbGVEaWZmc2ApLlxuXHRcdGNvbnN0IGRpZmZzID0gZGVkdXBlU2Vzc2lvbkZpbGVEaWZmcyhbLi4ucGVyUmVwb0RpZmZzLm1hcChyID0+IHIuZGlmZnMpLCBub25HaXREaWZmc10pO1xuXHRcdHJldHVybiB7XG5cdFx0XHRkaWZmcyxcblx0XHRcdG91dGNvbWU6ICdjb21wdXRlZCcsXG5cdFx0XHRtdWx0aVJvb3Q6IHtcblx0XHRcdFx0dW5pcXVlR2l0Rm9sZGVyQ291bnQ6IGdpdFJlcG9zaXRvcmllcy5sZW5ndGgsXG5cdFx0XHRcdG5vbkdpdEZvbGRlckNvdW50OiBub25HaXREaXJlY3Rvcmllcy5sZW5ndGgsXG5cdFx0XHRcdHRyYWNrZWRFZGl0RmFsbGJhY2tGb2xkZXJDb3VudDogcGVyUmVwb0RpZmZzLmZpbHRlcihyID0+IHIudXNlZEZhbGxiYWNrKS5sZW5ndGgsXG5cdFx0XHR9LFxuXHRcdH07XG5cdH1cblxuXHQvKipcblx0ICogQ29tcHV0ZXMgb25lIGdpdCByZXBvc2l0b3J5J3MgcGVyLXR1cm4gZGlmZiBmcm9tIGl0cyBjaGVja3BvaW50IHBhaXIuXG5cdCAqIFdoZW4gdGhlIGdpdCBkaWZmIGlzIHVuYXZhaWxhYmxlIChtaXNzaW5nIGNoZWNrcG9pbnQgcGFpciwgYHVuZGVmaW5lZGBcblx0ICogZGlmZiwgb3IgYW4gZXJyb3IpLCB0aGF0IHJlcG9zaXRvcnkgZmFsbHMgYmFjayB0byBpdHMgdHJhY2tlZCBlZGl0cyBzb1xuXHQgKiBvbmUgcmVwbydzIGdpdCBmYWlsdXJlIG5ldmVyIGRyb3BzIHRoZSBmb2xkZXIgXHUyMDE0IG1pcnJvcmluZyB0aGVcblx0ICogc2luZ2xlLWZvbGRlciBwYXRoJ3MgZWRpdC10cmFja2VyIGZhbGxiYWNrLiBgdXNlZEZhbGxiYWNrYCByZXBvcnRzIHdoZXRoZXJcblx0ICogdGhhdCBmYWxsYmFjayB3YXMgdGFrZW4uIEV2ZXJ5IGdpdCBmYWlsdXJlIGlzIGxvZ2dlZCBhcyBhbiBlcnJvci5cblx0ICovXG5cdHByaXZhdGUgYXN5bmMgX2NvbXB1dGVSZXBvVHVybkRpZmZzKHNlc3Npb246IFByb3RvY29sVVJJLCB0cmFja2VkU2Vzc2lvbjogUHJvdG9jb2xVUkksIHNlc3Npb25Vcmk6IFVSSSwgZGI6IElTZXNzaW9uRGF0YWJhc2UsIHR1cm5JZDogc3RyaW5nLCByZXBvUm9vdDogVVJJKTogUHJvbWlzZTx7IHJlYWRvbmx5IGRpZmZzOiByZWFkb25seSBJU2Vzc2lvbkZpbGVEaWZmW107IHJlYWRvbmx5IHVzZWRGYWxsYmFjazogYm9vbGVhbiB9PiB7XG5cdFx0dHJ5IHtcblx0XHRcdGNvbnN0IHBhaXIgPSBhd2FpdCB0aGlzLl9jaGVja3BvaW50U2VydmljZS5nZXRUdXJuQ2hlY2twb2ludFBhaXIoc2Vzc2lvblVyaSwgdHVybklkLCByZXBvUm9vdCk7XG5cdFx0XHRpZiAoIXBhaXIpIHtcblx0XHRcdFx0dGhpcy5fbG9nU2VydmljZS5lcnJvcihgW0FnZW50SG9zdENoYW5nZXNldFNlcnZpY2VdIE5vIGNoZWNrcG9pbnQgcGFpciBmb3IgbXVsdGktZm9sZGVyIHR1cm4gJHtzZXNzaW9ufS8ke3R1cm5JZH0gaW4gcmVwb3NpdG9yeSAke3JlcG9Sb290LnRvU3RyaW5nKCl9OyBmYWxsaW5nIGJhY2sgdG8gdHJhY2tlZCBlZGl0cyBmb3IgdGhhdCByZXBvc2l0b3J5LmApO1xuXHRcdFx0XHRyZXR1cm4geyBkaWZmczogYXdhaXQgdGhpcy5fY29tcHV0ZVJlcG9UdXJuRGlmZnNGcm9tVHJhY2tlZEVkaXRzKHNlc3Npb24sIHRyYWNrZWRTZXNzaW9uLCBkYiwgdHVybklkLCByZXBvUm9vdCksIHVzZWRGYWxsYmFjazogdHJ1ZSB9O1xuXHRcdFx0fVxuXHRcdFx0aWYgKHBhaXIucGFyZW50ID09PSBwYWlyLmN1cnJlbnQpIHtcblx0XHRcdFx0Ly8gQSBuby1vcCB0dXJuIGNoZWNrcG9pbnQgcmV1c2VzIHRoZSBwYXJlbnQgcmVmIFx1MjAxNCB0aGUgZGlmZiBpc1xuXHRcdFx0XHQvLyBlbXB0eSBieSBjb25zdHJ1Y3Rpb24sIHNvIHNraXAgdGhlIChlbXB0eSkgZ2l0IGNhbGwuIFRoaXMgaXNcblx0XHRcdFx0Ly8gYSBsZWdpdGltYXRlIGVtcHR5IHJlc3VsdCwgbm90IGEgZmFpbHVyZSwgc28gbm8gdHJhY2tlZC1lZGl0IGZhbGxiYWNrLlxuXHRcdFx0XHRyZXR1cm4geyBkaWZmczogW10sIHVzZWRGYWxsYmFjazogZmFsc2UgfTtcblx0XHRcdH1cblx0XHRcdGNvbnN0IGRpZmZzID0gYXdhaXQgdGhpcy5fZ2l0U2VydmljZS5jb21wdXRlRmlsZURpZmZzQmV0d2VlblJlZnMocmVwb1Jvb3QsIHtcblx0XHRcdFx0c2Vzc2lvblVyaTogc2Vzc2lvbixcblx0XHRcdFx0ZnJvbVJlZjogcGFpci5wYXJlbnQsXG5cdFx0XHRcdHRvUmVmOiBwYWlyLmN1cnJlbnQsXG5cdFx0XHR9KTtcblx0XHRcdGlmICghZGlmZnMpIHtcblx0XHRcdFx0dGhpcy5fbG9nU2VydmljZS5lcnJvcihgW0FnZW50SG9zdENoYW5nZXNldFNlcnZpY2VdIEdpdCB0dXJuIGRpZmYgdW5hdmFpbGFibGUgZm9yIG11bHRpLWZvbGRlciB0dXJuICR7c2Vzc2lvbn0vJHt0dXJuSWR9IGluIHJlcG9zaXRvcnkgJHtyZXBvUm9vdC50b1N0cmluZygpfTsgZmFsbGluZyBiYWNrIHRvIHRyYWNrZWQgZWRpdHMgZm9yIHRoYXQgcmVwb3NpdG9yeS5gKTtcblx0XHRcdFx0cmV0dXJuIHsgZGlmZnM6IGF3YWl0IHRoaXMuX2NvbXB1dGVSZXBvVHVybkRpZmZzRnJvbVRyYWNrZWRFZGl0cyhzZXNzaW9uLCB0cmFja2VkU2Vzc2lvbiwgZGIsIHR1cm5JZCwgcmVwb1Jvb3QpLCB1c2VkRmFsbGJhY2s6IHRydWUgfTtcblx0XHRcdH1cblx0XHRcdHJldHVybiB7IGRpZmZzLCB1c2VkRmFsbGJhY2s6IGZhbHNlIH07XG5cdFx0fSBjYXRjaCAoZXJyKSB7XG5cdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLmVycm9yKGBbQWdlbnRIb3N0Q2hhbmdlc2V0U2VydmljZV0gRmFpbGVkIHRvIGNvbXB1dGUgZ2l0IHR1cm4gZGlmZiBmb3IgbXVsdGktZm9sZGVyIHR1cm4gJHtzZXNzaW9ufS8ke3R1cm5JZH0gaW4gcmVwb3NpdG9yeSAke3JlcG9Sb290LnRvU3RyaW5nKCl9OyBmYWxsaW5nIGJhY2sgdG8gdHJhY2tlZCBlZGl0cyBmb3IgdGhhdCByZXBvc2l0b3J5LmAsIGVycik7XG5cdFx0XHRyZXR1cm4geyBkaWZmczogYXdhaXQgdGhpcy5fY29tcHV0ZVJlcG9UdXJuRGlmZnNGcm9tVHJhY2tlZEVkaXRzKHNlc3Npb24sIHRyYWNrZWRTZXNzaW9uLCBkYiwgdHVybklkLCByZXBvUm9vdCksIHVzZWRGYWxsYmFjazogdHJ1ZSB9O1xuXHRcdH1cblx0fVxuXG5cdC8qKlxuXHQgKiBDb21wdXRlcyBvbmUgZ2l0IHJlcG9zaXRvcnkncyBwZXItdHVybiBkaWZmIGZyb20gdGhlICoqZWRpdCB0cmFja2VyJ3Ncblx0ICogcmVjb3JkZWQgZmlsZSBlZGl0cyoqICh0aGUgc2Vzc2lvbiBEQiBgZmlsZV9lZGl0c2AgdGFibGUgd3JpdHRlbiBieVxuXHQgKiBgRmlsZUVkaXRUcmFja2VyYCksIHNjb3BlZCB0byB0aGF0IHJlcG8gcm9vdCBcdTIwMTQgTk9UIGZyb20gZ2l0LlxuXHQgKlxuXHQgKiBVc2VkIGFzIHRoZSBwZXItcmVwbyBmYWxsYmFjayB3aGVuIHRoZSByZXBvc2l0b3J5J3MgZ2l0IHR1cm4gZGlmZiBpc1xuXHQgKiB1bmF2YWlsYWJsZSAobWlzc2luZyBjaGVja3BvaW50IHBhaXIsIGB1bmRlZmluZWRgIGRpZmYsIG9yIGFuIGVycm9yKS5cblx0ICogVW5saWtlIHRoZSBnaXQgcGF0aCwgdGhpcyBvbmx5IHNlZXMgY2hhbmdlcyB0aGUgYWdlbnQgbWFkZSB0aHJvdWdoIHRyYWNrZWRcblx0ICogZWRpdHMuIFNjb3BpbmcgdG8gdGhlIHJlcG8gcm9vdCBrZWVwcyB0aGUgZ2l0L25vbi1naXQgcGFydGl0aW9uIGludGFjdC5cblx0ICogTG9ncyBhbmQgcmV0dXJucyBhbiBlbXB0eSBsaXN0IGlmIHRoZSBmYWxsYmFjayBpdHNlbGYgZmFpbHMsIHNvIHRoZSBmb2xkZXJcblx0ICogY29udHJpYnV0ZXMgbm90aGluZyByYXRoZXIgdGhhbiBmYWlsaW5nIHRoZSB3aG9sZSB0dXJuLlxuXHQgKi9cblx0cHJpdmF0ZSBhc3luYyBfY29tcHV0ZVJlcG9UdXJuRGlmZnNGcm9tVHJhY2tlZEVkaXRzKHNlc3Npb246IFByb3RvY29sVVJJLCB0cmFja2VkU2Vzc2lvbjogUHJvdG9jb2xVUkksIGRiOiBJU2Vzc2lvbkRhdGFiYXNlLCB0dXJuSWQ6IHN0cmluZywgcmVwb1Jvb3Q6IFVSSSk6IFByb21pc2U8cmVhZG9ubHkgSVNlc3Npb25GaWxlRGlmZltdPiB7XG5cdFx0dHJ5IHtcblx0XHRcdHJldHVybiBhd2FpdCBjb21wdXRlVHVybkRpZmZzKHRyYWNrZWRTZXNzaW9uLCBkYiwgdGhpcy5fZGlmZkNvbXB1dGVTZXJ2aWNlLCB0dXJuSWQsIFtyZXBvUm9vdF0pO1xuXHRcdH0gY2F0Y2ggKGVycikge1xuXHRcdFx0dGhpcy5fbG9nU2VydmljZS5lcnJvcihgW0FnZW50SG9zdENoYW5nZXNldFNlcnZpY2VdIFRyYWNrZWQtZWRpdCBmYWxsYmFjayB0dXJuIGRpZmYgZmFpbGVkIGZvciBtdWx0aS1mb2xkZXIgdHVybiAke3Nlc3Npb259LyR7dHVybklkfSBpbiByZXBvc2l0b3J5ICR7cmVwb1Jvb3QudG9TdHJpbmcoKX1gLCBlcnIpO1xuXHRcdFx0cmV0dXJuIFtdO1xuXHRcdH1cblx0fVxuXG5cdC8qKlxuXHQgKiBDb21wdXRlcyB0aGUgc2Vzc2lvbidzIG5vbi1naXQgZm9sZGVycycgcGVyLXR1cm4gZGlmZiBmcm9tIHRoZSAqKmVkaXRcblx0ICogdHJhY2tlcidzIHJlY29yZGVkIGZpbGUgZWRpdHMqKiAodGhlIHNlc3Npb24gREIgYGZpbGVfZWRpdHNgIHRhYmxlIHdyaXR0ZW5cblx0ICogYnkgYEZpbGVFZGl0VHJhY2tlcmApLCBzY29wZWQgdG8gdGhvc2UgZm9sZGVyIHJvb3RzLiBOb24tZ2l0IGZvbGRlcnMgaGF2ZVxuXHQgKiBubyBnaXQgdG8gZGlmZiwgc28gdHJhY2tlZCBlZGl0cyBhcmUgdGhlaXIgb25seSBzb3VyY2UgKG5vdCBhIGZhbGxiYWNrKS5cblx0ICpcblx0ICogU2NvcGluZyB0byB0aGUgbm9uLWdpdCByb290cyBrZWVwcyB0aGUgZ2l0L25vbi1naXQgcGFydGl0aW9uIGludGFjdCwgc29cblx0ICogZ2l0LWZvbGRlciBlZGl0cyAoYWxyZWFkeSBjb3ZlcmVkIGJ5IHRoZWlyIGdpdCBkaWZmKSBhcmUgbm90XG5cdCAqIGRvdWJsZS1jb3VudGVkLiBSZXR1cm5zIGFuIGVtcHR5IGxpc3Qgd2hlbiB0aGVyZSBhcmUgbm8gbm9uLWdpdCBmb2xkZXJzLFxuXHQgKiBhbmQgbG9ncyBhbmQgcmV0dXJucyBhbiBlbXB0eSBsaXN0IG9uIGZhaWx1cmUsIHNvIHRoaXMgbmV2ZXIgZmFpbHMgdGhlXG5cdCAqIHdob2xlIHR1cm4uXG5cdCAqL1xuXHRwcml2YXRlIGFzeW5jIF9jb21wdXRlTm9uR2l0VHVybkRpZmZzRnJvbVRyYWNrZWRFZGl0cyhzZXNzaW9uOiBQcm90b2NvbFVSSSwgdHJhY2tlZFNlc3Npb246IFByb3RvY29sVVJJLCBkYjogSVNlc3Npb25EYXRhYmFzZSwgdHVybklkOiBzdHJpbmcsIG5vbkdpdERpcmVjdG9yaWVzOiByZWFkb25seSBVUklbXSk6IFByb21pc2U8cmVhZG9ubHkgSVNlc3Npb25GaWxlRGlmZltdPiB7XG5cdFx0aWYgKG5vbkdpdERpcmVjdG9yaWVzLmxlbmd0aCA9PT0gMCkge1xuXHRcdFx0cmV0dXJuIFtdO1xuXHRcdH1cblx0XHR0cnkge1xuXHRcdFx0cmV0dXJuIGF3YWl0IGNvbXB1dGVUdXJuRGlmZnModHJhY2tlZFNlc3Npb24sIGRiLCB0aGlzLl9kaWZmQ29tcHV0ZVNlcnZpY2UsIHR1cm5JZCwgbm9uR2l0RGlyZWN0b3JpZXMpO1xuXHRcdH0gY2F0Y2ggKGVycikge1xuXHRcdFx0dGhpcy5fbG9nU2VydmljZS5lcnJvcihgW0FnZW50SG9zdENoYW5nZXNldFNlcnZpY2VdIEZhaWxlZCB0byBjb21wdXRlIG5vbi1naXQgdHJhY2tlZC1lZGl0IHR1cm4gZGlmZiBmb3IgbXVsdGktZm9sZGVyIHR1cm4gJHtzZXNzaW9ufS8ke3R1cm5JZH1gLCBlcnIpO1xuXHRcdFx0cmV0dXJuIFtdO1xuXHRcdH1cblx0fVxuXG5cdC8qKlxuXHQgKiBQYXJzZXMgYSBzZXNzaW9uJ3Mgd29ya2luZy1kaXJlY3Rvcnkgc3RyaW5ncyBpbnRvIFVSSXMsIGxvZ2dpbmcgYW5kXG5cdCAqIHNraXBwaW5nIGFueSB0aGF0IGZhaWwgdG8gcGFyc2Ugc28gYSBtYWxmb3JtZWQgZW50cnkgbmV2ZXIgZmFpbHMgdGhlIHR1cm4uXG5cdCAqL1xuXHRwcml2YXRlIF9wYXJzZVdvcmtpbmdEaXJlY3RvcnlVcmlzKHNlc3Npb246IFByb3RvY29sVVJJLCB3b3JraW5nRGlyZWN0b3JpZXM6IHJlYWRvbmx5IHN0cmluZ1tdKTogVVJJW10ge1xuXHRcdGNvbnN0IHVyaXM6IFVSSVtdID0gW107XG5cdFx0Zm9yIChjb25zdCB3b3JraW5nRGlyZWN0b3J5IG9mIHdvcmtpbmdEaXJlY3Rvcmllcykge1xuXHRcdFx0dHJ5IHtcblx0XHRcdFx0dXJpcy5wdXNoKFVSSS5wYXJzZSh3b3JraW5nRGlyZWN0b3J5KSk7XG5cdFx0XHR9IGNhdGNoIChlcnIpIHtcblx0XHRcdFx0dGhpcy5fbG9nU2VydmljZS53YXJuKGBbQWdlbnRIb3N0Q2hhbmdlc2V0U2VydmljZV0gU2tpcHBpbmcgdW5wYXJzZWFibGUgd29ya2luZyBkaXJlY3RvcnkgJyR7d29ya2luZ0RpcmVjdG9yeX0nIGZvciBzZXNzaW9uICR7c2Vzc2lvbn1gLCBlcnIpO1xuXHRcdFx0fVxuXHRcdH1cblx0XHRyZXR1cm4gdXJpcztcblx0fVxuXG5cdC8qKlxuXHQgKiBSZWNvbXB1dGVzIGFuZCBwdWJsaXNoZXMgdGhlIGFsbC1mb2xkZXIgYHN1bW1hcnkuY2hhbmdlc2AgY2hpcCBmb3IgYVxuXHQgKiBtdWx0aS1mb2xkZXIgc2Vzc2lvbiwgd3JpdGluZyBib3RoIGBNRVRBX0NIQU5HRVNfU1VNTUFSWWAgYW5kIHRoZSBpbi1tZW1vcnlcblx0ICogc3VtbWFyeS4gU3VtcyBldmVyeSBnaXQgcmVwbydzIGJyYW5jaCBkZWx0YSBwbHVzIHRoZSBub24tZ2l0IGZvbGRlcnMnIGVkaXRzXG5cdCAqIHJlY29yZGVkIGJ5IHRoZSBlZGl0IHRyYWNrZXIgKGBGaWxlRWRpdFRyYWNrZXJgKS4gUGVyLXJlcG8gZmFpbHVyZXMgYXJlXG5cdCAqIHNraXBwZWQgYW5kIHRoZSBmYW4tb3V0IHJ1bnMgYXQgYm91bmRlZCBjb25jdXJyZW5jeTsgaWYgYWxsIHNvdXJjZXMgZmFpbFxuXHQgKiB0aGUgY2FjaGVkIHN1bW1hcnkgaXMgcHJlc2VydmVkIGluc3RlYWQgb2Ygd3JpdGluZyB6ZXJvLlxuXHQgKi9cblx0cHJpdmF0ZSBhc3luYyBfdXBkYXRlTXVsdGlGb2xkZXJDaGFuZ2VzU3VtbWFyeShzZXNzaW9uOiBQcm90b2NvbFVSSSwgZGI6IElTZXNzaW9uRGF0YWJhc2UsIHdvcmtpbmdEaXJlY3RvcmllczogcmVhZG9ubHkgc3RyaW5nW10sIHByaW1hcnlCcmFuY2hEaWZmcz86IHJlYWRvbmx5IElTZXNzaW9uRmlsZURpZmZbXSk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGNvbnN0IHdvcmtpbmdEaXJlY3RvcnlVcmlzID0gdGhpcy5fcGFyc2VXb3JraW5nRGlyZWN0b3J5VXJpcyhzZXNzaW9uLCB3b3JraW5nRGlyZWN0b3JpZXMpO1xuXG5cdFx0bGV0IGdpdFJlcG9zaXRvcmllczogcmVhZG9ubHkgVVJJW107XG5cdFx0bGV0IG5vbkdpdERpcmVjdG9yaWVzOiByZWFkb25seSBVUklbXTtcblx0XHR0cnkge1xuXHRcdFx0KHsgZ2l0UmVwb3NpdG9yaWVzLCBub25HaXREaXJlY3RvcmllcyB9ID0gYXdhaXQgcmVzb2x2ZVNlc3Npb25SZXBvc2l0b3JpZXMod29ya2luZ0RpcmVjdG9yeVVyaXMsIHRoaXMuX2dpdFNlcnZpY2UpKTtcblx0XHR9IGNhdGNoIChlcnIpIHtcblx0XHRcdHRoaXMuX2xvZ1NlcnZpY2UuZXJyb3IoYFtBZ2VudEhvc3RDaGFuZ2VzZXRTZXJ2aWNlXSBGYWlsZWQgdG8gcmVzb2x2ZSByZXBvc2l0b3JpZXMgZm9yIG11bHRpLWZvbGRlciBicmFuY2ggc3VtbWFyeSAke3Nlc3Npb259YCwgZXJyKTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHQvLyBUaGUgcHJpbWFyeSByZXBvIHJldXNlcyB0aGUgc2Vzc2lvbidzIGNvbmZpZ3VyZWQgYmFzZSBicmFuY2ggc28gaXRzXG5cdFx0Ly8gY29udHJpYnV0aW9uIG1hdGNoZXMgdGhlIHByaW1hcnkgQnJhbmNoIENoYW5nZXMgdmlldzsgc2Vjb25kYXJ5IHJlcG9zXG5cdFx0Ly8gaGF2ZSBubyBzZXNzaW9uLWxldmVsIGJhc2UgY29uZmlndXJlZCwgc28gZWFjaCB1c2VzIGl0cyBvd24gZGVmYXVsdFxuXHRcdC8vIGJyYW5jaC4gUGFzc2luZyBhIGJhc2UgYnJhbmNoIG1ha2VzIGV2ZXJ5IHJlcG8gbWVhc3VyZSBmcm9tIGl0cyBtZXJnZS1cblx0XHQvLyBiYXNlIChjb21taXR0ZWQgKyB1bmNvbW1pdHRlZCkgaW5zdGVhZCBvZiBmYWxsaW5nIGJhY2sgdG8gSEVBRC5cblx0XHRjb25zdCBwcmltYXJ5UmVwb3NpdG9yeVJvb3QgPSB3b3JraW5nRGlyZWN0b3J5VXJpcy5sZW5ndGggPiAwXG5cdFx0XHQ/IGF3YWl0IHRoaXMuX2dpdFNlcnZpY2UuZ2V0UmVwb3NpdG9yeVJvb3Qod29ya2luZ0RpcmVjdG9yeVVyaXNbMF0pXG5cdFx0XHQ6IHVuZGVmaW5lZDtcblx0XHRjb25zdCBwcmltYXJ5UmVwb3NpdG9yeUtleSA9IHByaW1hcnlSZXBvc2l0b3J5Um9vdFxuXHRcdFx0PyBleHRVcmlCaWFzZWRJZ25vcmVQYXRoQ2FzZS5nZXRDb21wYXJpc29uS2V5KHByaW1hcnlSZXBvc2l0b3J5Um9vdClcblx0XHRcdDogdW5kZWZpbmVkO1xuXHRcdGNvbnN0IHNlc3Npb25CYXNlQnJhbmNoID0gYXdhaXQgdGhpcy5fcmVzb2x2ZUJyYW5jaEJhc2VCcmFuY2goc2Vzc2lvbiwgZGIpO1xuXG5cdFx0Ly8gRGlmZiBldmVyeSByZXNvbHZlZCByZXBvc2l0b3J5LCBidXQgYm91bmQgaG93IG1hbnkgcGVyLXJlcG8gZ2l0IGRpZmZzXG5cdFx0Ly8gcnVuIGF0IG9uY2Ugc28gYSBtYW55LXJlcG9zaXRvcnkgc2Vzc2lvbiBjYW5ub3Qgc3Bhd24gYW4gdW5ib3VuZGVkXG5cdFx0Ly8gbnVtYmVyIG9mIGdpdCBwcm9jZXNzZXMgKHNlZSBNQVhfVFVSTl9ESUZGX1JFUE9TSVRPUllfQ09OQ1VSUkVOQ1kpLlxuXHRcdGNvbnN0IGxpbWl0ZXIgPSBuZXcgTGltaXRlcjxyZWFkb25seSBJU2Vzc2lvbkZpbGVEaWZmW10gfCB1bmRlZmluZWQ+KE1BWF9UVVJOX0RJRkZfUkVQT1NJVE9SWV9DT05DVVJSRU5DWSk7XG5cdFx0Y29uc3QgW3BlclJlcG9EaWZmcywgbm9uR2l0RGlmZnNdID0gYXdhaXQgUHJvbWlzZS5hbGwoW1xuXHRcdFx0UHJvbWlzZS5hbGwoZ2l0UmVwb3NpdG9yaWVzLm1hcChyZXBvUm9vdCA9PiBsaW1pdGVyLnF1ZXVlKGFzeW5jICgpID0+IHtcblx0XHRcdFx0Ly8gSXNvbGF0ZSBlYWNoIHJlcG9zaXRvcnk6IGFueSBmYWlsdXJlIFx1MjAxNCBpbmNsdWRpbmcgdGhlXG5cdFx0XHRcdC8vIGBnZXREZWZhdWx0QnJhbmNoYCBwcm9iZSBiZWxvdyBcdTIwMTQgbWFya3MgT05MWSB0aGlzIHJlcG9zaXRvcnlcblx0XHRcdFx0Ly8gdW5hdmFpbGFibGUgKGB1bmRlZmluZWRgKSBpbnN0ZWFkIG9mIHJlamVjdGluZyB0aGUgd2hvbGVcblx0XHRcdFx0Ly8gZmFuLW91dCwgc28gYSBzaW5nbGUgc2Vjb25kYXJ5IHJlcG8ncyBnaXQgZmFpbHVyZSBuZXZlciBmbGlwc1xuXHRcdFx0XHQvLyB0aGUgYWxyZWFkeS1wdWJsaXNoZWQgYnJhbmNoIGNoYW5nZXNldCB0byBFcnJvci5cblx0XHRcdFx0dHJ5IHtcblx0XHRcdFx0XHRjb25zdCBpc1ByaW1hcnkgPSBwcmltYXJ5UmVwb3NpdG9yeUtleSAhPT0gdW5kZWZpbmVkXG5cdFx0XHRcdFx0XHQmJiBleHRVcmlCaWFzZWRJZ25vcmVQYXRoQ2FzZS5nZXRDb21wYXJpc29uS2V5KHJlcG9Sb290KSA9PT0gcHJpbWFyeVJlcG9zaXRvcnlLZXk7XG5cdFx0XHRcdFx0Ly8gUmV1c2UgdGhlIGJyYW5jaCBjaGFuZ2VzZXQncyBhbHJlYWR5LWNvbXB1dGVkIHByaW1hcnkgZGlmZlxuXHRcdFx0XHRcdC8vIGluc3RlYWQgb2YgcmUtZGlmZmluZyB0aGUgcHJpbWFyeSByZXBvLiBPbmx5IHN1cHBsaWVkIG9uIHRoZVxuXHRcdFx0XHRcdC8vIHN1Y2Nlc3MgcGF0aCwgd2hlcmUgdGhlIHNlc3Npb24gaGFzIGl0cyBvd24gd29ya2luZyBkaXJlY3Rvcmllcyxcblx0XHRcdFx0XHQvLyBzbyB0aGUgYnJhbmNoIGNoYW5nZXNldCdzIHByaW1hcnkgcmVwbyA9PSB0aGlzIHByaW1hcnkgcmVwbyBhbmRcblx0XHRcdFx0XHQvLyBib3RoIG1lYXN1cmUgZnJvbSB0aGUgc2Vzc2lvbiBiYXNlIGJyYW5jaCBcdTIwMTQgaWRlbnRpY2FsIHJlc3VsdCxcblx0XHRcdFx0XHQvLyBvbmUgZmV3ZXIgZ2l0IGRpZmYgcGVyIHJlY29tcHV0ZS5cblx0XHRcdFx0XHRpZiAoaXNQcmltYXJ5ICYmIHByaW1hcnlCcmFuY2hEaWZmcykge1xuXHRcdFx0XHRcdFx0cmV0dXJuIHByaW1hcnlCcmFuY2hEaWZmcztcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0Y29uc3QgYmFzZUJyYW5jaCA9IGlzUHJpbWFyeVxuXHRcdFx0XHRcdFx0PyBzZXNzaW9uQmFzZUJyYW5jaFxuXHRcdFx0XHRcdFx0OiAoYXdhaXQgdGhpcy5fZ2l0U2VydmljZS5nZXREZWZhdWx0QnJhbmNoKHJlcG9Sb290KSk/Lm5hbWU7XG5cdFx0XHRcdFx0cmV0dXJuIGF3YWl0IHRoaXMuX2NvbXB1dGVSZXBvQnJhbmNoRGlmZnMoc2Vzc2lvbiwgcmVwb1Jvb3QsIGJhc2VCcmFuY2gpO1xuXHRcdFx0XHR9IGNhdGNoIChlcnIpIHtcblx0XHRcdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLmVycm9yKGBbQWdlbnRIb3N0Q2hhbmdlc2V0U2VydmljZV0gRmFpbGVkIHRvIGNvbXB1dGUgYnJhbmNoIGRpZmYgZm9yIG11bHRpLWZvbGRlciBicmFuY2ggc3VtbWFyeSAke3Nlc3Npb259IGluIHJlcG9zaXRvcnkgJHtyZXBvUm9vdC50b1N0cmluZygpfWAsIGVycik7XG5cdFx0XHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHRcdFx0fVxuXHRcdFx0fSkpKSxcblx0XHRcdHRoaXMuX2NvbXB1dGVOb25HaXRCcmFuY2hEaWZmcyhzZXNzaW9uLCBkYiwgbm9uR2l0RGlyZWN0b3JpZXMpLFxuXHRcdF0pLmZpbmFsbHkoKCkgPT4gbGltaXRlci5kaXNwb3NlKCkpO1xuXG5cdFx0Ly8gQ2xhc3NpZnkgdGhlIGRpZmYgc291cmNlcyBieSBhdmFpbGFiaWxpdHkuIFRoZSBub24tZ2l0IERCIHNvdXJjZSBvbmx5XG5cdFx0Ly8gY291bnRzIHdoZW4gdGhlcmUgQVJFIG5vbi1naXQgZm9sZGVycywgc28gYSBzZXNzaW9uIHdob3NlIHdvcmtpbmdcblx0XHQvLyBkaXJlY3RvcmllcyBhbGwgZmFpbCB0byByZXNvbHZlIGNvbnRyaWJ1dGVzIG5vIHNvdXJjZXMgYXQgYWxsLlxuXHRcdGNvbnN0IG9yZGVyZWRTb3VyY2VzOiAocmVhZG9ubHkgSVNlc3Npb25GaWxlRGlmZltdIHwgdW5kZWZpbmVkKVtdID0gWy4uLnBlclJlcG9EaWZmc107XG5cdFx0aWYgKG5vbkdpdERpcmVjdG9yaWVzLmxlbmd0aCA+IDApIHtcblx0XHRcdG9yZGVyZWRTb3VyY2VzLnB1c2gobm9uR2l0RGlmZnMpO1xuXHRcdH1cblx0XHRjb25zdCBldmFsdWF0aW9uID0gZXZhbHVhdGVNdWx0aVJvb3REaWZmU291cmNlcyhvcmRlcmVkU291cmNlcyk7XG5cdFx0aWYgKGV2YWx1YXRpb24ub3V0Y29tZSA9PT0gJ2ZhaWxlZCcpIHtcblx0XHRcdC8vIE5vIHNvdXJjZSBwcm9kdWNlZCBkaWZmcyAodG90YWwgZmFpbHVyZSBvciBubyBzb3VyY2VzIGF0IGFsbCkuXG5cdFx0XHQvLyBQcmVzZXJ2ZSB0aGUgcHJldmlvdXNseSBjYWNoZWQgc3VtbWFyeSBpbnN0ZWFkIG9mIGNsb2JiZXJpbmcgaXRcblx0XHRcdC8vIHdpdGggYSBzcHVyaW91cyB6ZXJvIGFnZ3JlZ2F0ZS5cblx0XHRcdHRoaXMuX2xvZ1NlcnZpY2Uud2FybihgW0FnZW50SG9zdENoYW5nZXNldFNlcnZpY2VdIE5vIGRpZmYgc291cmNlIGF2YWlsYWJsZSBmb3IgbXVsdGktZm9sZGVyIGJyYW5jaCBzdW1tYXJ5ICR7c2Vzc2lvbn07IHByZXNlcnZpbmcgdGhlIGNhY2hlZCBzdW1tYXJ5LmApO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGxldCBhZGRpdGlvbnMgPSAwO1xuXHRcdGxldCBkZWxldGlvbnMgPSAwO1xuXHRcdGxldCBmaWxlcyA9IDA7XG5cdFx0Zm9yIChjb25zdCBkaWZmcyBvZiBldmFsdWF0aW9uLmF2YWlsYWJsZVNvdXJjZXMpIHtcblx0XHRcdGNvbnN0IHN1bW1hcnkgPSBzdW1tYXJpc2VEaWZmcyhkaWZmcyk7XG5cdFx0XHRpZiAoc3VtbWFyeSkge1xuXHRcdFx0XHRhZGRpdGlvbnMgKz0gc3VtbWFyeS5hZGRpdGlvbnMgPz8gMDtcblx0XHRcdFx0ZGVsZXRpb25zICs9IHN1bW1hcnkuZGVsZXRpb25zID8/IDA7XG5cdFx0XHRcdGZpbGVzICs9IHN1bW1hcnkuZmlsZXMgPz8gMDtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRjb25zdCBjaGFuZ2VzU3VtbWFyeTogQ2hhbmdlc1N1bW1hcnkgPSB7IGFkZGl0aW9ucywgZGVsZXRpb25zLCBmaWxlcyB9O1xuXHRcdHRoaXMucGVyc2lzdENoYW5nZXNTdW1tYXJ5KHNlc3Npb24sIGNoYW5nZXNTdW1tYXJ5KTtcblx0XHR0aGlzLl9zdGF0ZU1hbmFnZXIuc2V0U2Vzc2lvblN1bW1hcnlDaGFuZ2VzKHNlc3Npb24sIGNoYW5nZXNTdW1tYXJ5KTtcblx0fVxuXG5cdC8qKlxuXHQgKiBDb21wdXRlcyBvbmUgZ2l0IHJlcG9zaXRvcnkncyBicmFuY2ggZGlmZiBmb3IgdGhlIG11bHRpLWZvbGRlciBzdW1tYXJ5LFxuXHQgKiBsb2dnaW5nIGFuZCByZXR1cm5pbmcgYHVuZGVmaW5lZGAgb24gYW55IGZhaWx1cmUgc28gYSBzaW5nbGUgcmVwbyBuZXZlclxuXHQgKiBmYWlscyB0aGUgd2hvbGUgYWdncmVnYXRlIGFuZCBhbiB1bmF2YWlsYWJsZSByZXBvIGlzIGNvdW50ZWQgYXMgc3VjaCAobm90XG5cdCAqIGFzIGEgc3B1cmlvdXMgemVybykuIFVzZXMgdGhlIHNhbWUgYGNvbXB1dGVTZXNzaW9uRmlsZURpZmZzYCBwcmltaXRpdmUgYXNcblx0ICogdGhlIHByaW1hcnkgYnJhbmNoIGNoYW5nZXNldCwgdGhyZWFkaW5nIHRoZSByZXNvbHZlZCBgYmFzZUJyYW5jaGAgc29cblx0ICogY29tbWl0dGVkLW9uLWJyYW5jaCB3b3JrIGlzIGNvdW50ZWQgKG5vdCBqdXN0IHVuY29tbWl0dGVkKS5cblx0ICovXG5cdHByaXZhdGUgYXN5bmMgX2NvbXB1dGVSZXBvQnJhbmNoRGlmZnMoc2Vzc2lvbjogUHJvdG9jb2xVUkksIHJlcG9Sb290OiBVUkksIGJhc2VCcmFuY2g6IHN0cmluZyB8IHVuZGVmaW5lZCk6IFByb21pc2U8cmVhZG9ubHkgSVNlc3Npb25GaWxlRGlmZltdIHwgdW5kZWZpbmVkPiB7XG5cdFx0dHJ5IHtcblx0XHRcdGNvbnN0IGRpZmZzID0gYXdhaXQgdGhpcy5fZ2l0U2VydmljZS5jb21wdXRlU2Vzc2lvbkZpbGVEaWZmcyhyZXBvUm9vdCwgeyBzZXNzaW9uVXJpOiBzZXNzaW9uLCBiYXNlQnJhbmNoIH0pO1xuXHRcdFx0aWYgKCFkaWZmcykge1xuXHRcdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLmVycm9yKGBbQWdlbnRIb3N0Q2hhbmdlc2V0U2VydmljZV0gR2l0IGJyYW5jaCBkaWZmIHVuYXZhaWxhYmxlIGZvciBtdWx0aS1mb2xkZXIgYnJhbmNoIHN1bW1hcnkgJHtzZXNzaW9ufSBpbiByZXBvc2l0b3J5ICR7cmVwb1Jvb3QudG9TdHJpbmcoKX07IHNraXBwaW5nIHRoYXQgcmVwb3NpdG9yeS5gKTtcblx0XHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHRcdH1cblx0XHRcdHJldHVybiBkaWZmcztcblx0XHR9IGNhdGNoIChlcnIpIHtcblx0XHRcdHRoaXMuX2xvZ1NlcnZpY2UuZXJyb3IoYFtBZ2VudEhvc3RDaGFuZ2VzZXRTZXJ2aWNlXSBGYWlsZWQgdG8gY29tcHV0ZSBnaXQgYnJhbmNoIGRpZmYgZm9yIG11bHRpLWZvbGRlciBicmFuY2ggc3VtbWFyeSAke3Nlc3Npb259IGluIHJlcG9zaXRvcnkgJHtyZXBvUm9vdC50b1N0cmluZygpfWAsIGVycik7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblx0fVxuXG5cdC8qKlxuXHQgKiBUaGUgc2Vzc2lvbi1sZXZlbCBEQi10cmFja2VkIGVkaXRzIGZvciB0aGUgbm9uLWdpdCBmb2xkZXJzLCBzY29wZWQgdG9cblx0ICogdGhvc2Ugcm9vdHMgc28gdGhlIG11bHRpLWZvbGRlciBzdW1tYXJ5IGNvdW50cyBub24tZ2l0IGZvbGRlciBjaGFuZ2VzXG5cdCAqIChnaXQgZm9sZGVycyBhcmUgYWxyZWFkeSBjb3ZlcmVkIGJ5IHRoZWlyIGJyYW5jaCBkaWZmLCBhbmQgdGhlIGdpdC9ub24tZ2l0XG5cdCAqIHBhcnRpdGlvbiBrZWVwcyB0aGUgdHdvIGRpc2pvaW50KS4gVXNlcyBmdWxsLXNlc3Npb24gYWdncmVnYXRpb24gc28gYSBmaWxlXG5cdCAqIGVkaXRlZCBhY3Jvc3Mgc2V2ZXJhbCB0dXJucyBjb3VudHMgb25jZS4gQ2FsbGVycyBvbmx5IHRyZWF0IHRoaXMgYXMgYVxuXHQgKiBzb3VyY2Ugd2hlbiB0aGVyZSBBUkUgbm9uLWdpdCBmb2xkZXJzOyBpdCByZXR1cm5zIGB1bmRlZmluZWRgIG9uIGZhaWx1cmVcblx0ICogc28gYSBmYWlsZWQgbm9uLWdpdCBzb3VyY2UgaXMgY291bnRlZCBhcyB1bmF2YWlsYWJsZSByYXRoZXIgdGhhbiBlbXB0eS5cblx0ICovXG5cdHByaXZhdGUgYXN5bmMgX2NvbXB1dGVOb25HaXRCcmFuY2hEaWZmcyhzZXNzaW9uOiBQcm90b2NvbFVSSSwgZGI6IElTZXNzaW9uRGF0YWJhc2UsIG5vbkdpdERpcmVjdG9yaWVzOiByZWFkb25seSBVUklbXSk6IFByb21pc2U8cmVhZG9ubHkgSVNlc3Npb25GaWxlRGlmZltdIHwgdW5kZWZpbmVkPiB7XG5cdFx0aWYgKG5vbkdpdERpcmVjdG9yaWVzLmxlbmd0aCA9PT0gMCkge1xuXHRcdFx0cmV0dXJuIFtdO1xuXHRcdH1cblx0XHR0cnkge1xuXHRcdFx0cmV0dXJuIGF3YWl0IGNvbXB1dGVTZXNzaW9uRGlmZnMoc2Vzc2lvbiwgZGIsIHRoaXMuX2RpZmZDb21wdXRlU2VydmljZSwgdW5kZWZpbmVkLCBub25HaXREaXJlY3Rvcmllcyk7XG5cdFx0fSBjYXRjaCAoZXJyKSB7XG5cdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLmVycm9yKGBbQWdlbnRIb3N0Q2hhbmdlc2V0U2VydmljZV0gRmFpbGVkIHRvIGNvbXB1dGUgbm9uLWdpdCBEQiBicmFuY2ggc3VtbWFyeSBmb3IgbXVsdGktZm9sZGVyIHNlc3Npb24gJHtzZXNzaW9ufWAsIGVycik7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgX3Jlc29sdmVXb3JraW5nRGlyZWN0b3J5KHNlc3Npb246IFByb3RvY29sVVJJKTogUHJvbWlzZTxVUkkgfCB1bmRlZmluZWQ+IHtcblx0XHQvLyBGb3IgdGhlIHRpbWUgYmVpbmcgd2UgZGVmYXVsdCB0byB0aGUgZmlyc3Qgd29ya2luZyBkaXJlY3RvcnkgaW4gdGhlIGxpc3QsIGlmIGFueS5cblx0XHQvLyBJbiB0aGUgZnV0dXJlIHdlIG1heSB3YW50IHRvIHN1cHBvcnQgbXVsdGlwbGUgd29ya2luZyBkaXJlY3RvcmllcyBwZXIgc2Vzc2lvbixcblx0XHQvLyBidXQgZm9yIG5vdyB3ZSBvbmx5IHN1cHBvcnQgb25lLlxuXHRcdGNvbnN0IHdvcmtpbmdEaXJlY3RvcmllcyA9IHRoaXMuX2NvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldEVmZmVjdGl2ZVdvcmtpbmdEaXJlY3RvcmllcyhzZXNzaW9uKTtcblx0XHRyZXR1cm4gd29ya2luZ0RpcmVjdG9yaWVzICYmIHdvcmtpbmdEaXJlY3Rvcmllcy5sZW5ndGggPiAwXG5cdFx0XHQ/IFVSSS5wYXJzZSh3b3JraW5nRGlyZWN0b3JpZXNbMF0pXG5cdFx0XHQ6IHVuZGVmaW5lZDtcblx0fVxuXG5cdC8vIC0tLS0gTGlmZWN5Y2xlIGhvb2tzIGludm9rZWQgYnkgQWdlbnRTaWRlRWZmZWN0cyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuXG5cdG9uVG9vbENhbGxFZGl0c0FwcGxpZWQoc2Vzc2lvbjogUHJvdG9jb2xVUkksIHR1cm5JZDogc3RyaW5nLCBjbGllbnRDb250ZXh0PzogSUFnZW50SG9zdENsaWVudFRlbGVtZXRyeUNvbnRleHQpOiB2b2lkIHtcblx0XHR0aGlzLl9zY2hlZHVsZURlYm91bmNlZERpZmZDb21wdXRhdGlvbihzZXNzaW9uLCB0dXJuSWQsIGNsaWVudENvbnRleHQpO1xuXHRcdC8vIFBlci10dXJuIFVSSXMgaGF2ZSBubyBjYXRhbG9ndWUgY2hpcCBhZ2dyZWdhdGVzLCBzbyBza2lwIHRoZVxuXHRcdC8vIHJlY29tcHV0ZSBlbnRpcmVseSB3aGVuIG5vIGNsaWVudCBpcyBvYnNlcnZpbmcgdGhpcyB0dXJuLiBUaGVcblx0XHQvLyBuZXh0IHN1YnNjcmliZXIgd2lsbCBnZXQgYSBmcmVzaCBzbmFwc2hvdCBmcm9tXG5cdFx0Ly8gYHRyeUhhbmRsZVN1YnNjcmliZSBcdTIxOTIgY29tcHV0ZVR1cm5DaGFuZ2VzZXRgLlxuXHRcdGlmICh0aGlzLl9oYXNTdWJzY3JpcHRpb24oc2Vzc2lvbiwgYnVpbGRUdXJuQ2hhbmdlc2V0VXJpKHNlc3Npb24sIHR1cm5JZCkpKSB7XG5cdFx0XHR0aGlzLl9zY2hlZHVsZURlYm91bmNlZFR1cm5EaWZmQ29tcHV0YXRpb24oc2Vzc2lvbiwgdHVybklkLCBjbGllbnRDb250ZXh0KTtcblx0XHR9XG5cdH1cblxuXHRvblR1cm5Db21wbGV0ZShzZXNzaW9uOiBQcm90b2NvbFVSSSwgdHVybklkOiBzdHJpbmcgfCB1bmRlZmluZWQsIGNsaWVudENvbnRleHQ/OiBJQWdlbnRIb3N0Q2xpZW50VGVsZW1ldHJ5Q29udGV4dCk6IHZvaWQge1xuXHRcdC8vIE9yZGVyaW5nIG1hdHRlcnMgZm9yIGNhbmNlbGxhdGlvbjogY2FuY2VsIGFueSBwZW5kaW5nIG1pZC10dXJuXG5cdFx0Ly8gZGVib3VuY2VzIGZpcnN0IHNvIHRoZSBmaW5hbCB0dXJuLWNvbXBsZXRlIGNvbXB1dGVzIHN1cGVyc2VkZVxuXHRcdC8vIHRoZW0uIEFmdGVyIHRoYXQsIHNjaGVkdWxlIHRoZSBmaW5hbCByZWNvbXB1dGVzIGZvciB0aGUgdHVyblxuXHRcdC8vICh3aGVuIG9ic2VydmVkKSwgdGhlIHNlc3Npb24td2lkZSBjaGFuZ2VzZXQgd2l0aCB0aGUgY2hhbmdlZFxuXHRcdC8vIHR1cm4gaWQsIGFuZCB0aGUgdW5jb21taXR0ZWQgY2hhbmdlc2V0IHdoZW4gaXQgaXMgb2JzZXJ2ZWQuXG5cdFx0dGhpcy5fY2FuY2VsRGVib3VuY2VkRGlmZkNvbXB1dGF0aW9uKHNlc3Npb24pO1xuXHRcdGlmICh0dXJuSWQgIT09IHVuZGVmaW5lZCkge1xuXHRcdFx0dGhpcy5fY2FuY2VsRGVib3VuY2VkVHVybkRpZmZDb21wdXRhdGlvbihzZXNzaW9uLCB0dXJuSWQpO1xuXHRcdFx0aWYgKHRoaXMuX2hhc1N1YnNjcmlwdGlvbihzZXNzaW9uLCBidWlsZFR1cm5DaGFuZ2VzZXRVcmkoc2Vzc2lvbiwgdHVybklkKSkpIHtcblx0XHRcdFx0dGhpcy5fc2NoZWR1bGVUdXJuUmVjb21wdXRlKHNlc3Npb24sIHR1cm5JZCwgdHJ1ZSwgY2xpZW50Q29udGV4dCk7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0aWYgKHRoaXMuX2hhc1N1YnNjcmlwdGlvbihzZXNzaW9uLCBidWlsZFVuY29tbWl0dGVkQ2hhbmdlc2V0VXJpKHNlc3Npb24pKSkge1xuXHRcdFx0dGhpcy5fc2NoZWR1bGVVbmNvbW1pdHRlZFJlY29tcHV0ZShzZXNzaW9uLCB0dXJuSWQsIHRydWUsIGNsaWVudENvbnRleHQpO1xuXHRcdH1cblxuXHRcdHRoaXMuX3NjaGVkdWxlU3RhdGljUmVjb21wdXRlKHNlc3Npb24sICdicmFuY2gnLCB0dXJuSWQsIHVuZGVmaW5lZCwgdHJ1ZSwgY2xpZW50Q29udGV4dCk7XG5cdFx0dGhpcy5fc2NoZWR1bGVTdGF0aWNSZWNvbXB1dGUoc2Vzc2lvbiwgJ3Nlc3Npb24nLCB0dXJuSWQsIHVuZGVmaW5lZCwgdHJ1ZSwgY2xpZW50Q29udGV4dCk7XG5cdH1cblxuXHRvblNlc3Npb25UcnVuY2F0ZWQoc2Vzc2lvbjogUHJvdG9jb2xVUkkpOiB2b2lkIHtcblx0XHQvLyBUdXJucyB3ZXJlIHJlbW92ZWQgXHUyMDE0IHJlY29tcHV0ZSBmcm9tIHNjcmF0Y2ggKG5vIGNoYW5nZWRUdXJuSWQpLlxuXHRcdHRoaXMuX3NjaGVkdWxlU3RhdGljUmVjb21wdXRlKHNlc3Npb24sICdicmFuY2gnLCB1bmRlZmluZWQsIHVuZGVmaW5lZCwgdHJ1ZSk7XG5cdFx0dGhpcy5fc2NoZWR1bGVTdGF0aWNSZWNvbXB1dGUoc2Vzc2lvbiwgJ3Nlc3Npb24nLCB1bmRlZmluZWQsIHVuZGVmaW5lZCwgdHJ1ZSk7XG5cdH1cblxuXHQvLyAtLS0tIEludGVybmFsIGNvbXB1dGUgcGlwZWxpbmUgLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cblxuXHQvKipcblx0ICogU2NoZWR1bGVzIGEgZGVib3VuY2VkIHNlc3Npb24tY2hhbmdlc2V0IHJlY29tcHV0YXRpb24uIFVuY29tbWl0dGVkXG5cdCAqIHJlY29tcHV0ZXMgcmlkZSB0aGUgc2FtZSB0dXJuLWNvbXBsZXRlIHBhdGg7IG1pZC10dXJuIGRlYm91bmNlIG9ubHlcblx0ICogbWFrZXMgc2Vuc2UgZm9yIHRoZSBTREstdHJhY2tlZCBzZXNzaW9uLXdpZGUgZGlmZiAod2hpY2ggc2VlcyBmcmVzaFxuXHQgKiBgdG9vbF9jb21wbGV0ZWAgZXZlbnRzIGJldHdlZW4gdHVybiBib3VuZGFyaWVzKS5cblx0ICovXG5cdHByaXZhdGUgX3NjaGVkdWxlRGVib3VuY2VkRGlmZkNvbXB1dGF0aW9uKHNlc3Npb246IFByb3RvY29sVVJJLCB0dXJuSWQ6IHN0cmluZywgY2xpZW50Q29udGV4dD86IElBZ2VudEhvc3RDbGllbnRUZWxlbWV0cnlDb250ZXh0KTogdm9pZCB7XG5cdFx0dGhpcy5fZGVib3VuY2VkRGlmZlRpbWVycy5zZXQoc2Vzc2lvbiwgZGlzcG9zYWJsZVRpbWVvdXQoKCkgPT4ge1xuXHRcdFx0dGhpcy5fZGVib3VuY2VkRGlmZlRpbWVycy5kZWxldGVBbmREaXNwb3NlKHNlc3Npb24pO1xuXHRcdFx0dGhpcy5fc2NoZWR1bGVTdGF0aWNSZWNvbXB1dGUoc2Vzc2lvbiwgJ2JyYW5jaCcsIHR1cm5JZCwgdW5kZWZpbmVkLCBmYWxzZSwgY2xpZW50Q29udGV4dCk7XG5cdFx0XHR0aGlzLl9zY2hlZHVsZVN0YXRpY1JlY29tcHV0ZShzZXNzaW9uLCAnc2Vzc2lvbicsIHR1cm5JZCwgdW5kZWZpbmVkLCBmYWxzZSwgY2xpZW50Q29udGV4dCk7XG5cdFx0fSwgQWdlbnRIb3N0Q2hhbmdlc2V0U2VydmljZS5fRElGRl9ERUJPVU5DRV9NUykpO1xuXHR9XG5cblx0LyoqXG5cdCAqIENhbmNlbHMgYW55IHBlbmRpbmcgZGVib3VuY2VkIGRpZmYgY29tcHV0YXRpb24gZm9yIGEgc2Vzc2lvbi5cblx0ICogQ2FsbGVkIGF0IHR1cm4gZW5kIGJlZm9yZSB0aGUgZmluYWwgKG5vbi1kZWJvdW5jZWQpIGNvbXB1dGF0aW9uLlxuXHQgKi9cblx0cHJpdmF0ZSBfY2FuY2VsRGVib3VuY2VkRGlmZkNvbXB1dGF0aW9uKHNlc3Npb246IFByb3RvY29sVVJJKTogdm9pZCB7XG5cdFx0dGhpcy5fZGVib3VuY2VkRGlmZlRpbWVycy5kZWxldGVBbmREaXNwb3NlKHNlc3Npb24pO1xuXHR9XG5cblx0LyoqXG5cdCAqIFNjaGVkdWxlcyBhIGRlYm91bmNlZCBwZXItdHVybiBjaGFuZ2VzZXQgcmVjb21wdXRhdGlvbi4gTWlycm9yc1xuXHQgKiB7QGxpbmsgX3NjaGVkdWxlRGVib3VuY2VkRGlmZkNvbXB1dGF0aW9ufSBidXQgdXNlcyBhIHBlci1cblx0ICogYChzZXNzaW9uLCB0dXJuSWQpYCBtYXAga2V5IHNvIGEgbG9uZy1ydW5uaW5nIHBlci10dXJuIGNvbXB1dGVcblx0ICogZG9lc24ndCBibG9jayB0aGUgc3RhdGljIHNlc3Npb24gcmVjb21wdXRlIHBhdGggKGFuZCB2aWNlIHZlcnNhKS5cblx0ICovXG5cdHByaXZhdGUgX3NjaGVkdWxlRGVib3VuY2VkVHVybkRpZmZDb21wdXRhdGlvbihzZXNzaW9uOiBQcm90b2NvbFVSSSwgdHVybklkOiBzdHJpbmcsIGNsaWVudENvbnRleHQ/OiBJQWdlbnRIb3N0Q2xpZW50VGVsZW1ldHJ5Q29udGV4dCk6IHZvaWQge1xuXHRcdGNvbnN0IGtleSA9IGAke3Nlc3Npb259XFx1MDAwMCR7dHVybklkfWA7XG5cdFx0dGhpcy5fcGVyVHVybkRlYm91bmNlZERpZmZUaW1lcnMuc2V0KGtleSwgZGlzcG9zYWJsZVRpbWVvdXQoKCkgPT4ge1xuXHRcdFx0dGhpcy5fcGVyVHVybkRlYm91bmNlZERpZmZUaW1lcnMuZGVsZXRlQW5kRGlzcG9zZShrZXkpO1xuXHRcdFx0dGhpcy5fc2NoZWR1bGVUdXJuUmVjb21wdXRlKHNlc3Npb24sIHR1cm5JZCwgZmFsc2UsIGNsaWVudENvbnRleHQpO1xuXHRcdH0sIEFnZW50SG9zdENoYW5nZXNldFNlcnZpY2UuX0RJRkZfREVCT1VOQ0VfTVMpKTtcblx0fVxuXG5cdC8qKlxuXHQgKiBDYW5jZWxzIGFueSBwZW5kaW5nIGRlYm91bmNlZCBwZXItdHVybiBkaWZmIGNvbXB1dGF0aW9uIGZvciBhXG5cdCAqIGAoc2Vzc2lvbiwgdHVybklkKWAuIENhbGxlZCBhdCB0dXJuIGVuZCBiZWZvcmUgdGhlIGZpbmFsXG5cdCAqIChub24tZGVib3VuY2VkKSBwZXItdHVybiBjb21wdXRhdGlvbi5cblx0ICovXG5cdHByaXZhdGUgX2NhbmNlbERlYm91bmNlZFR1cm5EaWZmQ29tcHV0YXRpb24oc2Vzc2lvbjogUHJvdG9jb2xVUkksIHR1cm5JZDogc3RyaW5nKTogdm9pZCB7XG5cdFx0dGhpcy5fcGVyVHVybkRlYm91bmNlZERpZmZUaW1lcnMuZGVsZXRlQW5kRGlzcG9zZShgJHtzZXNzaW9ufVxcdTAwMDAke3R1cm5JZH1gKTtcblx0fVxuXG5cdC8qKlxuXHQgKiBRdWV1ZXMgYSBwZXItdHVybiByZWNvbXB1dGUgb24gYSBwZXItYChzZXNzaW9uLCB0dXJuSWQpYCBzZXF1ZW5jZXJcblx0ICoga2V5IHNvIGJhY2stdG8tYmFjayByZWNvbXB1dGVzIGZvciB0aGUgc2FtZSB0dXJuIHNlcmlhbGlzZSwgYnV0XG5cdCAqIHJlY29tcHV0ZXMgZm9yIGRpZmZlcmVudCB0dXJucyAob3IgZm9yIHRoZSBzdGF0aWMgYHNlc3Npb25gIC9cblx0ICogYHVuY29tbWl0dGVkYCBzbG90cykgcnVuIGluZGVwZW5kZW50bHkuIEZpcmUtYW5kLWZvcmdldCBcdTIwMTQgZmFpbHVyZXNcblx0ICogYXJlIGxvZ2dlZCBpbnNpZGUgYGNvbXB1dGVUdXJuQ2hhbmdlc2V0YCBhbmQgZG8gbm90IGZhaWwgdGhlIHR1cm4uXG5cdCAqL1xuXHRwcml2YXRlIF9zY2hlZHVsZVR1cm5SZWNvbXB1dGUoc2Vzc2lvbjogUHJvdG9jb2xVUkksIHR1cm5JZDogc3RyaW5nLCByZXBvcnRUZWxlbWV0cnk6IGJvb2xlYW4gPSBmYWxzZSwgY2xpZW50Q29udGV4dD86IElBZ2VudEhvc3RDbGllbnRUZWxlbWV0cnlDb250ZXh0KTogdm9pZCB7XG5cdFx0dGhpcy5fZGlmZkNvbXB1dGF0aW9uU2VxdWVuY2VyLnF1ZXVlKGAke3Nlc3Npb259XFx1MDAwMHR1cm5cXHUwMDAwJHt0dXJuSWR9YCwgKCkgPT4gdGhpcy5fY29tcHV0ZVR1cm5DaGFuZ2VzZXQoc2Vzc2lvbiwgdHVybklkLCByZXBvcnRUZWxlbWV0cnksIGNsaWVudENvbnRleHQpLnRoZW4oKCkgPT4gdW5kZWZpbmVkKSk7XG5cdH1cblxuXHRwcml2YXRlIF9zY2hlZHVsZVVuY29tbWl0dGVkUmVjb21wdXRlKHNlc3Npb246IFByb3RvY29sVVJJLCB0dXJuSWQ6IHN0cmluZyB8IHVuZGVmaW5lZCwgcmVwb3J0VGVsZW1ldHJ5OiBib29sZWFuID0gZmFsc2UsIGNsaWVudENvbnRleHQ/OiBJQWdlbnRIb3N0Q2xpZW50VGVsZW1ldHJ5Q29udGV4dCk6IHZvaWQge1xuXHRcdHRoaXMuX2RpZmZDb21wdXRhdGlvblNlcXVlbmNlci5xdWV1ZShgJHtzZXNzaW9ufVxcdTAwMDB1bmNvbW1pdHRlZGAsICgpID0+IHRoaXMuX2NvbXB1dGVVbmNvbW1pdHRlZENoYW5nZXNldChzZXNzaW9uLCB0dXJuSWQsIHJlcG9ydFRlbGVtZXRyeSwgY2xpZW50Q29udGV4dCkudGhlbigoKSA9PiB1bmRlZmluZWQpKTtcblx0fVxuXG5cdC8qKlxuXHQgKiBTY2hlZHVsZXMgYSBzdGF0aWMgY2hhbmdlc2V0IChgdW5jb21taXR0ZWRgIG9yIGBzZXNzaW9uYCkgcmVjb21wdXRlLFxuXHQgKiBzZXJpYWxpc2VkIHBlci1zZXNzaW9uIHNvIGJhY2stdG8tYmFjayB0cmlnZ2VycyBkb24ndCByYWNlIGFnYWluc3Rcblx0ICogc3RhbGUgYHByZXZpb3VzRGlmZnNgIHJlYWRzLiBGaXJlLWFuZC1mb3JnZXQgXHUyMDE0IGZhaWx1cmVzIGFyZSBsb2dnZWRcblx0ICogYnV0IGRvIG5vdCBmYWlsIHRoZSB0dXJuLlxuXHQgKi9cblx0cHJpdmF0ZSBfc2NoZWR1bGVTdGF0aWNSZWNvbXB1dGUoc2Vzc2lvbjogUHJvdG9jb2xVUkksIGtpbmQ6IFN0YXRpY0NoYW5nZXNldEtpbmQsIGNoYW5nZWRUdXJuSWQ/OiBzdHJpbmcsIHN0YXR1c0JlZm9yZVJlZnJlc2g/OiBDaGFuZ2VzZXRTdGF0dXMsIHJlcG9ydFRlbGVtZXRyeTogYm9vbGVhbiA9IGZhbHNlLCBjbGllbnRDb250ZXh0PzogSUFnZW50SG9zdENsaWVudFRlbGVtZXRyeUNvbnRleHQpOiB2b2lkIHtcblx0XHR0aGlzLl9kaWZmQ29tcHV0YXRpb25TZXF1ZW5jZXIucXVldWUoYCR7c2Vzc2lvbn1cXHUwMDAwJHtraW5kfWAsICgpID0+IHRoaXMuX2RvQ29tcHV0ZVN0YXRpY0NoYW5nZXNldChzZXNzaW9uLCBraW5kLCBjaGFuZ2VkVHVybklkLCBzdGF0dXNCZWZvcmVSZWZyZXNoLCByZXBvcnRUZWxlbWV0cnksIGNsaWVudENvbnRleHQpKTtcblx0fVxuXG5cdHByaXZhdGUgX21hcmtTdGF0aWNDaGFuZ2VzZXRDb21wdXRpbmcoc2Vzc2lvbjogUHJvdG9jb2xVUkksIGtpbmQ6IFN0YXRpY0NoYW5nZXNldEtpbmQpOiBDaGFuZ2VzZXRTdGF0dXMgfCB1bmRlZmluZWQge1xuXHRcdGNvbnN0IGNoYW5nZXNldFVyaSA9IHN0YXRpY0NoYW5nZXNldFVyaShzZXNzaW9uLCBraW5kKTtcblx0XHR0aGlzLl9zdGF0ZU1hbmFnZXIucmVnaXN0ZXJDaGFuZ2VzZXQoY2hhbmdlc2V0VXJpKTtcblx0XHRjb25zdCBzdGF0dXMgPSB0aGlzLl9zdGF0ZU1hbmFnZXIuZ2V0Q2hhbmdlc2V0U3RhdGUoY2hhbmdlc2V0VXJpKT8uc3RhdHVzO1xuXHRcdGlmIChzdGF0dXMgIT09IENoYW5nZXNldFN0YXR1cy5Db21wdXRpbmcpIHtcblx0XHRcdHRoaXMuX3N0YXRlTWFuYWdlci5kaXNwYXRjaFNlcnZlckFjdGlvbihjaGFuZ2VzZXRVcmksIHtcblx0XHRcdFx0dHlwZTogQWN0aW9uVHlwZS5DaGFuZ2VzZXRTdGF0dXNDaGFuZ2VkLFxuXHRcdFx0XHRzdGF0dXM6IENoYW5nZXNldFN0YXR1cy5Db21wdXRpbmcsXG5cdFx0XHR9KTtcblx0XHR9XG5cdFx0cmV0dXJuIHN0YXR1cztcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgX2RvQ29tcHV0ZVN0YXRpY0NoYW5nZXNldChzZXNzaW9uOiBQcm90b2NvbFVSSSwga2luZDogU3RhdGljQ2hhbmdlc2V0S2luZCwgY2hhbmdlZFR1cm5JZD86IHN0cmluZywgc3RhdHVzQmVmb3JlUmVmcmVzaD86IENoYW5nZXNldFN0YXR1cywgcmVwb3J0VGVsZW1ldHJ5OiBib29sZWFuID0gZmFsc2UsIGNsaWVudENvbnRleHQ/OiBJQWdlbnRIb3N0Q2xpZW50VGVsZW1ldHJ5Q29udGV4dCk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGNvbnN0IGNoYW5nZXNldFVyaSA9IHN0YXRpY0NoYW5nZXNldFVyaShzZXNzaW9uLCBraW5kKTtcblx0XHRjb25zdCBzdG9wV2F0Y2ggPSBTdG9wV2F0Y2guY3JlYXRlKCk7XG5cdFx0Y29uc3Qgd29ya2luZ0RpcmVjdG9yaWVzID0gdGhpcy5fY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0RWZmZWN0aXZlV29ya2luZ0RpcmVjdG9yaWVzKHNlc3Npb24pO1xuXHRcdGxldCBvdXRjb21lOiBTdGF0aWNDaGFuZ2VzZXRPdXRjb21lID0gJ2Vycm9yJztcblx0XHRsZXQgZmlsZUNvdW50ID0gMDtcblx0XHRsZXQgaW5jcmVtZW50YWxVc2VkID0gZmFsc2U7XG5cdFx0bGV0IHVzZWRFZGl0VHJhY2tlckZhbGxiYWNrID0gZmFsc2U7XG5cdFx0Ly8gRW1pdHRlZCBleGFjdGx5IG9uY2UgcGVyIGNvbXB1dGU6IGZyb20gdGhlIERCLW9wZW4gY2F0Y2ggYmVsb3cgKHdoaWNoXG5cdFx0Ly8gcmV0dXJucyBiZWZvcmUgdGhlIG1haW4gZmluYWxseSkgb3IgZnJvbSB0aGUgbWFpbiBmaW5hbGx5IG90aGVyd2lzZS5cblx0XHRjb25zdCBlbWl0U3RhdGljVGVsZW1ldHJ5ID0gKCkgPT4ge1xuXHRcdFx0aWYgKHJlcG9ydFRlbGVtZXRyeSkge1xuXHRcdFx0XHRyZXBvcnRBZ2VudEhvc3RTdGF0aWNDaGFuZ2VzZXRDb21wdXRlZCh0aGlzLl90ZWxlbWV0cnlTZXJ2aWNlLCBzZXNzaW9uLCBjaGFuZ2VkVHVybklkLCB7XG5cdFx0XHRcdFx0a2luZCxcblx0XHRcdFx0XHRvdXRjb21lLFxuXHRcdFx0XHRcdGR1cmF0aW9uTXM6IHN0b3BXYXRjaC5lbGFwc2VkKCksXG5cdFx0XHRcdFx0aXNNdWx0aVJvb3Q6IGlzTXVsdGlSb290U2Vzc2lvbih3b3JraW5nRGlyZWN0b3JpZXMpLFxuXHRcdFx0XHRcdGZvbGRlckNvdW50OiB3b3JraW5nRGlyZWN0b3JpZXM/Lmxlbmd0aCA/PyAwLFxuXHRcdFx0XHRcdC4uLihvdXRjb21lID09PSAnY29tcHV0ZWQnID8geyBmaWxlQ291bnQgfSA6IHt9KSxcblx0XHRcdFx0XHQuLi4oa2luZCA9PT0gJ3Nlc3Npb24nID8geyBpbmNyZW1lbnRhbFVzZWQsIHVzZWRFZGl0VHJhY2tlckZhbGxiYWNrIH0gOiB7fSksXG5cdFx0XHRcdH0sIGNsaWVudENvbnRleHQpO1xuXHRcdFx0fVxuXHRcdH07XG5cdFx0dGhpcy5fYWN0aXZlU3RhdGljQ29tcHV0ZXMuYWRkKGNoYW5nZXNldFVyaSk7XG5cdFx0Y29uc3Qgc3RhdHVzQmVmb3JlQ29tcHV0ZSA9IHN0YXR1c0JlZm9yZVJlZnJlc2ggPz8gdGhpcy5fc3RhdGVNYW5hZ2VyLmdldENoYW5nZXNldFN0YXRlKGNoYW5nZXNldFVyaSk/LnN0YXR1cztcblx0XHRsZXQgcmVmOiBSZXR1cm5UeXBlPElTZXNzaW9uRGF0YVNlcnZpY2VbJ29wZW5EYXRhYmFzZSddPjtcblx0XHR0cnkge1xuXHRcdFx0cmVmID0gdGhpcy5fc2Vzc2lvbkRhdGFTZXJ2aWNlLm9wZW5EYXRhYmFzZShVUkkucGFyc2Uoc2Vzc2lvbikpO1xuXHRcdH0gY2F0Y2ggKGVycikge1xuXHRcdFx0dGhpcy5fbG9nU2VydmljZS53YXJuKGBbQWdlbnRIb3N0Q2hhbmdlc2V0U2VydmljZV0gRmFpbGVkIHRvIG9wZW4gc2Vzc2lvbiBkYXRhYmFzZSBmb3IgJHtraW5kfSBkaWZmIGNvbXB1dGF0aW9uOiAke3Nlc3Npb259YCwgZXJyKTtcblx0XHRcdHRoaXMuX3Jlc3RvcmVTdGF0aWNDaGFuZ2VzZXRTdGF0dXMoY2hhbmdlc2V0VXJpLCBzdGF0dXNCZWZvcmVDb21wdXRlKTtcblx0XHRcdHRoaXMuX2FjdGl2ZVN0YXRpY0NvbXB1dGVzLmRlbGV0ZShjaGFuZ2VzZXRVcmkpO1xuXHRcdFx0dGhpcy5fc3RhdGVNYW5hZ2VyLm9uQ2hhbmdlc2V0TGl2ZW5lc3NDaGFuZ2VkKCk7XG5cdFx0XHRvdXRjb21lID0gJ2RiT3BlbkZhaWxlZCc7XG5cdFx0XHRlbWl0U3RhdGljVGVsZW1ldHJ5KCk7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdHRoaXMuX3N0YXRlTWFuYWdlci5yZWdpc3RlckNoYW5nZXNldChjaGFuZ2VzZXRVcmkpO1xuXHRcdHRyeSB7XG5cdFx0XHRsZXQgZGlmZnMgPSBhd2FpdCB0aGlzLl90cnlDb21wdXRlR2l0RGlmZnMoc2Vzc2lvbiwgcmVmLm9iamVjdCwga2luZCk7XG5cdFx0XHRpZiAoIWRpZmZzKSB7XG5cdFx0XHRcdGlmIChraW5kID09PSAnYnJhbmNoJykge1xuXHRcdFx0XHRcdC8vIEJyYW5jaCBjaGFuZ2VzZXQgYW5zd2VycyBhIGRpZmZlcmVudCBxdWVzdGlvbiB0aGFuIHRoZVxuXHRcdFx0XHRcdC8vIGVkaXQtdHJhY2tlciBhZ2dyZWdhdG9yIFx1MjAxNCBkbyBub3QgZmFsbCBiYWNrLiBQcmVzZXJ2ZVxuXHRcdFx0XHRcdC8vIHdoYXRldmVyIGNhY2hlZCBzdGF0ZSBpcyBhbHJlYWR5IHRoZXJlLlxuXHRcdFx0XHRcdC8vXG5cdFx0XHRcdFx0Ly8gVGhlIG11bHRpLWZvbGRlciBgc3VtbWFyeS5jaGFuZ2VzYCBhZ2dyZWdhdGUgaXMgY29tcHV0ZWRcblx0XHRcdFx0XHQvLyBJTkRFUEVOREVOVExZIG9mIHRoZSBwcmltYXJ5IGJyYW5jaCBjaGFuZ2VzZXQgKGl0IHJlLWRpZmZzXG5cdFx0XHRcdFx0Ly8gZXZlcnkgZm9sZGVyIGl0c2VsZiksIHNvIHJlZnJlc2ggaXQgaGVyZSBldmVuIHRob3VnaCB0aGVcblx0XHRcdFx0XHQvLyBwcmltYXJ5IGJyYW5jaCBkaWZmIGlzIHVuYXZhaWxhYmxlIFx1MjAxNCBvdGhlcndpc2UgYSBwcmltYXJ5XG5cdFx0XHRcdFx0Ly8gZm9sZGVyIHdpdGhvdXQgYSByZXNvbHZhYmxlIGRpZmYgd291bGQgc3VwcHJlc3MgdGhlIHdob2xlXG5cdFx0XHRcdFx0Ly8gYWxsLWZvbGRlciBjb3VudC5cblx0XHRcdFx0XHRjb25zdCB3b3JraW5nRGlyZWN0b3JpZXMgPSB0aGlzLl9jb25maWd1cmF0aW9uU2VydmljZS5nZXRFZmZlY3RpdmVXb3JraW5nRGlyZWN0b3JpZXMoc2Vzc2lvbik7XG5cdFx0XHRcdFx0aWYgKGlzTXVsdGlSb290U2Vzc2lvbih3b3JraW5nRGlyZWN0b3JpZXMpKSB7XG5cdFx0XHRcdFx0XHRhd2FpdCB0aGlzLl91cGRhdGVNdWx0aUZvbGRlckNoYW5nZXNTdW1tYXJ5KHNlc3Npb24sIHJlZi5vYmplY3QsIHdvcmtpbmdEaXJlY3RvcmllcyEpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLmRlYnVnKGBbQWdlbnRIb3N0Q2hhbmdlc2V0U2VydmljZV0gQnJhbmNoIGdpdCBkaWZmIHVuYXZhaWxhYmxlIGZvciAke3Nlc3Npb259OyBwcmVzZXJ2aW5nIGNhY2hlZCBjaGFuZ2VzZXQuIHByZXZpb3VzU3RhdHVzPSR7c3RhdHVzQmVmb3JlQ29tcHV0ZSA/PyAndW5rbm93bid9IGNhY2hlZEZpbGVzPSR7dGhpcy5fc3RhdGVNYW5hZ2VyLmdldENoYW5nZXNldFN0YXRlKGNoYW5nZXNldFVyaSk/LmZpbGVzLmxlbmd0aCA/PyAwfWApO1xuXHRcdFx0XHRcdHRoaXMuX3Jlc3RvcmVTdGF0aWNDaGFuZ2VzZXRTdGF0dXMoY2hhbmdlc2V0VXJpLCBzdGF0dXNCZWZvcmVDb21wdXRlKTtcblx0XHRcdFx0XHRvdXRjb21lID0gJ3ByZXNlcnZlZCc7XG5cdFx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0XHR9XG5cdFx0XHRcdC8vIGBzZXNzaW9uYCBraW5kOiB3b3JraW5nLXRyZWUgZ2l0IGlzIHVuYXZhaWxhYmxlIChub1xuXHRcdFx0XHQvLyB3b3JraW5nIGRpciBvciBub3QgYSBnaXQgd29yayB0cmVlKS4gRmFsbCBiYWNrIHRvIHRoZVxuXHRcdFx0XHQvLyBlZGl0LXRyYWNrZXIgYWdncmVnYXRvciBcdTIwMTQgZm9yIHRoZSBzZXNzaW9uIGNoYW5nZXNldCB0aGVcblx0XHRcdFx0Ly8gU0RLLXRyYWNrZWQgZWRpdHMgYXJlIHRoZSBiZXN0IGF2YWlsYWJsZSBhcHByb3hpbWF0aW9uLlxuXHRcdFx0XHQvL1xuXHRcdFx0XHQvLyBJbiBtdWx0aS1jaGF0IHNlc3Npb25zIGVhY2ggcGVlciBjaGF0IHJlY29yZHMgaXRzIGZpbGVcblx0XHRcdFx0Ly8gZWRpdHMgaW50byBpdHMgT1dOIGRhdGFiYXNlICh0aGUgY2hhdCBVUkkgaXMgdXNlZCBhcyB0aGVcblx0XHRcdFx0Ly8gc2Vzc2lvbiBVUkkgZm9yIHRoYXQgY2hhdCdzIGVkaXQgdHJhY2tlcikuIFVuaW9uIHRoZVxuXHRcdFx0XHQvLyBzZXNzaW9uIERCIHdpdGggZXZlcnkgcGVlciBjaGF0IERCIHNvIHBlZXItY2hhdCBlZGl0cyByb2xsXG5cdFx0XHRcdC8vIHVwIGludG8gdGhlIHNlc3Npb24tbGV2ZWwgY2hhbmdlcy5cblx0XHRcdFx0dXNlZEVkaXRUcmFja2VyRmFsbGJhY2sgPSB0cnVlO1xuXHRcdFx0XHRjb25zdCBwZWVyU291cmNlcyA9IHRoaXMuX29wZW5QZWVyQ2hhdFNvdXJjZXMoc2Vzc2lvbik7XG5cdFx0XHRcdHRyeSB7XG5cdFx0XHRcdFx0aWYgKHBlZXJTb3VyY2VzLmxlbmd0aCA+IDApIHtcblx0XHRcdFx0XHRcdGNvbnN0IHNvdXJjZXM6IElTZXNzaW9uRGlmZlNvdXJjZVtdID0gW1xuXHRcdFx0XHRcdFx0XHR7IHNlc3Npb25Vcmk6IHNlc3Npb24sIGRiOiByZWYub2JqZWN0IH0sXG5cdFx0XHRcdFx0XHRcdC4uLnBlZXJTb3VyY2VzLm1hcChwID0+ICh7IHNlc3Npb25Vcmk6IHAuc2Vzc2lvblVyaSwgZGI6IHAucmVmLm9iamVjdCB9KSksXG5cdFx0XHRcdFx0XHRdO1xuXHRcdFx0XHRcdFx0Ly8gVE9ETyAoZGVidCk6IG11bHRpLWNoYXQgYWx3YXlzIGRvZXMgYSBmdWxsIHJlY29tcHV0ZVxuXHRcdFx0XHRcdFx0Ly8gKHRoZSBpbmNyZW1lbnRhbCBgY2hhbmdlZFR1cm5JZGAvYHByZXZpb3VzRGlmZnNgIHBhdGggaXNcblx0XHRcdFx0XHRcdC8vIG9ubHkgdXNlZCBmb3Igc2luZ2xlLWNoYXQgYmVsb3cpLiBBIGZvbGxvdy11cCBjYW4gbWFrZVxuXHRcdFx0XHRcdFx0Ly8gYGNvbXB1dGVVbmlvbmVkRGlmZnNgIGluY3JlbWVudGFsIFx1MjAxNCBzZWUgaXRzIGRvYyBjb21tZW50XG5cdFx0XHRcdFx0XHQvLyBhbmQgdGhlIHRyYWNraW5nIGlzc3VlLlxuXHRcdFx0XHRcdFx0ZGlmZnMgPSBhd2FpdCBjb21wdXRlVW5pb25lZERpZmZzKHNvdXJjZXMsIHRoaXMuX2RpZmZDb21wdXRlU2VydmljZSk7XG5cdFx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRcdGxldCBpbmNyZW1lbnRhbDogSUluY3JlbWVudGFsRGlmZk9wdGlvbnMgfCB1bmRlZmluZWQ7XG5cdFx0XHRcdFx0XHRpZiAoY2hhbmdlZFR1cm5JZCkge1xuXHRcdFx0XHRcdFx0XHRjb25zdCBwcmV2aW91c0RpZmZzID0gdGhpcy5fcmVhZFByZXZpb3VzQ2hhbmdlc2V0RGlmZnMoY2hhbmdlc2V0VXJpKTtcblx0XHRcdFx0XHRcdFx0aWYgKHByZXZpb3VzRGlmZnMpIHtcblx0XHRcdFx0XHRcdFx0XHRpbmNyZW1lbnRhbCA9IHsgY2hhbmdlZFR1cm5JZCwgcHJldmlvdXNEaWZmczogWy4uLnByZXZpb3VzRGlmZnNdIH07XG5cdFx0XHRcdFx0XHRcdFx0aW5jcmVtZW50YWxVc2VkID0gdHJ1ZTtcblx0XHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0ZGlmZnMgPSBhd2FpdCBjb21wdXRlU2Vzc2lvbkRpZmZzKHNlc3Npb24sIHJlZi5vYmplY3QsIHRoaXMuX2RpZmZDb21wdXRlU2VydmljZSwgaW5jcmVtZW50YWwpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fSBmaW5hbGx5IHtcblx0XHRcdFx0XHRmb3IgKGNvbnN0IHBlZXIgb2YgcGVlclNvdXJjZXMpIHtcblx0XHRcdFx0XHRcdHBlZXIucmVmLmRpc3Bvc2UoKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdH1cblxuXHRcdFx0Y29uc3QgcmV2aWV3ZWQgPSBraW5kID09PSBDaGFuZ2VzZXRLaW5kLkJyYW5jaFxuXHRcdFx0XHQ/IGF3YWl0IHRoaXMuX2NvbXB1dGVSZXZpZXdlZEluZm8oc2Vzc2lvbiwgcmVmLm9iamVjdClcblx0XHRcdFx0OiB1bmRlZmluZWQ7XG5cdFx0XHR0aGlzLl9wdWJsaXNoQ2hhbmdlc2V0RGlmZnMoc2Vzc2lvbiwgY2hhbmdlc2V0VXJpLCBkaWZmcywgcmV2aWV3ZWQpO1xuXHRcdFx0ZmlsZUNvdW50ID0gZGlmZnMubGVuZ3RoO1xuXHRcdFx0b3V0Y29tZSA9ICdjb21wdXRlZCc7XG5cblx0XHRcdC8vIFBlcnNpc3QgdGhlIGZpbGUgbGlzdCBzbyBhIHN1YnNlcXVlbnQgYGxpc3RTZXNzaW9uc2AgL1xuXHRcdFx0Ly8gYHJlc3RvcmVTZXNzaW9uYCBjYW4gcmVzZWVkIHRoZSBjaGFuZ2VzZXQgYmVmb3JlIHRoZSBmaXJzdFxuXHRcdFx0Ly8gcG9zdC1yZXN0YXJ0IGNvbXB1dGUgY29tcGxldGVzLlxuXHRcdFx0dGhpcy5fcGVyc2lzdFNlc3Npb25GbGFnKHNlc3Npb24sIHBlcnNpc3RLZXlGb3Ioa2luZCksIEpTT04uc3RyaW5naWZ5KGRpZmZzKSk7XG5cblx0XHRcdGlmIChraW5kID09PSBDaGFuZ2VzZXRLaW5kLkJyYW5jaCkge1xuXHRcdFx0XHQvLyBNaWdyYXRpb246IGFsc28gb3ZlcndyaXRlIHRoZSBsZWdhY3kgYCdkaWZmcydgIGtleSB3aXRoIHRoZVxuXHRcdFx0XHQvLyBzZXNzaW9uLWNoYW5nZXNldCBwYXlsb2FkIHNvIG9sZGVyIHJlYWRlcnMgc3RheSBjb3JyZWN0XG5cdFx0XHRcdC8vIGR1cmluZyB0aGUgcm9sbG91dCB3aW5kb3cuXG5cdFx0XHRcdHRoaXMuX3BlcnNpc3RTZXNzaW9uRmxhZyhzZXNzaW9uLCBNRVRBX0xFR0FDWV9ESUZGUywgSlNPTi5zdHJpbmdpZnkoZGlmZnMpKTtcblxuXHRcdFx0XHQvLyBPd24gdGhlIGBzdW1tYXJ5LmNoYW5nZXNgIGFnZ3JlZ2F0ZSBieSBzZXNzaW9uIHNoYXBlOlxuXHRcdFx0XHQvL1xuXHRcdFx0XHQvLyAtIFNJTkdMRS1mb2xkZXI6IGRlcml2ZSBpdCBmcm9tIHRoZSBwcmltYXJ5IGJyYW5jaCBgZGlmZnNgLFxuXHRcdFx0XHQvLyAgIGV4YWN0bHkgYXMgYmVmb3JlIFx1MjAxNCB0aGF0IGJyYW5jaCBjaGFuZ2VzZXQgSVMgdGhlIHdob2xlXG5cdFx0XHRcdC8vICAgc2Vzc2lvbiBmb290cHJpbnQuIFRoZSBzZXNzaW9uLWxpc3QgY2hpcCBhbmQgdGhlXG5cdFx0XHRcdC8vICAgaW5hY3RpdmUtc2Vzc2lvbiBhZ2dyZWdhdGUgKGBjb21wdXRlTGlzdEVudHJ5Q2hhbmdlc2ApIHJlYWQgdGhlXG5cdFx0XHRcdC8vICAgYnJhbmNoIGNoYW5nZXNldCwgYXMgZG9lcyB0aGUgYWN0aXZlIHNlc3Npb24gdmlldywgc28gc291cmNpbmdcblx0XHRcdFx0Ly8gICB0aGUgcGVyc2lzdGVkIHN1bW1hcnkgZnJvbSB0aGUgc2FtZSBwbGFjZSBrZWVwcyB0aGUgY291bnQgc3RhYmxlXG5cdFx0XHRcdC8vICAgYWNyb3NzIHRoZSBhY3RpdmUgPC0+IGluYWN0aXZlIHRyYW5zaXRpb24uXG5cdFx0XHRcdC8vIC0gTVVMVEktZm9sZGVyOiB0aGUgcHJpbWFyeS1vbmx5IGBkaWZmc2AgdW5kZXItY291bnQgdGhlIHNlc3Npb24sXG5cdFx0XHRcdC8vICAgc28gZG8gTk9UIHdyaXRlIHRoZSBzdW1tYXJ5IGhlcmUuIFJlY29tcHV0ZSB0aGUgQUxMLUZPTERFUlxuXHRcdFx0XHQvLyAgIGFnZ3JlZ2F0ZSBpbmRlcGVuZGVudGx5IGZyb20gZXZlcnkgcmVwb3NpdG9yeSdzIGJyYW5jaCBkaWZmIHNvIGFcblx0XHRcdFx0Ly8gICBzdWJzZXF1ZW50IGJyYW5jaCByZWNvbXB1dGUga2VlcHMgdGhlIGFsbC1mb2xkZXIgY291bnQgaW5zdGVhZCBvZlxuXHRcdFx0XHQvLyAgIGNsb2JiZXJpbmcgaXQgYmFjayB0byB0aGUgcHJpbWFyeSBmb2xkZXIncy4gVGhlIGJyYW5jaCBDSEFOR0VTRVRcblx0XHRcdFx0Ly8gICBzdGF0ZSBpcyBzdGlsbCBwdWJsaXNoZWQgZnJvbSB0aGUgcHJpbWFyeSBgZGlmZnNgIGFib3ZlIChkYXRhXG5cdFx0XHRcdC8vICAgdW5jaGFuZ2VkKTsgb25seSB0aGUgc3VtbWFyeSBvd25lcnNoaXAgbW92ZXMuXG5cdFx0XHRcdGNvbnN0IHdvcmtpbmdEaXJlY3RvcmllcyA9IHRoaXMuX2NvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldEVmZmVjdGl2ZVdvcmtpbmdEaXJlY3RvcmllcyhzZXNzaW9uKTtcblx0XHRcdFx0aWYgKGlzTXVsdGlSb290U2Vzc2lvbih3b3JraW5nRGlyZWN0b3JpZXMpKSB7XG5cdFx0XHRcdFx0Ly8gUmV1c2UgdGhlIHByaW1hcnkgYnJhbmNoIGBkaWZmc2AganVzdCBjb21wdXRlZCBhYm92ZSBzbyB0aGVcblx0XHRcdFx0XHQvLyBzdW1tYXJ5IGRvZXNuJ3QgcmUtZGlmZiB0aGUgcHJpbWFyeSByZXBvIChwZXJmOiBvbmUgZmV3ZXIgZ2l0XG5cdFx0XHRcdFx0Ly8gZGlmZiBwZXIgYnJhbmNoIHJlY29tcHV0ZSkuXG5cdFx0XHRcdFx0YXdhaXQgdGhpcy5fdXBkYXRlTXVsdGlGb2xkZXJDaGFuZ2VzU3VtbWFyeShzZXNzaW9uLCByZWYub2JqZWN0LCB3b3JraW5nRGlyZWN0b3JpZXMhLCBkaWZmcyk7XG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0Y29uc3QgY2hhbmdlc1N1bW1hcnkgPSBzdW1tYXJpc2VEaWZmcyhkaWZmcykgPz8geyBhZGRpdGlvbnM6IDAsIGRlbGV0aW9uczogMCwgZmlsZXM6IDAgfTtcblx0XHRcdFx0XHR0aGlzLnBlcnNpc3RDaGFuZ2VzU3VtbWFyeShzZXNzaW9uLCBjaGFuZ2VzU3VtbWFyeSk7XG5cdFx0XHRcdFx0dGhpcy5fc3RhdGVNYW5hZ2VyLnNldFNlc3Npb25TdW1tYXJ5Q2hhbmdlcyhzZXNzaW9uLCBjaGFuZ2VzU3VtbWFyeSk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9IGNhdGNoIChlcnIpIHtcblx0XHRcdHRoaXMuX2xvZ1NlcnZpY2Uud2FybihgW0FnZW50SG9zdENoYW5nZXNldFNlcnZpY2VdIEZhaWxlZCB0byBjb21wdXRlICR7a2luZH0gZGlmZnNgLCBlcnIpO1xuXHRcdFx0dGhpcy5fc3RhdGVNYW5hZ2VyLmRpc3BhdGNoU2VydmVyQWN0aW9uKGNoYW5nZXNldFVyaSwge1xuXHRcdFx0XHR0eXBlOiBBY3Rpb25UeXBlLkNoYW5nZXNldFN0YXR1c0NoYW5nZWQsXG5cdFx0XHRcdHN0YXR1czogQ2hhbmdlc2V0U3RhdHVzLkVycm9yLFxuXHRcdFx0XHRlcnJvcjogeyBlcnJvclR5cGU6ICdjb21wdXRlRmFpbGVkJywgbWVzc2FnZTogZXJyIGluc3RhbmNlb2YgRXJyb3IgPyBlcnIubWVzc2FnZSA6IFN0cmluZyhlcnIpIH0sXG5cdFx0XHR9KTtcblx0XHRcdG91dGNvbWUgPSAnZXJyb3InO1xuXHRcdH0gZmluYWxseSB7XG5cdFx0XHR0aGlzLl9hY3RpdmVTdGF0aWNDb21wdXRlcy5kZWxldGUoY2hhbmdlc2V0VXJpKTtcblx0XHRcdHRoaXMuX3N0YXRlTWFuYWdlci5vbkNoYW5nZXNldExpdmVuZXNzQ2hhbmdlZCgpO1xuXHRcdFx0cmVmLmRpc3Bvc2UoKTtcblx0XHRcdGVtaXRTdGF0aWNUZWxlbWV0cnkoKTtcblx0XHR9XG5cdH1cblxuXHQvKipcblx0ICogUmVmcmVzaCByZXF1ZXN0cyBvcHRpbWlzdGljYWxseSBtYXJrIHN0YXRpYyBjaGFuZ2VzZXRzIGFzIENvbXB1dGluZ1xuXHQgKiB3aGlsZSBwcmVzZXJ2aW5nIHRoZWlyIGN1cnJlbnQgZmlsZXMuIFNvbWUgcmVmcmVzaCBwYXRocyBpbnRlbnRpb25hbGx5XG5cdCAqIGRvIG5vdCBwdWJsaXNoIGEgcmVwbGFjZW1lbnQgZmlsZSBsaXN0IChmb3IgZXhhbXBsZSwgdW5jb21taXR0ZWQgZ2l0XG5cdCAqIGRpZmYgaXMgdGVtcG9yYXJpbHkgdW5hdmFpbGFibGUpLCBzbyByZXN0b3JlIHRoZSBwcmV2aW91cyBub24tY29tcHV0aW5nXG5cdCAqIHN0YXR1cyBpbnN0ZWFkIG9mIGxlYXZpbmcgYSBzdGFsZSBjYWNoZWQgc25hcHNob3Qgc3R1Y2sgYXMgQ29tcHV0aW5nLlxuXHQgKi9cblx0cHJpdmF0ZSBfcmVzdG9yZVN0YXRpY0NoYW5nZXNldFN0YXR1cyhjaGFuZ2VzZXRVcmk6IFByb3RvY29sVVJJLCBzdGF0dXM6IENoYW5nZXNldFN0YXR1cyB8IHVuZGVmaW5lZCk6IHZvaWQge1xuXHRcdGlmICghc3RhdHVzIHx8IHN0YXR1cyA9PT0gQ2hhbmdlc2V0U3RhdHVzLkNvbXB1dGluZykge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHR0aGlzLl9zdGF0ZU1hbmFnZXIuZGlzcGF0Y2hTZXJ2ZXJBY3Rpb24oY2hhbmdlc2V0VXJpLCB7XG5cdFx0XHR0eXBlOiBBY3Rpb25UeXBlLkNoYW5nZXNldFN0YXR1c0NoYW5nZWQsXG5cdFx0XHRzdGF0dXMsXG5cdFx0fSk7XG5cdH1cblxuXHQvKipcblx0ICogUmVhZHMgdGhlIHByZXZpb3VzIGRpZmYgbGlzdCBiYWNrIG91dCBvZiB0aGUgY2hhbmdlc2V0IHN0YXRlIHNvIHRoZVxuXHQgKiBpbmNyZW1lbnRhbCBhZ2dyZWdhdG9yIGNhbiBhdm9pZCByZWNvbXB1dGluZyBmaWxlcyB0aGF0IGhhdmVuJ3Rcblx0ICogY2hhbmdlZC5cblx0ICovXG5cdHByaXZhdGUgX3JlYWRQcmV2aW91c0NoYW5nZXNldERpZmZzKGNoYW5nZXNldFVyaTogUHJvdG9jb2xVUkkpOiByZWFkb25seSBJU2Vzc2lvbkZpbGVEaWZmW10gfCB1bmRlZmluZWQge1xuXHRcdGNvbnN0IHN0YXRlID0gdGhpcy5fc3RhdGVNYW5hZ2VyLmdldENoYW5nZXNldFN0YXRlKGNoYW5nZXNldFVyaSk7XG5cdFx0aWYgKCFzdGF0ZSB8fCBzdGF0ZS5maWxlcy5sZW5ndGggPT09IDApIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXHRcdHJldHVybiBzdGF0ZS5maWxlcy5tYXAoZiA9PiBmLmVkaXQpO1xuXHR9XG5cblx0LyoqXG5cdCAqIFRyYW5zbGF0ZXMgdGhlIG5ldyBmaWxlIGxpc3QgaW50byBhIHNlcXVlbmNlIG9mIGNoYW5nZXNldC8qIGFjdGlvbnNcblx0ICogKGZpbGVTZXQsIGZpbGVSZW1vdmVkKSBhbmQgbW92ZXMgdGhlIGNoYW5nZXNldCB0byBgcmVhZHlgIG9uY2UgdGhlXG5cdCAqIGZyZXNoIGZpbGUgbGlzdCBoYXMgYmVlbiBhcHBsaWVkLlxuXHQgKi9cblx0cHJpdmF0ZSBfcHVibGlzaENoYW5nZXNldERpZmZzKHNlc3Npb246IFByb3RvY29sVVJJLCBjaGFuZ2VzZXRVcmk6IFByb3RvY29sVVJJLCBkaWZmczogcmVhZG9ubHkgSVNlc3Npb25GaWxlRGlmZltdLCByZXZpZXdlZD86IHsgcmVhZG9ubHkgcmVwb1Jvb3Q6IFVSSTsgcmVhZG9ubHkgcGF0aHM6IFJlYWRvbmx5U2V0PHN0cmluZz4gfSk6IHZvaWQge1xuXHRcdC8vIEdldCB0aGUgYXZhaWxhYmxlIG9wZXJhdGlvbnMgZm9yIHRoaXMgY2hhbmdlc2V0LiBUaGlzIGNhbGwgYXNzdW1lcyB0aGF0IGF0IHRoaXMgcG9pbnRcblx0XHQvLyB0aGUgZ2l0IHN0YXRlIG9mIHRoZSBzZXNzaW9uIGlzIHVwLXRvLWRhdGUgYXMgaXQgaXMgYmVpbmcgdXNlZCB0byBkZXRlcm1pbmUgdGhlIGF2YWlsYWJsZVxuXHRcdC8vIG9wZXJhdGlvbnMuIExvbmcgdGVybSB0aGlzIHNob3VsZCBiZSByZXBsYWNlZCB3aXRoIGEgbW9yZSByb2J1c3QgbWVjaGFuaXNtLlxuXHRcdGNvbnN0IG9wZXJhdGlvbnMgPSB0aGlzLl9jaGFuZ2VzZXRPcGVyYXRpb25TZXJ2aWNlLmdldE9wZXJhdGlvbnMoc2Vzc2lvbiwgY2hhbmdlc2V0VXJpKTtcblxuXHRcdGNvbnN0IGZpbGVzOiBDaGFuZ2VzZXRGaWxlW10gPSBbXTtcblx0XHRmb3IgKGNvbnN0IGVkaXQgb2YgZGlmZnMpIHtcblx0XHRcdGNvbnN0IGlkID0gZWRpdC5hZnRlcj8udXJpID8/IGVkaXQuYmVmb3JlPy51cmk7XG5cdFx0XHRpZiAoIWlkKSB7XG5cdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0fVxuXHRcdFx0aWYgKHJldmlld2VkKSB7XG5cdFx0XHRcdGNvbnN0IHJlbFBhdGggPSByZWxhdGl2ZVBhdGgocmV2aWV3ZWQucmVwb1Jvb3QsIFVSSS5wYXJzZShpZCkpO1xuXHRcdFx0XHRmaWxlcy5wdXNoKHtcblx0XHRcdFx0XHRpZCwgZWRpdCxcblx0XHRcdFx0XHRyZXZpZXdlZDogcmVsUGF0aFxuXHRcdFx0XHRcdFx0PyByZXZpZXdlZC5wYXRocy5oYXMocmVsUGF0aClcblx0XHRcdFx0XHRcdDogZmFsc2Vcblx0XHRcdFx0fSk7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRmaWxlcy5wdXNoKHsgaWQsIGVkaXQgfSk7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0dGhpcy5fc3RhdGVNYW5hZ2VyLmRpc3BhdGNoU2VydmVyQWN0aW9uKGNoYW5nZXNldFVyaSwge1xuXHRcdFx0dHlwZTogQWN0aW9uVHlwZS5DaGFuZ2VzZXRDb250ZW50Q2hhbmdlZCxcblx0XHRcdGZpbGVzLFxuXHRcdFx0b3BlcmF0aW9uczogb3BlcmF0aW9uc1xuXHRcdFx0XHQ/IFsuLi5vcGVyYXRpb25zXVxuXHRcdFx0XHQ6IHVuZGVmaW5lZCxcblx0XHR9KTtcblxuXHRcdC8vIE1vdmUgdGhlIGNoYW5nZXNldCBvdXQgb2YgYGNvbXB1dGluZ2AgKG9yIG91dCBvZiBhbiBlYXJsaWVyIGVycm9yKVxuXHRcdC8vIG5vdyB0aGF0IHdlIGhhdmUgYSBmcmVzaCwgY29tcGxldGUgZmlsZSBsaXN0LlxuXHRcdGNvbnN0IHN0YXR1cyA9IHRoaXMuX3N0YXRlTWFuYWdlci5nZXRDaGFuZ2VzZXRTdGF0ZShjaGFuZ2VzZXRVcmkpPy5zdGF0dXM7XG5cdFx0aWYgKHN0YXR1cyAhPT0gQ2hhbmdlc2V0U3RhdHVzLlJlYWR5KSB7XG5cdFx0XHR0aGlzLl9zdGF0ZU1hbmFnZXIuZGlzcGF0Y2hTZXJ2ZXJBY3Rpb24oY2hhbmdlc2V0VXJpLCB7XG5cdFx0XHRcdHR5cGU6IEFjdGlvblR5cGUuQ2hhbmdlc2V0U3RhdHVzQ2hhbmdlZCxcblx0XHRcdFx0c3RhdHVzOiBDaGFuZ2VzZXRTdGF0dXMuUmVhZHksXG5cdFx0XHR9KTtcblx0XHR9XG5cdH1cblxuXHQvKipcblx0ICogT3BlbnMgdGhlIGRhdGFiYXNlcyBmb3IgZXZlcnkgbm9uLWRlZmF1bHQgKHBlZXIpIGNoYXQgaW4gYSBtdWx0aS1jaGF0XG5cdCAqIHNlc3Npb24uIEVhY2ggcGVlciBjaGF0IHJlY29yZHMgaXRzIGZpbGUgZWRpdHMgaW50byBpdHMgb3duIGRhdGFiYXNlXG5cdCAqIGtleWVkIGJ5IHRoZSBjaGF0IFVSSSwgc28gdGhlIHNlc3Npb24gY2hhbmdlc2V0IG11c3QgdW5pb24gdGhvc2Vcblx0ICogZGF0YWJhc2VzIHdpdGggdGhlIHNlc3Npb24gREIuIFJldHVybnMgYW4gZW1wdHkgYXJyYXkgZm9yIHNpbmdsZS1jaGF0XG5cdCAqIHNlc3Npb25zLiBDYWxsZXJzIE1VU1QgZGlzcG9zZSBldmVyeSByZXR1cm5lZCBgcmVmYC5cblx0ICovXG5cdHByaXZhdGUgX29wZW5QZWVyQ2hhdFNvdXJjZXMoc2Vzc2lvbjogUHJvdG9jb2xVUkkpOiB7IHNlc3Npb25Vcmk6IFByb3RvY29sVVJJOyByZWY6IFJldHVyblR5cGU8SVNlc3Npb25EYXRhU2VydmljZVsnb3BlbkRhdGFiYXNlJ10+IH1bXSB7XG5cdFx0Y29uc3QgY2hhdHMgPSB0aGlzLl9zdGF0ZU1hbmFnZXIuZ2V0U2Vzc2lvblN0YXRlKHNlc3Npb24pPy5jaGF0cyA/PyBbXTtcblx0XHRjb25zdCBzb3VyY2VzOiB7IHNlc3Npb25Vcmk6IFByb3RvY29sVVJJOyByZWY6IFJldHVyblR5cGU8SVNlc3Npb25EYXRhU2VydmljZVsnb3BlbkRhdGFiYXNlJ10+IH1bXSA9IFtdO1xuXHRcdGZvciAoY29uc3QgY2hhdCBvZiBjaGF0cykge1xuXHRcdFx0aWYgKGlzRGVmYXVsdENoYXRVcmkoY2hhdC5yZXNvdXJjZSkpIHtcblx0XHRcdFx0Y29udGludWU7XG5cdFx0XHR9XG5cdFx0XHR0cnkge1xuXHRcdFx0XHRjb25zdCByZWYgPSB0aGlzLl9zZXNzaW9uRGF0YVNlcnZpY2Uub3BlbkRhdGFiYXNlKFVSSS5wYXJzZShjaGF0LnJlc291cmNlKSk7XG5cdFx0XHRcdHNvdXJjZXMucHVzaCh7IHNlc3Npb25Vcmk6IGNoYXQucmVzb3VyY2UsIHJlZiB9KTtcblx0XHRcdH0gY2F0Y2ggKGVycikge1xuXHRcdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLndhcm4oYFtBZ2VudEhvc3RDaGFuZ2VzZXRTZXJ2aWNlXSBGYWlsZWQgdG8gb3BlbiBwZWVyIGNoYXQgZGF0YWJhc2UgZm9yIHNlc3Npb24gY2hhbmdlczogJHtjaGF0LnJlc291cmNlfWAsIGVycik7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdHJldHVybiBzb3VyY2VzO1xuXHR9XG5cblx0LyoqXG5cdCAqIFJldHVybnMgdGhlIHR1cm4gaWQgd2hvc2UgY2hlY2twb2ludCBiZXN0IHJlcHJlc2VudHMgdGhlIGxhdGVzdCBzdGF0ZSBvZlxuXHQgKiB0aGUgc2Vzc2lvbidzIHNoYXJlZCB3b3JraW5nIHRyZWUuIEZvciBzaW5nbGUtY2hhdCBzZXNzaW9ucyB0aGlzIGlzIHRoZVxuXHQgKiBkZWZhdWx0IGNoYXQncyBsYXN0IHR1cm4uIEZvciBtdWx0aS1jaGF0IHNlc3Npb25zIGl0IGlzIHRoZSBsYXN0IHR1cm4gb2Zcblx0ICogdGhlIG1vc3QtcmVjZW50bHktbW9kaWZpZWQgY2hhdCAocGVlci1jaGF0IHR1cm4gY2hlY2twb2ludHMgYXJlIHN0b3JlZFxuXHQgKiB1bmRlciB0aGUgc2Vzc2lvbiBVUkkga2V5ZWQgYnkgdGhlaXIgdHVybiBpZCkuIFJldHVybnMgYHVuZGVmaW5lZGAgd2hlblxuXHQgKiBubyBjaGF0IGhhcyBhbnkgdHVybnMuXG5cdCAqL1xuXHRwcml2YXRlIF9sYXRlc3RUdXJuSWRBY3Jvc3NDaGF0cyhzZXNzaW9uOiBQcm90b2NvbFVSSSk6IHN0cmluZyB8IHVuZGVmaW5lZCB7XG5cdFx0Y29uc3Qgc2Vzc2lvblN0YXRlID0gdGhpcy5fc3RhdGVNYW5hZ2VyLmdldFNlc3Npb25TdGF0ZShzZXNzaW9uKTtcblx0XHRpZiAoIXNlc3Npb25TdGF0ZSkge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cblx0XHRjb25zdCBjaGF0cyA9IHNlc3Npb25TdGF0ZS5jaGF0cyA/PyBbXTtcblx0XHRpZiAoY2hhdHMubGVuZ3RoIDw9IDEpIHtcblx0XHRcdHJldHVybiBzZXNzaW9uU3RhdGUudHVybnMuYXQoLTEpPy5pZDtcblx0XHR9XG5cblx0XHRsZXQgYmVzdFR1cm5JZDogc3RyaW5nIHwgdW5kZWZpbmVkO1xuXHRcdGxldCBiZXN0TW9kaWZpZWRBdCA9ICcnO1xuXHRcdGZvciAoY29uc3QgY2hhdCBvZiBjaGF0cykge1xuXHRcdFx0Y29uc3QgdHVybnMgPSBpc0RlZmF1bHRDaGF0VXJpKGNoYXQucmVzb3VyY2UpXG5cdFx0XHRcdD8gc2Vzc2lvblN0YXRlLnR1cm5zXG5cdFx0XHRcdDogdGhpcy5fc3RhdGVNYW5hZ2VyLmdldENoYXRTdGF0ZShjaGF0LnJlc291cmNlKT8udHVybnM7XG5cdFx0XHRjb25zdCBsYXN0VHVybklkID0gdHVybnM/LmF0KC0xKT8uaWQ7XG5cdFx0XHRpZiAobGFzdFR1cm5JZCAmJiBjaGF0Lm1vZGlmaWVkQXQgPj0gYmVzdE1vZGlmaWVkQXQpIHtcblx0XHRcdFx0YmVzdE1vZGlmaWVkQXQgPSBjaGF0Lm1vZGlmaWVkQXQ7XG5cdFx0XHRcdGJlc3RUdXJuSWQgPSBsYXN0VHVybklkO1xuXHRcdFx0fVxuXHRcdH1cblx0XHRyZXR1cm4gYmVzdFR1cm5JZDtcblx0fVxuXG5cdC8qKlxuXHQgKiBDb21wdXRlcyBkaWZmcyBmb3IgYSBzdGF0aWMgY2hhbmdlc2V0IGJ5IHNoZWxsaW5nIG91dCB0byBnaXQuXG5cdCAqIFJldHVybnMgdGhlIGRpZmYgbGlzdCB3aGVuIHRoZSBzZXNzaW9uIGhhcyBhIHdvcmtpbmcgZGlyZWN0b3J5IGFuZFxuXHQgKiB0aGF0IGRpcmVjdG9yeSBpcyBhIGdpdCB3b3JrIHRyZWU7IHJldHVybnMgYHVuZGVmaW5lZGAgb3RoZXJ3aXNlIHNvXG5cdCAqIHRoZSBjYWxsZXIgY2FuIGZhbGwgYmFjayB0byB0aGUgZWRpdC10cmFja2VyIGFnZ3JlZ2F0b3IgKGZvclxuXHQgKiBga2luZDogJ3Nlc3Npb24nYCkgb3IgcHJlc2VydmUgY2FjaGVkIHN0YXRlIChmb3IgYGtpbmQ6ICdicmFuY2gnYCkuXG5cdCAqXG5cdCAqIEZvciBga2luZDogJ3Nlc3Npb24nYCB0aGUgZGlmZiBpcyBjb21wdXRlZCBiZXR3ZWVuIHRoZSBiYXNlbGluZVxuXHQgKiBjaGVja3BvaW50IHJlZiBhbmQgdGhlIGxhdGVzdCB0dXJuIGNoZWNrcG9pbnQgcmVmLlxuXHQgKiBGb3IgYGtpbmQ6ICdicmFuY2gnYCB0aGUgZGlmZiBpcyBjb21wdXRlZCBhZ2FpbnN0IHRoZSBtZXJnZS1iYXNlXG5cdCAqIHdpdGgge0BsaW5rIE1FVEFfRElGRl9CQVNFX0JSQU5DSH0gd2hlbiBvbmUgaXMgc2V0OyB3aXRob3V0IGEgYmFzZVxuXHQgKiBicmFuY2ggZ2l0IGZhbGxzIGJhY2sgdG8gYEhFQURgLlxuXHQgKi9cblx0cHJpdmF0ZSBhc3luYyBfdHJ5Q29tcHV0ZUdpdERpZmZzKHNlc3Npb246IFByb3RvY29sVVJJLCBkYjogSVNlc3Npb25EYXRhYmFzZSwga2luZDogU3RhdGljQ2hhbmdlc2V0S2luZCk6IFByb21pc2U8cmVhZG9ubHkgSVNlc3Npb25GaWxlRGlmZltdIHwgdW5kZWZpbmVkPiB7XG5cdFx0Y29uc3Qgd29ya2luZ0RpcmVjdG9yeSA9IHRoaXMuX3N0YXRlTWFuYWdlci5nZXRTZXNzaW9uU3RhdGUoc2Vzc2lvbik/LndvcmtpbmdEaXJlY3Rvcmllcz8uWzBdO1xuXHRcdGlmICghd29ya2luZ0RpcmVjdG9yeSkge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cblx0XHRsZXQgd29ya2luZ0RpcmVjdG9yeVVyaTogVVJJO1xuXHRcdHRyeSB7XG5cdFx0XHR3b3JraW5nRGlyZWN0b3J5VXJpID0gVVJJLnBhcnNlKHdvcmtpbmdEaXJlY3RvcnkpO1xuXHRcdH0gY2F0Y2gge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cblx0XHQvLyBTZXNzaW9uXG5cdFx0aWYgKGtpbmQgPT09ICdzZXNzaW9uJykge1xuXHRcdFx0Ly8gR2V0IHNlc3Npb24gY2hlY2twb2ludHMuIEluIG11bHRpLWNoYXQgc2Vzc2lvbnMgdGhlIHdvcmtpbmcgdHJlZVxuXHRcdFx0Ly8gaXMgc2hhcmVkIGFuZCBlYWNoIGNoYXQncyB0dXJuIGNoZWNrcG9pbnRzIGFyZSBzdG9yZWQgdW5kZXIgdGhlXG5cdFx0XHQvLyBzZXNzaW9uIFVSSSBrZXllZCBieSB0aGVpciB0dXJuIGlkLCBzbyB0aGUgbW9zdC1yZWNlbnRseS1tb2RpZmllZFxuXHRcdFx0Ly8gY2hhdCdzIGxhc3QgdHVybiBjYXB0dXJlcyB0aGUgZnVsbCB3b3JraW5nLXRyZWUgZGVsdGEuXG5cdFx0XHRjb25zdCBsYXRlc3RUdXJuSWQgPSB0aGlzLl9sYXRlc3RUdXJuSWRBY3Jvc3NDaGF0cyhzZXNzaW9uKTtcblx0XHRcdGlmICghbGF0ZXN0VHVybklkKSB7XG5cdFx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0XHR9XG5cblx0XHRcdGNvbnN0IHNlc3Npb25VcmkgPSBVUkkucGFyc2Uoc2Vzc2lvbik7XG5cdFx0XHRjb25zdCBbYmFzZWxpbmUsIHBhaXJdID0gYXdhaXQgUHJvbWlzZS5hbGwoW1xuXHRcdFx0XHR0aGlzLl9jaGVja3BvaW50U2VydmljZS5nZXRCYXNlbGluZUNoZWNrcG9pbnQoc2Vzc2lvblVyaSksXG5cdFx0XHRcdHRoaXMuX2NoZWNrcG9pbnRTZXJ2aWNlLmdldFR1cm5DaGVja3BvaW50UGFpcihzZXNzaW9uVXJpLCBsYXRlc3RUdXJuSWQpLFxuXHRcdFx0XSk7XG5cdFx0XHRpZiAoIWJhc2VsaW5lIHx8ICFwYWlyKSB7XG5cdFx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0XHR9XG5cblx0XHRcdHRyeSB7XG5cdFx0XHRcdHJldHVybiBhd2FpdCB0aGlzLl9naXRTZXJ2aWNlLmNvbXB1dGVGaWxlRGlmZnNCZXR3ZWVuUmVmcyh3b3JraW5nRGlyZWN0b3J5VXJpLCB7XG5cdFx0XHRcdFx0c2Vzc2lvblVyaTogc2Vzc2lvbixcblx0XHRcdFx0XHRmcm9tUmVmOiBiYXNlbGluZSxcblx0XHRcdFx0XHR0b1JlZjogcGFpci5jdXJyZW50XG5cdFx0XHRcdH0pO1xuXHRcdFx0fSBjYXRjaCAoZXJyKSB7XG5cdFx0XHRcdHRoaXMuX2xvZ1NlcnZpY2Uud2FybihgW0FnZW50SG9zdENoYW5nZXNldFNlcnZpY2VdIGdpdC1kcml2ZW4gJHtraW5kfSBkaWZmIGNvbXB1dGF0aW9uIGZhaWxlZDsgZmFsbGluZyBiYWNrIHRvIGVkaXQtdHJhY2tlcmAsIGVycik7XG5cdFx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0Ly8gQnJhbmNoXG5cdFx0Y29uc3QgYmFzZUJyYW5jaCA9IGF3YWl0IHRoaXMuX3Jlc29sdmVCcmFuY2hCYXNlQnJhbmNoKHNlc3Npb24sIGRiKTtcblxuXHRcdHRyeSB7XG5cdFx0XHRyZXR1cm4gYXdhaXQgdGhpcy5fZ2l0U2VydmljZS5jb21wdXRlU2Vzc2lvbkZpbGVEaWZmcyh3b3JraW5nRGlyZWN0b3J5VXJpLCB7XG5cdFx0XHRcdHNlc3Npb25Vcmk6IHNlc3Npb24sXG5cdFx0XHRcdGJhc2VCcmFuY2hcblx0XHRcdH0pO1xuXHRcdH0gY2F0Y2ggKGVycikge1xuXHRcdFx0dGhpcy5fbG9nU2VydmljZS53YXJuKGBbQWdlbnRIb3N0Q2hhbmdlc2V0U2VydmljZV0gZ2l0LWRyaXZlbiAke2tpbmR9IGRpZmYgY29tcHV0YXRpb24gZmFpbGVkOyBmYWxsaW5nIGJhY2sgdG8gZWRpdC10cmFja2VyYCwgZXJyKTtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXHR9XG5cblx0LyoqXG5cdCAqIFJlc29sdmVzIHRoZSBCcmFuY2ggQ2hhbmdlcyBiYXNlIGJyYW5jaCwgcmV1c2VkIGJ5IHRoZSBkaWZmIGNvbXB1dGF0aW9uXG5cdCAqIGFuZCB0aGUgcmV2aWV3LXN0YXR1cyBsb29rdXAgc28gYm90aCBhcmUga2V5ZWQgb24gdGhlIHNhbWUgYmFzZWxpbmUuXG5cdCAqL1xuXHRwcml2YXRlIGFzeW5jIF9yZXNvbHZlQnJhbmNoQmFzZUJyYW5jaChzZXNzaW9uOiBQcm90b2NvbFVSSSwgZGI6IElTZXNzaW9uRGF0YWJhc2UpOiBQcm9taXNlPHN0cmluZyB8IHVuZGVmaW5lZD4ge1xuXHRcdGNvbnN0IHBlcnNpc3RlZEJhc2VCcmFuY2ggPSBhd2FpdCBkYi5nZXRNZXRhZGF0YShNRVRBX0RJRkZfQkFTRV9CUkFOQ0gpO1xuXHRcdGNvbnN0IGdpdFN0YXRlQmFzZUJyYW5jaCA9IHJlYWRTZXNzaW9uR2l0U3RhdGUodGhpcy5fc3RhdGVNYW5hZ2VyLmdldFNlc3Npb25TdGF0ZShzZXNzaW9uKT8uX21ldGEpPy5iYXNlQnJhbmNoTmFtZTtcblx0XHRpZiAoIXBlcnNpc3RlZEJhc2VCcmFuY2ggJiYgZ2l0U3RhdGVCYXNlQnJhbmNoKSB7XG5cdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLmRlYnVnKGBbQWdlbnRIb3N0Q2hhbmdlc2V0U2VydmljZV0gVXNpbmcgX21ldGEuZ2l0IGJhc2UgYnJhbmNoIGZhbGxiYWNrIGZvciBCcmFuY2ggQ2hhbmdlcyBpbiAke3Nlc3Npb259OiAke2dpdFN0YXRlQmFzZUJyYW5jaH1gKTtcblx0XHR9XG5cdFx0cmV0dXJuIHJlc29sdmVEaWZmQmFzZUJyYW5jaE5hbWUocGVyc2lzdGVkQmFzZUJyYW5jaCwgZ2l0U3RhdGVCYXNlQnJhbmNoKTtcblx0fVxuXG5cdC8qKlxuXHQgKiBDb21wdXRlcyB0aGUgcmV2aWV3ZWQtcGF0aHMgb3ZlcmxheSBmb3IgdGhlIEJyYW5jaCBjaGFuZ2VzZXQ6IHRoZVxuXHQgKiByZXBvc2l0b3J5IHJvb3QgKHVzZWQgdG8ga2V5IGZpbGUgaWRzIHRvIHJlcG8tcmVsYXRpdmUgcGF0aHMpIGFuZCB0aGUgc2V0XG5cdCAqIG9mIHJldmlld2VkIHJlcG8tcmVsYXRpdmUgcGF0aHMuIFJldHVybnMgYHVuZGVmaW5lZGAgd2hlbiB0aGUgc2Vzc2lvbiBoYXNcblx0ICogbm8gZ2l0IHdvcmtpbmcgZGlyZWN0b3J5IChyZXZpZXcgc3RhdHVzIGlzIHRoZW4gc2ltcGx5IG9taXR0ZWQpLlxuXHQgKi9cblx0cHJpdmF0ZSBhc3luYyBfY29tcHV0ZVJldmlld2VkSW5mbyhzZXNzaW9uOiBQcm90b2NvbFVSSSwgZGI6IElTZXNzaW9uRGF0YWJhc2UpOiBQcm9taXNlPHsgcmVhZG9ubHkgcmVwb1Jvb3Q6IFVSSTsgcmVhZG9ubHkgcGF0aHM6IFJlYWRvbmx5U2V0PHN0cmluZz4gfSB8IHVuZGVmaW5lZD4ge1xuXHRcdGNvbnN0IHdvcmtpbmdEaXJlY3RvcnkgPSB0aGlzLl9zdGF0ZU1hbmFnZXIuZ2V0U2Vzc2lvblN0YXRlKHNlc3Npb24pPy53b3JraW5nRGlyZWN0b3JpZXM/LlswXTtcblx0XHRpZiAoIXdvcmtpbmdEaXJlY3RvcnkpIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXG5cdFx0bGV0IHdvcmtpbmdEaXJlY3RvcnlVcmk6IFVSSTtcblx0XHR0cnkge1xuXHRcdFx0d29ya2luZ0RpcmVjdG9yeVVyaSA9IFVSSS5wYXJzZSh3b3JraW5nRGlyZWN0b3J5KTtcblx0XHR9IGNhdGNoIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXG5cdFx0Y29uc3QgcmVwb1Jvb3QgPSBhd2FpdCB0aGlzLl9naXRTZXJ2aWNlLmdldFJlcG9zaXRvcnlSb290KHdvcmtpbmdEaXJlY3RvcnlVcmkpO1xuXHRcdGlmICghcmVwb1Jvb3QpIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXG5cdFx0Y29uc3QgYmFzZUJyYW5jaCA9IGF3YWl0IHRoaXMuX3Jlc29sdmVCcmFuY2hCYXNlQnJhbmNoKHNlc3Npb24sIGRiKTtcblx0XHRjb25zdCBwYXRocyA9IGF3YWl0IHRoaXMuX3Jldmlld1NlcnZpY2UuZ2V0UmV2aWV3ZWRQYXRocyhzZXNzaW9uLCB3b3JraW5nRGlyZWN0b3J5VXJpLCBiYXNlQnJhbmNoKTtcblxuXHRcdHJldHVybiB7IHJlcG9Sb290LCBwYXRocyB9O1xuXHR9XG5cblx0LyoqXG5cdCAqIFBlcnNpc3RzIGEgc2Vzc2lvbiBtZXRhZGF0YSBrZXkvdmFsdWUgcGFpciB0byB0aGUgc2Vzc2lvbiBkYXRhYmFzZS5cblx0ICogQ291bnRlcnBhcnQgaW4gYGFnZW50U2lkZUVmZmVjdHMudHNgIChgQWdlbnRTaWRlRWZmZWN0cy5fcGVyc2lzdFNlc3Npb25GbGFnYCk6XG5cdCAqIGtlZXAgYm90aCBjb3BpZXMgaW4gc3luYyBpZiB0aGUgc2lnbmF0dXJlIGNoYW5nZXMuIER1cGxpY2F0ZWQgcmF0aGVyXG5cdCAqIHRoYW4gbGlmdGVkIGJlY2F1c2UgdGhlIHR3byBjb25zdW1lcnMgcGVyc2lzdCBkaXNqb2ludCBtZXRhZGF0YVxuXHQgKiAoY2hhbmdlc2V0IGRpZmZzIGhlcmUgdnMuIGN1c3RvbVRpdGxlIC8gaXNSZWFkIC8gaXNBcmNoaXZlZCAvXG5cdCAqIGNvbmZpZ1ZhbHVlcyB0aGVyZSkgYW5kIGEgc2hhcmVkIHV0aWwgd291bGQgb25seSBoYXZlIHR3byBjYWxsZXJzLlxuXHQgKi9cblx0cHJpdmF0ZSBfcGVyc2lzdFNlc3Npb25GbGFnKHNlc3Npb246IFByb3RvY29sVVJJLCBrZXk6IHN0cmluZywgdmFsdWU6IHN0cmluZyk6IHZvaWQge1xuXHRcdGNvbnN0IHJlZiA9IHRoaXMuX3Nlc3Npb25EYXRhU2VydmljZS5vcGVuRGF0YWJhc2UoVVJJLnBhcnNlKHNlc3Npb24pKTtcblx0XHRyZWYub2JqZWN0LnNldE1ldGFkYXRhKGtleSwgdmFsdWUpLmNhdGNoKGVyciA9PiB7XG5cdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLndhcm4oYFtBZ2VudEhvc3RDaGFuZ2VzZXRTZXJ2aWNlXSBGYWlsZWQgdG8gcGVyc2lzdCAke2tleX1gLCBlcnIpO1xuXHRcdH0pLmZpbmFsbHkoKCkgPT4ge1xuXHRcdFx0cmVmLmRpc3Bvc2UoKTtcblx0XHR9KTtcblx0fVxufVxuIl0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7Ozs7QUFLQSxTQUFTLG1CQUFtQixTQUFTLHNCQUFzQjtBQUMzRCxTQUFTLGlCQUFpQjtBQUMxQixTQUFTLHNCQUFzQjtBQUMvQixTQUFTLFlBQVkscUJBQXFCO0FBQzFDLFNBQVMsV0FBVztBQUNwQixTQUFTLG1CQUFtQjtBQUM1QjtBQUFBLEVBQ0M7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsT0FDTTtBQUVQLFNBQTJCLDJCQUEyQjtBQUV0RCxTQUFTLGtCQUFrQjtBQUMzQjtBQUFBLEVBQ0M7QUFBQSxFQUlBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxPQUNNO0FBQ1AsU0FBZ0MsOEJBQThCO0FBQzlELFNBQVMsa0NBQWtDO0FBQzNDLFNBQVMsc0JBQXNCLHVCQUF1QixpQ0FBaUM7QUFDdkYsU0FBUyxtQ0FBbUM7QUFDNUMsU0FBUyxvQ0FBb0M7QUFDN0MsU0FBUyxxQkFBcUIsa0JBQWtCLDJCQUFrRjtBQUNsSSxTQUEyRiw0QkFBNEIsK0JBQStCLHNCQUFzQix1QkFBdUIsd0JBQXdCLHlCQUE4QztBQUN6USxTQUFTLDhDQUE4QztBQUN2RCxTQUFTLDJDQUEyQztBQUNwRCxTQUFTLCtCQUErQjtBQUN4QyxTQUFTLDRCQUE0QixvQkFBb0I7QUFDekQsU0FBUywwQkFBMEI7QUFDbkMsU0FBUyxrQ0FBa0M7QUFDM0MsU0FBUyx3QkFBd0Isb0NBQW9DO0FBQ3JFLFNBQVMseUJBQXlCO0FBQ2xDLFNBQVMsd0NBQXdDLDRDQUFvSTtBQVdyTCxNQUFNLHVDQUF1QztBQUU3QyxTQUFTLG1CQUFtQixTQUFzQixNQUF3QztBQUN6RixTQUFPLFNBQVMsV0FDYix3QkFBd0IsT0FBTyxJQUMvQix5QkFBeUIsT0FBTztBQUNwQztBQUVBLFNBQVMsY0FBYyxNQUFtQztBQUN6RCxTQUFPLFNBQVMsV0FDYix3QkFDQTtBQUNKO0FBb0JBLFNBQVMsZUFBZSxPQUE0RTtBQUNuRyxNQUFJLENBQUMsT0FBTztBQUNYLFdBQU87QUFBQSxFQUNSO0FBQ0EsTUFBSSxZQUFZO0FBQ2hCLE1BQUksWUFBWTtBQUNoQixhQUFXLEtBQUssT0FBTztBQUN0QixpQkFBYSxFQUFFLE1BQU0sU0FBUztBQUM5QixpQkFBYSxFQUFFLE1BQU0sV0FBVztBQUFBLEVBQ2pDO0FBQ0EsU0FBTyxFQUFFLFdBQVcsV0FBVyxPQUFPLE1BQU0sT0FBTztBQUNwRDtBQW9CQSxTQUFTLG1DQUNSLFNBQzZCO0FBQzdCLFFBQU0sZUFBZSxTQUFTLFdBQVcsZ0JBQWdCLFFBQVEsUUFBUSxNQUFNLElBQUksT0FBSyxFQUFFLElBQUksSUFBSTtBQUNsRyxTQUFPLGVBQWUsWUFBWTtBQUNuQztBQVFBLFNBQVMsd0NBQ1IsY0FDNkI7QUFDN0IsU0FBTyxlQUFlLFlBQVk7QUFDbkM7QUFRQSxTQUFTLHVCQUF1QixLQUF5QixZQUFvQixNQUFjLEtBQWtEO0FBQzVJLE1BQUksQ0FBQyxLQUFLO0FBQ1QsV0FBTztBQUFBLEVBQ1I7QUFDQSxNQUFJO0FBQ0gsV0FBTyxLQUFLLE1BQU0sR0FBRztBQUFBLEVBQ3RCLFNBQVMsS0FBSztBQUNiLFFBQUksS0FBSyx5REFBeUQsSUFBSSxjQUFjLFVBQVUsS0FBSyxlQUFlLEdBQUcsQ0FBQyxFQUFFO0FBQ3hILFdBQU87QUFBQSxFQUNSO0FBQ0Q7QUFFTyxJQUFNLDRCQUFOLGNBQXdDLFdBQWlEO0FBQUEsRUEyQi9GLFlBQzBDLGVBQ1gsYUFDUSxxQkFDQyxhQUNPLG9CQUNELHVCQUNTLDRCQUNHLHlCQUNmLGdCQUNOLG1CQUNuQztBQUNELFVBQU07QUFYbUM7QUFDWDtBQUNRO0FBQ0M7QUFDTztBQUNEO0FBQ1M7QUFDRztBQUNmO0FBQ047QUEvQnJDO0FBQUEsU0FBaUIsNEJBQTRCLElBQUksZUFBdUI7QUFFeEU7QUFBQSxTQUFpQix1QkFBdUIsS0FBSyxVQUFVLElBQUksY0FBc0IsQ0FBQztBQUVsRjtBQUFBLFNBQWlCLDhCQUE4QixLQUFLLFVBQVUsSUFBSSxjQUFzQixDQUFDO0FBQ3pGLFNBQWlCLHdCQUF3QixvQkFBSSxJQUFpQjtBQWM5RDtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUEsU0FBaUIsMEJBQTBCLG9CQUFJLElBQWlCO0FBZS9ELFNBQUssc0JBQXNCLEtBQUssMEJBQTBCO0FBQUEsRUFDM0Q7QUFBQTtBQUFBLEVBR1UsNEJBQWlEO0FBQzFELFdBQU8sS0FBSyxVQUFVLElBQUksNkJBQTZCLEtBQUssV0FBVyxDQUFDO0FBQUEsRUFDekU7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBLEVBTVEsaUJBQWlCLFNBQXNCLFdBQWlDO0FBQy9FLFdBQU8sS0FBSyx3QkFBd0Isd0JBQXdCLE9BQU8sRUFBRSxJQUFJLFNBQVM7QUFBQSxFQUNuRjtBQUFBLEVBRVEscUJBQXFCLFNBQStCO0FBQzNELFdBQU8sQ0FBQyxDQUFDLEtBQUssc0JBQXNCLCtCQUErQixPQUFPLElBQUksQ0FBQztBQUFBLEVBQ2hGO0FBQUEsRUFFQSx5QkFBeUIsU0FBNEI7QUFDcEQsU0FBSyxjQUFjLGtCQUFrQix3QkFBd0IsT0FBTyxDQUFDO0FBQ3JFLFNBQUssY0FBYyxrQkFBa0IsNkJBQTZCLE9BQU8sQ0FBQztBQUMxRSxTQUFLLGNBQWMsa0JBQWtCLHlCQUF5QixPQUFPLENBQUM7QUFBQSxFQUN2RTtBQUFBLEVBRUEsdUJBQXVCLFNBQXNCLE1BQTJCLE9BQTBDO0FBQ2pILFVBQU0sZUFBZSxLQUFLLGNBQWMsa0JBQWtCLG1CQUFtQixTQUFTLElBQUksQ0FBQztBQUMzRixTQUFLLHVCQUF1QixTQUFTLGNBQWMsS0FBSztBQUFBLEVBQ3pEO0FBQUEsRUFFQSwrQkFBK0IsWUFBeUIsVUFBZ0U7QUFDdkgsVUFBTSxrQkFBa0IsdUJBQXVCLFNBQVMsV0FBVyxZQUFZLFVBQVUsS0FBSyxXQUFXO0FBSXpHLFVBQU0sbUJBQW1CLHVCQUF1QixTQUFTLFlBQVksWUFBWSxXQUFXLEtBQUssV0FBVyxLQUN4Ryx1QkFBdUIsU0FBUyxXQUFXLFlBQVksb0JBQW9CLEtBQUssV0FBVztBQUUvRixXQUFPLEVBQUUsUUFBUSxpQkFBaUIsU0FBUyxpQkFBaUI7QUFBQSxFQUM3RDtBQUFBLEVBRUEsK0JBQStCLFlBQXlCLE9BQXNDO0FBTTdGLFNBQUssYUFBYSxZQUFZLFVBQVUsTUFBTSxNQUFNO0FBQ3BELFNBQUssYUFBYSxZQUFZLFdBQVcsTUFBTSxPQUFPO0FBQUEsRUFDdkQ7QUFBQSxFQUVBLGlDQUFpQyxZQUF5QixVQUFnRTtBQUN6SCxVQUFNLFNBQVMsS0FBSywrQkFBK0IsWUFBWSxRQUFRO0FBQ3ZFLFNBQUssK0JBQStCLFlBQVksTUFBTTtBQUN0RCxXQUFPO0FBQUEsRUFDUjtBQUFBLEVBRUEsc0JBQXNCLFlBQXlCLFNBQStCO0FBQzdFLFNBQUssb0JBQW9CLFlBQVksc0JBQXNCLEtBQUssVUFBVSxPQUFPLENBQUM7QUFBQSxFQUNuRjtBQUFBLEVBRUEsb0JBQW9CLFlBQTJEO0FBSTlFLFVBQU0scUJBQXFCLEtBQUssY0FBYyxrQkFBa0IsVUFBVSxHQUFHO0FBQzdFLFFBQUksb0JBQW9CO0FBQ3ZCLGFBQU87QUFBQSxJQUNSO0FBUUEsVUFBTSxjQUFjLEtBQUssY0FBYyxrQkFBa0IseUJBQXlCLFVBQVUsQ0FBQztBQUM3RixRQUFJLGFBQWEsV0FBVyxnQkFBZ0IsT0FBTztBQXlCbEQsYUFBTztBQUFBLElBQ1I7QUFHQSxXQUFPO0FBQUEsRUFDUjtBQUFBLEVBRUEsd0JBQXdCLFlBQXlCLFVBQTBFO0FBRzFILFFBQUksS0FBSyxjQUFjLGdCQUFnQixVQUFVLEdBQUc7QUFDbkQsYUFBTztBQUFBLElBQ1I7QUFNQSxVQUFNLGlCQUFpQixTQUFTLG9CQUFvQjtBQUNwRCxRQUFJLG1CQUFtQixRQUFXO0FBQ2pDLFVBQUk7QUFDSCxlQUFPLEtBQUssTUFBTSxjQUFjO0FBQUEsTUFDakMsU0FBUyxPQUFPO0FBQ2YsZUFBTztBQUFBLE1BQ1I7QUFBQSxJQUNEO0FBS0EsVUFBTSxjQUFjLEtBQUssY0FBYyxrQkFBa0Isd0JBQXdCLFVBQVUsQ0FBQztBQUM1RixVQUFNLGNBQWMsbUNBQW1DLFdBQVc7QUFDbEUsUUFBSSxhQUFhO0FBRWhCLFdBQUssc0JBQXNCLFlBQVksV0FBVztBQUNsRCxhQUFPO0FBQUEsSUFDUjtBQUdBLFVBQU0sWUFBWSxTQUFTLHFCQUFxQjtBQUNoRCxVQUFNLFlBQVksU0FBUyxpQkFBaUI7QUFDNUMsUUFBSSxjQUFjLFVBQWEsY0FBYyxRQUFXO0FBQ3ZELGFBQU87QUFBQSxJQUNSO0FBQ0EsVUFBTSxXQUFXLEtBQUssK0JBQStCLFlBQVksRUFBRSxXQUFXLFVBQVUsQ0FBQztBQU16RixVQUFNLG1CQUFtQix3Q0FBd0MsU0FBUyxNQUFNO0FBQ2hGLFFBQUksa0JBQWtCO0FBRXJCLFdBQUssc0JBQXNCLFlBQVksZ0JBQWdCO0FBQ3ZELGFBQU87QUFBQSxJQUNSO0FBRUEsV0FBTztBQUFBLEVBQ1I7QUFBQSxFQUVBLCtCQUErQixjQUFvQztBQUNsRSxXQUFPLEtBQUssc0JBQXNCLElBQUksWUFBWTtBQUFBLEVBQ25EO0FBQUEsRUFFUSxhQUFhLFNBQXNCLE1BQTJCLE9BQXNEO0FBQzNILFFBQUksQ0FBQyxPQUFPO0FBQ1g7QUFBQSxJQUNEO0FBQ0EsVUFBTSxXQUFXLEtBQUssY0FBYyxrQkFBa0IsbUJBQW1CLFNBQVMsSUFBSSxDQUFDO0FBQ3ZGLFFBQUksWUFBWSxTQUFTLE1BQU0sU0FBUyxHQUFHO0FBQzFDO0FBQUEsSUFDRDtBQUNBLFNBQUssdUJBQXVCLFNBQVMsTUFBTSxLQUFLO0FBQUEsRUFDakQ7QUFBQSxFQUVBLHdCQUF3QixTQUE0QjtBQUNuRCxVQUFNLFFBQVEsS0FBSyxjQUFjLGdCQUFnQixPQUFPO0FBQ3hELFFBQUksQ0FBQyxTQUFTLE9BQU8sY0FBYyxpQkFBaUIsZ0JBQWdCO0FBQ25FO0FBQUEsSUFDRDtBQUVBLFVBQU0sYUFBYSw2QkFBNkIsU0FBUyxLQUFLO0FBQzlELFNBQUssY0FBYyxxQkFBcUIsU0FBUyxVQUFVO0FBQUEsRUFDNUQ7QUFBQSxFQUVBLHVCQUF1QixTQUE0QjtBQUNsRCxRQUFJLENBQUMsS0FBSyxxQkFBcUIsT0FBTyxHQUFHO0FBQ3hDLFdBQUssd0JBQXdCLElBQUksT0FBTztBQUN4QztBQUFBLElBQ0Q7QUFDQSxTQUFLLHlCQUF5QixTQUFTLFVBQVUsUUFBVyxLQUFLLDhCQUE4QixTQUFTLFFBQVEsQ0FBQztBQUFBLEVBQ2xIO0FBQUEsRUFFQSx3QkFBd0IsU0FBNEI7QUFDbkQsUUFBSSxDQUFDLEtBQUsscUJBQXFCLE9BQU8sR0FBRztBQUN4QyxXQUFLLHdCQUF3QixJQUFJLE9BQU87QUFDeEM7QUFBQSxJQUNEO0FBQ0EsU0FBSyx5QkFBeUIsU0FBUyxXQUFXLFFBQVcsS0FBSyw4QkFBOEIsU0FBUyxTQUFTLENBQUM7QUFBQSxFQUNwSDtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUEsRUFTQSw0QkFBNEIsU0FBNEI7QUFDdkQsUUFBSSxLQUFLLHdCQUF3QixPQUFPLE9BQU8sR0FBRztBQUNqRCxXQUFLLDhCQUE4QixPQUFPO0FBQUEsSUFDM0M7QUFBQSxFQUNEO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBLEVBT0EsOEJBQThCLFNBQTRCO0FBQ3pELFVBQU0sZ0JBQWdCLEtBQUssd0JBQXdCLHdCQUF3QixPQUFPO0FBQ2xGLFFBQUksY0FBYyxTQUFTLEdBQUc7QUFDN0I7QUFBQSxJQUNEO0FBQ0EsZUFBVyxhQUFhLGVBQWU7QUFDdEMsWUFBTSxTQUFTLGtCQUFrQixTQUFTO0FBQzFDLGNBQVEsUUFBUSxNQUFNO0FBQUEsUUFDckIsS0FBSyxjQUFjO0FBQ2xCLGVBQUssdUJBQXVCLE9BQU87QUFDbkM7QUFBQSxRQUNELEtBQUssY0FBYztBQUNsQixlQUFLLHdCQUF3QixPQUFPO0FBQ3BDO0FBQUEsUUFDRCxLQUFLLGNBQWM7QUFDbEIsZUFBSyxLQUFLLDRCQUE0QixPQUFPO0FBQzdDO0FBQUEsUUFDRCxLQUFLLGNBQWM7QUFDbEIsY0FBSSxPQUFPLFdBQVcsUUFBVztBQUNoQyxpQkFBSyxLQUFLLHFCQUFxQixTQUFTLE9BQU8sTUFBTTtBQUFBLFVBQ3REO0FBQ0E7QUFBQSxRQUNEO0FBSUMsY0FBSSxjQUFjLFNBQVM7QUFDMUIsaUJBQUssdUJBQXVCLE9BQU87QUFDbkMsaUJBQUssd0JBQXdCLE9BQU87QUFBQSxVQUNyQztBQUNBO0FBQUEsTUFDRjtBQUFBLElBQ0Q7QUFBQSxFQUNEO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQSxFQU1BLGtCQUFrQixTQUE0QjtBQUM3QyxTQUFLLHdCQUF3QixPQUFPLE9BQU87QUFBQSxFQUM1QztBQUFBLEVBRUEscUJBQXFCLFNBQXNCLFFBQXNDO0FBRWhGLFdBQU8sS0FBSyxzQkFBc0IsU0FBUyxRQUFRLEtBQUs7QUFBQSxFQUN6RDtBQUFBLEVBRUEsTUFBYyxzQkFBc0IsU0FBc0IsUUFBZ0IsaUJBQTBCLGVBQXdFO0FBQzNLLFVBQU0sVUFBVSxLQUFLLGNBQWMsa0JBQWtCLHNCQUFzQixTQUFTLE1BQU0sQ0FBQztBQUMzRixVQUFNLFlBQVksVUFBVSxPQUFPO0FBQ25DLFFBQUksVUFBZ0M7QUFDcEMsUUFBSTtBQUNKLFFBQUk7QUFDSixRQUFJO0FBQ0gsVUFBSTtBQUNKLFVBQUk7QUFDSCxjQUFNLEtBQUssb0JBQW9CLGFBQWEsSUFBSSxNQUFNLE9BQU8sQ0FBQztBQUFBLE1BQy9ELFNBQVMsS0FBSztBQUNiLGFBQUssWUFBWSxLQUFLLDhFQUE4RSxPQUFPLElBQUksR0FBRztBQUNsSCxhQUFLLGNBQWMscUJBQXFCLFNBQVM7QUFBQSxVQUNoRCxNQUFNLFdBQVc7QUFBQSxVQUNqQixRQUFRLGdCQUFnQjtBQUFBLFVBQ3hCLE9BQU8sRUFBRSxXQUFXLGlCQUFpQixTQUFTLGVBQWUsUUFBUSxJQUFJLFVBQVUsT0FBTyxHQUFHLEVBQUU7QUFBQSxRQUNoRyxDQUFDO0FBQ0Qsa0JBQVU7QUFDVixlQUFPO0FBQUEsTUFDUjtBQUNBLFVBQUk7QUFNSCxpQkFBUyxNQUFNLEtBQUssa0NBQWtDLFNBQVMsSUFBSSxRQUFRLE1BQU07QUFDakYsa0JBQVUsT0FBTztBQUNqQixvQkFBWSxPQUFPLE1BQU07QUFDekIsYUFBSyx1QkFBdUIsU0FBUyxTQUFTLE9BQU8sS0FBSztBQUFBLE1BQzNELFNBQVMsS0FBSztBQUNiLGFBQUssWUFBWSxLQUFLLGdFQUFnRSxPQUFPLElBQUksTUFBTSxJQUFJLEdBQUc7QUFDOUcsYUFBSyxjQUFjLHFCQUFxQixTQUFTO0FBQUEsVUFDaEQsTUFBTSxXQUFXO0FBQUEsVUFDakIsUUFBUSxnQkFBZ0I7QUFBQSxVQUN4QixPQUFPLEVBQUUsV0FBVyxpQkFBaUIsU0FBUyxlQUFlLFFBQVEsSUFBSSxVQUFVLE9BQU8sR0FBRyxFQUFFO0FBQUEsUUFDaEcsQ0FBQztBQUNELGtCQUFVO0FBQUEsTUFDWCxVQUFFO0FBQ0QsWUFBSSxRQUFRO0FBQUEsTUFDYjtBQUNBLGFBQU87QUFBQSxJQUNSLFVBQUU7QUFDRCxVQUFJLGlCQUFpQjtBQUNwQixjQUFNLHFCQUFxQixLQUFLLHNCQUFzQiwrQkFBK0IsT0FBTztBQUM1Riw2Q0FBcUMsS0FBSyxtQkFBbUIsU0FBUyxRQUFRO0FBQUEsVUFDN0U7QUFBQSxVQUNBLFlBQVksVUFBVSxRQUFRO0FBQUEsVUFDOUIsYUFBYSxtQkFBbUIsa0JBQWtCO0FBQUEsVUFDbEQsYUFBYSxvQkFBb0IsVUFBVTtBQUFBLFVBQzNDLEdBQUksWUFBWSxjQUFjLGNBQWMsU0FBWSxFQUFFLFVBQVUsSUFBSSxDQUFDO0FBQUEsVUFDekUsV0FBVyxRQUFRO0FBQUEsUUFDcEIsR0FBRyxhQUFhO0FBQUEsTUFDakI7QUFBQSxJQUNEO0FBQUEsRUFDRDtBQUFBLEVBRUEsTUFBTSw2QkFBNkIsU0FBc0IsZ0JBQXdCLGdCQUE4QztBQUM5SCxVQUFNLGFBQWEsS0FBSyxjQUFjLGtCQUFrQiw4QkFBOEIsU0FBUyxnQkFBZ0IsY0FBYyxDQUFDO0FBQzlILFFBQUk7QUFDSixRQUFJO0FBQ0gsWUFBTSxLQUFLLG9CQUFvQixhQUFhLElBQUksTUFBTSxPQUFPLENBQUM7QUFBQSxJQUMvRCxTQUFTLEtBQUs7QUFDYixXQUFLLFlBQVksS0FBSyx1RkFBdUYsT0FBTyxJQUFJLEdBQUc7QUFDM0gsV0FBSyxjQUFjLHFCQUFxQixZQUFZO0FBQUEsUUFDbkQsTUFBTSxXQUFXO0FBQUEsUUFDakIsUUFBUSxnQkFBZ0I7QUFBQSxRQUN4QixPQUFPLEVBQUUsV0FBVyxpQkFBaUIsU0FBUyxlQUFlLFFBQVEsSUFBSSxVQUFVLE9BQU8sR0FBRyxFQUFFO0FBQUEsTUFDaEcsQ0FBQztBQUNELGFBQU87QUFBQSxJQUNSO0FBQ0EsUUFBSTtBQUNILFlBQU0sYUFBYSxJQUFJLE1BQU0sT0FBTztBQUNwQyxZQUFNLENBQUMsb0JBQW9CLFlBQVksSUFBSSxNQUFNLFFBQVEsSUFBSTtBQUFBLFFBQzVELEtBQUssbUJBQW1CLHNCQUFzQixZQUFZLGNBQWMsRUFBRSxLQUFLLE9BQUssR0FBRyxPQUFPO0FBQUEsUUFDOUYsS0FBSyxtQkFBbUIsc0JBQXNCLFlBQVksY0FBYztBQUFBLE1BQ3pFLENBQUM7QUFDRCxVQUFJLENBQUMsc0JBQXNCLENBQUMsY0FBYztBQUt6QyxjQUFNLFVBQVUsQ0FBQyxzQkFBc0IsQ0FBQyxlQUNyQyxlQUNBLENBQUMscUJBQ0Esa0JBQ0E7QUFDSixhQUFLLGNBQWMscUJBQXFCLFlBQVk7QUFBQSxVQUNuRCxNQUFNLFdBQVc7QUFBQSxVQUNqQixRQUFRLGdCQUFnQjtBQUFBLFVBQ3hCLE9BQU8sRUFBRSxXQUFXLGlCQUFpQixTQUFTLCtCQUErQixPQUFPLDBDQUEwQztBQUFBLFFBQy9ILENBQUM7QUFDRCxlQUFPO0FBQUEsTUFDUjtBQUNBLFVBQUksdUJBQXVCLGFBQWEsU0FBUztBQUloRCxhQUFLLHVCQUF1QixTQUFTLFlBQVksQ0FBQyxDQUFDO0FBQ25ELGVBQU87QUFBQSxNQUNSO0FBQ0EsWUFBTSxhQUFhLE1BQU0sS0FBSyx5QkFBeUIsT0FBTztBQUM5RCxVQUFJLENBQUMsWUFBWTtBQUNoQixhQUFLLGNBQWMscUJBQXFCLFlBQVk7QUFBQSxVQUNuRCxNQUFNLFdBQVc7QUFBQSxVQUNqQixRQUFRLGdCQUFnQjtBQUFBLFVBQ3hCLE9BQU8sRUFBRSxXQUFXLGlCQUFpQixTQUFTLG1GQUFtRjtBQUFBLFFBQ2xJLENBQUM7QUFDRCxlQUFPO0FBQUEsTUFDUjtBQUNBLFlBQU0sUUFBUSxNQUFNLEtBQUssWUFBWSw0QkFBNEIsWUFBWTtBQUFBLFFBQzVFLFlBQVk7QUFBQSxRQUNaLFNBQVM7QUFBQSxRQUNULE9BQU8sYUFBYTtBQUFBLE1BQ3JCLENBQUM7QUFDRCxVQUFJLFVBQVUsUUFBVztBQU14QixhQUFLLGNBQWMscUJBQXFCLFlBQVk7QUFBQSxVQUNuRCxNQUFNLFdBQVc7QUFBQSxVQUNqQixRQUFRLGdCQUFnQjtBQUFBLFVBQ3hCLE9BQU8sRUFBRSxXQUFXLGlCQUFpQixTQUFTLGtEQUFrRCxrQkFBa0IsS0FBSyxhQUFhLE9BQU8sS0FBSztBQUFBLFFBQ2pKLENBQUM7QUFDRCxlQUFPO0FBQUEsTUFDUjtBQUNBLFdBQUssdUJBQXVCLFNBQVMsWUFBWSxLQUFLO0FBQUEsSUFDdkQsU0FBUyxLQUFLO0FBQ2IsV0FBSyxZQUFZLEtBQUsseUVBQXlFLE9BQU8sSUFBSSxjQUFjLElBQUksY0FBYyxJQUFJLEdBQUc7QUFDakosV0FBSyxjQUFjLHFCQUFxQixZQUFZO0FBQUEsUUFDbkQsTUFBTSxXQUFXO0FBQUEsUUFDakIsUUFBUSxnQkFBZ0I7QUFBQSxRQUN4QixPQUFPLEVBQUUsV0FBVyxpQkFBaUIsU0FBUyxlQUFlLFFBQVEsSUFBSSxVQUFVLE9BQU8sR0FBRyxFQUFFO0FBQUEsTUFDaEcsQ0FBQztBQUFBLElBQ0YsVUFBRTtBQUNELFVBQUksUUFBUTtBQUFBLElBQ2I7QUFDQSxXQUFPO0FBQUEsRUFDUjtBQUFBLEVBRUEsNEJBQTRCLFNBQTRDO0FBQ3ZFLFdBQU8sS0FBSyw2QkFBNkIsU0FBUyxRQUFXLEtBQUs7QUFBQSxFQUNuRTtBQUFBLEVBRUEsTUFBYyw2QkFBNkIsU0FBc0IsUUFBNEIsaUJBQTBCLGVBQXdFO0FBQzlMLFVBQU0saUJBQWlCLEtBQUssY0FBYyxrQkFBa0IsNkJBQTZCLE9BQU8sQ0FBQztBQUNqRyxRQUFJLENBQUMsS0FBSyxpQkFBaUIsU0FBUyxjQUFjLEdBQUc7QUFDcEQsYUFBTztBQUFBLElBQ1I7QUFNQSxRQUFJLENBQUMsS0FBSyxxQkFBcUIsT0FBTyxHQUFHO0FBQ3hDLFdBQUssd0JBQXdCLElBQUksT0FBTztBQUN4QyxhQUFPO0FBQUEsSUFDUjtBQUVBLFVBQU0sc0JBQXNCLEtBQUssY0FBYyxrQkFBa0IsY0FBYyxHQUFHO0FBQ2xGLFFBQUksd0JBQXdCLGdCQUFnQixXQUFXO0FBQ3RELFdBQUssY0FBYyxxQkFBcUIsZ0JBQWdCO0FBQUEsUUFDdkQsTUFBTSxXQUFXO0FBQUEsUUFDakIsUUFBUSxnQkFBZ0I7QUFBQSxNQUN6QixDQUFDO0FBQUEsSUFDRjtBQUVBLFVBQU0sWUFBWSxVQUFVLE9BQU87QUFDbkMsVUFBTSxxQkFBcUIsS0FBSyxzQkFBc0IsK0JBQStCLE9BQU87QUFDNUYsUUFBSSxVQUFrQztBQUN0QyxRQUFJO0FBQ0osUUFBSTtBQUNILFlBQU0sUUFBUSxNQUFNLEtBQUsseUJBQXlCLE9BQU87QUFDekQsVUFBSSxVQUFVLFFBQVc7QUFLeEIsYUFBSyxjQUFjLHFCQUFxQixnQkFBZ0I7QUFBQSxVQUN2RCxNQUFNLFdBQVc7QUFBQSxVQUNqQixRQUFRLGdCQUFnQjtBQUFBLFVBQ3hCLE9BQU8sRUFBRSxXQUFXLGlCQUFpQixTQUFTLCtDQUErQztBQUFBLFFBQzlGLENBQUM7QUFDRCxrQkFBVTtBQUNWLGVBQU87QUFBQSxNQUNSO0FBRUEsV0FBSyx1QkFBdUIsU0FBUyxnQkFBZ0IsS0FBSztBQUMxRCxrQkFBWSxNQUFNO0FBQ2xCLGdCQUFVO0FBQUEsSUFDWCxTQUFTLEtBQUs7QUFDYixXQUFLLFlBQVksS0FBSyx1RUFBdUUsT0FBTyxJQUFJLEdBQUc7QUFDM0csV0FBSyxjQUFjLHFCQUFxQixnQkFBZ0I7QUFBQSxRQUN2RCxNQUFNLFdBQVc7QUFBQSxRQUNqQixRQUFRLGdCQUFnQjtBQUFBLFFBQ3hCLE9BQU8sRUFBRSxXQUFXLGlCQUFpQixTQUFTLGVBQWUsUUFBUSxJQUFJLFVBQVUsT0FBTyxHQUFHLEVBQUU7QUFBQSxNQUNoRyxDQUFDO0FBQ0QsZ0JBQVU7QUFBQSxJQUNYLFVBQUU7QUFDRCxVQUFJLGlCQUFpQjtBQUNwQiwrQ0FBdUMsS0FBSyxtQkFBbUIsU0FBUyxRQUFRO0FBQUEsVUFDL0UsTUFBTTtBQUFBLFVBQ047QUFBQSxVQUNBLFlBQVksVUFBVSxRQUFRO0FBQUEsVUFDOUIsYUFBYSxtQkFBbUIsa0JBQWtCO0FBQUEsVUFDbEQsYUFBYSxvQkFBb0IsVUFBVTtBQUFBLFVBQzNDLEdBQUksWUFBWSxjQUFjLGNBQWMsU0FBWSxFQUFFLFVBQVUsSUFBSSxDQUFDO0FBQUEsUUFDMUUsR0FBRyxhQUFhO0FBQUEsTUFDakI7QUFBQSxJQUNEO0FBRUEsV0FBTztBQUFBLEVBQ1I7QUFBQSxFQUVBLE1BQWMseUJBQXlCLFNBQXdFO0FBQzlHLFVBQU0sbUJBQW1CLEtBQUssY0FBYyxnQkFBZ0IsT0FBTyxHQUFHLHFCQUFxQixDQUFDO0FBQzVGLFFBQUksQ0FBQyxrQkFBa0I7QUFDdEIsYUFBTztBQUFBLElBQ1I7QUFFQSxRQUFJO0FBQ0osUUFBSTtBQUNILDRCQUFzQixJQUFJLE1BQU0sZ0JBQWdCO0FBQUEsSUFDakQsUUFBUTtBQUNQLGFBQU87QUFBQSxJQUNSO0FBRUEsV0FBTyxLQUFLLFlBQVksd0JBQXdCLHFCQUFxQjtBQUFBLE1BQ3BFLFlBQVk7QUFBQSxJQUNiLENBQUM7QUFBQSxFQUNGO0FBQUEsRUFFQSxNQUFjLGtDQUFrQyxTQUFzQixJQUFzQixRQUEwQztBQUNySSxVQUFNLGdCQUFnQixLQUFLLHVCQUF1QixTQUFTLElBQUksTUFBTTtBQUdyRSxRQUFJO0FBQ0gsVUFBSSxDQUFDLGNBQWMsWUFBWTtBQUM5QixlQUFPLEVBQUUsT0FBTyxDQUFDLEdBQUcsU0FBUyxXQUFXO0FBQUEsTUFDekM7QUFDQSxZQUFNLHFCQUFxQixLQUFLLHNCQUFzQiwrQkFBK0IsT0FBTztBQUM1RixVQUFJLG1CQUFtQixrQkFBa0IsR0FBRztBQUMzQyxlQUFPLEtBQUssNkJBQTZCLFNBQVMsY0FBYyxZQUFZLGNBQWMsSUFBSSxRQUFRLGtCQUFtQjtBQUFBLE1BQzFIO0FBQ0EsWUFBTSxRQUFRLE1BQU0sS0FBSyw4QkFBOEIsU0FBUyxjQUFjLFlBQVksY0FBYyxJQUFJLE1BQU07QUFDbEgsYUFBTyxFQUFFLE9BQU8sU0FBUyxXQUFXO0FBQUEsSUFDckMsVUFBRTtBQUNELG9CQUFjLFFBQVE7QUFBQSxJQUN2QjtBQUFBLEVBQ0Q7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBLEVBTUEsTUFBYyw4QkFBOEIsU0FBc0IsZ0JBQTZCLElBQXNCLFFBQXNEO0FBQzFLLFVBQU0sT0FBTyxNQUFNLEtBQUssbUJBQW1CLHNCQUFzQixJQUFJLE1BQU0sT0FBTyxHQUFHLE1BQU07QUFDM0YsUUFBSSxRQUFRLEtBQUssV0FBVyxLQUFLLFNBQVM7QUFDekMsWUFBTSxhQUFhLE1BQU0sS0FBSyx5QkFBeUIsT0FBTztBQUM5RCxVQUFJLFlBQVk7QUFDZixjQUFNLGVBQWUsTUFBTSxLQUFLLFlBQVksNEJBQTRCLFlBQVk7QUFBQSxVQUNuRixZQUFZO0FBQUEsVUFDWixTQUFTLEtBQUs7QUFBQSxVQUNkLE9BQU8sS0FBSztBQUFBLFFBQ2IsQ0FBQztBQUNELFlBQUksY0FBYztBQUNqQixpQkFBTztBQUFBLFFBQ1I7QUFBQSxNQUNEO0FBQUEsSUFDRCxXQUFXLFFBQVEsS0FBSyxXQUFXLEtBQUssU0FBUztBQUloRCxhQUFPLENBQUM7QUFBQSxJQUNUO0FBRUEsV0FBTyxpQkFBaUIsZ0JBQWdCLElBQUksS0FBSyxxQkFBcUIsTUFBTTtBQUFBLEVBQzdFO0FBQUEsRUFFUSx1QkFBdUIsU0FBc0IsaUJBQW1DLFFBQWtIO0FBQ3pNLFVBQU0sZUFBZSxLQUFLLGNBQWMsZ0JBQWdCLE9BQU87QUFDL0QsUUFBSSxDQUFDLGNBQWM7QUFDbEIsYUFBTyxFQUFFLFlBQVksU0FBUyxJQUFJLGlCQUFpQixTQUFTLE1BQU07QUFBQSxNQUFFLEVBQUU7QUFBQSxJQUN2RTtBQUVBLFVBQU0sa0JBQWlDLENBQUM7QUFDeEMsUUFBSSxhQUFhLFlBQVksT0FBTyxXQUFXLGFBQWEsU0FBUyxDQUFDLEdBQUcsS0FBSyxVQUFRLEtBQUssT0FBTyxNQUFNLEdBQUc7QUFDMUcsc0JBQWdCLEtBQUssT0FBTztBQUFBLElBQzdCO0FBQ0EsZUFBV0EsU0FBUSxhQUFhLFNBQVMsQ0FBQyxHQUFHO0FBQzVDLFVBQUksaUJBQWlCQSxNQUFLLFFBQVEsR0FBRztBQUNwQztBQUFBLE1BQ0Q7QUFDQSxZQUFNLFlBQVksS0FBSyxjQUFjLGFBQWFBLE1BQUssUUFBUTtBQUMvRCxVQUFJLFdBQVcsWUFBWSxPQUFPLFVBQVUsV0FBVyxNQUFNLEtBQUssVUFBUSxLQUFLLE9BQU8sTUFBTSxHQUFHO0FBQzlGLHdCQUFnQixLQUFLQSxNQUFLLFFBQVE7QUFBQSxNQUNuQztBQUFBLElBQ0Q7QUFFQSxRQUFJLGdCQUFnQixTQUFTLEdBQUc7QUFDL0IsV0FBSyxZQUFZLEtBQUssdUNBQXVDLE1BQU0sbUNBQW1DLE9BQU8sNENBQTRDO0FBQ3pKLGFBQU8sRUFBRSxZQUFZLFFBQVcsSUFBSSxpQkFBaUIsU0FBUyxNQUFNO0FBQUEsTUFBRSxFQUFFO0FBQUEsSUFDekU7QUFDQSxRQUFJLGdCQUFnQixXQUFXLEtBQUssZ0JBQWdCLENBQUMsTUFBTSxTQUFTO0FBQ25FLGFBQU8sRUFBRSxZQUFZLFNBQVMsSUFBSSxpQkFBaUIsU0FBUyxNQUFNO0FBQUEsTUFBRSxFQUFFO0FBQUEsSUFDdkU7QUFFQSxVQUFNLE9BQU8sZ0JBQWdCLENBQUM7QUFDOUIsVUFBTSxlQUFlLEtBQUssb0JBQW9CLGFBQWEsSUFBSSxNQUFNLElBQUksQ0FBQztBQUMxRSxXQUFPLEVBQUUsWUFBWSxNQUFNLElBQUksYUFBYSxRQUFRLFNBQVMsTUFBTSxhQUFhLFFBQVEsRUFBRTtBQUFBLEVBQzNGO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUEsRUFRQSxNQUFjLDZCQUE2QixTQUFzQixnQkFBNkIsSUFBc0IsUUFBZ0Isb0JBQWlFO0FBQ3BNLFVBQU0sYUFBYSxJQUFJLE1BQU0sT0FBTztBQUNwQyxVQUFNLHVCQUF1QixLQUFLLDJCQUEyQixTQUFTLGtCQUFrQjtBQUV4RixRQUFJO0FBQ0osUUFBSTtBQUNKLFFBQUk7QUFLSCxPQUFDLEVBQUUsaUJBQWlCLGtCQUFrQixJQUFJLE1BQU0sMkJBQTJCLHNCQUFzQixLQUFLLGFBQWEsQ0FBQyxXQUFXLFFBQVE7QUFDdEksYUFBSyxZQUFZLE1BQU0scUVBQXFFLFVBQVUsU0FBUyxDQUFDLHlCQUF5QixPQUFPLElBQUksTUFBTSxzQ0FBc0MsR0FBRztBQUFBLE1BQ3BNLENBQUM7QUFBQSxJQUNGLFNBQVMsS0FBSztBQUNiLFdBQUssWUFBWSxNQUFNLG9GQUFvRixPQUFPLElBQUksTUFBTSxJQUFJLEdBQUc7QUFDbkksYUFBTyxFQUFFLE9BQU8sQ0FBQyxHQUFHLFNBQVMsZ0JBQWdCO0FBQUEsSUFDOUM7QUFLQSxVQUFNLFVBQVUsSUFBSSxRQUF5RixvQ0FBb0M7QUFDakosVUFBTSxDQUFDLGNBQWMsV0FBVyxJQUFJLE1BQU0sUUFBUSxJQUFJO0FBQUEsTUFDckQsUUFBUSxJQUFJLGdCQUFnQixJQUFJLGNBQVksUUFBUSxNQUFNLE1BQU0sS0FBSyxzQkFBc0IsU0FBUyxnQkFBZ0IsWUFBWSxJQUFJLFFBQVEsUUFBUSxDQUFDLENBQUMsQ0FBQztBQUFBLE1BQ3ZKLEtBQUssd0NBQXdDLFNBQVMsZ0JBQWdCLElBQUksUUFBUSxpQkFBaUI7QUFBQSxJQUNwRyxDQUFDLEVBQUUsUUFBUSxNQUFNLFFBQVEsUUFBUSxDQUFDO0FBTWxDLFVBQU0sUUFBUSx1QkFBdUIsQ0FBQyxHQUFHLGFBQWEsSUFBSSxPQUFLLEVBQUUsS0FBSyxHQUFHLFdBQVcsQ0FBQztBQUNyRixXQUFPO0FBQUEsTUFDTjtBQUFBLE1BQ0EsU0FBUztBQUFBLE1BQ1QsV0FBVztBQUFBLFFBQ1Ysc0JBQXNCLGdCQUFnQjtBQUFBLFFBQ3RDLG1CQUFtQixrQkFBa0I7QUFBQSxRQUNyQyxnQ0FBZ0MsYUFBYSxPQUFPLE9BQUssRUFBRSxZQUFZLEVBQUU7QUFBQSxNQUMxRTtBQUFBLElBQ0Q7QUFBQSxFQUNEO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBLEVBVUEsTUFBYyxzQkFBc0IsU0FBc0IsZ0JBQTZCLFlBQWlCLElBQXNCLFFBQWdCLFVBQXlHO0FBQ3RQLFFBQUk7QUFDSCxZQUFNLE9BQU8sTUFBTSxLQUFLLG1CQUFtQixzQkFBc0IsWUFBWSxRQUFRLFFBQVE7QUFDN0YsVUFBSSxDQUFDLE1BQU07QUFDVixhQUFLLFlBQVksTUFBTSx3RUFBd0UsT0FBTyxJQUFJLE1BQU0sa0JBQWtCLFNBQVMsU0FBUyxDQUFDLHNEQUFzRDtBQUMzTSxlQUFPLEVBQUUsT0FBTyxNQUFNLEtBQUssc0NBQXNDLFNBQVMsZ0JBQWdCLElBQUksUUFBUSxRQUFRLEdBQUcsY0FBYyxLQUFLO0FBQUEsTUFDckk7QUFDQSxVQUFJLEtBQUssV0FBVyxLQUFLLFNBQVM7QUFJakMsZUFBTyxFQUFFLE9BQU8sQ0FBQyxHQUFHLGNBQWMsTUFBTTtBQUFBLE1BQ3pDO0FBQ0EsWUFBTSxRQUFRLE1BQU0sS0FBSyxZQUFZLDRCQUE0QixVQUFVO0FBQUEsUUFDMUUsWUFBWTtBQUFBLFFBQ1osU0FBUyxLQUFLO0FBQUEsUUFDZCxPQUFPLEtBQUs7QUFBQSxNQUNiLENBQUM7QUFDRCxVQUFJLENBQUMsT0FBTztBQUNYLGFBQUssWUFBWSxNQUFNLCtFQUErRSxPQUFPLElBQUksTUFBTSxrQkFBa0IsU0FBUyxTQUFTLENBQUMsc0RBQXNEO0FBQ2xOLGVBQU8sRUFBRSxPQUFPLE1BQU0sS0FBSyxzQ0FBc0MsU0FBUyxnQkFBZ0IsSUFBSSxRQUFRLFFBQVEsR0FBRyxjQUFjLEtBQUs7QUFBQSxNQUNySTtBQUNBLGFBQU8sRUFBRSxPQUFPLGNBQWMsTUFBTTtBQUFBLElBQ3JDLFNBQVMsS0FBSztBQUNiLFdBQUssWUFBWSxNQUFNLHFGQUFxRixPQUFPLElBQUksTUFBTSxrQkFBa0IsU0FBUyxTQUFTLENBQUMsd0RBQXdELEdBQUc7QUFDN04sYUFBTyxFQUFFLE9BQU8sTUFBTSxLQUFLLHNDQUFzQyxTQUFTLGdCQUFnQixJQUFJLFFBQVEsUUFBUSxHQUFHLGNBQWMsS0FBSztBQUFBLElBQ3JJO0FBQUEsRUFDRDtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBLEVBY0EsTUFBYyxzQ0FBc0MsU0FBc0IsZ0JBQTZCLElBQXNCLFFBQWdCLFVBQXFEO0FBQ2pNLFFBQUk7QUFDSCxhQUFPLE1BQU0saUJBQWlCLGdCQUFnQixJQUFJLEtBQUsscUJBQXFCLFFBQVEsQ0FBQyxRQUFRLENBQUM7QUFBQSxJQUMvRixTQUFTLEtBQUs7QUFDYixXQUFLLFlBQVksTUFBTSw0RkFBNEYsT0FBTyxJQUFJLE1BQU0sa0JBQWtCLFNBQVMsU0FBUyxDQUFDLElBQUksR0FBRztBQUNoTCxhQUFPLENBQUM7QUFBQSxJQUNUO0FBQUEsRUFDRDtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBLEVBY0EsTUFBYyx3Q0FBd0MsU0FBc0IsZ0JBQTZCLElBQXNCLFFBQWdCLG1CQUF5RTtBQUN2TixRQUFJLGtCQUFrQixXQUFXLEdBQUc7QUFDbkMsYUFBTyxDQUFDO0FBQUEsSUFDVDtBQUNBLFFBQUk7QUFDSCxhQUFPLE1BQU0saUJBQWlCLGdCQUFnQixJQUFJLEtBQUsscUJBQXFCLFFBQVEsaUJBQWlCO0FBQUEsSUFDdEcsU0FBUyxLQUFLO0FBQ2IsV0FBSyxZQUFZLE1BQU0sc0dBQXNHLE9BQU8sSUFBSSxNQUFNLElBQUksR0FBRztBQUNySixhQUFPLENBQUM7QUFBQSxJQUNUO0FBQUEsRUFDRDtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUEsRUFNUSwyQkFBMkIsU0FBc0Isb0JBQThDO0FBQ3RHLFVBQU0sT0FBYyxDQUFDO0FBQ3JCLGVBQVcsb0JBQW9CLG9CQUFvQjtBQUNsRCxVQUFJO0FBQ0gsYUFBSyxLQUFLLElBQUksTUFBTSxnQkFBZ0IsQ0FBQztBQUFBLE1BQ3RDLFNBQVMsS0FBSztBQUNiLGFBQUssWUFBWSxLQUFLLHVFQUF1RSxnQkFBZ0IsaUJBQWlCLE9BQU8sSUFBSSxHQUFHO0FBQUEsTUFDN0k7QUFBQSxJQUNEO0FBQ0EsV0FBTztBQUFBLEVBQ1I7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUEsRUFVQSxNQUFjLGlDQUFpQyxTQUFzQixJQUFzQixvQkFBdUMsb0JBQWlFO0FBQ2xNLFVBQU0sdUJBQXVCLEtBQUssMkJBQTJCLFNBQVMsa0JBQWtCO0FBRXhGLFFBQUk7QUFDSixRQUFJO0FBQ0osUUFBSTtBQUNILE9BQUMsRUFBRSxpQkFBaUIsa0JBQWtCLElBQUksTUFBTSwyQkFBMkIsc0JBQXNCLEtBQUssV0FBVztBQUFBLElBQ2xILFNBQVMsS0FBSztBQUNiLFdBQUssWUFBWSxNQUFNLDhGQUE4RixPQUFPLElBQUksR0FBRztBQUNuSTtBQUFBLElBQ0Q7QUFPQSxVQUFNLHdCQUF3QixxQkFBcUIsU0FBUyxJQUN6RCxNQUFNLEtBQUssWUFBWSxrQkFBa0IscUJBQXFCLENBQUMsQ0FBQyxJQUNoRTtBQUNILFVBQU0sdUJBQXVCLHdCQUMxQiwyQkFBMkIsaUJBQWlCLHFCQUFxQixJQUNqRTtBQUNILFVBQU0sb0JBQW9CLE1BQU0sS0FBSyx5QkFBeUIsU0FBUyxFQUFFO0FBS3pFLFVBQU0sVUFBVSxJQUFJLFFBQWlELG9DQUFvQztBQUN6RyxVQUFNLENBQUMsY0FBYyxXQUFXLElBQUksTUFBTSxRQUFRLElBQUk7QUFBQSxNQUNyRCxRQUFRLElBQUksZ0JBQWdCLElBQUksY0FBWSxRQUFRLE1BQU0sWUFBWTtBQU1yRSxZQUFJO0FBQ0gsZ0JBQU0sWUFBWSx5QkFBeUIsVUFDdkMsMkJBQTJCLGlCQUFpQixRQUFRLE1BQU07QUFPOUQsY0FBSSxhQUFhLG9CQUFvQjtBQUNwQyxtQkFBTztBQUFBLFVBQ1I7QUFDQSxnQkFBTSxhQUFhLFlBQ2hCLHFCQUNDLE1BQU0sS0FBSyxZQUFZLGlCQUFpQixRQUFRLElBQUk7QUFDeEQsaUJBQU8sTUFBTSxLQUFLLHdCQUF3QixTQUFTLFVBQVUsVUFBVTtBQUFBLFFBQ3hFLFNBQVMsS0FBSztBQUNiLGVBQUssWUFBWSxNQUFNLDZGQUE2RixPQUFPLGtCQUFrQixTQUFTLFNBQVMsQ0FBQyxJQUFJLEdBQUc7QUFDdkssaUJBQU87QUFBQSxRQUNSO0FBQUEsTUFDRCxDQUFDLENBQUMsQ0FBQztBQUFBLE1BQ0gsS0FBSywwQkFBMEIsU0FBUyxJQUFJLGlCQUFpQjtBQUFBLElBQzlELENBQUMsRUFBRSxRQUFRLE1BQU0sUUFBUSxRQUFRLENBQUM7QUFLbEMsVUFBTSxpQkFBOEQsQ0FBQyxHQUFHLFlBQVk7QUFDcEYsUUFBSSxrQkFBa0IsU0FBUyxHQUFHO0FBQ2pDLHFCQUFlLEtBQUssV0FBVztBQUFBLElBQ2hDO0FBQ0EsVUFBTSxhQUFhLDZCQUE2QixjQUFjO0FBQzlELFFBQUksV0FBVyxZQUFZLFVBQVU7QUFJcEMsV0FBSyxZQUFZLEtBQUssd0ZBQXdGLE9BQU8sa0NBQWtDO0FBQ3ZKO0FBQUEsSUFDRDtBQUVBLFFBQUksWUFBWTtBQUNoQixRQUFJLFlBQVk7QUFDaEIsUUFBSSxRQUFRO0FBQ1osZUFBVyxTQUFTLFdBQVcsa0JBQWtCO0FBQ2hELFlBQU0sVUFBVSxlQUFlLEtBQUs7QUFDcEMsVUFBSSxTQUFTO0FBQ1oscUJBQWEsUUFBUSxhQUFhO0FBQ2xDLHFCQUFhLFFBQVEsYUFBYTtBQUNsQyxpQkFBUyxRQUFRLFNBQVM7QUFBQSxNQUMzQjtBQUFBLElBQ0Q7QUFFQSxVQUFNLGlCQUFpQyxFQUFFLFdBQVcsV0FBVyxNQUFNO0FBQ3JFLFNBQUssc0JBQXNCLFNBQVMsY0FBYztBQUNsRCxTQUFLLGNBQWMseUJBQXlCLFNBQVMsY0FBYztBQUFBLEVBQ3BFO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBLEVBVUEsTUFBYyx3QkFBd0IsU0FBc0IsVUFBZSxZQUFrRjtBQUM1SixRQUFJO0FBQ0gsWUFBTSxRQUFRLE1BQU0sS0FBSyxZQUFZLHdCQUF3QixVQUFVLEVBQUUsWUFBWSxTQUFTLFdBQVcsQ0FBQztBQUMxRyxVQUFJLENBQUMsT0FBTztBQUNYLGFBQUssWUFBWSxNQUFNLDJGQUEyRixPQUFPLGtCQUFrQixTQUFTLFNBQVMsQ0FBQyw2QkFBNkI7QUFDM0wsZUFBTztBQUFBLE1BQ1I7QUFDQSxhQUFPO0FBQUEsSUFDUixTQUFTLEtBQUs7QUFDYixXQUFLLFlBQVksTUFBTSxpR0FBaUcsT0FBTyxrQkFBa0IsU0FBUyxTQUFTLENBQUMsSUFBSSxHQUFHO0FBQzNLLGFBQU87QUFBQSxJQUNSO0FBQUEsRUFDRDtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBLEVBV0EsTUFBYywwQkFBMEIsU0FBc0IsSUFBc0IsbUJBQXFGO0FBQ3hLLFFBQUksa0JBQWtCLFdBQVcsR0FBRztBQUNuQyxhQUFPLENBQUM7QUFBQSxJQUNUO0FBQ0EsUUFBSTtBQUNILGFBQU8sTUFBTSxvQkFBb0IsU0FBUyxJQUFJLEtBQUsscUJBQXFCLFFBQVcsaUJBQWlCO0FBQUEsSUFDckcsU0FBUyxLQUFLO0FBQ2IsV0FBSyxZQUFZLE1BQU0sb0dBQW9HLE9BQU8sSUFBSSxHQUFHO0FBQ3pJLGFBQU87QUFBQSxJQUNSO0FBQUEsRUFDRDtBQUFBLEVBRUEsTUFBYyx5QkFBeUIsU0FBZ0Q7QUFJdEYsVUFBTSxxQkFBcUIsS0FBSyxzQkFBc0IsK0JBQStCLE9BQU87QUFDNUYsV0FBTyxzQkFBc0IsbUJBQW1CLFNBQVMsSUFDdEQsSUFBSSxNQUFNLG1CQUFtQixDQUFDLENBQUMsSUFDL0I7QUFBQSxFQUNKO0FBQUE7QUFBQSxFQUlBLHVCQUF1QixTQUFzQixRQUFnQixlQUF3RDtBQUNwSCxTQUFLLGtDQUFrQyxTQUFTLFFBQVEsYUFBYTtBQUtyRSxRQUFJLEtBQUssaUJBQWlCLFNBQVMsc0JBQXNCLFNBQVMsTUFBTSxDQUFDLEdBQUc7QUFDM0UsV0FBSyxzQ0FBc0MsU0FBUyxRQUFRLGFBQWE7QUFBQSxJQUMxRTtBQUFBLEVBQ0Q7QUFBQSxFQUVBLGVBQWUsU0FBc0IsUUFBNEIsZUFBd0Q7QUFNeEgsU0FBSyxnQ0FBZ0MsT0FBTztBQUM1QyxRQUFJLFdBQVcsUUFBVztBQUN6QixXQUFLLG9DQUFvQyxTQUFTLE1BQU07QUFDeEQsVUFBSSxLQUFLLGlCQUFpQixTQUFTLHNCQUFzQixTQUFTLE1BQU0sQ0FBQyxHQUFHO0FBQzNFLGFBQUssdUJBQXVCLFNBQVMsUUFBUSxNQUFNLGFBQWE7QUFBQSxNQUNqRTtBQUFBLElBQ0Q7QUFFQSxRQUFJLEtBQUssaUJBQWlCLFNBQVMsNkJBQTZCLE9BQU8sQ0FBQyxHQUFHO0FBQzFFLFdBQUssOEJBQThCLFNBQVMsUUFBUSxNQUFNLGFBQWE7QUFBQSxJQUN4RTtBQUVBLFNBQUsseUJBQXlCLFNBQVMsVUFBVSxRQUFRLFFBQVcsTUFBTSxhQUFhO0FBQ3ZGLFNBQUsseUJBQXlCLFNBQVMsV0FBVyxRQUFRLFFBQVcsTUFBTSxhQUFhO0FBQUEsRUFDekY7QUFBQSxFQUVBLG1CQUFtQixTQUE0QjtBQUU5QyxTQUFLLHlCQUF5QixTQUFTLFVBQVUsUUFBVyxRQUFXLElBQUk7QUFDM0UsU0FBSyx5QkFBeUIsU0FBUyxXQUFXLFFBQVcsUUFBVyxJQUFJO0FBQUEsRUFDN0U7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBLEVBVVEsa0NBQWtDLFNBQXNCLFFBQWdCLGVBQXdEO0FBQ3ZJLFNBQUsscUJBQXFCLElBQUksU0FBUyxrQkFBa0IsTUFBTTtBQUM5RCxXQUFLLHFCQUFxQixpQkFBaUIsT0FBTztBQUNsRCxXQUFLLHlCQUF5QixTQUFTLFVBQVUsUUFBUSxRQUFXLE9BQU8sYUFBYTtBQUN4RixXQUFLLHlCQUF5QixTQUFTLFdBQVcsUUFBUSxRQUFXLE9BQU8sYUFBYTtBQUFBLElBQzFGLEdBQUcsMEJBQTBCLGlCQUFpQixDQUFDO0FBQUEsRUFDaEQ7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBLEVBTVEsZ0NBQWdDLFNBQTRCO0FBQ25FLFNBQUsscUJBQXFCLGlCQUFpQixPQUFPO0FBQUEsRUFDbkQ7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQSxFQVFRLHNDQUFzQyxTQUFzQixRQUFnQixlQUF3RDtBQUMzSSxVQUFNLE1BQU0sR0FBRyxPQUFPLEtBQVMsTUFBTTtBQUNyQyxTQUFLLDRCQUE0QixJQUFJLEtBQUssa0JBQWtCLE1BQU07QUFDakUsV0FBSyw0QkFBNEIsaUJBQWlCLEdBQUc7QUFDckQsV0FBSyx1QkFBdUIsU0FBUyxRQUFRLE9BQU8sYUFBYTtBQUFBLElBQ2xFLEdBQUcsMEJBQTBCLGlCQUFpQixDQUFDO0FBQUEsRUFDaEQ7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUEsRUFPUSxvQ0FBb0MsU0FBc0IsUUFBc0I7QUFDdkYsU0FBSyw0QkFBNEIsaUJBQWlCLEdBQUcsT0FBTyxLQUFTLE1BQU0sRUFBRTtBQUFBLEVBQzlFO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQSxFQVNRLHVCQUF1QixTQUFzQixRQUFnQixrQkFBMkIsT0FBTyxlQUF3RDtBQUM5SixTQUFLLDBCQUEwQixNQUFNLEdBQUcsT0FBTyxXQUFtQixNQUFNLElBQUksTUFBTSxLQUFLLHNCQUFzQixTQUFTLFFBQVEsaUJBQWlCLGFBQWEsRUFBRSxLQUFLLE1BQU0sTUFBUyxDQUFDO0FBQUEsRUFDcEw7QUFBQSxFQUVRLDhCQUE4QixTQUFzQixRQUE0QixrQkFBMkIsT0FBTyxlQUF3RDtBQUNqTCxTQUFLLDBCQUEwQixNQUFNLEdBQUcsT0FBTyxpQkFBcUIsTUFBTSxLQUFLLDZCQUE2QixTQUFTLFFBQVEsaUJBQWlCLGFBQWEsRUFBRSxLQUFLLE1BQU0sTUFBUyxDQUFDO0FBQUEsRUFDbkw7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQSxFQVFRLHlCQUF5QixTQUFzQixNQUEyQixlQUF3QixxQkFBdUMsa0JBQTJCLE9BQU8sZUFBd0Q7QUFDMU8sU0FBSywwQkFBMEIsTUFBTSxHQUFHLE9BQU8sS0FBUyxJQUFJLElBQUksTUFBTSxLQUFLLDBCQUEwQixTQUFTLE1BQU0sZUFBZSxxQkFBcUIsaUJBQWlCLGFBQWEsQ0FBQztBQUFBLEVBQ3hMO0FBQUEsRUFFUSw4QkFBOEIsU0FBc0IsTUFBd0Q7QUFDbkgsVUFBTSxlQUFlLG1CQUFtQixTQUFTLElBQUk7QUFDckQsU0FBSyxjQUFjLGtCQUFrQixZQUFZO0FBQ2pELFVBQU0sU0FBUyxLQUFLLGNBQWMsa0JBQWtCLFlBQVksR0FBRztBQUNuRSxRQUFJLFdBQVcsZ0JBQWdCLFdBQVc7QUFDekMsV0FBSyxjQUFjLHFCQUFxQixjQUFjO0FBQUEsUUFDckQsTUFBTSxXQUFXO0FBQUEsUUFDakIsUUFBUSxnQkFBZ0I7QUFBQSxNQUN6QixDQUFDO0FBQUEsSUFDRjtBQUNBLFdBQU87QUFBQSxFQUNSO0FBQUEsRUFFQSxNQUFjLDBCQUEwQixTQUFzQixNQUEyQixlQUF3QixxQkFBdUMsa0JBQTJCLE9BQU8sZUFBaUU7QUFDMVAsVUFBTSxlQUFlLG1CQUFtQixTQUFTLElBQUk7QUFDckQsVUFBTSxZQUFZLFVBQVUsT0FBTztBQUNuQyxVQUFNLHFCQUFxQixLQUFLLHNCQUFzQiwrQkFBK0IsT0FBTztBQUM1RixRQUFJLFVBQWtDO0FBQ3RDLFFBQUksWUFBWTtBQUNoQixRQUFJLGtCQUFrQjtBQUN0QixRQUFJLDBCQUEwQjtBQUc5QixVQUFNLHNCQUFzQixNQUFNO0FBQ2pDLFVBQUksaUJBQWlCO0FBQ3BCLCtDQUF1QyxLQUFLLG1CQUFtQixTQUFTLGVBQWU7QUFBQSxVQUN0RjtBQUFBLFVBQ0E7QUFBQSxVQUNBLFlBQVksVUFBVSxRQUFRO0FBQUEsVUFDOUIsYUFBYSxtQkFBbUIsa0JBQWtCO0FBQUEsVUFDbEQsYUFBYSxvQkFBb0IsVUFBVTtBQUFBLFVBQzNDLEdBQUksWUFBWSxhQUFhLEVBQUUsVUFBVSxJQUFJLENBQUM7QUFBQSxVQUM5QyxHQUFJLFNBQVMsWUFBWSxFQUFFLGlCQUFpQix3QkFBd0IsSUFBSSxDQUFDO0FBQUEsUUFDMUUsR0FBRyxhQUFhO0FBQUEsTUFDakI7QUFBQSxJQUNEO0FBQ0EsU0FBSyxzQkFBc0IsSUFBSSxZQUFZO0FBQzNDLFVBQU0sc0JBQXNCLHVCQUF1QixLQUFLLGNBQWMsa0JBQWtCLFlBQVksR0FBRztBQUN2RyxRQUFJO0FBQ0osUUFBSTtBQUNILFlBQU0sS0FBSyxvQkFBb0IsYUFBYSxJQUFJLE1BQU0sT0FBTyxDQUFDO0FBQUEsSUFDL0QsU0FBUyxLQUFLO0FBQ2IsV0FBSyxZQUFZLEtBQUssbUVBQW1FLElBQUksc0JBQXNCLE9BQU8sSUFBSSxHQUFHO0FBQ2pJLFdBQUssOEJBQThCLGNBQWMsbUJBQW1CO0FBQ3BFLFdBQUssc0JBQXNCLE9BQU8sWUFBWTtBQUM5QyxXQUFLLGNBQWMsMkJBQTJCO0FBQzlDLGdCQUFVO0FBQ1YsMEJBQW9CO0FBQ3BCO0FBQUEsSUFDRDtBQUNBLFNBQUssY0FBYyxrQkFBa0IsWUFBWTtBQUNqRCxRQUFJO0FBQ0gsVUFBSSxRQUFRLE1BQU0sS0FBSyxvQkFBb0IsU0FBUyxJQUFJLFFBQVEsSUFBSTtBQUNwRSxVQUFJLENBQUMsT0FBTztBQUNYLFlBQUksU0FBUyxVQUFVO0FBV3RCLGdCQUFNQyxzQkFBcUIsS0FBSyxzQkFBc0IsK0JBQStCLE9BQU87QUFDNUYsY0FBSSxtQkFBbUJBLG1CQUFrQixHQUFHO0FBQzNDLGtCQUFNLEtBQUssaUNBQWlDLFNBQVMsSUFBSSxRQUFRQSxtQkFBbUI7QUFBQSxVQUNyRjtBQUNBLGVBQUssWUFBWSxNQUFNLCtEQUErRCxPQUFPLGlEQUFpRCx1QkFBdUIsU0FBUyxnQkFBZ0IsS0FBSyxjQUFjLGtCQUFrQixZQUFZLEdBQUcsTUFBTSxVQUFVLENBQUMsRUFBRTtBQUNyUSxlQUFLLDhCQUE4QixjQUFjLG1CQUFtQjtBQUNwRSxvQkFBVTtBQUNWO0FBQUEsUUFDRDtBQVdBLGtDQUEwQjtBQUMxQixjQUFNLGNBQWMsS0FBSyxxQkFBcUIsT0FBTztBQUNyRCxZQUFJO0FBQ0gsY0FBSSxZQUFZLFNBQVMsR0FBRztBQUMzQixrQkFBTSxVQUFnQztBQUFBLGNBQ3JDLEVBQUUsWUFBWSxTQUFTLElBQUksSUFBSSxPQUFPO0FBQUEsY0FDdEMsR0FBRyxZQUFZLElBQUksUUFBTSxFQUFFLFlBQVksRUFBRSxZQUFZLElBQUksRUFBRSxJQUFJLE9BQU8sRUFBRTtBQUFBLFlBQ3pFO0FBTUEsb0JBQVEsTUFBTSxvQkFBb0IsU0FBUyxLQUFLLG1CQUFtQjtBQUFBLFVBQ3BFLE9BQU87QUFDTixnQkFBSTtBQUNKLGdCQUFJLGVBQWU7QUFDbEIsb0JBQU0sZ0JBQWdCLEtBQUssNEJBQTRCLFlBQVk7QUFDbkUsa0JBQUksZUFBZTtBQUNsQiw4QkFBYyxFQUFFLGVBQWUsZUFBZSxDQUFDLEdBQUcsYUFBYSxFQUFFO0FBQ2pFLGtDQUFrQjtBQUFBLGNBQ25CO0FBQUEsWUFDRDtBQUNBLG9CQUFRLE1BQU0sb0JBQW9CLFNBQVMsSUFBSSxRQUFRLEtBQUsscUJBQXFCLFdBQVc7QUFBQSxVQUM3RjtBQUFBLFFBQ0QsVUFBRTtBQUNELHFCQUFXLFFBQVEsYUFBYTtBQUMvQixpQkFBSyxJQUFJLFFBQVE7QUFBQSxVQUNsQjtBQUFBLFFBQ0Q7QUFBQSxNQUNEO0FBRUEsWUFBTSxXQUFXLFNBQVMsY0FBYyxTQUNyQyxNQUFNLEtBQUsscUJBQXFCLFNBQVMsSUFBSSxNQUFNLElBQ25EO0FBQ0gsV0FBSyx1QkFBdUIsU0FBUyxjQUFjLE9BQU8sUUFBUTtBQUNsRSxrQkFBWSxNQUFNO0FBQ2xCLGdCQUFVO0FBS1YsV0FBSyxvQkFBb0IsU0FBUyxjQUFjLElBQUksR0FBRyxLQUFLLFVBQVUsS0FBSyxDQUFDO0FBRTVFLFVBQUksU0FBUyxjQUFjLFFBQVE7QUFJbEMsYUFBSyxvQkFBb0IsU0FBUyxtQkFBbUIsS0FBSyxVQUFVLEtBQUssQ0FBQztBQWtCMUUsY0FBTUEsc0JBQXFCLEtBQUssc0JBQXNCLCtCQUErQixPQUFPO0FBQzVGLFlBQUksbUJBQW1CQSxtQkFBa0IsR0FBRztBQUkzQyxnQkFBTSxLQUFLLGlDQUFpQyxTQUFTLElBQUksUUFBUUEscUJBQXFCLEtBQUs7QUFBQSxRQUM1RixPQUFPO0FBQ04sZ0JBQU0saUJBQWlCLGVBQWUsS0FBSyxLQUFLLEVBQUUsV0FBVyxHQUFHLFdBQVcsR0FBRyxPQUFPLEVBQUU7QUFDdkYsZUFBSyxzQkFBc0IsU0FBUyxjQUFjO0FBQ2xELGVBQUssY0FBYyx5QkFBeUIsU0FBUyxjQUFjO0FBQUEsUUFDcEU7QUFBQSxNQUNEO0FBQUEsSUFDRCxTQUFTLEtBQUs7QUFDYixXQUFLLFlBQVksS0FBSyxpREFBaUQsSUFBSSxVQUFVLEdBQUc7QUFDeEYsV0FBSyxjQUFjLHFCQUFxQixjQUFjO0FBQUEsUUFDckQsTUFBTSxXQUFXO0FBQUEsUUFDakIsUUFBUSxnQkFBZ0I7QUFBQSxRQUN4QixPQUFPLEVBQUUsV0FBVyxpQkFBaUIsU0FBUyxlQUFlLFFBQVEsSUFBSSxVQUFVLE9BQU8sR0FBRyxFQUFFO0FBQUEsTUFDaEcsQ0FBQztBQUNELGdCQUFVO0FBQUEsSUFDWCxVQUFFO0FBQ0QsV0FBSyxzQkFBc0IsT0FBTyxZQUFZO0FBQzlDLFdBQUssY0FBYywyQkFBMkI7QUFDOUMsVUFBSSxRQUFRO0FBQ1osMEJBQW9CO0FBQUEsSUFDckI7QUFBQSxFQUNEO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQSxFQVNRLDhCQUE4QixjQUEyQixRQUEyQztBQUMzRyxRQUFJLENBQUMsVUFBVSxXQUFXLGdCQUFnQixXQUFXO0FBQ3BEO0FBQUEsSUFDRDtBQUNBLFNBQUssY0FBYyxxQkFBcUIsY0FBYztBQUFBLE1BQ3JELE1BQU0sV0FBVztBQUFBLE1BQ2pCO0FBQUEsSUFDRCxDQUFDO0FBQUEsRUFDRjtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQSxFQU9RLDRCQUE0QixjQUFvRTtBQUN2RyxVQUFNLFFBQVEsS0FBSyxjQUFjLGtCQUFrQixZQUFZO0FBQy9ELFFBQUksQ0FBQyxTQUFTLE1BQU0sTUFBTSxXQUFXLEdBQUc7QUFDdkMsYUFBTztBQUFBLElBQ1I7QUFDQSxXQUFPLE1BQU0sTUFBTSxJQUFJLE9BQUssRUFBRSxJQUFJO0FBQUEsRUFDbkM7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUEsRUFPUSx1QkFBdUIsU0FBc0IsY0FBMkIsT0FBb0MsVUFBa0Y7QUFJck0sVUFBTSxhQUFhLEtBQUssMkJBQTJCLGNBQWMsU0FBUyxZQUFZO0FBRXRGLFVBQU0sUUFBeUIsQ0FBQztBQUNoQyxlQUFXLFFBQVEsT0FBTztBQUN6QixZQUFNLEtBQUssS0FBSyxPQUFPLE9BQU8sS0FBSyxRQUFRO0FBQzNDLFVBQUksQ0FBQyxJQUFJO0FBQ1I7QUFBQSxNQUNEO0FBQ0EsVUFBSSxVQUFVO0FBQ2IsY0FBTSxVQUFVLGFBQWEsU0FBUyxVQUFVLElBQUksTUFBTSxFQUFFLENBQUM7QUFDN0QsY0FBTSxLQUFLO0FBQUEsVUFDVjtBQUFBLFVBQUk7QUFBQSxVQUNKLFVBQVUsVUFDUCxTQUFTLE1BQU0sSUFBSSxPQUFPLElBQzFCO0FBQUEsUUFDSixDQUFDO0FBQUEsTUFDRixPQUFPO0FBQ04sY0FBTSxLQUFLLEVBQUUsSUFBSSxLQUFLLENBQUM7QUFBQSxNQUN4QjtBQUFBLElBQ0Q7QUFFQSxTQUFLLGNBQWMscUJBQXFCLGNBQWM7QUFBQSxNQUNyRCxNQUFNLFdBQVc7QUFBQSxNQUNqQjtBQUFBLE1BQ0EsWUFBWSxhQUNULENBQUMsR0FBRyxVQUFVLElBQ2Q7QUFBQSxJQUNKLENBQUM7QUFJRCxVQUFNLFNBQVMsS0FBSyxjQUFjLGtCQUFrQixZQUFZLEdBQUc7QUFDbkUsUUFBSSxXQUFXLGdCQUFnQixPQUFPO0FBQ3JDLFdBQUssY0FBYyxxQkFBcUIsY0FBYztBQUFBLFFBQ3JELE1BQU0sV0FBVztBQUFBLFFBQ2pCLFFBQVEsZ0JBQWdCO0FBQUEsTUFDekIsQ0FBQztBQUFBLElBQ0Y7QUFBQSxFQUNEO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQSxFQVNRLHFCQUFxQixTQUEyRztBQUN2SSxVQUFNLFFBQVEsS0FBSyxjQUFjLGdCQUFnQixPQUFPLEdBQUcsU0FBUyxDQUFDO0FBQ3JFLFVBQU0sVUFBK0YsQ0FBQztBQUN0RyxlQUFXLFFBQVEsT0FBTztBQUN6QixVQUFJLGlCQUFpQixLQUFLLFFBQVEsR0FBRztBQUNwQztBQUFBLE1BQ0Q7QUFDQSxVQUFJO0FBQ0gsY0FBTSxNQUFNLEtBQUssb0JBQW9CLGFBQWEsSUFBSSxNQUFNLEtBQUssUUFBUSxDQUFDO0FBQzFFLGdCQUFRLEtBQUssRUFBRSxZQUFZLEtBQUssVUFBVSxJQUFJLENBQUM7QUFBQSxNQUNoRCxTQUFTLEtBQUs7QUFDYixhQUFLLFlBQVksS0FBSyxzRkFBc0YsS0FBSyxRQUFRLElBQUksR0FBRztBQUFBLE1BQ2pJO0FBQUEsSUFDRDtBQUNBLFdBQU87QUFBQSxFQUNSO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBLEVBVVEseUJBQXlCLFNBQTBDO0FBQzFFLFVBQU0sZUFBZSxLQUFLLGNBQWMsZ0JBQWdCLE9BQU87QUFDL0QsUUFBSSxDQUFDLGNBQWM7QUFDbEIsYUFBTztBQUFBLElBQ1I7QUFFQSxVQUFNLFFBQVEsYUFBYSxTQUFTLENBQUM7QUFDckMsUUFBSSxNQUFNLFVBQVUsR0FBRztBQUN0QixhQUFPLGFBQWEsTUFBTSxHQUFHLEVBQUUsR0FBRztBQUFBLElBQ25DO0FBRUEsUUFBSTtBQUNKLFFBQUksaUJBQWlCO0FBQ3JCLGVBQVcsUUFBUSxPQUFPO0FBQ3pCLFlBQU0sUUFBUSxpQkFBaUIsS0FBSyxRQUFRLElBQ3pDLGFBQWEsUUFDYixLQUFLLGNBQWMsYUFBYSxLQUFLLFFBQVEsR0FBRztBQUNuRCxZQUFNLGFBQWEsT0FBTyxHQUFHLEVBQUUsR0FBRztBQUNsQyxVQUFJLGNBQWMsS0FBSyxjQUFjLGdCQUFnQjtBQUNwRCx5QkFBaUIsS0FBSztBQUN0QixxQkFBYTtBQUFBLE1BQ2Q7QUFBQSxJQUNEO0FBQ0EsV0FBTztBQUFBLEVBQ1I7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBLEVBZUEsTUFBYyxvQkFBb0IsU0FBc0IsSUFBc0IsTUFBNkU7QUFDMUosVUFBTSxtQkFBbUIsS0FBSyxjQUFjLGdCQUFnQixPQUFPLEdBQUcscUJBQXFCLENBQUM7QUFDNUYsUUFBSSxDQUFDLGtCQUFrQjtBQUN0QixhQUFPO0FBQUEsSUFDUjtBQUVBLFFBQUk7QUFDSixRQUFJO0FBQ0gsNEJBQXNCLElBQUksTUFBTSxnQkFBZ0I7QUFBQSxJQUNqRCxRQUFRO0FBQ1AsYUFBTztBQUFBLElBQ1I7QUFHQSxRQUFJLFNBQVMsV0FBVztBQUt2QixZQUFNLGVBQWUsS0FBSyx5QkFBeUIsT0FBTztBQUMxRCxVQUFJLENBQUMsY0FBYztBQUNsQixlQUFPO0FBQUEsTUFDUjtBQUVBLFlBQU0sYUFBYSxJQUFJLE1BQU0sT0FBTztBQUNwQyxZQUFNLENBQUMsVUFBVSxJQUFJLElBQUksTUFBTSxRQUFRLElBQUk7QUFBQSxRQUMxQyxLQUFLLG1CQUFtQixzQkFBc0IsVUFBVTtBQUFBLFFBQ3hELEtBQUssbUJBQW1CLHNCQUFzQixZQUFZLFlBQVk7QUFBQSxNQUN2RSxDQUFDO0FBQ0QsVUFBSSxDQUFDLFlBQVksQ0FBQyxNQUFNO0FBQ3ZCLGVBQU87QUFBQSxNQUNSO0FBRUEsVUFBSTtBQUNILGVBQU8sTUFBTSxLQUFLLFlBQVksNEJBQTRCLHFCQUFxQjtBQUFBLFVBQzlFLFlBQVk7QUFBQSxVQUNaLFNBQVM7QUFBQSxVQUNULE9BQU8sS0FBSztBQUFBLFFBQ2IsQ0FBQztBQUFBLE1BQ0YsU0FBUyxLQUFLO0FBQ2IsYUFBSyxZQUFZLEtBQUssMENBQTBDLElBQUksMERBQTBELEdBQUc7QUFDakksZUFBTztBQUFBLE1BQ1I7QUFBQSxJQUNEO0FBR0EsVUFBTSxhQUFhLE1BQU0sS0FBSyx5QkFBeUIsU0FBUyxFQUFFO0FBRWxFLFFBQUk7QUFDSCxhQUFPLE1BQU0sS0FBSyxZQUFZLHdCQUF3QixxQkFBcUI7QUFBQSxRQUMxRSxZQUFZO0FBQUEsUUFDWjtBQUFBLE1BQ0QsQ0FBQztBQUFBLElBQ0YsU0FBUyxLQUFLO0FBQ2IsV0FBSyxZQUFZLEtBQUssMENBQTBDLElBQUksMERBQTBELEdBQUc7QUFDakksYUFBTztBQUFBLElBQ1I7QUFBQSxFQUNEO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQSxFQU1BLE1BQWMseUJBQXlCLFNBQXNCLElBQW1EO0FBQy9HLFVBQU0sc0JBQXNCLE1BQU0sR0FBRyxZQUFZLHFCQUFxQjtBQUN0RSxVQUFNLHFCQUFxQixvQkFBb0IsS0FBSyxjQUFjLGdCQUFnQixPQUFPLEdBQUcsS0FBSyxHQUFHO0FBQ3BHLFFBQUksQ0FBQyx1QkFBdUIsb0JBQW9CO0FBQy9DLFdBQUssWUFBWSxNQUFNLDBGQUEwRixPQUFPLEtBQUssa0JBQWtCLEVBQUU7QUFBQSxJQUNsSjtBQUNBLFdBQU8sMEJBQTBCLHFCQUFxQixrQkFBa0I7QUFBQSxFQUN6RTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBLEVBUUEsTUFBYyxxQkFBcUIsU0FBc0IsSUFBNEc7QUFDcEssVUFBTSxtQkFBbUIsS0FBSyxjQUFjLGdCQUFnQixPQUFPLEdBQUcscUJBQXFCLENBQUM7QUFDNUYsUUFBSSxDQUFDLGtCQUFrQjtBQUN0QixhQUFPO0FBQUEsSUFDUjtBQUVBLFFBQUk7QUFDSixRQUFJO0FBQ0gsNEJBQXNCLElBQUksTUFBTSxnQkFBZ0I7QUFBQSxJQUNqRCxRQUFRO0FBQ1AsYUFBTztBQUFBLElBQ1I7QUFFQSxVQUFNLFdBQVcsTUFBTSxLQUFLLFlBQVksa0JBQWtCLG1CQUFtQjtBQUM3RSxRQUFJLENBQUMsVUFBVTtBQUNkLGFBQU87QUFBQSxJQUNSO0FBRUEsVUFBTSxhQUFhLE1BQU0sS0FBSyx5QkFBeUIsU0FBUyxFQUFFO0FBQ2xFLFVBQU0sUUFBUSxNQUFNLEtBQUssZUFBZSxpQkFBaUIsU0FBUyxxQkFBcUIsVUFBVTtBQUVqRyxXQUFPLEVBQUUsVUFBVSxNQUFNO0FBQUEsRUFDMUI7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUEsRUFVUSxvQkFBb0IsU0FBc0IsS0FBYSxPQUFxQjtBQUNuRixVQUFNLE1BQU0sS0FBSyxvQkFBb0IsYUFBYSxJQUFJLE1BQU0sT0FBTyxDQUFDO0FBQ3BFLFFBQUksT0FBTyxZQUFZLEtBQUssS0FBSyxFQUFFLE1BQU0sU0FBTztBQUMvQyxXQUFLLFlBQVksS0FBSyxpREFBaUQsR0FBRyxJQUFJLEdBQUc7QUFBQSxJQUNsRixDQUFDLEVBQUUsUUFBUSxNQUFNO0FBQ2hCLFVBQUksUUFBUTtBQUFBLElBQ2IsQ0FBQztBQUFBLEVBQ0Y7QUFDRDtBQTc4Q2EsMEJBWVksb0JBQW9CO0FBWmhDLDRCQUFOO0FBQUEsRUE0Qko7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxHQXJDVTsiLAogICJuYW1lcyI6IFsiY2hhdCIsICJ3b3JraW5nRGlyZWN0b3JpZXMiXQp9Cg==
