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
import { equals as objectEquals } from "../../../base/common/objects.js";
import { isEqual } from "../../../base/common/resources.js";
import { URI } from "../../../base/common/uri.js";
import { Emitter } from "../../../base/common/event.js";
import { ILogService } from "../../log/common/log.js";
import { META_GIT_STATE, META_GITHUB_STATE, META_SOURCE_CONTROL_STATE } from "../common/agentHostGitStateService.js";
import { getSessionRelatedPullRequestUrls, readSessionGitHubState, readSessionGitState, readSessionSourceControlState, SessionLifecycle, SessionSourceControlOutcome, withInitialSessionPullRequest, withMostRecentReferencedSessionPullRequest, withMostRecentSessionPullRequest, withSessionGitHubState, withSessionGitState, withSessionSourceControlState } from "../common/state/sessionState.js";
import { MAX_SESSION_ISSUE_REFERENCES, parseGitHubIssueReferences, toGitHubIssueUrl } from "../common/githubIssueReferences.js";
import { parseGitHubPullRequestReferences, toGitHubPullRequestUrl } from "../common/githubPullRequestReferences.js";
import { IAgentHostGitService, META_DIFF_BASE_BRANCH, parseUpstreamBranchName, resolveDiffBaseBranchName } from "../common/agentHostGitService.js";
import { IAgentHostStateManager } from "./agentHostStateManager.js";
import { ISessionDataService } from "../common/sessionDataService.js";
import { IAgentHostOctoKitService } from "./shared/agentHostOctoKitService.js";
import { IAgentService } from "../common/agentService.js";
import { IAgentHostGitHubEndpointService } from "./agentHostGitHubEndpointService.js";
import { Disposable, toDisposable } from "../../../base/common/lifecycle.js";
import { CancellationTokenSource } from "../../../base/common/cancellation.js";
import { ThrottlerByKey, SequencerByKey, timeout } from "../../../base/common/async.js";
import { isCancellationError } from "../../../base/common/errors.js";
import { SessionConfigKey } from "../common/sessionConfigKeys.js";
const PULL_REQUEST_CREATION_CLOCK_SKEW_MS = 5 * 6e4;
let AgentHostGitStateService = class extends Disposable {
  constructor(_stateManager, _gitService, _octoKitService, _agentService, _gitHubEndpointService, _logService, _sessionDataService) {
    super();
    this._stateManager = _stateManager;
    this._gitService = _gitService;
    this._octoKitService = _octoKitService;
    this._agentService = _agentService;
    this._gitHubEndpointService = _gitHubEndpointService;
    this._logService = _logService;
    this._sessionDataService = _sessionDataService;
    this._onDidRefreshSessionGitState = this._register(new Emitter());
    this.onDidRefreshSessionGitState = this._onDidRefreshSessionGitState.event;
    this._onDidChangeSessionGitHubState = this._register(new Emitter());
    this.onDidChangeSessionGitHubState = this._onDidChangeSessionGitHubState.event;
    this._gitStateRefreshThrottler = this._register(new ThrottlerByKey());
    this._gitStateRefreshCancellationTokenSource = new CancellationTokenSource();
    /**
     * Serializes pull request lookups per session so overlapping triggers (turn
     * completion, session restore, a refresh observing a branch change) issue at
     * most one GitHub request at a time and observe each other's writes.
     */
    this._pullRequestSequencer = new SequencerByKey();
    this._pullRequestAbortController = new AbortController();
    this._register(toDisposable(() => this._gitStateRefreshCancellationTokenSource.dispose(true)));
    this._register(toDisposable(() => this._pullRequestAbortController.abort()));
  }
  async attachSessionGitHubPullRequest(sessionKey, workingDirectory) {
    await this.refreshSessionGitState(sessionKey, workingDirectory);
    await this._queuePullRequestLookup(sessionKey);
  }
  /**
   * Queues a pull request lookup on the session's sequencer so overlapping
   * triggers (turn completion, session restore, a refresh observing a branch
   * change) issue at most one GitHub request at a time.
   */
  _queuePullRequestLookup(sessionKey) {
    return this._pullRequestSequencer.queue(sessionKey, () => this._attachSessionGitHubPullRequest(sessionKey));
  }
  async _attachSessionGitHubPullRequest(sessionKey) {
    const state = this._stateManager.getSessionState(sessionKey);
    if (!state) {
      return;
    }
    if (state.lifecycle !== SessionLifecycle.Ready) {
      return;
    }
    const gitHubState = readSessionGitHubState(this._stateManager.getSessionState(sessionKey)?._meta);
    if (!gitHubState?.owner || !gitHubState?.repo) {
      return;
    }
    const gitState = readSessionGitState(state._meta);
    const branchName = gitState?.branchName;
    if (!branchName || branchName === gitState?.baseBranchName) {
      return;
    }
    if (gitHubState.pullRequestBranchName === branchName) {
      return;
    }
    try {
      const repoResource = this._gitHubEndpointService.getRepoResource();
      const authToken = this._agentService.getAuthToken({
        resource: repoResource.resource,
        scopes: repoResource.scopes_supported
      });
      if (!authToken) {
        return;
      }
      const pr = await this._findPullRequestForCheckout(state, gitHubState.owner, gitHubState.repo, gitState, branchName, authToken);
      const currentBranchName = readSessionGitState(this._stateManager.getSessionState(sessionKey)?._meta)?.branchName;
      if (currentBranchName !== branchName) {
        return;
      }
      const currentState = this._stateManager.getSessionState(sessionKey);
      if (!currentState) {
        return;
      }
      const currentGitHubState = readSessionGitHubState(currentState._meta);
      if (!pr?.url) {
        if (this._isFolderSession(currentState, currentGitHubState) && currentGitHubState?.initialPullRequestUrls === void 0) {
          await this.setSessionGitHubState(sessionKey, withInitialSessionPullRequest(currentGitHubState));
        }
        this._logService.trace(`[AgentHostGitStateService][attachSessionGitHubPullRequest] No pull request found for ${sessionKey} on branch ${branchName}`);
        return;
      }
      let nextGitHubState = withMostRecentSessionPullRequest(currentGitHubState, pr.url, branchName);
      if (this._shouldAddToFolderBaseline(sessionKey, currentState, currentGitHubState, pr)) {
        nextGitHubState = {
          ...nextGitHubState,
          ...withInitialSessionPullRequest(currentGitHubState, pr.url)
        };
      } else if (this._isFolderSession(currentState, currentGitHubState) && currentGitHubState?.initialPullRequestUrls === void 0) {
        nextGitHubState = {
          ...nextGitHubState,
          ...withInitialSessionPullRequest(currentGitHubState)
        };
      }
      await this.setSessionGitHubState(sessionKey, nextGitHubState);
    } catch (error) {
      this._logService.warn(`[AgentHostGitStateService][attachSessionGitHubPullRequest] Failed to find pull request for ${sessionKey}`, error);
    }
  }
  _shouldAddToFolderBaseline(sessionKey, state, gitHubState, pullRequest) {
    if (!this._isFolderSession(state, gitHubState) || getSessionRelatedPullRequestUrls(gitHubState).some((url) => url.toLowerCase() === pullRequest.url.toLowerCase())) {
      return false;
    }
    if (pullRequest.createdAt !== void 0) {
      const sessionStart = Date.parse(this._stateManager.getSessionSummary(sessionKey)?.createdAt ?? "");
      return Number.isNaN(sessionStart) || pullRequest.createdAt < sessionStart - PULL_REQUEST_CREATION_CLOCK_SKEW_MS;
    }
    return gitHubState?.initialPullRequestUrls === void 0;
  }
  _isFolderSession(state, gitHubState) {
    return state.config?.values[SessionConfigKey.Isolation] === "folder" || gitHubState?.initialPullRequestUrls !== void 0;
  }
  /**
   * Resolves the pull request of the branch that is currently checked out,
   * preferring the remote head branch and falling back to the commit at HEAD
   * for local branches whose name never reached the remote.
   */
  async _findPullRequestForCheckout(state, owner, repo, gitState, branchName, authToken) {
    const signal = this._pullRequestAbortController.signal;
    const githubHeadOwner = gitState?.githubHeadOwner;
    const upstreamBranch = githubHeadOwner ? parseUpstreamBranchName(gitState?.upstreamBranchName) : void 0;
    const headBranch = upstreamBranch?.branch ?? branchName;
    const headOwner = githubHeadOwner ?? owner;
    const pullRequestByBranch = await this._octoKitService.findPullRequestByHeadBranch(owner, repo, headBranch, authToken, signal, headOwner);
    if (pullRequestByBranch) {
      return pullRequestByBranch;
    }
    const workingDirectory = state.workingDirectories?.[0];
    if (!workingDirectory) {
      return void 0;
    }
    const headSha = await this._gitService.revParse(URI.parse(workingDirectory), "HEAD");
    return headSha ? this._octoKitService.findPullRequestByHeadSha(owner, repo, headSha, authToken, signal) : void 0;
  }
  async attachSessionGitHubReferences(sessionKey, text) {
    const currentState = readSessionGitHubState(this._stateManager.getSessionState(sessionKey)?._meta);
    const issueReferences = parseGitHubIssueReferences(text);
    const repository = currentState?.owner && currentState.repo ? { owner: currentState.owner, repo: currentState.repo } : void 0;
    const gitHubHost = this._gitHubEndpointService.getEnterpriseHost() ?? "github.com";
    const pullRequestReferences = parseGitHubPullRequestReferences(text, repository, gitHubHost).filter((reference) => !repository || reference.owner.toLowerCase() === repository.owner.toLowerCase() && reference.repo.toLowerCase() === repository.repo.toLowerCase());
    if (issueReferences.length === 0 && pullRequestReferences.length === 0) {
      return;
    }
    const currentIssueUrls = currentState?.issueUrls ?? [];
    const nextIssueUrls = [...currentIssueUrls];
    for (const reference of issueReferences) {
      const url = toGitHubIssueUrl(reference);
      if (!nextIssueUrls.includes(url)) {
        nextIssueUrls.push(url);
      }
    }
    let nextState = issueReferences.length > 0 ? { issueUrls: nextIssueUrls.slice(0, MAX_SESSION_ISSUE_REFERENCES) } : {};
    for (let index = pullRequestReferences.length - 1; index >= 0; index--) {
      const reference = pullRequestReferences[index];
      const url = toGitHubPullRequestUrl(reference, gitHubHost);
      nextState = {
        ...nextState,
        ...withMostRecentReferencedSessionPullRequest({ ...currentState, ...nextState }, url)
      };
    }
    await this.setSessionGitHubState(sessionKey, nextState);
  }
  async refreshSessionGitState(sessionKey, workingDirectory) {
    const sessionState = this._stateManager.getSessionState(sessionKey);
    if (sessionState?.lifecycle === SessionLifecycle.CreationFailed) {
      return;
    }
    if (!workingDirectory) {
      const workingDirectoryStr = sessionState?.workingDirectories?.[0];
      if (workingDirectoryStr) {
        workingDirectory = URI.parse(workingDirectoryStr);
      }
    }
    if (!workingDirectory) {
      return;
    }
    await this._gitStateRefreshThrottler.queue(sessionKey, async () => {
      try {
        this._logService.trace(`[AgentHostGitStateService][refreshSessionGitState] Refreshing git state for ${sessionKey}, ${workingDirectory?.fsPath}`);
        const baseBranchName = await this.resolveSessionBaseBranchName(sessionKey);
        const gitState = await this._gitService.getSessionGitState(workingDirectory, baseBranchName);
        if (gitState) {
          const currentMeta = this._stateManager.getSessionState(sessionKey)?._meta;
          const previousGitState = readSessionGitState(currentMeta);
          const gitStateChanged = !objectEquals(previousGitState, gitState);
          if (gitStateChanged) {
            await this._setSessionGitState(sessionKey, gitState);
          }
          if (gitState.githubOwner && gitState.githubRepo) {
            const currentGitHubState = readSessionGitHubState(currentMeta);
            if (currentGitHubState?.owner !== gitState.githubOwner || currentGitHubState.repo !== gitState.githubRepo) {
              await this.setSessionGitHubState(sessionKey, {
                owner: gitState.githubOwner,
                repo: gitState.githubRepo
              });
            }
            if (gitStateChanged && previousGitState?.branchName !== gitState.branchName) {
              await this._queuePullRequestLookup(sessionKey);
            }
          }
        }
        this._onDidRefreshSessionGitState.fire(sessionKey);
        await timeout(5e3, this._gitStateRefreshCancellationTokenSource.token);
      } catch (error) {
        if (isCancellationError(error)) {
          return;
        }
        this._logService.warn(`[AgentHostGitStateService][refreshSessionGitState] Failed to compute git state for ${sessionKey}:`, error);
      }
    });
  }
  async setSessionGitHubState(sessionKey, state) {
    const currentMeta = this._stateManager.getSessionState(sessionKey)?._meta;
    const currentState = readSessionGitHubState(currentMeta);
    const nextState = { ...currentState ?? {}, ...state };
    const currentPullRequest = getSessionRelatedPullRequestUrls(currentState)[0];
    const nextPullRequest = getSessionRelatedPullRequestUrls(nextState)[0];
    const currentSourceControlState = readSessionSourceControlState(currentMeta);
    const nextSourceControlState = nextPullRequest && nextPullRequest !== currentPullRequest ? { ...currentSourceControlState, latestOutcome: SessionSourceControlOutcome.PullRequest } : currentSourceControlState;
    const sourceControlStateChanged = !objectEquals(currentSourceControlState, nextSourceControlState);
    if (objectEquals(currentState, nextState) && !sourceControlStateChanged) {
      await this._saveSessionState(sessionKey, META_GITHUB_STATE, JSON.stringify(nextState));
      return;
    }
    const nextMeta = withSessionSourceControlState(withSessionGitHubState(currentMeta, nextState), nextSourceControlState);
    this._stateManager.setSessionMeta(sessionKey, nextMeta);
    this._onDidChangeSessionGitHubState.fire(sessionKey);
    await this._saveSessionState(sessionKey, META_GITHUB_STATE, JSON.stringify(nextState));
    if (sourceControlStateChanged && nextSourceControlState) {
      await this._saveSessionState(sessionKey, META_SOURCE_CONTROL_STATE, JSON.stringify(nextSourceControlState));
    }
  }
  async resolveSessionBaseBranchName(sessionKey) {
    const state = this._stateManager.getSessionState(sessionKey);
    const configuredBranch = state?.config?.values[SessionConfigKey.Isolation] === "worktree" ? state.config.values[SessionConfigKey.Branch] : void 0;
    if (typeof configuredBranch === "string" && configuredBranch.trim()) {
      return resolveDiffBaseBranchName(configuredBranch.trim(), void 0);
    }
    const gitStateBaseBranch = readSessionGitState(state?._meta)?.baseBranchName;
    const workingDirectory = state?.workingDirectories?.[0];
    const project = state?.project?.uri;
    if (!workingDirectory || !project || isEqual(URI.parse(workingDirectory), URI.parse(project))) {
      return gitStateBaseBranch;
    }
    let databaseRef;
    try {
      databaseRef = await this._sessionDataService.tryOpenDatabase(URI.parse(sessionKey));
    } catch (error) {
      this._logService.warn(`[AgentHostGitStateService] Failed to open session database while resolving the base branch for ${sessionKey}`, error);
      return gitStateBaseBranch;
    }
    if (!databaseRef) {
      return gitStateBaseBranch;
    }
    try {
      return resolveDiffBaseBranchName(await databaseRef.object.getMetadata(META_DIFF_BASE_BRANCH), gitStateBaseBranch);
    } catch (error) {
      this._logService.warn(`[AgentHostGitStateService] Failed to read the persisted base branch for ${sessionKey}`, error);
      return gitStateBaseBranch;
    } finally {
      databaseRef.dispose();
    }
  }
  async recordSessionMerge(sessionKey, commit) {
    const currentMeta = this._stateManager.getSessionState(sessionKey)?._meta;
    const currentState = readSessionSourceControlState(currentMeta);
    const nextState = {
      ...currentState,
      merge: { commit },
      latestOutcome: SessionSourceControlOutcome.Merge
    };
    if (objectEquals(currentState, nextState)) {
      await this._saveSessionState(sessionKey, META_SOURCE_CONTROL_STATE, JSON.stringify(nextState));
      return;
    }
    this._stateManager.setSessionMeta(sessionKey, withSessionSourceControlState(currentMeta, nextState));
    await this._saveSessionState(sessionKey, META_SOURCE_CONTROL_STATE, JSON.stringify(nextState));
  }
  async _setSessionGitState(sessionKey, gitState) {
    const currentMeta = this._stateManager.getSessionState(sessionKey)?._meta;
    const nextMeta = withSessionGitState(currentMeta, gitState);
    this._stateManager.setSessionMeta(sessionKey, nextMeta);
    await this._saveSessionState(sessionKey, META_GIT_STATE, JSON.stringify(gitState));
  }
  async _saveSessionState(sessionKey, key, value) {
    const state = this._stateManager.getSessionState(sessionKey);
    if (state?.lifecycle === SessionLifecycle.Creating) {
      return;
    }
    let databaseRef;
    try {
      databaseRef = this._sessionDataService.openDatabase(URI.parse(sessionKey));
    } catch (error) {
      this._logService.warn(`[AgentHostGitStateService][_saveSessionState] Failed to open session database for ${sessionKey}`, error);
      return;
    }
    try {
      await databaseRef.object.setMetadata(key, value);
    } catch (error) {
      this._logService.warn(`[AgentHostGitStateService][_saveSessionState] Failed to persist ${key}`, error);
    } finally {
      databaseRef.dispose();
    }
  }
};
AgentHostGitStateService = __decorateClass([
  __decorateParam(0, IAgentHostStateManager),
  __decorateParam(1, IAgentHostGitService),
  __decorateParam(2, IAgentHostOctoKitService),
  __decorateParam(3, IAgentService),
  __decorateParam(4, IAgentHostGitHubEndpointService),
  __decorateParam(5, ILogService),
  __decorateParam(6, ISessionDataService)
], AgentHostGitStateService);
export {
  AgentHostGitStateService
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxwbGF0Zm9ybVxcYWdlbnRIb3N0XFxub2RlXFxhZ2VudEhvc3RHaXRTdGF0ZVNlcnZpY2UudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgeyBlcXVhbHMgYXMgb2JqZWN0RXF1YWxzIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vb2JqZWN0cy5qcyc7XG5pbXBvcnQgeyBpc0VxdWFsIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vcmVzb3VyY2VzLmpzJztcbmltcG9ydCB7IFVSSSB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL3VyaS5qcyc7XG5pbXBvcnQgeyBFbWl0dGVyIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vZXZlbnQuanMnO1xuaW1wb3J0IHsgSUxvZ1NlcnZpY2UgfSBmcm9tICcuLi8uLi9sb2cvY29tbW9uL2xvZy5qcyc7XG5pbXBvcnQgeyBJQWdlbnRIb3N0R2l0U3RhdGVTZXJ2aWNlLCBNRVRBX0dJVF9TVEFURSwgTUVUQV9HSVRIVUJfU1RBVEUsIE1FVEFfU09VUkNFX0NPTlRST0xfU1RBVEUgfSBmcm9tICcuLi9jb21tb24vYWdlbnRIb3N0R2l0U3RhdGVTZXJ2aWNlLmpzJztcbmltcG9ydCB7IGdldFNlc3Npb25SZWxhdGVkUHVsbFJlcXVlc3RVcmxzLCBJU2Vzc2lvbkdpdEh1YlN0YXRlLCBJU2Vzc2lvbldpdGhEZWZhdWx0Q2hhdCwgcmVhZFNlc3Npb25HaXRIdWJTdGF0ZSwgcmVhZFNlc3Npb25HaXRTdGF0ZSwgcmVhZFNlc3Npb25Tb3VyY2VDb250cm9sU3RhdGUsIFNlc3Npb25MaWZlY3ljbGUsIFNlc3Npb25Tb3VyY2VDb250cm9sT3V0Y29tZSwgd2l0aEluaXRpYWxTZXNzaW9uUHVsbFJlcXVlc3QsIHdpdGhNb3N0UmVjZW50UmVmZXJlbmNlZFNlc3Npb25QdWxsUmVxdWVzdCwgd2l0aE1vc3RSZWNlbnRTZXNzaW9uUHVsbFJlcXVlc3QsIHdpdGhTZXNzaW9uR2l0SHViU3RhdGUsIHdpdGhTZXNzaW9uR2l0U3RhdGUsIHdpdGhTZXNzaW9uU291cmNlQ29udHJvbFN0YXRlLCB0eXBlIElTZXNzaW9uR2l0U3RhdGUsIHR5cGUgSVNlc3Npb25Tb3VyY2VDb250cm9sU3RhdGUgfSBmcm9tICcuLi9jb21tb24vc3RhdGUvc2Vzc2lvblN0YXRlLmpzJztcbmltcG9ydCB7IE1BWF9TRVNTSU9OX0lTU1VFX1JFRkVSRU5DRVMsIHBhcnNlR2l0SHViSXNzdWVSZWZlcmVuY2VzLCB0b0dpdEh1Yklzc3VlVXJsIH0gZnJvbSAnLi4vY29tbW9uL2dpdGh1Yklzc3VlUmVmZXJlbmNlcy5qcyc7XG5pbXBvcnQgeyBwYXJzZUdpdEh1YlB1bGxSZXF1ZXN0UmVmZXJlbmNlcywgdG9HaXRIdWJQdWxsUmVxdWVzdFVybCB9IGZyb20gJy4uL2NvbW1vbi9naXRodWJQdWxsUmVxdWVzdFJlZmVyZW5jZXMuanMnO1xuaW1wb3J0IHsgSUFnZW50SG9zdEdpdFNlcnZpY2UsIE1FVEFfRElGRl9CQVNFX0JSQU5DSCwgcGFyc2VVcHN0cmVhbUJyYW5jaE5hbWUsIHJlc29sdmVEaWZmQmFzZUJyYW5jaE5hbWUgfSBmcm9tICcuLi9jb21tb24vYWdlbnRIb3N0R2l0U2VydmljZS5qcyc7XG5pbXBvcnQgeyBBZ2VudEhvc3RTdGF0ZU1hbmFnZXIsIElBZ2VudEhvc3RTdGF0ZU1hbmFnZXIgfSBmcm9tICcuL2FnZW50SG9zdFN0YXRlTWFuYWdlci5qcyc7XG5pbXBvcnQgeyBJU2Vzc2lvbkRhdGFTZXJ2aWNlIH0gZnJvbSAnLi4vY29tbW9uL3Nlc3Npb25EYXRhU2VydmljZS5qcyc7XG5pbXBvcnQgeyBDcmVhdGVkUHVsbFJlcXVlc3QsIElBZ2VudEhvc3RPY3RvS2l0U2VydmljZSB9IGZyb20gJy4vc2hhcmVkL2FnZW50SG9zdE9jdG9LaXRTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElBZ2VudFNlcnZpY2UgfSBmcm9tICcuLi9jb21tb24vYWdlbnRTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElBZ2VudEhvc3RHaXRIdWJFbmRwb2ludFNlcnZpY2UgfSBmcm9tICcuL2FnZW50SG9zdEdpdEh1YkVuZHBvaW50U2VydmljZS5qcyc7XG5pbXBvcnQgeyBEaXNwb3NhYmxlLCB0b0Rpc3Bvc2FibGUgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgQ2FuY2VsbGF0aW9uVG9rZW5Tb3VyY2UgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9jYW5jZWxsYXRpb24uanMnO1xuaW1wb3J0IHsgVGhyb3R0bGVyQnlLZXksIFNlcXVlbmNlckJ5S2V5LCB0aW1lb3V0IH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vYXN5bmMuanMnO1xuaW1wb3J0IHsgaXNDYW5jZWxsYXRpb25FcnJvciB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL2Vycm9ycy5qcyc7XG5pbXBvcnQgeyBTZXNzaW9uQ29uZmlnS2V5IH0gZnJvbSAnLi4vY29tbW9uL3Nlc3Npb25Db25maWdLZXlzLmpzJztcblxuY29uc3QgUFVMTF9SRVFVRVNUX0NSRUFUSU9OX0NMT0NLX1NLRVdfTVMgPSA1ICogNjBfMDAwO1xuXG5leHBvcnQgY2xhc3MgQWdlbnRIb3N0R2l0U3RhdGVTZXJ2aWNlIGV4dGVuZHMgRGlzcG9zYWJsZSBpbXBsZW1lbnRzIElBZ2VudEhvc3RHaXRTdGF0ZVNlcnZpY2Uge1xuXHRkZWNsYXJlIHJlYWRvbmx5IF9zZXJ2aWNlQnJhbmQ6IHVuZGVmaW5lZDtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkRpZFJlZnJlc2hTZXNzaW9uR2l0U3RhdGUgPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjxzdHJpbmc+KCkpO1xuXHRyZWFkb25seSBvbkRpZFJlZnJlc2hTZXNzaW9uR2l0U3RhdGUgPSB0aGlzLl9vbkRpZFJlZnJlc2hTZXNzaW9uR2l0U3RhdGUuZXZlbnQ7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfb25EaWRDaGFuZ2VTZXNzaW9uR2l0SHViU3RhdGUgPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjxzdHJpbmc+KCkpO1xuXHRyZWFkb25seSBvbkRpZENoYW5nZVNlc3Npb25HaXRIdWJTdGF0ZSA9IHRoaXMuX29uRGlkQ2hhbmdlU2Vzc2lvbkdpdEh1YlN0YXRlLmV2ZW50O1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX2dpdFN0YXRlUmVmcmVzaFRocm90dGxlciA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBUaHJvdHRsZXJCeUtleTxzdHJpbmc+KCkpO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9naXRTdGF0ZVJlZnJlc2hDYW5jZWxsYXRpb25Ub2tlblNvdXJjZSA9IG5ldyBDYW5jZWxsYXRpb25Ub2tlblNvdXJjZSgpO1xuXG5cdC8qKlxuXHQgKiBTZXJpYWxpemVzIHB1bGwgcmVxdWVzdCBsb29rdXBzIHBlciBzZXNzaW9uIHNvIG92ZXJsYXBwaW5nIHRyaWdnZXJzICh0dXJuXG5cdCAqIGNvbXBsZXRpb24sIHNlc3Npb24gcmVzdG9yZSwgYSByZWZyZXNoIG9ic2VydmluZyBhIGJyYW5jaCBjaGFuZ2UpIGlzc3VlIGF0XG5cdCAqIG1vc3Qgb25lIEdpdEh1YiByZXF1ZXN0IGF0IGEgdGltZSBhbmQgb2JzZXJ2ZSBlYWNoIG90aGVyJ3Mgd3JpdGVzLlxuXHQgKi9cblx0cHJpdmF0ZSByZWFkb25seSBfcHVsbFJlcXVlc3RTZXF1ZW5jZXIgPSBuZXcgU2VxdWVuY2VyQnlLZXk8c3RyaW5nPigpO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9wdWxsUmVxdWVzdEFib3J0Q29udHJvbGxlciA9IG5ldyBBYm9ydENvbnRyb2xsZXIoKTtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRASUFnZW50SG9zdFN0YXRlTWFuYWdlciBwcml2YXRlIHJlYWRvbmx5IF9zdGF0ZU1hbmFnZXI6IEFnZW50SG9zdFN0YXRlTWFuYWdlcixcblx0XHRASUFnZW50SG9zdEdpdFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfZ2l0U2VydmljZTogSUFnZW50SG9zdEdpdFNlcnZpY2UsXG5cdFx0QElBZ2VudEhvc3RPY3RvS2l0U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9vY3RvS2l0U2VydmljZTogSUFnZW50SG9zdE9jdG9LaXRTZXJ2aWNlLFxuXHRcdEBJQWdlbnRTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2FnZW50U2VydmljZTogSUFnZW50U2VydmljZSxcblx0XHRASUFnZW50SG9zdEdpdEh1YkVuZHBvaW50U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9naXRIdWJFbmRwb2ludFNlcnZpY2U6IElBZ2VudEhvc3RHaXRIdWJFbmRwb2ludFNlcnZpY2UsXG5cdFx0QElMb2dTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2xvZ1NlcnZpY2U6IElMb2dTZXJ2aWNlLFxuXHRcdEBJU2Vzc2lvbkRhdGFTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX3Nlc3Npb25EYXRhU2VydmljZTogSVNlc3Npb25EYXRhU2VydmljZSxcblx0KSB7XG5cdFx0c3VwZXIoKTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKHRvRGlzcG9zYWJsZSgoKSA9PiB0aGlzLl9naXRTdGF0ZVJlZnJlc2hDYW5jZWxsYXRpb25Ub2tlblNvdXJjZS5kaXNwb3NlKHRydWUpKSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodG9EaXNwb3NhYmxlKCgpID0+IHRoaXMuX3B1bGxSZXF1ZXN0QWJvcnRDb250cm9sbGVyLmFib3J0KCkpKTtcblx0fVxuXG5cdGFzeW5jIGF0dGFjaFNlc3Npb25HaXRIdWJQdWxsUmVxdWVzdChzZXNzaW9uS2V5OiBzdHJpbmcsIHdvcmtpbmdEaXJlY3Rvcnk6IFVSSSB8IHVuZGVmaW5lZCk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGF3YWl0IHRoaXMucmVmcmVzaFNlc3Npb25HaXRTdGF0ZShzZXNzaW9uS2V5LCB3b3JraW5nRGlyZWN0b3J5KTtcblx0XHRhd2FpdCB0aGlzLl9xdWV1ZVB1bGxSZXF1ZXN0TG9va3VwKHNlc3Npb25LZXkpO1xuXHR9XG5cblx0LyoqXG5cdCAqIFF1ZXVlcyBhIHB1bGwgcmVxdWVzdCBsb29rdXAgb24gdGhlIHNlc3Npb24ncyBzZXF1ZW5jZXIgc28gb3ZlcmxhcHBpbmdcblx0ICogdHJpZ2dlcnMgKHR1cm4gY29tcGxldGlvbiwgc2Vzc2lvbiByZXN0b3JlLCBhIHJlZnJlc2ggb2JzZXJ2aW5nIGEgYnJhbmNoXG5cdCAqIGNoYW5nZSkgaXNzdWUgYXQgbW9zdCBvbmUgR2l0SHViIHJlcXVlc3QgYXQgYSB0aW1lLlxuXHQgKi9cblx0cHJpdmF0ZSBfcXVldWVQdWxsUmVxdWVzdExvb2t1cChzZXNzaW9uS2V5OiBzdHJpbmcpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRyZXR1cm4gdGhpcy5fcHVsbFJlcXVlc3RTZXF1ZW5jZXIucXVldWUoc2Vzc2lvbktleSwgKCkgPT4gdGhpcy5fYXR0YWNoU2Vzc2lvbkdpdEh1YlB1bGxSZXF1ZXN0KHNlc3Npb25LZXkpKTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgX2F0dGFjaFNlc3Npb25HaXRIdWJQdWxsUmVxdWVzdChzZXNzaW9uS2V5OiBzdHJpbmcpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCBzdGF0ZSA9IHRoaXMuX3N0YXRlTWFuYWdlci5nZXRTZXNzaW9uU3RhdGUoc2Vzc2lvbktleSk7XG5cdFx0aWYgKCFzdGF0ZSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdC8vIE5ldyBzZXNzaW9uXG5cdFx0aWYgKHN0YXRlLmxpZmVjeWNsZSAhPT0gU2Vzc2lvbkxpZmVjeWNsZS5SZWFkeSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdC8vIEdpdEh1YiBzdGF0ZVxuXHRcdGNvbnN0IGdpdEh1YlN0YXRlID0gcmVhZFNlc3Npb25HaXRIdWJTdGF0ZSh0aGlzLl9zdGF0ZU1hbmFnZXIuZ2V0U2Vzc2lvblN0YXRlKHNlc3Npb25LZXkpPy5fbWV0YSk7XG5cdFx0aWYgKCFnaXRIdWJTdGF0ZT8ub3duZXIgfHwgIWdpdEh1YlN0YXRlPy5yZXBvKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Ly8gR2l0IHN0YXRlXG5cdFx0Y29uc3QgZ2l0U3RhdGUgPSByZWFkU2Vzc2lvbkdpdFN0YXRlKHN0YXRlLl9tZXRhKTtcblx0XHRjb25zdCBicmFuY2hOYW1lID0gZ2l0U3RhdGU/LmJyYW5jaE5hbWU7XG5cdFx0aWYgKCFicmFuY2hOYW1lIHx8IChicmFuY2hOYW1lID09PSBnaXRTdGF0ZT8uYmFzZUJyYW5jaE5hbWUpKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Ly8gQSBwdWxsIHJlcXVlc3QgaXMgYWx3YXlzIHRpZWQgdG8gYSBicmFuY2g6IG9ubHkgc3RvcCBsb29raW5nIG9uY2Ugd2Vcblx0XHQvLyBrbm93IGEgcHVsbCByZXF1ZXN0IGZvciB0aGUgYnJhbmNoIHRoYXQgaXMgY3VycmVudGx5IGNoZWNrZWQgb3V0LlxuXHRcdC8vIFN0YXRlIHBlcnNpc3RlZCBiZWZvcmUgcHVsbCByZXF1ZXN0cyB3ZXJlIHRyYWNrZWQgcGVyIGJyYW5jaCByZWNvcmRzXG5cdFx0Ly8gbm8gYnJhbmNoLCBzbyBpdHMgcHVsbCByZXF1ZXN0IGlzIHZlcmlmaWVkIGFnYWluc3QgdGhlIGN1cnJlbnQgYnJhbmNoXG5cdFx0Ly8gcmF0aGVyIHRoYW4gYXNzdW1lZCB0byBiZWxvbmcgdG8gaXQuXG5cdFx0aWYgKGdpdEh1YlN0YXRlLnB1bGxSZXF1ZXN0QnJhbmNoTmFtZSA9PT0gYnJhbmNoTmFtZSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdHRyeSB7XG5cdFx0XHRjb25zdCByZXBvUmVzb3VyY2UgPSB0aGlzLl9naXRIdWJFbmRwb2ludFNlcnZpY2UuZ2V0UmVwb1Jlc291cmNlKCk7XG5cdFx0XHRjb25zdCBhdXRoVG9rZW4gPSB0aGlzLl9hZ2VudFNlcnZpY2UuZ2V0QXV0aFRva2VuKHtcblx0XHRcdFx0cmVzb3VyY2U6IHJlcG9SZXNvdXJjZS5yZXNvdXJjZSxcblx0XHRcdFx0c2NvcGVzOiByZXBvUmVzb3VyY2Uuc2NvcGVzX3N1cHBvcnRlZCxcblx0XHRcdH0pO1xuXHRcdFx0aWYgKCFhdXRoVG9rZW4pIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXG5cdFx0XHRjb25zdCBwciA9IGF3YWl0IHRoaXMuX2ZpbmRQdWxsUmVxdWVzdEZvckNoZWNrb3V0KHN0YXRlLCBnaXRIdWJTdGF0ZS5vd25lciwgZ2l0SHViU3RhdGUucmVwbywgZ2l0U3RhdGUsIGJyYW5jaE5hbWUsIGF1dGhUb2tlbik7XG5cdFx0XHRjb25zdCBjdXJyZW50QnJhbmNoTmFtZSA9IHJlYWRTZXNzaW9uR2l0U3RhdGUodGhpcy5fc3RhdGVNYW5hZ2VyLmdldFNlc3Npb25TdGF0ZShzZXNzaW9uS2V5KT8uX21ldGEpPy5icmFuY2hOYW1lO1xuXHRcdFx0aWYgKGN1cnJlbnRCcmFuY2hOYW1lICE9PSBicmFuY2hOYW1lKSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblxuXHRcdFx0Y29uc3QgY3VycmVudFN0YXRlID0gdGhpcy5fc3RhdGVNYW5hZ2VyLmdldFNlc3Npb25TdGF0ZShzZXNzaW9uS2V5KTtcblx0XHRcdGlmICghY3VycmVudFN0YXRlKSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblx0XHRcdGNvbnN0IGN1cnJlbnRHaXRIdWJTdGF0ZSA9IHJlYWRTZXNzaW9uR2l0SHViU3RhdGUoY3VycmVudFN0YXRlLl9tZXRhKTtcblx0XHRcdGlmICghcHI/LnVybCkge1xuXHRcdFx0XHRpZiAodGhpcy5faXNGb2xkZXJTZXNzaW9uKGN1cnJlbnRTdGF0ZSwgY3VycmVudEdpdEh1YlN0YXRlKSAmJiBjdXJyZW50R2l0SHViU3RhdGU/LmluaXRpYWxQdWxsUmVxdWVzdFVybHMgPT09IHVuZGVmaW5lZCkge1xuXHRcdFx0XHRcdGF3YWl0IHRoaXMuc2V0U2Vzc2lvbkdpdEh1YlN0YXRlKHNlc3Npb25LZXksIHdpdGhJbml0aWFsU2Vzc2lvblB1bGxSZXF1ZXN0KGN1cnJlbnRHaXRIdWJTdGF0ZSkpO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHRoaXMuX2xvZ1NlcnZpY2UudHJhY2UoYFtBZ2VudEhvc3RHaXRTdGF0ZVNlcnZpY2VdW2F0dGFjaFNlc3Npb25HaXRIdWJQdWxsUmVxdWVzdF0gTm8gcHVsbCByZXF1ZXN0IGZvdW5kIGZvciAke3Nlc3Npb25LZXl9IG9uIGJyYW5jaCAke2JyYW5jaE5hbWV9YCk7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblxuXHRcdFx0bGV0IG5leHRHaXRIdWJTdGF0ZSA9IHdpdGhNb3N0UmVjZW50U2Vzc2lvblB1bGxSZXF1ZXN0KGN1cnJlbnRHaXRIdWJTdGF0ZSwgcHIudXJsLCBicmFuY2hOYW1lKTtcblx0XHRcdGlmICh0aGlzLl9zaG91bGRBZGRUb0ZvbGRlckJhc2VsaW5lKHNlc3Npb25LZXksIGN1cnJlbnRTdGF0ZSwgY3VycmVudEdpdEh1YlN0YXRlLCBwcikpIHtcblx0XHRcdFx0bmV4dEdpdEh1YlN0YXRlID0ge1xuXHRcdFx0XHRcdC4uLm5leHRHaXRIdWJTdGF0ZSxcblx0XHRcdFx0XHQuLi53aXRoSW5pdGlhbFNlc3Npb25QdWxsUmVxdWVzdChjdXJyZW50R2l0SHViU3RhdGUsIHByLnVybCksXG5cdFx0XHRcdH07XG5cdFx0XHR9IGVsc2UgaWYgKHRoaXMuX2lzRm9sZGVyU2Vzc2lvbihjdXJyZW50U3RhdGUsIGN1cnJlbnRHaXRIdWJTdGF0ZSkgJiYgY3VycmVudEdpdEh1YlN0YXRlPy5pbml0aWFsUHVsbFJlcXVlc3RVcmxzID09PSB1bmRlZmluZWQpIHtcblx0XHRcdFx0bmV4dEdpdEh1YlN0YXRlID0ge1xuXHRcdFx0XHRcdC4uLm5leHRHaXRIdWJTdGF0ZSxcblx0XHRcdFx0XHQuLi53aXRoSW5pdGlhbFNlc3Npb25QdWxsUmVxdWVzdChjdXJyZW50R2l0SHViU3RhdGUpLFxuXHRcdFx0XHR9O1xuXHRcdFx0fVxuXHRcdFx0YXdhaXQgdGhpcy5zZXRTZXNzaW9uR2l0SHViU3RhdGUoc2Vzc2lvbktleSwgbmV4dEdpdEh1YlN0YXRlKTtcblx0XHR9IGNhdGNoIChlcnJvcikge1xuXHRcdFx0dGhpcy5fbG9nU2VydmljZS53YXJuKGBbQWdlbnRIb3N0R2l0U3RhdGVTZXJ2aWNlXVthdHRhY2hTZXNzaW9uR2l0SHViUHVsbFJlcXVlc3RdIEZhaWxlZCB0byBmaW5kIHB1bGwgcmVxdWVzdCBmb3IgJHtzZXNzaW9uS2V5fWAsIGVycm9yKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIF9zaG91bGRBZGRUb0ZvbGRlckJhc2VsaW5lKHNlc3Npb25LZXk6IHN0cmluZywgc3RhdGU6IElTZXNzaW9uV2l0aERlZmF1bHRDaGF0LCBnaXRIdWJTdGF0ZTogSVNlc3Npb25HaXRIdWJTdGF0ZSB8IHVuZGVmaW5lZCwgcHVsbFJlcXVlc3Q6IENyZWF0ZWRQdWxsUmVxdWVzdCk6IGJvb2xlYW4ge1xuXHRcdGlmICghdGhpcy5faXNGb2xkZXJTZXNzaW9uKHN0YXRlLCBnaXRIdWJTdGF0ZSkgfHwgZ2V0U2Vzc2lvblJlbGF0ZWRQdWxsUmVxdWVzdFVybHMoZ2l0SHViU3RhdGUpLnNvbWUodXJsID0+IHVybC50b0xvd2VyQ2FzZSgpID09PSBwdWxsUmVxdWVzdC51cmwudG9Mb3dlckNhc2UoKSkpIHtcblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cdFx0aWYgKHB1bGxSZXF1ZXN0LmNyZWF0ZWRBdCAhPT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRjb25zdCBzZXNzaW9uU3RhcnQgPSBEYXRlLnBhcnNlKHRoaXMuX3N0YXRlTWFuYWdlci5nZXRTZXNzaW9uU3VtbWFyeShzZXNzaW9uS2V5KT8uY3JlYXRlZEF0ID8/ICcnKTtcblx0XHRcdHJldHVybiBOdW1iZXIuaXNOYU4oc2Vzc2lvblN0YXJ0KSB8fCBwdWxsUmVxdWVzdC5jcmVhdGVkQXQgPCBzZXNzaW9uU3RhcnQgLSBQVUxMX1JFUVVFU1RfQ1JFQVRJT05fQ0xPQ0tfU0tFV19NUztcblx0XHR9XG5cdFx0cmV0dXJuIGdpdEh1YlN0YXRlPy5pbml0aWFsUHVsbFJlcXVlc3RVcmxzID09PSB1bmRlZmluZWQ7XG5cdH1cblxuXHRwcml2YXRlIF9pc0ZvbGRlclNlc3Npb24oc3RhdGU6IElTZXNzaW9uV2l0aERlZmF1bHRDaGF0LCBnaXRIdWJTdGF0ZTogSVNlc3Npb25HaXRIdWJTdGF0ZSB8IHVuZGVmaW5lZCk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiBzdGF0ZS5jb25maWc/LnZhbHVlc1tTZXNzaW9uQ29uZmlnS2V5Lklzb2xhdGlvbl0gPT09ICdmb2xkZXInXG5cdFx0XHR8fCBnaXRIdWJTdGF0ZT8uaW5pdGlhbFB1bGxSZXF1ZXN0VXJscyAhPT0gdW5kZWZpbmVkO1xuXHR9XG5cblx0LyoqXG5cdCAqIFJlc29sdmVzIHRoZSBwdWxsIHJlcXVlc3Qgb2YgdGhlIGJyYW5jaCB0aGF0IGlzIGN1cnJlbnRseSBjaGVja2VkIG91dCxcblx0ICogcHJlZmVycmluZyB0aGUgcmVtb3RlIGhlYWQgYnJhbmNoIGFuZCBmYWxsaW5nIGJhY2sgdG8gdGhlIGNvbW1pdCBhdCBIRUFEXG5cdCAqIGZvciBsb2NhbCBicmFuY2hlcyB3aG9zZSBuYW1lIG5ldmVyIHJlYWNoZWQgdGhlIHJlbW90ZS5cblx0ICovXG5cdHByaXZhdGUgYXN5bmMgX2ZpbmRQdWxsUmVxdWVzdEZvckNoZWNrb3V0KHN0YXRlOiBJU2Vzc2lvbldpdGhEZWZhdWx0Q2hhdCwgb3duZXI6IHN0cmluZywgcmVwbzogc3RyaW5nLCBnaXRTdGF0ZTogSVNlc3Npb25HaXRTdGF0ZSB8IHVuZGVmaW5lZCwgYnJhbmNoTmFtZTogc3RyaW5nLCBhdXRoVG9rZW46IHN0cmluZyk6IFByb21pc2U8Q3JlYXRlZFB1bGxSZXF1ZXN0IHwgdW5kZWZpbmVkPiB7XG5cdFx0Y29uc3Qgc2lnbmFsID0gdGhpcy5fcHVsbFJlcXVlc3RBYm9ydENvbnRyb2xsZXIuc2lnbmFsO1xuXHRcdC8vIEFuIHVwc3RyZWFtIG9uIGEgbm9uLUdpdEh1YiByZW1vdGUgc2F5cyBub3RoaW5nIGFib3V0IEdpdEh1Yiwgc28gaXRzXG5cdFx0Ly8gYnJhbmNoIGlzIGlnbm9yZWQgaGVyZSBhcyBpdCBpcyB3aGVuIGNyZWF0aW5nIGEgcHVsbCByZXF1ZXN0LlxuXHRcdGNvbnN0IGdpdGh1YkhlYWRPd25lciA9IGdpdFN0YXRlPy5naXRodWJIZWFkT3duZXI7XG5cdFx0Y29uc3QgdXBzdHJlYW1CcmFuY2ggPSBnaXRodWJIZWFkT3duZXIgPyBwYXJzZVVwc3RyZWFtQnJhbmNoTmFtZShnaXRTdGF0ZT8udXBzdHJlYW1CcmFuY2hOYW1lKSA6IHVuZGVmaW5lZDtcblx0XHRjb25zdCBoZWFkQnJhbmNoID0gdXBzdHJlYW1CcmFuY2g/LmJyYW5jaCA/PyBicmFuY2hOYW1lO1xuXHRcdGNvbnN0IGhlYWRPd25lciA9IGdpdGh1YkhlYWRPd25lciA/PyBvd25lcjtcblxuXHRcdGNvbnN0IHB1bGxSZXF1ZXN0QnlCcmFuY2ggPSBhd2FpdCB0aGlzLl9vY3RvS2l0U2VydmljZS5maW5kUHVsbFJlcXVlc3RCeUhlYWRCcmFuY2gob3duZXIsIHJlcG8sIGhlYWRCcmFuY2gsIGF1dGhUb2tlbiwgc2lnbmFsLCBoZWFkT3duZXIpO1xuXHRcdGlmIChwdWxsUmVxdWVzdEJ5QnJhbmNoKSB7XG5cdFx0XHRyZXR1cm4gcHVsbFJlcXVlc3RCeUJyYW5jaDtcblx0XHR9XG5cblx0XHRjb25zdCB3b3JraW5nRGlyZWN0b3J5ID0gc3RhdGUud29ya2luZ0RpcmVjdG9yaWVzPy5bMF07XG5cdFx0aWYgKCF3b3JraW5nRGlyZWN0b3J5KSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblxuXHRcdGNvbnN0IGhlYWRTaGEgPSBhd2FpdCB0aGlzLl9naXRTZXJ2aWNlLnJldlBhcnNlKFVSSS5wYXJzZSh3b3JraW5nRGlyZWN0b3J5KSwgJ0hFQUQnKTtcblx0XHRyZXR1cm4gaGVhZFNoYVxuXHRcdFx0PyB0aGlzLl9vY3RvS2l0U2VydmljZS5maW5kUHVsbFJlcXVlc3RCeUhlYWRTaGEob3duZXIsIHJlcG8sIGhlYWRTaGEsIGF1dGhUb2tlbiwgc2lnbmFsKVxuXHRcdFx0OiB1bmRlZmluZWQ7XG5cdH1cblxuXHRhc3luYyBhdHRhY2hTZXNzaW9uR2l0SHViUmVmZXJlbmNlcyhzZXNzaW9uS2V5OiBzdHJpbmcsIHRleHQ6IHN0cmluZyk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGNvbnN0IGN1cnJlbnRTdGF0ZSA9IHJlYWRTZXNzaW9uR2l0SHViU3RhdGUodGhpcy5fc3RhdGVNYW5hZ2VyLmdldFNlc3Npb25TdGF0ZShzZXNzaW9uS2V5KT8uX21ldGEpO1xuXHRcdGNvbnN0IGlzc3VlUmVmZXJlbmNlcyA9IHBhcnNlR2l0SHViSXNzdWVSZWZlcmVuY2VzKHRleHQpO1xuXHRcdGNvbnN0IHJlcG9zaXRvcnkgPSBjdXJyZW50U3RhdGU/Lm93bmVyICYmIGN1cnJlbnRTdGF0ZS5yZXBvID8geyBvd25lcjogY3VycmVudFN0YXRlLm93bmVyLCByZXBvOiBjdXJyZW50U3RhdGUucmVwbyB9IDogdW5kZWZpbmVkO1xuXHRcdGNvbnN0IGdpdEh1Ykhvc3QgPSB0aGlzLl9naXRIdWJFbmRwb2ludFNlcnZpY2UuZ2V0RW50ZXJwcmlzZUhvc3QoKSA/PyAnZ2l0aHViLmNvbSc7XG5cdFx0Y29uc3QgcHVsbFJlcXVlc3RSZWZlcmVuY2VzID0gcGFyc2VHaXRIdWJQdWxsUmVxdWVzdFJlZmVyZW5jZXModGV4dCwgcmVwb3NpdG9yeSwgZ2l0SHViSG9zdClcblx0XHRcdC5maWx0ZXIocmVmZXJlbmNlID0+ICFyZXBvc2l0b3J5IHx8IHJlZmVyZW5jZS5vd25lci50b0xvd2VyQ2FzZSgpID09PSByZXBvc2l0b3J5Lm93bmVyLnRvTG93ZXJDYXNlKCkgJiYgcmVmZXJlbmNlLnJlcG8udG9Mb3dlckNhc2UoKSA9PT0gcmVwb3NpdG9yeS5yZXBvLnRvTG93ZXJDYXNlKCkpO1xuXHRcdGlmIChpc3N1ZVJlZmVyZW5jZXMubGVuZ3RoID09PSAwICYmIHB1bGxSZXF1ZXN0UmVmZXJlbmNlcy5sZW5ndGggPT09IDApIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCBjdXJyZW50SXNzdWVVcmxzID0gY3VycmVudFN0YXRlPy5pc3N1ZVVybHMgPz8gW107XG5cdFx0Y29uc3QgbmV4dElzc3VlVXJscyA9IFsuLi5jdXJyZW50SXNzdWVVcmxzXTtcblx0XHRmb3IgKGNvbnN0IHJlZmVyZW5jZSBvZiBpc3N1ZVJlZmVyZW5jZXMpIHtcblx0XHRcdGNvbnN0IHVybCA9IHRvR2l0SHViSXNzdWVVcmwocmVmZXJlbmNlKTtcblx0XHRcdGlmICghbmV4dElzc3VlVXJscy5pbmNsdWRlcyh1cmwpKSB7XG5cdFx0XHRcdG5leHRJc3N1ZVVybHMucHVzaCh1cmwpO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdGxldCBuZXh0U3RhdGU6IElTZXNzaW9uR2l0SHViU3RhdGUgPSBpc3N1ZVJlZmVyZW5jZXMubGVuZ3RoID4gMFxuXHRcdFx0PyB7IGlzc3VlVXJsczogbmV4dElzc3VlVXJscy5zbGljZSgwLCBNQVhfU0VTU0lPTl9JU1NVRV9SRUZFUkVOQ0VTKSB9XG5cdFx0XHQ6IHt9O1xuXHRcdGZvciAobGV0IGluZGV4ID0gcHVsbFJlcXVlc3RSZWZlcmVuY2VzLmxlbmd0aCAtIDE7IGluZGV4ID49IDA7IGluZGV4LS0pIHtcblx0XHRcdGNvbnN0IHJlZmVyZW5jZSA9IHB1bGxSZXF1ZXN0UmVmZXJlbmNlc1tpbmRleF07XG5cdFx0XHRjb25zdCB1cmwgPSB0b0dpdEh1YlB1bGxSZXF1ZXN0VXJsKHJlZmVyZW5jZSwgZ2l0SHViSG9zdCk7XG5cdFx0XHRuZXh0U3RhdGUgPSB7XG5cdFx0XHRcdC4uLm5leHRTdGF0ZSxcblx0XHRcdFx0Li4ud2l0aE1vc3RSZWNlbnRSZWZlcmVuY2VkU2Vzc2lvblB1bGxSZXF1ZXN0KHsgLi4uY3VycmVudFN0YXRlLCAuLi5uZXh0U3RhdGUgfSwgdXJsKVxuXHRcdFx0fTtcblx0XHR9XG5cdFx0YXdhaXQgdGhpcy5zZXRTZXNzaW9uR2l0SHViU3RhdGUoc2Vzc2lvbktleSwgbmV4dFN0YXRlKTtcblx0fVxuXG5cdGFzeW5jIHJlZnJlc2hTZXNzaW9uR2l0U3RhdGUoc2Vzc2lvbktleTogc3RyaW5nLCB3b3JraW5nRGlyZWN0b3J5OiBVUkkgfCB1bmRlZmluZWQpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCBzZXNzaW9uU3RhdGUgPSB0aGlzLl9zdGF0ZU1hbmFnZXIuZ2V0U2Vzc2lvblN0YXRlKHNlc3Npb25LZXkpO1xuXHRcdGlmIChzZXNzaW9uU3RhdGU/LmxpZmVjeWNsZSA9PT0gU2Vzc2lvbkxpZmVjeWNsZS5DcmVhdGlvbkZhaWxlZCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGlmICghd29ya2luZ0RpcmVjdG9yeSkge1xuXHRcdFx0Y29uc3Qgd29ya2luZ0RpcmVjdG9yeVN0ciA9IHNlc3Npb25TdGF0ZT8ud29ya2luZ0RpcmVjdG9yaWVzPy5bMF07XG5cdFx0XHRpZiAod29ya2luZ0RpcmVjdG9yeVN0cikge1xuXHRcdFx0XHR3b3JraW5nRGlyZWN0b3J5ID0gVVJJLnBhcnNlKHdvcmtpbmdEaXJlY3RvcnlTdHIpO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdGlmICghd29ya2luZ0RpcmVjdG9yeSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGF3YWl0IHRoaXMuX2dpdFN0YXRlUmVmcmVzaFRocm90dGxlci5xdWV1ZShzZXNzaW9uS2V5LCBhc3luYyAoKSA9PiB7XG5cdFx0XHR0cnkge1xuXHRcdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLnRyYWNlKGBbQWdlbnRIb3N0R2l0U3RhdGVTZXJ2aWNlXVtyZWZyZXNoU2Vzc2lvbkdpdFN0YXRlXSBSZWZyZXNoaW5nIGdpdCBzdGF0ZSBmb3IgJHtzZXNzaW9uS2V5fSwgJHt3b3JraW5nRGlyZWN0b3J5Py5mc1BhdGh9YCk7XG5cblx0XHRcdFx0Y29uc3QgYmFzZUJyYW5jaE5hbWUgPSBhd2FpdCB0aGlzLnJlc29sdmVTZXNzaW9uQmFzZUJyYW5jaE5hbWUoc2Vzc2lvbktleSk7XG5cdFx0XHRcdGNvbnN0IGdpdFN0YXRlID0gYXdhaXQgdGhpcy5fZ2l0U2VydmljZS5nZXRTZXNzaW9uR2l0U3RhdGUod29ya2luZ0RpcmVjdG9yeSwgYmFzZUJyYW5jaE5hbWUpO1xuXHRcdFx0XHRpZiAoZ2l0U3RhdGUpIHtcblx0XHRcdFx0XHRjb25zdCBjdXJyZW50TWV0YSA9IHRoaXMuX3N0YXRlTWFuYWdlci5nZXRTZXNzaW9uU3RhdGUoc2Vzc2lvbktleSk/Ll9tZXRhO1xuXHRcdFx0XHRcdGNvbnN0IHByZXZpb3VzR2l0U3RhdGUgPSByZWFkU2Vzc2lvbkdpdFN0YXRlKGN1cnJlbnRNZXRhKTtcblx0XHRcdFx0XHRjb25zdCBnaXRTdGF0ZUNoYW5nZWQgPSAhb2JqZWN0RXF1YWxzKHByZXZpb3VzR2l0U3RhdGUsIGdpdFN0YXRlKTtcblx0XHRcdFx0XHRpZiAoZ2l0U3RhdGVDaGFuZ2VkKSB7XG5cdFx0XHRcdFx0XHQvLyBVcGRhdGUgdGhlIHNlc3Npb24ncyBnaXQgc3RhdGVcblx0XHRcdFx0XHRcdGF3YWl0IHRoaXMuX3NldFNlc3Npb25HaXRTdGF0ZShzZXNzaW9uS2V5LCBnaXRTdGF0ZSk7XG5cdFx0XHRcdFx0fVxuXG5cdFx0XHRcdFx0aWYgKGdpdFN0YXRlLmdpdGh1Yk93bmVyICYmIGdpdFN0YXRlLmdpdGh1YlJlcG8pIHtcblx0XHRcdFx0XHRcdGNvbnN0IGN1cnJlbnRHaXRIdWJTdGF0ZSA9IHJlYWRTZXNzaW9uR2l0SHViU3RhdGUoY3VycmVudE1ldGEpO1xuXHRcdFx0XHRcdFx0aWYgKGN1cnJlbnRHaXRIdWJTdGF0ZT8ub3duZXIgIT09IGdpdFN0YXRlLmdpdGh1Yk93bmVyIHx8IGN1cnJlbnRHaXRIdWJTdGF0ZS5yZXBvICE9PSBnaXRTdGF0ZS5naXRodWJSZXBvKSB7XG5cdFx0XHRcdFx0XHRcdGF3YWl0IHRoaXMuc2V0U2Vzc2lvbkdpdEh1YlN0YXRlKHNlc3Npb25LZXksIHtcblx0XHRcdFx0XHRcdFx0XHRvd25lcjogZ2l0U3RhdGUuZ2l0aHViT3duZXIsXG5cdFx0XHRcdFx0XHRcdFx0cmVwbzogZ2l0U3RhdGUuZ2l0aHViUmVwb1xuXHRcdFx0XHRcdFx0XHR9IHNhdGlzZmllcyBJU2Vzc2lvbkdpdEh1YlN0YXRlKTtcblx0XHRcdFx0XHRcdH1cblxuXHRcdFx0XHRcdFx0Ly8gVGhlIHdvcmtpbmcgY29weSBzd2l0Y2hlZCB0byBhIGRpZmZlcmVudCBicmFuY2g6XG5cdFx0XHRcdFx0XHQvLyBsb29rIGZvciBhIHB1bGwgcmVxdWVzdCB0aGF0IGJlbG9uZ3MgdG8gdGhlIG5ld1xuXHRcdFx0XHRcdFx0Ly8gYnJhbmNoLiBUaGUgcHJldmlvdXNseSBrbm93biBwdWxsIHJlcXVlc3Qga2VlcHNcblx0XHRcdFx0XHRcdC8vIGJlaW5nIHJlcG9ydGVkIHVudGlsIGEgbmV3IG9uZSBpcyBmb3VuZC4gQXdhaXRlZFxuXHRcdFx0XHRcdFx0Ly8gc28gdGhlIHJlZnJlc2ggZXZlbnQgYmVsb3cgY2FycmllcyB0aGUgcHVsbFxuXHRcdFx0XHRcdFx0Ly8gcmVxdWVzdCBvZiB0aGUgbmV3IGJyYW5jaCByYXRoZXIgdGhhbiBzdGFsZVxuXHRcdFx0XHRcdFx0Ly8gR2l0SHViIHN0YXRlLlxuXHRcdFx0XHRcdFx0aWYgKGdpdFN0YXRlQ2hhbmdlZCAmJiBwcmV2aW91c0dpdFN0YXRlPy5icmFuY2hOYW1lICE9PSBnaXRTdGF0ZS5icmFuY2hOYW1lKSB7XG5cdFx0XHRcdFx0XHRcdGF3YWl0IHRoaXMuX3F1ZXVlUHVsbFJlcXVlc3RMb29rdXAoc2Vzc2lvbktleSk7XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cblx0XHRcdFx0dGhpcy5fb25EaWRSZWZyZXNoU2Vzc2lvbkdpdFN0YXRlLmZpcmUoc2Vzc2lvbktleSk7XG5cblx0XHRcdFx0Ly8gV2Ugd2FudCB0byBlbnN1cmUgdGhhdCB3ZSByZWZyZXNoIHRoZSBnaXQgc3RhdGUgYXRcblx0XHRcdFx0Ly8gbW9zdCBldmVyeSA1IHNlY29uZHMgaW4gb3JkZXIgdG8gYXZvaWQgZXhjZXNzaXZlIGdpdFxuXHRcdFx0XHQvLyBvcGVyYXRpb25zIGFuZCBleGNlc3NpdmUgdHJhZmZpYyBiZXR3ZWVuIHRoZSBzZXJ2ZXJcblx0XHRcdFx0Ly8gYW5kIHRoZSBjbGllbnQocykuXG5cdFx0XHRcdGF3YWl0IHRpbWVvdXQoNV8wMDAsIHRoaXMuX2dpdFN0YXRlUmVmcmVzaENhbmNlbGxhdGlvblRva2VuU291cmNlLnRva2VuKTtcblx0XHRcdH0gY2F0Y2ggKGVycm9yKSB7XG5cdFx0XHRcdGlmIChpc0NhbmNlbGxhdGlvbkVycm9yKGVycm9yKSkge1xuXHRcdFx0XHRcdHJldHVybjtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdHRoaXMuX2xvZ1NlcnZpY2Uud2FybihgW0FnZW50SG9zdEdpdFN0YXRlU2VydmljZV1bcmVmcmVzaFNlc3Npb25HaXRTdGF0ZV0gRmFpbGVkIHRvIGNvbXB1dGUgZ2l0IHN0YXRlIGZvciAke3Nlc3Npb25LZXl9OmAsIGVycm9yKTtcblx0XHRcdH1cblx0XHR9KTtcblx0fVxuXG5cdGFzeW5jIHNldFNlc3Npb25HaXRIdWJTdGF0ZShzZXNzaW9uS2V5OiBzdHJpbmcsIHN0YXRlOiBJU2Vzc2lvbkdpdEh1YlN0YXRlKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3QgY3VycmVudE1ldGEgPSB0aGlzLl9zdGF0ZU1hbmFnZXIuZ2V0U2Vzc2lvblN0YXRlKHNlc3Npb25LZXkpPy5fbWV0YTtcblxuXHRcdGNvbnN0IGN1cnJlbnRTdGF0ZSA9IHJlYWRTZXNzaW9uR2l0SHViU3RhdGUoY3VycmVudE1ldGEpO1xuXHRcdGNvbnN0IG5leHRTdGF0ZSA9IHsgLi4uKGN1cnJlbnRTdGF0ZSA/PyB7fSksIC4uLnN0YXRlIH0gc2F0aXNmaWVzIElTZXNzaW9uR2l0SHViU3RhdGU7XG5cdFx0Y29uc3QgY3VycmVudFB1bGxSZXF1ZXN0ID0gZ2V0U2Vzc2lvblJlbGF0ZWRQdWxsUmVxdWVzdFVybHMoY3VycmVudFN0YXRlKVswXTtcblx0XHRjb25zdCBuZXh0UHVsbFJlcXVlc3QgPSBnZXRTZXNzaW9uUmVsYXRlZFB1bGxSZXF1ZXN0VXJscyhuZXh0U3RhdGUpWzBdO1xuXHRcdGNvbnN0IGN1cnJlbnRTb3VyY2VDb250cm9sU3RhdGUgPSByZWFkU2Vzc2lvblNvdXJjZUNvbnRyb2xTdGF0ZShjdXJyZW50TWV0YSk7XG5cdFx0Y29uc3QgbmV4dFNvdXJjZUNvbnRyb2xTdGF0ZSA9IG5leHRQdWxsUmVxdWVzdCAmJiBuZXh0UHVsbFJlcXVlc3QgIT09IGN1cnJlbnRQdWxsUmVxdWVzdFxuXHRcdFx0PyB7IC4uLmN1cnJlbnRTb3VyY2VDb250cm9sU3RhdGUsIGxhdGVzdE91dGNvbWU6IFNlc3Npb25Tb3VyY2VDb250cm9sT3V0Y29tZS5QdWxsUmVxdWVzdCB9IHNhdGlzZmllcyBJU2Vzc2lvblNvdXJjZUNvbnRyb2xTdGF0ZVxuXHRcdFx0OiBjdXJyZW50U291cmNlQ29udHJvbFN0YXRlO1xuXHRcdGNvbnN0IHNvdXJjZUNvbnRyb2xTdGF0ZUNoYW5nZWQgPSAhb2JqZWN0RXF1YWxzKGN1cnJlbnRTb3VyY2VDb250cm9sU3RhdGUsIG5leHRTb3VyY2VDb250cm9sU3RhdGUpO1xuXG5cdFx0aWYgKG9iamVjdEVxdWFscyhjdXJyZW50U3RhdGUsIG5leHRTdGF0ZSkgJiYgIXNvdXJjZUNvbnRyb2xTdGF0ZUNoYW5nZWQpIHtcblx0XHRcdGF3YWl0IHRoaXMuX3NhdmVTZXNzaW9uU3RhdGUoc2Vzc2lvbktleSwgTUVUQV9HSVRIVUJfU1RBVEUsIEpTT04uc3RyaW5naWZ5KG5leHRTdGF0ZSkpO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdC8vIFVwZGF0ZSBzZXNzaW9uIHN0YXRlIG1hbmFnZXJcblx0XHRjb25zdCBuZXh0TWV0YSA9IHdpdGhTZXNzaW9uU291cmNlQ29udHJvbFN0YXRlKHdpdGhTZXNzaW9uR2l0SHViU3RhdGUoY3VycmVudE1ldGEsIG5leHRTdGF0ZSksIG5leHRTb3VyY2VDb250cm9sU3RhdGUpO1xuXHRcdHRoaXMuX3N0YXRlTWFuYWdlci5zZXRTZXNzaW9uTWV0YShzZXNzaW9uS2V5LCBuZXh0TWV0YSk7XG5cdFx0dGhpcy5fb25EaWRDaGFuZ2VTZXNzaW9uR2l0SHViU3RhdGUuZmlyZShzZXNzaW9uS2V5KTtcblxuXHRcdC8vIFVwZGF0ZSBzZXNzaW9uIGRhdGFiYXNlXG5cdFx0YXdhaXQgdGhpcy5fc2F2ZVNlc3Npb25TdGF0ZShzZXNzaW9uS2V5LCBNRVRBX0dJVEhVQl9TVEFURSwgSlNPTi5zdHJpbmdpZnkobmV4dFN0YXRlKSk7XG5cdFx0aWYgKHNvdXJjZUNvbnRyb2xTdGF0ZUNoYW5nZWQgJiYgbmV4dFNvdXJjZUNvbnRyb2xTdGF0ZSkge1xuXHRcdFx0YXdhaXQgdGhpcy5fc2F2ZVNlc3Npb25TdGF0ZShzZXNzaW9uS2V5LCBNRVRBX1NPVVJDRV9DT05UUk9MX1NUQVRFLCBKU09OLnN0cmluZ2lmeShuZXh0U291cmNlQ29udHJvbFN0YXRlKSk7XG5cdFx0fVxuXHR9XG5cblx0YXN5bmMgcmVzb2x2ZVNlc3Npb25CYXNlQnJhbmNoTmFtZShzZXNzaW9uS2V5OiBzdHJpbmcpOiBQcm9taXNlPHN0cmluZyB8IHVuZGVmaW5lZD4ge1xuXHRcdGNvbnN0IHN0YXRlID0gdGhpcy5fc3RhdGVNYW5hZ2VyLmdldFNlc3Npb25TdGF0ZShzZXNzaW9uS2V5KTtcblx0XHRjb25zdCBjb25maWd1cmVkQnJhbmNoID0gc3RhdGU/LmNvbmZpZz8udmFsdWVzW1Nlc3Npb25Db25maWdLZXkuSXNvbGF0aW9uXSA9PT0gJ3dvcmt0cmVlJ1xuXHRcdFx0PyBzdGF0ZS5jb25maWcudmFsdWVzW1Nlc3Npb25Db25maWdLZXkuQnJhbmNoXVxuXHRcdFx0OiB1bmRlZmluZWQ7XG5cdFx0aWYgKHR5cGVvZiBjb25maWd1cmVkQnJhbmNoID09PSAnc3RyaW5nJyAmJiBjb25maWd1cmVkQnJhbmNoLnRyaW0oKSkge1xuXHRcdFx0cmV0dXJuIHJlc29sdmVEaWZmQmFzZUJyYW5jaE5hbWUoY29uZmlndXJlZEJyYW5jaC50cmltKCksIHVuZGVmaW5lZCk7XG5cdFx0fVxuXG5cdFx0Y29uc3QgZ2l0U3RhdGVCYXNlQnJhbmNoID0gcmVhZFNlc3Npb25HaXRTdGF0ZShzdGF0ZT8uX21ldGEpPy5iYXNlQnJhbmNoTmFtZTtcblx0XHRjb25zdCB3b3JraW5nRGlyZWN0b3J5ID0gc3RhdGU/LndvcmtpbmdEaXJlY3Rvcmllcz8uWzBdO1xuXHRcdGNvbnN0IHByb2plY3QgPSBzdGF0ZT8ucHJvamVjdD8udXJpO1xuXHRcdGlmICghd29ya2luZ0RpcmVjdG9yeSB8fCAhcHJvamVjdCB8fCBpc0VxdWFsKFVSSS5wYXJzZSh3b3JraW5nRGlyZWN0b3J5KSwgVVJJLnBhcnNlKHByb2plY3QpKSkge1xuXHRcdFx0cmV0dXJuIGdpdFN0YXRlQmFzZUJyYW5jaDtcblx0XHR9XG5cdFx0bGV0IGRhdGFiYXNlUmVmO1xuXHRcdHRyeSB7XG5cdFx0XHRkYXRhYmFzZVJlZiA9IGF3YWl0IHRoaXMuX3Nlc3Npb25EYXRhU2VydmljZS50cnlPcGVuRGF0YWJhc2UoVVJJLnBhcnNlKHNlc3Npb25LZXkpKTtcblx0XHR9IGNhdGNoIChlcnJvcikge1xuXHRcdFx0dGhpcy5fbG9nU2VydmljZS53YXJuKGBbQWdlbnRIb3N0R2l0U3RhdGVTZXJ2aWNlXSBGYWlsZWQgdG8gb3BlbiBzZXNzaW9uIGRhdGFiYXNlIHdoaWxlIHJlc29sdmluZyB0aGUgYmFzZSBicmFuY2ggZm9yICR7c2Vzc2lvbktleX1gLCBlcnJvcik7XG5cdFx0XHRyZXR1cm4gZ2l0U3RhdGVCYXNlQnJhbmNoO1xuXHRcdH1cblx0XHRpZiAoIWRhdGFiYXNlUmVmKSB7XG5cdFx0XHRyZXR1cm4gZ2l0U3RhdGVCYXNlQnJhbmNoO1xuXHRcdH1cblx0XHR0cnkge1xuXHRcdFx0cmV0dXJuIHJlc29sdmVEaWZmQmFzZUJyYW5jaE5hbWUoYXdhaXQgZGF0YWJhc2VSZWYub2JqZWN0LmdldE1ldGFkYXRhKE1FVEFfRElGRl9CQVNFX0JSQU5DSCksIGdpdFN0YXRlQmFzZUJyYW5jaCk7XG5cdFx0fSBjYXRjaCAoZXJyb3IpIHtcblx0XHRcdHRoaXMuX2xvZ1NlcnZpY2Uud2FybihgW0FnZW50SG9zdEdpdFN0YXRlU2VydmljZV0gRmFpbGVkIHRvIHJlYWQgdGhlIHBlcnNpc3RlZCBiYXNlIGJyYW5jaCBmb3IgJHtzZXNzaW9uS2V5fWAsIGVycm9yKTtcblx0XHRcdHJldHVybiBnaXRTdGF0ZUJhc2VCcmFuY2g7XG5cdFx0fSBmaW5hbGx5IHtcblx0XHRcdGRhdGFiYXNlUmVmLmRpc3Bvc2UoKTtcblx0XHR9XG5cdH1cblxuXHRhc3luYyByZWNvcmRTZXNzaW9uTWVyZ2Uoc2Vzc2lvbktleTogc3RyaW5nLCBjb21taXQ6IHN0cmluZyk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGNvbnN0IGN1cnJlbnRNZXRhID0gdGhpcy5fc3RhdGVNYW5hZ2VyLmdldFNlc3Npb25TdGF0ZShzZXNzaW9uS2V5KT8uX21ldGE7XG5cdFx0Y29uc3QgY3VycmVudFN0YXRlID0gcmVhZFNlc3Npb25Tb3VyY2VDb250cm9sU3RhdGUoY3VycmVudE1ldGEpO1xuXHRcdGNvbnN0IG5leHRTdGF0ZTogSVNlc3Npb25Tb3VyY2VDb250cm9sU3RhdGUgPSB7XG5cdFx0XHQuLi5jdXJyZW50U3RhdGUsXG5cdFx0XHRtZXJnZTogeyBjb21taXQgfSxcblx0XHRcdGxhdGVzdE91dGNvbWU6IFNlc3Npb25Tb3VyY2VDb250cm9sT3V0Y29tZS5NZXJnZSxcblx0XHR9O1xuXHRcdGlmIChvYmplY3RFcXVhbHMoY3VycmVudFN0YXRlLCBuZXh0U3RhdGUpKSB7XG5cdFx0XHRhd2FpdCB0aGlzLl9zYXZlU2Vzc2lvblN0YXRlKHNlc3Npb25LZXksIE1FVEFfU09VUkNFX0NPTlRST0xfU1RBVEUsIEpTT04uc3RyaW5naWZ5KG5leHRTdGF0ZSkpO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdHRoaXMuX3N0YXRlTWFuYWdlci5zZXRTZXNzaW9uTWV0YShzZXNzaW9uS2V5LCB3aXRoU2Vzc2lvblNvdXJjZUNvbnRyb2xTdGF0ZShjdXJyZW50TWV0YSwgbmV4dFN0YXRlKSk7XG5cdFx0YXdhaXQgdGhpcy5fc2F2ZVNlc3Npb25TdGF0ZShzZXNzaW9uS2V5LCBNRVRBX1NPVVJDRV9DT05UUk9MX1NUQVRFLCBKU09OLnN0cmluZ2lmeShuZXh0U3RhdGUpKTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgX3NldFNlc3Npb25HaXRTdGF0ZShzZXNzaW9uS2V5OiBzdHJpbmcsIGdpdFN0YXRlOiBJU2Vzc2lvbkdpdFN0YXRlKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Ly8gVXBkYXRlIHNlc3Npb24gc3RhdGUgbWFuYWdlclxuXHRcdGNvbnN0IGN1cnJlbnRNZXRhID0gdGhpcy5fc3RhdGVNYW5hZ2VyLmdldFNlc3Npb25TdGF0ZShzZXNzaW9uS2V5KT8uX21ldGE7XG5cdFx0Y29uc3QgbmV4dE1ldGEgPSB3aXRoU2Vzc2lvbkdpdFN0YXRlKGN1cnJlbnRNZXRhLCBnaXRTdGF0ZSk7XG5cdFx0dGhpcy5fc3RhdGVNYW5hZ2VyLnNldFNlc3Npb25NZXRhKHNlc3Npb25LZXksIG5leHRNZXRhKTtcblxuXHRcdC8vIFVwZGF0ZSBzZXNzaW9uIGRhdGFiYXNlXG5cdFx0YXdhaXQgdGhpcy5fc2F2ZVNlc3Npb25TdGF0ZShzZXNzaW9uS2V5LCBNRVRBX0dJVF9TVEFURSwgSlNPTi5zdHJpbmdpZnkoZ2l0U3RhdGUpKTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgX3NhdmVTZXNzaW9uU3RhdGUoc2Vzc2lvbktleTogc3RyaW5nLCBrZXk6IHN0cmluZywgdmFsdWU6IHN0cmluZyk6IFByb21pc2U8dm9pZD4ge1xuXHRcdC8vIFNraXAgc2F2aW5nIHNlc3Npb24gc3RhdGUgaWYgdGhlIHNlc3Npb24gaXMgbm90IG1hdGVyaWFsaXplZFxuXHRcdGNvbnN0IHN0YXRlID0gdGhpcy5fc3RhdGVNYW5hZ2VyLmdldFNlc3Npb25TdGF0ZShzZXNzaW9uS2V5KTtcblx0XHRpZiAoc3RhdGU/LmxpZmVjeWNsZSA9PT0gU2Vzc2lvbkxpZmVjeWNsZS5DcmVhdGluZykge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGxldCBkYXRhYmFzZVJlZjtcblx0XHR0cnkge1xuXHRcdFx0ZGF0YWJhc2VSZWYgPSB0aGlzLl9zZXNzaW9uRGF0YVNlcnZpY2Uub3BlbkRhdGFiYXNlKFVSSS5wYXJzZShzZXNzaW9uS2V5KSk7XG5cdFx0fSBjYXRjaCAoZXJyb3IpIHtcblx0XHRcdHRoaXMuX2xvZ1NlcnZpY2Uud2FybihgW0FnZW50SG9zdEdpdFN0YXRlU2VydmljZV1bX3NhdmVTZXNzaW9uU3RhdGVdIEZhaWxlZCB0byBvcGVuIHNlc3Npb24gZGF0YWJhc2UgZm9yICR7c2Vzc2lvbktleX1gLCBlcnJvcik7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0dHJ5IHtcblx0XHRcdGF3YWl0IGRhdGFiYXNlUmVmLm9iamVjdC5zZXRNZXRhZGF0YShrZXksIHZhbHVlKTtcblx0XHR9IGNhdGNoIChlcnJvcikge1xuXHRcdFx0dGhpcy5fbG9nU2VydmljZS53YXJuKGBbQWdlbnRIb3N0R2l0U3RhdGVTZXJ2aWNlXVtfc2F2ZVNlc3Npb25TdGF0ZV0gRmFpbGVkIHRvIHBlcnNpc3QgJHtrZXl9YCwgZXJyb3IpO1xuXHRcdH0gZmluYWxseSB7XG5cdFx0XHRkYXRhYmFzZVJlZi5kaXNwb3NlKCk7XG5cdFx0fVxuXHR9XG59XG4iXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7OztBQUtBLFNBQVMsVUFBVSxvQkFBb0I7QUFDdkMsU0FBUyxlQUFlO0FBQ3hCLFNBQVMsV0FBVztBQUNwQixTQUFTLGVBQWU7QUFDeEIsU0FBUyxtQkFBbUI7QUFDNUIsU0FBb0MsZ0JBQWdCLG1CQUFtQixpQ0FBaUM7QUFDeEcsU0FBUyxrQ0FBZ0Ysd0JBQXdCLHFCQUFxQiwrQkFBK0Isa0JBQWtCLDZCQUE2QiwrQkFBK0IsNENBQTRDLGtDQUFrQyx3QkFBd0IscUJBQXFCLHFDQUE2RjtBQUMzYyxTQUFTLDhCQUE4Qiw0QkFBNEIsd0JBQXdCO0FBQzNGLFNBQVMsa0NBQWtDLDhCQUE4QjtBQUN6RSxTQUFTLHNCQUFzQix1QkFBdUIseUJBQXlCLGlDQUFpQztBQUNoSCxTQUFnQyw4QkFBOEI7QUFDOUQsU0FBUywyQkFBMkI7QUFDcEMsU0FBNkIsZ0NBQWdDO0FBQzdELFNBQVMscUJBQXFCO0FBQzlCLFNBQVMsdUNBQXVDO0FBQ2hELFNBQVMsWUFBWSxvQkFBb0I7QUFDekMsU0FBUywrQkFBK0I7QUFDeEMsU0FBUyxnQkFBZ0IsZ0JBQWdCLGVBQWU7QUFDeEQsU0FBUywyQkFBMkI7QUFDcEMsU0FBUyx3QkFBd0I7QUFFakMsTUFBTSxzQ0FBc0MsSUFBSTtBQUV6QyxJQUFNLDJCQUFOLGNBQXVDLFdBQWdEO0FBQUEsRUFvQjdGLFlBQzBDLGVBQ0YsYUFDSSxpQkFDWCxlQUNrQix3QkFDcEIsYUFDUSxxQkFDckM7QUFDRCxVQUFNO0FBUm1DO0FBQ0Y7QUFDSTtBQUNYO0FBQ2tCO0FBQ3BCO0FBQ1E7QUF4QnZDLFNBQWlCLCtCQUErQixLQUFLLFVBQVUsSUFBSSxRQUFnQixDQUFDO0FBQ3BGLFNBQVMsOEJBQThCLEtBQUssNkJBQTZCO0FBRXpFLFNBQWlCLGlDQUFpQyxLQUFLLFVBQVUsSUFBSSxRQUFnQixDQUFDO0FBQ3RGLFNBQVMsZ0NBQWdDLEtBQUssK0JBQStCO0FBRTdFLFNBQWlCLDRCQUE0QixLQUFLLFVBQVUsSUFBSSxlQUF1QixDQUFDO0FBQ3hGLFNBQWlCLDBDQUEwQyxJQUFJLHdCQUF3QjtBQU92RjtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUEsU0FBaUIsd0JBQXdCLElBQUksZUFBdUI7QUFDcEUsU0FBaUIsOEJBQThCLElBQUksZ0JBQWdCO0FBYWxFLFNBQUssVUFBVSxhQUFhLE1BQU0sS0FBSyx3Q0FBd0MsUUFBUSxJQUFJLENBQUMsQ0FBQztBQUM3RixTQUFLLFVBQVUsYUFBYSxNQUFNLEtBQUssNEJBQTRCLE1BQU0sQ0FBQyxDQUFDO0FBQUEsRUFDNUU7QUFBQSxFQUVBLE1BQU0sK0JBQStCLFlBQW9CLGtCQUFrRDtBQUMxRyxVQUFNLEtBQUssdUJBQXVCLFlBQVksZ0JBQWdCO0FBQzlELFVBQU0sS0FBSyx3QkFBd0IsVUFBVTtBQUFBLEVBQzlDO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBLEVBT1Esd0JBQXdCLFlBQW1DO0FBQ2xFLFdBQU8sS0FBSyxzQkFBc0IsTUFBTSxZQUFZLE1BQU0sS0FBSyxnQ0FBZ0MsVUFBVSxDQUFDO0FBQUEsRUFDM0c7QUFBQSxFQUVBLE1BQWMsZ0NBQWdDLFlBQW1DO0FBQ2hGLFVBQU0sUUFBUSxLQUFLLGNBQWMsZ0JBQWdCLFVBQVU7QUFDM0QsUUFBSSxDQUFDLE9BQU87QUFDWDtBQUFBLElBQ0Q7QUFHQSxRQUFJLE1BQU0sY0FBYyxpQkFBaUIsT0FBTztBQUMvQztBQUFBLElBQ0Q7QUFHQSxVQUFNLGNBQWMsdUJBQXVCLEtBQUssY0FBYyxnQkFBZ0IsVUFBVSxHQUFHLEtBQUs7QUFDaEcsUUFBSSxDQUFDLGFBQWEsU0FBUyxDQUFDLGFBQWEsTUFBTTtBQUM5QztBQUFBLElBQ0Q7QUFHQSxVQUFNLFdBQVcsb0JBQW9CLE1BQU0sS0FBSztBQUNoRCxVQUFNLGFBQWEsVUFBVTtBQUM3QixRQUFJLENBQUMsY0FBZSxlQUFlLFVBQVUsZ0JBQWlCO0FBQzdEO0FBQUEsSUFDRDtBQU9BLFFBQUksWUFBWSwwQkFBMEIsWUFBWTtBQUNyRDtBQUFBLElBQ0Q7QUFFQSxRQUFJO0FBQ0gsWUFBTSxlQUFlLEtBQUssdUJBQXVCLGdCQUFnQjtBQUNqRSxZQUFNLFlBQVksS0FBSyxjQUFjLGFBQWE7QUFBQSxRQUNqRCxVQUFVLGFBQWE7QUFBQSxRQUN2QixRQUFRLGFBQWE7QUFBQSxNQUN0QixDQUFDO0FBQ0QsVUFBSSxDQUFDLFdBQVc7QUFDZjtBQUFBLE1BQ0Q7QUFFQSxZQUFNLEtBQUssTUFBTSxLQUFLLDRCQUE0QixPQUFPLFlBQVksT0FBTyxZQUFZLE1BQU0sVUFBVSxZQUFZLFNBQVM7QUFDN0gsWUFBTSxvQkFBb0Isb0JBQW9CLEtBQUssY0FBYyxnQkFBZ0IsVUFBVSxHQUFHLEtBQUssR0FBRztBQUN0RyxVQUFJLHNCQUFzQixZQUFZO0FBQ3JDO0FBQUEsTUFDRDtBQUVBLFlBQU0sZUFBZSxLQUFLLGNBQWMsZ0JBQWdCLFVBQVU7QUFDbEUsVUFBSSxDQUFDLGNBQWM7QUFDbEI7QUFBQSxNQUNEO0FBQ0EsWUFBTSxxQkFBcUIsdUJBQXVCLGFBQWEsS0FBSztBQUNwRSxVQUFJLENBQUMsSUFBSSxLQUFLO0FBQ2IsWUFBSSxLQUFLLGlCQUFpQixjQUFjLGtCQUFrQixLQUFLLG9CQUFvQiwyQkFBMkIsUUFBVztBQUN4SCxnQkFBTSxLQUFLLHNCQUFzQixZQUFZLDhCQUE4QixrQkFBa0IsQ0FBQztBQUFBLFFBQy9GO0FBQ0EsYUFBSyxZQUFZLE1BQU0sd0ZBQXdGLFVBQVUsY0FBYyxVQUFVLEVBQUU7QUFDbko7QUFBQSxNQUNEO0FBRUEsVUFBSSxrQkFBa0IsaUNBQWlDLG9CQUFvQixHQUFHLEtBQUssVUFBVTtBQUM3RixVQUFJLEtBQUssMkJBQTJCLFlBQVksY0FBYyxvQkFBb0IsRUFBRSxHQUFHO0FBQ3RGLDBCQUFrQjtBQUFBLFVBQ2pCLEdBQUc7QUFBQSxVQUNILEdBQUcsOEJBQThCLG9CQUFvQixHQUFHLEdBQUc7QUFBQSxRQUM1RDtBQUFBLE1BQ0QsV0FBVyxLQUFLLGlCQUFpQixjQUFjLGtCQUFrQixLQUFLLG9CQUFvQiwyQkFBMkIsUUFBVztBQUMvSCwwQkFBa0I7QUFBQSxVQUNqQixHQUFHO0FBQUEsVUFDSCxHQUFHLDhCQUE4QixrQkFBa0I7QUFBQSxRQUNwRDtBQUFBLE1BQ0Q7QUFDQSxZQUFNLEtBQUssc0JBQXNCLFlBQVksZUFBZTtBQUFBLElBQzdELFNBQVMsT0FBTztBQUNmLFdBQUssWUFBWSxLQUFLLDhGQUE4RixVQUFVLElBQUksS0FBSztBQUFBLElBQ3hJO0FBQUEsRUFDRDtBQUFBLEVBRVEsMkJBQTJCLFlBQW9CLE9BQWdDLGFBQThDLGFBQTBDO0FBQzlLLFFBQUksQ0FBQyxLQUFLLGlCQUFpQixPQUFPLFdBQVcsS0FBSyxpQ0FBaUMsV0FBVyxFQUFFLEtBQUssU0FBTyxJQUFJLFlBQVksTUFBTSxZQUFZLElBQUksWUFBWSxDQUFDLEdBQUc7QUFDakssYUFBTztBQUFBLElBQ1I7QUFDQSxRQUFJLFlBQVksY0FBYyxRQUFXO0FBQ3hDLFlBQU0sZUFBZSxLQUFLLE1BQU0sS0FBSyxjQUFjLGtCQUFrQixVQUFVLEdBQUcsYUFBYSxFQUFFO0FBQ2pHLGFBQU8sT0FBTyxNQUFNLFlBQVksS0FBSyxZQUFZLFlBQVksZUFBZTtBQUFBLElBQzdFO0FBQ0EsV0FBTyxhQUFhLDJCQUEyQjtBQUFBLEVBQ2hEO0FBQUEsRUFFUSxpQkFBaUIsT0FBZ0MsYUFBdUQ7QUFDL0csV0FBTyxNQUFNLFFBQVEsT0FBTyxpQkFBaUIsU0FBUyxNQUFNLFlBQ3hELGFBQWEsMkJBQTJCO0FBQUEsRUFDN0M7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUEsRUFPQSxNQUFjLDRCQUE0QixPQUFnQyxPQUFlLE1BQWMsVUFBd0MsWUFBb0IsV0FBNEQ7QUFDOU4sVUFBTSxTQUFTLEtBQUssNEJBQTRCO0FBR2hELFVBQU0sa0JBQWtCLFVBQVU7QUFDbEMsVUFBTSxpQkFBaUIsa0JBQWtCLHdCQUF3QixVQUFVLGtCQUFrQixJQUFJO0FBQ2pHLFVBQU0sYUFBYSxnQkFBZ0IsVUFBVTtBQUM3QyxVQUFNLFlBQVksbUJBQW1CO0FBRXJDLFVBQU0sc0JBQXNCLE1BQU0sS0FBSyxnQkFBZ0IsNEJBQTRCLE9BQU8sTUFBTSxZQUFZLFdBQVcsUUFBUSxTQUFTO0FBQ3hJLFFBQUkscUJBQXFCO0FBQ3hCLGFBQU87QUFBQSxJQUNSO0FBRUEsVUFBTSxtQkFBbUIsTUFBTSxxQkFBcUIsQ0FBQztBQUNyRCxRQUFJLENBQUMsa0JBQWtCO0FBQ3RCLGFBQU87QUFBQSxJQUNSO0FBRUEsVUFBTSxVQUFVLE1BQU0sS0FBSyxZQUFZLFNBQVMsSUFBSSxNQUFNLGdCQUFnQixHQUFHLE1BQU07QUFDbkYsV0FBTyxVQUNKLEtBQUssZ0JBQWdCLHlCQUF5QixPQUFPLE1BQU0sU0FBUyxXQUFXLE1BQU0sSUFDckY7QUFBQSxFQUNKO0FBQUEsRUFFQSxNQUFNLDhCQUE4QixZQUFvQixNQUE2QjtBQUNwRixVQUFNLGVBQWUsdUJBQXVCLEtBQUssY0FBYyxnQkFBZ0IsVUFBVSxHQUFHLEtBQUs7QUFDakcsVUFBTSxrQkFBa0IsMkJBQTJCLElBQUk7QUFDdkQsVUFBTSxhQUFhLGNBQWMsU0FBUyxhQUFhLE9BQU8sRUFBRSxPQUFPLGFBQWEsT0FBTyxNQUFNLGFBQWEsS0FBSyxJQUFJO0FBQ3ZILFVBQU0sYUFBYSxLQUFLLHVCQUF1QixrQkFBa0IsS0FBSztBQUN0RSxVQUFNLHdCQUF3QixpQ0FBaUMsTUFBTSxZQUFZLFVBQVUsRUFDekYsT0FBTyxlQUFhLENBQUMsY0FBYyxVQUFVLE1BQU0sWUFBWSxNQUFNLFdBQVcsTUFBTSxZQUFZLEtBQUssVUFBVSxLQUFLLFlBQVksTUFBTSxXQUFXLEtBQUssWUFBWSxDQUFDO0FBQ3ZLLFFBQUksZ0JBQWdCLFdBQVcsS0FBSyxzQkFBc0IsV0FBVyxHQUFHO0FBQ3ZFO0FBQUEsSUFDRDtBQUVBLFVBQU0sbUJBQW1CLGNBQWMsYUFBYSxDQUFDO0FBQ3JELFVBQU0sZ0JBQWdCLENBQUMsR0FBRyxnQkFBZ0I7QUFDMUMsZUFBVyxhQUFhLGlCQUFpQjtBQUN4QyxZQUFNLE1BQU0saUJBQWlCLFNBQVM7QUFDdEMsVUFBSSxDQUFDLGNBQWMsU0FBUyxHQUFHLEdBQUc7QUFDakMsc0JBQWMsS0FBSyxHQUFHO0FBQUEsTUFDdkI7QUFBQSxJQUNEO0FBRUEsUUFBSSxZQUFpQyxnQkFBZ0IsU0FBUyxJQUMzRCxFQUFFLFdBQVcsY0FBYyxNQUFNLEdBQUcsNEJBQTRCLEVBQUUsSUFDbEUsQ0FBQztBQUNKLGFBQVMsUUFBUSxzQkFBc0IsU0FBUyxHQUFHLFNBQVMsR0FBRyxTQUFTO0FBQ3ZFLFlBQU0sWUFBWSxzQkFBc0IsS0FBSztBQUM3QyxZQUFNLE1BQU0sdUJBQXVCLFdBQVcsVUFBVTtBQUN4RCxrQkFBWTtBQUFBLFFBQ1gsR0FBRztBQUFBLFFBQ0gsR0FBRywyQ0FBMkMsRUFBRSxHQUFHLGNBQWMsR0FBRyxVQUFVLEdBQUcsR0FBRztBQUFBLE1BQ3JGO0FBQUEsSUFDRDtBQUNBLFVBQU0sS0FBSyxzQkFBc0IsWUFBWSxTQUFTO0FBQUEsRUFDdkQ7QUFBQSxFQUVBLE1BQU0sdUJBQXVCLFlBQW9CLGtCQUFrRDtBQUNsRyxVQUFNLGVBQWUsS0FBSyxjQUFjLGdCQUFnQixVQUFVO0FBQ2xFLFFBQUksY0FBYyxjQUFjLGlCQUFpQixnQkFBZ0I7QUFDaEU7QUFBQSxJQUNEO0FBRUEsUUFBSSxDQUFDLGtCQUFrQjtBQUN0QixZQUFNLHNCQUFzQixjQUFjLHFCQUFxQixDQUFDO0FBQ2hFLFVBQUkscUJBQXFCO0FBQ3hCLDJCQUFtQixJQUFJLE1BQU0sbUJBQW1CO0FBQUEsTUFDakQ7QUFBQSxJQUNEO0FBRUEsUUFBSSxDQUFDLGtCQUFrQjtBQUN0QjtBQUFBLElBQ0Q7QUFFQSxVQUFNLEtBQUssMEJBQTBCLE1BQU0sWUFBWSxZQUFZO0FBQ2xFLFVBQUk7QUFDSCxhQUFLLFlBQVksTUFBTSwrRUFBK0UsVUFBVSxLQUFLLGtCQUFrQixNQUFNLEVBQUU7QUFFL0ksY0FBTSxpQkFBaUIsTUFBTSxLQUFLLDZCQUE2QixVQUFVO0FBQ3pFLGNBQU0sV0FBVyxNQUFNLEtBQUssWUFBWSxtQkFBbUIsa0JBQWtCLGNBQWM7QUFDM0YsWUFBSSxVQUFVO0FBQ2IsZ0JBQU0sY0FBYyxLQUFLLGNBQWMsZ0JBQWdCLFVBQVUsR0FBRztBQUNwRSxnQkFBTSxtQkFBbUIsb0JBQW9CLFdBQVc7QUFDeEQsZ0JBQU0sa0JBQWtCLENBQUMsYUFBYSxrQkFBa0IsUUFBUTtBQUNoRSxjQUFJLGlCQUFpQjtBQUVwQixrQkFBTSxLQUFLLG9CQUFvQixZQUFZLFFBQVE7QUFBQSxVQUNwRDtBQUVBLGNBQUksU0FBUyxlQUFlLFNBQVMsWUFBWTtBQUNoRCxrQkFBTSxxQkFBcUIsdUJBQXVCLFdBQVc7QUFDN0QsZ0JBQUksb0JBQW9CLFVBQVUsU0FBUyxlQUFlLG1CQUFtQixTQUFTLFNBQVMsWUFBWTtBQUMxRyxvQkFBTSxLQUFLLHNCQUFzQixZQUFZO0FBQUEsZ0JBQzVDLE9BQU8sU0FBUztBQUFBLGdCQUNoQixNQUFNLFNBQVM7QUFBQSxjQUNoQixDQUErQjtBQUFBLFlBQ2hDO0FBU0EsZ0JBQUksbUJBQW1CLGtCQUFrQixlQUFlLFNBQVMsWUFBWTtBQUM1RSxvQkFBTSxLQUFLLHdCQUF3QixVQUFVO0FBQUEsWUFDOUM7QUFBQSxVQUNEO0FBQUEsUUFDRDtBQUVBLGFBQUssNkJBQTZCLEtBQUssVUFBVTtBQU1qRCxjQUFNLFFBQVEsS0FBTyxLQUFLLHdDQUF3QyxLQUFLO0FBQUEsTUFDeEUsU0FBUyxPQUFPO0FBQ2YsWUFBSSxvQkFBb0IsS0FBSyxHQUFHO0FBQy9CO0FBQUEsUUFDRDtBQUVBLGFBQUssWUFBWSxLQUFLLHNGQUFzRixVQUFVLEtBQUssS0FBSztBQUFBLE1BQ2pJO0FBQUEsSUFDRCxDQUFDO0FBQUEsRUFDRjtBQUFBLEVBRUEsTUFBTSxzQkFBc0IsWUFBb0IsT0FBMkM7QUFDMUYsVUFBTSxjQUFjLEtBQUssY0FBYyxnQkFBZ0IsVUFBVSxHQUFHO0FBRXBFLFVBQU0sZUFBZSx1QkFBdUIsV0FBVztBQUN2RCxVQUFNLFlBQVksRUFBRSxHQUFJLGdCQUFnQixDQUFDLEdBQUksR0FBRyxNQUFNO0FBQ3RELFVBQU0scUJBQXFCLGlDQUFpQyxZQUFZLEVBQUUsQ0FBQztBQUMzRSxVQUFNLGtCQUFrQixpQ0FBaUMsU0FBUyxFQUFFLENBQUM7QUFDckUsVUFBTSw0QkFBNEIsOEJBQThCLFdBQVc7QUFDM0UsVUFBTSx5QkFBeUIsbUJBQW1CLG9CQUFvQixxQkFDbkUsRUFBRSxHQUFHLDJCQUEyQixlQUFlLDRCQUE0QixZQUFZLElBQ3ZGO0FBQ0gsVUFBTSw0QkFBNEIsQ0FBQyxhQUFhLDJCQUEyQixzQkFBc0I7QUFFakcsUUFBSSxhQUFhLGNBQWMsU0FBUyxLQUFLLENBQUMsMkJBQTJCO0FBQ3hFLFlBQU0sS0FBSyxrQkFBa0IsWUFBWSxtQkFBbUIsS0FBSyxVQUFVLFNBQVMsQ0FBQztBQUNyRjtBQUFBLElBQ0Q7QUFHQSxVQUFNLFdBQVcsOEJBQThCLHVCQUF1QixhQUFhLFNBQVMsR0FBRyxzQkFBc0I7QUFDckgsU0FBSyxjQUFjLGVBQWUsWUFBWSxRQUFRO0FBQ3RELFNBQUssK0JBQStCLEtBQUssVUFBVTtBQUduRCxVQUFNLEtBQUssa0JBQWtCLFlBQVksbUJBQW1CLEtBQUssVUFBVSxTQUFTLENBQUM7QUFDckYsUUFBSSw2QkFBNkIsd0JBQXdCO0FBQ3hELFlBQU0sS0FBSyxrQkFBa0IsWUFBWSwyQkFBMkIsS0FBSyxVQUFVLHNCQUFzQixDQUFDO0FBQUEsSUFDM0c7QUFBQSxFQUNEO0FBQUEsRUFFQSxNQUFNLDZCQUE2QixZQUFpRDtBQUNuRixVQUFNLFFBQVEsS0FBSyxjQUFjLGdCQUFnQixVQUFVO0FBQzNELFVBQU0sbUJBQW1CLE9BQU8sUUFBUSxPQUFPLGlCQUFpQixTQUFTLE1BQU0sYUFDNUUsTUFBTSxPQUFPLE9BQU8saUJBQWlCLE1BQU0sSUFDM0M7QUFDSCxRQUFJLE9BQU8scUJBQXFCLFlBQVksaUJBQWlCLEtBQUssR0FBRztBQUNwRSxhQUFPLDBCQUEwQixpQkFBaUIsS0FBSyxHQUFHLE1BQVM7QUFBQSxJQUNwRTtBQUVBLFVBQU0scUJBQXFCLG9CQUFvQixPQUFPLEtBQUssR0FBRztBQUM5RCxVQUFNLG1CQUFtQixPQUFPLHFCQUFxQixDQUFDO0FBQ3RELFVBQU0sVUFBVSxPQUFPLFNBQVM7QUFDaEMsUUFBSSxDQUFDLG9CQUFvQixDQUFDLFdBQVcsUUFBUSxJQUFJLE1BQU0sZ0JBQWdCLEdBQUcsSUFBSSxNQUFNLE9BQU8sQ0FBQyxHQUFHO0FBQzlGLGFBQU87QUFBQSxJQUNSO0FBQ0EsUUFBSTtBQUNKLFFBQUk7QUFDSCxvQkFBYyxNQUFNLEtBQUssb0JBQW9CLGdCQUFnQixJQUFJLE1BQU0sVUFBVSxDQUFDO0FBQUEsSUFDbkYsU0FBUyxPQUFPO0FBQ2YsV0FBSyxZQUFZLEtBQUssa0dBQWtHLFVBQVUsSUFBSSxLQUFLO0FBQzNJLGFBQU87QUFBQSxJQUNSO0FBQ0EsUUFBSSxDQUFDLGFBQWE7QUFDakIsYUFBTztBQUFBLElBQ1I7QUFDQSxRQUFJO0FBQ0gsYUFBTywwQkFBMEIsTUFBTSxZQUFZLE9BQU8sWUFBWSxxQkFBcUIsR0FBRyxrQkFBa0I7QUFBQSxJQUNqSCxTQUFTLE9BQU87QUFDZixXQUFLLFlBQVksS0FBSywyRUFBMkUsVUFBVSxJQUFJLEtBQUs7QUFDcEgsYUFBTztBQUFBLElBQ1IsVUFBRTtBQUNELGtCQUFZLFFBQVE7QUFBQSxJQUNyQjtBQUFBLEVBQ0Q7QUFBQSxFQUVBLE1BQU0sbUJBQW1CLFlBQW9CLFFBQStCO0FBQzNFLFVBQU0sY0FBYyxLQUFLLGNBQWMsZ0JBQWdCLFVBQVUsR0FBRztBQUNwRSxVQUFNLGVBQWUsOEJBQThCLFdBQVc7QUFDOUQsVUFBTSxZQUF3QztBQUFBLE1BQzdDLEdBQUc7QUFBQSxNQUNILE9BQU8sRUFBRSxPQUFPO0FBQUEsTUFDaEIsZUFBZSw0QkFBNEI7QUFBQSxJQUM1QztBQUNBLFFBQUksYUFBYSxjQUFjLFNBQVMsR0FBRztBQUMxQyxZQUFNLEtBQUssa0JBQWtCLFlBQVksMkJBQTJCLEtBQUssVUFBVSxTQUFTLENBQUM7QUFDN0Y7QUFBQSxJQUNEO0FBRUEsU0FBSyxjQUFjLGVBQWUsWUFBWSw4QkFBOEIsYUFBYSxTQUFTLENBQUM7QUFDbkcsVUFBTSxLQUFLLGtCQUFrQixZQUFZLDJCQUEyQixLQUFLLFVBQVUsU0FBUyxDQUFDO0FBQUEsRUFDOUY7QUFBQSxFQUVBLE1BQWMsb0JBQW9CLFlBQW9CLFVBQTJDO0FBRWhHLFVBQU0sY0FBYyxLQUFLLGNBQWMsZ0JBQWdCLFVBQVUsR0FBRztBQUNwRSxVQUFNLFdBQVcsb0JBQW9CLGFBQWEsUUFBUTtBQUMxRCxTQUFLLGNBQWMsZUFBZSxZQUFZLFFBQVE7QUFHdEQsVUFBTSxLQUFLLGtCQUFrQixZQUFZLGdCQUFnQixLQUFLLFVBQVUsUUFBUSxDQUFDO0FBQUEsRUFDbEY7QUFBQSxFQUVBLE1BQWMsa0JBQWtCLFlBQW9CLEtBQWEsT0FBOEI7QUFFOUYsVUFBTSxRQUFRLEtBQUssY0FBYyxnQkFBZ0IsVUFBVTtBQUMzRCxRQUFJLE9BQU8sY0FBYyxpQkFBaUIsVUFBVTtBQUNuRDtBQUFBLElBQ0Q7QUFFQSxRQUFJO0FBQ0osUUFBSTtBQUNILG9CQUFjLEtBQUssb0JBQW9CLGFBQWEsSUFBSSxNQUFNLFVBQVUsQ0FBQztBQUFBLElBQzFFLFNBQVMsT0FBTztBQUNmLFdBQUssWUFBWSxLQUFLLHFGQUFxRixVQUFVLElBQUksS0FBSztBQUM5SDtBQUFBLElBQ0Q7QUFFQSxRQUFJO0FBQ0gsWUFBTSxZQUFZLE9BQU8sWUFBWSxLQUFLLEtBQUs7QUFBQSxJQUNoRCxTQUFTLE9BQU87QUFDZixXQUFLLFlBQVksS0FBSyxtRUFBbUUsR0FBRyxJQUFJLEtBQUs7QUFBQSxJQUN0RyxVQUFFO0FBQ0Qsa0JBQVksUUFBUTtBQUFBLElBQ3JCO0FBQUEsRUFDRDtBQUNEO0FBM1lhLDJCQUFOO0FBQUEsRUFxQko7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxHQTNCVTsiLAogICJuYW1lcyI6IFtdCn0K
