import assert from "assert";
import { DeferredPromise } from "../../../../base/common/async.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../base/test/common/utils.js";
import { GitHubRequestQueue } from "../../common/githubRequestQueue.js";
import { GitHubRequestError, GitHubTransport } from "../../common/githubTransport.js";
import { FakeGitHubScheduler } from "./fakeGitHubScheduler.js";
import { nodeFetch } from "./nodeFetch.js";
import { gitHubGraphQLResponse, gitHubGraphQLStep, gitHubJsonResponse, gitHubNotModifiedResponse, gitHubRateLimitResponse, gitHubRawResponse, gitHubRedirectResponse, gitHubRestStep, ProgrammableGitHubServer } from "./programmableGitHubServer.js";
const accountA = { host: "github.example.test", accountId: "1" };
const accountB = { host: "github.example.test", accountId: "2" };
const accountOnOtherHost = { host: "other.example.test", accountId: "1" };
function signal() {
  return new AbortController().signal;
}
suite("GitHubTransport", () => {
  const disposables = ensureNoDisposablesAreLeakedInTestSuite();
  async function withServer(fn) {
    const server = await ProgrammableGitHubServer.start();
    try {
      await fn(server);
    } finally {
      await server.disposeAsync();
    }
  }
  test("always reaches the injected fetch with explicit no-store behavior", async () => {
    await withServer(async (server) => {
      server.enqueue(
        gitHubRestStep({ method: "GET", path: "/repos/o/r/issues/1", response: gitHubJsonResponse({ value: 1 }) }),
        gitHubRestStep({ method: "GET", path: "/repos/o/r/issues/1", response: gitHubJsonResponse({ value: 2 }) })
      );
      const fetchOptions = [];
      const transport = disposables.add(new GitHubTransport(async (input, init) => {
        fetchOptions.push(init ?? {});
        return nodeFetch(input, init);
      }));
      const request = { method: "GET", url: `${server.apiBaseUrl}/repos/o/r/issues/1`, etag: false };
      const first = await transport.rest(accountA, "token-a", request, signal());
      const second = await transport.rest(accountA, "token-a", request, signal());
      assert.deepStrictEqual({
        values: [first.data?.value, second.data?.value],
        serverRequests: server.requests.length,
        fetchOptions: fetchOptions.map((options) => ({
          cache: options.cache,
          cacheControl: options.headers["Cache-Control"]
        }))
      }, {
        values: [1, 2],
        serverRequests: 2,
        fetchOptions: [
          { cache: "no-store", cacheControl: "no-store" },
          { cache: "no-store", cacheControl: "no-store" }
        ]
      });
      server.assertSatisfied();
    });
  });
  test("reuses only the exact account-scoped body after authoritative 304", async () => {
    await withServer(async (server) => {
      server.enqueue(
        gitHubRestStep({ method: "GET", path: "/repos/o/r/pulls", query: { page: 1 }, response: gitHubJsonResponse([{ number: 1 }], { etag: '"a"' }) }),
        gitHubRestStep({
          method: "GET",
          path: "/repos/o/r/pulls",
          query: { page: 1 },
          assert: (request) => assert.strictEqual(request.headers["if-none-match"], void 0),
          response: gitHubJsonResponse([{ number: 2 }], { etag: '"b"' })
        }),
        gitHubRestStep({
          method: "GET",
          path: "/repos/o/r/pulls",
          query: { page: 1 },
          assert: (request) => assert.strictEqual(request.headers["if-none-match"], void 0),
          response: gitHubJsonResponse([{ number: 30 }], { etag: '"other-host"' })
        }),
        gitHubRestStep({
          method: "GET",
          path: "/repos/o/r/pulls",
          query: { page: 1 },
          assert: (request) => assert.strictEqual(request.headers["if-none-match"], '"a"'),
          response: gitHubNotModifiedResponse()
        }),
        gitHubRestStep({
          method: "GET",
          path: "/repos/o/r/pulls",
          query: { page: 2 },
          assert: (request) => assert.strictEqual(request.headers["if-none-match"], void 0),
          response: gitHubJsonResponse([{ number: 3 }], { etag: '"page-2"' })
        }),
        gitHubRestStep({
          method: "GET",
          path: "/repos/o/r/pulls",
          query: { page: 1 },
          assert: (request) => assert.strictEqual(request.headers["if-none-match"], void 0),
          response: gitHubJsonResponse([{ number: 4 }], { etag: '"media"' })
        })
      );
      const transport = disposables.add(new GitHubTransport(nodeFetch, new FakeGitHubScheduler({ now: 123 })));
      const pageOne = `${server.apiBaseUrl}/repos/o/r/pulls?page=1`;
      await transport.rest(accountA, "token-a", { method: "GET", url: pageOne }, signal());
      await transport.rest(accountB, "token-b", { method: "GET", url: pageOne }, signal());
      await transport.rest(accountOnOtherHost, "token-c", { method: "GET", url: pageOne }, signal());
      const revalidated = await transport.rest(accountA, "token-a", { method: "GET", url: pageOne }, signal());
      await transport.rest(accountA, "token-a", { method: "GET", url: `${server.apiBaseUrl}/repos/o/r/pulls?page=2` }, signal());
      await transport.rest(accountA, "token-a", { method: "GET", url: pageOne, accept: "application/vnd.github.raw+json" }, signal());
      assert.deepStrictEqual(revalidated.data, [{ number: 1 }]);
      server.assertSatisfied();
    });
  });
  test("removes an old validator when a 200 response has no ETag", async () => {
    await withServer(async (server) => {
      server.enqueue(
        gitHubRestStep({ method: "GET", path: "/repos/o/r/pulls", response: gitHubJsonResponse([{ number: 1 }], { etag: '"old"' }) }),
        gitHubRestStep({
          method: "GET",
          path: "/repos/o/r/pulls",
          assert: (request2) => assert.strictEqual(request2.headers["if-none-match"], '"old"'),
          response: gitHubJsonResponse([{ number: 2 }])
        }),
        gitHubRestStep({
          method: "GET",
          path: "/repos/o/r/pulls",
          assert: (request2) => assert.strictEqual(request2.headers["if-none-match"], void 0),
          response: gitHubJsonResponse([{ number: 3 }])
        })
      );
      const transport = disposables.add(new GitHubTransport(nodeFetch));
      const request = { method: "GET", url: `${server.apiBaseUrl}/repos/o/r/pulls` };
      await transport.rest(accountA, "token-a", request, signal());
      await transport.rest(accountA, "token-a", request, signal());
      await transport.rest(accountA, "token-a", request, signal());
      server.assertSatisfied();
    });
  });
  test("preserves GraphQL partial data and typed errors", async () => {
    await withServer(async (server) => {
      server.enqueue(gitHubGraphQLStep({
        queryIncludes: "repository",
        response: gitHubGraphQLResponse(
          { repository: { id: "R1" }, rateLimit: { limit: 5e3, remaining: 7, used: 3, resetAt: "2030-01-01T00:00:00.000Z" } },
          [{ message: "field denied", type: "FORBIDDEN", path: ["repository", "viewerPermission"] }]
        )
      }));
      const transport = disposables.add(new GitHubTransport(nodeFetch));
      const response = await transport.graphql(
        accountA,
        "token-a",
        server.graphQlUrl,
        'query { repository(owner: "o", name: "r") { id } }',
        {},
        signal()
      );
      assert.deepStrictEqual({
        data: response.data,
        errors: response.errors,
        rateLimit: transport.rateLimits.getState(accountA, "graphql"),
        authorizationIsExpected: server.requests[0].headers.authorization === ["Bearer", "token-a"].join(" "),
        requestHeaders: {
          cacheControl: server.requests[0].headers["cache-control"],
          authorization: server.requests[0].headers.authorization === void 0 ? void 0 : "*".repeat(6)
        }
      }, {
        data: { repository: { id: "R1" }, rateLimit: { limit: 5e3, remaining: 7, used: 3, resetAt: "2030-01-01T00:00:00.000Z" } },
        errors: [{ message: "field denied", type: "FORBIDDEN", path: ["repository", "viewerPermission"] }],
        rateLimit: { limit: 5e3, remaining: 7, used: 3, resetAt: Date.parse("2030-01-01T00:00:00.000Z") },
        authorizationIsExpected: true,
        requestHeaders: { cacheControl: "no-store", authorization: "******" }
      });
      server.assertSatisfied();
    });
  });
  test("coalesces identical GraphQL reads while cancellation detaches one waiter", async () => {
    await withServer(async (server) => {
      const requestSeen = new DeferredPromise();
      const release = new DeferredPromise();
      server.enqueue(gitHubGraphQLStep({
        queryIncludes: "repository",
        assert: async () => requestSeen.complete(),
        waitFor: release.p,
        response: gitHubGraphQLResponse({ repository: { id: "R1" } })
      }));
      const transport = disposables.add(new GitHubTransport(nodeFetch, new FakeGitHubScheduler({ now: 123 })));
      const cancelled = new AbortController();
      const query = "query Repo($owner: String!, $name: String!) { repository(owner: $owner, name: $name) { id } }";
      const first = transport.graphql(accountA, "token-a", server.graphQlUrl, query, { owner: "o", name: "r" }, cancelled.signal);
      const second = transport.graphql(accountA, "token-a", server.graphQlUrl, query, { name: "r", owner: "o" }, signal());
      await requestSeen.p;
      cancelled.abort(new Error("cancel first"));
      await assert.rejects(() => first, /cancel first/);
      await release.complete();
      assert.deepStrictEqual({
        second: await second,
        requestCount: server.requests.length
      }, {
        second: { data: { repository: { id: "R1" } }, errors: [], observedAt: 123 },
        requestCount: 1
      });
      server.assertSatisfied();
    });
  });
  test("purges every account cache entry and aborts in-flight work on invalidation", async () => {
    await withServer(async (server) => {
      const requestSeen = new DeferredPromise();
      const release = new DeferredPromise();
      server.enqueue(
        gitHubRestStep({ method: "GET", path: "/repos/o/r/one", response: gitHubJsonResponse({ value: 1 }, { etag: '"one"' }) }),
        gitHubRestStep({ method: "GET", path: "/repos/o/r/two", response: gitHubJsonResponse({ value: 2 }, { etag: '"two"' }) }),
        gitHubRestStep({
          method: "GET",
          path: "/repos/o/r/pending",
          assert: async () => requestSeen.complete(),
          waitFor: release.p,
          response: gitHubJsonResponse({ value: 3 })
        }),
        gitHubRestStep({
          method: "GET",
          path: "/repos/o/r/one",
          assert: (request) => assert.strictEqual(request.headers["if-none-match"], void 0),
          response: gitHubJsonResponse({ value: 10 }, { etag: '"ten"' })
        }),
        gitHubRestStep({
          method: "GET",
          path: "/repos/o/r/two",
          assert: (request) => assert.strictEqual(request.headers["if-none-match"], void 0),
          response: gitHubJsonResponse({ value: 20 }, { etag: '"twenty"' })
        })
      );
      const transport = disposables.add(new GitHubTransport(nodeFetch));
      const one = { method: "GET", url: `${server.apiBaseUrl}/repos/o/r/one` };
      const two = { method: "GET", url: `${server.apiBaseUrl}/repos/o/r/two` };
      await transport.rest(accountA, "token-a", one, signal());
      await transport.rest(accountA, "token-a", two, signal());
      const pending = transport.rest(accountA, "token-a", { method: "GET", url: `${server.apiBaseUrl}/repos/o/r/pending` }, signal());
      await requestSeen.p;
      transport.invalidateAccount(accountA, new Error("credential invalidated"));
      await assert.rejects(() => pending, /credential invalidated/);
      await release.complete();
      const refreshedOne = await transport.rest(accountA, "token-a", one, signal());
      const refreshedTwo = await transport.rest(accountA, "token-a", two, signal());
      assert.deepStrictEqual({
        one: refreshedOne.data,
        two: refreshedTwo.data,
        requestCount: server.requests.length
      }, {
        one: { value: 10 },
        two: { value: 20 },
        requestCount: 5
      });
      server.assertSatisfied();
    });
  });
  test("starts fresh REST and GraphQL requests after every coalesced waiter cancels", async () => {
    await withServer(async (server) => {
      const restSeen = new DeferredPromise();
      const releaseRest = new DeferredPromise();
      const graphQLSeen = new DeferredPromise();
      const releaseGraphQL = new DeferredPromise();
      server.enqueue(
        gitHubRestStep({
          method: "GET",
          path: "/repos/o/r/shared",
          assert: async () => restSeen.complete(),
          waitFor: releaseRest.p,
          response: gitHubJsonResponse({ value: 1 })
        }),
        gitHubRestStep({ method: "GET", path: "/repos/o/r/shared", response: gitHubJsonResponse({ value: 2 }) }),
        gitHubGraphQLStep({
          queryIncludes: "repository",
          assert: async () => graphQLSeen.complete(),
          waitFor: releaseGraphQL.p,
          response: gitHubGraphQLResponse({ repository: { id: "old" } })
        }),
        gitHubGraphQLStep({
          queryIncludes: "repository",
          response: gitHubGraphQLResponse({ repository: { id: "new" } })
        })
      );
      const transport = disposables.add(new GitHubTransport(nodeFetch));
      const restController = new AbortController();
      const restRequest = { method: "GET", url: `${server.apiBaseUrl}/repos/o/r/shared`, etag: false };
      const firstRest = transport.rest(accountA, "token-a", restRequest, restController.signal);
      await restSeen.p;
      restController.abort(new Error("cancel REST waiter"));
      await assert.rejects(() => firstRest, /cancel REST waiter/);
      const secondRestPromise = transport.rest(accountA, "token-a", restRequest, signal());
      await releaseRest.complete();
      const secondRest = await secondRestPromise;
      const graphQLController = new AbortController();
      const query = 'query { repository(owner: "o", name: "r") { id } }';
      const firstGraphQL = transport.graphql(accountA, "token-a", server.graphQlUrl, query, {}, graphQLController.signal);
      await graphQLSeen.p;
      graphQLController.abort(new Error("cancel GraphQL waiter"));
      await assert.rejects(() => firstGraphQL, /cancel GraphQL waiter/);
      const secondGraphQLPromise = transport.graphql(accountA, "token-a", server.graphQlUrl, query, {}, signal());
      await releaseGraphQL.complete();
      const secondGraphQL = await secondGraphQLPromise;
      assert.deepStrictEqual({
        rest: secondRest.data,
        graphQL: secondGraphQL.data,
        requestCount: server.requests.length
      }, {
        rest: { value: 2 },
        graphQL: { repository: { id: "new" } },
        requestCount: 4
      });
      server.assertSatisfied();
    });
  });
  test("does not coalesce an unconditional GET with a conditional revalidation", async () => {
    await withServer(async (server) => {
      const conditionalSeen = new DeferredPromise();
      const releaseConditional = new DeferredPromise();
      server.enqueue(
        gitHubRestStep({ method: "GET", path: "/repos/o/r/state", response: gitHubJsonResponse({ value: 1 }, { etag: '"old"' }) }),
        gitHubRestStep({
          method: "GET",
          path: "/repos/o/r/state",
          assert: async (request2) => {
            assert.strictEqual(request2.headers["if-none-match"], '"old"');
            await conditionalSeen.complete();
          },
          waitFor: releaseConditional.p,
          response: gitHubNotModifiedResponse()
        }),
        gitHubRestStep({
          method: "GET",
          path: "/repos/o/r/state",
          assert: (request2) => assert.strictEqual(request2.headers["if-none-match"], void 0),
          response: gitHubJsonResponse({ value: 2 }, { etag: '"new"' })
        })
      );
      const transport = disposables.add(new GitHubTransport(nodeFetch));
      const request = { method: "GET", url: `${server.apiBaseUrl}/repos/o/r/state` };
      await transport.rest(accountA, "token-a", request, signal());
      const conditional = transport.rest(accountA, "token-a", request, signal());
      await conditionalSeen.p;
      const unconditional = transport.rest(accountA, "token-a", { ...request, unconditional: true }, signal());
      await releaseConditional.complete();
      assert.deepStrictEqual({
        conditional: (await conditional).data,
        unconditional: (await unconditional).data,
        requestCount: server.requests.length
      }, {
        conditional: { value: 1 },
        unconditional: { value: 2 },
        requestCount: 3
      });
      server.assertSatisfied();
    });
  });
  test("shares rate-limit backoff across requests for an account", async () => {
    await withServer(async (server) => {
      const scheduler = new FakeGitHubScheduler({ now: 1e3 });
      const transport = disposables.add(new GitHubTransport(nodeFetch, scheduler));
      server.enqueue(
        gitHubRestStep({
          method: "GET",
          path: "/repos/o/r/limited",
          response: gitHubRateLimitResponse({ status: 429, resource: "core", retryAfterSeconds: 5 })
        }),
        gitHubRestStep({ method: "GET", path: "/repos/o/r/after", response: gitHubJsonResponse({ ok: true }) })
      );
      await assert.rejects(
        () => transport.rest(accountA, "token-a", { method: "GET", url: `${server.apiBaseUrl}/repos/o/r/limited` }, signal()),
        (error) => error instanceof GitHubRequestError && error.kind === "rateLimit"
      );
      let settled = false;
      const after = transport.rest(accountA, "token-a", { method: "GET", url: `${server.apiBaseUrl}/repos/o/r/after` }, signal()).then(() => settled = true);
      await Promise.resolve();
      scheduler.advanceBy(4999);
      await Promise.resolve();
      assert.strictEqual(settled, false);
      scheduler.advanceBy(1);
      await after;
      assert.strictEqual(server.requests.length, 2);
      server.assertSatisfied();
    });
  });
  test("GraphQL RATE_LIMITED errors establish shared account backoff", async () => {
    await withServer(async (server) => {
      const scheduler = new FakeGitHubScheduler({ now: 1e3 });
      const transport = disposables.add(new GitHubTransport(nodeFetch, scheduler));
      server.enqueue(
        gitHubGraphQLStep({
          queryIncludes: "repository",
          response: gitHubGraphQLResponse(void 0, [{ message: "rate limited", type: "RATE_LIMITED" }])
        }),
        gitHubGraphQLStep({
          queryIncludes: "viewer",
          response: gitHubGraphQLResponse({ viewer: { id: "U1" } })
        })
      );
      const limited = await transport.graphql(accountA, "token-a", server.graphQlUrl, 'query { repository(owner: "o", name: "r") { id } }', {}, signal());
      let settled = false;
      const after = transport.graphql(accountA, "token-a", server.graphQlUrl, "query { viewer { id } }", {}, signal()).then(() => settled = true);
      await Promise.resolve();
      scheduler.advanceBy(59999);
      await Promise.resolve();
      assert.strictEqual(settled, false);
      scheduler.advanceBy(1);
      await after;
      assert.deepStrictEqual({
        errors: limited.errors,
        requestCount: server.requests.length
      }, {
        errors: [{ message: "rate limited", type: "RATE_LIMITED" }],
        requestCount: 2
      });
      server.assertSatisfied();
    });
  });
  test("does not apply GraphQL primary-rate-limit state to the REST core bucket", async () => {
    await withServer(async (server) => {
      const scheduler = new FakeGitHubScheduler({ now: 1e3 });
      const transport = disposables.add(new GitHubTransport(nodeFetch, scheduler));
      transport.rateLimits.updateFromGraphQL(accountA, {
        remaining: 0,
        resetAt: (/* @__PURE__ */ new Date(61e3)).toISOString()
      });
      const graphQLController = new AbortController();
      const blockedGraphQL = transport.graphql(
        accountA,
        "token-a",
        server.graphQlUrl,
        "query { viewer { id } }",
        {},
        graphQLController.signal
      );
      await Promise.resolve();
      server.enqueue(gitHubRestStep({
        method: "GET",
        path: "/repos/o/r/core",
        response: gitHubJsonResponse({ ok: true })
      }));
      const response = await transport.rest(
        accountA,
        "token-a",
        { method: "GET", url: `${server.apiBaseUrl}/repos/o/r/core` },
        signal()
      );
      graphQLController.abort(new Error("stop blocked GraphQL request"));
      await assert.rejects(() => blockedGraphQL, /stop blocked GraphQL request/);
      assert.deepStrictEqual({
        data: response.data,
        pendingDelays: scheduler.pendingCount
      }, {
        data: { ok: true },
        pendingDelays: 0
      });
      server.assertSatisfied();
    });
  });
  test("bounds downloads and rejects unsafe redirect targets", async () => {
    await withServer(async (server) => {
      server.enqueue(
        gitHubRestStep({
          method: "GET",
          path: "/repos/o/r/log",
          response: gitHubRawResponse("abcdef")
        }),
        gitHubRestStep({
          method: "GET",
          path: "/repos/o/r/unsafe",
          response: gitHubRedirectResponse("http://example.invalid/signed-log")
        })
      );
      const transport = disposables.add(new GitHubTransport(nodeFetch));
      const bounded = await transport.download(accountA, "token-a", {
        url: `${server.apiBaseUrl}/repos/o/r/log`,
        maximumBytes: 3,
        timeout: 1e3
      }, signal());
      await assert.rejects(
        () => transport.download(accountA, "token-a", {
          url: `${server.apiBaseUrl}/repos/o/r/unsafe`,
          maximumBytes: 100,
          timeout: 1e3
        }, signal()),
        (error) => error instanceof GitHubRequestError && error.kind === "authorization"
      );
      assert.deepStrictEqual(bounded, {
        text: "abc",
        truncated: true,
        sourceUrl: `${server.apiBaseUrl}/repos/o/r/log`,
        contentType: "application/octet-stream"
      });
      server.assertSatisfied();
    });
  });
  test("runs higher-priority queued work before older background work", async () => {
    const queue = disposables.add(new GitHubRequestQueue());
    const firstRelease = new DeferredPromise();
    const order = [];
    const first = queue.enqueue(accountA, "background", signal(), async () => {
      order.push("first");
      await firstRelease.p;
    });
    const background = queue.enqueue(accountA, "background", signal(), async () => {
      order.push("background");
    });
    const interactive = queue.enqueue(accountA, "interactive", signal(), async () => {
      order.push("interactive");
    });
    await firstRelease.complete();
    await Promise.all([first, background, interactive]);
    assert.deepStrictEqual(order, ["first", "interactive", "background"]);
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxwbGF0Zm9ybVxcZ2l0aHViXFx0ZXN0XFxub2RlXFxnaXRodWJUcmFuc3BvcnQudGVzdC50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCBhc3NlcnQgZnJvbSAnYXNzZXJ0JztcbmltcG9ydCB7IERlZmVycmVkUHJvbWlzZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2FzeW5jLmpzJztcbmltcG9ydCB7IGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvdGVzdC9jb21tb24vdXRpbHMuanMnO1xuaW1wb3J0IHsgR2l0SHViQWNjb3VudEhhbmRsZSB9IGZyb20gJy4uLy4uL2NvbW1vbi9naXRodWJUeXBlcy5qcyc7XG5pbXBvcnQgeyBHaXRIdWJSZXF1ZXN0UXVldWUgfSBmcm9tICcuLi8uLi9jb21tb24vZ2l0aHViUmVxdWVzdFF1ZXVlLmpzJztcbmltcG9ydCB7IEdpdEh1YlJlcXVlc3RFcnJvciwgR2l0SHViVHJhbnNwb3J0IH0gZnJvbSAnLi4vLi4vY29tbW9uL2dpdGh1YlRyYW5zcG9ydC5qcyc7XG5pbXBvcnQgeyBGYWtlR2l0SHViU2NoZWR1bGVyIH0gZnJvbSAnLi9mYWtlR2l0SHViU2NoZWR1bGVyLmpzJztcbmltcG9ydCB7IG5vZGVGZXRjaCB9IGZyb20gJy4vbm9kZUZldGNoLmpzJztcbmltcG9ydCB7IGdpdEh1YkdyYXBoUUxSZXNwb25zZSwgZ2l0SHViR3JhcGhRTFN0ZXAsIGdpdEh1Ykpzb25SZXNwb25zZSwgZ2l0SHViTm90TW9kaWZpZWRSZXNwb25zZSwgZ2l0SHViUmF0ZUxpbWl0UmVzcG9uc2UsIGdpdEh1YlJhd1Jlc3BvbnNlLCBnaXRIdWJSZWRpcmVjdFJlc3BvbnNlLCBnaXRIdWJSZXN0U3RlcCwgUHJvZ3JhbW1hYmxlR2l0SHViU2VydmVyIH0gZnJvbSAnLi9wcm9ncmFtbWFibGVHaXRIdWJTZXJ2ZXIuanMnO1xuXG5jb25zdCBhY2NvdW50QTogR2l0SHViQWNjb3VudEhhbmRsZSA9IHsgaG9zdDogJ2dpdGh1Yi5leGFtcGxlLnRlc3QnLCBhY2NvdW50SWQ6ICcxJyB9O1xuY29uc3QgYWNjb3VudEI6IEdpdEh1YkFjY291bnRIYW5kbGUgPSB7IGhvc3Q6ICdnaXRodWIuZXhhbXBsZS50ZXN0JywgYWNjb3VudElkOiAnMicgfTtcbmNvbnN0IGFjY291bnRPbk90aGVySG9zdDogR2l0SHViQWNjb3VudEhhbmRsZSA9IHsgaG9zdDogJ290aGVyLmV4YW1wbGUudGVzdCcsIGFjY291bnRJZDogJzEnIH07XG5cbmZ1bmN0aW9uIHNpZ25hbCgpOiBBYm9ydFNpZ25hbCB7XG5cdHJldHVybiBuZXcgQWJvcnRDb250cm9sbGVyKCkuc2lnbmFsO1xufVxuXG5zdWl0ZSgnR2l0SHViVHJhbnNwb3J0JywgKCkgPT4ge1xuXHRjb25zdCBkaXNwb3NhYmxlcyA9IGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSgpO1xuXG5cdGFzeW5jIGZ1bmN0aW9uIHdpdGhTZXJ2ZXIoZm46IChzZXJ2ZXI6IFByb2dyYW1tYWJsZUdpdEh1YlNlcnZlcikgPT4gUHJvbWlzZTx2b2lkPik6IFByb21pc2U8dm9pZD4ge1xuXHRcdGNvbnN0IHNlcnZlciA9IGF3YWl0IFByb2dyYW1tYWJsZUdpdEh1YlNlcnZlci5zdGFydCgpO1xuXHRcdHRyeSB7XG5cdFx0XHRhd2FpdCBmbihzZXJ2ZXIpO1xuXHRcdH0gZmluYWxseSB7XG5cdFx0XHRhd2FpdCBzZXJ2ZXIuZGlzcG9zZUFzeW5jKCk7XG5cdFx0fVxuXHR9XG5cblx0dGVzdCgnYWx3YXlzIHJlYWNoZXMgdGhlIGluamVjdGVkIGZldGNoIHdpdGggZXhwbGljaXQgbm8tc3RvcmUgYmVoYXZpb3InLCBhc3luYyAoKSA9PiB7XG5cdFx0YXdhaXQgd2l0aFNlcnZlcihhc3luYyBzZXJ2ZXIgPT4ge1xuXHRcdFx0c2VydmVyLmVucXVldWUoXG5cdFx0XHRcdGdpdEh1YlJlc3RTdGVwKHsgbWV0aG9kOiAnR0VUJywgcGF0aDogJy9yZXBvcy9vL3IvaXNzdWVzLzEnLCByZXNwb25zZTogZ2l0SHViSnNvblJlc3BvbnNlKHsgdmFsdWU6IDEgfSkgfSksXG5cdFx0XHRcdGdpdEh1YlJlc3RTdGVwKHsgbWV0aG9kOiAnR0VUJywgcGF0aDogJy9yZXBvcy9vL3IvaXNzdWVzLzEnLCByZXNwb25zZTogZ2l0SHViSnNvblJlc3BvbnNlKHsgdmFsdWU6IDIgfSkgfSksXG5cdFx0XHQpO1xuXHRcdFx0Y29uc3QgZmV0Y2hPcHRpb25zOiBSZXF1ZXN0SW5pdFtdID0gW107XG5cdFx0XHRjb25zdCB0cmFuc3BvcnQgPSBkaXNwb3NhYmxlcy5hZGQobmV3IEdpdEh1YlRyYW5zcG9ydChhc3luYyAoaW5wdXQsIGluaXQpID0+IHtcblx0XHRcdFx0ZmV0Y2hPcHRpb25zLnB1c2goaW5pdCA/PyB7fSk7XG5cdFx0XHRcdHJldHVybiBub2RlRmV0Y2goaW5wdXQsIGluaXQpO1xuXHRcdFx0fSkpO1xuXHRcdFx0Y29uc3QgcmVxdWVzdCA9IHsgbWV0aG9kOiAnR0VUJyBhcyBjb25zdCwgdXJsOiBgJHtzZXJ2ZXIuYXBpQmFzZVVybH0vcmVwb3Mvby9yL2lzc3Vlcy8xYCwgZXRhZzogZmFsc2UgfTtcblxuXHRcdFx0Y29uc3QgZmlyc3QgPSBhd2FpdCB0cmFuc3BvcnQucmVzdDx7IHZhbHVlOiBudW1iZXIgfT4oYWNjb3VudEEsICd0b2tlbi1hJywgcmVxdWVzdCwgc2lnbmFsKCkpO1xuXHRcdFx0Y29uc3Qgc2Vjb25kID0gYXdhaXQgdHJhbnNwb3J0LnJlc3Q8eyB2YWx1ZTogbnVtYmVyIH0+KGFjY291bnRBLCAndG9rZW4tYScsIHJlcXVlc3QsIHNpZ25hbCgpKTtcblxuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRcdHZhbHVlczogW2ZpcnN0LmRhdGE/LnZhbHVlLCBzZWNvbmQuZGF0YT8udmFsdWVdLFxuXHRcdFx0XHRzZXJ2ZXJSZXF1ZXN0czogc2VydmVyLnJlcXVlc3RzLmxlbmd0aCxcblx0XHRcdFx0ZmV0Y2hPcHRpb25zOiBmZXRjaE9wdGlvbnMubWFwKG9wdGlvbnMgPT4gKHtcblx0XHRcdFx0XHRjYWNoZTogb3B0aW9ucy5jYWNoZSxcblx0XHRcdFx0XHRjYWNoZUNvbnRyb2w6IChvcHRpb25zLmhlYWRlcnMgYXMgUmVjb3JkPHN0cmluZywgc3RyaW5nPilbJ0NhY2hlLUNvbnRyb2wnXSxcblx0XHRcdFx0fSkpLFxuXHRcdFx0fSwge1xuXHRcdFx0XHR2YWx1ZXM6IFsxLCAyXSxcblx0XHRcdFx0c2VydmVyUmVxdWVzdHM6IDIsXG5cdFx0XHRcdGZldGNoT3B0aW9uczogW1xuXHRcdFx0XHRcdHsgY2FjaGU6ICduby1zdG9yZScsIGNhY2hlQ29udHJvbDogJ25vLXN0b3JlJyB9LFxuXHRcdFx0XHRcdHsgY2FjaGU6ICduby1zdG9yZScsIGNhY2hlQ29udHJvbDogJ25vLXN0b3JlJyB9LFxuXHRcdFx0XHRdLFxuXHRcdFx0fSk7XG5cdFx0XHRzZXJ2ZXIuYXNzZXJ0U2F0aXNmaWVkKCk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3JldXNlcyBvbmx5IHRoZSBleGFjdCBhY2NvdW50LXNjb3BlZCBib2R5IGFmdGVyIGF1dGhvcml0YXRpdmUgMzA0JywgYXN5bmMgKCkgPT4ge1xuXHRcdGF3YWl0IHdpdGhTZXJ2ZXIoYXN5bmMgc2VydmVyID0+IHtcblx0XHRcdHNlcnZlci5lbnF1ZXVlKFxuXHRcdFx0XHRnaXRIdWJSZXN0U3RlcCh7IG1ldGhvZDogJ0dFVCcsIHBhdGg6ICcvcmVwb3Mvby9yL3B1bGxzJywgcXVlcnk6IHsgcGFnZTogMSB9LCByZXNwb25zZTogZ2l0SHViSnNvblJlc3BvbnNlKFt7IG51bWJlcjogMSB9XSwgeyBldGFnOiAnXCJhXCInIH0pIH0pLFxuXHRcdFx0XHRnaXRIdWJSZXN0U3RlcCh7XG5cdFx0XHRcdFx0bWV0aG9kOiAnR0VUJyxcblx0XHRcdFx0XHRwYXRoOiAnL3JlcG9zL28vci9wdWxscycsXG5cdFx0XHRcdFx0cXVlcnk6IHsgcGFnZTogMSB9LFxuXHRcdFx0XHRcdGFzc2VydDogcmVxdWVzdCA9PiBhc3NlcnQuc3RyaWN0RXF1YWwocmVxdWVzdC5oZWFkZXJzWydpZi1ub25lLW1hdGNoJ10sIHVuZGVmaW5lZCksXG5cdFx0XHRcdFx0cmVzcG9uc2U6IGdpdEh1Ykpzb25SZXNwb25zZShbeyBudW1iZXI6IDIgfV0sIHsgZXRhZzogJ1wiYlwiJyB9KSxcblx0XHRcdFx0fSksXG5cdFx0XHRcdGdpdEh1YlJlc3RTdGVwKHtcblx0XHRcdFx0XHRtZXRob2Q6ICdHRVQnLFxuXHRcdFx0XHRcdHBhdGg6ICcvcmVwb3Mvby9yL3B1bGxzJyxcblx0XHRcdFx0XHRxdWVyeTogeyBwYWdlOiAxIH0sXG5cdFx0XHRcdFx0YXNzZXJ0OiByZXF1ZXN0ID0+IGFzc2VydC5zdHJpY3RFcXVhbChyZXF1ZXN0LmhlYWRlcnNbJ2lmLW5vbmUtbWF0Y2gnXSwgdW5kZWZpbmVkKSxcblx0XHRcdFx0XHRyZXNwb25zZTogZ2l0SHViSnNvblJlc3BvbnNlKFt7IG51bWJlcjogMzAgfV0sIHsgZXRhZzogJ1wib3RoZXItaG9zdFwiJyB9KSxcblx0XHRcdFx0fSksXG5cdFx0XHRcdGdpdEh1YlJlc3RTdGVwKHtcblx0XHRcdFx0XHRtZXRob2Q6ICdHRVQnLFxuXHRcdFx0XHRcdHBhdGg6ICcvcmVwb3Mvby9yL3B1bGxzJyxcblx0XHRcdFx0XHRxdWVyeTogeyBwYWdlOiAxIH0sXG5cdFx0XHRcdFx0YXNzZXJ0OiByZXF1ZXN0ID0+IGFzc2VydC5zdHJpY3RFcXVhbChyZXF1ZXN0LmhlYWRlcnNbJ2lmLW5vbmUtbWF0Y2gnXSwgJ1wiYVwiJyksXG5cdFx0XHRcdFx0cmVzcG9uc2U6IGdpdEh1Yk5vdE1vZGlmaWVkUmVzcG9uc2UoKSxcblx0XHRcdFx0fSksXG5cdFx0XHRcdGdpdEh1YlJlc3RTdGVwKHtcblx0XHRcdFx0XHRtZXRob2Q6ICdHRVQnLFxuXHRcdFx0XHRcdHBhdGg6ICcvcmVwb3Mvby9yL3B1bGxzJyxcblx0XHRcdFx0XHRxdWVyeTogeyBwYWdlOiAyIH0sXG5cdFx0XHRcdFx0YXNzZXJ0OiByZXF1ZXN0ID0+IGFzc2VydC5zdHJpY3RFcXVhbChyZXF1ZXN0LmhlYWRlcnNbJ2lmLW5vbmUtbWF0Y2gnXSwgdW5kZWZpbmVkKSxcblx0XHRcdFx0XHRyZXNwb25zZTogZ2l0SHViSnNvblJlc3BvbnNlKFt7IG51bWJlcjogMyB9XSwgeyBldGFnOiAnXCJwYWdlLTJcIicgfSksXG5cdFx0XHRcdH0pLFxuXHRcdFx0XHRnaXRIdWJSZXN0U3RlcCh7XG5cdFx0XHRcdFx0bWV0aG9kOiAnR0VUJyxcblx0XHRcdFx0XHRwYXRoOiAnL3JlcG9zL28vci9wdWxscycsXG5cdFx0XHRcdFx0cXVlcnk6IHsgcGFnZTogMSB9LFxuXHRcdFx0XHRcdGFzc2VydDogcmVxdWVzdCA9PiBhc3NlcnQuc3RyaWN0RXF1YWwocmVxdWVzdC5oZWFkZXJzWydpZi1ub25lLW1hdGNoJ10sIHVuZGVmaW5lZCksXG5cdFx0XHRcdFx0cmVzcG9uc2U6IGdpdEh1Ykpzb25SZXNwb25zZShbeyBudW1iZXI6IDQgfV0sIHsgZXRhZzogJ1wibWVkaWFcIicgfSksXG5cdFx0XHRcdH0pLFxuXHRcdFx0KTtcblx0XHRcdGNvbnN0IHRyYW5zcG9ydCA9IGRpc3Bvc2FibGVzLmFkZChuZXcgR2l0SHViVHJhbnNwb3J0KG5vZGVGZXRjaCwgbmV3IEZha2VHaXRIdWJTY2hlZHVsZXIoeyBub3c6IDEyMyB9KSkpO1xuXHRcdFx0Y29uc3QgcGFnZU9uZSA9IGAke3NlcnZlci5hcGlCYXNlVXJsfS9yZXBvcy9vL3IvcHVsbHM/cGFnZT0xYDtcblxuXHRcdFx0YXdhaXQgdHJhbnNwb3J0LnJlc3QoYWNjb3VudEEsICd0b2tlbi1hJywgeyBtZXRob2Q6ICdHRVQnLCB1cmw6IHBhZ2VPbmUgfSwgc2lnbmFsKCkpO1xuXHRcdFx0YXdhaXQgdHJhbnNwb3J0LnJlc3QoYWNjb3VudEIsICd0b2tlbi1iJywgeyBtZXRob2Q6ICdHRVQnLCB1cmw6IHBhZ2VPbmUgfSwgc2lnbmFsKCkpO1xuXHRcdFx0YXdhaXQgdHJhbnNwb3J0LnJlc3QoYWNjb3VudE9uT3RoZXJIb3N0LCAndG9rZW4tYycsIHsgbWV0aG9kOiAnR0VUJywgdXJsOiBwYWdlT25lIH0sIHNpZ25hbCgpKTtcblx0XHRcdGNvbnN0IHJldmFsaWRhdGVkID0gYXdhaXQgdHJhbnNwb3J0LnJlc3Q8cmVhZG9ubHkgeyBudW1iZXI6IG51bWJlciB9W10+KGFjY291bnRBLCAndG9rZW4tYScsIHsgbWV0aG9kOiAnR0VUJywgdXJsOiBwYWdlT25lIH0sIHNpZ25hbCgpKTtcblx0XHRcdGF3YWl0IHRyYW5zcG9ydC5yZXN0KGFjY291bnRBLCAndG9rZW4tYScsIHsgbWV0aG9kOiAnR0VUJywgdXJsOiBgJHtzZXJ2ZXIuYXBpQmFzZVVybH0vcmVwb3Mvby9yL3B1bGxzP3BhZ2U9MmAgfSwgc2lnbmFsKCkpO1xuXHRcdFx0YXdhaXQgdHJhbnNwb3J0LnJlc3QoYWNjb3VudEEsICd0b2tlbi1hJywgeyBtZXRob2Q6ICdHRVQnLCB1cmw6IHBhZ2VPbmUsIGFjY2VwdDogJ2FwcGxpY2F0aW9uL3ZuZC5naXRodWIucmF3K2pzb24nIH0sIHNpZ25hbCgpKTtcblxuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChyZXZhbGlkYXRlZC5kYXRhLCBbeyBudW1iZXI6IDEgfV0pO1xuXHRcdFx0c2VydmVyLmFzc2VydFNhdGlzZmllZCgpO1xuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdyZW1vdmVzIGFuIG9sZCB2YWxpZGF0b3Igd2hlbiBhIDIwMCByZXNwb25zZSBoYXMgbm8gRVRhZycsIGFzeW5jICgpID0+IHtcblx0XHRhd2FpdCB3aXRoU2VydmVyKGFzeW5jIHNlcnZlciA9PiB7XG5cdFx0XHRzZXJ2ZXIuZW5xdWV1ZShcblx0XHRcdFx0Z2l0SHViUmVzdFN0ZXAoeyBtZXRob2Q6ICdHRVQnLCBwYXRoOiAnL3JlcG9zL28vci9wdWxscycsIHJlc3BvbnNlOiBnaXRIdWJKc29uUmVzcG9uc2UoW3sgbnVtYmVyOiAxIH1dLCB7IGV0YWc6ICdcIm9sZFwiJyB9KSB9KSxcblx0XHRcdFx0Z2l0SHViUmVzdFN0ZXAoe1xuXHRcdFx0XHRcdG1ldGhvZDogJ0dFVCcsXG5cdFx0XHRcdFx0cGF0aDogJy9yZXBvcy9vL3IvcHVsbHMnLFxuXHRcdFx0XHRcdGFzc2VydDogcmVxdWVzdCA9PiBhc3NlcnQuc3RyaWN0RXF1YWwocmVxdWVzdC5oZWFkZXJzWydpZi1ub25lLW1hdGNoJ10sICdcIm9sZFwiJyksXG5cdFx0XHRcdFx0cmVzcG9uc2U6IGdpdEh1Ykpzb25SZXNwb25zZShbeyBudW1iZXI6IDIgfV0pLFxuXHRcdFx0XHR9KSxcblx0XHRcdFx0Z2l0SHViUmVzdFN0ZXAoe1xuXHRcdFx0XHRcdG1ldGhvZDogJ0dFVCcsXG5cdFx0XHRcdFx0cGF0aDogJy9yZXBvcy9vL3IvcHVsbHMnLFxuXHRcdFx0XHRcdGFzc2VydDogcmVxdWVzdCA9PiBhc3NlcnQuc3RyaWN0RXF1YWwocmVxdWVzdC5oZWFkZXJzWydpZi1ub25lLW1hdGNoJ10sIHVuZGVmaW5lZCksXG5cdFx0XHRcdFx0cmVzcG9uc2U6IGdpdEh1Ykpzb25SZXNwb25zZShbeyBudW1iZXI6IDMgfV0pLFxuXHRcdFx0XHR9KSxcblx0XHRcdCk7XG5cdFx0XHRjb25zdCB0cmFuc3BvcnQgPSBkaXNwb3NhYmxlcy5hZGQobmV3IEdpdEh1YlRyYW5zcG9ydChub2RlRmV0Y2gpKTtcblx0XHRcdGNvbnN0IHJlcXVlc3QgPSB7IG1ldGhvZDogJ0dFVCcgYXMgY29uc3QsIHVybDogYCR7c2VydmVyLmFwaUJhc2VVcmx9L3JlcG9zL28vci9wdWxsc2AgfTtcblxuXHRcdFx0YXdhaXQgdHJhbnNwb3J0LnJlc3QoYWNjb3VudEEsICd0b2tlbi1hJywgcmVxdWVzdCwgc2lnbmFsKCkpO1xuXHRcdFx0YXdhaXQgdHJhbnNwb3J0LnJlc3QoYWNjb3VudEEsICd0b2tlbi1hJywgcmVxdWVzdCwgc2lnbmFsKCkpO1xuXHRcdFx0YXdhaXQgdHJhbnNwb3J0LnJlc3QoYWNjb3VudEEsICd0b2tlbi1hJywgcmVxdWVzdCwgc2lnbmFsKCkpO1xuXG5cdFx0XHRzZXJ2ZXIuYXNzZXJ0U2F0aXNmaWVkKCk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3ByZXNlcnZlcyBHcmFwaFFMIHBhcnRpYWwgZGF0YSBhbmQgdHlwZWQgZXJyb3JzJywgYXN5bmMgKCkgPT4ge1xuXHRcdGF3YWl0IHdpdGhTZXJ2ZXIoYXN5bmMgc2VydmVyID0+IHtcblx0XHRcdHNlcnZlci5lbnF1ZXVlKGdpdEh1YkdyYXBoUUxTdGVwKHtcblx0XHRcdFx0cXVlcnlJbmNsdWRlczogJ3JlcG9zaXRvcnknLFxuXHRcdFx0XHRyZXNwb25zZTogZ2l0SHViR3JhcGhRTFJlc3BvbnNlKFxuXHRcdFx0XHRcdHsgcmVwb3NpdG9yeTogeyBpZDogJ1IxJyB9LCByYXRlTGltaXQ6IHsgbGltaXQ6IDUwMDAsIHJlbWFpbmluZzogNywgdXNlZDogMywgcmVzZXRBdDogJzIwMzAtMDEtMDFUMDA6MDA6MDAuMDAwWicgfSB9LFxuXHRcdFx0XHRcdFt7IG1lc3NhZ2U6ICdmaWVsZCBkZW5pZWQnLCB0eXBlOiAnRk9SQklEREVOJywgcGF0aDogWydyZXBvc2l0b3J5JywgJ3ZpZXdlclBlcm1pc3Npb24nXSB9XSxcblx0XHRcdFx0KSxcblx0XHRcdH0pKTtcblx0XHRcdGNvbnN0IHRyYW5zcG9ydCA9IGRpc3Bvc2FibGVzLmFkZChuZXcgR2l0SHViVHJhbnNwb3J0KG5vZGVGZXRjaCkpO1xuXG5cdFx0XHRjb25zdCByZXNwb25zZSA9IGF3YWl0IHRyYW5zcG9ydC5ncmFwaHFsPHsgcmVwb3NpdG9yeTogeyBpZDogc3RyaW5nIH0gfT4oXG5cdFx0XHRcdGFjY291bnRBLFxuXHRcdFx0XHQndG9rZW4tYScsXG5cdFx0XHRcdHNlcnZlci5ncmFwaFFsVXJsLFxuXHRcdFx0XHQncXVlcnkgeyByZXBvc2l0b3J5KG93bmVyOiBcIm9cIiwgbmFtZTogXCJyXCIpIHsgaWQgfSB9Jyxcblx0XHRcdFx0e30sXG5cdFx0XHRcdHNpZ25hbCgpLFxuXHRcdFx0KTtcblxuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRcdGRhdGE6IHJlc3BvbnNlLmRhdGEsXG5cdFx0XHRcdGVycm9yczogcmVzcG9uc2UuZXJyb3JzLFxuXHRcdFx0XHRyYXRlTGltaXQ6IHRyYW5zcG9ydC5yYXRlTGltaXRzLmdldFN0YXRlKGFjY291bnRBLCAnZ3JhcGhxbCcpLFxuXHRcdFx0XHRhdXRob3JpemF0aW9uSXNFeHBlY3RlZDogc2VydmVyLnJlcXVlc3RzWzBdLmhlYWRlcnMuYXV0aG9yaXphdGlvbiA9PT0gWydCZWFyZXInLCAndG9rZW4tYSddLmpvaW4oJyAnKSxcblx0XHRcdFx0cmVxdWVzdEhlYWRlcnM6IHtcblx0XHRcdFx0XHRjYWNoZUNvbnRyb2w6IHNlcnZlci5yZXF1ZXN0c1swXS5oZWFkZXJzWydjYWNoZS1jb250cm9sJ10sXG5cdFx0XHRcdFx0YXV0aG9yaXphdGlvbjogc2VydmVyLnJlcXVlc3RzWzBdLmhlYWRlcnMuYXV0aG9yaXphdGlvbiA9PT0gdW5kZWZpbmVkID8gdW5kZWZpbmVkIDogJyonLnJlcGVhdCg2KSxcblx0XHRcdFx0fSxcblx0XHRcdH0sIHtcblx0XHRcdFx0ZGF0YTogeyByZXBvc2l0b3J5OiB7IGlkOiAnUjEnIH0sIHJhdGVMaW1pdDogeyBsaW1pdDogNTAwMCwgcmVtYWluaW5nOiA3LCB1c2VkOiAzLCByZXNldEF0OiAnMjAzMC0wMS0wMVQwMDowMDowMC4wMDBaJyB9IH0sXG5cdFx0XHRcdGVycm9yczogW3sgbWVzc2FnZTogJ2ZpZWxkIGRlbmllZCcsIHR5cGU6ICdGT1JCSURERU4nLCBwYXRoOiBbJ3JlcG9zaXRvcnknLCAndmlld2VyUGVybWlzc2lvbiddIH1dLFxuXHRcdFx0XHRyYXRlTGltaXQ6IHsgbGltaXQ6IDUwMDAsIHJlbWFpbmluZzogNywgdXNlZDogMywgcmVzZXRBdDogRGF0ZS5wYXJzZSgnMjAzMC0wMS0wMVQwMDowMDowMC4wMDBaJykgfSxcblx0XHRcdFx0YXV0aG9yaXphdGlvbklzRXhwZWN0ZWQ6IHRydWUsXG5cdFx0XHRcdHJlcXVlc3RIZWFkZXJzOiB7IGNhY2hlQ29udHJvbDogJ25vLXN0b3JlJywgYXV0aG9yaXphdGlvbjogJyoqKioqKicgfSxcblx0XHRcdH0pO1xuXHRcdFx0c2VydmVyLmFzc2VydFNhdGlzZmllZCgpO1xuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdjb2FsZXNjZXMgaWRlbnRpY2FsIEdyYXBoUUwgcmVhZHMgd2hpbGUgY2FuY2VsbGF0aW9uIGRldGFjaGVzIG9uZSB3YWl0ZXInLCBhc3luYyAoKSA9PiB7XG5cdFx0YXdhaXQgd2l0aFNlcnZlcihhc3luYyBzZXJ2ZXIgPT4ge1xuXHRcdFx0Y29uc3QgcmVxdWVzdFNlZW4gPSBuZXcgRGVmZXJyZWRQcm9taXNlPHZvaWQ+KCk7XG5cdFx0XHRjb25zdCByZWxlYXNlID0gbmV3IERlZmVycmVkUHJvbWlzZTx2b2lkPigpO1xuXHRcdFx0c2VydmVyLmVucXVldWUoZ2l0SHViR3JhcGhRTFN0ZXAoe1xuXHRcdFx0XHRxdWVyeUluY2x1ZGVzOiAncmVwb3NpdG9yeScsXG5cdFx0XHRcdGFzc2VydDogYXN5bmMgKCkgPT4gcmVxdWVzdFNlZW4uY29tcGxldGUoKSxcblx0XHRcdFx0d2FpdEZvcjogcmVsZWFzZS5wLFxuXHRcdFx0XHRyZXNwb25zZTogZ2l0SHViR3JhcGhRTFJlc3BvbnNlKHsgcmVwb3NpdG9yeTogeyBpZDogJ1IxJyB9IH0pLFxuXHRcdFx0fSkpO1xuXHRcdFx0Y29uc3QgdHJhbnNwb3J0ID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBHaXRIdWJUcmFuc3BvcnQobm9kZUZldGNoLCBuZXcgRmFrZUdpdEh1YlNjaGVkdWxlcih7IG5vdzogMTIzIH0pKSk7XG5cdFx0XHRjb25zdCBjYW5jZWxsZWQgPSBuZXcgQWJvcnRDb250cm9sbGVyKCk7XG5cdFx0XHRjb25zdCBxdWVyeSA9ICdxdWVyeSBSZXBvKCRvd25lcjogU3RyaW5nISwgJG5hbWU6IFN0cmluZyEpIHsgcmVwb3NpdG9yeShvd25lcjogJG93bmVyLCBuYW1lOiAkbmFtZSkgeyBpZCB9IH0nO1xuXHRcdFx0Y29uc3QgZmlyc3QgPSB0cmFuc3BvcnQuZ3JhcGhxbChhY2NvdW50QSwgJ3Rva2VuLWEnLCBzZXJ2ZXIuZ3JhcGhRbFVybCwgcXVlcnksIHsgb3duZXI6ICdvJywgbmFtZTogJ3InIH0sIGNhbmNlbGxlZC5zaWduYWwpO1xuXHRcdFx0Y29uc3Qgc2Vjb25kID0gdHJhbnNwb3J0LmdyYXBocWw8eyByZXBvc2l0b3J5OiB7IGlkOiBzdHJpbmcgfSB9PihhY2NvdW50QSwgJ3Rva2VuLWEnLCBzZXJ2ZXIuZ3JhcGhRbFVybCwgcXVlcnksIHsgbmFtZTogJ3InLCBvd25lcjogJ28nIH0sIHNpZ25hbCgpKTtcblx0XHRcdGF3YWl0IHJlcXVlc3RTZWVuLnA7XG5cblx0XHRcdGNhbmNlbGxlZC5hYm9ydChuZXcgRXJyb3IoJ2NhbmNlbCBmaXJzdCcpKTtcblx0XHRcdGF3YWl0IGFzc2VydC5yZWplY3RzKCgpID0+IGZpcnN0LCAvY2FuY2VsIGZpcnN0Lyk7XG5cdFx0XHRhd2FpdCByZWxlYXNlLmNvbXBsZXRlKCk7XG5cblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0XHRzZWNvbmQ6IGF3YWl0IHNlY29uZCxcblx0XHRcdFx0cmVxdWVzdENvdW50OiBzZXJ2ZXIucmVxdWVzdHMubGVuZ3RoLFxuXHRcdFx0fSwge1xuXHRcdFx0XHRzZWNvbmQ6IHsgZGF0YTogeyByZXBvc2l0b3J5OiB7IGlkOiAnUjEnIH0gfSwgZXJyb3JzOiBbXSwgb2JzZXJ2ZWRBdDogMTIzIH0sXG5cdFx0XHRcdHJlcXVlc3RDb3VudDogMSxcblx0XHRcdH0pO1xuXHRcdFx0c2VydmVyLmFzc2VydFNhdGlzZmllZCgpO1xuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdwdXJnZXMgZXZlcnkgYWNjb3VudCBjYWNoZSBlbnRyeSBhbmQgYWJvcnRzIGluLWZsaWdodCB3b3JrIG9uIGludmFsaWRhdGlvbicsIGFzeW5jICgpID0+IHtcblx0XHRhd2FpdCB3aXRoU2VydmVyKGFzeW5jIHNlcnZlciA9PiB7XG5cdFx0XHRjb25zdCByZXF1ZXN0U2VlbiA9IG5ldyBEZWZlcnJlZFByb21pc2U8dm9pZD4oKTtcblx0XHRcdGNvbnN0IHJlbGVhc2UgPSBuZXcgRGVmZXJyZWRQcm9taXNlPHZvaWQ+KCk7XG5cdFx0XHRzZXJ2ZXIuZW5xdWV1ZShcblx0XHRcdFx0Z2l0SHViUmVzdFN0ZXAoeyBtZXRob2Q6ICdHRVQnLCBwYXRoOiAnL3JlcG9zL28vci9vbmUnLCByZXNwb25zZTogZ2l0SHViSnNvblJlc3BvbnNlKHsgdmFsdWU6IDEgfSwgeyBldGFnOiAnXCJvbmVcIicgfSkgfSksXG5cdFx0XHRcdGdpdEh1YlJlc3RTdGVwKHsgbWV0aG9kOiAnR0VUJywgcGF0aDogJy9yZXBvcy9vL3IvdHdvJywgcmVzcG9uc2U6IGdpdEh1Ykpzb25SZXNwb25zZSh7IHZhbHVlOiAyIH0sIHsgZXRhZzogJ1widHdvXCInIH0pIH0pLFxuXHRcdFx0XHRnaXRIdWJSZXN0U3RlcCh7XG5cdFx0XHRcdFx0bWV0aG9kOiAnR0VUJyxcblx0XHRcdFx0XHRwYXRoOiAnL3JlcG9zL28vci9wZW5kaW5nJyxcblx0XHRcdFx0XHRhc3NlcnQ6IGFzeW5jICgpID0+IHJlcXVlc3RTZWVuLmNvbXBsZXRlKCksXG5cdFx0XHRcdFx0d2FpdEZvcjogcmVsZWFzZS5wLFxuXHRcdFx0XHRcdHJlc3BvbnNlOiBnaXRIdWJKc29uUmVzcG9uc2UoeyB2YWx1ZTogMyB9KSxcblx0XHRcdFx0fSksXG5cdFx0XHRcdGdpdEh1YlJlc3RTdGVwKHtcblx0XHRcdFx0XHRtZXRob2Q6ICdHRVQnLFxuXHRcdFx0XHRcdHBhdGg6ICcvcmVwb3Mvby9yL29uZScsXG5cdFx0XHRcdFx0YXNzZXJ0OiByZXF1ZXN0ID0+IGFzc2VydC5zdHJpY3RFcXVhbChyZXF1ZXN0LmhlYWRlcnNbJ2lmLW5vbmUtbWF0Y2gnXSwgdW5kZWZpbmVkKSxcblx0XHRcdFx0XHRyZXNwb25zZTogZ2l0SHViSnNvblJlc3BvbnNlKHsgdmFsdWU6IDEwIH0sIHsgZXRhZzogJ1widGVuXCInIH0pLFxuXHRcdFx0XHR9KSxcblx0XHRcdFx0Z2l0SHViUmVzdFN0ZXAoe1xuXHRcdFx0XHRcdG1ldGhvZDogJ0dFVCcsXG5cdFx0XHRcdFx0cGF0aDogJy9yZXBvcy9vL3IvdHdvJyxcblx0XHRcdFx0XHRhc3NlcnQ6IHJlcXVlc3QgPT4gYXNzZXJ0LnN0cmljdEVxdWFsKHJlcXVlc3QuaGVhZGVyc1snaWYtbm9uZS1tYXRjaCddLCB1bmRlZmluZWQpLFxuXHRcdFx0XHRcdHJlc3BvbnNlOiBnaXRIdWJKc29uUmVzcG9uc2UoeyB2YWx1ZTogMjAgfSwgeyBldGFnOiAnXCJ0d2VudHlcIicgfSksXG5cdFx0XHRcdH0pLFxuXHRcdFx0KTtcblx0XHRcdGNvbnN0IHRyYW5zcG9ydCA9IGRpc3Bvc2FibGVzLmFkZChuZXcgR2l0SHViVHJhbnNwb3J0KG5vZGVGZXRjaCkpO1xuXHRcdFx0Y29uc3Qgb25lID0geyBtZXRob2Q6ICdHRVQnIGFzIGNvbnN0LCB1cmw6IGAke3NlcnZlci5hcGlCYXNlVXJsfS9yZXBvcy9vL3Ivb25lYCB9O1xuXHRcdFx0Y29uc3QgdHdvID0geyBtZXRob2Q6ICdHRVQnIGFzIGNvbnN0LCB1cmw6IGAke3NlcnZlci5hcGlCYXNlVXJsfS9yZXBvcy9vL3IvdHdvYCB9O1xuXG5cdFx0XHRhd2FpdCB0cmFuc3BvcnQucmVzdChhY2NvdW50QSwgJ3Rva2VuLWEnLCBvbmUsIHNpZ25hbCgpKTtcblx0XHRcdGF3YWl0IHRyYW5zcG9ydC5yZXN0KGFjY291bnRBLCAndG9rZW4tYScsIHR3bywgc2lnbmFsKCkpO1xuXHRcdFx0Y29uc3QgcGVuZGluZyA9IHRyYW5zcG9ydC5yZXN0KGFjY291bnRBLCAndG9rZW4tYScsIHsgbWV0aG9kOiAnR0VUJywgdXJsOiBgJHtzZXJ2ZXIuYXBpQmFzZVVybH0vcmVwb3Mvby9yL3BlbmRpbmdgIH0sIHNpZ25hbCgpKTtcblx0XHRcdGF3YWl0IHJlcXVlc3RTZWVuLnA7XG5cblx0XHRcdHRyYW5zcG9ydC5pbnZhbGlkYXRlQWNjb3VudChhY2NvdW50QSwgbmV3IEVycm9yKCdjcmVkZW50aWFsIGludmFsaWRhdGVkJykpO1xuXHRcdFx0YXdhaXQgYXNzZXJ0LnJlamVjdHMoKCkgPT4gcGVuZGluZywgL2NyZWRlbnRpYWwgaW52YWxpZGF0ZWQvKTtcblx0XHRcdGF3YWl0IHJlbGVhc2UuY29tcGxldGUoKTtcblxuXHRcdFx0Y29uc3QgcmVmcmVzaGVkT25lID0gYXdhaXQgdHJhbnNwb3J0LnJlc3Q8eyB2YWx1ZTogbnVtYmVyIH0+KGFjY291bnRBLCAndG9rZW4tYScsIG9uZSwgc2lnbmFsKCkpO1xuXHRcdFx0Y29uc3QgcmVmcmVzaGVkVHdvID0gYXdhaXQgdHJhbnNwb3J0LnJlc3Q8eyB2YWx1ZTogbnVtYmVyIH0+KGFjY291bnRBLCAndG9rZW4tYScsIHR3bywgc2lnbmFsKCkpO1xuXG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdFx0b25lOiByZWZyZXNoZWRPbmUuZGF0YSxcblx0XHRcdFx0dHdvOiByZWZyZXNoZWRUd28uZGF0YSxcblx0XHRcdFx0cmVxdWVzdENvdW50OiBzZXJ2ZXIucmVxdWVzdHMubGVuZ3RoLFxuXHRcdFx0fSwge1xuXHRcdFx0XHRvbmU6IHsgdmFsdWU6IDEwIH0sXG5cdFx0XHRcdHR3bzogeyB2YWx1ZTogMjAgfSxcblx0XHRcdFx0cmVxdWVzdENvdW50OiA1LFxuXHRcdFx0fSk7XG5cdFx0XHRzZXJ2ZXIuYXNzZXJ0U2F0aXNmaWVkKCk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3N0YXJ0cyBmcmVzaCBSRVNUIGFuZCBHcmFwaFFMIHJlcXVlc3RzIGFmdGVyIGV2ZXJ5IGNvYWxlc2NlZCB3YWl0ZXIgY2FuY2VscycsIGFzeW5jICgpID0+IHtcblx0XHRhd2FpdCB3aXRoU2VydmVyKGFzeW5jIHNlcnZlciA9PiB7XG5cdFx0XHRjb25zdCByZXN0U2VlbiA9IG5ldyBEZWZlcnJlZFByb21pc2U8dm9pZD4oKTtcblx0XHRcdGNvbnN0IHJlbGVhc2VSZXN0ID0gbmV3IERlZmVycmVkUHJvbWlzZTx2b2lkPigpO1xuXHRcdFx0Y29uc3QgZ3JhcGhRTFNlZW4gPSBuZXcgRGVmZXJyZWRQcm9taXNlPHZvaWQ+KCk7XG5cdFx0XHRjb25zdCByZWxlYXNlR3JhcGhRTCA9IG5ldyBEZWZlcnJlZFByb21pc2U8dm9pZD4oKTtcblx0XHRcdHNlcnZlci5lbnF1ZXVlKFxuXHRcdFx0XHRnaXRIdWJSZXN0U3RlcCh7XG5cdFx0XHRcdFx0bWV0aG9kOiAnR0VUJyxcblx0XHRcdFx0XHRwYXRoOiAnL3JlcG9zL28vci9zaGFyZWQnLFxuXHRcdFx0XHRcdGFzc2VydDogYXN5bmMgKCkgPT4gcmVzdFNlZW4uY29tcGxldGUoKSxcblx0XHRcdFx0XHR3YWl0Rm9yOiByZWxlYXNlUmVzdC5wLFxuXHRcdFx0XHRcdHJlc3BvbnNlOiBnaXRIdWJKc29uUmVzcG9uc2UoeyB2YWx1ZTogMSB9KSxcblx0XHRcdFx0fSksXG5cdFx0XHRcdGdpdEh1YlJlc3RTdGVwKHsgbWV0aG9kOiAnR0VUJywgcGF0aDogJy9yZXBvcy9vL3Ivc2hhcmVkJywgcmVzcG9uc2U6IGdpdEh1Ykpzb25SZXNwb25zZSh7IHZhbHVlOiAyIH0pIH0pLFxuXHRcdFx0XHRnaXRIdWJHcmFwaFFMU3RlcCh7XG5cdFx0XHRcdFx0cXVlcnlJbmNsdWRlczogJ3JlcG9zaXRvcnknLFxuXHRcdFx0XHRcdGFzc2VydDogYXN5bmMgKCkgPT4gZ3JhcGhRTFNlZW4uY29tcGxldGUoKSxcblx0XHRcdFx0XHR3YWl0Rm9yOiByZWxlYXNlR3JhcGhRTC5wLFxuXHRcdFx0XHRcdHJlc3BvbnNlOiBnaXRIdWJHcmFwaFFMUmVzcG9uc2UoeyByZXBvc2l0b3J5OiB7IGlkOiAnb2xkJyB9IH0pLFxuXHRcdFx0XHR9KSxcblx0XHRcdFx0Z2l0SHViR3JhcGhRTFN0ZXAoe1xuXHRcdFx0XHRcdHF1ZXJ5SW5jbHVkZXM6ICdyZXBvc2l0b3J5Jyxcblx0XHRcdFx0XHRyZXNwb25zZTogZ2l0SHViR3JhcGhRTFJlc3BvbnNlKHsgcmVwb3NpdG9yeTogeyBpZDogJ25ldycgfSB9KSxcblx0XHRcdFx0fSksXG5cdFx0XHQpO1xuXHRcdFx0Y29uc3QgdHJhbnNwb3J0ID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBHaXRIdWJUcmFuc3BvcnQobm9kZUZldGNoKSk7XG5cdFx0XHRjb25zdCByZXN0Q29udHJvbGxlciA9IG5ldyBBYm9ydENvbnRyb2xsZXIoKTtcblx0XHRcdGNvbnN0IHJlc3RSZXF1ZXN0ID0geyBtZXRob2Q6ICdHRVQnIGFzIGNvbnN0LCB1cmw6IGAke3NlcnZlci5hcGlCYXNlVXJsfS9yZXBvcy9vL3Ivc2hhcmVkYCwgZXRhZzogZmFsc2UgfTtcblx0XHRcdGNvbnN0IGZpcnN0UmVzdCA9IHRyYW5zcG9ydC5yZXN0KGFjY291bnRBLCAndG9rZW4tYScsIHJlc3RSZXF1ZXN0LCByZXN0Q29udHJvbGxlci5zaWduYWwpO1xuXHRcdFx0YXdhaXQgcmVzdFNlZW4ucDtcblx0XHRcdHJlc3RDb250cm9sbGVyLmFib3J0KG5ldyBFcnJvcignY2FuY2VsIFJFU1Qgd2FpdGVyJykpO1xuXHRcdFx0YXdhaXQgYXNzZXJ0LnJlamVjdHMoKCkgPT4gZmlyc3RSZXN0LCAvY2FuY2VsIFJFU1Qgd2FpdGVyLyk7XG5cdFx0XHRjb25zdCBzZWNvbmRSZXN0UHJvbWlzZSA9IHRyYW5zcG9ydC5yZXN0PHsgdmFsdWU6IG51bWJlciB9PihhY2NvdW50QSwgJ3Rva2VuLWEnLCByZXN0UmVxdWVzdCwgc2lnbmFsKCkpO1xuXHRcdFx0YXdhaXQgcmVsZWFzZVJlc3QuY29tcGxldGUoKTtcblx0XHRcdGNvbnN0IHNlY29uZFJlc3QgPSBhd2FpdCBzZWNvbmRSZXN0UHJvbWlzZTtcblxuXHRcdFx0Y29uc3QgZ3JhcGhRTENvbnRyb2xsZXIgPSBuZXcgQWJvcnRDb250cm9sbGVyKCk7XG5cdFx0XHRjb25zdCBxdWVyeSA9ICdxdWVyeSB7IHJlcG9zaXRvcnkob3duZXI6IFwib1wiLCBuYW1lOiBcInJcIikgeyBpZCB9IH0nO1xuXHRcdFx0Y29uc3QgZmlyc3RHcmFwaFFMID0gdHJhbnNwb3J0LmdyYXBocWwoYWNjb3VudEEsICd0b2tlbi1hJywgc2VydmVyLmdyYXBoUWxVcmwsIHF1ZXJ5LCB7fSwgZ3JhcGhRTENvbnRyb2xsZXIuc2lnbmFsKTtcblx0XHRcdGF3YWl0IGdyYXBoUUxTZWVuLnA7XG5cdFx0XHRncmFwaFFMQ29udHJvbGxlci5hYm9ydChuZXcgRXJyb3IoJ2NhbmNlbCBHcmFwaFFMIHdhaXRlcicpKTtcblx0XHRcdGF3YWl0IGFzc2VydC5yZWplY3RzKCgpID0+IGZpcnN0R3JhcGhRTCwgL2NhbmNlbCBHcmFwaFFMIHdhaXRlci8pO1xuXHRcdFx0Y29uc3Qgc2Vjb25kR3JhcGhRTFByb21pc2UgPSB0cmFuc3BvcnQuZ3JhcGhxbDx7IHJlcG9zaXRvcnk6IHsgaWQ6IHN0cmluZyB9IH0+KGFjY291bnRBLCAndG9rZW4tYScsIHNlcnZlci5ncmFwaFFsVXJsLCBxdWVyeSwge30sIHNpZ25hbCgpKTtcblx0XHRcdGF3YWl0IHJlbGVhc2VHcmFwaFFMLmNvbXBsZXRlKCk7XG5cdFx0XHRjb25zdCBzZWNvbmRHcmFwaFFMID0gYXdhaXQgc2Vjb25kR3JhcGhRTFByb21pc2U7XG5cblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0XHRyZXN0OiBzZWNvbmRSZXN0LmRhdGEsXG5cdFx0XHRcdGdyYXBoUUw6IHNlY29uZEdyYXBoUUwuZGF0YSxcblx0XHRcdFx0cmVxdWVzdENvdW50OiBzZXJ2ZXIucmVxdWVzdHMubGVuZ3RoLFxuXHRcdFx0fSwge1xuXHRcdFx0XHRyZXN0OiB7IHZhbHVlOiAyIH0sXG5cdFx0XHRcdGdyYXBoUUw6IHsgcmVwb3NpdG9yeTogeyBpZDogJ25ldycgfSB9LFxuXHRcdFx0XHRyZXF1ZXN0Q291bnQ6IDQsXG5cdFx0XHR9KTtcblx0XHRcdHNlcnZlci5hc3NlcnRTYXRpc2ZpZWQoKTtcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnZG9lcyBub3QgY29hbGVzY2UgYW4gdW5jb25kaXRpb25hbCBHRVQgd2l0aCBhIGNvbmRpdGlvbmFsIHJldmFsaWRhdGlvbicsIGFzeW5jICgpID0+IHtcblx0XHRhd2FpdCB3aXRoU2VydmVyKGFzeW5jIHNlcnZlciA9PiB7XG5cdFx0XHRjb25zdCBjb25kaXRpb25hbFNlZW4gPSBuZXcgRGVmZXJyZWRQcm9taXNlPHZvaWQ+KCk7XG5cdFx0XHRjb25zdCByZWxlYXNlQ29uZGl0aW9uYWwgPSBuZXcgRGVmZXJyZWRQcm9taXNlPHZvaWQ+KCk7XG5cdFx0XHRzZXJ2ZXIuZW5xdWV1ZShcblx0XHRcdFx0Z2l0SHViUmVzdFN0ZXAoeyBtZXRob2Q6ICdHRVQnLCBwYXRoOiAnL3JlcG9zL28vci9zdGF0ZScsIHJlc3BvbnNlOiBnaXRIdWJKc29uUmVzcG9uc2UoeyB2YWx1ZTogMSB9LCB7IGV0YWc6ICdcIm9sZFwiJyB9KSB9KSxcblx0XHRcdFx0Z2l0SHViUmVzdFN0ZXAoe1xuXHRcdFx0XHRcdG1ldGhvZDogJ0dFVCcsXG5cdFx0XHRcdFx0cGF0aDogJy9yZXBvcy9vL3Ivc3RhdGUnLFxuXHRcdFx0XHRcdGFzc2VydDogYXN5bmMgcmVxdWVzdCA9PiB7XG5cdFx0XHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVxdWVzdC5oZWFkZXJzWydpZi1ub25lLW1hdGNoJ10sICdcIm9sZFwiJyk7XG5cdFx0XHRcdFx0XHRhd2FpdCBjb25kaXRpb25hbFNlZW4uY29tcGxldGUoKTtcblx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdHdhaXRGb3I6IHJlbGVhc2VDb25kaXRpb25hbC5wLFxuXHRcdFx0XHRcdHJlc3BvbnNlOiBnaXRIdWJOb3RNb2RpZmllZFJlc3BvbnNlKCksXG5cdFx0XHRcdH0pLFxuXHRcdFx0XHRnaXRIdWJSZXN0U3RlcCh7XG5cdFx0XHRcdFx0bWV0aG9kOiAnR0VUJyxcblx0XHRcdFx0XHRwYXRoOiAnL3JlcG9zL28vci9zdGF0ZScsXG5cdFx0XHRcdFx0YXNzZXJ0OiByZXF1ZXN0ID0+IGFzc2VydC5zdHJpY3RFcXVhbChyZXF1ZXN0LmhlYWRlcnNbJ2lmLW5vbmUtbWF0Y2gnXSwgdW5kZWZpbmVkKSxcblx0XHRcdFx0XHRyZXNwb25zZTogZ2l0SHViSnNvblJlc3BvbnNlKHsgdmFsdWU6IDIgfSwgeyBldGFnOiAnXCJuZXdcIicgfSksXG5cdFx0XHRcdH0pLFxuXHRcdFx0KTtcblx0XHRcdGNvbnN0IHRyYW5zcG9ydCA9IGRpc3Bvc2FibGVzLmFkZChuZXcgR2l0SHViVHJhbnNwb3J0KG5vZGVGZXRjaCkpO1xuXHRcdFx0Y29uc3QgcmVxdWVzdCA9IHsgbWV0aG9kOiAnR0VUJyBhcyBjb25zdCwgdXJsOiBgJHtzZXJ2ZXIuYXBpQmFzZVVybH0vcmVwb3Mvby9yL3N0YXRlYCB9O1xuXHRcdFx0YXdhaXQgdHJhbnNwb3J0LnJlc3QoYWNjb3VudEEsICd0b2tlbi1hJywgcmVxdWVzdCwgc2lnbmFsKCkpO1xuXG5cdFx0XHRjb25zdCBjb25kaXRpb25hbCA9IHRyYW5zcG9ydC5yZXN0PHsgdmFsdWU6IG51bWJlciB9PihhY2NvdW50QSwgJ3Rva2VuLWEnLCByZXF1ZXN0LCBzaWduYWwoKSk7XG5cdFx0XHRhd2FpdCBjb25kaXRpb25hbFNlZW4ucDtcblx0XHRcdGNvbnN0IHVuY29uZGl0aW9uYWwgPSB0cmFuc3BvcnQucmVzdDx7IHZhbHVlOiBudW1iZXIgfT4oYWNjb3VudEEsICd0b2tlbi1hJywgeyAuLi5yZXF1ZXN0LCB1bmNvbmRpdGlvbmFsOiB0cnVlIH0sIHNpZ25hbCgpKTtcblx0XHRcdGF3YWl0IHJlbGVhc2VDb25kaXRpb25hbC5jb21wbGV0ZSgpO1xuXG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdFx0Y29uZGl0aW9uYWw6IChhd2FpdCBjb25kaXRpb25hbCkuZGF0YSxcblx0XHRcdFx0dW5jb25kaXRpb25hbDogKGF3YWl0IHVuY29uZGl0aW9uYWwpLmRhdGEsXG5cdFx0XHRcdHJlcXVlc3RDb3VudDogc2VydmVyLnJlcXVlc3RzLmxlbmd0aCxcblx0XHRcdH0sIHtcblx0XHRcdFx0Y29uZGl0aW9uYWw6IHsgdmFsdWU6IDEgfSxcblx0XHRcdFx0dW5jb25kaXRpb25hbDogeyB2YWx1ZTogMiB9LFxuXHRcdFx0XHRyZXF1ZXN0Q291bnQ6IDMsXG5cdFx0XHR9KTtcblx0XHRcdHNlcnZlci5hc3NlcnRTYXRpc2ZpZWQoKTtcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnc2hhcmVzIHJhdGUtbGltaXQgYmFja29mZiBhY3Jvc3MgcmVxdWVzdHMgZm9yIGFuIGFjY291bnQnLCBhc3luYyAoKSA9PiB7XG5cdFx0YXdhaXQgd2l0aFNlcnZlcihhc3luYyBzZXJ2ZXIgPT4ge1xuXHRcdFx0Y29uc3Qgc2NoZWR1bGVyID0gbmV3IEZha2VHaXRIdWJTY2hlZHVsZXIoeyBub3c6IDFfMDAwIH0pO1xuXHRcdFx0Y29uc3QgdHJhbnNwb3J0ID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBHaXRIdWJUcmFuc3BvcnQobm9kZUZldGNoLCBzY2hlZHVsZXIpKTtcblx0XHRcdHNlcnZlci5lbnF1ZXVlKFxuXHRcdFx0XHRnaXRIdWJSZXN0U3RlcCh7XG5cdFx0XHRcdFx0bWV0aG9kOiAnR0VUJyxcblx0XHRcdFx0XHRwYXRoOiAnL3JlcG9zL28vci9saW1pdGVkJyxcblx0XHRcdFx0XHRyZXNwb25zZTogZ2l0SHViUmF0ZUxpbWl0UmVzcG9uc2UoeyBzdGF0dXM6IDQyOSwgcmVzb3VyY2U6ICdjb3JlJywgcmV0cnlBZnRlclNlY29uZHM6IDUgfSksXG5cdFx0XHRcdH0pLFxuXHRcdFx0XHRnaXRIdWJSZXN0U3RlcCh7IG1ldGhvZDogJ0dFVCcsIHBhdGg6ICcvcmVwb3Mvby9yL2FmdGVyJywgcmVzcG9uc2U6IGdpdEh1Ykpzb25SZXNwb25zZSh7IG9rOiB0cnVlIH0pIH0pLFxuXHRcdFx0KTtcblxuXHRcdFx0YXdhaXQgYXNzZXJ0LnJlamVjdHMoXG5cdFx0XHRcdCgpID0+IHRyYW5zcG9ydC5yZXN0KGFjY291bnRBLCAndG9rZW4tYScsIHsgbWV0aG9kOiAnR0VUJywgdXJsOiBgJHtzZXJ2ZXIuYXBpQmFzZVVybH0vcmVwb3Mvby9yL2xpbWl0ZWRgIH0sIHNpZ25hbCgpKSxcblx0XHRcdFx0ZXJyb3IgPT4gZXJyb3IgaW5zdGFuY2VvZiBHaXRIdWJSZXF1ZXN0RXJyb3IgJiYgZXJyb3Iua2luZCA9PT0gJ3JhdGVMaW1pdCcsXG5cdFx0XHQpO1xuXHRcdFx0bGV0IHNldHRsZWQgPSBmYWxzZTtcblx0XHRcdGNvbnN0IGFmdGVyID0gdHJhbnNwb3J0LnJlc3QoYWNjb3VudEEsICd0b2tlbi1hJywgeyBtZXRob2Q6ICdHRVQnLCB1cmw6IGAke3NlcnZlci5hcGlCYXNlVXJsfS9yZXBvcy9vL3IvYWZ0ZXJgIH0sIHNpZ25hbCgpKS50aGVuKCgpID0+IHNldHRsZWQgPSB0cnVlKTtcblx0XHRcdGF3YWl0IFByb21pc2UucmVzb2x2ZSgpO1xuXG5cdFx0XHRzY2hlZHVsZXIuYWR2YW5jZUJ5KDRfOTk5KTtcblx0XHRcdGF3YWl0IFByb21pc2UucmVzb2x2ZSgpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNldHRsZWQsIGZhbHNlKTtcblx0XHRcdHNjaGVkdWxlci5hZHZhbmNlQnkoMSk7XG5cdFx0XHRhd2FpdCBhZnRlcjtcblxuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNlcnZlci5yZXF1ZXN0cy5sZW5ndGgsIDIpO1xuXHRcdFx0c2VydmVyLmFzc2VydFNhdGlzZmllZCgpO1xuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdHcmFwaFFMIFJBVEVfTElNSVRFRCBlcnJvcnMgZXN0YWJsaXNoIHNoYXJlZCBhY2NvdW50IGJhY2tvZmYnLCBhc3luYyAoKSA9PiB7XG5cdFx0YXdhaXQgd2l0aFNlcnZlcihhc3luYyBzZXJ2ZXIgPT4ge1xuXHRcdFx0Y29uc3Qgc2NoZWR1bGVyID0gbmV3IEZha2VHaXRIdWJTY2hlZHVsZXIoeyBub3c6IDFfMDAwIH0pO1xuXHRcdFx0Y29uc3QgdHJhbnNwb3J0ID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBHaXRIdWJUcmFuc3BvcnQobm9kZUZldGNoLCBzY2hlZHVsZXIpKTtcblx0XHRcdHNlcnZlci5lbnF1ZXVlKFxuXHRcdFx0XHRnaXRIdWJHcmFwaFFMU3RlcCh7XG5cdFx0XHRcdFx0cXVlcnlJbmNsdWRlczogJ3JlcG9zaXRvcnknLFxuXHRcdFx0XHRcdHJlc3BvbnNlOiBnaXRIdWJHcmFwaFFMUmVzcG9uc2UodW5kZWZpbmVkLCBbeyBtZXNzYWdlOiAncmF0ZSBsaW1pdGVkJywgdHlwZTogJ1JBVEVfTElNSVRFRCcgfV0pLFxuXHRcdFx0XHR9KSxcblx0XHRcdFx0Z2l0SHViR3JhcGhRTFN0ZXAoe1xuXHRcdFx0XHRcdHF1ZXJ5SW5jbHVkZXM6ICd2aWV3ZXInLFxuXHRcdFx0XHRcdHJlc3BvbnNlOiBnaXRIdWJHcmFwaFFMUmVzcG9uc2UoeyB2aWV3ZXI6IHsgaWQ6ICdVMScgfSB9KSxcblx0XHRcdFx0fSksXG5cdFx0XHQpO1xuXG5cdFx0XHRjb25zdCBsaW1pdGVkID0gYXdhaXQgdHJhbnNwb3J0LmdyYXBocWwoYWNjb3VudEEsICd0b2tlbi1hJywgc2VydmVyLmdyYXBoUWxVcmwsICdxdWVyeSB7IHJlcG9zaXRvcnkob3duZXI6IFwib1wiLCBuYW1lOiBcInJcIikgeyBpZCB9IH0nLCB7fSwgc2lnbmFsKCkpO1xuXHRcdFx0bGV0IHNldHRsZWQgPSBmYWxzZTtcblx0XHRcdGNvbnN0IGFmdGVyID0gdHJhbnNwb3J0LmdyYXBocWwoYWNjb3VudEEsICd0b2tlbi1hJywgc2VydmVyLmdyYXBoUWxVcmwsICdxdWVyeSB7IHZpZXdlciB7IGlkIH0gfScsIHt9LCBzaWduYWwoKSkudGhlbigoKSA9PiBzZXR0bGVkID0gdHJ1ZSk7XG5cdFx0XHRhd2FpdCBQcm9taXNlLnJlc29sdmUoKTtcblxuXHRcdFx0c2NoZWR1bGVyLmFkdmFuY2VCeSg1OV85OTkpO1xuXHRcdFx0YXdhaXQgUHJvbWlzZS5yZXNvbHZlKCk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2V0dGxlZCwgZmFsc2UpO1xuXHRcdFx0c2NoZWR1bGVyLmFkdmFuY2VCeSgxKTtcblx0XHRcdGF3YWl0IGFmdGVyO1xuXG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdFx0ZXJyb3JzOiBsaW1pdGVkLmVycm9ycyxcblx0XHRcdFx0cmVxdWVzdENvdW50OiBzZXJ2ZXIucmVxdWVzdHMubGVuZ3RoLFxuXHRcdFx0fSwge1xuXHRcdFx0XHRlcnJvcnM6IFt7IG1lc3NhZ2U6ICdyYXRlIGxpbWl0ZWQnLCB0eXBlOiAnUkFURV9MSU1JVEVEJyB9XSxcblx0XHRcdFx0cmVxdWVzdENvdW50OiAyLFxuXHRcdFx0fSk7XG5cdFx0XHRzZXJ2ZXIuYXNzZXJ0U2F0aXNmaWVkKCk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2RvZXMgbm90IGFwcGx5IEdyYXBoUUwgcHJpbWFyeS1yYXRlLWxpbWl0IHN0YXRlIHRvIHRoZSBSRVNUIGNvcmUgYnVja2V0JywgYXN5bmMgKCkgPT4ge1xuXHRcdGF3YWl0IHdpdGhTZXJ2ZXIoYXN5bmMgc2VydmVyID0+IHtcblx0XHRcdGNvbnN0IHNjaGVkdWxlciA9IG5ldyBGYWtlR2l0SHViU2NoZWR1bGVyKHsgbm93OiAxXzAwMCB9KTtcblx0XHRcdGNvbnN0IHRyYW5zcG9ydCA9IGRpc3Bvc2FibGVzLmFkZChuZXcgR2l0SHViVHJhbnNwb3J0KG5vZGVGZXRjaCwgc2NoZWR1bGVyKSk7XG5cdFx0XHR0cmFuc3BvcnQucmF0ZUxpbWl0cy51cGRhdGVGcm9tR3JhcGhRTChhY2NvdW50QSwge1xuXHRcdFx0XHRyZW1haW5pbmc6IDAsXG5cdFx0XHRcdHJlc2V0QXQ6IG5ldyBEYXRlKDYxXzAwMCkudG9JU09TdHJpbmcoKSxcblx0XHRcdH0pO1xuXHRcdFx0Y29uc3QgZ3JhcGhRTENvbnRyb2xsZXIgPSBuZXcgQWJvcnRDb250cm9sbGVyKCk7XG5cdFx0XHRjb25zdCBibG9ja2VkR3JhcGhRTCA9IHRyYW5zcG9ydC5ncmFwaHFsKFxuXHRcdFx0XHRhY2NvdW50QSxcblx0XHRcdFx0J3Rva2VuLWEnLFxuXHRcdFx0XHRzZXJ2ZXIuZ3JhcGhRbFVybCxcblx0XHRcdFx0J3F1ZXJ5IHsgdmlld2VyIHsgaWQgfSB9Jyxcblx0XHRcdFx0e30sXG5cdFx0XHRcdGdyYXBoUUxDb250cm9sbGVyLnNpZ25hbCxcblx0XHRcdCk7XG5cdFx0XHRhd2FpdCBQcm9taXNlLnJlc29sdmUoKTtcblx0XHRcdHNlcnZlci5lbnF1ZXVlKGdpdEh1YlJlc3RTdGVwKHtcblx0XHRcdFx0bWV0aG9kOiAnR0VUJyxcblx0XHRcdFx0cGF0aDogJy9yZXBvcy9vL3IvY29yZScsXG5cdFx0XHRcdHJlc3BvbnNlOiBnaXRIdWJKc29uUmVzcG9uc2UoeyBvazogdHJ1ZSB9KSxcblx0XHRcdH0pKTtcblxuXHRcdFx0Y29uc3QgcmVzcG9uc2UgPSBhd2FpdCB0cmFuc3BvcnQucmVzdDx7IG9rOiBib29sZWFuIH0+KFxuXHRcdFx0XHRhY2NvdW50QSxcblx0XHRcdFx0J3Rva2VuLWEnLFxuXHRcdFx0XHR7IG1ldGhvZDogJ0dFVCcsIHVybDogYCR7c2VydmVyLmFwaUJhc2VVcmx9L3JlcG9zL28vci9jb3JlYCB9LFxuXHRcdFx0XHRzaWduYWwoKSxcblx0XHRcdCk7XG5cdFx0XHRncmFwaFFMQ29udHJvbGxlci5hYm9ydChuZXcgRXJyb3IoJ3N0b3AgYmxvY2tlZCBHcmFwaFFMIHJlcXVlc3QnKSk7XG5cdFx0XHRhd2FpdCBhc3NlcnQucmVqZWN0cygoKSA9PiBibG9ja2VkR3JhcGhRTCwgL3N0b3AgYmxvY2tlZCBHcmFwaFFMIHJlcXVlc3QvKTtcblxuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRcdGRhdGE6IHJlc3BvbnNlLmRhdGEsXG5cdFx0XHRcdHBlbmRpbmdEZWxheXM6IHNjaGVkdWxlci5wZW5kaW5nQ291bnQsXG5cdFx0XHR9LCB7XG5cdFx0XHRcdGRhdGE6IHsgb2s6IHRydWUgfSxcblx0XHRcdFx0cGVuZGluZ0RlbGF5czogMCxcblx0XHRcdH0pO1xuXHRcdFx0c2VydmVyLmFzc2VydFNhdGlzZmllZCgpO1xuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdib3VuZHMgZG93bmxvYWRzIGFuZCByZWplY3RzIHVuc2FmZSByZWRpcmVjdCB0YXJnZXRzJywgYXN5bmMgKCkgPT4ge1xuXHRcdGF3YWl0IHdpdGhTZXJ2ZXIoYXN5bmMgc2VydmVyID0+IHtcblx0XHRcdHNlcnZlci5lbnF1ZXVlKFxuXHRcdFx0XHRnaXRIdWJSZXN0U3RlcCh7XG5cdFx0XHRcdFx0bWV0aG9kOiAnR0VUJyxcblx0XHRcdFx0XHRwYXRoOiAnL3JlcG9zL28vci9sb2cnLFxuXHRcdFx0XHRcdHJlc3BvbnNlOiBnaXRIdWJSYXdSZXNwb25zZSgnYWJjZGVmJyksXG5cdFx0XHRcdH0pLFxuXHRcdFx0XHRnaXRIdWJSZXN0U3RlcCh7XG5cdFx0XHRcdFx0bWV0aG9kOiAnR0VUJyxcblx0XHRcdFx0XHRwYXRoOiAnL3JlcG9zL28vci91bnNhZmUnLFxuXHRcdFx0XHRcdHJlc3BvbnNlOiBnaXRIdWJSZWRpcmVjdFJlc3BvbnNlKCdodHRwOi8vZXhhbXBsZS5pbnZhbGlkL3NpZ25lZC1sb2cnKSxcblx0XHRcdFx0fSksXG5cdFx0XHQpO1xuXHRcdFx0Y29uc3QgdHJhbnNwb3J0ID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBHaXRIdWJUcmFuc3BvcnQobm9kZUZldGNoKSk7XG5cblx0XHRcdGNvbnN0IGJvdW5kZWQgPSBhd2FpdCB0cmFuc3BvcnQuZG93bmxvYWQoYWNjb3VudEEsICd0b2tlbi1hJywge1xuXHRcdFx0XHR1cmw6IGAke3NlcnZlci5hcGlCYXNlVXJsfS9yZXBvcy9vL3IvbG9nYCxcblx0XHRcdFx0bWF4aW11bUJ5dGVzOiAzLFxuXHRcdFx0XHR0aW1lb3V0OiAxXzAwMCxcblx0XHRcdH0sIHNpZ25hbCgpKTtcblx0XHRcdGF3YWl0IGFzc2VydC5yZWplY3RzKFxuXHRcdFx0XHQoKSA9PiB0cmFuc3BvcnQuZG93bmxvYWQoYWNjb3VudEEsICd0b2tlbi1hJywge1xuXHRcdFx0XHRcdHVybDogYCR7c2VydmVyLmFwaUJhc2VVcmx9L3JlcG9zL28vci91bnNhZmVgLFxuXHRcdFx0XHRcdG1heGltdW1CeXRlczogMTAwLFxuXHRcdFx0XHRcdHRpbWVvdXQ6IDFfMDAwLFxuXHRcdFx0XHR9LCBzaWduYWwoKSksXG5cdFx0XHRcdGVycm9yID0+IGVycm9yIGluc3RhbmNlb2YgR2l0SHViUmVxdWVzdEVycm9yICYmIGVycm9yLmtpbmQgPT09ICdhdXRob3JpemF0aW9uJyxcblx0XHRcdCk7XG5cblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoYm91bmRlZCwge1xuXHRcdFx0XHR0ZXh0OiAnYWJjJyxcblx0XHRcdFx0dHJ1bmNhdGVkOiB0cnVlLFxuXHRcdFx0XHRzb3VyY2VVcmw6IGAke3NlcnZlci5hcGlCYXNlVXJsfS9yZXBvcy9vL3IvbG9nYCxcblx0XHRcdFx0Y29udGVudFR5cGU6ICdhcHBsaWNhdGlvbi9vY3RldC1zdHJlYW0nLFxuXHRcdFx0fSk7XG5cdFx0XHRzZXJ2ZXIuYXNzZXJ0U2F0aXNmaWVkKCk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3J1bnMgaGlnaGVyLXByaW9yaXR5IHF1ZXVlZCB3b3JrIGJlZm9yZSBvbGRlciBiYWNrZ3JvdW5kIHdvcmsnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgcXVldWUgPSBkaXNwb3NhYmxlcy5hZGQobmV3IEdpdEh1YlJlcXVlc3RRdWV1ZSgpKTtcblx0XHRjb25zdCBmaXJzdFJlbGVhc2UgPSBuZXcgRGVmZXJyZWRQcm9taXNlPHZvaWQ+KCk7XG5cdFx0Y29uc3Qgb3JkZXI6IHN0cmluZ1tdID0gW107XG5cdFx0Y29uc3QgZmlyc3QgPSBxdWV1ZS5lbnF1ZXVlKGFjY291bnRBLCAnYmFja2dyb3VuZCcsIHNpZ25hbCgpLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRvcmRlci5wdXNoKCdmaXJzdCcpO1xuXHRcdFx0YXdhaXQgZmlyc3RSZWxlYXNlLnA7XG5cdFx0fSk7XG5cdFx0Y29uc3QgYmFja2dyb3VuZCA9IHF1ZXVlLmVucXVldWUoYWNjb3VudEEsICdiYWNrZ3JvdW5kJywgc2lnbmFsKCksIGFzeW5jICgpID0+IHtcblx0XHRcdG9yZGVyLnB1c2goJ2JhY2tncm91bmQnKTtcblx0XHR9KTtcblx0XHRjb25zdCBpbnRlcmFjdGl2ZSA9IHF1ZXVlLmVucXVldWUoYWNjb3VudEEsICdpbnRlcmFjdGl2ZScsIHNpZ25hbCgpLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRvcmRlci5wdXNoKCdpbnRlcmFjdGl2ZScpO1xuXHRcdH0pO1xuXG5cdFx0YXdhaXQgZmlyc3RSZWxlYXNlLmNvbXBsZXRlKCk7XG5cdFx0YXdhaXQgUHJvbWlzZS5hbGwoW2ZpcnN0LCBiYWNrZ3JvdW5kLCBpbnRlcmFjdGl2ZV0pO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChvcmRlciwgWydmaXJzdCcsICdpbnRlcmFjdGl2ZScsICdiYWNrZ3JvdW5kJ10pO1xuXHR9KTtcbn0pO1xuIl0sCiAgIm1hcHBpbmdzIjogIkFBS0EsT0FBTyxZQUFZO0FBQ25CLFNBQVMsdUJBQXVCO0FBQ2hDLFNBQVMsK0NBQStDO0FBRXhELFNBQVMsMEJBQTBCO0FBQ25DLFNBQVMsb0JBQW9CLHVCQUF1QjtBQUNwRCxTQUFTLDJCQUEyQjtBQUNwQyxTQUFTLGlCQUFpQjtBQUMxQixTQUFTLHVCQUF1QixtQkFBbUIsb0JBQW9CLDJCQUEyQix5QkFBeUIsbUJBQW1CLHdCQUF3Qixn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
