import assert from "assert";
import { URI } from "../../../../base/common/uri.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../base/test/common/utils.js";
import { runWithFakedTimers } from "../../../../base/test/common/timeTravelScheduler.js";
import { NullLogService } from "../../../log/common/log.js";
import { META_DIFF_BASE_BRANCH } from "../../common/agentHostGitService.js";
import { getSessionRelatedPullRequestUrls, hasSessionPullRequestForBranch, readSessionGitHubState, readSessionGitState, readSessionSourceControlState, SESSION_META_GITHUB_KEY, SessionSourceControlOutcome, withInitialSessionPullRequest, withMostRecentRelatedSessionPullRequest, withMostRecentSessionPullRequest, withSessionGitHubState, withSessionGitState, SessionStatus } from "../../common/state/sessionState.js";
import { META_GIT_STATE, META_GITHUB_STATE, META_SOURCE_CONTROL_STATE } from "../../common/agentHostGitStateService.js";
import { AgentHostGitStateService } from "../../node/agentHostGitStateService.js";
import { createTestGitHubEndpointService } from "./testGitHubEndpointService.js";
import { AgentHostStateManager } from "../../node/agentHostStateManager.js";
import { TestSessionDatabase, createNoopGitService, createSessionDataService } from "../common/sessionTestHelpers.js";
import { SessionConfigKey } from "../../common/sessionConfigKeys.js";
const SESSION = "mock:/session-1";
const WORKING_DIRECTORY = "file:///wd";
suite("AgentHostGitStateService", () => {
  const disposables = ensureNoDisposablesAreLeakedInTestSuite();
  test("migrates legacy singular pull request metadata on read", () => {
    assert.deepStrictEqual(readSessionGitHubState({
      [SESSION_META_GITHUB_KEY]: {
        owner: "microsoft",
        repo: "vscode",
        pullRequestUrl: "https://github.com/microsoft/vscode/pull/1"
      }
    }), {
      owner: "microsoft",
      repo: "vscode",
      pullRequestUrls: ["https://github.com/microsoft/vscode/pull/1"]
    });
  });
  test("preserves stored pull request recency order while deduplicating", () => {
    assert.deepStrictEqual(readSessionGitHubState({
      [SESSION_META_GITHUB_KEY]: {
        pullRequestUrls: [
          "https://github.com/microsoft/vscode/pull/3",
          "https://github.com/microsoft/vscode/pull/1",
          "https://github.com/microsoft/vscode/pull/2",
          "https://github.com/microsoft/vscode/pull/1/"
        ]
      }
    }), {
      pullRequestUrls: [
        "https://github.com/microsoft/vscode/pull/3",
        "https://github.com/microsoft/vscode/pull/1",
        "https://github.com/microsoft/vscode/pull/2"
      ]
    });
  });
  test("keeps ten deduplicated pull requests in most-recent order", () => {
    let state;
    for (let number = 1; number <= 11; number++) {
      state = withMostRecentSessionPullRequest(state, `https://github.com/microsoft/vscode/pull/${number}`, `feature-${number}`);
    }
    state = withMostRecentSessionPullRequest(state, "https://github.com/microsoft/vscode/pull/5/", "feature-5");
    assert.deepStrictEqual(state, {
      pullRequestUrls: [
        "https://github.com/microsoft/vscode/pull/5",
        "https://github.com/microsoft/vscode/pull/11",
        "https://github.com/microsoft/vscode/pull/10",
        "https://github.com/microsoft/vscode/pull/9",
        "https://github.com/microsoft/vscode/pull/8",
        "https://github.com/microsoft/vscode/pull/7",
        "https://github.com/microsoft/vscode/pull/6",
        "https://github.com/microsoft/vscode/pull/4",
        "https://github.com/microsoft/vscode/pull/3",
        "https://github.com/microsoft/vscode/pull/2"
      ],
      pullRequestBranchName: "feature-5"
    });
  });
  test("promotes an initial pull request into the session", () => {
    const initial = "https://github.com/microsoft/vscode/pull/1";
    const state = withMostRecentRelatedSessionPullRequest({
      pullRequestUrls: [initial],
      initialPullRequestUrls: [initial]
    }, initial, "feature");
    assert.deepStrictEqual({
      state,
      related: getSessionRelatedPullRequestUrls(state)
    }, {
      state: {
        pullRequestUrls: [initial],
        associatedPullRequestUrls: [initial],
        pullRequestBranchName: "feature",
        initialPullRequestUrls: []
      },
      related: [initial]
    });
  });
  test("keeps checkout recency when combining discovered and associated pull requests", () => {
    const current = "https://github.com/microsoft/vscode/pull/2";
    const referenced = "https://github.com/microsoft/vscode/pull/1";
    assert.deepStrictEqual(getSessionRelatedPullRequestUrls({
      pullRequestUrls: [current, referenced],
      initialPullRequestUrls: [referenced],
      associatedPullRequestUrls: [referenced]
    }), [current, referenced]);
  });
  test("keeps the most recently discovered pull requests in the bounded baseline", () => {
    let state;
    for (let number = 1; number <= 11; number++) {
      state = { ...state, ...withInitialSessionPullRequest(state, `https://github.com/microsoft/vscode/pull/${number}`) };
    }
    assert.deepStrictEqual(state?.initialPullRequestUrls, [
      "https://github.com/microsoft/vscode/pull/11",
      "https://github.com/microsoft/vscode/pull/10",
      "https://github.com/microsoft/vscode/pull/9",
      "https://github.com/microsoft/vscode/pull/8",
      "https://github.com/microsoft/vscode/pull/7",
      "https://github.com/microsoft/vscode/pull/6",
      "https://github.com/microsoft/vscode/pull/5",
      "https://github.com/microsoft/vscode/pull/4",
      "https://github.com/microsoft/vscode/pull/3",
      "https://github.com/microsoft/vscode/pull/2"
    ]);
  });
  function createHarness(options) {
    const stateManager = disposables.add(new AgentHostStateManager(new NullLogService()));
    const db = new TestSessionDatabase();
    const sessionDataService = createSessionDataService(db);
    const gitCalls = [];
    const gitBaseBranches = [];
    let gitResult;
    let gitError;
    let headSha;
    const gitService = {
      ...createNoopGitService(),
      getSessionGitState: async (workingDirectory, baseBranchName) => {
        gitCalls.push(workingDirectory.toString());
        gitBaseBranches.push(baseBranchName);
        if (gitError) {
          throw gitError;
        }
        return gitResult;
      },
      revParse: async () => headSha
    };
    const pullRequestCalls = [];
    const pullRequestShaCalls = [];
    const pullRequestsByBranch = /* @__PURE__ */ new Map();
    const pullRequestsBySha = /* @__PURE__ */ new Map();
    let onPullRequestLookup;
    const octoKitService = {
      findPullRequestByHeadBranch: async (_owner, _repo, branch) => {
        pullRequestCalls.push(branch);
        await onPullRequestLookup?.(branch);
        return pullRequestsByBranch.get(branch);
      },
      findPullRequestByHeadSha: async (_owner, _repo, sha) => {
        pullRequestShaCalls.push(sha);
        return pullRequestsBySha.get(sha);
      }
    };
    const agentService = { getAuthToken: () => "token" };
    const service = disposables.add(new AgentHostGitStateService(
      stateManager,
      gitService,
      options?.octoKitService ?? octoKitService,
      options?.agentService ?? agentService,
      createTestGitHubEndpointService(options?.enterpriseUri),
      new NullLogService(),
      sessionDataService
    ));
    const runEvents = [];
    disposables.add(service.onDidRefreshSessionGitState((key) => runEvents.push(key)));
    const gitHubStateEvents = [];
    disposables.add(service.onDidChangeSessionGitHubState((key) => gitHubStateEvents.push(key)));
    return {
      stateManager,
      db,
      service,
      gitCalls,
      gitBaseBranches,
      runEvents,
      gitHubStateEvents,
      pullRequestCalls,
      pullRequestShaCalls,
      setGitResult: (state) => {
        gitResult = state;
      },
      setGitError: (error) => {
        gitError = error;
      },
      setHeadSha: (sha) => {
        headSha = sha;
      },
      setPullRequest: (branch, pullRequest) => {
        pullRequestsByBranch.set(branch, pullRequest);
      },
      setPullRequestForSha: (sha, pullRequest) => {
        pullRequestsBySha.set(sha, pullRequest);
      },
      setOnPullRequestLookup: (fn) => {
        onPullRequestLookup = fn;
      }
    };
  }
  function seedSession(stateManager, options) {
    const summary = {
      resource: SESSION,
      provider: "mock",
      title: "Test",
      status: SessionStatus.Idle,
      createdAt: new Date(options?.createdAt ?? 0).toISOString(),
      modifiedAt: (/* @__PURE__ */ new Date(0)).toISOString(),
      workingDirectories: options?.workingDirectory ? [options.workingDirectory] : void 0,
      project: options?.project ? { uri: options.project, displayName: "Project" } : void 0
    };
    stateManager.restoreSession(summary, []);
    if (options?.isolation) {
      stateManager.setSessionConfig(SESSION, {
        schema: { type: "object", properties: {} },
        values: {
          [SessionConfigKey.Isolation]: options.isolation,
          ...options.baseBranch ? { [SessionConfigKey.Branch]: options.baseBranch } : {}
        }
      });
    }
    if (options?.gitState) {
      stateManager.setSessionMeta(SESSION, withSessionGitState(void 0, options.gitState));
    }
    if (options?.gitHubState) {
      stateManager.setSessionMeta(SESSION, withSessionGitHubState(stateManager.getSessionState(SESSION)?._meta, options.gitHubState));
    }
  }
  test("preserves merge provenance when a later pull request becomes the latest outcome", async () => {
    const h = createHarness();
    seedSession(h.stateManager, { workingDirectory: WORKING_DIRECTORY });
    await h.service.recordSessionMerge(SESSION, "merge-commit");
    const afterMerge = readSessionSourceControlState(h.stateManager.getSessionState(SESSION)?._meta);
    const persistedAfterMerge = await h.db.getMetadata(META_SOURCE_CONTROL_STATE);
    await h.service.setSessionGitHubState(SESSION, {
      owner: "microsoft",
      repo: "vscode",
      pullRequestUrls: ["https://github.com/microsoft/vscode/pull/42"],
      pullRequestBranchName: "feature"
    });
    const afterPullRequest = readSessionSourceControlState(h.stateManager.getSessionState(SESSION)?._meta);
    const persistedAfterPullRequest = await h.db.getMetadata(META_SOURCE_CONTROL_STATE);
    assert.deepStrictEqual({
      afterMerge,
      persistedAfterMerge: persistedAfterMerge ? JSON.parse(persistedAfterMerge) : void 0,
      afterPullRequest,
      gitHubStateEvents: h.gitHubStateEvents,
      persistedAfterPullRequest: persistedAfterPullRequest ? JSON.parse(persistedAfterPullRequest) : void 0
    }, {
      afterMerge: {
        merge: { commit: "merge-commit" },
        latestOutcome: SessionSourceControlOutcome.Merge
      },
      persistedAfterMerge: {
        merge: { commit: "merge-commit" },
        latestOutcome: SessionSourceControlOutcome.Merge
      },
      afterPullRequest: {
        merge: { commit: "merge-commit" },
        latestOutcome: SessionSourceControlOutcome.PullRequest
      },
      gitHubStateEvents: [SESSION],
      persistedAfterPullRequest: {
        merge: { commit: "merge-commit" },
        latestOutcome: SessionSourceControlOutcome.PullRequest
      }
    });
  });
  test("does nothing when no working directory can be resolved", async () => {
    const h = createHarness();
    seedSession(h.stateManager);
    await h.service.refreshSessionGitState(SESSION, void 0);
    assert.deepStrictEqual({
      gitCalls: h.gitCalls,
      runEvents: h.runEvents
    }, {
      gitCalls: [],
      runEvents: []
    });
  });
  test("uses the selected worktree base branch when refreshing git state", () => runWithFakedTimers({ useFakeTimers: true }, async () => {
    const h = createHarness();
    seedSession(h.stateManager, {
      workingDirectory: WORKING_DIRECTORY,
      isolation: "worktree",
      baseBranch: "release"
    });
    h.setGitResult({ branchName: "agents/session", baseBranchName: "release" });
    await h.service.refreshSessionGitState(SESSION, void 0);
    assert.deepStrictEqual(h.gitBaseBranches, ["release"]);
  }));
  test("uses the persisted worktree base branch for an adopted linked worktree", () => runWithFakedTimers({ useFakeTimers: true }, async () => {
    const h = createHarness();
    seedSession(h.stateManager, {
      workingDirectory: WORKING_DIRECTORY,
      project: "file:///repo",
      isolation: "folder",
      gitState: { branchName: "agents/session", baseBranchName: "main" }
    });
    await h.db.setMetadata(META_DIFF_BASE_BRANCH, "origin/release");
    h.setGitResult({ branchName: "agents/session", baseBranchName: "release" });
    await h.service.refreshSessionGitState(SESSION, void 0);
    assert.deepStrictEqual(h.gitBaseBranches, ["release"]);
  }));
  test("refreshes git state in memory while a session is creating", async () => {
    await runWithFakedTimers({ useFakeTimers: true }, async () => {
      const h = createHarness();
      h.stateManager.createSession({
        resource: SESSION,
        provider: "mock",
        title: "Test",
        status: SessionStatus.Idle,
        createdAt: (/* @__PURE__ */ new Date(0)).toISOString(),
        modifiedAt: (/* @__PURE__ */ new Date(0)).toISOString(),
        workingDirectories: ["file:///original"]
      }, { emitNotification: false });
      const next = { branchName: "feature", uncommittedChanges: 1 };
      h.setGitResult(next);
      await h.service.refreshSessionGitState(SESSION, URI.parse("file:///explicit"));
      assert.deepStrictEqual({
        gitCalls: h.gitCalls,
        gitState: readSessionGitState(h.stateManager.getSessionState(SESSION)?._meta),
        persistedGit: await h.db.getMetadata(META_GIT_STATE),
        runEvents: h.runEvents
      }, {
        gitCalls: ["file:///explicit"],
        gitState: next,
        persistedGit: void 0,
        runEvents: [SESSION]
      });
    });
  });
  test("resolves the working directory from the session summary when none is provided", async () => {
    await runWithFakedTimers({ useFakeTimers: true }, async () => {
      const h = createHarness();
      seedSession(h.stateManager, { workingDirectory: WORKING_DIRECTORY });
      h.setGitResult({ branchName: "feature" });
      await h.service.refreshSessionGitState(SESSION, void 0);
      assert.deepStrictEqual(h.gitCalls, [WORKING_DIRECTORY]);
    });
  });
  test("prefers an explicitly provided working directory over the session summary", async () => {
    await runWithFakedTimers({ useFakeTimers: true }, async () => {
      const h = createHarness();
      seedSession(h.stateManager, { workingDirectory: WORKING_DIRECTORY });
      h.setGitResult({ branchName: "feature" });
      await h.service.refreshSessionGitState(SESSION, URI.parse("file:///explicit"));
      assert.deepStrictEqual(h.gitCalls, ["file:///explicit"]);
    });
  });
  test("unchanged git state still fires the run-refresh event", async () => {
    await runWithFakedTimers({ useFakeTimers: true }, async () => {
      const gitState = { branchName: "feature", uncommittedChanges: 1 };
      const h = createHarness();
      seedSession(h.stateManager, { workingDirectory: WORKING_DIRECTORY, gitState });
      h.setGitResult(gitState);
      await h.service.refreshSessionGitState(SESSION, void 0);
      assert.deepStrictEqual(h.runEvents, [SESSION]);
    });
  });
  test("unchanged git state backfills missing GitHub state", async () => {
    await runWithFakedTimers({ useFakeTimers: true }, async () => {
      const gitState = {
        branchName: "feature",
        githubOwner: "microsoft",
        githubRepo: "vscode"
      };
      const h = createHarness();
      seedSession(h.stateManager, { workingDirectory: WORKING_DIRECTORY, gitState });
      h.setGitResult(gitState);
      await h.service.refreshSessionGitState(SESSION, void 0);
      const persistedGitHubState = await h.db.getMetadata(META_GITHUB_STATE);
      assert.deepStrictEqual({
        github: readSessionGitHubState(h.stateManager.getSessionState(SESSION)?._meta),
        persistedGitHub: persistedGitHubState ? JSON.parse(persistedGitHubState) : void 0
      }, {
        github: { owner: "microsoft", repo: "vscode" },
        persistedGitHub: { owner: "microsoft", repo: "vscode" }
      });
    });
  });
  test("changed git state updates the session meta and fires the run-refresh event", async () => {
    await runWithFakedTimers({ useFakeTimers: true }, async () => {
      const h = createHarness();
      seedSession(h.stateManager, { workingDirectory: WORKING_DIRECTORY });
      const next = { branchName: "feature", baseBranchName: "main", uncommittedChanges: 2 };
      h.setGitResult(next);
      await h.service.refreshSessionGitState(SESSION, void 0);
      assert.deepStrictEqual({
        gitState: readSessionGitState(h.stateManager.getSessionState(SESSION)?._meta),
        runEvents: h.runEvents
      }, {
        gitState: next,
        runEvents: [SESSION]
      });
    });
  });
  test("persists git state and derives GitHub state when git reports a GitHub repo", async () => {
    await runWithFakedTimers({ useFakeTimers: true }, async () => {
      const h = createHarness();
      seedSession(h.stateManager, { workingDirectory: WORKING_DIRECTORY });
      const next = { branchName: "feature", githubOwner: "microsoft", githubRepo: "vscode" };
      h.setGitResult(next);
      await h.service.refreshSessionGitState(SESSION, void 0);
      assert.deepStrictEqual({
        github: readSessionGitHubState(h.stateManager.getSessionState(SESSION)?._meta),
        persistedGit: await h.db.getMetadata(META_GIT_STATE)
      }, {
        github: { owner: "microsoft", repo: "vscode" },
        persistedGit: JSON.stringify(next)
      });
    });
  });
  test("preserves pull request attachment when a later refresh replaces its queued refresh", async () => {
    await runWithFakedTimers({ useFakeTimers: true }, async () => {
      const calls = [];
      const octoKitService = {
        findPullRequestByHeadBranch: async (owner, repo, branch, _token, _signal, headOwner) => {
          calls.push({ owner, repo, branch, headOwner });
          return { url: "https://github.com/microsoft/vscode/pull/1", number: 1 };
        }
      };
      const agentService = { getAuthToken: () => "token" };
      const h = createHarness({ octoKitService, agentService });
      seedSession(h.stateManager, {
        workingDirectory: WORKING_DIRECTORY,
        gitState: {
          branchName: "feature",
          baseBranchName: "main",
          githubOwner: "microsoft",
          githubRepo: "vscode"
        }
      });
      h.setGitResult({
        branchName: "feature",
        baseBranchName: "main",
        upstreamBranchName: "fork/feature",
        githubOwner: "microsoft",
        githubHeadOwner: "fork-owner",
        githubRepo: "vscode"
      });
      await Promise.all([
        h.service.refreshSessionGitState(SESSION, URI.parse(WORKING_DIRECTORY)),
        h.service.attachSessionGitHubPullRequest(SESSION, URI.parse(WORKING_DIRECTORY)),
        h.service.refreshSessionGitState(SESSION, URI.parse(WORKING_DIRECTORY))
      ]);
      assert.deepStrictEqual({
        gitCalls: h.gitCalls.length,
        calls,
        github: readSessionGitHubState(h.stateManager.getSessionState(SESSION)?._meta)
      }, {
        gitCalls: 2,
        calls: [{ owner: "microsoft", repo: "vscode", branch: "feature", headOwner: "fork-owner" }],
        github: {
          owner: "microsoft",
          repo: "vscode",
          pullRequestUrls: ["https://github.com/microsoft/vscode/pull/1"],
          pullRequestBranchName: "feature"
        }
      });
    });
  });
  test("looks a pull request up by the upstream branch rather than the local branch name", async () => {
    await runWithFakedTimers({ useFakeTimers: true }, async () => {
      const gitState = {
        branchName: "local-name",
        baseBranchName: "main",
        upstreamBranchName: "origin/remote-name",
        githubHeadOwner: "microsoft"
      };
      const h = createHarness();
      seedSession(h.stateManager, {
        workingDirectory: WORKING_DIRECTORY,
        gitState,
        gitHubState: { owner: "microsoft", repo: "vscode" }
      });
      h.setGitResult(gitState);
      h.setPullRequest("remote-name", { url: "https://github.com/microsoft/vscode/pull/1", number: 1 });
      await h.service.attachSessionGitHubPullRequest(SESSION, URI.parse(WORKING_DIRECTORY));
      assert.deepStrictEqual({
        pullRequestCalls: h.pullRequestCalls,
        pullRequestShaCalls: h.pullRequestShaCalls,
        github: readSessionGitHubState(h.stateManager.getSessionState(SESSION)?._meta)
      }, {
        pullRequestCalls: ["remote-name"],
        pullRequestShaCalls: [],
        github: { owner: "microsoft", repo: "vscode", pullRequestUrls: ["https://github.com/microsoft/vscode/pull/1"], pullRequestBranchName: "local-name" }
      });
    });
  });
  test("looks a fork pull request up by the local branch name when git inferred the fork head owner from the push remote", async () => {
    await runWithFakedTimers({ useFakeTimers: true }, async () => {
      const gitState = {
        branchName: "feature/alt-click-close-other-tabs",
        baseBranchName: "main",
        githubHeadOwner: "jadefr"
      };
      const calls = [];
      const h = createHarness({
        octoKitService: {
          findPullRequestByHeadBranch: async (_owner, _repo, branch, _token, _signal, headOwner) => {
            calls.push({ branch, headOwner });
            return {
              url: "https://github.com/microsoft/vscode/pull/328975",
              number: 328975
            };
          }
        }
      });
      seedSession(h.stateManager, {
        workingDirectory: WORKING_DIRECTORY,
        gitState,
        gitHubState: { owner: "microsoft", repo: "vscode" }
      });
      h.setGitResult(gitState);
      await h.service.attachSessionGitHubPullRequest(SESSION, URI.parse(WORKING_DIRECTORY));
      assert.deepStrictEqual({
        pullRequestCalls: calls,
        pullRequestShaCalls: h.pullRequestShaCalls,
        github: readSessionGitHubState(h.stateManager.getSessionState(SESSION)?._meta)
      }, {
        pullRequestCalls: [{ branch: "feature/alt-click-close-other-tabs", headOwner: "jadefr" }],
        pullRequestShaCalls: [],
        github: {
          owner: "microsoft",
          repo: "vscode",
          pullRequestUrls: ["https://github.com/microsoft/vscode/pull/328975"],
          pullRequestBranchName: "feature/alt-click-close-other-tabs"
        }
      });
    });
  });
  test("falls back to the commit at HEAD when the branch name matches no pull request", async () => {
    await runWithFakedTimers({ useFakeTimers: true }, async () => {
      const gitState = { branchName: "local-only", baseBranchName: "main" };
      const h = createHarness();
      seedSession(h.stateManager, {
        workingDirectory: WORKING_DIRECTORY,
        gitState,
        gitHubState: { owner: "microsoft", repo: "vscode" }
      });
      h.setGitResult(gitState);
      h.setHeadSha("1ce2c20d3dcb593273f604b077240543d494e276");
      h.setPullRequestForSha("1ce2c20d3dcb593273f604b077240543d494e276", { url: "https://github.com/microsoft/vscode/pull/2", number: 2 });
      await h.service.attachSessionGitHubPullRequest(SESSION, URI.parse(WORKING_DIRECTORY));
      assert.deepStrictEqual({
        pullRequestCalls: h.pullRequestCalls,
        pullRequestShaCalls: h.pullRequestShaCalls,
        github: readSessionGitHubState(h.stateManager.getSessionState(SESSION)?._meta)
      }, {
        pullRequestCalls: ["local-only"],
        pullRequestShaCalls: ["1ce2c20d3dcb593273f604b077240543d494e276"],
        github: { owner: "microsoft", repo: "vscode", pullRequestUrls: ["https://github.com/microsoft/vscode/pull/2"], pullRequestBranchName: "local-only" }
      });
    });
  });
  test("ignores an upstream branch that does not resolve to a GitHub remote", async () => {
    await runWithFakedTimers({ useFakeTimers: true }, async () => {
      const gitState = {
        branchName: "local-name",
        baseBranchName: "main",
        upstreamBranchName: "gitlab/remote-name"
      };
      const h = createHarness();
      seedSession(h.stateManager, {
        workingDirectory: WORKING_DIRECTORY,
        gitState,
        gitHubState: { owner: "microsoft", repo: "vscode" }
      });
      h.setGitResult(gitState);
      await h.service.attachSessionGitHubPullRequest(SESSION, URI.parse(WORKING_DIRECTORY));
      assert.deepStrictEqual(h.pullRequestCalls, ["local-name"]);
    });
  });
  test("keeps a pre-existing folder-session pull request out of the related set", async () => {
    await runWithFakedTimers({ useFakeTimers: true }, async () => {
      const gitState = { branchName: "feature", baseBranchName: "main" };
      const h = createHarness();
      seedSession(h.stateManager, {
        workingDirectory: WORKING_DIRECTORY,
        gitState,
        gitHubState: { owner: "microsoft", repo: "vscode" },
        isolation: "folder",
        createdAt: 6e5
      });
      h.setGitResult(gitState);
      h.setPullRequest("feature", {
        url: "https://github.com/microsoft/vscode/pull/1",
        number: 1,
        createdAt: 1e3
      });
      await h.service.attachSessionGitHubPullRequest(SESSION, URI.parse(WORKING_DIRECTORY));
      const github = readSessionGitHubState(h.stateManager.getSessionState(SESSION)?._meta);
      assert.deepStrictEqual({
        github,
        related: [...getSessionRelatedPullRequestUrls(github)],
        persistedGitHub: JSON.parse(await h.db.getMetadata(META_GITHUB_STATE))
      }, {
        github: {
          owner: "microsoft",
          repo: "vscode",
          pullRequestUrls: ["https://github.com/microsoft/vscode/pull/1"],
          initialPullRequestUrls: ["https://github.com/microsoft/vscode/pull/1"],
          pullRequestBranchName: "feature"
        },
        related: [],
        persistedGitHub: {
          owner: "microsoft",
          repo: "vscode",
          pullRequestUrls: ["https://github.com/microsoft/vscode/pull/1"],
          initialPullRequestUrls: ["https://github.com/microsoft/vscode/pull/1"],
          pullRequestBranchName: "feature"
        }
      });
    });
  });
  test("uses folder isolation that resolves while a pull request lookup is in flight", async () => {
    await runWithFakedTimers({ useFakeTimers: true }, async () => {
      const pullRequestUrl = "https://github.com/microsoft/vscode/pull/1";
      const gitState = { branchName: "feature", baseBranchName: "main" };
      const h = createHarness();
      seedSession(h.stateManager, {
        workingDirectory: WORKING_DIRECTORY,
        gitState,
        gitHubState: { owner: "microsoft", repo: "vscode" },
        createdAt: 6e5
      });
      h.setGitResult(gitState);
      h.setPullRequest("feature", { url: pullRequestUrl, number: 1, createdAt: 1e3 });
      h.setOnPullRequestLookup(async () => {
        h.stateManager.setSessionConfig(SESSION, {
          schema: { type: "object", properties: {} },
          values: { [SessionConfigKey.Isolation]: "folder" }
        });
      });
      await h.service.attachSessionGitHubPullRequest(SESSION, URI.parse(WORKING_DIRECTORY));
      const github = readSessionGitHubState(h.stateManager.getSessionState(SESSION)?._meta);
      assert.deepStrictEqual({
        github,
        related: [...getSessionRelatedPullRequestUrls(github)]
      }, {
        github: {
          owner: "microsoft",
          repo: "vscode",
          pullRequestUrls: [pullRequestUrl],
          initialPullRequestUrls: [pullRequestUrl],
          pullRequestBranchName: "feature"
        },
        related: []
      });
    });
  });
  test("relates a pull request created after a folder session began", async () => {
    await runWithFakedTimers({ useFakeTimers: true }, async () => {
      const gitState = { branchName: "feature", baseBranchName: "main" };
      const h = createHarness();
      seedSession(h.stateManager, {
        workingDirectory: WORKING_DIRECTORY,
        gitState,
        gitHubState: { owner: "microsoft", repo: "vscode" },
        isolation: "folder",
        createdAt: 6e5
      });
      h.setGitResult(gitState);
      await h.service.attachSessionGitHubPullRequest(SESSION, URI.parse(WORKING_DIRECTORY));
      h.setPullRequest("feature", {
        url: "https://github.com/microsoft/vscode/pull/2",
        number: 2,
        createdAt: 600500
      });
      await h.service.attachSessionGitHubPullRequest(SESSION, URI.parse(WORKING_DIRECTORY));
      const github = readSessionGitHubState(h.stateManager.getSessionState(SESSION)?._meta);
      assert.deepStrictEqual({
        github,
        related: [...getSessionRelatedPullRequestUrls(github)]
      }, {
        github: {
          owner: "microsoft",
          repo: "vscode",
          pullRequestUrls: ["https://github.com/microsoft/vscode/pull/2"],
          initialPullRequestUrls: [],
          pullRequestBranchName: "feature"
        },
        related: ["https://github.com/microsoft/vscode/pull/2"]
      });
    });
  });
  test("keeps worktree pull request behavior unchanged", async () => {
    await runWithFakedTimers({ useFakeTimers: true }, async () => {
      const gitState = { branchName: "feature", baseBranchName: "main" };
      const h = createHarness();
      seedSession(h.stateManager, {
        workingDirectory: WORKING_DIRECTORY,
        gitState,
        gitHubState: { owner: "microsoft", repo: "vscode" },
        isolation: "worktree",
        createdAt: 2e3
      });
      h.setGitResult(gitState);
      h.setPullRequest("feature", {
        url: "https://github.com/microsoft/vscode/pull/1",
        number: 1,
        createdAt: 1e3
      });
      await h.service.attachSessionGitHubPullRequest(SESSION, URI.parse(WORKING_DIRECTORY));
      const github = readSessionGitHubState(h.stateManager.getSessionState(SESSION)?._meta);
      assert.deepStrictEqual({
        github,
        related: [...getSessionRelatedPullRequestUrls(github)]
      }, {
        github: {
          owner: "microsoft",
          repo: "vscode",
          pullRequestUrls: ["https://github.com/microsoft/vscode/pull/1"],
          pullRequestBranchName: "feature"
        },
        related: ["https://github.com/microsoft/vscode/pull/1"]
      });
    });
  });
  test("promotes a referenced baseline pull request", async () => {
    const h = createHarness();
    const pullRequestUrl = "https://github.com/microsoft/vscode/pull/1";
    seedSession(h.stateManager, {
      workingDirectory: WORKING_DIRECTORY,
      gitHubState: {
        owner: "microsoft",
        repo: "vscode",
        pullRequestUrls: [pullRequestUrl],
        initialPullRequestUrls: [pullRequestUrl],
        pullRequestBranchName: "feature"
      },
      isolation: "folder"
    });
    await h.service.attachSessionGitHubReferences(SESSION, "Please unblock PR #1. Ignore https://github.com/octo/repo/pull/9.");
    const github = readSessionGitHubState(h.stateManager.getSessionState(SESSION)?._meta);
    assert.deepStrictEqual({
      github,
      related: [...getSessionRelatedPullRequestUrls(github)]
    }, {
      github: {
        owner: "microsoft",
        repo: "vscode",
        pullRequestUrls: [pullRequestUrl],
        initialPullRequestUrls: [pullRequestUrl],
        associatedPullRequestUrls: [pullRequestUrl],
        pullRequestBranchName: "feature"
      },
      related: [pullRequestUrl]
    });
  });
  test("promotes a referenced GitHub Enterprise baseline pull request", async () => {
    const h = createHarness({ enterpriseUri: "https://ghe.example.com" });
    const pullRequestUrl = "https://ghe.example.com/microsoft/vscode/pull/1";
    seedSession(h.stateManager, {
      workingDirectory: WORKING_DIRECTORY,
      gitHubState: {
        owner: "microsoft",
        repo: "vscode",
        pullRequestUrls: [pullRequestUrl],
        initialPullRequestUrls: [pullRequestUrl],
        pullRequestBranchName: "feature"
      },
      isolation: "folder"
    });
    await h.service.attachSessionGitHubReferences(SESSION, "Please unblock PR #1.");
    const github = readSessionGitHubState(h.stateManager.getSessionState(SESSION)?._meta);
    assert.deepStrictEqual({
      github,
      related: [...getSessionRelatedPullRequestUrls(github)]
    }, {
      github: {
        owner: "microsoft",
        repo: "vscode",
        pullRequestUrls: [pullRequestUrl],
        initialPullRequestUrls: [pullRequestUrl],
        associatedPullRequestUrls: [pullRequestUrl],
        pullRequestBranchName: "feature"
      },
      related: [pullRequestUrl]
    });
  });
  test("records an unrelated PR mention without changing checkout PR state", async () => {
    const h = createHarness();
    seedSession(h.stateManager, {
      workingDirectory: WORKING_DIRECTORY,
      gitHubState: { owner: "microsoft", repo: "vscode", initialPullRequestUrls: [] },
      isolation: "folder"
    });
    await h.service.attachSessionGitHubReferences(SESSION, "Compare this with PR #99.");
    const github = readSessionGitHubState(h.stateManager.getSessionState(SESSION)?._meta);
    assert.deepStrictEqual({
      github,
      related: [...getSessionRelatedPullRequestUrls(github)],
      hasCheckoutPullRequest: hasSessionPullRequestForBranch(github, "feature")
    }, {
      github: {
        owner: "microsoft",
        repo: "vscode",
        initialPullRequestUrls: [],
        associatedPullRequestUrls: ["https://github.com/microsoft/vscode/pull/99"]
      },
      related: [],
      hasCheckoutPullRequest: false
    });
  });
  test("retains a full PR URL mentioned before repository discovery", async () => {
    const h = createHarness();
    const pullRequestUrl = "https://github.com/microsoft/vscode/pull/1";
    seedSession(h.stateManager, { workingDirectory: WORKING_DIRECTORY, isolation: "folder" });
    await h.service.attachSessionGitHubReferences(SESSION, `Please unblock ${pullRequestUrl}.`);
    await h.service.setSessionGitHubState(SESSION, {
      owner: "microsoft",
      repo: "vscode",
      pullRequestUrls: [pullRequestUrl],
      initialPullRequestUrls: [pullRequestUrl]
    });
    const github = readSessionGitHubState(h.stateManager.getSessionState(SESSION)?._meta);
    assert.deepStrictEqual({
      github,
      related: [...getSessionRelatedPullRequestUrls(github)]
    }, {
      github: {
        owner: "microsoft",
        repo: "vscode",
        pullRequestUrls: [pullRequestUrl],
        initialPullRequestUrls: [pullRequestUrl],
        associatedPullRequestUrls: [pullRequestUrl]
      },
      related: [pullRequestUrl]
    });
  });
  test("preserves an explicit PR reference while its baseline lookup is in flight", async () => {
    await runWithFakedTimers({ useFakeTimers: true }, async () => {
      const pullRequestUrl = "https://github.com/microsoft/vscode/pull/1";
      const gitState = { branchName: "feature", baseBranchName: "main" };
      const h = createHarness();
      seedSession(h.stateManager, {
        workingDirectory: WORKING_DIRECTORY,
        gitState,
        gitHubState: { owner: "microsoft", repo: "vscode" },
        isolation: "folder",
        createdAt: 6e5
      });
      h.setGitResult(gitState);
      h.setPullRequest("feature", { url: pullRequestUrl, number: 1, createdAt: 1e3 });
      h.setOnPullRequestLookup(async () => {
        await h.service.attachSessionGitHubReferences(SESSION, "Please unblock PR #1.");
      });
      await h.service.attachSessionGitHubPullRequest(SESSION, URI.parse(WORKING_DIRECTORY));
      const github = readSessionGitHubState(h.stateManager.getSessionState(SESSION)?._meta);
      assert.deepStrictEqual({
        github,
        related: [...getSessionRelatedPullRequestUrls(github)]
      }, {
        github: {
          owner: "microsoft",
          repo: "vscode",
          pullRequestUrls: [pullRequestUrl],
          initialPullRequestUrls: [pullRequestUrl],
          associatedPullRequestUrls: [pullRequestUrl],
          pullRequestBranchName: "feature"
        },
        related: [pullRequestUrl]
      });
    });
  });
  test("round-trips an empty folder-session baseline through persisted metadata", () => {
    const persisted = JSON.parse(JSON.stringify({ initialPullRequestUrls: [] }));
    assert.deepStrictEqual(readSessionGitHubState({ [SESSION_META_GITHUB_KEY]: persisted }), {
      initialPullRequestUrls: []
    });
  });
  test("accumulates the GitHub issues referenced across user messages", async () => {
    const h = createHarness();
    seedSession(h.stateManager, { workingDirectory: WORKING_DIRECTORY });
    await h.service.attachSessionGitHubReferences(SESSION, "Fix https://github.com/microsoft/vscode/issues/1 please");
    await h.service.attachSessionGitHubReferences(SESSION, "Also microsoft/vscode#1 and octo/repo#2, but not #3");
    await h.service.attachSessionGitHubReferences(SESSION, "Nothing to see here");
    assert.deepStrictEqual({
      github: readSessionGitHubState(h.stateManager.getSessionState(SESSION)?._meta),
      persistedGitHub: await h.db.getMetadata(META_GITHUB_STATE)
    }, {
      github: {
        issueUrls: [
          "https://github.com/microsoft/vscode/issues/1",
          "https://github.com/octo/repo/issues/2"
        ]
      },
      persistedGitHub: JSON.stringify({
        issueUrls: [
          "https://github.com/microsoft/vscode/issues/1",
          "https://github.com/octo/repo/issues/2"
        ]
      })
    });
  });
  test("swallows git errors and fires no events", async () => {
    const h = createHarness();
    seedSession(h.stateManager, { workingDirectory: WORKING_DIRECTORY });
    h.setGitError(new Error("git command failed"));
    await h.service.refreshSessionGitState(SESSION, void 0);
    assert.deepStrictEqual({
      runEvents: h.runEvents
    }, {
      runEvents: []
    });
  });
  test("coalesces concurrent refreshes for the same session", async () => {
    await runWithFakedTimers({ useFakeTimers: true, maxTaskCount: 1e4 }, async () => {
      const h = createHarness();
      seedSession(h.stateManager, { workingDirectory: WORKING_DIRECTORY });
      h.setGitResult({ branchName: "feature" });
      await Promise.all([
        h.service.refreshSessionGitState(SESSION, void 0),
        h.service.refreshSessionGitState(SESSION, void 0),
        h.service.refreshSessionGitState(SESSION, void 0)
      ]);
      assert.strictEqual(h.gitCalls.length, 2);
    });
  });
  test("stops looking for a pull request once one is known for the current branch", async () => {
    await runWithFakedTimers({ useFakeTimers: true }, async () => {
      const gitState = { branchName: "feature", baseBranchName: "main" };
      const h = createHarness();
      seedSession(h.stateManager, {
        workingDirectory: WORKING_DIRECTORY,
        gitState,
        gitHubState: { owner: "microsoft", repo: "vscode" }
      });
      h.setGitResult(gitState);
      h.setPullRequest("feature", { url: "https://github.com/microsoft/vscode/pull/1", number: 1 });
      await h.service.attachSessionGitHubPullRequest(SESSION, URI.parse(WORKING_DIRECTORY));
      await h.service.attachSessionGitHubPullRequest(SESSION, URI.parse(WORKING_DIRECTORY));
      assert.deepStrictEqual({
        pullRequestCalls: h.pullRequestCalls,
        github: readSessionGitHubState(h.stateManager.getSessionState(SESSION)?._meta)
      }, {
        pullRequestCalls: ["feature"],
        github: { owner: "microsoft", repo: "vscode", pullRequestUrls: ["https://github.com/microsoft/vscode/pull/1"], pullRequestBranchName: "feature" }
      });
    });
  });
  test("keeps the known pull request but resumes looking after the branch changed", async () => {
    await runWithFakedTimers({ useFakeTimers: true }, async () => {
      const nextGitState = { branchName: "feature-2", baseBranchName: "main" };
      const h = createHarness();
      seedSession(h.stateManager, {
        workingDirectory: WORKING_DIRECTORY,
        gitState: { branchName: "feature", baseBranchName: "main" },
        gitHubState: { owner: "microsoft", repo: "vscode", pullRequestUrls: ["https://github.com/microsoft/vscode/pull/1"], pullRequestBranchName: "feature" }
      });
      h.stateManager.setSessionMeta(SESSION, withSessionGitState(h.stateManager.getSessionState(SESSION)?._meta, nextGitState));
      h.setGitResult(nextGitState);
      await h.service.attachSessionGitHubPullRequest(SESSION, URI.parse(WORKING_DIRECTORY));
      const githubBeforePullRequestExists = readSessionGitHubState(h.stateManager.getSessionState(SESSION)?._meta);
      h.setPullRequest("feature-2", { url: "https://github.com/microsoft/vscode/pull/2", number: 2 });
      await h.service.attachSessionGitHubPullRequest(SESSION, URI.parse(WORKING_DIRECTORY));
      assert.deepStrictEqual({
        pullRequestCalls: h.pullRequestCalls,
        githubBeforePullRequestExists,
        github: readSessionGitHubState(h.stateManager.getSessionState(SESSION)?._meta),
        persistedGitHub: JSON.parse(await h.db.getMetadata(META_GITHUB_STATE))
      }, {
        pullRequestCalls: ["feature-2", "feature-2"],
        githubBeforePullRequestExists: { owner: "microsoft", repo: "vscode", pullRequestUrls: ["https://github.com/microsoft/vscode/pull/1"], pullRequestBranchName: "feature" },
        github: { owner: "microsoft", repo: "vscode", pullRequestUrls: ["https://github.com/microsoft/vscode/pull/2", "https://github.com/microsoft/vscode/pull/1"], pullRequestBranchName: "feature-2" },
        persistedGitHub: { owner: "microsoft", repo: "vscode", pullRequestUrls: ["https://github.com/microsoft/vscode/pull/2", "https://github.com/microsoft/vscode/pull/1"], pullRequestBranchName: "feature-2" }
      });
    });
    test("preserves GitHub state updated while a pull request lookup is in flight", async () => {
      await runWithFakedTimers({ useFakeTimers: true }, async () => {
        const gitState = { branchName: "feature", baseBranchName: "main" };
        const h = createHarness();
        seedSession(h.stateManager, {
          workingDirectory: WORKING_DIRECTORY,
          gitState,
          gitHubState: { owner: "microsoft", repo: "vscode" }
        });
        h.setGitResult(gitState);
        h.setPullRequest("feature", { url: "https://github.com/microsoft/vscode/pull/1", number: 1 });
        h.setOnPullRequestLookup(async () => {
          await h.service.attachSessionGitHubReferences(SESSION, "See microsoft/vscode#42");
          const currentState = readSessionGitHubState(h.stateManager.getSessionState(SESSION)?._meta);
          await h.service.setSessionGitHubState(SESSION, withMostRecentSessionPullRequest(currentState, "https://github.com/microsoft/vscode/pull/2", "feature-2"));
        });
        await h.service.attachSessionGitHubPullRequest(SESSION, URI.parse(WORKING_DIRECTORY));
        assert.deepStrictEqual(readSessionGitHubState(h.stateManager.getSessionState(SESSION)?._meta), {
          owner: "microsoft",
          repo: "vscode",
          pullRequestUrls: [
            "https://github.com/microsoft/vscode/pull/1",
            "https://github.com/microsoft/vscode/pull/2"
          ],
          issueUrls: ["https://github.com/microsoft/vscode/issues/42"],
          pullRequestBranchName: "feature"
        });
      });
    });
  });
  test("verifies a pull request that predates branch tracking against the current branch", async () => {
    await runWithFakedTimers({ useFakeTimers: true }, async () => {
      const gitState = { branchName: "feature", baseBranchName: "main" };
      const h = createHarness();
      seedSession(h.stateManager, {
        workingDirectory: WORKING_DIRECTORY,
        gitState,
        gitHubState: { owner: "microsoft", repo: "vscode", pullRequestUrls: ["https://github.com/microsoft/vscode/pull/1"] }
      });
      h.setGitResult(gitState);
      h.setPullRequest("feature", { url: "https://github.com/microsoft/vscode/pull/1", number: 1 });
      await h.service.attachSessionGitHubPullRequest(SESSION, URI.parse(WORKING_DIRECTORY));
      assert.deepStrictEqual({
        pullRequestCalls: h.pullRequestCalls,
        github: readSessionGitHubState(h.stateManager.getSessionState(SESSION)?._meta)
      }, {
        pullRequestCalls: ["feature"],
        github: { owner: "microsoft", repo: "vscode", pullRequestUrls: ["https://github.com/microsoft/vscode/pull/1"], pullRequestBranchName: "feature" }
      });
    });
  });
  test("does not bind a pull request that predates branch tracking to a branch without one", async () => {
    await runWithFakedTimers({ useFakeTimers: true }, async () => {
      const gitState = { branchName: "feature-2", baseBranchName: "main" };
      const h = createHarness();
      seedSession(h.stateManager, {
        workingDirectory: WORKING_DIRECTORY,
        gitState,
        gitHubState: { owner: "microsoft", repo: "vscode", pullRequestUrls: ["https://github.com/microsoft/vscode/pull/1"] }
      });
      h.setGitResult(gitState);
      await h.service.attachSessionGitHubPullRequest(SESSION, URI.parse(WORKING_DIRECTORY));
      await h.service.attachSessionGitHubPullRequest(SESSION, URI.parse(WORKING_DIRECTORY));
      assert.deepStrictEqual({
        pullRequestCalls: h.pullRequestCalls,
        github: readSessionGitHubState(h.stateManager.getSessionState(SESSION)?._meta)
      }, {
        pullRequestCalls: ["feature-2", "feature-2"],
        github: { owner: "microsoft", repo: "vscode", pullRequestUrls: ["https://github.com/microsoft/vscode/pull/1"] }
      });
    });
  });
  test("discards a pull request lookup whose branch is no longer checked out", async () => {
    await runWithFakedTimers({ useFakeTimers: true }, async () => {
      const gitState = { branchName: "feature", baseBranchName: "main" };
      const h = createHarness();
      seedSession(h.stateManager, {
        workingDirectory: WORKING_DIRECTORY,
        gitState,
        gitHubState: { owner: "microsoft", repo: "vscode" }
      });
      h.setGitResult(gitState);
      h.setPullRequest("feature", { url: "https://github.com/microsoft/vscode/pull/1", number: 1 });
      h.setOnPullRequestLookup(async () => {
        h.stateManager.setSessionMeta(SESSION, withSessionGitState(h.stateManager.getSessionState(SESSION)?._meta, { branchName: "feature-2", baseBranchName: "main" }));
      });
      await h.service.attachSessionGitHubPullRequest(SESSION, URI.parse(WORKING_DIRECTORY));
      assert.deepStrictEqual({
        pullRequestCalls: h.pullRequestCalls,
        github: readSessionGitHubState(h.stateManager.getSessionState(SESSION)?._meta)
      }, {
        pullRequestCalls: ["feature"],
        github: { owner: "microsoft", repo: "vscode" }
      });
    });
    test("does not capture an empty baseline for a stale branch lookup", async () => {
      await runWithFakedTimers({ useFakeTimers: true }, async () => {
        const gitState = { branchName: "feature", baseBranchName: "main" };
        const h = createHarness();
        seedSession(h.stateManager, {
          workingDirectory: WORKING_DIRECTORY,
          gitState,
          gitHubState: { owner: "microsoft", repo: "vscode" },
          isolation: "folder"
        });
        h.setGitResult(gitState);
        h.setOnPullRequestLookup(async () => {
          h.stateManager.setSessionMeta(SESSION, withSessionGitState(h.stateManager.getSessionState(SESSION)?._meta, { branchName: "feature-2", baseBranchName: "main" }));
        });
        await h.service.attachSessionGitHubPullRequest(SESSION, URI.parse(WORKING_DIRECTORY));
        assert.deepStrictEqual(readSessionGitHubState(h.stateManager.getSessionState(SESSION)?._meta), {
          owner: "microsoft",
          repo: "vscode"
        });
      });
    });
  });
  test("looks for a pull request before reporting a refresh that observed a branch change", async () => {
    await runWithFakedTimers({ useFakeTimers: true }, async () => {
      const h = createHarness();
      seedSession(h.stateManager, {
        workingDirectory: WORKING_DIRECTORY,
        gitState: { branchName: "feature", baseBranchName: "main", githubOwner: "microsoft", githubRepo: "vscode" },
        gitHubState: { owner: "microsoft", repo: "vscode", pullRequestUrls: ["https://github.com/microsoft/vscode/pull/1"], pullRequestBranchName: "feature" }
      });
      h.setGitResult({ branchName: "feature-2", baseBranchName: "main", githubOwner: "microsoft", githubRepo: "vscode" });
      h.setPullRequest("feature-2", { url: "https://github.com/microsoft/vscode/pull/2", number: 2 });
      let githubOnRefreshEvent;
      disposables.add(h.service.onDidRefreshSessionGitState(() => {
        githubOnRefreshEvent = readSessionGitHubState(h.stateManager.getSessionState(SESSION)?._meta);
      }));
      await h.service.refreshSessionGitState(SESSION, void 0);
      assert.deepStrictEqual({
        pullRequestCalls: h.pullRequestCalls,
        githubOnRefreshEvent
      }, {
        pullRequestCalls: ["feature-2"],
        githubOnRefreshEvent: { owner: "microsoft", repo: "vscode", pullRequestUrls: ["https://github.com/microsoft/vscode/pull/2", "https://github.com/microsoft/vscode/pull/1"], pullRequestBranchName: "feature-2" }
      });
    });
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxwbGF0Zm9ybVxcYWdlbnRIb3N0XFx0ZXN0XFxub2RlXFxhZ2VudEhvc3RHaXRTdGF0ZVNlcnZpY2UudGVzdC50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCBhc3NlcnQgZnJvbSAnYXNzZXJ0JztcbmltcG9ydCB7IFVSSSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3VyaS5qcyc7XG5pbXBvcnQgeyBlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL3Rlc3QvY29tbW9uL3V0aWxzLmpzJztcbmltcG9ydCB7IHJ1bldpdGhGYWtlZFRpbWVycyB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvdGVzdC9jb21tb24vdGltZVRyYXZlbFNjaGVkdWxlci5qcyc7XG5pbXBvcnQgeyBOdWxsTG9nU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL2xvZy9jb21tb24vbG9nLmpzJztcbmltcG9ydCB7IElBZ2VudEhvc3RHaXRTZXJ2aWNlLCBNRVRBX0RJRkZfQkFTRV9CUkFOQ0ggfSBmcm9tICcuLi8uLi9jb21tb24vYWdlbnRIb3N0R2l0U2VydmljZS5qcyc7XG5pbXBvcnQgdHlwZSB7IElBZ2VudFNlcnZpY2UgfSBmcm9tICcuLi8uLi9jb21tb24vYWdlbnRTZXJ2aWNlLmpzJztcbmltcG9ydCB7IGdldFNlc3Npb25SZWxhdGVkUHVsbFJlcXVlc3RVcmxzLCBoYXNTZXNzaW9uUHVsbFJlcXVlc3RGb3JCcmFuY2gsIHJlYWRTZXNzaW9uR2l0SHViU3RhdGUsIHJlYWRTZXNzaW9uR2l0U3RhdGUsIHJlYWRTZXNzaW9uU291cmNlQ29udHJvbFN0YXRlLCBTRVNTSU9OX01FVEFfR0lUSFVCX0tFWSwgU2Vzc2lvblNvdXJjZUNvbnRyb2xPdXRjb21lLCB3aXRoSW5pdGlhbFNlc3Npb25QdWxsUmVxdWVzdCwgd2l0aE1vc3RSZWNlbnRSZWxhdGVkU2Vzc2lvblB1bGxSZXF1ZXN0LCB3aXRoTW9zdFJlY2VudFNlc3Npb25QdWxsUmVxdWVzdCwgd2l0aFNlc3Npb25HaXRIdWJTdGF0ZSwgd2l0aFNlc3Npb25HaXRTdGF0ZSwgU2Vzc2lvblN0YXR1cywgdHlwZSBJU2Vzc2lvbkdpdEh1YlN0YXRlLCB0eXBlIElTZXNzaW9uR2l0U3RhdGUsIHR5cGUgU2Vzc2lvblN1bW1hcnkgfSBmcm9tICcuLi8uLi9jb21tb24vc3RhdGUvc2Vzc2lvblN0YXRlLmpzJztcbmltcG9ydCB7IE1FVEFfR0lUX1NUQVRFLCBNRVRBX0dJVEhVQl9TVEFURSwgTUVUQV9TT1VSQ0VfQ09OVFJPTF9TVEFURSB9IGZyb20gJy4uLy4uL2NvbW1vbi9hZ2VudEhvc3RHaXRTdGF0ZVNlcnZpY2UuanMnO1xuaW1wb3J0IHsgQWdlbnRIb3N0R2l0U3RhdGVTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vbm9kZS9hZ2VudEhvc3RHaXRTdGF0ZVNlcnZpY2UuanMnO1xuaW1wb3J0IHsgY3JlYXRlVGVzdEdpdEh1YkVuZHBvaW50U2VydmljZSB9IGZyb20gJy4vdGVzdEdpdEh1YkVuZHBvaW50U2VydmljZS5qcyc7XG5pbXBvcnQgeyBBZ2VudEhvc3RTdGF0ZU1hbmFnZXIgfSBmcm9tICcuLi8uLi9ub2RlL2FnZW50SG9zdFN0YXRlTWFuYWdlci5qcyc7XG5pbXBvcnQgdHlwZSB7IENyZWF0ZWRQdWxsUmVxdWVzdCwgSUFnZW50SG9zdE9jdG9LaXRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vbm9kZS9zaGFyZWQvYWdlbnRIb3N0T2N0b0tpdFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgVGVzdFNlc3Npb25EYXRhYmFzZSwgY3JlYXRlTm9vcEdpdFNlcnZpY2UsIGNyZWF0ZVNlc3Npb25EYXRhU2VydmljZSB9IGZyb20gJy4uL2NvbW1vbi9zZXNzaW9uVGVzdEhlbHBlcnMuanMnO1xuaW1wb3J0IHsgU2Vzc2lvbkNvbmZpZ0tleSB9IGZyb20gJy4uLy4uL2NvbW1vbi9zZXNzaW9uQ29uZmlnS2V5cy5qcyc7XG5cbmNvbnN0IFNFU1NJT04gPSAnbW9jazovc2Vzc2lvbi0xJztcbmNvbnN0IFdPUktJTkdfRElSRUNUT1JZID0gJ2ZpbGU6Ly8vd2QnO1xuXG5zdWl0ZSgnQWdlbnRIb3N0R2l0U3RhdGVTZXJ2aWNlJywgKCkgPT4ge1xuXG5cdGNvbnN0IGRpc3Bvc2FibGVzID0gZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlKCk7XG5cblx0dGVzdCgnbWlncmF0ZXMgbGVnYWN5IHNpbmd1bGFyIHB1bGwgcmVxdWVzdCBtZXRhZGF0YSBvbiByZWFkJywgKCkgPT4ge1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocmVhZFNlc3Npb25HaXRIdWJTdGF0ZSh7XG5cdFx0XHRbU0VTU0lPTl9NRVRBX0dJVEhVQl9LRVldOiB7XG5cdFx0XHRcdG93bmVyOiAnbWljcm9zb2Z0Jyxcblx0XHRcdFx0cmVwbzogJ3ZzY29kZScsXG5cdFx0XHRcdHB1bGxSZXF1ZXN0VXJsOiAnaHR0cHM6Ly9naXRodWIuY29tL21pY3Jvc29mdC92c2NvZGUvcHVsbC8xJyxcblx0XHRcdH1cblx0XHR9KSwge1xuXHRcdFx0b3duZXI6ICdtaWNyb3NvZnQnLFxuXHRcdFx0cmVwbzogJ3ZzY29kZScsXG5cdFx0XHRwdWxsUmVxdWVzdFVybHM6IFsnaHR0cHM6Ly9naXRodWIuY29tL21pY3Jvc29mdC92c2NvZGUvcHVsbC8xJ10sXG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3ByZXNlcnZlcyBzdG9yZWQgcHVsbCByZXF1ZXN0IHJlY2VuY3kgb3JkZXIgd2hpbGUgZGVkdXBsaWNhdGluZycsICgpID0+IHtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHJlYWRTZXNzaW9uR2l0SHViU3RhdGUoe1xuXHRcdFx0W1NFU1NJT05fTUVUQV9HSVRIVUJfS0VZXToge1xuXHRcdFx0XHRwdWxsUmVxdWVzdFVybHM6IFtcblx0XHRcdFx0XHQnaHR0cHM6Ly9naXRodWIuY29tL21pY3Jvc29mdC92c2NvZGUvcHVsbC8zJyxcblx0XHRcdFx0XHQnaHR0cHM6Ly9naXRodWIuY29tL21pY3Jvc29mdC92c2NvZGUvcHVsbC8xJyxcblx0XHRcdFx0XHQnaHR0cHM6Ly9naXRodWIuY29tL21pY3Jvc29mdC92c2NvZGUvcHVsbC8yJyxcblx0XHRcdFx0XHQnaHR0cHM6Ly9naXRodWIuY29tL21pY3Jvc29mdC92c2NvZGUvcHVsbC8xLycsXG5cdFx0XHRcdF0sXG5cdFx0XHR9XG5cdFx0fSksIHtcblx0XHRcdHB1bGxSZXF1ZXN0VXJsczogW1xuXHRcdFx0XHQnaHR0cHM6Ly9naXRodWIuY29tL21pY3Jvc29mdC92c2NvZGUvcHVsbC8zJyxcblx0XHRcdFx0J2h0dHBzOi8vZ2l0aHViLmNvbS9taWNyb3NvZnQvdnNjb2RlL3B1bGwvMScsXG5cdFx0XHRcdCdodHRwczovL2dpdGh1Yi5jb20vbWljcm9zb2Z0L3ZzY29kZS9wdWxsLzInLFxuXHRcdFx0XSxcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgna2VlcHMgdGVuIGRlZHVwbGljYXRlZCBwdWxsIHJlcXVlc3RzIGluIG1vc3QtcmVjZW50IG9yZGVyJywgKCkgPT4ge1xuXHRcdGxldCBzdGF0ZTogSVNlc3Npb25HaXRIdWJTdGF0ZSB8IHVuZGVmaW5lZDtcblx0XHRmb3IgKGxldCBudW1iZXIgPSAxOyBudW1iZXIgPD0gMTE7IG51bWJlcisrKSB7XG5cdFx0XHRzdGF0ZSA9IHdpdGhNb3N0UmVjZW50U2Vzc2lvblB1bGxSZXF1ZXN0KHN0YXRlLCBgaHR0cHM6Ly9naXRodWIuY29tL21pY3Jvc29mdC92c2NvZGUvcHVsbC8ke251bWJlcn1gLCBgZmVhdHVyZS0ke251bWJlcn1gKTtcblx0XHR9XG5cdFx0c3RhdGUgPSB3aXRoTW9zdFJlY2VudFNlc3Npb25QdWxsUmVxdWVzdChzdGF0ZSwgJ2h0dHBzOi8vZ2l0aHViLmNvbS9taWNyb3NvZnQvdnNjb2RlL3B1bGwvNS8nLCAnZmVhdHVyZS01Jyk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHN0YXRlLCB7XG5cdFx0XHRwdWxsUmVxdWVzdFVybHM6IFtcblx0XHRcdFx0J2h0dHBzOi8vZ2l0aHViLmNvbS9taWNyb3NvZnQvdnNjb2RlL3B1bGwvNScsXG5cdFx0XHRcdCdodHRwczovL2dpdGh1Yi5jb20vbWljcm9zb2Z0L3ZzY29kZS9wdWxsLzExJyxcblx0XHRcdFx0J2h0dHBzOi8vZ2l0aHViLmNvbS9taWNyb3NvZnQvdnNjb2RlL3B1bGwvMTAnLFxuXHRcdFx0XHQnaHR0cHM6Ly9naXRodWIuY29tL21pY3Jvc29mdC92c2NvZGUvcHVsbC85Jyxcblx0XHRcdFx0J2h0dHBzOi8vZ2l0aHViLmNvbS9taWNyb3NvZnQvdnNjb2RlL3B1bGwvOCcsXG5cdFx0XHRcdCdodHRwczovL2dpdGh1Yi5jb20vbWljcm9zb2Z0L3ZzY29kZS9wdWxsLzcnLFxuXHRcdFx0XHQnaHR0cHM6Ly9naXRodWIuY29tL21pY3Jvc29mdC92c2NvZGUvcHVsbC82Jyxcblx0XHRcdFx0J2h0dHBzOi8vZ2l0aHViLmNvbS9taWNyb3NvZnQvdnNjb2RlL3B1bGwvNCcsXG5cdFx0XHRcdCdodHRwczovL2dpdGh1Yi5jb20vbWljcm9zb2Z0L3ZzY29kZS9wdWxsLzMnLFxuXHRcdFx0XHQnaHR0cHM6Ly9naXRodWIuY29tL21pY3Jvc29mdC92c2NvZGUvcHVsbC8yJyxcblx0XHRcdF0sXG5cdFx0XHRwdWxsUmVxdWVzdEJyYW5jaE5hbWU6ICdmZWF0dXJlLTUnLFxuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdwcm9tb3RlcyBhbiBpbml0aWFsIHB1bGwgcmVxdWVzdCBpbnRvIHRoZSBzZXNzaW9uJywgKCkgPT4ge1xuXHRcdGNvbnN0IGluaXRpYWwgPSAnaHR0cHM6Ly9naXRodWIuY29tL21pY3Jvc29mdC92c2NvZGUvcHVsbC8xJztcblx0XHRjb25zdCBzdGF0ZSA9IHdpdGhNb3N0UmVjZW50UmVsYXRlZFNlc3Npb25QdWxsUmVxdWVzdCh7XG5cdFx0XHRwdWxsUmVxdWVzdFVybHM6IFtpbml0aWFsXSxcblx0XHRcdGluaXRpYWxQdWxsUmVxdWVzdFVybHM6IFtpbml0aWFsXSxcblx0XHR9LCBpbml0aWFsLCAnZmVhdHVyZScpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRzdGF0ZSxcblx0XHRcdHJlbGF0ZWQ6IGdldFNlc3Npb25SZWxhdGVkUHVsbFJlcXVlc3RVcmxzKHN0YXRlKSxcblx0XHR9LCB7XG5cdFx0XHRzdGF0ZToge1xuXHRcdFx0XHRwdWxsUmVxdWVzdFVybHM6IFtpbml0aWFsXSxcblx0XHRcdFx0YXNzb2NpYXRlZFB1bGxSZXF1ZXN0VXJsczogW2luaXRpYWxdLFxuXHRcdFx0XHRwdWxsUmVxdWVzdEJyYW5jaE5hbWU6ICdmZWF0dXJlJyxcblx0XHRcdFx0aW5pdGlhbFB1bGxSZXF1ZXN0VXJsczogW10sXG5cdFx0XHR9LFxuXHRcdFx0cmVsYXRlZDogW2luaXRpYWxdLFxuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdrZWVwcyBjaGVja291dCByZWNlbmN5IHdoZW4gY29tYmluaW5nIGRpc2NvdmVyZWQgYW5kIGFzc29jaWF0ZWQgcHVsbCByZXF1ZXN0cycsICgpID0+IHtcblx0XHRjb25zdCBjdXJyZW50ID0gJ2h0dHBzOi8vZ2l0aHViLmNvbS9taWNyb3NvZnQvdnNjb2RlL3B1bGwvMic7XG5cdFx0Y29uc3QgcmVmZXJlbmNlZCA9ICdodHRwczovL2dpdGh1Yi5jb20vbWljcm9zb2Z0L3ZzY29kZS9wdWxsLzEnO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChnZXRTZXNzaW9uUmVsYXRlZFB1bGxSZXF1ZXN0VXJscyh7XG5cdFx0XHRwdWxsUmVxdWVzdFVybHM6IFtjdXJyZW50LCByZWZlcmVuY2VkXSxcblx0XHRcdGluaXRpYWxQdWxsUmVxdWVzdFVybHM6IFtyZWZlcmVuY2VkXSxcblx0XHRcdGFzc29jaWF0ZWRQdWxsUmVxdWVzdFVybHM6IFtyZWZlcmVuY2VkXSxcblx0XHR9KSwgW2N1cnJlbnQsIHJlZmVyZW5jZWRdKTtcblx0fSk7XG5cblx0dGVzdCgna2VlcHMgdGhlIG1vc3QgcmVjZW50bHkgZGlzY292ZXJlZCBwdWxsIHJlcXVlc3RzIGluIHRoZSBib3VuZGVkIGJhc2VsaW5lJywgKCkgPT4ge1xuXHRcdGxldCBzdGF0ZTogSVNlc3Npb25HaXRIdWJTdGF0ZSB8IHVuZGVmaW5lZDtcblx0XHRmb3IgKGxldCBudW1iZXIgPSAxOyBudW1iZXIgPD0gMTE7IG51bWJlcisrKSB7XG5cdFx0XHRzdGF0ZSA9IHsgLi4uc3RhdGUsIC4uLndpdGhJbml0aWFsU2Vzc2lvblB1bGxSZXF1ZXN0KHN0YXRlLCBgaHR0cHM6Ly9naXRodWIuY29tL21pY3Jvc29mdC92c2NvZGUvcHVsbC8ke251bWJlcn1gKSB9O1xuXHRcdH1cblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoc3RhdGU/LmluaXRpYWxQdWxsUmVxdWVzdFVybHMsIFtcblx0XHRcdCdodHRwczovL2dpdGh1Yi5jb20vbWljcm9zb2Z0L3ZzY29kZS9wdWxsLzExJyxcblx0XHRcdCdodHRwczovL2dpdGh1Yi5jb20vbWljcm9zb2Z0L3ZzY29kZS9wdWxsLzEwJyxcblx0XHRcdCdodHRwczovL2dpdGh1Yi5jb20vbWljcm9zb2Z0L3ZzY29kZS9wdWxsLzknLFxuXHRcdFx0J2h0dHBzOi8vZ2l0aHViLmNvbS9taWNyb3NvZnQvdnNjb2RlL3B1bGwvOCcsXG5cdFx0XHQnaHR0cHM6Ly9naXRodWIuY29tL21pY3Jvc29mdC92c2NvZGUvcHVsbC83Jyxcblx0XHRcdCdodHRwczovL2dpdGh1Yi5jb20vbWljcm9zb2Z0L3ZzY29kZS9wdWxsLzYnLFxuXHRcdFx0J2h0dHBzOi8vZ2l0aHViLmNvbS9taWNyb3NvZnQvdnNjb2RlL3B1bGwvNScsXG5cdFx0XHQnaHR0cHM6Ly9naXRodWIuY29tL21pY3Jvc29mdC92c2NvZGUvcHVsbC80Jyxcblx0XHRcdCdodHRwczovL2dpdGh1Yi5jb20vbWljcm9zb2Z0L3ZzY29kZS9wdWxsLzMnLFxuXHRcdFx0J2h0dHBzOi8vZ2l0aHViLmNvbS9taWNyb3NvZnQvdnNjb2RlL3B1bGwvMicsXG5cdFx0XSk7XG5cdH0pO1xuXG5cdGZ1bmN0aW9uIGNyZWF0ZUhhcm5lc3Mob3B0aW9ucz86IHsgb2N0b0tpdFNlcnZpY2U/OiBJQWdlbnRIb3N0T2N0b0tpdFNlcnZpY2U7IGFnZW50U2VydmljZT86IElBZ2VudFNlcnZpY2U7IGVudGVycHJpc2VVcmk/OiBzdHJpbmcgfSkge1xuXHRcdGNvbnN0IHN0YXRlTWFuYWdlciA9IGRpc3Bvc2FibGVzLmFkZChuZXcgQWdlbnRIb3N0U3RhdGVNYW5hZ2VyKG5ldyBOdWxsTG9nU2VydmljZSgpKSk7XG5cdFx0Y29uc3QgZGIgPSBuZXcgVGVzdFNlc3Npb25EYXRhYmFzZSgpO1xuXHRcdGNvbnN0IHNlc3Npb25EYXRhU2VydmljZSA9IGNyZWF0ZVNlc3Npb25EYXRhU2VydmljZShkYik7XG5cblx0XHRjb25zdCBnaXRDYWxsczogc3RyaW5nW10gPSBbXTtcblx0XHRjb25zdCBnaXRCYXNlQnJhbmNoZXM6IEFycmF5PHN0cmluZyB8IHVuZGVmaW5lZD4gPSBbXTtcblx0XHRsZXQgZ2l0UmVzdWx0OiBJU2Vzc2lvbkdpdFN0YXRlIHwgdW5kZWZpbmVkO1xuXHRcdGxldCBnaXRFcnJvcjogRXJyb3IgfCB1bmRlZmluZWQ7XG5cdFx0bGV0IGhlYWRTaGE6IHN0cmluZyB8IHVuZGVmaW5lZDtcblx0XHRjb25zdCBnaXRTZXJ2aWNlOiBJQWdlbnRIb3N0R2l0U2VydmljZSA9IHtcblx0XHRcdC4uLmNyZWF0ZU5vb3BHaXRTZXJ2aWNlKCksXG5cdFx0XHRnZXRTZXNzaW9uR2l0U3RhdGU6IGFzeW5jICh3b3JraW5nRGlyZWN0b3J5OiBVUkksIGJhc2VCcmFuY2hOYW1lPzogc3RyaW5nKSA9PiB7XG5cdFx0XHRcdGdpdENhbGxzLnB1c2god29ya2luZ0RpcmVjdG9yeS50b1N0cmluZygpKTtcblx0XHRcdFx0Z2l0QmFzZUJyYW5jaGVzLnB1c2goYmFzZUJyYW5jaE5hbWUpO1xuXHRcdFx0XHRpZiAoZ2l0RXJyb3IpIHtcblx0XHRcdFx0XHR0aHJvdyBnaXRFcnJvcjtcblx0XHRcdFx0fVxuXHRcdFx0XHRyZXR1cm4gZ2l0UmVzdWx0O1xuXHRcdFx0fSxcblx0XHRcdHJldlBhcnNlOiBhc3luYyAoKSA9PiBoZWFkU2hhLFxuXHRcdH07XG5cblx0XHRjb25zdCBwdWxsUmVxdWVzdENhbGxzOiBzdHJpbmdbXSA9IFtdO1xuXHRcdGNvbnN0IHB1bGxSZXF1ZXN0U2hhQ2FsbHM6IHN0cmluZ1tdID0gW107XG5cdFx0Y29uc3QgcHVsbFJlcXVlc3RzQnlCcmFuY2ggPSBuZXcgTWFwPHN0cmluZywgQ3JlYXRlZFB1bGxSZXF1ZXN0PigpO1xuXHRcdGNvbnN0IHB1bGxSZXF1ZXN0c0J5U2hhID0gbmV3IE1hcDxzdHJpbmcsIENyZWF0ZWRQdWxsUmVxdWVzdD4oKTtcblx0XHRsZXQgb25QdWxsUmVxdWVzdExvb2t1cDogKChicmFuY2g6IHN0cmluZykgPT4gUHJvbWlzZTx2b2lkPikgfCB1bmRlZmluZWQ7XG5cdFx0Y29uc3Qgb2N0b0tpdFNlcnZpY2UgPSB7XG5cdFx0XHRmaW5kUHVsbFJlcXVlc3RCeUhlYWRCcmFuY2g6IGFzeW5jIChfb3duZXI6IHN0cmluZywgX3JlcG86IHN0cmluZywgYnJhbmNoOiBzdHJpbmcpID0+IHtcblx0XHRcdFx0cHVsbFJlcXVlc3RDYWxscy5wdXNoKGJyYW5jaCk7XG5cdFx0XHRcdGF3YWl0IG9uUHVsbFJlcXVlc3RMb29rdXA/LihicmFuY2gpO1xuXHRcdFx0XHRyZXR1cm4gcHVsbFJlcXVlc3RzQnlCcmFuY2guZ2V0KGJyYW5jaCk7XG5cdFx0XHR9LFxuXHRcdFx0ZmluZFB1bGxSZXF1ZXN0QnlIZWFkU2hhOiBhc3luYyAoX293bmVyOiBzdHJpbmcsIF9yZXBvOiBzdHJpbmcsIHNoYTogc3RyaW5nKSA9PiB7XG5cdFx0XHRcdHB1bGxSZXF1ZXN0U2hhQ2FsbHMucHVzaChzaGEpO1xuXHRcdFx0XHRyZXR1cm4gcHVsbFJlcXVlc3RzQnlTaGEuZ2V0KHNoYSk7XG5cdFx0XHR9LFxuXHRcdH0gYXMgdW5rbm93biBhcyBJQWdlbnRIb3N0T2N0b0tpdFNlcnZpY2U7XG5cdFx0Y29uc3QgYWdlbnRTZXJ2aWNlID0geyBnZXRBdXRoVG9rZW46ICgpID0+ICd0b2tlbicgfSBhcyB1bmtub3duIGFzIElBZ2VudFNlcnZpY2U7XG5cblx0XHRjb25zdCBzZXJ2aWNlID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBBZ2VudEhvc3RHaXRTdGF0ZVNlcnZpY2UoXG5cdFx0XHRzdGF0ZU1hbmFnZXIsXG5cdFx0XHRnaXRTZXJ2aWNlLFxuXHRcdFx0b3B0aW9ucz8ub2N0b0tpdFNlcnZpY2UgPz8gb2N0b0tpdFNlcnZpY2UsXG5cdFx0XHRvcHRpb25zPy5hZ2VudFNlcnZpY2UgPz8gYWdlbnRTZXJ2aWNlLFxuXHRcdFx0Y3JlYXRlVGVzdEdpdEh1YkVuZHBvaW50U2VydmljZShvcHRpb25zPy5lbnRlcnByaXNlVXJpKSxcblx0XHRcdG5ldyBOdWxsTG9nU2VydmljZSgpLFxuXHRcdFx0c2Vzc2lvbkRhdGFTZXJ2aWNlLFxuXHRcdCkpO1xuXG5cdFx0Y29uc3QgcnVuRXZlbnRzOiBzdHJpbmdbXSA9IFtdO1xuXHRcdGRpc3Bvc2FibGVzLmFkZChzZXJ2aWNlLm9uRGlkUmVmcmVzaFNlc3Npb25HaXRTdGF0ZShrZXkgPT4gcnVuRXZlbnRzLnB1c2goa2V5KSkpO1xuXHRcdGNvbnN0IGdpdEh1YlN0YXRlRXZlbnRzOiBzdHJpbmdbXSA9IFtdO1xuXHRcdGRpc3Bvc2FibGVzLmFkZChzZXJ2aWNlLm9uRGlkQ2hhbmdlU2Vzc2lvbkdpdEh1YlN0YXRlKGtleSA9PiBnaXRIdWJTdGF0ZUV2ZW50cy5wdXNoKGtleSkpKTtcblxuXHRcdHJldHVybiB7XG5cdFx0XHRzdGF0ZU1hbmFnZXIsXG5cdFx0XHRkYixcblx0XHRcdHNlcnZpY2UsXG5cdFx0XHRnaXRDYWxscyxcblx0XHRcdGdpdEJhc2VCcmFuY2hlcyxcblx0XHRcdHJ1bkV2ZW50cyxcblx0XHRcdGdpdEh1YlN0YXRlRXZlbnRzLFxuXHRcdFx0cHVsbFJlcXVlc3RDYWxscyxcblx0XHRcdHB1bGxSZXF1ZXN0U2hhQ2FsbHMsXG5cdFx0XHRzZXRHaXRSZXN1bHQ6IChzdGF0ZTogSVNlc3Npb25HaXRTdGF0ZSB8IHVuZGVmaW5lZCkgPT4geyBnaXRSZXN1bHQgPSBzdGF0ZTsgfSxcblx0XHRcdHNldEdpdEVycm9yOiAoZXJyb3I6IEVycm9yKSA9PiB7IGdpdEVycm9yID0gZXJyb3I7IH0sXG5cdFx0XHRzZXRIZWFkU2hhOiAoc2hhOiBzdHJpbmcgfCB1bmRlZmluZWQpID0+IHsgaGVhZFNoYSA9IHNoYTsgfSxcblx0XHRcdHNldFB1bGxSZXF1ZXN0OiAoYnJhbmNoOiBzdHJpbmcsIHB1bGxSZXF1ZXN0OiBDcmVhdGVkUHVsbFJlcXVlc3QpID0+IHsgcHVsbFJlcXVlc3RzQnlCcmFuY2guc2V0KGJyYW5jaCwgcHVsbFJlcXVlc3QpOyB9LFxuXHRcdFx0c2V0UHVsbFJlcXVlc3RGb3JTaGE6IChzaGE6IHN0cmluZywgcHVsbFJlcXVlc3Q6IENyZWF0ZWRQdWxsUmVxdWVzdCkgPT4geyBwdWxsUmVxdWVzdHNCeVNoYS5zZXQoc2hhLCBwdWxsUmVxdWVzdCk7IH0sXG5cdFx0XHRzZXRPblB1bGxSZXF1ZXN0TG9va3VwOiAoZm46IChicmFuY2g6IHN0cmluZykgPT4gUHJvbWlzZTx2b2lkPikgPT4geyBvblB1bGxSZXF1ZXN0TG9va3VwID0gZm47IH0sXG5cdFx0fTtcblx0fVxuXG5cdGZ1bmN0aW9uIHNlZWRTZXNzaW9uKHN0YXRlTWFuYWdlcjogQWdlbnRIb3N0U3RhdGVNYW5hZ2VyLCBvcHRpb25zPzogeyB3b3JraW5nRGlyZWN0b3J5Pzogc3RyaW5nOyBwcm9qZWN0Pzogc3RyaW5nOyBnaXRTdGF0ZT86IElTZXNzaW9uR2l0U3RhdGU7IGdpdEh1YlN0YXRlPzogSVNlc3Npb25HaXRIdWJTdGF0ZTsgaXNvbGF0aW9uPzogJ2ZvbGRlcicgfCAnd29ya3RyZWUnOyBiYXNlQnJhbmNoPzogc3RyaW5nOyBjcmVhdGVkQXQ/OiBudW1iZXIgfSk6IHZvaWQge1xuXHRcdGNvbnN0IHN1bW1hcnk6IFNlc3Npb25TdW1tYXJ5ID0ge1xuXHRcdFx0cmVzb3VyY2U6IFNFU1NJT04sXG5cdFx0XHRwcm92aWRlcjogJ21vY2snLFxuXHRcdFx0dGl0bGU6ICdUZXN0Jyxcblx0XHRcdHN0YXR1czogU2Vzc2lvblN0YXR1cy5JZGxlLFxuXHRcdFx0Y3JlYXRlZEF0OiBuZXcgRGF0ZShvcHRpb25zPy5jcmVhdGVkQXQgPz8gMCkudG9JU09TdHJpbmcoKSxcblx0XHRcdG1vZGlmaWVkQXQ6IG5ldyBEYXRlKDApLnRvSVNPU3RyaW5nKCksXG5cdFx0XHR3b3JraW5nRGlyZWN0b3JpZXM6IG9wdGlvbnM/LndvcmtpbmdEaXJlY3RvcnkgPyBbb3B0aW9ucy53b3JraW5nRGlyZWN0b3J5XSA6IHVuZGVmaW5lZCxcblx0XHRcdHByb2plY3Q6IG9wdGlvbnM/LnByb2plY3QgPyB7IHVyaTogb3B0aW9ucy5wcm9qZWN0LCBkaXNwbGF5TmFtZTogJ1Byb2plY3QnIH0gOiB1bmRlZmluZWQsXG5cdFx0fTtcblx0XHQvLyBgcmVzdG9yZVNlc3Npb25gIG1hdGVyaWFsaXplcyB0aGUgc2Vzc2lvbiBpbiBgcmVhZHlgIGxpZmVjeWNsZSBzbyB0aGVcblx0XHQvLyBwZXJzaXN0ZW5jZSBwYXRoICh3aGljaCBza2lwcyBgY3JlYXRpbmdgIHNlc3Npb25zKSBhY3R1YWxseSBydW5zLlxuXHRcdHN0YXRlTWFuYWdlci5yZXN0b3JlU2Vzc2lvbihzdW1tYXJ5LCBbXSk7XG5cdFx0aWYgKG9wdGlvbnM/Lmlzb2xhdGlvbikge1xuXHRcdFx0c3RhdGVNYW5hZ2VyLnNldFNlc3Npb25Db25maWcoU0VTU0lPTiwge1xuXHRcdFx0XHRzY2hlbWE6IHsgdHlwZTogJ29iamVjdCcsIHByb3BlcnRpZXM6IHt9IH0sXG5cdFx0XHRcdHZhbHVlczoge1xuXHRcdFx0XHRcdFtTZXNzaW9uQ29uZmlnS2V5Lklzb2xhdGlvbl06IG9wdGlvbnMuaXNvbGF0aW9uLFxuXHRcdFx0XHRcdC4uLihvcHRpb25zLmJhc2VCcmFuY2ggPyB7IFtTZXNzaW9uQ29uZmlnS2V5LkJyYW5jaF06IG9wdGlvbnMuYmFzZUJyYW5jaCB9IDoge30pLFxuXHRcdFx0XHR9LFxuXHRcdFx0fSk7XG5cdFx0fVxuXHRcdGlmIChvcHRpb25zPy5naXRTdGF0ZSkge1xuXHRcdFx0c3RhdGVNYW5hZ2VyLnNldFNlc3Npb25NZXRhKFNFU1NJT04sIHdpdGhTZXNzaW9uR2l0U3RhdGUodW5kZWZpbmVkLCBvcHRpb25zLmdpdFN0YXRlKSk7XG5cdFx0fVxuXHRcdGlmIChvcHRpb25zPy5naXRIdWJTdGF0ZSkge1xuXHRcdFx0c3RhdGVNYW5hZ2VyLnNldFNlc3Npb25NZXRhKFNFU1NJT04sIHdpdGhTZXNzaW9uR2l0SHViU3RhdGUoc3RhdGVNYW5hZ2VyLmdldFNlc3Npb25TdGF0ZShTRVNTSU9OKT8uX21ldGEsIG9wdGlvbnMuZ2l0SHViU3RhdGUpKTtcblx0XHR9XG5cdH1cblxuXHR0ZXN0KCdwcmVzZXJ2ZXMgbWVyZ2UgcHJvdmVuYW5jZSB3aGVuIGEgbGF0ZXIgcHVsbCByZXF1ZXN0IGJlY29tZXMgdGhlIGxhdGVzdCBvdXRjb21lJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IGggPSBjcmVhdGVIYXJuZXNzKCk7XG5cdFx0c2VlZFNlc3Npb24oaC5zdGF0ZU1hbmFnZXIsIHsgd29ya2luZ0RpcmVjdG9yeTogV09SS0lOR19ESVJFQ1RPUlkgfSk7XG5cblx0XHRhd2FpdCBoLnNlcnZpY2UucmVjb3JkU2Vzc2lvbk1lcmdlKFNFU1NJT04sICdtZXJnZS1jb21taXQnKTtcblx0XHRjb25zdCBhZnRlck1lcmdlID0gcmVhZFNlc3Npb25Tb3VyY2VDb250cm9sU3RhdGUoaC5zdGF0ZU1hbmFnZXIuZ2V0U2Vzc2lvblN0YXRlKFNFU1NJT04pPy5fbWV0YSk7XG5cdFx0Y29uc3QgcGVyc2lzdGVkQWZ0ZXJNZXJnZSA9IGF3YWl0IGguZGIuZ2V0TWV0YWRhdGEoTUVUQV9TT1VSQ0VfQ09OVFJPTF9TVEFURSk7XG5cblx0XHRhd2FpdCBoLnNlcnZpY2Uuc2V0U2Vzc2lvbkdpdEh1YlN0YXRlKFNFU1NJT04sIHtcblx0XHRcdG93bmVyOiAnbWljcm9zb2Z0Jyxcblx0XHRcdHJlcG86ICd2c2NvZGUnLFxuXHRcdFx0cHVsbFJlcXVlc3RVcmxzOiBbJ2h0dHBzOi8vZ2l0aHViLmNvbS9taWNyb3NvZnQvdnNjb2RlL3B1bGwvNDInXSxcblx0XHRcdHB1bGxSZXF1ZXN0QnJhbmNoTmFtZTogJ2ZlYXR1cmUnLFxuXHRcdH0pO1xuXHRcdGNvbnN0IGFmdGVyUHVsbFJlcXVlc3QgPSByZWFkU2Vzc2lvblNvdXJjZUNvbnRyb2xTdGF0ZShoLnN0YXRlTWFuYWdlci5nZXRTZXNzaW9uU3RhdGUoU0VTU0lPTik/Ll9tZXRhKTtcblx0XHRjb25zdCBwZXJzaXN0ZWRBZnRlclB1bGxSZXF1ZXN0ID0gYXdhaXQgaC5kYi5nZXRNZXRhZGF0YShNRVRBX1NPVVJDRV9DT05UUk9MX1NUQVRFKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0YWZ0ZXJNZXJnZSxcblx0XHRcdHBlcnNpc3RlZEFmdGVyTWVyZ2U6IHBlcnNpc3RlZEFmdGVyTWVyZ2UgPyBKU09OLnBhcnNlKHBlcnNpc3RlZEFmdGVyTWVyZ2UpIDogdW5kZWZpbmVkLFxuXHRcdFx0YWZ0ZXJQdWxsUmVxdWVzdCxcblx0XHRcdGdpdEh1YlN0YXRlRXZlbnRzOiBoLmdpdEh1YlN0YXRlRXZlbnRzLFxuXHRcdFx0cGVyc2lzdGVkQWZ0ZXJQdWxsUmVxdWVzdDogcGVyc2lzdGVkQWZ0ZXJQdWxsUmVxdWVzdCA/IEpTT04ucGFyc2UocGVyc2lzdGVkQWZ0ZXJQdWxsUmVxdWVzdCkgOiB1bmRlZmluZWQsXG5cdFx0fSwge1xuXHRcdFx0YWZ0ZXJNZXJnZToge1xuXHRcdFx0XHRtZXJnZTogeyBjb21taXQ6ICdtZXJnZS1jb21taXQnIH0sXG5cdFx0XHRcdGxhdGVzdE91dGNvbWU6IFNlc3Npb25Tb3VyY2VDb250cm9sT3V0Y29tZS5NZXJnZSxcblx0XHRcdH0sXG5cdFx0XHRwZXJzaXN0ZWRBZnRlck1lcmdlOiB7XG5cdFx0XHRcdG1lcmdlOiB7IGNvbW1pdDogJ21lcmdlLWNvbW1pdCcgfSxcblx0XHRcdFx0bGF0ZXN0T3V0Y29tZTogU2Vzc2lvblNvdXJjZUNvbnRyb2xPdXRjb21lLk1lcmdlLFxuXHRcdFx0fSxcblx0XHRcdGFmdGVyUHVsbFJlcXVlc3Q6IHtcblx0XHRcdFx0bWVyZ2U6IHsgY29tbWl0OiAnbWVyZ2UtY29tbWl0JyB9LFxuXHRcdFx0XHRsYXRlc3RPdXRjb21lOiBTZXNzaW9uU291cmNlQ29udHJvbE91dGNvbWUuUHVsbFJlcXVlc3QsXG5cdFx0XHR9LFxuXHRcdFx0Z2l0SHViU3RhdGVFdmVudHM6IFtTRVNTSU9OXSxcblx0XHRcdHBlcnNpc3RlZEFmdGVyUHVsbFJlcXVlc3Q6IHtcblx0XHRcdFx0bWVyZ2U6IHsgY29tbWl0OiAnbWVyZ2UtY29tbWl0JyB9LFxuXHRcdFx0XHRsYXRlc3RPdXRjb21lOiBTZXNzaW9uU291cmNlQ29udHJvbE91dGNvbWUuUHVsbFJlcXVlc3QsXG5cdFx0XHR9LFxuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdkb2VzIG5vdGhpbmcgd2hlbiBubyB3b3JraW5nIGRpcmVjdG9yeSBjYW4gYmUgcmVzb2x2ZWQnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgaCA9IGNyZWF0ZUhhcm5lc3MoKTtcblx0XHRzZWVkU2Vzc2lvbihoLnN0YXRlTWFuYWdlcik7XG5cblx0XHRhd2FpdCBoLnNlcnZpY2UucmVmcmVzaFNlc3Npb25HaXRTdGF0ZShTRVNTSU9OLCB1bmRlZmluZWQpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRnaXRDYWxsczogaC5naXRDYWxscyxcblx0XHRcdHJ1bkV2ZW50czogaC5ydW5FdmVudHNcblx0XHR9LCB7XG5cdFx0XHRnaXRDYWxsczogW10sXG5cdFx0XHRydW5FdmVudHM6IFtdXG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3VzZXMgdGhlIHNlbGVjdGVkIHdvcmt0cmVlIGJhc2UgYnJhbmNoIHdoZW4gcmVmcmVzaGluZyBnaXQgc3RhdGUnLCAoKSA9PiBydW5XaXRoRmFrZWRUaW1lcnMoeyB1c2VGYWtlVGltZXJzOiB0cnVlIH0sIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBoID0gY3JlYXRlSGFybmVzcygpO1xuXHRcdHNlZWRTZXNzaW9uKGguc3RhdGVNYW5hZ2VyLCB7XG5cdFx0XHR3b3JraW5nRGlyZWN0b3J5OiBXT1JLSU5HX0RJUkVDVE9SWSxcblx0XHRcdGlzb2xhdGlvbjogJ3dvcmt0cmVlJyxcblx0XHRcdGJhc2VCcmFuY2g6ICdyZWxlYXNlJyxcblx0XHR9KTtcblx0XHRoLnNldEdpdFJlc3VsdCh7IGJyYW5jaE5hbWU6ICdhZ2VudHMvc2Vzc2lvbicsIGJhc2VCcmFuY2hOYW1lOiAncmVsZWFzZScgfSk7XG5cblx0XHRhd2FpdCBoLnNlcnZpY2UucmVmcmVzaFNlc3Npb25HaXRTdGF0ZShTRVNTSU9OLCB1bmRlZmluZWQpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChoLmdpdEJhc2VCcmFuY2hlcywgWydyZWxlYXNlJ10pO1xuXHR9KSk7XG5cblx0dGVzdCgndXNlcyB0aGUgcGVyc2lzdGVkIHdvcmt0cmVlIGJhc2UgYnJhbmNoIGZvciBhbiBhZG9wdGVkIGxpbmtlZCB3b3JrdHJlZScsICgpID0+IHJ1bldpdGhGYWtlZFRpbWVycyh7IHVzZUZha2VUaW1lcnM6IHRydWUgfSwgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IGggPSBjcmVhdGVIYXJuZXNzKCk7XG5cdFx0c2VlZFNlc3Npb24oaC5zdGF0ZU1hbmFnZXIsIHtcblx0XHRcdHdvcmtpbmdEaXJlY3Rvcnk6IFdPUktJTkdfRElSRUNUT1JZLFxuXHRcdFx0cHJvamVjdDogJ2ZpbGU6Ly8vcmVwbycsXG5cdFx0XHRpc29sYXRpb246ICdmb2xkZXInLFxuXHRcdFx0Z2l0U3RhdGU6IHsgYnJhbmNoTmFtZTogJ2FnZW50cy9zZXNzaW9uJywgYmFzZUJyYW5jaE5hbWU6ICdtYWluJyB9LFxuXHRcdH0pO1xuXHRcdGF3YWl0IGguZGIuc2V0TWV0YWRhdGEoTUVUQV9ESUZGX0JBU0VfQlJBTkNILCAnb3JpZ2luL3JlbGVhc2UnKTtcblx0XHRoLnNldEdpdFJlc3VsdCh7IGJyYW5jaE5hbWU6ICdhZ2VudHMvc2Vzc2lvbicsIGJhc2VCcmFuY2hOYW1lOiAncmVsZWFzZScgfSk7XG5cblx0XHRhd2FpdCBoLnNlcnZpY2UucmVmcmVzaFNlc3Npb25HaXRTdGF0ZShTRVNTSU9OLCB1bmRlZmluZWQpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChoLmdpdEJhc2VCcmFuY2hlcywgWydyZWxlYXNlJ10pO1xuXHR9KSk7XG5cblx0dGVzdCgncmVmcmVzaGVzIGdpdCBzdGF0ZSBpbiBtZW1vcnkgd2hpbGUgYSBzZXNzaW9uIGlzIGNyZWF0aW5nJywgYXN5bmMgKCkgPT4ge1xuXHRcdGF3YWl0IHJ1bldpdGhGYWtlZFRpbWVycyh7IHVzZUZha2VUaW1lcnM6IHRydWUgfSwgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgaCA9IGNyZWF0ZUhhcm5lc3MoKTtcblx0XHRcdGguc3RhdGVNYW5hZ2VyLmNyZWF0ZVNlc3Npb24oe1xuXHRcdFx0XHRyZXNvdXJjZTogU0VTU0lPTixcblx0XHRcdFx0cHJvdmlkZXI6ICdtb2NrJyxcblx0XHRcdFx0dGl0bGU6ICdUZXN0Jyxcblx0XHRcdFx0c3RhdHVzOiBTZXNzaW9uU3RhdHVzLklkbGUsXG5cdFx0XHRcdGNyZWF0ZWRBdDogbmV3IERhdGUoMCkudG9JU09TdHJpbmcoKSxcblx0XHRcdFx0bW9kaWZpZWRBdDogbmV3IERhdGUoMCkudG9JU09TdHJpbmcoKSxcblx0XHRcdFx0d29ya2luZ0RpcmVjdG9yaWVzOiBbJ2ZpbGU6Ly8vb3JpZ2luYWwnXSxcblx0XHRcdH0sIHsgZW1pdE5vdGlmaWNhdGlvbjogZmFsc2UgfSk7XG5cdFx0XHRjb25zdCBuZXh0OiBJU2Vzc2lvbkdpdFN0YXRlID0geyBicmFuY2hOYW1lOiAnZmVhdHVyZScsIHVuY29tbWl0dGVkQ2hhbmdlczogMSB9O1xuXHRcdFx0aC5zZXRHaXRSZXN1bHQobmV4dCk7XG5cblx0XHRcdGF3YWl0IGguc2VydmljZS5yZWZyZXNoU2Vzc2lvbkdpdFN0YXRlKFNFU1NJT04sIFVSSS5wYXJzZSgnZmlsZTovLy9leHBsaWNpdCcpKTtcblxuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRcdGdpdENhbGxzOiBoLmdpdENhbGxzLFxuXHRcdFx0XHRnaXRTdGF0ZTogcmVhZFNlc3Npb25HaXRTdGF0ZShoLnN0YXRlTWFuYWdlci5nZXRTZXNzaW9uU3RhdGUoU0VTU0lPTik/Ll9tZXRhKSxcblx0XHRcdFx0cGVyc2lzdGVkR2l0OiBhd2FpdCBoLmRiLmdldE1ldGFkYXRhKE1FVEFfR0lUX1NUQVRFKSxcblx0XHRcdFx0cnVuRXZlbnRzOiBoLnJ1bkV2ZW50cyxcblx0XHRcdH0sIHtcblx0XHRcdFx0Z2l0Q2FsbHM6IFsnZmlsZTovLy9leHBsaWNpdCddLFxuXHRcdFx0XHRnaXRTdGF0ZTogbmV4dCxcblx0XHRcdFx0cGVyc2lzdGVkR2l0OiB1bmRlZmluZWQsXG5cdFx0XHRcdHJ1bkV2ZW50czogW1NFU1NJT05dLFxuXHRcdFx0fSk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3Jlc29sdmVzIHRoZSB3b3JraW5nIGRpcmVjdG9yeSBmcm9tIHRoZSBzZXNzaW9uIHN1bW1hcnkgd2hlbiBub25lIGlzIHByb3ZpZGVkJywgYXN5bmMgKCkgPT4ge1xuXHRcdGF3YWl0IHJ1bldpdGhGYWtlZFRpbWVycyh7IHVzZUZha2VUaW1lcnM6IHRydWUgfSwgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgaCA9IGNyZWF0ZUhhcm5lc3MoKTtcblx0XHRcdHNlZWRTZXNzaW9uKGguc3RhdGVNYW5hZ2VyLCB7IHdvcmtpbmdEaXJlY3Rvcnk6IFdPUktJTkdfRElSRUNUT1JZIH0pO1xuXHRcdFx0aC5zZXRHaXRSZXN1bHQoeyBicmFuY2hOYW1lOiAnZmVhdHVyZScgfSk7XG5cblx0XHRcdGF3YWl0IGguc2VydmljZS5yZWZyZXNoU2Vzc2lvbkdpdFN0YXRlKFNFU1NJT04sIHVuZGVmaW5lZCk7XG5cblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoaC5naXRDYWxscywgW1dPUktJTkdfRElSRUNUT1JZXSk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3ByZWZlcnMgYW4gZXhwbGljaXRseSBwcm92aWRlZCB3b3JraW5nIGRpcmVjdG9yeSBvdmVyIHRoZSBzZXNzaW9uIHN1bW1hcnknLCBhc3luYyAoKSA9PiB7XG5cdFx0YXdhaXQgcnVuV2l0aEZha2VkVGltZXJzKHsgdXNlRmFrZVRpbWVyczogdHJ1ZSB9LCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCBoID0gY3JlYXRlSGFybmVzcygpO1xuXHRcdFx0c2VlZFNlc3Npb24oaC5zdGF0ZU1hbmFnZXIsIHsgd29ya2luZ0RpcmVjdG9yeTogV09SS0lOR19ESVJFQ1RPUlkgfSk7XG5cdFx0XHRoLnNldEdpdFJlc3VsdCh7IGJyYW5jaE5hbWU6ICdmZWF0dXJlJyB9KTtcblxuXHRcdFx0YXdhaXQgaC5zZXJ2aWNlLnJlZnJlc2hTZXNzaW9uR2l0U3RhdGUoU0VTU0lPTiwgVVJJLnBhcnNlKCdmaWxlOi8vL2V4cGxpY2l0JykpO1xuXG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGguZ2l0Q2FsbHMsIFsnZmlsZTovLy9leHBsaWNpdCddKTtcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgndW5jaGFuZ2VkIGdpdCBzdGF0ZSBzdGlsbCBmaXJlcyB0aGUgcnVuLXJlZnJlc2ggZXZlbnQnLCBhc3luYyAoKSA9PiB7XG5cdFx0YXdhaXQgcnVuV2l0aEZha2VkVGltZXJzKHsgdXNlRmFrZVRpbWVyczogdHJ1ZSB9LCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCBnaXRTdGF0ZTogSVNlc3Npb25HaXRTdGF0ZSA9IHsgYnJhbmNoTmFtZTogJ2ZlYXR1cmUnLCB1bmNvbW1pdHRlZENoYW5nZXM6IDEgfTtcblx0XHRcdGNvbnN0IGggPSBjcmVhdGVIYXJuZXNzKCk7XG5cdFx0XHRzZWVkU2Vzc2lvbihoLnN0YXRlTWFuYWdlciwgeyB3b3JraW5nRGlyZWN0b3J5OiBXT1JLSU5HX0RJUkVDVE9SWSwgZ2l0U3RhdGUgfSk7XG5cdFx0XHRoLnNldEdpdFJlc3VsdChnaXRTdGF0ZSk7XG5cblx0XHRcdGF3YWl0IGguc2VydmljZS5yZWZyZXNoU2Vzc2lvbkdpdFN0YXRlKFNFU1NJT04sIHVuZGVmaW5lZCk7XG5cblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoaC5ydW5FdmVudHMsIFtTRVNTSU9OXSk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3VuY2hhbmdlZCBnaXQgc3RhdGUgYmFja2ZpbGxzIG1pc3NpbmcgR2l0SHViIHN0YXRlJywgYXN5bmMgKCkgPT4ge1xuXHRcdGF3YWl0IHJ1bldpdGhGYWtlZFRpbWVycyh7IHVzZUZha2VUaW1lcnM6IHRydWUgfSwgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgZ2l0U3RhdGU6IElTZXNzaW9uR2l0U3RhdGUgPSB7XG5cdFx0XHRcdGJyYW5jaE5hbWU6ICdmZWF0dXJlJyxcblx0XHRcdFx0Z2l0aHViT3duZXI6ICdtaWNyb3NvZnQnLFxuXHRcdFx0XHRnaXRodWJSZXBvOiAndnNjb2RlJyxcblx0XHRcdH07XG5cdFx0XHRjb25zdCBoID0gY3JlYXRlSGFybmVzcygpO1xuXHRcdFx0c2VlZFNlc3Npb24oaC5zdGF0ZU1hbmFnZXIsIHsgd29ya2luZ0RpcmVjdG9yeTogV09SS0lOR19ESVJFQ1RPUlksIGdpdFN0YXRlIH0pO1xuXHRcdFx0aC5zZXRHaXRSZXN1bHQoZ2l0U3RhdGUpO1xuXG5cdFx0XHRhd2FpdCBoLnNlcnZpY2UucmVmcmVzaFNlc3Npb25HaXRTdGF0ZShTRVNTSU9OLCB1bmRlZmluZWQpO1xuXG5cdFx0XHRjb25zdCBwZXJzaXN0ZWRHaXRIdWJTdGF0ZSA9IGF3YWl0IGguZGIuZ2V0TWV0YWRhdGEoTUVUQV9HSVRIVUJfU1RBVEUpO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRcdGdpdGh1YjogcmVhZFNlc3Npb25HaXRIdWJTdGF0ZShoLnN0YXRlTWFuYWdlci5nZXRTZXNzaW9uU3RhdGUoU0VTU0lPTik/Ll9tZXRhKSxcblx0XHRcdFx0cGVyc2lzdGVkR2l0SHViOiBwZXJzaXN0ZWRHaXRIdWJTdGF0ZSA/IEpTT04ucGFyc2UocGVyc2lzdGVkR2l0SHViU3RhdGUpIDogdW5kZWZpbmVkLFxuXHRcdFx0fSwge1xuXHRcdFx0XHRnaXRodWI6IHsgb3duZXI6ICdtaWNyb3NvZnQnLCByZXBvOiAndnNjb2RlJyB9LFxuXHRcdFx0XHRwZXJzaXN0ZWRHaXRIdWI6IHsgb3duZXI6ICdtaWNyb3NvZnQnLCByZXBvOiAndnNjb2RlJyB9LFxuXHRcdFx0fSk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2NoYW5nZWQgZ2l0IHN0YXRlIHVwZGF0ZXMgdGhlIHNlc3Npb24gbWV0YSBhbmQgZmlyZXMgdGhlIHJ1bi1yZWZyZXNoIGV2ZW50JywgYXN5bmMgKCkgPT4ge1xuXHRcdGF3YWl0IHJ1bldpdGhGYWtlZFRpbWVycyh7IHVzZUZha2VUaW1lcnM6IHRydWUgfSwgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgaCA9IGNyZWF0ZUhhcm5lc3MoKTtcblx0XHRcdHNlZWRTZXNzaW9uKGguc3RhdGVNYW5hZ2VyLCB7IHdvcmtpbmdEaXJlY3Rvcnk6IFdPUktJTkdfRElSRUNUT1JZIH0pO1xuXHRcdFx0Y29uc3QgbmV4dDogSVNlc3Npb25HaXRTdGF0ZSA9IHsgYnJhbmNoTmFtZTogJ2ZlYXR1cmUnLCBiYXNlQnJhbmNoTmFtZTogJ21haW4nLCB1bmNvbW1pdHRlZENoYW5nZXM6IDIgfTtcblx0XHRcdGguc2V0R2l0UmVzdWx0KG5leHQpO1xuXG5cdFx0XHRhd2FpdCBoLnNlcnZpY2UucmVmcmVzaFNlc3Npb25HaXRTdGF0ZShTRVNTSU9OLCB1bmRlZmluZWQpO1xuXG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdFx0Z2l0U3RhdGU6IHJlYWRTZXNzaW9uR2l0U3RhdGUoaC5zdGF0ZU1hbmFnZXIuZ2V0U2Vzc2lvblN0YXRlKFNFU1NJT04pPy5fbWV0YSksXG5cdFx0XHRcdHJ1bkV2ZW50czogaC5ydW5FdmVudHMsXG5cdFx0XHR9LCB7XG5cdFx0XHRcdGdpdFN0YXRlOiBuZXh0LFxuXHRcdFx0XHRydW5FdmVudHM6IFtTRVNTSU9OXSxcblx0XHRcdH0pO1xuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdwZXJzaXN0cyBnaXQgc3RhdGUgYW5kIGRlcml2ZXMgR2l0SHViIHN0YXRlIHdoZW4gZ2l0IHJlcG9ydHMgYSBHaXRIdWIgcmVwbycsIGFzeW5jICgpID0+IHtcblx0XHRhd2FpdCBydW5XaXRoRmFrZWRUaW1lcnMoeyB1c2VGYWtlVGltZXJzOiB0cnVlIH0sIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IGggPSBjcmVhdGVIYXJuZXNzKCk7XG5cdFx0XHRzZWVkU2Vzc2lvbihoLnN0YXRlTWFuYWdlciwgeyB3b3JraW5nRGlyZWN0b3J5OiBXT1JLSU5HX0RJUkVDVE9SWSB9KTtcblx0XHRcdGNvbnN0IG5leHQ6IElTZXNzaW9uR2l0U3RhdGUgPSB7IGJyYW5jaE5hbWU6ICdmZWF0dXJlJywgZ2l0aHViT3duZXI6ICdtaWNyb3NvZnQnLCBnaXRodWJSZXBvOiAndnNjb2RlJyB9O1xuXHRcdFx0aC5zZXRHaXRSZXN1bHQobmV4dCk7XG5cblx0XHRcdGF3YWl0IGguc2VydmljZS5yZWZyZXNoU2Vzc2lvbkdpdFN0YXRlKFNFU1NJT04sIHVuZGVmaW5lZCk7XG5cblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0XHRnaXRodWI6IHJlYWRTZXNzaW9uR2l0SHViU3RhdGUoaC5zdGF0ZU1hbmFnZXIuZ2V0U2Vzc2lvblN0YXRlKFNFU1NJT04pPy5fbWV0YSksXG5cdFx0XHRcdHBlcnNpc3RlZEdpdDogYXdhaXQgaC5kYi5nZXRNZXRhZGF0YShNRVRBX0dJVF9TVEFURSksXG5cdFx0XHR9LCB7XG5cdFx0XHRcdGdpdGh1YjogeyBvd25lcjogJ21pY3Jvc29mdCcsIHJlcG86ICd2c2NvZGUnIH0sXG5cdFx0XHRcdHBlcnNpc3RlZEdpdDogSlNPTi5zdHJpbmdpZnkobmV4dCksXG5cdFx0XHR9KTtcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgncHJlc2VydmVzIHB1bGwgcmVxdWVzdCBhdHRhY2htZW50IHdoZW4gYSBsYXRlciByZWZyZXNoIHJlcGxhY2VzIGl0cyBxdWV1ZWQgcmVmcmVzaCcsIGFzeW5jICgpID0+IHtcblx0XHRhd2FpdCBydW5XaXRoRmFrZWRUaW1lcnMoeyB1c2VGYWtlVGltZXJzOiB0cnVlIH0sIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IGNhbGxzOiB7IG93bmVyOiBzdHJpbmc7IHJlcG86IHN0cmluZzsgYnJhbmNoOiBzdHJpbmc7IGhlYWRPd25lcjogc3RyaW5nIHwgdW5kZWZpbmVkIH1bXSA9IFtdO1xuXHRcdFx0Y29uc3Qgb2N0b0tpdFNlcnZpY2UgPSB7XG5cdFx0XHRcdGZpbmRQdWxsUmVxdWVzdEJ5SGVhZEJyYW5jaDogYXN5bmMgKG93bmVyOiBzdHJpbmcsIHJlcG86IHN0cmluZywgYnJhbmNoOiBzdHJpbmcsIF90b2tlbjogc3RyaW5nLCBfc2lnbmFsOiBBYm9ydFNpZ25hbCwgaGVhZE93bmVyPzogc3RyaW5nKSA9PiB7XG5cdFx0XHRcdFx0Y2FsbHMucHVzaCh7IG93bmVyLCByZXBvLCBicmFuY2gsIGhlYWRPd25lciB9KTtcblx0XHRcdFx0XHRyZXR1cm4geyB1cmw6ICdodHRwczovL2dpdGh1Yi5jb20vbWljcm9zb2Z0L3ZzY29kZS9wdWxsLzEnLCBudW1iZXI6IDEgfTtcblx0XHRcdFx0fSxcblx0XHRcdH0gYXMgdW5rbm93biBhcyBJQWdlbnRIb3N0T2N0b0tpdFNlcnZpY2U7XG5cdFx0XHRjb25zdCBhZ2VudFNlcnZpY2UgPSB7IGdldEF1dGhUb2tlbjogKCkgPT4gJ3Rva2VuJyB9IGFzIHVua25vd24gYXMgSUFnZW50U2VydmljZTtcblx0XHRcdGNvbnN0IGggPSBjcmVhdGVIYXJuZXNzKHsgb2N0b0tpdFNlcnZpY2UsIGFnZW50U2VydmljZSB9KTtcblx0XHRcdHNlZWRTZXNzaW9uKGguc3RhdGVNYW5hZ2VyLCB7XG5cdFx0XHRcdHdvcmtpbmdEaXJlY3Rvcnk6IFdPUktJTkdfRElSRUNUT1JZLFxuXHRcdFx0XHRnaXRTdGF0ZToge1xuXHRcdFx0XHRcdGJyYW5jaE5hbWU6ICdmZWF0dXJlJyxcblx0XHRcdFx0XHRiYXNlQnJhbmNoTmFtZTogJ21haW4nLFxuXHRcdFx0XHRcdGdpdGh1Yk93bmVyOiAnbWljcm9zb2Z0Jyxcblx0XHRcdFx0XHRnaXRodWJSZXBvOiAndnNjb2RlJyxcblx0XHRcdFx0fSxcblx0XHRcdH0pO1xuXHRcdFx0aC5zZXRHaXRSZXN1bHQoe1xuXHRcdFx0XHRicmFuY2hOYW1lOiAnZmVhdHVyZScsXG5cdFx0XHRcdGJhc2VCcmFuY2hOYW1lOiAnbWFpbicsXG5cdFx0XHRcdHVwc3RyZWFtQnJhbmNoTmFtZTogJ2ZvcmsvZmVhdHVyZScsXG5cdFx0XHRcdGdpdGh1Yk93bmVyOiAnbWljcm9zb2Z0Jyxcblx0XHRcdFx0Z2l0aHViSGVhZE93bmVyOiAnZm9yay1vd25lcicsXG5cdFx0XHRcdGdpdGh1YlJlcG86ICd2c2NvZGUnLFxuXHRcdFx0fSk7XG5cblx0XHRcdGF3YWl0IFByb21pc2UuYWxsKFtcblx0XHRcdFx0aC5zZXJ2aWNlLnJlZnJlc2hTZXNzaW9uR2l0U3RhdGUoU0VTU0lPTiwgVVJJLnBhcnNlKFdPUktJTkdfRElSRUNUT1JZKSksXG5cdFx0XHRcdGguc2VydmljZS5hdHRhY2hTZXNzaW9uR2l0SHViUHVsbFJlcXVlc3QoU0VTU0lPTiwgVVJJLnBhcnNlKFdPUktJTkdfRElSRUNUT1JZKSksXG5cdFx0XHRcdGguc2VydmljZS5yZWZyZXNoU2Vzc2lvbkdpdFN0YXRlKFNFU1NJT04sIFVSSS5wYXJzZShXT1JLSU5HX0RJUkVDVE9SWSkpLFxuXHRcdFx0XSk7XG5cblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0XHRnaXRDYWxsczogaC5naXRDYWxscy5sZW5ndGgsXG5cdFx0XHRcdGNhbGxzLFxuXHRcdFx0XHRnaXRodWI6IHJlYWRTZXNzaW9uR2l0SHViU3RhdGUoaC5zdGF0ZU1hbmFnZXIuZ2V0U2Vzc2lvblN0YXRlKFNFU1NJT04pPy5fbWV0YSksXG5cdFx0XHR9LCB7XG5cdFx0XHRcdGdpdENhbGxzOiAyLFxuXHRcdFx0XHRjYWxsczogW3sgb3duZXI6ICdtaWNyb3NvZnQnLCByZXBvOiAndnNjb2RlJywgYnJhbmNoOiAnZmVhdHVyZScsIGhlYWRPd25lcjogJ2Zvcmstb3duZXInIH1dLFxuXHRcdFx0XHRnaXRodWI6IHtcblx0XHRcdFx0XHRvd25lcjogJ21pY3Jvc29mdCcsXG5cdFx0XHRcdFx0cmVwbzogJ3ZzY29kZScsXG5cdFx0XHRcdFx0cHVsbFJlcXVlc3RVcmxzOiBbJ2h0dHBzOi8vZ2l0aHViLmNvbS9taWNyb3NvZnQvdnNjb2RlL3B1bGwvMSddLFxuXHRcdFx0XHRcdHB1bGxSZXF1ZXN0QnJhbmNoTmFtZTogJ2ZlYXR1cmUnLFxuXHRcdFx0XHR9LFxuXHRcdFx0fSk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2xvb2tzIGEgcHVsbCByZXF1ZXN0IHVwIGJ5IHRoZSB1cHN0cmVhbSBicmFuY2ggcmF0aGVyIHRoYW4gdGhlIGxvY2FsIGJyYW5jaCBuYW1lJywgYXN5bmMgKCkgPT4ge1xuXHRcdGF3YWl0IHJ1bldpdGhGYWtlZFRpbWVycyh7IHVzZUZha2VUaW1lcnM6IHRydWUgfSwgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgZ2l0U3RhdGU6IElTZXNzaW9uR2l0U3RhdGUgPSB7XG5cdFx0XHRcdGJyYW5jaE5hbWU6ICdsb2NhbC1uYW1lJyxcblx0XHRcdFx0YmFzZUJyYW5jaE5hbWU6ICdtYWluJyxcblx0XHRcdFx0dXBzdHJlYW1CcmFuY2hOYW1lOiAnb3JpZ2luL3JlbW90ZS1uYW1lJyxcblx0XHRcdFx0Z2l0aHViSGVhZE93bmVyOiAnbWljcm9zb2Z0Jyxcblx0XHRcdH07XG5cdFx0XHRjb25zdCBoID0gY3JlYXRlSGFybmVzcygpO1xuXHRcdFx0c2VlZFNlc3Npb24oaC5zdGF0ZU1hbmFnZXIsIHtcblx0XHRcdFx0d29ya2luZ0RpcmVjdG9yeTogV09SS0lOR19ESVJFQ1RPUlksXG5cdFx0XHRcdGdpdFN0YXRlLFxuXHRcdFx0XHRnaXRIdWJTdGF0ZTogeyBvd25lcjogJ21pY3Jvc29mdCcsIHJlcG86ICd2c2NvZGUnIH0sXG5cdFx0XHR9KTtcblx0XHRcdGguc2V0R2l0UmVzdWx0KGdpdFN0YXRlKTtcblx0XHRcdGguc2V0UHVsbFJlcXVlc3QoJ3JlbW90ZS1uYW1lJywgeyB1cmw6ICdodHRwczovL2dpdGh1Yi5jb20vbWljcm9zb2Z0L3ZzY29kZS9wdWxsLzEnLCBudW1iZXI6IDEgfSk7XG5cblx0XHRcdGF3YWl0IGguc2VydmljZS5hdHRhY2hTZXNzaW9uR2l0SHViUHVsbFJlcXVlc3QoU0VTU0lPTiwgVVJJLnBhcnNlKFdPUktJTkdfRElSRUNUT1JZKSk7XG5cblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0XHRwdWxsUmVxdWVzdENhbGxzOiBoLnB1bGxSZXF1ZXN0Q2FsbHMsXG5cdFx0XHRcdHB1bGxSZXF1ZXN0U2hhQ2FsbHM6IGgucHVsbFJlcXVlc3RTaGFDYWxscyxcblx0XHRcdFx0Z2l0aHViOiByZWFkU2Vzc2lvbkdpdEh1YlN0YXRlKGguc3RhdGVNYW5hZ2VyLmdldFNlc3Npb25TdGF0ZShTRVNTSU9OKT8uX21ldGEpLFxuXHRcdFx0fSwge1xuXHRcdFx0XHRwdWxsUmVxdWVzdENhbGxzOiBbJ3JlbW90ZS1uYW1lJ10sXG5cdFx0XHRcdHB1bGxSZXF1ZXN0U2hhQ2FsbHM6IFtdLFxuXHRcdFx0XHRnaXRodWI6IHsgb3duZXI6ICdtaWNyb3NvZnQnLCByZXBvOiAndnNjb2RlJywgcHVsbFJlcXVlc3RVcmxzOiBbJ2h0dHBzOi8vZ2l0aHViLmNvbS9taWNyb3NvZnQvdnNjb2RlL3B1bGwvMSddLCBwdWxsUmVxdWVzdEJyYW5jaE5hbWU6ICdsb2NhbC1uYW1lJyB9LFxuXHRcdFx0fSk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2xvb2tzIGEgZm9yayBwdWxsIHJlcXVlc3QgdXAgYnkgdGhlIGxvY2FsIGJyYW5jaCBuYW1lIHdoZW4gZ2l0IGluZmVycmVkIHRoZSBmb3JrIGhlYWQgb3duZXIgZnJvbSB0aGUgcHVzaCByZW1vdGUnLCBhc3luYyAoKSA9PiB7XG5cdFx0YXdhaXQgcnVuV2l0aEZha2VkVGltZXJzKHsgdXNlRmFrZVRpbWVyczogdHJ1ZSB9LCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCBnaXRTdGF0ZTogSVNlc3Npb25HaXRTdGF0ZSA9IHtcblx0XHRcdFx0YnJhbmNoTmFtZTogJ2ZlYXR1cmUvYWx0LWNsaWNrLWNsb3NlLW90aGVyLXRhYnMnLFxuXHRcdFx0XHRiYXNlQnJhbmNoTmFtZTogJ21haW4nLFxuXHRcdFx0XHRnaXRodWJIZWFkT3duZXI6ICdqYWRlZnInLFxuXHRcdFx0fTtcblx0XHRcdGNvbnN0IGNhbGxzOiBBcnJheTx7IGJyYW5jaDogc3RyaW5nOyBoZWFkT3duZXI6IHN0cmluZyB8IHVuZGVmaW5lZCB9PiA9IFtdO1xuXHRcdFx0Y29uc3QgaCA9IGNyZWF0ZUhhcm5lc3Moe1xuXHRcdFx0XHRvY3RvS2l0U2VydmljZToge1xuXHRcdFx0XHRcdGZpbmRQdWxsUmVxdWVzdEJ5SGVhZEJyYW5jaDogYXN5bmMgKF9vd25lcjogc3RyaW5nLCBfcmVwbzogc3RyaW5nLCBicmFuY2g6IHN0cmluZywgX3Rva2VuOiBzdHJpbmcsIF9zaWduYWw6IEFib3J0U2lnbmFsLCBoZWFkT3duZXI/OiBzdHJpbmcpID0+IHtcblx0XHRcdFx0XHRcdGNhbGxzLnB1c2goeyBicmFuY2gsIGhlYWRPd25lciB9KTtcblx0XHRcdFx0XHRcdHJldHVybiB7XG5cdFx0XHRcdFx0XHRcdHVybDogJ2h0dHBzOi8vZ2l0aHViLmNvbS9taWNyb3NvZnQvdnNjb2RlL3B1bGwvMzI4OTc1Jyxcblx0XHRcdFx0XHRcdFx0bnVtYmVyOiAzMjg5NzUsXG5cdFx0XHRcdFx0XHR9O1xuXHRcdFx0XHRcdH0sXG5cdFx0XHRcdH0gYXMgdW5rbm93biBhcyBJQWdlbnRIb3N0T2N0b0tpdFNlcnZpY2UsXG5cdFx0XHR9KTtcblx0XHRcdHNlZWRTZXNzaW9uKGguc3RhdGVNYW5hZ2VyLCB7XG5cdFx0XHRcdHdvcmtpbmdEaXJlY3Rvcnk6IFdPUktJTkdfRElSRUNUT1JZLFxuXHRcdFx0XHRnaXRTdGF0ZSxcblx0XHRcdFx0Z2l0SHViU3RhdGU6IHsgb3duZXI6ICdtaWNyb3NvZnQnLCByZXBvOiAndnNjb2RlJyB9LFxuXHRcdFx0fSk7XG5cdFx0XHRoLnNldEdpdFJlc3VsdChnaXRTdGF0ZSk7XG5cblx0XHRcdGF3YWl0IGguc2VydmljZS5hdHRhY2hTZXNzaW9uR2l0SHViUHVsbFJlcXVlc3QoU0VTU0lPTiwgVVJJLnBhcnNlKFdPUktJTkdfRElSRUNUT1JZKSk7XG5cblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0XHRwdWxsUmVxdWVzdENhbGxzOiBjYWxscyxcblx0XHRcdFx0cHVsbFJlcXVlc3RTaGFDYWxsczogaC5wdWxsUmVxdWVzdFNoYUNhbGxzLFxuXHRcdFx0XHRnaXRodWI6IHJlYWRTZXNzaW9uR2l0SHViU3RhdGUoaC5zdGF0ZU1hbmFnZXIuZ2V0U2Vzc2lvblN0YXRlKFNFU1NJT04pPy5fbWV0YSksXG5cdFx0XHR9LCB7XG5cdFx0XHRcdHB1bGxSZXF1ZXN0Q2FsbHM6IFt7IGJyYW5jaDogJ2ZlYXR1cmUvYWx0LWNsaWNrLWNsb3NlLW90aGVyLXRhYnMnLCBoZWFkT3duZXI6ICdqYWRlZnInIH1dLFxuXHRcdFx0XHRwdWxsUmVxdWVzdFNoYUNhbGxzOiBbXSxcblx0XHRcdFx0Z2l0aHViOiB7XG5cdFx0XHRcdFx0b3duZXI6ICdtaWNyb3NvZnQnLFxuXHRcdFx0XHRcdHJlcG86ICd2c2NvZGUnLFxuXHRcdFx0XHRcdHB1bGxSZXF1ZXN0VXJsczogWydodHRwczovL2dpdGh1Yi5jb20vbWljcm9zb2Z0L3ZzY29kZS9wdWxsLzMyODk3NSddLFxuXHRcdFx0XHRcdHB1bGxSZXF1ZXN0QnJhbmNoTmFtZTogJ2ZlYXR1cmUvYWx0LWNsaWNrLWNsb3NlLW90aGVyLXRhYnMnLFxuXHRcdFx0XHR9LFxuXHRcdFx0fSk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2ZhbGxzIGJhY2sgdG8gdGhlIGNvbW1pdCBhdCBIRUFEIHdoZW4gdGhlIGJyYW5jaCBuYW1lIG1hdGNoZXMgbm8gcHVsbCByZXF1ZXN0JywgYXN5bmMgKCkgPT4ge1xuXHRcdGF3YWl0IHJ1bldpdGhGYWtlZFRpbWVycyh7IHVzZUZha2VUaW1lcnM6IHRydWUgfSwgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Ly8gQSBicmFuY2ggY2hlY2tlZCBvdXQgZnJvbSBhIHB1bGwgcmVxdWVzdCBoZWFkOiBubyB1cHN0cmVhbSwgYW5kIGFcblx0XHRcdC8vIG5hbWUgdGhhdCBkb2VzIG5vdCBleGlzdCBvbiB0aGUgcmVtb3RlLlxuXHRcdFx0Y29uc3QgZ2l0U3RhdGU6IElTZXNzaW9uR2l0U3RhdGUgPSB7IGJyYW5jaE5hbWU6ICdsb2NhbC1vbmx5JywgYmFzZUJyYW5jaE5hbWU6ICdtYWluJyB9O1xuXHRcdFx0Y29uc3QgaCA9IGNyZWF0ZUhhcm5lc3MoKTtcblx0XHRcdHNlZWRTZXNzaW9uKGguc3RhdGVNYW5hZ2VyLCB7XG5cdFx0XHRcdHdvcmtpbmdEaXJlY3Rvcnk6IFdPUktJTkdfRElSRUNUT1JZLFxuXHRcdFx0XHRnaXRTdGF0ZSxcblx0XHRcdFx0Z2l0SHViU3RhdGU6IHsgb3duZXI6ICdtaWNyb3NvZnQnLCByZXBvOiAndnNjb2RlJyB9LFxuXHRcdFx0fSk7XG5cdFx0XHRoLnNldEdpdFJlc3VsdChnaXRTdGF0ZSk7XG5cdFx0XHRoLnNldEhlYWRTaGEoJzFjZTJjMjBkM2RjYjU5MzI3M2Y2MDRiMDc3MjQwNTQzZDQ5NGUyNzYnKTtcblx0XHRcdGguc2V0UHVsbFJlcXVlc3RGb3JTaGEoJzFjZTJjMjBkM2RjYjU5MzI3M2Y2MDRiMDc3MjQwNTQzZDQ5NGUyNzYnLCB7IHVybDogJ2h0dHBzOi8vZ2l0aHViLmNvbS9taWNyb3NvZnQvdnNjb2RlL3B1bGwvMicsIG51bWJlcjogMiB9KTtcblxuXHRcdFx0YXdhaXQgaC5zZXJ2aWNlLmF0dGFjaFNlc3Npb25HaXRIdWJQdWxsUmVxdWVzdChTRVNTSU9OLCBVUkkucGFyc2UoV09SS0lOR19ESVJFQ1RPUlkpKTtcblxuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRcdHB1bGxSZXF1ZXN0Q2FsbHM6IGgucHVsbFJlcXVlc3RDYWxscyxcblx0XHRcdFx0cHVsbFJlcXVlc3RTaGFDYWxsczogaC5wdWxsUmVxdWVzdFNoYUNhbGxzLFxuXHRcdFx0XHRnaXRodWI6IHJlYWRTZXNzaW9uR2l0SHViU3RhdGUoaC5zdGF0ZU1hbmFnZXIuZ2V0U2Vzc2lvblN0YXRlKFNFU1NJT04pPy5fbWV0YSksXG5cdFx0XHR9LCB7XG5cdFx0XHRcdHB1bGxSZXF1ZXN0Q2FsbHM6IFsnbG9jYWwtb25seSddLFxuXHRcdFx0XHRwdWxsUmVxdWVzdFNoYUNhbGxzOiBbJzFjZTJjMjBkM2RjYjU5MzI3M2Y2MDRiMDc3MjQwNTQzZDQ5NGUyNzYnXSxcblx0XHRcdFx0Z2l0aHViOiB7IG93bmVyOiAnbWljcm9zb2Z0JywgcmVwbzogJ3ZzY29kZScsIHB1bGxSZXF1ZXN0VXJsczogWydodHRwczovL2dpdGh1Yi5jb20vbWljcm9zb2Z0L3ZzY29kZS9wdWxsLzInXSwgcHVsbFJlcXVlc3RCcmFuY2hOYW1lOiAnbG9jYWwtb25seScgfSxcblx0XHRcdH0pO1xuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdpZ25vcmVzIGFuIHVwc3RyZWFtIGJyYW5jaCB0aGF0IGRvZXMgbm90IHJlc29sdmUgdG8gYSBHaXRIdWIgcmVtb3RlJywgYXN5bmMgKCkgPT4ge1xuXHRcdGF3YWl0IHJ1bldpdGhGYWtlZFRpbWVycyh7IHVzZUZha2VUaW1lcnM6IHRydWUgfSwgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgZ2l0U3RhdGU6IElTZXNzaW9uR2l0U3RhdGUgPSB7XG5cdFx0XHRcdGJyYW5jaE5hbWU6ICdsb2NhbC1uYW1lJyxcblx0XHRcdFx0YmFzZUJyYW5jaE5hbWU6ICdtYWluJyxcblx0XHRcdFx0dXBzdHJlYW1CcmFuY2hOYW1lOiAnZ2l0bGFiL3JlbW90ZS1uYW1lJyxcblx0XHRcdH07XG5cdFx0XHRjb25zdCBoID0gY3JlYXRlSGFybmVzcygpO1xuXHRcdFx0c2VlZFNlc3Npb24oaC5zdGF0ZU1hbmFnZXIsIHtcblx0XHRcdFx0d29ya2luZ0RpcmVjdG9yeTogV09SS0lOR19ESVJFQ1RPUlksXG5cdFx0XHRcdGdpdFN0YXRlLFxuXHRcdFx0XHRnaXRIdWJTdGF0ZTogeyBvd25lcjogJ21pY3Jvc29mdCcsIHJlcG86ICd2c2NvZGUnIH0sXG5cdFx0XHR9KTtcblx0XHRcdGguc2V0R2l0UmVzdWx0KGdpdFN0YXRlKTtcblxuXHRcdFx0YXdhaXQgaC5zZXJ2aWNlLmF0dGFjaFNlc3Npb25HaXRIdWJQdWxsUmVxdWVzdChTRVNTSU9OLCBVUkkucGFyc2UoV09SS0lOR19ESVJFQ1RPUlkpKTtcblxuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChoLnB1bGxSZXF1ZXN0Q2FsbHMsIFsnbG9jYWwtbmFtZSddKTtcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgna2VlcHMgYSBwcmUtZXhpc3RpbmcgZm9sZGVyLXNlc3Npb24gcHVsbCByZXF1ZXN0IG91dCBvZiB0aGUgcmVsYXRlZCBzZXQnLCBhc3luYyAoKSA9PiB7XG5cdFx0YXdhaXQgcnVuV2l0aEZha2VkVGltZXJzKHsgdXNlRmFrZVRpbWVyczogdHJ1ZSB9LCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCBnaXRTdGF0ZTogSVNlc3Npb25HaXRTdGF0ZSA9IHsgYnJhbmNoTmFtZTogJ2ZlYXR1cmUnLCBiYXNlQnJhbmNoTmFtZTogJ21haW4nIH07XG5cdFx0XHRjb25zdCBoID0gY3JlYXRlSGFybmVzcygpO1xuXHRcdFx0c2VlZFNlc3Npb24oaC5zdGF0ZU1hbmFnZXIsIHtcblx0XHRcdFx0d29ya2luZ0RpcmVjdG9yeTogV09SS0lOR19ESVJFQ1RPUlksXG5cdFx0XHRcdGdpdFN0YXRlLFxuXHRcdFx0XHRnaXRIdWJTdGF0ZTogeyBvd25lcjogJ21pY3Jvc29mdCcsIHJlcG86ICd2c2NvZGUnIH0sXG5cdFx0XHRcdGlzb2xhdGlvbjogJ2ZvbGRlcicsXG5cdFx0XHRcdGNyZWF0ZWRBdDogNjAwXzAwMCxcblx0XHRcdH0pO1xuXHRcdFx0aC5zZXRHaXRSZXN1bHQoZ2l0U3RhdGUpO1xuXHRcdFx0aC5zZXRQdWxsUmVxdWVzdCgnZmVhdHVyZScsIHtcblx0XHRcdFx0dXJsOiAnaHR0cHM6Ly9naXRodWIuY29tL21pY3Jvc29mdC92c2NvZGUvcHVsbC8xJyxcblx0XHRcdFx0bnVtYmVyOiAxLFxuXHRcdFx0XHRjcmVhdGVkQXQ6IDFfMDAwLFxuXHRcdFx0fSk7XG5cblx0XHRcdGF3YWl0IGguc2VydmljZS5hdHRhY2hTZXNzaW9uR2l0SHViUHVsbFJlcXVlc3QoU0VTU0lPTiwgVVJJLnBhcnNlKFdPUktJTkdfRElSRUNUT1JZKSk7XG5cblx0XHRcdGNvbnN0IGdpdGh1YiA9IHJlYWRTZXNzaW9uR2l0SHViU3RhdGUoaC5zdGF0ZU1hbmFnZXIuZ2V0U2Vzc2lvblN0YXRlKFNFU1NJT04pPy5fbWV0YSk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdFx0Z2l0aHViLFxuXHRcdFx0XHRyZWxhdGVkOiBbLi4uZ2V0U2Vzc2lvblJlbGF0ZWRQdWxsUmVxdWVzdFVybHMoZ2l0aHViKV0sXG5cdFx0XHRcdHBlcnNpc3RlZEdpdEh1YjogSlNPTi5wYXJzZSgoYXdhaXQgaC5kYi5nZXRNZXRhZGF0YShNRVRBX0dJVEhVQl9TVEFURSkpISksXG5cdFx0XHR9LCB7XG5cdFx0XHRcdGdpdGh1Yjoge1xuXHRcdFx0XHRcdG93bmVyOiAnbWljcm9zb2Z0Jyxcblx0XHRcdFx0XHRyZXBvOiAndnNjb2RlJyxcblx0XHRcdFx0XHRwdWxsUmVxdWVzdFVybHM6IFsnaHR0cHM6Ly9naXRodWIuY29tL21pY3Jvc29mdC92c2NvZGUvcHVsbC8xJ10sXG5cdFx0XHRcdFx0aW5pdGlhbFB1bGxSZXF1ZXN0VXJsczogWydodHRwczovL2dpdGh1Yi5jb20vbWljcm9zb2Z0L3ZzY29kZS9wdWxsLzEnXSxcblx0XHRcdFx0XHRwdWxsUmVxdWVzdEJyYW5jaE5hbWU6ICdmZWF0dXJlJyxcblx0XHRcdFx0fSxcblx0XHRcdFx0cmVsYXRlZDogW10sXG5cdFx0XHRcdHBlcnNpc3RlZEdpdEh1Yjoge1xuXHRcdFx0XHRcdG93bmVyOiAnbWljcm9zb2Z0Jyxcblx0XHRcdFx0XHRyZXBvOiAndnNjb2RlJyxcblx0XHRcdFx0XHRwdWxsUmVxdWVzdFVybHM6IFsnaHR0cHM6Ly9naXRodWIuY29tL21pY3Jvc29mdC92c2NvZGUvcHVsbC8xJ10sXG5cdFx0XHRcdFx0aW5pdGlhbFB1bGxSZXF1ZXN0VXJsczogWydodHRwczovL2dpdGh1Yi5jb20vbWljcm9zb2Z0L3ZzY29kZS9wdWxsLzEnXSxcblx0XHRcdFx0XHRwdWxsUmVxdWVzdEJyYW5jaE5hbWU6ICdmZWF0dXJlJyxcblx0XHRcdFx0fSxcblx0XHRcdH0pO1xuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCd1c2VzIGZvbGRlciBpc29sYXRpb24gdGhhdCByZXNvbHZlcyB3aGlsZSBhIHB1bGwgcmVxdWVzdCBsb29rdXAgaXMgaW4gZmxpZ2h0JywgYXN5bmMgKCkgPT4ge1xuXHRcdGF3YWl0IHJ1bldpdGhGYWtlZFRpbWVycyh7IHVzZUZha2VUaW1lcnM6IHRydWUgfSwgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgcHVsbFJlcXVlc3RVcmwgPSAnaHR0cHM6Ly9naXRodWIuY29tL21pY3Jvc29mdC92c2NvZGUvcHVsbC8xJztcblx0XHRcdGNvbnN0IGdpdFN0YXRlOiBJU2Vzc2lvbkdpdFN0YXRlID0geyBicmFuY2hOYW1lOiAnZmVhdHVyZScsIGJhc2VCcmFuY2hOYW1lOiAnbWFpbicgfTtcblx0XHRcdGNvbnN0IGggPSBjcmVhdGVIYXJuZXNzKCk7XG5cdFx0XHRzZWVkU2Vzc2lvbihoLnN0YXRlTWFuYWdlciwge1xuXHRcdFx0XHR3b3JraW5nRGlyZWN0b3J5OiBXT1JLSU5HX0RJUkVDVE9SWSxcblx0XHRcdFx0Z2l0U3RhdGUsXG5cdFx0XHRcdGdpdEh1YlN0YXRlOiB7IG93bmVyOiAnbWljcm9zb2Z0JywgcmVwbzogJ3ZzY29kZScgfSxcblx0XHRcdFx0Y3JlYXRlZEF0OiA2MDBfMDAwLFxuXHRcdFx0fSk7XG5cdFx0XHRoLnNldEdpdFJlc3VsdChnaXRTdGF0ZSk7XG5cdFx0XHRoLnNldFB1bGxSZXF1ZXN0KCdmZWF0dXJlJywgeyB1cmw6IHB1bGxSZXF1ZXN0VXJsLCBudW1iZXI6IDEsIGNyZWF0ZWRBdDogMV8wMDAgfSk7XG5cdFx0XHRoLnNldE9uUHVsbFJlcXVlc3RMb29rdXAoYXN5bmMgKCkgPT4ge1xuXHRcdFx0XHRoLnN0YXRlTWFuYWdlci5zZXRTZXNzaW9uQ29uZmlnKFNFU1NJT04sIHtcblx0XHRcdFx0XHRzY2hlbWE6IHsgdHlwZTogJ29iamVjdCcsIHByb3BlcnRpZXM6IHt9IH0sXG5cdFx0XHRcdFx0dmFsdWVzOiB7IFtTZXNzaW9uQ29uZmlnS2V5Lklzb2xhdGlvbl06ICdmb2xkZXInIH0sXG5cdFx0XHRcdH0pO1xuXHRcdFx0fSk7XG5cblx0XHRcdGF3YWl0IGguc2VydmljZS5hdHRhY2hTZXNzaW9uR2l0SHViUHVsbFJlcXVlc3QoU0VTU0lPTiwgVVJJLnBhcnNlKFdPUktJTkdfRElSRUNUT1JZKSk7XG5cblx0XHRcdGNvbnN0IGdpdGh1YiA9IHJlYWRTZXNzaW9uR2l0SHViU3RhdGUoaC5zdGF0ZU1hbmFnZXIuZ2V0U2Vzc2lvblN0YXRlKFNFU1NJT04pPy5fbWV0YSk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdFx0Z2l0aHViLFxuXHRcdFx0XHRyZWxhdGVkOiBbLi4uZ2V0U2Vzc2lvblJlbGF0ZWRQdWxsUmVxdWVzdFVybHMoZ2l0aHViKV0sXG5cdFx0XHR9LCB7XG5cdFx0XHRcdGdpdGh1Yjoge1xuXHRcdFx0XHRcdG93bmVyOiAnbWljcm9zb2Z0Jyxcblx0XHRcdFx0XHRyZXBvOiAndnNjb2RlJyxcblx0XHRcdFx0XHRwdWxsUmVxdWVzdFVybHM6IFtwdWxsUmVxdWVzdFVybF0sXG5cdFx0XHRcdFx0aW5pdGlhbFB1bGxSZXF1ZXN0VXJsczogW3B1bGxSZXF1ZXN0VXJsXSxcblx0XHRcdFx0XHRwdWxsUmVxdWVzdEJyYW5jaE5hbWU6ICdmZWF0dXJlJyxcblx0XHRcdFx0fSxcblx0XHRcdFx0cmVsYXRlZDogW10sXG5cdFx0XHR9KTtcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgncmVsYXRlcyBhIHB1bGwgcmVxdWVzdCBjcmVhdGVkIGFmdGVyIGEgZm9sZGVyIHNlc3Npb24gYmVnYW4nLCBhc3luYyAoKSA9PiB7XG5cdFx0YXdhaXQgcnVuV2l0aEZha2VkVGltZXJzKHsgdXNlRmFrZVRpbWVyczogdHJ1ZSB9LCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCBnaXRTdGF0ZTogSVNlc3Npb25HaXRTdGF0ZSA9IHsgYnJhbmNoTmFtZTogJ2ZlYXR1cmUnLCBiYXNlQnJhbmNoTmFtZTogJ21haW4nIH07XG5cdFx0XHRjb25zdCBoID0gY3JlYXRlSGFybmVzcygpO1xuXHRcdFx0c2VlZFNlc3Npb24oaC5zdGF0ZU1hbmFnZXIsIHtcblx0XHRcdFx0d29ya2luZ0RpcmVjdG9yeTogV09SS0lOR19ESVJFQ1RPUlksXG5cdFx0XHRcdGdpdFN0YXRlLFxuXHRcdFx0XHRnaXRIdWJTdGF0ZTogeyBvd25lcjogJ21pY3Jvc29mdCcsIHJlcG86ICd2c2NvZGUnIH0sXG5cdFx0XHRcdGlzb2xhdGlvbjogJ2ZvbGRlcicsXG5cdFx0XHRcdGNyZWF0ZWRBdDogNjAwXzAwMCxcblx0XHRcdH0pO1xuXHRcdFx0aC5zZXRHaXRSZXN1bHQoZ2l0U3RhdGUpO1xuXG5cdFx0XHRhd2FpdCBoLnNlcnZpY2UuYXR0YWNoU2Vzc2lvbkdpdEh1YlB1bGxSZXF1ZXN0KFNFU1NJT04sIFVSSS5wYXJzZShXT1JLSU5HX0RJUkVDVE9SWSkpO1xuXHRcdFx0aC5zZXRQdWxsUmVxdWVzdCgnZmVhdHVyZScsIHtcblx0XHRcdFx0dXJsOiAnaHR0cHM6Ly9naXRodWIuY29tL21pY3Jvc29mdC92c2NvZGUvcHVsbC8yJyxcblx0XHRcdFx0bnVtYmVyOiAyLFxuXHRcdFx0XHRjcmVhdGVkQXQ6IDYwMF81MDAsXG5cdFx0XHR9KTtcblx0XHRcdGF3YWl0IGguc2VydmljZS5hdHRhY2hTZXNzaW9uR2l0SHViUHVsbFJlcXVlc3QoU0VTU0lPTiwgVVJJLnBhcnNlKFdPUktJTkdfRElSRUNUT1JZKSk7XG5cblx0XHRcdGNvbnN0IGdpdGh1YiA9IHJlYWRTZXNzaW9uR2l0SHViU3RhdGUoaC5zdGF0ZU1hbmFnZXIuZ2V0U2Vzc2lvblN0YXRlKFNFU1NJT04pPy5fbWV0YSk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdFx0Z2l0aHViLFxuXHRcdFx0XHRyZWxhdGVkOiBbLi4uZ2V0U2Vzc2lvblJlbGF0ZWRQdWxsUmVxdWVzdFVybHMoZ2l0aHViKV0sXG5cdFx0XHR9LCB7XG5cdFx0XHRcdGdpdGh1Yjoge1xuXHRcdFx0XHRcdG93bmVyOiAnbWljcm9zb2Z0Jyxcblx0XHRcdFx0XHRyZXBvOiAndnNjb2RlJyxcblx0XHRcdFx0XHRwdWxsUmVxdWVzdFVybHM6IFsnaHR0cHM6Ly9naXRodWIuY29tL21pY3Jvc29mdC92c2NvZGUvcHVsbC8yJ10sXG5cdFx0XHRcdFx0aW5pdGlhbFB1bGxSZXF1ZXN0VXJsczogW10sXG5cdFx0XHRcdFx0cHVsbFJlcXVlc3RCcmFuY2hOYW1lOiAnZmVhdHVyZScsXG5cdFx0XHRcdH0sXG5cdFx0XHRcdHJlbGF0ZWQ6IFsnaHR0cHM6Ly9naXRodWIuY29tL21pY3Jvc29mdC92c2NvZGUvcHVsbC8yJ10sXG5cdFx0XHR9KTtcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgna2VlcHMgd29ya3RyZWUgcHVsbCByZXF1ZXN0IGJlaGF2aW9yIHVuY2hhbmdlZCcsIGFzeW5jICgpID0+IHtcblx0XHRhd2FpdCBydW5XaXRoRmFrZWRUaW1lcnMoeyB1c2VGYWtlVGltZXJzOiB0cnVlIH0sIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IGdpdFN0YXRlOiBJU2Vzc2lvbkdpdFN0YXRlID0geyBicmFuY2hOYW1lOiAnZmVhdHVyZScsIGJhc2VCcmFuY2hOYW1lOiAnbWFpbicgfTtcblx0XHRcdGNvbnN0IGggPSBjcmVhdGVIYXJuZXNzKCk7XG5cdFx0XHRzZWVkU2Vzc2lvbihoLnN0YXRlTWFuYWdlciwge1xuXHRcdFx0XHR3b3JraW5nRGlyZWN0b3J5OiBXT1JLSU5HX0RJUkVDVE9SWSxcblx0XHRcdFx0Z2l0U3RhdGUsXG5cdFx0XHRcdGdpdEh1YlN0YXRlOiB7IG93bmVyOiAnbWljcm9zb2Z0JywgcmVwbzogJ3ZzY29kZScgfSxcblx0XHRcdFx0aXNvbGF0aW9uOiAnd29ya3RyZWUnLFxuXHRcdFx0XHRjcmVhdGVkQXQ6IDJfMDAwLFxuXHRcdFx0fSk7XG5cdFx0XHRoLnNldEdpdFJlc3VsdChnaXRTdGF0ZSk7XG5cdFx0XHRoLnNldFB1bGxSZXF1ZXN0KCdmZWF0dXJlJywge1xuXHRcdFx0XHR1cmw6ICdodHRwczovL2dpdGh1Yi5jb20vbWljcm9zb2Z0L3ZzY29kZS9wdWxsLzEnLFxuXHRcdFx0XHRudW1iZXI6IDEsXG5cdFx0XHRcdGNyZWF0ZWRBdDogMV8wMDAsXG5cdFx0XHR9KTtcblxuXHRcdFx0YXdhaXQgaC5zZXJ2aWNlLmF0dGFjaFNlc3Npb25HaXRIdWJQdWxsUmVxdWVzdChTRVNTSU9OLCBVUkkucGFyc2UoV09SS0lOR19ESVJFQ1RPUlkpKTtcblxuXHRcdFx0Y29uc3QgZ2l0aHViID0gcmVhZFNlc3Npb25HaXRIdWJTdGF0ZShoLnN0YXRlTWFuYWdlci5nZXRTZXNzaW9uU3RhdGUoU0VTU0lPTik/Ll9tZXRhKTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0XHRnaXRodWIsXG5cdFx0XHRcdHJlbGF0ZWQ6IFsuLi5nZXRTZXNzaW9uUmVsYXRlZFB1bGxSZXF1ZXN0VXJscyhnaXRodWIpXSxcblx0XHRcdH0sIHtcblx0XHRcdFx0Z2l0aHViOiB7XG5cdFx0XHRcdFx0b3duZXI6ICdtaWNyb3NvZnQnLFxuXHRcdFx0XHRcdHJlcG86ICd2c2NvZGUnLFxuXHRcdFx0XHRcdHB1bGxSZXF1ZXN0VXJsczogWydodHRwczovL2dpdGh1Yi5jb20vbWljcm9zb2Z0L3ZzY29kZS9wdWxsLzEnXSxcblx0XHRcdFx0XHRwdWxsUmVxdWVzdEJyYW5jaE5hbWU6ICdmZWF0dXJlJyxcblx0XHRcdFx0fSxcblx0XHRcdFx0cmVsYXRlZDogWydodHRwczovL2dpdGh1Yi5jb20vbWljcm9zb2Z0L3ZzY29kZS9wdWxsLzEnXSxcblx0XHRcdH0pO1xuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdwcm9tb3RlcyBhIHJlZmVyZW5jZWQgYmFzZWxpbmUgcHVsbCByZXF1ZXN0JywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IGggPSBjcmVhdGVIYXJuZXNzKCk7XG5cdFx0Y29uc3QgcHVsbFJlcXVlc3RVcmwgPSAnaHR0cHM6Ly9naXRodWIuY29tL21pY3Jvc29mdC92c2NvZGUvcHVsbC8xJztcblx0XHRzZWVkU2Vzc2lvbihoLnN0YXRlTWFuYWdlciwge1xuXHRcdFx0d29ya2luZ0RpcmVjdG9yeTogV09SS0lOR19ESVJFQ1RPUlksXG5cdFx0XHRnaXRIdWJTdGF0ZToge1xuXHRcdFx0XHRvd25lcjogJ21pY3Jvc29mdCcsXG5cdFx0XHRcdHJlcG86ICd2c2NvZGUnLFxuXHRcdFx0XHRwdWxsUmVxdWVzdFVybHM6IFtwdWxsUmVxdWVzdFVybF0sXG5cdFx0XHRcdGluaXRpYWxQdWxsUmVxdWVzdFVybHM6IFtwdWxsUmVxdWVzdFVybF0sXG5cdFx0XHRcdHB1bGxSZXF1ZXN0QnJhbmNoTmFtZTogJ2ZlYXR1cmUnLFxuXHRcdFx0fSxcblx0XHRcdGlzb2xhdGlvbjogJ2ZvbGRlcicsXG5cdFx0fSk7XG5cblx0XHRhd2FpdCBoLnNlcnZpY2UuYXR0YWNoU2Vzc2lvbkdpdEh1YlJlZmVyZW5jZXMoU0VTU0lPTiwgJ1BsZWFzZSB1bmJsb2NrIFBSICMxLiBJZ25vcmUgaHR0cHM6Ly9naXRodWIuY29tL29jdG8vcmVwby9wdWxsLzkuJyk7XG5cblx0XHRjb25zdCBnaXRodWIgPSByZWFkU2Vzc2lvbkdpdEh1YlN0YXRlKGguc3RhdGVNYW5hZ2VyLmdldFNlc3Npb25TdGF0ZShTRVNTSU9OKT8uX21ldGEpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0Z2l0aHViLFxuXHRcdFx0cmVsYXRlZDogWy4uLmdldFNlc3Npb25SZWxhdGVkUHVsbFJlcXVlc3RVcmxzKGdpdGh1YildLFxuXHRcdH0sIHtcblx0XHRcdGdpdGh1Yjoge1xuXHRcdFx0XHRvd25lcjogJ21pY3Jvc29mdCcsXG5cdFx0XHRcdHJlcG86ICd2c2NvZGUnLFxuXHRcdFx0XHRwdWxsUmVxdWVzdFVybHM6IFtwdWxsUmVxdWVzdFVybF0sXG5cdFx0XHRcdGluaXRpYWxQdWxsUmVxdWVzdFVybHM6IFtwdWxsUmVxdWVzdFVybF0sXG5cdFx0XHRcdGFzc29jaWF0ZWRQdWxsUmVxdWVzdFVybHM6IFtwdWxsUmVxdWVzdFVybF0sXG5cdFx0XHRcdHB1bGxSZXF1ZXN0QnJhbmNoTmFtZTogJ2ZlYXR1cmUnLFxuXHRcdFx0fSxcblx0XHRcdHJlbGF0ZWQ6IFtwdWxsUmVxdWVzdFVybF0sXG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3Byb21vdGVzIGEgcmVmZXJlbmNlZCBHaXRIdWIgRW50ZXJwcmlzZSBiYXNlbGluZSBwdWxsIHJlcXVlc3QnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgaCA9IGNyZWF0ZUhhcm5lc3MoeyBlbnRlcnByaXNlVXJpOiAnaHR0cHM6Ly9naGUuZXhhbXBsZS5jb20nIH0pO1xuXHRcdGNvbnN0IHB1bGxSZXF1ZXN0VXJsID0gJ2h0dHBzOi8vZ2hlLmV4YW1wbGUuY29tL21pY3Jvc29mdC92c2NvZGUvcHVsbC8xJztcblx0XHRzZWVkU2Vzc2lvbihoLnN0YXRlTWFuYWdlciwge1xuXHRcdFx0d29ya2luZ0RpcmVjdG9yeTogV09SS0lOR19ESVJFQ1RPUlksXG5cdFx0XHRnaXRIdWJTdGF0ZToge1xuXHRcdFx0XHRvd25lcjogJ21pY3Jvc29mdCcsXG5cdFx0XHRcdHJlcG86ICd2c2NvZGUnLFxuXHRcdFx0XHRwdWxsUmVxdWVzdFVybHM6IFtwdWxsUmVxdWVzdFVybF0sXG5cdFx0XHRcdGluaXRpYWxQdWxsUmVxdWVzdFVybHM6IFtwdWxsUmVxdWVzdFVybF0sXG5cdFx0XHRcdHB1bGxSZXF1ZXN0QnJhbmNoTmFtZTogJ2ZlYXR1cmUnLFxuXHRcdFx0fSxcblx0XHRcdGlzb2xhdGlvbjogJ2ZvbGRlcicsXG5cdFx0fSk7XG5cblx0XHRhd2FpdCBoLnNlcnZpY2UuYXR0YWNoU2Vzc2lvbkdpdEh1YlJlZmVyZW5jZXMoU0VTU0lPTiwgJ1BsZWFzZSB1bmJsb2NrIFBSICMxLicpO1xuXG5cdFx0Y29uc3QgZ2l0aHViID0gcmVhZFNlc3Npb25HaXRIdWJTdGF0ZShoLnN0YXRlTWFuYWdlci5nZXRTZXNzaW9uU3RhdGUoU0VTU0lPTik/Ll9tZXRhKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdGdpdGh1Yixcblx0XHRcdHJlbGF0ZWQ6IFsuLi5nZXRTZXNzaW9uUmVsYXRlZFB1bGxSZXF1ZXN0VXJscyhnaXRodWIpXSxcblx0XHR9LCB7XG5cdFx0XHRnaXRodWI6IHtcblx0XHRcdFx0b3duZXI6ICdtaWNyb3NvZnQnLFxuXHRcdFx0XHRyZXBvOiAndnNjb2RlJyxcblx0XHRcdFx0cHVsbFJlcXVlc3RVcmxzOiBbcHVsbFJlcXVlc3RVcmxdLFxuXHRcdFx0XHRpbml0aWFsUHVsbFJlcXVlc3RVcmxzOiBbcHVsbFJlcXVlc3RVcmxdLFxuXHRcdFx0XHRhc3NvY2lhdGVkUHVsbFJlcXVlc3RVcmxzOiBbcHVsbFJlcXVlc3RVcmxdLFxuXHRcdFx0XHRwdWxsUmVxdWVzdEJyYW5jaE5hbWU6ICdmZWF0dXJlJyxcblx0XHRcdH0sXG5cdFx0XHRyZWxhdGVkOiBbcHVsbFJlcXVlc3RVcmxdLFxuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdyZWNvcmRzIGFuIHVucmVsYXRlZCBQUiBtZW50aW9uIHdpdGhvdXQgY2hhbmdpbmcgY2hlY2tvdXQgUFIgc3RhdGUnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgaCA9IGNyZWF0ZUhhcm5lc3MoKTtcblx0XHRzZWVkU2Vzc2lvbihoLnN0YXRlTWFuYWdlciwge1xuXHRcdFx0d29ya2luZ0RpcmVjdG9yeTogV09SS0lOR19ESVJFQ1RPUlksXG5cdFx0XHRnaXRIdWJTdGF0ZTogeyBvd25lcjogJ21pY3Jvc29mdCcsIHJlcG86ICd2c2NvZGUnLCBpbml0aWFsUHVsbFJlcXVlc3RVcmxzOiBbXSB9LFxuXHRcdFx0aXNvbGF0aW9uOiAnZm9sZGVyJyxcblx0XHR9KTtcblxuXHRcdGF3YWl0IGguc2VydmljZS5hdHRhY2hTZXNzaW9uR2l0SHViUmVmZXJlbmNlcyhTRVNTSU9OLCAnQ29tcGFyZSB0aGlzIHdpdGggUFIgIzk5LicpO1xuXG5cdFx0Y29uc3QgZ2l0aHViID0gcmVhZFNlc3Npb25HaXRIdWJTdGF0ZShoLnN0YXRlTWFuYWdlci5nZXRTZXNzaW9uU3RhdGUoU0VTU0lPTik/Ll9tZXRhKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdGdpdGh1Yixcblx0XHRcdHJlbGF0ZWQ6IFsuLi5nZXRTZXNzaW9uUmVsYXRlZFB1bGxSZXF1ZXN0VXJscyhnaXRodWIpXSxcblx0XHRcdGhhc0NoZWNrb3V0UHVsbFJlcXVlc3Q6IGhhc1Nlc3Npb25QdWxsUmVxdWVzdEZvckJyYW5jaChnaXRodWIsICdmZWF0dXJlJyksXG5cdFx0fSwge1xuXHRcdFx0Z2l0aHViOiB7XG5cdFx0XHRcdG93bmVyOiAnbWljcm9zb2Z0Jyxcblx0XHRcdFx0cmVwbzogJ3ZzY29kZScsXG5cdFx0XHRcdGluaXRpYWxQdWxsUmVxdWVzdFVybHM6IFtdLFxuXHRcdFx0XHRhc3NvY2lhdGVkUHVsbFJlcXVlc3RVcmxzOiBbJ2h0dHBzOi8vZ2l0aHViLmNvbS9taWNyb3NvZnQvdnNjb2RlL3B1bGwvOTknXSxcblx0XHRcdH0sXG5cdFx0XHRyZWxhdGVkOiBbXSxcblx0XHRcdGhhc0NoZWNrb3V0UHVsbFJlcXVlc3Q6IGZhbHNlLFxuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdyZXRhaW5zIGEgZnVsbCBQUiBVUkwgbWVudGlvbmVkIGJlZm9yZSByZXBvc2l0b3J5IGRpc2NvdmVyeScsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBoID0gY3JlYXRlSGFybmVzcygpO1xuXHRcdGNvbnN0IHB1bGxSZXF1ZXN0VXJsID0gJ2h0dHBzOi8vZ2l0aHViLmNvbS9taWNyb3NvZnQvdnNjb2RlL3B1bGwvMSc7XG5cdFx0c2VlZFNlc3Npb24oaC5zdGF0ZU1hbmFnZXIsIHsgd29ya2luZ0RpcmVjdG9yeTogV09SS0lOR19ESVJFQ1RPUlksIGlzb2xhdGlvbjogJ2ZvbGRlcicgfSk7XG5cblx0XHRhd2FpdCBoLnNlcnZpY2UuYXR0YWNoU2Vzc2lvbkdpdEh1YlJlZmVyZW5jZXMoU0VTU0lPTiwgYFBsZWFzZSB1bmJsb2NrICR7cHVsbFJlcXVlc3RVcmx9LmApO1xuXHRcdGF3YWl0IGguc2VydmljZS5zZXRTZXNzaW9uR2l0SHViU3RhdGUoU0VTU0lPTiwge1xuXHRcdFx0b3duZXI6ICdtaWNyb3NvZnQnLFxuXHRcdFx0cmVwbzogJ3ZzY29kZScsXG5cdFx0XHRwdWxsUmVxdWVzdFVybHM6IFtwdWxsUmVxdWVzdFVybF0sXG5cdFx0XHRpbml0aWFsUHVsbFJlcXVlc3RVcmxzOiBbcHVsbFJlcXVlc3RVcmxdLFxuXHRcdH0pO1xuXG5cdFx0Y29uc3QgZ2l0aHViID0gcmVhZFNlc3Npb25HaXRIdWJTdGF0ZShoLnN0YXRlTWFuYWdlci5nZXRTZXNzaW9uU3RhdGUoU0VTU0lPTik/Ll9tZXRhKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdGdpdGh1Yixcblx0XHRcdHJlbGF0ZWQ6IFsuLi5nZXRTZXNzaW9uUmVsYXRlZFB1bGxSZXF1ZXN0VXJscyhnaXRodWIpXSxcblx0XHR9LCB7XG5cdFx0XHRnaXRodWI6IHtcblx0XHRcdFx0b3duZXI6ICdtaWNyb3NvZnQnLFxuXHRcdFx0XHRyZXBvOiAndnNjb2RlJyxcblx0XHRcdFx0cHVsbFJlcXVlc3RVcmxzOiBbcHVsbFJlcXVlc3RVcmxdLFxuXHRcdFx0XHRpbml0aWFsUHVsbFJlcXVlc3RVcmxzOiBbcHVsbFJlcXVlc3RVcmxdLFxuXHRcdFx0XHRhc3NvY2lhdGVkUHVsbFJlcXVlc3RVcmxzOiBbcHVsbFJlcXVlc3RVcmxdLFxuXHRcdFx0fSxcblx0XHRcdHJlbGF0ZWQ6IFtwdWxsUmVxdWVzdFVybF0sXG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3ByZXNlcnZlcyBhbiBleHBsaWNpdCBQUiByZWZlcmVuY2Ugd2hpbGUgaXRzIGJhc2VsaW5lIGxvb2t1cCBpcyBpbiBmbGlnaHQnLCBhc3luYyAoKSA9PiB7XG5cdFx0YXdhaXQgcnVuV2l0aEZha2VkVGltZXJzKHsgdXNlRmFrZVRpbWVyczogdHJ1ZSB9LCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCBwdWxsUmVxdWVzdFVybCA9ICdodHRwczovL2dpdGh1Yi5jb20vbWljcm9zb2Z0L3ZzY29kZS9wdWxsLzEnO1xuXHRcdFx0Y29uc3QgZ2l0U3RhdGU6IElTZXNzaW9uR2l0U3RhdGUgPSB7IGJyYW5jaE5hbWU6ICdmZWF0dXJlJywgYmFzZUJyYW5jaE5hbWU6ICdtYWluJyB9O1xuXHRcdFx0Y29uc3QgaCA9IGNyZWF0ZUhhcm5lc3MoKTtcblx0XHRcdHNlZWRTZXNzaW9uKGguc3RhdGVNYW5hZ2VyLCB7XG5cdFx0XHRcdHdvcmtpbmdEaXJlY3Rvcnk6IFdPUktJTkdfRElSRUNUT1JZLFxuXHRcdFx0XHRnaXRTdGF0ZSxcblx0XHRcdFx0Z2l0SHViU3RhdGU6IHsgb3duZXI6ICdtaWNyb3NvZnQnLCByZXBvOiAndnNjb2RlJyB9LFxuXHRcdFx0XHRpc29sYXRpb246ICdmb2xkZXInLFxuXHRcdFx0XHRjcmVhdGVkQXQ6IDYwMF8wMDAsXG5cdFx0XHR9KTtcblx0XHRcdGguc2V0R2l0UmVzdWx0KGdpdFN0YXRlKTtcblx0XHRcdGguc2V0UHVsbFJlcXVlc3QoJ2ZlYXR1cmUnLCB7IHVybDogcHVsbFJlcXVlc3RVcmwsIG51bWJlcjogMSwgY3JlYXRlZEF0OiAxXzAwMCB9KTtcblx0XHRcdGguc2V0T25QdWxsUmVxdWVzdExvb2t1cChhc3luYyAoKSA9PiB7XG5cdFx0XHRcdGF3YWl0IGguc2VydmljZS5hdHRhY2hTZXNzaW9uR2l0SHViUmVmZXJlbmNlcyhTRVNTSU9OLCAnUGxlYXNlIHVuYmxvY2sgUFIgIzEuJyk7XG5cdFx0XHR9KTtcblxuXHRcdFx0YXdhaXQgaC5zZXJ2aWNlLmF0dGFjaFNlc3Npb25HaXRIdWJQdWxsUmVxdWVzdChTRVNTSU9OLCBVUkkucGFyc2UoV09SS0lOR19ESVJFQ1RPUlkpKTtcblxuXHRcdFx0Y29uc3QgZ2l0aHViID0gcmVhZFNlc3Npb25HaXRIdWJTdGF0ZShoLnN0YXRlTWFuYWdlci5nZXRTZXNzaW9uU3RhdGUoU0VTU0lPTik/Ll9tZXRhKTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0XHRnaXRodWIsXG5cdFx0XHRcdHJlbGF0ZWQ6IFsuLi5nZXRTZXNzaW9uUmVsYXRlZFB1bGxSZXF1ZXN0VXJscyhnaXRodWIpXSxcblx0XHRcdH0sIHtcblx0XHRcdFx0Z2l0aHViOiB7XG5cdFx0XHRcdFx0b3duZXI6ICdtaWNyb3NvZnQnLFxuXHRcdFx0XHRcdHJlcG86ICd2c2NvZGUnLFxuXHRcdFx0XHRcdHB1bGxSZXF1ZXN0VXJsczogW3B1bGxSZXF1ZXN0VXJsXSxcblx0XHRcdFx0XHRpbml0aWFsUHVsbFJlcXVlc3RVcmxzOiBbcHVsbFJlcXVlc3RVcmxdLFxuXHRcdFx0XHRcdGFzc29jaWF0ZWRQdWxsUmVxdWVzdFVybHM6IFtwdWxsUmVxdWVzdFVybF0sXG5cdFx0XHRcdFx0cHVsbFJlcXVlc3RCcmFuY2hOYW1lOiAnZmVhdHVyZScsXG5cdFx0XHRcdH0sXG5cdFx0XHRcdHJlbGF0ZWQ6IFtwdWxsUmVxdWVzdFVybF0sXG5cdFx0XHR9KTtcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgncm91bmQtdHJpcHMgYW4gZW1wdHkgZm9sZGVyLXNlc3Npb24gYmFzZWxpbmUgdGhyb3VnaCBwZXJzaXN0ZWQgbWV0YWRhdGEnLCAoKSA9PiB7XG5cdFx0Y29uc3QgcGVyc2lzdGVkID0gSlNPTi5wYXJzZShKU09OLnN0cmluZ2lmeSh7IGluaXRpYWxQdWxsUmVxdWVzdFVybHM6IFtdIH0pKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocmVhZFNlc3Npb25HaXRIdWJTdGF0ZSh7IFtTRVNTSU9OX01FVEFfR0lUSFVCX0tFWV06IHBlcnNpc3RlZCB9KSwge1xuXHRcdFx0aW5pdGlhbFB1bGxSZXF1ZXN0VXJsczogW10sXG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2FjY3VtdWxhdGVzIHRoZSBHaXRIdWIgaXNzdWVzIHJlZmVyZW5jZWQgYWNyb3NzIHVzZXIgbWVzc2FnZXMnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgaCA9IGNyZWF0ZUhhcm5lc3MoKTtcblx0XHRzZWVkU2Vzc2lvbihoLnN0YXRlTWFuYWdlciwgeyB3b3JraW5nRGlyZWN0b3J5OiBXT1JLSU5HX0RJUkVDVE9SWSB9KTtcblxuXHRcdGF3YWl0IGguc2VydmljZS5hdHRhY2hTZXNzaW9uR2l0SHViUmVmZXJlbmNlcyhTRVNTSU9OLCAnRml4IGh0dHBzOi8vZ2l0aHViLmNvbS9taWNyb3NvZnQvdnNjb2RlL2lzc3Vlcy8xIHBsZWFzZScpO1xuXHRcdGF3YWl0IGguc2VydmljZS5hdHRhY2hTZXNzaW9uR2l0SHViUmVmZXJlbmNlcyhTRVNTSU9OLCAnQWxzbyBtaWNyb3NvZnQvdnNjb2RlIzEgYW5kIG9jdG8vcmVwbyMyLCBidXQgbm90ICMzJyk7XG5cdFx0YXdhaXQgaC5zZXJ2aWNlLmF0dGFjaFNlc3Npb25HaXRIdWJSZWZlcmVuY2VzKFNFU1NJT04sICdOb3RoaW5nIHRvIHNlZSBoZXJlJyk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdGdpdGh1YjogcmVhZFNlc3Npb25HaXRIdWJTdGF0ZShoLnN0YXRlTWFuYWdlci5nZXRTZXNzaW9uU3RhdGUoU0VTU0lPTik/Ll9tZXRhKSxcblx0XHRcdHBlcnNpc3RlZEdpdEh1YjogYXdhaXQgaC5kYi5nZXRNZXRhZGF0YShNRVRBX0dJVEhVQl9TVEFURSksXG5cdFx0fSwge1xuXHRcdFx0Z2l0aHViOiB7XG5cdFx0XHRcdGlzc3VlVXJsczogW1xuXHRcdFx0XHRcdCdodHRwczovL2dpdGh1Yi5jb20vbWljcm9zb2Z0L3ZzY29kZS9pc3N1ZXMvMScsXG5cdFx0XHRcdFx0J2h0dHBzOi8vZ2l0aHViLmNvbS9vY3RvL3JlcG8vaXNzdWVzLzInLFxuXHRcdFx0XHRdXG5cdFx0XHR9LFxuXHRcdFx0cGVyc2lzdGVkR2l0SHViOiBKU09OLnN0cmluZ2lmeSh7XG5cdFx0XHRcdGlzc3VlVXJsczogW1xuXHRcdFx0XHRcdCdodHRwczovL2dpdGh1Yi5jb20vbWljcm9zb2Z0L3ZzY29kZS9pc3N1ZXMvMScsXG5cdFx0XHRcdFx0J2h0dHBzOi8vZ2l0aHViLmNvbS9vY3RvL3JlcG8vaXNzdWVzLzInLFxuXHRcdFx0XHRdXG5cdFx0XHR9KSxcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnc3dhbGxvd3MgZ2l0IGVycm9ycyBhbmQgZmlyZXMgbm8gZXZlbnRzJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IGggPSBjcmVhdGVIYXJuZXNzKCk7XG5cdFx0c2VlZFNlc3Npb24oaC5zdGF0ZU1hbmFnZXIsIHsgd29ya2luZ0RpcmVjdG9yeTogV09SS0lOR19ESVJFQ1RPUlkgfSk7XG5cdFx0aC5zZXRHaXRFcnJvcihuZXcgRXJyb3IoJ2dpdCBjb21tYW5kIGZhaWxlZCcpKTtcblxuXHRcdGF3YWl0IGguc2VydmljZS5yZWZyZXNoU2Vzc2lvbkdpdFN0YXRlKFNFU1NJT04sIHVuZGVmaW5lZCk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdHJ1bkV2ZW50czogaC5ydW5FdmVudHNcblx0XHR9LCB7XG5cdFx0XHRydW5FdmVudHM6IFtdXG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2NvYWxlc2NlcyBjb25jdXJyZW50IHJlZnJlc2hlcyBmb3IgdGhlIHNhbWUgc2Vzc2lvbicsIGFzeW5jICgpID0+IHtcblx0XHRhd2FpdCBydW5XaXRoRmFrZWRUaW1lcnMoeyB1c2VGYWtlVGltZXJzOiB0cnVlLCBtYXhUYXNrQ291bnQ6IDEwXzAwMCB9LCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCBoID0gY3JlYXRlSGFybmVzcygpO1xuXHRcdFx0c2VlZFNlc3Npb24oaC5zdGF0ZU1hbmFnZXIsIHsgd29ya2luZ0RpcmVjdG9yeTogV09SS0lOR19ESVJFQ1RPUlkgfSk7XG5cdFx0XHRoLnNldEdpdFJlc3VsdCh7IGJyYW5jaE5hbWU6ICdmZWF0dXJlJyB9KTtcblxuXHRcdFx0Ly8gVGhyZWUgY29uY3VycmVudCByZWZyZXNoZXMgY29sbGFwc2UgdmlhIHRoZSB0aHJvdHRsZXI6IHRoZSBmaXJzdFxuXHRcdFx0Ly8gcnVucyBpbW1lZGlhdGVseSBhbmQgdGhlIGxhc3QgcXVldWVkIG9uZSBydW5zIGFmdGVyIGl0IHNldHRsZXM7XG5cdFx0XHQvLyB0aGUgbWlkZGxlIHJlcXVlc3QgaXMgZHJvcHBlZC5cblx0XHRcdGF3YWl0IFByb21pc2UuYWxsKFtcblx0XHRcdFx0aC5zZXJ2aWNlLnJlZnJlc2hTZXNzaW9uR2l0U3RhdGUoU0VTU0lPTiwgdW5kZWZpbmVkKSxcblx0XHRcdFx0aC5zZXJ2aWNlLnJlZnJlc2hTZXNzaW9uR2l0U3RhdGUoU0VTU0lPTiwgdW5kZWZpbmVkKSxcblx0XHRcdFx0aC5zZXJ2aWNlLnJlZnJlc2hTZXNzaW9uR2l0U3RhdGUoU0VTU0lPTiwgdW5kZWZpbmVkKSxcblx0XHRcdF0pO1xuXG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoaC5naXRDYWxscy5sZW5ndGgsIDIpO1xuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdzdG9wcyBsb29raW5nIGZvciBhIHB1bGwgcmVxdWVzdCBvbmNlIG9uZSBpcyBrbm93biBmb3IgdGhlIGN1cnJlbnQgYnJhbmNoJywgYXN5bmMgKCkgPT4ge1xuXHRcdGF3YWl0IHJ1bldpdGhGYWtlZFRpbWVycyh7IHVzZUZha2VUaW1lcnM6IHRydWUgfSwgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgZ2l0U3RhdGU6IElTZXNzaW9uR2l0U3RhdGUgPSB7IGJyYW5jaE5hbWU6ICdmZWF0dXJlJywgYmFzZUJyYW5jaE5hbWU6ICdtYWluJyB9O1xuXHRcdFx0Y29uc3QgaCA9IGNyZWF0ZUhhcm5lc3MoKTtcblx0XHRcdHNlZWRTZXNzaW9uKGguc3RhdGVNYW5hZ2VyLCB7XG5cdFx0XHRcdHdvcmtpbmdEaXJlY3Rvcnk6IFdPUktJTkdfRElSRUNUT1JZLFxuXHRcdFx0XHRnaXRTdGF0ZSxcblx0XHRcdFx0Z2l0SHViU3RhdGU6IHsgb3duZXI6ICdtaWNyb3NvZnQnLCByZXBvOiAndnNjb2RlJyB9LFxuXHRcdFx0fSk7XG5cdFx0XHRoLnNldEdpdFJlc3VsdChnaXRTdGF0ZSk7XG5cdFx0XHRoLnNldFB1bGxSZXF1ZXN0KCdmZWF0dXJlJywgeyB1cmw6ICdodHRwczovL2dpdGh1Yi5jb20vbWljcm9zb2Z0L3ZzY29kZS9wdWxsLzEnLCBudW1iZXI6IDEgfSk7XG5cblx0XHRcdGF3YWl0IGguc2VydmljZS5hdHRhY2hTZXNzaW9uR2l0SHViUHVsbFJlcXVlc3QoU0VTU0lPTiwgVVJJLnBhcnNlKFdPUktJTkdfRElSRUNUT1JZKSk7XG5cdFx0XHRhd2FpdCBoLnNlcnZpY2UuYXR0YWNoU2Vzc2lvbkdpdEh1YlB1bGxSZXF1ZXN0KFNFU1NJT04sIFVSSS5wYXJzZShXT1JLSU5HX0RJUkVDVE9SWSkpO1xuXG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdFx0cHVsbFJlcXVlc3RDYWxsczogaC5wdWxsUmVxdWVzdENhbGxzLFxuXHRcdFx0XHRnaXRodWI6IHJlYWRTZXNzaW9uR2l0SHViU3RhdGUoaC5zdGF0ZU1hbmFnZXIuZ2V0U2Vzc2lvblN0YXRlKFNFU1NJT04pPy5fbWV0YSksXG5cdFx0XHR9LCB7XG5cdFx0XHRcdHB1bGxSZXF1ZXN0Q2FsbHM6IFsnZmVhdHVyZSddLFxuXHRcdFx0XHRnaXRodWI6IHsgb3duZXI6ICdtaWNyb3NvZnQnLCByZXBvOiAndnNjb2RlJywgcHVsbFJlcXVlc3RVcmxzOiBbJ2h0dHBzOi8vZ2l0aHViLmNvbS9taWNyb3NvZnQvdnNjb2RlL3B1bGwvMSddLCBwdWxsUmVxdWVzdEJyYW5jaE5hbWU6ICdmZWF0dXJlJyB9LFxuXHRcdFx0fSk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2tlZXBzIHRoZSBrbm93biBwdWxsIHJlcXVlc3QgYnV0IHJlc3VtZXMgbG9va2luZyBhZnRlciB0aGUgYnJhbmNoIGNoYW5nZWQnLCBhc3luYyAoKSA9PiB7XG5cdFx0YXdhaXQgcnVuV2l0aEZha2VkVGltZXJzKHsgdXNlRmFrZVRpbWVyczogdHJ1ZSB9LCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCBuZXh0R2l0U3RhdGU6IElTZXNzaW9uR2l0U3RhdGUgPSB7IGJyYW5jaE5hbWU6ICdmZWF0dXJlLTInLCBiYXNlQnJhbmNoTmFtZTogJ21haW4nIH07XG5cdFx0XHRjb25zdCBoID0gY3JlYXRlSGFybmVzcygpO1xuXHRcdFx0c2VlZFNlc3Npb24oaC5zdGF0ZU1hbmFnZXIsIHtcblx0XHRcdFx0d29ya2luZ0RpcmVjdG9yeTogV09SS0lOR19ESVJFQ1RPUlksXG5cdFx0XHRcdGdpdFN0YXRlOiB7IGJyYW5jaE5hbWU6ICdmZWF0dXJlJywgYmFzZUJyYW5jaE5hbWU6ICdtYWluJyB9LFxuXHRcdFx0XHRnaXRIdWJTdGF0ZTogeyBvd25lcjogJ21pY3Jvc29mdCcsIHJlcG86ICd2c2NvZGUnLCBwdWxsUmVxdWVzdFVybHM6IFsnaHR0cHM6Ly9naXRodWIuY29tL21pY3Jvc29mdC92c2NvZGUvcHVsbC8xJ10sIHB1bGxSZXF1ZXN0QnJhbmNoTmFtZTogJ2ZlYXR1cmUnIH0sXG5cdFx0XHR9KTtcblx0XHRcdGguc3RhdGVNYW5hZ2VyLnNldFNlc3Npb25NZXRhKFNFU1NJT04sIHdpdGhTZXNzaW9uR2l0U3RhdGUoaC5zdGF0ZU1hbmFnZXIuZ2V0U2Vzc2lvblN0YXRlKFNFU1NJT04pPy5fbWV0YSwgbmV4dEdpdFN0YXRlKSk7XG5cdFx0XHRoLnNldEdpdFJlc3VsdChuZXh0R2l0U3RhdGUpO1xuXG5cdFx0XHQvLyBObyBwdWxsIHJlcXVlc3QgZXhpc3RzIGZvciB0aGUgbmV3IGJyYW5jaCB5ZXRcblx0XHRcdGF3YWl0IGguc2VydmljZS5hdHRhY2hTZXNzaW9uR2l0SHViUHVsbFJlcXVlc3QoU0VTU0lPTiwgVVJJLnBhcnNlKFdPUktJTkdfRElSRUNUT1JZKSk7XG5cdFx0XHRjb25zdCBnaXRodWJCZWZvcmVQdWxsUmVxdWVzdEV4aXN0cyA9IHJlYWRTZXNzaW9uR2l0SHViU3RhdGUoaC5zdGF0ZU1hbmFnZXIuZ2V0U2Vzc2lvblN0YXRlKFNFU1NJT04pPy5fbWV0YSk7XG5cblx0XHRcdGguc2V0UHVsbFJlcXVlc3QoJ2ZlYXR1cmUtMicsIHsgdXJsOiAnaHR0cHM6Ly9naXRodWIuY29tL21pY3Jvc29mdC92c2NvZGUvcHVsbC8yJywgbnVtYmVyOiAyIH0pO1xuXHRcdFx0YXdhaXQgaC5zZXJ2aWNlLmF0dGFjaFNlc3Npb25HaXRIdWJQdWxsUmVxdWVzdChTRVNTSU9OLCBVUkkucGFyc2UoV09SS0lOR19ESVJFQ1RPUlkpKTtcblxuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRcdHB1bGxSZXF1ZXN0Q2FsbHM6IGgucHVsbFJlcXVlc3RDYWxscyxcblx0XHRcdFx0Z2l0aHViQmVmb3JlUHVsbFJlcXVlc3RFeGlzdHMsXG5cdFx0XHRcdGdpdGh1YjogcmVhZFNlc3Npb25HaXRIdWJTdGF0ZShoLnN0YXRlTWFuYWdlci5nZXRTZXNzaW9uU3RhdGUoU0VTU0lPTik/Ll9tZXRhKSxcblx0XHRcdFx0cGVyc2lzdGVkR2l0SHViOiBKU09OLnBhcnNlKChhd2FpdCBoLmRiLmdldE1ldGFkYXRhKE1FVEFfR0lUSFVCX1NUQVRFKSkhKSxcblx0XHRcdH0sIHtcblx0XHRcdFx0cHVsbFJlcXVlc3RDYWxsczogWydmZWF0dXJlLTInLCAnZmVhdHVyZS0yJ10sXG5cdFx0XHRcdGdpdGh1YkJlZm9yZVB1bGxSZXF1ZXN0RXhpc3RzOiB7IG93bmVyOiAnbWljcm9zb2Z0JywgcmVwbzogJ3ZzY29kZScsIHB1bGxSZXF1ZXN0VXJsczogWydodHRwczovL2dpdGh1Yi5jb20vbWljcm9zb2Z0L3ZzY29kZS9wdWxsLzEnXSwgcHVsbFJlcXVlc3RCcmFuY2hOYW1lOiAnZmVhdHVyZScgfSxcblx0XHRcdFx0Z2l0aHViOiB7IG93bmVyOiAnbWljcm9zb2Z0JywgcmVwbzogJ3ZzY29kZScsIHB1bGxSZXF1ZXN0VXJsczogWydodHRwczovL2dpdGh1Yi5jb20vbWljcm9zb2Z0L3ZzY29kZS9wdWxsLzInLCAnaHR0cHM6Ly9naXRodWIuY29tL21pY3Jvc29mdC92c2NvZGUvcHVsbC8xJ10sIHB1bGxSZXF1ZXN0QnJhbmNoTmFtZTogJ2ZlYXR1cmUtMicgfSxcblx0XHRcdFx0cGVyc2lzdGVkR2l0SHViOiB7IG93bmVyOiAnbWljcm9zb2Z0JywgcmVwbzogJ3ZzY29kZScsIHB1bGxSZXF1ZXN0VXJsczogWydodHRwczovL2dpdGh1Yi5jb20vbWljcm9zb2Z0L3ZzY29kZS9wdWxsLzInLCAnaHR0cHM6Ly9naXRodWIuY29tL21pY3Jvc29mdC92c2NvZGUvcHVsbC8xJ10sIHB1bGxSZXF1ZXN0QnJhbmNoTmFtZTogJ2ZlYXR1cmUtMicgfSxcblx0XHRcdH0pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgncHJlc2VydmVzIEdpdEh1YiBzdGF0ZSB1cGRhdGVkIHdoaWxlIGEgcHVsbCByZXF1ZXN0IGxvb2t1cCBpcyBpbiBmbGlnaHQnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRhd2FpdCBydW5XaXRoRmFrZWRUaW1lcnMoeyB1c2VGYWtlVGltZXJzOiB0cnVlIH0sIGFzeW5jICgpID0+IHtcblx0XHRcdFx0Y29uc3QgZ2l0U3RhdGU6IElTZXNzaW9uR2l0U3RhdGUgPSB7IGJyYW5jaE5hbWU6ICdmZWF0dXJlJywgYmFzZUJyYW5jaE5hbWU6ICdtYWluJyB9O1xuXHRcdFx0XHRjb25zdCBoID0gY3JlYXRlSGFybmVzcygpO1xuXHRcdFx0XHRzZWVkU2Vzc2lvbihoLnN0YXRlTWFuYWdlciwge1xuXHRcdFx0XHRcdHdvcmtpbmdEaXJlY3Rvcnk6IFdPUktJTkdfRElSRUNUT1JZLFxuXHRcdFx0XHRcdGdpdFN0YXRlLFxuXHRcdFx0XHRcdGdpdEh1YlN0YXRlOiB7IG93bmVyOiAnbWljcm9zb2Z0JywgcmVwbzogJ3ZzY29kZScgfSxcblx0XHRcdFx0fSk7XG5cdFx0XHRcdGguc2V0R2l0UmVzdWx0KGdpdFN0YXRlKTtcblx0XHRcdFx0aC5zZXRQdWxsUmVxdWVzdCgnZmVhdHVyZScsIHsgdXJsOiAnaHR0cHM6Ly9naXRodWIuY29tL21pY3Jvc29mdC92c2NvZGUvcHVsbC8xJywgbnVtYmVyOiAxIH0pO1xuXHRcdFx0XHRoLnNldE9uUHVsbFJlcXVlc3RMb29rdXAoYXN5bmMgKCkgPT4ge1xuXHRcdFx0XHRcdGF3YWl0IGguc2VydmljZS5hdHRhY2hTZXNzaW9uR2l0SHViUmVmZXJlbmNlcyhTRVNTSU9OLCAnU2VlIG1pY3Jvc29mdC92c2NvZGUjNDInKTtcblx0XHRcdFx0XHRjb25zdCBjdXJyZW50U3RhdGUgPSByZWFkU2Vzc2lvbkdpdEh1YlN0YXRlKGguc3RhdGVNYW5hZ2VyLmdldFNlc3Npb25TdGF0ZShTRVNTSU9OKT8uX21ldGEpO1xuXHRcdFx0XHRcdGF3YWl0IGguc2VydmljZS5zZXRTZXNzaW9uR2l0SHViU3RhdGUoU0VTU0lPTiwgd2l0aE1vc3RSZWNlbnRTZXNzaW9uUHVsbFJlcXVlc3QoY3VycmVudFN0YXRlLCAnaHR0cHM6Ly9naXRodWIuY29tL21pY3Jvc29mdC92c2NvZGUvcHVsbC8yJywgJ2ZlYXR1cmUtMicpKTtcblx0XHRcdFx0fSk7XG5cblx0XHRcdFx0YXdhaXQgaC5zZXJ2aWNlLmF0dGFjaFNlc3Npb25HaXRIdWJQdWxsUmVxdWVzdChTRVNTSU9OLCBVUkkucGFyc2UoV09SS0lOR19ESVJFQ1RPUlkpKTtcblxuXHRcdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHJlYWRTZXNzaW9uR2l0SHViU3RhdGUoaC5zdGF0ZU1hbmFnZXIuZ2V0U2Vzc2lvblN0YXRlKFNFU1NJT04pPy5fbWV0YSksIHtcblx0XHRcdFx0XHRvd25lcjogJ21pY3Jvc29mdCcsXG5cdFx0XHRcdFx0cmVwbzogJ3ZzY29kZScsXG5cdFx0XHRcdFx0cHVsbFJlcXVlc3RVcmxzOiBbXG5cdFx0XHRcdFx0XHQnaHR0cHM6Ly9naXRodWIuY29tL21pY3Jvc29mdC92c2NvZGUvcHVsbC8xJyxcblx0XHRcdFx0XHRcdCdodHRwczovL2dpdGh1Yi5jb20vbWljcm9zb2Z0L3ZzY29kZS9wdWxsLzInLFxuXHRcdFx0XHRcdF0sXG5cdFx0XHRcdFx0aXNzdWVVcmxzOiBbJ2h0dHBzOi8vZ2l0aHViLmNvbS9taWNyb3NvZnQvdnNjb2RlL2lzc3Vlcy80MiddLFxuXHRcdFx0XHRcdHB1bGxSZXF1ZXN0QnJhbmNoTmFtZTogJ2ZlYXR1cmUnLFxuXHRcdFx0XHR9KTtcblx0XHRcdH0pO1xuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCd2ZXJpZmllcyBhIHB1bGwgcmVxdWVzdCB0aGF0IHByZWRhdGVzIGJyYW5jaCB0cmFja2luZyBhZ2FpbnN0IHRoZSBjdXJyZW50IGJyYW5jaCcsIGFzeW5jICgpID0+IHtcblx0XHRhd2FpdCBydW5XaXRoRmFrZWRUaW1lcnMoeyB1c2VGYWtlVGltZXJzOiB0cnVlIH0sIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IGdpdFN0YXRlOiBJU2Vzc2lvbkdpdFN0YXRlID0geyBicmFuY2hOYW1lOiAnZmVhdHVyZScsIGJhc2VCcmFuY2hOYW1lOiAnbWFpbicgfTtcblx0XHRcdGNvbnN0IGggPSBjcmVhdGVIYXJuZXNzKCk7XG5cdFx0XHRzZWVkU2Vzc2lvbihoLnN0YXRlTWFuYWdlciwge1xuXHRcdFx0XHR3b3JraW5nRGlyZWN0b3J5OiBXT1JLSU5HX0RJUkVDVE9SWSxcblx0XHRcdFx0Z2l0U3RhdGUsXG5cdFx0XHRcdGdpdEh1YlN0YXRlOiB7IG93bmVyOiAnbWljcm9zb2Z0JywgcmVwbzogJ3ZzY29kZScsIHB1bGxSZXF1ZXN0VXJsczogWydodHRwczovL2dpdGh1Yi5jb20vbWljcm9zb2Z0L3ZzY29kZS9wdWxsLzEnXSB9LFxuXHRcdFx0fSk7XG5cdFx0XHRoLnNldEdpdFJlc3VsdChnaXRTdGF0ZSk7XG5cdFx0XHRoLnNldFB1bGxSZXF1ZXN0KCdmZWF0dXJlJywgeyB1cmw6ICdodHRwczovL2dpdGh1Yi5jb20vbWljcm9zb2Z0L3ZzY29kZS9wdWxsLzEnLCBudW1iZXI6IDEgfSk7XG5cblx0XHRcdGF3YWl0IGguc2VydmljZS5hdHRhY2hTZXNzaW9uR2l0SHViUHVsbFJlcXVlc3QoU0VTU0lPTiwgVVJJLnBhcnNlKFdPUktJTkdfRElSRUNUT1JZKSk7XG5cblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0XHRwdWxsUmVxdWVzdENhbGxzOiBoLnB1bGxSZXF1ZXN0Q2FsbHMsXG5cdFx0XHRcdGdpdGh1YjogcmVhZFNlc3Npb25HaXRIdWJTdGF0ZShoLnN0YXRlTWFuYWdlci5nZXRTZXNzaW9uU3RhdGUoU0VTU0lPTik/Ll9tZXRhKSxcblx0XHRcdH0sIHtcblx0XHRcdFx0cHVsbFJlcXVlc3RDYWxsczogWydmZWF0dXJlJ10sXG5cdFx0XHRcdGdpdGh1YjogeyBvd25lcjogJ21pY3Jvc29mdCcsIHJlcG86ICd2c2NvZGUnLCBwdWxsUmVxdWVzdFVybHM6IFsnaHR0cHM6Ly9naXRodWIuY29tL21pY3Jvc29mdC92c2NvZGUvcHVsbC8xJ10sIHB1bGxSZXF1ZXN0QnJhbmNoTmFtZTogJ2ZlYXR1cmUnIH0sXG5cdFx0XHR9KTtcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnZG9lcyBub3QgYmluZCBhIHB1bGwgcmVxdWVzdCB0aGF0IHByZWRhdGVzIGJyYW5jaCB0cmFja2luZyB0byBhIGJyYW5jaCB3aXRob3V0IG9uZScsIGFzeW5jICgpID0+IHtcblx0XHRhd2FpdCBydW5XaXRoRmFrZWRUaW1lcnMoeyB1c2VGYWtlVGltZXJzOiB0cnVlIH0sIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IGdpdFN0YXRlOiBJU2Vzc2lvbkdpdFN0YXRlID0geyBicmFuY2hOYW1lOiAnZmVhdHVyZS0yJywgYmFzZUJyYW5jaE5hbWU6ICdtYWluJyB9O1xuXHRcdFx0Y29uc3QgaCA9IGNyZWF0ZUhhcm5lc3MoKTtcblx0XHRcdHNlZWRTZXNzaW9uKGguc3RhdGVNYW5hZ2VyLCB7XG5cdFx0XHRcdHdvcmtpbmdEaXJlY3Rvcnk6IFdPUktJTkdfRElSRUNUT1JZLFxuXHRcdFx0XHRnaXRTdGF0ZSxcblx0XHRcdFx0Z2l0SHViU3RhdGU6IHsgb3duZXI6ICdtaWNyb3NvZnQnLCByZXBvOiAndnNjb2RlJywgcHVsbFJlcXVlc3RVcmxzOiBbJ2h0dHBzOi8vZ2l0aHViLmNvbS9taWNyb3NvZnQvdnNjb2RlL3B1bGwvMSddIH0sXG5cdFx0XHR9KTtcblx0XHRcdGguc2V0R2l0UmVzdWx0KGdpdFN0YXRlKTtcblxuXHRcdFx0YXdhaXQgaC5zZXJ2aWNlLmF0dGFjaFNlc3Npb25HaXRIdWJQdWxsUmVxdWVzdChTRVNTSU9OLCBVUkkucGFyc2UoV09SS0lOR19ESVJFQ1RPUlkpKTtcblx0XHRcdGF3YWl0IGguc2VydmljZS5hdHRhY2hTZXNzaW9uR2l0SHViUHVsbFJlcXVlc3QoU0VTU0lPTiwgVVJJLnBhcnNlKFdPUktJTkdfRElSRUNUT1JZKSk7XG5cblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0XHRwdWxsUmVxdWVzdENhbGxzOiBoLnB1bGxSZXF1ZXN0Q2FsbHMsXG5cdFx0XHRcdGdpdGh1YjogcmVhZFNlc3Npb25HaXRIdWJTdGF0ZShoLnN0YXRlTWFuYWdlci5nZXRTZXNzaW9uU3RhdGUoU0VTU0lPTik/Ll9tZXRhKSxcblx0XHRcdH0sIHtcblx0XHRcdFx0cHVsbFJlcXVlc3RDYWxsczogWydmZWF0dXJlLTInLCAnZmVhdHVyZS0yJ10sXG5cdFx0XHRcdGdpdGh1YjogeyBvd25lcjogJ21pY3Jvc29mdCcsIHJlcG86ICd2c2NvZGUnLCBwdWxsUmVxdWVzdFVybHM6IFsnaHR0cHM6Ly9naXRodWIuY29tL21pY3Jvc29mdC92c2NvZGUvcHVsbC8xJ10gfSxcblx0XHRcdH0pO1xuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdkaXNjYXJkcyBhIHB1bGwgcmVxdWVzdCBsb29rdXAgd2hvc2UgYnJhbmNoIGlzIG5vIGxvbmdlciBjaGVja2VkIG91dCcsIGFzeW5jICgpID0+IHtcblx0XHRhd2FpdCBydW5XaXRoRmFrZWRUaW1lcnMoeyB1c2VGYWtlVGltZXJzOiB0cnVlIH0sIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IGdpdFN0YXRlOiBJU2Vzc2lvbkdpdFN0YXRlID0geyBicmFuY2hOYW1lOiAnZmVhdHVyZScsIGJhc2VCcmFuY2hOYW1lOiAnbWFpbicgfTtcblx0XHRcdGNvbnN0IGggPSBjcmVhdGVIYXJuZXNzKCk7XG5cdFx0XHRzZWVkU2Vzc2lvbihoLnN0YXRlTWFuYWdlciwge1xuXHRcdFx0XHR3b3JraW5nRGlyZWN0b3J5OiBXT1JLSU5HX0RJUkVDVE9SWSxcblx0XHRcdFx0Z2l0U3RhdGUsXG5cdFx0XHRcdGdpdEh1YlN0YXRlOiB7IG93bmVyOiAnbWljcm9zb2Z0JywgcmVwbzogJ3ZzY29kZScgfSxcblx0XHRcdH0pO1xuXHRcdFx0aC5zZXRHaXRSZXN1bHQoZ2l0U3RhdGUpO1xuXHRcdFx0aC5zZXRQdWxsUmVxdWVzdCgnZmVhdHVyZScsIHsgdXJsOiAnaHR0cHM6Ly9naXRodWIuY29tL21pY3Jvc29mdC92c2NvZGUvcHVsbC8xJywgbnVtYmVyOiAxIH0pO1xuXHRcdFx0Ly8gVGhlIHdvcmtpbmcgY29weSBtb3ZlcyB0byBhbm90aGVyIGJyYW5jaCB3aGlsZSB0aGUgbG9va3VwIGlzIGluIGZsaWdodC5cblx0XHRcdGguc2V0T25QdWxsUmVxdWVzdExvb2t1cChhc3luYyAoKSA9PiB7XG5cdFx0XHRcdGguc3RhdGVNYW5hZ2VyLnNldFNlc3Npb25NZXRhKFNFU1NJT04sIHdpdGhTZXNzaW9uR2l0U3RhdGUoaC5zdGF0ZU1hbmFnZXIuZ2V0U2Vzc2lvblN0YXRlKFNFU1NJT04pPy5fbWV0YSwgeyBicmFuY2hOYW1lOiAnZmVhdHVyZS0yJywgYmFzZUJyYW5jaE5hbWU6ICdtYWluJyB9KSk7XG5cdFx0XHR9KTtcblxuXHRcdFx0YXdhaXQgaC5zZXJ2aWNlLmF0dGFjaFNlc3Npb25HaXRIdWJQdWxsUmVxdWVzdChTRVNTSU9OLCBVUkkucGFyc2UoV09SS0lOR19ESVJFQ1RPUlkpKTtcblxuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRcdHB1bGxSZXF1ZXN0Q2FsbHM6IGgucHVsbFJlcXVlc3RDYWxscyxcblx0XHRcdFx0Z2l0aHViOiByZWFkU2Vzc2lvbkdpdEh1YlN0YXRlKGguc3RhdGVNYW5hZ2VyLmdldFNlc3Npb25TdGF0ZShTRVNTSU9OKT8uX21ldGEpLFxuXHRcdFx0fSwge1xuXHRcdFx0XHRwdWxsUmVxdWVzdENhbGxzOiBbJ2ZlYXR1cmUnXSxcblx0XHRcdFx0Z2l0aHViOiB7IG93bmVyOiAnbWljcm9zb2Z0JywgcmVwbzogJ3ZzY29kZScgfSxcblx0XHRcdH0pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnZG9lcyBub3QgY2FwdHVyZSBhbiBlbXB0eSBiYXNlbGluZSBmb3IgYSBzdGFsZSBicmFuY2ggbG9va3VwJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0YXdhaXQgcnVuV2l0aEZha2VkVGltZXJzKHsgdXNlRmFrZVRpbWVyczogdHJ1ZSB9LCBhc3luYyAoKSA9PiB7XG5cdFx0XHRcdGNvbnN0IGdpdFN0YXRlOiBJU2Vzc2lvbkdpdFN0YXRlID0geyBicmFuY2hOYW1lOiAnZmVhdHVyZScsIGJhc2VCcmFuY2hOYW1lOiAnbWFpbicgfTtcblx0XHRcdFx0Y29uc3QgaCA9IGNyZWF0ZUhhcm5lc3MoKTtcblx0XHRcdFx0c2VlZFNlc3Npb24oaC5zdGF0ZU1hbmFnZXIsIHtcblx0XHRcdFx0XHR3b3JraW5nRGlyZWN0b3J5OiBXT1JLSU5HX0RJUkVDVE9SWSxcblx0XHRcdFx0XHRnaXRTdGF0ZSxcblx0XHRcdFx0XHRnaXRIdWJTdGF0ZTogeyBvd25lcjogJ21pY3Jvc29mdCcsIHJlcG86ICd2c2NvZGUnIH0sXG5cdFx0XHRcdFx0aXNvbGF0aW9uOiAnZm9sZGVyJyxcblx0XHRcdFx0fSk7XG5cdFx0XHRcdGguc2V0R2l0UmVzdWx0KGdpdFN0YXRlKTtcblx0XHRcdFx0aC5zZXRPblB1bGxSZXF1ZXN0TG9va3VwKGFzeW5jICgpID0+IHtcblx0XHRcdFx0XHRoLnN0YXRlTWFuYWdlci5zZXRTZXNzaW9uTWV0YShTRVNTSU9OLCB3aXRoU2Vzc2lvbkdpdFN0YXRlKGguc3RhdGVNYW5hZ2VyLmdldFNlc3Npb25TdGF0ZShTRVNTSU9OKT8uX21ldGEsIHsgYnJhbmNoTmFtZTogJ2ZlYXR1cmUtMicsIGJhc2VCcmFuY2hOYW1lOiAnbWFpbicgfSkpO1xuXHRcdFx0XHR9KTtcblxuXHRcdFx0XHRhd2FpdCBoLnNlcnZpY2UuYXR0YWNoU2Vzc2lvbkdpdEh1YlB1bGxSZXF1ZXN0KFNFU1NJT04sIFVSSS5wYXJzZShXT1JLSU5HX0RJUkVDVE9SWSkpO1xuXG5cdFx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocmVhZFNlc3Npb25HaXRIdWJTdGF0ZShoLnN0YXRlTWFuYWdlci5nZXRTZXNzaW9uU3RhdGUoU0VTU0lPTik/Ll9tZXRhKSwge1xuXHRcdFx0XHRcdG93bmVyOiAnbWljcm9zb2Z0Jyxcblx0XHRcdFx0XHRyZXBvOiAndnNjb2RlJyxcblx0XHRcdFx0fSk7XG5cdFx0XHR9KTtcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnbG9va3MgZm9yIGEgcHVsbCByZXF1ZXN0IGJlZm9yZSByZXBvcnRpbmcgYSByZWZyZXNoIHRoYXQgb2JzZXJ2ZWQgYSBicmFuY2ggY2hhbmdlJywgYXN5bmMgKCkgPT4ge1xuXHRcdGF3YWl0IHJ1bldpdGhGYWtlZFRpbWVycyh7IHVzZUZha2VUaW1lcnM6IHRydWUgfSwgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgaCA9IGNyZWF0ZUhhcm5lc3MoKTtcblx0XHRcdHNlZWRTZXNzaW9uKGguc3RhdGVNYW5hZ2VyLCB7XG5cdFx0XHRcdHdvcmtpbmdEaXJlY3Rvcnk6IFdPUktJTkdfRElSRUNUT1JZLFxuXHRcdFx0XHRnaXRTdGF0ZTogeyBicmFuY2hOYW1lOiAnZmVhdHVyZScsIGJhc2VCcmFuY2hOYW1lOiAnbWFpbicsIGdpdGh1Yk93bmVyOiAnbWljcm9zb2Z0JywgZ2l0aHViUmVwbzogJ3ZzY29kZScgfSxcblx0XHRcdFx0Z2l0SHViU3RhdGU6IHsgb3duZXI6ICdtaWNyb3NvZnQnLCByZXBvOiAndnNjb2RlJywgcHVsbFJlcXVlc3RVcmxzOiBbJ2h0dHBzOi8vZ2l0aHViLmNvbS9taWNyb3NvZnQvdnNjb2RlL3B1bGwvMSddLCBwdWxsUmVxdWVzdEJyYW5jaE5hbWU6ICdmZWF0dXJlJyB9LFxuXHRcdFx0fSk7XG5cdFx0XHRoLnNldEdpdFJlc3VsdCh7IGJyYW5jaE5hbWU6ICdmZWF0dXJlLTInLCBiYXNlQnJhbmNoTmFtZTogJ21haW4nLCBnaXRodWJPd25lcjogJ21pY3Jvc29mdCcsIGdpdGh1YlJlcG86ICd2c2NvZGUnIH0pO1xuXHRcdFx0aC5zZXRQdWxsUmVxdWVzdCgnZmVhdHVyZS0yJywgeyB1cmw6ICdodHRwczovL2dpdGh1Yi5jb20vbWljcm9zb2Z0L3ZzY29kZS9wdWxsLzInLCBudW1iZXI6IDIgfSk7XG5cblx0XHRcdC8vIFRoZSBHaXRIdWIgc3RhdGUgaXMgY2FwdHVyZWQgd2hlbiB0aGUgcmVmcmVzaCBpcyByZXBvcnRlZCBzbyB0aGVcblx0XHRcdC8vIGV2ZW50IGNhcnJpZXMgdGhlIHB1bGwgcmVxdWVzdCBvZiB0aGUgbmV3bHkgY2hlY2tlZCBvdXQgYnJhbmNoLlxuXHRcdFx0bGV0IGdpdGh1Yk9uUmVmcmVzaEV2ZW50OiBJU2Vzc2lvbkdpdEh1YlN0YXRlIHwgdW5kZWZpbmVkO1xuXHRcdFx0ZGlzcG9zYWJsZXMuYWRkKGguc2VydmljZS5vbkRpZFJlZnJlc2hTZXNzaW9uR2l0U3RhdGUoKCkgPT4ge1xuXHRcdFx0XHRnaXRodWJPblJlZnJlc2hFdmVudCA9IHJlYWRTZXNzaW9uR2l0SHViU3RhdGUoaC5zdGF0ZU1hbmFnZXIuZ2V0U2Vzc2lvblN0YXRlKFNFU1NJT04pPy5fbWV0YSk7XG5cdFx0XHR9KSk7XG5cblx0XHRcdGF3YWl0IGguc2VydmljZS5yZWZyZXNoU2Vzc2lvbkdpdFN0YXRlKFNFU1NJT04sIHVuZGVmaW5lZCk7XG5cblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0XHRwdWxsUmVxdWVzdENhbGxzOiBoLnB1bGxSZXF1ZXN0Q2FsbHMsXG5cdFx0XHRcdGdpdGh1Yk9uUmVmcmVzaEV2ZW50LFxuXHRcdFx0fSwge1xuXHRcdFx0XHRwdWxsUmVxdWVzdENhbGxzOiBbJ2ZlYXR1cmUtMiddLFxuXHRcdFx0XHRnaXRodWJPblJlZnJlc2hFdmVudDogeyBvd25lcjogJ21pY3Jvc29mdCcsIHJlcG86ICd2c2NvZGUnLCBwdWxsUmVxdWVzdFVybHM6IFsnaHR0cHM6Ly9naXRodWIuY29tL21pY3Jvc29mdC92c2NvZGUvcHVsbC8yJywgJ2h0dHBzOi8vZ2l0aHViLmNvbS9taWNyb3NvZnQvdnNjb2RlL3B1bGwvMSddLCBwdWxsUmVxdWVzdEJyYW5jaE5hbWU6ICdmZWF0dXJlLTInIH0sXG5cdFx0XHR9KTtcblx0XHR9KTtcblx0fSk7XG59KTtcbiJdLAogICJtYXBwaW5ncyI6ICJBQUtBLE9BQU8sWUFBWTtBQUNuQixTQUFTLFdBQVc7QUFDcEIsU0FBUywrQ0FBK0M7QUFDeEQsU0FBUywwQkFBMEI7QUFDbkMsU0FBUyxzQkFBc0I7QUFDL0IsU0FBK0IsNkJBQTZCO0FBRTVELFNBQVMsa0NBQWtDLGdDQUFnQyx3QkFBd0IscUJBQXFCLCtCQUErQix5QkFBeUIsNkJBQTZCLCtCQUErQix5Q0FBeUMsa0NBQWtDLHdCQUF3QixxQkFBcUIscUJBQTJGO0FBQy9iLFNBQVMsZ0JBQWdCLG1CQUFtQixpQ0FBaUM7QUFDN0UsU0FBUyxnQ0FBZ0M7QUFDekMsU0FBUyx1Q0FBdUM7QUFDaEQsU0FBUyw2QkFBNkI7QUFFdEMsU0FBUyxxQkFBcUIsc0JBQXNCLGdDQUFnQztBQUNwRixTQUFTLHdCQUF3QjtBQUVqQyxNQUFNLFVBQVU7QUFDaEIsTUFBTSxvQkFBb0I7QUFFMUIsTUFBTSw0QkFBNEIsTUFBTTtBQUV2QyxRQUFNLGNBQWMsd0NBQXdDO0FBRTVELE9BQUssMERBQTBELE1BQU07QUFDcEUsV0FBTyxnQkFBZ0IsdUJBQXVCO0FBQUEsTUFDN0MsQ0FBQyx1QkFBdUIsR0FBRztBQUFBLFFBQzFCLE9BQU87QUFBQSxRQUNQLE1BQU07QUFBQSxRQUNOLGdCQUFnQjtBQUFBLE1BQ2pCO0FBQUEsSUFDRCxDQUFDLEdBQUc7QUFBQSxNQUNILE9BQU87QUFBQSxNQUNQLE1BQU07QUFBQSxNQUNOLGlCQUFpQixDQUFDLDRDQUE0QztBQUFBLElBQy9ELENBQUM7QUFBQSxFQUNGLENBQUM7QUFFRCxPQUFLLG1FQUFtRSxNQUFNO0FBQzdFLFdBQU8sZ0JBQWdCLHVCQUF1QjtBQUFBLE1BQzdDLENBQUMsdUJBQXVCLEdBQUc7QUFB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
