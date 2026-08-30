import assert from "assert";
import { DeferredPromise, timeout } from "../../../../../base/common/async.js";
import { DisposableStore } from "../../../../../base/common/lifecycle.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../../base/test/common/utils.js";
import { runWithFakedTimers } from "../../../../../base/test/common/timeTravelScheduler.js";
import { NullLogService } from "../../../../../platform/log/common/log.js";
import { TestStorageService } from "../../../../../workbench/test/common/workbenchTestServices.js";
import { GitHubPullRequestModel } from "../../browser/models/githubPullRequestModel.js";
import { GitHubPullRequestReviewThreadsModel } from "../../browser/models/githubPullRequestReviewThreadsModel.js";
import { GitHubPullRequestCIModel, GitHubPullRequestCIModelReferenceCollection, parseWorkflowRunId } from "../../browser/models/githubPullRequestCIModel.js";
import { GitHubIssueModelReferenceCollection, MIN_REFRESH_INTERVAL_MS } from "../../browser/models/githubIssueModel.js";
import { GitHubRepositoryModel } from "../../browser/models/githubRepositoryModel.js";
import { GitHubCIOverallStatus, GitHubCheckConclusion, GitHubCheckStatus, GitHubIssueState, GitHubPullRequestState } from "../../common/types.js";
class MockRepositoryFetcher {
  constructor() {
    this.getRepositoryCalls = 0;
  }
  async getRepository(_owner, _repo, _etag) {
    this.getRepositoryCalls++;
    await this.getRepositoryGate?.p;
    if (!this.nextResult) {
      throw new Error("No mock result");
    }
    return { data: this.nextResult, statusCode: 200 };
  }
}
class MockPRFetcher {
  constructor() {
    this.nextReviews = [];
    this.nextThreads = [];
    this.getPullRequestCalls = 0;
    this.getReviewsCalls = 0;
    this.getReviewThreadsCalls = 0;
    this.postReviewCommentCalls = [];
    this.postIssueCommentCalls = [];
    this.resolveThreadCalls = [];
  }
  async getPullRequest(_owner, _repo, _prNumber, _etag) {
    this.getPullRequestCalls++;
    await this.getPullRequestGate?.p;
    if (!this.nextPR) {
      throw new Error("No mock PR");
    }
    return { data: this.nextPR, statusCode: 200 };
  }
  async getReviews(_owner, _repo, _prNumber, _etag) {
    this.getReviewsCalls++;
    return { data: this.nextReviews, statusCode: 200 };
  }
  async getReviewThreads(_owner, _repo, _prNumber) {
    this.getReviewThreadsCalls++;
    const result = this.nextThreads;
    await this.getReviewThreadsGate?.p;
    return result;
  }
  async postReviewComment(_owner, _repo, _prNumber, body, inReplyTo) {
    this.postReviewCommentCalls.push({ body, inReplyTo });
    return makeComment(999, body);
  }
  async postIssueComment(_owner, _repo, _prNumber, body) {
    this.postIssueCommentCalls.push({ body });
    return makeComment(998, body);
  }
  async resolveThread(_owner, _repo, threadId) {
    this.resolveThreadCalls.push({ threadId });
  }
}
class MockCIFetcher {
  constructor() {
    this.nextChecks = [];
    this.getCheckRunsCalls = 0;
  }
  async getCheckRuns(_owner, _repo, _ref, _etag) {
    this.getCheckRunsCalls++;
    const result = this.nextChecks;
    await this.getCheckRunsGate?.p;
    return { data: result, statusCode: 200 };
  }
  async rerunFailedJobs(_owner, _repo, _runId) {
  }
  async getCheckRunAnnotations(_owner, _repo, _checkRunId) {
    return "mock annotations";
  }
}
suite("GitHubRepositoryModel", () => {
  const store = new DisposableStore();
  let mockFetcher;
  const logService = new NullLogService();
  setup(() => {
    mockFetcher = new MockRepositoryFetcher();
  });
  teardown(() => store.clear());
  ensureNoDisposablesAreLeakedInTestSuite();
  test("initial state is undefined", () => {
    const model = store.add(new GitHubRepositoryModel("owner", "repo", mockFetcher, logService));
    assert.strictEqual(model.repository.get(), void 0);
  });
  test("refresh populates repository observable", async () => {
    const model = store.add(new GitHubRepositoryModel("owner", "repo", mockFetcher, logService));
    mockFetcher.nextResult = {
      owner: "owner",
      name: "repo",
      fullName: "owner/repo",
      defaultBranch: "main",
      isPrivate: false,
      description: "test"
    };
    await model.refresh();
    assert.deepStrictEqual(model.repository.get(), mockFetcher.nextResult);
  });
  test("refresh shares an in-progress request", async () => {
    const model = store.add(new GitHubRepositoryModel("owner", "repo", mockFetcher, logService));
    mockFetcher.nextResult = makeRepository();
    mockFetcher.getRepositoryGate = new DeferredPromise();
    const firstRefresh = model.refresh();
    const secondRefresh = model.refresh();
    try {
      assert.deepStrictEqual({
        samePromise: firstRefresh === secondRefresh,
        getRepositoryCalls: mockFetcher.getRepositoryCalls
      }, {
        samePromise: true,
        getRepositoryCalls: 1
      });
    } finally {
      await mockFetcher.getRepositoryGate.complete(void 0);
    }
    await firstRefresh;
    assert.deepStrictEqual({
      repository: model.repository.get(),
      getRepositoryCalls: mockFetcher.getRepositoryCalls
    }, {
      repository: mockFetcher.nextResult,
      getRepositoryCalls: 1
    });
  });
  test("refresh handles errors gracefully", async () => {
    const model = store.add(new GitHubRepositoryModel("owner", "repo", mockFetcher, logService));
    await model.refresh();
    assert.strictEqual(model.repository.get(), void 0);
  });
});
suite("GitHubPullRequestModel", () => {
  const store = new DisposableStore();
  let mockFetcher;
  const logService = new NullLogService();
  setup(() => {
    mockFetcher = new MockPRFetcher();
  });
  teardown(() => store.clear());
  ensureNoDisposablesAreLeakedInTestSuite();
  test("initial state has empty observables", () => {
    const model = store.add(new GitHubPullRequestModel("owner", "repo", 1, mockFetcher, logService));
    assert.strictEqual(model.pullRequest.get(), void 0);
    assert.strictEqual(model.mergeability.get(), void 0);
  });
  test("refresh populates pull request and mergeability without fetching review threads", async () => {
    const model = store.add(new GitHubPullRequestModel("owner", "repo", 1, mockFetcher, logService));
    mockFetcher.nextPR = makePR();
    mockFetcher.nextReviews = [];
    mockFetcher.nextThreads = [makeThread("thread-100", "src/a.ts")];
    await model.refresh();
    assert.deepStrictEqual({
      prNumber: model.pullRequest.get()?.number,
      canMerge: model.mergeability.get()?.canMerge,
      getPullRequestCalls: mockFetcher.getPullRequestCalls,
      getReviewsCalls: mockFetcher.getReviewsCalls,
      getReviewThreadsCalls: mockFetcher.getReviewThreadsCalls
    }, {
      prNumber: 1,
      canMerge: true,
      getPullRequestCalls: 1,
      getReviewsCalls: 1,
      getReviewThreadsCalls: 0
    });
  });
  test("refresh shares an in-progress request", async () => {
    const model = store.add(new GitHubPullRequestModel("owner", "repo", 1, mockFetcher, logService));
    mockFetcher.nextPR = makePR();
    mockFetcher.nextReviews = [];
    mockFetcher.getPullRequestGate = new DeferredPromise();
    const firstRefresh = model.refresh();
    const secondRefresh = model.refresh();
    try {
      assert.deepStrictEqual({
        samePromise: firstRefresh === secondRefresh,
        getPullRequestCalls: mockFetcher.getPullRequestCalls,
        getReviewsCalls: mockFetcher.getReviewsCalls
      }, {
        samePromise: true,
        getPullRequestCalls: 1,
        getReviewsCalls: 1
      });
    } finally {
      await mockFetcher.getPullRequestGate.complete(void 0);
    }
    await firstRefresh;
    assert.deepStrictEqual({
      prNumber: model.pullRequest.get()?.number,
      getPullRequestCalls: mockFetcher.getPullRequestCalls,
      getReviewsCalls: mockFetcher.getReviewsCalls
    }, {
      prNumber: 1,
      getPullRequestCalls: 1,
      getReviewsCalls: 1
    });
  });
  test("postIssueComment calls fetcher", async () => {
    const model = store.add(new GitHubPullRequestModel("owner", "repo", 1, mockFetcher, logService));
    const comment = await model.postIssueComment("Great work!");
    assert.strictEqual(comment.body, "Great work!");
    assert.strictEqual(mockFetcher.postIssueCommentCalls.length, 1);
  });
  test("polling can be started and stopped", () => {
    const model = store.add(new GitHubPullRequestModel("owner", "repo", 1, mockFetcher, logService));
    const polling = model.startPolling(6e4);
    polling.dispose();
    polling.dispose();
  });
  test("polling stops when the last client stops polling", () => runWithFakedTimers({ useFakeTimers: true }, async () => {
    const model = store.add(new GitHubPullRequestModel("owner", "repo", 1, mockFetcher, logService));
    mockFetcher.nextPR = makePR();
    mockFetcher.nextReviews = [];
    mockFetcher.getPullRequestGate = new DeferredPromise();
    const firstPolling = model.startPolling(10);
    const secondPolling = model.startPolling(1e3);
    firstPolling.dispose();
    await timeout(10);
    assert.deepStrictEqual({
      getPullRequestCalls: mockFetcher.getPullRequestCalls,
      getReviewsCalls: mockFetcher.getReviewsCalls
    }, {
      getPullRequestCalls: 1,
      getReviewsCalls: 1
    });
    await mockFetcher.getPullRequestGate.complete(void 0);
    await timeout(0);
    await timeout(6e4);
    assert.deepStrictEqual({
      getPullRequestCalls: mockFetcher.getPullRequestCalls,
      getReviewsCalls: mockFetcher.getReviewsCalls
    }, {
      getPullRequestCalls: 2,
      getReviewsCalls: 2
    });
    secondPolling.dispose();
    await timeout(6e4);
    assert.deepStrictEqual({
      getPullRequestCalls: mockFetcher.getPullRequestCalls,
      getReviewsCalls: mockFetcher.getReviewsCalls
    }, {
      getPullRequestCalls: 2,
      getReviewsCalls: 2
    });
  }));
});
suite("GitHubPullRequestReviewThreadsModel", () => {
  const store = new DisposableStore();
  let mockFetcher;
  const logService = new NullLogService();
  setup(() => {
    mockFetcher = new MockPRFetcher();
  });
  teardown(() => store.clear());
  ensureNoDisposablesAreLeakedInTestSuite();
  test("initial state is empty", () => {
    const model = store.add(new GitHubPullRequestReviewThreadsModel("owner", "repo", 1, mockFetcher, logService));
    assert.deepStrictEqual(model.reviewThreads.get(), []);
  });
  test("refresh updates only review threads", async () => {
    const model = store.add(new GitHubPullRequestReviewThreadsModel("owner", "repo", 1, mockFetcher, logService));
    mockFetcher.nextThreads = [makeThread("thread-100", "src/a.ts"), makeThread("thread-200", "src/b.ts")];
    await model.refresh();
    assert.deepStrictEqual({
      threads: model.reviewThreads.get().map((thread) => thread.id),
      getPullRequestCalls: mockFetcher.getPullRequestCalls,
      getReviewsCalls: mockFetcher.getReviewsCalls,
      getReviewThreadsCalls: mockFetcher.getReviewThreadsCalls
    }, {
      threads: ["thread-100", "thread-200"],
      getPullRequestCalls: 0,
      getReviewsCalls: 0,
      getReviewThreadsCalls: 1
    });
  });
  test("refresh shares an in-progress request", async () => {
    const model = store.add(new GitHubPullRequestReviewThreadsModel("owner", "repo", 1, mockFetcher, logService));
    mockFetcher.nextThreads = [makeThread("thread-100", "src/a.ts")];
    mockFetcher.getReviewThreadsGate = new DeferredPromise();
    const firstRefresh = model.refresh();
    const secondRefresh = model.refresh();
    try {
      assert.deepStrictEqual({
        samePromise: firstRefresh === secondRefresh,
        getReviewThreadsCalls: mockFetcher.getReviewThreadsCalls
      }, {
        samePromise: true,
        getReviewThreadsCalls: 1
      });
    } finally {
      await mockFetcher.getReviewThreadsGate.complete(void 0);
    }
    await firstRefresh;
    assert.deepStrictEqual({
      threads: model.reviewThreads.get().map((thread) => thread.id),
      getReviewThreadsCalls: mockFetcher.getReviewThreadsCalls
    }, {
      threads: ["thread-100"],
      getReviewThreadsCalls: 1
    });
  });
  test("postReviewComment calls fetcher and refreshes threads", async () => {
    const model = store.add(new GitHubPullRequestReviewThreadsModel("owner", "repo", 1, mockFetcher, logService));
    mockFetcher.nextThreads = [makeThread("thread-100", "src/a.ts")];
    const comment = await model.postReviewComment("LGTM", 100);
    assert.deepStrictEqual({
      commentBody: comment.body,
      postReviewCommentCalls: mockFetcher.postReviewCommentCalls,
      threads: model.reviewThreads.get().map((thread) => thread.id)
    }, {
      commentBody: "LGTM",
      postReviewCommentCalls: [{ body: "LGTM", inReplyTo: 100 }],
      threads: ["thread-100"]
    });
  });
  test("postReviewComment refreshes after an in-progress refresh completes", async () => {
    const model = store.add(new GitHubPullRequestReviewThreadsModel("owner", "repo", 1, mockFetcher, logService));
    mockFetcher.nextThreads = [makeThread("thread-100", "src/a.ts")];
    mockFetcher.getReviewThreadsGate = new DeferredPromise();
    const inProgressRefresh = model.refresh();
    mockFetcher.nextThreads = [makeThread("thread-200", "src/b.ts")];
    const comment = model.postReviewComment("LGTM", 100);
    await mockFetcher.getReviewThreadsGate.complete(void 0);
    await inProgressRefresh;
    await comment;
    assert.deepStrictEqual({
      postReviewCommentCalls: mockFetcher.postReviewCommentCalls,
      threads: model.reviewThreads.get().map((thread) => thread.id),
      getReviewThreadsCalls: mockFetcher.getReviewThreadsCalls
    }, {
      postReviewCommentCalls: [{ body: "LGTM", inReplyTo: 100 }],
      threads: ["thread-200"],
      getReviewThreadsCalls: 2
    });
  });
  test("resolveThread calls fetcher and refreshes threads", async () => {
    const model = store.add(new GitHubPullRequestReviewThreadsModel("owner", "repo", 1, mockFetcher, logService));
    mockFetcher.nextThreads = [];
    await model.resolveThread("thread-100");
    assert.deepStrictEqual({
      resolveThreadCalls: mockFetcher.resolveThreadCalls,
      getReviewThreadsCalls: mockFetcher.getReviewThreadsCalls,
      threads: model.reviewThreads.get()
    }, {
      resolveThreadCalls: [{ threadId: "thread-100" }],
      getReviewThreadsCalls: 1,
      threads: []
    });
  });
  test("resolveThread refreshes after an in-progress refresh completes", async () => {
    const model = store.add(new GitHubPullRequestReviewThreadsModel("owner", "repo", 1, mockFetcher, logService));
    mockFetcher.nextThreads = [makeThread("thread-100", "src/a.ts")];
    mockFetcher.getReviewThreadsGate = new DeferredPromise();
    const inProgressRefresh = model.refresh();
    mockFetcher.nextThreads = [];
    const resolveThread = model.resolveThread("thread-100");
    await mockFetcher.getReviewThreadsGate.complete(void 0);
    await inProgressRefresh;
    await resolveThread;
    assert.deepStrictEqual({
      resolveThreadCalls: mockFetcher.resolveThreadCalls,
      threads: model.reviewThreads.get().map((thread) => thread.id),
      getReviewThreadsCalls: mockFetcher.getReviewThreadsCalls
    }, {
      resolveThreadCalls: [{ threadId: "thread-100" }],
      threads: [],
      getReviewThreadsCalls: 2
    });
  });
  test("polling can be started and stopped", () => {
    const model = store.add(new GitHubPullRequestReviewThreadsModel("owner", "repo", 1, mockFetcher, logService));
    const polling = model.startPolling(6e4);
    polling.dispose();
    polling.dispose();
  });
  test("polling stops when the last client stops polling", () => runWithFakedTimers({ useFakeTimers: true }, async () => {
    const model = store.add(new GitHubPullRequestReviewThreadsModel("owner", "repo", 1, mockFetcher, logService));
    mockFetcher.nextThreads = [makeThread("thread-100", "src/a.ts")];
    mockFetcher.getReviewThreadsGate = new DeferredPromise();
    const firstPolling = model.startPolling(10);
    const secondPolling = model.startPolling(1e3);
    firstPolling.dispose();
    await timeout(10);
    assert.strictEqual(mockFetcher.getReviewThreadsCalls, 1);
    await mockFetcher.getReviewThreadsGate.complete(void 0);
    await timeout(0);
    await timeout(6e4);
    assert.strictEqual(mockFetcher.getReviewThreadsCalls, 2);
    secondPolling.dispose();
    await timeout(6e4);
    assert.strictEqual(mockFetcher.getReviewThreadsCalls, 2);
  }));
});
suite("GitHubPullRequestCIModel", () => {
  const store = new DisposableStore();
  let mockFetcher;
  let collection;
  let storageService;
  const logService = new NullLogService();
  function acquireModel(owner = "owner", repo = "repo", prNumber = 1, headSha = "abc") {
    const ref = collection.acquire(`${owner}/${repo}/${prNumber}/${headSha}`, owner, repo, prNumber, headSha);
    store.add(ref);
    return ref.object;
  }
  setup(() => {
    mockFetcher = new MockCIFetcher();
    storageService = store.add(new TestStorageService());
    collection = new TestCIReferenceCollection(mockFetcher, logService, storageService);
  });
  teardown(() => store.clear());
  ensureNoDisposablesAreLeakedInTestSuite();
  test("initial state is empty", () => {
    const model = acquireModel();
    assert.deepStrictEqual(model.checks.get(), []);
    assert.strictEqual(model.overallStatus.get(), GitHubCIOverallStatus.Neutral);
  });
  test("acquiring with the same key returns the same model", () => {
    const first = acquireModel();
    const second = acquireModel();
    assert.strictEqual(first, second);
  });
  test("fixRequested is remembered per PR head commit", () => {
    const model = acquireModel("owner", "repo", 1, "sha-1");
    assert.strictEqual(model.fixRequested.get(), false);
    model.markFixRequested();
    assert.strictEqual(model.fixRequested.get(), true);
    const reloadedSameCommit = store.add(new GitHubPullRequestCIModel("owner", "repo", 1, "sha-1", mockFetcher, logService, storageService));
    assert.strictEqual(reloadedSameCommit.fixRequested.get(), true);
    const newCommit = store.add(new GitHubPullRequestCIModel("owner", "repo", 1, "sha-2", mockFetcher, logService, storageService));
    assert.strictEqual(newCommit.fixRequested.get(), false);
  });
  test("refresh populates checks and computes overall status", async () => {
    const model = acquireModel();
    mockFetcher.nextChecks = [
      { id: 1, name: "build", status: GitHubCheckStatus.Completed, conclusion: GitHubCheckConclusion.Success, startedAt: void 0, completedAt: void 0, detailsUrl: void 0 },
      { id: 2, name: "test", status: GitHubCheckStatus.Completed, conclusion: GitHubCheckConclusion.Failure, startedAt: void 0, completedAt: void 0, detailsUrl: void 0 }
    ];
    await model.refresh();
    assert.strictEqual(model.checks.get().length, 2);
    assert.strictEqual(model.overallStatus.get(), GitHubCIOverallStatus.Failure);
  });
  test("refresh shares an in-progress request", async () => {
    const model = acquireModel();
    mockFetcher.nextChecks = [
      { id: 1, name: "build", status: GitHubCheckStatus.Completed, conclusion: GitHubCheckConclusion.Success, startedAt: void 0, completedAt: void 0, detailsUrl: void 0 }
    ];
    mockFetcher.getCheckRunsGate = new DeferredPromise();
    const firstRefresh = model.refresh();
    const secondRefresh = model.refresh();
    try {
      assert.deepStrictEqual({
        samePromise: firstRefresh === secondRefresh,
        getCheckRunsCalls: mockFetcher.getCheckRunsCalls
      }, {
        samePromise: true,
        getCheckRunsCalls: 1
      });
    } finally {
      await mockFetcher.getCheckRunsGate.complete(void 0);
    }
    await firstRefresh;
    assert.deepStrictEqual({
      checks: model.checks.get().map((check) => check.id),
      getCheckRunsCalls: mockFetcher.getCheckRunsCalls
    }, {
      checks: [1],
      getCheckRunsCalls: 1
    });
  });
  test("getCheckRunAnnotations delegates to fetcher", async () => {
    const model = acquireModel();
    const result = await model.getCheckRunAnnotations(1);
    assert.strictEqual(result, "mock annotations");
  });
  test("rerunFailedCheck refreshes after an in-progress refresh completes", async () => {
    const model = acquireModel();
    mockFetcher.nextChecks = [
      { id: 1, name: "build", status: GitHubCheckStatus.Completed, conclusion: GitHubCheckConclusion.Failure, startedAt: void 0, completedAt: void 0, detailsUrl: "https://github.com/owner/repo/actions/runs/12345/job/67890" }
    ];
    mockFetcher.getCheckRunsGate = new DeferredPromise();
    const inProgressRefresh = model.refresh();
    mockFetcher.nextChecks = [
      { id: 1, name: "build", status: GitHubCheckStatus.Completed, conclusion: GitHubCheckConclusion.Success, startedAt: void 0, completedAt: void 0, detailsUrl: "https://github.com/owner/repo/actions/runs/12345/job/67890" }
    ];
    const rerun = model.rerunFailedCheck({ id: 1, name: "build", status: GitHubCheckStatus.Completed, conclusion: GitHubCheckConclusion.Failure, startedAt: void 0, completedAt: void 0, detailsUrl: "https://github.com/owner/repo/actions/runs/12345/job/67890" });
    await mockFetcher.getCheckRunsGate.complete(void 0);
    await inProgressRefresh;
    await rerun;
    assert.deepStrictEqual({
      checks: model.checks.get().map((check) => check.conclusion),
      getCheckRunsCalls: mockFetcher.getCheckRunsCalls
    }, {
      checks: [GitHubCheckConclusion.Success],
      getCheckRunsCalls: 2
    });
  });
  test("polling stops when the last client stops polling", () => runWithFakedTimers({ useFakeTimers: true }, async () => {
    const model = acquireModel();
    mockFetcher.nextChecks = [
      { id: 1, name: "build", status: GitHubCheckStatus.Completed, conclusion: GitHubCheckConclusion.Success, startedAt: void 0, completedAt: void 0, detailsUrl: void 0 }
    ];
    mockFetcher.getCheckRunsGate = new DeferredPromise();
    const firstPolling = model.startPolling(10);
    const secondPolling = model.startPolling(1e3);
    firstPolling.dispose();
    await timeout(10);
    assert.strictEqual(mockFetcher.getCheckRunsCalls, 1);
    await mockFetcher.getCheckRunsGate.complete(void 0);
    await timeout(0);
    await timeout(6e4);
    assert.strictEqual(mockFetcher.getCheckRunsCalls, 2);
    secondPolling.dispose();
    await timeout(6e4);
    assert.strictEqual(mockFetcher.getCheckRunsCalls, 2);
  }));
});
suite("GitHubIssueModel", () => {
  const store = new DisposableStore();
  const logService = new NullLogService();
  class MockGitHubApiClient {
    constructor() {
      this.sentETags = [];
      this.responses = [];
    }
    async request(_method, _path, _callSite, options) {
      this.sentETags.push(options?.etag);
      return this.responses.shift() ?? { data: void 0, statusCode: 304 };
    }
  }
  function issueResponse(state, title) {
    return {
      number: 7,
      title,
      body: "body",
      state,
      state_reason: state === "closed" ? "completed" : null,
      user: { login: "octocat", avatar_url: "" },
      created_at: "2026-01-01T00:00:00Z",
      updated_at: "2026-01-02T00:00:00Z",
      closed_at: null
    };
  }
  function createCollection(client) {
    return new GitHubIssueModelReferenceCollection(client, logService);
  }
  teardown(() => store.clear());
  ensureNoDisposablesAreLeakedInTestSuite();
  test("revalidates with the stored ETag and keeps the last payload on 304", () => runWithFakedTimers({ useFakeTimers: true }, async () => {
    const client = new MockGitHubApiClient();
    client.responses.push({ data: issueResponse("open", "Original"), statusCode: 200, etag: 'W/"v1"' });
    client.responses.push({ data: void 0, statusCode: 304, etag: 'W/"v1"' });
    const collection = createCollection(client);
    const reference = store.add(collection.acquire("owner/repo/issues/7", "owner", "repo", 7));
    await reference.object.refresh();
    await timeout(MIN_REFRESH_INTERVAL_MS);
    await reference.object.refresh();
    assert.deepStrictEqual({
      sentETags: client.sentETags,
      title: reference.object.issue.get()?.title
    }, {
      sentETags: [void 0, 'W/"v1"'],
      title: "Original"
    });
  }));
  test("on-demand refreshes inside the debounce window collapse into one request", () => runWithFakedTimers({ useFakeTimers: true }, async () => {
    const client = new MockGitHubApiClient();
    client.responses.push({ data: issueResponse("open", "Original"), statusCode: 200, etag: 'W/"v1"' });
    const collection = createCollection(client);
    const reference = store.add(collection.acquire("owner/repo/issues/7", "owner", "repo", 7));
    await reference.object.refresh();
    await timeout(MIN_REFRESH_INTERVAL_MS - 1);
    await reference.object.refresh();
    assert.strictEqual(client.sentETags.length, 1);
  }));
  test("a re-created model starts from the previous one's payload and ETag", () => runWithFakedTimers({ useFakeTimers: true }, async () => {
    const client = new MockGitHubApiClient();
    client.responses.push({ data: issueResponse("open", "Original"), statusCode: 200, etag: 'W/"v1"' });
    client.responses.push({ data: issueResponse("closed", "Original"), statusCode: 200, etag: 'W/"v2"' });
    const collection = createCollection(client);
    const first = collection.acquire("owner/repo/issues/7", "owner", "repo", 7);
    await first.object.refresh();
    first.dispose();
    const second = store.add(collection.acquire("owner/repo/issues/7", "owner", "repo", 7));
    const restoredState = second.object.issue.get()?.state;
    await timeout(MIN_REFRESH_INTERVAL_MS);
    await second.object.refresh();
    assert.deepStrictEqual({
      restoredState,
      sentETags: client.sentETags,
      state: second.object.issue.get()?.state
    }, {
      restoredState: GitHubIssueState.Open,
      sentETags: [void 0, 'W/"v1"'],
      state: GitHubIssueState.Closed
    });
  }));
});
suite("parseWorkflowRunId", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  test("extracts run ID from GitHub Actions URL", () => {
    assert.strictEqual(
      parseWorkflowRunId("https://github.com/microsoft/vscode/actions/runs/12345/job/67890"),
      12345
    );
  });
  test("extracts run ID from URL without job segment", () => {
    assert.strictEqual(
      parseWorkflowRunId("https://github.com/owner/repo/actions/runs/99999"),
      99999
    );
  });
  test("returns undefined for non-Actions URL", () => {
    assert.strictEqual(parseWorkflowRunId("https://example.com/check/1"), void 0);
  });
  test("returns undefined for undefined input", () => {
    assert.strictEqual(parseWorkflowRunId(void 0), void 0);
  });
});
class TestCIReferenceCollection extends GitHubPullRequestCIModelReferenceCollection {
  constructor(_testFetcher, logService, _testStorageService) {
    super(void 0, logService, _testStorageService);
    this._testFetcher = _testFetcher;
    this._testStorageService = _testStorageService;
  }
  createReferencedObject(_key, owner, repo, prNumber, headSha) {
    return new GitHubPullRequestCIModel(owner, repo, prNumber, headSha, this._testFetcher, new NullLogService(), this._testStorageService);
  }
}
function makeRepository() {
  return {
    owner: "owner",
    name: "repo",
    fullName: "owner/repo",
    defaultBranch: "main",
    isPrivate: false,
    description: "test"
  };
}
function makePR() {
  return {
    number: 1,
    title: "Test PR",
    body: "Test body",
    state: GitHubPullRequestState.Open,
    author: { login: "author", avatarUrl: "" },
    headRef: "feature",
    headSha: "abc123",
    baseRef: "main",
    isDraft: false,
    createdAt: "2024-01-01T00:00:00Z",
    updatedAt: "2024-01-02T00:00:00Z",
    mergedAt: void 0,
    mergeable: true,
    mergeableState: "clean"
  };
}
function makeThread(id, path) {
  return {
    id,
    isResolved: false,
    path,
    line: 10,
    comments: [makeComment(100, `Comment on ${path}`, id)]
  };
}
function makeComment(id, body, threadId = String(id)) {
  return {
    id,
    body,
    author: { login: "reviewer", avatarUrl: "" },
    createdAt: "2024-01-01T00:00:00Z",
    updatedAt: "2024-01-01T00:00:00Z",
    path: void 0,
    line: void 0,
    threadId,
    inReplyToId: void 0
  };
}
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxzZXNzaW9uc1xcY29udHJpYlxcZ2l0aHViXFx0ZXN0XFxicm93c2VyXFxnaXRodWJNb2RlbHMudGVzdC50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCBhc3NlcnQgZnJvbSAnYXNzZXJ0JztcbmltcG9ydCB7IERlZmVycmVkUHJvbWlzZSwgdGltZW91dCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2FzeW5jLmpzJztcbmltcG9ydCB7IERpc3Bvc2FibGVTdG9yZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL3Rlc3QvY29tbW9uL3V0aWxzLmpzJztcbmltcG9ydCB7IHJ1bldpdGhGYWtlZFRpbWVycyB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvdGVzdC9jb21tb24vdGltZVRyYXZlbFNjaGVkdWxlci5qcyc7XG5pbXBvcnQgeyBOdWxsTG9nU2VydmljZSwgSUxvZ1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9sb2cvY29tbW9uL2xvZy5qcyc7XG5pbXBvcnQgeyBJU3RvcmFnZVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9zdG9yYWdlL2NvbW1vbi9zdG9yYWdlLmpzJztcbmltcG9ydCB7IFRlc3RTdG9yYWdlU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3dvcmtiZW5jaC90ZXN0L2NvbW1vbi93b3JrYmVuY2hUZXN0U2VydmljZXMuanMnO1xuaW1wb3J0IHsgR2l0SHViUHVsbFJlcXVlc3RNb2RlbCB9IGZyb20gJy4uLy4uL2Jyb3dzZXIvbW9kZWxzL2dpdGh1YlB1bGxSZXF1ZXN0TW9kZWwuanMnO1xuaW1wb3J0IHsgR2l0SHViUHVsbFJlcXVlc3RSZXZpZXdUaHJlYWRzTW9kZWwgfSBmcm9tICcuLi8uLi9icm93c2VyL21vZGVscy9naXRodWJQdWxsUmVxdWVzdFJldmlld1RocmVhZHNNb2RlbC5qcyc7XG5pbXBvcnQgeyBHaXRIdWJQdWxsUmVxdWVzdENJTW9kZWwsIEdpdEh1YlB1bGxSZXF1ZXN0Q0lNb2RlbFJlZmVyZW5jZUNvbGxlY3Rpb24sIHBhcnNlV29ya2Zsb3dSdW5JZCB9IGZyb20gJy4uLy4uL2Jyb3dzZXIvbW9kZWxzL2dpdGh1YlB1bGxSZXF1ZXN0Q0lNb2RlbC5qcyc7XG5pbXBvcnQgeyBHaXRIdWJJc3N1ZU1vZGVsUmVmZXJlbmNlQ29sbGVjdGlvbiwgTUlOX1JFRlJFU0hfSU5URVJWQUxfTVMgfSBmcm9tICcuLi8uLi9icm93c2VyL21vZGVscy9naXRodWJJc3N1ZU1vZGVsLmpzJztcbmltcG9ydCB7IEdpdEh1YlJlcG9zaXRvcnlNb2RlbCB9IGZyb20gJy4uLy4uL2Jyb3dzZXIvbW9kZWxzL2dpdGh1YlJlcG9zaXRvcnlNb2RlbC5qcyc7XG5pbXBvcnQgeyBHaXRIdWJBcGlDbGllbnQgfSBmcm9tICcuLi8uLi9icm93c2VyL2dpdGh1YkFwaUNsaWVudC5qcyc7XG5pbXBvcnQgeyBHaXRIdWJQUkZldGNoZXIgfSBmcm9tICcuLi8uLi9icm93c2VyL2ZldGNoZXJzL2dpdGh1YlBSRmV0Y2hlci5qcyc7XG5pbXBvcnQgeyBHaXRIdWJQUkNJRmV0Y2hlciB9IGZyb20gJy4uLy4uL2Jyb3dzZXIvZmV0Y2hlcnMvZ2l0aHViUFJDSUZldGNoZXIuanMnO1xuaW1wb3J0IHsgR2l0SHViUmVwb3NpdG9yeUZldGNoZXIgfSBmcm9tICcuLi8uLi9icm93c2VyL2ZldGNoZXJzL2dpdGh1YlJlcG9zaXRvcnlGZXRjaGVyLmpzJztcbmltcG9ydCB7IEdpdEh1YkNJT3ZlcmFsbFN0YXR1cywgR2l0SHViQ2hlY2tDb25jbHVzaW9uLCBHaXRIdWJDaGVja1N0YXR1cywgR2l0SHViSXNzdWVTdGF0ZSwgR2l0SHViUHVsbFJlcXVlc3RTdGF0ZSwgSUdpdEh1YkNJQ2hlY2ssIElHaXRIdWJQUkNvbW1lbnQsIElHaXRIdWJQdWxsUmVxdWVzdFJldmlldywgSUdpdEh1YlB1bGxSZXF1ZXN0LCBJR2l0SHViUmVwb3NpdG9yeSwgSUdpdEh1YlB1bGxSZXF1ZXN0UmV2aWV3VGhyZWFkIH0gZnJvbSAnLi4vLi4vY29tbW9uL3R5cGVzLmpzJztcblxuLy8jcmVnaW9uIE1vY2sgRmV0Y2hlcnNcblxuY2xhc3MgTW9ja1JlcG9zaXRvcnlGZXRjaGVyIHtcblx0bmV4dFJlc3VsdDogSUdpdEh1YlJlcG9zaXRvcnkgfCB1bmRlZmluZWQ7XG5cdGdldFJlcG9zaXRvcnlDYWxscyA9IDA7XG5cdGdldFJlcG9zaXRvcnlHYXRlOiBEZWZlcnJlZFByb21pc2U8dm9pZD4gfCB1bmRlZmluZWQ7XG5cblx0YXN5bmMgZ2V0UmVwb3NpdG9yeShfb3duZXI6IHN0cmluZywgX3JlcG86IHN0cmluZywgX2V0YWc/OiBzdHJpbmcpOiBQcm9taXNlPHsgZGF0YTogSUdpdEh1YlJlcG9zaXRvcnkgfCB1bmRlZmluZWQ7IHN0YXR1c0NvZGU6IG51bWJlcjsgZXRhZz86IHN0cmluZyB9PiB7XG5cdFx0dGhpcy5nZXRSZXBvc2l0b3J5Q2FsbHMrKztcblx0XHRhd2FpdCB0aGlzLmdldFJlcG9zaXRvcnlHYXRlPy5wO1xuXHRcdGlmICghdGhpcy5uZXh0UmVzdWx0KSB7XG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IoJ05vIG1vY2sgcmVzdWx0Jyk7XG5cdFx0fVxuXHRcdHJldHVybiB7IGRhdGE6IHRoaXMubmV4dFJlc3VsdCwgc3RhdHVzQ29kZTogMjAwIH07XG5cdH1cbn1cblxuY2xhc3MgTW9ja1BSRmV0Y2hlciB7XG5cdG5leHRQUjogSUdpdEh1YlB1bGxSZXF1ZXN0IHwgdW5kZWZpbmVkO1xuXHRuZXh0UmV2aWV3czogSUdpdEh1YlB1bGxSZXF1ZXN0UmV2aWV3W10gPSBbXTtcblx0bmV4dFRocmVhZHM6IElHaXRIdWJQdWxsUmVxdWVzdFJldmlld1RocmVhZFtdID0gW107XG5cdGdldFB1bGxSZXF1ZXN0Q2FsbHMgPSAwO1xuXHRnZXRSZXZpZXdzQ2FsbHMgPSAwO1xuXHRnZXRSZXZpZXdUaHJlYWRzQ2FsbHMgPSAwO1xuXHRnZXRQdWxsUmVxdWVzdEdhdGU6IERlZmVycmVkUHJvbWlzZTx2b2lkPiB8IHVuZGVmaW5lZDtcblx0Z2V0UmV2aWV3VGhyZWFkc0dhdGU6IERlZmVycmVkUHJvbWlzZTx2b2lkPiB8IHVuZGVmaW5lZDtcblx0cG9zdFJldmlld0NvbW1lbnRDYWxsczogeyBib2R5OiBzdHJpbmc7IGluUmVwbHlUbzogbnVtYmVyIH1bXSA9IFtdO1xuXHRwb3N0SXNzdWVDb21tZW50Q2FsbHM6IHsgYm9keTogc3RyaW5nIH1bXSA9IFtdO1xuXHRyZXNvbHZlVGhyZWFkQ2FsbHM6IHsgdGhyZWFkSWQ6IHN0cmluZyB9W10gPSBbXTtcblxuXHRhc3luYyBnZXRQdWxsUmVxdWVzdChfb3duZXI6IHN0cmluZywgX3JlcG86IHN0cmluZywgX3ByTnVtYmVyOiBudW1iZXIsIF9ldGFnPzogc3RyaW5nKTogUHJvbWlzZTx7IGRhdGE6IElHaXRIdWJQdWxsUmVxdWVzdCB8IHVuZGVmaW5lZDsgc3RhdHVzQ29kZTogbnVtYmVyOyBldGFnPzogc3RyaW5nIH0+IHtcblx0XHR0aGlzLmdldFB1bGxSZXF1ZXN0Q2FsbHMrKztcblx0XHRhd2FpdCB0aGlzLmdldFB1bGxSZXF1ZXN0R2F0ZT8ucDtcblx0XHRpZiAoIXRoaXMubmV4dFBSKSB7XG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IoJ05vIG1vY2sgUFInKTtcblx0XHR9XG5cdFx0cmV0dXJuIHsgZGF0YTogdGhpcy5uZXh0UFIsIHN0YXR1c0NvZGU6IDIwMCB9O1xuXHR9XG5cblx0YXN5bmMgZ2V0UmV2aWV3cyhfb3duZXI6IHN0cmluZywgX3JlcG86IHN0cmluZywgX3ByTnVtYmVyOiBudW1iZXIsIF9ldGFnPzogc3RyaW5nKTogUHJvbWlzZTx7IGRhdGE6IHJlYWRvbmx5IElHaXRIdWJQdWxsUmVxdWVzdFJldmlld1tdIHwgdW5kZWZpbmVkOyBzdGF0dXNDb2RlOiBudW1iZXI7IGV0YWc/OiBzdHJpbmcgfT4ge1xuXHRcdHRoaXMuZ2V0UmV2aWV3c0NhbGxzKys7XG5cdFx0cmV0dXJuIHsgZGF0YTogdGhpcy5uZXh0UmV2aWV3cywgc3RhdHVzQ29kZTogMjAwIH07XG5cdH1cblxuXHRhc3luYyBnZXRSZXZpZXdUaHJlYWRzKF9vd25lcjogc3RyaW5nLCBfcmVwbzogc3RyaW5nLCBfcHJOdW1iZXI6IG51bWJlcik6IFByb21pc2U8SUdpdEh1YlB1bGxSZXF1ZXN0UmV2aWV3VGhyZWFkW10+IHtcblx0XHR0aGlzLmdldFJldmlld1RocmVhZHNDYWxscysrO1xuXHRcdGNvbnN0IHJlc3VsdCA9IHRoaXMubmV4dFRocmVhZHM7XG5cdFx0YXdhaXQgdGhpcy5nZXRSZXZpZXdUaHJlYWRzR2F0ZT8ucDtcblx0XHRyZXR1cm4gcmVzdWx0O1xuXHR9XG5cblx0YXN5bmMgcG9zdFJldmlld0NvbW1lbnQoX293bmVyOiBzdHJpbmcsIF9yZXBvOiBzdHJpbmcsIF9wck51bWJlcjogbnVtYmVyLCBib2R5OiBzdHJpbmcsIGluUmVwbHlUbzogbnVtYmVyKTogUHJvbWlzZTxJR2l0SHViUFJDb21tZW50PiB7XG5cdFx0dGhpcy5wb3N0UmV2aWV3Q29tbWVudENhbGxzLnB1c2goeyBib2R5LCBpblJlcGx5VG8gfSk7XG5cdFx0cmV0dXJuIG1ha2VDb21tZW50KDk5OSwgYm9keSk7XG5cdH1cblxuXHRhc3luYyBwb3N0SXNzdWVDb21tZW50KF9vd25lcjogc3RyaW5nLCBfcmVwbzogc3RyaW5nLCBfcHJOdW1iZXI6IG51bWJlciwgYm9keTogc3RyaW5nKTogUHJvbWlzZTxJR2l0SHViUFJDb21tZW50PiB7XG5cdFx0dGhpcy5wb3N0SXNzdWVDb21tZW50Q2FsbHMucHVzaCh7IGJvZHkgfSk7XG5cdFx0cmV0dXJuIG1ha2VDb21tZW50KDk5OCwgYm9keSk7XG5cdH1cblxuXHRhc3luYyByZXNvbHZlVGhyZWFkKF9vd25lcjogc3RyaW5nLCBfcmVwbzogc3RyaW5nLCB0aHJlYWRJZDogc3RyaW5nKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0dGhpcy5yZXNvbHZlVGhyZWFkQ2FsbHMucHVzaCh7IHRocmVhZElkIH0pO1xuXHR9XG59XG5cbmNsYXNzIE1vY2tDSUZldGNoZXIge1xuXHRuZXh0Q2hlY2tzOiBJR2l0SHViQ0lDaGVja1tdID0gW107XG5cdGdldENoZWNrUnVuc0NhbGxzID0gMDtcblx0Z2V0Q2hlY2tSdW5zR2F0ZTogRGVmZXJyZWRQcm9taXNlPHZvaWQ+IHwgdW5kZWZpbmVkO1xuXG5cdGFzeW5jIGdldENoZWNrUnVucyhfb3duZXI6IHN0cmluZywgX3JlcG86IHN0cmluZywgX3JlZjogc3RyaW5nLCBfZXRhZz86IHN0cmluZyk6IFByb21pc2U8eyBkYXRhOiByZWFkb25seSBJR2l0SHViQ0lDaGVja1tdIHwgdW5kZWZpbmVkOyBzdGF0dXNDb2RlOiBudW1iZXI7IGV0YWc/OiBzdHJpbmcgfT4ge1xuXHRcdHRoaXMuZ2V0Q2hlY2tSdW5zQ2FsbHMrKztcblx0XHRjb25zdCByZXN1bHQgPSB0aGlzLm5leHRDaGVja3M7XG5cdFx0YXdhaXQgdGhpcy5nZXRDaGVja1J1bnNHYXRlPy5wO1xuXHRcdHJldHVybiB7IGRhdGE6IHJlc3VsdCwgc3RhdHVzQ29kZTogMjAwIH07XG5cdH1cblxuXHRhc3luYyByZXJ1bkZhaWxlZEpvYnMoX293bmVyOiBzdHJpbmcsIF9yZXBvOiBzdHJpbmcsIF9ydW5JZDogbnVtYmVyKTogUHJvbWlzZTx2b2lkPiB7IH1cblxuXHRhc3luYyBnZXRDaGVja1J1bkFubm90YXRpb25zKF9vd25lcjogc3RyaW5nLCBfcmVwbzogc3RyaW5nLCBfY2hlY2tSdW5JZDogbnVtYmVyKTogUHJvbWlzZTxzdHJpbmc+IHtcblx0XHRyZXR1cm4gJ21vY2sgYW5ub3RhdGlvbnMnO1xuXHR9XG59XG5cbi8vI2VuZHJlZ2lvblxuXG5zdWl0ZSgnR2l0SHViUmVwb3NpdG9yeU1vZGVsJywgKCkgPT4ge1xuXG5cdGNvbnN0IHN0b3JlID0gbmV3IERpc3Bvc2FibGVTdG9yZSgpO1xuXHRsZXQgbW9ja0ZldGNoZXI6IE1vY2tSZXBvc2l0b3J5RmV0Y2hlcjtcblx0Y29uc3QgbG9nU2VydmljZSA9IG5ldyBOdWxsTG9nU2VydmljZSgpO1xuXG5cdHNldHVwKCgpID0+IHtcblx0XHRtb2NrRmV0Y2hlciA9IG5ldyBNb2NrUmVwb3NpdG9yeUZldGNoZXIoKTtcblx0fSk7XG5cblx0dGVhcmRvd24oKCkgPT4gc3RvcmUuY2xlYXIoKSk7XG5cblx0ZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlKCk7XG5cblx0dGVzdCgnaW5pdGlhbCBzdGF0ZSBpcyB1bmRlZmluZWQnLCAoKSA9PiB7XG5cdFx0Y29uc3QgbW9kZWwgPSBzdG9yZS5hZGQobmV3IEdpdEh1YlJlcG9zaXRvcnlNb2RlbCgnb3duZXInLCAncmVwbycsIG1vY2tGZXRjaGVyIGFzIHVua25vd24gYXMgR2l0SHViUmVwb3NpdG9yeUZldGNoZXIsIGxvZ1NlcnZpY2UpKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobW9kZWwucmVwb3NpdG9yeS5nZXQoKSwgdW5kZWZpbmVkKTtcblx0fSk7XG5cblx0dGVzdCgncmVmcmVzaCBwb3B1bGF0ZXMgcmVwb3NpdG9yeSBvYnNlcnZhYmxlJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IG1vZGVsID0gc3RvcmUuYWRkKG5ldyBHaXRIdWJSZXBvc2l0b3J5TW9kZWwoJ293bmVyJywgJ3JlcG8nLCBtb2NrRmV0Y2hlciBhcyB1bmtub3duIGFzIEdpdEh1YlJlcG9zaXRvcnlGZXRjaGVyLCBsb2dTZXJ2aWNlKSk7XG5cdFx0bW9ja0ZldGNoZXIubmV4dFJlc3VsdCA9IHtcblx0XHRcdG93bmVyOiAnb3duZXInLFxuXHRcdFx0bmFtZTogJ3JlcG8nLFxuXHRcdFx0ZnVsbE5hbWU6ICdvd25lci9yZXBvJyxcblx0XHRcdGRlZmF1bHRCcmFuY2g6ICdtYWluJyxcblx0XHRcdGlzUHJpdmF0ZTogZmFsc2UsXG5cdFx0XHRkZXNjcmlwdGlvbjogJ3Rlc3QnLFxuXHRcdH07XG5cblx0XHRhd2FpdCBtb2RlbC5yZWZyZXNoKCk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChtb2RlbC5yZXBvc2l0b3J5LmdldCgpLCBtb2NrRmV0Y2hlci5uZXh0UmVzdWx0KTtcblx0fSk7XG5cblx0dGVzdCgncmVmcmVzaCBzaGFyZXMgYW4gaW4tcHJvZ3Jlc3MgcmVxdWVzdCcsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBtb2RlbCA9IHN0b3JlLmFkZChuZXcgR2l0SHViUmVwb3NpdG9yeU1vZGVsKCdvd25lcicsICdyZXBvJywgbW9ja0ZldGNoZXIgYXMgdW5rbm93biBhcyBHaXRIdWJSZXBvc2l0b3J5RmV0Y2hlciwgbG9nU2VydmljZSkpO1xuXHRcdG1vY2tGZXRjaGVyLm5leHRSZXN1bHQgPSBtYWtlUmVwb3NpdG9yeSgpO1xuXHRcdG1vY2tGZXRjaGVyLmdldFJlcG9zaXRvcnlHYXRlID0gbmV3IERlZmVycmVkUHJvbWlzZTx2b2lkPigpO1xuXG5cdFx0Y29uc3QgZmlyc3RSZWZyZXNoID0gbW9kZWwucmVmcmVzaCgpO1xuXHRcdGNvbnN0IHNlY29uZFJlZnJlc2ggPSBtb2RlbC5yZWZyZXNoKCk7XG5cblx0XHR0cnkge1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRcdHNhbWVQcm9taXNlOiBmaXJzdFJlZnJlc2ggPT09IHNlY29uZFJlZnJlc2gsXG5cdFx0XHRcdGdldFJlcG9zaXRvcnlDYWxsczogbW9ja0ZldGNoZXIuZ2V0UmVwb3NpdG9yeUNhbGxzLFxuXHRcdFx0fSwge1xuXHRcdFx0XHRzYW1lUHJvbWlzZTogdHJ1ZSxcblx0XHRcdFx0Z2V0UmVwb3NpdG9yeUNhbGxzOiAxLFxuXHRcdFx0fSk7XG5cdFx0fSBmaW5hbGx5IHtcblx0XHRcdGF3YWl0IG1vY2tGZXRjaGVyLmdldFJlcG9zaXRvcnlHYXRlLmNvbXBsZXRlKHVuZGVmaW5lZCk7XG5cdFx0fVxuXG5cdFx0YXdhaXQgZmlyc3RSZWZyZXNoO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0cmVwb3NpdG9yeTogbW9kZWwucmVwb3NpdG9yeS5nZXQoKSxcblx0XHRcdGdldFJlcG9zaXRvcnlDYWxsczogbW9ja0ZldGNoZXIuZ2V0UmVwb3NpdG9yeUNhbGxzLFxuXHRcdH0sIHtcblx0XHRcdHJlcG9zaXRvcnk6IG1vY2tGZXRjaGVyLm5leHRSZXN1bHQsXG5cdFx0XHRnZXRSZXBvc2l0b3J5Q2FsbHM6IDEsXG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3JlZnJlc2ggaGFuZGxlcyBlcnJvcnMgZ3JhY2VmdWxseScsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBtb2RlbCA9IHN0b3JlLmFkZChuZXcgR2l0SHViUmVwb3NpdG9yeU1vZGVsKCdvd25lcicsICdyZXBvJywgbW9ja0ZldGNoZXIgYXMgdW5rbm93biBhcyBHaXRIdWJSZXBvc2l0b3J5RmV0Y2hlciwgbG9nU2VydmljZSkpO1xuXHRcdC8vIE5vIG5leHRSZXN1bHQgc2V0LCB3aWxsIHRocm93XG5cdFx0YXdhaXQgbW9kZWwucmVmcmVzaCgpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChtb2RlbC5yZXBvc2l0b3J5LmdldCgpLCB1bmRlZmluZWQpO1xuXHR9KTtcbn0pO1xuXG5zdWl0ZSgnR2l0SHViUHVsbFJlcXVlc3RNb2RlbCcsICgpID0+IHtcblxuXHRjb25zdCBzdG9yZSA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblx0bGV0IG1vY2tGZXRjaGVyOiBNb2NrUFJGZXRjaGVyO1xuXHRjb25zdCBsb2dTZXJ2aWNlID0gbmV3IE51bGxMb2dTZXJ2aWNlKCk7XG5cblx0c2V0dXAoKCkgPT4ge1xuXHRcdG1vY2tGZXRjaGVyID0gbmV3IE1vY2tQUkZldGNoZXIoKTtcblx0fSk7XG5cblx0dGVhcmRvd24oKCkgPT4gc3RvcmUuY2xlYXIoKSk7XG5cblx0ZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlKCk7XG5cblx0dGVzdCgnaW5pdGlhbCBzdGF0ZSBoYXMgZW1wdHkgb2JzZXJ2YWJsZXMnLCAoKSA9PiB7XG5cdFx0Y29uc3QgbW9kZWwgPSBzdG9yZS5hZGQobmV3IEdpdEh1YlB1bGxSZXF1ZXN0TW9kZWwoJ293bmVyJywgJ3JlcG8nLCAxLCBtb2NrRmV0Y2hlciBhcyB1bmtub3duIGFzIEdpdEh1YlBSRmV0Y2hlciwgbG9nU2VydmljZSkpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChtb2RlbC5wdWxsUmVxdWVzdC5nZXQoKSwgdW5kZWZpbmVkKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobW9kZWwubWVyZ2VhYmlsaXR5LmdldCgpLCB1bmRlZmluZWQpO1xuXHR9KTtcblxuXHR0ZXN0KCdyZWZyZXNoIHBvcHVsYXRlcyBwdWxsIHJlcXVlc3QgYW5kIG1lcmdlYWJpbGl0eSB3aXRob3V0IGZldGNoaW5nIHJldmlldyB0aHJlYWRzJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IG1vZGVsID0gc3RvcmUuYWRkKG5ldyBHaXRIdWJQdWxsUmVxdWVzdE1vZGVsKCdvd25lcicsICdyZXBvJywgMSwgbW9ja0ZldGNoZXIgYXMgdW5rbm93biBhcyBHaXRIdWJQUkZldGNoZXIsIGxvZ1NlcnZpY2UpKTtcblx0XHRtb2NrRmV0Y2hlci5uZXh0UFIgPSBtYWtlUFIoKTtcblx0XHRtb2NrRmV0Y2hlci5uZXh0UmV2aWV3cyA9IFtdO1xuXHRcdG1vY2tGZXRjaGVyLm5leHRUaHJlYWRzID0gW21ha2VUaHJlYWQoJ3RocmVhZC0xMDAnLCAnc3JjL2EudHMnKV07XG5cblx0XHRhd2FpdCBtb2RlbC5yZWZyZXNoKCk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdHByTnVtYmVyOiBtb2RlbC5wdWxsUmVxdWVzdC5nZXQoKT8ubnVtYmVyLFxuXHRcdFx0Y2FuTWVyZ2U6IG1vZGVsLm1lcmdlYWJpbGl0eS5nZXQoKT8uY2FuTWVyZ2UsXG5cdFx0XHRnZXRQdWxsUmVxdWVzdENhbGxzOiBtb2NrRmV0Y2hlci5nZXRQdWxsUmVxdWVzdENhbGxzLFxuXHRcdFx0Z2V0UmV2aWV3c0NhbGxzOiBtb2NrRmV0Y2hlci5nZXRSZXZpZXdzQ2FsbHMsXG5cdFx0XHRnZXRSZXZpZXdUaHJlYWRzQ2FsbHM6IG1vY2tGZXRjaGVyLmdldFJldmlld1RocmVhZHNDYWxscyxcblx0XHR9LCB7XG5cdFx0XHRwck51bWJlcjogMSxcblx0XHRcdGNhbk1lcmdlOiB0cnVlLFxuXHRcdFx0Z2V0UHVsbFJlcXVlc3RDYWxsczogMSxcblx0XHRcdGdldFJldmlld3NDYWxsczogMSxcblx0XHRcdGdldFJldmlld1RocmVhZHNDYWxsczogMCxcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgncmVmcmVzaCBzaGFyZXMgYW4gaW4tcHJvZ3Jlc3MgcmVxdWVzdCcsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBtb2RlbCA9IHN0b3JlLmFkZChuZXcgR2l0SHViUHVsbFJlcXVlc3RNb2RlbCgnb3duZXInLCAncmVwbycsIDEsIG1vY2tGZXRjaGVyIGFzIHVua25vd24gYXMgR2l0SHViUFJGZXRjaGVyLCBsb2dTZXJ2aWNlKSk7XG5cdFx0bW9ja0ZldGNoZXIubmV4dFBSID0gbWFrZVBSKCk7XG5cdFx0bW9ja0ZldGNoZXIubmV4dFJldmlld3MgPSBbXTtcblx0XHRtb2NrRmV0Y2hlci5nZXRQdWxsUmVxdWVzdEdhdGUgPSBuZXcgRGVmZXJyZWRQcm9taXNlPHZvaWQ+KCk7XG5cblx0XHRjb25zdCBmaXJzdFJlZnJlc2ggPSBtb2RlbC5yZWZyZXNoKCk7XG5cdFx0Y29uc3Qgc2Vjb25kUmVmcmVzaCA9IG1vZGVsLnJlZnJlc2goKTtcblxuXHRcdHRyeSB7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdFx0c2FtZVByb21pc2U6IGZpcnN0UmVmcmVzaCA9PT0gc2Vjb25kUmVmcmVzaCxcblx0XHRcdFx0Z2V0UHVsbFJlcXVlc3RDYWxsczogbW9ja0ZldGNoZXIuZ2V0UHVsbFJlcXVlc3RDYWxscyxcblx0XHRcdFx0Z2V0UmV2aWV3c0NhbGxzOiBtb2NrRmV0Y2hlci5nZXRSZXZpZXdzQ2FsbHMsXG5cdFx0XHR9LCB7XG5cdFx0XHRcdHNhbWVQcm9taXNlOiB0cnVlLFxuXHRcdFx0XHRnZXRQdWxsUmVxdWVzdENhbGxzOiAxLFxuXHRcdFx0XHRnZXRSZXZpZXdzQ2FsbHM6IDEsXG5cdFx0XHR9KTtcblx0XHR9IGZpbmFsbHkge1xuXHRcdFx0YXdhaXQgbW9ja0ZldGNoZXIuZ2V0UHVsbFJlcXVlc3RHYXRlLmNvbXBsZXRlKHVuZGVmaW5lZCk7XG5cdFx0fVxuXG5cdFx0YXdhaXQgZmlyc3RSZWZyZXNoO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0cHJOdW1iZXI6IG1vZGVsLnB1bGxSZXF1ZXN0LmdldCgpPy5udW1iZXIsXG5cdFx0XHRnZXRQdWxsUmVxdWVzdENhbGxzOiBtb2NrRmV0Y2hlci5nZXRQdWxsUmVxdWVzdENhbGxzLFxuXHRcdFx0Z2V0UmV2aWV3c0NhbGxzOiBtb2NrRmV0Y2hlci5nZXRSZXZpZXdzQ2FsbHMsXG5cdFx0fSwge1xuXHRcdFx0cHJOdW1iZXI6IDEsXG5cdFx0XHRnZXRQdWxsUmVxdWVzdENhbGxzOiAxLFxuXHRcdFx0Z2V0UmV2aWV3c0NhbGxzOiAxLFxuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdwb3N0SXNzdWVDb21tZW50IGNhbGxzIGZldGNoZXInLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgbW9kZWwgPSBzdG9yZS5hZGQobmV3IEdpdEh1YlB1bGxSZXF1ZXN0TW9kZWwoJ293bmVyJywgJ3JlcG8nLCAxLCBtb2NrRmV0Y2hlciBhcyB1bmtub3duIGFzIEdpdEh1YlBSRmV0Y2hlciwgbG9nU2VydmljZSkpO1xuXG5cdFx0Y29uc3QgY29tbWVudCA9IGF3YWl0IG1vZGVsLnBvc3RJc3N1ZUNvbW1lbnQoJ0dyZWF0IHdvcmshJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNvbW1lbnQuYm9keSwgJ0dyZWF0IHdvcmshJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1vY2tGZXRjaGVyLnBvc3RJc3N1ZUNvbW1lbnRDYWxscy5sZW5ndGgsIDEpO1xuXHR9KTtcblxuXHR0ZXN0KCdwb2xsaW5nIGNhbiBiZSBzdGFydGVkIGFuZCBzdG9wcGVkJywgKCkgPT4ge1xuXHRcdGNvbnN0IG1vZGVsID0gc3RvcmUuYWRkKG5ldyBHaXRIdWJQdWxsUmVxdWVzdE1vZGVsKCdvd25lcicsICdyZXBvJywgMSwgbW9ja0ZldGNoZXIgYXMgdW5rbm93biBhcyBHaXRIdWJQUkZldGNoZXIsIGxvZ1NlcnZpY2UpKTtcblx0XHQvLyBKdXN0IGVuc3VyZSBubyBlcnJvcnM7IGFjdHVhbCBwb2xsaW5nIGJlaGF2aW9yIGlzIHRpbWVyLWJhc2VkXG5cdFx0Y29uc3QgcG9sbGluZyA9IG1vZGVsLnN0YXJ0UG9sbGluZyg2MF8wMDApO1xuXHRcdHBvbGxpbmcuZGlzcG9zZSgpO1xuXHRcdHBvbGxpbmcuZGlzcG9zZSgpO1xuXHR9KTtcblxuXHR0ZXN0KCdwb2xsaW5nIHN0b3BzIHdoZW4gdGhlIGxhc3QgY2xpZW50IHN0b3BzIHBvbGxpbmcnLCAoKSA9PiBydW5XaXRoRmFrZWRUaW1lcnM8dm9pZD4oeyB1c2VGYWtlVGltZXJzOiB0cnVlIH0sIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBtb2RlbCA9IHN0b3JlLmFkZChuZXcgR2l0SHViUHVsbFJlcXVlc3RNb2RlbCgnb3duZXInLCAncmVwbycsIDEsIG1vY2tGZXRjaGVyIGFzIHVua25vd24gYXMgR2l0SHViUFJGZXRjaGVyLCBsb2dTZXJ2aWNlKSk7XG5cdFx0bW9ja0ZldGNoZXIubmV4dFBSID0gbWFrZVBSKCk7XG5cdFx0bW9ja0ZldGNoZXIubmV4dFJldmlld3MgPSBbXTtcblx0XHRtb2NrRmV0Y2hlci5nZXRQdWxsUmVxdWVzdEdhdGUgPSBuZXcgRGVmZXJyZWRQcm9taXNlPHZvaWQ+KCk7XG5cblx0XHRjb25zdCBmaXJzdFBvbGxpbmcgPSBtb2RlbC5zdGFydFBvbGxpbmcoMTApO1xuXHRcdGNvbnN0IHNlY29uZFBvbGxpbmcgPSBtb2RlbC5zdGFydFBvbGxpbmcoMV8wMDApO1xuXHRcdGZpcnN0UG9sbGluZy5kaXNwb3NlKCk7XG5cblx0XHRhd2FpdCB0aW1lb3V0KDEwKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdGdldFB1bGxSZXF1ZXN0Q2FsbHM6IG1vY2tGZXRjaGVyLmdldFB1bGxSZXF1ZXN0Q2FsbHMsXG5cdFx0XHRnZXRSZXZpZXdzQ2FsbHM6IG1vY2tGZXRjaGVyLmdldFJldmlld3NDYWxscyxcblx0XHR9LCB7XG5cdFx0XHRnZXRQdWxsUmVxdWVzdENhbGxzOiAxLFxuXHRcdFx0Z2V0UmV2aWV3c0NhbGxzOiAxLFxuXHRcdH0pO1xuXG5cdFx0YXdhaXQgbW9ja0ZldGNoZXIuZ2V0UHVsbFJlcXVlc3RHYXRlLmNvbXBsZXRlKHVuZGVmaW5lZCk7XG5cdFx0YXdhaXQgdGltZW91dCgwKTtcblx0XHRhd2FpdCB0aW1lb3V0KDYwXzAwMCk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRnZXRQdWxsUmVxdWVzdENhbGxzOiBtb2NrRmV0Y2hlci5nZXRQdWxsUmVxdWVzdENhbGxzLFxuXHRcdFx0Z2V0UmV2aWV3c0NhbGxzOiBtb2NrRmV0Y2hlci5nZXRSZXZpZXdzQ2FsbHMsXG5cdFx0fSwge1xuXHRcdFx0Z2V0UHVsbFJlcXVlc3RDYWxsczogMixcblx0XHRcdGdldFJldmlld3NDYWxsczogMixcblx0XHR9KTtcblxuXHRcdHNlY29uZFBvbGxpbmcuZGlzcG9zZSgpO1xuXHRcdGF3YWl0IHRpbWVvdXQoNjBfMDAwKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0Z2V0UHVsbFJlcXVlc3RDYWxsczogbW9ja0ZldGNoZXIuZ2V0UHVsbFJlcXVlc3RDYWxscyxcblx0XHRcdGdldFJldmlld3NDYWxsczogbW9ja0ZldGNoZXIuZ2V0UmV2aWV3c0NhbGxzLFxuXHRcdH0sIHtcblx0XHRcdGdldFB1bGxSZXF1ZXN0Q2FsbHM6IDIsXG5cdFx0XHRnZXRSZXZpZXdzQ2FsbHM6IDIsXG5cdFx0fSk7XG5cdH0pKTtcbn0pO1xuXG5zdWl0ZSgnR2l0SHViUHVsbFJlcXVlc3RSZXZpZXdUaHJlYWRzTW9kZWwnLCAoKSA9PiB7XG5cblx0Y29uc3Qgc3RvcmUgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cdGxldCBtb2NrRmV0Y2hlcjogTW9ja1BSRmV0Y2hlcjtcblx0Y29uc3QgbG9nU2VydmljZSA9IG5ldyBOdWxsTG9nU2VydmljZSgpO1xuXG5cdHNldHVwKCgpID0+IHtcblx0XHRtb2NrRmV0Y2hlciA9IG5ldyBNb2NrUFJGZXRjaGVyKCk7XG5cdH0pO1xuXG5cdHRlYXJkb3duKCgpID0+IHN0b3JlLmNsZWFyKCkpO1xuXG5cdGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSgpO1xuXG5cdHRlc3QoJ2luaXRpYWwgc3RhdGUgaXMgZW1wdHknLCAoKSA9PiB7XG5cdFx0Y29uc3QgbW9kZWwgPSBzdG9yZS5hZGQobmV3IEdpdEh1YlB1bGxSZXF1ZXN0UmV2aWV3VGhyZWFkc01vZGVsKCdvd25lcicsICdyZXBvJywgMSwgbW9ja0ZldGNoZXIgYXMgdW5rbm93biBhcyBHaXRIdWJQUkZldGNoZXIsIGxvZ1NlcnZpY2UpKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKG1vZGVsLnJldmlld1RocmVhZHMuZ2V0KCksIFtdKTtcblx0fSk7XG5cblx0dGVzdCgncmVmcmVzaCB1cGRhdGVzIG9ubHkgcmV2aWV3IHRocmVhZHMnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgbW9kZWwgPSBzdG9yZS5hZGQobmV3IEdpdEh1YlB1bGxSZXF1ZXN0UmV2aWV3VGhyZWFkc01vZGVsKCdvd25lcicsICdyZXBvJywgMSwgbW9ja0ZldGNoZXIgYXMgdW5rbm93biBhcyBHaXRIdWJQUkZldGNoZXIsIGxvZ1NlcnZpY2UpKTtcblx0XHRtb2NrRmV0Y2hlci5uZXh0VGhyZWFkcyA9IFttYWtlVGhyZWFkKCd0aHJlYWQtMTAwJywgJ3NyYy9hLnRzJyksIG1ha2VUaHJlYWQoJ3RocmVhZC0yMDAnLCAnc3JjL2IudHMnKV07XG5cblx0XHRhd2FpdCBtb2RlbC5yZWZyZXNoKCk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdHRocmVhZHM6IG1vZGVsLnJldmlld1RocmVhZHMuZ2V0KCkubWFwKHRocmVhZCA9PiB0aHJlYWQuaWQpLFxuXHRcdFx0Z2V0UHVsbFJlcXVlc3RDYWxsczogbW9ja0ZldGNoZXIuZ2V0UHVsbFJlcXVlc3RDYWxscyxcblx0XHRcdGdldFJldmlld3NDYWxsczogbW9ja0ZldGNoZXIuZ2V0UmV2aWV3c0NhbGxzLFxuXHRcdFx0Z2V0UmV2aWV3VGhyZWFkc0NhbGxzOiBtb2NrRmV0Y2hlci5nZXRSZXZpZXdUaHJlYWRzQ2FsbHMsXG5cdFx0fSwge1xuXHRcdFx0dGhyZWFkczogWyd0aHJlYWQtMTAwJywgJ3RocmVhZC0yMDAnXSxcblx0XHRcdGdldFB1bGxSZXF1ZXN0Q2FsbHM6IDAsXG5cdFx0XHRnZXRSZXZpZXdzQ2FsbHM6IDAsXG5cdFx0XHRnZXRSZXZpZXdUaHJlYWRzQ2FsbHM6IDEsXG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3JlZnJlc2ggc2hhcmVzIGFuIGluLXByb2dyZXNzIHJlcXVlc3QnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgbW9kZWwgPSBzdG9yZS5hZGQobmV3IEdpdEh1YlB1bGxSZXF1ZXN0UmV2aWV3VGhyZWFkc01vZGVsKCdvd25lcicsICdyZXBvJywgMSwgbW9ja0ZldGNoZXIgYXMgdW5rbm93biBhcyBHaXRIdWJQUkZldGNoZXIsIGxvZ1NlcnZpY2UpKTtcblx0XHRtb2NrRmV0Y2hlci5uZXh0VGhyZWFkcyA9IFttYWtlVGhyZWFkKCd0aHJlYWQtMTAwJywgJ3NyYy9hLnRzJyldO1xuXHRcdG1vY2tGZXRjaGVyLmdldFJldmlld1RocmVhZHNHYXRlID0gbmV3IERlZmVycmVkUHJvbWlzZTx2b2lkPigpO1xuXG5cdFx0Y29uc3QgZmlyc3RSZWZyZXNoID0gbW9kZWwucmVmcmVzaCgpO1xuXHRcdGNvbnN0IHNlY29uZFJlZnJlc2ggPSBtb2RlbC5yZWZyZXNoKCk7XG5cblx0XHR0cnkge1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRcdHNhbWVQcm9taXNlOiBmaXJzdFJlZnJlc2ggPT09IHNlY29uZFJlZnJlc2gsXG5cdFx0XHRcdGdldFJldmlld1RocmVhZHNDYWxsczogbW9ja0ZldGNoZXIuZ2V0UmV2aWV3VGhyZWFkc0NhbGxzLFxuXHRcdFx0fSwge1xuXHRcdFx0XHRzYW1lUHJvbWlzZTogdHJ1ZSxcblx0XHRcdFx0Z2V0UmV2aWV3VGhyZWFkc0NhbGxzOiAxLFxuXHRcdFx0fSk7XG5cdFx0fSBmaW5hbGx5IHtcblx0XHRcdGF3YWl0IG1vY2tGZXRjaGVyLmdldFJldmlld1RocmVhZHNHYXRlLmNvbXBsZXRlKHVuZGVmaW5lZCk7XG5cdFx0fVxuXG5cdFx0YXdhaXQgZmlyc3RSZWZyZXNoO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0dGhyZWFkczogbW9kZWwucmV2aWV3VGhyZWFkcy5nZXQoKS5tYXAodGhyZWFkID0+IHRocmVhZC5pZCksXG5cdFx0XHRnZXRSZXZpZXdUaHJlYWRzQ2FsbHM6IG1vY2tGZXRjaGVyLmdldFJldmlld1RocmVhZHNDYWxscyxcblx0XHR9LCB7XG5cdFx0XHR0aHJlYWRzOiBbJ3RocmVhZC0xMDAnXSxcblx0XHRcdGdldFJldmlld1RocmVhZHNDYWxsczogMSxcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgncG9zdFJldmlld0NvbW1lbnQgY2FsbHMgZmV0Y2hlciBhbmQgcmVmcmVzaGVzIHRocmVhZHMnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgbW9kZWwgPSBzdG9yZS5hZGQobmV3IEdpdEh1YlB1bGxSZXF1ZXN0UmV2aWV3VGhyZWFkc01vZGVsKCdvd25lcicsICdyZXBvJywgMSwgbW9ja0ZldGNoZXIgYXMgdW5rbm93biBhcyBHaXRIdWJQUkZldGNoZXIsIGxvZ1NlcnZpY2UpKTtcblx0XHRtb2NrRmV0Y2hlci5uZXh0VGhyZWFkcyA9IFttYWtlVGhyZWFkKCd0aHJlYWQtMTAwJywgJ3NyYy9hLnRzJyldO1xuXG5cdFx0Y29uc3QgY29tbWVudCA9IGF3YWl0IG1vZGVsLnBvc3RSZXZpZXdDb21tZW50KCdMR1RNJywgMTAwKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0Y29tbWVudEJvZHk6IGNvbW1lbnQuYm9keSxcblx0XHRcdHBvc3RSZXZpZXdDb21tZW50Q2FsbHM6IG1vY2tGZXRjaGVyLnBvc3RSZXZpZXdDb21tZW50Q2FsbHMsXG5cdFx0XHR0aHJlYWRzOiBtb2RlbC5yZXZpZXdUaHJlYWRzLmdldCgpLm1hcCh0aHJlYWQgPT4gdGhyZWFkLmlkKSxcblx0XHR9LCB7XG5cdFx0XHRjb21tZW50Qm9keTogJ0xHVE0nLFxuXHRcdFx0cG9zdFJldmlld0NvbW1lbnRDYWxsczogW3sgYm9keTogJ0xHVE0nLCBpblJlcGx5VG86IDEwMCB9XSxcblx0XHRcdHRocmVhZHM6IFsndGhyZWFkLTEwMCddLFxuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdwb3N0UmV2aWV3Q29tbWVudCByZWZyZXNoZXMgYWZ0ZXIgYW4gaW4tcHJvZ3Jlc3MgcmVmcmVzaCBjb21wbGV0ZXMnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgbW9kZWwgPSBzdG9yZS5hZGQobmV3IEdpdEh1YlB1bGxSZXF1ZXN0UmV2aWV3VGhyZWFkc01vZGVsKCdvd25lcicsICdyZXBvJywgMSwgbW9ja0ZldGNoZXIgYXMgdW5rbm93biBhcyBHaXRIdWJQUkZldGNoZXIsIGxvZ1NlcnZpY2UpKTtcblx0XHRtb2NrRmV0Y2hlci5uZXh0VGhyZWFkcyA9IFttYWtlVGhyZWFkKCd0aHJlYWQtMTAwJywgJ3NyYy9hLnRzJyldO1xuXHRcdG1vY2tGZXRjaGVyLmdldFJldmlld1RocmVhZHNHYXRlID0gbmV3IERlZmVycmVkUHJvbWlzZTx2b2lkPigpO1xuXG5cdFx0Y29uc3QgaW5Qcm9ncmVzc1JlZnJlc2ggPSBtb2RlbC5yZWZyZXNoKCk7XG5cdFx0bW9ja0ZldGNoZXIubmV4dFRocmVhZHMgPSBbbWFrZVRocmVhZCgndGhyZWFkLTIwMCcsICdzcmMvYi50cycpXTtcblx0XHRjb25zdCBjb21tZW50ID0gbW9kZWwucG9zdFJldmlld0NvbW1lbnQoJ0xHVE0nLCAxMDApO1xuXG5cdFx0YXdhaXQgbW9ja0ZldGNoZXIuZ2V0UmV2aWV3VGhyZWFkc0dhdGUuY29tcGxldGUodW5kZWZpbmVkKTtcblx0XHRhd2FpdCBpblByb2dyZXNzUmVmcmVzaDtcblx0XHRhd2FpdCBjb21tZW50O1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRwb3N0UmV2aWV3Q29tbWVudENhbGxzOiBtb2NrRmV0Y2hlci5wb3N0UmV2aWV3Q29tbWVudENhbGxzLFxuXHRcdFx0dGhyZWFkczogbW9kZWwucmV2aWV3VGhyZWFkcy5nZXQoKS5tYXAodGhyZWFkID0+IHRocmVhZC5pZCksXG5cdFx0XHRnZXRSZXZpZXdUaHJlYWRzQ2FsbHM6IG1vY2tGZXRjaGVyLmdldFJldmlld1RocmVhZHNDYWxscyxcblx0XHR9LCB7XG5cdFx0XHRwb3N0UmV2aWV3Q29tbWVudENhbGxzOiBbeyBib2R5OiAnTEdUTScsIGluUmVwbHlUbzogMTAwIH1dLFxuXHRcdFx0dGhyZWFkczogWyd0aHJlYWQtMjAwJ10sXG5cdFx0XHRnZXRSZXZpZXdUaHJlYWRzQ2FsbHM6IDIsXG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3Jlc29sdmVUaHJlYWQgY2FsbHMgZmV0Y2hlciBhbmQgcmVmcmVzaGVzIHRocmVhZHMnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgbW9kZWwgPSBzdG9yZS5hZGQobmV3IEdpdEh1YlB1bGxSZXF1ZXN0UmV2aWV3VGhyZWFkc01vZGVsKCdvd25lcicsICdyZXBvJywgMSwgbW9ja0ZldGNoZXIgYXMgdW5rbm93biBhcyBHaXRIdWJQUkZldGNoZXIsIGxvZ1NlcnZpY2UpKTtcblx0XHRtb2NrRmV0Y2hlci5uZXh0VGhyZWFkcyA9IFtdO1xuXG5cdFx0YXdhaXQgbW9kZWwucmVzb2x2ZVRocmVhZCgndGhyZWFkLTEwMCcpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRyZXNvbHZlVGhyZWFkQ2FsbHM6IG1vY2tGZXRjaGVyLnJlc29sdmVUaHJlYWRDYWxscyxcblx0XHRcdGdldFJldmlld1RocmVhZHNDYWxsczogbW9ja0ZldGNoZXIuZ2V0UmV2aWV3VGhyZWFkc0NhbGxzLFxuXHRcdFx0dGhyZWFkczogbW9kZWwucmV2aWV3VGhyZWFkcy5nZXQoKSxcblx0XHR9LCB7XG5cdFx0XHRyZXNvbHZlVGhyZWFkQ2FsbHM6IFt7IHRocmVhZElkOiAndGhyZWFkLTEwMCcgfV0sXG5cdFx0XHRnZXRSZXZpZXdUaHJlYWRzQ2FsbHM6IDEsXG5cdFx0XHR0aHJlYWRzOiBbXSxcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgncmVzb2x2ZVRocmVhZCByZWZyZXNoZXMgYWZ0ZXIgYW4gaW4tcHJvZ3Jlc3MgcmVmcmVzaCBjb21wbGV0ZXMnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgbW9kZWwgPSBzdG9yZS5hZGQobmV3IEdpdEh1YlB1bGxSZXF1ZXN0UmV2aWV3VGhyZWFkc01vZGVsKCdvd25lcicsICdyZXBvJywgMSwgbW9ja0ZldGNoZXIgYXMgdW5rbm93biBhcyBHaXRIdWJQUkZldGNoZXIsIGxvZ1NlcnZpY2UpKTtcblx0XHRtb2NrRmV0Y2hlci5uZXh0VGhyZWFkcyA9IFttYWtlVGhyZWFkKCd0aHJlYWQtMTAwJywgJ3NyYy9hLnRzJyldO1xuXHRcdG1vY2tGZXRjaGVyLmdldFJldmlld1RocmVhZHNHYXRlID0gbmV3IERlZmVycmVkUHJvbWlzZTx2b2lkPigpO1xuXG5cdFx0Y29uc3QgaW5Qcm9ncmVzc1JlZnJlc2ggPSBtb2RlbC5yZWZyZXNoKCk7XG5cdFx0bW9ja0ZldGNoZXIubmV4dFRocmVhZHMgPSBbXTtcblx0XHRjb25zdCByZXNvbHZlVGhyZWFkID0gbW9kZWwucmVzb2x2ZVRocmVhZCgndGhyZWFkLTEwMCcpO1xuXG5cdFx0YXdhaXQgbW9ja0ZldGNoZXIuZ2V0UmV2aWV3VGhyZWFkc0dhdGUuY29tcGxldGUodW5kZWZpbmVkKTtcblx0XHRhd2FpdCBpblByb2dyZXNzUmVmcmVzaDtcblx0XHRhd2FpdCByZXNvbHZlVGhyZWFkO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRyZXNvbHZlVGhyZWFkQ2FsbHM6IG1vY2tGZXRjaGVyLnJlc29sdmVUaHJlYWRDYWxscyxcblx0XHRcdHRocmVhZHM6IG1vZGVsLnJldmlld1RocmVhZHMuZ2V0KCkubWFwKHRocmVhZCA9PiB0aHJlYWQuaWQpLFxuXHRcdFx0Z2V0UmV2aWV3VGhyZWFkc0NhbGxzOiBtb2NrRmV0Y2hlci5nZXRSZXZpZXdUaHJlYWRzQ2FsbHMsXG5cdFx0fSwge1xuXHRcdFx0cmVzb2x2ZVRocmVhZENhbGxzOiBbeyB0aHJlYWRJZDogJ3RocmVhZC0xMDAnIH1dLFxuXHRcdFx0dGhyZWFkczogW10sXG5cdFx0XHRnZXRSZXZpZXdUaHJlYWRzQ2FsbHM6IDIsXG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3BvbGxpbmcgY2FuIGJlIHN0YXJ0ZWQgYW5kIHN0b3BwZWQnLCAoKSA9PiB7XG5cdFx0Y29uc3QgbW9kZWwgPSBzdG9yZS5hZGQobmV3IEdpdEh1YlB1bGxSZXF1ZXN0UmV2aWV3VGhyZWFkc01vZGVsKCdvd25lcicsICdyZXBvJywgMSwgbW9ja0ZldGNoZXIgYXMgdW5rbm93biBhcyBHaXRIdWJQUkZldGNoZXIsIGxvZ1NlcnZpY2UpKTtcblx0XHRjb25zdCBwb2xsaW5nID0gbW9kZWwuc3RhcnRQb2xsaW5nKDYwXzAwMCk7XG5cdFx0cG9sbGluZy5kaXNwb3NlKCk7XG5cdFx0cG9sbGluZy5kaXNwb3NlKCk7XG5cdH0pO1xuXG5cdHRlc3QoJ3BvbGxpbmcgc3RvcHMgd2hlbiB0aGUgbGFzdCBjbGllbnQgc3RvcHMgcG9sbGluZycsICgpID0+IHJ1bldpdGhGYWtlZFRpbWVyczx2b2lkPih7IHVzZUZha2VUaW1lcnM6IHRydWUgfSwgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IG1vZGVsID0gc3RvcmUuYWRkKG5ldyBHaXRIdWJQdWxsUmVxdWVzdFJldmlld1RocmVhZHNNb2RlbCgnb3duZXInLCAncmVwbycsIDEsIG1vY2tGZXRjaGVyIGFzIHVua25vd24gYXMgR2l0SHViUFJGZXRjaGVyLCBsb2dTZXJ2aWNlKSk7XG5cdFx0bW9ja0ZldGNoZXIubmV4dFRocmVhZHMgPSBbbWFrZVRocmVhZCgndGhyZWFkLTEwMCcsICdzcmMvYS50cycpXTtcblx0XHRtb2NrRmV0Y2hlci5nZXRSZXZpZXdUaHJlYWRzR2F0ZSA9IG5ldyBEZWZlcnJlZFByb21pc2U8dm9pZD4oKTtcblxuXHRcdGNvbnN0IGZpcnN0UG9sbGluZyA9IG1vZGVsLnN0YXJ0UG9sbGluZygxMCk7XG5cdFx0Y29uc3Qgc2Vjb25kUG9sbGluZyA9IG1vZGVsLnN0YXJ0UG9sbGluZygxXzAwMCk7XG5cdFx0Zmlyc3RQb2xsaW5nLmRpc3Bvc2UoKTtcblxuXHRcdGF3YWl0IHRpbWVvdXQoMTApO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChtb2NrRmV0Y2hlci5nZXRSZXZpZXdUaHJlYWRzQ2FsbHMsIDEpO1xuXG5cdFx0YXdhaXQgbW9ja0ZldGNoZXIuZ2V0UmV2aWV3VGhyZWFkc0dhdGUuY29tcGxldGUodW5kZWZpbmVkKTtcblx0XHRhd2FpdCB0aW1lb3V0KDApO1xuXHRcdGF3YWl0IHRpbWVvdXQoNjBfMDAwKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobW9ja0ZldGNoZXIuZ2V0UmV2aWV3VGhyZWFkc0NhbGxzLCAyKTtcblxuXHRcdHNlY29uZFBvbGxpbmcuZGlzcG9zZSgpO1xuXHRcdGF3YWl0IHRpbWVvdXQoNjBfMDAwKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChtb2NrRmV0Y2hlci5nZXRSZXZpZXdUaHJlYWRzQ2FsbHMsIDIpO1xuXHR9KSk7XG59KTtcblxuc3VpdGUoJ0dpdEh1YlB1bGxSZXF1ZXN0Q0lNb2RlbCcsICgpID0+IHtcblxuXHRjb25zdCBzdG9yZSA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblx0bGV0IG1vY2tGZXRjaGVyOiBNb2NrQ0lGZXRjaGVyO1xuXHRsZXQgY29sbGVjdGlvbjogVGVzdENJUmVmZXJlbmNlQ29sbGVjdGlvbjtcblx0bGV0IHN0b3JhZ2VTZXJ2aWNlOiBUZXN0U3RvcmFnZVNlcnZpY2U7XG5cdGNvbnN0IGxvZ1NlcnZpY2UgPSBuZXcgTnVsbExvZ1NlcnZpY2UoKTtcblxuXHRmdW5jdGlvbiBhY3F1aXJlTW9kZWwob3duZXI6IHN0cmluZyA9ICdvd25lcicsIHJlcG86IHN0cmluZyA9ICdyZXBvJywgcHJOdW1iZXI6IG51bWJlciA9IDEsIGhlYWRTaGE6IHN0cmluZyA9ICdhYmMnKTogR2l0SHViUHVsbFJlcXVlc3RDSU1vZGVsIHtcblx0XHRjb25zdCByZWYgPSBjb2xsZWN0aW9uLmFjcXVpcmUoYCR7b3duZXJ9LyR7cmVwb30vJHtwck51bWJlcn0vJHtoZWFkU2hhfWAsIG93bmVyLCByZXBvLCBwck51bWJlciwgaGVhZFNoYSk7XG5cdFx0c3RvcmUuYWRkKHJlZik7XG5cdFx0cmV0dXJuIHJlZi5vYmplY3Q7XG5cdH1cblxuXHRzZXR1cCgoKSA9PiB7XG5cdFx0bW9ja0ZldGNoZXIgPSBuZXcgTW9ja0NJRmV0Y2hlcigpO1xuXHRcdHN0b3JhZ2VTZXJ2aWNlID0gc3RvcmUuYWRkKG5ldyBUZXN0U3RvcmFnZVNlcnZpY2UoKSk7XG5cdFx0Y29sbGVjdGlvbiA9IG5ldyBUZXN0Q0lSZWZlcmVuY2VDb2xsZWN0aW9uKG1vY2tGZXRjaGVyIGFzIHVua25vd24gYXMgR2l0SHViUFJDSUZldGNoZXIsIGxvZ1NlcnZpY2UsIHN0b3JhZ2VTZXJ2aWNlKTtcblx0fSk7XG5cblx0dGVhcmRvd24oKCkgPT4gc3RvcmUuY2xlYXIoKSk7XG5cblx0ZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlKCk7XG5cblx0dGVzdCgnaW5pdGlhbCBzdGF0ZSBpcyBlbXB0eScsICgpID0+IHtcblx0XHRjb25zdCBtb2RlbCA9IGFjcXVpcmVNb2RlbCgpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwobW9kZWwuY2hlY2tzLmdldCgpLCBbXSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1vZGVsLm92ZXJhbGxTdGF0dXMuZ2V0KCksIEdpdEh1YkNJT3ZlcmFsbFN0YXR1cy5OZXV0cmFsKTtcblx0fSk7XG5cblx0dGVzdCgnYWNxdWlyaW5nIHdpdGggdGhlIHNhbWUga2V5IHJldHVybnMgdGhlIHNhbWUgbW9kZWwnLCAoKSA9PiB7XG5cdFx0Y29uc3QgZmlyc3QgPSBhY3F1aXJlTW9kZWwoKTtcblx0XHRjb25zdCBzZWNvbmQgPSBhY3F1aXJlTW9kZWwoKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZmlyc3QsIHNlY29uZCk7XG5cdH0pO1xuXG5cdHRlc3QoJ2ZpeFJlcXVlc3RlZCBpcyByZW1lbWJlcmVkIHBlciBQUiBoZWFkIGNvbW1pdCcsICgpID0+IHtcblx0XHRjb25zdCBtb2RlbCA9IGFjcXVpcmVNb2RlbCgnb3duZXInLCAncmVwbycsIDEsICdzaGEtMScpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChtb2RlbC5maXhSZXF1ZXN0ZWQuZ2V0KCksIGZhbHNlKTtcblxuXHRcdG1vZGVsLm1hcmtGaXhSZXF1ZXN0ZWQoKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobW9kZWwuZml4UmVxdWVzdGVkLmdldCgpLCB0cnVlKTtcblxuXHRcdC8vIEEgYnJhbmQtbmV3IG1vZGVsIGluc3RhbmNlIGZvciB0aGUgc2FtZSBQUiBoZWFkIGNvbW1pdCByZWxvYWRzIHRoZVxuXHRcdC8vIHJlbWVtYmVyZWQgZml4IGZyb20gc3RvcmFnZSAoY29uc3RydWN0IGRpcmVjdGx5IHRvIGJ5cGFzcyB0aGVcblx0XHQvLyByZWZlcmVuY2UgY29sbGVjdGlvbidzIGluc3RhbmNlIGNhY2hlKS5cblx0XHRjb25zdCByZWxvYWRlZFNhbWVDb21taXQgPSBzdG9yZS5hZGQobmV3IEdpdEh1YlB1bGxSZXF1ZXN0Q0lNb2RlbCgnb3duZXInLCAncmVwbycsIDEsICdzaGEtMScsIG1vY2tGZXRjaGVyIGFzIHVua25vd24gYXMgR2l0SHViUFJDSUZldGNoZXIsIGxvZ1NlcnZpY2UsIHN0b3JhZ2VTZXJ2aWNlKSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlbG9hZGVkU2FtZUNvbW1pdC5maXhSZXF1ZXN0ZWQuZ2V0KCksIHRydWUpO1xuXG5cdFx0Ly8gQSBuZXcgY29tbWl0IG9uIHRoZSBzYW1lIFBSOiB0aGUgZml4IHNob3VsZCBubyBsb25nZXIgYmUgcmVtZW1iZXJlZC5cblx0XHRjb25zdCBuZXdDb21taXQgPSBzdG9yZS5hZGQobmV3IEdpdEh1YlB1bGxSZXF1ZXN0Q0lNb2RlbCgnb3duZXInLCAncmVwbycsIDEsICdzaGEtMicsIG1vY2tGZXRjaGVyIGFzIHVua25vd24gYXMgR2l0SHViUFJDSUZldGNoZXIsIGxvZ1NlcnZpY2UsIHN0b3JhZ2VTZXJ2aWNlKSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG5ld0NvbW1pdC5maXhSZXF1ZXN0ZWQuZ2V0KCksIGZhbHNlKTtcblx0fSk7XG5cblx0dGVzdCgncmVmcmVzaCBwb3B1bGF0ZXMgY2hlY2tzIGFuZCBjb21wdXRlcyBvdmVyYWxsIHN0YXR1cycsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBtb2RlbCA9IGFjcXVpcmVNb2RlbCgpO1xuXHRcdG1vY2tGZXRjaGVyLm5leHRDaGVja3MgPSBbXG5cdFx0XHR7IGlkOiAxLCBuYW1lOiAnYnVpbGQnLCBzdGF0dXM6IEdpdEh1YkNoZWNrU3RhdHVzLkNvbXBsZXRlZCwgY29uY2x1c2lvbjogR2l0SHViQ2hlY2tDb25jbHVzaW9uLlN1Y2Nlc3MsIHN0YXJ0ZWRBdDogdW5kZWZpbmVkLCBjb21wbGV0ZWRBdDogdW5kZWZpbmVkLCBkZXRhaWxzVXJsOiB1bmRlZmluZWQgfSxcblx0XHRcdHsgaWQ6IDIsIG5hbWU6ICd0ZXN0Jywgc3RhdHVzOiBHaXRIdWJDaGVja1N0YXR1cy5Db21wbGV0ZWQsIGNvbmNsdXNpb246IEdpdEh1YkNoZWNrQ29uY2x1c2lvbi5GYWlsdXJlLCBzdGFydGVkQXQ6IHVuZGVmaW5lZCwgY29tcGxldGVkQXQ6IHVuZGVmaW5lZCwgZGV0YWlsc1VybDogdW5kZWZpbmVkIH0sXG5cdFx0XTtcblxuXHRcdGF3YWl0IG1vZGVsLnJlZnJlc2goKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobW9kZWwuY2hlY2tzLmdldCgpLmxlbmd0aCwgMik7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1vZGVsLm92ZXJhbGxTdGF0dXMuZ2V0KCksIEdpdEh1YkNJT3ZlcmFsbFN0YXR1cy5GYWlsdXJlKTtcblx0fSk7XG5cblx0dGVzdCgncmVmcmVzaCBzaGFyZXMgYW4gaW4tcHJvZ3Jlc3MgcmVxdWVzdCcsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBtb2RlbCA9IGFjcXVpcmVNb2RlbCgpO1xuXHRcdG1vY2tGZXRjaGVyLm5leHRDaGVja3MgPSBbXG5cdFx0XHR7IGlkOiAxLCBuYW1lOiAnYnVpbGQnLCBzdGF0dXM6IEdpdEh1YkNoZWNrU3RhdHVzLkNvbXBsZXRlZCwgY29uY2x1c2lvbjogR2l0SHViQ2hlY2tDb25jbHVzaW9uLlN1Y2Nlc3MsIHN0YXJ0ZWRBdDogdW5kZWZpbmVkLCBjb21wbGV0ZWRBdDogdW5kZWZpbmVkLCBkZXRhaWxzVXJsOiB1bmRlZmluZWQgfSxcblx0XHRdO1xuXHRcdG1vY2tGZXRjaGVyLmdldENoZWNrUnVuc0dhdGUgPSBuZXcgRGVmZXJyZWRQcm9taXNlPHZvaWQ+KCk7XG5cblx0XHRjb25zdCBmaXJzdFJlZnJlc2ggPSBtb2RlbC5yZWZyZXNoKCk7XG5cdFx0Y29uc3Qgc2Vjb25kUmVmcmVzaCA9IG1vZGVsLnJlZnJlc2goKTtcblxuXHRcdHRyeSB7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdFx0c2FtZVByb21pc2U6IGZpcnN0UmVmcmVzaCA9PT0gc2Vjb25kUmVmcmVzaCxcblx0XHRcdFx0Z2V0Q2hlY2tSdW5zQ2FsbHM6IG1vY2tGZXRjaGVyLmdldENoZWNrUnVuc0NhbGxzLFxuXHRcdFx0fSwge1xuXHRcdFx0XHRzYW1lUHJvbWlzZTogdHJ1ZSxcblx0XHRcdFx0Z2V0Q2hlY2tSdW5zQ2FsbHM6IDEsXG5cdFx0XHR9KTtcblx0XHR9IGZpbmFsbHkge1xuXHRcdFx0YXdhaXQgbW9ja0ZldGNoZXIuZ2V0Q2hlY2tSdW5zR2F0ZS5jb21wbGV0ZSh1bmRlZmluZWQpO1xuXHRcdH1cblxuXHRcdGF3YWl0IGZpcnN0UmVmcmVzaDtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdGNoZWNrczogbW9kZWwuY2hlY2tzLmdldCgpLm1hcChjaGVjayA9PiBjaGVjay5pZCksXG5cdFx0XHRnZXRDaGVja1J1bnNDYWxsczogbW9ja0ZldGNoZXIuZ2V0Q2hlY2tSdW5zQ2FsbHMsXG5cdFx0fSwge1xuXHRcdFx0Y2hlY2tzOiBbMV0sXG5cdFx0XHRnZXRDaGVja1J1bnNDYWxsczogMSxcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnZ2V0Q2hlY2tSdW5Bbm5vdGF0aW9ucyBkZWxlZ2F0ZXMgdG8gZmV0Y2hlcicsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBtb2RlbCA9IGFjcXVpcmVNb2RlbCgpO1xuXHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IG1vZGVsLmdldENoZWNrUnVuQW5ub3RhdGlvbnMoMSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdCwgJ21vY2sgYW5ub3RhdGlvbnMnKTtcblx0fSk7XG5cblx0dGVzdCgncmVydW5GYWlsZWRDaGVjayByZWZyZXNoZXMgYWZ0ZXIgYW4gaW4tcHJvZ3Jlc3MgcmVmcmVzaCBjb21wbGV0ZXMnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgbW9kZWwgPSBhY3F1aXJlTW9kZWwoKTtcblx0XHRtb2NrRmV0Y2hlci5uZXh0Q2hlY2tzID0gW1xuXHRcdFx0eyBpZDogMSwgbmFtZTogJ2J1aWxkJywgc3RhdHVzOiBHaXRIdWJDaGVja1N0YXR1cy5Db21wbGV0ZWQsIGNvbmNsdXNpb246IEdpdEh1YkNoZWNrQ29uY2x1c2lvbi5GYWlsdXJlLCBzdGFydGVkQXQ6IHVuZGVmaW5lZCwgY29tcGxldGVkQXQ6IHVuZGVmaW5lZCwgZGV0YWlsc1VybDogJ2h0dHBzOi8vZ2l0aHViLmNvbS9vd25lci9yZXBvL2FjdGlvbnMvcnVucy8xMjM0NS9qb2IvNjc4OTAnIH0sXG5cdFx0XTtcblx0XHRtb2NrRmV0Y2hlci5nZXRDaGVja1J1bnNHYXRlID0gbmV3IERlZmVycmVkUHJvbWlzZTx2b2lkPigpO1xuXG5cdFx0Y29uc3QgaW5Qcm9ncmVzc1JlZnJlc2ggPSBtb2RlbC5yZWZyZXNoKCk7XG5cdFx0bW9ja0ZldGNoZXIubmV4dENoZWNrcyA9IFtcblx0XHRcdHsgaWQ6IDEsIG5hbWU6ICdidWlsZCcsIHN0YXR1czogR2l0SHViQ2hlY2tTdGF0dXMuQ29tcGxldGVkLCBjb25jbHVzaW9uOiBHaXRIdWJDaGVja0NvbmNsdXNpb24uU3VjY2Vzcywgc3RhcnRlZEF0OiB1bmRlZmluZWQsIGNvbXBsZXRlZEF0OiB1bmRlZmluZWQsIGRldGFpbHNVcmw6ICdodHRwczovL2dpdGh1Yi5jb20vb3duZXIvcmVwby9hY3Rpb25zL3J1bnMvMTIzNDUvam9iLzY3ODkwJyB9LFxuXHRcdF07XG5cdFx0Y29uc3QgcmVydW4gPSBtb2RlbC5yZXJ1bkZhaWxlZENoZWNrKHsgaWQ6IDEsIG5hbWU6ICdidWlsZCcsIHN0YXR1czogR2l0SHViQ2hlY2tTdGF0dXMuQ29tcGxldGVkLCBjb25jbHVzaW9uOiBHaXRIdWJDaGVja0NvbmNsdXNpb24uRmFpbHVyZSwgc3RhcnRlZEF0OiB1bmRlZmluZWQsIGNvbXBsZXRlZEF0OiB1bmRlZmluZWQsIGRldGFpbHNVcmw6ICdodHRwczovL2dpdGh1Yi5jb20vb3duZXIvcmVwby9hY3Rpb25zL3J1bnMvMTIzNDUvam9iLzY3ODkwJyB9KTtcblxuXHRcdGF3YWl0IG1vY2tGZXRjaGVyLmdldENoZWNrUnVuc0dhdGUuY29tcGxldGUodW5kZWZpbmVkKTtcblx0XHRhd2FpdCBpblByb2dyZXNzUmVmcmVzaDtcblx0XHRhd2FpdCByZXJ1bjtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0Y2hlY2tzOiBtb2RlbC5jaGVja3MuZ2V0KCkubWFwKGNoZWNrID0+IGNoZWNrLmNvbmNsdXNpb24pLFxuXHRcdFx0Z2V0Q2hlY2tSdW5zQ2FsbHM6IG1vY2tGZXRjaGVyLmdldENoZWNrUnVuc0NhbGxzLFxuXHRcdH0sIHtcblx0XHRcdGNoZWNrczogW0dpdEh1YkNoZWNrQ29uY2x1c2lvbi5TdWNjZXNzXSxcblx0XHRcdGdldENoZWNrUnVuc0NhbGxzOiAyLFxuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdwb2xsaW5nIHN0b3BzIHdoZW4gdGhlIGxhc3QgY2xpZW50IHN0b3BzIHBvbGxpbmcnLCAoKSA9PiBydW5XaXRoRmFrZWRUaW1lcnM8dm9pZD4oeyB1c2VGYWtlVGltZXJzOiB0cnVlIH0sIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBtb2RlbCA9IGFjcXVpcmVNb2RlbCgpO1xuXHRcdG1vY2tGZXRjaGVyLm5leHRDaGVja3MgPSBbXG5cdFx0XHR7IGlkOiAxLCBuYW1lOiAnYnVpbGQnLCBzdGF0dXM6IEdpdEh1YkNoZWNrU3RhdHVzLkNvbXBsZXRlZCwgY29uY2x1c2lvbjogR2l0SHViQ2hlY2tDb25jbHVzaW9uLlN1Y2Nlc3MsIHN0YXJ0ZWRBdDogdW5kZWZpbmVkLCBjb21wbGV0ZWRBdDogdW5kZWZpbmVkLCBkZXRhaWxzVXJsOiB1bmRlZmluZWQgfSxcblx0XHRdO1xuXHRcdG1vY2tGZXRjaGVyLmdldENoZWNrUnVuc0dhdGUgPSBuZXcgRGVmZXJyZWRQcm9taXNlPHZvaWQ+KCk7XG5cblx0XHRjb25zdCBmaXJzdFBvbGxpbmcgPSBtb2RlbC5zdGFydFBvbGxpbmcoMTApO1xuXHRcdGNvbnN0IHNlY29uZFBvbGxpbmcgPSBtb2RlbC5zdGFydFBvbGxpbmcoMV8wMDApO1xuXHRcdGZpcnN0UG9sbGluZy5kaXNwb3NlKCk7XG5cblx0XHRhd2FpdCB0aW1lb3V0KDEwKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobW9ja0ZldGNoZXIuZ2V0Q2hlY2tSdW5zQ2FsbHMsIDEpO1xuXG5cdFx0YXdhaXQgbW9ja0ZldGNoZXIuZ2V0Q2hlY2tSdW5zR2F0ZS5jb21wbGV0ZSh1bmRlZmluZWQpO1xuXHRcdGF3YWl0IHRpbWVvdXQoMCk7XG5cdFx0YXdhaXQgdGltZW91dCg2MF8wMDApO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChtb2NrRmV0Y2hlci5nZXRDaGVja1J1bnNDYWxscywgMik7XG5cblx0XHRzZWNvbmRQb2xsaW5nLmRpc3Bvc2UoKTtcblx0XHRhd2FpdCB0aW1lb3V0KDYwXzAwMCk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobW9ja0ZldGNoZXIuZ2V0Q2hlY2tSdW5zQ2FsbHMsIDIpO1xuXHR9KSk7XG59KTtcblxuc3VpdGUoJ0dpdEh1Yklzc3VlTW9kZWwnLCAoKSA9PiB7XG5cblx0Y29uc3Qgc3RvcmUgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cdGNvbnN0IGxvZ1NlcnZpY2UgPSBuZXcgTnVsbExvZ1NlcnZpY2UoKTtcblxuXHQvKipcblx0ICogU3RhbmRzIGluIGZvciB0aGUgbG93LWxldmVsIEFQSSBjbGllbnQgc28gdGhlIHRlc3RzIGNhbiBvYnNlcnZlIHRoZSBleGFjdFxuXHQgKiBgSWYtTm9uZS1NYXRjaGAgdmFsdWUgZWFjaCByZXF1ZXN0IGNhcnJpZXMgYW5kIHJlcGxheSBgMzA0YCByZXNwb25zZXMuXG5cdCAqL1xuXHRjbGFzcyBNb2NrR2l0SHViQXBpQ2xpZW50IHtcblx0XHRyZWFkb25seSBzZW50RVRhZ3M6IChzdHJpbmcgfCB1bmRlZmluZWQpW10gPSBbXTtcblx0XHRyZWFkb25seSByZXNwb25zZXM6IHsgZGF0YT86IHVua25vd247IHN0YXR1c0NvZGU6IG51bWJlcjsgZXRhZz86IHN0cmluZyB9W10gPSBbXTtcblxuXHRcdGFzeW5jIHJlcXVlc3QoX21ldGhvZDogc3RyaW5nLCBfcGF0aDogc3RyaW5nLCBfY2FsbFNpdGU6IHN0cmluZywgb3B0aW9ucz86IHsgZXRhZz86IHN0cmluZyB9KSB7XG5cdFx0XHR0aGlzLnNlbnRFVGFncy5wdXNoKG9wdGlvbnM/LmV0YWcpO1xuXHRcdFx0cmV0dXJuIHRoaXMucmVzcG9uc2VzLnNoaWZ0KCkgPz8geyBkYXRhOiB1bmRlZmluZWQsIHN0YXR1c0NvZGU6IDMwNCB9O1xuXHRcdH1cblx0fVxuXG5cdGZ1bmN0aW9uIGlzc3VlUmVzcG9uc2Uoc3RhdGU6ICdvcGVuJyB8ICdjbG9zZWQnLCB0aXRsZTogc3RyaW5nKSB7XG5cdFx0cmV0dXJuIHtcblx0XHRcdG51bWJlcjogNyxcblx0XHRcdHRpdGxlLFxuXHRcdFx0Ym9keTogJ2JvZHknLFxuXHRcdFx0c3RhdGUsXG5cdFx0XHRzdGF0ZV9yZWFzb246IHN0YXRlID09PSAnY2xvc2VkJyA/ICdjb21wbGV0ZWQnIDogbnVsbCxcblx0XHRcdHVzZXI6IHsgbG9naW46ICdvY3RvY2F0JywgYXZhdGFyX3VybDogJycgfSxcblx0XHRcdGNyZWF0ZWRfYXQ6ICcyMDI2LTAxLTAxVDAwOjAwOjAwWicsXG5cdFx0XHR1cGRhdGVkX2F0OiAnMjAyNi0wMS0wMlQwMDowMDowMFonLFxuXHRcdFx0Y2xvc2VkX2F0OiBudWxsLFxuXHRcdH07XG5cdH1cblxuXHRmdW5jdGlvbiBjcmVhdGVDb2xsZWN0aW9uKGNsaWVudDogTW9ja0dpdEh1YkFwaUNsaWVudCkge1xuXHRcdHJldHVybiBuZXcgR2l0SHViSXNzdWVNb2RlbFJlZmVyZW5jZUNvbGxlY3Rpb24oY2xpZW50IGFzIHVua25vd24gYXMgR2l0SHViQXBpQ2xpZW50LCBsb2dTZXJ2aWNlKTtcblx0fVxuXG5cdHRlYXJkb3duKCgpID0+IHN0b3JlLmNsZWFyKCkpO1xuXG5cdGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSgpO1xuXG5cdHRlc3QoJ3JldmFsaWRhdGVzIHdpdGggdGhlIHN0b3JlZCBFVGFnIGFuZCBrZWVwcyB0aGUgbGFzdCBwYXlsb2FkIG9uIDMwNCcsICgpID0+IHJ1bldpdGhGYWtlZFRpbWVyczx2b2lkPih7IHVzZUZha2VUaW1lcnM6IHRydWUgfSwgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IGNsaWVudCA9IG5ldyBNb2NrR2l0SHViQXBpQ2xpZW50KCk7XG5cdFx0Y2xpZW50LnJlc3BvbnNlcy5wdXNoKHsgZGF0YTogaXNzdWVSZXNwb25zZSgnb3BlbicsICdPcmlnaW5hbCcpLCBzdGF0dXNDb2RlOiAyMDAsIGV0YWc6ICdXL1widjFcIicgfSk7XG5cdFx0Y2xpZW50LnJlc3BvbnNlcy5wdXNoKHsgZGF0YTogdW5kZWZpbmVkLCBzdGF0dXNDb2RlOiAzMDQsIGV0YWc6ICdXL1widjFcIicgfSk7XG5cdFx0Y29uc3QgY29sbGVjdGlvbiA9IGNyZWF0ZUNvbGxlY3Rpb24oY2xpZW50KTtcblx0XHRjb25zdCByZWZlcmVuY2UgPSBzdG9yZS5hZGQoY29sbGVjdGlvbi5hY3F1aXJlKCdvd25lci9yZXBvL2lzc3Vlcy83JywgJ293bmVyJywgJ3JlcG8nLCA3KSk7XG5cblx0XHRhd2FpdCByZWZlcmVuY2Uub2JqZWN0LnJlZnJlc2goKTtcblx0XHRhd2FpdCB0aW1lb3V0KE1JTl9SRUZSRVNIX0lOVEVSVkFMX01TKTtcblx0XHRhd2FpdCByZWZlcmVuY2Uub2JqZWN0LnJlZnJlc2goKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0c2VudEVUYWdzOiBjbGllbnQuc2VudEVUYWdzLFxuXHRcdFx0dGl0bGU6IHJlZmVyZW5jZS5vYmplY3QuaXNzdWUuZ2V0KCk/LnRpdGxlLFxuXHRcdH0sIHtcblx0XHRcdHNlbnRFVGFnczogW3VuZGVmaW5lZCwgJ1cvXCJ2MVwiJ10sXG5cdFx0XHR0aXRsZTogJ09yaWdpbmFsJyxcblx0XHR9KTtcblx0fSkpO1xuXG5cdHRlc3QoJ29uLWRlbWFuZCByZWZyZXNoZXMgaW5zaWRlIHRoZSBkZWJvdW5jZSB3aW5kb3cgY29sbGFwc2UgaW50byBvbmUgcmVxdWVzdCcsICgpID0+IHJ1bldpdGhGYWtlZFRpbWVyczx2b2lkPih7IHVzZUZha2VUaW1lcnM6IHRydWUgfSwgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IGNsaWVudCA9IG5ldyBNb2NrR2l0SHViQXBpQ2xpZW50KCk7XG5cdFx0Y2xpZW50LnJlc3BvbnNlcy5wdXNoKHsgZGF0YTogaXNzdWVSZXNwb25zZSgnb3BlbicsICdPcmlnaW5hbCcpLCBzdGF0dXNDb2RlOiAyMDAsIGV0YWc6ICdXL1widjFcIicgfSk7XG5cdFx0Y29uc3QgY29sbGVjdGlvbiA9IGNyZWF0ZUNvbGxlY3Rpb24oY2xpZW50KTtcblx0XHRjb25zdCByZWZlcmVuY2UgPSBzdG9yZS5hZGQoY29sbGVjdGlvbi5hY3F1aXJlKCdvd25lci9yZXBvL2lzc3Vlcy83JywgJ293bmVyJywgJ3JlcG8nLCA3KSk7XG5cblx0XHRhd2FpdCByZWZlcmVuY2Uub2JqZWN0LnJlZnJlc2goKTtcblx0XHRhd2FpdCB0aW1lb3V0KE1JTl9SRUZSRVNIX0lOVEVSVkFMX01TIC0gMSk7XG5cdFx0YXdhaXQgcmVmZXJlbmNlLm9iamVjdC5yZWZyZXNoKCk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY2xpZW50LnNlbnRFVGFncy5sZW5ndGgsIDEpO1xuXHR9KSk7XG5cblx0dGVzdCgnYSByZS1jcmVhdGVkIG1vZGVsIHN0YXJ0cyBmcm9tIHRoZSBwcmV2aW91cyBvbmVcXCdzIHBheWxvYWQgYW5kIEVUYWcnLCAoKSA9PiBydW5XaXRoRmFrZWRUaW1lcnM8dm9pZD4oeyB1c2VGYWtlVGltZXJzOiB0cnVlIH0sIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBjbGllbnQgPSBuZXcgTW9ja0dpdEh1YkFwaUNsaWVudCgpO1xuXHRcdGNsaWVudC5yZXNwb25zZXMucHVzaCh7IGRhdGE6IGlzc3VlUmVzcG9uc2UoJ29wZW4nLCAnT3JpZ2luYWwnKSwgc3RhdHVzQ29kZTogMjAwLCBldGFnOiAnVy9cInYxXCInIH0pO1xuXHRcdGNsaWVudC5yZXNwb25zZXMucHVzaCh7IGRhdGE6IGlzc3VlUmVzcG9uc2UoJ2Nsb3NlZCcsICdPcmlnaW5hbCcpLCBzdGF0dXNDb2RlOiAyMDAsIGV0YWc6ICdXL1widjJcIicgfSk7XG5cdFx0Y29uc3QgY29sbGVjdGlvbiA9IGNyZWF0ZUNvbGxlY3Rpb24oY2xpZW50KTtcblxuXHRcdGNvbnN0IGZpcnN0ID0gY29sbGVjdGlvbi5hY3F1aXJlKCdvd25lci9yZXBvL2lzc3Vlcy83JywgJ293bmVyJywgJ3JlcG8nLCA3KTtcblx0XHRhd2FpdCBmaXJzdC5vYmplY3QucmVmcmVzaCgpO1xuXHRcdGZpcnN0LmRpc3Bvc2UoKTtcblxuXHRcdGNvbnN0IHNlY29uZCA9IHN0b3JlLmFkZChjb2xsZWN0aW9uLmFjcXVpcmUoJ293bmVyL3JlcG8vaXNzdWVzLzcnLCAnb3duZXInLCAncmVwbycsIDcpKTtcblx0XHRjb25zdCByZXN0b3JlZFN0YXRlID0gc2Vjb25kLm9iamVjdC5pc3N1ZS5nZXQoKT8uc3RhdGU7XG5cdFx0YXdhaXQgdGltZW91dChNSU5fUkVGUkVTSF9JTlRFUlZBTF9NUyk7XG5cdFx0YXdhaXQgc2Vjb25kLm9iamVjdC5yZWZyZXNoKCk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdHJlc3RvcmVkU3RhdGUsXG5cdFx0XHRzZW50RVRhZ3M6IGNsaWVudC5zZW50RVRhZ3MsXG5cdFx0XHRzdGF0ZTogc2Vjb25kLm9iamVjdC5pc3N1ZS5nZXQoKT8uc3RhdGUsXG5cdFx0fSwge1xuXHRcdFx0cmVzdG9yZWRTdGF0ZTogR2l0SHViSXNzdWVTdGF0ZS5PcGVuLFxuXHRcdFx0c2VudEVUYWdzOiBbdW5kZWZpbmVkLCAnVy9cInYxXCInXSxcblx0XHRcdHN0YXRlOiBHaXRIdWJJc3N1ZVN0YXRlLkNsb3NlZCxcblx0XHR9KTtcblx0fSkpO1xufSk7XG5cbnN1aXRlKCdwYXJzZVdvcmtmbG93UnVuSWQnLCAoKSA9PiB7XG5cblx0ZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlKCk7XG5cblx0dGVzdCgnZXh0cmFjdHMgcnVuIElEIGZyb20gR2l0SHViIEFjdGlvbnMgVVJMJywgKCkgPT4ge1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChcblx0XHRcdHBhcnNlV29ya2Zsb3dSdW5JZCgnaHR0cHM6Ly9naXRodWIuY29tL21pY3Jvc29mdC92c2NvZGUvYWN0aW9ucy9ydW5zLzEyMzQ1L2pvYi82Nzg5MCcpLFxuXHRcdFx0MTIzNDUsXG5cdFx0KTtcblx0fSk7XG5cblx0dGVzdCgnZXh0cmFjdHMgcnVuIElEIGZyb20gVVJMIHdpdGhvdXQgam9iIHNlZ21lbnQnLCAoKSA9PiB7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKFxuXHRcdFx0cGFyc2VXb3JrZmxvd1J1bklkKCdodHRwczovL2dpdGh1Yi5jb20vb3duZXIvcmVwby9hY3Rpb25zL3J1bnMvOTk5OTknKSxcblx0XHRcdDk5OTk5LFxuXHRcdCk7XG5cdH0pO1xuXG5cdHRlc3QoJ3JldHVybnMgdW5kZWZpbmVkIGZvciBub24tQWN0aW9ucyBVUkwnLCAoKSA9PiB7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHBhcnNlV29ya2Zsb3dSdW5JZCgnaHR0cHM6Ly9leGFtcGxlLmNvbS9jaGVjay8xJyksIHVuZGVmaW5lZCk7XG5cdH0pO1xuXG5cdHRlc3QoJ3JldHVybnMgdW5kZWZpbmVkIGZvciB1bmRlZmluZWQgaW5wdXQnLCAoKSA9PiB7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHBhcnNlV29ya2Zsb3dSdW5JZCh1bmRlZmluZWQpLCB1bmRlZmluZWQpO1xuXHR9KTtcbn0pO1xuXG5cbi8vI3JlZ2lvbiBUZXN0IEhlbHBlcnNcblxuY2xhc3MgVGVzdENJUmVmZXJlbmNlQ29sbGVjdGlvbiBleHRlbmRzIEdpdEh1YlB1bGxSZXF1ZXN0Q0lNb2RlbFJlZmVyZW5jZUNvbGxlY3Rpb24ge1xuXHRjb25zdHJ1Y3Rvcihcblx0XHRwcml2YXRlIHJlYWRvbmx5IF90ZXN0RmV0Y2hlcjogR2l0SHViUFJDSUZldGNoZXIsXG5cdFx0bG9nU2VydmljZTogSUxvZ1NlcnZpY2UsXG5cdFx0cHJpdmF0ZSByZWFkb25seSBfdGVzdFN0b3JhZ2VTZXJ2aWNlOiBJU3RvcmFnZVNlcnZpY2UsXG5cdCkge1xuXHRcdC8vIFRoZSBiYXNlIGNvbnN0cnVjdG9yIGluc3RhbnRpYXRlcyBhIGZldGNoZXIgZnJvbSB0aGUgYXBpQ2xpZW50OyBwYXNzIGFcblx0XHQvLyBkdW1teSBiZWNhdXNlIHdlIG92ZXJyaWRlIGNyZWF0ZVJlZmVyZW5jZWRPYmplY3QgYmVsb3cgdG8gaW5qZWN0IHRoZVxuXHRcdC8vIHRlc3QgZmV0Y2hlciBpbnN0ZWFkLlxuXHRcdHN1cGVyKHVuZGVmaW5lZCBhcyBuZXZlciwgbG9nU2VydmljZSwgX3Rlc3RTdG9yYWdlU2VydmljZSk7XG5cdH1cblxuXHRwcm90ZWN0ZWQgb3ZlcnJpZGUgY3JlYXRlUmVmZXJlbmNlZE9iamVjdChfa2V5OiBzdHJpbmcsIG93bmVyOiBzdHJpbmcsIHJlcG86IHN0cmluZywgcHJOdW1iZXI6IG51bWJlciwgaGVhZFNoYTogc3RyaW5nKTogR2l0SHViUHVsbFJlcXVlc3RDSU1vZGVsIHtcblx0XHRyZXR1cm4gbmV3IEdpdEh1YlB1bGxSZXF1ZXN0Q0lNb2RlbChvd25lciwgcmVwbywgcHJOdW1iZXIsIGhlYWRTaGEsIHRoaXMuX3Rlc3RGZXRjaGVyLCBuZXcgTnVsbExvZ1NlcnZpY2UoKSwgdGhpcy5fdGVzdFN0b3JhZ2VTZXJ2aWNlKTtcblx0fVxufVxuXG5mdW5jdGlvbiBtYWtlUmVwb3NpdG9yeSgpOiBJR2l0SHViUmVwb3NpdG9yeSB7XG5cdHJldHVybiB7XG5cdFx0b3duZXI6ICdvd25lcicsXG5cdFx0bmFtZTogJ3JlcG8nLFxuXHRcdGZ1bGxOYW1lOiAnb3duZXIvcmVwbycsXG5cdFx0ZGVmYXVsdEJyYW5jaDogJ21haW4nLFxuXHRcdGlzUHJpdmF0ZTogZmFsc2UsXG5cdFx0ZGVzY3JpcHRpb246ICd0ZXN0Jyxcblx0fTtcbn1cblxuZnVuY3Rpb24gbWFrZVBSKCk6IElHaXRIdWJQdWxsUmVxdWVzdCB7XG5cdHJldHVybiB7XG5cdFx0bnVtYmVyOiAxLFxuXHRcdHRpdGxlOiAnVGVzdCBQUicsXG5cdFx0Ym9keTogJ1Rlc3QgYm9keScsXG5cdFx0c3RhdGU6IEdpdEh1YlB1bGxSZXF1ZXN0U3RhdGUuT3Blbixcblx0XHRhdXRob3I6IHsgbG9naW46ICdhdXRob3InLCBhdmF0YXJVcmw6ICcnIH0sXG5cdFx0aGVhZFJlZjogJ2ZlYXR1cmUnLFxuXHRcdGhlYWRTaGE6ICdhYmMxMjMnLFxuXHRcdGJhc2VSZWY6ICdtYWluJyxcblx0XHRpc0RyYWZ0OiBmYWxzZSxcblx0XHRjcmVhdGVkQXQ6ICcyMDI0LTAxLTAxVDAwOjAwOjAwWicsXG5cdFx0dXBkYXRlZEF0OiAnMjAyNC0wMS0wMlQwMDowMDowMFonLFxuXHRcdG1lcmdlZEF0OiB1bmRlZmluZWQsXG5cdFx0bWVyZ2VhYmxlOiB0cnVlLFxuXHRcdG1lcmdlYWJsZVN0YXRlOiAnY2xlYW4nLFxuXHR9O1xufVxuXG5mdW5jdGlvbiBtYWtlVGhyZWFkKGlkOiBzdHJpbmcsIHBhdGg6IHN0cmluZyk6IElHaXRIdWJQdWxsUmVxdWVzdFJldmlld1RocmVhZCB7XG5cdHJldHVybiB7XG5cdFx0aWQsXG5cdFx0aXNSZXNvbHZlZDogZmFsc2UsXG5cdFx0cGF0aCxcblx0XHRsaW5lOiAxMCxcblx0XHRjb21tZW50czogW21ha2VDb21tZW50KDEwMCwgYENvbW1lbnQgb24gJHtwYXRofWAsIGlkKV0sXG5cdH07XG59XG5cbmZ1bmN0aW9uIG1ha2VDb21tZW50KGlkOiBudW1iZXIsIGJvZHk6IHN0cmluZywgdGhyZWFkSWQ6IHN0cmluZyA9IFN0cmluZyhpZCkpOiBJR2l0SHViUFJDb21tZW50IHtcblx0cmV0dXJuIHtcblx0XHRpZCxcblx0XHRib2R5LFxuXHRcdGF1dGhvcjogeyBsb2dpbjogJ3Jldmlld2VyJywgYXZhdGFyVXJsOiAnJyB9LFxuXHRcdGNyZWF0ZWRBdDogJzIwMjQtMDEtMDFUMDA6MDA6MDBaJyxcblx0XHR1cGRhdGVkQXQ6ICcyMDI0LTAxLTAxVDAwOjAwOjAwWicsXG5cdFx0cGF0aDogdW5kZWZpbmVkLFxuXHRcdGxpbmU6IHVuZGVmaW5lZCxcblx0XHR0aHJlYWRJZCxcblx0XHRpblJlcGx5VG9JZDogdW5kZWZpbmVkLFxuXHR9O1xufVxuXG4vLyNlbmRyZWdpb25cbiJdLAogICJtYXBwaW5ncyI6ICJBQUtBLE9BQU8sWUFBWTtBQUNuQixTQUFTLGlCQUFpQixlQUFlO0FBQ3pDLFNBQVMsdUJBQXVCO0FBQ2hDLFNBQVMsK0NBQStDO0FBQ3hELFNBQVMsMEJBQTBCO0FBQ25DLFNBQVMsc0JBQW1DO0FBRTVDLFNBQVMsMEJBQTBCO0FBQ25DLFNBQVMsOEJBQThCO0FBQ3ZDLFNBQVMsMkNBQTJDO0FBQ3BELFNBQVMsMEJBQTBCLDZDQUE2QywwQkFBMEI7QUFDMUcsU0FBUyxxQ0FBcUMsK0JBQStCO0FBQzdFLFNBQVMsNkJBQTZCO0FBS3RDLFNBQVMsdUJBQXVCLHVCQUF1QixtQkFBbUIsa0JBQWtCLDhCQUFpSztBQUk3UCxNQUFNLHNCQUFzQjtBQUFBLEVBQTVCO0FBRUMsOEJBQXFCO0FBQUE7QUFBQSxFQUdyQixNQUFNLGNBQWMsUUFBZ0IsT0FBZSxPQUFxRztBQUN2SixTQUFL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
