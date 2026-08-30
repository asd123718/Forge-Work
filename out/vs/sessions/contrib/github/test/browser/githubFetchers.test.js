import assert from "assert";
import { CancellationToken } from "../../../../../base/common/cancellation.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../../base/test/common/utils.js";
import { DisposableStore } from "../../../../../base/common/lifecycle.js";
import { GitHubPRFetcher, computeMergeability } from "../../browser/fetchers/githubPRFetcher.js";
import { GitHubPullRequestContextFetcher } from "../../browser/fetchers/githubPullRequestContextFetcher.js";
import { GitHubPullRequestsFetcher } from "../../browser/fetchers/githubPullRequestsFetcher.js";
import { GitHubPRCIFetcher, computeOverallCIStatus } from "../../browser/fetchers/githubPRCIFetcher.js";
import { GitHubRecentUserWorkFetcher } from "../../browser/fetchers/githubRecentUserWorkFetcher.js";
import { GitHubRepositoryFetcher } from "../../browser/fetchers/githubRepositoryFetcher.js";
import { GitHubApiError } from "../../browser/githubApiClient.js";
import { GitHubCheckConclusion, GitHubCheckStatus, GitHubCIOverallStatus, GitHubPullRequestState, MergeBlockerKind } from "../../common/types.js";
class MockApiClient {
  constructor() {
    this._responses = [];
    this.requestCalls = [];
    this.graphqlCalls = [];
  }
  setNextResponse(data) {
    this._nextResponse = data;
    this._responses = [];
    this._nextError = void 0;
  }
  setResponses(...data) {
    this._responses = [...data];
    this._nextResponse = void 0;
    this._nextError = void 0;
  }
  setNextError(error) {
    this._nextError = error;
    this._nextResponse = void 0;
  }
  async request(_method, _path, _callSite, _options) {
    this.requestCalls.push({ method: _method, path: _path, body: _options?.data });
    if (this._nextError) {
      throw this._nextError;
    }
    return { data: this._responses.length > 0 ? this._responses.shift() : this._nextResponse, statusCode: 200 };
  }
  async graphql(query, _callSite, variables, options) {
    this.graphqlCalls.push({ query, variables, options });
    if (this._nextError) {
      throw this._nextError;
    }
    return this._nextResponse;
  }
}
suite("GitHubRecentUserWorkFetcher", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  test("queries assigned issue summaries independently", async () => {
    const mockApi = new MockApiClient();
    mockApi.setNextResponse({
      search: {
        nodes: [
          null,
          { __typename: "Issue", number: 1, title: "First issue", url: "https://github.com/o/r/issues/1", updatedAt: "2026-08-07T10:00:00Z" },
          { __typename: "Issue", number: 2, title: "Second issue", url: "https://github.com/o/r/issues/2", updatedAt: "2026-08-07T11:00:00Z" }
        ]
      }
    });
    const fetcher = new GitHubRecentUserWorkFetcher(mockApi);
    assert.deepStrictEqual({
      issues: await fetcher.getRecentAssignedIssues("o", "r", CancellationToken.None),
      variables: mockApi.graphqlCalls[0].variables,
      createAuthenticationSession: mockApi.graphqlCalls[0].options?.createAuthenticationSession
    }, {
      issues: [
        { number: 1, title: "First issue", url: "https://github.com/o/r/issues/1", updatedAt: "2026-08-07T10:00:00Z" },
        { number: 2, title: "Second issue", url: "https://github.com/o/r/issues/2", updatedAt: "2026-08-07T11:00:00Z" }
      ],
      variables: { query: "repo:o/r is:issue is:open assignee:@me sort:updated-desc" },
      createAuthenticationSession: false
    });
  });
  test("queries pull request summaries without review threads", async () => {
    const mockApi = new MockApiClient();
    mockApi.setNextResponse({
      search: {
        nodes: [{
          __typename: "PullRequest",
          number: 3,
          title: "Fix CI",
          url: "https://github.com/o/r/pull/3",
          updatedAt: "2026-08-07T12:00:00Z",
          mergeable: "CONFLICTING",
          commits: { nodes: [{ commit: { committedDate: "2026-08-07T09:00:00Z", statusCheckRollup: { state: "FAILURE" } } }] }
        }]
      }
    });
    const fetcher = new GitHubRecentUserWorkFetcher(mockApi);
    assert.deepStrictEqual({
      pullRequests: await fetcher.getRecentAuthoredPullRequests("o", "r", CancellationToken.None),
      variables: mockApi.graphqlCalls[0].variables
    }, {
      pullRequests: [{
        number: 3,
        title: "Fix CI",
        url: "https://github.com/o/r/pull/3",
        updatedAt: "2026-08-07T12:00:00Z",
        hasMergeConflicts: true,
        statusCheckRollupState: "FAILURE",
        latestCommitAt: "2026-08-07T09:00:00Z"
      }],
      variables: { query: "repo:o/r is:pr is:open author:@me sort:updated-desc" }
    });
  });
  test("queries review threads for one pull request independently", async () => {
    const mockApi = new MockApiClient();
    mockApi.setNextResponse({
      repository: {
        pullRequest: {
          reviewThreads: {
            nodes: [{
              isResolved: false,
              comments: { nodes: [{ createdAt: "2026-08-07T10:00:00Z" }] }
            }]
          }
        }
      }
    });
    const fetcher = new GitHubRecentUserWorkFetcher(mockApi);
    assert.deepStrictEqual({
      reviewThreads: await fetcher.getPullRequestReviewThreads("o", "r", 3, CancellationToken.None),
      variables: mockApi.graphqlCalls[0].variables
    }, {
      reviewThreads: [{ isResolved: false, latestCommentAt: "2026-08-07T10:00:00Z" }],
      variables: { owner: "o", repo: "r", pullRequestNumber: 3 }
    });
  });
  test("checks pull request linkage for issue summaries in one request", async () => {
    const mockApi = new MockApiClient();
    mockApi.setNextResponse({
      repository: {
        issue0: { closedByPullRequestsReferences: { totalCount: 1 } },
        issue1: { closedByPullRequestsReferences: { totalCount: 0 } }
      }
    });
    const fetcher = new GitHubRecentUserWorkFetcher(mockApi);
    assert.deepStrictEqual({
      linkedIssues: [...await fetcher.getIssuesWithLinkedPullRequests("o", "r", [1, 2], CancellationToken.None)],
      variables: mockApi.graphqlCalls[0].variables
    }, {
      linkedIssues: [1],
      variables: { owner: "o", repo: "r", issue0: 1, issue1: 2 }
    });
  });
});
suite("GitHubRepositoryFetcher", () => {
  const store = new DisposableStore();
  let mockApi;
  let fetcher;
  setup(() => {
    mockApi = new MockApiClient();
    fetcher = new GitHubRepositoryFetcher(mockApi);
  });
  teardown(() => store.clear());
  ensureNoDisposablesAreLeakedInTestSuite();
  test("getRepository returns mapped data", async () => {
    mockApi.setNextResponse({
      name: "vscode",
      full_name: "microsoft/vscode",
      owner: { login: "microsoft" },
      default_branch: "main",
      private: false,
      description: "Visual Studio Code"
    });
    const repo = await fetcher.getRepository("microsoft", "vscode");
    assert.deepStrictEqual(repo.data, {
      owner: "microsoft",
      name: "vscode",
      fullName: "microsoft/vscode",
      defaultBranch: "main",
      isPrivate: false,
      description: "Visual Studio Code"
    });
    assert.strictEqual(mockApi.requestCalls[0].path, "/repos/microsoft/vscode");
  });
  test("getRepository handles null description", async () => {
    mockApi.setNextResponse({
      name: "test",
      full_name: "owner/test",
      owner: { login: "owner" },
      default_branch: "main",
      private: true,
      description: null
    });
    const repo = await fetcher.getRepository("owner", "test");
    assert.strictEqual(repo.data?.description, "");
  });
  test("getRepository propagates API errors", async () => {
    mockApi.setNextError(new GitHubApiError("Not found", 404, void 0));
    await assert.rejects(
      () => fetcher.getRepository("owner", "nonexistent"),
      (err) => err instanceof GitHubApiError && err.statusCode === 404
    );
  });
});
suite("GitHubPullRequestContextFetcher", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  test("returns details, patch, and issue/review comments as one snapshot", async () => {
    const mockApi = new MockApiClient();
    mockApi.setResponses(
      {
        number: 42,
        html_url: "https://github.com/owner/repo/pull/42",
        title: "Improve sessions",
        body: "Description",
        user: { login: "author" },
        draft: false,
        base: { ref: "main" },
        head: { ref: "feature" },
        updated_at: "2026-01-01T00:00:00Z"
      },
      [{ filename: "src/a.ts", status: "modified", additions: 2, deletions: 1, patch: "@@ -1 +1 @@" }],
      [{ body: "General comment", user: { login: "commenter" }, created_at: "2026-01-02T00:00:00Z", updated_at: "2026-01-02T00:00:00Z" }],
      [{ body: "Inline comment", user: { login: "reviewer" }, created_at: "2026-01-03T00:00:00Z", updated_at: "2026-01-03T00:00:00Z", path: "src/a.ts", line: 7, original_line: null }]
    );
    const fetcher = new GitHubPullRequestContextFetcher(mockApi);
    const context = await fetcher.getPullRequestContext("owner", "repo", 42);
    assert.deepStrictEqual({
      context,
      paths: mockApi.requestCalls.map((call) => call.path)
    }, {
      context: {
        owner: "owner",
        repo: "repo",
        number: 42,
        url: "https://github.com/owner/repo/pull/42",
        title: "Improve sessions",
        description: "Description",
        author: "author",
        isDraft: false,
        baseRef: "main",
        branchName: "feature",
        headRef: "feature",
        updatedAt: "2026-01-01T00:00:00Z",
        patch: "diff --git a/src/a.ts b/src/a.ts\n@@ -1 +1 @@",
        comments: [{
          kind: "issue",
          author: "commenter",
          body: "General comment",
          createdAt: "2026-01-02T00:00:00Z",
          updatedAt: "2026-01-02T00:00:00Z"
        }, {
          kind: "review",
          author: "reviewer",
          body: "Inline comment",
          createdAt: "2026-01-03T00:00:00Z",
          updatedAt: "2026-01-03T00:00:00Z",
          path: "src/a.ts",
          line: 7
        }]
      },
      paths: [
        "/repos/owner/repo/pulls/42",
        "/repos/owner/repo/pulls/42/files?per_page=100&page=1",
        "/repos/owner/repo/issues/42/comments?per_page=100&page=1",
        "/repos/owner/repo/pulls/42/comments?per_page=100&page=1"
      ]
    });
  });
});
suite("GitHubPRFetcher", () => {
  const store = new DisposableStore();
  let mockApi;
  let fetcher;
  setup(() => {
    mockApi = new MockApiClient();
    fetcher = new GitHubPRFetcher(mockApi);
  });
  teardown(() => store.clear());
  ensureNoDisposablesAreLeakedInTestSuite();
  test("getPullRequest maps open PR", async () => {
    mockApi.setNextResponse(makePRResponse({ state: "open", merged: false, draft: false }));
    const pr = await fetcher.getPullRequest("owner", "repo", 1);
    assert.strictEqual(pr.data?.state, GitHubPullRequestState.Open);
    assert.strictEqual(pr.data?.isDraft, false);
    assert.strictEqual(pr.data?.number, 1);
    assert.strictEqual(pr.data?.title, "Test PR");
  });
  test("getPullRequest maps merged PR", async () => {
    mockApi.setNextResponse(makePRResponse({ state: "closed", merged: true, draft: false }));
    const pr = await fetcher.getPullRequest("owner", "repo", 1);
    assert.strictEqual(pr.data?.state, GitHubPullRequestState.Merged);
    assert.ok(pr.data?.mergedAt);
  });
  test("getPullRequest maps closed PR", async () => {
    mockApi.setNextResponse(makePRResponse({ state: "closed", merged: false, draft: false }));
    const pr = await fetcher.getPullRequest("owner", "repo", 1);
    assert.strictEqual(pr.data?.state, GitHubPullRequestState.Closed);
  });
  test("getReviewThreads returns GraphQL thread metadata", async () => {
    mockApi.setNextResponse(makeGraphQLReviewThreadsResponse([
      makeGraphQLReviewThread({
        id: "thread-a",
        path: "src/a.ts",
        line: 10,
        isResolved: false,
        comments: [
          makeGraphQLReviewComment({ databaseId: 100, path: "src/a.ts", line: 10 }),
          makeGraphQLReviewComment({ databaseId: 101, path: "src/a.ts", line: 10, replyToDatabaseId: 100 })
        ]
      }),
      makeGraphQLReviewThread({
        id: "thread-b",
        path: "src/b.ts",
        line: 20,
        isResolved: true,
        comments: [makeGraphQLReviewComment({ databaseId: 200, path: "src/b.ts", line: 20 })]
      })
    ]));
    const threads = await fetcher.getReviewThreads("owner", "repo", 1);
    assert.strictEqual(threads.length, 2);
    const thread1 = threads.find((t) => t.id === "thread-a");
    assert.ok(thread1);
    assert.strictEqual(thread1.comments.length, 2);
    assert.strictEqual(thread1.path, "src/a.ts");
    assert.strictEqual(thread1.line, 10);
    assert.strictEqual(thread1.comments[0].threadId, "thread-a");
    const thread2 = threads.find((t) => t.id === "thread-b");
    assert.ok(thread2);
    assert.strictEqual(thread2.comments.length, 1);
    assert.strictEqual(thread2.path, "src/b.ts");
    assert.strictEqual(thread2.isResolved, true);
  });
  test("resolveThread uses GraphQL mutation", async () => {
    mockApi.setNextResponse({
      resolveReviewThread: {
        thread: {
          isResolved: true
        }
      }
    });
    await fetcher.resolveThread("owner", "repo", "thread-a");
    assert.strictEqual(mockApi.graphqlCalls.length, 1);
    assert.deepStrictEqual(mockApi.graphqlCalls[0].variables, { threadId: "thread-a" });
  });
  test("getReviews maps API response", async () => {
    mockApi.setNextResponse([
      { id: 1, user: { login: "reviewer", avatar_url: "" }, state: "APPROVED", submitted_at: "2024-01-01T00:00:00Z" },
      { id: 2, user: { login: "other", avatar_url: "" }, state: "CHANGES_REQUESTED", submitted_at: "2024-01-02T00:00:00Z" }
    ]);
    const reviews = await fetcher.getReviews("owner", "repo", 1);
    assert.deepStrictEqual(reviews.data, [
      { id: 1, author: { login: "reviewer", avatarUrl: "" }, state: "APPROVED", submittedAt: "2024-01-01T00:00:00Z" },
      { id: 2, author: { login: "other", avatarUrl: "" }, state: "CHANGES_REQUESTED", submittedAt: "2024-01-02T00:00:00Z" }
    ]);
    assert.strictEqual(mockApi.requestCalls.length, 1);
    assert.strictEqual(mockApi.requestCalls[0].path, "/repos/owner/repo/pulls/1/reviews");
  });
  test("computeMergeability detects draft blocker", () => {
    const pr = makePR({ state: GitHubPullRequestState.Open, isDraft: true, mergeable: true, mergeableState: "clean" });
    const result = computeMergeability(pr, []);
    assert.strictEqual(result.canMerge, false);
    assert.ok(result.blockers.some((b) => b.kind === MergeBlockerKind.Draft));
  });
  test("computeMergeability detects conflicts blocker", () => {
    const pr = makePR({ state: GitHubPullRequestState.Open, isDraft: false, mergeable: false, mergeableState: "dirty" });
    const result = computeMergeability(pr, []);
    assert.strictEqual(result.canMerge, false);
    assert.ok(result.blockers.some((b) => b.kind === MergeBlockerKind.Conflicts));
  });
  test("computeMergeability detects changes requested blocker", () => {
    const pr = makePR({ state: GitHubPullRequestState.Open, isDraft: false, mergeable: true, mergeableState: "clean" });
    const reviews = [
      { id: 1, author: { login: "reviewer", avatarUrl: "" }, state: "CHANGES_REQUESTED", submittedAt: "2024-01-01T00:00:00Z" }
    ];
    const result = computeMergeability(pr, reviews);
    assert.strictEqual(result.canMerge, false);
    assert.ok(result.blockers.some((b) => b.kind === MergeBlockerKind.ChangesRequested));
  });
  test("computeMergeability returns canMerge for clean open PR", () => {
    const pr = makePR({ state: GitHubPullRequestState.Open, isDraft: false, mergeable: true, mergeableState: "clean" });
    const result = computeMergeability(pr, []);
    assert.strictEqual(result.canMerge, true);
    assert.strictEqual(result.blockers.length, 0);
  });
});
suite("GitHubPullRequestsFetcher", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  test("maps a lightweight page with pagination and diff stats", async () => {
    const mockApi = new MockApiClient();
    mockApi.setNextResponse({
      repository: {
        pullRequests: {
          nodes: [{
            number: 7,
            title: "Improve sessions",
            author: { login: "author", avatarUrl: "avatar" },
            headRefName: "feature",
            isDraft: true,
            updatedAt: "2026-07-30T12:00:00Z",
            additions: 12,
            deletions: 3
          }],
          pageInfo: { endCursor: "cursor-1", hasNextPage: true }
        }
      }
    });
    const fetcher = new GitHubPullRequestsFetcher(mockApi);
    const page = await fetcher.getPullRequests("microsoft", "vscode");
    assert.deepStrictEqual(page, {
      pullRequests: [{
        number: 7,
        title: "Improve sessions",
        author: { login: "author", avatarUrl: "avatar" },
        headRef: "feature",
        checkoutRef: "refs/pull/7/head",
        isDraft: true,
        updatedAt: "2026-07-30T12:00:00Z",
        additions: 12,
        deletions: 3,
        reviewRequestedFromViewer: false,
        assignedToViewer: false
      }],
      cursor: "cursor-1",
      hasNextPage: true
    });
    assert.deepStrictEqual(mockApi.graphqlCalls[0].variables, { owner: "microsoft", repo: "vscode", cursor: null });
  });
  test("loads viewer review and assignment membership with independent small queries", async () => {
    const mockApi = new MockApiClient();
    mockApi.setNextResponse({
      search: { nodes: [makePullRequestSearchNode(7), null, makePullRequestSearchNode(9)] }
    });
    const fetcher = new GitHubPullRequestsFetcher(mockApi);
    const reviewRequested = await fetcher.getPullRequestsWaitingForReview("microsoft", "vscode");
    mockApi.setNextResponse({
      search: { nodes: [makePullRequestSearchNode(8), makePullRequestSearchNode(9)] }
    });
    const assigned = await fetcher.getPullRequestsAssignedToViewer("microsoft", "vscode");
    assert.deepStrictEqual({
      reviewRequested: reviewRequested.map((pullRequest) => ({ number: pullRequest.number, reviewRequestedFromViewer: pullRequest.reviewRequestedFromViewer, assignedToViewer: pullRequest.assignedToViewer })),
      assigned: assigned.map((pullRequest) => ({ number: pullRequest.number, reviewRequestedFromViewer: pullRequest.reviewRequestedFromViewer, assignedToViewer: pullRequest.assignedToViewer })),
      variables: mockApi.graphqlCalls.map((call) => call.variables),
      usesNestedFields: mockApi.graphqlCalls.some((call) => call.query.includes("reviewRequests(") || call.query.includes("assignees("))
    }, {
      reviewRequested: [
        { number: 7, reviewRequestedFromViewer: true, assignedToViewer: false },
        { number: 9, reviewRequestedFromViewer: true, assignedToViewer: false }
      ],
      assigned: [
        { number: 8, reviewRequestedFromViewer: false, assignedToViewer: true },
        { number: 9, reviewRequestedFromViewer: false, assignedToViewer: true }
      ],
      variables: [
        { query: "repo:microsoft/vscode is:pr is:open review-requested:@me sort:updated-desc" },
        { query: "repo:microsoft/vscode is:pr is:open assignee:@me sort:updated-desc" }
      ],
      usesNestedFields: false
    });
  });
});
suite("GitHubPRCIFetcher", () => {
  const store = new DisposableStore();
  let mockApi;
  let fetcher;
  setup(() => {
    mockApi = new MockApiClient();
    fetcher = new GitHubPRCIFetcher(mockApi);
  });
  teardown(() => store.clear());
  ensureNoDisposablesAreLeakedInTestSuite();
  test("getCheckRuns maps check runs", async () => {
    mockApi.setNextResponse({
      total_count: 2,
      check_runs: [
        { id: 1, name: "build", status: "completed", conclusion: "success", started_at: "2024-01-01T00:00:00Z", completed_at: "2024-01-01T00:10:00Z", details_url: "https://example.com/1" },
        { id: 2, name: "test", status: "in_progress", conclusion: null, started_at: "2024-01-01T00:00:00Z", completed_at: null, details_url: null }
      ]
    });
    const checks = await fetcher.getCheckRuns("owner", "repo", "abc123");
    assert.strictEqual(checks.data?.length, 2);
    assert.deepStrictEqual(checks.data?.[0], {
      id: 1,
      name: "build",
      status: GitHubCheckStatus.Completed,
      conclusion: GitHubCheckConclusion.Success,
      startedAt: "2024-01-01T00:00:00Z",
      completedAt: "2024-01-01T00:10:00Z",
      detailsUrl: "https://example.com/1"
    });
    assert.strictEqual(checks.data?.[1].conclusion, void 0);
  });
  test("getCheckRunAnnotations returns formatted annotations", async () => {
    mockApi.setNextResponse([
      { path: "src/a.ts", start_line: 10, end_line: 10, annotation_level: "failure", message: "type error", title: "TS2345" },
      { path: "src/b.ts", start_line: 5, end_line: 8, annotation_level: "warning", message: "unused var", title: null }
    ]);
    const result = await fetcher.getCheckRunAnnotations("owner", "repo", 1);
    assert.ok(result.includes("[failure] src/a.ts:10"));
    assert.ok(result.includes("(TS2345)"));
    assert.ok(result.includes("[warning] src/b.ts:5-8"));
  });
  test("rerunFailedJobs sends POST to correct endpoint", async () => {
    mockApi.setNextResponse(void 0);
    await fetcher.rerunFailedJobs("myOwner", "myRepo", 12345);
    assert.strictEqual(mockApi.requestCalls.length, 1);
    assert.deepStrictEqual(mockApi.requestCalls[0], {
      method: "POST",
      path: "/repos/myOwner/myRepo/actions/runs/12345/rerun-failed-jobs",
      body: void 0
    });
  });
});
suite("computeOverallCIStatus", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  test("returns neutral for empty checks", () => {
    assert.strictEqual(computeOverallCIStatus([]), GitHubCIOverallStatus.Neutral);
  });
  test("returns success when all completed successfully", () => {
    const checks = [
      makeCheck({ status: GitHubCheckStatus.Completed, conclusion: GitHubCheckConclusion.Success }),
      makeCheck({ status: GitHubCheckStatus.Completed, conclusion: GitHubCheckConclusion.Neutral })
    ];
    assert.strictEqual(computeOverallCIStatus(checks), GitHubCIOverallStatus.Success);
  });
  test("returns failure when any check failed", () => {
    const checks = [
      makeCheck({ status: GitHubCheckStatus.Completed, conclusion: GitHubCheckConclusion.Success }),
      makeCheck({ status: GitHubCheckStatus.Completed, conclusion: GitHubCheckConclusion.Failure })
    ];
    assert.strictEqual(computeOverallCIStatus(checks), GitHubCIOverallStatus.Failure);
  });
  test("returns pending when any check is in progress", () => {
    const checks = [
      makeCheck({ status: GitHubCheckStatus.Completed, conclusion: GitHubCheckConclusion.Success }),
      makeCheck({ status: GitHubCheckStatus.InProgress, conclusion: void 0 })
    ];
    assert.strictEqual(computeOverallCIStatus(checks), GitHubCIOverallStatus.Pending);
  });
  test("failure takes precedence over pending", () => {
    const checks = [
      makeCheck({ status: GitHubCheckStatus.Completed, conclusion: GitHubCheckConclusion.Failure }),
      makeCheck({ status: GitHubCheckStatus.InProgress, conclusion: void 0 })
    ];
    assert.strictEqual(computeOverallCIStatus(checks), GitHubCIOverallStatus.Failure);
  });
});
function makePR(overrides) {
  return {
    number: 1,
    title: "Test PR",
    body: "Test body",
    state: overrides.state,
    author: { login: "author", avatarUrl: "" },
    headRef: "feature",
    headSha: "abc123",
    baseRef: "main",
    isDraft: overrides.isDraft,
    createdAt: "2024-01-01T00:00:00Z",
    updatedAt: "2024-01-02T00:00:00Z",
    mergedAt: void 0,
    mergeable: overrides.mergeable,
    mergeableState: overrides.mergeableState
  };
}
function makePullRequestSearchNode(number) {
  return {
    number,
    title: `Pull request ${number}`,
    author: { login: "author", avatarUrl: "" },
    headRefName: `feature-${number}`,
    isDraft: false,
    updatedAt: "2026-07-30T12:00:00Z",
    additions: number,
    deletions: 1
  };
}
function makePRResponse(overrides) {
  return {
    number: 1,
    title: "Test PR",
    body: "Test body",
    state: overrides.state,
    draft: overrides.draft,
    user: { login: "author", avatar_url: "https://example.com/avatar" },
    head: { ref: "feature-branch" },
    base: { ref: "main" },
    created_at: "2024-01-01T00:00:00Z",
    updated_at: "2024-01-02T00:00:00Z",
    merged_at: overrides.merged ? "2024-01-02T00:00:00Z" : null,
    mergeable: overrides.mergeable ?? true,
    mergeable_state: overrides.mergeable_state ?? "clean",
    merged: overrides.merged
  };
}
function makeGraphQLReviewThreadsResponse(threads) {
  return {
    repository: {
      pullRequest: {
        reviewThreads: {
          nodes: threads
        }
      }
    }
  };
}
function makeGraphQLReviewThread(overrides = {}) {
  return {
    id: overrides.id ?? "thread-1",
    isResolved: overrides.isResolved ?? false,
    path: overrides.path ?? "src/a.ts",
    line: overrides.line ?? 10,
    comments: {
      nodes: overrides.comments ?? [makeGraphQLReviewComment()]
    }
  };
}
function makeGraphQLReviewComment(overrides = {}) {
  return {
    databaseId: overrides.databaseId ?? 100,
    body: overrides.body ?? "Test comment",
    createdAt: "2024-01-01T00:00:00Z",
    updatedAt: "2024-01-01T00:00:00Z",
    path: overrides.path ?? "src/a.ts",
    line: overrides.line ?? 10,
    originalLine: overrides.line ?? 10,
    replyTo: overrides.replyToDatabaseId !== void 0 ? { databaseId: overrides.replyToDatabaseId } : null,
    author: {
      login: "reviewer",
      avatarUrl: "https://example.com/avatar"
    }
  };
}
function makeCheck(overrides) {
  return {
    id: 1,
    name: "test-check",
    status: overrides.status,
    conclusion: overrides.conclusion,
    startedAt: void 0,
    completedAt: void 0,
    detailsUrl: void 0
  };
}
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxzZXNzaW9uc1xcY29udHJpYlxcZ2l0aHViXFx0ZXN0XFxicm93c2VyXFxnaXRodWJGZXRjaGVycy50ZXN0LnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IGFzc2VydCBmcm9tICdhc3NlcnQnO1xuaW1wb3J0IHsgQ2FuY2VsbGF0aW9uVG9rZW4gfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9jYW5jZWxsYXRpb24uanMnO1xuaW1wb3J0IHsgZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS90ZXN0L2NvbW1vbi91dGlscy5qcyc7XG5pbXBvcnQgeyBEaXNwb3NhYmxlU3RvcmUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgR2l0SHViUFJGZXRjaGVyLCBjb21wdXRlTWVyZ2VhYmlsaXR5IH0gZnJvbSAnLi4vLi4vYnJvd3Nlci9mZXRjaGVycy9naXRodWJQUkZldGNoZXIuanMnO1xuaW1wb3J0IHsgR2l0SHViUHVsbFJlcXVlc3RDb250ZXh0RmV0Y2hlciB9IGZyb20gJy4uLy4uL2Jyb3dzZXIvZmV0Y2hlcnMvZ2l0aHViUHVsbFJlcXVlc3RDb250ZXh0RmV0Y2hlci5qcyc7XG5pbXBvcnQgeyBHaXRIdWJQdWxsUmVxdWVzdHNGZXRjaGVyIH0gZnJvbSAnLi4vLi4vYnJvd3Nlci9mZXRjaGVycy9naXRodWJQdWxsUmVxdWVzdHNGZXRjaGVyLmpzJztcbmltcG9ydCB7IEdpdEh1YlBSQ0lGZXRjaGVyLCBjb21wdXRlT3ZlcmFsbENJU3RhdHVzIH0gZnJvbSAnLi4vLi4vYnJvd3Nlci9mZXRjaGVycy9naXRodWJQUkNJRmV0Y2hlci5qcyc7XG5pbXBvcnQgeyBHaXRIdWJSZWNlbnRVc2VyV29ya0ZldGNoZXIgfSBmcm9tICcuLi8uLi9icm93c2VyL2ZldGNoZXJzL2dpdGh1YlJlY2VudFVzZXJXb3JrRmV0Y2hlci5qcyc7XG5pbXBvcnQgeyBHaXRIdWJSZXBvc2l0b3J5RmV0Y2hlciB9IGZyb20gJy4uLy4uL2Jyb3dzZXIvZmV0Y2hlcnMvZ2l0aHViUmVwb3NpdG9yeUZldGNoZXIuanMnO1xuaW1wb3J0IHsgR2l0SHViQXBpQ2xpZW50LCBHaXRIdWJBcGlFcnJvciwgSUdpdEh1YkFwaVJlcXVlc3RPcHRpb25zIH0gZnJvbSAnLi4vLi4vYnJvd3Nlci9naXRodWJBcGlDbGllbnQuanMnO1xuaW1wb3J0IHsgR2l0SHViQ2hlY2tDb25jbHVzaW9uLCBHaXRIdWJDaGVja1N0YXR1cywgR2l0SHViQ0lPdmVyYWxsU3RhdHVzLCBHaXRIdWJQdWxsUmVxdWVzdFN0YXRlLCBJR2l0SHViUHVsbFJlcXVlc3RSZXZpZXcsIElHaXRIdWJQdWxsUmVxdWVzdCwgTWVyZ2VCbG9ja2VyS2luZCB9IGZyb20gJy4uLy4uL2NvbW1vbi90eXBlcy5qcyc7XG5cbmNsYXNzIE1vY2tBcGlDbGllbnQge1xuXG5cdHByaXZhdGUgX25leHRSZXNwb25zZTogdW5rbm93bjtcblx0cHJpdmF0ZSBfcmVzcG9uc2VzOiB1bmtub3duW10gPSBbXTtcblx0cHJpdmF0ZSBfbmV4dEVycm9yOiBFcnJvciB8IHVuZGVmaW5lZDtcblx0cmVhZG9ubHkgcmVxdWVzdENhbGxzOiB7IG1ldGhvZDogc3RyaW5nOyBwYXRoOiBzdHJpbmc7IGJvZHk/OiB1bmtub3duIH1bXSA9IFtdO1xuXHRyZWFkb25seSBncmFwaHFsQ2FsbHM6IHsgcXVlcnk6IHN0cmluZzsgdmFyaWFibGVzPzogUmVjb3JkPHN0cmluZywgdW5rbm93bj47IG9wdGlvbnM/OiBQaWNrPElHaXRIdWJBcGlSZXF1ZXN0T3B0aW9ucywgJ3Rva2VuJyB8ICdjcmVhdGVBdXRoZW50aWNhdGlvblNlc3Npb24nPiB9W10gPSBbXTtcblxuXHRzZXROZXh0UmVzcG9uc2UoZGF0YTogdW5rbm93bik6IHZvaWQge1xuXHRcdHRoaXMuX25leHRSZXNwb25zZSA9IGRhdGE7XG5cdFx0dGhpcy5fcmVzcG9uc2VzID0gW107XG5cdFx0dGhpcy5fbmV4dEVycm9yID0gdW5kZWZpbmVkO1xuXHR9XG5cblx0c2V0UmVzcG9uc2VzKC4uLmRhdGE6IHVua25vd25bXSk6IHZvaWQge1xuXHRcdHRoaXMuX3Jlc3BvbnNlcyA9IFsuLi5kYXRhXTtcblx0XHR0aGlzLl9uZXh0UmVzcG9uc2UgPSB1bmRlZmluZWQ7XG5cdFx0dGhpcy5fbmV4dEVycm9yID0gdW5kZWZpbmVkO1xuXHR9XG5cblx0c2V0TmV4dEVycm9yKGVycm9yOiBFcnJvcik6IHZvaWQge1xuXHRcdHRoaXMuX25leHRFcnJvciA9IGVycm9yO1xuXHRcdHRoaXMuX25leHRSZXNwb25zZSA9IHVuZGVmaW5lZDtcblx0fVxuXG5cdGFzeW5jIHJlcXVlc3Q8VD4oX21ldGhvZDogc3RyaW5nLCBfcGF0aDogc3RyaW5nLCBfY2FsbFNpdGU6IHN0cmluZywgX29wdGlvbnM/OiBJR2l0SHViQXBpUmVxdWVzdE9wdGlvbnMpOiBQcm9taXNlPHsgZGF0YTogVCB8IHVuZGVmaW5lZDsgc3RhdHVzQ29kZTogbnVtYmVyOyBldGFnPzogc3RyaW5nIH0+IHtcblx0XHR0aGlzLnJlcXVlc3RDYWxscy5wdXNoKHsgbWV0aG9kOiBfbWV0aG9kLCBwYXRoOiBfcGF0aCwgYm9keTogX29wdGlvbnM/LmRhdGEgfSk7XG5cdFx0aWYgKHRoaXMuX25leHRFcnJvcikge1xuXHRcdFx0dGhyb3cgdGhpcy5fbmV4dEVycm9yO1xuXHRcdH1cblx0XHRyZXR1cm4geyBkYXRhOiAodGhpcy5fcmVzcG9uc2VzLmxlbmd0aCA+IDAgPyB0aGlzLl9yZXNwb25zZXMuc2hpZnQoKSA6IHRoaXMuX25leHRSZXNwb25zZSkgYXMgVCwgc3RhdHVzQ29kZTogMjAwIH07XG5cdH1cblxuXHRhc3luYyBncmFwaHFsPFQ+KHF1ZXJ5OiBzdHJpbmcsIF9jYWxsU2l0ZTogc3RyaW5nLCB2YXJpYWJsZXM/OiBSZWNvcmQ8c3RyaW5nLCB1bmtub3duPiwgb3B0aW9ucz86IFBpY2s8SUdpdEh1YkFwaVJlcXVlc3RPcHRpb25zLCAndG9rZW4nIHwgJ2NyZWF0ZUF1dGhlbnRpY2F0aW9uU2Vzc2lvbic+KTogUHJvbWlzZTxUPiB7XG5cdFx0dGhpcy5ncmFwaHFsQ2FsbHMucHVzaCh7IHF1ZXJ5LCB2YXJpYWJsZXMsIG9wdGlvbnMgfSk7XG5cdFx0aWYgKHRoaXMuX25leHRFcnJvcikge1xuXHRcdFx0dGhyb3cgdGhpcy5fbmV4dEVycm9yO1xuXHRcdH1cblx0XHRyZXR1cm4gdGhpcy5fbmV4dFJlc3BvbnNlIGFzIFQ7XG5cdH1cbn1cblxuc3VpdGUoJ0dpdEh1YlJlY2VudFVzZXJXb3JrRmV0Y2hlcicsICgpID0+IHtcblx0ZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlKCk7XG5cblx0dGVzdCgncXVlcmllcyBhc3NpZ25lZCBpc3N1ZSBzdW1tYXJpZXMgaW5kZXBlbmRlbnRseScsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBtb2NrQXBpID0gbmV3IE1vY2tBcGlDbGllbnQoKTtcblx0XHRtb2NrQXBpLnNldE5leHRSZXNwb25zZSh7XG5cdFx0XHRzZWFyY2g6IHtcblx0XHRcdFx0bm9kZXM6IFtcblx0XHRcdFx0XHRudWxsLFxuXHRcdFx0XHRcdHsgX190eXBlbmFtZTogJ0lzc3VlJywgbnVtYmVyOiAxLCB0aXRsZTogJ0ZpcnN0IGlzc3VlJywgdXJsOiAnaHR0cHM6Ly9naXRodWIuY29tL28vci9pc3N1ZXMvMScsIHVwZGF0ZWRBdDogJzIwMjYtMDgtMDdUMTA6MDA6MDBaJyB9LFxuXHRcdFx0XHRcdHsgX190eXBlbmFtZTogJ0lzc3VlJywgbnVtYmVyOiAyLCB0aXRsZTogJ1NlY29uZCBpc3N1ZScsIHVybDogJ2h0dHBzOi8vZ2l0aHViLmNvbS9vL3IvaXNzdWVzLzInLCB1cGRhdGVkQXQ6ICcyMDI2LTA4LTA3VDExOjAwOjAwWicgfSxcblx0XHRcdFx0XSxcblx0XHRcdH1cblx0XHR9KTtcblx0XHRjb25zdCBmZXRjaGVyID0gbmV3IEdpdEh1YlJlY2VudFVzZXJXb3JrRmV0Y2hlcihtb2NrQXBpIGFzIHVua25vd24gYXMgR2l0SHViQXBpQ2xpZW50KTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0aXNzdWVzOiBhd2FpdCBmZXRjaGVyLmdldFJlY2VudEFzc2lnbmVkSXNzdWVzKCdvJywgJ3InLCBDYW5jZWxsYXRpb25Ub2tlbi5Ob25lKSxcblx0XHRcdHZhcmlhYmxlczogbW9ja0FwaS5ncmFwaHFsQ2FsbHNbMF0udmFyaWFibGVzLFxuXHRcdFx0Y3JlYXRlQXV0aGVudGljYXRpb25TZXNzaW9uOiBtb2NrQXBpLmdyYXBocWxDYWxsc1swXS5vcHRpb25zPy5jcmVhdGVBdXRoZW50aWNhdGlvblNlc3Npb24sXG5cdFx0fSwge1xuXHRcdFx0aXNzdWVzOiBbXG5cdFx0XHRcdHsgbnVtYmVyOiAxLCB0aXRsZTogJ0ZpcnN0IGlzc3VlJywgdXJsOiAnaHR0cHM6Ly9naXRodWIuY29tL28vci9pc3N1ZXMvMScsIHVwZGF0ZWRBdDogJzIwMjYtMDgtMDdUMTA6MDA6MDBaJyB9LFxuXHRcdFx0XHR7IG51bWJlcjogMiwgdGl0bGU6ICdTZWNvbmQgaXNzdWUnLCB1cmw6ICdodHRwczovL2dpdGh1Yi5jb20vby9yL2lzc3Vlcy8yJywgdXBkYXRlZEF0OiAnMjAyNi0wOC0wN1QxMTowMDowMFonIH0sXG5cdFx0XHRdLFxuXHRcdFx0dmFyaWFibGVzOiB7IHF1ZXJ5OiAncmVwbzpvL3IgaXM6aXNzdWUgaXM6b3BlbiBhc3NpZ25lZTpAbWUgc29ydDp1cGRhdGVkLWRlc2MnIH0sXG5cdFx0XHRjcmVhdGVBdXRoZW50aWNhdGlvblNlc3Npb246IGZhbHNlLFxuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdxdWVyaWVzIHB1bGwgcmVxdWVzdCBzdW1tYXJpZXMgd2l0aG91dCByZXZpZXcgdGhyZWFkcycsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBtb2NrQXBpID0gbmV3IE1vY2tBcGlDbGllbnQoKTtcblx0XHRtb2NrQXBpLnNldE5leHRSZXNwb25zZSh7XG5cdFx0XHRzZWFyY2g6IHtcblx0XHRcdFx0bm9kZXM6IFt7XG5cdFx0XHRcdFx0X190eXBlbmFtZTogJ1B1bGxSZXF1ZXN0Jyxcblx0XHRcdFx0XHRudW1iZXI6IDMsXG5cdFx0XHRcdFx0dGl0bGU6ICdGaXggQ0knLFxuXHRcdFx0XHRcdHVybDogJ2h0dHBzOi8vZ2l0aHViLmNvbS9vL3IvcHVsbC8zJyxcblx0XHRcdFx0XHR1cGRhdGVkQXQ6ICcyMDI2LTA4LTA3VDEyOjAwOjAwWicsXG5cdFx0XHRcdFx0bWVyZ2VhYmxlOiAnQ09ORkxJQ1RJTkcnLFxuXHRcdFx0XHRcdGNvbW1pdHM6IHsgbm9kZXM6IFt7IGNvbW1pdDogeyBjb21taXR0ZWREYXRlOiAnMjAyNi0wOC0wN1QwOTowMDowMFonLCBzdGF0dXNDaGVja1JvbGx1cDogeyBzdGF0ZTogJ0ZBSUxVUkUnIH0gfSB9XSB9LFxuXHRcdFx0XHR9XSxcblx0XHRcdH0sXG5cdFx0fSk7XG5cdFx0Y29uc3QgZmV0Y2hlciA9IG5ldyBHaXRIdWJSZWNlbnRVc2VyV29ya0ZldGNoZXIobW9ja0FwaSBhcyB1bmtub3duIGFzIEdpdEh1YkFwaUNsaWVudCk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdHB1bGxSZXF1ZXN0czogYXdhaXQgZmV0Y2hlci5nZXRSZWNlbnRBdXRob3JlZFB1bGxSZXF1ZXN0cygnbycsICdyJywgQ2FuY2VsbGF0aW9uVG9rZW4uTm9uZSksXG5cdFx0XHR2YXJpYWJsZXM6IG1vY2tBcGkuZ3JhcGhxbENhbGxzWzBdLnZhcmlhYmxlcyxcblx0XHR9LCB7XG5cdFx0XHRwdWxsUmVxdWVzdHM6IFt7XG5cdFx0XHRcdG51bWJlcjogMyxcblx0XHRcdFx0dGl0bGU6ICdGaXggQ0knLFxuXHRcdFx0XHR1cmw6ICdodHRwczovL2dpdGh1Yi5jb20vby9yL3B1bGwvMycsXG5cdFx0XHRcdHVwZGF0ZWRBdDogJzIwMjYtMDgtMDdUMTI6MDA6MDBaJyxcblx0XHRcdFx0aGFzTWVyZ2VDb25mbGljdHM6IHRydWUsXG5cdFx0XHRcdHN0YXR1c0NoZWNrUm9sbHVwU3RhdGU6ICdGQUlMVVJFJyxcblx0XHRcdFx0bGF0ZXN0Q29tbWl0QXQ6ICcyMDI2LTA4LTA3VDA5OjAwOjAwWicsXG5cdFx0XHR9XSxcblx0XHRcdHZhcmlhYmxlczogeyBxdWVyeTogJ3JlcG86by9yIGlzOnByIGlzOm9wZW4gYXV0aG9yOkBtZSBzb3J0OnVwZGF0ZWQtZGVzYycgfSxcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgncXVlcmllcyByZXZpZXcgdGhyZWFkcyBmb3Igb25lIHB1bGwgcmVxdWVzdCBpbmRlcGVuZGVudGx5JywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IG1vY2tBcGkgPSBuZXcgTW9ja0FwaUNsaWVudCgpO1xuXHRcdG1vY2tBcGkuc2V0TmV4dFJlc3BvbnNlKHtcblx0XHRcdHJlcG9zaXRvcnk6IHtcblx0XHRcdFx0cHVsbFJlcXVlc3Q6IHtcblx0XHRcdFx0XHRyZXZpZXdUaHJlYWRzOiB7XG5cdFx0XHRcdFx0XHRub2RlczogW3tcblx0XHRcdFx0XHRcdFx0aXNSZXNvbHZlZDogZmFsc2UsXG5cdFx0XHRcdFx0XHRcdGNvbW1lbnRzOiB7IG5vZGVzOiBbeyBjcmVhdGVkQXQ6ICcyMDI2LTA4LTA3VDEwOjAwOjAwWicgfV0gfSxcblx0XHRcdFx0XHRcdH1dLFxuXHRcdFx0XHRcdH0sXG5cdFx0XHRcdH0sXG5cdFx0XHR9LFxuXHRcdH0pO1xuXHRcdGNvbnN0IGZldGNoZXIgPSBuZXcgR2l0SHViUmVjZW50VXNlcldvcmtGZXRjaGVyKG1vY2tBcGkgYXMgdW5rbm93biBhcyBHaXRIdWJBcGlDbGllbnQpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRyZXZpZXdUaHJlYWRzOiBhd2FpdCBmZXRjaGVyLmdldFB1bGxSZXF1ZXN0UmV2aWV3VGhyZWFkcygnbycsICdyJywgMywgQ2FuY2VsbGF0aW9uVG9rZW4uTm9uZSksXG5cdFx0XHR2YXJpYWJsZXM6IG1vY2tBcGkuZ3JhcGhxbENhbGxzWzBdLnZhcmlhYmxlcyxcblx0XHR9LCB7XG5cdFx0XHRyZXZpZXdUaHJlYWRzOiBbeyBpc1Jlc29sdmVkOiBmYWxzZSwgbGF0ZXN0Q29tbWVudEF0OiAnMjAyNi0wOC0wN1QxMDowMDowMFonIH1dLFxuXHRcdFx0dmFyaWFibGVzOiB7IG93bmVyOiAnbycsIHJlcG86ICdyJywgcHVsbFJlcXVlc3ROdW1iZXI6IDMgfSxcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnY2hlY2tzIHB1bGwgcmVxdWVzdCBsaW5rYWdlIGZvciBpc3N1ZSBzdW1tYXJpZXMgaW4gb25lIHJlcXVlc3QnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgbW9ja0FwaSA9IG5ldyBNb2NrQXBpQ2xpZW50KCk7XG5cdFx0bW9ja0FwaS5zZXROZXh0UmVzcG9uc2Uoe1xuXHRcdFx0cmVwb3NpdG9yeToge1xuXHRcdFx0XHRpc3N1ZTA6IHsgY2xvc2VkQnlQdWxsUmVxdWVzdHNSZWZlcmVuY2VzOiB7IHRvdGFsQ291bnQ6IDEgfSB9LFxuXHRcdFx0XHRpc3N1ZTE6IHsgY2xvc2VkQnlQdWxsUmVxdWVzdHNSZWZlcmVuY2VzOiB7IHRvdGFsQ291bnQ6IDAgfSB9LFxuXHRcdFx0fSxcblx0XHR9KTtcblx0XHRjb25zdCBmZXRjaGVyID0gbmV3IEdpdEh1YlJlY2VudFVzZXJXb3JrRmV0Y2hlcihtb2NrQXBpIGFzIHVua25vd24gYXMgR2l0SHViQXBpQ2xpZW50KTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0bGlua2VkSXNzdWVzOiBbLi4uYXdhaXQgZmV0Y2hlci5nZXRJc3N1ZXNXaXRoTGlua2VkUHVsbFJlcXVlc3RzKCdvJywgJ3InLCBbMSwgMl0sIENhbmNlbGxhdGlvblRva2VuLk5vbmUpXSxcblx0XHRcdHZhcmlhYmxlczogbW9ja0FwaS5ncmFwaHFsQ2FsbHNbMF0udmFyaWFibGVzLFxuXHRcdH0sIHtcblx0XHRcdGxpbmtlZElzc3VlczogWzFdLFxuXHRcdFx0dmFyaWFibGVzOiB7IG93bmVyOiAnbycsIHJlcG86ICdyJywgaXNzdWUwOiAxLCBpc3N1ZTE6IDIgfSxcblx0XHR9KTtcblx0fSk7XG59KTtcblxuc3VpdGUoJ0dpdEh1YlJlcG9zaXRvcnlGZXRjaGVyJywgKCkgPT4ge1xuXG5cdGNvbnN0IHN0b3JlID0gbmV3IERpc3Bvc2FibGVTdG9yZSgpO1xuXHRsZXQgbW9ja0FwaTogTW9ja0FwaUNsaWVudDtcblx0bGV0IGZldGNoZXI6IEdpdEh1YlJlcG9zaXRvcnlGZXRjaGVyO1xuXG5cdHNldHVwKCgpID0+IHtcblx0XHRtb2NrQXBpID0gbmV3IE1vY2tBcGlDbGllbnQoKTtcblx0XHRmZXRjaGVyID0gbmV3IEdpdEh1YlJlcG9zaXRvcnlGZXRjaGVyKG1vY2tBcGkgYXMgdW5rbm93biBhcyBHaXRIdWJBcGlDbGllbnQpO1xuXHR9KTtcblxuXHR0ZWFyZG93bigoKSA9PiBzdG9yZS5jbGVhcigpKTtcblxuXHRlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUoKTtcblxuXHR0ZXN0KCdnZXRSZXBvc2l0b3J5IHJldHVybnMgbWFwcGVkIGRhdGEnLCBhc3luYyAoKSA9PiB7XG5cdFx0bW9ja0FwaS5zZXROZXh0UmVzcG9uc2Uoe1xuXHRcdFx0bmFtZTogJ3ZzY29kZScsXG5cdFx0XHRmdWxsX25hbWU6ICdtaWNyb3NvZnQvdnNjb2RlJyxcblx0XHRcdG93bmVyOiB7IGxvZ2luOiAnbWljcm9zb2Z0JyB9LFxuXHRcdFx0ZGVmYXVsdF9icmFuY2g6ICdtYWluJyxcblx0XHRcdHByaXZhdGU6IGZhbHNlLFxuXHRcdFx0ZGVzY3JpcHRpb246ICdWaXN1YWwgU3R1ZGlvIENvZGUnLFxuXHRcdH0pO1xuXG5cdFx0Y29uc3QgcmVwbyA9IGF3YWl0IGZldGNoZXIuZ2V0UmVwb3NpdG9yeSgnbWljcm9zb2Z0JywgJ3ZzY29kZScpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocmVwby5kYXRhLCB7XG5cdFx0XHRvd25lcjogJ21pY3Jvc29mdCcsXG5cdFx0XHRuYW1lOiAndnNjb2RlJyxcblx0XHRcdGZ1bGxOYW1lOiAnbWljcm9zb2Z0L3ZzY29kZScsXG5cdFx0XHRkZWZhdWx0QnJhbmNoOiAnbWFpbicsXG5cdFx0XHRpc1ByaXZhdGU6IGZhbHNlLFxuXHRcdFx0ZGVzY3JpcHRpb246ICdWaXN1YWwgU3R1ZGlvIENvZGUnLFxuXHRcdH0pO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChtb2NrQXBpLnJlcXVlc3RDYWxsc1swXS5wYXRoLCAnL3JlcG9zL21pY3Jvc29mdC92c2NvZGUnKTtcblx0fSk7XG5cblx0dGVzdCgnZ2V0UmVwb3NpdG9yeSBoYW5kbGVzIG51bGwgZGVzY3JpcHRpb24nLCBhc3luYyAoKSA9PiB7XG5cdFx0bW9ja0FwaS5zZXROZXh0UmVzcG9uc2Uoe1xuXHRcdFx0bmFtZTogJ3Rlc3QnLFxuXHRcdFx0ZnVsbF9uYW1lOiAnb3duZXIvdGVzdCcsXG5cdFx0XHRvd25lcjogeyBsb2dpbjogJ293bmVyJyB9LFxuXHRcdFx0ZGVmYXVsdF9icmFuY2g6ICdtYWluJyxcblx0XHRcdHByaXZhdGU6IHRydWUsXG5cdFx0XHRkZXNjcmlwdGlvbjogbnVsbCxcblx0XHR9KTtcblxuXHRcdGNvbnN0IHJlcG8gPSBhd2FpdCBmZXRjaGVyLmdldFJlcG9zaXRvcnkoJ293bmVyJywgJ3Rlc3QnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVwby5kYXRhPy5kZXNjcmlwdGlvbiwgJycpO1xuXHR9KTtcblxuXHR0ZXN0KCdnZXRSZXBvc2l0b3J5IHByb3BhZ2F0ZXMgQVBJIGVycm9ycycsIGFzeW5jICgpID0+IHtcblx0XHRtb2NrQXBpLnNldE5leHRFcnJvcihuZXcgR2l0SHViQXBpRXJyb3IoJ05vdCBmb3VuZCcsIDQwNCwgdW5kZWZpbmVkKSk7XG5cdFx0YXdhaXQgYXNzZXJ0LnJlamVjdHMoXG5cdFx0XHQoKSA9PiBmZXRjaGVyLmdldFJlcG9zaXRvcnkoJ293bmVyJywgJ25vbmV4aXN0ZW50JyksXG5cdFx0XHQoZXJyOiBFcnJvcikgPT4gZXJyIGluc3RhbmNlb2YgR2l0SHViQXBpRXJyb3IgJiYgKGVyciBhcyBHaXRIdWJBcGlFcnJvcikuc3RhdHVzQ29kZSA9PT0gNDA0LFxuXHRcdCk7XG5cdH0pO1xufSk7XG5cbnN1aXRlKCdHaXRIdWJQdWxsUmVxdWVzdENvbnRleHRGZXRjaGVyJywgKCkgPT4ge1xuXG5cdGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSgpO1xuXG5cdHRlc3QoJ3JldHVybnMgZGV0YWlscywgcGF0Y2gsIGFuZCBpc3N1ZS9yZXZpZXcgY29tbWVudHMgYXMgb25lIHNuYXBzaG90JywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IG1vY2tBcGkgPSBuZXcgTW9ja0FwaUNsaWVudCgpO1xuXHRcdG1vY2tBcGkuc2V0UmVzcG9uc2VzKFxuXHRcdFx0e1xuXHRcdFx0XHRudW1iZXI6IDQyLFxuXHRcdFx0XHRodG1sX3VybDogJ2h0dHBzOi8vZ2l0aHViLmNvbS9vd25lci9yZXBvL3B1bGwvNDInLFxuXHRcdFx0XHR0aXRsZTogJ0ltcHJvdmUgc2Vzc2lvbnMnLFxuXHRcdFx0XHRib2R5OiAnRGVzY3JpcHRpb24nLFxuXHRcdFx0XHR1c2VyOiB7IGxvZ2luOiAnYXV0aG9yJyB9LFxuXHRcdFx0XHRkcmFmdDogZmFsc2UsXG5cdFx0XHRcdGJhc2U6IHsgcmVmOiAnbWFpbicgfSxcblx0XHRcdFx0aGVhZDogeyByZWY6ICdmZWF0dXJlJyB9LFxuXHRcdFx0XHR1cGRhdGVkX2F0OiAnMjAyNi0wMS0wMVQwMDowMDowMFonLFxuXHRcdFx0fSxcblx0XHRcdFt7IGZpbGVuYW1lOiAnc3JjL2EudHMnLCBzdGF0dXM6ICdtb2RpZmllZCcsIGFkZGl0aW9uczogMiwgZGVsZXRpb25zOiAxLCBwYXRjaDogJ0BAIC0xICsxIEBAJyB9XSxcblx0XHRcdFt7IGJvZHk6ICdHZW5lcmFsIGNvbW1lbnQnLCB1c2VyOiB7IGxvZ2luOiAnY29tbWVudGVyJyB9LCBjcmVhdGVkX2F0OiAnMjAyNi0wMS0wMlQwMDowMDowMFonLCB1cGRhdGVkX2F0OiAnMjAyNi0wMS0wMlQwMDowMDowMFonIH1dLFxuXHRcdFx0W3sgYm9keTogJ0lubGluZSBjb21tZW50JywgdXNlcjogeyBsb2dpbjogJ3Jldmlld2VyJyB9LCBjcmVhdGVkX2F0OiAnMjAyNi0wMS0wM1QwMDowMDowMFonLCB1cGRhdGVkX2F0OiAnMjAyNi0wMS0wM1QwMDowMDowMFonLCBwYXRoOiAnc3JjL2EudHMnLCBsaW5lOiA3LCBvcmlnaW5hbF9saW5lOiBudWxsIH1dLFxuXHRcdCk7XG5cdFx0Y29uc3QgZmV0Y2hlciA9IG5ldyBHaXRIdWJQdWxsUmVxdWVzdENvbnRleHRGZXRjaGVyKG1vY2tBcGkgYXMgdW5rbm93biBhcyBHaXRIdWJBcGlDbGllbnQpO1xuXG5cdFx0Y29uc3QgY29udGV4dCA9IGF3YWl0IGZldGNoZXIuZ2V0UHVsbFJlcXVlc3RDb250ZXh0KCdvd25lcicsICdyZXBvJywgNDIpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRjb250ZXh0LFxuXHRcdFx0cGF0aHM6IG1vY2tBcGkucmVxdWVzdENhbGxzLm1hcChjYWxsID0+IGNhbGwucGF0aCksXG5cdFx0fSwge1xuXHRcdFx0Y29udGV4dDoge1xuXHRcdFx0XHRvd25lcjogJ293bmVyJyxcblx0XHRcdFx0cmVwbzogJ3JlcG8nLFxuXHRcdFx0XHRudW1iZXI6IDQyLFxuXHRcdFx0XHR1cmw6ICdodHRwczovL2dpdGh1Yi5jb20vb3duZXIvcmVwby9wdWxsLzQyJyxcblx0XHRcdFx0dGl0bGU6ICdJbXByb3ZlIHNlc3Npb25zJyxcblx0XHRcdFx0ZGVzY3JpcHRpb246ICdEZXNjcmlwdGlvbicsXG5cdFx0XHRcdGF1dGhvcjogJ2F1dGhvcicsXG5cdFx0XHRcdGlzRHJhZnQ6IGZhbHNlLFxuXHRcdFx0XHRiYXNlUmVmOiAnbWFpbicsXG5cdFx0XHRcdGJyYW5jaE5hbWU6ICdmZWF0dXJlJyxcblx0XHRcdFx0aGVhZFJlZjogJ2ZlYXR1cmUnLFxuXHRcdFx0XHR1cGRhdGVkQXQ6ICcyMDI2LTAxLTAxVDAwOjAwOjAwWicsXG5cdFx0XHRcdHBhdGNoOiAnZGlmZiAtLWdpdCBhL3NyYy9hLnRzIGIvc3JjL2EudHNcXG5AQCAtMSArMSBAQCcsXG5cdFx0XHRcdGNvbW1lbnRzOiBbe1xuXHRcdFx0XHRcdGtpbmQ6ICdpc3N1ZScsXG5cdFx0XHRcdFx0YXV0aG9yOiAnY29tbWVudGVyJyxcblx0XHRcdFx0XHRib2R5OiAnR2VuZXJhbCBjb21tZW50Jyxcblx0XHRcdFx0XHRjcmVhdGVkQXQ6ICcyMDI2LTAxLTAyVDAwOjAwOjAwWicsXG5cdFx0XHRcdFx0dXBkYXRlZEF0OiAnMjAyNi0wMS0wMlQwMDowMDowMFonLFxuXHRcdFx0XHR9LCB7XG5cdFx0XHRcdFx0a2luZDogJ3JldmlldycsXG5cdFx0XHRcdFx0YXV0aG9yOiAncmV2aWV3ZXInLFxuXHRcdFx0XHRcdGJvZHk6ICdJbmxpbmUgY29tbWVudCcsXG5cdFx0XHRcdFx0Y3JlYXRlZEF0OiAnMjAyNi0wMS0wM1QwMDowMDowMFonLFxuXHRcdFx0XHRcdHVwZGF0ZWRBdDogJzIwMjYtMDEtMDNUMDA6MDA6MDBaJyxcblx0XHRcdFx0XHRwYXRoOiAnc3JjL2EudHMnLFxuXHRcdFx0XHRcdGxpbmU6IDcsXG5cdFx0XHRcdH1dLFxuXHRcdFx0fSxcblx0XHRcdHBhdGhzOiBbXG5cdFx0XHRcdCcvcmVwb3Mvb3duZXIvcmVwby9wdWxscy80MicsXG5cdFx0XHRcdCcvcmVwb3Mvb3duZXIvcmVwby9wdWxscy80Mi9maWxlcz9wZXJfcGFnZT0xMDAmcGFnZT0xJyxcblx0XHRcdFx0Jy9yZXBvcy9vd25lci9yZXBvL2lzc3Vlcy80Mi9jb21tZW50cz9wZXJfcGFnZT0xMDAmcGFnZT0xJyxcblx0XHRcdFx0Jy9yZXBvcy9vd25lci9yZXBvL3B1bGxzLzQyL2NvbW1lbnRzP3Blcl9wYWdlPTEwMCZwYWdlPTEnLFxuXHRcdFx0XSxcblx0XHR9KTtcblx0fSk7XG59KTtcblxuc3VpdGUoJ0dpdEh1YlBSRmV0Y2hlcicsICgpID0+IHtcblxuXHRjb25zdCBzdG9yZSA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblx0bGV0IG1vY2tBcGk6IE1vY2tBcGlDbGllbnQ7XG5cdGxldCBmZXRjaGVyOiBHaXRIdWJQUkZldGNoZXI7XG5cblx0c2V0dXAoKCkgPT4ge1xuXHRcdG1vY2tBcGkgPSBuZXcgTW9ja0FwaUNsaWVudCgpO1xuXHRcdGZldGNoZXIgPSBuZXcgR2l0SHViUFJGZXRjaGVyKG1vY2tBcGkgYXMgdW5rbm93biBhcyBHaXRIdWJBcGlDbGllbnQpO1xuXHR9KTtcblxuXHR0ZWFyZG93bigoKSA9PiBzdG9yZS5jbGVhcigpKTtcblxuXHRlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUoKTtcblxuXHR0ZXN0KCdnZXRQdWxsUmVxdWVzdCBtYXBzIG9wZW4gUFInLCBhc3luYyAoKSA9PiB7XG5cdFx0bW9ja0FwaS5zZXROZXh0UmVzcG9uc2UobWFrZVBSUmVzcG9uc2UoeyBzdGF0ZTogJ29wZW4nLCBtZXJnZWQ6IGZhbHNlLCBkcmFmdDogZmFsc2UgfSkpO1xuXG5cdFx0Y29uc3QgcHIgPSBhd2FpdCBmZXRjaGVyLmdldFB1bGxSZXF1ZXN0KCdvd25lcicsICdyZXBvJywgMSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHByLmRhdGE/LnN0YXRlLCBHaXRIdWJQdWxsUmVxdWVzdFN0YXRlLk9wZW4pO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChwci5kYXRhPy5pc0RyYWZ0LCBmYWxzZSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHByLmRhdGE/Lm51bWJlciwgMSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHByLmRhdGE/LnRpdGxlLCAnVGVzdCBQUicpO1xuXHR9KTtcblxuXHR0ZXN0KCdnZXRQdWxsUmVxdWVzdCBtYXBzIG1lcmdlZCBQUicsIGFzeW5jICgpID0+IHtcblx0XHRtb2NrQXBpLnNldE5leHRSZXNwb25zZShtYWtlUFJSZXNwb25zZSh7IHN0YXRlOiAnY2xvc2VkJywgbWVyZ2VkOiB0cnVlLCBkcmFmdDogZmFsc2UgfSkpO1xuXG5cdFx0Y29uc3QgcHIgPSBhd2FpdCBmZXRjaGVyLmdldFB1bGxSZXF1ZXN0KCdvd25lcicsICdyZXBvJywgMSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHByLmRhdGE/LnN0YXRlLCBHaXRIdWJQdWxsUmVxdWVzdFN0YXRlLk1lcmdlZCk7XG5cdFx0YXNzZXJ0Lm9rKHByLmRhdGE/Lm1lcmdlZEF0KTtcblx0fSk7XG5cblx0dGVzdCgnZ2V0UHVsbFJlcXVlc3QgbWFwcyBjbG9zZWQgUFInLCBhc3luYyAoKSA9PiB7XG5cdFx0bW9ja0FwaS5zZXROZXh0UmVzcG9uc2UobWFrZVBSUmVzcG9uc2UoeyBzdGF0ZTogJ2Nsb3NlZCcsIG1lcmdlZDogZmFsc2UsIGRyYWZ0OiBmYWxzZSB9KSk7XG5cblx0XHRjb25zdCBwciA9IGF3YWl0IGZldGNoZXIuZ2V0UHVsbFJlcXVlc3QoJ293bmVyJywgJ3JlcG8nLCAxKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocHIuZGF0YT8uc3RhdGUsIEdpdEh1YlB1bGxSZXF1ZXN0U3RhdGUuQ2xvc2VkKTtcblx0fSk7XG5cblx0dGVzdCgnZ2V0UmV2aWV3VGhyZWFkcyByZXR1cm5zIEdyYXBoUUwgdGhyZWFkIG1ldGFkYXRhJywgYXN5bmMgKCkgPT4ge1xuXHRcdG1vY2tBcGkuc2V0TmV4dFJlc3BvbnNlKG1ha2VHcmFwaFFMUmV2aWV3VGhyZWFkc1Jlc3BvbnNlKFtcblx0XHRcdG1ha2VHcmFwaFFMUmV2aWV3VGhyZWFkKHtcblx0XHRcdFx0aWQ6ICd0aHJlYWQtYScsXG5cdFx0XHRcdHBhdGg6ICdzcmMvYS50cycsXG5cdFx0XHRcdGxpbmU6IDEwLFxuXHRcdFx0XHRpc1Jlc29sdmVkOiBmYWxzZSxcblx0XHRcdFx0Y29tbWVudHM6IFtcblx0XHRcdFx0XHRtYWtlR3JhcGhRTFJldmlld0NvbW1lbnQoeyBkYXRhYmFzZUlkOiAxMDAsIHBhdGg6ICdzcmMvYS50cycsIGxpbmU6IDEwIH0pLFxuXHRcdFx0XHRcdG1ha2VHcmFwaFFMUmV2aWV3Q29tbWVudCh7IGRhdGFiYXNlSWQ6IDEwMSwgcGF0aDogJ3NyYy9hLnRzJywgbGluZTogMTAsIHJlcGx5VG9EYXRhYmFzZUlkOiAxMDAgfSksXG5cdFx0XHRcdF0sXG5cdFx0XHR9KSxcblx0XHRcdG1ha2VHcmFwaFFMUmV2aWV3VGhyZWFkKHtcblx0XHRcdFx0aWQ6ICd0aHJlYWQtYicsXG5cdFx0XHRcdHBhdGg6ICdzcmMvYi50cycsXG5cdFx0XHRcdGxpbmU6IDIwLFxuXHRcdFx0XHRpc1Jlc29sdmVkOiB0cnVlLFxuXHRcdFx0XHRjb21tZW50czogW21ha2VHcmFwaFFMUmV2aWV3Q29tbWVudCh7IGRhdGFiYXNlSWQ6IDIwMCwgcGF0aDogJ3NyYy9iLnRzJywgbGluZTogMjAgfSldLFxuXHRcdFx0fSksXG5cdFx0XSkpO1xuXG5cdFx0Y29uc3QgdGhyZWFkcyA9IGF3YWl0IGZldGNoZXIuZ2V0UmV2aWV3VGhyZWFkcygnb3duZXInLCAncmVwbycsIDEpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh0aHJlYWRzLmxlbmd0aCwgMik7XG5cblx0XHRjb25zdCB0aHJlYWQxID0gdGhyZWFkcy5maW5kKHQgPT4gdC5pZCA9PT0gJ3RocmVhZC1hJykhO1xuXHRcdGFzc2VydC5vayh0aHJlYWQxKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodGhyZWFkMS5jb21tZW50cy5sZW5ndGgsIDIpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh0aHJlYWQxLnBhdGgsICdzcmMvYS50cycpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh0aHJlYWQxLmxpbmUsIDEwKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodGhyZWFkMS5jb21tZW50c1swXS50aHJlYWRJZCwgJ3RocmVhZC1hJyk7XG5cblx0XHRjb25zdCB0aHJlYWQyID0gdGhyZWFkcy5maW5kKHQgPT4gdC5pZCA9PT0gJ3RocmVhZC1iJykhO1xuXHRcdGFzc2VydC5vayh0aHJlYWQyKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodGhyZWFkMi5jb21tZW50cy5sZW5ndGgsIDEpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh0aHJlYWQyLnBhdGgsICdzcmMvYi50cycpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh0aHJlYWQyLmlzUmVzb2x2ZWQsIHRydWUpO1xuXHR9KTtcblxuXHR0ZXN0KCdyZXNvbHZlVGhyZWFkIHVzZXMgR3JhcGhRTCBtdXRhdGlvbicsIGFzeW5jICgpID0+IHtcblx0XHRtb2NrQXBpLnNldE5leHRSZXNwb25zZSh7XG5cdFx0XHRyZXNvbHZlUmV2aWV3VGhyZWFkOiB7XG5cdFx0XHRcdHRocmVhZDoge1xuXHRcdFx0XHRcdGlzUmVzb2x2ZWQ6IHRydWUsXG5cdFx0XHRcdH0sXG5cdFx0XHR9LFxuXHRcdH0pO1xuXG5cdFx0YXdhaXQgZmV0Y2hlci5yZXNvbHZlVGhyZWFkKCdvd25lcicsICdyZXBvJywgJ3RocmVhZC1hJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1vY2tBcGkuZ3JhcGhxbENhbGxzLmxlbmd0aCwgMSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChtb2NrQXBpLmdyYXBocWxDYWxsc1swXS52YXJpYWJsZXMsIHsgdGhyZWFkSWQ6ICd0aHJlYWQtYScgfSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2dldFJldmlld3MgbWFwcyBBUEkgcmVzcG9uc2UnLCBhc3luYyAoKSA9PiB7XG5cdFx0bW9ja0FwaS5zZXROZXh0UmVzcG9uc2UoW1xuXHRcdFx0eyBpZDogMSwgdXNlcjogeyBsb2dpbjogJ3Jldmlld2VyJywgYXZhdGFyX3VybDogJycgfSwgc3RhdGU6ICdBUFBST1ZFRCcsIHN1Ym1pdHRlZF9hdDogJzIwMjQtMDEtMDFUMDA6MDA6MDBaJyB9LFxuXHRcdFx0eyBpZDogMiwgdXNlcjogeyBsb2dpbjogJ290aGVyJywgYXZhdGFyX3VybDogJycgfSwgc3RhdGU6ICdDSEFOR0VTX1JFUVVFU1RFRCcsIHN1Ym1pdHRlZF9hdDogJzIwMjQtMDEtMDJUMDA6MDA6MDBaJyB9LFxuXHRcdF0pO1xuXG5cdFx0Y29uc3QgcmV2aWV3cyA9IGF3YWl0IGZldGNoZXIuZ2V0UmV2aWV3cygnb3duZXInLCAncmVwbycsIDEpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocmV2aWV3cy5kYXRhLCBbXG5cdFx0XHR7IGlkOiAxLCBhdXRob3I6IHsgbG9naW46ICdyZXZpZXdlcicsIGF2YXRhclVybDogJycgfSwgc3RhdGU6ICdBUFBST1ZFRCcsIHN1Ym1pdHRlZEF0OiAnMjAyNC0wMS0wMVQwMDowMDowMFonIH0sXG5cdFx0XHR7IGlkOiAyLCBhdXRob3I6IHsgbG9naW46ICdvdGhlcicsIGF2YXRhclVybDogJycgfSwgc3RhdGU6ICdDSEFOR0VTX1JFUVVFU1RFRCcsIHN1Ym1pdHRlZEF0OiAnMjAyNC0wMS0wMlQwMDowMDowMFonIH0sXG5cdFx0XSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1vY2tBcGkucmVxdWVzdENhbGxzLmxlbmd0aCwgMSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1vY2tBcGkucmVxdWVzdENhbGxzWzBdLnBhdGgsICcvcmVwb3Mvb3duZXIvcmVwby9wdWxscy8xL3Jldmlld3MnKTtcblx0fSk7XG5cblx0dGVzdCgnY29tcHV0ZU1lcmdlYWJpbGl0eSBkZXRlY3RzIGRyYWZ0IGJsb2NrZXInLCAoKSA9PiB7XG5cdFx0Y29uc3QgcHIgPSBtYWtlUFIoeyBzdGF0ZTogR2l0SHViUHVsbFJlcXVlc3RTdGF0ZS5PcGVuLCBpc0RyYWZ0OiB0cnVlLCBtZXJnZWFibGU6IHRydWUsIG1lcmdlYWJsZVN0YXRlOiAnY2xlYW4nIH0pO1xuXHRcdGNvbnN0IHJlc3VsdCA9IGNvbXB1dGVNZXJnZWFiaWxpdHkocHIsIFtdKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0LmNhbk1lcmdlLCBmYWxzZSk7XG5cdFx0YXNzZXJ0Lm9rKHJlc3VsdC5ibG9ja2Vycy5zb21lKGIgPT4gYi5raW5kID09PSBNZXJnZUJsb2NrZXJLaW5kLkRyYWZ0KSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2NvbXB1dGVNZXJnZWFiaWxpdHkgZGV0ZWN0cyBjb25mbGljdHMgYmxvY2tlcicsICgpID0+IHtcblx0XHRjb25zdCBwciA9IG1ha2VQUih7IHN0YXRlOiBHaXRIdWJQdWxsUmVxdWVzdFN0YXRlLk9wZW4sIGlzRHJhZnQ6IGZhbHNlLCBtZXJnZWFibGU6IGZhbHNlLCBtZXJnZWFibGVTdGF0ZTogJ2RpcnR5JyB9KTtcblx0XHRjb25zdCByZXN1bHQgPSBjb21wdXRlTWVyZ2VhYmlsaXR5KHByLCBbXSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdC5jYW5NZXJnZSwgZmFsc2UpO1xuXHRcdGFzc2VydC5vayhyZXN1bHQuYmxvY2tlcnMuc29tZShiID0+IGIua2luZCA9PT0gTWVyZ2VCbG9ja2VyS2luZC5Db25mbGljdHMpKTtcblx0fSk7XG5cblx0dGVzdCgnY29tcHV0ZU1lcmdlYWJpbGl0eSBkZXRlY3RzIGNoYW5nZXMgcmVxdWVzdGVkIGJsb2NrZXInLCAoKSA9PiB7XG5cdFx0Y29uc3QgcHIgPSBtYWtlUFIoeyBzdGF0ZTogR2l0SHViUHVsbFJlcXVlc3RTdGF0ZS5PcGVuLCBpc0RyYWZ0OiBmYWxzZSwgbWVyZ2VhYmxlOiB0cnVlLCBtZXJnZWFibGVTdGF0ZTogJ2NsZWFuJyB9KTtcblx0XHRjb25zdCByZXZpZXdzOiBJR2l0SHViUHVsbFJlcXVlc3RSZXZpZXdbXSA9IFtcblx0XHRcdHsgaWQ6IDEsIGF1dGhvcjogeyBsb2dpbjogJ3Jldmlld2VyJywgYXZhdGFyVXJsOiAnJyB9LCBzdGF0ZTogJ0NIQU5HRVNfUkVRVUVTVEVEJywgc3VibWl0dGVkQXQ6ICcyMDI0LTAxLTAxVDAwOjAwOjAwWicgfSxcblx0XHRdO1xuXHRcdGNvbnN0IHJlc3VsdCA9IGNvbXB1dGVNZXJnZWFiaWxpdHkocHIsIHJldmlld3MpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQuY2FuTWVyZ2UsIGZhbHNlKTtcblx0XHRhc3NlcnQub2socmVzdWx0LmJsb2NrZXJzLnNvbWUoYiA9PiBiLmtpbmQgPT09IE1lcmdlQmxvY2tlcktpbmQuQ2hhbmdlc1JlcXVlc3RlZCkpO1xuXHR9KTtcblxuXHR0ZXN0KCdjb21wdXRlTWVyZ2VhYmlsaXR5IHJldHVybnMgY2FuTWVyZ2UgZm9yIGNsZWFuIG9wZW4gUFInLCAoKSA9PiB7XG5cdFx0Y29uc3QgcHIgPSBtYWtlUFIoeyBzdGF0ZTogR2l0SHViUHVsbFJlcXVlc3RTdGF0ZS5PcGVuLCBpc0RyYWZ0OiBmYWxzZSwgbWVyZ2VhYmxlOiB0cnVlLCBtZXJnZWFibGVTdGF0ZTogJ2NsZWFuJyB9KTtcblx0XHRjb25zdCByZXN1bHQgPSBjb21wdXRlTWVyZ2VhYmlsaXR5KHByLCBbXSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdC5jYW5NZXJnZSwgdHJ1ZSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdC5ibG9ja2Vycy5sZW5ndGgsIDApO1xuXHR9KTtcbn0pO1xuXG5zdWl0ZSgnR2l0SHViUHVsbFJlcXVlc3RzRmV0Y2hlcicsICgpID0+IHtcblxuXHRlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUoKTtcblxuXHR0ZXN0KCdtYXBzIGEgbGlnaHR3ZWlnaHQgcGFnZSB3aXRoIHBhZ2luYXRpb24gYW5kIGRpZmYgc3RhdHMnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgbW9ja0FwaSA9IG5ldyBNb2NrQXBpQ2xpZW50KCk7XG5cdFx0bW9ja0FwaS5zZXROZXh0UmVzcG9uc2Uoe1xuXHRcdFx0cmVwb3NpdG9yeToge1xuXHRcdFx0XHRwdWxsUmVxdWVzdHM6IHtcblx0XHRcdFx0XHRub2RlczogW3tcblx0XHRcdFx0XHRcdG51bWJlcjogNyxcblx0XHRcdFx0XHRcdHRpdGxlOiAnSW1wcm92ZSBzZXNzaW9ucycsXG5cdFx0XHRcdFx0XHRhdXRob3I6IHsgbG9naW46ICdhdXRob3InLCBhdmF0YXJVcmw6ICdhdmF0YXInIH0sXG5cdFx0XHRcdFx0XHRoZWFkUmVmTmFtZTogJ2ZlYXR1cmUnLFxuXHRcdFx0XHRcdFx0aXNEcmFmdDogdHJ1ZSxcblx0XHRcdFx0XHRcdHVwZGF0ZWRBdDogJzIwMjYtMDctMzBUMTI6MDA6MDBaJyxcblx0XHRcdFx0XHRcdGFkZGl0aW9uczogMTIsXG5cdFx0XHRcdFx0XHRkZWxldGlvbnM6IDMsXG5cdFx0XHRcdFx0fV0sXG5cdFx0XHRcdFx0cGFnZUluZm86IHsgZW5kQ3Vyc29yOiAnY3Vyc29yLTEnLCBoYXNOZXh0UGFnZTogdHJ1ZSB9LFxuXHRcdFx0XHR9LFxuXHRcdFx0fSxcblx0XHR9KTtcblx0XHRjb25zdCBmZXRjaGVyID0gbmV3IEdpdEh1YlB1bGxSZXF1ZXN0c0ZldGNoZXIobW9ja0FwaSBhcyB1bmtub3duIGFzIEdpdEh1YkFwaUNsaWVudCk7XG5cblx0XHRjb25zdCBwYWdlID0gYXdhaXQgZmV0Y2hlci5nZXRQdWxsUmVxdWVzdHMoJ21pY3Jvc29mdCcsICd2c2NvZGUnKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocGFnZSwge1xuXHRcdFx0cHVsbFJlcXVlc3RzOiBbe1xuXHRcdFx0XHRudW1iZXI6IDcsXG5cdFx0XHRcdHRpdGxlOiAnSW1wcm92ZSBzZXNzaW9ucycsXG5cdFx0XHRcdGF1dGhvcjogeyBsb2dpbjogJ2F1dGhvcicsIGF2YXRhclVybDogJ2F2YXRhcicgfSxcblx0XHRcdFx0aGVhZFJlZjogJ2ZlYXR1cmUnLFxuXHRcdFx0XHRjaGVja291dFJlZjogJ3JlZnMvcHVsbC83L2hlYWQnLFxuXHRcdFx0XHRpc0RyYWZ0OiB0cnVlLFxuXHRcdFx0XHR1cGRhdGVkQXQ6ICcyMDI2LTA3LTMwVDEyOjAwOjAwWicsXG5cdFx0XHRcdGFkZGl0aW9uczogMTIsXG5cdFx0XHRcdGRlbGV0aW9uczogMyxcblx0XHRcdFx0cmV2aWV3UmVxdWVzdGVkRnJvbVZpZXdlcjogZmFsc2UsXG5cdFx0XHRcdGFzc2lnbmVkVG9WaWV3ZXI6IGZhbHNlLFxuXHRcdFx0fV0sXG5cdFx0XHRjdXJzb3I6ICdjdXJzb3ItMScsXG5cdFx0XHRoYXNOZXh0UGFnZTogdHJ1ZSxcblx0XHR9KTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKG1vY2tBcGkuZ3JhcGhxbENhbGxzWzBdLnZhcmlhYmxlcywgeyBvd25lcjogJ21pY3Jvc29mdCcsIHJlcG86ICd2c2NvZGUnLCBjdXJzb3I6IG51bGwgfSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2xvYWRzIHZpZXdlciByZXZpZXcgYW5kIGFzc2lnbm1lbnQgbWVtYmVyc2hpcCB3aXRoIGluZGVwZW5kZW50IHNtYWxsIHF1ZXJpZXMnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgbW9ja0FwaSA9IG5ldyBNb2NrQXBpQ2xpZW50KCk7XG5cdFx0bW9ja0FwaS5zZXROZXh0UmVzcG9uc2Uoe1xuXHRcdFx0c2VhcmNoOiB7IG5vZGVzOiBbbWFrZVB1bGxSZXF1ZXN0U2VhcmNoTm9kZSg3KSwgbnVsbCwgbWFrZVB1bGxSZXF1ZXN0U2VhcmNoTm9kZSg5KV0gfSxcblx0XHR9KTtcblx0XHRjb25zdCBmZXRjaGVyID0gbmV3IEdpdEh1YlB1bGxSZXF1ZXN0c0ZldGNoZXIobW9ja0FwaSBhcyB1bmtub3duIGFzIEdpdEh1YkFwaUNsaWVudCk7XG5cblx0XHRjb25zdCByZXZpZXdSZXF1ZXN0ZWQgPSBhd2FpdCBmZXRjaGVyLmdldFB1bGxSZXF1ZXN0c1dhaXRpbmdGb3JSZXZpZXcoJ21pY3Jvc29mdCcsICd2c2NvZGUnKTtcblx0XHRtb2NrQXBpLnNldE5leHRSZXNwb25zZSh7XG5cdFx0XHRzZWFyY2g6IHsgbm9kZXM6IFttYWtlUHVsbFJlcXVlc3RTZWFyY2hOb2RlKDgpLCBtYWtlUHVsbFJlcXVlc3RTZWFyY2hOb2RlKDkpXSB9LFxuXHRcdH0pO1xuXHRcdGNvbnN0IGFzc2lnbmVkID0gYXdhaXQgZmV0Y2hlci5nZXRQdWxsUmVxdWVzdHNBc3NpZ25lZFRvVmlld2VyKCdtaWNyb3NvZnQnLCAndnNjb2RlJyk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdHJldmlld1JlcXVlc3RlZDogcmV2aWV3UmVxdWVzdGVkLm1hcChwdWxsUmVxdWVzdCA9PiAoeyBudW1iZXI6IHB1bGxSZXF1ZXN0Lm51bWJlciwgcmV2aWV3UmVxdWVzdGVkRnJvbVZpZXdlcjogcHVsbFJlcXVlc3QucmV2aWV3UmVxdWVzdGVkRnJvbVZpZXdlciwgYXNzaWduZWRUb1ZpZXdlcjogcHVsbFJlcXVlc3QuYXNzaWduZWRUb1ZpZXdlciB9KSksXG5cdFx0XHRhc3NpZ25lZDogYXNzaWduZWQubWFwKHB1bGxSZXF1ZXN0ID0+ICh7IG51bWJlcjogcHVsbFJlcXVlc3QubnVtYmVyLCByZXZpZXdSZXF1ZXN0ZWRGcm9tVmlld2VyOiBwdWxsUmVxdWVzdC5yZXZpZXdSZXF1ZXN0ZWRGcm9tVmlld2VyLCBhc3NpZ25lZFRvVmlld2VyOiBwdWxsUmVxdWVzdC5hc3NpZ25lZFRvVmlld2VyIH0pKSxcblx0XHRcdHZhcmlhYmxlczogbW9ja0FwaS5ncmFwaHFsQ2FsbHMubWFwKGNhbGwgPT4gY2FsbC52YXJpYWJsZXMpLFxuXHRcdFx0dXNlc05lc3RlZEZpZWxkczogbW9ja0FwaS5ncmFwaHFsQ2FsbHMuc29tZShjYWxsID0+IGNhbGwucXVlcnkuaW5jbHVkZXMoJ3Jldmlld1JlcXVlc3RzKCcpIHx8IGNhbGwucXVlcnkuaW5jbHVkZXMoJ2Fzc2lnbmVlcygnKSksXG5cdFx0fSwge1xuXHRcdFx0cmV2aWV3UmVxdWVzdGVkOiBbXG5cdFx0XHRcdHsgbnVtYmVyOiA3LCByZXZpZXdSZXF1ZXN0ZWRGcm9tVmlld2VyOiB0cnVlLCBhc3NpZ25lZFRvVmlld2VyOiBmYWxzZSB9LFxuXHRcdFx0XHR7IG51bWJlcjogOSwgcmV2aWV3UmVxdWVzdGVkRnJvbVZpZXdlcjogdHJ1ZSwgYXNzaWduZWRUb1ZpZXdlcjogZmFsc2UgfSxcblx0XHRcdF0sXG5cdFx0XHRhc3NpZ25lZDogW1xuXHRcdFx0XHR7IG51bWJlcjogOCwgcmV2aWV3UmVxdWVzdGVkRnJvbVZpZXdlcjogZmFsc2UsIGFzc2lnbmVkVG9WaWV3ZXI6IHRydWUgfSxcblx0XHRcdFx0eyBudW1iZXI6IDksIHJldmlld1JlcXVlc3RlZEZyb21WaWV3ZXI6IGZhbHNlLCBhc3NpZ25lZFRvVmlld2VyOiB0cnVlIH0sXG5cdFx0XHRdLFxuXHRcdFx0dmFyaWFibGVzOiBbXG5cdFx0XHRcdHsgcXVlcnk6ICdyZXBvOm1pY3Jvc29mdC92c2NvZGUgaXM6cHIgaXM6b3BlbiByZXZpZXctcmVxdWVzdGVkOkBtZSBzb3J0OnVwZGF0ZWQtZGVzYycgfSxcblx0XHRcdFx0eyBxdWVyeTogJ3JlcG86bWljcm9zb2Z0L3ZzY29kZSBpczpwciBpczpvcGVuIGFzc2lnbmVlOkBtZSBzb3J0OnVwZGF0ZWQtZGVzYycgfSxcblx0XHRcdF0sXG5cdFx0XHR1c2VzTmVzdGVkRmllbGRzOiBmYWxzZSxcblx0XHR9KTtcblx0fSk7XG59KTtcblxuc3VpdGUoJ0dpdEh1YlBSQ0lGZXRjaGVyJywgKCkgPT4ge1xuXG5cdGNvbnN0IHN0b3JlID0gbmV3IERpc3Bvc2FibGVTdG9yZSgpO1xuXHRsZXQgbW9ja0FwaTogTW9ja0FwaUNsaWVudDtcblx0bGV0IGZldGNoZXI6IEdpdEh1YlBSQ0lGZXRjaGVyO1xuXG5cdHNldHVwKCgpID0+IHtcblx0XHRtb2NrQXBpID0gbmV3IE1vY2tBcGlDbGllbnQoKTtcblx0XHRmZXRjaGVyID0gbmV3IEdpdEh1YlBSQ0lGZXRjaGVyKG1vY2tBcGkgYXMgdW5rbm93biBhcyBHaXRIdWJBcGlDbGllbnQpO1xuXHR9KTtcblxuXHR0ZWFyZG93bigoKSA9PiBzdG9yZS5jbGVhcigpKTtcblxuXHRlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUoKTtcblxuXHR0ZXN0KCdnZXRDaGVja1J1bnMgbWFwcyBjaGVjayBydW5zJywgYXN5bmMgKCkgPT4ge1xuXHRcdG1vY2tBcGkuc2V0TmV4dFJlc3BvbnNlKHtcblx0XHRcdHRvdGFsX2NvdW50OiAyLFxuXHRcdFx0Y2hlY2tfcnVuczogW1xuXHRcdFx0XHR7IGlkOiAxLCBuYW1lOiAnYnVpbGQnLCBzdGF0dXM6ICdjb21wbGV0ZWQnLCBjb25jbHVzaW9uOiAnc3VjY2VzcycsIHN0YXJ0ZWRfYXQ6ICcyMDI0LTAxLTAxVDAwOjAwOjAwWicsIGNvbXBsZXRlZF9hdDogJzIwMjQtMDEtMDFUMDA6MTA6MDBaJywgZGV0YWlsc191cmw6ICdodHRwczovL2V4YW1wbGUuY29tLzEnIH0sXG5cdFx0XHRcdHsgaWQ6IDIsIG5hbWU6ICd0ZXN0Jywgc3RhdHVzOiAnaW5fcHJvZ3Jlc3MnLCBjb25jbHVzaW9uOiBudWxsLCBzdGFydGVkX2F0OiAnMjAyNC0wMS0wMVQwMDowMDowMFonLCBjb21wbGV0ZWRfYXQ6IG51bGwsIGRldGFpbHNfdXJsOiBudWxsIH0sXG5cdFx0XHRdLFxuXHRcdH0pO1xuXG5cdFx0Y29uc3QgY2hlY2tzID0gYXdhaXQgZmV0Y2hlci5nZXRDaGVja1J1bnMoJ293bmVyJywgJ3JlcG8nLCAnYWJjMTIzJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNoZWNrcy5kYXRhPy5sZW5ndGgsIDIpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoY2hlY2tzLmRhdGE/LlswXSwge1xuXHRcdFx0aWQ6IDEsXG5cdFx0XHRuYW1lOiAnYnVpbGQnLFxuXHRcdFx0c3RhdHVzOiBHaXRIdWJDaGVja1N0YXR1cy5Db21wbGV0ZWQsXG5cdFx0XHRjb25jbHVzaW9uOiBHaXRIdWJDaGVja0NvbmNsdXNpb24uU3VjY2Vzcyxcblx0XHRcdHN0YXJ0ZWRBdDogJzIwMjQtMDEtMDFUMDA6MDA6MDBaJyxcblx0XHRcdGNvbXBsZXRlZEF0OiAnMjAyNC0wMS0wMVQwMDoxMDowMFonLFxuXHRcdFx0ZGV0YWlsc1VybDogJ2h0dHBzOi8vZXhhbXBsZS5jb20vMScsXG5cdFx0fSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNoZWNrcy5kYXRhPy5bMV0uY29uY2x1c2lvbiwgdW5kZWZpbmVkKTtcblx0fSk7XG5cblx0dGVzdCgnZ2V0Q2hlY2tSdW5Bbm5vdGF0aW9ucyByZXR1cm5zIGZvcm1hdHRlZCBhbm5vdGF0aW9ucycsIGFzeW5jICgpID0+IHtcblx0XHRtb2NrQXBpLnNldE5leHRSZXNwb25zZShbXG5cdFx0XHR7IHBhdGg6ICdzcmMvYS50cycsIHN0YXJ0X2xpbmU6IDEwLCBlbmRfbGluZTogMTAsIGFubm90YXRpb25fbGV2ZWw6ICdmYWlsdXJlJywgbWVzc2FnZTogJ3R5cGUgZXJyb3InLCB0aXRsZTogJ1RTMjM0NScgfSxcblx0XHRcdHsgcGF0aDogJ3NyYy9iLnRzJywgc3RhcnRfbGluZTogNSwgZW5kX2xpbmU6IDgsIGFubm90YXRpb25fbGV2ZWw6ICd3YXJuaW5nJywgbWVzc2FnZTogJ3VudXNlZCB2YXInLCB0aXRsZTogbnVsbCB9LFxuXHRcdF0pO1xuXG5cdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgZmV0Y2hlci5nZXRDaGVja1J1bkFubm90YXRpb25zKCdvd25lcicsICdyZXBvJywgMSk7XG5cdFx0YXNzZXJ0Lm9rKHJlc3VsdC5pbmNsdWRlcygnW2ZhaWx1cmVdIHNyYy9hLnRzOjEwJykpO1xuXHRcdGFzc2VydC5vayhyZXN1bHQuaW5jbHVkZXMoJyhUUzIzNDUpJykpO1xuXHRcdGFzc2VydC5vayhyZXN1bHQuaW5jbHVkZXMoJ1t3YXJuaW5nXSBzcmMvYi50czo1LTgnKSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3JlcnVuRmFpbGVkSm9icyBzZW5kcyBQT1NUIHRvIGNvcnJlY3QgZW5kcG9pbnQnLCBhc3luYyAoKSA9PiB7XG5cdFx0bW9ja0FwaS5zZXROZXh0UmVzcG9uc2UodW5kZWZpbmVkKTtcblxuXHRcdGF3YWl0IGZldGNoZXIucmVydW5GYWlsZWRKb2JzKCdteU93bmVyJywgJ215UmVwbycsIDEyMzQ1KTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChtb2NrQXBpLnJlcXVlc3RDYWxscy5sZW5ndGgsIDEpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwobW9ja0FwaS5yZXF1ZXN0Q2FsbHNbMF0sIHtcblx0XHRcdG1ldGhvZDogJ1BPU1QnLFxuXHRcdFx0cGF0aDogJy9yZXBvcy9teU93bmVyL215UmVwby9hY3Rpb25zL3J1bnMvMTIzNDUvcmVydW4tZmFpbGVkLWpvYnMnLFxuXHRcdFx0Ym9keTogdW5kZWZpbmVkLFxuXHRcdH0pO1xuXHR9KTtcbn0pO1xuXG5zdWl0ZSgnY29tcHV0ZU92ZXJhbGxDSVN0YXR1cycsICgpID0+IHtcblxuXHRlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUoKTtcblxuXHR0ZXN0KCdyZXR1cm5zIG5ldXRyYWwgZm9yIGVtcHR5IGNoZWNrcycsICgpID0+IHtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY29tcHV0ZU92ZXJhbGxDSVN0YXR1cyhbXSksIEdpdEh1YkNJT3ZlcmFsbFN0YXR1cy5OZXV0cmFsKTtcblx0fSk7XG5cblx0dGVzdCgncmV0dXJucyBzdWNjZXNzIHdoZW4gYWxsIGNvbXBsZXRlZCBzdWNjZXNzZnVsbHknLCAoKSA9PiB7XG5cdFx0Y29uc3QgY2hlY2tzID0gW1xuXHRcdFx0bWFrZUNoZWNrKHsgc3RhdHVzOiBHaXRIdWJDaGVja1N0YXR1cy5Db21wbGV0ZWQsIGNvbmNsdXNpb246IEdpdEh1YkNoZWNrQ29uY2x1c2lvbi5TdWNjZXNzIH0pLFxuXHRcdFx0bWFrZUNoZWNrKHsgc3RhdHVzOiBHaXRIdWJDaGVja1N0YXR1cy5Db21wbGV0ZWQsIGNvbmNsdXNpb246IEdpdEh1YkNoZWNrQ29uY2x1c2lvbi5OZXV0cmFsIH0pLFxuXHRcdF07XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNvbXB1dGVPdmVyYWxsQ0lTdGF0dXMoY2hlY2tzKSwgR2l0SHViQ0lPdmVyYWxsU3RhdHVzLlN1Y2Nlc3MpO1xuXHR9KTtcblxuXHR0ZXN0KCdyZXR1cm5zIGZhaWx1cmUgd2hlbiBhbnkgY2hlY2sgZmFpbGVkJywgKCkgPT4ge1xuXHRcdGNvbnN0IGNoZWNrcyA9IFtcblx0XHRcdG1ha2VDaGVjayh7IHN0YXR1czogR2l0SHViQ2hlY2tTdGF0dXMuQ29tcGxldGVkLCBjb25jbHVzaW9uOiBHaXRIdWJDaGVja0NvbmNsdXNpb24uU3VjY2VzcyB9KSxcblx0XHRcdG1ha2VDaGVjayh7IHN0YXR1czogR2l0SHViQ2hlY2tTdGF0dXMuQ29tcGxldGVkLCBjb25jbHVzaW9uOiBHaXRIdWJDaGVja0NvbmNsdXNpb24uRmFpbHVyZSB9KSxcblx0XHRdO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChjb21wdXRlT3ZlcmFsbENJU3RhdHVzKGNoZWNrcyksIEdpdEh1YkNJT3ZlcmFsbFN0YXR1cy5GYWlsdXJlKTtcblx0fSk7XG5cblx0dGVzdCgncmV0dXJucyBwZW5kaW5nIHdoZW4gYW55IGNoZWNrIGlzIGluIHByb2dyZXNzJywgKCkgPT4ge1xuXHRcdGNvbnN0IGNoZWNrcyA9IFtcblx0XHRcdG1ha2VDaGVjayh7IHN0YXR1czogR2l0SHViQ2hlY2tTdGF0dXMuQ29tcGxldGVkLCBjb25jbHVzaW9uOiBHaXRIdWJDaGVja0NvbmNsdXNpb24uU3VjY2VzcyB9KSxcblx0XHRcdG1ha2VDaGVjayh7IHN0YXR1czogR2l0SHViQ2hlY2tTdGF0dXMuSW5Qcm9ncmVzcywgY29uY2x1c2lvbjogdW5kZWZpbmVkIH0pLFxuXHRcdF07XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNvbXB1dGVPdmVyYWxsQ0lTdGF0dXMoY2hlY2tzKSwgR2l0SHViQ0lPdmVyYWxsU3RhdHVzLlBlbmRpbmcpO1xuXHR9KTtcblxuXHR0ZXN0KCdmYWlsdXJlIHRha2VzIHByZWNlZGVuY2Ugb3ZlciBwZW5kaW5nJywgKCkgPT4ge1xuXHRcdGNvbnN0IGNoZWNrcyA9IFtcblx0XHRcdG1ha2VDaGVjayh7IHN0YXR1czogR2l0SHViQ2hlY2tTdGF0dXMuQ29tcGxldGVkLCBjb25jbHVzaW9uOiBHaXRIdWJDaGVja0NvbmNsdXNpb24uRmFpbHVyZSB9KSxcblx0XHRcdG1ha2VDaGVjayh7IHN0YXR1czogR2l0SHViQ2hlY2tTdGF0dXMuSW5Qcm9ncmVzcywgY29uY2x1c2lvbjogdW5kZWZpbmVkIH0pLFxuXHRcdF07XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNvbXB1dGVPdmVyYWxsQ0lTdGF0dXMoY2hlY2tzKSwgR2l0SHViQ0lPdmVyYWxsU3RhdHVzLkZhaWx1cmUpO1xuXHR9KTtcbn0pO1xuXG5cbi8vI3JlZ2lvbiBUZXN0IEhlbHBlcnNcblxuZnVuY3Rpb24gbWFrZVBSKG92ZXJyaWRlczoge1xuXHRzdGF0ZTogR2l0SHViUHVsbFJlcXVlc3RTdGF0ZTtcblx0aXNEcmFmdDogYm9vbGVhbjtcblx0bWVyZ2VhYmxlOiBib29sZWFuIHwgdW5kZWZpbmVkO1xuXHRtZXJnZWFibGVTdGF0ZTogc3RyaW5nO1xufSk6IElHaXRIdWJQdWxsUmVxdWVzdCB7XG5cdHJldHVybiB7XG5cdFx0bnVtYmVyOiAxLFxuXHRcdHRpdGxlOiAnVGVzdCBQUicsXG5cdFx0Ym9keTogJ1Rlc3QgYm9keScsXG5cdFx0c3RhdGU6IG92ZXJyaWRlcy5zdGF0ZSxcblx0XHRhdXRob3I6IHsgbG9naW46ICdhdXRob3InLCBhdmF0YXJVcmw6ICcnIH0sXG5cdFx0aGVhZFJlZjogJ2ZlYXR1cmUnLFxuXHRcdGhlYWRTaGE6ICdhYmMxMjMnLFxuXHRcdGJhc2VSZWY6ICdtYWluJyxcblx0XHRpc0RyYWZ0OiBvdmVycmlkZXMuaXNEcmFmdCxcblx0XHRjcmVhdGVkQXQ6ICcyMDI0LTAxLTAxVDAwOjAwOjAwWicsXG5cdFx0dXBkYXRlZEF0OiAnMjAyNC0wMS0wMlQwMDowMDowMFonLFxuXHRcdG1lcmdlZEF0OiB1bmRlZmluZWQsXG5cdFx0bWVyZ2VhYmxlOiBvdmVycmlkZXMubWVyZ2VhYmxlLFxuXHRcdG1lcmdlYWJsZVN0YXRlOiBvdmVycmlkZXMubWVyZ2VhYmxlU3RhdGUsXG5cdH07XG59XG5cbmZ1bmN0aW9uIG1ha2VQdWxsUmVxdWVzdFNlYXJjaE5vZGUobnVtYmVyOiBudW1iZXIpOiB1bmtub3duIHtcblx0cmV0dXJuIHtcblx0XHRudW1iZXIsXG5cdFx0dGl0bGU6IGBQdWxsIHJlcXVlc3QgJHtudW1iZXJ9YCxcblx0XHRhdXRob3I6IHsgbG9naW46ICdhdXRob3InLCBhdmF0YXJVcmw6ICcnIH0sXG5cdFx0aGVhZFJlZk5hbWU6IGBmZWF0dXJlLSR7bnVtYmVyfWAsXG5cdFx0aXNEcmFmdDogZmFsc2UsXG5cdFx0dXBkYXRlZEF0OiAnMjAyNi0wNy0zMFQxMjowMDowMFonLFxuXHRcdGFkZGl0aW9uczogbnVtYmVyLFxuXHRcdGRlbGV0aW9uczogMSxcblx0fTtcbn1cblxuZnVuY3Rpb24gbWFrZVBSUmVzcG9uc2Uob3ZlcnJpZGVzOiB7XG5cdHN0YXRlOiAnb3BlbicgfCAnY2xvc2VkJztcblx0bWVyZ2VkOiBib29sZWFuO1xuXHRkcmFmdDogYm9vbGVhbjtcblx0bWVyZ2VhYmxlPzogYm9vbGVhbiB8IG51bGw7XG5cdG1lcmdlYWJsZV9zdGF0ZT86IHN0cmluZztcbn0pOiB1bmtub3duIHtcblx0cmV0dXJuIHtcblx0XHRudW1iZXI6IDEsXG5cdFx0dGl0bGU6ICdUZXN0IFBSJyxcblx0XHRib2R5OiAnVGVzdCBib2R5Jyxcblx0XHRzdGF0ZTogb3ZlcnJpZGVzLnN0YXRlLFxuXHRcdGRyYWZ0OiBvdmVycmlkZXMuZHJhZnQsXG5cdFx0dXNlcjogeyBsb2dpbjogJ2F1dGhvcicsIGF2YXRhcl91cmw6ICdodHRwczovL2V4YW1wbGUuY29tL2F2YXRhcicgfSxcblx0XHRoZWFkOiB7IHJlZjogJ2ZlYXR1cmUtYnJhbmNoJyB9LFxuXHRcdGJhc2U6IHsgcmVmOiAnbWFpbicgfSxcblx0XHRjcmVhdGVkX2F0OiAnMjAyNC0wMS0wMVQwMDowMDowMFonLFxuXHRcdHVwZGF0ZWRfYXQ6ICcyMDI0LTAxLTAyVDAwOjAwOjAwWicsXG5cdFx0bWVyZ2VkX2F0OiBvdmVycmlkZXMubWVyZ2VkID8gJzIwMjQtMDEtMDJUMDA6MDA6MDBaJyA6IG51bGwsXG5cdFx0bWVyZ2VhYmxlOiBvdmVycmlkZXMubWVyZ2VhYmxlID8/IHRydWUsXG5cdFx0bWVyZ2VhYmxlX3N0YXRlOiBvdmVycmlkZXMubWVyZ2VhYmxlX3N0YXRlID8/ICdjbGVhbicsXG5cdFx0bWVyZ2VkOiBvdmVycmlkZXMubWVyZ2VkLFxuXHR9O1xufVxuXG5mdW5jdGlvbiBtYWtlR3JhcGhRTFJldmlld1RocmVhZHNSZXNwb25zZSh0aHJlYWRzOiByZWFkb25seSBSZXR1cm5UeXBlPHR5cGVvZiBtYWtlR3JhcGhRTFJldmlld1RocmVhZD5bXSk6IHVua25vd24ge1xuXHRyZXR1cm4ge1xuXHRcdHJlcG9zaXRvcnk6IHtcblx0XHRcdHB1bGxSZXF1ZXN0OiB7XG5cdFx0XHRcdHJldmlld1RocmVhZHM6IHtcblx0XHRcdFx0XHRub2RlczogdGhyZWFkcyxcblx0XHRcdFx0fSxcblx0XHRcdH0sXG5cdFx0fSxcblx0fTtcbn1cblxuZnVuY3Rpb24gbWFrZUdyYXBoUUxSZXZpZXdUaHJlYWQob3ZlcnJpZGVzOiBQYXJ0aWFsPHtcblx0aWQ6IHN0cmluZztcblx0aXNSZXNvbHZlZDogYm9vbGVhbjtcblx0cGF0aDogc3RyaW5nO1xuXHRsaW5lOiBudW1iZXI7XG5cdGNvbW1lbnRzOiByZWFkb25seSBSZXR1cm5UeXBlPHR5cGVvZiBtYWtlR3JhcGhRTFJldmlld0NvbW1lbnQ+W107XG59PiA9IHt9KTogdW5rbm93biB7XG5cdHJldHVybiB7XG5cdFx0aWQ6IG92ZXJyaWRlcy5pZCA/PyAndGhyZWFkLTEnLFxuXHRcdGlzUmVzb2x2ZWQ6IG92ZXJyaWRlcy5pc1Jlc29sdmVkID8/IGZhbHNlLFxuXHRcdHBhdGg6IG92ZXJyaWRlcy5wYXRoID8/ICdzcmMvYS50cycsXG5cdFx0bGluZTogb3ZlcnJpZGVzLmxpbmUgPz8gMTAsXG5cdFx0Y29tbWVudHM6IHtcblx0XHRcdG5vZGVzOiBvdmVycmlkZXMuY29tbWVudHMgPz8gW21ha2VHcmFwaFFMUmV2aWV3Q29tbWVudCgpXSxcblx0XHR9LFxuXHR9O1xufVxuXG5mdW5jdGlvbiBtYWtlR3JhcGhRTFJldmlld0NvbW1lbnQob3ZlcnJpZGVzOiBQYXJ0aWFsPHtcblx0ZGF0YWJhc2VJZDogbnVtYmVyO1xuXHRib2R5OiBzdHJpbmc7XG5cdHBhdGg6IHN0cmluZztcblx0bGluZTogbnVtYmVyO1xuXHRyZXBseVRvRGF0YWJhc2VJZDogbnVtYmVyO1xufT4gPSB7fSk6IHVua25vd24ge1xuXHRyZXR1cm4ge1xuXHRcdGRhdGFiYXNlSWQ6IG92ZXJyaWRlcy5kYXRhYmFzZUlkID8/IDEwMCxcblx0XHRib2R5OiBvdmVycmlkZXMuYm9keSA/PyAnVGVzdCBjb21tZW50Jyxcblx0XHRjcmVhdGVkQXQ6ICcyMDI0LTAxLTAxVDAwOjAwOjAwWicsXG5cdFx0dXBkYXRlZEF0OiAnMjAyNC0wMS0wMVQwMDowMDowMFonLFxuXHRcdHBhdGg6IG92ZXJyaWRlcy5wYXRoID8/ICdzcmMvYS50cycsXG5cdFx0bGluZTogb3ZlcnJpZGVzLmxpbmUgPz8gMTAsXG5cdFx0b3JpZ2luYWxMaW5lOiBvdmVycmlkZXMubGluZSA/PyAxMCxcblx0XHRyZXBseVRvOiBvdmVycmlkZXMucmVwbHlUb0RhdGFiYXNlSWQgIT09IHVuZGVmaW5lZCA/IHsgZGF0YWJhc2VJZDogb3ZlcnJpZGVzLnJlcGx5VG9EYXRhYmFzZUlkIH0gOiBudWxsLFxuXHRcdGF1dGhvcjoge1xuXHRcdFx0bG9naW46ICdyZXZpZXdlcicsXG5cdFx0XHRhdmF0YXJVcmw6ICdodHRwczovL2V4YW1wbGUuY29tL2F2YXRhcicsXG5cdFx0fSxcblx0fTtcbn1cblxuZnVuY3Rpb24gbWFrZUNoZWNrKG92ZXJyaWRlczoge1xuXHRzdGF0dXM6IEdpdEh1YkNoZWNrU3RhdHVzO1xuXHRjb25jbHVzaW9uOiBHaXRIdWJDaGVja0NvbmNsdXNpb24gfCB1bmRlZmluZWQ7XG59KTogeyBpZDogbnVtYmVyOyBuYW1lOiBzdHJpbmc7IHN0YXR1czogR2l0SHViQ2hlY2tTdGF0dXM7IGNvbmNsdXNpb246IEdpdEh1YkNoZWNrQ29uY2x1c2lvbiB8IHVuZGVmaW5lZDsgc3RhcnRlZEF0OiBzdHJpbmcgfCB1bmRlZmluZWQ7IGNvbXBsZXRlZEF0OiBzdHJpbmcgfCB1bmRlZmluZWQ7IGRldGFpbHNVcmw6IHN0cmluZyB8IHVuZGVmaW5lZCB9IHtcblx0cmV0dXJuIHtcblx0XHRpZDogMSxcblx0XHRuYW1lOiAndGVzdC1jaGVjaycsXG5cdFx0c3RhdHVzOiBvdmVycmlkZXMuc3RhdHVzLFxuXHRcdGNvbmNsdXNpb246IG92ZXJyaWRlcy5jb25jbHVzaW9uLFxuXHRcdHN0YXJ0ZWRBdDogdW5kZWZpbmVkLFxuXHRcdGNvbXBsZXRlZEF0OiB1bmRlZmluZWQsXG5cdFx0ZGV0YWlsc1VybDogdW5kZWZpbmVkLFxuXHR9O1xufVxuXG4vLyNlbmRyZWdpb25cbiJdLAogICJtYXBwaW5ncyI6ICJBQUtBLE9BQU8sWUFBWTtBQUNuQixTQUFTLHlCQUF5QjtBQUNsQyxTQUFTLCtDQUErQztBQUN4RCxTQUFTLHVCQUF1QjtBQUNoQyxTQUFTLGlCQUFpQiwyQkFBMkI7QUFDckQsU0FBUyx1Q0FBdUM7QUFDaEQsU0FBUyxpQ0FBaUM7QUFDMUMsU0FBUyxtQkFBbUIsOEJBQThCO0FBQzFELFNBQVMsbUNBQW1DO0FBQzVDLFNBQVMsK0JBQStCO0FBQ3hDLFNBQTBCLHNCQUFnRDtBQUMxRSxTQUFTLHVCQUF1QixtQkFBbUIsdUJBQXVCLHdCQUFzRSx3QkFBd0I7QUFFeEssTUFBTSxjQUFjO0FBQUEsRUFBcEI7QUFHQyxTQUFRLGFBQXdCLENBQUM7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
