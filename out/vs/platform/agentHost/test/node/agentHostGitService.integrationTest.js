import assert from "assert";
import * as cp from "child_process";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync } from "fs";
import { tmpdir } from "os";
import { NullLogService } from "../../../log/common/log.js";
import { join } from "../../../../base/common/path.js";
import { URI } from "../../../../base/common/uri.js";
import { isWindows } from "../../../../base/common/platform.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../base/test/common/utils.js";
import { FileService } from "../../../files/common/fileService.js";
import { Schemas } from "../../../../base/common/network.js";
import { DiskFileSystemProvider } from "../../../files/node/diskFileSystemProvider.js";
import { AgentHostGitService } from "../../node/agentHostGitService.js";
function createGitService(disposables) {
  const logService = new NullLogService();
  const fileService = disposables.add(new FileService(logService));
  disposables.add(fileService.registerProvider(Schemas.file, disposables.add(new DiskFileSystemProvider(logService))));
  const env = { tmpDir: URI.file(tmpdir()) };
  return new AgentHostGitService(fileService, env, logService);
}
function rmDirWithRetry(path) {
  if (!path) {
    return;
  }
  try {
    rmSync(path, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 });
  } catch {
  }
}
suite("AgentHostGitService - getSessionGitState (real git)", () => {
  const disposables = ensureNoDisposablesAreLeakedInTestSuite();
  const hasGit = (() => {
    try {
      cp.execFileSync("git", ["--version"], { stdio: "ignore" });
      return true;
    } catch {
      return false;
    }
  })();
  let tmpRoot;
  let svc;
  setup(() => {
    tmpRoot = void 0;
    svc = createGitService(disposables);
  });
  teardown(() => {
    rmDirWithRetry(tmpRoot);
  });
  function initRepo(opts) {
    tmpRoot = mkdtempSync(join(tmpdir(), "agent-host-git-"));
    const env = { ...process.env, GIT_AUTHOR_NAME: "t", GIT_AUTHOR_EMAIL: "t@t", GIT_COMMITTER_NAME: "t", GIT_COMMITTER_EMAIL: "t@t" };
    const run = (...args) => cp.execFileSync("git", args, { cwd: tmpRoot, env, stdio: "pipe" });
    run("init", "-q", "-b", opts?.baseBranch ?? "main");
    run("commit", "-q", "--allow-empty", "-m", "initial");
    if (opts?.remote) {
      run("remote", "add", "origin", opts.remote);
    }
    return tmpRoot;
  }
  (hasGit ? test : test.skip)("returns undefined for a non-git directory", async () => {
    const dir = mkdtempSync(join(tmpdir(), "agent-host-nongit-"));
    tmpRoot = dir;
    const result = await svc.getSessionGitState(URI.file(dir));
    assert.strictEqual(result, void 0);
  });
  (hasGit ? test : test.skip)("reports branch, github remote and clean state for a fresh repo", async () => {
    const dir = initRepo({ remote: "https://github.com/owner/repo.git" });
    const result = await svc.getSessionGitState(URI.file(dir));
    assert.ok(result, "expected git state");
    assert.strictEqual(result.branchName, "main");
    assert.strictEqual(result.hasGitHubRemote, true);
    assert.strictEqual(result.uncommittedChanges, 0);
    assert.strictEqual(result.upstreamBranchName, void 0);
    assert.strictEqual(result.outgoingChanges, void 0);
    assert.strictEqual(result.incomingChanges, void 0);
  });
  (hasGit ? test : test.skip)("reports the GitHub owner of the branch upstream remote", async () => {
    const dir = initRepo({ remote: "https://github.com/base-owner/repo.git" });
    cp.execFileSync("git", ["remote", "add", "fork", "https://github.com/fork-owner/repo.git"], { cwd: dir, stdio: "pipe" });
    cp.execFileSync("git", ["checkout", "-q", "-b", "feature"], { cwd: dir, stdio: "pipe" });
    cp.execFileSync("git", ["update-ref", "refs/remotes/fork/feature", "HEAD"], { cwd: dir, stdio: "pipe" });
    cp.execFileSync("git", ["branch", "--set-upstream-to", "fork/feature"], { cwd: dir, stdio: "pipe" });
    const result = await svc.getSessionGitState(URI.file(dir));
    assert.deepStrictEqual({
      githubOwner: result?.githubOwner,
      githubHeadOwner: result?.githubHeadOwner,
      githubRepo: result?.githubRepo,
      upstreamBranchName: result?.upstreamBranchName
    }, {
      githubOwner: "base-owner",
      githubHeadOwner: "fork-owner",
      githubRepo: "repo",
      upstreamBranchName: "fork/feature"
    });
  });
  (hasGit ? test : test.skip)("reports the GitHub owner of a branch push remote without an upstream", async () => {
    const dir = initRepo({ remote: "https://github.com/base-owner/repo.git" });
    cp.execFileSync("git", ["checkout", "-q", "-b", "feature"], { cwd: dir, stdio: "pipe" });
    cp.execFileSync("git", ["config", "branch.feature.remote", "https://github.com/fork-owner/repo.git"], { cwd: dir, stdio: "pipe" });
    cp.execFileSync("git", ["config", "branch.feature.pushremote", "https://github.com/fork-owner/repo.git"], { cwd: dir, stdio: "pipe" });
    const result = await svc.getSessionGitState(URI.file(dir));
    assert.deepStrictEqual({
      githubOwner: result?.githubOwner,
      githubHeadOwner: result?.githubHeadOwner,
      githubRepo: result?.githubRepo,
      upstreamBranchName: result?.upstreamBranchName
    }, {
      githubOwner: "base-owner",
      githubHeadOwner: "fork-owner",
      githubRepo: "repo",
      upstreamBranchName: void 0
    });
  });
  (hasGit ? test : test.skip)("resolves the default branch name and remote-tracking start point", async () => {
    const dir = initRepo();
    cp.execFileSync("git", ["update-ref", "refs/remotes/origin/main", "refs/heads/main"], { cwd: dir, stdio: "pipe" });
    cp.execFileSync("git", ["symbolic-ref", "refs/remotes/origin/HEAD", "refs/remotes/origin/main"], { cwd: dir, stdio: "pipe" });
    assert.deepStrictEqual(await svc.getDefaultBranch(URI.file(dir)), {
      name: "main",
      startPoint: "origin/main"
    });
  });
  (hasGit ? test : test.skip)("falls back to the local branch when the default remote-tracking ref is missing", async () => {
    const dir = initRepo();
    cp.execFileSync("git", ["symbolic-ref", "refs/remotes/origin/HEAD", "refs/remotes/origin/main"], { cwd: dir, stdio: "pipe" });
    assert.deepStrictEqual(await svc.getDefaultBranch(URI.file(dir)), {
      name: "main",
      startPoint: "main"
    });
  });
  (hasGit ? test : test.skip)("counts uncommitted changes", async () => {
    const dir = initRepo({ remote: "git@gitlab.com:owner/repo.git" });
    const fs = await import("fs/promises");
    await fs.writeFile(join(dir, "a.txt"), "hello");
    await fs.writeFile(join(dir, "b.txt"), "world");
    const result = await svc.getSessionGitState(URI.file(dir));
    assert.ok(result);
    assert.strictEqual(result.uncommittedChanges, 2);
    assert.strictEqual(result.hasGitHubRemote, false);
  });
  (hasGit ? test : test.skip)("reports outgoingChanges relative to base branch when local branch has no upstream", async () => {
    const remoteDir = mkdtempSync(join(tmpdir(), "agent-host-remote-"));
    const env = { ...process.env, GIT_AUTHOR_NAME: "t", GIT_AUTHOR_EMAIL: "t@t", GIT_COMMITTER_NAME: "t", GIT_COMMITTER_EMAIL: "t@t" };
    try {
      cp.execFileSync("git", ["init", "-q", "--bare", "-b", "main"], { cwd: remoteDir, env, stdio: "pipe" });
      tmpRoot = mkdtempSync(join(tmpdir(), "agent-host-git-"));
      const run = (...args) => cp.execFileSync("git", args, { cwd: tmpRoot, env, stdio: "pipe" });
      run("init", "-q", "-b", "main");
      run("config", "commit.gpgSign", "false");
      run("commit", "-q", "--allow-empty", "-m", "initial");
      run("remote", "add", "origin", `https://github.com/owner/repo.git`);
      run("remote", "add", "tmp", remoteDir);
      run("push", "-q", "tmp", "main:main");
      run("update-ref", "refs/remotes/origin/main", "refs/heads/main");
      run("symbolic-ref", "refs/remotes/origin/HEAD", "refs/remotes/origin/main");
      run("checkout", "-q", "-b", "feature", "--no-track");
      run("commit", "-q", "--allow-empty", "-m", "one");
      run("commit", "-q", "--allow-empty", "-m", "two");
      const result = await svc.getSessionGitState(URI.file(tmpRoot));
      assert.ok(result, "expected git state");
      assert.strictEqual(result.branchName, "feature");
      assert.strictEqual(result.baseBranchName, "main");
      assert.strictEqual(result.upstreamBranchName, void 0);
      assert.strictEqual(result.outgoingChanges, 2);
      assert.strictEqual(result.hasBaseBranchChanges, true);
      assert.strictEqual(result.uncommittedChanges, 0);
      run("branch", "-D", "main");
      const remoteOnlyResult = await svc.getSessionGitState(URI.file(tmpRoot));
      assert.strictEqual(remoteOnlyResult?.hasBaseBranchChanges, true);
    } finally {
      rmDirWithRetry(remoteDir);
    }
  });
});
suite("AgentHostGitService - computeSessionFileDiffs (real git)", () => {
  const disposables = ensureNoDisposablesAreLeakedInTestSuite();
  const hasGit = (() => {
    try {
      cp.execFileSync("git", ["--version"], { stdio: "ignore" });
      return true;
    } catch {
      return false;
    }
  })();
  let tmpRoot;
  let svc;
  setup(() => {
    tmpRoot = void 0;
    svc = createGitService(disposables);
  });
  teardown(() => {
    rmDirWithRetry(tmpRoot);
  });
  function initRepo() {
    tmpRoot = mkdtempSync(join(tmpdir(), "agent-host-diff-"));
    const env = { ...process.env, GIT_AUTHOR_NAME: "t", GIT_AUTHOR_EMAIL: "t@t", GIT_COMMITTER_NAME: "t", GIT_COMMITTER_EMAIL: "t@t" };
    const run = (...args) => cp.execFileSync("git", args, { cwd: tmpRoot, env, stdio: "pipe" });
    run("init", "-q", "-b", "main");
    return { dir: tmpRoot, run };
  }
  (hasGit ? test : test.skip)("returns undefined for a non-git directory", async () => {
    const dir = mkdtempSync(join(tmpdir(), "agent-host-nongit-diff-"));
    tmpRoot = dir;
    const result = await svc.computeSessionFileDiffs(URI.file(dir), { sessionUri: "copilot:/s" });
    assert.strictEqual(result, void 0);
  });
  (hasGit ? test : test.skip)("reports modified, added (untracked) and deleted files against HEAD", async () => {
    const fs = await import("fs/promises");
    const { dir, run } = initRepo();
    await fs.writeFile(join(dir, "kept.txt"), "one\ntwo\nthree\n");
    await fs.writeFile(join(dir, "gone.txt"), "bye\n");
    run("add", ".");
    run("commit", "-q", "-m", "init");
    await fs.writeFile(join(dir, "kept.txt"), "one\ntwo\nthree\nfour\n");
    await fs.writeFile(join(dir, "fresh.txt"), "hello\n");
    await fs.unlink(join(dir, "gone.txt"));
    const result = await svc.computeSessionFileDiffs(URI.file(dir), { sessionUri: "copilot:/s" });
    assert.ok(result, "expected diffs");
    const byPath = new Map(result.map((d) => [d.after?.uri ?? d.before?.uri, d]));
    const findByBasename = (name) => result.find((d) => {
      const u = d.after?.uri ?? d.before?.uri;
      return typeof u === "string" && u.endsWith("/" + name);
    });
    const kept = findByBasename("kept.txt");
    assert.ok(kept?.before && kept.after, `modified file should have before+after; result=${JSON.stringify(result.map((d) => ({ a: d.after?.uri, b: d.before?.uri })))}`);
    assert.deepStrictEqual(kept.diff, { added: 1, removed: 0 });
    assert.strictEqual(URI.parse(kept.before.content.uri).scheme, "git-blob", "before content should be a git-blob: URI");
    const fresh = findByBasename("fresh.txt");
    assert.ok(fresh?.after && !fresh.before, "untracked file should have only after");
    const gone = findByBasename("gone.txt");
    assert.ok(gone?.before && !gone.after, "deleted file should have only before");
    void byPath;
  });
  (hasGit ? test : test.skip)("reports staged rename source when untracked files force temp-index staging", async () => {
    const fs = await import("fs/promises");
    const { dir, run } = initRepo();
    await fs.writeFile(join(dir, "old.txt"), "one\n");
    run("add", ".");
    run("commit", "-q", "-m", "init");
    run("mv", "old.txt", "new.txt");
    await fs.writeFile(join(dir, "fresh.txt"), "fresh\n");
    const result = await svc.computeSessionFileDiffs(URI.file(dir), { sessionUri: "copilot:/s" });
    assert.ok(result, "expected diffs");
    const rename = result.find((d) => d.before?.uri.endsWith("/old.txt") && d.after?.uri.endsWith("/new.txt"));
    const fresh = result.find((d) => !d.before && d.after?.uri.endsWith("/fresh.txt"));
    assert.deepStrictEqual({
      rename: rename && { before: URI.parse(rename.before.uri).path.split("/").pop(), after: URI.parse(rename.after.uri).path.split("/").pop() },
      fresh: fresh && URI.parse(fresh.after.uri).path.split("/").pop()
    }, {
      rename: { before: "old.txt", after: "new.txt" },
      fresh: "fresh.txt"
    });
  });
  (hasGit && !isWindows ? test : test.skip)("returns undefined when temp-index staging fails", async () => {
    const fs = await import("fs/promises");
    const { dir } = initRepo();
    const blockedPath = join(dir, "blocked.txt");
    await fs.writeFile(blockedPath, "blocked\n");
    await fs.chmod(blockedPath, 0);
    try {
      const result = await svc.computeSessionFileDiffs(URI.file(dir), { sessionUri: "copilot:/s" });
      assert.strictEqual(result, void 0);
    } finally {
      await fs.chmod(blockedPath, 384);
    }
  });
  (hasGit ? test : test.skip)("anchors against the merge-base of the requested base branch", async () => {
    const fs = await import("fs/promises");
    const { dir, run } = initRepo();
    await fs.writeFile(join(dir, "a.txt"), "a\n");
    run("add", ".");
    run("commit", "-q", "-m", "init");
    run("checkout", "-q", "-b", "feature");
    await fs.writeFile(join(dir, "b.txt"), "b\n");
    run("add", ".");
    run("commit", "-q", "-m", "add b on feature");
    const result = await svc.computeSessionFileDiffs(URI.file(dir), { sessionUri: "copilot:/s", baseBranch: "main" });
    assert.ok(result, "expected diffs");
    const paths = result.map((d) => d.after?.uri ?? d.before?.uri);
    assert.ok(paths.some((p) => p?.endsWith("b.txt")), `expected b.txt in diff; got ${paths.join(", ")}`);
  });
  (hasGit ? test : test.skip)("prefers origin base branch when local base branch is stale", async () => {
    const fs = await import("fs/promises");
    const { dir, run } = initRepo();
    await fs.writeFile(join(dir, "shared.txt"), "base\n");
    run("add", ".");
    run("commit", "-q", "-m", "base");
    run("update-ref", "refs/remotes/origin/main", "HEAD");
    run("checkout", "-q", "-b", "feature");
    run("checkout", "-q", "-b", "upstream", "main");
    await fs.writeFile(join(dir, "upstream.txt"), "upstream\n");
    run("add", ".");
    run("commit", "-q", "-m", "upstream");
    run("update-ref", "refs/remotes/origin/main", "HEAD");
    run("checkout", "-q", "feature");
    run("merge", "-q", "--no-ff", "origin/main", "-m", "merge origin/main");
    await fs.writeFile(join(dir, "feature.txt"), "feature\n");
    run("add", ".");
    run("commit", "-q", "-m", "feature");
    const result = await svc.computeSessionFileDiffs(URI.file(dir), { sessionUri: "copilot:/s", baseBranch: "main" });
    assert.ok(result, "expected diffs");
    const paths = result.map((d) => d.after?.uri ?? d.before?.uri);
    assert.deepStrictEqual({
      feature: paths.some((p) => p?.endsWith("feature.txt")),
      upstream: paths.some((p) => p?.endsWith("upstream.txt"))
    }, {
      feature: true,
      upstream: false
    });
  });
  (hasGit ? test : test.skip)("returns no diffs for a clean repo", async () => {
    const fs = await import("fs/promises");
    const { dir, run } = initRepo();
    await fs.writeFile(join(dir, "a.txt"), "a\n");
    run("add", ".");
    run("commit", "-q", "-m", "init");
    const result = await svc.computeSessionFileDiffs(URI.file(dir), { sessionUri: "copilot:/s" });
    assert.deepStrictEqual(result, []);
  });
  (hasGit ? test : test.skip)("handles an empty repo (no HEAD) by treating files as added", async () => {
    const fs = await import("fs/promises");
    const { dir } = initRepo();
    await fs.writeFile(join(dir, "first.txt"), "hello\n");
    const result = await svc.computeSessionFileDiffs(URI.file(dir), { sessionUri: "copilot:/s" });
    assert.ok(result, "expected diffs");
    assert.strictEqual(result.length, 1);
    assert.ok(result[0].after && !result[0].before, "untracked file in empty repo should be an addition");
  });
  (hasGit ? test : test.skip)("captureWorkingTreeAsTree stages scoped rename source and untracked paths", async () => {
    const fs = await import("fs/promises");
    const { dir, run } = initRepo();
    await fs.writeFile(join(dir, "old.txt"), "one\n");
    run("add", ".");
    run("commit", "-q", "-m", "init");
    run("mv", "old.txt", "new.txt");
    await fs.writeFile(join(dir, "fresh.txt"), "fresh\n");
    const tree = await svc.captureWorkingTreeAsTree(URI.file(dir));
    assert.ok(tree, "expected tree object");
    const treePaths = cp.execFileSync("git", ["ls-tree", "-r", "--name-only", tree], { cwd: dir, encoding: "utf8" }).trim().split(/\r?\n/g).filter(Boolean).sort();
    assert.deepStrictEqual(treePaths, ["fresh.txt", "new.txt"]);
  });
  (hasGit ? test : test.skip)("computes bounded per-file patches from an immutable working-tree snapshot", async () => {
    const fs = await import("fs/promises");
    const { dir, run } = initRepo();
    await fs.writeFile(join(dir, "tracked.txt"), "before\n");
    run("add", ".");
    run("commit", "-q", "-m", "init");
    const baseline = run("rev-parse", "HEAD").toString().trim();
    await fs.writeFile(join(dir, "tracked.txt"), "after\n");
    await fs.writeFile(join(dir, "untracked.txt"), "new\n");
    const tree = await svc.captureWorkingTreeAsTree(URI.file(dir));
    assert.ok(tree);
    const fileDiffs = await svc.computeFileDiffsBetweenRefs(URI.file(dir), { sessionUri: "copilot:/s", fromRef: baseline, toRef: tree });
    assert.ok(fileDiffs);
    const snapshots = await Promise.all(fileDiffs.map(async (fileDiff) => {
      const before = fileDiff.before?.uri ? URI.parse(fileDiff.before.uri).path.split("/").pop() : void 0;
      const after = fileDiff.after?.uri ? URI.parse(fileDiff.after.uri).path.split("/").pop() : void 0;
      const paths = [before, after].filter((path) => path !== void 0);
      const patch = await svc.getDiffPatchBetweenRefs(URI.file(dir), { fromRef: baseline, toRef: tree, paths, maxBuffer: 900 * 1024 });
      return { before, after, patch };
    }));
    assert.deepStrictEqual(snapshots.map((snapshot) => ({
      before: snapshot.before,
      after: snapshot.after,
      tooLarge: snapshot.patch?.tooLarge,
      containsExpectedContent: snapshot.after === "tracked.txt" ? snapshot.patch?.patch?.includes("-before\n+after") : snapshot.patch?.patch?.includes("+new")
    })).sort((a, b) => (a.after ?? "").localeCompare(b.after ?? "")), [{
      before: "tracked.txt",
      after: "tracked.txt",
      tooLarge: false,
      containsExpectedContent: true
    }, {
      before: void 0,
      after: "untracked.txt",
      tooLarge: false,
      containsExpectedContent: true
    }]);
  });
  (hasGit && !isWindows ? test : test.skip)("captureWorkingTreeAsTree returns undefined when staging fails", async () => {
    const fs = await import("fs/promises");
    const { dir } = initRepo();
    const blockedPath = join(dir, "blocked.txt");
    await fs.writeFile(blockedPath, "blocked\n");
    await fs.chmod(blockedPath, 0);
    try {
      const result = await svc.captureWorkingTreeAsTree(URI.file(dir));
      assert.strictEqual(result, void 0);
    } finally {
      await fs.chmod(blockedPath, 384);
    }
  });
  (hasGit ? test : test.skip)("showBlob retrieves committed content", async () => {
    const fs = await import("fs/promises");
    const { dir, run } = initRepo();
    await fs.writeFile(join(dir, "a.txt"), "original\n");
    run("add", ".");
    run("commit", "-q", "-m", "init");
    const ref = cp.execFileSync("git", ["rev-parse", "HEAD"], { cwd: dir, encoding: "utf8" }).trim();
    await fs.writeFile(join(dir, "a.txt"), "changed\n");
    const blob = await svc.showBlob(URI.file(dir), ref, "a.txt");
    assert.ok(blob);
    assert.strictEqual(blob.toString(), "original\n");
  });
});
suite("AgentHostGitService - worktree helpers (real git)", () => {
  const disposables = ensureNoDisposablesAreLeakedInTestSuite();
  const hasGit = (() => {
    try {
      cp.execFileSync("git", ["--version"], { stdio: "ignore" });
      return true;
    } catch {
      return false;
    }
  })();
  let tmpRoot;
  let svc;
  const env = { ...process.env, GIT_AUTHOR_NAME: "t", GIT_AUTHOR_EMAIL: "t@t", GIT_COMMITTER_NAME: "t", GIT_COMMITTER_EMAIL: "t@t" };
  setup(() => {
    tmpRoot = void 0;
    svc = createGitService(disposables);
  });
  teardown(() => {
    rmDirWithRetry(tmpRoot);
  });
  function initRepo() {
    tmpRoot = mkdtempSync(join(tmpdir(), "agent-host-git-wt-"));
    const run = (...args) => cp.execFileSync("git", args, { cwd: tmpRoot, env, stdio: "pipe" });
    run("init", "-q", "-b", "main");
    run("config", "user.name", "t");
    run("config", "user.email", "t@t");
    run("config", "commit.gpgSign", "false");
    run("commit", "-q", "--allow-empty", "-m", "initial");
    return tmpRoot;
  }
  (hasGit ? test : test.skip)("branchExists reports true for HEAD branch and false for missing branches", async () => {
    const dir = initRepo();
    assert.strictEqual(await svc.branchExists(URI.file(dir), "main"), true);
    assert.strictEqual(await svc.branchExists(URI.file(dir), "does-not-exist"), false);
  });
  (hasGit ? test : test.skip)("hasUncommittedChanges flips with untracked and committed work", async () => {
    const dir = initRepo();
    assert.strictEqual(await svc.hasUncommittedChanges(URI.file(dir)), false);
    const fs = await import("fs/promises");
    await fs.writeFile(join(dir, "a.txt"), "hello");
    assert.strictEqual(await svc.hasUncommittedChanges(URI.file(dir)), true);
    cp.execFileSync("git", ["add", "a.txt"], { cwd: dir, env, stdio: "pipe" });
    cp.execFileSync("git", ["commit", "-q", "-m", "add a"], { cwd: dir, env, stdio: "pipe" });
    assert.strictEqual(await svc.hasUncommittedChanges(URI.file(dir)), false);
  });
  (hasGit && !isWindows ? test : test.skip)("status probes do not acquire optional index locks", async () => {
    const dir = initRepo();
    const fs = await import("fs/promises");
    const trackedFile = join(dir, "tracked.txt");
    await fs.writeFile(trackedFile, "tracked");
    cp.execFileSync("git", ["add", "tracked.txt"], { cwd: dir, env, stdio: "pipe" });
    cp.execFileSync("git", ["commit", "-q", "-m", "add tracked"], { cwd: dir, env, stdio: "pipe" });
    const marker = join(dir, ".git", "status-index-refreshed");
    const hook = join(dir, ".git", "hooks", "post-index-change");
    await fs.writeFile(hook, "#!/bin/sh\nprintf refreshed > .git/status-index-refreshed\n");
    await fs.chmod(hook, 493);
    const future = new Date(Date.now() + 1e4);
    await fs.utimes(trackedFile, future, future);
    const hasChanges = await svc.hasUncommittedChanges(URI.file(dir));
    assert.deepStrictEqual({ hasChanges, refreshedIndex: existsSync(marker) }, { hasChanges: false, refreshedIndex: false });
  });
  (hasGit ? test : test.skip)("commitAll stages tracked, staged and untracked changes and creates a commit", async () => {
    const dir = initRepo();
    const fs = await import("fs/promises");
    await fs.writeFile(join(dir, "tracked.txt"), "before");
    cp.execFileSync("git", ["add", "tracked.txt"], { cwd: dir, env, stdio: "pipe" });
    cp.execFileSync("git", ["commit", "-q", "-m", "add tracked"], { cwd: dir, env, stdio: "pipe" });
    await fs.writeFile(join(dir, "tracked.txt"), "after");
    await fs.writeFile(join(dir, "staged.txt"), "staged");
    cp.execFileSync("git", ["add", "staged.txt"], { cwd: dir, env, stdio: "pipe" });
    await fs.writeFile(join(dir, "untracked.txt"), "untracked");
    await svc.commitAll(URI.file(dir), "commit all changes");
    const status = cp.execFileSync("git", ["status", "--porcelain"], { cwd: dir, env, encoding: "utf8" }).trim();
    const lastMessage = cp.execFileSync("git", ["log", "-1", "--format=%s"], { cwd: dir, env, encoding: "utf8" }).trim();
    const committedFiles = cp.execFileSync("git", ["diff-tree", "--no-commit-id", "--name-only", "-r", "HEAD"], { cwd: dir, env, encoding: "utf8" }).trim().split(/\r?\n/g).sort();
    assert.deepStrictEqual({ status, lastMessage, committedFiles }, {
      status: "",
      lastMessage: "commit all changes",
      committedFiles: ["staged.txt", "tracked.txt", "untracked.txt"]
    });
  });
  (hasGit ? test : test.skip)("mergeBranch merges into the current branch", async () => {
    const dir = initRepo();
    const fs = await import("fs/promises");
    cp.execFileSync("git", ["checkout", "-q", "-b", "agents/session"], { cwd: dir, env, stdio: "pipe" });
    await fs.writeFile(join(dir, "session.txt"), "session changes");
    cp.execFileSync("git", ["add", "session.txt"], { cwd: dir, env, stdio: "pipe" });
    cp.execFileSync("git", ["commit", "-q", "-m", "session changes"], { cwd: dir, env, stdio: "pipe" });
    cp.execFileSync("git", ["checkout", "-q", "main"], { cwd: dir, env, stdio: "pipe" });
    await svc.mergeBranch(URI.file(dir), "agents/session");
    const status = cp.execFileSync("git", ["status", "--porcelain"], { cwd: dir, env, encoding: "utf8" }).trim();
    const head = cp.execFileSync("git", ["rev-parse", "HEAD"], { cwd: dir, env, encoding: "utf8" }).trim();
    const source = cp.execFileSync("git", ["rev-parse", "agents/session"], { cwd: dir, env, encoding: "utf8" }).trim();
    assert.deepStrictEqual({ status, headMatchesSource: head === source }, { status: "", headMatchesSource: true });
  });
  (hasGit ? test : test.skip)("mergeBranch aborts a conflicted merge", async () => {
    const dir = initRepo();
    const fs = await import("fs/promises");
    await fs.writeFile(join(dir, "shared.txt"), "base");
    cp.execFileSync("git", ["add", "shared.txt"], { cwd: dir, env, stdio: "pipe" });
    cp.execFileSync("git", ["commit", "-q", "-m", "add shared"], { cwd: dir, env, stdio: "pipe" });
    cp.execFileSync("git", ["checkout", "-q", "-b", "agents/session"], { cwd: dir, env, stdio: "pipe" });
    await fs.writeFile(join(dir, "shared.txt"), "session");
    cp.execFileSync("git", ["commit", "-q", "-am", "session changes"], { cwd: dir, env, stdio: "pipe" });
    cp.execFileSync("git", ["checkout", "-q", "main"], { cwd: dir, env, stdio: "pipe" });
    await fs.writeFile(join(dir, "shared.txt"), "main");
    cp.execFileSync("git", ["commit", "-q", "-am", "main changes"], { cwd: dir, env, stdio: "pipe" });
    let mergeFailed = false;
    try {
      await svc.mergeBranch(URI.file(dir), "agents/session");
    } catch {
      mergeFailed = true;
    }
    const status = cp.execFileSync("git", ["status", "--porcelain"], { cwd: dir, env, encoding: "utf8" }).trim();
    const contents = await fs.readFile(join(dir, "shared.txt"), "utf8");
    let mergeHeadExists = true;
    try {
      cp.execFileSync("git", ["rev-parse", "--verify", "--quiet", "MERGE_HEAD"], { cwd: dir, env, stdio: "ignore" });
    } catch {
      mergeHeadExists = false;
    }
    assert.deepStrictEqual({ mergeFailed, status, contents, mergeHeadExists }, {
      mergeFailed: true,
      status: "",
      contents: "main",
      mergeHeadExists: false
    });
  });
  (hasGit ? test : test.skip)("mergeBranch preserves a pre-existing merge", async () => {
    const dir = initRepo();
    const fs = await import("fs/promises");
    await fs.writeFile(join(dir, "shared.txt"), "base");
    cp.execFileSync("git", ["add", "shared.txt"], { cwd: dir, env, stdio: "pipe" });
    cp.execFileSync("git", ["commit", "-q", "-m", "add shared"], { cwd: dir, env, stdio: "pipe" });
    cp.execFileSync("git", ["checkout", "-q", "-b", "agents/session"], { cwd: dir, env, stdio: "pipe" });
    await fs.writeFile(join(dir, "shared.txt"), "session");
    cp.execFileSync("git", ["commit", "-q", "-am", "session changes"], { cwd: dir, env, stdio: "pipe" });
    cp.execFileSync("git", ["checkout", "-q", "main"], { cwd: dir, env, stdio: "pipe" });
    await fs.writeFile(join(dir, "shared.txt"), "main");
    cp.execFileSync("git", ["commit", "-q", "-am", "main changes"], { cwd: dir, env, stdio: "pipe" });
    try {
      cp.execFileSync("git", ["merge", "--no-edit", "agents/session"], { cwd: dir, env, stdio: "pipe" });
    } catch {
    }
    let errorMessage;
    try {
      await svc.mergeBranch(URI.file(dir), "agents/session");
    } catch (error) {
      errorMessage = error instanceof Error ? error.message : String(error);
    }
    let mergeHeadExists = true;
    try {
      cp.execFileSync("git", ["rev-parse", "--verify", "--quiet", "MERGE_HEAD"], { cwd: dir, env, stdio: "ignore" });
    } catch {
      mergeHeadExists = false;
    } finally {
      cp.execFileSync("git", ["merge", "--abort"], { cwd: dir, env, stdio: "pipe" });
    }
    assert.deepStrictEqual({
      rejectedExistingMerge: errorMessage?.includes("another merge is already in progress") === true,
      mergeHeadExists
    }, {
      rejectedExistingMerge: true,
      mergeHeadExists: true
    });
  });
  (hasGit ? test : test.skip)("addExistingWorktree attaches a worktree for an existing branch (no -b)", async () => {
    const dir = initRepo();
    cp.execFileSync("git", ["branch", "feature"], { cwd: dir, env, stdio: "pipe" });
    const wtPath = join(dir, "..", `wt-${Date.now()}`);
    try {
      await svc.addExistingWorktree(URI.file(dir), URI.file(wtPath), "feature");
      const fs = await import("fs/promises");
      const stat = await fs.stat(wtPath);
      assert.ok(stat.isDirectory(), "worktree directory should exist");
    } finally {
      rmDirWithRetry(wtPath);
    }
  });
  (hasGit ? test : test.skip)("removeWorktree preserves dirty work unless forced", async () => {
    const dir = initRepo();
    const fs = await import("fs/promises");
    const wtPath = join(dir, "..", `wt-dirty-${Date.now()}`);
    try {
      await svc.addWorktree(URI.file(dir), URI.file(wtPath), "agents/dirty-worktree", "main");
      await fs.writeFile(join(wtPath, "untracked.txt"), "keep me");
      let safeRemovalFailed = false;
      try {
        await svc.removeWorktree(URI.file(dir), URI.file(wtPath));
      } catch {
        safeRemovalFailed = true;
      }
      const existsAfterSafeRemoval = existsSync(wtPath);
      await svc.removeWorktree(URI.file(dir), URI.file(wtPath), { force: true });
      assert.deepStrictEqual({
        safeRemovalFailed,
        existsAfterSafeRemoval,
        existsAfterForcedRemoval: existsSync(wtPath)
      }, {
        safeRemovalFailed: true,
        existsAfterSafeRemoval: true,
        existsAfterForcedRemoval: false
      });
    } finally {
      try {
        await svc.removeWorktree(URI.file(dir), URI.file(wtPath), { force: true });
      } catch {
      }
      rmDirWithRetry(wtPath);
      try {
        cp.execFileSync("git", ["branch", "-D", "agents/dirty-worktree"], { cwd: dir, env, stdio: "ignore" });
      } catch {
      }
    }
  });
  (hasGit ? test : test.skip)("removeWorktree prunes a lingering admin entry when the working tree is already gone", async () => {
    const dir = initRepo();
    const suffix = `wt-prune-${Date.now()}`;
    const wtPath = join(dir, "..", suffix);
    try {
      await svc.addWorktree(URI.file(dir), URI.file(wtPath), "agents/prune-worktree", "main");
      rmSync(wtPath, { recursive: true, force: true });
      const listedBefore = cp.execFileSync("git", ["worktree", "list", "--porcelain"], { cwd: dir, env, encoding: "utf8" });
      await svc.removeWorktree(URI.file(dir), URI.file(wtPath), { force: true });
      const listedAfter = cp.execFileSync("git", ["worktree", "list", "--porcelain"], { cwd: dir, env, encoding: "utf8" });
      assert.deepStrictEqual({
        registeredBefore: listedBefore.includes(suffix),
        registeredAfter: listedAfter.includes(suffix)
      }, {
        registeredBefore: true,
        registeredAfter: false
      });
    } finally {
      try {
        await svc.removeWorktree(URI.file(dir), URI.file(wtPath), { force: true });
      } catch {
      }
      rmDirWithRetry(wtPath);
      try {
        cp.execFileSync("git", ["branch", "-D", "agents/prune-worktree"], { cwd: dir, env, stdio: "ignore" });
      } catch {
      }
    }
  });
  (hasGit ? test : test.skip)("removeWorktree rejects instead of falsely succeeding when the admin entry cannot be deleted", async () => {
    const dir = initRepo();
    const suffix = `wt-leak-${Date.now()}`;
    const wtPath = join(dir, "..", suffix);
    let worktreeLocked = false;
    try {
      await svc.addWorktree(URI.file(dir), URI.file(wtPath), "agents/leak-worktree", "main");
      cp.execFileSync("git", ["worktree", "lock", wtPath], { cwd: dir, env, stdio: "pipe" });
      worktreeLocked = true;
      rmSync(wtPath, { recursive: true, force: true });
      await assert.rejects(
        svc.removeWorktree(URI.file(dir), URI.file(wtPath), { force: true }),
        "removeWorktree must reject when the worktree stays registered, not report a false success"
      );
      const listed = cp.execFileSync("git", ["worktree", "list", "--porcelain"], { cwd: dir, env, encoding: "utf8" });
      assert.ok(listed.includes(suffix), "the still-registered worktree must surface as a leak, not be masked");
    } finally {
      if (worktreeLocked) {
        try {
          cp.execFileSync("git", ["worktree", "unlock", wtPath], { cwd: dir, env, stdio: "ignore" });
        } catch {
        }
      }
      try {
        await svc.removeWorktree(URI.file(dir), URI.file(wtPath), { force: true });
      } catch {
      }
      rmDirWithRetry(wtPath);
      try {
        cp.execFileSync("git", ["branch", "-D", "agents/leak-worktree"], { cwd: dir, env, stdio: "ignore" });
      } catch {
      }
    }
  });
  (hasGit ? test : test.skip)("removeWorktree succeeds when git no longer tracks a still-present worktree directory", async () => {
    const dir = initRepo();
    const suffix = `wt-orphan-${Date.now()}`;
    const wtPath = join(dir, "..", suffix);
    try {
      await svc.addWorktree(URI.file(dir), URI.file(wtPath), "agents/orphan-worktree", "main");
      const adminRoot = join(dir, ".git", "worktrees");
      for (const entry of readdirSync(adminRoot)) {
        rmSync(join(adminRoot, entry), { recursive: true, force: true });
      }
      const listed = cp.execFileSync("git", ["worktree", "list", "--porcelain"], { cwd: dir, env, encoding: "utf8" });
      assert.deepStrictEqual({
        dirPresent: existsSync(wtPath),
        stillRegistered: listed.includes(suffix)
      }, {
        dirPresent: true,
        stillRegistered: false
      });
      await svc.removeWorktree(URI.file(dir), URI.file(wtPath), { force: true });
    } finally {
      rmDirWithRetry(wtPath);
      try {
        cp.execFileSync("git", ["branch", "-D", "agents/orphan-worktree"], { cwd: dir, env, stdio: "ignore" });
      } catch {
      }
    }
  });
  (hasGit ? test : test.skip)("removeWorktree rethrows when git cannot confirm removal", async () => {
    tmpRoot = mkdtempSync(join(tmpdir(), "agent-host-git-nonrepo-"));
    const wtPath = join(tmpRoot, "wt");
    mkdirSync(wtPath);
    await assert.rejects(
      svc.removeWorktree(URI.file(tmpRoot), URI.file(wtPath), { force: true }),
      /exited with code 128/
    );
  });
  (hasGit ? test : test.skip)("addWorktree prefers origin start point when local branch is stale", async () => {
    const dir = initRepo();
    const fs = await import("fs/promises");
    cp.execFileSync("git", ["update-ref", "refs/remotes/origin/main", "HEAD"], { cwd: dir, env, stdio: "pipe" });
    cp.execFileSync("git", ["checkout", "-q", "-b", "upstream", "main"], { cwd: dir, env, stdio: "pipe" });
    await fs.writeFile(join(dir, "upstream.txt"), "upstream");
    cp.execFileSync("git", ["add", "."], { cwd: dir, env, stdio: "pipe" });
    cp.execFileSync("git", ["commit", "-q", "-m", "upstream"], { cwd: dir, env, stdio: "pipe" });
    cp.execFileSync("git", ["update-ref", "refs/remotes/origin/main", "HEAD"], { cwd: dir, env, stdio: "pipe" });
    cp.execFileSync("git", ["checkout", "-q", "main"], { cwd: dir, env, stdio: "pipe" });
    const wtPath = join(dir, "..", `wt-${Date.now()}`);
    try {
      await svc.addWorktree(URI.file(dir), URI.file(wtPath), "agents/test-origin-start-point", "main");
      const stat = await fs.stat(join(wtPath, "upstream.txt"));
      assert.ok(stat.isFile(), "worktree should start from origin/main, not stale local main");
      assert.throws(() => cp.execFileSync("git", ["rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{u}"], { cwd: wtPath, env, stdio: "pipe" }), /fatal:/);
    } finally {
      try {
        await svc.removeWorktree(URI.file(dir), URI.file(wtPath), { force: true });
      } catch {
      }
      rmDirWithRetry(wtPath);
      try {
        cp.execFileSync("git", ["branch", "-D", "agents/test-origin-start-point"], { cwd: dir, env, stdio: "ignore" });
      } catch {
      }
    }
  });
  (hasGit ? test : test.skip)("copyWorktreeIncludeFiles copies matched git-ignored files, collapsing wholly-ignored folders", async () => {
    const dir = initRepo();
    const fs = await import("fs/promises");
    await fs.writeFile(join(dir, ".gitignore"), ".env\nsecrets/\nbuild/\npartial/\n*.local\n");
    await fs.writeFile(join(dir, ".env"), "SECRET=1");
    await fs.mkdir(join(dir, "secrets", "nested"), { recursive: true });
    await fs.writeFile(join(dir, "secrets", "key.txt"), "key");
    await fs.writeFile(join(dir, "secrets", "nested", "deep.txt"), "deep");
    await fs.mkdir(join(dir, "build"), { recursive: true });
    await fs.writeFile(join(dir, "build", "output.txt"), "artifact");
    await fs.mkdir(join(dir, "partial"), { recursive: true });
    await fs.writeFile(join(dir, "partial", "keep.txt"), "keep");
    await fs.writeFile(join(dir, "partial", "skip.bin"), "skip");
    await fs.mkdir(join(dir, "app"), { recursive: true });
    await fs.writeFile(join(dir, "app", "main.ts"), "committed");
    await fs.writeFile(join(dir, "app", "config.local"), "local");
    cp.execFileSync("git", ["add", "app/main.ts"], { cwd: dir, env, stdio: "pipe" });
    cp.execFileSync("git", ["commit", "-q", "-m", "add tracked"], { cwd: dir, env, stdio: "pipe" });
    await fs.writeFile(join(dir, "app", "main.ts"), "MODIFIED");
    const wtPath = join(dir, "..", `wt-${Date.now()}`);
    try {
      await svc.addWorktree(URI.file(dir), URI.file(wtPath), "agents/include-files", "main");
      const progress = [];
      await svc.copyWorktreeIncludeFiles(URI.file(dir), URI.file(wtPath), [".env", "secrets/**", "partial/*.txt", "app/**"], (sample) => progress.push(sample));
      const read = async (relativePath) => {
        try {
          return await fs.readFile(join(wtPath, relativePath), "utf8");
        } catch {
          return void 0;
        }
      };
      assert.deepStrictEqual({
        env: await read(".env"),
        secretKey: await read(join("secrets", "key.txt")),
        secretDeep: await read(join("secrets", "nested", "deep.txt")),
        buildArtifact: await read(join("build", "output.txt")),
        partialKeep: await read(join("partial", "keep.txt")),
        partialSkip: await read(join("partial", "skip.bin")),
        appConfig: await read(join("app", "config.local")),
        appTracked: await read(join("app", "main.ts")),
        // One sample per copied entry (`secrets/` collapsed, plus three
        // standalone files), but counted in the 5 files they cover so
        // the collapsed directory isn't under-weighted. Completion order
        // is nondeterministic, so only the totals are asserted.
        progressSamples: progress.length,
        progressTotals: [...new Set(progress.map((sample) => sample.filesTotal))],
        progressDone: progress.at(-1)?.filesDone
      }, {
        env: "SECRET=1",
        secretKey: "key",
        secretDeep: "deep",
        buildArtifact: void 0,
        partialKeep: "keep",
        partialSkip: void 0,
        appConfig: "local",
        appTracked: "committed",
        progressSamples: 4,
        progressTotals: [5],
        progressDone: 5
      });
    } finally {
      try {
        await svc.removeWorktree(URI.file(dir), URI.file(wtPath), { force: true });
      } catch {
      }
      rmDirWithRetry(wtPath);
      try {
        cp.execFileSync("git", ["branch", "-D", "agents/include-files"], { cwd: dir, env, stdio: "ignore" });
      } catch {
      }
    }
  });
});
suite("AgentHostGitService - restore (real git)", () => {
  const disposables = ensureNoDisposablesAreLeakedInTestSuite();
  const hasGit = (() => {
    try {
      cp.execFileSync("git", ["--version"], { stdio: "ignore" });
      return true;
    } catch {
      return false;
    }
  })();
  let tmpRoot;
  let svc;
  const env = { ...process.env, GIT_AUTHOR_NAME: "t", GIT_AUTHOR_EMAIL: "t@t", GIT_COMMITTER_NAME: "t", GIT_COMMITTER_EMAIL: "t@t" };
  setup(() => {
    tmpRoot = void 0;
    svc = createGitService(disposables);
  });
  teardown(() => {
    rmDirWithRetry(tmpRoot);
  });
  async function initRepoWithFiles(files) {
    tmpRoot = mkdtempSync(join(tmpdir(), "agent-host-git-restore-"));
    const fs = await import("fs/promises");
    const run = (...args) => cp.execFileSync("git", args, { cwd: tmpRoot, env, stdio: "pipe" });
    run("init", "-q", "-b", "main");
    for (const [name, content] of Object.entries(files)) {
      await fs.writeFile(join(tmpRoot, name), content);
    }
    run("add", ".");
    run("commit", "-q", "-m", "init");
    return tmpRoot;
  }
  (hasGit ? test : test.skip)("reverts a modified working-tree file to the committed content", async () => {
    const fs = await import("fs/promises");
    const dir = await initRepoWithFiles({ "a.txt": "original" });
    await fs.writeFile(join(dir, "a.txt"), "changed");
    await svc.restore(URI.file(dir), ["a.txt"]);
    assert.strictEqual(await fs.readFile(join(dir, "a.txt"), "utf8"), "original");
  });
  (hasGit ? test : test.skip)("with `staged: true` un-stages a file without touching the working tree", async () => {
    const fs = await import("fs/promises");
    const dir = await initRepoWithFiles({ "a.txt": "original" });
    await fs.writeFile(join(dir, "a.txt"), "changed");
    cp.execFileSync("git", ["add", "a.txt"], { cwd: dir, env, stdio: "pipe" });
    await svc.restore(URI.file(dir), ["a.txt"], { staged: true });
    const stagedDiff = cp.execFileSync("git", ["diff", "--cached", "--name-only"], { cwd: dir, env, encoding: "utf8" }).trim();
    const workingTree = await fs.readFile(join(dir, "a.txt"), "utf8");
    assert.deepStrictEqual({ stagedDiff, workingTree }, { stagedDiff: "", workingTree: "changed" });
  });
  (hasGit ? test : test.skip)("with `ref` restores content from a specific commit", async () => {
    const fs = await import("fs/promises");
    const dir = await initRepoWithFiles({ "a.txt": "v1" });
    const v1Sha = cp.execFileSync("git", ["rev-parse", "HEAD"], { cwd: dir, env, encoding: "utf8" }).trim();
    await fs.writeFile(join(dir, "a.txt"), "v2");
    cp.execFileSync("git", ["commit", "-q", "-am", "v2"], { cwd: dir, env, stdio: "pipe" });
    await svc.restore(URI.file(dir), ["a.txt"], { ref: v1Sha });
    assert.strictEqual(await fs.readFile(join(dir, "a.txt"), "utf8"), "v1");
  });
  (hasGit ? test : test.skip)("with no paths restores every modified file in the working tree", async () => {
    const fs = await import("fs/promises");
    const dir = await initRepoWithFiles({ "a.txt": "one", "b.txt": "two" });
    await fs.writeFile(join(dir, "a.txt"), "mutated-a");
    await fs.writeFile(join(dir, "b.txt"), "mutated-b");
    await svc.restore(URI.file(dir), []);
    const [a, b] = await Promise.all([
      fs.readFile(join(dir, "a.txt"), "utf8"),
      fs.readFile(join(dir, "b.txt"), "utf8")
    ]);
    assert.deepStrictEqual({ a, b }, { a: "one", b: "two" });
  });
  (hasGit ? test : test.skip)("rejects when run against a non-git directory", async () => {
    const dir = mkdtempSync(join(tmpdir(), "agent-host-nongit-restore-"));
    tmpRoot = dir;
    await assert.rejects(() => svc.restore(URI.file(dir), ["a.txt"]));
  });
});
suite("AgentHostGitService - overlayPathIntoTree (real git)", () => {
  const disposables = ensureNoDisposablesAreLeakedInTestSuite();
  const hasGit = (() => {
    try {
      cp.execFileSync("git", ["--version"], { stdio: "ignore" });
      return true;
    } catch {
      return false;
    }
  })();
  let tmpRoot;
  let svc;
  const env = { ...process.env, GIT_AUTHOR_NAME: "t", GIT_AUTHOR_EMAIL: "t@t", GIT_COMMITTER_NAME: "t", GIT_COMMITTER_EMAIL: "t@t" };
  setup(() => {
    tmpRoot = void 0;
    svc = createGitService(disposables);
  });
  teardown(() => {
    rmDirWithRetry(tmpRoot);
  });
  async function initRepoWithFiles(files) {
    tmpRoot = mkdtempSync(join(tmpdir(), "agent-host-git-overlay-"));
    const fs = await import("fs/promises");
    const run = (...args) => cp.execFileSync("git", args, { cwd: tmpRoot, env, stdio: "pipe" });
    run("init", "-q", "-b", "main");
    for (const [name, content] of Object.entries(files)) {
      await fs.writeFile(join(tmpRoot, name), content);
    }
    run("add", ".");
    run("commit", "-q", "-m", "init");
    return { dir: tmpRoot, run };
  }
  const headTree = (dir) => cp.execFileSync("git", ["rev-parse", "HEAD^{tree}"], { cwd: dir, env, encoding: "utf8" }).trim();
  const lsTree = (dir, tree) => cp.execFileSync("git", ["ls-tree", "-r", "--name-only", tree], { cwd: dir, env, encoding: "utf8" }).trim().split("\n").filter(Boolean);
  const blobAt = (dir, tree, path) => cp.execFileSync("git", ["cat-file", "blob", `${tree}:${path}`], { cwd: dir, env, encoding: "utf8" });
  (hasGit ? test : test.skip)("overlays a modified path from the source tree, leaving other paths untouched", async () => {
    const fs = await import("fs/promises");
    const { dir } = await initRepoWithFiles({ "a.txt": "a-v1\n", "b.txt": "b-v1\n" });
    const base = headTree(dir);
    await fs.writeFile(join(dir, "a.txt"), "a-v2\n");
    const source = await svc.captureWorkingTreeAsTree(URI.file(dir));
    assert.ok(source, "expected a working-tree snapshot");
    const result = await svc.overlayPathIntoTree(URI.file(dir), base, "a.txt", source);
    assert.ok(result, "expected a result tree");
    assert.deepStrictEqual(
      {
        files: lsTree(dir, result),
        aContent: blobAt(dir, result, "a.txt"),
        bContent: blobAt(dir, result, "b.txt")
      },
      {
        files: ["a.txt", "b.txt"],
        aContent: "a-v2\n",
        // overlaid from the source tree
        bContent: "b-v1\n"
        // copied verbatim from the base tree
      }
    );
  });
  (hasGit ? test : test.skip)("overlays an added path from the source tree", async () => {
    const fs = await import("fs/promises");
    const { dir } = await initRepoWithFiles({ "a.txt": "a-v1\n" });
    const base = headTree(dir);
    await fs.writeFile(join(dir, "fresh.txt"), "fresh\n");
    const source = await svc.captureWorkingTreeAsTree(URI.file(dir));
    assert.ok(source, "expected a working-tree snapshot");
    const result = await svc.overlayPathIntoTree(URI.file(dir), base, "fresh.txt", source);
    assert.ok(result, "expected a result tree");
    assert.deepStrictEqual(
      { files: lsTree(dir, result), freshContent: blobAt(dir, result, "fresh.txt") },
      { files: ["a.txt", "fresh.txt"], freshContent: "fresh\n" }
    );
  });
  (hasGit ? test : test.skip)("removes a path absent from the source tree", async () => {
    const fs = await import("fs/promises");
    const { dir } = await initRepoWithFiles({ "a.txt": "a-v1\n", "b.txt": "b-v1\n" });
    await fs.writeFile(join(dir, "fresh.txt"), "fresh\n");
    const base = await svc.captureWorkingTreeAsTree(URI.file(dir));
    assert.ok(base, "expected a working-tree snapshot");
    const source = headTree(dir);
    const result = await svc.overlayPathIntoTree(URI.file(dir), base, "fresh.txt", source);
    assert.ok(result, "expected a result tree");
    assert.deepStrictEqual(lsTree(dir, result), ["a.txt", "b.txt"]);
  });
  (hasGit ? test : test.skip)("returns undefined for a non-git directory", async () => {
    const dir = mkdtempSync(join(tmpdir(), "agent-host-nongit-overlay-"));
    tmpRoot = dir;
    const result = await svc.overlayPathIntoTree(URI.file(dir), "HEAD", "a.txt", "HEAD");
    assert.strictEqual(result, void 0);
  });
});
suite("AgentHostGitService - resolveBranchBaselineCommit (real git)", () => {
  const disposables = ensureNoDisposablesAreLeakedInTestSuite();
  const hasGit = (() => {
    try {
      cp.execFileSync("git", ["--version"], { stdio: "ignore" });
      return true;
    } catch {
      return false;
    }
  })();
  let tmpRoot;
  let svc;
  const env = { ...process.env, GIT_AUTHOR_NAME: "t", GIT_AUTHOR_EMAIL: "t@t", GIT_COMMITTER_NAME: "t", GIT_COMMITTER_EMAIL: "t@t" };
  setup(() => {
    tmpRoot = void 0;
    svc = createGitService(disposables);
  });
  teardown(() => {
    rmDirWithRetry(tmpRoot);
  });
  function initRepo() {
    tmpRoot = mkdtempSync(join(tmpdir(), "agent-host-git-baseline-"));
    const run = (...args) => cp.execFileSync("git", args, { cwd: tmpRoot, env, stdio: "pipe" });
    run("init", "-q", "-b", "main");
    return run;
  }
  (hasGit ? test : test.skip)("returns the merge-base of HEAD and the base branch", async () => {
    const fs = await import("fs/promises");
    const run = initRepo();
    await fs.writeFile(join(tmpRoot, "a.txt"), "base\n");
    run("add", ".");
    run("commit", "-q", "-m", "base");
    const baseCommit = run("rev-parse", "HEAD").toString().trim();
    run("checkout", "-q", "-b", "feature");
    await fs.writeFile(join(tmpRoot, "a.txt"), "feature\n");
    run("commit", "-q", "-am", "feature");
    const result = await svc.resolveBranchBaselineCommit(URI.file(tmpRoot), "main");
    assert.strictEqual(result, baseCommit);
  });
  (hasGit ? test : test.skip)("falls back to HEAD when no base branch is given", async () => {
    const fs = await import("fs/promises");
    const run = initRepo();
    await fs.writeFile(join(tmpRoot, "a.txt"), "base\n");
    run("add", ".");
    run("commit", "-q", "-m", "base");
    const headCommit = run("rev-parse", "HEAD").toString().trim();
    const result = await svc.resolveBranchBaselineCommit(URI.file(tmpRoot));
    assert.strictEqual(result, headCommit);
  });
  (hasGit ? test : test.skip)("falls back to the empty tree for a repo with no commits", async () => {
    initRepo();
    const result = await svc.resolveBranchBaselineCommit(URI.file(tmpRoot));
    assert.strictEqual(result, "4b825dc642cb6eb9a060e54bf8d69288fbee4904");
  });
  (hasGit ? test : test.skip)("returns undefined for a non-git directory", async () => {
    const dir = mkdtempSync(join(tmpdir(), "agent-host-nongit-baseline-"));
    tmpRoot = dir;
    const result = await svc.resolveBranchBaselineCommit(URI.file(dir), "main");
    assert.strictEqual(result, void 0);
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxwbGF0Zm9ybVxcYWdlbnRIb3N0XFx0ZXN0XFxub2RlXFxhZ2VudEhvc3RHaXRTZXJ2aWNlLmludGVncmF0aW9uVGVzdC50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbi8qKlxuICogSW50ZWdyYXRpb24gdGVzdHMgZm9yIHtAbGluayBBZ2VudEhvc3RHaXRTZXJ2aWNlfSB0aGF0IHNwYXduIHJlYWwgYGdpdGAgYWdhaW5zdFxuICogdGVtcG9yYXJ5IG9uLWRpc2sgcmVwb3NpdG9yaWVzLiBLZXB0IG91dCBvZiB0aGUgdW5pdC10ZXN0IHN1aXRlIGJlY2F1c2UgdGhleVxuICogcmVxdWlyZSBgZ2l0YCBvbiBQQVRIIGFuZCBkbyByZWFsIGZpbGVzeXN0ZW0gYW5kIHByb2Nlc3Mgd29yayBcdTIwMTQgc2FtZSBzcGxpdCBhc1xuICogdGhlIGdpdCBleHRlbnNpb24gKHB1cmUgcGFyc2VyIHRlc3RzIGluIGBnaXQudGVzdC50c2AsIG9uLWRpc2sgdGVzdHMgaW5cbiAqIGBzbW9rZS50ZXN0LnRzYCkuXG4gKlxuICogUnVuIHZpYSBgc2NyaXB0cy90ZXN0LWludGVncmF0aW9uLnNoYC5cbiAqL1xuXG5pbXBvcnQgYXNzZXJ0IGZyb20gJ2Fzc2VydCc7XG5pbXBvcnQgKiBhcyBjcCBmcm9tICdjaGlsZF9wcm9jZXNzJztcbmltcG9ydCB7IGV4aXN0c1N5bmMsIG1rZGlyU3luYywgbWtkdGVtcFN5bmMsIHJlYWRkaXJTeW5jLCBybVN5bmMgfSBmcm9tICdmcyc7XG5pbXBvcnQgeyB0bXBkaXIgfSBmcm9tICdvcyc7XG5pbXBvcnQgeyBOdWxsTG9nU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL2xvZy9jb21tb24vbG9nLmpzJztcbmltcG9ydCB7IGpvaW4gfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9wYXRoLmpzJztcbmltcG9ydCB7IFVSSSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3VyaS5qcyc7XG5pbXBvcnQgeyBpc1dpbmRvd3MgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9wbGF0Zm9ybS5qcyc7XG5pbXBvcnQgeyBlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL3Rlc3QvY29tbW9uL3V0aWxzLmpzJztcbmltcG9ydCB7IElOYXRpdmVFbnZpcm9ubWVudFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9lbnZpcm9ubWVudC9jb21tb24vZW52aXJvbm1lbnQuanMnO1xuaW1wb3J0IHsgRmlsZVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9maWxlcy9jb21tb24vZmlsZVNlcnZpY2UuanMnO1xuaW1wb3J0IHsgU2NoZW1hcyB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL25ldHdvcmsuanMnO1xuaW1wb3J0IHsgRGlza0ZpbGVTeXN0ZW1Qcm92aWRlciB9IGZyb20gJy4uLy4uLy4uL2ZpbGVzL25vZGUvZGlza0ZpbGVTeXN0ZW1Qcm92aWRlci5qcyc7XG5pbXBvcnQgeyBEaXNwb3NhYmxlU3RvcmUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgQWdlbnRIb3N0R2l0U2VydmljZSB9IGZyb20gJy4uLy4uL25vZGUvYWdlbnRIb3N0R2l0U2VydmljZS5qcyc7XG5cbmZ1bmN0aW9uIGNyZWF0ZUdpdFNlcnZpY2UoZGlzcG9zYWJsZXM6IFBpY2s8RGlzcG9zYWJsZVN0b3JlLCAnYWRkJz4pOiBBZ2VudEhvc3RHaXRTZXJ2aWNlIHtcblx0Y29uc3QgbG9nU2VydmljZSA9IG5ldyBOdWxsTG9nU2VydmljZSgpO1xuXHRjb25zdCBmaWxlU2VydmljZSA9IGRpc3Bvc2FibGVzLmFkZChuZXcgRmlsZVNlcnZpY2UobG9nU2VydmljZSkpO1xuXHRkaXNwb3NhYmxlcy5hZGQoZmlsZVNlcnZpY2UucmVnaXN0ZXJQcm92aWRlcihTY2hlbWFzLmZpbGUsIGRpc3Bvc2FibGVzLmFkZChuZXcgRGlza0ZpbGVTeXN0ZW1Qcm92aWRlcihsb2dTZXJ2aWNlKSkpKTtcblx0Y29uc3QgZW52OiBQYXJ0aWFsPElOYXRpdmVFbnZpcm9ubWVudFNlcnZpY2U+ID0geyB0bXBEaXI6IFVSSS5maWxlKHRtcGRpcigpKSB9O1xuXHRyZXR1cm4gbmV3IEFnZW50SG9zdEdpdFNlcnZpY2UoZmlsZVNlcnZpY2UsIGVudiBhcyBJTmF0aXZlRW52aXJvbm1lbnRTZXJ2aWNlLCBsb2dTZXJ2aWNlKTtcbn1cblxuZnVuY3Rpb24gcm1EaXJXaXRoUmV0cnkocGF0aDogc3RyaW5nIHwgdW5kZWZpbmVkKTogdm9pZCB7XG5cdGlmICghcGF0aCkge1xuXHRcdHJldHVybjtcblx0fVxuXHR0cnkgeyBybVN5bmMocGF0aCwgeyByZWN1cnNpdmU6IHRydWUsIGZvcmNlOiB0cnVlLCBtYXhSZXRyaWVzOiAxMCwgcmV0cnlEZWxheTogMjAwIH0pOyB9IGNhdGNoIHsgLyogYmVzdC1lZmZvcnQgdGVtcCBjbGVhbnVwOyBXaW5kb3dzIGNhbiBicmllZmx5IGhvbGQgZ2l0IGhhbmRsZXMgKi8gfVxufVxuXG5zdWl0ZSgnQWdlbnRIb3N0R2l0U2VydmljZSAtIGdldFNlc3Npb25HaXRTdGF0ZSAocmVhbCBnaXQpJywgKCkgPT4ge1xuXHRjb25zdCBkaXNwb3NhYmxlcyA9IGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSgpO1xuXG5cdC8vIFNraXAgdGhlIG9uLWRpc2sgZ2l0IHRlc3RzIHdoZW4gYGdpdGAgaXMgbm90IG9uIFBBVEggKGUuZy4gbWluaW1hbCBDSSkuXG5cdGNvbnN0IGhhc0dpdCA9ICgoKSA9PiB7XG5cdFx0dHJ5IHsgY3AuZXhlY0ZpbGVTeW5jKCdnaXQnLCBbJy0tdmVyc2lvbiddLCB7IHN0ZGlvOiAnaWdub3JlJyB9KTsgcmV0dXJuIHRydWU7IH0gY2F0Y2ggeyByZXR1cm4gZmFsc2U7IH1cblx0fSkoKTtcblxuXHRsZXQgdG1wUm9vdDogc3RyaW5nIHwgdW5kZWZpbmVkO1xuXHRsZXQgc3ZjOiBBZ2VudEhvc3RHaXRTZXJ2aWNlIHwgdW5kZWZpbmVkO1xuXG5cdHNldHVwKCgpID0+IHtcblx0XHR0bXBSb290ID0gdW5kZWZpbmVkO1xuXHRcdHN2YyA9IGNyZWF0ZUdpdFNlcnZpY2UoZGlzcG9zYWJsZXMpO1xuXHR9KTtcblxuXHR0ZWFyZG93bigoKSA9PiB7XG5cdFx0cm1EaXJXaXRoUmV0cnkodG1wUm9vdCk7XG5cdH0pO1xuXG5cdGZ1bmN0aW9uIGluaXRSZXBvKG9wdHM/OiB7IHJlbW90ZT86IHN0cmluZzsgYmFzZUJyYW5jaD86IHN0cmluZyB9KTogc3RyaW5nIHtcblx0XHR0bXBSb290ID0gbWtkdGVtcFN5bmMoam9pbih0bXBkaXIoKSwgJ2FnZW50LWhvc3QtZ2l0LScpKTtcblx0XHRjb25zdCBlbnYgPSB7IC4uLnByb2Nlc3MuZW52LCBHSVRfQVVUSE9SX05BTUU6ICd0JywgR0lUX0FVVEhPUl9FTUFJTDogJ3RAdCcsIEdJVF9DT01NSVRURVJfTkFNRTogJ3QnLCBHSVRfQ09NTUlUVEVSX0VNQUlMOiAndEB0JyB9O1xuXHRcdGNvbnN0IHJ1biA9ICguLi5hcmdzOiBzdHJpbmdbXSkgPT4gY3AuZXhlY0ZpbGVTeW5jKCdnaXQnLCBhcmdzLCB7IGN3ZDogdG1wUm9vdCEsIGVudiwgc3RkaW86ICdwaXBlJyB9KTtcblx0XHRydW4oJ2luaXQnLCAnLXEnLCAnLWInLCBvcHRzPy5iYXNlQnJhbmNoID8/ICdtYWluJyk7XG5cdFx0cnVuKCdjb21taXQnLCAnLXEnLCAnLS1hbGxvdy1lbXB0eScsICctbScsICdpbml0aWFsJyk7XG5cdFx0aWYgKG9wdHM/LnJlbW90ZSkge1xuXHRcdFx0cnVuKCdyZW1vdGUnLCAnYWRkJywgJ29yaWdpbicsIG9wdHMucmVtb3RlKTtcblx0XHR9XG5cdFx0cmV0dXJuIHRtcFJvb3QhO1xuXHR9XG5cblx0KGhhc0dpdCA/IHRlc3QgOiB0ZXN0LnNraXApKCdyZXR1cm5zIHVuZGVmaW5lZCBmb3IgYSBub24tZ2l0IGRpcmVjdG9yeScsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBkaXIgPSBta2R0ZW1wU3luYyhqb2luKHRtcGRpcigpLCAnYWdlbnQtaG9zdC1ub25naXQtJykpO1xuXHRcdHRtcFJvb3QgPSBkaXI7XG5cdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgc3ZjIS5nZXRTZXNzaW9uR2l0U3RhdGUoVVJJLmZpbGUoZGlyKSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdCwgdW5kZWZpbmVkKTtcblx0fSk7XG5cblx0KGhhc0dpdCA/IHRlc3QgOiB0ZXN0LnNraXApKCdyZXBvcnRzIGJyYW5jaCwgZ2l0aHViIHJlbW90ZSBhbmQgY2xlYW4gc3RhdGUgZm9yIGEgZnJlc2ggcmVwbycsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBkaXIgPSBpbml0UmVwbyh7IHJlbW90ZTogJ2h0dHBzOi8vZ2l0aHViLmNvbS9vd25lci9yZXBvLmdpdCcgfSk7XG5cdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgc3ZjIS5nZXRTZXNzaW9uR2l0U3RhdGUoVVJJLmZpbGUoZGlyKSk7XG5cdFx0YXNzZXJ0Lm9rKHJlc3VsdCwgJ2V4cGVjdGVkIGdpdCBzdGF0ZScpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQuYnJhbmNoTmFtZSwgJ21haW4nKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0Lmhhc0dpdEh1YlJlbW90ZSwgdHJ1ZSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdC51bmNvbW1pdHRlZENoYW5nZXMsIDApO1xuXHRcdC8vIE5vIHVwc3RyZWFtIGNvbmZpZ3VyZWQgZm9yIHRoZSBmcmVzaCBsb2NhbCBicmFuY2guXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdC51cHN0cmVhbUJyYW5jaE5hbWUsIHVuZGVmaW5lZCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdC5vdXRnb2luZ0NoYW5nZXMsIHVuZGVmaW5lZCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdC5pbmNvbWluZ0NoYW5nZXMsIHVuZGVmaW5lZCk7XG5cdH0pO1xuXG5cdChoYXNHaXQgPyB0ZXN0IDogdGVzdC5za2lwKSgncmVwb3J0cyB0aGUgR2l0SHViIG93bmVyIG9mIHRoZSBicmFuY2ggdXBzdHJlYW0gcmVtb3RlJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IGRpciA9IGluaXRSZXBvKHsgcmVtb3RlOiAnaHR0cHM6Ly9naXRodWIuY29tL2Jhc2Utb3duZXIvcmVwby5naXQnIH0pO1xuXHRcdGNwLmV4ZWNGaWxlU3luYygnZ2l0JywgWydyZW1vdGUnLCAnYWRkJywgJ2ZvcmsnLCAnaHR0cHM6Ly9naXRodWIuY29tL2Zvcmstb3duZXIvcmVwby5naXQnXSwgeyBjd2Q6IGRpciwgc3RkaW86ICdwaXBlJyB9KTtcblx0XHRjcC5leGVjRmlsZVN5bmMoJ2dpdCcsIFsnY2hlY2tvdXQnLCAnLXEnLCAnLWInLCAnZmVhdHVyZSddLCB7IGN3ZDogZGlyLCBzdGRpbzogJ3BpcGUnIH0pO1xuXHRcdGNwLmV4ZWNGaWxlU3luYygnZ2l0JywgWyd1cGRhdGUtcmVmJywgJ3JlZnMvcmVtb3Rlcy9mb3JrL2ZlYXR1cmUnLCAnSEVBRCddLCB7IGN3ZDogZGlyLCBzdGRpbzogJ3BpcGUnIH0pO1xuXHRcdGNwLmV4ZWNGaWxlU3luYygnZ2l0JywgWydicmFuY2gnLCAnLS1zZXQtdXBzdHJlYW0tdG8nLCAnZm9yay9mZWF0dXJlJ10sIHsgY3dkOiBkaXIsIHN0ZGlvOiAncGlwZScgfSk7XG5cblx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCBzdmMhLmdldFNlc3Npb25HaXRTdGF0ZShVUkkuZmlsZShkaXIpKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0Z2l0aHViT3duZXI6IHJlc3VsdD8uZ2l0aHViT3duZXIsXG5cdFx0XHRnaXRodWJIZWFkT3duZXI6IHJlc3VsdD8uZ2l0aHViSGVhZE93bmVyLFxuXHRcdFx0Z2l0aHViUmVwbzogcmVzdWx0Py5naXRodWJSZXBvLFxuXHRcdFx0dXBzdHJlYW1CcmFuY2hOYW1lOiByZXN1bHQ/LnVwc3RyZWFtQnJhbmNoTmFtZSxcblx0XHR9LCB7XG5cdFx0XHRnaXRodWJPd25lcjogJ2Jhc2Utb3duZXInLFxuXHRcdFx0Z2l0aHViSGVhZE93bmVyOiAnZm9yay1vd25lcicsXG5cdFx0XHRnaXRodWJSZXBvOiAncmVwbycsXG5cdFx0XHR1cHN0cmVhbUJyYW5jaE5hbWU6ICdmb3JrL2ZlYXR1cmUnLFxuXHRcdH0pO1xuXHR9KTtcblxuXHQoaGFzR2l0ID8gdGVzdCA6IHRlc3Quc2tpcCkoJ3JlcG9ydHMgdGhlIEdpdEh1YiBvd25lciBvZiBhIGJyYW5jaCBwdXNoIHJlbW90ZSB3aXRob3V0IGFuIHVwc3RyZWFtJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IGRpciA9IGluaXRSZXBvKHsgcmVtb3RlOiAnaHR0cHM6Ly9naXRodWIuY29tL2Jhc2Utb3duZXIvcmVwby5naXQnIH0pO1xuXHRcdGNwLmV4ZWNGaWxlU3luYygnZ2l0JywgWydjaGVja291dCcsICctcScsICctYicsICdmZWF0dXJlJ10sIHsgY3dkOiBkaXIsIHN0ZGlvOiAncGlwZScgfSk7XG5cdFx0Y3AuZXhlY0ZpbGVTeW5jKCdnaXQnLCBbJ2NvbmZpZycsICdicmFuY2guZmVhdHVyZS5yZW1vdGUnLCAnaHR0cHM6Ly9naXRodWIuY29tL2Zvcmstb3duZXIvcmVwby5naXQnXSwgeyBjd2Q6IGRpciwgc3RkaW86ICdwaXBlJyB9KTtcblx0XHRjcC5leGVjRmlsZVN5bmMoJ2dpdCcsIFsnY29uZmlnJywgJ2JyYW5jaC5mZWF0dXJlLnB1c2hyZW1vdGUnLCAnaHR0cHM6Ly9naXRodWIuY29tL2Zvcmstb3duZXIvcmVwby5naXQnXSwgeyBjd2Q6IGRpciwgc3RkaW86ICdwaXBlJyB9KTtcblxuXHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IHN2YyEuZ2V0U2Vzc2lvbkdpdFN0YXRlKFVSSS5maWxlKGRpcikpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRnaXRodWJPd25lcjogcmVzdWx0Py5naXRodWJPd25lcixcblx0XHRcdGdpdGh1YkhlYWRPd25lcjogcmVzdWx0Py5naXRodWJIZWFkT3duZXIsXG5cdFx0XHRnaXRodWJSZXBvOiByZXN1bHQ/LmdpdGh1YlJlcG8sXG5cdFx0XHR1cHN0cmVhbUJyYW5jaE5hbWU6IHJlc3VsdD8udXBzdHJlYW1CcmFuY2hOYW1lLFxuXHRcdH0sIHtcblx0XHRcdGdpdGh1Yk93bmVyOiAnYmFzZS1vd25lcicsXG5cdFx0XHRnaXRodWJIZWFkT3duZXI6ICdmb3JrLW93bmVyJyxcblx0XHRcdGdpdGh1YlJlcG86ICdyZXBvJyxcblx0XHRcdHVwc3RyZWFtQnJhbmNoTmFtZTogdW5kZWZpbmVkLFxuXHRcdH0pO1xuXHR9KTtcblxuXHQoaGFzR2l0ID8gdGVzdCA6IHRlc3Quc2tpcCkoJ3Jlc29sdmVzIHRoZSBkZWZhdWx0IGJyYW5jaCBuYW1lIGFuZCByZW1vdGUtdHJhY2tpbmcgc3RhcnQgcG9pbnQnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgZGlyID0gaW5pdFJlcG8oKTtcblx0XHRjcC5leGVjRmlsZVN5bmMoJ2dpdCcsIFsndXBkYXRlLXJlZicsICdyZWZzL3JlbW90ZXMvb3JpZ2luL21haW4nLCAncmVmcy9oZWFkcy9tYWluJ10sIHsgY3dkOiBkaXIsIHN0ZGlvOiAncGlwZScgfSk7XG5cdFx0Y3AuZXhlY0ZpbGVTeW5jKCdnaXQnLCBbJ3N5bWJvbGljLXJlZicsICdyZWZzL3JlbW90ZXMvb3JpZ2luL0hFQUQnLCAncmVmcy9yZW1vdGVzL29yaWdpbi9tYWluJ10sIHsgY3dkOiBkaXIsIHN0ZGlvOiAncGlwZScgfSk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGF3YWl0IHN2YyEuZ2V0RGVmYXVsdEJyYW5jaChVUkkuZmlsZShkaXIpKSwge1xuXHRcdFx0bmFtZTogJ21haW4nLFxuXHRcdFx0c3RhcnRQb2ludDogJ29yaWdpbi9tYWluJyxcblx0XHR9KTtcblx0fSk7XG5cblx0KGhhc0dpdCA/IHRlc3QgOiB0ZXN0LnNraXApKCdmYWxscyBiYWNrIHRvIHRoZSBsb2NhbCBicmFuY2ggd2hlbiB0aGUgZGVmYXVsdCByZW1vdGUtdHJhY2tpbmcgcmVmIGlzIG1pc3NpbmcnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgZGlyID0gaW5pdFJlcG8oKTtcblx0XHRjcC5leGVjRmlsZVN5bmMoJ2dpdCcsIFsnc3ltYm9saWMtcmVmJywgJ3JlZnMvcmVtb3Rlcy9vcmlnaW4vSEVBRCcsICdyZWZzL3JlbW90ZXMvb3JpZ2luL21haW4nXSwgeyBjd2Q6IGRpciwgc3RkaW86ICdwaXBlJyB9KTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoYXdhaXQgc3ZjIS5nZXREZWZhdWx0QnJhbmNoKFVSSS5maWxlKGRpcikpLCB7XG5cdFx0XHRuYW1lOiAnbWFpbicsXG5cdFx0XHRzdGFydFBvaW50OiAnbWFpbicsXG5cdFx0fSk7XG5cdH0pO1xuXG5cdChoYXNHaXQgPyB0ZXN0IDogdGVzdC5za2lwKSgnY291bnRzIHVuY29tbWl0dGVkIGNoYW5nZXMnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgZGlyID0gaW5pdFJlcG8oeyByZW1vdGU6ICdnaXRAZ2l0bGFiLmNvbTpvd25lci9yZXBvLmdpdCcgfSk7XG5cdFx0Y29uc3QgZnMgPSBhd2FpdCBpbXBvcnQoJ2ZzL3Byb21pc2VzJyk7XG5cdFx0YXdhaXQgZnMud3JpdGVGaWxlKGpvaW4oZGlyLCAnYS50eHQnKSwgJ2hlbGxvJyk7XG5cdFx0YXdhaXQgZnMud3JpdGVGaWxlKGpvaW4oZGlyLCAnYi50eHQnKSwgJ3dvcmxkJyk7XG5cdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgc3ZjIS5nZXRTZXNzaW9uR2l0U3RhdGUoVVJJLmZpbGUoZGlyKSk7XG5cdFx0YXNzZXJ0Lm9rKHJlc3VsdCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdC51bmNvbW1pdHRlZENoYW5nZXMsIDIpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQuaGFzR2l0SHViUmVtb3RlLCBmYWxzZSk7XG5cdH0pO1xuXG5cdChoYXNHaXQgPyB0ZXN0IDogdGVzdC5za2lwKSgncmVwb3J0cyBvdXRnb2luZ0NoYW5nZXMgcmVsYXRpdmUgdG8gYmFzZSBicmFuY2ggd2hlbiBsb2NhbCBicmFuY2ggaGFzIG5vIHVwc3RyZWFtJywgYXN5bmMgKCkgPT4ge1xuXHRcdC8vIENyZWF0ZSBhIGJhcmUgXCJyZW1vdGVcIiByZXBvIGFuZCBzZXQgdXAgdGhlIHdvcmtpbmcgcmVwbyBzbyB0aGF0XG5cdFx0Ly8gYHJlZnMvcmVtb3Rlcy9vcmlnaW4vSEVBRGAgZXhpc3RzIChyZXF1aXJlZCBmb3IgYmFzZUJyYW5jaE5hbWUgcGFyc2luZykuXG5cdFx0Y29uc3QgcmVtb3RlRGlyID0gbWtkdGVtcFN5bmMoam9pbih0bXBkaXIoKSwgJ2FnZW50LWhvc3QtcmVtb3RlLScpKTtcblx0XHRjb25zdCBlbnYgPSB7IC4uLnByb2Nlc3MuZW52LCBHSVRfQVVUSE9SX05BTUU6ICd0JywgR0lUX0FVVEhPUl9FTUFJTDogJ3RAdCcsIEdJVF9DT01NSVRURVJfTkFNRTogJ3QnLCBHSVRfQ09NTUlUVEVSX0VNQUlMOiAndEB0JyB9O1xuXHRcdHRyeSB7XG5cdFx0XHRjcC5leGVjRmlsZVN5bmMoJ2dpdCcsIFsnaW5pdCcsICctcScsICctLWJhcmUnLCAnLWInLCAnbWFpbiddLCB7IGN3ZDogcmVtb3RlRGlyLCBlbnYsIHN0ZGlvOiAncGlwZScgfSk7XG5cdFx0XHR0bXBSb290ID0gbWtkdGVtcFN5bmMoam9pbih0bXBkaXIoKSwgJ2FnZW50LWhvc3QtZ2l0LScpKTtcblx0XHRcdGNvbnN0IHJ1biA9ICguLi5hcmdzOiBzdHJpbmdbXSkgPT4gY3AuZXhlY0ZpbGVTeW5jKCdnaXQnLCBhcmdzLCB7IGN3ZDogdG1wUm9vdCEsIGVudiwgc3RkaW86ICdwaXBlJyB9KTtcblx0XHRcdHJ1bignaW5pdCcsICctcScsICctYicsICdtYWluJyk7XG5cdFx0XHRydW4oJ2NvbmZpZycsICdjb21taXQuZ3BnU2lnbicsICdmYWxzZScpO1xuXHRcdFx0cnVuKCdjb21taXQnLCAnLXEnLCAnLS1hbGxvdy1lbXB0eScsICctbScsICdpbml0aWFsJyk7XG5cdFx0XHRydW4oJ3JlbW90ZScsICdhZGQnLCAnb3JpZ2luJywgYGh0dHBzOi8vZ2l0aHViLmNvbS9vd25lci9yZXBvLmdpdGApO1xuXHRcdFx0Ly8gVXNlIGEgc2VwYXJhdGUgXCJ1cGxvYWRcIiByZW1vdGUgcG9pbnRpbmcgYXQgdGhlIGJhcmUgcmVwbyB0byBwb3B1bGF0ZVxuXHRcdFx0Ly8gdGhlIG9yaWdpbi9tYWluIHJlbW90ZS10cmFja2luZyByZWYgd2l0aG91dCBjaGFuZ2luZyB0aGUgR2l0SHViIFVSTFxuXHRcdFx0Ly8gd2UncmUgdGVzdGluZyBmb3IgaGFzR2l0SHViUmVtb3RlIGRldGVjdGlvbi5cblx0XHRcdHJ1bigncmVtb3RlJywgJ2FkZCcsICd0bXAnLCByZW1vdGVEaXIpO1xuXHRcdFx0cnVuKCdwdXNoJywgJy1xJywgJ3RtcCcsICdtYWluOm1haW4nKTtcblx0XHRcdC8vIENyZWF0ZSB0aGUgb3JpZ2luL21haW4gcmVmIGxvY2FsbHkgd2l0aG91dCBhbnkgbmV0d29yayByb3VuZC10cmlwLlxuXHRcdFx0cnVuKCd1cGRhdGUtcmVmJywgJ3JlZnMvcmVtb3Rlcy9vcmlnaW4vbWFpbicsICdyZWZzL2hlYWRzL21haW4nKTtcblx0XHRcdHJ1bignc3ltYm9saWMtcmVmJywgJ3JlZnMvcmVtb3Rlcy9vcmlnaW4vSEVBRCcsICdyZWZzL3JlbW90ZXMvb3JpZ2luL21haW4nKTtcblxuXHRcdFx0Ly8gQnJhbmNoIG9mZiBhbmQgYWRkIHR3byBjb21taXRzIHdpdGhvdXQgc2V0dGluZyBhbiB1cHN0cmVhbS5cblx0XHRcdHJ1bignY2hlY2tvdXQnLCAnLXEnLCAnLWInLCAnZmVhdHVyZScsICctLW5vLXRyYWNrJyk7XG5cdFx0XHRydW4oJ2NvbW1pdCcsICctcScsICctLWFsbG93LWVtcHR5JywgJy1tJywgJ29uZScpO1xuXHRcdFx0cnVuKCdjb21taXQnLCAnLXEnLCAnLS1hbGxvdy1lbXB0eScsICctbScsICd0d28nKTtcblxuXHRcdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgc3ZjIS5nZXRTZXNzaW9uR2l0U3RhdGUoVVJJLmZpbGUodG1wUm9vdCEpKTtcblx0XHRcdGFzc2VydC5vayhyZXN1bHQsICdleHBlY3RlZCBnaXQgc3RhdGUnKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQuYnJhbmNoTmFtZSwgJ2ZlYXR1cmUnKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQuYmFzZUJyYW5jaE5hbWUsICdtYWluJyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0LnVwc3RyZWFtQnJhbmNoTmFtZSwgdW5kZWZpbmVkKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQub3V0Z29pbmdDaGFuZ2VzLCAyKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQuaGFzQmFzZUJyYW5jaENoYW5nZXMsIHRydWUpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdC51bmNvbW1pdHRlZENoYW5nZXMsIDApO1xuXG5cdFx0XHRydW4oJ2JyYW5jaCcsICctRCcsICdtYWluJyk7XG5cdFx0XHRjb25zdCByZW1vdGVPbmx5UmVzdWx0ID0gYXdhaXQgc3ZjIS5nZXRTZXNzaW9uR2l0U3RhdGUoVVJJLmZpbGUodG1wUm9vdCEpKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZW1vdGVPbmx5UmVzdWx0Py5oYXNCYXNlQnJhbmNoQ2hhbmdlcywgdHJ1ZSk7XG5cdFx0fSBmaW5hbGx5IHtcblx0XHRcdHJtRGlyV2l0aFJldHJ5KHJlbW90ZURpcik7XG5cdFx0fVxuXHR9KTtcbn0pO1xuXG5zdWl0ZSgnQWdlbnRIb3N0R2l0U2VydmljZSAtIGNvbXB1dGVTZXNzaW9uRmlsZURpZmZzIChyZWFsIGdpdCknLCAoKSA9PiB7XG5cdGNvbnN0IGRpc3Bvc2FibGVzID0gZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlKCk7XG5cblx0Y29uc3QgaGFzR2l0ID0gKCgpID0+IHtcblx0XHR0cnkgeyBjcC5leGVjRmlsZVN5bmMoJ2dpdCcsIFsnLS12ZXJzaW9uJ10sIHsgc3RkaW86ICdpZ25vcmUnIH0pOyByZXR1cm4gdHJ1ZTsgfSBjYXRjaCB7IHJldHVybiBmYWxzZTsgfVxuXHR9KSgpO1xuXG5cdGxldCB0bXBSb290OiBzdHJpbmcgfCB1bmRlZmluZWQ7XG5cdGxldCBzdmM6IEFnZW50SG9zdEdpdFNlcnZpY2UgfCB1bmRlZmluZWQ7XG5cblx0c2V0dXAoKCkgPT4ge1xuXHRcdHRtcFJvb3QgPSB1bmRlZmluZWQ7XG5cdFx0c3ZjID0gY3JlYXRlR2l0U2VydmljZShkaXNwb3NhYmxlcyk7XG5cdH0pO1xuXG5cdHRlYXJkb3duKCgpID0+IHtcblx0XHRybURpcldpdGhSZXRyeSh0bXBSb290KTtcblx0fSk7XG5cblx0ZnVuY3Rpb24gaW5pdFJlcG8oKTogeyBkaXI6IHN0cmluZzsgcnVuOiAoLi4uYXJnczogc3RyaW5nW10pID0+IEJ1ZmZlciB9IHtcblx0XHR0bXBSb290ID0gbWtkdGVtcFN5bmMoam9pbih0bXBkaXIoKSwgJ2FnZW50LWhvc3QtZGlmZi0nKSk7XG5cdFx0Y29uc3QgZW52ID0geyAuLi5wcm9jZXNzLmVudiwgR0lUX0FVVEhPUl9OQU1FOiAndCcsIEdJVF9BVVRIT1JfRU1BSUw6ICd0QHQnLCBHSVRfQ09NTUlUVEVSX05BTUU6ICd0JywgR0lUX0NPTU1JVFRFUl9FTUFJTDogJ3RAdCcgfTtcblx0XHRjb25zdCBydW4gPSAoLi4uYXJnczogc3RyaW5nW10pID0+IGNwLmV4ZWNGaWxlU3luYygnZ2l0JywgYXJncywgeyBjd2Q6IHRtcFJvb3QhLCBlbnYsIHN0ZGlvOiAncGlwZScgfSk7XG5cdFx0cnVuKCdpbml0JywgJy1xJywgJy1iJywgJ21haW4nKTtcblx0XHRyZXR1cm4geyBkaXI6IHRtcFJvb3QhLCBydW4gfTtcblx0fVxuXG5cdChoYXNHaXQgPyB0ZXN0IDogdGVzdC5za2lwKSgncmV0dXJucyB1bmRlZmluZWQgZm9yIGEgbm9uLWdpdCBkaXJlY3RvcnknLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgZGlyID0gbWtkdGVtcFN5bmMoam9pbih0bXBkaXIoKSwgJ2FnZW50LWhvc3Qtbm9uZ2l0LWRpZmYtJykpO1xuXHRcdHRtcFJvb3QgPSBkaXI7XG5cdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgc3ZjIS5jb21wdXRlU2Vzc2lvbkZpbGVEaWZmcyhVUkkuZmlsZShkaXIpLCB7IHNlc3Npb25Vcmk6ICdjb3BpbG90Oi9zJyB9KTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0LCB1bmRlZmluZWQpO1xuXHR9KTtcblxuXHQoaGFzR2l0ID8gdGVzdCA6IHRlc3Quc2tpcCkoJ3JlcG9ydHMgbW9kaWZpZWQsIGFkZGVkICh1bnRyYWNrZWQpIGFuZCBkZWxldGVkIGZpbGVzIGFnYWluc3QgSEVBRCcsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBmcyA9IGF3YWl0IGltcG9ydCgnZnMvcHJvbWlzZXMnKTtcblx0XHRjb25zdCB7IGRpciwgcnVuIH0gPSBpbml0UmVwbygpO1xuXHRcdGF3YWl0IGZzLndyaXRlRmlsZShqb2luKGRpciwgJ2tlcHQudHh0JyksICdvbmVcXG50d29cXG50aHJlZVxcbicpO1xuXHRcdGF3YWl0IGZzLndyaXRlRmlsZShqb2luKGRpciwgJ2dvbmUudHh0JyksICdieWVcXG4nKTtcblx0XHRydW4oJ2FkZCcsICcuJyk7XG5cdFx0cnVuKCdjb21taXQnLCAnLXEnLCAnLW0nLCAnaW5pdCcpO1xuXG5cdFx0Ly8gTW9kaWZ5LCBhZGQgKHVudHJhY2tlZCksIGRlbGV0ZS5cblx0XHRhd2FpdCBmcy53cml0ZUZpbGUoam9pbihkaXIsICdrZXB0LnR4dCcpLCAnb25lXFxudHdvXFxudGhyZWVcXG5mb3VyXFxuJyk7XG5cdFx0YXdhaXQgZnMud3JpdGVGaWxlKGpvaW4oZGlyLCAnZnJlc2gudHh0JyksICdoZWxsb1xcbicpO1xuXHRcdGF3YWl0IGZzLnVubGluayhqb2luKGRpciwgJ2dvbmUudHh0JykpO1xuXG5cdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgc3ZjIS5jb21wdXRlU2Vzc2lvbkZpbGVEaWZmcyhVUkkuZmlsZShkaXIpLCB7IHNlc3Npb25Vcmk6ICdjb3BpbG90Oi9zJyB9KTtcblx0XHRhc3NlcnQub2socmVzdWx0LCAnZXhwZWN0ZWQgZGlmZnMnKTtcblx0XHRjb25zdCBieVBhdGggPSBuZXcgTWFwKHJlc3VsdC5tYXAoZCA9PiBbZC5hZnRlcj8udXJpID8/IGQuYmVmb3JlPy51cmksIGRdKSk7XG5cblx0XHQvLyBGaW5kIGJ5IGJhc2VuYW1lIHRvIGJlIHJvYnVzdCBhZ2FpbnN0IHBhdGggbm9ybWFsaXphdGlvbiBkaWZmZXJlbmNlcyAoZS5nLiBtYWNPUyAvcHJpdmF0ZSBwcmVmaXgpLlxuXHRcdGNvbnN0IGZpbmRCeUJhc2VuYW1lID0gKG5hbWU6IHN0cmluZykgPT4gcmVzdWx0LmZpbmQoZCA9PiB7XG5cdFx0XHRjb25zdCB1ID0gZC5hZnRlcj8udXJpID8/IGQuYmVmb3JlPy51cmk7XG5cdFx0XHRyZXR1cm4gdHlwZW9mIHUgPT09ICdzdHJpbmcnICYmIHUuZW5kc1dpdGgoJy8nICsgbmFtZSk7XG5cdFx0fSk7XG5cblx0XHRjb25zdCBrZXB0ID0gZmluZEJ5QmFzZW5hbWUoJ2tlcHQudHh0Jyk7XG5cdFx0YXNzZXJ0Lm9rKGtlcHQ/LmJlZm9yZSAmJiBrZXB0LmFmdGVyLCBgbW9kaWZpZWQgZmlsZSBzaG91bGQgaGF2ZSBiZWZvcmUrYWZ0ZXI7IHJlc3VsdD0ke0pTT04uc3RyaW5naWZ5KHJlc3VsdC5tYXAoZCA9PiAoeyBhOiBkLmFmdGVyPy51cmksIGI6IGQuYmVmb3JlPy51cmkgfSkpKX1gKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGtlcHQhLmRpZmYsIHsgYWRkZWQ6IDEsIHJlbW92ZWQ6IDAgfSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKFVSSS5wYXJzZShrZXB0IS5iZWZvcmUhLmNvbnRlbnQudXJpKS5zY2hlbWUsICdnaXQtYmxvYicsICdiZWZvcmUgY29udGVudCBzaG91bGQgYmUgYSBnaXQtYmxvYjogVVJJJyk7XG5cblx0XHRjb25zdCBmcmVzaCA9IGZpbmRCeUJhc2VuYW1lKCdmcmVzaC50eHQnKTtcblx0XHRhc3NlcnQub2soZnJlc2g/LmFmdGVyICYmICFmcmVzaC5iZWZvcmUsICd1bnRyYWNrZWQgZmlsZSBzaG91bGQgaGF2ZSBvbmx5IGFmdGVyJyk7XG5cblx0XHRjb25zdCBnb25lID0gZmluZEJ5QmFzZW5hbWUoJ2dvbmUudHh0Jyk7XG5cdFx0YXNzZXJ0Lm9rKGdvbmU/LmJlZm9yZSAmJiAhZ29uZS5hZnRlciwgJ2RlbGV0ZWQgZmlsZSBzaG91bGQgaGF2ZSBvbmx5IGJlZm9yZScpO1xuXHRcdHZvaWQgYnlQYXRoO1xuXHR9KTtcblxuXHQoaGFzR2l0ID8gdGVzdCA6IHRlc3Quc2tpcCkoJ3JlcG9ydHMgc3RhZ2VkIHJlbmFtZSBzb3VyY2Ugd2hlbiB1bnRyYWNrZWQgZmlsZXMgZm9yY2UgdGVtcC1pbmRleCBzdGFnaW5nJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IGZzID0gYXdhaXQgaW1wb3J0KCdmcy9wcm9taXNlcycpO1xuXHRcdGNvbnN0IHsgZGlyLCBydW4gfSA9IGluaXRSZXBvKCk7XG5cdFx0YXdhaXQgZnMud3JpdGVGaWxlKGpvaW4oZGlyLCAnb2xkLnR4dCcpLCAnb25lXFxuJyk7XG5cdFx0cnVuKCdhZGQnLCAnLicpO1xuXHRcdHJ1bignY29tbWl0JywgJy1xJywgJy1tJywgJ2luaXQnKTtcblxuXHRcdHJ1bignbXYnLCAnb2xkLnR4dCcsICduZXcudHh0Jyk7XG5cdFx0YXdhaXQgZnMud3JpdGVGaWxlKGpvaW4oZGlyLCAnZnJlc2gudHh0JyksICdmcmVzaFxcbicpO1xuXG5cdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgc3ZjIS5jb21wdXRlU2Vzc2lvbkZpbGVEaWZmcyhVUkkuZmlsZShkaXIpLCB7IHNlc3Npb25Vcmk6ICdjb3BpbG90Oi9zJyB9KTtcblx0XHRhc3NlcnQub2socmVzdWx0LCAnZXhwZWN0ZWQgZGlmZnMnKTtcblx0XHRjb25zdCByZW5hbWUgPSByZXN1bHQuZmluZChkID0+IGQuYmVmb3JlPy51cmkuZW5kc1dpdGgoJy9vbGQudHh0JykgJiYgZC5hZnRlcj8udXJpLmVuZHNXaXRoKCcvbmV3LnR4dCcpKTtcblx0XHRjb25zdCBmcmVzaCA9IHJlc3VsdC5maW5kKGQgPT4gIWQuYmVmb3JlICYmIGQuYWZ0ZXI/LnVyaS5lbmRzV2l0aCgnL2ZyZXNoLnR4dCcpKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0cmVuYW1lOiByZW5hbWUgJiYgeyBiZWZvcmU6IFVSSS5wYXJzZShyZW5hbWUuYmVmb3JlIS51cmkpLnBhdGguc3BsaXQoJy8nKS5wb3AoKSwgYWZ0ZXI6IFVSSS5wYXJzZShyZW5hbWUuYWZ0ZXIhLnVyaSkucGF0aC5zcGxpdCgnLycpLnBvcCgpIH0sXG5cdFx0XHRmcmVzaDogZnJlc2ggJiYgVVJJLnBhcnNlKGZyZXNoLmFmdGVyIS51cmkpLnBhdGguc3BsaXQoJy8nKS5wb3AoKSxcblx0XHR9LCB7XG5cdFx0XHRyZW5hbWU6IHsgYmVmb3JlOiAnb2xkLnR4dCcsIGFmdGVyOiAnbmV3LnR4dCcgfSxcblx0XHRcdGZyZXNoOiAnZnJlc2gudHh0Jyxcblx0XHR9KTtcblx0fSk7XG5cblx0KGhhc0dpdCAmJiAhaXNXaW5kb3dzID8gdGVzdCA6IHRlc3Quc2tpcCkoJ3JldHVybnMgdW5kZWZpbmVkIHdoZW4gdGVtcC1pbmRleCBzdGFnaW5nIGZhaWxzJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IGZzID0gYXdhaXQgaW1wb3J0KCdmcy9wcm9taXNlcycpO1xuXHRcdGNvbnN0IHsgZGlyIH0gPSBpbml0UmVwbygpO1xuXHRcdGNvbnN0IGJsb2NrZWRQYXRoID0gam9pbihkaXIsICdibG9ja2VkLnR4dCcpO1xuXHRcdGF3YWl0IGZzLndyaXRlRmlsZShibG9ja2VkUGF0aCwgJ2Jsb2NrZWRcXG4nKTtcblx0XHRhd2FpdCBmcy5jaG1vZChibG9ja2VkUGF0aCwgMCk7XG5cdFx0dHJ5IHtcblx0XHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IHN2YyEuY29tcHV0ZVNlc3Npb25GaWxlRGlmZnMoVVJJLmZpbGUoZGlyKSwgeyBzZXNzaW9uVXJpOiAnY29waWxvdDovcycgfSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0LCB1bmRlZmluZWQpO1xuXHRcdH0gZmluYWxseSB7XG5cdFx0XHRhd2FpdCBmcy5jaG1vZChibG9ja2VkUGF0aCwgMG82MDApO1xuXHRcdH1cblx0fSk7XG5cblx0KGhhc0dpdCA/IHRlc3QgOiB0ZXN0LnNraXApKCdhbmNob3JzIGFnYWluc3QgdGhlIG1lcmdlLWJhc2Ugb2YgdGhlIHJlcXVlc3RlZCBiYXNlIGJyYW5jaCcsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBmcyA9IGF3YWl0IGltcG9ydCgnZnMvcHJvbWlzZXMnKTtcblx0XHRjb25zdCB7IGRpciwgcnVuIH0gPSBpbml0UmVwbygpO1xuXHRcdGF3YWl0IGZzLndyaXRlRmlsZShqb2luKGRpciwgJ2EudHh0JyksICdhXFxuJyk7XG5cdFx0cnVuKCdhZGQnLCAnLicpO1xuXHRcdHJ1bignY29tbWl0JywgJy1xJywgJy1tJywgJ2luaXQnKTtcblx0XHQvLyBCcmFuY2ggb2ZmLCB0aGVuIGFkdmFuY2UgbWFpbiBiZWhpbmQgdXMgc28gbWVyZ2UtYmFzZSAhPSBIRUFELlxuXHRcdHJ1bignY2hlY2tvdXQnLCAnLXEnLCAnLWInLCAnZmVhdHVyZScpO1xuXHRcdGF3YWl0IGZzLndyaXRlRmlsZShqb2luKGRpciwgJ2IudHh0JyksICdiXFxuJyk7XG5cdFx0cnVuKCdhZGQnLCAnLicpO1xuXHRcdHJ1bignY29tbWl0JywgJy1xJywgJy1tJywgJ2FkZCBiIG9uIGZlYXR1cmUnKTtcblxuXHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IHN2YyEuY29tcHV0ZVNlc3Npb25GaWxlRGlmZnMoVVJJLmZpbGUoZGlyKSwgeyBzZXNzaW9uVXJpOiAnY29waWxvdDovcycsIGJhc2VCcmFuY2g6ICdtYWluJyB9KTtcblx0XHRhc3NlcnQub2socmVzdWx0LCAnZXhwZWN0ZWQgZGlmZnMnKTtcblx0XHQvLyBgYi50eHRgIHdhcyBjb21taXR0ZWQgb24gYGZlYXR1cmVgIGFmdGVyIGJyYW5jaGluZyBmcm9tIGBtYWluYCwgc29cblx0XHQvLyBpdCBtdXN0IHNob3cgdXAgaW4gdGhlIG1lcmdlLWJhc2UgZGlmZiBldmVuIHRob3VnaCB0aGVyZSBhcmUgbm9cblx0XHQvLyB1bmNvbW1pdHRlZCBjaGFuZ2VzIGluIHRoZSB3b3JraW5nIHRyZWUuXG5cdFx0Y29uc3QgcGF0aHMgPSByZXN1bHQubWFwKGQgPT4gKGQuYWZ0ZXI/LnVyaSA/PyBkLmJlZm9yZT8udXJpKSk7XG5cdFx0YXNzZXJ0Lm9rKHBhdGhzLnNvbWUocCA9PiBwPy5lbmRzV2l0aCgnYi50eHQnKSksIGBleHBlY3RlZCBiLnR4dCBpbiBkaWZmOyBnb3QgJHtwYXRocy5qb2luKCcsICcpfWApO1xuXHR9KTtcblxuXHQoaGFzR2l0ID8gdGVzdCA6IHRlc3Quc2tpcCkoJ3ByZWZlcnMgb3JpZ2luIGJhc2UgYnJhbmNoIHdoZW4gbG9jYWwgYmFzZSBicmFuY2ggaXMgc3RhbGUnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgZnMgPSBhd2FpdCBpbXBvcnQoJ2ZzL3Byb21pc2VzJyk7XG5cdFx0Y29uc3QgeyBkaXIsIHJ1biB9ID0gaW5pdFJlcG8oKTtcblx0XHRhd2FpdCBmcy53cml0ZUZpbGUoam9pbihkaXIsICdzaGFyZWQudHh0JyksICdiYXNlXFxuJyk7XG5cdFx0cnVuKCdhZGQnLCAnLicpO1xuXHRcdHJ1bignY29tbWl0JywgJy1xJywgJy1tJywgJ2Jhc2UnKTtcblx0XHRydW4oJ3VwZGF0ZS1yZWYnLCAncmVmcy9yZW1vdGVzL29yaWdpbi9tYWluJywgJ0hFQUQnKTtcblxuXHRcdHJ1bignY2hlY2tvdXQnLCAnLXEnLCAnLWInLCAnZmVhdHVyZScpO1xuXHRcdHJ1bignY2hlY2tvdXQnLCAnLXEnLCAnLWInLCAndXBzdHJlYW0nLCAnbWFpbicpO1xuXHRcdGF3YWl0IGZzLndyaXRlRmlsZShqb2luKGRpciwgJ3Vwc3RyZWFtLnR4dCcpLCAndXBzdHJlYW1cXG4nKTtcblx0XHRydW4oJ2FkZCcsICcuJyk7XG5cdFx0cnVuKCdjb21taXQnLCAnLXEnLCAnLW0nLCAndXBzdHJlYW0nKTtcblx0XHRydW4oJ3VwZGF0ZS1yZWYnLCAncmVmcy9yZW1vdGVzL29yaWdpbi9tYWluJywgJ0hFQUQnKTtcblxuXHRcdHJ1bignY2hlY2tvdXQnLCAnLXEnLCAnZmVhdHVyZScpO1xuXHRcdHJ1bignbWVyZ2UnLCAnLXEnLCAnLS1uby1mZicsICdvcmlnaW4vbWFpbicsICctbScsICdtZXJnZSBvcmlnaW4vbWFpbicpO1xuXHRcdGF3YWl0IGZzLndyaXRlRmlsZShqb2luKGRpciwgJ2ZlYXR1cmUudHh0JyksICdmZWF0dXJlXFxuJyk7XG5cdFx0cnVuKCdhZGQnLCAnLicpO1xuXHRcdHJ1bignY29tbWl0JywgJy1xJywgJy1tJywgJ2ZlYXR1cmUnKTtcblxuXHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IHN2YyEuY29tcHV0ZVNlc3Npb25GaWxlRGlmZnMoVVJJLmZpbGUoZGlyKSwgeyBzZXNzaW9uVXJpOiAnY29waWxvdDovcycsIGJhc2VCcmFuY2g6ICdtYWluJyB9KTtcblx0XHRhc3NlcnQub2socmVzdWx0LCAnZXhwZWN0ZWQgZGlmZnMnKTtcblx0XHRjb25zdCBwYXRocyA9IHJlc3VsdC5tYXAoZCA9PiBkLmFmdGVyPy51cmkgPz8gZC5iZWZvcmU/LnVyaSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRmZWF0dXJlOiBwYXRocy5zb21lKHAgPT4gcD8uZW5kc1dpdGgoJ2ZlYXR1cmUudHh0JykpLFxuXHRcdFx0dXBzdHJlYW06IHBhdGhzLnNvbWUocCA9PiBwPy5lbmRzV2l0aCgndXBzdHJlYW0udHh0JykpLFxuXHRcdH0sIHtcblx0XHRcdGZlYXR1cmU6IHRydWUsXG5cdFx0XHR1cHN0cmVhbTogZmFsc2UsXG5cdFx0fSk7XG5cdH0pO1xuXG5cdChoYXNHaXQgPyB0ZXN0IDogdGVzdC5za2lwKSgncmV0dXJucyBubyBkaWZmcyBmb3IgYSBjbGVhbiByZXBvJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IGZzID0gYXdhaXQgaW1wb3J0KCdmcy9wcm9taXNlcycpO1xuXHRcdGNvbnN0IHsgZGlyLCBydW4gfSA9IGluaXRSZXBvKCk7XG5cdFx0YXdhaXQgZnMud3JpdGVGaWxlKGpvaW4oZGlyLCAnYS50eHQnKSwgJ2FcXG4nKTtcblx0XHRydW4oJ2FkZCcsICcuJyk7XG5cdFx0cnVuKCdjb21taXQnLCAnLXEnLCAnLW0nLCAnaW5pdCcpO1xuXG5cdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgc3ZjIS5jb21wdXRlU2Vzc2lvbkZpbGVEaWZmcyhVUkkuZmlsZShkaXIpLCB7IHNlc3Npb25Vcmk6ICdjb3BpbG90Oi9zJyB9KTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHJlc3VsdCwgW10pO1xuXHR9KTtcblxuXHQoaGFzR2l0ID8gdGVzdCA6IHRlc3Quc2tpcCkoJ2hhbmRsZXMgYW4gZW1wdHkgcmVwbyAobm8gSEVBRCkgYnkgdHJlYXRpbmcgZmlsZXMgYXMgYWRkZWQnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgZnMgPSBhd2FpdCBpbXBvcnQoJ2ZzL3Byb21pc2VzJyk7XG5cdFx0Y29uc3QgeyBkaXIgfSA9IGluaXRSZXBvKCk7XG5cdFx0YXdhaXQgZnMud3JpdGVGaWxlKGpvaW4oZGlyLCAnZmlyc3QudHh0JyksICdoZWxsb1xcbicpO1xuXG5cdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgc3ZjIS5jb21wdXRlU2Vzc2lvbkZpbGVEaWZmcyhVUkkuZmlsZShkaXIpLCB7IHNlc3Npb25Vcmk6ICdjb3BpbG90Oi9zJyB9KTtcblx0XHRhc3NlcnQub2socmVzdWx0LCAnZXhwZWN0ZWQgZGlmZnMnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0Lmxlbmd0aCwgMSk7XG5cdFx0YXNzZXJ0Lm9rKHJlc3VsdFswXS5hZnRlciAmJiAhcmVzdWx0WzBdLmJlZm9yZSwgJ3VudHJhY2tlZCBmaWxlIGluIGVtcHR5IHJlcG8gc2hvdWxkIGJlIGFuIGFkZGl0aW9uJyk7XG5cdH0pO1xuXG5cdChoYXNHaXQgPyB0ZXN0IDogdGVzdC5za2lwKSgnY2FwdHVyZVdvcmtpbmdUcmVlQXNUcmVlIHN0YWdlcyBzY29wZWQgcmVuYW1lIHNvdXJjZSBhbmQgdW50cmFja2VkIHBhdGhzJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IGZzID0gYXdhaXQgaW1wb3J0KCdmcy9wcm9taXNlcycpO1xuXHRcdGNvbnN0IHsgZGlyLCBydW4gfSA9IGluaXRSZXBvKCk7XG5cdFx0YXdhaXQgZnMud3JpdGVGaWxlKGpvaW4oZGlyLCAnb2xkLnR4dCcpLCAnb25lXFxuJyk7XG5cdFx0cnVuKCdhZGQnLCAnLicpO1xuXHRcdHJ1bignY29tbWl0JywgJy1xJywgJy1tJywgJ2luaXQnKTtcblxuXHRcdHJ1bignbXYnLCAnb2xkLnR4dCcsICduZXcudHh0Jyk7XG5cdFx0YXdhaXQgZnMud3JpdGVGaWxlKGpvaW4oZGlyLCAnZnJlc2gudHh0JyksICdmcmVzaFxcbicpO1xuXG5cdFx0Y29uc3QgdHJlZSA9IGF3YWl0IHN2YyEuY2FwdHVyZVdvcmtpbmdUcmVlQXNUcmVlKFVSSS5maWxlKGRpcikpO1xuXHRcdGFzc2VydC5vayh0cmVlLCAnZXhwZWN0ZWQgdHJlZSBvYmplY3QnKTtcblx0XHRjb25zdCB0cmVlUGF0aHMgPSBjcC5leGVjRmlsZVN5bmMoJ2dpdCcsIFsnbHMtdHJlZScsICctcicsICctLW5hbWUtb25seScsIHRyZWVdLCB7IGN3ZDogZGlyLCBlbmNvZGluZzogJ3V0ZjgnIH0pXG5cdFx0XHQudHJpbSgpXG5cdFx0XHQuc3BsaXQoL1xccj9cXG4vZylcblx0XHRcdC5maWx0ZXIoQm9vbGVhbilcblx0XHRcdC5zb3J0KCk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHRyZWVQYXRocywgWydmcmVzaC50eHQnLCAnbmV3LnR4dCddKTtcblx0fSk7XG5cblx0KGhhc0dpdCA/IHRlc3QgOiB0ZXN0LnNraXApKCdjb21wdXRlcyBib3VuZGVkIHBlci1maWxlIHBhdGNoZXMgZnJvbSBhbiBpbW11dGFibGUgd29ya2luZy10cmVlIHNuYXBzaG90JywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IGZzID0gYXdhaXQgaW1wb3J0KCdmcy9wcm9taXNlcycpO1xuXHRcdGNvbnN0IHsgZGlyLCBydW4gfSA9IGluaXRSZXBvKCk7XG5cdFx0YXdhaXQgZnMud3JpdGVGaWxlKGpvaW4oZGlyLCAndHJhY2tlZC50eHQnKSwgJ2JlZm9yZVxcbicpO1xuXHRcdHJ1bignYWRkJywgJy4nKTtcblx0XHRydW4oJ2NvbW1pdCcsICctcScsICctbScsICdpbml0Jyk7XG5cdFx0Y29uc3QgYmFzZWxpbmUgPSBydW4oJ3Jldi1wYXJzZScsICdIRUFEJykudG9TdHJpbmcoKS50cmltKCk7XG5cblx0XHRhd2FpdCBmcy53cml0ZUZpbGUoam9pbihkaXIsICd0cmFja2VkLnR4dCcpLCAnYWZ0ZXJcXG4nKTtcblx0XHRhd2FpdCBmcy53cml0ZUZpbGUoam9pbihkaXIsICd1bnRyYWNrZWQudHh0JyksICduZXdcXG4nKTtcblx0XHRjb25zdCB0cmVlID0gYXdhaXQgc3ZjIS5jYXB0dXJlV29ya2luZ1RyZWVBc1RyZWUoVVJJLmZpbGUoZGlyKSk7XG5cdFx0YXNzZXJ0Lm9rKHRyZWUpO1xuXHRcdGNvbnN0IGZpbGVEaWZmcyA9IGF3YWl0IHN2YyEuY29tcHV0ZUZpbGVEaWZmc0JldHdlZW5SZWZzKFVSSS5maWxlKGRpciksIHsgc2Vzc2lvblVyaTogJ2NvcGlsb3Q6L3MnLCBmcm9tUmVmOiBiYXNlbGluZSwgdG9SZWY6IHRyZWUgfSk7XG5cdFx0YXNzZXJ0Lm9rKGZpbGVEaWZmcyk7XG5cdFx0Y29uc3Qgc25hcHNob3RzID0gYXdhaXQgUHJvbWlzZS5hbGwoZmlsZURpZmZzLm1hcChhc3luYyBmaWxlRGlmZiA9PiB7XG5cdFx0XHRjb25zdCBiZWZvcmUgPSBmaWxlRGlmZi5iZWZvcmU/LnVyaSA/IFVSSS5wYXJzZShmaWxlRGlmZi5iZWZvcmUudXJpKS5wYXRoLnNwbGl0KCcvJykucG9wKCkgOiB1bmRlZmluZWQ7XG5cdFx0XHRjb25zdCBhZnRlciA9IGZpbGVEaWZmLmFmdGVyPy51cmkgPyBVUkkucGFyc2UoZmlsZURpZmYuYWZ0ZXIudXJpKS5wYXRoLnNwbGl0KCcvJykucG9wKCkgOiB1bmRlZmluZWQ7XG5cdFx0XHRjb25zdCBwYXRocyA9IFtiZWZvcmUsIGFmdGVyXS5maWx0ZXIoKHBhdGgpOiBwYXRoIGlzIHN0cmluZyA9PiBwYXRoICE9PSB1bmRlZmluZWQpO1xuXHRcdFx0Y29uc3QgcGF0Y2ggPSBhd2FpdCBzdmMhLmdldERpZmZQYXRjaEJldHdlZW5SZWZzKFVSSS5maWxlKGRpciksIHsgZnJvbVJlZjogYmFzZWxpbmUsIHRvUmVmOiB0cmVlLCBwYXRocywgbWF4QnVmZmVyOiA5MDAgKiAxMDI0IH0pO1xuXHRcdFx0cmV0dXJuIHsgYmVmb3JlLCBhZnRlciwgcGF0Y2ggfTtcblx0XHR9KSk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHNuYXBzaG90cy5tYXAoc25hcHNob3QgPT4gKHtcblx0XHRcdGJlZm9yZTogc25hcHNob3QuYmVmb3JlLFxuXHRcdFx0YWZ0ZXI6IHNuYXBzaG90LmFmdGVyLFxuXHRcdFx0dG9vTGFyZ2U6IHNuYXBzaG90LnBhdGNoPy50b29MYXJnZSxcblx0XHRcdGNvbnRhaW5zRXhwZWN0ZWRDb250ZW50OiBzbmFwc2hvdC5hZnRlciA9PT0gJ3RyYWNrZWQudHh0J1xuXHRcdFx0XHQ/IHNuYXBzaG90LnBhdGNoPy5wYXRjaD8uaW5jbHVkZXMoJy1iZWZvcmVcXG4rYWZ0ZXInKVxuXHRcdFx0XHQ6IHNuYXBzaG90LnBhdGNoPy5wYXRjaD8uaW5jbHVkZXMoJytuZXcnKSxcblx0XHR9KSkuc29ydCgoYSwgYikgPT4gKGEuYWZ0ZXIgPz8gJycpLmxvY2FsZUNvbXBhcmUoYi5hZnRlciA/PyAnJykpLCBbe1xuXHRcdFx0YmVmb3JlOiAndHJhY2tlZC50eHQnLFxuXHRcdFx0YWZ0ZXI6ICd0cmFja2VkLnR4dCcsXG5cdFx0XHR0b29MYXJnZTogZmFsc2UsXG5cdFx0XHRjb250YWluc0V4cGVjdGVkQ29udGVudDogdHJ1ZSxcblx0XHR9LCB7XG5cdFx0XHRiZWZvcmU6IHVuZGVmaW5lZCxcblx0XHRcdGFmdGVyOiAndW50cmFja2VkLnR4dCcsXG5cdFx0XHR0b29MYXJnZTogZmFsc2UsXG5cdFx0XHRjb250YWluc0V4cGVjdGVkQ29udGVudDogdHJ1ZSxcblx0XHR9XSk7XG5cdH0pO1xuXG5cdChoYXNHaXQgJiYgIWlzV2luZG93cyA/IHRlc3QgOiB0ZXN0LnNraXApKCdjYXB0dXJlV29ya2luZ1RyZWVBc1RyZWUgcmV0dXJucyB1bmRlZmluZWQgd2hlbiBzdGFnaW5nIGZhaWxzJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IGZzID0gYXdhaXQgaW1wb3J0KCdmcy9wcm9taXNlcycpO1xuXHRcdGNvbnN0IHsgZGlyIH0gPSBpbml0UmVwbygpO1xuXHRcdGNvbnN0IGJsb2NrZWRQYXRoID0gam9pbihkaXIsICdibG9ja2VkLnR4dCcpO1xuXHRcdGF3YWl0IGZzLndyaXRlRmlsZShibG9ja2VkUGF0aCwgJ2Jsb2NrZWRcXG4nKTtcblx0XHRhd2FpdCBmcy5jaG1vZChibG9ja2VkUGF0aCwgMCk7XG5cdFx0dHJ5IHtcblx0XHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IHN2YyEuY2FwdHVyZVdvcmtpbmdUcmVlQXNUcmVlKFVSSS5maWxlKGRpcikpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdCwgdW5kZWZpbmVkKTtcblx0XHR9IGZpbmFsbHkge1xuXHRcdFx0YXdhaXQgZnMuY2htb2QoYmxvY2tlZFBhdGgsIDBvNjAwKTtcblx0XHR9XG5cdH0pO1xuXG5cdChoYXNHaXQgPyB0ZXN0IDogdGVzdC5za2lwKSgnc2hvd0Jsb2IgcmV0cmlldmVzIGNvbW1pdHRlZCBjb250ZW50JywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IGZzID0gYXdhaXQgaW1wb3J0KCdmcy9wcm9taXNlcycpO1xuXHRcdGNvbnN0IHsgZGlyLCBydW4gfSA9IGluaXRSZXBvKCk7XG5cdFx0YXdhaXQgZnMud3JpdGVGaWxlKGpvaW4oZGlyLCAnYS50eHQnKSwgJ29yaWdpbmFsXFxuJyk7XG5cdFx0cnVuKCdhZGQnLCAnLicpO1xuXHRcdHJ1bignY29tbWl0JywgJy1xJywgJy1tJywgJ2luaXQnKTtcblx0XHRjb25zdCByZWYgPSBjcC5leGVjRmlsZVN5bmMoJ2dpdCcsIFsncmV2LXBhcnNlJywgJ0hFQUQnXSwgeyBjd2Q6IGRpciwgZW5jb2Rpbmc6ICd1dGY4JyB9KS50cmltKCk7XG5cdFx0YXdhaXQgZnMud3JpdGVGaWxlKGpvaW4oZGlyLCAnYS50eHQnKSwgJ2NoYW5nZWRcXG4nKTtcblxuXHRcdGNvbnN0IGJsb2IgPSBhd2FpdCBzdmMhLnNob3dCbG9iKFVSSS5maWxlKGRpciksIHJlZiwgJ2EudHh0Jyk7XG5cdFx0YXNzZXJ0Lm9rKGJsb2IpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChibG9iLnRvU3RyaW5nKCksICdvcmlnaW5hbFxcbicpO1xuXHR9KTtcbn0pO1xuXG5zdWl0ZSgnQWdlbnRIb3N0R2l0U2VydmljZSAtIHdvcmt0cmVlIGhlbHBlcnMgKHJlYWwgZ2l0KScsICgpID0+IHtcblx0Y29uc3QgZGlzcG9zYWJsZXMgPSBlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUoKTtcblxuXHRjb25zdCBoYXNHaXQgPSAoKCkgPT4ge1xuXHRcdHRyeSB7IGNwLmV4ZWNGaWxlU3luYygnZ2l0JywgWyctLXZlcnNpb24nXSwgeyBzdGRpbzogJ2lnbm9yZScgfSk7IHJldHVybiB0cnVlOyB9IGNhdGNoIHsgcmV0dXJuIGZhbHNlOyB9XG5cdH0pKCk7XG5cblx0bGV0IHRtcFJvb3Q6IHN0cmluZyB8IHVuZGVmaW5lZDtcblx0bGV0IHN2YzogQWdlbnRIb3N0R2l0U2VydmljZSB8IHVuZGVmaW5lZDtcblx0Y29uc3QgZW52ID0geyAuLi5wcm9jZXNzLmVudiwgR0lUX0FVVEhPUl9OQU1FOiAndCcsIEdJVF9BVVRIT1JfRU1BSUw6ICd0QHQnLCBHSVRfQ09NTUlUVEVSX05BTUU6ICd0JywgR0lUX0NPTU1JVFRFUl9FTUFJTDogJ3RAdCcgfTtcblxuXHRzZXR1cCgoKSA9PiB7XG5cdFx0dG1wUm9vdCA9IHVuZGVmaW5lZDtcblx0XHRzdmMgPSBjcmVhdGVHaXRTZXJ2aWNlKGRpc3Bvc2FibGVzKTtcblx0fSk7XG5cblx0dGVhcmRvd24oKCkgPT4ge1xuXHRcdHJtRGlyV2l0aFJldHJ5KHRtcFJvb3QpO1xuXHR9KTtcblxuXHRmdW5jdGlvbiBpbml0UmVwbygpOiBzdHJpbmcge1xuXHRcdHRtcFJvb3QgPSBta2R0ZW1wU3luYyhqb2luKHRtcGRpcigpLCAnYWdlbnQtaG9zdC1naXQtd3QtJykpO1xuXHRcdGNvbnN0IHJ1biA9ICguLi5hcmdzOiBzdHJpbmdbXSkgPT4gY3AuZXhlY0ZpbGVTeW5jKCdnaXQnLCBhcmdzLCB7IGN3ZDogdG1wUm9vdCEsIGVudiwgc3RkaW86ICdwaXBlJyB9KTtcblx0XHRydW4oJ2luaXQnLCAnLXEnLCAnLWInLCAnbWFpbicpO1xuXHRcdHJ1bignY29uZmlnJywgJ3VzZXIubmFtZScsICd0Jyk7XG5cdFx0cnVuKCdjb25maWcnLCAndXNlci5lbWFpbCcsICd0QHQnKTtcblx0XHRydW4oJ2NvbmZpZycsICdjb21taXQuZ3BnU2lnbicsICdmYWxzZScpO1xuXHRcdHJ1bignY29tbWl0JywgJy1xJywgJy0tYWxsb3ctZW1wdHknLCAnLW0nLCAnaW5pdGlhbCcpO1xuXHRcdHJldHVybiB0bXBSb290ITtcblx0fVxuXG5cdChoYXNHaXQgPyB0ZXN0IDogdGVzdC5za2lwKSgnYnJhbmNoRXhpc3RzIHJlcG9ydHMgdHJ1ZSBmb3IgSEVBRCBicmFuY2ggYW5kIGZhbHNlIGZvciBtaXNzaW5nIGJyYW5jaGVzJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IGRpciA9IGluaXRSZXBvKCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGF3YWl0IHN2YyEuYnJhbmNoRXhpc3RzKFVSSS5maWxlKGRpciksICdtYWluJyksIHRydWUpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChhd2FpdCBzdmMhLmJyYW5jaEV4aXN0cyhVUkkuZmlsZShkaXIpLCAnZG9lcy1ub3QtZXhpc3QnKSwgZmFsc2UpO1xuXHR9KTtcblxuXHQoaGFzR2l0ID8gdGVzdCA6IHRlc3Quc2tpcCkoJ2hhc1VuY29tbWl0dGVkQ2hhbmdlcyBmbGlwcyB3aXRoIHVudHJhY2tlZCBhbmQgY29tbWl0dGVkIHdvcmsnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgZGlyID0gaW5pdFJlcG8oKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYXdhaXQgc3ZjIS5oYXNVbmNvbW1pdHRlZENoYW5nZXMoVVJJLmZpbGUoZGlyKSksIGZhbHNlKTtcblx0XHRjb25zdCBmcyA9IGF3YWl0IGltcG9ydCgnZnMvcHJvbWlzZXMnKTtcblx0XHRhd2FpdCBmcy53cml0ZUZpbGUoam9pbihkaXIsICdhLnR4dCcpLCAnaGVsbG8nKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYXdhaXQgc3ZjIS5oYXNVbmNvbW1pdHRlZENoYW5nZXMoVVJJLmZpbGUoZGlyKSksIHRydWUpO1xuXHRcdGNwLmV4ZWNGaWxlU3luYygnZ2l0JywgWydhZGQnLCAnYS50eHQnXSwgeyBjd2Q6IGRpciwgZW52LCBzdGRpbzogJ3BpcGUnIH0pO1xuXHRcdGNwLmV4ZWNGaWxlU3luYygnZ2l0JywgWydjb21taXQnLCAnLXEnLCAnLW0nLCAnYWRkIGEnXSwgeyBjd2Q6IGRpciwgZW52LCBzdGRpbzogJ3BpcGUnIH0pO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChhd2FpdCBzdmMhLmhhc1VuY29tbWl0dGVkQ2hhbmdlcyhVUkkuZmlsZShkaXIpKSwgZmFsc2UpO1xuXHR9KTtcblxuXHQoaGFzR2l0ICYmICFpc1dpbmRvd3MgPyB0ZXN0IDogdGVzdC5za2lwKSgnc3RhdHVzIHByb2JlcyBkbyBub3QgYWNxdWlyZSBvcHRpb25hbCBpbmRleCBsb2NrcycsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBkaXIgPSBpbml0UmVwbygpO1xuXHRcdGNvbnN0IGZzID0gYXdhaXQgaW1wb3J0KCdmcy9wcm9taXNlcycpO1xuXHRcdGNvbnN0IHRyYWNrZWRGaWxlID0gam9pbihkaXIsICd0cmFja2VkLnR4dCcpO1xuXHRcdGF3YWl0IGZzLndyaXRlRmlsZSh0cmFja2VkRmlsZSwgJ3RyYWNrZWQnKTtcblx0XHRjcC5leGVjRmlsZVN5bmMoJ2dpdCcsIFsnYWRkJywgJ3RyYWNrZWQudHh0J10sIHsgY3dkOiBkaXIsIGVudiwgc3RkaW86ICdwaXBlJyB9KTtcblx0XHRjcC5leGVjRmlsZVN5bmMoJ2dpdCcsIFsnY29tbWl0JywgJy1xJywgJy1tJywgJ2FkZCB0cmFja2VkJ10sIHsgY3dkOiBkaXIsIGVudiwgc3RkaW86ICdwaXBlJyB9KTtcblxuXHRcdGNvbnN0IG1hcmtlciA9IGpvaW4oZGlyLCAnLmdpdCcsICdzdGF0dXMtaW5kZXgtcmVmcmVzaGVkJyk7XG5cdFx0Y29uc3QgaG9vayA9IGpvaW4oZGlyLCAnLmdpdCcsICdob29rcycsICdwb3N0LWluZGV4LWNoYW5nZScpO1xuXHRcdGF3YWl0IGZzLndyaXRlRmlsZShob29rLCAnIyEvYmluL3NoXFxucHJpbnRmIHJlZnJlc2hlZCA+IC5naXQvc3RhdHVzLWluZGV4LXJlZnJlc2hlZFxcbicpO1xuXHRcdGF3YWl0IGZzLmNobW9kKGhvb2ssIDBvNzU1KTtcblx0XHRjb25zdCBmdXR1cmUgPSBuZXcgRGF0ZShEYXRlLm5vdygpICsgMTBfMDAwKTtcblx0XHRhd2FpdCBmcy51dGltZXModHJhY2tlZEZpbGUsIGZ1dHVyZSwgZnV0dXJlKTtcblxuXHRcdGNvbnN0IGhhc0NoYW5nZXMgPSBhd2FpdCBzdmMhLmhhc1VuY29tbWl0dGVkQ2hhbmdlcyhVUkkuZmlsZShkaXIpKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoeyBoYXNDaGFuZ2VzLCByZWZyZXNoZWRJbmRleDogZXhpc3RzU3luYyhtYXJrZXIpIH0sIHsgaGFzQ2hhbmdlczogZmFsc2UsIHJlZnJlc2hlZEluZGV4OiBmYWxzZSB9KTtcblx0fSk7XG5cblx0KGhhc0dpdCA/IHRlc3QgOiB0ZXN0LnNraXApKCdjb21taXRBbGwgc3RhZ2VzIHRyYWNrZWQsIHN0YWdlZCBhbmQgdW50cmFja2VkIGNoYW5nZXMgYW5kIGNyZWF0ZXMgYSBjb21taXQnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgZGlyID0gaW5pdFJlcG8oKTtcblx0XHRjb25zdCBmcyA9IGF3YWl0IGltcG9ydCgnZnMvcHJvbWlzZXMnKTtcblx0XHRhd2FpdCBmcy53cml0ZUZpbGUoam9pbihkaXIsICd0cmFja2VkLnR4dCcpLCAnYmVmb3JlJyk7XG5cdFx0Y3AuZXhlY0ZpbGVTeW5jKCdnaXQnLCBbJ2FkZCcsICd0cmFja2VkLnR4dCddLCB7IGN3ZDogZGlyLCBlbnYsIHN0ZGlvOiAncGlwZScgfSk7XG5cdFx0Y3AuZXhlY0ZpbGVTeW5jKCdnaXQnLCBbJ2NvbW1pdCcsICctcScsICctbScsICdhZGQgdHJhY2tlZCddLCB7IGN3ZDogZGlyLCBlbnYsIHN0ZGlvOiAncGlwZScgfSk7XG5cblx0XHRhd2FpdCBmcy53cml0ZUZpbGUoam9pbihkaXIsICd0cmFja2VkLnR4dCcpLCAnYWZ0ZXInKTtcblx0XHRhd2FpdCBmcy53cml0ZUZpbGUoam9pbihkaXIsICdzdGFnZWQudHh0JyksICdzdGFnZWQnKTtcblx0XHRjcC5leGVjRmlsZVN5bmMoJ2dpdCcsIFsnYWRkJywgJ3N0YWdlZC50eHQnXSwgeyBjd2Q6IGRpciwgZW52LCBzdGRpbzogJ3BpcGUnIH0pO1xuXHRcdGF3YWl0IGZzLndyaXRlRmlsZShqb2luKGRpciwgJ3VudHJhY2tlZC50eHQnKSwgJ3VudHJhY2tlZCcpO1xuXG5cdFx0YXdhaXQgc3ZjIS5jb21taXRBbGwoVVJJLmZpbGUoZGlyKSwgJ2NvbW1pdCBhbGwgY2hhbmdlcycpO1xuXG5cdFx0Y29uc3Qgc3RhdHVzID0gY3AuZXhlY0ZpbGVTeW5jKCdnaXQnLCBbJ3N0YXR1cycsICctLXBvcmNlbGFpbiddLCB7IGN3ZDogZGlyLCBlbnYsIGVuY29kaW5nOiAndXRmOCcgfSkudHJpbSgpO1xuXHRcdGNvbnN0IGxhc3RNZXNzYWdlID0gY3AuZXhlY0ZpbGVTeW5jKCdnaXQnLCBbJ2xvZycsICctMScsICctLWZvcm1hdD0lcyddLCB7IGN3ZDogZGlyLCBlbnYsIGVuY29kaW5nOiAndXRmOCcgfSkudHJpbSgpO1xuXHRcdGNvbnN0IGNvbW1pdHRlZEZpbGVzID0gY3AuZXhlY0ZpbGVTeW5jKCdnaXQnLCBbJ2RpZmYtdHJlZScsICctLW5vLWNvbW1pdC1pZCcsICctLW5hbWUtb25seScsICctcicsICdIRUFEJ10sIHsgY3dkOiBkaXIsIGVudiwgZW5jb2Rpbmc6ICd1dGY4JyB9KS50cmltKCkuc3BsaXQoL1xccj9cXG4vZykuc29ydCgpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7IHN0YXR1cywgbGFzdE1lc3NhZ2UsIGNvbW1pdHRlZEZpbGVzIH0sIHtcblx0XHRcdHN0YXR1czogJycsXG5cdFx0XHRsYXN0TWVzc2FnZTogJ2NvbW1pdCBhbGwgY2hhbmdlcycsXG5cdFx0XHRjb21taXR0ZWRGaWxlczogWydzdGFnZWQudHh0JywgJ3RyYWNrZWQudHh0JywgJ3VudHJhY2tlZC50eHQnXSxcblx0XHR9KTtcblx0fSk7XG5cblx0KGhhc0dpdCA/IHRlc3QgOiB0ZXN0LnNraXApKCdtZXJnZUJyYW5jaCBtZXJnZXMgaW50byB0aGUgY3VycmVudCBicmFuY2gnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgZGlyID0gaW5pdFJlcG8oKTtcblx0XHRjb25zdCBmcyA9IGF3YWl0IGltcG9ydCgnZnMvcHJvbWlzZXMnKTtcblx0XHRjcC5leGVjRmlsZVN5bmMoJ2dpdCcsIFsnY2hlY2tvdXQnLCAnLXEnLCAnLWInLCAnYWdlbnRzL3Nlc3Npb24nXSwgeyBjd2Q6IGRpciwgZW52LCBzdGRpbzogJ3BpcGUnIH0pO1xuXHRcdGF3YWl0IGZzLndyaXRlRmlsZShqb2luKGRpciwgJ3Nlc3Npb24udHh0JyksICdzZXNzaW9uIGNoYW5nZXMnKTtcblx0XHRjcC5leGVjRmlsZVN5bmMoJ2dpdCcsIFsnYWRkJywgJ3Nlc3Npb24udHh0J10sIHsgY3dkOiBkaXIsIGVudiwgc3RkaW86ICdwaXBlJyB9KTtcblx0XHRjcC5leGVjRmlsZVN5bmMoJ2dpdCcsIFsnY29tbWl0JywgJy1xJywgJy1tJywgJ3Nlc3Npb24gY2hhbmdlcyddLCB7IGN3ZDogZGlyLCBlbnYsIHN0ZGlvOiAncGlwZScgfSk7XG5cdFx0Y3AuZXhlY0ZpbGVTeW5jKCdnaXQnLCBbJ2NoZWNrb3V0JywgJy1xJywgJ21haW4nXSwgeyBjd2Q6IGRpciwgZW52LCBzdGRpbzogJ3BpcGUnIH0pO1xuXG5cdFx0YXdhaXQgc3ZjIS5tZXJnZUJyYW5jaChVUkkuZmlsZShkaXIpLCAnYWdlbnRzL3Nlc3Npb24nKTtcblxuXHRcdGNvbnN0IHN0YXR1cyA9IGNwLmV4ZWNGaWxlU3luYygnZ2l0JywgWydzdGF0dXMnLCAnLS1wb3JjZWxhaW4nXSwgeyBjd2Q6IGRpciwgZW52LCBlbmNvZGluZzogJ3V0ZjgnIH0pLnRyaW0oKTtcblx0XHRjb25zdCBoZWFkID0gY3AuZXhlY0ZpbGVTeW5jKCdnaXQnLCBbJ3Jldi1wYXJzZScsICdIRUFEJ10sIHsgY3dkOiBkaXIsIGVudiwgZW5jb2Rpbmc6ICd1dGY4JyB9KS50cmltKCk7XG5cdFx0Y29uc3Qgc291cmNlID0gY3AuZXhlY0ZpbGVTeW5jKCdnaXQnLCBbJ3Jldi1wYXJzZScsICdhZ2VudHMvc2Vzc2lvbiddLCB7IGN3ZDogZGlyLCBlbnYsIGVuY29kaW5nOiAndXRmOCcgfSkudHJpbSgpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoeyBzdGF0dXMsIGhlYWRNYXRjaGVzU291cmNlOiBoZWFkID09PSBzb3VyY2UgfSwgeyBzdGF0dXM6ICcnLCBoZWFkTWF0Y2hlc1NvdXJjZTogdHJ1ZSB9KTtcblx0fSk7XG5cblx0KGhhc0dpdCA/IHRlc3QgOiB0ZXN0LnNraXApKCdtZXJnZUJyYW5jaCBhYm9ydHMgYSBjb25mbGljdGVkIG1lcmdlJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IGRpciA9IGluaXRSZXBvKCk7XG5cdFx0Y29uc3QgZnMgPSBhd2FpdCBpbXBvcnQoJ2ZzL3Byb21pc2VzJyk7XG5cdFx0YXdhaXQgZnMud3JpdGVGaWxlKGpvaW4oZGlyLCAnc2hhcmVkLnR4dCcpLCAnYmFzZScpO1xuXHRcdGNwLmV4ZWNGaWxlU3luYygnZ2l0JywgWydhZGQnLCAnc2hhcmVkLnR4dCddLCB7IGN3ZDogZGlyLCBlbnYsIHN0ZGlvOiAncGlwZScgfSk7XG5cdFx0Y3AuZXhlY0ZpbGVTeW5jKCdnaXQnLCBbJ2NvbW1pdCcsICctcScsICctbScsICdhZGQgc2hhcmVkJ10sIHsgY3dkOiBkaXIsIGVudiwgc3RkaW86ICdwaXBlJyB9KTtcblx0XHRjcC5leGVjRmlsZVN5bmMoJ2dpdCcsIFsnY2hlY2tvdXQnLCAnLXEnLCAnLWInLCAnYWdlbnRzL3Nlc3Npb24nXSwgeyBjd2Q6IGRpciwgZW52LCBzdGRpbzogJ3BpcGUnIH0pO1xuXHRcdGF3YWl0IGZzLndyaXRlRmlsZShqb2luKGRpciwgJ3NoYXJlZC50eHQnKSwgJ3Nlc3Npb24nKTtcblx0XHRjcC5leGVjRmlsZVN5bmMoJ2dpdCcsIFsnY29tbWl0JywgJy1xJywgJy1hbScsICdzZXNzaW9uIGNoYW5nZXMnXSwgeyBjd2Q6IGRpciwgZW52LCBzdGRpbzogJ3BpcGUnIH0pO1xuXHRcdGNwLmV4ZWNGaWxlU3luYygnZ2l0JywgWydjaGVja291dCcsICctcScsICdtYWluJ10sIHsgY3dkOiBkaXIsIGVudiwgc3RkaW86ICdwaXBlJyB9KTtcblx0XHRhd2FpdCBmcy53cml0ZUZpbGUoam9pbihkaXIsICdzaGFyZWQudHh0JyksICdtYWluJyk7XG5cdFx0Y3AuZXhlY0ZpbGVTeW5jKCdnaXQnLCBbJ2NvbW1pdCcsICctcScsICctYW0nLCAnbWFpbiBjaGFuZ2VzJ10sIHsgY3dkOiBkaXIsIGVudiwgc3RkaW86ICdwaXBlJyB9KTtcblxuXHRcdGxldCBtZXJnZUZhaWxlZCA9IGZhbHNlO1xuXHRcdHRyeSB7XG5cdFx0XHRhd2FpdCBzdmMhLm1lcmdlQnJhbmNoKFVSSS5maWxlKGRpciksICdhZ2VudHMvc2Vzc2lvbicpO1xuXHRcdH0gY2F0Y2gge1xuXHRcdFx0bWVyZ2VGYWlsZWQgPSB0cnVlO1xuXHRcdH1cblxuXHRcdGNvbnN0IHN0YXR1cyA9IGNwLmV4ZWNGaWxlU3luYygnZ2l0JywgWydzdGF0dXMnLCAnLS1wb3JjZWxhaW4nXSwgeyBjd2Q6IGRpciwgZW52LCBlbmNvZGluZzogJ3V0ZjgnIH0pLnRyaW0oKTtcblx0XHRjb25zdCBjb250ZW50cyA9IGF3YWl0IGZzLnJlYWRGaWxlKGpvaW4oZGlyLCAnc2hhcmVkLnR4dCcpLCAndXRmOCcpO1xuXHRcdGxldCBtZXJnZUhlYWRFeGlzdHMgPSB0cnVlO1xuXHRcdHRyeSB7XG5cdFx0XHRjcC5leGVjRmlsZVN5bmMoJ2dpdCcsIFsncmV2LXBhcnNlJywgJy0tdmVyaWZ5JywgJy0tcXVpZXQnLCAnTUVSR0VfSEVBRCddLCB7IGN3ZDogZGlyLCBlbnYsIHN0ZGlvOiAnaWdub3JlJyB9KTtcblx0XHR9IGNhdGNoIHtcblx0XHRcdG1lcmdlSGVhZEV4aXN0cyA9IGZhbHNlO1xuXHRcdH1cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHsgbWVyZ2VGYWlsZWQsIHN0YXR1cywgY29udGVudHMsIG1lcmdlSGVhZEV4aXN0cyB9LCB7XG5cdFx0XHRtZXJnZUZhaWxlZDogdHJ1ZSxcblx0XHRcdHN0YXR1czogJycsXG5cdFx0XHRjb250ZW50czogJ21haW4nLFxuXHRcdFx0bWVyZ2VIZWFkRXhpc3RzOiBmYWxzZSxcblx0XHR9KTtcblx0fSk7XG5cblx0KGhhc0dpdCA/IHRlc3QgOiB0ZXN0LnNraXApKCdtZXJnZUJyYW5jaCBwcmVzZXJ2ZXMgYSBwcmUtZXhpc3RpbmcgbWVyZ2UnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgZGlyID0gaW5pdFJlcG8oKTtcblx0XHRjb25zdCBmcyA9IGF3YWl0IGltcG9ydCgnZnMvcHJvbWlzZXMnKTtcblx0XHRhd2FpdCBmcy53cml0ZUZpbGUoam9pbihkaXIsICdzaGFyZWQudHh0JyksICdiYXNlJyk7XG5cdFx0Y3AuZXhlY0ZpbGVTeW5jKCdnaXQnLCBbJ2FkZCcsICdzaGFyZWQudHh0J10sIHsgY3dkOiBkaXIsIGVudiwgc3RkaW86ICdwaXBlJyB9KTtcblx0XHRjcC5leGVjRmlsZVN5bmMoJ2dpdCcsIFsnY29tbWl0JywgJy1xJywgJy1tJywgJ2FkZCBzaGFyZWQnXSwgeyBjd2Q6IGRpciwgZW52LCBzdGRpbzogJ3BpcGUnIH0pO1xuXHRcdGNwLmV4ZWNGaWxlU3luYygnZ2l0JywgWydjaGVja291dCcsICctcScsICctYicsICdhZ2VudHMvc2Vzc2lvbiddLCB7IGN3ZDogZGlyLCBlbnYsIHN0ZGlvOiAncGlwZScgfSk7XG5cdFx0YXdhaXQgZnMud3JpdGVGaWxlKGpvaW4oZGlyLCAnc2hhcmVkLnR4dCcpLCAnc2Vzc2lvbicpO1xuXHRcdGNwLmV4ZWNGaWxlU3luYygnZ2l0JywgWydjb21taXQnLCAnLXEnLCAnLWFtJywgJ3Nlc3Npb24gY2hhbmdlcyddLCB7IGN3ZDogZGlyLCBlbnYsIHN0ZGlvOiAncGlwZScgfSk7XG5cdFx0Y3AuZXhlY0ZpbGVTeW5jKCdnaXQnLCBbJ2NoZWNrb3V0JywgJy1xJywgJ21haW4nXSwgeyBjd2Q6IGRpciwgZW52LCBzdGRpbzogJ3BpcGUnIH0pO1xuXHRcdGF3YWl0IGZzLndyaXRlRmlsZShqb2luKGRpciwgJ3NoYXJlZC50eHQnKSwgJ21haW4nKTtcblx0XHRjcC5leGVjRmlsZVN5bmMoJ2dpdCcsIFsnY29tbWl0JywgJy1xJywgJy1hbScsICdtYWluIGNoYW5nZXMnXSwgeyBjd2Q6IGRpciwgZW52LCBzdGRpbzogJ3BpcGUnIH0pO1xuXHRcdHRyeSB7XG5cdFx0XHRjcC5leGVjRmlsZVN5bmMoJ2dpdCcsIFsnbWVyZ2UnLCAnLS1uby1lZGl0JywgJ2FnZW50cy9zZXNzaW9uJ10sIHsgY3dkOiBkaXIsIGVudiwgc3RkaW86ICdwaXBlJyB9KTtcblx0XHR9IGNhdGNoIHtcblx0XHRcdC8vIFRoZSBjb25mbGljdCBpcyB0aGUgcHJlLWV4aXN0aW5nIG1lcmdlIHN0YXRlIHVuZGVyIHRlc3QuXG5cdFx0fVxuXG5cdFx0bGV0IGVycm9yTWVzc2FnZTogc3RyaW5nIHwgdW5kZWZpbmVkO1xuXHRcdHRyeSB7XG5cdFx0XHRhd2FpdCBzdmMhLm1lcmdlQnJhbmNoKFVSSS5maWxlKGRpciksICdhZ2VudHMvc2Vzc2lvbicpO1xuXHRcdH0gY2F0Y2ggKGVycm9yKSB7XG5cdFx0XHRlcnJvck1lc3NhZ2UgPSBlcnJvciBpbnN0YW5jZW9mIEVycm9yID8gZXJyb3IubWVzc2FnZSA6IFN0cmluZyhlcnJvcik7XG5cdFx0fVxuXHRcdGxldCBtZXJnZUhlYWRFeGlzdHMgPSB0cnVlO1xuXHRcdHRyeSB7XG5cdFx0XHRjcC5leGVjRmlsZVN5bmMoJ2dpdCcsIFsncmV2LXBhcnNlJywgJy0tdmVyaWZ5JywgJy0tcXVpZXQnLCAnTUVSR0VfSEVBRCddLCB7IGN3ZDogZGlyLCBlbnYsIHN0ZGlvOiAnaWdub3JlJyB9KTtcblx0XHR9IGNhdGNoIHtcblx0XHRcdG1lcmdlSGVhZEV4aXN0cyA9IGZhbHNlO1xuXHRcdH0gZmluYWxseSB7XG5cdFx0XHRjcC5leGVjRmlsZVN5bmMoJ2dpdCcsIFsnbWVyZ2UnLCAnLS1hYm9ydCddLCB7IGN3ZDogZGlyLCBlbnYsIHN0ZGlvOiAncGlwZScgfSk7XG5cdFx0fVxuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRyZWplY3RlZEV4aXN0aW5nTWVyZ2U6IGVycm9yTWVzc2FnZT8uaW5jbHVkZXMoJ2Fub3RoZXIgbWVyZ2UgaXMgYWxyZWFkeSBpbiBwcm9ncmVzcycpID09PSB0cnVlLFxuXHRcdFx0bWVyZ2VIZWFkRXhpc3RzLFxuXHRcdH0sIHtcblx0XHRcdHJlamVjdGVkRXhpc3RpbmdNZXJnZTogdHJ1ZSxcblx0XHRcdG1lcmdlSGVhZEV4aXN0czogdHJ1ZSxcblx0XHR9KTtcblx0fSk7XG5cblx0KGhhc0dpdCA/IHRlc3QgOiB0ZXN0LnNraXApKCdhZGRFeGlzdGluZ1dvcmt0cmVlIGF0dGFjaGVzIGEgd29ya3RyZWUgZm9yIGFuIGV4aXN0aW5nIGJyYW5jaCAobm8gLWIpJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IGRpciA9IGluaXRSZXBvKCk7XG5cdFx0Y3AuZXhlY0ZpbGVTeW5jKCdnaXQnLCBbJ2JyYW5jaCcsICdmZWF0dXJlJ10sIHsgY3dkOiBkaXIsIGVudiwgc3RkaW86ICdwaXBlJyB9KTtcblx0XHRjb25zdCB3dFBhdGggPSBqb2luKGRpciwgJy4uJywgYHd0LSR7RGF0ZS5ub3coKX1gKTtcblx0XHR0cnkge1xuXHRcdFx0YXdhaXQgc3ZjIS5hZGRFeGlzdGluZ1dvcmt0cmVlKFVSSS5maWxlKGRpciksIFVSSS5maWxlKHd0UGF0aCksICdmZWF0dXJlJyk7XG5cdFx0XHRjb25zdCBmcyA9IGF3YWl0IGltcG9ydCgnZnMvcHJvbWlzZXMnKTtcblx0XHRcdGNvbnN0IHN0YXQgPSBhd2FpdCBmcy5zdGF0KHd0UGF0aCk7XG5cdFx0XHRhc3NlcnQub2soc3RhdC5pc0RpcmVjdG9yeSgpLCAnd29ya3RyZWUgZGlyZWN0b3J5IHNob3VsZCBleGlzdCcpO1xuXHRcdH0gZmluYWxseSB7XG5cdFx0XHRybURpcldpdGhSZXRyeSh3dFBhdGgpO1xuXHRcdH1cblx0fSk7XG5cblx0KGhhc0dpdCA/IHRlc3QgOiB0ZXN0LnNraXApKCdyZW1vdmVXb3JrdHJlZSBwcmVzZXJ2ZXMgZGlydHkgd29yayB1bmxlc3MgZm9yY2VkJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IGRpciA9IGluaXRSZXBvKCk7XG5cdFx0Y29uc3QgZnMgPSBhd2FpdCBpbXBvcnQoJ2ZzL3Byb21pc2VzJyk7XG5cdFx0Y29uc3Qgd3RQYXRoID0gam9pbihkaXIsICcuLicsIGB3dC1kaXJ0eS0ke0RhdGUubm93KCl9YCk7XG5cdFx0dHJ5IHtcblx0XHRcdGF3YWl0IHN2YyEuYWRkV29ya3RyZWUoVVJJLmZpbGUoZGlyKSwgVVJJLmZpbGUod3RQYXRoKSwgJ2FnZW50cy9kaXJ0eS13b3JrdHJlZScsICdtYWluJyk7XG5cdFx0XHRhd2FpdCBmcy53cml0ZUZpbGUoam9pbih3dFBhdGgsICd1bnRyYWNrZWQudHh0JyksICdrZWVwIG1lJyk7XG5cblx0XHRcdGxldCBzYWZlUmVtb3ZhbEZhaWxlZCA9IGZhbHNlO1xuXHRcdFx0dHJ5IHtcblx0XHRcdFx0YXdhaXQgc3ZjIS5yZW1vdmVXb3JrdHJlZShVUkkuZmlsZShkaXIpLCBVUkkuZmlsZSh3dFBhdGgpKTtcblx0XHRcdH0gY2F0Y2gge1xuXHRcdFx0XHRzYWZlUmVtb3ZhbEZhaWxlZCA9IHRydWU7XG5cdFx0XHR9XG5cdFx0XHRjb25zdCBleGlzdHNBZnRlclNhZmVSZW1vdmFsID0gZXhpc3RzU3luYyh3dFBhdGgpO1xuXG5cdFx0XHRhd2FpdCBzdmMhLnJlbW92ZVdvcmt0cmVlKFVSSS5maWxlKGRpciksIFVSSS5maWxlKHd0UGF0aCksIHsgZm9yY2U6IHRydWUgfSk7XG5cblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0XHRzYWZlUmVtb3ZhbEZhaWxlZCxcblx0XHRcdFx0ZXhpc3RzQWZ0ZXJTYWZlUmVtb3ZhbCxcblx0XHRcdFx0ZXhpc3RzQWZ0ZXJGb3JjZWRSZW1vdmFsOiBleGlzdHNTeW5jKHd0UGF0aCksXG5cdFx0XHR9LCB7XG5cdFx0XHRcdHNhZmVSZW1vdmFsRmFpbGVkOiB0cnVlLFxuXHRcdFx0XHRleGlzdHNBZnRlclNhZmVSZW1vdmFsOiB0cnVlLFxuXHRcdFx0XHRleGlzdHNBZnRlckZvcmNlZFJlbW92YWw6IGZhbHNlLFxuXHRcdFx0fSk7XG5cdFx0fSBmaW5hbGx5IHtcblx0XHRcdHRyeSB7IGF3YWl0IHN2YyEucmVtb3ZlV29ya3RyZWUoVVJJLmZpbGUoZGlyKSwgVVJJLmZpbGUod3RQYXRoKSwgeyBmb3JjZTogdHJ1ZSB9KTsgfSBjYXRjaCB7IC8qIGJlc3QtZWZmb3J0IGNsZWFudXAgKi8gfVxuXHRcdFx0cm1EaXJXaXRoUmV0cnkod3RQYXRoKTtcblx0XHRcdHRyeSB7IGNwLmV4ZWNGaWxlU3luYygnZ2l0JywgWydicmFuY2gnLCAnLUQnLCAnYWdlbnRzL2RpcnR5LXdvcmt0cmVlJ10sIHsgY3dkOiBkaXIsIGVudiwgc3RkaW86ICdpZ25vcmUnIH0pOyB9IGNhdGNoIHsgLyogYmVzdC1lZmZvcnQgY2xlYW51cCAqLyB9XG5cdFx0fVxuXHR9KTtcblxuXHQoaGFzR2l0ID8gdGVzdCA6IHRlc3Quc2tpcCkoJ3JlbW92ZVdvcmt0cmVlIHBydW5lcyBhIGxpbmdlcmluZyBhZG1pbiBlbnRyeSB3aGVuIHRoZSB3b3JraW5nIHRyZWUgaXMgYWxyZWFkeSBnb25lJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IGRpciA9IGluaXRSZXBvKCk7XG5cdFx0Y29uc3Qgc3VmZml4ID0gYHd0LXBydW5lLSR7RGF0ZS5ub3coKX1gO1xuXHRcdGNvbnN0IHd0UGF0aCA9IGpvaW4oZGlyLCAnLi4nLCBzdWZmaXgpO1xuXHRcdHRyeSB7XG5cdFx0XHRhd2FpdCBzdmMhLmFkZFdvcmt0cmVlKFVSSS5maWxlKGRpciksIFVSSS5maWxlKHd0UGF0aCksICdhZ2VudHMvcHJ1bmUtd29ya3RyZWUnLCAnbWFpbicpO1xuXHRcdFx0Ly8gUmVwcm9kdWNlIHRoZSBDSSB0ZWFyZG93biByYWNlOiB0aGUgd29ya2luZyB0cmVlIGRpcmVjdG9yeSBpcyBnb25lXG5cdFx0XHQvLyBidXQgZ2l0IHN0aWxsIGhvbGRzIHRoZSBgLmdpdC93b3JrdHJlZXMvPGlkPmAgYWRtaW4gZW50cnksIHNvIGEgcGxhaW5cblx0XHRcdC8vIGBnaXQgd29ya3RyZWUgcmVtb3ZlYCBmYWlscyBcdTIwMTQgcmVtb3ZlV29ya3RyZWUgbXVzdCBmYWxsIGJhY2sgdG8gcHJ1bmUuXG5cdFx0XHRybVN5bmMod3RQYXRoLCB7IHJlY3Vyc2l2ZTogdHJ1ZSwgZm9yY2U6IHRydWUgfSk7XG5cdFx0XHRjb25zdCBsaXN0ZWRCZWZvcmUgPSBjcC5leGVjRmlsZVN5bmMoJ2dpdCcsIFsnd29ya3RyZWUnLCAnbGlzdCcsICctLXBvcmNlbGFpbiddLCB7IGN3ZDogZGlyLCBlbnYsIGVuY29kaW5nOiAndXRmOCcgfSk7XG5cblx0XHRcdGF3YWl0IHN2YyEucmVtb3ZlV29ya3RyZWUoVVJJLmZpbGUoZGlyKSwgVVJJLmZpbGUod3RQYXRoKSwgeyBmb3JjZTogdHJ1ZSB9KTtcblxuXHRcdFx0Y29uc3QgbGlzdGVkQWZ0ZXIgPSBjcC5leGVjRmlsZVN5bmMoJ2dpdCcsIFsnd29ya3RyZWUnLCAnbGlzdCcsICctLXBvcmNlbGFpbiddLCB7IGN3ZDogZGlyLCBlbnYsIGVuY29kaW5nOiAndXRmOCcgfSk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdFx0cmVnaXN0ZXJlZEJlZm9yZTogbGlzdGVkQmVmb3JlLmluY2x1ZGVzKHN1ZmZpeCksXG5cdFx0XHRcdHJlZ2lzdGVyZWRBZnRlcjogbGlzdGVkQWZ0ZXIuaW5jbHVkZXMoc3VmZml4KSxcblx0XHRcdH0sIHtcblx0XHRcdFx0cmVnaXN0ZXJlZEJlZm9yZTogdHJ1ZSxcblx0XHRcdFx0cmVnaXN0ZXJlZEFmdGVyOiBmYWxzZSxcblx0XHRcdH0pO1xuXHRcdH0gZmluYWxseSB7XG5cdFx0XHR0cnkgeyBhd2FpdCBzdmMhLnJlbW92ZVdvcmt0cmVlKFVSSS5maWxlKGRpciksIFVSSS5maWxlKHd0UGF0aCksIHsgZm9yY2U6IHRydWUgfSk7IH0gY2F0Y2ggeyAvKiBiZXN0LWVmZm9ydCBjbGVhbnVwICovIH1cblx0XHRcdHJtRGlyV2l0aFJldHJ5KHd0UGF0aCk7XG5cdFx0XHR0cnkgeyBjcC5leGVjRmlsZVN5bmMoJ2dpdCcsIFsnYnJhbmNoJywgJy1EJywgJ2FnZW50cy9wcnVuZS13b3JrdHJlZSddLCB7IGN3ZDogZGlyLCBlbnYsIHN0ZGlvOiAnaWdub3JlJyB9KTsgfSBjYXRjaCB7IC8qIGJlc3QtZWZmb3J0IGNsZWFudXAgKi8gfVxuXHRcdH1cblx0fSk7XG5cblx0KGhhc0dpdCA/IHRlc3QgOiB0ZXN0LnNraXApKCdyZW1vdmVXb3JrdHJlZSByZWplY3RzIGluc3RlYWQgb2YgZmFsc2VseSBzdWNjZWVkaW5nIHdoZW4gdGhlIGFkbWluIGVudHJ5IGNhbm5vdCBiZSBkZWxldGVkJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IGRpciA9IGluaXRSZXBvKCk7XG5cdFx0Y29uc3Qgc3VmZml4ID0gYHd0LWxlYWstJHtEYXRlLm5vdygpfWA7XG5cdFx0Y29uc3Qgd3RQYXRoID0gam9pbihkaXIsICcuLicsIHN1ZmZpeCk7XG5cdFx0bGV0IHdvcmt0cmVlTG9ja2VkID0gZmFsc2U7XG5cdFx0dHJ5IHtcblx0XHRcdGF3YWl0IHN2YyEuYWRkV29ya3RyZWUoVVJJLmZpbGUoZGlyKSwgVVJJLmZpbGUod3RQYXRoKSwgJ2FnZW50cy9sZWFrLXdvcmt0cmVlJywgJ21haW4nKTtcblx0XHRcdGNwLmV4ZWNGaWxlU3luYygnZ2l0JywgWyd3b3JrdHJlZScsICdsb2NrJywgd3RQYXRoXSwgeyBjd2Q6IGRpciwgZW52LCBzdGRpbzogJ3BpcGUnIH0pO1xuXHRcdFx0d29ya3RyZWVMb2NrZWQgPSB0cnVlO1xuXHRcdFx0Ly8gQSBsb2NrZWQgbWlzc2luZyB3b3JrdHJlZSBtYWtlcyBwcnVuZSBleGl0IDAgd2hpbGUgcmV0YWluaW5nIHRoZSBhZG1pbiBlbnRyeSBvbiBldmVyeSBPUy5cblx0XHRcdHJtU3luYyh3dFBhdGgsIHsgcmVjdXJzaXZlOiB0cnVlLCBmb3JjZTogdHJ1ZSB9KTtcblxuXHRcdFx0YXdhaXQgYXNzZXJ0LnJlamVjdHMoXG5cdFx0XHRcdHN2YyEucmVtb3ZlV29ya3RyZWUoVVJJLmZpbGUoZGlyKSwgVVJJLmZpbGUod3RQYXRoKSwgeyBmb3JjZTogdHJ1ZSB9KSxcblx0XHRcdFx0J3JlbW92ZVdvcmt0cmVlIG11c3QgcmVqZWN0IHdoZW4gdGhlIHdvcmt0cmVlIHN0YXlzIHJlZ2lzdGVyZWQsIG5vdCByZXBvcnQgYSBmYWxzZSBzdWNjZXNzJyxcblx0XHRcdCk7XG5cblx0XHRcdGNvbnN0IGxpc3RlZCA9IGNwLmV4ZWNGaWxlU3luYygnZ2l0JywgWyd3b3JrdHJlZScsICdsaXN0JywgJy0tcG9yY2VsYWluJ10sIHsgY3dkOiBkaXIsIGVudiwgZW5jb2Rpbmc6ICd1dGY4JyB9KTtcblx0XHRcdGFzc2VydC5vayhsaXN0ZWQuaW5jbHVkZXMoc3VmZml4KSwgJ3RoZSBzdGlsbC1yZWdpc3RlcmVkIHdvcmt0cmVlIG11c3Qgc3VyZmFjZSBhcyBhIGxlYWssIG5vdCBiZSBtYXNrZWQnKTtcblx0XHR9IGZpbmFsbHkge1xuXHRcdFx0aWYgKHdvcmt0cmVlTG9ja2VkKSB7XG5cdFx0XHRcdHRyeSB7IGNwLmV4ZWNGaWxlU3luYygnZ2l0JywgWyd3b3JrdHJlZScsICd1bmxvY2snLCB3dFBhdGhdLCB7IGN3ZDogZGlyLCBlbnYsIHN0ZGlvOiAnaWdub3JlJyB9KTsgfSBjYXRjaCB7IC8qIGJlc3QtZWZmb3J0IGNsZWFudXAgKi8gfVxuXHRcdFx0fVxuXHRcdFx0dHJ5IHsgYXdhaXQgc3ZjIS5yZW1vdmVXb3JrdHJlZShVUkkuZmlsZShkaXIpLCBVUkkuZmlsZSh3dFBhdGgpLCB7IGZvcmNlOiB0cnVlIH0pOyB9IGNhdGNoIHsgLyogYmVzdC1lZmZvcnQgY2xlYW51cCAqLyB9XG5cdFx0XHRybURpcldpdGhSZXRyeSh3dFBhdGgpO1xuXHRcdFx0dHJ5IHsgY3AuZXhlY0ZpbGVTeW5jKCdnaXQnLCBbJ2JyYW5jaCcsICctRCcsICdhZ2VudHMvbGVhay13b3JrdHJlZSddLCB7IGN3ZDogZGlyLCBlbnYsIHN0ZGlvOiAnaWdub3JlJyB9KTsgfSBjYXRjaCB7IC8qIGJlc3QtZWZmb3J0IGNsZWFudXAgKi8gfVxuXHRcdH1cblx0fSk7XG5cblx0Ly8gUmVzaWR1YWwgY2FzZSBvZiAjMzI5OTgyOiBnaXQgY2FuIGRlLXJlZ2lzdGVyIGEgd29ya3RyZWUgKGRyb3AgaXRzXG5cdC8vIGAuZ2l0L3dvcmt0cmVlcy88aWQ+YCBhZG1pbiBlbnRyeSkgd2hpbGUgaXRzIGRpcmVjdG9yeSBzdGlsbCByZW1haW5zIG9uXG5cdC8vIGRpc2suIEEgbGF0ZXIgcmVtb3ZhbCBtdXN0IHN0aWxsIHN1Y2NlZWQgYmVjYXVzZSBnaXQgbm8gbG9uZ2VyIHRyYWNrcyB0aGUgcGF0aC5cblx0KGhhc0dpdCA/IHRlc3QgOiB0ZXN0LnNraXApKCdyZW1vdmVXb3JrdHJlZSBzdWNjZWVkcyB3aGVuIGdpdCBubyBsb25nZXIgdHJhY2tzIGEgc3RpbGwtcHJlc2VudCB3b3JrdHJlZSBkaXJlY3RvcnknLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgZGlyID0gaW5pdFJlcG8oKTtcblx0XHRjb25zdCBzdWZmaXggPSBgd3Qtb3JwaGFuLSR7RGF0ZS5ub3coKX1gO1xuXHRcdGNvbnN0IHd0UGF0aCA9IGpvaW4oZGlyLCAnLi4nLCBzdWZmaXgpO1xuXHRcdHRyeSB7XG5cdFx0XHRhd2FpdCBzdmMhLmFkZFdvcmt0cmVlKFVSSS5maWxlKGRpciksIFVSSS5maWxlKHd0UGF0aCksICdhZ2VudHMvb3JwaGFuLXdvcmt0cmVlJywgJ21haW4nKTtcblx0XHRcdC8vIERlLXJlZ2lzdGVyIHRoZSB3b3JrdHJlZSAoZGVsZXRlIGdpdCdzIGFkbWluIGVudHJpZXMpIHdoaWxlIGxlYXZpbmcgdGhlIHdvcmtpbmctdHJlZSBkaXJlY3RvcnkgaW4gcGxhY2UuXG5cdFx0XHRjb25zdCBhZG1pblJvb3QgPSBqb2luKGRpciwgJy5naXQnLCAnd29ya3RyZWVzJyk7XG5cdFx0XHRmb3IgKGNvbnN0IGVudHJ5IG9mIHJlYWRkaXJTeW5jKGFkbWluUm9vdCkpIHtcblx0XHRcdFx0cm1TeW5jKGpvaW4oYWRtaW5Sb290LCBlbnRyeSksIHsgcmVjdXJzaXZlOiB0cnVlLCBmb3JjZTogdHJ1ZSB9KTtcblx0XHRcdH1cblx0XHRcdC8vIFBpbiB0aGUgcHJlY29uZGl0aW9uIHNvIHRoZSB0ZXN0IGNhbm5vdCBzaWxlbnRseSByb3QgaW50byB0aGUgcHJ1bmUvdmVyaWZ5IHBhdGguXG5cdFx0XHRjb25zdCBsaXN0ZWQgPSBjcC5leGVjRmlsZVN5bmMoJ2dpdCcsIFsnd29ya3RyZWUnLCAnbGlzdCcsICctLXBvcmNlbGFpbiddLCB7IGN3ZDogZGlyLCBlbnYsIGVuY29kaW5nOiAndXRmOCcgfSk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdFx0ZGlyUHJlc2VudDogZXhpc3RzU3luYyh3dFBhdGgpLFxuXHRcdFx0XHRzdGlsbFJlZ2lzdGVyZWQ6IGxpc3RlZC5pbmNsdWRlcyhzdWZmaXgpLFxuXHRcdFx0fSwge1xuXHRcdFx0XHRkaXJQcmVzZW50OiB0cnVlLFxuXHRcdFx0XHRzdGlsbFJlZ2lzdGVyZWQ6IGZhbHNlLFxuXHRcdFx0fSk7XG5cblx0XHRcdC8vIFJlbW92YWwgbXVzdCB0cmVhdCBhbiBhbHJlYWR5LWRlLXJlZ2lzdGVyZWQgd29ya3RyZWUgYXMgc3VjY2Vzcy5cblx0XHRcdGF3YWl0IHN2YyEucmVtb3ZlV29ya3RyZWUoVVJJLmZpbGUoZGlyKSwgVVJJLmZpbGUod3RQYXRoKSwgeyBmb3JjZTogdHJ1ZSB9KTtcblx0XHR9IGZpbmFsbHkge1xuXHRcdFx0cm1EaXJXaXRoUmV0cnkod3RQYXRoKTtcblx0XHRcdHRyeSB7IGNwLmV4ZWNGaWxlU3luYygnZ2l0JywgWydicmFuY2gnLCAnLUQnLCAnYWdlbnRzL29ycGhhbi13b3JrdHJlZSddLCB7IGN3ZDogZGlyLCBlbnYsIHN0ZGlvOiAnaWdub3JlJyB9KTsgfSBjYXRjaCB7IC8qIGJlc3QtZWZmb3J0IGNsZWFudXAgKi8gfVxuXHRcdH1cblx0fSk7XG5cblx0Ly8gRmFpbC1jbG9zZWQgZ3VhcmQ6IHdoZW4gZ2l0IGNhbm5vdCBjb25maXJtIHRoZSB3b3JrdHJlZSBpcyB1bnJlZ2lzdGVyZWQgKGUuZy5cblx0Ly8gdGhlIHJlcG9zaXRvcnkgaXMgZ29uZSksIGEgZmFpbGVkIHJlbW92YWwgbXVzdCBwcm9wYWdhdGUgcmF0aGVyIHRoYW4gYmVcblx0Ly8gc2lsZW50bHkgcmVwb3J0ZWQgYXMgc3VjY2Vzcy5cblx0KGhhc0dpdCA/IHRlc3QgOiB0ZXN0LnNraXApKCdyZW1vdmVXb3JrdHJlZSByZXRocm93cyB3aGVuIGdpdCBjYW5ub3QgY29uZmlybSByZW1vdmFsJywgYXN5bmMgKCkgPT4ge1xuXHRcdHRtcFJvb3QgPSBta2R0ZW1wU3luYyhqb2luKHRtcGRpcigpLCAnYWdlbnQtaG9zdC1naXQtbm9ucmVwby0nKSk7XG5cdFx0Y29uc3Qgd3RQYXRoID0gam9pbih0bXBSb290LCAnd3QnKTtcblx0XHRta2RpclN5bmMod3RQYXRoKTsgLy8gZXhpc3RzIC0+IGRldGVybWluaXN0aWMgYGdpdCB3b3JrdHJlZSByZW1vdmVgIGJyYW5jaFxuXHRcdGF3YWl0IGFzc2VydC5yZWplY3RzKFxuXHRcdFx0c3ZjIS5yZW1vdmVXb3JrdHJlZShVUkkuZmlsZSh0bXBSb290KSwgVVJJLmZpbGUod3RQYXRoKSwgeyBmb3JjZTogdHJ1ZSB9KSxcblx0XHRcdC9leGl0ZWQgd2l0aCBjb2RlIDEyOC8sXG5cdFx0KTtcblx0fSk7XG5cblx0KGhhc0dpdCA/IHRlc3QgOiB0ZXN0LnNraXApKCdhZGRXb3JrdHJlZSBwcmVmZXJzIG9yaWdpbiBzdGFydCBwb2ludCB3aGVuIGxvY2FsIGJyYW5jaCBpcyBzdGFsZScsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBkaXIgPSBpbml0UmVwbygpO1xuXHRcdGNvbnN0IGZzID0gYXdhaXQgaW1wb3J0KCdmcy9wcm9taXNlcycpO1xuXHRcdGNwLmV4ZWNGaWxlU3luYygnZ2l0JywgWyd1cGRhdGUtcmVmJywgJ3JlZnMvcmVtb3Rlcy9vcmlnaW4vbWFpbicsICdIRUFEJ10sIHsgY3dkOiBkaXIsIGVudiwgc3RkaW86ICdwaXBlJyB9KTtcblx0XHRjcC5leGVjRmlsZVN5bmMoJ2dpdCcsIFsnY2hlY2tvdXQnLCAnLXEnLCAnLWInLCAndXBzdHJlYW0nLCAnbWFpbiddLCB7IGN3ZDogZGlyLCBlbnYsIHN0ZGlvOiAncGlwZScgfSk7XG5cdFx0YXdhaXQgZnMud3JpdGVGaWxlKGpvaW4oZGlyLCAndXBzdHJlYW0udHh0JyksICd1cHN0cmVhbScpO1xuXHRcdGNwLmV4ZWNGaWxlU3luYygnZ2l0JywgWydhZGQnLCAnLiddLCB7IGN3ZDogZGlyLCBlbnYsIHN0ZGlvOiAncGlwZScgfSk7XG5cdFx0Y3AuZXhlY0ZpbGVTeW5jKCdnaXQnLCBbJ2NvbW1pdCcsICctcScsICctbScsICd1cHN0cmVhbSddLCB7IGN3ZDogZGlyLCBlbnYsIHN0ZGlvOiAncGlwZScgfSk7XG5cdFx0Y3AuZXhlY0ZpbGVTeW5jKCdnaXQnLCBbJ3VwZGF0ZS1yZWYnLCAncmVmcy9yZW1vdGVzL29yaWdpbi9tYWluJywgJ0hFQUQnXSwgeyBjd2Q6IGRpciwgZW52LCBzdGRpbzogJ3BpcGUnIH0pO1xuXHRcdGNwLmV4ZWNGaWxlU3luYygnZ2l0JywgWydjaGVja291dCcsICctcScsICdtYWluJ10sIHsgY3dkOiBkaXIsIGVudiwgc3RkaW86ICdwaXBlJyB9KTtcblxuXHRcdGNvbnN0IHd0UGF0aCA9IGpvaW4oZGlyLCAnLi4nLCBgd3QtJHtEYXRlLm5vdygpfWApO1xuXHRcdHRyeSB7XG5cdFx0XHRhd2FpdCBzdmMhLmFkZFdvcmt0cmVlKFVSSS5maWxlKGRpciksIFVSSS5maWxlKHd0UGF0aCksICdhZ2VudHMvdGVzdC1vcmlnaW4tc3RhcnQtcG9pbnQnLCAnbWFpbicpO1xuXHRcdFx0Y29uc3Qgc3RhdCA9IGF3YWl0IGZzLnN0YXQoam9pbih3dFBhdGgsICd1cHN0cmVhbS50eHQnKSk7XG5cdFx0XHRhc3NlcnQub2soc3RhdC5pc0ZpbGUoKSwgJ3dvcmt0cmVlIHNob3VsZCBzdGFydCBmcm9tIG9yaWdpbi9tYWluLCBub3Qgc3RhbGUgbG9jYWwgbWFpbicpO1xuXHRcdFx0YXNzZXJ0LnRocm93cygoKSA9PiBjcC5leGVjRmlsZVN5bmMoJ2dpdCcsIFsncmV2LXBhcnNlJywgJy0tYWJicmV2LXJlZicsICctLXN5bWJvbGljLWZ1bGwtbmFtZScsICdAe3V9J10sIHsgY3dkOiB3dFBhdGgsIGVudiwgc3RkaW86ICdwaXBlJyB9KSwgL2ZhdGFsOi8pO1xuXHRcdH0gZmluYWxseSB7XG5cdFx0XHR0cnkgeyBhd2FpdCBzdmMhLnJlbW92ZVdvcmt0cmVlKFVSSS5maWxlKGRpciksIFVSSS5maWxlKHd0UGF0aCksIHsgZm9yY2U6IHRydWUgfSk7IH0gY2F0Y2ggeyAvKiBiZXN0LWVmZm9ydCBjbGVhbnVwICovIH1cblx0XHRcdHJtRGlyV2l0aFJldHJ5KHd0UGF0aCk7XG5cdFx0XHR0cnkgeyBjcC5leGVjRmlsZVN5bmMoJ2dpdCcsIFsnYnJhbmNoJywgJy1EJywgJ2FnZW50cy90ZXN0LW9yaWdpbi1zdGFydC1wb2ludCddLCB7IGN3ZDogZGlyLCBlbnYsIHN0ZGlvOiAnaWdub3JlJyB9KTsgfSBjYXRjaCB7IC8qIGJlc3QtZWZmb3J0IGNsZWFudXAgKi8gfVxuXHRcdH1cblx0fSk7XG5cblx0KGhhc0dpdCA/IHRlc3QgOiB0ZXN0LnNraXApKCdjb3B5V29ya3RyZWVJbmNsdWRlRmlsZXMgY29waWVzIG1hdGNoZWQgZ2l0LWlnbm9yZWQgZmlsZXMsIGNvbGxhcHNpbmcgd2hvbGx5LWlnbm9yZWQgZm9sZGVycycsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBkaXIgPSBpbml0UmVwbygpO1xuXHRcdGNvbnN0IGZzID0gYXdhaXQgaW1wb3J0KCdmcy9wcm9taXNlcycpO1xuXG5cdFx0YXdhaXQgZnMud3JpdGVGaWxlKGpvaW4oZGlyLCAnLmdpdGlnbm9yZScpLCAnLmVudlxcbnNlY3JldHMvXFxuYnVpbGQvXFxucGFydGlhbC9cXG4qLmxvY2FsXFxuJyk7XG5cblx0XHQvLyBNYXRjaGVkIHJvb3QgZmlsZS5cblx0XHRhd2FpdCBmcy53cml0ZUZpbGUoam9pbihkaXIsICcuZW52JyksICdTRUNSRVQ9MScpO1xuXHRcdC8vIFdob2xseS1pZ25vcmVkIGRpciwgZnVsbHkgbWF0Y2hlZCBieSBgc2VjcmV0cy8qKmAgLT4gY29sbGFwc2VkIHRvIG9uZSByZWN1cnNpdmUgY29weS5cblx0XHRhd2FpdCBmcy5ta2Rpcihqb2luKGRpciwgJ3NlY3JldHMnLCAnbmVzdGVkJyksIHsgcmVjdXJzaXZlOiB0cnVlIH0pO1xuXHRcdGF3YWl0IGZzLndyaXRlRmlsZShqb2luKGRpciwgJ3NlY3JldHMnLCAna2V5LnR4dCcpLCAna2V5Jyk7XG5cdFx0YXdhaXQgZnMud3JpdGVGaWxlKGpvaW4oZGlyLCAnc2VjcmV0cycsICduZXN0ZWQnLCAnZGVlcC50eHQnKSwgJ2RlZXAnKTtcblx0XHQvLyBXaG9sbHktaWdub3JlZCBkaXIgdGhhdCBubyBnbG9iIG1hdGNoZXMgLT4gbXVzdCBiZSBza2lwcGVkIGVudGlyZWx5LlxuXHRcdGF3YWl0IGZzLm1rZGlyKGpvaW4oZGlyLCAnYnVpbGQnKSwgeyByZWN1cnNpdmU6IHRydWUgfSk7XG5cdFx0YXdhaXQgZnMud3JpdGVGaWxlKGpvaW4oZGlyLCAnYnVpbGQnLCAnb3V0cHV0LnR4dCcpLCAnYXJ0aWZhY3QnKTtcblx0XHQvLyBXaG9sbHktaWdub3JlZCBkaXIgb25seSBwYXJ0aWFsbHkgbWF0Y2hlZCBieSBgcGFydGlhbC8qLnR4dGAgLT4gbXVzdCBOT1Rcblx0XHQvLyBjb2xsYXBzZTsgb25seSB0aGUgbWF0Y2hlZCBmaWxlIGlzIGNvcGllZCwgaXRzIHNpYmxpbmcgaXMgbGVmdCBiZWhpbmQuXG5cdFx0YXdhaXQgZnMubWtkaXIoam9pbihkaXIsICdwYXJ0aWFsJyksIHsgcmVjdXJzaXZlOiB0cnVlIH0pO1xuXHRcdGF3YWl0IGZzLndyaXRlRmlsZShqb2luKGRpciwgJ3BhcnRpYWwnLCAna2VlcC50eHQnKSwgJ2tlZXAnKTtcblx0XHRhd2FpdCBmcy53cml0ZUZpbGUoam9pbihkaXIsICdwYXJ0aWFsJywgJ3NraXAuYmluJyksICdza2lwJyk7XG5cdFx0Ly8gUGFydGlhbGx5LXRyYWNrZWQgZGlyOiBhbiBpZ25vcmVkIGZpbGUgaXMgbWF0Y2hlZCBieSBgYXBwLyoqYCwgYnV0IHRoZVxuXHRcdC8vIHRyYWNrZWQgc2libGluZyBtdXN0IG5ldmVyIGJlIGNvcGllZC9jbG9iYmVyZWQgZXZlbiB0aG91Z2ggaXQgdG9vIGlzXG5cdFx0Ly8gdW5kZXIgYGFwcC9gIChpdCBpcyBub3QgYSBnaXQtaWdub3JlZCBmaWxlLCBzbyBpdCBpcyBub3QgYSBjYW5kaWRhdGUpLlxuXHRcdGF3YWl0IGZzLm1rZGlyKGpvaW4oZGlyLCAnYXBwJyksIHsgcmVjdXJzaXZlOiB0cnVlIH0pO1xuXHRcdGF3YWl0IGZzLndyaXRlRmlsZShqb2luKGRpciwgJ2FwcCcsICdtYWluLnRzJyksICdjb21taXR0ZWQnKTtcblx0XHRhd2FpdCBmcy53cml0ZUZpbGUoam9pbihkaXIsICdhcHAnLCAnY29uZmlnLmxvY2FsJyksICdsb2NhbCcpO1xuXHRcdGNwLmV4ZWNGaWxlU3luYygnZ2l0JywgWydhZGQnLCAnYXBwL21haW4udHMnXSwgeyBjd2Q6IGRpciwgZW52LCBzdGRpbzogJ3BpcGUnIH0pO1xuXHRcdGNwLmV4ZWNGaWxlU3luYygnZ2l0JywgWydjb21taXQnLCAnLXEnLCAnLW0nLCAnYWRkIHRyYWNrZWQnXSwgeyBjd2Q6IGRpciwgZW52LCBzdGRpbzogJ3BpcGUnIH0pO1xuXHRcdC8vIFVuY29tbWl0dGVkIGNoYW5nZSB0byB0aGUgdHJhY2tlZCBmaWxlOiBpZiB0aGUgZm9sZGVyIHdlcmUgd3JvbmdseVxuXHRcdC8vIGNvbGxhcHNlZC9jb3BpZWQsIHRoZSB3b3JrdHJlZSBjaGVja291dCB3b3VsZCBiZSBvdmVyd3JpdHRlbiB3aXRoIHRoaXMuXG5cdFx0YXdhaXQgZnMud3JpdGVGaWxlKGpvaW4oZGlyLCAnYXBwJywgJ21haW4udHMnKSwgJ01PRElGSUVEJyk7XG5cblx0XHRjb25zdCB3dFBhdGggPSBqb2luKGRpciwgJy4uJywgYHd0LSR7RGF0ZS5ub3coKX1gKTtcblx0XHR0cnkge1xuXHRcdFx0YXdhaXQgc3ZjIS5hZGRXb3JrdHJlZShVUkkuZmlsZShkaXIpLCBVUkkuZmlsZSh3dFBhdGgpLCAnYWdlbnRzL2luY2x1ZGUtZmlsZXMnLCAnbWFpbicpO1xuXHRcdFx0Y29uc3QgcHJvZ3Jlc3M6IHsgZmlsZXNEb25lOiBudW1iZXI7IGZpbGVzVG90YWw6IG51bWJlciB9W10gPSBbXTtcblx0XHRcdGF3YWl0IHN2YyEuY29weVdvcmt0cmVlSW5jbHVkZUZpbGVzKFVSSS5maWxlKGRpciksIFVSSS5maWxlKHd0UGF0aCksIFsnLmVudicsICdzZWNyZXRzLyoqJywgJ3BhcnRpYWwvKi50eHQnLCAnYXBwLyoqJ10sIHNhbXBsZSA9PiBwcm9ncmVzcy5wdXNoKHNhbXBsZSkpO1xuXG5cdFx0XHRjb25zdCByZWFkID0gYXN5bmMgKHJlbGF0aXZlUGF0aDogc3RyaW5nKSA9PiB7XG5cdFx0XHRcdHRyeSB7IHJldHVybiBhd2FpdCBmcy5yZWFkRmlsZShqb2luKHd0UGF0aCwgcmVsYXRpdmVQYXRoKSwgJ3V0ZjgnKTsgfSBjYXRjaCB7IHJldHVybiB1bmRlZmluZWQ7IH1cblx0XHRcdH07XG5cblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0XHRlbnY6IGF3YWl0IHJlYWQoJy5lbnYnKSxcblx0XHRcdFx0c2VjcmV0S2V5OiBhd2FpdCByZWFkKGpvaW4oJ3NlY3JldHMnLCAna2V5LnR4dCcpKSxcblx0XHRcdFx0c2VjcmV0RGVlcDogYXdhaXQgcmVhZChqb2luKCdzZWNyZXRzJywgJ25lc3RlZCcsICdkZWVwLnR4dCcpKSxcblx0XHRcdFx0YnVpbGRBcnRpZmFjdDogYXdhaXQgcmVhZChqb2luKCdidWlsZCcsICdvdXRwdXQudHh0JykpLFxuXHRcdFx0XHRwYXJ0aWFsS2VlcDogYXdhaXQgcmVhZChqb2luKCdwYXJ0aWFsJywgJ2tlZXAudHh0JykpLFxuXHRcdFx0XHRwYXJ0aWFsU2tpcDogYXdhaXQgcmVhZChqb2luKCdwYXJ0aWFsJywgJ3NraXAuYmluJykpLFxuXHRcdFx0XHRhcHBDb25maWc6IGF3YWl0IHJlYWQoam9pbignYXBwJywgJ2NvbmZpZy5sb2NhbCcpKSxcblx0XHRcdFx0YXBwVHJhY2tlZDogYXdhaXQgcmVhZChqb2luKCdhcHAnLCAnbWFpbi50cycpKSxcblx0XHRcdFx0Ly8gT25lIHNhbXBsZSBwZXIgY29waWVkIGVudHJ5IChgc2VjcmV0cy9gIGNvbGxhcHNlZCwgcGx1cyB0aHJlZVxuXHRcdFx0XHQvLyBzdGFuZGFsb25lIGZpbGVzKSwgYnV0IGNvdW50ZWQgaW4gdGhlIDUgZmlsZXMgdGhleSBjb3ZlciBzb1xuXHRcdFx0XHQvLyB0aGUgY29sbGFwc2VkIGRpcmVjdG9yeSBpc24ndCB1bmRlci13ZWlnaHRlZC4gQ29tcGxldGlvbiBvcmRlclxuXHRcdFx0XHQvLyBpcyBub25kZXRlcm1pbmlzdGljLCBzbyBvbmx5IHRoZSB0b3RhbHMgYXJlIGFzc2VydGVkLlxuXHRcdFx0XHRwcm9ncmVzc1NhbXBsZXM6IHByb2dyZXNzLmxlbmd0aCxcblx0XHRcdFx0cHJvZ3Jlc3NUb3RhbHM6IFsuLi5uZXcgU2V0KHByb2dyZXNzLm1hcChzYW1wbGUgPT4gc2FtcGxlLmZpbGVzVG90YWwpKV0sXG5cdFx0XHRcdHByb2dyZXNzRG9uZTogcHJvZ3Jlc3MuYXQoLTEpPy5maWxlc0RvbmUsXG5cdFx0XHR9LCB7XG5cdFx0XHRcdGVudjogJ1NFQ1JFVD0xJyxcblx0XHRcdFx0c2VjcmV0S2V5OiAna2V5Jyxcblx0XHRcdFx0c2VjcmV0RGVlcDogJ2RlZXAnLFxuXHRcdFx0XHRidWlsZEFydGlmYWN0OiB1bmRlZmluZWQsXG5cdFx0XHRcdHBhcnRpYWxLZWVwOiAna2VlcCcsXG5cdFx0XHRcdHBhcnRpYWxTa2lwOiB1bmRlZmluZWQsXG5cdFx0XHRcdGFwcENvbmZpZzogJ2xvY2FsJyxcblx0XHRcdFx0YXBwVHJhY2tlZDogJ2NvbW1pdHRlZCcsXG5cdFx0XHRcdHByb2dyZXNzU2FtcGxlczogNCxcblx0XHRcdFx0cHJvZ3Jlc3NUb3RhbHM6IFs1XSxcblx0XHRcdFx0cHJvZ3Jlc3NEb25lOiA1LFxuXHRcdFx0fSk7XG5cdFx0fSBmaW5hbGx5IHtcblx0XHRcdHRyeSB7IGF3YWl0IHN2YyEucmVtb3ZlV29ya3RyZWUoVVJJLmZpbGUoZGlyKSwgVVJJLmZpbGUod3RQYXRoKSwgeyBmb3JjZTogdHJ1ZSB9KTsgfSBjYXRjaCB7IC8qIGJlc3QtZWZmb3J0IGNsZWFudXAgKi8gfVxuXHRcdFx0cm1EaXJXaXRoUmV0cnkod3RQYXRoKTtcblx0XHRcdHRyeSB7IGNwLmV4ZWNGaWxlU3luYygnZ2l0JywgWydicmFuY2gnLCAnLUQnLCAnYWdlbnRzL2luY2x1ZGUtZmlsZXMnXSwgeyBjd2Q6IGRpciwgZW52LCBzdGRpbzogJ2lnbm9yZScgfSk7IH0gY2F0Y2ggeyAvKiBiZXN0LWVmZm9ydCBjbGVhbnVwICovIH1cblx0XHR9XG5cdH0pO1xufSk7XG5cbnN1aXRlKCdBZ2VudEhvc3RHaXRTZXJ2aWNlIC0gcmVzdG9yZSAocmVhbCBnaXQpJywgKCkgPT4ge1xuXHRjb25zdCBkaXNwb3NhYmxlcyA9IGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSgpO1xuXG5cdGNvbnN0IGhhc0dpdCA9ICgoKSA9PiB7XG5cdFx0dHJ5IHsgY3AuZXhlY0ZpbGVTeW5jKCdnaXQnLCBbJy0tdmVyc2lvbiddLCB7IHN0ZGlvOiAnaWdub3JlJyB9KTsgcmV0dXJuIHRydWU7IH0gY2F0Y2ggeyByZXR1cm4gZmFsc2U7IH1cblx0fSkoKTtcblxuXHRsZXQgdG1wUm9vdDogc3RyaW5nIHwgdW5kZWZpbmVkO1xuXHRsZXQgc3ZjOiBBZ2VudEhvc3RHaXRTZXJ2aWNlIHwgdW5kZWZpbmVkO1xuXHRjb25zdCBlbnYgPSB7IC4uLnByb2Nlc3MuZW52LCBHSVRfQVVUSE9SX05BTUU6ICd0JywgR0lUX0FVVEhPUl9FTUFJTDogJ3RAdCcsIEdJVF9DT01NSVRURVJfTkFNRTogJ3QnLCBHSVRfQ09NTUlUVEVSX0VNQUlMOiAndEB0JyB9O1xuXG5cdHNldHVwKCgpID0+IHtcblx0XHR0bXBSb290ID0gdW5kZWZpbmVkO1xuXHRcdHN2YyA9IGNyZWF0ZUdpdFNlcnZpY2UoZGlzcG9zYWJsZXMpO1xuXHR9KTtcblxuXHR0ZWFyZG93bigoKSA9PiB7XG5cdFx0cm1EaXJXaXRoUmV0cnkodG1wUm9vdCk7XG5cdH0pO1xuXG5cdGFzeW5jIGZ1bmN0aW9uIGluaXRSZXBvV2l0aEZpbGVzKGZpbGVzOiBSZWNvcmQ8c3RyaW5nLCBzdHJpbmc+KTogUHJvbWlzZTxzdHJpbmc+IHtcblx0XHR0bXBSb290ID0gbWtkdGVtcFN5bmMoam9pbih0bXBkaXIoKSwgJ2FnZW50LWhvc3QtZ2l0LXJlc3RvcmUtJykpO1xuXHRcdGNvbnN0IGZzID0gYXdhaXQgaW1wb3J0KCdmcy9wcm9taXNlcycpO1xuXHRcdGNvbnN0IHJ1biA9ICguLi5hcmdzOiBzdHJpbmdbXSkgPT4gY3AuZXhlY0ZpbGVTeW5jKCdnaXQnLCBhcmdzLCB7IGN3ZDogdG1wUm9vdCEsIGVudiwgc3RkaW86ICdwaXBlJyB9KTtcblx0XHRydW4oJ2luaXQnLCAnLXEnLCAnLWInLCAnbWFpbicpO1xuXHRcdGZvciAoY29uc3QgW25hbWUsIGNvbnRlbnRdIG9mIE9iamVjdC5lbnRyaWVzKGZpbGVzKSkge1xuXHRcdFx0YXdhaXQgZnMud3JpdGVGaWxlKGpvaW4odG1wUm9vdCEsIG5hbWUpLCBjb250ZW50KTtcblx0XHR9XG5cdFx0cnVuKCdhZGQnLCAnLicpO1xuXHRcdHJ1bignY29tbWl0JywgJy1xJywgJy1tJywgJ2luaXQnKTtcblx0XHRyZXR1cm4gdG1wUm9vdCE7XG5cdH1cblxuXHQoaGFzR2l0ID8gdGVzdCA6IHRlc3Quc2tpcCkoJ3JldmVydHMgYSBtb2RpZmllZCB3b3JraW5nLXRyZWUgZmlsZSB0byB0aGUgY29tbWl0dGVkIGNvbnRlbnQnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgZnMgPSBhd2FpdCBpbXBvcnQoJ2ZzL3Byb21pc2VzJyk7XG5cdFx0Y29uc3QgZGlyID0gYXdhaXQgaW5pdFJlcG9XaXRoRmlsZXMoeyAnYS50eHQnOiAnb3JpZ2luYWwnIH0pO1xuXHRcdGF3YWl0IGZzLndyaXRlRmlsZShqb2luKGRpciwgJ2EudHh0JyksICdjaGFuZ2VkJyk7XG5cblx0XHRhd2FpdCBzdmMhLnJlc3RvcmUoVVJJLmZpbGUoZGlyKSwgWydhLnR4dCddKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChhd2FpdCBmcy5yZWFkRmlsZShqb2luKGRpciwgJ2EudHh0JyksICd1dGY4JyksICdvcmlnaW5hbCcpO1xuXHR9KTtcblxuXHQoaGFzR2l0ID8gdGVzdCA6IHRlc3Quc2tpcCkoJ3dpdGggYHN0YWdlZDogdHJ1ZWAgdW4tc3RhZ2VzIGEgZmlsZSB3aXRob3V0IHRvdWNoaW5nIHRoZSB3b3JraW5nIHRyZWUnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgZnMgPSBhd2FpdCBpbXBvcnQoJ2ZzL3Byb21pc2VzJyk7XG5cdFx0Y29uc3QgZGlyID0gYXdhaXQgaW5pdFJlcG9XaXRoRmlsZXMoeyAnYS50eHQnOiAnb3JpZ2luYWwnIH0pO1xuXHRcdGF3YWl0IGZzLndyaXRlRmlsZShqb2luKGRpciwgJ2EudHh0JyksICdjaGFuZ2VkJyk7XG5cdFx0Y3AuZXhlY0ZpbGVTeW5jKCdnaXQnLCBbJ2FkZCcsICdhLnR4dCddLCB7IGN3ZDogZGlyLCBlbnYsIHN0ZGlvOiAncGlwZScgfSk7XG5cblx0XHRhd2FpdCBzdmMhLnJlc3RvcmUoVVJJLmZpbGUoZGlyKSwgWydhLnR4dCddLCB7IHN0YWdlZDogdHJ1ZSB9KTtcblxuXHRcdGNvbnN0IHN0YWdlZERpZmYgPSBjcC5leGVjRmlsZVN5bmMoJ2dpdCcsIFsnZGlmZicsICctLWNhY2hlZCcsICctLW5hbWUtb25seSddLCB7IGN3ZDogZGlyLCBlbnYsIGVuY29kaW5nOiAndXRmOCcgfSkudHJpbSgpO1xuXHRcdGNvbnN0IHdvcmtpbmdUcmVlID0gYXdhaXQgZnMucmVhZEZpbGUoam9pbihkaXIsICdhLnR4dCcpLCAndXRmOCcpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoeyBzdGFnZWREaWZmLCB3b3JraW5nVHJlZSB9LCB7IHN0YWdlZERpZmY6ICcnLCB3b3JraW5nVHJlZTogJ2NoYW5nZWQnIH0pO1xuXHR9KTtcblxuXHQoaGFzR2l0ID8gdGVzdCA6IHRlc3Quc2tpcCkoJ3dpdGggYHJlZmAgcmVzdG9yZXMgY29udGVudCBmcm9tIGEgc3BlY2lmaWMgY29tbWl0JywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IGZzID0gYXdhaXQgaW1wb3J0KCdmcy9wcm9taXNlcycpO1xuXHRcdGNvbnN0IGRpciA9IGF3YWl0IGluaXRSZXBvV2l0aEZpbGVzKHsgJ2EudHh0JzogJ3YxJyB9KTtcblx0XHRjb25zdCB2MVNoYSA9IGNwLmV4ZWNGaWxlU3luYygnZ2l0JywgWydyZXYtcGFyc2UnLCAnSEVBRCddLCB7IGN3ZDogZGlyLCBlbnYsIGVuY29kaW5nOiAndXRmOCcgfSkudHJpbSgpO1xuXHRcdGF3YWl0IGZzLndyaXRlRmlsZShqb2luKGRpciwgJ2EudHh0JyksICd2MicpO1xuXHRcdGNwLmV4ZWNGaWxlU3luYygnZ2l0JywgWydjb21taXQnLCAnLXEnLCAnLWFtJywgJ3YyJ10sIHsgY3dkOiBkaXIsIGVudiwgc3RkaW86ICdwaXBlJyB9KTtcblxuXHRcdGF3YWl0IHN2YyEucmVzdG9yZShVUkkuZmlsZShkaXIpLCBbJ2EudHh0J10sIHsgcmVmOiB2MVNoYSB9KTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChhd2FpdCBmcy5yZWFkRmlsZShqb2luKGRpciwgJ2EudHh0JyksICd1dGY4JyksICd2MScpO1xuXHR9KTtcblxuXHQoaGFzR2l0ID8gdGVzdCA6IHRlc3Quc2tpcCkoJ3dpdGggbm8gcGF0aHMgcmVzdG9yZXMgZXZlcnkgbW9kaWZpZWQgZmlsZSBpbiB0aGUgd29ya2luZyB0cmVlJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IGZzID0gYXdhaXQgaW1wb3J0KCdmcy9wcm9taXNlcycpO1xuXHRcdGNvbnN0IGRpciA9IGF3YWl0IGluaXRSZXBvV2l0aEZpbGVzKHsgJ2EudHh0JzogJ29uZScsICdiLnR4dCc6ICd0d28nIH0pO1xuXHRcdGF3YWl0IGZzLndyaXRlRmlsZShqb2luKGRpciwgJ2EudHh0JyksICdtdXRhdGVkLWEnKTtcblx0XHRhd2FpdCBmcy53cml0ZUZpbGUoam9pbihkaXIsICdiLnR4dCcpLCAnbXV0YXRlZC1iJyk7XG5cblx0XHRhd2FpdCBzdmMhLnJlc3RvcmUoVVJJLmZpbGUoZGlyKSwgW10pO1xuXG5cdFx0Y29uc3QgW2EsIGJdID0gYXdhaXQgUHJvbWlzZS5hbGwoW1xuXHRcdFx0ZnMucmVhZEZpbGUoam9pbihkaXIsICdhLnR4dCcpLCAndXRmOCcpLFxuXHRcdFx0ZnMucmVhZEZpbGUoam9pbihkaXIsICdiLnR4dCcpLCAndXRmOCcpLFxuXHRcdF0pO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoeyBhLCBiIH0sIHsgYTogJ29uZScsIGI6ICd0d28nIH0pO1xuXHR9KTtcblxuXHQoaGFzR2l0ID8gdGVzdCA6IHRlc3Quc2tpcCkoJ3JlamVjdHMgd2hlbiBydW4gYWdhaW5zdCBhIG5vbi1naXQgZGlyZWN0b3J5JywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IGRpciA9IG1rZHRlbXBTeW5jKGpvaW4odG1wZGlyKCksICdhZ2VudC1ob3N0LW5vbmdpdC1yZXN0b3JlLScpKTtcblx0XHR0bXBSb290ID0gZGlyO1xuXHRcdGF3YWl0IGFzc2VydC5yZWplY3RzKCgpID0+IHN2YyEucmVzdG9yZShVUkkuZmlsZShkaXIpLCBbJ2EudHh0J10pKTtcblx0fSk7XG59KTtcblxuc3VpdGUoJ0FnZW50SG9zdEdpdFNlcnZpY2UgLSBvdmVybGF5UGF0aEludG9UcmVlIChyZWFsIGdpdCknLCAoKSA9PiB7XG5cdGNvbnN0IGRpc3Bvc2FibGVzID0gZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlKCk7XG5cblx0Y29uc3QgaGFzR2l0ID0gKCgpID0+IHtcblx0XHR0cnkgeyBjcC5leGVjRmlsZVN5bmMoJ2dpdCcsIFsnLS12ZXJzaW9uJ10sIHsgc3RkaW86ICdpZ25vcmUnIH0pOyByZXR1cm4gdHJ1ZTsgfSBjYXRjaCB7IHJldHVybiBmYWxzZTsgfVxuXHR9KSgpO1xuXG5cdGxldCB0bXBSb290OiBzdHJpbmcgfCB1bmRlZmluZWQ7XG5cdGxldCBzdmM6IEFnZW50SG9zdEdpdFNlcnZpY2UgfCB1bmRlZmluZWQ7XG5cdGNvbnN0IGVudiA9IHsgLi4ucHJvY2Vzcy5lbnYsIEdJVF9BVVRIT1JfTkFNRTogJ3QnLCBHSVRfQVVUSE9SX0VNQUlMOiAndEB0JywgR0lUX0NPTU1JVFRFUl9OQU1FOiAndCcsIEdJVF9DT01NSVRURVJfRU1BSUw6ICd0QHQnIH07XG5cblx0c2V0dXAoKCkgPT4ge1xuXHRcdHRtcFJvb3QgPSB1bmRlZmluZWQ7XG5cdFx0c3ZjID0gY3JlYXRlR2l0U2VydmljZShkaXNwb3NhYmxlcyk7XG5cdH0pO1xuXG5cdHRlYXJkb3duKCgpID0+IHtcblx0XHRybURpcldpdGhSZXRyeSh0bXBSb290KTtcblx0fSk7XG5cblx0YXN5bmMgZnVuY3Rpb24gaW5pdFJlcG9XaXRoRmlsZXMoZmlsZXM6IFJlY29yZDxzdHJpbmcsIHN0cmluZz4pOiBQcm9taXNlPHsgZGlyOiBzdHJpbmc7IHJ1bjogKC4uLmFyZ3M6IHN0cmluZ1tdKSA9PiBCdWZmZXIgfT4ge1xuXHRcdHRtcFJvb3QgPSBta2R0ZW1wU3luYyhqb2luKHRtcGRpcigpLCAnYWdlbnQtaG9zdC1naXQtb3ZlcmxheS0nKSk7XG5cdFx0Y29uc3QgZnMgPSBhd2FpdCBpbXBvcnQoJ2ZzL3Byb21pc2VzJyk7XG5cdFx0Y29uc3QgcnVuID0gKC4uLmFyZ3M6IHN0cmluZ1tdKSA9PiBjcC5leGVjRmlsZVN5bmMoJ2dpdCcsIGFyZ3MsIHsgY3dkOiB0bXBSb290ISwgZW52LCBzdGRpbzogJ3BpcGUnIH0pO1xuXHRcdHJ1bignaW5pdCcsICctcScsICctYicsICdtYWluJyk7XG5cdFx0Zm9yIChjb25zdCBbbmFtZSwgY29udGVudF0gb2YgT2JqZWN0LmVudHJpZXMoZmlsZXMpKSB7XG5cdFx0XHRhd2FpdCBmcy53cml0ZUZpbGUoam9pbih0bXBSb290ISwgbmFtZSksIGNvbnRlbnQpO1xuXHRcdH1cblx0XHRydW4oJ2FkZCcsICcuJyk7XG5cdFx0cnVuKCdjb21taXQnLCAnLXEnLCAnLW0nLCAnaW5pdCcpO1xuXHRcdHJldHVybiB7IGRpcjogdG1wUm9vdCEsIHJ1biB9O1xuXHR9XG5cblx0Y29uc3QgaGVhZFRyZWUgPSAoZGlyOiBzdHJpbmcpID0+IGNwLmV4ZWNGaWxlU3luYygnZ2l0JywgWydyZXYtcGFyc2UnLCAnSEVBRF57dHJlZX0nXSwgeyBjd2Q6IGRpciwgZW52LCBlbmNvZGluZzogJ3V0ZjgnIH0pLnRyaW0oKTtcblx0Y29uc3QgbHNUcmVlID0gKGRpcjogc3RyaW5nLCB0cmVlOiBzdHJpbmcpID0+IGNwLmV4ZWNGaWxlU3luYygnZ2l0JywgWydscy10cmVlJywgJy1yJywgJy0tbmFtZS1vbmx5JywgdHJlZV0sIHsgY3dkOiBkaXIsIGVudiwgZW5jb2Rpbmc6ICd1dGY4JyB9KS50cmltKCkuc3BsaXQoJ1xcbicpLmZpbHRlcihCb29sZWFuKTtcblx0Y29uc3QgYmxvYkF0ID0gKGRpcjogc3RyaW5nLCB0cmVlOiBzdHJpbmcsIHBhdGg6IHN0cmluZykgPT4gY3AuZXhlY0ZpbGVTeW5jKCdnaXQnLCBbJ2NhdC1maWxlJywgJ2Jsb2InLCBgJHt0cmVlfToke3BhdGh9YF0sIHsgY3dkOiBkaXIsIGVudiwgZW5jb2Rpbmc6ICd1dGY4JyB9KTtcblxuXHQoaGFzR2l0ID8gdGVzdCA6IHRlc3Quc2tpcCkoJ292ZXJsYXlzIGEgbW9kaWZpZWQgcGF0aCBmcm9tIHRoZSBzb3VyY2UgdHJlZSwgbGVhdmluZyBvdGhlciBwYXRocyB1bnRvdWNoZWQnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgZnMgPSBhd2FpdCBpbXBvcnQoJ2ZzL3Byb21pc2VzJyk7XG5cdFx0Y29uc3QgeyBkaXIgfSA9IGF3YWl0IGluaXRSZXBvV2l0aEZpbGVzKHsgJ2EudHh0JzogJ2EtdjFcXG4nLCAnYi50eHQnOiAnYi12MVxcbicgfSk7XG5cdFx0Y29uc3QgYmFzZSA9IGhlYWRUcmVlKGRpcik7XG5cblx0XHQvLyBXb3JraW5nIHRyZWUgbW9kaWZpZXMgYS50eHQgb25seTsgY2FwdHVyZSBpdCBhcyB0aGUgc291cmNlIHRyZWUuXG5cdFx0YXdhaXQgZnMud3JpdGVGaWxlKGpvaW4oZGlyLCAnYS50eHQnKSwgJ2EtdjJcXG4nKTtcblx0XHRjb25zdCBzb3VyY2UgPSBhd2FpdCBzdmMhLmNhcHR1cmVXb3JraW5nVHJlZUFzVHJlZShVUkkuZmlsZShkaXIpKTtcblx0XHRhc3NlcnQub2soc291cmNlLCAnZXhwZWN0ZWQgYSB3b3JraW5nLXRyZWUgc25hcHNob3QnKTtcblxuXHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IHN2YyEub3ZlcmxheVBhdGhJbnRvVHJlZShVUkkuZmlsZShkaXIpLCBiYXNlLCAnYS50eHQnLCBzb3VyY2UhKTtcblx0XHRhc3NlcnQub2socmVzdWx0LCAnZXhwZWN0ZWQgYSByZXN1bHQgdHJlZScpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChcblx0XHRcdHtcblx0XHRcdFx0ZmlsZXM6IGxzVHJlZShkaXIsIHJlc3VsdCEpLFxuXHRcdFx0XHRhQ29udGVudDogYmxvYkF0KGRpciwgcmVzdWx0ISwgJ2EudHh0JyksXG5cdFx0XHRcdGJDb250ZW50OiBibG9iQXQoZGlyLCByZXN1bHQhLCAnYi50eHQnKSxcblx0XHRcdH0sXG5cdFx0XHR7XG5cdFx0XHRcdGZpbGVzOiBbJ2EudHh0JywgJ2IudHh0J10sXG5cdFx0XHRcdGFDb250ZW50OiAnYS12MlxcbicsIC8vIG92ZXJsYWlkIGZyb20gdGhlIHNvdXJjZSB0cmVlXG5cdFx0XHRcdGJDb250ZW50OiAnYi12MVxcbicsIC8vIGNvcGllZCB2ZXJiYXRpbSBmcm9tIHRoZSBiYXNlIHRyZWVcblx0XHRcdH0pO1xuXHR9KTtcblxuXHQoaGFzR2l0ID8gdGVzdCA6IHRlc3Quc2tpcCkoJ292ZXJsYXlzIGFuIGFkZGVkIHBhdGggZnJvbSB0aGUgc291cmNlIHRyZWUnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgZnMgPSBhd2FpdCBpbXBvcnQoJ2ZzL3Byb21pc2VzJyk7XG5cdFx0Y29uc3QgeyBkaXIgfSA9IGF3YWl0IGluaXRSZXBvV2l0aEZpbGVzKHsgJ2EudHh0JzogJ2EtdjFcXG4nIH0pO1xuXHRcdGNvbnN0IGJhc2UgPSBoZWFkVHJlZShkaXIpO1xuXG5cdFx0Ly8gV29ya2luZyB0cmVlIGFkZHMgYW4gdW50cmFja2VkIGZpbGU7IGNhcHR1cmUgaXQgYXMgdGhlIHNvdXJjZSB0cmVlLlxuXHRcdGF3YWl0IGZzLndyaXRlRmlsZShqb2luKGRpciwgJ2ZyZXNoLnR4dCcpLCAnZnJlc2hcXG4nKTtcblx0XHRjb25zdCBzb3VyY2UgPSBhd2FpdCBzdmMhLmNhcHR1cmVXb3JraW5nVHJlZUFzVHJlZShVUkkuZmlsZShkaXIpKTtcblx0XHRhc3NlcnQub2soc291cmNlLCAnZXhwZWN0ZWQgYSB3b3JraW5nLXRyZWUgc25hcHNob3QnKTtcblxuXHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IHN2YyEub3ZlcmxheVBhdGhJbnRvVHJlZShVUkkuZmlsZShkaXIpLCBiYXNlLCAnZnJlc2gudHh0Jywgc291cmNlISk7XG5cdFx0YXNzZXJ0Lm9rKHJlc3VsdCwgJ2V4cGVjdGVkIGEgcmVzdWx0IHRyZWUnKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoXG5cdFx0XHR7IGZpbGVzOiBsc1RyZWUoZGlyLCByZXN1bHQhKSwgZnJlc2hDb250ZW50OiBibG9iQXQoZGlyLCByZXN1bHQhLCAnZnJlc2gudHh0JykgfSxcblx0XHRcdHsgZmlsZXM6IFsnYS50eHQnLCAnZnJlc2gudHh0J10sIGZyZXNoQ29udGVudDogJ2ZyZXNoXFxuJyB9KTtcblx0fSk7XG5cblx0KGhhc0dpdCA/IHRlc3QgOiB0ZXN0LnNraXApKCdyZW1vdmVzIGEgcGF0aCBhYnNlbnQgZnJvbSB0aGUgc291cmNlIHRyZWUnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgZnMgPSBhd2FpdCBpbXBvcnQoJ2ZzL3Byb21pc2VzJyk7XG5cdFx0Y29uc3QgeyBkaXIgfSA9IGF3YWl0IGluaXRSZXBvV2l0aEZpbGVzKHsgJ2EudHh0JzogJ2EtdjFcXG4nLCAnYi50eHQnOiAnYi12MVxcbicgfSk7XG5cblx0XHQvLyBCYXNlID0gd29ya2luZyB0cmVlIHRoYXQgaW5jbHVkZXMgYW4gdW50cmFja2VkIGZpbGU7IHNvdXJjZSA9IEhFQUQgdHJlZVxuXHRcdC8vICh3aGljaCBsYWNrcyBpdCkuIE92ZXJsYXlpbmcgdGhhdCBwYXRoIHJlbW92ZXMgaXQgZnJvbSB0aGUgYmFzZS5cblx0XHRhd2FpdCBmcy53cml0ZUZpbGUoam9pbihkaXIsICdmcmVzaC50eHQnKSwgJ2ZyZXNoXFxuJyk7XG5cdFx0Y29uc3QgYmFzZSA9IGF3YWl0IHN2YyEuY2FwdHVyZVdvcmtpbmdUcmVlQXNUcmVlKFVSSS5maWxlKGRpcikpO1xuXHRcdGFzc2VydC5vayhiYXNlLCAnZXhwZWN0ZWQgYSB3b3JraW5nLXRyZWUgc25hcHNob3QnKTtcblx0XHRjb25zdCBzb3VyY2UgPSBoZWFkVHJlZShkaXIpO1xuXG5cdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgc3ZjIS5vdmVybGF5UGF0aEludG9UcmVlKFVSSS5maWxlKGRpciksIGJhc2UhLCAnZnJlc2gudHh0Jywgc291cmNlKTtcblx0XHRhc3NlcnQub2socmVzdWx0LCAnZXhwZWN0ZWQgYSByZXN1bHQgdHJlZScpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChsc1RyZWUoZGlyLCByZXN1bHQhKSwgWydhLnR4dCcsICdiLnR4dCddKTtcblx0fSk7XG5cblx0KGhhc0dpdCA/IHRlc3QgOiB0ZXN0LnNraXApKCdyZXR1cm5zIHVuZGVmaW5lZCBmb3IgYSBub24tZ2l0IGRpcmVjdG9yeScsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBkaXIgPSBta2R0ZW1wU3luYyhqb2luKHRtcGRpcigpLCAnYWdlbnQtaG9zdC1ub25naXQtb3ZlcmxheS0nKSk7XG5cdFx0dG1wUm9vdCA9IGRpcjtcblx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCBzdmMhLm92ZXJsYXlQYXRoSW50b1RyZWUoVVJJLmZpbGUoZGlyKSwgJ0hFQUQnLCAnYS50eHQnLCAnSEVBRCcpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQsIHVuZGVmaW5lZCk7XG5cdH0pO1xufSk7XG5cbnN1aXRlKCdBZ2VudEhvc3RHaXRTZXJ2aWNlIC0gcmVzb2x2ZUJyYW5jaEJhc2VsaW5lQ29tbWl0IChyZWFsIGdpdCknLCAoKSA9PiB7XG5cdGNvbnN0IGRpc3Bvc2FibGVzID0gZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlKCk7XG5cblx0Y29uc3QgaGFzR2l0ID0gKCgpID0+IHtcblx0XHR0cnkgeyBjcC5leGVjRmlsZVN5bmMoJ2dpdCcsIFsnLS12ZXJzaW9uJ10sIHsgc3RkaW86ICdpZ25vcmUnIH0pOyByZXR1cm4gdHJ1ZTsgfSBjYXRjaCB7IHJldHVybiBmYWxzZTsgfVxuXHR9KSgpO1xuXG5cdGxldCB0bXBSb290OiBzdHJpbmcgfCB1bmRlZmluZWQ7XG5cdGxldCBzdmM6IEFnZW50SG9zdEdpdFNlcnZpY2UgfCB1bmRlZmluZWQ7XG5cdGNvbnN0IGVudiA9IHsgLi4ucHJvY2Vzcy5lbnYsIEdJVF9BVVRIT1JfTkFNRTogJ3QnLCBHSVRfQVVUSE9SX0VNQUlMOiAndEB0JywgR0lUX0NPTU1JVFRFUl9OQU1FOiAndCcsIEdJVF9DT01NSVRURVJfRU1BSUw6ICd0QHQnIH07XG5cblx0c2V0dXAoKCkgPT4ge1xuXHRcdHRtcFJvb3QgPSB1bmRlZmluZWQ7XG5cdFx0c3ZjID0gY3JlYXRlR2l0U2VydmljZShkaXNwb3NhYmxlcyk7XG5cdH0pO1xuXG5cdHRlYXJkb3duKCgpID0+IHtcblx0XHRybURpcldpdGhSZXRyeSh0bXBSb290KTtcblx0fSk7XG5cblx0ZnVuY3Rpb24gaW5pdFJlcG8oKTogKC4uLmFyZ3M6IHN0cmluZ1tdKSA9PiBCdWZmZXIge1xuXHRcdHRtcFJvb3QgPSBta2R0ZW1wU3luYyhqb2luKHRtcGRpcigpLCAnYWdlbnQtaG9zdC1naXQtYmFzZWxpbmUtJykpO1xuXHRcdGNvbnN0IHJ1biA9ICguLi5hcmdzOiBzdHJpbmdbXSkgPT4gY3AuZXhlY0ZpbGVTeW5jKCdnaXQnLCBhcmdzLCB7IGN3ZDogdG1wUm9vdCEsIGVudiwgc3RkaW86ICdwaXBlJyB9KTtcblx0XHRydW4oJ2luaXQnLCAnLXEnLCAnLWInLCAnbWFpbicpO1xuXHRcdHJldHVybiBydW47XG5cdH1cblxuXHQoaGFzR2l0ID8gdGVzdCA6IHRlc3Quc2tpcCkoJ3JldHVybnMgdGhlIG1lcmdlLWJhc2Ugb2YgSEVBRCBhbmQgdGhlIGJhc2UgYnJhbmNoJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IGZzID0gYXdhaXQgaW1wb3J0KCdmcy9wcm9taXNlcycpO1xuXHRcdGNvbnN0IHJ1biA9IGluaXRSZXBvKCk7XG5cdFx0YXdhaXQgZnMud3JpdGVGaWxlKGpvaW4odG1wUm9vdCEsICdhLnR4dCcpLCAnYmFzZVxcbicpO1xuXHRcdHJ1bignYWRkJywgJy4nKTtcblx0XHRydW4oJ2NvbW1pdCcsICctcScsICctbScsICdiYXNlJyk7XG5cdFx0Y29uc3QgYmFzZUNvbW1pdCA9IHJ1bigncmV2LXBhcnNlJywgJ0hFQUQnKS50b1N0cmluZygpLnRyaW0oKTtcblxuXHRcdC8vIERpdmVyZ2Ugb250byBhIGZlYXR1cmUgYnJhbmNoIHdpdGggYW4gZXh0cmEgY29tbWl0LlxuXHRcdHJ1bignY2hlY2tvdXQnLCAnLXEnLCAnLWInLCAnZmVhdHVyZScpO1xuXHRcdGF3YWl0IGZzLndyaXRlRmlsZShqb2luKHRtcFJvb3QhLCAnYS50eHQnKSwgJ2ZlYXR1cmVcXG4nKTtcblx0XHRydW4oJ2NvbW1pdCcsICctcScsICctYW0nLCAnZmVhdHVyZScpO1xuXG5cdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgc3ZjIS5yZXNvbHZlQnJhbmNoQmFzZWxpbmVDb21taXQoVVJJLmZpbGUodG1wUm9vdCEpLCAnbWFpbicpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQsIGJhc2VDb21taXQpO1xuXHR9KTtcblxuXHQoaGFzR2l0ID8gdGVzdCA6IHRlc3Quc2tpcCkoJ2ZhbGxzIGJhY2sgdG8gSEVBRCB3aGVuIG5vIGJhc2UgYnJhbmNoIGlzIGdpdmVuJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IGZzID0gYXdhaXQgaW1wb3J0KCdmcy9wcm9taXNlcycpO1xuXHRcdGNvbnN0IHJ1biA9IGluaXRSZXBvKCk7XG5cdFx0YXdhaXQgZnMud3JpdGVGaWxlKGpvaW4odG1wUm9vdCEsICdhLnR4dCcpLCAnYmFzZVxcbicpO1xuXHRcdHJ1bignYWRkJywgJy4nKTtcblx0XHRydW4oJ2NvbW1pdCcsICctcScsICctbScsICdiYXNlJyk7XG5cdFx0Y29uc3QgaGVhZENvbW1pdCA9IHJ1bigncmV2LXBhcnNlJywgJ0hFQUQnKS50b1N0cmluZygpLnRyaW0oKTtcblxuXHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IHN2YyEucmVzb2x2ZUJyYW5jaEJhc2VsaW5lQ29tbWl0KFVSSS5maWxlKHRtcFJvb3QhKSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdCwgaGVhZENvbW1pdCk7XG5cdH0pO1xuXG5cdChoYXNHaXQgPyB0ZXN0IDogdGVzdC5za2lwKSgnZmFsbHMgYmFjayB0byB0aGUgZW1wdHkgdHJlZSBmb3IgYSByZXBvIHdpdGggbm8gY29tbWl0cycsIGFzeW5jICgpID0+IHtcblx0XHRpbml0UmVwbygpO1xuXHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IHN2YyEucmVzb2x2ZUJyYW5jaEJhc2VsaW5lQ29tbWl0KFVSSS5maWxlKHRtcFJvb3QhKSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdCwgJzRiODI1ZGM2NDJjYjZlYjlhMDYwZTU0YmY4ZDY5Mjg4ZmJlZTQ5MDQnKTtcblx0fSk7XG5cblx0KGhhc0dpdCA/IHRlc3QgOiB0ZXN0LnNraXApKCdyZXR1cm5zIHVuZGVmaW5lZCBmb3IgYSBub24tZ2l0IGRpcmVjdG9yeScsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBkaXIgPSBta2R0ZW1wU3luYyhqb2luKHRtcGRpcigpLCAnYWdlbnQtaG9zdC1ub25naXQtYmFzZWxpbmUtJykpO1xuXHRcdHRtcFJvb3QgPSBkaXI7XG5cdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgc3ZjIS5yZXNvbHZlQnJhbmNoQmFzZWxpbmVDb21taXQoVVJJLmZpbGUoZGlyKSwgJ21haW4nKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0LCB1bmRlZmluZWQpO1xuXHR9KTtcbn0pO1xuIl0sCiAgIm1hcHBpbmdzIjogIkFBZUEsT0FBTyxZQUFZO0FBQ25CLFlBQVksUUFBUTtBQUNwQixTQUFTLFlBQVksV0FBVyxhQUFhLGFBQWEsY0FBYztBQUN4RSxTQUFTLGNBQWM7QUFDdkIsU0FBUyxzQkFBc0I7QUFDL0IsU0FBUyxZQUFZO0FBQ3JCLFNBQVMsV0FBVztBQUNwQixTQUFTLGlCQUFpQjtBQUMxQixTQUFTLCtDQUErQztBQUV4RCxTQUFTLG1CQUFtQjtBQUM1QixTQUFTLGVBQWU7QUFDeEIsU0FBUyw4QkFBOEI7QUFFdkMsU0FBUywyQkFBMkI7QUFFcEMsU0FBUyxpQkFBaUIsYUFBZ0U7QUFDekYsUUFBTSxhQUFhLElBQUksZUFBZTtBQUN0QyxRQUFNLGNBQWMsWUFBWSxJQUFJLElBQUksWUFBWSxVQUFVLENBQUM7QUFDL0QsY0FBWSxJQUFJLFlBQVksaUJBQWlCLFFBQVEsTUFBTSxZQUFZLElBQUksSUFBSSx1QkFBdUIsVUFBVSxDQUFDLENB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
