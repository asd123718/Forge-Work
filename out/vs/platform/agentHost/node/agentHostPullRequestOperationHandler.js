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
import { URI } from "../../../base/common/uri.js";
import { localize } from "../../../nls.js";
import { IAgentService } from "../common/agentService.js";
import { IAgentHostGitHubEndpointService } from "./agentHostGitHubEndpointService.js";
import { parseChangesetUri } from "../common/changesetUri.js";
import { AHP_AUTH_REQUIRED, AHP_SESSION_NOT_FOUND, JsonRpcErrorCodes, ProtocolError } from "../common/state/sessionProtocol.js";
import { readSessionGitHubState, readSessionGitState } from "../common/state/sessionState.js";
import { ILogService } from "../../log/common/log.js";
import { IAgentHostGitService, parseUpstreamBranchName } from "../common/agentHostGitService.js";
import { IAgentHostOctoKitService } from "./shared/agentHostOctoKitService.js";
import { ICopilotApiService } from "./shared/copilotApiService.js";
import { buildConversationContext } from "../common/agentHostConversationContext.js";
const MAX_PR_CONVERSATION_CONTEXT_CHARS = 12e3;
const MAX_PR_CHANGE_SUMMARY_CHARS = 4e3;
let AgentHostPullRequestOperationHandler = class {
  constructor(_draft, _autoMergeMethod, _getSessionState, _resolveBaseBranchName, _onPullRequestCreated, _agentService, _gitService, _octoKitService, _gitHubEndpointService, _copilotApiService, _logService) {
    this._draft = _draft;
    this._autoMergeMethod = _autoMergeMethod;
    this._getSessionState = _getSessionState;
    this._resolveBaseBranchName = _resolveBaseBranchName;
    this._onPullRequestCreated = _onPullRequestCreated;
    this._agentService = _agentService;
    this._gitService = _gitService;
    this._octoKitService = _octoKitService;
    this._gitHubEndpointService = _gitHubEndpointService;
    this._copilotApiService = _copilotApiService;
    this._logService = _logService;
  }
  async invoke(params, token) {
    const abortController = new AbortController();
    if (token.isCancellationRequested) {
      abortController.abort();
    }
    const cancellationListener = token.onCancellationRequested(() => abortController.abort());
    try {
      return await this._invoke(params, token, abortController.signal);
    } finally {
      cancellationListener.dispose();
    }
  }
  async _invoke(params, token, signal) {
    const parsed = parseChangesetUri(params.channel);
    if (!parsed) {
      throw new ProtocolError(JsonRpcErrorCodes.InvalidParams, `Not a changeset URI: ${params.channel}`);
    }
    this._throwIfCancelled(token);
    const sessionUri = parsed.sessionUri;
    const sessionState = this._getSessionState(sessionUri);
    if (!sessionState) {
      throw new ProtocolError(AHP_SESSION_NOT_FOUND, `Session not found: ${sessionUri}`);
    }
    const workingDirectoryStr = sessionState.workingDirectories?.[0];
    if (!workingDirectoryStr) {
      throw new ProtocolError(JsonRpcErrorCodes.InternalError, `Session has no working directory: ${sessionUri}`);
    }
    const gitHubState = readSessionGitHubState(sessionState._meta);
    if (!gitHubState?.owner || !gitHubState?.repo) {
      throw new ProtocolError(
        JsonRpcErrorCodes.InternalError,
        `Session's working directory is not a GitHub-backed git repo: ${sessionUri}`
      );
    }
    const workingDirectory = URI.parse(workingDirectoryStr);
    const storedGitState = readSessionGitState(sessionState._meta);
    const effectiveBaseBranch = await this._resolveBaseBranchName(sessionUri);
    const gitState = await this._gitService.getSessionGitState(workingDirectory, effectiveBaseBranch) ?? storedGitState;
    const branchName = gitState?.branchName ?? await this._gitService.getCurrentBranch(workingDirectory);
    if (!branchName) {
      throw new ProtocolError(JsonRpcErrorCodes.InternalError, `Could not determine current branch for ${workingDirectory}`);
    }
    const baseBranchName = effectiveBaseBranch ?? gitState?.baseBranchName ?? (await this._gitService.getDefaultBranch(workingDirectory))?.name;
    if (!baseBranchName) {
      throw new ProtocolError(JsonRpcErrorCodes.InternalError, `Could not determine base branch for ${workingDirectory}`);
    }
    const base = baseBranchName;
    const repoResource = this._gitHubEndpointService.getRepoResource();
    const authToken = this._agentService.getAuthToken({
      resource: repoResource.resource,
      scopes: repoResource.scopes_supported
    });
    if (!authToken) {
      throw new ProtocolError(
        AHP_AUTH_REQUIRED,
        localize("agentHost.changeset.pr.authRequired", "Sign in to GitHub with repository access to create a pull request."),
        [repoResource]
      );
    }
    const hasUncommitted = await this._gitService.hasUncommittedChanges(workingDirectory);
    if (hasUncommitted) {
      this._throwIfCancelled(token);
      this._logService.info(`[AgentHostPullRequestOperationHandler] Committing uncommitted changes for session ${sessionUri}`);
      try {
        await this._gitService.commitAll(workingDirectory, this._formatCommitMessage(branchName));
      } catch (err) {
        this._throwIfCancelled(token);
        throw new ProtocolError(JsonRpcErrorCodes.InternalError, `Failed to commit changes before creating a pull request: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
    this._throwIfCancelled(token);
    const branchChanges = await this._gitService.computeSessionFileDiffs(workingDirectory, { sessionUri, baseBranch: base });
    if (branchChanges === void 0) {
      throw new ProtocolError(JsonRpcErrorCodes.InternalError, localize("agentHost.changeset.pr.computeChangesFailed", "Could not compute branch changes to create a pull request."));
    }
    if (branchChanges !== void 0 && branchChanges.length === 0) {
      throw new ProtocolError(JsonRpcErrorCodes.InternalError, localize("agentHost.changeset.pr.noChanges", "There are no branch changes to create a pull request for."));
    }
    this._throwIfCancelled(token);
    const githubHeadOwner = gitState?.githubHeadOwner;
    const upstreamBranch = githubHeadOwner ? parseUpstreamBranchName(gitState.upstreamBranchName) : void 0;
    const headOwner = upstreamBranch && githubHeadOwner ? githubHeadOwner : gitHubState.owner;
    const headBranch = upstreamBranch?.branch ?? branchName;
    const pushRef = headBranch === branchName ? branchName : `${branchName}:${headBranch}`;
    const createHead = headOwner === gitHubState.owner ? headBranch : `${headOwner}:${headBranch}`;
    this._logService.info(`[AgentHostPullRequestOperationHandler] Pushing branch ${branchName} to ${upstreamBranch?.remote ?? "origin"} for session ${sessionUri}`);
    const upstreamPresent = await this._gitService.hasUpstream(workingDirectory, branchName);
    this._throwIfCancelled(token);
    try {
      await this._gitService.push(workingDirectory, { remote: upstreamBranch?.remote, ref: pushRef, setUpstream: !upstreamPresent });
    } catch (err) {
      this._throwIfCancelled(token);
      throw new ProtocolError(JsonRpcErrorCodes.InternalError, `Failed to push branch '${branchName}': ${err instanceof Error ? err.message : String(err)}`);
    }
    this._throwIfCancelled(token);
    const existing = await this._octoKitService.findPullRequestByHeadBranch(gitHubState.owner, gitHubState.repo, headBranch, authToken, signal, headOwner);
    if (existing) {
      this._throwIfCancelled(token);
      return await this._finalize(existing, true, sessionUri, gitHubState.owner, gitHubState.repo, branchName, authToken, signal, token);
    }
    this._throwIfCancelled(token);
    const generated = await this._generateTitleAndDescription(sessionState, branchName, base, branchChanges, signal, token);
    this._throwIfCancelled(token);
    const title = generated?.title ?? this._formatTitle(branchName);
    const body = generated?.description ?? this._formatBody(branchName, base);
    this._logService.info(`[AgentHostPullRequestOperationHandler] Creating ${this._draft ? "draft " : ""}PR ${gitHubState.owner}/${gitHubState.repo} ${createHead} -> ${base}`);
    let created;
    try {
      created = await this._octoKitService.createPullRequest(
        gitHubState.owner,
        gitHubState.repo,
        title,
        body,
        createHead,
        base,
        this._draft,
        authToken,
        signal
      );
    } catch (err) {
      this._throwIfCancelled(token);
      let foundAfterFailure;
      try {
        foundAfterFailure = await this._octoKitService.findPullRequestByHeadBranch(gitHubState.owner, gitHubState.repo, headBranch, authToken, signal, headOwner);
      } catch {
        this._throwIfCancelled(token);
        throw err;
      }
      if (foundAfterFailure) {
        this._throwIfCancelled(token);
        return await this._finalize(foundAfterFailure, true, sessionUri, gitHubState.owner, gitHubState.repo, branchName, authToken, signal, token);
      }
      throw err;
    }
    this._throwIfCancelled(token);
    return await this._finalize(created, false, sessionUri, gitHubState.owner, gitHubState.repo, branchName, authToken, signal, token);
  }
  /**
   * Notifies listeners that the pull request now exists, optionally enables
   * auto-merge with the configured {@link AutoMergeMethod} (best-effort: a
   * failure to enable auto-merge does not fail the operation), and builds the
   * result message describing what happened.
   */
  async _finalize(pr, isExisting, sessionUri, owner, repo, branchName, authToken, signal, token) {
    if (!this._autoMergeMethod) {
      this._onPullRequestCreated({ sessionKey: sessionUri, pullRequestUrl: pr.url, branchName });
      return this._createResult(pr, this._buildMessage(pr, isExisting, "none", void 0));
    }
    let autoMergeError;
    let autoMergeOutcome = "none";
    if (pr.nodeId) {
      try {
        await this._octoKitService.enablePullRequestAutoMerge(pr.nodeId, this._autoMergeMethod, authToken, signal);
        autoMergeOutcome = "enabled";
      } catch (err) {
        this._throwIfCancelled(token);
        autoMergeError = err instanceof Error ? err.message : String(err);
        autoMergeOutcome = "failed";
        this._logService.warn(`[AgentHostPullRequestOperationHandler] Failed to enable auto-merge for ${owner}/${repo}#${pr.number}: ${autoMergeError}`);
      }
    } else {
      autoMergeError = localize("agentHost.changeset.pr.autoMerge.noNodeId", "the pull request identifier was not returned by GitHub.");
      autoMergeOutcome = "failed";
      this._logService.warn(`[AgentHostPullRequestOperationHandler] Cannot enable auto-merge for ${owner}/${repo}#${pr.number}: missing pull request node id`);
    }
    this._onPullRequestCreated({ sessionKey: sessionUri, pullRequestUrl: pr.url, branchName });
    return this._createResult(pr, this._buildMessage(pr, isExisting, autoMergeOutcome, autoMergeError));
  }
  _buildMessage(pr, isExisting, autoMergeOutcome, autoMergeError) {
    let mergeMethodLabel;
    switch (this._autoMergeMethod) {
      case "SQUASH":
        mergeMethodLabel = localize("agentHost.changeset.pr.autoMerge.squash", "squash");
        break;
      case "REBASE":
        mergeMethodLabel = localize("agentHost.changeset.pr.autoMerge.rebase", "rebase");
        break;
      default:
        mergeMethodLabel = localize("agentHost.changeset.pr.autoMerge.merge", "merge");
        break;
    }
    if (isExisting) {
      switch (autoMergeOutcome) {
        case "enabled":
          return localize("agentHost.changeset.pr.existing.autoMerge", "Pull request [#{0}]({1}) already exists; enabled auto-merge ({2}).", pr.number, pr.url, mergeMethodLabel);
        case "failed":
          return localize("agentHost.changeset.pr.existing.autoMergeFailed", "Pull request [#{0}]({1}) already exists, but auto-merge could not be enabled: {2}", pr.number, pr.url, autoMergeError ?? "");
        default:
          return localize("agentHost.changeset.pr.existing", "Pull request [#{0}]({1}) already exists.", pr.number, pr.url);
      }
    }
    switch (autoMergeOutcome) {
      case "enabled":
        return localize("agentHost.changeset.pr.created.autoMerge", "Created pull request [#{0}]({1}) with auto-merge ({2}) enabled.", pr.number, pr.url, mergeMethodLabel);
      case "failed":
        return localize("agentHost.changeset.pr.created.autoMergeFailed", "Created pull request [#{0}]({1}), but auto-merge could not be enabled: {2}", pr.number, pr.url, autoMergeError ?? "");
      default:
        return this._draft ? localize("agentHost.changeset.pr.createdDraft", "Created draft pull request [#{0}]({1}).", pr.number, pr.url) : localize("agentHost.changeset.pr.created", "Created pull request [#{0}]({1}).", pr.number, pr.url);
    }
  }
  _throwIfCancelled(token) {
    if (token.isCancellationRequested) {
      throw new ProtocolError(JsonRpcErrorCodes.InternalError, localize("agentHost.changeset.pr.cancelled", "Pull request operation was cancelled."));
    }
  }
  _formatTitle(branchName) {
    const idx = branchName.indexOf("/");
    if (idx > 0 && idx < branchName.length - 1) {
      const prefix = branchName.substring(0, idx);
      const rest = branchName.substring(idx + 1).replace(/[-_]+/g, " ");
      return `${prefix}: ${rest}`;
    }
    return branchName.replace(/[-_]+/g, " ");
  }
  _formatCommitMessage(branchName) {
    return localize("agentHost.changeset.pr.commitMessage", "Agent Host changes for {0}", branchName);
  }
  _formatBody(branchName, baseBranchName) {
    return localize("agentHost.changeset.pr.body", "Created from `{0}` targeting `{1}`.", branchName, baseBranchName);
  }
  /**
   * Best-effort generation of a PR title and description using the utility
   * model. The model is given the main session conversation (only the
   * markdown text of user requests and agent responses — tool calls,
   * subagents, and reasoning are excluded and the text is character-bounded)
   * along with a summary of the changed files. Returns `undefined` when no
   * Copilot token is available or generation fails, so the caller can fall
   * back to the branch-name based title/description. PR creation must never
   * fail just because the model is unavailable.
   */
  async _generateTitleAndDescription(sessionState, branchName, base, branchChanges, signal, token) {
    const copilotResource = this._gitHubEndpointService.getCopilotResource();
    const copilotToken = this._agentService.getAuthToken({
      resource: copilotResource.resource,
      scopes: copilotResource.scopes_supported
    });
    if (!copilotToken) {
      return void 0;
    }
    const conversation = buildConversationContext(sessionState.turns, { maxChars: MAX_PR_CONVERSATION_CONTEXT_CHARS });
    const changeSummary = this._summarizeDiffsForPrompt(branchChanges);
    if (!conversation && !changeSummary) {
      return void 0;
    }
    try {
      const raw = await this._copilotApiService.utilityChatCompletion(copilotToken, {
        messages: this._buildTitleAndDescriptionPrompt(branchName, base, conversation, changeSummary)
      }, { signal });
      this._throwIfCancelled(token);
      return this._parseTitleAndDescription(raw);
    } catch (err) {
      if (token.isCancellationRequested) {
        return void 0;
      }
      this._logService.warn(`[AgentHostPullRequestOperationHandler] Failed to generate PR title and description: ${err instanceof Error ? err.message : String(err)}`);
      return void 0;
    }
  }
  _buildTitleAndDescriptionPrompt(branchName, base, conversation, changeSummary) {
    const userSections = [
      `Branch: ${branchName}`,
      `Base branch: ${base}`
    ];
    if (changeSummary) {
      userSections.push(`Changed files:
${changeSummary}`);
    }
    if (conversation) {
      userSections.push(`Conversation (the request that produced these changes):
${conversation}`);
    }
    return [
      {
        role: "system",
        content: [
          "You write clear, concise GitHub pull request titles and descriptions.",
          'The first line of your reply is the PR title: a short imperative summary under 72 characters, with no "Title:" prefix, no surrounding quotes, and no markdown heading.',
          "After the title, add one blank line, then write the PR description in GitHub-flavored markdown.",
          "Summarize what changed and why, grounded in the conversation and changed files. Use a short paragraph and/or bullet points.",
          "Do not invent changes that are not supported by the provided context, and do not wrap the whole reply in code fences."
        ].join(" ")
      },
      {
        role: "user",
        content: userSections.join("\n\n")
      }
    ];
  }
  _summarizeDiffsForPrompt(diffs) {
    const lines = [];
    let length = 0;
    for (const diff of diffs) {
      const before = diff.before?.uri;
      const after = diff.after?.uri;
      const path = after ?? before ?? "(unknown)";
      let kind = "Edit";
      if (!before && after) {
        kind = "Create";
      } else if (before && !after) {
        kind = "Delete";
      } else if (before && after && before !== after) {
        kind = "Rename";
      }
      const line = `- ${kind}: ${this._displayUri(path)} (+${diff.diff?.added ?? 0} -${diff.diff?.removed ?? 0})`;
      lines.push(line);
      length += line.length + (lines.length > 1 ? 1 : 0);
      if (length > MAX_PR_CHANGE_SUMMARY_CHARS) {
        lines.push("[file list truncated]");
        break;
      }
    }
    return lines.join("\n");
  }
  _displayUri(uri) {
    try {
      const parsed = URI.parse(uri);
      return parsed.scheme === "file" ? parsed.fsPath : parsed.path || uri;
    } catch {
      return uri;
    }
  }
  _parseTitleAndDescription(raw) {
    let text = raw.trim().replace(/\r\n/g, "\n");
    const fenced = /^```(?:markdown|md|text)?\s*([\s\S]*?)\s*```$/i.exec(text);
    if (fenced) {
      text = fenced[1].trim();
    }
    if (!text) {
      return void 0;
    }
    const lines = text.split("\n");
    let i = 0;
    while (i < lines.length && lines[i].trim().length === 0) {
      i++;
    }
    if (i >= lines.length) {
      return void 0;
    }
    const title = lines[i].trim().replace(/^#+\s*/, "").replace(/^title:\s*/i, "").trim().replace(/^"(?<inner>.+)"$/, (_match, inner) => inner).trim();
    if (!title) {
      return void 0;
    }
    const description = lines.slice(i + 1).join("\n").trim().replace(/^description:\s*/i, "").trim();
    return { title, description };
  }
  _createResult(created, message) {
    const followUp = {
      content: { uri: created.url, contentType: "text/html" },
      external: true
    };
    return { message: { markdown: message }, followUp };
  }
};
AgentHostPullRequestOperationHandler.OPERATION_CREATE_PR = "create-pr";
AgentHostPullRequestOperationHandler.OPERATION_CREATE_DRAFT_PR = "create-draft-pr";
AgentHostPullRequestOperationHandler.OPERATION_CREATE_PR_AUTO_MERGE = "create-pr-auto-merge";
AgentHostPullRequestOperationHandler.OPERATION_CREATE_PR_AUTO_SQUASH = "create-pr-auto-squash";
AgentHostPullRequestOperationHandler.OPERATION_CREATE_PR_AUTO_REBASE = "create-pr-auto-rebase";
AgentHostPullRequestOperationHandler = __decorateClass([
  __decorateParam(5, IAgentService),
  __decorateParam(6, IAgentHostGitService),
  __decorateParam(7, IAgentHostOctoKitService),
  __decorateParam(8, IAgentHostGitHubEndpointService),
  __decorateParam(9, ICopilotApiService),
  __decorateParam(10, ILogService)
], AgentHostPullRequestOperationHandler);
export {
  AgentHostPullRequestOperationHandler
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxwbGF0Zm9ybVxcYWdlbnRIb3N0XFxub2RlXFxhZ2VudEhvc3RQdWxsUmVxdWVzdE9wZXJhdGlvbkhhbmRsZXIudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgeyBDYW5jZWxsYXRpb25Ub2tlbiB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL2NhbmNlbGxhdGlvbi5qcyc7XG5pbXBvcnQgeyBVUkkgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi91cmkuanMnO1xuaW1wb3J0IHsgbG9jYWxpemUgfSBmcm9tICcuLi8uLi8uLi9ubHMuanMnO1xuaW1wb3J0IHsgSUFnZW50U2VydmljZSB9IGZyb20gJy4uL2NvbW1vbi9hZ2VudFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSUFnZW50SG9zdEdpdEh1YkVuZHBvaW50U2VydmljZSB9IGZyb20gJy4vYWdlbnRIb3N0R2l0SHViRW5kcG9pbnRTZXJ2aWNlLmpzJztcbmltcG9ydCB7IHBhcnNlQ2hhbmdlc2V0VXJpIH0gZnJvbSAnLi4vY29tbW9uL2NoYW5nZXNldFVyaS5qcyc7XG5pbXBvcnQgeyBBSFBfQVVUSF9SRVFVSVJFRCwgQUhQX1NFU1NJT05fTk9UX0ZPVU5ELCBKc29uUnBjRXJyb3JDb2RlcywgUHJvdG9jb2xFcnJvciB9IGZyb20gJy4uL2NvbW1vbi9zdGF0ZS9zZXNzaW9uUHJvdG9jb2wuanMnO1xuaW1wb3J0IHsgcmVhZFNlc3Npb25HaXRIdWJTdGF0ZSwgcmVhZFNlc3Npb25HaXRTdGF0ZSwgdHlwZSBDaGFuZ2VzZXRPcGVyYXRpb25Gb2xsb3dVcCwgdHlwZSBJU2Vzc2lvbkZpbGVEaWZmLCB0eXBlIElTZXNzaW9uV2l0aERlZmF1bHRDaGF0IH0gZnJvbSAnLi4vY29tbW9uL3N0YXRlL3Nlc3Npb25TdGF0ZS5qcyc7XG5pbXBvcnQgeyBJTG9nU2VydmljZSB9IGZyb20gJy4uLy4uL2xvZy9jb21tb24vbG9nLmpzJztcbmltcG9ydCB7IElBZ2VudEhvc3RHaXRTZXJ2aWNlLCBwYXJzZVVwc3RyZWFtQnJhbmNoTmFtZSB9IGZyb20gJy4uL2NvbW1vbi9hZ2VudEhvc3RHaXRTZXJ2aWNlLmpzJztcbmltcG9ydCB7IHR5cGUgSUNoYW5nZXNldE9wZXJhdGlvbkhhbmRsZXIgfSBmcm9tICcuLi9jb21tb24vYWdlbnRIb3N0Q2hhbmdlc2V0T3BlcmF0aW9uU2VydmljZS5qcyc7XG5pbXBvcnQgeyB0eXBlIEF1dG9NZXJnZU1ldGhvZCwgdHlwZSBDcmVhdGVkUHVsbFJlcXVlc3QsIElBZ2VudEhvc3RPY3RvS2l0U2VydmljZSB9IGZyb20gJy4vc2hhcmVkL2FnZW50SG9zdE9jdG9LaXRTZXJ2aWNlLmpzJztcbmltcG9ydCB0eXBlIHsgSW52b2tlQ2hhbmdlc2V0T3BlcmF0aW9uUGFyYW1zLCBJbnZva2VDaGFuZ2VzZXRPcGVyYXRpb25SZXN1bHQgfSBmcm9tICcuLi9jb21tb24vc3RhdGUvcHJvdG9jb2wvY2hhbm5lbHMtY2hhbmdlc2V0L2NvbW1hbmRzLmpzJztcbmltcG9ydCB7IElDb3BpbG90QXBpU2VydmljZSwgdHlwZSBJQ29waWxvdFV0aWxpdHlDaGF0TWVzc2FnZSB9IGZyb20gJy4vc2hhcmVkL2NvcGlsb3RBcGlTZXJ2aWNlLmpzJztcbmltcG9ydCB7IGJ1aWxkQ29udmVyc2F0aW9uQ29udGV4dCB9IGZyb20gJy4uL2NvbW1vbi9hZ2VudEhvc3RDb252ZXJzYXRpb25Db250ZXh0LmpzJztcblxuLyoqXG4gKiBTb2Z0IHVwcGVyIGJvdW5kLCBpbiBjaGFyYWN0ZXJzLCBmb3IgdGhlIGNvbnZlcnNhdGlvbiBjb250ZXh0IGZlZCB0byB0aGVcbiAqIHV0aWxpdHkgbW9kZWwgd2hlbiBnZW5lcmF0aW5nIGEgUFIgdGl0bGUgYW5kIGRlc2NyaXB0aW9uLiBTaXplZCB0byBzdGF5XG4gKiB3aXRoaW4gdGhlIHNtYWxsIG1vZGVsJ3MgY29udGV4dCB3aW5kb3cgd2hpbGUgbGVhdmluZyByb29tIGZvciB0aGUgY2hhbmdlZFxuICogZmlsZSBzdW1tYXJ5IGFuZCBwcm9tcHQgc2NhZmZvbGRpbmcuXG4gKi9cbmNvbnN0IE1BWF9QUl9DT05WRVJTQVRJT05fQ09OVEVYVF9DSEFSUyA9IDEyXzAwMDtcblxuLyoqXG4gKiBTb2Z0IHVwcGVyIGJvdW5kLCBpbiBjaGFyYWN0ZXJzLCBmb3IgdGhlIGNoYW5nZWQtZmlsZSBzdW1tYXJ5IGZlZCB0byB0aGVcbiAqIHV0aWxpdHkgbW9kZWwgd2hlbiBnZW5lcmF0aW5nIGEgUFIgdGl0bGUgYW5kIGRlc2NyaXB0aW9uLlxuICovXG5jb25zdCBNQVhfUFJfQ0hBTkdFX1NVTU1BUllfQ0hBUlMgPSA0XzAwMDtcblxuZXhwb3J0IGludGVyZmFjZSBQdWxsUmVxdWVzdENyZWF0ZWRFdmVudCB7XG5cdHJlYWRvbmx5IHNlc3Npb25LZXk6IHN0cmluZztcblx0cmVhZG9ubHkgcHVsbFJlcXVlc3RVcmw6IHN0cmluZztcblx0LyoqIFRoZSBoZWFkIGJyYW5jaCB0aGUgcHVsbCByZXF1ZXN0IHdhcyBjcmVhdGVkIChvciBmb3VuZCkgZm9yLiAqL1xuXHRyZWFkb25seSBicmFuY2hOYW1lOiBzdHJpbmc7XG59XG5cbi8qKlxuICogU2VydmVyLXNpZGUgaGFuZGxlciBmb3IgdGhlIGBjcmVhdGUtcHJgIGFuZCBgY3JlYXRlLWRyYWZ0LXByYCBjaGFuZ2VzZXRcbiAqIG9wZXJhdGlvbnMgYWR2ZXJ0aXNlZCBvbiBnaXQtYmFja2VkIHNlc3Npb25zIHdob3NlIHdvcmtpbmcgZGlyZWN0b3J5IGhhc1xuICogYSBHaXRIdWIgcmVtb3RlLiBPcGVyYXRpb24gYXZhaWxhYmlsaXR5IGlzIHJlY29tcHV0ZWQgYnlcbiAqIGBBZ2VudEhvc3RDaGFuZ2VzZXRPcGVyYXRpb25TZXJ2aWNlLnVwZGF0ZU9wZXJhdGlvbnNgLlxuICpcbiAqIFRoZSBmbG93IG1pcnJvcnMgdGhlIENvcGlsb3QgQ0xJIGV4dGVuc2lvbidzIGBjcmVhdGVQdWxsUmVxdWVzdGAgaGVscGVyXG4gKiAoYGV4dGVuc2lvbnMvY29waWxvdC9zcmMvZXh0ZW5zaW9uL2NoYXRTZXNzaW9ucy92c2NvZGUtbm9kZS9jb3BpbG90Q0xJQ2hhdFNlc3Npb25zQ29udHJpYnV0aW9uLnRzYCk6XG4gKlxuICogMS4gUmVzb2x2ZSBzZXNzaW9uIFx1MjE5MiB3b3JraW5nIGRpcmVjdG9yeSArIGN1cnJlbnQvYmFzZSBicmFuY2ggZnJvbVxuICogICAge0BsaW5rIElTZXNzaW9uR2l0U3RhdGV9LlxuICogMi4gQ29tbWl0IGFueSB1bmNvbW1pdHRlZCB3b3JraW5nLXRyZWUgY2hhbmdlcy5cbiAqIDMuIFB1c2ggdGhlIGN1cnJlbnQgYnJhbmNoIHRvIGl0cyBHaXRIdWIgdXBzdHJlYW0gcmVtb3RlICh3aXRoIGAtLXNldC11cHN0cmVhbWAgd2hlbiBtaXNzaW5nKS5cbiAqIDQuIFJlc29sdmUgYG93bmVyYCAvIGByZXBvYCBmcm9tIHtAbGluayBJU2Vzc2lvbkdpdFN0YXRlLmdpdGh1Yk93bmVyfVxuICogICAgLyB7QGxpbmsgSVNlc3Npb25HaXRTdGF0ZS5naXRodWJSZXBvfSAocG9wdWxhdGVkIGJ5IHRoZSBnaXQgcHJvYmUpLlxuICogNS4gUmV1c2UgYW4gZXhpc3RpbmcgUFIgZm9yIHRoZSBicmFuY2gsIG9yIFBPU1QgYC9yZXBvcy97b3duZXJ9L3tyZXBvfS9wdWxsc2BcbiAqICAgIHZpYSB7QGxpbmsgSUFnZW50SG9zdE9jdG9LaXRTZXJ2aWNlfS5cbiAqIDYuIFJldHVybiB0aGUgUFIgVVJMIGFzIGFuIHtAbGluayBJbnZva2VDaGFuZ2VzZXRPcGVyYXRpb25SZXN1bHQuZm9sbG93VXB9LlxuICovXG5leHBvcnQgY2xhc3MgQWdlbnRIb3N0UHVsbFJlcXVlc3RPcGVyYXRpb25IYW5kbGVyIGltcGxlbWVudHMgSUNoYW5nZXNldE9wZXJhdGlvbkhhbmRsZXIge1xuXG5cdHB1YmxpYyBzdGF0aWMgcmVhZG9ubHkgT1BFUkFUSU9OX0NSRUFURV9QUiA9ICdjcmVhdGUtcHInO1xuXHRwdWJsaWMgc3RhdGljIHJlYWRvbmx5IE9QRVJBVElPTl9DUkVBVEVfRFJBRlRfUFIgPSAnY3JlYXRlLWRyYWZ0LXByJztcblx0cHVibGljIHN0YXRpYyByZWFkb25seSBPUEVSQVRJT05fQ1JFQVRFX1BSX0FVVE9fTUVSR0UgPSAnY3JlYXRlLXByLWF1dG8tbWVyZ2UnO1xuXHRwdWJsaWMgc3RhdGljIHJlYWRvbmx5IE9QRVJBVElPTl9DUkVBVEVfUFJfQVVUT19TUVVBU0ggPSAnY3JlYXRlLXByLWF1dG8tc3F1YXNoJztcblx0cHVibGljIHN0YXRpYyByZWFkb25seSBPUEVSQVRJT05fQ1JFQVRFX1BSX0FVVE9fUkVCQVNFID0gJ2NyZWF0ZS1wci1hdXRvLXJlYmFzZSc7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0cHJpdmF0ZSByZWFkb25seSBfZHJhZnQ6IGJvb2xlYW4sXG5cdFx0cHJpdmF0ZSByZWFkb25seSBfYXV0b01lcmdlTWV0aG9kOiBBdXRvTWVyZ2VNZXRob2QgfCB1bmRlZmluZWQsXG5cdFx0cHJpdmF0ZSByZWFkb25seSBfZ2V0U2Vzc2lvblN0YXRlOiAoc2Vzc2lvbktleTogc3RyaW5nKSA9PiBJU2Vzc2lvbldpdGhEZWZhdWx0Q2hhdCB8IHVuZGVmaW5lZCxcblx0XHRwcml2YXRlIHJlYWRvbmx5IF9yZXNvbHZlQmFzZUJyYW5jaE5hbWU6IChzZXNzaW9uS2V5OiBzdHJpbmcpID0+IFByb21pc2U8c3RyaW5nIHwgdW5kZWZpbmVkPixcblx0XHRwcml2YXRlIHJlYWRvbmx5IF9vblB1bGxSZXF1ZXN0Q3JlYXRlZDogKGV2ZW50OiBQdWxsUmVxdWVzdENyZWF0ZWRFdmVudCkgPT4gdm9pZCxcblx0XHRASUFnZW50U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9hZ2VudFNlcnZpY2U6IElBZ2VudFNlcnZpY2UsXG5cdFx0QElBZ2VudEhvc3RHaXRTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2dpdFNlcnZpY2U6IElBZ2VudEhvc3RHaXRTZXJ2aWNlLFxuXHRcdEBJQWdlbnRIb3N0T2N0b0tpdFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfb2N0b0tpdFNlcnZpY2U6IElBZ2VudEhvc3RPY3RvS2l0U2VydmljZSxcblx0XHRASUFnZW50SG9zdEdpdEh1YkVuZHBvaW50U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9naXRIdWJFbmRwb2ludFNlcnZpY2U6IElBZ2VudEhvc3RHaXRIdWJFbmRwb2ludFNlcnZpY2UsXG5cdFx0QElDb3BpbG90QXBpU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9jb3BpbG90QXBpU2VydmljZTogSUNvcGlsb3RBcGlTZXJ2aWNlLFxuXHRcdEBJTG9nU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9sb2dTZXJ2aWNlOiBJTG9nU2VydmljZSxcblx0KSB7IH1cblxuXHRhc3luYyBpbnZva2UocGFyYW1zOiBJbnZva2VDaGFuZ2VzZXRPcGVyYXRpb25QYXJhbXMsIHRva2VuOiBDYW5jZWxsYXRpb25Ub2tlbik6IFByb21pc2U8SW52b2tlQ2hhbmdlc2V0T3BlcmF0aW9uUmVzdWx0PiB7XG5cdFx0Y29uc3QgYWJvcnRDb250cm9sbGVyID0gbmV3IEFib3J0Q29udHJvbGxlcigpO1xuXHRcdGlmICh0b2tlbi5pc0NhbmNlbGxhdGlvblJlcXVlc3RlZCkge1xuXHRcdFx0YWJvcnRDb250cm9sbGVyLmFib3J0KCk7XG5cdFx0fVxuXHRcdGNvbnN0IGNhbmNlbGxhdGlvbkxpc3RlbmVyID0gdG9rZW4ub25DYW5jZWxsYXRpb25SZXF1ZXN0ZWQoKCkgPT4gYWJvcnRDb250cm9sbGVyLmFib3J0KCkpO1xuXHRcdHRyeSB7XG5cdFx0XHRyZXR1cm4gYXdhaXQgdGhpcy5faW52b2tlKHBhcmFtcywgdG9rZW4sIGFib3J0Q29udHJvbGxlci5zaWduYWwpO1xuXHRcdH0gZmluYWxseSB7XG5cdFx0XHRjYW5jZWxsYXRpb25MaXN0ZW5lci5kaXNwb3NlKCk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBfaW52b2tlKHBhcmFtczogSW52b2tlQ2hhbmdlc2V0T3BlcmF0aW9uUGFyYW1zLCB0b2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4sIHNpZ25hbDogQWJvcnRTaWduYWwpOiBQcm9taXNlPEludm9rZUNoYW5nZXNldE9wZXJhdGlvblJlc3VsdD4ge1xuXHRcdGNvbnN0IHBhcnNlZCA9IHBhcnNlQ2hhbmdlc2V0VXJpKHBhcmFtcy5jaGFubmVsKTtcblx0XHRpZiAoIXBhcnNlZCkge1xuXHRcdFx0dGhyb3cgbmV3IFByb3RvY29sRXJyb3IoSnNvblJwY0Vycm9yQ29kZXMuSW52YWxpZFBhcmFtcywgYE5vdCBhIGNoYW5nZXNldCBVUkk6ICR7cGFyYW1zLmNoYW5uZWx9YCk7XG5cdFx0fVxuXHRcdHRoaXMuX3Rocm93SWZDYW5jZWxsZWQodG9rZW4pO1xuXHRcdGNvbnN0IHNlc3Npb25VcmkgPSBwYXJzZWQuc2Vzc2lvblVyaTtcblxuXHRcdGNvbnN0IHNlc3Npb25TdGF0ZSA9IHRoaXMuX2dldFNlc3Npb25TdGF0ZShzZXNzaW9uVXJpKTtcblx0XHRpZiAoIXNlc3Npb25TdGF0ZSkge1xuXHRcdFx0dGhyb3cgbmV3IFByb3RvY29sRXJyb3IoQUhQX1NFU1NJT05fTk9UX0ZPVU5ELCBgU2Vzc2lvbiBub3QgZm91bmQ6ICR7c2Vzc2lvblVyaX1gKTtcblx0XHR9XG5cblx0XHRjb25zdCB3b3JraW5nRGlyZWN0b3J5U3RyID0gc2Vzc2lvblN0YXRlLndvcmtpbmdEaXJlY3Rvcmllcz8uWzBdO1xuXHRcdGlmICghd29ya2luZ0RpcmVjdG9yeVN0cikge1xuXHRcdFx0dGhyb3cgbmV3IFByb3RvY29sRXJyb3IoSnNvblJwY0Vycm9yQ29kZXMuSW50ZXJuYWxFcnJvciwgYFNlc3Npb24gaGFzIG5vIHdvcmtpbmcgZGlyZWN0b3J5OiAke3Nlc3Npb25Vcml9YCk7XG5cdFx0fVxuXG5cdFx0Y29uc3QgZ2l0SHViU3RhdGUgPSByZWFkU2Vzc2lvbkdpdEh1YlN0YXRlKHNlc3Npb25TdGF0ZS5fbWV0YSk7XG5cdFx0aWYgKCFnaXRIdWJTdGF0ZT8ub3duZXIgfHwgIWdpdEh1YlN0YXRlPy5yZXBvKSB7XG5cdFx0XHR0aHJvdyBuZXcgUHJvdG9jb2xFcnJvcihcblx0XHRcdFx0SnNvblJwY0Vycm9yQ29kZXMuSW50ZXJuYWxFcnJvcixcblx0XHRcdFx0YFNlc3Npb24ncyB3b3JraW5nIGRpcmVjdG9yeSBpcyBub3QgYSBHaXRIdWItYmFja2VkIGdpdCByZXBvOiAke3Nlc3Npb25Vcml9YCxcblx0XHRcdCk7XG5cdFx0fVxuXG5cdFx0Y29uc3Qgd29ya2luZ0RpcmVjdG9yeSA9IFVSSS5wYXJzZSh3b3JraW5nRGlyZWN0b3J5U3RyKTtcblx0XHRjb25zdCBzdG9yZWRHaXRTdGF0ZSA9IHJlYWRTZXNzaW9uR2l0U3RhdGUoc2Vzc2lvblN0YXRlLl9tZXRhKTtcblx0XHRjb25zdCBlZmZlY3RpdmVCYXNlQnJhbmNoID0gYXdhaXQgdGhpcy5fcmVzb2x2ZUJhc2VCcmFuY2hOYW1lKHNlc3Npb25VcmkpO1xuXHRcdGNvbnN0IGdpdFN0YXRlID0gYXdhaXQgdGhpcy5fZ2l0U2VydmljZS5nZXRTZXNzaW9uR2l0U3RhdGUod29ya2luZ0RpcmVjdG9yeSwgZWZmZWN0aXZlQmFzZUJyYW5jaCkgPz8gc3RvcmVkR2l0U3RhdGU7XG5cdFx0Y29uc3QgYnJhbmNoTmFtZSA9IGdpdFN0YXRlPy5icmFuY2hOYW1lID8/IGF3YWl0IHRoaXMuX2dpdFNlcnZpY2UuZ2V0Q3VycmVudEJyYW5jaCh3b3JraW5nRGlyZWN0b3J5KTtcblx0XHRpZiAoIWJyYW5jaE5hbWUpIHtcblx0XHRcdHRocm93IG5ldyBQcm90b2NvbEVycm9yKEpzb25ScGNFcnJvckNvZGVzLkludGVybmFsRXJyb3IsIGBDb3VsZCBub3QgZGV0ZXJtaW5lIGN1cnJlbnQgYnJhbmNoIGZvciAke3dvcmtpbmdEaXJlY3Rvcnl9YCk7XG5cdFx0fVxuXG5cdFx0Y29uc3QgYmFzZUJyYW5jaE5hbWUgPSBlZmZlY3RpdmVCYXNlQnJhbmNoID8/IGdpdFN0YXRlPy5iYXNlQnJhbmNoTmFtZSA/PyAoYXdhaXQgdGhpcy5fZ2l0U2VydmljZS5nZXREZWZhdWx0QnJhbmNoKHdvcmtpbmdEaXJlY3RvcnkpKT8ubmFtZTtcblx0XHRpZiAoIWJhc2VCcmFuY2hOYW1lKSB7XG5cdFx0XHR0aHJvdyBuZXcgUHJvdG9jb2xFcnJvcihKc29uUnBjRXJyb3JDb2Rlcy5JbnRlcm5hbEVycm9yLCBgQ291bGQgbm90IGRldGVybWluZSBiYXNlIGJyYW5jaCBmb3IgJHt3b3JraW5nRGlyZWN0b3J5fWApO1xuXHRcdH1cblx0XHRjb25zdCBiYXNlID0gYmFzZUJyYW5jaE5hbWU7XG5cblx0XHRjb25zdCByZXBvUmVzb3VyY2UgPSB0aGlzLl9naXRIdWJFbmRwb2ludFNlcnZpY2UuZ2V0UmVwb1Jlc291cmNlKCk7XG5cdFx0Y29uc3QgYXV0aFRva2VuID0gdGhpcy5fYWdlbnRTZXJ2aWNlLmdldEF1dGhUb2tlbih7XG5cdFx0XHRyZXNvdXJjZTogcmVwb1Jlc291cmNlLnJlc291cmNlLFxuXHRcdFx0c2NvcGVzOiByZXBvUmVzb3VyY2Uuc2NvcGVzX3N1cHBvcnRlZCxcblx0XHR9KTtcblx0XHRpZiAoIWF1dGhUb2tlbikge1xuXHRcdFx0dGhyb3cgbmV3IFByb3RvY29sRXJyb3IoXG5cdFx0XHRcdEFIUF9BVVRIX1JFUVVJUkVELFxuXHRcdFx0XHRsb2NhbGl6ZSgnYWdlbnRIb3N0LmNoYW5nZXNldC5wci5hdXRoUmVxdWlyZWQnLCBcIlNpZ24gaW4gdG8gR2l0SHViIHdpdGggcmVwb3NpdG9yeSBhY2Nlc3MgdG8gY3JlYXRlIGEgcHVsbCByZXF1ZXN0LlwiKSxcblx0XHRcdFx0W3JlcG9SZXNvdXJjZV0sXG5cdFx0XHQpO1xuXHRcdH1cblxuXHRcdGNvbnN0IGhhc1VuY29tbWl0dGVkID0gYXdhaXQgdGhpcy5fZ2l0U2VydmljZS5oYXNVbmNvbW1pdHRlZENoYW5nZXMod29ya2luZ0RpcmVjdG9yeSk7XG5cdFx0aWYgKGhhc1VuY29tbWl0dGVkKSB7XG5cdFx0XHR0aGlzLl90aHJvd0lmQ2FuY2VsbGVkKHRva2VuKTtcblx0XHRcdHRoaXMuX2xvZ1NlcnZpY2UuaW5mbyhgW0FnZW50SG9zdFB1bGxSZXF1ZXN0T3BlcmF0aW9uSGFuZGxlcl0gQ29tbWl0dGluZyB1bmNvbW1pdHRlZCBjaGFuZ2VzIGZvciBzZXNzaW9uICR7c2Vzc2lvblVyaX1gKTtcblx0XHRcdHRyeSB7XG5cdFx0XHRcdGF3YWl0IHRoaXMuX2dpdFNlcnZpY2UuY29tbWl0QWxsKHdvcmtpbmdEaXJlY3RvcnksIHRoaXMuX2Zvcm1hdENvbW1pdE1lc3NhZ2UoYnJhbmNoTmFtZSkpO1xuXHRcdFx0fSBjYXRjaCAoZXJyKSB7XG5cdFx0XHRcdHRoaXMuX3Rocm93SWZDYW5jZWxsZWQodG9rZW4pO1xuXHRcdFx0XHR0aHJvdyBuZXcgUHJvdG9jb2xFcnJvcihKc29uUnBjRXJyb3JDb2Rlcy5JbnRlcm5hbEVycm9yLCBgRmFpbGVkIHRvIGNvbW1pdCBjaGFuZ2VzIGJlZm9yZSBjcmVhdGluZyBhIHB1bGwgcmVxdWVzdDogJHtlcnIgaW5zdGFuY2VvZiBFcnJvciA/IGVyci5tZXNzYWdlIDogU3RyaW5nKGVycil9YCk7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdHRoaXMuX3Rocm93SWZDYW5jZWxsZWQodG9rZW4pO1xuXG5cdFx0Y29uc3QgYnJhbmNoQ2hhbmdlcyA9IGF3YWl0IHRoaXMuX2dpdFNlcnZpY2UuY29tcHV0ZVNlc3Npb25GaWxlRGlmZnMod29ya2luZ0RpcmVjdG9yeSwgeyBzZXNzaW9uVXJpLCBiYXNlQnJhbmNoOiBiYXNlIH0pO1xuXHRcdGlmIChicmFuY2hDaGFuZ2VzID09PSB1bmRlZmluZWQpIHtcblx0XHRcdHRocm93IG5ldyBQcm90b2NvbEVycm9yKEpzb25ScGNFcnJvckNvZGVzLkludGVybmFsRXJyb3IsIGxvY2FsaXplKCdhZ2VudEhvc3QuY2hhbmdlc2V0LnByLmNvbXB1dGVDaGFuZ2VzRmFpbGVkJywgXCJDb3VsZCBub3QgY29tcHV0ZSBicmFuY2ggY2hhbmdlcyB0byBjcmVhdGUgYSBwdWxsIHJlcXVlc3QuXCIpKTtcblx0XHR9XG5cdFx0aWYgKGJyYW5jaENoYW5nZXMgIT09IHVuZGVmaW5lZCAmJiBicmFuY2hDaGFuZ2VzLmxlbmd0aCA9PT0gMCkge1xuXHRcdFx0dGhyb3cgbmV3IFByb3RvY29sRXJyb3IoSnNvblJwY0Vycm9yQ29kZXMuSW50ZXJuYWxFcnJvciwgbG9jYWxpemUoJ2FnZW50SG9zdC5jaGFuZ2VzZXQucHIubm9DaGFuZ2VzJywgXCJUaGVyZSBhcmUgbm8gYnJhbmNoIGNoYW5nZXMgdG8gY3JlYXRlIGEgcHVsbCByZXF1ZXN0IGZvci5cIikpO1xuXHRcdH1cblx0XHR0aGlzLl90aHJvd0lmQ2FuY2VsbGVkKHRva2VuKTtcblxuXHRcdGNvbnN0IGdpdGh1YkhlYWRPd25lciA9IGdpdFN0YXRlPy5naXRodWJIZWFkT3duZXI7XG5cdFx0Y29uc3QgdXBzdHJlYW1CcmFuY2ggPSBnaXRodWJIZWFkT3duZXIgPyBwYXJzZVVwc3RyZWFtQnJhbmNoTmFtZShnaXRTdGF0ZS51cHN0cmVhbUJyYW5jaE5hbWUpIDogdW5kZWZpbmVkO1xuXHRcdGNvbnN0IGhlYWRPd25lciA9IHVwc3RyZWFtQnJhbmNoICYmIGdpdGh1YkhlYWRPd25lciA/IGdpdGh1YkhlYWRPd25lciA6IGdpdEh1YlN0YXRlLm93bmVyO1xuXHRcdGNvbnN0IGhlYWRCcmFuY2ggPSB1cHN0cmVhbUJyYW5jaD8uYnJhbmNoID8/IGJyYW5jaE5hbWU7XG5cdFx0Y29uc3QgcHVzaFJlZiA9IGhlYWRCcmFuY2ggPT09IGJyYW5jaE5hbWUgPyBicmFuY2hOYW1lIDogYCR7YnJhbmNoTmFtZX06JHtoZWFkQnJhbmNofWA7XG5cdFx0Y29uc3QgY3JlYXRlSGVhZCA9IGhlYWRPd25lciA9PT0gZ2l0SHViU3RhdGUub3duZXIgPyBoZWFkQnJhbmNoIDogYCR7aGVhZE93bmVyfToke2hlYWRCcmFuY2h9YDtcblxuXHRcdHRoaXMuX2xvZ1NlcnZpY2UuaW5mbyhgW0FnZW50SG9zdFB1bGxSZXF1ZXN0T3BlcmF0aW9uSGFuZGxlcl0gUHVzaGluZyBicmFuY2ggJHticmFuY2hOYW1lfSB0byAke3Vwc3RyZWFtQnJhbmNoPy5yZW1vdGUgPz8gJ29yaWdpbid9IGZvciBzZXNzaW9uICR7c2Vzc2lvblVyaX1gKTtcblx0XHRjb25zdCB1cHN0cmVhbVByZXNlbnQgPSBhd2FpdCB0aGlzLl9naXRTZXJ2aWNlLmhhc1Vwc3RyZWFtKHdvcmtpbmdEaXJlY3RvcnksIGJyYW5jaE5hbWUpO1xuXHRcdHRoaXMuX3Rocm93SWZDYW5jZWxsZWQodG9rZW4pO1xuXHRcdHRyeSB7XG5cdFx0XHRhd2FpdCB0aGlzLl9naXRTZXJ2aWNlLnB1c2god29ya2luZ0RpcmVjdG9yeSwgeyByZW1vdGU6IHVwc3RyZWFtQnJhbmNoPy5yZW1vdGUsIHJlZjogcHVzaFJlZiwgc2V0VXBzdHJlYW06ICF1cHN0cmVhbVByZXNlbnQgfSk7XG5cdFx0fSBjYXRjaCAoZXJyKSB7XG5cdFx0XHR0aGlzLl90aHJvd0lmQ2FuY2VsbGVkKHRva2VuKTtcblx0XHRcdHRocm93IG5ldyBQcm90b2NvbEVycm9yKEpzb25ScGNFcnJvckNvZGVzLkludGVybmFsRXJyb3IsIGBGYWlsZWQgdG8gcHVzaCBicmFuY2ggJyR7YnJhbmNoTmFtZX0nOiAke2VyciBpbnN0YW5jZW9mIEVycm9yID8gZXJyLm1lc3NhZ2UgOiBTdHJpbmcoZXJyKX1gKTtcblx0XHR9XG5cdFx0dGhpcy5fdGhyb3dJZkNhbmNlbGxlZCh0b2tlbik7XG5cblx0XHRjb25zdCBleGlzdGluZyA9IGF3YWl0IHRoaXMuX29jdG9LaXRTZXJ2aWNlLmZpbmRQdWxsUmVxdWVzdEJ5SGVhZEJyYW5jaChnaXRIdWJTdGF0ZS5vd25lciwgZ2l0SHViU3RhdGUucmVwbywgaGVhZEJyYW5jaCwgYXV0aFRva2VuLCBzaWduYWwsIGhlYWRPd25lcik7XG5cdFx0aWYgKGV4aXN0aW5nKSB7XG5cdFx0XHR0aGlzLl90aHJvd0lmQ2FuY2VsbGVkKHRva2VuKTtcblx0XHRcdHJldHVybiBhd2FpdCB0aGlzLl9maW5hbGl6ZShleGlzdGluZywgdHJ1ZSwgc2Vzc2lvblVyaSwgZ2l0SHViU3RhdGUub3duZXIsIGdpdEh1YlN0YXRlLnJlcG8sIGJyYW5jaE5hbWUsIGF1dGhUb2tlbiwgc2lnbmFsLCB0b2tlbik7XG5cdFx0fVxuXHRcdHRoaXMuX3Rocm93SWZDYW5jZWxsZWQodG9rZW4pO1xuXG5cdFx0Y29uc3QgZ2VuZXJhdGVkID0gYXdhaXQgdGhpcy5fZ2VuZXJhdGVUaXRsZUFuZERlc2NyaXB0aW9uKHNlc3Npb25TdGF0ZSwgYnJhbmNoTmFtZSwgYmFzZSwgYnJhbmNoQ2hhbmdlcywgc2lnbmFsLCB0b2tlbik7XG5cdFx0dGhpcy5fdGhyb3dJZkNhbmNlbGxlZCh0b2tlbik7XG5cdFx0Y29uc3QgdGl0bGUgPSBnZW5lcmF0ZWQ/LnRpdGxlID8/IHRoaXMuX2Zvcm1hdFRpdGxlKGJyYW5jaE5hbWUpO1xuXHRcdGNvbnN0IGJvZHkgPSBnZW5lcmF0ZWQ/LmRlc2NyaXB0aW9uID8/IHRoaXMuX2Zvcm1hdEJvZHkoYnJhbmNoTmFtZSwgYmFzZSk7XG5cblx0XHR0aGlzLl9sb2dTZXJ2aWNlLmluZm8oYFtBZ2VudEhvc3RQdWxsUmVxdWVzdE9wZXJhdGlvbkhhbmRsZXJdIENyZWF0aW5nICR7dGhpcy5fZHJhZnQgPyAnZHJhZnQgJyA6ICcnfVBSICR7Z2l0SHViU3RhdGUub3duZXJ9LyR7Z2l0SHViU3RhdGUucmVwb30gJHtjcmVhdGVIZWFkfSAtPiAke2Jhc2V9YCk7XG5cdFx0bGV0IGNyZWF0ZWQ6IENyZWF0ZWRQdWxsUmVxdWVzdDtcblx0XHR0cnkge1xuXHRcdFx0Y3JlYXRlZCA9IGF3YWl0IHRoaXMuX29jdG9LaXRTZXJ2aWNlLmNyZWF0ZVB1bGxSZXF1ZXN0KFxuXHRcdFx0XHRnaXRIdWJTdGF0ZS5vd25lcixcblx0XHRcdFx0Z2l0SHViU3RhdGUucmVwbyxcblx0XHRcdFx0dGl0bGUsXG5cdFx0XHRcdGJvZHksXG5cdFx0XHRcdGNyZWF0ZUhlYWQsXG5cdFx0XHRcdGJhc2UsXG5cdFx0XHRcdHRoaXMuX2RyYWZ0LFxuXHRcdFx0XHRhdXRoVG9rZW4sXG5cdFx0XHRcdHNpZ25hbCxcblx0XHRcdCk7XG5cdFx0fSBjYXRjaCAoZXJyKSB7XG5cdFx0XHR0aGlzLl90aHJvd0lmQ2FuY2VsbGVkKHRva2VuKTtcblx0XHRcdGxldCBmb3VuZEFmdGVyRmFpbHVyZTogQ3JlYXRlZFB1bGxSZXF1ZXN0IHwgdW5kZWZpbmVkO1xuXHRcdFx0dHJ5IHtcblx0XHRcdFx0Zm91bmRBZnRlckZhaWx1cmUgPSBhd2FpdCB0aGlzLl9vY3RvS2l0U2VydmljZS5maW5kUHVsbFJlcXVlc3RCeUhlYWRCcmFuY2goZ2l0SHViU3RhdGUub3duZXIsIGdpdEh1YlN0YXRlLnJlcG8sIGhlYWRCcmFuY2gsIGF1dGhUb2tlbiwgc2lnbmFsLCBoZWFkT3duZXIpO1xuXHRcdFx0fSBjYXRjaCB7XG5cdFx0XHRcdHRoaXMuX3Rocm93SWZDYW5jZWxsZWQodG9rZW4pO1xuXHRcdFx0XHR0aHJvdyBlcnI7XG5cdFx0XHR9XG5cdFx0XHRpZiAoZm91bmRBZnRlckZhaWx1cmUpIHtcblx0XHRcdFx0dGhpcy5fdGhyb3dJZkNhbmNlbGxlZCh0b2tlbik7XG5cdFx0XHRcdHJldHVybiBhd2FpdCB0aGlzLl9maW5hbGl6ZShmb3VuZEFmdGVyRmFpbHVyZSwgdHJ1ZSwgc2Vzc2lvblVyaSwgZ2l0SHViU3RhdGUub3duZXIsIGdpdEh1YlN0YXRlLnJlcG8sIGJyYW5jaE5hbWUsIGF1dGhUb2tlbiwgc2lnbmFsLCB0b2tlbik7XG5cdFx0XHR9XG5cdFx0XHR0aHJvdyBlcnI7XG5cdFx0fVxuXHRcdHRoaXMuX3Rocm93SWZDYW5jZWxsZWQodG9rZW4pO1xuXHRcdHJldHVybiBhd2FpdCB0aGlzLl9maW5hbGl6ZShjcmVhdGVkLCBmYWxzZSwgc2Vzc2lvblVyaSwgZ2l0SHViU3RhdGUub3duZXIsIGdpdEh1YlN0YXRlLnJlcG8sIGJyYW5jaE5hbWUsIGF1dGhUb2tlbiwgc2lnbmFsLCB0b2tlbik7XG5cdH1cblxuXHQvKipcblx0ICogTm90aWZpZXMgbGlzdGVuZXJzIHRoYXQgdGhlIHB1bGwgcmVxdWVzdCBub3cgZXhpc3RzLCBvcHRpb25hbGx5IGVuYWJsZXNcblx0ICogYXV0by1tZXJnZSB3aXRoIHRoZSBjb25maWd1cmVkIHtAbGluayBBdXRvTWVyZ2VNZXRob2R9IChiZXN0LWVmZm9ydDogYVxuXHQgKiBmYWlsdXJlIHRvIGVuYWJsZSBhdXRvLW1lcmdlIGRvZXMgbm90IGZhaWwgdGhlIG9wZXJhdGlvbiksIGFuZCBidWlsZHMgdGhlXG5cdCAqIHJlc3VsdCBtZXNzYWdlIGRlc2NyaWJpbmcgd2hhdCBoYXBwZW5lZC5cblx0ICovXG5cdHByaXZhdGUgYXN5bmMgX2ZpbmFsaXplKFxuXHRcdHByOiBDcmVhdGVkUHVsbFJlcXVlc3QsXG5cdFx0aXNFeGlzdGluZzogYm9vbGVhbixcblx0XHRzZXNzaW9uVXJpOiBzdHJpbmcsXG5cdFx0b3duZXI6IHN0cmluZyxcblx0XHRyZXBvOiBzdHJpbmcsXG5cdFx0YnJhbmNoTmFtZTogc3RyaW5nLFxuXHRcdGF1dGhUb2tlbjogc3RyaW5nLFxuXHRcdHNpZ25hbDogQWJvcnRTaWduYWwsXG5cdFx0dG9rZW46IENhbmNlbGxhdGlvblRva2VuLFxuXHQpOiBQcm9taXNlPEludm9rZUNoYW5nZXNldE9wZXJhdGlvblJlc3VsdD4ge1xuXHRcdGlmICghdGhpcy5fYXV0b01lcmdlTWV0aG9kKSB7XG5cdFx0XHQvLyBObyBhdXRvLW1lcmdlIGNvbmZpZ3VyZWRcblx0XHRcdHRoaXMuX29uUHVsbFJlcXVlc3RDcmVhdGVkKHsgc2Vzc2lvbktleTogc2Vzc2lvblVyaSwgcHVsbFJlcXVlc3RVcmw6IHByLnVybCwgYnJhbmNoTmFtZSB9KTtcblx0XHRcdHJldHVybiB0aGlzLl9jcmVhdGVSZXN1bHQocHIsIHRoaXMuX2J1aWxkTWVzc2FnZShwciwgaXNFeGlzdGluZywgJ25vbmUnLCB1bmRlZmluZWQpKTtcblx0XHR9XG5cblx0XHRsZXQgYXV0b01lcmdlRXJyb3I6IHN0cmluZyB8IHVuZGVmaW5lZDtcblx0XHRsZXQgYXV0b01lcmdlT3V0Y29tZTogJ25vbmUnIHwgJ2VuYWJsZWQnIHwgJ2ZhaWxlZCcgPSAnbm9uZSc7XG5cblx0XHRpZiAocHIubm9kZUlkKSB7XG5cdFx0XHR0cnkge1xuXHRcdFx0XHRhd2FpdCB0aGlzLl9vY3RvS2l0U2VydmljZS5lbmFibGVQdWxsUmVxdWVzdEF1dG9NZXJnZShwci5ub2RlSWQsIHRoaXMuX2F1dG9NZXJnZU1ldGhvZCwgYXV0aFRva2VuLCBzaWduYWwpO1xuXHRcdFx0XHRhdXRvTWVyZ2VPdXRjb21lID0gJ2VuYWJsZWQnO1xuXHRcdFx0fSBjYXRjaCAoZXJyKSB7XG5cdFx0XHRcdHRoaXMuX3Rocm93SWZDYW5jZWxsZWQodG9rZW4pO1xuXHRcdFx0XHRhdXRvTWVyZ2VFcnJvciA9IGVyciBpbnN0YW5jZW9mIEVycm9yID8gZXJyLm1lc3NhZ2UgOiBTdHJpbmcoZXJyKTtcblx0XHRcdFx0YXV0b01lcmdlT3V0Y29tZSA9ICdmYWlsZWQnO1xuXHRcdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLndhcm4oYFtBZ2VudEhvc3RQdWxsUmVxdWVzdE9wZXJhdGlvbkhhbmRsZXJdIEZhaWxlZCB0byBlbmFibGUgYXV0by1tZXJnZSBmb3IgJHtvd25lcn0vJHtyZXBvfSMke3ByLm51bWJlcn06ICR7YXV0b01lcmdlRXJyb3J9YCk7XG5cdFx0XHR9XG5cdFx0fSBlbHNlIHtcblx0XHRcdGF1dG9NZXJnZUVycm9yID0gbG9jYWxpemUoJ2FnZW50SG9zdC5jaGFuZ2VzZXQucHIuYXV0b01lcmdlLm5vTm9kZUlkJywgXCJ0aGUgcHVsbCByZXF1ZXN0IGlkZW50aWZpZXIgd2FzIG5vdCByZXR1cm5lZCBieSBHaXRIdWIuXCIpO1xuXHRcdFx0YXV0b01lcmdlT3V0Y29tZSA9ICdmYWlsZWQnO1xuXHRcdFx0dGhpcy5fbG9nU2VydmljZS53YXJuKGBbQWdlbnRIb3N0UHVsbFJlcXVlc3RPcGVyYXRpb25IYW5kbGVyXSBDYW5ub3QgZW5hYmxlIGF1dG8tbWVyZ2UgZm9yICR7b3duZXJ9LyR7cmVwb30jJHtwci5udW1iZXJ9OiBtaXNzaW5nIHB1bGwgcmVxdWVzdCBub2RlIGlkYCk7XG5cdFx0fVxuXG5cdFx0dGhpcy5fb25QdWxsUmVxdWVzdENyZWF0ZWQoeyBzZXNzaW9uS2V5OiBzZXNzaW9uVXJpLCBwdWxsUmVxdWVzdFVybDogcHIudXJsLCBicmFuY2hOYW1lIH0pO1xuXHRcdHJldHVybiB0aGlzLl9jcmVhdGVSZXN1bHQocHIsIHRoaXMuX2J1aWxkTWVzc2FnZShwciwgaXNFeGlzdGluZywgYXV0b01lcmdlT3V0Y29tZSwgYXV0b01lcmdlRXJyb3IpKTtcblx0fVxuXG5cdHByaXZhdGUgX2J1aWxkTWVzc2FnZShwcjogQ3JlYXRlZFB1bGxSZXF1ZXN0LCBpc0V4aXN0aW5nOiBib29sZWFuLCBhdXRvTWVyZ2VPdXRjb21lOiAnbm9uZScgfCAnZW5hYmxlZCcgfCAnZmFpbGVkJywgYXV0b01lcmdlRXJyb3I6IHN0cmluZyB8IHVuZGVmaW5lZCk6IHN0cmluZyB7XG5cdFx0bGV0IG1lcmdlTWV0aG9kTGFiZWw6IHN0cmluZyB8IHVuZGVmaW5lZDtcblx0XHRzd2l0Y2ggKHRoaXMuX2F1dG9NZXJnZU1ldGhvZCkge1xuXHRcdFx0Y2FzZSAnU1FVQVNIJzpcblx0XHRcdFx0bWVyZ2VNZXRob2RMYWJlbCA9IGxvY2FsaXplKCdhZ2VudEhvc3QuY2hhbmdlc2V0LnByLmF1dG9NZXJnZS5zcXVhc2gnLCBcInNxdWFzaFwiKTtcblx0XHRcdFx0YnJlYWs7XG5cdFx0XHRjYXNlICdSRUJBU0UnOlxuXHRcdFx0XHRtZXJnZU1ldGhvZExhYmVsID0gbG9jYWxpemUoJ2FnZW50SG9zdC5jaGFuZ2VzZXQucHIuYXV0b01lcmdlLnJlYmFzZScsIFwicmViYXNlXCIpO1xuXHRcdFx0XHRicmVhaztcblx0XHRcdGRlZmF1bHQ6XG5cdFx0XHRcdG1lcmdlTWV0aG9kTGFiZWwgPSBsb2NhbGl6ZSgnYWdlbnRIb3N0LmNoYW5nZXNldC5wci5hdXRvTWVyZ2UubWVyZ2UnLCBcIm1lcmdlXCIpO1xuXHRcdFx0XHRicmVhaztcblx0XHR9XG5cblx0XHRpZiAoaXNFeGlzdGluZykge1xuXHRcdFx0c3dpdGNoIChhdXRvTWVyZ2VPdXRjb21lKSB7XG5cdFx0XHRcdGNhc2UgJ2VuYWJsZWQnOlxuXHRcdFx0XHRcdHJldHVybiBsb2NhbGl6ZSgnYWdlbnRIb3N0LmNoYW5nZXNldC5wci5leGlzdGluZy5hdXRvTWVyZ2UnLCBcIlB1bGwgcmVxdWVzdCBbI3swfV0oezF9KSBhbHJlYWR5IGV4aXN0czsgZW5hYmxlZCBhdXRvLW1lcmdlICh7Mn0pLlwiLCBwci5udW1iZXIsIHByLnVybCwgbWVyZ2VNZXRob2RMYWJlbCk7XG5cdFx0XHRcdGNhc2UgJ2ZhaWxlZCc6XG5cdFx0XHRcdFx0cmV0dXJuIGxvY2FsaXplKCdhZ2VudEhvc3QuY2hhbmdlc2V0LnByLmV4aXN0aW5nLmF1dG9NZXJnZUZhaWxlZCcsIFwiUHVsbCByZXF1ZXN0IFsjezB9XSh7MX0pIGFscmVhZHkgZXhpc3RzLCBidXQgYXV0by1tZXJnZSBjb3VsZCBub3QgYmUgZW5hYmxlZDogezJ9XCIsIHByLm51bWJlciwgcHIudXJsLCBhdXRvTWVyZ2VFcnJvciA/PyAnJyk7XG5cdFx0XHRcdGRlZmF1bHQ6XG5cdFx0XHRcdFx0cmV0dXJuIGxvY2FsaXplKCdhZ2VudEhvc3QuY2hhbmdlc2V0LnByLmV4aXN0aW5nJywgXCJQdWxsIHJlcXVlc3QgWyN7MH1dKHsxfSkgYWxyZWFkeSBleGlzdHMuXCIsIHByLm51bWJlciwgcHIudXJsKTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRzd2l0Y2ggKGF1dG9NZXJnZU91dGNvbWUpIHtcblx0XHRcdGNhc2UgJ2VuYWJsZWQnOlxuXHRcdFx0XHRyZXR1cm4gbG9jYWxpemUoJ2FnZW50SG9zdC5jaGFuZ2VzZXQucHIuY3JlYXRlZC5hdXRvTWVyZ2UnLCBcIkNyZWF0ZWQgcHVsbCByZXF1ZXN0IFsjezB9XSh7MX0pIHdpdGggYXV0by1tZXJnZSAoezJ9KSBlbmFibGVkLlwiLCBwci5udW1iZXIsIHByLnVybCwgbWVyZ2VNZXRob2RMYWJlbCk7XG5cdFx0XHRjYXNlICdmYWlsZWQnOlxuXHRcdFx0XHRyZXR1cm4gbG9jYWxpemUoJ2FnZW50SG9zdC5jaGFuZ2VzZXQucHIuY3JlYXRlZC5hdXRvTWVyZ2VGYWlsZWQnLCBcIkNyZWF0ZWQgcHVsbCByZXF1ZXN0IFsjezB9XSh7MX0pLCBidXQgYXV0by1tZXJnZSBjb3VsZCBub3QgYmUgZW5hYmxlZDogezJ9XCIsIHByLm51bWJlciwgcHIudXJsLCBhdXRvTWVyZ2VFcnJvciA/PyAnJyk7XG5cdFx0XHRkZWZhdWx0OlxuXHRcdFx0XHRyZXR1cm4gdGhpcy5fZHJhZnRcblx0XHRcdFx0XHQ/IGxvY2FsaXplKCdhZ2VudEhvc3QuY2hhbmdlc2V0LnByLmNyZWF0ZWREcmFmdCcsIFwiQ3JlYXRlZCBkcmFmdCBwdWxsIHJlcXVlc3QgWyN7MH1dKHsxfSkuXCIsIHByLm51bWJlciwgcHIudXJsKVxuXHRcdFx0XHRcdDogbG9jYWxpemUoJ2FnZW50SG9zdC5jaGFuZ2VzZXQucHIuY3JlYXRlZCcsIFwiQ3JlYXRlZCBwdWxsIHJlcXVlc3QgWyN7MH1dKHsxfSkuXCIsIHByLm51bWJlciwgcHIudXJsKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIF90aHJvd0lmQ2FuY2VsbGVkKHRva2VuOiBDYW5jZWxsYXRpb25Ub2tlbik6IHZvaWQge1xuXHRcdGlmICh0b2tlbi5pc0NhbmNlbGxhdGlvblJlcXVlc3RlZCkge1xuXHRcdFx0dGhyb3cgbmV3IFByb3RvY29sRXJyb3IoSnNvblJwY0Vycm9yQ29kZXMuSW50ZXJuYWxFcnJvciwgbG9jYWxpemUoJ2FnZW50SG9zdC5jaGFuZ2VzZXQucHIuY2FuY2VsbGVkJywgXCJQdWxsIHJlcXVlc3Qgb3BlcmF0aW9uIHdhcyBjYW5jZWxsZWQuXCIpKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIF9mb3JtYXRUaXRsZShicmFuY2hOYW1lOiBzdHJpbmcpOiBzdHJpbmcge1xuXHRcdC8vIEJlYXV0aWZ5IGEgYnJhbmNoIG5hbWUgbGlrZSBgZmVhdC9mb28tYmFyYCBpbnRvIGBmZWF0OiBmb28gYmFyYC5cblx0XHRjb25zdCBpZHggPSBicmFuY2hOYW1lLmluZGV4T2YoJy8nKTtcblx0XHRpZiAoaWR4ID4gMCAmJiBpZHggPCBicmFuY2hOYW1lLmxlbmd0aCAtIDEpIHtcblx0XHRcdGNvbnN0IHByZWZpeCA9IGJyYW5jaE5hbWUuc3Vic3RyaW5nKDAsIGlkeCk7XG5cdFx0XHRjb25zdCByZXN0ID0gYnJhbmNoTmFtZS5zdWJzdHJpbmcoaWR4ICsgMSkucmVwbGFjZSgvWy1fXSsvZywgJyAnKTtcblx0XHRcdHJldHVybiBgJHtwcmVmaXh9OiAke3Jlc3R9YDtcblx0XHR9XG5cdFx0cmV0dXJuIGJyYW5jaE5hbWUucmVwbGFjZSgvWy1fXSsvZywgJyAnKTtcblx0fVxuXG5cdHByaXZhdGUgX2Zvcm1hdENvbW1pdE1lc3NhZ2UoYnJhbmNoTmFtZTogc3RyaW5nKTogc3RyaW5nIHtcblx0XHRyZXR1cm4gbG9jYWxpemUoJ2FnZW50SG9zdC5jaGFuZ2VzZXQucHIuY29tbWl0TWVzc2FnZScsIFwiQWdlbnQgSG9zdCBjaGFuZ2VzIGZvciB7MH1cIiwgYnJhbmNoTmFtZSk7XG5cdH1cblxuXHRwcml2YXRlIF9mb3JtYXRCb2R5KGJyYW5jaE5hbWU6IHN0cmluZywgYmFzZUJyYW5jaE5hbWU6IHN0cmluZyk6IHN0cmluZyB7XG5cdFx0cmV0dXJuIGxvY2FsaXplKCdhZ2VudEhvc3QuY2hhbmdlc2V0LnByLmJvZHknLCBcIkNyZWF0ZWQgZnJvbSBgezB9YCB0YXJnZXRpbmcgYHsxfWAuXCIsIGJyYW5jaE5hbWUsIGJhc2VCcmFuY2hOYW1lKTtcblx0fVxuXG5cdC8qKlxuXHQgKiBCZXN0LWVmZm9ydCBnZW5lcmF0aW9uIG9mIGEgUFIgdGl0bGUgYW5kIGRlc2NyaXB0aW9uIHVzaW5nIHRoZSB1dGlsaXR5XG5cdCAqIG1vZGVsLiBUaGUgbW9kZWwgaXMgZ2l2ZW4gdGhlIG1haW4gc2Vzc2lvbiBjb252ZXJzYXRpb24gKG9ubHkgdGhlXG5cdCAqIG1hcmtkb3duIHRleHQgb2YgdXNlciByZXF1ZXN0cyBhbmQgYWdlbnQgcmVzcG9uc2VzIFx1MjAxNCB0b29sIGNhbGxzLFxuXHQgKiBzdWJhZ2VudHMsIGFuZCByZWFzb25pbmcgYXJlIGV4Y2x1ZGVkIGFuZCB0aGUgdGV4dCBpcyBjaGFyYWN0ZXItYm91bmRlZClcblx0ICogYWxvbmcgd2l0aCBhIHN1bW1hcnkgb2YgdGhlIGNoYW5nZWQgZmlsZXMuIFJldHVybnMgYHVuZGVmaW5lZGAgd2hlbiBub1xuXHQgKiBDb3BpbG90IHRva2VuIGlzIGF2YWlsYWJsZSBvciBnZW5lcmF0aW9uIGZhaWxzLCBzbyB0aGUgY2FsbGVyIGNhbiBmYWxsXG5cdCAqIGJhY2sgdG8gdGhlIGJyYW5jaC1uYW1lIGJhc2VkIHRpdGxlL2Rlc2NyaXB0aW9uLiBQUiBjcmVhdGlvbiBtdXN0IG5ldmVyXG5cdCAqIGZhaWwganVzdCBiZWNhdXNlIHRoZSBtb2RlbCBpcyB1bmF2YWlsYWJsZS5cblx0ICovXG5cdHByaXZhdGUgYXN5bmMgX2dlbmVyYXRlVGl0bGVBbmREZXNjcmlwdGlvbihcblx0XHRzZXNzaW9uU3RhdGU6IElTZXNzaW9uV2l0aERlZmF1bHRDaGF0LFxuXHRcdGJyYW5jaE5hbWU6IHN0cmluZyxcblx0XHRiYXNlOiBzdHJpbmcsXG5cdFx0YnJhbmNoQ2hhbmdlczogcmVhZG9ubHkgSVNlc3Npb25GaWxlRGlmZltdLFxuXHRcdHNpZ25hbDogQWJvcnRTaWduYWwsXG5cdFx0dG9rZW46IENhbmNlbGxhdGlvblRva2VuLFxuXHQpOiBQcm9taXNlPHsgdGl0bGU6IHN0cmluZzsgZGVzY3JpcHRpb246IHN0cmluZyB9IHwgdW5kZWZpbmVkPiB7XG5cdFx0Y29uc3QgY29waWxvdFJlc291cmNlID0gdGhpcy5fZ2l0SHViRW5kcG9pbnRTZXJ2aWNlLmdldENvcGlsb3RSZXNvdXJjZSgpO1xuXHRcdGNvbnN0IGNvcGlsb3RUb2tlbiA9IHRoaXMuX2FnZW50U2VydmljZS5nZXRBdXRoVG9rZW4oe1xuXHRcdFx0cmVzb3VyY2U6IGNvcGlsb3RSZXNvdXJjZS5yZXNvdXJjZSxcblx0XHRcdHNjb3BlczogY29waWxvdFJlc291cmNlLnNjb3Blc19zdXBwb3J0ZWQsXG5cdFx0fSk7XG5cdFx0aWYgKCFjb3BpbG90VG9rZW4pIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXG5cdFx0Y29uc3QgY29udmVyc2F0aW9uID0gYnVpbGRDb252ZXJzYXRpb25Db250ZXh0KHNlc3Npb25TdGF0ZS50dXJucywgeyBtYXhDaGFyczogTUFYX1BSX0NPTlZFUlNBVElPTl9DT05URVhUX0NIQVJTIH0pO1xuXHRcdGNvbnN0IGNoYW5nZVN1bW1hcnkgPSB0aGlzLl9zdW1tYXJpemVEaWZmc0ZvclByb21wdChicmFuY2hDaGFuZ2VzKTtcblx0XHRpZiAoIWNvbnZlcnNhdGlvbiAmJiAhY2hhbmdlU3VtbWFyeSkge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cblx0XHR0cnkge1xuXHRcdFx0Y29uc3QgcmF3ID0gYXdhaXQgdGhpcy5fY29waWxvdEFwaVNlcnZpY2UudXRpbGl0eUNoYXRDb21wbGV0aW9uKGNvcGlsb3RUb2tlbiwge1xuXHRcdFx0XHRtZXNzYWdlczogdGhpcy5fYnVpbGRUaXRsZUFuZERlc2NyaXB0aW9uUHJvbXB0KGJyYW5jaE5hbWUsIGJhc2UsIGNvbnZlcnNhdGlvbiwgY2hhbmdlU3VtbWFyeSksXG5cdFx0XHR9LCB7IHNpZ25hbCB9KTtcblx0XHRcdHRoaXMuX3Rocm93SWZDYW5jZWxsZWQodG9rZW4pO1xuXHRcdFx0cmV0dXJuIHRoaXMuX3BhcnNlVGl0bGVBbmREZXNjcmlwdGlvbihyYXcpO1xuXHRcdH0gY2F0Y2ggKGVycikge1xuXHRcdFx0aWYgKHRva2VuLmlzQ2FuY2VsbGF0aW9uUmVxdWVzdGVkKSB7XG5cdFx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0XHR9XG5cdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLndhcm4oYFtBZ2VudEhvc3RQdWxsUmVxdWVzdE9wZXJhdGlvbkhhbmRsZXJdIEZhaWxlZCB0byBnZW5lcmF0ZSBQUiB0aXRsZSBhbmQgZGVzY3JpcHRpb246ICR7ZXJyIGluc3RhbmNlb2YgRXJyb3IgPyBlcnIubWVzc2FnZSA6IFN0cmluZyhlcnIpfWApO1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIF9idWlsZFRpdGxlQW5kRGVzY3JpcHRpb25Qcm9tcHQoYnJhbmNoTmFtZTogc3RyaW5nLCBiYXNlOiBzdHJpbmcsIGNvbnZlcnNhdGlvbjogc3RyaW5nIHwgdW5kZWZpbmVkLCBjaGFuZ2VTdW1tYXJ5OiBzdHJpbmcpOiBJQ29waWxvdFV0aWxpdHlDaGF0TWVzc2FnZVtdIHtcblx0XHRjb25zdCB1c2VyU2VjdGlvbnM6IHN0cmluZ1tdID0gW1xuXHRcdFx0YEJyYW5jaDogJHticmFuY2hOYW1lfWAsXG5cdFx0XHRgQmFzZSBicmFuY2g6ICR7YmFzZX1gLFxuXHRcdF07XG5cdFx0aWYgKGNoYW5nZVN1bW1hcnkpIHtcblx0XHRcdHVzZXJTZWN0aW9ucy5wdXNoKGBDaGFuZ2VkIGZpbGVzOlxcbiR7Y2hhbmdlU3VtbWFyeX1gKTtcblx0XHR9XG5cdFx0aWYgKGNvbnZlcnNhdGlvbikge1xuXHRcdFx0dXNlclNlY3Rpb25zLnB1c2goYENvbnZlcnNhdGlvbiAodGhlIHJlcXVlc3QgdGhhdCBwcm9kdWNlZCB0aGVzZSBjaGFuZ2VzKTpcXG4ke2NvbnZlcnNhdGlvbn1gKTtcblx0XHR9XG5cdFx0cmV0dXJuIFtcblx0XHRcdHtcblx0XHRcdFx0cm9sZTogJ3N5c3RlbScsXG5cdFx0XHRcdGNvbnRlbnQ6IFtcblx0XHRcdFx0XHQnWW91IHdyaXRlIGNsZWFyLCBjb25jaXNlIEdpdEh1YiBwdWxsIHJlcXVlc3QgdGl0bGVzIGFuZCBkZXNjcmlwdGlvbnMuJyxcblx0XHRcdFx0XHQnVGhlIGZpcnN0IGxpbmUgb2YgeW91ciByZXBseSBpcyB0aGUgUFIgdGl0bGU6IGEgc2hvcnQgaW1wZXJhdGl2ZSBzdW1tYXJ5IHVuZGVyIDcyIGNoYXJhY3RlcnMsIHdpdGggbm8gXCJUaXRsZTpcIiBwcmVmaXgsIG5vIHN1cnJvdW5kaW5nIHF1b3RlcywgYW5kIG5vIG1hcmtkb3duIGhlYWRpbmcuJyxcblx0XHRcdFx0XHQnQWZ0ZXIgdGhlIHRpdGxlLCBhZGQgb25lIGJsYW5rIGxpbmUsIHRoZW4gd3JpdGUgdGhlIFBSIGRlc2NyaXB0aW9uIGluIEdpdEh1Yi1mbGF2b3JlZCBtYXJrZG93bi4nLFxuXHRcdFx0XHRcdCdTdW1tYXJpemUgd2hhdCBjaGFuZ2VkIGFuZCB3aHksIGdyb3VuZGVkIGluIHRoZSBjb252ZXJzYXRpb24gYW5kIGNoYW5nZWQgZmlsZXMuIFVzZSBhIHNob3J0IHBhcmFncmFwaCBhbmQvb3IgYnVsbGV0IHBvaW50cy4nLFxuXHRcdFx0XHRcdCdEbyBub3QgaW52ZW50IGNoYW5nZXMgdGhhdCBhcmUgbm90IHN1cHBvcnRlZCBieSB0aGUgcHJvdmlkZWQgY29udGV4dCwgYW5kIGRvIG5vdCB3cmFwIHRoZSB3aG9sZSByZXBseSBpbiBjb2RlIGZlbmNlcy4nLFxuXHRcdFx0XHRdLmpvaW4oJyAnKSxcblx0XHRcdH0sXG5cdFx0XHR7XG5cdFx0XHRcdHJvbGU6ICd1c2VyJyxcblx0XHRcdFx0Y29udGVudDogdXNlclNlY3Rpb25zLmpvaW4oJ1xcblxcbicpLFxuXHRcdFx0fSxcblx0XHRdO1xuXHR9XG5cblx0cHJpdmF0ZSBfc3VtbWFyaXplRGlmZnNGb3JQcm9tcHQoZGlmZnM6IHJlYWRvbmx5IElTZXNzaW9uRmlsZURpZmZbXSk6IHN0cmluZyB7XG5cdFx0Y29uc3QgbGluZXM6IHN0cmluZ1tdID0gW107XG5cdFx0bGV0IGxlbmd0aCA9IDA7XG5cdFx0Zm9yIChjb25zdCBkaWZmIG9mIGRpZmZzKSB7XG5cdFx0XHRjb25zdCBiZWZvcmUgPSBkaWZmLmJlZm9yZT8udXJpO1xuXHRcdFx0Y29uc3QgYWZ0ZXIgPSBkaWZmLmFmdGVyPy51cmk7XG5cdFx0XHRjb25zdCBwYXRoID0gYWZ0ZXIgPz8gYmVmb3JlID8/ICcodW5rbm93biknO1xuXHRcdFx0bGV0IGtpbmQgPSAnRWRpdCc7XG5cdFx0XHRpZiAoIWJlZm9yZSAmJiBhZnRlcikge1xuXHRcdFx0XHRraW5kID0gJ0NyZWF0ZSc7XG5cdFx0XHR9IGVsc2UgaWYgKGJlZm9yZSAmJiAhYWZ0ZXIpIHtcblx0XHRcdFx0a2luZCA9ICdEZWxldGUnO1xuXHRcdFx0fSBlbHNlIGlmIChiZWZvcmUgJiYgYWZ0ZXIgJiYgYmVmb3JlICE9PSBhZnRlcikge1xuXHRcdFx0XHRraW5kID0gJ1JlbmFtZSc7XG5cdFx0XHR9XG5cdFx0XHRjb25zdCBsaW5lID0gYC0gJHtraW5kfTogJHt0aGlzLl9kaXNwbGF5VXJpKHBhdGgpfSAoKyR7ZGlmZi5kaWZmPy5hZGRlZCA/PyAwfSAtJHtkaWZmLmRpZmY/LnJlbW92ZWQgPz8gMH0pYDtcblx0XHRcdGxpbmVzLnB1c2gobGluZSk7XG5cdFx0XHQvLyBgKyAxYCBhY2NvdW50cyBmb3IgdGhlIG5ld2xpbmUgdGhhdCBqb2lucyB0aGlzIGxpbmUgdG8gdGhlIHByZXZpb3VzIG9uZS5cblx0XHRcdGxlbmd0aCArPSBsaW5lLmxlbmd0aCArIChsaW5lcy5sZW5ndGggPiAxID8gMSA6IDApO1xuXHRcdFx0aWYgKGxlbmd0aCA+IE1BWF9QUl9DSEFOR0VfU1VNTUFSWV9DSEFSUykge1xuXHRcdFx0XHRsaW5lcy5wdXNoKCdbZmlsZSBsaXN0IHRydW5jYXRlZF0nKTtcblx0XHRcdFx0YnJlYWs7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdHJldHVybiBsaW5lcy5qb2luKCdcXG4nKTtcblx0fVxuXG5cdHByaXZhdGUgX2Rpc3BsYXlVcmkodXJpOiBzdHJpbmcpOiBzdHJpbmcge1xuXHRcdHRyeSB7XG5cdFx0XHRjb25zdCBwYXJzZWQgPSBVUkkucGFyc2UodXJpKTtcblx0XHRcdHJldHVybiBwYXJzZWQuc2NoZW1lID09PSAnZmlsZScgPyBwYXJzZWQuZnNQYXRoIDogcGFyc2VkLnBhdGggfHwgdXJpO1xuXHRcdH0gY2F0Y2gge1xuXHRcdFx0cmV0dXJuIHVyaTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIF9wYXJzZVRpdGxlQW5kRGVzY3JpcHRpb24ocmF3OiBzdHJpbmcpOiB7IHRpdGxlOiBzdHJpbmc7IGRlc2NyaXB0aW9uOiBzdHJpbmcgfSB8IHVuZGVmaW5lZCB7XG5cdFx0bGV0IHRleHQgPSByYXcudHJpbSgpLnJlcGxhY2UoL1xcclxcbi9nLCAnXFxuJyk7XG5cdFx0Y29uc3QgZmVuY2VkID0gL15gYGAoPzptYXJrZG93bnxtZHx0ZXh0KT9cXHMqKFtcXHNcXFNdKj8pXFxzKmBgYCQvaS5leGVjKHRleHQpO1xuXHRcdGlmIChmZW5jZWQpIHtcblx0XHRcdHRleHQgPSBmZW5jZWRbMV0udHJpbSgpO1xuXHRcdH1cblx0XHRpZiAoIXRleHQpIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXG5cdFx0Y29uc3QgbGluZXMgPSB0ZXh0LnNwbGl0KCdcXG4nKTtcblx0XHRsZXQgaSA9IDA7XG5cdFx0d2hpbGUgKGkgPCBsaW5lcy5sZW5ndGggJiYgbGluZXNbaV0udHJpbSgpLmxlbmd0aCA9PT0gMCkge1xuXHRcdFx0aSsrO1xuXHRcdH1cblx0XHRpZiAoaSA+PSBsaW5lcy5sZW5ndGgpIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXG5cdFx0Y29uc3QgdGl0bGUgPSBsaW5lc1tpXS50cmltKClcblx0XHRcdC5yZXBsYWNlKC9eIytcXHMqLywgJycpXG5cdFx0XHQucmVwbGFjZSgvXnRpdGxlOlxccyovaSwgJycpXG5cdFx0XHQudHJpbSgpXG5cdFx0XHQucmVwbGFjZSgvXlwiKD88aW5uZXI+LispXCIkLywgKF9tYXRjaCwgaW5uZXIpID0+IGlubmVyKVxuXHRcdFx0LnRyaW0oKTtcblx0XHRpZiAoIXRpdGxlKSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblxuXHRcdGNvbnN0IGRlc2NyaXB0aW9uID0gbGluZXMuc2xpY2UoaSArIDEpLmpvaW4oJ1xcbicpLnRyaW0oKS5yZXBsYWNlKC9eZGVzY3JpcHRpb246XFxzKi9pLCAnJykudHJpbSgpO1xuXHRcdHJldHVybiB7IHRpdGxlLCBkZXNjcmlwdGlvbiB9O1xuXHR9XG5cblx0cHJpdmF0ZSBfY3JlYXRlUmVzdWx0KGNyZWF0ZWQ6IHsgcmVhZG9ubHkgdXJsOiBzdHJpbmc7IHJlYWRvbmx5IG51bWJlcjogbnVtYmVyIH0sIG1lc3NhZ2U6IHN0cmluZyk6IEludm9rZUNoYW5nZXNldE9wZXJhdGlvblJlc3VsdCB7XG5cdFx0Y29uc3QgZm9sbG93VXA6IENoYW5nZXNldE9wZXJhdGlvbkZvbGxvd1VwID0ge1xuXHRcdFx0Y29udGVudDogeyB1cmk6IGNyZWF0ZWQudXJsLCBjb250ZW50VHlwZTogJ3RleHQvaHRtbCcgfSxcblx0XHRcdGV4dGVybmFsOiB0cnVlLFxuXHRcdH07XG5cdFx0cmV0dXJuIHsgbWVzc2FnZTogeyBtYXJrZG93bjogbWVzc2FnZSB9LCBmb2xsb3dVcCB9O1xuXHR9XG59XG4iXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7OztBQU1BLFNBQVMsV0FBVztBQUNwQixTQUFTLGdCQUFnQjtBQUN6QixTQUFTLHFCQUFxQjtBQUM5QixTQUFTLHVDQUF1QztBQUNoRCxTQUFTLHlCQUF5QjtBQUNsQyxTQUFTLG1CQUFtQix1QkFBdUIsbUJBQW1CLHFCQUFxQjtBQUMzRixTQUFTLHdCQUF3QiwyQkFBaUg7QUFDbEosU0FBUyxtQkFBbUI7QUFDNUIsU0FBUyxzQkFBc0IsK0JBQStCO0FBRTlELFNBQXdELGdDQUFnQztBQUV4RixTQUFTLDBCQUEyRDtBQUNwRSxTQUFTLGdDQUFnQztBQVF6QyxNQUFNLG9DQUFvQztBQU0xQyxNQUFNLDhCQUE4QjtBQTRCN0IsSUFBTSx1Q0FBTixNQUFpRjtBQUFBLEVBUXZGLFlBQ2tCLFFBQ0Esa0JBQ0Esa0JBQ0Esd0JBQ0EsdUJBQ2UsZUFDTyxhQUNJLGlCQUNPLHdCQUNiLG9CQUNQLGFBQzdCO0FBWGdCO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDZTtBQUNPO0FBQ0k7QUFDTztBQUNiO0FBQ1A7QUFBQSxFQUMzQjtBQUFBLEVBRUosTUFBTSxPQUFPLFFBQXdDLE9BQW1FO0FBQ3ZILFVBQU0sa0JBQWtCLElBQUksZ0JBQWdCO0FBQzVDLFFBQUksTUFBTSx5QkFBeUI7QUFDbEMsc0JBQWdCLE1BQU07QUFBQSxJQUN2QjtBQUNBLFVBQU0sdUJBQXVCLE1BQU0sd0JBQXdCLE1BQU0sZ0JBQWdCLE1BQU0sQ0FBQztBQUN4RixRQUFJO0FBQ0gsYUFBTyxNQUFNLEtBQUssUUFBUSxRQUFRLE9BQU8sZ0JBQWdCLE1BQU07QUFBQSxJQUNoRSxVQUFFO0FBQ0QsMkJBQXFCLFFBQVE7QUFBQSxJQUM5QjtBQUFBLEVBQ0Q7QUFBQSxFQUVBLE1BQWMsUUFBUSxRQUF3QyxPQUEwQixRQUE4RDtBQUNySixVQUFNLFNBQVMsa0JBQWtCLE9BQU8sT0FBTztBQUMvQyxRQUFJLENBQUMsUUFBUTtBQUNaLFlBQU0sSUFBSSxjQUFjLGtCQUFrQixlQUFlLHdCQUF3QixPQUFPLE9BQU8sRUFBRTtBQUFBLElBQ2xHO0FBQ0EsU0FBSyxrQkFBa0IsS0FBSztBQUM1QixVQUFNLGFBQWEsT0FBTztBQUUxQixVQUFNLGVBQWUsS0FBSyxpQkFBaUIsVUFBVTtBQUNyRCxRQUFJLENBQUMsY0FBYztBQUNsQixZQUFNLElBQUksY0FBYyx1QkFBdUIsc0JBQXNCLFVBQVUsRUFBRTtBQUFBLElBQ2xGO0FBRUEsVUFBTSxzQkFBc0IsYUFBYSxxQkFBcUIsQ0FBQztBQUMvRCxRQUFJLENBQUMscUJBQXFCO0FBQ3pCLFlBQU0sSUFBSSxjQUFjLGtCQUFrQixlQUFlLHFDQUFxQyxVQUFVLEVBQUU7QUFBQSxJQUMzRztBQUVBLFVBQU0sY0FBYyx1QkFBdUIsYUFBYSxLQUFLO0FBQzdELFFBQUksQ0FBQyxhQUFhLFNBQVMsQ0FBQyxhQUFhLE1BQU07QUFDOUMsWUFBTSxJQUFJO0FBQUEsUUFDVCxrQkFBa0I7QUFBQSxRQUNsQixnRUFBZ0UsVUFBVTtBQUFBLE1BQzNFO0FBQUEsSUFDRDtBQUVBLFVBQU0sbUJBQW1CLElBQUksTUFBTSxtQkFBbUI7QUFDdEQsVUFBTSxpQkFBaUIsb0JBQW9CLGFBQWEsS0FBSztBQUM3RCxVQUFNLHNCQUFzQixNQUFNLEtBQUssdUJBQXVCLFVBQVU7QUFDeEUsVUFBTSxXQUFXLE1BQU0sS0FBSyxZQUFZLG1CQUFtQixrQkFBa0IsbUJBQW1CLEtBQUs7QUFDckcsVUFBTSxhQUFhLFVBQVUsY0FBYyxNQUFNLEtBQUssWUFBWSxpQkFBaUIsZ0JBQWdCO0FBQ25HLFFBQUksQ0FBQyxZQUFZO0FBQ2hCLFlBQU0sSUFBSSxjQUFjLGtCQUFrQixlQUFlLDBDQUEwQyxnQkFBZ0IsRUFBRTtBQUFBLElBQ3RIO0FBRUEsVUFBTSxpQkFBaUIsdUJBQXVCLFVBQVUsbUJBQW1CLE1BQU0sS0FBSyxZQUFZLGlCQUFpQixnQkFBZ0IsSUFBSTtBQUN2SSxRQUFJLENBQUMsZ0JBQWdCO0FBQ3BCLFlBQU0sSUFBSSxjQUFjLGtCQUFrQixlQUFlLHVDQUF1QyxnQkFBZ0IsRUFBRTtBQUFBLElBQ25IO0FBQ0EsVUFBTSxPQUFPO0FBRWIsVUFBTSxlQUFlLEtBQUssdUJBQXVCLGdCQUFnQjtBQUNqRSxVQUFNLFlBQVksS0FBSyxjQUFjLGFBQWE7QUFBQSxNQUNqRCxVQUFVLGFBQWE7QUFBQSxNQUN2QixRQUFRLGFBQWE7QUFBQSxJQUN0QixDQUFDO0FBQ0QsUUFBSSxDQUFDLFdBQVc7QUFDZixZQUFNLElBQUk7QUFBQSxRQUNUO0FBQUEsUUFDQSxTQUFTLHVDQUF1QyxvRUFBb0U7QUFBQSxRQUNwSCxDQUFDLFlBQVk7QUFBQSxNQUNkO0FBQUEsSUFDRDtBQUVBLFVBQU0saUJBQWlCLE1BQU0sS0FBSyxZQUFZLHNCQUFzQixnQkFBZ0I7QUFDcEYsUUFBSSxnQkFBZ0I7QUFDbkIsV0FBSyxrQkFBa0IsS0FBSztBQUM1QixXQUFLLFlBQVksS0FBSyxxRkFBcUYsVUFBVSxFQUFFO0FBQ3ZILFVBQUk7QUFDSCxjQUFNLEtBQUssWUFBWSxVQUFVLGtCQUFrQixLQUFLLHFCQUFxQixVQUFVLENBQUM7QUFBQSxNQUN6RixTQUFTLEtBQUs7QUFDYixhQUFLLGtCQUFrQixLQUFLO0FBQzVCLGNBQU0sSUFBSSxjQUFjLGtCQUFrQixlQUFlLDREQUE0RCxlQUFlLFFBQVEsSUFBSSxVQUFVLE9BQU8sR0FBRyxDQUFDLEVBQUU7QUFBQSxNQUN4SztBQUFBLElBQ0Q7QUFDQSxTQUFLLGtCQUFrQixLQUFLO0FBRTVCLFVBQU0sZ0JBQWdCLE1BQU0sS0FBSyxZQUFZLHdCQUF3QixrQkFBa0IsRUFBRSxZQUFZLFlBQVksS0FBSyxDQUFDO0FBQ3ZILFFBQUksa0JBQWtCLFFBQVc7QUFDaEMsWUFBTSxJQUFJLGNBQWMsa0JBQWtCLGVBQWUsU0FBUywrQ0FBK0MsNERBQTRELENBQUM7QUFBQSxJQUMvSztBQUNBLFFBQUksa0JBQWtCLFVBQWEsY0FBYyxXQUFXLEdBQUc7QUFDOUQsWUFBTSxJQUFJLGNBQWMsa0JBQWtCLGVBQWUsU0FBUyxvQ0FBb0MsMkRBQTJELENBQUM7QUFBQSxJQUNuSztBQUNBLFNBQUssa0JBQWtCLEtBQUs7QUFFNUIsVUFBTSxrQkFBa0IsVUFBVTtBQUNsQyxVQUFNLGlCQUFpQixrQkFBa0Isd0JBQXdCLFNBQVMsa0JBQWtCLElBQUk7QUFDaEcsVUFBTSxZQUFZLGtCQUFrQixrQkFBa0Isa0JBQWtCLFlBQVk7QUFDcEYsVUFBTSxhQUFhLGdCQUFnQixVQUFVO0FBQzdDLFVBQU0sVUFBVSxlQUFlLGFBQWEsYUFBYSxHQUFHLFVBQVUsSUFBSSxVQUFVO0FBQ3BGLFVBQU0sYUFBYSxjQUFjLFlBQVksUUFBUSxhQUFhLEdBQUcsU0FBUyxJQUFJLFVBQVU7QUFFNUYsU0FBSyxZQUFZLEtBQUsseURBQXlELFVBQVUsT0FBTyxnQkFBZ0IsVUFBVSxRQUFRLGdCQUFnQixVQUFVLEVBQUU7QUFDOUosVUFBTSxrQkFBa0IsTUFBTSxLQUFLLFlBQVksWUFBWSxrQkFBa0IsVUFBVTtBQUN2RixTQUFLLGtCQUFrQixLQUFLO0FBQzVCLFFBQUk7QUFDSCxZQUFNLEtBQUssWUFBWSxLQUFLLGtCQUFrQixFQUFFLFFBQVEsZ0JBQWdCLFFBQVEsS0FBSyxTQUFTLGFBQWEsQ0FBQyxnQkFBZ0IsQ0FBQztBQUFBLElBQzlILFNBQVMsS0FBSztBQUNiLFdBQUssa0JBQWtCLEtBQUs7QUFDNUIsWUFBTSxJQUFJLGNBQWMsa0JBQWtCLGVBQWUsMEJBQTBCLFVBQVUsTUFBTSxlQUFlLFFBQVEsSUFBSSxVQUFVLE9BQU8sR0FBRyxDQUFDLEVBQUU7QUFBQSxJQUN0SjtBQUNBLFNBQUssa0JBQWtCLEtBQUs7QUFFNUIsVUFBTSxXQUFXLE1BQU0sS0FBSyxnQkFBZ0IsNEJBQTRCLFlBQVksT0FBTyxZQUFZLE1BQU0sWUFBWSxXQUFXLFFBQVEsU0FBUztBQUNySixRQUFJLFVBQVU7QUFDYixXQUFLLGtCQUFrQixLQUFLO0FBQzVCLGFBQU8sTUFBTSxLQUFLLFVBQVUsVUFBVSxNQUFNLFlBQVksWUFBWSxPQUFPLFlBQVksTUFBTSxZQUFZLFdBQVcsUUFBUSxLQUFLO0FBQUEsSUFDbEk7QUFDQSxTQUFLLGtCQUFrQixLQUFLO0FBRTVCLFVBQU0sWUFBWSxNQUFNLEtBQUssNkJBQTZCLGNBQWMsWUFBWSxNQUFNLGVBQWUsUUFBUSxLQUFLO0FBQ3RILFNBQUssa0JBQWtCLEtBQUs7QUFDNUIsVUFBTSxRQUFRLFdBQVcsU0FBUyxLQUFLLGFBQWEsVUFBVTtBQUM5RCxVQUFNLE9BQU8sV0FBVyxlQUFlLEtBQUssWUFBWSxZQUFZLElBQUk7QUFFeEUsU0FBSyxZQUFZLEtBQUssbURBQW1ELEtBQUssU0FBUyxXQUFXLEVBQUUsTUFBTSxZQUFZLEtBQUssSUFBSSxZQUFZLElBQUksSUFBSSxVQUFVLE9BQU8sSUFBSSxFQUFFO0FBQzFLLFFBQUk7QUFDSixRQUFJO0FBQ0gsZ0JBQVUsTUFBTSxLQUFLLGdCQUFnQjtBQUFBLFFBQ3BDLFlBQVk7QUFBQSxRQUNaLFlBQVk7QUFBQSxRQUNaO0FBQUEsUUFDQTtBQUFBLFFBQ0E7QUFBQSxRQUNBO0FBQUEsUUFDQSxLQUFLO0FBQUEsUUFDTDtBQUFBLFFBQ0E7QUFBQSxNQUNEO0FBQUEsSUFDRCxTQUFTLEtBQUs7QUFDYixXQUFLLGtCQUFrQixLQUFLO0FBQzVCLFVBQUk7QUFDSixVQUFJO0FBQ0gsNEJBQW9CLE1BQU0sS0FBSyxnQkFBZ0IsNEJBQTRCLFlBQVksT0FBTyxZQUFZLE1BQU0sWUFBWSxXQUFXLFFBQVEsU0FBUztBQUFBLE1BQ3pKLFFBQVE7QUFDUCxhQUFLLGtCQUFrQixLQUFLO0FBQzVCLGNBQU07QUFBQSxNQUNQO0FBQ0EsVUFBSSxtQkFBbUI7QUFDdEIsYUFBSyxrQkFBa0IsS0FBSztBQUM1QixlQUFPLE1BQU0sS0FBSyxVQUFVLG1CQUFtQixNQUFNLFlBQVksWUFBWSxPQUFPLFlBQVksTUFBTSxZQUFZLFdBQVcsUUFBUSxLQUFLO0FBQUEsTUFDM0k7QUFDQSxZQUFNO0FBQUEsSUFDUDtBQUNBLFNBQUssa0JBQWtCLEtBQUs7QUFDNUIsV0FBTyxNQUFNLEtBQUssVUFBVSxTQUFTLE9BQU8sWUFBWSxZQUFZLE9BQU8sWUFBWSxNQUFNLFlBQVksV0FBVyxRQUFRLEtBQUs7QUFBQSxFQUNsSTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBLEVBUUEsTUFBYyxVQUNiLElBQ0EsWUFDQSxZQUNBLE9BQ0EsTUFDQSxZQUNBLFdBQ0EsUUFDQSxPQUMwQztBQUMxQyxRQUFJLENBQUMsS0FBSyxrQkFBa0I7QUFFM0IsV0FBSyxzQkFBc0IsRUFBRSxZQUFZLFlBQVksZ0JBQWdCLEdBQUcsS0FBSyxXQUFXLENBQUM7QUFDekYsYUFBTyxLQUFLLGNBQWMsSUFBSSxLQUFLLGNBQWMsSUFBSSxZQUFZLFFBQVEsTUFBUyxDQUFDO0FBQUEsSUFDcEY7QUFFQSxRQUFJO0FBQ0osUUFBSSxtQkFBa0Q7QUFFdEQsUUFBSSxHQUFHLFFBQVE7QUFDZCxVQUFJO0FBQ0gsY0FBTSxLQUFLLGdCQUFnQiwyQkFBMkIsR0FBRyxRQUFRLEtBQUssa0JBQWtCLFdBQVcsTUFBTTtBQUN6RywyQkFBbUI7QUFBQSxNQUNwQixTQUFTLEtBQUs7QUFDYixhQUFLLGtCQUFrQixLQUFLO0FBQzVCLHlCQUFpQixlQUFlLFFBQVEsSUFBSSxVQUFVLE9BQU8sR0FBRztBQUNoRSwyQkFBbUI7QUFDbkIsYUFBSyxZQUFZLEtBQUssMEVBQTBFLEtBQUssSUFBSSxJQUFJLElBQUksR0FBRyxNQUFNLEtBQUssY0FBYyxFQUFFO0FBQUEsTUFDaEo7QUFBQSxJQUNELE9BQU87QUFDTix1QkFBaUIsU0FBUyw2Q0FBNkMseURBQXlEO0FBQ2hJLHlCQUFtQjtBQUNuQixXQUFLLFlBQVksS0FBSyx1RUFBdUUsS0FBSyxJQUFJLElBQUksSUFBSSxHQUFHLE1BQU0sZ0NBQWdDO0FBQUEsSUFDeEo7QUFFQSxTQUFLLHNCQUFzQixFQUFFLFlBQVksWUFBWSxnQkFBZ0IsR0FBRyxLQUFLLFdBQVcsQ0FBQztBQUN6RixXQUFPLEtBQUssY0FBYyxJQUFJLEtBQUssY0FBYyxJQUFJLFlBQVksa0JBQWtCLGNBQWMsQ0FBQztBQUFBLEVBQ25HO0FBQUEsRUFFUSxjQUFjLElBQXdCLFlBQXFCLGtCQUFpRCxnQkFBNEM7QUFDL0osUUFBSTtBQUNKLFlBQVEsS0FBSyxrQkFBa0I7QUFBQSxNQUM5QixLQUFLO0FBQ0osMkJBQW1CLFNBQVMsMkNBQTJDLFFBQVE7QUFDL0U7QUFBQSxNQUNELEtBQUs7QUFDSiwyQkFBbUIsU0FBUywyQ0FBMkMsUUFBUTtBQUMvRTtBQUFBLE1BQ0Q7QUFDQywyQkFBbUIsU0FBUywwQ0FBMEMsT0FBTztBQUM3RTtBQUFBLElBQ0Y7QUFFQSxRQUFJLFlBQVk7QUFDZixjQUFRLGtCQUFrQjtBQUFBLFFBQ3pCLEtBQUs7QUFDSixpQkFBTyxTQUFTLDZDQUE2QyxzRUFBc0UsR0FBRyxRQUFRLEdBQUcsS0FBSyxnQkFBZ0I7QUFBQSxRQUN2SyxLQUFLO0FBQ0osaUJBQU8sU0FBUyxtREFBbUQscUZBQXFGLEdBQUcsUUFBUSxHQUFHLEtBQUssa0JBQWtCLEVBQUU7QUFBQSxRQUNoTTtBQUNDLGlCQUFPLFNBQVMsbUNBQW1DLDRDQUE0QyxHQUFHLFFBQVEsR0FBRyxHQUFHO0FBQUEsTUFDbEg7QUFBQSxJQUNEO0FBRUEsWUFBUSxrQkFBa0I7QUFBQSxNQUN6QixLQUFLO0FBQ0osZUFBTyxTQUFTLDRDQUE0QyxtRUFBbUUsR0FBRyxRQUFRLEdBQUcsS0FBSyxnQkFBZ0I7QUFBQSxNQUNuSyxLQUFLO0FBQ0osZUFBTyxTQUFTLGtEQUFrRCw4RUFBOEUsR0FBRyxRQUFRLEdBQUcsS0FBSyxrQkFBa0IsRUFBRTtBQUFBLE1BQ3hMO0FBQ0MsZUFBTyxLQUFLLFNBQ1QsU0FBUyx1Q0FBdUMsMkNBQTJDLEdBQUcsUUFBUSxHQUFHLEdBQUcsSUFDNUcsU0FBUyxrQ0FBa0MscUNBQXFDLEdBQUcsUUFBUSxHQUFHLEdBQUc7QUFBQSxJQUN0RztBQUFBLEVBQ0Q7QUFBQSxFQUVRLGtCQUFrQixPQUFnQztBQUN6RCxRQUFJLE1BQU0seUJBQXlCO0FBQ2xDLFlBQU0sSUFBSSxjQUFjLGtCQUFrQixlQUFlLFNBQVMsb0NBQW9DLHVDQUF1QyxDQUFDO0FBQUEsSUFDL0k7QUFBQSxFQUNEO0FBQUEsRUFFUSxhQUFhLFlBQTRCO0FBRWhELFVBQU0sTUFBTSxXQUFXLFFBQVEsR0FBRztBQUNsQyxRQUFJLE1BQU0sS0FBSyxNQUFNLFdBQVcsU0FBUyxHQUFHO0FBQzNDLFlBQU0sU0FBUyxXQUFXLFVBQVUsR0FBRyxHQUFHO0FBQzFDLFlBQU0sT0FBTyxXQUFXLFVBQVUsTUFBTSxDQUFDLEVBQUUsUUFBUSxVQUFVLEdBQUc7QUFDaEUsYUFBTyxHQUFHLE1BQU0sS0FBSyxJQUFJO0FBQUEsSUFDMUI7QUFDQSxXQUFPLFdBQVcsUUFBUSxVQUFVLEdBQUc7QUFBQSxFQUN4QztBQUFBLEVBRVEscUJBQXFCLFlBQTRCO0FBQ3hELFdBQU8sU0FBUyx3Q0FBd0MsOEJBQThCLFVBQVU7QUFBQSxFQUNqRztBQUFBLEVBRVEsWUFBWSxZQUFvQixnQkFBZ0M7QUFDdkUsV0FBTyxTQUFTLCtCQUErQix1Q0FBdUMsWUFBWSxjQUFjO0FBQUEsRUFDakg7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBLEVBWUEsTUFBYyw2QkFDYixjQUNBLFlBQ0EsTUFDQSxlQUNBLFFBQ0EsT0FDOEQ7QUFDOUQsVUFBTSxrQkFBa0IsS0FBSyx1QkFBdUIsbUJBQW1CO0FBQ3ZFLFVBQU0sZUFBZSxLQUFLLGNBQWMsYUFBYTtBQUFBLE1BQ3BELFVBQVUsZ0JBQWdCO0FBQUEsTUFDMUIsUUFBUSxnQkFBZ0I7QUFBQSxJQUN6QixDQUFDO0FBQ0QsUUFBSSxDQUFDLGNBQWM7QUFDbEIsYUFBTztBQUFBLElBQ1I7QUFFQSxVQUFNLGVBQWUseUJBQXlCLGFBQWEsT0FBTyxFQUFFLFVBQVUsa0NBQWtDLENBQUM7QUFDakgsVUFBTSxnQkFBZ0IsS0FBSyx5QkFBeUIsYUFBYTtBQUNqRSxRQUFJLENBQUMsZ0JBQWdCLENBQUMsZUFBZTtBQUNwQyxhQUFPO0FBQUEsSUFDUjtBQUVBLFFBQUk7QUFDSCxZQUFNLE1BQU0sTUFBTSxLQUFLLG1CQUFtQixzQkFBc0IsY0FBYztBQUFBLFFBQzdFLFVBQVUsS0FBSyxnQ0FBZ0MsWUFBWSxNQUFNLGNBQWMsYUFBYTtBQUFBLE1BQzdGLEdBQUcsRUFBRSxPQUFPLENBQUM7QUFDYixXQUFLLGtCQUFrQixLQUFLO0FBQzVCLGFBQU8sS0FBSywwQkFBMEIsR0FBRztBQUFBLElBQzFDLFNBQVMsS0FBSztBQUNiLFVBQUksTUFBTSx5QkFBeUI7QUFDbEMsZUFBTztBQUFBLE1BQ1I7QUFDQSxXQUFLLFlBQVksS0FBSyx1RkFBdUYsZUFBZSxRQUFRLElBQUksVUFBVSxPQUFPLEdBQUcsQ0FBQyxFQUFFO0FBQy9KLGFBQU87QUFBQSxJQUNSO0FBQUEsRUFDRDtBQUFBLEVBRVEsZ0NBQWdDLFlBQW9CLE1BQWMsY0FBa0MsZUFBcUQ7QUFDaEssVUFBTSxlQUF5QjtBQUFBLE1BQzlCLFdBQVcsVUFBVTtBQUFBLE1BQ3JCLGdCQUFnQixJQUFJO0FBQUEsSUFDckI7QUFDQSxRQUFJLGVBQWU7QUFDbEIsbUJBQWEsS0FBSztBQUFBLEVBQW1CLGFBQWEsRUFBRTtBQUFBLElBQ3JEO0FBQ0EsUUFBSSxjQUFjO0FBQ2pCLG1CQUFhLEtBQUs7QUFBQSxFQUE0RCxZQUFZLEVBQUU7QUFBQSxJQUM3RjtBQUNBLFdBQU87QUFBQSxNQUNOO0FBQUEsUUFDQyxNQUFNO0FBQUEsUUFDTixTQUFTO0FBQUEsVUFDUjtBQUFBLFVBQ0E7QUFBQSxVQUNBO0FBQUEsVUFDQTtBQUFBLFVBQ0E7QUFBQSxRQUNELEVBQUUsS0FBSyxHQUFHO0FBQUEsTUFDWDtBQUFBLE1BQ0E7QUFBQSxRQUNDLE1BQU07QUFBQSxRQUNOLFNBQVMsYUFBYSxLQUFLLE1BQU07QUFBQSxNQUNsQztBQUFBLElBQ0Q7QUFBQSxFQUNEO0FBQUEsRUFFUSx5QkFBeUIsT0FBNEM7QUFDNUUsVUFBTSxRQUFrQixDQUFDO0FBQ3pCLFFBQUksU0FBUztBQUNiLGVBQVcsUUFBUSxPQUFPO0FBQ3pCLFlBQU0sU0FBUyxLQUFLLFFBQVE7QUFDNUIsWUFBTSxRQUFRLEtBQUssT0FBTztBQUMxQixZQUFNLE9BQU8sU0FBUyxVQUFVO0FBQ2hDLFVBQUksT0FBTztBQUNYLFVBQUksQ0FBQyxVQUFVLE9BQU87QUFDckIsZUFBTztBQUFBLE1BQ1IsV0FBVyxVQUFVLENBQUMsT0FBTztBQUM1QixlQUFPO0FBQUEsTUFDUixXQUFXLFVBQVUsU0FBUyxXQUFXLE9BQU87QUFDL0MsZUFBTztBQUFBLE1BQ1I7QUFDQSxZQUFNLE9BQU8sS0FBSyxJQUFJLEtBQUssS0FBSyxZQUFZLElBQUksQ0FBQyxNQUFNLEtBQUssTUFBTSxTQUFTLENBQUMsS0FBSyxLQUFLLE1BQU0sV0FBVyxDQUFDO0FBQ3hHLFlBQU0sS0FBSyxJQUFJO0FBRWYsZ0JBQVUsS0FBSyxVQUFVLE1BQU0sU0FBUyxJQUFJLElBQUk7QUFDaEQsVUFBSSxTQUFTLDZCQUE2QjtBQUN6QyxjQUFNLEtBQUssdUJBQXVCO0FBQ2xDO0FBQUEsTUFDRDtBQUFBLElBQ0Q7QUFDQSxXQUFPLE1BQU0sS0FBSyxJQUFJO0FBQUEsRUFDdkI7QUFBQSxFQUVRLFlBQVksS0FBcUI7QUFDeEMsUUFBSTtBQUNILFlBQU0sU0FBUyxJQUFJLE1BQU0sR0FBRztBQUM1QixhQUFPLE9BQU8sV0FBVyxTQUFTLE9BQU8sU0FBUyxPQUFPLFFBQVE7QUFBQSxJQUNsRSxRQUFRO0FBQ1AsYUFBTztBQUFBLElBQ1I7QUFBQSxFQUNEO0FBQUEsRUFFUSwwQkFBMEIsS0FBaUU7QUFDbEcsUUFBSSxPQUFPLElBQUksS0FBSyxFQUFFLFFBQVEsU0FBUyxJQUFJO0FBQzNDLFVBQU0sU0FBUyxpREFBaUQsS0FBSyxJQUFJO0FBQ3pFLFFBQUksUUFBUTtBQUNYLGFBQU8sT0FBTyxDQUFDLEVBQUUsS0FBSztBQUFBLElBQ3ZCO0FBQ0EsUUFBSSxDQUFDLE1BQU07QUFDVixhQUFPO0FBQUEsSUFDUjtBQUVBLFVBQU0sUUFBUSxLQUFLLE1BQU0sSUFBSTtBQUM3QixRQUFJLElBQUk7QUFDUixXQUFPLElBQUksTUFBTSxVQUFVLE1BQU0sQ0FBQyxFQUFFLEtBQUssRUFBRSxXQUFXLEdBQUc7QUFDeEQ7QUFBQSxJQUNEO0FBQ0EsUUFBSSxLQUFLLE1BQU0sUUFBUTtBQUN0QixhQUFPO0FBQUEsSUFDUjtBQUVBLFVBQU0sUUFBUSxNQUFNLENBQUMsRUFBRSxLQUFLLEVBQzFCLFFBQVEsVUFBVSxFQUFFLEVBQ3BCLFFBQVEsZUFBZSxFQUFFLEVBQ3pCLEtBQUssRUFDTCxRQUFRLG9CQUFvQixDQUFDLFFBQVEsVUFBVSxLQUFLLEVBQ3BELEtBQUs7QUFDUCxRQUFJLENBQUMsT0FBTztBQUNYLGFBQU87QUFBQSxJQUNSO0FBRUEsVUFBTSxjQUFjLE1BQU0sTUFBTSxJQUFJLENBQUMsRUFBRSxLQUFLLElBQUksRUFBRSxLQUFLLEVBQUUsUUFBUSxxQkFBcUIsRUFBRSxFQUFFLEtBQUs7QUFDL0YsV0FBTyxFQUFFLE9BQU8sWUFBWTtBQUFBLEVBQzdCO0FBQUEsRUFFUSxjQUFjLFNBQTRELFNBQWlEO0FBQ2xJLFVBQU0sV0FBdUM7QUFBQSxNQUM1QyxTQUFTLEVBQUUsS0FBSyxRQUFRLEtBQUssYUFBYSxZQUFZO0FBQUEsTUFDdEQsVUFBVTtBQUFBLElBQ1g7QUFDQSxXQUFPLEVBQUUsU0FBUyxFQUFFLFVBQVUsUUFBUSxHQUFHLFNBQVM7QUFBQSxFQUNuRDtBQUNEO0FBbmJhLHFDQUVXLHNCQUFzQjtBQUZqQyxxQ0FHVyw0QkFBNEI7QUFIdkMscUNBSVcsaUNBQWlDO0FBSjVDLHFDQUtXLGtDQUFrQztBQUw3QyxxQ0FNVyxrQ0FBa0M7QUFON0MsdUNBQU47QUFBQSxFQWNKO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxHQW5CVTsiLAogICJuYW1lcyI6IFtdCn0K
