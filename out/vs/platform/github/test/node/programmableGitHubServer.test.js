import assert from "assert";
import { DeferredPromise } from "../../../../base/common/async.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../base/test/common/utils.js";
import {
  gitHubDisconnectResponse,
  gitHubGraphQLResponse,
  gitHubGraphQLStep,
  gitHubJsonResponse,
  gitHubMalformedJsonResponse,
  gitHubNotModifiedResponse,
  gitHubRateLimitResponse,
  gitHubRedirectResponse,
  gitHubRestStep,
  ProgrammableGitHubServer
} from "./programmableGitHubServer.js";
import { nodeFetch } from "./nodeFetch.js";
suite("ProgrammableGitHubServer", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  async function withServer(fn) {
    const server = await ProgrammableGitHubServer.start();
    try {
      await fn(server);
    } finally {
      await server.disposeAsync();
    }
  }
  test("scripts ordered REST and GraphQL responses and captures requests", async () => {
    await withServer(async (server) => {
      server.enqueue(
        gitHubRestStep({
          method: "GET",
          path: "/repos/microsoft/vscode/pulls",
          query: { head: "octocat:feature/test", state: "all" },
          response: gitHubJsonResponse([{ number: 42 }], { etag: 'W/"pulls-1"', link: '</next>; rel="next"' })
        }),
        gitHubGraphQLStep({
          operationName: "EnableAutoMerge",
          queryIncludes: ["mutation EnableAutoMerge", "enablePullRequestAutoMerge"],
          response: gitHubGraphQLResponse(
            { enablePullRequestAutoMerge: { clientMutationId: null } },
            [{ message: "viewerPermission unavailable", path: ["repository", "viewerPermission"] }]
          )
        })
      );
      const restResponse = await nodeFetch(`${server.apiBaseUrl}/repos/microsoft/vscode/pulls?state=all&head=octocat%3Afeature%2Ftest`, {
        headers: { Authorization: "Bearer test-token" }
      });
      assert.deepStrictEqual({
        status: restResponse.status,
        etag: restResponse.headers.get("etag"),
        link: restResponse.headers.get("link"),
        body: await restResponse.json()
      }, {
        status: 200,
        etag: 'W/"pulls-1"',
        link: '</next>; rel="next"',
        body: [{ number: 42 }]
      });
      const graphQlResponse = await nodeFetch(server.graphQlUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          operationName: "EnableAutoMerge",
          query: "mutation EnableAutoMerge { enablePullRequestAutoMerge(input: {}) { clientMutationId } }",
          variables: { pullRequestId: "PR_node_42" }
        })
      });
      assert.deepStrictEqual(await graphQlResponse.json(), {
        data: { enablePullRequestAutoMerge: { clientMutationId: null } },
        errors: [{ message: "viewerPermission unavailable", path: ["repository", "viewerPermission"] }]
      });
      assert.deepStrictEqual(server.requests.map((request) => ({
        service: request.service,
        method: request.method,
        path: request.servicePath,
        search: request.search,
        authorization: request.headers.authorization,
        operationName: request.graphQl?.operationName,
        variables: request.graphQl?.variables
      })), [
        {
          service: "rest",
          method: "GET",
          path: "/repos/microsoft/vscode/pulls",
          search: "?state=all&head=octocat%3Afeature%2Ftest",
          authorization: "Bearer test-token",
          operationName: void 0,
          variables: void 0
        },
        {
          service: "graphql",
          method: "POST",
          path: "/",
          search: "",
          authorization: void 0,
          operationName: "EnableAutoMerge",
          variables: { pullRequestId: "PR_node_42" }
        }
      ]);
      server.assertSatisfied();
    });
  });
  test("supports etag revalidation and manual redirects", async () => {
    await withServer(async (server) => {
      server.enqueue(
        gitHubRestStep({
          method: "GET",
          path: "/repos/octo/repo/pulls",
          response: gitHubJsonResponse([{ number: 1 }], { etag: 'W/"etag-1"' })
        }),
        gitHubRestStep({
          method: "GET",
          path: "/repos/octo/repo/pulls",
          assert: (request) => assert.strictEqual(request.headers["if-none-match"], 'W/"etag-1"'),
          response: gitHubNotModifiedResponse({ etag: 'W/"etag-1"' })
        }),
        gitHubRestStep({
          method: "GET",
          path: "/repos/octo/repo/issues",
          response: gitHubRedirectResponse(`${server.apiBaseUrl}/repos/octo/repo/issues/42`, { status: 302 })
        }),
        gitHubRestStep({
          method: "GET",
          path: "/repos/octo/repo/issues/42",
          response: gitHubJsonResponse({ id: 42 })
        })
      );
      const first = await nodeFetch(`${server.apiBaseUrl}/repos/octo/repo/pulls`);
      assert.deepStrictEqual(await first.json(), [{ number: 1 }]);
      const second = await nodeFetch(`${server.apiBaseUrl}/repos/octo/repo/pulls`, {
        headers: { "If-None-Match": first.headers.get("etag") }
      });
      assert.deepStrictEqual({
        status: second.status,
        etag: second.headers.get("etag")
      }, {
        status: 304,
        etag: 'W/"etag-1"'
      });
      const redirected = await nodeFetch(`${server.apiBaseUrl}/repos/octo/repo/issues`, { redirect: "manual" });
      assert.strictEqual(redirected.status, 302);
      const followUp = await nodeFetch(redirected.headers.get("location"));
      assert.deepStrictEqual(await followUp.json(), { id: 42 });
      server.assertSatisfied();
    });
  });
  test("supports externally released delays, malformed payloads, rate limits, and disconnects", async () => {
    await withServer(async (server) => {
      const requestSeen = new DeferredPromise();
      const release = new DeferredPromise();
      server.enqueue(
        gitHubRestStep({
          method: "GET",
          path: "/repos/octo/repo/delayed",
          waitFor: release.p,
          assert: async () => {
            await requestSeen.complete();
          },
          response: gitHubJsonResponse({ ok: true })
        }),
        gitHubRestStep({
          method: "GET",
          path: "/repos/octo/repo/malformed",
          response: gitHubMalformedJsonResponse()
        }),
        gitHubRestStep({
          method: "GET",
          path: "/repos/octo/repo/limited",
          response: gitHubRateLimitResponse({
            status: 429,
            resource: "graphql",
            remaining: 0,
            resetAt: 175e10,
            retryAfterSeconds: 5
          })
        }),
        gitHubRestStep({
          method: "GET",
          path: "/repos/octo/repo/disconnect",
          response: gitHubDisconnectResponse()
        })
      );
      let delayedSettled = false;
      const delayed = nodeFetch(`${server.apiBaseUrl}/repos/octo/repo/delayed`).then(async (response) => {
        delayedSettled = true;
        return response.json();
      });
      await requestSeen.p;
      await Promise.resolve();
      assert.strictEqual(delayedSettled, false);
      await release.complete();
      assert.deepStrictEqual(await delayed, { ok: true });
      const malformed = await nodeFetch(`${server.apiBaseUrl}/repos/octo/repo/malformed`);
      assert.strictEqual(await malformed.text(), '{"malformed": true');
      const limited = await nodeFetch(`${server.apiBaseUrl}/repos/octo/repo/limited`);
      assert.deepStrictEqual({
        status: limited.status,
        retryAfter: limited.headers.get("retry-after"),
        resource: limited.headers.get("x-ratelimit-resource"),
        body: await limited.json()
      }, {
        status: 429,
        retryAfter: "5",
        resource: "graphql",
        body: { message: "You have exceeded a secondary rate limit." }
      });
      await assert.rejects(() => nodeFetch(`${server.apiBaseUrl}/repos/octo/repo/disconnect`));
      server.assertSatisfied();
    });
  });
  test("assertSatisfied reports unconsumed steps", async () => {
    await withServer(async (server) => {
      server.enqueue(gitHubRestStep({
        method: "GET",
        path: "/repos/octo/repo/unconsumed",
        response: gitHubJsonResponse({ ok: true })
      }));
      assert.throws(() => server.assertSatisfied(), /Unconsumed GitHub steps/);
    });
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxwbGF0Zm9ybVxcZ2l0aHViXFx0ZXN0XFxub2RlXFxwcm9ncmFtbWFibGVHaXRIdWJTZXJ2ZXIudGVzdC50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCBhc3NlcnQgZnJvbSAnYXNzZXJ0JztcbmltcG9ydCB7IERlZmVycmVkUHJvbWlzZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2FzeW5jLmpzJztcbmltcG9ydCB7IGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvdGVzdC9jb21tb24vdXRpbHMuanMnO1xuaW1wb3J0IHtcblx0Z2l0SHViRGlzY29ubmVjdFJlc3BvbnNlLFxuXHRnaXRIdWJHcmFwaFFMUmVzcG9uc2UsXG5cdGdpdEh1YkdyYXBoUUxTdGVwLFxuXHRnaXRIdWJKc29uUmVzcG9uc2UsXG5cdGdpdEh1Yk1hbGZvcm1lZEpzb25SZXNwb25zZSxcblx0Z2l0SHViTm90TW9kaWZpZWRSZXNwb25zZSxcblx0Z2l0SHViUmF0ZUxpbWl0UmVzcG9uc2UsXG5cdGdpdEh1YlJlZGlyZWN0UmVzcG9uc2UsXG5cdGdpdEh1YlJlc3RTdGVwLFxuXHRQcm9ncmFtbWFibGVHaXRIdWJTZXJ2ZXIsXG59IGZyb20gJy4vcHJvZ3JhbW1hYmxlR2l0SHViU2VydmVyLmpzJztcbmltcG9ydCB7IG5vZGVGZXRjaCB9IGZyb20gJy4vbm9kZUZldGNoLmpzJztcblxuc3VpdGUoJ1Byb2dyYW1tYWJsZUdpdEh1YlNlcnZlcicsICgpID0+IHtcblx0ZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlKCk7XG5cblx0YXN5bmMgZnVuY3Rpb24gd2l0aFNlcnZlcihmbjogKHNlcnZlcjogUHJvZ3JhbW1hYmxlR2l0SHViU2VydmVyKSA9PiBQcm9taXNlPHZvaWQ+KTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3Qgc2VydmVyID0gYXdhaXQgUHJvZ3JhbW1hYmxlR2l0SHViU2VydmVyLnN0YXJ0KCk7XG5cdFx0dHJ5IHtcblx0XHRcdGF3YWl0IGZuKHNlcnZlcik7XG5cdFx0fSBmaW5hbGx5IHtcblx0XHRcdGF3YWl0IHNlcnZlci5kaXNwb3NlQXN5bmMoKTtcblx0XHR9XG5cdH1cblxuXHR0ZXN0KCdzY3JpcHRzIG9yZGVyZWQgUkVTVCBhbmQgR3JhcGhRTCByZXNwb25zZXMgYW5kIGNhcHR1cmVzIHJlcXVlc3RzJywgYXN5bmMgKCkgPT4ge1xuXHRcdGF3YWl0IHdpdGhTZXJ2ZXIoYXN5bmMgc2VydmVyID0+IHtcblx0XHRcdHNlcnZlci5lbnF1ZXVlKFxuXHRcdFx0XHRnaXRIdWJSZXN0U3RlcCh7XG5cdFx0XHRcdFx0bWV0aG9kOiAnR0VUJyxcblx0XHRcdFx0XHRwYXRoOiAnL3JlcG9zL21pY3Jvc29mdC92c2NvZGUvcHVsbHMnLFxuXHRcdFx0XHRcdHF1ZXJ5OiB7IGhlYWQ6ICdvY3RvY2F0OmZlYXR1cmUvdGVzdCcsIHN0YXRlOiAnYWxsJyB9LFxuXHRcdFx0XHRcdHJlc3BvbnNlOiBnaXRIdWJKc29uUmVzcG9uc2UoW3sgbnVtYmVyOiA0MiB9XSwgeyBldGFnOiAnVy9cInB1bGxzLTFcIicsIGxpbms6ICc8L25leHQ+OyByZWw9XCJuZXh0XCInIH0pLFxuXHRcdFx0XHR9KSxcblx0XHRcdFx0Z2l0SHViR3JhcGhRTFN0ZXAoe1xuXHRcdFx0XHRcdG9wZXJhdGlvbk5hbWU6ICdFbmFibGVBdXRvTWVyZ2UnLFxuXHRcdFx0XHRcdHF1ZXJ5SW5jbHVkZXM6IFsnbXV0YXRpb24gRW5hYmxlQXV0b01lcmdlJywgJ2VuYWJsZVB1bGxSZXF1ZXN0QXV0b01lcmdlJ10sXG5cdFx0XHRcdFx0cmVzcG9uc2U6IGdpdEh1YkdyYXBoUUxSZXNwb25zZShcblx0XHRcdFx0XHRcdHsgZW5hYmxlUHVsbFJlcXVlc3RBdXRvTWVyZ2U6IHsgY2xpZW50TXV0YXRpb25JZDogbnVsbCB9IH0sXG5cdFx0XHRcdFx0XHRbeyBtZXNzYWdlOiAndmlld2VyUGVybWlzc2lvbiB1bmF2YWlsYWJsZScsIHBhdGg6IFsncmVwb3NpdG9yeScsICd2aWV3ZXJQZXJtaXNzaW9uJ10gfV0sXG5cdFx0XHRcdFx0KSxcblx0XHRcdFx0fSksXG5cdFx0XHQpO1xuXG5cdFx0XHRjb25zdCByZXN0UmVzcG9uc2UgPSBhd2FpdCBub2RlRmV0Y2goYCR7c2VydmVyLmFwaUJhc2VVcmx9L3JlcG9zL21pY3Jvc29mdC92c2NvZGUvcHVsbHM/c3RhdGU9YWxsJmhlYWQ9b2N0b2NhdCUzQWZlYXR1cmUlMkZ0ZXN0YCwge1xuXHRcdFx0XHRoZWFkZXJzOiB7IEF1dGhvcml6YXRpb246ICdCZWFyZXIgdGVzdC10b2tlbicgfSxcblx0XHRcdH0pO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRcdHN0YXR1czogcmVzdFJlc3BvbnNlLnN0YXR1cyxcblx0XHRcdFx0ZXRhZzogcmVzdFJlc3BvbnNlLmhlYWRlcnMuZ2V0KCdldGFnJyksXG5cdFx0XHRcdGxpbms6IHJlc3RSZXNwb25zZS5oZWFkZXJzLmdldCgnbGluaycpLFxuXHRcdFx0XHRib2R5OiBhd2FpdCByZXN0UmVzcG9uc2UuanNvbigpLFxuXHRcdFx0fSwge1xuXHRcdFx0XHRzdGF0dXM6IDIwMCxcblx0XHRcdFx0ZXRhZzogJ1cvXCJwdWxscy0xXCInLFxuXHRcdFx0XHRsaW5rOiAnPC9uZXh0PjsgcmVsPVwibmV4dFwiJyxcblx0XHRcdFx0Ym9keTogW3sgbnVtYmVyOiA0MiB9XSxcblx0XHRcdH0pO1xuXG5cdFx0XHRjb25zdCBncmFwaFFsUmVzcG9uc2UgPSBhd2FpdCBub2RlRmV0Y2goc2VydmVyLmdyYXBoUWxVcmwsIHtcblx0XHRcdFx0bWV0aG9kOiAnUE9TVCcsXG5cdFx0XHRcdGhlYWRlcnM6IHsgJ0NvbnRlbnQtVHlwZSc6ICdhcHBsaWNhdGlvbi9qc29uJyB9LFxuXHRcdFx0XHRib2R5OiBKU09OLnN0cmluZ2lmeSh7XG5cdFx0XHRcdFx0b3BlcmF0aW9uTmFtZTogJ0VuYWJsZUF1dG9NZXJnZScsXG5cdFx0XHRcdFx0cXVlcnk6ICdtdXRhdGlvbiBFbmFibGVBdXRvTWVyZ2UgeyBlbmFibGVQdWxsUmVxdWVzdEF1dG9NZXJnZShpbnB1dDoge30pIHsgY2xpZW50TXV0YXRpb25JZCB9IH0nLFxuXHRcdFx0XHRcdHZhcmlhYmxlczogeyBwdWxsUmVxdWVzdElkOiAnUFJfbm9kZV80MicgfSxcblx0XHRcdFx0fSksXG5cdFx0XHR9KTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoYXdhaXQgZ3JhcGhRbFJlc3BvbnNlLmpzb24oKSwge1xuXHRcdFx0XHRkYXRhOiB7IGVuYWJsZVB1bGxSZXF1ZXN0QXV0b01lcmdlOiB7IGNsaWVudE11dGF0aW9uSWQ6IG51bGwgfSB9LFxuXHRcdFx0XHRlcnJvcnM6IFt7IG1lc3NhZ2U6ICd2aWV3ZXJQZXJtaXNzaW9uIHVuYXZhaWxhYmxlJywgcGF0aDogWydyZXBvc2l0b3J5JywgJ3ZpZXdlclBlcm1pc3Npb24nXSB9XSxcblx0XHRcdH0pO1xuXG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHNlcnZlci5yZXF1ZXN0cy5tYXAocmVxdWVzdCA9PiAoe1xuXHRcdFx0XHRzZXJ2aWNlOiByZXF1ZXN0LnNlcnZpY2UsXG5cdFx0XHRcdG1ldGhvZDogcmVxdWVzdC5tZXRob2QsXG5cdFx0XHRcdHBhdGg6IHJlcXVlc3Quc2VydmljZVBhdGgsXG5cdFx0XHRcdHNlYXJjaDogcmVxdWVzdC5zZWFyY2gsXG5cdFx0XHRcdGF1dGhvcml6YXRpb246IHJlcXVlc3QuaGVhZGVycy5hdXRob3JpemF0aW9uLFxuXHRcdFx0XHRvcGVyYXRpb25OYW1lOiByZXF1ZXN0LmdyYXBoUWw/Lm9wZXJhdGlvbk5hbWUsXG5cdFx0XHRcdHZhcmlhYmxlczogcmVxdWVzdC5ncmFwaFFsPy52YXJpYWJsZXMsXG5cdFx0XHR9KSksIFtcblx0XHRcdFx0e1xuXHRcdFx0XHRcdHNlcnZpY2U6ICdyZXN0Jyxcblx0XHRcdFx0XHRtZXRob2Q6ICdHRVQnLFxuXHRcdFx0XHRcdHBhdGg6ICcvcmVwb3MvbWljcm9zb2Z0L3ZzY29kZS9wdWxscycsXG5cdFx0XHRcdFx0c2VhcmNoOiAnP3N0YXRlPWFsbCZoZWFkPW9jdG9jYXQlM0FmZWF0dXJlJTJGdGVzdCcsXG5cdFx0XHRcdFx0YXV0aG9yaXphdGlvbjogJ0JlYXJlciB0ZXN0LXRva2VuJyxcblx0XHRcdFx0XHRvcGVyYXRpb25OYW1lOiB1bmRlZmluZWQsXG5cdFx0XHRcdFx0dmFyaWFibGVzOiB1bmRlZmluZWQsXG5cdFx0XHRcdH0sXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRzZXJ2aWNlOiAnZ3JhcGhxbCcsXG5cdFx0XHRcdFx0bWV0aG9kOiAnUE9TVCcsXG5cdFx0XHRcdFx0cGF0aDogJy8nLFxuXHRcdFx0XHRcdHNlYXJjaDogJycsXG5cdFx0XHRcdFx0YXV0aG9yaXphdGlvbjogdW5kZWZpbmVkLFxuXHRcdFx0XHRcdG9wZXJhdGlvbk5hbWU6ICdFbmFibGVBdXRvTWVyZ2UnLFxuXHRcdFx0XHRcdHZhcmlhYmxlczogeyBwdWxsUmVxdWVzdElkOiAnUFJfbm9kZV80MicgfSxcblx0XHRcdFx0fSxcblx0XHRcdF0pO1xuXG5cdFx0XHRzZXJ2ZXIuYXNzZXJ0U2F0aXNmaWVkKCk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3N1cHBvcnRzIGV0YWcgcmV2YWxpZGF0aW9uIGFuZCBtYW51YWwgcmVkaXJlY3RzJywgYXN5bmMgKCkgPT4ge1xuXHRcdGF3YWl0IHdpdGhTZXJ2ZXIoYXN5bmMgc2VydmVyID0+IHtcblx0XHRcdHNlcnZlci5lbnF1ZXVlKFxuXHRcdFx0XHRnaXRIdWJSZXN0U3RlcCh7XG5cdFx0XHRcdFx0bWV0aG9kOiAnR0VUJyxcblx0XHRcdFx0XHRwYXRoOiAnL3JlcG9zL29jdG8vcmVwby9wdWxscycsXG5cdFx0XHRcdFx0cmVzcG9uc2U6IGdpdEh1Ykpzb25SZXNwb25zZShbeyBudW1iZXI6IDEgfV0sIHsgZXRhZzogJ1cvXCJldGFnLTFcIicgfSksXG5cdFx0XHRcdH0pLFxuXHRcdFx0XHRnaXRIdWJSZXN0U3RlcCh7XG5cdFx0XHRcdFx0bWV0aG9kOiAnR0VUJyxcblx0XHRcdFx0XHRwYXRoOiAnL3JlcG9zL29jdG8vcmVwby9wdWxscycsXG5cdFx0XHRcdFx0YXNzZXJ0OiByZXF1ZXN0ID0+IGFzc2VydC5zdHJpY3RFcXVhbChyZXF1ZXN0LmhlYWRlcnNbJ2lmLW5vbmUtbWF0Y2gnXSwgJ1cvXCJldGFnLTFcIicpLFxuXHRcdFx0XHRcdHJlc3BvbnNlOiBnaXRIdWJOb3RNb2RpZmllZFJlc3BvbnNlKHsgZXRhZzogJ1cvXCJldGFnLTFcIicgfSksXG5cdFx0XHRcdH0pLFxuXHRcdFx0XHRnaXRIdWJSZXN0U3RlcCh7XG5cdFx0XHRcdFx0bWV0aG9kOiAnR0VUJyxcblx0XHRcdFx0XHRwYXRoOiAnL3JlcG9zL29jdG8vcmVwby9pc3N1ZXMnLFxuXHRcdFx0XHRcdHJlc3BvbnNlOiBnaXRIdWJSZWRpcmVjdFJlc3BvbnNlKGAke3NlcnZlci5hcGlCYXNlVXJsfS9yZXBvcy9vY3RvL3JlcG8vaXNzdWVzLzQyYCwgeyBzdGF0dXM6IDMwMiB9KSxcblx0XHRcdFx0fSksXG5cdFx0XHRcdGdpdEh1YlJlc3RTdGVwKHtcblx0XHRcdFx0XHRtZXRob2Q6ICdHRVQnLFxuXHRcdFx0XHRcdHBhdGg6ICcvcmVwb3Mvb2N0by9yZXBvL2lzc3Vlcy80MicsXG5cdFx0XHRcdFx0cmVzcG9uc2U6IGdpdEh1Ykpzb25SZXNwb25zZSh7IGlkOiA0MiB9KSxcblx0XHRcdFx0fSksXG5cdFx0XHQpO1xuXG5cdFx0XHRjb25zdCBmaXJzdCA9IGF3YWl0IG5vZGVGZXRjaChgJHtzZXJ2ZXIuYXBpQmFzZVVybH0vcmVwb3Mvb2N0by9yZXBvL3B1bGxzYCk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGF3YWl0IGZpcnN0Lmpzb24oKSwgW3sgbnVtYmVyOiAxIH1dKTtcblxuXHRcdFx0Y29uc3Qgc2Vjb25kID0gYXdhaXQgbm9kZUZldGNoKGAke3NlcnZlci5hcGlCYXNlVXJsfS9yZXBvcy9vY3RvL3JlcG8vcHVsbHNgLCB7XG5cdFx0XHRcdGhlYWRlcnM6IHsgJ0lmLU5vbmUtTWF0Y2gnOiBmaXJzdC5oZWFkZXJzLmdldCgnZXRhZycpISB9LFxuXHRcdFx0fSk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdFx0c3RhdHVzOiBzZWNvbmQuc3RhdHVzLFxuXHRcdFx0XHRldGFnOiBzZWNvbmQuaGVhZGVycy5nZXQoJ2V0YWcnKSxcblx0XHRcdH0sIHtcblx0XHRcdFx0c3RhdHVzOiAzMDQsXG5cdFx0XHRcdGV0YWc6ICdXL1wiZXRhZy0xXCInLFxuXHRcdFx0fSk7XG5cblx0XHRcdGNvbnN0IHJlZGlyZWN0ZWQgPSBhd2FpdCBub2RlRmV0Y2goYCR7c2VydmVyLmFwaUJhc2VVcmx9L3JlcG9zL29jdG8vcmVwby9pc3N1ZXNgLCB7IHJlZGlyZWN0OiAnbWFudWFsJyB9KTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZWRpcmVjdGVkLnN0YXR1cywgMzAyKTtcblxuXHRcdFx0Y29uc3QgZm9sbG93VXAgPSBhd2FpdCBub2RlRmV0Y2gocmVkaXJlY3RlZC5oZWFkZXJzLmdldCgnbG9jYXRpb24nKSEpO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChhd2FpdCBmb2xsb3dVcC5qc29uKCksIHsgaWQ6IDQyIH0pO1xuXG5cdFx0XHRzZXJ2ZXIuYXNzZXJ0U2F0aXNmaWVkKCk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3N1cHBvcnRzIGV4dGVybmFsbHkgcmVsZWFzZWQgZGVsYXlzLCBtYWxmb3JtZWQgcGF5bG9hZHMsIHJhdGUgbGltaXRzLCBhbmQgZGlzY29ubmVjdHMnLCBhc3luYyAoKSA9PiB7XG5cdFx0YXdhaXQgd2l0aFNlcnZlcihhc3luYyBzZXJ2ZXIgPT4ge1xuXHRcdFx0Y29uc3QgcmVxdWVzdFNlZW4gPSBuZXcgRGVmZXJyZWRQcm9taXNlPHZvaWQ+KCk7XG5cdFx0XHRjb25zdCByZWxlYXNlID0gbmV3IERlZmVycmVkUHJvbWlzZTx2b2lkPigpO1xuXG5cdFx0XHRzZXJ2ZXIuZW5xdWV1ZShcblx0XHRcdFx0Z2l0SHViUmVzdFN0ZXAoe1xuXHRcdFx0XHRcdG1ldGhvZDogJ0dFVCcsXG5cdFx0XHRcdFx0cGF0aDogJy9yZXBvcy9vY3RvL3JlcG8vZGVsYXllZCcsXG5cdFx0XHRcdFx0d2FpdEZvcjogcmVsZWFzZS5wLFxuXHRcdFx0XHRcdGFzc2VydDogYXN5bmMgKCkgPT4ge1xuXHRcdFx0XHRcdFx0YXdhaXQgcmVxdWVzdFNlZW4uY29tcGxldGUoKTtcblx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdHJlc3BvbnNlOiBnaXRIdWJKc29uUmVzcG9uc2UoeyBvazogdHJ1ZSB9KSxcblx0XHRcdFx0fSksXG5cdFx0XHRcdGdpdEh1YlJlc3RTdGVwKHtcblx0XHRcdFx0XHRtZXRob2Q6ICdHRVQnLFxuXHRcdFx0XHRcdHBhdGg6ICcvcmVwb3Mvb2N0by9yZXBvL21hbGZvcm1lZCcsXG5cdFx0XHRcdFx0cmVzcG9uc2U6IGdpdEh1Yk1hbGZvcm1lZEpzb25SZXNwb25zZSgpLFxuXHRcdFx0XHR9KSxcblx0XHRcdFx0Z2l0SHViUmVzdFN0ZXAoe1xuXHRcdFx0XHRcdG1ldGhvZDogJ0dFVCcsXG5cdFx0XHRcdFx0cGF0aDogJy9yZXBvcy9vY3RvL3JlcG8vbGltaXRlZCcsXG5cdFx0XHRcdFx0cmVzcG9uc2U6IGdpdEh1YlJhdGVMaW1pdFJlc3BvbnNlKHtcblx0XHRcdFx0XHRcdHN0YXR1czogNDI5LFxuXHRcdFx0XHRcdFx0cmVzb3VyY2U6ICdncmFwaHFsJyxcblx0XHRcdFx0XHRcdHJlbWFpbmluZzogMCxcblx0XHRcdFx0XHRcdHJlc2V0QXQ6IDFfNzUwXzAwMF8wMDBfMDAwLFxuXHRcdFx0XHRcdFx0cmV0cnlBZnRlclNlY29uZHM6IDUsXG5cdFx0XHRcdFx0fSksXG5cdFx0XHRcdH0pLFxuXHRcdFx0XHRnaXRIdWJSZXN0U3RlcCh7XG5cdFx0XHRcdFx0bWV0aG9kOiAnR0VUJyxcblx0XHRcdFx0XHRwYXRoOiAnL3JlcG9zL29jdG8vcmVwby9kaXNjb25uZWN0Jyxcblx0XHRcdFx0XHRyZXNwb25zZTogZ2l0SHViRGlzY29ubmVjdFJlc3BvbnNlKCksXG5cdFx0XHRcdH0pLFxuXHRcdFx0KTtcblxuXHRcdFx0bGV0IGRlbGF5ZWRTZXR0bGVkID0gZmFsc2U7XG5cdFx0XHRjb25zdCBkZWxheWVkID0gbm9kZUZldGNoKGAke3NlcnZlci5hcGlCYXNlVXJsfS9yZXBvcy9vY3RvL3JlcG8vZGVsYXllZGApLnRoZW4oYXN5bmMgcmVzcG9uc2UgPT4ge1xuXHRcdFx0XHRkZWxheWVkU2V0dGxlZCA9IHRydWU7XG5cdFx0XHRcdHJldHVybiByZXNwb25zZS5qc29uKCk7XG5cdFx0XHR9KTtcblxuXHRcdFx0YXdhaXQgcmVxdWVzdFNlZW4ucDtcblx0XHRcdGF3YWl0IFByb21pc2UucmVzb2x2ZSgpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGRlbGF5ZWRTZXR0bGVkLCBmYWxzZSk7XG5cblx0XHRcdGF3YWl0IHJlbGVhc2UuY29tcGxldGUoKTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoYXdhaXQgZGVsYXllZCwgeyBvazogdHJ1ZSB9KTtcblxuXHRcdFx0Y29uc3QgbWFsZm9ybWVkID0gYXdhaXQgbm9kZUZldGNoKGAke3NlcnZlci5hcGlCYXNlVXJsfS9yZXBvcy9vY3RvL3JlcG8vbWFsZm9ybWVkYCk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYXdhaXQgbWFsZm9ybWVkLnRleHQoKSwgJ3tcIm1hbGZvcm1lZFwiOiB0cnVlJyk7XG5cblx0XHRcdGNvbnN0IGxpbWl0ZWQgPSBhd2FpdCBub2RlRmV0Y2goYCR7c2VydmVyLmFwaUJhc2VVcmx9L3JlcG9zL29jdG8vcmVwby9saW1pdGVkYCk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdFx0c3RhdHVzOiBsaW1pdGVkLnN0YXR1cyxcblx0XHRcdFx0cmV0cnlBZnRlcjogbGltaXRlZC5oZWFkZXJzLmdldCgncmV0cnktYWZ0ZXInKSxcblx0XHRcdFx0cmVzb3VyY2U6IGxpbWl0ZWQuaGVhZGVycy5nZXQoJ3gtcmF0ZWxpbWl0LXJlc291cmNlJyksXG5cdFx0XHRcdGJvZHk6IGF3YWl0IGxpbWl0ZWQuanNvbigpLFxuXHRcdFx0fSwge1xuXHRcdFx0XHRzdGF0dXM6IDQyOSxcblx0XHRcdFx0cmV0cnlBZnRlcjogJzUnLFxuXHRcdFx0XHRyZXNvdXJjZTogJ2dyYXBocWwnLFxuXHRcdFx0XHRib2R5OiB7IG1lc3NhZ2U6ICdZb3UgaGF2ZSBleGNlZWRlZCBhIHNlY29uZGFyeSByYXRlIGxpbWl0LicgfSxcblx0XHRcdH0pO1xuXG5cdFx0XHRhd2FpdCBhc3NlcnQucmVqZWN0cygoKSA9PiBub2RlRmV0Y2goYCR7c2VydmVyLmFwaUJhc2VVcmx9L3JlcG9zL29jdG8vcmVwby9kaXNjb25uZWN0YCkpO1xuXHRcdFx0c2VydmVyLmFzc2VydFNhdGlzZmllZCgpO1xuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdhc3NlcnRTYXRpc2ZpZWQgcmVwb3J0cyB1bmNvbnN1bWVkIHN0ZXBzJywgYXN5bmMgKCkgPT4ge1xuXHRcdGF3YWl0IHdpdGhTZXJ2ZXIoYXN5bmMgc2VydmVyID0+IHtcblx0XHRcdHNlcnZlci5lbnF1ZXVlKGdpdEh1YlJlc3RTdGVwKHtcblx0XHRcdFx0bWV0aG9kOiAnR0VUJyxcblx0XHRcdFx0cGF0aDogJy9yZXBvcy9vY3RvL3JlcG8vdW5jb25zdW1lZCcsXG5cdFx0XHRcdHJlc3BvbnNlOiBnaXRIdWJKc29uUmVzcG9uc2UoeyBvazogdHJ1ZSB9KSxcblx0XHRcdH0pKTtcblxuXHRcdFx0YXNzZXJ0LnRocm93cygoKSA9PiBzZXJ2ZXIuYXNzZXJ0U2F0aXNmaWVkKCksIC9VbmNvbnN1bWVkIEdpdEh1YiBzdGVwcy8pO1xuXHRcdH0pO1xuXHR9KTtcbn0pO1xuIl0sCiAgIm1hcHBpbmdzIjogIkFBS0EsT0FBTyxZQUFZO0FBQ25CLFNBQVMsdUJBQXVCO0FBQ2hDLFNBQVMsK0NBQStDO0FBQ3hEO0FBQUEsRUFDQztBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLE9BQ007QUFDUCxTQUFTLGlCQUFpQjtBQUUxQixNQUFNLDRCQUE0QixNQUFNO0FBQ3ZDLDBDQUF3QztBQUV4QyxpQkFBZSxXQUFXLElBQXdFO0FBQ2pHLFVBQU0sU0FBUyxNQUFNLHlCQUF5QixNQUFNO0FBQ3BELFFBQUk7QUFDSCxZQUFNLEdBQUcsTUFBTTtBQUFBLElBQ2hCLFVBQUU7QUFDRCxZQUFNLE9BQU8sYUFBYTtBQUFBLElBQzNCO0FBQUEsRUFDRDtBQUVBLE9BQUssb0VBQW9FLFlBQVk7QUFDcEYsVUFBTSxXQUFXLE9BQU0sV0FBVTtBQUNoQyxhQUFPO0FBQUEsUUFDTixlQUFlO0FBQUEsVUFDZCxRQUFRO0FBQUEsVUFDUixNQUFNO0FBQUEsVUFDTixPQUFPLEVBQUUsTUFBTSx3QkFBd0IsT0FBTyxNQUFNO0FBQUEsVUFDcEQsVUFBVSxtQkFBbUIsQ0FBQyxFQUFFLFFBQVEsR0FBRyxDQUFDLEdBQUcsRUFBRSxNQUFNLGVBQWUsTUFBTSxzQkFB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
