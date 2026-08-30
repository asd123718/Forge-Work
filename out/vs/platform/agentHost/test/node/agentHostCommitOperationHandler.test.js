import assert from "assert";
import { CancellationToken, CancellationTokenSource } from "../../../../base/common/cancellation.js";
import { URI } from "../../../../base/common/uri.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../base/test/common/utils.js";
import { NullLogService } from "../../../log/common/log.js";
import { buildUncommittedChangesetUri } from "../../common/changesetUri.js";
import { SessionStatus, withSessionGitState } from "../../common/state/sessionState.js";
import { AgentHostCommitOperationHandler } from "../../node/agentHostCommitOperationHandler.js";
import { createTestGitHubEndpointService } from "./testGitHubEndpointService.js";
import { AgentHostStateManager } from "../../node/agentHostStateManager.js";
import { CopilotApiError } from "../../node/shared/copilotApiService.js";
import { GITHUB_COPILOT_PROTECTED_RESOURCE } from "../../common/agent.js";
import { AHP_AUTH_REQUIRED } from "../../common/state/sessionProtocol.js";
class TestGitService {
  constructor() {
    this.calls = [];
    this.uncommitted = true;
    this.diffs = [{
      after: { uri: "file:///repo/file.ts", content: { uri: "file:///repo/file.ts" } },
      diff: { added: 1, removed: 0 }
    }];
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
    return false;
  }
  async pull() {
  }
  async push() {
  }
  async getSessionGitState() {
    return void 0;
  }
  async computeSessionFileDiffs() {
    this.calls.push("computeSessionFileDiffs");
    return this.diffs;
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
class TestCopilotApiService {
  constructor() {
    this.calls = [];
    this.response = "```text\nUpdate session changes\n```";
  }
  messages() {
    throw new Error("not used");
  }
  responses(githubToken, body, options) {
    throw new Error("not used");
  }
  async countTokens() {
    throw new Error("not used");
  }
  async models() {
    return [];
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
class TestChangesetService {
  constructor() {
    this.calls = [];
  }
  registerStaticChangesets() {
  }
  restoreStaticChangeset(_session, _kind, _diffs) {
  }
  parsePersistedStaticChangesets(_sessionUri, _metadata) {
    return {};
  }
  applyPersistedStaticChangesets(_sessionUri, _diffs) {
  }
  restorePersistedStaticChangesets(_sessionUri, _metadata) {
    return {};
  }
  persistChangesSummary(_sessionUri, _summary) {
  }
  isStaticChangesetComputeActive() {
    return false;
  }
  getListMetadataKeys(_sessionUri) {
    return void 0;
  }
  computeListEntryChanges(_sessionUri, _metadata) {
    return void 0;
  }
  refreshChangesetCatalog(session) {
    this.calls.push(`refreshChangesets:${session}`);
  }
  refreshBranchChangeset(session) {
    this.calls.push(`refreshBranch:${session}`);
  }
  refreshSessionChangeset(session) {
    this.calls.push(`refreshSession:${session}`);
  }
  onWorkingDirectoryAvailable(_session) {
  }
  recomputeSubscribedChangesets(_session) {
  }
  onSessionDisposed(_session) {
  }
  async computeUncommittedChangeset(session) {
    this.calls.push(`computeUncommitted:${session}`);
    return `${session}/changeset/uncommitted`;
  }
  async computeTurnChangeset(_session, _turnId) {
    return "";
  }
  async computeCompareTurnsChangeset(_session, _originalTurnId, _modifiedTurnId) {
    return "";
  }
  onToolCallEditsApplied(_session, _turnId) {
  }
  onTurnComplete(_session, _turnId) {
  }
  onSessionTruncated(_session) {
  }
}
function createAgentService(token) {
  return {
    getAuthToken: () => token
  };
}
function setup(disposables, gitService, copilotApiService, changesets, options) {
  const stateManager = disposables.add(new AgentHostStateManager(new NullLogService()));
  const session = URI.parse("agent:/session");
  const committedSessions = [];
  stateManager.createSession({
    resource: session.toString(),
    provider: "copilot",
    title: "Session",
    status: SessionStatus.Idle,
    createdAt: (/* @__PURE__ */ new Date(1)).toISOString(),
    modifiedAt: (/* @__PURE__ */ new Date(1)).toISOString(),
    workingDirectories: [URI.file("/repo").toString()]
  });
  stateManager.setSessionMeta(session.toString(), withSessionGitState(void 0, {
    branchName: "feature/test",
    uncommittedChanges: 1
  }));
  return {
    handler: new AgentHostCommitOperationHandler((sessionKey) => stateManager.getSessionState(sessionKey), async (sessionKey) => {
      committedSessions.push(sessionKey);
      changesets.calls.push(`onCommitted:${sessionKey}`);
      if (options?.onCommittedError) {
        throw options.onCommittedError;
      }
    }, createAgentService("gh-repo-token"), createTestGitHubEndpointService(), gitService, copilotApiService, new NullLogService()),
    session,
    committedSessions
  };
}
suite("AgentHostCommitOperationHandler", () => {
  const disposables = ensureNoDisposablesAreLeakedInTestSuite();
  test("generates a commit message, commits all changes, and invokes post-commit refresh", async () => {
    const gitService = new TestGitService();
    const copilotApiService = new TestCopilotApiService();
    const changesets = new TestChangesetService();
    const { handler, session, committedSessions } = setup(disposables, gitService, copilotApiService, changesets);
    const result = await handler.invoke({ channel: buildUncommittedChangesetUri(session.toString()), operationId: AgentHostCommitOperationHandler.OPERATION_COMMIT }, CancellationToken.None);
    assert.deepStrictEqual({
      message: result.message,
      gitCalls: gitService.calls,
      completion: copilotApiService.calls.map((call) => ({ token: call.token, fileIncluded: call.request.messages.some((message) => message.content.includes("file.ts")) })),
      changesetCalls: changesets.calls,
      committedSessions
    }, {
      message: { markdown: "Committed changes with message: `Update session changes`" },
      gitCalls: ["hasUncommittedChanges", "computeSessionFileDiffs", "commitAll:Update session changes"],
      completion: [{ token: "gh-repo-token", fileIncluded: true }],
      changesetCalls: ["onCommitted:agent:/session"],
      committedSessions: ["agent:/session"]
    });
  });
  test("returns no-op success without generating a message or committing when the working tree is clean", async () => {
    const gitService = new TestGitService();
    gitService.uncommitted = false;
    const copilotApiService = new TestCopilotApiService();
    const changesets = new TestChangesetService();
    const { handler, session } = setup(disposables, gitService, copilotApiService, changesets);
    const result = await handler.invoke({ channel: buildUncommittedChangesetUri(session.toString()), operationId: AgentHostCommitOperationHandler.OPERATION_COMMIT }, CancellationToken.None);
    assert.deepStrictEqual({ message: result.message, gitCalls: gitService.calls, completionCalls: copilotApiService.calls.length, changesetCalls: changesets.calls }, {
      message: { markdown: "No uncommitted changes to commit." },
      gitCalls: ["hasUncommittedChanges"],
      completionCalls: 0,
      changesetCalls: []
    });
  });
  test("returns success when post-commit refresh fails", async () => {
    const gitService = new TestGitService();
    const copilotApiService = new TestCopilotApiService();
    const changesets = new TestChangesetService();
    const { handler, session, committedSessions } = setup(disposables, gitService, copilotApiService, changesets, { onCommittedError: new Error("refresh failed") });
    const result = await handler.invoke({ channel: buildUncommittedChangesetUri(session.toString()), operationId: AgentHostCommitOperationHandler.OPERATION_COMMIT }, CancellationToken.None);
    assert.deepStrictEqual({
      message: result.message,
      gitCalls: gitService.calls,
      changesetCalls: changesets.calls,
      committedSessions
    }, {
      message: { markdown: "Committed changes with message: `Update session changes`" },
      gitCalls: ["hasUncommittedChanges", "computeSessionFileDiffs", "commitAll:Update session changes"],
      changesetCalls: ["onCommitted:agent:/session"],
      committedSessions: ["agent:/session"]
    });
  });
  test("honors cancellation before mutating the repository", async () => {
    const gitService = new TestGitService();
    const copilotApiService = new TestCopilotApiService();
    const changesets = new TestChangesetService();
    const { handler, session } = setup(disposables, gitService, copilotApiService, changesets);
    const cts = disposables.add(new CancellationTokenSource());
    cts.cancel();
    await assert.rejects(
      () => handler.invoke({ channel: buildUncommittedChangesetUri(session.toString()), operationId: AgentHostCommitOperationHandler.OPERATION_COMMIT }, cts.token),
      /Commit operation was cancelled/
    );
    assert.deepStrictEqual({ gitCalls: gitService.calls, completionCalls: copilotApiService.calls.length, changesetCalls: changesets.calls }, {
      gitCalls: [],
      completionCalls: 0,
      changesetCalls: []
    });
  });
  test("maps stale Copilot auth failures to AHP_AUTH_REQUIRED before committing", async () => {
    const gitService = new TestGitService();
    const copilotApiService = new TestCopilotApiService();
    copilotApiService.error = new CopilotApiError(401, {
      type: "error",
      error: { type: "authentication_error", message: "bad token" },
      request_id: null
    });
    const changesets = new TestChangesetService();
    const { handler, session, committedSessions } = setup(disposables, gitService, copilotApiService, changesets);
    let err;
    try {
      await handler.invoke({ channel: buildUncommittedChangesetUri(session.toString()), operationId: AgentHostCommitOperationHandler.OPERATION_COMMIT }, CancellationToken.None);
    } catch (error) {
      err = error;
    }
    assert.deepStrictEqual({
      code: err?.code,
      data: err?.data,
      gitCalls: gitService.calls,
      completionCalls: copilotApiService.calls.length,
      changesetCalls: changesets.calls,
      committedSessions
    }, {
      code: AHP_AUTH_REQUIRED,
      data: [GITHUB_COPILOT_PROTECTED_RESOURCE],
      gitCalls: ["hasUncommittedChanges", "computeSessionFileDiffs"],
      completionCalls: 1,
      changesetCalls: [],
      committedSessions: []
    });
  });
  test("maps Copilot token mint auth failures to AHP_AUTH_REQUIRED before committing", async () => {
    const gitService = new TestGitService();
    const copilotApiService = new TestCopilotApiService();
    copilotApiService.error = new Error("Copilot session token mint failed: 403 Forbidden");
    const changesets = new TestChangesetService();
    const { handler, session, committedSessions } = setup(disposables, gitService, copilotApiService, changesets);
    let err;
    try {
      await handler.invoke({ channel: buildUncommittedChangesetUri(session.toString()), operationId: AgentHostCommitOperationHandler.OPERATION_COMMIT }, CancellationToken.None);
    } catch (error) {
      err = error;
    }
    assert.deepStrictEqual({
      code: err?.code,
      data: err?.data,
      gitCalls: gitService.calls,
      completionCalls: copilotApiService.calls.length,
      changesetCalls: changesets.calls,
      committedSessions
    }, {
      code: AHP_AUTH_REQUIRED,
      data: [GITHUB_COPILOT_PROTECTED_RESOURCE],
      gitCalls: ["hasUncommittedChanges", "computeSessionFileDiffs"],
      completionCalls: 1,
      changesetCalls: [],
      committedSessions: []
    });
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxwbGF0Zm9ybVxcYWdlbnRIb3N0XFx0ZXN0XFxub2RlXFxhZ2VudEhvc3RDb21taXRPcGVyYXRpb25IYW5kbGVyLnRlc3QudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgYXNzZXJ0IGZyb20gJ2Fzc2VydCc7XG5pbXBvcnQgdHlwZSBBbnRocm9waWMgZnJvbSAnQGFudGhyb3BpYy1haS9zZGsnO1xuaW1wb3J0IHR5cGUgeyBDQ0FNb2RlbCB9IGZyb20gJ0B2c2NvZGUvY29waWxvdC1hcGknO1xuaW1wb3J0IHsgQ2FuY2VsbGF0aW9uVG9rZW4sIENhbmNlbGxhdGlvblRva2VuU291cmNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vY2FuY2VsbGF0aW9uLmpzJztcbmltcG9ydCB0eXBlIHsgRGlzcG9zYWJsZVN0b3JlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IFVSSSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3VyaS5qcyc7XG5pbXBvcnQgeyBlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL3Rlc3QvY29tbW9uL3V0aWxzLmpzJztcbmltcG9ydCB7IE51bGxMb2dTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vbG9nL2NvbW1vbi9sb2cuanMnO1xuaW1wb3J0IHsgYnVpbGRVbmNvbW1pdHRlZENoYW5nZXNldFVyaSB9IGZyb20gJy4uLy4uL2NvbW1vbi9jaGFuZ2VzZXRVcmkuanMnO1xuaW1wb3J0IHsgU2Vzc2lvblN0YXR1cywgd2l0aFNlc3Npb25HaXRTdGF0ZSwgdHlwZSBJU2Vzc2lvbkZpbGVEaWZmIH0gZnJvbSAnLi4vLi4vY29tbW9uL3N0YXRlL3Nlc3Npb25TdGF0ZS5qcyc7XG5pbXBvcnQgdHlwZSB7IElBZ2VudEhvc3RHaXRTZXJ2aWNlLCBJQnJhbmNoLCBJRGVmYXVsdEJyYW5jaCB9IGZyb20gJy4uLy4uL2NvbW1vbi9hZ2VudEhvc3RHaXRTZXJ2aWNlLmpzJztcbmltcG9ydCB7IEFnZW50SG9zdENvbW1pdE9wZXJhdGlvbkhhbmRsZXIgfSBmcm9tICcuLi8uLi9ub2RlL2FnZW50SG9zdENvbW1pdE9wZXJhdGlvbkhhbmRsZXIuanMnO1xuaW1wb3J0IHsgY3JlYXRlVGVzdEdpdEh1YkVuZHBvaW50U2VydmljZSB9IGZyb20gJy4vdGVzdEdpdEh1YkVuZHBvaW50U2VydmljZS5qcyc7XG5pbXBvcnQgeyBBZ2VudEhvc3RTdGF0ZU1hbmFnZXIgfSBmcm9tICcuLi8uLi9ub2RlL2FnZW50SG9zdFN0YXRlTWFuYWdlci5qcyc7XG5pbXBvcnQgeyBDb3BpbG90QXBpRXJyb3IsIHR5cGUgSUNvcGlsb3RBcGlTZXJ2aWNlLCB0eXBlIElDb3BpbG90QXBpU2VydmljZVJlcXVlc3RPcHRpb25zLCB0eXBlIElDb3BpbG90VXRpbGl0eUNoYXRDb21wbGV0aW9uUmVxdWVzdCB9IGZyb20gJy4uLy4uL25vZGUvc2hhcmVkL2NvcGlsb3RBcGlTZXJ2aWNlLmpzJztcbmltcG9ydCB7IEdJVEhVQl9DT1BJTE9UX1BST1RFQ1RFRF9SRVNPVVJDRSB9IGZyb20gJy4uLy4uL2NvbW1vbi9hZ2VudC5qcyc7XG5pbXBvcnQgeyBJQWdlbnRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vY29tbW9uL2FnZW50U2VydmljZS5qcyc7XG5pbXBvcnQgeyBBSFBfQVVUSF9SRVFVSVJFRCwgUHJvdG9jb2xFcnJvciB9IGZyb20gJy4uLy4uL2NvbW1vbi9zdGF0ZS9zZXNzaW9uUHJvdG9jb2wuanMnO1xuaW1wb3J0IHsgQ2hhbmdlc1N1bW1hcnkgfSBmcm9tICcuLi8uLi9jb21tb24vc3RhdGUvcHJvdG9jb2wvc3RhdGUuanMnO1xuaW1wb3J0IHR5cGUgeyBJQWdlbnRIb3N0Q2hhbmdlc2V0U2VydmljZSwgSVBlcnNpc3RlZENoYW5nZXNldE1ldGFkYXRhLCBJUmVzdG9yZWRDaGFuZ2VzZXREaWZmcywgU3RhdGljQ2hhbmdlc2V0S2luZCB9IGZyb20gJy4uLy4uL2NvbW1vbi9hZ2VudEhvc3RDaGFuZ2VzZXRTZXJ2aWNlLmpzJztcblxuY2xhc3MgVGVzdEdpdFNlcnZpY2UgaW1wbGVtZW50cyBJQWdlbnRIb3N0R2l0U2VydmljZSB7XG5cdGRlY2xhcmUgcmVhZG9ubHkgX3NlcnZpY2VCcmFuZDogdW5kZWZpbmVkO1xuXG5cdHJlYWRvbmx5IGNhbGxzOiBzdHJpbmdbXSA9IFtdO1xuXHR1bmNvbW1pdHRlZCA9IHRydWU7XG5cdGRpZmZzOiByZWFkb25seSBJU2Vzc2lvbkZpbGVEaWZmW10gfCB1bmRlZmluZWQgPSBbe1xuXHRcdGFmdGVyOiB7IHVyaTogJ2ZpbGU6Ly8vcmVwby9maWxlLnRzJywgY29udGVudDogeyB1cmk6ICdmaWxlOi8vL3JlcG8vZmlsZS50cycgfSB9LFxuXHRcdGRpZmY6IHsgYWRkZWQ6IDEsIHJlbW92ZWQ6IDAgfSxcblx0fV07XG5cblx0YXN5bmMgZ2V0Q3VycmVudEJyYW5jaCgpOiBQcm9taXNlPHN0cmluZyB8IHVuZGVmaW5lZD4geyByZXR1cm4gJ2ZlYXR1cmUvdGVzdCc7IH1cblx0YXN5bmMgZ2V0RGVmYXVsdEJyYW5jaCgpOiBQcm9taXNlPElEZWZhdWx0QnJhbmNoIHwgdW5kZWZpbmVkPiB7IHJldHVybiB7IG5hbWU6ICdtYWluJywgc3RhcnRQb2ludDogJ21haW4nIH07IH1cblx0YXN5bmMgZ2V0QnJhbmNoKCk6IFByb21pc2U8SUJyYW5jaCB8IHVuZGVmaW5lZD4geyByZXR1cm4gdW5kZWZpbmVkOyB9XG5cdGFzeW5jIGdldFJlZnMoKTogUHJvbWlzZTxJQnJhbmNoW10+IHsgcmV0dXJuIFtdOyB9XG5cdGFzeW5jIGdldEJyYW5jaGVzKCk6IFByb21pc2U8SUJyYW5jaFtdPiB7IHJldHVybiBbXTsgfVxuXHRhc3luYyBnZXRSZXBvc2l0b3J5Um9vdCgpOiBQcm9taXNlPFVSSSB8IHVuZGVmaW5lZD4geyByZXR1cm4gVVJJLmZpbGUoJy9yZXBvJyk7IH1cblx0YXN5bmMgZ2V0V29ya3RyZWVSb290cygpOiBQcm9taXNlPFVSSVtdPiB7IHJldHVybiBbXTsgfVxuXHRhc3luYyBhZGRXb3JrdHJlZSgpOiBQcm9taXNlPHZvaWQ+IHsgfVxuXHRhc3luYyBjb3B5V29ya3RyZWVJbmNsdWRlRmlsZXMoKTogUHJvbWlzZTx2b2lkPiB7IH1cblx0YXN5bmMgYWRkRXhpc3RpbmdXb3JrdHJlZSgpOiBQcm9taXNlPHZvaWQ+IHsgfVxuXHRhc3luYyByZW1vdmVXb3JrdHJlZSgpOiBQcm9taXNlPHZvaWQ+IHsgfVxuXHRhc3luYyBicmFuY2hFeGlzdHMoKTogUHJvbWlzZTxib29sZWFuPiB7IHJldHVybiBmYWxzZTsgfVxuXHRhc3luYyBoYXNVbmNvbW1pdHRlZENoYW5nZXMoKTogUHJvbWlzZTxib29sZWFuPiB7XG5cdFx0dGhpcy5jYWxscy5wdXNoKCdoYXNVbmNvbW1pdHRlZENoYW5nZXMnKTtcblx0XHRyZXR1cm4gdGhpcy51bmNvbW1pdHRlZDtcblx0fVxuXHRhc3luYyBjb21taXRBbGwoX3dvcmtpbmdEaXJlY3Rvcnk6IFVSSSwgbWVzc2FnZTogc3RyaW5nKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0dGhpcy5jYWxscy5wdXNoKGBjb21taXRBbGw6JHttZXNzYWdlfWApO1xuXHRcdHRoaXMudW5jb21taXR0ZWQgPSBmYWxzZTtcblx0fVxuXHRhc3luYyBtZXJnZUJyYW5jaCgpOiBQcm9taXNlPHN0cmluZz4geyByZXR1cm4gJyc7IH1cblx0YXN5bmMgcmVzdG9yZSgpOiBQcm9taXNlPHZvaWQ+IHsgfVxuXHRhc3luYyBoYXNVcHN0cmVhbSgpOiBQcm9taXNlPGJvb2xlYW4+IHsgcmV0dXJuIGZhbHNlOyB9XG5cdGFzeW5jIHB1bGwoKTogUHJvbWlzZTx2b2lkPiB7IH1cblx0YXN5bmMgcHVzaCgpOiBQcm9taXNlPHZvaWQ+IHsgfVxuXHRhc3luYyBnZXRTZXNzaW9uR2l0U3RhdGUoKTogUHJvbWlzZTx1bmRlZmluZWQ+IHsgcmV0dXJuIHVuZGVmaW5lZDsgfVxuXHRhc3luYyBjb21wdXRlU2Vzc2lvbkZpbGVEaWZmcygpOiBQcm9taXNlPHJlYWRvbmx5IElTZXNzaW9uRmlsZURpZmZbXSB8IHVuZGVmaW5lZD4ge1xuXHRcdHRoaXMuY2FsbHMucHVzaCgnY29tcHV0ZVNlc3Npb25GaWxlRGlmZnMnKTtcblx0XHRyZXR1cm4gdGhpcy5kaWZmcztcblx0fVxuXHRhc3luYyBzaG93QmxvYigpOiBQcm9taXNlPHVuZGVmaW5lZD4geyByZXR1cm4gdW5kZWZpbmVkOyB9XG5cdGFzeW5jIGNhcHR1cmVXb3JraW5nVHJlZUFzVHJlZSgpOiBQcm9taXNlPHVuZGVmaW5lZD4geyByZXR1cm4gdW5kZWZpbmVkOyB9XG5cdGFzeW5jIGNvbW1pdFRyZWUoKTogUHJvbWlzZTx1bmRlZmluZWQ+IHsgcmV0dXJuIHVuZGVmaW5lZDsgfVxuXHRhc3luYyB1cGRhdGVSZWYoKTogUHJvbWlzZTx2b2lkPiB7IH1cblx0YXN5bmMgZGVsZXRlUmVmcygpOiBQcm9taXNlPHZvaWQ+IHsgfVxuXHRhc3luYyByZXZQYXJzZSgpOiBQcm9taXNlPHN0cmluZyB8IHVuZGVmaW5lZD4geyByZXR1cm4gdW5kZWZpbmVkOyB9XG5cdGFzeW5jIHJlc29sdmVCcmFuY2hCYXNlbGluZUNvbW1pdCgpOiBQcm9taXNlPHN0cmluZyB8IHVuZGVmaW5lZD4geyByZXR1cm4gdW5kZWZpbmVkOyB9XG5cdGFzeW5jIG92ZXJsYXlQYXRoSW50b1RyZWUoKTogUHJvbWlzZTxzdHJpbmcgfCB1bmRlZmluZWQ+IHsgcmV0dXJuIHVuZGVmaW5lZDsgfVxuXHRhc3luYyBkaWZmVHJlZVBhdGhzKCk6IFByb21pc2U8c3RyaW5nW10gfCB1bmRlZmluZWQ+IHsgcmV0dXJuIHVuZGVmaW5lZDsgfVxuXHRhc3luYyBjb21wdXRlRmlsZURpZmZzQmV0d2VlblJlZnMoKTogUHJvbWlzZTxyZWFkb25seSBJU2Vzc2lvbkZpbGVEaWZmW10gfCB1bmRlZmluZWQ+IHsgcmV0dXJuIHVuZGVmaW5lZDsgfVxuXHRhc3luYyBnZXRGZXRjaFJlbW90ZVVybHMoKTogUHJvbWlzZTx1bmRlZmluZWQ+IHsgcmV0dXJuIHVuZGVmaW5lZDsgfVxuXHRhc3luYyBnZXRVbnRyYWNrZWRQYXRocygpOiBQcm9taXNlPFtdPiB7IHJldHVybiBbXTsgfVxuXHRhc3luYyBnZXRCcmFuY2hEaWZmU2FmZXR5SW5mbygpOiBQcm9taXNlPHVuZGVmaW5lZD4geyByZXR1cm4gdW5kZWZpbmVkOyB9XG5cdGFzeW5jIGdldERpZmZQYXRjaEJldHdlZW5SZWZzKCk6IFByb21pc2U8dW5kZWZpbmVkPiB7IHJldHVybiB1bmRlZmluZWQ7IH1cbn1cblxuY2xhc3MgVGVzdENvcGlsb3RBcGlTZXJ2aWNlIGltcGxlbWVudHMgSUNvcGlsb3RBcGlTZXJ2aWNlIHtcblx0ZGVjbGFyZSByZWFkb25seSBfc2VydmljZUJyYW5kOiB1bmRlZmluZWQ7XG5cblx0cmVhZG9ubHkgY2FsbHM6IHsgdG9rZW46IHN0cmluZzsgcmVxdWVzdDogSUNvcGlsb3RVdGlsaXR5Q2hhdENvbXBsZXRpb25SZXF1ZXN0OyBvcHRpb25zPzogSUNvcGlsb3RBcGlTZXJ2aWNlUmVxdWVzdE9wdGlvbnMgfVtdID0gW107XG5cdHJlc3BvbnNlID0gJ2BgYHRleHRcXG5VcGRhdGUgc2Vzc2lvbiBjaGFuZ2VzXFxuYGBgJztcblx0ZXJyb3I6IEVycm9yIHwgdW5kZWZpbmVkO1xuXG5cdG1lc3NhZ2VzKF9naXRodWJUb2tlbjogc3RyaW5nLCByZXF1ZXN0OiBBbnRocm9waWMuTWVzc2FnZUNyZWF0ZVBhcmFtc1N0cmVhbWluZywgX29wdGlvbnM/OiBJQ29waWxvdEFwaVNlcnZpY2VSZXF1ZXN0T3B0aW9ucyk6IEFzeW5jR2VuZXJhdG9yPEFudGhyb3BpYy5NZXNzYWdlU3RyZWFtRXZlbnQ+O1xuXHRtZXNzYWdlcyhfZ2l0aHViVG9rZW46IHN0cmluZywgcmVxdWVzdDogQW50aHJvcGljLk1lc3NhZ2VDcmVhdGVQYXJhbXNOb25TdHJlYW1pbmcsIF9vcHRpb25zPzogSUNvcGlsb3RBcGlTZXJ2aWNlUmVxdWVzdE9wdGlvbnMpOiBQcm9taXNlPEFudGhyb3BpYy5NZXNzYWdlPjtcblx0bWVzc2FnZXMoKTogQXN5bmNHZW5lcmF0b3I8QW50aHJvcGljLk1lc3NhZ2VTdHJlYW1FdmVudD4gfCBQcm9taXNlPEFudGhyb3BpYy5NZXNzYWdlPiB7XG5cdFx0dGhyb3cgbmV3IEVycm9yKCdub3QgdXNlZCcpO1xuXHR9XG5cdHJlc3BvbnNlcyhcblx0XHRnaXRodWJUb2tlbjogc3RyaW5nLFxuXHRcdGJvZHk6IHN0cmluZyxcblx0XHRvcHRpb25zPzogSUNvcGlsb3RBcGlTZXJ2aWNlUmVxdWVzdE9wdGlvbnMsXG5cdCk6IFByb21pc2U8UmVzcG9uc2U+IHtcblx0XHR0aHJvdyBuZXcgRXJyb3IoJ25vdCB1c2VkJyk7XG5cdH1cblx0YXN5bmMgY291bnRUb2tlbnMoKTogUHJvbWlzZTxBbnRocm9waWMuTWVzc2FnZVRva2Vuc0NvdW50PiB7IHRocm93IG5ldyBFcnJvcignbm90IHVzZWQnKTsgfVxuXHRhc3luYyBtb2RlbHMoKTogUHJvbWlzZTxDQ0FNb2RlbFtdPiB7IHJldHVybiBbXTsgfVxuXHRhc3luYyByZXNvbHZlUmVzdHJpY3RlZFRlbGVtZXRyeUNvbnRleHQoKSB7IHJldHVybiB7IHJlc3RyaWN0ZWRUZWxlbWV0cnlFbmFibGVkOiBmYWxzZSwgdHJhY2tpbmdJZDogdW5kZWZpbmVkLCB0ZWxlbWV0cnlFbmRwb2ludDogdW5kZWZpbmVkIH07IH1cblx0YXN5bmMgcmVzb2x2ZUFwaUVuZHBvaW50KCkgeyByZXR1cm4gdW5kZWZpbmVkOyB9XG5cdGFzeW5jIHV0aWxpdHlDaGF0Q29tcGxldGlvbihnaXRodWJUb2tlbjogc3RyaW5nLCByZXF1ZXN0OiBJQ29waWxvdFV0aWxpdHlDaGF0Q29tcGxldGlvblJlcXVlc3QsIG9wdGlvbnM/OiBJQ29waWxvdEFwaVNlcnZpY2VSZXF1ZXN0T3B0aW9ucyk6IFByb21pc2U8c3RyaW5nPiB7XG5cdFx0dGhpcy5jYWxscy5wdXNoKHsgdG9rZW46IGdpdGh1YlRva2VuLCByZXF1ZXN0LCBvcHRpb25zIH0pO1xuXHRcdGlmICh0aGlzLmVycm9yKSB7XG5cdFx0XHR0aHJvdyB0aGlzLmVycm9yO1xuXHRcdH1cblx0XHRyZXR1cm4gdGhpcy5yZXNwb25zZTtcblx0fVxufVxuXG5jbGFzcyBUZXN0Q2hhbmdlc2V0U2VydmljZSBpbXBsZW1lbnRzIElBZ2VudEhvc3RDaGFuZ2VzZXRTZXJ2aWNlIHtcblx0ZGVjbGFyZSByZWFkb25seSBfc2VydmljZUJyYW5kOiB1bmRlZmluZWQ7XG5cblx0cmVhZG9ubHkgY2FsbHM6IHN0cmluZ1tdID0gW107XG5cdHJlZ2lzdGVyU3RhdGljQ2hhbmdlc2V0cygpOiB2b2lkIHsgfVxuXHRyZXN0b3JlU3RhdGljQ2hhbmdlc2V0KF9zZXNzaW9uOiBzdHJpbmcsIF9raW5kOiBTdGF0aWNDaGFuZ2VzZXRLaW5kLCBfZGlmZnM6IHJlYWRvbmx5IElTZXNzaW9uRmlsZURpZmZbXSk6IHZvaWQgeyB9XG5cdHBhcnNlUGVyc2lzdGVkU3RhdGljQ2hhbmdlc2V0cyhfc2Vzc2lvblVyaTogc3RyaW5nLCBfbWV0YWRhdGE6IElQZXJzaXN0ZWRDaGFuZ2VzZXRNZXRhZGF0YSk6IElSZXN0b3JlZENoYW5nZXNldERpZmZzIHsgcmV0dXJuIHt9OyB9XG5cdGFwcGx5UGVyc2lzdGVkU3RhdGljQ2hhbmdlc2V0cyhfc2Vzc2lvblVyaTogc3RyaW5nLCBfZGlmZnM6IElSZXN0b3JlZENoYW5nZXNldERpZmZzKTogdm9pZCB7IH1cblx0cmVzdG9yZVBlcnNpc3RlZFN0YXRpY0NoYW5nZXNldHMoX3Nlc3Npb25Vcmk6IHN0cmluZywgX21ldGFkYXRhOiBJUGVyc2lzdGVkQ2hhbmdlc2V0TWV0YWRhdGEpOiBJUmVzdG9yZWRDaGFuZ2VzZXREaWZmcyB7IHJldHVybiB7fTsgfVxuXHRwZXJzaXN0Q2hhbmdlc1N1bW1hcnkoX3Nlc3Npb25Vcmk6IHN0cmluZywgX3N1bW1hcnk6IENoYW5nZXNTdW1tYXJ5KTogdm9pZCB7IH1cblx0aXNTdGF0aWNDaGFuZ2VzZXRDb21wdXRlQWN0aXZlKCk6IGJvb2xlYW4geyByZXR1cm4gZmFsc2U7IH1cblx0Z2V0TGlzdE1ldGFkYXRhS2V5cyhfc2Vzc2lvblVyaTogc3RyaW5nKTogUmVjb3JkPHN0cmluZywgdHJ1ZT4gfCB1bmRlZmluZWQgeyByZXR1cm4gdW5kZWZpbmVkOyB9XG5cdGNvbXB1dGVMaXN0RW50cnlDaGFuZ2VzKF9zZXNzaW9uVXJpOiBzdHJpbmcsIF9tZXRhZGF0YTogUmVjb3JkPHN0cmluZywgc3RyaW5nIHwgdW5kZWZpbmVkPik6IENoYW5nZXNTdW1tYXJ5IHwgdW5kZWZpbmVkIHsgcmV0dXJuIHVuZGVmaW5lZDsgfVxuXHRyZWZyZXNoQ2hhbmdlc2V0Q2F0YWxvZyhzZXNzaW9uOiBzdHJpbmcpOiB2b2lkIHsgdGhpcy5jYWxscy5wdXNoKGByZWZyZXNoQ2hhbmdlc2V0czoke3Nlc3Npb259YCk7IH1cblx0cmVmcmVzaEJyYW5jaENoYW5nZXNldChzZXNzaW9uOiBzdHJpbmcpOiB2b2lkIHsgdGhpcy5jYWxscy5wdXNoKGByZWZyZXNoQnJhbmNoOiR7c2Vzc2lvbn1gKTsgfVxuXHRyZWZyZXNoU2Vzc2lvbkNoYW5nZXNldChzZXNzaW9uOiBzdHJpbmcpOiB2b2lkIHsgdGhpcy5jYWxscy5wdXNoKGByZWZyZXNoU2Vzc2lvbjoke3Nlc3Npb259YCk7IH1cblx0b25Xb3JraW5nRGlyZWN0b3J5QXZhaWxhYmxlKF9zZXNzaW9uOiBzdHJpbmcpOiB2b2lkIHsgfVxuXHRyZWNvbXB1dGVTdWJzY3JpYmVkQ2hhbmdlc2V0cyhfc2Vzc2lvbjogc3RyaW5nKTogdm9pZCB7IH1cblx0b25TZXNzaW9uRGlzcG9zZWQoX3Nlc3Npb246IHN0cmluZyk6IHZvaWQgeyB9XG5cdGFzeW5jIGNvbXB1dGVVbmNvbW1pdHRlZENoYW5nZXNldChzZXNzaW9uOiBzdHJpbmcpOiBQcm9taXNlPHN0cmluZz4geyB0aGlzLmNhbGxzLnB1c2goYGNvbXB1dGVVbmNvbW1pdHRlZDoke3Nlc3Npb259YCk7IHJldHVybiBgJHtzZXNzaW9ufS9jaGFuZ2VzZXQvdW5jb21taXR0ZWRgOyB9XG5cdGFzeW5jIGNvbXB1dGVUdXJuQ2hhbmdlc2V0KF9zZXNzaW9uOiBzdHJpbmcsIF90dXJuSWQ6IHN0cmluZyk6IFByb21pc2U8c3RyaW5nPiB7IHJldHVybiAnJzsgfVxuXHRhc3luYyBjb21wdXRlQ29tcGFyZVR1cm5zQ2hhbmdlc2V0KF9zZXNzaW9uOiBzdHJpbmcsIF9vcmlnaW5hbFR1cm5JZDogc3RyaW5nLCBfbW9kaWZpZWRUdXJuSWQ6IHN0cmluZyk6IFByb21pc2U8c3RyaW5nPiB7IHJldHVybiAnJzsgfVxuXHRvblRvb2xDYWxsRWRpdHNBcHBsaWVkKF9zZXNzaW9uOiBzdHJpbmcsIF90dXJuSWQ6IHN0cmluZyk6IHZvaWQgeyB9XG5cdG9uVHVybkNvbXBsZXRlKF9zZXNzaW9uOiBzdHJpbmcsIF90dXJuSWQ6IHN0cmluZyB8IHVuZGVmaW5lZCk6IHZvaWQgeyB9XG5cdG9uU2Vzc2lvblRydW5jYXRlZChfc2Vzc2lvbjogc3RyaW5nKTogdm9pZCB7IH1cbn1cblxuZnVuY3Rpb24gY3JlYXRlQWdlbnRTZXJ2aWNlKHRva2VuOiBzdHJpbmcgfCB1bmRlZmluZWQpOiBJQWdlbnRTZXJ2aWNlIHtcblx0cmV0dXJuIHtcblx0XHRnZXRBdXRoVG9rZW46ICgpID0+IHRva2VuLFxuXHR9IGFzIFBhcnRpYWw8SUFnZW50U2VydmljZT4gYXMgSUFnZW50U2VydmljZTtcbn1cblxuZnVuY3Rpb24gc2V0dXAoZGlzcG9zYWJsZXM6IFBpY2s8RGlzcG9zYWJsZVN0b3JlLCAnYWRkJz4sIGdpdFNlcnZpY2U6IFRlc3RHaXRTZXJ2aWNlLCBjb3BpbG90QXBpU2VydmljZTogVGVzdENvcGlsb3RBcGlTZXJ2aWNlLCBjaGFuZ2VzZXRzOiBUZXN0Q2hhbmdlc2V0U2VydmljZSwgb3B0aW9ucz86IHsgcmVhZG9ubHkgb25Db21taXR0ZWRFcnJvcj86IEVycm9yIH0pOiB7IGhhbmRsZXI6IEFnZW50SG9zdENvbW1pdE9wZXJhdGlvbkhhbmRsZXI7IHNlc3Npb246IFVSSTsgY29tbWl0dGVkU2Vzc2lvbnM6IHN0cmluZ1tdIH0ge1xuXHRjb25zdCBzdGF0ZU1hbmFnZXIgPSBkaXNwb3NhYmxlcy5hZGQobmV3IEFnZW50SG9zdFN0YXRlTWFuYWdlcihuZXcgTnVsbExvZ1NlcnZpY2UoKSkpO1xuXHRjb25zdCBzZXNzaW9uID0gVVJJLnBhcnNlKCdhZ2VudDovc2Vzc2lvbicpO1xuXHRjb25zdCBjb21taXR0ZWRTZXNzaW9uczogc3RyaW5nW10gPSBbXTtcblx0c3RhdGVNYW5hZ2VyLmNyZWF0ZVNlc3Npb24oe1xuXHRcdHJlc291cmNlOiBzZXNzaW9uLnRvU3RyaW5nKCksXG5cdFx0cHJvdmlkZXI6ICdjb3BpbG90Jyxcblx0XHR0aXRsZTogJ1Nlc3Npb24nLFxuXHRcdHN0YXR1czogU2Vzc2lvblN0YXR1cy5JZGxlLFxuXHRcdGNyZWF0ZWRBdDogbmV3IERhdGUoMSkudG9JU09TdHJpbmcoKSxcblx0XHRtb2RpZmllZEF0OiBuZXcgRGF0ZSgxKS50b0lTT1N0cmluZygpLFxuXHRcdHdvcmtpbmdEaXJlY3RvcmllczogW1VSSS5maWxlKCcvcmVwbycpLnRvU3RyaW5nKCldLFxuXHR9KTtcblx0c3RhdGVNYW5hZ2VyLnNldFNlc3Npb25NZXRhKHNlc3Npb24udG9TdHJpbmcoKSwgd2l0aFNlc3Npb25HaXRTdGF0ZSh1bmRlZmluZWQsIHtcblx0XHRicmFuY2hOYW1lOiAnZmVhdHVyZS90ZXN0Jyxcblx0XHR1bmNvbW1pdHRlZENoYW5nZXM6IDEsXG5cdH0pKTtcblx0cmV0dXJuIHtcblx0XHRoYW5kbGVyOiBuZXcgQWdlbnRIb3N0Q29tbWl0T3BlcmF0aW9uSGFuZGxlcihzZXNzaW9uS2V5ID0+IHN0YXRlTWFuYWdlci5nZXRTZXNzaW9uU3RhdGUoc2Vzc2lvbktleSksIGFzeW5jIHNlc3Npb25LZXkgPT4ge1xuXHRcdFx0Y29tbWl0dGVkU2Vzc2lvbnMucHVzaChzZXNzaW9uS2V5KTtcblx0XHRcdGNoYW5nZXNldHMuY2FsbHMucHVzaChgb25Db21taXR0ZWQ6JHtzZXNzaW9uS2V5fWApO1xuXHRcdFx0aWYgKG9wdGlvbnM/Lm9uQ29tbWl0dGVkRXJyb3IpIHtcblx0XHRcdFx0dGhyb3cgb3B0aW9ucy5vbkNvbW1pdHRlZEVycm9yO1xuXHRcdFx0fVxuXHRcdH0sIGNyZWF0ZUFnZW50U2VydmljZSgnZ2gtcmVwby10b2tlbicpLCBjcmVhdGVUZXN0R2l0SHViRW5kcG9pbnRTZXJ2aWNlKCksIGdpdFNlcnZpY2UsIGNvcGlsb3RBcGlTZXJ2aWNlLCBuZXcgTnVsbExvZ1NlcnZpY2UoKSksXG5cdFx0c2Vzc2lvbixcblx0XHRjb21taXR0ZWRTZXNzaW9ucyxcblx0fTtcbn1cblxuc3VpdGUoJ0FnZW50SG9zdENvbW1pdE9wZXJhdGlvbkhhbmRsZXInLCAoKSA9PiB7XG5cdGNvbnN0IGRpc3Bvc2FibGVzID0gZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlKCk7XG5cblx0dGVzdCgnZ2VuZXJhdGVzIGEgY29tbWl0IG1lc3NhZ2UsIGNvbW1pdHMgYWxsIGNoYW5nZXMsIGFuZCBpbnZva2VzIHBvc3QtY29tbWl0IHJlZnJlc2gnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgZ2l0U2VydmljZSA9IG5ldyBUZXN0R2l0U2VydmljZSgpO1xuXHRcdGNvbnN0IGNvcGlsb3RBcGlTZXJ2aWNlID0gbmV3IFRlc3RDb3BpbG90QXBpU2VydmljZSgpO1xuXHRcdGNvbnN0IGNoYW5nZXNldHMgPSBuZXcgVGVzdENoYW5nZXNldFNlcnZpY2UoKTtcblx0XHRjb25zdCB7IGhhbmRsZXIsIHNlc3Npb24sIGNvbW1pdHRlZFNlc3Npb25zIH0gPSBzZXR1cChkaXNwb3NhYmxlcywgZ2l0U2VydmljZSwgY29waWxvdEFwaVNlcnZpY2UsIGNoYW5nZXNldHMpO1xuXG5cdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgaGFuZGxlci5pbnZva2UoeyBjaGFubmVsOiBidWlsZFVuY29tbWl0dGVkQ2hhbmdlc2V0VXJpKHNlc3Npb24udG9TdHJpbmcoKSksIG9wZXJhdGlvbklkOiBBZ2VudEhvc3RDb21taXRPcGVyYXRpb25IYW5kbGVyLk9QRVJBVElPTl9DT01NSVQgfSwgQ2FuY2VsbGF0aW9uVG9rZW4uTm9uZSk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdG1lc3NhZ2U6IHJlc3VsdC5tZXNzYWdlLFxuXHRcdFx0Z2l0Q2FsbHM6IGdpdFNlcnZpY2UuY2FsbHMsXG5cdFx0XHRjb21wbGV0aW9uOiBjb3BpbG90QXBpU2VydmljZS5jYWxscy5tYXAoY2FsbCA9PiAoeyB0b2tlbjogY2FsbC50b2tlbiwgZmlsZUluY2x1ZGVkOiBjYWxsLnJlcXVlc3QubWVzc2FnZXMuc29tZShtZXNzYWdlID0+IG1lc3NhZ2UuY29udGVudC5pbmNsdWRlcygnZmlsZS50cycpKSB9KSksXG5cdFx0XHRjaGFuZ2VzZXRDYWxsczogY2hhbmdlc2V0cy5jYWxscyxcblx0XHRcdGNvbW1pdHRlZFNlc3Npb25zLFxuXHRcdH0sIHtcblx0XHRcdG1lc3NhZ2U6IHsgbWFya2Rvd246ICdDb21taXR0ZWQgY2hhbmdlcyB3aXRoIG1lc3NhZ2U6IGBVcGRhdGUgc2Vzc2lvbiBjaGFuZ2VzYCcgfSxcblx0XHRcdGdpdENhbGxzOiBbJ2hhc1VuY29tbWl0dGVkQ2hhbmdlcycsICdjb21wdXRlU2Vzc2lvbkZpbGVEaWZmcycsICdjb21taXRBbGw6VXBkYXRlIHNlc3Npb24gY2hhbmdlcyddLFxuXHRcdFx0Y29tcGxldGlvbjogW3sgdG9rZW46ICdnaC1yZXBvLXRva2VuJywgZmlsZUluY2x1ZGVkOiB0cnVlIH1dLFxuXHRcdFx0Y2hhbmdlc2V0Q2FsbHM6IFsnb25Db21taXR0ZWQ6YWdlbnQ6L3Nlc3Npb24nXSxcblx0XHRcdGNvbW1pdHRlZFNlc3Npb25zOiBbJ2FnZW50Oi9zZXNzaW9uJ10sXG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3JldHVybnMgbm8tb3Agc3VjY2VzcyB3aXRob3V0IGdlbmVyYXRpbmcgYSBtZXNzYWdlIG9yIGNvbW1pdHRpbmcgd2hlbiB0aGUgd29ya2luZyB0cmVlIGlzIGNsZWFuJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IGdpdFNlcnZpY2UgPSBuZXcgVGVzdEdpdFNlcnZpY2UoKTtcblx0XHRnaXRTZXJ2aWNlLnVuY29tbWl0dGVkID0gZmFsc2U7XG5cdFx0Y29uc3QgY29waWxvdEFwaVNlcnZpY2UgPSBuZXcgVGVzdENvcGlsb3RBcGlTZXJ2aWNlKCk7XG5cdFx0Y29uc3QgY2hhbmdlc2V0cyA9IG5ldyBUZXN0Q2hhbmdlc2V0U2VydmljZSgpO1xuXHRcdGNvbnN0IHsgaGFuZGxlciwgc2Vzc2lvbiB9ID0gc2V0dXAoZGlzcG9zYWJsZXMsIGdpdFNlcnZpY2UsIGNvcGlsb3RBcGlTZXJ2aWNlLCBjaGFuZ2VzZXRzKTtcblxuXHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IGhhbmRsZXIuaW52b2tlKHsgY2hhbm5lbDogYnVpbGRVbmNvbW1pdHRlZENoYW5nZXNldFVyaShzZXNzaW9uLnRvU3RyaW5nKCkpLCBvcGVyYXRpb25JZDogQWdlbnRIb3N0Q29tbWl0T3BlcmF0aW9uSGFuZGxlci5PUEVSQVRJT05fQ09NTUlUIH0sIENhbmNlbGxhdGlvblRva2VuLk5vbmUpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7IG1lc3NhZ2U6IHJlc3VsdC5tZXNzYWdlLCBnaXRDYWxsczogZ2l0U2VydmljZS5jYWxscywgY29tcGxldGlvbkNhbGxzOiBjb3BpbG90QXBpU2VydmljZS5jYWxscy5sZW5ndGgsIGNoYW5nZXNldENhbGxzOiBjaGFuZ2VzZXRzLmNhbGxzIH0sIHtcblx0XHRcdG1lc3NhZ2U6IHsgbWFya2Rvd246ICdObyB1bmNvbW1pdHRlZCBjaGFuZ2VzIHRvIGNvbW1pdC4nIH0sXG5cdFx0XHRnaXRDYWxsczogWydoYXNVbmNvbW1pdHRlZENoYW5nZXMnXSxcblx0XHRcdGNvbXBsZXRpb25DYWxsczogMCxcblx0XHRcdGNoYW5nZXNldENhbGxzOiBbXSxcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgncmV0dXJucyBzdWNjZXNzIHdoZW4gcG9zdC1jb21taXQgcmVmcmVzaCBmYWlscycsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBnaXRTZXJ2aWNlID0gbmV3IFRlc3RHaXRTZXJ2aWNlKCk7XG5cdFx0Y29uc3QgY29waWxvdEFwaVNlcnZpY2UgPSBuZXcgVGVzdENvcGlsb3RBcGlTZXJ2aWNlKCk7XG5cdFx0Y29uc3QgY2hhbmdlc2V0cyA9IG5ldyBUZXN0Q2hhbmdlc2V0U2VydmljZSgpO1xuXHRcdGNvbnN0IHsgaGFuZGxlciwgc2Vzc2lvbiwgY29tbWl0dGVkU2Vzc2lvbnMgfSA9IHNldHVwKGRpc3Bvc2FibGVzLCBnaXRTZXJ2aWNlLCBjb3BpbG90QXBpU2VydmljZSwgY2hhbmdlc2V0cywgeyBvbkNvbW1pdHRlZEVycm9yOiBuZXcgRXJyb3IoJ3JlZnJlc2ggZmFpbGVkJykgfSk7XG5cblx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCBoYW5kbGVyLmludm9rZSh7IGNoYW5uZWw6IGJ1aWxkVW5jb21taXR0ZWRDaGFuZ2VzZXRVcmkoc2Vzc2lvbi50b1N0cmluZygpKSwgb3BlcmF0aW9uSWQ6IEFnZW50SG9zdENvbW1pdE9wZXJhdGlvbkhhbmRsZXIuT1BFUkFUSU9OX0NPTU1JVCB9LCBDYW5jZWxsYXRpb25Ub2tlbi5Ob25lKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0bWVzc2FnZTogcmVzdWx0Lm1lc3NhZ2UsXG5cdFx0XHRnaXRDYWxsczogZ2l0U2VydmljZS5jYWxscyxcblx0XHRcdGNoYW5nZXNldENhbGxzOiBjaGFuZ2VzZXRzLmNhbGxzLFxuXHRcdFx0Y29tbWl0dGVkU2Vzc2lvbnMsXG5cdFx0fSwge1xuXHRcdFx0bWVzc2FnZTogeyBtYXJrZG93bjogJ0NvbW1pdHRlZCBjaGFuZ2VzIHdpdGggbWVzc2FnZTogYFVwZGF0ZSBzZXNzaW9uIGNoYW5nZXNgJyB9LFxuXHRcdFx0Z2l0Q2FsbHM6IFsnaGFzVW5jb21taXR0ZWRDaGFuZ2VzJywgJ2NvbXB1dGVTZXNzaW9uRmlsZURpZmZzJywgJ2NvbW1pdEFsbDpVcGRhdGUgc2Vzc2lvbiBjaGFuZ2VzJ10sXG5cdFx0XHRjaGFuZ2VzZXRDYWxsczogWydvbkNvbW1pdHRlZDphZ2VudDovc2Vzc2lvbiddLFxuXHRcdFx0Y29tbWl0dGVkU2Vzc2lvbnM6IFsnYWdlbnQ6L3Nlc3Npb24nXSxcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnaG9ub3JzIGNhbmNlbGxhdGlvbiBiZWZvcmUgbXV0YXRpbmcgdGhlIHJlcG9zaXRvcnknLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgZ2l0U2VydmljZSA9IG5ldyBUZXN0R2l0U2VydmljZSgpO1xuXHRcdGNvbnN0IGNvcGlsb3RBcGlTZXJ2aWNlID0gbmV3IFRlc3RDb3BpbG90QXBpU2VydmljZSgpO1xuXHRcdGNvbnN0IGNoYW5nZXNldHMgPSBuZXcgVGVzdENoYW5nZXNldFNlcnZpY2UoKTtcblx0XHRjb25zdCB7IGhhbmRsZXIsIHNlc3Npb24gfSA9IHNldHVwKGRpc3Bvc2FibGVzLCBnaXRTZXJ2aWNlLCBjb3BpbG90QXBpU2VydmljZSwgY2hhbmdlc2V0cyk7XG5cdFx0Y29uc3QgY3RzID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBDYW5jZWxsYXRpb25Ub2tlblNvdXJjZSgpKTtcblx0XHRjdHMuY2FuY2VsKCk7XG5cblx0XHRhd2FpdCBhc3NlcnQucmVqZWN0cyhcblx0XHRcdCgpID0+IGhhbmRsZXIuaW52b2tlKHsgY2hhbm5lbDogYnVpbGRVbmNvbW1pdHRlZENoYW5nZXNldFVyaShzZXNzaW9uLnRvU3RyaW5nKCkpLCBvcGVyYXRpb25JZDogQWdlbnRIb3N0Q29tbWl0T3BlcmF0aW9uSGFuZGxlci5PUEVSQVRJT05fQ09NTUlUIH0sIGN0cy50b2tlbiksXG5cdFx0XHQvQ29tbWl0IG9wZXJhdGlvbiB3YXMgY2FuY2VsbGVkLyxcblx0XHQpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7IGdpdENhbGxzOiBnaXRTZXJ2aWNlLmNhbGxzLCBjb21wbGV0aW9uQ2FsbHM6IGNvcGlsb3RBcGlTZXJ2aWNlLmNhbGxzLmxlbmd0aCwgY2hhbmdlc2V0Q2FsbHM6IGNoYW5nZXNldHMuY2FsbHMgfSwge1xuXHRcdFx0Z2l0Q2FsbHM6IFtdLFxuXHRcdFx0Y29tcGxldGlvbkNhbGxzOiAwLFxuXHRcdFx0Y2hhbmdlc2V0Q2FsbHM6IFtdLFxuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdtYXBzIHN0YWxlIENvcGlsb3QgYXV0aCBmYWlsdXJlcyB0byBBSFBfQVVUSF9SRVFVSVJFRCBiZWZvcmUgY29tbWl0dGluZycsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBnaXRTZXJ2aWNlID0gbmV3IFRlc3RHaXRTZXJ2aWNlKCk7XG5cdFx0Y29uc3QgY29waWxvdEFwaVNlcnZpY2UgPSBuZXcgVGVzdENvcGlsb3RBcGlTZXJ2aWNlKCk7XG5cdFx0Y29waWxvdEFwaVNlcnZpY2UuZXJyb3IgPSBuZXcgQ29waWxvdEFwaUVycm9yKDQwMSwge1xuXHRcdFx0dHlwZTogJ2Vycm9yJyxcblx0XHRcdGVycm9yOiB7IHR5cGU6ICdhdXRoZW50aWNhdGlvbl9lcnJvcicsIG1lc3NhZ2U6ICdiYWQgdG9rZW4nIH0sXG5cdFx0XHRyZXF1ZXN0X2lkOiBudWxsLFxuXHRcdH0pO1xuXHRcdGNvbnN0IGNoYW5nZXNldHMgPSBuZXcgVGVzdENoYW5nZXNldFNlcnZpY2UoKTtcblx0XHRjb25zdCB7IGhhbmRsZXIsIHNlc3Npb24sIGNvbW1pdHRlZFNlc3Npb25zIH0gPSBzZXR1cChkaXNwb3NhYmxlcywgZ2l0U2VydmljZSwgY29waWxvdEFwaVNlcnZpY2UsIGNoYW5nZXNldHMpO1xuXG5cdFx0bGV0IGVycjogUHJvdG9jb2xFcnJvciB8IHVuZGVmaW5lZDtcblx0XHR0cnkge1xuXHRcdFx0YXdhaXQgaGFuZGxlci5pbnZva2UoeyBjaGFubmVsOiBidWlsZFVuY29tbWl0dGVkQ2hhbmdlc2V0VXJpKHNlc3Npb24udG9TdHJpbmcoKSksIG9wZXJhdGlvbklkOiBBZ2VudEhvc3RDb21taXRPcGVyYXRpb25IYW5kbGVyLk9QRVJBVElPTl9DT01NSVQgfSwgQ2FuY2VsbGF0aW9uVG9rZW4uTm9uZSk7XG5cdFx0fSBjYXRjaCAoZXJyb3IpIHtcblx0XHRcdGVyciA9IGVycm9yIGFzIFByb3RvY29sRXJyb3I7XG5cdFx0fVxuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRjb2RlOiBlcnI/LmNvZGUsXG5cdFx0XHRkYXRhOiBlcnI/LmRhdGEsXG5cdFx0XHRnaXRDYWxsczogZ2l0U2VydmljZS5jYWxscyxcblx0XHRcdGNvbXBsZXRpb25DYWxsczogY29waWxvdEFwaVNlcnZpY2UuY2FsbHMubGVuZ3RoLFxuXHRcdFx0Y2hhbmdlc2V0Q2FsbHM6IGNoYW5nZXNldHMuY2FsbHMsXG5cdFx0XHRjb21taXR0ZWRTZXNzaW9ucyxcblx0XHR9LCB7XG5cdFx0XHRjb2RlOiBBSFBfQVVUSF9SRVFVSVJFRCxcblx0XHRcdGRhdGE6IFtHSVRIVUJfQ09QSUxPVF9QUk9URUNURURfUkVTT1VSQ0VdLFxuXHRcdFx0Z2l0Q2FsbHM6IFsnaGFzVW5jb21taXR0ZWRDaGFuZ2VzJywgJ2NvbXB1dGVTZXNzaW9uRmlsZURpZmZzJ10sXG5cdFx0XHRjb21wbGV0aW9uQ2FsbHM6IDEsXG5cdFx0XHRjaGFuZ2VzZXRDYWxsczogW10sXG5cdFx0XHRjb21taXR0ZWRTZXNzaW9uczogW10sXG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ21hcHMgQ29waWxvdCB0b2tlbiBtaW50IGF1dGggZmFpbHVyZXMgdG8gQUhQX0FVVEhfUkVRVUlSRUQgYmVmb3JlIGNvbW1pdHRpbmcnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgZ2l0U2VydmljZSA9IG5ldyBUZXN0R2l0U2VydmljZSgpO1xuXHRcdGNvbnN0IGNvcGlsb3RBcGlTZXJ2aWNlID0gbmV3IFRlc3RDb3BpbG90QXBpU2VydmljZSgpO1xuXHRcdGNvcGlsb3RBcGlTZXJ2aWNlLmVycm9yID0gbmV3IEVycm9yKCdDb3BpbG90IHNlc3Npb24gdG9rZW4gbWludCBmYWlsZWQ6IDQwMyBGb3JiaWRkZW4nKTtcblx0XHRjb25zdCBjaGFuZ2VzZXRzID0gbmV3IFRlc3RDaGFuZ2VzZXRTZXJ2aWNlKCk7XG5cdFx0Y29uc3QgeyBoYW5kbGVyLCBzZXNzaW9uLCBjb21taXR0ZWRTZXNzaW9ucyB9ID0gc2V0dXAoZGlzcG9zYWJsZXMsIGdpdFNlcnZpY2UsIGNvcGlsb3RBcGlTZXJ2aWNlLCBjaGFuZ2VzZXRzKTtcblxuXHRcdGxldCBlcnI6IFByb3RvY29sRXJyb3IgfCB1bmRlZmluZWQ7XG5cdFx0dHJ5IHtcblx0XHRcdGF3YWl0IGhhbmRsZXIuaW52b2tlKHsgY2hhbm5lbDogYnVpbGRVbmNvbW1pdHRlZENoYW5nZXNldFVyaShzZXNzaW9uLnRvU3RyaW5nKCkpLCBvcGVyYXRpb25JZDogQWdlbnRIb3N0Q29tbWl0T3BlcmF0aW9uSGFuZGxlci5PUEVSQVRJT05fQ09NTUlUIH0sIENhbmNlbGxhdGlvblRva2VuLk5vbmUpO1xuXHRcdH0gY2F0Y2ggKGVycm9yKSB7XG5cdFx0XHRlcnIgPSBlcnJvciBhcyBQcm90b2NvbEVycm9yO1xuXHRcdH1cblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0Y29kZTogZXJyPy5jb2RlLFxuXHRcdFx0ZGF0YTogZXJyPy5kYXRhLFxuXHRcdFx0Z2l0Q2FsbHM6IGdpdFNlcnZpY2UuY2FsbHMsXG5cdFx0XHRjb21wbGV0aW9uQ2FsbHM6IGNvcGlsb3RBcGlTZXJ2aWNlLmNhbGxzLmxlbmd0aCxcblx0XHRcdGNoYW5nZXNldENhbGxzOiBjaGFuZ2VzZXRzLmNhbGxzLFxuXHRcdFx0Y29tbWl0dGVkU2Vzc2lvbnMsXG5cdFx0fSwge1xuXHRcdFx0Y29kZTogQUhQX0FVVEhfUkVRVUlSRUQsXG5cdFx0XHRkYXRhOiBbR0lUSFVCX0NPUElMT1RfUFJPVEVDVEVEX1JFU09VUkNFXSxcblx0XHRcdGdpdENhbGxzOiBbJ2hhc1VuY29tbWl0dGVkQ2hhbmdlcycsICdjb21wdXRlU2Vzc2lvbkZpbGVEaWZmcyddLFxuXHRcdFx0Y29tcGxldGlvbkNhbGxzOiAxLFxuXHRcdFx0Y2hhbmdlc2V0Q2FsbHM6IFtdLFxuXHRcdFx0Y29tbWl0dGVkU2Vzc2lvbnM6IFtdLFxuXHRcdH0pO1xuXHR9KTtcbn0pO1xuIl0sCiAgIm1hcHBpbmdzIjogIkFBS0EsT0FBTyxZQUFZO0FBR25CLFNBQVMsbUJBQW1CLCtCQUErQjtBQUUzRCxTQUFTLFdBQVc7QUFDcEIsU0FBUywrQ0FBK0M7QUFDeEQsU0FBUyxzQkFBc0I7QUFDL0IsU0FBUyxvQ0FBb0M7QUFDN0MsU0FBUyxlQUFlLDJCQUFrRDtBQUUxRSxTQUFTLHVDQUF1QztBQUNoRCxTQUFTLHVDQUF1QztBQUNoRCxTQUFTLDZCQUE2QjtBQUN0QyxTQUFTLHVCQUFrSTtBQUMzSSxTQUFTLHlDQUF5QztBQUVsRCxTQUFTLHlCQUF3QztBQUlqRCxNQUFNLGVBQStDO0FBQUEsRUFBckQ7QUFHQyxTQUFTLFFBQWtCLENBQUM7QUFDNUIsdUJBQWM7QUFDZCxpQkFBaUQsQ0FBQztBQUFBLE1BQ2pELE9BQU8sRUFBRSxLQUFLLHdCQUF3QixTQUFTLEVBQUUsS0FBSyx1QkFBdUIsRUFBRTtBQUFBLE1BQy9FLE1BQU0sRUFBRSxPQUFPLEdBQUcsU0FB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
