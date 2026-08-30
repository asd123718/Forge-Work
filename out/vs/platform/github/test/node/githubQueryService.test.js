import assert from "assert";
import { DeferredPromise } from "../../../../base/common/async.js";
import { Emitter } from "../../../../base/common/event.js";
import { hasKey } from "../../../../base/common/types.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../base/test/common/utils.js";
import { NullLogService } from "../../../log/common/log.js";
import { GitHubQueryService } from "../../common/githubQueryServiceImpl.js";
import { GitHubTransport } from "../../common/githubTransport.js";
import { FakeGitHubScheduler } from "./fakeGitHubScheduler.js";
import { nodeFetch } from "./nodeFetch.js";
import {
  gitHubGraphQLResponse,
  gitHubGraphQLStep,
  gitHubJsonResponse,
  gitHubRestStep,
  ProgrammableGitHubServer
} from "./programmableGitHubServer.js";
const policy = {
  dormantGrace: 20,
  maximumDormantEntries: 2,
  visible: 10,
  background: 100,
  jitter: 0
};
const availableCapabilities = {
  graphql: true,
  mergeQueue: true,
  internalMergeStatus: false,
  reviewThreads: true,
  checkContextRequiredness: true
};
class TestCapabilitiesService {
  constructor(value = availableCapabilities) {
    this.value = value;
  }
  getCapabilities() {
    return Promise.resolve(this.value);
  }
  clear() {
  }
}
class SequencedCapabilitiesService {
  constructor(_values) {
    this._values = _values;
    this._index = 0;
  }
  getCapabilities() {
    return Promise.resolve(this._values[Math.min(this._index++, this._values.length - 1)]);
  }
  clear() {
  }
}
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
  invalidate() {
    const credential = {
      account: this._account,
      token: "token",
      generation: 1,
      signal: this._controller.signal
    };
    this._controller.abort(new Error("invalidated"));
    this._onDidInvalidate.fire({ credential, reason: "account" });
  }
  dispose() {
    this._controller.abort(new Error("disposed"));
    this._onDidInvalidate.dispose();
  }
}
suite("GitHubQueryService", () => {
  const disposables = ensureNoDisposablesAreLeakedInTestSuite();
  async function withServer(fn) {
    const server = await ProgrammableGitHubServer.start();
    try {
      await fn(server);
    } finally {
      await server.disposeAsync();
    }
  }
  function setup(server, capabilities = availableCapabilities) {
    const account = { host: new URL(server.apiBaseUrl).host, accountId: "101" };
    const ref = { ...account, owner: "octo", repo: "repo" };
    const clock = new FakeGitHubScheduler({ now: 0 });
    const credentials = disposables.add(new TestCredentialService(account));
    const transport = disposables.add(new GitHubTransport(nodeFetch));
    const capabilityService = hasKey(capabilities, { getCapabilities: true }) ? capabilities : new TestCapabilitiesService(capabilities);
    const service = disposables.add(new GitHubQueryService(
      clock,
      policy,
      credentials,
      transport,
      server.createEndpointService(),
      capabilityService,
      new NullLogService()
    ));
    return { account, ref, clock, credentials, service };
  }
  test("shares repository and issue resources, canonicalizes aliases, and stops terminal issue polling", async () => {
    await withServer(async (server) => {
      const repositoryPolled = new DeferredPromise();
      server.enqueue(
        gitHubRestStep({
          method: "GET",
          path: "/repos/octo/repo",
          response: gitHubJsonResponse(repositoryResponse("new-owner/new-repo"), { etag: '"repo"' })
        }),
        gitHubRestStep({
          method: "GET",
          path: "/repos/octo/repo/issues/7",
          response: gitHubJsonResponse(issueResponse("closed"), { etag: '"issue"' })
        }),
        gitHubRestStep({
          method: "GET",
          path: "/repos/new-owner/new-repo",
          assert: async () => repositoryPolled.complete(),
          response: gitHubJsonResponse(repositoryResponse("new-owner/new-repo"), { etag: '"repo-2"' })
        })
      );
      const { account, clock, service } = setup(server);
      const repositoryA = service.subscribeRepository({ ...account, owner: "octo", repo: "repo" }, { priority: "visible" });
      const repositoryB = service.subscribeRepository({ ...account, owner: "OCTO", repo: "REPO" }, { priority: "background" });
      const issueA = service.subscribeIssue({ ...account, owner: "octo", repo: "repo", number: 7 }, { priority: "visible" });
      const issueB = service.subscribeIssue({ ...account, owner: "OCTO", repo: "REPO", number: 7 }, { priority: "background" });
      assert.strictEqual(repositoryA.resource, repositoryB.resource);
      assert.strictEqual(issueA.resource, issueB.resource);
      await Promise.all([repositoryA.refresh(), issueA.refresh()]);
      const canonical = service.subscribeRepository({ ...account, owner: "new-owner", repo: "new-repo" }, { priority: "background" });
      assert.deepStrictEqual({
        canonicalShared: canonical.resource === repositoryA.resource,
        repositoryRef: repositoryA.resource.ref,
        repository: repositoryA.resource.state.get(),
        issue: issueA.resource.state.get()
      }, {
        canonicalShared: true,
        repositoryRef: { ...account, owner: "new-owner", repo: "new-repo" },
        repository: {
          value: {
            id: "R1",
            owner: { id: "1", login: "new-owner" },
            name: "new-repo",
            nameWithOwner: "new-owner/new-repo",
            defaultBranch: "main",
            private: true,
            description: "repo",
            url: "https://example.test/new-owner/new-repo",
            archived: false,
            fork: false
          },
          status: "ready",
          complete: true,
          observedAt: (/* @__PURE__ */ new Date(0)).toISOString(),
          attemptedAt: (/* @__PURE__ */ new Date(0)).toISOString()
        },
        issue: {
          value: {
            id: "I7",
            number: 7,
            title: "Issue",
            body: "Body",
            url: "https://example.test/issues/7",
            state: "closed",
            stateReason: "completed",
            author: { id: "2", login: "author" },
            assignees: [{ id: "3", login: "assignee" }],
            labels: ["bug"],
            createdAt: "2026-01-01T00:00:00Z",
            updatedAt: "2026-01-02T00:00:00Z",
            closedAt: "2026-01-03T00:00:00Z"
          },
          status: "ready",
          complete: true,
          observedAt: (/* @__PURE__ */ new Date(0)).toISOString(),
          attemptedAt: (/* @__PURE__ */ new Date(0)).toISOString()
        }
      });
      clock.advanceBy(10);
      await repositoryPolled.p;
      assert.deepStrictEqual(server.requests.map((request) => request.servicePath), [
        "/repos/octo/repo",
        "/repos/octo/repo/issues/7",
        "/repos/new-owner/new-repo"
      ]);
      repositoryA.dispose();
      repositoryB.dispose();
      canonical.dispose();
      issueA.dispose();
      issueB.dispose();
      server.assertSatisfied();
    });
  });
  test("retains dormant entity identity briefly and purges resources on account change", async () => {
    await withServer(async (server) => {
      const resumedPoll = new DeferredPromise();
      server.enqueue(
        gitHubRestStep({
          method: "GET",
          path: "/repos/octo/repo",
          response: gitHubJsonResponse(repositoryResponse("octo/repo"))
        }),
        gitHubRestStep({
          method: "GET",
          path: "/repos/octo/repo",
          assert: async () => resumedPoll.complete(),
          response: gitHubJsonResponse(repositoryResponse("octo/repo"))
        })
      );
      const { credentials, clock, ref, service } = setup(server);
      const first = service.subscribeRepository(ref, { priority: "background" });
      await first.refresh();
      const resource = first.resource;
      first.dispose();
      clock.advanceBy(19);
      const resumed = service.subscribeRepository(ref, { priority: "background" });
      assert.strictEqual(resumed.resource, resource);
      clock.advanceBy(100);
      await resumedPoll.p;
      credentials.invalidate();
      await assert.rejects(() => resumed.refresh(), /disposed/);
      const replaced = service.subscribeRepository(ref, { priority: "background" });
      assert.notStrictEqual(replaced.resource, resource);
      resumed.dispose();
      replaced.dispose();
      server.assertSatisfied();
    });
  });
  test("immediately restarts an aborted first load when a dormant resource resumes", async () => {
    await withServer(async (server) => {
      const firstStarted = new DeferredPromise();
      const releaseFirst = new DeferredPromise();
      const resumedStarted = new DeferredPromise();
      server.enqueue(
        gitHubRestStep({
          method: "GET",
          path: "/repos/octo/repo",
          assert: async () => firstStarted.complete(),
          waitFor: releaseFirst.p,
          response: gitHubJsonResponse(repositoryResponse("octo/repo"))
        }),
        gitHubRestStep({
          method: "GET",
          path: "/repos/octo/repo",
          assert: async () => resumedStarted.complete(),
          response: gitHubJsonResponse(repositoryResponse("octo/repo"))
        })
      );
      const { clock, ref, service } = setup(server);
      const first = service.subscribeRepository(ref, { priority: "background" });
      const firstRefresh = first.refresh();
      await firstStarted.p;
      first.dispose();
      await assert.rejects(() => firstRefresh);
      const resumed = service.subscribeRepository(ref, { priority: "background" });
      clock.flushDue();
      await resumedStarted.p;
      await resumed.refresh();
      await releaseFirst.complete();
      assert.deepStrictEqual({
        sameResource: resumed.resource === first.resource,
        status: resumed.resource.state.get().status,
        requestCount: server.requests.length
      }, {
        sameResource: true,
        status: "ready",
        requestCount: 2
      });
      resumed.dispose();
      server.assertSatisfied();
    });
  });
  test("paginates comparisons and reports changed-file completeness explicitly", async () => {
    await withServer(async (server) => {
      const firstCommits = Array.from({ length: 100 }, (_, index) => comparisonCommit(`c${index}`));
      const files = Array.from({ length: 300 }, (_, index) => changedFile(`f${index}.ts`));
      server.enqueue(
        gitHubRestStep({
          method: "GET",
          path: "/repos/octo/repo/compare/base...head",
          query: { per_page: 100, page: 1 },
          response: gitHubJsonResponse(compareResponse(firstCommits, files, 101))
        }),
        gitHubRestStep({
          method: "GET",
          path: "/repos/octo/repo/compare/base...head",
          query: { per_page: 100, page: 2 },
          response: gitHubJsonResponse(compareResponse([comparisonCommit("head-sha")], files, 101))
        })
      );
      const { ref, service } = setup(server);
      const result = await service.compare(ref, "base", "head", signal());
      assert.deepStrictEqual({
        baseSha: result.baseSha,
        mergeBaseSha: result.mergeBaseSha,
        headSha: result.headSha,
        commitCount: result.commits.length,
        commitsComplete: result.commitsComplete,
        fileCount: result.files.length,
        filesComplete: result.filesComplete
      }, {
        baseSha: "base-sha",
        mergeBaseSha: "merge-base-sha",
        headSha: "head-sha",
        commitCount: 101,
        commitsComplete: true,
        fileCount: 300,
        filesComplete: false
      });
      server.assertSatisfied();
    });
  });
  test("fails closed when comparison commits or files are incomplete", async () => {
    await withServer(async (server) => {
      server.enqueue(gitHubRestStep({
        method: "GET",
        path: "/repos/octo/repo/compare/base...head",
        query: { per_page: 100, page: 1 },
        response: gitHubJsonResponse({
          base_commit: { sha: "base-sha" },
          merge_base_commit: { sha: "merge-base-sha" },
          status: "ahead",
          ahead_by: 2,
          behind_by: 0,
          total_commits: 2,
          commits: [comparisonCommit("partial")]
        })
      }));
      const { ref, service } = setup(server);
      const result = await service.compare(ref, "base", "head", signal());
      assert.deepStrictEqual({
        headSha: result.headSha,
        commitsComplete: result.commitsComplete,
        files: result.files,
        filesComplete: result.filesComplete
      }, {
        headSha: void 0,
        commitsComplete: false,
        files: [],
        filesComplete: false
      });
      server.assertSatisfied();
    });
  });
  test("lists pull request pages and viewer-specific searches", async () => {
    await withServer(async (server) => {
      server.enqueue(
        gitHubGraphQLStep({
          queryIncludes: "AgentHostListPullRequests",
          response: gitHubGraphQLResponse({
            repository: {
              pullRequests: {
                nodes: [pullRequestNode(1)],
                pageInfo: { endCursor: "cursor-1", hasNextPage: true }
              }
            }
          })
        }),
        gitHubGraphQLStep({
          queryIncludes: "AgentHostSearchPullRequests",
          assert: (request) => assert.strictEqual(request.graphQl?.variables?.query?.includes("review-requested:@me"), true),
          response: gitHubGraphQLResponse({ search: { nodes: [pullRequestNode(2)] } })
        }),
        gitHubGraphQLStep({
          queryIncludes: "AgentHostSearchPullRequests",
          assert: (request) => assert.strictEqual(request.graphQl?.variables?.query?.includes("assignee:@me"), true),
          response: gitHubGraphQLResponse({ search: { nodes: [pullRequestNode(3)] } })
        })
      );
      const { ref, service } = setup(server);
      const page = await service.listPullRequests(ref, void 0, signal());
      const reviews = await service.listPullRequestsWaitingForReview(ref, signal());
      const assigned = await service.listPullRequestsAssignedToViewer(ref, signal());
      assert.deepStrictEqual({
        page,
        reviewRequested: reviews.map((item) => ({ number: item.number, flag: item.reviewRequestedFromViewer })),
        assigned: assigned.map((item) => ({ number: item.number, flag: item.assignedToViewer }))
      }, {
        page: {
          pullRequests: [pullRequestSummary(1, false, false)],
          cursor: "cursor-1",
          hasNextPage: true
        },
        reviewRequested: [{ number: 2, flag: true }],
        assigned: [{ number: 3, flag: true }]
      });
      server.assertSatisfied();
    });
  });
  test("builds complete pull request context from paginated files and comments", async () => {
    await withServer(async (server) => {
      server.enqueue(
        gitHubRestStep({
          method: "GET",
          path: "/repos/octo/repo/pulls/7",
          response: gitHubJsonResponse({
            number: 7,
            html_url: "https://example.test/pull/7",
            title: "PR",
            body: "Description",
            user: { login: "author" },
            draft: false,
            base: { ref: "main" },
            head: { ref: "feature" },
            updated_at: "2026-01-04T00:00:00Z"
          })
        }),
        gitHubRestStep({
          method: "GET",
          path: "/repos/octo/repo/pulls/7/files",
          query: { per_page: 100, page: 1 },
          response: gitHubJsonResponse([{ filename: "a.ts", status: "modified", additions: 1, deletions: 2, patch: "@@ patch" }])
        }),
        gitHubRestStep({
          method: "GET",
          path: "/repos/octo/repo/issues/7/comments",
          query: { per_page: 100, page: 1 },
          response: gitHubJsonResponse([{ body: "issue", user: { login: "a" }, created_at: "2026-01-02T00:00:00Z", updated_at: "2026-01-02T00:00:00Z" }])
        }),
        gitHubRestStep({
          method: "GET",
          path: "/repos/octo/repo/pulls/7/comments",
          query: { per_page: 100, page: 1 },
          response: gitHubJsonResponse([{ body: "review", user: { login: "b" }, path: "a.ts", line: null, original_line: 4, created_at: "2026-01-01T00:00:00Z", updated_at: "2026-01-03T00:00:00Z" }])
        })
      );
      const { account, service } = setup(server);
      const result = await service.getPullRequestContext({ ...account, owner: "octo", repo: "repo", number: 7 }, signal());
      assert.deepStrictEqual({
        patch: result.patch,
        comments: result.comments,
        filesComplete: result.filesComplete,
        commentsComplete: result.commentsComplete
      }, {
        patch: "diff --git a/a.ts b/a.ts\n@@ patch",
        comments: [
          { kind: "review", author: "b", body: "review", createdAt: "2026-01-01T00:00:00Z", updatedAt: "2026-01-03T00:00:00Z", path: "a.ts", line: 4 },
          { kind: "issue", author: "a", body: "issue", createdAt: "2026-01-02T00:00:00Z", updatedAt: "2026-01-02T00:00:00Z", path: void 0, line: void 0 }
        ],
        filesComplete: true,
        commentsComplete: true
      });
      server.assertSatisfied();
    });
  });
  test("marks pull request context files incomplete at GitHub maximum", async () => {
    await withServer(async (server) => {
      const fullPage = Array.from({ length: 100 }, (_, index) => ({
        filename: `file-${index}.ts`,
        status: "modified",
        additions: 1,
        deletions: 0
      }));
      server.enqueue(
        gitHubRestStep({
          method: "GET",
          path: "/repos/octo/repo/pulls/7",
          response: gitHubJsonResponse({
            number: 7,
            html_url: "https://example.test/pull/7",
            title: "PR",
            body: null,
            user: { login: "author" },
            draft: false,
            base: { ref: "main" },
            head: { ref: "feature" },
            updated_at: "2026-01-04T00:00:00Z"
          })
        }),
        gitHubRestStep({
          method: "GET",
          path: "/repos/octo/repo/pulls/7/files",
          query: { per_page: 100, page: 1 },
          response: gitHubJsonResponse(fullPage)
        }),
        gitHubRestStep({
          method: "GET",
          path: "/repos/octo/repo/issues/7/comments",
          query: { per_page: 100, page: 1 },
          response: gitHubJsonResponse([])
        }),
        gitHubRestStep({
          method: "GET",
          path: "/repos/octo/repo/pulls/7/comments",
          query: { per_page: 100, page: 1 },
          response: gitHubJsonResponse([])
        }),
        ...Array.from({ length: 29 }, (_, index) => gitHubRestStep({
          method: "GET",
          path: "/repos/octo/repo/pulls/7/files",
          query: { per_page: 100, page: index + 2 },
          response: gitHubJsonResponse(fullPage)
        })),
        gitHubRestStep({
          method: "GET",
          path: "/repos/octo/repo/pulls/7/files",
          query: { per_page: 100, page: 31 },
          response: gitHubJsonResponse([])
        })
      );
      const { account, service } = setup(server);
      const result = await service.getPullRequestContext({ ...account, owner: "octo", repo: "repo", number: 7 }, signal());
      assert.strictEqual(result.filesComplete, false);
      server.assertSatisfied();
    });
  });
  test("preserves behavior-compatible branch and head-SHA lookup semantics", async () => {
    await withServer(async (server) => {
      server.enqueue(
        gitHubRestStep({
          method: "GET",
          path: "/repos/octo/repo/pulls",
          query: { head: "fork:feature/test", state: "all", sort: "updated", direction: "desc", per_page: 1 },
          response: gitHubJsonResponse([{ number: 9, node_id: "PR9", html_url: "https://example.test/pull/9", created_at: "2026-01-01T00:00:00Z" }])
        }),
        gitHubRestStep({
          method: "GET",
          path: "/repos/octo/repo/commits/sha/pulls",
          query: { per_page: 100 },
          response: gitHubJsonResponse([
            { number: 1, html_url: "https://example.test/pull/1", state: "closed", head: { sha: "sha" } },
            { number: 2, html_url: "https://example.test/pull/2", state: "open", head: { sha: "other" } }
          ])
        })
      );
      const { ref, service } = setup(server);
      const byBranch = await service.findPullRequestByHeadBranch(ref, "feature/test", "fork", signal());
      const bySha = await service.findPullRequestByHeadSha(ref, "sha", signal());
      assert.deepStrictEqual({
        byBranch,
        bySha
      }, {
        byBranch: {
          ref: { ...ref, number: 9 },
          id: "PR9",
          url: "https://example.test/pull/9",
          createdAt: "2026-01-01T00:00:00Z"
        },
        bySha: {
          ref: { ...ref, number: 1 },
          id: void 0,
          url: "https://example.test/pull/1",
          createdAt: void 0
        }
      });
      server.assertSatisfied();
    });
  });
  test("returns no head-SHA lookup when the first page is full", async () => {
    await withServer(async (server) => {
      server.enqueue(gitHubRestStep({
        method: "GET",
        path: "/repos/octo/repo/commits/sha/pulls",
        query: { per_page: 100 },
        response: gitHubJsonResponse(Array.from({ length: 100 }, (_, index) => ({
          number: index + 1,
          html_url: `https://example.test/pull/${index + 1}`,
          state: "open",
          head: { sha: index === 0 ? "sha" : "other" }
        })))
      }));
      const { ref, service } = setup(server);
      assert.strictEqual(await service.findPullRequestByHeadSha(ref, "sha", signal()), void 0);
      server.assertSatisfied();
    });
  });
  test("queries recent work, complete review-thread summaries, and batched issue linkage", async () => {
    await withServer(async (server) => {
      server.enqueue(
        gitHubGraphQLStep({
          queryIncludes: "AgentHostRecentAssignedIssues",
          response: gitHubGraphQLResponse({
            search: { nodes: [{ number: 1, title: "Issue", url: "https://example.test/issues/1", updatedAt: "2026-01-01T00:00:00Z" }] }
          })
        }),
        gitHubGraphQLStep({
          queryIncludes: "AgentHostRecentAuthoredPullRequests",
          response: gitHubGraphQLResponse({
            search: {
              nodes: [{
                number: 2,
                title: "PR",
                url: "https://example.test/pull/2",
                updatedAt: "2026-01-02T00:00:00Z",
                commits: { nodes: [{ commit: { committedDate: "2026-01-03T00:00:00Z", statusCheckRollup: { state: "SUCCESS" } } }] }
              }]
            }
          })
        }),
        gitHubGraphQLStep({
          queryIncludes: "AgentHostPullRequestReviewThreadSummary",
          response: gitHubGraphQLResponse({
            repository: {
              pullRequest: {
                reviewThreads: {
                  nodes: [{ isResolved: false, comments: { nodes: [{ createdAt: "2026-01-04T00:00:00Z" }] } }],
                  pageInfo: { hasNextPage: true, endCursor: "threads-1" }
                }
              }
            }
          })
        }),
        gitHubGraphQLStep({
          queryIncludes: "AgentHostPullRequestReviewThreadSummary",
          assert: (request) => assert.strictEqual((request.graphQl?.variables).after, "threads-1"),
          response: gitHubGraphQLResponse({
            repository: {
              pullRequest: {
                reviewThreads: {
                  nodes: [{ isResolved: true, comments: { nodes: [] } }],
                  pageInfo: { hasNextPage: false, endCursor: null }
                }
              }
            }
          })
        }),
        gitHubGraphQLStep({
          queryIncludes: "AgentHostIssueLinkage",
          response: gitHubGraphQLResponse({
            repository: {
              issue0: { closedByPullRequestsReferences: { totalCount: 1 } },
              issue1: { closedByPullRequestsReferences: { totalCount: 0 } }
            }
          })
        })
      );
      const { account, ref, service } = setup(server);
      const issues = await service.getRecentAssignedIssues(ref, signal());
      const pullRequests = await service.getRecentAuthoredPullRequests(ref, signal());
      const threads = await service.getPullRequestReviewThreadSummary({ ...account, owner: "octo", repo: "repo", number: 2 }, signal());
      const linked = await service.getIssuesWithLinkedPullRequests(ref, [1, 2, 1, -1], signal());
      assert.deepStrictEqual({
        issues,
        pullRequests,
        threads,
        linked
      }, {
        issues: [{ number: 1, title: "Issue", url: "https://example.test/issues/1", updatedAt: "2026-01-01T00:00:00Z" }],
        pullRequests: [{
          number: 2,
          title: "PR",
          url: "https://example.test/pull/2",
          updatedAt: "2026-01-02T00:00:00Z",
          statusCheckRollupState: "SUCCESS",
          latestCommitAt: "2026-01-03T00:00:00Z"
        }],
        threads: [
          { isResolved: false, latestCommentAt: "2026-01-04T00:00:00Z" },
          { isResolved: true, latestCommentAt: void 0 }
        ],
        linked: [1]
      });
      server.assertSatisfied();
    });
  });
  test("fails closed without GraphQL and memoizes schema-invalid query variants", async () => {
    await withServer(async (server) => {
      const unavailable = {
        graphql: false,
        mergeQueue: false,
        internalMergeStatus: false,
        reviewThreads: false,
        checkContextRequiredness: false
      };
      const disabled = setup(server, unavailable);
      await assert.rejects(
        () => disabled.service.getRecentAssignedIssues(disabled.ref, signal()),
        (error) => error instanceof Error && error.message.includes("GraphQL is unavailable")
      );
      assert.strictEqual(server.requests.length, 0);
      server.enqueue(gitHubGraphQLStep({
        queryIncludes: "AgentHostRecentAssignedIssues",
        response: gitHubGraphQLResponse(void 0, [{ message: "Unknown field", extensions: { code: "undefinedField" } }])
      }));
      const enabled = setup(server);
      await assert.rejects(
        () => enabled.service.getRecentAssignedIssues(enabled.ref, signal()),
        (error) => error instanceof Error && error.message.includes("Unknown field")
      );
      await assert.rejects(
        () => enabled.service.getRecentAssignedIssues(enabled.ref, signal()),
        (error) => error instanceof Error && error.message.includes("unsupported")
      );
      assert.strictEqual(server.requests.length, 1);
      server.assertSatisfied();
    });
  });
  test("retries transient capability and untyped GraphQL failures", async () => {
    await withServer(async (server) => {
      server.enqueue(
        gitHubGraphQLStep({
          queryIncludes: "AgentHostRecentAssignedIssues",
          response: gitHubGraphQLResponse(void 0, [{ message: "Something went wrong while executing your query" }])
        }),
        gitHubGraphQLStep({
          queryIncludes: "AgentHostRecentAssignedIssues",
          response: gitHubGraphQLResponse({ search: { nodes: [] } })
        }),
        gitHubGraphQLStep({
          queryIncludes: "AgentHostRecentAssignedIssues",
          response: gitHubGraphQLResponse({ search: { nodes: [] } })
        })
      );
      const transientQuery = setup(server);
      await assert.rejects(
        () => transientQuery.service.getRecentAssignedIssues(transientQuery.ref, signal()),
        (error) => error instanceof Error && error.message.includes("Something went wrong")
      );
      assert.deepStrictEqual(await transientQuery.service.getRecentAssignedIssues(transientQuery.ref, signal()), []);
      const transientCapabilities = setup(server, new SequencedCapabilitiesService([
        { ...availableCapabilities, graphql: false },
        availableCapabilities
      ]));
      await assert.rejects(
        () => transientCapabilities.service.getRecentAssignedIssues(transientCapabilities.ref, signal()),
        (error) => error instanceof Error && error.message.includes("GraphQL is unavailable")
      );
      assert.deepStrictEqual(await transientCapabilities.service.getRecentAssignedIssues(transientCapabilities.ref, signal()), []);
      assert.strictEqual(server.requests.length, 3);
      server.assertSatisfied();
    });
  });
});
function signal() {
  return new AbortController().signal;
}
function repositoryResponse(nameWithOwner) {
  const [owner, name] = nameWithOwner.split("/");
  return {
    node_id: "R1",
    owner: { id: 1, login: owner },
    name,
    full_name: nameWithOwner,
    default_branch: "main",
    private: true,
    description: "repo",
    html_url: `https://example.test/${nameWithOwner}`,
    archived: false,
    fork: false
  };
}
function issueResponse(state) {
  return {
    node_id: "I7",
    number: 7,
    title: "Issue",
    body: "Body",
    html_url: "https://example.test/issues/7",
    state,
    state_reason: state === "closed" ? "completed" : null,
    user: { id: 2, login: "author" },
    assignees: [{ id: 3, login: "assignee" }],
    labels: [{ name: "bug" }],
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-02T00:00:00Z",
    closed_at: state === "closed" ? "2026-01-03T00:00:00Z" : null
  };
}
function comparisonCommit(sha) {
  return {
    sha,
    html_url: `https://example.test/commit/${sha}`,
    author: { id: 1, login: "author" },
    commit: { message: sha, committer: { date: "2026-01-01T00:00:00Z" } }
  };
}
function changedFile(filename) {
  return {
    filename,
    status: "modified",
    additions: 1,
    deletions: 2,
    changes: 3,
    patch: "@@ patch"
  };
}
function compareResponse(commits, files, totalCommits) {
  return {
    base_commit: { sha: "base-sha" },
    merge_base_commit: { sha: "merge-base-sha" },
    status: "ahead",
    ahead_by: totalCommits,
    behind_by: 0,
    total_commits: totalCommits,
    commits,
    files
  };
}
function pullRequestNode(number) {
  return {
    number,
    title: `PR ${number}`,
    author: { databaseId: number, login: `author-${number}` },
    headRefName: `feature-${number}`,
    isDraft: false,
    updatedAt: "2026-01-01T00:00:00Z",
    additions: number,
    deletions: number + 1
  };
}
function pullRequestSummary(number, reviewRequested, assigned) {
  return {
    number,
    title: `PR ${number}`,
    author: { id: String(number), login: `author-${number}` },
    headRef: `feature-${number}`,
    checkoutRef: `refs/pull/${number}/head`,
    draft: false,
    updatedAt: "2026-01-01T00:00:00Z",
    additions: number,
    deletions: number + 1,
    reviewRequestedFromViewer: reviewRequested,
    assignedToViewer: assigned
  };
}
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxwbGF0Zm9ybVxcZ2l0aHViXFx0ZXN0XFxub2RlXFxnaXRodWJRdWVyeVNlcnZpY2UudGVzdC50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCBhc3NlcnQgZnJvbSAnYXNzZXJ0JztcbmltcG9ydCB7IERlZmVycmVkUHJvbWlzZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2FzeW5jLmpzJztcbmltcG9ydCB7IEVtaXR0ZXIgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9ldmVudC5qcyc7XG5pbXBvcnQgeyBoYXNLZXkgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi90eXBlcy5qcyc7XG5pbXBvcnQgeyBJRGlzcG9zYWJsZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL3Rlc3QvY29tbW9uL3V0aWxzLmpzJztcbmltcG9ydCB7IE51bGxMb2dTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vbG9nL2NvbW1vbi9sb2cuanMnO1xuaW1wb3J0IHsgR2l0SHViUmVwb3NpdG9yeVJlZiB9IGZyb20gJy4uLy4uL2NvbW1vbi9naXRodWJRdWVyeVNlcnZpY2UuanMnO1xuaW1wb3J0IHsgR2l0SHViSG9zdENhcGFiaWxpdGllcyB9IGZyb20gJy4uLy4uL2NvbW1vbi9naXRodWJUeXBlcy5qcyc7XG5pbXBvcnQgeyBHaXRIdWJDcmVkZW50aWFsLCBHaXRIdWJDcmVkZW50aWFsSW52YWxpZGF0aW9uLCBJR2l0SHViQ3JlZGVudGlhbHMgfSBmcm9tICcuLi8uLi9jb21tb24vZ2l0aHViQ3JlZGVudGlhbFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSUdpdEh1YkNhcGFiaWxpdGllcyB9IGZyb20gJy4uLy4uL2NvbW1vbi9naXRodWJIb3N0Q2FwYWJpbGl0aWVzU2VydmljZS5qcyc7XG5pbXBvcnQgeyBHaXRIdWJFbnRpdHlQb2xsaW5nUG9saWN5LCBHaXRIdWJRdWVyeVNlcnZpY2UgfSBmcm9tICcuLi8uLi9jb21tb24vZ2l0aHViUXVlcnlTZXJ2aWNlSW1wbC5qcyc7XG5pbXBvcnQgeyBHaXRIdWJUcmFuc3BvcnQgfSBmcm9tICcuLi8uLi9jb21tb24vZ2l0aHViVHJhbnNwb3J0LmpzJztcbmltcG9ydCB7IEZha2VHaXRIdWJTY2hlZHVsZXIgfSBmcm9tICcuL2Zha2VHaXRIdWJTY2hlZHVsZXIuanMnO1xuaW1wb3J0IHsgbm9kZUZldGNoIH0gZnJvbSAnLi9ub2RlRmV0Y2guanMnO1xuaW1wb3J0IHtcblx0Z2l0SHViR3JhcGhRTFJlc3BvbnNlLFxuXHRnaXRIdWJHcmFwaFFMU3RlcCxcblx0Z2l0SHViSnNvblJlc3BvbnNlLFxuXHRnaXRIdWJSZXN0U3RlcCxcblx0UHJvZ3JhbW1hYmxlR2l0SHViU2VydmVyLFxufSBmcm9tICcuL3Byb2dyYW1tYWJsZUdpdEh1YlNlcnZlci5qcyc7XG5cbmNvbnN0IHBvbGljeTogR2l0SHViRW50aXR5UG9sbGluZ1BvbGljeSA9IHtcblx0ZG9ybWFudEdyYWNlOiAyMCxcblx0bWF4aW11bURvcm1hbnRFbnRyaWVzOiAyLFxuXHR2aXNpYmxlOiAxMCxcblx0YmFja2dyb3VuZDogMTAwLFxuXHRqaXR0ZXI6IDAsXG59O1xuXG5jb25zdCBhdmFpbGFibGVDYXBhYmlsaXRpZXM6IEdpdEh1Ykhvc3RDYXBhYmlsaXRpZXMgPSB7XG5cdGdyYXBocWw6IHRydWUsXG5cdG1lcmdlUXVldWU6IHRydWUsXG5cdGludGVybmFsTWVyZ2VTdGF0dXM6IGZhbHNlLFxuXHRyZXZpZXdUaHJlYWRzOiB0cnVlLFxuXHRjaGVja0NvbnRleHRSZXF1aXJlZG5lc3M6IHRydWUsXG59O1xuXG5jbGFzcyBUZXN0Q2FwYWJpbGl0aWVzU2VydmljZSBpbXBsZW1lbnRzIElHaXRIdWJDYXBhYmlsaXRpZXMge1xuXG5cdGNvbnN0cnVjdG9yKHJlYWRvbmx5IHZhbHVlOiBHaXRIdWJIb3N0Q2FwYWJpbGl0aWVzID0gYXZhaWxhYmxlQ2FwYWJpbGl0aWVzKSB7IH1cblxuXHRnZXRDYXBhYmlsaXRpZXMoKTogUHJvbWlzZTxHaXRIdWJIb3N0Q2FwYWJpbGl0aWVzPiB7XG5cdFx0cmV0dXJuIFByb21pc2UucmVzb2x2ZSh0aGlzLnZhbHVlKTtcblx0fVxuXG5cdGNsZWFyKCk6IHZvaWQgeyB9XG59XG5cbmNsYXNzIFNlcXVlbmNlZENhcGFiaWxpdGllc1NlcnZpY2UgaW1wbGVtZW50cyBJR2l0SHViQ2FwYWJpbGl0aWVzIHtcblx0cHJpdmF0ZSBfaW5kZXggPSAwO1xuXG5cdGNvbnN0cnVjdG9yKHByaXZhdGUgcmVhZG9ubHkgX3ZhbHVlczogcmVhZG9ubHkgR2l0SHViSG9zdENhcGFiaWxpdGllc1tdKSB7IH1cblxuXHRnZXRDYXBhYmlsaXRpZXMoKTogUHJvbWlzZTxHaXRIdWJIb3N0Q2FwYWJpbGl0aWVzPiB7XG5cdFx0cmV0dXJuIFByb21pc2UucmVzb2x2ZSh0aGlzLl92YWx1ZXNbTWF0aC5taW4odGhpcy5faW5kZXgrKywgdGhpcy5fdmFsdWVzLmxlbmd0aCAtIDEpXSk7XG5cdH1cblxuXHRjbGVhcigpOiB2b2lkIHsgfVxufVxuXG5jbGFzcyBUZXN0Q3JlZGVudGlhbFNlcnZpY2UgaW1wbGVtZW50cyBJR2l0SHViQ3JlZGVudGlhbHMsIElEaXNwb3NhYmxlIHtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkRpZEludmFsaWRhdGUgPSBuZXcgRW1pdHRlcjxHaXRIdWJDcmVkZW50aWFsSW52YWxpZGF0aW9uPigpO1xuXHRyZWFkb25seSBvbkRpZEludmFsaWRhdGUgPSB0aGlzLl9vbkRpZEludmFsaWRhdGUuZXZlbnQ7XG5cdHByaXZhdGUgcmVhZG9ubHkgX2NvbnRyb2xsZXIgPSBuZXcgQWJvcnRDb250cm9sbGVyKCk7XG5cblx0Y29uc3RydWN0b3IocHJpdmF0ZSByZWFkb25seSBfYWNjb3VudDogeyByZWFkb25seSBob3N0OiBzdHJpbmc7IHJlYWRvbmx5IGFjY291bnRJZDogc3RyaW5nIH0pIHsgfVxuXG5cdGdldENyZWRlbnRpYWwoc2lnbmFsOiBBYm9ydFNpZ25hbCk6IFByb21pc2U8R2l0SHViQ3JlZGVudGlhbD4ge1xuXHRcdGlmIChzaWduYWwuYWJvcnRlZCkge1xuXHRcdFx0cmV0dXJuIFByb21pc2UucmVqZWN0KHNpZ25hbC5yZWFzb24pO1xuXHRcdH1cblx0XHRyZXR1cm4gUHJvbWlzZS5yZXNvbHZlKHtcblx0XHRcdGFjY291bnQ6IHRoaXMuX2FjY291bnQsXG5cdFx0XHR0b2tlbjogJ3Rva2VuJyxcblx0XHRcdGdlbmVyYXRpb246IDEsXG5cdFx0XHRzaWduYWw6IHRoaXMuX2NvbnRyb2xsZXIuc2lnbmFsLFxuXHRcdH0pO1xuXHR9XG5cblx0cmVzb2x2ZUNyZWRlbnRpYWwoX3Rva2VuOiBzdHJpbmcsIHNpZ25hbDogQWJvcnRTaWduYWwpOiBQcm9taXNlPEdpdEh1YkNyZWRlbnRpYWw+IHtcblx0XHRyZXR1cm4gdGhpcy5nZXRDcmVkZW50aWFsKHNpZ25hbCk7XG5cdH1cblxuXHRoYW5kbGVSZXF1ZXN0RXJyb3IoKTogdm9pZCB7IH1cblxuXHRpbnZhbGlkYXRlKCk6IHZvaWQge1xuXHRcdGNvbnN0IGNyZWRlbnRpYWw6IEdpdEh1YkNyZWRlbnRpYWwgPSB7XG5cdFx0XHRhY2NvdW50OiB0aGlzLl9hY2NvdW50LFxuXHRcdFx0dG9rZW46ICd0b2tlbicsXG5cdFx0XHRnZW5lcmF0aW9uOiAxLFxuXHRcdFx0c2lnbmFsOiB0aGlzLl9jb250cm9sbGVyLnNpZ25hbCxcblx0XHR9O1xuXHRcdHRoaXMuX2NvbnRyb2xsZXIuYWJvcnQobmV3IEVycm9yKCdpbnZhbGlkYXRlZCcpKTtcblx0XHR0aGlzLl9vbkRpZEludmFsaWRhdGUuZmlyZSh7IGNyZWRlbnRpYWwsIHJlYXNvbjogJ2FjY291bnQnIH0pO1xuXHR9XG5cblx0ZGlzcG9zZSgpOiB2b2lkIHtcblx0XHR0aGlzLl9jb250cm9sbGVyLmFib3J0KG5ldyBFcnJvcignZGlzcG9zZWQnKSk7XG5cdFx0dGhpcy5fb25EaWRJbnZhbGlkYXRlLmRpc3Bvc2UoKTtcblx0fVxufVxuXG5zdWl0ZSgnR2l0SHViUXVlcnlTZXJ2aWNlJywgKCkgPT4ge1xuXHRjb25zdCBkaXNwb3NhYmxlcyA9IGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSgpO1xuXG5cdGFzeW5jIGZ1bmN0aW9uIHdpdGhTZXJ2ZXIoZm46IChzZXJ2ZXI6IFByb2dyYW1tYWJsZUdpdEh1YlNlcnZlcikgPT4gUHJvbWlzZTx2b2lkPik6IFByb21pc2U8dm9pZD4ge1xuXHRcdGNvbnN0IHNlcnZlciA9IGF3YWl0IFByb2dyYW1tYWJsZUdpdEh1YlNlcnZlci5zdGFydCgpO1xuXHRcdHRyeSB7XG5cdFx0XHRhd2FpdCBmbihzZXJ2ZXIpO1xuXHRcdH0gZmluYWxseSB7XG5cdFx0XHRhd2FpdCBzZXJ2ZXIuZGlzcG9zZUFzeW5jKCk7XG5cdFx0fVxuXHR9XG5cblx0ZnVuY3Rpb24gc2V0dXAoc2VydmVyOiBQcm9ncmFtbWFibGVHaXRIdWJTZXJ2ZXIsIGNhcGFiaWxpdGllczogR2l0SHViSG9zdENhcGFiaWxpdGllcyB8IElHaXRIdWJDYXBhYmlsaXRpZXMgPSBhdmFpbGFibGVDYXBhYmlsaXRpZXMpOiB7XG5cdFx0cmVhZG9ubHkgYWNjb3VudDogeyByZWFkb25seSBob3N0OiBzdHJpbmc7IHJlYWRvbmx5IGFjY291bnRJZDogc3RyaW5nIH07XG5cdFx0cmVhZG9ubHkgcmVmOiBHaXRIdWJSZXBvc2l0b3J5UmVmO1xuXHRcdHJlYWRvbmx5IGNsb2NrOiBGYWtlR2l0SHViU2NoZWR1bGVyO1xuXHRcdHJlYWRvbmx5IGNyZWRlbnRpYWxzOiBUZXN0Q3JlZGVudGlhbFNlcnZpY2U7XG5cdFx0cmVhZG9ubHkgc2VydmljZTogR2l0SHViUXVlcnlTZXJ2aWNlO1xuXHR9IHtcblx0XHRjb25zdCBhY2NvdW50ID0geyBob3N0OiBuZXcgVVJMKHNlcnZlci5hcGlCYXNlVXJsKS5ob3N0LCBhY2NvdW50SWQ6ICcxMDEnIH07XG5cdFx0Y29uc3QgcmVmID0geyAuLi5hY2NvdW50LCBvd25lcjogJ29jdG8nLCByZXBvOiAncmVwbycgfTtcblx0XHRjb25zdCBjbG9jayA9IG5ldyBGYWtlR2l0SHViU2NoZWR1bGVyKHsgbm93OiAwIH0pO1xuXHRcdGNvbnN0IGNyZWRlbnRpYWxzID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBUZXN0Q3JlZGVudGlhbFNlcnZpY2UoYWNjb3VudCkpO1xuXHRcdGNvbnN0IHRyYW5zcG9ydCA9IGRpc3Bvc2FibGVzLmFkZChuZXcgR2l0SHViVHJhbnNwb3J0KG5vZGVGZXRjaCkpO1xuXHRcdGNvbnN0IGNhcGFiaWxpdHlTZXJ2aWNlID0gaGFzS2V5KGNhcGFiaWxpdGllcywgeyBnZXRDYXBhYmlsaXRpZXM6IHRydWUgfSkgPyBjYXBhYmlsaXRpZXMgOiBuZXcgVGVzdENhcGFiaWxpdGllc1NlcnZpY2UoY2FwYWJpbGl0aWVzKTtcblx0XHRjb25zdCBzZXJ2aWNlID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBHaXRIdWJRdWVyeVNlcnZpY2UoXG5cdFx0XHRjbG9jayxcblx0XHRcdHBvbGljeSxcblx0XHRcdGNyZWRlbnRpYWxzLFxuXHRcdFx0dHJhbnNwb3J0LFxuXHRcdFx0c2VydmVyLmNyZWF0ZUVuZHBvaW50U2VydmljZSgpLFxuXHRcdFx0Y2FwYWJpbGl0eVNlcnZpY2UsXG5cdFx0XHRuZXcgTnVsbExvZ1NlcnZpY2UoKSxcblx0XHQpKTtcblx0XHRyZXR1cm4geyBhY2NvdW50LCByZWYsIGNsb2NrLCBjcmVkZW50aWFscywgc2VydmljZSB9O1xuXHR9XG5cblx0dGVzdCgnc2hhcmVzIHJlcG9zaXRvcnkgYW5kIGlzc3VlIHJlc291cmNlcywgY2Fub25pY2FsaXplcyBhbGlhc2VzLCBhbmQgc3RvcHMgdGVybWluYWwgaXNzdWUgcG9sbGluZycsIGFzeW5jICgpID0+IHtcblx0XHRhd2FpdCB3aXRoU2VydmVyKGFzeW5jIHNlcnZlciA9PiB7XG5cdFx0XHRjb25zdCByZXBvc2l0b3J5UG9sbGVkID0gbmV3IERlZmVycmVkUHJvbWlzZTx2b2lkPigpO1xuXHRcdFx0c2VydmVyLmVucXVldWUoXG5cdFx0XHRcdGdpdEh1YlJlc3RTdGVwKHtcblx0XHRcdFx0XHRtZXRob2Q6ICdHRVQnLFxuXHRcdFx0XHRcdHBhdGg6ICcvcmVwb3Mvb2N0by9yZXBvJyxcblx0XHRcdFx0XHRyZXNwb25zZTogZ2l0SHViSnNvblJlc3BvbnNlKHJlcG9zaXRvcnlSZXNwb25zZSgnbmV3LW93bmVyL25ldy1yZXBvJyksIHsgZXRhZzogJ1wicmVwb1wiJyB9KSxcblx0XHRcdFx0fSksXG5cdFx0XHRcdGdpdEh1YlJlc3RTdGVwKHtcblx0XHRcdFx0XHRtZXRob2Q6ICdHRVQnLFxuXHRcdFx0XHRcdHBhdGg6ICcvcmVwb3Mvb2N0by9yZXBvL2lzc3Vlcy83Jyxcblx0XHRcdFx0XHRyZXNwb25zZTogZ2l0SHViSnNvblJlc3BvbnNlKGlzc3VlUmVzcG9uc2UoJ2Nsb3NlZCcpLCB7IGV0YWc6ICdcImlzc3VlXCInIH0pLFxuXHRcdFx0XHR9KSxcblx0XHRcdFx0Z2l0SHViUmVzdFN0ZXAoe1xuXHRcdFx0XHRcdG1ldGhvZDogJ0dFVCcsXG5cdFx0XHRcdFx0cGF0aDogJy9yZXBvcy9uZXctb3duZXIvbmV3LXJlcG8nLFxuXHRcdFx0XHRcdGFzc2VydDogYXN5bmMgKCkgPT4gcmVwb3NpdG9yeVBvbGxlZC5jb21wbGV0ZSgpLFxuXHRcdFx0XHRcdHJlc3BvbnNlOiBnaXRIdWJKc29uUmVzcG9uc2UocmVwb3NpdG9yeVJlc3BvbnNlKCduZXctb3duZXIvbmV3LXJlcG8nKSwgeyBldGFnOiAnXCJyZXBvLTJcIicgfSksXG5cdFx0XHRcdH0pLFxuXHRcdFx0KTtcblx0XHRcdGNvbnN0IHsgYWNjb3VudCwgY2xvY2ssIHNlcnZpY2UgfSA9IHNldHVwKHNlcnZlcik7XG5cdFx0XHRjb25zdCByZXBvc2l0b3J5QSA9IHNlcnZpY2Uuc3Vic2NyaWJlUmVwb3NpdG9yeSh7IC4uLmFjY291bnQsIG93bmVyOiAnb2N0bycsIHJlcG86ICdyZXBvJyB9LCB7IHByaW9yaXR5OiAndmlzaWJsZScgfSk7XG5cdFx0XHRjb25zdCByZXBvc2l0b3J5QiA9IHNlcnZpY2Uuc3Vic2NyaWJlUmVwb3NpdG9yeSh7IC4uLmFjY291bnQsIG93bmVyOiAnT0NUTycsIHJlcG86ICdSRVBPJyB9LCB7IHByaW9yaXR5OiAnYmFja2dyb3VuZCcgfSk7XG5cdFx0XHRjb25zdCBpc3N1ZUEgPSBzZXJ2aWNlLnN1YnNjcmliZUlzc3VlKHsgLi4uYWNjb3VudCwgb3duZXI6ICdvY3RvJywgcmVwbzogJ3JlcG8nLCBudW1iZXI6IDcgfSwgeyBwcmlvcml0eTogJ3Zpc2libGUnIH0pO1xuXHRcdFx0Y29uc3QgaXNzdWVCID0gc2VydmljZS5zdWJzY3JpYmVJc3N1ZSh7IC4uLmFjY291bnQsIG93bmVyOiAnT0NUTycsIHJlcG86ICdSRVBPJywgbnVtYmVyOiA3IH0sIHsgcHJpb3JpdHk6ICdiYWNrZ3JvdW5kJyB9KTtcblxuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlcG9zaXRvcnlBLnJlc291cmNlLCByZXBvc2l0b3J5Qi5yZXNvdXJjZSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoaXNzdWVBLnJlc291cmNlLCBpc3N1ZUIucmVzb3VyY2UpO1xuXHRcdFx0YXdhaXQgUHJvbWlzZS5hbGwoW3JlcG9zaXRvcnlBLnJlZnJlc2goKSwgaXNzdWVBLnJlZnJlc2goKV0pO1xuXHRcdFx0Y29uc3QgY2Fub25pY2FsID0gc2VydmljZS5zdWJzY3JpYmVSZXBvc2l0b3J5KHsgLi4uYWNjb3VudCwgb3duZXI6ICduZXctb3duZXInLCByZXBvOiAnbmV3LXJlcG8nIH0sIHsgcHJpb3JpdHk6ICdiYWNrZ3JvdW5kJyB9KTtcblxuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRcdGNhbm9uaWNhbFNoYXJlZDogY2Fub25pY2FsLnJlc291cmNlID09PSByZXBvc2l0b3J5QS5yZXNvdXJjZSxcblx0XHRcdFx0cmVwb3NpdG9yeVJlZjogcmVwb3NpdG9yeUEucmVzb3VyY2UucmVmLFxuXHRcdFx0XHRyZXBvc2l0b3J5OiByZXBvc2l0b3J5QS5yZXNvdXJjZS5zdGF0ZS5nZXQoKSxcblx0XHRcdFx0aXNzdWU6IGlzc3VlQS5yZXNvdXJjZS5zdGF0ZS5nZXQoKSxcblx0XHRcdH0sIHtcblx0XHRcdFx0Y2Fub25pY2FsU2hhcmVkOiB0cnVlLFxuXHRcdFx0XHRyZXBvc2l0b3J5UmVmOiB7IC4uLmFjY291bnQsIG93bmVyOiAnbmV3LW93bmVyJywgcmVwbzogJ25ldy1yZXBvJyB9LFxuXHRcdFx0XHRyZXBvc2l0b3J5OiB7XG5cdFx0XHRcdFx0dmFsdWU6IHtcblx0XHRcdFx0XHRcdGlkOiAnUjEnLFxuXHRcdFx0XHRcdFx0b3duZXI6IHsgaWQ6ICcxJywgbG9naW46ICduZXctb3duZXInIH0sXG5cdFx0XHRcdFx0XHRuYW1lOiAnbmV3LXJlcG8nLFxuXHRcdFx0XHRcdFx0bmFtZVdpdGhPd25lcjogJ25ldy1vd25lci9uZXctcmVwbycsXG5cdFx0XHRcdFx0XHRkZWZhdWx0QnJhbmNoOiAnbWFpbicsXG5cdFx0XHRcdFx0XHRwcml2YXRlOiB0cnVlLFxuXHRcdFx0XHRcdFx0ZGVzY3JpcHRpb246ICdyZXBvJyxcblx0XHRcdFx0XHRcdHVybDogJ2h0dHBzOi8vZXhhbXBsZS50ZXN0L25ldy1vd25lci9uZXctcmVwbycsXG5cdFx0XHRcdFx0XHRhcmNoaXZlZDogZmFsc2UsXG5cdFx0XHRcdFx0XHRmb3JrOiBmYWxzZSxcblx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdHN0YXR1czogJ3JlYWR5Jyxcblx0XHRcdFx0XHRjb21wbGV0ZTogdHJ1ZSxcblx0XHRcdFx0XHRvYnNlcnZlZEF0OiBuZXcgRGF0ZSgwKS50b0lTT1N0cmluZygpLFxuXHRcdFx0XHRcdGF0dGVtcHRlZEF0OiBuZXcgRGF0ZSgwKS50b0lTT1N0cmluZygpLFxuXHRcdFx0XHR9LFxuXHRcdFx0XHRpc3N1ZToge1xuXHRcdFx0XHRcdHZhbHVlOiB7XG5cdFx0XHRcdFx0XHRpZDogJ0k3Jyxcblx0XHRcdFx0XHRcdG51bWJlcjogNyxcblx0XHRcdFx0XHRcdHRpdGxlOiAnSXNzdWUnLFxuXHRcdFx0XHRcdFx0Ym9keTogJ0JvZHknLFxuXHRcdFx0XHRcdFx0dXJsOiAnaHR0cHM6Ly9leGFtcGxlLnRlc3QvaXNzdWVzLzcnLFxuXHRcdFx0XHRcdFx0c3RhdGU6ICdjbG9zZWQnLFxuXHRcdFx0XHRcdFx0c3RhdGVSZWFzb246ICdjb21wbGV0ZWQnLFxuXHRcdFx0XHRcdFx0YXV0aG9yOiB7IGlkOiAnMicsIGxvZ2luOiAnYXV0aG9yJyB9LFxuXHRcdFx0XHRcdFx0YXNzaWduZWVzOiBbeyBpZDogJzMnLCBsb2dpbjogJ2Fzc2lnbmVlJyB9XSxcblx0XHRcdFx0XHRcdGxhYmVsczogWydidWcnXSxcblx0XHRcdFx0XHRcdGNyZWF0ZWRBdDogJzIwMjYtMDEtMDFUMDA6MDA6MDBaJyxcblx0XHRcdFx0XHRcdHVwZGF0ZWRBdDogJzIwMjYtMDEtMDJUMDA6MDA6MDBaJyxcblx0XHRcdFx0XHRcdGNsb3NlZEF0OiAnMjAyNi0wMS0wM1QwMDowMDowMFonLFxuXHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0c3RhdHVzOiAncmVhZHknLFxuXHRcdFx0XHRcdGNvbXBsZXRlOiB0cnVlLFxuXHRcdFx0XHRcdG9ic2VydmVkQXQ6IG5ldyBEYXRlKDApLnRvSVNPU3RyaW5nKCksXG5cdFx0XHRcdFx0YXR0ZW1wdGVkQXQ6IG5ldyBEYXRlKDApLnRvSVNPU3RyaW5nKCksXG5cdFx0XHRcdH0sXG5cdFx0XHR9KTtcblxuXHRcdFx0Y2xvY2suYWR2YW5jZUJ5KDEwKTtcblx0XHRcdGF3YWl0IHJlcG9zaXRvcnlQb2xsZWQucDtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoc2VydmVyLnJlcXVlc3RzLm1hcChyZXF1ZXN0ID0+IHJlcXVlc3Quc2VydmljZVBhdGgpLCBbXG5cdFx0XHRcdCcvcmVwb3Mvb2N0by9yZXBvJyxcblx0XHRcdFx0Jy9yZXBvcy9vY3RvL3JlcG8vaXNzdWVzLzcnLFxuXHRcdFx0XHQnL3JlcG9zL25ldy1vd25lci9uZXctcmVwbycsXG5cdFx0XHRdKTtcblxuXHRcdFx0cmVwb3NpdG9yeUEuZGlzcG9zZSgpO1xuXHRcdFx0cmVwb3NpdG9yeUIuZGlzcG9zZSgpO1xuXHRcdFx0Y2Fub25pY2FsLmRpc3Bvc2UoKTtcblx0XHRcdGlzc3VlQS5kaXNwb3NlKCk7XG5cdFx0XHRpc3N1ZUIuZGlzcG9zZSgpO1xuXHRcdFx0c2VydmVyLmFzc2VydFNhdGlzZmllZCgpO1xuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdyZXRhaW5zIGRvcm1hbnQgZW50aXR5IGlkZW50aXR5IGJyaWVmbHkgYW5kIHB1cmdlcyByZXNvdXJjZXMgb24gYWNjb3VudCBjaGFuZ2UnLCBhc3luYyAoKSA9PiB7XG5cdFx0YXdhaXQgd2l0aFNlcnZlcihhc3luYyBzZXJ2ZXIgPT4ge1xuXHRcdFx0Y29uc3QgcmVzdW1lZFBvbGwgPSBuZXcgRGVmZXJyZWRQcm9taXNlPHZvaWQ+KCk7XG5cdFx0XHRzZXJ2ZXIuZW5xdWV1ZShcblx0XHRcdFx0Z2l0SHViUmVzdFN0ZXAoe1xuXHRcdFx0XHRcdG1ldGhvZDogJ0dFVCcsXG5cdFx0XHRcdFx0cGF0aDogJy9yZXBvcy9vY3RvL3JlcG8nLFxuXHRcdFx0XHRcdHJlc3BvbnNlOiBnaXRIdWJKc29uUmVzcG9uc2UocmVwb3NpdG9yeVJlc3BvbnNlKCdvY3RvL3JlcG8nKSksXG5cdFx0XHRcdH0pLFxuXHRcdFx0XHRnaXRIdWJSZXN0U3RlcCh7XG5cdFx0XHRcdFx0bWV0aG9kOiAnR0VUJyxcblx0XHRcdFx0XHRwYXRoOiAnL3JlcG9zL29jdG8vcmVwbycsXG5cdFx0XHRcdFx0YXNzZXJ0OiBhc3luYyAoKSA9PiByZXN1bWVkUG9sbC5jb21wbGV0ZSgpLFxuXHRcdFx0XHRcdHJlc3BvbnNlOiBnaXRIdWJKc29uUmVzcG9uc2UocmVwb3NpdG9yeVJlc3BvbnNlKCdvY3RvL3JlcG8nKSksXG5cdFx0XHRcdH0pLFxuXHRcdFx0KTtcblx0XHRcdGNvbnN0IHsgY3JlZGVudGlhbHMsIGNsb2NrLCByZWYsIHNlcnZpY2UgfSA9IHNldHVwKHNlcnZlcik7XG5cdFx0XHRjb25zdCBmaXJzdCA9IHNlcnZpY2Uuc3Vic2NyaWJlUmVwb3NpdG9yeShyZWYsIHsgcHJpb3JpdHk6ICdiYWNrZ3JvdW5kJyB9KTtcblx0XHRcdGF3YWl0IGZpcnN0LnJlZnJlc2goKTtcblx0XHRcdGNvbnN0IHJlc291cmNlID0gZmlyc3QucmVzb3VyY2U7XG5cdFx0XHRmaXJzdC5kaXNwb3NlKCk7XG5cblx0XHRcdGNsb2NrLmFkdmFuY2VCeSgxOSk7XG5cdFx0XHRjb25zdCByZXN1bWVkID0gc2VydmljZS5zdWJzY3JpYmVSZXBvc2l0b3J5KHJlZiwgeyBwcmlvcml0eTogJ2JhY2tncm91bmQnIH0pO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VtZWQucmVzb3VyY2UsIHJlc291cmNlKTtcblx0XHRcdGNsb2NrLmFkdmFuY2VCeSgxMDApO1xuXHRcdFx0YXdhaXQgcmVzdW1lZFBvbGwucDtcblx0XHRcdGNyZWRlbnRpYWxzLmludmFsaWRhdGUoKTtcblx0XHRcdGF3YWl0IGFzc2VydC5yZWplY3RzKCgpID0+IHJlc3VtZWQucmVmcmVzaCgpLCAvZGlzcG9zZWQvKTtcblx0XHRcdGNvbnN0IHJlcGxhY2VkID0gc2VydmljZS5zdWJzY3JpYmVSZXBvc2l0b3J5KHJlZiwgeyBwcmlvcml0eTogJ2JhY2tncm91bmQnIH0pO1xuXHRcdFx0YXNzZXJ0Lm5vdFN0cmljdEVxdWFsKHJlcGxhY2VkLnJlc291cmNlLCByZXNvdXJjZSk7XG5cdFx0XHRyZXN1bWVkLmRpc3Bvc2UoKTtcblx0XHRcdHJlcGxhY2VkLmRpc3Bvc2UoKTtcblx0XHRcdHNlcnZlci5hc3NlcnRTYXRpc2ZpZWQoKTtcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnaW1tZWRpYXRlbHkgcmVzdGFydHMgYW4gYWJvcnRlZCBmaXJzdCBsb2FkIHdoZW4gYSBkb3JtYW50IHJlc291cmNlIHJlc3VtZXMnLCBhc3luYyAoKSA9PiB7XG5cdFx0YXdhaXQgd2l0aFNlcnZlcihhc3luYyBzZXJ2ZXIgPT4ge1xuXHRcdFx0Y29uc3QgZmlyc3RTdGFydGVkID0gbmV3IERlZmVycmVkUHJvbWlzZTx2b2lkPigpO1xuXHRcdFx0Y29uc3QgcmVsZWFzZUZpcnN0ID0gbmV3IERlZmVycmVkUHJvbWlzZTx2b2lkPigpO1xuXHRcdFx0Y29uc3QgcmVzdW1lZFN0YXJ0ZWQgPSBuZXcgRGVmZXJyZWRQcm9taXNlPHZvaWQ+KCk7XG5cdFx0XHRzZXJ2ZXIuZW5xdWV1ZShcblx0XHRcdFx0Z2l0SHViUmVzdFN0ZXAoe1xuXHRcdFx0XHRcdG1ldGhvZDogJ0dFVCcsXG5cdFx0XHRcdFx0cGF0aDogJy9yZXBvcy9vY3RvL3JlcG8nLFxuXHRcdFx0XHRcdGFzc2VydDogYXN5bmMgKCkgPT4gZmlyc3RTdGFydGVkLmNvbXBsZXRlKCksXG5cdFx0XHRcdFx0d2FpdEZvcjogcmVsZWFzZUZpcnN0LnAsXG5cdFx0XHRcdFx0cmVzcG9uc2U6IGdpdEh1Ykpzb25SZXNwb25zZShyZXBvc2l0b3J5UmVzcG9uc2UoJ29jdG8vcmVwbycpKSxcblx0XHRcdFx0fSksXG5cdFx0XHRcdGdpdEh1YlJlc3RTdGVwKHtcblx0XHRcdFx0XHRtZXRob2Q6ICdHRVQnLFxuXHRcdFx0XHRcdHBhdGg6ICcvcmVwb3Mvb2N0by9yZXBvJyxcblx0XHRcdFx0XHRhc3NlcnQ6IGFzeW5jICgpID0+IHJlc3VtZWRTdGFydGVkLmNvbXBsZXRlKCksXG5cdFx0XHRcdFx0cmVzcG9uc2U6IGdpdEh1Ykpzb25SZXNwb25zZShyZXBvc2l0b3J5UmVzcG9uc2UoJ29jdG8vcmVwbycpKSxcblx0XHRcdFx0fSksXG5cdFx0XHQpO1xuXHRcdFx0Y29uc3QgeyBjbG9jaywgcmVmLCBzZXJ2aWNlIH0gPSBzZXR1cChzZXJ2ZXIpO1xuXHRcdFx0Y29uc3QgZmlyc3QgPSBzZXJ2aWNlLnN1YnNjcmliZVJlcG9zaXRvcnkocmVmLCB7IHByaW9yaXR5OiAnYmFja2dyb3VuZCcgfSk7XG5cdFx0XHRjb25zdCBmaXJzdFJlZnJlc2ggPSBmaXJzdC5yZWZyZXNoKCk7XG5cdFx0XHRhd2FpdCBmaXJzdFN0YXJ0ZWQucDtcblx0XHRcdGZpcnN0LmRpc3Bvc2UoKTtcblx0XHRcdGF3YWl0IGFzc2VydC5yZWplY3RzKCgpID0+IGZpcnN0UmVmcmVzaCk7XG5cblx0XHRcdGNvbnN0IHJlc3VtZWQgPSBzZXJ2aWNlLnN1YnNjcmliZVJlcG9zaXRvcnkocmVmLCB7IHByaW9yaXR5OiAnYmFja2dyb3VuZCcgfSk7XG5cdFx0XHRjbG9jay5mbHVzaER1ZSgpO1xuXHRcdFx0YXdhaXQgcmVzdW1lZFN0YXJ0ZWQucDtcblx0XHRcdGF3YWl0IHJlc3VtZWQucmVmcmVzaCgpO1xuXHRcdFx0YXdhaXQgcmVsZWFzZUZpcnN0LmNvbXBsZXRlKCk7XG5cblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0XHRzYW1lUmVzb3VyY2U6IHJlc3VtZWQucmVzb3VyY2UgPT09IGZpcnN0LnJlc291cmNlLFxuXHRcdFx0XHRzdGF0dXM6IHJlc3VtZWQucmVzb3VyY2Uuc3RhdGUuZ2V0KCkuc3RhdHVzLFxuXHRcdFx0XHRyZXF1ZXN0Q291bnQ6IHNlcnZlci5yZXF1ZXN0cy5sZW5ndGgsXG5cdFx0XHR9LCB7XG5cdFx0XHRcdHNhbWVSZXNvdXJjZTogdHJ1ZSxcblx0XHRcdFx0c3RhdHVzOiAncmVhZHknLFxuXHRcdFx0XHRyZXF1ZXN0Q291bnQ6IDIsXG5cdFx0XHR9KTtcblx0XHRcdHJlc3VtZWQuZGlzcG9zZSgpO1xuXHRcdFx0c2VydmVyLmFzc2VydFNhdGlzZmllZCgpO1xuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdwYWdpbmF0ZXMgY29tcGFyaXNvbnMgYW5kIHJlcG9ydHMgY2hhbmdlZC1maWxlIGNvbXBsZXRlbmVzcyBleHBsaWNpdGx5JywgYXN5bmMgKCkgPT4ge1xuXHRcdGF3YWl0IHdpdGhTZXJ2ZXIoYXN5bmMgc2VydmVyID0+IHtcblx0XHRcdGNvbnN0IGZpcnN0Q29tbWl0cyA9IEFycmF5LmZyb20oeyBsZW5ndGg6IDEwMCB9LCAoXywgaW5kZXgpID0+IGNvbXBhcmlzb25Db21taXQoYGMke2luZGV4fWApKTtcblx0XHRcdGNvbnN0IGZpbGVzID0gQXJyYXkuZnJvbSh7IGxlbmd0aDogMzAwIH0sIChfLCBpbmRleCkgPT4gY2hhbmdlZEZpbGUoYGYke2luZGV4fS50c2ApKTtcblx0XHRcdHNlcnZlci5lbnF1ZXVlKFxuXHRcdFx0XHRnaXRIdWJSZXN0U3RlcCh7XG5cdFx0XHRcdFx0bWV0aG9kOiAnR0VUJyxcblx0XHRcdFx0XHRwYXRoOiAnL3JlcG9zL29jdG8vcmVwby9jb21wYXJlL2Jhc2UuLi5oZWFkJyxcblx0XHRcdFx0XHRxdWVyeTogeyBwZXJfcGFnZTogMTAwLCBwYWdlOiAxIH0sXG5cdFx0XHRcdFx0cmVzcG9uc2U6IGdpdEh1Ykpzb25SZXNwb25zZShjb21wYXJlUmVzcG9uc2UoZmlyc3RDb21taXRzLCBmaWxlcywgMTAxKSksXG5cdFx0XHRcdH0pLFxuXHRcdFx0XHRnaXRIdWJSZXN0U3RlcCh7XG5cdFx0XHRcdFx0bWV0aG9kOiAnR0VUJyxcblx0XHRcdFx0XHRwYXRoOiAnL3JlcG9zL29jdG8vcmVwby9jb21wYXJlL2Jhc2UuLi5oZWFkJyxcblx0XHRcdFx0XHRxdWVyeTogeyBwZXJfcGFnZTogMTAwLCBwYWdlOiAyIH0sXG5cdFx0XHRcdFx0cmVzcG9uc2U6IGdpdEh1Ykpzb25SZXNwb25zZShjb21wYXJlUmVzcG9uc2UoW2NvbXBhcmlzb25Db21taXQoJ2hlYWQtc2hhJyldLCBmaWxlcywgMTAxKSksXG5cdFx0XHRcdH0pLFxuXHRcdFx0KTtcblx0XHRcdGNvbnN0IHsgcmVmLCBzZXJ2aWNlIH0gPSBzZXR1cChzZXJ2ZXIpO1xuXG5cdFx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCBzZXJ2aWNlLmNvbXBhcmUocmVmLCAnYmFzZScsICdoZWFkJywgc2lnbmFsKCkpO1xuXG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdFx0YmFzZVNoYTogcmVzdWx0LmJhc2VTaGEsXG5cdFx0XHRcdG1lcmdlQmFzZVNoYTogcmVzdWx0Lm1lcmdlQmFzZVNoYSxcblx0XHRcdFx0aGVhZFNoYTogcmVzdWx0LmhlYWRTaGEsXG5cdFx0XHRcdGNvbW1pdENvdW50OiByZXN1bHQuY29tbWl0cy5sZW5ndGgsXG5cdFx0XHRcdGNvbW1pdHNDb21wbGV0ZTogcmVzdWx0LmNvbW1pdHNDb21wbGV0ZSxcblx0XHRcdFx0ZmlsZUNvdW50OiByZXN1bHQuZmlsZXMubGVuZ3RoLFxuXHRcdFx0XHRmaWxlc0NvbXBsZXRlOiByZXN1bHQuZmlsZXNDb21wbGV0ZSxcblx0XHRcdH0sIHtcblx0XHRcdFx0YmFzZVNoYTogJ2Jhc2Utc2hhJyxcblx0XHRcdFx0bWVyZ2VCYXNlU2hhOiAnbWVyZ2UtYmFzZS1zaGEnLFxuXHRcdFx0XHRoZWFkU2hhOiAnaGVhZC1zaGEnLFxuXHRcdFx0XHRjb21taXRDb3VudDogMTAxLFxuXHRcdFx0XHRjb21taXRzQ29tcGxldGU6IHRydWUsXG5cdFx0XHRcdGZpbGVDb3VudDogMzAwLFxuXHRcdFx0XHRmaWxlc0NvbXBsZXRlOiBmYWxzZSxcblx0XHRcdH0pO1xuXHRcdFx0c2VydmVyLmFzc2VydFNhdGlzZmllZCgpO1xuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdmYWlscyBjbG9zZWQgd2hlbiBjb21wYXJpc29uIGNvbW1pdHMgb3IgZmlsZXMgYXJlIGluY29tcGxldGUnLCBhc3luYyAoKSA9PiB7XG5cdFx0YXdhaXQgd2l0aFNlcnZlcihhc3luYyBzZXJ2ZXIgPT4ge1xuXHRcdFx0c2VydmVyLmVucXVldWUoZ2l0SHViUmVzdFN0ZXAoe1xuXHRcdFx0XHRtZXRob2Q6ICdHRVQnLFxuXHRcdFx0XHRwYXRoOiAnL3JlcG9zL29jdG8vcmVwby9jb21wYXJlL2Jhc2UuLi5oZWFkJyxcblx0XHRcdFx0cXVlcnk6IHsgcGVyX3BhZ2U6IDEwMCwgcGFnZTogMSB9LFxuXHRcdFx0XHRyZXNwb25zZTogZ2l0SHViSnNvblJlc3BvbnNlKHtcblx0XHRcdFx0XHRiYXNlX2NvbW1pdDogeyBzaGE6ICdiYXNlLXNoYScgfSxcblx0XHRcdFx0XHRtZXJnZV9iYXNlX2NvbW1pdDogeyBzaGE6ICdtZXJnZS1iYXNlLXNoYScgfSxcblx0XHRcdFx0XHRzdGF0dXM6ICdhaGVhZCcsXG5cdFx0XHRcdFx0YWhlYWRfYnk6IDIsXG5cdFx0XHRcdFx0YmVoaW5kX2J5OiAwLFxuXHRcdFx0XHRcdHRvdGFsX2NvbW1pdHM6IDIsXG5cdFx0XHRcdFx0Y29tbWl0czogW2NvbXBhcmlzb25Db21taXQoJ3BhcnRpYWwnKV0sXG5cdFx0XHRcdH0pLFxuXHRcdFx0fSkpO1xuXHRcdFx0Y29uc3QgeyByZWYsIHNlcnZpY2UgfSA9IHNldHVwKHNlcnZlcik7XG5cblx0XHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IHNlcnZpY2UuY29tcGFyZShyZWYsICdiYXNlJywgJ2hlYWQnLCBzaWduYWwoKSk7XG5cblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0XHRoZWFkU2hhOiByZXN1bHQuaGVhZFNoYSxcblx0XHRcdFx0Y29tbWl0c0NvbXBsZXRlOiByZXN1bHQuY29tbWl0c0NvbXBsZXRlLFxuXHRcdFx0XHRmaWxlczogcmVzdWx0LmZpbGVzLFxuXHRcdFx0XHRmaWxlc0NvbXBsZXRlOiByZXN1bHQuZmlsZXNDb21wbGV0ZSxcblx0XHRcdH0sIHtcblx0XHRcdFx0aGVhZFNoYTogdW5kZWZpbmVkLFxuXHRcdFx0XHRjb21taXRzQ29tcGxldGU6IGZhbHNlLFxuXHRcdFx0XHRmaWxlczogW10sXG5cdFx0XHRcdGZpbGVzQ29tcGxldGU6IGZhbHNlLFxuXHRcdFx0fSk7XG5cdFx0XHRzZXJ2ZXIuYXNzZXJ0U2F0aXNmaWVkKCk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2xpc3RzIHB1bGwgcmVxdWVzdCBwYWdlcyBhbmQgdmlld2VyLXNwZWNpZmljIHNlYXJjaGVzJywgYXN5bmMgKCkgPT4ge1xuXHRcdGF3YWl0IHdpdGhTZXJ2ZXIoYXN5bmMgc2VydmVyID0+IHtcblx0XHRcdHNlcnZlci5lbnF1ZXVlKFxuXHRcdFx0XHRnaXRIdWJHcmFwaFFMU3RlcCh7XG5cdFx0XHRcdFx0cXVlcnlJbmNsdWRlczogJ0FnZW50SG9zdExpc3RQdWxsUmVxdWVzdHMnLFxuXHRcdFx0XHRcdHJlc3BvbnNlOiBnaXRIdWJHcmFwaFFMUmVzcG9uc2Uoe1xuXHRcdFx0XHRcdFx0cmVwb3NpdG9yeToge1xuXHRcdFx0XHRcdFx0XHRwdWxsUmVxdWVzdHM6IHtcblx0XHRcdFx0XHRcdFx0XHRub2RlczogW3B1bGxSZXF1ZXN0Tm9kZSgxKV0sXG5cdFx0XHRcdFx0XHRcdFx0cGFnZUluZm86IHsgZW5kQ3Vyc29yOiAnY3Vyc29yLTEnLCBoYXNOZXh0UGFnZTogdHJ1ZSB9LFxuXHRcdFx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdFx0fSxcblx0XHRcdFx0XHR9KSxcblx0XHRcdFx0fSksXG5cdFx0XHRcdGdpdEh1YkdyYXBoUUxTdGVwKHtcblx0XHRcdFx0XHRxdWVyeUluY2x1ZGVzOiAnQWdlbnRIb3N0U2VhcmNoUHVsbFJlcXVlc3RzJyxcblx0XHRcdFx0XHRhc3NlcnQ6IHJlcXVlc3QgPT4gYXNzZXJ0LnN0cmljdEVxdWFsKChyZXF1ZXN0LmdyYXBoUWw/LnZhcmlhYmxlcyBhcyB7IHF1ZXJ5Pzogc3RyaW5nIH0pPy5xdWVyeT8uaW5jbHVkZXMoJ3Jldmlldy1yZXF1ZXN0ZWQ6QG1lJyksIHRydWUpLFxuXHRcdFx0XHRcdHJlc3BvbnNlOiBnaXRIdWJHcmFwaFFMUmVzcG9uc2UoeyBzZWFyY2g6IHsgbm9kZXM6IFtwdWxsUmVxdWVzdE5vZGUoMildIH0gfSksXG5cdFx0XHRcdH0pLFxuXHRcdFx0XHRnaXRIdWJHcmFwaFFMU3RlcCh7XG5cdFx0XHRcdFx0cXVlcnlJbmNsdWRlczogJ0FnZW50SG9zdFNlYXJjaFB1bGxSZXF1ZXN0cycsXG5cdFx0XHRcdFx0YXNzZXJ0OiByZXF1ZXN0ID0+IGFzc2VydC5zdHJpY3RFcXVhbCgocmVxdWVzdC5ncmFwaFFsPy52YXJpYWJsZXMgYXMgeyBxdWVyeT86IHN0cmluZyB9KT8ucXVlcnk/LmluY2x1ZGVzKCdhc3NpZ25lZTpAbWUnKSwgdHJ1ZSksXG5cdFx0XHRcdFx0cmVzcG9uc2U6IGdpdEh1YkdyYXBoUUxSZXNwb25zZSh7IHNlYXJjaDogeyBub2RlczogW3B1bGxSZXF1ZXN0Tm9kZSgzKV0gfSB9KSxcblx0XHRcdFx0fSksXG5cdFx0XHQpO1xuXHRcdFx0Y29uc3QgeyByZWYsIHNlcnZpY2UgfSA9IHNldHVwKHNlcnZlcik7XG5cblx0XHRcdGNvbnN0IHBhZ2UgPSBhd2FpdCBzZXJ2aWNlLmxpc3RQdWxsUmVxdWVzdHMocmVmLCB1bmRlZmluZWQsIHNpZ25hbCgpKTtcblx0XHRcdGNvbnN0IHJldmlld3MgPSBhd2FpdCBzZXJ2aWNlLmxpc3RQdWxsUmVxdWVzdHNXYWl0aW5nRm9yUmV2aWV3KHJlZiwgc2lnbmFsKCkpO1xuXHRcdFx0Y29uc3QgYXNzaWduZWQgPSBhd2FpdCBzZXJ2aWNlLmxpc3RQdWxsUmVxdWVzdHNBc3NpZ25lZFRvVmlld2VyKHJlZiwgc2lnbmFsKCkpO1xuXG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdFx0cGFnZSxcblx0XHRcdFx0cmV2aWV3UmVxdWVzdGVkOiByZXZpZXdzLm1hcChpdGVtID0+ICh7IG51bWJlcjogaXRlbS5udW1iZXIsIGZsYWc6IGl0ZW0ucmV2aWV3UmVxdWVzdGVkRnJvbVZpZXdlciB9KSksXG5cdFx0XHRcdGFzc2lnbmVkOiBhc3NpZ25lZC5tYXAoaXRlbSA9PiAoeyBudW1iZXI6IGl0ZW0ubnVtYmVyLCBmbGFnOiBpdGVtLmFzc2lnbmVkVG9WaWV3ZXIgfSkpLFxuXHRcdFx0fSwge1xuXHRcdFx0XHRwYWdlOiB7XG5cdFx0XHRcdFx0cHVsbFJlcXVlc3RzOiBbcHVsbFJlcXVlc3RTdW1tYXJ5KDEsIGZhbHNlLCBmYWxzZSldLFxuXHRcdFx0XHRcdGN1cnNvcjogJ2N1cnNvci0xJyxcblx0XHRcdFx0XHRoYXNOZXh0UGFnZTogdHJ1ZSxcblx0XHRcdFx0fSxcblx0XHRcdFx0cmV2aWV3UmVxdWVzdGVkOiBbeyBudW1iZXI6IDIsIGZsYWc6IHRydWUgfV0sXG5cdFx0XHRcdGFzc2lnbmVkOiBbeyBudW1iZXI6IDMsIGZsYWc6IHRydWUgfV0sXG5cdFx0XHR9KTtcblx0XHRcdHNlcnZlci5hc3NlcnRTYXRpc2ZpZWQoKTtcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnYnVpbGRzIGNvbXBsZXRlIHB1bGwgcmVxdWVzdCBjb250ZXh0IGZyb20gcGFnaW5hdGVkIGZpbGVzIGFuZCBjb21tZW50cycsIGFzeW5jICgpID0+IHtcblx0XHRhd2FpdCB3aXRoU2VydmVyKGFzeW5jIHNlcnZlciA9PiB7XG5cdFx0XHRzZXJ2ZXIuZW5xdWV1ZShcblx0XHRcdFx0Z2l0SHViUmVzdFN0ZXAoe1xuXHRcdFx0XHRcdG1ldGhvZDogJ0dFVCcsXG5cdFx0XHRcdFx0cGF0aDogJy9yZXBvcy9vY3RvL3JlcG8vcHVsbHMvNycsXG5cdFx0XHRcdFx0cmVzcG9uc2U6IGdpdEh1Ykpzb25SZXNwb25zZSh7XG5cdFx0XHRcdFx0XHRudW1iZXI6IDcsXG5cdFx0XHRcdFx0XHRodG1sX3VybDogJ2h0dHBzOi8vZXhhbXBsZS50ZXN0L3B1bGwvNycsXG5cdFx0XHRcdFx0XHR0aXRsZTogJ1BSJyxcblx0XHRcdFx0XHRcdGJvZHk6ICdEZXNjcmlwdGlvbicsXG5cdFx0XHRcdFx0XHR1c2VyOiB7IGxvZ2luOiAnYXV0aG9yJyB9LFxuXHRcdFx0XHRcdFx0ZHJhZnQ6IGZhbHNlLFxuXHRcdFx0XHRcdFx0YmFzZTogeyByZWY6ICdtYWluJyB9LFxuXHRcdFx0XHRcdFx0aGVhZDogeyByZWY6ICdmZWF0dXJlJyB9LFxuXHRcdFx0XHRcdFx0dXBkYXRlZF9hdDogJzIwMjYtMDEtMDRUMDA6MDA6MDBaJyxcblx0XHRcdFx0XHR9KSxcblx0XHRcdFx0fSksXG5cdFx0XHRcdGdpdEh1YlJlc3RTdGVwKHtcblx0XHRcdFx0XHRtZXRob2Q6ICdHRVQnLFxuXHRcdFx0XHRcdHBhdGg6ICcvcmVwb3Mvb2N0by9yZXBvL3B1bGxzLzcvZmlsZXMnLFxuXHRcdFx0XHRcdHF1ZXJ5OiB7IHBlcl9wYWdlOiAxMDAsIHBhZ2U6IDEgfSxcblx0XHRcdFx0XHRyZXNwb25zZTogZ2l0SHViSnNvblJlc3BvbnNlKFt7IGZpbGVuYW1lOiAnYS50cycsIHN0YXR1czogJ21vZGlmaWVkJywgYWRkaXRpb25zOiAxLCBkZWxldGlvbnM6IDIsIHBhdGNoOiAnQEAgcGF0Y2gnIH1dKSxcblx0XHRcdFx0fSksXG5cdFx0XHRcdGdpdEh1YlJlc3RTdGVwKHtcblx0XHRcdFx0XHRtZXRob2Q6ICdHRVQnLFxuXHRcdFx0XHRcdHBhdGg6ICcvcmVwb3Mvb2N0by9yZXBvL2lzc3Vlcy83L2NvbW1lbnRzJyxcblx0XHRcdFx0XHRxdWVyeTogeyBwZXJfcGFnZTogMTAwLCBwYWdlOiAxIH0sXG5cdFx0XHRcdFx0cmVzcG9uc2U6IGdpdEh1Ykpzb25SZXNwb25zZShbeyBib2R5OiAnaXNzdWUnLCB1c2VyOiB7IGxvZ2luOiAnYScgfSwgY3JlYXRlZF9hdDogJzIwMjYtMDEtMDJUMDA6MDA6MDBaJywgdXBkYXRlZF9hdDogJzIwMjYtMDEtMDJUMDA6MDA6MDBaJyB9XSksXG5cdFx0XHRcdH0pLFxuXHRcdFx0XHRnaXRIdWJSZXN0U3RlcCh7XG5cdFx0XHRcdFx0bWV0aG9kOiAnR0VUJyxcblx0XHRcdFx0XHRwYXRoOiAnL3JlcG9zL29jdG8vcmVwby9wdWxscy83L2NvbW1lbnRzJyxcblx0XHRcdFx0XHRxdWVyeTogeyBwZXJfcGFnZTogMTAwLCBwYWdlOiAxIH0sXG5cdFx0XHRcdFx0cmVzcG9uc2U6IGdpdEh1Ykpzb25SZXNwb25zZShbeyBib2R5OiAncmV2aWV3JywgdXNlcjogeyBsb2dpbjogJ2InIH0sIHBhdGg6ICdhLnRzJywgbGluZTogbnVsbCwgb3JpZ2luYWxfbGluZTogNCwgY3JlYXRlZF9hdDogJzIwMjYtMDEtMDFUMDA6MDA6MDBaJywgdXBkYXRlZF9hdDogJzIwMjYtMDEtMDNUMDA6MDA6MDBaJyB9XSksXG5cdFx0XHRcdH0pLFxuXHRcdFx0KTtcblx0XHRcdGNvbnN0IHsgYWNjb3VudCwgc2VydmljZSB9ID0gc2V0dXAoc2VydmVyKTtcblxuXHRcdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgc2VydmljZS5nZXRQdWxsUmVxdWVzdENvbnRleHQoeyAuLi5hY2NvdW50LCBvd25lcjogJ29jdG8nLCByZXBvOiAncmVwbycsIG51bWJlcjogNyB9LCBzaWduYWwoKSk7XG5cblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0XHRwYXRjaDogcmVzdWx0LnBhdGNoLFxuXHRcdFx0XHRjb21tZW50czogcmVzdWx0LmNvbW1lbnRzLFxuXHRcdFx0XHRmaWxlc0NvbXBsZXRlOiByZXN1bHQuZmlsZXNDb21wbGV0ZSxcblx0XHRcdFx0Y29tbWVudHNDb21wbGV0ZTogcmVzdWx0LmNvbW1lbnRzQ29tcGxldGUsXG5cdFx0XHR9LCB7XG5cdFx0XHRcdHBhdGNoOiAnZGlmZiAtLWdpdCBhL2EudHMgYi9hLnRzXFxuQEAgcGF0Y2gnLFxuXHRcdFx0XHRjb21tZW50czogW1xuXHRcdFx0XHRcdHsga2luZDogJ3JldmlldycsIGF1dGhvcjogJ2InLCBib2R5OiAncmV2aWV3JywgY3JlYXRlZEF0OiAnMjAyNi0wMS0wMVQwMDowMDowMFonLCB1cGRhdGVkQXQ6ICcyMDI2LTAxLTAzVDAwOjAwOjAwWicsIHBhdGg6ICdhLnRzJywgbGluZTogNCB9LFxuXHRcdFx0XHRcdHsga2luZDogJ2lzc3VlJywgYXV0aG9yOiAnYScsIGJvZHk6ICdpc3N1ZScsIGNyZWF0ZWRBdDogJzIwMjYtMDEtMDJUMDA6MDA6MDBaJywgdXBkYXRlZEF0OiAnMjAyNi0wMS0wMlQwMDowMDowMFonLCBwYXRoOiB1bmRlZmluZWQsIGxpbmU6IHVuZGVmaW5lZCB9LFxuXHRcdFx0XHRdLFxuXHRcdFx0XHRmaWxlc0NvbXBsZXRlOiB0cnVlLFxuXHRcdFx0XHRjb21tZW50c0NvbXBsZXRlOiB0cnVlLFxuXHRcdFx0fSk7XG5cdFx0XHRzZXJ2ZXIuYXNzZXJ0U2F0aXNmaWVkKCk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ21hcmtzIHB1bGwgcmVxdWVzdCBjb250ZXh0IGZpbGVzIGluY29tcGxldGUgYXQgR2l0SHViIG1heGltdW0nLCBhc3luYyAoKSA9PiB7XG5cdFx0YXdhaXQgd2l0aFNlcnZlcihhc3luYyBzZXJ2ZXIgPT4ge1xuXHRcdFx0Y29uc3QgZnVsbFBhZ2UgPSBBcnJheS5mcm9tKHsgbGVuZ3RoOiAxMDAgfSwgKF8sIGluZGV4KSA9PiAoe1xuXHRcdFx0XHRmaWxlbmFtZTogYGZpbGUtJHtpbmRleH0udHNgLFxuXHRcdFx0XHRzdGF0dXM6ICdtb2RpZmllZCcsXG5cdFx0XHRcdGFkZGl0aW9uczogMSxcblx0XHRcdFx0ZGVsZXRpb25zOiAwLFxuXHRcdFx0fSkpO1xuXHRcdFx0c2VydmVyLmVucXVldWUoXG5cdFx0XHRcdGdpdEh1YlJlc3RTdGVwKHtcblx0XHRcdFx0XHRtZXRob2Q6ICdHRVQnLFxuXHRcdFx0XHRcdHBhdGg6ICcvcmVwb3Mvb2N0by9yZXBvL3B1bGxzLzcnLFxuXHRcdFx0XHRcdHJlc3BvbnNlOiBnaXRIdWJKc29uUmVzcG9uc2Uoe1xuXHRcdFx0XHRcdFx0bnVtYmVyOiA3LFxuXHRcdFx0XHRcdFx0aHRtbF91cmw6ICdodHRwczovL2V4YW1wbGUudGVzdC9wdWxsLzcnLFxuXHRcdFx0XHRcdFx0dGl0bGU6ICdQUicsXG5cdFx0XHRcdFx0XHRib2R5OiBudWxsLFxuXHRcdFx0XHRcdFx0dXNlcjogeyBsb2dpbjogJ2F1dGhvcicgfSxcblx0XHRcdFx0XHRcdGRyYWZ0OiBmYWxzZSxcblx0XHRcdFx0XHRcdGJhc2U6IHsgcmVmOiAnbWFpbicgfSxcblx0XHRcdFx0XHRcdGhlYWQ6IHsgcmVmOiAnZmVhdHVyZScgfSxcblx0XHRcdFx0XHRcdHVwZGF0ZWRfYXQ6ICcyMDI2LTAxLTA0VDAwOjAwOjAwWicsXG5cdFx0XHRcdFx0fSksXG5cdFx0XHRcdH0pLFxuXHRcdFx0XHRnaXRIdWJSZXN0U3RlcCh7XG5cdFx0XHRcdFx0bWV0aG9kOiAnR0VUJyxcblx0XHRcdFx0XHRwYXRoOiAnL3JlcG9zL29jdG8vcmVwby9wdWxscy83L2ZpbGVzJyxcblx0XHRcdFx0XHRxdWVyeTogeyBwZXJfcGFnZTogMTAwLCBwYWdlOiAxIH0sXG5cdFx0XHRcdFx0cmVzcG9uc2U6IGdpdEh1Ykpzb25SZXNwb25zZShmdWxsUGFnZSksXG5cdFx0XHRcdH0pLFxuXHRcdFx0XHRnaXRIdWJSZXN0U3RlcCh7XG5cdFx0XHRcdFx0bWV0aG9kOiAnR0VUJyxcblx0XHRcdFx0XHRwYXRoOiAnL3JlcG9zL29jdG8vcmVwby9pc3N1ZXMvNy9jb21tZW50cycsXG5cdFx0XHRcdFx0cXVlcnk6IHsgcGVyX3BhZ2U6IDEwMCwgcGFnZTogMSB9LFxuXHRcdFx0XHRcdHJlc3BvbnNlOiBnaXRIdWJKc29uUmVzcG9uc2UoW10pLFxuXHRcdFx0XHR9KSxcblx0XHRcdFx0Z2l0SHViUmVzdFN0ZXAoe1xuXHRcdFx0XHRcdG1ldGhvZDogJ0dFVCcsXG5cdFx0XHRcdFx0cGF0aDogJy9yZXBvcy9vY3RvL3JlcG8vcHVsbHMvNy9jb21tZW50cycsXG5cdFx0XHRcdFx0cXVlcnk6IHsgcGVyX3BhZ2U6IDEwMCwgcGFnZTogMSB9LFxuXHRcdFx0XHRcdHJlc3BvbnNlOiBnaXRIdWJKc29uUmVzcG9uc2UoW10pLFxuXHRcdFx0XHR9KSxcblx0XHRcdFx0Li4uQXJyYXkuZnJvbSh7IGxlbmd0aDogMjkgfSwgKF8sIGluZGV4KSA9PiBnaXRIdWJSZXN0U3RlcCh7XG5cdFx0XHRcdFx0bWV0aG9kOiAnR0VUJyBhcyBjb25zdCxcblx0XHRcdFx0XHRwYXRoOiAnL3JlcG9zL29jdG8vcmVwby9wdWxscy83L2ZpbGVzJyxcblx0XHRcdFx0XHRxdWVyeTogeyBwZXJfcGFnZTogMTAwLCBwYWdlOiBpbmRleCArIDIgfSxcblx0XHRcdFx0XHRyZXNwb25zZTogZ2l0SHViSnNvblJlc3BvbnNlKGZ1bGxQYWdlKSxcblx0XHRcdFx0fSkpLFxuXHRcdFx0XHRnaXRIdWJSZXN0U3RlcCh7XG5cdFx0XHRcdFx0bWV0aG9kOiAnR0VUJyxcblx0XHRcdFx0XHRwYXRoOiAnL3JlcG9zL29jdG8vcmVwby9wdWxscy83L2ZpbGVzJyxcblx0XHRcdFx0XHRxdWVyeTogeyBwZXJfcGFnZTogMTAwLCBwYWdlOiAzMSB9LFxuXHRcdFx0XHRcdHJlc3BvbnNlOiBnaXRIdWJKc29uUmVzcG9uc2UoW10pLFxuXHRcdFx0XHR9KSxcblx0XHRcdCk7XG5cdFx0XHRjb25zdCB7IGFjY291bnQsIHNlcnZpY2UgfSA9IHNldHVwKHNlcnZlcik7XG5cblx0XHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IHNlcnZpY2UuZ2V0UHVsbFJlcXVlc3RDb250ZXh0KHsgLi4uYWNjb3VudCwgb3duZXI6ICdvY3RvJywgcmVwbzogJ3JlcG8nLCBudW1iZXI6IDcgfSwgc2lnbmFsKCkpO1xuXG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0LmZpbGVzQ29tcGxldGUsIGZhbHNlKTtcblx0XHRcdHNlcnZlci5hc3NlcnRTYXRpc2ZpZWQoKTtcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgncHJlc2VydmVzIGJlaGF2aW9yLWNvbXBhdGlibGUgYnJhbmNoIGFuZCBoZWFkLVNIQSBsb29rdXAgc2VtYW50aWNzJywgYXN5bmMgKCkgPT4ge1xuXHRcdGF3YWl0IHdpdGhTZXJ2ZXIoYXN5bmMgc2VydmVyID0+IHtcblx0XHRcdHNlcnZlci5lbnF1ZXVlKFxuXHRcdFx0XHRnaXRIdWJSZXN0U3RlcCh7XG5cdFx0XHRcdFx0bWV0aG9kOiAnR0VUJyxcblx0XHRcdFx0XHRwYXRoOiAnL3JlcG9zL29jdG8vcmVwby9wdWxscycsXG5cdFx0XHRcdFx0cXVlcnk6IHsgaGVhZDogJ2Zvcms6ZmVhdHVyZS90ZXN0Jywgc3RhdGU6ICdhbGwnLCBzb3J0OiAndXBkYXRlZCcsIGRpcmVjdGlvbjogJ2Rlc2MnLCBwZXJfcGFnZTogMSB9LFxuXHRcdFx0XHRcdHJlc3BvbnNlOiBnaXRIdWJKc29uUmVzcG9uc2UoW3sgbnVtYmVyOiA5LCBub2RlX2lkOiAnUFI5JywgaHRtbF91cmw6ICdodHRwczovL2V4YW1wbGUudGVzdC9wdWxsLzknLCBjcmVhdGVkX2F0OiAnMjAyNi0wMS0wMVQwMDowMDowMFonIH1dKSxcblx0XHRcdFx0fSksXG5cdFx0XHRcdGdpdEh1YlJlc3RTdGVwKHtcblx0XHRcdFx0XHRtZXRob2Q6ICdHRVQnLFxuXHRcdFx0XHRcdHBhdGg6ICcvcmVwb3Mvb2N0by9yZXBvL2NvbW1pdHMvc2hhL3B1bGxzJyxcblx0XHRcdFx0XHRxdWVyeTogeyBwZXJfcGFnZTogMTAwIH0sXG5cdFx0XHRcdFx0cmVzcG9uc2U6IGdpdEh1Ykpzb25SZXNwb25zZShbXG5cdFx0XHRcdFx0XHR7IG51bWJlcjogMSwgaHRtbF91cmw6ICdodHRwczovL2V4YW1wbGUudGVzdC9wdWxsLzEnLCBzdGF0ZTogJ2Nsb3NlZCcsIGhlYWQ6IHsgc2hhOiAnc2hhJyB9IH0sXG5cdFx0XHRcdFx0XHR7IG51bWJlcjogMiwgaHRtbF91cmw6ICdodHRwczovL2V4YW1wbGUudGVzdC9wdWxsLzInLCBzdGF0ZTogJ29wZW4nLCBoZWFkOiB7IHNoYTogJ290aGVyJyB9IH0sXG5cdFx0XHRcdFx0XSksXG5cdFx0XHRcdH0pLFxuXHRcdFx0KTtcblx0XHRcdGNvbnN0IHsgcmVmLCBzZXJ2aWNlIH0gPSBzZXR1cChzZXJ2ZXIpO1xuXG5cdFx0XHRjb25zdCBieUJyYW5jaCA9IGF3YWl0IHNlcnZpY2UuZmluZFB1bGxSZXF1ZXN0QnlIZWFkQnJhbmNoKHJlZiwgJ2ZlYXR1cmUvdGVzdCcsICdmb3JrJywgc2lnbmFsKCkpO1xuXHRcdFx0Y29uc3QgYnlTaGEgPSBhd2FpdCBzZXJ2aWNlLmZpbmRQdWxsUmVxdWVzdEJ5SGVhZFNoYShyZWYsICdzaGEnLCBzaWduYWwoKSk7XG5cblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0XHRieUJyYW5jaCxcblx0XHRcdFx0YnlTaGEsXG5cdFx0XHR9LCB7XG5cdFx0XHRcdGJ5QnJhbmNoOiB7XG5cdFx0XHRcdFx0cmVmOiB7IC4uLnJlZiwgbnVtYmVyOiA5IH0sXG5cdFx0XHRcdFx0aWQ6ICdQUjknLFxuXHRcdFx0XHRcdHVybDogJ2h0dHBzOi8vZXhhbXBsZS50ZXN0L3B1bGwvOScsXG5cdFx0XHRcdFx0Y3JlYXRlZEF0OiAnMjAyNi0wMS0wMVQwMDowMDowMFonLFxuXHRcdFx0XHR9LFxuXHRcdFx0XHRieVNoYToge1xuXHRcdFx0XHRcdHJlZjogeyAuLi5yZWYsIG51bWJlcjogMSB9LFxuXHRcdFx0XHRcdGlkOiB1bmRlZmluZWQsXG5cdFx0XHRcdFx0dXJsOiAnaHR0cHM6Ly9leGFtcGxlLnRlc3QvcHVsbC8xJyxcblx0XHRcdFx0XHRjcmVhdGVkQXQ6IHVuZGVmaW5lZCxcblx0XHRcdFx0fSxcblx0XHRcdH0pO1xuXHRcdFx0c2VydmVyLmFzc2VydFNhdGlzZmllZCgpO1xuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdyZXR1cm5zIG5vIGhlYWQtU0hBIGxvb2t1cCB3aGVuIHRoZSBmaXJzdCBwYWdlIGlzIGZ1bGwnLCBhc3luYyAoKSA9PiB7XG5cdFx0YXdhaXQgd2l0aFNlcnZlcihhc3luYyBzZXJ2ZXIgPT4ge1xuXHRcdFx0c2VydmVyLmVucXVldWUoZ2l0SHViUmVzdFN0ZXAoe1xuXHRcdFx0XHRtZXRob2Q6ICdHRVQnLFxuXHRcdFx0XHRwYXRoOiAnL3JlcG9zL29jdG8vcmVwby9jb21taXRzL3NoYS9wdWxscycsXG5cdFx0XHRcdHF1ZXJ5OiB7IHBlcl9wYWdlOiAxMDAgfSxcblx0XHRcdFx0cmVzcG9uc2U6IGdpdEh1Ykpzb25SZXNwb25zZShBcnJheS5mcm9tKHsgbGVuZ3RoOiAxMDAgfSwgKF8sIGluZGV4KSA9PiAoe1xuXHRcdFx0XHRcdG51bWJlcjogaW5kZXggKyAxLFxuXHRcdFx0XHRcdGh0bWxfdXJsOiBgaHR0cHM6Ly9leGFtcGxlLnRlc3QvcHVsbC8ke2luZGV4ICsgMX1gLFxuXHRcdFx0XHRcdHN0YXRlOiAnb3BlbicsXG5cdFx0XHRcdFx0aGVhZDogeyBzaGE6IGluZGV4ID09PSAwID8gJ3NoYScgOiAnb3RoZXInIH0sXG5cdFx0XHRcdH0pKSksXG5cdFx0XHR9KSk7XG5cdFx0XHRjb25zdCB7IHJlZiwgc2VydmljZSB9ID0gc2V0dXAoc2VydmVyKTtcblxuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGF3YWl0IHNlcnZpY2UuZmluZFB1bGxSZXF1ZXN0QnlIZWFkU2hhKHJlZiwgJ3NoYScsIHNpZ25hbCgpKSwgdW5kZWZpbmVkKTtcblx0XHRcdHNlcnZlci5hc3NlcnRTYXRpc2ZpZWQoKTtcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgncXVlcmllcyByZWNlbnQgd29yaywgY29tcGxldGUgcmV2aWV3LXRocmVhZCBzdW1tYXJpZXMsIGFuZCBiYXRjaGVkIGlzc3VlIGxpbmthZ2UnLCBhc3luYyAoKSA9PiB7XG5cdFx0YXdhaXQgd2l0aFNlcnZlcihhc3luYyBzZXJ2ZXIgPT4ge1xuXHRcdFx0c2VydmVyLmVucXVldWUoXG5cdFx0XHRcdGdpdEh1YkdyYXBoUUxTdGVwKHtcblx0XHRcdFx0XHRxdWVyeUluY2x1ZGVzOiAnQWdlbnRIb3N0UmVjZW50QXNzaWduZWRJc3N1ZXMnLFxuXHRcdFx0XHRcdHJlc3BvbnNlOiBnaXRIdWJHcmFwaFFMUmVzcG9uc2Uoe1xuXHRcdFx0XHRcdFx0c2VhcmNoOiB7IG5vZGVzOiBbeyBudW1iZXI6IDEsIHRpdGxlOiAnSXNzdWUnLCB1cmw6ICdodHRwczovL2V4YW1wbGUudGVzdC9pc3N1ZXMvMScsIHVwZGF0ZWRBdDogJzIwMjYtMDEtMDFUMDA6MDA6MDBaJyB9XSB9LFxuXHRcdFx0XHRcdH0pLFxuXHRcdFx0XHR9KSxcblx0XHRcdFx0Z2l0SHViR3JhcGhRTFN0ZXAoe1xuXHRcdFx0XHRcdHF1ZXJ5SW5jbHVkZXM6ICdBZ2VudEhvc3RSZWNlbnRBdXRob3JlZFB1bGxSZXF1ZXN0cycsXG5cdFx0XHRcdFx0cmVzcG9uc2U6IGdpdEh1YkdyYXBoUUxSZXNwb25zZSh7XG5cdFx0XHRcdFx0XHRzZWFyY2g6IHtcblx0XHRcdFx0XHRcdFx0bm9kZXM6IFt7XG5cdFx0XHRcdFx0XHRcdFx0bnVtYmVyOiAyLFxuXHRcdFx0XHRcdFx0XHRcdHRpdGxlOiAnUFInLFxuXHRcdFx0XHRcdFx0XHRcdHVybDogJ2h0dHBzOi8vZXhhbXBsZS50ZXN0L3B1bGwvMicsXG5cdFx0XHRcdFx0XHRcdFx0dXBkYXRlZEF0OiAnMjAyNi0wMS0wMlQwMDowMDowMFonLFxuXHRcdFx0XHRcdFx0XHRcdGNvbW1pdHM6IHsgbm9kZXM6IFt7IGNvbW1pdDogeyBjb21taXR0ZWREYXRlOiAnMjAyNi0wMS0wM1QwMDowMDowMFonLCBzdGF0dXNDaGVja1JvbGx1cDogeyBzdGF0ZTogJ1NVQ0NFU1MnIH0gfSB9XSB9LFxuXHRcdFx0XHRcdFx0XHR9XSxcblx0XHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0fSksXG5cdFx0XHRcdH0pLFxuXHRcdFx0XHRnaXRIdWJHcmFwaFFMU3RlcCh7XG5cdFx0XHRcdFx0cXVlcnlJbmNsdWRlczogJ0FnZW50SG9zdFB1bGxSZXF1ZXN0UmV2aWV3VGhyZWFkU3VtbWFyeScsXG5cdFx0XHRcdFx0cmVzcG9uc2U6IGdpdEh1YkdyYXBoUUxSZXNwb25zZSh7XG5cdFx0XHRcdFx0XHRyZXBvc2l0b3J5OiB7XG5cdFx0XHRcdFx0XHRcdHB1bGxSZXF1ZXN0OiB7XG5cdFx0XHRcdFx0XHRcdFx0cmV2aWV3VGhyZWFkczoge1xuXHRcdFx0XHRcdFx0XHRcdFx0bm9kZXM6IFt7IGlzUmVzb2x2ZWQ6IGZhbHNlLCBjb21tZW50czogeyBub2RlczogW3sgY3JlYXRlZEF0OiAnMjAyNi0wMS0wNFQwMDowMDowMFonIH1dIH0gfV0sXG5cdFx0XHRcdFx0XHRcdFx0XHRwYWdlSW5mbzogeyBoYXNOZXh0UGFnZTogdHJ1ZSwgZW5kQ3Vyc29yOiAndGhyZWFkcy0xJyB9LFxuXHRcdFx0XHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdH0pLFxuXHRcdFx0XHR9KSxcblx0XHRcdFx0Z2l0SHViR3JhcGhRTFN0ZXAoe1xuXHRcdFx0XHRcdHF1ZXJ5SW5jbHVkZXM6ICdBZ2VudEhvc3RQdWxsUmVxdWVzdFJldmlld1RocmVhZFN1bW1hcnknLFxuXHRcdFx0XHRcdGFzc2VydDogcmVxdWVzdCA9PiBhc3NlcnQuc3RyaWN0RXF1YWwoKHJlcXVlc3QuZ3JhcGhRbD8udmFyaWFibGVzIGFzIHsgYWZ0ZXI/OiBzdHJpbmcgfSkuYWZ0ZXIsICd0aHJlYWRzLTEnKSxcblx0XHRcdFx0XHRyZXNwb25zZTogZ2l0SHViR3JhcGhRTFJlc3BvbnNlKHtcblx0XHRcdFx0XHRcdHJlcG9zaXRvcnk6IHtcblx0XHRcdFx0XHRcdFx0cHVsbFJlcXVlc3Q6IHtcblx0XHRcdFx0XHRcdFx0XHRyZXZpZXdUaHJlYWRzOiB7XG5cdFx0XHRcdFx0XHRcdFx0XHRub2RlczogW3sgaXNSZXNvbHZlZDogdHJ1ZSwgY29tbWVudHM6IHsgbm9kZXM6IFtdIH0gfV0sXG5cdFx0XHRcdFx0XHRcdFx0XHRwYWdlSW5mbzogeyBoYXNOZXh0UGFnZTogZmFsc2UsIGVuZEN1cnNvcjogbnVsbCB9LFxuXHRcdFx0XHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdH0pLFxuXHRcdFx0XHR9KSxcblx0XHRcdFx0Z2l0SHViR3JhcGhRTFN0ZXAoe1xuXHRcdFx0XHRcdHF1ZXJ5SW5jbHVkZXM6ICdBZ2VudEhvc3RJc3N1ZUxpbmthZ2UnLFxuXHRcdFx0XHRcdHJlc3BvbnNlOiBnaXRIdWJHcmFwaFFMUmVzcG9uc2Uoe1xuXHRcdFx0XHRcdFx0cmVwb3NpdG9yeToge1xuXHRcdFx0XHRcdFx0XHRpc3N1ZTA6IHsgY2xvc2VkQnlQdWxsUmVxdWVzdHNSZWZlcmVuY2VzOiB7IHRvdGFsQ291bnQ6IDEgfSB9LFxuXHRcdFx0XHRcdFx0XHRpc3N1ZTE6IHsgY2xvc2VkQnlQdWxsUmVxdWVzdHNSZWZlcmVuY2VzOiB7IHRvdGFsQ291bnQ6IDAgfSB9LFxuXHRcdFx0XHRcdFx0fSxcblx0XHRcdFx0XHR9KSxcblx0XHRcdFx0fSksXG5cdFx0XHQpO1xuXHRcdFx0Y29uc3QgeyBhY2NvdW50LCByZWYsIHNlcnZpY2UgfSA9IHNldHVwKHNlcnZlcik7XG5cblx0XHRcdGNvbnN0IGlzc3VlcyA9IGF3YWl0IHNlcnZpY2UuZ2V0UmVjZW50QXNzaWduZWRJc3N1ZXMocmVmLCBzaWduYWwoKSk7XG5cdFx0XHRjb25zdCBwdWxsUmVxdWVzdHMgPSBhd2FpdCBzZXJ2aWNlLmdldFJlY2VudEF1dGhvcmVkUHVsbFJlcXVlc3RzKHJlZiwgc2lnbmFsKCkpO1xuXHRcdFx0Y29uc3QgdGhyZWFkcyA9IGF3YWl0IHNlcnZpY2UuZ2V0UHVsbFJlcXVlc3RSZXZpZXdUaHJlYWRTdW1tYXJ5KHsgLi4uYWNjb3VudCwgb3duZXI6ICdvY3RvJywgcmVwbzogJ3JlcG8nLCBudW1iZXI6IDIgfSwgc2lnbmFsKCkpO1xuXHRcdFx0Y29uc3QgbGlua2VkID0gYXdhaXQgc2VydmljZS5nZXRJc3N1ZXNXaXRoTGlua2VkUHVsbFJlcXVlc3RzKHJlZiwgWzEsIDIsIDEsIC0xXSwgc2lnbmFsKCkpO1xuXG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdFx0aXNzdWVzLFxuXHRcdFx0XHRwdWxsUmVxdWVzdHMsXG5cdFx0XHRcdHRocmVhZHMsXG5cdFx0XHRcdGxpbmtlZCxcblx0XHRcdH0sIHtcblx0XHRcdFx0aXNzdWVzOiBbeyBudW1iZXI6IDEsIHRpdGxlOiAnSXNzdWUnLCB1cmw6ICdodHRwczovL2V4YW1wbGUudGVzdC9pc3N1ZXMvMScsIHVwZGF0ZWRBdDogJzIwMjYtMDEtMDFUMDA6MDA6MDBaJyB9XSxcblx0XHRcdFx0cHVsbFJlcXVlc3RzOiBbe1xuXHRcdFx0XHRcdG51bWJlcjogMixcblx0XHRcdFx0XHR0aXRsZTogJ1BSJyxcblx0XHRcdFx0XHR1cmw6ICdodHRwczovL2V4YW1wbGUudGVzdC9wdWxsLzInLFxuXHRcdFx0XHRcdHVwZGF0ZWRBdDogJzIwMjYtMDEtMDJUMDA6MDA6MDBaJyxcblx0XHRcdFx0XHRzdGF0dXNDaGVja1JvbGx1cFN0YXRlOiAnU1VDQ0VTUycsXG5cdFx0XHRcdFx0bGF0ZXN0Q29tbWl0QXQ6ICcyMDI2LTAxLTAzVDAwOjAwOjAwWicsXG5cdFx0XHRcdH1dLFxuXHRcdFx0XHR0aHJlYWRzOiBbXG5cdFx0XHRcdFx0eyBpc1Jlc29sdmVkOiBmYWxzZSwgbGF0ZXN0Q29tbWVudEF0OiAnMjAyNi0wMS0wNFQwMDowMDowMFonIH0sXG5cdFx0XHRcdFx0eyBpc1Jlc29sdmVkOiB0cnVlLCBsYXRlc3RDb21tZW50QXQ6IHVuZGVmaW5lZCB9LFxuXHRcdFx0XHRdLFxuXHRcdFx0XHRsaW5rZWQ6IFsxXSxcblx0XHRcdH0pO1xuXHRcdFx0c2VydmVyLmFzc2VydFNhdGlzZmllZCgpO1xuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdmYWlscyBjbG9zZWQgd2l0aG91dCBHcmFwaFFMIGFuZCBtZW1vaXplcyBzY2hlbWEtaW52YWxpZCBxdWVyeSB2YXJpYW50cycsIGFzeW5jICgpID0+IHtcblx0XHRhd2FpdCB3aXRoU2VydmVyKGFzeW5jIHNlcnZlciA9PiB7XG5cdFx0XHRjb25zdCB1bmF2YWlsYWJsZTogR2l0SHViSG9zdENhcGFiaWxpdGllcyA9IHtcblx0XHRcdFx0Z3JhcGhxbDogZmFsc2UsXG5cdFx0XHRcdG1lcmdlUXVldWU6IGZhbHNlLFxuXHRcdFx0XHRpbnRlcm5hbE1lcmdlU3RhdHVzOiBmYWxzZSxcblx0XHRcdFx0cmV2aWV3VGhyZWFkczogZmFsc2UsXG5cdFx0XHRcdGNoZWNrQ29udGV4dFJlcXVpcmVkbmVzczogZmFsc2UsXG5cdFx0XHR9O1xuXHRcdFx0Y29uc3QgZGlzYWJsZWQgPSBzZXR1cChzZXJ2ZXIsIHVuYXZhaWxhYmxlKTtcblx0XHRcdGF3YWl0IGFzc2VydC5yZWplY3RzKFxuXHRcdFx0XHQoKSA9PiBkaXNhYmxlZC5zZXJ2aWNlLmdldFJlY2VudEFzc2lnbmVkSXNzdWVzKGRpc2FibGVkLnJlZiwgc2lnbmFsKCkpLFxuXHRcdFx0XHRlcnJvciA9PiBlcnJvciBpbnN0YW5jZW9mIEVycm9yICYmIGVycm9yLm1lc3NhZ2UuaW5jbHVkZXMoJ0dyYXBoUUwgaXMgdW5hdmFpbGFibGUnKSxcblx0XHRcdCk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2VydmVyLnJlcXVlc3RzLmxlbmd0aCwgMCk7XG5cblx0XHRcdHNlcnZlci5lbnF1ZXVlKGdpdEh1YkdyYXBoUUxTdGVwKHtcblx0XHRcdFx0cXVlcnlJbmNsdWRlczogJ0FnZW50SG9zdFJlY2VudEFzc2lnbmVkSXNzdWVzJyxcblx0XHRcdFx0cmVzcG9uc2U6IGdpdEh1YkdyYXBoUUxSZXNwb25zZSh1bmRlZmluZWQsIFt7IG1lc3NhZ2U6ICdVbmtub3duIGZpZWxkJywgZXh0ZW5zaW9uczogeyBjb2RlOiAndW5kZWZpbmVkRmllbGQnIH0gfV0pLFxuXHRcdFx0fSkpO1xuXHRcdFx0Y29uc3QgZW5hYmxlZCA9IHNldHVwKHNlcnZlcik7XG5cdFx0XHRhd2FpdCBhc3NlcnQucmVqZWN0cyhcblx0XHRcdFx0KCkgPT4gZW5hYmxlZC5zZXJ2aWNlLmdldFJlY2VudEFzc2lnbmVkSXNzdWVzKGVuYWJsZWQucmVmLCBzaWduYWwoKSksXG5cdFx0XHRcdGVycm9yID0+IGVycm9yIGluc3RhbmNlb2YgRXJyb3IgJiYgZXJyb3IubWVzc2FnZS5pbmNsdWRlcygnVW5rbm93biBmaWVsZCcpLFxuXHRcdFx0KTtcblx0XHRcdGF3YWl0IGFzc2VydC5yZWplY3RzKFxuXHRcdFx0XHQoKSA9PiBlbmFibGVkLnNlcnZpY2UuZ2V0UmVjZW50QXNzaWduZWRJc3N1ZXMoZW5hYmxlZC5yZWYsIHNpZ25hbCgpKSxcblx0XHRcdFx0ZXJyb3IgPT4gZXJyb3IgaW5zdGFuY2VvZiBFcnJvciAmJiBlcnJvci5tZXNzYWdlLmluY2x1ZGVzKCd1bnN1cHBvcnRlZCcpLFxuXHRcdFx0KTtcblxuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNlcnZlci5yZXF1ZXN0cy5sZW5ndGgsIDEpO1xuXHRcdFx0c2VydmVyLmFzc2VydFNhdGlzZmllZCgpO1xuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdyZXRyaWVzIHRyYW5zaWVudCBjYXBhYmlsaXR5IGFuZCB1bnR5cGVkIEdyYXBoUUwgZmFpbHVyZXMnLCBhc3luYyAoKSA9PiB7XG5cdFx0YXdhaXQgd2l0aFNlcnZlcihhc3luYyBzZXJ2ZXIgPT4ge1xuXHRcdFx0c2VydmVyLmVucXVldWUoXG5cdFx0XHRcdGdpdEh1YkdyYXBoUUxTdGVwKHtcblx0XHRcdFx0XHRxdWVyeUluY2x1ZGVzOiAnQWdlbnRIb3N0UmVjZW50QXNzaWduZWRJc3N1ZXMnLFxuXHRcdFx0XHRcdHJlc3BvbnNlOiBnaXRIdWJHcmFwaFFMUmVzcG9uc2UodW5kZWZpbmVkLCBbeyBtZXNzYWdlOiAnU29tZXRoaW5nIHdlbnQgd3Jvbmcgd2hpbGUgZXhlY3V0aW5nIHlvdXIgcXVlcnknIH1dKSxcblx0XHRcdFx0fSksXG5cdFx0XHRcdGdpdEh1YkdyYXBoUUxTdGVwKHtcblx0XHRcdFx0XHRxdWVyeUluY2x1ZGVzOiAnQWdlbnRIb3N0UmVjZW50QXNzaWduZWRJc3N1ZXMnLFxuXHRcdFx0XHRcdHJlc3BvbnNlOiBnaXRIdWJHcmFwaFFMUmVzcG9uc2UoeyBzZWFyY2g6IHsgbm9kZXM6IFtdIH0gfSksXG5cdFx0XHRcdH0pLFxuXHRcdFx0XHRnaXRIdWJHcmFwaFFMU3RlcCh7XG5cdFx0XHRcdFx0cXVlcnlJbmNsdWRlczogJ0FnZW50SG9zdFJlY2VudEFzc2lnbmVkSXNzdWVzJyxcblx0XHRcdFx0XHRyZXNwb25zZTogZ2l0SHViR3JhcGhRTFJlc3BvbnNlKHsgc2VhcmNoOiB7IG5vZGVzOiBbXSB9IH0pLFxuXHRcdFx0XHR9KSxcblx0XHRcdCk7XG5cdFx0XHRjb25zdCB0cmFuc2llbnRRdWVyeSA9IHNldHVwKHNlcnZlcik7XG5cdFx0XHRhd2FpdCBhc3NlcnQucmVqZWN0cyhcblx0XHRcdFx0KCkgPT4gdHJhbnNpZW50UXVlcnkuc2VydmljZS5nZXRSZWNlbnRBc3NpZ25lZElzc3Vlcyh0cmFuc2llbnRRdWVyeS5yZWYsIHNpZ25hbCgpKSxcblx0XHRcdFx0ZXJyb3IgPT4gZXJyb3IgaW5zdGFuY2VvZiBFcnJvciAmJiBlcnJvci5tZXNzYWdlLmluY2x1ZGVzKCdTb21ldGhpbmcgd2VudCB3cm9uZycpLFxuXHRcdFx0KTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoYXdhaXQgdHJhbnNpZW50UXVlcnkuc2VydmljZS5nZXRSZWNlbnRBc3NpZ25lZElzc3Vlcyh0cmFuc2llbnRRdWVyeS5yZWYsIHNpZ25hbCgpKSwgW10pO1xuXG5cdFx0XHRjb25zdCB0cmFuc2llbnRDYXBhYmlsaXRpZXMgPSBzZXR1cChzZXJ2ZXIsIG5ldyBTZXF1ZW5jZWRDYXBhYmlsaXRpZXNTZXJ2aWNlKFtcblx0XHRcdFx0eyAuLi5hdmFpbGFibGVDYXBhYmlsaXRpZXMsIGdyYXBocWw6IGZhbHNlIH0sXG5cdFx0XHRcdGF2YWlsYWJsZUNhcGFiaWxpdGllcyxcblx0XHRcdF0pKTtcblx0XHRcdGF3YWl0IGFzc2VydC5yZWplY3RzKFxuXHRcdFx0XHQoKSA9PiB0cmFuc2llbnRDYXBhYmlsaXRpZXMuc2VydmljZS5nZXRSZWNlbnRBc3NpZ25lZElzc3Vlcyh0cmFuc2llbnRDYXBhYmlsaXRpZXMucmVmLCBzaWduYWwoKSksXG5cdFx0XHRcdGVycm9yID0+IGVycm9yIGluc3RhbmNlb2YgRXJyb3IgJiYgZXJyb3IubWVzc2FnZS5pbmNsdWRlcygnR3JhcGhRTCBpcyB1bmF2YWlsYWJsZScpLFxuXHRcdFx0KTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoYXdhaXQgdHJhbnNpZW50Q2FwYWJpbGl0aWVzLnNlcnZpY2UuZ2V0UmVjZW50QXNzaWduZWRJc3N1ZXModHJhbnNpZW50Q2FwYWJpbGl0aWVzLnJlZiwgc2lnbmFsKCkpLCBbXSk7XG5cblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChzZXJ2ZXIucmVxdWVzdHMubGVuZ3RoLCAzKTtcblx0XHRcdHNlcnZlci5hc3NlcnRTYXRpc2ZpZWQoKTtcblx0XHR9KTtcblx0fSk7XG59KTtcblxuZnVuY3Rpb24gc2lnbmFsKCk6IEFib3J0U2lnbmFsIHtcblx0cmV0dXJuIG5ldyBBYm9ydENvbnRyb2xsZXIoKS5zaWduYWw7XG59XG5cbmZ1bmN0aW9uIHJlcG9zaXRvcnlSZXNwb25zZShuYW1lV2l0aE93bmVyOiBzdHJpbmcpOiBvYmplY3Qge1xuXHRjb25zdCBbb3duZXIsIG5hbWVdID0gbmFtZVdpdGhPd25lci5zcGxpdCgnLycpO1xuXHRyZXR1cm4ge1xuXHRcdG5vZGVfaWQ6ICdSMScsXG5cdFx0b3duZXI6IHsgaWQ6IDEsIGxvZ2luOiBvd25lciB9LFxuXHRcdG5hbWUsXG5cdFx0ZnVsbF9uYW1lOiBuYW1lV2l0aE93bmVyLFxuXHRcdGRlZmF1bHRfYnJhbmNoOiAnbWFpbicsXG5cdFx0cHJpdmF0ZTogdHJ1ZSxcblx0XHRkZXNjcmlwdGlvbjogJ3JlcG8nLFxuXHRcdGh0bWxfdXJsOiBgaHR0cHM6Ly9leGFtcGxlLnRlc3QvJHtuYW1lV2l0aE93bmVyfWAsXG5cdFx0YXJjaGl2ZWQ6IGZhbHNlLFxuXHRcdGZvcms6IGZhbHNlLFxuXHR9O1xufVxuXG5mdW5jdGlvbiBpc3N1ZVJlc3BvbnNlKHN0YXRlOiAnb3BlbicgfCAnY2xvc2VkJyk6IG9iamVjdCB7XG5cdHJldHVybiB7XG5cdFx0bm9kZV9pZDogJ0k3Jyxcblx0XHRudW1iZXI6IDcsXG5cdFx0dGl0bGU6ICdJc3N1ZScsXG5cdFx0Ym9keTogJ0JvZHknLFxuXHRcdGh0bWxfdXJsOiAnaHR0cHM6Ly9leGFtcGxlLnRlc3QvaXNzdWVzLzcnLFxuXHRcdHN0YXRlLFxuXHRcdHN0YXRlX3JlYXNvbjogc3RhdGUgPT09ICdjbG9zZWQnID8gJ2NvbXBsZXRlZCcgOiBudWxsLFxuXHRcdHVzZXI6IHsgaWQ6IDIsIGxvZ2luOiAnYXV0aG9yJyB9LFxuXHRcdGFzc2lnbmVlczogW3sgaWQ6IDMsIGxvZ2luOiAnYXNzaWduZWUnIH1dLFxuXHRcdGxhYmVsczogW3sgbmFtZTogJ2J1ZycgfV0sXG5cdFx0Y3JlYXRlZF9hdDogJzIwMjYtMDEtMDFUMDA6MDA6MDBaJyxcblx0XHR1cGRhdGVkX2F0OiAnMjAyNi0wMS0wMlQwMDowMDowMFonLFxuXHRcdGNsb3NlZF9hdDogc3RhdGUgPT09ICdjbG9zZWQnID8gJzIwMjYtMDEtMDNUMDA6MDA6MDBaJyA6IG51bGwsXG5cdH07XG59XG5cbmZ1bmN0aW9uIGNvbXBhcmlzb25Db21taXQoc2hhOiBzdHJpbmcpOiBvYmplY3Qge1xuXHRyZXR1cm4ge1xuXHRcdHNoYSxcblx0XHRodG1sX3VybDogYGh0dHBzOi8vZXhhbXBsZS50ZXN0L2NvbW1pdC8ke3NoYX1gLFxuXHRcdGF1dGhvcjogeyBpZDogMSwgbG9naW46ICdhdXRob3InIH0sXG5cdFx0Y29tbWl0OiB7IG1lc3NhZ2U6IHNoYSwgY29tbWl0dGVyOiB7IGRhdGU6ICcyMDI2LTAxLTAxVDAwOjAwOjAwWicgfSB9LFxuXHR9O1xufVxuXG5mdW5jdGlvbiBjaGFuZ2VkRmlsZShmaWxlbmFtZTogc3RyaW5nKTogb2JqZWN0IHtcblx0cmV0dXJuIHtcblx0XHRmaWxlbmFtZSxcblx0XHRzdGF0dXM6ICdtb2RpZmllZCcsXG5cdFx0YWRkaXRpb25zOiAxLFxuXHRcdGRlbGV0aW9uczogMixcblx0XHRjaGFuZ2VzOiAzLFxuXHRcdHBhdGNoOiAnQEAgcGF0Y2gnLFxuXHR9O1xufVxuXG5mdW5jdGlvbiBjb21wYXJlUmVzcG9uc2UoY29tbWl0czogcmVhZG9ubHkgb2JqZWN0W10sIGZpbGVzOiByZWFkb25seSBvYmplY3RbXSwgdG90YWxDb21taXRzOiBudW1iZXIpOiBvYmplY3Qge1xuXHRyZXR1cm4ge1xuXHRcdGJhc2VfY29tbWl0OiB7IHNoYTogJ2Jhc2Utc2hhJyB9LFxuXHRcdG1lcmdlX2Jhc2VfY29tbWl0OiB7IHNoYTogJ21lcmdlLWJhc2Utc2hhJyB9LFxuXHRcdHN0YXR1czogJ2FoZWFkJyxcblx0XHRhaGVhZF9ieTogdG90YWxDb21taXRzLFxuXHRcdGJlaGluZF9ieTogMCxcblx0XHR0b3RhbF9jb21taXRzOiB0b3RhbENvbW1pdHMsXG5cdFx0Y29tbWl0cyxcblx0XHRmaWxlcyxcblx0fTtcbn1cblxuZnVuY3Rpb24gcHVsbFJlcXVlc3ROb2RlKG51bWJlcjogbnVtYmVyKTogb2JqZWN0IHtcblx0cmV0dXJuIHtcblx0XHRudW1iZXIsXG5cdFx0dGl0bGU6IGBQUiAke251bWJlcn1gLFxuXHRcdGF1dGhvcjogeyBkYXRhYmFzZUlkOiBudW1iZXIsIGxvZ2luOiBgYXV0aG9yLSR7bnVtYmVyfWAgfSxcblx0XHRoZWFkUmVmTmFtZTogYGZlYXR1cmUtJHtudW1iZXJ9YCxcblx0XHRpc0RyYWZ0OiBmYWxzZSxcblx0XHR1cGRhdGVkQXQ6ICcyMDI2LTAxLTAxVDAwOjAwOjAwWicsXG5cdFx0YWRkaXRpb25zOiBudW1iZXIsXG5cdFx0ZGVsZXRpb25zOiBudW1iZXIgKyAxLFxuXHR9O1xufVxuXG5mdW5jdGlvbiBwdWxsUmVxdWVzdFN1bW1hcnkobnVtYmVyOiBudW1iZXIsIHJldmlld1JlcXVlc3RlZDogYm9vbGVhbiwgYXNzaWduZWQ6IGJvb2xlYW4pOiBvYmplY3Qge1xuXHRyZXR1cm4ge1xuXHRcdG51bWJlcixcblx0XHR0aXRsZTogYFBSICR7bnVtYmVyfWAsXG5cdFx0YXV0aG9yOiB7IGlkOiBTdHJpbmcobnVtYmVyKSwgbG9naW46IGBhdXRob3ItJHtudW1iZXJ9YCB9LFxuXHRcdGhlYWRSZWY6IGBmZWF0dXJlLSR7bnVtYmVyfWAsXG5cdFx0Y2hlY2tvdXRSZWY6IGByZWZzL3B1bGwvJHtudW1iZXJ9L2hlYWRgLFxuXHRcdGRyYWZ0OiBmYWxzZSxcblx0XHR1cGRhdGVkQXQ6ICcyMDI2LTAxLTAxVDAwOjAwOjAwWicsXG5cdFx0YWRkaXRpb25zOiBudW1iZXIsXG5cdFx0ZGVsZXRpb25zOiBudW1iZXIgKyAxLFxuXHRcdHJldmlld1JlcXVlc3RlZEZyb21WaWV3ZXI6IHJldmlld1JlcXVlc3RlZCxcblx0XHRhc3NpZ25lZFRvVmlld2VyOiBhc3NpZ25lZCxcblx0fTtcbn1cbiJdLAogICJtYXBwaW5ncyI6ICJBQUtBLE9BQU8sWUFBWTtBQUNuQixTQUFTLHVCQUF1QjtBQUNoQyxTQUFTLGVBQWU7QUFDeEIsU0FBUyxjQUFjO0FBRXZCLFNBQVMsK0NBQStDO0FBQ3hELFNBQVMsc0JBQXNCO0FBSy9CLFNBQW9DLDBCQUEwQjtBQUM5RCxTQUFTLHVCQUF1QjtBQUNoQyxTQUFTLDJCQUEyQjtBQUNwQyxTQUFTLGlCQUFpQjtBQUMxQjtBQUFBLEVBQ0M7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsT0FDTTtBQUVQLE1BQU0sU0FBb0M7QUFBQSxFQUN6QyxjQUFjO0FBQUEsRUFDZCx1QkFBdUI7QUFBQSxFQUN2QixTQUFTO0FBQUEsRUFDVCxZQUFZO0FBQUEsRUFDWixRQUFRO0FBQ1Q7QUFFQSxNQUFNLHdCQUFnRDtBQUFBLEVBQ3JELFNBQVM7QUFBQSxFQUNULFlBQVk7QUFBQSxFQUNaLHFCQUFxQjtBQUFBLEVBQ3JCLGVBQWU7QUFBQSxFQUNmLDBCQUEwQjtBQUMzQjtBQUVBLE1BQU0sd0JBQXVEO0FBQUEsRUFFNUQsWUFBcUIsUUFBZ0MsdUJBQXVCO0FBQXZEO0FBQUEsRUFBeUQ7QUFBQSxFQUU5RSxrQkFBbUQ7QUFDbEQsV0FBTyxRQUFRLFFBQVEsS0FBSyxLQUFL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
