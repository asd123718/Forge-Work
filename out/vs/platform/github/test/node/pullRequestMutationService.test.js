import assert from "assert";
import { DeferredPromise, raceCancellationError } from "../../../../base/common/async.js";
import { CancellationToken } from "../../../../base/common/cancellation.js";
import { Emitter } from "../../../../base/common/event.js";
import { observableValue } from "../../../../base/common/observable.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../base/test/common/utils.js";
import { GitHubTransport } from "../../common/githubTransport.js";
import { PullRequestMutationService } from "../../common/pullRequestMutationService.js";
import { FakeGitHubScheduler } from "./fakeGitHubScheduler.js";
import { nodeFetch } from "./nodeFetch.js";
import {
  gitHubDisconnectResponse,
  gitHubGraphQLResponse,
  gitHubGraphQLStep,
  gitHubJsonResponse,
  gitHubRawResponse,
  gitHubRedirectResponse,
  gitHubRestStep,
  ProgrammableGitHubServer
} from "./programmableGitHubServer.js";
const operationMarker = "<!-- vscode-agent-host-operation:operation-1 -->";
class TestCredentialService {
  constructor(_account) {
    this._account = _account;
    this._onDidInvalidate = new Emitter();
    this.onDidInvalidate = this._onDidInvalidate.event;
    this._controller = new AbortController();
  }
  getCredential(signal2) {
    if (signal2.aborted) {
      return Promise.reject(signal2.reason);
    }
    return Promise.resolve({
      account: this._account,
      token: "token",
      generation: 1,
      signal: this._controller.signal
    });
  }
  resolveCredential(_token, signal2) {
    return this.getCredential(signal2);
  }
  handleRequestError() {
  }
  dispose() {
    this._controller.abort(new Error("disposed"));
    this._onDidInvalidate.dispose();
  }
}
class TestResourceService {
  constructor(ref, initial) {
    this.invalidations = [];
    this.snapshot = observableValue(this, initial);
    this.resource = { ref, snapshot: this.snapshot };
  }
  subscribePullRequest(_ref, _options) {
    let disposed = false;
    return {
      resource: this.resource,
      update: () => {
      },
      refresh: async (fragment, token = CancellationToken.None) => {
        if (disposed) {
          throw new Error("subscription disposed");
        }
        if (token.isCancellationRequested) {
          throw new Error("cancelled");
        }
        await raceCancellationError(Promise.resolve(this.refreshHandler?.(fragment)), token);
      },
      dispose: () => {
        disposed = true;
      }
    };
  }
  invalidatePullRequest(_ref, fragments) {
    this.invalidations.push({ fragments });
  }
  clear() {
  }
  setSnapshot(snapshot) {
    this.snapshot.set(snapshot, void 0);
  }
}
suite("PullRequestMutationService", () => {
  const disposables = ensureNoDisposablesAreLeakedInTestSuite();
  async function withServers(fn) {
    const api = await ProgrammableGitHubServer.start();
    const download = await ProgrammableGitHubServer.start();
    try {
      await fn(api, download);
    } finally {
      await api.disposeAsync();
      await download.disposeAsync();
    }
  }
  function setup(server, snapshot = completeSnapshot(server), scheduler) {
    const account = { host: new URL(server.apiBaseUrl).host, accountId: "101" };
    const ref = { ...account, owner: "octo", repo: "repo", number: 7 };
    const credentials = disposables.add(new TestCredentialService(account));
    const transport = disposables.add(new GitHubTransport(nodeFetch, void 0, true));
    const resources = new TestResourceService(ref, { ...snapshot, ref });
    const service = disposables.add(new PullRequestMutationService(scheduler, credentials, transport, resources, server.createEndpointService()));
    return { ref, resources, service };
  }
  test("reconciles an ambiguous top-level comment without duplicating it", async () => {
    await withServers(async (server) => {
      server.enqueue(gitHubRestStep({
        method: "POST",
        path: "/repos/octo/repo/issues/7/comments",
        assert: (request) => assert.deepStrictEqual(request.bodyJson, { body: `hello

${operationMarker}` }),
        response: gitHubDisconnectResponse()
      }));
      const { ref, resources, service } = setup(server);
      resources.refreshHandler = (fragment) => {
        assert.strictEqual(fragment, "topLevelComments");
        const snapshot = resources.snapshot.get();
        resources.setSnapshot({
          ...snapshot,
          topLevelComments: {
            status: "ready",
            complete: true,
            value: [{ id: "1", body: `hello

${operationMarker}` }]
          }
        });
      };
      const result = await service.addComment(ref, { operationId: "operation-1", body: "hello" }, signal());
      assert.deepStrictEqual({
        result,
        requestCount: server.requests.length
      }, {
        result: {
          outcome: "reconciled",
          value: { id: "1", body: `hello

${operationMarker}` }
        },
        requestCount: 1
      });
      server.assertSatisfied();
    });
  });
  test("creates pull requests and enables auto-merge through typed operations", async () => {
    await withServers(async (server) => {
      server.enqueue(
        gitHubRestStep({
          method: "POST",
          path: "/repos/octo/repo/pulls",
          assert: (request) => assert.deepStrictEqual(request.bodyJson, {
            title: "PR",
            body: "Body",
            head: "feature",
            base: "main",
            draft: true
          }),
          response: gitHubJsonResponse({
            number: 8,
            node_id: "PR8",
            html_url: "https://example.test/pull/8",
            created_at: "2026-01-01T00:00:00Z"
          })
        }),
        gitHubGraphQLStep({
          queryIncludes: "AgentHostEnablePullRequestAutoMerge",
          assert: (request) => assert.deepStrictEqual(request.graphQl?.variables, {
            pullRequestId: "PR8",
            mergeMethod: "SQUASH"
          }),
          response: gitHubGraphQLResponse({
            enablePullRequestAutoMerge: { pullRequest: { id: "PR8" } }
          })
        })
      );
      const { ref, service } = setup(server);
      const created = await service.createPullRequest(ref, {
        title: "PR",
        body: "Body",
        head: "feature",
        base: "main",
        draft: true
      }, signal());
      await service.enableAutoMerge(ref, { pullRequestId: "PR8", method: "SQUASH" }, signal());
      assert.deepStrictEqual(created, {
        ref: { ...ref, number: 8 },
        id: "PR8",
        url: "https://example.test/pull/8",
        createdAt: "2026-01-01T00:00:00Z"
      });
      server.assertSatisfied();
    });
  });
  test("retries only after a complete refresh proves a comment marker absent", async () => {
    await withServers(async (server) => {
      server.enqueue(
        gitHubRestStep({
          method: "POST",
          path: "/repos/octo/repo/issues/7/comments",
          response: gitHubDisconnectResponse()
        }),
        gitHubRestStep({
          method: "POST",
          path: "/repos/octo/repo/issues/7/comments",
          response: gitHubJsonResponse({ id: 2, body: `hello

${operationMarker}` })
        })
      );
      const { ref, resources, service } = setup(server);
      resources.refreshHandler = () => {
        const snapshot = resources.snapshot.get();
        resources.setSnapshot({
          ...snapshot,
          topLevelComments: { status: "ready", complete: true, value: [] }
        });
      };
      const result = await service.addComment(ref, { operationId: "operation-1", body: "hello" }, signal());
      assert.deepStrictEqual({ result, requestCount: server.requests.length }, {
        result: {
          outcome: "succeeded",
          value: {
            id: "2",
            nodeId: void 0,
            body: `hello

${operationMarker}`,
            url: void 0,
            createdAt: void 0,
            updatedAt: void 0,
            author: void 0
          }
        },
        requestCount: 2
      });
      server.assertSatisfied();
    });
  });
  test("returns indeterminate when comment reconciliation remains incomplete", async () => {
    await withServers(async (server) => {
      server.enqueue(gitHubRestStep({
        method: "POST",
        path: "/repos/octo/repo/issues/7/comments",
        response: gitHubDisconnectResponse()
      }));
      const { ref, resources, service } = setup(server);
      resources.refreshHandler = () => {
        const snapshot = resources.snapshot.get();
        resources.setSnapshot({
          ...snapshot,
          topLevelComments: { status: "ready", complete: false, value: [] }
        });
      };
      const result = await service.addComment(ref, { operationId: "operation-1", body: "hello" }, signal());
      assert.deepStrictEqual({ result, requestCount: server.requests.length }, {
        result: { outcome: "indeterminate" },
        requestCount: 1
      });
      server.assertSatisfied();
    });
  });
  test("never resolves a review thread when the reply fails", async () => {
    await withServers(async (server) => {
      server.enqueue(gitHubGraphQLStep({
        queryIncludes: "AgentHostAddPullRequestReviewThreadReply",
        response: gitHubGraphQLResponse(void 0, [{ message: "reply rejected", type: "FORBIDDEN" }])
      }));
      const { ref, service } = setup(server);
      await assert.rejects(
        () => service.replyAndResolveThread(ref, {
          operationId: "operation-1",
          threadId: "T1",
          body: "reply",
          resolve: true
        }, signal()),
        /reply rejected/
      );
      assert.strictEqual(server.requests.length, 1);
      server.assertSatisfied();
    });
  });
  test("resolves only after an ambiguous reply is reconciled as successful", async () => {
    await withServers(async (server) => {
      server.enqueue(
        gitHubGraphQLStep({
          queryIncludes: "AgentHostAddPullRequestReviewThreadReply",
          response: gitHubDisconnectResponse()
        }),
        gitHubGraphQLStep({
          queryIncludes: "AgentHostResolvePullRequestReviewThread",
          response: gitHubGraphQLResponse({
            resolveReviewThread: { thread: { id: "T1", isResolved: true } }
          })
        })
      );
      const { ref, resources, service } = setup(server);
      resources.refreshHandler = () => {
        const snapshot = resources.snapshot.get();
        resources.setSnapshot({
          ...snapshot,
          reviewThreads: {
            status: "ready",
            complete: true,
            headSha: "head-1",
            value: [{
              id: "T1",
              isResolved: false,
              comments: [{ id: "2", body: `reply

${operationMarker}` }]
            }]
          }
        });
      };
      const result = await service.replyAndResolveThread(ref, {
        operationId: "operation-1",
        threadId: "T1",
        body: "reply",
        resolve: true
      }, signal());
      assert.deepStrictEqual({
        result,
        operations: server.requests.map((request) => ({
          reply: request.graphQl?.query?.includes("AgentHostAddPullRequestReviewThreadReply"),
          resolve: request.graphQl?.query?.includes("AgentHostResolvePullRequestReviewThread")
        })),
        invalidations: resources.invalidations
      }, {
        result: {
          reply: { outcome: "reconciled", value: { id: "2", body: `reply

${operationMarker}` } },
          resolved: true
        },
        operations: [
          { reply: true, resolve: false },
          { reply: false, resolve: true }
        ],
        invalidations: [
          { fragments: ["inlineComments"] },
          { fragments: ["reviewThreads"] }
        ]
      });
      server.assertSatisfied();
    });
  });
  test("leaves a review thread open when resolution fails", async () => {
    await withServers(async (server) => {
      server.enqueue(
        gitHubGraphQLStep({
          queryIncludes: "AgentHostAddPullRequestReviewThreadReply",
          response: gitHubGraphQLResponse({
            addPullRequestReviewThreadReply: {
              comment: { id: "C2", databaseId: 2, body: `reply

${operationMarker}` }
            }
          })
        }),
        gitHubGraphQLStep({
          queryIncludes: "AgentHostResolvePullRequestReviewThread",
          response: gitHubGraphQLResponse(void 0, [{ message: "resolve rejected", type: "FORBIDDEN" }])
        }),
        gitHubGraphQLStep({
          queryIncludes: "AgentHostResolvePullRequestReviewThread",
          response: gitHubGraphQLResponse({
            resolveReviewThread: { thread: { id: "T1", isResolved: true } }
          })
        })
      );
      const snapshot = completeSnapshot(server);
      const { ref, resources, service } = setup(server, {
        ...snapshot,
        reviewThreads: {
          status: "ready",
          complete: true,
          headSha: "head-1",
          value: [{ id: "T1", isResolved: false, comments: [] }]
        }
      });
      const result = await service.replyAndResolveThread(ref, {
        operationId: "operation-1",
        threadId: "T1",
        body: "reply",
        resolve: true
      }, signal());
      assert.deepStrictEqual({
        result,
        threadOpen: resources.snapshot.get().reviewThreads.value?.[0].isResolved === false,
        invalidations: resources.invalidations
      }, {
        result: {
          reply: {
            outcome: "succeeded",
            value: {
              id: "2",
              nodeId: "C2",
              body: `reply

${operationMarker}`,
              url: void 0,
              createdAt: void 0,
              updatedAt: void 0,
              author: void 0
            }
          },
          resolved: false,
          resolveError: {
            message: "GitHub GraphQL mutation failed: resolve rejected",
            kind: "authorization",
            statusCode: 200
          }
        },
        threadOpen: true,
        invalidations: [{ fragments: ["reviewThreads", "inlineComments"] }]
      });
      await service.resolveThread(ref, "T1", signal());
      assert.deepStrictEqual(server.requests.map((request) => request.graphQl?.query?.includes("AgentHostAddPullRequestReviewThreadReply")), [
        true,
        false,
        false
      ]);
      server.assertSatisfied();
    });
  });
  test("does not reconcile or retry deterministic GraphQL mutation errors", async () => {
    await withServers(async (server) => {
      server.enqueue(gitHubGraphQLStep({
        queryIncludes: "AgentHostAddPullRequestReviewThreadReply",
        response: gitHubGraphQLResponse(void 0, [{ message: "thread missing", type: "NOT_FOUND" }])
      }));
      const { ref, resources, service } = setup(server);
      let refreshCount = 0;
      resources.refreshHandler = () => {
        refreshCount++;
      };
      await assert.rejects(
        () => service.replyToThread(ref, {
          operationId: "operation-1",
          threadId: "T1",
          body: "reply"
        }, signal()),
        (error) => error instanceof Error && error.message.includes("thread missing")
      );
      assert.deepStrictEqual({ requestCount: server.requests.length, refreshCount }, {
        requestCount: 1,
        refreshCount: 0
      });
      server.assertSatisfied();
    });
  });
  test("does not duplicate an unconfirmed workflow rerun", async () => {
    await withServers(async (server) => {
      server.enqueue(
        gitHubRestStep({
          method: "POST",
          path: "/repos/octo/repo/actions/runs/10/rerun-failed-jobs",
          response: gitHubDisconnectResponse()
        }),
        gitHubRestStep({
          method: "GET",
          path: "/repos/octo/repo/actions/runs/10",
          response: gitHubJsonResponse(workflowRun(10, 1, "completed"))
        }),
        gitHubRestStep({
          method: "GET",
          path: "/repos/octo/repo/actions/runs/10",
          response: gitHubJsonResponse(workflowRun(10, 1, "completed"))
        }),
        gitHubRestStep({
          method: "POST",
          path: "/repos/octo/repo/actions/runs/10/rerun-failed-jobs",
          response: gitHubJsonResponse({}, { status: 201 })
        })
      );
      const { ref, service } = setup(server);
      const options = {
        operationId: "operation-1",
        runId: "10",
        expectedRunAttempt: 1,
        failedJobsOnly: true
      };
      const first = await service.rerunWorkflow(ref, options, signal());
      const second = await service.rerunWorkflow(ref, options, signal());
      assert.deepStrictEqual({
        first,
        second,
        methods: server.requests.map((request) => request.method)
      }, {
        first: { outcome: "indeterminate", value: workflowRunNormalized("10", 1, "COMPLETED") },
        second: { outcome: "succeeded" },
        methods: ["POST", "GET", "GET", "POST"]
      });
      server.assertSatisfied();
    });
  });
  test("paginates workflow diagnostics and strips credentials from redacted log redirects", async () => {
    await withServers(async (server, download) => {
      server.enqueue(
        gitHubRestStep({
          method: "GET",
          path: "/repos/octo/repo/actions/runs",
          query: { head_sha: "head-1", per_page: 100 },
          response: gitHubJsonResponse({ workflow_runs: [workflowRun(10, 1, "completed")] }, {
            link: `<${server.apiBaseUrl}/repos/octo/repo/actions/runs?head_sha=head-1&per_page=100&page=2>; rel="next"`
          })
        }),
        gitHubRestStep({
          method: "GET",
          path: "/repos/octo/repo/actions/runs",
          query: { head_sha: "head-1", per_page: 100, page: 2 },
          response: gitHubJsonResponse({ workflow_runs: [workflowRun(11, 1, "queued")] })
        }),
        gitHubRestStep({
          method: "GET",
          path: "/repos/octo/repo/actions/runs/10/jobs",
          query: { per_page: 100 },
          response: gitHubJsonResponse({ jobs: [{ id: 20, name: "test", status: "completed", conclusion: "failure", check_run_id: 30 }] })
        }),
        gitHubRestStep({
          method: "GET",
          path: "/repos/octo/repo/check-runs/30/annotations",
          query: { per_page: 100 },
          response: gitHubJsonResponse([{ path: "src/a.ts", start_line: 2, end_line: 3, annotation_level: "failure", message: "bad" }])
        }),
        gitHubRestStep({
          method: "GET",
          path: "/repos/octo/repo/actions/jobs/20/logs",
          response: gitHubRedirectResponse(`${download.apiBaseUrl}/signed/log`)
        })
      );
      download.enqueue(gitHubRestStep({
        method: "GET",
        path: "/signed/log",
        assert: (request) => assert.strictEqual(request.headers.authorization, void 0),
        response: gitHubRawResponse("::add-mask::supersecret\nsupersecret\ntoken=visible\nghp_1234567890123456")
      }));
      const { ref, service } = setup(server);
      const runs = await service.listWorkflowRuns(ref, "head-1", signal());
      const jobs = await service.listWorkflowJobs(ref, "10", signal());
      const annotations = await service.listCheckAnnotations(ref, "30", signal());
      const log = await service.downloadWorkflowJobLog(ref, "20", signal());
      assert.deepStrictEqual({
        runs: runs.map((run) => ({ id: run.id, status: run.status })),
        jobs,
        annotations,
        log
      }, {
        runs: [{ id: "10", status: "COMPLETED" }, { id: "11", status: "QUEUED" }],
        jobs: [{
          id: "20",
          runId: "10",
          name: "test",
          status: "COMPLETED",
          conclusion: "FAILURE",
          checkRunId: "30",
          url: void 0,
          startedAt: void 0,
          completedAt: void 0
        }],
        annotations: [{
          path: "src/a.ts",
          startLine: 2,
          endLine: 3,
          level: "failure",
          message: "bad",
          title: void 0,
          rawDetails: void 0
        }],
        log: {
          text: "::add-mask::***\n***\ntoken=***\n***",
          truncated: false
        }
      });
      server.assertSatisfied();
      download.assertSatisfied();
    });
  });
  test("sends the expected head when updating a branch", async () => {
    await withServers(async (server) => {
      server.enqueue(gitHubRestStep({
        method: "PUT",
        path: "/repos/octo/repo/pulls/7/update-branch",
        assert: (request) => assert.deepStrictEqual(request.bodyJson, { expected_head_sha: "head-1" }),
        response: gitHubJsonResponse({ message: "Updating pull request branch." }, { status: 202 })
      }));
      const { ref, resources, service } = setup(server);
      await service.updateBranch(ref, { expectedHeadSha: "head-1" }, signal());
      assert.deepStrictEqual(resources.invalidations, [{ fragments: ["core", "checks", "mergeability"] }]);
      server.assertSatisfied();
    });
  });
  test("prepares and directly merges only with complete generation-anchored state", async () => {
    await withServers(async (server) => {
      server.enqueue(gitHubRestStep({
        method: "PUT",
        path: "/repos/octo/repo/pulls/7/merge",
        assert: (request) => assert.deepStrictEqual(request.bodyJson, {
          sha: "head-1",
          merge_method: "squash"
        }),
        response: gitHubJsonResponse({ merged: true, sha: "merge-sha", message: "merged" })
      }));
      const { ref, service } = setup(server);
      const preparation = await service.prepareMerge(ref, "head-1", signal());
      const result = await service.merge(preparation, {
        method: "SQUASH",
        authorization: { confirmed: true, authorizationId: "approval-1" }
      }, signal());
      assert.deepStrictEqual(result, { outcome: "succeeded", sha: "merge-sha", message: "merged" });
      server.assertSatisfied();
    });
  });
  test("rejects invalidated merge preparation before network access", async () => {
    await withServers(async (server) => {
      const { ref, resources, service } = setup(server);
      const preparation = await service.prepareMerge(ref, "head-1", signal());
      resources.setSnapshot({ ...resources.snapshot.get(), headGeneration: preparation.headGeneration + 1 });
      await assert.rejects(
        () => service.merge(preparation, {
          method: "SQUASH",
          authorization: { confirmed: true, authorizationId: "approval-1" }
        }, signal()),
        /invalidated/
      );
      assert.strictEqual(server.requests.length, 0);
    });
  });
  test("expires unused merge preparations without retaining a poller", async () => {
    await withServers(async (server) => {
      const scheduler = new FakeGitHubScheduler({ now: 0 });
      const { ref, service } = setup(server, completeSnapshot(server), scheduler);
      const preparation = await service.prepareMerge(ref, "head-1", signal());
      scheduler.advanceBy(5 * 6e4);
      await assert.rejects(
        () => service.merge(preparation, {
          method: "SQUASH",
          authorization: { confirmed: true, authorizationId: "approval-1" }
        }, signal()),
        /invalid or has already been consumed/
      );
      assert.strictEqual(server.requests.length, 0);
    });
  });
  test("cancels authoritative merge preparation refreshes", async () => {
    await withServers(async (server) => {
      const { ref, resources, service } = setup(server);
      const started = new DeferredPromise();
      const release = new DeferredPromise();
      resources.refreshHandler = async () => {
        await started.complete();
        await release.p;
      };
      const controller = new AbortController();
      const preparation = service.prepareMerge(ref, "head-1", controller.signal);
      await started.p;
      controller.abort(new Error("cancel preparation"));
      await assert.rejects(() => preparation, /cancel preparation/);
      await release.complete();
      assert.strictEqual(server.requests.length, 0);
    });
  });
  test("reconciles an ambiguous merge after core proves the pull request merged", async () => {
    await withServers(async (server) => {
      server.enqueue(gitHubRestStep({
        method: "PUT",
        path: "/repos/octo/repo/pulls/7/merge",
        response: gitHubDisconnectResponse()
      }));
      const { ref, resources, service } = setup(server);
      const preparation = await service.prepareMerge(ref, "head-1", signal());
      resources.refreshHandler = (fragment) => {
        if (fragment === "core") {
          const snapshot = resources.snapshot.get();
          resources.setSnapshot({
            ...snapshot,
            core: { ...snapshot.core, value: { ...snapshot.core.value, state: "merged" } }
          });
        }
      };
      const result = await service.merge(preparation, {
        method: "SQUASH",
        authorization: { confirmed: true, authorizationId: "approval-1" }
      }, signal());
      assert.deepStrictEqual(result, { outcome: "reconciled", message: "Pull request was merged" });
      server.assertSatisfied();
    });
  });
  test("does not enqueue a pull request already in the merge queue", async () => {
    await withServers(async (server) => {
      const snapshot = completeSnapshot(server, true, "MQE1");
      const { ref, service } = setup(server, snapshot);
      const preparation = await service.prepareMerge(ref, "head-1", signal());
      const result = await service.enqueue(
        preparation,
        { confirmed: true, authorizationId: "approval-1" },
        signal()
      );
      assert.deepStrictEqual(result, { outcome: "alreadyQueued", mergeQueueEntryId: "MQE1" });
      assert.strictEqual(server.requests.length, 0);
    });
  });
  test("enqueues with the pull request node ID and expected head OID", async () => {
    await withServers(async (server) => {
      server.enqueue(gitHubGraphQLStep({
        queryIncludes: "AgentHostEnqueuePullRequest",
        assert: (request) => assert.deepStrictEqual(request.graphQl?.variables, {
          pullRequestId: "PR7",
          expectedHeadOid: "head-1"
        }),
        response: gitHubGraphQLResponse({
          enqueuePullRequest: { mergeQueueEntry: { id: "MQE2" } }
        })
      }));
      const { ref, service } = setup(server, completeSnapshot(server, true));
      const preparation = await service.prepareMerge(ref, "head-1", signal());
      const result = await service.enqueue(
        preparation,
        { confirmed: true, authorizationId: "approval-1" },
        signal()
      );
      assert.deepStrictEqual(result, { outcome: "succeeded", mergeQueueEntryId: "MQE2" });
      server.assertSatisfied();
    });
  });
});
function signal() {
  return new AbortController().signal;
}
function completeSnapshot(server, mergeQueueRequired = false, mergeQueueEntryId) {
  const account = { host: new URL(server.apiBaseUrl).host, accountId: "101" };
  const ref = { ...account, owner: "octo", repo: "repo", number: 7 };
  return {
    ref,
    generation: 1,
    headGeneration: 1,
    core: {
      status: "ready",
      complete: true,
      value: {
        id: "PR7",
        repositoryNameWithOwner: "octo/repo",
        number: 7,
        title: "PR",
        url: "https://example.test/pr/7",
        state: "open",
        draft: false,
        headSha: "head-1",
        headRef: "feature",
        baseSha: "base-1",
        baseRef: "main"
      }
    },
    topLevelComments: { status: "missing", complete: false },
    submittedReviews: { status: "ready", complete: true, value: [] },
    inlineComments: { status: "missing", complete: false },
    reviewThreads: { status: "ready", complete: true, value: [], headSha: "head-1" },
    checks: {
      status: "ready",
      complete: true,
      headSha: "head-1",
      value: {
        headSha: "head-1",
        checks: [],
        requirednessComplete: true,
        expectedSuites: [],
        expectedSuitesComplete: true
      }
    },
    mergeability: {
      status: "ready",
      complete: true,
      headSha: "head-1",
      value: {
        headSha: "head-1",
        baseSha: "base-1",
        mergeable: "MERGEABLE",
        viewerCanUpdate: true,
        viewerCanMerge: true,
        viewerCanEnableAutoMerge: true,
        allowedMergeMethods: ["SQUASH"],
        autoMergeEnabled: false,
        mergeQueueRequired,
        queueRequirementKnown: true,
        mergeQueueEntryId
      }
    },
    participants: { status: "missing", complete: false }
  };
}
function workflowRun(id, attempt, status) {
  return {
    id,
    name: "CI",
    status,
    conclusion: status === "completed" ? "failure" : null,
    head_sha: "head-1",
    run_attempt: attempt
  };
}
function workflowRunNormalized(id, attempt, status) {
  return {
    id,
    name: "CI",
    event: void 0,
    status,
    conclusion: status === "COMPLETED" ? "FAILURE" : void 0,
    headSha: "head-1",
    runAttempt: attempt,
    url: void 0,
    createdAt: void 0,
    updatedAt: void 0
  };
}
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxwbGF0Zm9ybVxcZ2l0aHViXFx0ZXN0XFxub2RlXFxwdWxsUmVxdWVzdE11dGF0aW9uU2VydmljZS50ZXN0LnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IGFzc2VydCBmcm9tICdhc3NlcnQnO1xuaW1wb3J0IHsgRGVmZXJyZWRQcm9taXNlLCByYWNlQ2FuY2VsbGF0aW9uRXJyb3IgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9hc3luYy5qcyc7XG5pbXBvcnQgeyBDYW5jZWxsYXRpb25Ub2tlbiB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2NhbmNlbGxhdGlvbi5qcyc7XG5pbXBvcnQgeyBFbWl0dGVyIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vZXZlbnQuanMnO1xuaW1wb3J0IHsgSURpc3Bvc2FibGUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgb2JzZXJ2YWJsZVZhbHVlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vb2JzZXJ2YWJsZS5qcyc7XG5pbXBvcnQgeyBlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL3Rlc3QvY29tbW9uL3V0aWxzLmpzJztcbmltcG9ydCB7XG5cdFB1bGxSZXF1ZXN0RnJhZ21lbnQsXG5cdFB1bGxSZXF1ZXN0UmVmLFxuXHRQdWxsUmVxdWVzdFJlc291cmNlLFxuXHRQdWxsUmVxdWVzdFNuYXBzaG90LFxuXHRQdWxsUmVxdWVzdFN1YnNjcmlwdGlvbixcblx0UHVsbFJlcXVlc3RTdWJzY3JpcHRpb25PcHRpb25zLFxufSBmcm9tICcuLi8uLi9jb21tb24vZ2l0aHViUHVsbFJlcXVlc3RTZXJ2aWNlLmpzJztcbmltcG9ydCB7IEdpdEh1YkNyZWRlbnRpYWwsIEdpdEh1YkNyZWRlbnRpYWxJbnZhbGlkYXRpb24sIElHaXRIdWJDcmVkZW50aWFscyB9IGZyb20gJy4uLy4uL2NvbW1vbi9naXRodWJDcmVkZW50aWFsU2VydmljZS5qcyc7XG5pbXBvcnQgeyBHaXRIdWJUcmFuc3BvcnQgfSBmcm9tICcuLi8uLi9jb21tb24vZ2l0aHViVHJhbnNwb3J0LmpzJztcbmltcG9ydCB7IFB1bGxSZXF1ZXN0TXV0YXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vY29tbW9uL3B1bGxSZXF1ZXN0TXV0YXRpb25TZXJ2aWNlLmpzJztcbmltcG9ydCB7IElQdWxsUmVxdWVzdFJlc291cmNlcyB9IGZyb20gJy4uLy4uL2NvbW1vbi9wdWxsUmVxdWVzdFJlc291cmNlU2VydmljZS5qcyc7XG5pbXBvcnQgeyBGYWtlR2l0SHViU2NoZWR1bGVyIH0gZnJvbSAnLi9mYWtlR2l0SHViU2NoZWR1bGVyLmpzJztcbmltcG9ydCB7IG5vZGVGZXRjaCB9IGZyb20gJy4vbm9kZUZldGNoLmpzJztcbmltcG9ydCB7XG5cdGdpdEh1YkRpc2Nvbm5lY3RSZXNwb25zZSxcblx0Z2l0SHViR3JhcGhRTFJlc3BvbnNlLFxuXHRnaXRIdWJHcmFwaFFMU3RlcCxcblx0Z2l0SHViSnNvblJlc3BvbnNlLFxuXHRnaXRIdWJSYXdSZXNwb25zZSxcblx0Z2l0SHViUmVkaXJlY3RSZXNwb25zZSxcblx0Z2l0SHViUmVzdFN0ZXAsXG5cdFByb2dyYW1tYWJsZUdpdEh1YlNlcnZlcixcbn0gZnJvbSAnLi9wcm9ncmFtbWFibGVHaXRIdWJTZXJ2ZXIuanMnO1xuXG5jb25zdCBvcGVyYXRpb25NYXJrZXIgPSAnPCEtLSB2c2NvZGUtYWdlbnQtaG9zdC1vcGVyYXRpb246b3BlcmF0aW9uLTEgLS0+JztcblxuY2xhc3MgVGVzdENyZWRlbnRpYWxTZXJ2aWNlIGltcGxlbWVudHMgSUdpdEh1YkNyZWRlbnRpYWxzLCBJRGlzcG9zYWJsZSB7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfb25EaWRJbnZhbGlkYXRlID0gbmV3IEVtaXR0ZXI8R2l0SHViQ3JlZGVudGlhbEludmFsaWRhdGlvbj4oKTtcblx0cmVhZG9ubHkgb25EaWRJbnZhbGlkYXRlID0gdGhpcy5fb25EaWRJbnZhbGlkYXRlLmV2ZW50O1xuXHRwcml2YXRlIHJlYWRvbmx5IF9jb250cm9sbGVyID0gbmV3IEFib3J0Q29udHJvbGxlcigpO1xuXG5cdGNvbnN0cnVjdG9yKHByaXZhdGUgcmVhZG9ubHkgX2FjY291bnQ6IHsgcmVhZG9ubHkgaG9zdDogc3RyaW5nOyByZWFkb25seSBhY2NvdW50SWQ6IHN0cmluZyB9KSB7IH1cblxuXHRnZXRDcmVkZW50aWFsKHNpZ25hbDogQWJvcnRTaWduYWwpOiBQcm9taXNlPEdpdEh1YkNyZWRlbnRpYWw+IHtcblx0XHRpZiAoc2lnbmFsLmFib3J0ZWQpIHtcblx0XHRcdHJldHVybiBQcm9taXNlLnJlamVjdChzaWduYWwucmVhc29uKTtcblx0XHR9XG5cdFx0cmV0dXJuIFByb21pc2UucmVzb2x2ZSh7XG5cdFx0XHRhY2NvdW50OiB0aGlzLl9hY2NvdW50LFxuXHRcdFx0dG9rZW46ICd0b2tlbicsXG5cdFx0XHRnZW5lcmF0aW9uOiAxLFxuXHRcdFx0c2lnbmFsOiB0aGlzLl9jb250cm9sbGVyLnNpZ25hbCxcblx0XHR9KTtcblx0fVxuXG5cdHJlc29sdmVDcmVkZW50aWFsKF90b2tlbjogc3RyaW5nLCBzaWduYWw6IEFib3J0U2lnbmFsKTogUHJvbWlzZTxHaXRIdWJDcmVkZW50aWFsPiB7XG5cdFx0cmV0dXJuIHRoaXMuZ2V0Q3JlZGVudGlhbChzaWduYWwpO1xuXHR9XG5cblx0aGFuZGxlUmVxdWVzdEVycm9yKCk6IHZvaWQgeyB9XG5cblx0ZGlzcG9zZSgpOiB2b2lkIHtcblx0XHR0aGlzLl9jb250cm9sbGVyLmFib3J0KG5ldyBFcnJvcignZGlzcG9zZWQnKSk7XG5cdFx0dGhpcy5fb25EaWRJbnZhbGlkYXRlLmRpc3Bvc2UoKTtcblx0fVxufVxuXG5jbGFzcyBUZXN0UmVzb3VyY2VTZXJ2aWNlIGltcGxlbWVudHMgSVB1bGxSZXF1ZXN0UmVzb3VyY2VzIHtcblxuXHRyZWFkb25seSBpbnZhbGlkYXRpb25zOiB7IHJlYWRvbmx5IGZyYWdtZW50czogcmVhZG9ubHkgUHVsbFJlcXVlc3RGcmFnbWVudFtdIH1bXSA9IFtdO1xuXHRyZWFkb25seSBzbmFwc2hvdDtcblx0cmVhZG9ubHkgcmVzb3VyY2U6IFB1bGxSZXF1ZXN0UmVzb3VyY2U7XG5cdHJlZnJlc2hIYW5kbGVyOiAoKGZyYWdtZW50OiBQdWxsUmVxdWVzdEZyYWdtZW50IHwgdW5kZWZpbmVkKSA9PiB2b2lkIHwgUHJvbWlzZTx2b2lkPikgfCB1bmRlZmluZWQ7XG5cblx0Y29uc3RydWN0b3IocmVmOiBQdWxsUmVxdWVzdFJlZiwgaW5pdGlhbDogUHVsbFJlcXVlc3RTbmFwc2hvdCkge1xuXHRcdHRoaXMuc25hcHNob3QgPSBvYnNlcnZhYmxlVmFsdWUodGhpcywgaW5pdGlhbCk7XG5cdFx0dGhpcy5yZXNvdXJjZSA9IHsgcmVmLCBzbmFwc2hvdDogdGhpcy5zbmFwc2hvdCB9O1xuXHR9XG5cblx0c3Vic2NyaWJlUHVsbFJlcXVlc3QoX3JlZjogUHVsbFJlcXVlc3RSZWYsIF9vcHRpb25zOiBQdWxsUmVxdWVzdFN1YnNjcmlwdGlvbk9wdGlvbnMpOiBQdWxsUmVxdWVzdFN1YnNjcmlwdGlvbiB7XG5cdFx0bGV0IGRpc3Bvc2VkID0gZmFsc2U7XG5cdFx0cmV0dXJuIHtcblx0XHRcdHJlc291cmNlOiB0aGlzLnJlc291cmNlLFxuXHRcdFx0dXBkYXRlOiAoKSA9PiB7IH0sXG5cdFx0XHRyZWZyZXNoOiBhc3luYyAoZnJhZ21lbnQ/OiBQdWxsUmVxdWVzdEZyYWdtZW50LCB0b2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4gPSBDYW5jZWxsYXRpb25Ub2tlbi5Ob25lKSA9PiB7XG5cdFx0XHRcdGlmIChkaXNwb3NlZCkge1xuXHRcdFx0XHRcdHRocm93IG5ldyBFcnJvcignc3Vic2NyaXB0aW9uIGRpc3Bvc2VkJyk7XG5cdFx0XHRcdH1cblx0XHRcdFx0aWYgKHRva2VuLmlzQ2FuY2VsbGF0aW9uUmVxdWVzdGVkKSB7XG5cdFx0XHRcdFx0dGhyb3cgbmV3IEVycm9yKCdjYW5jZWxsZWQnKTtcblx0XHRcdFx0fVxuXHRcdFx0XHRhd2FpdCByYWNlQ2FuY2VsbGF0aW9uRXJyb3IoUHJvbWlzZS5yZXNvbHZlKHRoaXMucmVmcmVzaEhhbmRsZXI/LihmcmFnbWVudCkpLCB0b2tlbik7XG5cdFx0XHR9LFxuXHRcdFx0ZGlzcG9zZTogKCkgPT4ge1xuXHRcdFx0XHRkaXNwb3NlZCA9IHRydWU7XG5cdFx0XHR9LFxuXHRcdH07XG5cdH1cblxuXHRpbnZhbGlkYXRlUHVsbFJlcXVlc3QoX3JlZjogUHVsbFJlcXVlc3RSZWYsIGZyYWdtZW50czogcmVhZG9ubHkgUHVsbFJlcXVlc3RGcmFnbWVudFtdKTogdm9pZCB7XG5cdFx0dGhpcy5pbnZhbGlkYXRpb25zLnB1c2goeyBmcmFnbWVudHMgfSk7XG5cdH1cblxuXHRjbGVhcigpOiB2b2lkIHsgfVxuXG5cdHNldFNuYXBzaG90KHNuYXBzaG90OiBQdWxsUmVxdWVzdFNuYXBzaG90KTogdm9pZCB7XG5cdFx0dGhpcy5zbmFwc2hvdC5zZXQoc25hcHNob3QsIHVuZGVmaW5lZCk7XG5cdH1cbn1cblxuc3VpdGUoJ1B1bGxSZXF1ZXN0TXV0YXRpb25TZXJ2aWNlJywgKCkgPT4ge1xuXHRjb25zdCBkaXNwb3NhYmxlcyA9IGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSgpO1xuXG5cdGFzeW5jIGZ1bmN0aW9uIHdpdGhTZXJ2ZXJzKFxuXHRcdGZuOiAoYXBpOiBQcm9ncmFtbWFibGVHaXRIdWJTZXJ2ZXIsIGRvd25sb2FkOiBQcm9ncmFtbWFibGVHaXRIdWJTZXJ2ZXIpID0+IFByb21pc2U8dm9pZD4sXG5cdCk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGNvbnN0IGFwaSA9IGF3YWl0IFByb2dyYW1tYWJsZUdpdEh1YlNlcnZlci5zdGFydCgpO1xuXHRcdGNvbnN0IGRvd25sb2FkID0gYXdhaXQgUHJvZ3JhbW1hYmxlR2l0SHViU2VydmVyLnN0YXJ0KCk7XG5cdFx0dHJ5IHtcblx0XHRcdGF3YWl0IGZuKGFwaSwgZG93bmxvYWQpO1xuXHRcdH0gZmluYWxseSB7XG5cdFx0XHRhd2FpdCBhcGkuZGlzcG9zZUFzeW5jKCk7XG5cdFx0XHRhd2FpdCBkb3dubG9hZC5kaXNwb3NlQXN5bmMoKTtcblx0XHR9XG5cdH1cblxuXHRmdW5jdGlvbiBzZXR1cChzZXJ2ZXI6IFByb2dyYW1tYWJsZUdpdEh1YlNlcnZlciwgc25hcHNob3QgPSBjb21wbGV0ZVNuYXBzaG90KHNlcnZlciksIHNjaGVkdWxlcj86IEZha2VHaXRIdWJTY2hlZHVsZXIpOiB7XG5cdFx0cmVhZG9ubHkgcmVmOiBQdWxsUmVxdWVzdFJlZjtcblx0XHRyZWFkb25seSByZXNvdXJjZXM6IFRlc3RSZXNvdXJjZVNlcnZpY2U7XG5cdFx0cmVhZG9ubHkgc2VydmljZTogUHVsbFJlcXVlc3RNdXRhdGlvblNlcnZpY2U7XG5cdH0ge1xuXHRcdGNvbnN0IGFjY291bnQgPSB7IGhvc3Q6IG5ldyBVUkwoc2VydmVyLmFwaUJhc2VVcmwpLmhvc3QsIGFjY291bnRJZDogJzEwMScgfTtcblx0XHRjb25zdCByZWYgPSB7IC4uLmFjY291bnQsIG93bmVyOiAnb2N0bycsIHJlcG86ICdyZXBvJywgbnVtYmVyOiA3IH07XG5cdFx0Y29uc3QgY3JlZGVudGlhbHMgPSBkaXNwb3NhYmxlcy5hZGQobmV3IFRlc3RDcmVkZW50aWFsU2VydmljZShhY2NvdW50KSk7XG5cdFx0Y29uc3QgdHJhbnNwb3J0ID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBHaXRIdWJUcmFuc3BvcnQobm9kZUZldGNoLCB1bmRlZmluZWQsIHRydWUpKTtcblx0XHRjb25zdCByZXNvdXJjZXMgPSBuZXcgVGVzdFJlc291cmNlU2VydmljZShyZWYsIHsgLi4uc25hcHNob3QsIHJlZiB9KTtcblx0XHRjb25zdCBzZXJ2aWNlID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBQdWxsUmVxdWVzdE11dGF0aW9uU2VydmljZShzY2hlZHVsZXIsIGNyZWRlbnRpYWxzLCB0cmFuc3BvcnQsIHJlc291cmNlcywgc2VydmVyLmNyZWF0ZUVuZHBvaW50U2VydmljZSgpKSk7XG5cdFx0cmV0dXJuIHsgcmVmLCByZXNvdXJjZXMsIHNlcnZpY2UgfTtcblx0fVxuXG5cdHRlc3QoJ3JlY29uY2lsZXMgYW4gYW1iaWd1b3VzIHRvcC1sZXZlbCBjb21tZW50IHdpdGhvdXQgZHVwbGljYXRpbmcgaXQnLCBhc3luYyAoKSA9PiB7XG5cdFx0YXdhaXQgd2l0aFNlcnZlcnMoYXN5bmMgc2VydmVyID0+IHtcblx0XHRcdHNlcnZlci5lbnF1ZXVlKGdpdEh1YlJlc3RTdGVwKHtcblx0XHRcdFx0bWV0aG9kOiAnUE9TVCcsXG5cdFx0XHRcdHBhdGg6ICcvcmVwb3Mvb2N0by9yZXBvL2lzc3Vlcy83L2NvbW1lbnRzJyxcblx0XHRcdFx0YXNzZXJ0OiByZXF1ZXN0ID0+IGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocmVxdWVzdC5ib2R5SnNvbiwgeyBib2R5OiBgaGVsbG9cXG5cXG4ke29wZXJhdGlvbk1hcmtlcn1gIH0pLFxuXHRcdFx0XHRyZXNwb25zZTogZ2l0SHViRGlzY29ubmVjdFJlc3BvbnNlKCksXG5cdFx0XHR9KSk7XG5cdFx0XHRjb25zdCB7IHJlZiwgcmVzb3VyY2VzLCBzZXJ2aWNlIH0gPSBzZXR1cChzZXJ2ZXIpO1xuXHRcdFx0cmVzb3VyY2VzLnJlZnJlc2hIYW5kbGVyID0gZnJhZ21lbnQgPT4ge1xuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZnJhZ21lbnQsICd0b3BMZXZlbENvbW1lbnRzJyk7XG5cdFx0XHRcdGNvbnN0IHNuYXBzaG90ID0gcmVzb3VyY2VzLnNuYXBzaG90LmdldCgpO1xuXHRcdFx0XHRyZXNvdXJjZXMuc2V0U25hcHNob3Qoe1xuXHRcdFx0XHRcdC4uLnNuYXBzaG90LFxuXHRcdFx0XHRcdHRvcExldmVsQ29tbWVudHM6IHtcblx0XHRcdFx0XHRcdHN0YXR1czogJ3JlYWR5Jyxcblx0XHRcdFx0XHRcdGNvbXBsZXRlOiB0cnVlLFxuXHRcdFx0XHRcdFx0dmFsdWU6IFt7IGlkOiAnMScsIGJvZHk6IGBoZWxsb1xcblxcbiR7b3BlcmF0aW9uTWFya2VyfWAgfV0sXG5cdFx0XHRcdFx0fSxcblx0XHRcdFx0fSk7XG5cblx0XHRcdH07XG5cblx0XHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IHNlcnZpY2UuYWRkQ29tbWVudChyZWYsIHsgb3BlcmF0aW9uSWQ6ICdvcGVyYXRpb24tMScsIGJvZHk6ICdoZWxsbycgfSwgc2lnbmFsKCkpO1xuXG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdFx0cmVzdWx0LFxuXHRcdFx0XHRyZXF1ZXN0Q291bnQ6IHNlcnZlci5yZXF1ZXN0cy5sZW5ndGgsXG5cdFx0XHR9LCB7XG5cdFx0XHRcdHJlc3VsdDoge1xuXHRcdFx0XHRcdG91dGNvbWU6ICdyZWNvbmNpbGVkJyxcblx0XHRcdFx0XHR2YWx1ZTogeyBpZDogJzEnLCBib2R5OiBgaGVsbG9cXG5cXG4ke29wZXJhdGlvbk1hcmtlcn1gIH0sXG5cdFx0XHRcdH0sXG5cdFx0XHRcdHJlcXVlc3RDb3VudDogMSxcblx0XHRcdH0pO1xuXHRcdFx0c2VydmVyLmFzc2VydFNhdGlzZmllZCgpO1xuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdjcmVhdGVzIHB1bGwgcmVxdWVzdHMgYW5kIGVuYWJsZXMgYXV0by1tZXJnZSB0aHJvdWdoIHR5cGVkIG9wZXJhdGlvbnMnLCBhc3luYyAoKSA9PiB7XG5cdFx0YXdhaXQgd2l0aFNlcnZlcnMoYXN5bmMgc2VydmVyID0+IHtcblx0XHRcdHNlcnZlci5lbnF1ZXVlKFxuXHRcdFx0XHRnaXRIdWJSZXN0U3RlcCh7XG5cdFx0XHRcdFx0bWV0aG9kOiAnUE9TVCcsXG5cdFx0XHRcdFx0cGF0aDogJy9yZXBvcy9vY3RvL3JlcG8vcHVsbHMnLFxuXHRcdFx0XHRcdGFzc2VydDogcmVxdWVzdCA9PiBhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHJlcXVlc3QuYm9keUpzb24sIHtcblx0XHRcdFx0XHRcdHRpdGxlOiAnUFInLFxuXHRcdFx0XHRcdFx0Ym9keTogJ0JvZHknLFxuXHRcdFx0XHRcdFx0aGVhZDogJ2ZlYXR1cmUnLFxuXHRcdFx0XHRcdFx0YmFzZTogJ21haW4nLFxuXHRcdFx0XHRcdFx0ZHJhZnQ6IHRydWUsXG5cdFx0XHRcdFx0fSksXG5cdFx0XHRcdFx0cmVzcG9uc2U6IGdpdEh1Ykpzb25SZXNwb25zZSh7XG5cdFx0XHRcdFx0XHRudW1iZXI6IDgsXG5cdFx0XHRcdFx0XHRub2RlX2lkOiAnUFI4Jyxcblx0XHRcdFx0XHRcdGh0bWxfdXJsOiAnaHR0cHM6Ly9leGFtcGxlLnRlc3QvcHVsbC84Jyxcblx0XHRcdFx0XHRcdGNyZWF0ZWRfYXQ6ICcyMDI2LTAxLTAxVDAwOjAwOjAwWicsXG5cdFx0XHRcdFx0fSksXG5cdFx0XHRcdH0pLFxuXHRcdFx0XHRnaXRIdWJHcmFwaFFMU3RlcCh7XG5cdFx0XHRcdFx0cXVlcnlJbmNsdWRlczogJ0FnZW50SG9zdEVuYWJsZVB1bGxSZXF1ZXN0QXV0b01lcmdlJyxcblx0XHRcdFx0XHRhc3NlcnQ6IHJlcXVlc3QgPT4gYXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChyZXF1ZXN0LmdyYXBoUWw/LnZhcmlhYmxlcywge1xuXHRcdFx0XHRcdFx0cHVsbFJlcXVlc3RJZDogJ1BSOCcsXG5cdFx0XHRcdFx0XHRtZXJnZU1ldGhvZDogJ1NRVUFTSCcsXG5cdFx0XHRcdFx0fSksXG5cdFx0XHRcdFx0cmVzcG9uc2U6IGdpdEh1YkdyYXBoUUxSZXNwb25zZSh7XG5cdFx0XHRcdFx0XHRlbmFibGVQdWxsUmVxdWVzdEF1dG9NZXJnZTogeyBwdWxsUmVxdWVzdDogeyBpZDogJ1BSOCcgfSB9LFxuXHRcdFx0XHRcdH0pLFxuXHRcdFx0XHR9KSxcblx0XHRcdCk7XG5cdFx0XHRjb25zdCB7IHJlZiwgc2VydmljZSB9ID0gc2V0dXAoc2VydmVyKTtcblxuXHRcdFx0Y29uc3QgY3JlYXRlZCA9IGF3YWl0IHNlcnZpY2UuY3JlYXRlUHVsbFJlcXVlc3QocmVmLCB7XG5cdFx0XHRcdHRpdGxlOiAnUFInLFxuXHRcdFx0XHRib2R5OiAnQm9keScsXG5cdFx0XHRcdGhlYWQ6ICdmZWF0dXJlJyxcblx0XHRcdFx0YmFzZTogJ21haW4nLFxuXHRcdFx0XHRkcmFmdDogdHJ1ZSxcblx0XHRcdH0sIHNpZ25hbCgpKTtcblx0XHRcdGF3YWl0IHNlcnZpY2UuZW5hYmxlQXV0b01lcmdlKHJlZiwgeyBwdWxsUmVxdWVzdElkOiAnUFI4JywgbWV0aG9kOiAnU1FVQVNIJyB9LCBzaWduYWwoKSk7XG5cblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoY3JlYXRlZCwge1xuXHRcdFx0XHRyZWY6IHsgLi4ucmVmLCBudW1iZXI6IDggfSxcblx0XHRcdFx0aWQ6ICdQUjgnLFxuXHRcdFx0XHR1cmw6ICdodHRwczovL2V4YW1wbGUudGVzdC9wdWxsLzgnLFxuXHRcdFx0XHRjcmVhdGVkQXQ6ICcyMDI2LTAxLTAxVDAwOjAwOjAwWicsXG5cdFx0XHR9KTtcblx0XHRcdHNlcnZlci5hc3NlcnRTYXRpc2ZpZWQoKTtcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgncmV0cmllcyBvbmx5IGFmdGVyIGEgY29tcGxldGUgcmVmcmVzaCBwcm92ZXMgYSBjb21tZW50IG1hcmtlciBhYnNlbnQnLCBhc3luYyAoKSA9PiB7XG5cdFx0YXdhaXQgd2l0aFNlcnZlcnMoYXN5bmMgc2VydmVyID0+IHtcblx0XHRcdHNlcnZlci5lbnF1ZXVlKFxuXHRcdFx0XHRnaXRIdWJSZXN0U3RlcCh7XG5cdFx0XHRcdFx0bWV0aG9kOiAnUE9TVCcsXG5cdFx0XHRcdFx0cGF0aDogJy9yZXBvcy9vY3RvL3JlcG8vaXNzdWVzLzcvY29tbWVudHMnLFxuXHRcdFx0XHRcdHJlc3BvbnNlOiBnaXRIdWJEaXNjb25uZWN0UmVzcG9uc2UoKSxcblx0XHRcdFx0fSksXG5cdFx0XHRcdGdpdEh1YlJlc3RTdGVwKHtcblx0XHRcdFx0XHRtZXRob2Q6ICdQT1NUJyxcblx0XHRcdFx0XHRwYXRoOiAnL3JlcG9zL29jdG8vcmVwby9pc3N1ZXMvNy9jb21tZW50cycsXG5cdFx0XHRcdFx0cmVzcG9uc2U6IGdpdEh1Ykpzb25SZXNwb25zZSh7IGlkOiAyLCBib2R5OiBgaGVsbG9cXG5cXG4ke29wZXJhdGlvbk1hcmtlcn1gIH0pLFxuXHRcdFx0XHR9KSxcblx0XHRcdCk7XG5cdFx0XHRjb25zdCB7IHJlZiwgcmVzb3VyY2VzLCBzZXJ2aWNlIH0gPSBzZXR1cChzZXJ2ZXIpO1xuXHRcdFx0cmVzb3VyY2VzLnJlZnJlc2hIYW5kbGVyID0gKCkgPT4ge1xuXHRcdFx0XHRjb25zdCBzbmFwc2hvdCA9IHJlc291cmNlcy5zbmFwc2hvdC5nZXQoKTtcblx0XHRcdFx0cmVzb3VyY2VzLnNldFNuYXBzaG90KHtcblx0XHRcdFx0XHQuLi5zbmFwc2hvdCxcblx0XHRcdFx0XHR0b3BMZXZlbENvbW1lbnRzOiB7IHN0YXR1czogJ3JlYWR5JywgY29tcGxldGU6IHRydWUsIHZhbHVlOiBbXSB9LFxuXHRcdFx0XHR9KTtcblx0XHRcdH07XG5cblx0XHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IHNlcnZpY2UuYWRkQ29tbWVudChyZWYsIHsgb3BlcmF0aW9uSWQ6ICdvcGVyYXRpb24tMScsIGJvZHk6ICdoZWxsbycgfSwgc2lnbmFsKCkpO1xuXG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHsgcmVzdWx0LCByZXF1ZXN0Q291bnQ6IHNlcnZlci5yZXF1ZXN0cy5sZW5ndGggfSwge1xuXHRcdFx0XHRyZXN1bHQ6IHtcblx0XHRcdFx0XHRvdXRjb21lOiAnc3VjY2VlZGVkJyxcblx0XHRcdFx0XHR2YWx1ZToge1xuXHRcdFx0XHRcdFx0aWQ6ICcyJyxcblx0XHRcdFx0XHRcdG5vZGVJZDogdW5kZWZpbmVkLFxuXHRcdFx0XHRcdFx0Ym9keTogYGhlbGxvXFxuXFxuJHtvcGVyYXRpb25NYXJrZXJ9YCxcblx0XHRcdFx0XHRcdHVybDogdW5kZWZpbmVkLFxuXHRcdFx0XHRcdFx0Y3JlYXRlZEF0OiB1bmRlZmluZWQsXG5cdFx0XHRcdFx0XHR1cGRhdGVkQXQ6IHVuZGVmaW5lZCxcblx0XHRcdFx0XHRcdGF1dGhvcjogdW5kZWZpbmVkLFxuXHRcdFx0XHRcdH0sXG5cdFx0XHRcdH0sXG5cdFx0XHRcdHJlcXVlc3RDb3VudDogMixcblx0XHRcdH0pO1xuXHRcdFx0c2VydmVyLmFzc2VydFNhdGlzZmllZCgpO1xuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdyZXR1cm5zIGluZGV0ZXJtaW5hdGUgd2hlbiBjb21tZW50IHJlY29uY2lsaWF0aW9uIHJlbWFpbnMgaW5jb21wbGV0ZScsIGFzeW5jICgpID0+IHtcblx0XHRhd2FpdCB3aXRoU2VydmVycyhhc3luYyBzZXJ2ZXIgPT4ge1xuXHRcdFx0c2VydmVyLmVucXVldWUoZ2l0SHViUmVzdFN0ZXAoe1xuXHRcdFx0XHRtZXRob2Q6ICdQT1NUJyxcblx0XHRcdFx0cGF0aDogJy9yZXBvcy9vY3RvL3JlcG8vaXNzdWVzLzcvY29tbWVudHMnLFxuXHRcdFx0XHRyZXNwb25zZTogZ2l0SHViRGlzY29ubmVjdFJlc3BvbnNlKCksXG5cdFx0XHR9KSk7XG5cdFx0XHRjb25zdCB7IHJlZiwgcmVzb3VyY2VzLCBzZXJ2aWNlIH0gPSBzZXR1cChzZXJ2ZXIpO1xuXHRcdFx0cmVzb3VyY2VzLnJlZnJlc2hIYW5kbGVyID0gKCkgPT4ge1xuXHRcdFx0XHRjb25zdCBzbmFwc2hvdCA9IHJlc291cmNlcy5zbmFwc2hvdC5nZXQoKTtcblx0XHRcdFx0cmVzb3VyY2VzLnNldFNuYXBzaG90KHtcblx0XHRcdFx0XHQuLi5zbmFwc2hvdCxcblx0XHRcdFx0XHR0b3BMZXZlbENvbW1lbnRzOiB7IHN0YXR1czogJ3JlYWR5JywgY29tcGxldGU6IGZhbHNlLCB2YWx1ZTogW10gfSxcblx0XHRcdFx0fSk7XG5cdFx0XHR9O1xuXG5cdFx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCBzZXJ2aWNlLmFkZENvbW1lbnQocmVmLCB7IG9wZXJhdGlvbklkOiAnb3BlcmF0aW9uLTEnLCBib2R5OiAnaGVsbG8nIH0sIHNpZ25hbCgpKTtcblxuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7IHJlc3VsdCwgcmVxdWVzdENvdW50OiBzZXJ2ZXIucmVxdWVzdHMubGVuZ3RoIH0sIHtcblx0XHRcdFx0cmVzdWx0OiB7IG91dGNvbWU6ICdpbmRldGVybWluYXRlJyB9LFxuXHRcdFx0XHRyZXF1ZXN0Q291bnQ6IDEsXG5cdFx0XHR9KTtcblx0XHRcdHNlcnZlci5hc3NlcnRTYXRpc2ZpZWQoKTtcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnbmV2ZXIgcmVzb2x2ZXMgYSByZXZpZXcgdGhyZWFkIHdoZW4gdGhlIHJlcGx5IGZhaWxzJywgYXN5bmMgKCkgPT4ge1xuXHRcdGF3YWl0IHdpdGhTZXJ2ZXJzKGFzeW5jIHNlcnZlciA9PiB7XG5cdFx0XHRzZXJ2ZXIuZW5xdWV1ZShnaXRIdWJHcmFwaFFMU3RlcCh7XG5cdFx0XHRcdHF1ZXJ5SW5jbHVkZXM6ICdBZ2VudEhvc3RBZGRQdWxsUmVxdWVzdFJldmlld1RocmVhZFJlcGx5Jyxcblx0XHRcdFx0cmVzcG9uc2U6IGdpdEh1YkdyYXBoUUxSZXNwb25zZSh1bmRlZmluZWQsIFt7IG1lc3NhZ2U6ICdyZXBseSByZWplY3RlZCcsIHR5cGU6ICdGT1JCSURERU4nIH1dKSxcblx0XHRcdH0pKTtcblx0XHRcdGNvbnN0IHsgcmVmLCBzZXJ2aWNlIH0gPSBzZXR1cChzZXJ2ZXIpO1xuXG5cdFx0XHRhd2FpdCBhc3NlcnQucmVqZWN0cyhcblx0XHRcdFx0KCkgPT4gc2VydmljZS5yZXBseUFuZFJlc29sdmVUaHJlYWQocmVmLCB7XG5cdFx0XHRcdFx0b3BlcmF0aW9uSWQ6ICdvcGVyYXRpb24tMScsXG5cdFx0XHRcdFx0dGhyZWFkSWQ6ICdUMScsXG5cdFx0XHRcdFx0Ym9keTogJ3JlcGx5Jyxcblx0XHRcdFx0XHRyZXNvbHZlOiB0cnVlLFxuXHRcdFx0XHR9LCBzaWduYWwoKSksXG5cdFx0XHRcdC9yZXBseSByZWplY3RlZC8sXG5cdFx0XHQpO1xuXG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2VydmVyLnJlcXVlc3RzLmxlbmd0aCwgMSk7XG5cdFx0XHRzZXJ2ZXIuYXNzZXJ0U2F0aXNmaWVkKCk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3Jlc29sdmVzIG9ubHkgYWZ0ZXIgYW4gYW1iaWd1b3VzIHJlcGx5IGlzIHJlY29uY2lsZWQgYXMgc3VjY2Vzc2Z1bCcsIGFzeW5jICgpID0+IHtcblx0XHRhd2FpdCB3aXRoU2VydmVycyhhc3luYyBzZXJ2ZXIgPT4ge1xuXHRcdFx0c2VydmVyLmVucXVldWUoXG5cdFx0XHRcdGdpdEh1YkdyYXBoUUxTdGVwKHtcblx0XHRcdFx0XHRxdWVyeUluY2x1ZGVzOiAnQWdlbnRIb3N0QWRkUHVsbFJlcXVlc3RSZXZpZXdUaHJlYWRSZXBseScsXG5cdFx0XHRcdFx0cmVzcG9uc2U6IGdpdEh1YkRpc2Nvbm5lY3RSZXNwb25zZSgpLFxuXHRcdFx0XHR9KSxcblx0XHRcdFx0Z2l0SHViR3JhcGhRTFN0ZXAoe1xuXHRcdFx0XHRcdHF1ZXJ5SW5jbHVkZXM6ICdBZ2VudEhvc3RSZXNvbHZlUHVsbFJlcXVlc3RSZXZpZXdUaHJlYWQnLFxuXHRcdFx0XHRcdHJlc3BvbnNlOiBnaXRIdWJHcmFwaFFMUmVzcG9uc2Uoe1xuXHRcdFx0XHRcdFx0cmVzb2x2ZVJldmlld1RocmVhZDogeyB0aHJlYWQ6IHsgaWQ6ICdUMScsIGlzUmVzb2x2ZWQ6IHRydWUgfSB9LFxuXHRcdFx0XHRcdH0pLFxuXHRcdFx0XHR9KSxcblx0XHRcdCk7XG5cdFx0XHRjb25zdCB7IHJlZiwgcmVzb3VyY2VzLCBzZXJ2aWNlIH0gPSBzZXR1cChzZXJ2ZXIpO1xuXHRcdFx0cmVzb3VyY2VzLnJlZnJlc2hIYW5kbGVyID0gKCkgPT4ge1xuXHRcdFx0XHRjb25zdCBzbmFwc2hvdCA9IHJlc291cmNlcy5zbmFwc2hvdC5nZXQoKTtcblx0XHRcdFx0cmVzb3VyY2VzLnNldFNuYXBzaG90KHtcblx0XHRcdFx0XHQuLi5zbmFwc2hvdCxcblx0XHRcdFx0XHRyZXZpZXdUaHJlYWRzOiB7XG5cdFx0XHRcdFx0XHRzdGF0dXM6ICdyZWFkeScsXG5cdFx0XHRcdFx0XHRjb21wbGV0ZTogdHJ1ZSxcblx0XHRcdFx0XHRcdGhlYWRTaGE6ICdoZWFkLTEnLFxuXHRcdFx0XHRcdFx0dmFsdWU6IFt7XG5cdFx0XHRcdFx0XHRcdGlkOiAnVDEnLFxuXHRcdFx0XHRcdFx0XHRpc1Jlc29sdmVkOiBmYWxzZSxcblx0XHRcdFx0XHRcdFx0Y29tbWVudHM6IFt7IGlkOiAnMicsIGJvZHk6IGByZXBseVxcblxcbiR7b3BlcmF0aW9uTWFya2VyfWAgfV0sXG5cdFx0XHRcdFx0XHR9XSxcblx0XHRcdFx0XHR9LFxuXHRcdFx0XHR9KTtcblx0XHRcdH07XG5cblx0XHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IHNlcnZpY2UucmVwbHlBbmRSZXNvbHZlVGhyZWFkKHJlZiwge1xuXHRcdFx0XHRvcGVyYXRpb25JZDogJ29wZXJhdGlvbi0xJyxcblx0XHRcdFx0dGhyZWFkSWQ6ICdUMScsXG5cdFx0XHRcdGJvZHk6ICdyZXBseScsXG5cdFx0XHRcdHJlc29sdmU6IHRydWUsXG5cdFx0XHR9LCBzaWduYWwoKSk7XG5cblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0XHRyZXN1bHQsXG5cdFx0XHRcdG9wZXJhdGlvbnM6IHNlcnZlci5yZXF1ZXN0cy5tYXAocmVxdWVzdCA9PiAoe1xuXHRcdFx0XHRcdHJlcGx5OiByZXF1ZXN0LmdyYXBoUWw/LnF1ZXJ5Py5pbmNsdWRlcygnQWdlbnRIb3N0QWRkUHVsbFJlcXVlc3RSZXZpZXdUaHJlYWRSZXBseScpLFxuXHRcdFx0XHRcdHJlc29sdmU6IHJlcXVlc3QuZ3JhcGhRbD8ucXVlcnk/LmluY2x1ZGVzKCdBZ2VudEhvc3RSZXNvbHZlUHVsbFJlcXVlc3RSZXZpZXdUaHJlYWQnKSxcblx0XHRcdFx0fSkpLFxuXHRcdFx0XHRpbnZhbGlkYXRpb25zOiByZXNvdXJjZXMuaW52YWxpZGF0aW9ucyxcblx0XHRcdH0sIHtcblx0XHRcdFx0cmVzdWx0OiB7XG5cdFx0XHRcdFx0cmVwbHk6IHsgb3V0Y29tZTogJ3JlY29uY2lsZWQnLCB2YWx1ZTogeyBpZDogJzInLCBib2R5OiBgcmVwbHlcXG5cXG4ke29wZXJhdGlvbk1hcmtlcn1gIH0gfSxcblx0XHRcdFx0XHRyZXNvbHZlZDogdHJ1ZSxcblx0XHRcdFx0fSxcblx0XHRcdFx0b3BlcmF0aW9uczogW1xuXHRcdFx0XHRcdHsgcmVwbHk6IHRydWUsIHJlc29sdmU6IGZhbHNlIH0sXG5cdFx0XHRcdFx0eyByZXBseTogZmFsc2UsIHJlc29sdmU6IHRydWUgfSxcblx0XHRcdFx0XSxcblx0XHRcdFx0aW52YWxpZGF0aW9uczogW1xuXHRcdFx0XHRcdHsgZnJhZ21lbnRzOiBbJ2lubGluZUNvbW1lbnRzJ10gfSxcblx0XHRcdFx0XHR7IGZyYWdtZW50czogWydyZXZpZXdUaHJlYWRzJ10gfSxcblx0XHRcdFx0XSxcblx0XHRcdH0pO1xuXHRcdFx0c2VydmVyLmFzc2VydFNhdGlzZmllZCgpO1xuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdsZWF2ZXMgYSByZXZpZXcgdGhyZWFkIG9wZW4gd2hlbiByZXNvbHV0aW9uIGZhaWxzJywgYXN5bmMgKCkgPT4ge1xuXHRcdGF3YWl0IHdpdGhTZXJ2ZXJzKGFzeW5jIHNlcnZlciA9PiB7XG5cdFx0XHRzZXJ2ZXIuZW5xdWV1ZShcblx0XHRcdFx0Z2l0SHViR3JhcGhRTFN0ZXAoe1xuXHRcdFx0XHRcdHF1ZXJ5SW5jbHVkZXM6ICdBZ2VudEhvc3RBZGRQdWxsUmVxdWVzdFJldmlld1RocmVhZFJlcGx5Jyxcblx0XHRcdFx0XHRyZXNwb25zZTogZ2l0SHViR3JhcGhRTFJlc3BvbnNlKHtcblx0XHRcdFx0XHRcdGFkZFB1bGxSZXF1ZXN0UmV2aWV3VGhyZWFkUmVwbHk6IHtcblx0XHRcdFx0XHRcdFx0Y29tbWVudDogeyBpZDogJ0MyJywgZGF0YWJhc2VJZDogMiwgYm9keTogYHJlcGx5XFxuXFxuJHtvcGVyYXRpb25NYXJrZXJ9YCB9LFxuXHRcdFx0XHRcdFx0fSxcblx0XHRcdFx0XHR9KSxcblx0XHRcdFx0fSksXG5cdFx0XHRcdGdpdEh1YkdyYXBoUUxTdGVwKHtcblx0XHRcdFx0XHRxdWVyeUluY2x1ZGVzOiAnQWdlbnRIb3N0UmVzb2x2ZVB1bGxSZXF1ZXN0UmV2aWV3VGhyZWFkJyxcblx0XHRcdFx0XHRyZXNwb25zZTogZ2l0SHViR3JhcGhRTFJlc3BvbnNlKHVuZGVmaW5lZCwgW3sgbWVzc2FnZTogJ3Jlc29sdmUgcmVqZWN0ZWQnLCB0eXBlOiAnRk9SQklEREVOJyB9XSksXG5cdFx0XHRcdH0pLFxuXHRcdFx0XHRnaXRIdWJHcmFwaFFMU3RlcCh7XG5cdFx0XHRcdFx0cXVlcnlJbmNsdWRlczogJ0FnZW50SG9zdFJlc29sdmVQdWxsUmVxdWVzdFJldmlld1RocmVhZCcsXG5cdFx0XHRcdFx0cmVzcG9uc2U6IGdpdEh1YkdyYXBoUUxSZXNwb25zZSh7XG5cdFx0XHRcdFx0XHRyZXNvbHZlUmV2aWV3VGhyZWFkOiB7IHRocmVhZDogeyBpZDogJ1QxJywgaXNSZXNvbHZlZDogdHJ1ZSB9IH0sXG5cdFx0XHRcdFx0fSksXG5cdFx0XHRcdH0pLFxuXHRcdFx0KTtcblx0XHRcdGNvbnN0IHNuYXBzaG90ID0gY29tcGxldGVTbmFwc2hvdChzZXJ2ZXIpO1xuXHRcdFx0Y29uc3QgeyByZWYsIHJlc291cmNlcywgc2VydmljZSB9ID0gc2V0dXAoc2VydmVyLCB7XG5cdFx0XHRcdC4uLnNuYXBzaG90LFxuXHRcdFx0XHRyZXZpZXdUaHJlYWRzOiB7XG5cdFx0XHRcdFx0c3RhdHVzOiAncmVhZHknLFxuXHRcdFx0XHRcdGNvbXBsZXRlOiB0cnVlLFxuXHRcdFx0XHRcdGhlYWRTaGE6ICdoZWFkLTEnLFxuXHRcdFx0XHRcdHZhbHVlOiBbeyBpZDogJ1QxJywgaXNSZXNvbHZlZDogZmFsc2UsIGNvbW1lbnRzOiBbXSB9XSxcblx0XHRcdFx0fSxcblx0XHRcdH0pO1xuXG5cdFx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCBzZXJ2aWNlLnJlcGx5QW5kUmVzb2x2ZVRocmVhZChyZWYsIHtcblx0XHRcdFx0b3BlcmF0aW9uSWQ6ICdvcGVyYXRpb24tMScsXG5cdFx0XHRcdHRocmVhZElkOiAnVDEnLFxuXHRcdFx0XHRib2R5OiAncmVwbHknLFxuXHRcdFx0XHRyZXNvbHZlOiB0cnVlLFxuXHRcdFx0fSwgc2lnbmFsKCkpO1xuXG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdFx0cmVzdWx0LFxuXHRcdFx0XHR0aHJlYWRPcGVuOiByZXNvdXJjZXMuc25hcHNob3QuZ2V0KCkucmV2aWV3VGhyZWFkcy52YWx1ZT8uWzBdLmlzUmVzb2x2ZWQgPT09IGZhbHNlLFxuXHRcdFx0XHRpbnZhbGlkYXRpb25zOiByZXNvdXJjZXMuaW52YWxpZGF0aW9ucyxcblx0XHRcdH0sIHtcblx0XHRcdFx0cmVzdWx0OiB7XG5cdFx0XHRcdFx0cmVwbHk6IHtcblx0XHRcdFx0XHRcdG91dGNvbWU6ICdzdWNjZWVkZWQnLFxuXHRcdFx0XHRcdFx0dmFsdWU6IHtcblx0XHRcdFx0XHRcdFx0aWQ6ICcyJyxcblx0XHRcdFx0XHRcdFx0bm9kZUlkOiAnQzInLFxuXHRcdFx0XHRcdFx0XHRib2R5OiBgcmVwbHlcXG5cXG4ke29wZXJhdGlvbk1hcmtlcn1gLFxuXHRcdFx0XHRcdFx0XHR1cmw6IHVuZGVmaW5lZCxcblx0XHRcdFx0XHRcdFx0Y3JlYXRlZEF0OiB1bmRlZmluZWQsXG5cdFx0XHRcdFx0XHRcdHVwZGF0ZWRBdDogdW5kZWZpbmVkLFxuXHRcdFx0XHRcdFx0XHRhdXRob3I6IHVuZGVmaW5lZCxcblx0XHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0fSxcblx0XHRcdFx0XHRyZXNvbHZlZDogZmFsc2UsXG5cdFx0XHRcdFx0cmVzb2x2ZUVycm9yOiB7XG5cdFx0XHRcdFx0XHRtZXNzYWdlOiAnR2l0SHViIEdyYXBoUUwgbXV0YXRpb24gZmFpbGVkOiByZXNvbHZlIHJlamVjdGVkJyxcblx0XHRcdFx0XHRcdGtpbmQ6ICdhdXRob3JpemF0aW9uJyxcblx0XHRcdFx0XHRcdHN0YXR1c0NvZGU6IDIwMCxcblx0XHRcdFx0XHR9LFxuXHRcdFx0XHR9LFxuXHRcdFx0XHR0aHJlYWRPcGVuOiB0cnVlLFxuXHRcdFx0XHRpbnZhbGlkYXRpb25zOiBbeyBmcmFnbWVudHM6IFsncmV2aWV3VGhyZWFkcycsICdpbmxpbmVDb21tZW50cyddIH1dLFxuXHRcdFx0fSk7XG5cdFx0XHRhd2FpdCBzZXJ2aWNlLnJlc29sdmVUaHJlYWQocmVmLCAnVDEnLCBzaWduYWwoKSk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHNlcnZlci5yZXF1ZXN0cy5tYXAocmVxdWVzdCA9PiByZXF1ZXN0LmdyYXBoUWw/LnF1ZXJ5Py5pbmNsdWRlcygnQWdlbnRIb3N0QWRkUHVsbFJlcXVlc3RSZXZpZXdUaHJlYWRSZXBseScpKSwgW1xuXHRcdFx0XHR0cnVlLFxuXHRcdFx0XHRmYWxzZSxcblx0XHRcdFx0ZmFsc2UsXG5cdFx0XHRdKTtcblx0XHRcdHNlcnZlci5hc3NlcnRTYXRpc2ZpZWQoKTtcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnZG9lcyBub3QgcmVjb25jaWxlIG9yIHJldHJ5IGRldGVybWluaXN0aWMgR3JhcGhRTCBtdXRhdGlvbiBlcnJvcnMnLCBhc3luYyAoKSA9PiB7XG5cdFx0YXdhaXQgd2l0aFNlcnZlcnMoYXN5bmMgc2VydmVyID0+IHtcblx0XHRcdHNlcnZlci5lbnF1ZXVlKGdpdEh1YkdyYXBoUUxTdGVwKHtcblx0XHRcdFx0cXVlcnlJbmNsdWRlczogJ0FnZW50SG9zdEFkZFB1bGxSZXF1ZXN0UmV2aWV3VGhyZWFkUmVwbHknLFxuXHRcdFx0XHRyZXNwb25zZTogZ2l0SHViR3JhcGhRTFJlc3BvbnNlKHVuZGVmaW5lZCwgW3sgbWVzc2FnZTogJ3RocmVhZCBtaXNzaW5nJywgdHlwZTogJ05PVF9GT1VORCcgfV0pLFxuXHRcdFx0fSkpO1xuXHRcdFx0Y29uc3QgeyByZWYsIHJlc291cmNlcywgc2VydmljZSB9ID0gc2V0dXAoc2VydmVyKTtcblx0XHRcdGxldCByZWZyZXNoQ291bnQgPSAwO1xuXHRcdFx0cmVzb3VyY2VzLnJlZnJlc2hIYW5kbGVyID0gKCkgPT4ge1xuXHRcdFx0XHRyZWZyZXNoQ291bnQrKztcblx0XHRcdH07XG5cblx0XHRcdGF3YWl0IGFzc2VydC5yZWplY3RzKFxuXHRcdFx0XHQoKSA9PiBzZXJ2aWNlLnJlcGx5VG9UaHJlYWQocmVmLCB7XG5cdFx0XHRcdFx0b3BlcmF0aW9uSWQ6ICdvcGVyYXRpb24tMScsXG5cdFx0XHRcdFx0dGhyZWFkSWQ6ICdUMScsXG5cdFx0XHRcdFx0Ym9keTogJ3JlcGx5Jyxcblx0XHRcdFx0fSwgc2lnbmFsKCkpLFxuXHRcdFx0XHRlcnJvciA9PiBlcnJvciBpbnN0YW5jZW9mIEVycm9yICYmIGVycm9yLm1lc3NhZ2UuaW5jbHVkZXMoJ3RocmVhZCBtaXNzaW5nJyksXG5cdFx0XHQpO1xuXG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHsgcmVxdWVzdENvdW50OiBzZXJ2ZXIucmVxdWVzdHMubGVuZ3RoLCByZWZyZXNoQ291bnQgfSwge1xuXHRcdFx0XHRyZXF1ZXN0Q291bnQ6IDEsXG5cdFx0XHRcdHJlZnJlc2hDb3VudDogMCxcblx0XHRcdH0pO1xuXHRcdFx0c2VydmVyLmFzc2VydFNhdGlzZmllZCgpO1xuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdkb2VzIG5vdCBkdXBsaWNhdGUgYW4gdW5jb25maXJtZWQgd29ya2Zsb3cgcmVydW4nLCBhc3luYyAoKSA9PiB7XG5cdFx0YXdhaXQgd2l0aFNlcnZlcnMoYXN5bmMgc2VydmVyID0+IHtcblx0XHRcdHNlcnZlci5lbnF1ZXVlKFxuXHRcdFx0XHRnaXRIdWJSZXN0U3RlcCh7XG5cdFx0XHRcdFx0bWV0aG9kOiAnUE9TVCcsXG5cdFx0XHRcdFx0cGF0aDogJy9yZXBvcy9vY3RvL3JlcG8vYWN0aW9ucy9ydW5zLzEwL3JlcnVuLWZhaWxlZC1qb2JzJyxcblx0XHRcdFx0XHRyZXNwb25zZTogZ2l0SHViRGlzY29ubmVjdFJlc3BvbnNlKCksXG5cdFx0XHRcdH0pLFxuXHRcdFx0XHRnaXRIdWJSZXN0U3RlcCh7XG5cdFx0XHRcdFx0bWV0aG9kOiAnR0VUJyxcblx0XHRcdFx0XHRwYXRoOiAnL3JlcG9zL29jdG8vcmVwby9hY3Rpb25zL3J1bnMvMTAnLFxuXHRcdFx0XHRcdHJlc3BvbnNlOiBnaXRIdWJKc29uUmVzcG9uc2Uod29ya2Zsb3dSdW4oMTAsIDEsICdjb21wbGV0ZWQnKSksXG5cdFx0XHRcdH0pLFxuXHRcdFx0XHRnaXRIdWJSZXN0U3RlcCh7XG5cdFx0XHRcdFx0bWV0aG9kOiAnR0VUJyxcblx0XHRcdFx0XHRwYXRoOiAnL3JlcG9zL29jdG8vcmVwby9hY3Rpb25zL3J1bnMvMTAnLFxuXHRcdFx0XHRcdHJlc3BvbnNlOiBnaXRIdWJKc29uUmVzcG9uc2Uod29ya2Zsb3dSdW4oMTAsIDEsICdjb21wbGV0ZWQnKSksXG5cdFx0XHRcdH0pLFxuXHRcdFx0XHRnaXRIdWJSZXN0U3RlcCh7XG5cdFx0XHRcdFx0bWV0aG9kOiAnUE9TVCcsXG5cdFx0XHRcdFx0cGF0aDogJy9yZXBvcy9vY3RvL3JlcG8vYWN0aW9ucy9ydW5zLzEwL3JlcnVuLWZhaWxlZC1qb2JzJyxcblx0XHRcdFx0XHRyZXNwb25zZTogZ2l0SHViSnNvblJlc3BvbnNlKHt9LCB7IHN0YXR1czogMjAxIH0pLFxuXHRcdFx0XHR9KSxcblx0XHRcdCk7XG5cdFx0XHRjb25zdCB7IHJlZiwgc2VydmljZSB9ID0gc2V0dXAoc2VydmVyKTtcblx0XHRcdGNvbnN0IG9wdGlvbnMgPSB7XG5cdFx0XHRcdG9wZXJhdGlvbklkOiAnb3BlcmF0aW9uLTEnLFxuXHRcdFx0XHRydW5JZDogJzEwJyxcblx0XHRcdFx0ZXhwZWN0ZWRSdW5BdHRlbXB0OiAxLFxuXHRcdFx0XHRmYWlsZWRKb2JzT25seTogdHJ1ZSxcblx0XHRcdH07XG5cblx0XHRcdGNvbnN0IGZpcnN0ID0gYXdhaXQgc2VydmljZS5yZXJ1bldvcmtmbG93KHJlZiwgb3B0aW9ucywgc2lnbmFsKCkpO1xuXHRcdFx0Y29uc3Qgc2Vjb25kID0gYXdhaXQgc2VydmljZS5yZXJ1bldvcmtmbG93KHJlZiwgb3B0aW9ucywgc2lnbmFsKCkpO1xuXG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdFx0Zmlyc3QsXG5cdFx0XHRcdHNlY29uZCxcblx0XHRcdFx0bWV0aG9kczogc2VydmVyLnJlcXVlc3RzLm1hcChyZXF1ZXN0ID0+IHJlcXVlc3QubWV0aG9kKSxcblx0XHRcdH0sIHtcblx0XHRcdFx0Zmlyc3Q6IHsgb3V0Y29tZTogJ2luZGV0ZXJtaW5hdGUnLCB2YWx1ZTogd29ya2Zsb3dSdW5Ob3JtYWxpemVkKCcxMCcsIDEsICdDT01QTEVURUQnKSB9LFxuXHRcdFx0XHRzZWNvbmQ6IHsgb3V0Y29tZTogJ3N1Y2NlZWRlZCcgfSxcblx0XHRcdFx0bWV0aG9kczogWydQT1NUJywgJ0dFVCcsICdHRVQnLCAnUE9TVCddLFxuXHRcdFx0fSk7XG5cdFx0XHRzZXJ2ZXIuYXNzZXJ0U2F0aXNmaWVkKCk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3BhZ2luYXRlcyB3b3JrZmxvdyBkaWFnbm9zdGljcyBhbmQgc3RyaXBzIGNyZWRlbnRpYWxzIGZyb20gcmVkYWN0ZWQgbG9nIHJlZGlyZWN0cycsIGFzeW5jICgpID0+IHtcblx0XHRhd2FpdCB3aXRoU2VydmVycyhhc3luYyAoc2VydmVyLCBkb3dubG9hZCkgPT4ge1xuXHRcdFx0c2VydmVyLmVucXVldWUoXG5cdFx0XHRcdGdpdEh1YlJlc3RTdGVwKHtcblx0XHRcdFx0XHRtZXRob2Q6ICdHRVQnLFxuXHRcdFx0XHRcdHBhdGg6ICcvcmVwb3Mvb2N0by9yZXBvL2FjdGlvbnMvcnVucycsXG5cdFx0XHRcdFx0cXVlcnk6IHsgaGVhZF9zaGE6ICdoZWFkLTEnLCBwZXJfcGFnZTogMTAwIH0sXG5cdFx0XHRcdFx0cmVzcG9uc2U6IGdpdEh1Ykpzb25SZXNwb25zZSh7IHdvcmtmbG93X3J1bnM6IFt3b3JrZmxvd1J1bigxMCwgMSwgJ2NvbXBsZXRlZCcpXSB9LCB7XG5cdFx0XHRcdFx0XHRsaW5rOiBgPCR7c2VydmVyLmFwaUJhc2VVcmx9L3JlcG9zL29jdG8vcmVwby9hY3Rpb25zL3J1bnM/aGVhZF9zaGE9aGVhZC0xJnBlcl9wYWdlPTEwMCZwYWdlPTI+OyByZWw9XCJuZXh0XCJgLFxuXHRcdFx0XHRcdH0pLFxuXHRcdFx0XHR9KSxcblx0XHRcdFx0Z2l0SHViUmVzdFN0ZXAoe1xuXHRcdFx0XHRcdG1ldGhvZDogJ0dFVCcsXG5cdFx0XHRcdFx0cGF0aDogJy9yZXBvcy9vY3RvL3JlcG8vYWN0aW9ucy9ydW5zJyxcblx0XHRcdFx0XHRxdWVyeTogeyBoZWFkX3NoYTogJ2hlYWQtMScsIHBlcl9wYWdlOiAxMDAsIHBhZ2U6IDIgfSxcblx0XHRcdFx0XHRyZXNwb25zZTogZ2l0SHViSnNvblJlc3BvbnNlKHsgd29ya2Zsb3dfcnVuczogW3dvcmtmbG93UnVuKDExLCAxLCAncXVldWVkJyldIH0pLFxuXHRcdFx0XHR9KSxcblx0XHRcdFx0Z2l0SHViUmVzdFN0ZXAoe1xuXHRcdFx0XHRcdG1ldGhvZDogJ0dFVCcsXG5cdFx0XHRcdFx0cGF0aDogJy9yZXBvcy9vY3RvL3JlcG8vYWN0aW9ucy9ydW5zLzEwL2pvYnMnLFxuXHRcdFx0XHRcdHF1ZXJ5OiB7IHBlcl9wYWdlOiAxMDAgfSxcblx0XHRcdFx0XHRyZXNwb25zZTogZ2l0SHViSnNvblJlc3BvbnNlKHsgam9iczogW3sgaWQ6IDIwLCBuYW1lOiAndGVzdCcsIHN0YXR1czogJ2NvbXBsZXRlZCcsIGNvbmNsdXNpb246ICdmYWlsdXJlJywgY2hlY2tfcnVuX2lkOiAzMCB9XSB9KSxcblx0XHRcdFx0fSksXG5cdFx0XHRcdGdpdEh1YlJlc3RTdGVwKHtcblx0XHRcdFx0XHRtZXRob2Q6ICdHRVQnLFxuXHRcdFx0XHRcdHBhdGg6ICcvcmVwb3Mvb2N0by9yZXBvL2NoZWNrLXJ1bnMvMzAvYW5ub3RhdGlvbnMnLFxuXHRcdFx0XHRcdHF1ZXJ5OiB7IHBlcl9wYWdlOiAxMDAgfSxcblx0XHRcdFx0XHRyZXNwb25zZTogZ2l0SHViSnNvblJlc3BvbnNlKFt7IHBhdGg6ICdzcmMvYS50cycsIHN0YXJ0X2xpbmU6IDIsIGVuZF9saW5lOiAzLCBhbm5vdGF0aW9uX2xldmVsOiAnZmFpbHVyZScsIG1lc3NhZ2U6ICdiYWQnIH1dKSxcblx0XHRcdFx0fSksXG5cdFx0XHRcdGdpdEh1YlJlc3RTdGVwKHtcblx0XHRcdFx0XHRtZXRob2Q6ICdHRVQnLFxuXHRcdFx0XHRcdHBhdGg6ICcvcmVwb3Mvb2N0by9yZXBvL2FjdGlvbnMvam9icy8yMC9sb2dzJyxcblx0XHRcdFx0XHRyZXNwb25zZTogZ2l0SHViUmVkaXJlY3RSZXNwb25zZShgJHtkb3dubG9hZC5hcGlCYXNlVXJsfS9zaWduZWQvbG9nYCksXG5cdFx0XHRcdH0pLFxuXHRcdFx0KTtcblx0XHRcdGRvd25sb2FkLmVucXVldWUoZ2l0SHViUmVzdFN0ZXAoe1xuXHRcdFx0XHRtZXRob2Q6ICdHRVQnLFxuXHRcdFx0XHRwYXRoOiAnL3NpZ25lZC9sb2cnLFxuXHRcdFx0XHRhc3NlcnQ6IHJlcXVlc3QgPT4gYXNzZXJ0LnN0cmljdEVxdWFsKHJlcXVlc3QuaGVhZGVycy5hdXRob3JpemF0aW9uLCB1bmRlZmluZWQpLFxuXHRcdFx0XHRyZXNwb25zZTogZ2l0SHViUmF3UmVzcG9uc2UoJzo6YWRkLW1hc2s6OnN1cGVyc2VjcmV0XFxuc3VwZXJzZWNyZXRcXG50b2tlbj12aXNpYmxlXFxuZ2hwXzEyMzQ1Njc4OTAxMjM0NTYnKSxcblx0XHRcdH0pKTtcblx0XHRcdGNvbnN0IHsgcmVmLCBzZXJ2aWNlIH0gPSBzZXR1cChzZXJ2ZXIpO1xuXG5cdFx0XHRjb25zdCBydW5zID0gYXdhaXQgc2VydmljZS5saXN0V29ya2Zsb3dSdW5zKHJlZiwgJ2hlYWQtMScsIHNpZ25hbCgpKTtcblx0XHRcdGNvbnN0IGpvYnMgPSBhd2FpdCBzZXJ2aWNlLmxpc3RXb3JrZmxvd0pvYnMocmVmLCAnMTAnLCBzaWduYWwoKSk7XG5cdFx0XHRjb25zdCBhbm5vdGF0aW9ucyA9IGF3YWl0IHNlcnZpY2UubGlzdENoZWNrQW5ub3RhdGlvbnMocmVmLCAnMzAnLCBzaWduYWwoKSk7XG5cdFx0XHRjb25zdCBsb2cgPSBhd2FpdCBzZXJ2aWNlLmRvd25sb2FkV29ya2Zsb3dKb2JMb2cocmVmLCAnMjAnLCBzaWduYWwoKSk7XG5cblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0XHRydW5zOiBydW5zLm1hcChydW4gPT4gKHsgaWQ6IHJ1bi5pZCwgc3RhdHVzOiBydW4uc3RhdHVzIH0pKSxcblx0XHRcdFx0am9icyxcblx0XHRcdFx0YW5ub3RhdGlvbnMsXG5cdFx0XHRcdGxvZyxcblx0XHRcdH0sIHtcblx0XHRcdFx0cnVuczogW3sgaWQ6ICcxMCcsIHN0YXR1czogJ0NPTVBMRVRFRCcgfSwgeyBpZDogJzExJywgc3RhdHVzOiAnUVVFVUVEJyB9XSxcblx0XHRcdFx0am9iczogW3tcblx0XHRcdFx0XHRpZDogJzIwJyxcblx0XHRcdFx0XHRydW5JZDogJzEwJyxcblx0XHRcdFx0XHRuYW1lOiAndGVzdCcsXG5cdFx0XHRcdFx0c3RhdHVzOiAnQ09NUExFVEVEJyxcblx0XHRcdFx0XHRjb25jbHVzaW9uOiAnRkFJTFVSRScsXG5cdFx0XHRcdFx0Y2hlY2tSdW5JZDogJzMwJyxcblx0XHRcdFx0XHR1cmw6IHVuZGVmaW5lZCxcblx0XHRcdFx0XHRzdGFydGVkQXQ6IHVuZGVmaW5lZCxcblx0XHRcdFx0XHRjb21wbGV0ZWRBdDogdW5kZWZpbmVkLFxuXHRcdFx0XHR9XSxcblx0XHRcdFx0YW5ub3RhdGlvbnM6IFt7XG5cdFx0XHRcdFx0cGF0aDogJ3NyYy9hLnRzJyxcblx0XHRcdFx0XHRzdGFydExpbmU6IDIsXG5cdFx0XHRcdFx0ZW5kTGluZTogMyxcblx0XHRcdFx0XHRsZXZlbDogJ2ZhaWx1cmUnLFxuXHRcdFx0XHRcdG1lc3NhZ2U6ICdiYWQnLFxuXHRcdFx0XHRcdHRpdGxlOiB1bmRlZmluZWQsXG5cdFx0XHRcdFx0cmF3RGV0YWlsczogdW5kZWZpbmVkLFxuXHRcdFx0XHR9XSxcblx0XHRcdFx0bG9nOiB7XG5cdFx0XHRcdFx0dGV4dDogJzo6YWRkLW1hc2s6OioqKlxcbioqKlxcbnRva2VuPSoqKlxcbioqKicsXG5cdFx0XHRcdFx0dHJ1bmNhdGVkOiBmYWxzZSxcblx0XHRcdFx0fSxcblx0XHRcdH0pO1xuXHRcdFx0c2VydmVyLmFzc2VydFNhdGlzZmllZCgpO1xuXHRcdFx0ZG93bmxvYWQuYXNzZXJ0U2F0aXNmaWVkKCk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3NlbmRzIHRoZSBleHBlY3RlZCBoZWFkIHdoZW4gdXBkYXRpbmcgYSBicmFuY2gnLCBhc3luYyAoKSA9PiB7XG5cdFx0YXdhaXQgd2l0aFNlcnZlcnMoYXN5bmMgc2VydmVyID0+IHtcblx0XHRcdHNlcnZlci5lbnF1ZXVlKGdpdEh1YlJlc3RTdGVwKHtcblx0XHRcdFx0bWV0aG9kOiAnUFVUJyxcblx0XHRcdFx0cGF0aDogJy9yZXBvcy9vY3RvL3JlcG8vcHVsbHMvNy91cGRhdGUtYnJhbmNoJyxcblx0XHRcdFx0YXNzZXJ0OiByZXF1ZXN0ID0+IGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocmVxdWVzdC5ib2R5SnNvbiwgeyBleHBlY3RlZF9oZWFkX3NoYTogJ2hlYWQtMScgfSksXG5cdFx0XHRcdHJlc3BvbnNlOiBnaXRIdWJKc29uUmVzcG9uc2UoeyBtZXNzYWdlOiAnVXBkYXRpbmcgcHVsbCByZXF1ZXN0IGJyYW5jaC4nIH0sIHsgc3RhdHVzOiAyMDIgfSksXG5cdFx0XHR9KSk7XG5cdFx0XHRjb25zdCB7IHJlZiwgcmVzb3VyY2VzLCBzZXJ2aWNlIH0gPSBzZXR1cChzZXJ2ZXIpO1xuXG5cdFx0XHRhd2FpdCBzZXJ2aWNlLnVwZGF0ZUJyYW5jaChyZWYsIHsgZXhwZWN0ZWRIZWFkU2hhOiAnaGVhZC0xJyB9LCBzaWduYWwoKSk7XG5cblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocmVzb3VyY2VzLmludmFsaWRhdGlvbnMsIFt7IGZyYWdtZW50czogWydjb3JlJywgJ2NoZWNrcycsICdtZXJnZWFiaWxpdHknXSB9XSk7XG5cdFx0XHRzZXJ2ZXIuYXNzZXJ0U2F0aXNmaWVkKCk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3ByZXBhcmVzIGFuZCBkaXJlY3RseSBtZXJnZXMgb25seSB3aXRoIGNvbXBsZXRlIGdlbmVyYXRpb24tYW5jaG9yZWQgc3RhdGUnLCBhc3luYyAoKSA9PiB7XG5cdFx0YXdhaXQgd2l0aFNlcnZlcnMoYXN5bmMgc2VydmVyID0+IHtcblx0XHRcdHNlcnZlci5lbnF1ZXVlKGdpdEh1YlJlc3RTdGVwKHtcblx0XHRcdFx0bWV0aG9kOiAnUFVUJyxcblx0XHRcdFx0cGF0aDogJy9yZXBvcy9vY3RvL3JlcG8vcHVsbHMvNy9tZXJnZScsXG5cdFx0XHRcdGFzc2VydDogcmVxdWVzdCA9PiBhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHJlcXVlc3QuYm9keUpzb24sIHtcblx0XHRcdFx0XHRzaGE6ICdoZWFkLTEnLFxuXHRcdFx0XHRcdG1lcmdlX21ldGhvZDogJ3NxdWFzaCcsXG5cdFx0XHRcdH0pLFxuXHRcdFx0XHRyZXNwb25zZTogZ2l0SHViSnNvblJlc3BvbnNlKHsgbWVyZ2VkOiB0cnVlLCBzaGE6ICdtZXJnZS1zaGEnLCBtZXNzYWdlOiAnbWVyZ2VkJyB9KSxcblx0XHRcdH0pKTtcblx0XHRcdGNvbnN0IHsgcmVmLCBzZXJ2aWNlIH0gPSBzZXR1cChzZXJ2ZXIpO1xuXHRcdFx0Y29uc3QgcHJlcGFyYXRpb24gPSBhd2FpdCBzZXJ2aWNlLnByZXBhcmVNZXJnZShyZWYsICdoZWFkLTEnLCBzaWduYWwoKSk7XG5cblx0XHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IHNlcnZpY2UubWVyZ2UocHJlcGFyYXRpb24sIHtcblx0XHRcdFx0bWV0aG9kOiAnU1FVQVNIJyxcblx0XHRcdFx0YXV0aG9yaXphdGlvbjogeyBjb25maXJtZWQ6IHRydWUsIGF1dGhvcml6YXRpb25JZDogJ2FwcHJvdmFsLTEnIH0sXG5cdFx0XHR9LCBzaWduYWwoKSk7XG5cblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocmVzdWx0LCB7IG91dGNvbWU6ICdzdWNjZWVkZWQnLCBzaGE6ICdtZXJnZS1zaGEnLCBtZXNzYWdlOiAnbWVyZ2VkJyB9KTtcblx0XHRcdHNlcnZlci5hc3NlcnRTYXRpc2ZpZWQoKTtcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgncmVqZWN0cyBpbnZhbGlkYXRlZCBtZXJnZSBwcmVwYXJhdGlvbiBiZWZvcmUgbmV0d29yayBhY2Nlc3MnLCBhc3luYyAoKSA9PiB7XG5cdFx0YXdhaXQgd2l0aFNlcnZlcnMoYXN5bmMgc2VydmVyID0+IHtcblx0XHRcdGNvbnN0IHsgcmVmLCByZXNvdXJjZXMsIHNlcnZpY2UgfSA9IHNldHVwKHNlcnZlcik7XG5cdFx0XHRjb25zdCBwcmVwYXJhdGlvbiA9IGF3YWl0IHNlcnZpY2UucHJlcGFyZU1lcmdlKHJlZiwgJ2hlYWQtMScsIHNpZ25hbCgpKTtcblx0XHRcdHJlc291cmNlcy5zZXRTbmFwc2hvdCh7IC4uLnJlc291cmNlcy5zbmFwc2hvdC5nZXQoKSwgaGVhZEdlbmVyYXRpb246IHByZXBhcmF0aW9uLmhlYWRHZW5lcmF0aW9uICsgMSB9KTtcblxuXHRcdFx0YXdhaXQgYXNzZXJ0LnJlamVjdHMoXG5cdFx0XHRcdCgpID0+IHNlcnZpY2UubWVyZ2UocHJlcGFyYXRpb24sIHtcblx0XHRcdFx0XHRtZXRob2Q6ICdTUVVBU0gnLFxuXHRcdFx0XHRcdGF1dGhvcml6YXRpb246IHsgY29uZmlybWVkOiB0cnVlLCBhdXRob3JpemF0aW9uSWQ6ICdhcHByb3ZhbC0xJyB9LFxuXHRcdFx0XHR9LCBzaWduYWwoKSksXG5cdFx0XHRcdC9pbnZhbGlkYXRlZC8sXG5cdFx0XHQpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNlcnZlci5yZXF1ZXN0cy5sZW5ndGgsIDApO1xuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdleHBpcmVzIHVudXNlZCBtZXJnZSBwcmVwYXJhdGlvbnMgd2l0aG91dCByZXRhaW5pbmcgYSBwb2xsZXInLCBhc3luYyAoKSA9PiB7XG5cdFx0YXdhaXQgd2l0aFNlcnZlcnMoYXN5bmMgc2VydmVyID0+IHtcblx0XHRcdGNvbnN0IHNjaGVkdWxlciA9IG5ldyBGYWtlR2l0SHViU2NoZWR1bGVyKHsgbm93OiAwIH0pO1xuXHRcdFx0Y29uc3QgeyByZWYsIHNlcnZpY2UgfSA9IHNldHVwKHNlcnZlciwgY29tcGxldGVTbmFwc2hvdChzZXJ2ZXIpLCBzY2hlZHVsZXIpO1xuXHRcdFx0Y29uc3QgcHJlcGFyYXRpb24gPSBhd2FpdCBzZXJ2aWNlLnByZXBhcmVNZXJnZShyZWYsICdoZWFkLTEnLCBzaWduYWwoKSk7XG5cdFx0XHRzY2hlZHVsZXIuYWR2YW5jZUJ5KDUgKiA2MF8wMDApO1xuXG5cdFx0XHRhd2FpdCBhc3NlcnQucmVqZWN0cyhcblx0XHRcdFx0KCkgPT4gc2VydmljZS5tZXJnZShwcmVwYXJhdGlvbiwge1xuXHRcdFx0XHRcdG1ldGhvZDogJ1NRVUFTSCcsXG5cdFx0XHRcdFx0YXV0aG9yaXphdGlvbjogeyBjb25maXJtZWQ6IHRydWUsIGF1dGhvcml6YXRpb25JZDogJ2FwcHJvdmFsLTEnIH0sXG5cdFx0XHRcdH0sIHNpZ25hbCgpKSxcblx0XHRcdFx0L2ludmFsaWQgb3IgaGFzIGFscmVhZHkgYmVlbiBjb25zdW1lZC8sXG5cdFx0XHQpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNlcnZlci5yZXF1ZXN0cy5sZW5ndGgsIDApO1xuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdjYW5jZWxzIGF1dGhvcml0YXRpdmUgbWVyZ2UgcHJlcGFyYXRpb24gcmVmcmVzaGVzJywgYXN5bmMgKCkgPT4ge1xuXHRcdGF3YWl0IHdpdGhTZXJ2ZXJzKGFzeW5jIHNlcnZlciA9PiB7XG5cdFx0XHRjb25zdCB7IHJlZiwgcmVzb3VyY2VzLCBzZXJ2aWNlIH0gPSBzZXR1cChzZXJ2ZXIpO1xuXHRcdFx0Y29uc3Qgc3RhcnRlZCA9IG5ldyBEZWZlcnJlZFByb21pc2U8dm9pZD4oKTtcblx0XHRcdGNvbnN0IHJlbGVhc2UgPSBuZXcgRGVmZXJyZWRQcm9taXNlPHZvaWQ+KCk7XG5cdFx0XHRyZXNvdXJjZXMucmVmcmVzaEhhbmRsZXIgPSBhc3luYyAoKSA9PiB7XG5cdFx0XHRcdGF3YWl0IHN0YXJ0ZWQuY29tcGxldGUoKTtcblx0XHRcdFx0YXdhaXQgcmVsZWFzZS5wO1xuXHRcdFx0fTtcblx0XHRcdGNvbnN0IGNvbnRyb2xsZXIgPSBuZXcgQWJvcnRDb250cm9sbGVyKCk7XG5cdFx0XHRjb25zdCBwcmVwYXJhdGlvbiA9IHNlcnZpY2UucHJlcGFyZU1lcmdlKHJlZiwgJ2hlYWQtMScsIGNvbnRyb2xsZXIuc2lnbmFsKTtcblx0XHRcdGF3YWl0IHN0YXJ0ZWQucDtcblx0XHRcdGNvbnRyb2xsZXIuYWJvcnQobmV3IEVycm9yKCdjYW5jZWwgcHJlcGFyYXRpb24nKSk7XG5cblx0XHRcdGF3YWl0IGFzc2VydC5yZWplY3RzKCgpID0+IHByZXBhcmF0aW9uLCAvY2FuY2VsIHByZXBhcmF0aW9uLyk7XG5cdFx0XHRhd2FpdCByZWxlYXNlLmNvbXBsZXRlKCk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2VydmVyLnJlcXVlc3RzLmxlbmd0aCwgMCk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3JlY29uY2lsZXMgYW4gYW1iaWd1b3VzIG1lcmdlIGFmdGVyIGNvcmUgcHJvdmVzIHRoZSBwdWxsIHJlcXVlc3QgbWVyZ2VkJywgYXN5bmMgKCkgPT4ge1xuXHRcdGF3YWl0IHdpdGhTZXJ2ZXJzKGFzeW5jIHNlcnZlciA9PiB7XG5cdFx0XHRzZXJ2ZXIuZW5xdWV1ZShnaXRIdWJSZXN0U3RlcCh7XG5cdFx0XHRcdG1ldGhvZDogJ1BVVCcsXG5cdFx0XHRcdHBhdGg6ICcvcmVwb3Mvb2N0by9yZXBvL3B1bGxzLzcvbWVyZ2UnLFxuXHRcdFx0XHRyZXNwb25zZTogZ2l0SHViRGlzY29ubmVjdFJlc3BvbnNlKCksXG5cdFx0XHR9KSk7XG5cdFx0XHRjb25zdCB7IHJlZiwgcmVzb3VyY2VzLCBzZXJ2aWNlIH0gPSBzZXR1cChzZXJ2ZXIpO1xuXHRcdFx0Y29uc3QgcHJlcGFyYXRpb24gPSBhd2FpdCBzZXJ2aWNlLnByZXBhcmVNZXJnZShyZWYsICdoZWFkLTEnLCBzaWduYWwoKSk7XG5cdFx0XHRyZXNvdXJjZXMucmVmcmVzaEhhbmRsZXIgPSBmcmFnbWVudCA9PiB7XG5cdFx0XHRcdGlmIChmcmFnbWVudCA9PT0gJ2NvcmUnKSB7XG5cdFx0XHRcdFx0Y29uc3Qgc25hcHNob3QgPSByZXNvdXJjZXMuc25hcHNob3QuZ2V0KCk7XG5cdFx0XHRcdFx0cmVzb3VyY2VzLnNldFNuYXBzaG90KHtcblx0XHRcdFx0XHRcdC4uLnNuYXBzaG90LFxuXHRcdFx0XHRcdFx0Y29yZTogeyAuLi5zbmFwc2hvdC5jb3JlLCB2YWx1ZTogeyAuLi5zbmFwc2hvdC5jb3JlLnZhbHVlISwgc3RhdGU6ICdtZXJnZWQnIH0gfSxcblx0XHRcdFx0XHR9KTtcblx0XHRcdFx0fVxuXHRcdFx0fTtcblxuXHRcdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgc2VydmljZS5tZXJnZShwcmVwYXJhdGlvbiwge1xuXHRcdFx0XHRtZXRob2Q6ICdTUVVBU0gnLFxuXHRcdFx0XHRhdXRob3JpemF0aW9uOiB7IGNvbmZpcm1lZDogdHJ1ZSwgYXV0aG9yaXphdGlvbklkOiAnYXBwcm92YWwtMScgfSxcblx0XHRcdH0sIHNpZ25hbCgpKTtcblxuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChyZXN1bHQsIHsgb3V0Y29tZTogJ3JlY29uY2lsZWQnLCBtZXNzYWdlOiAnUHVsbCByZXF1ZXN0IHdhcyBtZXJnZWQnIH0pO1xuXHRcdFx0c2VydmVyLmFzc2VydFNhdGlzZmllZCgpO1xuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdkb2VzIG5vdCBlbnF1ZXVlIGEgcHVsbCByZXF1ZXN0IGFscmVhZHkgaW4gdGhlIG1lcmdlIHF1ZXVlJywgYXN5bmMgKCkgPT4ge1xuXHRcdGF3YWl0IHdpdGhTZXJ2ZXJzKGFzeW5jIHNlcnZlciA9PiB7XG5cdFx0XHRjb25zdCBzbmFwc2hvdCA9IGNvbXBsZXRlU25hcHNob3Qoc2VydmVyLCB0cnVlLCAnTVFFMScpO1xuXHRcdFx0Y29uc3QgeyByZWYsIHNlcnZpY2UgfSA9IHNldHVwKHNlcnZlciwgc25hcHNob3QpO1xuXHRcdFx0Y29uc3QgcHJlcGFyYXRpb24gPSBhd2FpdCBzZXJ2aWNlLnByZXBhcmVNZXJnZShyZWYsICdoZWFkLTEnLCBzaWduYWwoKSk7XG5cblx0XHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IHNlcnZpY2UuZW5xdWV1ZShcblx0XHRcdFx0cHJlcGFyYXRpb24sXG5cdFx0XHRcdHsgY29uZmlybWVkOiB0cnVlLCBhdXRob3JpemF0aW9uSWQ6ICdhcHByb3ZhbC0xJyB9LFxuXHRcdFx0XHRzaWduYWwoKSxcblx0XHRcdCk7XG5cblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocmVzdWx0LCB7IG91dGNvbWU6ICdhbHJlYWR5UXVldWVkJywgbWVyZ2VRdWV1ZUVudHJ5SWQ6ICdNUUUxJyB9KTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChzZXJ2ZXIucmVxdWVzdHMubGVuZ3RoLCAwKTtcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnZW5xdWV1ZXMgd2l0aCB0aGUgcHVsbCByZXF1ZXN0IG5vZGUgSUQgYW5kIGV4cGVjdGVkIGhlYWQgT0lEJywgYXN5bmMgKCkgPT4ge1xuXHRcdGF3YWl0IHdpdGhTZXJ2ZXJzKGFzeW5jIHNlcnZlciA9PiB7XG5cdFx0XHRzZXJ2ZXIuZW5xdWV1ZShnaXRIdWJHcmFwaFFMU3RlcCh7XG5cdFx0XHRcdHF1ZXJ5SW5jbHVkZXM6ICdBZ2VudEhvc3RFbnF1ZXVlUHVsbFJlcXVlc3QnLFxuXHRcdFx0XHRhc3NlcnQ6IHJlcXVlc3QgPT4gYXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChyZXF1ZXN0LmdyYXBoUWw/LnZhcmlhYmxlcywge1xuXHRcdFx0XHRcdHB1bGxSZXF1ZXN0SWQ6ICdQUjcnLFxuXHRcdFx0XHRcdGV4cGVjdGVkSGVhZE9pZDogJ2hlYWQtMScsXG5cdFx0XHRcdH0pLFxuXHRcdFx0XHRyZXNwb25zZTogZ2l0SHViR3JhcGhRTFJlc3BvbnNlKHtcblx0XHRcdFx0XHRlbnF1ZXVlUHVsbFJlcXVlc3Q6IHsgbWVyZ2VRdWV1ZUVudHJ5OiB7IGlkOiAnTVFFMicgfSB9LFxuXHRcdFx0XHR9KSxcblx0XHRcdH0pKTtcblx0XHRcdGNvbnN0IHsgcmVmLCBzZXJ2aWNlIH0gPSBzZXR1cChzZXJ2ZXIsIGNvbXBsZXRlU25hcHNob3Qoc2VydmVyLCB0cnVlKSk7XG5cdFx0XHRjb25zdCBwcmVwYXJhdGlvbiA9IGF3YWl0IHNlcnZpY2UucHJlcGFyZU1lcmdlKHJlZiwgJ2hlYWQtMScsIHNpZ25hbCgpKTtcblxuXHRcdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgc2VydmljZS5lbnF1ZXVlKFxuXHRcdFx0XHRwcmVwYXJhdGlvbixcblx0XHRcdFx0eyBjb25maXJtZWQ6IHRydWUsIGF1dGhvcml6YXRpb25JZDogJ2FwcHJvdmFsLTEnIH0sXG5cdFx0XHRcdHNpZ25hbCgpLFxuXHRcdFx0KTtcblxuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChyZXN1bHQsIHsgb3V0Y29tZTogJ3N1Y2NlZWRlZCcsIG1lcmdlUXVldWVFbnRyeUlkOiAnTVFFMicgfSk7XG5cdFx0XHRzZXJ2ZXIuYXNzZXJ0U2F0aXNmaWVkKCk7XG5cdFx0fSk7XG5cdH0pO1xufSk7XG5cbmZ1bmN0aW9uIHNpZ25hbCgpOiBBYm9ydFNpZ25hbCB7XG5cdHJldHVybiBuZXcgQWJvcnRDb250cm9sbGVyKCkuc2lnbmFsO1xufVxuXG5mdW5jdGlvbiBjb21wbGV0ZVNuYXBzaG90KHNlcnZlcjogUHJvZ3JhbW1hYmxlR2l0SHViU2VydmVyLCBtZXJnZVF1ZXVlUmVxdWlyZWQgPSBmYWxzZSwgbWVyZ2VRdWV1ZUVudHJ5SWQ/OiBzdHJpbmcpOiBQdWxsUmVxdWVzdFNuYXBzaG90IHtcblx0Y29uc3QgYWNjb3VudCA9IHsgaG9zdDogbmV3IFVSTChzZXJ2ZXIuYXBpQmFzZVVybCkuaG9zdCwgYWNjb3VudElkOiAnMTAxJyB9O1xuXHRjb25zdCByZWYgPSB7IC4uLmFjY291bnQsIG93bmVyOiAnb2N0bycsIHJlcG86ICdyZXBvJywgbnVtYmVyOiA3IH07XG5cdHJldHVybiB7XG5cdFx0cmVmLFxuXHRcdGdlbmVyYXRpb246IDEsXG5cdFx0aGVhZEdlbmVyYXRpb246IDEsXG5cdFx0Y29yZToge1xuXHRcdFx0c3RhdHVzOiAncmVhZHknLFxuXHRcdFx0Y29tcGxldGU6IHRydWUsXG5cdFx0XHR2YWx1ZToge1xuXHRcdFx0XHRpZDogJ1BSNycsXG5cdFx0XHRcdHJlcG9zaXRvcnlOYW1lV2l0aE93bmVyOiAnb2N0by9yZXBvJyxcblx0XHRcdFx0bnVtYmVyOiA3LFxuXHRcdFx0XHR0aXRsZTogJ1BSJyxcblx0XHRcdFx0dXJsOiAnaHR0cHM6Ly9leGFtcGxlLnRlc3QvcHIvNycsXG5cdFx0XHRcdHN0YXRlOiAnb3BlbicsXG5cdFx0XHRcdGRyYWZ0OiBmYWxzZSxcblx0XHRcdFx0aGVhZFNoYTogJ2hlYWQtMScsXG5cdFx0XHRcdGhlYWRSZWY6ICdmZWF0dXJlJyxcblx0XHRcdFx0YmFzZVNoYTogJ2Jhc2UtMScsXG5cdFx0XHRcdGJhc2VSZWY6ICdtYWluJyxcblx0XHRcdH0sXG5cdFx0fSxcblx0XHR0b3BMZXZlbENvbW1lbnRzOiB7IHN0YXR1czogJ21pc3NpbmcnLCBjb21wbGV0ZTogZmFsc2UgfSxcblx0XHRzdWJtaXR0ZWRSZXZpZXdzOiB7IHN0YXR1czogJ3JlYWR5JywgY29tcGxldGU6IHRydWUsIHZhbHVlOiBbXSB9LFxuXHRcdGlubGluZUNvbW1lbnRzOiB7IHN0YXR1czogJ21pc3NpbmcnLCBjb21wbGV0ZTogZmFsc2UgfSxcblx0XHRyZXZpZXdUaHJlYWRzOiB7IHN0YXR1czogJ3JlYWR5JywgY29tcGxldGU6IHRydWUsIHZhbHVlOiBbXSwgaGVhZFNoYTogJ2hlYWQtMScgfSxcblx0XHRjaGVja3M6IHtcblx0XHRcdHN0YXR1czogJ3JlYWR5Jyxcblx0XHRcdGNvbXBsZXRlOiB0cnVlLFxuXHRcdFx0aGVhZFNoYTogJ2hlYWQtMScsXG5cdFx0XHR2YWx1ZToge1xuXHRcdFx0XHRoZWFkU2hhOiAnaGVhZC0xJyxcblx0XHRcdFx0Y2hlY2tzOiBbXSxcblx0XHRcdFx0cmVxdWlyZWRuZXNzQ29tcGxldGU6IHRydWUsXG5cdFx0XHRcdGV4cGVjdGVkU3VpdGVzOiBbXSxcblx0XHRcdFx0ZXhwZWN0ZWRTdWl0ZXNDb21wbGV0ZTogdHJ1ZSxcblx0XHRcdH0sXG5cdFx0fSxcblx0XHRtZXJnZWFiaWxpdHk6IHtcblx0XHRcdHN0YXR1czogJ3JlYWR5Jyxcblx0XHRcdGNvbXBsZXRlOiB0cnVlLFxuXHRcdFx0aGVhZFNoYTogJ2hlYWQtMScsXG5cdFx0XHR2YWx1ZToge1xuXHRcdFx0XHRoZWFkU2hhOiAnaGVhZC0xJyxcblx0XHRcdFx0YmFzZVNoYTogJ2Jhc2UtMScsXG5cdFx0XHRcdG1lcmdlYWJsZTogJ01FUkdFQUJMRScsXG5cdFx0XHRcdHZpZXdlckNhblVwZGF0ZTogdHJ1ZSxcblx0XHRcdFx0dmlld2VyQ2FuTWVyZ2U6IHRydWUsXG5cdFx0XHRcdHZpZXdlckNhbkVuYWJsZUF1dG9NZXJnZTogdHJ1ZSxcblx0XHRcdFx0YWxsb3dlZE1lcmdlTWV0aG9kczogWydTUVVBU0gnXSxcblx0XHRcdFx0YXV0b01lcmdlRW5hYmxlZDogZmFsc2UsXG5cdFx0XHRcdG1lcmdlUXVldWVSZXF1aXJlZCxcblx0XHRcdFx0cXVldWVSZXF1aXJlbWVudEtub3duOiB0cnVlLFxuXHRcdFx0XHRtZXJnZVF1ZXVlRW50cnlJZCxcblx0XHRcdH0sXG5cdFx0fSxcblx0XHRwYXJ0aWNpcGFudHM6IHsgc3RhdHVzOiAnbWlzc2luZycsIGNvbXBsZXRlOiBmYWxzZSB9LFxuXHR9O1xufVxuXG5mdW5jdGlvbiB3b3JrZmxvd1J1bihpZDogbnVtYmVyLCBhdHRlbXB0OiBudW1iZXIsIHN0YXR1czogc3RyaW5nKTogb2JqZWN0IHtcblx0cmV0dXJuIHtcblx0XHRpZCxcblx0XHRuYW1lOiAnQ0knLFxuXHRcdHN0YXR1cyxcblx0XHRjb25jbHVzaW9uOiBzdGF0dXMgPT09ICdjb21wbGV0ZWQnID8gJ2ZhaWx1cmUnIDogbnVsbCxcblx0XHRoZWFkX3NoYTogJ2hlYWQtMScsXG5cdFx0cnVuX2F0dGVtcHQ6IGF0dGVtcHQsXG5cdH07XG59XG5cbmZ1bmN0aW9uIHdvcmtmbG93UnVuTm9ybWFsaXplZChpZDogc3RyaW5nLCBhdHRlbXB0OiBudW1iZXIsIHN0YXR1czogc3RyaW5nKTogb2JqZWN0IHtcblx0cmV0dXJuIHtcblx0XHRpZCxcblx0XHRuYW1lOiAnQ0knLFxuXHRcdGV2ZW50OiB1bmRlZmluZWQsXG5cdFx0c3RhdHVzLFxuXHRcdGNvbmNsdXNpb246IHN0YXR1cyA9PT0gJ0NPTVBMRVRFRCcgPyAnRkFJTFVSRScgOiB1bmRlZmluZWQsXG5cdFx0aGVhZFNoYTogJ2hlYWQtMScsXG5cdFx0cnVuQXR0ZW1wdDogYXR0ZW1wdCxcblx0XHR1cmw6IHVuZGVmaW5lZCxcblx0XHRjcmVhdGVkQXQ6IHVuZGVmaW5lZCxcblx0XHR1cGRhdGVkQXQ6IHVuZGVmaW5lZCxcblx0fTtcbn1cbiJdLAogICJtYXBwaW5ncyI6ICJBQUtBLE9BQU8sWUFBWTtBQUNuQixTQUFTLGlCQUFpQiw2QkFBNkI7QUFDdkQsU0FBUyx5QkFBeUI7QUFDbEMsU0FBUyxlQUFlO0FBRXhC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
