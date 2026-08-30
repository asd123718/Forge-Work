import assert from "assert";
import { existsSync, mkdirSync, mkdtempSync, rmSync } from "fs";
import { tmpdir } from "os";
import { timeout } from "../../../../../base/common/async.js";
import { join } from "../../../../../base/common/path.js";
import { basename } from "../../../../../base/common/resources.js";
import { URI } from "../../../../../base/common/uri.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../../base/test/common/utils.js";
import { NullLogService } from "../../../../log/common/log.js";
import { GitRefType } from "../../../common/agentHostGitService.js";
import { SessionConfigKey } from "../../../common/sessionConfigKeys.js";
import { AH_META_IS_ARCHIVED_DB_KEY, AH_META_IS_DONE_DB_KEY, MessageKind, ResponsePartKind, TurnState } from "../../../common/state/sessionState.js";
import { AgentBranchNameGenerator } from "../../../node/shared/agentBranchNameGenerator.js";
import { buildWorktreeFailureNotification, normalizeWorktreeFailureDiagnostic, SessionWorkingDirectoryMissingError, WorktreeIsolation, getWorktreeName, getWorktreesRoot } from "../../../node/shared/worktreeIsolation.js";
import { TestSessionDatabase, createNoopGitService, createSessionDataService } from "../../common/sessionTestHelpers.js";
function createNullCopilotApiService() {
  return {
    _serviceBrand: void 0,
    messages: (..._args) => {
      throw new Error("not implemented");
    },
    countTokens: async () => {
      throw new Error("not implemented");
    },
    models: async () => [],
    responses: async () => {
      throw new Error("not implemented");
    },
    utilityChatCompletion: async () => {
      throw new Error("not implemented");
    },
    resolveRestrictedTelemetryContext: async () => {
      throw new Error("not implemented");
    },
    resolveApiEndpoint: async () => void 0
  };
}
suite("WorktreeIsolation", () => {
  const disposables = ensureNoDisposablesAreLeakedInTestSuite();
  let repoRoot;
  let worktreesRoot;
  let db;
  let addWorktreeCalls;
  let addExistingCalls;
  let removeCalls;
  let copyIncludeCalls;
  let copyIncludeError;
  let branchName;
  let hasUncommittedChanges;
  let branchExists;
  let headCommit;
  const sessionUri = URI.parse("agent-session://test/s1");
  const sessionId = "s1";
  function createGitService() {
    return {
      ...createNoopGitService(),
      getRepositoryRoot: async () => repoRoot,
      revParse: async (_root, expr) => expr === "HEAD" ? headCommit : void 0,
      getCurrentBranch: async () => "feature",
      getDefaultBranch: async () => ({ name: "main", startPoint: "main" }),
      getBranches: async () => [
        { ref: "refs/heads/main", name: "main", kind: GitRefType.Head },
        { ref: "refs/heads/feature", name: "feature", kind: GitRefType.Head }
      ],
      branchExists: async () => branchExists,
      hasUncommittedChanges: async () => hasUncommittedChanges,
      addWorktree: async (_root, worktree, branch, startPoint, track) => {
        addWorktreeCalls.push({ worktree, branchName: branch, startPoint, track });
        mkdirSync(worktree.fsPath, { recursive: true });
      },
      copyWorktreeIncludeFiles: async (repositoryRoot, worktree, globs) => {
        copyIncludeCalls.push({ repositoryRoot, worktree, globs: [...globs] });
        if (copyIncludeError) {
          throw copyIncludeError;
        }
      },
      addExistingWorktree: async (_root, worktree, branch) => {
        addExistingCalls.push({ worktree, branchName: branch });
        mkdirSync(worktree.fsPath, { recursive: true });
      },
      removeWorktree: async (_root, worktree, options) => {
        removeCalls.push({ worktree, force: options?.force === true });
        rmSync(worktree.fsPath, { recursive: true, force: true });
      }
    };
  }
  function createIsolation(disposableStore, options) {
    const branchNameGenerator = options?.branchNameGenerator ?? {
      generateBranchName: async () => branchName
    };
    return disposableStore.add(new WorktreeIsolation(
      branchNameGenerator,
      options?.gitService ?? createGitService(),
      createNullCopilotApiService(),
      createSessionDataService(db),
      new NullLogService()
    ));
  }
  setup(() => {
    repoRoot = URI.file(mkdtempSync(join(tmpdir(), "wt-iso-")));
    worktreesRoot = getWorktreesRoot(repoRoot);
    db = new TestSessionDatabase();
    addWorktreeCalls = [];
    addExistingCalls = [];
    removeCalls = [];
    copyIncludeCalls = [];
    copyIncludeError = void 0;
    branchName = "agents/my-feature";
    hasUncommittedChanges = false;
    branchExists = true;
    headCommit = "abc123";
  });
  teardown(() => {
    rmSync(repoRoot.fsPath, { recursive: true, force: true });
    rmSync(worktreesRoot.fsPath, { recursive: true, force: true });
  });
  test("getWorktreesRoot / getWorktreeName derive sibling paths and strip the agents/ prefix", () => {
    assert.deepStrictEqual({
      root: getWorktreesRoot(URI.file("/src/vscode")).fsPath,
      named: getWorktreeName("agents/add-config"),
      namedFlattened: getWorktreeName("agents/feature/sub-topic"),
      namedNoPrefix: getWorktreeName("plain-branch"),
      namedWithBranchPrefix: getWorktreeName("users/alice/agents/add-config", "users/alice/")
    }, {
      root: URI.file("/src/vscode.worktrees").fsPath,
      named: "add-config",
      namedFlattened: "feature-sub-topic",
      namedNoPrefix: "plain-branch",
      namedWithBranchPrefix: "add-config"
    });
  });
  test("resolveIsolationConfig advertises folder/worktree + branch based on git state", async () => {
    const isolation = createIsolation(disposables);
    const noRepo = await isolation.resolveIsolationConfig({ workingDirectory: void 0, config: void 0 });
    const repoWorktree = await isolation.resolveIsolationConfig({ workingDirectory: repoRoot, config: void 0 });
    const repoWorktreeSelected = await isolation.resolveIsolationConfig({ workingDirectory: repoRoot, config: { [SessionConfigKey.Isolation]: "worktree", [SessionConfigKey.Branch]: "feature" } });
    const repoFolder = await isolation.resolveIsolationConfig({ workingDirectory: repoRoot, config: { [SessionConfigKey.Isolation]: "folder" } });
    headCommit = void 0;
    const noCommits = await isolation.resolveIsolationConfig({ workingDirectory: repoRoot, config: void 0 });
    assert.deepStrictEqual({
      noRepo: { enum: noRepo.isolationProperty.protocol.enum, value: noRepo.isolationValue, branch: noRepo.branchProperty, prefix: noRepo.worktreeBranchPrefixProperty, includeFiles: noRepo.worktreeIncludeFilesProperty, branchTrack: noRepo.worktreeBranchTrackProperty },
      repoWorktree: { enum: repoWorktree.isolationProperty.protocol.enum, value: repoWorktree.isolationValue, branchDefault: repoWorktree.branchDefault, branchReadOnly: repoWorktree.branchProperty?.protocol.readOnly, prefixReadOnly: repoWorktree.worktreeBranchPrefixProperty?.protocol.readOnly, includeFilesReadOnly: repoWorktree.worktreeIncludeFilesProperty?.protocol.readOnly, branchTrackReadOnly: repoWorktree.worktreeBranchTrackProperty?.protocol.readOnly },
      repoWorktreeSelected: { branchDefault: repoWorktreeSelected.branchDefault, branchValue: repoWorktreeSelected.branchValue, branchEnum: repoWorktreeSelected.branchProperty?.protocol.enum },
      repoFolder: { value: repoFolder.isolationValue, branchDefault: repoFolder.branchDefault, branchReadOnly: repoFolder.branchProperty?.protocol.readOnly, hasPrefix: !!repoFolder.worktreeBranchPrefixProperty, hasIncludeFiles: !!repoFolder.worktreeIncludeFilesProperty, hasBranchTrack: !!repoFolder.worktreeBranchTrackProperty },
      noCommits: { enum: noCommits.isolationProperty.protocol.enum, value: noCommits.isolationValue, branch: noCommits.branchProperty, prefix: noCommits.worktreeBranchPrefixProperty, includeFiles: noCommits.worktreeIncludeFilesProperty, branchTrack: noCommits.worktreeBranchTrackProperty }
    }, {
      noRepo: { enum: ["folder"], value: "folder", branch: void 0, prefix: void 0, includeFiles: void 0, branchTrack: void 0 },
      repoWorktree: { enum: ["folder", "worktree"], value: "worktree", branchDefault: "main", branchReadOnly: false, prefixReadOnly: true, includeFilesReadOnly: true, branchTrackReadOnly: true },
      repoWorktreeSelected: { branchDefault: "main", branchValue: "feature", branchEnum: ["main"] },
      repoFolder: { value: "folder", branchDefault: "feature", branchReadOnly: true, hasPrefix: true, hasIncludeFiles: true, hasBranchTrack: true },
      noCommits: { enum: ["folder"], value: "folder", branch: void 0, prefix: void 0, includeFiles: void 0, branchTrack: void 0 }
    });
  });
  test("branchCompletions returns current then default then recent git branches, empty without a working directory", async () => {
    const isolation = createIsolation(disposables);
    assert.deepStrictEqual({
      withDir: await isolation.branchCompletions(repoRoot),
      noDir: await isolation.branchCompletions(void 0)
    }, {
      withDir: { items: [{ value: "feature", label: "feature" }, { value: "main", label: "main" }] },
      noDir: { items: [] }
    });
  });
  test("uses the local default branch name in config and its remote ref as the worktree start point", async () => {
    const gitService = createGitService();
    gitService.getDefaultBranch = async () => ({ name: "main", startPoint: "origin/main" });
    const isolation = createIsolation(disposables, { gitService });
    const config = await isolation.resolveIsolationConfig({ workingDirectory: repoRoot, config: void 0 });
    await isolation.resolveWorkingDirectory({
      sessionUri,
      sessionId,
      workingDirectory: repoRoot,
      config: {
        [SessionConfigKey.Isolation]: "worktree",
        [SessionConfigKey.Branch]: "main"
      },
      prompt: "do a thing"
    });
    assert.deepStrictEqual({
      branchDefault: config.branchDefault,
      branchEnum: config.branchProperty?.protocol.enum,
      startPoint: addWorktreeCalls[0]?.startPoint
    }, {
      branchDefault: "main",
      branchEnum: ["main"],
      startPoint: "origin/main"
    });
  });
  test("resolveWorkingDirectory creates a worktree, persists metadata, queues the announcement, and is idempotent", async () => {
    const isolation = createIsolation(disposables);
    const config = { [SessionConfigKey.Isolation]: "worktree", [SessionConfigKey.Branch]: "main" };
    const first = await isolation.resolveWorkingDirectory({ sessionUri, sessionId, workingDirectory: repoRoot, config, prompt: "do a thing" });
    const meta = await isolation.readWorktreeMetadata(sessionUri);
    const announcement = isolation.takePendingAnnouncement(sessionId);
    const second = await isolation.resolveWorkingDirectory({ sessionUri, sessionId, workingDirectory: repoRoot, config, prompt: "do a thing" });
    const expectedWorktree = URI.joinPath(worktreesRoot, getWorktreeName(branchName));
    assert.deepStrictEqual({
      returnedWorktree: first.toString(),
      addWorktreeCallCount: addWorktreeCalls.length,
      addWorktreeArgs: addWorktreeCalls.map((c) => ({ worktree: c.worktree.toString(), branchName: c.branchName, startPoint: c.startPoint })),
      metaBranch: meta?.branchName,
      metaWorktree: meta?.worktreePath?.toString(),
      metaRepo: meta?.repositoryRoot?.toString(),
      announcementHasBranch: announcement?.includes(branchName) ?? false,
      secondTakeAnnouncement: isolation.takePendingAnnouncement(sessionId),
      idempotentReturn: second.toString(),
      resolvedWorktree: isolation.getResolvedWorktree(sessionId)?.toString()
    }, {
      returnedWorktree: expectedWorktree.toString(),
      addWorktreeCallCount: 1,
      addWorktreeArgs: [{ worktree: expectedWorktree.toString(), branchName, startPoint: "main" }],
      metaBranch: branchName,
      metaWorktree: expectedWorktree.toString(),
      metaRepo: repoRoot.toString(),
      announcementHasBranch: true,
      secondTakeAnnouncement: void 0,
      idempotentReturn: expectedWorktree.toString(),
      resolvedWorktree: expectedWorktree.toString()
    });
  });
  test("resolveWorkingDirectory creates from the primary worktree while copying include files from the selected checkout", async () => {
    const checkoutRoot = URI.joinPath(repoRoot, "linked-checkout");
    const gitService = createGitService();
    let addWorktreeRoot;
    gitService.getRepositoryRoot = async () => checkoutRoot;
    gitService.getWorktreeRoots = async () => [repoRoot, checkoutRoot];
    gitService.addWorktree = async (repositoryRoot, worktree2, branch, startPoint, track) => {
      addWorktreeRoot = repositoryRoot;
      addWorktreeCalls.push({ worktree: worktree2, branchName: branch, startPoint, track });
      mkdirSync(worktree2.fsPath, { recursive: true });
    };
    const isolation = createIsolation(disposables, { gitService });
    const includeFiles = [".env"];
    const worktree = await isolation.resolveWorkingDirectory({
      sessionUri,
      sessionId,
      workingDirectory: checkoutRoot,
      config: {
        [SessionConfigKey.Isolation]: "worktree",
        [SessionConfigKey.Branch]: "main",
        [SessionConfigKey.WorktreeIncludeFiles]: includeFiles
      }
    });
    const meta = await isolation.readWorktreeMetadata(sessionUri);
    const project = isolation.sessionWorktreeProject(sessionId);
    assert.deepStrictEqual({
      worktree: worktree?.toString(),
      addWorktreeRoot: addWorktreeRoot?.toString(),
      includeFileRoot: copyIncludeCalls[0]?.repositoryRoot.toString(),
      metaRepositoryRoot: meta?.repositoryRoot?.toString(),
      project: project && { uri: project.uri.toString(), displayName: project.displayName }
    }, {
      worktree: URI.joinPath(worktreesRoot, getWorktreeName(branchName)).toString(),
      addWorktreeRoot: repoRoot.toString(),
      includeFileRoot: checkoutRoot.toString(),
      metaRepositoryRoot: repoRoot.toString(),
      project: { uri: repoRoot.toString(), displayName: basename(repoRoot) }
    });
  });
  test("resolveWorkingDirectory falls back to the selected checkout when primary worktree resolution fails", async () => {
    const checkoutRoot = URI.joinPath(repoRoot, "linked-checkout");
    const gitService = createGitService();
    gitService.getRepositoryRoot = async () => checkoutRoot;
    gitService.getWorktreeRoots = async () => {
      throw new Error("worktree enumeration failed");
    };
    const isolation = createIsolation(disposables, { gitService });
    const worktree = await isolation.resolveWorkingDirectory({
      sessionUri,
      sessionId,
      workingDirectory: checkoutRoot,
      config: { [SessionConfigKey.Isolation]: "worktree", [SessionConfigKey.Branch]: "main" }
    });
    const meta = await isolation.readWorktreeMetadata(sessionUri);
    const fallbackWorktreesRoot = getWorktreesRoot(checkoutRoot);
    assert.deepStrictEqual({
      worktree: worktree?.toString(),
      metaRepositoryRoot: meta?.repositoryRoot?.toString()
    }, {
      worktree: URI.joinPath(fallbackWorktreesRoot, getWorktreeName(branchName)).toString(),
      metaRepositoryRoot: checkoutRoot.toString()
    });
  });
  test("resolveWorkingDirectory names each creation phase, rounding percentages down and debouncing updates", async () => {
    const gitService = createGitService();
    gitService.addWorktree = async (_root, worktree, branch, startPoint, track, onProgress) => {
      addWorktreeCalls.push({ worktree, branchName: branch, startPoint, track });
      mkdirSync(worktree.fsPath, { recursive: true });
      onProgress?.({ filesDone: 7, filesTotal: 800 });
      onProgress?.({ filesDone: 96, filesTotal: 800 });
      onProgress?.({ filesDone: 100, filesTotal: 800 });
      await timeout(50);
      onProgress?.({ filesDone: 800, filesTotal: 800 });
    };
    gitService.copyWorktreeIncludeFiles = async (_root, _worktree, _globs, onProgress) => {
      onProgress?.({ filesDone: 1, filesTotal: 4 });
      onProgress?.({ filesDone: 4, filesTotal: 4 });
    };
    const isolation = createIsolation(disposables, { gitService });
    const activities = [];
    await isolation.resolveWorkingDirectory({
      sessionUri,
      sessionId,
      workingDirectory: repoRoot,
      config: {
        [SessionConfigKey.Isolation]: "worktree",
        [SessionConfigKey.Branch]: "main",
        [SessionConfigKey.WorktreeIncludeFiles]: [".env"]
      },
      prompt: "do a thing",
      onProgress: (activity) => activities.push(activity)
    });
    assert.deepStrictEqual(activities, [
      "Creating isolated worktree",
      "Creating isolated worktree (naming branch)",
      "Creating isolated worktree (checking out files)",
      "Creating isolated worktree (checking out files, 12%)",
      "Creating isolated worktree (checking out files, 100%)",
      "Creating isolated worktree (copying additional files)",
      "Creating isolated worktree (copying additional files, 100%)"
    ]);
  });
  test("resolveWorkingDirectory avoids an existing worktree directory", async () => {
    const collisionSessionId = "12345678-aaaa-bbbb-cccc-123456789abc";
    const collisionSessionUri = URI.parse(`agent-session://test/${collisionSessionId}`);
    const existingWorktree = URI.joinPath(worktreesRoot, "add-feature");
    mkdirSync(existingWorktree.fsPath, { recursive: true });
    branchExists = false;
    const isolation = createIsolation(disposables, {
      branchNameGenerator: new AgentBranchNameGenerator(createNullCopilotApiService(), new NullLogService())
    });
    const resolved = await isolation.resolveWorkingDirectory({
      sessionUri: collisionSessionUri,
      sessionId: collisionSessionId,
      workingDirectory: repoRoot,
      config: { [SessionConfigKey.Isolation]: "worktree", [SessionConfigKey.Branch]: "main" },
      prompt: "Add feature"
    });
    assert.deepStrictEqual({
      branchName: addWorktreeCalls[0]?.branchName,
      worktree: resolved?.toString()
    }, {
      branchName: "agents/add-feature-12345678",
      worktree: URI.joinPath(worktreesRoot, "add-feature-12345678").toString()
    });
  });
  test("resolveWorkingDirectory treats a failed branch check as a collision", async () => {
    const collisionSessionId = "12345678-aaaa-bbbb-cccc-123456789abc";
    const collisionSessionUri = URI.parse(`agent-session://test/${collisionSessionId}`);
    const gitService = createGitService();
    let branchExistsCalls = 0;
    gitService.branchExists = async () => {
      if (branchExistsCalls++ === 0) {
        throw new Error("transient failure");
      }
      return false;
    };
    const isolation = createIsolation(disposables, {
      branchNameGenerator: new AgentBranchNameGenerator(createNullCopilotApiService(), new NullLogService()),
      gitService
    });
    const resolved = await isolation.resolveWorkingDirectory({
      sessionUri: collisionSessionUri,
      sessionId: collisionSessionId,
      workingDirectory: repoRoot,
      config: { [SessionConfigKey.Isolation]: "worktree", [SessionConfigKey.Branch]: "main" },
      prompt: "Add feature"
    });
    assert.deepStrictEqual({
      branchExistsCalls,
      branchName: addWorktreeCalls[0]?.branchName,
      worktree: resolved?.toString()
    }, {
      branchExistsCalls: 2,
      branchName: "agents/add-feature-12345678",
      worktree: URI.joinPath(worktreesRoot, "add-feature-12345678").toString()
    });
  });
  test("resolveWorkingDirectory serializes concurrent creation in the same repository", async () => {
    const gitService = createGitService();
    const checkoutRootA = URI.joinPath(repoRoot, "linked-checkout-a");
    const checkoutRootB = URI.joinPath(repoRoot, "linked-checkout-b");
    const existingBranches = /* @__PURE__ */ new Set();
    let activeAddWorktrees = 0;
    let maxActiveAddWorktrees = 0;
    gitService.getRepositoryRoot = async (workingDirectory) => workingDirectory;
    gitService.getWorktreeRoots = async () => [repoRoot, checkoutRootA, checkoutRootB];
    gitService.branchExists = async (_repositoryRoot, candidate) => existingBranches.has(candidate);
    gitService.addWorktree = async (_repositoryRoot, worktree, candidate, startPoint, track) => {
      activeAddWorktrees++;
      maxActiveAddWorktrees = Math.max(maxActiveAddWorktrees, activeAddWorktrees);
      await timeout(10);
      addWorktreeCalls.push({ worktree, branchName: candidate, startPoint, track });
      existingBranches.add(candidate);
      mkdirSync(worktree.fsPath, { recursive: true });
      activeAddWorktrees--;
    };
    const isolation = createIsolation(disposables, {
      branchNameGenerator: new AgentBranchNameGenerator(createNullCopilotApiService(), new NullLogService()),
      gitService
    });
    const config = { [SessionConfigKey.Isolation]: "worktree", [SessionConfigKey.Branch]: "main" };
    const worktrees = await Promise.all([
      isolation.resolveWorkingDirectory({ sessionUri: URI.parse("agent-session://test/12345678-aaaa-bbbb-cccc-123456789abc"), sessionId: "12345678-aaaa-bbbb-cccc-123456789abc", workingDirectory: checkoutRootA, config, prompt: "Add feature" }),
      isolation.resolveWorkingDirectory({ sessionUri: URI.parse("agent-session://test/87654321-aaaa-bbbb-cccc-123456789abc"), sessionId: "87654321-aaaa-bbbb-cccc-123456789abc", workingDirectory: checkoutRootB, config, prompt: "Add feature" })
    ]);
    assert.deepStrictEqual({
      maxActiveAddWorktrees,
      branchNames: addWorktreeCalls.map((call) => call.branchName),
      worktrees: worktrees.map((worktree) => worktree?.toString())
    }, {
      maxActiveAddWorktrees: 1,
      branchNames: ["agents/add-feature", "agents/add-feature-87654321"],
      worktrees: [
        URI.joinPath(worktreesRoot, "add-feature").toString(),
        URI.joinPath(worktreesRoot, "add-feature-87654321").toString()
      ]
    });
  });
  test("resolveWorkingDirectory is a no-op for folder isolation or a missing branch", async () => {
    const isolation = createIsolation(disposables);
    const folder = await isolation.resolveWorkingDirectory({ sessionUri, sessionId, workingDirectory: repoRoot, config: { [SessionConfigKey.Isolation]: "folder", [SessionConfigKey.Branch]: "main" } });
    const noBranch = await isolation.resolveWorkingDirectory({ sessionUri, sessionId, workingDirectory: repoRoot, config: { [SessionConfigKey.Isolation]: "worktree" } });
    assert.deepStrictEqual({
      folder: folder?.toString(),
      noBranch: noBranch?.toString(),
      addWorktreeCallCount: addWorktreeCalls.length,
      resolvedWorktree: isolation.getResolvedWorktree(sessionId)
    }, {
      folder: repoRoot.toString(),
      noBranch: repoRoot.toString(),
      addWorktreeCallCount: 0,
      resolvedWorktree: void 0
    });
  });
  test("resolveWorkingDirectory copies configured include files and tolerates copy failures", async () => {
    const isolation = createIsolation(disposables);
    const includeFiles = [".env", ".env.local", "config/**"];
    copyIncludeError = new Error("copy failed");
    const worktree = await isolation.resolveWorkingDirectory({
      sessionUri,
      sessionId,
      workingDirectory: repoRoot,
      config: {
        [SessionConfigKey.Isolation]: "worktree",
        [SessionConfigKey.Branch]: "main",
        [SessionConfigKey.WorktreeIncludeFiles]: includeFiles
      }
    });
    assert.deepStrictEqual({
      worktree: worktree?.toString(),
      copyIncludeCalls: copyIncludeCalls.map((call) => ({
        repositoryRoot: call.repositoryRoot.toString(),
        worktree: call.worktree.toString(),
        globs: call.globs
      })),
      resolvedWorktree: isolation.getResolvedWorktree(sessionId)?.toString()
    }, {
      worktree: URI.joinPath(worktreesRoot, getWorktreeName(branchName)).toString(),
      copyIncludeCalls: [{
        repositoryRoot: repoRoot.toString(),
        worktree: URI.joinPath(worktreesRoot, getWorktreeName(branchName)).toString(),
        globs: includeFiles
      }],
      resolvedWorktree: URI.joinPath(worktreesRoot, getWorktreeName(branchName)).toString()
    });
  });
  test("resolveWorkingDirectoryForResume recreates a missing live worktree and preserves an existing directory", async () => {
    const isolation = createIsolation(disposables);
    const missingWorktree = URI.joinPath(worktreesRoot, "missing-live-worktree");
    const existingWorktree = URI.joinPath(worktreesRoot, "existing-live-worktree");
    mkdirSync(existingWorktree.fsPath, { recursive: true });
    await Promise.all([
      db.setMetadata("copilot.worktree.branchName", "feature/x"),
      db.setMetadata("copilot.worktree.path", missingWorktree.toString()),
      db.setMetadata("copilot.worktree.repositoryRoot", repoRoot.toString())
    ]);
    const outcomes = {
      missingWorktreeRecreated: (await isolation.resolveWorkingDirectoryForResume(sessionUri, sessionId, missingWorktree)).toString(),
      existingWorktreeUsedUnchanged: (await isolation.resolveWorkingDirectoryForResume(sessionUri, sessionId, existingWorktree)).toString(),
      recreatedWorktrees: addExistingCalls.map((call) => ({ worktree: call.worktree.toString(), branchName: call.branchName }))
    };
    assert.deepStrictEqual(outcomes, {
      missingWorktreeRecreated: missingWorktree.toString(),
      existingWorktreeUsedUnchanged: existingWorktree.toString(),
      recreatedWorktrees: [{ worktree: missingWorktree.toString(), branchName: "feature/x" }]
    });
  });
  test("resolveWorkingDirectoryForResume uses the repository root for archived history", async () => {
    const isolation = createIsolation(disposables);
    const missingWorktree = URI.joinPath(worktreesRoot, "missing-archived-worktree");
    await Promise.all([
      db.setMetadata("copilot.worktree.branchName", "feature/x"),
      db.setMetadata("copilot.worktree.path", missingWorktree.toString()),
      db.setMetadata("copilot.worktree.repositoryRoot", repoRoot.toString()),
      db.setMetadata(AH_META_IS_ARCHIVED_DB_KEY, "true")
    ]);
    const resolved = await isolation.resolveWorkingDirectoryForResume(sessionUri, sessionId, missingWorktree);
    assert.deepStrictEqual({ resolved: resolved.toString(), worktreesRecreated: addExistingCalls.length }, {
      resolved: repoRoot.toString(),
      worktreesRecreated: 0
    });
  });
  test("resolveWorkingDirectoryForResume falls back to legacy isDone archived metadata", async () => {
    const isolation = createIsolation(disposables);
    const missingWorktree = URI.joinPath(worktreesRoot, "missing-legacy-archived-worktree");
    await Promise.all([
      db.setMetadata("copilot.worktree.branchName", "feature/x"),
      db.setMetadata("copilot.worktree.path", missingWorktree.toString()),
      db.setMetadata("copilot.worktree.repositoryRoot", repoRoot.toString()),
      db.setMetadata(AH_META_IS_DONE_DB_KEY, "true")
    ]);
    const resolved = await isolation.resolveWorkingDirectoryForResume(sessionUri, sessionId, missingWorktree);
    assert.strictEqual(resolved.toString(), repoRoot.toString());
  });
  test("resolveWorkingDirectoryForResume reports a missing preserved branch", async () => {
    const isolation = createIsolation(disposables);
    const missingWorktree = URI.joinPath(worktreesRoot, "missing-branch-worktree");
    branchExists = false;
    await Promise.all([
      db.setMetadata("copilot.worktree.branchName", "feature/x"),
      db.setMetadata("copilot.worktree.path", missingWorktree.toString()),
      db.setMetadata("copilot.worktree.repositoryRoot", repoRoot.toString())
    ]);
    await assert.rejects(
      () => isolation.resolveWorkingDirectoryForResume(sessionUri, sessionId, missingWorktree),
      (error) => error instanceof SessionWorkingDirectoryMissingError && error.reason !== void 0 && /branch 'feature\/x' no longer exists/.test(error.message)
    );
    assert.strictEqual(addExistingCalls.length, 0);
  });
  test("resolveWorkingDirectoryForResume reports a missing live directory without worktree metadata", async () => {
    const isolation = createIsolation(disposables);
    const missingDirectory = URI.joinPath(repoRoot, "missing-directory");
    await assert.rejects(
      () => isolation.resolveWorkingDirectoryForResume(sessionUri, sessionId, missingDirectory),
      (error) => error instanceof SessionWorkingDirectoryMissingError
    );
  });
  test("resolveWorkingDirectoryForResume reports an archived session when its repository root is also missing", async () => {
    const isolation = createIsolation(disposables);
    const missingRepositoryRoot = URI.joinPath(repoRoot, "missing-repository");
    const missingWorktree = URI.joinPath(worktreesRoot, "missing-archived-no-root-worktree");
    await Promise.all([
      db.setMetadata("copilot.worktree.branchName", "feature/x"),
      db.setMetadata("copilot.worktree.path", missingWorktree.toString()),
      db.setMetadata("copilot.worktree.repositoryRoot", missingRepositoryRoot.toString()),
      db.setMetadata(AH_META_IS_ARCHIVED_DB_KEY, "true")
    ]);
    await assert.rejects(
      () => isolation.resolveWorkingDirectoryForResume(sessionUri, sessionId, missingWorktree),
      (error) => error instanceof SessionWorkingDirectoryMissingError
    );
  });
  test("resolveWorktreeProject / sessionWorktreeProject expose the repository as the session project", async () => {
    const isolation = createIsolation(disposables);
    const expectedDisplayName = basename(repoRoot);
    const beforeAsync = await isolation.resolveWorktreeProject(sessionUri);
    const beforeSync = isolation.sessionWorktreeProject(sessionId);
    await isolation.resolveWorkingDirectory({ sessionUri, sessionId, workingDirectory: repoRoot, config: { [SessionConfigKey.Isolation]: "worktree", [SessionConfigKey.Branch]: "main" } });
    const afterAsync = await isolation.resolveWorktreeProject(sessionUri);
    const afterSync = isolation.sessionWorktreeProject(sessionId);
    assert.deepStrictEqual({
      beforeAsync,
      beforeSync,
      afterAsync: { uri: afterAsync?.uri.toString(), displayName: afterAsync?.displayName },
      afterSync: { uri: afterSync?.uri.toString(), displayName: afterSync?.displayName },
      unknownSession: isolation.sessionWorktreeProject("does-not-exist")
    }, {
      beforeAsync: void 0,
      beforeSync: void 0,
      afterAsync: { uri: repoRoot.toString(), displayName: expectedDisplayName },
      afterSync: { uri: repoRoot.toString(), displayName: expectedDisplayName },
      unknownSession: void 0
    });
  });
  test("resolveWorktreeProject normalizes persisted linked-checkout metadata", async () => {
    const checkoutRoot = URI.joinPath(repoRoot, "linked-checkout");
    const existingWorktree = URI.joinPath(repoRoot, "existing-worktree");
    mkdirSync(existingWorktree.fsPath, { recursive: true });
    await Promise.all([
      db.setMetadata("copilot.worktree.branchName", "feature/x"),
      db.setMetadata("copilot.worktree.path", existingWorktree.toString()),
      db.setMetadata("copilot.worktree.repositoryRoot", checkoutRoot.toString())
    ]);
    const gitService = createGitService();
    let resolvedFrom;
    let resolutionCount = 0;
    gitService.getWorktreeRoots = async (workingDirectory) => {
      resolvedFrom = workingDirectory;
      resolutionCount++;
      return [repoRoot, checkoutRoot, existingWorktree];
    };
    const isolation = createIsolation(disposables, { gitService });
    const project = await isolation.resolveWorktreeProject(sessionUri);
    await isolation.resolveWorktreeProject(sessionUri);
    assert.deepStrictEqual({
      resolutionCount,
      resolvedFrom: resolvedFrom?.toString(),
      project: project && { uri: project.uri.toString(), displayName: project.displayName },
      persistedRepositoryRoot: await db.getMetadata("copilot.worktree.repositoryRoot")
    }, {
      resolutionCount: 1,
      resolvedFrom: existingWorktree.toString(),
      project: { uri: repoRoot.toString(), displayName: basename(repoRoot) },
      persistedRepositoryRoot: repoRoot.toString()
    });
  });
  test("adoptExistingWorktreeMetadata bridges a linked worktree into worktree metadata", async () => {
    const worktreeCheckout = URI.joinPath(worktreesRoot, "adopted");
    const gitService = createGitService();
    gitService.getRepositoryRoot = async () => worktreeCheckout;
    gitService.getWorktreeRoots = async () => [repoRoot, worktreeCheckout];
    gitService.getCurrentBranch = async () => "agents/adopted";
    gitService.getDefaultBranch = async () => ({ name: "main", startPoint: "main" });
    const isolation = createIsolation(disposables, { gitService });
    const recorded = await isolation.adoptExistingWorktreeMetadata(sessionUri, worktreeCheckout);
    const project = await isolation.resolveWorktreeProject(sessionUri);
    assert.deepStrictEqual({
      recorded,
      branchName: await db.getMetadata("copilot.worktree.branchName"),
      path: await db.getMetadata("copilot.worktree.path"),
      repositoryRoot: await db.getMetadata("copilot.worktree.repositoryRoot"),
      diffBaseBranch: await db.getMetadata("agentHost.diffBaseBranch"),
      project: project && { uri: project.uri.toString(), displayName: project.displayName }
    }, {
      recorded: true,
      branchName: "agents/adopted",
      path: worktreeCheckout.toString(),
      repositoryRoot: repoRoot.toString(),
      diffBaseBranch: "main",
      project: { uri: repoRoot.toString(), displayName: basename(repoRoot) }
    });
  });
  test("adoptExistingWorktreeMetadata is a no-op for a primary checkout", async () => {
    const gitService = createGitService();
    gitService.getRepositoryRoot = async () => repoRoot;
    gitService.getWorktreeRoots = async () => [repoRoot];
    const isolation = createIsolation(disposables, { gitService });
    const recorded = await isolation.adoptExistingWorktreeMetadata(sessionUri, repoRoot);
    assert.deepStrictEqual({
      recorded,
      branchName: await db.getMetadata("copilot.worktree.branchName"),
      repositoryRoot: await db.getMetadata("copilot.worktree.repositoryRoot")
    }, {
      recorded: false,
      branchName: void 0,
      repositoryRoot: void 0
    });
  });
  test("applyRestoreAnnouncement prepends a markdown part when worktree metadata exists", async () => {
    const isolation = createIsolation(disposables);
    const turn = {
      id: "t1",
      message: { text: "hi", origin: { kind: MessageKind.User } },
      responseParts: [],
      usage: void 0,
      state: TurnState.Complete
    };
    const withoutMeta = await isolation.applyRestoreAnnouncement(sessionUri, [turn]);
    await isolation.resolveWorkingDirectory({ sessionUri, sessionId, workingDirectory: repoRoot, config: { [SessionConfigKey.Isolation]: "worktree", [SessionConfigKey.Branch]: "main" } });
    const withMeta = await isolation.applyRestoreAnnouncement(sessionUri, [turn]);
    const firstPart = withMeta[0].responseParts[0];
    assert.deepStrictEqual({
      unchangedWhenNoMeta: withoutMeta[0].responseParts.length,
      firstPartKind: firstPart?.kind,
      firstPartHasBranch: firstPart?.kind === ResponsePartKind.Markdown ? firstPart.content.includes(branchName) : false
    }, {
      unchangedWhenNoMeta: 0,
      firstPartKind: ResponsePartKind.Markdown,
      firstPartHasBranch: true
    });
  });
  test("worktree failure notification bounds and escapes diagnostics", () => {
    const diagnostic = `git-lfs \`filter\`
${"x".repeat(250)}`;
    const notification = buildWorktreeFailureNotification(diagnostic);
    assert.deepStrictEqual({
      normalizedLength: normalizeWorktreeFailureDiagnostic(diagnostic)?.length,
      kind: notification.kind,
      content: notification.content,
      meta: notification._meta
    }, {
      normalizedLength: 200,
      kind: ResponsePartKind.SystemNotification,
      content: `Couldn't create the isolated worktree. This session is continuing in the original folder.

\`\`git-lfs \`filter\` ${"x".repeat(180)}...\`\``,
      meta: { kind: "worktreeCreationFailure", severity: "warning" }
    });
  });
  test("applyRestoreAnnouncement restores a worktree failure only for its originating session", async () => {
    const isolation = createIsolation(disposables);
    const turn = {
      id: "t1",
      message: { text: "hi", origin: { kind: MessageKind.User } },
      responseParts: [],
      usage: void 0,
      state: TurnState.Complete
    };
    await isolation.persistCreationFailure(sessionUri, sessionId, "git worktree exited with code 128");
    const matching = await isolation.applyRestoreAnnouncement(sessionUri, [turn]);
    const copied = await isolation.applyRestoreAnnouncement(URI.parse("agent-session://test/copied"), [turn]);
    const empty = await isolation.applyRestoreAnnouncement(sessionUri, []);
    assert.deepStrictEqual({
      matching: matching[0].responseParts[0],
      copiedPartCount: copied[0].responseParts.length,
      emptyTurnCount: empty.length
    }, {
      matching: {
        kind: ResponsePartKind.SystemNotification,
        content: "Couldn't create the isolated worktree. This session is continuing in the original folder.\n\n`git worktree exited with code 128`",
        _meta: { kind: "worktreeCreationFailure", severity: "warning" }
      },
      copiedPartCount: 0,
      emptyTurnCount: 0
    });
  });
  test("cleanup on archive removes a clean worktree and unarchive recreates it", async () => {
    const isolation = createIsolation(disposables);
    const worktree = await isolation.resolveWorkingDirectory({ sessionUri, sessionId, workingDirectory: repoRoot, config: { [SessionConfigKey.Isolation]: "worktree", [SessionConfigKey.Branch]: "main" } });
    await isolation.cleanupWorktreeOnArchive(sessionUri, sessionId);
    const removedDuringArchive = worktree ? !existsSync(worktree.fsPath) : false;
    await isolation.recreateWorktreeOnUnarchive(sessionUri, sessionId);
    const restoredDuringUnarchive = worktree ? existsSync(worktree.fsPath) : false;
    assert.deepStrictEqual({
      removeCalls: removeCalls.map((call) => ({ worktree: call.worktree.toString(), force: call.force })),
      removedDuringArchive,
      addExistingCalls: addExistingCalls.map((c) => ({ worktree: c.worktree.toString(), branchName: c.branchName })),
      restoredDuringUnarchive
    }, {
      removeCalls: [{ worktree: worktree.toString(), force: false }],
      removedDuringArchive: true,
      addExistingCalls: [{ worktree: worktree.toString(), branchName }],
      restoredDuringUnarchive: true
    });
  });
  test("removeSessionWorktree force-removes a worktree for explicit session deletion", async () => {
    const isolation = createIsolation(disposables);
    const worktree = await isolation.resolveWorkingDirectory({ sessionUri, sessionId, workingDirectory: repoRoot, config: { [SessionConfigKey.Isolation]: "worktree", [SessionConfigKey.Branch]: "main" } });
    await isolation.removeSessionWorktree(sessionId, await isolation.prepareSessionDeletion(sessionUri, sessionId));
    assert.deepStrictEqual({
      removeCalls: removeCalls.map((call) => ({ worktree: call.worktree.toString(), force: call.force })),
      resolvedWorktree: isolation.getResolvedWorktree(sessionId)
    }, {
      removeCalls: [{ worktree: worktree.toString(), force: true }],
      resolvedWorktree: void 0
    });
  });
  test("session deletion removes a persisted worktree after a process restart", async () => {
    const worktree = URI.joinPath(worktreesRoot, "persisted-worktree");
    mkdirSync(worktree.fsPath, { recursive: true });
    await Promise.all([
      db.setMetadata("copilot.worktree.branchName", "feature/x"),
      db.setMetadata("copilot.worktree.path", worktree.toString()),
      db.setMetadata("copilot.worktree.repositoryRoot", repoRoot.toString())
    ]);
    const isolation = createIsolation(disposables);
    const worktreeToRemove = await isolation.prepareSessionDeletion(sessionUri, sessionId);
    await isolation.removeSessionWorktree(sessionId, worktreeToRemove);
    assert.deepStrictEqual({
      removeCalls: removeCalls.map((call) => ({ worktree: call.worktree.toString(), force: call.force })),
      resolvedWorktree: isolation.getResolvedWorktree(sessionId)
    }, {
      removeCalls: [{ worktree: worktree.toString(), force: true }],
      resolvedWorktree: void 0
    });
  });
  test("failed worktree removal rejects and remains available for retry", async () => {
    const gitService = createGitService();
    gitService.removeWorktree = async () => {
      throw new Error("remove failed");
    };
    const isolation = createIsolation(disposables, { gitService });
    const worktree = URI.joinPath(worktreesRoot, "persisted-worktree");
    await Promise.all([
      db.setMetadata("copilot.worktree.branchName", "feature/x"),
      db.setMetadata("copilot.worktree.path", worktree.toString()),
      db.setMetadata("copilot.worktree.repositoryRoot", repoRoot.toString())
    ]);
    const worktreeToRemove = await isolation.prepareSessionDeletion(sessionUri, sessionId);
    await assert.rejects(() => isolation.removeSessionWorktree(sessionId, worktreeToRemove), /remove failed/);
    const retry = await isolation.prepareSessionDeletion(sessionUri, sessionId);
    assert.deepStrictEqual({
      retryRepositoryRoot: retry?.repositoryRoot.toString(),
      retryWorktree: retry?.worktree.toString()
    }, {
      retryRepositoryRoot: repoRoot.toString(),
      retryWorktree: worktree.toString()
    });
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxwbGF0Zm9ybVxcYWdlbnRIb3N0XFx0ZXN0XFxub2RlXFxzaGFyZWRcXHdvcmt0cmVlSXNvbGF0aW9uLnRlc3QudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgYXNzZXJ0IGZyb20gJ2Fzc2VydCc7XG5pbXBvcnQgeyBleGlzdHNTeW5jLCBta2RpclN5bmMsIG1rZHRlbXBTeW5jLCBybVN5bmMgfSBmcm9tICdmcyc7XG5pbXBvcnQgeyB0bXBkaXIgfSBmcm9tICdvcyc7XG5pbXBvcnQgeyB0aW1lb3V0IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vYXN5bmMuanMnO1xuaW1wb3J0IHsgRGlzcG9zYWJsZVN0b3JlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IGpvaW4gfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9wYXRoLmpzJztcbmltcG9ydCB7IGJhc2VuYW1lIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vcmVzb3VyY2VzLmpzJztcbmltcG9ydCB7IFVSSSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3VyaS5qcyc7XG5pbXBvcnQgeyBlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL3Rlc3QvY29tbW9uL3V0aWxzLmpzJztcbmltcG9ydCB7IE51bGxMb2dTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vbG9nL2NvbW1vbi9sb2cuanMnO1xuaW1wb3J0IHsgR2l0UmVmVHlwZSwgSUFnZW50SG9zdEdpdFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vYWdlbnRIb3N0R2l0U2VydmljZS5qcyc7XG5pbXBvcnQgeyBTZXNzaW9uQ29uZmlnS2V5IH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL3Nlc3Npb25Db25maWdLZXlzLmpzJztcbmltcG9ydCB7IEFIX01FVEFfSVNfQVJDSElWRURfREJfS0VZLCBBSF9NRVRBX0lTX0RPTkVfREJfS0VZLCBNZXNzYWdlS2luZCwgUmVzcG9uc2VQYXJ0S2luZCwgVHVyblN0YXRlLCB0eXBlIFR1cm4gfSBmcm9tICcuLi8uLi8uLi9jb21tb24vc3RhdGUvc2Vzc2lvblN0YXRlLmpzJztcbmltcG9ydCB7IEFnZW50QnJhbmNoTmFtZUdlbmVyYXRvciwgSUFnZW50QnJhbmNoTmFtZUdlbmVyYXRvciB9IGZyb20gJy4uLy4uLy4uL25vZGUvc2hhcmVkL2FnZW50QnJhbmNoTmFtZUdlbmVyYXRvci5qcyc7XG5pbXBvcnQgeyBJQ29waWxvdEFwaVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9ub2RlL3NoYXJlZC9jb3BpbG90QXBpU2VydmljZS5qcyc7XG5pbXBvcnQgeyBidWlsZFdvcmt0cmVlRmFpbHVyZU5vdGlmaWNhdGlvbiwgbm9ybWFsaXplV29ya3RyZWVGYWlsdXJlRGlhZ25vc3RpYywgU2Vzc2lvbldvcmtpbmdEaXJlY3RvcnlNaXNzaW5nRXJyb3IsIFdvcmt0cmVlSXNvbGF0aW9uLCBnZXRXb3JrdHJlZU5hbWUsIGdldFdvcmt0cmVlc1Jvb3QgfSBmcm9tICcuLi8uLi8uLi9ub2RlL3NoYXJlZC93b3JrdHJlZUlzb2xhdGlvbi5qcyc7XG5pbXBvcnQgeyBUZXN0U2Vzc2lvbkRhdGFiYXNlLCBjcmVhdGVOb29wR2l0U2VydmljZSwgY3JlYXRlU2Vzc2lvbkRhdGFTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vY29tbW9uL3Nlc3Npb25UZXN0SGVscGVycy5qcyc7XG5cbi8qKlxuICogTWluaW1hbCB7QGxpbmsgSUNvcGlsb3RBcGlTZXJ2aWNlfSBzdHViIGZvciBjb25zdHJ1Y3Rpbmcge0BsaW5rIFdvcmt0cmVlSXNvbGF0aW9ufVxuICogaW4gdGVzdHMuIFRlc3RzIGluamVjdCB0aGVpciBvd24gYnJhbmNoLW5hbWUgZ2VuZXJhdG9yLCBzbyBpdHMgbWV0aG9kcyBhcmUgbmV2ZXIgY2FsbGVkLlxuICovXG5mdW5jdGlvbiBjcmVhdGVOdWxsQ29waWxvdEFwaVNlcnZpY2UoKTogSUNvcGlsb3RBcGlTZXJ2aWNlIHtcblx0cmV0dXJuIHtcblx0XHRfc2VydmljZUJyYW5kOiB1bmRlZmluZWQsXG5cdFx0bWVzc2FnZXM6ICguLi5fYXJnczogdW5rbm93bltdKTogbmV2ZXIgPT4geyB0aHJvdyBuZXcgRXJyb3IoJ25vdCBpbXBsZW1lbnRlZCcpOyB9LFxuXHRcdGNvdW50VG9rZW5zOiBhc3luYyAoKSA9PiB7IHRocm93IG5ldyBFcnJvcignbm90IGltcGxlbWVudGVkJyk7IH0sXG5cdFx0bW9kZWxzOiBhc3luYyAoKSA9PiBbXSxcblx0XHRyZXNwb25zZXM6IGFzeW5jICgpID0+IHsgdGhyb3cgbmV3IEVycm9yKCdub3QgaW1wbGVtZW50ZWQnKTsgfSxcblx0XHR1dGlsaXR5Q2hhdENvbXBsZXRpb246IGFzeW5jICgpID0+IHsgdGhyb3cgbmV3IEVycm9yKCdub3QgaW1wbGVtZW50ZWQnKTsgfSxcblx0XHRyZXNvbHZlUmVzdHJpY3RlZFRlbGVtZXRyeUNvbnRleHQ6IGFzeW5jICgpID0+IHsgdGhyb3cgbmV3IEVycm9yKCdub3QgaW1wbGVtZW50ZWQnKTsgfSxcblx0XHRyZXNvbHZlQXBpRW5kcG9pbnQ6IGFzeW5jICgpID0+IHVuZGVmaW5lZCxcblx0fTtcbn1cblxuc3VpdGUoJ1dvcmt0cmVlSXNvbGF0aW9uJywgKCkgPT4ge1xuXG5cdGNvbnN0IGRpc3Bvc2FibGVzID0gZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlKCk7XG5cblx0bGV0IHJlcG9Sb290OiBVUkk7XG5cdGxldCB3b3JrdHJlZXNSb290OiBVUkk7XG5cdGxldCBkYjogVGVzdFNlc3Npb25EYXRhYmFzZTtcblx0bGV0IGFkZFdvcmt0cmVlQ2FsbHM6IHsgd29ya3RyZWU6IFVSSTsgYnJhbmNoTmFtZTogc3RyaW5nOyBzdGFydFBvaW50OiBzdHJpbmc7IHRyYWNrOiBib29sZWFuIH1bXTtcblx0bGV0IGFkZEV4aXN0aW5nQ2FsbHM6IHsgd29ya3RyZWU6IFVSSTsgYnJhbmNoTmFtZTogc3RyaW5nIH1bXTtcblx0bGV0IHJlbW92ZUNhbGxzOiB7IHdvcmt0cmVlOiBVUkk7IGZvcmNlOiBib29sZWFuIH1bXTtcblx0bGV0IGNvcHlJbmNsdWRlQ2FsbHM6IHsgcmVwb3NpdG9yeVJvb3Q6IFVSSTsgd29ya3RyZWU6IFVSSTsgZ2xvYnM6IHJlYWRvbmx5IHN0cmluZ1tdIH1bXTtcblx0bGV0IGNvcHlJbmNsdWRlRXJyb3I6IEVycm9yIHwgdW5kZWZpbmVkO1xuXHRsZXQgYnJhbmNoTmFtZTogc3RyaW5nO1xuXHRsZXQgaGFzVW5jb21taXR0ZWRDaGFuZ2VzOiBib29sZWFuO1xuXHRsZXQgYnJhbmNoRXhpc3RzOiBib29sZWFuO1xuXHRsZXQgaGVhZENvbW1pdDogc3RyaW5nIHwgdW5kZWZpbmVkO1xuXG5cdGNvbnN0IHNlc3Npb25VcmkgPSBVUkkucGFyc2UoJ2FnZW50LXNlc3Npb246Ly90ZXN0L3MxJyk7XG5cdGNvbnN0IHNlc3Npb25JZCA9ICdzMSc7XG5cblx0ZnVuY3Rpb24gY3JlYXRlR2l0U2VydmljZSgpOiBJQWdlbnRIb3N0R2l0U2VydmljZSB7XG5cdFx0cmV0dXJuIHtcblx0XHRcdC4uLmNyZWF0ZU5vb3BHaXRTZXJ2aWNlKCksXG5cdFx0XHRnZXRSZXBvc2l0b3J5Um9vdDogYXN5bmMgKCkgPT4gcmVwb1Jvb3QsXG5cdFx0XHRyZXZQYXJzZTogYXN5bmMgKF9yb290LCBleHByKSA9PiBleHByID09PSAnSEVBRCcgPyBoZWFkQ29tbWl0IDogdW5kZWZpbmVkLFxuXHRcdFx0Z2V0Q3VycmVudEJyYW5jaDogYXN5bmMgKCkgPT4gJ2ZlYXR1cmUnLFxuXHRcdFx0Z2V0RGVmYXVsdEJyYW5jaDogYXN5bmMgKCkgPT4gKHsgbmFtZTogJ21haW4nLCBzdGFydFBvaW50OiAnbWFpbicgfSksXG5cdFx0XHRnZXRCcmFuY2hlczogYXN5bmMgKCkgPT4gW1xuXHRcdFx0XHR7IHJlZjogJ3JlZnMvaGVhZHMvbWFpbicsIG5hbWU6ICdtYWluJywga2luZDogR2l0UmVmVHlwZS5IZWFkIH0sXG5cdFx0XHRcdHsgcmVmOiAncmVmcy9oZWFkcy9mZWF0dXJlJywgbmFtZTogJ2ZlYXR1cmUnLCBraW5kOiBHaXRSZWZUeXBlLkhlYWQgfSxcblx0XHRcdF0sXG5cdFx0XHRicmFuY2hFeGlzdHM6IGFzeW5jICgpID0+IGJyYW5jaEV4aXN0cyxcblx0XHRcdGhhc1VuY29tbWl0dGVkQ2hhbmdlczogYXN5bmMgKCkgPT4gaGFzVW5jb21taXR0ZWRDaGFuZ2VzLFxuXHRcdFx0YWRkV29ya3RyZWU6IGFzeW5jIChfcm9vdCwgd29ya3RyZWUsIGJyYW5jaCwgc3RhcnRQb2ludCwgdHJhY2spID0+IHtcblx0XHRcdFx0YWRkV29ya3RyZWVDYWxscy5wdXNoKHsgd29ya3RyZWUsIGJyYW5jaE5hbWU6IGJyYW5jaCwgc3RhcnRQb2ludCwgdHJhY2sgfSk7XG5cdFx0XHRcdG1rZGlyU3luYyh3b3JrdHJlZS5mc1BhdGgsIHsgcmVjdXJzaXZlOiB0cnVlIH0pO1xuXHRcdFx0fSxcblx0XHRcdGNvcHlXb3JrdHJlZUluY2x1ZGVGaWxlczogYXN5bmMgKHJlcG9zaXRvcnlSb290LCB3b3JrdHJlZSwgZ2xvYnMpID0+IHtcblx0XHRcdFx0Y29weUluY2x1ZGVDYWxscy5wdXNoKHsgcmVwb3NpdG9yeVJvb3QsIHdvcmt0cmVlLCBnbG9iczogWy4uLmdsb2JzXSB9KTtcblx0XHRcdFx0aWYgKGNvcHlJbmNsdWRlRXJyb3IpIHtcblx0XHRcdFx0XHR0aHJvdyBjb3B5SW5jbHVkZUVycm9yO1xuXHRcdFx0XHR9XG5cdFx0XHR9LFxuXHRcdFx0YWRkRXhpc3RpbmdXb3JrdHJlZTogYXN5bmMgKF9yb290LCB3b3JrdHJlZSwgYnJhbmNoKSA9PiB7XG5cdFx0XHRcdGFkZEV4aXN0aW5nQ2FsbHMucHVzaCh7IHdvcmt0cmVlLCBicmFuY2hOYW1lOiBicmFuY2ggfSk7XG5cdFx0XHRcdG1rZGlyU3luYyh3b3JrdHJlZS5mc1BhdGgsIHsgcmVjdXJzaXZlOiB0cnVlIH0pO1xuXHRcdFx0fSxcblx0XHRcdHJlbW92ZVdvcmt0cmVlOiBhc3luYyAoX3Jvb3QsIHdvcmt0cmVlLCBvcHRpb25zKSA9PiB7XG5cdFx0XHRcdHJlbW92ZUNhbGxzLnB1c2goeyB3b3JrdHJlZSwgZm9yY2U6IG9wdGlvbnM/LmZvcmNlID09PSB0cnVlIH0pO1xuXHRcdFx0XHRybVN5bmMod29ya3RyZWUuZnNQYXRoLCB7IHJlY3Vyc2l2ZTogdHJ1ZSwgZm9yY2U6IHRydWUgfSk7XG5cdFx0XHR9LFxuXHRcdH07XG5cdH1cblxuXHRmdW5jdGlvbiBjcmVhdGVJc29sYXRpb24oZGlzcG9zYWJsZVN0b3JlOiBQaWNrPERpc3Bvc2FibGVTdG9yZSwgJ2FkZCc+LCBvcHRpb25zPzogeyByZWFkb25seSBicmFuY2hOYW1lR2VuZXJhdG9yPzogSUFnZW50QnJhbmNoTmFtZUdlbmVyYXRvcjsgcmVhZG9ubHkgZ2l0U2VydmljZT86IElBZ2VudEhvc3RHaXRTZXJ2aWNlIH0pOiBXb3JrdHJlZUlzb2xhdGlvbiB7XG5cdFx0Y29uc3QgYnJhbmNoTmFtZUdlbmVyYXRvciA9IG9wdGlvbnM/LmJyYW5jaE5hbWVHZW5lcmF0b3IgPz8ge1xuXHRcdFx0Z2VuZXJhdGVCcmFuY2hOYW1lOiBhc3luYyAoKSA9PiBicmFuY2hOYW1lLFxuXHRcdH07XG5cdFx0cmV0dXJuIGRpc3Bvc2FibGVTdG9yZS5hZGQobmV3IFdvcmt0cmVlSXNvbGF0aW9uKFxuXHRcdFx0YnJhbmNoTmFtZUdlbmVyYXRvcixcblx0XHRcdG9wdGlvbnM/LmdpdFNlcnZpY2UgPz8gY3JlYXRlR2l0U2VydmljZSgpLFxuXHRcdFx0Y3JlYXRlTnVsbENvcGlsb3RBcGlTZXJ2aWNlKCksXG5cdFx0XHRjcmVhdGVTZXNzaW9uRGF0YVNlcnZpY2UoZGIpLFxuXHRcdFx0bmV3IE51bGxMb2dTZXJ2aWNlKCksXG5cdFx0KSk7XG5cdH1cblxuXHRzZXR1cCgoKSA9PiB7XG5cdFx0cmVwb1Jvb3QgPSBVUkkuZmlsZShta2R0ZW1wU3luYyhqb2luKHRtcGRpcigpLCAnd3QtaXNvLScpKSk7XG5cdFx0d29ya3RyZWVzUm9vdCA9IGdldFdvcmt0cmVlc1Jvb3QocmVwb1Jvb3QpO1xuXHRcdGRiID0gbmV3IFRlc3RTZXNzaW9uRGF0YWJhc2UoKTtcblx0XHRhZGRXb3JrdHJlZUNhbGxzID0gW107XG5cdFx0YWRkRXhpc3RpbmdDYWxscyA9IFtdO1xuXHRcdHJlbW92ZUNhbGxzID0gW107XG5cdFx0Y29weUluY2x1ZGVDYWxscyA9IFtdO1xuXHRcdGNvcHlJbmNsdWRlRXJyb3IgPSB1bmRlZmluZWQ7XG5cdFx0YnJhbmNoTmFtZSA9ICdhZ2VudHMvbXktZmVhdHVyZSc7XG5cdFx0aGFzVW5jb21taXR0ZWRDaGFuZ2VzID0gZmFsc2U7XG5cdFx0YnJhbmNoRXhpc3RzID0gdHJ1ZTtcblx0XHRoZWFkQ29tbWl0ID0gJ2FiYzEyMyc7XG5cdH0pO1xuXG5cdHRlYXJkb3duKCgpID0+IHtcblx0XHRybVN5bmMocmVwb1Jvb3QuZnNQYXRoLCB7IHJlY3Vyc2l2ZTogdHJ1ZSwgZm9yY2U6IHRydWUgfSk7XG5cdFx0cm1TeW5jKHdvcmt0cmVlc1Jvb3QuZnNQYXRoLCB7IHJlY3Vyc2l2ZTogdHJ1ZSwgZm9yY2U6IHRydWUgfSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2dldFdvcmt0cmVlc1Jvb3QgLyBnZXRXb3JrdHJlZU5hbWUgZGVyaXZlIHNpYmxpbmcgcGF0aHMgYW5kIHN0cmlwIHRoZSBhZ2VudHMvIHByZWZpeCcsICgpID0+IHtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdHJvb3Q6IGdldFdvcmt0cmVlc1Jvb3QoVVJJLmZpbGUoJy9zcmMvdnNjb2RlJykpLmZzUGF0aCxcblx0XHRcdG5hbWVkOiBnZXRXb3JrdHJlZU5hbWUoJ2FnZW50cy9hZGQtY29uZmlnJyksXG5cdFx0XHRuYW1lZEZsYXR0ZW5lZDogZ2V0V29ya3RyZWVOYW1lKCdhZ2VudHMvZmVhdHVyZS9zdWItdG9waWMnKSxcblx0XHRcdG5hbWVkTm9QcmVmaXg6IGdldFdvcmt0cmVlTmFtZSgncGxhaW4tYnJhbmNoJyksXG5cdFx0XHRuYW1lZFdpdGhCcmFuY2hQcmVmaXg6IGdldFdvcmt0cmVlTmFtZSgndXNlcnMvYWxpY2UvYWdlbnRzL2FkZC1jb25maWcnLCAndXNlcnMvYWxpY2UvJyksXG5cdFx0fSwge1xuXHRcdFx0cm9vdDogVVJJLmZpbGUoJy9zcmMvdnNjb2RlLndvcmt0cmVlcycpLmZzUGF0aCxcblx0XHRcdG5hbWVkOiAnYWRkLWNvbmZpZycsXG5cdFx0XHRuYW1lZEZsYXR0ZW5lZDogJ2ZlYXR1cmUtc3ViLXRvcGljJyxcblx0XHRcdG5hbWVkTm9QcmVmaXg6ICdwbGFpbi1icmFuY2gnLFxuXHRcdFx0bmFtZWRXaXRoQnJhbmNoUHJlZml4OiAnYWRkLWNvbmZpZycsXG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3Jlc29sdmVJc29sYXRpb25Db25maWcgYWR2ZXJ0aXNlcyBmb2xkZXIvd29ya3RyZWUgKyBicmFuY2ggYmFzZWQgb24gZ2l0IHN0YXRlJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IGlzb2xhdGlvbiA9IGNyZWF0ZUlzb2xhdGlvbihkaXNwb3NhYmxlcyk7XG5cblx0XHRjb25zdCBub1JlcG8gPSBhd2FpdCBpc29sYXRpb24ucmVzb2x2ZUlzb2xhdGlvbkNvbmZpZyh7IHdvcmtpbmdEaXJlY3Rvcnk6IHVuZGVmaW5lZCwgY29uZmlnOiB1bmRlZmluZWQgfSk7XG5cdFx0Y29uc3QgcmVwb1dvcmt0cmVlID0gYXdhaXQgaXNvbGF0aW9uLnJlc29sdmVJc29sYXRpb25Db25maWcoeyB3b3JraW5nRGlyZWN0b3J5OiByZXBvUm9vdCwgY29uZmlnOiB1bmRlZmluZWQgfSk7XG5cdFx0Y29uc3QgcmVwb1dvcmt0cmVlU2VsZWN0ZWQgPSBhd2FpdCBpc29sYXRpb24ucmVzb2x2ZUlzb2xhdGlvbkNvbmZpZyh7IHdvcmtpbmdEaXJlY3Rvcnk6IHJlcG9Sb290LCBjb25maWc6IHsgW1Nlc3Npb25Db25maWdLZXkuSXNvbGF0aW9uXTogJ3dvcmt0cmVlJywgW1Nlc3Npb25Db25maWdLZXkuQnJhbmNoXTogJ2ZlYXR1cmUnIH0gfSk7XG5cdFx0Y29uc3QgcmVwb0ZvbGRlciA9IGF3YWl0IGlzb2xhdGlvbi5yZXNvbHZlSXNvbGF0aW9uQ29uZmlnKHsgd29ya2luZ0RpcmVjdG9yeTogcmVwb1Jvb3QsIGNvbmZpZzogeyBbU2Vzc2lvbkNvbmZpZ0tleS5Jc29sYXRpb25dOiAnZm9sZGVyJyB9IH0pO1xuXHRcdGhlYWRDb21taXQgPSB1bmRlZmluZWQ7IC8vIHVuYm9ybiBIRUFEIChubyBjb21taXRzKVxuXHRcdGNvbnN0IG5vQ29tbWl0cyA9IGF3YWl0IGlzb2xhdGlvbi5yZXNvbHZlSXNvbGF0aW9uQ29uZmlnKHsgd29ya2luZ0RpcmVjdG9yeTogcmVwb1Jvb3QsIGNvbmZpZzogdW5kZWZpbmVkIH0pO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRub1JlcG86IHsgZW51bTogbm9SZXBvLmlzb2xhdGlvblByb3BlcnR5LnByb3RvY29sLmVudW0sIHZhbHVlOiBub1JlcG8uaXNvbGF0aW9uVmFsdWUsIGJyYW5jaDogbm9SZXBvLmJyYW5jaFByb3BlcnR5LCBwcmVmaXg6IG5vUmVwby53b3JrdHJlZUJyYW5jaFByZWZpeFByb3BlcnR5LCBpbmNsdWRlRmlsZXM6IG5vUmVwby53b3JrdHJlZUluY2x1ZGVGaWxlc1Byb3BlcnR5LCBicmFuY2hUcmFjazogbm9SZXBvLndvcmt0cmVlQnJhbmNoVHJhY2tQcm9wZXJ0eSB9LFxuXHRcdFx0cmVwb1dvcmt0cmVlOiB7IGVudW06IHJlcG9Xb3JrdHJlZS5pc29sYXRpb25Qcm9wZXJ0eS5wcm90b2NvbC5lbnVtLCB2YWx1ZTogcmVwb1dvcmt0cmVlLmlzb2xhdGlvblZhbHVlLCBicmFuY2hEZWZhdWx0OiByZXBvV29ya3RyZWUuYnJhbmNoRGVmYXVsdCwgYnJhbmNoUmVhZE9ubHk6IHJlcG9Xb3JrdHJlZS5icmFuY2hQcm9wZXJ0eT8ucHJvdG9jb2wucmVhZE9ubHksIHByZWZpeFJlYWRPbmx5OiByZXBvV29ya3RyZWUud29ya3RyZWVCcmFuY2hQcmVmaXhQcm9wZXJ0eT8ucHJvdG9jb2wucmVhZE9ubHksIGluY2x1ZGVGaWxlc1JlYWRPbmx5OiByZXBvV29ya3RyZWUud29ya3RyZWVJbmNsdWRlRmlsZXNQcm9wZXJ0eT8ucHJvdG9jb2wucmVhZE9ubHksIGJyYW5jaFRyYWNrUmVhZE9ubHk6IHJlcG9Xb3JrdHJlZS53b3JrdHJlZUJyYW5jaFRyYWNrUHJvcGVydHk/LnByb3RvY29sLnJlYWRPbmx5IH0sXG5cdFx0XHRyZXBvV29ya3RyZWVTZWxlY3RlZDogeyBicmFuY2hEZWZhdWx0OiByZXBvV29ya3RyZWVTZWxlY3RlZC5icmFuY2hEZWZhdWx0LCBicmFuY2hWYWx1ZTogcmVwb1dvcmt0cmVlU2VsZWN0ZWQuYnJhbmNoVmFsdWUsIGJyYW5jaEVudW06IHJlcG9Xb3JrdHJlZVNlbGVjdGVkLmJyYW5jaFByb3BlcnR5Py5wcm90b2NvbC5lbnVtIH0sXG5cdFx0XHRyZXBvRm9sZGVyOiB7IHZhbHVlOiByZXBvRm9sZGVyLmlzb2xhdGlvblZhbHVlLCBicmFuY2hEZWZhdWx0OiByZXBvRm9sZGVyLmJyYW5jaERlZmF1bHQsIGJyYW5jaFJlYWRPbmx5OiByZXBvRm9sZGVyLmJyYW5jaFByb3BlcnR5Py5wcm90b2NvbC5yZWFkT25seSwgaGFzUHJlZml4OiAhIXJlcG9Gb2xkZXIud29ya3RyZWVCcmFuY2hQcmVmaXhQcm9wZXJ0eSwgaGFzSW5jbHVkZUZpbGVzOiAhIXJlcG9Gb2xkZXIud29ya3RyZWVJbmNsdWRlRmlsZXNQcm9wZXJ0eSwgaGFzQnJhbmNoVHJhY2s6ICEhcmVwb0ZvbGRlci53b3JrdHJlZUJyYW5jaFRyYWNrUHJvcGVydHkgfSxcblx0XHRcdG5vQ29tbWl0czogeyBlbnVtOiBub0NvbW1pdHMuaXNvbGF0aW9uUHJvcGVydHkucHJvdG9jb2wuZW51bSwgdmFsdWU6IG5vQ29tbWl0cy5pc29sYXRpb25WYWx1ZSwgYnJhbmNoOiBub0NvbW1pdHMuYnJhbmNoUHJvcGVydHksIHByZWZpeDogbm9Db21taXRzLndvcmt0cmVlQnJhbmNoUHJlZml4UHJvcGVydHksIGluY2x1ZGVGaWxlczogbm9Db21taXRzLndvcmt0cmVlSW5jbHVkZUZpbGVzUHJvcGVydHksIGJyYW5jaFRyYWNrOiBub0NvbW1pdHMud29ya3RyZWVCcmFuY2hUcmFja1Byb3BlcnR5IH0sXG5cdFx0fSwge1xuXHRcdFx0bm9SZXBvOiB7IGVudW06IFsnZm9sZGVyJ10sIHZhbHVlOiAnZm9sZGVyJywgYnJhbmNoOiB1bmRlZmluZWQsIHByZWZpeDogdW5kZWZpbmVkLCBpbmNsdWRlRmlsZXM6IHVuZGVmaW5lZCwgYnJhbmNoVHJhY2s6IHVuZGVmaW5lZCB9LFxuXHRcdFx0cmVwb1dvcmt0cmVlOiB7IGVudW06IFsnZm9sZGVyJywgJ3dvcmt0cmVlJ10sIHZhbHVlOiAnd29ya3RyZWUnLCBicmFuY2hEZWZhdWx0OiAnbWFpbicsIGJyYW5jaFJlYWRPbmx5OiBmYWxzZSwgcHJlZml4UmVhZE9ubHk6IHRydWUsIGluY2x1ZGVGaWxlc1JlYWRPbmx5OiB0cnVlLCBicmFuY2hUcmFja1JlYWRPbmx5OiB0cnVlIH0sXG5cdFx0XHRyZXBvV29ya3RyZWVTZWxlY3RlZDogeyBicmFuY2hEZWZhdWx0OiAnbWFpbicsIGJyYW5jaFZhbHVlOiAnZmVhdHVyZScsIGJyYW5jaEVudW06IFsnbWFpbiddIH0sXG5cdFx0XHRyZXBvRm9sZGVyOiB7IHZhbHVlOiAnZm9sZGVyJywgYnJhbmNoRGVmYXVsdDogJ2ZlYXR1cmUnLCBicmFuY2hSZWFkT25seTogdHJ1ZSwgaGFzUHJlZml4OiB0cnVlLCBoYXNJbmNsdWRlRmlsZXM6IHRydWUsIGhhc0JyYW5jaFRyYWNrOiB0cnVlIH0sXG5cdFx0XHRub0NvbW1pdHM6IHsgZW51bTogWydmb2xkZXInXSwgdmFsdWU6ICdmb2xkZXInLCBicmFuY2g6IHVuZGVmaW5lZCwgcHJlZml4OiB1bmRlZmluZWQsIGluY2x1ZGVGaWxlczogdW5kZWZpbmVkLCBicmFuY2hUcmFjazogdW5kZWZpbmVkIH0sXG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2JyYW5jaENvbXBsZXRpb25zIHJldHVybnMgY3VycmVudCB0aGVuIGRlZmF1bHQgdGhlbiByZWNlbnQgZ2l0IGJyYW5jaGVzLCBlbXB0eSB3aXRob3V0IGEgd29ya2luZyBkaXJlY3RvcnknLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgaXNvbGF0aW9uID0gY3JlYXRlSXNvbGF0aW9uKGRpc3Bvc2FibGVzKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdHdpdGhEaXI6IGF3YWl0IGlzb2xhdGlvbi5icmFuY2hDb21wbGV0aW9ucyhyZXBvUm9vdCksXG5cdFx0XHRub0RpcjogYXdhaXQgaXNvbGF0aW9uLmJyYW5jaENvbXBsZXRpb25zKHVuZGVmaW5lZCksXG5cdFx0fSwge1xuXHRcdFx0d2l0aERpcjogeyBpdGVtczogW3sgdmFsdWU6ICdmZWF0dXJlJywgbGFiZWw6ICdmZWF0dXJlJyB9LCB7IHZhbHVlOiAnbWFpbicsIGxhYmVsOiAnbWFpbicgfV0gfSxcblx0XHRcdG5vRGlyOiB7IGl0ZW1zOiBbXSB9LFxuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCd1c2VzIHRoZSBsb2NhbCBkZWZhdWx0IGJyYW5jaCBuYW1lIGluIGNvbmZpZyBhbmQgaXRzIHJlbW90ZSByZWYgYXMgdGhlIHdvcmt0cmVlIHN0YXJ0IHBvaW50JywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IGdpdFNlcnZpY2UgPSBjcmVhdGVHaXRTZXJ2aWNlKCk7XG5cdFx0Z2l0U2VydmljZS5nZXREZWZhdWx0QnJhbmNoID0gYXN5bmMgKCkgPT4gKHsgbmFtZTogJ21haW4nLCBzdGFydFBvaW50OiAnb3JpZ2luL21haW4nIH0pO1xuXHRcdGNvbnN0IGlzb2xhdGlvbiA9IGNyZWF0ZUlzb2xhdGlvbihkaXNwb3NhYmxlcywgeyBnaXRTZXJ2aWNlIH0pO1xuXG5cdFx0Y29uc3QgY29uZmlnID0gYXdhaXQgaXNvbGF0aW9uLnJlc29sdmVJc29sYXRpb25Db25maWcoeyB3b3JraW5nRGlyZWN0b3J5OiByZXBvUm9vdCwgY29uZmlnOiB1bmRlZmluZWQgfSk7XG5cdFx0YXdhaXQgaXNvbGF0aW9uLnJlc29sdmVXb3JraW5nRGlyZWN0b3J5KHtcblx0XHRcdHNlc3Npb25VcmksXG5cdFx0XHRzZXNzaW9uSWQsXG5cdFx0XHR3b3JraW5nRGlyZWN0b3J5OiByZXBvUm9vdCxcblx0XHRcdGNvbmZpZzoge1xuXHRcdFx0XHRbU2Vzc2lvbkNvbmZpZ0tleS5Jc29sYXRpb25dOiAnd29ya3RyZWUnLFxuXHRcdFx0XHRbU2Vzc2lvbkNvbmZpZ0tleS5CcmFuY2hdOiAnbWFpbicsXG5cdFx0XHR9LFxuXHRcdFx0cHJvbXB0OiAnZG8gYSB0aGluZycsXG5cdFx0fSk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdGJyYW5jaERlZmF1bHQ6IGNvbmZpZy5icmFuY2hEZWZhdWx0LFxuXHRcdFx0YnJhbmNoRW51bTogY29uZmlnLmJyYW5jaFByb3BlcnR5Py5wcm90b2NvbC5lbnVtLFxuXHRcdFx0c3RhcnRQb2ludDogYWRkV29ya3RyZWVDYWxsc1swXT8uc3RhcnRQb2ludCxcblx0XHR9LCB7XG5cdFx0XHRicmFuY2hEZWZhdWx0OiAnbWFpbicsXG5cdFx0XHRicmFuY2hFbnVtOiBbJ21haW4nXSxcblx0XHRcdHN0YXJ0UG9pbnQ6ICdvcmlnaW4vbWFpbicsXG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3Jlc29sdmVXb3JraW5nRGlyZWN0b3J5IGNyZWF0ZXMgYSB3b3JrdHJlZSwgcGVyc2lzdHMgbWV0YWRhdGEsIHF1ZXVlcyB0aGUgYW5ub3VuY2VtZW50LCBhbmQgaXMgaWRlbXBvdGVudCcsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBpc29sYXRpb24gPSBjcmVhdGVJc29sYXRpb24oZGlzcG9zYWJsZXMpO1xuXHRcdGNvbnN0IGNvbmZpZyA9IHsgW1Nlc3Npb25Db25maWdLZXkuSXNvbGF0aW9uXTogJ3dvcmt0cmVlJywgW1Nlc3Npb25Db25maWdLZXkuQnJhbmNoXTogJ21haW4nIH07XG5cblx0XHRjb25zdCBmaXJzdCA9IGF3YWl0IGlzb2xhdGlvbi5yZXNvbHZlV29ya2luZ0RpcmVjdG9yeSh7IHNlc3Npb25VcmksIHNlc3Npb25JZCwgd29ya2luZ0RpcmVjdG9yeTogcmVwb1Jvb3QsIGNvbmZpZywgcHJvbXB0OiAnZG8gYSB0aGluZycgfSk7XG5cdFx0Y29uc3QgbWV0YSA9IGF3YWl0IGlzb2xhdGlvbi5yZWFkV29ya3RyZWVNZXRhZGF0YShzZXNzaW9uVXJpKTtcblx0XHRjb25zdCBhbm5vdW5jZW1lbnQgPSBpc29sYXRpb24udGFrZVBlbmRpbmdBbm5vdW5jZW1lbnQoc2Vzc2lvbklkKTtcblx0XHRjb25zdCBzZWNvbmQgPSBhd2FpdCBpc29sYXRpb24ucmVzb2x2ZVdvcmtpbmdEaXJlY3RvcnkoeyBzZXNzaW9uVXJpLCBzZXNzaW9uSWQsIHdvcmtpbmdEaXJlY3Rvcnk6IHJlcG9Sb290LCBjb25maWcsIHByb21wdDogJ2RvIGEgdGhpbmcnIH0pO1xuXG5cdFx0Y29uc3QgZXhwZWN0ZWRXb3JrdHJlZSA9IFVSSS5qb2luUGF0aCh3b3JrdHJlZXNSb290LCBnZXRXb3JrdHJlZU5hbWUoYnJhbmNoTmFtZSkpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0cmV0dXJuZWRXb3JrdHJlZTogZmlyc3QhLnRvU3RyaW5nKCksXG5cdFx0XHRhZGRXb3JrdHJlZUNhbGxDb3VudDogYWRkV29ya3RyZWVDYWxscy5sZW5ndGgsXG5cdFx0XHRhZGRXb3JrdHJlZUFyZ3M6IGFkZFdvcmt0cmVlQ2FsbHMubWFwKGMgPT4gKHsgd29ya3RyZWU6IGMud29ya3RyZWUudG9TdHJpbmcoKSwgYnJhbmNoTmFtZTogYy5icmFuY2hOYW1lLCBzdGFydFBvaW50OiBjLnN0YXJ0UG9pbnQgfSkpLFxuXHRcdFx0bWV0YUJyYW5jaDogbWV0YT8uYnJhbmNoTmFtZSxcblx0XHRcdG1ldGFXb3JrdHJlZTogbWV0YT8ud29ya3RyZWVQYXRoPy50b1N0cmluZygpLFxuXHRcdFx0bWV0YVJlcG86IG1ldGE/LnJlcG9zaXRvcnlSb290Py50b1N0cmluZygpLFxuXHRcdFx0YW5ub3VuY2VtZW50SGFzQnJhbmNoOiBhbm5vdW5jZW1lbnQ/LmluY2x1ZGVzKGJyYW5jaE5hbWUpID8/IGZhbHNlLFxuXHRcdFx0c2Vjb25kVGFrZUFubm91bmNlbWVudDogaXNvbGF0aW9uLnRha2VQZW5kaW5nQW5ub3VuY2VtZW50KHNlc3Npb25JZCksXG5cdFx0XHRpZGVtcG90ZW50UmV0dXJuOiBzZWNvbmQhLnRvU3RyaW5nKCksXG5cdFx0XHRyZXNvbHZlZFdvcmt0cmVlOiBpc29sYXRpb24uZ2V0UmVzb2x2ZWRXb3JrdHJlZShzZXNzaW9uSWQpPy50b1N0cmluZygpLFxuXHRcdH0sIHtcblx0XHRcdHJldHVybmVkV29ya3RyZWU6IGV4cGVjdGVkV29ya3RyZWUudG9TdHJpbmcoKSxcblx0XHRcdGFkZFdvcmt0cmVlQ2FsbENvdW50OiAxLFxuXHRcdFx0YWRkV29ya3RyZWVBcmdzOiBbeyB3b3JrdHJlZTogZXhwZWN0ZWRXb3JrdHJlZS50b1N0cmluZygpLCBicmFuY2hOYW1lLCBzdGFydFBvaW50OiAnbWFpbicgfV0sXG5cdFx0XHRtZXRhQnJhbmNoOiBicmFuY2hOYW1lLFxuXHRcdFx0bWV0YVdvcmt0cmVlOiBleHBlY3RlZFdvcmt0cmVlLnRvU3RyaW5nKCksXG5cdFx0XHRtZXRhUmVwbzogcmVwb1Jvb3QudG9TdHJpbmcoKSxcblx0XHRcdGFubm91bmNlbWVudEhhc0JyYW5jaDogdHJ1ZSxcblx0XHRcdHNlY29uZFRha2VBbm5vdW5jZW1lbnQ6IHVuZGVmaW5lZCxcblx0XHRcdGlkZW1wb3RlbnRSZXR1cm46IGV4cGVjdGVkV29ya3RyZWUudG9TdHJpbmcoKSxcblx0XHRcdHJlc29sdmVkV29ya3RyZWU6IGV4cGVjdGVkV29ya3RyZWUudG9TdHJpbmcoKSxcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgncmVzb2x2ZVdvcmtpbmdEaXJlY3RvcnkgY3JlYXRlcyBmcm9tIHRoZSBwcmltYXJ5IHdvcmt0cmVlIHdoaWxlIGNvcHlpbmcgaW5jbHVkZSBmaWxlcyBmcm9tIHRoZSBzZWxlY3RlZCBjaGVja291dCcsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBjaGVja291dFJvb3QgPSBVUkkuam9pblBhdGgocmVwb1Jvb3QsICdsaW5rZWQtY2hlY2tvdXQnKTtcblx0XHRjb25zdCBnaXRTZXJ2aWNlID0gY3JlYXRlR2l0U2VydmljZSgpO1xuXHRcdGxldCBhZGRXb3JrdHJlZVJvb3Q6IFVSSSB8IHVuZGVmaW5lZDtcblx0XHRnaXRTZXJ2aWNlLmdldFJlcG9zaXRvcnlSb290ID0gYXN5bmMgKCkgPT4gY2hlY2tvdXRSb290O1xuXHRcdGdpdFNlcnZpY2UuZ2V0V29ya3RyZWVSb290cyA9IGFzeW5jICgpID0+IFtyZXBvUm9vdCwgY2hlY2tvdXRSb290XTtcblx0XHRnaXRTZXJ2aWNlLmFkZFdvcmt0cmVlID0gYXN5bmMgKHJlcG9zaXRvcnlSb290LCB3b3JrdHJlZSwgYnJhbmNoLCBzdGFydFBvaW50LCB0cmFjaykgPT4ge1xuXHRcdFx0YWRkV29ya3RyZWVSb290ID0gcmVwb3NpdG9yeVJvb3Q7XG5cdFx0XHRhZGRXb3JrdHJlZUNhbGxzLnB1c2goeyB3b3JrdHJlZSwgYnJhbmNoTmFtZTogYnJhbmNoLCBzdGFydFBvaW50LCB0cmFjayB9KTtcblx0XHRcdG1rZGlyU3luYyh3b3JrdHJlZS5mc1BhdGgsIHsgcmVjdXJzaXZlOiB0cnVlIH0pO1xuXHRcdH07XG5cdFx0Y29uc3QgaXNvbGF0aW9uID0gY3JlYXRlSXNvbGF0aW9uKGRpc3Bvc2FibGVzLCB7IGdpdFNlcnZpY2UgfSk7XG5cdFx0Y29uc3QgaW5jbHVkZUZpbGVzID0gWycuZW52J107XG5cblx0XHRjb25zdCB3b3JrdHJlZSA9IGF3YWl0IGlzb2xhdGlvbi5yZXNvbHZlV29ya2luZ0RpcmVjdG9yeSh7XG5cdFx0XHRzZXNzaW9uVXJpLFxuXHRcdFx0c2Vzc2lvbklkLFxuXHRcdFx0d29ya2luZ0RpcmVjdG9yeTogY2hlY2tvdXRSb290LFxuXHRcdFx0Y29uZmlnOiB7XG5cdFx0XHRcdFtTZXNzaW9uQ29uZmlnS2V5Lklzb2xhdGlvbl06ICd3b3JrdHJlZScsXG5cdFx0XHRcdFtTZXNzaW9uQ29uZmlnS2V5LkJyYW5jaF06ICdtYWluJyxcblx0XHRcdFx0W1Nlc3Npb25Db25maWdLZXkuV29ya3RyZWVJbmNsdWRlRmlsZXNdOiBpbmNsdWRlRmlsZXMsXG5cdFx0XHR9LFxuXHRcdH0pO1xuXHRcdGNvbnN0IG1ldGEgPSBhd2FpdCBpc29sYXRpb24ucmVhZFdvcmt0cmVlTWV0YWRhdGEoc2Vzc2lvblVyaSk7XG5cdFx0Y29uc3QgcHJvamVjdCA9IGlzb2xhdGlvbi5zZXNzaW9uV29ya3RyZWVQcm9qZWN0KHNlc3Npb25JZCk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdHdvcmt0cmVlOiB3b3JrdHJlZT8udG9TdHJpbmcoKSxcblx0XHRcdGFkZFdvcmt0cmVlUm9vdDogYWRkV29ya3RyZWVSb290Py50b1N0cmluZygpLFxuXHRcdFx0aW5jbHVkZUZpbGVSb290OiBjb3B5SW5jbHVkZUNhbGxzWzBdPy5yZXBvc2l0b3J5Um9vdC50b1N0cmluZygpLFxuXHRcdFx0bWV0YVJlcG9zaXRvcnlSb290OiBtZXRhPy5yZXBvc2l0b3J5Um9vdD8udG9TdHJpbmcoKSxcblx0XHRcdHByb2plY3Q6IHByb2plY3QgJiYgeyB1cmk6IHByb2plY3QudXJpLnRvU3RyaW5nKCksIGRpc3BsYXlOYW1lOiBwcm9qZWN0LmRpc3BsYXlOYW1lIH0sXG5cdFx0fSwge1xuXHRcdFx0d29ya3RyZWU6IFVSSS5qb2luUGF0aCh3b3JrdHJlZXNSb290LCBnZXRXb3JrdHJlZU5hbWUoYnJhbmNoTmFtZSkpLnRvU3RyaW5nKCksXG5cdFx0XHRhZGRXb3JrdHJlZVJvb3Q6IHJlcG9Sb290LnRvU3RyaW5nKCksXG5cdFx0XHRpbmNsdWRlRmlsZVJvb3Q6IGNoZWNrb3V0Um9vdC50b1N0cmluZygpLFxuXHRcdFx0bWV0YVJlcG9zaXRvcnlSb290OiByZXBvUm9vdC50b1N0cmluZygpLFxuXHRcdFx0cHJvamVjdDogeyB1cmk6IHJlcG9Sb290LnRvU3RyaW5nKCksIGRpc3BsYXlOYW1lOiBiYXNlbmFtZShyZXBvUm9vdCkgfSxcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgncmVzb2x2ZVdvcmtpbmdEaXJlY3RvcnkgZmFsbHMgYmFjayB0byB0aGUgc2VsZWN0ZWQgY2hlY2tvdXQgd2hlbiBwcmltYXJ5IHdvcmt0cmVlIHJlc29sdXRpb24gZmFpbHMnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgY2hlY2tvdXRSb290ID0gVVJJLmpvaW5QYXRoKHJlcG9Sb290LCAnbGlua2VkLWNoZWNrb3V0Jyk7XG5cdFx0Y29uc3QgZ2l0U2VydmljZSA9IGNyZWF0ZUdpdFNlcnZpY2UoKTtcblx0XHRnaXRTZXJ2aWNlLmdldFJlcG9zaXRvcnlSb290ID0gYXN5bmMgKCkgPT4gY2hlY2tvdXRSb290O1xuXHRcdGdpdFNlcnZpY2UuZ2V0V29ya3RyZWVSb290cyA9IGFzeW5jICgpID0+IHsgdGhyb3cgbmV3IEVycm9yKCd3b3JrdHJlZSBlbnVtZXJhdGlvbiBmYWlsZWQnKTsgfTtcblx0XHRjb25zdCBpc29sYXRpb24gPSBjcmVhdGVJc29sYXRpb24oZGlzcG9zYWJsZXMsIHsgZ2l0U2VydmljZSB9KTtcblxuXHRcdGNvbnN0IHdvcmt0cmVlID0gYXdhaXQgaXNvbGF0aW9uLnJlc29sdmVXb3JraW5nRGlyZWN0b3J5KHtcblx0XHRcdHNlc3Npb25VcmksXG5cdFx0XHRzZXNzaW9uSWQsXG5cdFx0XHR3b3JraW5nRGlyZWN0b3J5OiBjaGVja291dFJvb3QsXG5cdFx0XHRjb25maWc6IHsgW1Nlc3Npb25Db25maWdLZXkuSXNvbGF0aW9uXTogJ3dvcmt0cmVlJywgW1Nlc3Npb25Db25maWdLZXkuQnJhbmNoXTogJ21haW4nIH0sXG5cdFx0fSk7XG5cdFx0Y29uc3QgbWV0YSA9IGF3YWl0IGlzb2xhdGlvbi5yZWFkV29ya3RyZWVNZXRhZGF0YShzZXNzaW9uVXJpKTtcblx0XHRjb25zdCBmYWxsYmFja1dvcmt0cmVlc1Jvb3QgPSBnZXRXb3JrdHJlZXNSb290KGNoZWNrb3V0Um9vdCk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdHdvcmt0cmVlOiB3b3JrdHJlZT8udG9TdHJpbmcoKSxcblx0XHRcdG1ldGFSZXBvc2l0b3J5Um9vdDogbWV0YT8ucmVwb3NpdG9yeVJvb3Q/LnRvU3RyaW5nKCksXG5cdFx0fSwge1xuXHRcdFx0d29ya3RyZWU6IFVSSS5qb2luUGF0aChmYWxsYmFja1dvcmt0cmVlc1Jvb3QsIGdldFdvcmt0cmVlTmFtZShicmFuY2hOYW1lKSkudG9TdHJpbmcoKSxcblx0XHRcdG1ldGFSZXBvc2l0b3J5Um9vdDogY2hlY2tvdXRSb290LnRvU3RyaW5nKCksXG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3Jlc29sdmVXb3JraW5nRGlyZWN0b3J5IG5hbWVzIGVhY2ggY3JlYXRpb24gcGhhc2UsIHJvdW5kaW5nIHBlcmNlbnRhZ2VzIGRvd24gYW5kIGRlYm91bmNpbmcgdXBkYXRlcycsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBnaXRTZXJ2aWNlID0gY3JlYXRlR2l0U2VydmljZSgpO1xuXHRcdGdpdFNlcnZpY2UuYWRkV29ya3RyZWUgPSBhc3luYyAoX3Jvb3QsIHdvcmt0cmVlLCBicmFuY2gsIHN0YXJ0UG9pbnQsIHRyYWNrLCBvblByb2dyZXNzKSA9PiB7XG5cdFx0XHRhZGRXb3JrdHJlZUNhbGxzLnB1c2goeyB3b3JrdHJlZSwgYnJhbmNoTmFtZTogYnJhbmNoLCBzdGFydFBvaW50LCB0cmFjayB9KTtcblx0XHRcdG1rZGlyU3luYyh3b3JrdHJlZS5mc1BhdGgsIHsgcmVjdXJzaXZlOiB0cnVlIH0pO1xuXHRcdFx0b25Qcm9ncmVzcz8uKHsgZmlsZXNEb25lOiA3LCBmaWxlc1RvdGFsOiA4MDAgfSk7XG5cdFx0XHRvblByb2dyZXNzPy4oeyBmaWxlc0RvbmU6IDk2LCBmaWxlc1RvdGFsOiA4MDAgfSk7XG5cdFx0XHRvblByb2dyZXNzPy4oeyBmaWxlc0RvbmU6IDEwMCwgZmlsZXNUb3RhbDogODAwIH0pO1xuXHRcdFx0YXdhaXQgdGltZW91dCg1MCk7XG5cdFx0XHRvblByb2dyZXNzPy4oeyBmaWxlc0RvbmU6IDgwMCwgZmlsZXNUb3RhbDogODAwIH0pO1xuXHRcdH07XG5cdFx0Z2l0U2VydmljZS5jb3B5V29ya3RyZWVJbmNsdWRlRmlsZXMgPSBhc3luYyAoX3Jvb3QsIF93b3JrdHJlZSwgX2dsb2JzLCBvblByb2dyZXNzKSA9PiB7XG5cdFx0XHRvblByb2dyZXNzPy4oeyBmaWxlc0RvbmU6IDEsIGZpbGVzVG90YWw6IDQgfSk7XG5cdFx0XHRvblByb2dyZXNzPy4oeyBmaWxlc0RvbmU6IDQsIGZpbGVzVG90YWw6IDQgfSk7XG5cdFx0fTtcblx0XHRjb25zdCBpc29sYXRpb24gPSBjcmVhdGVJc29sYXRpb24oZGlzcG9zYWJsZXMsIHsgZ2l0U2VydmljZSB9KTtcblx0XHRjb25zdCBhY3Rpdml0aWVzOiBzdHJpbmdbXSA9IFtdO1xuXG5cdFx0YXdhaXQgaXNvbGF0aW9uLnJlc29sdmVXb3JraW5nRGlyZWN0b3J5KHtcblx0XHRcdHNlc3Npb25VcmksXG5cdFx0XHRzZXNzaW9uSWQsXG5cdFx0XHR3b3JraW5nRGlyZWN0b3J5OiByZXBvUm9vdCxcblx0XHRcdGNvbmZpZzoge1xuXHRcdFx0XHRbU2Vzc2lvbkNvbmZpZ0tleS5Jc29sYXRpb25dOiAnd29ya3RyZWUnLFxuXHRcdFx0XHRbU2Vzc2lvbkNvbmZpZ0tleS5CcmFuY2hdOiAnbWFpbicsXG5cdFx0XHRcdFtTZXNzaW9uQ29uZmlnS2V5Lldvcmt0cmVlSW5jbHVkZUZpbGVzXTogWycuZW52J10sXG5cdFx0XHR9LFxuXHRcdFx0cHJvbXB0OiAnZG8gYSB0aGluZycsXG5cdFx0XHRvblByb2dyZXNzOiBhY3Rpdml0eSA9PiBhY3Rpdml0aWVzLnB1c2goYWN0aXZpdHkpLFxuXHRcdH0pO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChhY3Rpdml0aWVzLCBbXG5cdFx0XHQnQ3JlYXRpbmcgaXNvbGF0ZWQgd29ya3RyZWUnLFxuXHRcdFx0J0NyZWF0aW5nIGlzb2xhdGVkIHdvcmt0cmVlIChuYW1pbmcgYnJhbmNoKScsXG5cdFx0XHQnQ3JlYXRpbmcgaXNvbGF0ZWQgd29ya3RyZWUgKGNoZWNraW5nIG91dCBmaWxlcyknLFxuXHRcdFx0J0NyZWF0aW5nIGlzb2xhdGVkIHdvcmt0cmVlIChjaGVja2luZyBvdXQgZmlsZXMsIDEyJSknLFxuXHRcdFx0J0NyZWF0aW5nIGlzb2xhdGVkIHdvcmt0cmVlIChjaGVja2luZyBvdXQgZmlsZXMsIDEwMCUpJyxcblx0XHRcdCdDcmVhdGluZyBpc29sYXRlZCB3b3JrdHJlZSAoY29weWluZyBhZGRpdGlvbmFsIGZpbGVzKScsXG5cdFx0XHQnQ3JlYXRpbmcgaXNvbGF0ZWQgd29ya3RyZWUgKGNvcHlpbmcgYWRkaXRpb25hbCBmaWxlcywgMTAwJSknLFxuXHRcdF0pO1xuXHR9KTtcblxuXHR0ZXN0KCdyZXNvbHZlV29ya2luZ0RpcmVjdG9yeSBhdm9pZHMgYW4gZXhpc3Rpbmcgd29ya3RyZWUgZGlyZWN0b3J5JywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IGNvbGxpc2lvblNlc3Npb25JZCA9ICcxMjM0NTY3OC1hYWFhLWJiYmItY2NjYy0xMjM0NTY3ODlhYmMnO1xuXHRcdGNvbnN0IGNvbGxpc2lvblNlc3Npb25VcmkgPSBVUkkucGFyc2UoYGFnZW50LXNlc3Npb246Ly90ZXN0LyR7Y29sbGlzaW9uU2Vzc2lvbklkfWApO1xuXHRcdGNvbnN0IGV4aXN0aW5nV29ya3RyZWUgPSBVUkkuam9pblBhdGgod29ya3RyZWVzUm9vdCwgJ2FkZC1mZWF0dXJlJyk7XG5cdFx0bWtkaXJTeW5jKGV4aXN0aW5nV29ya3RyZWUuZnNQYXRoLCB7IHJlY3Vyc2l2ZTogdHJ1ZSB9KTtcblx0XHRicmFuY2hFeGlzdHMgPSBmYWxzZTtcblx0XHRjb25zdCBpc29sYXRpb24gPSBjcmVhdGVJc29sYXRpb24oZGlzcG9zYWJsZXMsIHtcblx0XHRcdGJyYW5jaE5hbWVHZW5lcmF0b3I6IG5ldyBBZ2VudEJyYW5jaE5hbWVHZW5lcmF0b3IoY3JlYXRlTnVsbENvcGlsb3RBcGlTZXJ2aWNlKCksIG5ldyBOdWxsTG9nU2VydmljZSgpKSxcblx0XHR9KTtcblxuXHRcdGNvbnN0IHJlc29sdmVkID0gYXdhaXQgaXNvbGF0aW9uLnJlc29sdmVXb3JraW5nRGlyZWN0b3J5KHtcblx0XHRcdHNlc3Npb25Vcmk6IGNvbGxpc2lvblNlc3Npb25VcmksXG5cdFx0XHRzZXNzaW9uSWQ6IGNvbGxpc2lvblNlc3Npb25JZCxcblx0XHRcdHdvcmtpbmdEaXJlY3Rvcnk6IHJlcG9Sb290LFxuXHRcdFx0Y29uZmlnOiB7IFtTZXNzaW9uQ29uZmlnS2V5Lklzb2xhdGlvbl06ICd3b3JrdHJlZScsIFtTZXNzaW9uQ29uZmlnS2V5LkJyYW5jaF06ICdtYWluJyB9LFxuXHRcdFx0cHJvbXB0OiAnQWRkIGZlYXR1cmUnLFxuXHRcdH0pO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRicmFuY2hOYW1lOiBhZGRXb3JrdHJlZUNhbGxzWzBdPy5icmFuY2hOYW1lLFxuXHRcdFx0d29ya3RyZWU6IHJlc29sdmVkPy50b1N0cmluZygpLFxuXHRcdH0sIHtcblx0XHRcdGJyYW5jaE5hbWU6ICdhZ2VudHMvYWRkLWZlYXR1cmUtMTIzNDU2NzgnLFxuXHRcdFx0d29ya3RyZWU6IFVSSS5qb2luUGF0aCh3b3JrdHJlZXNSb290LCAnYWRkLWZlYXR1cmUtMTIzNDU2NzgnKS50b1N0cmluZygpLFxuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdyZXNvbHZlV29ya2luZ0RpcmVjdG9yeSB0cmVhdHMgYSBmYWlsZWQgYnJhbmNoIGNoZWNrIGFzIGEgY29sbGlzaW9uJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IGNvbGxpc2lvblNlc3Npb25JZCA9ICcxMjM0NTY3OC1hYWFhLWJiYmItY2NjYy0xMjM0NTY3ODlhYmMnO1xuXHRcdGNvbnN0IGNvbGxpc2lvblNlc3Npb25VcmkgPSBVUkkucGFyc2UoYGFnZW50LXNlc3Npb246Ly90ZXN0LyR7Y29sbGlzaW9uU2Vzc2lvbklkfWApO1xuXHRcdGNvbnN0IGdpdFNlcnZpY2UgPSBjcmVhdGVHaXRTZXJ2aWNlKCk7XG5cdFx0bGV0IGJyYW5jaEV4aXN0c0NhbGxzID0gMDtcblx0XHRnaXRTZXJ2aWNlLmJyYW5jaEV4aXN0cyA9IGFzeW5jICgpID0+IHtcblx0XHRcdGlmIChicmFuY2hFeGlzdHNDYWxscysrID09PSAwKSB7XG5cdFx0XHRcdHRocm93IG5ldyBFcnJvcigndHJhbnNpZW50IGZhaWx1cmUnKTtcblx0XHRcdH1cblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9O1xuXHRcdGNvbnN0IGlzb2xhdGlvbiA9IGNyZWF0ZUlzb2xhdGlvbihkaXNwb3NhYmxlcywge1xuXHRcdFx0YnJhbmNoTmFtZUdlbmVyYXRvcjogbmV3IEFnZW50QnJhbmNoTmFtZUdlbmVyYXRvcihjcmVhdGVOdWxsQ29waWxvdEFwaVNlcnZpY2UoKSwgbmV3IE51bGxMb2dTZXJ2aWNlKCkpLFxuXHRcdFx0Z2l0U2VydmljZSxcblx0XHR9KTtcblxuXHRcdGNvbnN0IHJlc29sdmVkID0gYXdhaXQgaXNvbGF0aW9uLnJlc29sdmVXb3JraW5nRGlyZWN0b3J5KHtcblx0XHRcdHNlc3Npb25Vcmk6IGNvbGxpc2lvblNlc3Npb25VcmksXG5cdFx0XHRzZXNzaW9uSWQ6IGNvbGxpc2lvblNlc3Npb25JZCxcblx0XHRcdHdvcmtpbmdEaXJlY3Rvcnk6IHJlcG9Sb290LFxuXHRcdFx0Y29uZmlnOiB7IFtTZXNzaW9uQ29uZmlnS2V5Lklzb2xhdGlvbl06ICd3b3JrdHJlZScsIFtTZXNzaW9uQ29uZmlnS2V5LkJyYW5jaF06ICdtYWluJyB9LFxuXHRcdFx0cHJvbXB0OiAnQWRkIGZlYXR1cmUnLFxuXHRcdH0pO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRicmFuY2hFeGlzdHNDYWxscyxcblx0XHRcdGJyYW5jaE5hbWU6IGFkZFdvcmt0cmVlQ2FsbHNbMF0/LmJyYW5jaE5hbWUsXG5cdFx0XHR3b3JrdHJlZTogcmVzb2x2ZWQ/LnRvU3RyaW5nKCksXG5cdFx0fSwge1xuXHRcdFx0YnJhbmNoRXhpc3RzQ2FsbHM6IDIsXG5cdFx0XHRicmFuY2hOYW1lOiAnYWdlbnRzL2FkZC1mZWF0dXJlLTEyMzQ1Njc4Jyxcblx0XHRcdHdvcmt0cmVlOiBVUkkuam9pblBhdGgod29ya3RyZWVzUm9vdCwgJ2FkZC1mZWF0dXJlLTEyMzQ1Njc4JykudG9TdHJpbmcoKSxcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgncmVzb2x2ZVdvcmtpbmdEaXJlY3Rvcnkgc2VyaWFsaXplcyBjb25jdXJyZW50IGNyZWF0aW9uIGluIHRoZSBzYW1lIHJlcG9zaXRvcnknLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgZ2l0U2VydmljZSA9IGNyZWF0ZUdpdFNlcnZpY2UoKTtcblx0XHRjb25zdCBjaGVja291dFJvb3RBID0gVVJJLmpvaW5QYXRoKHJlcG9Sb290LCAnbGlua2VkLWNoZWNrb3V0LWEnKTtcblx0XHRjb25zdCBjaGVja291dFJvb3RCID0gVVJJLmpvaW5QYXRoKHJlcG9Sb290LCAnbGlua2VkLWNoZWNrb3V0LWInKTtcblx0XHRjb25zdCBleGlzdGluZ0JyYW5jaGVzID0gbmV3IFNldDxzdHJpbmc+KCk7XG5cdFx0bGV0IGFjdGl2ZUFkZFdvcmt0cmVlcyA9IDA7XG5cdFx0bGV0IG1heEFjdGl2ZUFkZFdvcmt0cmVlcyA9IDA7XG5cdFx0Z2l0U2VydmljZS5nZXRSZXBvc2l0b3J5Um9vdCA9IGFzeW5jIHdvcmtpbmdEaXJlY3RvcnkgPT4gd29ya2luZ0RpcmVjdG9yeTtcblx0XHRnaXRTZXJ2aWNlLmdldFdvcmt0cmVlUm9vdHMgPSBhc3luYyAoKSA9PiBbcmVwb1Jvb3QsIGNoZWNrb3V0Um9vdEEsIGNoZWNrb3V0Um9vdEJdO1xuXHRcdGdpdFNlcnZpY2UuYnJhbmNoRXhpc3RzID0gYXN5bmMgKF9yZXBvc2l0b3J5Um9vdCwgY2FuZGlkYXRlKSA9PiBleGlzdGluZ0JyYW5jaGVzLmhhcyhjYW5kaWRhdGUpO1xuXHRcdGdpdFNlcnZpY2UuYWRkV29ya3RyZWUgPSBhc3luYyAoX3JlcG9zaXRvcnlSb290LCB3b3JrdHJlZSwgY2FuZGlkYXRlLCBzdGFydFBvaW50LCB0cmFjaykgPT4ge1xuXHRcdFx0YWN0aXZlQWRkV29ya3RyZWVzKys7XG5cdFx0XHRtYXhBY3RpdmVBZGRXb3JrdHJlZXMgPSBNYXRoLm1heChtYXhBY3RpdmVBZGRXb3JrdHJlZXMsIGFjdGl2ZUFkZFdvcmt0cmVlcyk7XG5cdFx0XHRhd2FpdCB0aW1lb3V0KDEwKTtcblx0XHRcdGFkZFdvcmt0cmVlQ2FsbHMucHVzaCh7IHdvcmt0cmVlLCBicmFuY2hOYW1lOiBjYW5kaWRhdGUsIHN0YXJ0UG9pbnQsIHRyYWNrIH0pO1xuXHRcdFx0ZXhpc3RpbmdCcmFuY2hlcy5hZGQoY2FuZGlkYXRlKTtcblx0XHRcdG1rZGlyU3luYyh3b3JrdHJlZS5mc1BhdGgsIHsgcmVjdXJzaXZlOiB0cnVlIH0pO1xuXHRcdFx0YWN0aXZlQWRkV29ya3RyZWVzLS07XG5cdFx0fTtcblx0XHRjb25zdCBpc29sYXRpb24gPSBjcmVhdGVJc29sYXRpb24oZGlzcG9zYWJsZXMsIHtcblx0XHRcdGJyYW5jaE5hbWVHZW5lcmF0b3I6IG5ldyBBZ2VudEJyYW5jaE5hbWVHZW5lcmF0b3IoY3JlYXRlTnVsbENvcGlsb3RBcGlTZXJ2aWNlKCksIG5ldyBOdWxsTG9nU2VydmljZSgpKSxcblx0XHRcdGdpdFNlcnZpY2UsXG5cdFx0fSk7XG5cdFx0Y29uc3QgY29uZmlnID0geyBbU2Vzc2lvbkNvbmZpZ0tleS5Jc29sYXRpb25dOiAnd29ya3RyZWUnLCBbU2Vzc2lvbkNvbmZpZ0tleS5CcmFuY2hdOiAnbWFpbicgfTtcblxuXHRcdGNvbnN0IHdvcmt0cmVlcyA9IGF3YWl0IFByb21pc2UuYWxsKFtcblx0XHRcdGlzb2xhdGlvbi5yZXNvbHZlV29ya2luZ0RpcmVjdG9yeSh7IHNlc3Npb25Vcmk6IFVSSS5wYXJzZSgnYWdlbnQtc2Vzc2lvbjovL3Rlc3QvMTIzNDU2NzgtYWFhYS1iYmJiLWNjY2MtMTIzNDU2Nzg5YWJjJyksIHNlc3Npb25JZDogJzEyMzQ1Njc4LWFhYWEtYmJiYi1jY2NjLTEyMzQ1Njc4OWFiYycsIHdvcmtpbmdEaXJlY3Rvcnk6IGNoZWNrb3V0Um9vdEEsIGNvbmZpZywgcHJvbXB0OiAnQWRkIGZlYXR1cmUnIH0pLFxuXHRcdFx0aXNvbGF0aW9uLnJlc29sdmVXb3JraW5nRGlyZWN0b3J5KHsgc2Vzc2lvblVyaTogVVJJLnBhcnNlKCdhZ2VudC1zZXNzaW9uOi8vdGVzdC84NzY1NDMyMS1hYWFhLWJiYmItY2NjYy0xMjM0NTY3ODlhYmMnKSwgc2Vzc2lvbklkOiAnODc2NTQzMjEtYWFhYS1iYmJiLWNjY2MtMTIzNDU2Nzg5YWJjJywgd29ya2luZ0RpcmVjdG9yeTogY2hlY2tvdXRSb290QiwgY29uZmlnLCBwcm9tcHQ6ICdBZGQgZmVhdHVyZScgfSksXG5cdFx0XSk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdG1heEFjdGl2ZUFkZFdvcmt0cmVlcyxcblx0XHRcdGJyYW5jaE5hbWVzOiBhZGRXb3JrdHJlZUNhbGxzLm1hcChjYWxsID0+IGNhbGwuYnJhbmNoTmFtZSksXG5cdFx0XHR3b3JrdHJlZXM6IHdvcmt0cmVlcy5tYXAod29ya3RyZWUgPT4gd29ya3RyZWU/LnRvU3RyaW5nKCkpLFxuXHRcdH0sIHtcblx0XHRcdG1heEFjdGl2ZUFkZFdvcmt0cmVlczogMSxcblx0XHRcdGJyYW5jaE5hbWVzOiBbJ2FnZW50cy9hZGQtZmVhdHVyZScsICdhZ2VudHMvYWRkLWZlYXR1cmUtODc2NTQzMjEnXSxcblx0XHRcdHdvcmt0cmVlczogW1xuXHRcdFx0XHRVUkkuam9pblBhdGgod29ya3RyZWVzUm9vdCwgJ2FkZC1mZWF0dXJlJykudG9TdHJpbmcoKSxcblx0XHRcdFx0VVJJLmpvaW5QYXRoKHdvcmt0cmVlc1Jvb3QsICdhZGQtZmVhdHVyZS04NzY1NDMyMScpLnRvU3RyaW5nKCksXG5cdFx0XHRdLFxuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdyZXNvbHZlV29ya2luZ0RpcmVjdG9yeSBpcyBhIG5vLW9wIGZvciBmb2xkZXIgaXNvbGF0aW9uIG9yIGEgbWlzc2luZyBicmFuY2gnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgaXNvbGF0aW9uID0gY3JlYXRlSXNvbGF0aW9uKGRpc3Bvc2FibGVzKTtcblxuXHRcdGNvbnN0IGZvbGRlciA9IGF3YWl0IGlzb2xhdGlvbi5yZXNvbHZlV29ya2luZ0RpcmVjdG9yeSh7IHNlc3Npb25VcmksIHNlc3Npb25JZCwgd29ya2luZ0RpcmVjdG9yeTogcmVwb1Jvb3QsIGNvbmZpZzogeyBbU2Vzc2lvbkNvbmZpZ0tleS5Jc29sYXRpb25dOiAnZm9sZGVyJywgW1Nlc3Npb25Db25maWdLZXkuQnJhbmNoXTogJ21haW4nIH0gfSk7XG5cdFx0Y29uc3Qgbm9CcmFuY2ggPSBhd2FpdCBpc29sYXRpb24ucmVzb2x2ZVdvcmtpbmdEaXJlY3RvcnkoeyBzZXNzaW9uVXJpLCBzZXNzaW9uSWQsIHdvcmtpbmdEaXJlY3Rvcnk6IHJlcG9Sb290LCBjb25maWc6IHsgW1Nlc3Npb25Db25maWdLZXkuSXNvbGF0aW9uXTogJ3dvcmt0cmVlJyB9IH0pO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRmb2xkZXI6IGZvbGRlcj8udG9TdHJpbmcoKSxcblx0XHRcdG5vQnJhbmNoOiBub0JyYW5jaD8udG9TdHJpbmcoKSxcblx0XHRcdGFkZFdvcmt0cmVlQ2FsbENvdW50OiBhZGRXb3JrdHJlZUNhbGxzLmxlbmd0aCxcblx0XHRcdHJlc29sdmVkV29ya3RyZWU6IGlzb2xhdGlvbi5nZXRSZXNvbHZlZFdvcmt0cmVlKHNlc3Npb25JZCksXG5cdFx0fSwge1xuXHRcdFx0Zm9sZGVyOiByZXBvUm9vdC50b1N0cmluZygpLFxuXHRcdFx0bm9CcmFuY2g6IHJlcG9Sb290LnRvU3RyaW5nKCksXG5cdFx0XHRhZGRXb3JrdHJlZUNhbGxDb3VudDogMCxcblx0XHRcdHJlc29sdmVkV29ya3RyZWU6IHVuZGVmaW5lZCxcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgncmVzb2x2ZVdvcmtpbmdEaXJlY3RvcnkgY29waWVzIGNvbmZpZ3VyZWQgaW5jbHVkZSBmaWxlcyBhbmQgdG9sZXJhdGVzIGNvcHkgZmFpbHVyZXMnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgaXNvbGF0aW9uID0gY3JlYXRlSXNvbGF0aW9uKGRpc3Bvc2FibGVzKTtcblx0XHRjb25zdCBpbmNsdWRlRmlsZXMgPSBbJy5lbnYnLCAnLmVudi5sb2NhbCcsICdjb25maWcvKionXTtcblx0XHRjb3B5SW5jbHVkZUVycm9yID0gbmV3IEVycm9yKCdjb3B5IGZhaWxlZCcpO1xuXG5cdFx0Y29uc3Qgd29ya3RyZWUgPSBhd2FpdCBpc29sYXRpb24ucmVzb2x2ZVdvcmtpbmdEaXJlY3Rvcnkoe1xuXHRcdFx0c2Vzc2lvblVyaSxcblx0XHRcdHNlc3Npb25JZCxcblx0XHRcdHdvcmtpbmdEaXJlY3Rvcnk6IHJlcG9Sb290LFxuXHRcdFx0Y29uZmlnOiB7XG5cdFx0XHRcdFtTZXNzaW9uQ29uZmlnS2V5Lklzb2xhdGlvbl06ICd3b3JrdHJlZScsXG5cdFx0XHRcdFtTZXNzaW9uQ29uZmlnS2V5LkJyYW5jaF06ICdtYWluJyxcblx0XHRcdFx0W1Nlc3Npb25Db25maWdLZXkuV29ya3RyZWVJbmNsdWRlRmlsZXNdOiBpbmNsdWRlRmlsZXMsXG5cdFx0XHR9LFxuXHRcdH0pO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHR3b3JrdHJlZTogd29ya3RyZWU/LnRvU3RyaW5nKCksXG5cdFx0XHRjb3B5SW5jbHVkZUNhbGxzOiBjb3B5SW5jbHVkZUNhbGxzLm1hcChjYWxsID0+ICh7XG5cdFx0XHRcdHJlcG9zaXRvcnlSb290OiBjYWxsLnJlcG9zaXRvcnlSb290LnRvU3RyaW5nKCksXG5cdFx0XHRcdHdvcmt0cmVlOiBjYWxsLndvcmt0cmVlLnRvU3RyaW5nKCksXG5cdFx0XHRcdGdsb2JzOiBjYWxsLmdsb2JzLFxuXHRcdFx0fSkpLFxuXHRcdFx0cmVzb2x2ZWRXb3JrdHJlZTogaXNvbGF0aW9uLmdldFJlc29sdmVkV29ya3RyZWUoc2Vzc2lvbklkKT8udG9TdHJpbmcoKSxcblx0XHR9LCB7XG5cdFx0XHR3b3JrdHJlZTogVVJJLmpvaW5QYXRoKHdvcmt0cmVlc1Jvb3QsIGdldFdvcmt0cmVlTmFtZShicmFuY2hOYW1lKSkudG9TdHJpbmcoKSxcblx0XHRcdGNvcHlJbmNsdWRlQ2FsbHM6IFt7XG5cdFx0XHRcdHJlcG9zaXRvcnlSb290OiByZXBvUm9vdC50b1N0cmluZygpLFxuXHRcdFx0XHR3b3JrdHJlZTogVVJJLmpvaW5QYXRoKHdvcmt0cmVlc1Jvb3QsIGdldFdvcmt0cmVlTmFtZShicmFuY2hOYW1lKSkudG9TdHJpbmcoKSxcblx0XHRcdFx0Z2xvYnM6IGluY2x1ZGVGaWxlcyxcblx0XHRcdH1dLFxuXHRcdFx0cmVzb2x2ZWRXb3JrdHJlZTogVVJJLmpvaW5QYXRoKHdvcmt0cmVlc1Jvb3QsIGdldFdvcmt0cmVlTmFtZShicmFuY2hOYW1lKSkudG9TdHJpbmcoKSxcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgncmVzb2x2ZVdvcmtpbmdEaXJlY3RvcnlGb3JSZXN1bWUgcmVjcmVhdGVzIGEgbWlzc2luZyBsaXZlIHdvcmt0cmVlIGFuZCBwcmVzZXJ2ZXMgYW4gZXhpc3RpbmcgZGlyZWN0b3J5JywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IGlzb2xhdGlvbiA9IGNyZWF0ZUlzb2xhdGlvbihkaXNwb3NhYmxlcyk7XG5cdFx0Y29uc3QgbWlzc2luZ1dvcmt0cmVlID0gVVJJLmpvaW5QYXRoKHdvcmt0cmVlc1Jvb3QsICdtaXNzaW5nLWxpdmUtd29ya3RyZWUnKTtcblx0XHRjb25zdCBleGlzdGluZ1dvcmt0cmVlID0gVVJJLmpvaW5QYXRoKHdvcmt0cmVlc1Jvb3QsICdleGlzdGluZy1saXZlLXdvcmt0cmVlJyk7XG5cdFx0bWtkaXJTeW5jKGV4aXN0aW5nV29ya3RyZWUuZnNQYXRoLCB7IHJlY3Vyc2l2ZTogdHJ1ZSB9KTtcblx0XHRhd2FpdCBQcm9taXNlLmFsbChbXG5cdFx0XHRkYi5zZXRNZXRhZGF0YSgnY29waWxvdC53b3JrdHJlZS5icmFuY2hOYW1lJywgJ2ZlYXR1cmUveCcpLFxuXHRcdFx0ZGIuc2V0TWV0YWRhdGEoJ2NvcGlsb3Qud29ya3RyZWUucGF0aCcsIG1pc3NpbmdXb3JrdHJlZS50b1N0cmluZygpKSxcblx0XHRcdGRiLnNldE1ldGFkYXRhKCdjb3BpbG90Lndvcmt0cmVlLnJlcG9zaXRvcnlSb290JywgcmVwb1Jvb3QudG9TdHJpbmcoKSksXG5cdFx0XSk7XG5cblx0XHRjb25zdCBvdXRjb21lcyA9IHtcblx0XHRcdG1pc3NpbmdXb3JrdHJlZVJlY3JlYXRlZDogKGF3YWl0IGlzb2xhdGlvbi5yZXNvbHZlV29ya2luZ0RpcmVjdG9yeUZvclJlc3VtZShzZXNzaW9uVXJpLCBzZXNzaW9uSWQsIG1pc3NpbmdXb3JrdHJlZSkpLnRvU3RyaW5nKCksXG5cdFx0XHRleGlzdGluZ1dvcmt0cmVlVXNlZFVuY2hhbmdlZDogKGF3YWl0IGlzb2xhdGlvbi5yZXNvbHZlV29ya2luZ0RpcmVjdG9yeUZvclJlc3VtZShzZXNzaW9uVXJpLCBzZXNzaW9uSWQsIGV4aXN0aW5nV29ya3RyZWUpKS50b1N0cmluZygpLFxuXHRcdFx0cmVjcmVhdGVkV29ya3RyZWVzOiBhZGRFeGlzdGluZ0NhbGxzLm1hcChjYWxsID0+ICh7IHdvcmt0cmVlOiBjYWxsLndvcmt0cmVlLnRvU3RyaW5nKCksIGJyYW5jaE5hbWU6IGNhbGwuYnJhbmNoTmFtZSB9KSksXG5cdFx0fTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwob3V0Y29tZXMsIHtcblx0XHRcdG1pc3NpbmdXb3JrdHJlZVJlY3JlYXRlZDogbWlzc2luZ1dvcmt0cmVlLnRvU3RyaW5nKCksXG5cdFx0XHRleGlzdGluZ1dvcmt0cmVlVXNlZFVuY2hhbmdlZDogZXhpc3RpbmdXb3JrdHJlZS50b1N0cmluZygpLFxuXHRcdFx0cmVjcmVhdGVkV29ya3RyZWVzOiBbeyB3b3JrdHJlZTogbWlzc2luZ1dvcmt0cmVlLnRvU3RyaW5nKCksIGJyYW5jaE5hbWU6ICdmZWF0dXJlL3gnIH1dLFxuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdyZXNvbHZlV29ya2luZ0RpcmVjdG9yeUZvclJlc3VtZSB1c2VzIHRoZSByZXBvc2l0b3J5IHJvb3QgZm9yIGFyY2hpdmVkIGhpc3RvcnknLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgaXNvbGF0aW9uID0gY3JlYXRlSXNvbGF0aW9uKGRpc3Bvc2FibGVzKTtcblx0XHRjb25zdCBtaXNzaW5nV29ya3RyZWUgPSBVUkkuam9pblBhdGgod29ya3RyZWVzUm9vdCwgJ21pc3NpbmctYXJjaGl2ZWQtd29ya3RyZWUnKTtcblx0XHRhd2FpdCBQcm9taXNlLmFsbChbXG5cdFx0XHRkYi5zZXRNZXRhZGF0YSgnY29waWxvdC53b3JrdHJlZS5icmFuY2hOYW1lJywgJ2ZlYXR1cmUveCcpLFxuXHRcdFx0ZGIuc2V0TWV0YWRhdGEoJ2NvcGlsb3Qud29ya3RyZWUucGF0aCcsIG1pc3NpbmdXb3JrdHJlZS50b1N0cmluZygpKSxcblx0XHRcdGRiLnNldE1ldGFkYXRhKCdjb3BpbG90Lndvcmt0cmVlLnJlcG9zaXRvcnlSb290JywgcmVwb1Jvb3QudG9TdHJpbmcoKSksXG5cdFx0XHRkYi5zZXRNZXRhZGF0YShBSF9NRVRBX0lTX0FSQ0hJVkVEX0RCX0tFWSwgJ3RydWUnKSxcblx0XHRdKTtcblxuXHRcdGNvbnN0IHJlc29sdmVkID0gYXdhaXQgaXNvbGF0aW9uLnJlc29sdmVXb3JraW5nRGlyZWN0b3J5Rm9yUmVzdW1lKHNlc3Npb25VcmksIHNlc3Npb25JZCwgbWlzc2luZ1dvcmt0cmVlKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoeyByZXNvbHZlZDogcmVzb2x2ZWQudG9TdHJpbmcoKSwgd29ya3RyZWVzUmVjcmVhdGVkOiBhZGRFeGlzdGluZ0NhbGxzLmxlbmd0aCB9LCB7XG5cdFx0XHRyZXNvbHZlZDogcmVwb1Jvb3QudG9TdHJpbmcoKSxcblx0XHRcdHdvcmt0cmVlc1JlY3JlYXRlZDogMCxcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgncmVzb2x2ZVdvcmtpbmdEaXJlY3RvcnlGb3JSZXN1bWUgZmFsbHMgYmFjayB0byBsZWdhY3kgaXNEb25lIGFyY2hpdmVkIG1ldGFkYXRhJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IGlzb2xhdGlvbiA9IGNyZWF0ZUlzb2xhdGlvbihkaXNwb3NhYmxlcyk7XG5cdFx0Y29uc3QgbWlzc2luZ1dvcmt0cmVlID0gVVJJLmpvaW5QYXRoKHdvcmt0cmVlc1Jvb3QsICdtaXNzaW5nLWxlZ2FjeS1hcmNoaXZlZC13b3JrdHJlZScpO1xuXHRcdGF3YWl0IFByb21pc2UuYWxsKFtcblx0XHRcdGRiLnNldE1ldGFkYXRhKCdjb3BpbG90Lndvcmt0cmVlLmJyYW5jaE5hbWUnLCAnZmVhdHVyZS94JyksXG5cdFx0XHRkYi5zZXRNZXRhZGF0YSgnY29waWxvdC53b3JrdHJlZS5wYXRoJywgbWlzc2luZ1dvcmt0cmVlLnRvU3RyaW5nKCkpLFxuXHRcdFx0ZGIuc2V0TWV0YWRhdGEoJ2NvcGlsb3Qud29ya3RyZWUucmVwb3NpdG9yeVJvb3QnLCByZXBvUm9vdC50b1N0cmluZygpKSxcblx0XHRcdGRiLnNldE1ldGFkYXRhKEFIX01FVEFfSVNfRE9ORV9EQl9LRVksICd0cnVlJyksXG5cdFx0XSk7XG5cblx0XHRjb25zdCByZXNvbHZlZCA9IGF3YWl0IGlzb2xhdGlvbi5yZXNvbHZlV29ya2luZ0RpcmVjdG9yeUZvclJlc3VtZShzZXNzaW9uVXJpLCBzZXNzaW9uSWQsIG1pc3NpbmdXb3JrdHJlZSk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzb2x2ZWQudG9TdHJpbmcoKSwgcmVwb1Jvb3QudG9TdHJpbmcoKSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3Jlc29sdmVXb3JraW5nRGlyZWN0b3J5Rm9yUmVzdW1lIHJlcG9ydHMgYSBtaXNzaW5nIHByZXNlcnZlZCBicmFuY2gnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgaXNvbGF0aW9uID0gY3JlYXRlSXNvbGF0aW9uKGRpc3Bvc2FibGVzKTtcblx0XHRjb25zdCBtaXNzaW5nV29ya3RyZWUgPSBVUkkuam9pblBhdGgod29ya3RyZWVzUm9vdCwgJ21pc3NpbmctYnJhbmNoLXdvcmt0cmVlJyk7XG5cdFx0YnJhbmNoRXhpc3RzID0gZmFsc2U7XG5cdFx0YXdhaXQgUHJvbWlzZS5hbGwoW1xuXHRcdFx0ZGIuc2V0TWV0YWRhdGEoJ2NvcGlsb3Qud29ya3RyZWUuYnJhbmNoTmFtZScsICdmZWF0dXJlL3gnKSxcblx0XHRcdGRiLnNldE1ldGFkYXRhKCdjb3BpbG90Lndvcmt0cmVlLnBhdGgnLCBtaXNzaW5nV29ya3RyZWUudG9TdHJpbmcoKSksXG5cdFx0XHRkYi5zZXRNZXRhZGF0YSgnY29waWxvdC53b3JrdHJlZS5yZXBvc2l0b3J5Um9vdCcsIHJlcG9Sb290LnRvU3RyaW5nKCkpLFxuXHRcdF0pO1xuXG5cdFx0YXdhaXQgYXNzZXJ0LnJlamVjdHMoXG5cdFx0XHQoKSA9PiBpc29sYXRpb24ucmVzb2x2ZVdvcmtpbmdEaXJlY3RvcnlGb3JSZXN1bWUoc2Vzc2lvblVyaSwgc2Vzc2lvbklkLCBtaXNzaW5nV29ya3RyZWUpLFxuXHRcdFx0KGVycm9yOiBFcnJvcikgPT4gZXJyb3IgaW5zdGFuY2VvZiBTZXNzaW9uV29ya2luZ0RpcmVjdG9yeU1pc3NpbmdFcnJvclxuXHRcdFx0XHQmJiBlcnJvci5yZWFzb24gIT09IHVuZGVmaW5lZFxuXHRcdFx0XHQmJiAvYnJhbmNoICdmZWF0dXJlXFwveCcgbm8gbG9uZ2VyIGV4aXN0cy8udGVzdChlcnJvci5tZXNzYWdlKSxcblx0XHQpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChhZGRFeGlzdGluZ0NhbGxzLmxlbmd0aCwgMCk7XG5cdH0pO1xuXG5cdHRlc3QoJ3Jlc29sdmVXb3JraW5nRGlyZWN0b3J5Rm9yUmVzdW1lIHJlcG9ydHMgYSBtaXNzaW5nIGxpdmUgZGlyZWN0b3J5IHdpdGhvdXQgd29ya3RyZWUgbWV0YWRhdGEnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgaXNvbGF0aW9uID0gY3JlYXRlSXNvbGF0aW9uKGRpc3Bvc2FibGVzKTtcblx0XHRjb25zdCBtaXNzaW5nRGlyZWN0b3J5ID0gVVJJLmpvaW5QYXRoKHJlcG9Sb290LCAnbWlzc2luZy1kaXJlY3RvcnknKTtcblxuXHRcdGF3YWl0IGFzc2VydC5yZWplY3RzKFxuXHRcdFx0KCkgPT4gaXNvbGF0aW9uLnJlc29sdmVXb3JraW5nRGlyZWN0b3J5Rm9yUmVzdW1lKHNlc3Npb25VcmksIHNlc3Npb25JZCwgbWlzc2luZ0RpcmVjdG9yeSksXG5cdFx0XHQoZXJyb3I6IEVycm9yKSA9PiBlcnJvciBpbnN0YW5jZW9mIFNlc3Npb25Xb3JraW5nRGlyZWN0b3J5TWlzc2luZ0Vycm9yLFxuXHRcdCk7XG5cdH0pO1xuXG5cdHRlc3QoJ3Jlc29sdmVXb3JraW5nRGlyZWN0b3J5Rm9yUmVzdW1lIHJlcG9ydHMgYW4gYXJjaGl2ZWQgc2Vzc2lvbiB3aGVuIGl0cyByZXBvc2l0b3J5IHJvb3QgaXMgYWxzbyBtaXNzaW5nJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IGlzb2xhdGlvbiA9IGNyZWF0ZUlzb2xhdGlvbihkaXNwb3NhYmxlcyk7XG5cdFx0Y29uc3QgbWlzc2luZ1JlcG9zaXRvcnlSb290ID0gVVJJLmpvaW5QYXRoKHJlcG9Sb290LCAnbWlzc2luZy1yZXBvc2l0b3J5Jyk7XG5cdFx0Y29uc3QgbWlzc2luZ1dvcmt0cmVlID0gVVJJLmpvaW5QYXRoKHdvcmt0cmVlc1Jvb3QsICdtaXNzaW5nLWFyY2hpdmVkLW5vLXJvb3Qtd29ya3RyZWUnKTtcblx0XHRhd2FpdCBQcm9taXNlLmFsbChbXG5cdFx0XHRkYi5zZXRNZXRhZGF0YSgnY29waWxvdC53b3JrdHJlZS5icmFuY2hOYW1lJywgJ2ZlYXR1cmUveCcpLFxuXHRcdFx0ZGIuc2V0TWV0YWRhdGEoJ2NvcGlsb3Qud29ya3RyZWUucGF0aCcsIG1pc3NpbmdXb3JrdHJlZS50b1N0cmluZygpKSxcblx0XHRcdGRiLnNldE1ldGFkYXRhKCdjb3BpbG90Lndvcmt0cmVlLnJlcG9zaXRvcnlSb290JywgbWlzc2luZ1JlcG9zaXRvcnlSb290LnRvU3RyaW5nKCkpLFxuXHRcdFx0ZGIuc2V0TWV0YWRhdGEoQUhfTUVUQV9JU19BUkNISVZFRF9EQl9LRVksICd0cnVlJyksXG5cdFx0XSk7XG5cblx0XHRhd2FpdCBhc3NlcnQucmVqZWN0cyhcblx0XHRcdCgpID0+IGlzb2xhdGlvbi5yZXNvbHZlV29ya2luZ0RpcmVjdG9yeUZvclJlc3VtZShzZXNzaW9uVXJpLCBzZXNzaW9uSWQsIG1pc3NpbmdXb3JrdHJlZSksXG5cdFx0XHQoZXJyb3I6IEVycm9yKSA9PiBlcnJvciBpbnN0YW5jZW9mIFNlc3Npb25Xb3JraW5nRGlyZWN0b3J5TWlzc2luZ0Vycm9yLFxuXHRcdCk7XG5cdH0pO1xuXG5cdHRlc3QoJ3Jlc29sdmVXb3JrdHJlZVByb2plY3QgLyBzZXNzaW9uV29ya3RyZWVQcm9qZWN0IGV4cG9zZSB0aGUgcmVwb3NpdG9yeSBhcyB0aGUgc2Vzc2lvbiBwcm9qZWN0JywgYXN5bmMgKCkgPT4ge1xuXHRcdC8vIFRoZSB3b3JrdHJlZSBsaXZlcyBhdCBgPHJlcG8+Lndvcmt0cmVlcy88bmFtZT5gLCBidXQgYSB3b3JrdHJlZSBzZXNzaW9uXG5cdFx0Ly8gbXVzdCBncm91cCB1bmRlciB0aGUgcmVwb3NpdG9yeSBpbiB0aGUgc2Vzc2lvbnMgVUkuIEJvdGggYWNjZXNzb3JzIHJldHVyblxuXHRcdC8vIHRoZSByZXBvIHJvb3QgYXMgdGhlIHByb2plY3Qgc28gYWdlbnRzIGNhbiBtZXJnZSBpdCBpbnRvIHRoZSByZXBvcnRlZFxuXHRcdC8vIGBJQWdlbnRTZXNzaW9uTWV0YWRhdGFgIC8gbWF0ZXJpYWxpemUgZXZlbnQuIEZvbGRlciAobm9uLXdvcmt0cmVlKVxuXHRcdC8vIHNlc3Npb25zIGhhdmUgbm8gd29ya3RyZWUgbWV0YWRhdGEgYW5kIGdldCBgdW5kZWZpbmVkYC5cblx0XHRjb25zdCBpc29sYXRpb24gPSBjcmVhdGVJc29sYXRpb24oZGlzcG9zYWJsZXMpO1xuXHRcdGNvbnN0IGV4cGVjdGVkRGlzcGxheU5hbWUgPSBiYXNlbmFtZShyZXBvUm9vdCk7XG5cblx0XHRjb25zdCBiZWZvcmVBc3luYyA9IGF3YWl0IGlzb2xhdGlvbi5yZXNvbHZlV29ya3RyZWVQcm9qZWN0KHNlc3Npb25VcmkpO1xuXHRcdGNvbnN0IGJlZm9yZVN5bmMgPSBpc29sYXRpb24uc2Vzc2lvbldvcmt0cmVlUHJvamVjdChzZXNzaW9uSWQpO1xuXG5cdFx0YXdhaXQgaXNvbGF0aW9uLnJlc29sdmVXb3JraW5nRGlyZWN0b3J5KHsgc2Vzc2lvblVyaSwgc2Vzc2lvbklkLCB3b3JraW5nRGlyZWN0b3J5OiByZXBvUm9vdCwgY29uZmlnOiB7IFtTZXNzaW9uQ29uZmlnS2V5Lklzb2xhdGlvbl06ICd3b3JrdHJlZScsIFtTZXNzaW9uQ29uZmlnS2V5LkJyYW5jaF06ICdtYWluJyB9IH0pO1xuXG5cdFx0Y29uc3QgYWZ0ZXJBc3luYyA9IGF3YWl0IGlzb2xhdGlvbi5yZXNvbHZlV29ya3RyZWVQcm9qZWN0KHNlc3Npb25VcmkpO1xuXHRcdGNvbnN0IGFmdGVyU3luYyA9IGlzb2xhdGlvbi5zZXNzaW9uV29ya3RyZWVQcm9qZWN0KHNlc3Npb25JZCk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdGJlZm9yZUFzeW5jLFxuXHRcdFx0YmVmb3JlU3luYyxcblx0XHRcdGFmdGVyQXN5bmM6IHsgdXJpOiBhZnRlckFzeW5jPy51cmkudG9TdHJpbmcoKSwgZGlzcGxheU5hbWU6IGFmdGVyQXN5bmM/LmRpc3BsYXlOYW1lIH0sXG5cdFx0XHRhZnRlclN5bmM6IHsgdXJpOiBhZnRlclN5bmM/LnVyaS50b1N0cmluZygpLCBkaXNwbGF5TmFtZTogYWZ0ZXJTeW5jPy5kaXNwbGF5TmFtZSB9LFxuXHRcdFx0dW5rbm93blNlc3Npb246IGlzb2xhdGlvbi5zZXNzaW9uV29ya3RyZWVQcm9qZWN0KCdkb2VzLW5vdC1leGlzdCcpLFxuXHRcdH0sIHtcblx0XHRcdGJlZm9yZUFzeW5jOiB1bmRlZmluZWQsXG5cdFx0XHRiZWZvcmVTeW5jOiB1bmRlZmluZWQsXG5cdFx0XHRhZnRlckFzeW5jOiB7IHVyaTogcmVwb1Jvb3QudG9TdHJpbmcoKSwgZGlzcGxheU5hbWU6IGV4cGVjdGVkRGlzcGxheU5hbWUgfSxcblx0XHRcdGFmdGVyU3luYzogeyB1cmk6IHJlcG9Sb290LnRvU3RyaW5nKCksIGRpc3BsYXlOYW1lOiBleHBlY3RlZERpc3BsYXlOYW1lIH0sXG5cdFx0XHR1bmtub3duU2Vzc2lvbjogdW5kZWZpbmVkLFxuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdyZXNvbHZlV29ya3RyZWVQcm9qZWN0IG5vcm1hbGl6ZXMgcGVyc2lzdGVkIGxpbmtlZC1jaGVja291dCBtZXRhZGF0YScsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBjaGVja291dFJvb3QgPSBVUkkuam9pblBhdGgocmVwb1Jvb3QsICdsaW5rZWQtY2hlY2tvdXQnKTtcblx0XHRjb25zdCBleGlzdGluZ1dvcmt0cmVlID0gVVJJLmpvaW5QYXRoKHJlcG9Sb290LCAnZXhpc3Rpbmctd29ya3RyZWUnKTtcblx0XHRta2RpclN5bmMoZXhpc3RpbmdXb3JrdHJlZS5mc1BhdGgsIHsgcmVjdXJzaXZlOiB0cnVlIH0pO1xuXHRcdGF3YWl0IFByb21pc2UuYWxsKFtcblx0XHRcdGRiLnNldE1ldGFkYXRhKCdjb3BpbG90Lndvcmt0cmVlLmJyYW5jaE5hbWUnLCAnZmVhdHVyZS94JyksXG5cdFx0XHRkYi5zZXRNZXRhZGF0YSgnY29waWxvdC53b3JrdHJlZS5wYXRoJywgZXhpc3RpbmdXb3JrdHJlZS50b1N0cmluZygpKSxcblx0XHRcdGRiLnNldE1ldGFkYXRhKCdjb3BpbG90Lndvcmt0cmVlLnJlcG9zaXRvcnlSb290JywgY2hlY2tvdXRSb290LnRvU3RyaW5nKCkpLFxuXHRcdF0pO1xuXHRcdGNvbnN0IGdpdFNlcnZpY2UgPSBjcmVhdGVHaXRTZXJ2aWNlKCk7XG5cdFx0bGV0IHJlc29sdmVkRnJvbTogVVJJIHwgdW5kZWZpbmVkO1xuXHRcdGxldCByZXNvbHV0aW9uQ291bnQgPSAwO1xuXHRcdGdpdFNlcnZpY2UuZ2V0V29ya3RyZWVSb290cyA9IGFzeW5jIHdvcmtpbmdEaXJlY3RvcnkgPT4ge1xuXHRcdFx0cmVzb2x2ZWRGcm9tID0gd29ya2luZ0RpcmVjdG9yeTtcblx0XHRcdHJlc29sdXRpb25Db3VudCsrO1xuXHRcdFx0cmV0dXJuIFtyZXBvUm9vdCwgY2hlY2tvdXRSb290LCBleGlzdGluZ1dvcmt0cmVlXTtcblx0XHR9O1xuXHRcdGNvbnN0IGlzb2xhdGlvbiA9IGNyZWF0ZUlzb2xhdGlvbihkaXNwb3NhYmxlcywgeyBnaXRTZXJ2aWNlIH0pO1xuXG5cdFx0Y29uc3QgcHJvamVjdCA9IGF3YWl0IGlzb2xhdGlvbi5yZXNvbHZlV29ya3RyZWVQcm9qZWN0KHNlc3Npb25VcmkpO1xuXHRcdGF3YWl0IGlzb2xhdGlvbi5yZXNvbHZlV29ya3RyZWVQcm9qZWN0KHNlc3Npb25VcmkpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRyZXNvbHV0aW9uQ291bnQsXG5cdFx0XHRyZXNvbHZlZEZyb206IHJlc29sdmVkRnJvbT8udG9TdHJpbmcoKSxcblx0XHRcdHByb2plY3Q6IHByb2plY3QgJiYgeyB1cmk6IHByb2plY3QudXJpLnRvU3RyaW5nKCksIGRpc3BsYXlOYW1lOiBwcm9qZWN0LmRpc3BsYXlOYW1lIH0sXG5cdFx0XHRwZXJzaXN0ZWRSZXBvc2l0b3J5Um9vdDogYXdhaXQgZGIuZ2V0TWV0YWRhdGEoJ2NvcGlsb3Qud29ya3RyZWUucmVwb3NpdG9yeVJvb3QnKSxcblx0XHR9LCB7XG5cdFx0XHRyZXNvbHV0aW9uQ291bnQ6IDEsXG5cdFx0XHRyZXNvbHZlZEZyb206IGV4aXN0aW5nV29ya3RyZWUudG9TdHJpbmcoKSxcblx0XHRcdHByb2plY3Q6IHsgdXJpOiByZXBvUm9vdC50b1N0cmluZygpLCBkaXNwbGF5TmFtZTogYmFzZW5hbWUocmVwb1Jvb3QpIH0sXG5cdFx0XHRwZXJzaXN0ZWRSZXBvc2l0b3J5Um9vdDogcmVwb1Jvb3QudG9TdHJpbmcoKSxcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnYWRvcHRFeGlzdGluZ1dvcmt0cmVlTWV0YWRhdGEgYnJpZGdlcyBhIGxpbmtlZCB3b3JrdHJlZSBpbnRvIHdvcmt0cmVlIG1ldGFkYXRhJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHdvcmt0cmVlQ2hlY2tvdXQgPSBVUkkuam9pblBhdGgod29ya3RyZWVzUm9vdCwgJ2Fkb3B0ZWQnKTtcblx0XHRjb25zdCBnaXRTZXJ2aWNlID0gY3JlYXRlR2l0U2VydmljZSgpO1xuXHRcdGdpdFNlcnZpY2UuZ2V0UmVwb3NpdG9yeVJvb3QgPSBhc3luYyAoKSA9PiB3b3JrdHJlZUNoZWNrb3V0O1xuXHRcdGdpdFNlcnZpY2UuZ2V0V29ya3RyZWVSb290cyA9IGFzeW5jICgpID0+IFtyZXBvUm9vdCwgd29ya3RyZWVDaGVja291dF07XG5cdFx0Z2l0U2VydmljZS5nZXRDdXJyZW50QnJhbmNoID0gYXN5bmMgKCkgPT4gJ2FnZW50cy9hZG9wdGVkJztcblx0XHRnaXRTZXJ2aWNlLmdldERlZmF1bHRCcmFuY2ggPSBhc3luYyAoKSA9PiAoeyBuYW1lOiAnbWFpbicsIHN0YXJ0UG9pbnQ6ICdtYWluJyB9KTtcblx0XHRjb25zdCBpc29sYXRpb24gPSBjcmVhdGVJc29sYXRpb24oZGlzcG9zYWJsZXMsIHsgZ2l0U2VydmljZSB9KTtcblxuXHRcdGNvbnN0IHJlY29yZGVkID0gYXdhaXQgaXNvbGF0aW9uLmFkb3B0RXhpc3RpbmdXb3JrdHJlZU1ldGFkYXRhKHNlc3Npb25VcmksIHdvcmt0cmVlQ2hlY2tvdXQpO1xuXHRcdGNvbnN0IHByb2plY3QgPSBhd2FpdCBpc29sYXRpb24ucmVzb2x2ZVdvcmt0cmVlUHJvamVjdChzZXNzaW9uVXJpKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0cmVjb3JkZWQsXG5cdFx0XHRicmFuY2hOYW1lOiBhd2FpdCBkYi5nZXRNZXRhZGF0YSgnY29waWxvdC53b3JrdHJlZS5icmFuY2hOYW1lJyksXG5cdFx0XHRwYXRoOiBhd2FpdCBkYi5nZXRNZXRhZGF0YSgnY29waWxvdC53b3JrdHJlZS5wYXRoJyksXG5cdFx0XHRyZXBvc2l0b3J5Um9vdDogYXdhaXQgZGIuZ2V0TWV0YWRhdGEoJ2NvcGlsb3Qud29ya3RyZWUucmVwb3NpdG9yeVJvb3QnKSxcblx0XHRcdGRpZmZCYXNlQnJhbmNoOiBhd2FpdCBkYi5nZXRNZXRhZGF0YSgnYWdlbnRIb3N0LmRpZmZCYXNlQnJhbmNoJyksXG5cdFx0XHRwcm9qZWN0OiBwcm9qZWN0ICYmIHsgdXJpOiBwcm9qZWN0LnVyaS50b1N0cmluZygpLCBkaXNwbGF5TmFtZTogcHJvamVjdC5kaXNwbGF5TmFtZSB9LFxuXHRcdH0sIHtcblx0XHRcdHJlY29yZGVkOiB0cnVlLFxuXHRcdFx0YnJhbmNoTmFtZTogJ2FnZW50cy9hZG9wdGVkJyxcblx0XHRcdHBhdGg6IHdvcmt0cmVlQ2hlY2tvdXQudG9TdHJpbmcoKSxcblx0XHRcdHJlcG9zaXRvcnlSb290OiByZXBvUm9vdC50b1N0cmluZygpLFxuXHRcdFx0ZGlmZkJhc2VCcmFuY2g6ICdtYWluJyxcblx0XHRcdHByb2plY3Q6IHsgdXJpOiByZXBvUm9vdC50b1N0cmluZygpLCBkaXNwbGF5TmFtZTogYmFzZW5hbWUocmVwb1Jvb3QpIH0sXG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2Fkb3B0RXhpc3RpbmdXb3JrdHJlZU1ldGFkYXRhIGlzIGEgbm8tb3AgZm9yIGEgcHJpbWFyeSBjaGVja291dCcsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBnaXRTZXJ2aWNlID0gY3JlYXRlR2l0U2VydmljZSgpO1xuXHRcdGdpdFNlcnZpY2UuZ2V0UmVwb3NpdG9yeVJvb3QgPSBhc3luYyAoKSA9PiByZXBvUm9vdDtcblx0XHRnaXRTZXJ2aWNlLmdldFdvcmt0cmVlUm9vdHMgPSBhc3luYyAoKSA9PiBbcmVwb1Jvb3RdO1xuXHRcdGNvbnN0IGlzb2xhdGlvbiA9IGNyZWF0ZUlzb2xhdGlvbihkaXNwb3NhYmxlcywgeyBnaXRTZXJ2aWNlIH0pO1xuXG5cdFx0Y29uc3QgcmVjb3JkZWQgPSBhd2FpdCBpc29sYXRpb24uYWRvcHRFeGlzdGluZ1dvcmt0cmVlTWV0YWRhdGEoc2Vzc2lvblVyaSwgcmVwb1Jvb3QpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRyZWNvcmRlZCxcblx0XHRcdGJyYW5jaE5hbWU6IGF3YWl0IGRiLmdldE1ldGFkYXRhKCdjb3BpbG90Lndvcmt0cmVlLmJyYW5jaE5hbWUnKSxcblx0XHRcdHJlcG9zaXRvcnlSb290OiBhd2FpdCBkYi5nZXRNZXRhZGF0YSgnY29waWxvdC53b3JrdHJlZS5yZXBvc2l0b3J5Um9vdCcpLFxuXHRcdH0sIHtcblx0XHRcdHJlY29yZGVkOiBmYWxzZSxcblx0XHRcdGJyYW5jaE5hbWU6IHVuZGVmaW5lZCxcblx0XHRcdHJlcG9zaXRvcnlSb290OiB1bmRlZmluZWQsXG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2FwcGx5UmVzdG9yZUFubm91bmNlbWVudCBwcmVwZW5kcyBhIG1hcmtkb3duIHBhcnQgd2hlbiB3b3JrdHJlZSBtZXRhZGF0YSBleGlzdHMnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgaXNvbGF0aW9uID0gY3JlYXRlSXNvbGF0aW9uKGRpc3Bvc2FibGVzKTtcblx0XHRjb25zdCB0dXJuOiBUdXJuID0ge1xuXHRcdFx0aWQ6ICd0MScsXG5cdFx0XHRtZXNzYWdlOiB7IHRleHQ6ICdoaScsIG9yaWdpbjogeyBraW5kOiBNZXNzYWdlS2luZC5Vc2VyIH0gfSxcblx0XHRcdHJlc3BvbnNlUGFydHM6IFtdLFxuXHRcdFx0dXNhZ2U6IHVuZGVmaW5lZCxcblx0XHRcdHN0YXRlOiBUdXJuU3RhdGUuQ29tcGxldGUsXG5cdFx0fTtcblxuXHRcdGNvbnN0IHdpdGhvdXRNZXRhID0gYXdhaXQgaXNvbGF0aW9uLmFwcGx5UmVzdG9yZUFubm91bmNlbWVudChzZXNzaW9uVXJpLCBbdHVybl0pO1xuXHRcdGF3YWl0IGlzb2xhdGlvbi5yZXNvbHZlV29ya2luZ0RpcmVjdG9yeSh7IHNlc3Npb25VcmksIHNlc3Npb25JZCwgd29ya2luZ0RpcmVjdG9yeTogcmVwb1Jvb3QsIGNvbmZpZzogeyBbU2Vzc2lvbkNvbmZpZ0tleS5Jc29sYXRpb25dOiAnd29ya3RyZWUnLCBbU2Vzc2lvbkNvbmZpZ0tleS5CcmFuY2hdOiAnbWFpbicgfSB9KTtcblx0XHRjb25zdCB3aXRoTWV0YSA9IGF3YWl0IGlzb2xhdGlvbi5hcHBseVJlc3RvcmVBbm5vdW5jZW1lbnQoc2Vzc2lvblVyaSwgW3R1cm5dKTtcblx0XHRjb25zdCBmaXJzdFBhcnQgPSB3aXRoTWV0YVswXS5yZXNwb25zZVBhcnRzWzBdO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHR1bmNoYW5nZWRXaGVuTm9NZXRhOiB3aXRob3V0TWV0YVswXS5yZXNwb25zZVBhcnRzLmxlbmd0aCxcblx0XHRcdGZpcnN0UGFydEtpbmQ6IGZpcnN0UGFydD8ua2luZCxcblx0XHRcdGZpcnN0UGFydEhhc0JyYW5jaDogZmlyc3RQYXJ0Py5raW5kID09PSBSZXNwb25zZVBhcnRLaW5kLk1hcmtkb3duID8gZmlyc3RQYXJ0LmNvbnRlbnQuaW5jbHVkZXMoYnJhbmNoTmFtZSkgOiBmYWxzZSxcblx0XHR9LCB7XG5cdFx0XHR1bmNoYW5nZWRXaGVuTm9NZXRhOiAwLFxuXHRcdFx0Zmlyc3RQYXJ0S2luZDogUmVzcG9uc2VQYXJ0S2luZC5NYXJrZG93bixcblx0XHRcdGZpcnN0UGFydEhhc0JyYW5jaDogdHJ1ZSxcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnd29ya3RyZWUgZmFpbHVyZSBub3RpZmljYXRpb24gYm91bmRzIGFuZCBlc2NhcGVzIGRpYWdub3N0aWNzJywgKCkgPT4ge1xuXHRcdGNvbnN0IGRpYWdub3N0aWMgPSBgZ2l0LWxmcyBcXGBmaWx0ZXJcXGBcXG4keyd4Jy5yZXBlYXQoMjUwKX1gO1xuXHRcdGNvbnN0IG5vdGlmaWNhdGlvbiA9IGJ1aWxkV29ya3RyZWVGYWlsdXJlTm90aWZpY2F0aW9uKGRpYWdub3N0aWMpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRub3JtYWxpemVkTGVuZ3RoOiBub3JtYWxpemVXb3JrdHJlZUZhaWx1cmVEaWFnbm9zdGljKGRpYWdub3N0aWMpPy5sZW5ndGgsXG5cdFx0XHRraW5kOiBub3RpZmljYXRpb24ua2luZCxcblx0XHRcdGNvbnRlbnQ6IG5vdGlmaWNhdGlvbi5jb250ZW50LFxuXHRcdFx0bWV0YTogbm90aWZpY2F0aW9uLl9tZXRhLFxuXHRcdH0sIHtcblx0XHRcdG5vcm1hbGl6ZWRMZW5ndGg6IDIwMCxcblx0XHRcdGtpbmQ6IFJlc3BvbnNlUGFydEtpbmQuU3lzdGVtTm90aWZpY2F0aW9uLFxuXHRcdFx0Y29udGVudDogYENvdWxkbid0IGNyZWF0ZSB0aGUgaXNvbGF0ZWQgd29ya3RyZWUuIFRoaXMgc2Vzc2lvbiBpcyBjb250aW51aW5nIGluIHRoZSBvcmlnaW5hbCBmb2xkZXIuXFxuXFxuXFxgXFxgZ2l0LWxmcyBcXGBmaWx0ZXJcXGAgJHsneCcucmVwZWF0KDE4MCl9Li4uXFxgXFxgYCxcblx0XHRcdG1ldGE6IHsga2luZDogJ3dvcmt0cmVlQ3JlYXRpb25GYWlsdXJlJywgc2V2ZXJpdHk6ICd3YXJuaW5nJyB9LFxuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdhcHBseVJlc3RvcmVBbm5vdW5jZW1lbnQgcmVzdG9yZXMgYSB3b3JrdHJlZSBmYWlsdXJlIG9ubHkgZm9yIGl0cyBvcmlnaW5hdGluZyBzZXNzaW9uJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IGlzb2xhdGlvbiA9IGNyZWF0ZUlzb2xhdGlvbihkaXNwb3NhYmxlcyk7XG5cdFx0Y29uc3QgdHVybjogVHVybiA9IHtcblx0XHRcdGlkOiAndDEnLFxuXHRcdFx0bWVzc2FnZTogeyB0ZXh0OiAnaGknLCBvcmlnaW46IHsga2luZDogTWVzc2FnZUtpbmQuVXNlciB9IH0sXG5cdFx0XHRyZXNwb25zZVBhcnRzOiBbXSxcblx0XHRcdHVzYWdlOiB1bmRlZmluZWQsXG5cdFx0XHRzdGF0ZTogVHVyblN0YXRlLkNvbXBsZXRlLFxuXHRcdH07XG5cdFx0YXdhaXQgaXNvbGF0aW9uLnBlcnNpc3RDcmVhdGlvbkZhaWx1cmUoc2Vzc2lvblVyaSwgc2Vzc2lvbklkLCAnZ2l0IHdvcmt0cmVlIGV4aXRlZCB3aXRoIGNvZGUgMTI4Jyk7XG5cblx0XHRjb25zdCBtYXRjaGluZyA9IGF3YWl0IGlzb2xhdGlvbi5hcHBseVJlc3RvcmVBbm5vdW5jZW1lbnQoc2Vzc2lvblVyaSwgW3R1cm5dKTtcblx0XHRjb25zdCBjb3BpZWQgPSBhd2FpdCBpc29sYXRpb24uYXBwbHlSZXN0b3JlQW5ub3VuY2VtZW50KFVSSS5wYXJzZSgnYWdlbnQtc2Vzc2lvbjovL3Rlc3QvY29waWVkJyksIFt0dXJuXSk7XG5cdFx0Y29uc3QgZW1wdHkgPSBhd2FpdCBpc29sYXRpb24uYXBwbHlSZXN0b3JlQW5ub3VuY2VtZW50KHNlc3Npb25VcmksIFtdKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0bWF0Y2hpbmc6IG1hdGNoaW5nWzBdLnJlc3BvbnNlUGFydHNbMF0sXG5cdFx0XHRjb3BpZWRQYXJ0Q291bnQ6IGNvcGllZFswXS5yZXNwb25zZVBhcnRzLmxlbmd0aCxcblx0XHRcdGVtcHR5VHVybkNvdW50OiBlbXB0eS5sZW5ndGgsXG5cdFx0fSwge1xuXHRcdFx0bWF0Y2hpbmc6IHtcblx0XHRcdFx0a2luZDogUmVzcG9uc2VQYXJ0S2luZC5TeXN0ZW1Ob3RpZmljYXRpb24sXG5cdFx0XHRcdGNvbnRlbnQ6ICdDb3VsZG5cXCd0IGNyZWF0ZSB0aGUgaXNvbGF0ZWQgd29ya3RyZWUuIFRoaXMgc2Vzc2lvbiBpcyBjb250aW51aW5nIGluIHRoZSBvcmlnaW5hbCBmb2xkZXIuXFxuXFxuYGdpdCB3b3JrdHJlZSBleGl0ZWQgd2l0aCBjb2RlIDEyOGAnLFxuXHRcdFx0XHRfbWV0YTogeyBraW5kOiAnd29ya3RyZWVDcmVhdGlvbkZhaWx1cmUnLCBzZXZlcml0eTogJ3dhcm5pbmcnIH0sXG5cdFx0XHR9LFxuXHRcdFx0Y29waWVkUGFydENvdW50OiAwLFxuXHRcdFx0ZW1wdHlUdXJuQ291bnQ6IDAsXG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2NsZWFudXAgb24gYXJjaGl2ZSByZW1vdmVzIGEgY2xlYW4gd29ya3RyZWUgYW5kIHVuYXJjaGl2ZSByZWNyZWF0ZXMgaXQnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgaXNvbGF0aW9uID0gY3JlYXRlSXNvbGF0aW9uKGRpc3Bvc2FibGVzKTtcblx0XHRjb25zdCB3b3JrdHJlZSA9IGF3YWl0IGlzb2xhdGlvbi5yZXNvbHZlV29ya2luZ0RpcmVjdG9yeSh7IHNlc3Npb25VcmksIHNlc3Npb25JZCwgd29ya2luZ0RpcmVjdG9yeTogcmVwb1Jvb3QsIGNvbmZpZzogeyBbU2Vzc2lvbkNvbmZpZ0tleS5Jc29sYXRpb25dOiAnd29ya3RyZWUnLCBbU2Vzc2lvbkNvbmZpZ0tleS5CcmFuY2hdOiAnbWFpbicgfSB9KTtcblxuXHRcdGF3YWl0IGlzb2xhdGlvbi5jbGVhbnVwV29ya3RyZWVPbkFyY2hpdmUoc2Vzc2lvblVyaSwgc2Vzc2lvbklkKTtcblx0XHRjb25zdCByZW1vdmVkRHVyaW5nQXJjaGl2ZSA9IHdvcmt0cmVlID8gIWV4aXN0c1N5bmMod29ya3RyZWUuZnNQYXRoKSA6IGZhbHNlO1xuXHRcdGF3YWl0IGlzb2xhdGlvbi5yZWNyZWF0ZVdvcmt0cmVlT25VbmFyY2hpdmUoc2Vzc2lvblVyaSwgc2Vzc2lvbklkKTtcblx0XHRjb25zdCByZXN0b3JlZER1cmluZ1VuYXJjaGl2ZSA9IHdvcmt0cmVlID8gZXhpc3RzU3luYyh3b3JrdHJlZS5mc1BhdGgpIDogZmFsc2U7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdHJlbW92ZUNhbGxzOiByZW1vdmVDYWxscy5tYXAoY2FsbCA9PiAoeyB3b3JrdHJlZTogY2FsbC53b3JrdHJlZS50b1N0cmluZygpLCBmb3JjZTogY2FsbC5mb3JjZSB9KSksXG5cdFx0XHRyZW1vdmVkRHVyaW5nQXJjaGl2ZSxcblx0XHRcdGFkZEV4aXN0aW5nQ2FsbHM6IGFkZEV4aXN0aW5nQ2FsbHMubWFwKGMgPT4gKHsgd29ya3RyZWU6IGMud29ya3RyZWUudG9TdHJpbmcoKSwgYnJhbmNoTmFtZTogYy5icmFuY2hOYW1lIH0pKSxcblx0XHRcdHJlc3RvcmVkRHVyaW5nVW5hcmNoaXZlLFxuXHRcdH0sIHtcblx0XHRcdHJlbW92ZUNhbGxzOiBbeyB3b3JrdHJlZTogd29ya3RyZWUhLnRvU3RyaW5nKCksIGZvcmNlOiBmYWxzZSB9XSxcblx0XHRcdHJlbW92ZWREdXJpbmdBcmNoaXZlOiB0cnVlLFxuXHRcdFx0YWRkRXhpc3RpbmdDYWxsczogW3sgd29ya3RyZWU6IHdvcmt0cmVlIS50b1N0cmluZygpLCBicmFuY2hOYW1lIH1dLFxuXHRcdFx0cmVzdG9yZWREdXJpbmdVbmFyY2hpdmU6IHRydWUsXG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3JlbW92ZVNlc3Npb25Xb3JrdHJlZSBmb3JjZS1yZW1vdmVzIGEgd29ya3RyZWUgZm9yIGV4cGxpY2l0IHNlc3Npb24gZGVsZXRpb24nLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgaXNvbGF0aW9uID0gY3JlYXRlSXNvbGF0aW9uKGRpc3Bvc2FibGVzKTtcblx0XHRjb25zdCB3b3JrdHJlZSA9IGF3YWl0IGlzb2xhdGlvbi5yZXNvbHZlV29ya2luZ0RpcmVjdG9yeSh7IHNlc3Npb25VcmksIHNlc3Npb25JZCwgd29ya2luZ0RpcmVjdG9yeTogcmVwb1Jvb3QsIGNvbmZpZzogeyBbU2Vzc2lvbkNvbmZpZ0tleS5Jc29sYXRpb25dOiAnd29ya3RyZWUnLCBbU2Vzc2lvbkNvbmZpZ0tleS5CcmFuY2hdOiAnbWFpbicgfSB9KTtcblxuXHRcdGF3YWl0IGlzb2xhdGlvbi5yZW1vdmVTZXNzaW9uV29ya3RyZWUoc2Vzc2lvbklkLCBhd2FpdCBpc29sYXRpb24ucHJlcGFyZVNlc3Npb25EZWxldGlvbihzZXNzaW9uVXJpLCBzZXNzaW9uSWQpKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0cmVtb3ZlQ2FsbHM6IHJlbW92ZUNhbGxzLm1hcChjYWxsID0+ICh7IHdvcmt0cmVlOiBjYWxsLndvcmt0cmVlLnRvU3RyaW5nKCksIGZvcmNlOiBjYWxsLmZvcmNlIH0pKSxcblx0XHRcdHJlc29sdmVkV29ya3RyZWU6IGlzb2xhdGlvbi5nZXRSZXNvbHZlZFdvcmt0cmVlKHNlc3Npb25JZCksXG5cdFx0fSwge1xuXHRcdFx0cmVtb3ZlQ2FsbHM6IFt7IHdvcmt0cmVlOiB3b3JrdHJlZSEudG9TdHJpbmcoKSwgZm9yY2U6IHRydWUgfV0sXG5cdFx0XHRyZXNvbHZlZFdvcmt0cmVlOiB1bmRlZmluZWQsXG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3Nlc3Npb24gZGVsZXRpb24gcmVtb3ZlcyBhIHBlcnNpc3RlZCB3b3JrdHJlZSBhZnRlciBhIHByb2Nlc3MgcmVzdGFydCcsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCB3b3JrdHJlZSA9IFVSSS5qb2luUGF0aCh3b3JrdHJlZXNSb290LCAncGVyc2lzdGVkLXdvcmt0cmVlJyk7XG5cdFx0bWtkaXJTeW5jKHdvcmt0cmVlLmZzUGF0aCwgeyByZWN1cnNpdmU6IHRydWUgfSk7XG5cdFx0YXdhaXQgUHJvbWlzZS5hbGwoW1xuXHRcdFx0ZGIuc2V0TWV0YWRhdGEoJ2NvcGlsb3Qud29ya3RyZWUuYnJhbmNoTmFtZScsICdmZWF0dXJlL3gnKSxcblx0XHRcdGRiLnNldE1ldGFkYXRhKCdjb3BpbG90Lndvcmt0cmVlLnBhdGgnLCB3b3JrdHJlZS50b1N0cmluZygpKSxcblx0XHRcdGRiLnNldE1ldGFkYXRhKCdjb3BpbG90Lndvcmt0cmVlLnJlcG9zaXRvcnlSb290JywgcmVwb1Jvb3QudG9TdHJpbmcoKSksXG5cdFx0XSk7XG5cdFx0Y29uc3QgaXNvbGF0aW9uID0gY3JlYXRlSXNvbGF0aW9uKGRpc3Bvc2FibGVzKTtcblxuXHRcdGNvbnN0IHdvcmt0cmVlVG9SZW1vdmUgPSBhd2FpdCBpc29sYXRpb24ucHJlcGFyZVNlc3Npb25EZWxldGlvbihzZXNzaW9uVXJpLCBzZXNzaW9uSWQpO1xuXHRcdGF3YWl0IGlzb2xhdGlvbi5yZW1vdmVTZXNzaW9uV29ya3RyZWUoc2Vzc2lvbklkLCB3b3JrdHJlZVRvUmVtb3ZlKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0cmVtb3ZlQ2FsbHM6IHJlbW92ZUNhbGxzLm1hcChjYWxsID0+ICh7IHdvcmt0cmVlOiBjYWxsLndvcmt0cmVlLnRvU3RyaW5nKCksIGZvcmNlOiBjYWxsLmZvcmNlIH0pKSxcblx0XHRcdHJlc29sdmVkV29ya3RyZWU6IGlzb2xhdGlvbi5nZXRSZXNvbHZlZFdvcmt0cmVlKHNlc3Npb25JZCksXG5cdFx0fSwge1xuXHRcdFx0cmVtb3ZlQ2FsbHM6IFt7IHdvcmt0cmVlOiB3b3JrdHJlZS50b1N0cmluZygpLCBmb3JjZTogdHJ1ZSB9XSxcblx0XHRcdHJlc29sdmVkV29ya3RyZWU6IHVuZGVmaW5lZCxcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnZmFpbGVkIHdvcmt0cmVlIHJlbW92YWwgcmVqZWN0cyBhbmQgcmVtYWlucyBhdmFpbGFibGUgZm9yIHJldHJ5JywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IGdpdFNlcnZpY2UgPSBjcmVhdGVHaXRTZXJ2aWNlKCk7XG5cdFx0Z2l0U2VydmljZS5yZW1vdmVXb3JrdHJlZSA9IGFzeW5jICgpID0+IHsgdGhyb3cgbmV3IEVycm9yKCdyZW1vdmUgZmFpbGVkJyk7IH07XG5cdFx0Y29uc3QgaXNvbGF0aW9uID0gY3JlYXRlSXNvbGF0aW9uKGRpc3Bvc2FibGVzLCB7IGdpdFNlcnZpY2UgfSk7XG5cdFx0Y29uc3Qgd29ya3RyZWUgPSBVUkkuam9pblBhdGgod29ya3RyZWVzUm9vdCwgJ3BlcnNpc3RlZC13b3JrdHJlZScpO1xuXHRcdGF3YWl0IFByb21pc2UuYWxsKFtcblx0XHRcdGRiLnNldE1ldGFkYXRhKCdjb3BpbG90Lndvcmt0cmVlLmJyYW5jaE5hbWUnLCAnZmVhdHVyZS94JyksXG5cdFx0XHRkYi5zZXRNZXRhZGF0YSgnY29waWxvdC53b3JrdHJlZS5wYXRoJywgd29ya3RyZWUudG9TdHJpbmcoKSksXG5cdFx0XHRkYi5zZXRNZXRhZGF0YSgnY29waWxvdC53b3JrdHJlZS5yZXBvc2l0b3J5Um9vdCcsIHJlcG9Sb290LnRvU3RyaW5nKCkpLFxuXHRcdF0pO1xuXG5cdFx0Y29uc3Qgd29ya3RyZWVUb1JlbW92ZSA9IGF3YWl0IGlzb2xhdGlvbi5wcmVwYXJlU2Vzc2lvbkRlbGV0aW9uKHNlc3Npb25VcmksIHNlc3Npb25JZCk7XG5cdFx0YXdhaXQgYXNzZXJ0LnJlamVjdHMoKCkgPT4gaXNvbGF0aW9uLnJlbW92ZVNlc3Npb25Xb3JrdHJlZShzZXNzaW9uSWQsIHdvcmt0cmVlVG9SZW1vdmUpLCAvcmVtb3ZlIGZhaWxlZC8pO1xuXHRcdGNvbnN0IHJldHJ5ID0gYXdhaXQgaXNvbGF0aW9uLnByZXBhcmVTZXNzaW9uRGVsZXRpb24oc2Vzc2lvblVyaSwgc2Vzc2lvbklkKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0cmV0cnlSZXBvc2l0b3J5Um9vdDogcmV0cnk/LnJlcG9zaXRvcnlSb290LnRvU3RyaW5nKCksXG5cdFx0XHRyZXRyeVdvcmt0cmVlOiByZXRyeT8ud29ya3RyZWUudG9TdHJpbmcoKSxcblx0XHR9LCB7XG5cdFx0XHRyZXRyeVJlcG9zaXRvcnlSb290OiByZXBvUm9vdC50b1N0cmluZygpLFxuXHRcdFx0cmV0cnlXb3JrdHJlZTogd29ya3RyZWUudG9TdHJpbmcoKSxcblx0XHR9KTtcblx0fSk7XG59KTtcbiJdLAogICJtYXBwaW5ncyI6ICJBQUtBLE9BQU8sWUFBWTtBQUNuQixTQUFTLFlBQVksV0FBVyxhQUFhLGNBQWM7QUFDM0QsU0FBUyxjQUFjO0FBQ3ZCLFNBQVMsZUFBZTtBQUV4QixTQUFTLFlBQVk7QUFDckIsU0FBUyxnQkFBZ0I7QUFDekIsU0FBUyxXQUFXO0FBQ3BCLFNBQVMsK0NBQStDO0FBQ3hELFNBQVMsc0JBQXNCO0FBQy9CLFNBQVMsa0JBQXdDO0FBQ2pELFNBQVMsd0JBQXdCO0FBQ2pDLFNBQVMsNEJBQTRCLHdCQUF3QixhQUFhLGtCQUFrQixpQkFBNEI7QUFDeEgsU0FBUyxnQ0FBMkQ7QUFFcEUsU0FBUyxrQ0FBa0Msb0NBQW9DLHFDQUFxQyxtQkFBbUIsaUJBQWlCLHdCQUF3QjtBQUNoTCxTQUFTLHFCQUFxQixzQkFBc0IsZ0NBQWdDO0FBTXBGLFNBQVMsOEJBQWtEO0FBQzFELFNBQU87QUFBQSxJQUNOLGVBQWU7QUFBQSxJQUNmLFVBQVUsSUFBSSxVQUE0QjtBQUFFLFlBQU0sSUFBSSxNQUFNLGlCQUFpQjtBQUFBLElBQUc7QUFBQSxJQUNoRixhQUFhLFlBQVk7QUFBRSxZQUFNLElBQUksTUFBTSxpQkFBaUI7QUFBQSxJQUFHO0FBQUEsSUFDL0QsUUFBUSxZQUFZLENBQUM7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
