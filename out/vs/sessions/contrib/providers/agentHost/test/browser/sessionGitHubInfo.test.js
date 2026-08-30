import assert from "assert";
import { timeout } from "../../../../../../base/common/async.js";
import { DisposableStore, ImmortalReference } from "../../../../../../base/common/lifecycle.js";
import { autorun, observableValue } from "../../../../../../base/common/observable.js";
import { mock } from "../../../../../../base/test/common/mock.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../../../base/test/common/utils.js";
import { NullLogService } from "../../../../../../platform/log/common/log.js";
import { computePullRequestIcon, GitHubCIOverallStatus, GitHubPullRequestState } from "../../../../github/common/types.js";
import { SessionGitHubInfoResolver } from "../../browser/sessionGitHubInfo.js";
suite("SessionGitHubInfoResolver", () => {
  const store = new DisposableStore();
  teardown(() => store.clear());
  ensureNoDisposablesAreLeakedInTestSuite();
  function createResolver(meta, gitHubService) {
    const metaObs = observableValue("test.meta", meta);
    const resolver = new SessionGitHubInfoResolver(metaObs, "test:session", gitHubService, new NullLogService());
    store.add(autorun((reader) => {
      resolver.gitHubInfo.read(reader);
    }));
    return { resolver, metaObs };
  }
  test("no git state yields no GitHub info", async () => {
    const { resolver } = createResolver(void 0, new TestGitHubService());
    await timeout(0);
    assert.strictEqual(resolver.gitHubInfo.get(), void 0);
  });
  test("coords with no pull request yield owner/repo without a pull request", async () => {
    const { resolver } = createResolver(gitMeta("owner", "repo", "feature"), new TestGitHubService());
    await timeout(0);
    assert.deepStrictEqual(snapshot(resolver.gitHubInfo.get()), { owner: "owner", repo: "repo", pullRequest: void 0 });
  });
  test("uses the tracked upstream branch to resolve the pull request", async () => {
    const gitHubService = new TestGitHubService();
    gitHubService.setPullRequestNumber("owner", "repo", "pull-request-branch", 42);
    const meta = {
      git: {
        hasGitHubRemote: true,
        githubOwner: "owner",
        githubRepo: "repo",
        branchName: "agents/generated",
        upstreamBranchName: "origin/pull-request-branch"
      }
    };
    const { resolver } = createResolver(meta, gitHubService);
    await timeout(0);
    assert.strictEqual(resolver.gitHubInfo.get()?.pullRequest?.number, 42);
  });
  test("without a GitHub service the pull request stays dormant", async () => {
    const { resolver } = createResolver(gitMeta("owner", "repo", "feature"), void 0);
    await timeout(0);
    assert.deepStrictEqual(snapshot(resolver.gitHubInfo.get()), { owner: "owner", repo: "repo", pullRequest: void 0 });
  });
  test("a resolved PR number whose live model has not loaded has no icon yet", async () => {
    const gitHubService = new TestGitHubService();
    gitHubService.setPullRequestNumber("owner", "repo", "feature", 42);
    const { resolver } = createResolver(gitMeta("owner", "repo", "feature"), gitHubService);
    await timeout(0);
    assert.deepStrictEqual(snapshot(resolver.gitHubInfo.get()), {
      owner: "owner",
      repo: "repo",
      pullRequest: { number: 42, uri: "https://github.com/owner/repo/pull/42", icon: void 0 }
    });
  });
  test("an open pull request shows the open icon", async () => {
    const { resolver } = await resolvePullRequest({ state: GitHubPullRequestState.Open, isDraft: false });
    assert.deepStrictEqual(snapshot(resolver.gitHubInfo.get())?.pullRequest?.icon, computePullRequestIcon(GitHubPullRequestState.Open));
  });
  test("a draft pull request shows the draft icon", async () => {
    const { resolver } = await resolvePullRequest({ state: GitHubPullRequestState.Open, isDraft: true });
    assert.deepStrictEqual(snapshot(resolver.gitHubInfo.get())?.pullRequest?.icon, computePullRequestIcon("draft"));
  });
  test("a merged pull request shows the merged icon and does not consult CI / review threads", async () => {
    const { resolver, gitHubService } = await resolvePullRequest({ state: GitHubPullRequestState.Merged, isDraft: false });
    assert.deepStrictEqual(snapshot(resolver.gitHubInfo.get())?.pullRequest?.icon, computePullRequestIcon(GitHubPullRequestState.Merged));
    assert.deepStrictEqual({ ci: gitHubService.ciModelRefs, reviewThreads: gitHubService.reviewThreadModelRefs }, { ci: 0, reviewThreads: 0 });
  });
  test("a closed pull request shows the closed icon", async () => {
    const { resolver } = await resolvePullRequest({ state: GitHubPullRequestState.Closed, isDraft: false });
    assert.deepStrictEqual(snapshot(resolver.gitHubInfo.get())?.pullRequest?.icon, computePullRequestIcon(GitHubPullRequestState.Closed));
  });
  test("an open pull request with failing CI checks shows the error icon", async () => {
    const { resolver, gitHubService } = await resolvePullRequest({ state: GitHubPullRequestState.Open, isDraft: false, headSha: "sha1" });
    gitHubService.setCIStatus("owner", "repo", 42, "sha1", GitHubCIOverallStatus.Failure);
    assert.deepStrictEqual(snapshot(resolver.gitHubInfo.get())?.pullRequest?.icon, computePullRequestIcon(GitHubPullRequestState.Open, { hasFailingChecks: true }));
  });
  test("an open pull request with unresolved review threads shows the comment icon", async () => {
    const { resolver, gitHubService } = await resolvePullRequest({ state: GitHubPullRequestState.Open, isDraft: false });
    gitHubService.setReviewThreads("owner", "repo", 42, [thread(false)]);
    assert.deepStrictEqual(snapshot(resolver.gitHubInfo.get())?.pullRequest?.icon, computePullRequestIcon(GitHubPullRequestState.Open, { hasUnresolvedComments: true }));
  });
  test("resolved review threads do not change the open icon", async () => {
    const { resolver, gitHubService } = await resolvePullRequest({ state: GitHubPullRequestState.Open, isDraft: false });
    gitHubService.setReviewThreads("owner", "repo", 42, [thread(true), thread(true)]);
    assert.deepStrictEqual(snapshot(resolver.gitHubInfo.get())?.pullRequest?.icon, computePullRequestIcon(GitHubPullRequestState.Open));
  });
  test("failing CI checks take precedence over unresolved review threads", async () => {
    const { resolver, gitHubService } = await resolvePullRequest({ state: GitHubPullRequestState.Open, isDraft: false, headSha: "sha1" });
    gitHubService.setCIStatus("owner", "repo", 42, "sha1", GitHubCIOverallStatus.Failure);
    gitHubService.setReviewThreads("owner", "repo", 42, [thread(false)]);
    assert.deepStrictEqual(snapshot(resolver.gitHubInfo.get())?.pullRequest?.icon, computePullRequestIcon(GitHubPullRequestState.Open, { hasFailingChecks: true }));
  });
  test("the icon updates reactively when the live pull request state changes", async () => {
    const { resolver, gitHubService } = await resolvePullRequest({ state: GitHubPullRequestState.Open, isDraft: false });
    assert.deepStrictEqual(snapshot(resolver.gitHubInfo.get())?.pullRequest?.icon, computePullRequestIcon(GitHubPullRequestState.Open));
    gitHubService.setPullRequest("owner", "repo", 42, makePullRequest({ state: GitHubPullRequestState.Merged, isDraft: false }));
    assert.deepStrictEqual(snapshot(resolver.gitHubInfo.get())?.pullRequest?.icon, computePullRequestIcon(GitHubPullRequestState.Merged));
  });
  test("the icon updates reactively when CI flips to failing", async () => {
    const { resolver, gitHubService } = await resolvePullRequest({ state: GitHubPullRequestState.Open, isDraft: false, headSha: "sha1" });
    assert.deepStrictEqual(snapshot(resolver.gitHubInfo.get())?.pullRequest?.icon, computePullRequestIcon(GitHubPullRequestState.Open));
    gitHubService.setCIStatus("owner", "repo", 42, "sha1", GitHubCIOverallStatus.Failure);
    assert.deepStrictEqual(snapshot(resolver.gitHubInfo.get())?.pullRequest?.icon, computePullRequestIcon(GitHubPullRequestState.Open, { hasFailingChecks: true }));
  });
  test("a resolved PR number stays sticky across unobserve / re-observe (no re-lookup)", async () => {
    const gitHubService = new TestGitHubService();
    gitHubService.setPullRequestNumber("owner", "repo", "feature", 42);
    const { resolver } = createResolver(gitMeta("owner", "repo", "feature"), gitHubService);
    await timeout(0);
    assert.strictEqual(resolver.gitHubInfo.get()?.pullRequest?.number, 42);
    assert.strictEqual(gitHubService.lookupCalls, 1);
    store.clear();
    let firstReObservedNumber;
    let captured = false;
    store.add(autorun((reader) => {
      const number = resolver.gitHubInfo.read(reader)?.pullRequest?.number;
      if (!captured) {
        firstReObservedNumber = number;
        captured = true;
      }
    }));
    assert.strictEqual(firstReObservedNumber, 42);
    assert.strictEqual(gitHubService.lookupCalls, 1);
  });
  test("a branch change resolves a new pull request number", async () => {
    const gitHubService = new TestGitHubService();
    gitHubService.setPullRequestNumber("owner", "repo", "feature", 42);
    gitHubService.setPullRequestNumber("owner", "repo", "other", 7);
    const { resolver, metaObs } = createResolver(gitMeta("owner", "repo", "feature"), gitHubService);
    await timeout(0);
    assert.strictEqual(resolver.gitHubInfo.get()?.pullRequest?.number, 42);
    metaObs.set(gitMeta("owner", "repo", "other"), void 0);
    await timeout(0);
    assert.strictEqual(resolver.gitHubInfo.get()?.pullRequest?.number, 7);
  });
  async function resolvePullRequest(details) {
    const gitHubService = new TestGitHubService();
    gitHubService.setPullRequestNumber("owner", "repo", "feature", 42);
    gitHubService.setPullRequest("owner", "repo", 42, makePullRequest(details));
    const { resolver } = createResolver(gitMeta("owner", "repo", "feature"), gitHubService);
    await timeout(0);
    return { resolver, gitHubService };
  }
});
function gitMeta(owner, repo, branch) {
  return { git: { hasGitHubRemote: true, githubOwner: owner, githubRepo: repo, branchName: branch } };
}
function thread(isResolved) {
  return { id: `thread-${isResolved}`, isResolved, path: "file.ts", line: 1, comments: [] };
}
function makePullRequest(details) {
  return {
    number: 42,
    title: "",
    body: "",
    state: details.state,
    author: { login: "", avatarUrl: "" },
    headRef: "",
    headSha: details.headSha ?? "sha",
    baseRef: "",
    isDraft: details.isDraft,
    createdAt: "",
    updatedAt: "",
    mergedAt: void 0,
    mergeable: void 0,
    mergeableState: ""
  };
}
function snapshot(info) {
  if (!info) {
    return void 0;
  }
  return {
    owner: info.owner,
    repo: info.repo,
    pullRequest: info.pullRequest ? { number: info.pullRequest.number, uri: info.pullRequest.uri.toString(), icon: info.pullRequest.icon } : void 0
  };
}
class TestGitHubService extends mock() {
  constructor() {
    super(...arguments);
    this.lookupCalls = 0;
    this.ciModelRefs = 0;
    this.reviewThreadModelRefs = 0;
    this._prNumbers = /* @__PURE__ */ new Map();
    this._prModels = /* @__PURE__ */ new Map();
    this._ciModels = /* @__PURE__ */ new Map();
    this._reviewThreadModels = /* @__PURE__ */ new Map();
    this.findPullRequestNumberByHeadBranch = async (owner, repo, branch) => {
      this.lookupCalls++;
      return this._prNumbers.get(`${owner}/${repo}#${branch}`);
    };
  }
  createPullRequestModelReference(owner, repo, prNumber) {
    return new ImmortalReference(this._prModel(owner, repo, prNumber));
  }
  createPullRequestCIModelReference(owner, repo, prNumber, headSha) {
    this.ciModelRefs++;
    return new ImmortalReference(this._ciModel(owner, repo, prNumber, headSha));
  }
  createPullRequestReviewThreadsModelReference(owner, repo, prNumber) {
    this.reviewThreadModelRefs++;
    return new ImmortalReference(this._reviewThreadModel(owner, repo, prNumber));
  }
  setPullRequestNumber(owner, repo, branch, prNumber) {
    this._prNumbers.set(`${owner}/${repo}#${branch}`, prNumber);
  }
  setPullRequest(owner, repo, prNumber, pullRequest) {
    this._prModel(owner, repo, prNumber).set(pullRequest);
  }
  setCIStatus(owner, repo, prNumber, headSha, status) {
    this._ciModel(owner, repo, prNumber, headSha).set(status);
  }
  setReviewThreads(owner, repo, prNumber, threads) {
    this._reviewThreadModel(owner, repo, prNumber).set(threads);
  }
  _prModel(owner, repo, prNumber) {
    const key = `${owner}/${repo}/${prNumber}`;
    let model = this._prModels.get(key);
    if (!model) {
      model = new TestPullRequestModel();
      this._prModels.set(key, model);
    }
    return model;
  }
  _ciModel(owner, repo, prNumber, headSha) {
    const key = `${owner}/${repo}/${prNumber}/${headSha}`;
    let model = this._ciModels.get(key);
    if (!model) {
      model = new TestCIModel();
      this._ciModels.set(key, model);
    }
    return model;
  }
  _reviewThreadModel(owner, repo, prNumber) {
    const key = `${owner}/${repo}/${prNumber}`;
    let model = this._reviewThreadModels.get(key);
    if (!model) {
      model = new TestReviewThreadsModel();
      this._reviewThreadModels.set(key, model);
    }
    return model;
  }
}
class TestPullRequestModel {
  constructor() {
    this._pullRequest = observableValue("test.pullRequest", void 0);
    this.pullRequest = this._pullRequest;
  }
  set(pullRequest) {
    this._pullRequest.set(pullRequest, void 0);
  }
}
class TestCIModel {
  constructor() {
    this._overallStatus = observableValue("test.ciStatus", GitHubCIOverallStatus.Neutral);
    this.overallStatus = this._overallStatus;
  }
  set(status) {
    this._overallStatus.set(status, void 0);
  }
}
class TestReviewThreadsModel {
  constructor() {
    this._reviewThreads = observableValue("test.reviewThreads", []);
    this.reviewThreads = this._reviewThreads;
  }
  set(threads) {
    this._reviewThreads.set(threads, void 0);
  }
}
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxzZXNzaW9uc1xcY29udHJpYlxccHJvdmlkZXJzXFxhZ2VudEhvc3RcXHRlc3RcXGJyb3dzZXJcXHNlc3Npb25HaXRIdWJJbmZvLnRlc3QudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgYXNzZXJ0IGZyb20gJ2Fzc2VydCc7XG5pbXBvcnQgeyB0aW1lb3V0IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vYXN5bmMuanMnO1xuaW1wb3J0IHsgRGlzcG9zYWJsZVN0b3JlLCBJbW1vcnRhbFJlZmVyZW5jZSwgdHlwZSBJUmVmZXJlbmNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IGF1dG9ydW4sIG9ic2VydmFibGVWYWx1ZSwgdHlwZSBJT2JzZXJ2YWJsZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL29ic2VydmFibGUuanMnO1xuaW1wb3J0IHsgVGhlbWVJY29uIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdGhlbWFibGVzLmpzJztcbmltcG9ydCB7IG1vY2sgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL3Rlc3QvY29tbW9uL21vY2suanMnO1xuaW1wb3J0IHsgZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS90ZXN0L2NvbW1vbi91dGlscy5qcyc7XG5pbXBvcnQgeyBOdWxsTG9nU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2xvZy9jb21tb24vbG9nLmpzJztcbmltcG9ydCB7IFNlc3Npb25NZXRhIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vYWdlbnRIb3N0L2NvbW1vbi9zdGF0ZS9zZXNzaW9uU3RhdGUuanMnO1xuaW1wb3J0IHsgSUdpdEh1YkluZm8gfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9zZXJ2aWNlcy9zZXNzaW9ucy9jb21tb24vc2Vzc2lvbi5qcyc7XG5pbXBvcnQgeyBJR2l0SHViU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL2dpdGh1Yi9icm93c2VyL2dpdGh1YlNlcnZpY2UuanMnO1xuaW1wb3J0IHsgR2l0SHViUHVsbFJlcXVlc3RDSU1vZGVsIH0gZnJvbSAnLi4vLi4vLi4vLi4vZ2l0aHViL2Jyb3dzZXIvbW9kZWxzL2dpdGh1YlB1bGxSZXF1ZXN0Q0lNb2RlbC5qcyc7XG5pbXBvcnQgeyBHaXRIdWJQdWxsUmVxdWVzdE1vZGVsIH0gZnJvbSAnLi4vLi4vLi4vLi4vZ2l0aHViL2Jyb3dzZXIvbW9kZWxzL2dpdGh1YlB1bGxSZXF1ZXN0TW9kZWwuanMnO1xuaW1wb3J0IHsgR2l0SHViUHVsbFJlcXVlc3RSZXZpZXdUaHJlYWRzTW9kZWwgfSBmcm9tICcuLi8uLi8uLi8uLi9naXRodWIvYnJvd3Nlci9tb2RlbHMvZ2l0aHViUHVsbFJlcXVlc3RSZXZpZXdUaHJlYWRzTW9kZWwuanMnO1xuaW1wb3J0IHsgY29tcHV0ZVB1bGxSZXF1ZXN0SWNvbiwgR2l0SHViQ0lPdmVyYWxsU3RhdHVzLCBHaXRIdWJQdWxsUmVxdWVzdFN0YXRlLCBJR2l0SHViUHVsbFJlcXVlc3QsIElHaXRIdWJQdWxsUmVxdWVzdFJldmlld1RocmVhZCB9IGZyb20gJy4uLy4uLy4uLy4uL2dpdGh1Yi9jb21tb24vdHlwZXMuanMnO1xuaW1wb3J0IHsgU2Vzc2lvbkdpdEh1YkluZm9SZXNvbHZlciB9IGZyb20gJy4uLy4uL2Jyb3dzZXIvc2Vzc2lvbkdpdEh1YkluZm8uanMnO1xuXG5zdWl0ZSgnU2Vzc2lvbkdpdEh1YkluZm9SZXNvbHZlcicsICgpID0+IHtcblxuXHRjb25zdCBzdG9yZSA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblxuXHR0ZWFyZG93bigoKSA9PiBzdG9yZS5jbGVhcigpKTtcblxuXHRlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUoKTtcblxuXHQvKipcblx0ICogQnVpbGQgYSByZXNvbHZlciBvdmVyIGEgc2V0dGFibGUgbWV0YSBvYnNlcnZhYmxlIHBsdXMgYSAocHJlLWNvbmZpZ3VyZWQpXG5cdCAqIEdpdEh1YiBzZXJ2aWNlLCBhbmQgc3RhcnQgb2JzZXJ2aW5nIGBnaXRIdWJJbmZvYCBzbyB0aGUgYXN5bmMgUFItbnVtYmVyXG5cdCAqIGxvb2t1cCBhbmQgdGhlIGxpdmUtbW9kZWwgcmVhZHMgYWN0dWFsbHkgcnVuLiBUaGUgc2VydmljZSBtdXN0IGJlIGNvbmZpZ3VyZWRcblx0ICogYmVmb3JlIHRoaXMgaXMgY2FsbGVkOiB0aGUgcmVzb2x2ZXIgbG9va3MgdXAgdGhlIFBSIG51bWJlciB0aGUgbW9tZW50XG5cdCAqIGBnaXRIdWJJbmZvYCBpcyBmaXJzdCBvYnNlcnZlZC5cblx0ICovXG5cdGZ1bmN0aW9uIGNyZWF0ZVJlc29sdmVyKG1ldGE6IFNlc3Npb25NZXRhIHwgdW5kZWZpbmVkLCBnaXRIdWJTZXJ2aWNlOiBUZXN0R2l0SHViU2VydmljZSB8IHVuZGVmaW5lZCk6IHtcblx0XHRyZWFkb25seSByZXNvbHZlcjogU2Vzc2lvbkdpdEh1YkluZm9SZXNvbHZlcjtcblx0XHRyZWFkb25seSBtZXRhT2JzOiBSZXR1cm5UeXBlPHR5cGVvZiBvYnNlcnZhYmxlVmFsdWU8U2Vzc2lvbk1ldGEgfCB1bmRlZmluZWQ+Pjtcblx0fSB7XG5cdFx0Y29uc3QgbWV0YU9icyA9IG9ic2VydmFibGVWYWx1ZTxTZXNzaW9uTWV0YSB8IHVuZGVmaW5lZD4oJ3Rlc3QubWV0YScsIG1ldGEpO1xuXHRcdGNvbnN0IHJlc29sdmVyID0gbmV3IFNlc3Npb25HaXRIdWJJbmZvUmVzb2x2ZXIobWV0YU9icywgJ3Rlc3Q6c2Vzc2lvbicsIGdpdEh1YlNlcnZpY2UsIG5ldyBOdWxsTG9nU2VydmljZSgpKTtcblx0XHRzdG9yZS5hZGQoYXV0b3J1bihyZWFkZXIgPT4geyByZXNvbHZlci5naXRIdWJJbmZvLnJlYWQocmVhZGVyKTsgfSkpO1xuXHRcdHJldHVybiB7IHJlc29sdmVyLCBtZXRhT2JzIH07XG5cdH1cblxuXHR0ZXN0KCdubyBnaXQgc3RhdGUgeWllbGRzIG5vIEdpdEh1YiBpbmZvJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHsgcmVzb2x2ZXIgfSA9IGNyZWF0ZVJlc29sdmVyKHVuZGVmaW5lZCwgbmV3IFRlc3RHaXRIdWJTZXJ2aWNlKCkpO1xuXHRcdGF3YWl0IHRpbWVvdXQoMCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc29sdmVyLmdpdEh1YkluZm8uZ2V0KCksIHVuZGVmaW5lZCk7XG5cdH0pO1xuXG5cdHRlc3QoJ2Nvb3JkcyB3aXRoIG5vIHB1bGwgcmVxdWVzdCB5aWVsZCBvd25lci9yZXBvIHdpdGhvdXQgYSBwdWxsIHJlcXVlc3QnLCBhc3luYyAoKSA9PiB7XG5cdFx0Ly8gTm8gUFIgbnVtYmVyIHJlZ2lzdGVyZWQgZm9yIHRoZSBicmFuY2ggLT4gdGhlIGxvb2t1cCByZXNvbHZlcyB1bmRlZmluZWQuXG5cdFx0Y29uc3QgeyByZXNvbHZlciB9ID0gY3JlYXRlUmVzb2x2ZXIoZ2l0TWV0YSgnb3duZXInLCAncmVwbycsICdmZWF0dXJlJyksIG5ldyBUZXN0R2l0SHViU2VydmljZSgpKTtcblx0XHRhd2FpdCB0aW1lb3V0KDApO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoc25hcHNob3QocmVzb2x2ZXIuZ2l0SHViSW5mby5nZXQoKSksIHsgb3duZXI6ICdvd25lcicsIHJlcG86ICdyZXBvJywgcHVsbFJlcXVlc3Q6IHVuZGVmaW5lZCB9KTtcblx0fSk7XG5cblx0dGVzdCgndXNlcyB0aGUgdHJhY2tlZCB1cHN0cmVhbSBicmFuY2ggdG8gcmVzb2x2ZSB0aGUgcHVsbCByZXF1ZXN0JywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IGdpdEh1YlNlcnZpY2UgPSBuZXcgVGVzdEdpdEh1YlNlcnZpY2UoKTtcblx0XHRnaXRIdWJTZXJ2aWNlLnNldFB1bGxSZXF1ZXN0TnVtYmVyKCdvd25lcicsICdyZXBvJywgJ3B1bGwtcmVxdWVzdC1icmFuY2gnLCA0Mik7XG5cdFx0Y29uc3QgbWV0YTogU2Vzc2lvbk1ldGEgPSB7XG5cdFx0XHRnaXQ6IHtcblx0XHRcdFx0aGFzR2l0SHViUmVtb3RlOiB0cnVlLFxuXHRcdFx0XHRnaXRodWJPd25lcjogJ293bmVyJyxcblx0XHRcdFx0Z2l0aHViUmVwbzogJ3JlcG8nLFxuXHRcdFx0XHRicmFuY2hOYW1lOiAnYWdlbnRzL2dlbmVyYXRlZCcsXG5cdFx0XHRcdHVwc3RyZWFtQnJhbmNoTmFtZTogJ29yaWdpbi9wdWxsLXJlcXVlc3QtYnJhbmNoJyxcblx0XHRcdH0sXG5cdFx0fTtcblxuXHRcdGNvbnN0IHsgcmVzb2x2ZXIgfSA9IGNyZWF0ZVJlc29sdmVyKG1ldGEsIGdpdEh1YlNlcnZpY2UpO1xuXHRcdGF3YWl0IHRpbWVvdXQoMCk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzb2x2ZXIuZ2l0SHViSW5mby5nZXQoKT8ucHVsbFJlcXVlc3Q/Lm51bWJlciwgNDIpO1xuXHR9KTtcblxuXHR0ZXN0KCd3aXRob3V0IGEgR2l0SHViIHNlcnZpY2UgdGhlIHB1bGwgcmVxdWVzdCBzdGF5cyBkb3JtYW50JywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHsgcmVzb2x2ZXIgfSA9IGNyZWF0ZVJlc29sdmVyKGdpdE1ldGEoJ293bmVyJywgJ3JlcG8nLCAnZmVhdHVyZScpLCB1bmRlZmluZWQpO1xuXHRcdGF3YWl0IHRpbWVvdXQoMCk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChzbmFwc2hvdChyZXNvbHZlci5naXRIdWJJbmZvLmdldCgpKSwgeyBvd25lcjogJ293bmVyJywgcmVwbzogJ3JlcG8nLCBwdWxsUmVxdWVzdDogdW5kZWZpbmVkIH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdhIHJlc29sdmVkIFBSIG51bWJlciB3aG9zZSBsaXZlIG1vZGVsIGhhcyBub3QgbG9hZGVkIGhhcyBubyBpY29uIHlldCcsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBnaXRIdWJTZXJ2aWNlID0gbmV3IFRlc3RHaXRIdWJTZXJ2aWNlKCk7XG5cdFx0Z2l0SHViU2VydmljZS5zZXRQdWxsUmVxdWVzdE51bWJlcignb3duZXInLCAncmVwbycsICdmZWF0dXJlJywgNDIpO1xuXHRcdC8vIE5vIGxpdmUgcHVsbCByZXF1ZXN0IHNldCAtPiB0aGUgbW9kZWwgc3RheXMgZW1wdHksIHNvIHRoZXJlIGlzIG5vIGljb24geWV0LlxuXHRcdGNvbnN0IHsgcmVzb2x2ZXIgfSA9IGNyZWF0ZVJlc29sdmVyKGdpdE1ldGEoJ293bmVyJywgJ3JlcG8nLCAnZmVhdHVyZScpLCBnaXRIdWJTZXJ2aWNlKTtcblx0XHRhd2FpdCB0aW1lb3V0KDApO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoc25hcHNob3QocmVzb2x2ZXIuZ2l0SHViSW5mby5nZXQoKSksIHtcblx0XHRcdG93bmVyOiAnb3duZXInLFxuXHRcdFx0cmVwbzogJ3JlcG8nLFxuXHRcdFx0cHVsbFJlcXVlc3Q6IHsgbnVtYmVyOiA0MiwgdXJpOiAnaHR0cHM6Ly9naXRodWIuY29tL293bmVyL3JlcG8vcHVsbC80MicsIGljb246IHVuZGVmaW5lZCB9LFxuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdhbiBvcGVuIHB1bGwgcmVxdWVzdCBzaG93cyB0aGUgb3BlbiBpY29uJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHsgcmVzb2x2ZXIgfSA9IGF3YWl0IHJlc29sdmVQdWxsUmVxdWVzdCh7IHN0YXRlOiBHaXRIdWJQdWxsUmVxdWVzdFN0YXRlLk9wZW4sIGlzRHJhZnQ6IGZhbHNlIH0pO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoc25hcHNob3QocmVzb2x2ZXIuZ2l0SHViSW5mby5nZXQoKSk/LnB1bGxSZXF1ZXN0Py5pY29uLCBjb21wdXRlUHVsbFJlcXVlc3RJY29uKEdpdEh1YlB1bGxSZXF1ZXN0U3RhdGUuT3BlbikpO1xuXHR9KTtcblxuXHR0ZXN0KCdhIGRyYWZ0IHB1bGwgcmVxdWVzdCBzaG93cyB0aGUgZHJhZnQgaWNvbicsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCB7IHJlc29sdmVyIH0gPSBhd2FpdCByZXNvbHZlUHVsbFJlcXVlc3QoeyBzdGF0ZTogR2l0SHViUHVsbFJlcXVlc3RTdGF0ZS5PcGVuLCBpc0RyYWZ0OiB0cnVlIH0pO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoc25hcHNob3QocmVzb2x2ZXIuZ2l0SHViSW5mby5nZXQoKSk/LnB1bGxSZXF1ZXN0Py5pY29uLCBjb21wdXRlUHVsbFJlcXVlc3RJY29uKCdkcmFmdCcpKTtcblx0fSk7XG5cblx0dGVzdCgnYSBtZXJnZWQgcHVsbCByZXF1ZXN0IHNob3dzIHRoZSBtZXJnZWQgaWNvbiBhbmQgZG9lcyBub3QgY29uc3VsdCBDSSAvIHJldmlldyB0aHJlYWRzJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHsgcmVzb2x2ZXIsIGdpdEh1YlNlcnZpY2UgfSA9IGF3YWl0IHJlc29sdmVQdWxsUmVxdWVzdCh7IHN0YXRlOiBHaXRIdWJQdWxsUmVxdWVzdFN0YXRlLk1lcmdlZCwgaXNEcmFmdDogZmFsc2UgfSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChzbmFwc2hvdChyZXNvbHZlci5naXRIdWJJbmZvLmdldCgpKT8ucHVsbFJlcXVlc3Q/Lmljb24sIGNvbXB1dGVQdWxsUmVxdWVzdEljb24oR2l0SHViUHVsbFJlcXVlc3RTdGF0ZS5NZXJnZWQpKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHsgY2k6IGdpdEh1YlNlcnZpY2UuY2lNb2RlbFJlZnMsIHJldmlld1RocmVhZHM6IGdpdEh1YlNlcnZpY2UucmV2aWV3VGhyZWFkTW9kZWxSZWZzIH0sIHsgY2k6IDAsIHJldmlld1RocmVhZHM6IDAgfSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2EgY2xvc2VkIHB1bGwgcmVxdWVzdCBzaG93cyB0aGUgY2xvc2VkIGljb24nLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgeyByZXNvbHZlciB9ID0gYXdhaXQgcmVzb2x2ZVB1bGxSZXF1ZXN0KHsgc3RhdGU6IEdpdEh1YlB1bGxSZXF1ZXN0U3RhdGUuQ2xvc2VkLCBpc0RyYWZ0OiBmYWxzZSB9KTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHNuYXBzaG90KHJlc29sdmVyLmdpdEh1YkluZm8uZ2V0KCkpPy5wdWxsUmVxdWVzdD8uaWNvbiwgY29tcHV0ZVB1bGxSZXF1ZXN0SWNvbihHaXRIdWJQdWxsUmVxdWVzdFN0YXRlLkNsb3NlZCkpO1xuXHR9KTtcblxuXHR0ZXN0KCdhbiBvcGVuIHB1bGwgcmVxdWVzdCB3aXRoIGZhaWxpbmcgQ0kgY2hlY2tzIHNob3dzIHRoZSBlcnJvciBpY29uJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHsgcmVzb2x2ZXIsIGdpdEh1YlNlcnZpY2UgfSA9IGF3YWl0IHJlc29sdmVQdWxsUmVxdWVzdCh7IHN0YXRlOiBHaXRIdWJQdWxsUmVxdWVzdFN0YXRlLk9wZW4sIGlzRHJhZnQ6IGZhbHNlLCBoZWFkU2hhOiAnc2hhMScgfSk7XG5cdFx0Z2l0SHViU2VydmljZS5zZXRDSVN0YXR1cygnb3duZXInLCAncmVwbycsIDQyLCAnc2hhMScsIEdpdEh1YkNJT3ZlcmFsbFN0YXR1cy5GYWlsdXJlKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHNuYXBzaG90KHJlc29sdmVyLmdpdEh1YkluZm8uZ2V0KCkpPy5wdWxsUmVxdWVzdD8uaWNvbiwgY29tcHV0ZVB1bGxSZXF1ZXN0SWNvbihHaXRIdWJQdWxsUmVxdWVzdFN0YXRlLk9wZW4sIHsgaGFzRmFpbGluZ0NoZWNrczogdHJ1ZSB9KSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2FuIG9wZW4gcHVsbCByZXF1ZXN0IHdpdGggdW5yZXNvbHZlZCByZXZpZXcgdGhyZWFkcyBzaG93cyB0aGUgY29tbWVudCBpY29uJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHsgcmVzb2x2ZXIsIGdpdEh1YlNlcnZpY2UgfSA9IGF3YWl0IHJlc29sdmVQdWxsUmVxdWVzdCh7IHN0YXRlOiBHaXRIdWJQdWxsUmVxdWVzdFN0YXRlLk9wZW4sIGlzRHJhZnQ6IGZhbHNlIH0pO1xuXHRcdGdpdEh1YlNlcnZpY2Uuc2V0UmV2aWV3VGhyZWFkcygnb3duZXInLCAncmVwbycsIDQyLCBbdGhyZWFkKGZhbHNlKV0pO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoc25hcHNob3QocmVzb2x2ZXIuZ2l0SHViSW5mby5nZXQoKSk/LnB1bGxSZXF1ZXN0Py5pY29uLCBjb21wdXRlUHVsbFJlcXVlc3RJY29uKEdpdEh1YlB1bGxSZXF1ZXN0U3RhdGUuT3BlbiwgeyBoYXNVbnJlc29sdmVkQ29tbWVudHM6IHRydWUgfSkpO1xuXHR9KTtcblxuXHR0ZXN0KCdyZXNvbHZlZCByZXZpZXcgdGhyZWFkcyBkbyBub3QgY2hhbmdlIHRoZSBvcGVuIGljb24nLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgeyByZXNvbHZlciwgZ2l0SHViU2VydmljZSB9ID0gYXdhaXQgcmVzb2x2ZVB1bGxSZXF1ZXN0KHsgc3RhdGU6IEdpdEh1YlB1bGxSZXF1ZXN0U3RhdGUuT3BlbiwgaXNEcmFmdDogZmFsc2UgfSk7XG5cdFx0Z2l0SHViU2VydmljZS5zZXRSZXZpZXdUaHJlYWRzKCdvd25lcicsICdyZXBvJywgNDIsIFt0aHJlYWQodHJ1ZSksIHRocmVhZCh0cnVlKV0pO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoc25hcHNob3QocmVzb2x2ZXIuZ2l0SHViSW5mby5nZXQoKSk/LnB1bGxSZXF1ZXN0Py5pY29uLCBjb21wdXRlUHVsbFJlcXVlc3RJY29uKEdpdEh1YlB1bGxSZXF1ZXN0U3RhdGUuT3BlbikpO1xuXHR9KTtcblxuXHR0ZXN0KCdmYWlsaW5nIENJIGNoZWNrcyB0YWtlIHByZWNlZGVuY2Ugb3ZlciB1bnJlc29sdmVkIHJldmlldyB0aHJlYWRzJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHsgcmVzb2x2ZXIsIGdpdEh1YlNlcnZpY2UgfSA9IGF3YWl0IHJlc29sdmVQdWxsUmVxdWVzdCh7IHN0YXRlOiBHaXRIdWJQdWxsUmVxdWVzdFN0YXRlLk9wZW4sIGlzRHJhZnQ6IGZhbHNlLCBoZWFkU2hhOiAnc2hhMScgfSk7XG5cdFx0Z2l0SHViU2VydmljZS5zZXRDSVN0YXR1cygnb3duZXInLCAncmVwbycsIDQyLCAnc2hhMScsIEdpdEh1YkNJT3ZlcmFsbFN0YXR1cy5GYWlsdXJlKTtcblx0XHRnaXRIdWJTZXJ2aWNlLnNldFJldmlld1RocmVhZHMoJ293bmVyJywgJ3JlcG8nLCA0MiwgW3RocmVhZChmYWxzZSldKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHNuYXBzaG90KHJlc29sdmVyLmdpdEh1YkluZm8uZ2V0KCkpPy5wdWxsUmVxdWVzdD8uaWNvbiwgY29tcHV0ZVB1bGxSZXF1ZXN0SWNvbihHaXRIdWJQdWxsUmVxdWVzdFN0YXRlLk9wZW4sIHsgaGFzRmFpbGluZ0NoZWNrczogdHJ1ZSB9KSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3RoZSBpY29uIHVwZGF0ZXMgcmVhY3RpdmVseSB3aGVuIHRoZSBsaXZlIHB1bGwgcmVxdWVzdCBzdGF0ZSBjaGFuZ2VzJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHsgcmVzb2x2ZXIsIGdpdEh1YlNlcnZpY2UgfSA9IGF3YWl0IHJlc29sdmVQdWxsUmVxdWVzdCh7IHN0YXRlOiBHaXRIdWJQdWxsUmVxdWVzdFN0YXRlLk9wZW4sIGlzRHJhZnQ6IGZhbHNlIH0pO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoc25hcHNob3QocmVzb2x2ZXIuZ2l0SHViSW5mby5nZXQoKSk/LnB1bGxSZXF1ZXN0Py5pY29uLCBjb21wdXRlUHVsbFJlcXVlc3RJY29uKEdpdEh1YlB1bGxSZXF1ZXN0U3RhdGUuT3BlbikpO1xuXG5cdFx0Z2l0SHViU2VydmljZS5zZXRQdWxsUmVxdWVzdCgnb3duZXInLCAncmVwbycsIDQyLCBtYWtlUHVsbFJlcXVlc3QoeyBzdGF0ZTogR2l0SHViUHVsbFJlcXVlc3RTdGF0ZS5NZXJnZWQsIGlzRHJhZnQ6IGZhbHNlIH0pKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHNuYXBzaG90KHJlc29sdmVyLmdpdEh1YkluZm8uZ2V0KCkpPy5wdWxsUmVxdWVzdD8uaWNvbiwgY29tcHV0ZVB1bGxSZXF1ZXN0SWNvbihHaXRIdWJQdWxsUmVxdWVzdFN0YXRlLk1lcmdlZCkpO1xuXHR9KTtcblxuXHR0ZXN0KCd0aGUgaWNvbiB1cGRhdGVzIHJlYWN0aXZlbHkgd2hlbiBDSSBmbGlwcyB0byBmYWlsaW5nJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHsgcmVzb2x2ZXIsIGdpdEh1YlNlcnZpY2UgfSA9IGF3YWl0IHJlc29sdmVQdWxsUmVxdWVzdCh7IHN0YXRlOiBHaXRIdWJQdWxsUmVxdWVzdFN0YXRlLk9wZW4sIGlzRHJhZnQ6IGZhbHNlLCBoZWFkU2hhOiAnc2hhMScgfSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChzbmFwc2hvdChyZXNvbHZlci5naXRIdWJJbmZvLmdldCgpKT8ucHVsbFJlcXVlc3Q/Lmljb24sIGNvbXB1dGVQdWxsUmVxdWVzdEljb24oR2l0SHViUHVsbFJlcXVlc3RTdGF0ZS5PcGVuKSk7XG5cblx0XHRnaXRIdWJTZXJ2aWNlLnNldENJU3RhdHVzKCdvd25lcicsICdyZXBvJywgNDIsICdzaGExJywgR2l0SHViQ0lPdmVyYWxsU3RhdHVzLkZhaWx1cmUpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoc25hcHNob3QocmVzb2x2ZXIuZ2l0SHViSW5mby5nZXQoKSk/LnB1bGxSZXF1ZXN0Py5pY29uLCBjb21wdXRlUHVsbFJlcXVlc3RJY29uKEdpdEh1YlB1bGxSZXF1ZXN0U3RhdGUuT3BlbiwgeyBoYXNGYWlsaW5nQ2hlY2tzOiB0cnVlIH0pKTtcblx0fSk7XG5cblx0dGVzdCgnYSByZXNvbHZlZCBQUiBudW1iZXIgc3RheXMgc3RpY2t5IGFjcm9zcyB1bm9ic2VydmUgLyByZS1vYnNlcnZlIChubyByZS1sb29rdXApJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IGdpdEh1YlNlcnZpY2UgPSBuZXcgVGVzdEdpdEh1YlNlcnZpY2UoKTtcblx0XHRnaXRIdWJTZXJ2aWNlLnNldFB1bGxSZXF1ZXN0TnVtYmVyKCdvd25lcicsICdyZXBvJywgJ2ZlYXR1cmUnLCA0Mik7XG5cdFx0Y29uc3QgeyByZXNvbHZlciB9ID0gY3JlYXRlUmVzb2x2ZXIoZ2l0TWV0YSgnb3duZXInLCAncmVwbycsICdmZWF0dXJlJyksIGdpdEh1YlNlcnZpY2UpO1xuXHRcdGF3YWl0IHRpbWVvdXQoMCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc29sdmVyLmdpdEh1YkluZm8uZ2V0KCk/LnB1bGxSZXF1ZXN0Py5udW1iZXIsIDQyKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZ2l0SHViU2VydmljZS5sb29rdXBDYWxscywgMSk7XG5cblx0XHQvLyBEcm9wIGFsbCBvYnNlcnZlcnMsIHRoZW4gcmUtb2JzZXJ2ZTogdGhlIFBSIG51bWJlciBtdXN0IG5vdCBmbGFwIGJhY2sgdG9cblx0XHQvLyB1bmRlZmluZWQgYW5kIG5vIG5ldyBsb29rdXAgbWF5IGJlIGlzc3VlZC5cblx0XHRzdG9yZS5jbGVhcigpO1xuXHRcdGxldCBmaXJzdFJlT2JzZXJ2ZWROdW1iZXI6IG51bWJlciB8IHVuZGVmaW5lZDtcblx0XHRsZXQgY2FwdHVyZWQgPSBmYWxzZTtcblx0XHRzdG9yZS5hZGQoYXV0b3J1bihyZWFkZXIgPT4ge1xuXHRcdFx0Y29uc3QgbnVtYmVyID0gcmVzb2x2ZXIuZ2l0SHViSW5mby5yZWFkKHJlYWRlcik/LnB1bGxSZXF1ZXN0Py5udW1iZXI7XG5cdFx0XHRpZiAoIWNhcHR1cmVkKSB7IGZpcnN0UmVPYnNlcnZlZE51bWJlciA9IG51bWJlcjsgY2FwdHVyZWQgPSB0cnVlOyB9XG5cdFx0fSkpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChmaXJzdFJlT2JzZXJ2ZWROdW1iZXIsIDQyKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZ2l0SHViU2VydmljZS5sb29rdXBDYWxscywgMSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2EgYnJhbmNoIGNoYW5nZSByZXNvbHZlcyBhIG5ldyBwdWxsIHJlcXVlc3QgbnVtYmVyJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IGdpdEh1YlNlcnZpY2UgPSBuZXcgVGVzdEdpdEh1YlNlcnZpY2UoKTtcblx0XHRnaXRIdWJTZXJ2aWNlLnNldFB1bGxSZXF1ZXN0TnVtYmVyKCdvd25lcicsICdyZXBvJywgJ2ZlYXR1cmUnLCA0Mik7XG5cdFx0Z2l0SHViU2VydmljZS5zZXRQdWxsUmVxdWVzdE51bWJlcignb3duZXInLCAncmVwbycsICdvdGhlcicsIDcpO1xuXHRcdGNvbnN0IHsgcmVzb2x2ZXIsIG1ldGFPYnMgfSA9IGNyZWF0ZVJlc29sdmVyKGdpdE1ldGEoJ293bmVyJywgJ3JlcG8nLCAnZmVhdHVyZScpLCBnaXRIdWJTZXJ2aWNlKTtcblx0XHRhd2FpdCB0aW1lb3V0KDApO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXNvbHZlci5naXRIdWJJbmZvLmdldCgpPy5wdWxsUmVxdWVzdD8ubnVtYmVyLCA0Mik7XG5cblx0XHRtZXRhT2JzLnNldChnaXRNZXRhKCdvd25lcicsICdyZXBvJywgJ290aGVyJyksIHVuZGVmaW5lZCk7XG5cdFx0YXdhaXQgdGltZW91dCgwKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzb2x2ZXIuZ2l0SHViSW5mby5nZXQoKT8ucHVsbFJlcXVlc3Q/Lm51bWJlciwgNyk7XG5cdH0pO1xuXG5cdC8vIC0tLS0gaGVscGVycyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cblxuXHQvKiogUmVzb2x2ZSBhIGZ1bGx5LWxvYWRlZCBwdWxsIHJlcXVlc3QgKG51bWJlciA0MiArIGxpdmUgbW9kZWwpIGFuZCByZXR1cm4gdGhlIHJlc29sdmVyICsgc2VydmljZS4gKi9cblx0YXN5bmMgZnVuY3Rpb24gcmVzb2x2ZVB1bGxSZXF1ZXN0KGRldGFpbHM6IFB1bGxSZXF1ZXN0RGV0YWlscyk6IFByb21pc2U8eyByZWFkb25seSByZXNvbHZlcjogU2Vzc2lvbkdpdEh1YkluZm9SZXNvbHZlcjsgcmVhZG9ubHkgZ2l0SHViU2VydmljZTogVGVzdEdpdEh1YlNlcnZpY2UgfT4ge1xuXHRcdGNvbnN0IGdpdEh1YlNlcnZpY2UgPSBuZXcgVGVzdEdpdEh1YlNlcnZpY2UoKTtcblx0XHRnaXRIdWJTZXJ2aWNlLnNldFB1bGxSZXF1ZXN0TnVtYmVyKCdvd25lcicsICdyZXBvJywgJ2ZlYXR1cmUnLCA0Mik7XG5cdFx0Z2l0SHViU2VydmljZS5zZXRQdWxsUmVxdWVzdCgnb3duZXInLCAncmVwbycsIDQyLCBtYWtlUHVsbFJlcXVlc3QoZGV0YWlscykpO1xuXHRcdGNvbnN0IHsgcmVzb2x2ZXIgfSA9IGNyZWF0ZVJlc29sdmVyKGdpdE1ldGEoJ293bmVyJywgJ3JlcG8nLCAnZmVhdHVyZScpLCBnaXRIdWJTZXJ2aWNlKTtcblx0XHRhd2FpdCB0aW1lb3V0KDApO1xuXHRcdHJldHVybiB7IHJlc29sdmVyLCBnaXRIdWJTZXJ2aWNlIH07XG5cdH1cbn0pO1xuXG5pbnRlcmZhY2UgUHVsbFJlcXVlc3REZXRhaWxzIHtcblx0cmVhZG9ubHkgc3RhdGU6IEdpdEh1YlB1bGxSZXF1ZXN0U3RhdGU7XG5cdHJlYWRvbmx5IGlzRHJhZnQ6IGJvb2xlYW47XG5cdHJlYWRvbmx5IGhlYWRTaGE/OiBzdHJpbmc7XG59XG5cbmZ1bmN0aW9uIGdpdE1ldGEob3duZXI6IHN0cmluZywgcmVwbzogc3RyaW5nLCBicmFuY2g6IHN0cmluZyk6IFNlc3Npb25NZXRhIHtcblx0cmV0dXJuIHsgZ2l0OiB7IGhhc0dpdEh1YlJlbW90ZTogdHJ1ZSwgZ2l0aHViT3duZXI6IG93bmVyLCBnaXRodWJSZXBvOiByZXBvLCBicmFuY2hOYW1lOiBicmFuY2ggfSB9O1xufVxuXG5mdW5jdGlvbiB0aHJlYWQoaXNSZXNvbHZlZDogYm9vbGVhbik6IElHaXRIdWJQdWxsUmVxdWVzdFJldmlld1RocmVhZCB7XG5cdHJldHVybiB7IGlkOiBgdGhyZWFkLSR7aXNSZXNvbHZlZH1gLCBpc1Jlc29sdmVkLCBwYXRoOiAnZmlsZS50cycsIGxpbmU6IDEsIGNvbW1lbnRzOiBbXSB9O1xufVxuXG5mdW5jdGlvbiBtYWtlUHVsbFJlcXVlc3QoZGV0YWlsczogUHVsbFJlcXVlc3REZXRhaWxzKTogSUdpdEh1YlB1bGxSZXF1ZXN0IHtcblx0cmV0dXJuIHtcblx0XHRudW1iZXI6IDQyLFxuXHRcdHRpdGxlOiAnJyxcblx0XHRib2R5OiAnJyxcblx0XHRzdGF0ZTogZGV0YWlscy5zdGF0ZSxcblx0XHRhdXRob3I6IHsgbG9naW46ICcnLCBhdmF0YXJVcmw6ICcnIH0sXG5cdFx0aGVhZFJlZjogJycsXG5cdFx0aGVhZFNoYTogZGV0YWlscy5oZWFkU2hhID8/ICdzaGEnLFxuXHRcdGJhc2VSZWY6ICcnLFxuXHRcdGlzRHJhZnQ6IGRldGFpbHMuaXNEcmFmdCxcblx0XHRjcmVhdGVkQXQ6ICcnLFxuXHRcdHVwZGF0ZWRBdDogJycsXG5cdFx0bWVyZ2VkQXQ6IHVuZGVmaW5lZCxcblx0XHRtZXJnZWFibGU6IHVuZGVmaW5lZCxcblx0XHRtZXJnZWFibGVTdGF0ZTogJycsXG5cdH07XG59XG5cbmZ1bmN0aW9uIHNuYXBzaG90KGluZm86IElHaXRIdWJJbmZvIHwgdW5kZWZpbmVkKTogeyBvd25lcjogc3RyaW5nOyByZXBvOiBzdHJpbmc7IHB1bGxSZXF1ZXN0OiB7IG51bWJlcjogbnVtYmVyOyB1cmk6IHN0cmluZzsgaWNvbjogVGhlbWVJY29uIHwgdW5kZWZpbmVkIH0gfCB1bmRlZmluZWQgfSB8IHVuZGVmaW5lZCB7XG5cdGlmICghaW5mbykge1xuXHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdH1cblx0cmV0dXJuIHtcblx0XHRvd25lcjogaW5mby5vd25lcixcblx0XHRyZXBvOiBpbmZvLnJlcG8sXG5cdFx0cHVsbFJlcXVlc3Q6IGluZm8ucHVsbFJlcXVlc3Rcblx0XHRcdD8geyBudW1iZXI6IGluZm8ucHVsbFJlcXVlc3QubnVtYmVyLCB1cmk6IGluZm8ucHVsbFJlcXVlc3QudXJpLnRvU3RyaW5nKCksIGljb246IGluZm8ucHVsbFJlcXVlc3QuaWNvbiB9XG5cdFx0XHQ6IHVuZGVmaW5lZCxcblx0fTtcbn1cblxuY2xhc3MgVGVzdEdpdEh1YlNlcnZpY2UgZXh0ZW5kcyBtb2NrPElHaXRIdWJTZXJ2aWNlPigpIHtcblxuXHRsb29rdXBDYWxscyA9IDA7XG5cdGNpTW9kZWxSZWZzID0gMDtcblx0cmV2aWV3VGhyZWFkTW9kZWxSZWZzID0gMDtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9wck51bWJlcnMgPSBuZXcgTWFwPHN0cmluZywgbnVtYmVyPigpO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9wck1vZGVscyA9IG5ldyBNYXA8c3RyaW5nLCBUZXN0UHVsbFJlcXVlc3RNb2RlbD4oKTtcblx0cHJpdmF0ZSByZWFkb25seSBfY2lNb2RlbHMgPSBuZXcgTWFwPHN0cmluZywgVGVzdENJTW9kZWw+KCk7XG5cdHByaXZhdGUgcmVhZG9ubHkgX3Jldmlld1RocmVhZE1vZGVscyA9IG5ldyBNYXA8c3RyaW5nLCBUZXN0UmV2aWV3VGhyZWFkc01vZGVsPigpO1xuXG5cdG92ZXJyaWRlIGZpbmRQdWxsUmVxdWVzdE51bWJlckJ5SGVhZEJyYW5jaCA9IGFzeW5jIChvd25lcjogc3RyaW5nLCByZXBvOiBzdHJpbmcsIGJyYW5jaDogc3RyaW5nKTogUHJvbWlzZTxudW1iZXIgfCB1bmRlZmluZWQ+ID0+IHtcblx0XHR0aGlzLmxvb2t1cENhbGxzKys7XG5cdFx0cmV0dXJuIHRoaXMuX3ByTnVtYmVycy5nZXQoYCR7b3duZXJ9LyR7cmVwb30jJHticmFuY2h9YCk7XG5cdH07XG5cblx0b3ZlcnJpZGUgY3JlYXRlUHVsbFJlcXVlc3RNb2RlbFJlZmVyZW5jZShvd25lcjogc3RyaW5nLCByZXBvOiBzdHJpbmcsIHByTnVtYmVyOiBudW1iZXIpOiBJUmVmZXJlbmNlPEdpdEh1YlB1bGxSZXF1ZXN0TW9kZWw+IHtcblx0XHRyZXR1cm4gbmV3IEltbW9ydGFsUmVmZXJlbmNlKHRoaXMuX3ByTW9kZWwob3duZXIsIHJlcG8sIHByTnVtYmVyKSBhcyB1bmtub3duIGFzIEdpdEh1YlB1bGxSZXF1ZXN0TW9kZWwpO1xuXHR9XG5cblx0b3ZlcnJpZGUgY3JlYXRlUHVsbFJlcXVlc3RDSU1vZGVsUmVmZXJlbmNlKG93bmVyOiBzdHJpbmcsIHJlcG86IHN0cmluZywgcHJOdW1iZXI6IG51bWJlciwgaGVhZFNoYTogc3RyaW5nKTogSVJlZmVyZW5jZTxHaXRIdWJQdWxsUmVxdWVzdENJTW9kZWw+IHtcblx0XHR0aGlzLmNpTW9kZWxSZWZzKys7XG5cdFx0cmV0dXJuIG5ldyBJbW1vcnRhbFJlZmVyZW5jZSh0aGlzLl9jaU1vZGVsKG93bmVyLCByZXBvLCBwck51bWJlciwgaGVhZFNoYSkgYXMgdW5rbm93biBhcyBHaXRIdWJQdWxsUmVxdWVzdENJTW9kZWwpO1xuXHR9XG5cblx0b3ZlcnJpZGUgY3JlYXRlUHVsbFJlcXVlc3RSZXZpZXdUaHJlYWRzTW9kZWxSZWZlcmVuY2Uob3duZXI6IHN0cmluZywgcmVwbzogc3RyaW5nLCBwck51bWJlcjogbnVtYmVyKTogSVJlZmVyZW5jZTxHaXRIdWJQdWxsUmVxdWVzdFJldmlld1RocmVhZHNNb2RlbD4ge1xuXHRcdHRoaXMucmV2aWV3VGhyZWFkTW9kZWxSZWZzKys7XG5cdFx0cmV0dXJuIG5ldyBJbW1vcnRhbFJlZmVyZW5jZSh0aGlzLl9yZXZpZXdUaHJlYWRNb2RlbChvd25lciwgcmVwbywgcHJOdW1iZXIpIGFzIHVua25vd24gYXMgR2l0SHViUHVsbFJlcXVlc3RSZXZpZXdUaHJlYWRzTW9kZWwpO1xuXHR9XG5cblx0c2V0UHVsbFJlcXVlc3ROdW1iZXIob3duZXI6IHN0cmluZywgcmVwbzogc3RyaW5nLCBicmFuY2g6IHN0cmluZywgcHJOdW1iZXI6IG51bWJlcik6IHZvaWQge1xuXHRcdHRoaXMuX3ByTnVtYmVycy5zZXQoYCR7b3duZXJ9LyR7cmVwb30jJHticmFuY2h9YCwgcHJOdW1iZXIpO1xuXHR9XG5cblx0c2V0UHVsbFJlcXVlc3Qob3duZXI6IHN0cmluZywgcmVwbzogc3RyaW5nLCBwck51bWJlcjogbnVtYmVyLCBwdWxsUmVxdWVzdDogSUdpdEh1YlB1bGxSZXF1ZXN0KTogdm9pZCB7XG5cdFx0dGhpcy5fcHJNb2RlbChvd25lciwgcmVwbywgcHJOdW1iZXIpLnNldChwdWxsUmVxdWVzdCk7XG5cdH1cblxuXHRzZXRDSVN0YXR1cyhvd25lcjogc3RyaW5nLCByZXBvOiBzdHJpbmcsIHByTnVtYmVyOiBudW1iZXIsIGhlYWRTaGE6IHN0cmluZywgc3RhdHVzOiBHaXRIdWJDSU92ZXJhbGxTdGF0dXMpOiB2b2lkIHtcblx0XHR0aGlzLl9jaU1vZGVsKG93bmVyLCByZXBvLCBwck51bWJlciwgaGVhZFNoYSkuc2V0KHN0YXR1cyk7XG5cdH1cblxuXHRzZXRSZXZpZXdUaHJlYWRzKG93bmVyOiBzdHJpbmcsIHJlcG86IHN0cmluZywgcHJOdW1iZXI6IG51bWJlciwgdGhyZWFkczogcmVhZG9ubHkgSUdpdEh1YlB1bGxSZXF1ZXN0UmV2aWV3VGhyZWFkW10pOiB2b2lkIHtcblx0XHR0aGlzLl9yZXZpZXdUaHJlYWRNb2RlbChvd25lciwgcmVwbywgcHJOdW1iZXIpLnNldCh0aHJlYWRzKTtcblx0fVxuXG5cdHByaXZhdGUgX3ByTW9kZWwob3duZXI6IHN0cmluZywgcmVwbzogc3RyaW5nLCBwck51bWJlcjogbnVtYmVyKTogVGVzdFB1bGxSZXF1ZXN0TW9kZWwge1xuXHRcdGNvbnN0IGtleSA9IGAke293bmVyfS8ke3JlcG99LyR7cHJOdW1iZXJ9YDtcblx0XHRsZXQgbW9kZWwgPSB0aGlzLl9wck1vZGVscy5nZXQoa2V5KTtcblx0XHRpZiAoIW1vZGVsKSB7XG5cdFx0XHRtb2RlbCA9IG5ldyBUZXN0UHVsbFJlcXVlc3RNb2RlbCgpO1xuXHRcdFx0dGhpcy5fcHJNb2RlbHMuc2V0KGtleSwgbW9kZWwpO1xuXHRcdH1cblx0XHRyZXR1cm4gbW9kZWw7XG5cdH1cblxuXHRwcml2YXRlIF9jaU1vZGVsKG93bmVyOiBzdHJpbmcsIHJlcG86IHN0cmluZywgcHJOdW1iZXI6IG51bWJlciwgaGVhZFNoYTogc3RyaW5nKTogVGVzdENJTW9kZWwge1xuXHRcdGNvbnN0IGtleSA9IGAke293bmVyfS8ke3JlcG99LyR7cHJOdW1iZXJ9LyR7aGVhZFNoYX1gO1xuXHRcdGxldCBtb2RlbCA9IHRoaXMuX2NpTW9kZWxzLmdldChrZXkpO1xuXHRcdGlmICghbW9kZWwpIHtcblx0XHRcdG1vZGVsID0gbmV3IFRlc3RDSU1vZGVsKCk7XG5cdFx0XHR0aGlzLl9jaU1vZGVscy5zZXQoa2V5LCBtb2RlbCk7XG5cdFx0fVxuXHRcdHJldHVybiBtb2RlbDtcblx0fVxuXG5cdHByaXZhdGUgX3Jldmlld1RocmVhZE1vZGVsKG93bmVyOiBzdHJpbmcsIHJlcG86IHN0cmluZywgcHJOdW1iZXI6IG51bWJlcik6IFRlc3RSZXZpZXdUaHJlYWRzTW9kZWwge1xuXHRcdGNvbnN0IGtleSA9IGAke293bmVyfS8ke3JlcG99LyR7cHJOdW1iZXJ9YDtcblx0XHRsZXQgbW9kZWwgPSB0aGlzLl9yZXZpZXdUaHJlYWRNb2RlbHMuZ2V0KGtleSk7XG5cdFx0aWYgKCFtb2RlbCkge1xuXHRcdFx0bW9kZWwgPSBuZXcgVGVzdFJldmlld1RocmVhZHNNb2RlbCgpO1xuXHRcdFx0dGhpcy5fcmV2aWV3VGhyZWFkTW9kZWxzLnNldChrZXksIG1vZGVsKTtcblx0XHR9XG5cdFx0cmV0dXJuIG1vZGVsO1xuXHR9XG59XG5cbmNsYXNzIFRlc3RQdWxsUmVxdWVzdE1vZGVsIHtcblx0cHJpdmF0ZSByZWFkb25seSBfcHVsbFJlcXVlc3QgPSBvYnNlcnZhYmxlVmFsdWU8SUdpdEh1YlB1bGxSZXF1ZXN0IHwgdW5kZWZpbmVkPigndGVzdC5wdWxsUmVxdWVzdCcsIHVuZGVmaW5lZCk7XG5cdHJlYWRvbmx5IHB1bGxSZXF1ZXN0OiBJT2JzZXJ2YWJsZTxJR2l0SHViUHVsbFJlcXVlc3QgfCB1bmRlZmluZWQ+ID0gdGhpcy5fcHVsbFJlcXVlc3Q7XG5cdHNldChwdWxsUmVxdWVzdDogSUdpdEh1YlB1bGxSZXF1ZXN0KTogdm9pZCB7IHRoaXMuX3B1bGxSZXF1ZXN0LnNldChwdWxsUmVxdWVzdCwgdW5kZWZpbmVkKTsgfVxufVxuXG5jbGFzcyBUZXN0Q0lNb2RlbCB7XG5cdHByaXZhdGUgcmVhZG9ubHkgX292ZXJhbGxTdGF0dXMgPSBvYnNlcnZhYmxlVmFsdWU8R2l0SHViQ0lPdmVyYWxsU3RhdHVzPigndGVzdC5jaVN0YXR1cycsIEdpdEh1YkNJT3ZlcmFsbFN0YXR1cy5OZXV0cmFsKTtcblx0cmVhZG9ubHkgb3ZlcmFsbFN0YXR1czogSU9ic2VydmFibGU8R2l0SHViQ0lPdmVyYWxsU3RhdHVzPiA9IHRoaXMuX292ZXJhbGxTdGF0dXM7XG5cdHNldChzdGF0dXM6IEdpdEh1YkNJT3ZlcmFsbFN0YXR1cyk6IHZvaWQgeyB0aGlzLl9vdmVyYWxsU3RhdHVzLnNldChzdGF0dXMsIHVuZGVmaW5lZCk7IH1cbn1cblxuY2xhc3MgVGVzdFJldmlld1RocmVhZHNNb2RlbCB7XG5cdHByaXZhdGUgcmVhZG9ubHkgX3Jldmlld1RocmVhZHMgPSBvYnNlcnZhYmxlVmFsdWU8cmVhZG9ubHkgSUdpdEh1YlB1bGxSZXF1ZXN0UmV2aWV3VGhyZWFkW10+KCd0ZXN0LnJldmlld1RocmVhZHMnLCBbXSk7XG5cdHJlYWRvbmx5IHJldmlld1RocmVhZHM6IElPYnNlcnZhYmxlPHJlYWRvbmx5IElHaXRIdWJQdWxsUmVxdWVzdFJldmlld1RocmVhZFtdPiA9IHRoaXMuX3Jldmlld1RocmVhZHM7XG5cdHNldCh0aHJlYWRzOiByZWFkb25seSBJR2l0SHViUHVsbFJlcXVlc3RSZXZpZXdUaHJlYWRbXSk6IHZvaWQgeyB0aGlzLl9yZXZpZXdUaHJlYWRzLnNldCh0aHJlYWRzLCB1bmRlZmluZWQpOyB9XG59XG4iXSwKICAibWFwcGluZ3MiOiAiQUFLQSxPQUFPLFlBQVk7QUFDbkIsU0FBUyxlQUFlO0FBQ3hCLFNBQVMsaUJBQWlCLHlCQUEwQztBQUNwRSxTQUFTLFNBQVMsdUJBQXlDO0FBRTNELFNBQVMsWUFBWTtBQUNyQixTQUFTLCtDQUErQztBQUN4RCxTQUFTLHNCQUFzQjtBQU8vQixTQUFTLHdCQUF3Qix1QkFBdUIsOEJBQWtGO0FBQzFJLFNBQVMsaUNBQWlDO0FBRTFDLE1BQU0sNkJBQTZCLE1BQU07QUFFeEMsUUFBTSxRQUFRLElBQUksZ0JBQWdCO0FBRWxDLFdBQVMsTUFBTSxNQUFNLE1BQU0sQ0FBQztBQUU1QiwwQ0FBd0M7QUFTeEMsV0FBUyxlQUFlLE1BQStCLGVBR3JEO0FBQ0QsVUFBTSxVQUFVLGdCQUF5QyxhQUFhLElBQUk7QUFDMUUsVUFBTSxXQUFXLElBQUksMEJBQTBCLFNBQVMsZ0JBQWdCLGVBQWUsSUFBSSxlQUFlLENBQUM7QUFDM0csVUFBTSxJQUFJLFFBQVEsWUFBVTtBQUFFLGVBQVMsV0FBVyxLQUFLLE1BQU07QUFBQSxJQUFHLENBQUMsQ0FBQztBQUNsRSxXQUFPLEVBQUUsVUFBVSxRQUFRO0FBQUEsRUFDNUI7QUFFQSxPQUFLLHNDQUFzQyxZQUFZO0FBQ3RELFVBQU0sRUFBRSxTQUFTLElBQUksZUFBZSxRQUFXLElBQUksa0JBQWtCLENBQUM7QUFDdEUsVUFBTSxRQUFRLENBQUM7QUFDZixX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
