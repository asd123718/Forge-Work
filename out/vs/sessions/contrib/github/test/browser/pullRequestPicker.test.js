import assert from "assert";
import { DeferredPromise } from "../../../../../base/common/async.js";
import { Codicon } from "../../../../../base/common/codicons.js";
import { Schemas } from "../../../../../base/common/network.js";
import { constObservable } from "../../../../../base/common/observable.js";
import { URI } from "../../../../../base/common/uri.js";
import { mock } from "../../../../../base/test/common/mock.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../../base/test/common/utils.js";
import { readSessionGitHubState } from "../../../../../platform/agentHost/common/state/sessionState.js";
import { createPullRequestBootstrapPrompt, createPullRequestContextAttachment, createPullRequestQuickPickItems, createPullRequestSessionMetadata, getExistingPullRequests, getGitHubRepositoryFromRemotes, getPullRequestNumberFromCheckoutRef, mergePullRequestSummaries, pullRequestMatchesQuery, resolvePullRequestSessionRepository } from "../../browser/pullRequestPicker.js";
import { createAndOpenPullRequestSession } from "../../browser/pullRequestSessionCreation.js";
suite("Create Session from Pull Request", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  test("groups available pull requests by review and assignment priority", () => {
    const items = createPullRequestQuickPickItems([
      pullRequest(1, { reviewRequestedFromViewer: true, assignedToViewer: true }),
      pullRequest(2, { assignedToViewer: true }),
      pullRequest(3),
      pullRequest(4, { reviewRequestedFromViewer: true })
    ], { numbers: /* @__PURE__ */ new Set([4]), headRefs: /* @__PURE__ */ new Set() });
    assert.deepStrictEqual(items.map((item) => item.type === "separator" ? { separator: item.label } : { pullRequest: item.pullRequest.number }), [
      { separator: "Waiting for My Review" },
      { pullRequest: 1 },
      { separator: "Assigned to Me" },
      { pullRequest: 2 },
      { separator: "Other Pull Requests" },
      { pullRequest: 3 }
    ]);
  });
  test("renders the requested two-line pull request information", () => {
    const [separator, item] = createPullRequestQuickPickItems([
      pullRequest(17, { title: "Fix session creation", additions: 24, deletions: 5 })
    ], { numbers: /* @__PURE__ */ new Set(), headRefs: /* @__PURE__ */ new Set() });
    assert.deepStrictEqual({
      separator: separator.type,
      label: item.label,
      detailHasAuthor: item.detail?.includes("@author"),
      detailHasDiff: item.detail?.includes("+24 -5")
    }, {
      separator: "separator",
      label: "#17 Fix session creation",
      detailHasAuthor: true,
      detailHasDiff: true
    });
  });
  test("uses semantic open and draft pull request icon classes", () => {
    const items = createPullRequestQuickPickItems([
      pullRequest(17),
      pullRequest(18, { isDraft: true })
    ], { numbers: /* @__PURE__ */ new Set(), headRefs: /* @__PURE__ */ new Set() }).filter((item) => item.type !== "separator");
    assert.deepStrictEqual(items.map((item) => item.iconClass), [
      "codicon codicon-git-pull-request sessions-pull-request-open",
      "codicon codicon-git-pull-request-draft sessions-pull-request-draft"
    ]);
  });
  test("matches pull requests by number, title, and author", () => {
    const item = pullRequest(42, { title: "Improve pull request picker" });
    assert.deepStrictEqual({
      number: pullRequestMatchesQuery(item, "#42"),
      title: pullRequestMatchesQuery(item, "request picker"),
      author: pullRequestMatchesQuery(item, "AUTHOR"),
      missing: pullRequestMatchesQuery(item, "unrelated")
    }, {
      number: true,
      title: true,
      author: true,
      missing: false
    });
  });
  test("merges viewer-group results into the loaded catalog without dropping either set", () => {
    const merged = mergePullRequestSummaries([
      pullRequest(1),
      pullRequest(2)
    ], [
      pullRequest(3, { reviewRequestedFromViewer: true }),
      pullRequest(2, { assignedToViewer: true })
    ]);
    assert.deepStrictEqual(merged.map((item) => ({
      number: item.number,
      review: item.reviewRequestedFromViewer,
      assigned: item.assignedToViewer
    })), [
      { number: 1, review: false, assigned: false },
      { number: 2, review: false, assigned: true },
      { number: 3, review: true, assigned: false }
    ]);
  });
  test("bootstrap prompt forbids tools and file operations", () => {
    assert.strictEqual(
      createPullRequestBootstrapPrompt(pullRequest(42, { title: "Improve pull request picker" })),
      'Initialize this session for pull request #42. The attached JSON is a complete pull request snapshot. For future questions about this pull request, use the attached snapshot as the primary source and do not fetch pull request data or run tools unless the user explicitly asks for refreshed information or the requested information is absent from the snapshot. Do not inspect or modify files, use tools, or take any other action until the user sends a visible follow-up request. Reply only with "Ready".'
    );
  });
  test("creates session metadata with the selected pull request identity", () => {
    assert.deepStrictEqual(
      readSessionGitHubState(createPullRequestSessionMetadata("microsoft", "vscode", pullRequest(42, { headRef: "feature" }))),
      {
        owner: "microsoft",
        repo: "vscode",
        pullRequestUrls: ["https://github.com/microsoft/vscode/pull/42"],
        pullRequestBranchName: "feature"
      }
    );
  });
  test("creates a transcript context attachment containing the PR snapshot as JSON", () => {
    const attachment = createPullRequestContextAttachment({
      owner: "owner",
      repo: "repo",
      number: 42,
      url: "https://github.com/owner/repo/pull/42",
      title: "Improve sessions",
      description: "Description",
      author: "author",
      isDraft: false,
      baseRef: "main",
      branchName: "feature",
      headRef: "feature",
      updatedAt: "2026-01-01T00:00:00Z",
      patch: "@@ -1 +1 @@",
      comments: []
    });
    assert.deepStrictEqual({
      kind: attachment.kind,
      name: attachment.name,
      fullName: attachment.fullName,
      icon: attachment.icon?.id,
      uri: attachment.uri.toString(),
      value: JSON.parse(attachment.value ?? "")
    }, {
      kind: "transcriptContext",
      name: "#42 Improve sessions",
      fullName: "#42 Improve sessions",
      icon: "git-pull-request",
      uri: "https://github.com/owner/repo/pull/42",
      value: {
        usageInstructions: "Use this snapshot as the primary source for questions about the pull request. Do not fetch pull request data or run tools unless the user explicitly asks for refreshed information or the requested information is absent from this snapshot.",
        owner: "owner",
        repo: "repo",
        number: 42,
        url: "https://github.com/owner/repo/pull/42",
        title: "Improve sessions",
        description: "Description",
        author: "author",
        isDraft: false,
        baseRef: "main",
        branchName: "feature",
        headRef: "feature",
        updatedAt: "2026-01-01T00:00:00Z",
        patch: "@@ -1 +1 @@",
        comments: []
      }
    });
  });
  test("shows the provisional session before configuration starts", async () => {
    const resource = URI.parse("test:///session");
    const session = new class extends mock() {
      constructor() {
        super(...arguments);
        this.resource = resource;
      }
    }();
    const commitBarrier = new DeferredPromise();
    const events = [];
    const resultPromise = createAndOpenPullRequestSession(
      async (onSessionCreated) => {
        events.push("create");
        onSessionCreated(session);
        events.push("configureWorktree");
        await commitBarrier.p;
        events.push("commit");
        return session;
      },
      (openedResource) => {
        events.push(`show:${openedResource.toString()}`);
      },
      () => {
        events.push("hidePicker");
      }
    );
    await Promise.resolve();
    const whileCreatingWorktree = [...events];
    commitBarrier.complete();
    const result = await resultPromise;
    assert.deepStrictEqual({
      whileCreatingWorktree,
      events,
      result: result?.resource.toString()
    }, {
      whileCreatingWorktree: ["create", `show:${resource.toString()}`, "hidePicker", "configureWorktree"],
      events: ["create", `show:${resource.toString()}`, "hidePicker", "configureWorktree", "commit"],
      result: resource.toString()
    });
  });
  test("collects existing pull requests from matching metadata and repository-scoped branches", () => {
    const repositoryRoot = URI.file("/repos/microsoft/vscode");
    const cloudRoot = URI.parse("github-remote-file://github/microsoft/vscode/feature-seven");
    const repositorySessionAwaitingMetadata = sessionWithRepository(repositoryRoot, "microsoft", "vscode", false, "origin/feature-three");
    const pullRefSessionAwaitingMetadata = sessionWithRepository(repositoryRoot, "microsoft", "vscode", false, "origin/pull/5/head");
    const sessions = [
      sessionWithPullRequest("microsoft", "vscode", 1),
      sessionWithPullRequest("microsoft", "vscode", 2, "origin/feature-two"),
      sessionWithPullRequest("Microsoft", "VSCode", 4),
      sessionWithPullRequest("microsoft", "vscode", 7, void 0, cloudRoot),
      repositorySessionAwaitingMetadata,
      pullRefSessionAwaitingMetadata,
      sessionWithPullRequest("other", "vscode", 3)
    ];
    const existing = getExistingPullRequests(sessions, "microsoft", "vscode", [repositorySessionAwaitingMetadata, pullRefSessionAwaitingMetadata]);
    const availableItems = createPullRequestQuickPickItems([
      pullRequest(5, { headRef: "feature-three" }),
      pullRequest(7),
      pullRequest(6)
    ], existing);
    assert.deepStrictEqual({
      numbers: [...existing.numbers],
      headRefs: [...existing.headRefs],
      availableNumbers: availableItems.flatMap((item) => item.type === "separator" ? [] : [item.pullRequest.number])
    }, {
      numbers: [1, 2, 4, 5],
      headRefs: ["feature-two", "feature-three", "pull/5/head"],
      availableNumbers: [7, 6]
    });
  });
  test("extracts PR numbers from checkout refs", () => {
    assert.deepStrictEqual({
      pull: getPullRequestNumberFromCheckoutRef("pull/42/head"),
      full: getPullRequestNumberFromCheckoutRef("refs/pull/42/head"),
      branch: getPullRequestNumberFromCheckoutRef("feature")
    }, {
      pull: 42,
      full: 42,
      branch: void 0
    });
  });
  test("resolves non-cloud repositories from session metadata or Git remotes", async () => {
    const cloudRoot = URI.parse("github-remote-file://github/alexr00/playground/copilot%252Finspect-pull-request-748");
    const localRoot = URI.file("/repos/alexr00/playground");
    const remoteRoot = URI.parse("vscode-remote://ssh-remote+host/repos/alexr00/playground");
    const cloudSession = sessionWithRepository(cloudRoot, "alexr00", "playground");
    const localSession = sessionWithRepository(localRoot, "alexr00", "playground", false);
    const remoteSession = sessionWithRepository(remoteRoot, "alexr00", "playground");
    assert.deepStrictEqual({
      cloud: await resolvePullRequestSessionRepository([cloudSession], async () => void 0),
      local: await resolvePullRequestSessionRepository([localSession], async () => ({ owner: "alexr00", repo: "playground" })),
      mixed: await resolvePullRequestSessionRepository([cloudSession, localSession], async () => void 0),
      remote: await resolvePullRequestSessionRepository([remoteSession], async () => void 0)
    }, {
      cloud: void 0,
      local: {
        folderUri: localRoot,
        owner: "alexr00",
        repo: "playground"
      },
      mixed: {
        folderUri: localRoot,
        owner: "alexr00",
        repo: "playground"
      },
      remote: {
        folderUri: remoteRoot,
        owner: "alexr00",
        repo: "playground"
      }
    });
  });
  test("parses GitHub repository identity from origin before other remotes", () => {
    assert.deepStrictEqual({
      https: getGitHubRepositoryFromRemotes([
        { name: "upstream", fetchUrl: "git@github.com:microsoft/vscode.git" },
        { name: "origin", fetchUrl: "https://github.com/alexr00/vscode.git" }
      ]),
      ssh: getGitHubRepositoryFromRemotes([
        { name: "origin", fetchUrl: "ssh://git@github.com/alexr00/playground" }
      ]),
      nonGitHub: getGitHubRepositoryFromRemotes([
        { name: "origin", fetchUrl: "https://example.com/alexr00/playground.git" }
      ])
    }, {
      https: { owner: "alexr00", repo: "vscode" },
      ssh: { owner: "alexr00", repo: "playground" },
      nonGitHub: void 0
    });
  });
});
function pullRequest(number, overrides = {}) {
  return {
    number,
    title: `Pull request ${number}`,
    author: { login: "author", avatarUrl: "" },
    headRef: `feature-${number}`,
    isDraft: false,
    updatedAt: (/* @__PURE__ */ new Date()).toISOString(),
    additions: 1,
    deletions: 1,
    reviewRequestedFromViewer: false,
    assignedToViewer: false,
    ...overrides,
    checkoutRef: overrides.checkoutRef ?? `refs/pull/${number}/head`
  };
}
function sessionWithPullRequest(owner, repo, number, upstreamBranchName, root = URI.file("/repo")) {
  const workspace = {
    uri: root,
    label: repo,
    icon: Codicon.folder,
    folders: [{
      root,
      workingDirectory: root,
      name: repo,
      description: void 0,
      gitRepository: {
        uri: root,
        workTreeUri: root,
        baseBranchName: "main",
        upstreamBranchName,
        gitHubInfo: constObservable({
          owner,
          repo,
          pullRequest: {
            number,
            uri: URI.parse(`https://github.com/${owner}/${repo}/pull/${number}`)
          }
        })
      }
    }],
    requiresWorkspaceTrust: false,
    isVirtualWorkspace: root.scheme !== Schemas.file
  };
  return sessionWithWorkspace(workspace);
}
function sessionWithRepository(root, owner, repo, includeGitHubInfo = true, upstreamBranchName) {
  return sessionWithWorkspace({
    uri: root,
    label: repo,
    icon: Codicon.folder,
    folders: [{
      root,
      workingDirectory: root,
      name: repo,
      description: void 0,
      gitRepository: {
        uri: root,
        workTreeUri: root,
        baseBranchName: "main",
        upstreamBranchName,
        gitHubInfo: constObservable(includeGitHubInfo ? { owner, repo } : void 0)
      }
    }],
    requiresWorkspaceTrust: false,
    isVirtualWorkspace: root.scheme !== Schemas.file
  });
}
function sessionWithWorkspace(workspace) {
  return new class extends mock() {
    constructor() {
      super(...arguments);
      this.workspace = constObservable(workspace);
    }
  }();
}
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxzZXNzaW9uc1xcY29udHJpYlxcZ2l0aHViXFx0ZXN0XFxicm93c2VyXFxwdWxsUmVxdWVzdFBpY2tlci50ZXN0LnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IGFzc2VydCBmcm9tICdhc3NlcnQnO1xuaW1wb3J0IHsgRGVmZXJyZWRQcm9taXNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vYXN5bmMuanMnO1xuaW1wb3J0IHsgQ29kaWNvbiB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2NvZGljb25zLmpzJztcbmltcG9ydCB7IFNjaGVtYXMgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9uZXR3b3JrLmpzJztcbmltcG9ydCB7IGNvbnN0T2JzZXJ2YWJsZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL29ic2VydmFibGUuanMnO1xuaW1wb3J0IHsgVVJJIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdXJpLmpzJztcbmltcG9ydCB7IG1vY2sgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL3Rlc3QvY29tbW9uL21vY2suanMnO1xuaW1wb3J0IHsgZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS90ZXN0L2NvbW1vbi91dGlscy5qcyc7XG5pbXBvcnQgeyByZWFkU2Vzc2lvbkdpdEh1YlN0YXRlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vYWdlbnRIb3N0L2NvbW1vbi9zdGF0ZS9zZXNzaW9uU3RhdGUuanMnO1xuaW1wb3J0IHsgSVNlc3Npb24sIElTZXNzaW9uV29ya3NwYWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vc2VydmljZXMvc2Vzc2lvbnMvY29tbW9uL3Nlc3Npb24uanMnO1xuaW1wb3J0IHsgY3JlYXRlUHVsbFJlcXVlc3RCb290c3RyYXBQcm9tcHQsIGNyZWF0ZVB1bGxSZXF1ZXN0Q29udGV4dEF0dGFjaG1lbnQsIGNyZWF0ZVB1bGxSZXF1ZXN0UXVpY2tQaWNrSXRlbXMsIGNyZWF0ZVB1bGxSZXF1ZXN0U2Vzc2lvbk1ldGFkYXRhLCBnZXRFeGlzdGluZ1B1bGxSZXF1ZXN0cywgZ2V0R2l0SHViUmVwb3NpdG9yeUZyb21SZW1vdGVzLCBnZXRQdWxsUmVxdWVzdE51bWJlckZyb21DaGVja291dFJlZiwgSVB1bGxSZXF1ZXN0UXVpY2tQaWNrSXRlbSwgbWVyZ2VQdWxsUmVxdWVzdFN1bW1hcmllcywgcHVsbFJlcXVlc3RNYXRjaGVzUXVlcnksIHJlc29sdmVQdWxsUmVxdWVzdFNlc3Npb25SZXBvc2l0b3J5IH0gZnJvbSAnLi4vLi4vYnJvd3Nlci9wdWxsUmVxdWVzdFBpY2tlci5qcyc7XG5pbXBvcnQgeyBJR2l0SHViUHVsbFJlcXVlc3RTdW1tYXJ5IH0gZnJvbSAnLi4vLi4vY29tbW9uL3R5cGVzLmpzJztcbmltcG9ydCB7IGNyZWF0ZUFuZE9wZW5QdWxsUmVxdWVzdFNlc3Npb24gfSBmcm9tICcuLi8uLi9icm93c2VyL3B1bGxSZXF1ZXN0U2Vzc2lvbkNyZWF0aW9uLmpzJztcblxuc3VpdGUoJ0NyZWF0ZSBTZXNzaW9uIGZyb20gUHVsbCBSZXF1ZXN0JywgKCkgPT4ge1xuXG5cdGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSgpO1xuXG5cdHRlc3QoJ2dyb3VwcyBhdmFpbGFibGUgcHVsbCByZXF1ZXN0cyBieSByZXZpZXcgYW5kIGFzc2lnbm1lbnQgcHJpb3JpdHknLCAoKSA9PiB7XG5cdFx0Y29uc3QgaXRlbXMgPSBjcmVhdGVQdWxsUmVxdWVzdFF1aWNrUGlja0l0ZW1zKFtcblx0XHRcdHB1bGxSZXF1ZXN0KDEsIHsgcmV2aWV3UmVxdWVzdGVkRnJvbVZpZXdlcjogdHJ1ZSwgYXNzaWduZWRUb1ZpZXdlcjogdHJ1ZSB9KSxcblx0XHRcdHB1bGxSZXF1ZXN0KDIsIHsgYXNzaWduZWRUb1ZpZXdlcjogdHJ1ZSB9KSxcblx0XHRcdHB1bGxSZXF1ZXN0KDMpLFxuXHRcdFx0cHVsbFJlcXVlc3QoNCwgeyByZXZpZXdSZXF1ZXN0ZWRGcm9tVmlld2VyOiB0cnVlIH0pLFxuXHRcdF0sIHsgbnVtYmVyczogbmV3IFNldChbNF0pLCBoZWFkUmVmczogbmV3IFNldCgpIH0pO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChpdGVtcy5tYXAoaXRlbSA9PiBpdGVtLnR5cGUgPT09ICdzZXBhcmF0b3InXG5cdFx0XHQ/IHsgc2VwYXJhdG9yOiBpdGVtLmxhYmVsIH1cblx0XHRcdDogeyBwdWxsUmVxdWVzdDogaXRlbS5wdWxsUmVxdWVzdC5udW1iZXIgfSksIFtcblx0XHRcdHsgc2VwYXJhdG9yOiAnV2FpdGluZyBmb3IgTXkgUmV2aWV3JyB9LFxuXHRcdFx0eyBwdWxsUmVxdWVzdDogMSB9LFxuXHRcdFx0eyBzZXBhcmF0b3I6ICdBc3NpZ25lZCB0byBNZScgfSxcblx0XHRcdHsgcHVsbFJlcXVlc3Q6IDIgfSxcblx0XHRcdHsgc2VwYXJhdG9yOiAnT3RoZXIgUHVsbCBSZXF1ZXN0cycgfSxcblx0XHRcdHsgcHVsbFJlcXVlc3Q6IDMgfSxcblx0XHRdKTtcblx0fSk7XG5cblx0dGVzdCgncmVuZGVycyB0aGUgcmVxdWVzdGVkIHR3by1saW5lIHB1bGwgcmVxdWVzdCBpbmZvcm1hdGlvbicsICgpID0+IHtcblx0XHRjb25zdCBbc2VwYXJhdG9yLCBpdGVtXSA9IGNyZWF0ZVB1bGxSZXF1ZXN0UXVpY2tQaWNrSXRlbXMoW1xuXHRcdFx0cHVsbFJlcXVlc3QoMTcsIHsgdGl0bGU6ICdGaXggc2Vzc2lvbiBjcmVhdGlvbicsIGFkZGl0aW9uczogMjQsIGRlbGV0aW9uczogNSB9KSxcblx0XHRdLCB7IG51bWJlcnM6IG5ldyBTZXQoKSwgaGVhZFJlZnM6IG5ldyBTZXQoKSB9KSBhcyByZWFkb25seSBbeyByZWFkb25seSB0eXBlOiAnc2VwYXJhdG9yJyB9LCBJUHVsbFJlcXVlc3RRdWlja1BpY2tJdGVtXTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0c2VwYXJhdG9yOiBzZXBhcmF0b3IudHlwZSxcblx0XHRcdGxhYmVsOiBpdGVtLmxhYmVsLFxuXHRcdFx0ZGV0YWlsSGFzQXV0aG9yOiBpdGVtLmRldGFpbD8uaW5jbHVkZXMoJ0BhdXRob3InKSxcblx0XHRcdGRldGFpbEhhc0RpZmY6IGl0ZW0uZGV0YWlsPy5pbmNsdWRlcygnKzI0IC01JyksXG5cdFx0fSwge1xuXHRcdFx0c2VwYXJhdG9yOiAnc2VwYXJhdG9yJyxcblx0XHRcdGxhYmVsOiAnIzE3IEZpeCBzZXNzaW9uIGNyZWF0aW9uJyxcblx0XHRcdGRldGFpbEhhc0F1dGhvcjogdHJ1ZSxcblx0XHRcdGRldGFpbEhhc0RpZmY6IHRydWUsXG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3VzZXMgc2VtYW50aWMgb3BlbiBhbmQgZHJhZnQgcHVsbCByZXF1ZXN0IGljb24gY2xhc3NlcycsICgpID0+IHtcblx0XHRjb25zdCBpdGVtcyA9IGNyZWF0ZVB1bGxSZXF1ZXN0UXVpY2tQaWNrSXRlbXMoW1xuXHRcdFx0cHVsbFJlcXVlc3QoMTcpLFxuXHRcdFx0cHVsbFJlcXVlc3QoMTgsIHsgaXNEcmFmdDogdHJ1ZSB9KSxcblx0XHRdLCB7IG51bWJlcnM6IG5ldyBTZXQoKSwgaGVhZFJlZnM6IG5ldyBTZXQoKSB9KS5maWx0ZXIoKGl0ZW0pOiBpdGVtIGlzIElQdWxsUmVxdWVzdFF1aWNrUGlja0l0ZW0gPT4gaXRlbS50eXBlICE9PSAnc2VwYXJhdG9yJyk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGl0ZW1zLm1hcChpdGVtID0+IGl0ZW0uaWNvbkNsYXNzKSwgW1xuXHRcdFx0J2NvZGljb24gY29kaWNvbi1naXQtcHVsbC1yZXF1ZXN0IHNlc3Npb25zLXB1bGwtcmVxdWVzdC1vcGVuJyxcblx0XHRcdCdjb2RpY29uIGNvZGljb24tZ2l0LXB1bGwtcmVxdWVzdC1kcmFmdCBzZXNzaW9ucy1wdWxsLXJlcXVlc3QtZHJhZnQnLFxuXHRcdF0pO1xuXHR9KTtcblxuXHR0ZXN0KCdtYXRjaGVzIHB1bGwgcmVxdWVzdHMgYnkgbnVtYmVyLCB0aXRsZSwgYW5kIGF1dGhvcicsICgpID0+IHtcblx0XHRjb25zdCBpdGVtID0gcHVsbFJlcXVlc3QoNDIsIHsgdGl0bGU6ICdJbXByb3ZlIHB1bGwgcmVxdWVzdCBwaWNrZXInIH0pO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0bnVtYmVyOiBwdWxsUmVxdWVzdE1hdGNoZXNRdWVyeShpdGVtLCAnIzQyJyksXG5cdFx0XHR0aXRsZTogcHVsbFJlcXVlc3RNYXRjaGVzUXVlcnkoaXRlbSwgJ3JlcXVlc3QgcGlja2VyJyksXG5cdFx0XHRhdXRob3I6IHB1bGxSZXF1ZXN0TWF0Y2hlc1F1ZXJ5KGl0ZW0sICdBVVRIT1InKSxcblx0XHRcdG1pc3Npbmc6IHB1bGxSZXF1ZXN0TWF0Y2hlc1F1ZXJ5KGl0ZW0sICd1bnJlbGF0ZWQnKSxcblx0XHR9LCB7XG5cdFx0XHRudW1iZXI6IHRydWUsXG5cdFx0XHR0aXRsZTogdHJ1ZSxcblx0XHRcdGF1dGhvcjogdHJ1ZSxcblx0XHRcdG1pc3Npbmc6IGZhbHNlLFxuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdtZXJnZXMgdmlld2VyLWdyb3VwIHJlc3VsdHMgaW50byB0aGUgbG9hZGVkIGNhdGFsb2cgd2l0aG91dCBkcm9wcGluZyBlaXRoZXIgc2V0JywgKCkgPT4ge1xuXHRcdGNvbnN0IG1lcmdlZCA9IG1lcmdlUHVsbFJlcXVlc3RTdW1tYXJpZXMoW1xuXHRcdFx0cHVsbFJlcXVlc3QoMSksXG5cdFx0XHRwdWxsUmVxdWVzdCgyKSxcblx0XHRdLCBbXG5cdFx0XHRwdWxsUmVxdWVzdCgzLCB7IHJldmlld1JlcXVlc3RlZEZyb21WaWV3ZXI6IHRydWUgfSksXG5cdFx0XHRwdWxsUmVxdWVzdCgyLCB7IGFzc2lnbmVkVG9WaWV3ZXI6IHRydWUgfSksXG5cdFx0XSk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKG1lcmdlZC5tYXAoaXRlbSA9PiAoe1xuXHRcdFx0bnVtYmVyOiBpdGVtLm51bWJlcixcblx0XHRcdHJldmlldzogaXRlbS5yZXZpZXdSZXF1ZXN0ZWRGcm9tVmlld2VyLFxuXHRcdFx0YXNzaWduZWQ6IGl0ZW0uYXNzaWduZWRUb1ZpZXdlcixcblx0XHR9KSksIFtcblx0XHRcdHsgbnVtYmVyOiAxLCByZXZpZXc6IGZhbHNlLCBhc3NpZ25lZDogZmFsc2UgfSxcblx0XHRcdHsgbnVtYmVyOiAyLCByZXZpZXc6IGZhbHNlLCBhc3NpZ25lZDogdHJ1ZSB9LFxuXHRcdFx0eyBudW1iZXI6IDMsIHJldmlldzogdHJ1ZSwgYXNzaWduZWQ6IGZhbHNlIH0sXG5cdFx0XSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2Jvb3RzdHJhcCBwcm9tcHQgZm9yYmlkcyB0b29scyBhbmQgZmlsZSBvcGVyYXRpb25zJywgKCkgPT4ge1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChcblx0XHRcdGNyZWF0ZVB1bGxSZXF1ZXN0Qm9vdHN0cmFwUHJvbXB0KHB1bGxSZXF1ZXN0KDQyLCB7IHRpdGxlOiAnSW1wcm92ZSBwdWxsIHJlcXVlc3QgcGlja2VyJyB9KSksXG5cdFx0XHQnSW5pdGlhbGl6ZSB0aGlzIHNlc3Npb24gZm9yIHB1bGwgcmVxdWVzdCAjNDIuIFRoZSBhdHRhY2hlZCBKU09OIGlzIGEgY29tcGxldGUgcHVsbCByZXF1ZXN0IHNuYXBzaG90LiBGb3IgZnV0dXJlIHF1ZXN0aW9ucyBhYm91dCB0aGlzIHB1bGwgcmVxdWVzdCwgdXNlIHRoZSBhdHRhY2hlZCBzbmFwc2hvdCBhcyB0aGUgcHJpbWFyeSBzb3VyY2UgYW5kIGRvIG5vdCBmZXRjaCBwdWxsIHJlcXVlc3QgZGF0YSBvciBydW4gdG9vbHMgdW5sZXNzIHRoZSB1c2VyIGV4cGxpY2l0bHkgYXNrcyBmb3IgcmVmcmVzaGVkIGluZm9ybWF0aW9uIG9yIHRoZSByZXF1ZXN0ZWQgaW5mb3JtYXRpb24gaXMgYWJzZW50IGZyb20gdGhlIHNuYXBzaG90LiBEbyBub3QgaW5zcGVjdCBvciBtb2RpZnkgZmlsZXMsIHVzZSB0b29scywgb3IgdGFrZSBhbnkgb3RoZXIgYWN0aW9uIHVudGlsIHRoZSB1c2VyIHNlbmRzIGEgdmlzaWJsZSBmb2xsb3ctdXAgcmVxdWVzdC4gUmVwbHkgb25seSB3aXRoIFwiUmVhZHlcIi4nLFxuXHRcdCk7XG5cdH0pO1xuXG5cdHRlc3QoJ2NyZWF0ZXMgc2Vzc2lvbiBtZXRhZGF0YSB3aXRoIHRoZSBzZWxlY3RlZCBwdWxsIHJlcXVlc3QgaWRlbnRpdHknLCAoKSA9PiB7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChcblx0XHRcdHJlYWRTZXNzaW9uR2l0SHViU3RhdGUoY3JlYXRlUHVsbFJlcXVlc3RTZXNzaW9uTWV0YWRhdGEoJ21pY3Jvc29mdCcsICd2c2NvZGUnLCBwdWxsUmVxdWVzdCg0MiwgeyBoZWFkUmVmOiAnZmVhdHVyZScgfSkpKSxcblx0XHRcdHtcblx0XHRcdFx0b3duZXI6ICdtaWNyb3NvZnQnLFxuXHRcdFx0XHRyZXBvOiAndnNjb2RlJyxcblx0XHRcdFx0cHVsbFJlcXVlc3RVcmxzOiBbJ2h0dHBzOi8vZ2l0aHViLmNvbS9taWNyb3NvZnQvdnNjb2RlL3B1bGwvNDInXSxcblx0XHRcdFx0cHVsbFJlcXVlc3RCcmFuY2hOYW1lOiAnZmVhdHVyZScsXG5cdFx0XHR9LFxuXHRcdCk7XG5cdH0pO1xuXG5cdHRlc3QoJ2NyZWF0ZXMgYSB0cmFuc2NyaXB0IGNvbnRleHQgYXR0YWNobWVudCBjb250YWluaW5nIHRoZSBQUiBzbmFwc2hvdCBhcyBKU09OJywgKCkgPT4ge1xuXHRcdGNvbnN0IGF0dGFjaG1lbnQgPSBjcmVhdGVQdWxsUmVxdWVzdENvbnRleHRBdHRhY2htZW50KHtcblx0XHRcdG93bmVyOiAnb3duZXInLFxuXHRcdFx0cmVwbzogJ3JlcG8nLFxuXHRcdFx0bnVtYmVyOiA0Mixcblx0XHRcdHVybDogJ2h0dHBzOi8vZ2l0aHViLmNvbS9vd25lci9yZXBvL3B1bGwvNDInLFxuXHRcdFx0dGl0bGU6ICdJbXByb3ZlIHNlc3Npb25zJyxcblx0XHRcdGRlc2NyaXB0aW9uOiAnRGVzY3JpcHRpb24nLFxuXHRcdFx0YXV0aG9yOiAnYXV0aG9yJyxcblx0XHRcdGlzRHJhZnQ6IGZhbHNlLFxuXHRcdFx0YmFzZVJlZjogJ21haW4nLFxuXHRcdFx0YnJhbmNoTmFtZTogJ2ZlYXR1cmUnLFxuXHRcdFx0aGVhZFJlZjogJ2ZlYXR1cmUnLFxuXHRcdFx0dXBkYXRlZEF0OiAnMjAyNi0wMS0wMVQwMDowMDowMFonLFxuXHRcdFx0cGF0Y2g6ICdAQCAtMSArMSBAQCcsXG5cdFx0XHRjb21tZW50czogW10sXG5cdFx0fSk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdGtpbmQ6IGF0dGFjaG1lbnQua2luZCxcblx0XHRcdG5hbWU6IGF0dGFjaG1lbnQubmFtZSxcblx0XHRcdGZ1bGxOYW1lOiBhdHRhY2htZW50LmZ1bGxOYW1lLFxuXHRcdFx0aWNvbjogYXR0YWNobWVudC5pY29uPy5pZCxcblx0XHRcdHVyaTogYXR0YWNobWVudC51cmkudG9TdHJpbmcoKSxcblx0XHRcdHZhbHVlOiBKU09OLnBhcnNlKGF0dGFjaG1lbnQudmFsdWUgPz8gJycpLFxuXHRcdH0sIHtcblx0XHRcdGtpbmQ6ICd0cmFuc2NyaXB0Q29udGV4dCcsXG5cdFx0XHRuYW1lOiAnIzQyIEltcHJvdmUgc2Vzc2lvbnMnLFxuXHRcdFx0ZnVsbE5hbWU6ICcjNDIgSW1wcm92ZSBzZXNzaW9ucycsXG5cdFx0XHRpY29uOiAnZ2l0LXB1bGwtcmVxdWVzdCcsXG5cdFx0XHR1cmk6ICdodHRwczovL2dpdGh1Yi5jb20vb3duZXIvcmVwby9wdWxsLzQyJyxcblx0XHRcdHZhbHVlOiB7XG5cdFx0XHRcdHVzYWdlSW5zdHJ1Y3Rpb25zOiAnVXNlIHRoaXMgc25hcHNob3QgYXMgdGhlIHByaW1hcnkgc291cmNlIGZvciBxdWVzdGlvbnMgYWJvdXQgdGhlIHB1bGwgcmVxdWVzdC4gRG8gbm90IGZldGNoIHB1bGwgcmVxdWVzdCBkYXRhIG9yIHJ1biB0b29scyB1bmxlc3MgdGhlIHVzZXIgZXhwbGljaXRseSBhc2tzIGZvciByZWZyZXNoZWQgaW5mb3JtYXRpb24gb3IgdGhlIHJlcXVlc3RlZCBpbmZvcm1hdGlvbiBpcyBhYnNlbnQgZnJvbSB0aGlzIHNuYXBzaG90LicsXG5cdFx0XHRcdG93bmVyOiAnb3duZXInLFxuXHRcdFx0XHRyZXBvOiAncmVwbycsXG5cdFx0XHRcdG51bWJlcjogNDIsXG5cdFx0XHRcdHVybDogJ2h0dHBzOi8vZ2l0aHViLmNvbS9vd25lci9yZXBvL3B1bGwvNDInLFxuXHRcdFx0XHR0aXRsZTogJ0ltcHJvdmUgc2Vzc2lvbnMnLFxuXHRcdFx0XHRkZXNjcmlwdGlvbjogJ0Rlc2NyaXB0aW9uJyxcblx0XHRcdFx0YXV0aG9yOiAnYXV0aG9yJyxcblx0XHRcdFx0aXNEcmFmdDogZmFsc2UsXG5cdFx0XHRcdGJhc2VSZWY6ICdtYWluJyxcblx0XHRcdFx0YnJhbmNoTmFtZTogJ2ZlYXR1cmUnLFxuXHRcdFx0XHRoZWFkUmVmOiAnZmVhdHVyZScsXG5cdFx0XHRcdHVwZGF0ZWRBdDogJzIwMjYtMDEtMDFUMDA6MDA6MDBaJyxcblx0XHRcdFx0cGF0Y2g6ICdAQCAtMSArMSBAQCcsXG5cdFx0XHRcdGNvbW1lbnRzOiBbXSxcblx0XHRcdH0sXG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3Nob3dzIHRoZSBwcm92aXNpb25hbCBzZXNzaW9uIGJlZm9yZSBjb25maWd1cmF0aW9uIHN0YXJ0cycsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCByZXNvdXJjZSA9IFVSSS5wYXJzZSgndGVzdDovLy9zZXNzaW9uJyk7XG5cdFx0Y29uc3Qgc2Vzc2lvbiA9IG5ldyBjbGFzcyBleHRlbmRzIG1vY2s8SVNlc3Npb24+KCkge1xuXHRcdFx0b3ZlcnJpZGUgcmVhZG9ubHkgcmVzb3VyY2UgPSByZXNvdXJjZTtcblx0XHR9KCk7XG5cdFx0Y29uc3QgY29tbWl0QmFycmllciA9IG5ldyBEZWZlcnJlZFByb21pc2U8dm9pZD4oKTtcblx0XHRjb25zdCBldmVudHM6IHN0cmluZ1tdID0gW107XG5cblx0XHRjb25zdCByZXN1bHRQcm9taXNlID0gY3JlYXRlQW5kT3BlblB1bGxSZXF1ZXN0U2Vzc2lvbihcblx0XHRcdGFzeW5jIG9uU2Vzc2lvbkNyZWF0ZWQgPT4ge1xuXHRcdFx0XHRldmVudHMucHVzaCgnY3JlYXRlJyk7XG5cdFx0XHRcdG9uU2Vzc2lvbkNyZWF0ZWQoc2Vzc2lvbik7XG5cdFx0XHRcdGV2ZW50cy5wdXNoKCdjb25maWd1cmVXb3JrdHJlZScpO1xuXHRcdFx0XHRhd2FpdCBjb21taXRCYXJyaWVyLnA7XG5cdFx0XHRcdGV2ZW50cy5wdXNoKCdjb21taXQnKTtcblx0XHRcdFx0cmV0dXJuIHNlc3Npb247XG5cdFx0XHR9LFxuXHRcdFx0b3BlbmVkUmVzb3VyY2UgPT4ge1xuXHRcdFx0XHRldmVudHMucHVzaChgc2hvdzoke29wZW5lZFJlc291cmNlLnRvU3RyaW5nKCl9YCk7XG5cdFx0XHR9LFxuXHRcdFx0KCkgPT4ge1xuXHRcdFx0XHRldmVudHMucHVzaCgnaGlkZVBpY2tlcicpO1xuXHRcdFx0fSxcblx0XHQpO1xuXHRcdGF3YWl0IFByb21pc2UucmVzb2x2ZSgpO1xuXHRcdGNvbnN0IHdoaWxlQ3JlYXRpbmdXb3JrdHJlZSA9IFsuLi5ldmVudHNdO1xuXHRcdGNvbW1pdEJhcnJpZXIuY29tcGxldGUoKTtcblx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCByZXN1bHRQcm9taXNlO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHR3aGlsZUNyZWF0aW5nV29ya3RyZWUsXG5cdFx0XHRldmVudHMsXG5cdFx0XHRyZXN1bHQ6IHJlc3VsdD8ucmVzb3VyY2UudG9TdHJpbmcoKSxcblx0XHR9LCB7XG5cdFx0XHR3aGlsZUNyZWF0aW5nV29ya3RyZWU6IFsnY3JlYXRlJywgYHNob3c6JHtyZXNvdXJjZS50b1N0cmluZygpfWAsICdoaWRlUGlja2VyJywgJ2NvbmZpZ3VyZVdvcmt0cmVlJ10sXG5cdFx0XHRldmVudHM6IFsnY3JlYXRlJywgYHNob3c6JHtyZXNvdXJjZS50b1N0cmluZygpfWAsICdoaWRlUGlja2VyJywgJ2NvbmZpZ3VyZVdvcmt0cmVlJywgJ2NvbW1pdCddLFxuXHRcdFx0cmVzdWx0OiByZXNvdXJjZS50b1N0cmluZygpLFxuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdjb2xsZWN0cyBleGlzdGluZyBwdWxsIHJlcXVlc3RzIGZyb20gbWF0Y2hpbmcgbWV0YWRhdGEgYW5kIHJlcG9zaXRvcnktc2NvcGVkIGJyYW5jaGVzJywgKCkgPT4ge1xuXHRcdGNvbnN0IHJlcG9zaXRvcnlSb290ID0gVVJJLmZpbGUoJy9yZXBvcy9taWNyb3NvZnQvdnNjb2RlJyk7XG5cdFx0Y29uc3QgY2xvdWRSb290ID0gVVJJLnBhcnNlKCdnaXRodWItcmVtb3RlLWZpbGU6Ly9naXRodWIvbWljcm9zb2Z0L3ZzY29kZS9mZWF0dXJlLXNldmVuJyk7XG5cdFx0Y29uc3QgcmVwb3NpdG9yeVNlc3Npb25Bd2FpdGluZ01ldGFkYXRhID0gc2Vzc2lvbldpdGhSZXBvc2l0b3J5KHJlcG9zaXRvcnlSb290LCAnbWljcm9zb2Z0JywgJ3ZzY29kZScsIGZhbHNlLCAnb3JpZ2luL2ZlYXR1cmUtdGhyZWUnKTtcblx0XHRjb25zdCBwdWxsUmVmU2Vzc2lvbkF3YWl0aW5nTWV0YWRhdGEgPSBzZXNzaW9uV2l0aFJlcG9zaXRvcnkocmVwb3NpdG9yeVJvb3QsICdtaWNyb3NvZnQnLCAndnNjb2RlJywgZmFsc2UsICdvcmlnaW4vcHVsbC81L2hlYWQnKTtcblx0XHRjb25zdCBzZXNzaW9ucyA9IFtcblx0XHRcdHNlc3Npb25XaXRoUHVsbFJlcXVlc3QoJ21pY3Jvc29mdCcsICd2c2NvZGUnLCAxKSxcblx0XHRcdHNlc3Npb25XaXRoUHVsbFJlcXVlc3QoJ21pY3Jvc29mdCcsICd2c2NvZGUnLCAyLCAnb3JpZ2luL2ZlYXR1cmUtdHdvJyksXG5cdFx0XHRzZXNzaW9uV2l0aFB1bGxSZXF1ZXN0KCdNaWNyb3NvZnQnLCAnVlNDb2RlJywgNCksXG5cdFx0XHRzZXNzaW9uV2l0aFB1bGxSZXF1ZXN0KCdtaWNyb3NvZnQnLCAndnNjb2RlJywgNywgdW5kZWZpbmVkLCBjbG91ZFJvb3QpLFxuXHRcdFx0cmVwb3NpdG9yeVNlc3Npb25Bd2FpdGluZ01ldGFkYXRhLFxuXHRcdFx0cHVsbFJlZlNlc3Npb25Bd2FpdGluZ01ldGFkYXRhLFxuXHRcdFx0c2Vzc2lvbldpdGhQdWxsUmVxdWVzdCgnb3RoZXInLCAndnNjb2RlJywgMyksXG5cdFx0XTtcblx0XHRjb25zdCBleGlzdGluZyA9IGdldEV4aXN0aW5nUHVsbFJlcXVlc3RzKHNlc3Npb25zLCAnbWljcm9zb2Z0JywgJ3ZzY29kZScsIFtyZXBvc2l0b3J5U2Vzc2lvbkF3YWl0aW5nTWV0YWRhdGEsIHB1bGxSZWZTZXNzaW9uQXdhaXRpbmdNZXRhZGF0YV0pO1xuXHRcdGNvbnN0IGF2YWlsYWJsZUl0ZW1zID0gY3JlYXRlUHVsbFJlcXVlc3RRdWlja1BpY2tJdGVtcyhbXG5cdFx0XHRwdWxsUmVxdWVzdCg1LCB7IGhlYWRSZWY6ICdmZWF0dXJlLXRocmVlJyB9KSxcblx0XHRcdHB1bGxSZXF1ZXN0KDcpLFxuXHRcdFx0cHVsbFJlcXVlc3QoNiksXG5cdFx0XSwgZXhpc3RpbmcpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0bnVtYmVyczogWy4uLmV4aXN0aW5nLm51bWJlcnNdLFxuXHRcdFx0aGVhZFJlZnM6IFsuLi5leGlzdGluZy5oZWFkUmVmc10sXG5cdFx0XHRhdmFpbGFibGVOdW1iZXJzOiBhdmFpbGFibGVJdGVtcy5mbGF0TWFwKGl0ZW0gPT4gaXRlbS50eXBlID09PSAnc2VwYXJhdG9yJyA/IFtdIDogW2l0ZW0ucHVsbFJlcXVlc3QubnVtYmVyXSksXG5cdFx0fSwge1xuXHRcdFx0bnVtYmVyczogWzEsIDIsIDQsIDVdLFxuXHRcdFx0aGVhZFJlZnM6IFsnZmVhdHVyZS10d28nLCAnZmVhdHVyZS10aHJlZScsICdwdWxsLzUvaGVhZCddLFxuXHRcdFx0YXZhaWxhYmxlTnVtYmVyczogWzcsIDZdLFxuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdleHRyYWN0cyBQUiBudW1iZXJzIGZyb20gY2hlY2tvdXQgcmVmcycsICgpID0+IHtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdHB1bGw6IGdldFB1bGxSZXF1ZXN0TnVtYmVyRnJvbUNoZWNrb3V0UmVmKCdwdWxsLzQyL2hlYWQnKSxcblx0XHRcdGZ1bGw6IGdldFB1bGxSZXF1ZXN0TnVtYmVyRnJvbUNoZWNrb3V0UmVmKCdyZWZzL3B1bGwvNDIvaGVhZCcpLFxuXHRcdFx0YnJhbmNoOiBnZXRQdWxsUmVxdWVzdE51bWJlckZyb21DaGVja291dFJlZignZmVhdHVyZScpLFxuXHRcdH0sIHtcblx0XHRcdHB1bGw6IDQyLFxuXHRcdFx0ZnVsbDogNDIsXG5cdFx0XHRicmFuY2g6IHVuZGVmaW5lZCxcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgncmVzb2x2ZXMgbm9uLWNsb3VkIHJlcG9zaXRvcmllcyBmcm9tIHNlc3Npb24gbWV0YWRhdGEgb3IgR2l0IHJlbW90ZXMnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgY2xvdWRSb290ID0gVVJJLnBhcnNlKCdnaXRodWItcmVtb3RlLWZpbGU6Ly9naXRodWIvYWxleHIwMC9wbGF5Z3JvdW5kL2NvcGlsb3QlMjUyRmluc3BlY3QtcHVsbC1yZXF1ZXN0LTc0OCcpO1xuXHRcdGNvbnN0IGxvY2FsUm9vdCA9IFVSSS5maWxlKCcvcmVwb3MvYWxleHIwMC9wbGF5Z3JvdW5kJyk7XG5cdFx0Y29uc3QgcmVtb3RlUm9vdCA9IFVSSS5wYXJzZSgndnNjb2RlLXJlbW90ZTovL3NzaC1yZW1vdGUraG9zdC9yZXBvcy9hbGV4cjAwL3BsYXlncm91bmQnKTtcblx0XHRjb25zdCBjbG91ZFNlc3Npb24gPSBzZXNzaW9uV2l0aFJlcG9zaXRvcnkoY2xvdWRSb290LCAnYWxleHIwMCcsICdwbGF5Z3JvdW5kJyk7XG5cdFx0Y29uc3QgbG9jYWxTZXNzaW9uID0gc2Vzc2lvbldpdGhSZXBvc2l0b3J5KGxvY2FsUm9vdCwgJ2FsZXhyMDAnLCAncGxheWdyb3VuZCcsIGZhbHNlKTtcblx0XHRjb25zdCByZW1vdGVTZXNzaW9uID0gc2Vzc2lvbldpdGhSZXBvc2l0b3J5KHJlbW90ZVJvb3QsICdhbGV4cjAwJywgJ3BsYXlncm91bmQnKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0Y2xvdWQ6IGF3YWl0IHJlc29sdmVQdWxsUmVxdWVzdFNlc3Npb25SZXBvc2l0b3J5KFtjbG91ZFNlc3Npb25dLCBhc3luYyAoKSA9PiB1bmRlZmluZWQpLFxuXHRcdFx0bG9jYWw6IGF3YWl0IHJlc29sdmVQdWxsUmVxdWVzdFNlc3Npb25SZXBvc2l0b3J5KFtsb2NhbFNlc3Npb25dLCBhc3luYyAoKSA9PiAoeyBvd25lcjogJ2FsZXhyMDAnLCByZXBvOiAncGxheWdyb3VuZCcgfSkpLFxuXHRcdFx0bWl4ZWQ6IGF3YWl0IHJlc29sdmVQdWxsUmVxdWVzdFNlc3Npb25SZXBvc2l0b3J5KFtjbG91ZFNlc3Npb24sIGxvY2FsU2Vzc2lvbl0sIGFzeW5jICgpID0+IHVuZGVmaW5lZCksXG5cdFx0XHRyZW1vdGU6IGF3YWl0IHJlc29sdmVQdWxsUmVxdWVzdFNlc3Npb25SZXBvc2l0b3J5KFtyZW1vdGVTZXNzaW9uXSwgYXN5bmMgKCkgPT4gdW5kZWZpbmVkKSxcblx0XHR9LCB7XG5cdFx0XHRjbG91ZDogdW5kZWZpbmVkLFxuXHRcdFx0bG9jYWw6IHtcblx0XHRcdFx0Zm9sZGVyVXJpOiBsb2NhbFJvb3QsXG5cdFx0XHRcdG93bmVyOiAnYWxleHIwMCcsXG5cdFx0XHRcdHJlcG86ICdwbGF5Z3JvdW5kJyxcblx0XHRcdH0sXG5cdFx0XHRtaXhlZDoge1xuXHRcdFx0XHRmb2xkZXJVcmk6IGxvY2FsUm9vdCxcblx0XHRcdFx0b3duZXI6ICdhbGV4cjAwJyxcblx0XHRcdFx0cmVwbzogJ3BsYXlncm91bmQnLFxuXHRcdFx0fSxcblx0XHRcdHJlbW90ZToge1xuXHRcdFx0XHRmb2xkZXJVcmk6IHJlbW90ZVJvb3QsXG5cdFx0XHRcdG93bmVyOiAnYWxleHIwMCcsXG5cdFx0XHRcdHJlcG86ICdwbGF5Z3JvdW5kJyxcblx0XHRcdH0sXG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3BhcnNlcyBHaXRIdWIgcmVwb3NpdG9yeSBpZGVudGl0eSBmcm9tIG9yaWdpbiBiZWZvcmUgb3RoZXIgcmVtb3RlcycsICgpID0+IHtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdGh0dHBzOiBnZXRHaXRIdWJSZXBvc2l0b3J5RnJvbVJlbW90ZXMoW1xuXHRcdFx0XHR7IG5hbWU6ICd1cHN0cmVhbScsIGZldGNoVXJsOiAnZ2l0QGdpdGh1Yi5jb206bWljcm9zb2Z0L3ZzY29kZS5naXQnIH0sXG5cdFx0XHRcdHsgbmFtZTogJ29yaWdpbicsIGZldGNoVXJsOiAnaHR0cHM6Ly9naXRodWIuY29tL2FsZXhyMDAvdnNjb2RlLmdpdCcgfSxcblx0XHRcdF0pLFxuXHRcdFx0c3NoOiBnZXRHaXRIdWJSZXBvc2l0b3J5RnJvbVJlbW90ZXMoW1xuXHRcdFx0XHR7IG5hbWU6ICdvcmlnaW4nLCBmZXRjaFVybDogJ3NzaDovL2dpdEBnaXRodWIuY29tL2FsZXhyMDAvcGxheWdyb3VuZCcgfSxcblx0XHRcdF0pLFxuXHRcdFx0bm9uR2l0SHViOiBnZXRHaXRIdWJSZXBvc2l0b3J5RnJvbVJlbW90ZXMoW1xuXHRcdFx0XHR7IG5hbWU6ICdvcmlnaW4nLCBmZXRjaFVybDogJ2h0dHBzOi8vZXhhbXBsZS5jb20vYWxleHIwMC9wbGF5Z3JvdW5kLmdpdCcgfSxcblx0XHRcdF0pLFxuXHRcdH0sIHtcblx0XHRcdGh0dHBzOiB7IG93bmVyOiAnYWxleHIwMCcsIHJlcG86ICd2c2NvZGUnIH0sXG5cdFx0XHRzc2g6IHsgb3duZXI6ICdhbGV4cjAwJywgcmVwbzogJ3BsYXlncm91bmQnIH0sXG5cdFx0XHRub25HaXRIdWI6IHVuZGVmaW5lZCxcblx0XHR9KTtcblx0fSk7XG59KTtcblxuZnVuY3Rpb24gcHVsbFJlcXVlc3QobnVtYmVyOiBudW1iZXIsIG92ZXJyaWRlczogUGFydGlhbDxJR2l0SHViUHVsbFJlcXVlc3RTdW1tYXJ5PiA9IHt9KTogSUdpdEh1YlB1bGxSZXF1ZXN0U3VtbWFyeSB7XG5cdHJldHVybiB7XG5cdFx0bnVtYmVyLFxuXHRcdHRpdGxlOiBgUHVsbCByZXF1ZXN0ICR7bnVtYmVyfWAsXG5cdFx0YXV0aG9yOiB7IGxvZ2luOiAnYXV0aG9yJywgYXZhdGFyVXJsOiAnJyB9LFxuXHRcdGhlYWRSZWY6IGBmZWF0dXJlLSR7bnVtYmVyfWAsXG5cdFx0aXNEcmFmdDogZmFsc2UsXG5cdFx0dXBkYXRlZEF0OiBuZXcgRGF0ZSgpLnRvSVNPU3RyaW5nKCksXG5cdFx0YWRkaXRpb25zOiAxLFxuXHRcdGRlbGV0aW9uczogMSxcblx0XHRyZXZpZXdSZXF1ZXN0ZWRGcm9tVmlld2VyOiBmYWxzZSxcblx0XHRhc3NpZ25lZFRvVmlld2VyOiBmYWxzZSxcblx0XHQuLi5vdmVycmlkZXMsXG5cdFx0Y2hlY2tvdXRSZWY6IG92ZXJyaWRlcy5jaGVja291dFJlZiA/PyBgcmVmcy9wdWxsLyR7bnVtYmVyfS9oZWFkYCxcblx0fTtcbn1cblxuZnVuY3Rpb24gc2Vzc2lvbldpdGhQdWxsUmVxdWVzdChvd25lcjogc3RyaW5nLCByZXBvOiBzdHJpbmcsIG51bWJlcjogbnVtYmVyLCB1cHN0cmVhbUJyYW5jaE5hbWU/OiBzdHJpbmcsIHJvb3QgPSBVUkkuZmlsZSgnL3JlcG8nKSk6IElTZXNzaW9uIHtcblx0Y29uc3Qgd29ya3NwYWNlOiBJU2Vzc2lvbldvcmtzcGFjZSA9IHtcblx0XHR1cmk6IHJvb3QsXG5cdFx0bGFiZWw6IHJlcG8sXG5cdFx0aWNvbjogQ29kaWNvbi5mb2xkZXIsXG5cdFx0Zm9sZGVyczogW3tcblx0XHRcdHJvb3QsXG5cdFx0XHR3b3JraW5nRGlyZWN0b3J5OiByb290LFxuXHRcdFx0bmFtZTogcmVwbyxcblx0XHRcdGRlc2NyaXB0aW9uOiB1bmRlZmluZWQsXG5cdFx0XHRnaXRSZXBvc2l0b3J5OiB7XG5cdFx0XHRcdHVyaTogcm9vdCxcblx0XHRcdFx0d29ya1RyZWVVcmk6IHJvb3QsXG5cdFx0XHRcdGJhc2VCcmFuY2hOYW1lOiAnbWFpbicsXG5cdFx0XHRcdHVwc3RyZWFtQnJhbmNoTmFtZSxcblx0XHRcdFx0Z2l0SHViSW5mbzogY29uc3RPYnNlcnZhYmxlKHtcblx0XHRcdFx0XHRvd25lcixcblx0XHRcdFx0XHRyZXBvLFxuXHRcdFx0XHRcdHB1bGxSZXF1ZXN0OiB7XG5cdFx0XHRcdFx0XHRudW1iZXIsXG5cdFx0XHRcdFx0XHR1cmk6IFVSSS5wYXJzZShgaHR0cHM6Ly9naXRodWIuY29tLyR7b3duZXJ9LyR7cmVwb30vcHVsbC8ke251bWJlcn1gKSxcblx0XHRcdFx0XHR9LFxuXHRcdFx0XHR9KSxcblx0XHRcdH0sXG5cdFx0fV0sXG5cdFx0cmVxdWlyZXNXb3Jrc3BhY2VUcnVzdDogZmFsc2UsXG5cdFx0aXNWaXJ0dWFsV29ya3NwYWNlOiByb290LnNjaGVtZSAhPT0gU2NoZW1hcy5maWxlLFxuXHR9O1xuXHRyZXR1cm4gc2Vzc2lvbldpdGhXb3Jrc3BhY2Uod29ya3NwYWNlKTtcbn1cblxuZnVuY3Rpb24gc2Vzc2lvbldpdGhSZXBvc2l0b3J5KHJvb3Q6IFVSSSwgb3duZXI6IHN0cmluZywgcmVwbzogc3RyaW5nLCBpbmNsdWRlR2l0SHViSW5mbyA9IHRydWUsIHVwc3RyZWFtQnJhbmNoTmFtZT86IHN0cmluZyk6IElTZXNzaW9uIHtcblx0cmV0dXJuIHNlc3Npb25XaXRoV29ya3NwYWNlKHtcblx0XHR1cmk6IHJvb3QsXG5cdFx0bGFiZWw6IHJlcG8sXG5cdFx0aWNvbjogQ29kaWNvbi5mb2xkZXIsXG5cdFx0Zm9sZGVyczogW3tcblx0XHRcdHJvb3QsXG5cdFx0XHR3b3JraW5nRGlyZWN0b3J5OiByb290LFxuXHRcdFx0bmFtZTogcmVwbyxcblx0XHRcdGRlc2NyaXB0aW9uOiB1bmRlZmluZWQsXG5cdFx0XHRnaXRSZXBvc2l0b3J5OiB7XG5cdFx0XHRcdHVyaTogcm9vdCxcblx0XHRcdFx0d29ya1RyZWVVcmk6IHJvb3QsXG5cdFx0XHRcdGJhc2VCcmFuY2hOYW1lOiAnbWFpbicsXG5cdFx0XHRcdHVwc3RyZWFtQnJhbmNoTmFtZSxcblx0XHRcdFx0Z2l0SHViSW5mbzogY29uc3RPYnNlcnZhYmxlKGluY2x1ZGVHaXRIdWJJbmZvID8geyBvd25lciwgcmVwbyB9IDogdW5kZWZpbmVkKSxcblx0XHRcdH0sXG5cdFx0fV0sXG5cdFx0cmVxdWlyZXNXb3Jrc3BhY2VUcnVzdDogZmFsc2UsXG5cdFx0aXNWaXJ0dWFsV29ya3NwYWNlOiByb290LnNjaGVtZSAhPT0gU2NoZW1hcy5maWxlLFxuXHR9KTtcbn1cblxuZnVuY3Rpb24gc2Vzc2lvbldpdGhXb3Jrc3BhY2Uod29ya3NwYWNlOiBJU2Vzc2lvbldvcmtzcGFjZSk6IElTZXNzaW9uIHtcblx0cmV0dXJuIG5ldyBjbGFzcyBleHRlbmRzIG1vY2s8SVNlc3Npb24+KCkge1xuXHRcdG92ZXJyaWRlIHJlYWRvbmx5IHdvcmtzcGFjZSA9IGNvbnN0T2JzZXJ2YWJsZSh3b3Jrc3BhY2UpO1xuXHR9KCk7XG59XG4iXSwKICAibWFw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
