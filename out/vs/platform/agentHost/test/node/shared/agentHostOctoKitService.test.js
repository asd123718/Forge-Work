import assert from "assert";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../../base/test/common/utils.js";
import { NullLogService } from "../../../../log/common/log.js";
import { AgentHostOctoKitService } from "../../../node/shared/agentHostOctoKitService.js";
import { createTestGitHubEndpointService } from "../testGitHubEndpointService.js";
import { deriveGitHubEndpoints } from "../../../common/githubEndpoints.js";
class RecordingLogService extends NullLogService {
  constructor() {
    super(...arguments);
    this.errors = [];
  }
  error(message, ...args) {
    this.errors.push([message, ...args].map((value) => value instanceof Error ? value.message : String(value)).join(" "));
  }
}
function getUrl(input) {
  if (typeof input === "string") {
    return input;
  }
  return input instanceof URL ? input.href : input.url;
}
function makeService(fetchImpl, enterpriseUri, logService = new NullLogService()) {
  return new AgentHostOctoKitService(fetchImpl, logService, createTestGitHubEndpointService(enterpriseUri));
}
function signal() {
  return new AbortController().signal;
}
function capturingFetch(response) {
  let lastCapture = { url: "", init: void 0 };
  const impl = async (input, init) => {
    lastCapture = { url: getUrl(input), init };
    return response;
  };
  return { fetch: impl, captured: () => lastCapture };
}
function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" }
  });
}
suite("AgentHostOctoKitService", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  test("createPullRequest posts the expected request and parses the response", async () => {
    const { fetch, captured } = capturingFetch(jsonResponse({ html_url: "https://github.com/o/r/pull/42", number: 42, node_id: "PR_node_42" }));
    const service = makeService(fetch);
    const result = await service.createPullRequest("o", "r", "My PR", "Body", "feature", "main", false, "gh-token", signal());
    assert.deepStrictEqual(result, { url: "https://github.com/o/r/pull/42", number: 42, nodeId: "PR_node_42" });
    const cap = captured();
    assert.strictEqual(cap.url, "https://api.github.com/repos/o/r/pulls");
    assert.strictEqual(cap.init?.method, "POST");
    const headers = cap.init?.headers;
    assert.strictEqual(headers["Authorization"], "Bearer gh-token");
    assert.strictEqual(headers["Accept"], "application/vnd.github+json");
    assert.strictEqual(headers["X-GitHub-Api-Version"], "2022-11-28");
    assert.strictEqual(headers["Content-Type"], "application/json");
    assert.deepStrictEqual(JSON.parse(cap.init?.body), {
      title: "My PR",
      body: "Body",
      head: "feature",
      base: "main",
      draft: false
    });
  });
  test("createPullRequest forwards the draft flag", async () => {
    const { fetch, captured } = capturingFetch(jsonResponse({ html_url: "https://github.com/o/r/pull/7", number: 7 }));
    const service = makeService(fetch);
    await service.createPullRequest("o", "r", "t", "b", "h", "b", true, "tok", signal());
    const sent = JSON.parse(captured().init?.body);
    assert.strictEqual(sent.draft, true);
  });
  test("createPullRequest forwards the abort signal", async () => {
    const { fetch, captured } = capturingFetch(jsonResponse({ html_url: "https://github.com/o/r/pull/7", number: 7 }));
    const service = makeService(fetch);
    const controller = new AbortController();
    await service.createPullRequest("o", "r", "t", "b", "h", "b", true, "tok", controller.signal);
    assert.strictEqual(captured().init?.signal, controller.signal);
  });
  test("findPullRequestByHeadBranch fetches the latest matching pull request", async () => {
    const { fetch, captured } = capturingFetch(jsonResponse([{ html_url: "https://github.com/o/r/pull/9", number: 9, node_id: "PR_node_9", created_at: "2026-08-09T12:00:00.000Z" }]));
    const service = makeService(fetch);
    const result = await service.findPullRequestByHeadBranch("o", "r", "feature/test", "tok", signal());
    assert.deepStrictEqual({
      result,
      url: captured().url,
      method: captured().init?.method
    }, {
      result: { url: "https://github.com/o/r/pull/9", number: 9, nodeId: "PR_node_9", createdAt: Date.parse("2026-08-09T12:00:00.000Z") },
      url: "https://api.github.com/repos/o/r/pulls?head=o%3Afeature%2Ftest&state=all&sort=updated&direction=desc&per_page=1",
      method: "GET"
    });
  });
  test("findPullRequestByHeadBranch qualifies a fork branch with its head owner", async () => {
    const { fetch, captured } = capturingFetch(jsonResponse([{ html_url: "https://github.com/o/r/pull/9", number: 9 }]));
    const service = makeService(fetch);
    await service.findPullRequestByHeadBranch("o", "r", "feature/test", "tok", signal(), "fork-owner");
    assert.strictEqual(captured().url, "https://api.github.com/repos/o/r/pulls?head=fork-owner%3Afeature%2Ftest&state=all&sort=updated&direction=desc&per_page=1");
  });
  test("findPullRequestByHeadSha returns the pull request whose head is the commit", async () => {
    const { fetch, captured } = capturingFetch(jsonResponse([
      { html_url: "https://github.com/o/r/pull/1", number: 1, state: "open", head: { sha: "aaa" } },
      { html_url: "https://github.com/o/r/pull/9", number: 9, state: "open", head: { sha: "bbb" }, node_id: "PR_node_9" }
    ]));
    const service = makeService(fetch);
    const result = await service.findPullRequestByHeadSha("o", "r", "bbb", "tok", signal());
    assert.deepStrictEqual({
      result,
      url: captured().url,
      method: captured().init?.method
    }, {
      result: { url: "https://github.com/o/r/pull/9", number: 9, nodeId: "PR_node_9" },
      url: "https://api.github.com/repos/o/r/commits/bbb/pulls?per_page=100",
      method: "GET"
    });
  });
  test("findPullRequestByHeadSha treats an unpushed commit as no pull request", async () => {
    const logService = new RecordingLogService();
    const service = makeService(
      capturingFetch(jsonResponse({ message: "No commit found for SHA: bbb" }, 422)).fetch,
      void 0,
      logService
    );
    const result = await service.findPullRequestByHeadSha("o", "r", "bbb", "tok", signal());
    assert.deepStrictEqual({ result, errors: logService.errors }, { result: void 0, errors: [] });
  });
  test("findPullRequestByHeadSha throws and logs other unprocessable responses", async () => {
    const logService = new RecordingLogService();
    const service = makeService(
      capturingFetch(new Response('{"message":"Validation Failed"}', { status: 422, statusText: "Unprocessable Entity" })).fetch,
      void 0,
      logService
    );
    await assert.rejects(
      () => service.findPullRequestByHeadSha("o", "r", "bbb", "tok", signal()),
      /GitHub API request failed: GET repos\/o\/r\/commits\/bbb\/pulls\?per_page=100 - 422 Unprocessable Entity - {"message":"Validation Failed"}/
    );
    assert.deepStrictEqual(logService.errors, [
      '[AgentHostOctoKit] GET https://api.github.com/repos/o/r/commits/bbb/pulls?per_page=100 - Status: 422 - {"message":"Validation Failed"}'
    ]);
  });
  test("findPullRequestByHeadSha throws and logs server errors", async () => {
    const logService = new RecordingLogService();
    const service = makeService(
      capturingFetch(new Response('{"message":"Server Error"}', { status: 500, statusText: "Server Error" })).fetch,
      void 0,
      logService
    );
    await assert.rejects(
      () => service.findPullRequestByHeadSha("o", "r", "bbb", "tok", signal()),
      /GitHub API request failed: GET repos\/o\/r\/commits\/bbb\/pulls\?per_page=100 - 500 Server Error - {"message":"Server Error"}/
    );
    assert.deepStrictEqual(logService.errors, [
      '[AgentHostOctoKit] GET https://api.github.com/repos/o/r/commits/bbb/pulls?per_page=100 - Status: 500 - {"message":"Server Error"}'
    ]);
  });
  test("findPullRequestByHeadSha ignores pull requests that only contain the commit", async () => {
    const service = makeService(capturingFetch(jsonResponse([
      { html_url: "https://github.com/o/r/pull/1", number: 1, state: "open", head: { sha: "aaa" } }
    ])).fetch);
    assert.strictEqual(await service.findPullRequestByHeadSha("o", "r", "bbb", "tok", signal()), void 0);
  });
  test("findPullRequestByHeadSha reports none when several pull requests share the head commit", async () => {
    const service = makeService(capturingFetch(jsonResponse([
      { html_url: "https://github.com/o/r/pull/1", number: 1, state: "open", head: { sha: "bbb" } },
      { html_url: "https://github.com/o/r/pull/2", number: 2, state: "open", head: { sha: "bbb" } }
    ])).fetch);
    assert.strictEqual(await service.findPullRequestByHeadSha("o", "r", "bbb", "tok", signal()), void 0);
  });
  test("serves the previously fetched pull request when the ETag still validates", async () => {
    let call = 0;
    const service = makeService(async () => {
      call++;
      return call === 1 ? new Response(JSON.stringify([{ html_url: "https://github.com/o/r/pull/9", number: 9 }]), { status: 200, headers: { "content-type": "application/json", etag: 'W/"tag"' } }) : new Response(null, { status: 304, headers: { etag: 'W/"tag"' } });
    });
    const first = await service.findPullRequestByHeadBranch("o", "r", "feature", "tok", signal());
    const revalidated = await service.findPullRequestByHeadBranch("o", "r", "feature", "tok", signal());
    assert.deepStrictEqual({ first, revalidated }, {
      first: { url: "https://github.com/o/r/pull/9", number: 9, nodeId: void 0 },
      revalidated: { url: "https://github.com/o/r/pull/9", number: 9, nodeId: void 0 }
    });
  });
  test("findPullRequestByHeadSha reports none when the commit fills a whole page of pull requests", async () => {
    const page = Array.from({ length: 100 }, (_, index) => ({ html_url: `https://github.com/o/r/pull/${index}`, number: index, state: "open", head: { sha: index === 0 ? "bbb" : "aaa" } }));
    const service = makeService(capturingFetch(jsonResponse(page)).fetch);
    assert.strictEqual(await service.findPullRequestByHeadSha("o", "r", "bbb", "tok", signal()), void 0);
  });
  test("scopes the pull request cache to the GitHub host that issued the validator", async () => {
    let apiBaseUri = deriveGitHubEndpoints(void 0).apiBaseUri;
    const endpointService = {
      ...createTestGitHubEndpointService(),
      getApiBaseUri: () => apiBaseUri
    };
    const requests = [];
    const service = new AgentHostOctoKitService(async (_input, init) => {
      requests.push((init?.headers)["If-None-Match"]);
      return new Response(JSON.stringify([{ html_url: "https://github.com/o/r/pull/9", number: 9 }]), { status: 200, headers: { "content-type": "application/json", etag: 'W/"tag"' } });
    }, new NullLogService(), endpointService);
    await service.findPullRequestByHeadBranch("o", "r", "feature", "tok", signal());
    await service.findPullRequestByHeadBranch("o", "r", "feature", "tok", signal());
    apiBaseUri = deriveGitHubEndpoints("https://ghe.example.com").apiBaseUri;
    await service.findPullRequestByHeadBranch("o", "r", "feature", "tok", signal());
    assert.deepStrictEqual(requests, [void 0, 'W/"tag"', void 0]);
  });
  test("getIssueOrPullRequest fetches the title and body from the issues endpoint", async () => {
    const { fetch, captured } = capturingFetch(jsonResponse({ title: "Issue title", body: "Issue body" }));
    const service = makeService(fetch);
    const result = await service.getIssueOrPullRequest("o", "r", 42, "tok", signal());
    assert.deepStrictEqual({
      result,
      url: captured().url,
      method: captured().init?.method
    }, {
      result: { title: "Issue title", body: "Issue body" },
      url: "https://api.github.com/repos/o/r/issues/42",
      method: "GET"
    });
  });
  test("createPullRequest throws on non-OK response", async () => {
    const service = makeService(capturingFetch(new Response('{"message":"Validation Failed"}', { status: 422, statusText: "Unprocessable Entity" })).fetch);
    await assert.rejects(
      () => service.createPullRequest("o", "r", "t", "b", "h", "b", false, "tok", signal()),
      /422 Unprocessable Entity - {"message":"Validation Failed"}/
    );
  });
  test("createPullRequest truncates long non-OK response bodies", async () => {
    const service = makeService(capturingFetch(new Response(`prefix
${"x".repeat(600)}`, { status: 500, statusText: "Server Error" })).fetch);
    await assert.rejects(
      () => service.createPullRequest("o", "r", "t", "b", "h", "b", false, "tok", signal()),
      (err) => err instanceof Error && err.message.includes(`prefix ${"x".repeat(493)}...`) && !err.message.includes("x".repeat(600))
    );
  });
  test("createPullRequest throws when response is missing html_url or number", async () => {
    const service = makeService(capturingFetch(jsonResponse({
      html_url: "https://github.com/o/r/pull/1"
      /* missing number */
    })).fetch);
    await assert.rejects(
      () => service.createPullRequest("o", "r", "t", "b", "h", "b", false, "tok", signal()),
      /Failed to create pull request for o\/r/
    );
  });
  test("enablePullRequestAutoMerge posts the GraphQL mutation", async () => {
    const { fetch, captured } = capturingFetch(jsonResponse({ data: { enablePullRequestAutoMerge: { pullRequest: { id: "PR_node_42" } } } }));
    const service = makeService(fetch);
    await service.enablePullRequestAutoMerge("PR_node_42", "SQUASH", "gh-token", signal());
    const cap = captured();
    const headers = cap.init?.headers;
    assert.deepStrictEqual({
      url: cap.url,
      method: cap.init?.method,
      authorization: headers["Authorization"],
      variables: JSON.parse(cap.init?.body).variables
    }, {
      url: "https://api.github.com/graphql",
      method: "POST",
      authorization: "Bearer gh-token",
      variables: { pullRequestId: "PR_node_42", mergeMethod: "SQUASH" }
    });
  });
  test("enablePullRequestAutoMerge throws when GraphQL returns errors", async () => {
    const service = makeService(capturingFetch(jsonResponse({ errors: [{ message: "Pull request is in clean status" }] })).fetch);
    await assert.rejects(
      () => service.enablePullRequestAutoMerge("PR_node_42", "MERGE", "tok", signal()),
      /GitHub GraphQL request failed: Pull request is in clean status/
    );
  });
  test("routes REST calls to the GitHub Enterprise Server API base", async () => {
    const { fetch, captured } = capturingFetch(jsonResponse({ html_url: "https://ghe.acme.com/o/r/pull/7", number: 7, node_id: "n" }));
    const service = makeService(fetch, "https://ghe.acme.com");
    await service.createPullRequest("o", "r", "T", "B", "feature", "main", false, "tok", signal());
    assert.strictEqual(captured().url, "https://ghe.acme.com/api/v3/repos/o/r/pulls");
  });
  test("routes GraphQL calls to the GitHub Enterprise Server GraphQL endpoint", async () => {
    const { fetch, captured } = capturingFetch(jsonResponse({ data: { enablePullRequestAutoMerge: { pullRequest: { id: "PR_1" } } } }));
    const service = makeService(fetch, "https://ghe.acme.com");
    await service.enablePullRequestAutoMerge("PR_1", "MERGE", "tok", signal());
    assert.strictEqual(captured().url, "https://ghe.acme.com/api/graphql");
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxwbGF0Zm9ybVxcYWdlbnRIb3N0XFx0ZXN0XFxub2RlXFxzaGFyZWRcXGFnZW50SG9zdE9jdG9LaXRTZXJ2aWNlLnRlc3QudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgYXNzZXJ0IGZyb20gJ2Fzc2VydCc7XG5pbXBvcnQgeyBlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL3Rlc3QvY29tbW9uL3V0aWxzLmpzJztcbmltcG9ydCB7IE51bGxMb2dTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vbG9nL2NvbW1vbi9sb2cuanMnO1xuaW1wb3J0IHsgQWdlbnRIb3N0T2N0b0tpdFNlcnZpY2UsIHR5cGUgRmV0Y2hGdW5jdGlvbiB9IGZyb20gJy4uLy4uLy4uL25vZGUvc2hhcmVkL2FnZW50SG9zdE9jdG9LaXRTZXJ2aWNlLmpzJztcbmltcG9ydCB7IGNyZWF0ZVRlc3RHaXRIdWJFbmRwb2ludFNlcnZpY2UgfSBmcm9tICcuLi90ZXN0R2l0SHViRW5kcG9pbnRTZXJ2aWNlLmpzJztcbmltcG9ydCB7IGRlcml2ZUdpdEh1YkVuZHBvaW50cyB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9naXRodWJFbmRwb2ludHMuanMnO1xuaW1wb3J0IHR5cGUgeyBJQWdlbnRIb3N0R2l0SHViRW5kcG9pbnRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vbm9kZS9hZ2VudEhvc3RHaXRIdWJFbmRwb2ludFNlcnZpY2UuanMnO1xuXG50eXBlIENhcHR1cmVkID0geyB1cmw6IHN0cmluZzsgaW5pdDogUmVxdWVzdEluaXQgfCB1bmRlZmluZWQgfTtcblxuY2xhc3MgUmVjb3JkaW5nTG9nU2VydmljZSBleHRlbmRzIE51bGxMb2dTZXJ2aWNlIHtcblx0cmVhZG9ubHkgZXJyb3JzOiBzdHJpbmdbXSA9IFtdO1xuXG5cdG92ZXJyaWRlIGVycm9yKG1lc3NhZ2U6IHN0cmluZyB8IEVycm9yLCAuLi5hcmdzOiB1bmtub3duW10pOiB2b2lkIHtcblx0XHR0aGlzLmVycm9ycy5wdXNoKFttZXNzYWdlLCAuLi5hcmdzXS5tYXAodmFsdWUgPT4gdmFsdWUgaW5zdGFuY2VvZiBFcnJvciA/IHZhbHVlLm1lc3NhZ2UgOiBTdHJpbmcodmFsdWUpKS5qb2luKCcgJykpO1xuXHR9XG59XG5cbmZ1bmN0aW9uIGdldFVybChpbnB1dDogc3RyaW5nIHwgVVJMIHwgUmVxdWVzdCk6IHN0cmluZyB7XG5cdGlmICh0eXBlb2YgaW5wdXQgPT09ICdzdHJpbmcnKSB7XG5cdFx0cmV0dXJuIGlucHV0O1xuXHR9XG5cdHJldHVybiBpbnB1dCBpbnN0YW5jZW9mIFVSTCA/IGlucHV0LmhyZWYgOiBpbnB1dC51cmw7XG59XG5cbmZ1bmN0aW9uIG1ha2VTZXJ2aWNlKGZldGNoSW1wbDogRmV0Y2hGdW5jdGlvbiwgZW50ZXJwcmlzZVVyaT86IHN0cmluZywgbG9nU2VydmljZSA9IG5ldyBOdWxsTG9nU2VydmljZSgpKTogQWdlbnRIb3N0T2N0b0tpdFNlcnZpY2Uge1xuXHRyZXR1cm4gbmV3IEFnZW50SG9zdE9jdG9LaXRTZXJ2aWNlKGZldGNoSW1wbCwgbG9nU2VydmljZSwgY3JlYXRlVGVzdEdpdEh1YkVuZHBvaW50U2VydmljZShlbnRlcnByaXNlVXJpKSk7XG59XG5cbmZ1bmN0aW9uIHNpZ25hbCgpOiBBYm9ydFNpZ25hbCB7XG5cdHJldHVybiBuZXcgQWJvcnRDb250cm9sbGVyKCkuc2lnbmFsO1xufVxuXG5mdW5jdGlvbiBjYXB0dXJpbmdGZXRjaChyZXNwb25zZTogUmVzcG9uc2UpOiB7IGZldGNoOiBGZXRjaEZ1bmN0aW9uOyBjYXB0dXJlZDogKCkgPT4gQ2FwdHVyZWQgfSB7XG5cdGxldCBsYXN0Q2FwdHVyZTogQ2FwdHVyZWQgPSB7IHVybDogJycsIGluaXQ6IHVuZGVmaW5lZCB9O1xuXHRjb25zdCBpbXBsOiBGZXRjaEZ1bmN0aW9uID0gYXN5bmMgKGlucHV0LCBpbml0KSA9PiB7XG5cdFx0bGFzdENhcHR1cmUgPSB7IHVybDogZ2V0VXJsKGlucHV0KSwgaW5pdCB9O1xuXHRcdHJldHVybiByZXNwb25zZTtcblx0fTtcblx0cmV0dXJuIHsgZmV0Y2g6IGltcGwsIGNhcHR1cmVkOiAoKSA9PiBsYXN0Q2FwdHVyZSB9O1xufVxuXG5mdW5jdGlvbiBqc29uUmVzcG9uc2UoYm9keTogdW5rbm93biwgc3RhdHVzID0gMjAwKTogUmVzcG9uc2Uge1xuXHRyZXR1cm4gbmV3IFJlc3BvbnNlKEpTT04uc3RyaW5naWZ5KGJvZHkpLCB7XG5cdFx0c3RhdHVzLFxuXHRcdGhlYWRlcnM6IHsgJ0NvbnRlbnQtVHlwZSc6ICdhcHBsaWNhdGlvbi9qc29uJyB9LFxuXHR9KTtcbn1cblxuc3VpdGUoJ0FnZW50SG9zdE9jdG9LaXRTZXJ2aWNlJywgKCkgPT4ge1xuXHRlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUoKTtcblxuXHR0ZXN0KCdjcmVhdGVQdWxsUmVxdWVzdCBwb3N0cyB0aGUgZXhwZWN0ZWQgcmVxdWVzdCBhbmQgcGFyc2VzIHRoZSByZXNwb25zZScsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCB7IGZldGNoLCBjYXB0dXJlZCB9ID0gY2FwdHVyaW5nRmV0Y2goanNvblJlc3BvbnNlKHsgaHRtbF91cmw6ICdodHRwczovL2dpdGh1Yi5jb20vby9yL3B1bGwvNDInLCBudW1iZXI6IDQyLCBub2RlX2lkOiAnUFJfbm9kZV80MicgfSkpO1xuXHRcdGNvbnN0IHNlcnZpY2UgPSBtYWtlU2VydmljZShmZXRjaCk7XG5cblx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCBzZXJ2aWNlLmNyZWF0ZVB1bGxSZXF1ZXN0KCdvJywgJ3InLCAnTXkgUFInLCAnQm9keScsICdmZWF0dXJlJywgJ21haW4nLCBmYWxzZSwgJ2doLXRva2VuJywgc2lnbmFsKCkpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChyZXN1bHQsIHsgdXJsOiAnaHR0cHM6Ly9naXRodWIuY29tL28vci9wdWxsLzQyJywgbnVtYmVyOiA0Miwgbm9kZUlkOiAnUFJfbm9kZV80MicgfSk7XG5cblx0XHRjb25zdCBjYXAgPSBjYXB0dXJlZCgpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChjYXAudXJsLCAnaHR0cHM6Ly9hcGkuZ2l0aHViLmNvbS9yZXBvcy9vL3IvcHVsbHMnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY2FwLmluaXQ/Lm1ldGhvZCwgJ1BPU1QnKTtcblx0XHRjb25zdCBoZWFkZXJzID0gY2FwLmluaXQ/LmhlYWRlcnMgYXMgUmVjb3JkPHN0cmluZywgc3RyaW5nPjtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoaGVhZGVyc1snQXV0aG9yaXphdGlvbiddLCAnQmVhcmVyIGdoLXRva2VuJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGhlYWRlcnNbJ0FjY2VwdCddLCAnYXBwbGljYXRpb24vdm5kLmdpdGh1Yitqc29uJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGhlYWRlcnNbJ1gtR2l0SHViLUFwaS1WZXJzaW9uJ10sICcyMDIyLTExLTI4Jyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGhlYWRlcnNbJ0NvbnRlbnQtVHlwZSddLCAnYXBwbGljYXRpb24vanNvbicpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoSlNPTi5wYXJzZShjYXAuaW5pdD8uYm9keSBhcyBzdHJpbmcpLCB7XG5cdFx0XHR0aXRsZTogJ015IFBSJyxcblx0XHRcdGJvZHk6ICdCb2R5Jyxcblx0XHRcdGhlYWQ6ICdmZWF0dXJlJyxcblx0XHRcdGJhc2U6ICdtYWluJyxcblx0XHRcdGRyYWZ0OiBmYWxzZSxcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnY3JlYXRlUHVsbFJlcXVlc3QgZm9yd2FyZHMgdGhlIGRyYWZ0IGZsYWcnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgeyBmZXRjaCwgY2FwdHVyZWQgfSA9IGNhcHR1cmluZ0ZldGNoKGpzb25SZXNwb25zZSh7IGh0bWxfdXJsOiAnaHR0cHM6Ly9naXRodWIuY29tL28vci9wdWxsLzcnLCBudW1iZXI6IDcgfSkpO1xuXHRcdGNvbnN0IHNlcnZpY2UgPSBtYWtlU2VydmljZShmZXRjaCk7XG5cblx0XHRhd2FpdCBzZXJ2aWNlLmNyZWF0ZVB1bGxSZXF1ZXN0KCdvJywgJ3InLCAndCcsICdiJywgJ2gnLCAnYicsIHRydWUsICd0b2snLCBzaWduYWwoKSk7XG5cblx0XHRjb25zdCBzZW50ID0gSlNPTi5wYXJzZShjYXB0dXJlZCgpLmluaXQ/LmJvZHkgYXMgc3RyaW5nKSBhcyB7IGRyYWZ0OiBib29sZWFuIH07XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNlbnQuZHJhZnQsIHRydWUpO1xuXHR9KTtcblxuXHR0ZXN0KCdjcmVhdGVQdWxsUmVxdWVzdCBmb3J3YXJkcyB0aGUgYWJvcnQgc2lnbmFsJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHsgZmV0Y2gsIGNhcHR1cmVkIH0gPSBjYXB0dXJpbmdGZXRjaChqc29uUmVzcG9uc2UoeyBodG1sX3VybDogJ2h0dHBzOi8vZ2l0aHViLmNvbS9vL3IvcHVsbC83JywgbnVtYmVyOiA3IH0pKTtcblx0XHRjb25zdCBzZXJ2aWNlID0gbWFrZVNlcnZpY2UoZmV0Y2gpO1xuXHRcdGNvbnN0IGNvbnRyb2xsZXIgPSBuZXcgQWJvcnRDb250cm9sbGVyKCk7XG5cblx0XHRhd2FpdCBzZXJ2aWNlLmNyZWF0ZVB1bGxSZXF1ZXN0KCdvJywgJ3InLCAndCcsICdiJywgJ2gnLCAnYicsIHRydWUsICd0b2snLCBjb250cm9sbGVyLnNpZ25hbCk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY2FwdHVyZWQoKS5pbml0Py5zaWduYWwsIGNvbnRyb2xsZXIuc2lnbmFsKTtcblx0fSk7XG5cblx0dGVzdCgnZmluZFB1bGxSZXF1ZXN0QnlIZWFkQnJhbmNoIGZldGNoZXMgdGhlIGxhdGVzdCBtYXRjaGluZyBwdWxsIHJlcXVlc3QnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgeyBmZXRjaCwgY2FwdHVyZWQgfSA9IGNhcHR1cmluZ0ZldGNoKGpzb25SZXNwb25zZShbeyBodG1sX3VybDogJ2h0dHBzOi8vZ2l0aHViLmNvbS9vL3IvcHVsbC85JywgbnVtYmVyOiA5LCBub2RlX2lkOiAnUFJfbm9kZV85JywgY3JlYXRlZF9hdDogJzIwMjYtMDgtMDlUMTI6MDA6MDAuMDAwWicgfV0pKTtcblx0XHRjb25zdCBzZXJ2aWNlID0gbWFrZVNlcnZpY2UoZmV0Y2gpO1xuXG5cdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgc2VydmljZS5maW5kUHVsbFJlcXVlc3RCeUhlYWRCcmFuY2goJ28nLCAncicsICdmZWF0dXJlL3Rlc3QnLCAndG9rJywgc2lnbmFsKCkpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRyZXN1bHQsXG5cdFx0XHR1cmw6IGNhcHR1cmVkKCkudXJsLFxuXHRcdFx0bWV0aG9kOiBjYXB0dXJlZCgpLmluaXQ/Lm1ldGhvZCxcblx0XHR9LCB7XG5cdFx0XHRyZXN1bHQ6IHsgdXJsOiAnaHR0cHM6Ly9naXRodWIuY29tL28vci9wdWxsLzknLCBudW1iZXI6IDksIG5vZGVJZDogJ1BSX25vZGVfOScsIGNyZWF0ZWRBdDogRGF0ZS5wYXJzZSgnMjAyNi0wOC0wOVQxMjowMDowMC4wMDBaJykgfSxcblx0XHRcdHVybDogJ2h0dHBzOi8vYXBpLmdpdGh1Yi5jb20vcmVwb3Mvby9yL3B1bGxzP2hlYWQ9byUzQWZlYXR1cmUlMkZ0ZXN0JnN0YXRlPWFsbCZzb3J0PXVwZGF0ZWQmZGlyZWN0aW9uPWRlc2MmcGVyX3BhZ2U9MScsXG5cdFx0XHRtZXRob2Q6ICdHRVQnLFxuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdmaW5kUHVsbFJlcXVlc3RCeUhlYWRCcmFuY2ggcXVhbGlmaWVzIGEgZm9yayBicmFuY2ggd2l0aCBpdHMgaGVhZCBvd25lcicsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCB7IGZldGNoLCBjYXB0dXJlZCB9ID0gY2FwdHVyaW5nRmV0Y2goanNvblJlc3BvbnNlKFt7IGh0bWxfdXJsOiAnaHR0cHM6Ly9naXRodWIuY29tL28vci9wdWxsLzknLCBudW1iZXI6IDkgfV0pKTtcblx0XHRjb25zdCBzZXJ2aWNlID0gbWFrZVNlcnZpY2UoZmV0Y2gpO1xuXG5cdFx0YXdhaXQgc2VydmljZS5maW5kUHVsbFJlcXVlc3RCeUhlYWRCcmFuY2goJ28nLCAncicsICdmZWF0dXJlL3Rlc3QnLCAndG9rJywgc2lnbmFsKCksICdmb3JrLW93bmVyJyk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY2FwdHVyZWQoKS51cmwsICdodHRwczovL2FwaS5naXRodWIuY29tL3JlcG9zL28vci9wdWxscz9oZWFkPWZvcmstb3duZXIlM0FmZWF0dXJlJTJGdGVzdCZzdGF0ZT1hbGwmc29ydD11cGRhdGVkJmRpcmVjdGlvbj1kZXNjJnBlcl9wYWdlPTEnKTtcblx0fSk7XG5cblx0dGVzdCgnZmluZFB1bGxSZXF1ZXN0QnlIZWFkU2hhIHJldHVybnMgdGhlIHB1bGwgcmVxdWVzdCB3aG9zZSBoZWFkIGlzIHRoZSBjb21taXQnLCBhc3luYyAoKSA9PiB7XG5cdFx0Ly8gUHVsbCByZXF1ZXN0IDEgb25seSBjb250YWlucyB0aGUgY29tbWl0OyA5IGhhcyBpdCBhcyBpdHMgaGVhZC5cblx0XHRjb25zdCB7IGZldGNoLCBjYXB0dXJlZCB9ID0gY2FwdHVyaW5nRmV0Y2goanNvblJlc3BvbnNlKFtcblx0XHRcdHsgaHRtbF91cmw6ICdodHRwczovL2dpdGh1Yi5jb20vby9yL3B1bGwvMScsIG51bWJlcjogMSwgc3RhdGU6ICdvcGVuJywgaGVhZDogeyBzaGE6ICdhYWEnIH0gfSxcblx0XHRcdHsgaHRtbF91cmw6ICdodHRwczovL2dpdGh1Yi5jb20vby9yL3B1bGwvOScsIG51bWJlcjogOSwgc3RhdGU6ICdvcGVuJywgaGVhZDogeyBzaGE6ICdiYmInIH0sIG5vZGVfaWQ6ICdQUl9ub2RlXzknIH0sXG5cdFx0XSkpO1xuXHRcdGNvbnN0IHNlcnZpY2UgPSBtYWtlU2VydmljZShmZXRjaCk7XG5cblx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCBzZXJ2aWNlLmZpbmRQdWxsUmVxdWVzdEJ5SGVhZFNoYSgnbycsICdyJywgJ2JiYicsICd0b2snLCBzaWduYWwoKSk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdHJlc3VsdCxcblx0XHRcdHVybDogY2FwdHVyZWQoKS51cmwsXG5cdFx0XHRtZXRob2Q6IGNhcHR1cmVkKCkuaW5pdD8ubWV0aG9kLFxuXHRcdH0sIHtcblx0XHRcdHJlc3VsdDogeyB1cmw6ICdodHRwczovL2dpdGh1Yi5jb20vby9yL3B1bGwvOScsIG51bWJlcjogOSwgbm9kZUlkOiAnUFJfbm9kZV85JyB9LFxuXHRcdFx0dXJsOiAnaHR0cHM6Ly9hcGkuZ2l0aHViLmNvbS9yZXBvcy9vL3IvY29tbWl0cy9iYmIvcHVsbHM/cGVyX3BhZ2U9MTAwJyxcblx0XHRcdG1ldGhvZDogJ0dFVCcsXG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2ZpbmRQdWxsUmVxdWVzdEJ5SGVhZFNoYSB0cmVhdHMgYW4gdW5wdXNoZWQgY29tbWl0IGFzIG5vIHB1bGwgcmVxdWVzdCcsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBsb2dTZXJ2aWNlID0gbmV3IFJlY29yZGluZ0xvZ1NlcnZpY2UoKTtcblx0XHRjb25zdCBzZXJ2aWNlID0gbWFrZVNlcnZpY2UoXG5cdFx0XHRjYXB0dXJpbmdGZXRjaChqc29uUmVzcG9uc2UoeyBtZXNzYWdlOiAnTm8gY29tbWl0IGZvdW5kIGZvciBTSEE6IGJiYicgfSwgNDIyKSkuZmV0Y2gsXG5cdFx0XHR1bmRlZmluZWQsXG5cdFx0XHRsb2dTZXJ2aWNlLFxuXHRcdCk7XG5cblx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCBzZXJ2aWNlLmZpbmRQdWxsUmVxdWVzdEJ5SGVhZFNoYSgnbycsICdyJywgJ2JiYicsICd0b2snLCBzaWduYWwoKSk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHsgcmVzdWx0LCBlcnJvcnM6IGxvZ1NlcnZpY2UuZXJyb3JzIH0sIHsgcmVzdWx0OiB1bmRlZmluZWQsIGVycm9yczogW10gfSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2ZpbmRQdWxsUmVxdWVzdEJ5SGVhZFNoYSB0aHJvd3MgYW5kIGxvZ3Mgb3RoZXIgdW5wcm9jZXNzYWJsZSByZXNwb25zZXMnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgbG9nU2VydmljZSA9IG5ldyBSZWNvcmRpbmdMb2dTZXJ2aWNlKCk7XG5cdFx0Y29uc3Qgc2VydmljZSA9IG1ha2VTZXJ2aWNlKFxuXHRcdFx0Y2FwdHVyaW5nRmV0Y2gobmV3IFJlc3BvbnNlKCd7XCJtZXNzYWdlXCI6XCJWYWxpZGF0aW9uIEZhaWxlZFwifScsIHsgc3RhdHVzOiA0MjIsIHN0YXR1c1RleHQ6ICdVbnByb2Nlc3NhYmxlIEVudGl0eScgfSkpLmZldGNoLFxuXHRcdFx0dW5kZWZpbmVkLFxuXHRcdFx0bG9nU2VydmljZSxcblx0XHQpO1xuXG5cdFx0YXdhaXQgYXNzZXJ0LnJlamVjdHMoXG5cdFx0XHQoKSA9PiBzZXJ2aWNlLmZpbmRQdWxsUmVxdWVzdEJ5SGVhZFNoYSgnbycsICdyJywgJ2JiYicsICd0b2snLCBzaWduYWwoKSksXG5cdFx0XHQvR2l0SHViIEFQSSByZXF1ZXN0IGZhaWxlZDogR0VUIHJlcG9zXFwvb1xcL3JcXC9jb21taXRzXFwvYmJiXFwvcHVsbHNcXD9wZXJfcGFnZT0xMDAgLSA0MjIgVW5wcm9jZXNzYWJsZSBFbnRpdHkgLSB7XCJtZXNzYWdlXCI6XCJWYWxpZGF0aW9uIEZhaWxlZFwifS8sXG5cdFx0KTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGxvZ1NlcnZpY2UuZXJyb3JzLCBbXG5cdFx0XHQnW0FnZW50SG9zdE9jdG9LaXRdIEdFVCBodHRwczovL2FwaS5naXRodWIuY29tL3JlcG9zL28vci9jb21taXRzL2JiYi9wdWxscz9wZXJfcGFnZT0xMDAgLSBTdGF0dXM6IDQyMiAtIHtcIm1lc3NhZ2VcIjpcIlZhbGlkYXRpb24gRmFpbGVkXCJ9Jyxcblx0XHRdKTtcblx0fSk7XG5cblx0dGVzdCgnZmluZFB1bGxSZXF1ZXN0QnlIZWFkU2hhIHRocm93cyBhbmQgbG9ncyBzZXJ2ZXIgZXJyb3JzJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IGxvZ1NlcnZpY2UgPSBuZXcgUmVjb3JkaW5nTG9nU2VydmljZSgpO1xuXHRcdGNvbnN0IHNlcnZpY2UgPSBtYWtlU2VydmljZShcblx0XHRcdGNhcHR1cmluZ0ZldGNoKG5ldyBSZXNwb25zZSgne1wibWVzc2FnZVwiOlwiU2VydmVyIEVycm9yXCJ9JywgeyBzdGF0dXM6IDUwMCwgc3RhdHVzVGV4dDogJ1NlcnZlciBFcnJvcicgfSkpLmZldGNoLFxuXHRcdFx0dW5kZWZpbmVkLFxuXHRcdFx0bG9nU2VydmljZSxcblx0XHQpO1xuXG5cdFx0YXdhaXQgYXNzZXJ0LnJlamVjdHMoXG5cdFx0XHQoKSA9PiBzZXJ2aWNlLmZpbmRQdWxsUmVxdWVzdEJ5SGVhZFNoYSgnbycsICdyJywgJ2JiYicsICd0b2snLCBzaWduYWwoKSksXG5cdFx0XHQvR2l0SHViIEFQSSByZXF1ZXN0IGZhaWxlZDogR0VUIHJlcG9zXFwvb1xcL3JcXC9jb21taXRzXFwvYmJiXFwvcHVsbHNcXD9wZXJfcGFnZT0xMDAgLSA1MDAgU2VydmVyIEVycm9yIC0ge1wibWVzc2FnZVwiOlwiU2VydmVyIEVycm9yXCJ9Lyxcblx0XHQpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwobG9nU2VydmljZS5lcnJvcnMsIFtcblx0XHRcdCdbQWdlbnRIb3N0T2N0b0tpdF0gR0VUIGh0dHBzOi8vYXBpLmdpdGh1Yi5jb20vcmVwb3Mvby9yL2NvbW1pdHMvYmJiL3B1bGxzP3Blcl9wYWdlPTEwMCAtIFN0YXR1czogNTAwIC0ge1wibWVzc2FnZVwiOlwiU2VydmVyIEVycm9yXCJ9Jyxcblx0XHRdKTtcblx0fSk7XG5cblx0dGVzdCgnZmluZFB1bGxSZXF1ZXN0QnlIZWFkU2hhIGlnbm9yZXMgcHVsbCByZXF1ZXN0cyB0aGF0IG9ubHkgY29udGFpbiB0aGUgY29tbWl0JywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHNlcnZpY2UgPSBtYWtlU2VydmljZShjYXB0dXJpbmdGZXRjaChqc29uUmVzcG9uc2UoW1xuXHRcdFx0eyBodG1sX3VybDogJ2h0dHBzOi8vZ2l0aHViLmNvbS9vL3IvcHVsbC8xJywgbnVtYmVyOiAxLCBzdGF0ZTogJ29wZW4nLCBoZWFkOiB7IHNoYTogJ2FhYScgfSB9LFxuXHRcdF0pKS5mZXRjaCk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYXdhaXQgc2VydmljZS5maW5kUHVsbFJlcXVlc3RCeUhlYWRTaGEoJ28nLCAncicsICdiYmInLCAndG9rJywgc2lnbmFsKCkpLCB1bmRlZmluZWQpO1xuXHR9KTtcblxuXHR0ZXN0KCdmaW5kUHVsbFJlcXVlc3RCeUhlYWRTaGEgcmVwb3J0cyBub25lIHdoZW4gc2V2ZXJhbCBwdWxsIHJlcXVlc3RzIHNoYXJlIHRoZSBoZWFkIGNvbW1pdCcsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBzZXJ2aWNlID0gbWFrZVNlcnZpY2UoY2FwdHVyaW5nRmV0Y2goanNvblJlc3BvbnNlKFtcblx0XHRcdHsgaHRtbF91cmw6ICdodHRwczovL2dpdGh1Yi5jb20vby9yL3B1bGwvMScsIG51bWJlcjogMSwgc3RhdGU6ICdvcGVuJywgaGVhZDogeyBzaGE6ICdiYmInIH0gfSxcblx0XHRcdHsgaHRtbF91cmw6ICdodHRwczovL2dpdGh1Yi5jb20vby9yL3B1bGwvMicsIG51bWJlcjogMiwgc3RhdGU6ICdvcGVuJywgaGVhZDogeyBzaGE6ICdiYmInIH0gfSxcblx0XHRdKSkuZmV0Y2gpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGF3YWl0IHNlcnZpY2UuZmluZFB1bGxSZXF1ZXN0QnlIZWFkU2hhKCdvJywgJ3InLCAnYmJiJywgJ3RvaycsIHNpZ25hbCgpKSwgdW5kZWZpbmVkKTtcblx0fSk7XG5cblx0dGVzdCgnc2VydmVzIHRoZSBwcmV2aW91c2x5IGZldGNoZWQgcHVsbCByZXF1ZXN0IHdoZW4gdGhlIEVUYWcgc3RpbGwgdmFsaWRhdGVzJywgYXN5bmMgKCkgPT4ge1xuXHRcdGxldCBjYWxsID0gMDtcblx0XHRjb25zdCBzZXJ2aWNlID0gbWFrZVNlcnZpY2UoYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y2FsbCsrO1xuXHRcdFx0cmV0dXJuIGNhbGwgPT09IDFcblx0XHRcdFx0PyBuZXcgUmVzcG9uc2UoSlNPTi5zdHJpbmdpZnkoW3sgaHRtbF91cmw6ICdodHRwczovL2dpdGh1Yi5jb20vby9yL3B1bGwvOScsIG51bWJlcjogOSB9XSksIHsgc3RhdHVzOiAyMDAsIGhlYWRlcnM6IHsgJ2NvbnRlbnQtdHlwZSc6ICdhcHBsaWNhdGlvbi9qc29uJywgZXRhZzogJ1cvXCJ0YWdcIicgfSB9KVxuXHRcdFx0XHQ6IG5ldyBSZXNwb25zZShudWxsLCB7IHN0YXR1czogMzA0LCBoZWFkZXJzOiB7IGV0YWc6ICdXL1widGFnXCInIH0gfSk7XG5cdFx0fSk7XG5cblx0XHRjb25zdCBmaXJzdCA9IGF3YWl0IHNlcnZpY2UuZmluZFB1bGxSZXF1ZXN0QnlIZWFkQnJhbmNoKCdvJywgJ3InLCAnZmVhdHVyZScsICd0b2snLCBzaWduYWwoKSk7XG5cdFx0Y29uc3QgcmV2YWxpZGF0ZWQgPSBhd2FpdCBzZXJ2aWNlLmZpbmRQdWxsUmVxdWVzdEJ5SGVhZEJyYW5jaCgnbycsICdyJywgJ2ZlYXR1cmUnLCAndG9rJywgc2lnbmFsKCkpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7IGZpcnN0LCByZXZhbGlkYXRlZCB9LCB7XG5cdFx0XHRmaXJzdDogeyB1cmw6ICdodHRwczovL2dpdGh1Yi5jb20vby9yL3B1bGwvOScsIG51bWJlcjogOSwgbm9kZUlkOiB1bmRlZmluZWQgfSxcblx0XHRcdHJldmFsaWRhdGVkOiB7IHVybDogJ2h0dHBzOi8vZ2l0aHViLmNvbS9vL3IvcHVsbC85JywgbnVtYmVyOiA5LCBub2RlSWQ6IHVuZGVmaW5lZCB9LFxuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdmaW5kUHVsbFJlcXVlc3RCeUhlYWRTaGEgcmVwb3J0cyBub25lIHdoZW4gdGhlIGNvbW1pdCBmaWxscyBhIHdob2xlIHBhZ2Ugb2YgcHVsbCByZXF1ZXN0cycsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBwYWdlID0gQXJyYXkuZnJvbSh7IGxlbmd0aDogMTAwIH0sIChfLCBpbmRleCkgPT4gKHsgaHRtbF91cmw6IGBodHRwczovL2dpdGh1Yi5jb20vby9yL3B1bGwvJHtpbmRleH1gLCBudW1iZXI6IGluZGV4LCBzdGF0ZTogJ29wZW4nLCBoZWFkOiB7IHNoYTogaW5kZXggPT09IDAgPyAnYmJiJyA6ICdhYWEnIH0gfSkpO1xuXHRcdGNvbnN0IHNlcnZpY2UgPSBtYWtlU2VydmljZShjYXB0dXJpbmdGZXRjaChqc29uUmVzcG9uc2UocGFnZSkpLmZldGNoKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChhd2FpdCBzZXJ2aWNlLmZpbmRQdWxsUmVxdWVzdEJ5SGVhZFNoYSgnbycsICdyJywgJ2JiYicsICd0b2snLCBzaWduYWwoKSksIHVuZGVmaW5lZCk7XG5cdH0pO1xuXG5cdHRlc3QoJ3Njb3BlcyB0aGUgcHVsbCByZXF1ZXN0IGNhY2hlIHRvIHRoZSBHaXRIdWIgaG9zdCB0aGF0IGlzc3VlZCB0aGUgdmFsaWRhdG9yJywgYXN5bmMgKCkgPT4ge1xuXHRcdGxldCBhcGlCYXNlVXJpID0gZGVyaXZlR2l0SHViRW5kcG9pbnRzKHVuZGVmaW5lZCkuYXBpQmFzZVVyaTtcblx0XHRjb25zdCBlbmRwb2ludFNlcnZpY2U6IElBZ2VudEhvc3RHaXRIdWJFbmRwb2ludFNlcnZpY2UgPSB7XG5cdFx0XHQuLi5jcmVhdGVUZXN0R2l0SHViRW5kcG9pbnRTZXJ2aWNlKCksXG5cdFx0XHRnZXRBcGlCYXNlVXJpOiAoKSA9PiBhcGlCYXNlVXJpLFxuXHRcdH07XG5cdFx0Y29uc3QgcmVxdWVzdHM6IChzdHJpbmcgfCB1bmRlZmluZWQpW10gPSBbXTtcblx0XHRjb25zdCBzZXJ2aWNlID0gbmV3IEFnZW50SG9zdE9jdG9LaXRTZXJ2aWNlKGFzeW5jIChfaW5wdXQsIGluaXQpID0+IHtcblx0XHRcdHJlcXVlc3RzLnB1c2goKGluaXQ/LmhlYWRlcnMgYXMgUmVjb3JkPHN0cmluZywgc3RyaW5nPilbJ0lmLU5vbmUtTWF0Y2gnXSk7XG5cdFx0XHRyZXR1cm4gbmV3IFJlc3BvbnNlKEpTT04uc3RyaW5naWZ5KFt7IGh0bWxfdXJsOiAnaHR0cHM6Ly9naXRodWIuY29tL28vci9wdWxsLzknLCBudW1iZXI6IDkgfV0pLCB7IHN0YXR1czogMjAwLCBoZWFkZXJzOiB7ICdjb250ZW50LXR5cGUnOiAnYXBwbGljYXRpb24vanNvbicsIGV0YWc6ICdXL1widGFnXCInIH0gfSk7XG5cdFx0fSwgbmV3IE51bGxMb2dTZXJ2aWNlKCksIGVuZHBvaW50U2VydmljZSk7XG5cblx0XHRhd2FpdCBzZXJ2aWNlLmZpbmRQdWxsUmVxdWVzdEJ5SGVhZEJyYW5jaCgnbycsICdyJywgJ2ZlYXR1cmUnLCAndG9rJywgc2lnbmFsKCkpO1xuXHRcdGF3YWl0IHNlcnZpY2UuZmluZFB1bGxSZXF1ZXN0QnlIZWFkQnJhbmNoKCdvJywgJ3InLCAnZmVhdHVyZScsICd0b2snLCBzaWduYWwoKSk7XG5cdFx0YXBpQmFzZVVyaSA9IGRlcml2ZUdpdEh1YkVuZHBvaW50cygnaHR0cHM6Ly9naGUuZXhhbXBsZS5jb20nKS5hcGlCYXNlVXJpO1xuXHRcdGF3YWl0IHNlcnZpY2UuZmluZFB1bGxSZXF1ZXN0QnlIZWFkQnJhbmNoKCdvJywgJ3InLCAnZmVhdHVyZScsICd0b2snLCBzaWduYWwoKSk7XG5cblx0XHQvLyBUaGUgdmFsaWRhdG9yIGlzIHJlcGxheWVkIG9ubHkgYWdhaW5zdCB0aGUgaG9zdCB0aGF0IGlzc3VlZCBpdC5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHJlcXVlc3RzLCBbdW5kZWZpbmVkLCAnVy9cInRhZ1wiJywgdW5kZWZpbmVkXSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2dldElzc3VlT3JQdWxsUmVxdWVzdCBmZXRjaGVzIHRoZSB0aXRsZSBhbmQgYm9keSBmcm9tIHRoZSBpc3N1ZXMgZW5kcG9pbnQnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgeyBmZXRjaCwgY2FwdHVyZWQgfSA9IGNhcHR1cmluZ0ZldGNoKGpzb25SZXNwb25zZSh7IHRpdGxlOiAnSXNzdWUgdGl0bGUnLCBib2R5OiAnSXNzdWUgYm9keScgfSkpO1xuXHRcdGNvbnN0IHNlcnZpY2UgPSBtYWtlU2VydmljZShmZXRjaCk7XG5cblx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCBzZXJ2aWNlLmdldElzc3VlT3JQdWxsUmVxdWVzdCgnbycsICdyJywgNDIsICd0b2snLCBzaWduYWwoKSk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdHJlc3VsdCxcblx0XHRcdHVybDogY2FwdHVyZWQoKS51cmwsXG5cdFx0XHRtZXRob2Q6IGNhcHR1cmVkKCkuaW5pdD8ubWV0aG9kLFxuXHRcdH0sIHtcblx0XHRcdHJlc3VsdDogeyB0aXRsZTogJ0lzc3VlIHRpdGxlJywgYm9keTogJ0lzc3VlIGJvZHknIH0sXG5cdFx0XHR1cmw6ICdodHRwczovL2FwaS5naXRodWIuY29tL3JlcG9zL28vci9pc3N1ZXMvNDInLFxuXHRcdFx0bWV0aG9kOiAnR0VUJyxcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnY3JlYXRlUHVsbFJlcXVlc3QgdGhyb3dzIG9uIG5vbi1PSyByZXNwb25zZScsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBzZXJ2aWNlID0gbWFrZVNlcnZpY2UoY2FwdHVyaW5nRmV0Y2gobmV3IFJlc3BvbnNlKCd7XCJtZXNzYWdlXCI6XCJWYWxpZGF0aW9uIEZhaWxlZFwifScsIHsgc3RhdHVzOiA0MjIsIHN0YXR1c1RleHQ6ICdVbnByb2Nlc3NhYmxlIEVudGl0eScgfSkpLmZldGNoKTtcblxuXHRcdGF3YWl0IGFzc2VydC5yZWplY3RzKFxuXHRcdFx0KCkgPT4gc2VydmljZS5jcmVhdGVQdWxsUmVxdWVzdCgnbycsICdyJywgJ3QnLCAnYicsICdoJywgJ2InLCBmYWxzZSwgJ3RvaycsIHNpZ25hbCgpKSxcblx0XHRcdC80MjIgVW5wcm9jZXNzYWJsZSBFbnRpdHkgLSB7XCJtZXNzYWdlXCI6XCJWYWxpZGF0aW9uIEZhaWxlZFwifS8sXG5cdFx0KTtcblx0fSk7XG5cblx0dGVzdCgnY3JlYXRlUHVsbFJlcXVlc3QgdHJ1bmNhdGVzIGxvbmcgbm9uLU9LIHJlc3BvbnNlIGJvZGllcycsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBzZXJ2aWNlID0gbWFrZVNlcnZpY2UoY2FwdHVyaW5nRmV0Y2gobmV3IFJlc3BvbnNlKGBwcmVmaXhcXG4keyd4Jy5yZXBlYXQoNjAwKX1gLCB7IHN0YXR1czogNTAwLCBzdGF0dXNUZXh0OiAnU2VydmVyIEVycm9yJyB9KSkuZmV0Y2gpO1xuXG5cdFx0YXdhaXQgYXNzZXJ0LnJlamVjdHMoXG5cdFx0XHQoKSA9PiBzZXJ2aWNlLmNyZWF0ZVB1bGxSZXF1ZXN0KCdvJywgJ3InLCAndCcsICdiJywgJ2gnLCAnYicsIGZhbHNlLCAndG9rJywgc2lnbmFsKCkpLFxuXHRcdFx0ZXJyID0+IGVyciBpbnN0YW5jZW9mIEVycm9yICYmIGVyci5tZXNzYWdlLmluY2x1ZGVzKGBwcmVmaXggJHsneCcucmVwZWF0KDQ5Myl9Li4uYCkgJiYgIWVyci5tZXNzYWdlLmluY2x1ZGVzKCd4Jy5yZXBlYXQoNjAwKSksXG5cdFx0KTtcblx0fSk7XG5cblx0dGVzdCgnY3JlYXRlUHVsbFJlcXVlc3QgdGhyb3dzIHdoZW4gcmVzcG9uc2UgaXMgbWlzc2luZyBodG1sX3VybCBvciBudW1iZXInLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3Qgc2VydmljZSA9IG1ha2VTZXJ2aWNlKGNhcHR1cmluZ0ZldGNoKGpzb25SZXNwb25zZSh7IGh0bWxfdXJsOiAnaHR0cHM6Ly9naXRodWIuY29tL28vci9wdWxsLzEnIC8qIG1pc3NpbmcgbnVtYmVyICovIH0pKS5mZXRjaCk7XG5cblx0XHRhd2FpdCBhc3NlcnQucmVqZWN0cyhcblx0XHRcdCgpID0+IHNlcnZpY2UuY3JlYXRlUHVsbFJlcXVlc3QoJ28nLCAncicsICd0JywgJ2InLCAnaCcsICdiJywgZmFsc2UsICd0b2snLCBzaWduYWwoKSksXG5cdFx0XHQvRmFpbGVkIHRvIGNyZWF0ZSBwdWxsIHJlcXVlc3QgZm9yIG9cXC9yLyxcblx0XHQpO1xuXHR9KTtcblxuXHR0ZXN0KCdlbmFibGVQdWxsUmVxdWVzdEF1dG9NZXJnZSBwb3N0cyB0aGUgR3JhcGhRTCBtdXRhdGlvbicsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCB7IGZldGNoLCBjYXB0dXJlZCB9ID0gY2FwdHVyaW5nRmV0Y2goanNvblJlc3BvbnNlKHsgZGF0YTogeyBlbmFibGVQdWxsUmVxdWVzdEF1dG9NZXJnZTogeyBwdWxsUmVxdWVzdDogeyBpZDogJ1BSX25vZGVfNDInIH0gfSB9IH0pKTtcblx0XHRjb25zdCBzZXJ2aWNlID0gbWFrZVNlcnZpY2UoZmV0Y2gpO1xuXG5cdFx0YXdhaXQgc2VydmljZS5lbmFibGVQdWxsUmVxdWVzdEF1dG9NZXJnZSgnUFJfbm9kZV80MicsICdTUVVBU0gnLCAnZ2gtdG9rZW4nLCBzaWduYWwoKSk7XG5cblx0XHRjb25zdCBjYXAgPSBjYXB0dXJlZCgpO1xuXHRcdGNvbnN0IGhlYWRlcnMgPSBjYXAuaW5pdD8uaGVhZGVycyBhcyBSZWNvcmQ8c3RyaW5nLCBzdHJpbmc+O1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0dXJsOiBjYXAudXJsLFxuXHRcdFx0bWV0aG9kOiBjYXAuaW5pdD8ubWV0aG9kLFxuXHRcdFx0YXV0aG9yaXphdGlvbjogaGVhZGVyc1snQXV0aG9yaXphdGlvbiddLFxuXHRcdFx0dmFyaWFibGVzOiAoSlNPTi5wYXJzZShjYXAuaW5pdD8uYm9keSBhcyBzdHJpbmcpIGFzIHsgdmFyaWFibGVzOiB1bmtub3duIH0pLnZhcmlhYmxlcyxcblx0XHR9LCB7XG5cdFx0XHR1cmw6ICdodHRwczovL2FwaS5naXRodWIuY29tL2dyYXBocWwnLFxuXHRcdFx0bWV0aG9kOiAnUE9TVCcsXG5cdFx0XHRhdXRob3JpemF0aW9uOiAnQmVhcmVyIGdoLXRva2VuJyxcblx0XHRcdHZhcmlhYmxlczogeyBwdWxsUmVxdWVzdElkOiAnUFJfbm9kZV80MicsIG1lcmdlTWV0aG9kOiAnU1FVQVNIJyB9LFxuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdlbmFibGVQdWxsUmVxdWVzdEF1dG9NZXJnZSB0aHJvd3Mgd2hlbiBHcmFwaFFMIHJldHVybnMgZXJyb3JzJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHNlcnZpY2UgPSBtYWtlU2VydmljZShjYXB0dXJpbmdGZXRjaChqc29uUmVzcG9uc2UoeyBlcnJvcnM6IFt7IG1lc3NhZ2U6ICdQdWxsIHJlcXVlc3QgaXMgaW4gY2xlYW4gc3RhdHVzJyB9XSB9KSkuZmV0Y2gpO1xuXG5cdFx0YXdhaXQgYXNzZXJ0LnJlamVjdHMoXG5cdFx0XHQoKSA9PiBzZXJ2aWNlLmVuYWJsZVB1bGxSZXF1ZXN0QXV0b01lcmdlKCdQUl9ub2RlXzQyJywgJ01FUkdFJywgJ3RvaycsIHNpZ25hbCgpKSxcblx0XHRcdC9HaXRIdWIgR3JhcGhRTCByZXF1ZXN0IGZhaWxlZDogUHVsbCByZXF1ZXN0IGlzIGluIGNsZWFuIHN0YXR1cy8sXG5cdFx0KTtcblx0fSk7XG5cblx0dGVzdCgncm91dGVzIFJFU1QgY2FsbHMgdG8gdGhlIEdpdEh1YiBFbnRlcnByaXNlIFNlcnZlciBBUEkgYmFzZScsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCB7IGZldGNoLCBjYXB0dXJlZCB9ID0gY2FwdHVyaW5nRmV0Y2goanNvblJlc3BvbnNlKHsgaHRtbF91cmw6ICdodHRwczovL2doZS5hY21lLmNvbS9vL3IvcHVsbC83JywgbnVtYmVyOiA3LCBub2RlX2lkOiAnbicgfSkpO1xuXHRcdGNvbnN0IHNlcnZpY2UgPSBtYWtlU2VydmljZShmZXRjaCwgJ2h0dHBzOi8vZ2hlLmFjbWUuY29tJyk7XG5cblx0XHRhd2FpdCBzZXJ2aWNlLmNyZWF0ZVB1bGxSZXF1ZXN0KCdvJywgJ3InLCAnVCcsICdCJywgJ2ZlYXR1cmUnLCAnbWFpbicsIGZhbHNlLCAndG9rJywgc2lnbmFsKCkpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNhcHR1cmVkKCkudXJsLCAnaHR0cHM6Ly9naGUuYWNtZS5jb20vYXBpL3YzL3JlcG9zL28vci9wdWxscycpO1xuXHR9KTtcblxuXHR0ZXN0KCdyb3V0ZXMgR3JhcGhRTCBjYWxscyB0byB0aGUgR2l0SHViIEVudGVycHJpc2UgU2VydmVyIEdyYXBoUUwgZW5kcG9pbnQnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgeyBmZXRjaCwgY2FwdHVyZWQgfSA9IGNhcHR1cmluZ0ZldGNoKGpzb25SZXNwb25zZSh7IGRhdGE6IHsgZW5hYmxlUHVsbFJlcXVlc3RBdXRvTWVyZ2U6IHsgcHVsbFJlcXVlc3Q6IHsgaWQ6ICdQUl8xJyB9IH0gfSB9KSk7XG5cdFx0Y29uc3Qgc2VydmljZSA9IG1ha2VTZXJ2aWNlKGZldGNoLCAnaHR0cHM6Ly9naGUuYWNtZS5jb20nKTtcblxuXHRcdGF3YWl0IHNlcnZpY2UuZW5hYmxlUHVsbFJlcXVlc3RBdXRvTWVyZ2UoJ1BSXzEnLCAnTUVSR0UnLCAndG9rJywgc2lnbmFsKCkpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNhcHR1cmVkKCkudXJsLCAnaHR0cHM6Ly9naGUuYWNtZS5jb20vYXBpL2dyYXBocWwnKTtcblx0fSk7XG59KTtcbiJdLAogICJtYXBwaW5ncyI6ICJBQUtBLE9BQU8sWUFBWTtBQUNuQixTQUFTLCtDQUErQztBQUN4RCxTQUFTLHNCQUFzQjtBQUMvQixTQUFTLCtCQUFtRDtBQUM1RCxTQUFTLHVDQUF1QztBQUNoRCxTQUFTLDZCQUE2QjtBQUt0QyxNQUFNLDRCQUE0QixlQUFlO0FBQUEsRUFBakQ7QUFBQTtBQUNDLFNBQVMsU0FBbUIsQ0FBQztBQUFBO0FBQUEsRUFFcEIsTUFBTSxZQUE0QixNQUF1QjtBQUNqRSxTQUFLLE9BQU8sS0FBSyxDQUFDLFNBQVMsR0FBRyxJQUFJLEVBQUUsSUFBSSxXQUFTLGlCQUFpQixRQUFRLE1BQU0sVUFBVSxPQUFPLEtBQUssQ0FBQyxFQUFFLEtBQUssR0FBRyxDQUFDO0FBQUEsRUFDbkg7QUFDRDtBQUVBLFNBQVMsT0FBTyxPQUF1QztBQUN0RCxNQUFJLE9BQU8sVUFBVSxVQUFVO0FBQzlCLFdBQU87QUFBQSxFQUNSO0FBQ0EsU0FBTyxpQkFBaUIsTUFBTSxNQUFNLE9BQU8sTUFBTTtBQUNsRDtBQUVBLFNBQVMsWUFBWSxXQUEwQixlQUF3QixhQUFhLElBQUksZUFBZSxHQUE0QjtBQUNsSSxTQUFPLElBQUksd0JBQXdCLFdBQVcsWUFBWSxnQ0FBZ0MsYUFBYSxDQUFDO0FBQ3pHO0FBRUEsU0FBUyxTQUFzQjtBQUM5QixTQUFPLElBQUksZ0JBQWdCLEVBQUU7QUFDOUI7QUFFQSxTQUFTLGVBQWUsVUFBd0U7QUFDL0YsTUFBSSxjQUF3QixFQUFFLEtBQUssSUFBSSxNQUFNLE9BQVU7QUFDdkQsUUFBTSxPQUFzQixPQUFPLE9BQU8sU0FBUztBQUNsRCxrQkFBYyxFQUFFLEtBQUssT0FBTyxLQUFLLEdBQUcsS0FBSztBQUN6QyxXQUFPO0FBQUEsRUFDUjtBQUNBLFNBQU8sRUFBRSxPQUFPLE1BQU0sVUFBVSxN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
