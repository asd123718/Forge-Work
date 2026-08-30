import assert from "assert";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../base/test/common/utils.js";
import { GitHubRequestError, GitHubTransport } from "../../common/githubTransport.js";
import { PullRequestQueryService } from "../../common/pullRequestQueryService.js";
import { nodeFetch } from "./nodeFetch.js";
import { gitHubGraphQLResponse, gitHubGraphQLStep, gitHubJsonResponse, gitHubRestStep, ProgrammableGitHubServer } from "./programmableGitHubServer.js";
const availableCapabilities = {
  graphql: true,
  mergeQueue: true,
  internalMergeStatus: false,
  reviewThreads: true,
  checkContextRequiredness: true
};
class TestCapabilitiesService {
  constructor(value) {
    this.value = value;
  }
  getCapabilities() {
    return Promise.resolve(this.value);
  }
  clear() {
  }
}
suite("PullRequestQueryService", () => {
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
    const signal = new AbortController().signal;
    const transport = disposables.add(new GitHubTransport(nodeFetch));
    return {
      query: new PullRequestQueryService(transport, new TestCapabilitiesService(capabilities), server.createEndpointService()),
      ref: { ...account, owner: "octo", repo: "repo", number: 7 },
      credential: { account, token: "token", generation: 1, signal }
    };
  }
  test("normalizes core and complete independent REST conversation fragments", async () => {
    await withServer(async (server) => {
      server.enqueue(
        gitHubRestStep({ method: "GET", path: "/repos/octo/repo/pulls/7", response: gitHubJsonResponse(rawCore("head-1"), { etag: '"core"' }) }),
        gitHubRestStep({
          method: "GET",
          path: "/repos/octo/repo/issues/7/comments",
          query: { per_page: 100 },
          response: gitHubJsonResponse([{ id: 1, node_id: "IC_1", body: "one", user: { id: 10, login: "a" } }], {
            link: `<${server.apiBaseUrl}/repos/octo/repo/issues/7/comments?per_page=100&page=2>; rel="next"`
          })
        }),
        gitHubRestStep({
          method: "GET",
          path: "/repos/octo/repo/issues/7/comments",
          query: { per_page: 100, page: 2 },
          response: gitHubJsonResponse([{ id: 2, body: "two", user: { id: 11, login: "b" } }])
        }),
        gitHubRestStep({
          method: "GET",
          path: "/repos/octo/repo/pulls/7/reviews",
          query: { per_page: 100 },
          response: gitHubJsonResponse([{ id: 3, state: "APPROVED", body: "approved", user: { login: "c" }, commit_id: "head-1" }])
        }),
        gitHubRestStep({
          method: "GET",
          path: "/repos/octo/repo/pulls/7/comments",
          query: { per_page: 100 },
          response: gitHubJsonResponse([{ id: 4, body: "inline", path: "src/a.ts", line: 3, user: { login: "d" } }])
        })
      );
      const { query, ref, credential } = setup(server);
      const signal = new AbortController().signal;
      const options = {
        priority: "visible",
        conversation: {
          topLevelComments: true,
          submittedReviews: true,
          inlineComments: true,
          includeBodies: true
        }
      };
      const coreResult = await query.fetch("core", ref, void 0, options, credential, signal);
      const normalizedCore = coreResult.fragment === "core" ? coreResult.value : void 0;
      const comments = await query.fetch("topLevelComments", ref, normalizedCore, options, credential, signal);
      const reviews = await query.fetch("submittedReviews", ref, normalizedCore, options, credential, signal);
      const inline = await query.fetch("inlineComments", ref, normalizedCore, options, credential, signal);
      assert.deepStrictEqual({
        core: coreResult,
        comments,
        reviews,
        inline
      }, {
        core: { fragment: "core", value: core("head-1"), complete: true },
        comments: {
          fragment: "topLevelComments",
          value: [
            { id: "1", nodeId: "IC_1", author: { id: "10", login: "a" }, body: "one", url: void 0, createdAt: void 0, updatedAt: void 0 },
            { id: "2", nodeId: void 0, author: { id: "11", login: "b" }, body: "two", url: void 0, createdAt: void 0, updatedAt: void 0 }
          ],
          complete: true
        },
        reviews: {
          fragment: "submittedReviews",
          value: [{ id: "3", nodeId: void 0, author: { login: "c" }, state: "APPROVED", body: "approved", commitId: "head-1", submittedAt: void 0 }],
          complete: true
        },
        inline: {
          fragment: "inlineComments",
          value: [{
            id: "4",
            nodeId: void 0,
            author: { login: "d" },
            body: "inline",
            url: void 0,
            createdAt: void 0,
            updatedAt: void 0,
            reviewId: void 0,
            replyToId: void 0,
            path: "src/a.ts",
            line: 3,
            originalLine: void 0,
            side: void 0,
            commitId: void 0,
            originalCommitId: void 0
          }],
          complete: true
        }
      });
      server.assertSatisfied();
    });
  });
  test("fully paginates review threads and nested comments", async () => {
    await withServer(async (server) => {
      server.enqueue(
        gitHubGraphQLStep({
          queryIncludes: "AgentHostPullRequestReviewThreads",
          assert: (request) => assert.deepStrictEqual(request.graphQl?.variables, { owner: "octo", repo: "repo", number: 7 }),
          response: gitHubGraphQLResponse({
            repository: {
              pullRequest: {
                headRefOid: "head-1",
                reviewThreads: {
                  nodes: [{
                    id: "T1",
                    isResolved: false,
                    path: "a.ts",
                    diffSide: "RIGHT",
                    comments: {
                      nodes: [{ id: "C1", databaseId: 1, body: "first", author: { login: "a" } }],
                      pageInfo: { hasNextPage: true, endCursor: "comments-1" }
                    }
                  }],
                  pageInfo: { hasNextPage: true, endCursor: "threads-1" }
                }
              }
            }
          })
        }),
        gitHubGraphQLStep({
          queryIncludes: "AgentHostPullRequestReviewThreadComments",
          assert: (request) => assert.deepStrictEqual(request.graphQl?.variables, { threadId: "T1", after: "comments-1" }),
          response: gitHubGraphQLResponse({
            node: {
              comments: {
                nodes: [{ id: "C2", databaseId: 2, body: "second", author: { login: "b" } }],
                pageInfo: { hasNextPage: false, endCursor: null }
              }
            }
          })
        }),
        gitHubGraphQLStep({
          queryIncludes: "AgentHostPullRequestReviewThreads",
          assert: (request) => assert.deepStrictEqual(request.graphQl?.variables, { owner: "octo", repo: "repo", number: 7, after: "threads-1" }),
          response: gitHubGraphQLResponse({
            repository: {
              pullRequest: {
                headRefOid: "head-1",
                reviewThreads: {
                  nodes: [{
                    id: "T2",
                    isResolved: true,
                    diffSide: "LEFT",
                    comments: { nodes: [], pageInfo: { hasNextPage: false, endCursor: null } }
                  }],
                  pageInfo: { hasNextPage: false, endCursor: null }
                }
              }
            }
          })
        })
      );
      const { query, ref, credential } = setup(server);
      const result = await query.fetch(
        "reviewThreads",
        ref,
        core("head-1"),
        { priority: "visible", conversation: { reviewThreads: true, includeBodies: true } },
        credential,
        new AbortController().signal
      );
      assert.deepStrictEqual(result, {
        fragment: "reviewThreads",
        value: [
          {
            id: "T1",
            isResolved: false,
            isOutdated: void 0,
            path: "a.ts",
            diffSide: "RIGHT",
            line: void 0,
            originalLine: void 0,
            comments: [
              graphQLComment("1", "C1", "a", "first", "RIGHT"),
              graphQLComment("2", "C2", "b", "second", "RIGHT")
            ]
          },
          {
            id: "T2",
            isResolved: true,
            isOutdated: void 0,
            path: void 0,
            diffSide: "LEFT",
            line: void 0,
            originalLine: void 0,
            comments: []
          }
        ],
        complete: true,
        headSha: "head-1"
      });
      server.assertSatisfied();
    });
  });
  test("rejects review threads when the pull request head changes during pagination", async () => {
    await withServer(async (server) => {
      server.enqueue(
        gitHubGraphQLStep({
          queryIncludes: "AgentHostPullRequestReviewThreads",
          response: gitHubGraphQLResponse({
            repository: {
              pullRequest: {
                headRefOid: "head-1",
                reviewThreads: {
                  nodes: [],
                  pageInfo: { hasNextPage: true, endCursor: "threads-1" }
                }
              }
            }
          })
        }),
        gitHubGraphQLStep({
          queryIncludes: "AgentHostPullRequestReviewThreads",
          response: gitHubGraphQLResponse({
            repository: {
              pullRequest: {
                headRefOid: "head-2",
                reviewThreads: {
                  nodes: [],
                  pageInfo: { hasNextPage: false, endCursor: null }
                }
              }
            }
          })
        })
      );
      const { query, ref, credential } = setup(server);
      await assert.rejects(() => query.fetch(
        "reviewThreads",
        ref,
        core("head-1"),
        { priority: "visible", conversation: { reviewThreads: true } },
        credential,
        new AbortController().signal
      ), /old pull request head/);
      server.assertSatisfied();
    });
  });
  test("fully paginates current-head checks and normalizes mergeability", async () => {
    await withServer(async (server) => {
      server.enqueue(
        gitHubGraphQLStep({
          queryIncludes: ["AgentHostPullRequestChecks", "isRequired"],
          response: gitHubGraphQLResponse(checksPage("head-1", [{
            __typename: "CheckRun",
            databaseId: 1,
            name: "CI",
            status: "COMPLETED",
            conclusion: "SUCCESS",
            isRequired: true
          }], true, "checks-1"))
        }),
        gitHubGraphQLStep({
          queryIncludes: "AgentHostPullRequestChecks",
          assert: (request) => assert.deepStrictEqual(request.graphQl?.variables, { owner: "octo", repo: "repo", number: 7, after: "checks-1" }),
          response: gitHubGraphQLResponse(checksPage("head-1", [{
            __typename: "StatusContext",
            id: "SC1",
            context: "legacy",
            state: "SUCCESS",
            isRequired: false
          }], false))
        }),
        gitHubGraphQLStep({
          queryIncludes: "AgentHostPullRequestExpectedCheckSuites",
          response: gitHubGraphQLResponse({
            repository: {
              object: {
                oid: "head-1",
                checkSuites: {
                  nodes: [{
                    id: "CS1",
                    status: "COMPLETED",
                    conclusion: "SUCCESS",
                    app: { name: "Build" },
                    checkRuns: { totalCount: 1 }
                  }],
                  pageInfo: { hasNextPage: true, endCursor: "suites-1" }
                }
              }
            }
          })
        }),
        gitHubGraphQLStep({
          queryIncludes: "AgentHostPullRequestExpectedCheckSuites",
          assert: (request) => assert.deepStrictEqual(request.graphQl?.variables, { owner: "octo", repo: "repo", headSha: "head-1", after: "suites-1" }),
          response: gitHubGraphQLResponse({
            repository: {
              object: {
                oid: "head-1",
                checkSuites: {
                  nodes: [{
                    id: "CS2",
                    status: "IN_PROGRESS",
                    conclusion: null,
                    app: { slug: "analysis" },
                    checkRuns: { totalCount: 0 }
                  }],
                  pageInfo: { hasNextPage: false, endCursor: null }
                }
              }
            }
          })
        }),
        gitHubGraphQLStep({
          queryIncludes: ["AgentHostPullRequestMergeability", "mergeQueue(branch: $baseBranch)"],
          response: gitHubGraphQLResponse({
            repository: {
              mergeCommitAllowed: true,
              squashMergeAllowed: true,
              rebaseMergeAllowed: false,
              mergeQueue: null,
              pullRequest: {
                headRefOid: "head-1",
                baseRefOid: "base",
                mergeable: "MERGEABLE",
                mergeStateStatus: "CLEAN",
                reviewDecision: "APPROVED",
                viewerCanUpdateBranch: true,
                viewerCanMerge: true,
                viewerCanEnableAutoMerge: true,
                autoMergeRequest: null,
                mergeQueueEntry: null
              }
            }
          })
        })
      );
      const { query, ref, credential } = setup(server);
      const signal = new AbortController().signal;
      const checks = await query.fetch("checks", ref, core("head-1"), { priority: "interactive", checks: { required: true } }, credential, signal);
      const mergeability = await query.fetch("mergeability", ref, core("head-1"), { priority: "interactive", mergeability: true }, credential, signal);
      assert.deepStrictEqual({
        checks,
        mergeability
      }, {
        checks: {
          fragment: "checks",
          value: {
            headSha: "head-1",
            requirednessComplete: true,
            expectedSuites: [
              { id: "CS1", name: "Build", status: "COMPLETED", conclusion: "SUCCESS", checkRunsReported: true },
              { id: "CS2", name: "analysis", status: "IN_PROGRESS", conclusion: void 0, checkRunsReported: false }
            ],
            expectedSuitesComplete: true,
            checks: [
              { id: "1", type: "checkRun", name: "CI", status: "COMPLETED", conclusion: "SUCCESS", required: true, detailsUrl: void 0, workflowName: void 0 }
            ]
          },
          complete: true,
          headSha: "head-1"
        },
        mergeability: {
          fragment: "mergeability",
          value: {
            headSha: "head-1",
            baseSha: "base",
            mergeable: "MERGEABLE",
            mergeStateStatus: "CLEAN",
            reviewDecision: "APPROVED",
            viewerCanUpdate: true,
            viewerCanMerge: true,
            viewerCanEnableAutoMerge: true,
            allowedMergeMethods: ["MERGE", "SQUASH"],
            autoMergeEnabled: false,
            mergeQueueEntryId: void 0,
            mergeQueueRequired: false,
            queueRequirementKnown: true
          },
          complete: true,
          headSha: "head-1"
        }
      });
      server.assertSatisfied();
    });
  });
  test("fails closed for fallback checks and stale-head GraphQL checks", async () => {
    await withServer(async (server) => {
      const unavailable = {
        graphql: false,
        mergeQueue: false,
        internalMergeStatus: false,
        reviewThreads: false,
        checkContextRequiredness: false
      };
      server.enqueue(
        gitHubRestStep({
          method: "GET",
          path: "/repos/octo/repo/commits/head-1/check-runs",
          query: { per_page: 100 },
          response: gitHubJsonResponse({ check_runs: [{ id: 1, name: "CI", status: "completed", conclusion: "success" }] })
        }),
        gitHubRestStep({
          method: "GET",
          path: "/repos/octo/repo/commits/head-1/status",
          query: { per_page: 100 },
          response: gitHubJsonResponse({ statuses: [{ id: 2, context: "legacy", state: "success" }] })
        })
      );
      const fallback = setup(server, unavailable);
      const result = await fallback.query.fetch(
        "checks",
        fallback.ref,
        core("head-1"),
        { priority: "background", checks: { required: true } },
        fallback.credential,
        new AbortController().signal
      );
      assert.deepStrictEqual({
        complete: result.complete,
        value: result.fragment === "checks" ? result.value : void 0
      }, {
        complete: false,
        value: {
          headSha: "head-1",
          requirednessComplete: false,
          expectedSuites: [],
          expectedSuitesComplete: false,
          checks: [
            { id: "1", type: "checkRun", name: "CI", status: "COMPLETED", conclusion: "SUCCESS", detailsUrl: void 0 },
            { id: "2", type: "statusContext", name: "legacy", status: "SUCCESS", detailsUrl: void 0 }
          ]
        }
      });
      server.assertSatisfied();
    });
    await withServer(async (server) => {
      server.enqueue(gitHubGraphQLStep({
        response: gitHubGraphQLResponse(checksPage("head-2", [], false))
      }));
      const { query, ref, credential } = setup(server);
      await assert.rejects(
        () => query.fetch("checks", ref, core("head-1"), { priority: "interactive", checks: { required: true } }, credential, new AbortController().signal),
        (error) => error instanceof GitHubRequestError && error.message.includes("old pull request head")
      );
      server.assertSatisfied();
    });
  });
});
function rawCore(headSha) {
  return {
    node_id: "PR_7",
    number: 7,
    title: "PR title",
    body: "PR body",
    html_url: "https://github.example.test/new-owner/new-repo/pull/7",
    state: "open",
    merged: false,
    draft: false,
    user: { id: 1, login: "author" },
    head: { sha: headSha, ref: "feature" },
    base: {
      sha: "base",
      ref: "main",
      repo: { node_id: "R_1", full_name: "new-owner/new-repo" }
    }
  };
}
function core(headSha) {
  return {
    id: "PR_7",
    repositoryId: "R_1",
    repositoryNameWithOwner: "new-owner/new-repo",
    number: 7,
    title: "PR title",
    body: "PR body",
    url: "https://github.example.test/new-owner/new-repo/pull/7",
    state: "open",
    draft: false,
    headSha,
    headRef: "feature",
    baseSha: "base",
    baseRef: "main",
    author: { id: "1", login: "author" },
    createdAt: void 0,
    updatedAt: void 0,
    closedAt: void 0,
    mergedAt: void 0
  };
}
function graphQLComment(id, nodeId, login, body, side) {
  return {
    id,
    nodeId,
    author: { login },
    body,
    url: void 0,
    createdAt: void 0,
    updatedAt: void 0,
    path: void 0,
    line: void 0,
    originalLine: void 0,
    side,
    commitId: void 0,
    originalCommitId: void 0
  };
}
function checksPage(headSha, nodes, hasNextPage, endCursor = null) {
  return {
    repository: {
      pullRequest: {
        headRefOid: headSha,
        commits: {
          nodes: [{
            commit: {
              statusCheckRollup: {
                contexts: {
                  nodes,
                  pageInfo: { hasNextPage, endCursor }
                }
              }
            }
          }]
        }
      }
    }
  };
}
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxwbGF0Zm9ybVxcZ2l0aHViXFx0ZXN0XFxub2RlXFxwdWxsUmVxdWVzdFF1ZXJ5U2VydmljZS50ZXN0LnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IGFzc2VydCBmcm9tICdhc3NlcnQnO1xuaW1wb3J0IHsgZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS90ZXN0L2NvbW1vbi91dGlscy5qcyc7XG5pbXBvcnQgeyBQdWxsUmVxdWVzdENvcmUsIFB1bGxSZXF1ZXN0UmVmLCBQdWxsUmVxdWVzdFN1YnNjcmlwdGlvbk9wdGlvbnMgfSBmcm9tICcuLi8uLi9jb21tb24vZ2l0aHViUHVsbFJlcXVlc3RTZXJ2aWNlLmpzJztcbmltcG9ydCB7IEdpdEh1Ykhvc3RDYXBhYmlsaXRpZXMgfSBmcm9tICcuLi8uLi9jb21tb24vZ2l0aHViVHlwZXMuanMnO1xuaW1wb3J0IHsgR2l0SHViQ3JlZGVudGlhbCB9IGZyb20gJy4uLy4uL2NvbW1vbi9naXRodWJDcmVkZW50aWFsU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJR2l0SHViQ2FwYWJpbGl0aWVzIH0gZnJvbSAnLi4vLi4vY29tbW9uL2dpdGh1Ykhvc3RDYXBhYmlsaXRpZXNTZXJ2aWNlLmpzJztcbmltcG9ydCB7IEdpdEh1YlJlcXVlc3RFcnJvciwgR2l0SHViVHJhbnNwb3J0IH0gZnJvbSAnLi4vLi4vY29tbW9uL2dpdGh1YlRyYW5zcG9ydC5qcyc7XG5pbXBvcnQgeyBQdWxsUmVxdWVzdFF1ZXJ5U2VydmljZSB9IGZyb20gJy4uLy4uL2NvbW1vbi9wdWxsUmVxdWVzdFF1ZXJ5U2VydmljZS5qcyc7XG5pbXBvcnQgeyBub2RlRmV0Y2ggfSBmcm9tICcuL25vZGVGZXRjaC5qcyc7XG5pbXBvcnQgeyBnaXRIdWJHcmFwaFFMUmVzcG9uc2UsIGdpdEh1YkdyYXBoUUxTdGVwLCBnaXRIdWJKc29uUmVzcG9uc2UsIGdpdEh1YlJlc3RTdGVwLCBQcm9ncmFtbWFibGVHaXRIdWJTZXJ2ZXIgfSBmcm9tICcuL3Byb2dyYW1tYWJsZUdpdEh1YlNlcnZlci5qcyc7XG5cbmNvbnN0IGF2YWlsYWJsZUNhcGFiaWxpdGllczogR2l0SHViSG9zdENhcGFiaWxpdGllcyA9IHtcblx0Z3JhcGhxbDogdHJ1ZSxcblx0bWVyZ2VRdWV1ZTogdHJ1ZSxcblx0aW50ZXJuYWxNZXJnZVN0YXR1czogZmFsc2UsXG5cdHJldmlld1RocmVhZHM6IHRydWUsXG5cdGNoZWNrQ29udGV4dFJlcXVpcmVkbmVzczogdHJ1ZSxcbn07XG5cbmNsYXNzIFRlc3RDYXBhYmlsaXRpZXNTZXJ2aWNlIGltcGxlbWVudHMgSUdpdEh1YkNhcGFiaWxpdGllcyB7XG5cblx0Y29uc3RydWN0b3IocmVhZG9ubHkgdmFsdWU6IEdpdEh1Ykhvc3RDYXBhYmlsaXRpZXMpIHsgfVxuXG5cdGdldENhcGFiaWxpdGllcygpOiBQcm9taXNlPEdpdEh1Ykhvc3RDYXBhYmlsaXRpZXM+IHtcblx0XHRyZXR1cm4gUHJvbWlzZS5yZXNvbHZlKHRoaXMudmFsdWUpO1xuXHR9XG5cblx0Y2xlYXIoKTogdm9pZCB7IH1cbn1cblxuc3VpdGUoJ1B1bGxSZXF1ZXN0UXVlcnlTZXJ2aWNlJywgKCkgPT4ge1xuXHRjb25zdCBkaXNwb3NhYmxlcyA9IGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSgpO1xuXG5cdGFzeW5jIGZ1bmN0aW9uIHdpdGhTZXJ2ZXIoZm46IChzZXJ2ZXI6IFByb2dyYW1tYWJsZUdpdEh1YlNlcnZlcikgPT4gUHJvbWlzZTx2b2lkPik6IFByb21pc2U8dm9pZD4ge1xuXHRcdGNvbnN0IHNlcnZlciA9IGF3YWl0IFByb2dyYW1tYWJsZUdpdEh1YlNlcnZlci5zdGFydCgpO1xuXHRcdHRyeSB7XG5cdFx0XHRhd2FpdCBmbihzZXJ2ZXIpO1xuXHRcdH0gZmluYWxseSB7XG5cdFx0XHRhd2FpdCBzZXJ2ZXIuZGlzcG9zZUFzeW5jKCk7XG5cdFx0fVxuXHR9XG5cblx0ZnVuY3Rpb24gc2V0dXAoc2VydmVyOiBQcm9ncmFtbWFibGVHaXRIdWJTZXJ2ZXIsIGNhcGFiaWxpdGllcyA9IGF2YWlsYWJsZUNhcGFiaWxpdGllcyk6IHtcblx0XHRyZWFkb25seSBxdWVyeTogUHVsbFJlcXVlc3RRdWVyeVNlcnZpY2U7XG5cdFx0cmVhZG9ubHkgcmVmOiBQdWxsUmVxdWVzdFJlZjtcblx0XHRyZWFkb25seSBjcmVkZW50aWFsOiBHaXRIdWJDcmVkZW50aWFsO1xuXHR9IHtcblx0XHRjb25zdCBhY2NvdW50ID0geyBob3N0OiBuZXcgVVJMKHNlcnZlci5hcGlCYXNlVXJsKS5ob3N0LCBhY2NvdW50SWQ6ICcxMDEnIH07XG5cdFx0Y29uc3Qgc2lnbmFsID0gbmV3IEFib3J0Q29udHJvbGxlcigpLnNpZ25hbDtcblx0XHRjb25zdCB0cmFuc3BvcnQgPSBkaXNwb3NhYmxlcy5hZGQobmV3IEdpdEh1YlRyYW5zcG9ydChub2RlRmV0Y2gpKTtcblx0XHRyZXR1cm4ge1xuXHRcdFx0cXVlcnk6IG5ldyBQdWxsUmVxdWVzdFF1ZXJ5U2VydmljZSh0cmFuc3BvcnQsIG5ldyBUZXN0Q2FwYWJpbGl0aWVzU2VydmljZShjYXBhYmlsaXRpZXMpLCBzZXJ2ZXIuY3JlYXRlRW5kcG9pbnRTZXJ2aWNlKCkpLFxuXHRcdFx0cmVmOiB7IC4uLmFjY291bnQsIG93bmVyOiAnb2N0bycsIHJlcG86ICdyZXBvJywgbnVtYmVyOiA3IH0sXG5cdFx0XHRjcmVkZW50aWFsOiB7IGFjY291bnQsIHRva2VuOiAndG9rZW4nLCBnZW5lcmF0aW9uOiAxLCBzaWduYWwgfSxcblx0XHR9O1xuXHR9XG5cblx0dGVzdCgnbm9ybWFsaXplcyBjb3JlIGFuZCBjb21wbGV0ZSBpbmRlcGVuZGVudCBSRVNUIGNvbnZlcnNhdGlvbiBmcmFnbWVudHMnLCBhc3luYyAoKSA9PiB7XG5cdFx0YXdhaXQgd2l0aFNlcnZlcihhc3luYyBzZXJ2ZXIgPT4ge1xuXHRcdFx0c2VydmVyLmVucXVldWUoXG5cdFx0XHRcdGdpdEh1YlJlc3RTdGVwKHsgbWV0aG9kOiAnR0VUJywgcGF0aDogJy9yZXBvcy9vY3RvL3JlcG8vcHVsbHMvNycsIHJlc3BvbnNlOiBnaXRIdWJKc29uUmVzcG9uc2UocmF3Q29yZSgnaGVhZC0xJyksIHsgZXRhZzogJ1wiY29yZVwiJyB9KSB9KSxcblx0XHRcdFx0Z2l0SHViUmVzdFN0ZXAoe1xuXHRcdFx0XHRcdG1ldGhvZDogJ0dFVCcsXG5cdFx0XHRcdFx0cGF0aDogJy9yZXBvcy9vY3RvL3JlcG8vaXNzdWVzLzcvY29tbWVudHMnLFxuXHRcdFx0XHRcdHF1ZXJ5OiB7IHBlcl9wYWdlOiAxMDAgfSxcblx0XHRcdFx0XHRyZXNwb25zZTogZ2l0SHViSnNvblJlc3BvbnNlKFt7IGlkOiAxLCBub2RlX2lkOiAnSUNfMScsIGJvZHk6ICdvbmUnLCB1c2VyOiB7IGlkOiAxMCwgbG9naW46ICdhJyB9IH1dLCB7XG5cdFx0XHRcdFx0XHRsaW5rOiBgPCR7c2VydmVyLmFwaUJhc2VVcmx9L3JlcG9zL29jdG8vcmVwby9pc3N1ZXMvNy9jb21tZW50cz9wZXJfcGFnZT0xMDAmcGFnZT0yPjsgcmVsPVwibmV4dFwiYCxcblx0XHRcdFx0XHR9KSxcblx0XHRcdFx0fSksXG5cdFx0XHRcdGdpdEh1YlJlc3RTdGVwKHtcblx0XHRcdFx0XHRtZXRob2Q6ICdHRVQnLFxuXHRcdFx0XHRcdHBhdGg6ICcvcmVwb3Mvb2N0by9yZXBvL2lzc3Vlcy83L2NvbW1lbnRzJyxcblx0XHRcdFx0XHRxdWVyeTogeyBwZXJfcGFnZTogMTAwLCBwYWdlOiAyIH0sXG5cdFx0XHRcdFx0cmVzcG9uc2U6IGdpdEh1Ykpzb25SZXNwb25zZShbeyBpZDogMiwgYm9keTogJ3R3bycsIHVzZXI6IHsgaWQ6IDExLCBsb2dpbjogJ2InIH0gfV0pLFxuXHRcdFx0XHR9KSxcblx0XHRcdFx0Z2l0SHViUmVzdFN0ZXAoe1xuXHRcdFx0XHRcdG1ldGhvZDogJ0dFVCcsXG5cdFx0XHRcdFx0cGF0aDogJy9yZXBvcy9vY3RvL3JlcG8vcHVsbHMvNy9yZXZpZXdzJyxcblx0XHRcdFx0XHRxdWVyeTogeyBwZXJfcGFnZTogMTAwIH0sXG5cdFx0XHRcdFx0cmVzcG9uc2U6IGdpdEh1Ykpzb25SZXNwb25zZShbeyBpZDogMywgc3RhdGU6ICdBUFBST1ZFRCcsIGJvZHk6ICdhcHByb3ZlZCcsIHVzZXI6IHsgbG9naW46ICdjJyB9LCBjb21taXRfaWQ6ICdoZWFkLTEnIH1dKSxcblx0XHRcdFx0fSksXG5cdFx0XHRcdGdpdEh1YlJlc3RTdGVwKHtcblx0XHRcdFx0XHRtZXRob2Q6ICdHRVQnLFxuXHRcdFx0XHRcdHBhdGg6ICcvcmVwb3Mvb2N0by9yZXBvL3B1bGxzLzcvY29tbWVudHMnLFxuXHRcdFx0XHRcdHF1ZXJ5OiB7IHBlcl9wYWdlOiAxMDAgfSxcblx0XHRcdFx0XHRyZXNwb25zZTogZ2l0SHViSnNvblJlc3BvbnNlKFt7IGlkOiA0LCBib2R5OiAnaW5saW5lJywgcGF0aDogJ3NyYy9hLnRzJywgbGluZTogMywgdXNlcjogeyBsb2dpbjogJ2QnIH0gfV0pLFxuXHRcdFx0XHR9KSxcblx0XHRcdCk7XG5cdFx0XHRjb25zdCB7IHF1ZXJ5LCByZWYsIGNyZWRlbnRpYWwgfSA9IHNldHVwKHNlcnZlcik7XG5cdFx0XHRjb25zdCBzaWduYWwgPSBuZXcgQWJvcnRDb250cm9sbGVyKCkuc2lnbmFsO1xuXHRcdFx0Y29uc3Qgb3B0aW9uczogUHVsbFJlcXVlc3RTdWJzY3JpcHRpb25PcHRpb25zID0ge1xuXHRcdFx0XHRwcmlvcml0eTogJ3Zpc2libGUnLFxuXHRcdFx0XHRjb252ZXJzYXRpb246IHtcblx0XHRcdFx0XHR0b3BMZXZlbENvbW1lbnRzOiB0cnVlLFxuXHRcdFx0XHRcdHN1Ym1pdHRlZFJldmlld3M6IHRydWUsXG5cdFx0XHRcdFx0aW5saW5lQ29tbWVudHM6IHRydWUsXG5cdFx0XHRcdFx0aW5jbHVkZUJvZGllczogdHJ1ZSxcblx0XHRcdFx0fSxcblx0XHRcdH07XG5cblx0XHRcdGNvbnN0IGNvcmVSZXN1bHQgPSBhd2FpdCBxdWVyeS5mZXRjaCgnY29yZScsIHJlZiwgdW5kZWZpbmVkLCBvcHRpb25zLCBjcmVkZW50aWFsLCBzaWduYWwpO1xuXHRcdFx0Y29uc3Qgbm9ybWFsaXplZENvcmUgPSBjb3JlUmVzdWx0LmZyYWdtZW50ID09PSAnY29yZScgPyBjb3JlUmVzdWx0LnZhbHVlIDogdW5kZWZpbmVkO1xuXHRcdFx0Y29uc3QgY29tbWVudHMgPSBhd2FpdCBxdWVyeS5mZXRjaCgndG9wTGV2ZWxDb21tZW50cycsIHJlZiwgbm9ybWFsaXplZENvcmUsIG9wdGlvbnMsIGNyZWRlbnRpYWwsIHNpZ25hbCk7XG5cdFx0XHRjb25zdCByZXZpZXdzID0gYXdhaXQgcXVlcnkuZmV0Y2goJ3N1Ym1pdHRlZFJldmlld3MnLCByZWYsIG5vcm1hbGl6ZWRDb3JlLCBvcHRpb25zLCBjcmVkZW50aWFsLCBzaWduYWwpO1xuXHRcdFx0Y29uc3QgaW5saW5lID0gYXdhaXQgcXVlcnkuZmV0Y2goJ2lubGluZUNvbW1lbnRzJywgcmVmLCBub3JtYWxpemVkQ29yZSwgb3B0aW9ucywgY3JlZGVudGlhbCwgc2lnbmFsKTtcblxuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRcdGNvcmU6IGNvcmVSZXN1bHQsXG5cdFx0XHRcdGNvbW1lbnRzLFxuXHRcdFx0XHRyZXZpZXdzLFxuXHRcdFx0XHRpbmxpbmUsXG5cdFx0XHR9LCB7XG5cdFx0XHRcdGNvcmU6IHsgZnJhZ21lbnQ6ICdjb3JlJywgdmFsdWU6IGNvcmUoJ2hlYWQtMScpLCBjb21wbGV0ZTogdHJ1ZSB9LFxuXHRcdFx0XHRjb21tZW50czoge1xuXHRcdFx0XHRcdGZyYWdtZW50OiAndG9wTGV2ZWxDb21tZW50cycsXG5cdFx0XHRcdFx0dmFsdWU6IFtcblx0XHRcdFx0XHRcdHsgaWQ6ICcxJywgbm9kZUlkOiAnSUNfMScsIGF1dGhvcjogeyBpZDogJzEwJywgbG9naW46ICdhJyB9LCBib2R5OiAnb25lJywgdXJsOiB1bmRlZmluZWQsIGNyZWF0ZWRBdDogdW5kZWZpbmVkLCB1cGRhdGVkQXQ6IHVuZGVmaW5lZCB9LFxuXHRcdFx0XHRcdFx0eyBpZDogJzInLCBub2RlSWQ6IHVuZGVmaW5lZCwgYXV0aG9yOiB7IGlkOiAnMTEnLCBsb2dpbjogJ2InIH0sIGJvZHk6ICd0d28nLCB1cmw6IHVuZGVmaW5lZCwgY3JlYXRlZEF0OiB1bmRlZmluZWQsIHVwZGF0ZWRBdDogdW5kZWZpbmVkIH0sXG5cdFx0XHRcdFx0XSxcblx0XHRcdFx0XHRjb21wbGV0ZTogdHJ1ZSxcblx0XHRcdFx0fSxcblx0XHRcdFx0cmV2aWV3czoge1xuXHRcdFx0XHRcdGZyYWdtZW50OiAnc3VibWl0dGVkUmV2aWV3cycsXG5cdFx0XHRcdFx0dmFsdWU6IFt7IGlkOiAnMycsIG5vZGVJZDogdW5kZWZpbmVkLCBhdXRob3I6IHsgbG9naW46ICdjJyB9LCBzdGF0ZTogJ0FQUFJPVkVEJywgYm9keTogJ2FwcHJvdmVkJywgY29tbWl0SWQ6ICdoZWFkLTEnLCBzdWJtaXR0ZWRBdDogdW5kZWZpbmVkIH1dLFxuXHRcdFx0XHRcdGNvbXBsZXRlOiB0cnVlLFxuXHRcdFx0XHR9LFxuXHRcdFx0XHRpbmxpbmU6IHtcblx0XHRcdFx0XHRmcmFnbWVudDogJ2lubGluZUNvbW1lbnRzJyxcblx0XHRcdFx0XHR2YWx1ZTogW3tcblx0XHRcdFx0XHRcdGlkOiAnNCcsXG5cdFx0XHRcdFx0XHRub2RlSWQ6IHVuZGVmaW5lZCxcblx0XHRcdFx0XHRcdGF1dGhvcjogeyBsb2dpbjogJ2QnIH0sXG5cdFx0XHRcdFx0XHRib2R5OiAnaW5saW5lJyxcblx0XHRcdFx0XHRcdHVybDogdW5kZWZpbmVkLFxuXHRcdFx0XHRcdFx0Y3JlYXRlZEF0OiB1bmRlZmluZWQsXG5cdFx0XHRcdFx0XHR1cGRhdGVkQXQ6IHVuZGVmaW5lZCxcblx0XHRcdFx0XHRcdHJldmlld0lkOiB1bmRlZmluZWQsXG5cdFx0XHRcdFx0XHRyZXBseVRvSWQ6IHVuZGVmaW5lZCxcblx0XHRcdFx0XHRcdHBhdGg6ICdzcmMvYS50cycsXG5cdFx0XHRcdFx0XHRsaW5lOiAzLFxuXHRcdFx0XHRcdFx0b3JpZ2luYWxMaW5lOiB1bmRlZmluZWQsXG5cdFx0XHRcdFx0XHRzaWRlOiB1bmRlZmluZWQsXG5cdFx0XHRcdFx0XHRjb21taXRJZDogdW5kZWZpbmVkLFxuXHRcdFx0XHRcdFx0b3JpZ2luYWxDb21taXRJZDogdW5kZWZpbmVkLFxuXHRcdFx0XHRcdH1dLFxuXHRcdFx0XHRcdGNvbXBsZXRlOiB0cnVlLFxuXHRcdFx0XHR9LFxuXHRcdFx0fSk7XG5cdFx0XHRzZXJ2ZXIuYXNzZXJ0U2F0aXNmaWVkKCk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2Z1bGx5IHBhZ2luYXRlcyByZXZpZXcgdGhyZWFkcyBhbmQgbmVzdGVkIGNvbW1lbnRzJywgYXN5bmMgKCkgPT4ge1xuXHRcdGF3YWl0IHdpdGhTZXJ2ZXIoYXN5bmMgc2VydmVyID0+IHtcblx0XHRcdHNlcnZlci5lbnF1ZXVlKFxuXHRcdFx0XHRnaXRIdWJHcmFwaFFMU3RlcCh7XG5cdFx0XHRcdFx0cXVlcnlJbmNsdWRlczogJ0FnZW50SG9zdFB1bGxSZXF1ZXN0UmV2aWV3VGhyZWFkcycsXG5cdFx0XHRcdFx0YXNzZXJ0OiByZXF1ZXN0ID0+IGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocmVxdWVzdC5ncmFwaFFsPy52YXJpYWJsZXMsIHsgb3duZXI6ICdvY3RvJywgcmVwbzogJ3JlcG8nLCBudW1iZXI6IDcgfSksXG5cdFx0XHRcdFx0cmVzcG9uc2U6IGdpdEh1YkdyYXBoUUxSZXNwb25zZSh7XG5cdFx0XHRcdFx0XHRyZXBvc2l0b3J5OiB7XG5cdFx0XHRcdFx0XHRcdHB1bGxSZXF1ZXN0OiB7XG5cdFx0XHRcdFx0XHRcdFx0aGVhZFJlZk9pZDogJ2hlYWQtMScsXG5cdFx0XHRcdFx0XHRcdFx0cmV2aWV3VGhyZWFkczoge1xuXHRcdFx0XHRcdFx0XHRcdFx0bm9kZXM6IFt7XG5cdFx0XHRcdFx0XHRcdFx0XHRcdGlkOiAnVDEnLFxuXHRcdFx0XHRcdFx0XHRcdFx0XHRpc1Jlc29sdmVkOiBmYWxzZSxcblx0XHRcdFx0XHRcdFx0XHRcdFx0cGF0aDogJ2EudHMnLFxuXHRcdFx0XHRcdFx0XHRcdFx0XHRkaWZmU2lkZTogJ1JJR0hUJyxcblx0XHRcdFx0XHRcdFx0XHRcdFx0Y29tbWVudHM6IHtcblx0XHRcdFx0XHRcdFx0XHRcdFx0XHRub2RlczogW3sgaWQ6ICdDMScsIGRhdGFiYXNlSWQ6IDEsIGJvZHk6ICdmaXJzdCcsIGF1dGhvcjogeyBsb2dpbjogJ2EnIH0gfV0sXG5cdFx0XHRcdFx0XHRcdFx0XHRcdFx0cGFnZUluZm86IHsgaGFzTmV4dFBhZ2U6IHRydWUsIGVuZEN1cnNvcjogJ2NvbW1lbnRzLTEnIH0sXG5cdFx0XHRcdFx0XHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0XHRcdFx0XHR9XSxcblx0XHRcdFx0XHRcdFx0XHRcdHBhZ2VJbmZvOiB7IGhhc05leHRQYWdlOiB0cnVlLCBlbmRDdXJzb3I6ICd0aHJlYWRzLTEnIH0sXG5cdFx0XHRcdFx0XHRcdFx0fSxcblx0XHRcdFx0XHRcdFx0fSxcblx0XHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0fSksXG5cdFx0XHRcdH0pLFxuXHRcdFx0XHRnaXRIdWJHcmFwaFFMU3RlcCh7XG5cdFx0XHRcdFx0cXVlcnlJbmNsdWRlczogJ0FnZW50SG9zdFB1bGxSZXF1ZXN0UmV2aWV3VGhyZWFkQ29tbWVudHMnLFxuXHRcdFx0XHRcdGFzc2VydDogcmVxdWVzdCA9PiBhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHJlcXVlc3QuZ3JhcGhRbD8udmFyaWFibGVzLCB7IHRocmVhZElkOiAnVDEnLCBhZnRlcjogJ2NvbW1lbnRzLTEnIH0pLFxuXHRcdFx0XHRcdHJlc3BvbnNlOiBnaXRIdWJHcmFwaFFMUmVzcG9uc2Uoe1xuXHRcdFx0XHRcdFx0bm9kZToge1xuXHRcdFx0XHRcdFx0XHRjb21tZW50czoge1xuXHRcdFx0XHRcdFx0XHRcdG5vZGVzOiBbeyBpZDogJ0MyJywgZGF0YWJhc2VJZDogMiwgYm9keTogJ3NlY29uZCcsIGF1dGhvcjogeyBsb2dpbjogJ2InIH0gfV0sXG5cdFx0XHRcdFx0XHRcdFx0cGFnZUluZm86IHsgaGFzTmV4dFBhZ2U6IGZhbHNlLCBlbmRDdXJzb3I6IG51bGwgfSxcblx0XHRcdFx0XHRcdFx0fSxcblx0XHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0fSksXG5cdFx0XHRcdH0pLFxuXHRcdFx0XHRnaXRIdWJHcmFwaFFMU3RlcCh7XG5cdFx0XHRcdFx0cXVlcnlJbmNsdWRlczogJ0FnZW50SG9zdFB1bGxSZXF1ZXN0UmV2aWV3VGhyZWFkcycsXG5cdFx0XHRcdFx0YXNzZXJ0OiByZXF1ZXN0ID0+IGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocmVxdWVzdC5ncmFwaFFsPy52YXJpYWJsZXMsIHsgb3duZXI6ICdvY3RvJywgcmVwbzogJ3JlcG8nLCBudW1iZXI6IDcsIGFmdGVyOiAndGhyZWFkcy0xJyB9KSxcblx0XHRcdFx0XHRyZXNwb25zZTogZ2l0SHViR3JhcGhRTFJlc3BvbnNlKHtcblx0XHRcdFx0XHRcdHJlcG9zaXRvcnk6IHtcblx0XHRcdFx0XHRcdFx0cHVsbFJlcXVlc3Q6IHtcblx0XHRcdFx0XHRcdFx0XHRoZWFkUmVmT2lkOiAnaGVhZC0xJyxcblx0XHRcdFx0XHRcdFx0XHRyZXZpZXdUaHJlYWRzOiB7XG5cdFx0XHRcdFx0XHRcdFx0XHRub2RlczogW3tcblx0XHRcdFx0XHRcdFx0XHRcdFx0aWQ6ICdUMicsXG5cdFx0XHRcdFx0XHRcdFx0XHRcdGlzUmVzb2x2ZWQ6IHRydWUsXG5cdFx0XHRcdFx0XHRcdFx0XHRcdGRpZmZTaWRlOiAnTEVGVCcsXG5cdFx0XHRcdFx0XHRcdFx0XHRcdGNvbW1lbnRzOiB7IG5vZGVzOiBbXSwgcGFnZUluZm86IHsgaGFzTmV4dFBhZ2U6IGZhbHNlLCBlbmRDdXJzb3I6IG51bGwgfSB9LFxuXHRcdFx0XHRcdFx0XHRcdFx0fV0sXG5cdFx0XHRcdFx0XHRcdFx0XHRwYWdlSW5mbzogeyBoYXNOZXh0UGFnZTogZmFsc2UsIGVuZEN1cnNvcjogbnVsbCB9LFxuXHRcdFx0XHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdH0pLFxuXHRcdFx0XHR9KSxcblx0XHRcdCk7XG5cdFx0XHRjb25zdCB7IHF1ZXJ5LCByZWYsIGNyZWRlbnRpYWwgfSA9IHNldHVwKHNlcnZlcik7XG5cdFx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCBxdWVyeS5mZXRjaChcblx0XHRcdFx0J3Jldmlld1RocmVhZHMnLFxuXHRcdFx0XHRyZWYsXG5cdFx0XHRcdGNvcmUoJ2hlYWQtMScpLFxuXHRcdFx0XHR7IHByaW9yaXR5OiAndmlzaWJsZScsIGNvbnZlcnNhdGlvbjogeyByZXZpZXdUaHJlYWRzOiB0cnVlLCBpbmNsdWRlQm9kaWVzOiB0cnVlIH0gfSxcblx0XHRcdFx0Y3JlZGVudGlhbCxcblx0XHRcdFx0bmV3IEFib3J0Q29udHJvbGxlcigpLnNpZ25hbCxcblx0XHRcdCk7XG5cblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocmVzdWx0LCB7XG5cdFx0XHRcdGZyYWdtZW50OiAncmV2aWV3VGhyZWFkcycsXG5cdFx0XHRcdHZhbHVlOiBbXG5cdFx0XHRcdFx0e1xuXHRcdFx0XHRcdFx0aWQ6ICdUMScsXG5cdFx0XHRcdFx0XHRpc1Jlc29sdmVkOiBmYWxzZSxcblx0XHRcdFx0XHRcdGlzT3V0ZGF0ZWQ6IHVuZGVmaW5lZCxcblx0XHRcdFx0XHRcdHBhdGg6ICdhLnRzJyxcblx0XHRcdFx0XHRcdGRpZmZTaWRlOiAnUklHSFQnLFxuXHRcdFx0XHRcdFx0bGluZTogdW5kZWZpbmVkLFxuXHRcdFx0XHRcdFx0b3JpZ2luYWxMaW5lOiB1bmRlZmluZWQsXG5cdFx0XHRcdFx0XHRjb21tZW50czogW1xuXHRcdFx0XHRcdFx0XHRncmFwaFFMQ29tbWVudCgnMScsICdDMScsICdhJywgJ2ZpcnN0JywgJ1JJR0hUJyksXG5cdFx0XHRcdFx0XHRcdGdyYXBoUUxDb21tZW50KCcyJywgJ0MyJywgJ2InLCAnc2Vjb25kJywgJ1JJR0hUJyksXG5cdFx0XHRcdFx0XHRdLFxuXHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0e1xuXHRcdFx0XHRcdFx0aWQ6ICdUMicsXG5cdFx0XHRcdFx0XHRpc1Jlc29sdmVkOiB0cnVlLFxuXHRcdFx0XHRcdFx0aXNPdXRkYXRlZDogdW5kZWZpbmVkLFxuXHRcdFx0XHRcdFx0cGF0aDogdW5kZWZpbmVkLFxuXHRcdFx0XHRcdFx0ZGlmZlNpZGU6ICdMRUZUJyxcblx0XHRcdFx0XHRcdGxpbmU6IHVuZGVmaW5lZCxcblx0XHRcdFx0XHRcdG9yaWdpbmFsTGluZTogdW5kZWZpbmVkLFxuXHRcdFx0XHRcdFx0Y29tbWVudHM6IFtdLFxuXHRcdFx0XHRcdH0sXG5cdFx0XHRcdF0sXG5cdFx0XHRcdGNvbXBsZXRlOiB0cnVlLFxuXHRcdFx0XHRoZWFkU2hhOiAnaGVhZC0xJyxcblx0XHRcdH0pO1xuXHRcdFx0c2VydmVyLmFzc2VydFNhdGlzZmllZCgpO1xuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdyZWplY3RzIHJldmlldyB0aHJlYWRzIHdoZW4gdGhlIHB1bGwgcmVxdWVzdCBoZWFkIGNoYW5nZXMgZHVyaW5nIHBhZ2luYXRpb24nLCBhc3luYyAoKSA9PiB7XG5cdFx0YXdhaXQgd2l0aFNlcnZlcihhc3luYyBzZXJ2ZXIgPT4ge1xuXHRcdFx0c2VydmVyLmVucXVldWUoXG5cdFx0XHRcdGdpdEh1YkdyYXBoUUxTdGVwKHtcblx0XHRcdFx0XHRxdWVyeUluY2x1ZGVzOiAnQWdlbnRIb3N0UHVsbFJlcXVlc3RSZXZpZXdUaHJlYWRzJyxcblx0XHRcdFx0XHRyZXNwb25zZTogZ2l0SHViR3JhcGhRTFJlc3BvbnNlKHtcblx0XHRcdFx0XHRcdHJlcG9zaXRvcnk6IHtcblx0XHRcdFx0XHRcdFx0cHVsbFJlcXVlc3Q6IHtcblx0XHRcdFx0XHRcdFx0XHRoZWFkUmVmT2lkOiAnaGVhZC0xJyxcblx0XHRcdFx0XHRcdFx0XHRyZXZpZXdUaHJlYWRzOiB7XG5cdFx0XHRcdFx0XHRcdFx0XHRub2RlczogW10sXG5cdFx0XHRcdFx0XHRcdFx0XHRwYWdlSW5mbzogeyBoYXNOZXh0UGFnZTogdHJ1ZSwgZW5kQ3Vyc29yOiAndGhyZWFkcy0xJyB9LFxuXHRcdFx0XHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdH0pLFxuXHRcdFx0XHR9KSxcblx0XHRcdFx0Z2l0SHViR3JhcGhRTFN0ZXAoe1xuXHRcdFx0XHRcdHF1ZXJ5SW5jbHVkZXM6ICdBZ2VudEhvc3RQdWxsUmVxdWVzdFJldmlld1RocmVhZHMnLFxuXHRcdFx0XHRcdHJlc3BvbnNlOiBnaXRIdWJHcmFwaFFMUmVzcG9uc2Uoe1xuXHRcdFx0XHRcdFx0cmVwb3NpdG9yeToge1xuXHRcdFx0XHRcdFx0XHRwdWxsUmVxdWVzdDoge1xuXHRcdFx0XHRcdFx0XHRcdGhlYWRSZWZPaWQ6ICdoZWFkLTInLFxuXHRcdFx0XHRcdFx0XHRcdHJldmlld1RocmVhZHM6IHtcblx0XHRcdFx0XHRcdFx0XHRcdG5vZGVzOiBbXSxcblx0XHRcdFx0XHRcdFx0XHRcdHBhZ2VJbmZvOiB7IGhhc05leHRQYWdlOiBmYWxzZSwgZW5kQ3Vyc29yOiBudWxsIH0sXG5cdFx0XHRcdFx0XHRcdFx0fSxcblx0XHRcdFx0XHRcdFx0fSxcblx0XHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0fSksXG5cdFx0XHRcdH0pLFxuXHRcdFx0KTtcblx0XHRcdGNvbnN0IHsgcXVlcnksIHJlZiwgY3JlZGVudGlhbCB9ID0gc2V0dXAoc2VydmVyKTtcblxuXHRcdFx0YXdhaXQgYXNzZXJ0LnJlamVjdHMoKCkgPT4gcXVlcnkuZmV0Y2goXG5cdFx0XHRcdCdyZXZpZXdUaHJlYWRzJyxcblx0XHRcdFx0cmVmLFxuXHRcdFx0XHRjb3JlKCdoZWFkLTEnKSxcblx0XHRcdFx0eyBwcmlvcml0eTogJ3Zpc2libGUnLCBjb252ZXJzYXRpb246IHsgcmV2aWV3VGhyZWFkczogdHJ1ZSB9IH0sXG5cdFx0XHRcdGNyZWRlbnRpYWwsXG5cdFx0XHRcdG5ldyBBYm9ydENvbnRyb2xsZXIoKS5zaWduYWwsXG5cdFx0XHQpLCAvb2xkIHB1bGwgcmVxdWVzdCBoZWFkLyk7XG5cdFx0XHRzZXJ2ZXIuYXNzZXJ0U2F0aXNmaWVkKCk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2Z1bGx5IHBhZ2luYXRlcyBjdXJyZW50LWhlYWQgY2hlY2tzIGFuZCBub3JtYWxpemVzIG1lcmdlYWJpbGl0eScsIGFzeW5jICgpID0+IHtcblx0XHRhd2FpdCB3aXRoU2VydmVyKGFzeW5jIHNlcnZlciA9PiB7XG5cdFx0XHRzZXJ2ZXIuZW5xdWV1ZShcblx0XHRcdFx0Z2l0SHViR3JhcGhRTFN0ZXAoe1xuXHRcdFx0XHRcdHF1ZXJ5SW5jbHVkZXM6IFsnQWdlbnRIb3N0UHVsbFJlcXVlc3RDaGVja3MnLCAnaXNSZXF1aXJlZCddLFxuXHRcdFx0XHRcdHJlc3BvbnNlOiBnaXRIdWJHcmFwaFFMUmVzcG9uc2UoY2hlY2tzUGFnZSgnaGVhZC0xJywgW3tcblx0XHRcdFx0XHRcdF9fdHlwZW5hbWU6ICdDaGVja1J1bicsXG5cdFx0XHRcdFx0XHRkYXRhYmFzZUlkOiAxLFxuXHRcdFx0XHRcdFx0bmFtZTogJ0NJJyxcblx0XHRcdFx0XHRcdHN0YXR1czogJ0NPTVBMRVRFRCcsXG5cdFx0XHRcdFx0XHRjb25jbHVzaW9uOiAnU1VDQ0VTUycsXG5cdFx0XHRcdFx0XHRpc1JlcXVpcmVkOiB0cnVlLFxuXHRcdFx0XHRcdH1dLCB0cnVlLCAnY2hlY2tzLTEnKSksXG5cdFx0XHRcdH0pLFxuXHRcdFx0XHRnaXRIdWJHcmFwaFFMU3RlcCh7XG5cdFx0XHRcdFx0cXVlcnlJbmNsdWRlczogJ0FnZW50SG9zdFB1bGxSZXF1ZXN0Q2hlY2tzJyxcblx0XHRcdFx0XHRhc3NlcnQ6IHJlcXVlc3QgPT4gYXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChyZXF1ZXN0LmdyYXBoUWw/LnZhcmlhYmxlcywgeyBvd25lcjogJ29jdG8nLCByZXBvOiAncmVwbycsIG51bWJlcjogNywgYWZ0ZXI6ICdjaGVja3MtMScgfSksXG5cdFx0XHRcdFx0cmVzcG9uc2U6IGdpdEh1YkdyYXBoUUxSZXNwb25zZShjaGVja3NQYWdlKCdoZWFkLTEnLCBbe1xuXHRcdFx0XHRcdFx0X190eXBlbmFtZTogJ1N0YXR1c0NvbnRleHQnLFxuXHRcdFx0XHRcdFx0aWQ6ICdTQzEnLFxuXHRcdFx0XHRcdFx0Y29udGV4dDogJ2xlZ2FjeScsXG5cdFx0XHRcdFx0XHRzdGF0ZTogJ1NVQ0NFU1MnLFxuXHRcdFx0XHRcdFx0aXNSZXF1aXJlZDogZmFsc2UsXG5cdFx0XHRcdFx0fV0sIGZhbHNlKSksXG5cdFx0XHRcdH0pLFxuXHRcdFx0XHRnaXRIdWJHcmFwaFFMU3RlcCh7XG5cdFx0XHRcdFx0cXVlcnlJbmNsdWRlczogJ0FnZW50SG9zdFB1bGxSZXF1ZXN0RXhwZWN0ZWRDaGVja1N1aXRlcycsXG5cdFx0XHRcdFx0cmVzcG9uc2U6IGdpdEh1YkdyYXBoUUxSZXNwb25zZSh7XG5cdFx0XHRcdFx0XHRyZXBvc2l0b3J5OiB7XG5cdFx0XHRcdFx0XHRcdG9iamVjdDoge1xuXHRcdFx0XHRcdFx0XHRcdG9pZDogJ2hlYWQtMScsXG5cdFx0XHRcdFx0XHRcdFx0Y2hlY2tTdWl0ZXM6IHtcblx0XHRcdFx0XHRcdFx0XHRcdG5vZGVzOiBbe1xuXHRcdFx0XHRcdFx0XHRcdFx0XHRpZDogJ0NTMScsXG5cdFx0XHRcdFx0XHRcdFx0XHRcdHN0YXR1czogJ0NPTVBMRVRFRCcsXG5cdFx0XHRcdFx0XHRcdFx0XHRcdGNvbmNsdXNpb246ICdTVUNDRVNTJyxcblx0XHRcdFx0XHRcdFx0XHRcdFx0YXBwOiB7IG5hbWU6ICdCdWlsZCcgfSxcblx0XHRcdFx0XHRcdFx0XHRcdFx0Y2hlY2tSdW5zOiB7IHRvdGFsQ291bnQ6IDEgfSxcblx0XHRcdFx0XHRcdFx0XHRcdH1dLFxuXHRcdFx0XHRcdFx0XHRcdFx0cGFnZUluZm86IHsgaGFzTmV4dFBhZ2U6IHRydWUsIGVuZEN1cnNvcjogJ3N1aXRlcy0xJyB9LFxuXHRcdFx0XHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdH0pLFxuXHRcdFx0XHR9KSxcblx0XHRcdFx0Z2l0SHViR3JhcGhRTFN0ZXAoe1xuXHRcdFx0XHRcdHF1ZXJ5SW5jbHVkZXM6ICdBZ2VudEhvc3RQdWxsUmVxdWVzdEV4cGVjdGVkQ2hlY2tTdWl0ZXMnLFxuXHRcdFx0XHRcdGFzc2VydDogcmVxdWVzdCA9PiBhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHJlcXVlc3QuZ3JhcGhRbD8udmFyaWFibGVzLCB7IG93bmVyOiAnb2N0bycsIHJlcG86ICdyZXBvJywgaGVhZFNoYTogJ2hlYWQtMScsIGFmdGVyOiAnc3VpdGVzLTEnIH0pLFxuXHRcdFx0XHRcdHJlc3BvbnNlOiBnaXRIdWJHcmFwaFFMUmVzcG9uc2Uoe1xuXHRcdFx0XHRcdFx0cmVwb3NpdG9yeToge1xuXHRcdFx0XHRcdFx0XHRvYmplY3Q6IHtcblx0XHRcdFx0XHRcdFx0XHRvaWQ6ICdoZWFkLTEnLFxuXHRcdFx0XHRcdFx0XHRcdGNoZWNrU3VpdGVzOiB7XG5cdFx0XHRcdFx0XHRcdFx0XHRub2RlczogW3tcblx0XHRcdFx0XHRcdFx0XHRcdFx0aWQ6ICdDUzInLFxuXHRcdFx0XHRcdFx0XHRcdFx0XHRzdGF0dXM6ICdJTl9QUk9HUkVTUycsXG5cdFx0XHRcdFx0XHRcdFx0XHRcdGNvbmNsdXNpb246IG51bGwsXG5cdFx0XHRcdFx0XHRcdFx0XHRcdGFwcDogeyBzbHVnOiAnYW5hbHlzaXMnIH0sXG5cdFx0XHRcdFx0XHRcdFx0XHRcdGNoZWNrUnVuczogeyB0b3RhbENvdW50OiAwIH0sXG5cdFx0XHRcdFx0XHRcdFx0XHR9XSxcblx0XHRcdFx0XHRcdFx0XHRcdHBhZ2VJbmZvOiB7IGhhc05leHRQYWdlOiBmYWxzZSwgZW5kQ3Vyc29yOiBudWxsIH0sXG5cdFx0XHRcdFx0XHRcdFx0fSxcblx0XHRcdFx0XHRcdFx0fSxcblx0XHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0fSksXG5cdFx0XHRcdH0pLFxuXHRcdFx0XHRnaXRIdWJHcmFwaFFMU3RlcCh7XG5cdFx0XHRcdFx0cXVlcnlJbmNsdWRlczogWydBZ2VudEhvc3RQdWxsUmVxdWVzdE1lcmdlYWJpbGl0eScsICdtZXJnZVF1ZXVlKGJyYW5jaDogJGJhc2VCcmFuY2gpJ10sXG5cdFx0XHRcdFx0cmVzcG9uc2U6IGdpdEh1YkdyYXBoUUxSZXNwb25zZSh7XG5cdFx0XHRcdFx0XHRyZXBvc2l0b3J5OiB7XG5cdFx0XHRcdFx0XHRcdG1lcmdlQ29tbWl0QWxsb3dlZDogdHJ1ZSxcblx0XHRcdFx0XHRcdFx0c3F1YXNoTWVyZ2VBbGxvd2VkOiB0cnVlLFxuXHRcdFx0XHRcdFx0XHRyZWJhc2VNZXJnZUFsbG93ZWQ6IGZhbHNlLFxuXHRcdFx0XHRcdFx0XHRtZXJnZVF1ZXVlOiBudWxsLFxuXHRcdFx0XHRcdFx0XHRwdWxsUmVxdWVzdDoge1xuXHRcdFx0XHRcdFx0XHRcdGhlYWRSZWZPaWQ6ICdoZWFkLTEnLFxuXHRcdFx0XHRcdFx0XHRcdGJhc2VSZWZPaWQ6ICdiYXNlJyxcblx0XHRcdFx0XHRcdFx0XHRtZXJnZWFibGU6ICdNRVJHRUFCTEUnLFxuXHRcdFx0XHRcdFx0XHRcdG1lcmdlU3RhdGVTdGF0dXM6ICdDTEVBTicsXG5cdFx0XHRcdFx0XHRcdFx0cmV2aWV3RGVjaXNpb246ICdBUFBST1ZFRCcsXG5cdFx0XHRcdFx0XHRcdFx0dmlld2VyQ2FuVXBkYXRlQnJhbmNoOiB0cnVlLFxuXHRcdFx0XHRcdFx0XHRcdHZpZXdlckNhbk1lcmdlOiB0cnVlLFxuXHRcdFx0XHRcdFx0XHRcdHZpZXdlckNhbkVuYWJsZUF1dG9NZXJnZTogdHJ1ZSxcblx0XHRcdFx0XHRcdFx0XHRhdXRvTWVyZ2VSZXF1ZXN0OiBudWxsLFxuXHRcdFx0XHRcdFx0XHRcdG1lcmdlUXVldWVFbnRyeTogbnVsbCxcblx0XHRcdFx0XHRcdFx0fSxcblx0XHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0fSksXG5cdFx0XHRcdH0pLFxuXHRcdFx0KTtcblx0XHRcdGNvbnN0IHsgcXVlcnksIHJlZiwgY3JlZGVudGlhbCB9ID0gc2V0dXAoc2VydmVyKTtcblx0XHRcdGNvbnN0IHNpZ25hbCA9IG5ldyBBYm9ydENvbnRyb2xsZXIoKS5zaWduYWw7XG5cdFx0XHRjb25zdCBjaGVja3MgPSBhd2FpdCBxdWVyeS5mZXRjaCgnY2hlY2tzJywgcmVmLCBjb3JlKCdoZWFkLTEnKSwgeyBwcmlvcml0eTogJ2ludGVyYWN0aXZlJywgY2hlY2tzOiB7IHJlcXVpcmVkOiB0cnVlIH0gfSwgY3JlZGVudGlhbCwgc2lnbmFsKTtcblx0XHRcdGNvbnN0IG1lcmdlYWJpbGl0eSA9IGF3YWl0IHF1ZXJ5LmZldGNoKCdtZXJnZWFiaWxpdHknLCByZWYsIGNvcmUoJ2hlYWQtMScpLCB7IHByaW9yaXR5OiAnaW50ZXJhY3RpdmUnLCBtZXJnZWFiaWxpdHk6IHRydWUgfSwgY3JlZGVudGlhbCwgc2lnbmFsKTtcblxuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRcdGNoZWNrcyxcblx0XHRcdFx0bWVyZ2VhYmlsaXR5LFxuXHRcdFx0fSwge1xuXHRcdFx0XHRjaGVja3M6IHtcblx0XHRcdFx0XHRmcmFnbWVudDogJ2NoZWNrcycsXG5cdFx0XHRcdFx0dmFsdWU6IHtcblx0XHRcdFx0XHRcdGhlYWRTaGE6ICdoZWFkLTEnLFxuXHRcdFx0XHRcdFx0cmVxdWlyZWRuZXNzQ29tcGxldGU6IHRydWUsXG5cdFx0XHRcdFx0XHRleHBlY3RlZFN1aXRlczogW1xuXHRcdFx0XHRcdFx0XHR7IGlkOiAnQ1MxJywgbmFtZTogJ0J1aWxkJywgc3RhdHVzOiAnQ09NUExFVEVEJywgY29uY2x1c2lvbjogJ1NVQ0NFU1MnLCBjaGVja1J1bnNSZXBvcnRlZDogdHJ1ZSB9LFxuXHRcdFx0XHRcdFx0XHR7IGlkOiAnQ1MyJywgbmFtZTogJ2FuYWx5c2lzJywgc3RhdHVzOiAnSU5fUFJPR1JFU1MnLCBjb25jbHVzaW9uOiB1bmRlZmluZWQsIGNoZWNrUnVuc1JlcG9ydGVkOiBmYWxzZSB9LFxuXHRcdFx0XHRcdFx0XSxcblx0XHRcdFx0XHRcdGV4cGVjdGVkU3VpdGVzQ29tcGxldGU6IHRydWUsXG5cdFx0XHRcdFx0XHRjaGVja3M6IFtcblx0XHRcdFx0XHRcdFx0eyBpZDogJzEnLCB0eXBlOiAnY2hlY2tSdW4nLCBuYW1lOiAnQ0knLCBzdGF0dXM6ICdDT01QTEVURUQnLCBjb25jbHVzaW9uOiAnU1VDQ0VTUycsIHJlcXVpcmVkOiB0cnVlLCBkZXRhaWxzVXJsOiB1bmRlZmluZWQsIHdvcmtmbG93TmFtZTogdW5kZWZpbmVkIH0sXG5cdFx0XHRcdFx0XHRdLFxuXHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0Y29tcGxldGU6IHRydWUsXG5cdFx0XHRcdFx0aGVhZFNoYTogJ2hlYWQtMScsXG5cdFx0XHRcdH0sXG5cdFx0XHRcdG1lcmdlYWJpbGl0eToge1xuXHRcdFx0XHRcdGZyYWdtZW50OiAnbWVyZ2VhYmlsaXR5Jyxcblx0XHRcdFx0XHR2YWx1ZToge1xuXHRcdFx0XHRcdFx0aGVhZFNoYTogJ2hlYWQtMScsXG5cdFx0XHRcdFx0XHRiYXNlU2hhOiAnYmFzZScsXG5cdFx0XHRcdFx0XHRtZXJnZWFibGU6ICdNRVJHRUFCTEUnLFxuXHRcdFx0XHRcdFx0bWVyZ2VTdGF0ZVN0YXR1czogJ0NMRUFOJyxcblx0XHRcdFx0XHRcdHJldmlld0RlY2lzaW9uOiAnQVBQUk9WRUQnLFxuXHRcdFx0XHRcdFx0dmlld2VyQ2FuVXBkYXRlOiB0cnVlLFxuXHRcdFx0XHRcdFx0dmlld2VyQ2FuTWVyZ2U6IHRydWUsXG5cdFx0XHRcdFx0XHR2aWV3ZXJDYW5FbmFibGVBdXRvTWVyZ2U6IHRydWUsXG5cdFx0XHRcdFx0XHRhbGxvd2VkTWVyZ2VNZXRob2RzOiBbJ01FUkdFJywgJ1NRVUFTSCddLFxuXHRcdFx0XHRcdFx0YXV0b01lcmdlRW5hYmxlZDogZmFsc2UsXG5cdFx0XHRcdFx0XHRtZXJnZVF1ZXVlRW50cnlJZDogdW5kZWZpbmVkLFxuXHRcdFx0XHRcdFx0bWVyZ2VRdWV1ZVJlcXVpcmVkOiBmYWxzZSxcblx0XHRcdFx0XHRcdHF1ZXVlUmVxdWlyZW1lbnRLbm93bjogdHJ1ZSxcblx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdGNvbXBsZXRlOiB0cnVlLFxuXHRcdFx0XHRcdGhlYWRTaGE6ICdoZWFkLTEnLFxuXHRcdFx0XHR9LFxuXHRcdFx0fSk7XG5cdFx0XHRzZXJ2ZXIuYXNzZXJ0U2F0aXNmaWVkKCk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2ZhaWxzIGNsb3NlZCBmb3IgZmFsbGJhY2sgY2hlY2tzIGFuZCBzdGFsZS1oZWFkIEdyYXBoUUwgY2hlY2tzJywgYXN5bmMgKCkgPT4ge1xuXHRcdGF3YWl0IHdpdGhTZXJ2ZXIoYXN5bmMgc2VydmVyID0+IHtcblx0XHRcdGNvbnN0IHVuYXZhaWxhYmxlOiBHaXRIdWJIb3N0Q2FwYWJpbGl0aWVzID0ge1xuXHRcdFx0XHRncmFwaHFsOiBmYWxzZSxcblx0XHRcdFx0bWVyZ2VRdWV1ZTogZmFsc2UsXG5cdFx0XHRcdGludGVybmFsTWVyZ2VTdGF0dXM6IGZhbHNlLFxuXHRcdFx0XHRyZXZpZXdUaHJlYWRzOiBmYWxzZSxcblx0XHRcdFx0Y2hlY2tDb250ZXh0UmVxdWlyZWRuZXNzOiBmYWxzZSxcblx0XHRcdH07XG5cdFx0XHRzZXJ2ZXIuZW5xdWV1ZShcblx0XHRcdFx0Z2l0SHViUmVzdFN0ZXAoe1xuXHRcdFx0XHRcdG1ldGhvZDogJ0dFVCcsXG5cdFx0XHRcdFx0cGF0aDogJy9yZXBvcy9vY3RvL3JlcG8vY29tbWl0cy9oZWFkLTEvY2hlY2stcnVucycsXG5cdFx0XHRcdFx0cXVlcnk6IHsgcGVyX3BhZ2U6IDEwMCB9LFxuXHRcdFx0XHRcdHJlc3BvbnNlOiBnaXRIdWJKc29uUmVzcG9uc2UoeyBjaGVja19ydW5zOiBbeyBpZDogMSwgbmFtZTogJ0NJJywgc3RhdHVzOiAnY29tcGxldGVkJywgY29uY2x1c2lvbjogJ3N1Y2Nlc3MnIH1dIH0pLFxuXHRcdFx0XHR9KSxcblx0XHRcdFx0Z2l0SHViUmVzdFN0ZXAoe1xuXHRcdFx0XHRcdG1ldGhvZDogJ0dFVCcsXG5cdFx0XHRcdFx0cGF0aDogJy9yZXBvcy9vY3RvL3JlcG8vY29tbWl0cy9oZWFkLTEvc3RhdHVzJyxcblx0XHRcdFx0XHRxdWVyeTogeyBwZXJfcGFnZTogMTAwIH0sXG5cdFx0XHRcdFx0cmVzcG9uc2U6IGdpdEh1Ykpzb25SZXNwb25zZSh7IHN0YXR1c2VzOiBbeyBpZDogMiwgY29udGV4dDogJ2xlZ2FjeScsIHN0YXRlOiAnc3VjY2VzcycgfV0gfSksXG5cdFx0XHRcdH0pLFxuXHRcdFx0KTtcblx0XHRcdGNvbnN0IGZhbGxiYWNrID0gc2V0dXAoc2VydmVyLCB1bmF2YWlsYWJsZSk7XG5cdFx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCBmYWxsYmFjay5xdWVyeS5mZXRjaChcblx0XHRcdFx0J2NoZWNrcycsXG5cdFx0XHRcdGZhbGxiYWNrLnJlZixcblx0XHRcdFx0Y29yZSgnaGVhZC0xJyksXG5cdFx0XHRcdHsgcHJpb3JpdHk6ICdiYWNrZ3JvdW5kJywgY2hlY2tzOiB7IHJlcXVpcmVkOiB0cnVlIH0gfSxcblx0XHRcdFx0ZmFsbGJhY2suY3JlZGVudGlhbCxcblx0XHRcdFx0bmV3IEFib3J0Q29udHJvbGxlcigpLnNpZ25hbCxcblx0XHRcdCk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdFx0Y29tcGxldGU6IHJlc3VsdC5jb21wbGV0ZSxcblx0XHRcdFx0dmFsdWU6IHJlc3VsdC5mcmFnbWVudCA9PT0gJ2NoZWNrcycgPyByZXN1bHQudmFsdWUgOiB1bmRlZmluZWQsXG5cdFx0XHR9LCB7XG5cdFx0XHRcdGNvbXBsZXRlOiBmYWxzZSxcblx0XHRcdFx0dmFsdWU6IHtcblx0XHRcdFx0XHRoZWFkU2hhOiAnaGVhZC0xJyxcblx0XHRcdFx0XHRyZXF1aXJlZG5lc3NDb21wbGV0ZTogZmFsc2UsXG5cdFx0XHRcdFx0ZXhwZWN0ZWRTdWl0ZXM6IFtdLFxuXHRcdFx0XHRcdGV4cGVjdGVkU3VpdGVzQ29tcGxldGU6IGZhbHNlLFxuXHRcdFx0XHRcdGNoZWNrczogW1xuXHRcdFx0XHRcdFx0eyBpZDogJzEnLCB0eXBlOiAnY2hlY2tSdW4nLCBuYW1lOiAnQ0knLCBzdGF0dXM6ICdDT01QTEVURUQnLCBjb25jbHVzaW9uOiAnU1VDQ0VTUycsIGRldGFpbHNVcmw6IHVuZGVmaW5lZCB9LFxuXHRcdFx0XHRcdFx0eyBpZDogJzInLCB0eXBlOiAnc3RhdHVzQ29udGV4dCcsIG5hbWU6ICdsZWdhY3knLCBzdGF0dXM6ICdTVUNDRVNTJywgZGV0YWlsc1VybDogdW5kZWZpbmVkIH0sXG5cdFx0XHRcdFx0XSxcblx0XHRcdFx0fSxcblx0XHRcdH0pO1xuXHRcdFx0c2VydmVyLmFzc2VydFNhdGlzZmllZCgpO1xuXHRcdH0pO1xuXG5cdFx0YXdhaXQgd2l0aFNlcnZlcihhc3luYyBzZXJ2ZXIgPT4ge1xuXHRcdFx0c2VydmVyLmVucXVldWUoZ2l0SHViR3JhcGhRTFN0ZXAoe1xuXHRcdFx0XHRyZXNwb25zZTogZ2l0SHViR3JhcGhRTFJlc3BvbnNlKGNoZWNrc1BhZ2UoJ2hlYWQtMicsIFtdLCBmYWxzZSkpLFxuXHRcdFx0fSkpO1xuXHRcdFx0Y29uc3QgeyBxdWVyeSwgcmVmLCBjcmVkZW50aWFsIH0gPSBzZXR1cChzZXJ2ZXIpO1xuXHRcdFx0YXdhaXQgYXNzZXJ0LnJlamVjdHMoXG5cdFx0XHRcdCgpID0+IHF1ZXJ5LmZldGNoKCdjaGVja3MnLCByZWYsIGNvcmUoJ2hlYWQtMScpLCB7IHByaW9yaXR5OiAnaW50ZXJhY3RpdmUnLCBjaGVja3M6IHsgcmVxdWlyZWQ6IHRydWUgfSB9LCBjcmVkZW50aWFsLCBuZXcgQWJvcnRDb250cm9sbGVyKCkuc2lnbmFsKSxcblx0XHRcdFx0ZXJyb3IgPT4gZXJyb3IgaW5zdGFuY2VvZiBHaXRIdWJSZXF1ZXN0RXJyb3IgJiYgZXJyb3IubWVzc2FnZS5pbmNsdWRlcygnb2xkIHB1bGwgcmVxdWVzdCBoZWFkJyksXG5cdFx0XHQpO1xuXHRcdFx0c2VydmVyLmFzc2VydFNhdGlzZmllZCgpO1xuXHRcdH0pO1xuXHR9KTtcbn0pO1xuXG5mdW5jdGlvbiByYXdDb3JlKGhlYWRTaGE6IHN0cmluZyk6IG9iamVjdCB7XG5cdHJldHVybiB7XG5cdFx0bm9kZV9pZDogJ1BSXzcnLFxuXHRcdG51bWJlcjogNyxcblx0XHR0aXRsZTogJ1BSIHRpdGxlJyxcblx0XHRib2R5OiAnUFIgYm9keScsXG5cdFx0aHRtbF91cmw6ICdodHRwczovL2dpdGh1Yi5leGFtcGxlLnRlc3QvbmV3LW93bmVyL25ldy1yZXBvL3B1bGwvNycsXG5cdFx0c3RhdGU6ICdvcGVuJyxcblx0XHRtZXJnZWQ6IGZhbHNlLFxuXHRcdGRyYWZ0OiBmYWxzZSxcblx0XHR1c2VyOiB7IGlkOiAxLCBsb2dpbjogJ2F1dGhvcicgfSxcblx0XHRoZWFkOiB7IHNoYTogaGVhZFNoYSwgcmVmOiAnZmVhdHVyZScgfSxcblx0XHRiYXNlOiB7XG5cdFx0XHRzaGE6ICdiYXNlJyxcblx0XHRcdHJlZjogJ21haW4nLFxuXHRcdFx0cmVwbzogeyBub2RlX2lkOiAnUl8xJywgZnVsbF9uYW1lOiAnbmV3LW93bmVyL25ldy1yZXBvJyB9LFxuXHRcdH0sXG5cdH07XG59XG5cbmZ1bmN0aW9uIGNvcmUoaGVhZFNoYTogc3RyaW5nKTogUHVsbFJlcXVlc3RDb3JlIHtcblx0cmV0dXJuIHtcblx0XHRpZDogJ1BSXzcnLFxuXHRcdHJlcG9zaXRvcnlJZDogJ1JfMScsXG5cdFx0cmVwb3NpdG9yeU5hbWVXaXRoT3duZXI6ICduZXctb3duZXIvbmV3LXJlcG8nLFxuXHRcdG51bWJlcjogNyxcblx0XHR0aXRsZTogJ1BSIHRpdGxlJyxcblx0XHRib2R5OiAnUFIgYm9keScsXG5cdFx0dXJsOiAnaHR0cHM6Ly9naXRodWIuZXhhbXBsZS50ZXN0L25ldy1vd25lci9uZXctcmVwby9wdWxsLzcnLFxuXHRcdHN0YXRlOiAnb3BlbicsXG5cdFx0ZHJhZnQ6IGZhbHNlLFxuXHRcdGhlYWRTaGEsXG5cdFx0aGVhZFJlZjogJ2ZlYXR1cmUnLFxuXHRcdGJhc2VTaGE6ICdiYXNlJyxcblx0XHRiYXNlUmVmOiAnbWFpbicsXG5cdFx0YXV0aG9yOiB7IGlkOiAnMScsIGxvZ2luOiAnYXV0aG9yJyB9LFxuXHRcdGNyZWF0ZWRBdDogdW5kZWZpbmVkLFxuXHRcdHVwZGF0ZWRBdDogdW5kZWZpbmVkLFxuXHRcdGNsb3NlZEF0OiB1bmRlZmluZWQsXG5cdFx0bWVyZ2VkQXQ6IHVuZGVmaW5lZCxcblx0fTtcbn1cblxuZnVuY3Rpb24gZ3JhcGhRTENvbW1lbnQoaWQ6IHN0cmluZywgbm9kZUlkOiBzdHJpbmcsIGxvZ2luOiBzdHJpbmcsIGJvZHk6IHN0cmluZywgc2lkZTogc3RyaW5nKTogb2JqZWN0IHtcblx0cmV0dXJuIHtcblx0XHRpZCxcblx0XHRub2RlSWQsXG5cdFx0YXV0aG9yOiB7IGxvZ2luIH0sXG5cdFx0Ym9keSxcblx0XHR1cmw6IHVuZGVmaW5lZCxcblx0XHRjcmVhdGVkQXQ6IHVuZGVmaW5lZCxcblx0XHR1cGRhdGVkQXQ6IHVuZGVmaW5lZCxcblx0XHRwYXRoOiB1bmRlZmluZWQsXG5cdFx0bGluZTogdW5kZWZpbmVkLFxuXHRcdG9yaWdpbmFsTGluZTogdW5kZWZpbmVkLFxuXHRcdHNpZGUsXG5cdFx0Y29tbWl0SWQ6IHVuZGVmaW5lZCxcblx0XHRvcmlnaW5hbENvbW1pdElkOiB1bmRlZmluZWQsXG5cdH07XG59XG5cbmZ1bmN0aW9uIGNoZWNrc1BhZ2UoaGVhZFNoYTogc3RyaW5nLCBub2RlczogcmVhZG9ubHkgb2JqZWN0W10sIGhhc05leHRQYWdlOiBib29sZWFuLCBlbmRDdXJzb3I6IHN0cmluZyB8IG51bGwgPSBudWxsKTogb2JqZWN0IHtcblx0cmV0dXJuIHtcblx0XHRyZXBvc2l0b3J5OiB7XG5cdFx0XHRwdWxsUmVxdWVzdDoge1xuXHRcdFx0XHRoZWFkUmVmT2lkOiBoZWFkU2hhLFxuXHRcdFx0XHRjb21taXRzOiB7XG5cdFx0XHRcdFx0bm9kZXM6IFt7XG5cdFx0XHRcdFx0XHRjb21taXQ6IHtcblx0XHRcdFx0XHRcdFx0c3RhdHVzQ2hlY2tSb2xsdXA6IHtcblx0XHRcdFx0XHRcdFx0XHRjb250ZXh0czoge1xuXHRcdFx0XHRcdFx0XHRcdFx0bm9kZXMsXG5cdFx0XHRcdFx0XHRcdFx0XHRwYWdlSW5mbzogeyBoYXNOZXh0UGFnZSwgZW5kQ3Vyc29yIH0sXG5cdFx0XHRcdFx0XHRcdFx0fSxcblx0XHRcdFx0XHRcdFx0fSxcblx0XHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0fV0sXG5cdFx0XHRcdH0sXG5cdFx0XHR9LFxuXHRcdH0sXG5cdH07XG59XG4iXSwKICAibWFwcGluZ3MiOiAiQUFLQSxPQUFPLFlBQVk7QUFDbkIsU0FBUywrQ0FBK0M7QUFLeEQsU0FBUyxvQkFBb0IsdUJBQXVCO0FBQ3BELFNBQVMsK0JBQStCO0FBQ3hDLFNBQVMsaUJBQWlCO0FBQzFCLFNBQVMsdUJBQXVCLG1CQUFtQixvQkFBb0IsZ0JBQWdCLGdDQUFnQztBQUV2SCxNQUFNLHdCQUFnRDtBQUFBLEVBQ3JELFNBQVM7QUFBQSxFQUNULFlBQVk7QUFBQSxFQUNaLHFCQUFxQjtBQUFBLEVBQ3JCLGVBQWU7QUFBQSxFQUNmLDBCQUEwQjtBQUMzQjtBQUVBLE1BQU0sd0JBQXVEO0FBQUEsRUFFNUQsWUFBcUIsT0FBK0I7QUFBL0I7QUFBQSxFQUFpQztBQUFBLEVBRXRELGtCQUFtRDtBQUNsRCxXQUFPLFFBQVEsUUFBUSxLQUFLLEtBQUs7QUFBQSxFQUNs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
