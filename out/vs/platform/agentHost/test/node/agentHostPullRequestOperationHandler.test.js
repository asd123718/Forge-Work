import assert from "assert";
import { CancellationToken, CancellationTokenSource } from "../../../../base/common/cancellation.js";
import { URI } from "../../../../base/common/uri.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../base/test/common/utils.js";
import { NullLogService } from "../../../log/common/log.js";
import { GITHUB_COPILOT_PROTECTED_RESOURCE, GITHUB_REPO_PROTECTED_RESOURCE } from "../../common/agent.js";
import { buildSessionChangesetUri } from "../../common/changesetUri.js";
import { SessionConfigKey } from "../../common/sessionConfigKeys.js";
import { withSessionGitHubState, withSessionGitState, MessageKind, ResponsePartKind, SessionStatus, TurnState } from "../../common/state/sessionState.js";
import { AgentHostPullRequestOperationHandler } from "../../node/agentHostPullRequestOperationHandler.js";
import { createTestGitHubEndpointService } from "./testGitHubEndpointService.js";
import { AgentHostStateManager } from "../../node/agentHostStateManager.js";
class TestCopilotApiService {
  constructor() {
    this.calls = [];
    this.response = "Generated PR title\n\nGenerated PR description.";
  }
  messages() {
    throw new Error("not used");
  }
  async countTokens() {
    throw new Error("not used");
  }
  async models() {
    return [];
  }
  async responses() {
    throw new Error("not used");
  }
  async resolveRestrictedTelemetryContext() {
    return { restrictedTelemetryEnabled: false, trackingId: void 0, telemetryEndpoint: void 0 };
  }
  async resolveApiEndpoint() {
    return void 0;
  }
  async utilityChatCompletion(githubToken, request, options) {
    this.calls.push({ token: githubToken, request, options });
    if (this.error) {
      throw this.error;
    }
    return this.response;
  }
}
class TestGitService {
  constructor() {
    this.calls = [];
    this.requestedBaseBranches = [];
    this.pushOptions = [];
    this.uncommitted = false;
    this.upstream = false;
    this.branchChanges = [{ after: { uri: "file:///repo/file.ts", content: { uri: "file:///repo/file.ts" } } }];
  }
  async getCurrentBranch() {
    return "feature/test";
  }
  async getDefaultBranch() {
    return { name: "main", startPoint: "main" };
  }
  async getBranch() {
    return void 0;
  }
  async getRefs() {
    return [];
  }
  async getBranches() {
    return [];
  }
  async getRepositoryRoot() {
    return URI.file("/repo");
  }
  async getWorktreeRoots() {
    return [];
  }
  async addWorktree() {
  }
  async copyWorktreeIncludeFiles() {
  }
  async addExistingWorktree() {
  }
  async removeWorktree() {
  }
  async branchExists() {
    return false;
  }
  async hasUncommittedChanges() {
    this.calls.push("hasUncommittedChanges");
    return this.uncommitted;
  }
  async commitAll(_workingDirectory, message) {
    this.calls.push(`commitAll:${message}`);
    this.uncommitted = false;
  }
  async mergeBranch() {
    return "";
  }
  async restore() {
  }
  async hasUpstream() {
    this.calls.push("hasUpstream");
    return this.upstream;
  }
  async pull() {
  }
  async push(_workingDirectory, options) {
    this.calls.push(`push:${options.ref}:${options.setUpstream}`);
    this.pushOptions.push(options);
  }
  async getSessionGitState(_workingDirectory, baseBranchName) {
    this.requestedBaseBranches.push(baseBranchName);
    return this.gitState;
  }
  async computeSessionFileDiffs() {
    this.calls.push("computeSessionFileDiffs");
    return this.branchChanges;
  }
  async showBlob() {
    return void 0;
  }
  async captureWorkingTreeAsTree() {
    return void 0;
  }
  async commitTree() {
    return void 0;
  }
  async updateRef() {
  }
  async deleteRefs() {
  }
  async revParse() {
    return void 0;
  }
  async resolveBranchBaselineCommit() {
    return void 0;
  }
  async overlayPathIntoTree() {
    return void 0;
  }
  async diffTreePaths() {
    return void 0;
  }
  async computeFileDiffsBetweenRefs() {
    return void 0;
  }
  async getFetchRemoteUrls() {
    return void 0;
  }
  async getUntrackedPaths() {
    return [];
  }
  async getBranchDiffSafetyInfo() {
    return void 0;
  }
  async getDiffPatchBetweenRefs() {
    return void 0;
  }
}
class TestOctoKitService {
  constructor() {
    this.calls = [];
    this.created = { url: "https://github.com/microsoft/vscode/pull/123", number: 123, nodeId: "PR_node_123" };
    this.findRequests = [];
  }
  async createPullRequest(_owner, _repo, title, body, head, base, draft, _token, _signal) {
    this.calls.push(`createPullRequest:${draft}`);
    this.lastTitle = title;
    this.lastBody = body;
    this.lastHead = head;
    this.lastBase = base;
    if (this.createError) {
      throw this.createError;
    }
    return this.created;
  }
  async findPullRequestByHeadBranch(_owner, _repo, branch, _token, _signal, headOwner) {
    this.calls.push(`findPullRequestByHeadBranch:${branch}`);
    this.findRequests.push({ branch, headOwner });
    if (this.calls.some((call) => call.startsWith("createPullRequest:"))) {
      if (this.findAfterCreateError) {
        throw this.findAfterCreateError;
      }
      return this.existingAfterCreateFailure;
    }
    return this.existing;
  }
  async getIssueOrPullRequest() {
    throw new Error("not used");
  }
  async findPullRequestByHeadSha() {
    throw new Error("not used");
  }
  async enablePullRequestAutoMerge(pullRequestId, mergeMethod, _token, _signal) {
    this.calls.push(`enablePullRequestAutoMerge:${pullRequestId}:${mergeMethod}`);
    if (this.autoMergeError) {
      throw this.autoMergeError;
    }
  }
}
function createAgentService(withCopilotToken = false) {
  return {
    getAuthToken: (resource) => {
      if (resource.resource === GITHUB_REPO_PROTECTED_RESOURCE.resource) {
        return "gh-token";
      }
      if (withCopilotToken && resource.resource === GITHUB_COPILOT_PROTECTED_RESOURCE.resource) {
        return "copilot-token";
      }
      return void 0;
    }
  };
}
function setup(disposables, gitService, octoKitService, options) {
  const stateManager = disposables.add(new AgentHostStateManager(new NullLogService()));
  const session = URI.parse("agent:/session");
  const createdEvents = [];
  stateManager.createSession({
    resource: session.toString(),
    provider: "copilot",
    title: "Session",
    status: SessionStatus.Idle,
    createdAt: (/* @__PURE__ */ new Date(1)).toISOString(),
    modifiedAt: (/* @__PURE__ */ new Date(1)).toISOString(),
    workingDirectories: [URI.file("/repo").toString()]
  });
  if (options?.baseBranch) {
    stateManager.setSessionConfig(session.toString(), {
      schema: { type: "object", properties: {} },
      values: {
        [SessionConfigKey.Isolation]: "worktree",
        [SessionConfigKey.Branch]: options.baseBranch
      }
    });
  }
  const sessionMeta = withSessionGitHubState(withSessionGitState(void 0, {
    hasGitHubRemote: true,
    githubOwner: "microsoft",
    githubRepo: "vscode",
    branchName: "feature/test",
    baseBranchName: options?.baseBranch ?? "main"
  }), {
    owner: "microsoft",
    repo: "vscode"
  });
  stateManager.setSessionMeta(session.toString(), sessionMeta);
  const copilotApiService = options?.copilotApiService ?? new TestCopilotApiService();
  return {
    handler: new AgentHostPullRequestOperationHandler(
      options?.draft ?? false,
      options?.autoMergeMethod,
      (sessionKey) => {
        const state = stateManager.getSessionState(sessionKey);
        if (state && options?.turns) {
          return { ...state, turns: options.turns };
        }
        return state;
      },
      async () => options?.baseBranch ?? "main",
      (event) => createdEvents.push(`${event.sessionKey}:${event.pullRequestUrl}`),
      createAgentService(options?.withCopilotToken),
      gitService,
      octoKitService,
      createTestGitHubEndpointService(),
      copilotApiService,
      new NullLogService()
    ),
    session,
    createdEvents,
    copilotApiService
  };
}
suite("AgentHostPullRequestOperationHandler", () => {
  const disposables = ensureNoDisposablesAreLeakedInTestSuite();
  test("commits uncommitted changes before pushing and creating a pull request", async () => {
    const gitService = new TestGitService();
    gitService.uncommitted = true;
    const octoKitService = new TestOctoKitService();
    const { handler, session, createdEvents } = setup(disposables, gitService, octoKitService, { baseBranch: "release" });
    const result = await handler.invoke({ channel: buildSessionChangesetUri(session.toString()), operationId: AgentHostPullRequestOperationHandler.OPERATION_CREATE_PR }, CancellationToken.None);
    assert.deepStrictEqual({
      message: result.message,
      gitCalls: gitService.calls,
      requestedBaseBranches: gitService.requestedBaseBranches,
      pullRequestBase: octoKitService.lastBase,
      octoCalls: octoKitService.calls,
      createdEvents
    }, {
      message: { markdown: "Created pull request [#123](https://github.com/microsoft/vscode/pull/123)." },
      gitCalls: [
        "hasUncommittedChanges",
        "commitAll:Agent Host changes for feature/test",
        "computeSessionFileDiffs",
        "hasUpstream",
        "push:feature/test:true"
      ],
      requestedBaseBranches: ["release"],
      pullRequestBase: "release",
      octoCalls: [
        "findPullRequestByHeadBranch:feature/test",
        "createPullRequest:false"
      ],
      createdEvents: ["agent:/session:https://github.com/microsoft/vscode/pull/123"]
    });
  });
  test("pushes, finds, and creates with the same fork upstream", async () => {
    const gitService = new TestGitService();
    gitService.upstream = true;
    gitService.gitState = {
      branchName: "feature/test",
      baseBranchName: "main",
      upstreamBranchName: "fork/published-feature",
      githubOwner: "microsoft",
      githubHeadOwner: "fork-owner",
      githubRepo: "vscode"
    };
    const octoKitService = new TestOctoKitService();
    const { handler, session } = setup(disposables, gitService, octoKitService);
    await handler.invoke({ channel: buildSessionChangesetUri(session.toString()), operationId: AgentHostPullRequestOperationHandler.OPERATION_CREATE_PR }, CancellationToken.None);
    assert.deepStrictEqual({
      pushOptions: gitService.pushOptions,
      findRequests: octoKitService.findRequests,
      createHead: octoKitService.lastHead
    }, {
      pushOptions: [{ remote: "fork", ref: "feature/test:published-feature", setUpstream: false }],
      findRequests: [{ branch: "published-feature", headOwner: "fork-owner" }],
      createHead: "fork-owner:published-feature"
    });
  });
  test("returns an existing pull request without creating a duplicate", async () => {
    const gitService = new TestGitService();
    const octoKitService = new TestOctoKitService();
    octoKitService.existing = { url: "https://github.com/microsoft/vscode/pull/7", number: 7 };
    const { handler, session, createdEvents } = setup(disposables, gitService, octoKitService);
    const result = await handler.invoke({ channel: buildSessionChangesetUri(session.toString()), operationId: AgentHostPullRequestOperationHandler.OPERATION_CREATE_PR }, CancellationToken.None);
    assert.deepStrictEqual({
      message: result.message,
      octoCalls: octoKitService.calls,
      followUp: result.followUp,
      createdEvents
    }, {
      message: { markdown: "Pull request [#7](https://github.com/microsoft/vscode/pull/7) already exists." },
      octoCalls: ["findPullRequestByHeadBranch:feature/test"],
      followUp: { content: { uri: "https://github.com/microsoft/vscode/pull/7", contentType: "text/html" }, external: true },
      createdEvents: ["agent:/session:https://github.com/microsoft/vscode/pull/7"]
    });
  });
  test("does not call GitHub when there are no branch changes", async () => {
    const gitService = new TestGitService();
    gitService.branchChanges = [];
    const octoKitService = new TestOctoKitService();
    const { handler, session } = setup(disposables, gitService, octoKitService);
    await assert.rejects(
      () => handler.invoke({ channel: buildSessionChangesetUri(session.toString()), operationId: AgentHostPullRequestOperationHandler.OPERATION_CREATE_PR }, CancellationToken.None),
      /no branch changes/
    );
    assert.deepStrictEqual(octoKitService.calls, []);
  });
  test("does not push or call GitHub when branch changes cannot be computed", async () => {
    const gitService = new TestGitService();
    gitService.branchChanges = void 0;
    const octoKitService = new TestOctoKitService();
    const { handler, session } = setup(disposables, gitService, octoKitService);
    await assert.rejects(
      () => handler.invoke({ channel: buildSessionChangesetUri(session.toString()), operationId: AgentHostPullRequestOperationHandler.OPERATION_CREATE_PR }, CancellationToken.None),
      /Could not compute branch changes/
    );
    assert.deepStrictEqual({ gitCalls: gitService.calls, octoCalls: octoKitService.calls }, {
      gitCalls: ["hasUncommittedChanges", "computeSessionFileDiffs"],
      octoCalls: []
    });
  });
  test("returns existing pull request found after create failure", async () => {
    const gitService = new TestGitService();
    const octoKitService = new TestOctoKitService();
    octoKitService.createError = new Error("Validation Failed");
    octoKitService.existingAfterCreateFailure = { url: "https://github.com/microsoft/vscode/pull/8", number: 8 };
    const { handler, session, createdEvents } = setup(disposables, gitService, octoKitService);
    const result = await handler.invoke({ channel: buildSessionChangesetUri(session.toString()), operationId: AgentHostPullRequestOperationHandler.OPERATION_CREATE_PR }, CancellationToken.None);
    assert.deepStrictEqual({ message: result.message, octoCalls: octoKitService.calls, createdEvents }, {
      message: { markdown: "Pull request [#8](https://github.com/microsoft/vscode/pull/8) already exists." },
      octoCalls: ["findPullRequestByHeadBranch:feature/test", "createPullRequest:false", "findPullRequestByHeadBranch:feature/test"],
      createdEvents: ["agent:/session:https://github.com/microsoft/vscode/pull/8"]
    });
  });
  test("preserves create failure when existing pull request recovery fails", async () => {
    const gitService = new TestGitService();
    const octoKitService = new TestOctoKitService();
    octoKitService.createError = new Error("create failed");
    octoKitService.findAfterCreateError = new Error("find failed");
    const { handler, session } = setup(disposables, gitService, octoKitService);
    await assert.rejects(
      () => handler.invoke({ channel: buildSessionChangesetUri(session.toString()), operationId: AgentHostPullRequestOperationHandler.OPERATION_CREATE_PR }, CancellationToken.None),
      /create failed/
    );
  });
  test("honors cancellation before mutating the repository", async () => {
    const gitService = new TestGitService();
    const octoKitService = new TestOctoKitService();
    const { handler, session, createdEvents } = setup(disposables, gitService, octoKitService);
    const cts = new CancellationTokenSource();
    disposables.add(cts);
    cts.cancel();
    await assert.rejects(
      () => handler.invoke({ channel: buildSessionChangesetUri(session.toString()), operationId: AgentHostPullRequestOperationHandler.OPERATION_CREATE_PR }, cts.token),
      /Pull request operation was cancelled/
    );
    assert.deepStrictEqual({ gitCalls: gitService.calls, octoCalls: octoKitService.calls, createdEvents }, {
      gitCalls: [],
      octoCalls: [],
      createdEvents: []
    });
  });
  test("generates the PR title and description from the conversation via the model", async () => {
    const gitService = new TestGitService();
    const octoKitService = new TestOctoKitService();
    const turns = [{
      id: "turn-1",
      message: { text: "Add retry logic to the uploader", origin: { kind: MessageKind.User } },
      responseParts: [
        { kind: ResponsePartKind.Reasoning, id: "r1", content: "SECRET_REASONING_SHOULD_BE_EXCLUDED" },
        { kind: ResponsePartKind.Markdown, id: "m1", content: "I added exponential backoff to the uploader." }
      ],
      usage: void 0,
      state: TurnState.Complete
    }];
    const { handler, session, copilotApiService } = setup(disposables, gitService, octoKitService, { withCopilotToken: true, turns });
    const result = await handler.invoke({ channel: buildSessionChangesetUri(session.toString()), operationId: AgentHostPullRequestOperationHandler.OPERATION_CREATE_PR }, CancellationToken.None);
    const userContent = copilotApiService.calls[0]?.request.messages.find((m) => m.role === "user")?.content ?? "";
    assert.deepStrictEqual({
      message: result.message,
      token: copilotApiService.calls[0]?.token,
      title: octoKitService.lastTitle,
      body: octoKitService.lastBody,
      includesUserRequest: userContent.includes("Add retry logic to the uploader"),
      includesAgentResponse: userContent.includes("I added exponential backoff to the uploader."),
      excludesReasoning: !userContent.includes("SECRET_REASONING_SHOULD_BE_EXCLUDED")
    }, {
      message: { markdown: "Created pull request [#123](https://github.com/microsoft/vscode/pull/123)." },
      token: "copilot-token",
      title: "Generated PR title",
      body: "Generated PR description.",
      includesUserRequest: true,
      includesAgentResponse: true,
      excludesReasoning: true
    });
  });
  test("falls back to branch-name title and description without a Copilot token", async () => {
    const gitService = new TestGitService();
    const octoKitService = new TestOctoKitService();
    const { handler, session, copilotApiService } = setup(disposables, gitService, octoKitService);
    await handler.invoke({ channel: buildSessionChangesetUri(session.toString()), operationId: AgentHostPullRequestOperationHandler.OPERATION_CREATE_PR }, CancellationToken.None);
    assert.deepStrictEqual({
      utilityCalls: copilotApiService.calls.length,
      title: octoKitService.lastTitle,
      body: octoKitService.lastBody
    }, {
      utilityCalls: 0,
      title: "feature: test",
      body: "Created from `feature/test` targeting `main`."
    });
  });
  test("falls back to branch-name title and description when generation fails", async () => {
    const gitService = new TestGitService();
    const octoKitService = new TestOctoKitService();
    const copilotApiService = new TestCopilotApiService();
    copilotApiService.error = new Error("utility model unavailable");
    const { handler, session } = setup(disposables, gitService, octoKitService, { withCopilotToken: true, copilotApiService });
    const result = await handler.invoke({ channel: buildSessionChangesetUri(session.toString()), operationId: AgentHostPullRequestOperationHandler.OPERATION_CREATE_PR }, CancellationToken.None);
    assert.deepStrictEqual({
      message: result.message,
      title: octoKitService.lastTitle,
      body: octoKitService.lastBody
    }, {
      message: { markdown: "Created pull request [#123](https://github.com/microsoft/vscode/pull/123)." },
      title: "feature: test",
      body: "Created from `feature/test` targeting `main`."
    });
  });
  test("enables auto-merge with the requested merge method after creating the pull request", async () => {
    const gitService = new TestGitService();
    const octoKitService = new TestOctoKitService();
    const { handler, session, createdEvents } = setup(disposables, gitService, octoKitService, { autoMergeMethod: "SQUASH" });
    const result = await handler.invoke({ channel: buildSessionChangesetUri(session.toString()), operationId: AgentHostPullRequestOperationHandler.OPERATION_CREATE_PR_AUTO_SQUASH }, CancellationToken.None);
    assert.deepStrictEqual({
      message: result.message,
      octoCalls: octoKitService.calls,
      createdEvents
    }, {
      message: { markdown: "Created pull request [#123](https://github.com/microsoft/vscode/pull/123) with auto-merge (squash) enabled." },
      octoCalls: [
        "findPullRequestByHeadBranch:feature/test",
        "createPullRequest:false",
        "enablePullRequestAutoMerge:PR_node_123:SQUASH"
      ],
      createdEvents: ["agent:/session:https://github.com/microsoft/vscode/pull/123"]
    });
  });
  test("reports but does not fail when auto-merge cannot be enabled", async () => {
    const gitService = new TestGitService();
    const octoKitService = new TestOctoKitService();
    octoKitService.autoMergeError = new Error("Auto-merge is not allowed for this repository");
    const { handler, session, createdEvents } = setup(disposables, gitService, octoKitService, { autoMergeMethod: "MERGE" });
    const result = await handler.invoke({ channel: buildSessionChangesetUri(session.toString()), operationId: AgentHostPullRequestOperationHandler.OPERATION_CREATE_PR_AUTO_MERGE }, CancellationToken.None);
    assert.deepStrictEqual({
      message: result.message,
      createdEvents
    }, {
      message: { markdown: "Created pull request [#123](https://github.com/microsoft/vscode/pull/123), but auto-merge could not be enabled: Auto-merge is not allowed for this repository" },
      createdEvents: ["agent:/session:https://github.com/microsoft/vscode/pull/123"]
    });
  });
  test("reports when the pull request node id is missing for auto-merge", async () => {
    const gitService = new TestGitService();
    const octoKitService = new TestOctoKitService();
    octoKitService.created = { url: "https://github.com/microsoft/vscode/pull/55", number: 55 };
    const { handler, session } = setup(disposables, gitService, octoKitService, { autoMergeMethod: "REBASE" });
    const result = await handler.invoke({ channel: buildSessionChangesetUri(session.toString()), operationId: AgentHostPullRequestOperationHandler.OPERATION_CREATE_PR_AUTO_REBASE }, CancellationToken.None);
    assert.deepStrictEqual({
      message: result.message,
      enableCalled: octoKitService.calls.some((call) => call.startsWith("enablePullRequestAutoMerge:"))
    }, {
      message: { markdown: "Created pull request [#55](https://github.com/microsoft/vscode/pull/55), but auto-merge could not be enabled: the pull request identifier was not returned by GitHub." },
      enableCalled: false
    });
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxwbGF0Zm9ybVxcYWdlbnRIb3N0XFx0ZXN0XFxub2RlXFxhZ2VudEhvc3RQdWxsUmVxdWVzdE9wZXJhdGlvbkhhbmRsZXIudGVzdC50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCBhc3NlcnQgZnJvbSAnYXNzZXJ0JztcbmltcG9ydCB7IENhbmNlbGxhdGlvblRva2VuLCBDYW5jZWxsYXRpb25Ub2tlblNvdXJjZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2NhbmNlbGxhdGlvbi5qcyc7XG5pbXBvcnQgdHlwZSB7IERpc3Bvc2FibGVTdG9yZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBVUkkgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi91cmkuanMnO1xuaW1wb3J0IHsgZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS90ZXN0L2NvbW1vbi91dGlscy5qcyc7XG5pbXBvcnQgeyBOdWxsTG9nU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL2xvZy9jb21tb24vbG9nLmpzJztcbmltcG9ydCB7IEdJVEhVQl9DT1BJTE9UX1BST1RFQ1RFRF9SRVNPVVJDRSwgR0lUSFVCX1JFUE9fUFJPVEVDVEVEX1JFU09VUkNFIH0gZnJvbSAnLi4vLi4vY29tbW9uL2FnZW50LmpzJztcbmltcG9ydCB7IHR5cGUgSUFnZW50U2VydmljZSB9IGZyb20gJy4uLy4uL2NvbW1vbi9hZ2VudFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgYnVpbGRTZXNzaW9uQ2hhbmdlc2V0VXJpIH0gZnJvbSAnLi4vLi4vY29tbW9uL2NoYW5nZXNldFVyaS5qcyc7XG5pbXBvcnQgeyBTZXNzaW9uQ29uZmlnS2V5IH0gZnJvbSAnLi4vLi4vY29tbW9uL3Nlc3Npb25Db25maWdLZXlzLmpzJztcbmltcG9ydCB7IHdpdGhTZXNzaW9uR2l0SHViU3RhdGUsIHdpdGhTZXNzaW9uR2l0U3RhdGUsIHR5cGUgSVNlc3Npb25GaWxlRGlmZiwgdHlwZSBJU2Vzc2lvbkdpdFN0YXRlLCBNZXNzYWdlS2luZCwgUmVzcG9uc2VQYXJ0S2luZCwgU2Vzc2lvblN0YXR1cywgVHVyblN0YXRlLCB0eXBlIFR1cm4gfSBmcm9tICcuLi8uLi9jb21tb24vc3RhdGUvc2Vzc2lvblN0YXRlLmpzJztcbmltcG9ydCB0eXBlIHsgSUFnZW50SG9zdEdpdFNlcnZpY2UsIElCcmFuY2gsIElEZWZhdWx0QnJhbmNoLCBJUHVzaE9wdGlvbnMgfSBmcm9tICcuLi8uLi9jb21tb24vYWdlbnRIb3N0R2l0U2VydmljZS5qcyc7XG5pbXBvcnQgeyBBZ2VudEhvc3RQdWxsUmVxdWVzdE9wZXJhdGlvbkhhbmRsZXIgfSBmcm9tICcuLi8uLi9ub2RlL2FnZW50SG9zdFB1bGxSZXF1ZXN0T3BlcmF0aW9uSGFuZGxlci5qcyc7XG5pbXBvcnQgeyBjcmVhdGVUZXN0R2l0SHViRW5kcG9pbnRTZXJ2aWNlIH0gZnJvbSAnLi90ZXN0R2l0SHViRW5kcG9pbnRTZXJ2aWNlLmpzJztcbmltcG9ydCB7IEFnZW50SG9zdFN0YXRlTWFuYWdlciB9IGZyb20gJy4uLy4uL25vZGUvYWdlbnRIb3N0U3RhdGVNYW5hZ2VyLmpzJztcbmltcG9ydCB0eXBlIHsgQXV0b01lcmdlTWV0aG9kLCBDcmVhdGVkUHVsbFJlcXVlc3QsIEdpdEh1Yklzc3VlT3JQdWxsUmVxdWVzdCwgSUFnZW50SG9zdE9jdG9LaXRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vbm9kZS9zaGFyZWQvYWdlbnRIb3N0T2N0b0tpdFNlcnZpY2UuanMnO1xuaW1wb3J0IHR5cGUgeyBJQ29waWxvdEFwaVNlcnZpY2UsIElDb3BpbG90QXBpU2VydmljZVJlcXVlc3RPcHRpb25zLCBJQ29waWxvdFV0aWxpdHlDaGF0Q29tcGxldGlvblJlcXVlc3QgfSBmcm9tICcuLi8uLi9ub2RlL3NoYXJlZC9jb3BpbG90QXBpU2VydmljZS5qcyc7XG5pbXBvcnQgdHlwZSBBbnRocm9waWMgZnJvbSAnQGFudGhyb3BpYy1haS9zZGsnO1xuaW1wb3J0IHR5cGUgeyBDQ0FNb2RlbCB9IGZyb20gJ0B2c2NvZGUvY29waWxvdC1hcGknO1xuXG5jbGFzcyBUZXN0Q29waWxvdEFwaVNlcnZpY2UgaW1wbGVtZW50cyBJQ29waWxvdEFwaVNlcnZpY2Uge1xuXHRkZWNsYXJlIHJlYWRvbmx5IF9zZXJ2aWNlQnJhbmQ6IHVuZGVmaW5lZDtcblxuXHRyZWFkb25seSBjYWxsczogeyB0b2tlbjogc3RyaW5nOyByZXF1ZXN0OiBJQ29waWxvdFV0aWxpdHlDaGF0Q29tcGxldGlvblJlcXVlc3Q7IG9wdGlvbnM/OiBJQ29waWxvdEFwaVNlcnZpY2VSZXF1ZXN0T3B0aW9ucyB9W10gPSBbXTtcblx0cmVzcG9uc2UgPSAnR2VuZXJhdGVkIFBSIHRpdGxlXFxuXFxuR2VuZXJhdGVkIFBSIGRlc2NyaXB0aW9uLic7XG5cdGVycm9yOiBFcnJvciB8IHVuZGVmaW5lZDtcblxuXHRtZXNzYWdlcyhfZ2l0aHViVG9rZW46IHN0cmluZywgX3JlcXVlc3Q6IEFudGhyb3BpYy5NZXNzYWdlQ3JlYXRlUGFyYW1zU3RyZWFtaW5nLCBfb3B0aW9ucz86IElDb3BpbG90QXBpU2VydmljZVJlcXVlc3RPcHRpb25zKTogQXN5bmNHZW5lcmF0b3I8QW50aHJvcGljLk1lc3NhZ2VTdHJlYW1FdmVudD47XG5cdG1lc3NhZ2VzKF9naXRodWJUb2tlbjogc3RyaW5nLCBfcmVxdWVzdDogQW50aHJvcGljLk1lc3NhZ2VDcmVhdGVQYXJhbXNOb25TdHJlYW1pbmcsIF9vcHRpb25zPzogSUNvcGlsb3RBcGlTZXJ2aWNlUmVxdWVzdE9wdGlvbnMpOiBQcm9taXNlPEFudGhyb3BpYy5NZXNzYWdlPjtcblx0bWVzc2FnZXMoKTogQXN5bmNHZW5lcmF0b3I8QW50aHJvcGljLk1lc3NhZ2VTdHJlYW1FdmVudD4gfCBQcm9taXNlPEFudGhyb3BpYy5NZXNzYWdlPiB7XG5cdFx0dGhyb3cgbmV3IEVycm9yKCdub3QgdXNlZCcpO1xuXHR9XG5cdGFzeW5jIGNvdW50VG9rZW5zKCk6IFByb21pc2U8QW50aHJvcGljLk1lc3NhZ2VUb2tlbnNDb3VudD4geyB0aHJvdyBuZXcgRXJyb3IoJ25vdCB1c2VkJyk7IH1cblx0YXN5bmMgbW9kZWxzKCk6IFByb21pc2U8Q0NBTW9kZWxbXT4geyByZXR1cm4gW107IH1cblx0YXN5bmMgcmVzcG9uc2VzKCk6IFByb21pc2U8UmVzcG9uc2U+IHsgdGhyb3cgbmV3IEVycm9yKCdub3QgdXNlZCcpOyB9XG5cdGFzeW5jIHJlc29sdmVSZXN0cmljdGVkVGVsZW1ldHJ5Q29udGV4dCgpIHsgcmV0dXJuIHsgcmVzdHJpY3RlZFRlbGVtZXRyeUVuYWJsZWQ6IGZhbHNlLCB0cmFja2luZ0lkOiB1bmRlZmluZWQsIHRlbGVtZXRyeUVuZHBvaW50OiB1bmRlZmluZWQgfTsgfVxuXHRhc3luYyByZXNvbHZlQXBpRW5kcG9pbnQoKSB7IHJldHVybiB1bmRlZmluZWQ7IH1cblx0YXN5bmMgdXRpbGl0eUNoYXRDb21wbGV0aW9uKGdpdGh1YlRva2VuOiBzdHJpbmcsIHJlcXVlc3Q6IElDb3BpbG90VXRpbGl0eUNoYXRDb21wbGV0aW9uUmVxdWVzdCwgb3B0aW9ucz86IElDb3BpbG90QXBpU2VydmljZVJlcXVlc3RPcHRpb25zKTogUHJvbWlzZTxzdHJpbmc+IHtcblx0XHR0aGlzLmNhbGxzLnB1c2goeyB0b2tlbjogZ2l0aHViVG9rZW4sIHJlcXVlc3QsIG9wdGlvbnMgfSk7XG5cdFx0aWYgKHRoaXMuZXJyb3IpIHtcblx0XHRcdHRocm93IHRoaXMuZXJyb3I7XG5cdFx0fVxuXHRcdHJldHVybiB0aGlzLnJlc3BvbnNlO1xuXHR9XG59XG5cbmNsYXNzIFRlc3RHaXRTZXJ2aWNlIGltcGxlbWVudHMgSUFnZW50SG9zdEdpdFNlcnZpY2Uge1xuXHRkZWNsYXJlIHJlYWRvbmx5IF9zZXJ2aWNlQnJhbmQ6IHVuZGVmaW5lZDtcblxuXHRyZWFkb25seSBjYWxsczogc3RyaW5nW10gPSBbXTtcblx0cmVhZG9ubHkgcmVxdWVzdGVkQmFzZUJyYW5jaGVzOiBBcnJheTxzdHJpbmcgfCB1bmRlZmluZWQ+ID0gW107XG5cdHJlYWRvbmx5IHB1c2hPcHRpb25zOiBJUHVzaE9wdGlvbnNbXSA9IFtdO1xuXHR1bmNvbW1pdHRlZCA9IGZhbHNlO1xuXHR1cHN0cmVhbSA9IGZhbHNlO1xuXHRnaXRTdGF0ZTogSVNlc3Npb25HaXRTdGF0ZSB8IHVuZGVmaW5lZDtcblx0YnJhbmNoQ2hhbmdlczogcmVhZG9ubHkgSVNlc3Npb25GaWxlRGlmZltdIHwgdW5kZWZpbmVkID0gW3sgYWZ0ZXI6IHsgdXJpOiAnZmlsZTovLy9yZXBvL2ZpbGUudHMnLCBjb250ZW50OiB7IHVyaTogJ2ZpbGU6Ly8vcmVwby9maWxlLnRzJyB9IH0gfV07XG5cblx0YXN5bmMgZ2V0Q3VycmVudEJyYW5jaCgpOiBQcm9taXNlPHN0cmluZyB8IHVuZGVmaW5lZD4geyByZXR1cm4gJ2ZlYXR1cmUvdGVzdCc7IH1cblx0YXN5bmMgZ2V0RGVmYXVsdEJyYW5jaCgpOiBQcm9taXNlPElEZWZhdWx0QnJhbmNoIHwgdW5kZWZpbmVkPiB7IHJldHVybiB7IG5hbWU6ICdtYWluJywgc3RhcnRQb2ludDogJ21haW4nIH07IH1cblx0YXN5bmMgZ2V0QnJhbmNoKCk6IFByb21pc2U8SUJyYW5jaCB8IHVuZGVmaW5lZD4geyByZXR1cm4gdW5kZWZpbmVkOyB9XG5cdGFzeW5jIGdldFJlZnMoKTogUHJvbWlzZTxJQnJhbmNoW10+IHsgcmV0dXJuIFtdOyB9XG5cdGFzeW5jIGdldEJyYW5jaGVzKCk6IFByb21pc2U8SUJyYW5jaFtdPiB7IHJldHVybiBbXTsgfVxuXHRhc3luYyBnZXRSZXBvc2l0b3J5Um9vdCgpOiBQcm9taXNlPFVSSSB8IHVuZGVmaW5lZD4geyByZXR1cm4gVVJJLmZpbGUoJy9yZXBvJyk7IH1cblx0YXN5bmMgZ2V0V29ya3RyZWVSb290cygpOiBQcm9taXNlPFVSSVtdPiB7IHJldHVybiBbXTsgfVxuXHRhc3luYyBhZGRXb3JrdHJlZSgpOiBQcm9taXNlPHZvaWQ+IHsgfVxuXHRhc3luYyBjb3B5V29ya3RyZWVJbmNsdWRlRmlsZXMoKTogUHJvbWlzZTx2b2lkPiB7IH1cblx0YXN5bmMgYWRkRXhpc3RpbmdXb3JrdHJlZSgpOiBQcm9taXNlPHZvaWQ+IHsgfVxuXHRhc3luYyByZW1vdmVXb3JrdHJlZSgpOiBQcm9taXNlPHZvaWQ+IHsgfVxuXHRhc3luYyBicmFuY2hFeGlzdHMoKTogUHJvbWlzZTxib29sZWFuPiB7IHJldHVybiBmYWxzZTsgfVxuXHRhc3luYyBoYXNVbmNvbW1pdHRlZENoYW5nZXMoKTogUHJvbWlzZTxib29sZWFuPiB7XG5cdFx0dGhpcy5jYWxscy5wdXNoKCdoYXNVbmNvbW1pdHRlZENoYW5nZXMnKTtcblx0XHRyZXR1cm4gdGhpcy51bmNvbW1pdHRlZDtcblx0fVxuXHRhc3luYyBjb21taXRBbGwoX3dvcmtpbmdEaXJlY3Rvcnk6IFVSSSwgbWVzc2FnZTogc3RyaW5nKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0dGhpcy5jYWxscy5wdXNoKGBjb21taXRBbGw6JHttZXNzYWdlfWApO1xuXHRcdHRoaXMudW5jb21taXR0ZWQgPSBmYWxzZTtcblx0fVxuXHRhc3luYyBtZXJnZUJyYW5jaCgpOiBQcm9taXNlPHN0cmluZz4geyByZXR1cm4gJyc7IH1cblx0YXN5bmMgcmVzdG9yZSgpOiBQcm9taXNlPHZvaWQ+IHsgfVxuXHRhc3luYyBoYXNVcHN0cmVhbSgpOiBQcm9taXNlPGJvb2xlYW4+IHtcblx0XHR0aGlzLmNhbGxzLnB1c2goJ2hhc1Vwc3RyZWFtJyk7XG5cdFx0cmV0dXJuIHRoaXMudXBzdHJlYW07XG5cdH1cblx0YXN5bmMgcHVsbCgpOiBQcm9taXNlPHZvaWQ+IHsgfVxuXHRhc3luYyBwdXNoKF93b3JraW5nRGlyZWN0b3J5OiBVUkksIG9wdGlvbnM6IElQdXNoT3B0aW9ucyk6IFByb21pc2U8dm9pZD4ge1xuXHRcdHRoaXMuY2FsbHMucHVzaChgcHVzaDoke29wdGlvbnMucmVmfToke29wdGlvbnMuc2V0VXBzdHJlYW19YCk7XG5cdFx0dGhpcy5wdXNoT3B0aW9ucy5wdXNoKG9wdGlvbnMpO1xuXHR9XG5cdGFzeW5jIGdldFNlc3Npb25HaXRTdGF0ZShfd29ya2luZ0RpcmVjdG9yeTogVVJJLCBiYXNlQnJhbmNoTmFtZT86IHN0cmluZyk6IFByb21pc2U8SVNlc3Npb25HaXRTdGF0ZSB8IHVuZGVmaW5lZD4ge1xuXHRcdHRoaXMucmVxdWVzdGVkQmFzZUJyYW5jaGVzLnB1c2goYmFzZUJyYW5jaE5hbWUpO1xuXHRcdHJldHVybiB0aGlzLmdpdFN0YXRlO1xuXHR9XG5cdGFzeW5jIGNvbXB1dGVTZXNzaW9uRmlsZURpZmZzKCk6IFByb21pc2U8cmVhZG9ubHkgSVNlc3Npb25GaWxlRGlmZltdIHwgdW5kZWZpbmVkPiB7XG5cdFx0dGhpcy5jYWxscy5wdXNoKCdjb21wdXRlU2Vzc2lvbkZpbGVEaWZmcycpO1xuXHRcdHJldHVybiB0aGlzLmJyYW5jaENoYW5nZXM7XG5cdH1cblx0YXN5bmMgc2hvd0Jsb2IoKTogUHJvbWlzZTx1bmRlZmluZWQ+IHsgcmV0dXJuIHVuZGVmaW5lZDsgfVxuXHRhc3luYyBjYXB0dXJlV29ya2luZ1RyZWVBc1RyZWUoKTogUHJvbWlzZTx1bmRlZmluZWQ+IHsgcmV0dXJuIHVuZGVmaW5lZDsgfVxuXHRhc3luYyBjb21taXRUcmVlKCk6IFByb21pc2U8dW5kZWZpbmVkPiB7IHJldHVybiB1bmRlZmluZWQ7IH1cblx0YXN5bmMgdXBkYXRlUmVmKCk6IFByb21pc2U8dm9pZD4geyB9XG5cdGFzeW5jIGRlbGV0ZVJlZnMoKTogUHJvbWlzZTx2b2lkPiB7IH1cblx0YXN5bmMgcmV2UGFyc2UoKTogUHJvbWlzZTxzdHJpbmcgfCB1bmRlZmluZWQ+IHsgcmV0dXJuIHVuZGVmaW5lZDsgfVxuXHRhc3luYyByZXNvbHZlQnJhbmNoQmFzZWxpbmVDb21taXQoKTogUHJvbWlzZTxzdHJpbmcgfCB1bmRlZmluZWQ+IHsgcmV0dXJuIHVuZGVmaW5lZDsgfVxuXHRhc3luYyBvdmVybGF5UGF0aEludG9UcmVlKCk6IFByb21pc2U8c3RyaW5nIHwgdW5kZWZpbmVkPiB7IHJldHVybiB1bmRlZmluZWQ7IH1cblx0YXN5bmMgZGlmZlRyZWVQYXRocygpOiBQcm9taXNlPHN0cmluZ1tdIHwgdW5kZWZpbmVkPiB7IHJldHVybiB1bmRlZmluZWQ7IH1cblx0YXN5bmMgY29tcHV0ZUZpbGVEaWZmc0JldHdlZW5SZWZzKCk6IFByb21pc2U8cmVhZG9ubHkgSVNlc3Npb25GaWxlRGlmZltdIHwgdW5kZWZpbmVkPiB7IHJldHVybiB1bmRlZmluZWQ7IH1cblx0YXN5bmMgZ2V0RmV0Y2hSZW1vdGVVcmxzKCk6IFByb21pc2U8dW5kZWZpbmVkPiB7IHJldHVybiB1bmRlZmluZWQ7IH1cblx0YXN5bmMgZ2V0VW50cmFja2VkUGF0aHMoKTogUHJvbWlzZTxbXT4geyByZXR1cm4gW107IH1cblx0YXN5bmMgZ2V0QnJhbmNoRGlmZlNhZmV0eUluZm8oKTogUHJvbWlzZTx1bmRlZmluZWQ+IHsgcmV0dXJuIHVuZGVmaW5lZDsgfVxuXHRhc3luYyBnZXREaWZmUGF0Y2hCZXR3ZWVuUmVmcygpOiBQcm9taXNlPHVuZGVmaW5lZD4geyByZXR1cm4gdW5kZWZpbmVkOyB9XG59XG5cbmNsYXNzIFRlc3RPY3RvS2l0U2VydmljZSBpbXBsZW1lbnRzIElBZ2VudEhvc3RPY3RvS2l0U2VydmljZSB7XG5cdGRlY2xhcmUgcmVhZG9ubHkgX3NlcnZpY2VCcmFuZDogdW5kZWZpbmVkO1xuXG5cdHJlYWRvbmx5IGNhbGxzOiBzdHJpbmdbXSA9IFtdO1xuXHRleGlzdGluZzogQ3JlYXRlZFB1bGxSZXF1ZXN0IHwgdW5kZWZpbmVkO1xuXHRleGlzdGluZ0FmdGVyQ3JlYXRlRmFpbHVyZTogQ3JlYXRlZFB1bGxSZXF1ZXN0IHwgdW5kZWZpbmVkO1xuXHRjcmVhdGVFcnJvcjogRXJyb3IgfCB1bmRlZmluZWQ7XG5cdGZpbmRBZnRlckNyZWF0ZUVycm9yOiBFcnJvciB8IHVuZGVmaW5lZDtcblx0YXV0b01lcmdlRXJyb3I6IEVycm9yIHwgdW5kZWZpbmVkO1xuXHRjcmVhdGVkOiBDcmVhdGVkUHVsbFJlcXVlc3QgPSB7IHVybDogJ2h0dHBzOi8vZ2l0aHViLmNvbS9taWNyb3NvZnQvdnNjb2RlL3B1bGwvMTIzJywgbnVtYmVyOiAxMjMsIG5vZGVJZDogJ1BSX25vZGVfMTIzJyB9O1xuXHRsYXN0VGl0bGU6IHN0cmluZyB8IHVuZGVmaW5lZDtcblx0bGFzdEJvZHk6IHN0cmluZyB8IHVuZGVmaW5lZDtcblx0bGFzdEhlYWQ6IHN0cmluZyB8IHVuZGVmaW5lZDtcblx0bGFzdEJhc2U6IHN0cmluZyB8IHVuZGVmaW5lZDtcblx0cmVhZG9ubHkgZmluZFJlcXVlc3RzOiB7IGJyYW5jaDogc3RyaW5nOyBoZWFkT3duZXI6IHN0cmluZyB8IHVuZGVmaW5lZCB9W10gPSBbXTtcblxuXHRhc3luYyBjcmVhdGVQdWxsUmVxdWVzdChfb3duZXI6IHN0cmluZywgX3JlcG86IHN0cmluZywgdGl0bGU6IHN0cmluZywgYm9keTogc3RyaW5nLCBoZWFkOiBzdHJpbmcsIGJhc2U6IHN0cmluZywgZHJhZnQ6IGJvb2xlYW4sIF90b2tlbjogc3RyaW5nLCBfc2lnbmFsOiBBYm9ydFNpZ25hbCk6IFByb21pc2U8Q3JlYXRlZFB1bGxSZXF1ZXN0PiB7XG5cdFx0dGhpcy5jYWxscy5wdXNoKGBjcmVhdGVQdWxsUmVxdWVzdDoke2RyYWZ0fWApO1xuXHRcdHRoaXMubGFzdFRpdGxlID0gdGl0bGU7XG5cdFx0dGhpcy5sYXN0Qm9keSA9IGJvZHk7XG5cdFx0dGhpcy5sYXN0SGVhZCA9IGhlYWQ7XG5cdFx0dGhpcy5sYXN0QmFzZSA9IGJhc2U7XG5cdFx0aWYgKHRoaXMuY3JlYXRlRXJyb3IpIHtcblx0XHRcdHRocm93IHRoaXMuY3JlYXRlRXJyb3I7XG5cdFx0fVxuXHRcdHJldHVybiB0aGlzLmNyZWF0ZWQ7XG5cdH1cblx0YXN5bmMgZmluZFB1bGxSZXF1ZXN0QnlIZWFkQnJhbmNoKF9vd25lcjogc3RyaW5nLCBfcmVwbzogc3RyaW5nLCBicmFuY2g6IHN0cmluZywgX3Rva2VuOiBzdHJpbmcsIF9zaWduYWw6IEFib3J0U2lnbmFsLCBoZWFkT3duZXI/OiBzdHJpbmcpOiBQcm9taXNlPENyZWF0ZWRQdWxsUmVxdWVzdCB8IHVuZGVmaW5lZD4ge1xuXHRcdHRoaXMuY2FsbHMucHVzaChgZmluZFB1bGxSZXF1ZXN0QnlIZWFkQnJhbmNoOiR7YnJhbmNofWApO1xuXHRcdHRoaXMuZmluZFJlcXVlc3RzLnB1c2goeyBicmFuY2gsIGhlYWRPd25lciB9KTtcblx0XHRpZiAodGhpcy5jYWxscy5zb21lKGNhbGwgPT4gY2FsbC5zdGFydHNXaXRoKCdjcmVhdGVQdWxsUmVxdWVzdDonKSkpIHtcblx0XHRcdGlmICh0aGlzLmZpbmRBZnRlckNyZWF0ZUVycm9yKSB7XG5cdFx0XHRcdHRocm93IHRoaXMuZmluZEFmdGVyQ3JlYXRlRXJyb3I7XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm4gdGhpcy5leGlzdGluZ0FmdGVyQ3JlYXRlRmFpbHVyZTtcblx0XHR9XG5cdFx0cmV0dXJuIHRoaXMuZXhpc3Rpbmc7XG5cdH1cblx0YXN5bmMgZ2V0SXNzdWVPclB1bGxSZXF1ZXN0KCk6IFByb21pc2U8R2l0SHViSXNzdWVPclB1bGxSZXF1ZXN0PiB7XG5cdFx0dGhyb3cgbmV3IEVycm9yKCdub3QgdXNlZCcpO1xuXHR9XG5cdGFzeW5jIGZpbmRQdWxsUmVxdWVzdEJ5SGVhZFNoYSgpOiBQcm9taXNlPENyZWF0ZWRQdWxsUmVxdWVzdCB8IHVuZGVmaW5lZD4ge1xuXHRcdHRocm93IG5ldyBFcnJvcignbm90IHVzZWQnKTtcblx0fVxuXHRhc3luYyBlbmFibGVQdWxsUmVxdWVzdEF1dG9NZXJnZShwdWxsUmVxdWVzdElkOiBzdHJpbmcsIG1lcmdlTWV0aG9kOiBBdXRvTWVyZ2VNZXRob2QsIF90b2tlbjogc3RyaW5nLCBfc2lnbmFsOiBBYm9ydFNpZ25hbCk6IFByb21pc2U8dm9pZD4ge1xuXHRcdHRoaXMuY2FsbHMucHVzaChgZW5hYmxlUHVsbFJlcXVlc3RBdXRvTWVyZ2U6JHtwdWxsUmVxdWVzdElkfToke21lcmdlTWV0aG9kfWApO1xuXHRcdGlmICh0aGlzLmF1dG9NZXJnZUVycm9yKSB7XG5cdFx0XHR0aHJvdyB0aGlzLmF1dG9NZXJnZUVycm9yO1xuXHRcdH1cblx0fVxufVxuXG5mdW5jdGlvbiBjcmVhdGVBZ2VudFNlcnZpY2Uod2l0aENvcGlsb3RUb2tlbiA9IGZhbHNlKTogSUFnZW50U2VydmljZSB7XG5cdHJldHVybiB7XG5cdFx0Z2V0QXV0aFRva2VuOiByZXNvdXJjZSA9PiB7XG5cdFx0XHRpZiAocmVzb3VyY2UucmVzb3VyY2UgPT09IEdJVEhVQl9SRVBPX1BST1RFQ1RFRF9SRVNPVVJDRS5yZXNvdXJjZSkge1xuXHRcdFx0XHRyZXR1cm4gJ2doLXRva2VuJztcblx0XHRcdH1cblx0XHRcdGlmICh3aXRoQ29waWxvdFRva2VuICYmIHJlc291cmNlLnJlc291cmNlID09PSBHSVRIVUJfQ09QSUxPVF9QUk9URUNURURfUkVTT1VSQ0UucmVzb3VyY2UpIHtcblx0XHRcdFx0cmV0dXJuICdjb3BpbG90LXRva2VuJztcblx0XHRcdH1cblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fSxcblx0fSBhcyBJQWdlbnRTZXJ2aWNlO1xufVxuXG5mdW5jdGlvbiBzZXR1cChkaXNwb3NhYmxlczogUGljazxEaXNwb3NhYmxlU3RvcmUsICdhZGQnPiwgZ2l0U2VydmljZTogVGVzdEdpdFNlcnZpY2UsIG9jdG9LaXRTZXJ2aWNlOiBUZXN0T2N0b0tpdFNlcnZpY2UsIG9wdGlvbnM/OiB7IGNvcGlsb3RBcGlTZXJ2aWNlPzogVGVzdENvcGlsb3RBcGlTZXJ2aWNlOyB3aXRoQ29waWxvdFRva2VuPzogYm9vbGVhbjsgdHVybnM/OiBUdXJuW107IGRyYWZ0PzogYm9vbGVhbjsgYXV0b01lcmdlTWV0aG9kPzogQXV0b01lcmdlTWV0aG9kOyBiYXNlQnJhbmNoPzogc3RyaW5nIH0pOiB7IGhhbmRsZXI6IEFnZW50SG9zdFB1bGxSZXF1ZXN0T3BlcmF0aW9uSGFuZGxlcjsgc2Vzc2lvbjogVVJJOyBjcmVhdGVkRXZlbnRzOiBzdHJpbmdbXTsgY29waWxvdEFwaVNlcnZpY2U6IFRlc3RDb3BpbG90QXBpU2VydmljZSB9IHtcblx0Y29uc3Qgc3RhdGVNYW5hZ2VyID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBBZ2VudEhvc3RTdGF0ZU1hbmFnZXIobmV3IE51bGxMb2dTZXJ2aWNlKCkpKTtcblx0Y29uc3Qgc2Vzc2lvbiA9IFVSSS5wYXJzZSgnYWdlbnQ6L3Nlc3Npb24nKTtcblx0Y29uc3QgY3JlYXRlZEV2ZW50czogc3RyaW5nW10gPSBbXTtcblx0c3RhdGVNYW5hZ2VyLmNyZWF0ZVNlc3Npb24oe1xuXHRcdHJlc291cmNlOiBzZXNzaW9uLnRvU3RyaW5nKCksXG5cdFx0cHJvdmlkZXI6ICdjb3BpbG90Jyxcblx0XHR0aXRsZTogJ1Nlc3Npb24nLFxuXHRcdHN0YXR1czogU2Vzc2lvblN0YXR1cy5JZGxlLFxuXHRcdGNyZWF0ZWRBdDogbmV3IERhdGUoMSkudG9JU09TdHJpbmcoKSxcblx0XHRtb2RpZmllZEF0OiBuZXcgRGF0ZSgxKS50b0lTT1N0cmluZygpLFxuXHRcdHdvcmtpbmdEaXJlY3RvcmllczogW1VSSS5maWxlKCcvcmVwbycpLnRvU3RyaW5nKCldLFxuXHR9KTtcblx0aWYgKG9wdGlvbnM/LmJhc2VCcmFuY2gpIHtcblx0XHRzdGF0ZU1hbmFnZXIuc2V0U2Vzc2lvbkNvbmZpZyhzZXNzaW9uLnRvU3RyaW5nKCksIHtcblx0XHRcdHNjaGVtYTogeyB0eXBlOiAnb2JqZWN0JywgcHJvcGVydGllczoge30gfSxcblx0XHRcdHZhbHVlczoge1xuXHRcdFx0XHRbU2Vzc2lvbkNvbmZpZ0tleS5Jc29sYXRpb25dOiAnd29ya3RyZWUnLFxuXHRcdFx0XHRbU2Vzc2lvbkNvbmZpZ0tleS5CcmFuY2hdOiBvcHRpb25zLmJhc2VCcmFuY2gsXG5cdFx0XHR9LFxuXHRcdH0pO1xuXHR9XG5cdC8vIEdpdCBzdGF0ZSBhbmQgR2l0SHViIHN0YXRlIG5vdyBzaGFyZSB0aGUgc2luZ2xlIGBfbWV0YWAgYmFnLlxuXHRjb25zdCBzZXNzaW9uTWV0YSA9IHdpdGhTZXNzaW9uR2l0SHViU3RhdGUod2l0aFNlc3Npb25HaXRTdGF0ZSh1bmRlZmluZWQsIHtcblx0XHRoYXNHaXRIdWJSZW1vdGU6IHRydWUsXG5cdFx0Z2l0aHViT3duZXI6ICdtaWNyb3NvZnQnLFxuXHRcdGdpdGh1YlJlcG86ICd2c2NvZGUnLFxuXHRcdGJyYW5jaE5hbWU6ICdmZWF0dXJlL3Rlc3QnLFxuXHRcdGJhc2VCcmFuY2hOYW1lOiBvcHRpb25zPy5iYXNlQnJhbmNoID8/ICdtYWluJyxcblx0fSksIHtcblx0XHRvd25lcjogJ21pY3Jvc29mdCcsXG5cdFx0cmVwbzogJ3ZzY29kZScsXG5cdH0pO1xuXHRzdGF0ZU1hbmFnZXIuc2V0U2Vzc2lvbk1ldGEoc2Vzc2lvbi50b1N0cmluZygpLCBzZXNzaW9uTWV0YSk7XG5cdGNvbnN0IGNvcGlsb3RBcGlTZXJ2aWNlID0gb3B0aW9ucz8uY29waWxvdEFwaVNlcnZpY2UgPz8gbmV3IFRlc3RDb3BpbG90QXBpU2VydmljZSgpO1xuXHRyZXR1cm4ge1xuXHRcdGhhbmRsZXI6IG5ldyBBZ2VudEhvc3RQdWxsUmVxdWVzdE9wZXJhdGlvbkhhbmRsZXIoXG5cdFx0XHRvcHRpb25zPy5kcmFmdCA/PyBmYWxzZSxcblx0XHRcdG9wdGlvbnM/LmF1dG9NZXJnZU1ldGhvZCxcblx0XHRcdHNlc3Npb25LZXkgPT4ge1xuXHRcdFx0XHRjb25zdCBzdGF0ZSA9IHN0YXRlTWFuYWdlci5nZXRTZXNzaW9uU3RhdGUoc2Vzc2lvbktleSk7XG5cdFx0XHRcdGlmIChzdGF0ZSAmJiBvcHRpb25zPy50dXJucykge1xuXHRcdFx0XHRcdHJldHVybiB7IC4uLnN0YXRlLCB0dXJuczogb3B0aW9ucy50dXJucyB9O1xuXHRcdFx0XHR9XG5cdFx0XHRcdHJldHVybiBzdGF0ZTtcblx0XHRcdH0sXG5cdFx0XHRhc3luYyAoKSA9PiBvcHRpb25zPy5iYXNlQnJhbmNoID8/ICdtYWluJyxcblx0XHRcdGV2ZW50ID0+IGNyZWF0ZWRFdmVudHMucHVzaChgJHtldmVudC5zZXNzaW9uS2V5fToke2V2ZW50LnB1bGxSZXF1ZXN0VXJsfWApLFxuXHRcdFx0Y3JlYXRlQWdlbnRTZXJ2aWNlKG9wdGlvbnM/LndpdGhDb3BpbG90VG9rZW4pLCBnaXRTZXJ2aWNlLCBvY3RvS2l0U2VydmljZSwgY3JlYXRlVGVzdEdpdEh1YkVuZHBvaW50U2VydmljZSgpLCBjb3BpbG90QXBpU2VydmljZSwgbmV3IE51bGxMb2dTZXJ2aWNlKCkpLFxuXHRcdHNlc3Npb24sXG5cdFx0Y3JlYXRlZEV2ZW50cyxcblx0XHRjb3BpbG90QXBpU2VydmljZSxcblx0fTtcbn1cblxuc3VpdGUoJ0FnZW50SG9zdFB1bGxSZXF1ZXN0T3BlcmF0aW9uSGFuZGxlcicsICgpID0+IHtcblx0Y29uc3QgZGlzcG9zYWJsZXMgPSBlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUoKTtcblxuXHQvLyBNYXRjaGVzIHRoZSBDb3BpbG90IENMSSBBZ2VudCBXaW5kb3cgYmVoYXZpb3I6IGlmIHRoZSBzZXNzaW9uIGhhc1xuXHQvLyB1bmNvbW1pdHRlZCB3b3JrLCBDcmVhdGUgUFIgZmlyc3QgY29tbWl0cyB0aGF0IHdvcmssIHRoZW4gcHVzaGVzIHRoZVxuXHQvLyBicmFuY2gsIHRoZW4gYXNrcyBHaXRIdWIgdG8gY3JlYXRlIHRoZSBQUi5cblx0dGVzdCgnY29tbWl0cyB1bmNvbW1pdHRlZCBjaGFuZ2VzIGJlZm9yZSBwdXNoaW5nIGFuZCBjcmVhdGluZyBhIHB1bGwgcmVxdWVzdCcsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBnaXRTZXJ2aWNlID0gbmV3IFRlc3RHaXRTZXJ2aWNlKCk7XG5cdFx0Z2l0U2VydmljZS51bmNvbW1pdHRlZCA9IHRydWU7XG5cdFx0Y29uc3Qgb2N0b0tpdFNlcnZpY2UgPSBuZXcgVGVzdE9jdG9LaXRTZXJ2aWNlKCk7XG5cdFx0Y29uc3QgeyBoYW5kbGVyLCBzZXNzaW9uLCBjcmVhdGVkRXZlbnRzIH0gPSBzZXR1cChkaXNwb3NhYmxlcywgZ2l0U2VydmljZSwgb2N0b0tpdFNlcnZpY2UsIHsgYmFzZUJyYW5jaDogJ3JlbGVhc2UnIH0pO1xuXG5cdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgaGFuZGxlci5pbnZva2UoeyBjaGFubmVsOiBidWlsZFNlc3Npb25DaGFuZ2VzZXRVcmkoc2Vzc2lvbi50b1N0cmluZygpKSwgb3BlcmF0aW9uSWQ6IEFnZW50SG9zdFB1bGxSZXF1ZXN0T3BlcmF0aW9uSGFuZGxlci5PUEVSQVRJT05fQ1JFQVRFX1BSIH0sIENhbmNlbGxhdGlvblRva2VuLk5vbmUpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRtZXNzYWdlOiByZXN1bHQubWVzc2FnZSxcblx0XHRcdGdpdENhbGxzOiBnaXRTZXJ2aWNlLmNhbGxzLFxuXHRcdFx0cmVxdWVzdGVkQmFzZUJyYW5jaGVzOiBnaXRTZXJ2aWNlLnJlcXVlc3RlZEJhc2VCcmFuY2hlcyxcblx0XHRcdHB1bGxSZXF1ZXN0QmFzZTogb2N0b0tpdFNlcnZpY2UubGFzdEJhc2UsXG5cdFx0XHRvY3RvQ2FsbHM6IG9jdG9LaXRTZXJ2aWNlLmNhbGxzLFxuXHRcdFx0Y3JlYXRlZEV2ZW50cyxcblx0XHR9LCB7XG5cdFx0XHRtZXNzYWdlOiB7IG1hcmtkb3duOiAnQ3JlYXRlZCBwdWxsIHJlcXVlc3QgWyMxMjNdKGh0dHBzOi8vZ2l0aHViLmNvbS9taWNyb3NvZnQvdnNjb2RlL3B1bGwvMTIzKS4nIH0sXG5cdFx0XHRnaXRDYWxsczogW1xuXHRcdFx0XHQnaGFzVW5jb21taXR0ZWRDaGFuZ2VzJyxcblx0XHRcdFx0J2NvbW1pdEFsbDpBZ2VudCBIb3N0IGNoYW5nZXMgZm9yIGZlYXR1cmUvdGVzdCcsXG5cdFx0XHRcdCdjb21wdXRlU2Vzc2lvbkZpbGVEaWZmcycsXG5cdFx0XHRcdCdoYXNVcHN0cmVhbScsXG5cdFx0XHRcdCdwdXNoOmZlYXR1cmUvdGVzdDp0cnVlJyxcblx0XHRcdF0sXG5cdFx0XHRyZXF1ZXN0ZWRCYXNlQnJhbmNoZXM6IFsncmVsZWFzZSddLFxuXHRcdFx0cHVsbFJlcXVlc3RCYXNlOiAncmVsZWFzZScsXG5cdFx0XHRvY3RvQ2FsbHM6IFtcblx0XHRcdFx0J2ZpbmRQdWxsUmVxdWVzdEJ5SGVhZEJyYW5jaDpmZWF0dXJlL3Rlc3QnLFxuXHRcdFx0XHQnY3JlYXRlUHVsbFJlcXVlc3Q6ZmFsc2UnLFxuXHRcdFx0XSxcblx0XHRcdGNyZWF0ZWRFdmVudHM6IFsnYWdlbnQ6L3Nlc3Npb246aHR0cHM6Ly9naXRodWIuY29tL21pY3Jvc29mdC92c2NvZGUvcHVsbC8xMjMnXSxcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgncHVzaGVzLCBmaW5kcywgYW5kIGNyZWF0ZXMgd2l0aCB0aGUgc2FtZSBmb3JrIHVwc3RyZWFtJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IGdpdFNlcnZpY2UgPSBuZXcgVGVzdEdpdFNlcnZpY2UoKTtcblx0XHRnaXRTZXJ2aWNlLnVwc3RyZWFtID0gdHJ1ZTtcblx0XHRnaXRTZXJ2aWNlLmdpdFN0YXRlID0ge1xuXHRcdFx0YnJhbmNoTmFtZTogJ2ZlYXR1cmUvdGVzdCcsXG5cdFx0XHRiYXNlQnJhbmNoTmFtZTogJ21haW4nLFxuXHRcdFx0dXBzdHJlYW1CcmFuY2hOYW1lOiAnZm9yay9wdWJsaXNoZWQtZmVhdHVyZScsXG5cdFx0XHRnaXRodWJPd25lcjogJ21pY3Jvc29mdCcsXG5cdFx0XHRnaXRodWJIZWFkT3duZXI6ICdmb3JrLW93bmVyJyxcblx0XHRcdGdpdGh1YlJlcG86ICd2c2NvZGUnLFxuXHRcdH07XG5cdFx0Y29uc3Qgb2N0b0tpdFNlcnZpY2UgPSBuZXcgVGVzdE9jdG9LaXRTZXJ2aWNlKCk7XG5cdFx0Y29uc3QgeyBoYW5kbGVyLCBzZXNzaW9uIH0gPSBzZXR1cChkaXNwb3NhYmxlcywgZ2l0U2VydmljZSwgb2N0b0tpdFNlcnZpY2UpO1xuXG5cdFx0YXdhaXQgaGFuZGxlci5pbnZva2UoeyBjaGFubmVsOiBidWlsZFNlc3Npb25DaGFuZ2VzZXRVcmkoc2Vzc2lvbi50b1N0cmluZygpKSwgb3BlcmF0aW9uSWQ6IEFnZW50SG9zdFB1bGxSZXF1ZXN0T3BlcmF0aW9uSGFuZGxlci5PUEVSQVRJT05fQ1JFQVRFX1BSIH0sIENhbmNlbGxhdGlvblRva2VuLk5vbmUpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRwdXNoT3B0aW9uczogZ2l0U2VydmljZS5wdXNoT3B0aW9ucyxcblx0XHRcdGZpbmRSZXF1ZXN0czogb2N0b0tpdFNlcnZpY2UuZmluZFJlcXVlc3RzLFxuXHRcdFx0Y3JlYXRlSGVhZDogb2N0b0tpdFNlcnZpY2UubGFzdEhlYWQsXG5cdFx0fSwge1xuXHRcdFx0cHVzaE9wdGlvbnM6IFt7IHJlbW90ZTogJ2ZvcmsnLCByZWY6ICdmZWF0dXJlL3Rlc3Q6cHVibGlzaGVkLWZlYXR1cmUnLCBzZXRVcHN0cmVhbTogZmFsc2UgfV0sXG5cdFx0XHRmaW5kUmVxdWVzdHM6IFt7IGJyYW5jaDogJ3B1Ymxpc2hlZC1mZWF0dXJlJywgaGVhZE93bmVyOiAnZm9yay1vd25lcicgfV0sXG5cdFx0XHRjcmVhdGVIZWFkOiAnZm9yay1vd25lcjpwdWJsaXNoZWQtZmVhdHVyZScsXG5cdFx0fSk7XG5cdH0pO1xuXG5cdC8vIEdpdEh1YiByZXR1cm5zIDQyMiB3aGVuIGEgUFIgYWxyZWFkeSBleGlzdHMgZm9yIHRoZSBicmFuY2guIFRoZSBoYW5kbGVyXG5cdC8vIHNob3VsZCBwcmVmbGlnaHQgdGhlIGJyYW5jaCBhbmQgcmV0dXJuL29wZW4gdGhlIGV4aXN0aW5nIFBSIGluc3RlYWQgb2Zcblx0Ly8gdHJ5aW5nIHRvIGNyZWF0ZSBhIGR1cGxpY2F0ZS5cblx0dGVzdCgncmV0dXJucyBhbiBleGlzdGluZyBwdWxsIHJlcXVlc3Qgd2l0aG91dCBjcmVhdGluZyBhIGR1cGxpY2F0ZScsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBnaXRTZXJ2aWNlID0gbmV3IFRlc3RHaXRTZXJ2aWNlKCk7XG5cdFx0Y29uc3Qgb2N0b0tpdFNlcnZpY2UgPSBuZXcgVGVzdE9jdG9LaXRTZXJ2aWNlKCk7XG5cdFx0b2N0b0tpdFNlcnZpY2UuZXhpc3RpbmcgPSB7IHVybDogJ2h0dHBzOi8vZ2l0aHViLmNvbS9taWNyb3NvZnQvdnNjb2RlL3B1bGwvNycsIG51bWJlcjogNyB9O1xuXHRcdGNvbnN0IHsgaGFuZGxlciwgc2Vzc2lvbiwgY3JlYXRlZEV2ZW50cyB9ID0gc2V0dXAoZGlzcG9zYWJsZXMsIGdpdFNlcnZpY2UsIG9jdG9LaXRTZXJ2aWNlKTtcblxuXHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IGhhbmRsZXIuaW52b2tlKHsgY2hhbm5lbDogYnVpbGRTZXNzaW9uQ2hhbmdlc2V0VXJpKHNlc3Npb24udG9TdHJpbmcoKSksIG9wZXJhdGlvbklkOiBBZ2VudEhvc3RQdWxsUmVxdWVzdE9wZXJhdGlvbkhhbmRsZXIuT1BFUkFUSU9OX0NSRUFURV9QUiB9LCBDYW5jZWxsYXRpb25Ub2tlbi5Ob25lKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0bWVzc2FnZTogcmVzdWx0Lm1lc3NhZ2UsXG5cdFx0XHRvY3RvQ2FsbHM6IG9jdG9LaXRTZXJ2aWNlLmNhbGxzLFxuXHRcdFx0Zm9sbG93VXA6IHJlc3VsdC5mb2xsb3dVcCxcblx0XHRcdGNyZWF0ZWRFdmVudHMsXG5cdFx0fSwge1xuXHRcdFx0bWVzc2FnZTogeyBtYXJrZG93bjogJ1B1bGwgcmVxdWVzdCBbIzddKGh0dHBzOi8vZ2l0aHViLmNvbS9taWNyb3NvZnQvdnNjb2RlL3B1bGwvNykgYWxyZWFkeSBleGlzdHMuJyB9LFxuXHRcdFx0b2N0b0NhbGxzOiBbJ2ZpbmRQdWxsUmVxdWVzdEJ5SGVhZEJyYW5jaDpmZWF0dXJlL3Rlc3QnXSxcblx0XHRcdGZvbGxvd1VwOiB7IGNvbnRlbnQ6IHsgdXJpOiAnaHR0cHM6Ly9naXRodWIuY29tL21pY3Jvc29mdC92c2NvZGUvcHVsbC83JywgY29udGVudFR5cGU6ICd0ZXh0L2h0bWwnIH0sIGV4dGVybmFsOiB0cnVlIH0sXG5cdFx0XHRjcmVhdGVkRXZlbnRzOiBbJ2FnZW50Oi9zZXNzaW9uOmh0dHBzOi8vZ2l0aHViLmNvbS9taWNyb3NvZnQvdnNjb2RlL3B1bGwvNyddLFxuXHRcdH0pO1xuXHR9KTtcblxuXHQvLyBBIHZpc2libGUgUFIgYnV0dG9uIGNhbiByYWNlIHdpdGggcmVmcmVzaGVkIGdpdCBzdGF0ZS4gSWYgdGhlIGJhY2tlbmRcblx0Ly8gZGlzY292ZXJzIHRoYXQgdGhlIGJyYW5jaCBoYXMgbm8gZmlsZSBjaGFuZ2VzLCBpdCBzaG91bGQgc3RvcCBiZWZvcmVcblx0Ly8gY2FsbGluZyBHaXRIdWIgc28gdGhlIHVzZXIgZ2V0cyBhIGxvY2FsLCBhY3Rpb25hYmxlIGZhaWx1cmUuXG5cdHRlc3QoJ2RvZXMgbm90IGNhbGwgR2l0SHViIHdoZW4gdGhlcmUgYXJlIG5vIGJyYW5jaCBjaGFuZ2VzJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IGdpdFNlcnZpY2UgPSBuZXcgVGVzdEdpdFNlcnZpY2UoKTtcblx0XHRnaXRTZXJ2aWNlLmJyYW5jaENoYW5nZXMgPSBbXTtcblx0XHRjb25zdCBvY3RvS2l0U2VydmljZSA9IG5ldyBUZXN0T2N0b0tpdFNlcnZpY2UoKTtcblx0XHRjb25zdCB7IGhhbmRsZXIsIHNlc3Npb24gfSA9IHNldHVwKGRpc3Bvc2FibGVzLCBnaXRTZXJ2aWNlLCBvY3RvS2l0U2VydmljZSk7XG5cblx0XHRhd2FpdCBhc3NlcnQucmVqZWN0cyhcblx0XHRcdCgpID0+IGhhbmRsZXIuaW52b2tlKHsgY2hhbm5lbDogYnVpbGRTZXNzaW9uQ2hhbmdlc2V0VXJpKHNlc3Npb24udG9TdHJpbmcoKSksIG9wZXJhdGlvbklkOiBBZ2VudEhvc3RQdWxsUmVxdWVzdE9wZXJhdGlvbkhhbmRsZXIuT1BFUkFUSU9OX0NSRUFURV9QUiB9LCBDYW5jZWxsYXRpb25Ub2tlbi5Ob25lKSxcblx0XHRcdC9ubyBicmFuY2ggY2hhbmdlcy8sXG5cdFx0KTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKG9jdG9LaXRTZXJ2aWNlLmNhbGxzLCBbXSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2RvZXMgbm90IHB1c2ggb3IgY2FsbCBHaXRIdWIgd2hlbiBicmFuY2ggY2hhbmdlcyBjYW5ub3QgYmUgY29tcHV0ZWQnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgZ2l0U2VydmljZSA9IG5ldyBUZXN0R2l0U2VydmljZSgpO1xuXHRcdGdpdFNlcnZpY2UuYnJhbmNoQ2hhbmdlcyA9IHVuZGVmaW5lZDtcblx0XHRjb25zdCBvY3RvS2l0U2VydmljZSA9IG5ldyBUZXN0T2N0b0tpdFNlcnZpY2UoKTtcblx0XHRjb25zdCB7IGhhbmRsZXIsIHNlc3Npb24gfSA9IHNldHVwKGRpc3Bvc2FibGVzLCBnaXRTZXJ2aWNlLCBvY3RvS2l0U2VydmljZSk7XG5cblx0XHRhd2FpdCBhc3NlcnQucmVqZWN0cyhcblx0XHRcdCgpID0+IGhhbmRsZXIuaW52b2tlKHsgY2hhbm5lbDogYnVpbGRTZXNzaW9uQ2hhbmdlc2V0VXJpKHNlc3Npb24udG9TdHJpbmcoKSksIG9wZXJhdGlvbklkOiBBZ2VudEhvc3RQdWxsUmVxdWVzdE9wZXJhdGlvbkhhbmRsZXIuT1BFUkFUSU9OX0NSRUFURV9QUiB9LCBDYW5jZWxsYXRpb25Ub2tlbi5Ob25lKSxcblx0XHRcdC9Db3VsZCBub3QgY29tcHV0ZSBicmFuY2ggY2hhbmdlcy8sXG5cdFx0KTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoeyBnaXRDYWxsczogZ2l0U2VydmljZS5jYWxscywgb2N0b0NhbGxzOiBvY3RvS2l0U2VydmljZS5jYWxscyB9LCB7XG5cdFx0XHRnaXRDYWxsczogWydoYXNVbmNvbW1pdHRlZENoYW5nZXMnLCAnY29tcHV0ZVNlc3Npb25GaWxlRGlmZnMnXSxcblx0XHRcdG9jdG9DYWxsczogW10sXG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3JldHVybnMgZXhpc3RpbmcgcHVsbCByZXF1ZXN0IGZvdW5kIGFmdGVyIGNyZWF0ZSBmYWlsdXJlJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IGdpdFNlcnZpY2UgPSBuZXcgVGVzdEdpdFNlcnZpY2UoKTtcblx0XHRjb25zdCBvY3RvS2l0U2VydmljZSA9IG5ldyBUZXN0T2N0b0tpdFNlcnZpY2UoKTtcblx0XHRvY3RvS2l0U2VydmljZS5jcmVhdGVFcnJvciA9IG5ldyBFcnJvcignVmFsaWRhdGlvbiBGYWlsZWQnKTtcblx0XHRvY3RvS2l0U2VydmljZS5leGlzdGluZ0FmdGVyQ3JlYXRlRmFpbHVyZSA9IHsgdXJsOiAnaHR0cHM6Ly9naXRodWIuY29tL21pY3Jvc29mdC92c2NvZGUvcHVsbC84JywgbnVtYmVyOiA4IH07XG5cdFx0Y29uc3QgeyBoYW5kbGVyLCBzZXNzaW9uLCBjcmVhdGVkRXZlbnRzIH0gPSBzZXR1cChkaXNwb3NhYmxlcywgZ2l0U2VydmljZSwgb2N0b0tpdFNlcnZpY2UpO1xuXG5cdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgaGFuZGxlci5pbnZva2UoeyBjaGFubmVsOiBidWlsZFNlc3Npb25DaGFuZ2VzZXRVcmkoc2Vzc2lvbi50b1N0cmluZygpKSwgb3BlcmF0aW9uSWQ6IEFnZW50SG9zdFB1bGxSZXF1ZXN0T3BlcmF0aW9uSGFuZGxlci5PUEVSQVRJT05fQ1JFQVRFX1BSIH0sIENhbmNlbGxhdGlvblRva2VuLk5vbmUpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7IG1lc3NhZ2U6IHJlc3VsdC5tZXNzYWdlLCBvY3RvQ2FsbHM6IG9jdG9LaXRTZXJ2aWNlLmNhbGxzLCBjcmVhdGVkRXZlbnRzIH0sIHtcblx0XHRcdG1lc3NhZ2U6IHsgbWFya2Rvd246ICdQdWxsIHJlcXVlc3QgWyM4XShodHRwczovL2dpdGh1Yi5jb20vbWljcm9zb2Z0L3ZzY29kZS9wdWxsLzgpIGFscmVhZHkgZXhpc3RzLicgfSxcblx0XHRcdG9jdG9DYWxsczogWydmaW5kUHVsbFJlcXVlc3RCeUhlYWRCcmFuY2g6ZmVhdHVyZS90ZXN0JywgJ2NyZWF0ZVB1bGxSZXF1ZXN0OmZhbHNlJywgJ2ZpbmRQdWxsUmVxdWVzdEJ5SGVhZEJyYW5jaDpmZWF0dXJlL3Rlc3QnXSxcblx0XHRcdGNyZWF0ZWRFdmVudHM6IFsnYWdlbnQ6L3Nlc3Npb246aHR0cHM6Ly9naXRodWIuY29tL21pY3Jvc29mdC92c2NvZGUvcHVsbC84J10sXG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3ByZXNlcnZlcyBjcmVhdGUgZmFpbHVyZSB3aGVuIGV4aXN0aW5nIHB1bGwgcmVxdWVzdCByZWNvdmVyeSBmYWlscycsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBnaXRTZXJ2aWNlID0gbmV3IFRlc3RHaXRTZXJ2aWNlKCk7XG5cdFx0Y29uc3Qgb2N0b0tpdFNlcnZpY2UgPSBuZXcgVGVzdE9jdG9LaXRTZXJ2aWNlKCk7XG5cdFx0b2N0b0tpdFNlcnZpY2UuY3JlYXRlRXJyb3IgPSBuZXcgRXJyb3IoJ2NyZWF0ZSBmYWlsZWQnKTtcblx0XHRvY3RvS2l0U2VydmljZS5maW5kQWZ0ZXJDcmVhdGVFcnJvciA9IG5ldyBFcnJvcignZmluZCBmYWlsZWQnKTtcblx0XHRjb25zdCB7IGhhbmRsZXIsIHNlc3Npb24gfSA9IHNldHVwKGRpc3Bvc2FibGVzLCBnaXRTZXJ2aWNlLCBvY3RvS2l0U2VydmljZSk7XG5cblx0XHRhd2FpdCBhc3NlcnQucmVqZWN0cyhcblx0XHRcdCgpID0+IGhhbmRsZXIuaW52b2tlKHsgY2hhbm5lbDogYnVpbGRTZXNzaW9uQ2hhbmdlc2V0VXJpKHNlc3Npb24udG9TdHJpbmcoKSksIG9wZXJhdGlvbklkOiBBZ2VudEhvc3RQdWxsUmVxdWVzdE9wZXJhdGlvbkhhbmRsZXIuT1BFUkFUSU9OX0NSRUFURV9QUiB9LCBDYW5jZWxsYXRpb25Ub2tlbi5Ob25lKSxcblx0XHRcdC9jcmVhdGUgZmFpbGVkLyxcblx0XHQpO1xuXHR9KTtcblxuXHR0ZXN0KCdob25vcnMgY2FuY2VsbGF0aW9uIGJlZm9yZSBtdXRhdGluZyB0aGUgcmVwb3NpdG9yeScsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBnaXRTZXJ2aWNlID0gbmV3IFRlc3RHaXRTZXJ2aWNlKCk7XG5cdFx0Y29uc3Qgb2N0b0tpdFNlcnZpY2UgPSBuZXcgVGVzdE9jdG9LaXRTZXJ2aWNlKCk7XG5cdFx0Y29uc3QgeyBoYW5kbGVyLCBzZXNzaW9uLCBjcmVhdGVkRXZlbnRzIH0gPSBzZXR1cChkaXNwb3NhYmxlcywgZ2l0U2VydmljZSwgb2N0b0tpdFNlcnZpY2UpO1xuXHRcdGNvbnN0IGN0cyA9IG5ldyBDYW5jZWxsYXRpb25Ub2tlblNvdXJjZSgpO1xuXHRcdGRpc3Bvc2FibGVzLmFkZChjdHMpO1xuXHRcdGN0cy5jYW5jZWwoKTtcblxuXHRcdGF3YWl0IGFzc2VydC5yZWplY3RzKFxuXHRcdFx0KCkgPT4gaGFuZGxlci5pbnZva2UoeyBjaGFubmVsOiBidWlsZFNlc3Npb25DaGFuZ2VzZXRVcmkoc2Vzc2lvbi50b1N0cmluZygpKSwgb3BlcmF0aW9uSWQ6IEFnZW50SG9zdFB1bGxSZXF1ZXN0T3BlcmF0aW9uSGFuZGxlci5PUEVSQVRJT05fQ1JFQVRFX1BSIH0sIGN0cy50b2tlbiksXG5cdFx0XHQvUHVsbCByZXF1ZXN0IG9wZXJhdGlvbiB3YXMgY2FuY2VsbGVkLyxcblx0XHQpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7IGdpdENhbGxzOiBnaXRTZXJ2aWNlLmNhbGxzLCBvY3RvQ2FsbHM6IG9jdG9LaXRTZXJ2aWNlLmNhbGxzLCBjcmVhdGVkRXZlbnRzIH0sIHtcblx0XHRcdGdpdENhbGxzOiBbXSxcblx0XHRcdG9jdG9DYWxsczogW10sXG5cdFx0XHRjcmVhdGVkRXZlbnRzOiBbXSxcblx0XHR9KTtcblx0fSk7XG5cblx0Ly8gV2hlbiBhIENvcGlsb3QgdG9rZW4gaXMgYXZhaWxhYmxlLCB0aGUgaGFuZGxlciBhc2tzIHRoZSB1dGlsaXR5IG1vZGVsXG5cdC8vIGZvciBhIHRpdGxlL2Rlc2NyaXB0aW9uLCBmZWVkaW5nIGl0IHRoZSBtYWluIHNlc3Npb24gY29udmVyc2F0aW9uIChvbmx5XG5cdC8vIHRoZSBtYXJrZG93biB0ZXh0IG9mIHJlcXVlc3RzL3Jlc3BvbnNlcyBcdTIwMTQgcmVhc29uaW5nLCB0b29sIGNhbGxzLCBhbmRcblx0Ly8gc3ViYWdlbnRzIGFyZSBleGNsdWRlZCkgcGx1cyB0aGUgY2hhbmdlZC1maWxlIHN1bW1hcnkuXG5cdHRlc3QoJ2dlbmVyYXRlcyB0aGUgUFIgdGl0bGUgYW5kIGRlc2NyaXB0aW9uIGZyb20gdGhlIGNvbnZlcnNhdGlvbiB2aWEgdGhlIG1vZGVsJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IGdpdFNlcnZpY2UgPSBuZXcgVGVzdEdpdFNlcnZpY2UoKTtcblx0XHRjb25zdCBvY3RvS2l0U2VydmljZSA9IG5ldyBUZXN0T2N0b0tpdFNlcnZpY2UoKTtcblx0XHRjb25zdCB0dXJuczogVHVybltdID0gW3tcblx0XHRcdGlkOiAndHVybi0xJyxcblx0XHRcdG1lc3NhZ2U6IHsgdGV4dDogJ0FkZCByZXRyeSBsb2dpYyB0byB0aGUgdXBsb2FkZXInLCBvcmlnaW46IHsga2luZDogTWVzc2FnZUtpbmQuVXNlciB9IH0sXG5cdFx0XHRyZXNwb25zZVBhcnRzOiBbXG5cdFx0XHRcdHsga2luZDogUmVzcG9uc2VQYXJ0S2luZC5SZWFzb25pbmcsIGlkOiAncjEnLCBjb250ZW50OiAnU0VDUkVUX1JFQVNPTklOR19TSE9VTERfQkVfRVhDTFVERUQnIH0sXG5cdFx0XHRcdHsga2luZDogUmVzcG9uc2VQYXJ0S2luZC5NYXJrZG93biwgaWQ6ICdtMScsIGNvbnRlbnQ6ICdJIGFkZGVkIGV4cG9uZW50aWFsIGJhY2tvZmYgdG8gdGhlIHVwbG9hZGVyLicgfSxcblx0XHRcdF0sXG5cdFx0XHR1c2FnZTogdW5kZWZpbmVkLFxuXHRcdFx0c3RhdGU6IFR1cm5TdGF0ZS5Db21wbGV0ZSxcblx0XHR9XTtcblx0XHRjb25zdCB7IGhhbmRsZXIsIHNlc3Npb24sIGNvcGlsb3RBcGlTZXJ2aWNlIH0gPSBzZXR1cChkaXNwb3NhYmxlcywgZ2l0U2VydmljZSwgb2N0b0tpdFNlcnZpY2UsIHsgd2l0aENvcGlsb3RUb2tlbjogdHJ1ZSwgdHVybnMgfSk7XG5cblx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCBoYW5kbGVyLmludm9rZSh7IGNoYW5uZWw6IGJ1aWxkU2Vzc2lvbkNoYW5nZXNldFVyaShzZXNzaW9uLnRvU3RyaW5nKCkpLCBvcGVyYXRpb25JZDogQWdlbnRIb3N0UHVsbFJlcXVlc3RPcGVyYXRpb25IYW5kbGVyLk9QRVJBVElPTl9DUkVBVEVfUFIgfSwgQ2FuY2VsbGF0aW9uVG9rZW4uTm9uZSk7XG5cblx0XHRjb25zdCB1c2VyQ29udGVudCA9IGNvcGlsb3RBcGlTZXJ2aWNlLmNhbGxzWzBdPy5yZXF1ZXN0Lm1lc3NhZ2VzLmZpbmQobSA9PiBtLnJvbGUgPT09ICd1c2VyJyk/LmNvbnRlbnQgPz8gJyc7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRtZXNzYWdlOiByZXN1bHQubWVzc2FnZSxcblx0XHRcdHRva2VuOiBjb3BpbG90QXBpU2VydmljZS5jYWxsc1swXT8udG9rZW4sXG5cdFx0XHR0aXRsZTogb2N0b0tpdFNlcnZpY2UubGFzdFRpdGxlLFxuXHRcdFx0Ym9keTogb2N0b0tpdFNlcnZpY2UubGFzdEJvZHksXG5cdFx0XHRpbmNsdWRlc1VzZXJSZXF1ZXN0OiB1c2VyQ29udGVudC5pbmNsdWRlcygnQWRkIHJldHJ5IGxvZ2ljIHRvIHRoZSB1cGxvYWRlcicpLFxuXHRcdFx0aW5jbHVkZXNBZ2VudFJlc3BvbnNlOiB1c2VyQ29udGVudC5pbmNsdWRlcygnSSBhZGRlZCBleHBvbmVudGlhbCBiYWNrb2ZmIHRvIHRoZSB1cGxvYWRlci4nKSxcblx0XHRcdGV4Y2x1ZGVzUmVhc29uaW5nOiAhdXNlckNvbnRlbnQuaW5jbHVkZXMoJ1NFQ1JFVF9SRUFTT05JTkdfU0hPVUxEX0JFX0VYQ0xVREVEJyksXG5cdFx0fSwge1xuXHRcdFx0bWVzc2FnZTogeyBtYXJrZG93bjogJ0NyZWF0ZWQgcHVsbCByZXF1ZXN0IFsjMTIzXShodHRwczovL2dpdGh1Yi5jb20vbWljcm9zb2Z0L3ZzY29kZS9wdWxsLzEyMykuJyB9LFxuXHRcdFx0dG9rZW46ICdjb3BpbG90LXRva2VuJyxcblx0XHRcdHRpdGxlOiAnR2VuZXJhdGVkIFBSIHRpdGxlJyxcblx0XHRcdGJvZHk6ICdHZW5lcmF0ZWQgUFIgZGVzY3JpcHRpb24uJyxcblx0XHRcdGluY2x1ZGVzVXNlclJlcXVlc3Q6IHRydWUsXG5cdFx0XHRpbmNsdWRlc0FnZW50UmVzcG9uc2U6IHRydWUsXG5cdFx0XHRleGNsdWRlc1JlYXNvbmluZzogdHJ1ZSxcblx0XHR9KTtcblx0fSk7XG5cblx0Ly8gV2l0aG91dCBhIENvcGlsb3QgdG9rZW4gdGhlIG1vZGVsIGlzIG5ldmVyIGNhbGxlZCBhbmQgdGhlIGhhbmRsZXIgZmFsbHNcblx0Ly8gYmFjayB0byB0aGUgYnJhbmNoLW5hbWUgYmFzZWQgdGl0bGUvZGVzY3JpcHRpb24uXG5cdHRlc3QoJ2ZhbGxzIGJhY2sgdG8gYnJhbmNoLW5hbWUgdGl0bGUgYW5kIGRlc2NyaXB0aW9uIHdpdGhvdXQgYSBDb3BpbG90IHRva2VuJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IGdpdFNlcnZpY2UgPSBuZXcgVGVzdEdpdFNlcnZpY2UoKTtcblx0XHRjb25zdCBvY3RvS2l0U2VydmljZSA9IG5ldyBUZXN0T2N0b0tpdFNlcnZpY2UoKTtcblx0XHRjb25zdCB7IGhhbmRsZXIsIHNlc3Npb24sIGNvcGlsb3RBcGlTZXJ2aWNlIH0gPSBzZXR1cChkaXNwb3NhYmxlcywgZ2l0U2VydmljZSwgb2N0b0tpdFNlcnZpY2UpO1xuXG5cdFx0YXdhaXQgaGFuZGxlci5pbnZva2UoeyBjaGFubmVsOiBidWlsZFNlc3Npb25DaGFuZ2VzZXRVcmkoc2Vzc2lvbi50b1N0cmluZygpKSwgb3BlcmF0aW9uSWQ6IEFnZW50SG9zdFB1bGxSZXF1ZXN0T3BlcmF0aW9uSGFuZGxlci5PUEVSQVRJT05fQ1JFQVRFX1BSIH0sIENhbmNlbGxhdGlvblRva2VuLk5vbmUpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHR1dGlsaXR5Q2FsbHM6IGNvcGlsb3RBcGlTZXJ2aWNlLmNhbGxzLmxlbmd0aCxcblx0XHRcdHRpdGxlOiBvY3RvS2l0U2VydmljZS5sYXN0VGl0bGUsXG5cdFx0XHRib2R5OiBvY3RvS2l0U2VydmljZS5sYXN0Qm9keSxcblx0XHR9LCB7XG5cdFx0XHR1dGlsaXR5Q2FsbHM6IDAsXG5cdFx0XHR0aXRsZTogJ2ZlYXR1cmU6IHRlc3QnLFxuXHRcdFx0Ym9keTogJ0NyZWF0ZWQgZnJvbSBgZmVhdHVyZS90ZXN0YCB0YXJnZXRpbmcgYG1haW5gLicsXG5cdFx0fSk7XG5cdH0pO1xuXG5cdC8vIE1vZGVsIGZhaWx1cmVzIG11c3Qgbm90IGJsb2NrIFBSIGNyZWF0aW9uIFx1MjAxNCB0aGUgaGFuZGxlciBmYWxscyBiYWNrIHRvIHRoZVxuXHQvLyBicmFuY2gtbmFtZSBiYXNlZCB0aXRsZS9kZXNjcmlwdGlvbi5cblx0dGVzdCgnZmFsbHMgYmFjayB0byBicmFuY2gtbmFtZSB0aXRsZSBhbmQgZGVzY3JpcHRpb24gd2hlbiBnZW5lcmF0aW9uIGZhaWxzJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IGdpdFNlcnZpY2UgPSBuZXcgVGVzdEdpdFNlcnZpY2UoKTtcblx0XHRjb25zdCBvY3RvS2l0U2VydmljZSA9IG5ldyBUZXN0T2N0b0tpdFNlcnZpY2UoKTtcblx0XHRjb25zdCBjb3BpbG90QXBpU2VydmljZSA9IG5ldyBUZXN0Q29waWxvdEFwaVNlcnZpY2UoKTtcblx0XHRjb3BpbG90QXBpU2VydmljZS5lcnJvciA9IG5ldyBFcnJvcigndXRpbGl0eSBtb2RlbCB1bmF2YWlsYWJsZScpO1xuXHRcdGNvbnN0IHsgaGFuZGxlciwgc2Vzc2lvbiB9ID0gc2V0dXAoZGlzcG9zYWJsZXMsIGdpdFNlcnZpY2UsIG9jdG9LaXRTZXJ2aWNlLCB7IHdpdGhDb3BpbG90VG9rZW46IHRydWUsIGNvcGlsb3RBcGlTZXJ2aWNlIH0pO1xuXG5cdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgaGFuZGxlci5pbnZva2UoeyBjaGFubmVsOiBidWlsZFNlc3Npb25DaGFuZ2VzZXRVcmkoc2Vzc2lvbi50b1N0cmluZygpKSwgb3BlcmF0aW9uSWQ6IEFnZW50SG9zdFB1bGxSZXF1ZXN0T3BlcmF0aW9uSGFuZGxlci5PUEVSQVRJT05fQ1JFQVRFX1BSIH0sIENhbmNlbGxhdGlvblRva2VuLk5vbmUpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRtZXNzYWdlOiByZXN1bHQubWVzc2FnZSxcblx0XHRcdHRpdGxlOiBvY3RvS2l0U2VydmljZS5sYXN0VGl0bGUsXG5cdFx0XHRib2R5OiBvY3RvS2l0U2VydmljZS5sYXN0Qm9keSxcblx0XHR9LCB7XG5cdFx0XHRtZXNzYWdlOiB7IG1hcmtkb3duOiAnQ3JlYXRlZCBwdWxsIHJlcXVlc3QgWyMxMjNdKGh0dHBzOi8vZ2l0aHViLmNvbS9taWNyb3NvZnQvdnNjb2RlL3B1bGwvMTIzKS4nIH0sXG5cdFx0XHR0aXRsZTogJ2ZlYXR1cmU6IHRlc3QnLFxuXHRcdFx0Ym9keTogJ0NyZWF0ZWQgZnJvbSBgZmVhdHVyZS90ZXN0YCB0YXJnZXRpbmcgYG1haW5gLicsXG5cdFx0fSk7XG5cdH0pO1xuXG5cdC8vIFRoZSBhdXRvLW1lcmdlIHZhcmlhbnRzIGNyZWF0ZSB0aGUgUFIgYW5kIHRoZW4gYXNrIEdpdEh1YiB0byBlbmFibGVcblx0Ly8gYXV0by1tZXJnZSB3aXRoIHRoZSByZXF1ZXN0ZWQgbWVyZ2UgbWV0aG9kLCByZXBvcnRpbmcgaXQgaW4gdGhlIHJlc3VsdC5cblx0dGVzdCgnZW5hYmxlcyBhdXRvLW1lcmdlIHdpdGggdGhlIHJlcXVlc3RlZCBtZXJnZSBtZXRob2QgYWZ0ZXIgY3JlYXRpbmcgdGhlIHB1bGwgcmVxdWVzdCcsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBnaXRTZXJ2aWNlID0gbmV3IFRlc3RHaXRTZXJ2aWNlKCk7XG5cdFx0Y29uc3Qgb2N0b0tpdFNlcnZpY2UgPSBuZXcgVGVzdE9jdG9LaXRTZXJ2aWNlKCk7XG5cdFx0Y29uc3QgeyBoYW5kbGVyLCBzZXNzaW9uLCBjcmVhdGVkRXZlbnRzIH0gPSBzZXR1cChkaXNwb3NhYmxlcywgZ2l0U2VydmljZSwgb2N0b0tpdFNlcnZpY2UsIHsgYXV0b01lcmdlTWV0aG9kOiAnU1FVQVNIJyB9KTtcblxuXHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IGhhbmRsZXIuaW52b2tlKHsgY2hhbm5lbDogYnVpbGRTZXNzaW9uQ2hhbmdlc2V0VXJpKHNlc3Npb24udG9TdHJpbmcoKSksIG9wZXJhdGlvbklkOiBBZ2VudEhvc3RQdWxsUmVxdWVzdE9wZXJhdGlvbkhhbmRsZXIuT1BFUkFUSU9OX0NSRUFURV9QUl9BVVRPX1NRVUFTSCB9LCBDYW5jZWxsYXRpb25Ub2tlbi5Ob25lKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0bWVzc2FnZTogcmVzdWx0Lm1lc3NhZ2UsXG5cdFx0XHRvY3RvQ2FsbHM6IG9jdG9LaXRTZXJ2aWNlLmNhbGxzLFxuXHRcdFx0Y3JlYXRlZEV2ZW50cyxcblx0XHR9LCB7XG5cdFx0XHRtZXNzYWdlOiB7IG1hcmtkb3duOiAnQ3JlYXRlZCBwdWxsIHJlcXVlc3QgWyMxMjNdKGh0dHBzOi8vZ2l0aHViLmNvbS9taWNyb3NvZnQvdnNjb2RlL3B1bGwvMTIzKSB3aXRoIGF1dG8tbWVyZ2UgKHNxdWFzaCkgZW5hYmxlZC4nIH0sXG5cdFx0XHRvY3RvQ2FsbHM6IFtcblx0XHRcdFx0J2ZpbmRQdWxsUmVxdWVzdEJ5SGVhZEJyYW5jaDpmZWF0dXJlL3Rlc3QnLFxuXHRcdFx0XHQnY3JlYXRlUHVsbFJlcXVlc3Q6ZmFsc2UnLFxuXHRcdFx0XHQnZW5hYmxlUHVsbFJlcXVlc3RBdXRvTWVyZ2U6UFJfbm9kZV8xMjM6U1FVQVNIJyxcblx0XHRcdF0sXG5cdFx0XHRjcmVhdGVkRXZlbnRzOiBbJ2FnZW50Oi9zZXNzaW9uOmh0dHBzOi8vZ2l0aHViLmNvbS9taWNyb3NvZnQvdnNjb2RlL3B1bGwvMTIzJ10sXG5cdFx0fSk7XG5cdH0pO1xuXG5cdC8vIEVuYWJsaW5nIGF1dG8tbWVyZ2UgaXMgYmVzdC1lZmZvcnQ6IGEgZmFpbHVyZSAoZS5nLiB0aGUgcmVwb3NpdG9yeSBkb2VzXG5cdC8vIG5vdCBhbGxvdyB0aGUgbWVyZ2UgbWV0aG9kKSBtdXN0IG5vdCBmYWlsIFBSIGNyZWF0aW9uLlxuXHR0ZXN0KCdyZXBvcnRzIGJ1dCBkb2VzIG5vdCBmYWlsIHdoZW4gYXV0by1tZXJnZSBjYW5ub3QgYmUgZW5hYmxlZCcsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBnaXRTZXJ2aWNlID0gbmV3IFRlc3RHaXRTZXJ2aWNlKCk7XG5cdFx0Y29uc3Qgb2N0b0tpdFNlcnZpY2UgPSBuZXcgVGVzdE9jdG9LaXRTZXJ2aWNlKCk7XG5cdFx0b2N0b0tpdFNlcnZpY2UuYXV0b01lcmdlRXJyb3IgPSBuZXcgRXJyb3IoJ0F1dG8tbWVyZ2UgaXMgbm90IGFsbG93ZWQgZm9yIHRoaXMgcmVwb3NpdG9yeScpO1xuXHRcdGNvbnN0IHsgaGFuZGxlciwgc2Vzc2lvbiwgY3JlYXRlZEV2ZW50cyB9ID0gc2V0dXAoZGlzcG9zYWJsZXMsIGdpdFNlcnZpY2UsIG9jdG9LaXRTZXJ2aWNlLCB7IGF1dG9NZXJnZU1ldGhvZDogJ01FUkdFJyB9KTtcblxuXHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IGhhbmRsZXIuaW52b2tlKHsgY2hhbm5lbDogYnVpbGRTZXNzaW9uQ2hhbmdlc2V0VXJpKHNlc3Npb24udG9TdHJpbmcoKSksIG9wZXJhdGlvbklkOiBBZ2VudEhvc3RQdWxsUmVxdWVzdE9wZXJhdGlvbkhhbmRsZXIuT1BFUkFUSU9OX0NSRUFURV9QUl9BVVRPX01FUkdFIH0sIENhbmNlbGxhdGlvblRva2VuLk5vbmUpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRtZXNzYWdlOiByZXN1bHQubWVzc2FnZSxcblx0XHRcdGNyZWF0ZWRFdmVudHMsXG5cdFx0fSwge1xuXHRcdFx0bWVzc2FnZTogeyBtYXJrZG93bjogJ0NyZWF0ZWQgcHVsbCByZXF1ZXN0IFsjMTIzXShodHRwczovL2dpdGh1Yi5jb20vbWljcm9zb2Z0L3ZzY29kZS9wdWxsLzEyMyksIGJ1dCBhdXRvLW1lcmdlIGNvdWxkIG5vdCBiZSBlbmFibGVkOiBBdXRvLW1lcmdlIGlzIG5vdCBhbGxvd2VkIGZvciB0aGlzIHJlcG9zaXRvcnknIH0sXG5cdFx0XHRjcmVhdGVkRXZlbnRzOiBbJ2FnZW50Oi9zZXNzaW9uOmh0dHBzOi8vZ2l0aHViLmNvbS9taWNyb3NvZnQvdnNjb2RlL3B1bGwvMTIzJ10sXG5cdFx0fSk7XG5cdH0pO1xuXG5cdC8vIFdpdGhvdXQgYSBwdWxsIHJlcXVlc3Qgbm9kZSBpZCB3ZSBjYW5ub3QgaXNzdWUgdGhlIEdyYXBoUUwgbXV0YXRpb24sIHNvXG5cdC8vIGF1dG8tbWVyZ2UgaXMgcmVwb3J0ZWQgYXMgbm90IGVuYWJsZWQgcmF0aGVyIHRoYW4gc2lsZW50bHkgc2tpcHBlZC5cblx0dGVzdCgncmVwb3J0cyB3aGVuIHRoZSBwdWxsIHJlcXVlc3Qgbm9kZSBpZCBpcyBtaXNzaW5nIGZvciBhdXRvLW1lcmdlJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IGdpdFNlcnZpY2UgPSBuZXcgVGVzdEdpdFNlcnZpY2UoKTtcblx0XHRjb25zdCBvY3RvS2l0U2VydmljZSA9IG5ldyBUZXN0T2N0b0tpdFNlcnZpY2UoKTtcblx0XHRvY3RvS2l0U2VydmljZS5jcmVhdGVkID0geyB1cmw6ICdodHRwczovL2dpdGh1Yi5jb20vbWljcm9zb2Z0L3ZzY29kZS9wdWxsLzU1JywgbnVtYmVyOiA1NSB9O1xuXHRcdGNvbnN0IHsgaGFuZGxlciwgc2Vzc2lvbiB9ID0gc2V0dXAoZGlzcG9zYWJsZXMsIGdpdFNlcnZpY2UsIG9jdG9LaXRTZXJ2aWNlLCB7IGF1dG9NZXJnZU1ldGhvZDogJ1JFQkFTRScgfSk7XG5cblx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCBoYW5kbGVyLmludm9rZSh7IGNoYW5uZWw6IGJ1aWxkU2Vzc2lvbkNoYW5nZXNldFVyaShzZXNzaW9uLnRvU3RyaW5nKCkpLCBvcGVyYXRpb25JZDogQWdlbnRIb3N0UHVsbFJlcXVlc3RPcGVyYXRpb25IYW5kbGVyLk9QRVJBVElPTl9DUkVBVEVfUFJfQVVUT19SRUJBU0UgfSwgQ2FuY2VsbGF0aW9uVG9rZW4uTm9uZSk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdG1lc3NhZ2U6IHJlc3VsdC5tZXNzYWdlLFxuXHRcdFx0ZW5hYmxlQ2FsbGVkOiBvY3RvS2l0U2VydmljZS5jYWxscy5zb21lKGNhbGwgPT4gY2FsbC5zdGFydHNXaXRoKCdlbmFibGVQdWxsUmVxdWVzdEF1dG9NZXJnZTonKSksXG5cdFx0fSwge1xuXHRcdFx0bWVzc2FnZTogeyBtYXJrZG93bjogJ0NyZWF0ZWQgcHVsbCByZXF1ZXN0IFsjNTVdKGh0dHBzOi8vZ2l0aHViLmNvbS9taWNyb3NvZnQvdnNjb2RlL3B1bGwvNTUpLCBidXQgYXV0by1tZXJnZSBjb3VsZCBub3QgYmUgZW5hYmxlZDogdGhlIHB1bGwgcmVxdWVzdCBpZGVudGlmaWVyIHdhcyBub3QgcmV0dXJuZWQgYnkgR2l0SHViLicgfSxcblx0XHRcdGVuYWJsZUNhbGxlZDogZmFsc2UsXG5cdFx0fSk7XG5cdH0pO1xufSk7XG4iXSwKICAibWFwcGluZ3MiOiAiQUFLQSxPQUFPLFlB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
