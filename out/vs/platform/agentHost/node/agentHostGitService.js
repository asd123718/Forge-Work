var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __decorateClass = (decorators, target, key, kind) => {
  var result = kind > 1 ? void 0 : kind ? __getOwnPropDesc(target, key) : target;
  for (var i = decorators.length - 1, decorator; i >= 0; i--)
    if (decorator = decorators[i])
      result = (kind ? decorator(target, key, result) : decorator(result)) || result;
  if (kind && result) __defProp(target, key, result);
  return result;
};
var __decorateParam = (index, decorator) => (target, key) => decorator(target, key, index);
import * as cp from "child_process";
import * as fsPromises from "fs/promises";
import { cp as copyFile } from "@vscode/fs-copyfile";
import * as path from "../../../base/common/path.js";
import { extUriBiasedIgnorePathCase } from "../../../base/common/resources.js";
import { URI } from "../../../base/common/uri.js";
import { VSBuffer } from "../../../base/common/buffer.js";
import { parse } from "../../../base/common/glob.js";
import { generateUuid } from "../../../base/common/uuid.js";
import { INativeEnvironmentService } from "../../environment/common/environment.js";
import { IFileService } from "../../files/common/files.js";
import { ILogService } from "../../log/common/log.js";
import { FileEditKind } from "../common/state/sessionState.js";
import { buildGitBlobUri } from "./gitDiffContent.js";
import { EMPTY_TREE_OBJECT, GitRefType } from "../common/agentHostGitService.js";
import { LRUCache } from "../../../base/common/map.js";
import { firstParallel, Limiter, SequencerByKey, timeout } from "../../../base/common/async.js";
const WORKTREE_REMOVAL_MAX_ATTEMPTS = 5;
const WORKTREE_REMOVAL_RETRY_BASE_DELAY_MS = 100;
const WORKTREE_REMOVAL_RETRY_MAX_DELAY_MS = 500;
let AgentHostGitService = class {
  constructor(_fileService, _environmentService, _logService) {
    this._fileService = _fileService;
    this._environmentService = _environmentService;
    this._logService = _logService;
    /**
     * A cache of repository roots that have already been discovered.
     */
    this._repositoryRoots = new LRUCache(100);
    this._repositoryRootSequencer = new SequencerByKey();
  }
  async getCurrentBranch(workingDirectory) {
    return (await this._runGit(workingDirectory, ["branch", "--show-current"]))?.trim() || (await this._runGit(workingDirectory, ["rev-parse", "--short", "HEAD"]))?.trim() || void 0;
  }
  async getCurrentBranchName(workingDirectory) {
    return (await this._runGit(workingDirectory, ["branch", "--show-current"]))?.trim() || void 0;
  }
  async getDefaultBranch(workingDirectory) {
    const remoteRef = (await this._runGit(workingDirectory, ["symbolic-ref", "refs/remotes/origin/HEAD"]))?.trim();
    if (remoteRef) {
      if (!remoteRef.startsWith("refs/remotes/origin/")) {
        return { name: remoteRef, startPoint: remoteRef };
      }
      const branch = remoteRef.substring("refs/remotes/origin/".length);
      const hasRemoteRef = await this._runGit(workingDirectory, ["show-ref", "--verify", "--quiet", `refs/remotes/origin/${branch}`]) !== void 0;
      if (hasRemoteRef) {
        return { name: branch, startPoint: `origin/${branch}` };
      }
      const hasLocalBranch = await this._runGit(workingDirectory, ["show-ref", "--verify", "--quiet", `refs/heads/${branch}`]) !== void 0;
      return hasLocalBranch ? { name: branch, startPoint: branch } : void 0;
    }
    return void 0;
  }
  async getRefs(workingDirectory, query) {
    const args = ["for-each-ref", "--format=%(refname)%00%(upstream)"];
    if (query?.sort && query.sort !== "alphabetically") {
      args.push("--sort", `-${query.sort}`);
    }
    if (query?.count) {
      args.push(`--count=${query.count}`);
    }
    if (query?.pattern) {
      const patterns = Array.isArray(query.pattern) ? query.pattern : [query.pattern];
      for (const pattern of patterns) {
        args.push(pattern.startsWith("refs/") ? pattern : `refs/${pattern}`);
      }
    }
    const output = await this._runGit(workingDirectory, args);
    return parseGitRefs(output);
  }
  async getBranches(workingDirectory, query) {
    const refs = await this.getRefs(workingDirectory, query);
    return refs.filter((r) => r.kind === GitRefType.Head || r.kind === GitRefType.RemoteHead);
  }
  async getBranch(workingDirectory, name) {
    const refs = await this.getBranches(workingDirectory, { pattern: name });
    return refs.length > 0 ? refs[0] : void 0;
  }
  async getRepositoryRoot(workingDirectory) {
    const workingDirectoryKey = workingDirectory.toString();
    return this._repositoryRootSequencer.queue(workingDirectoryKey, async () => {
      let repositoryRoot = this._repositoryRoots.get(workingDirectoryKey);
      if (repositoryRoot) {
        return repositoryRoot;
      }
      try {
        const repositoryRootPath = (await this._runGit(workingDirectory, ["rev-parse", "--show-toplevel"]))?.trim();
        if (repositoryRootPath) {
          repositoryRoot = URI.file(repositoryRootPath);
          this._repositoryRoots.set(workingDirectoryKey, repositoryRoot);
        }
        return repositoryRoot;
      } catch (error) {
      }
      return void 0;
    });
  }
  async getWorktreeRoots(workingDirectory) {
    return this._parseWorktreeRoots(await this._runGit(workingDirectory, ["worktree", "list", "--porcelain"]));
  }
  _parseWorktreeRoots(porcelainOutput) {
    if (!porcelainOutput) {
      return [];
    }
    return porcelainOutput.split(/\r?\n/g).filter((line) => line.startsWith("worktree ")).map((line) => URI.file(line.substring("worktree ".length)));
  }
  async addWorktree(repositoryRoot, worktree, branchName, startPoint, track = false, onProgress) {
    const resolvedStartPoint = await this._resolveRemoteTrackingBranch(repositoryRoot, startPoint, track) ?? startPoint;
    const args = ["-c", "checkout.workers=0", "worktree", "add"];
    if (!track) {
      args.push("--no-track");
    }
    args.push("-b", branchName, worktree.fsPath, resolvedStartPoint);
    const progressParser = onProgress ? new GitCheckoutProgressParser(onProgress) : void 0;
    await this._runGit(repositoryRoot, args, {
      timeout: 18e4,
      throwOnError: true,
      ...progressParser ? { env: { GIT_PROGRESS_DELAY: "0" }, onStderr: (chunk) => progressParser.push(chunk) } : {}
    });
  }
  async copyWorktreeIncludeFiles(repositoryRoot, worktree, globs, onProgress) {
    try {
      const worktreeIncludePaths = await this._getWorktreeIncludePaths(repositoryRoot, worktree, globs);
      if (worktreeIncludePaths.length === 0) {
        return;
      }
      const startTime = performance.now();
      const limiter = new Limiter(15);
      const filesTotal = worktreeIncludePaths.reduce((total, entry) => total + entry.fileCount, 0);
      let filesDone = 0;
      const results = await Promise.allSettled(worktreeIncludePaths.map((entry) => limiter.queue(async () => {
        const targetPath = path.join(worktree.fsPath, path.relative(repositoryRoot.fsPath, entry.sourcePath));
        await fsPromises.mkdir(path.dirname(targetPath), { recursive: true });
        await copyFile(entry.sourcePath, targetPath, { force: true, recursive: true, verbatimSymlinks: true });
        filesDone += entry.fileCount;
        onProgress?.({ filesDone, filesTotal });
      })));
      const failedOperations = results.filter((result) => result.status === "rejected");
      this._logService.info(`[AgentHostGitService][copyWorktreeIncludeFiles] Copied ${worktreeIncludePaths.length - failedOperations.length}/${worktreeIncludePaths.length} folder(s)/file(s) to worktree ${worktree.fsPath}. [${(performance.now() - startTime).toFixed(2)}ms]`);
      if (failedOperations.length > 0) {
        this._logService.warn(`[AgentHostGitService][copyWorktreeIncludeFiles] Failed to copy ${failedOperations.length} folder(s)/file(s) to worktree ${worktree.fsPath}.`);
        for (const error of failedOperations) {
          this._logService.warn(`[AgentHostGitService][copyWorktreeIncludeFiles] ${error.reason}`);
        }
      }
    } catch (error) {
      this._logService.warn(`[AgentHostGitService][copyWorktreeIncludeFiles] Failed to copy folder(s)/file(s) to worktree ${worktree.fsPath}: ${error}`);
    }
  }
  async addExistingWorktree(repositoryRoot, worktree, branchName) {
    await this._runGit(repositoryRoot, ["-c", "checkout.workers=0", "worktree", "add", "-f", worktree.fsPath, branchName], { timeout: 18e4, throwOnError: true });
  }
  /**
   * Removes a session's git worktree, tolerating the teardown race where a
   * concurrent git process is still running inside it.
   *
   * `git worktree remove` deletes the working tree and then the admin directory
   * `.git/worktrees/<id>`. If another git process (our own status/diff probes,
   * or the agent's own git) re-created `index.lock` there, that last step fails
   * with "Directory not empty". And `git worktree prune` — which we use to
   * finish a partially-removed worktree — can even exit 0 while failing to
   * delete that directory, so a zero exit is not proof of success.
   *
   * Example the loop below handles:
   * ```
   *   attempt 1  `remove` deletes the tree, then can't rmdir .git/worktrees/<id>
   *              (a probe's index.lock is still there)                  -> throws
   *   wait ~100ms  the probe finishes and releases its lock
   *   attempt 2  tree already gone -> `prune` clears the stale entry
   *              -> verified de-registered                              -> done
   * ```
   *
   * So we: retry with a capped exponential backoff to let the racing process
   * finish; switch to `prune` once the working tree is already gone; only retry
   * transient lock / "directory not empty" failures (a dirty-tree "use --force"
   * still fails fast); treat a non-retryable failure as success when git no
   * longer tracks the worktree (idempotent re-removal of an already-removed or
   * archived worktree); and verify the worktree is truly de-registered before
   * returning, so a silent `prune` no-op cannot mask a leaked entry.
   */
  async removeWorktree(repositoryRoot, worktree, options) {
    const removeArgs = ["worktree", "remove"];
    if (options?.force) {
      removeArgs.push("--force");
    }
    removeArgs.push(worktree.fsPath);
    let lastError;
    for (let attempt = 0; attempt < WORKTREE_REMOVAL_MAX_ATTEMPTS; attempt++) {
      if (attempt > 0) {
        await timeout(Math.min(WORKTREE_REMOVAL_RETRY_MAX_DELAY_MS, WORKTREE_REMOVAL_RETRY_BASE_DELAY_MS * 2 ** (attempt - 1)));
      }
      try {
        if (await this._pathExists(worktree.fsPath)) {
          await this._runGit(repositoryRoot, removeArgs, { timeout: 6e4, throwOnError: true });
        } else {
          await this._runGit(repositoryRoot, ["worktree", "prune"], { timeout: 6e4, throwOnError: true });
        }
        if (!await this._isWorktreeRegistered(repositoryRoot, worktree)) {
          return;
        }
        lastError = new Error(`git worktree removal left '${worktree.fsPath}' registered (admin directory not deleted)`);
      } catch (error) {
        lastError = error;
        if (!isRetryableWorktreeRemovalError(error)) {
          if (!await this._isWorktreeRegistered(repositoryRoot, worktree)) {
            this._logService.trace(`[agentHostGitService] worktree '${worktree.fsPath}' already de-registered; treating removal as complete`);
            return;
          }
          throw error;
        }
      }
      if (attempt < WORKTREE_REMOVAL_MAX_ATTEMPTS - 1) {
        this._logService.warn(`[agentHostGitService] worktree removal attempt ${attempt + 1}/${WORKTREE_REMOVAL_MAX_ATTEMPTS} did not complete for '${worktree.fsPath}', retrying: ${lastError instanceof Error ? lastError.message : String(lastError)}`);
      }
    }
    throw lastError;
  }
  async _pathExists(fsPath) {
    try {
      await fsPromises.access(fsPath);
      return true;
    } catch (error) {
      return error?.code !== "ENOENT";
    }
  }
  /**
   * Whether `worktree` is still registered with git (its admin entry survives).
   * Fails closed (returns `true`) if the registry cannot be read, so an unrelated
   * `git worktree list` failure is never mistaken for a completed removal.
   */
  async _isWorktreeRegistered(repositoryRoot, worktree) {
    let registered;
    try {
      registered = this._parseWorktreeRoots(await this._runGit(repositoryRoot, ["worktree", "list", "--porcelain"], { throwOnError: true }));
    } catch {
      return true;
    }
    if (registered.length === 0) {
      return false;
    }
    const target = await this._canonicalizeWorktreePath(worktree);
    const matched = await firstParallel(
      registered.map(async (entry) => extUriBiasedIgnorePathCase.isEqual(entry, worktree) || extUriBiasedIgnorePathCase.isEqual(await this._canonicalizeWorktreePath(entry), target)),
      (isMatch) => isMatch,
      false
    );
    return matched ?? false;
  }
  /**
   * Resolves symlinks on the worktree's parent (which persists even after the
   * worktree directory itself is deleted) so a path we passed to git (e.g.
   * `/var/...`) matches the realpath'd form git reports (`/private/var/...`).
   */
  async _canonicalizeWorktreePath(worktree) {
    try {
      const parentReal = await fsPromises.realpath(path.dirname(worktree.fsPath));
      return URI.file(path.join(parentReal, path.basename(worktree.fsPath)));
    } catch {
      return worktree;
    }
  }
  async branchExists(repositoryRoot, branchName) {
    const output = await this._runGit(repositoryRoot, ["show-ref", "--verify", "--quiet", `refs/heads/${branchName}`]);
    return output !== void 0;
  }
  async hasUncommittedChanges(workingDirectory) {
    const output = await this._runGitStatus(workingDirectory, ["--porcelain"]);
    return !!output && output.trim().length > 0;
  }
  async commitAll(workingDirectory, message) {
    await this._runGit(workingDirectory, ["add", "-A", "--", ":/"], { throwOnError: true });
    await this._runGit(workingDirectory, ["commit", "--no-verify", "-m", message], { timeout: 6e4, throwOnError: true });
  }
  async mergeBranch(workingDirectory, branchName) {
    const existingMergeHead = await this._runGit(workingDirectory, ["rev-parse", "--verify", "--quiet", "MERGE_HEAD"]);
    if (existingMergeHead) {
      throw new Error(`Cannot merge '${branchName}' because another merge is already in progress.`);
    }
    try {
      return (await this._runGit(workingDirectory, ["merge", "--no-edit", "--", branchName], { timeout: 6e4, throwOnError: true }))?.trim() ?? "";
    } catch (error) {
      const mergeHead = await this._runGit(workingDirectory, ["rev-parse", "--verify", "--quiet", "MERGE_HEAD"]);
      if (mergeHead) {
        try {
          await this._runGit(workingDirectory, ["merge", "--abort"], { timeout: 6e4, throwOnError: true });
        } catch (abortError) {
          const mergeMessage = error instanceof Error ? error.message : String(error);
          const abortMessage = abortError instanceof Error ? abortError.message : String(abortError);
          throw new Error(`Merge failed and could not be aborted: ${mergeMessage}; ${abortMessage}`, { cause: error });
        }
      }
      throw error;
    }
  }
  async restore(workingDirectory, paths, options) {
    const args = ["restore"];
    if (options?.staged) {
      args.push("--staged");
    }
    if (options?.ref) {
      args.push("--source", options.ref);
    }
    if (paths.length === 0) {
      paths = ["."];
    }
    await this._runGit(workingDirectory, [...args, "--", ...paths], { throwOnError: true });
  }
  async hasUpstream(workingDirectory, branchName) {
    const output = await this._runGit(workingDirectory, ["rev-parse", "--abbrev-ref", `${branchName}@{upstream}`]);
    return output !== void 0 && output.trim().length > 0;
  }
  async pull(workingDirectory, options) {
    const args = ["pull"];
    if (options?.rebase) {
      args.push("-r");
    }
    if (options?.remote || options?.ref) {
      args.push(options.remote ?? "origin");
      if (options.ref) {
        args.push(options.ref);
      }
    }
    await this._runGit(workingDirectory, args, { timeout: 18e4, throwOnError: true });
  }
  async push(workingDirectory, options) {
    const args = ["push"];
    if (options?.setUpstream) {
      args.push("--set-upstream");
    }
    if (options?.remote || options?.ref) {
      args.push(options.remote ?? "origin");
      if (options.ref) {
        args.push(options.ref);
      }
    }
    await this._runGit(workingDirectory, args, { timeout: 18e4, throwOnError: true });
  }
  async computeSessionFileDiffs(workingDirectory, options) {
    const repositoryRoot = await this.getRepositoryRoot(workingDirectory);
    if (!repositoryRoot) {
      return void 0;
    }
    const mergeBaseCommit = await this._resolveBranchMergeBaseCommit(repositoryRoot, options.baseBranch);
    const statusOut = await this._runGitStatus(repositoryRoot, ["--porcelain=v1", "-z", "--untracked-files=all"]);
    if (statusOut === void 0) {
      return void 0;
    }
    const hasUntracked = parseUntrackedPaths(statusOut).length > 0;
    let rawDiffOutput;
    if (!hasUntracked) {
      rawDiffOutput = await this._runGit(repositoryRoot, ["diff", "--raw", "--numstat", "--diff-filter=ADMR", "-z", mergeBaseCommit, "--"]);
    } else {
      const changedPaths = parseChangedPaths(statusOut);
      rawDiffOutput = await this._runWithTempIndex(repositoryRoot, mergeBaseCommit, changedPaths);
    }
    if (rawDiffOutput === void 0) {
      return void 0;
    }
    return parseGitDiffRawNumstat(rawDiffOutput, repositoryRoot, options.sessionUri, mergeBaseCommit);
  }
  async resolveBranchBaselineCommit(workingDirectory, baseBranch) {
    const repositoryRoot = await this.getRepositoryRoot(workingDirectory);
    if (!repositoryRoot) {
      return void 0;
    }
    return this._resolveBranchMergeBaseCommit(repositoryRoot, baseBranch);
  }
  /**
   * Resolves the merge-base commit-ish the Branch Changes baseline is anchored
   * on. With a base branch, prefers the corresponding `origin/<base>`
   * remote-tracking ref when it exists so branch changes match a PR-style
   * comparison even if the local base branch is stale. Without a usable base,
   * falls back to `HEAD` (surfaces uncommitted work but no committed-on-branch
   * work). For empty repos with no `HEAD`, falls back to the empty-tree object.
   * Always resolves to a commit-ish (never `undefined`) once the repository
   * root is known.
   */
  async _resolveBranchMergeBaseCommit(repositoryRoot, baseBranch) {
    let mergeBaseCommit;
    if (baseBranch) {
      const resolvedBase = await this._resolveRemoteTrackingBranch(repositoryRoot, baseBranch) ?? baseBranch;
      mergeBaseCommit = (await this._runGit(repositoryRoot, ["merge-base", "HEAD", resolvedBase]))?.trim();
    }
    if (!mergeBaseCommit) {
      mergeBaseCommit = (await this._runGit(repositoryRoot, ["rev-parse", "HEAD"]))?.trim();
    }
    return mergeBaseCommit ?? EMPTY_TREE_OBJECT;
  }
  async _runWithTempIndex(repositoryRoot, mergeBaseCommit, changedPaths) {
    const tempDir = URI.joinPath(this._environmentService.tmpDir, `agent-host-git-diff-${generateUuid()}`);
    await this._fileService.createFolder(tempDir);
    const indexFile = URI.joinPath(tempDir, "index").fsPath;
    const env = { GIT_INDEX_FILE: indexFile };
    env.COMMAND_HOOK_LOCK = "1";
    try {
      const seeded = await this._runGit(repositoryRoot, ["read-tree", "HEAD"], { env });
      if (seeded === void 0) {
        await this._runGit(repositoryRoot, ["read-tree", EMPTY_TREE_OBJECT], { env });
      }
      if (!await this._stageChangedPaths(repositoryRoot, tempDir, changedPaths, env)) {
        return void 0;
      }
      return await this._runGit(repositoryRoot, ["diff", "--cached", "--raw", "--numstat", "--diff-filter=ADMR", "-z", mergeBaseCommit, "--"], { env });
    } finally {
      try {
        await this._fileService.del(tempDir, { recursive: true, useTrash: false });
      } catch {
      }
    }
  }
  async _stageChangedPaths(repositoryRoot, tempDir, changedPaths, env) {
    if (changedPaths.length === 0) {
      return true;
    }
    const pathspecFile = URI.joinPath(tempDir, "pathspec");
    await this._fileService.writeFile(pathspecFile, VSBuffer.fromString(changedPaths.join("\0") + "\0"));
    this._logService.debug(`[agentHostGitService] Staging ${changedPaths.length} changed path(s) into temp index`);
    return await this._runGit(repositoryRoot, ["add", "-A", `--pathspec-from-file=${pathspecFile.fsPath}`, "--pathspec-file-nul"], {
      env: { ...env, GIT_LITERAL_PATHSPECS: "1" }
    }) !== void 0;
  }
  async _resolveRemoteTrackingBranch(repositoryRoot, branch, fetchIfMissing = false) {
    const trackingRef = getRemoteTrackingRef(branch);
    if (!trackingRef) {
      return void 0;
    }
    const { branchName, remoteBranch, remoteRef, sourceRef } = trackingRef;
    const output = await this._runGit(repositoryRoot, ["show-ref", "--verify", "--quiet", remoteRef]);
    if (output !== void 0) {
      return remoteBranch;
    }
    if (!fetchIfMissing || branchName === "HEAD" || /^[0-9a-f]{40}$/i.test(branchName)) {
      return void 0;
    }
    this._logService.info(`[AgentHostGitService] Fetching tracked branch '${branchName}' from origin.`);
    await this._runGit(repositoryRoot, ["fetch", "--no-tags", "origin", `${sourceRef}:${remoteRef}`], {
      timeout: 6e4,
      throwOnError: true
    });
    return remoteBranch;
  }
  /**
   * Resolves the git-ignored paths to copy into a worktree.
   */
  async _getWorktreeIncludePaths(repositoryRoot, worktreeRoot, globs) {
    if (globs.length === 0) {
      return [];
    }
    const baseArgs = ["ls-files", "--others", "--ignored", "--exclude-standard", "-z"];
    const [filesOutput, directoryOutput, worktreeOutput] = await Promise.all([
      this._runGit(repositoryRoot, baseArgs, { timeout: 6e4 }),
      this._runGit(repositoryRoot, [...baseArgs, "--directory", "--no-empty-directory"], { timeout: 6e4 }),
      this._runGit(worktreeRoot, ["ls-files", "-z"], { timeout: 6e4 })
    ]);
    if (!filesOutput) {
      return [];
    }
    const ignoredFiles = filesOutput.split("\0").filter((entry) => entry.length > 0);
    if (ignoredFiles.length === 0) {
      return [];
    }
    const matchers = globs.map((pattern) => parse(pattern));
    const wholeDirectories = new Set((directoryOutput ?? "").split("\0").filter((entry) => entry.endsWith("/")));
    const worktreeFiles = new Set((worktreeOutput ?? "").split("\0").filter((entry) => entry.length > 0));
    const worktreeDirectories = /* @__PURE__ */ new Set();
    for (const file of worktreeFiles) {
      let index = file.indexOf("/");
      while (index !== -1) {
        worktreeDirectories.add(file.slice(0, index + 1));
        index = file.indexOf("/", index + 1);
      }
    }
    const matchedFiles = [];
    const nonCollapsibleDirectories = /* @__PURE__ */ new Set();
    for (const file of ignoredFiles) {
      if (matchers.some((matcher) => matcher(file)) && !hasWorktreePathCollision(file, worktreeFiles, worktreeDirectories)) {
        matchedFiles.push(file);
      } else if (wholeDirectories.size > 0) {
        const containingDirectory = findContainingDirectory(file, wholeDirectories);
        if (containingDirectory !== void 0) {
          nonCollapsibleDirectories.add(containingDirectory);
        }
      }
    }
    if (matchedFiles.length === 0) {
      return [];
    }
    const collapsedDirectories = /* @__PURE__ */ new Set();
    for (const dir of wholeDirectories) {
      if (!nonCollapsibleDirectories.has(dir)) {
        collapsedDirectories.add(dir);
      }
    }
    return toWorktreeIncludeEntries(repositoryRoot, matchedFiles, collapsedDirectories);
  }
  async showBlob(workingDirectory, ref, repoRelativePath) {
    const repositoryRoot = await this.getRepositoryRoot(workingDirectory);
    if (!repositoryRoot) {
      return void 0;
    }
    return new Promise((resolve) => {
      cp.execFile("git", ["show", `${ref}:${repoRelativePath}`], { cwd: workingDirectory.fsPath, timeout: 5e3, encoding: "buffer", maxBuffer: 32 * 1024 * 1024 }, (error, stdout) => {
        if (error) {
          resolve(void 0);
          return;
        }
        resolve(VSBuffer.wrap(stdout));
      });
    });
  }
  async getSessionGitState(workingDirectory, baseBranchName) {
    return this._computeSessionGitState(workingDirectory, baseBranchName);
  }
  async getFetchRemoteUrls(workingDirectory, preferredRemote) {
    const repositoryRoot = await this.getRepositoryRoot(workingDirectory);
    if (!repositoryRoot) {
      return void 0;
    }
    return parseFetchRemoteUrls(await this._runGit(repositoryRoot, ["remote", "-v"]), preferredRemote);
  }
  async getUntrackedPaths(workingDirectory) {
    const repositoryRoot = await this.getRepositoryRoot(workingDirectory);
    if (!repositoryRoot) {
      return void 0;
    }
    const status = await this._runGitStatus(repositoryRoot, ["--porcelain=v1", "-z", "--untracked-files=all"]);
    return status === void 0 ? void 0 : parseUntrackedPaths(status);
  }
  async captureWorkingTreeAsTree(workingDirectory) {
    const repositoryRoot = await this.getRepositoryRoot(workingDirectory);
    if (!repositoryRoot) {
      return void 0;
    }
    const statusOut = await this._runGitStatus(repositoryRoot, ["--porcelain=v1", "-z", "--untracked-files=all"]);
    if (statusOut === void 0) {
      return void 0;
    }
    const changedPaths = parseChangedPaths(statusOut);
    const tempDir = URI.joinPath(this._environmentService.tmpDir, `agent-host-checkpoint-${generateUuid()}`);
    await this._fileService.createFolder(tempDir);
    const indexFile = URI.joinPath(tempDir, "index").fsPath;
    const env = { GIT_INDEX_FILE: indexFile, COMMAND_HOOK_LOCK: "1" };
    try {
      const seeded = await this._runGit(repositoryRoot, ["read-tree", "HEAD"], { env });
      if (seeded === void 0) {
        await this._runGit(repositoryRoot, ["read-tree", EMPTY_TREE_OBJECT], { env });
      }
      if (!await this._stageChangedPaths(repositoryRoot, tempDir, changedPaths, env)) {
        return void 0;
      }
      const tree = (await this._runGit(repositoryRoot, ["write-tree"], { env }))?.trim();
      return tree || void 0;
    } finally {
      try {
        await this._fileService.del(tempDir, { recursive: true, useTrash: false });
      } catch {
      }
    }
  }
  async commitTree(repositoryRoot, treeOid, parentOid, message) {
    const args = ["commit-tree", treeOid];
    if (parentOid) {
      args.push("-p", parentOid);
    }
    args.push("-m", message);
    const out = await this._runGit(repositoryRoot, args, { throwOnError: true });
    return out?.trim() || void 0;
  }
  async updateRef(repositoryRoot, ref, newOid) {
    await this._runGit(repositoryRoot, ["update-ref", ref, newOid], { throwOnError: true });
  }
  async deleteRefs(repositoryRoot, refs) {
    if (refs.length === 0) {
      return;
    }
    const stdin = refs.map((ref) => `delete ${ref}\0\0`).join("");
    await new Promise((resolve) => {
      const proc = cp.execFile("git", ["update-ref", "--stdin", "-z"], { cwd: repositoryRoot.fsPath, timeout: 1e4 }, () => {
        resolve();
      });
      proc.stdin?.end(stdin);
    });
  }
  async revParse(repositoryRoot, expression) {
    const out = await this._runGit(repositoryRoot, ["rev-parse", "--verify", "--quiet", expression]);
    return out?.trim() || void 0;
  }
  async listRefNamesWithOids(repositoryRoot, pattern) {
    const out = await this._runGit(repositoryRoot, ["for-each-ref", "--format=%(refname)%00%(objectname)", pattern]);
    if (!out) {
      return [];
    }
    const result = [];
    for (const line of out.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed) {
        continue;
      }
      const [ref, oid] = trimmed.split("\0");
      if (ref && oid) {
        result.push({ ref, oid });
      }
    }
    return result;
  }
  async overlayPathIntoTree(repositoryRoot, baseTreeOid, path2, sourceTreeOid) {
    const tempDir = URI.joinPath(this._environmentService.tmpDir, `agent-host-review-overlay-${generateUuid()}`);
    await this._fileService.createFolder(tempDir);
    const indexFile = URI.joinPath(tempDir, "index").fsPath;
    const env = { GIT_INDEX_FILE: indexFile, COMMAND_HOOK_LOCK: "1" };
    try {
      const readTreeOut = await this._runGit(repositoryRoot, ["read-tree", baseTreeOid], { env, throwOnError: false });
      if (readTreeOut === void 0) {
        return void 0;
      }
      const lsTreeOut = await this._runGit(repositoryRoot, ["ls-tree", "-z", sourceTreeOid, "--", path2], { env });
      const entry = parseSingleLsTreeEntry(lsTreeOut);
      if (entry) {
        const updateIndexOut = await this._runGit(repositoryRoot, ["update-index", "--add", "--cacheinfo", `${entry.mode},${entry.oid},${path2}`], { env, throwOnError: false });
        if (updateIndexOut === void 0) {
          return void 0;
        }
      } else {
        const updateIndexOut = await this._runGit(repositoryRoot, ["update-index", "--force-remove", "--", path2], { env, throwOnError: false });
        if (updateIndexOut === void 0) {
          return void 0;
        }
      }
      const writeTreeOut = await this._runGit(repositoryRoot, ["write-tree"], { env });
      return writeTreeOut?.trim();
    } finally {
      try {
        await this._fileService.del(tempDir, { recursive: true, useTrash: false });
      } catch {
      }
    }
  }
  async diffTreePaths(repositoryRoot, fromTreeish, toTreeish) {
    const out = await this._runGit(repositoryRoot, ["diff", "--name-only", "--no-renames", "-z", fromTreeish, toTreeish, "--"]);
    if (out === void 0) {
      return void 0;
    }
    return out.split("\0").filter(Boolean);
  }
  async computeFileDiffsBetweenRefs(workingDirectory, options) {
    const repositoryRoot = await this.getRepositoryRoot(workingDirectory);
    if (!repositoryRoot) {
      return void 0;
    }
    try {
      const raw = await this._runGit(repositoryRoot, ["diff", "--raw", "--numstat", "--diff-filter=ADMR", "-z", options.fromRef, options.toRef, "--"]);
      if (raw === void 0) {
        return void 0;
      }
      return parseGitDiffRawNumstat(raw, repositoryRoot, options.sessionUri, options.fromRef, options.toRef);
    } catch (err) {
      this._logService.warn(`[AgentHostGitService][computeFileDiffsBetweenRefs] Failed to compute file diffs ${repositoryRoot.toString()}, ${options.fromRef}, ${options.toRef}: ${err}`);
      return void 0;
    }
  }
  async getBranchDiffSafetyInfo(workingDirectory, baselineCommit) {
    const repositoryRoot = await this.getRepositoryRoot(workingDirectory);
    if (!repositoryRoot) {
      return void 0;
    }
    const [virtualFileSystem, sparseCheckout, timestamp, commitCount, workspaceFiles] = await Promise.all([
      this._runGit(repositoryRoot, ["config", "--get", "core.virtualfilesystem"]),
      this._runGit(repositoryRoot, ["config", "--get", "core.sparsecheckout"]),
      this._runGit(repositoryRoot, ["show", "-s", "--format=%ct", baselineCommit]),
      this._runGit(repositoryRoot, ["rev-list", "--count", `${baselineCommit}..HEAD`]),
      this._runGit(repositoryRoot, ["ls-files", "--cached", "--others", "--exclude-standard", "-z"])
    ]);
    const sparseCheckoutEnabled = (/* @__PURE__ */ new Set(["true", "yes", "on", "1"])).has(sparseCheckout?.trim().toLowerCase() ?? "");
    const timestampSeconds = Number(timestamp?.trim());
    const parsedCommitCount = Number(commitCount?.trim());
    return {
      hasVirtualFileSystem: Boolean(virtualFileSystem?.trim()) || sparseCheckoutEnabled,
      baselineCommitTimestamp: Number.isFinite(timestampSeconds) ? timestampSeconds * 1e3 : void 0,
      commitCount: Number.isFinite(parsedCommitCount) ? parsedCommitCount : void 0,
      workspaceFileCount: workspaceFiles?.split("\0").filter(Boolean).length ?? 0
    };
  }
  async getDiffPatchBetweenRefs(workingDirectory, options) {
    const repositoryRoot = await this.getRepositoryRoot(workingDirectory);
    if (!repositoryRoot) {
      return void 0;
    }
    const paths = [...new Set(options.paths)];
    if (paths.length === 0) {
      return { patch: "", tooLarge: false };
    }
    try {
      const patch = await this._runGit(repositoryRoot, ["diff", "--patch", "--no-ext-diff", "--find-renames", "--diff-filter=ADMR", options.fromRef, options.toRef, "--", ...paths], { maxBuffer: options.maxBuffer, throwOnError: true });
      return patch === void 0 ? void 0 : { patch, tooLarge: false };
    } catch (error) {
      if (isMaxBufferError(error)) {
        return { patch: void 0, tooLarge: true };
      }
      throw error;
    }
  }
  async _computeSessionGitState(workingDirectory, configuredBaseBranch) {
    const repositoryRoot = await this.getRepositoryRoot(workingDirectory);
    if (!repositoryRoot) {
      return void 0;
    }
    const [
      statusOutput,
      remotesOutput,
      defaultBranchRef
    ] = await Promise.all([
      this._runGitStatus(repositoryRoot, ["-b", "--porcelain=v2"]),
      this._runGit(repositoryRoot, ["remote", "-v"]),
      configuredBaseBranch ? void 0 : this._runGit(repositoryRoot, ["symbolic-ref", "--quiet", "refs/remotes/origin/HEAD"])
    ]);
    const status = parseGitStatusV2(statusOutput);
    const hasGitHubRemote = parseHasGitHubRemote(remotesOutput);
    const baseBranchName = configuredBaseBranch ?? parseDefaultBranchRef(defaultBranchRef);
    const githubRepo = parseGitHubRepoFromRemote(remotesOutput);
    const upstreamRemote = status.upstreamBranchName?.split("/")[0];
    const [pushRemote, baseBranchDivergence] = await Promise.all([
      !upstreamRemote && status.branchName ? this._getPushRemote(repositoryRoot, status.branchName) : void 0,
      baseBranchName && status.branchName && status.branchName !== baseBranchName ? this._computeBaseBranchDivergence(repositoryRoot, baseBranchName, status.outgoingChanges === void 0) : void 0
    ]);
    const githubHeadRepo = upstreamRemote ? parseGitHubRepoFromRemote(remotesOutput, upstreamRemote) : parseGitHubHeadRepoFromRemoteSelection(remotesOutput, pushRemote);
    let outgoingChanges = status.outgoingChanges;
    if (outgoingChanges === void 0) {
      outgoingChanges = baseBranchDivergence?.count;
    }
    const result = {
      hasGitHubRemote,
      branchName: status.branchName,
      baseBranchName,
      upstreamBranchName: status.upstreamBranchName,
      incomingChanges: status.incomingChanges,
      outgoingChanges,
      uncommittedChanges: status.uncommittedChanges,
      hasBaseBranchChanges: baseBranchDivergence?.hasChanges,
      githubOwner: githubRepo?.owner,
      githubHeadOwner: githubHeadRepo?.owner,
      githubRepo: githubRepo?.repo
    };
    return stripUndefined(result);
  }
  async _getPushRemote(repositoryRoot, branchName) {
    return (await this._runGit(repositoryRoot, ["for-each-ref", "--format=%(push:remotename)", `refs/heads/${branchName}`]))?.trim() || void 0;
  }
  async _computeBaseBranchDivergence(repositoryRoot, baseBranchName, countCommits) {
    const localRef = `refs/heads/${baseBranchName}`;
    const remoteRef = `refs/remotes/origin/${baseBranchName}`;
    const refs = await this._runGit(repositoryRoot, ["for-each-ref", "--format=%(refname)", localRef, remoteRef]);
    if (refs === void 0) {
      return void 0;
    }
    const refNames = new Set(refs.split(/\r?\n/g).filter(Boolean));
    const baseBranchRef = refNames.has(localRef) ? localRef : refNames.has(remoteRef) ? remoteRef : baseBranchName;
    const output = await this._runGit(repositoryRoot, ["rev-list", countCommits ? "--count" : "--max-count=1", `${baseBranchRef}..HEAD`]);
    if (output === void 0) {
      return void 0;
    }
    if (!countCommits) {
      return { hasChanges: output.trim().length > 0 };
    }
    const count = Number(output.trim());
    return Number.isFinite(count) ? { hasChanges: count > 0, count } : void 0;
  }
  _runGitStatus(workingDirectory, args) {
    return this._runGit(workingDirectory, ["status", ...args], { env: { GIT_OPTIONAL_LOCKS: "0" } });
  }
  _runGit(workingDirectory, args, options) {
    this._logService.trace(`[agentHostGitService] > git ${args.join(" ")}`);
    return new Promise((resolve, reject) => {
      const env = options?.env ? { ...process.env, ...options.env } : void 0;
      const timeoutMs = options?.timeout ?? 5e3;
      let didTimeOut = false;
      const child = cp.execFile("git", [...args], { cwd: workingDirectory.fsPath, env, maxBuffer: options?.maxBuffer ?? 32 * 1024 * 1024 }, (error, stdout, stderr) => {
        if (error) {
          if (stderr) {
            this._logService.warn(`[agentHostGitService] > git ${args.join(" ")} failed; full stderr:
${stderr}`);
          }
          if (options?.throwOnError) {
            reject(new Error(formatGitError(args, timeoutMs, didTimeOut, error, stderr), { cause: error }));
            return;
          }
          resolve(void 0);
          return;
        }
        resolve(stdout);
      });
      const onStderr = options?.onStderr;
      if (onStderr) {
        child.stderr?.on("data", (chunk) => onStderr(chunk.toString()));
      }
      const timer = setTimeout(() => {
        didTimeOut = true;
        child.kill();
      }, timeoutMs);
      child.on("exit", () => clearTimeout(timer));
    });
  }
};
AgentHostGitService = __decorateClass([
  __decorateParam(0, IFileService),
  __decorateParam(1, INativeEnvironmentService),
  __decorateParam(2, ILogService)
], AgentHostGitService);
function getRemoteTrackingRef(branch) {
  const pullRequestRef = /^refs\/pull\/(?<number>\d+)\/head$/.exec(branch);
  const branchName = pullRequestRef?.groups ? `pull/${pullRequestRef.groups.number}/head` : branch.replace(/^refs\/remotes\/origin\//, "").replace(/^origin\//, "").replace(/^refs\/heads\//, "");
  if (branchName.startsWith("refs/")) {
    return void 0;
  }
  const remoteBranch = `origin/${branchName}`;
  return {
    branchName,
    remoteBranch,
    remoteRef: `refs/remotes/${remoteBranch}`,
    sourceRef: pullRequestRef ? branch : `refs/heads/${branchName}`
  };
}
const _GitCheckoutProgressParser = class _GitCheckoutProgressParser {
  constructor(_onProgress) {
    this._onProgress = _onProgress;
    this._pending = "";
  }
  push(chunk) {
    const buffer = this._pending + chunk;
    const lastBreak = Math.max(buffer.lastIndexOf("\r"), buffer.lastIndexOf("\n"));
    if (lastBreak === -1) {
      this._pending = buffer;
      return;
    }
    this._pending = buffer.substring(lastBreak + 1);
    const complete = buffer.substring(0, lastBreak);
    _GitCheckoutProgressParser._pattern.lastIndex = 0;
    let match;
    while (match = _GitCheckoutProgressParser._pattern.exec(complete)) {
      const filesTotal = Number(match.groups.total);
      if (filesTotal > 0) {
        this._onProgress({ filesDone: Number(match.groups.done), filesTotal });
      }
    }
  }
};
_GitCheckoutProgressParser._pattern = /Updating files:\s+\d+% \((?<done>\d+)\/(?<total>\d+)\)/g;
let GitCheckoutProgressParser = _GitCheckoutProgressParser;
function toWorktreeIncludeEntries(repositoryRoot, matchedFiles, collapsedDirectories) {
  const toEntry = (relativePath, fileCount) => ({
    sourcePath: path.join(repositoryRoot.fsPath, relativePath),
    fileCount
  });
  const directoryFileCounts = /* @__PURE__ */ new Map();
  for (const dir of collapsedDirectories) {
    directoryFileCounts.set(dir, 0);
  }
  const fileEntries = [];
  for (const file of matchedFiles) {
    const containingDirectory = collapsedDirectories.size > 0 ? findContainingDirectory(file, collapsedDirectories) : void 0;
    if (containingDirectory === void 0) {
      fileEntries.push(toEntry(file, 1));
    } else {
      directoryFileCounts.set(containingDirectory, directoryFileCounts.get(containingDirectory) + 1);
    }
  }
  return [
    ...[...directoryFileCounts].map(([dir, fileCount]) => toEntry(dir, fileCount)),
    ...fileEntries
  ];
}
function findContainingDirectory(file, directories) {
  let index = file.indexOf("/");
  while (index !== -1) {
    const prefix = file.slice(0, index + 1);
    if (directories.has(prefix)) {
      return prefix;
    }
    index = file.indexOf("/", index + 1);
  }
  return void 0;
}
function hasWorktreePathCollision(file, worktreeFiles, worktreeDirectories) {
  if (worktreeFiles.has(file) || worktreeDirectories.has(`${file}/`)) {
    return true;
  }
  let index = file.indexOf("/");
  while (index !== -1) {
    if (worktreeFiles.has(file.slice(0, index))) {
      return true;
    }
    index = file.indexOf("/", index + 1);
  }
  return false;
}
function isRetryableWorktreeRemovalError(error) {
  const message = error instanceof Error ? error.message : String(error);
  return /directory not empty/i.test(message) || /\bindex\.lock\b/i.test(message) || /unable to (?:create|write|append)[^\n]*\.lock/i.test(message) || /could not lock/i.test(message);
}
function formatGitError(args, timeoutMs, didTimeOut, error, stderr) {
  const subcommand = args[0] ?? "(unknown)";
  let reason;
  if (didTimeOut) {
    reason = `git ${subcommand} timed out after ${timeoutMs}ms`;
  } else if (error.killed && error.signal) {
    reason = `git ${subcommand} killed by ${error.signal}`;
  } else if (typeof error.code === "number") {
    reason = `git ${subcommand} exited with code ${error.code}`;
  } else {
    reason = error.message;
  }
  const detail = summarizeStderrForError(stderr);
  return detail ? `${reason}: ${detail}` : reason;
}
function summarizeStderrForError(stderr) {
  if (!stderr) {
    return "";
  }
  const lines = stderr.split(/[\r\n]+/g).map((line) => line.trim()).filter((line) => line.length > 0);
  if (lines.length === 0) {
    return "";
  }
  const MAX = 200;
  const gitLfsMissing = lines.find(
    (line) => /\bgit-lfs\b/i.test(line) && /(command not found|not recognized|no such file)/i.test(line)
  );
  const summary = gitLfsMissing ?? lines[lines.length - 1];
  return summary.length > MAX ? `${summary.slice(0, MAX - 1)}\u2026` : summary;
}
function parseUntrackedPaths(output) {
  return parseChangedPaths(output, (status) => status === "??");
}
function parseChangedPaths(output, includeStatus = () => true) {
  if (!output) {
    return [];
  }
  const result = [];
  const seen = /* @__PURE__ */ new Set();
  const addPath = (path2) => {
    if (path2 && !seen.has(path2)) {
      seen.add(path2);
      result.push(path2);
    }
  };
  const segments = output.split("\0");
  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i];
    if (!seg) {
      continue;
    }
    const status = seg.substring(0, 2);
    const path2 = seg.substring(3);
    const isRenameOrCopy = status[0] === "R" || status[1] === "R" || status[0] === "C" || status[1] === "C";
    if (includeStatus(status)) {
      addPath(path2);
      if (isRenameOrCopy) {
        const sourcePath = segments[++i];
        if (sourcePath) {
          addPath(sourcePath);
        }
      }
    } else if (isRenameOrCopy) {
      i++;
    }
  }
  return result;
}
function parseSingleLsTreeEntry(output) {
  if (!output) {
    return void 0;
  }
  const entry = output.split("\0")[0];
  if (!entry) {
    return void 0;
  }
  const tabIndex = entry.indexOf("	");
  const meta = (tabIndex === -1 ? entry : entry.substring(0, tabIndex)).split(" ");
  if (meta.length < 3) {
    return void 0;
  }
  return { mode: meta[0], oid: meta[2] };
}
function parseGitDiffRawNumstat(output, repositoryRoot, sessionUri, beforeRef, afterRef) {
  const segments = output.split("\0");
  const changes = [];
  const numStats = /* @__PURE__ */ new Map();
  let i = 0;
  while (i < segments.length) {
    const segment = segments[i++];
    if (!segment) {
      continue;
    }
    if (segment.startsWith(":")) {
      const fields = segment.split(" ");
      const status = fields[4] ?? "";
      const path1 = segments[i++];
      if (!path1) {
        continue;
      }
      switch (status[0]) {
        case "A":
          changes.push({ kind: FileEditKind.Create, newPath: path1 });
          break;
        case "M":
          changes.push({ kind: FileEditKind.Edit, oldPath: path1, newPath: path1 });
          break;
        case "D":
          changes.push({ kind: FileEditKind.Delete, oldPath: path1 });
          break;
        case "R": {
          const path2 = segments[i++];
          if (!path2) {
            continue;
          }
          changes.push({ kind: FileEditKind.Rename, oldPath: path1, newPath: path2 });
          break;
        }
        default:
          break;
      }
    } else {
      const [addedStr, removedStr, filePath] = segment.split("	");
      let key;
      if (filePath === "" || filePath === void 0) {
        const oldPath = segments[i++];
        const newPath = segments[i++];
        key = newPath ?? oldPath ?? "";
      } else {
        key = filePath;
      }
      if (!key) {
        continue;
      }
      numStats.set(key, {
        added: addedStr === "-" ? 0 : Number(addedStr) || 0,
        removed: removedStr === "-" ? 0 : Number(removedStr) || 0
      });
    }
  }
  return changes.map((change) => {
    const stats = numStats.get(change.newPath ?? change.oldPath ?? "");
    const beforeFileUri = change.oldPath ? URI.joinPath(repositoryRoot, change.oldPath) : void 0;
    const afterFileUri = change.newPath ? URI.joinPath(repositoryRoot, change.newPath) : void 0;
    const before = change.kind !== FileEditKind.Create && change.oldPath && beforeFileUri ? {
      uri: beforeFileUri.toString(),
      content: { uri: buildGitBlobUri(sessionUri, beforeRef, change.oldPath, beforeFileUri.path) }
    } : void 0;
    const after = change.kind !== FileEditKind.Delete && change.newPath && afterFileUri ? {
      uri: afterFileUri.toString(),
      content: afterRef !== void 0 ? { uri: buildGitBlobUri(sessionUri, afterRef, change.newPath, afterFileUri.path) } : { uri: afterFileUri.toString() }
    } : void 0;
    const diff = {
      added: stats?.added ?? 0,
      removed: stats?.removed ?? 0
    };
    return {
      ...before ? { before } : {},
      ...after ? { after } : {},
      diff
    };
  });
}
function parseGitStatusV2(output) {
  if (!output) {
    return {};
  }
  let branchName;
  let upstreamBranchName;
  let outgoingChanges;
  let incomingChanges;
  let uncommittedChanges = 0;
  for (const rawLine of output.split(/\r?\n/g)) {
    const line = rawLine.trimEnd();
    if (!line) {
      continue;
    }
    if (line.startsWith("# branch.head ")) {
      const head = line.substring("# branch.head ".length).trim();
      branchName = head === "(detached)" ? void 0 : head;
    } else if (line.startsWith("# branch.upstream ")) {
      upstreamBranchName = line.substring("# branch.upstream ".length).trim();
    } else if (line.startsWith("# branch.ab ")) {
      const m = /^# branch\.ab \+(\d+) -(\d+)$/.exec(line);
      if (m) {
        outgoingChanges = Number(m[1]);
        incomingChanges = Number(m[2]);
      }
    } else if (!line.startsWith("#")) {
      uncommittedChanges++;
    }
  }
  return { branchName, upstreamBranchName, outgoingChanges, incomingChanges, uncommittedChanges };
}
function parseHasGitHubRemote(remotesOutput) {
  if (remotesOutput === void 0) {
    return void 0;
  }
  if (!remotesOutput.trim()) {
    return false;
  }
  return /github\.com[:\/]/i.test(remotesOutput);
}
function parseFetchRemoteUrls(remotesOutput, preferredRemote) {
  const candidates = parseFetchRemotes(remotesOutput);
  if (!candidates) {
    return void 0;
  }
  const preferredNames = new Set([preferredRemote, "origin"].filter((name) => Boolean(name)));
  const ordered = [
    ...candidates.filter((candidate) => candidate.name === preferredRemote),
    ...candidates.filter((candidate) => candidate.name === "origin" && candidate.name !== preferredRemote),
    ...candidates.filter((candidate) => !preferredNames.has(candidate.name))
  ];
  return [...new Set(ordered.map((candidate) => candidate.url))];
}
function parseFetchRemotes(remotesOutput) {
  if (remotesOutput === void 0) {
    return void 0;
  }
  const candidates = [];
  for (const rawLine of remotesOutput.split(/\r?\n/)) {
    const match = /^(\S+)\s+(\S+)\s+\(fetch\)$/.exec(rawLine.trim());
    if (match) {
      candidates.push({ name: match[1], url: match[2] });
    }
  }
  return candidates;
}
function parseGitHubRepoFromRemote(remotesOutput, remoteName) {
  const candidates = remoteName === void 0 ? parseFetchRemoteUrls(remotesOutput) : parseFetchRemotes(remotesOutput)?.filter((candidate) => candidate.name === remoteName).map((candidate) => candidate.url);
  if (!candidates) {
    return void 0;
  }
  for (const url of candidates) {
    const parsed = parseGitHubOwnerRepoFromUrl(url);
    if (parsed) {
      return parsed;
    }
  }
  return void 0;
}
function parseGitHubHeadRepoFromRemoteSelection(remotesOutput, remoteSelection) {
  if (!remoteSelection) {
    return void 0;
  }
  return parseGitHubRepoFromRemote(remotesOutput, remoteSelection) ?? parseGitHubOwnerRepoFromUrl(remoteSelection);
}
function parseGitHubOwnerRepoFromUrl(url) {
  let m = /^[^@\s]+@github\.com:([^/\s]+)\/([^/\s]+?)(?:\.git)?$/i.exec(url);
  if (m) {
    return { owner: m[1], repo: m[2] };
  }
  m = /^[a-z+]+:\/\/(?:[^@\/\s]+@)?github\.com(?::\d+)?\/([^/\s]+)\/([^/\s]+?)(?:\.git)?$/i.exec(url);
  if (m) {
    return { owner: m[1], repo: m[2] };
  }
  return void 0;
}
function parseDefaultBranchRef(symbolicRefOutput) {
  const ref = symbolicRefOutput?.trim();
  if (!ref) {
    return void 0;
  }
  const prefix = "refs/remotes/origin/";
  return ref.startsWith(prefix) ? ref.substring(prefix.length) : ref;
}
function parseRemoteBranchRef(ref) {
  if (!ref.startsWith("refs/remotes/")) {
    return void 0;
  }
  const name = ref.substring(13);
  const remote = name.split("/")[0];
  return { ref, name, remote };
}
function parseGitRefs(output) {
  if (!output) {
    return [];
  }
  const refs = [];
  for (const line of output.split(/\r?\n/g)) {
    const [ref, upstream] = line.trim().split("\0");
    if (ref.startsWith("refs/heads/")) {
      refs.push({
        ref,
        name: ref.substring(11),
        upstream: upstream ? parseRemoteBranchRef(upstream) : void 0,
        kind: GitRefType.Head
      });
    } else if (ref.startsWith("refs/remotes/") && !/^refs\/remotes\/[^/]+\/HEAD$/.test(ref)) {
      const parsedRemoteBranch = parseRemoteBranchRef(ref);
      if (parsedRemoteBranch) {
        refs.push({
          ...parsedRemoteBranch,
          kind: GitRefType.RemoteHead
        });
      }
    } else if (ref.startsWith("refs/tags/")) {
      refs.push({
        ref,
        name: ref.substring(10),
        kind: GitRefType.Tag
      });
    }
  }
  return refs;
}
function stripUndefined(obj) {
  const out = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v !== void 0) {
      out[k] = v;
    }
  }
  return out;
}
function isMaxBufferError(error) {
  const cause = error instanceof Error ? error.cause : void 0;
  return cause instanceof Error && cause.code === "ERR_CHILD_PROCESS_STDIO_MAXBUFFER";
}
export {
  AgentHostGitService,
  GitCheckoutProgressParser,
  formatGitError,
  getRemoteTrackingRef,
  isRetryableWorktreeRemovalError,
  parseChangedPaths,
  parseDefaultBranchRef,
  parseFetchRemoteUrls,
  parseGitDiffRawNumstat,
  parseGitHubRepoFromRemote,
  parseGitRefs,
  parseGitStatusV2,
  parseHasGitHubRemote,
  parseRemoteBranchRef,
  parseSingleLsTreeEntry,
  parseUntrackedPaths,
  summarizeStderrForError
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxwbGF0Zm9ybVxcYWdlbnRIb3N0XFxub2RlXFxhZ2VudEhvc3RHaXRTZXJ2aWNlLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0ICogYXMgY3AgZnJvbSAnY2hpbGRfcHJvY2Vzcyc7XG5pbXBvcnQgKiBhcyBmc1Byb21pc2VzIGZyb20gJ2ZzL3Byb21pc2VzJztcbmltcG9ydCB7IGNwIGFzIGNvcHlGaWxlIH0gZnJvbSAnQHZzY29kZS9mcy1jb3B5ZmlsZSc7XG5pbXBvcnQgKiBhcyBwYXRoIGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL3BhdGguanMnO1xuaW1wb3J0IHsgZXh0VXJpQmlhc2VkSWdub3JlUGF0aENhc2UgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9yZXNvdXJjZXMuanMnO1xuaW1wb3J0IHsgVVJJIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vdXJpLmpzJztcbmltcG9ydCB7IFZTQnVmZmVyIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vYnVmZmVyLmpzJztcbmltcG9ydCB7IHBhcnNlIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vZ2xvYi5qcyc7XG5pbXBvcnQgeyBnZW5lcmF0ZVV1aWQgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi91dWlkLmpzJztcbmltcG9ydCB7IElOYXRpdmVFbnZpcm9ubWVudFNlcnZpY2UgfSBmcm9tICcuLi8uLi9lbnZpcm9ubWVudC9jb21tb24vZW52aXJvbm1lbnQuanMnO1xuaW1wb3J0IHsgSUZpbGVTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vZmlsZXMvY29tbW9uL2ZpbGVzLmpzJztcbmltcG9ydCB7IElMb2dTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vbG9nL2NvbW1vbi9sb2cuanMnO1xuaW1wb3J0IHsgRmlsZUVkaXRLaW5kLCB0eXBlIElTZXNzaW9uRmlsZURpZmYsIHR5cGUgSVNlc3Npb25HaXRTdGF0ZSB9IGZyb20gJy4uL2NvbW1vbi9zdGF0ZS9zZXNzaW9uU3RhdGUuanMnO1xuaW1wb3J0IHsgYnVpbGRHaXRCbG9iVXJpIH0gZnJvbSAnLi9naXREaWZmQ29udGVudC5qcyc7XG5pbXBvcnQgeyBFTVBUWV9UUkVFX09CSkVDVCwgSUFnZW50SG9zdEdpdFNlcnZpY2UsIElCcmFuY2gsIElCcmFuY2hEaWZmU2FmZXR5SW5mbywgSVJlZlF1ZXJ5LCBJQ29tcHV0ZVNlc3Npb25GaWxlRGlmZnNPcHRpb25zLCBJRGVmYXVsdEJyYW5jaCwgSVB1bGxPcHRpb25zLCBJUHVzaE9wdGlvbnMsIEdpdFJlZlR5cGUsIElSZW1vdGVCcmFuY2gsIEdpdFJlZiwgSVRhZywgQnJhbmNoLCBJV29ya3RyZWVGaWxlUHJvZ3Jlc3MgfSBmcm9tICcuLi9jb21tb24vYWdlbnRIb3N0R2l0U2VydmljZS5qcyc7XG5pbXBvcnQgeyBMUlVDYWNoZSB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL21hcC5qcyc7XG5pbXBvcnQgeyBmaXJzdFBhcmFsbGVsLCBMaW1pdGVyLCBTZXF1ZW5jZXJCeUtleSwgdGltZW91dCB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL2FzeW5jLmpzJztcblxuLyoqXG4gKiBgZ2l0IHdvcmt0cmVlIHJlbW92ZWAvYHBydW5lYCBjYW4gdHJhbnNpZW50bHkgZmFpbCBcdTIwMTQgb3IsIHdvcnNlLCBleGl0IDAgd2hpbGVcbiAqIGxlYXZpbmcgdGhlIGAuZ2l0L3dvcmt0cmVlcy88aWQ+YCBhZG1pbiBkaXJlY3RvcnkgYmVoaW5kIFx1MjAxNCB3aGVuIGEgY29uY3VycmVudFxuICogZ2l0IHByb2Nlc3MgaW4gdGhlIHdvcmt0cmVlIHN0aWxsIGhvbGRzIGFuIGBpbmRleC5sb2NrYCwgc28gdGhlIGFkbWluXG4gKiBkaXJlY3RvcnkgaXMgbm9uLWVtcHR5LiBUaGF0IGNsZWFycyBvbmNlIHRoZSBvdGhlciBwcm9jZXNzIGV4aXRzLCBzbyByZXRyeSBhXG4gKiBmZXcgdGltZXMgd2l0aCBhIGNhcHBlZCBleHBvbmVudGlhbCBiYWNrb2ZmIGFuZCB2ZXJpZnkgZGUtcmVnaXN0cmF0aW9uLlxuICovXG5jb25zdCBXT1JLVFJFRV9SRU1PVkFMX01BWF9BVFRFTVBUUyA9IDU7XG5jb25zdCBXT1JLVFJFRV9SRU1PVkFMX1JFVFJZX0JBU0VfREVMQVlfTVMgPSAxMDA7XG5jb25zdCBXT1JLVFJFRV9SRU1PVkFMX1JFVFJZX01BWF9ERUxBWV9NUyA9IDUwMDtcblxuZXhwb3J0IGNsYXNzIEFnZW50SG9zdEdpdFNlcnZpY2UgaW1wbGVtZW50cyBJQWdlbnRIb3N0R2l0U2VydmljZSB7XG5cdGRlY2xhcmUgcmVhZG9ubHkgX3NlcnZpY2VCcmFuZDogdW5kZWZpbmVkO1xuXG5cdC8qKlxuXHQgKiBBIGNhY2hlIG9mIHJlcG9zaXRvcnkgcm9vdHMgdGhhdCBoYXZlIGFscmVhZHkgYmVlbiBkaXNjb3ZlcmVkLlxuXHQgKi9cblx0cHJpdmF0ZSByZWFkb25seSBfcmVwb3NpdG9yeVJvb3RzID0gbmV3IExSVUNhY2hlPHN0cmluZywgVVJJPigxMDApO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9yZXBvc2l0b3J5Um9vdFNlcXVlbmNlciA9IG5ldyBTZXF1ZW5jZXJCeUtleTxzdHJpbmc+KCk7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0QElGaWxlU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9maWxlU2VydmljZTogSUZpbGVTZXJ2aWNlLFxuXHRcdEBJTmF0aXZlRW52aXJvbm1lbnRTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2Vudmlyb25tZW50U2VydmljZTogSU5hdGl2ZUVudmlyb25tZW50U2VydmljZSxcblx0XHRASUxvZ1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfbG9nU2VydmljZTogSUxvZ1NlcnZpY2UsXG5cdCkgeyB9XG5cblx0YXN5bmMgZ2V0Q3VycmVudEJyYW5jaCh3b3JraW5nRGlyZWN0b3J5OiBVUkkpOiBQcm9taXNlPHN0cmluZyB8IHVuZGVmaW5lZD4ge1xuXHRcdHJldHVybiAoYXdhaXQgdGhpcy5fcnVuR2l0KHdvcmtpbmdEaXJlY3RvcnksIFsnYnJhbmNoJywgJy0tc2hvdy1jdXJyZW50J10pKT8udHJpbSgpXG5cdFx0XHR8fCAoYXdhaXQgdGhpcy5fcnVuR2l0KHdvcmtpbmdEaXJlY3RvcnksIFsncmV2LXBhcnNlJywgJy0tc2hvcnQnLCAnSEVBRCddKSk/LnRyaW0oKVxuXHRcdFx0fHwgdW5kZWZpbmVkO1xuXHR9XG5cblx0YXN5bmMgZ2V0Q3VycmVudEJyYW5jaE5hbWUod29ya2luZ0RpcmVjdG9yeTogVVJJKTogUHJvbWlzZTxzdHJpbmcgfCB1bmRlZmluZWQ+IHtcblx0XHRyZXR1cm4gKGF3YWl0IHRoaXMuX3J1bkdpdCh3b3JraW5nRGlyZWN0b3J5LCBbJ2JyYW5jaCcsICctLXNob3ctY3VycmVudCddKSk/LnRyaW0oKSB8fCB1bmRlZmluZWQ7XG5cdH1cblxuXHRhc3luYyBnZXREZWZhdWx0QnJhbmNoKHdvcmtpbmdEaXJlY3Rvcnk6IFVSSSk6IFByb21pc2U8SURlZmF1bHRCcmFuY2ggfCB1bmRlZmluZWQ+IHtcblx0XHQvLyBUcnkgdG8gcmVhZCB0aGUgZGVmYXVsdCBicmFuY2ggZnJvbSB0aGUgcmVtb3RlIEhFQUQgcmVmZXJlbmNlXG5cdFx0Y29uc3QgcmVtb3RlUmVmID0gKGF3YWl0IHRoaXMuX3J1bkdpdCh3b3JraW5nRGlyZWN0b3J5LCBbJ3N5bWJvbGljLXJlZicsICdyZWZzL3JlbW90ZXMvb3JpZ2luL0hFQUQnXSkpPy50cmltKCk7XG5cdFx0aWYgKHJlbW90ZVJlZikge1xuXHRcdFx0aWYgKCFyZW1vdGVSZWYuc3RhcnRzV2l0aCgncmVmcy9yZW1vdGVzL29yaWdpbi8nKSkge1xuXHRcdFx0XHRyZXR1cm4geyBuYW1lOiByZW1vdGVSZWYsIHN0YXJ0UG9pbnQ6IHJlbW90ZVJlZiB9O1xuXHRcdFx0fVxuXG5cdFx0XHRjb25zdCBicmFuY2ggPSByZW1vdGVSZWYuc3Vic3RyaW5nKCdyZWZzL3JlbW90ZXMvb3JpZ2luLycubGVuZ3RoKTtcblx0XHRcdC8vIFByZWZlciB0aGUgcmVtb3RlLXRyYWNraW5nIHJlZiAoJ29yaWdpbi88YnJhbmNoPicpIG92ZXIgdGhlIGxvY2FsXG5cdFx0XHQvLyBicmFuY2ggd2hlbiBib3RoIGV4aXN0LCBzbyB3b3JrdHJlZXMgYXJlIGJhc2VkIG9uIHRoZSBtb3N0XG5cdFx0XHQvLyB1cC10by1kYXRlIGNvbW1pdCByYXRoZXIgdGhhbiBhIHBvc3NpYmx5IHN0YWxlIGxvY2FsIGJyYW5jaC5cblx0XHRcdC8vIFRoaXMgbWlycm9ycyB0aGUgZXh0ZW5zaW9uLWhvc3QgQ0xJIHdoaWNoIHJlc29sdmVzIGEgYnJhbmNoJ3Ncblx0XHRcdC8vIHVwc3RyZWFtIGFuZCB1c2VzIHRoYXQgYXMgdGhlIHdvcmt0cmVlIHN0YXJ0IHBvaW50LiBGYWxscyBiYWNrXG5cdFx0XHQvLyB0byB0aGUgbG9jYWwgYnJhbmNoIHdoZW4gdGhlIHJlbW90ZS10cmFja2luZyByZWYgaXMgbWlzc2luZ1xuXHRcdFx0Ly8gKGUuZy4gZnJlc2ggY2xvbmUgd2l0aCBubyByZW1vdGUtdHJhY2tpbmcgcmVmcyB5ZXQpLlxuXHRcdFx0Y29uc3QgaGFzUmVtb3RlUmVmID0gKGF3YWl0IHRoaXMuX3J1bkdpdCh3b3JraW5nRGlyZWN0b3J5LCBbJ3Nob3ctcmVmJywgJy0tdmVyaWZ5JywgJy0tcXVpZXQnLCBgcmVmcy9yZW1vdGVzL29yaWdpbi8ke2JyYW5jaH1gXSkpICE9PSB1bmRlZmluZWQ7XG5cdFx0XHRpZiAoaGFzUmVtb3RlUmVmKSB7XG5cdFx0XHRcdHJldHVybiB7IG5hbWU6IGJyYW5jaCwgc3RhcnRQb2ludDogYG9yaWdpbi8ke2JyYW5jaH1gIH07XG5cdFx0XHR9XG5cdFx0XHRjb25zdCBoYXNMb2NhbEJyYW5jaCA9IChhd2FpdCB0aGlzLl9ydW5HaXQod29ya2luZ0RpcmVjdG9yeSwgWydzaG93LXJlZicsICctLXZlcmlmeScsICctLXF1aWV0JywgYHJlZnMvaGVhZHMvJHticmFuY2h9YF0pKSAhPT0gdW5kZWZpbmVkO1xuXHRcdFx0cmV0dXJuIGhhc0xvY2FsQnJhbmNoID8geyBuYW1lOiBicmFuY2gsIHN0YXJ0UG9pbnQ6IGJyYW5jaCB9IDogdW5kZWZpbmVkO1xuXHRcdH1cblx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHR9XG5cblx0YXN5bmMgZ2V0UmVmcyh3b3JraW5nRGlyZWN0b3J5OiBVUkksIHF1ZXJ5PzogSVJlZlF1ZXJ5KTogUHJvbWlzZTxHaXRSZWZbXT4ge1xuXHRcdGNvbnN0IGFyZ3MgPSBbJ2Zvci1lYWNoLXJlZicsICctLWZvcm1hdD0lKHJlZm5hbWUpJTAwJSh1cHN0cmVhbSknXTtcblxuXHRcdGlmIChxdWVyeT8uc29ydCAmJiBxdWVyeS5zb3J0ICE9PSAnYWxwaGFiZXRpY2FsbHknKSB7XG5cdFx0XHRhcmdzLnB1c2goJy0tc29ydCcsIGAtJHtxdWVyeS5zb3J0fWApO1xuXHRcdH1cblxuXHRcdGlmIChxdWVyeT8uY291bnQpIHtcblx0XHRcdGFyZ3MucHVzaChgLS1jb3VudD0ke3F1ZXJ5LmNvdW50fWApO1xuXHRcdH1cblxuXHRcdGlmIChxdWVyeT8ucGF0dGVybikge1xuXHRcdFx0Y29uc3QgcGF0dGVybnMgPSBBcnJheS5pc0FycmF5KHF1ZXJ5LnBhdHRlcm4pID8gcXVlcnkucGF0dGVybiA6IFtxdWVyeS5wYXR0ZXJuXTtcblx0XHRcdGZvciAoY29uc3QgcGF0dGVybiBvZiBwYXR0ZXJucykge1xuXHRcdFx0XHRhcmdzLnB1c2gocGF0dGVybi5zdGFydHNXaXRoKCdyZWZzLycpID8gcGF0dGVybiA6IGByZWZzLyR7cGF0dGVybn1gKTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRjb25zdCBvdXRwdXQgPSBhd2FpdCB0aGlzLl9ydW5HaXQod29ya2luZ0RpcmVjdG9yeSwgYXJncyk7XG5cdFx0cmV0dXJuIHBhcnNlR2l0UmVmcyhvdXRwdXQpO1xuXHR9XG5cblx0YXN5bmMgZ2V0QnJhbmNoZXMod29ya2luZ0RpcmVjdG9yeTogVVJJLCBxdWVyeT86IElSZWZRdWVyeSk6IFByb21pc2U8QnJhbmNoW10+IHtcblx0XHRjb25zdCByZWZzID0gYXdhaXQgdGhpcy5nZXRSZWZzKHdvcmtpbmdEaXJlY3RvcnksIHF1ZXJ5KTtcblx0XHRyZXR1cm4gcmVmcy5maWx0ZXIociA9PiByLmtpbmQgPT09IEdpdFJlZlR5cGUuSGVhZCB8fCByLmtpbmQgPT09IEdpdFJlZlR5cGUuUmVtb3RlSGVhZCk7XG5cdH1cblxuXHRhc3luYyBnZXRCcmFuY2god29ya2luZ0RpcmVjdG9yeTogVVJJLCBuYW1lOiBzdHJpbmcpOiBQcm9taXNlPEJyYW5jaCB8IHVuZGVmaW5lZD4ge1xuXHRcdGNvbnN0IHJlZnMgPSBhd2FpdCB0aGlzLmdldEJyYW5jaGVzKHdvcmtpbmdEaXJlY3RvcnksIHsgcGF0dGVybjogbmFtZSB9KTtcblx0XHRyZXR1cm4gcmVmcy5sZW5ndGggPiAwID8gcmVmc1swXSA6IHVuZGVmaW5lZDtcblx0fVxuXG5cdGFzeW5jIGdldFJlcG9zaXRvcnlSb290KHdvcmtpbmdEaXJlY3Rvcnk6IFVSSSk6IFByb21pc2U8VVJJIHwgdW5kZWZpbmVkPiB7XG5cdFx0Y29uc3Qgd29ya2luZ0RpcmVjdG9yeUtleSA9IHdvcmtpbmdEaXJlY3RvcnkudG9TdHJpbmcoKTtcblxuXHRcdHJldHVybiB0aGlzLl9yZXBvc2l0b3J5Um9vdFNlcXVlbmNlci5xdWV1ZSh3b3JraW5nRGlyZWN0b3J5S2V5LCBhc3luYyAoKSA9PiB7XG5cdFx0XHRsZXQgcmVwb3NpdG9yeVJvb3QgPSB0aGlzLl9yZXBvc2l0b3J5Um9vdHMuZ2V0KHdvcmtpbmdEaXJlY3RvcnlLZXkpO1xuXHRcdFx0aWYgKHJlcG9zaXRvcnlSb290KSB7XG5cdFx0XHRcdHJldHVybiByZXBvc2l0b3J5Um9vdDtcblx0XHRcdH1cblxuXHRcdFx0dHJ5IHtcblx0XHRcdFx0Y29uc3QgcmVwb3NpdG9yeVJvb3RQYXRoID0gKGF3YWl0IHRoaXMuX3J1bkdpdCh3b3JraW5nRGlyZWN0b3J5LCBbJ3Jldi1wYXJzZScsICctLXNob3ctdG9wbGV2ZWwnXSkpPy50cmltKCk7XG5cdFx0XHRcdGlmIChyZXBvc2l0b3J5Um9vdFBhdGgpIHtcblx0XHRcdFx0XHRyZXBvc2l0b3J5Um9vdCA9IFVSSS5maWxlKHJlcG9zaXRvcnlSb290UGF0aCk7XG5cdFx0XHRcdFx0dGhpcy5fcmVwb3NpdG9yeVJvb3RzLnNldCh3b3JraW5nRGlyZWN0b3J5S2V5LCByZXBvc2l0b3J5Um9vdCk7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRyZXR1cm4gcmVwb3NpdG9yeVJvb3Q7XG5cdFx0XHR9IGNhdGNoIChlcnJvcikgeyB9XG5cblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fSk7XG5cdH1cblxuXHRhc3luYyBnZXRXb3JrdHJlZVJvb3RzKHdvcmtpbmdEaXJlY3Rvcnk6IFVSSSk6IFByb21pc2U8VVJJW10+IHtcblx0XHRyZXR1cm4gdGhpcy5fcGFyc2VXb3JrdHJlZVJvb3RzKGF3YWl0IHRoaXMuX3J1bkdpdCh3b3JraW5nRGlyZWN0b3J5LCBbJ3dvcmt0cmVlJywgJ2xpc3QnLCAnLS1wb3JjZWxhaW4nXSkpO1xuXHR9XG5cblx0cHJpdmF0ZSBfcGFyc2VXb3JrdHJlZVJvb3RzKHBvcmNlbGFpbk91dHB1dDogc3RyaW5nIHwgdW5kZWZpbmVkKTogVVJJW10ge1xuXHRcdGlmICghcG9yY2VsYWluT3V0cHV0KSB7XG5cdFx0XHRyZXR1cm4gW107XG5cdFx0fVxuXHRcdHJldHVybiBwb3JjZWxhaW5PdXRwdXQuc3BsaXQoL1xccj9cXG4vZylcblx0XHRcdC5maWx0ZXIobGluZSA9PiBsaW5lLnN0YXJ0c1dpdGgoJ3dvcmt0cmVlICcpKVxuXHRcdFx0Lm1hcChsaW5lID0+IFVSSS5maWxlKGxpbmUuc3Vic3RyaW5nKCd3b3JrdHJlZSAnLmxlbmd0aCkpKTtcblx0fVxuXG5cdGFzeW5jIGFkZFdvcmt0cmVlKHJlcG9zaXRvcnlSb290OiBVUkksIHdvcmt0cmVlOiBVUkksIGJyYW5jaE5hbWU6IHN0cmluZywgc3RhcnRQb2ludDogc3RyaW5nLCB0cmFjayA9IGZhbHNlLCBvblByb2dyZXNzPzogKHByb2dyZXNzOiBJV29ya3RyZWVGaWxlUHJvZ3Jlc3MpID0+IHZvaWQpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCByZXNvbHZlZFN0YXJ0UG9pbnQgPSBhd2FpdCB0aGlzLl9yZXNvbHZlUmVtb3RlVHJhY2tpbmdCcmFuY2gocmVwb3NpdG9yeVJvb3QsIHN0YXJ0UG9pbnQsIHRyYWNrKSA/PyBzdGFydFBvaW50O1xuXG5cdFx0Y29uc3QgYXJncyA9IFsnLWMnLCAnY2hlY2tvdXQud29ya2Vycz0wJywgJ3dvcmt0cmVlJywgJ2FkZCddO1xuXG5cdFx0aWYgKCF0cmFjaykge1xuXHRcdFx0Ly8gUGFzcyAtLW5vLXRyYWNrIHNvIHRoZSBuZXcgYWdlbnQgYnJhbmNoIG5ldmVyIHBpY2tzIHVwIHVwc3RyZWFtXG5cdFx0XHQvLyB0cmFja2luZyBmcm9tIHRoZSBzdGFydCBwb2ludCAoZS5nLiB3aGVuIHN0YXJ0aW5nIGZyb21cblx0XHRcdC8vICdvcmlnaW4vbWFpbicsIHdpdGhvdXQgLS1uby10cmFjayBnaXQgd291bGQgc2V0IHRoZSBuZXcgYnJhbmNoJ3Ncblx0XHRcdC8vIHVwc3RyZWFtIHRvIG9yaWdpbi9tYWluLCB3aGljaCB3b3VsZCBtaXMtYXR0cmlidXRlIHB1c2hlcy9wdWxscykuXG5cdFx0XHRhcmdzLnB1c2goJy0tbm8tdHJhY2snKTtcblx0XHR9XG5cblx0XHRhcmdzLnB1c2goJy1iJywgYnJhbmNoTmFtZSwgd29ya3RyZWUuZnNQYXRoLCByZXNvbHZlZFN0YXJ0UG9pbnQpO1xuXG5cdFx0Ly8gYGdpdCB3b3JrdHJlZSBhZGRgIGZvcmNlcyBwcm9ncmVzcyByZXBvcnRpbmcgb24gaXRzIGludGVybmFsIGNoZWNrb3V0XG5cdFx0Ly8gZXZlbiB3aGVuIHN0ZGVyciBpcyBhIHBpcGUsIHNvIGBVcGRhdGluZyBmaWxlczogTiUgKHgveSlgIGNhbiBiZVxuXHRcdC8vIHBhcnNlZCBmb3IgbGl2ZSBmZWVkYmFjay4gR0lUX1BST0dSRVNTX0RFTEFZPTAgbGlmdHMgZ2l0J3MgZGVmYXVsdFxuXHRcdC8vIHR3by1zZWNvbmQgc3VwcHJlc3Npb24gc28gdGhlIGZpcnN0IHNhbXBsZSBhcnJpdmVzIGltbWVkaWF0ZWx5LlxuXHRcdGNvbnN0IHByb2dyZXNzUGFyc2VyID0gb25Qcm9ncmVzcyA/IG5ldyBHaXRDaGVja291dFByb2dyZXNzUGFyc2VyKG9uUHJvZ3Jlc3MpIDogdW5kZWZpbmVkO1xuXG5cdFx0YXdhaXQgdGhpcy5fcnVuR2l0KHJlcG9zaXRvcnlSb290LCBhcmdzLCB7XG5cdFx0XHR0aW1lb3V0OiAxODBfMDAwLFxuXHRcdFx0dGhyb3dPbkVycm9yOiB0cnVlLFxuXHRcdFx0Li4uKHByb2dyZXNzUGFyc2VyID8geyBlbnY6IHsgR0lUX1BST0dSRVNTX0RFTEFZOiAnMCcgfSwgb25TdGRlcnI6IGNodW5rID0+IHByb2dyZXNzUGFyc2VyLnB1c2goY2h1bmspIH0gOiB7fSksXG5cdFx0fSk7XG5cdH1cblxuXHRhc3luYyBjb3B5V29ya3RyZWVJbmNsdWRlRmlsZXMocmVwb3NpdG9yeVJvb3Q6IFVSSSwgd29ya3RyZWU6IFVSSSwgZ2xvYnM6IHJlYWRvbmx5IHN0cmluZ1tdLCBvblByb2dyZXNzPzogKHByb2dyZXNzOiBJV29ya3RyZWVGaWxlUHJvZ3Jlc3MpID0+IHZvaWQpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHR0cnkge1xuXHRcdFx0Y29uc3Qgd29ya3RyZWVJbmNsdWRlUGF0aHMgPSBhd2FpdCB0aGlzLl9nZXRXb3JrdHJlZUluY2x1ZGVQYXRocyhyZXBvc2l0b3J5Um9vdCwgd29ya3RyZWUsIGdsb2JzKTtcblx0XHRcdGlmICh3b3JrdHJlZUluY2x1ZGVQYXRocy5sZW5ndGggPT09IDApIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXG5cdFx0XHRjb25zdCBzdGFydFRpbWUgPSBwZXJmb3JtYW5jZS5ub3coKTtcblx0XHRcdGNvbnN0IGxpbWl0ZXIgPSBuZXcgTGltaXRlcjx2b2lkPigxNSk7XG5cdFx0XHRjb25zdCBmaWxlc1RvdGFsID0gd29ya3RyZWVJbmNsdWRlUGF0aHMucmVkdWNlKCh0b3RhbCwgZW50cnkpID0+IHRvdGFsICsgZW50cnkuZmlsZUNvdW50LCAwKTtcblx0XHRcdGxldCBmaWxlc0RvbmUgPSAwO1xuXHRcdFx0Y29uc3QgcmVzdWx0cyA9IGF3YWl0IFByb21pc2UuYWxsU2V0dGxlZCh3b3JrdHJlZUluY2x1ZGVQYXRocy5tYXAoZW50cnkgPT4gbGltaXRlci5xdWV1ZShhc3luYyAoKSA9PiB7XG5cdFx0XHRcdGNvbnN0IHRhcmdldFBhdGggPSBwYXRoLmpvaW4od29ya3RyZWUuZnNQYXRoLCBwYXRoLnJlbGF0aXZlKHJlcG9zaXRvcnlSb290LmZzUGF0aCwgZW50cnkuc291cmNlUGF0aCkpO1xuXHRcdFx0XHRhd2FpdCBmc1Byb21pc2VzLm1rZGlyKHBhdGguZGlybmFtZSh0YXJnZXRQYXRoKSwgeyByZWN1cnNpdmU6IHRydWUgfSk7XG5cdFx0XHRcdGF3YWl0IGNvcHlGaWxlKGVudHJ5LnNvdXJjZVBhdGgsIHRhcmdldFBhdGgsIHsgZm9yY2U6IHRydWUsIHJlY3Vyc2l2ZTogdHJ1ZSwgdmVyYmF0aW1TeW1saW5rczogdHJ1ZSB9KTtcblx0XHRcdFx0ZmlsZXNEb25lICs9IGVudHJ5LmZpbGVDb3VudDtcblx0XHRcdFx0b25Qcm9ncmVzcz8uKHsgZmlsZXNEb25lLCBmaWxlc1RvdGFsIH0pO1xuXHRcdFx0fSkpKTtcblxuXHRcdFx0Y29uc3QgZmFpbGVkT3BlcmF0aW9ucyA9IHJlc3VsdHMuZmlsdGVyKChyZXN1bHQpOiByZXN1bHQgaXMgUHJvbWlzZVJlamVjdGVkUmVzdWx0ID0+IHJlc3VsdC5zdGF0dXMgPT09ICdyZWplY3RlZCcpO1xuXHRcdFx0dGhpcy5fbG9nU2VydmljZS5pbmZvKGBbQWdlbnRIb3N0R2l0U2VydmljZV1bY29weVdvcmt0cmVlSW5jbHVkZUZpbGVzXSBDb3BpZWQgJHt3b3JrdHJlZUluY2x1ZGVQYXRocy5sZW5ndGggLSBmYWlsZWRPcGVyYXRpb25zLmxlbmd0aH0vJHt3b3JrdHJlZUluY2x1ZGVQYXRocy5sZW5ndGh9IGZvbGRlcihzKS9maWxlKHMpIHRvIHdvcmt0cmVlICR7d29ya3RyZWUuZnNQYXRofS4gWyR7KHBlcmZvcm1hbmNlLm5vdygpIC0gc3RhcnRUaW1lKS50b0ZpeGVkKDIpfW1zXWApO1xuXG5cdFx0XHRpZiAoZmFpbGVkT3BlcmF0aW9ucy5sZW5ndGggPiAwKSB7XG5cdFx0XHRcdHRoaXMuX2xvZ1NlcnZpY2Uud2FybihgW0FnZW50SG9zdEdpdFNlcnZpY2VdW2NvcHlXb3JrdHJlZUluY2x1ZGVGaWxlc10gRmFpbGVkIHRvIGNvcHkgJHtmYWlsZWRPcGVyYXRpb25zLmxlbmd0aH0gZm9sZGVyKHMpL2ZpbGUocykgdG8gd29ya3RyZWUgJHt3b3JrdHJlZS5mc1BhdGh9LmApO1xuXHRcdFx0XHRmb3IgKGNvbnN0IGVycm9yIG9mIGZhaWxlZE9wZXJhdGlvbnMpIHtcblx0XHRcdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLndhcm4oYFtBZ2VudEhvc3RHaXRTZXJ2aWNlXVtjb3B5V29ya3RyZWVJbmNsdWRlRmlsZXNdICR7ZXJyb3IucmVhc29ufWApO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fSBjYXRjaCAoZXJyb3IpIHtcblx0XHRcdHRoaXMuX2xvZ1NlcnZpY2Uud2FybihgW0FnZW50SG9zdEdpdFNlcnZpY2VdW2NvcHlXb3JrdHJlZUluY2x1ZGVGaWxlc10gRmFpbGVkIHRvIGNvcHkgZm9sZGVyKHMpL2ZpbGUocykgdG8gd29ya3RyZWUgJHt3b3JrdHJlZS5mc1BhdGh9OiAke2Vycm9yfWApO1xuXHRcdH1cblx0fVxuXG5cdGFzeW5jIGFkZEV4aXN0aW5nV29ya3RyZWUocmVwb3NpdG9yeVJvb3Q6IFVSSSwgd29ya3RyZWU6IFVSSSwgYnJhbmNoTmFtZTogc3RyaW5nKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Ly8gYC1mYCAoZm9yY2UpIHNvIHJlY3JlYXRpb24gc3VjY2VlZHMgZXZlbiB3aGVuIHRoZSB3b3JrdHJlZSBkaXJlY3Rvcnkgd2FzXG5cdFx0Ly8gZGVsZXRlZCBvdXQtb2YtYmFuZCBidXQgZ2l0IHN0aWxsIGhhcyBpdCByZWdpc3RlcmVkIChcIm1pc3NpbmcgYnV0XG5cdFx0Ly8gYWxyZWFkeSByZWdpc3RlcmVkIHdvcmt0cmVlXCIpLiBUaGlzIGlzIG91ciBvd24gbWFuYWdlZCBwZXItc2Vzc2lvblxuXHRcdC8vIHdvcmt0cmVlL2JyYW5jaCwgc28gb3ZlcnJpZGluZyBnaXQncyBzYWZlZ3VhcmRzIGhlcmUgaXMgc2FmZS5cblx0XHRhd2FpdCB0aGlzLl9ydW5HaXQocmVwb3NpdG9yeVJvb3QsIFsnLWMnLCAnY2hlY2tvdXQud29ya2Vycz0wJywgJ3dvcmt0cmVlJywgJ2FkZCcsICctZicsIHdvcmt0cmVlLmZzUGF0aCwgYnJhbmNoTmFtZV0sIHsgdGltZW91dDogMTgwXzAwMCwgdGhyb3dPbkVycm9yOiB0cnVlIH0pO1xuXHR9XG5cblx0LyoqXG5cdCAqIFJlbW92ZXMgYSBzZXNzaW9uJ3MgZ2l0IHdvcmt0cmVlLCB0b2xlcmF0aW5nIHRoZSB0ZWFyZG93biByYWNlIHdoZXJlIGFcblx0ICogY29uY3VycmVudCBnaXQgcHJvY2VzcyBpcyBzdGlsbCBydW5uaW5nIGluc2lkZSBpdC5cblx0ICpcblx0ICogYGdpdCB3b3JrdHJlZSByZW1vdmVgIGRlbGV0ZXMgdGhlIHdvcmtpbmcgdHJlZSBhbmQgdGhlbiB0aGUgYWRtaW4gZGlyZWN0b3J5XG5cdCAqIGAuZ2l0L3dvcmt0cmVlcy88aWQ+YC4gSWYgYW5vdGhlciBnaXQgcHJvY2VzcyAob3VyIG93biBzdGF0dXMvZGlmZiBwcm9iZXMsXG5cdCAqIG9yIHRoZSBhZ2VudCdzIG93biBnaXQpIHJlLWNyZWF0ZWQgYGluZGV4LmxvY2tgIHRoZXJlLCB0aGF0IGxhc3Qgc3RlcCBmYWlsc1xuXHQgKiB3aXRoIFwiRGlyZWN0b3J5IG5vdCBlbXB0eVwiLiBBbmQgYGdpdCB3b3JrdHJlZSBwcnVuZWAgXHUyMDE0IHdoaWNoIHdlIHVzZSB0b1xuXHQgKiBmaW5pc2ggYSBwYXJ0aWFsbHktcmVtb3ZlZCB3b3JrdHJlZSBcdTIwMTQgY2FuIGV2ZW4gZXhpdCAwIHdoaWxlIGZhaWxpbmcgdG9cblx0ICogZGVsZXRlIHRoYXQgZGlyZWN0b3J5LCBzbyBhIHplcm8gZXhpdCBpcyBub3QgcHJvb2Ygb2Ygc3VjY2Vzcy5cblx0ICpcblx0ICogRXhhbXBsZSB0aGUgbG9vcCBiZWxvdyBoYW5kbGVzOlxuXHQgKiBgYGBcblx0ICogICBhdHRlbXB0IDEgIGByZW1vdmVgIGRlbGV0ZXMgdGhlIHRyZWUsIHRoZW4gY2FuJ3Qgcm1kaXIgLmdpdC93b3JrdHJlZXMvPGlkPlxuXHQgKiAgICAgICAgICAgICAgKGEgcHJvYmUncyBpbmRleC5sb2NrIGlzIHN0aWxsIHRoZXJlKSAgICAgICAgICAgICAgICAgIC0+IHRocm93c1xuXHQgKiAgIHdhaXQgfjEwMG1zICB0aGUgcHJvYmUgZmluaXNoZXMgYW5kIHJlbGVhc2VzIGl0cyBsb2NrXG5cdCAqICAgYXR0ZW1wdCAyICB0cmVlIGFscmVhZHkgZ29uZSAtPiBgcHJ1bmVgIGNsZWFycyB0aGUgc3RhbGUgZW50cnlcblx0ICogICAgICAgICAgICAgIC0+IHZlcmlmaWVkIGRlLXJlZ2lzdGVyZWQgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAtPiBkb25lXG5cdCAqIGBgYFxuXHQgKlxuXHQgKiBTbyB3ZTogcmV0cnkgd2l0aCBhIGNhcHBlZCBleHBvbmVudGlhbCBiYWNrb2ZmIHRvIGxldCB0aGUgcmFjaW5nIHByb2Nlc3Ncblx0ICogZmluaXNoOyBzd2l0Y2ggdG8gYHBydW5lYCBvbmNlIHRoZSB3b3JraW5nIHRyZWUgaXMgYWxyZWFkeSBnb25lOyBvbmx5IHJldHJ5XG5cdCAqIHRyYW5zaWVudCBsb2NrIC8gXCJkaXJlY3Rvcnkgbm90IGVtcHR5XCIgZmFpbHVyZXMgKGEgZGlydHktdHJlZSBcInVzZSAtLWZvcmNlXCJcblx0ICogc3RpbGwgZmFpbHMgZmFzdCk7IHRyZWF0IGEgbm9uLXJldHJ5YWJsZSBmYWlsdXJlIGFzIHN1Y2Nlc3Mgd2hlbiBnaXQgbm9cblx0ICogbG9uZ2VyIHRyYWNrcyB0aGUgd29ya3RyZWUgKGlkZW1wb3RlbnQgcmUtcmVtb3ZhbCBvZiBhbiBhbHJlYWR5LXJlbW92ZWQgb3Jcblx0ICogYXJjaGl2ZWQgd29ya3RyZWUpOyBhbmQgdmVyaWZ5IHRoZSB3b3JrdHJlZSBpcyB0cnVseSBkZS1yZWdpc3RlcmVkIGJlZm9yZVxuXHQgKiByZXR1cm5pbmcsIHNvIGEgc2lsZW50IGBwcnVuZWAgbm8tb3AgY2Fubm90IG1hc2sgYSBsZWFrZWQgZW50cnkuXG5cdCAqL1xuXHRhc3luYyByZW1vdmVXb3JrdHJlZShyZXBvc2l0b3J5Um9vdDogVVJJLCB3b3JrdHJlZTogVVJJLCBvcHRpb25zPzogeyByZWFkb25seSBmb3JjZT86IGJvb2xlYW4gfSk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGNvbnN0IHJlbW92ZUFyZ3MgPSBbJ3dvcmt0cmVlJywgJ3JlbW92ZSddO1xuXHRcdGlmIChvcHRpb25zPy5mb3JjZSkge1xuXHRcdFx0cmVtb3ZlQXJncy5wdXNoKCctLWZvcmNlJyk7XG5cdFx0fVxuXHRcdHJlbW92ZUFyZ3MucHVzaCh3b3JrdHJlZS5mc1BhdGgpO1xuXG5cdFx0bGV0IGxhc3RFcnJvcjogdW5rbm93bjtcblx0XHRmb3IgKGxldCBhdHRlbXB0ID0gMDsgYXR0ZW1wdCA8IFdPUktUUkVFX1JFTU9WQUxfTUFYX0FUVEVNUFRTOyBhdHRlbXB0KyspIHtcblx0XHRcdGlmIChhdHRlbXB0ID4gMCkge1xuXHRcdFx0XHRhd2FpdCB0aW1lb3V0KE1hdGgubWluKFdPUktUUkVFX1JFTU9WQUxfUkVUUllfTUFYX0RFTEFZX01TLCBXT1JLVFJFRV9SRU1PVkFMX1JFVFJZX0JBU0VfREVMQVlfTVMgKiAyICoqIChhdHRlbXB0IC0gMSkpKTtcblx0XHRcdH1cblx0XHRcdHRyeSB7XG5cdFx0XHRcdGlmIChhd2FpdCB0aGlzLl9wYXRoRXhpc3RzKHdvcmt0cmVlLmZzUGF0aCkpIHtcblx0XHRcdFx0XHRhd2FpdCB0aGlzLl9ydW5HaXQocmVwb3NpdG9yeVJvb3QsIHJlbW92ZUFyZ3MsIHsgdGltZW91dDogNjBfMDAwLCB0aHJvd09uRXJyb3I6IHRydWUgfSk7XG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0Ly8gV29ya2luZyB0cmVlIGFscmVhZHkgZ29uZSAoYSBwcmlvciBhdHRlbXB0IHJlbW92ZWQgaXQpOiBwcnVuZSBjbGVhcnMgdGhlIHN0YWxlIGFkbWluIGVudHJ5LlxuXHRcdFx0XHRcdGF3YWl0IHRoaXMuX3J1bkdpdChyZXBvc2l0b3J5Um9vdCwgWyd3b3JrdHJlZScsICdwcnVuZSddLCB7IHRpbWVvdXQ6IDYwXzAwMCwgdGhyb3dPbkVycm9yOiB0cnVlIH0pO1xuXHRcdFx0XHR9XG5cdFx0XHRcdC8vIEEgemVybyBleGl0IGlzIG5vdCBwcm9vZiBvZiBzdWNjZXNzIChzZWUgdGhlIGRvYyBhYm92ZSksIHNvIGNvbmZpcm0gZGUtcmVnaXN0cmF0aW9uLlxuXHRcdFx0XHRpZiAoIWF3YWl0IHRoaXMuX2lzV29ya3RyZWVSZWdpc3RlcmVkKHJlcG9zaXRvcnlSb290LCB3b3JrdHJlZSkpIHtcblx0XHRcdFx0XHRyZXR1cm47XG5cdFx0XHRcdH1cblx0XHRcdFx0bGFzdEVycm9yID0gbmV3IEVycm9yKGBnaXQgd29ya3RyZWUgcmVtb3ZhbCBsZWZ0ICcke3dvcmt0cmVlLmZzUGF0aH0nIHJlZ2lzdGVyZWQgKGFkbWluIGRpcmVjdG9yeSBub3QgZGVsZXRlZClgKTtcblx0XHRcdH0gY2F0Y2ggKGVycm9yKSB7XG5cdFx0XHRcdGxhc3RFcnJvciA9IGVycm9yO1xuXHRcdFx0XHRpZiAoIWlzUmV0cnlhYmxlV29ya3RyZWVSZW1vdmFsRXJyb3IoZXJyb3IpKSB7XG5cdFx0XHRcdFx0Ly8gSWRlbXBvdGVudDogaWYgZ2l0IG5vIGxvbmdlciB0cmFja3MgdGhlIHdvcmt0cmVlIHRoZSByZW1vdmFsIGdvYWwgaXMgYWxyZWFkeSBtZXQgKGUuZy4gYW4gYXJjaGl2ZWQgc2Vzc2lvbiByZW1vdmVkIGl0IGVhcmxpZXIpLlxuXHRcdFx0XHRcdGlmICghYXdhaXQgdGhpcy5faXNXb3JrdHJlZVJlZ2lzdGVyZWQocmVwb3NpdG9yeVJvb3QsIHdvcmt0cmVlKSkge1xuXHRcdFx0XHRcdFx0dGhpcy5fbG9nU2VydmljZS50cmFjZShgW2FnZW50SG9zdEdpdFNlcnZpY2VdIHdvcmt0cmVlICcke3dvcmt0cmVlLmZzUGF0aH0nIGFscmVhZHkgZGUtcmVnaXN0ZXJlZDsgdHJlYXRpbmcgcmVtb3ZhbCBhcyBjb21wbGV0ZWApO1xuXHRcdFx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHR0aHJvdyBlcnJvcjtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdFx0aWYgKGF0dGVtcHQgPCBXT1JLVFJFRV9SRU1PVkFMX01BWF9BVFRFTVBUUyAtIDEpIHtcblx0XHRcdFx0dGhpcy5fbG9nU2VydmljZS53YXJuKGBbYWdlbnRIb3N0R2l0U2VydmljZV0gd29ya3RyZWUgcmVtb3ZhbCBhdHRlbXB0ICR7YXR0ZW1wdCArIDF9LyR7V09SS1RSRUVfUkVNT1ZBTF9NQVhfQVRURU1QVFN9IGRpZCBub3QgY29tcGxldGUgZm9yICcke3dvcmt0cmVlLmZzUGF0aH0nLCByZXRyeWluZzogJHtsYXN0RXJyb3IgaW5zdGFuY2VvZiBFcnJvciA/IGxhc3RFcnJvci5tZXNzYWdlIDogU3RyaW5nKGxhc3RFcnJvcil9YCk7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdHRocm93IGxhc3RFcnJvcjtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgX3BhdGhFeGlzdHMoZnNQYXRoOiBzdHJpbmcpOiBQcm9taXNlPGJvb2xlYW4+IHtcblx0XHR0cnkge1xuXHRcdFx0YXdhaXQgZnNQcm9taXNlcy5hY2Nlc3MoZnNQYXRoKTtcblx0XHRcdHJldHVybiB0cnVlO1xuXHRcdH0gY2F0Y2ggKGVycm9yKSB7XG5cdFx0XHQvLyBPbmx5IGEgZGVmaW5pdGl2ZSBcIm5vdCBmb3VuZFwiIG1lYW5zIHRoZSBwYXRoIGlzIGdvbmUuIFRyZWF0IGFueVxuXHRcdFx0Ly8gb3RoZXIgZXJyb3IgKGUuZy4gRUFDQ0VTL0VQRVJNKSBhcyBcImV4aXN0c1wiIHNvIHdlIGRvbid0IHdyb25nbHlcblx0XHRcdC8vIHRha2UgdGhlIHBydW5lIHBhdGggZm9yIGEgc3RpbGwtcHJlc2VudCB3b3JrdHJlZS5cblx0XHRcdHJldHVybiAoZXJyb3IgYXMgTm9kZUpTLkVycm5vRXhjZXB0aW9uKT8uY29kZSAhPT0gJ0VOT0VOVCc7XG5cdFx0fVxuXHR9XG5cblx0LyoqXG5cdCAqIFdoZXRoZXIgYHdvcmt0cmVlYCBpcyBzdGlsbCByZWdpc3RlcmVkIHdpdGggZ2l0IChpdHMgYWRtaW4gZW50cnkgc3Vydml2ZXMpLlxuXHQgKiBGYWlscyBjbG9zZWQgKHJldHVybnMgYHRydWVgKSBpZiB0aGUgcmVnaXN0cnkgY2Fubm90IGJlIHJlYWQsIHNvIGFuIHVucmVsYXRlZFxuXHQgKiBgZ2l0IHdvcmt0cmVlIGxpc3RgIGZhaWx1cmUgaXMgbmV2ZXIgbWlzdGFrZW4gZm9yIGEgY29tcGxldGVkIHJlbW92YWwuXG5cdCAqL1xuXHRwcml2YXRlIGFzeW5jIF9pc1dvcmt0cmVlUmVnaXN0ZXJlZChyZXBvc2l0b3J5Um9vdDogVVJJLCB3b3JrdHJlZTogVVJJKTogUHJvbWlzZTxib29sZWFuPiB7XG5cdFx0bGV0IHJlZ2lzdGVyZWQ6IFVSSVtdO1xuXHRcdHRyeSB7XG5cdFx0XHRyZWdpc3RlcmVkID0gdGhpcy5fcGFyc2VXb3JrdHJlZVJvb3RzKGF3YWl0IHRoaXMuX3J1bkdpdChyZXBvc2l0b3J5Um9vdCwgWyd3b3JrdHJlZScsICdsaXN0JywgJy0tcG9yY2VsYWluJ10sIHsgdGhyb3dPbkVycm9yOiB0cnVlIH0pKTtcblx0XHR9IGNhdGNoIHtcblx0XHRcdHJldHVybiB0cnVlO1xuXHRcdH1cblx0XHRpZiAocmVnaXN0ZXJlZC5sZW5ndGggPT09IDApIHtcblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cdFx0Y29uc3QgdGFyZ2V0ID0gYXdhaXQgdGhpcy5fY2Fub25pY2FsaXplV29ya3RyZWVQYXRoKHdvcmt0cmVlKTtcblx0XHQvLyBDaGVjayBldmVyeSByZWdpc3RlcmVkIHdvcmt0cmVlIGluIHBhcmFsbGVsIGFuZCByZXNvbHZlIGFzIHNvb24gYXMgb25lIG1hdGNoZXMuXG5cdFx0Y29uc3QgbWF0Y2hlZCA9IGF3YWl0IGZpcnN0UGFyYWxsZWwoXG5cdFx0XHRyZWdpc3RlcmVkLm1hcChhc3luYyBlbnRyeSA9PlxuXHRcdFx0XHRleHRVcmlCaWFzZWRJZ25vcmVQYXRoQ2FzZS5pc0VxdWFsKGVudHJ5LCB3b3JrdHJlZSlcblx0XHRcdFx0fHwgZXh0VXJpQmlhc2VkSWdub3JlUGF0aENhc2UuaXNFcXVhbChhd2FpdCB0aGlzLl9jYW5vbmljYWxpemVXb3JrdHJlZVBhdGgoZW50cnkpLCB0YXJnZXQpKSxcblx0XHRcdGlzTWF0Y2ggPT4gaXNNYXRjaCxcblx0XHRcdGZhbHNlLFxuXHRcdCk7XG5cdFx0cmV0dXJuIG1hdGNoZWQgPz8gZmFsc2U7XG5cdH1cblxuXHQvKipcblx0ICogUmVzb2x2ZXMgc3ltbGlua3Mgb24gdGhlIHdvcmt0cmVlJ3MgcGFyZW50ICh3aGljaCBwZXJzaXN0cyBldmVuIGFmdGVyIHRoZVxuXHQgKiB3b3JrdHJlZSBkaXJlY3RvcnkgaXRzZWxmIGlzIGRlbGV0ZWQpIHNvIGEgcGF0aCB3ZSBwYXNzZWQgdG8gZ2l0IChlLmcuXG5cdCAqIGAvdmFyLy4uLmApIG1hdGNoZXMgdGhlIHJlYWxwYXRoJ2QgZm9ybSBnaXQgcmVwb3J0cyAoYC9wcml2YXRlL3Zhci8uLi5gKS5cblx0ICovXG5cdHByaXZhdGUgYXN5bmMgX2Nhbm9uaWNhbGl6ZVdvcmt0cmVlUGF0aCh3b3JrdHJlZTogVVJJKTogUHJvbWlzZTxVUkk+IHtcblx0XHR0cnkge1xuXHRcdFx0Y29uc3QgcGFyZW50UmVhbCA9IGF3YWl0IGZzUHJvbWlzZXMucmVhbHBhdGgocGF0aC5kaXJuYW1lKHdvcmt0cmVlLmZzUGF0aCkpO1xuXHRcdFx0cmV0dXJuIFVSSS5maWxlKHBhdGguam9pbihwYXJlbnRSZWFsLCBwYXRoLmJhc2VuYW1lKHdvcmt0cmVlLmZzUGF0aCkpKTtcblx0XHR9IGNhdGNoIHtcblx0XHRcdHJldHVybiB3b3JrdHJlZTtcblx0XHR9XG5cdH1cblxuXHRhc3luYyBicmFuY2hFeGlzdHMocmVwb3NpdG9yeVJvb3Q6IFVSSSwgYnJhbmNoTmFtZTogc3RyaW5nKTogUHJvbWlzZTxib29sZWFuPiB7XG5cdFx0Ly8gYHNob3ctcmVmIC0tdmVyaWZ5IC0tcXVpZXRgIGV4aXRzIDAgd2hlbiB0aGUgcmVmIGV4aXN0cyBhbmQgMSBvdGhlcndpc2UuXG5cdFx0Ly8gYF9ydW5HaXRgIHJldHVybnMgdW5kZWZpbmVkIG9uIG5vbi16ZXJvIGV4aXQsIHNvIGAhPT0gdW5kZWZpbmVkYCBpcyB0aGUgZXhpc3RlbmNlIHNpZ25hbC5cblx0XHRjb25zdCBvdXRwdXQgPSBhd2FpdCB0aGlzLl9ydW5HaXQocmVwb3NpdG9yeVJvb3QsIFsnc2hvdy1yZWYnLCAnLS12ZXJpZnknLCAnLS1xdWlldCcsIGByZWZzL2hlYWRzLyR7YnJhbmNoTmFtZX1gXSk7XG5cdFx0cmV0dXJuIG91dHB1dCAhPT0gdW5kZWZpbmVkO1xuXHR9XG5cblx0YXN5bmMgaGFzVW5jb21taXR0ZWRDaGFuZ2VzKHdvcmtpbmdEaXJlY3Rvcnk6IFVSSSk6IFByb21pc2U8Ym9vbGVhbj4ge1xuXHRcdGNvbnN0IG91dHB1dCA9IGF3YWl0IHRoaXMuX3J1bkdpdFN0YXR1cyh3b3JraW5nRGlyZWN0b3J5LCBbJy0tcG9yY2VsYWluJ10pO1xuXHRcdHJldHVybiAhIW91dHB1dCAmJiBvdXRwdXQudHJpbSgpLmxlbmd0aCA+IDA7XG5cdH1cblxuXHRhc3luYyBjb21taXRBbGwod29ya2luZ0RpcmVjdG9yeTogVVJJLCBtZXNzYWdlOiBzdHJpbmcpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRhd2FpdCB0aGlzLl9ydW5HaXQod29ya2luZ0RpcmVjdG9yeSwgWydhZGQnLCAnLUEnLCAnLS0nLCAnOi8nXSwgeyB0aHJvd09uRXJyb3I6IHRydWUgfSk7XG5cdFx0YXdhaXQgdGhpcy5fcnVuR2l0KHdvcmtpbmdEaXJlY3RvcnksIFsnY29tbWl0JywgJy0tbm8tdmVyaWZ5JywgJy1tJywgbWVzc2FnZV0sIHsgdGltZW91dDogNjBfMDAwLCB0aHJvd09uRXJyb3I6IHRydWUgfSk7XG5cdH1cblxuXHRhc3luYyBtZXJnZUJyYW5jaCh3b3JraW5nRGlyZWN0b3J5OiBVUkksIGJyYW5jaE5hbWU6IHN0cmluZyk6IFByb21pc2U8c3RyaW5nPiB7XG5cdFx0Y29uc3QgZXhpc3RpbmdNZXJnZUhlYWQgPSBhd2FpdCB0aGlzLl9ydW5HaXQod29ya2luZ0RpcmVjdG9yeSwgWydyZXYtcGFyc2UnLCAnLS12ZXJpZnknLCAnLS1xdWlldCcsICdNRVJHRV9IRUFEJ10pO1xuXHRcdGlmIChleGlzdGluZ01lcmdlSGVhZCkge1xuXHRcdFx0dGhyb3cgbmV3IEVycm9yKGBDYW5ub3QgbWVyZ2UgJyR7YnJhbmNoTmFtZX0nIGJlY2F1c2UgYW5vdGhlciBtZXJnZSBpcyBhbHJlYWR5IGluIHByb2dyZXNzLmApO1xuXHRcdH1cblx0XHR0cnkge1xuXHRcdFx0cmV0dXJuIChhd2FpdCB0aGlzLl9ydW5HaXQod29ya2luZ0RpcmVjdG9yeSwgWydtZXJnZScsICctLW5vLWVkaXQnLCAnLS0nLCBicmFuY2hOYW1lXSwgeyB0aW1lb3V0OiA2MF8wMDAsIHRocm93T25FcnJvcjogdHJ1ZSB9KSk/LnRyaW0oKSA/PyAnJztcblx0XHR9IGNhdGNoIChlcnJvcikge1xuXHRcdFx0Y29uc3QgbWVyZ2VIZWFkID0gYXdhaXQgdGhpcy5fcnVuR2l0KHdvcmtpbmdEaXJlY3RvcnksIFsncmV2LXBhcnNlJywgJy0tdmVyaWZ5JywgJy0tcXVpZXQnLCAnTUVSR0VfSEVBRCddKTtcblx0XHRcdGlmIChtZXJnZUhlYWQpIHtcblx0XHRcdFx0dHJ5IHtcblx0XHRcdFx0XHRhd2FpdCB0aGlzLl9ydW5HaXQod29ya2luZ0RpcmVjdG9yeSwgWydtZXJnZScsICctLWFib3J0J10sIHsgdGltZW91dDogNjBfMDAwLCB0aHJvd09uRXJyb3I6IHRydWUgfSk7XG5cdFx0XHRcdH0gY2F0Y2ggKGFib3J0RXJyb3IpIHtcblx0XHRcdFx0XHRjb25zdCBtZXJnZU1lc3NhZ2UgPSBlcnJvciBpbnN0YW5jZW9mIEVycm9yID8gZXJyb3IubWVzc2FnZSA6IFN0cmluZyhlcnJvcik7XG5cdFx0XHRcdFx0Y29uc3QgYWJvcnRNZXNzYWdlID0gYWJvcnRFcnJvciBpbnN0YW5jZW9mIEVycm9yID8gYWJvcnRFcnJvci5tZXNzYWdlIDogU3RyaW5nKGFib3J0RXJyb3IpO1xuXHRcdFx0XHRcdHRocm93IG5ldyBFcnJvcihgTWVyZ2UgZmFpbGVkIGFuZCBjb3VsZCBub3QgYmUgYWJvcnRlZDogJHttZXJnZU1lc3NhZ2V9OyAke2Fib3J0TWVzc2FnZX1gLCB7IGNhdXNlOiBlcnJvciB9KTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdFx0dGhyb3cgZXJyb3I7XG5cdFx0fVxuXHR9XG5cblx0YXN5bmMgcmVzdG9yZSh3b3JraW5nRGlyZWN0b3J5OiBVUkksIHBhdGhzOiByZWFkb25seSBzdHJpbmdbXSwgb3B0aW9ucz86IHsgcmVhZG9ubHkgc3RhZ2VkPzogYm9vbGVhbjsgcmVhZG9ubHkgcmVmPzogc3RyaW5nIH0pOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCBhcmdzID0gWydyZXN0b3JlJ107XG5cblx0XHRpZiAob3B0aW9ucz8uc3RhZ2VkKSB7XG5cdFx0XHRhcmdzLnB1c2goJy0tc3RhZ2VkJyk7XG5cdFx0fVxuXG5cdFx0aWYgKG9wdGlvbnM/LnJlZikge1xuXHRcdFx0YXJncy5wdXNoKCctLXNvdXJjZScsIG9wdGlvbnMucmVmKTtcblx0XHR9XG5cblx0XHRpZiAocGF0aHMubGVuZ3RoID09PSAwKSB7XG5cdFx0XHRwYXRocyA9IFsnLiddO1xuXHRcdH1cblxuXHRcdGF3YWl0IHRoaXMuX3J1bkdpdCh3b3JraW5nRGlyZWN0b3J5LCBbLi4uYXJncywgJy0tJywgLi4ucGF0aHNdLCB7IHRocm93T25FcnJvcjogdHJ1ZSB9KTtcblx0fVxuXG5cdGFzeW5jIGhhc1Vwc3RyZWFtKHdvcmtpbmdEaXJlY3Rvcnk6IFVSSSwgYnJhbmNoTmFtZTogc3RyaW5nKTogUHJvbWlzZTxib29sZWFuPiB7XG5cdFx0Y29uc3Qgb3V0cHV0ID0gYXdhaXQgdGhpcy5fcnVuR2l0KHdvcmtpbmdEaXJlY3RvcnksIFsncmV2LXBhcnNlJywgJy0tYWJicmV2LXJlZicsIGAke2JyYW5jaE5hbWV9QHt1cHN0cmVhbX1gXSk7XG5cdFx0cmV0dXJuIG91dHB1dCAhPT0gdW5kZWZpbmVkICYmIG91dHB1dC50cmltKCkubGVuZ3RoID4gMDtcblx0fVxuXG5cdGFzeW5jIHB1bGwod29ya2luZ0RpcmVjdG9yeTogVVJJLCBvcHRpb25zPzogSVB1bGxPcHRpb25zKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3QgYXJncyA9IFsncHVsbCddO1xuXG5cdFx0aWYgKG9wdGlvbnM/LnJlYmFzZSkge1xuXHRcdFx0YXJncy5wdXNoKCctcicpO1xuXHRcdH1cblxuXHRcdC8vIEEgcmVmIGNhbiBvbmx5IGJlIHBhc3NlZCBhbG9uZ3NpZGUgYVxuXHRcdC8vIHJlbW90ZTsgZGVmYXVsdCB0byBgb3JpZ2luYCB3aGVuIGEgcmVmXG5cdFx0Ly8gaXMgZ2l2ZW4gd2l0aG91dCBvbmUuXG5cdFx0aWYgKG9wdGlvbnM/LnJlbW90ZSB8fCBvcHRpb25zPy5yZWYpIHtcblx0XHRcdGFyZ3MucHVzaChvcHRpb25zLnJlbW90ZSA/PyAnb3JpZ2luJyk7XG5cblx0XHRcdGlmIChvcHRpb25zLnJlZikge1xuXHRcdFx0XHRhcmdzLnB1c2gob3B0aW9ucy5yZWYpO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdGF3YWl0IHRoaXMuX3J1bkdpdCh3b3JraW5nRGlyZWN0b3J5LCBhcmdzLCB7IHRpbWVvdXQ6IDE4MF8wMDAsIHRocm93T25FcnJvcjogdHJ1ZSB9KTtcblx0fVxuXG5cdGFzeW5jIHB1c2god29ya2luZ0RpcmVjdG9yeTogVVJJLCBvcHRpb25zPzogSVB1c2hPcHRpb25zKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3QgYXJncyA9IFsncHVzaCddO1xuXG5cdFx0aWYgKG9wdGlvbnM/LnNldFVwc3RyZWFtKSB7XG5cdFx0XHRhcmdzLnB1c2goJy0tc2V0LXVwc3RyZWFtJyk7XG5cdFx0fVxuXG5cdFx0Ly8gQSByZWYgY2FuIG9ubHkgYmUgcGFzc2VkIGFsb25nc2lkZSBhXG5cdFx0Ly8gcmVtb3RlOyBkZWZhdWx0IHRvIGBvcmlnaW5gIHdoZW4gYSByZWZcblx0XHQvLyBpcyBnaXZlbiB3aXRob3V0IG9uZS5cblx0XHRpZiAob3B0aW9ucz8ucmVtb3RlIHx8IG9wdGlvbnM/LnJlZikge1xuXHRcdFx0YXJncy5wdXNoKG9wdGlvbnMucmVtb3RlID8/ICdvcmlnaW4nKTtcblxuXHRcdFx0aWYgKG9wdGlvbnMucmVmKSB7XG5cdFx0XHRcdGFyZ3MucHVzaChvcHRpb25zLnJlZik7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0YXdhaXQgdGhpcy5fcnVuR2l0KHdvcmtpbmdEaXJlY3RvcnksIGFyZ3MsIHsgdGltZW91dDogMTgwXzAwMCwgdGhyb3dPbkVycm9yOiB0cnVlIH0pO1xuXHR9XG5cblx0YXN5bmMgY29tcHV0ZVNlc3Npb25GaWxlRGlmZnMod29ya2luZ0RpcmVjdG9yeTogVVJJLCBvcHRpb25zOiBJQ29tcHV0ZVNlc3Npb25GaWxlRGlmZnNPcHRpb25zKTogUHJvbWlzZTxyZWFkb25seSBJU2Vzc2lvbkZpbGVEaWZmW10gfCB1bmRlZmluZWQ+IHtcblx0XHQvLyBBbGwgZ2l0IGludm9jYXRpb25zIHJ1biBmcm9tIHRoZSB3b3JraW5nIHRyZWUncyByZXBvc2l0b3J5IHJvb3Qgc29cblx0XHQvLyBgLS1yYXdgIHBhdGhzIGFyZSByZXBvLXJlbGF0aXZlIFx1MjAxNCB0aGF0J3Mgd2hhdCBgZ2l0IHNob3cgPHNoYT46PHBhdGg+YFxuXHRcdC8vIGV4cGVjdHMgd2hlbiB3ZSByZXNvbHZlIGBnaXQtYmxvYjpgIFVSSXMgbGF0ZXIuXG5cdFx0Y29uc3QgcmVwb3NpdG9yeVJvb3QgPSBhd2FpdCB0aGlzLmdldFJlcG9zaXRvcnlSb290KHdvcmtpbmdEaXJlY3RvcnkpO1xuXHRcdGlmICghcmVwb3NpdG9yeVJvb3QpIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXG5cdFx0Ly8gUmVzb2x2ZSB0aGUgbWVyZ2UtYmFzZSBjb21taXQgdGhlIEJyYW5jaCBDaGFuZ2VzIGRpZmYgaXMgYW5jaG9yZWQgb24uXG5cdFx0Y29uc3QgbWVyZ2VCYXNlQ29tbWl0ID0gYXdhaXQgdGhpcy5fcmVzb2x2ZUJyYW5jaE1lcmdlQmFzZUNvbW1pdChyZXBvc2l0b3J5Um9vdCwgb3B0aW9ucy5iYXNlQnJhbmNoKTtcblxuXHRcdC8vIERldGVjdCB3aGV0aGVyIHRoZSB3b3JraW5nIHRyZWUgaGFzIGFueSB1bnRyYWNrZWQgZmlsZXMuIElmIHNvIHdlXG5cdFx0Ly8gaGF2ZSB0byB1c2UgdGhlIHRlbXAtaW5kZXggdHJpY2sgc28gdGhlIHVudHJhY2tlZCBjb250ZW50IGlzXG5cdFx0Ly8gaW5jbHVkZWQgaW4gYC0tY2FjaGVkIC0tcmF3YCBvdXRwdXQ7IG90aGVyd2lzZSBhIHBsYWluIGBnaXQgZGlmZmBcblx0XHQvLyBpcyBzdWZmaWNpZW50IGFuZCBhdm9pZHMgdGhlIHRlbXAtZGlyIG92ZXJoZWFkLlxuXHRcdGNvbnN0IHN0YXR1c091dCA9IGF3YWl0IHRoaXMuX3J1bkdpdFN0YXR1cyhyZXBvc2l0b3J5Um9vdCwgWyctLXBvcmNlbGFpbj12MScsICcteicsICctLXVudHJhY2tlZC1maWxlcz1hbGwnXSk7XG5cdFx0aWYgKHN0YXR1c091dCA9PT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblx0XHRjb25zdCBoYXNVbnRyYWNrZWQgPSBwYXJzZVVudHJhY2tlZFBhdGhzKHN0YXR1c091dCkubGVuZ3RoID4gMDtcblxuXHRcdGxldCByYXdEaWZmT3V0cHV0OiBzdHJpbmcgfCB1bmRlZmluZWQ7XG5cdFx0aWYgKCFoYXNVbnRyYWNrZWQpIHtcblx0XHRcdHJhd0RpZmZPdXRwdXQgPSBhd2FpdCB0aGlzLl9ydW5HaXQocmVwb3NpdG9yeVJvb3QsIFsnZGlmZicsICctLXJhdycsICctLW51bXN0YXQnLCAnLS1kaWZmLWZpbHRlcj1BRE1SJywgJy16JywgbWVyZ2VCYXNlQ29tbWl0LCAnLS0nXSk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdGNvbnN0IGNoYW5nZWRQYXRocyA9IHBhcnNlQ2hhbmdlZFBhdGhzKHN0YXR1c091dCk7XG5cdFx0XHRyYXdEaWZmT3V0cHV0ID0gYXdhaXQgdGhpcy5fcnVuV2l0aFRlbXBJbmRleChyZXBvc2l0b3J5Um9vdCwgbWVyZ2VCYXNlQ29tbWl0LCBjaGFuZ2VkUGF0aHMpO1xuXHRcdH1cblxuXHRcdGlmIChyYXdEaWZmT3V0cHV0ID09PSB1bmRlZmluZWQpIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHBhcnNlR2l0RGlmZlJhd051bXN0YXQocmF3RGlmZk91dHB1dCwgcmVwb3NpdG9yeVJvb3QsIG9wdGlvbnMuc2Vzc2lvblVyaSwgbWVyZ2VCYXNlQ29tbWl0KTtcblx0fVxuXG5cdGFzeW5jIHJlc29sdmVCcmFuY2hCYXNlbGluZUNvbW1pdCh3b3JraW5nRGlyZWN0b3J5OiBVUkksIGJhc2VCcmFuY2g/OiBzdHJpbmcpOiBQcm9taXNlPHN0cmluZyB8IHVuZGVmaW5lZD4ge1xuXHRcdGNvbnN0IHJlcG9zaXRvcnlSb290ID0gYXdhaXQgdGhpcy5nZXRSZXBvc2l0b3J5Um9vdCh3b3JraW5nRGlyZWN0b3J5KTtcblx0XHRpZiAoIXJlcG9zaXRvcnlSb290KSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblxuXHRcdHJldHVybiB0aGlzLl9yZXNvbHZlQnJhbmNoTWVyZ2VCYXNlQ29tbWl0KHJlcG9zaXRvcnlSb290LCBiYXNlQnJhbmNoKTtcblx0fVxuXG5cdC8qKlxuXHQgKiBSZXNvbHZlcyB0aGUgbWVyZ2UtYmFzZSBjb21taXQtaXNoIHRoZSBCcmFuY2ggQ2hhbmdlcyBiYXNlbGluZSBpcyBhbmNob3JlZFxuXHQgKiBvbi4gV2l0aCBhIGJhc2UgYnJhbmNoLCBwcmVmZXJzIHRoZSBjb3JyZXNwb25kaW5nIGBvcmlnaW4vPGJhc2U+YFxuXHQgKiByZW1vdGUtdHJhY2tpbmcgcmVmIHdoZW4gaXQgZXhpc3RzIHNvIGJyYW5jaCBjaGFuZ2VzIG1hdGNoIGEgUFItc3R5bGVcblx0ICogY29tcGFyaXNvbiBldmVuIGlmIHRoZSBsb2NhbCBiYXNlIGJyYW5jaCBpcyBzdGFsZS4gV2l0aG91dCBhIHVzYWJsZSBiYXNlLFxuXHQgKiBmYWxscyBiYWNrIHRvIGBIRUFEYCAoc3VyZmFjZXMgdW5jb21taXR0ZWQgd29yayBidXQgbm8gY29tbWl0dGVkLW9uLWJyYW5jaFxuXHQgKiB3b3JrKS4gRm9yIGVtcHR5IHJlcG9zIHdpdGggbm8gYEhFQURgLCBmYWxscyBiYWNrIHRvIHRoZSBlbXB0eS10cmVlIG9iamVjdC5cblx0ICogQWx3YXlzIHJlc29sdmVzIHRvIGEgY29tbWl0LWlzaCAobmV2ZXIgYHVuZGVmaW5lZGApIG9uY2UgdGhlIHJlcG9zaXRvcnlcblx0ICogcm9vdCBpcyBrbm93bi5cblx0ICovXG5cdHByaXZhdGUgYXN5bmMgX3Jlc29sdmVCcmFuY2hNZXJnZUJhc2VDb21taXQocmVwb3NpdG9yeVJvb3Q6IFVSSSwgYmFzZUJyYW5jaD86IHN0cmluZyk6IFByb21pc2U8c3RyaW5nPiB7XG5cdFx0bGV0IG1lcmdlQmFzZUNvbW1pdDogc3RyaW5nIHwgdW5kZWZpbmVkO1xuXHRcdGlmIChiYXNlQnJhbmNoKSB7XG5cdFx0XHRjb25zdCByZXNvbHZlZEJhc2UgPSBhd2FpdCB0aGlzLl9yZXNvbHZlUmVtb3RlVHJhY2tpbmdCcmFuY2gocmVwb3NpdG9yeVJvb3QsIGJhc2VCcmFuY2gpID8/IGJhc2VCcmFuY2g7XG5cdFx0XHRtZXJnZUJhc2VDb21taXQgPSAoYXdhaXQgdGhpcy5fcnVuR2l0KHJlcG9zaXRvcnlSb290LCBbJ21lcmdlLWJhc2UnLCAnSEVBRCcsIHJlc29sdmVkQmFzZV0pKT8udHJpbSgpO1xuXHRcdH1cblx0XHRpZiAoIW1lcmdlQmFzZUNvbW1pdCkge1xuXHRcdFx0bWVyZ2VCYXNlQ29tbWl0ID0gKGF3YWl0IHRoaXMuX3J1bkdpdChyZXBvc2l0b3J5Um9vdCwgWydyZXYtcGFyc2UnLCAnSEVBRCddKSk/LnRyaW0oKTtcblx0XHR9XG5cblx0XHRyZXR1cm4gbWVyZ2VCYXNlQ29tbWl0ID8/IEVNUFRZX1RSRUVfT0JKRUNUO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBfcnVuV2l0aFRlbXBJbmRleChyZXBvc2l0b3J5Um9vdDogVVJJLCBtZXJnZUJhc2VDb21taXQ6IHN0cmluZywgY2hhbmdlZFBhdGhzOiByZWFkb25seSBzdHJpbmdbXSk6IFByb21pc2U8c3RyaW5nIHwgdW5kZWZpbmVkPiB7XG5cdFx0Ly8gQnVpbGQgYSB0aHJvd2F3YXkgaW5kZXggc28gd2UgY2FuIHN0YWdlIHRoZSBjaGFuZ2VkIHdvcmtpbmcgdHJlZVxuXHRcdC8vIHBhdGhzIChpbmNsdWRpbmcgdW50cmFja2VkIGZpbGVzKSB3aXRob3V0IGRpc3R1cmJpbmcgdGhlIHVzZXIncyByZWFsXG5cdFx0Ly8gaW5kZXguIGByZWFkLXRyZWUgSEVBRGAgc2VlZHMgaXQ7IGluIGVtcHR5IHJlcG9zIHRoYXQgZmFpbHMgc28gd2Vcblx0XHQvLyBmYWxsIGJhY2sgdG8gdGhlIGVtcHR5IHRyZWUsIGxlYXZpbmcgZXZlcnl0aGluZyBhcyBcImFkZGVkXCIuXG5cdFx0Y29uc3QgdGVtcERpciA9IFVSSS5qb2luUGF0aCh0aGlzLl9lbnZpcm9ubWVudFNlcnZpY2UudG1wRGlyLCBgYWdlbnQtaG9zdC1naXQtZGlmZi0ke2dlbmVyYXRlVXVpZCgpfWApO1xuXHRcdGF3YWl0IHRoaXMuX2ZpbGVTZXJ2aWNlLmNyZWF0ZUZvbGRlcih0ZW1wRGlyKTtcblx0XHQvLyBgR0lUX0lOREVYX0ZJTEVgIGlzIGNvbnN1bWVkIGJ5IHRoZSBgZ2l0YCBzdWJwcm9jZXNzIHNvIGl0IG11c3QgYmVcblx0XHQvLyBhIHJlYWwgT1MgcGF0aCBzdHJpbmcsIG5vdCBhIFVSSS5cblx0XHRjb25zdCBpbmRleEZpbGUgPSBVUkkuam9pblBhdGgodGVtcERpciwgJ2luZGV4JykuZnNQYXRoO1xuXHRcdGNvbnN0IGVudjogUmVjb3JkPHN0cmluZywgc3RyaW5nPiA9IHsgR0lUX0lOREVYX0ZJTEU6IGluZGV4RmlsZSB9O1xuXHRcdC8vIEdWRlMgKFZpcnR1YWwgRmlsZSBTeXN0ZW0pIHJlcG9zIHVzZSBhIGhvb2sgdGhhdCBhY3F1aXJlcyBhIGxvY2sgYXJvdW5kXG5cdFx0Ly8gZ2l0IGNvbW1hbmRzLiBTZXR0aW5nIENPTU1BTkRfSE9PS19MT0NLPTEgcHJldmVudHMgdGhlIHRlbXAtaW5kZXhcblx0XHQvLyBvcGVyYXRpb25zIGZyb20gYmxvY2tpbmcgdGhlIG1haW4gd29ya2luZy10cmVlIGxvY2suIFRoaXMgbWlycm9ycyB3aGF0XG5cdFx0Ly8gdGhlIGV4dGVuc2lvbidzIGBidWlsZFRlbXBJbmRleEVudmAgZG9lcyBmb3IgdGhlIHNhbWUgcmVhc29uLlxuXHRcdGVudi5DT01NQU5EX0hPT0tfTE9DSyA9ICcxJztcblx0XHR0cnkge1xuXHRcdFx0Y29uc3Qgc2VlZGVkID0gYXdhaXQgdGhpcy5fcnVuR2l0KHJlcG9zaXRvcnlSb290LCBbJ3JlYWQtdHJlZScsICdIRUFEJ10sIHsgZW52IH0pO1xuXHRcdFx0aWYgKHNlZWRlZCA9PT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRcdC8vIEVtcHR5IHJlcG8gKG5vIEhFQUQgeWV0KSAtIGByZWFkLXRyZWVgIG9mIHRoZSBlbXB0eSB0cmVlIGFsd2F5cyBzdWNjZWVkcy5cblx0XHRcdFx0YXdhaXQgdGhpcy5fcnVuR2l0KHJlcG9zaXRvcnlSb290LCBbJ3JlYWQtdHJlZScsIEVNUFRZX1RSRUVfT0JKRUNUXSwgeyBlbnYgfSk7XG5cdFx0XHR9XG5cdFx0XHRpZiAoIShhd2FpdCB0aGlzLl9zdGFnZUNoYW5nZWRQYXRocyhyZXBvc2l0b3J5Um9vdCwgdGVtcERpciwgY2hhbmdlZFBhdGhzLCBlbnYpKSkge1xuXHRcdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdFx0fVxuXHRcdFx0cmV0dXJuIGF3YWl0IHRoaXMuX3J1bkdpdChyZXBvc2l0b3J5Um9vdCwgWydkaWZmJywgJy0tY2FjaGVkJywgJy0tcmF3JywgJy0tbnVtc3RhdCcsICctLWRpZmYtZmlsdGVyPUFETVInLCAnLXonLCBtZXJnZUJhc2VDb21taXQsICctLSddLCB7IGVudiB9KTtcblx0XHR9IGZpbmFsbHkge1xuXHRcdFx0dHJ5IHsgYXdhaXQgdGhpcy5fZmlsZVNlcnZpY2UuZGVsKHRlbXBEaXIsIHsgcmVjdXJzaXZlOiB0cnVlLCB1c2VUcmFzaDogZmFsc2UgfSk7IH0gY2F0Y2ggeyAvKiBiZXN0LWVmZm9ydCAqLyB9XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBfc3RhZ2VDaGFuZ2VkUGF0aHMocmVwb3NpdG9yeVJvb3Q6IFVSSSwgdGVtcERpcjogVVJJLCBjaGFuZ2VkUGF0aHM6IHJlYWRvbmx5IHN0cmluZ1tdLCBlbnY6IFJlY29yZDxzdHJpbmcsIHN0cmluZz4pOiBQcm9taXNlPGJvb2xlYW4+IHtcblx0XHRpZiAoY2hhbmdlZFBhdGhzLmxlbmd0aCA9PT0gMCkge1xuXHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0fVxuXHRcdGNvbnN0IHBhdGhzcGVjRmlsZSA9IFVSSS5qb2luUGF0aCh0ZW1wRGlyLCAncGF0aHNwZWMnKTtcblx0XHQvLyBTdGFnZSBvbmx5IHRoZSBwYXRocyBgZ2l0IHN0YXR1c2AgcmVwb3J0ZWQgYXMgY2hhbmdlZC4gVGhlIHByZXZpb3VzXG5cdFx0Ly8gZnVsbC1yZXBvIGBnaXQgYWRkIC1BIC0tIDovYCB3YWxrZWQgbmVzdGVkIHJlcG9zL3dvcmt0cmVlcyBhbmQgbGFyZ2Vcblx0XHQvLyBjaGVja291dHMsIHdoaWNoIG1hZGUgdGVtcC1pbmRleCBkaWZmaW5nIHNsb3cgYW5kIHRpbWVvdXQtcHJvbmUuIEFcblx0XHQvLyBOVUwtc2VwYXJhdGVkIHBhdGhzcGVjIHByZXNlcnZlcyBvZGQgZmlsZW5hbWVzIHdoaWxlIGtlZXBpbmcgZGVsZXRlc1xuXHRcdC8vIGFuZCByZW5hbWUvY29weSBzb3VyY2VzIGluIHNjb3BlLlxuXHRcdGF3YWl0IHRoaXMuX2ZpbGVTZXJ2aWNlLndyaXRlRmlsZShwYXRoc3BlY0ZpbGUsIFZTQnVmZmVyLmZyb21TdHJpbmcoY2hhbmdlZFBhdGhzLmpvaW4oJ1xceDAwJykgKyAnXFx4MDAnKSk7XG5cdFx0dGhpcy5fbG9nU2VydmljZS5kZWJ1ZyhgW2FnZW50SG9zdEdpdFNlcnZpY2VdIFN0YWdpbmcgJHtjaGFuZ2VkUGF0aHMubGVuZ3RofSBjaGFuZ2VkIHBhdGgocykgaW50byB0ZW1wIGluZGV4YCk7XG5cdFx0cmV0dXJuIGF3YWl0IHRoaXMuX3J1bkdpdChyZXBvc2l0b3J5Um9vdCwgWydhZGQnLCAnLUEnLCBgLS1wYXRoc3BlYy1mcm9tLWZpbGU9JHtwYXRoc3BlY0ZpbGUuZnNQYXRofWAsICctLXBhdGhzcGVjLWZpbGUtbnVsJ10sIHtcblx0XHRcdGVudjogeyAuLi5lbnYsIEdJVF9MSVRFUkFMX1BBVEhTUEVDUzogJzEnIH0sXG5cdFx0fSkgIT09IHVuZGVmaW5lZDtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgX3Jlc29sdmVSZW1vdGVUcmFja2luZ0JyYW5jaChyZXBvc2l0b3J5Um9vdDogVVJJLCBicmFuY2g6IHN0cmluZywgZmV0Y2hJZk1pc3NpbmcgPSBmYWxzZSk6IFByb21pc2U8c3RyaW5nIHwgdW5kZWZpbmVkPiB7XG5cdFx0Y29uc3QgdHJhY2tpbmdSZWYgPSBnZXRSZW1vdGVUcmFja2luZ1JlZihicmFuY2gpO1xuXHRcdGlmICghdHJhY2tpbmdSZWYpIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXHRcdGNvbnN0IHsgYnJhbmNoTmFtZSwgcmVtb3RlQnJhbmNoLCByZW1vdGVSZWYsIHNvdXJjZVJlZiB9ID0gdHJhY2tpbmdSZWY7XG5cdFx0Y29uc3Qgb3V0cHV0ID0gYXdhaXQgdGhpcy5fcnVuR2l0KHJlcG9zaXRvcnlSb290LCBbJ3Nob3ctcmVmJywgJy0tdmVyaWZ5JywgJy0tcXVpZXQnLCByZW1vdGVSZWZdKTtcblx0XHRpZiAob3V0cHV0ICE9PSB1bmRlZmluZWQpIHtcblx0XHRcdHJldHVybiByZW1vdGVCcmFuY2g7XG5cdFx0fVxuXHRcdGlmICghZmV0Y2hJZk1pc3NpbmcgfHwgYnJhbmNoTmFtZSA9PT0gJ0hFQUQnIHx8IC9eWzAtOWEtZl17NDB9JC9pLnRlc3QoYnJhbmNoTmFtZSkpIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXG5cdFx0dGhpcy5fbG9nU2VydmljZS5pbmZvKGBbQWdlbnRIb3N0R2l0U2VydmljZV0gRmV0Y2hpbmcgdHJhY2tlZCBicmFuY2ggJyR7YnJhbmNoTmFtZX0nIGZyb20gb3JpZ2luLmApO1xuXHRcdGF3YWl0IHRoaXMuX3J1bkdpdChyZXBvc2l0b3J5Um9vdCwgWydmZXRjaCcsICctLW5vLXRhZ3MnLCAnb3JpZ2luJywgYCR7c291cmNlUmVmfToke3JlbW90ZVJlZn1gXSwge1xuXHRcdFx0dGltZW91dDogNjBfMDAwLFxuXHRcdFx0dGhyb3dPbkVycm9yOiB0cnVlLFxuXHRcdH0pO1xuXHRcdHJldHVybiByZW1vdGVCcmFuY2g7XG5cdH1cblxuXHQvKipcblx0ICogUmVzb2x2ZXMgdGhlIGdpdC1pZ25vcmVkIHBhdGhzIHRvIGNvcHkgaW50byBhIHdvcmt0cmVlLlxuXHQgKi9cblx0cHJpdmF0ZSBhc3luYyBfZ2V0V29ya3RyZWVJbmNsdWRlUGF0aHMocmVwb3NpdG9yeVJvb3Q6IFVSSSwgd29ya3RyZWVSb290OiBVUkksIGdsb2JzOiByZWFkb25seSBzdHJpbmdbXSk6IFByb21pc2U8SVdvcmt0cmVlSW5jbHVkZUVudHJ5W10+IHtcblx0XHRpZiAoZ2xvYnMubGVuZ3RoID09PSAwKSB7XG5cdFx0XHRyZXR1cm4gW107XG5cdFx0fVxuXG5cdFx0Ly8gTGlzdCB0aGUgZ2l0LWlnbm9yZWQgKGJ1dCB1bnRyYWNrZWQpIGZpbGVzOiBgLS1vdGhlcnNgIHNlbGVjdHNcblx0XHQvLyB1bnRyYWNrZWQgZmlsZXMsIGAtLWlnbm9yZWRgIHJlc3RyaWN0cyB0byB0aG9zZSBtYXRjaGVkIGJ5IGFuIGV4Y2x1ZGVcblx0XHQvLyBzb3VyY2UsIGFuZCBgLS1leGNsdWRlLXN0YW5kYXJkYCB1c2VzIHRoZSBzdGFuZGFyZCBzb3VyY2VzICguZ2l0aWdub3JlLFxuXHRcdC8vIC5naXQvaW5mby9leGNsdWRlLCBjb3JlLmV4Y2x1ZGVzRmlsZSkuIGAtemAgTlVMLXNlcGFyYXRlcyBlbnRyaWVzIHNvXG5cdFx0Ly8gcGF0aHMgY29udGFpbmluZyBzcGFjZXMgb3Igb3RoZXIgc3BlY2lhbCBjaGFyYWN0ZXJzIHN1cnZpdmUgaW50YWN0LlxuXHRcdC8vXG5cdFx0Ly8gVGhlIGAtLWRpcmVjdG9yeWAgdmFyaWFudCBhZGRpdGlvbmFsbHkgY29sbGFwc2VzIGEgKndob2xseSotaWdub3JlZFxuXHRcdC8vIGRpcmVjdG9yeSAob25lIGNvbnRhaW5pbmcgbm8gdHJhY2tlZCBmaWxlcykgaW50byBhIHNpbmdsZSBgZGlyL2Bcblx0XHQvLyBlbnRyeS4gSXQgaXMgZW51bWVyYXRlZCBpbiBwYXJhbGxlbCBhbmQgdXNlZCBiZWxvdyB0byBjb3B5IHN1Y2hcblx0XHQvLyBkaXJlY3RvcmllcyBhcyBvbmUgcmVjdXJzaXZlIHVuaXQgcmF0aGVyIHRoYW4gZmlsZS1ieS1maWxlLlxuXHRcdGNvbnN0IGJhc2VBcmdzID0gWydscy1maWxlcycsICctLW90aGVycycsICctLWlnbm9yZWQnLCAnLS1leGNsdWRlLXN0YW5kYXJkJywgJy16J107XG5cdFx0Y29uc3QgW2ZpbGVzT3V0cHV0LCBkaXJlY3RvcnlPdXRwdXQsIHdvcmt0cmVlT3V0cHV0XSA9IGF3YWl0IFByb21pc2UuYWxsKFtcblx0XHRcdHRoaXMuX3J1bkdpdChyZXBvc2l0b3J5Um9vdCwgYmFzZUFyZ3MsIHsgdGltZW91dDogNjBfMDAwIH0pLFxuXHRcdFx0dGhpcy5fcnVuR2l0KHJlcG9zaXRvcnlSb290LCBbLi4uYmFzZUFyZ3MsICctLWRpcmVjdG9yeScsICctLW5vLWVtcHR5LWRpcmVjdG9yeSddLCB7IHRpbWVvdXQ6IDYwXzAwMCB9KSxcblx0XHRcdHRoaXMuX3J1bkdpdCh3b3JrdHJlZVJvb3QsIFsnbHMtZmlsZXMnLCAnLXonXSwgeyB0aW1lb3V0OiA2MF8wMDAgfSksXG5cdFx0XSk7XG5cdFx0aWYgKCFmaWxlc091dHB1dCkge1xuXHRcdFx0cmV0dXJuIFtdO1xuXHRcdH1cblxuXHRcdC8vIGdpdCBlbWl0cyByZXBvc2l0b3J5LXJlbGF0aXZlLCBmb3J3YXJkLXNsYXNoIHBhdGhzLlxuXHRcdGNvbnN0IGlnbm9yZWRGaWxlcyA9IGZpbGVzT3V0cHV0LnNwbGl0KCdcXHgwMCcpLmZpbHRlcihlbnRyeSA9PiBlbnRyeS5sZW5ndGggPiAwKTtcblx0XHRpZiAoaWdub3JlZEZpbGVzLmxlbmd0aCA9PT0gMCkge1xuXHRcdFx0cmV0dXJuIFtdO1xuXHRcdH1cblxuXHRcdC8vIEtlZXAgb25seSB0aGUgaWdub3JlZCBmaWxlcyB0aGF0IG1hdGNoIG9uZSBvZiB0aGUgY29uZmlndXJlZFxuXHRcdC8vIGBnaXQud29ya3RyZWVJbmNsdWRlRmlsZXNgIGdsb2IgcGF0dGVybnMgKFZTIENvZGUgZ2xvYiBzZW1hbnRpY3MpLFxuXHRcdC8vIGFuZCBcdTIwMTQgaW4gdGhlIHNhbWUgcGFzcyBcdTIwMTQgdGFsbHkgd2hpY2ggd2hvbGx5LWlnbm9yZWQgZGlyZWN0b3JpZXNcblx0XHQvLyBjb250YWluIGFuIGlnbm9yZWQgZmlsZSB0aGF0IGNhbm5vdCBiZSBjb3BpZWQgKGFuZCB0aGVyZWZvcmUgY2Fubm90IGJlXG5cdFx0Ly8gY29sbGFwc2VkKS4gYGdpdCBscy1maWxlcyAtLWRpcmVjdG9yeWAgcmVwb3J0cyBhIHdob2xseS1pZ25vcmVkXG5cdFx0Ly8gZGlyZWN0b3J5IGFzIGEgc2luZ2xlIGBkaXIvYCBlbnRyeSBhbmQgbmV2ZXIgbmVzdHMgdGhlc2UgZW50cmllc1xuXHRcdC8vIChpdCBzdG9wcyBkZXNjZW5kaW5nIG9uY2UgYSBkaXJlY3RvcnkgaXMgd2hvbGx5IGlnbm9yZWQpLCBzbyBlYWNoXG5cdFx0Ly8gZmlsZSBoYXMgYXQgbW9zdCBvbmUgY29udGFpbmluZyBkaXJlY3RvcnkgYW5kIG5vIGRlLWR1cGxpY2F0aW9uIG9mXG5cdFx0Ly8gdGhlIGRpcmVjdG9yeSBzZXQgaXMgcmVxdWlyZWQuXG5cdFx0Y29uc3QgbWF0Y2hlcnMgPSBnbG9icy5tYXAocGF0dGVybiA9PiBwYXJzZShwYXR0ZXJuKSk7XG5cdFx0Y29uc3Qgd2hvbGVEaXJlY3RvcmllcyA9IG5ldyBTZXQoKGRpcmVjdG9yeU91dHB1dCA/PyAnJylcblx0XHRcdC5zcGxpdCgnXFx4MDAnKS5maWx0ZXIoZW50cnkgPT4gZW50cnkuZW5kc1dpdGgoJy8nKSkpO1xuXHRcdGNvbnN0IHdvcmt0cmVlRmlsZXMgPSBuZXcgU2V0KCh3b3JrdHJlZU91dHB1dCA/PyAnJylcblx0XHRcdC5zcGxpdCgnXFx4MDAnKS5maWx0ZXIoZW50cnkgPT4gZW50cnkubGVuZ3RoID4gMCkpO1xuXG5cdFx0Ly8gRXZlcnkgYW5jZXN0b3IgZGlyZWN0b3J5IG9mIGEgdHJhY2tlZCBwYXRoLCB3aXRoIHRoZSB0cmFpbGluZyBgL2AgdXNlZFxuXHRcdC8vIGJ5IGBnaXQgbHMtZmlsZXMgLS1kaXJlY3RvcnlgLCBzbyBhIHNvdXJjZSBwYXRoIGNhbiBiZSBjaGVja2VkIGFnYWluc3Rcblx0XHQvLyB0aGUgc2hhcGUgKGZpbGUgdnMgZGlyZWN0b3J5KSBvZiBpdHMgZGVzdGluYXRpb24uXG5cdFx0Y29uc3Qgd29ya3RyZWVEaXJlY3RvcmllcyA9IG5ldyBTZXQ8c3RyaW5nPigpO1xuXHRcdGZvciAoY29uc3QgZmlsZSBvZiB3b3JrdHJlZUZpbGVzKSB7XG5cdFx0XHRsZXQgaW5kZXggPSBmaWxlLmluZGV4T2YoJy8nKTtcblx0XHRcdHdoaWxlIChpbmRleCAhPT0gLTEpIHtcblx0XHRcdFx0d29ya3RyZWVEaXJlY3Rvcmllcy5hZGQoZmlsZS5zbGljZSgwLCBpbmRleCArIDEpKTtcblx0XHRcdFx0aW5kZXggPSBmaWxlLmluZGV4T2YoJy8nLCBpbmRleCArIDEpO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdGNvbnN0IG1hdGNoZWRGaWxlczogc3RyaW5nW10gPSBbXTtcblx0XHRjb25zdCBub25Db2xsYXBzaWJsZURpcmVjdG9yaWVzID0gbmV3IFNldDxzdHJpbmc+KCk7XG5cdFx0Zm9yIChjb25zdCBmaWxlIG9mIGlnbm9yZWRGaWxlcykge1xuXHRcdFx0aWYgKFxuXHRcdFx0XHRtYXRjaGVycy5zb21lKG1hdGNoZXIgPT4gbWF0Y2hlcihmaWxlKSkgJiZcblx0XHRcdFx0IWhhc1dvcmt0cmVlUGF0aENvbGxpc2lvbihmaWxlLCB3b3JrdHJlZUZpbGVzLCB3b3JrdHJlZURpcmVjdG9yaWVzKVxuXHRcdFx0KSB7XG5cdFx0XHRcdG1hdGNoZWRGaWxlcy5wdXNoKGZpbGUpO1xuXHRcdFx0fSBlbHNlIGlmICh3aG9sZURpcmVjdG9yaWVzLnNpemUgPiAwKSB7XG5cdFx0XHRcdGNvbnN0IGNvbnRhaW5pbmdEaXJlY3RvcnkgPSBmaW5kQ29udGFpbmluZ0RpcmVjdG9yeShmaWxlLCB3aG9sZURpcmVjdG9yaWVzKTtcblx0XHRcdFx0aWYgKGNvbnRhaW5pbmdEaXJlY3RvcnkgIT09IHVuZGVmaW5lZCkge1xuXHRcdFx0XHRcdG5vbkNvbGxhcHNpYmxlRGlyZWN0b3JpZXMuYWRkKGNvbnRhaW5pbmdEaXJlY3RvcnkpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0aWYgKG1hdGNoZWRGaWxlcy5sZW5ndGggPT09IDApIHtcblx0XHRcdHJldHVybiBbXTtcblx0XHR9XG5cblx0XHQvLyBDb2xsYXBzZSBtYXRjaGVkIGZpbGVzIGludG8gdGhlaXIgY29udGFpbmluZyBkaXJlY3Rvcnkgd2hlbiB0aGUgd2hvbGVcblx0XHQvLyBkaXJlY3RvcnkgY2FuIGJlIGNvcGllZCBhcyBhIHNpbmdsZSByZWN1cnNpdmUgdW5pdCBcdTIwMTQgaS5lLiBpdCBpc1xuXHRcdC8vIHdob2xseSBpZ25vcmVkIChzbyBpdCBoYXMgbm8gdHJhY2tlZCBmaWxlcyBhIHJlY3Vyc2l2ZSBjb3B5IHdvdWxkXG5cdFx0Ly8gY2xvYmJlcikgYW5kIGV2ZXJ5IGlnbm9yZWQgZmlsZSBpdCBjb250YWlucyBtYXRjaGVkIGEgZ2xvYiAoc29cblx0XHQvLyBub3RoaW5nIHVud2FudGVkIGlzIGNvcGllZCwgdHJhY2tlZCBieSBgbm9uQ29sbGFwc2libGVEaXJlY3Rvcmllc2AgYWJvdmUpLlxuXHRcdC8vIFRoaXMgdHVybnMgYSBsYXJnZSB0cmVlIHN1Y2ggYXMgYG5vZGVfbW9kdWxlcy9gIGludG8gb25lIGNvcHkgaW5zdGVhZFxuXHRcdC8vIG9mIG9uZSBwZXIgZmlsZSwgd2hpbGUgYSBwYXJ0aWFsbHktbWF0Y2hlZCBvciBwYXJ0aWFsbHktdHJhY2tlZFxuXHRcdC8vIGRpcmVjdG9yeSBmYWxscyBiYWNrIHRvIGl0cyBpbmRpdmlkdWFsIG1hdGNoZWQgZmlsZXMuIGAtLWRpcmVjdG9yeWBcblx0XHQvLyB3aXRoIGAtLW5vLWVtcHR5LWRpcmVjdG9yeWAgbmV2ZXIgcmVwb3J0cyBhbiBlbXB0eSBkaXJlY3RvcnksIHNvIGV2ZXJ5XG5cdFx0Ly8gZW50cnkgaW4gYHdob2xlRGlyZWN0b3JpZXNgIGlzIGtub3duIHRvIGNvbnRhaW4gYXQgbGVhc3Qgb25lIGlnbm9yZWQgZmlsZS5cblx0XHRjb25zdCBjb2xsYXBzZWREaXJlY3RvcmllcyA9IG5ldyBTZXQ8c3RyaW5nPigpO1xuXHRcdGZvciAoY29uc3QgZGlyIG9mIHdob2xlRGlyZWN0b3JpZXMpIHtcblx0XHRcdGlmICghbm9uQ29sbGFwc2libGVEaXJlY3Rvcmllcy5oYXMoZGlyKSkge1xuXHRcdFx0XHRjb2xsYXBzZWREaXJlY3Rvcmllcy5hZGQoZGlyKTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRyZXR1cm4gdG9Xb3JrdHJlZUluY2x1ZGVFbnRyaWVzKHJlcG9zaXRvcnlSb290LCBtYXRjaGVkRmlsZXMsIGNvbGxhcHNlZERpcmVjdG9yaWVzKTtcblx0fVxuXG5cdGFzeW5jIHNob3dCbG9iKHdvcmtpbmdEaXJlY3Rvcnk6IFVSSSwgcmVmOiBzdHJpbmcsIHJlcG9SZWxhdGl2ZVBhdGg6IHN0cmluZyk6IFByb21pc2U8VlNCdWZmZXIgfCB1bmRlZmluZWQ+IHtcblx0XHRjb25zdCByZXBvc2l0b3J5Um9vdCA9IGF3YWl0IHRoaXMuZ2V0UmVwb3NpdG9yeVJvb3Qod29ya2luZ0RpcmVjdG9yeSk7XG5cdFx0aWYgKCFyZXBvc2l0b3J5Um9vdCkge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cblx0XHQvLyBgZ2l0IHNob3dgIGV4aXRzIG5vbi16ZXJvIHdoZW4gdGhlIHBhdGggZGlkbid0IGV4aXN0IGF0IHRoYXRcblx0XHQvLyByZWY7IGBfcnVuR2l0YCBzd2FsbG93cyB0aGF0IGludG8gYHVuZGVmaW5lZGAgd2hpY2ggaXMgZXhhY3RseVxuXHRcdC8vIHRoZSBjb250cmFjdCBjYWxsZXJzIHdhbnQuXG5cdFx0cmV0dXJuIG5ldyBQcm9taXNlKChyZXNvbHZlKSA9PiB7XG5cdFx0XHRjcC5leGVjRmlsZSgnZ2l0JywgWydzaG93JywgYCR7cmVmfToke3JlcG9SZWxhdGl2ZVBhdGh9YF0sIHsgY3dkOiB3b3JraW5nRGlyZWN0b3J5LmZzUGF0aCwgdGltZW91dDogNTAwMCwgZW5jb2Rpbmc6ICdidWZmZXInLCBtYXhCdWZmZXI6IDMyICogMTAyNCAqIDEwMjQgfSwgKGVycm9yLCBzdGRvdXQpID0+IHtcblx0XHRcdFx0aWYgKGVycm9yKSB7XG5cdFx0XHRcdFx0cmVzb2x2ZSh1bmRlZmluZWQpO1xuXHRcdFx0XHRcdHJldHVybjtcblx0XHRcdFx0fVxuXHRcdFx0XHRyZXNvbHZlKFZTQnVmZmVyLndyYXAoc3Rkb3V0IGFzIEJ1ZmZlcikpO1xuXHRcdFx0fSk7XG5cdFx0fSk7XG5cdH1cblxuXHRhc3luYyBnZXRTZXNzaW9uR2l0U3RhdGUod29ya2luZ0RpcmVjdG9yeTogVVJJLCBiYXNlQnJhbmNoTmFtZT86IHN0cmluZyk6IFByb21pc2U8SVNlc3Npb25HaXRTdGF0ZSB8IHVuZGVmaW5lZD4ge1xuXHRcdHJldHVybiB0aGlzLl9jb21wdXRlU2Vzc2lvbkdpdFN0YXRlKHdvcmtpbmdEaXJlY3RvcnksIGJhc2VCcmFuY2hOYW1lKTtcblx0fVxuXG5cdGFzeW5jIGdldEZldGNoUmVtb3RlVXJscyh3b3JraW5nRGlyZWN0b3J5OiBVUkksIHByZWZlcnJlZFJlbW90ZT86IHN0cmluZyk6IFByb21pc2U8cmVhZG9ubHkgc3RyaW5nW10gfCB1bmRlZmluZWQ+IHtcblx0XHRjb25zdCByZXBvc2l0b3J5Um9vdCA9IGF3YWl0IHRoaXMuZ2V0UmVwb3NpdG9yeVJvb3Qod29ya2luZ0RpcmVjdG9yeSk7XG5cdFx0aWYgKCFyZXBvc2l0b3J5Um9vdCkge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cdFx0cmV0dXJuIHBhcnNlRmV0Y2hSZW1vdGVVcmxzKGF3YWl0IHRoaXMuX3J1bkdpdChyZXBvc2l0b3J5Um9vdCwgWydyZW1vdGUnLCAnLXYnXSksIHByZWZlcnJlZFJlbW90ZSk7XG5cdH1cblxuXHRhc3luYyBnZXRVbnRyYWNrZWRQYXRocyh3b3JraW5nRGlyZWN0b3J5OiBVUkkpOiBQcm9taXNlPHJlYWRvbmx5IHN0cmluZ1tdIHwgdW5kZWZpbmVkPiB7XG5cdFx0Y29uc3QgcmVwb3NpdG9yeVJvb3QgPSBhd2FpdCB0aGlzLmdldFJlcG9zaXRvcnlSb290KHdvcmtpbmdEaXJlY3RvcnkpO1xuXHRcdGlmICghcmVwb3NpdG9yeVJvb3QpIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXHRcdGNvbnN0IHN0YXR1cyA9IGF3YWl0IHRoaXMuX3J1bkdpdFN0YXR1cyhyZXBvc2l0b3J5Um9vdCwgWyctLXBvcmNlbGFpbj12MScsICcteicsICctLXVudHJhY2tlZC1maWxlcz1hbGwnXSk7XG5cdFx0cmV0dXJuIHN0YXR1cyA9PT0gdW5kZWZpbmVkID8gdW5kZWZpbmVkIDogcGFyc2VVbnRyYWNrZWRQYXRocyhzdGF0dXMpO1xuXHR9XG5cblx0YXN5bmMgY2FwdHVyZVdvcmtpbmdUcmVlQXNUcmVlKHdvcmtpbmdEaXJlY3Rvcnk6IFVSSSk6IFByb21pc2U8c3RyaW5nIHwgdW5kZWZpbmVkPiB7XG5cdFx0Y29uc3QgcmVwb3NpdG9yeVJvb3QgPSBhd2FpdCB0aGlzLmdldFJlcG9zaXRvcnlSb290KHdvcmtpbmdEaXJlY3RvcnkpO1xuXHRcdGlmICghcmVwb3NpdG9yeVJvb3QpIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXG5cdFx0Y29uc3Qgc3RhdHVzT3V0ID0gYXdhaXQgdGhpcy5fcnVuR2l0U3RhdHVzKHJlcG9zaXRvcnlSb290LCBbJy0tcG9yY2VsYWluPXYxJywgJy16JywgJy0tdW50cmFja2VkLWZpbGVzPWFsbCddKTtcblx0XHRpZiAoc3RhdHVzT3V0ID09PSB1bmRlZmluZWQpIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXHRcdGNvbnN0IGNoYW5nZWRQYXRocyA9IHBhcnNlQ2hhbmdlZFBhdGhzKHN0YXR1c091dCk7XG5cdFx0Y29uc3QgdGVtcERpciA9IFVSSS5qb2luUGF0aCh0aGlzLl9lbnZpcm9ubWVudFNlcnZpY2UudG1wRGlyLCBgYWdlbnQtaG9zdC1jaGVja3BvaW50LSR7Z2VuZXJhdGVVdWlkKCl9YCk7XG5cdFx0YXdhaXQgdGhpcy5fZmlsZVNlcnZpY2UuY3JlYXRlRm9sZGVyKHRlbXBEaXIpO1xuXHRcdGNvbnN0IGluZGV4RmlsZSA9IFVSSS5qb2luUGF0aCh0ZW1wRGlyLCAnaW5kZXgnKS5mc1BhdGg7XG5cdFx0Y29uc3QgZW52OiBSZWNvcmQ8c3RyaW5nLCBzdHJpbmc+ID0geyBHSVRfSU5ERVhfRklMRTogaW5kZXhGaWxlLCBDT01NQU5EX0hPT0tfTE9DSzogJzEnIH07XG5cdFx0dHJ5IHtcblx0XHRcdC8vIFNlZWQgdGhlIHRlbXAgaW5kZXggZnJvbSBIRUFEOyBmb3IgZW1wdHkgcmVwb3Mgc2VlZCBmcm9tIHRoZSBlbXB0eSB0cmVlLlxuXHRcdFx0Y29uc3Qgc2VlZGVkID0gYXdhaXQgdGhpcy5fcnVuR2l0KHJlcG9zaXRvcnlSb290LCBbJ3JlYWQtdHJlZScsICdIRUFEJ10sIHsgZW52IH0pO1xuXHRcdFx0aWYgKHNlZWRlZCA9PT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRcdGF3YWl0IHRoaXMuX3J1bkdpdChyZXBvc2l0b3J5Um9vdCwgWydyZWFkLXRyZWUnLCBFTVBUWV9UUkVFX09CSkVDVF0sIHsgZW52IH0pO1xuXHRcdFx0fVxuXHRcdFx0aWYgKCEoYXdhaXQgdGhpcy5fc3RhZ2VDaGFuZ2VkUGF0aHMocmVwb3NpdG9yeVJvb3QsIHRlbXBEaXIsIGNoYW5nZWRQYXRocywgZW52KSkpIHtcblx0XHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHRcdH1cblx0XHRcdGNvbnN0IHRyZWUgPSAoYXdhaXQgdGhpcy5fcnVuR2l0KHJlcG9zaXRvcnlSb290LCBbJ3dyaXRlLXRyZWUnXSwgeyBlbnYgfSkpPy50cmltKCk7XG5cdFx0XHRyZXR1cm4gdHJlZSB8fCB1bmRlZmluZWQ7XG5cdFx0fSBmaW5hbGx5IHtcblx0XHRcdHRyeSB7IGF3YWl0IHRoaXMuX2ZpbGVTZXJ2aWNlLmRlbCh0ZW1wRGlyLCB7IHJlY3Vyc2l2ZTogdHJ1ZSwgdXNlVHJhc2g6IGZhbHNlIH0pOyB9IGNhdGNoIHsgLyogYmVzdC1lZmZvcnQgKi8gfVxuXHRcdH1cblx0fVxuXG5cdGFzeW5jIGNvbW1pdFRyZWUocmVwb3NpdG9yeVJvb3Q6IFVSSSwgdHJlZU9pZDogc3RyaW5nLCBwYXJlbnRPaWQ6IHN0cmluZyB8IHVuZGVmaW5lZCwgbWVzc2FnZTogc3RyaW5nKTogUHJvbWlzZTxzdHJpbmcgfCB1bmRlZmluZWQ+IHtcblx0XHRjb25zdCBhcmdzID0gWydjb21taXQtdHJlZScsIHRyZWVPaWRdO1xuXHRcdGlmIChwYXJlbnRPaWQpIHtcblx0XHRcdGFyZ3MucHVzaCgnLXAnLCBwYXJlbnRPaWQpO1xuXHRcdH1cblx0XHRhcmdzLnB1c2goJy1tJywgbWVzc2FnZSk7XG5cdFx0Y29uc3Qgb3V0ID0gYXdhaXQgdGhpcy5fcnVuR2l0KHJlcG9zaXRvcnlSb290LCBhcmdzLCB7IHRocm93T25FcnJvcjogdHJ1ZSB9KTtcblx0XHRyZXR1cm4gb3V0Py50cmltKCkgfHwgdW5kZWZpbmVkO1xuXHR9XG5cblx0YXN5bmMgdXBkYXRlUmVmKHJlcG9zaXRvcnlSb290OiBVUkksIHJlZjogc3RyaW5nLCBuZXdPaWQ6IHN0cmluZyk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGF3YWl0IHRoaXMuX3J1bkdpdChyZXBvc2l0b3J5Um9vdCwgWyd1cGRhdGUtcmVmJywgcmVmLCBuZXdPaWRdLCB7IHRocm93T25FcnJvcjogdHJ1ZSB9KTtcblx0fVxuXG5cdGFzeW5jIGRlbGV0ZVJlZnMocmVwb3NpdG9yeVJvb3Q6IFVSSSwgcmVmczogcmVhZG9ubHkgc3RyaW5nW10pOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRpZiAocmVmcy5sZW5ndGggPT09IDApIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0Ly8gVXNlIGB1cGRhdGUtcmVmIC0tc3RkaW4gLXpgIHNvIGFsbCBkZWxldGlvbnMgZ28gdGhyb3VnaCBhIHNpbmdsZSBnaXRcblx0XHQvLyBpbnZvY2F0aW9uLiBFYWNoIGNvbW1hbmQgaXMgYGRlbGV0ZSBTUCA8cmVmPiBOVUwgWzxleHBlY3RlZF9vaWQ+XSBOVUxgO1xuXHRcdC8vIHdlIG9taXQgdGhlIGV4cGVjdGVkIG9pZCBzbyBhbHJlYWR5LW1pc3NpbmcgcmVmcyBkb24ndCBmYWlsIHRoZSBiYXRjaC5cblx0XHRjb25zdCBzdGRpbiA9IHJlZnMubWFwKHJlZiA9PiBgZGVsZXRlICR7cmVmfVxceDAwXFx4MDBgKS5qb2luKCcnKTtcblx0XHRhd2FpdCBuZXcgUHJvbWlzZTx2b2lkPigocmVzb2x2ZSkgPT4ge1xuXHRcdFx0Y29uc3QgcHJvYyA9IGNwLmV4ZWNGaWxlKCdnaXQnLCBbJ3VwZGF0ZS1yZWYnLCAnLS1zdGRpbicsICcteiddLCB7IGN3ZDogcmVwb3NpdG9yeVJvb3QuZnNQYXRoLCB0aW1lb3V0OiAxMF8wMDAgfSwgKCkgPT4ge1xuXHRcdFx0XHQvLyBUb2xlcmF0ZSBub24temVybyBleGl0cyBcdTIwMTQgbWlzc2luZyByZWZzIGFyZSBub3QgZmF0YWwgZm9yIGNsZWFudXAuXG5cdFx0XHRcdHJlc29sdmUoKTtcblx0XHRcdH0pO1xuXHRcdFx0cHJvYy5zdGRpbj8uZW5kKHN0ZGluKTtcblx0XHR9KTtcblx0fVxuXG5cdGFzeW5jIHJldlBhcnNlKHJlcG9zaXRvcnlSb290OiBVUkksIGV4cHJlc3Npb246IHN0cmluZyk6IFByb21pc2U8c3RyaW5nIHwgdW5kZWZpbmVkPiB7XG5cdFx0Y29uc3Qgb3V0ID0gYXdhaXQgdGhpcy5fcnVuR2l0KHJlcG9zaXRvcnlSb290LCBbJ3Jldi1wYXJzZScsICctLXZlcmlmeScsICctLXF1aWV0JywgZXhwcmVzc2lvbl0pO1xuXHRcdHJldHVybiBvdXQ/LnRyaW0oKSB8fCB1bmRlZmluZWQ7XG5cdH1cblxuXHRhc3luYyBsaXN0UmVmTmFtZXNXaXRoT2lkcyhyZXBvc2l0b3J5Um9vdDogVVJJLCBwYXR0ZXJuOiBzdHJpbmcpOiBQcm9taXNlPEFycmF5PHsgcmVhZG9ubHkgcmVmOiBzdHJpbmc7IHJlYWRvbmx5IG9pZDogc3RyaW5nIH0+PiB7XG5cdFx0Y29uc3Qgb3V0ID0gYXdhaXQgdGhpcy5fcnVuR2l0KHJlcG9zaXRvcnlSb290LCBbJ2Zvci1lYWNoLXJlZicsICctLWZvcm1hdD0lKHJlZm5hbWUpJTAwJShvYmplY3RuYW1lKScsIHBhdHRlcm5dKTtcblx0XHRpZiAoIW91dCkge1xuXHRcdFx0cmV0dXJuIFtdO1xuXHRcdH1cblx0XHRjb25zdCByZXN1bHQ6IEFycmF5PHsgcmVmOiBzdHJpbmc7IG9pZDogc3RyaW5nIH0+ID0gW107XG5cdFx0Zm9yIChjb25zdCBsaW5lIG9mIG91dC5zcGxpdCgnXFxuJykpIHtcblx0XHRcdGNvbnN0IHRyaW1tZWQgPSBsaW5lLnRyaW0oKTtcblx0XHRcdGlmICghdHJpbW1lZCkge1xuXHRcdFx0XHRjb250aW51ZTtcblx0XHRcdH1cblx0XHRcdGNvbnN0IFtyZWYsIG9pZF0gPSB0cmltbWVkLnNwbGl0KCdcXHgwMCcpO1xuXHRcdFx0aWYgKHJlZiAmJiBvaWQpIHtcblx0XHRcdFx0cmVzdWx0LnB1c2goeyByZWYsIG9pZCB9KTtcblx0XHRcdH1cblx0XHR9XG5cdFx0cmV0dXJuIHJlc3VsdDtcblx0fVxuXG5cdGFzeW5jIG92ZXJsYXlQYXRoSW50b1RyZWUocmVwb3NpdG9yeVJvb3Q6IFVSSSwgYmFzZVRyZWVPaWQ6IHN0cmluZywgcGF0aDogc3RyaW5nLCBzb3VyY2VUcmVlT2lkOiBzdHJpbmcpOiBQcm9taXNlPHN0cmluZyB8IHVuZGVmaW5lZD4ge1xuXHRcdC8vIEJ1aWxkIGEgdGhyb3dhd2F5IGluZGV4IHNlZWRlZCBmcm9tIGBiYXNlVHJlZU9pZGAsIHJlcGxhY2UvcmVtb3ZlIHRoZVxuXHRcdC8vIHNpbmdsZSBgcGF0aGAgdXNpbmcgYHNvdXJjZVRyZWVPaWRgLCBhbmQgd3JpdGUgdGhlIHJlc3VsdCBiYWNrIG91dCBhc1xuXHRcdC8vIGEgbmV3IHRyZWUuIFRoZSB1c2VyJ3MgcmVhbCBpbmRleCBpcyBuZXZlciB0b3VjaGVkIChtaXJyb3JzIHRoZVxuXHRcdC8vIHRlbXAtaW5kZXggdGVjaG5pcXVlIHVzZWQgYnkgYGNhcHR1cmVXb3JraW5nVHJlZUFzVHJlZWApLlxuXHRcdGNvbnN0IHRlbXBEaXIgPSBVUkkuam9pblBhdGgodGhpcy5fZW52aXJvbm1lbnRTZXJ2aWNlLnRtcERpciwgYGFnZW50LWhvc3QtcmV2aWV3LW92ZXJsYXktJHtnZW5lcmF0ZVV1aWQoKX1gKTtcblx0XHRhd2FpdCB0aGlzLl9maWxlU2VydmljZS5jcmVhdGVGb2xkZXIodGVtcERpcik7XG5cdFx0Y29uc3QgaW5kZXhGaWxlID0gVVJJLmpvaW5QYXRoKHRlbXBEaXIsICdpbmRleCcpLmZzUGF0aDtcblx0XHRjb25zdCBlbnY6IFJlY29yZDxzdHJpbmcsIHN0cmluZz4gPSB7IEdJVF9JTkRFWF9GSUxFOiBpbmRleEZpbGUsIENPTU1BTkRfSE9PS19MT0NLOiAnMScgfTtcblxuXHRcdHRyeSB7XG5cdFx0XHRjb25zdCByZWFkVHJlZU91dCA9IGF3YWl0IHRoaXMuX3J1bkdpdChyZXBvc2l0b3J5Um9vdCwgWydyZWFkLXRyZWUnLCBiYXNlVHJlZU9pZF0sIHsgZW52LCB0aHJvd09uRXJyb3I6IGZhbHNlIH0pO1xuXHRcdFx0aWYgKHJlYWRUcmVlT3V0ID09PSB1bmRlZmluZWQpIHtcblx0XHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHRcdH1cblxuXHRcdFx0Ly8gUmVzb2x2ZSB0aGUgc291cmNlIGJsb2IgKG1vZGUgKyBvaWQpIGZvciBgcGF0aGAuIGAtemAgYXZvaWRzXG5cdFx0XHQvLyBwYXRoIHF1b3Rpbmc7IGFuIGVtcHR5IHJlc3VsdCBtZWFucyB0aGUgcGF0aCBpcyBhYnNlbnQgaW4gdGhlXG5cdFx0XHQvLyBzb3VyY2UgdHJlZSwgc28gdGhlIG92ZXJsYXkgcmVtb3ZlcyBpdCBmcm9tIHRoZSBiYXNlLlxuXHRcdFx0Y29uc3QgbHNUcmVlT3V0ID0gYXdhaXQgdGhpcy5fcnVuR2l0KHJlcG9zaXRvcnlSb290LCBbJ2xzLXRyZWUnLCAnLXonLCBzb3VyY2VUcmVlT2lkLCAnLS0nLCBwYXRoXSwgeyBlbnYgfSk7XG5cdFx0XHRjb25zdCBlbnRyeSA9IHBhcnNlU2luZ2xlTHNUcmVlRW50cnkobHNUcmVlT3V0KTtcblx0XHRcdGlmIChlbnRyeSkge1xuXHRcdFx0XHRjb25zdCB1cGRhdGVJbmRleE91dCA9IGF3YWl0IHRoaXMuX3J1bkdpdChyZXBvc2l0b3J5Um9vdCwgWyd1cGRhdGUtaW5kZXgnLCAnLS1hZGQnLCAnLS1jYWNoZWluZm8nLCBgJHtlbnRyeS5tb2RlfSwke2VudHJ5Lm9pZH0sJHtwYXRofWBdLCB7IGVudiwgdGhyb3dPbkVycm9yOiBmYWxzZSB9KTtcblx0XHRcdFx0aWYgKHVwZGF0ZUluZGV4T3V0ID09PSB1bmRlZmluZWQpIHtcblx0XHRcdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdFx0XHR9XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHQvLyBgLS1mb3JjZS1yZW1vdmVgIHRvbGVyYXRlcyB0aGUgcGF0aCBhbHJlYWR5IGJlaW5nIGFic2VudCBmcm9tXG5cdFx0XHRcdC8vIHRoZSBpbmRleCwgc28gcmVtb3ZpbmcgYW4gdW50cmFja2VkL2FkZGVkIHBhdGggaXMgYSBuby1vcC5cblx0XHRcdFx0Y29uc3QgdXBkYXRlSW5kZXhPdXQgPSBhd2FpdCB0aGlzLl9ydW5HaXQocmVwb3NpdG9yeVJvb3QsIFsndXBkYXRlLWluZGV4JywgJy0tZm9yY2UtcmVtb3ZlJywgJy0tJywgcGF0aF0sIHsgZW52LCB0aHJvd09uRXJyb3I6IGZhbHNlIH0pO1xuXHRcdFx0XHRpZiAodXBkYXRlSW5kZXhPdXQgPT09IHVuZGVmaW5lZCkge1xuXHRcdFx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0XHRcdH1cblx0XHRcdH1cblxuXHRcdFx0Y29uc3Qgd3JpdGVUcmVlT3V0ID0gYXdhaXQgdGhpcy5fcnVuR2l0KHJlcG9zaXRvcnlSb290LCBbJ3dyaXRlLXRyZWUnXSwgeyBlbnYgfSk7XG5cdFx0XHRyZXR1cm4gd3JpdGVUcmVlT3V0Py50cmltKCk7XG5cdFx0fSBmaW5hbGx5IHtcblx0XHRcdHRyeSB7XG5cdFx0XHRcdGF3YWl0IHRoaXMuX2ZpbGVTZXJ2aWNlLmRlbCh0ZW1wRGlyLCB7IHJlY3Vyc2l2ZTogdHJ1ZSwgdXNlVHJhc2g6IGZhbHNlIH0pO1xuXHRcdFx0fSBjYXRjaCB7IC8qIGJlc3QtZWZmb3J0ICovIH1cblx0XHR9XG5cdH1cblxuXHRhc3luYyBkaWZmVHJlZVBhdGhzKHJlcG9zaXRvcnlSb290OiBVUkksIGZyb21UcmVlaXNoOiBzdHJpbmcsIHRvVHJlZWlzaDogc3RyaW5nKTogUHJvbWlzZTxzdHJpbmdbXSB8IHVuZGVmaW5lZD4ge1xuXHRcdGNvbnN0IG91dCA9IGF3YWl0IHRoaXMuX3J1bkdpdChyZXBvc2l0b3J5Um9vdCwgWydkaWZmJywgJy0tbmFtZS1vbmx5JywgJy0tbm8tcmVuYW1lcycsICcteicsIGZyb21UcmVlaXNoLCB0b1RyZWVpc2gsICctLSddKTtcblx0XHRpZiAob3V0ID09PSB1bmRlZmluZWQpIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXHRcdHJldHVybiBvdXQuc3BsaXQoJ1xceDAwJykuZmlsdGVyKEJvb2xlYW4pO1xuXHR9XG5cblx0YXN5bmMgY29tcHV0ZUZpbGVEaWZmc0JldHdlZW5SZWZzKHdvcmtpbmdEaXJlY3Rvcnk6IFVSSSwgb3B0aW9uczogeyByZWFkb25seSBzZXNzaW9uVXJpOiBzdHJpbmc7IHJlYWRvbmx5IGZyb21SZWY6IHN0cmluZzsgcmVhZG9ubHkgdG9SZWY6IHN0cmluZyB9KTogUHJvbWlzZTxyZWFkb25seSBJU2Vzc2lvbkZpbGVEaWZmW10gfCB1bmRlZmluZWQ+IHtcblx0XHRjb25zdCByZXBvc2l0b3J5Um9vdCA9IGF3YWl0IHRoaXMuZ2V0UmVwb3NpdG9yeVJvb3Qod29ya2luZ0RpcmVjdG9yeSk7XG5cdFx0aWYgKCFyZXBvc2l0b3J5Um9vdCkge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cblx0XHR0cnkge1xuXHRcdFx0Y29uc3QgcmF3ID0gYXdhaXQgdGhpcy5fcnVuR2l0KHJlcG9zaXRvcnlSb290LCBbJ2RpZmYnLCAnLS1yYXcnLCAnLS1udW1zdGF0JywgJy0tZGlmZi1maWx0ZXI9QURNUicsICcteicsIG9wdGlvbnMuZnJvbVJlZiwgb3B0aW9ucy50b1JlZiwgJy0tJ10pO1xuXHRcdFx0aWYgKHJhdyA9PT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0XHR9XG5cblx0XHRcdHJldHVybiBwYXJzZUdpdERpZmZSYXdOdW1zdGF0KHJhdywgcmVwb3NpdG9yeVJvb3QsIG9wdGlvbnMuc2Vzc2lvblVyaSwgb3B0aW9ucy5mcm9tUmVmLCBvcHRpb25zLnRvUmVmKTtcblx0XHR9IGNhdGNoIChlcnIpIHtcblx0XHRcdHRoaXMuX2xvZ1NlcnZpY2Uud2FybihgW0FnZW50SG9zdEdpdFNlcnZpY2VdW2NvbXB1dGVGaWxlRGlmZnNCZXR3ZWVuUmVmc10gRmFpbGVkIHRvIGNvbXB1dGUgZmlsZSBkaWZmcyAke3JlcG9zaXRvcnlSb290LnRvU3RyaW5nKCl9LCAke29wdGlvbnMuZnJvbVJlZn0sICR7b3B0aW9ucy50b1JlZn06ICR7ZXJyfWApO1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cdH1cblxuXHRhc3luYyBnZXRCcmFuY2hEaWZmU2FmZXR5SW5mbyh3b3JraW5nRGlyZWN0b3J5OiBVUkksIGJhc2VsaW5lQ29tbWl0OiBzdHJpbmcpOiBQcm9taXNlPElCcmFuY2hEaWZmU2FmZXR5SW5mbyB8IHVuZGVmaW5lZD4ge1xuXHRcdGNvbnN0IHJlcG9zaXRvcnlSb290ID0gYXdhaXQgdGhpcy5nZXRSZXBvc2l0b3J5Um9vdCh3b3JraW5nRGlyZWN0b3J5KTtcblx0XHRpZiAoIXJlcG9zaXRvcnlSb290KSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblxuXHRcdGNvbnN0IFt2aXJ0dWFsRmlsZVN5c3RlbSwgc3BhcnNlQ2hlY2tvdXQsIHRpbWVzdGFtcCwgY29tbWl0Q291bnQsIHdvcmtzcGFjZUZpbGVzXSA9IGF3YWl0IFByb21pc2UuYWxsKFtcblx0XHRcdHRoaXMuX3J1bkdpdChyZXBvc2l0b3J5Um9vdCwgWydjb25maWcnLCAnLS1nZXQnLCAnY29yZS52aXJ0dWFsZmlsZXN5c3RlbSddKSxcblx0XHRcdHRoaXMuX3J1bkdpdChyZXBvc2l0b3J5Um9vdCwgWydjb25maWcnLCAnLS1nZXQnLCAnY29yZS5zcGFyc2VjaGVja291dCddKSxcblx0XHRcdHRoaXMuX3J1bkdpdChyZXBvc2l0b3J5Um9vdCwgWydzaG93JywgJy1zJywgJy0tZm9ybWF0PSVjdCcsIGJhc2VsaW5lQ29tbWl0XSksXG5cdFx0XHR0aGlzLl9ydW5HaXQocmVwb3NpdG9yeVJvb3QsIFsncmV2LWxpc3QnLCAnLS1jb3VudCcsIGAke2Jhc2VsaW5lQ29tbWl0fS4uSEVBRGBdKSxcblx0XHRcdHRoaXMuX3J1bkdpdChyZXBvc2l0b3J5Um9vdCwgWydscy1maWxlcycsICctLWNhY2hlZCcsICctLW90aGVycycsICctLWV4Y2x1ZGUtc3RhbmRhcmQnLCAnLXonXSksXG5cdFx0XSk7XG5cdFx0Y29uc3Qgc3BhcnNlQ2hlY2tvdXRFbmFibGVkID0gbmV3IFNldChbJ3RydWUnLCAneWVzJywgJ29uJywgJzEnXSkuaGFzKHNwYXJzZUNoZWNrb3V0Py50cmltKCkudG9Mb3dlckNhc2UoKSA/PyAnJyk7XG5cdFx0Y29uc3QgdGltZXN0YW1wU2Vjb25kcyA9IE51bWJlcih0aW1lc3RhbXA/LnRyaW0oKSk7XG5cdFx0Y29uc3QgcGFyc2VkQ29tbWl0Q291bnQgPSBOdW1iZXIoY29tbWl0Q291bnQ/LnRyaW0oKSk7XG5cdFx0cmV0dXJuIHtcblx0XHRcdGhhc1ZpcnR1YWxGaWxlU3lzdGVtOiBCb29sZWFuKHZpcnR1YWxGaWxlU3lzdGVtPy50cmltKCkpIHx8IHNwYXJzZUNoZWNrb3V0RW5hYmxlZCxcblx0XHRcdGJhc2VsaW5lQ29tbWl0VGltZXN0YW1wOiBOdW1iZXIuaXNGaW5pdGUodGltZXN0YW1wU2Vjb25kcykgPyB0aW1lc3RhbXBTZWNvbmRzICogMTAwMCA6IHVuZGVmaW5lZCxcblx0XHRcdGNvbW1pdENvdW50OiBOdW1iZXIuaXNGaW5pdGUocGFyc2VkQ29tbWl0Q291bnQpID8gcGFyc2VkQ29tbWl0Q291bnQgOiB1bmRlZmluZWQsXG5cdFx0XHR3b3Jrc3BhY2VGaWxlQ291bnQ6IHdvcmtzcGFjZUZpbGVzPy5zcGxpdCgnXFx4MDAnKS5maWx0ZXIoQm9vbGVhbikubGVuZ3RoID8/IDAsXG5cdFx0fTtcblx0fVxuXG5cdGFzeW5jIGdldERpZmZQYXRjaEJldHdlZW5SZWZzKHdvcmtpbmdEaXJlY3Rvcnk6IFVSSSwgb3B0aW9uczogeyByZWFkb25seSBmcm9tUmVmOiBzdHJpbmc7IHJlYWRvbmx5IHRvUmVmOiBzdHJpbmc7IHJlYWRvbmx5IHBhdGhzOiByZWFkb25seSBzdHJpbmdbXTsgcmVhZG9ubHkgbWF4QnVmZmVyOiBudW1iZXIgfSk6IFByb21pc2U8eyByZWFkb25seSBwYXRjaDogc3RyaW5nIHwgdW5kZWZpbmVkOyByZWFkb25seSB0b29MYXJnZTogYm9vbGVhbiB9IHwgdW5kZWZpbmVkPiB7XG5cdFx0Y29uc3QgcmVwb3NpdG9yeVJvb3QgPSBhd2FpdCB0aGlzLmdldFJlcG9zaXRvcnlSb290KHdvcmtpbmdEaXJlY3RvcnkpO1xuXHRcdGlmICghcmVwb3NpdG9yeVJvb3QpIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXHRcdGNvbnN0IHBhdGhzID0gWy4uLm5ldyBTZXQob3B0aW9ucy5wYXRocyldO1xuXHRcdGlmIChwYXRocy5sZW5ndGggPT09IDApIHtcblx0XHRcdHJldHVybiB7IHBhdGNoOiAnJywgdG9vTGFyZ2U6IGZhbHNlIH07XG5cdFx0fVxuXHRcdHRyeSB7XG5cdFx0XHRjb25zdCBwYXRjaCA9IGF3YWl0IHRoaXMuX3J1bkdpdChyZXBvc2l0b3J5Um9vdCwgWydkaWZmJywgJy0tcGF0Y2gnLCAnLS1uby1leHQtZGlmZicsICctLWZpbmQtcmVuYW1lcycsICctLWRpZmYtZmlsdGVyPUFETVInLCBvcHRpb25zLmZyb21SZWYsIG9wdGlvbnMudG9SZWYsICctLScsIC4uLnBhdGhzXSwgeyBtYXhCdWZmZXI6IG9wdGlvbnMubWF4QnVmZmVyLCB0aHJvd09uRXJyb3I6IHRydWUgfSk7XG5cdFx0XHRyZXR1cm4gcGF0Y2ggPT09IHVuZGVmaW5lZCA/IHVuZGVmaW5lZCA6IHsgcGF0Y2gsIHRvb0xhcmdlOiBmYWxzZSB9O1xuXHRcdH0gY2F0Y2ggKGVycm9yKSB7XG5cdFx0XHRpZiAoaXNNYXhCdWZmZXJFcnJvcihlcnJvcikpIHtcblx0XHRcdFx0cmV0dXJuIHsgcGF0Y2g6IHVuZGVmaW5lZCwgdG9vTGFyZ2U6IHRydWUgfTtcblx0XHRcdH1cblx0XHRcdHRocm93IGVycm9yO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgX2NvbXB1dGVTZXNzaW9uR2l0U3RhdGUod29ya2luZ0RpcmVjdG9yeTogVVJJLCBjb25maWd1cmVkQmFzZUJyYW5jaD86IHN0cmluZyk6IFByb21pc2U8SVNlc3Npb25HaXRTdGF0ZSB8IHVuZGVmaW5lZD4ge1xuXHRcdGNvbnN0IHJlcG9zaXRvcnlSb290ID0gYXdhaXQgdGhpcy5nZXRSZXBvc2l0b3J5Um9vdCh3b3JraW5nRGlyZWN0b3J5KTtcblx0XHRpZiAoIXJlcG9zaXRvcnlSb290KSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblxuXHRcdC8vIFJ1biBhbGwgcHJvYmVzIGluIHBhcmFsbGVsLiBFYWNoIGhhbmRsZXMgaXRzIG93biBlcnJvcnMgYW5kIHJldHVybnNcblx0XHQvLyB1bmRlZmluZWQgb24gZmFpbHVyZSBzbyB3ZSBjYW4gcG9wdWxhdGUgZmllbGRzIGluZGVwZW5kZW50bHkuXG5cdFx0Y29uc3QgW1xuXHRcdFx0c3RhdHVzT3V0cHV0LFxuXHRcdFx0cmVtb3Rlc091dHB1dCxcblx0XHRcdGRlZmF1bHRCcmFuY2hSZWYsXG5cdFx0XSA9IGF3YWl0IFByb21pc2UuYWxsKFtcblx0XHRcdHRoaXMuX3J1bkdpdFN0YXR1cyhyZXBvc2l0b3J5Um9vdCwgWyctYicsICctLXBvcmNlbGFpbj12MiddKSxcblx0XHRcdHRoaXMuX3J1bkdpdChyZXBvc2l0b3J5Um9vdCwgWydyZW1vdGUnLCAnLXYnXSksXG5cdFx0XHRjb25maWd1cmVkQmFzZUJyYW5jaCA/IHVuZGVmaW5lZCA6IHRoaXMuX3J1bkdpdChyZXBvc2l0b3J5Um9vdCwgWydzeW1ib2xpYy1yZWYnLCAnLS1xdWlldCcsICdyZWZzL3JlbW90ZXMvb3JpZ2luL0hFQUQnXSksXG5cdFx0XSk7XG5cblx0XHRjb25zdCBzdGF0dXMgPSBwYXJzZUdpdFN0YXR1c1YyKHN0YXR1c091dHB1dCk7XG5cdFx0Y29uc3QgaGFzR2l0SHViUmVtb3RlID0gcGFyc2VIYXNHaXRIdWJSZW1vdGUocmVtb3Rlc091dHB1dCk7XG5cdFx0Y29uc3QgYmFzZUJyYW5jaE5hbWUgPSBjb25maWd1cmVkQmFzZUJyYW5jaCA/PyBwYXJzZURlZmF1bHRCcmFuY2hSZWYoZGVmYXVsdEJyYW5jaFJlZik7XG5cdFx0Y29uc3QgZ2l0aHViUmVwbyA9IHBhcnNlR2l0SHViUmVwb0Zyb21SZW1vdGUocmVtb3Rlc091dHB1dCk7XG5cdFx0Y29uc3QgdXBzdHJlYW1SZW1vdGUgPSBzdGF0dXMudXBzdHJlYW1CcmFuY2hOYW1lPy5zcGxpdCgnLycpWzBdO1xuXHRcdC8vIGBnaCBwciBjaGVja291dGAgY2FuIGNyZWF0ZSBhIGxvY2FsIGJyYW5jaCB3aG9zZSBoZWFkIGxpdmVzIG9uIGEgZm9yayBidXRcblx0XHQvLyBoYXMgbm8gdXBzdHJlYW0gdHJhY2tpbmcgcmVmOyBHaXQgc3RpbGwgcmVwb3J0cyB0aGUgYnJhbmNoJ3MgcHVzaCByZW1vdGUsXG5cdFx0Ly8gd2hpY2ggY2FuIGJlIGEgcmVtb3RlIG5hbWUgb3IgdGhlIGxpdGVyYWwgZm9yayBVUkwuXG5cdFx0Y29uc3QgW3B1c2hSZW1vdGUsIGJhc2VCcmFuY2hEaXZlcmdlbmNlXSA9IGF3YWl0IFByb21pc2UuYWxsKFtcblx0XHRcdCF1cHN0cmVhbVJlbW90ZSAmJiBzdGF0dXMuYnJhbmNoTmFtZVxuXHRcdFx0XHQ/IHRoaXMuX2dldFB1c2hSZW1vdGUocmVwb3NpdG9yeVJvb3QsIHN0YXR1cy5icmFuY2hOYW1lKVxuXHRcdFx0XHQ6IHVuZGVmaW5lZCxcblx0XHRcdGJhc2VCcmFuY2hOYW1lICYmIHN0YXR1cy5icmFuY2hOYW1lICYmIHN0YXR1cy5icmFuY2hOYW1lICE9PSBiYXNlQnJhbmNoTmFtZVxuXHRcdFx0XHQ/IHRoaXMuX2NvbXB1dGVCYXNlQnJhbmNoRGl2ZXJnZW5jZShyZXBvc2l0b3J5Um9vdCwgYmFzZUJyYW5jaE5hbWUsIHN0YXR1cy5vdXRnb2luZ0NoYW5nZXMgPT09IHVuZGVmaW5lZClcblx0XHRcdFx0OiB1bmRlZmluZWQsXG5cdFx0XSk7XG5cdFx0Y29uc3QgZ2l0aHViSGVhZFJlcG8gPSB1cHN0cmVhbVJlbW90ZVxuXHRcdFx0PyBwYXJzZUdpdEh1YlJlcG9Gcm9tUmVtb3RlKHJlbW90ZXNPdXRwdXQsIHVwc3RyZWFtUmVtb3RlKVxuXHRcdFx0OiBwYXJzZUdpdEh1YkhlYWRSZXBvRnJvbVJlbW90ZVNlbGVjdGlvbihyZW1vdGVzT3V0cHV0LCBwdXNoUmVtb3RlKTtcblxuXHRcdC8vIGBnaXQgc3RhdHVzIC1iIC0tcG9yY2VsYWluPXYyYCBvbmx5IGVtaXRzIGFoZWFkL2JlaGluZCBjb3VudHMgd2hlbiB0aGVcblx0XHQvLyBicmFuY2ggaGFzIGFuIHVwc3RyZWFtIHRyYWNraW5nIHJlZi4gRm9yIGFnZW50LWhvc3Qgd29ya3RyZWVzIHRoZVxuXHRcdC8vIGJyYW5jaCBpcyB0eXBpY2FsbHkgY3JlYXRlZCBsb2NhbGx5IHdpdGggbm8gdXBzdHJlYW0sIHNvIHRoZSB1c2VyIGNhblxuXHRcdC8vIGhhdmUgY29tbWl0dGVkIHdvcmsgdGhhdCB3ZSdkIG90aGVyd2lzZSByZXBvcnQgYXMgMCBvdXRnb2luZyBjaGFuZ2VzXG5cdFx0Ly8gYW5kIHRoZSBcIkNyZWF0ZSBQUlwiIGJ1dHRvbiB3b3VsZCBuZXZlciBhcHBlYXIuIEZhbGwgYmFjayB0byBjb3VudGluZ1xuXHRcdC8vIGNvbW1pdHMgcmVsYXRpdmUgdG8gdGhlIGJhc2UgYnJhbmNoIFx1MjAxNCB0aGF0IG1hdGNoZXMgd2hhdCB0aGUgdXNlclxuXHRcdC8vIGFjdHVhbGx5IGNhcmVzIGFib3V0IGZvciBcImlzIHRoZXJlIHdvcmsgdG8gUFI/XCIuXG5cdFx0bGV0IG91dGdvaW5nQ2hhbmdlcyA9IHN0YXR1cy5vdXRnb2luZ0NoYW5nZXM7XG5cdFx0aWYgKG91dGdvaW5nQ2hhbmdlcyA9PT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRvdXRnb2luZ0NoYW5nZXMgPSBiYXNlQnJhbmNoRGl2ZXJnZW5jZT8uY291bnQ7XG5cdFx0fVxuXG5cdFx0Y29uc3QgcmVzdWx0OiBJU2Vzc2lvbkdpdFN0YXRlID0ge1xuXHRcdFx0aGFzR2l0SHViUmVtb3RlLFxuXHRcdFx0YnJhbmNoTmFtZTogc3RhdHVzLmJyYW5jaE5hbWUsXG5cdFx0XHRiYXNlQnJhbmNoTmFtZSxcblx0XHRcdHVwc3RyZWFtQnJhbmNoTmFtZTogc3RhdHVzLnVwc3RyZWFtQnJhbmNoTmFtZSxcblx0XHRcdGluY29taW5nQ2hhbmdlczogc3RhdHVzLmluY29taW5nQ2hhbmdlcyxcblx0XHRcdG91dGdvaW5nQ2hhbmdlcyxcblx0XHRcdHVuY29tbWl0dGVkQ2hhbmdlczogc3RhdHVzLnVuY29tbWl0dGVkQ2hhbmdlcyxcblx0XHRcdGhhc0Jhc2VCcmFuY2hDaGFuZ2VzOiBiYXNlQnJhbmNoRGl2ZXJnZW5jZT8uaGFzQ2hhbmdlcyxcblx0XHRcdGdpdGh1Yk93bmVyOiBnaXRodWJSZXBvPy5vd25lcixcblx0XHRcdGdpdGh1YkhlYWRPd25lcjogZ2l0aHViSGVhZFJlcG8/Lm93bmVyLFxuXHRcdFx0Z2l0aHViUmVwbzogZ2l0aHViUmVwbz8ucmVwbyxcblx0XHR9O1xuXHRcdC8vIFN0cmlwIHVuZGVmaW5lZCBmaWVsZHMgc28gdGhlIHJlc3VsdGluZyBvYmplY3QgaXMgdGhlIHNhbWUgcmVnYXJkbGVzc1xuXHRcdC8vIG9mIHdoaWNoIHByb2JlcyBzdWNjZWVkZWQgXHUyMDE0IGVhc2llciB0byBjb21wYXJlIGluIHRlc3RzLlxuXHRcdHJldHVybiBzdHJpcFVuZGVmaW5lZChyZXN1bHQpO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBfZ2V0UHVzaFJlbW90ZShyZXBvc2l0b3J5Um9vdDogVVJJLCBicmFuY2hOYW1lOiBzdHJpbmcpOiBQcm9taXNlPHN0cmluZyB8IHVuZGVmaW5lZD4ge1xuXHRcdHJldHVybiAoYXdhaXQgdGhpcy5fcnVuR2l0KHJlcG9zaXRvcnlSb290LCBbJ2Zvci1lYWNoLXJlZicsICctLWZvcm1hdD0lKHB1c2g6cmVtb3RlbmFtZSknLCBgcmVmcy9oZWFkcy8ke2JyYW5jaE5hbWV9YF0pKT8udHJpbSgpIHx8IHVuZGVmaW5lZDtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgX2NvbXB1dGVCYXNlQnJhbmNoRGl2ZXJnZW5jZShyZXBvc2l0b3J5Um9vdDogVVJJLCBiYXNlQnJhbmNoTmFtZTogc3RyaW5nLCBjb3VudENvbW1pdHM6IGJvb2xlYW4pOiBQcm9taXNlPHsgcmVhZG9ubHkgaGFzQ2hhbmdlczogYm9vbGVhbjsgcmVhZG9ubHkgY291bnQ/OiBudW1iZXIgfSB8IHVuZGVmaW5lZD4ge1xuXHRcdGNvbnN0IGxvY2FsUmVmID0gYHJlZnMvaGVhZHMvJHtiYXNlQnJhbmNoTmFtZX1gO1xuXHRcdGNvbnN0IHJlbW90ZVJlZiA9IGByZWZzL3JlbW90ZXMvb3JpZ2luLyR7YmFzZUJyYW5jaE5hbWV9YDtcblx0XHRjb25zdCByZWZzID0gYXdhaXQgdGhpcy5fcnVuR2l0KHJlcG9zaXRvcnlSb290LCBbJ2Zvci1lYWNoLXJlZicsICctLWZvcm1hdD0lKHJlZm5hbWUpJywgbG9jYWxSZWYsIHJlbW90ZVJlZl0pO1xuXHRcdGlmIChyZWZzID09PSB1bmRlZmluZWQpIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXHRcdGNvbnN0IHJlZk5hbWVzID0gbmV3IFNldChyZWZzLnNwbGl0KC9cXHI/XFxuL2cpLmZpbHRlcihCb29sZWFuKSk7XG5cdFx0Y29uc3QgYmFzZUJyYW5jaFJlZiA9IHJlZk5hbWVzLmhhcyhsb2NhbFJlZikgPyBsb2NhbFJlZiA6IHJlZk5hbWVzLmhhcyhyZW1vdGVSZWYpID8gcmVtb3RlUmVmIDogYmFzZUJyYW5jaE5hbWU7XG5cdFx0Ly8gVXBzdHJlYW0gZGl2ZXJnZW5jZSBjYW4gcmVtYWluIGFmdGVyIGEgbG9jYWwgbWVyZ2UsIHNvIG9wZXJhdGlvbiBhdmFpbGFiaWxpdHkgdHJhY2tzIHRoZSBsb2NhbCBiYXNlIHNlcGFyYXRlbHkuXG5cdFx0Y29uc3Qgb3V0cHV0ID0gYXdhaXQgdGhpcy5fcnVuR2l0KHJlcG9zaXRvcnlSb290LCBbJ3Jldi1saXN0JywgY291bnRDb21taXRzID8gJy0tY291bnQnIDogJy0tbWF4LWNvdW50PTEnLCBgJHtiYXNlQnJhbmNoUmVmfS4uSEVBRGBdKTtcblx0XHRpZiAob3V0cHV0ID09PSB1bmRlZmluZWQpIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXHRcdGlmICghY291bnRDb21taXRzKSB7XG5cdFx0XHRyZXR1cm4geyBoYXNDaGFuZ2VzOiBvdXRwdXQudHJpbSgpLmxlbmd0aCA+IDAgfTtcblx0XHR9XG5cdFx0Y29uc3QgY291bnQgPSBOdW1iZXIob3V0cHV0LnRyaW0oKSk7XG5cdFx0cmV0dXJuIE51bWJlci5pc0Zpbml0ZShjb3VudCkgPyB7IGhhc0NoYW5nZXM6IGNvdW50ID4gMCwgY291bnQgfSA6IHVuZGVmaW5lZDtcblx0fVxuXG5cdHByaXZhdGUgX3J1bkdpdFN0YXR1cyh3b3JraW5nRGlyZWN0b3J5OiBVUkksIGFyZ3M6IHJlYWRvbmx5IHN0cmluZ1tdKTogUHJvbWlzZTxzdHJpbmcgfCB1bmRlZmluZWQ+IHtcblx0XHQvLyBCYWNrZ3JvdW5kIHN0YXR1cyBwcm9iZXMgbXVzdCBub3QgY29udGVuZCB3aXRoIG11dGF0aW5nIGdpdCBjb21tYW5kcyBmb3IgaW5kZXgubG9jay5cblx0XHRyZXR1cm4gdGhpcy5fcnVuR2l0KHdvcmtpbmdEaXJlY3RvcnksIFsnc3RhdHVzJywgLi4uYXJnc10sIHsgZW52OiB7IEdJVF9PUFRJT05BTF9MT0NLUzogJzAnIH0gfSk7XG5cdH1cblxuXHRwcml2YXRlIF9ydW5HaXQod29ya2luZ0RpcmVjdG9yeTogVVJJLCBhcmdzOiByZWFkb25seSBzdHJpbmdbXSwgb3B0aW9ucz86IHsgcmVhZG9ubHkgdGltZW91dD86IG51bWJlcjsgcmVhZG9ubHkgdGhyb3dPbkVycm9yPzogYm9vbGVhbjsgcmVhZG9ubHkgZW52PzogUmVjb3JkPHN0cmluZywgc3RyaW5nPjsgcmVhZG9ubHkgbWF4QnVmZmVyPzogbnVtYmVyOyByZWFkb25seSBvblN0ZGVycj86IChjaHVuazogc3RyaW5nKSA9PiB2b2lkIH0pOiBQcm9taXNlPHN0cmluZyB8IHVuZGVmaW5lZD4ge1xuXHRcdHRoaXMuX2xvZ1NlcnZpY2UudHJhY2UoYFthZ2VudEhvc3RHaXRTZXJ2aWNlXSA+IGdpdCAke2FyZ3Muam9pbignICcpfWApO1xuXG5cdFx0cmV0dXJuIG5ldyBQcm9taXNlKChyZXNvbHZlLCByZWplY3QpID0+IHtcblx0XHRcdGNvbnN0IGVudiA9IG9wdGlvbnM/LmVudiA/IHsgLi4ucHJvY2Vzcy5lbnYsIC4uLm9wdGlvbnMuZW52IH0gOiB1bmRlZmluZWQ7XG5cdFx0XHRjb25zdCB0aW1lb3V0TXMgPSBvcHRpb25zPy50aW1lb3V0ID8/IDUwMDA7XG5cdFx0XHQvLyBVc2Ugb3VyIG93biB0aW1lciByYXRoZXIgdGhhbiBleGVjRmlsZSdzIGB0aW1lb3V0YCBvcHRpb24gc29cblx0XHRcdC8vIHdlIGNhbiBkZWZpbml0aXZlbHkgZmxhZyB0aGUgdGltZW91dCBjYXNlIGluIHRoZSBlcnJvclxuXHRcdFx0Ly8gbWVzc2FnZSBcdTIwMTQgZXhlY0ZpbGUgb25seSBzdXJmYWNlcyBzaWduYWwva2lsbGVkLCB3aGljaCBjYW5cblx0XHRcdC8vIGFsc28gbWVhbiB0aGUgcHJvY2VzcyB3YXMga2lsbGVkIGZvciBvdGhlciByZWFzb25zLlxuXHRcdFx0bGV0IGRpZFRpbWVPdXQgPSBmYWxzZTtcblx0XHRcdC8vIERlZmF1bHQgbWF4QnVmZmVyIGlzIDMyTUIgXHUyMDE0IE5vZGUncyBkZWZhdWx0IGlzIH4xTUIsIHdoaWNoIGlzXG5cdFx0XHQvLyBlYXN5IHRvIGV4Y2VlZCBmb3IgZGlmZiBvdXRwdXQgaW4gbGFyZ2UgcmVwb3MuIEV4Y2VlZGluZyBpdFxuXHRcdFx0Ly8gY2F1c2VzIGV4ZWNGaWxlIHRvIGVycm9yIGFuZCB3ZSdkIHNpbGVudGx5IGRyb3AgdGhlIGRpZmYuXG5cdFx0XHRjb25zdCBjaGlsZCA9IGNwLmV4ZWNGaWxlKCdnaXQnLCBbLi4uYXJnc10sIHsgY3dkOiB3b3JraW5nRGlyZWN0b3J5LmZzUGF0aCwgZW52LCBtYXhCdWZmZXI6IG9wdGlvbnM/Lm1heEJ1ZmZlciA/PyAzMiAqIDEwMjQgKiAxMDI0IH0sIChlcnJvciwgc3Rkb3V0LCBzdGRlcnIpID0+IHtcblx0XHRcdFx0aWYgKGVycm9yKSB7XG5cdFx0XHRcdFx0Ly8gc3RkZXJyIGlzIHN1bW1hcml6ZWQgaW4gdGhlIHRocm93biBlcnJvciBtZXNzYWdlIHRvIGtlZXBcblx0XHRcdFx0XHQvLyBpdCByZWFkYWJsZTsgbG9nIHRoZSBmdWxsIHVubW9kaWZpZWQgb3V0cHV0IGhlcmUgc28gdGhlXG5cdFx0XHRcdFx0Ly8gcmF3IHByb2dyZXNzL2RpYWdub3N0aWMgdGV4dCBpcyBzdGlsbCBhdmFpbGFibGUuXG5cdFx0XHRcdFx0aWYgKHN0ZGVycikge1xuXHRcdFx0XHRcdFx0dGhpcy5fbG9nU2VydmljZS53YXJuKGBbYWdlbnRIb3N0R2l0U2VydmljZV0gPiBnaXQgJHthcmdzLmpvaW4oJyAnKX0gZmFpbGVkOyBmdWxsIHN0ZGVycjpcXG4ke3N0ZGVycn1gKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0aWYgKG9wdGlvbnM/LnRocm93T25FcnJvcikge1xuXHRcdFx0XHRcdFx0cmVqZWN0KG5ldyBFcnJvcihmb3JtYXRHaXRFcnJvcihhcmdzLCB0aW1lb3V0TXMsIGRpZFRpbWVPdXQsIGVycm9yLCBzdGRlcnIpLCB7IGNhdXNlOiBlcnJvciB9KSk7XG5cdFx0XHRcdFx0XHRyZXR1cm47XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdHJlc29sdmUodW5kZWZpbmVkKTtcblx0XHRcdFx0XHRyZXR1cm47XG5cdFx0XHRcdH1cblx0XHRcdFx0cmVzb2x2ZShzdGRvdXQpO1xuXHRcdFx0fSk7XG5cdFx0XHQvLyBgZXhlY0ZpbGVgIGtlZXBzIGl0cyBvd24gbGlzdGVuZXIgZm9yIHRoZSBidWZmZXJlZCByZXN1bHQ7IGFuXG5cdFx0XHQvLyBleHRyYSBvbmUganVzdCB0ZWVzIHRoZSBzYW1lIGNodW5rcyBmb3IgbGl2ZSBwcm9ncmVzcy5cblx0XHRcdGNvbnN0IG9uU3RkZXJyID0gb3B0aW9ucz8ub25TdGRlcnI7XG5cdFx0XHRpZiAob25TdGRlcnIpIHtcblx0XHRcdFx0Y2hpbGQuc3RkZXJyPy5vbignZGF0YScsIChjaHVuazogQnVmZmVyIHwgc3RyaW5nKSA9PiBvblN0ZGVycihjaHVuay50b1N0cmluZygpKSk7XG5cdFx0XHR9XG5cdFx0XHRjb25zdCB0aW1lciA9IHNldFRpbWVvdXQoKCkgPT4ge1xuXHRcdFx0XHRkaWRUaW1lT3V0ID0gdHJ1ZTtcblx0XHRcdFx0Y2hpbGQua2lsbCgpO1xuXHRcdFx0fSwgdGltZW91dE1zKTtcblx0XHRcdGNoaWxkLm9uKCdleGl0JywgKCkgPT4gY2xlYXJUaW1lb3V0KHRpbWVyKSk7XG5cdFx0fSk7XG5cdH1cbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGdldFJlbW90ZVRyYWNraW5nUmVmKGJyYW5jaDogc3RyaW5nKTogeyBicmFuY2hOYW1lOiBzdHJpbmc7IHJlbW90ZUJyYW5jaDogc3RyaW5nOyByZW1vdGVSZWY6IHN0cmluZzsgc291cmNlUmVmOiBzdHJpbmcgfSB8IHVuZGVmaW5lZCB7XG5cdGNvbnN0IHB1bGxSZXF1ZXN0UmVmID0gL15yZWZzXFwvcHVsbFxcLyg/PG51bWJlcj5cXGQrKVxcL2hlYWQkLy5leGVjKGJyYW5jaCk7XG5cdGNvbnN0IGJyYW5jaE5hbWUgPSBwdWxsUmVxdWVzdFJlZj8uZ3JvdXBzXG5cdFx0PyBgcHVsbC8ke3B1bGxSZXF1ZXN0UmVmLmdyb3Vwcy5udW1iZXJ9L2hlYWRgXG5cdFx0OiBicmFuY2hcblx0XHRcdC5yZXBsYWNlKC9ecmVmc1xcL3JlbW90ZXNcXC9vcmlnaW5cXC8vLCAnJylcblx0XHRcdC5yZXBsYWNlKC9eb3JpZ2luXFwvLywgJycpXG5cdFx0XHQucmVwbGFjZSgvXnJlZnNcXC9oZWFkc1xcLy8sICcnKTtcblx0aWYgKGJyYW5jaE5hbWUuc3RhcnRzV2l0aCgncmVmcy8nKSkge1xuXHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdH1cblx0Y29uc3QgcmVtb3RlQnJhbmNoID0gYG9yaWdpbi8ke2JyYW5jaE5hbWV9YDtcblx0cmV0dXJuIHtcblx0XHRicmFuY2hOYW1lLFxuXHRcdHJlbW90ZUJyYW5jaCxcblx0XHRyZW1vdGVSZWY6IGByZWZzL3JlbW90ZXMvJHtyZW1vdGVCcmFuY2h9YCxcblx0XHRzb3VyY2VSZWY6IHB1bGxSZXF1ZXN0UmVmID8gYnJhbmNoIDogYHJlZnMvaGVhZHMvJHticmFuY2hOYW1lfWAsXG5cdH07XG59XG5cbi8qKlxuICogSW5jcmVtZW50YWxseSBleHRyYWN0cyBjaGVja291dCBwcm9ncmVzcyBmcm9tIGdpdCdzIHN0ZGVyci4gR2l0IHJld3JpdGVzIHRoZVxuICogcHJvZ3Jlc3MgbGluZSBpbiBwbGFjZSB3aXRoIGNhcnJpYWdlIHJldHVybnMsIHNvIGEgY2h1bmsgY2FycmllcyBhbnkgbnVtYmVyXG4gKiBvZiBzYW1wbGVzIGFuZCBtYXkgc3BsaXQgb25lIGFjcm9zcyBjaHVuayBib3VuZGFyaWVzOyB0aGUgdHJhaWxpbmcgcGFydGlhbFxuICogbGluZSBpcyBoZWxkIGJhY2sgdW50aWwgdGhlIHJlc3QgYXJyaXZlcy4gRXZlcnkgY29tcGxldGUgc2FtcGxlIGlzIGZvcndhcmRlZFxuICogdmVyYmF0aW0gXHUyMDE0IHJvdW5kaW5nIGFuZCByYXRlIGxpbWl0aW5nIGJlbG9uZyB0byB0aGUgY29uc3VtZXIsIHdoaWNoIGtub3dzIGhvd1xuICogaXQgd2FudHMgdG8gcHJlc2VudCB0aGVtLlxuICpcbiAqIEV4cG9ydGVkIGZvciB0ZXN0cy5cbiAqL1xuZXhwb3J0IGNsYXNzIEdpdENoZWNrb3V0UHJvZ3Jlc3NQYXJzZXIge1xuXG5cdHByaXZhdGUgc3RhdGljIHJlYWRvbmx5IF9wYXR0ZXJuID0gL1VwZGF0aW5nIGZpbGVzOlxccytcXGQrJSBcXCgoPzxkb25lPlxcZCspXFwvKD88dG90YWw+XFxkKylcXCkvZztcblxuXHRwcml2YXRlIF9wZW5kaW5nID0gJyc7XG5cblx0Y29uc3RydWN0b3IocHJpdmF0ZSByZWFkb25seSBfb25Qcm9ncmVzczogKHByb2dyZXNzOiBJV29ya3RyZWVGaWxlUHJvZ3Jlc3MpID0+IHZvaWQpIHsgfVxuXG5cdHB1c2goY2h1bms6IHN0cmluZyk6IHZvaWQge1xuXHRcdC8vIEtlZXAgd2hhdGV2ZXIgZm9sbG93cyB0aGUgbGFzdCBsaW5lIGJyZWFrIGZvciB0aGUgbmV4dCBjaHVuazsgZ2l0XG5cdFx0Ly8gc2VwYXJhdGVzIHByb2dyZXNzIHNhbXBsZXMgd2l0aCBgXFxyYCBhbmQgZW5kcyB0aGUgcGhhc2Ugd2l0aCBgXFxuYC5cblx0XHRjb25zdCBidWZmZXIgPSB0aGlzLl9wZW5kaW5nICsgY2h1bms7XG5cdFx0Y29uc3QgbGFzdEJyZWFrID0gTWF0aC5tYXgoYnVmZmVyLmxhc3RJbmRleE9mKCdcXHInKSwgYnVmZmVyLmxhc3RJbmRleE9mKCdcXG4nKSk7XG5cdFx0aWYgKGxhc3RCcmVhayA9PT0gLTEpIHtcblx0XHRcdHRoaXMuX3BlbmRpbmcgPSBidWZmZXI7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdHRoaXMuX3BlbmRpbmcgPSBidWZmZXIuc3Vic3RyaW5nKGxhc3RCcmVhayArIDEpO1xuXG5cdFx0Y29uc3QgY29tcGxldGUgPSBidWZmZXIuc3Vic3RyaW5nKDAsIGxhc3RCcmVhayk7XG5cdFx0R2l0Q2hlY2tvdXRQcm9ncmVzc1BhcnNlci5fcGF0dGVybi5sYXN0SW5kZXggPSAwO1xuXHRcdGxldCBtYXRjaDogUmVnRXhwRXhlY0FycmF5IHwgbnVsbDtcblx0XHR3aGlsZSAoKG1hdGNoID0gR2l0Q2hlY2tvdXRQcm9ncmVzc1BhcnNlci5fcGF0dGVybi5leGVjKGNvbXBsZXRlKSkpIHtcblx0XHRcdGNvbnN0IGZpbGVzVG90YWwgPSBOdW1iZXIobWF0Y2guZ3JvdXBzIS50b3RhbCk7XG5cdFx0XHRpZiAoZmlsZXNUb3RhbCA+IDApIHtcblx0XHRcdFx0dGhpcy5fb25Qcm9ncmVzcyh7IGZpbGVzRG9uZTogTnVtYmVyKG1hdGNoLmdyb3VwcyEuZG9uZSksIGZpbGVzVG90YWwgfSk7XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG59XG5cbi8qKlxuICogQSBwYXRoIHRvIGNvcHkgaW50byBhIHdvcmt0cmVlLCBwbHVzIGhvdyBtYW55IGluZGl2aWR1YWwgaWdub3JlZCBmaWxlcyBpdFxuICogY292ZXJzIFx1MjAxNCBvbmUgZm9yIGEgcGxhaW4gZmlsZSwgdGhlIHdob2xlIHRhbGx5IGZvciBhIGNvbGxhcHNlZCBkaXJlY3RvcnkgXHUyMDE0XG4gKiBzbyBjYWxsZXJzIGNhbiByZXBvcnQgcHJvZ3Jlc3MgaW4gZmlsZXMgcmF0aGVyIHRoYW4gaW4gZW50cmllcyBvZiB3aWxkbHlcbiAqIGRpZmZlcmVudCBzaXplLlxuICovXG5pbnRlcmZhY2UgSVdvcmt0cmVlSW5jbHVkZUVudHJ5IHtcblx0cmVhZG9ubHkgc291cmNlUGF0aDogc3RyaW5nO1xuXHRyZWFkb25seSBmaWxlQ291bnQ6IG51bWJlcjtcbn1cblxuLyoqXG4gKiBCdWlsZHMgdGhlIGVudHJpZXMgdG8gY29weTogb25lIHBlciBjb2xsYXBzZWQgZGlyZWN0b3J5LCBzdGFuZGluZyBpbiBmb3IgYWxsXG4gKiB0aGUgbWF0Y2hlZCBmaWxlcyBiZW5lYXRoIGl0LCBwbHVzIG9uZSBwZXIgbWF0Y2hlZCBmaWxlIG5vIGNvbGxhcHNlZFxuICogZGlyZWN0b3J5IGNvdmVycy5cbiAqL1xuZnVuY3Rpb24gdG9Xb3JrdHJlZUluY2x1ZGVFbnRyaWVzKHJlcG9zaXRvcnlSb290OiBVUkksIG1hdGNoZWRGaWxlczogcmVhZG9ubHkgc3RyaW5nW10sIGNvbGxhcHNlZERpcmVjdG9yaWVzOiBSZWFkb25seVNldDxzdHJpbmc+KTogSVdvcmt0cmVlSW5jbHVkZUVudHJ5W10ge1xuXHRjb25zdCB0b0VudHJ5ID0gKHJlbGF0aXZlUGF0aDogc3RyaW5nLCBmaWxlQ291bnQ6IG51bWJlcik6IElXb3JrdHJlZUluY2x1ZGVFbnRyeSA9PiAoe1xuXHRcdHNvdXJjZVBhdGg6IHBhdGguam9pbihyZXBvc2l0b3J5Um9vdC5mc1BhdGgsIHJlbGF0aXZlUGF0aCksXG5cdFx0ZmlsZUNvdW50LFxuXHR9KTtcblxuXHQvLyBTZWVkZWQgd2l0aCBldmVyeSBjb2xsYXBzZWQgZGlyZWN0b3J5IHNvIG9uZSBpcyBzdGlsbCBlbWl0dGVkIGV2ZW4gaWYgdGhlXG5cdC8vIHRhbGx5IGJlbG93IG5ldmVyIHJlYWNoZXMgaXQuXG5cdGNvbnN0IGRpcmVjdG9yeUZpbGVDb3VudHMgPSBuZXcgTWFwPHN0cmluZywgbnVtYmVyPigpO1xuXHRmb3IgKGNvbnN0IGRpciBvZiBjb2xsYXBzZWREaXJlY3Rvcmllcykge1xuXHRcdGRpcmVjdG9yeUZpbGVDb3VudHMuc2V0KGRpciwgMCk7XG5cdH1cblxuXHRjb25zdCBmaWxlRW50cmllczogSVdvcmt0cmVlSW5jbHVkZUVudHJ5W10gPSBbXTtcblx0Zm9yIChjb25zdCBmaWxlIG9mIG1hdGNoZWRGaWxlcykge1xuXHRcdGNvbnN0IGNvbnRhaW5pbmdEaXJlY3RvcnkgPSBjb2xsYXBzZWREaXJlY3Rvcmllcy5zaXplID4gMFxuXHRcdFx0PyBmaW5kQ29udGFpbmluZ0RpcmVjdG9yeShmaWxlLCBjb2xsYXBzZWREaXJlY3Rvcmllcylcblx0XHRcdDogdW5kZWZpbmVkO1xuXHRcdGlmIChjb250YWluaW5nRGlyZWN0b3J5ID09PSB1bmRlZmluZWQpIHtcblx0XHRcdGZpbGVFbnRyaWVzLnB1c2godG9FbnRyeShmaWxlLCAxKSk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdGRpcmVjdG9yeUZpbGVDb3VudHMuc2V0KGNvbnRhaW5pbmdEaXJlY3RvcnksIGRpcmVjdG9yeUZpbGVDb3VudHMuZ2V0KGNvbnRhaW5pbmdEaXJlY3RvcnkpISArIDEpO1xuXHRcdH1cblx0fVxuXG5cdHJldHVybiBbXG5cdFx0Li4uWy4uLmRpcmVjdG9yeUZpbGVDb3VudHNdLm1hcCgoW2RpciwgZmlsZUNvdW50XSkgPT4gdG9FbnRyeShkaXIsIGZpbGVDb3VudCkpLFxuXHRcdC4uLmZpbGVFbnRyaWVzLFxuXHRdO1xufVxuXG4vKipcbiAqIFJldHVybnMgdGhlIHNoYWxsb3dlc3QgZGlyZWN0b3J5IGZyb20gYGRpcmVjdG9yaWVzYCB0aGF0IGNvbnRhaW5zIGBmaWxlYCwgb3JcbiAqIGB1bmRlZmluZWRgIGlmIG5vbmUgZG9lcy4gYGZpbGVgIGlzIGEgcmVwb3NpdG9yeS1yZWxhdGl2ZSwgZm9yd2FyZC1zbGFzaCBwYXRoXG4gKiBhbmQgZXZlcnkgZW50cnkgaW4gYGRpcmVjdG9yaWVzYCBpcyBleHBlY3RlZCB0byBlbmQgd2l0aCBhIHRyYWlsaW5nIGAvYCAoYXNcbiAqIHByb2R1Y2VkIGJ5IGBnaXQgbHMtZmlsZXMgLS1kaXJlY3RvcnlgKS4gV2Fsa2luZyB0aGUgcGF0aCdzIGAvYCBib3VuZGFyaWVzXG4gKiBhbmQgcHJvYmluZyB0aGUgc2V0IGlzIE8ocGF0aCBkZXB0aCkgcGVyIGZpbGUsIGF2b2lkaW5nIGFuIE8oZGlyZWN0b3JpZXMpXG4gKiBzY2FuIGZvciBlYWNoIGZpbGUuXG4gKi9cbmZ1bmN0aW9uIGZpbmRDb250YWluaW5nRGlyZWN0b3J5KGZpbGU6IHN0cmluZywgZGlyZWN0b3JpZXM6IFJlYWRvbmx5U2V0PHN0cmluZz4pOiBzdHJpbmcgfCB1bmRlZmluZWQge1xuXHRsZXQgaW5kZXggPSBmaWxlLmluZGV4T2YoJy8nKTtcblx0d2hpbGUgKGluZGV4ICE9PSAtMSkge1xuXHRcdGNvbnN0IHByZWZpeCA9IGZpbGUuc2xpY2UoMCwgaW5kZXggKyAxKTtcblx0XHRpZiAoZGlyZWN0b3JpZXMuaGFzKHByZWZpeCkpIHtcblx0XHRcdHJldHVybiBwcmVmaXg7XG5cdFx0fVxuXHRcdGluZGV4ID0gZmlsZS5pbmRleE9mKCcvJywgaW5kZXggKyAxKTtcblx0fVxuXHRyZXR1cm4gdW5kZWZpbmVkO1xufVxuXG4vKipcbiAqIFJldHVybnMgd2hldGhlciBjb3B5aW5nIGEgc291cmNlIHBhdGggd291bGQgb3ZlcndyaXRlIGEgdHJhY2tlZCB3b3JrdHJlZSBwYXRoXG4gKiBvciBjb25mbGljdCB3aXRoIHRoZSBmaWxlL2RpcmVjdG9yeSBzaGFwZSBvZiBpdHMgZGVzdGluYXRpb24uIGBmaWxlYCBhbmQgYm90aFxuICogc2V0cyB1c2UgcmVwb3NpdG9yeS1yZWxhdGl2ZSwgZm9yd2FyZC1zbGFzaCBwYXRocywgd2l0aCBgd29ya3RyZWVEaXJlY3Rvcmllc2BcbiAqIGVudHJpZXMgY2FycnlpbmcgYSB0cmFpbGluZyBgL2AuXG4gKi9cbmZ1bmN0aW9uIGhhc1dvcmt0cmVlUGF0aENvbGxpc2lvbihmaWxlOiBzdHJpbmcsIHdvcmt0cmVlRmlsZXM6IFJlYWRvbmx5U2V0PHN0cmluZz4sIHdvcmt0cmVlRGlyZWN0b3JpZXM6IFJlYWRvbmx5U2V0PHN0cmluZz4pOiBib29sZWFuIHtcblx0Ly8gVGhlIGRlc3RpbmF0aW9uIGlzIGEgdHJhY2tlZCBmaWxlLCB3aGljaCB0aGUgY29weSB3b3VsZCBvdmVyd3JpdGUsIG9yIGFcblx0Ly8gdHJhY2tlZCBkaXJlY3RvcnksIHdoaWNoIGEgZmlsZSBjYW5ub3QgdGFrZSB0aGUgcGxhY2Ugb2YuXG5cdGlmICh3b3JrdHJlZUZpbGVzLmhhcyhmaWxlKSB8fCB3b3JrdHJlZURpcmVjdG9yaWVzLmhhcyhgJHtmaWxlfS9gKSkge1xuXHRcdHJldHVybiB0cnVlO1xuXHR9XG5cblx0Ly8gQW4gYW5jZXN0b3Igb2YgdGhlIGRlc3RpbmF0aW9uIGlzIGEgdHJhY2tlZCBmaWxlLCBzbyB0aGUgZGlyZWN0b3JpZXNcblx0Ly8gbGVhZGluZyB1cCB0byBpdCBjYW5ub3QgYmUgY3JlYXRlZC5cblx0bGV0IGluZGV4ID0gZmlsZS5pbmRleE9mKCcvJyk7XG5cdHdoaWxlIChpbmRleCAhPT0gLTEpIHtcblx0XHRpZiAod29ya3RyZWVGaWxlcy5oYXMoZmlsZS5zbGljZSgwLCBpbmRleCkpKSB7XG5cdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHR9XG5cdFx0aW5kZXggPSBmaWxlLmluZGV4T2YoJy8nLCBpbmRleCArIDEpO1xuXHR9XG5cdHJldHVybiBmYWxzZTtcbn1cblxuLyoqXG4gKiBXaGV0aGVyIGEgYGdpdCB3b3JrdHJlZSByZW1vdmVgL2BwcnVuZWAgZmFpbHVyZSBpcyBhIHRyYW5zaWVudCBmaWxlc3lzdGVtIG9yXG4gKiBsb2NrIHJhY2UgXHUyMDE0IGEgY29uY3VycmVudCBnaXQgcHJvY2VzcyBpbiB0aGUgd29ya3RyZWUgbGVmdCB0aGVcbiAqIGAuZ2l0L3dvcmt0cmVlcy88aWQ+YCBhZG1pbiBkaXJlY3Rvcnkgbm9uLWVtcHR5IFx1MjAxNCBhbmQgaXMgd29ydGggcmV0cnlpbmcuXG4gKiBHZW51aW5lIGZhaWx1cmVzIChhIGRpcnR5IHRyZWUgbmVlZGluZyBgLS1mb3JjZWAsIGEgbWlzc2luZyB3b3JrdHJlZSwgb3IgYW55XG4gKiBvdGhlciBmYXRhbCBnaXQgZXJyb3IpIGFyZSBub3QgcmV0cnlhYmxlLlxuICovXG5leHBvcnQgZnVuY3Rpb24gaXNSZXRyeWFibGVXb3JrdHJlZVJlbW92YWxFcnJvcihlcnJvcjogdW5rbm93bik6IGJvb2xlYW4ge1xuXHRjb25zdCBtZXNzYWdlID0gZXJyb3IgaW5zdGFuY2VvZiBFcnJvciA/IGVycm9yLm1lc3NhZ2UgOiBTdHJpbmcoZXJyb3IpO1xuXHRyZXR1cm4gL2RpcmVjdG9yeSBub3QgZW1wdHkvaS50ZXN0KG1lc3NhZ2UpXG5cdFx0fHwgL1xcYmluZGV4XFwubG9ja1xcYi9pLnRlc3QobWVzc2FnZSlcblx0XHR8fCAvdW5hYmxlIHRvICg/OmNyZWF0ZXx3cml0ZXxhcHBlbmQpW15cXG5dKlxcLmxvY2svaS50ZXN0KG1lc3NhZ2UpXG5cdFx0fHwgL2NvdWxkIG5vdCBsb2NrL2kudGVzdChtZXNzYWdlKTtcbn1cblxuLyoqXG4gKiBCdWlsZHMgYSBkaWFnbm9zdGljIGVycm9yIG1lc3NhZ2UgZm9yIGEgZmFpbGVkIGBnaXRgIGludm9jYXRpb24gdGhhdFxuICogcHJlc2VydmVzIHRoZSByZWFzb24gKHRpbWVvdXQgLyBzaWduYWwgLyBleGl0IGNvZGUpIGluc3RlYWQgb2YganVzdFxuICogc3VyZmFjaW5nIHdoYXRldmVyIGhhcHBlbmVkIHRvIGJlIG9uIHN0ZGVyci4gV2hlbiBgZ2l0YCBpcyBraWxsZWQgYnlcbiAqIHRoZSB0aW1lb3V0LCBzdGRlcnIgb2Z0ZW4gY29udGFpbnMgb25seSBwcm9ncmVzcyBvdXRwdXQgKGUuZy5cbiAqIGBVcGRhdGluZyBmaWxlczogICAwJSAoMTQ5LzE0ODM0KWApLCBzbyB3aXRob3V0IHRoZSB0aW1lb3V0IGluZGljYXRvclxuICogdGhlIGJ1YmJsZWQtdXAgZXJyb3IgaXMgbWlzbGVhZGluZy5cbiAqXG4gKiBFeHBvcnRlZCBmb3IgdGVzdHMuXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiBmb3JtYXRHaXRFcnJvcihhcmdzOiByZWFkb25seSBzdHJpbmdbXSwgdGltZW91dE1zOiBudW1iZXIsIGRpZFRpbWVPdXQ6IGJvb2xlYW4sIGVycm9yOiBjcC5FeGVjRmlsZUV4Y2VwdGlvbiwgc3RkZXJyOiBzdHJpbmcpOiBzdHJpbmcge1xuXHRjb25zdCBzdWJjb21tYW5kID0gYXJnc1swXSA/PyAnKHVua25vd24pJztcblx0bGV0IHJlYXNvbjogc3RyaW5nO1xuXHRpZiAoZGlkVGltZU91dCkge1xuXHRcdHJlYXNvbiA9IGBnaXQgJHtzdWJjb21tYW5kfSB0aW1lZCBvdXQgYWZ0ZXIgJHt0aW1lb3V0TXN9bXNgO1xuXHR9IGVsc2UgaWYgKGVycm9yLmtpbGxlZCAmJiBlcnJvci5zaWduYWwpIHtcblx0XHRyZWFzb24gPSBgZ2l0ICR7c3ViY29tbWFuZH0ga2lsbGVkIGJ5ICR7ZXJyb3Iuc2lnbmFsfWA7XG5cdH0gZWxzZSBpZiAodHlwZW9mIGVycm9yLmNvZGUgPT09ICdudW1iZXInKSB7XG5cdFx0cmVhc29uID0gYGdpdCAke3N1YmNvbW1hbmR9IGV4aXRlZCB3aXRoIGNvZGUgJHtlcnJvci5jb2RlfWA7XG5cdH0gZWxzZSB7XG5cdFx0cmVhc29uID0gZXJyb3IubWVzc2FnZTtcblx0fVxuXHRjb25zdCBkZXRhaWwgPSBzdW1tYXJpemVTdGRlcnJGb3JFcnJvcihzdGRlcnIpO1xuXHRyZXR1cm4gZGV0YWlsID8gYCR7cmVhc29ufTogJHtkZXRhaWx9YCA6IHJlYXNvbjtcbn1cblxuLyoqXG4gKiBTcXVhc2hlcyBtdWx0aS1saW5lIC8gY2FycmlhZ2UtcmV0dXJuLWhlYXZ5IHN0ZGVyciAoZS5nLiBnaXQgcHJvZ3Jlc3NcbiAqIG1ldGVycyB0aGF0IGVtaXQgYFVwZGF0aW5nIGZpbGVzOiAgIDAlICgxNDkvMTQ4MzQpXFxyLi4uYCByZXBlYXRlZGx5KVxuICogaW50byBhIHNpbmdsZSBzaG9ydCBsaW5lIHN1aXRhYmxlIGZvciBhIG9uZS1saW5lciBlcnJvciBtZXNzYWdlLlxuICogS2VlcHMgdGhlIG1vc3QgcmVjZW50IG5vbi1lbXB0eSBsaW5lIGFuZCBjYXBzIHRvdGFsIGxlbmd0aC5cbiAqXG4gKiBFeHBvcnRlZCBmb3IgdGVzdHMuXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiBzdW1tYXJpemVTdGRlcnJGb3JFcnJvcihzdGRlcnI6IHN0cmluZyk6IHN0cmluZyB7XG5cdGlmICghc3RkZXJyKSB7XG5cdFx0cmV0dXJuICcnO1xuXHR9XG5cdGNvbnN0IGxpbmVzID0gc3RkZXJyLnNwbGl0KC9bXFxyXFxuXSsvZykubWFwKGxpbmUgPT4gbGluZS50cmltKCkpLmZpbHRlcihsaW5lID0+IGxpbmUubGVuZ3RoID4gMCk7XG5cdGlmIChsaW5lcy5sZW5ndGggPT09IDApIHtcblx0XHRyZXR1cm4gJyc7XG5cdH1cblx0Y29uc3QgTUFYID0gMjAwO1xuXHRjb25zdCBnaXRMZnNNaXNzaW5nID0gbGluZXMuZmluZChsaW5lID0+XG5cdFx0L1xcYmdpdC1sZnNcXGIvaS50ZXN0KGxpbmUpICYmXG5cdFx0Lyhjb21tYW5kIG5vdCBmb3VuZHxub3QgcmVjb2duaXplZHxubyBzdWNoIGZpbGUpL2kudGVzdChsaW5lKVxuXHQpO1xuXHRjb25zdCBzdW1tYXJ5ID0gZ2l0TGZzTWlzc2luZyA/PyBsaW5lc1tsaW5lcy5sZW5ndGggLSAxXTtcblx0cmV0dXJuIHN1bW1hcnkubGVuZ3RoID4gTUFYID8gYCR7c3VtbWFyeS5zbGljZSgwLCBNQVggLSAxKX1cdTIwMjZgIDogc3VtbWFyeTtcbn1cblxuLyoqXG4gKiBQYXJzZXMgTlVMLXNlcGFyYXRlZCBgZ2l0IHN0YXR1cyAtLXBvcmNlbGFpbj12MSAteiAtLXVudHJhY2tlZC1maWxlcz1hbGxgXG4gKiBvdXRwdXQgYW5kIHJldHVybnMgdGhlIHJlcG8tcmVsYXRpdmUgcGF0aHMgb2YgdW50cmFja2VkIGVudHJpZXMgKHN0YXR1c1xuICogYD8/YCkuIE90aGVyIGVudHJpZXMgYXJlIGlnbm9yZWQ7IHdlIG9ubHkgbmVlZCB0byBrbm93IHdoZXRoZXIgYW55XG4gKiB1bnRyYWNrZWQgZmlsZXMgZXhpc3QgdG8gZGVjaWRlIHdoZXRoZXIgdG8gdXNlIHRoZSB0ZW1wLWluZGV4IHBhdGguXG4gKlxuICogRXhwb3J0ZWQgZm9yIHRlc3RzLlxuICovXG5leHBvcnQgZnVuY3Rpb24gcGFyc2VVbnRyYWNrZWRQYXRocyhvdXRwdXQ6IHN0cmluZyB8IHVuZGVmaW5lZCk6IHN0cmluZ1tdIHtcblx0cmV0dXJuIHBhcnNlQ2hhbmdlZFBhdGhzKG91dHB1dCwgc3RhdHVzID0+IHN0YXR1cyA9PT0gJz8/Jyk7XG59XG5cbi8qKlxuICogUGFyc2VzIE5VTC1zZXBhcmF0ZWQgYGdpdCBzdGF0dXMgLS1wb3JjZWxhaW49djEgLXogLS11bnRyYWNrZWQtZmlsZXM9YWxsYFxuICogb3V0cHV0IGFuZCByZXR1cm5zIGFsbCBjaGFuZ2VkIHJlcG8tcmVsYXRpdmUgcGF0aHMuIFJlbmFtZS9jb3B5IGVudHJpZXNcbiAqIGluY2x1ZGUgYm90aCB0aGUgZGVzdGluYXRpb24gYW5kIHNvdXJjZSBwYXRocyBzbyBzY29wZWQgYGdpdCBhZGQgLUFgXG4gKiBzdGFnZXMgYm90aCBzaWRlcyBvZiB0aGUgY2hhbmdlLlxuICpcbiAqIEV4cG9ydGVkIGZvciB0ZXN0cy5cbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIHBhcnNlQ2hhbmdlZFBhdGhzKG91dHB1dDogc3RyaW5nIHwgdW5kZWZpbmVkLCBpbmNsdWRlU3RhdHVzOiAoc3RhdHVzOiBzdHJpbmcpID0+IGJvb2xlYW4gPSAoKSA9PiB0cnVlKTogc3RyaW5nW10ge1xuXHRpZiAoIW91dHB1dCkge1xuXHRcdHJldHVybiBbXTtcblx0fVxuXHRjb25zdCByZXN1bHQ6IHN0cmluZ1tdID0gW107XG5cdGNvbnN0IHNlZW4gPSBuZXcgU2V0PHN0cmluZz4oKTtcblx0Y29uc3QgYWRkUGF0aCA9IChwYXRoOiBzdHJpbmcpID0+IHtcblx0XHRpZiAocGF0aCAmJiAhc2Vlbi5oYXMocGF0aCkpIHtcblx0XHRcdHNlZW4uYWRkKHBhdGgpO1xuXHRcdFx0cmVzdWx0LnB1c2gocGF0aCk7XG5cdFx0fVxuXHR9O1xuXHRjb25zdCBzZWdtZW50cyA9IG91dHB1dC5zcGxpdCgnXFx4MDAnKTtcblx0Zm9yIChsZXQgaSA9IDA7IGkgPCBzZWdtZW50cy5sZW5ndGg7IGkrKykge1xuXHRcdGNvbnN0IHNlZyA9IHNlZ21lbnRzW2ldO1xuXHRcdGlmICghc2VnKSB7IGNvbnRpbnVlOyB9XG5cdFx0Ly8gRWFjaCBlbnRyeSBpcyBcIlhZIDxwYXRoPlwiOyBmb3IgcmVuYW1lcyB2MSBlbWl0cyBhIHNlY29uZCBOVUwtc2VwYXJhdGVkXG5cdFx0Ly8gXCJmcm9tXCIgcGF0aC5cblx0XHRjb25zdCBzdGF0dXMgPSBzZWcuc3Vic3RyaW5nKDAsIDIpO1xuXHRcdGNvbnN0IHBhdGggPSBzZWcuc3Vic3RyaW5nKDMpO1xuXHRcdGNvbnN0IGlzUmVuYW1lT3JDb3B5ID0gc3RhdHVzWzBdID09PSAnUicgfHwgc3RhdHVzWzFdID09PSAnUicgfHwgc3RhdHVzWzBdID09PSAnQycgfHwgc3RhdHVzWzFdID09PSAnQyc7XG5cdFx0aWYgKGluY2x1ZGVTdGF0dXMoc3RhdHVzKSkge1xuXHRcdFx0YWRkUGF0aChwYXRoKTtcblx0XHRcdGlmIChpc1JlbmFtZU9yQ29weSkge1xuXHRcdFx0XHRjb25zdCBzb3VyY2VQYXRoID0gc2VnbWVudHNbKytpXTtcblx0XHRcdFx0aWYgKHNvdXJjZVBhdGgpIHtcblx0XHRcdFx0XHRhZGRQYXRoKHNvdXJjZVBhdGgpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fSBlbHNlIGlmIChpc1JlbmFtZU9yQ29weSkge1xuXHRcdFx0aSsrO1xuXHRcdH1cblx0fVxuXHRyZXR1cm4gcmVzdWx0O1xufVxuXG4vKipcbiAqIFBhcnNlcyBOVUwtdGVybWluYXRlZCBgZ2l0IGxzLXRyZWUgLXogPHRyZWU+IC0tIDxwYXRoPmAgb3V0cHV0IGZvciBhIHNpbmdsZVxuICogcGF0aCBhbmQgcmV0dXJucyBpdHMgYHsgbW9kZSwgb2lkIH1gLCBvciBgdW5kZWZpbmVkYCB3aGVuIHRoZSBwYXRoIGlzIGFic2VudFxuICogZnJvbSB0aGUgdHJlZSAoZW1wdHkgb3V0cHV0KS4gRWFjaCBlbnRyeSBoYXMgdGhlIGZvcm1cbiAqIGA8bW9kZT4gU1AgPHR5cGU+IFNQIDxvaWQ+IFRBQiA8cGF0aD4gTlVMYDsgd2Ugb25seSBuZWVkIHRoZSBtb2RlIGFuZCBvaWQuXG4gKlxuICogRXhwb3J0ZWQgZm9yIHRlc3RzLlxuICovXG5leHBvcnQgZnVuY3Rpb24gcGFyc2VTaW5nbGVMc1RyZWVFbnRyeShvdXRwdXQ6IHN0cmluZyB8IHVuZGVmaW5lZCk6IHsgbW9kZTogc3RyaW5nOyBvaWQ6IHN0cmluZyB9IHwgdW5kZWZpbmVkIHtcblx0aWYgKCFvdXRwdXQpIHtcblx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHR9XG5cdGNvbnN0IGVudHJ5ID0gb3V0cHV0LnNwbGl0KCdcXHgwMCcpWzBdO1xuXHRpZiAoIWVudHJ5KSB7XG5cdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0fVxuXHRjb25zdCB0YWJJbmRleCA9IGVudHJ5LmluZGV4T2YoJ1xcdCcpO1xuXHRjb25zdCBtZXRhID0gKHRhYkluZGV4ID09PSAtMSA/IGVudHJ5IDogZW50cnkuc3Vic3RyaW5nKDAsIHRhYkluZGV4KSkuc3BsaXQoJyAnKTtcblx0aWYgKG1ldGEubGVuZ3RoIDwgMykge1xuXHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdH1cblx0cmV0dXJuIHsgbW9kZTogbWV0YVswXSwgb2lkOiBtZXRhWzJdIH07XG59XG5cbi8qKlxuICogUGFyc2VzIGNvbWJpbmVkIGAtLXJhdyAtLW51bXN0YXQgLXpgIG91dHB1dCBwcm9kdWNlZCBieVxuICoge0BsaW5rIElBZ2VudEhvc3RHaXRTZXJ2aWNlLmNvbXB1dGVTZXNzaW9uRmlsZURpZmZzfSBhbmQgY29udmVydHMgZWFjaFxuICogY2hhbmdlIGludG8gYW4ge0BsaW5rIElTZXNzaW9uRmlsZURpZmZ9IHJlYWR5IGZvciB0aGUgcHJvdG9jb2wuXG4gKlxuICogVGhlIGNvbWJpbmVkIE5VTC1zZXBhcmF0ZWQgc3RyZWFtIGFsdGVybmF0ZXMgYmV0d2VlbiBgLS1yYXdgIHNlZ21lbnRzXG4gKiAoc3RhcnQgd2l0aCBgOmApIGFuZCBgLS1udW1zdGF0YCBzZWdtZW50cy4gRm9yIHJlbmFtZXMgdGhlIHJhdyBzZWdtZW50XG4gKiBpcyBmb2xsb3dlZCBieSB0d28gZXh0cmEgcGF0aCBzZWdtZW50cyAob2xkLCBuZXcpOyB0aGUgbnVtc3RhdCBzZWdtZW50XG4gKiBoYXMgYW4gZW1wdHkgcGF0aCBmaWVsZCBmb2xsb3dlZCBieSBvbGQvbmV3IHBhdGggc2VnbWVudHMuXG4gKlxuICogYGJlZm9yZVJlZmAgaXMgdGhlIGNvbW1pdCB0aGUgYGJlZm9yZWAgc2lkZSBpcyBhbmNob3JlZCBvbiAodHlwaWNhbGx5IGFcbiAqIG1lcmdlLWJhc2Ugb3IgdGhlIGxvd2VyIGJvdW5kIG9mIGEgcmVmLXRvLXJlZiBkaWZmKS5cbiAqXG4gKiBgYWZ0ZXJSZWZgIGNvbnRyb2xzIGhvdyB0aGUgYGFmdGVyYCBzaWRlIGlzIGJ1aWx0OlxuICogLSBXaGVuIGB1bmRlZmluZWRgICh0aGUgbWVyZ2UtYmFzZSBcdTIxOTIgd29ya2luZy10cmVlIGNhc2UpIHRoZSBgYWZ0ZXJgXG4gKiAgIGNvbnRlbnQgVVJJIHBvaW50cyBhdCB0aGUgb24tZGlzayB3b3JraW5nLXRyZWUgZmlsZS4gVGhlIGRpZmYgZWRpdG9yXG4gKiAgIHJlYWRzIHRoZSBmaWxlIGZyb20gZGlzayBhcyB0aGUgdXNlciBjdXJyZW50bHkgc2VlcyBpdC5cbiAqIC0gV2hlbiBzZXQgKHRoZSByZWYgXHUyMTkyIHJlZiBjYXNlLCBlLmcuIGNoZWNrcG9pbnQgZGlmZnMpIGJvdGggYGFmdGVyLnVyaWBcbiAqICAgYW5kIGBhZnRlci5jb250ZW50LnVyaWAgYXJlIGJ1aWx0IGFzIGBnaXQtYmxvYjpgIFVSSXMgYW5jaG9yZWQgb24gdGhhdFxuICogICBjb21taXQsIHNvIHRoZSBhZnRlciBwYW5lIHJlZmxlY3RzIHRoZSBzdGF0ZSBhdCB0aGF0IGNvbW1pdFxuICogICByZWdhcmRsZXNzIG9mIHdoYXQgaXMgY3VycmVudGx5IG9uIGRpc2suIFRoaXMgYWxzbyBtYWtlcyB0aGUgZGlmZlxuICogICBjb3JyZWN0IHdoZW4gdGhlIGZpbGUgZG9lcyBub3QgKG9yIG5vIGxvbmdlcikgZXhpc3RzIGluIHRoZSB3b3JraW5nXG4gKiAgIHRyZWUuXG4gKlxuICogRXhwb3J0ZWQgZm9yIHRlc3RzLlxuICovXG5leHBvcnQgZnVuY3Rpb24gcGFyc2VHaXREaWZmUmF3TnVtc3RhdChvdXRwdXQ6IHN0cmluZywgcmVwb3NpdG9yeVJvb3Q6IFVSSSwgc2Vzc2lvblVyaTogc3RyaW5nLCBiZWZvcmVSZWY6IHN0cmluZywgYWZ0ZXJSZWY/OiBzdHJpbmcpOiBJU2Vzc2lvbkZpbGVEaWZmW10ge1xuXHRjb25zdCBzZWdtZW50cyA9IG91dHB1dC5zcGxpdCgnXFx4MDAnKTtcblx0Y29uc3QgY2hhbmdlczogeyBraW5kOiBGaWxlRWRpdEtpbmQ7IG9sZFBhdGg/OiBzdHJpbmc7IG5ld1BhdGg/OiBzdHJpbmcgfVtdID0gW107XG5cdGNvbnN0IG51bVN0YXRzID0gbmV3IE1hcDxzdHJpbmcsIHsgYWRkZWQ6IG51bWJlcjsgcmVtb3ZlZDogbnVtYmVyIH0+KCk7XG5cblx0bGV0IGkgPSAwO1xuXHR3aGlsZSAoaSA8IHNlZ21lbnRzLmxlbmd0aCkge1xuXHRcdGNvbnN0IHNlZ21lbnQgPSBzZWdtZW50c1tpKytdO1xuXHRcdGlmICghc2VnbWVudCkgeyBjb250aW51ZTsgfVxuXG5cdFx0aWYgKHNlZ21lbnQuc3RhcnRzV2l0aCgnOicpKSB7XG5cdFx0XHQvLyBSYXcgbGluZTogXCI6PHNyY01vZGU+IDxkc3RNb2RlPiA8c3JjU2hhPiA8ZHN0U2hhPiA8c3RhdHVzPlwiXG5cdFx0XHQvLyBmb2xsb3dlZCBieSBOVUwtc2VwYXJhdGVkIHBhdGgocykuXG5cdFx0XHRjb25zdCBmaWVsZHMgPSBzZWdtZW50LnNwbGl0KCcgJyk7XG5cdFx0XHRjb25zdCBzdGF0dXMgPSBmaWVsZHNbNF0gPz8gJyc7XG5cdFx0XHRjb25zdCBwYXRoMSA9IHNlZ21lbnRzW2krK107XG5cdFx0XHRpZiAoIXBhdGgxKSB7IGNvbnRpbnVlOyB9XG5cblx0XHRcdHN3aXRjaCAoc3RhdHVzWzBdKSB7XG5cdFx0XHRcdGNhc2UgJ0EnOlxuXHRcdFx0XHRcdGNoYW5nZXMucHVzaCh7IGtpbmQ6IEZpbGVFZGl0S2luZC5DcmVhdGUsIG5ld1BhdGg6IHBhdGgxIH0pO1xuXHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHRjYXNlICdNJzpcblx0XHRcdFx0XHRjaGFuZ2VzLnB1c2goeyBraW5kOiBGaWxlRWRpdEtpbmQuRWRpdCwgb2xkUGF0aDogcGF0aDEsIG5ld1BhdGg6IHBhdGgxIH0pO1xuXHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHRjYXNlICdEJzpcblx0XHRcdFx0XHRjaGFuZ2VzLnB1c2goeyBraW5kOiBGaWxlRWRpdEtpbmQuRGVsZXRlLCBvbGRQYXRoOiBwYXRoMSB9KTtcblx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0Y2FzZSAnUic6IHtcblx0XHRcdFx0XHRjb25zdCBwYXRoMiA9IHNlZ21lbnRzW2krK107XG5cdFx0XHRcdFx0aWYgKCFwYXRoMikgeyBjb250aW51ZTsgfVxuXHRcdFx0XHRcdGNoYW5nZXMucHVzaCh7IGtpbmQ6IEZpbGVFZGl0S2luZC5SZW5hbWUsIG9sZFBhdGg6IHBhdGgxLCBuZXdQYXRoOiBwYXRoMiB9KTtcblx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0fVxuXHRcdFx0XHRkZWZhdWx0OlxuXHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0fVxuXHRcdH0gZWxzZSB7XG5cdFx0XHQvLyBOdW1zdGF0IGxpbmU6IFwiPGFkZGVkPlxcdDxyZW1vdmVkPlxcdDxwYXRoPlwiIG9yLCBmb3IgcmVuYW1lcyxcblx0XHRcdC8vIFwiPGFkZGVkPlxcdDxyZW1vdmVkPlxcdFwiIGZvbGxvd2VkIGJ5IE5VTC1zZXBhcmF0ZWQgb2xkL25ldyBwYXRocy5cblx0XHRcdGNvbnN0IFthZGRlZFN0ciwgcmVtb3ZlZFN0ciwgZmlsZVBhdGhdID0gc2VnbWVudC5zcGxpdCgnXFx0Jyk7XG5cdFx0XHRsZXQga2V5OiBzdHJpbmc7XG5cdFx0XHRpZiAoZmlsZVBhdGggPT09ICcnIHx8IGZpbGVQYXRoID09PSB1bmRlZmluZWQpIHtcblx0XHRcdFx0Y29uc3Qgb2xkUGF0aCA9IHNlZ21lbnRzW2krK107XG5cdFx0XHRcdGNvbnN0IG5ld1BhdGggPSBzZWdtZW50c1tpKytdO1xuXHRcdFx0XHRrZXkgPSBuZXdQYXRoID8/IG9sZFBhdGggPz8gJyc7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRrZXkgPSBmaWxlUGF0aDtcblx0XHRcdH1cblx0XHRcdGlmICgha2V5KSB7IGNvbnRpbnVlOyB9XG5cdFx0XHRudW1TdGF0cy5zZXQoa2V5LCB7XG5cdFx0XHRcdGFkZGVkOiBhZGRlZFN0ciA9PT0gJy0nID8gMCA6IE51bWJlcihhZGRlZFN0cikgfHwgMCxcblx0XHRcdFx0cmVtb3ZlZDogcmVtb3ZlZFN0ciA9PT0gJy0nID8gMCA6IE51bWJlcihyZW1vdmVkU3RyKSB8fCAwLFxuXHRcdFx0fSk7XG5cdFx0fVxuXHR9XG5cblx0cmV0dXJuIGNoYW5nZXMubWFwKGNoYW5nZSA9PiB7XG5cdFx0Y29uc3Qgc3RhdHMgPSBudW1TdGF0cy5nZXQoY2hhbmdlLm5ld1BhdGggPz8gY2hhbmdlLm9sZFBhdGggPz8gJycpO1xuXG5cdFx0Y29uc3QgYmVmb3JlRmlsZVVyaSA9IGNoYW5nZS5vbGRQYXRoID8gVVJJLmpvaW5QYXRoKHJlcG9zaXRvcnlSb290LCBjaGFuZ2Uub2xkUGF0aCkgOiB1bmRlZmluZWQ7XG5cdFx0Y29uc3QgYWZ0ZXJGaWxlVXJpID0gY2hhbmdlLm5ld1BhdGggPyBVUkkuam9pblBhdGgocmVwb3NpdG9yeVJvb3QsIGNoYW5nZS5uZXdQYXRoKSA6IHVuZGVmaW5lZDtcblxuXHRcdGNvbnN0IGJlZm9yZSA9IGNoYW5nZS5raW5kICE9PSBGaWxlRWRpdEtpbmQuQ3JlYXRlICYmIGNoYW5nZS5vbGRQYXRoICYmIGJlZm9yZUZpbGVVcmlcblx0XHRcdD8ge1xuXHRcdFx0XHR1cmk6IGJlZm9yZUZpbGVVcmkudG9TdHJpbmcoKSxcblx0XHRcdFx0Y29udGVudDogeyB1cmk6IGJ1aWxkR2l0QmxvYlVyaShzZXNzaW9uVXJpLCBiZWZvcmVSZWYsIGNoYW5nZS5vbGRQYXRoLCBiZWZvcmVGaWxlVXJpLnBhdGgpIH0sXG5cdFx0XHR9XG5cdFx0XHQ6IHVuZGVmaW5lZDtcblxuXHRcdGNvbnN0IGFmdGVyID0gY2hhbmdlLmtpbmQgIT09IEZpbGVFZGl0S2luZC5EZWxldGUgJiYgY2hhbmdlLm5ld1BhdGggJiYgYWZ0ZXJGaWxlVXJpXG5cdFx0XHQ/IHtcblx0XHRcdFx0dXJpOiBhZnRlckZpbGVVcmkudG9TdHJpbmcoKSxcblx0XHRcdFx0Y29udGVudDogYWZ0ZXJSZWYgIT09IHVuZGVmaW5lZFxuXHRcdFx0XHRcdD8geyB1cmk6IGJ1aWxkR2l0QmxvYlVyaShzZXNzaW9uVXJpLCBhZnRlclJlZiwgY2hhbmdlLm5ld1BhdGgsIGFmdGVyRmlsZVVyaS5wYXRoKSB9XG5cdFx0XHRcdFx0OiB7IHVyaTogYWZ0ZXJGaWxlVXJpLnRvU3RyaW5nKCkgfVxuXHRcdFx0fVxuXHRcdFx0OiB1bmRlZmluZWQ7XG5cblx0XHRjb25zdCBkaWZmID0ge1xuXHRcdFx0YWRkZWQ6IHN0YXRzPy5hZGRlZCA/PyAwLFxuXHRcdFx0cmVtb3ZlZDogc3RhdHM/LnJlbW92ZWQgPz8gMFxuXHRcdH07XG5cblx0XHRyZXR1cm4ge1xuXHRcdFx0Li4uKGJlZm9yZSA/IHsgYmVmb3JlIH0gOiB7fSksXG5cdFx0XHQuLi4oYWZ0ZXIgPyB7IGFmdGVyIH0gOiB7fSksXG5cdFx0XHRkaWZmXG5cdFx0fTtcblx0fSk7XG59XG5cbi8qKlxuICogUGFyc2VzIG91dHB1dCBvZiBgZ2l0IHN0YXR1cyAtYiAtLXBvcmNlbGFpbj12MmAuIFRoZSBmb3JtYXQgaXMgZG9jdW1lbnRlZFxuICogYXQgaHR0cHM6Ly9naXQtc2NtLmNvbS9kb2NzL2dpdC1zdGF0dXMuIFdlIGNhcmUgYWJvdXQgYSBmZXcgaGVhZGVyIGxpbmVzOlxuICpcbiAqICAgIyBicmFuY2guaGVhZCA8bmFtZT5cbiAqICAgIyBicmFuY2gudXBzdHJlYW0gPG5hbWU+XG4gKiAgICMgYnJhbmNoLmFiICs8YWhlYWQ+IC08YmVoaW5kPlxuICpcbiAqIGFuZCB0aGUgY291bnQgb2Ygbm9uLWhlYWRlciBsaW5lcyAob25lIHBlciBjaGFuZ2VkIGVudHJ5KS5cbiAqXG4gKiBFeHBvcnRlZCBmb3IgdGVzdHMuXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiBwYXJzZUdpdFN0YXR1c1YyKG91dHB1dDogc3RyaW5nIHwgdW5kZWZpbmVkKToge1xuXHRicmFuY2hOYW1lPzogc3RyaW5nO1xuXHR1cHN0cmVhbUJyYW5jaE5hbWU/OiBzdHJpbmc7XG5cdG91dGdvaW5nQ2hhbmdlcz86IG51bWJlcjtcblx0aW5jb21pbmdDaGFuZ2VzPzogbnVtYmVyO1xuXHR1bmNvbW1pdHRlZENoYW5nZXM/OiBudW1iZXI7XG59IHtcblx0aWYgKCFvdXRwdXQpIHtcblx0XHRyZXR1cm4ge307XG5cdH1cblx0bGV0IGJyYW5jaE5hbWU6IHN0cmluZyB8IHVuZGVmaW5lZDtcblx0bGV0IHVwc3RyZWFtQnJhbmNoTmFtZTogc3RyaW5nIHwgdW5kZWZpbmVkO1xuXHRsZXQgb3V0Z29pbmdDaGFuZ2VzOiBudW1iZXIgfCB1bmRlZmluZWQ7XG5cdGxldCBpbmNvbWluZ0NoYW5nZXM6IG51bWJlciB8IHVuZGVmaW5lZDtcblx0bGV0IHVuY29tbWl0dGVkQ2hhbmdlcyA9IDA7XG5cdGZvciAoY29uc3QgcmF3TGluZSBvZiBvdXRwdXQuc3BsaXQoL1xccj9cXG4vZykpIHtcblx0XHRjb25zdCBsaW5lID0gcmF3TGluZS50cmltRW5kKCk7XG5cdFx0aWYgKCFsaW5lKSB7IGNvbnRpbnVlOyB9XG5cdFx0aWYgKGxpbmUuc3RhcnRzV2l0aCgnIyBicmFuY2guaGVhZCAnKSkge1xuXHRcdFx0Y29uc3QgaGVhZCA9IGxpbmUuc3Vic3RyaW5nKCcjIGJyYW5jaC5oZWFkICcubGVuZ3RoKS50cmltKCk7XG5cdFx0XHQvLyBgKGRldGFjaGVkKWAgaXMgd2hhdCBnaXQgZW1pdHMgZm9yIGEgZGV0YWNoZWQgSEVBRC4gVHJlYXQgYXMgbm8gYnJhbmNoLlxuXHRcdFx0YnJhbmNoTmFtZSA9IGhlYWQgPT09ICcoZGV0YWNoZWQpJyA/IHVuZGVmaW5lZCA6IGhlYWQ7XG5cdFx0fSBlbHNlIGlmIChsaW5lLnN0YXJ0c1dpdGgoJyMgYnJhbmNoLnVwc3RyZWFtICcpKSB7XG5cdFx0XHR1cHN0cmVhbUJyYW5jaE5hbWUgPSBsaW5lLnN1YnN0cmluZygnIyBicmFuY2gudXBzdHJlYW0gJy5sZW5ndGgpLnRyaW0oKTtcblx0XHR9IGVsc2UgaWYgKGxpbmUuc3RhcnRzV2l0aCgnIyBicmFuY2guYWIgJykpIHtcblx0XHRcdGNvbnN0IG0gPSAvXiMgYnJhbmNoXFwuYWIgXFwrKFxcZCspIC0oXFxkKykkLy5leGVjKGxpbmUpO1xuXHRcdFx0aWYgKG0pIHtcblx0XHRcdFx0b3V0Z29pbmdDaGFuZ2VzID0gTnVtYmVyKG1bMV0pO1xuXHRcdFx0XHRpbmNvbWluZ0NoYW5nZXMgPSBOdW1iZXIobVsyXSk7XG5cdFx0XHR9XG5cdFx0fSBlbHNlIGlmICghbGluZS5zdGFydHNXaXRoKCcjJykpIHtcblx0XHRcdHVuY29tbWl0dGVkQ2hhbmdlcysrO1xuXHRcdH1cblx0fVxuXHRyZXR1cm4geyBicmFuY2hOYW1lLCB1cHN0cmVhbUJyYW5jaE5hbWUsIG91dGdvaW5nQ2hhbmdlcywgaW5jb21pbmdDaGFuZ2VzLCB1bmNvbW1pdHRlZENoYW5nZXMgfTtcbn1cblxuLyoqIEV4cG9ydGVkIGZvciB0ZXN0cy4gKi9cbmV4cG9ydCBmdW5jdGlvbiBwYXJzZUhhc0dpdEh1YlJlbW90ZShyZW1vdGVzT3V0cHV0OiBzdHJpbmcgfCB1bmRlZmluZWQpOiBib29sZWFuIHwgdW5kZWZpbmVkIHtcblx0aWYgKHJlbW90ZXNPdXRwdXQgPT09IHVuZGVmaW5lZCkge1xuXHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdH1cblx0aWYgKCFyZW1vdGVzT3V0cHV0LnRyaW0oKSkge1xuXHRcdHJldHVybiBmYWxzZTtcblx0fVxuXHRyZXR1cm4gL2dpdGh1YlxcLmNvbVs6XFwvXS9pLnRlc3QocmVtb3Rlc091dHB1dCk7XG59XG5cbi8qKiBSZXR1cm5zIGZldGNoIHJlbW90ZSBVUkxzIHdpdGggdGhlIHByZWZlcnJlZCByZW1vdGUsIHRoZW4gYG9yaWdpbmAsIGZpcnN0LiAqL1xuZXhwb3J0IGZ1bmN0aW9uIHBhcnNlRmV0Y2hSZW1vdGVVcmxzKHJlbW90ZXNPdXRwdXQ6IHN0cmluZyB8IHVuZGVmaW5lZCwgcHJlZmVycmVkUmVtb3RlPzogc3RyaW5nKTogc3RyaW5nW10gfCB1bmRlZmluZWQge1xuXHRjb25zdCBjYW5kaWRhdGVzID0gcGFyc2VGZXRjaFJlbW90ZXMocmVtb3Rlc091dHB1dCk7XG5cdGlmICghY2FuZGlkYXRlcykge1xuXHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdH1cblx0Y29uc3QgcHJlZmVycmVkTmFtZXMgPSBuZXcgU2V0KFtwcmVmZXJyZWRSZW1vdGUsICdvcmlnaW4nXS5maWx0ZXIoKG5hbWUpOiBuYW1lIGlzIHN0cmluZyA9PiBCb29sZWFuKG5hbWUpKSk7XG5cdGNvbnN0IG9yZGVyZWQgPSBbXG5cdFx0Li4uY2FuZGlkYXRlcy5maWx0ZXIoY2FuZGlkYXRlID0+IGNhbmRpZGF0ZS5uYW1lID09PSBwcmVmZXJyZWRSZW1vdGUpLFxuXHRcdC4uLmNhbmRpZGF0ZXMuZmlsdGVyKGNhbmRpZGF0ZSA9PiBjYW5kaWRhdGUubmFtZSA9PT0gJ29yaWdpbicgJiYgY2FuZGlkYXRlLm5hbWUgIT09IHByZWZlcnJlZFJlbW90ZSksXG5cdFx0Li4uY2FuZGlkYXRlcy5maWx0ZXIoY2FuZGlkYXRlID0+ICFwcmVmZXJyZWROYW1lcy5oYXMoY2FuZGlkYXRlLm5hbWUpKSxcblx0XTtcblx0cmV0dXJuIFsuLi5uZXcgU2V0KG9yZGVyZWQubWFwKGNhbmRpZGF0ZSA9PiBjYW5kaWRhdGUudXJsKSldO1xufVxuXG5mdW5jdGlvbiBwYXJzZUZldGNoUmVtb3RlcyhyZW1vdGVzT3V0cHV0OiBzdHJpbmcgfCB1bmRlZmluZWQpOiB7IG5hbWU6IHN0cmluZzsgdXJsOiBzdHJpbmcgfVtdIHwgdW5kZWZpbmVkIHtcblx0aWYgKHJlbW90ZXNPdXRwdXQgPT09IHVuZGVmaW5lZCkge1xuXHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdH1cblx0Y29uc3QgY2FuZGlkYXRlczogeyBuYW1lOiBzdHJpbmc7IHVybDogc3RyaW5nIH1bXSA9IFtdO1xuXHRmb3IgKGNvbnN0IHJhd0xpbmUgb2YgcmVtb3Rlc091dHB1dC5zcGxpdCgvXFxyP1xcbi8pKSB7XG5cdFx0Y29uc3QgbWF0Y2ggPSAvXihcXFMrKVxccysoXFxTKylcXHMrXFwoZmV0Y2hcXCkkLy5leGVjKHJhd0xpbmUudHJpbSgpKTtcblx0XHRpZiAobWF0Y2gpIHtcblx0XHRcdGNhbmRpZGF0ZXMucHVzaCh7IG5hbWU6IG1hdGNoWzFdLCB1cmw6IG1hdGNoWzJdIH0pO1xuXHRcdH1cblx0fVxuXHRyZXR1cm4gY2FuZGlkYXRlcztcbn1cblxuLyoqXG4gKiBQYXJzZSBgb3duZXJgIGFuZCBgcmVwb2AgZnJvbSBgZ2l0IHJlbW90ZSAtdmAgb3V0cHV0LiBXaGVuIGByZW1vdGVOYW1lYCBpc1xuICogcHJvdmlkZWQsIG9ubHkgdGhhdCByZW1vdGUgaXMgY29uc2lkZXJlZC4gT3RoZXJ3aXNlLCBgb3JpZ2luYCBpcyBwcmVmZXJyZWQuXG4gKlxuICogRXhwb3J0ZWQgZm9yIHRlc3RzLlxuICovXG5leHBvcnQgZnVuY3Rpb24gcGFyc2VHaXRIdWJSZXBvRnJvbVJlbW90ZShyZW1vdGVzT3V0cHV0OiBzdHJpbmcgfCB1bmRlZmluZWQsIHJlbW90ZU5hbWU/OiBzdHJpbmcpOiB7IG93bmVyOiBzdHJpbmc7IHJlcG86IHN0cmluZyB9IHwgdW5kZWZpbmVkIHtcblx0Y29uc3QgY2FuZGlkYXRlcyA9IHJlbW90ZU5hbWUgPT09IHVuZGVmaW5lZFxuXHRcdD8gcGFyc2VGZXRjaFJlbW90ZVVybHMocmVtb3Rlc091dHB1dClcblx0XHQ6IHBhcnNlRmV0Y2hSZW1vdGVzKHJlbW90ZXNPdXRwdXQpPy5maWx0ZXIoY2FuZGlkYXRlID0+IGNhbmRpZGF0ZS5uYW1lID09PSByZW1vdGVOYW1lKS5tYXAoY2FuZGlkYXRlID0+IGNhbmRpZGF0ZS51cmwpO1xuXHRpZiAoIWNhbmRpZGF0ZXMpIHtcblx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHR9XG5cdGZvciAoY29uc3QgdXJsIG9mIGNhbmRpZGF0ZXMpIHtcblx0XHRjb25zdCBwYXJzZWQgPSBwYXJzZUdpdEh1Yk93bmVyUmVwb0Zyb21VcmwodXJsKTtcblx0XHRpZiAocGFyc2VkKSB7XG5cdFx0XHRyZXR1cm4gcGFyc2VkO1xuXHRcdH1cblx0fVxuXHRyZXR1cm4gdW5kZWZpbmVkO1xufVxuXG5mdW5jdGlvbiBwYXJzZUdpdEh1YkhlYWRSZXBvRnJvbVJlbW90ZVNlbGVjdGlvbihyZW1vdGVzT3V0cHV0OiBzdHJpbmcgfCB1bmRlZmluZWQsIHJlbW90ZVNlbGVjdGlvbjogc3RyaW5nIHwgdW5kZWZpbmVkKTogeyBvd25lcjogc3RyaW5nOyByZXBvOiBzdHJpbmcgfSB8IHVuZGVmaW5lZCB7XG5cdGlmICghcmVtb3RlU2VsZWN0aW9uKSB7XG5cdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0fVxuXHRyZXR1cm4gcGFyc2VHaXRIdWJSZXBvRnJvbVJlbW90ZShyZW1vdGVzT3V0cHV0LCByZW1vdGVTZWxlY3Rpb24pID8/IHBhcnNlR2l0SHViT3duZXJSZXBvRnJvbVVybChyZW1vdGVTZWxlY3Rpb24pO1xufVxuXG4vKipcbiAqIEV4dHJhY3QgYHtvd25lciwgcmVwb31gIGZyb20gYSBHaXRIdWIgcmVtb3RlIFVSTC4gSGFuZGxlcyB0aGUgY29tbW9uXG4gKiBmb3JtczogYGdpdEBnaXRodWIuY29tOm93bmVyL3JlcG8oLmdpdCk/YCwgYGh0dHBzOi8vZ2l0aHViLmNvbS9vd25lci9yZXBvKC5naXQpP2AsXG4gKiBgc3NoOi8vZ2l0QGdpdGh1Yi5jb20vb3duZXIvcmVwbyguZ2l0KT9gLCBgZ2l0Oi8vZ2l0aHViLmNvbS9vd25lci9yZXBvKC5naXQpP2AuXG4gKi9cbmZ1bmN0aW9uIHBhcnNlR2l0SHViT3duZXJSZXBvRnJvbVVybCh1cmw6IHN0cmluZyk6IHsgb3duZXI6IHN0cmluZzsgcmVwbzogc3RyaW5nIH0gfCB1bmRlZmluZWQge1xuXHQvLyBTQ1AtbGlrZTogZ2l0QGdpdGh1Yi5jb206b3duZXIvcmVwbyguZ2l0KT9cblx0bGV0IG0gPSAvXlteQFxcc10rQGdpdGh1YlxcLmNvbTooW14vXFxzXSspXFwvKFteL1xcc10rPykoPzpcXC5naXQpPyQvaS5leGVjKHVybCk7XG5cdGlmIChtKSB7XG5cdFx0cmV0dXJuIHsgb3duZXI6IG1bMV0sIHJlcG86IG1bMl0gfTtcblx0fVxuXHQvLyBVUkwtZm9ybTogPHNjaGVtZT46Ly9bdXNlckBdZ2l0aHViLmNvbVs6cG9ydF0vb3duZXIvcmVwbyguZ2l0KT9cblx0bSA9IC9eW2EteitdKzpcXC9cXC8oPzpbXkBcXC9cXHNdK0ApP2dpdGh1YlxcLmNvbSg/OjpcXGQrKT9cXC8oW14vXFxzXSspXFwvKFteL1xcc10rPykoPzpcXC5naXQpPyQvaS5leGVjKHVybCk7XG5cdGlmIChtKSB7XG5cdFx0cmV0dXJuIHsgb3duZXI6IG1bMV0sIHJlcG86IG1bMl0gfTtcblx0fVxuXHRyZXR1cm4gdW5kZWZpbmVkO1xufVxuXG4vKiogRXhwb3J0ZWQgZm9yIHRlc3RzLiAqL1xuZXhwb3J0IGZ1bmN0aW9uIHBhcnNlRGVmYXVsdEJyYW5jaFJlZihzeW1ib2xpY1JlZk91dHB1dDogc3RyaW5nIHwgdW5kZWZpbmVkKTogc3RyaW5nIHwgdW5kZWZpbmVkIHtcblx0Y29uc3QgcmVmID0gc3ltYm9saWNSZWZPdXRwdXQ/LnRyaW0oKTtcblx0aWYgKCFyZWYpIHsgcmV0dXJuIHVuZGVmaW5lZDsgfVxuXHRjb25zdCBwcmVmaXggPSAncmVmcy9yZW1vdGVzL29yaWdpbi8nO1xuXHRyZXR1cm4gcmVmLnN0YXJ0c1dpdGgocHJlZml4KSA/IHJlZi5zdWJzdHJpbmcocHJlZml4Lmxlbmd0aCkgOiByZWY7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBwYXJzZVJlbW90ZUJyYW5jaFJlZihyZWY6IHN0cmluZyk6IHsgcmVmOiBzdHJpbmc7IG5hbWU6IHN0cmluZzsgcmVtb3RlOiBzdHJpbmcgfSB8IHVuZGVmaW5lZCB7XG5cdGlmICghcmVmLnN0YXJ0c1dpdGgoJ3JlZnMvcmVtb3Rlcy8nKSkge1xuXHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdH1cblxuXHRjb25zdCBuYW1lID0gcmVmLnN1YnN0cmluZygxMyk7XG5cdGNvbnN0IHJlbW90ZSA9IG5hbWUuc3BsaXQoJy8nKVswXTtcblx0cmV0dXJuIHsgcmVmLCBuYW1lLCByZW1vdGUgfTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIHBhcnNlR2l0UmVmcyhvdXRwdXQ6IHN0cmluZyB8IHVuZGVmaW5lZCk6IEdpdFJlZltdIHtcblx0aWYgKCFvdXRwdXQpIHtcblx0XHRyZXR1cm4gW107XG5cdH1cblxuXHRjb25zdCByZWZzOiBHaXRSZWZbXSA9IFtdO1xuXHRmb3IgKGNvbnN0IGxpbmUgb2Ygb3V0cHV0LnNwbGl0KC9cXHI/XFxuL2cpKSB7XG5cdFx0Y29uc3QgW3JlZiwgdXBzdHJlYW1dID0gbGluZS50cmltKCkuc3BsaXQoJ1xcMCcpO1xuXG5cdFx0aWYgKHJlZi5zdGFydHNXaXRoKCdyZWZzL2hlYWRzLycpKSB7XG5cdFx0XHRyZWZzLnB1c2goe1xuXHRcdFx0XHRyZWYsXG5cdFx0XHRcdG5hbWU6IHJlZi5zdWJzdHJpbmcoMTEpLFxuXHRcdFx0XHR1cHN0cmVhbTogdXBzdHJlYW1cblx0XHRcdFx0XHQ/IHBhcnNlUmVtb3RlQnJhbmNoUmVmKHVwc3RyZWFtKVxuXHRcdFx0XHRcdDogdW5kZWZpbmVkLFxuXHRcdFx0XHRraW5kOiBHaXRSZWZUeXBlLkhlYWRcblx0XHRcdH0gc2F0aXNmaWVzIElCcmFuY2gpO1xuXHRcdH0gZWxzZSBpZiAocmVmLnN0YXJ0c1dpdGgoJ3JlZnMvcmVtb3Rlcy8nKSAmJiAhL15yZWZzXFwvcmVtb3Rlc1xcL1teL10rXFwvSEVBRCQvLnRlc3QocmVmKSkge1xuXHRcdFx0Y29uc3QgcGFyc2VkUmVtb3RlQnJhbmNoID0gcGFyc2VSZW1vdGVCcmFuY2hSZWYocmVmKTtcblx0XHRcdGlmIChwYXJzZWRSZW1vdGVCcmFuY2gpIHtcblx0XHRcdFx0cmVmcy5wdXNoKHtcblx0XHRcdFx0XHQuLi5wYXJzZWRSZW1vdGVCcmFuY2gsXG5cdFx0XHRcdFx0a2luZDogR2l0UmVmVHlwZS5SZW1vdGVIZWFkXG5cdFx0XHRcdH0gc2F0aXNmaWVzIElSZW1vdGVCcmFuY2gpO1xuXHRcdFx0fVxuXHRcdH0gZWxzZSBpZiAocmVmLnN0YXJ0c1dpdGgoJ3JlZnMvdGFncy8nKSkge1xuXHRcdFx0cmVmcy5wdXNoKHtcblx0XHRcdFx0cmVmLFxuXHRcdFx0XHRuYW1lOiByZWYuc3Vic3RyaW5nKDEwKSxcblx0XHRcdFx0a2luZDogR2l0UmVmVHlwZS5UYWdcblx0XHRcdH0gc2F0aXNmaWVzIElUYWcpO1xuXHRcdH1cblx0fVxuXG5cdHJldHVybiByZWZzO1xufVxuXG5mdW5jdGlvbiBzdHJpcFVuZGVmaW5lZDxUIGV4dGVuZHMgb2JqZWN0PihvYmo6IFQpOiBUIHtcblx0Y29uc3Qgb3V0OiBSZWNvcmQ8c3RyaW5nLCB1bmtub3duPiA9IHt9O1xuXHRmb3IgKGNvbnN0IFtrLCB2XSBvZiBPYmplY3QuZW50cmllcyhvYmopKSB7XG5cdFx0aWYgKHYgIT09IHVuZGVmaW5lZCkgeyBvdXRba10gPSB2OyB9XG5cdH1cblx0cmV0dXJuIG91dCBhcyBUO1xufVxuXG5mdW5jdGlvbiBpc01heEJ1ZmZlckVycm9yKGVycm9yOiB1bmtub3duKTogYm9vbGVhbiB7XG5cdGNvbnN0IGNhdXNlID0gZXJyb3IgaW5zdGFuY2VvZiBFcnJvciA/IGVycm9yLmNhdXNlIDogdW5kZWZpbmVkO1xuXHRyZXR1cm4gY2F1c2UgaW5zdGFuY2VvZiBFcnJvciAmJiAoY2F1c2UgYXMgY3AuRXhlY0ZpbGVFeGNlcHRpb24pLmNvZGUgPT09ICdFUlJfQ0hJTERfUFJPQ0VTU19TVERJT19NQVhCVUZGRVInO1xufVxuIl0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7Ozs7QUFLQSxZQUFZLFFBQVE7QUFDcEIsWUFBWSxnQkFBZ0I7QUFDNUIsU0FBUyxNQUFNLGdCQUFnQjtBQUMvQixZQUFZLFVBQVU7QUFDdEIsU0FBUyxrQ0FBa0M7QUFDM0MsU0FBUyxXQUFXO0FBQ3BCLFNBQVMsZ0JBQWdCO0FBQ3pCLFNBQVMsYUFBYTtBQUN0QixTQUFTLG9CQUFvQjtBQUM3QixTQUFTLGlDQUFpQztBQUMxQyxTQUFTLG9CQUFvQjtBQUM3QixTQUFTLG1CQUFtQjtBQUM1QixTQUFTLG9CQUFrRTtBQUMzRSxTQUFTLHVCQUF1QjtBQUNoQyxTQUFTLG1CQUFpSyxrQkFBOEU7QUFDeFAsU0FBUyxnQkFBZ0I7QUFDekIsU0FBUyxlQUFlLFNBQVMsZ0JBQWdCLGVBQWU7QUFTaEUsTUFBTSxnQ0FBZ0M7QUFDdEMsTUFBTSx1Q0FBdUM7QUFD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
