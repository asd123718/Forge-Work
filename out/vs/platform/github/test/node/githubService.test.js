import assert from "assert";
import { Emitter, Event } from "../../../../base/common/event.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../base/test/common/utils.js";
import { NullLogService } from "../../../log/common/log.js";
import { GitHubCredentialService } from "../../common/githubCredentialService.js";
import { GitHubHostCapabilitiesService } from "../../common/githubHostCapabilitiesService.js";
import { GitHubQueryService } from "../../common/githubQueryServiceImpl.js";
import { GitHubService } from "../../common/githubService.js";
import { GitHubTransport } from "../../common/githubTransport.js";
import { PullRequestMutationService } from "../../common/pullRequestMutationService.js";
import { PullRequestResourceService } from "../../common/pullRequestResourceService.js";
import { nodeFetch } from "./nodeFetch.js";
import { gitHubJsonResponse, gitHubRestStep, ProgrammableGitHubServer } from "./programmableGitHubServer.js";
class TestLogService extends NullLogService {
  constructor() {
    super(...arguments);
    this.messages = [];
  }
  trace(message, ...args) {
    this.messages.push([message, ...args].join(" "));
  }
  debug(message, ...args) {
    this.messages.push([message, ...args].join(" "));
  }
}
suite("GitHubService", () => {
  const disposables = ensureNoDisposablesAreLeakedInTestSuite();
  async function withServer(fn) {
    const server = await ProgrammableGitHubServer.start();
    try {
      await fn(server);
    } finally {
      await server.disposeAsync();
    }
  }
  test("owns the complete GitHub component graph behind one service", () => {
    const service = disposables.add(new GitHubService(
      {
        endpoint: {
          onDidChange: Event.None,
          getApiBaseUri: () => "https://api.github.com",
          getGraphQlUri: () => "https://api.github.com/graphql"
        },
        tokenProvider: {
          getToken: () => void 0
        }
      },
      new NullLogService()
    ));
    assert.deepStrictEqual({
      transport: service.transport instanceof GitHubTransport,
      endpoint: service.endpoint.getApiBaseUri(),
      credentials: service.credentials instanceof GitHubCredentialService,
      capabilities: service.capabilities instanceof GitHubHostCapabilitiesService,
      query: service.query instanceof GitHubQueryService,
      pullRequests: service.pullRequests instanceof PullRequestResourceService,
      mutations: service.mutations instanceof PullRequestMutationService
    }, {
      transport: true,
      endpoint: "https://api.github.com",
      credentials: true,
      capabilities: true,
      query: true,
      pullRequests: true,
      mutations: true
    });
  });
  test("logs service, credential, transport, and resource lifecycle without sensitive payloads", async () => {
    await withServer(async (server) => {
      server.enqueue(
        gitHubRestStep({ method: "GET", path: "/user", response: gitHubJsonResponse({ id: 101, private: "response-secret" }) }),
        gitHubRestStep({ method: "GET", path: "/repos/o/r/pulls/7", response: gitHubJsonResponse(pullRequestResponse("private-title")) })
      );
      const logService = new TestLogService();
      const service = new GitHubService({
        endpoint: server.createEndpointService(),
        tokenProvider: { getToken: () => "token-secret" },
        fetch: nodeFetch
      }, logService);
      try {
        const subscription = service.pullRequests.subscribePullRequest({
          host: new URL(server.apiBaseUrl).host,
          accountId: "101",
          owner: "o",
          repo: "r",
          number: 7
        }, { priority: "interactive" });
        await subscription.refresh("core");
        subscription.dispose();
        assert.deepStrictEqual({
          initialized: logService.messages.some((message) => message.includes("[GitHubService] Reusable GitHub service initialized")),
          credential: logService.messages.some((message) => message.includes("[GitHubCredentialService] Resolved account identity")),
          transport: logService.messages.some((message) => message.includes("[GitHubTransport] REST GET") && message.includes("/repos/o/r/pulls/7")),
          resource: logService.messages.some((message) => message.includes("[PullRequestResourceService] Refreshed core")),
          containsToken: logService.messages.some((message) => message.includes("token-secret")),
          containsResponse: logService.messages.some((message) => message.includes("response-secret") || message.includes("private-title"))
        }, {
          initialized: true,
          credential: true,
          transport: true,
          resource: true,
          containsToken: false,
          containsResponse: false
        });
        server.assertSatisfied();
      } finally {
        service.dispose();
      }
    });
  });
  test("keeps pull request subscriptions alive across same-account token rotation", async () => {
    await withServer(async (server) => {
      server.enqueue(
        gitHubRestStep({ method: "GET", path: "/user", response: gitHubJsonResponse({ id: 101 }) }),
        gitHubRestStep({ method: "GET", path: "/repos/o/r/pulls/7", response: gitHubJsonResponse(pullRequestResponse("First")) }),
        gitHubRestStep({ method: "GET", path: "/user", response: gitHubJsonResponse({ id: 101 }) }),
        gitHubRestStep({ method: "GET", path: "/repos/o/r/pulls/7", response: gitHubJsonResponse(pullRequestResponse("Second")) })
      );
      let token = "token-1";
      const service = disposables.add(new GitHubService({
        endpoint: server.createEndpointService(),
        tokenProvider: { getToken: () => token },
        fetch: nodeFetch
      }, new NullLogService()));
      const ref = {
        host: new URL(server.apiBaseUrl).host,
        accountId: "101",
        owner: "o",
        repo: "r",
        number: 7
      };
      const subscription = disposables.add(service.pullRequests.subscribePullRequest(ref, {
        priority: "interactive"
      }));
      await subscription.refresh("core");
      const resource = subscription.resource;
      token = "token-2";
      await subscription.refresh("core");
      assert.deepStrictEqual({
        sameResource: subscription.resource === resource,
        title: subscription.resource.snapshot.get().core.value?.title,
        status: subscription.resource.snapshot.get().core.status,
        requestCount: server.requests.length
      }, {
        sameResource: true,
        title: "Second",
        status: "ready",
        requestCount: 4
      });
      server.assertSatisfied();
    });
  });
  test("uses the browser global fetch safely when no fetch is supplied", async () => {
    await withServer(async (server) => {
      server.enqueue(gitHubRestStep({ method: "GET", path: "/user", response: gitHubJsonResponse({ id: 101 }) }));
      const service = disposables.add(new GitHubService({
        endpoint: server.createEndpointService(),
        tokenProvider: { getToken: () => "token" }
      }, new NullLogService()));
      const credential = await service.credentials.getCredential(new AbortController().signal);
      assert.deepStrictEqual(credential.account, {
        host: new URL(server.apiBaseUrl).host,
        accountId: "101"
      });
      server.assertSatisfied();
    });
  });
  test("keeps subscriptions alive across authentication expiry and reauthentication", async () => {
    await withServer(async (server) => {
      server.enqueue(
        gitHubRestStep({ method: "GET", path: "/user", response: gitHubJsonResponse({ id: 101 }) }),
        gitHubRestStep({ method: "GET", path: "/repos/o/r/pulls/7", response: gitHubJsonResponse(pullRequestResponse("First")) }),
        gitHubRestStep({ method: "GET", path: "/repos/o/r/pulls/7", response: gitHubJsonResponse({ message: "Bad credentials" }, { status: 401 }) }),
        gitHubRestStep({ method: "GET", path: "/user", response: gitHubJsonResponse({ id: 101 }) }),
        gitHubRestStep({ method: "GET", path: "/repos/o/r/pulls/7", response: gitHubJsonResponse(pullRequestResponse("Second")) })
      );
      let token = "token-1";
      const onDidChangeToken = disposables.add(new Emitter());
      const service = disposables.add(new GitHubService({
        endpoint: server.createEndpointService(),
        tokenProvider: {
          onDidChangeToken: onDidChangeToken.event,
          getToken: () => token,
          invalidateToken: (invalidated) => {
            if (invalidated === token) {
              token = void 0;
            }
          }
        },
        fetch: nodeFetch
      }, new NullLogService()));
      const subscription = disposables.add(service.pullRequests.subscribePullRequest({
        host: new URL(server.apiBaseUrl).host,
        accountId: "101",
        owner: "o",
        repo: "r",
        number: 7
      }, {
        priority: "interactive"
      }));
      await subscription.refresh("core");
      await assert.rejects(() => subscription.refresh("core"), /Bad credentials/);
      assert.doesNotThrow(() => subscription.update({ priority: "visible" }));
      token = "token-2";
      onDidChangeToken.fire();
      await subscription.refresh("core");
      assert.deepStrictEqual({
        title: subscription.resource.snapshot.get().core.value?.title,
        status: subscription.resource.snapshot.get().core.status,
        requestCount: server.requests.length
      }, {
        title: "Second",
        status: "ready",
        requestCount: 5
      });
      server.assertSatisfied();
    });
  });
  test("does not invalidate a valid token for a mismatched account resource", async () => {
    await withServer(async (server) => {
      server.enqueue(gitHubRestStep({ method: "GET", path: "/user", response: gitHubJsonResponse({ id: 202 }) }));
      let token = "token";
      const invalidatedTokens = [];
      const service = disposables.add(new GitHubService({
        endpoint: server.createEndpointService(),
        tokenProvider: {
          getToken: () => token,
          invalidateToken: (invalidated) => {
            invalidatedTokens.push(invalidated);
            token = void 0;
          }
        },
        fetch: nodeFetch
      }, new NullLogService()));
      const subscription = disposables.add(service.pullRequests.subscribePullRequest({
        host: new URL(server.apiBaseUrl).host,
        accountId: "101",
        owner: "o",
        repo: "r",
        number: 7
      }, {
        priority: "interactive"
      }));
      await assert.rejects(() => subscription.refresh("core"), /does not match the current GitHub credential/);
      assert.deepStrictEqual({
        token,
        invalidatedTokens,
        requestCount: server.requests.length
      }, {
        token: "token",
        invalidatedTokens: [],
        requestCount: 1
      });
      server.assertSatisfied();
    });
  });
});
function pullRequestResponse(title) {
  return {
    node_id: "PR7",
    number: 7,
    title,
    body: "",
    html_url: "https://example.test/o/r/pull/7",
    state: "open",
    merged: false,
    draft: false,
    user: { id: 1, login: "author" },
    head: { sha: "head", ref: "feature" },
    base: {
      sha: "base",
      ref: "main",
      repo: { node_id: "R1", full_name: "o/r" }
    }
  };
}
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxwbGF0Zm9ybVxcZ2l0aHViXFx0ZXN0XFxub2RlXFxnaXRodWJTZXJ2aWNlLnRlc3QudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgYXNzZXJ0IGZyb20gJ2Fzc2VydCc7XG5pbXBvcnQgeyBFbWl0dGVyLCBFdmVudCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2V2ZW50LmpzJztcbmltcG9ydCB7IGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvdGVzdC9jb21tb24vdXRpbHMuanMnO1xuaW1wb3J0IHsgTnVsbExvZ1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9sb2cvY29tbW9uL2xvZy5qcyc7XG5pbXBvcnQgeyBHaXRIdWJDcmVkZW50aWFsU2VydmljZSB9IGZyb20gJy4uLy4uL2NvbW1vbi9naXRodWJDcmVkZW50aWFsU2VydmljZS5qcyc7XG5pbXBvcnQgeyBHaXRIdWJIb3N0Q2FwYWJpbGl0aWVzU2VydmljZSB9IGZyb20gJy4uLy4uL2NvbW1vbi9naXRodWJIb3N0Q2FwYWJpbGl0aWVzU2VydmljZS5qcyc7XG5pbXBvcnQgeyBHaXRIdWJRdWVyeVNlcnZpY2UgfSBmcm9tICcuLi8uLi9jb21tb24vZ2l0aHViUXVlcnlTZXJ2aWNlSW1wbC5qcyc7XG5pbXBvcnQgeyBHaXRIdWJTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vY29tbW9uL2dpdGh1YlNlcnZpY2UuanMnO1xuaW1wb3J0IHsgR2l0SHViVHJhbnNwb3J0IH0gZnJvbSAnLi4vLi4vY29tbW9uL2dpdGh1YlRyYW5zcG9ydC5qcyc7XG5pbXBvcnQgeyBQdWxsUmVxdWVzdE11dGF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uL2NvbW1vbi9wdWxsUmVxdWVzdE11dGF0aW9uU2VydmljZS5qcyc7XG5pbXBvcnQgeyBQdWxsUmVxdWVzdFJlc291cmNlU2VydmljZSB9IGZyb20gJy4uLy4uL2NvbW1vbi9wdWxsUmVxdWVzdFJlc291cmNlU2VydmljZS5qcyc7XG5pbXBvcnQgeyBub2RlRmV0Y2ggfSBmcm9tICcuL25vZGVGZXRjaC5qcyc7XG5pbXBvcnQgeyBnaXRIdWJKc29uUmVzcG9uc2UsIGdpdEh1YlJlc3RTdGVwLCBQcm9ncmFtbWFibGVHaXRIdWJTZXJ2ZXIgfSBmcm9tICcuL3Byb2dyYW1tYWJsZUdpdEh1YlNlcnZlci5qcyc7XG5cbmNsYXNzIFRlc3RMb2dTZXJ2aWNlIGV4dGVuZHMgTnVsbExvZ1NlcnZpY2Uge1xuXG5cdHJlYWRvbmx5IG1lc3NhZ2VzOiBzdHJpbmdbXSA9IFtdO1xuXG5cdG92ZXJyaWRlIHRyYWNlKG1lc3NhZ2U6IHN0cmluZywgLi4uYXJnczogdW5rbm93bltdKTogdm9pZCB7XG5cdFx0dGhpcy5tZXNzYWdlcy5wdXNoKFttZXNzYWdlLCAuLi5hcmdzXS5qb2luKCcgJykpO1xuXHR9XG5cblx0b3ZlcnJpZGUgZGVidWcobWVzc2FnZTogc3RyaW5nLCAuLi5hcmdzOiB1bmtub3duW10pOiB2b2lkIHtcblx0XHR0aGlzLm1lc3NhZ2VzLnB1c2goW21lc3NhZ2UsIC4uLmFyZ3NdLmpvaW4oJyAnKSk7XG5cdH1cbn1cblxuc3VpdGUoJ0dpdEh1YlNlcnZpY2UnLCAoKSA9PiB7XG5cdGNvbnN0IGRpc3Bvc2FibGVzID0gZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlKCk7XG5cblx0YXN5bmMgZnVuY3Rpb24gd2l0aFNlcnZlcihmbjogKHNlcnZlcjogUHJvZ3JhbW1hYmxlR2l0SHViU2VydmVyKSA9PiBQcm9taXNlPHZvaWQ+KTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3Qgc2VydmVyID0gYXdhaXQgUHJvZ3JhbW1hYmxlR2l0SHViU2VydmVyLnN0YXJ0KCk7XG5cdFx0dHJ5IHtcblx0XHRcdGF3YWl0IGZuKHNlcnZlcik7XG5cdFx0fSBmaW5hbGx5IHtcblx0XHRcdGF3YWl0IHNlcnZlci5kaXNwb3NlQXN5bmMoKTtcblx0XHR9XG5cdH1cblxuXHR0ZXN0KCdvd25zIHRoZSBjb21wbGV0ZSBHaXRIdWIgY29tcG9uZW50IGdyYXBoIGJlaGluZCBvbmUgc2VydmljZScsICgpID0+IHtcblx0XHRjb25zdCBzZXJ2aWNlID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBHaXRIdWJTZXJ2aWNlKFxuXHRcdFx0e1xuXHRcdFx0XHRlbmRwb2ludDoge1xuXHRcdFx0XHRcdG9uRGlkQ2hhbmdlOiBFdmVudC5Ob25lLFxuXHRcdFx0XHRcdGdldEFwaUJhc2VVcmk6ICgpID0+ICdodHRwczovL2FwaS5naXRodWIuY29tJyxcblx0XHRcdFx0XHRnZXRHcmFwaFFsVXJpOiAoKSA9PiAnaHR0cHM6Ly9hcGkuZ2l0aHViLmNvbS9ncmFwaHFsJyxcblx0XHRcdFx0fSxcblx0XHRcdFx0dG9rZW5Qcm92aWRlcjoge1xuXHRcdFx0XHRcdGdldFRva2VuOiAoKSA9PiB1bmRlZmluZWQsXG5cdFx0XHRcdH0sXG5cdFx0XHR9LFxuXHRcdFx0bmV3IE51bGxMb2dTZXJ2aWNlKCksXG5cdFx0KSk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdHRyYW5zcG9ydDogc2VydmljZS50cmFuc3BvcnQgaW5zdGFuY2VvZiBHaXRIdWJUcmFuc3BvcnQsXG5cdFx0XHRlbmRwb2ludDogc2VydmljZS5lbmRwb2ludC5nZXRBcGlCYXNlVXJpKCksXG5cdFx0XHRjcmVkZW50aWFsczogc2VydmljZS5jcmVkZW50aWFscyBpbnN0YW5jZW9mIEdpdEh1YkNyZWRlbnRpYWxTZXJ2aWNlLFxuXHRcdFx0Y2FwYWJpbGl0aWVzOiBzZXJ2aWNlLmNhcGFiaWxpdGllcyBpbnN0YW5jZW9mIEdpdEh1Ykhvc3RDYXBhYmlsaXRpZXNTZXJ2aWNlLFxuXHRcdFx0cXVlcnk6IHNlcnZpY2UucXVlcnkgaW5zdGFuY2VvZiBHaXRIdWJRdWVyeVNlcnZpY2UsXG5cdFx0XHRwdWxsUmVxdWVzdHM6IHNlcnZpY2UucHVsbFJlcXVlc3RzIGluc3RhbmNlb2YgUHVsbFJlcXVlc3RSZXNvdXJjZVNlcnZpY2UsXG5cdFx0XHRtdXRhdGlvbnM6IHNlcnZpY2UubXV0YXRpb25zIGluc3RhbmNlb2YgUHVsbFJlcXVlc3RNdXRhdGlvblNlcnZpY2UsXG5cdFx0fSwge1xuXHRcdFx0dHJhbnNwb3J0OiB0cnVlLFxuXHRcdFx0ZW5kcG9pbnQ6ICdodHRwczovL2FwaS5naXRodWIuY29tJyxcblx0XHRcdGNyZWRlbnRpYWxzOiB0cnVlLFxuXHRcdFx0Y2FwYWJpbGl0aWVzOiB0cnVlLFxuXHRcdFx0cXVlcnk6IHRydWUsXG5cdFx0XHRwdWxsUmVxdWVzdHM6IHRydWUsXG5cdFx0XHRtdXRhdGlvbnM6IHRydWUsXG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2xvZ3Mgc2VydmljZSwgY3JlZGVudGlhbCwgdHJhbnNwb3J0LCBhbmQgcmVzb3VyY2UgbGlmZWN5Y2xlIHdpdGhvdXQgc2Vuc2l0aXZlIHBheWxvYWRzJywgYXN5bmMgKCkgPT4ge1xuXHRcdGF3YWl0IHdpdGhTZXJ2ZXIoYXN5bmMgc2VydmVyID0+IHtcblx0XHRcdHNlcnZlci5lbnF1ZXVlKFxuXHRcdFx0XHRnaXRIdWJSZXN0U3RlcCh7IG1ldGhvZDogJ0dFVCcsIHBhdGg6ICcvdXNlcicsIHJlc3BvbnNlOiBnaXRIdWJKc29uUmVzcG9uc2UoeyBpZDogMTAxLCBwcml2YXRlOiAncmVzcG9uc2Utc2VjcmV0JyB9KSB9KSxcblx0XHRcdFx0Z2l0SHViUmVzdFN0ZXAoeyBtZXRob2Q6ICdHRVQnLCBwYXRoOiAnL3JlcG9zL28vci9wdWxscy83JywgcmVzcG9uc2U6IGdpdEh1Ykpzb25SZXNwb25zZShwdWxsUmVxdWVzdFJlc3BvbnNlKCdwcml2YXRlLXRpdGxlJykpIH0pLFxuXHRcdFx0KTtcblx0XHRcdGNvbnN0IGxvZ1NlcnZpY2UgPSBuZXcgVGVzdExvZ1NlcnZpY2UoKTtcblx0XHRcdGNvbnN0IHNlcnZpY2UgPSBuZXcgR2l0SHViU2VydmljZSh7XG5cdFx0XHRcdGVuZHBvaW50OiBzZXJ2ZXIuY3JlYXRlRW5kcG9pbnRTZXJ2aWNlKCksXG5cdFx0XHRcdHRva2VuUHJvdmlkZXI6IHsgZ2V0VG9rZW46ICgpID0+ICd0b2tlbi1zZWNyZXQnIH0sXG5cdFx0XHRcdGZldGNoOiBub2RlRmV0Y2gsXG5cdFx0XHR9LCBsb2dTZXJ2aWNlKTtcblx0XHRcdHRyeSB7XG5cdFx0XHRcdGNvbnN0IHN1YnNjcmlwdGlvbiA9IHNlcnZpY2UucHVsbFJlcXVlc3RzLnN1YnNjcmliZVB1bGxSZXF1ZXN0KHtcblx0XHRcdFx0XHRob3N0OiBuZXcgVVJMKHNlcnZlci5hcGlCYXNlVXJsKS5ob3N0LFxuXHRcdFx0XHRcdGFjY291bnRJZDogJzEwMScsXG5cdFx0XHRcdFx0b3duZXI6ICdvJyxcblx0XHRcdFx0XHRyZXBvOiAncicsXG5cdFx0XHRcdFx0bnVtYmVyOiA3LFxuXHRcdFx0XHR9LCB7IHByaW9yaXR5OiAnaW50ZXJhY3RpdmUnIH0pO1xuXHRcdFx0XHRhd2FpdCBzdWJzY3JpcHRpb24ucmVmcmVzaCgnY29yZScpO1xuXHRcdFx0XHRzdWJzY3JpcHRpb24uZGlzcG9zZSgpO1xuXG5cdFx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0XHRcdGluaXRpYWxpemVkOiBsb2dTZXJ2aWNlLm1lc3NhZ2VzLnNvbWUobWVzc2FnZSA9PiBtZXNzYWdlLmluY2x1ZGVzKCdbR2l0SHViU2VydmljZV0gUmV1c2FibGUgR2l0SHViIHNlcnZpY2UgaW5pdGlhbGl6ZWQnKSksXG5cdFx0XHRcdFx0Y3JlZGVudGlhbDogbG9nU2VydmljZS5tZXNzYWdlcy5zb21lKG1lc3NhZ2UgPT4gbWVzc2FnZS5pbmNsdWRlcygnW0dpdEh1YkNyZWRlbnRpYWxTZXJ2aWNlXSBSZXNvbHZlZCBhY2NvdW50IGlkZW50aXR5JykpLFxuXHRcdFx0XHRcdHRyYW5zcG9ydDogbG9nU2VydmljZS5tZXNzYWdlcy5zb21lKG1lc3NhZ2UgPT4gbWVzc2FnZS5pbmNsdWRlcygnW0dpdEh1YlRyYW5zcG9ydF0gUkVTVCBHRVQnKSAmJiBtZXNzYWdlLmluY2x1ZGVzKCcvcmVwb3Mvby9yL3B1bGxzLzcnKSksXG5cdFx0XHRcdFx0cmVzb3VyY2U6IGxvZ1NlcnZpY2UubWVzc2FnZXMuc29tZShtZXNzYWdlID0+IG1lc3NhZ2UuaW5jbHVkZXMoJ1tQdWxsUmVxdWVzdFJlc291cmNlU2VydmljZV0gUmVmcmVzaGVkIGNvcmUnKSksXG5cdFx0XHRcdFx0Y29udGFpbnNUb2tlbjogbG9nU2VydmljZS5tZXNzYWdlcy5zb21lKG1lc3NhZ2UgPT4gbWVzc2FnZS5pbmNsdWRlcygndG9rZW4tc2VjcmV0JykpLFxuXHRcdFx0XHRcdGNvbnRhaW5zUmVzcG9uc2U6IGxvZ1NlcnZpY2UubWVzc2FnZXMuc29tZShtZXNzYWdlID0+IG1lc3NhZ2UuaW5jbHVkZXMoJ3Jlc3BvbnNlLXNlY3JldCcpIHx8IG1lc3NhZ2UuaW5jbHVkZXMoJ3ByaXZhdGUtdGl0bGUnKSksXG5cdFx0XHRcdH0sIHtcblx0XHRcdFx0XHRpbml0aWFsaXplZDogdHJ1ZSxcblx0XHRcdFx0XHRjcmVkZW50aWFsOiB0cnVlLFxuXHRcdFx0XHRcdHRyYW5zcG9ydDogdHJ1ZSxcblx0XHRcdFx0XHRyZXNvdXJjZTogdHJ1ZSxcblx0XHRcdFx0XHRjb250YWluc1Rva2VuOiBmYWxzZSxcblx0XHRcdFx0XHRjb250YWluc1Jlc3BvbnNlOiBmYWxzZSxcblx0XHRcdFx0fSk7XG5cdFx0XHRcdHNlcnZlci5hc3NlcnRTYXRpc2ZpZWQoKTtcblx0XHRcdH0gZmluYWxseSB7XG5cdFx0XHRcdHNlcnZpY2UuZGlzcG9zZSgpO1xuXHRcdFx0fVxuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdrZWVwcyBwdWxsIHJlcXVlc3Qgc3Vic2NyaXB0aW9ucyBhbGl2ZSBhY3Jvc3Mgc2FtZS1hY2NvdW50IHRva2VuIHJvdGF0aW9uJywgYXN5bmMgKCkgPT4ge1xuXHRcdGF3YWl0IHdpdGhTZXJ2ZXIoYXN5bmMgc2VydmVyID0+IHtcblx0XHRcdHNlcnZlci5lbnF1ZXVlKFxuXHRcdFx0XHRnaXRIdWJSZXN0U3RlcCh7IG1ldGhvZDogJ0dFVCcsIHBhdGg6ICcvdXNlcicsIHJlc3BvbnNlOiBnaXRIdWJKc29uUmVzcG9uc2UoeyBpZDogMTAxIH0pIH0pLFxuXHRcdFx0XHRnaXRIdWJSZXN0U3RlcCh7IG1ldGhvZDogJ0dFVCcsIHBhdGg6ICcvcmVwb3Mvby9yL3B1bGxzLzcnLCByZXNwb25zZTogZ2l0SHViSnNvblJlc3BvbnNlKHB1bGxSZXF1ZXN0UmVzcG9uc2UoJ0ZpcnN0JykpIH0pLFxuXHRcdFx0XHRnaXRIdWJSZXN0U3RlcCh7IG1ldGhvZDogJ0dFVCcsIHBhdGg6ICcvdXNlcicsIHJlc3BvbnNlOiBnaXRIdWJKc29uUmVzcG9uc2UoeyBpZDogMTAxIH0pIH0pLFxuXHRcdFx0XHRnaXRIdWJSZXN0U3RlcCh7IG1ldGhvZDogJ0dFVCcsIHBhdGg6ICcvcmVwb3Mvby9yL3B1bGxzLzcnLCByZXNwb25zZTogZ2l0SHViSnNvblJlc3BvbnNlKHB1bGxSZXF1ZXN0UmVzcG9uc2UoJ1NlY29uZCcpKSB9KSxcblx0XHRcdCk7XG5cdFx0XHRsZXQgdG9rZW4gPSAndG9rZW4tMSc7XG5cdFx0XHRjb25zdCBzZXJ2aWNlID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBHaXRIdWJTZXJ2aWNlKHtcblx0XHRcdFx0ZW5kcG9pbnQ6IHNlcnZlci5jcmVhdGVFbmRwb2ludFNlcnZpY2UoKSxcblx0XHRcdFx0dG9rZW5Qcm92aWRlcjogeyBnZXRUb2tlbjogKCkgPT4gdG9rZW4gfSxcblx0XHRcdFx0ZmV0Y2g6IG5vZGVGZXRjaCxcblx0XHRcdH0sIG5ldyBOdWxsTG9nU2VydmljZSgpKSk7XG5cdFx0XHRjb25zdCByZWYgPSB7XG5cdFx0XHRcdGhvc3Q6IG5ldyBVUkwoc2VydmVyLmFwaUJhc2VVcmwpLmhvc3QsXG5cdFx0XHRcdGFjY291bnRJZDogJzEwMScsXG5cdFx0XHRcdG93bmVyOiAnbycsXG5cdFx0XHRcdHJlcG86ICdyJyxcblx0XHRcdFx0bnVtYmVyOiA3LFxuXHRcdFx0fTtcblx0XHRcdGNvbnN0IHN1YnNjcmlwdGlvbiA9IGRpc3Bvc2FibGVzLmFkZChzZXJ2aWNlLnB1bGxSZXF1ZXN0cy5zdWJzY3JpYmVQdWxsUmVxdWVzdChyZWYsIHtcblx0XHRcdFx0cHJpb3JpdHk6ICdpbnRlcmFjdGl2ZScsXG5cdFx0XHR9KSk7XG5cblx0XHRcdGF3YWl0IHN1YnNjcmlwdGlvbi5yZWZyZXNoKCdjb3JlJyk7XG5cdFx0XHRjb25zdCByZXNvdXJjZSA9IHN1YnNjcmlwdGlvbi5yZXNvdXJjZTtcblx0XHRcdHRva2VuID0gJ3Rva2VuLTInO1xuXHRcdFx0YXdhaXQgc3Vic2NyaXB0aW9uLnJlZnJlc2goJ2NvcmUnKTtcblxuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRcdHNhbWVSZXNvdXJjZTogc3Vic2NyaXB0aW9uLnJlc291cmNlID09PSByZXNvdXJjZSxcblx0XHRcdFx0dGl0bGU6IHN1YnNjcmlwdGlvbi5yZXNvdXJjZS5zbmFwc2hvdC5nZXQoKS5jb3JlLnZhbHVlPy50aXRsZSxcblx0XHRcdFx0c3RhdHVzOiBzdWJzY3JpcHRpb24ucmVzb3VyY2Uuc25hcHNob3QuZ2V0KCkuY29yZS5zdGF0dXMsXG5cdFx0XHRcdHJlcXVlc3RDb3VudDogc2VydmVyLnJlcXVlc3RzLmxlbmd0aCxcblx0XHRcdH0sIHtcblx0XHRcdFx0c2FtZVJlc291cmNlOiB0cnVlLFxuXHRcdFx0XHR0aXRsZTogJ1NlY29uZCcsXG5cdFx0XHRcdHN0YXR1czogJ3JlYWR5Jyxcblx0XHRcdFx0cmVxdWVzdENvdW50OiA0LFxuXHRcdFx0fSk7XG5cdFx0XHRzZXJ2ZXIuYXNzZXJ0U2F0aXNmaWVkKCk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3VzZXMgdGhlIGJyb3dzZXIgZ2xvYmFsIGZldGNoIHNhZmVseSB3aGVuIG5vIGZldGNoIGlzIHN1cHBsaWVkJywgYXN5bmMgKCkgPT4ge1xuXHRcdGF3YWl0IHdpdGhTZXJ2ZXIoYXN5bmMgc2VydmVyID0+IHtcblx0XHRcdHNlcnZlci5lbnF1ZXVlKGdpdEh1YlJlc3RTdGVwKHsgbWV0aG9kOiAnR0VUJywgcGF0aDogJy91c2VyJywgcmVzcG9uc2U6IGdpdEh1Ykpzb25SZXNwb25zZSh7IGlkOiAxMDEgfSkgfSkpO1xuXHRcdFx0Y29uc3Qgc2VydmljZSA9IGRpc3Bvc2FibGVzLmFkZChuZXcgR2l0SHViU2VydmljZSh7XG5cdFx0XHRcdGVuZHBvaW50OiBzZXJ2ZXIuY3JlYXRlRW5kcG9pbnRTZXJ2aWNlKCksXG5cdFx0XHRcdHRva2VuUHJvdmlkZXI6IHsgZ2V0VG9rZW46ICgpID0+ICd0b2tlbicgfSxcblx0XHRcdH0sIG5ldyBOdWxsTG9nU2VydmljZSgpKSk7XG5cblx0XHRcdGNvbnN0IGNyZWRlbnRpYWwgPSBhd2FpdCBzZXJ2aWNlLmNyZWRlbnRpYWxzLmdldENyZWRlbnRpYWwobmV3IEFib3J0Q29udHJvbGxlcigpLnNpZ25hbCk7XG5cblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoY3JlZGVudGlhbC5hY2NvdW50LCB7XG5cdFx0XHRcdGhvc3Q6IG5ldyBVUkwoc2VydmVyLmFwaUJhc2VVcmwpLmhvc3QsXG5cdFx0XHRcdGFjY291bnRJZDogJzEwMScsXG5cdFx0XHR9KTtcblx0XHRcdHNlcnZlci5hc3NlcnRTYXRpc2ZpZWQoKTtcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgna2VlcHMgc3Vic2NyaXB0aW9ucyBhbGl2ZSBhY3Jvc3MgYXV0aGVudGljYXRpb24gZXhwaXJ5IGFuZCByZWF1dGhlbnRpY2F0aW9uJywgYXN5bmMgKCkgPT4ge1xuXHRcdGF3YWl0IHdpdGhTZXJ2ZXIoYXN5bmMgc2VydmVyID0+IHtcblx0XHRcdHNlcnZlci5lbnF1ZXVlKFxuXHRcdFx0XHRnaXRIdWJSZXN0U3RlcCh7IG1ldGhvZDogJ0dFVCcsIHBhdGg6ICcvdXNlcicsIHJlc3BvbnNlOiBnaXRIdWJKc29uUmVzcG9uc2UoeyBpZDogMTAxIH0pIH0pLFxuXHRcdFx0XHRnaXRIdWJSZXN0U3RlcCh7IG1ldGhvZDogJ0dFVCcsIHBhdGg6ICcvcmVwb3Mvby9yL3B1bGxzLzcnLCByZXNwb25zZTogZ2l0SHViSnNvblJlc3BvbnNlKHB1bGxSZXF1ZXN0UmVzcG9uc2UoJ0ZpcnN0JykpIH0pLFxuXHRcdFx0XHRnaXRIdWJSZXN0U3RlcCh7IG1ldGhvZDogJ0dFVCcsIHBhdGg6ICcvcmVwb3Mvby9yL3B1bGxzLzcnLCByZXNwb25zZTogZ2l0SHViSnNvblJlc3BvbnNlKHsgbWVzc2FnZTogJ0JhZCBjcmVkZW50aWFscycgfSwgeyBzdGF0dXM6IDQwMSB9KSB9KSxcblx0XHRcdFx0Z2l0SHViUmVzdFN0ZXAoeyBtZXRob2Q6ICdHRVQnLCBwYXRoOiAnL3VzZXInLCByZXNwb25zZTogZ2l0SHViSnNvblJlc3BvbnNlKHsgaWQ6IDEwMSB9KSB9KSxcblx0XHRcdFx0Z2l0SHViUmVzdFN0ZXAoeyBtZXRob2Q6ICdHRVQnLCBwYXRoOiAnL3JlcG9zL28vci9wdWxscy83JywgcmVzcG9uc2U6IGdpdEh1Ykpzb25SZXNwb25zZShwdWxsUmVxdWVzdFJlc3BvbnNlKCdTZWNvbmQnKSkgfSksXG5cdFx0XHQpO1xuXHRcdFx0bGV0IHRva2VuOiBzdHJpbmcgfCB1bmRlZmluZWQgPSAndG9rZW4tMSc7XG5cdFx0XHRjb25zdCBvbkRpZENoYW5nZVRva2VuID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBFbWl0dGVyPHZvaWQ+KCkpO1xuXHRcdFx0Y29uc3Qgc2VydmljZSA9IGRpc3Bvc2FibGVzLmFkZChuZXcgR2l0SHViU2VydmljZSh7XG5cdFx0XHRcdGVuZHBvaW50OiBzZXJ2ZXIuY3JlYXRlRW5kcG9pbnRTZXJ2aWNlKCksXG5cdFx0XHRcdHRva2VuUHJvdmlkZXI6IHtcblx0XHRcdFx0XHRvbkRpZENoYW5nZVRva2VuOiBvbkRpZENoYW5nZVRva2VuLmV2ZW50LFxuXHRcdFx0XHRcdGdldFRva2VuOiAoKSA9PiB0b2tlbixcblx0XHRcdFx0XHRpbnZhbGlkYXRlVG9rZW46IGludmFsaWRhdGVkID0+IHtcblx0XHRcdFx0XHRcdGlmIChpbnZhbGlkYXRlZCA9PT0gdG9rZW4pIHtcblx0XHRcdFx0XHRcdFx0dG9rZW4gPSB1bmRlZmluZWQ7XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0fSxcblx0XHRcdFx0fSxcblx0XHRcdFx0ZmV0Y2g6IG5vZGVGZXRjaCxcblx0XHRcdH0sIG5ldyBOdWxsTG9nU2VydmljZSgpKSk7XG5cdFx0XHRjb25zdCBzdWJzY3JpcHRpb24gPSBkaXNwb3NhYmxlcy5hZGQoc2VydmljZS5wdWxsUmVxdWVzdHMuc3Vic2NyaWJlUHVsbFJlcXVlc3Qoe1xuXHRcdFx0XHRob3N0OiBuZXcgVVJMKHNlcnZlci5hcGlCYXNlVXJsKS5ob3N0LFxuXHRcdFx0XHRhY2NvdW50SWQ6ICcxMDEnLFxuXHRcdFx0XHRvd25lcjogJ28nLFxuXHRcdFx0XHRyZXBvOiAncicsXG5cdFx0XHRcdG51bWJlcjogNyxcblx0XHRcdH0sIHtcblx0XHRcdFx0cHJpb3JpdHk6ICdpbnRlcmFjdGl2ZScsXG5cdFx0XHR9KSk7XG5cdFx0XHRhd2FpdCBzdWJzY3JpcHRpb24ucmVmcmVzaCgnY29yZScpO1xuXG5cdFx0XHRhd2FpdCBhc3NlcnQucmVqZWN0cygoKSA9PiBzdWJzY3JpcHRpb24ucmVmcmVzaCgnY29yZScpLCAvQmFkIGNyZWRlbnRpYWxzLyk7XG5cdFx0XHRhc3NlcnQuZG9lc05vdFRocm93KCgpID0+IHN1YnNjcmlwdGlvbi51cGRhdGUoeyBwcmlvcml0eTogJ3Zpc2libGUnIH0pKTtcblx0XHRcdHRva2VuID0gJ3Rva2VuLTInO1xuXHRcdFx0b25EaWRDaGFuZ2VUb2tlbi5maXJlKCk7XG5cdFx0XHRhd2FpdCBzdWJzY3JpcHRpb24ucmVmcmVzaCgnY29yZScpO1xuXG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdFx0dGl0bGU6IHN1YnNjcmlwdGlvbi5yZXNvdXJjZS5zbmFwc2hvdC5nZXQoKS5jb3JlLnZhbHVlPy50aXRsZSxcblx0XHRcdFx0c3RhdHVzOiBzdWJzY3JpcHRpb24ucmVzb3VyY2Uuc25hcHNob3QuZ2V0KCkuY29yZS5zdGF0dXMsXG5cdFx0XHRcdHJlcXVlc3RDb3VudDogc2VydmVyLnJlcXVlc3RzLmxlbmd0aCxcblx0XHRcdH0sIHtcblx0XHRcdFx0dGl0bGU6ICdTZWNvbmQnLFxuXHRcdFx0XHRzdGF0dXM6ICdyZWFkeScsXG5cdFx0XHRcdHJlcXVlc3RDb3VudDogNSxcblx0XHRcdH0pO1xuXHRcdFx0c2VydmVyLmFzc2VydFNhdGlzZmllZCgpO1xuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdkb2VzIG5vdCBpbnZhbGlkYXRlIGEgdmFsaWQgdG9rZW4gZm9yIGEgbWlzbWF0Y2hlZCBhY2NvdW50IHJlc291cmNlJywgYXN5bmMgKCkgPT4ge1xuXHRcdGF3YWl0IHdpdGhTZXJ2ZXIoYXN5bmMgc2VydmVyID0+IHtcblx0XHRcdHNlcnZlci5lbnF1ZXVlKGdpdEh1YlJlc3RTdGVwKHsgbWV0aG9kOiAnR0VUJywgcGF0aDogJy91c2VyJywgcmVzcG9uc2U6IGdpdEh1Ykpzb25SZXNwb25zZSh7IGlkOiAyMDIgfSkgfSkpO1xuXHRcdFx0bGV0IHRva2VuOiBzdHJpbmcgfCB1bmRlZmluZWQgPSAndG9rZW4nO1xuXHRcdFx0Y29uc3QgaW52YWxpZGF0ZWRUb2tlbnM6IHN0cmluZ1tdID0gW107XG5cdFx0XHRjb25zdCBzZXJ2aWNlID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBHaXRIdWJTZXJ2aWNlKHtcblx0XHRcdFx0ZW5kcG9pbnQ6IHNlcnZlci5jcmVhdGVFbmRwb2ludFNlcnZpY2UoKSxcblx0XHRcdFx0dG9rZW5Qcm92aWRlcjoge1xuXHRcdFx0XHRcdGdldFRva2VuOiAoKSA9PiB0b2tlbixcblx0XHRcdFx0XHRpbnZhbGlkYXRlVG9rZW46IGludmFsaWRhdGVkID0+IHtcblx0XHRcdFx0XHRcdGludmFsaWRhdGVkVG9rZW5zLnB1c2goaW52YWxpZGF0ZWQpO1xuXHRcdFx0XHRcdFx0dG9rZW4gPSB1bmRlZmluZWQ7XG5cdFx0XHRcdFx0fSxcblx0XHRcdFx0fSxcblx0XHRcdFx0ZmV0Y2g6IG5vZGVGZXRjaCxcblx0XHRcdH0sIG5ldyBOdWxsTG9nU2VydmljZSgpKSk7XG5cdFx0XHRjb25zdCBzdWJzY3JpcHRpb24gPSBkaXNwb3NhYmxlcy5hZGQoc2VydmljZS5wdWxsUmVxdWVzdHMuc3Vic2NyaWJlUHVsbFJlcXVlc3Qoe1xuXHRcdFx0XHRob3N0OiBuZXcgVVJMKHNlcnZlci5hcGlCYXNlVXJsKS5ob3N0LFxuXHRcdFx0XHRhY2NvdW50SWQ6ICcxMDEnLFxuXHRcdFx0XHRvd25lcjogJ28nLFxuXHRcdFx0XHRyZXBvOiAncicsXG5cdFx0XHRcdG51bWJlcjogNyxcblx0XHRcdH0sIHtcblx0XHRcdFx0cHJpb3JpdHk6ICdpbnRlcmFjdGl2ZScsXG5cdFx0XHR9KSk7XG5cblx0XHRcdGF3YWl0IGFzc2VydC5yZWplY3RzKCgpID0+IHN1YnNjcmlwdGlvbi5yZWZyZXNoKCdjb3JlJyksIC9kb2VzIG5vdCBtYXRjaCB0aGUgY3VycmVudCBHaXRIdWIgY3JlZGVudGlhbC8pO1xuXG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdFx0dG9rZW4sXG5cdFx0XHRcdGludmFsaWRhdGVkVG9rZW5zLFxuXHRcdFx0XHRyZXF1ZXN0Q291bnQ6IHNlcnZlci5yZXF1ZXN0cy5sZW5ndGgsXG5cdFx0XHR9LCB7XG5cdFx0XHRcdHRva2VuOiAndG9rZW4nLFxuXHRcdFx0XHRpbnZhbGlkYXRlZFRva2VuczogW10sXG5cdFx0XHRcdHJlcXVlc3RDb3VudDogMSxcblx0XHRcdH0pO1xuXHRcdFx0c2VydmVyLmFzc2VydFNhdGlzZmllZCgpO1xuXHRcdH0pO1xuXHR9KTtcbn0pO1xuXG5mdW5jdGlvbiBwdWxsUmVxdWVzdFJlc3BvbnNlKHRpdGxlOiBzdHJpbmcpOiBvYmplY3Qge1xuXHRyZXR1cm4ge1xuXHRcdG5vZGVfaWQ6ICdQUjcnLFxuXHRcdG51bWJlcjogNyxcblx0XHR0aXRsZSxcblx0XHRib2R5OiAnJyxcblx0XHRodG1sX3VybDogJ2h0dHBzOi8vZXhhbXBsZS50ZXN0L28vci9wdWxsLzcnLFxuXHRcdHN0YXRlOiAnb3BlbicsXG5cdFx0bWVyZ2VkOiBmYWxzZSxcblx0XHRkcmFmdDogZmFsc2UsXG5cdFx0dXNlcjogeyBpZDogMSwgbG9naW46ICdhdXRob3InIH0sXG5cdFx0aGVhZDogeyBzaGE6ICdoZWFkJywgcmVmOiAnZmVhdHVyZScgfSxcblx0XHRiYXNlOiB7XG5cdFx0XHRzaGE6ICdiYXNlJyxcblx0XHRcdHJlZjogJ21haW4nLFxuXHRcdFx0cmVwbzogeyBub2RlX2lkOiAnUjEnLCBmdWxsX25hbWU6ICdvL3InIH0sXG5cdFx0fSxcblx0fTtcbn1cbiJdLAogICJtYXBwaW5ncyI6ICJBQUtBLE9BQU8sWUFBWTtBQUNuQixTQUFTLFNBQVMsYUFBYTtBQUMvQixTQUFTLCtDQUErQztBQUN4RCxTQUFTLHNCQUFzQjtBQUMvQixTQUFTLCtCQUErQjtBQUN4QyxTQUFTLHFDQUFxQztBQUM5QyxTQUFTLDBCQUEwQjtBQUNuQyxTQUFTLHFCQUFxQjtBQUM5QixTQUFTLHVCQUF1QjtBQUNoQyxTQUFTLGtDQUFrQztBQUMzQyxTQUFTLGtDQUFrQztBQUMzQyxTQUFTLGlCQUFpQjtBQUMxQixTQUFTLG9CQUFvQixnQkFBZ0IsZ0NBQWdDO0FB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
