import assert from "assert";
import { DeferredPromise } from "../../../../base/common/async.js";
import { CancellationToken, CancellationTokenSource } from "../../../../base/common/cancellation.js";
import { Emitter } from "../../../../base/common/event.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../base/test/common/utils.js";
import { NullLogService } from "../../../log/common/log.js";
import { GitHubRequestError } from "../../common/githubTransport.js";
import { PullRequestResourceService } from "../../common/pullRequestResourceService.js";
import { FakeGitHubScheduler } from "./fakeGitHubScheduler.js";
const account = { host: "github.example.test", accountId: "101" };
const ref = { ...account, owner: "old-owner", repo: "old-repo", number: 7 };
const policy = {
  dormantGrace: 20,
  fragmentBodyGrace: 5,
  maximumDormantEntries: 2,
  coreVisible: 1e3,
  coreBackground: 2e3,
  conversationVisible: 10,
  conversationBackground: 100,
  checksPendingVisible: 5,
  checksPendingBackground: 50,
  checksBackstop: 500,
  mergeabilityVisible: 20,
  mergeabilityBackground: 200,
  participants: 300,
  failureRetryBase: 5,
  failureRetryMaximum: 20,
  jitter: 0
};
function core(headSha, repositoryNameWithOwner = "new-owner/new-repo") {
  return {
    id: "PR_7",
    repositoryId: "R_1",
    repositoryNameWithOwner,
    number: 7,
    title: "PR",
    url: "https://github.example.test/new-owner/new-repo/pull/7",
    state: "open",
    draft: false,
    headSha,
    headRef: "feature",
    baseSha: "base",
    baseRef: "main"
  };
}
class TestPullRequestQueryService {
  constructor() {
    this.calls = [];
    this.handlers = /* @__PURE__ */ new Map();
    this.headSha = "head-1";
  }
  async fetch(fragment, requestRef, _core, options, _credential, signal) {
    const call = { fragment, ref: requestRef, options, signal };
    this.calls.push(call);
    const handler = this.handlers.get(fragment);
    if (handler) {
      return handler(call);
    }
    switch (fragment) {
      case "core":
        return { fragment, value: core(this.headSha), complete: true };
      case "topLevelComments":
        return { fragment, value: [{ id: "C1", body: options.conversation?.includeBodies ? "body" : void 0 }], complete: true };
      case "submittedReviews":
        return { fragment, value: [], complete: true };
      case "inlineComments":
        return { fragment, value: [], complete: true };
      case "reviewThreads":
        return { fragment, value: [], complete: true, headSha: this.headSha };
      case "checks":
        return {
          fragment,
          value: {
            headSha: this.headSha,
            requirednessComplete: true,
            expectedSuites: [],
            expectedSuitesComplete: true,
            checks: [{ id: "check", type: "checkRun", name: "CI", status: "IN_PROGRESS", required: true }]
          },
          complete: true,
          headSha: this.headSha
        };
      case "mergeability":
        return {
          fragment,
          value: {
            headSha: this.headSha,
            baseSha: "base",
            mergeable: "MERGEABLE",
            viewerCanUpdate: true,
            viewerCanMerge: true,
            viewerCanEnableAutoMerge: true,
            allowedMergeMethods: ["SQUASH"],
            autoMergeEnabled: false,
            mergeQueueRequired: false,
            queueRequirementKnown: true
          },
          complete: true,
          headSha: this.headSha
        };
      case "participants":
        return { fragment, value: { participants: [] }, complete: true };
    }
  }
}
class TestGitHubCredentialService {
  constructor() {
    this._onDidInvalidate = new Emitter();
    this.onDidInvalidate = this._onDidInvalidate.event;
    this._controller = new AbortController();
    this.credential = { account, token: "token", generation: 1, signal: this._controller.signal };
  }
  async getCredential(signal) {
    if (signal.aborted) {
      throw signal.reason;
    }
    return this.credential;
  }
  resolveCredential() {
    return Promise.resolve(this.credential);
  }
  handleRequestError() {
  }
  invalidate(reason) {
    this._controller.abort(new Error("credential invalidated"));
    this._onDidInvalidate.fire({ credential: this.credential, reason });
  }
  dispose() {
    this._onDidInvalidate.dispose();
  }
}
suite("PullRequestResourceService", () => {
  const disposables = ensureNoDisposablesAreLeakedInTestSuite();
  function setup() {
    const clock = new FakeGitHubScheduler({ now: 0 });
    const credentials = disposables.add(new TestGitHubCredentialService());
    const queries = new TestPullRequestQueryService();
    const service = disposables.add(new PullRequestResourceService(clock, policy, credentials, queries, new NullLogService()));
    return { clock, credentials, queries, service };
  }
  test("shares resources while keeping fragment priority and polling independent", async () => {
    const { clock, queries, service } = setup();
    const comments = service.subscribePullRequest(ref, {
      priority: "visible",
      conversation: { topLevelComments: true, includeBodies: true }
    });
    await comments.refresh();
    queries.calls.length = 0;
    const checks = service.subscribePullRequest({ ...ref, owner: "OLD-OWNER", repo: "OLD-REPO" }, {
      priority: "background",
      checks: { required: true }
    });
    assert.strictEqual(comments.resource, checks.resource);
    await checks.refresh("checks");
    assert.deepStrictEqual(queries.calls.map((call) => call.fragment), ["checks"]);
    queries.calls.length = 0;
    const canonical = service.subscribePullRequest({ ...ref, owner: "new-owner", repo: "new-repo" }, { priority: "background" });
    assert.strictEqual(canonical.resource, comments.resource);
    assert.deepStrictEqual({
      snapshot: comments.resource.snapshot.get()
    }, {
      snapshot: {
        ref: { ...ref, owner: "new-owner", repo: "new-repo" },
        generation: 2,
        headGeneration: 1,
        core: {
          value: core("head-1"),
          status: "ready",
          complete: true,
          observedAt: (/* @__PURE__ */ new Date(0)).toISOString(),
          attemptedAt: (/* @__PURE__ */ new Date(0)).toISOString()
        },
        topLevelComments: {
          value: [{ id: "C1", body: "body" }],
          status: "ready",
          complete: true,
          observedAt: (/* @__PURE__ */ new Date(0)).toISOString(),
          attemptedAt: (/* @__PURE__ */ new Date(0)).toISOString(),
          headSha: void 0
        },
        submittedReviews: { status: "missing", complete: false },
        inlineComments: { status: "missing", complete: false },
        reviewThreads: { status: "missing", complete: false },
        checks: {
          value: {
            headSha: "head-1",
            requirednessComplete: true,
            expectedSuites: [],
            expectedSuitesComplete: true,
            checks: [{ id: "check", type: "checkRun", name: "CI", status: "IN_PROGRESS", required: true }]
          },
          status: "ready",
          complete: true,
          observedAt: (/* @__PURE__ */ new Date(0)).toISOString(),
          attemptedAt: (/* @__PURE__ */ new Date(0)).toISOString(),
          headSha: "head-1"
        },
        mergeability: { status: "missing", complete: false },
        participants: { status: "missing", complete: false }
      }
    });
    comments.update({
      priority: "background",
      conversation: { topLevelComments: true, includeBodies: false }
    });
    queries.calls.length = 0;
    clock.advanceBy(10);
    await flushAsync();
    assert.deepStrictEqual(comments.resource.snapshot.get().topLevelComments.value, [{ id: "C1" }]);
    assert.strictEqual(queries.calls.length, 0);
    checks.dispose();
    queries.calls.length = 0;
    clock.advanceBy(90);
    await flushAsync();
    assert.deepStrictEqual(queries.calls.map((call) => call.fragment), ["topLevelComments"]);
    comments.dispose();
    canonical.dispose();
    queries.calls.length = 0;
    clock.advanceBy(1e4);
    await flushAsync();
    assert.deepStrictEqual(queries.calls, []);
  });
  test("retains dormant identity briefly, then expires it", async () => {
    const { clock, service } = setup();
    const first = service.subscribePullRequest(ref, { priority: "background" });
    await first.refresh("core");
    const resource = first.resource;
    first.dispose();
    clock.advanceBy(19);
    const resumed = service.subscribePullRequest(ref, { priority: "background" });
    assert.strictEqual(resumed.resource, resource);
    resumed.dispose();
    clock.advanceBy(20);
    const replaced = service.subscribePullRequest(ref, { priority: "background" });
    assert.notStrictEqual(replaced.resource, resource);
    replaced.dispose();
  });
  test("converges colliding canonical aliases onto shared state and scheduling", async () => {
    const { clock, queries, service } = setup();
    const canonical = service.subscribePullRequest({
      ...ref,
      owner: "new-owner",
      repo: "new-repo"
    }, {
      priority: "visible",
      conversation: { topLevelComments: true }
    });
    const renamed = service.subscribePullRequest(ref, {
      priority: "background",
      checks: { required: true }
    });
    await renamed.refresh("checks");
    await canonical.refresh("topLevelComments");
    assert.deepStrictEqual({
      distinctResources: canonical.resource !== renamed.resource,
      sharedSnapshot: canonical.resource.snapshot.get() === renamed.resource.snapshot.get(),
      ref: renamed.resource.ref,
      generation: renamed.resource.snapshot.get().generation,
      fragments: queries.calls.map((call) => call.fragment),
      comments: renamed.resource.snapshot.get().topLevelComments.value,
      checks: canonical.resource.snapshot.get().checks.value?.checks
    }, {
      distinctResources: true,
      sharedSnapshot: true,
      ref: { ...ref, owner: "new-owner", repo: "new-repo" },
      generation: 2,
      fragments: ["core", "checks", "topLevelComments"],
      comments: [{ id: "C1", body: void 0 }],
      checks: [{ id: "check", type: "checkRun", name: "CI", status: "IN_PROGRESS", required: true }]
    });
    canonical.dispose();
    renamed.dispose();
    queries.calls.length = 0;
    clock.advanceBy(1e4);
    await flushAsync();
    assert.deepStrictEqual(queries.calls, []);
  });
  test("continues a full refresh on the canonical entry after merging", async () => {
    const { queries, service } = setup();
    let coreCall = 0;
    queries.handlers.set("core", () => ({
      fragment: "core",
      value: core("head-1", coreCall++ === 0 ? "old-owner/old-repo" : "new-owner/new-repo"),
      complete: true
    }));
    const renamed = service.subscribePullRequest(ref, {
      priority: "visible",
      conversation: { topLevelComments: true }
    });
    await renamed.refresh();
    const canonical = service.subscribePullRequest({
      ...ref,
      owner: "new-owner",
      repo: "new-repo"
    }, { priority: "background" });
    queries.calls.length = 0;
    await renamed.refresh();
    assert.deepStrictEqual({
      distinctResources: canonical.resource !== renamed.resource,
      sharedSnapshot: canonical.resource.snapshot.get() === renamed.resource.snapshot.get(),
      calls: queries.calls.map((call) => call.fragment),
      comments: canonical.resource.snapshot.get().topLevelComments
    }, {
      distinctResources: true,
      sharedSnapshot: true,
      calls: ["core", "topLevelComments"],
      comments: {
        value: [{ id: "C1", body: void 0 }],
        status: "ready",
        complete: true,
        observedAt: (/* @__PURE__ */ new Date(0)).toISOString(),
        attemptedAt: (/* @__PURE__ */ new Date(0)).toISOString(),
        headSha: void 0
      }
    });
    canonical.dispose();
    renamed.dispose();
  });
  test("detaches one cancelled refresh waiter without cancelling shared work", async () => {
    const { queries, service } = setup();
    const release = new DeferredPromise();
    const started = new DeferredPromise();
    queries.handlers.set("core", async (call) => {
      await started.complete();
      await release.p;
      assert.strictEqual(call.signal.aborted, false);
      return { fragment: "core", value: core("head-1"), complete: true };
    });
    const first = service.subscribePullRequest(ref, { priority: "interactive" });
    const second = service.subscribePullRequest(ref, { priority: "interactive" });
    const cancellation = disposables.add(new CancellationTokenSource());
    const cancelled = first.refresh("core", cancellation.token);
    const shared = second.refresh("core");
    await started.p;
    cancellation.cancel();
    await assert.rejects(() => cancelled);
    await release.complete();
    await shared;
    assert.deepStrictEqual({
      callCount: queries.calls.length,
      status: first.resource.snapshot.get().core.status
    }, {
      callCount: 1,
      status: "ready"
    });
    first.dispose();
    second.dispose();
  });
  test("authoritative refresh and typed invalidation supersede older work", async () => {
    const { clock, queries, service } = setup();
    const subscription = service.subscribePullRequest(ref, {
      priority: "interactive",
      checks: { required: true }
    });
    await subscription.refresh("core");
    await subscription.refresh("checks");
    const authoritativeStarted = new DeferredPromise();
    const releaseAuthoritativeOld = new DeferredPromise();
    let authoritativeCall = 0;
    let authoritativeOldSignal;
    queries.handlers.set("checks", async (call) => {
      authoritativeCall++;
      if (authoritativeCall === 1) {
        authoritativeOldSignal = call.signal;
        await authoritativeStarted.complete();
        await releaseAuthoritativeOld.p;
        return checksResult("old");
      }
      return checksResult("authoritative");
    });
    const oldRefresh = subscription.refresh("checks");
    await authoritativeStarted.p;
    const authoritative = subscription.refresh("checks", CancellationToken.None, { authoritative: true });
    await authoritative;
    await releaseAuthoritativeOld.complete();
    await oldRefresh;
    assert.deepStrictEqual({
      oldAborted: authoritativeOldSignal?.aborted,
      checkId: subscription.resource.snapshot.get().checks.value?.checks[0]?.id,
      callCount: authoritativeCall
    }, {
      oldAborted: true,
      checkId: "authoritative",
      callCount: 2
    });
    const invalidationStarted = new DeferredPromise();
    const releaseInvalidationOld = new DeferredPromise();
    let invalidationCall = 0;
    let invalidationOldSignal;
    queries.handlers.set("checks", async (call) => {
      invalidationCall++;
      if (invalidationCall === 1) {
        invalidationOldSignal = call.signal;
        await invalidationStarted.complete();
        await releaseInvalidationOld.p;
        return checksResult("stale");
      }
      return checksResult("fresh");
    });
    const invalidatedRefresh = subscription.refresh("checks");
    await invalidationStarted.p;
    service.invalidatePullRequest(ref, ["checks"]);
    assert.deepStrictEqual({
      oldAborted: invalidationOldSignal?.aborted,
      status: subscription.resource.snapshot.get().checks.status,
      complete: subscription.resource.snapshot.get().checks.complete
    }, {
      oldAborted: true,
      status: "stale",
      complete: false
    });
    clock.flushDue();
    await flushAsync();
    await releaseInvalidationOld.complete();
    await invalidatedRefresh;
    assert.deepStrictEqual({
      checkId: subscription.resource.snapshot.get().checks.value?.checks[0]?.id,
      callCount: invalidationCall
    }, {
      checkId: "fresh",
      callCount: 2
    });
    subscription.update({ priority: "background" });
    queries.calls.length = 0;
    service.invalidatePullRequest(ref, ["checks"]);
    clock.flushDue();
    await flushAsync();
    assert.strictEqual(queries.calls.length, 0);
    subscription.dispose();
  });
  test("supersedes in-flight work when a subscriber expands the data shape", async () => {
    const { queries, service } = setup();
    const firstStarted = new DeferredPromise();
    const releaseFirst = new DeferredPromise();
    let call = 0;
    queries.handlers.set("topLevelComments", async (queryCall) => {
      call++;
      if (call === 1) {
        await firstStarted.complete();
        await releaseFirst.p;
      }
      return {
        fragment: "topLevelComments",
        value: [{ id: `C${call}`, body: queryCall.options.conversation?.includeBodies ? "body" : void 0 }],
        complete: true
      };
    });
    const topology = service.subscribePullRequest(ref, {
      priority: "background",
      conversation: { topLevelComments: true }
    });
    await topology.refresh("core");
    const first = topology.refresh("topLevelComments");
    await firstStarted.p;
    const bodies = service.subscribePullRequest(ref, {
      priority: "visible",
      conversation: { topLevelComments: true, includeBodies: true }
    });
    await bodies.refresh("topLevelComments");
    await releaseFirst.complete();
    await first;
    assert.deepStrictEqual({
      callCount: call,
      comments: bodies.resource.snapshot.get().topLevelComments.value
    }, {
      callCount: 2,
      comments: [{ id: "C2", body: "body" }]
    });
    topology.dispose();
    bodies.dispose();
  });
  test("retries transient failures with bounded scheduled backoff", async () => {
    const { clock, queries, service } = setup();
    let commentsCall = 0;
    queries.handlers.set("topLevelComments", () => {
      commentsCall++;
      if (commentsCall === 1) {
        throw new GitHubRequestError("temporary", "server", 502);
      }
      return { fragment: "topLevelComments", value: [{ id: "C1" }], complete: true };
    });
    const subscription = service.subscribePullRequest(ref, {
      priority: "visible",
      conversation: { topLevelComments: true }
    });
    await subscription.refresh("core");
    await assert.rejects(() => subscription.refresh("topLevelComments"), /temporary/);
    clock.advanceBy(4);
    await flushAsync();
    assert.strictEqual(commentsCall, 1);
    clock.advanceBy(1);
    await flushAsync();
    assert.deepStrictEqual({
      commentsCall,
      state: subscription.resource.snapshot.get().topLevelComments
    }, {
      commentsCall: 2,
      state: {
        value: [{ id: "C1" }],
        status: "ready",
        complete: true,
        observedAt: (/* @__PURE__ */ new Date(5)).toISOString(),
        attemptedAt: (/* @__PURE__ */ new Date(5)).toISOString(),
        headSha: void 0
      }
    });
    subscription.dispose();
  });
  test("rejects old-head and invalidated credential results", async () => {
    const { credentials, queries, service } = setup();
    let coreCall = 0;
    queries.handlers.set("core", () => {
      coreCall++;
      return { fragment: "core", value: core(coreCall === 1 ? "head-1" : "head-2"), complete: true };
    });
    const checksStarted = new DeferredPromise();
    const releaseChecks = new DeferredPromise();
    let checksCall = 0;
    queries.handlers.set("checks", async () => {
      checksCall++;
      if (checksCall === 1) {
        await checksStarted.complete();
        await releaseChecks.p;
        return {
          fragment: "checks",
          value: { headSha: "head-1", checks: [], requirednessComplete: true, expectedSuites: [], expectedSuitesComplete: true },
          complete: true,
          headSha: "head-1"
        };
      }
      return {
        fragment: "checks",
        value: { headSha: "head-2", checks: [], requirednessComplete: true, expectedSuites: [], expectedSuitesComplete: true },
        complete: true,
        headSha: "head-2"
      };
    });
    const subscription = service.subscribePullRequest(ref, { priority: "interactive", checks: { required: true } });
    await subscription.refresh("core");
    const oldChecks = subscription.refresh("checks");
    await checksStarted.p;
    queries.headSha = "head-2";
    await subscription.refresh("core");
    await releaseChecks.complete();
    await oldChecks;
    assert.deepStrictEqual({
      status: subscription.resource.snapshot.get().checks.status,
      complete: subscription.resource.snapshot.get().checks.complete
    }, {
      status: "missing",
      complete: false
    });
    await subscription.refresh("checks");
    assert.strictEqual(subscription.resource.snapshot.get().checks.headSha, "head-2");
    assert.deepStrictEqual({
      generation: subscription.resource.snapshot.get().generation,
      headGeneration: subscription.resource.snapshot.get().headGeneration
    }, {
      generation: 2,
      headGeneration: 2
    });
    const oldResource = subscription.resource;
    credentials.invalidate("account");
    await assert.rejects(() => subscription.refresh("core"), /no longer active/);
    const replacement = service.subscribePullRequest(ref, { priority: "interactive" });
    assert.notStrictEqual(replacement.resource, oldResource);
    replacement.dispose();
    subscription.dispose();
  });
  test("rejects review thread results after the core head changes", async () => {
    const { queries, service } = setup();
    const threadsStarted = new DeferredPromise();
    const releaseThreads = new DeferredPromise();
    let threadsCall = 0;
    queries.handlers.set("reviewThreads", async () => {
      threadsCall++;
      if (threadsCall === 1) {
        await threadsStarted.complete();
        await releaseThreads.p;
        return { fragment: "reviewThreads", value: [], complete: true, headSha: "head-1" };
      }
      return { fragment: "reviewThreads", value: [], complete: true, headSha: "head-2" };
    });
    const subscription = service.subscribePullRequest(ref, {
      priority: "interactive",
      conversation: { reviewThreads: true }
    });
    await subscription.refresh("core");
    const oldThreads = subscription.refresh("reviewThreads");
    await threadsStarted.p;
    queries.headSha = "head-2";
    await subscription.refresh("core");
    await releaseThreads.complete();
    await oldThreads;
    assert.deepStrictEqual(subscription.resource.snapshot.get().reviewThreads, {
      status: "missing",
      complete: false,
      attemptedAt: (/* @__PURE__ */ new Date(0)).toISOString(),
      headSha: void 0,
      error: void 0
    });
    await subscription.refresh("reviewThreads");
    assert.strictEqual(subscription.resource.snapshot.get().reviewThreads.headSha, "head-2");
    subscription.dispose();
  });
  test("stops polling terminal pull requests and keeps failed fragments incomplete", async () => {
    const { clock, queries, service } = setup();
    queries.handlers.set("core", () => ({
      fragment: "core",
      value: { ...core("head-1"), state: "merged", mergedAt: "2026-08-12T00:00:00.000Z" },
      complete: true
    }));
    queries.handlers.set("topLevelComments", () => {
      throw new GitHubRequestError("comments failed", "server", 500);
    });
    const subscription = service.subscribePullRequest(ref, {
      priority: "visible",
      conversation: { topLevelComments: true }
    });
    await subscription.refresh("core");
    await assert.rejects(() => subscription.refresh("topLevelComments"), /comments failed/);
    assert.deepStrictEqual({
      coreState: subscription.resource.snapshot.get().core.value?.state,
      commentsStatus: subscription.resource.snapshot.get().topLevelComments.status,
      commentsComplete: subscription.resource.snapshot.get().topLevelComments.complete
    }, {
      coreState: "merged",
      commentsStatus: "error",
      commentsComplete: false
    });
    queries.calls.length = 0;
    clock.advanceBy(1e4);
    await flushAsync();
    assert.deepStrictEqual(queries.calls, []);
    subscription.dispose();
  });
});
function checksResult(id) {
  return {
    fragment: "checks",
    value: {
      headSha: "head-1",
      requirednessComplete: true,
      expectedSuites: [],
      expectedSuitesComplete: true,
      checks: [{ id, type: "checkRun", name: id, status: "COMPLETED" }]
    },
    complete: true,
    headSha: "head-1"
  };
}
async function flushAsync() {
  for (let index = 0; index < 10; index++) {
    await Promise.resolve();
  }
}
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxwbGF0Zm9ybVxcZ2l0aHViXFx0ZXN0XFxub2RlXFxwdWxsUmVxdWVzdFJlc291cmNlU2VydmljZS50ZXN0LnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IGFzc2VydCBmcm9tICdhc3NlcnQnO1xuaW1wb3J0IHsgRGVmZXJyZWRQcm9taXNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vYXN5bmMuanMnO1xuaW1wb3J0IHsgQ2FuY2VsbGF0aW9uVG9rZW4sIENhbmNlbGxhdGlvblRva2VuU291cmNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vY2FuY2VsbGF0aW9uLmpzJztcbmltcG9ydCB7IEVtaXR0ZXIgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9ldmVudC5qcyc7XG5pbXBvcnQgeyBlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL3Rlc3QvY29tbW9uL3V0aWxzLmpzJztcbmltcG9ydCB7IE51bGxMb2dTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vbG9nL2NvbW1vbi9sb2cuanMnO1xuaW1wb3J0IHsgUHVsbFJlcXVlc3RDb3JlLCBQdWxsUmVxdWVzdEZyYWdtZW50LCBQdWxsUmVxdWVzdFJlZiwgUHVsbFJlcXVlc3RTdWJzY3JpcHRpb25PcHRpb25zIH0gZnJvbSAnLi4vLi4vY29tbW9uL2dpdGh1YlB1bGxSZXF1ZXN0U2VydmljZS5qcyc7XG5pbXBvcnQgeyBHaXRIdWJDcmVkZW50aWFsLCBHaXRIdWJDcmVkZW50aWFsSW52YWxpZGF0aW9uLCBJR2l0SHViQ3JlZGVudGlhbHMgfSBmcm9tICcuLi8uLi9jb21tb24vZ2l0aHViQ3JlZGVudGlhbFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgR2l0SHViUmVxdWVzdEVycm9yIH0gZnJvbSAnLi4vLi4vY29tbW9uL2dpdGh1YlRyYW5zcG9ydC5qcyc7XG5pbXBvcnQgeyBJUHVsbFJlcXVlc3RRdWVyeSwgUHVsbFJlcXVlc3RGcmFnbWVudFJlc3VsdCB9IGZyb20gJy4uLy4uL2NvbW1vbi9wdWxsUmVxdWVzdFF1ZXJ5U2VydmljZS5qcyc7XG5pbXBvcnQgeyBQdWxsUmVxdWVzdFBvbGxpbmdQb2xpY3ksIFB1bGxSZXF1ZXN0UmVzb3VyY2VTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vY29tbW9uL3B1bGxSZXF1ZXN0UmVzb3VyY2VTZXJ2aWNlLmpzJztcbmltcG9ydCB7IEZha2VHaXRIdWJTY2hlZHVsZXIgfSBmcm9tICcuL2Zha2VHaXRIdWJTY2hlZHVsZXIuanMnO1xuXG5jb25zdCBhY2NvdW50ID0geyBob3N0OiAnZ2l0aHViLmV4YW1wbGUudGVzdCcsIGFjY291bnRJZDogJzEwMScgfTtcbmNvbnN0IHJlZjogUHVsbFJlcXVlc3RSZWYgPSB7IC4uLmFjY291bnQsIG93bmVyOiAnb2xkLW93bmVyJywgcmVwbzogJ29sZC1yZXBvJywgbnVtYmVyOiA3IH07XG5cbmNvbnN0IHBvbGljeTogUHVsbFJlcXVlc3RQb2xsaW5nUG9saWN5ID0ge1xuXHRkb3JtYW50R3JhY2U6IDIwLFxuXHRmcmFnbWVudEJvZHlHcmFjZTogNSxcblx0bWF4aW11bURvcm1hbnRFbnRyaWVzOiAyLFxuXHRjb3JlVmlzaWJsZTogMV8wMDAsXG5cdGNvcmVCYWNrZ3JvdW5kOiAyXzAwMCxcblx0Y29udmVyc2F0aW9uVmlzaWJsZTogMTAsXG5cdGNvbnZlcnNhdGlvbkJhY2tncm91bmQ6IDEwMCxcblx0Y2hlY2tzUGVuZGluZ1Zpc2libGU6IDUsXG5cdGNoZWNrc1BlbmRpbmdCYWNrZ3JvdW5kOiA1MCxcblx0Y2hlY2tzQmFja3N0b3A6IDUwMCxcblx0bWVyZ2VhYmlsaXR5VmlzaWJsZTogMjAsXG5cdG1lcmdlYWJpbGl0eUJhY2tncm91bmQ6IDIwMCxcblx0cGFydGljaXBhbnRzOiAzMDAsXG5cdGZhaWx1cmVSZXRyeUJhc2U6IDUsXG5cdGZhaWx1cmVSZXRyeU1heGltdW06IDIwLFxuXHRqaXR0ZXI6IDAsXG59O1xuXG5mdW5jdGlvbiBjb3JlKGhlYWRTaGE6IHN0cmluZywgcmVwb3NpdG9yeU5hbWVXaXRoT3duZXIgPSAnbmV3LW93bmVyL25ldy1yZXBvJyk6IFB1bGxSZXF1ZXN0Q29yZSB7XG5cdHJldHVybiB7XG5cdFx0aWQ6ICdQUl83Jyxcblx0XHRyZXBvc2l0b3J5SWQ6ICdSXzEnLFxuXHRcdHJlcG9zaXRvcnlOYW1lV2l0aE93bmVyLFxuXHRcdG51bWJlcjogNyxcblx0XHR0aXRsZTogJ1BSJyxcblx0XHR1cmw6ICdodHRwczovL2dpdGh1Yi5leGFtcGxlLnRlc3QvbmV3LW93bmVyL25ldy1yZXBvL3B1bGwvNycsXG5cdFx0c3RhdGU6ICdvcGVuJyxcblx0XHRkcmFmdDogZmFsc2UsXG5cdFx0aGVhZFNoYSxcblx0XHRoZWFkUmVmOiAnZmVhdHVyZScsXG5cdFx0YmFzZVNoYTogJ2Jhc2UnLFxuXHRcdGJhc2VSZWY6ICdtYWluJyxcblx0fTtcbn1cblxuaW50ZXJmYWNlIElRdWVyeUNhbGwge1xuXHRyZWFkb25seSBmcmFnbWVudDogUHVsbFJlcXVlc3RGcmFnbWVudDtcblx0cmVhZG9ubHkgcmVmOiBQdWxsUmVxdWVzdFJlZjtcblx0cmVhZG9ubHkgb3B0aW9uczogUHVsbFJlcXVlc3RTdWJzY3JpcHRpb25PcHRpb25zO1xuXHRyZWFkb25seSBzaWduYWw6IEFib3J0U2lnbmFsO1xufVxuXG5jbGFzcyBUZXN0UHVsbFJlcXVlc3RRdWVyeVNlcnZpY2UgaW1wbGVtZW50cyBJUHVsbFJlcXVlc3RRdWVyeSB7XG5cblx0cmVhZG9ubHkgY2FsbHM6IElRdWVyeUNhbGxbXSA9IFtdO1xuXHRyZWFkb25seSBoYW5kbGVycyA9IG5ldyBNYXA8UHVsbFJlcXVlc3RGcmFnbWVudCwgKGNhbGw6IElRdWVyeUNhbGwpID0+IFByb21pc2U8UHVsbFJlcXVlc3RGcmFnbWVudFJlc3VsdD4gfCBQdWxsUmVxdWVzdEZyYWdtZW50UmVzdWx0PigpO1xuXHRoZWFkU2hhID0gJ2hlYWQtMSc7XG5cblx0YXN5bmMgZmV0Y2goXG5cdFx0ZnJhZ21lbnQ6IFB1bGxSZXF1ZXN0RnJhZ21lbnQsXG5cdFx0cmVxdWVzdFJlZjogUHVsbFJlcXVlc3RSZWYsXG5cdFx0X2NvcmU6IFB1bGxSZXF1ZXN0Q29yZSB8IHVuZGVmaW5lZCxcblx0XHRvcHRpb25zOiBQdWxsUmVxdWVzdFN1YnNjcmlwdGlvbk9wdGlvbnMsXG5cdFx0X2NyZWRlbnRpYWw6IEdpdEh1YkNyZWRlbnRpYWwsXG5cdFx0c2lnbmFsOiBBYm9ydFNpZ25hbCxcblx0KTogUHJvbWlzZTxQdWxsUmVxdWVzdEZyYWdtZW50UmVzdWx0PiB7XG5cdFx0Y29uc3QgY2FsbCA9IHsgZnJhZ21lbnQsIHJlZjogcmVxdWVzdFJlZiwgb3B0aW9ucywgc2lnbmFsIH07XG5cdFx0dGhpcy5jYWxscy5wdXNoKGNhbGwpO1xuXHRcdGNvbnN0IGhhbmRsZXIgPSB0aGlzLmhhbmRsZXJzLmdldChmcmFnbWVudCk7XG5cdFx0aWYgKGhhbmRsZXIpIHtcblx0XHRcdHJldHVybiBoYW5kbGVyKGNhbGwpO1xuXHRcdH1cblx0XHRzd2l0Y2ggKGZyYWdtZW50KSB7XG5cdFx0XHRjYXNlICdjb3JlJzogcmV0dXJuIHsgZnJhZ21lbnQsIHZhbHVlOiBjb3JlKHRoaXMuaGVhZFNoYSksIGNvbXBsZXRlOiB0cnVlIH07XG5cdFx0XHRjYXNlICd0b3BMZXZlbENvbW1lbnRzJzogcmV0dXJuIHsgZnJhZ21lbnQsIHZhbHVlOiBbeyBpZDogJ0MxJywgYm9keTogb3B0aW9ucy5jb252ZXJzYXRpb24/LmluY2x1ZGVCb2RpZXMgPyAnYm9keScgOiB1bmRlZmluZWQgfV0sIGNvbXBsZXRlOiB0cnVlIH07XG5cdFx0XHRjYXNlICdzdWJtaXR0ZWRSZXZpZXdzJzogcmV0dXJuIHsgZnJhZ21lbnQsIHZhbHVlOiBbXSwgY29tcGxldGU6IHRydWUgfTtcblx0XHRcdGNhc2UgJ2lubGluZUNvbW1lbnRzJzogcmV0dXJuIHsgZnJhZ21lbnQsIHZhbHVlOiBbXSwgY29tcGxldGU6IHRydWUgfTtcblx0XHRcdGNhc2UgJ3Jldmlld1RocmVhZHMnOiByZXR1cm4geyBmcmFnbWVudCwgdmFsdWU6IFtdLCBjb21wbGV0ZTogdHJ1ZSwgaGVhZFNoYTogdGhpcy5oZWFkU2hhIH07XG5cdFx0XHRjYXNlICdjaGVja3MnOiByZXR1cm4ge1xuXHRcdFx0XHRmcmFnbWVudCxcblx0XHRcdFx0dmFsdWU6IHtcblx0XHRcdFx0XHRoZWFkU2hhOiB0aGlzLmhlYWRTaGEsXG5cdFx0XHRcdFx0cmVxdWlyZWRuZXNzQ29tcGxldGU6IHRydWUsXG5cdFx0XHRcdFx0ZXhwZWN0ZWRTdWl0ZXM6IFtdLFxuXHRcdFx0XHRcdGV4cGVjdGVkU3VpdGVzQ29tcGxldGU6IHRydWUsXG5cdFx0XHRcdFx0Y2hlY2tzOiBbeyBpZDogJ2NoZWNrJywgdHlwZTogJ2NoZWNrUnVuJywgbmFtZTogJ0NJJywgc3RhdHVzOiAnSU5fUFJPR1JFU1MnLCByZXF1aXJlZDogdHJ1ZSB9XSxcblx0XHRcdFx0fSxcblx0XHRcdFx0Y29tcGxldGU6IHRydWUsXG5cdFx0XHRcdGhlYWRTaGE6IHRoaXMuaGVhZFNoYSxcblx0XHRcdH07XG5cdFx0XHRjYXNlICdtZXJnZWFiaWxpdHknOiByZXR1cm4ge1xuXHRcdFx0XHRmcmFnbWVudCxcblx0XHRcdFx0dmFsdWU6IHtcblx0XHRcdFx0XHRoZWFkU2hhOiB0aGlzLmhlYWRTaGEsXG5cdFx0XHRcdFx0YmFzZVNoYTogJ2Jhc2UnLFxuXHRcdFx0XHRcdG1lcmdlYWJsZTogJ01FUkdFQUJMRScsXG5cdFx0XHRcdFx0dmlld2VyQ2FuVXBkYXRlOiB0cnVlLFxuXHRcdFx0XHRcdHZpZXdlckNhbk1lcmdlOiB0cnVlLFxuXHRcdFx0XHRcdHZpZXdlckNhbkVuYWJsZUF1dG9NZXJnZTogdHJ1ZSxcblx0XHRcdFx0XHRhbGxvd2VkTWVyZ2VNZXRob2RzOiBbJ1NRVUFTSCddLFxuXHRcdFx0XHRcdGF1dG9NZXJnZUVuYWJsZWQ6IGZhbHNlLFxuXHRcdFx0XHRcdG1lcmdlUXVldWVSZXF1aXJlZDogZmFsc2UsXG5cdFx0XHRcdFx0cXVldWVSZXF1aXJlbWVudEtub3duOiB0cnVlLFxuXHRcdFx0XHR9LFxuXHRcdFx0XHRjb21wbGV0ZTogdHJ1ZSxcblx0XHRcdFx0aGVhZFNoYTogdGhpcy5oZWFkU2hhLFxuXHRcdFx0fTtcblx0XHRcdGNhc2UgJ3BhcnRpY2lwYW50cyc6IHJldHVybiB7IGZyYWdtZW50LCB2YWx1ZTogeyBwYXJ0aWNpcGFudHM6IFtdIH0sIGNvbXBsZXRlOiB0cnVlIH07XG5cdFx0fVxuXHR9XG59XG5cbmNsYXNzIFRlc3RHaXRIdWJDcmVkZW50aWFsU2VydmljZSBpbXBsZW1lbnRzIElHaXRIdWJDcmVkZW50aWFscyB7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfb25EaWRJbnZhbGlkYXRlID0gbmV3IEVtaXR0ZXI8R2l0SHViQ3JlZGVudGlhbEludmFsaWRhdGlvbj4oKTtcblx0cmVhZG9ubHkgb25EaWRJbnZhbGlkYXRlID0gdGhpcy5fb25EaWRJbnZhbGlkYXRlLmV2ZW50O1xuXHRwcml2YXRlIHJlYWRvbmx5IF9jb250cm9sbGVyID0gbmV3IEFib3J0Q29udHJvbGxlcigpO1xuXHRyZWFkb25seSBjcmVkZW50aWFsOiBHaXRIdWJDcmVkZW50aWFsID0geyBhY2NvdW50LCB0b2tlbjogJ3Rva2VuJywgZ2VuZXJhdGlvbjogMSwgc2lnbmFsOiB0aGlzLl9jb250cm9sbGVyLnNpZ25hbCB9O1xuXG5cdGFzeW5jIGdldENyZWRlbnRpYWwoc2lnbmFsOiBBYm9ydFNpZ25hbCk6IFByb21pc2U8R2l0SHViQ3JlZGVudGlhbD4ge1xuXHRcdGlmIChzaWduYWwuYWJvcnRlZCkge1xuXHRcdFx0dGhyb3cgc2lnbmFsLnJlYXNvbjtcblx0XHR9XG5cdFx0cmV0dXJuIHRoaXMuY3JlZGVudGlhbDtcblx0fVxuXG5cdHJlc29sdmVDcmVkZW50aWFsKCk6IFByb21pc2U8R2l0SHViQ3JlZGVudGlhbD4ge1xuXHRcdHJldHVybiBQcm9taXNlLnJlc29sdmUodGhpcy5jcmVkZW50aWFsKTtcblx0fVxuXG5cdGhhbmRsZVJlcXVlc3RFcnJvcigpOiB2b2lkIHsgfVxuXG5cdGludmFsaWRhdGUocmVhc29uOiBHaXRIdWJDcmVkZW50aWFsSW52YWxpZGF0aW9uWydyZWFzb24nXSk6IHZvaWQge1xuXHRcdHRoaXMuX2NvbnRyb2xsZXIuYWJvcnQobmV3IEVycm9yKCdjcmVkZW50aWFsIGludmFsaWRhdGVkJykpO1xuXHRcdHRoaXMuX29uRGlkSW52YWxpZGF0ZS5maXJlKHsgY3JlZGVudGlhbDogdGhpcy5jcmVkZW50aWFsLCByZWFzb24gfSk7XG5cdH1cblxuXHRkaXNwb3NlKCk6IHZvaWQge1xuXHRcdHRoaXMuX29uRGlkSW52YWxpZGF0ZS5kaXNwb3NlKCk7XG5cdH1cbn1cblxuc3VpdGUoJ1B1bGxSZXF1ZXN0UmVzb3VyY2VTZXJ2aWNlJywgKCkgPT4ge1xuXHRjb25zdCBkaXNwb3NhYmxlcyA9IGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSgpO1xuXG5cdGZ1bmN0aW9uIHNldHVwKCk6IHtcblx0XHRyZWFkb25seSBjbG9jazogRmFrZUdpdEh1YlNjaGVkdWxlcjtcblx0XHRyZWFkb25seSBjcmVkZW50aWFsczogVGVzdEdpdEh1YkNyZWRlbnRpYWxTZXJ2aWNlO1xuXHRcdHJlYWRvbmx5IHF1ZXJpZXM6IFRlc3RQdWxsUmVxdWVzdFF1ZXJ5U2VydmljZTtcblx0XHRyZWFkb25seSBzZXJ2aWNlOiBQdWxsUmVxdWVzdFJlc291cmNlU2VydmljZTtcblx0fSB7XG5cdFx0Y29uc3QgY2xvY2sgPSBuZXcgRmFrZUdpdEh1YlNjaGVkdWxlcih7IG5vdzogMCB9KTtcblx0XHRjb25zdCBjcmVkZW50aWFscyA9IGRpc3Bvc2FibGVzLmFkZChuZXcgVGVzdEdpdEh1YkNyZWRlbnRpYWxTZXJ2aWNlKCkpO1xuXHRcdGNvbnN0IHF1ZXJpZXMgPSBuZXcgVGVzdFB1bGxSZXF1ZXN0UXVlcnlTZXJ2aWNlKCk7XG5cdFx0Y29uc3Qgc2VydmljZSA9IGRpc3Bvc2FibGVzLmFkZChuZXcgUHVsbFJlcXVlc3RSZXNvdXJjZVNlcnZpY2UoY2xvY2ssIHBvbGljeSwgY3JlZGVudGlhbHMsIHF1ZXJpZXMsIG5ldyBOdWxsTG9nU2VydmljZSgpKSk7XG5cdFx0cmV0dXJuIHsgY2xvY2ssIGNyZWRlbnRpYWxzLCBxdWVyaWVzLCBzZXJ2aWNlIH07XG5cdH1cblxuXHR0ZXN0KCdzaGFyZXMgcmVzb3VyY2VzIHdoaWxlIGtlZXBpbmcgZnJhZ21lbnQgcHJpb3JpdHkgYW5kIHBvbGxpbmcgaW5kZXBlbmRlbnQnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgeyBjbG9jaywgcXVlcmllcywgc2VydmljZSB9ID0gc2V0dXAoKTtcblx0XHRjb25zdCBjb21tZW50cyA9IHNlcnZpY2Uuc3Vic2NyaWJlUHVsbFJlcXVlc3QocmVmLCB7XG5cdFx0XHRwcmlvcml0eTogJ3Zpc2libGUnLFxuXHRcdFx0Y29udmVyc2F0aW9uOiB7IHRvcExldmVsQ29tbWVudHM6IHRydWUsIGluY2x1ZGVCb2RpZXM6IHRydWUgfSxcblx0XHR9KTtcblx0XHRhd2FpdCBjb21tZW50cy5yZWZyZXNoKCk7XG5cdFx0cXVlcmllcy5jYWxscy5sZW5ndGggPSAwO1xuXHRcdGNvbnN0IGNoZWNrcyA9IHNlcnZpY2Uuc3Vic2NyaWJlUHVsbFJlcXVlc3QoeyAuLi5yZWYsIG93bmVyOiAnT0xELU9XTkVSJywgcmVwbzogJ09MRC1SRVBPJyB9LCB7XG5cdFx0XHRwcmlvcml0eTogJ2JhY2tncm91bmQnLFxuXHRcdFx0Y2hlY2tzOiB7IHJlcXVpcmVkOiB0cnVlIH0sXG5cdFx0fSk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY29tbWVudHMucmVzb3VyY2UsIGNoZWNrcy5yZXNvdXJjZSk7XG5cdFx0YXdhaXQgY2hlY2tzLnJlZnJlc2goJ2NoZWNrcycpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocXVlcmllcy5jYWxscy5tYXAoY2FsbCA9PiBjYWxsLmZyYWdtZW50KSwgWydjaGVja3MnXSk7XG5cdFx0cXVlcmllcy5jYWxscy5sZW5ndGggPSAwO1xuXG5cdFx0Y29uc3QgY2Fub25pY2FsID0gc2VydmljZS5zdWJzY3JpYmVQdWxsUmVxdWVzdCh7IC4uLnJlZiwgb3duZXI6ICduZXctb3duZXInLCByZXBvOiAnbmV3LXJlcG8nIH0sIHsgcHJpb3JpdHk6ICdiYWNrZ3JvdW5kJyB9KTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY2Fub25pY2FsLnJlc291cmNlLCBjb21tZW50cy5yZXNvdXJjZSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRzbmFwc2hvdDogY29tbWVudHMucmVzb3VyY2Uuc25hcHNob3QuZ2V0KCksXG5cdFx0fSwge1xuXHRcdFx0c25hcHNob3Q6IHtcblx0XHRcdFx0cmVmOiB7IC4uLnJlZiwgb3duZXI6ICduZXctb3duZXInLCByZXBvOiAnbmV3LXJlcG8nIH0sXG5cdFx0XHRcdGdlbmVyYXRpb246IDIsXG5cdFx0XHRcdGhlYWRHZW5lcmF0aW9uOiAxLFxuXHRcdFx0XHRjb3JlOiB7XG5cdFx0XHRcdFx0dmFsdWU6IGNvcmUoJ2hlYWQtMScpLFxuXHRcdFx0XHRcdHN0YXR1czogJ3JlYWR5Jyxcblx0XHRcdFx0XHRjb21wbGV0ZTogdHJ1ZSxcblx0XHRcdFx0XHRvYnNlcnZlZEF0OiBuZXcgRGF0ZSgwKS50b0lTT1N0cmluZygpLFxuXHRcdFx0XHRcdGF0dGVtcHRlZEF0OiBuZXcgRGF0ZSgwKS50b0lTT1N0cmluZygpLFxuXHRcdFx0XHR9LFxuXHRcdFx0XHR0b3BMZXZlbENvbW1lbnRzOiB7XG5cdFx0XHRcdFx0dmFsdWU6IFt7IGlkOiAnQzEnLCBib2R5OiAnYm9keScgfV0sXG5cdFx0XHRcdFx0c3RhdHVzOiAncmVhZHknLFxuXHRcdFx0XHRcdGNvbXBsZXRlOiB0cnVlLFxuXHRcdFx0XHRcdG9ic2VydmVkQXQ6IG5ldyBEYXRlKDApLnRvSVNPU3RyaW5nKCksXG5cdFx0XHRcdFx0YXR0ZW1wdGVkQXQ6IG5ldyBEYXRlKDApLnRvSVNPU3RyaW5nKCksXG5cdFx0XHRcdFx0aGVhZFNoYTogdW5kZWZpbmVkLFxuXHRcdFx0XHR9LFxuXHRcdFx0XHRzdWJtaXR0ZWRSZXZpZXdzOiB7IHN0YXR1czogJ21pc3NpbmcnLCBjb21wbGV0ZTogZmFsc2UgfSxcblx0XHRcdFx0aW5saW5lQ29tbWVudHM6IHsgc3RhdHVzOiAnbWlzc2luZycsIGNvbXBsZXRlOiBmYWxzZSB9LFxuXHRcdFx0XHRyZXZpZXdUaHJlYWRzOiB7IHN0YXR1czogJ21pc3NpbmcnLCBjb21wbGV0ZTogZmFsc2UgfSxcblx0XHRcdFx0Y2hlY2tzOiB7XG5cdFx0XHRcdFx0dmFsdWU6IHtcblx0XHRcdFx0XHRcdGhlYWRTaGE6ICdoZWFkLTEnLFxuXHRcdFx0XHRcdFx0cmVxdWlyZWRuZXNzQ29tcGxldGU6IHRydWUsXG5cdFx0XHRcdFx0XHRleHBlY3RlZFN1aXRlczogW10sXG5cdFx0XHRcdFx0XHRleHBlY3RlZFN1aXRlc0NvbXBsZXRlOiB0cnVlLFxuXHRcdFx0XHRcdFx0Y2hlY2tzOiBbeyBpZDogJ2NoZWNrJywgdHlwZTogJ2NoZWNrUnVuJywgbmFtZTogJ0NJJywgc3RhdHVzOiAnSU5fUFJPR1JFU1MnLCByZXF1aXJlZDogdHJ1ZSB9XSxcblx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdHN0YXR1czogJ3JlYWR5Jyxcblx0XHRcdFx0XHRjb21wbGV0ZTogdHJ1ZSxcblx0XHRcdFx0XHRvYnNlcnZlZEF0OiBuZXcgRGF0ZSgwKS50b0lTT1N0cmluZygpLFxuXHRcdFx0XHRcdGF0dGVtcHRlZEF0OiBuZXcgRGF0ZSgwKS50b0lTT1N0cmluZygpLFxuXHRcdFx0XHRcdGhlYWRTaGE6ICdoZWFkLTEnLFxuXHRcdFx0XHR9LFxuXHRcdFx0XHRtZXJnZWFiaWxpdHk6IHsgc3RhdHVzOiAnbWlzc2luZycsIGNvbXBsZXRlOiBmYWxzZSB9LFxuXHRcdFx0XHRwYXJ0aWNpcGFudHM6IHsgc3RhdHVzOiAnbWlzc2luZycsIGNvbXBsZXRlOiBmYWxzZSB9LFxuXHRcdFx0fSxcblx0XHR9KTtcblxuXHRcdGNvbW1lbnRzLnVwZGF0ZSh7XG5cdFx0XHRwcmlvcml0eTogJ2JhY2tncm91bmQnLFxuXHRcdFx0Y29udmVyc2F0aW9uOiB7IHRvcExldmVsQ29tbWVudHM6IHRydWUsIGluY2x1ZGVCb2RpZXM6IGZhbHNlIH0sXG5cdFx0fSk7XG5cdFx0cXVlcmllcy5jYWxscy5sZW5ndGggPSAwO1xuXHRcdGNsb2NrLmFkdmFuY2VCeSgxMCk7XG5cdFx0YXdhaXQgZmx1c2hBc3luYygpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoY29tbWVudHMucmVzb3VyY2Uuc25hcHNob3QuZ2V0KCkudG9wTGV2ZWxDb21tZW50cy52YWx1ZSwgW3sgaWQ6ICdDMScgfV0pO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChxdWVyaWVzLmNhbGxzLmxlbmd0aCwgMCk7XG5cblx0XHRjaGVja3MuZGlzcG9zZSgpO1xuXHRcdHF1ZXJpZXMuY2FsbHMubGVuZ3RoID0gMDtcblx0XHRjbG9jay5hZHZhbmNlQnkoOTApO1xuXHRcdGF3YWl0IGZsdXNoQXN5bmMoKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHF1ZXJpZXMuY2FsbHMubWFwKGNhbGwgPT4gY2FsbC5mcmFnbWVudCksIFsndG9wTGV2ZWxDb21tZW50cyddKTtcblxuXHRcdGNvbW1lbnRzLmRpc3Bvc2UoKTtcblx0XHRjYW5vbmljYWwuZGlzcG9zZSgpO1xuXHRcdHF1ZXJpZXMuY2FsbHMubGVuZ3RoID0gMDtcblx0XHRjbG9jay5hZHZhbmNlQnkoMTBfMDAwKTtcblx0XHRhd2FpdCBmbHVzaEFzeW5jKCk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChxdWVyaWVzLmNhbGxzLCBbXSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3JldGFpbnMgZG9ybWFudCBpZGVudGl0eSBicmllZmx5LCB0aGVuIGV4cGlyZXMgaXQnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgeyBjbG9jaywgc2VydmljZSB9ID0gc2V0dXAoKTtcblx0XHRjb25zdCBmaXJzdCA9IHNlcnZpY2Uuc3Vic2NyaWJlUHVsbFJlcXVlc3QocmVmLCB7IHByaW9yaXR5OiAnYmFja2dyb3VuZCcgfSk7XG5cdFx0YXdhaXQgZmlyc3QucmVmcmVzaCgnY29yZScpO1xuXHRcdGNvbnN0IHJlc291cmNlID0gZmlyc3QucmVzb3VyY2U7XG5cdFx0Zmlyc3QuZGlzcG9zZSgpO1xuXG5cdFx0Y2xvY2suYWR2YW5jZUJ5KDE5KTtcblx0XHRjb25zdCByZXN1bWVkID0gc2VydmljZS5zdWJzY3JpYmVQdWxsUmVxdWVzdChyZWYsIHsgcHJpb3JpdHk6ICdiYWNrZ3JvdW5kJyB9KTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdW1lZC5yZXNvdXJjZSwgcmVzb3VyY2UpO1xuXHRcdHJlc3VtZWQuZGlzcG9zZSgpO1xuXG5cdFx0Y2xvY2suYWR2YW5jZUJ5KDIwKTtcblx0XHRjb25zdCByZXBsYWNlZCA9IHNlcnZpY2Uuc3Vic2NyaWJlUHVsbFJlcXVlc3QocmVmLCB7IHByaW9yaXR5OiAnYmFja2dyb3VuZCcgfSk7XG5cdFx0YXNzZXJ0Lm5vdFN0cmljdEVxdWFsKHJlcGxhY2VkLnJlc291cmNlLCByZXNvdXJjZSk7XG5cdFx0cmVwbGFjZWQuZGlzcG9zZSgpO1xuXHR9KTtcblxuXHR0ZXN0KCdjb252ZXJnZXMgY29sbGlkaW5nIGNhbm9uaWNhbCBhbGlhc2VzIG9udG8gc2hhcmVkIHN0YXRlIGFuZCBzY2hlZHVsaW5nJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHsgY2xvY2ssIHF1ZXJpZXMsIHNlcnZpY2UgfSA9IHNldHVwKCk7XG5cdFx0Y29uc3QgY2Fub25pY2FsID0gc2VydmljZS5zdWJzY3JpYmVQdWxsUmVxdWVzdCh7XG5cdFx0XHQuLi5yZWYsXG5cdFx0XHRvd25lcjogJ25ldy1vd25lcicsXG5cdFx0XHRyZXBvOiAnbmV3LXJlcG8nLFxuXHRcdH0sIHtcblx0XHRcdHByaW9yaXR5OiAndmlzaWJsZScsXG5cdFx0XHRjb252ZXJzYXRpb246IHsgdG9wTGV2ZWxDb21tZW50czogdHJ1ZSB9LFxuXHRcdH0pO1xuXHRcdGNvbnN0IHJlbmFtZWQgPSBzZXJ2aWNlLnN1YnNjcmliZVB1bGxSZXF1ZXN0KHJlZiwge1xuXHRcdFx0cHJpb3JpdHk6ICdiYWNrZ3JvdW5kJyxcblx0XHRcdGNoZWNrczogeyByZXF1aXJlZDogdHJ1ZSB9LFxuXHRcdH0pO1xuXHRcdGF3YWl0IHJlbmFtZWQucmVmcmVzaCgnY2hlY2tzJyk7XG5cdFx0YXdhaXQgY2Fub25pY2FsLnJlZnJlc2goJ3RvcExldmVsQ29tbWVudHMnKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0ZGlzdGluY3RSZXNvdXJjZXM6IGNhbm9uaWNhbC5yZXNvdXJjZSAhPT0gcmVuYW1lZC5yZXNvdXJjZSxcblx0XHRcdHNoYXJlZFNuYXBzaG90OiBjYW5vbmljYWwucmVzb3VyY2Uuc25hcHNob3QuZ2V0KCkgPT09IHJlbmFtZWQucmVzb3VyY2Uuc25hcHNob3QuZ2V0KCksXG5cdFx0XHRyZWY6IHJlbmFtZWQucmVzb3VyY2UucmVmLFxuXHRcdFx0Z2VuZXJhdGlvbjogcmVuYW1lZC5yZXNvdXJjZS5zbmFwc2hvdC5nZXQoKS5nZW5lcmF0aW9uLFxuXHRcdFx0ZnJhZ21lbnRzOiBxdWVyaWVzLmNhbGxzLm1hcChjYWxsID0+IGNhbGwuZnJhZ21lbnQpLFxuXHRcdFx0Y29tbWVudHM6IHJlbmFtZWQucmVzb3VyY2Uuc25hcHNob3QuZ2V0KCkudG9wTGV2ZWxDb21tZW50cy52YWx1ZSxcblx0XHRcdGNoZWNrczogY2Fub25pY2FsLnJlc291cmNlLnNuYXBzaG90LmdldCgpLmNoZWNrcy52YWx1ZT8uY2hlY2tzLFxuXHRcdH0sIHtcblx0XHRcdGRpc3RpbmN0UmVzb3VyY2VzOiB0cnVlLFxuXHRcdFx0c2hhcmVkU25hcHNob3Q6IHRydWUsXG5cdFx0XHRyZWY6IHsgLi4ucmVmLCBvd25lcjogJ25ldy1vd25lcicsIHJlcG86ICduZXctcmVwbycgfSxcblx0XHRcdGdlbmVyYXRpb246IDIsXG5cdFx0XHRmcmFnbWVudHM6IFsnY29yZScsICdjaGVja3MnLCAndG9wTGV2ZWxDb21tZW50cyddLFxuXHRcdFx0Y29tbWVudHM6IFt7IGlkOiAnQzEnLCBib2R5OiB1bmRlZmluZWQgfV0sXG5cdFx0XHRjaGVja3M6IFt7IGlkOiAnY2hlY2snLCB0eXBlOiAnY2hlY2tSdW4nLCBuYW1lOiAnQ0knLCBzdGF0dXM6ICdJTl9QUk9HUkVTUycsIHJlcXVpcmVkOiB0cnVlIH1dLFxuXHRcdH0pO1xuXHRcdGNhbm9uaWNhbC5kaXNwb3NlKCk7XG5cdFx0cmVuYW1lZC5kaXNwb3NlKCk7XG5cdFx0cXVlcmllcy5jYWxscy5sZW5ndGggPSAwO1xuXHRcdGNsb2NrLmFkdmFuY2VCeSgxMF8wMDApO1xuXHRcdGF3YWl0IGZsdXNoQXN5bmMoKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHF1ZXJpZXMuY2FsbHMsIFtdKTtcblx0fSk7XG5cblx0dGVzdCgnY29udGludWVzIGEgZnVsbCByZWZyZXNoIG9uIHRoZSBjYW5vbmljYWwgZW50cnkgYWZ0ZXIgbWVyZ2luZycsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCB7IHF1ZXJpZXMsIHNlcnZpY2UgfSA9IHNldHVwKCk7XG5cdFx0bGV0IGNvcmVDYWxsID0gMDtcblx0XHRxdWVyaWVzLmhhbmRsZXJzLnNldCgnY29yZScsICgpID0+ICh7XG5cdFx0XHRmcmFnbWVudDogJ2NvcmUnLFxuXHRcdFx0dmFsdWU6IGNvcmUoJ2hlYWQtMScsIGNvcmVDYWxsKysgPT09IDAgPyAnb2xkLW93bmVyL29sZC1yZXBvJyA6ICduZXctb3duZXIvbmV3LXJlcG8nKSxcblx0XHRcdGNvbXBsZXRlOiB0cnVlLFxuXHRcdH0pKTtcblx0XHRjb25zdCByZW5hbWVkID0gc2VydmljZS5zdWJzY3JpYmVQdWxsUmVxdWVzdChyZWYsIHtcblx0XHRcdHByaW9yaXR5OiAndmlzaWJsZScsXG5cdFx0XHRjb252ZXJzYXRpb246IHsgdG9wTGV2ZWxDb21tZW50czogdHJ1ZSB9LFxuXHRcdH0pO1xuXHRcdGF3YWl0IHJlbmFtZWQucmVmcmVzaCgpO1xuXHRcdGNvbnN0IGNhbm9uaWNhbCA9IHNlcnZpY2Uuc3Vic2NyaWJlUHVsbFJlcXVlc3Qoe1xuXHRcdFx0Li4ucmVmLFxuXHRcdFx0b3duZXI6ICduZXctb3duZXInLFxuXHRcdFx0cmVwbzogJ25ldy1yZXBvJyxcblx0XHR9LCB7IHByaW9yaXR5OiAnYmFja2dyb3VuZCcgfSk7XG5cdFx0cXVlcmllcy5jYWxscy5sZW5ndGggPSAwO1xuXG5cdFx0YXdhaXQgcmVuYW1lZC5yZWZyZXNoKCk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdGRpc3RpbmN0UmVzb3VyY2VzOiBjYW5vbmljYWwucmVzb3VyY2UgIT09IHJlbmFtZWQucmVzb3VyY2UsXG5cdFx0XHRzaGFyZWRTbmFwc2hvdDogY2Fub25pY2FsLnJlc291cmNlLnNuYXBzaG90LmdldCgpID09PSByZW5hbWVkLnJlc291cmNlLnNuYXBzaG90LmdldCgpLFxuXHRcdFx0Y2FsbHM6IHF1ZXJpZXMuY2FsbHMubWFwKGNhbGwgPT4gY2FsbC5mcmFnbWVudCksXG5cdFx0XHRjb21tZW50czogY2Fub25pY2FsLnJlc291cmNlLnNuYXBzaG90LmdldCgpLnRvcExldmVsQ29tbWVudHMsXG5cdFx0fSwge1xuXHRcdFx0ZGlzdGluY3RSZXNvdXJjZXM6IHRydWUsXG5cdFx0XHRzaGFyZWRTbmFwc2hvdDogdHJ1ZSxcblx0XHRcdGNhbGxzOiBbJ2NvcmUnLCAndG9wTGV2ZWxDb21tZW50cyddLFxuXHRcdFx0Y29tbWVudHM6IHtcblx0XHRcdFx0dmFsdWU6IFt7IGlkOiAnQzEnLCBib2R5OiB1bmRlZmluZWQgfV0sXG5cdFx0XHRcdHN0YXR1czogJ3JlYWR5Jyxcblx0XHRcdFx0Y29tcGxldGU6IHRydWUsXG5cdFx0XHRcdG9ic2VydmVkQXQ6IG5ldyBEYXRlKDApLnRvSVNPU3RyaW5nKCksXG5cdFx0XHRcdGF0dGVtcHRlZEF0OiBuZXcgRGF0ZSgwKS50b0lTT1N0cmluZygpLFxuXHRcdFx0XHRoZWFkU2hhOiB1bmRlZmluZWQsXG5cdFx0XHR9LFxuXHRcdH0pO1xuXHRcdGNhbm9uaWNhbC5kaXNwb3NlKCk7XG5cdFx0cmVuYW1lZC5kaXNwb3NlKCk7XG5cdH0pO1xuXG5cdHRlc3QoJ2RldGFjaGVzIG9uZSBjYW5jZWxsZWQgcmVmcmVzaCB3YWl0ZXIgd2l0aG91dCBjYW5jZWxsaW5nIHNoYXJlZCB3b3JrJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHsgcXVlcmllcywgc2VydmljZSB9ID0gc2V0dXAoKTtcblx0XHRjb25zdCByZWxlYXNlID0gbmV3IERlZmVycmVkUHJvbWlzZTx2b2lkPigpO1xuXHRcdGNvbnN0IHN0YXJ0ZWQgPSBuZXcgRGVmZXJyZWRQcm9taXNlPHZvaWQ+KCk7XG5cdFx0cXVlcmllcy5oYW5kbGVycy5zZXQoJ2NvcmUnLCBhc3luYyBjYWxsID0+IHtcblx0XHRcdGF3YWl0IHN0YXJ0ZWQuY29tcGxldGUoKTtcblx0XHRcdGF3YWl0IHJlbGVhc2UucDtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChjYWxsLnNpZ25hbC5hYm9ydGVkLCBmYWxzZSk7XG5cdFx0XHRyZXR1cm4geyBmcmFnbWVudDogJ2NvcmUnLCB2YWx1ZTogY29yZSgnaGVhZC0xJyksIGNvbXBsZXRlOiB0cnVlIH07XG5cdFx0fSk7XG5cdFx0Y29uc3QgZmlyc3QgPSBzZXJ2aWNlLnN1YnNjcmliZVB1bGxSZXF1ZXN0KHJlZiwgeyBwcmlvcml0eTogJ2ludGVyYWN0aXZlJyB9KTtcblx0XHRjb25zdCBzZWNvbmQgPSBzZXJ2aWNlLnN1YnNjcmliZVB1bGxSZXF1ZXN0KHJlZiwgeyBwcmlvcml0eTogJ2ludGVyYWN0aXZlJyB9KTtcblx0XHRjb25zdCBjYW5jZWxsYXRpb24gPSBkaXNwb3NhYmxlcy5hZGQobmV3IENhbmNlbGxhdGlvblRva2VuU291cmNlKCkpO1xuXG5cdFx0Y29uc3QgY2FuY2VsbGVkID0gZmlyc3QucmVmcmVzaCgnY29yZScsIGNhbmNlbGxhdGlvbi50b2tlbik7XG5cdFx0Y29uc3Qgc2hhcmVkID0gc2Vjb25kLnJlZnJlc2goJ2NvcmUnKTtcblx0XHRhd2FpdCBzdGFydGVkLnA7XG5cdFx0Y2FuY2VsbGF0aW9uLmNhbmNlbCgpO1xuXHRcdGF3YWl0IGFzc2VydC5yZWplY3RzKCgpID0+IGNhbmNlbGxlZCk7XG5cdFx0YXdhaXQgcmVsZWFzZS5jb21wbGV0ZSgpO1xuXHRcdGF3YWl0IHNoYXJlZDtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0Y2FsbENvdW50OiBxdWVyaWVzLmNhbGxzLmxlbmd0aCxcblx0XHRcdHN0YXR1czogZmlyc3QucmVzb3VyY2Uuc25hcHNob3QuZ2V0KCkuY29yZS5zdGF0dXMsXG5cdFx0fSwge1xuXHRcdFx0Y2FsbENvdW50OiAxLFxuXHRcdFx0c3RhdHVzOiAncmVhZHknLFxuXHRcdH0pO1xuXHRcdGZpcnN0LmRpc3Bvc2UoKTtcblx0XHRzZWNvbmQuZGlzcG9zZSgpO1xuXHR9KTtcblxuXHR0ZXN0KCdhdXRob3JpdGF0aXZlIHJlZnJlc2ggYW5kIHR5cGVkIGludmFsaWRhdGlvbiBzdXBlcnNlZGUgb2xkZXIgd29yaycsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCB7IGNsb2NrLCBxdWVyaWVzLCBzZXJ2aWNlIH0gPSBzZXR1cCgpO1xuXHRcdGNvbnN0IHN1YnNjcmlwdGlvbiA9IHNlcnZpY2Uuc3Vic2NyaWJlUHVsbFJlcXVlc3QocmVmLCB7XG5cdFx0XHRwcmlvcml0eTogJ2ludGVyYWN0aXZlJyxcblx0XHRcdGNoZWNrczogeyByZXF1aXJlZDogdHJ1ZSB9LFxuXHRcdH0pO1xuXHRcdGF3YWl0IHN1YnNjcmlwdGlvbi5yZWZyZXNoKCdjb3JlJyk7XG5cdFx0YXdhaXQgc3Vic2NyaXB0aW9uLnJlZnJlc2goJ2NoZWNrcycpO1xuXG5cdFx0Y29uc3QgYXV0aG9yaXRhdGl2ZVN0YXJ0ZWQgPSBuZXcgRGVmZXJyZWRQcm9taXNlPHZvaWQ+KCk7XG5cdFx0Y29uc3QgcmVsZWFzZUF1dGhvcml0YXRpdmVPbGQgPSBuZXcgRGVmZXJyZWRQcm9taXNlPHZvaWQ+KCk7XG5cdFx0bGV0IGF1dGhvcml0YXRpdmVDYWxsID0gMDtcblx0XHRsZXQgYXV0aG9yaXRhdGl2ZU9sZFNpZ25hbDogQWJvcnRTaWduYWwgfCB1bmRlZmluZWQ7XG5cdFx0cXVlcmllcy5oYW5kbGVycy5zZXQoJ2NoZWNrcycsIGFzeW5jIGNhbGwgPT4ge1xuXHRcdFx0YXV0aG9yaXRhdGl2ZUNhbGwrKztcblx0XHRcdGlmIChhdXRob3JpdGF0aXZlQ2FsbCA9PT0gMSkge1xuXHRcdFx0XHRhdXRob3JpdGF0aXZlT2xkU2lnbmFsID0gY2FsbC5zaWduYWw7XG5cdFx0XHRcdGF3YWl0IGF1dGhvcml0YXRpdmVTdGFydGVkLmNvbXBsZXRlKCk7XG5cdFx0XHRcdGF3YWl0IHJlbGVhc2VBdXRob3JpdGF0aXZlT2xkLnA7XG5cdFx0XHRcdHJldHVybiBjaGVja3NSZXN1bHQoJ29sZCcpO1xuXHRcdFx0fVxuXHRcdFx0cmV0dXJuIGNoZWNrc1Jlc3VsdCgnYXV0aG9yaXRhdGl2ZScpO1xuXHRcdH0pO1xuXHRcdGNvbnN0IG9sZFJlZnJlc2ggPSBzdWJzY3JpcHRpb24ucmVmcmVzaCgnY2hlY2tzJyk7XG5cdFx0YXdhaXQgYXV0aG9yaXRhdGl2ZVN0YXJ0ZWQucDtcblx0XHRjb25zdCBhdXRob3JpdGF0aXZlID0gc3Vic2NyaXB0aW9uLnJlZnJlc2goJ2NoZWNrcycsIENhbmNlbGxhdGlvblRva2VuLk5vbmUsIHsgYXV0aG9yaXRhdGl2ZTogdHJ1ZSB9KTtcblx0XHRhd2FpdCBhdXRob3JpdGF0aXZlO1xuXHRcdGF3YWl0IHJlbGVhc2VBdXRob3JpdGF0aXZlT2xkLmNvbXBsZXRlKCk7XG5cdFx0YXdhaXQgb2xkUmVmcmVzaDtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0b2xkQWJvcnRlZDogYXV0aG9yaXRhdGl2ZU9sZFNpZ25hbD8uYWJvcnRlZCxcblx0XHRcdGNoZWNrSWQ6IHN1YnNjcmlwdGlvbi5yZXNvdXJjZS5zbmFwc2hvdC5nZXQoKS5jaGVja3MudmFsdWU/LmNoZWNrc1swXT8uaWQsXG5cdFx0XHRjYWxsQ291bnQ6IGF1dGhvcml0YXRpdmVDYWxsLFxuXHRcdH0sIHtcblx0XHRcdG9sZEFib3J0ZWQ6IHRydWUsXG5cdFx0XHRjaGVja0lkOiAnYXV0aG9yaXRhdGl2ZScsXG5cdFx0XHRjYWxsQ291bnQ6IDIsXG5cdFx0fSk7XG5cblx0XHRjb25zdCBpbnZhbGlkYXRpb25TdGFydGVkID0gbmV3IERlZmVycmVkUHJvbWlzZTx2b2lkPigpO1xuXHRcdGNvbnN0IHJlbGVhc2VJbnZhbGlkYXRpb25PbGQgPSBuZXcgRGVmZXJyZWRQcm9taXNlPHZvaWQ+KCk7XG5cdFx0bGV0IGludmFsaWRhdGlvbkNhbGwgPSAwO1xuXHRcdGxldCBpbnZhbGlkYXRpb25PbGRTaWduYWw6IEFib3J0U2lnbmFsIHwgdW5kZWZpbmVkO1xuXHRcdHF1ZXJpZXMuaGFuZGxlcnMuc2V0KCdjaGVja3MnLCBhc3luYyBjYWxsID0+IHtcblx0XHRcdGludmFsaWRhdGlvbkNhbGwrKztcblx0XHRcdGlmIChpbnZhbGlkYXRpb25DYWxsID09PSAxKSB7XG5cdFx0XHRcdGludmFsaWRhdGlvbk9sZFNpZ25hbCA9IGNhbGwuc2lnbmFsO1xuXHRcdFx0XHRhd2FpdCBpbnZhbGlkYXRpb25TdGFydGVkLmNvbXBsZXRlKCk7XG5cdFx0XHRcdGF3YWl0IHJlbGVhc2VJbnZhbGlkYXRpb25PbGQucDtcblx0XHRcdFx0cmV0dXJuIGNoZWNrc1Jlc3VsdCgnc3RhbGUnKTtcblx0XHRcdH1cblx0XHRcdHJldHVybiBjaGVja3NSZXN1bHQoJ2ZyZXNoJyk7XG5cdFx0fSk7XG5cdFx0Y29uc3QgaW52YWxpZGF0ZWRSZWZyZXNoID0gc3Vic2NyaXB0aW9uLnJlZnJlc2goJ2NoZWNrcycpO1xuXHRcdGF3YWl0IGludmFsaWRhdGlvblN0YXJ0ZWQucDtcblx0XHRzZXJ2aWNlLmludmFsaWRhdGVQdWxsUmVxdWVzdChyZWYsIFsnY2hlY2tzJ10pO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0b2xkQWJvcnRlZDogaW52YWxpZGF0aW9uT2xkU2lnbmFsPy5hYm9ydGVkLFxuXHRcdFx0c3RhdHVzOiBzdWJzY3JpcHRpb24ucmVzb3VyY2Uuc25hcHNob3QuZ2V0KCkuY2hlY2tzLnN0YXR1cyxcblx0XHRcdGNvbXBsZXRlOiBzdWJzY3JpcHRpb24ucmVzb3VyY2Uuc25hcHNob3QuZ2V0KCkuY2hlY2tzLmNvbXBsZXRlLFxuXHRcdH0sIHtcblx0XHRcdG9sZEFib3J0ZWQ6IHRydWUsXG5cdFx0XHRzdGF0dXM6ICdzdGFsZScsXG5cdFx0XHRjb21wbGV0ZTogZmFsc2UsXG5cdFx0fSk7XG5cdFx0Y2xvY2suZmx1c2hEdWUoKTtcblx0XHRhd2FpdCBmbHVzaEFzeW5jKCk7XG5cdFx0YXdhaXQgcmVsZWFzZUludmFsaWRhdGlvbk9sZC5jb21wbGV0ZSgpO1xuXHRcdGF3YWl0IGludmFsaWRhdGVkUmVmcmVzaDtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0Y2hlY2tJZDogc3Vic2NyaXB0aW9uLnJlc291cmNlLnNuYXBzaG90LmdldCgpLmNoZWNrcy52YWx1ZT8uY2hlY2tzWzBdPy5pZCxcblx0XHRcdGNhbGxDb3VudDogaW52YWxpZGF0aW9uQ2FsbCxcblx0XHR9LCB7XG5cdFx0XHRjaGVja0lkOiAnZnJlc2gnLFxuXHRcdFx0Y2FsbENvdW50OiAyLFxuXHRcdH0pO1xuXG5cdFx0c3Vic2NyaXB0aW9uLnVwZGF0ZSh7IHByaW9yaXR5OiAnYmFja2dyb3VuZCcgfSk7XG5cdFx0cXVlcmllcy5jYWxscy5sZW5ndGggPSAwO1xuXHRcdHNlcnZpY2UuaW52YWxpZGF0ZVB1bGxSZXF1ZXN0KHJlZiwgWydjaGVja3MnXSk7XG5cdFx0Y2xvY2suZmx1c2hEdWUoKTtcblx0XHRhd2FpdCBmbHVzaEFzeW5jKCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHF1ZXJpZXMuY2FsbHMubGVuZ3RoLCAwKTtcblx0XHRzdWJzY3JpcHRpb24uZGlzcG9zZSgpO1xuXHR9KTtcblxuXHR0ZXN0KCdzdXBlcnNlZGVzIGluLWZsaWdodCB3b3JrIHdoZW4gYSBzdWJzY3JpYmVyIGV4cGFuZHMgdGhlIGRhdGEgc2hhcGUnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgeyBxdWVyaWVzLCBzZXJ2aWNlIH0gPSBzZXR1cCgpO1xuXHRcdGNvbnN0IGZpcnN0U3RhcnRlZCA9IG5ldyBEZWZlcnJlZFByb21pc2U8dm9pZD4oKTtcblx0XHRjb25zdCByZWxlYXNlRmlyc3QgPSBuZXcgRGVmZXJyZWRQcm9taXNlPHZvaWQ+KCk7XG5cdFx0bGV0IGNhbGwgPSAwO1xuXHRcdHF1ZXJpZXMuaGFuZGxlcnMuc2V0KCd0b3BMZXZlbENvbW1lbnRzJywgYXN5bmMgcXVlcnlDYWxsID0+IHtcblx0XHRcdGNhbGwrKztcblx0XHRcdGlmIChjYWxsID09PSAxKSB7XG5cdFx0XHRcdGF3YWl0IGZpcnN0U3RhcnRlZC5jb21wbGV0ZSgpO1xuXHRcdFx0XHRhd2FpdCByZWxlYXNlRmlyc3QucDtcblx0XHRcdH1cblx0XHRcdHJldHVybiB7XG5cdFx0XHRcdGZyYWdtZW50OiAndG9wTGV2ZWxDb21tZW50cycsXG5cdFx0XHRcdHZhbHVlOiBbeyBpZDogYEMke2NhbGx9YCwgYm9keTogcXVlcnlDYWxsLm9wdGlvbnMuY29udmVyc2F0aW9uPy5pbmNsdWRlQm9kaWVzID8gJ2JvZHknIDogdW5kZWZpbmVkIH1dLFxuXHRcdFx0XHRjb21wbGV0ZTogdHJ1ZSxcblx0XHRcdH07XG5cdFx0fSk7XG5cdFx0Y29uc3QgdG9wb2xvZ3kgPSBzZXJ2aWNlLnN1YnNjcmliZVB1bGxSZXF1ZXN0KHJlZiwge1xuXHRcdFx0cHJpb3JpdHk6ICdiYWNrZ3JvdW5kJyxcblx0XHRcdGNvbnZlcnNhdGlvbjogeyB0b3BMZXZlbENvbW1lbnRzOiB0cnVlIH0sXG5cdFx0fSk7XG5cdFx0YXdhaXQgdG9wb2xvZ3kucmVmcmVzaCgnY29yZScpO1xuXHRcdGNvbnN0IGZpcnN0ID0gdG9wb2xvZ3kucmVmcmVzaCgndG9wTGV2ZWxDb21tZW50cycpO1xuXHRcdGF3YWl0IGZpcnN0U3RhcnRlZC5wO1xuXG5cdFx0Y29uc3QgYm9kaWVzID0gc2VydmljZS5zdWJzY3JpYmVQdWxsUmVxdWVzdChyZWYsIHtcblx0XHRcdHByaW9yaXR5OiAndmlzaWJsZScsXG5cdFx0XHRjb252ZXJzYXRpb246IHsgdG9wTGV2ZWxDb21tZW50czogdHJ1ZSwgaW5jbHVkZUJvZGllczogdHJ1ZSB9LFxuXHRcdH0pO1xuXHRcdGF3YWl0IGJvZGllcy5yZWZyZXNoKCd0b3BMZXZlbENvbW1lbnRzJyk7XG5cdFx0YXdhaXQgcmVsZWFzZUZpcnN0LmNvbXBsZXRlKCk7XG5cdFx0YXdhaXQgZmlyc3Q7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdGNhbGxDb3VudDogY2FsbCxcblx0XHRcdGNvbW1lbnRzOiBib2RpZXMucmVzb3VyY2Uuc25hcHNob3QuZ2V0KCkudG9wTGV2ZWxDb21tZW50cy52YWx1ZSxcblx0XHR9LCB7XG5cdFx0XHRjYWxsQ291bnQ6IDIsXG5cdFx0XHRjb21tZW50czogW3sgaWQ6ICdDMicsIGJvZHk6ICdib2R5JyB9XSxcblx0XHR9KTtcblx0XHR0b3BvbG9neS5kaXNwb3NlKCk7XG5cdFx0Ym9kaWVzLmRpc3Bvc2UoKTtcblx0fSk7XG5cblx0dGVzdCgncmV0cmllcyB0cmFuc2llbnQgZmFpbHVyZXMgd2l0aCBib3VuZGVkIHNjaGVkdWxlZCBiYWNrb2ZmJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHsgY2xvY2ssIHF1ZXJpZXMsIHNlcnZpY2UgfSA9IHNldHVwKCk7XG5cdFx0bGV0IGNvbW1lbnRzQ2FsbCA9IDA7XG5cdFx0cXVlcmllcy5oYW5kbGVycy5zZXQoJ3RvcExldmVsQ29tbWVudHMnLCAoKSA9PiB7XG5cdFx0XHRjb21tZW50c0NhbGwrKztcblx0XHRcdGlmIChjb21tZW50c0NhbGwgPT09IDEpIHtcblx0XHRcdFx0dGhyb3cgbmV3IEdpdEh1YlJlcXVlc3RFcnJvcigndGVtcG9yYXJ5JywgJ3NlcnZlcicsIDUwMik7XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm4geyBmcmFnbWVudDogJ3RvcExldmVsQ29tbWVudHMnLCB2YWx1ZTogW3sgaWQ6ICdDMScgfV0sIGNvbXBsZXRlOiB0cnVlIH07XG5cdFx0fSk7XG5cdFx0Y29uc3Qgc3Vic2NyaXB0aW9uID0gc2VydmljZS5zdWJzY3JpYmVQdWxsUmVxdWVzdChyZWYsIHtcblx0XHRcdHByaW9yaXR5OiAndmlzaWJsZScsXG5cdFx0XHRjb252ZXJzYXRpb246IHsgdG9wTGV2ZWxDb21tZW50czogdHJ1ZSB9LFxuXHRcdH0pO1xuXHRcdGF3YWl0IHN1YnNjcmlwdGlvbi5yZWZyZXNoKCdjb3JlJyk7XG5cdFx0YXdhaXQgYXNzZXJ0LnJlamVjdHMoKCkgPT4gc3Vic2NyaXB0aW9uLnJlZnJlc2goJ3RvcExldmVsQ29tbWVudHMnKSwgL3RlbXBvcmFyeS8pO1xuXG5cdFx0Y2xvY2suYWR2YW5jZUJ5KDQpO1xuXHRcdGF3YWl0IGZsdXNoQXN5bmMoKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY29tbWVudHNDYWxsLCAxKTtcblx0XHRjbG9jay5hZHZhbmNlQnkoMSk7XG5cdFx0YXdhaXQgZmx1c2hBc3luYygpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRjb21tZW50c0NhbGwsXG5cdFx0XHRzdGF0ZTogc3Vic2NyaXB0aW9uLnJlc291cmNlLnNuYXBzaG90LmdldCgpLnRvcExldmVsQ29tbWVudHMsXG5cdFx0fSwge1xuXHRcdFx0Y29tbWVudHNDYWxsOiAyLFxuXHRcdFx0c3RhdGU6IHtcblx0XHRcdFx0dmFsdWU6IFt7IGlkOiAnQzEnIH1dLFxuXHRcdFx0XHRzdGF0dXM6ICdyZWFkeScsXG5cdFx0XHRcdGNvbXBsZXRlOiB0cnVlLFxuXHRcdFx0XHRvYnNlcnZlZEF0OiBuZXcgRGF0ZSg1KS50b0lTT1N0cmluZygpLFxuXHRcdFx0XHRhdHRlbXB0ZWRBdDogbmV3IERhdGUoNSkudG9JU09TdHJpbmcoKSxcblx0XHRcdFx0aGVhZFNoYTogdW5kZWZpbmVkLFxuXHRcdFx0fSxcblx0XHR9KTtcblx0XHRzdWJzY3JpcHRpb24uZGlzcG9zZSgpO1xuXHR9KTtcblxuXHR0ZXN0KCdyZWplY3RzIG9sZC1oZWFkIGFuZCBpbnZhbGlkYXRlZCBjcmVkZW50aWFsIHJlc3VsdHMnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgeyBjcmVkZW50aWFscywgcXVlcmllcywgc2VydmljZSB9ID0gc2V0dXAoKTtcblx0XHRsZXQgY29yZUNhbGwgPSAwO1xuXHRcdHF1ZXJpZXMuaGFuZGxlcnMuc2V0KCdjb3JlJywgKCkgPT4ge1xuXHRcdFx0Y29yZUNhbGwrKztcblx0XHRcdHJldHVybiB7IGZyYWdtZW50OiAnY29yZScsIHZhbHVlOiBjb3JlKGNvcmVDYWxsID09PSAxID8gJ2hlYWQtMScgOiAnaGVhZC0yJyksIGNvbXBsZXRlOiB0cnVlIH07XG5cdFx0fSk7XG5cdFx0Y29uc3QgY2hlY2tzU3RhcnRlZCA9IG5ldyBEZWZlcnJlZFByb21pc2U8dm9pZD4oKTtcblx0XHRjb25zdCByZWxlYXNlQ2hlY2tzID0gbmV3IERlZmVycmVkUHJvbWlzZTx2b2lkPigpO1xuXHRcdGxldCBjaGVja3NDYWxsID0gMDtcblx0XHRxdWVyaWVzLmhhbmRsZXJzLnNldCgnY2hlY2tzJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y2hlY2tzQ2FsbCsrO1xuXHRcdFx0aWYgKGNoZWNrc0NhbGwgPT09IDEpIHtcblx0XHRcdFx0YXdhaXQgY2hlY2tzU3RhcnRlZC5jb21wbGV0ZSgpO1xuXHRcdFx0XHRhd2FpdCByZWxlYXNlQ2hlY2tzLnA7XG5cdFx0XHRcdHJldHVybiB7XG5cdFx0XHRcdFx0ZnJhZ21lbnQ6ICdjaGVja3MnLFxuXHRcdFx0XHRcdHZhbHVlOiB7IGhlYWRTaGE6ICdoZWFkLTEnLCBjaGVja3M6IFtdLCByZXF1aXJlZG5lc3NDb21wbGV0ZTogdHJ1ZSwgZXhwZWN0ZWRTdWl0ZXM6IFtdLCBleHBlY3RlZFN1aXRlc0NvbXBsZXRlOiB0cnVlIH0sXG5cdFx0XHRcdFx0Y29tcGxldGU6IHRydWUsXG5cdFx0XHRcdFx0aGVhZFNoYTogJ2hlYWQtMScsXG5cdFx0XHRcdH07XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRmcmFnbWVudDogJ2NoZWNrcycsXG5cdFx0XHRcdHZhbHVlOiB7IGhlYWRTaGE6ICdoZWFkLTInLCBjaGVja3M6IFtdLCByZXF1aXJlZG5lc3NDb21wbGV0ZTogdHJ1ZSwgZXhwZWN0ZWRTdWl0ZXM6IFtdLCBleHBlY3RlZFN1aXRlc0NvbXBsZXRlOiB0cnVlIH0sXG5cdFx0XHRcdGNvbXBsZXRlOiB0cnVlLFxuXHRcdFx0XHRoZWFkU2hhOiAnaGVhZC0yJyxcblx0XHRcdH07XG5cdFx0fSk7XG5cdFx0Y29uc3Qgc3Vic2NyaXB0aW9uID0gc2VydmljZS5zdWJzY3JpYmVQdWxsUmVxdWVzdChyZWYsIHsgcHJpb3JpdHk6ICdpbnRlcmFjdGl2ZScsIGNoZWNrczogeyByZXF1aXJlZDogdHJ1ZSB9IH0pO1xuXHRcdGF3YWl0IHN1YnNjcmlwdGlvbi5yZWZyZXNoKCdjb3JlJyk7XG5cdFx0Y29uc3Qgb2xkQ2hlY2tzID0gc3Vic2NyaXB0aW9uLnJlZnJlc2goJ2NoZWNrcycpO1xuXHRcdGF3YWl0IGNoZWNrc1N0YXJ0ZWQucDtcblx0XHRxdWVyaWVzLmhlYWRTaGEgPSAnaGVhZC0yJztcblx0XHRhd2FpdCBzdWJzY3JpcHRpb24ucmVmcmVzaCgnY29yZScpO1xuXHRcdGF3YWl0IHJlbGVhc2VDaGVja3MuY29tcGxldGUoKTtcblx0XHRhd2FpdCBvbGRDaGVja3M7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdHN0YXR1czogc3Vic2NyaXB0aW9uLnJlc291cmNlLnNuYXBzaG90LmdldCgpLmNoZWNrcy5zdGF0dXMsXG5cdFx0XHRjb21wbGV0ZTogc3Vic2NyaXB0aW9uLnJlc291cmNlLnNuYXBzaG90LmdldCgpLmNoZWNrcy5jb21wbGV0ZSxcblx0XHR9LCB7XG5cdFx0XHRzdGF0dXM6ICdtaXNzaW5nJyxcblx0XHRcdGNvbXBsZXRlOiBmYWxzZSxcblx0XHR9KTtcblx0XHRhd2FpdCBzdWJzY3JpcHRpb24ucmVmcmVzaCgnY2hlY2tzJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHN1YnNjcmlwdGlvbi5yZXNvdXJjZS5zbmFwc2hvdC5nZXQoKS5jaGVja3MuaGVhZFNoYSwgJ2hlYWQtMicpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0Z2VuZXJhdGlvbjogc3Vic2NyaXB0aW9uLnJlc291cmNlLnNuYXBzaG90LmdldCgpLmdlbmVyYXRpb24sXG5cdFx0XHRoZWFkR2VuZXJhdGlvbjogc3Vic2NyaXB0aW9uLnJlc291cmNlLnNuYXBzaG90LmdldCgpLmhlYWRHZW5lcmF0aW9uLFxuXHRcdH0sIHtcblx0XHRcdGdlbmVyYXRpb246IDIsXG5cdFx0XHRoZWFkR2VuZXJhdGlvbjogMixcblx0XHR9KTtcblxuXHRcdGNvbnN0IG9sZFJlc291cmNlID0gc3Vic2NyaXB0aW9uLnJlc291cmNlO1xuXHRcdGNyZWRlbnRpYWxzLmludmFsaWRhdGUoJ2FjY291bnQnKTtcblx0XHRhd2FpdCBhc3NlcnQucmVqZWN0cygoKSA9PiBzdWJzY3JpcHRpb24ucmVmcmVzaCgnY29yZScpLCAvbm8gbG9uZ2VyIGFjdGl2ZS8pO1xuXHRcdGNvbnN0IHJlcGxhY2VtZW50ID0gc2VydmljZS5zdWJzY3JpYmVQdWxsUmVxdWVzdChyZWYsIHsgcHJpb3JpdHk6ICdpbnRlcmFjdGl2ZScgfSk7XG5cdFx0YXNzZXJ0Lm5vdFN0cmljdEVxdWFsKHJlcGxhY2VtZW50LnJlc291cmNlLCBvbGRSZXNvdXJjZSk7XG5cdFx0cmVwbGFjZW1lbnQuZGlzcG9zZSgpO1xuXHRcdHN1YnNjcmlwdGlvbi5kaXNwb3NlKCk7XG5cdH0pO1xuXG5cdHRlc3QoJ3JlamVjdHMgcmV2aWV3IHRocmVhZCByZXN1bHRzIGFmdGVyIHRoZSBjb3JlIGhlYWQgY2hhbmdlcycsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCB7IHF1ZXJpZXMsIHNlcnZpY2UgfSA9IHNldHVwKCk7XG5cdFx0Y29uc3QgdGhyZWFkc1N0YXJ0ZWQgPSBuZXcgRGVmZXJyZWRQcm9taXNlPHZvaWQ+KCk7XG5cdFx0Y29uc3QgcmVsZWFzZVRocmVhZHMgPSBuZXcgRGVmZXJyZWRQcm9taXNlPHZvaWQ+KCk7XG5cdFx0bGV0IHRocmVhZHNDYWxsID0gMDtcblx0XHRxdWVyaWVzLmhhbmRsZXJzLnNldCgncmV2aWV3VGhyZWFkcycsIGFzeW5jICgpID0+IHtcblx0XHRcdHRocmVhZHNDYWxsKys7XG5cdFx0XHRpZiAodGhyZWFkc0NhbGwgPT09IDEpIHtcblx0XHRcdFx0YXdhaXQgdGhyZWFkc1N0YXJ0ZWQuY29tcGxldGUoKTtcblx0XHRcdFx0YXdhaXQgcmVsZWFzZVRocmVhZHMucDtcblx0XHRcdFx0cmV0dXJuIHsgZnJhZ21lbnQ6ICdyZXZpZXdUaHJlYWRzJywgdmFsdWU6IFtdLCBjb21wbGV0ZTogdHJ1ZSwgaGVhZFNoYTogJ2hlYWQtMScgfTtcblx0XHRcdH1cblx0XHRcdHJldHVybiB7IGZyYWdtZW50OiAncmV2aWV3VGhyZWFkcycsIHZhbHVlOiBbXSwgY29tcGxldGU6IHRydWUsIGhlYWRTaGE6ICdoZWFkLTInIH07XG5cdFx0fSk7XG5cdFx0Y29uc3Qgc3Vic2NyaXB0aW9uID0gc2VydmljZS5zdWJzY3JpYmVQdWxsUmVxdWVzdChyZWYsIHtcblx0XHRcdHByaW9yaXR5OiAnaW50ZXJhY3RpdmUnLFxuXHRcdFx0Y29udmVyc2F0aW9uOiB7IHJldmlld1RocmVhZHM6IHRydWUgfSxcblx0XHR9KTtcblx0XHRhd2FpdCBzdWJzY3JpcHRpb24ucmVmcmVzaCgnY29yZScpO1xuXHRcdGNvbnN0IG9sZFRocmVhZHMgPSBzdWJzY3JpcHRpb24ucmVmcmVzaCgncmV2aWV3VGhyZWFkcycpO1xuXHRcdGF3YWl0IHRocmVhZHNTdGFydGVkLnA7XG5cdFx0cXVlcmllcy5oZWFkU2hhID0gJ2hlYWQtMic7XG5cdFx0YXdhaXQgc3Vic2NyaXB0aW9uLnJlZnJlc2goJ2NvcmUnKTtcblx0XHRhd2FpdCByZWxlYXNlVGhyZWFkcy5jb21wbGV0ZSgpO1xuXHRcdGF3YWl0IG9sZFRocmVhZHM7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHN1YnNjcmlwdGlvbi5yZXNvdXJjZS5zbmFwc2hvdC5nZXQoKS5yZXZpZXdUaHJlYWRzLCB7XG5cdFx0XHRzdGF0dXM6ICdtaXNzaW5nJyxcblx0XHRcdGNvbXBsZXRlOiBmYWxzZSxcblx0XHRcdGF0dGVtcHRlZEF0OiBuZXcgRGF0ZSgwKS50b0lTT1N0cmluZygpLFxuXHRcdFx0aGVhZFNoYTogdW5kZWZpbmVkLFxuXHRcdFx0ZXJyb3I6IHVuZGVmaW5lZCxcblx0XHR9KTtcblx0XHRhd2FpdCBzdWJzY3JpcHRpb24ucmVmcmVzaCgncmV2aWV3VGhyZWFkcycpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzdWJzY3JpcHRpb24ucmVzb3VyY2Uuc25hcHNob3QuZ2V0KCkucmV2aWV3VGhyZWFkcy5oZWFkU2hhLCAnaGVhZC0yJyk7XG5cdFx0c3Vic2NyaXB0aW9uLmRpc3Bvc2UoKTtcblx0fSk7XG5cblx0dGVzdCgnc3RvcHMgcG9sbGluZyB0ZXJtaW5hbCBwdWxsIHJlcXVlc3RzIGFuZCBrZWVwcyBmYWlsZWQgZnJhZ21lbnRzIGluY29tcGxldGUnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgeyBjbG9jaywgcXVlcmllcywgc2VydmljZSB9ID0gc2V0dXAoKTtcblx0XHRxdWVyaWVzLmhhbmRsZXJzLnNldCgnY29yZScsICgpID0+ICh7XG5cdFx0XHRmcmFnbWVudDogJ2NvcmUnLFxuXHRcdFx0dmFsdWU6IHsgLi4uY29yZSgnaGVhZC0xJyksIHN0YXRlOiAnbWVyZ2VkJywgbWVyZ2VkQXQ6ICcyMDI2LTA4LTEyVDAwOjAwOjAwLjAwMFonIH0sXG5cdFx0XHRjb21wbGV0ZTogdHJ1ZSxcblx0XHR9KSk7XG5cdFx0cXVlcmllcy5oYW5kbGVycy5zZXQoJ3RvcExldmVsQ29tbWVudHMnLCAoKSA9PiB7XG5cdFx0XHR0aHJvdyBuZXcgR2l0SHViUmVxdWVzdEVycm9yKCdjb21tZW50cyBmYWlsZWQnLCAnc2VydmVyJywgNTAwKTtcblx0XHR9KTtcblx0XHRjb25zdCBzdWJzY3JpcHRpb24gPSBzZXJ2aWNlLnN1YnNjcmliZVB1bGxSZXF1ZXN0KHJlZiwge1xuXHRcdFx0cHJpb3JpdHk6ICd2aXNpYmxlJyxcblx0XHRcdGNvbnZlcnNhdGlvbjogeyB0b3BMZXZlbENvbW1lbnRzOiB0cnVlIH0sXG5cdFx0fSk7XG5cblx0XHRhd2FpdCBzdWJzY3JpcHRpb24ucmVmcmVzaCgnY29yZScpO1xuXHRcdGF3YWl0IGFzc2VydC5yZWplY3RzKCgpID0+IHN1YnNjcmlwdGlvbi5yZWZyZXNoKCd0b3BMZXZlbENvbW1lbnRzJyksIC9jb21tZW50cyBmYWlsZWQvKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdGNvcmVTdGF0ZTogc3Vic2NyaXB0aW9uLnJlc291cmNlLnNuYXBzaG90LmdldCgpLmNvcmUudmFsdWU/LnN0YXRlLFxuXHRcdFx0Y29tbWVudHNTdGF0dXM6IHN1YnNjcmlwdGlvbi5yZXNvdXJjZS5zbmFwc2hvdC5nZXQoKS50b3BMZXZlbENvbW1lbnRzLnN0YXR1cyxcblx0XHRcdGNvbW1lbnRzQ29tcGxldGU6IHN1YnNjcmlwdGlvbi5yZXNvdXJjZS5zbmFwc2hvdC5nZXQoKS50b3BMZXZlbENvbW1lbnRzLmNvbXBsZXRlLFxuXHRcdH0sIHtcblx0XHRcdGNvcmVTdGF0ZTogJ21lcmdlZCcsXG5cdFx0XHRjb21tZW50c1N0YXR1czogJ2Vycm9yJyxcblx0XHRcdGNvbW1lbnRzQ29tcGxldGU6IGZhbHNlLFxuXHRcdH0pO1xuXG5cdFx0cXVlcmllcy5jYWxscy5sZW5ndGggPSAwO1xuXHRcdGNsb2NrLmFkdmFuY2VCeSgxMF8wMDApO1xuXHRcdGF3YWl0IGZsdXNoQXN5bmMoKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHF1ZXJpZXMuY2FsbHMsIFtdKTtcblx0XHRzdWJzY3JpcHRpb24uZGlzcG9zZSgpO1xuXHR9KTtcbn0pO1xuXG5mdW5jdGlvbiBjaGVja3NSZXN1bHQoaWQ6IHN0cmluZyk6IFB1bGxSZXF1ZXN0RnJhZ21lbnRSZXN1bHQge1xuXHRyZXR1cm4ge1xuXHRcdGZyYWdtZW50OiAnY2hlY2tzJyxcblx0XHR2YWx1ZToge1xuXHRcdFx0aGVhZFNoYTogJ2hlYWQtMScsXG5cdFx0XHRyZXF1aXJlZG5lc3NDb21wbGV0ZTogdHJ1ZSxcblx0XHRcdGV4cGVjdGVkU3VpdGVzOiBbXSxcblx0XHRcdGV4cGVjdGVkU3VpdGVzQ29tcGxldGU6IHRydWUsXG5cdFx0XHRjaGVja3M6IFt7IGlkLCB0eXBlOiAnY2hlY2tSdW4nLCBuYW1lOiBpZCwgc3RhdHVzOiAnQ09NUExFVEVEJyB9XSxcblx0XHR9LFxuXHRcdGNvbXBsZXRlOiB0cnVlLFxuXHRcdGhlYWRTaGE6ICdoZWFkLTEnLFxuXHR9O1xufVxuXG5hc3luYyBmdW5jdGlvbiBmbHVzaEFzeW5jKCk6IFByb21pc2U8dm9pZD4ge1xuXHRmb3IgKGxldCBpbmRleCA9IDA7IGluZGV4IDwgMTA7IGluZGV4KyspIHtcblx0XHRhd2FpdCBQcm9taXNlLnJlc29sdmUoKTtcblx0fVxufVxuIl0sCiAgIm1hcHBp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
