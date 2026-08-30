import assert from "assert";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../base/test/common/utils.js";
import { GITHUB_COPILOT_PROTECTED_RESOURCE, GITHUB_REPO_PROTECTED_RESOURCE } from "../../common/agent.js";
import { deriveGitHubEndpoints, gitHubCopilotResource, gitHubMcpServerUrl, gitHubRepoResource } from "../../common/githubEndpoints.js";
suite("githubEndpoints", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  const DOT_COM = {
    apiBaseUri: "https://api.github.com",
    graphQlUri: "https://api.github.com/graphql",
    oauthServer: "https://github.com/login/oauth",
    enterpriseHost: void 0
  };
  test("deriveGitHubEndpoints: github.com defaults for unset / empty / unparseable / github.com host", () => {
    assert.deepStrictEqual({
      unset: deriveGitHubEndpoints(void 0),
      empty: deriveGitHubEndpoints(""),
      garbage: deriveGitHubEndpoints("not a uri"),
      dotCom: deriveGitHubEndpoints("https://github.com"),
      apiDotCom: deriveGitHubEndpoints("https://api.github.com")
    }, {
      unset: DOT_COM,
      empty: DOT_COM,
      garbage: DOT_COM,
      dotCom: DOT_COM,
      apiDotCom: DOT_COM
    });
  });
  test("deriveGitHubEndpoints: GitHub Enterprise Cloud (.ghe.com) uses the api. subdomain", () => {
    assert.deepStrictEqual(deriveGitHubEndpoints("https://acme.ghe.com"), {
      apiBaseUri: "https://api.acme.ghe.com",
      graphQlUri: "https://api.acme.ghe.com/graphql",
      oauthServer: "https://acme.ghe.com/login/oauth",
      enterpriseHost: "acme.ghe.com"
    });
  });
  test("deriveGitHubEndpoints: GitHub Enterprise Server uses /api/v3 and /api/graphql", () => {
    assert.deepStrictEqual(deriveGitHubEndpoints("https://ghe.acme.com"), {
      apiBaseUri: "https://ghe.acme.com/api/v3",
      graphQlUri: "https://ghe.acme.com/api/graphql",
      oauthServer: "https://ghe.acme.com/login/oauth",
      enterpriseHost: "ghe.acme.com"
    });
  });
  test("deriveGitHubEndpoints: preserves scheme and ignores path", () => {
    assert.deepStrictEqual(deriveGitHubEndpoints("http://ghe.local/some/path"), {
      apiBaseUri: "http://ghe.local/api/v3",
      graphQlUri: "http://ghe.local/api/graphql",
      oauthServer: "http://ghe.local/login/oauth",
      enterpriseHost: "ghe.local"
    });
  });
  test("gitHubMcpServerUrl derives the MCP endpoint from the per-user Copilot API host", () => {
    assert.deepStrictEqual({
      default: gitHubMcpServerUrl(void 0),
      enterprise: gitHubMcpServerUrl("https://api.enterprise.githubcopilot.com/v1?tenant=acme#fragment"),
      ghe: gitHubMcpServerUrl("https://copilot-api.ghe.acme.com"),
      invalid: gitHubMcpServerUrl("not a uri")
    }, {
      default: "https://api.githubcopilot.com/mcp",
      enterprise: "https://api.enterprise.githubcopilot.com/mcp",
      ghe: "https://copilot-api.ghe.acme.com/mcp",
      invalid: void 0
    });
  });
  test("resource builders derive resource + authorization_servers from endpoints", () => {
    const endpoints = deriveGitHubEndpoints("https://ghe.acme.com");
    assert.deepStrictEqual({
      copilot: gitHubCopilotResource(endpoints),
      repo: gitHubRepoResource(endpoints)
    }, {
      copilot: {
        resource: "https://ghe.acme.com/api/v3",
        resource_name: "GitHub Copilot",
        authorization_servers: ["https://ghe.acme.com/login/oauth"],
        scopes_supported: ["read:user", "user:email"],
        required: true
      },
      repo: {
        resource: "https://ghe.acme.com/api/v3/repos",
        resource_name: "GitHub Repository",
        authorization_servers: ["https://ghe.acme.com/login/oauth"],
        scopes_supported: ["repo"],
        required: false
      }
    });
  });
  test("github.com resources are byte-for-byte the canonical protected-resource constants", () => {
    const endpoints = deriveGitHubEndpoints(void 0);
    assert.deepStrictEqual({
      copilot: gitHubCopilotResource(endpoints),
      repo: gitHubRepoResource(endpoints)
    }, {
      copilot: GITHUB_COPILOT_PROTECTED_RESOURCE,
      repo: GITHUB_REPO_PROTECTED_RESOURCE
    });
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxwbGF0Zm9ybVxcYWdlbnRIb3N0XFx0ZXN0XFxjb21tb25cXGdpdGh1YkVuZHBvaW50cy50ZXN0LnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IGFzc2VydCBmcm9tICdhc3NlcnQnO1xuaW1wb3J0IHsgZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS90ZXN0L2NvbW1vbi91dGlscy5qcyc7XG5pbXBvcnQgeyBHSVRIVUJfQ09QSUxPVF9QUk9URUNURURfUkVTT1VSQ0UsIEdJVEhVQl9SRVBPX1BST1RFQ1RFRF9SRVNPVVJDRSB9IGZyb20gJy4uLy4uL2NvbW1vbi9hZ2VudC5qcyc7XG5pbXBvcnQgeyBkZXJpdmVHaXRIdWJFbmRwb2ludHMsIGdpdEh1YkNvcGlsb3RSZXNvdXJjZSwgZ2l0SHViTWNwU2VydmVyVXJsLCBnaXRIdWJSZXBvUmVzb3VyY2UgfSBmcm9tICcuLi8uLi9jb21tb24vZ2l0aHViRW5kcG9pbnRzLmpzJztcblxuc3VpdGUoJ2dpdGh1YkVuZHBvaW50cycsICgpID0+IHtcblx0ZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlKCk7XG5cblx0Y29uc3QgRE9UX0NPTSA9IHtcblx0XHRhcGlCYXNlVXJpOiAnaHR0cHM6Ly9hcGkuZ2l0aHViLmNvbScsXG5cdFx0Z3JhcGhRbFVyaTogJ2h0dHBzOi8vYXBpLmdpdGh1Yi5jb20vZ3JhcGhxbCcsXG5cdFx0b2F1dGhTZXJ2ZXI6ICdodHRwczovL2dpdGh1Yi5jb20vbG9naW4vb2F1dGgnLFxuXHRcdGVudGVycHJpc2VIb3N0OiB1bmRlZmluZWQsXG5cdH07XG5cblx0dGVzdCgnZGVyaXZlR2l0SHViRW5kcG9pbnRzOiBnaXRodWIuY29tIGRlZmF1bHRzIGZvciB1bnNldCAvIGVtcHR5IC8gdW5wYXJzZWFibGUgLyBnaXRodWIuY29tIGhvc3QnLCAoKSA9PiB7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHR1bnNldDogZGVyaXZlR2l0SHViRW5kcG9pbnRzKHVuZGVmaW5lZCksXG5cdFx0XHRlbXB0eTogZGVyaXZlR2l0SHViRW5kcG9pbnRzKCcnKSxcblx0XHRcdGdhcmJhZ2U6IGRlcml2ZUdpdEh1YkVuZHBvaW50cygnbm90IGEgdXJpJyksXG5cdFx0XHRkb3RDb206IGRlcml2ZUdpdEh1YkVuZHBvaW50cygnaHR0cHM6Ly9naXRodWIuY29tJyksXG5cdFx0XHRhcGlEb3RDb206IGRlcml2ZUdpdEh1YkVuZHBvaW50cygnaHR0cHM6Ly9hcGkuZ2l0aHViLmNvbScpLFxuXHRcdH0sIHtcblx0XHRcdHVuc2V0OiBET1RfQ09NLFxuXHRcdFx0ZW1wdHk6IERPVF9DT00sXG5cdFx0XHRnYXJiYWdlOiBET1RfQ09NLFxuXHRcdFx0ZG90Q29tOiBET1RfQ09NLFxuXHRcdFx0YXBpRG90Q29tOiBET1RfQ09NLFxuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdkZXJpdmVHaXRIdWJFbmRwb2ludHM6IEdpdEh1YiBFbnRlcnByaXNlIENsb3VkICguZ2hlLmNvbSkgdXNlcyB0aGUgYXBpLiBzdWJkb21haW4nLCAoKSA9PiB7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChkZXJpdmVHaXRIdWJFbmRwb2ludHMoJ2h0dHBzOi8vYWNtZS5naGUuY29tJyksIHtcblx0XHRcdGFwaUJhc2VVcmk6ICdodHRwczovL2FwaS5hY21lLmdoZS5jb20nLFxuXHRcdFx0Z3JhcGhRbFVyaTogJ2h0dHBzOi8vYXBpLmFjbWUuZ2hlLmNvbS9ncmFwaHFsJyxcblx0XHRcdG9hdXRoU2VydmVyOiAnaHR0cHM6Ly9hY21lLmdoZS5jb20vbG9naW4vb2F1dGgnLFxuXHRcdFx0ZW50ZXJwcmlzZUhvc3Q6ICdhY21lLmdoZS5jb20nLFxuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdkZXJpdmVHaXRIdWJFbmRwb2ludHM6IEdpdEh1YiBFbnRlcnByaXNlIFNlcnZlciB1c2VzIC9hcGkvdjMgYW5kIC9hcGkvZ3JhcGhxbCcsICgpID0+IHtcblx0XHQvLyBUaGUgR3JhcGhRTCBlbmRwb2ludCBpcyBgL2FwaS9ncmFwaHFsYCwgTk9UIGBhcGlCYXNlVXJpICsgL2dyYXBocWxgXG5cdFx0Ly8gKHdoaWNoIHdvdWxkIGdpdmUgdGhlIHdyb25nIGAvYXBpL3YzL2dyYXBocWxgKS5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGRlcml2ZUdpdEh1YkVuZHBvaW50cygnaHR0cHM6Ly9naGUuYWNtZS5jb20nKSwge1xuXHRcdFx0YXBpQmFzZVVyaTogJ2h0dHBzOi8vZ2hlLmFjbWUuY29tL2FwaS92MycsXG5cdFx0XHRncmFwaFFsVXJpOiAnaHR0cHM6Ly9naGUuYWNtZS5jb20vYXBpL2dyYXBocWwnLFxuXHRcdFx0b2F1dGhTZXJ2ZXI6ICdodHRwczovL2doZS5hY21lLmNvbS9sb2dpbi9vYXV0aCcsXG5cdFx0XHRlbnRlcnByaXNlSG9zdDogJ2doZS5hY21lLmNvbScsXG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2Rlcml2ZUdpdEh1YkVuZHBvaW50czogcHJlc2VydmVzIHNjaGVtZSBhbmQgaWdub3JlcyBwYXRoJywgKCkgPT4ge1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoZGVyaXZlR2l0SHViRW5kcG9pbnRzKCdodHRwOi8vZ2hlLmxvY2FsL3NvbWUvcGF0aCcpLCB7XG5cdFx0XHRhcGlCYXNlVXJpOiAnaHR0cDovL2doZS5sb2NhbC9hcGkvdjMnLFxuXHRcdFx0Z3JhcGhRbFVyaTogJ2h0dHA6Ly9naGUubG9jYWwvYXBpL2dyYXBocWwnLFxuXHRcdFx0b2F1dGhTZXJ2ZXI6ICdodHRwOi8vZ2hlLmxvY2FsL2xvZ2luL29hdXRoJyxcblx0XHRcdGVudGVycHJpc2VIb3N0OiAnZ2hlLmxvY2FsJyxcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnZ2l0SHViTWNwU2VydmVyVXJsIGRlcml2ZXMgdGhlIE1DUCBlbmRwb2ludCBmcm9tIHRoZSBwZXItdXNlciBDb3BpbG90IEFQSSBob3N0JywgKCkgPT4ge1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0ZGVmYXVsdDogZ2l0SHViTWNwU2VydmVyVXJsKHVuZGVmaW5lZCksXG5cdFx0XHRlbnRlcnByaXNlOiBnaXRIdWJNY3BTZXJ2ZXJVcmwoJ2h0dHBzOi8vYXBpLmVudGVycHJpc2UuZ2l0aHViY29waWxvdC5jb20vdjE/dGVuYW50PWFjbWUjZnJhZ21lbnQnKSxcblx0XHRcdGdoZTogZ2l0SHViTWNwU2VydmVyVXJsKCdodHRwczovL2NvcGlsb3QtYXBpLmdoZS5hY21lLmNvbScpLFxuXHRcdFx0aW52YWxpZDogZ2l0SHViTWNwU2VydmVyVXJsKCdub3QgYSB1cmknKSxcblx0XHR9LCB7XG5cdFx0XHRkZWZhdWx0OiAnaHR0cHM6Ly9hcGkuZ2l0aHViY29waWxvdC5jb20vbWNwJyxcblx0XHRcdGVudGVycHJpc2U6ICdodHRwczovL2FwaS5lbnRlcnByaXNlLmdpdGh1YmNvcGlsb3QuY29tL21jcCcsXG5cdFx0XHRnaGU6ICdodHRwczovL2NvcGlsb3QtYXBpLmdoZS5hY21lLmNvbS9tY3AnLFxuXHRcdFx0aW52YWxpZDogdW5kZWZpbmVkLFxuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdyZXNvdXJjZSBidWlsZGVycyBkZXJpdmUgcmVzb3VyY2UgKyBhdXRob3JpemF0aW9uX3NlcnZlcnMgZnJvbSBlbmRwb2ludHMnLCAoKSA9PiB7XG5cdFx0Y29uc3QgZW5kcG9pbnRzID0gZGVyaXZlR2l0SHViRW5kcG9pbnRzKCdodHRwczovL2doZS5hY21lLmNvbScpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0Y29waWxvdDogZ2l0SHViQ29waWxvdFJlc291cmNlKGVuZHBvaW50cyksXG5cdFx0XHRyZXBvOiBnaXRIdWJSZXBvUmVzb3VyY2UoZW5kcG9pbnRzKSxcblx0XHR9LCB7XG5cdFx0XHRjb3BpbG90OiB7XG5cdFx0XHRcdHJlc291cmNlOiAnaHR0cHM6Ly9naGUuYWNtZS5jb20vYXBpL3YzJyxcblx0XHRcdFx0cmVzb3VyY2VfbmFtZTogJ0dpdEh1YiBDb3BpbG90Jyxcblx0XHRcdFx0YXV0aG9yaXphdGlvbl9zZXJ2ZXJzOiBbJ2h0dHBzOi8vZ2hlLmFjbWUuY29tL2xvZ2luL29hdXRoJ10sXG5cdFx0XHRcdHNjb3Blc19zdXBwb3J0ZWQ6IFsncmVhZDp1c2VyJywgJ3VzZXI6ZW1haWwnXSxcblx0XHRcdFx0cmVxdWlyZWQ6IHRydWUsXG5cdFx0XHR9LFxuXHRcdFx0cmVwbzoge1xuXHRcdFx0XHRyZXNvdXJjZTogJ2h0dHBzOi8vZ2hlLmFjbWUuY29tL2FwaS92My9yZXBvcycsXG5cdFx0XHRcdHJlc291cmNlX25hbWU6ICdHaXRIdWIgUmVwb3NpdG9yeScsXG5cdFx0XHRcdGF1dGhvcml6YXRpb25fc2VydmVyczogWydodHRwczovL2doZS5hY21lLmNvbS9sb2dpbi9vYXV0aCddLFxuXHRcdFx0XHRzY29wZXNfc3VwcG9ydGVkOiBbJ3JlcG8nXSxcblx0XHRcdFx0cmVxdWlyZWQ6IGZhbHNlLFxuXHRcdFx0fSxcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnZ2l0aHViLmNvbSByZXNvdXJjZXMgYXJlIGJ5dGUtZm9yLWJ5dGUgdGhlIGNhbm9uaWNhbCBwcm90ZWN0ZWQtcmVzb3VyY2UgY29uc3RhbnRzJywgKCkgPT4ge1xuXHRcdC8vIEJhY2t3YXJkLWNvbXBhdCBpbnZhcmlhbnQ6IHdpdGggbm8gZW50ZXJwcmlzZSBVUkksIHRva2VuLXN0b3JlIGtleXMgYW5kXG5cdFx0Ly8gYWR2ZXJ0aXNlZCBtZXRhZGF0YSBtdXN0IGJlIHVuY2hhbmdlZCBmb3IgdGhlIGNvbW1vbiBub24tZW50ZXJwcmlzZSBjYXNlLlxuXHRcdGNvbnN0IGVuZHBvaW50cyA9IGRlcml2ZUdpdEh1YkVuZHBvaW50cyh1bmRlZmluZWQpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0Y29waWxvdDogZ2l0SHViQ29waWxvdFJlc291cmNlKGVuZHBvaW50cyksXG5cdFx0XHRyZXBvOiBnaXRIdWJSZXBvUmVzb3VyY2UoZW5kcG9pbnRzKSxcblx0XHR9LCB7XG5cdFx0XHRjb3BpbG90OiBHSVRIVUJfQ09QSUxPVF9QUk9URUNURURfUkVTT1VSQ0UsXG5cdFx0XHRyZXBvOiBHSVRIVUJfUkVQT19QUk9URUNURURfUkVTT1VSQ0UsXG5cdFx0fSk7XG5cdH0pO1xufSk7XG4iXSwKICAibWFwcGluZ3MiOiAiQUFLQSxPQUFPLFlBQVk7QUFDbkIsU0FBUywrQ0FBK0M7QUFDeEQsU0FBUyxtQ0FBbUMsc0NBQXNDO0FBQ2xGLFNBQVMsdUJBQXVCLHVCQUF1QixvQkFBb0IsMEJBQTBCO0FBRXJHLE1BQU0sbUJBQW1CLE1BQU07QUFDOUIsMENBQXdDO0FBRXhDLFFBQU0sVUFBVTtBQUFBLElBQ2YsWUFBWTtBQUFBLElBQ1osWUFBWTtBQUFBLElBQ1osYUFBYTtBQUFBLElBQ2IsZ0JBQWdCO0FBQUEsRUFDakI7QUFFQSxPQUFLLGdHQUFnRyxNQUFNO0FBQzFHLFdBQU8sZ0JBQWdCO0FBQUEsTUFDdEIsT0FBTyxzQkFBc0IsTUFBUztBQUFBLE1BQ3RDLE9BQU8sc0JBQXNCLEVB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
