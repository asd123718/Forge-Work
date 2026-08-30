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
import * as fs from "fs/promises";
import { RunOnceScheduler, SequencerByKey } from "../../../../base/common/async.js";
import { Emitter } from "../../../../base/common/event.js";
import { appendEscapedMarkdownInlineCode } from "../../../../base/common/htmlContent.js";
import { Disposable } from "../../../../base/common/lifecycle.js";
import { Schemas } from "../../../../base/common/network.js";
import { basename } from "../../../../base/common/path.js";
import { isEqual } from "../../../../base/common/resources.js";
import { URI } from "../../../../base/common/uri.js";
import { generateUuid } from "../../../../base/common/uuid.js";
import { localize } from "../../../../nls.js";
import { createDecorator } from "../../../instantiation/common/instantiation.js";
import { ILogService } from "../../../log/common/log.js";
import { AgentSession } from "../../common/agent.js";
import { getBranchCompletions, IAgentHostGitService, META_DIFF_BASE_BRANCH, tryResolvePrimaryWorktreeRoot } from "../../common/agentHostGitService.js";
import { AgentSystemNotificationKind, AgentSystemNotificationSeverity, toAgentSystemNotificationMeta } from "../../common/meta/agentSystemNotificationMeta.js";
import { schemaProperty } from "../../common/agentHostSchema.js";
import { ISessionDataService } from "../../common/sessionDataService.js";
import { SessionConfigKey } from "../../common/sessionConfigKeys.js";
import { AH_META_IS_ARCHIVED_DB_KEY, AH_META_IS_DONE_DB_KEY, ResponsePartKind } from "../../common/state/sessionState.js";
import { AGENT_BRANCH_PREFIX, AgentBranchNameGenerator } from "./agentBranchNameGenerator.js";
import { ICopilotApiService } from "./copilotApiService.js";
const IAgentHostWorktreeIsolation = createDecorator("agentHostWorktreeIsolation");
const WORKTREE_META_BRANCH = "copilot.worktree.branchName";
const WORKTREE_META_PATH = "copilot.worktree.path";
const WORKTREE_META_REPOSITORY_ROOT = "copilot.worktree.repositoryRoot";
const WORKTREE_META_CREATION_FAILURE = "copilot.worktree.creationFailure";
const MAX_WORKTREE_FAILURE_DIAGNOSTIC_LENGTH = 200;
class SessionWorkingDirectoryMissingError extends Error {
  constructor(workingDirectory, reason) {
    super(reason ? localize("sessionWorkingDirectoryMissingWithReason", "This session couldn't be loaded because its worktree is missing and could not be recreated: {0}", reason) : localize("sessionWorkingDirectoryMissing", "This session couldn't be loaded because its working directory no longer exists: {0}", workingDirectory.fsPath));
    this.workingDirectory = workingDirectory;
    this.reason = reason;
    this.name = "SessionWorkingDirectoryMissingError";
  }
}
const BRANCH_COMPLETION_LIMIT = 25;
const WORKTREE_PROGRESS_DEBOUNCE_MS = 40;
function getWorktreesRoot(repositoryRoot) {
  return URI.joinPath(repositoryRoot, "..", `${basename(repositoryRoot.fsPath)}.worktrees`);
}
function getWorktreeName(branchName, branchPrefix = "") {
  let name = branchName;
  if (branchPrefix && name.startsWith(branchPrefix)) {
    name = name.substring(branchPrefix.length);
  }
  if (name.startsWith(AGENT_BRANCH_PREFIX)) {
    name = name.substring(AGENT_BRANCH_PREFIX.length);
  }
  return name.replace(/\//g, "-");
}
function buildWorktreeAnnouncementText(branchName) {
  return localize(
    "agentHost.worktreeCreated",
    "Created isolated worktree for branch {0}",
    appendEscapedMarkdownInlineCode(branchName)
  ) + "\n\n";
}
function buildWorktreeFailureNotification(diagnostic) {
  const normalizedDiagnostic = normalizeWorktreeFailureDiagnostic(diagnostic);
  const content = normalizedDiagnostic ? localize(
    "agentHost.worktreeCreationFailedWithDiagnostic",
    "Couldn't create the isolated worktree. This session is continuing in the original folder.\n\n{0}",
    appendEscapedMarkdownInlineCode(normalizedDiagnostic)
  ) : localize(
    "agentHost.worktreeCreationFailed",
    "Couldn't create the isolated worktree. This session is continuing in the original folder."
  );
  return {
    kind: ResponsePartKind.SystemNotification,
    content,
    _meta: toAgentSystemNotificationMeta({
      kind: AgentSystemNotificationKind.WorktreeCreationFailure,
      severity: AgentSystemNotificationSeverity.Warning
    })
  };
}
function normalizeWorktreeFailureDiagnostic(diagnostic) {
  const normalized = diagnostic?.replace(/\s+/g, " ").trim();
  if (!normalized) {
    return void 0;
  }
  return normalized.length > MAX_WORKTREE_FAILURE_DIAGNOSTIC_LENGTH ? `${normalized.slice(0, MAX_WORKTREE_FAILURE_DIAGNOSTIC_LENGTH - 3)}...` : normalized;
}
var WorktreeCreationPhase = /* @__PURE__ */ ((WorktreeCreationPhase2) => {
  WorktreeCreationPhase2[WorktreeCreationPhase2["Starting"] = 0] = "Starting";
  WorktreeCreationPhase2[WorktreeCreationPhase2["NamingBranch"] = 1] = "NamingBranch";
  WorktreeCreationPhase2[WorktreeCreationPhase2["CheckingOut"] = 2] = "CheckingOut";
  WorktreeCreationPhase2[WorktreeCreationPhase2["CopyingIncludeFiles"] = 3] = "CopyingIncludeFiles";
  return WorktreeCreationPhase2;
})(WorktreeCreationPhase || {});
function buildWorktreeProgressText(phase, percent) {
  switch (phase) {
    case 1 /* NamingBranch */:
      return localize("agentHost.worktreeNamingBranch", "Creating isolated worktree (naming branch)");
    case 2 /* CheckingOut */:
      return percent === void 0 ? localize("agentHost.worktreeCheckingOut", "Creating isolated worktree (checking out files)") : localize("agentHost.worktreeCheckingOutPercent", "Creating isolated worktree (checking out files, {0}%)", percent);
    case 3 /* CopyingIncludeFiles */:
      return percent === void 0 ? localize("agentHost.worktreeCopyingIncludeFiles", "Creating isolated worktree (copying additional files)") : localize("agentHost.worktreeCopyingIncludeFilesPercent", "Creating isolated worktree (copying additional files, {0}%)", percent);
    default:
      return localize("agentHost.worktreeCreating", "Creating isolated worktree");
  }
}
async function withPercentProgress(phase, onProgress, operation) {
  if (!onProgress) {
    return operation(void 0);
  }
  let lastPercent = -1;
  const scheduler = new RunOnceScheduler(() => onProgress(buildWorktreeProgressText(phase, lastPercent)), WORKTREE_PROGRESS_DEBOUNCE_MS);
  try {
    return await operation(({ filesDone, filesTotal }) => {
      const percent = Math.min(100, Math.floor(filesDone * 100 / filesTotal));
      if (percent <= lastPercent) {
        return;
      }
      lastPercent = percent;
      scheduler.schedule();
    });
  } finally {
    const shouldFlush = scheduler.isScheduled();
    scheduler.dispose();
    if (shouldFlush) {
      onProgress(buildWorktreeProgressText(phase, lastPercent));
    }
  }
}
function prependAnnouncementToFirstTurn(turns, announcement) {
  if (turns.length === 0) {
    return turns;
  }
  const result = turns.slice();
  const first = result[0];
  const part = first.responseParts[0];
  if (part?.kind === ResponsePartKind.Markdown) {
    const responseParts = first.responseParts.slice();
    responseParts[0] = { ...part, content: announcement + part.content };
    result[0] = { ...first, responseParts };
  } else {
    const responseParts = [
      { kind: ResponsePartKind.Markdown, id: generateUuid(), content: announcement },
      ...first.responseParts
    ];
    result[0] = { ...first, responseParts };
  }
  return result;
}
function prependWorktreeFailureToFirstTurn(turns, diagnostic) {
  if (turns.length === 0) {
    return turns;
  }
  const result = turns.slice();
  const first = result[0];
  result[0] = {
    ...first,
    responseParts: [buildWorktreeFailureNotification(diagnostic), ...first.responseParts]
  };
  return result;
}
let WorktreeIsolation = class extends Disposable {
  constructor(branchNameGenerator, _gitService, copilotApiService, _sessionDataService, _logService) {
    super();
    this._gitService = _gitService;
    this._sessionDataService = _sessionDataService;
    this._logService = _logService;
    /** Worktrees materialized during this host process, keyed by sessionId. */
    this._materializedWorktrees = /* @__PURE__ */ new Map();
    this._worktreeDeletionRetries = /* @__PURE__ */ new Map();
    /**
     * Per-session announcement (markdown) emitted as a synthetic streaming
     * markdown part the first time the session sends a message. Surfaces the
     * "Created isolated worktree for branch X" message live during the first
     * turn; the same announcement is re-injected on restore via
     * {@link applyRestoreAnnouncement}.
     */
    this._pendingFirstTurnAnnouncements = /* @__PURE__ */ new Map();
    /**
     * SessionIds of freshly-created worktree-isolation sessions whose worktree
     * has not yet been created (creation is deferred to the first send so the
     * user's prompt can drive branch naming). While a session is in this set the
     * host reports its working directory as "pending" ({@link isWorkingDirectoryPending})
     * so agents defer prewarming / materializing until {@link resolveOnFirstSend}
     * runs. Never populated for restored sessions — their worktree already exists
     * on disk and their persisted working directory already points at it.
     */
    this._pending = /* @__PURE__ */ new Set();
    this._onDidChangeWorkingDirectoryPending = this._register(new Emitter());
    this.onDidChangeWorkingDirectoryPending = this._onDidChangeWorkingDirectoryPending.event;
    /** Fixed log label; one host-owned instance serves every agent. */
    this._logLabel = "AgentHost";
    /**
     * Serializes the worktree lifecycle per session so a first-send creation
     * ({@link resolveOnFirstSend}) never interleaves with archive/unarchive
     * cleanup ({@link cleanupWorktreeOnArchive} / {@link recreateWorktreeOnUnarchive})
     * or deletion ({@link removeSessionWorktree}) for the same session — the
     * guarantee each agent previously enforced with its own sequencer.
     */
    this._sequencer = new SequencerByKey();
    this._worktreeCreationSequencer = new SequencerByKey();
    this._branchNameGenerator = branchNameGenerator ?? new AgentBranchNameGenerator(copilotApiService, this._logService);
  }
  /**
   * Marks a fresh worktree-isolation session as pending — its worktree is
   * deferred to the first send. Called by the host while a creating session's
   * resolved config selects `worktree` isolation.
   */
  notePending(sessionId) {
    if (!this._pending.has(sessionId)) {
      this._pending.add(sessionId);
      this._onDidChangeWorkingDirectoryPending.fire(sessionId);
    }
  }
  /** Clears a pending marker when a session will not materialize a worktree. */
  clearPending(sessionId) {
    if (this._pending.delete(sessionId)) {
      this._onDidChangeWorkingDirectoryPending.fire(sessionId);
    }
  }
  /**
   * Whether a session's worktree is still pending creation. The host exposes
   * this through {@link IAgentConfigurationService.isWorkingDirectoryPending} so
   * agents defer materialization until the host has resolved the worktree.
   */
  isWorkingDirectoryPending(sessionId) {
    return this._pending.has(sessionId);
  }
  /** The worktree created for a session in this process, if any. */
  getResolvedWorktree(sessionId) {
    return this._materializedWorktrees.get(sessionId)?.worktree;
  }
  /**
   * First-send worktree resolution: creates the worktree (when the session
   * selected `worktree` isolation on a git repo) and clears the pending marker
   * regardless of outcome, so a failed creation falls back to folder isolation
   * instead of leaving the session permanently "pending". Delegates to
   * {@link resolveWorkingDirectory}, which is idempotent per session.
   */
  async resolveOnFirstSend(request) {
    return this._sequencer.queue(request.sessionId, async () => {
      try {
        return await this.resolveWorkingDirectory(request);
      } finally {
        this.clearPending(request.sessionId);
      }
    });
  }
  /**
   * Builds the `isolation` / `branch` schema contribution for
   * `resolveSessionConfig`. When {@link IResolveIsolationConfigRequest.workingDirectory}
   * is not a git repository (or has no commits yet) isolation is forced to
   * `folder` and no branch property is offered.
   */
  async resolveIsolationConfig(request) {
    const gitInfo = request.workingDirectory ? await this._getGitInfo(request.workingDirectory) : void 0;
    const isolationProperty = schemaProperty({
      type: "string",
      title: localize("agentHost.sessionConfig.isolation", "Isolation"),
      description: localize("agentHost.sessionConfig.isolationDescription", "Where the agent should make changes"),
      enum: gitInfo ? ["folder", "worktree"] : ["folder"],
      enumLabels: gitInfo ? [localize("agentHost.sessionConfig.isolation.folder", "Folder"), localize("agentHost.sessionConfig.isolation.worktree", "Worktree")] : [localize("agentHost.sessionConfig.isolation.folder", "Folder")],
      enumDescriptions: gitInfo ? [localize("agentHost.sessionConfig.isolation.folderDescription", "Work directly in the folder"), localize("agentHost.sessionConfig.isolation.worktreeDescription", "Create a Git worktree for isolation")] : [localize("agentHost.sessionConfig.isolation.folderDescription", "Work directly in the folder")],
      default: gitInfo ? "worktree" : "folder",
      readOnly: !gitInfo,
      sessionMutable: false
    });
    const isolationDefault = gitInfo ? "worktree" : "folder";
    const isolationValue = isolationProperty.validate(request.config?.[SessionConfigKey.Isolation]) ? request.config[SessionConfigKey.Isolation] : isolationDefault;
    let branchProperty;
    let branchDefault;
    let branchValue;
    let worktreeBranchPrefixProperty;
    let worktreeIncludeFilesProperty;
    let worktreeBranchTrackProperty;
    if (gitInfo) {
      const branchReadOnly = isolationValue === "folder";
      branchDefault = isolationValue === "worktree" ? gitInfo.defaultBranch.name : gitInfo.currentBranch;
      branchValue = isolationValue === "worktree" && typeof request.config?.[SessionConfigKey.Branch] === "string" ? request.config[SessionConfigKey.Branch] : branchDefault;
      branchProperty = schemaProperty({
        type: "string",
        title: localize("agentHost.sessionConfig.branch", "Branch"),
        description: localize("agentHost.sessionConfig.branchDescription", "Base branch to work from"),
        enum: [branchDefault],
        enumLabels: [branchDefault],
        default: branchDefault,
        enumDynamic: !branchReadOnly,
        readOnly: branchReadOnly,
        sessionMutable: false
      });
      worktreeBranchPrefixProperty = schemaProperty({
        type: "string",
        title: localize("agentHost.sessionConfig.worktreeBranchPrefix", "Worktree Branch Prefix"),
        description: localize("agentHost.sessionConfig.worktreeBranchPrefixDescription", "Prefix applied to the branch created for an isolated worktree."),
        readOnly: true,
        sessionMutable: false
      });
      worktreeBranchTrackProperty = schemaProperty({
        type: "boolean",
        title: localize("agentHost.sessionConfig.worktreeBranchTrack", "Worktree Branch Tracking"),
        description: localize("agentHost.sessionConfig.worktreeBranchTrackDescription", "Whether the branch created for an isolated worktree tracks its upstream."),
        default: false,
        readOnly: true,
        sessionMutable: false
      });
      worktreeIncludeFilesProperty = schemaProperty({
        type: "array",
        title: localize("agentHost.sessionConfig.worktreeIncludeFiles", "Worktree Include Files"),
        description: localize("agentHost.sessionConfig.worktreeIncludeFilesDescription", "Glob patterns for git-ignored files to copy into the isolated worktree."),
        items: {
          type: "string",
          title: localize("agentHost.sessionConfig.worktreeIncludeFilesItem", "Pattern")
        },
        readOnly: true,
        sessionMutable: false
      });
    }
    return { isolationProperty, branchProperty, worktreeBranchPrefixProperty, worktreeBranchTrackProperty, worktreeIncludeFilesProperty, isolationValue, branchDefault, branchValue };
  }
  /**
   * Branch-name completions for the branch picker. Callers forward this from
   * their `sessionConfigCompletions` when the requested property is
   * {@link SessionConfigKey.Branch}.
   */
  async branchCompletions(workingDirectory, query) {
    if (!workingDirectory) {
      return { items: [] };
    }
    const [branches, currentBranch, defaultBranch] = await Promise.all([
      this._gitService.getBranches(workingDirectory, { pattern: ["refs/heads"], sort: "committerdate" }),
      this._gitService.getCurrentBranch(workingDirectory),
      this._gitService.getDefaultBranch(workingDirectory)
    ]);
    const branchCompletions = getBranchCompletions(branches.map((branch) => branch.name), {
      currentBranch,
      defaultBranch: defaultBranch?.name,
      query,
      limit: BRANCH_COMPLETION_LIMIT
    });
    return { items: branchCompletions.map((branch) => ({ value: branch, label: branch })) };
  }
  /**
   * Resolves the effective working directory for a session that is about to
   * be materialized. When the session config selects `worktree` isolation on
   * a git repository, creates a fresh branch + worktree, records it for
   * cleanup, queues the first-turn announcement, persists the worktree
   * metadata, and returns the worktree URI. Otherwise returns the requested
   * working directory unchanged.
   */
  async resolveWorkingDirectory(request) {
    const { config, workingDirectory, sessionId, sessionUri, prompt, githubToken, onProgress } = request;
    if (config?.[SessionConfigKey.Isolation] !== "worktree" || !workingDirectory || typeof config[SessionConfigKey.Branch] !== "string") {
      return workingDirectory;
    }
    const already = this._materializedWorktrees.get(sessionId);
    if (already) {
      return already.worktree;
    }
    onProgress?.(buildWorktreeProgressText(0 /* Starting */));
    const checkoutRoot = await this._gitService.getRepositoryRoot(workingDirectory);
    if (!checkoutRoot) {
      return workingDirectory;
    }
    const repositoryRoot = await this._resolvePrimaryWorktreeRoot(checkoutRoot, checkoutRoot);
    const worktreesRoot = getWorktreesRoot(repositoryRoot);
    const worktreeBranchPrefix = typeof config[SessionConfigKey.WorktreeBranchPrefix] === "string" ? config[SessionConfigKey.WorktreeBranchPrefix] : void 0;
    const selectedBranch = config[SessionConfigKey.Branch];
    const { branchName, worktree, baseBranch } = await this._worktreeCreationSequencer.queue(repositoryRoot.toString(), async () => {
      onProgress?.(buildWorktreeProgressText(1 /* NamingBranch */));
      const branchName2 = await this._branchNameGenerator.generateBranchName({
        sessionId,
        message: prompt,
        githubToken,
        branchPrefix: worktreeBranchPrefix,
        branchNameCollides: async (candidate) => {
          if (await this._gitService.branchExists(repositoryRoot, candidate).catch(() => true)) {
            return true;
          }
          const candidateWorktree = URI.joinPath(worktreesRoot, getWorktreeName(candidate, worktreeBranchPrefix));
          return fileExists(candidateWorktree.fsPath);
        }
      });
      const worktree2 = URI.joinPath(worktreesRoot, getWorktreeName(branchName2, worktreeBranchPrefix));
      const baseBranch2 = await this._resolveBranchStartPoint(repositoryRoot, selectedBranch);
      await fs.mkdir(worktreesRoot.fsPath, { recursive: true });
      onProgress?.(buildWorktreeProgressText(2 /* CheckingOut */));
      const worktreeBranchTrack = config[SessionConfigKey.WorktreeBranchTrack] === true;
      await withPercentProgress(2 /* CheckingOut */, onProgress, (progress) => this._gitService.addWorktree(repositoryRoot, worktree2, branchName2, baseBranch2, worktreeBranchTrack, progress));
      return { branchName: branchName2, worktree: worktree2, baseBranch: baseBranch2 };
    });
    const worktreeIncludeFiles = Array.isArray(config[SessionConfigKey.WorktreeIncludeFiles]) && config[SessionConfigKey.WorktreeIncludeFiles].every((pattern) => typeof pattern === "string") ? config[SessionConfigKey.WorktreeIncludeFiles] : void 0;
    if (worktreeIncludeFiles?.length) {
      try {
        onProgress?.(buildWorktreeProgressText(3 /* CopyingIncludeFiles */));
        await withPercentProgress(3 /* CopyingIncludeFiles */, onProgress, (progress) => this._gitService.copyWorktreeIncludeFiles(checkoutRoot, worktree, worktreeIncludeFiles, progress));
      } catch (error) {
        this._logService.warn(`[${this._logLabel}:${sessionId}] Failed to copy worktree include files: ${errorMessage(error)}`);
      }
    }
    this._materializedWorktrees.set(sessionId, { repositoryRoot, worktree });
    this._pendingFirstTurnAnnouncements.set(sessionId, buildWorktreeAnnouncementText(branchName));
    try {
      await this._writeWorktreeMetadata(sessionUri, { branchName, baseBranch, worktreePath: worktree, repositoryRoot });
    } catch (error) {
      this._logService.warn(`[${this._logLabel}:${sessionId}] Failed to persist worktree branch metadata: ${errorMessage(error)}`);
    }
    return worktree;
  }
  /** Resolves a persisted working directory, repairing a removed worktree when possible. */
  async resolveWorkingDirectoryForResume(sessionUri, sessionId, workingDirectory) {
    return this._sequencer.queue(sessionId, () => this._resolveWorkingDirectoryForResume(sessionUri, sessionId, workingDirectory));
  }
  async _resolveWorkingDirectoryForResume(sessionUri, sessionId, workingDirectory) {
    if (workingDirectory.scheme !== Schemas.file) {
      return workingDirectory;
    }
    try {
      await fs.access(workingDirectory.fsPath);
      return workingDirectory;
    } catch {
    }
    const meta = await this._readWorktreeMetadata(sessionUri).catch(() => void 0);
    const archived = await this._isSessionArchived(sessionUri);
    if (archived) {
      if (meta?.repositoryRoot) {
        try {
          await fs.access(meta.repositoryRoot.fsPath);
          this._logService.info(`[${this._logLabel}:${sessionId}] Archived session working directory '${workingDirectory.fsPath}' is missing; resuming against repository root '${meta.repositoryRoot.fsPath}' for history`);
          return meta.repositoryRoot;
        } catch {
        }
      }
      this._logService.warn(`[${this._logLabel}:${sessionId}] Cannot resume archived session: working directory '${workingDirectory.fsPath}' is missing and no usable repository-root fallback was found`);
      throw new SessionWorkingDirectoryMissingError(workingDirectory);
    }
    let recreateFailureReason;
    if (meta?.worktreePath && meta.repositoryRoot) {
      const { branchName, worktreePath, repositoryRoot } = meta;
      const recreated = await this._recreateWorktree(sessionId, { branchName, worktreePath, repositoryRoot });
      if (recreated.ok) {
        this._logService.info(`[${this._logLabel}:${sessionId}] Recreated missing worktree '${worktreePath.fsPath}' for a live session on resume`);
        return worktreePath;
      }
      recreateFailureReason = recreated.reason;
    }
    this._logService.warn(`[${this._logLabel}:${sessionId}] Cannot resume: working directory '${workingDirectory.fsPath}' is missing and its worktree could not be recreated${recreateFailureReason ? `: ${recreateFailureReason}` : ""}`);
    throw new SessionWorkingDirectoryMissingError(workingDirectory, recreateFailureReason);
  }
  /**
   * Takes (and clears) the pending "worktree created" announcement for a
   * session so callers can emit it live as the first response part on the
   * first turn. Returns `undefined` when the session has no pending
   * announcement.
   */
  takePendingAnnouncement(sessionId) {
    const announcement = this._pendingFirstTurnAnnouncements.get(sessionId);
    if (announcement !== void 0) {
      this._pendingFirstTurnAnnouncements.delete(sessionId);
    }
    return announcement;
  }
  async persistCreationFailure(sessionUri, sessionId, diagnostic) {
    const dbRef = this._sessionDataService.openDatabase(sessionUri);
    try {
      await dbRef.object.setMetadata(WORKTREE_META_CREATION_FAILURE, JSON.stringify({
        sessionId,
        diagnostic: normalizeWorktreeFailureDiagnostic(diagnostic)
      }));
    } finally {
      dbRef.dispose();
    }
  }
  /**
   * Re-injects the applicable worktree notice into the first restored turn.
   *
   * The live path ({@link takePendingAnnouncement}) handles the very first
   * turn while the session is fresh; this path takes over on subsequent loads
   * (where the synthetic announcement is not part of the agent transcript).
   */
  async applyRestoreAnnouncement(sessionUri, turns) {
    const notice = await this._readWorktreeNotice(sessionUri).catch(() => void 0);
    if (notice?.kind === "failure") {
      return prependWorktreeFailureToFirstTurn(turns, notice.diagnostic);
    }
    if (notice?.kind !== "success") {
      return turns;
    }
    return prependAnnouncementToFirstTurn(turns, buildWorktreeAnnouncementText(notice.branchName));
  }
  /** Resolves the worktree to remove before the session database is deleted. */
  async prepareSessionDeletion(sessionUri, sessionId) {
    return this._sequencer.queue(sessionId, async () => {
      const deletionRetry = this._worktreeDeletionRetries.get(sessionId);
      if (deletionRetry) {
        return deletionRetry;
      }
      const materializedWorktree = this._materializedWorktrees.get(sessionId);
      if (materializedWorktree) {
        return materializedWorktree;
      }
      try {
        const meta = await this._readWorktreeMetadata(sessionUri);
        return meta?.worktreePath && meta.repositoryRoot ? { repositoryRoot: meta.repositoryRoot, worktree: meta.worktreePath } : void 0;
      } catch (error) {
        this._logService.warn(`[${this._logLabel}:${sessionId}] Failed to read worktree metadata before session deletion: ${errorMessage(error)}`);
        throw error;
      }
    });
  }
  /** Force-removes the resolved worktree after the user confirms session deletion. */
  async removeSessionWorktree(sessionId, worktree) {
    return this._sequencer.queue(sessionId, () => this._removeSessionWorktree(sessionId, worktree));
  }
  async _removeSessionWorktree(sessionId, worktree) {
    this.clearPending(sessionId);
    if (!worktree) {
      return;
    }
    try {
      await this._gitService.removeWorktree(worktree.repositoryRoot, worktree.worktree, { force: true });
      this._materializedWorktrees.delete(sessionId);
      this._worktreeDeletionRetries.delete(sessionId);
    } catch (error) {
      this._worktreeDeletionRetries.set(sessionId, worktree);
      this._logService.warn(`[${this._logLabel}:${sessionId}] Failed to remove worktree '${worktree.worktree.fsPath}': ${errorMessage(error)}`);
      throw error;
    }
  }
  /**
   * On archive, removes the worktree directory when its branch is preserved
   * and the working tree is clean, so the worktree can be recreated on
   * unarchive without losing work. Skips the removal when the branch is
   * missing or the tree is dirty.
   */
  async cleanupWorktreeOnArchive(sessionUri, sessionId) {
    return this._sequencer.queue(sessionId, () => this._cleanupWorktreeOnArchive(sessionUri, sessionId));
  }
  async _cleanupWorktreeOnArchive(sessionUri, sessionId) {
    const meta = await this._readWorktreeMetadata(sessionUri).catch(() => void 0);
    if (!meta?.worktreePath || !meta.repositoryRoot) {
      return;
    }
    const { branchName, worktreePath, repositoryRoot } = meta;
    try {
      await fs.access(worktreePath.fsPath);
    } catch {
      this._materializedWorktrees.delete(sessionId);
      return;
    }
    const branchPresent = await this._gitService.branchExists(repositoryRoot, branchName).catch(() => false);
    if (!branchPresent) {
      this._logService.info(`[${this._logLabel}:${sessionId}] Skipping worktree cleanup: branch '${branchName}' is missing`);
      return;
    }
    const hasUncommittedChanges = await this._gitService.hasUncommittedChanges(worktreePath).catch(() => true);
    if (hasUncommittedChanges) {
      try {
        await this._gitService.commitAll(worktreePath, localize("worktreeIsolation.commitMessage", "Saving uncommitted changes before archiving session"));
      } catch (error) {
        this._logService.warn(`[${this._logLabel}:${sessionId}] Failed to commit uncommitted changes in '${worktreePath.fsPath}': ${errorMessage(error)}`);
        return;
      }
    }
    try {
      await this._gitService.removeWorktree(repositoryRoot, worktreePath);
      this._logService.info(`[${this._logLabel}:${sessionId}] Removed worktree '${worktreePath.fsPath}' on archive`);
      this._materializedWorktrees.delete(sessionId);
    } catch (error) {
      this._logService.warn(`[${this._logLabel}:${sessionId}] Failed to remove worktree '${worktreePath.fsPath}' on archive: ${errorMessage(error)}`);
    }
  }
  /**
   * On unarchive, recreates a previously cleaned-up worktree against its
   * preserved branch. No-op when the directory still exists or the branch is
   * missing.
   */
  async recreateWorktreeOnUnarchive(sessionUri, sessionId) {
    return this._sequencer.queue(sessionId, () => this._recreateWorktreeOnUnarchive(sessionUri, sessionId));
  }
  async _recreateWorktreeOnUnarchive(sessionUri, sessionId) {
    const meta = await this._readWorktreeMetadata(sessionUri).catch(() => void 0);
    if (!meta?.worktreePath || !meta.repositoryRoot) {
      return;
    }
    try {
      await fs.access(meta.worktreePath.fsPath);
      return;
    } catch {
    }
    const { branchName, worktreePath, repositoryRoot } = meta;
    await this._recreateWorktree(sessionId, { branchName, worktreePath, repositoryRoot });
  }
  async _recreateWorktree(sessionId, meta) {
    const { branchName, worktreePath, repositoryRoot } = meta;
    const branchPresent = await this._gitService.branchExists(repositoryRoot, branchName).catch(() => false);
    if (!branchPresent) {
      const reason = localize("worktreeRecreateBranchMissing", "the branch '{0}' no longer exists", branchName);
      this._logService.info(`[${this._logLabel}:${sessionId}] Cannot recreate worktree: branch '${branchName}' is missing`);
      return { ok: false, reason };
    }
    try {
      await fs.mkdir(URI.joinPath(worktreePath, "..").fsPath, { recursive: true });
      await this._gitService.addExistingWorktree(repositoryRoot, worktreePath, branchName);
      this._materializedWorktrees.set(sessionId, { repositoryRoot, worktree: worktreePath });
      this._logService.info(`[${this._logLabel}:${sessionId}] Recreated worktree '${worktreePath.fsPath}'`);
      return { ok: true };
    } catch (error) {
      const reason = errorMessage(error);
      this._logService.warn(`[${this._logLabel}:${sessionId}] Failed to recreate worktree '${worktreePath.fsPath}': ${reason}`);
      return { ok: false, reason };
    }
  }
  /** Reads the persisted worktree metadata for a session, if any. */
  async readWorktreeMetadata(sessionUri) {
    return this._readWorktreeMetadata(sessionUri);
  }
  /**
   * Bridges worktree metadata for a legacy session adopted in place, whose
   * working directory is a pre-existing git worktree the agent host did not
   * create. When `workingDirectory` is a linked worktree (its checkout root
   * differs from the repository's primary worktree root), persists the worktree
   * branch / path / repository-root (and diff base branch) so the adopted
   * session groups under its repository and computes diffs against the right
   * base — parity with natively worktree-isolated sessions. Deliberately does
   * NOT register the worktree as host-created, so disposing the session never
   * deletes the user-owned worktree. Returns `true` when metadata was recorded.
   */
  async adoptExistingWorktreeMetadata(sessionUri, workingDirectory) {
    const linkedWorktree = await this._resolveLinkedWorktree(workingDirectory);
    if (!linkedWorktree) {
      return false;
    }
    const { worktreeRoot, primaryRoot, baseBranch } = linkedWorktree;
    const branchName = await this._gitService.getCurrentBranch(worktreeRoot).catch(() => void 0) ?? "HEAD";
    await this._writeWorktreeMetadata(sessionUri, { branchName, baseBranch, worktreePath: worktreeRoot, repositoryRoot: primaryRoot });
    return true;
  }
  /**
   * Records repository identity for an externally-owned linked worktree without taking ownership of its lifecycle.
   */
  async recordExternalWorktreeProject(sessionUri, workingDirectory) {
    const linkedWorktree = await this._resolveLinkedWorktree(workingDirectory);
    if (!linkedWorktree) {
      return void 0;
    }
    const { primaryRoot, baseBranch } = linkedWorktree;
    const dbRef = this._sessionDataService.openDatabase(sessionUri);
    try {
      const work = [
        dbRef.object.setMetadata(WORKTREE_META_REPOSITORY_ROOT, primaryRoot.toString())
      ];
      if (baseBranch) {
        work.push(dbRef.object.setMetadata(META_DIFF_BASE_BRANCH, baseBranch));
      }
      await Promise.all(work);
    } finally {
      dbRef.dispose();
    }
    return projectFromRepositoryRoot(primaryRoot);
  }
  async _resolveLinkedWorktree(workingDirectory) {
    const worktreeRoot = await this._gitService.getRepositoryRoot(workingDirectory).catch(() => void 0);
    if (!worktreeRoot) {
      return void 0;
    }
    const primaryRoot = await tryResolvePrimaryWorktreeRoot(this._gitService, worktreeRoot).catch(() => void 0);
    if (!primaryRoot || isEqual(primaryRoot, worktreeRoot)) {
      return void 0;
    }
    const baseBranch = (await this._gitService.getDefaultBranch(primaryRoot).catch(() => void 0))?.name;
    return { worktreeRoot, primaryRoot, baseBranch };
  }
  /**
   * Resolves the repository "project" for a worktree-isolated session from its
   * persisted worktree metadata. Worktree sessions run out of a
   * `<repo>.worktrees/<name>` directory, but in the sessions UI they must group
   * under the *repository* (e.g. `vscode`) — not the worktree folder — exactly
   * like Copilot. Returns the repository root as the project so agents can merge
   * it into the `project` field of the `IAgentSessionMetadata` reported from
   * `listSessions` / `getSessionMetadata`; without it a list refresh clears the
   * transient project set by the materialize event and the workspace reverts to
   * the worktree directory name. Returns `undefined` for sessions that were never
   * worktree-isolated, leaving the caller's own folder-based project untouched.
   */
  async resolveWorktreeProject(sessionUri) {
    const meta = await this._readWorktreeMetadata(sessionUri).catch(() => void 0);
    return meta?.repositoryRoot ? projectFromRepositoryRoot(meta.repositoryRoot) : void 0;
  }
  async _resolvePrimaryWorktreeRoot(checkoutRoot, fallbackRoot) {
    try {
      return await tryResolvePrimaryWorktreeRoot(this._gitService, checkoutRoot) ?? fallbackRoot;
    } catch (error) {
      this._logService.warn(`[${this._logLabel}] Failed to resolve primary worktree for '${checkoutRoot.fsPath}': ${errorMessage(error)}`);
      return fallbackRoot;
    }
  }
  /**
   * Synchronous companion to {@link resolveWorktreeProject} for the
   * materialize-event path: the repository project for a worktree this agent
   * created in the current process, or `undefined` when the session has none.
   * Lets an agent supply the materialize event's `project` without an async
   * metadata read so a fresh worktree groups under the repository the moment it
   * materializes.
   */
  sessionWorktreeProject(sessionId) {
    const worktree = this._materializedWorktrees.get(sessionId);
    return worktree ? projectFromRepositoryRoot(worktree.repositoryRoot) : void 0;
  }
  async _getGitInfo(workingDirectory) {
    const repositoryRoot = await this._gitService.getRepositoryRoot(workingDirectory);
    if (!repositoryRoot) {
      return void 0;
    }
    const headCommit = await this._gitService.revParse(repositoryRoot, "HEAD").catch(() => void 0);
    if (!headCommit) {
      return void 0;
    }
    const currentBranch = await this._gitService.getCurrentBranch(repositoryRoot) ?? "HEAD";
    const defaultBranch = await this._gitService.getDefaultBranch(repositoryRoot) ?? { name: currentBranch, startPoint: currentBranch };
    return { currentBranch, defaultBranch };
  }
  async _resolveBranchStartPoint(repositoryRoot, selectedBranch) {
    const defaultBranch = await this._gitService.getDefaultBranch(repositoryRoot);
    return defaultBranch?.name === selectedBranch ? defaultBranch.startPoint : selectedBranch;
  }
  async _writeWorktreeMetadata(sessionUri, metadata) {
    const dbRef = this._sessionDataService.openDatabase(sessionUri);
    try {
      const work = [
        dbRef.object.setMetadata(WORKTREE_META_BRANCH, metadata.branchName),
        dbRef.object.setMetadata(WORKTREE_META_PATH, metadata.worktreePath.toString()),
        dbRef.object.setMetadata(WORKTREE_META_REPOSITORY_ROOT, metadata.repositoryRoot.toString())
      ];
      if (metadata.baseBranch) {
        work.push(dbRef.object.setMetadata(META_DIFF_BASE_BRANCH, metadata.baseBranch));
      }
      await Promise.all(work);
    } finally {
      dbRef.dispose();
    }
  }
  /**
   * Reads persisted worktree metadata, canonicalizing, repairing, and persisting the repository root when needed.
   * It probes an existing worktree when available and otherwise falls back to the persisted root for archived sessions.
   * The repair is only reachable when {@link WORKTREE_META_BRANCH} is present, so a root
   * persisted without its branch will never heal.
   */
  async _readWorktreeMetadata(sessionUri) {
    const ref = await this._sessionDataService.tryOpenDatabase(sessionUri);
    if (!ref) {
      return void 0;
    }
    try {
      const [branchName, worktreePathRaw, repositoryRootRaw] = await Promise.all([
        ref.object.getMetadata(WORKTREE_META_BRANCH),
        ref.object.getMetadata(WORKTREE_META_PATH),
        ref.object.getMetadata(WORKTREE_META_REPOSITORY_ROOT)
      ]);
      if (!branchName) {
        return void 0;
      }
      const worktreePath = worktreePathRaw ? URI.parse(worktreePathRaw) : void 0;
      let repositoryRoot = repositoryRootRaw ? URI.parse(repositoryRootRaw) : void 0;
      if (repositoryRoot) {
        const checkoutRoot = worktreePath && await fileExists(worktreePath.fsPath) ? worktreePath : repositoryRoot;
        const primaryRoot = await this._resolvePrimaryWorktreeRoot(checkoutRoot, repositoryRoot);
        if (primaryRoot.toString() !== repositoryRoot.toString()) {
          repositoryRoot = primaryRoot;
          try {
            await ref.object.setMetadata(WORKTREE_META_REPOSITORY_ROOT, primaryRoot.toString());
          } catch (error) {
            this._logService.warn(`[${this._logLabel}] Failed to normalize worktree repository metadata for '${sessionUri.toString()}': ${errorMessage(error)}`);
          }
        }
      }
      return { branchName, worktreePath, repositoryRoot };
    } finally {
      ref.dispose();
    }
  }
  async _readWorktreeNotice(sessionUri) {
    const ref = await this._sessionDataService.tryOpenDatabase(sessionUri);
    if (!ref) {
      return void 0;
    }
    try {
      const [branchName, failureRaw] = await Promise.all([
        ref.object.getMetadata(WORKTREE_META_BRANCH),
        ref.object.getMetadata(WORKTREE_META_CREATION_FAILURE)
      ]);
      if (branchName) {
        return { kind: "success", branchName };
      }
      if (!failureRaw) {
        return void 0;
      }
      const failure = JSON.parse(failureRaw);
      if (!failure || typeof failure !== "object" || Array.isArray(failure)) {
        return void 0;
      }
      const raw = failure;
      if (raw["sessionId"] !== AgentSession.id(sessionUri)) {
        return void 0;
      }
      return {
        kind: "failure",
        diagnostic: typeof raw["diagnostic"] === "string" ? normalizeWorktreeFailureDiagnostic(raw["diagnostic"]) : void 0
      };
    } finally {
      ref.dispose();
    }
  }
  async _isSessionArchived(sessionUri) {
    const ref = await this._sessionDataService.tryOpenDatabase(sessionUri);
    if (!ref) {
      return false;
    }
    try {
      const [isArchived, isDone] = await Promise.all([
        ref.object.getMetadata(AH_META_IS_ARCHIVED_DB_KEY),
        ref.object.getMetadata(AH_META_IS_DONE_DB_KEY)
      ]);
      return isArchived !== void 0 ? isArchived === "true" : isDone === "true";
    } finally {
      ref.dispose();
    }
  }
};
WorktreeIsolation = __decorateClass([
  __decorateParam(1, IAgentHostGitService),
  __decorateParam(2, ICopilotApiService),
  __decorateParam(3, ISessionDataService),
  __decorateParam(4, ILogService)
], WorktreeIsolation);
function projectFromRepositoryRoot(repositoryRoot) {
  return { uri: repositoryRoot, displayName: basename(repositoryRoot.fsPath) || repositoryRoot.toString() };
}
function worktreeProjectFromRepositoryRoot(repositoryRootRaw) {
  return repositoryRootRaw ? projectFromRepositoryRoot(URI.parse(repositoryRootRaw)) : void 0;
}
function errorMessage(error) {
  return error instanceof Error ? error.message : String(error);
}
async function fileExists(path) {
  try {
    await fs.access(path);
    return true;
  } catch {
    return false;
  }
}
export {
  IAgentHostWorktreeIsolation,
  SessionWorkingDirectoryMissingError,
  WORKTREE_META_REPOSITORY_ROOT,
  WorktreeCreationPhase,
  WorktreeIsolation,
  buildWorktreeAnnouncementText,
  buildWorktreeFailureNotification,
  buildWorktreeProgressText,
  getWorktreeName,
  getWorktreesRoot,
  normalizeWorktreeFailureDiagnostic,
  prependAnnouncementToFirstTurn,
  worktreeProjectFromRepositoryRoot
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxwbGF0Zm9ybVxcYWdlbnRIb3N0XFxub2RlXFxzaGFyZWRcXHdvcmt0cmVlSXNvbGF0aW9uLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0ICogYXMgZnMgZnJvbSAnZnMvcHJvbWlzZXMnO1xuaW1wb3J0IHsgUnVuT25jZVNjaGVkdWxlciwgU2VxdWVuY2VyQnlLZXkgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9hc3luYy5qcyc7XG5pbXBvcnQgeyBFbWl0dGVyLCBFdmVudCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2V2ZW50LmpzJztcbmltcG9ydCB7IGFwcGVuZEVzY2FwZWRNYXJrZG93bklubGluZUNvZGUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9odG1sQ29udGVudC5qcyc7XG5pbXBvcnQgeyBEaXNwb3NhYmxlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IFNjaGVtYXMgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9uZXR3b3JrLmpzJztcbmltcG9ydCB7IGJhc2VuYW1lIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vcGF0aC5qcyc7XG5pbXBvcnQgeyBpc0VxdWFsIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vcmVzb3VyY2VzLmpzJztcbmltcG9ydCB7IFVSSSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3VyaS5qcyc7XG5pbXBvcnQgeyBnZW5lcmF0ZVV1aWQgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi91dWlkLmpzJztcbmltcG9ydCB7IGxvY2FsaXplIH0gZnJvbSAnLi4vLi4vLi4vLi4vbmxzLmpzJztcbmltcG9ydCB7IGNyZWF0ZURlY29yYXRvciB9IGZyb20gJy4uLy4uLy4uL2luc3RhbnRpYXRpb24vY29tbW9uL2luc3RhbnRpYXRpb24uanMnO1xuaW1wb3J0IHsgSUxvZ1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9sb2cvY29tbW9uL2xvZy5qcyc7XG5pbXBvcnQgeyBBZ2VudFNlc3Npb24sIElBZ2VudFNlc3Npb25Qcm9qZWN0SW5mbyB9IGZyb20gJy4uLy4uL2NvbW1vbi9hZ2VudC5qcyc7XG5pbXBvcnQgeyBnZXRCcmFuY2hDb21wbGV0aW9ucywgSUFnZW50SG9zdEdpdFNlcnZpY2UsIElEZWZhdWx0QnJhbmNoLCBJV29ya3RyZWVGaWxlUHJvZ3Jlc3MsIE1FVEFfRElGRl9CQVNFX0JSQU5DSCwgdHJ5UmVzb2x2ZVByaW1hcnlXb3JrdHJlZVJvb3QgfSBmcm9tICcuLi8uLi9jb21tb24vYWdlbnRIb3N0R2l0U2VydmljZS5qcyc7XG5pbXBvcnQgeyBBZ2VudFN5c3RlbU5vdGlmaWNhdGlvbktpbmQsIEFnZW50U3lzdGVtTm90aWZpY2F0aW9uU2V2ZXJpdHksIHRvQWdlbnRTeXN0ZW1Ob3RpZmljYXRpb25NZXRhIH0gZnJvbSAnLi4vLi4vY29tbW9uL21ldGEvYWdlbnRTeXN0ZW1Ob3RpZmljYXRpb25NZXRhLmpzJztcbmltcG9ydCB7IElTY2hlbWFQcm9wZXJ0eSwgc2NoZW1hUHJvcGVydHkgfSBmcm9tICcuLi8uLi9jb21tb24vYWdlbnRIb3N0U2NoZW1hLmpzJztcbmltcG9ydCB7IElTZXNzaW9uRGF0YVNlcnZpY2UgfSBmcm9tICcuLi8uLi9jb21tb24vc2Vzc2lvbkRhdGFTZXJ2aWNlLmpzJztcbmltcG9ydCB7IFNlc3Npb25Db25maWdLZXkgfSBmcm9tICcuLi8uLi9jb21tb24vc2Vzc2lvbkNvbmZpZ0tleXMuanMnO1xuaW1wb3J0IHsgQUhfTUVUQV9JU19BUkNISVZFRF9EQl9LRVksIEFIX01FVEFfSVNfRE9ORV9EQl9LRVksIFJlc3BvbnNlUGFydCwgUmVzcG9uc2VQYXJ0S2luZCwgVHVybiB9IGZyb20gJy4uLy4uL2NvbW1vbi9zdGF0ZS9zZXNzaW9uU3RhdGUuanMnO1xuaW1wb3J0IHsgQUdFTlRfQlJBTkNIX1BSRUZJWCwgQWdlbnRCcmFuY2hOYW1lR2VuZXJhdG9yLCBJQWdlbnRCcmFuY2hOYW1lR2VuZXJhdG9yIH0gZnJvbSAnLi9hZ2VudEJyYW5jaE5hbWVHZW5lcmF0b3IuanMnO1xuaW1wb3J0IHsgSUNvcGlsb3RBcGlTZXJ2aWNlIH0gZnJvbSAnLi9jb3BpbG90QXBpU2VydmljZS5qcyc7XG5cbmV4cG9ydCBjb25zdCBJQWdlbnRIb3N0V29ya3RyZWVJc29sYXRpb24gPSBjcmVhdGVEZWNvcmF0b3I8SUFnZW50SG9zdFdvcmt0cmVlSXNvbGF0aW9uPignYWdlbnRIb3N0V29ya3RyZWVJc29sYXRpb24nKTtcblxuZXhwb3J0IGludGVyZmFjZSBJQWdlbnRIb3N0V29ya3RyZWVJc29sYXRpb24ge1xuXHRyZWFkb25seSBfc2VydmljZUJyYW5kOiB1bmRlZmluZWQ7XG5cdHJlYWRvbmx5IG9uRGlkQ2hhbmdlV29ya2luZ0RpcmVjdG9yeVBlbmRpbmc6IEV2ZW50PHN0cmluZz47XG5cdGlzV29ya2luZ0RpcmVjdG9yeVBlbmRpbmcoc2Vzc2lvbklkOiBzdHJpbmcpOiBib29sZWFuO1xufVxuXG4vKipcbiAqIFBlci1zZXNzaW9uLWRhdGFiYXNlIG1ldGFkYXRhIGtleXMgdW5kZXIgd2hpY2ggdGhlIHdvcmt0cmVlIGFuIGFnZW50XG4gKiBjcmVhdGVkIGZvciBhbiBpc29sYXRlZCBzZXNzaW9uIGlzIHJlY29yZGVkLiBUaGUgc3RyaW5nIHZhbHVlcyBrZWVwIHRoZVxuICogaGlzdG9yaWNhbCBgY29waWxvdC53b3JrdHJlZS4qYCBwcmVmaXggc28gc2Vzc2lvbnMgbWF0ZXJpYWxpemVkIGJ5IGVhcmxpZXJcbiAqIENvcGlsb3QgYnVpbGRzIGtlZXAgcmVzb2x2aW5nIHRoZWlyIHdvcmt0cmVlIG9uIGFyY2hpdmUgLyB1bmFyY2hpdmUgL1xuICogcmVzdG9yZSBhZnRlciB0aGlzIGxvZ2ljIHdhcyB1bmlmaWVkIGFjcm9zcyBhZ2VudHMuIEFsbCBhZ2VudHMgKENvcGlsb3QsXG4gKiBDb2RleCwgQ2xhdWRlKSBub3cgd3JpdGUgYW5kIHJlYWQgdGhlc2Ugc2FtZSBrZXlzOyB0aGUgcGVyLXNlc3Npb24gZGF0YWJhc2VcbiAqIGlzIGFscmVhZHkgc2NvcGVkIGJ5IHNlc3Npb24sIHNvIHRoZXJlIGlzIG5vIGNyb3NzLWFnZW50IGNvbGxpc2lvbi5cbiAqL1xuY29uc3QgV09SS1RSRUVfTUVUQV9CUkFOQ0ggPSAnY29waWxvdC53b3JrdHJlZS5icmFuY2hOYW1lJztcbmNvbnN0IFdPUktUUkVFX01FVEFfUEFUSCA9ICdjb3BpbG90Lndvcmt0cmVlLnBhdGgnO1xuZXhwb3J0IGNvbnN0IFdPUktUUkVFX01FVEFfUkVQT1NJVE9SWV9ST09UID0gJ2NvcGlsb3Qud29ya3RyZWUucmVwb3NpdG9yeVJvb3QnO1xuY29uc3QgV09SS1RSRUVfTUVUQV9DUkVBVElPTl9GQUlMVVJFID0gJ2NvcGlsb3Qud29ya3RyZWUuY3JlYXRpb25GYWlsdXJlJztcbmNvbnN0IE1BWF9XT1JLVFJFRV9GQUlMVVJFX0RJQUdOT1NUSUNfTEVOR1RIID0gMjAwO1xuXG4vKiogVGhyb3duIHdoZW4gYSBwZXJzaXN0ZWQgc2Vzc2lvbiB3b3JraW5nIGRpcmVjdG9yeSBpcyBtaXNzaW5nIGFuZCBjYW5ub3QgYmUgcmVwYWlyZWQuICovXG5leHBvcnQgY2xhc3MgU2Vzc2lvbldvcmtpbmdEaXJlY3RvcnlNaXNzaW5nRXJyb3IgZXh0ZW5kcyBFcnJvciB7XG5cdGNvbnN0cnVjdG9yKHJlYWRvbmx5IHdvcmtpbmdEaXJlY3Rvcnk6IFVSSSwgcmVhZG9ubHkgcmVhc29uPzogc3RyaW5nKSB7XG5cdFx0c3VwZXIocmVhc29uXG5cdFx0XHQ/IGxvY2FsaXplKCdzZXNzaW9uV29ya2luZ0RpcmVjdG9yeU1pc3NpbmdXaXRoUmVhc29uJywgXCJUaGlzIHNlc3Npb24gY291bGRuJ3QgYmUgbG9hZGVkIGJlY2F1c2UgaXRzIHdvcmt0cmVlIGlzIG1pc3NpbmcgYW5kIGNvdWxkIG5vdCBiZSByZWNyZWF0ZWQ6IHswfVwiLCByZWFzb24pXG5cdFx0XHQ6IGxvY2FsaXplKCdzZXNzaW9uV29ya2luZ0RpcmVjdG9yeU1pc3NpbmcnLCBcIlRoaXMgc2Vzc2lvbiBjb3VsZG4ndCBiZSBsb2FkZWQgYmVjYXVzZSBpdHMgd29ya2luZyBkaXJlY3Rvcnkgbm8gbG9uZ2VyIGV4aXN0czogezB9XCIsIHdvcmtpbmdEaXJlY3RvcnkuZnNQYXRoKSk7XG5cdFx0dGhpcy5uYW1lID0gJ1Nlc3Npb25Xb3JraW5nRGlyZWN0b3J5TWlzc2luZ0Vycm9yJztcblx0fVxufVxuXG4vKiogRGVmYXVsdCB1cHBlciBib3VuZCBvbiBicmFuY2ggbmFtZXMgcmV0dXJuZWQgZm9yIHRoZSBicmFuY2ggcGlja2VyLiAqL1xuY29uc3QgQlJBTkNIX0NPTVBMRVRJT05fTElNSVQgPSAyNTtcbmNvbnN0IFdPUktUUkVFX1BST0dSRVNTX0RFQk9VTkNFX01TID0gNDA7XG5cbmludGVyZmFjZSBJU2Vzc2lvbldvcmt0cmVlIHtcblx0cmVhZG9ubHkgcmVwb3NpdG9yeVJvb3Q6IFVSSTtcblx0cmVhZG9ubHkgd29ya3RyZWU6IFVSSTtcbn1cblxuaW50ZXJmYWNlIElXb3JrdHJlZU1ldGFkYXRhIHtcblx0cmVhZG9ubHkgYnJhbmNoTmFtZTogc3RyaW5nO1xuXHRyZWFkb25seSB3b3JrdHJlZVBhdGg/OiBVUkk7XG5cdHJlYWRvbmx5IHJlcG9zaXRvcnlSb290PzogVVJJO1xufVxuXG4vKipcbiAqIFRoZSBgPHJlcG8+Lndvcmt0cmVlc2Agc2libGluZyBkaXJlY3Rvcnkgd2hlcmUgcGVyLXNlc3Npb24gaXNvbGF0ZWRcbiAqIHdvcmt0cmVlcyBhcmUgY3JlYXRlZCwgZS5nLiBgL3NyYy92c2NvZGVgIFx1MjE5MiBgL3NyYy92c2NvZGUud29ya3RyZWVzYC5cbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIGdldFdvcmt0cmVlc1Jvb3QocmVwb3NpdG9yeVJvb3Q6IFVSSSk6IFVSSSB7XG5cdHJldHVybiBVUkkuam9pblBhdGgocmVwb3NpdG9yeVJvb3QsICcuLicsIGAke2Jhc2VuYW1lKHJlcG9zaXRvcnlSb290LmZzUGF0aCl9Lndvcmt0cmVlc2ApO1xufVxuXG4vKipcbiAqIERlcml2ZXMgdGhlIG9uLWRpc2sgd29ya3RyZWUgZGlyZWN0b3J5IG5hbWUgZnJvbSBhIGJyYW5jaCBuYW1lOiBzdHJpcHMgdGhlXG4gKiBjYWxsZXItc3VwcGxpZWQgcHJlZml4IChlLmcuIHRoZSB1c2VyJ3MgYGdpdC5icmFuY2hQcmVmaXhgKSBhbmQgdGhlIGJ1aWx0LWluXG4gKiBgYWdlbnRzL2AgcHJlZml4IHNvIHRoZSBkaXJlY3Rvcnkgc3RheXMgY29uY2lzZSwgdGhlbiBmbGF0dGVucyBhbnkgcmVtYWluaW5nXG4gKiBwYXRoIHNlcGFyYXRvcnMuXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiBnZXRXb3JrdHJlZU5hbWUoYnJhbmNoTmFtZTogc3RyaW5nLCBicmFuY2hQcmVmaXg6IHN0cmluZyA9ICcnKTogc3RyaW5nIHtcblx0bGV0IG5hbWUgPSBicmFuY2hOYW1lO1xuXHRpZiAoYnJhbmNoUHJlZml4ICYmIG5hbWUuc3RhcnRzV2l0aChicmFuY2hQcmVmaXgpKSB7XG5cdFx0bmFtZSA9IG5hbWUuc3Vic3RyaW5nKGJyYW5jaFByZWZpeC5sZW5ndGgpO1xuXHR9XG5cdGlmIChuYW1lLnN0YXJ0c1dpdGgoQUdFTlRfQlJBTkNIX1BSRUZJWCkpIHtcblx0XHRuYW1lID0gbmFtZS5zdWJzdHJpbmcoQUdFTlRfQlJBTkNIX1BSRUZJWC5sZW5ndGgpO1xuXHR9XG5cdHJldHVybiBuYW1lLnJlcGxhY2UoL1xcLy9nLCAnLScpO1xufVxuXG4vKipcbiAqIEJ1aWxkcyB0aGUgbG9jYWxpemVkIFwiQ3JlYXRlZCBpc29sYXRlZCB3b3JrdHJlZSBmb3IgYnJhbmNoIFhcIiBtYXJrZG93biBzaG93blxuICogYXQgdGhlIHRvcCBvZiB0aGUgZmlyc3QgcmVzcG9uc2UgaW4gd29ya3RyZWUtaXNvbGF0ZWQgc2Vzc2lvbnMuIFRoZSBicmFuY2hcbiAqIG5hbWUgaXMgd3JhcHBlZCBhcyBpbmxpbmUgY29kZSBzbyB0aGUgbG9jYWxpemVkIHRlbXBsYXRlIGRvZXNuJ3QgaGF2ZSB0b1xuICogZW1iZWQgbWFya2Rvd24gcHVuY3R1YXRpb24uIFRoZSB0cmFpbGluZyBibGFuayBsaW5lIGtlZXBzIHRoZSBhbm5vdW5jZW1lbnRcbiAqIHZpc3VhbGx5IHNlcGFyYXRlZCB3aGVuIGl0IGdldHMgbWVyZ2VkIGludG8gdGhlIHNhbWUgbWFya2Rvd24gcGFydCBhcyB0aGVcbiAqIG1vZGVsJ3MgcmVwbHkuXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiBidWlsZFdvcmt0cmVlQW5ub3VuY2VtZW50VGV4dChicmFuY2hOYW1lOiBzdHJpbmcpOiBzdHJpbmcge1xuXHRyZXR1cm4gbG9jYWxpemUoXG5cdFx0J2FnZW50SG9zdC53b3JrdHJlZUNyZWF0ZWQnLFxuXHRcdFwiQ3JlYXRlZCBpc29sYXRlZCB3b3JrdHJlZSBmb3IgYnJhbmNoIHswfVwiLFxuXHRcdGFwcGVuZEVzY2FwZWRNYXJrZG93bklubGluZUNvZGUoYnJhbmNoTmFtZSlcblx0KSArICdcXG5cXG4nO1xufVxuXG4vKiogQnVpbGRzIHRoZSB3YXJuaW5nIHNob3duIHdoZW4gd29ya3RyZWUgaXNvbGF0aW9uIGZhbGxzIGJhY2sgdG8gdGhlIG9yaWdpbmFsIGZvbGRlci4gKi9cbmV4cG9ydCBmdW5jdGlvbiBidWlsZFdvcmt0cmVlRmFpbHVyZU5vdGlmaWNhdGlvbihkaWFnbm9zdGljPzogc3RyaW5nKTogRXh0cmFjdDxSZXNwb25zZVBhcnQsIHsga2luZDogUmVzcG9uc2VQYXJ0S2luZC5TeXN0ZW1Ob3RpZmljYXRpb24gfT4ge1xuXHRjb25zdCBub3JtYWxpemVkRGlhZ25vc3RpYyA9IG5vcm1hbGl6ZVdvcmt0cmVlRmFpbHVyZURpYWdub3N0aWMoZGlhZ25vc3RpYyk7XG5cdGNvbnN0IGNvbnRlbnQgPSBub3JtYWxpemVkRGlhZ25vc3RpY1xuXHRcdD8gbG9jYWxpemUoXG5cdFx0XHQnYWdlbnRIb3N0Lndvcmt0cmVlQ3JlYXRpb25GYWlsZWRXaXRoRGlhZ25vc3RpYycsXG5cdFx0XHRcIkNvdWxkbid0IGNyZWF0ZSB0aGUgaXNvbGF0ZWQgd29ya3RyZWUuIFRoaXMgc2Vzc2lvbiBpcyBjb250aW51aW5nIGluIHRoZSBvcmlnaW5hbCBmb2xkZXIuXFxuXFxuezB9XCIsXG5cdFx0XHRhcHBlbmRFc2NhcGVkTWFya2Rvd25JbmxpbmVDb2RlKG5vcm1hbGl6ZWREaWFnbm9zdGljKVxuXHRcdClcblx0XHQ6IGxvY2FsaXplKFxuXHRcdFx0J2FnZW50SG9zdC53b3JrdHJlZUNyZWF0aW9uRmFpbGVkJyxcblx0XHRcdFwiQ291bGRuJ3QgY3JlYXRlIHRoZSBpc29sYXRlZCB3b3JrdHJlZS4gVGhpcyBzZXNzaW9uIGlzIGNvbnRpbnVpbmcgaW4gdGhlIG9yaWdpbmFsIGZvbGRlci5cIlxuXHRcdCk7XG5cdHJldHVybiB7XG5cdFx0a2luZDogUmVzcG9uc2VQYXJ0S2luZC5TeXN0ZW1Ob3RpZmljYXRpb24sXG5cdFx0Y29udGVudCxcblx0XHRfbWV0YTogdG9BZ2VudFN5c3RlbU5vdGlmaWNhdGlvbk1ldGEoe1xuXHRcdFx0a2luZDogQWdlbnRTeXN0ZW1Ob3RpZmljYXRpb25LaW5kLldvcmt0cmVlQ3JlYXRpb25GYWlsdXJlLFxuXHRcdFx0c2V2ZXJpdHk6IEFnZW50U3lzdGVtTm90aWZpY2F0aW9uU2V2ZXJpdHkuV2FybmluZyxcblx0XHR9KSxcblx0fTtcbn1cblxuLyoqIE5vcm1hbGl6ZXMgYW4gYXJiaXRyYXJ5IHdvcmt0cmVlIGZhaWx1cmUgaW50byBhIGJvdW5kZWQgc2luZ2xlLWxpbmUgZGlhZ25vc3RpYy4gKi9cbmV4cG9ydCBmdW5jdGlvbiBub3JtYWxpemVXb3JrdHJlZUZhaWx1cmVEaWFnbm9zdGljKGRpYWdub3N0aWM6IHN0cmluZyB8IHVuZGVmaW5lZCk6IHN0cmluZyB8IHVuZGVmaW5lZCB7XG5cdGNvbnN0IG5vcm1hbGl6ZWQgPSBkaWFnbm9zdGljPy5yZXBsYWNlKC9cXHMrL2csICcgJykudHJpbSgpO1xuXHRpZiAoIW5vcm1hbGl6ZWQpIHtcblx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHR9XG5cdHJldHVybiBub3JtYWxpemVkLmxlbmd0aCA+IE1BWF9XT1JLVFJFRV9GQUlMVVJFX0RJQUdOT1NUSUNfTEVOR1RIXG5cdFx0PyBgJHtub3JtYWxpemVkLnNsaWNlKDAsIE1BWF9XT1JLVFJFRV9GQUlMVVJFX0RJQUdOT1NUSUNfTEVOR1RIIC0gMyl9Li4uYFxuXHRcdDogbm9ybWFsaXplZDtcbn1cblxuLyoqXG4gKiBUaGUgc3RlcHMgb2Ygd29ya3RyZWUgY3JlYXRpb24gdGhhdCBhcmUgc2xvdyBlbm91Z2ggdG8gYmUgd29ydGggbmFtaW5nIHdoaWxlXG4gKiBhIHNlc3Npb24gbWF0ZXJpYWxpemVzLiBPcmRlcmVkIGFzIHRoZXkgcnVuLlxuICovXG5leHBvcnQgY29uc3QgZW51bSBXb3JrdHJlZUNyZWF0aW9uUGhhc2Uge1xuXHQvKiogUXVldWVkIGJlaGluZCBhbm90aGVyIHdvcmt0cmVlIGJlaW5nIGNyZWF0ZWQgaW4gdGhlIHNhbWUgcmVwb3NpdG9yeS4gKi9cblx0U3RhcnRpbmcsXG5cdC8qKiBBc2tpbmcgdGhlIG1vZGVsIGZvciBhIGJyYW5jaCBuYW1lLCB0aGVuIHByb2JpbmcgY2FuZGlkYXRlcyBmb3IgY29sbGlzaW9ucy4gKi9cblx0TmFtaW5nQnJhbmNoLFxuXHQvKiogYGdpdCB3b3JrdHJlZSBhZGRgIFx1MjAxNCB0aGUgcGhhc2UgdGhhdCByZXBvcnRzIGZpbGUtbGV2ZWwgcHJvZ3Jlc3MuICovXG5cdENoZWNraW5nT3V0LFxuXHQvKiogQ29weWluZyB0aGUgZ2l0LWlnbm9yZWQgZmlsZXMgdGhlIGNsaWVudCBhc2tlZCB0byBjYXJyeSBvdmVyLiAqL1xuXHRDb3B5aW5nSW5jbHVkZUZpbGVzLFxufVxuXG4vKipcbiAqIEJ1aWxkcyB0aGUgbG9jYWxpemVkIGFjdGl2aXR5IGxhYmVsIGZvciBhIHdvcmt0cmVlLWNyZWF0aW9uIHBoYXNlLiBgcGVyY2VudGBcbiAqIG9ubHkgYXBwbGllcyB0byB0aGUgcGhhc2VzIHRoYXQgcmVwb3J0IGZpbGUtbGV2ZWwgcHJvZ3Jlc3NcbiAqICh7QGxpbmsgV29ya3RyZWVDcmVhdGlvblBoYXNlLkNoZWNraW5nT3V0fSBhbmRcbiAqIHtAbGluayBXb3JrdHJlZUNyZWF0aW9uUGhhc2UuQ29weWluZ0luY2x1ZGVGaWxlc30pLCB3aGVyZSBpdCBpcyBhYnNlbnQgdW50aWxcbiAqIHRoZSBmaXJzdCBzYW1wbGUgYXJyaXZlcy5cbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIGJ1aWxkV29ya3RyZWVQcm9ncmVzc1RleHQocGhhc2U6IFdvcmt0cmVlQ3JlYXRpb25QaGFzZSwgcGVyY2VudD86IG51bWJlcik6IHN0cmluZyB7XG5cdHN3aXRjaCAocGhhc2UpIHtcblx0XHRjYXNlIFdvcmt0cmVlQ3JlYXRpb25QaGFzZS5OYW1pbmdCcmFuY2g6XG5cdFx0XHRyZXR1cm4gbG9jYWxpemUoJ2FnZW50SG9zdC53b3JrdHJlZU5hbWluZ0JyYW5jaCcsIFwiQ3JlYXRpbmcgaXNvbGF0ZWQgd29ya3RyZWUgKG5hbWluZyBicmFuY2gpXCIpO1xuXHRcdGNhc2UgV29ya3RyZWVDcmVhdGlvblBoYXNlLkNoZWNraW5nT3V0OlxuXHRcdFx0cmV0dXJuIHBlcmNlbnQgPT09IHVuZGVmaW5lZFxuXHRcdFx0XHQ/IGxvY2FsaXplKCdhZ2VudEhvc3Qud29ya3RyZWVDaGVja2luZ091dCcsIFwiQ3JlYXRpbmcgaXNvbGF0ZWQgd29ya3RyZWUgKGNoZWNraW5nIG91dCBmaWxlcylcIilcblx0XHRcdFx0OiBsb2NhbGl6ZSgnYWdlbnRIb3N0Lndvcmt0cmVlQ2hlY2tpbmdPdXRQZXJjZW50JywgXCJDcmVhdGluZyBpc29sYXRlZCB3b3JrdHJlZSAoY2hlY2tpbmcgb3V0IGZpbGVzLCB7MH0lKVwiLCBwZXJjZW50KTtcblx0XHRjYXNlIFdvcmt0cmVlQ3JlYXRpb25QaGFzZS5Db3B5aW5nSW5jbHVkZUZpbGVzOlxuXHRcdFx0cmV0dXJuIHBlcmNlbnQgPT09IHVuZGVmaW5lZFxuXHRcdFx0XHQ/IGxvY2FsaXplKCdhZ2VudEhvc3Qud29ya3RyZWVDb3B5aW5nSW5jbHVkZUZpbGVzJywgXCJDcmVhdGluZyBpc29sYXRlZCB3b3JrdHJlZSAoY29weWluZyBhZGRpdGlvbmFsIGZpbGVzKVwiKVxuXHRcdFx0XHQ6IGxvY2FsaXplKCdhZ2VudEhvc3Qud29ya3RyZWVDb3B5aW5nSW5jbHVkZUZpbGVzUGVyY2VudCcsIFwiQ3JlYXRpbmcgaXNvbGF0ZWQgd29ya3RyZWUgKGNvcHlpbmcgYWRkaXRpb25hbCBmaWxlcywgezB9JSlcIiwgcGVyY2VudCk7XG5cdFx0ZGVmYXVsdDpcblx0XHRcdHJldHVybiBsb2NhbGl6ZSgnYWdlbnRIb3N0Lndvcmt0cmVlQ3JlYXRpbmcnLCBcIkNyZWF0aW5nIGlzb2xhdGVkIHdvcmt0cmVlXCIpO1xuXHR9XG59XG5cbi8qKlxuICogQWRhcHRzIHRoZSByYXcgZmlsZSBjb3VudHMgdGhlIGdpdCBzZXJ2aWNlIHJlcG9ydHMgaW50byBwcm9ncmVzcyBsYWJlbHMgZm9yXG4gKiBhIHBoYXNlLiBSb3VuZHMgZG93biB0byB3aG9sZSBwZXJjZW50YWdlcywgZHJvcHMgbm9uLWFkdmFuY2luZyBzYW1wbGVzLCBhbmRcbiAqIGRlYm91bmNlcyB1cGRhdGVzIHRvIGF2b2lkIG92ZXJ3aGVsbWluZyBjb25zdW1lcnMsIGZsdXNoaW5nIHRoZSBsYXRlc3RcbiAqIHBlcmNlbnRhZ2Ugd2hlbiB0aGUgb3BlcmF0aW9uIGNvbXBsZXRlcy5cbiAqL1xuYXN5bmMgZnVuY3Rpb24gd2l0aFBlcmNlbnRQcm9ncmVzczxUPihcblx0cGhhc2U6IFdvcmt0cmVlQ3JlYXRpb25QaGFzZSxcblx0b25Qcm9ncmVzczogKChhY3Rpdml0eTogc3RyaW5nKSA9PiB2b2lkKSB8IHVuZGVmaW5lZCxcblx0b3BlcmF0aW9uOiAob25Qcm9ncmVzczogKChwcm9ncmVzczogSVdvcmt0cmVlRmlsZVByb2dyZXNzKSA9PiB2b2lkKSB8IHVuZGVmaW5lZCkgPT4gUHJvbWlzZTxUPixcbik6IFByb21pc2U8VD4ge1xuXHRpZiAoIW9uUHJvZ3Jlc3MpIHtcblx0XHRyZXR1cm4gb3BlcmF0aW9uKHVuZGVmaW5lZCk7XG5cdH1cblxuXHRsZXQgbGFzdFBlcmNlbnQgPSAtMTtcblx0Y29uc3Qgc2NoZWR1bGVyID0gbmV3IFJ1bk9uY2VTY2hlZHVsZXIoKCkgPT4gb25Qcm9ncmVzcyhidWlsZFdvcmt0cmVlUHJvZ3Jlc3NUZXh0KHBoYXNlLCBsYXN0UGVyY2VudCkpLCBXT1JLVFJFRV9QUk9HUkVTU19ERUJPVU5DRV9NUyk7XG5cdHRyeSB7XG5cdFx0cmV0dXJuIGF3YWl0IG9wZXJhdGlvbigoeyBmaWxlc0RvbmUsIGZpbGVzVG90YWwgfSkgPT4ge1xuXHRcdFx0Y29uc3QgcGVyY2VudCA9IE1hdGgubWluKDEwMCwgTWF0aC5mbG9vcihmaWxlc0RvbmUgKiAxMDAgLyBmaWxlc1RvdGFsKSk7XG5cdFx0XHRpZiAocGVyY2VudCA8PSBsYXN0UGVyY2VudCkge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cdFx0XHRsYXN0UGVyY2VudCA9IHBlcmNlbnQ7XG5cdFx0XHRzY2hlZHVsZXIuc2NoZWR1bGUoKTtcblx0XHR9KTtcblx0fSBmaW5hbGx5IHtcblx0XHRjb25zdCBzaG91bGRGbHVzaCA9IHNjaGVkdWxlci5pc1NjaGVkdWxlZCgpO1xuXHRcdHNjaGVkdWxlci5kaXNwb3NlKCk7XG5cdFx0aWYgKHNob3VsZEZsdXNoKSB7XG5cdFx0XHRvblByb2dyZXNzKGJ1aWxkV29ya3RyZWVQcm9ncmVzc1RleHQocGhhc2UsIGxhc3RQZXJjZW50KSk7XG5cdFx0fVxuXHR9XG59XG5cbi8qKlxuICogUmV0dXJucyBhIGNvcHkgb2YgYHR1cm5zYCB3aGVyZSBgYW5ub3VuY2VtZW50YCBoYXMgYmVlbiBwcmVwZW5kZWQgdG8gdGhlXG4gKiBmaXJzdCB0b3AtbGV2ZWwgYXNzaXN0YW50IHR1cm4ncyBmaXJzdCBtYXJrZG93biByZXNwb25zZSBwYXJ0LiBVc2VkIG9uXG4gKiBzZXNzaW9uIHJlc3RvcmUgc28gdGhlIHdvcmt0cmVlIGFubm91bmNlbWVudCByZW1haW5zIHZpc2libGUgYWZ0ZXIgdGhlXG4gKiBzZXNzaW9uIGlzIHJlb3BlbmVkLiBJZiBubyBhc3Npc3RhbnQgY29udGVudCBleGlzdHMgeWV0LCBhIGZyZXNoIG1hcmtkb3duXG4gKiBwYXJ0IGlzIGluc2VydGVkIGF0IHRoZSB0b3Agb2YgdGhlIGZpcnN0IHR1cm4uXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiBwcmVwZW5kQW5ub3VuY2VtZW50VG9GaXJzdFR1cm4odHVybnM6IHJlYWRvbmx5IFR1cm5bXSwgYW5ub3VuY2VtZW50OiBzdHJpbmcpOiByZWFkb25seSBUdXJuW10ge1xuXHRpZiAodHVybnMubGVuZ3RoID09PSAwKSB7XG5cdFx0cmV0dXJuIHR1cm5zO1xuXHR9XG5cdGNvbnN0IHJlc3VsdCA9IHR1cm5zLnNsaWNlKCk7XG5cdGNvbnN0IGZpcnN0ID0gcmVzdWx0WzBdO1xuXHRjb25zdCBwYXJ0ID0gZmlyc3QucmVzcG9uc2VQYXJ0c1swXTtcblx0aWYgKHBhcnQ/LmtpbmQgPT09IFJlc3BvbnNlUGFydEtpbmQuTWFya2Rvd24pIHtcblx0XHRjb25zdCByZXNwb25zZVBhcnRzID0gZmlyc3QucmVzcG9uc2VQYXJ0cy5zbGljZSgpO1xuXHRcdHJlc3BvbnNlUGFydHNbMF0gPSB7IC4uLnBhcnQsIGNvbnRlbnQ6IGFubm91bmNlbWVudCArIHBhcnQuY29udGVudCB9O1xuXHRcdHJlc3VsdFswXSA9IHsgLi4uZmlyc3QsIHJlc3BvbnNlUGFydHMgfTtcblx0fSBlbHNlIHtcblx0XHRjb25zdCByZXNwb25zZVBhcnRzOiBSZXNwb25zZVBhcnRbXSA9IFtcblx0XHRcdHsga2luZDogUmVzcG9uc2VQYXJ0S2luZC5NYXJrZG93biwgaWQ6IGdlbmVyYXRlVXVpZCgpLCBjb250ZW50OiBhbm5vdW5jZW1lbnQgfSxcblx0XHRcdC4uLmZpcnN0LnJlc3BvbnNlUGFydHMsXG5cdFx0XTtcblx0XHRyZXN1bHRbMF0gPSB7IC4uLmZpcnN0LCByZXNwb25zZVBhcnRzIH07XG5cdH1cblx0cmV0dXJuIHJlc3VsdDtcbn1cblxuZnVuY3Rpb24gcHJlcGVuZFdvcmt0cmVlRmFpbHVyZVRvRmlyc3RUdXJuKHR1cm5zOiByZWFkb25seSBUdXJuW10sIGRpYWdub3N0aWM6IHN0cmluZyB8IHVuZGVmaW5lZCk6IHJlYWRvbmx5IFR1cm5bXSB7XG5cdGlmICh0dXJucy5sZW5ndGggPT09IDApIHtcblx0XHRyZXR1cm4gdHVybnM7XG5cdH1cblx0Y29uc3QgcmVzdWx0ID0gdHVybnMuc2xpY2UoKTtcblx0Y29uc3QgZmlyc3QgPSByZXN1bHRbMF07XG5cdHJlc3VsdFswXSA9IHtcblx0XHQuLi5maXJzdCxcblx0XHRyZXNwb25zZVBhcnRzOiBbYnVpbGRXb3JrdHJlZUZhaWx1cmVOb3RpZmljYXRpb24oZGlhZ25vc3RpYyksIC4uLmZpcnN0LnJlc3BvbnNlUGFydHNdLFxuXHR9O1xuXHRyZXR1cm4gcmVzdWx0O1xufVxuXG4vKiogUGFyYW1ldGVycyBmb3Ige0BsaW5rIFdvcmt0cmVlSXNvbGF0aW9uLnJlc29sdmVJc29sYXRpb25Db25maWd9LiAqL1xuZXhwb3J0IGludGVyZmFjZSBJUmVzb2x2ZUlzb2xhdGlvbkNvbmZpZ1JlcXVlc3Qge1xuXHRyZWFkb25seSB3b3JraW5nRGlyZWN0b3J5OiBVUkkgfCB1bmRlZmluZWQ7XG5cdHJlYWRvbmx5IGNvbmZpZzogUmVjb3JkPHN0cmluZywgdW5rbm93bj4gfCB1bmRlZmluZWQ7XG59XG5cbi8qKlxuICogVGhlIGlzb2xhdGlvbiArIGJyYW5jaCBzY2hlbWEgY29udHJpYnV0aW9uIGZvciBhbiBhZ2VudCdzXG4gKiBgcmVzb2x2ZVNlc3Npb25Db25maWdgLiBDYWxsZXJzIG1lcmdlIHtAbGluayBpc29sYXRpb25Qcm9wZXJ0eX0gKGFuZFxuICoge0BsaW5rIGJyYW5jaFByb3BlcnR5fSAvIHtAbGluayB3b3JrdHJlZUJyYW5jaFByZWZpeFByb3BlcnR5fSB3aGVuIHByZXNlbnQpXG4gKiBpbnRvIHRoZWlyIG93biBzY2hlbWEgYW5kIG1lcmdlIHRoZSBkZWZhdWx0IHZhbHVlcyAoe0BsaW5rIGlzb2xhdGlvblZhbHVlfSAvXG4gKiB7QGxpbmsgYnJhbmNoRGVmYXVsdH0pIGludG8gdGhlIGRlZmF1bHRzIGJhZyB0aGV5IHBhc3MgdG8gYHZhbGlkYXRlT3JEZWZhdWx0YC5cbiAqL1xuZXhwb3J0IGludGVyZmFjZSBJSXNvbGF0aW9uQ29uZmlnQ29udHJpYnV0aW9uIHtcblx0cmVhZG9ubHkgaXNvbGF0aW9uUHJvcGVydHk6IElTY2hlbWFQcm9wZXJ0eTwnZm9sZGVyJyB8ICd3b3JrdHJlZSc+O1xuXHRyZWFkb25seSBicmFuY2hQcm9wZXJ0eTogSVNjaGVtYVByb3BlcnR5PHN0cmluZz4gfCB1bmRlZmluZWQ7XG5cdC8qKlxuXHQgKiBSZWFkLW9ubHkgY2FycmllciBmb3IgdGhlIGNsaWVudCdzIGBnaXQuYnJhbmNoUHJlZml4YC4gRGVjbGFyZWQgZm9yIGJvdGhcblx0ICogaXNvbGF0aW9ucyAobGlrZSBgYnJhbmNoYCkgc28gdGhlIHZhbHVlIHJpZGVzIGBfY29uZmlnLnZhbHVlc2AgYW5kXG5cdCAqIHN1cnZpdmVzIGlzb2xhdGlvbiB0b2dnbGVzOyB0aGUgaG9zdCBvbmx5IGNvbnN1bWVzIGl0IGZvciB3b3JrdHJlZVxuXHQgKiBpc29sYXRpb24gKHNlZSB7QGxpbmsgV29ya3RyZWVJc29sYXRpb24ucmVzb2x2ZVdvcmtpbmdEaXJlY3Rvcnl9KS5cblx0ICovXG5cdHJlYWRvbmx5IHdvcmt0cmVlQnJhbmNoUHJlZml4UHJvcGVydHk6IElTY2hlbWFQcm9wZXJ0eTxzdHJpbmc+IHwgdW5kZWZpbmVkO1xuXHQvKiogUmVhZC1vbmx5IGNhcnJpZXIgZm9yIHRoZSBjbGllbnQncyBgZ2l0Lndvcmt0cmVlSW5jbHVkZUZpbGVzYC4gKi9cblx0cmVhZG9ubHkgd29ya3RyZWVJbmNsdWRlRmlsZXNQcm9wZXJ0eTogSVNjaGVtYVByb3BlcnR5PHJlYWRvbmx5IHN0cmluZ1tdPiB8IHVuZGVmaW5lZDtcblx0LyoqIFJlYWQtb25seSBjYXJyaWVyIGZvciB0aGUgcHJvZ3JhbW1hdGljIHdvcmt0cmVlIGJyYW5jaCB0cmFja2luZyBwcmVmZXJlbmNlLiAqL1xuXHRyZWFkb25seSB3b3JrdHJlZUJyYW5jaFRyYWNrUHJvcGVydHk6IElTY2hlbWFQcm9wZXJ0eTxib29sZWFuPiB8IHVuZGVmaW5lZDtcblx0cmVhZG9ubHkgaXNvbGF0aW9uVmFsdWU6ICdmb2xkZXInIHwgJ3dvcmt0cmVlJztcblx0cmVhZG9ubHkgYnJhbmNoRGVmYXVsdDogc3RyaW5nIHwgdW5kZWZpbmVkO1xuXHRyZWFkb25seSBicmFuY2hWYWx1ZTogc3RyaW5nIHwgdW5kZWZpbmVkO1xufVxuXG4vKiogUGFyYW1ldGVycyBmb3Ige0BsaW5rIFdvcmt0cmVlSXNvbGF0aW9uLnJlc29sdmVXb3JraW5nRGlyZWN0b3J5fS4gKi9cbmV4cG9ydCBpbnRlcmZhY2UgSVJlc29sdmVXb3JraW5nRGlyZWN0b3J5UmVxdWVzdCB7XG5cdHJlYWRvbmx5IHNlc3Npb25Vcmk6IFVSSTtcblx0cmVhZG9ubHkgc2Vzc2lvbklkOiBzdHJpbmc7XG5cdHJlYWRvbmx5IHdvcmtpbmdEaXJlY3Rvcnk6IFVSSSB8IHVuZGVmaW5lZDtcblx0cmVhZG9ubHkgY29uZmlnOiBSZWNvcmQ8c3RyaW5nLCB1bmtub3duPiB8IHVuZGVmaW5lZDtcblx0cmVhZG9ubHkgcHJvbXB0Pzogc3RyaW5nO1xuXHRyZWFkb25seSBnaXRodWJUb2tlbj86IHN0cmluZztcblx0LyoqXG5cdCAqIFJlY2VpdmVzIGxvY2FsaXplZCBhY3Rpdml0eSBsYWJlbHMgd2hpbGUgdGhlIHdvcmt0cmVlIGlzIGJlaW5nIGNyZWF0ZWQsXG5cdCAqIHNvIGNhbGxlcnMgY2FuIHN1cmZhY2UgbGl2ZSBwcm9ncmVzcy4gT25seSBjYWxsZWQgZm9yIHNlc3Npb25zIHRoYXRcblx0ICogc2VsZWN0ZWQgd29ya3RyZWUgaXNvbGF0aW9uIFx1MjAxNCB0aG91Z2ggc3VjaCBhIHNlc3Npb24gY2FuIHN0aWxsIGZhbGwgYmFja1xuXHQgKiB0byBpdHMgZm9sZGVyIGFmdGVyIHRoZSBmaXJzdCBsYWJlbCAoZS5nLiB0aGUgZGlyZWN0b3J5IHR1cm5zIG91dCBub3QgdG9cblx0ICogYmUgYSBnaXQgcmVwb3NpdG9yeSkgXHUyMDE0IGFuZCB0aGUgY2FsbGVyIGlzIHJlc3BvbnNpYmxlIGZvciBjbGVhcmluZyB0aGVcblx0ICogYWN0aXZpdHkgb25jZSByZXNvbHV0aW9uIHNldHRsZXMuXG5cdCAqL1xuXHRyZWFkb25seSBvblByb2dyZXNzPzogKGFjdGl2aXR5OiBzdHJpbmcpID0+IHZvaWQ7XG59XG5cbi8qKlxuICogU2hhcmVkLCBwZXItYWdlbnQgY29udHJvbGxlciBmb3IgZ2l0LXdvcmt0cmVlIHNlc3Npb24gaXNvbGF0aW9uLiBPd25zIHRoZVxuICogZnVsbCBtYWNoaW5lcnkgQ29waWxvdCBwaW9uZWVyZWQgc28gQ29kZXggYW5kIENsYXVkZSBnZXQgaWRlbnRpY2FsIGJlaGF2aW9yOlxuICpcbiAqIC0gYWR2ZXJ0aXNpbmcgdGhlIGBpc29sYXRpb25gIChgZm9sZGVyYCAvIGB3b3JrdHJlZWApIGFuZCBgYnJhbmNoYCBzZXNzaW9uXG4gKiAgIGNvbmZpZyBwcm9wZXJ0aWVzIGZyb20gYHJlc29sdmVTZXNzaW9uQ29uZmlnYCAoe0BsaW5rIHJlc29sdmVJc29sYXRpb25Db25maWd9KTtcbiAqIC0gY29tcGxldGluZyBicmFuY2ggbmFtZXMgZm9yIHRoZSBicmFuY2ggcGlja2VyICh7QGxpbmsgYnJhbmNoQ29tcGxldGlvbnN9KTtcbiAqIC0gY3JlYXRpbmcgdGhlIHdvcmt0cmVlIG9uIG1hdGVyaWFsaXphdGlvbiBhbmQgcGVyc2lzdGluZyBpdHMgbWV0YWRhdGFcbiAqICAgKHtAbGluayByZXNvbHZlV29ya2luZ0RpcmVjdG9yeX0pO1xuICogLSBzdXJmYWNpbmcgd29ya3RyZWUgY3JlYXRpb24gc3VjY2Vzcy9mYWlsdXJlIG5vdGljZXMgbGl2ZSBhbmQgb24gcmVzdG9yZTtcbiAqIC0gY2xlYW5pbmcgdXAgLyByZWNyZWF0aW5nIHRoZSB3b3JrdHJlZSBvbiBzZXNzaW9uIGRlbGV0aW9uLCBhcmNoaXZlLCBhbmQgdW5hcmNoaXZlLlxuICpcbiAqIEEgc2luZ2xlIGhvc3Qtb3duZWQgaW5zdGFuY2Ugc2VydmVzIGV2ZXJ5IGFnZW50OiB0aGUgb3JjaGVzdHJhdG9yXG4gKiAoe0BsaW5rIEFnZW50U2VydmljZX0pIGNyZWF0ZXMgaXQgYW5kIGRyaXZlcyB0aGUgbGlmZWN5Y2xlIHNvIGluZGl2aWR1YWxcbiAqIGFnZW50cyBzdGF5IHVuYXdhcmUgb2YgdGhlIGZvbGRlci12cy13b3JrdHJlZSBkaXN0aW5jdGlvbi4gU2Vzc2lvbiBzdGF0ZVxuICogKGBfbWF0ZXJpYWxpemVkV29ya3RyZWVzYCwgcGVuZGluZyBtYXJrZXJzLCBwZW5kaW5nIGFubm91bmNlbWVudHMpIGlzIGtleWVkIGJ5IHRoZVxuICogZ2xvYmFsbHktdW5pcXVlIHNlc3Npb25JZCwgc28gc2hhcmluZyBvbmUgaW5zdGFuY2UgYWNyb3NzIGFnZW50cyBpcyBzYWZlLlxuICovXG5leHBvcnQgY2xhc3MgV29ya3RyZWVJc29sYXRpb24gZXh0ZW5kcyBEaXNwb3NhYmxlIGltcGxlbWVudHMgSUFnZW50SG9zdFdvcmt0cmVlSXNvbGF0aW9uIHtcblx0ZGVjbGFyZSByZWFkb25seSBfc2VydmljZUJyYW5kOiB1bmRlZmluZWQ7XG5cblx0LyoqIFdvcmt0cmVlcyBtYXRlcmlhbGl6ZWQgZHVyaW5nIHRoaXMgaG9zdCBwcm9jZXNzLCBrZXllZCBieSBzZXNzaW9uSWQuICovXG5cdHByaXZhdGUgcmVhZG9ubHkgX21hdGVyaWFsaXplZFdvcmt0cmVlcyA9IG5ldyBNYXA8c3RyaW5nLCBJU2Vzc2lvbldvcmt0cmVlPigpO1xuXHRwcml2YXRlIHJlYWRvbmx5IF93b3JrdHJlZURlbGV0aW9uUmV0cmllcyA9IG5ldyBNYXA8c3RyaW5nLCBJU2Vzc2lvbldvcmt0cmVlPigpO1xuXG5cdC8qKlxuXHQgKiBQZXItc2Vzc2lvbiBhbm5vdW5jZW1lbnQgKG1hcmtkb3duKSBlbWl0dGVkIGFzIGEgc3ludGhldGljIHN0cmVhbWluZ1xuXHQgKiBtYXJrZG93biBwYXJ0IHRoZSBmaXJzdCB0aW1lIHRoZSBzZXNzaW9uIHNlbmRzIGEgbWVzc2FnZS4gU3VyZmFjZXMgdGhlXG5cdCAqIFwiQ3JlYXRlZCBpc29sYXRlZCB3b3JrdHJlZSBmb3IgYnJhbmNoIFhcIiBtZXNzYWdlIGxpdmUgZHVyaW5nIHRoZSBmaXJzdFxuXHQgKiB0dXJuOyB0aGUgc2FtZSBhbm5vdW5jZW1lbnQgaXMgcmUtaW5qZWN0ZWQgb24gcmVzdG9yZSB2aWFcblx0ICoge0BsaW5rIGFwcGx5UmVzdG9yZUFubm91bmNlbWVudH0uXG5cdCAqL1xuXHRwcml2YXRlIHJlYWRvbmx5IF9wZW5kaW5nRmlyc3RUdXJuQW5ub3VuY2VtZW50cyA9IG5ldyBNYXA8c3RyaW5nLCBzdHJpbmc+KCk7XG5cblx0LyoqXG5cdCAqIFNlc3Npb25JZHMgb2YgZnJlc2hseS1jcmVhdGVkIHdvcmt0cmVlLWlzb2xhdGlvbiBzZXNzaW9ucyB3aG9zZSB3b3JrdHJlZVxuXHQgKiBoYXMgbm90IHlldCBiZWVuIGNyZWF0ZWQgKGNyZWF0aW9uIGlzIGRlZmVycmVkIHRvIHRoZSBmaXJzdCBzZW5kIHNvIHRoZVxuXHQgKiB1c2VyJ3MgcHJvbXB0IGNhbiBkcml2ZSBicmFuY2ggbmFtaW5nKS4gV2hpbGUgYSBzZXNzaW9uIGlzIGluIHRoaXMgc2V0IHRoZVxuXHQgKiBob3N0IHJlcG9ydHMgaXRzIHdvcmtpbmcgZGlyZWN0b3J5IGFzIFwicGVuZGluZ1wiICh7QGxpbmsgaXNXb3JraW5nRGlyZWN0b3J5UGVuZGluZ30pXG5cdCAqIHNvIGFnZW50cyBkZWZlciBwcmV3YXJtaW5nIC8gbWF0ZXJpYWxpemluZyB1bnRpbCB7QGxpbmsgcmVzb2x2ZU9uRmlyc3RTZW5kfVxuXHQgKiBydW5zLiBOZXZlciBwb3B1bGF0ZWQgZm9yIHJlc3RvcmVkIHNlc3Npb25zIFx1MjAxNCB0aGVpciB3b3JrdHJlZSBhbHJlYWR5IGV4aXN0c1xuXHQgKiBvbiBkaXNrIGFuZCB0aGVpciBwZXJzaXN0ZWQgd29ya2luZyBkaXJlY3RvcnkgYWxyZWFkeSBwb2ludHMgYXQgaXQuXG5cdCAqL1xuXHRwcml2YXRlIHJlYWRvbmx5IF9wZW5kaW5nID0gbmV3IFNldDxzdHJpbmc+KCk7XG5cdHByaXZhdGUgcmVhZG9ubHkgX29uRGlkQ2hhbmdlV29ya2luZ0RpcmVjdG9yeVBlbmRpbmcgPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjxzdHJpbmc+KCkpO1xuXHRyZWFkb25seSBvbkRpZENoYW5nZVdvcmtpbmdEaXJlY3RvcnlQZW5kaW5nOiBFdmVudDxzdHJpbmc+ID0gdGhpcy5fb25EaWRDaGFuZ2VXb3JraW5nRGlyZWN0b3J5UGVuZGluZy5ldmVudDtcblxuXHQvKiogRml4ZWQgbG9nIGxhYmVsOyBvbmUgaG9zdC1vd25lZCBpbnN0YW5jZSBzZXJ2ZXMgZXZlcnkgYWdlbnQuICovXG5cdHByaXZhdGUgcmVhZG9ubHkgX2xvZ0xhYmVsID0gJ0FnZW50SG9zdCc7XG5cblx0LyoqXG5cdCAqIFNlcmlhbGl6ZXMgdGhlIHdvcmt0cmVlIGxpZmVjeWNsZSBwZXIgc2Vzc2lvbiBzbyBhIGZpcnN0LXNlbmQgY3JlYXRpb25cblx0ICogKHtAbGluayByZXNvbHZlT25GaXJzdFNlbmR9KSBuZXZlciBpbnRlcmxlYXZlcyB3aXRoIGFyY2hpdmUvdW5hcmNoaXZlXG5cdCAqIGNsZWFudXAgKHtAbGluayBjbGVhbnVwV29ya3RyZWVPbkFyY2hpdmV9IC8ge0BsaW5rIHJlY3JlYXRlV29ya3RyZWVPblVuYXJjaGl2ZX0pXG5cdCAqIG9yIGRlbGV0aW9uICh7QGxpbmsgcmVtb3ZlU2Vzc2lvbldvcmt0cmVlfSkgZm9yIHRoZSBzYW1lIHNlc3Npb24gXHUyMDE0IHRoZVxuXHQgKiBndWFyYW50ZWUgZWFjaCBhZ2VudCBwcmV2aW91c2x5IGVuZm9yY2VkIHdpdGggaXRzIG93biBzZXF1ZW5jZXIuXG5cdCAqL1xuXHRwcml2YXRlIHJlYWRvbmx5IF9zZXF1ZW5jZXIgPSBuZXcgU2VxdWVuY2VyQnlLZXk8c3RyaW5nPigpO1xuXHRwcml2YXRlIHJlYWRvbmx5IF93b3JrdHJlZUNyZWF0aW9uU2VxdWVuY2VyID0gbmV3IFNlcXVlbmNlckJ5S2V5PHN0cmluZz4oKTtcblxuXHQvKiogQnJhbmNoLW5hbWUgZ2VuZXJhdG9yIGZvciB3b3JrdHJlZSBzZXNzaW9uczsgY3JlYXRlZCBmcm9tIHtAbGluayBJQ29waWxvdEFwaVNlcnZpY2V9IHVubGVzcyBhIHRlc3Qgc3VwcGxpZXMgYW4gb3ZlcnJpZGUuICovXG5cdHByaXZhdGUgcmVhZG9ubHkgX2JyYW5jaE5hbWVHZW5lcmF0b3I6IElBZ2VudEJyYW5jaE5hbWVHZW5lcmF0b3I7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0YnJhbmNoTmFtZUdlbmVyYXRvcjogSUFnZW50QnJhbmNoTmFtZUdlbmVyYXRvciB8IHVuZGVmaW5lZCxcblx0XHRASUFnZW50SG9zdEdpdFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfZ2l0U2VydmljZTogSUFnZW50SG9zdEdpdFNlcnZpY2UsXG5cdFx0QElDb3BpbG90QXBpU2VydmljZSBjb3BpbG90QXBpU2VydmljZTogSUNvcGlsb3RBcGlTZXJ2aWNlLFxuXHRcdEBJU2Vzc2lvbkRhdGFTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX3Nlc3Npb25EYXRhU2VydmljZTogSVNlc3Npb25EYXRhU2VydmljZSxcblx0XHRASUxvZ1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfbG9nU2VydmljZTogSUxvZ1NlcnZpY2UsXG5cdCkge1xuXHRcdHN1cGVyKCk7XG5cdFx0dGhpcy5fYnJhbmNoTmFtZUdlbmVyYXRvciA9IGJyYW5jaE5hbWVHZW5lcmF0b3IgPz8gbmV3IEFnZW50QnJhbmNoTmFtZUdlbmVyYXRvcihjb3BpbG90QXBpU2VydmljZSwgdGhpcy5fbG9nU2VydmljZSk7XG5cdH1cblxuXHQvKipcblx0ICogTWFya3MgYSBmcmVzaCB3b3JrdHJlZS1pc29sYXRpb24gc2Vzc2lvbiBhcyBwZW5kaW5nIFx1MjAxNCBpdHMgd29ya3RyZWUgaXNcblx0ICogZGVmZXJyZWQgdG8gdGhlIGZpcnN0IHNlbmQuIENhbGxlZCBieSB0aGUgaG9zdCB3aGlsZSBhIGNyZWF0aW5nIHNlc3Npb24nc1xuXHQgKiByZXNvbHZlZCBjb25maWcgc2VsZWN0cyBgd29ya3RyZWVgIGlzb2xhdGlvbi5cblx0ICovXG5cdG5vdGVQZW5kaW5nKHNlc3Npb25JZDogc3RyaW5nKTogdm9pZCB7XG5cdFx0aWYgKCF0aGlzLl9wZW5kaW5nLmhhcyhzZXNzaW9uSWQpKSB7XG5cdFx0XHR0aGlzLl9wZW5kaW5nLmFkZChzZXNzaW9uSWQpO1xuXHRcdFx0dGhpcy5fb25EaWRDaGFuZ2VXb3JraW5nRGlyZWN0b3J5UGVuZGluZy5maXJlKHNlc3Npb25JZCk7XG5cdFx0fVxuXHR9XG5cblx0LyoqIENsZWFycyBhIHBlbmRpbmcgbWFya2VyIHdoZW4gYSBzZXNzaW9uIHdpbGwgbm90IG1hdGVyaWFsaXplIGEgd29ya3RyZWUuICovXG5cdGNsZWFyUGVuZGluZyhzZXNzaW9uSWQ6IHN0cmluZyk6IHZvaWQge1xuXHRcdGlmICh0aGlzLl9wZW5kaW5nLmRlbGV0ZShzZXNzaW9uSWQpKSB7XG5cdFx0XHR0aGlzLl9vbkRpZENoYW5nZVdvcmtpbmdEaXJlY3RvcnlQZW5kaW5nLmZpcmUoc2Vzc2lvbklkKTtcblx0XHR9XG5cdH1cblxuXHQvKipcblx0ICogV2hldGhlciBhIHNlc3Npb24ncyB3b3JrdHJlZSBpcyBzdGlsbCBwZW5kaW5nIGNyZWF0aW9uLiBUaGUgaG9zdCBleHBvc2VzXG5cdCAqIHRoaXMgdGhyb3VnaCB7QGxpbmsgSUFnZW50Q29uZmlndXJhdGlvblNlcnZpY2UuaXNXb3JraW5nRGlyZWN0b3J5UGVuZGluZ30gc29cblx0ICogYWdlbnRzIGRlZmVyIG1hdGVyaWFsaXphdGlvbiB1bnRpbCB0aGUgaG9zdCBoYXMgcmVzb2x2ZWQgdGhlIHdvcmt0cmVlLlxuXHQgKi9cblx0aXNXb3JraW5nRGlyZWN0b3J5UGVuZGluZyhzZXNzaW9uSWQ6IHN0cmluZyk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiB0aGlzLl9wZW5kaW5nLmhhcyhzZXNzaW9uSWQpO1xuXHR9XG5cblx0LyoqIFRoZSB3b3JrdHJlZSBjcmVhdGVkIGZvciBhIHNlc3Npb24gaW4gdGhpcyBwcm9jZXNzLCBpZiBhbnkuICovXG5cdGdldFJlc29sdmVkV29ya3RyZWUoc2Vzc2lvbklkOiBzdHJpbmcpOiBVUkkgfCB1bmRlZmluZWQge1xuXHRcdHJldHVybiB0aGlzLl9tYXRlcmlhbGl6ZWRXb3JrdHJlZXMuZ2V0KHNlc3Npb25JZCk/Lndvcmt0cmVlO1xuXHR9XG5cblx0LyoqXG5cdCAqIEZpcnN0LXNlbmQgd29ya3RyZWUgcmVzb2x1dGlvbjogY3JlYXRlcyB0aGUgd29ya3RyZWUgKHdoZW4gdGhlIHNlc3Npb25cblx0ICogc2VsZWN0ZWQgYHdvcmt0cmVlYCBpc29sYXRpb24gb24gYSBnaXQgcmVwbykgYW5kIGNsZWFycyB0aGUgcGVuZGluZyBtYXJrZXJcblx0ICogcmVnYXJkbGVzcyBvZiBvdXRjb21lLCBzbyBhIGZhaWxlZCBjcmVhdGlvbiBmYWxscyBiYWNrIHRvIGZvbGRlciBpc29sYXRpb25cblx0ICogaW5zdGVhZCBvZiBsZWF2aW5nIHRoZSBzZXNzaW9uIHBlcm1hbmVudGx5IFwicGVuZGluZ1wiLiBEZWxlZ2F0ZXMgdG9cblx0ICoge0BsaW5rIHJlc29sdmVXb3JraW5nRGlyZWN0b3J5fSwgd2hpY2ggaXMgaWRlbXBvdGVudCBwZXIgc2Vzc2lvbi5cblx0ICovXG5cdGFzeW5jIHJlc29sdmVPbkZpcnN0U2VuZChyZXF1ZXN0OiBJUmVzb2x2ZVdvcmtpbmdEaXJlY3RvcnlSZXF1ZXN0KTogUHJvbWlzZTxVUkkgfCB1bmRlZmluZWQ+IHtcblx0XHRyZXR1cm4gdGhpcy5fc2VxdWVuY2VyLnF1ZXVlKHJlcXVlc3Quc2Vzc2lvbklkLCBhc3luYyAoKSA9PiB7XG5cdFx0XHR0cnkge1xuXHRcdFx0XHRyZXR1cm4gYXdhaXQgdGhpcy5yZXNvbHZlV29ya2luZ0RpcmVjdG9yeShyZXF1ZXN0KTtcblx0XHRcdH0gZmluYWxseSB7XG5cdFx0XHRcdHRoaXMuY2xlYXJQZW5kaW5nKHJlcXVlc3Quc2Vzc2lvbklkKTtcblx0XHRcdH1cblx0XHR9KTtcblx0fVxuXG5cdC8qKlxuXHQgKiBCdWlsZHMgdGhlIGBpc29sYXRpb25gIC8gYGJyYW5jaGAgc2NoZW1hIGNvbnRyaWJ1dGlvbiBmb3Jcblx0ICogYHJlc29sdmVTZXNzaW9uQ29uZmlnYC4gV2hlbiB7QGxpbmsgSVJlc29sdmVJc29sYXRpb25Db25maWdSZXF1ZXN0LndvcmtpbmdEaXJlY3Rvcnl9XG5cdCAqIGlzIG5vdCBhIGdpdCByZXBvc2l0b3J5IChvciBoYXMgbm8gY29tbWl0cyB5ZXQpIGlzb2xhdGlvbiBpcyBmb3JjZWQgdG9cblx0ICogYGZvbGRlcmAgYW5kIG5vIGJyYW5jaCBwcm9wZXJ0eSBpcyBvZmZlcmVkLlxuXHQgKi9cblx0YXN5bmMgcmVzb2x2ZUlzb2xhdGlvbkNvbmZpZyhyZXF1ZXN0OiBJUmVzb2x2ZUlzb2xhdGlvbkNvbmZpZ1JlcXVlc3QpOiBQcm9taXNlPElJc29sYXRpb25Db25maWdDb250cmlidXRpb24+IHtcblx0XHRjb25zdCBnaXRJbmZvID0gcmVxdWVzdC53b3JraW5nRGlyZWN0b3J5ID8gYXdhaXQgdGhpcy5fZ2V0R2l0SW5mbyhyZXF1ZXN0LndvcmtpbmdEaXJlY3RvcnkpIDogdW5kZWZpbmVkO1xuXG5cdFx0Y29uc3QgaXNvbGF0aW9uUHJvcGVydHkgPSBzY2hlbWFQcm9wZXJ0eTwnZm9sZGVyJyB8ICd3b3JrdHJlZSc+KHtcblx0XHRcdHR5cGU6ICdzdHJpbmcnLFxuXHRcdFx0dGl0bGU6IGxvY2FsaXplKCdhZ2VudEhvc3Quc2Vzc2lvbkNvbmZpZy5pc29sYXRpb24nLCBcIklzb2xhdGlvblwiKSxcblx0XHRcdGRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgnYWdlbnRIb3N0LnNlc3Npb25Db25maWcuaXNvbGF0aW9uRGVzY3JpcHRpb24nLCBcIldoZXJlIHRoZSBhZ2VudCBzaG91bGQgbWFrZSBjaGFuZ2VzXCIpLFxuXHRcdFx0ZW51bTogZ2l0SW5mbyA/IFsnZm9sZGVyJywgJ3dvcmt0cmVlJ10gOiBbJ2ZvbGRlciddLFxuXHRcdFx0ZW51bUxhYmVsczogZ2l0SW5mbyA/IFtsb2NhbGl6ZSgnYWdlbnRIb3N0LnNlc3Npb25Db25maWcuaXNvbGF0aW9uLmZvbGRlcicsIFwiRm9sZGVyXCIpLCBsb2NhbGl6ZSgnYWdlbnRIb3N0LnNlc3Npb25Db25maWcuaXNvbGF0aW9uLndvcmt0cmVlJywgXCJXb3JrdHJlZVwiKV0gOiBbbG9jYWxpemUoJ2FnZW50SG9zdC5zZXNzaW9uQ29uZmlnLmlzb2xhdGlvbi5mb2xkZXInLCBcIkZvbGRlclwiKV0sXG5cdFx0XHRlbnVtRGVzY3JpcHRpb25zOiBnaXRJbmZvID8gW2xvY2FsaXplKCdhZ2VudEhvc3Quc2Vzc2lvbkNvbmZpZy5pc29sYXRpb24uZm9sZGVyRGVzY3JpcHRpb24nLCBcIldvcmsgZGlyZWN0bHkgaW4gdGhlIGZvbGRlclwiKSwgbG9jYWxpemUoJ2FnZW50SG9zdC5zZXNzaW9uQ29uZmlnLmlzb2xhdGlvbi53b3JrdHJlZURlc2NyaXB0aW9uJywgXCJDcmVhdGUgYSBHaXQgd29ya3RyZWUgZm9yIGlzb2xhdGlvblwiKV0gOiBbbG9jYWxpemUoJ2FnZW50SG9zdC5zZXNzaW9uQ29uZmlnLmlzb2xhdGlvbi5mb2xkZXJEZXNjcmlwdGlvbicsIFwiV29yayBkaXJlY3RseSBpbiB0aGUgZm9sZGVyXCIpXSxcblx0XHRcdGRlZmF1bHQ6IGdpdEluZm8gPyAnd29ya3RyZWUnIDogJ2ZvbGRlcicsXG5cdFx0XHRyZWFkT25seTogIWdpdEluZm8sXG5cdFx0XHRzZXNzaW9uTXV0YWJsZTogZmFsc2UsXG5cdFx0fSk7XG5cblx0XHQvLyBSZXNvbHZlIGlzb2xhdGlvbiBmaXJzdCBcdTIwMTQgZG93bnN0cmVhbSBzY2hlbWEgc2hhcGVzIChicmFuY2gnc1xuXHRcdC8vIHJlYWQtb25seSBtb2RlICsgZW51bSByZXN0cmljdGlvbikgZGVwZW5kIG9uIHRoZSBlZmZlY3RpdmUgdmFsdWUuXG5cdFx0Y29uc3QgaXNvbGF0aW9uRGVmYXVsdDogJ2ZvbGRlcicgfCAnd29ya3RyZWUnID0gZ2l0SW5mbyA/ICd3b3JrdHJlZScgOiAnZm9sZGVyJztcblx0XHRjb25zdCBpc29sYXRpb25WYWx1ZSA9IGlzb2xhdGlvblByb3BlcnR5LnZhbGlkYXRlKHJlcXVlc3QuY29uZmlnPy5bU2Vzc2lvbkNvbmZpZ0tleS5Jc29sYXRpb25dKVxuXHRcdFx0PyByZXF1ZXN0LmNvbmZpZyFbU2Vzc2lvbkNvbmZpZ0tleS5Jc29sYXRpb25dIGFzICdmb2xkZXInIHwgJ3dvcmt0cmVlJ1xuXHRcdFx0OiBpc29sYXRpb25EZWZhdWx0O1xuXG5cdFx0bGV0IGJyYW5jaFByb3BlcnR5OiBJU2NoZW1hUHJvcGVydHk8c3RyaW5nPiB8IHVuZGVmaW5lZDtcblx0XHRsZXQgYnJhbmNoRGVmYXVsdDogc3RyaW5nIHwgdW5kZWZpbmVkO1xuXHRcdGxldCBicmFuY2hWYWx1ZTogc3RyaW5nIHwgdW5kZWZpbmVkO1xuXHRcdGxldCB3b3JrdHJlZUJyYW5jaFByZWZpeFByb3BlcnR5OiBJU2NoZW1hUHJvcGVydHk8c3RyaW5nPiB8IHVuZGVmaW5lZDtcblx0XHRsZXQgd29ya3RyZWVJbmNsdWRlRmlsZXNQcm9wZXJ0eTogSVNjaGVtYVByb3BlcnR5PHJlYWRvbmx5IHN0cmluZ1tdPiB8IHVuZGVmaW5lZDtcblx0XHRsZXQgd29ya3RyZWVCcmFuY2hUcmFja1Byb3BlcnR5OiBJU2NoZW1hUHJvcGVydHk8Ym9vbGVhbj4gfCB1bmRlZmluZWQ7XG5cdFx0aWYgKGdpdEluZm8pIHtcblx0XHRcdGNvbnN0IGJyYW5jaFJlYWRPbmx5ID0gaXNvbGF0aW9uVmFsdWUgPT09ICdmb2xkZXInO1xuXHRcdFx0YnJhbmNoRGVmYXVsdCA9IGlzb2xhdGlvblZhbHVlID09PSAnd29ya3RyZWUnID8gZ2l0SW5mby5kZWZhdWx0QnJhbmNoLm5hbWUgOiBnaXRJbmZvLmN1cnJlbnRCcmFuY2g7XG5cdFx0XHRicmFuY2hWYWx1ZSA9IGlzb2xhdGlvblZhbHVlID09PSAnd29ya3RyZWUnICYmIHR5cGVvZiByZXF1ZXN0LmNvbmZpZz8uW1Nlc3Npb25Db25maWdLZXkuQnJhbmNoXSA9PT0gJ3N0cmluZydcblx0XHRcdFx0PyByZXF1ZXN0LmNvbmZpZ1tTZXNzaW9uQ29uZmlnS2V5LkJyYW5jaF0gYXMgc3RyaW5nXG5cdFx0XHRcdDogYnJhbmNoRGVmYXVsdDtcblx0XHRcdGJyYW5jaFByb3BlcnR5ID0gc2NoZW1hUHJvcGVydHk8c3RyaW5nPih7XG5cdFx0XHRcdHR5cGU6ICdzdHJpbmcnLFxuXHRcdFx0XHR0aXRsZTogbG9jYWxpemUoJ2FnZW50SG9zdC5zZXNzaW9uQ29uZmlnLmJyYW5jaCcsIFwiQnJhbmNoXCIpLFxuXHRcdFx0XHRkZXNjcmlwdGlvbjogbG9jYWxpemUoJ2FnZW50SG9zdC5zZXNzaW9uQ29uZmlnLmJyYW5jaERlc2NyaXB0aW9uJywgXCJCYXNlIGJyYW5jaCB0byB3b3JrIGZyb21cIiksXG5cdFx0XHRcdGVudW06IFticmFuY2hEZWZhdWx0XSxcblx0XHRcdFx0ZW51bUxhYmVsczogW2JyYW5jaERlZmF1bHRdLFxuXHRcdFx0XHRkZWZhdWx0OiBicmFuY2hEZWZhdWx0LFxuXHRcdFx0XHRlbnVtRHluYW1pYzogIWJyYW5jaFJlYWRPbmx5LFxuXHRcdFx0XHRyZWFkT25seTogYnJhbmNoUmVhZE9ubHksXG5cdFx0XHRcdHNlc3Npb25NdXRhYmxlOiBmYWxzZSxcblx0XHRcdH0pO1xuXG5cdFx0XHQvLyBDYXJyaWVyIGZvciB0aGUgY2xpZW50J3MgYGdpdC5icmFuY2hQcmVmaXhgOiB0aGUgaG9zdCBwcmVwZW5kcyBpdFxuXHRcdFx0Ly8gdG8gdGhlIGJyYW5jaCBpdCBjcmVhdGVzIGZvciBhbiBpc29sYXRlZCB3b3JrdHJlZS4gRGVjbGFyZWQgZm9yXG5cdFx0XHQvLyBib3RoIGlzb2xhdGlvbnMgKGxpa2UgYGJyYW5jaGApLCBzbyB0aGUgdmFsdWUgcmlkZXNcblx0XHRcdC8vIGBfY29uZmlnLnZhbHVlc2AgYW5kIHN1cnZpdmVzIGlzb2xhdGlvbiB0b2dnbGVzIFx1MjAxNCBhIHVzZXIgd2hvIGZsaXBzXG5cdFx0XHQvLyB3b3JrdHJlZSBcdTIxOTIgZm9sZGVyIFx1MjE5MiB3b3JrdHJlZSBrZWVwcyB0aGUgcHJlZml4LiBJdCBoYXMgbm9cblx0XHRcdC8vIGBlbnVtYC9gZW51bUR5bmFtaWNgLCBzbyB0aGUgY29uZmlnIHBpY2tlciB0cmVhdHMgaXQgYXNcblx0XHRcdC8vIG5vbi1waWNrYWJsZSBhbmQgbmV2ZXIgc3VyZmFjZXMgaXQgYXMgYSBjaGlwOiB0aGUgY2xpZW50IHNlZWRzIGl0XG5cdFx0XHQvLyAoZnJvbSBgZ2l0LmJyYW5jaFByZWZpeGApLCB0aGUgdXNlciBuZXZlciBlZGl0cyBpdCwgYW5kIHRoZSBob3N0XG5cdFx0XHQvLyBvbmx5ICpjb25zdW1lcyogaXQgZm9yIHdvcmt0cmVlIGlzb2xhdGlvbiAoc2VlXG5cdFx0XHQvLyB7QGxpbmsgcmVzb2x2ZVdvcmtpbmdEaXJlY3Rvcnl9KS5cblx0XHRcdHdvcmt0cmVlQnJhbmNoUHJlZml4UHJvcGVydHkgPSBzY2hlbWFQcm9wZXJ0eTxzdHJpbmc+KHtcblx0XHRcdFx0dHlwZTogJ3N0cmluZycsXG5cdFx0XHRcdHRpdGxlOiBsb2NhbGl6ZSgnYWdlbnRIb3N0LnNlc3Npb25Db25maWcud29ya3RyZWVCcmFuY2hQcmVmaXgnLCBcIldvcmt0cmVlIEJyYW5jaCBQcmVmaXhcIiksXG5cdFx0XHRcdGRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgnYWdlbnRIb3N0LnNlc3Npb25Db25maWcud29ya3RyZWVCcmFuY2hQcmVmaXhEZXNjcmlwdGlvbicsIFwiUHJlZml4IGFwcGxpZWQgdG8gdGhlIGJyYW5jaCBjcmVhdGVkIGZvciBhbiBpc29sYXRlZCB3b3JrdHJlZS5cIiksXG5cdFx0XHRcdHJlYWRPbmx5OiB0cnVlLFxuXHRcdFx0XHRzZXNzaW9uTXV0YWJsZTogZmFsc2UsXG5cdFx0XHR9KTtcblxuXHRcdFx0d29ya3RyZWVCcmFuY2hUcmFja1Byb3BlcnR5ID0gc2NoZW1hUHJvcGVydHk8Ym9vbGVhbj4oe1xuXHRcdFx0XHR0eXBlOiAnYm9vbGVhbicsXG5cdFx0XHRcdHRpdGxlOiBsb2NhbGl6ZSgnYWdlbnRIb3N0LnNlc3Npb25Db25maWcud29ya3RyZWVCcmFuY2hUcmFjaycsIFwiV29ya3RyZWUgQnJhbmNoIFRyYWNraW5nXCIpLFxuXHRcdFx0XHRkZXNjcmlwdGlvbjogbG9jYWxpemUoJ2FnZW50SG9zdC5zZXNzaW9uQ29uZmlnLndvcmt0cmVlQnJhbmNoVHJhY2tEZXNjcmlwdGlvbicsIFwiV2hldGhlciB0aGUgYnJhbmNoIGNyZWF0ZWQgZm9yIGFuIGlzb2xhdGVkIHdvcmt0cmVlIHRyYWNrcyBpdHMgdXBzdHJlYW0uXCIpLFxuXHRcdFx0XHRkZWZhdWx0OiBmYWxzZSxcblx0XHRcdFx0cmVhZE9ubHk6IHRydWUsXG5cdFx0XHRcdHNlc3Npb25NdXRhYmxlOiBmYWxzZSxcblx0XHRcdH0pO1xuXG5cdFx0XHR3b3JrdHJlZUluY2x1ZGVGaWxlc1Byb3BlcnR5ID0gc2NoZW1hUHJvcGVydHk8cmVhZG9ubHkgc3RyaW5nW10+KHtcblx0XHRcdFx0dHlwZTogJ2FycmF5Jyxcblx0XHRcdFx0dGl0bGU6IGxvY2FsaXplKCdhZ2VudEhvc3Quc2Vzc2lvbkNvbmZpZy53b3JrdHJlZUluY2x1ZGVGaWxlcycsIFwiV29ya3RyZWUgSW5jbHVkZSBGaWxlc1wiKSxcblx0XHRcdFx0ZGVzY3JpcHRpb246IGxvY2FsaXplKCdhZ2VudEhvc3Quc2Vzc2lvbkNvbmZpZy53b3JrdHJlZUluY2x1ZGVGaWxlc0Rlc2NyaXB0aW9uJywgXCJHbG9iIHBhdHRlcm5zIGZvciBnaXQtaWdub3JlZCBmaWxlcyB0byBjb3B5IGludG8gdGhlIGlzb2xhdGVkIHdvcmt0cmVlLlwiKSxcblx0XHRcdFx0aXRlbXM6IHtcblx0XHRcdFx0XHR0eXBlOiAnc3RyaW5nJyxcblx0XHRcdFx0XHR0aXRsZTogbG9jYWxpemUoJ2FnZW50SG9zdC5zZXNzaW9uQ29uZmlnLndvcmt0cmVlSW5jbHVkZUZpbGVzSXRlbScsIFwiUGF0dGVyblwiKSxcblx0XHRcdFx0fSxcblx0XHRcdFx0cmVhZE9ubHk6IHRydWUsXG5cdFx0XHRcdHNlc3Npb25NdXRhYmxlOiBmYWxzZSxcblx0XHRcdH0pO1xuXHRcdH1cblxuXHRcdHJldHVybiB7IGlzb2xhdGlvblByb3BlcnR5LCBicmFuY2hQcm9wZXJ0eSwgd29ya3RyZWVCcmFuY2hQcmVmaXhQcm9wZXJ0eSwgd29ya3RyZWVCcmFuY2hUcmFja1Byb3BlcnR5LCB3b3JrdHJlZUluY2x1ZGVGaWxlc1Byb3BlcnR5LCBpc29sYXRpb25WYWx1ZSwgYnJhbmNoRGVmYXVsdCwgYnJhbmNoVmFsdWUgfTtcblx0fVxuXG5cdC8qKlxuXHQgKiBCcmFuY2gtbmFtZSBjb21wbGV0aW9ucyBmb3IgdGhlIGJyYW5jaCBwaWNrZXIuIENhbGxlcnMgZm9yd2FyZCB0aGlzIGZyb21cblx0ICogdGhlaXIgYHNlc3Npb25Db25maWdDb21wbGV0aW9uc2Agd2hlbiB0aGUgcmVxdWVzdGVkIHByb3BlcnR5IGlzXG5cdCAqIHtAbGluayBTZXNzaW9uQ29uZmlnS2V5LkJyYW5jaH0uXG5cdCAqL1xuXHRhc3luYyBicmFuY2hDb21wbGV0aW9ucyh3b3JraW5nRGlyZWN0b3J5OiBVUkkgfCB1bmRlZmluZWQsIHF1ZXJ5Pzogc3RyaW5nKTogUHJvbWlzZTx7IGl0ZW1zOiB7IHZhbHVlOiBzdHJpbmc7IGxhYmVsOiBzdHJpbmcgfVtdIH0+IHtcblx0XHRpZiAoIXdvcmtpbmdEaXJlY3RvcnkpIHtcblx0XHRcdHJldHVybiB7IGl0ZW1zOiBbXSB9O1xuXHRcdH1cblx0XHRjb25zdCBbYnJhbmNoZXMsIGN1cnJlbnRCcmFuY2gsIGRlZmF1bHRCcmFuY2hdID0gYXdhaXQgUHJvbWlzZS5hbGwoW1xuXHRcdFx0dGhpcy5fZ2l0U2VydmljZS5nZXRCcmFuY2hlcyh3b3JraW5nRGlyZWN0b3J5LCB7IHBhdHRlcm46IFsncmVmcy9oZWFkcyddLCBzb3J0OiAnY29tbWl0dGVyZGF0ZScgfSksXG5cdFx0XHR0aGlzLl9naXRTZXJ2aWNlLmdldEN1cnJlbnRCcmFuY2god29ya2luZ0RpcmVjdG9yeSksXG5cdFx0XHR0aGlzLl9naXRTZXJ2aWNlLmdldERlZmF1bHRCcmFuY2god29ya2luZ0RpcmVjdG9yeSksXG5cdFx0XSk7XG5cdFx0Y29uc3QgYnJhbmNoQ29tcGxldGlvbnMgPSBnZXRCcmFuY2hDb21wbGV0aW9ucyhicmFuY2hlcy5tYXAoYnJhbmNoID0+IGJyYW5jaC5uYW1lKSwge1xuXHRcdFx0Y3VycmVudEJyYW5jaCxcblx0XHRcdGRlZmF1bHRCcmFuY2g6IGRlZmF1bHRCcmFuY2g/Lm5hbWUsXG5cdFx0XHRxdWVyeSxcblx0XHRcdGxpbWl0OiBCUkFOQ0hfQ09NUExFVElPTl9MSU1JVCxcblx0XHR9KTtcblxuXHRcdHJldHVybiB7IGl0ZW1zOiBicmFuY2hDb21wbGV0aW9ucy5tYXAoYnJhbmNoID0+ICh7IHZhbHVlOiBicmFuY2gsIGxhYmVsOiBicmFuY2ggfSkpIH07XG5cdH1cblxuXHQvKipcblx0ICogUmVzb2x2ZXMgdGhlIGVmZmVjdGl2ZSB3b3JraW5nIGRpcmVjdG9yeSBmb3IgYSBzZXNzaW9uIHRoYXQgaXMgYWJvdXQgdG9cblx0ICogYmUgbWF0ZXJpYWxpemVkLiBXaGVuIHRoZSBzZXNzaW9uIGNvbmZpZyBzZWxlY3RzIGB3b3JrdHJlZWAgaXNvbGF0aW9uIG9uXG5cdCAqIGEgZ2l0IHJlcG9zaXRvcnksIGNyZWF0ZXMgYSBmcmVzaCBicmFuY2ggKyB3b3JrdHJlZSwgcmVjb3JkcyBpdCBmb3Jcblx0ICogY2xlYW51cCwgcXVldWVzIHRoZSBmaXJzdC10dXJuIGFubm91bmNlbWVudCwgcGVyc2lzdHMgdGhlIHdvcmt0cmVlXG5cdCAqIG1ldGFkYXRhLCBhbmQgcmV0dXJucyB0aGUgd29ya3RyZWUgVVJJLiBPdGhlcndpc2UgcmV0dXJucyB0aGUgcmVxdWVzdGVkXG5cdCAqIHdvcmtpbmcgZGlyZWN0b3J5IHVuY2hhbmdlZC5cblx0ICovXG5cdGFzeW5jIHJlc29sdmVXb3JraW5nRGlyZWN0b3J5KHJlcXVlc3Q6IElSZXNvbHZlV29ya2luZ0RpcmVjdG9yeVJlcXVlc3QpOiBQcm9taXNlPFVSSSB8IHVuZGVmaW5lZD4ge1xuXHRcdGNvbnN0IHsgY29uZmlnLCB3b3JraW5nRGlyZWN0b3J5LCBzZXNzaW9uSWQsIHNlc3Npb25VcmksIHByb21wdCwgZ2l0aHViVG9rZW4sIG9uUHJvZ3Jlc3MgfSA9IHJlcXVlc3Q7XG5cdFx0aWYgKGNvbmZpZz8uW1Nlc3Npb25Db25maWdLZXkuSXNvbGF0aW9uXSAhPT0gJ3dvcmt0cmVlJyB8fCAhd29ya2luZ0RpcmVjdG9yeSB8fCB0eXBlb2YgY29uZmlnW1Nlc3Npb25Db25maWdLZXkuQnJhbmNoXSAhPT0gJ3N0cmluZycpIHtcblx0XHRcdHJldHVybiB3b3JraW5nRGlyZWN0b3J5O1xuXHRcdH1cblxuXHRcdC8vIElkZW1wb3RlbnQ6IGlmIGEgd29ya3RyZWUgd2FzIGFscmVhZHkgY3JlYXRlZCBmb3IgdGhpcyBzZXNzaW9uIGluIHRoaXNcblx0XHQvLyBwcm9jZXNzIChlLmcuIHRoZSBjYWxsZXIgcmUtZW50ZXJzIG1hdGVyaWFsaXphdGlvbiBhZnRlciBhIHRocmVhZFxuXHRcdC8vIHJlc3RhcnQgb3IgYSBwb3N0LWNyZWF0aW9uIGZhaWx1cmUpIHJldXNlIGl0IHJhdGhlciB0aGFuIGNyZWF0aW5nIGFcblx0XHQvLyBzZWNvbmQgYnJhbmNoICsgd29ya3RyZWUuXG5cdFx0Y29uc3QgYWxyZWFkeSA9IHRoaXMuX21hdGVyaWFsaXplZFdvcmt0cmVlcy5nZXQoc2Vzc2lvbklkKTtcblx0XHRpZiAoYWxyZWFkeSkge1xuXHRcdFx0cmV0dXJuIGFscmVhZHkud29ya3RyZWU7XG5cdFx0fVxuXG5cdFx0b25Qcm9ncmVzcz8uKGJ1aWxkV29ya3RyZWVQcm9ncmVzc1RleHQoV29ya3RyZWVDcmVhdGlvblBoYXNlLlN0YXJ0aW5nKSk7XG5cblx0XHRjb25zdCBjaGVja291dFJvb3QgPSBhd2FpdCB0aGlzLl9naXRTZXJ2aWNlLmdldFJlcG9zaXRvcnlSb290KHdvcmtpbmdEaXJlY3RvcnkpO1xuXHRcdGlmICghY2hlY2tvdXRSb290KSB7XG5cdFx0XHRyZXR1cm4gd29ya2luZ0RpcmVjdG9yeTtcblx0XHR9XG5cblx0XHRjb25zdCByZXBvc2l0b3J5Um9vdCA9IGF3YWl0IHRoaXMuX3Jlc29sdmVQcmltYXJ5V29ya3RyZWVSb290KGNoZWNrb3V0Um9vdCwgY2hlY2tvdXRSb290KTtcblx0XHRjb25zdCB3b3JrdHJlZXNSb290ID0gZ2V0V29ya3RyZWVzUm9vdChyZXBvc2l0b3J5Um9vdCk7XG5cdFx0Ly8gUHJlZml4IChlLmcuIHRoZSB1c2VyJ3MgYGdpdC5icmFuY2hQcmVmaXhgKSB0aGUgY2xpZW50IGZvcndhcmRzIGZvclxuXHRcdC8vIHdvcmt0cmVlLWlzb2xhdGVkIHNlc3Npb25zLiBQcmVwZW5kZWQgYWhlYWQgb2YgdGhlIGJ1aWx0LWluIGBhZ2VudHMvYFxuXHRcdC8vIHByZWZpeCB3aGVuIG5hbWluZyB0aGUgYnJhbmNoIGFuZCBzdHJpcHBlZCBmcm9tIHRoZSB3b3JrdHJlZSBkaXIgbmFtZS5cblx0XHRjb25zdCB3b3JrdHJlZUJyYW5jaFByZWZpeCA9IHR5cGVvZiBjb25maWdbU2Vzc2lvbkNvbmZpZ0tleS5Xb3JrdHJlZUJyYW5jaFByZWZpeF0gPT09ICdzdHJpbmcnXG5cdFx0XHQ/IGNvbmZpZ1tTZXNzaW9uQ29uZmlnS2V5Lldvcmt0cmVlQnJhbmNoUHJlZml4XSBhcyBzdHJpbmdcblx0XHRcdDogdW5kZWZpbmVkO1xuXHRcdGNvbnN0IHNlbGVjdGVkQnJhbmNoID0gY29uZmlnW1Nlc3Npb25Db25maWdLZXkuQnJhbmNoXSBhcyBzdHJpbmc7XG5cdFx0Y29uc3QgeyBicmFuY2hOYW1lLCB3b3JrdHJlZSwgYmFzZUJyYW5jaCB9ID0gYXdhaXQgdGhpcy5fd29ya3RyZWVDcmVhdGlvblNlcXVlbmNlci5xdWV1ZShyZXBvc2l0b3J5Um9vdC50b1N0cmluZygpLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRvblByb2dyZXNzPy4oYnVpbGRXb3JrdHJlZVByb2dyZXNzVGV4dChXb3JrdHJlZUNyZWF0aW9uUGhhc2UuTmFtaW5nQnJhbmNoKSk7XG5cdFx0XHRjb25zdCBicmFuY2hOYW1lID0gYXdhaXQgdGhpcy5fYnJhbmNoTmFtZUdlbmVyYXRvci5nZW5lcmF0ZUJyYW5jaE5hbWUoe1xuXHRcdFx0XHRzZXNzaW9uSWQsXG5cdFx0XHRcdG1lc3NhZ2U6IHByb21wdCxcblx0XHRcdFx0Z2l0aHViVG9rZW4sXG5cdFx0XHRcdGJyYW5jaFByZWZpeDogd29ya3RyZWVCcmFuY2hQcmVmaXgsXG5cdFx0XHRcdGJyYW5jaE5hbWVDb2xsaWRlczogYXN5bmMgY2FuZGlkYXRlID0+IHtcblx0XHRcdFx0XHRpZiAoYXdhaXQgdGhpcy5fZ2l0U2VydmljZS5icmFuY2hFeGlzdHMocmVwb3NpdG9yeVJvb3QsIGNhbmRpZGF0ZSkuY2F0Y2goKCkgPT4gdHJ1ZSkpIHtcblx0XHRcdFx0XHRcdHJldHVybiB0cnVlO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRjb25zdCBjYW5kaWRhdGVXb3JrdHJlZSA9IFVSSS5qb2luUGF0aCh3b3JrdHJlZXNSb290LCBnZXRXb3JrdHJlZU5hbWUoY2FuZGlkYXRlLCB3b3JrdHJlZUJyYW5jaFByZWZpeCkpO1xuXHRcdFx0XHRcdHJldHVybiBmaWxlRXhpc3RzKGNhbmRpZGF0ZVdvcmt0cmVlLmZzUGF0aCk7XG5cdFx0XHRcdH0sXG5cdFx0XHR9KTtcblx0XHRcdGNvbnN0IHdvcmt0cmVlID0gVVJJLmpvaW5QYXRoKHdvcmt0cmVlc1Jvb3QsIGdldFdvcmt0cmVlTmFtZShicmFuY2hOYW1lLCB3b3JrdHJlZUJyYW5jaFByZWZpeCkpO1xuXHRcdFx0Y29uc3QgYmFzZUJyYW5jaCA9IGF3YWl0IHRoaXMuX3Jlc29sdmVCcmFuY2hTdGFydFBvaW50KHJlcG9zaXRvcnlSb290LCBzZWxlY3RlZEJyYW5jaCk7XG5cdFx0XHRhd2FpdCBmcy5ta2Rpcih3b3JrdHJlZXNSb290LmZzUGF0aCwgeyByZWN1cnNpdmU6IHRydWUgfSk7XG5cblx0XHRcdC8vIEdpdCBzdXBwcmVzc2VzIHByb2dyZXNzIGZvciB0aGUgZmlyc3QgY291cGxlIG9mIHNlY29uZHMsIHNvIG5hbWVcblx0XHRcdC8vIHRoZSBwaGFzZSB1cCBmcm9udCByYXRoZXIgdGhhbiBsZWF2aW5nIHRoZSBsYWJlbCBzdGFsZSB1bnRpbCB0aGVcblx0XHRcdC8vIGZpcnN0IHBlcmNlbnRhZ2UgYXJyaXZlcy5cblx0XHRcdG9uUHJvZ3Jlc3M/LihidWlsZFdvcmt0cmVlUHJvZ3Jlc3NUZXh0KFdvcmt0cmVlQ3JlYXRpb25QaGFzZS5DaGVja2luZ091dCkpO1xuXG5cdFx0XHRjb25zdCB3b3JrdHJlZUJyYW5jaFRyYWNrID0gY29uZmlnW1Nlc3Npb25Db25maWdLZXkuV29ya3RyZWVCcmFuY2hUcmFja10gPT09IHRydWU7XG5cdFx0XHRhd2FpdCB3aXRoUGVyY2VudFByb2dyZXNzKFdvcmt0cmVlQ3JlYXRpb25QaGFzZS5DaGVja2luZ091dCwgb25Qcm9ncmVzcywgcHJvZ3Jlc3MgPT5cblx0XHRcdFx0dGhpcy5fZ2l0U2VydmljZS5hZGRXb3JrdHJlZShyZXBvc2l0b3J5Um9vdCwgd29ya3RyZWUsIGJyYW5jaE5hbWUsIGJhc2VCcmFuY2gsIHdvcmt0cmVlQnJhbmNoVHJhY2ssIHByb2dyZXNzKSk7XG5cdFx0XHRyZXR1cm4geyBicmFuY2hOYW1lLCB3b3JrdHJlZSwgYmFzZUJyYW5jaCB9O1xuXHRcdH0pO1xuXHRcdGNvbnN0IHdvcmt0cmVlSW5jbHVkZUZpbGVzID0gQXJyYXkuaXNBcnJheShjb25maWdbU2Vzc2lvbkNvbmZpZ0tleS5Xb3JrdHJlZUluY2x1ZGVGaWxlc10pXG5cdFx0XHQmJiBjb25maWdbU2Vzc2lvbkNvbmZpZ0tleS5Xb3JrdHJlZUluY2x1ZGVGaWxlc10uZXZlcnkocGF0dGVybiA9PiB0eXBlb2YgcGF0dGVybiA9PT0gJ3N0cmluZycpXG5cdFx0XHQ/IGNvbmZpZ1tTZXNzaW9uQ29uZmlnS2V5Lldvcmt0cmVlSW5jbHVkZUZpbGVzXSBhcyByZWFkb25seSBzdHJpbmdbXVxuXHRcdFx0OiB1bmRlZmluZWQ7XG5cdFx0aWYgKHdvcmt0cmVlSW5jbHVkZUZpbGVzPy5sZW5ndGgpIHtcblx0XHRcdHRyeSB7XG5cdFx0XHRcdG9uUHJvZ3Jlc3M/LihidWlsZFdvcmt0cmVlUHJvZ3Jlc3NUZXh0KFdvcmt0cmVlQ3JlYXRpb25QaGFzZS5Db3B5aW5nSW5jbHVkZUZpbGVzKSk7XG5cdFx0XHRcdGF3YWl0IHdpdGhQZXJjZW50UHJvZ3Jlc3MoV29ya3RyZWVDcmVhdGlvblBoYXNlLkNvcHlpbmdJbmNsdWRlRmlsZXMsIG9uUHJvZ3Jlc3MsIHByb2dyZXNzID0+XG5cdFx0XHRcdFx0dGhpcy5fZ2l0U2VydmljZS5jb3B5V29ya3RyZWVJbmNsdWRlRmlsZXMoY2hlY2tvdXRSb290LCB3b3JrdHJlZSwgd29ya3RyZWVJbmNsdWRlRmlsZXMsIHByb2dyZXNzKSk7XG5cdFx0XHR9IGNhdGNoIChlcnJvcikge1xuXHRcdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLndhcm4oYFske3RoaXMuX2xvZ0xhYmVsfToke3Nlc3Npb25JZH1dIEZhaWxlZCB0byBjb3B5IHdvcmt0cmVlIGluY2x1ZGUgZmlsZXM6ICR7ZXJyb3JNZXNzYWdlKGVycm9yKX1gKTtcblx0XHRcdH1cblx0XHR9XG5cdFx0dGhpcy5fbWF0ZXJpYWxpemVkV29ya3RyZWVzLnNldChzZXNzaW9uSWQsIHsgcmVwb3NpdG9yeVJvb3QsIHdvcmt0cmVlIH0pO1xuXHRcdC8vIFF1ZXVlIHRoZSB3b3JrdHJlZSBhbm5vdW5jZW1lbnQgc28gdGhlIGZpcnN0IHR1cm4gKGxpdmUpIGFuZCBhbnlcblx0XHQvLyBzdWJzZXF1ZW50IHJlc3RvcmUgKGhpc3RvcnkpIGJvdGggc3VyZmFjZSB0aGUgbWVzc2FnZSBpbiB0aGUgY2hhdC5cblx0XHR0aGlzLl9wZW5kaW5nRmlyc3RUdXJuQW5ub3VuY2VtZW50cy5zZXQoc2Vzc2lvbklkLCBidWlsZFdvcmt0cmVlQW5ub3VuY2VtZW50VGV4dChicmFuY2hOYW1lKSk7XG5cdFx0dHJ5IHtcblx0XHRcdGF3YWl0IHRoaXMuX3dyaXRlV29ya3RyZWVNZXRhZGF0YShzZXNzaW9uVXJpLCB7IGJyYW5jaE5hbWUsIGJhc2VCcmFuY2gsIHdvcmt0cmVlUGF0aDogd29ya3RyZWUsIHJlcG9zaXRvcnlSb290IH0pO1xuXHRcdH0gY2F0Y2ggKGVycm9yKSB7XG5cdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLndhcm4oYFske3RoaXMuX2xvZ0xhYmVsfToke3Nlc3Npb25JZH1dIEZhaWxlZCB0byBwZXJzaXN0IHdvcmt0cmVlIGJyYW5jaCBtZXRhZGF0YTogJHtlcnJvck1lc3NhZ2UoZXJyb3IpfWApO1xuXHRcdH1cblx0XHRyZXR1cm4gd29ya3RyZWU7XG5cdH1cblxuXHQvKiogUmVzb2x2ZXMgYSBwZXJzaXN0ZWQgd29ya2luZyBkaXJlY3RvcnksIHJlcGFpcmluZyBhIHJlbW92ZWQgd29ya3RyZWUgd2hlbiBwb3NzaWJsZS4gKi9cblx0YXN5bmMgcmVzb2x2ZVdvcmtpbmdEaXJlY3RvcnlGb3JSZXN1bWUoc2Vzc2lvblVyaTogVVJJLCBzZXNzaW9uSWQ6IHN0cmluZywgd29ya2luZ0RpcmVjdG9yeTogVVJJKTogUHJvbWlzZTxVUkk+IHtcblx0XHRyZXR1cm4gdGhpcy5fc2VxdWVuY2VyLnF1ZXVlKHNlc3Npb25JZCwgKCkgPT4gdGhpcy5fcmVzb2x2ZVdvcmtpbmdEaXJlY3RvcnlGb3JSZXN1bWUoc2Vzc2lvblVyaSwgc2Vzc2lvbklkLCB3b3JraW5nRGlyZWN0b3J5KSk7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIF9yZXNvbHZlV29ya2luZ0RpcmVjdG9yeUZvclJlc3VtZShzZXNzaW9uVXJpOiBVUkksIHNlc3Npb25JZDogc3RyaW5nLCB3b3JraW5nRGlyZWN0b3J5OiBVUkkpOiBQcm9taXNlPFVSST4ge1xuXHRcdGlmICh3b3JraW5nRGlyZWN0b3J5LnNjaGVtZSAhPT0gU2NoZW1hcy5maWxlKSB7XG5cdFx0XHRyZXR1cm4gd29ya2luZ0RpcmVjdG9yeTtcblx0XHR9XG5cdFx0dHJ5IHtcblx0XHRcdGF3YWl0IGZzLmFjY2Vzcyh3b3JraW5nRGlyZWN0b3J5LmZzUGF0aCk7XG5cdFx0XHRyZXR1cm4gd29ya2luZ0RpcmVjdG9yeTtcblx0XHR9IGNhdGNoIHtcblx0XHRcdC8vIFJlcGFpciBvciBmYWxsIGJhY2sgYmVsb3cuXG5cdFx0fVxuXG5cdFx0Y29uc3QgbWV0YSA9IGF3YWl0IHRoaXMuX3JlYWRXb3JrdHJlZU1ldGFkYXRhKHNlc3Npb25VcmkpLmNhdGNoKCgpID0+IHVuZGVmaW5lZCk7XG5cdFx0Y29uc3QgYXJjaGl2ZWQgPSBhd2FpdCB0aGlzLl9pc1Nlc3Npb25BcmNoaXZlZChzZXNzaW9uVXJpKTtcblx0XHRpZiAoYXJjaGl2ZWQpIHtcblx0XHRcdGlmIChtZXRhPy5yZXBvc2l0b3J5Um9vdCkge1xuXHRcdFx0XHR0cnkge1xuXHRcdFx0XHRcdGF3YWl0IGZzLmFjY2VzcyhtZXRhLnJlcG9zaXRvcnlSb290LmZzUGF0aCk7XG5cdFx0XHRcdFx0dGhpcy5fbG9nU2VydmljZS5pbmZvKGBbJHt0aGlzLl9sb2dMYWJlbH06JHtzZXNzaW9uSWR9XSBBcmNoaXZlZCBzZXNzaW9uIHdvcmtpbmcgZGlyZWN0b3J5ICcke3dvcmtpbmdEaXJlY3RvcnkuZnNQYXRofScgaXMgbWlzc2luZzsgcmVzdW1pbmcgYWdhaW5zdCByZXBvc2l0b3J5IHJvb3QgJyR7bWV0YS5yZXBvc2l0b3J5Um9vdC5mc1BhdGh9JyBmb3IgaGlzdG9yeWApO1xuXHRcdFx0XHRcdHJldHVybiBtZXRhLnJlcG9zaXRvcnlSb290O1xuXHRcdFx0XHR9IGNhdGNoIHtcblx0XHRcdFx0XHQvLyBGYWxsIHRocm91Z2ggd2hlbiB0aGUgcmVwb3NpdG9yeSByb290IGlzIGFsc28gZ29uZS5cblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdFx0dGhpcy5fbG9nU2VydmljZS53YXJuKGBbJHt0aGlzLl9sb2dMYWJlbH06JHtzZXNzaW9uSWR9XSBDYW5ub3QgcmVzdW1lIGFyY2hpdmVkIHNlc3Npb246IHdvcmtpbmcgZGlyZWN0b3J5ICcke3dvcmtpbmdEaXJlY3RvcnkuZnNQYXRofScgaXMgbWlzc2luZyBhbmQgbm8gdXNhYmxlIHJlcG9zaXRvcnktcm9vdCBmYWxsYmFjayB3YXMgZm91bmRgKTtcblx0XHRcdHRocm93IG5ldyBTZXNzaW9uV29ya2luZ0RpcmVjdG9yeU1pc3NpbmdFcnJvcih3b3JraW5nRGlyZWN0b3J5KTtcblx0XHR9XG5cblx0XHRsZXQgcmVjcmVhdGVGYWlsdXJlUmVhc29uOiBzdHJpbmcgfCB1bmRlZmluZWQ7XG5cdFx0aWYgKG1ldGE/Lndvcmt0cmVlUGF0aCAmJiBtZXRhLnJlcG9zaXRvcnlSb290KSB7XG5cdFx0XHRjb25zdCB7IGJyYW5jaE5hbWUsIHdvcmt0cmVlUGF0aCwgcmVwb3NpdG9yeVJvb3QgfSA9IG1ldGE7XG5cdFx0XHRjb25zdCByZWNyZWF0ZWQgPSBhd2FpdCB0aGlzLl9yZWNyZWF0ZVdvcmt0cmVlKHNlc3Npb25JZCwgeyBicmFuY2hOYW1lLCB3b3JrdHJlZVBhdGgsIHJlcG9zaXRvcnlSb290IH0pO1xuXHRcdFx0aWYgKHJlY3JlYXRlZC5vaykge1xuXHRcdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLmluZm8oYFske3RoaXMuX2xvZ0xhYmVsfToke3Nlc3Npb25JZH1dIFJlY3JlYXRlZCBtaXNzaW5nIHdvcmt0cmVlICcke3dvcmt0cmVlUGF0aC5mc1BhdGh9JyBmb3IgYSBsaXZlIHNlc3Npb24gb24gcmVzdW1lYCk7XG5cdFx0XHRcdHJldHVybiB3b3JrdHJlZVBhdGg7XG5cdFx0XHR9XG5cdFx0XHRyZWNyZWF0ZUZhaWx1cmVSZWFzb24gPSByZWNyZWF0ZWQucmVhc29uO1xuXHRcdH1cblxuXHRcdHRoaXMuX2xvZ1NlcnZpY2Uud2FybihgWyR7dGhpcy5fbG9nTGFiZWx9OiR7c2Vzc2lvbklkfV0gQ2Fubm90IHJlc3VtZTogd29ya2luZyBkaXJlY3RvcnkgJyR7d29ya2luZ0RpcmVjdG9yeS5mc1BhdGh9JyBpcyBtaXNzaW5nIGFuZCBpdHMgd29ya3RyZWUgY291bGQgbm90IGJlIHJlY3JlYXRlZCR7cmVjcmVhdGVGYWlsdXJlUmVhc29uID8gYDogJHtyZWNyZWF0ZUZhaWx1cmVSZWFzb259YCA6ICcnfWApO1xuXHRcdHRocm93IG5ldyBTZXNzaW9uV29ya2luZ0RpcmVjdG9yeU1pc3NpbmdFcnJvcih3b3JraW5nRGlyZWN0b3J5LCByZWNyZWF0ZUZhaWx1cmVSZWFzb24pO1xuXHR9XG5cblx0LyoqXG5cdCAqIFRha2VzIChhbmQgY2xlYXJzKSB0aGUgcGVuZGluZyBcIndvcmt0cmVlIGNyZWF0ZWRcIiBhbm5vdW5jZW1lbnQgZm9yIGFcblx0ICogc2Vzc2lvbiBzbyBjYWxsZXJzIGNhbiBlbWl0IGl0IGxpdmUgYXMgdGhlIGZpcnN0IHJlc3BvbnNlIHBhcnQgb24gdGhlXG5cdCAqIGZpcnN0IHR1cm4uIFJldHVybnMgYHVuZGVmaW5lZGAgd2hlbiB0aGUgc2Vzc2lvbiBoYXMgbm8gcGVuZGluZ1xuXHQgKiBhbm5vdW5jZW1lbnQuXG5cdCAqL1xuXHR0YWtlUGVuZGluZ0Fubm91bmNlbWVudChzZXNzaW9uSWQ6IHN0cmluZyk6IHN0cmluZyB8IHVuZGVmaW5lZCB7XG5cdFx0Y29uc3QgYW5ub3VuY2VtZW50ID0gdGhpcy5fcGVuZGluZ0ZpcnN0VHVybkFubm91bmNlbWVudHMuZ2V0KHNlc3Npb25JZCk7XG5cdFx0aWYgKGFubm91bmNlbWVudCAhPT0gdW5kZWZpbmVkKSB7XG5cdFx0XHR0aGlzLl9wZW5kaW5nRmlyc3RUdXJuQW5ub3VuY2VtZW50cy5kZWxldGUoc2Vzc2lvbklkKTtcblx0XHR9XG5cdFx0cmV0dXJuIGFubm91bmNlbWVudDtcblx0fVxuXG5cdGFzeW5jIHBlcnNpc3RDcmVhdGlvbkZhaWx1cmUoc2Vzc2lvblVyaTogVVJJLCBzZXNzaW9uSWQ6IHN0cmluZywgZGlhZ25vc3RpYzogc3RyaW5nIHwgdW5kZWZpbmVkKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3QgZGJSZWYgPSB0aGlzLl9zZXNzaW9uRGF0YVNlcnZpY2Uub3BlbkRhdGFiYXNlKHNlc3Npb25VcmkpO1xuXHRcdHRyeSB7XG5cdFx0XHRhd2FpdCBkYlJlZi5vYmplY3Quc2V0TWV0YWRhdGEoV09SS1RSRUVfTUVUQV9DUkVBVElPTl9GQUlMVVJFLCBKU09OLnN0cmluZ2lmeSh7XG5cdFx0XHRcdHNlc3Npb25JZCxcblx0XHRcdFx0ZGlhZ25vc3RpYzogbm9ybWFsaXplV29ya3RyZWVGYWlsdXJlRGlhZ25vc3RpYyhkaWFnbm9zdGljKSxcblx0XHRcdH0pKTtcblx0XHR9IGZpbmFsbHkge1xuXHRcdFx0ZGJSZWYuZGlzcG9zZSgpO1xuXHRcdH1cblx0fVxuXG5cdC8qKlxuXHQgKiBSZS1pbmplY3RzIHRoZSBhcHBsaWNhYmxlIHdvcmt0cmVlIG5vdGljZSBpbnRvIHRoZSBmaXJzdCByZXN0b3JlZCB0dXJuLlxuXHQgKlxuXHQgKiBUaGUgbGl2ZSBwYXRoICh7QGxpbmsgdGFrZVBlbmRpbmdBbm5vdW5jZW1lbnR9KSBoYW5kbGVzIHRoZSB2ZXJ5IGZpcnN0XG5cdCAqIHR1cm4gd2hpbGUgdGhlIHNlc3Npb24gaXMgZnJlc2g7IHRoaXMgcGF0aCB0YWtlcyBvdmVyIG9uIHN1YnNlcXVlbnQgbG9hZHNcblx0ICogKHdoZXJlIHRoZSBzeW50aGV0aWMgYW5ub3VuY2VtZW50IGlzIG5vdCBwYXJ0IG9mIHRoZSBhZ2VudCB0cmFuc2NyaXB0KS5cblx0ICovXG5cdGFzeW5jIGFwcGx5UmVzdG9yZUFubm91bmNlbWVudChzZXNzaW9uVXJpOiBVUkksIHR1cm5zOiByZWFkb25seSBUdXJuW10pOiBQcm9taXNlPHJlYWRvbmx5IFR1cm5bXT4ge1xuXHRcdGNvbnN0IG5vdGljZSA9IGF3YWl0IHRoaXMuX3JlYWRXb3JrdHJlZU5vdGljZShzZXNzaW9uVXJpKS5jYXRjaCgoKSA9PiB1bmRlZmluZWQpO1xuXHRcdGlmIChub3RpY2U/LmtpbmQgPT09ICdmYWlsdXJlJykge1xuXHRcdFx0cmV0dXJuIHByZXBlbmRXb3JrdHJlZUZhaWx1cmVUb0ZpcnN0VHVybih0dXJucywgbm90aWNlLmRpYWdub3N0aWMpO1xuXHRcdH1cblx0XHRpZiAobm90aWNlPy5raW5kICE9PSAnc3VjY2VzcycpIHtcblx0XHRcdHJldHVybiB0dXJucztcblx0XHR9XG5cdFx0cmV0dXJuIHByZXBlbmRBbm5vdW5jZW1lbnRUb0ZpcnN0VHVybih0dXJucywgYnVpbGRXb3JrdHJlZUFubm91bmNlbWVudFRleHQobm90aWNlLmJyYW5jaE5hbWUpKTtcblx0fVxuXG5cdC8qKiBSZXNvbHZlcyB0aGUgd29ya3RyZWUgdG8gcmVtb3ZlIGJlZm9yZSB0aGUgc2Vzc2lvbiBkYXRhYmFzZSBpcyBkZWxldGVkLiAqL1xuXHRhc3luYyBwcmVwYXJlU2Vzc2lvbkRlbGV0aW9uKHNlc3Npb25Vcmk6IFVSSSwgc2Vzc2lvbklkOiBzdHJpbmcpOiBQcm9taXNlPElTZXNzaW9uV29ya3RyZWUgfCB1bmRlZmluZWQ+IHtcblx0XHRyZXR1cm4gdGhpcy5fc2VxdWVuY2VyLnF1ZXVlKHNlc3Npb25JZCwgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgZGVsZXRpb25SZXRyeSA9IHRoaXMuX3dvcmt0cmVlRGVsZXRpb25SZXRyaWVzLmdldChzZXNzaW9uSWQpO1xuXHRcdFx0aWYgKGRlbGV0aW9uUmV0cnkpIHtcblx0XHRcdFx0cmV0dXJuIGRlbGV0aW9uUmV0cnk7XG5cdFx0XHR9XG5cdFx0XHRjb25zdCBtYXRlcmlhbGl6ZWRXb3JrdHJlZSA9IHRoaXMuX21hdGVyaWFsaXplZFdvcmt0cmVlcy5nZXQoc2Vzc2lvbklkKTtcblx0XHRcdGlmIChtYXRlcmlhbGl6ZWRXb3JrdHJlZSkge1xuXHRcdFx0XHRyZXR1cm4gbWF0ZXJpYWxpemVkV29ya3RyZWU7XG5cdFx0XHR9XG5cdFx0XHR0cnkge1xuXHRcdFx0XHRjb25zdCBtZXRhID0gYXdhaXQgdGhpcy5fcmVhZFdvcmt0cmVlTWV0YWRhdGEoc2Vzc2lvblVyaSk7XG5cdFx0XHRcdHJldHVybiBtZXRhPy53b3JrdHJlZVBhdGggJiYgbWV0YS5yZXBvc2l0b3J5Um9vdFxuXHRcdFx0XHRcdD8geyByZXBvc2l0b3J5Um9vdDogbWV0YS5yZXBvc2l0b3J5Um9vdCwgd29ya3RyZWU6IG1ldGEud29ya3RyZWVQYXRoIH1cblx0XHRcdFx0XHQ6IHVuZGVmaW5lZDtcblx0XHRcdH0gY2F0Y2ggKGVycm9yKSB7XG5cdFx0XHRcdHRoaXMuX2xvZ1NlcnZpY2Uud2FybihgWyR7dGhpcy5fbG9nTGFiZWx9OiR7c2Vzc2lvbklkfV0gRmFpbGVkIHRvIHJlYWQgd29ya3RyZWUgbWV0YWRhdGEgYmVmb3JlIHNlc3Npb24gZGVsZXRpb246ICR7ZXJyb3JNZXNzYWdlKGVycm9yKX1gKTtcblx0XHRcdFx0dGhyb3cgZXJyb3I7XG5cdFx0XHR9XG5cdFx0fSk7XG5cdH1cblxuXHQvKiogRm9yY2UtcmVtb3ZlcyB0aGUgcmVzb2x2ZWQgd29ya3RyZWUgYWZ0ZXIgdGhlIHVzZXIgY29uZmlybXMgc2Vzc2lvbiBkZWxldGlvbi4gKi9cblx0YXN5bmMgcmVtb3ZlU2Vzc2lvbldvcmt0cmVlKHNlc3Npb25JZDogc3RyaW5nLCB3b3JrdHJlZTogSVNlc3Npb25Xb3JrdHJlZSB8IHVuZGVmaW5lZCk6IFByb21pc2U8dm9pZD4ge1xuXHRcdHJldHVybiB0aGlzLl9zZXF1ZW5jZXIucXVldWUoc2Vzc2lvbklkLCAoKSA9PiB0aGlzLl9yZW1vdmVTZXNzaW9uV29ya3RyZWUoc2Vzc2lvbklkLCB3b3JrdHJlZSkpO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBfcmVtb3ZlU2Vzc2lvbldvcmt0cmVlKHNlc3Npb25JZDogc3RyaW5nLCB3b3JrdHJlZTogSVNlc3Npb25Xb3JrdHJlZSB8IHVuZGVmaW5lZCk6IFByb21pc2U8dm9pZD4ge1xuXHRcdHRoaXMuY2xlYXJQZW5kaW5nKHNlc3Npb25JZCk7XG5cdFx0aWYgKCF3b3JrdHJlZSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHR0cnkge1xuXHRcdFx0YXdhaXQgdGhpcy5fZ2l0U2VydmljZS5yZW1vdmVXb3JrdHJlZSh3b3JrdHJlZS5yZXBvc2l0b3J5Um9vdCwgd29ya3RyZWUud29ya3RyZWUsIHsgZm9yY2U6IHRydWUgfSk7XG5cdFx0XHR0aGlzLl9tYXRlcmlhbGl6ZWRXb3JrdHJlZXMuZGVsZXRlKHNlc3Npb25JZCk7XG5cdFx0XHR0aGlzLl93b3JrdHJlZURlbGV0aW9uUmV0cmllcy5kZWxldGUoc2Vzc2lvbklkKTtcblx0XHR9IGNhdGNoIChlcnJvcikge1xuXHRcdFx0dGhpcy5fd29ya3RyZWVEZWxldGlvblJldHJpZXMuc2V0KHNlc3Npb25JZCwgd29ya3RyZWUpO1xuXHRcdFx0dGhpcy5fbG9nU2VydmljZS53YXJuKGBbJHt0aGlzLl9sb2dMYWJlbH06JHtzZXNzaW9uSWR9XSBGYWlsZWQgdG8gcmVtb3ZlIHdvcmt0cmVlICcke3dvcmt0cmVlLndvcmt0cmVlLmZzUGF0aH0nOiAke2Vycm9yTWVzc2FnZShlcnJvcil9YCk7XG5cdFx0XHR0aHJvdyBlcnJvcjtcblx0XHR9XG5cdH1cblxuXHQvKipcblx0ICogT24gYXJjaGl2ZSwgcmVtb3ZlcyB0aGUgd29ya3RyZWUgZGlyZWN0b3J5IHdoZW4gaXRzIGJyYW5jaCBpcyBwcmVzZXJ2ZWRcblx0ICogYW5kIHRoZSB3b3JraW5nIHRyZWUgaXMgY2xlYW4sIHNvIHRoZSB3b3JrdHJlZSBjYW4gYmUgcmVjcmVhdGVkIG9uXG5cdCAqIHVuYXJjaGl2ZSB3aXRob3V0IGxvc2luZyB3b3JrLiBTa2lwcyB0aGUgcmVtb3ZhbCB3aGVuIHRoZSBicmFuY2ggaXNcblx0ICogbWlzc2luZyBvciB0aGUgdHJlZSBpcyBkaXJ0eS5cblx0ICovXG5cdGFzeW5jIGNsZWFudXBXb3JrdHJlZU9uQXJjaGl2ZShzZXNzaW9uVXJpOiBVUkksIHNlc3Npb25JZDogc3RyaW5nKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0cmV0dXJuIHRoaXMuX3NlcXVlbmNlci5xdWV1ZShzZXNzaW9uSWQsICgpID0+IHRoaXMuX2NsZWFudXBXb3JrdHJlZU9uQXJjaGl2ZShzZXNzaW9uVXJpLCBzZXNzaW9uSWQpKTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgX2NsZWFudXBXb3JrdHJlZU9uQXJjaGl2ZShzZXNzaW9uVXJpOiBVUkksIHNlc3Npb25JZDogc3RyaW5nKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3QgbWV0YSA9IGF3YWl0IHRoaXMuX3JlYWRXb3JrdHJlZU1ldGFkYXRhKHNlc3Npb25VcmkpLmNhdGNoKCgpID0+IHVuZGVmaW5lZCk7XG5cdFx0aWYgKCFtZXRhPy53b3JrdHJlZVBhdGggfHwgIW1ldGEucmVwb3NpdG9yeVJvb3QpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0Y29uc3QgeyBicmFuY2hOYW1lLCB3b3JrdHJlZVBhdGgsIHJlcG9zaXRvcnlSb290IH0gPSBtZXRhO1xuXG5cdFx0Ly8gU2tpcCBpZiB0aGUgd29ya3RyZWUgZGlyZWN0b3J5IGlzIGFscmVhZHkgZ29uZSBcdTIwMTQgbm90aGluZyB0byBjbGVhbi5cblx0XHR0cnkge1xuXHRcdFx0YXdhaXQgZnMuYWNjZXNzKHdvcmt0cmVlUGF0aC5mc1BhdGgpO1xuXHRcdH0gY2F0Y2gge1xuXHRcdFx0dGhpcy5fbWF0ZXJpYWxpemVkV29ya3RyZWVzLmRlbGV0ZShzZXNzaW9uSWQpO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdC8vIFNraXAgaWYgdGhlIGJyYW5jaCBpcyBtaXNzaW5nIFx1MjAxNCB3aXRob3V0IGl0IHdlIGNhbid0IHNhZmVseSByZWNyZWF0ZVxuXHRcdC8vIHRoZSB3b3JrdHJlZSBvbiB1bmFyY2hpdmUsIHNvIGxlYXZlIHRoZSB3b3JraW5nIHRyZWUgaW50YWN0LlxuXHRcdGNvbnN0IGJyYW5jaFByZXNlbnQgPSBhd2FpdCB0aGlzLl9naXRTZXJ2aWNlLmJyYW5jaEV4aXN0cyhyZXBvc2l0b3J5Um9vdCwgYnJhbmNoTmFtZSkuY2F0Y2goKCkgPT4gZmFsc2UpO1xuXHRcdGlmICghYnJhbmNoUHJlc2VudCkge1xuXHRcdFx0dGhpcy5fbG9nU2VydmljZS5pbmZvKGBbJHt0aGlzLl9sb2dMYWJlbH06JHtzZXNzaW9uSWR9XSBTa2lwcGluZyB3b3JrdHJlZSBjbGVhbnVwOiBicmFuY2ggJyR7YnJhbmNoTmFtZX0nIGlzIG1pc3NpbmdgKTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHQvLyBDb21taXQgYW55IHVuY29tbWl0dGVkIGNoYW5nZXMgYmVmb3JlIGFyY2hpdmluZyB0aGUgc2Vzc2lvblxuXHRcdGNvbnN0IGhhc1VuY29tbWl0dGVkQ2hhbmdlcyA9IGF3YWl0IHRoaXMuX2dpdFNlcnZpY2UuaGFzVW5jb21taXR0ZWRDaGFuZ2VzKHdvcmt0cmVlUGF0aCkuY2F0Y2goKCkgPT4gdHJ1ZSk7XG5cdFx0aWYgKGhhc1VuY29tbWl0dGVkQ2hhbmdlcykge1xuXHRcdFx0dHJ5IHtcblx0XHRcdFx0YXdhaXQgdGhpcy5fZ2l0U2VydmljZS5jb21taXRBbGwod29ya3RyZWVQYXRoLCBsb2NhbGl6ZSgnd29ya3RyZWVJc29sYXRpb24uY29tbWl0TWVzc2FnZScsICdTYXZpbmcgdW5jb21taXR0ZWQgY2hhbmdlcyBiZWZvcmUgYXJjaGl2aW5nIHNlc3Npb24nKSk7XG5cdFx0XHR9IGNhdGNoIChlcnJvcikge1xuXHRcdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLndhcm4oYFske3RoaXMuX2xvZ0xhYmVsfToke3Nlc3Npb25JZH1dIEZhaWxlZCB0byBjb21taXQgdW5jb21taXR0ZWQgY2hhbmdlcyBpbiAnJHt3b3JrdHJlZVBhdGguZnNQYXRofSc6ICR7ZXJyb3JNZXNzYWdlKGVycm9yKX1gKTtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdHRyeSB7XG5cdFx0XHRhd2FpdCB0aGlzLl9naXRTZXJ2aWNlLnJlbW92ZVdvcmt0cmVlKHJlcG9zaXRvcnlSb290LCB3b3JrdHJlZVBhdGgpO1xuXHRcdFx0dGhpcy5fbG9nU2VydmljZS5pbmZvKGBbJHt0aGlzLl9sb2dMYWJlbH06JHtzZXNzaW9uSWR9XSBSZW1vdmVkIHdvcmt0cmVlICcke3dvcmt0cmVlUGF0aC5mc1BhdGh9JyBvbiBhcmNoaXZlYCk7XG5cdFx0XHR0aGlzLl9tYXRlcmlhbGl6ZWRXb3JrdHJlZXMuZGVsZXRlKHNlc3Npb25JZCk7XG5cdFx0fSBjYXRjaCAoZXJyb3IpIHtcblx0XHRcdHRoaXMuX2xvZ1NlcnZpY2Uud2FybihgWyR7dGhpcy5fbG9nTGFiZWx9OiR7c2Vzc2lvbklkfV0gRmFpbGVkIHRvIHJlbW92ZSB3b3JrdHJlZSAnJHt3b3JrdHJlZVBhdGguZnNQYXRofScgb24gYXJjaGl2ZTogJHtlcnJvck1lc3NhZ2UoZXJyb3IpfWApO1xuXHRcdH1cblx0fVxuXG5cdC8qKlxuXHQgKiBPbiB1bmFyY2hpdmUsIHJlY3JlYXRlcyBhIHByZXZpb3VzbHkgY2xlYW5lZC11cCB3b3JrdHJlZSBhZ2FpbnN0IGl0c1xuXHQgKiBwcmVzZXJ2ZWQgYnJhbmNoLiBOby1vcCB3aGVuIHRoZSBkaXJlY3Rvcnkgc3RpbGwgZXhpc3RzIG9yIHRoZSBicmFuY2ggaXNcblx0ICogbWlzc2luZy5cblx0ICovXG5cdGFzeW5jIHJlY3JlYXRlV29ya3RyZWVPblVuYXJjaGl2ZShzZXNzaW9uVXJpOiBVUkksIHNlc3Npb25JZDogc3RyaW5nKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0cmV0dXJuIHRoaXMuX3NlcXVlbmNlci5xdWV1ZShzZXNzaW9uSWQsICgpID0+IHRoaXMuX3JlY3JlYXRlV29ya3RyZWVPblVuYXJjaGl2ZShzZXNzaW9uVXJpLCBzZXNzaW9uSWQpKTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgX3JlY3JlYXRlV29ya3RyZWVPblVuYXJjaGl2ZShzZXNzaW9uVXJpOiBVUkksIHNlc3Npb25JZDogc3RyaW5nKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3QgbWV0YSA9IGF3YWl0IHRoaXMuX3JlYWRXb3JrdHJlZU1ldGFkYXRhKHNlc3Npb25VcmkpLmNhdGNoKCgpID0+IHVuZGVmaW5lZCk7XG5cdFx0aWYgKCFtZXRhPy53b3JrdHJlZVBhdGggfHwgIW1ldGEucmVwb3NpdG9yeVJvb3QpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0Ly8gU2tpcCBpZiB0aGUgd29ya3RyZWUgZGlyZWN0b3J5IGFscmVhZHkgZXhpc3RzIFx1MjAxNCBub3RoaW5nIHRvIGRvLlxuXHRcdHRyeSB7XG5cdFx0XHRhd2FpdCBmcy5hY2Nlc3MobWV0YS53b3JrdHJlZVBhdGguZnNQYXRoKTtcblx0XHRcdHJldHVybjtcblx0XHR9IGNhdGNoIHtcblx0XHRcdC8vIGV4cGVjdGVkIHdoZW4gdGhlIHdvcmt0cmVlIHdhcyBjbGVhbmVkIHVwIG9uIGFyY2hpdmVcblx0XHR9XG5cblx0XHRjb25zdCB7IGJyYW5jaE5hbWUsIHdvcmt0cmVlUGF0aCwgcmVwb3NpdG9yeVJvb3QgfSA9IG1ldGE7XG5cdFx0YXdhaXQgdGhpcy5fcmVjcmVhdGVXb3JrdHJlZShzZXNzaW9uSWQsIHsgYnJhbmNoTmFtZSwgd29ya3RyZWVQYXRoLCByZXBvc2l0b3J5Um9vdCB9KTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgX3JlY3JlYXRlV29ya3RyZWUoc2Vzc2lvbklkOiBzdHJpbmcsIG1ldGE6IHsgcmVhZG9ubHkgYnJhbmNoTmFtZTogc3RyaW5nOyByZWFkb25seSB3b3JrdHJlZVBhdGg6IFVSSTsgcmVhZG9ubHkgcmVwb3NpdG9yeVJvb3Q6IFVSSSB9KTogUHJvbWlzZTx7IHJlYWRvbmx5IG9rOiB0cnVlIH0gfCB7IHJlYWRvbmx5IG9rOiBmYWxzZTsgcmVhZG9ubHkgcmVhc29uOiBzdHJpbmcgfT4ge1xuXHRcdGNvbnN0IHsgYnJhbmNoTmFtZSwgd29ya3RyZWVQYXRoLCByZXBvc2l0b3J5Um9vdCB9ID0gbWV0YTtcblx0XHRjb25zdCBicmFuY2hQcmVzZW50ID0gYXdhaXQgdGhpcy5fZ2l0U2VydmljZS5icmFuY2hFeGlzdHMocmVwb3NpdG9yeVJvb3QsIGJyYW5jaE5hbWUpLmNhdGNoKCgpID0+IGZhbHNlKTtcblx0XHRpZiAoIWJyYW5jaFByZXNlbnQpIHtcblx0XHRcdGNvbnN0IHJlYXNvbiA9IGxvY2FsaXplKCd3b3JrdHJlZVJlY3JlYXRlQnJhbmNoTWlzc2luZycsIFwidGhlIGJyYW5jaCAnezB9JyBubyBsb25nZXIgZXhpc3RzXCIsIGJyYW5jaE5hbWUpO1xuXHRcdFx0dGhpcy5fbG9nU2VydmljZS5pbmZvKGBbJHt0aGlzLl9sb2dMYWJlbH06JHtzZXNzaW9uSWR9XSBDYW5ub3QgcmVjcmVhdGUgd29ya3RyZWU6IGJyYW5jaCAnJHticmFuY2hOYW1lfScgaXMgbWlzc2luZ2ApO1xuXHRcdFx0cmV0dXJuIHsgb2s6IGZhbHNlLCByZWFzb24gfTtcblx0XHR9XG5cdFx0dHJ5IHtcblx0XHRcdGF3YWl0IGZzLm1rZGlyKFVSSS5qb2luUGF0aCh3b3JrdHJlZVBhdGgsICcuLicpLmZzUGF0aCwgeyByZWN1cnNpdmU6IHRydWUgfSk7XG5cdFx0XHRhd2FpdCB0aGlzLl9naXRTZXJ2aWNlLmFkZEV4aXN0aW5nV29ya3RyZWUocmVwb3NpdG9yeVJvb3QsIHdvcmt0cmVlUGF0aCwgYnJhbmNoTmFtZSk7XG5cdFx0XHR0aGlzLl9tYXRlcmlhbGl6ZWRXb3JrdHJlZXMuc2V0KHNlc3Npb25JZCwgeyByZXBvc2l0b3J5Um9vdCwgd29ya3RyZWU6IHdvcmt0cmVlUGF0aCB9KTtcblx0XHRcdHRoaXMuX2xvZ1NlcnZpY2UuaW5mbyhgWyR7dGhpcy5fbG9nTGFiZWx9OiR7c2Vzc2lvbklkfV0gUmVjcmVhdGVkIHdvcmt0cmVlICcke3dvcmt0cmVlUGF0aC5mc1BhdGh9J2ApO1xuXHRcdFx0cmV0dXJuIHsgb2s6IHRydWUgfTtcblx0XHR9IGNhdGNoIChlcnJvcikge1xuXHRcdFx0Y29uc3QgcmVhc29uID0gZXJyb3JNZXNzYWdlKGVycm9yKTtcblx0XHRcdHRoaXMuX2xvZ1NlcnZpY2Uud2FybihgWyR7dGhpcy5fbG9nTGFiZWx9OiR7c2Vzc2lvbklkfV0gRmFpbGVkIHRvIHJlY3JlYXRlIHdvcmt0cmVlICcke3dvcmt0cmVlUGF0aC5mc1BhdGh9JzogJHtyZWFzb259YCk7XG5cdFx0XHRyZXR1cm4geyBvazogZmFsc2UsIHJlYXNvbiB9O1xuXHRcdH1cblx0fVxuXG5cdC8qKiBSZWFkcyB0aGUgcGVyc2lzdGVkIHdvcmt0cmVlIG1ldGFkYXRhIGZvciBhIHNlc3Npb24sIGlmIGFueS4gKi9cblx0YXN5bmMgcmVhZFdvcmt0cmVlTWV0YWRhdGEoc2Vzc2lvblVyaTogVVJJKTogUHJvbWlzZTxJV29ya3RyZWVNZXRhZGF0YSB8IHVuZGVmaW5lZD4ge1xuXHRcdHJldHVybiB0aGlzLl9yZWFkV29ya3RyZWVNZXRhZGF0YShzZXNzaW9uVXJpKTtcblx0fVxuXG5cdC8qKlxuXHQgKiBCcmlkZ2VzIHdvcmt0cmVlIG1ldGFkYXRhIGZvciBhIGxlZ2FjeSBzZXNzaW9uIGFkb3B0ZWQgaW4gcGxhY2UsIHdob3NlXG5cdCAqIHdvcmtpbmcgZGlyZWN0b3J5IGlzIGEgcHJlLWV4aXN0aW5nIGdpdCB3b3JrdHJlZSB0aGUgYWdlbnQgaG9zdCBkaWQgbm90XG5cdCAqIGNyZWF0ZS4gV2hlbiBgd29ya2luZ0RpcmVjdG9yeWAgaXMgYSBsaW5rZWQgd29ya3RyZWUgKGl0cyBjaGVja291dCByb290XG5cdCAqIGRpZmZlcnMgZnJvbSB0aGUgcmVwb3NpdG9yeSdzIHByaW1hcnkgd29ya3RyZWUgcm9vdCksIHBlcnNpc3RzIHRoZSB3b3JrdHJlZVxuXHQgKiBicmFuY2ggLyBwYXRoIC8gcmVwb3NpdG9yeS1yb290IChhbmQgZGlmZiBiYXNlIGJyYW5jaCkgc28gdGhlIGFkb3B0ZWRcblx0ICogc2Vzc2lvbiBncm91cHMgdW5kZXIgaXRzIHJlcG9zaXRvcnkgYW5kIGNvbXB1dGVzIGRpZmZzIGFnYWluc3QgdGhlIHJpZ2h0XG5cdCAqIGJhc2UgXHUyMDE0IHBhcml0eSB3aXRoIG5hdGl2ZWx5IHdvcmt0cmVlLWlzb2xhdGVkIHNlc3Npb25zLiBEZWxpYmVyYXRlbHkgZG9lc1xuXHQgKiBOT1QgcmVnaXN0ZXIgdGhlIHdvcmt0cmVlIGFzIGhvc3QtY3JlYXRlZCwgc28gZGlzcG9zaW5nIHRoZSBzZXNzaW9uIG5ldmVyXG5cdCAqIGRlbGV0ZXMgdGhlIHVzZXItb3duZWQgd29ya3RyZWUuIFJldHVybnMgYHRydWVgIHdoZW4gbWV0YWRhdGEgd2FzIHJlY29yZGVkLlxuXHQgKi9cblx0YXN5bmMgYWRvcHRFeGlzdGluZ1dvcmt0cmVlTWV0YWRhdGEoc2Vzc2lvblVyaTogVVJJLCB3b3JraW5nRGlyZWN0b3J5OiBVUkkpOiBQcm9taXNlPGJvb2xlYW4+IHtcblx0XHRjb25zdCBsaW5rZWRXb3JrdHJlZSA9IGF3YWl0IHRoaXMuX3Jlc29sdmVMaW5rZWRXb3JrdHJlZSh3b3JraW5nRGlyZWN0b3J5KTtcblx0XHRpZiAoIWxpbmtlZFdvcmt0cmVlKSB7XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXHRcdGNvbnN0IHsgd29ya3RyZWVSb290LCBwcmltYXJ5Um9vdCwgYmFzZUJyYW5jaCB9ID0gbGlua2VkV29ya3RyZWU7XG5cdFx0Y29uc3QgYnJhbmNoTmFtZSA9IGF3YWl0IHRoaXMuX2dpdFNlcnZpY2UuZ2V0Q3VycmVudEJyYW5jaCh3b3JrdHJlZVJvb3QpLmNhdGNoKCgpID0+IHVuZGVmaW5lZCkgPz8gJ0hFQUQnO1xuXHRcdGF3YWl0IHRoaXMuX3dyaXRlV29ya3RyZWVNZXRhZGF0YShzZXNzaW9uVXJpLCB7IGJyYW5jaE5hbWUsIGJhc2VCcmFuY2gsIHdvcmt0cmVlUGF0aDogd29ya3RyZWVSb290LCByZXBvc2l0b3J5Um9vdDogcHJpbWFyeVJvb3QgfSk7XG5cdFx0cmV0dXJuIHRydWU7XG5cdH1cblxuXHQvKipcblx0ICogUmVjb3JkcyByZXBvc2l0b3J5IGlkZW50aXR5IGZvciBhbiBleHRlcm5hbGx5LW93bmVkIGxpbmtlZCB3b3JrdHJlZSB3aXRob3V0IHRha2luZyBvd25lcnNoaXAgb2YgaXRzIGxpZmVjeWNsZS5cblx0ICovXG5cdGFzeW5jIHJlY29yZEV4dGVybmFsV29ya3RyZWVQcm9qZWN0KHNlc3Npb25Vcmk6IFVSSSwgd29ya2luZ0RpcmVjdG9yeTogVVJJKTogUHJvbWlzZTxJQWdlbnRTZXNzaW9uUHJvamVjdEluZm8gfCB1bmRlZmluZWQ+IHtcblx0XHRjb25zdCBsaW5rZWRXb3JrdHJlZSA9IGF3YWl0IHRoaXMuX3Jlc29sdmVMaW5rZWRXb3JrdHJlZSh3b3JraW5nRGlyZWN0b3J5KTtcblx0XHRpZiAoIWxpbmtlZFdvcmt0cmVlKSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblx0XHRjb25zdCB7IHByaW1hcnlSb290LCBiYXNlQnJhbmNoIH0gPSBsaW5rZWRXb3JrdHJlZTtcblx0XHRjb25zdCBkYlJlZiA9IHRoaXMuX3Nlc3Npb25EYXRhU2VydmljZS5vcGVuRGF0YWJhc2Uoc2Vzc2lvblVyaSk7XG5cdFx0dHJ5IHtcblx0XHRcdGNvbnN0IHdvcms6IFByb21pc2U8dm9pZD5bXSA9IFtcblx0XHRcdFx0ZGJSZWYub2JqZWN0LnNldE1ldGFkYXRhKFdPUktUUkVFX01FVEFfUkVQT1NJVE9SWV9ST09ULCBwcmltYXJ5Um9vdC50b1N0cmluZygpKSxcblx0XHRcdF07XG5cdFx0XHRpZiAoYmFzZUJyYW5jaCkge1xuXHRcdFx0XHR3b3JrLnB1c2goZGJSZWYub2JqZWN0LnNldE1ldGFkYXRhKE1FVEFfRElGRl9CQVNFX0JSQU5DSCwgYmFzZUJyYW5jaCkpO1xuXHRcdFx0fVxuXHRcdFx0YXdhaXQgUHJvbWlzZS5hbGwod29yayk7XG5cdFx0fSBmaW5hbGx5IHtcblx0XHRcdGRiUmVmLmRpc3Bvc2UoKTtcblx0XHR9XG5cdFx0cmV0dXJuIHByb2plY3RGcm9tUmVwb3NpdG9yeVJvb3QocHJpbWFyeVJvb3QpO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBfcmVzb2x2ZUxpbmtlZFdvcmt0cmVlKHdvcmtpbmdEaXJlY3Rvcnk6IFVSSSk6IFByb21pc2U8eyB3b3JrdHJlZVJvb3Q6IFVSSTsgcHJpbWFyeVJvb3Q6IFVSSTsgYmFzZUJyYW5jaDogc3RyaW5nIHwgdW5kZWZpbmVkIH0gfCB1bmRlZmluZWQ+IHtcblx0XHRjb25zdCB3b3JrdHJlZVJvb3QgPSBhd2FpdCB0aGlzLl9naXRTZXJ2aWNlLmdldFJlcG9zaXRvcnlSb290KHdvcmtpbmdEaXJlY3RvcnkpLmNhdGNoKCgpID0+IHVuZGVmaW5lZCk7XG5cdFx0aWYgKCF3b3JrdHJlZVJvb3QpIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXHRcdGNvbnN0IHByaW1hcnlSb290ID0gYXdhaXQgdHJ5UmVzb2x2ZVByaW1hcnlXb3JrdHJlZVJvb3QodGhpcy5fZ2l0U2VydmljZSwgd29ya3RyZWVSb290KS5jYXRjaCgoKSA9PiB1bmRlZmluZWQpO1xuXHRcdGlmICghcHJpbWFyeVJvb3QgfHwgaXNFcXVhbChwcmltYXJ5Um9vdCwgd29ya3RyZWVSb290KSkge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cdFx0Y29uc3QgYmFzZUJyYW5jaCA9IChhd2FpdCB0aGlzLl9naXRTZXJ2aWNlLmdldERlZmF1bHRCcmFuY2gocHJpbWFyeVJvb3QpLmNhdGNoKCgpID0+IHVuZGVmaW5lZCkpPy5uYW1lO1xuXHRcdHJldHVybiB7IHdvcmt0cmVlUm9vdCwgcHJpbWFyeVJvb3QsIGJhc2VCcmFuY2ggfTtcblx0fVxuXG5cdC8qKlxuXHQgKiBSZXNvbHZlcyB0aGUgcmVwb3NpdG9yeSBcInByb2plY3RcIiBmb3IgYSB3b3JrdHJlZS1pc29sYXRlZCBzZXNzaW9uIGZyb20gaXRzXG5cdCAqIHBlcnNpc3RlZCB3b3JrdHJlZSBtZXRhZGF0YS4gV29ya3RyZWUgc2Vzc2lvbnMgcnVuIG91dCBvZiBhXG5cdCAqIGA8cmVwbz4ud29ya3RyZWVzLzxuYW1lPmAgZGlyZWN0b3J5LCBidXQgaW4gdGhlIHNlc3Npb25zIFVJIHRoZXkgbXVzdCBncm91cFxuXHQgKiB1bmRlciB0aGUgKnJlcG9zaXRvcnkqIChlLmcuIGB2c2NvZGVgKSBcdTIwMTQgbm90IHRoZSB3b3JrdHJlZSBmb2xkZXIgXHUyMDE0IGV4YWN0bHlcblx0ICogbGlrZSBDb3BpbG90LiBSZXR1cm5zIHRoZSByZXBvc2l0b3J5IHJvb3QgYXMgdGhlIHByb2plY3Qgc28gYWdlbnRzIGNhbiBtZXJnZVxuXHQgKiBpdCBpbnRvIHRoZSBgcHJvamVjdGAgZmllbGQgb2YgdGhlIGBJQWdlbnRTZXNzaW9uTWV0YWRhdGFgIHJlcG9ydGVkIGZyb21cblx0ICogYGxpc3RTZXNzaW9uc2AgLyBgZ2V0U2Vzc2lvbk1ldGFkYXRhYDsgd2l0aG91dCBpdCBhIGxpc3QgcmVmcmVzaCBjbGVhcnMgdGhlXG5cdCAqIHRyYW5zaWVudCBwcm9qZWN0IHNldCBieSB0aGUgbWF0ZXJpYWxpemUgZXZlbnQgYW5kIHRoZSB3b3Jrc3BhY2UgcmV2ZXJ0cyB0b1xuXHQgKiB0aGUgd29ya3RyZWUgZGlyZWN0b3J5IG5hbWUuIFJldHVybnMgYHVuZGVmaW5lZGAgZm9yIHNlc3Npb25zIHRoYXQgd2VyZSBuZXZlclxuXHQgKiB3b3JrdHJlZS1pc29sYXRlZCwgbGVhdmluZyB0aGUgY2FsbGVyJ3Mgb3duIGZvbGRlci1iYXNlZCBwcm9qZWN0IHVudG91Y2hlZC5cblx0ICovXG5cdGFzeW5jIHJlc29sdmVXb3JrdHJlZVByb2plY3Qoc2Vzc2lvblVyaTogVVJJKTogUHJvbWlzZTxJQWdlbnRTZXNzaW9uUHJvamVjdEluZm8gfCB1bmRlZmluZWQ+IHtcblx0XHRjb25zdCBtZXRhID0gYXdhaXQgdGhpcy5fcmVhZFdvcmt0cmVlTWV0YWRhdGEoc2Vzc2lvblVyaSkuY2F0Y2goKCkgPT4gdW5kZWZpbmVkKTtcblx0XHRyZXR1cm4gbWV0YT8ucmVwb3NpdG9yeVJvb3QgPyBwcm9qZWN0RnJvbVJlcG9zaXRvcnlSb290KG1ldGEucmVwb3NpdG9yeVJvb3QpIDogdW5kZWZpbmVkO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBfcmVzb2x2ZVByaW1hcnlXb3JrdHJlZVJvb3QoY2hlY2tvdXRSb290OiBVUkksIGZhbGxiYWNrUm9vdDogVVJJKTogUHJvbWlzZTxVUkk+IHtcblx0XHR0cnkge1xuXHRcdFx0cmV0dXJuIGF3YWl0IHRyeVJlc29sdmVQcmltYXJ5V29ya3RyZWVSb290KHRoaXMuX2dpdFNlcnZpY2UsIGNoZWNrb3V0Um9vdCkgPz8gZmFsbGJhY2tSb290O1xuXHRcdH0gY2F0Y2ggKGVycm9yKSB7XG5cdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLndhcm4oYFske3RoaXMuX2xvZ0xhYmVsfV0gRmFpbGVkIHRvIHJlc29sdmUgcHJpbWFyeSB3b3JrdHJlZSBmb3IgJyR7Y2hlY2tvdXRSb290LmZzUGF0aH0nOiAke2Vycm9yTWVzc2FnZShlcnJvcil9YCk7XG5cdFx0XHRyZXR1cm4gZmFsbGJhY2tSb290O1xuXHRcdH1cblx0fVxuXG5cdC8qKlxuXHQgKiBTeW5jaHJvbm91cyBjb21wYW5pb24gdG8ge0BsaW5rIHJlc29sdmVXb3JrdHJlZVByb2plY3R9IGZvciB0aGVcblx0ICogbWF0ZXJpYWxpemUtZXZlbnQgcGF0aDogdGhlIHJlcG9zaXRvcnkgcHJvamVjdCBmb3IgYSB3b3JrdHJlZSB0aGlzIGFnZW50XG5cdCAqIGNyZWF0ZWQgaW4gdGhlIGN1cnJlbnQgcHJvY2Vzcywgb3IgYHVuZGVmaW5lZGAgd2hlbiB0aGUgc2Vzc2lvbiBoYXMgbm9uZS5cblx0ICogTGV0cyBhbiBhZ2VudCBzdXBwbHkgdGhlIG1hdGVyaWFsaXplIGV2ZW50J3MgYHByb2plY3RgIHdpdGhvdXQgYW4gYXN5bmNcblx0ICogbWV0YWRhdGEgcmVhZCBzbyBhIGZyZXNoIHdvcmt0cmVlIGdyb3VwcyB1bmRlciB0aGUgcmVwb3NpdG9yeSB0aGUgbW9tZW50IGl0XG5cdCAqIG1hdGVyaWFsaXplcy5cblx0ICovXG5cdHNlc3Npb25Xb3JrdHJlZVByb2plY3Qoc2Vzc2lvbklkOiBzdHJpbmcpOiBJQWdlbnRTZXNzaW9uUHJvamVjdEluZm8gfCB1bmRlZmluZWQge1xuXHRcdGNvbnN0IHdvcmt0cmVlID0gdGhpcy5fbWF0ZXJpYWxpemVkV29ya3RyZWVzLmdldChzZXNzaW9uSWQpO1xuXHRcdHJldHVybiB3b3JrdHJlZSA/IHByb2plY3RGcm9tUmVwb3NpdG9yeVJvb3Qod29ya3RyZWUucmVwb3NpdG9yeVJvb3QpIDogdW5kZWZpbmVkO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBfZ2V0R2l0SW5mbyh3b3JraW5nRGlyZWN0b3J5OiBVUkkpOiBQcm9taXNlPHsgY3VycmVudEJyYW5jaDogc3RyaW5nOyBkZWZhdWx0QnJhbmNoOiBJRGVmYXVsdEJyYW5jaCB9IHwgdW5kZWZpbmVkPiB7XG5cdFx0Y29uc3QgcmVwb3NpdG9yeVJvb3QgPSBhd2FpdCB0aGlzLl9naXRTZXJ2aWNlLmdldFJlcG9zaXRvcnlSb290KHdvcmtpbmdEaXJlY3RvcnkpO1xuXHRcdGlmICghcmVwb3NpdG9yeVJvb3QpIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXG5cdFx0Ly8gU2tpcCB3b3JrdHJlZSBpc29sYXRpb24gZm9yIGEgcmVwbyB3aXRoIG5vIGNvbW1pdHMgeWV0ICh1bmJvcm4gSEVBRCk7IGBnaXQgd29ya3RyZWUgYWRkYCB3b3VsZCBmYWlsLlxuXHRcdGNvbnN0IGhlYWRDb21taXQgPSBhd2FpdCB0aGlzLl9naXRTZXJ2aWNlLnJldlBhcnNlKHJlcG9zaXRvcnlSb290LCAnSEVBRCcpLmNhdGNoKCgpID0+IHVuZGVmaW5lZCk7XG5cdFx0aWYgKCFoZWFkQ29tbWl0KSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblxuXHRcdGNvbnN0IGN1cnJlbnRCcmFuY2ggPSBhd2FpdCB0aGlzLl9naXRTZXJ2aWNlLmdldEN1cnJlbnRCcmFuY2gocmVwb3NpdG9yeVJvb3QpID8/ICdIRUFEJztcblx0XHRjb25zdCBkZWZhdWx0QnJhbmNoID0gYXdhaXQgdGhpcy5fZ2l0U2VydmljZS5nZXREZWZhdWx0QnJhbmNoKHJlcG9zaXRvcnlSb290KSA/PyB7IG5hbWU6IGN1cnJlbnRCcmFuY2gsIHN0YXJ0UG9pbnQ6IGN1cnJlbnRCcmFuY2ggfTtcblx0XHRyZXR1cm4geyBjdXJyZW50QnJhbmNoLCBkZWZhdWx0QnJhbmNoIH07XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIF9yZXNvbHZlQnJhbmNoU3RhcnRQb2ludChyZXBvc2l0b3J5Um9vdDogVVJJLCBzZWxlY3RlZEJyYW5jaDogc3RyaW5nKTogUHJvbWlzZTxzdHJpbmc+IHtcblx0XHRjb25zdCBkZWZhdWx0QnJhbmNoID0gYXdhaXQgdGhpcy5fZ2l0U2VydmljZS5nZXREZWZhdWx0QnJhbmNoKHJlcG9zaXRvcnlSb290KTtcblx0XHRyZXR1cm4gZGVmYXVsdEJyYW5jaD8ubmFtZSA9PT0gc2VsZWN0ZWRCcmFuY2hcblx0XHRcdD8gZGVmYXVsdEJyYW5jaC5zdGFydFBvaW50XG5cdFx0XHQ6IHNlbGVjdGVkQnJhbmNoO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBfd3JpdGVXb3JrdHJlZU1ldGFkYXRhKHNlc3Npb25Vcmk6IFVSSSwgbWV0YWRhdGE6IHsgYnJhbmNoTmFtZTogc3RyaW5nOyBiYXNlQnJhbmNoOiBzdHJpbmcgfCB1bmRlZmluZWQ7IHdvcmt0cmVlUGF0aDogVVJJOyByZXBvc2l0b3J5Um9vdDogVVJJIH0pOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCBkYlJlZiA9IHRoaXMuX3Nlc3Npb25EYXRhU2VydmljZS5vcGVuRGF0YWJhc2Uoc2Vzc2lvblVyaSk7XG5cdFx0dHJ5IHtcblx0XHRcdGNvbnN0IHdvcms6IFByb21pc2U8dm9pZD5bXSA9IFtcblx0XHRcdFx0ZGJSZWYub2JqZWN0LnNldE1ldGFkYXRhKFdPUktUUkVFX01FVEFfQlJBTkNILCBtZXRhZGF0YS5icmFuY2hOYW1lKSxcblx0XHRcdFx0ZGJSZWYub2JqZWN0LnNldE1ldGFkYXRhKFdPUktUUkVFX01FVEFfUEFUSCwgbWV0YWRhdGEud29ya3RyZWVQYXRoLnRvU3RyaW5nKCkpLFxuXHRcdFx0XHRkYlJlZi5vYmplY3Quc2V0TWV0YWRhdGEoV09SS1RSRUVfTUVUQV9SRVBPU0lUT1JZX1JPT1QsIG1ldGFkYXRhLnJlcG9zaXRvcnlSb290LnRvU3RyaW5nKCkpLFxuXHRcdFx0XTtcblx0XHRcdGlmIChtZXRhZGF0YS5iYXNlQnJhbmNoKSB7XG5cdFx0XHRcdHdvcmsucHVzaChkYlJlZi5vYmplY3Quc2V0TWV0YWRhdGEoTUVUQV9ESUZGX0JBU0VfQlJBTkNILCBtZXRhZGF0YS5iYXNlQnJhbmNoKSk7XG5cdFx0XHR9XG5cdFx0XHRhd2FpdCBQcm9taXNlLmFsbCh3b3JrKTtcblx0XHR9IGZpbmFsbHkge1xuXHRcdFx0ZGJSZWYuZGlzcG9zZSgpO1xuXHRcdH1cblx0fVxuXG5cdC8qKlxuXHQgKiBSZWFkcyBwZXJzaXN0ZWQgd29ya3RyZWUgbWV0YWRhdGEsIGNhbm9uaWNhbGl6aW5nLCByZXBhaXJpbmcsIGFuZCBwZXJzaXN0aW5nIHRoZSByZXBvc2l0b3J5IHJvb3Qgd2hlbiBuZWVkZWQuXG5cdCAqIEl0IHByb2JlcyBhbiBleGlzdGluZyB3b3JrdHJlZSB3aGVuIGF2YWlsYWJsZSBhbmQgb3RoZXJ3aXNlIGZhbGxzIGJhY2sgdG8gdGhlIHBlcnNpc3RlZCByb290IGZvciBhcmNoaXZlZCBzZXNzaW9ucy5cblx0ICogVGhlIHJlcGFpciBpcyBvbmx5IHJlYWNoYWJsZSB3aGVuIHtAbGluayBXT1JLVFJFRV9NRVRBX0JSQU5DSH0gaXMgcHJlc2VudCwgc28gYSByb290XG5cdCAqIHBlcnNpc3RlZCB3aXRob3V0IGl0cyBicmFuY2ggd2lsbCBuZXZlciBoZWFsLlxuXHQgKi9cblx0cHJpdmF0ZSBhc3luYyBfcmVhZFdvcmt0cmVlTWV0YWRhdGEoc2Vzc2lvblVyaTogVVJJKTogUHJvbWlzZTxJV29ya3RyZWVNZXRhZGF0YSB8IHVuZGVmaW5lZD4ge1xuXHRcdGNvbnN0IHJlZiA9IGF3YWl0IHRoaXMuX3Nlc3Npb25EYXRhU2VydmljZS50cnlPcGVuRGF0YWJhc2Uoc2Vzc2lvblVyaSk7XG5cdFx0aWYgKCFyZWYpIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXG5cdFx0dHJ5IHtcblx0XHRcdGNvbnN0IFticmFuY2hOYW1lLCB3b3JrdHJlZVBhdGhSYXcsIHJlcG9zaXRvcnlSb290UmF3XSA9IGF3YWl0IFByb21pc2UuYWxsKFtcblx0XHRcdFx0cmVmLm9iamVjdC5nZXRNZXRhZGF0YShXT1JLVFJFRV9NRVRBX0JSQU5DSCksXG5cdFx0XHRcdHJlZi5vYmplY3QuZ2V0TWV0YWRhdGEoV09SS1RSRUVfTUVUQV9QQVRIKSxcblx0XHRcdFx0cmVmLm9iamVjdC5nZXRNZXRhZGF0YShXT1JLVFJFRV9NRVRBX1JFUE9TSVRPUllfUk9PVCksXG5cdFx0XHRdKTtcblx0XHRcdGlmICghYnJhbmNoTmFtZSkge1xuXHRcdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdFx0fVxuXHRcdFx0Y29uc3Qgd29ya3RyZWVQYXRoID0gd29ya3RyZWVQYXRoUmF3ID8gVVJJLnBhcnNlKHdvcmt0cmVlUGF0aFJhdykgOiB1bmRlZmluZWQ7XG5cdFx0XHRsZXQgcmVwb3NpdG9yeVJvb3QgPSByZXBvc2l0b3J5Um9vdFJhdyA/IFVSSS5wYXJzZShyZXBvc2l0b3J5Um9vdFJhdykgOiB1bmRlZmluZWQ7XG5cdFx0XHRpZiAocmVwb3NpdG9yeVJvb3QpIHtcblx0XHRcdFx0Y29uc3QgY2hlY2tvdXRSb290ID0gd29ya3RyZWVQYXRoICYmIGF3YWl0IGZpbGVFeGlzdHMod29ya3RyZWVQYXRoLmZzUGF0aCkgPyB3b3JrdHJlZVBhdGggOiByZXBvc2l0b3J5Um9vdDtcblx0XHRcdFx0Y29uc3QgcHJpbWFyeVJvb3QgPSBhd2FpdCB0aGlzLl9yZXNvbHZlUHJpbWFyeVdvcmt0cmVlUm9vdChjaGVja291dFJvb3QsIHJlcG9zaXRvcnlSb290KTtcblx0XHRcdFx0aWYgKHByaW1hcnlSb290LnRvU3RyaW5nKCkgIT09IHJlcG9zaXRvcnlSb290LnRvU3RyaW5nKCkpIHtcblx0XHRcdFx0XHRyZXBvc2l0b3J5Um9vdCA9IHByaW1hcnlSb290O1xuXHRcdFx0XHRcdHRyeSB7XG5cdFx0XHRcdFx0XHRhd2FpdCByZWYub2JqZWN0LnNldE1ldGFkYXRhKFdPUktUUkVFX01FVEFfUkVQT1NJVE9SWV9ST09ULCBwcmltYXJ5Um9vdC50b1N0cmluZygpKTtcblx0XHRcdFx0XHR9IGNhdGNoIChlcnJvcikge1xuXHRcdFx0XHRcdFx0dGhpcy5fbG9nU2VydmljZS53YXJuKGBbJHt0aGlzLl9sb2dMYWJlbH1dIEZhaWxlZCB0byBub3JtYWxpemUgd29ya3RyZWUgcmVwb3NpdG9yeSBtZXRhZGF0YSBmb3IgJyR7c2Vzc2lvblVyaS50b1N0cmluZygpfSc6ICR7ZXJyb3JNZXNzYWdlKGVycm9yKX1gKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHRcdHJldHVybiB7IGJyYW5jaE5hbWUsIHdvcmt0cmVlUGF0aCwgcmVwb3NpdG9yeVJvb3QgfTtcblx0XHR9IGZpbmFsbHkge1xuXHRcdFx0cmVmLmRpc3Bvc2UoKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIF9yZWFkV29ya3RyZWVOb3RpY2Uoc2Vzc2lvblVyaTogVVJJKTogUHJvbWlzZTx7IGtpbmQ6ICdzdWNjZXNzJzsgYnJhbmNoTmFtZTogc3RyaW5nIH0gfCB7IGtpbmQ6ICdmYWlsdXJlJzsgZGlhZ25vc3RpYz86IHN0cmluZyB9IHwgdW5kZWZpbmVkPiB7XG5cdFx0Y29uc3QgcmVmID0gYXdhaXQgdGhpcy5fc2Vzc2lvbkRhdGFTZXJ2aWNlLnRyeU9wZW5EYXRhYmFzZShzZXNzaW9uVXJpKTtcblx0XHRpZiAoIXJlZikge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cdFx0dHJ5IHtcblx0XHRcdGNvbnN0IFticmFuY2hOYW1lLCBmYWlsdXJlUmF3XSA9IGF3YWl0IFByb21pc2UuYWxsKFtcblx0XHRcdFx0cmVmLm9iamVjdC5nZXRNZXRhZGF0YShXT1JLVFJFRV9NRVRBX0JSQU5DSCksXG5cdFx0XHRcdHJlZi5vYmplY3QuZ2V0TWV0YWRhdGEoV09SS1RSRUVfTUVUQV9DUkVBVElPTl9GQUlMVVJFKSxcblx0XHRcdF0pO1xuXHRcdFx0aWYgKGJyYW5jaE5hbWUpIHtcblx0XHRcdFx0cmV0dXJuIHsga2luZDogJ3N1Y2Nlc3MnLCBicmFuY2hOYW1lIH07XG5cdFx0XHR9XG5cdFx0XHRpZiAoIWZhaWx1cmVSYXcpIHtcblx0XHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHRcdH1cblx0XHRcdGNvbnN0IGZhaWx1cmUgPSBKU09OLnBhcnNlKGZhaWx1cmVSYXcpO1xuXHRcdFx0aWYgKCFmYWlsdXJlIHx8IHR5cGVvZiBmYWlsdXJlICE9PSAnb2JqZWN0JyB8fCBBcnJheS5pc0FycmF5KGZhaWx1cmUpKSB7XG5cdFx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0XHR9XG5cdFx0XHRjb25zdCByYXcgPSBmYWlsdXJlIGFzIFJlY29yZDxzdHJpbmcsIHVua25vd24+O1xuXHRcdFx0aWYgKHJhd1snc2Vzc2lvbklkJ10gIT09IEFnZW50U2Vzc2lvbi5pZChzZXNzaW9uVXJpKSkge1xuXHRcdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdFx0fVxuXHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0a2luZDogJ2ZhaWx1cmUnLFxuXHRcdFx0XHRkaWFnbm9zdGljOiB0eXBlb2YgcmF3WydkaWFnbm9zdGljJ10gPT09ICdzdHJpbmcnID8gbm9ybWFsaXplV29ya3RyZWVGYWlsdXJlRGlhZ25vc3RpYyhyYXdbJ2RpYWdub3N0aWMnXSkgOiB1bmRlZmluZWQsXG5cdFx0XHR9O1xuXHRcdH0gZmluYWxseSB7XG5cdFx0XHRyZWYuZGlzcG9zZSgpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgX2lzU2Vzc2lvbkFyY2hpdmVkKHNlc3Npb25Vcmk6IFVSSSk6IFByb21pc2U8Ym9vbGVhbj4ge1xuXHRcdGNvbnN0IHJlZiA9IGF3YWl0IHRoaXMuX3Nlc3Npb25EYXRhU2VydmljZS50cnlPcGVuRGF0YWJhc2Uoc2Vzc2lvblVyaSk7XG5cdFx0aWYgKCFyZWYpIHtcblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cdFx0dHJ5IHtcblx0XHRcdGNvbnN0IFtpc0FyY2hpdmVkLCBpc0RvbmVdID0gYXdhaXQgUHJvbWlzZS5hbGwoW1xuXHRcdFx0XHRyZWYub2JqZWN0LmdldE1ldGFkYXRhKEFIX01FVEFfSVNfQVJDSElWRURfREJfS0VZKSxcblx0XHRcdFx0cmVmLm9iamVjdC5nZXRNZXRhZGF0YShBSF9NRVRBX0lTX0RPTkVfREJfS0VZKSxcblx0XHRcdF0pO1xuXHRcdFx0cmV0dXJuIGlzQXJjaGl2ZWQgIT09IHVuZGVmaW5lZCA/IGlzQXJjaGl2ZWQgPT09ICd0cnVlJyA6IGlzRG9uZSA9PT0gJ3RydWUnO1xuXHRcdH0gZmluYWxseSB7XG5cdFx0XHRyZWYuZGlzcG9zZSgpO1xuXHRcdH1cblx0fVxufVxuXG4vKipcbiAqIERlcml2ZXMgdGhlIHJlcG9zaXRvcnkge0BsaW5rIElBZ2VudFNlc3Npb25Qcm9qZWN0SW5mb30gZnJvbSBhIHJlcG9zaXRvcnlcbiAqIHJvb3QgVVJJLiBUaGUgZGlzcGxheSBuYW1lIGlzIHRoZSByZXBvIGRpcmVjdG9yeSdzIGJhc2VuYW1lIChmYWxsaW5nIGJhY2sgdG9cbiAqIHRoZSBVUkkgc3RyaW5nIGZvciBwYXRob2xvZ2ljYWwgcm9vdHMpLCBtYXRjaGluZyBob3cgQ29waWxvdCBuYW1lcyB0aGVcbiAqIHByb2plY3QgdmlhIGByZXNvbHZlR2l0UHJvamVjdGAuXG4gKi9cbmZ1bmN0aW9uIHByb2plY3RGcm9tUmVwb3NpdG9yeVJvb3QocmVwb3NpdG9yeVJvb3Q6IFVSSSk6IElBZ2VudFNlc3Npb25Qcm9qZWN0SW5mbyB7XG5cdHJldHVybiB7IHVyaTogcmVwb3NpdG9yeVJvb3QsIGRpc3BsYXlOYW1lOiBiYXNlbmFtZShyZXBvc2l0b3J5Um9vdC5mc1BhdGgpIHx8IHJlcG9zaXRvcnlSb290LnRvU3RyaW5nKCkgfTtcbn1cblxuLyoqXG4gKiBCdWlsZHMgdGhlIHJlcG9zaXRvcnkge0BsaW5rIElBZ2VudFNlc3Npb25Qcm9qZWN0SW5mb30gZnJvbSBhIHBlcnNpc3RlZFxuICoge0BsaW5rIFdPUktUUkVFX01FVEFfUkVQT1NJVE9SWV9ST09UfSB2YWx1ZSAoYSBVUkkgc3RyaW5nKSwgb3IgYHVuZGVmaW5lZGBcbiAqIHdoZW4gYWJzZW50LiBMZXRzIHRoZSBob3N0IG1lcmdlIHRoZSByZXBvc2l0b3J5IHByb2plY3QgaW50byBhIHNlc3Npb24nc1xuICogY2F0YWxvZyBlbnRyeSBkaXJlY3RseSBmcm9tIGEgbWV0YWRhdGEgYmF0Y2ggaXQgYWxyZWFkeSByZWFkLCB3aXRob3V0IGFcbiAqIHNlY29uZCBkYXRhYmFzZSBvcGVuLlxuICovXG5leHBvcnQgZnVuY3Rpb24gd29ya3RyZWVQcm9qZWN0RnJvbVJlcG9zaXRvcnlSb290KHJlcG9zaXRvcnlSb290UmF3OiBzdHJpbmcgfCB1bmRlZmluZWQpOiBJQWdlbnRTZXNzaW9uUHJvamVjdEluZm8gfCB1bmRlZmluZWQge1xuXHRyZXR1cm4gcmVwb3NpdG9yeVJvb3RSYXcgPyBwcm9qZWN0RnJvbVJlcG9zaXRvcnlSb290KFVSSS5wYXJzZShyZXBvc2l0b3J5Um9vdFJhdykpIDogdW5kZWZpbmVkO1xufVxuXG5mdW5jdGlvbiBlcnJvck1lc3NhZ2UoZXJyb3I6IHVua25vd24pOiBzdHJpbmcge1xuXHRyZXR1cm4gZXJyb3IgaW5zdGFuY2VvZiBFcnJvciA/IGVycm9yLm1lc3NhZ2UgOiBTdHJpbmcoZXJyb3IpO1xufVxuXG5hc3luYyBmdW5jdGlvbiBmaWxlRXhpc3RzKHBhdGg6IHN0cmluZyk6IFByb21pc2U8Ym9vbGVhbj4ge1xuXHR0cnkge1xuXHRcdGF3YWl0IGZzLmFjY2VzcyhwYXRoKTtcblx0XHRyZXR1cm4gdHJ1ZTtcblx0fSBjYXRjaCB7XG5cdFx0cmV0dXJuIGZhbHNlO1xuXHR9XG59XG4iXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7OztB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UUFDakQsSUFBSSxPQUFPLFlBQVksc0JBQXNCO0FBQUEsTUFDOUMsQ0FBQztBQUNELGFBQU8sZUFBZSxTQUFZLGVBQWUsU0FBUyxXQUFXO0FBQUEsSUFDdEUsVUFBRTtBQUNELFVBQUksUUFBUTtBQUFBLElBQ2I7QUFBQSxFQUNEO0FBQ0Q7QUFseEJhLG9CQUFOO0FBQUEsRUErQ0o7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxHQWxEVTtBQTB4QmIsU0FBUywwQkFBMEIsZ0JBQStDO0FBQ2pGLFNBQU8sRUFBRSxLQUFLLGdCQUFnQixhQUFhLFNBQVMsZUFBZSxNQUFNLEtBQUssZUFBZSxTQUFTLEVBQUU7QUFDekc7QUFTTyxTQUFTLGtDQUFrQyxtQkFBNkU7QUFDOUgsU0FBTyxvQkFBb0IsMEJBQTBCLElBQUksTUFBTSxpQkFBaUIsQ0FBQyxJQUFJO0FBQ3RGO0FBRUEsU0FBUyxhQUFhLE9BQXdCO0FBQzdDLFNBQU8saUJBQWlCLFFBQVEsTUFBTSxVQUFVLE9BQU8sS0FBSztBQUM3RDtBQUVBLGVBQWUsV0FBVyxNQUFnQztBQUN6RCxNQUFJO0FBQ0gsVUFBTSxHQUFHLE9BQU8sSUFBSTtBQUNwQixXQUFPO0FBQUEsRUFDUixRQUFRO0FBQ1AsV0FBTztBQUFBLEVBQ1I7QUFDRDsiLAogICJuYW1lcyI6IFsiV29ya3RyZWVDcmVhdGlvblBoYXNlIiwgImJyYW5jaE5hbWUiLCAid29ya3RyZWUiLCAiYmFzZUJyYW5jaCJdCn0K
