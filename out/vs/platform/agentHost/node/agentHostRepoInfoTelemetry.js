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
import { Limiter } from "../../../base/common/async.js";
import { Disposable } from "../../../base/common/lifecycle.js";
import { joinPath, relativePath } from "../../../base/common/resources.js";
import { URI } from "../../../base/common/uri.js";
import { ILogService } from "../../log/common/log.js";
import { IAgentHostGitService } from "../common/agentHostGitService.js";
import { IAgentHostGitHubEndpointService } from "./agentHostGitHubEndpointService.js";
const MAX_DIFFS_JSON_BYTES = 900 * 1024;
const MAX_DIFFS_JSON_CHARS = 50 * 8192;
const MAX_CHANGES = 100;
const MAX_MERGE_BASE_AGE_MS = 30 * 24 * 60 * 60 * 1e3;
const MAX_DIFF_COMMITS = 30;
const DIFF_PATCH_CONCURRENCY = 4;
const MAX_DIFF_SIZE = 1e5;
function resolveRepoInfoRemote(remoteUrl, enterpriseHost) {
  const scpMatch = remoteUrl.includes("://") ? void 0 : /^(?:[^@\s]+@)?(?<host>[^:\s]+):(?<path>.+)$/.exec(remoteUrl);
  let host;
  let path;
  let normalizedRemoteUrl;
  if (scpMatch?.groups) {
    host = scpMatch.groups["host"];
    path = scpMatch.groups["path"];
    normalizedRemoteUrl = `https://${host}/${path}`;
  } else {
    let parsed;
    try {
      parsed = new URL(remoteUrl);
    } catch {
      return void 0;
    }
    host = parsed.host;
    path = parsed.pathname;
    normalizedRemoteUrl = `https://${host}${path}`;
  }
  const normalizedHost = host.toLowerCase();
  const normalizedHostname = normalizedHost.replace(/:\d+$/, "");
  const normalizedPath = path.replace(/^\/+|\/+$/g, "");
  if (normalizedHostname === "github.com" || normalizedHost === enterpriseHost?.toLowerCase() || normalizedHostname === "ghe.com" || normalizedHostname.endsWith(".ghe.com")) {
    const match = /^(?<owner>[^/]+)\/(?<repo>[^/]+?)(?:\.git)?$/i.exec(normalizedPath);
    if (!match?.groups) {
      return void 0;
    }
    return {
      remoteUrl: normalizedRemoteUrl,
      repoId: `${match.groups["owner"]}/${match.groups["repo"]}`.toLowerCase(),
      repoType: "github"
    };
  }
  let adoMatch = null;
  if (normalizedHostname === "dev.azure.com") {
    adoMatch = /^(?<org>[^/]+)\/(?<project>[^/]+)\/_git\/(?:_(?:optimized|full)\/)?(?<repo>[^/]+?)(?:\.git)?$/i.exec(normalizedPath);
  } else if (normalizedHostname === "ssh.dev.azure.com") {
    adoMatch = /^v3\/(?<org>[^/]+)\/(?<project>[^/]+)\/(?:_(?:optimized|full)\/)?(?<repo>[^/]+?)(?:\.git)?$/i.exec(normalizedPath);
  } else if (normalizedHostname.endsWith(".visualstudio.com")) {
    adoMatch = /^v3\/(?<org>[^/]+)\/(?<project>[^/]+)\/(?:_(?:optimized|full)\/)?(?<repo>[^/]+?)(?:\.git)?$/i.exec(normalizedPath) ?? /^(?:[^/]+\/)?(?<project>[^/]+)\/_git\/(?:_(?:optimized|full)\/)?(?<repo>[^/]+?)(?:\.git)?$/i.exec(normalizedPath);
    if (adoMatch?.groups && !adoMatch.groups["org"]) {
      adoMatch.groups["org"] = normalizedHostname.substring(0, normalizedHostname.length - ".visualstudio.com".length);
    }
  }
  if (!adoMatch?.groups?.["org"] || !adoMatch.groups["project"] || !adoMatch.groups["repo"]) {
    return void 0;
  }
  return {
    remoteUrl: normalizedRemoteUrl,
    repoId: `${adoMatch.groups["org"]}/${adoMatch.groups["project"]}/${adoMatch.groups["repo"]}`.toLowerCase(),
    repoType: "ado"
  };
}
function measureRepoInfoDiffsJSON(diffsJSON) {
  const diffSizeBytes = Buffer.byteLength(diffsJSON, "utf8");
  return {
    diffSizeBytes,
    tooLarge: diffSizeBytes > MAX_DIFFS_JSON_BYTES || diffsJSON.length > MAX_DIFFS_JSON_CHARS
  };
}
let AgentHostRepoInfoTelemetry = class extends Disposable {
  constructor(_reporter, _gitService, _gitHubEndpointService, _logService) {
    super();
    this._reporter = _reporter;
    this._gitService = _gitService;
    this._gitHubEndpointService = _gitHubEndpointService;
    this._logService = _logService;
    this._beginResults = /* @__PURE__ */ new Map();
    this._isDisposed = false;
  }
  async reportBegin(context, sessionUri, telemetryMessageId, clientType, workingDirectory, baseBranch, isContextCurrent, checkContentExclusion) {
    let begin = this._beginResults.get(telemetryMessageId);
    if (!begin) {
      begin = {
        clientType,
        result: this._captureSafely(context, sessionUri, telemetryMessageId, clientType, "begin", workingDirectory, baseBranch, isContextCurrent, checkContentExclusion)
      };
      this._beginResults.set(telemetryMessageId, begin);
    }
    await begin.result;
  }
  async reportEnd(context, sessionUri, telemetryMessageId, workingDirectory, baseBranch, isContextCurrent, checkContentExclusion) {
    const begin = this._beginResults.get(telemetryMessageId);
    if (!begin) {
      return;
    }
    try {
      const beginResult = await begin.result;
      if (beginResult === "success" || beginResult === "noChanges") {
        await this._captureSafely(context, sessionUri, telemetryMessageId, begin.clientType, "end", workingDirectory, baseBranch, isContextCurrent, checkContentExclusion);
      }
    } finally {
      this._beginResults.delete(telemetryMessageId);
    }
  }
  clearTurn(telemetryMessageId) {
    this._beginResults.delete(telemetryMessageId);
  }
  dispose() {
    this._isDisposed = true;
    this._beginResults.clear();
    super.dispose();
  }
  async _captureSafely(context, sessionUri, telemetryMessageId, clientType, location, workingDirectory, baseBranch, isContextCurrent, checkContentExclusion) {
    try {
      return await this._capture(context, sessionUri, telemetryMessageId, clientType, location, workingDirectory, baseBranch, isContextCurrent, checkContentExclusion);
    } catch (error) {
      this._logService.warn(`[AgentHostRepoInfoTelemetry] Failed to capture ${location} repo info: ${error instanceof Error ? error.message : String(error)}`);
      return void 0;
    }
  }
  async _capture(telemetryContext, sessionUri, telemetryMessageId, clientType, location, workingDirectory, persistedBaseBranch, isContextCurrent, checkContentExclusion) {
    if (!workingDirectory || !isContextCurrent() || !telemetryContext.restrictedTelemetryEnabled && !telemetryContext.isInternal) {
      return void 0;
    }
    const [gitState, untrackedPaths] = await Promise.all([
      this._gitService.getSessionGitState(workingDirectory),
      this._gitService.getUntrackedPaths(workingDirectory)
    ]);
    const upstreamRemote = gitState?.upstreamBranchName?.split("/")[0];
    const fetchRemoteUrls = await this._gitService.getFetchRemoteUrls(workingDirectory, upstreamRemote);
    const remote = fetchRemoteUrls?.map((url) => resolveRepoInfoRemote(url, this._gitHubEndpointService.getEnterpriseHost())).find((candidate) => candidate !== void 0);
    if (!remote) {
      return void 0;
    }
    const baseBranch = persistedBaseBranch ?? gitState?.upstreamBranchName ?? gitState?.baseBranchName ?? (await this._gitService.getDefaultBranch(workingDirectory))?.name;
    const [headBranchName, headCommitHash] = await Promise.all([
      gitState?.branchName ? Promise.resolve(gitState.branchName) : this._gitService.getCurrentBranch(workingDirectory),
      this._gitService.resolveBranchBaselineCommit(workingDirectory, baseBranch)
    ]);
    if (!headCommitHash) {
      return void 0;
    }
    const repoInfo = { ...remote, headCommitHash, headBranchName };
    const safety = await this._gitService.getBranchDiffSafetyInfo(workingDirectory, headCommitHash);
    if (!safety) {
      return void 0;
    }
    if (safety.hasVirtualFileSystem) {
      return this._report(telemetryContext, isContextCurrent, telemetryMessageId, clientType, location, repoInfo, "virtualFileSystem", 0, 0, 0);
    }
    if (safety.baselineCommitTimestamp === void 0 || Date.now() - safety.baselineCommitTimestamp > MAX_MERGE_BASE_AGE_MS) {
      return this._report(telemetryContext, isContextCurrent, telemetryMessageId, clientType, location, repoInfo, "mergeBaseTooOld", 0, 0, 0);
    }
    if (safety.commitCount === void 0 || safety.commitCount >= MAX_DIFF_COMMITS) {
      return this._report(telemetryContext, isContextCurrent, telemetryMessageId, clientType, location, repoInfo, "tooManyCommits", 0, 0, 0);
    }
    const tree = await this._gitService.captureWorkingTreeAsTree(workingDirectory);
    if (!tree) {
      return void 0;
    }
    const fileDiffs = await this._gitService.computeFileDiffsBetweenRefs(workingDirectory, {
      sessionUri,
      fromRef: headCommitHash,
      toRef: tree
    });
    if (!fileDiffs) {
      return void 0;
    }
    if (fileDiffs.length === 0) {
      return await this._reportIfTreeUnchanged(telemetryContext, isContextCurrent, telemetryMessageId, clientType, location, repoInfo, workingDirectory, tree, "noChanges", safety.workspaceFileCount, 0, 0);
    }
    if (fileDiffs.length > MAX_CHANGES) {
      return this._report(telemetryContext, isContextCurrent, telemetryMessageId, clientType, location, repoInfo, "tooManyChanges", safety.workspaceFileCount, fileDiffs.length, 0);
    }
    const repositoryRoot = await this._gitService.getRepositoryRoot(workingDirectory);
    if (!repositoryRoot) {
      return void 0;
    }
    const untracked = new Set(untrackedPaths ?? []);
    const descriptors = fileDiffs.map((diff) => this._describeFileDiff(repositoryRoot, diff, untracked));
    if (descriptors.some((descriptor) => descriptor === void 0)) {
      return void 0;
    }
    const resolvedDescriptors = descriptors;
    let allowedDescriptors = resolvedDescriptors;
    if (telemetryContext.copilotIgnoreEnabled !== false) {
      allowedDescriptors = await this._filterContentExclusionAllowedDescriptors(repositoryRoot, resolvedDescriptors, checkContentExclusion);
    }
    const fileRelativePaths = JSON.stringify([...new Set(allowedDescriptors.map((descriptor) => descriptor.newPath ?? descriptor.oldPath).filter((path) => path !== void 0))]);
    let patchTooLarge = false;
    const limiter = new Limiter(DIFF_PATCH_CONCURRENCY);
    const diffs = await Promise.all(allowedDescriptors.map((descriptor) => limiter.queue(async () => {
      const paths = [...new Set([descriptor.oldPath, descriptor.newPath].filter((path) => path !== void 0))];
      const result = await this._gitService.getDiffPatchBetweenRefs(workingDirectory, { fromRef: headCommitHash, toRef: tree, paths, maxBuffer: MAX_DIFFS_JSON_BYTES });
      if (!result) {
        throw new Error(`Failed to compute diff for ${paths.join(", ")}`);
      }
      if (result.tooLarge) {
        patchTooLarge = true;
      }
      return {
        uri: descriptor.uri,
        originalUri: descriptor.originalUri,
        renameUri: descriptor.renameUri,
        status: descriptor.status,
        diff: truncateRepoInfoDiff(result.patch ?? "", descriptor.uri)
      };
    })));
    if (patchTooLarge) {
      return await this._reportIfTreeUnchanged(telemetryContext, isContextCurrent, telemetryMessageId, clientType, location, repoInfo, workingDirectory, tree, "diffTooLarge", safety.workspaceFileCount, fileDiffs.length, MAX_DIFFS_JSON_BYTES + 1, fileRelativePaths);
    }
    const diffsJSON = diffs.length > 0 ? JSON.stringify(diffs) : void 0;
    if (!diffsJSON) {
      return await this._reportIfTreeUnchanged(telemetryContext, isContextCurrent, telemetryMessageId, clientType, location, repoInfo, workingDirectory, tree, "success", safety.workspaceFileCount, fileDiffs.length, 0, fileRelativePaths);
    }
    const measurement = measureRepoInfoDiffsJSON(diffsJSON);
    if (measurement.tooLarge) {
      return await this._reportIfTreeUnchanged(telemetryContext, isContextCurrent, telemetryMessageId, clientType, location, repoInfo, workingDirectory, tree, "diffTooLarge", safety.workspaceFileCount, fileDiffs.length, measurement.diffSizeBytes, fileRelativePaths);
    }
    return await this._reportIfTreeUnchanged(telemetryContext, isContextCurrent, telemetryMessageId, clientType, location, repoInfo, workingDirectory, tree, "success", safety.workspaceFileCount, fileDiffs.length, measurement.diffSizeBytes, fileRelativePaths, diffsJSON);
  }
  async _filterContentExclusionAllowedDescriptors(repositoryRoot, descriptors, checkContentExclusion) {
    if (!checkContentExclusion) {
      return [];
    }
    const paths = [...new Set(descriptors.flatMap((descriptor) => [descriptor.oldPath, descriptor.newPath].filter((path) => path !== void 0).map((path) => joinPath(repositoryRoot, path).fsPath)))];
    if (paths.length === 0) {
      return [];
    }
    let result;
    try {
      result = await checkContentExclusion(paths);
    } catch {
      return [];
    }
    if (result.available !== true || !Array.isArray(result.checks) || result.checks.length !== paths.length) {
      return [];
    }
    const allowedPaths = /* @__PURE__ */ new Set();
    for (let index = 0; index < paths.length; index++) {
      const check = result.checks[index];
      if (!check || typeof check.path !== "string" || check.path !== paths[index] || typeof check.excluded !== "boolean") {
        return [];
      }
      if (check.excluded === false) {
        allowedPaths.add(check.path);
      }
    }
    return descriptors.filter((descriptor) => [descriptor.oldPath, descriptor.newPath].filter((path) => path !== void 0).every((path) => allowedPaths.has(joinPath(repositoryRoot, path).fsPath)));
  }
  async _reportIfTreeUnchanged(telemetryContext, isContextCurrent, telemetryMessageId, clientType, location, repoInfo, workingDirectory, capturedTree, stableResult, workspaceFileCount, changedFileCount, diffSizeBytes, fileRelativePaths, diffsJSON) {
    const currentTree = await this._gitService.captureWorkingTreeAsTree(workingDirectory);
    if (!currentTree || currentTree !== capturedTree) {
      return this._report(telemetryContext, isContextCurrent, telemetryMessageId, clientType, location, repoInfo, "filesChanged", workspaceFileCount, changedFileCount, 0);
    }
    return this._report(telemetryContext, isContextCurrent, telemetryMessageId, clientType, location, repoInfo, stableResult, workspaceFileCount, changedFileCount, diffSizeBytes, fileRelativePaths, diffsJSON);
  }
  _describeFileDiff(repositoryRoot, diff, untrackedPaths) {
    const beforeUri = diff.before?.uri;
    const afterUri = diff.after?.uri;
    const oldPath = beforeUri ? relativePath(repositoryRoot, URI.parse(beforeUri)) : void 0;
    const newPath = afterUri ? relativePath(repositoryRoot, URI.parse(afterUri)) : void 0;
    if (!oldPath && !newPath || !beforeUri && !afterUri) {
      return void 0;
    }
    const uri = afterUri ?? beforeUri;
    let status;
    if (!beforeUri) {
      status = newPath && untrackedPaths.has(newPath) ? "UNTRACKED" : "INDEX_ADDED";
    } else if (!afterUri) {
      status = "DELETED";
    } else if (beforeUri !== afterUri) {
      status = "INDEX_RENAMED";
    } else {
      status = "MODIFIED";
    }
    return {
      uri,
      originalUri: beforeUri ?? uri,
      renameUri: status === "INDEX_RENAMED" ? afterUri : void 0,
      status,
      oldPath,
      newPath
    };
  }
  _report(telemetryContext, isContextCurrent, telemetryMessageId, clientType, location, repoInfo, result, workspaceFileCount, changedFileCount, diffSizeBytes, fileRelativePaths, diffsJSON) {
    if (this._isDisposed || !isContextCurrent()) {
      return result;
    }
    void this._reporter.reportRepoInfo(telemetryContext, {
      telemetryMessageId,
      clientType,
      location,
      remoteUrl: repoInfo.remoteUrl,
      repoId: repoInfo.repoId,
      repoType: repoInfo.repoType,
      headCommitHash: repoInfo.headCommitHash,
      headBranchName: repoInfo.headBranchName,
      fileRelativePaths,
      diffsJSON,
      result,
      isActiveRepository: "true",
      workspaceFileCount,
      changedFileCount,
      diffSizeBytes
    }).catch((err) => this._logService.trace(`[AgentHostRepoInfoTelemetry] Failed to report repo info: ${err instanceof Error ? err.message : String(err)}`));
    return result;
  }
};
AgentHostRepoInfoTelemetry = __decorateClass([
  __decorateParam(1, IAgentHostGitService),
  __decorateParam(2, IAgentHostGitHubEndpointService),
  __decorateParam(3, ILogService)
], AgentHostRepoInfoTelemetry);
function truncateRepoInfoDiff(diff, uri) {
  if (diff.length <= MAX_DIFF_SIZE) {
    return diff;
  }
  return `${diff.substring(0, MAX_DIFF_SIZE)}
... Diff truncated (exceeded ${MAX_DIFF_SIZE} characters) for ${uri}`;
}
export {
  AgentHostRepoInfoTelemetry,
  measureRepoInfoDiffsJSON,
  resolveRepoInfoRemote
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxwbGF0Zm9ybVxcYWdlbnRIb3N0XFxub2RlXFxhZ2VudEhvc3RSZXBvSW5mb1RlbGVtZXRyeS50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB7IExpbWl0ZXIgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9hc3luYy5qcyc7XG5pbXBvcnQgeyBEaXNwb3NhYmxlIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IGpvaW5QYXRoLCByZWxhdGl2ZVBhdGggfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9yZXNvdXJjZXMuanMnO1xuaW1wb3J0IHsgVVJJIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vdXJpLmpzJztcbmltcG9ydCB7IElMb2dTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vbG9nL2NvbW1vbi9sb2cuanMnO1xuaW1wb3J0IHR5cGUgeyBBZ2VudEhvc3RDbGllbnRUeXBlIH0gZnJvbSAnLi4vY29tbW9uL2FnZW50SG9zdENsaWVudEluZm8uanMnO1xuaW1wb3J0IHsgSUFnZW50SG9zdEdpdFNlcnZpY2UgfSBmcm9tICcuLi9jb21tb24vYWdlbnRIb3N0R2l0U2VydmljZS5qcyc7XG5pbXBvcnQgdHlwZSB7IElTZXNzaW9uRmlsZURpZmYgfSBmcm9tICcuLi9jb21tb24vc3RhdGUvc2Vzc2lvblN0YXRlLmpzJztcbmltcG9ydCB7IElBZ2VudEhvc3RHaXRIdWJFbmRwb2ludFNlcnZpY2UgfSBmcm9tICcuL2FnZW50SG9zdEdpdEh1YkVuZHBvaW50U2VydmljZS5qcyc7XG5pbXBvcnQgdHlwZSB7IEFnZW50SG9zdFJlcG9JbmZvUmVzdWx0LCBBZ2VudEhvc3RUZWxlbWV0cnlSZXBvcnRlciB9IGZyb20gJy4vYWdlbnRIb3N0VGVsZW1ldHJ5UmVwb3J0ZXIuanMnO1xuaW1wb3J0IHR5cGUgeyBJQWdlbnRIb3N0UmVzdHJpY3RlZFRlbGVtZXRyeUNvbnRleHQgfSBmcm9tICcuL2FnZW50SG9zdFJlc3RyaWN0ZWRUZWxlbWV0cnkuanMnO1xuXG5jb25zdCBNQVhfRElGRlNfSlNPTl9CWVRFUyA9IDkwMCAqIDEwMjQ7XG5jb25zdCBNQVhfRElGRlNfSlNPTl9DSEFSUyA9IDUwICogODE5MjtcbmNvbnN0IE1BWF9DSEFOR0VTID0gMTAwO1xuY29uc3QgTUFYX01FUkdFX0JBU0VfQUdFX01TID0gMzAgKiAyNCAqIDYwICogNjAgKiAxMDAwO1xuY29uc3QgTUFYX0RJRkZfQ09NTUlUUyA9IDMwO1xuY29uc3QgRElGRl9QQVRDSF9DT05DVVJSRU5DWSA9IDQ7XG5jb25zdCBNQVhfRElGRl9TSVpFID0gMTAwXzAwMDtcblxuaW50ZXJmYWNlIElSZXBvSW5mb0NvbnRleHQgZXh0ZW5kcyBJUmVzb2x2ZWRSZXBvSW5mb1JlbW90ZSB7XG5cdHJlYWRvbmx5IGhlYWRDb21taXRIYXNoOiBzdHJpbmc7XG5cdHJlYWRvbmx5IGhlYWRCcmFuY2hOYW1lOiBzdHJpbmcgfCB1bmRlZmluZWQ7XG59XG5cbmludGVyZmFjZSBJUmVwb0luZm9GaWxlRGVzY3JpcHRvciB7XG5cdHJlYWRvbmx5IHVyaTogc3RyaW5nO1xuXHRyZWFkb25seSBvcmlnaW5hbFVyaTogc3RyaW5nO1xuXHRyZWFkb25seSByZW5hbWVVcmk6IHN0cmluZyB8IHVuZGVmaW5lZDtcblx0cmVhZG9ubHkgc3RhdHVzOiAnSU5ERVhfQURERUQnIHwgJ01PRElGSUVEJyB8ICdERUxFVEVEJyB8ICdJTkRFWF9SRU5BTUVEJyB8ICdVTlRSQUNLRUQnO1xuXHRyZWFkb25seSBvbGRQYXRoOiBzdHJpbmcgfCB1bmRlZmluZWQ7XG5cdHJlYWRvbmx5IG5ld1BhdGg6IHN0cmluZyB8IHVuZGVmaW5lZDtcbn1cblxudHlwZSBSZXBvSW5mb1RlbGVtZXRyeVJlcG9ydGVyID0gUGljazxBZ2VudEhvc3RUZWxlbWV0cnlSZXBvcnRlciwgJ3JlcG9ydFJlcG9JbmZvJz47XG5leHBvcnQgdHlwZSBSZXBvSW5mb0NvbnRlbnRFeGNsdXNpb25DaGVja2VyID0gKHBhdGhzOiByZWFkb25seSBzdHJpbmdbXSkgPT4gUHJvbWlzZTx7XG5cdHJlYWRvbmx5IGF2YWlsYWJsZTogYm9vbGVhbjtcblx0cmVhZG9ubHkgY2hlY2tzOiByZWFkb25seSB7IHJlYWRvbmx5IHBhdGg6IHN0cmluZzsgcmVhZG9ubHkgZXhjbHVkZWQ6IGJvb2xlYW4gfVtdO1xufT47XG5cbmV4cG9ydCBpbnRlcmZhY2UgSVJlc29sdmVkUmVwb0luZm9SZW1vdGUge1xuXHRyZWFkb25seSByZW1vdGVVcmw6IHN0cmluZztcblx0cmVhZG9ubHkgcmVwb0lkOiBzdHJpbmc7XG5cdHJlYWRvbmx5IHJlcG9UeXBlOiAnZ2l0aHViJyB8ICdhZG8nO1xufVxuXG4vKiogUmVzb2x2ZXMgYSBHaXRIdWIsIEdpdEh1YiBFbnRlcnByaXNlLCBvciBBenVyZSBEZXZPcHMgZmV0Y2ggVVJMLiAqL1xuZXhwb3J0IGZ1bmN0aW9uIHJlc29sdmVSZXBvSW5mb1JlbW90ZShyZW1vdGVVcmw6IHN0cmluZywgZW50ZXJwcmlzZUhvc3Q6IHN0cmluZyB8IHVuZGVmaW5lZCk6IElSZXNvbHZlZFJlcG9JbmZvUmVtb3RlIHwgdW5kZWZpbmVkIHtcblx0Y29uc3Qgc2NwTWF0Y2ggPSByZW1vdGVVcmwuaW5jbHVkZXMoJzovLycpID8gdW5kZWZpbmVkIDogL14oPzpbXkBcXHNdK0ApPyg/PGhvc3Q+W146XFxzXSspOig/PHBhdGg+LispJC8uZXhlYyhyZW1vdGVVcmwpO1xuXHRsZXQgaG9zdDogc3RyaW5nO1xuXHRsZXQgcGF0aDogc3RyaW5nO1xuXHRsZXQgbm9ybWFsaXplZFJlbW90ZVVybDogc3RyaW5nO1xuXHRpZiAoc2NwTWF0Y2g/Lmdyb3Vwcykge1xuXHRcdGhvc3QgPSBzY3BNYXRjaC5ncm91cHNbJ2hvc3QnXTtcblx0XHRwYXRoID0gc2NwTWF0Y2guZ3JvdXBzWydwYXRoJ107XG5cdFx0bm9ybWFsaXplZFJlbW90ZVVybCA9IGBodHRwczovLyR7aG9zdH0vJHtwYXRofWA7XG5cdH0gZWxzZSB7XG5cdFx0bGV0IHBhcnNlZDogVVJMO1xuXHRcdHRyeSB7XG5cdFx0XHRwYXJzZWQgPSBuZXcgVVJMKHJlbW90ZVVybCk7XG5cdFx0fSBjYXRjaCB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblx0XHRob3N0ID0gcGFyc2VkLmhvc3Q7XG5cdFx0cGF0aCA9IHBhcnNlZC5wYXRobmFtZTtcblx0XHRub3JtYWxpemVkUmVtb3RlVXJsID0gYGh0dHBzOi8vJHtob3N0fSR7cGF0aH1gO1xuXHR9XG5cblx0Y29uc3Qgbm9ybWFsaXplZEhvc3QgPSBob3N0LnRvTG93ZXJDYXNlKCk7XG5cdGNvbnN0IG5vcm1hbGl6ZWRIb3N0bmFtZSA9IG5vcm1hbGl6ZWRIb3N0LnJlcGxhY2UoLzpcXGQrJC8sICcnKTtcblx0Y29uc3Qgbm9ybWFsaXplZFBhdGggPSBwYXRoLnJlcGxhY2UoL15cXC8rfFxcLyskL2csICcnKTtcblx0aWYgKG5vcm1hbGl6ZWRIb3N0bmFtZSA9PT0gJ2dpdGh1Yi5jb20nIHx8IG5vcm1hbGl6ZWRIb3N0ID09PSBlbnRlcnByaXNlSG9zdD8udG9Mb3dlckNhc2UoKSB8fCBub3JtYWxpemVkSG9zdG5hbWUgPT09ICdnaGUuY29tJyB8fCBub3JtYWxpemVkSG9zdG5hbWUuZW5kc1dpdGgoJy5naGUuY29tJykpIHtcblx0XHRjb25zdCBtYXRjaCA9IC9eKD88b3duZXI+W14vXSspXFwvKD88cmVwbz5bXi9dKz8pKD86XFwuZ2l0KT8kL2kuZXhlYyhub3JtYWxpemVkUGF0aCk7XG5cdFx0aWYgKCFtYXRjaD8uZ3JvdXBzKSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblx0XHRyZXR1cm4ge1xuXHRcdFx0cmVtb3RlVXJsOiBub3JtYWxpemVkUmVtb3RlVXJsLFxuXHRcdFx0cmVwb0lkOiBgJHttYXRjaC5ncm91cHNbJ293bmVyJ119LyR7bWF0Y2guZ3JvdXBzWydyZXBvJ119YC50b0xvd2VyQ2FzZSgpLFxuXHRcdFx0cmVwb1R5cGU6ICdnaXRodWInLFxuXHRcdH07XG5cdH1cblxuXHRsZXQgYWRvTWF0Y2g6IFJlZ0V4cEV4ZWNBcnJheSB8IG51bGwgPSBudWxsO1xuXHRpZiAobm9ybWFsaXplZEhvc3RuYW1lID09PSAnZGV2LmF6dXJlLmNvbScpIHtcblx0XHRhZG9NYXRjaCA9IC9eKD88b3JnPlteL10rKVxcLyg/PHByb2plY3Q+W14vXSspXFwvX2dpdFxcLyg/Ol8oPzpvcHRpbWl6ZWR8ZnVsbClcXC8pPyg/PHJlcG8+W14vXSs/KSg/OlxcLmdpdCk/JC9pLmV4ZWMobm9ybWFsaXplZFBhdGgpO1xuXHR9IGVsc2UgaWYgKG5vcm1hbGl6ZWRIb3N0bmFtZSA9PT0gJ3NzaC5kZXYuYXp1cmUuY29tJykge1xuXHRcdGFkb01hdGNoID0gL152M1xcLyg/PG9yZz5bXi9dKylcXC8oPzxwcm9qZWN0PlteL10rKVxcLyg/Ol8oPzpvcHRpbWl6ZWR8ZnVsbClcXC8pPyg/PHJlcG8+W14vXSs/KSg/OlxcLmdpdCk/JC9pLmV4ZWMobm9ybWFsaXplZFBhdGgpO1xuXHR9IGVsc2UgaWYgKG5vcm1hbGl6ZWRIb3N0bmFtZS5lbmRzV2l0aCgnLnZpc3VhbHN0dWRpby5jb20nKSkge1xuXHRcdGFkb01hdGNoID0gL152M1xcLyg/PG9yZz5bXi9dKylcXC8oPzxwcm9qZWN0PlteL10rKVxcLyg/Ol8oPzpvcHRpbWl6ZWR8ZnVsbClcXC8pPyg/PHJlcG8+W14vXSs/KSg/OlxcLmdpdCk/JC9pLmV4ZWMobm9ybWFsaXplZFBhdGgpXG5cdFx0XHQ/PyAvXig/OlteL10rXFwvKT8oPzxwcm9qZWN0PlteL10rKVxcL19naXRcXC8oPzpfKD86b3B0aW1pemVkfGZ1bGwpXFwvKT8oPzxyZXBvPlteL10rPykoPzpcXC5naXQpPyQvaS5leGVjKG5vcm1hbGl6ZWRQYXRoKTtcblx0XHRpZiAoYWRvTWF0Y2g/Lmdyb3VwcyAmJiAhYWRvTWF0Y2guZ3JvdXBzWydvcmcnXSkge1xuXHRcdFx0YWRvTWF0Y2guZ3JvdXBzWydvcmcnXSA9IG5vcm1hbGl6ZWRIb3N0bmFtZS5zdWJzdHJpbmcoMCwgbm9ybWFsaXplZEhvc3RuYW1lLmxlbmd0aCAtICcudmlzdWFsc3R1ZGlvLmNvbScubGVuZ3RoKTtcblx0XHR9XG5cdH1cblx0aWYgKCFhZG9NYXRjaD8uZ3JvdXBzPy5bJ29yZyddIHx8ICFhZG9NYXRjaC5ncm91cHNbJ3Byb2plY3QnXSB8fCAhYWRvTWF0Y2guZ3JvdXBzWydyZXBvJ10pIHtcblx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHR9XG5cdHJldHVybiB7XG5cdFx0cmVtb3RlVXJsOiBub3JtYWxpemVkUmVtb3RlVXJsLFxuXHRcdHJlcG9JZDogYCR7YWRvTWF0Y2guZ3JvdXBzWydvcmcnXX0vJHthZG9NYXRjaC5ncm91cHNbJ3Byb2plY3QnXX0vJHthZG9NYXRjaC5ncm91cHNbJ3JlcG8nXX1gLnRvTG93ZXJDYXNlKCksXG5cdFx0cmVwb1R5cGU6ICdhZG8nLFxuXHR9O1xufVxuXG4vKiogTWVhc3VyZXMgYSBzZXJpYWxpemVkIGRpZmYgcGF5bG9hZCB1c2luZyB0aGUgdHdvIGxpbWl0cyBhcHBsaWVkIGJ5IHRoZSBsZWdhY3kgZXh0ZW5zaW9uLiAqL1xuZXhwb3J0IGZ1bmN0aW9uIG1lYXN1cmVSZXBvSW5mb0RpZmZzSlNPTihkaWZmc0pTT046IHN0cmluZyk6IHsgcmVhZG9ubHkgZGlmZlNpemVCeXRlczogbnVtYmVyOyByZWFkb25seSB0b29MYXJnZTogYm9vbGVhbiB9IHtcblx0Y29uc3QgZGlmZlNpemVCeXRlcyA9IEJ1ZmZlci5ieXRlTGVuZ3RoKGRpZmZzSlNPTiwgJ3V0ZjgnKTtcblx0cmV0dXJuIHtcblx0XHRkaWZmU2l6ZUJ5dGVzLFxuXHRcdHRvb0xhcmdlOiBkaWZmU2l6ZUJ5dGVzID4gTUFYX0RJRkZTX0pTT05fQllURVMgfHwgZGlmZnNKU09OLmxlbmd0aCA+IE1BWF9ESUZGU19KU09OX0NIQVJTLFxuXHR9O1xufVxuXG5leHBvcnQgY2xhc3MgQWdlbnRIb3N0UmVwb0luZm9UZWxlbWV0cnkgZXh0ZW5kcyBEaXNwb3NhYmxlIHtcblx0cHJpdmF0ZSByZWFkb25seSBfYmVnaW5SZXN1bHRzID0gbmV3IE1hcDxzdHJpbmcsIHsgcmVhZG9ubHkgY2xpZW50VHlwZTogQWdlbnRIb3N0Q2xpZW50VHlwZTsgcmVhZG9ubHkgcmVzdWx0OiBQcm9taXNlPEFnZW50SG9zdFJlcG9JbmZvUmVzdWx0IHwgdW5kZWZpbmVkPiB9PigpO1xuXHRwcml2YXRlIF9pc0Rpc3Bvc2VkID0gZmFsc2U7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0cHJpdmF0ZSByZWFkb25seSBfcmVwb3J0ZXI6IFJlcG9JbmZvVGVsZW1ldHJ5UmVwb3J0ZXIsXG5cdFx0QElBZ2VudEhvc3RHaXRTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2dpdFNlcnZpY2U6IElBZ2VudEhvc3RHaXRTZXJ2aWNlLFxuXHRcdEBJQWdlbnRIb3N0R2l0SHViRW5kcG9pbnRTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2dpdEh1YkVuZHBvaW50U2VydmljZTogSUFnZW50SG9zdEdpdEh1YkVuZHBvaW50U2VydmljZSxcblx0XHRASUxvZ1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfbG9nU2VydmljZTogSUxvZ1NlcnZpY2UsXG5cdCkge1xuXHRcdHN1cGVyKCk7XG5cdH1cblxuXHRhc3luYyByZXBvcnRCZWdpbihjb250ZXh0OiBJQWdlbnRIb3N0UmVzdHJpY3RlZFRlbGVtZXRyeUNvbnRleHQsIHNlc3Npb25Vcmk6IHN0cmluZywgdGVsZW1ldHJ5TWVzc2FnZUlkOiBzdHJpbmcsIGNsaWVudFR5cGU6IEFnZW50SG9zdENsaWVudFR5cGUsIHdvcmtpbmdEaXJlY3Rvcnk6IFVSSSB8IHVuZGVmaW5lZCwgYmFzZUJyYW5jaDogc3RyaW5nIHwgdW5kZWZpbmVkLCBpc0NvbnRleHRDdXJyZW50OiAoKSA9PiBib29sZWFuLCBjaGVja0NvbnRlbnRFeGNsdXNpb24/OiBSZXBvSW5mb0NvbnRlbnRFeGNsdXNpb25DaGVja2VyKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0bGV0IGJlZ2luID0gdGhpcy5fYmVnaW5SZXN1bHRzLmdldCh0ZWxlbWV0cnlNZXNzYWdlSWQpO1xuXHRcdGlmICghYmVnaW4pIHtcblx0XHRcdGJlZ2luID0ge1xuXHRcdFx0XHRjbGllbnRUeXBlLFxuXHRcdFx0XHRyZXN1bHQ6IHRoaXMuX2NhcHR1cmVTYWZlbHkoY29udGV4dCwgc2Vzc2lvblVyaSwgdGVsZW1ldHJ5TWVzc2FnZUlkLCBjbGllbnRUeXBlLCAnYmVnaW4nLCB3b3JraW5nRGlyZWN0b3J5LCBiYXNlQnJhbmNoLCBpc0NvbnRleHRDdXJyZW50LCBjaGVja0NvbnRlbnRFeGNsdXNpb24pLFxuXHRcdFx0fTtcblx0XHRcdHRoaXMuX2JlZ2luUmVzdWx0cy5zZXQodGVsZW1ldHJ5TWVzc2FnZUlkLCBiZWdpbik7XG5cdFx0fVxuXHRcdGF3YWl0IGJlZ2luLnJlc3VsdDtcblx0fVxuXG5cdGFzeW5jIHJlcG9ydEVuZChjb250ZXh0OiBJQWdlbnRIb3N0UmVzdHJpY3RlZFRlbGVtZXRyeUNvbnRleHQsIHNlc3Npb25Vcmk6IHN0cmluZywgdGVsZW1ldHJ5TWVzc2FnZUlkOiBzdHJpbmcsIHdvcmtpbmdEaXJlY3Rvcnk6IFVSSSB8IHVuZGVmaW5lZCwgYmFzZUJyYW5jaDogc3RyaW5nIHwgdW5kZWZpbmVkLCBpc0NvbnRleHRDdXJyZW50OiAoKSA9PiBib29sZWFuLCBjaGVja0NvbnRlbnRFeGNsdXNpb24/OiBSZXBvSW5mb0NvbnRlbnRFeGNsdXNpb25DaGVja2VyKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3QgYmVnaW4gPSB0aGlzLl9iZWdpblJlc3VsdHMuZ2V0KHRlbGVtZXRyeU1lc3NhZ2VJZCk7XG5cdFx0aWYgKCFiZWdpbikge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHR0cnkge1xuXHRcdFx0Y29uc3QgYmVnaW5SZXN1bHQgPSBhd2FpdCBiZWdpbi5yZXN1bHQ7XG5cdFx0XHRpZiAoYmVnaW5SZXN1bHQgPT09ICdzdWNjZXNzJyB8fCBiZWdpblJlc3VsdCA9PT0gJ25vQ2hhbmdlcycpIHtcblx0XHRcdFx0YXdhaXQgdGhpcy5fY2FwdHVyZVNhZmVseShjb250ZXh0LCBzZXNzaW9uVXJpLCB0ZWxlbWV0cnlNZXNzYWdlSWQsIGJlZ2luLmNsaWVudFR5cGUsICdlbmQnLCB3b3JraW5nRGlyZWN0b3J5LCBiYXNlQnJhbmNoLCBpc0NvbnRleHRDdXJyZW50LCBjaGVja0NvbnRlbnRFeGNsdXNpb24pO1xuXHRcdFx0fVxuXHRcdH0gZmluYWxseSB7XG5cdFx0XHR0aGlzLl9iZWdpblJlc3VsdHMuZGVsZXRlKHRlbGVtZXRyeU1lc3NhZ2VJZCk7XG5cdFx0fVxuXHR9XG5cblx0Y2xlYXJUdXJuKHRlbGVtZXRyeU1lc3NhZ2VJZDogc3RyaW5nKTogdm9pZCB7XG5cdFx0dGhpcy5fYmVnaW5SZXN1bHRzLmRlbGV0ZSh0ZWxlbWV0cnlNZXNzYWdlSWQpO1xuXHR9XG5cblx0b3ZlcnJpZGUgZGlzcG9zZSgpOiB2b2lkIHtcblx0XHR0aGlzLl9pc0Rpc3Bvc2VkID0gdHJ1ZTtcblx0XHR0aGlzLl9iZWdpblJlc3VsdHMuY2xlYXIoKTtcblx0XHRzdXBlci5kaXNwb3NlKCk7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIF9jYXB0dXJlU2FmZWx5KGNvbnRleHQ6IElBZ2VudEhvc3RSZXN0cmljdGVkVGVsZW1ldHJ5Q29udGV4dCwgc2Vzc2lvblVyaTogc3RyaW5nLCB0ZWxlbWV0cnlNZXNzYWdlSWQ6IHN0cmluZywgY2xpZW50VHlwZTogQWdlbnRIb3N0Q2xpZW50VHlwZSwgbG9jYXRpb246ICdiZWdpbicgfCAnZW5kJywgd29ya2luZ0RpcmVjdG9yeTogVVJJIHwgdW5kZWZpbmVkLCBiYXNlQnJhbmNoOiBzdHJpbmcgfCB1bmRlZmluZWQsIGlzQ29udGV4dEN1cnJlbnQ6ICgpID0+IGJvb2xlYW4sIGNoZWNrQ29udGVudEV4Y2x1c2lvbj86IFJlcG9JbmZvQ29udGVudEV4Y2x1c2lvbkNoZWNrZXIpOiBQcm9taXNlPEFnZW50SG9zdFJlcG9JbmZvUmVzdWx0IHwgdW5kZWZpbmVkPiB7XG5cdFx0dHJ5IHtcblx0XHRcdHJldHVybiBhd2FpdCB0aGlzLl9jYXB0dXJlKGNvbnRleHQsIHNlc3Npb25VcmksIHRlbGVtZXRyeU1lc3NhZ2VJZCwgY2xpZW50VHlwZSwgbG9jYXRpb24sIHdvcmtpbmdEaXJlY3RvcnksIGJhc2VCcmFuY2gsIGlzQ29udGV4dEN1cnJlbnQsIGNoZWNrQ29udGVudEV4Y2x1c2lvbik7XG5cdFx0fSBjYXRjaCAoZXJyb3IpIHtcblx0XHRcdHRoaXMuX2xvZ1NlcnZpY2Uud2FybihgW0FnZW50SG9zdFJlcG9JbmZvVGVsZW1ldHJ5XSBGYWlsZWQgdG8gY2FwdHVyZSAke2xvY2F0aW9ufSByZXBvIGluZm86ICR7ZXJyb3IgaW5zdGFuY2VvZiBFcnJvciA/IGVycm9yLm1lc3NhZ2UgOiBTdHJpbmcoZXJyb3IpfWApO1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIF9jYXB0dXJlKHRlbGVtZXRyeUNvbnRleHQ6IElBZ2VudEhvc3RSZXN0cmljdGVkVGVsZW1ldHJ5Q29udGV4dCwgc2Vzc2lvblVyaTogc3RyaW5nLCB0ZWxlbWV0cnlNZXNzYWdlSWQ6IHN0cmluZywgY2xpZW50VHlwZTogQWdlbnRIb3N0Q2xpZW50VHlwZSwgbG9jYXRpb246ICdiZWdpbicgfCAnZW5kJywgd29ya2luZ0RpcmVjdG9yeTogVVJJIHwgdW5kZWZpbmVkLCBwZXJzaXN0ZWRCYXNlQnJhbmNoOiBzdHJpbmcgfCB1bmRlZmluZWQsIGlzQ29udGV4dEN1cnJlbnQ6ICgpID0+IGJvb2xlYW4sIGNoZWNrQ29udGVudEV4Y2x1c2lvbj86IFJlcG9JbmZvQ29udGVudEV4Y2x1c2lvbkNoZWNrZXIpOiBQcm9taXNlPEFnZW50SG9zdFJlcG9JbmZvUmVzdWx0IHwgdW5kZWZpbmVkPiB7XG5cdFx0aWYgKCF3b3JraW5nRGlyZWN0b3J5IHx8ICFpc0NvbnRleHRDdXJyZW50KCkgfHwgKCF0ZWxlbWV0cnlDb250ZXh0LnJlc3RyaWN0ZWRUZWxlbWV0cnlFbmFibGVkICYmICF0ZWxlbWV0cnlDb250ZXh0LmlzSW50ZXJuYWwpKSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblxuXHRcdGNvbnN0IFtnaXRTdGF0ZSwgdW50cmFja2VkUGF0aHNdID0gYXdhaXQgUHJvbWlzZS5hbGwoW1xuXHRcdFx0dGhpcy5fZ2l0U2VydmljZS5nZXRTZXNzaW9uR2l0U3RhdGUod29ya2luZ0RpcmVjdG9yeSksXG5cdFx0XHR0aGlzLl9naXRTZXJ2aWNlLmdldFVudHJhY2tlZFBhdGhzKHdvcmtpbmdEaXJlY3RvcnkpLFxuXHRcdF0pO1xuXHRcdGNvbnN0IHVwc3RyZWFtUmVtb3RlID0gZ2l0U3RhdGU/LnVwc3RyZWFtQnJhbmNoTmFtZT8uc3BsaXQoJy8nKVswXTtcblx0XHRjb25zdCBmZXRjaFJlbW90ZVVybHMgPSBhd2FpdCB0aGlzLl9naXRTZXJ2aWNlLmdldEZldGNoUmVtb3RlVXJscyh3b3JraW5nRGlyZWN0b3J5LCB1cHN0cmVhbVJlbW90ZSk7XG5cdFx0Y29uc3QgcmVtb3RlID0gZmV0Y2hSZW1vdGVVcmxzXG5cdFx0XHQ/Lm1hcCh1cmwgPT4gcmVzb2x2ZVJlcG9JbmZvUmVtb3RlKHVybCwgdGhpcy5fZ2l0SHViRW5kcG9pbnRTZXJ2aWNlLmdldEVudGVycHJpc2VIb3N0KCkpKVxuXHRcdFx0LmZpbmQoKGNhbmRpZGF0ZSk6IGNhbmRpZGF0ZSBpcyBJUmVzb2x2ZWRSZXBvSW5mb1JlbW90ZSA9PiBjYW5kaWRhdGUgIT09IHVuZGVmaW5lZCk7XG5cdFx0aWYgKCFyZW1vdGUpIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXG5cdFx0Y29uc3QgYmFzZUJyYW5jaCA9IHBlcnNpc3RlZEJhc2VCcmFuY2ggPz8gZ2l0U3RhdGU/LnVwc3RyZWFtQnJhbmNoTmFtZSA/PyBnaXRTdGF0ZT8uYmFzZUJyYW5jaE5hbWUgPz8gKGF3YWl0IHRoaXMuX2dpdFNlcnZpY2UuZ2V0RGVmYXVsdEJyYW5jaCh3b3JraW5nRGlyZWN0b3J5KSk/Lm5hbWU7XG5cdFx0Y29uc3QgW2hlYWRCcmFuY2hOYW1lLCBoZWFkQ29tbWl0SGFzaF0gPSBhd2FpdCBQcm9taXNlLmFsbChbXG5cdFx0XHRnaXRTdGF0ZT8uYnJhbmNoTmFtZSA/IFByb21pc2UucmVzb2x2ZShnaXRTdGF0ZS5icmFuY2hOYW1lKSA6IHRoaXMuX2dpdFNlcnZpY2UuZ2V0Q3VycmVudEJyYW5jaCh3b3JraW5nRGlyZWN0b3J5KSxcblx0XHRcdHRoaXMuX2dpdFNlcnZpY2UucmVzb2x2ZUJyYW5jaEJhc2VsaW5lQ29tbWl0KHdvcmtpbmdEaXJlY3RvcnksIGJhc2VCcmFuY2gpLFxuXHRcdF0pO1xuXHRcdGlmICghaGVhZENvbW1pdEhhc2gpIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXHRcdGNvbnN0IHJlcG9JbmZvOiBJUmVwb0luZm9Db250ZXh0ID0geyAuLi5yZW1vdGUsIGhlYWRDb21taXRIYXNoLCBoZWFkQnJhbmNoTmFtZSB9O1xuXHRcdGNvbnN0IHNhZmV0eSA9IGF3YWl0IHRoaXMuX2dpdFNlcnZpY2UuZ2V0QnJhbmNoRGlmZlNhZmV0eUluZm8od29ya2luZ0RpcmVjdG9yeSwgaGVhZENvbW1pdEhhc2gpO1xuXHRcdGlmICghc2FmZXR5KSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblx0XHRpZiAoc2FmZXR5Lmhhc1ZpcnR1YWxGaWxlU3lzdGVtKSB7XG5cdFx0XHRyZXR1cm4gdGhpcy5fcmVwb3J0KHRlbGVtZXRyeUNvbnRleHQsIGlzQ29udGV4dEN1cnJlbnQsIHRlbGVtZXRyeU1lc3NhZ2VJZCwgY2xpZW50VHlwZSwgbG9jYXRpb24sIHJlcG9JbmZvLCAndmlydHVhbEZpbGVTeXN0ZW0nLCAwLCAwLCAwKTtcblx0XHR9XG5cdFx0aWYgKHNhZmV0eS5iYXNlbGluZUNvbW1pdFRpbWVzdGFtcCA9PT0gdW5kZWZpbmVkIHx8IERhdGUubm93KCkgLSBzYWZldHkuYmFzZWxpbmVDb21taXRUaW1lc3RhbXAgPiBNQVhfTUVSR0VfQkFTRV9BR0VfTVMpIHtcblx0XHRcdHJldHVybiB0aGlzLl9yZXBvcnQodGVsZW1ldHJ5Q29udGV4dCwgaXNDb250ZXh0Q3VycmVudCwgdGVsZW1ldHJ5TWVzc2FnZUlkLCBjbGllbnRUeXBlLCBsb2NhdGlvbiwgcmVwb0luZm8sICdtZXJnZUJhc2VUb29PbGQnLCAwLCAwLCAwKTtcblx0XHR9XG5cdFx0aWYgKHNhZmV0eS5jb21taXRDb3VudCA9PT0gdW5kZWZpbmVkIHx8IHNhZmV0eS5jb21taXRDb3VudCA+PSBNQVhfRElGRl9DT01NSVRTKSB7XG5cdFx0XHRyZXR1cm4gdGhpcy5fcmVwb3J0KHRlbGVtZXRyeUNvbnRleHQsIGlzQ29udGV4dEN1cnJlbnQsIHRlbGVtZXRyeU1lc3NhZ2VJZCwgY2xpZW50VHlwZSwgbG9jYXRpb24sIHJlcG9JbmZvLCAndG9vTWFueUNvbW1pdHMnLCAwLCAwLCAwKTtcblx0XHR9XG5cdFx0Y29uc3QgdHJlZSA9IGF3YWl0IHRoaXMuX2dpdFNlcnZpY2UuY2FwdHVyZVdvcmtpbmdUcmVlQXNUcmVlKHdvcmtpbmdEaXJlY3RvcnkpO1xuXHRcdGlmICghdHJlZSkge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cblx0XHRjb25zdCBmaWxlRGlmZnMgPSBhd2FpdCB0aGlzLl9naXRTZXJ2aWNlLmNvbXB1dGVGaWxlRGlmZnNCZXR3ZWVuUmVmcyh3b3JraW5nRGlyZWN0b3J5LCB7XG5cdFx0XHRzZXNzaW9uVXJpLFxuXHRcdFx0ZnJvbVJlZjogaGVhZENvbW1pdEhhc2gsXG5cdFx0XHR0b1JlZjogdHJlZSxcblx0XHR9KTtcblx0XHRpZiAoIWZpbGVEaWZmcykge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cdFx0aWYgKGZpbGVEaWZmcy5sZW5ndGggPT09IDApIHtcblx0XHRcdHJldHVybiBhd2FpdCB0aGlzLl9yZXBvcnRJZlRyZWVVbmNoYW5nZWQodGVsZW1ldHJ5Q29udGV4dCwgaXNDb250ZXh0Q3VycmVudCwgdGVsZW1ldHJ5TWVzc2FnZUlkLCBjbGllbnRUeXBlLCBsb2NhdGlvbiwgcmVwb0luZm8sIHdvcmtpbmdEaXJlY3RvcnksIHRyZWUsICdub0NoYW5nZXMnLCBzYWZldHkud29ya3NwYWNlRmlsZUNvdW50LCAwLCAwKTtcblx0XHR9XG5cdFx0aWYgKGZpbGVEaWZmcy5sZW5ndGggPiBNQVhfQ0hBTkdFUykge1xuXHRcdFx0cmV0dXJuIHRoaXMuX3JlcG9ydCh0ZWxlbWV0cnlDb250ZXh0LCBpc0NvbnRleHRDdXJyZW50LCB0ZWxlbWV0cnlNZXNzYWdlSWQsIGNsaWVudFR5cGUsIGxvY2F0aW9uLCByZXBvSW5mbywgJ3Rvb01hbnlDaGFuZ2VzJywgc2FmZXR5LndvcmtzcGFjZUZpbGVDb3VudCwgZmlsZURpZmZzLmxlbmd0aCwgMCk7XG5cdFx0fVxuXG5cdFx0Y29uc3QgcmVwb3NpdG9yeVJvb3QgPSBhd2FpdCB0aGlzLl9naXRTZXJ2aWNlLmdldFJlcG9zaXRvcnlSb290KHdvcmtpbmdEaXJlY3RvcnkpO1xuXHRcdGlmICghcmVwb3NpdG9yeVJvb3QpIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXHRcdGNvbnN0IHVudHJhY2tlZCA9IG5ldyBTZXQodW50cmFja2VkUGF0aHMgPz8gW10pO1xuXHRcdGNvbnN0IGRlc2NyaXB0b3JzID0gZmlsZURpZmZzLm1hcChkaWZmID0+IHRoaXMuX2Rlc2NyaWJlRmlsZURpZmYocmVwb3NpdG9yeVJvb3QsIGRpZmYsIHVudHJhY2tlZCkpO1xuXHRcdGlmIChkZXNjcmlwdG9ycy5zb21lKGRlc2NyaXB0b3IgPT4gZGVzY3JpcHRvciA9PT0gdW5kZWZpbmVkKSkge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cdFx0Y29uc3QgcmVzb2x2ZWREZXNjcmlwdG9ycyA9IGRlc2NyaXB0b3JzIGFzIElSZXBvSW5mb0ZpbGVEZXNjcmlwdG9yW107XG5cdFx0bGV0IGFsbG93ZWREZXNjcmlwdG9ycyA9IHJlc29sdmVkRGVzY3JpcHRvcnM7XG5cdFx0aWYgKHRlbGVtZXRyeUNvbnRleHQuY29waWxvdElnbm9yZUVuYWJsZWQgIT09IGZhbHNlKSB7XG5cdFx0XHRhbGxvd2VkRGVzY3JpcHRvcnMgPSBhd2FpdCB0aGlzLl9maWx0ZXJDb250ZW50RXhjbHVzaW9uQWxsb3dlZERlc2NyaXB0b3JzKHJlcG9zaXRvcnlSb290LCByZXNvbHZlZERlc2NyaXB0b3JzLCBjaGVja0NvbnRlbnRFeGNsdXNpb24pO1xuXHRcdH1cblx0XHRjb25zdCBmaWxlUmVsYXRpdmVQYXRocyA9IEpTT04uc3RyaW5naWZ5KFsuLi5uZXcgU2V0KGFsbG93ZWREZXNjcmlwdG9ycy5tYXAoZGVzY3JpcHRvciA9PiBkZXNjcmlwdG9yLm5ld1BhdGggPz8gZGVzY3JpcHRvci5vbGRQYXRoKS5maWx0ZXIoKHBhdGgpOiBwYXRoIGlzIHN0cmluZyA9PiBwYXRoICE9PSB1bmRlZmluZWQpKV0pO1xuXHRcdGxldCBwYXRjaFRvb0xhcmdlID0gZmFsc2U7XG5cdFx0Y29uc3QgbGltaXRlciA9IG5ldyBMaW1pdGVyPHsgcmVhZG9ubHkgdXJpOiBzdHJpbmc7IHJlYWRvbmx5IG9yaWdpbmFsVXJpOiBzdHJpbmc7IHJlYWRvbmx5IHJlbmFtZVVyaTogc3RyaW5nIHwgdW5kZWZpbmVkOyByZWFkb25seSBzdGF0dXM6IHN0cmluZzsgcmVhZG9ubHkgZGlmZjogc3RyaW5nIH0+KERJRkZfUEFUQ0hfQ09OQ1VSUkVOQ1kpO1xuXHRcdGNvbnN0IGRpZmZzID0gYXdhaXQgUHJvbWlzZS5hbGwoYWxsb3dlZERlc2NyaXB0b3JzLm1hcChkZXNjcmlwdG9yID0+IGxpbWl0ZXIucXVldWUoYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgcGF0aHMgPSBbLi4ubmV3IFNldChbZGVzY3JpcHRvci5vbGRQYXRoLCBkZXNjcmlwdG9yLm5ld1BhdGhdLmZpbHRlcigocGF0aCk6IHBhdGggaXMgc3RyaW5nID0+IHBhdGggIT09IHVuZGVmaW5lZCkpXTtcblx0XHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IHRoaXMuX2dpdFNlcnZpY2UuZ2V0RGlmZlBhdGNoQmV0d2VlblJlZnMod29ya2luZ0RpcmVjdG9yeSwgeyBmcm9tUmVmOiBoZWFkQ29tbWl0SGFzaCwgdG9SZWY6IHRyZWUsIHBhdGhzLCBtYXhCdWZmZXI6IE1BWF9ESUZGU19KU09OX0JZVEVTIH0pO1xuXHRcdFx0aWYgKCFyZXN1bHQpIHtcblx0XHRcdFx0dGhyb3cgbmV3IEVycm9yKGBGYWlsZWQgdG8gY29tcHV0ZSBkaWZmIGZvciAke3BhdGhzLmpvaW4oJywgJyl9YCk7XG5cdFx0XHR9XG5cdFx0XHRpZiAocmVzdWx0LnRvb0xhcmdlKSB7XG5cdFx0XHRcdHBhdGNoVG9vTGFyZ2UgPSB0cnVlO1xuXHRcdFx0fVxuXHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0dXJpOiBkZXNjcmlwdG9yLnVyaSxcblx0XHRcdFx0b3JpZ2luYWxVcmk6IGRlc2NyaXB0b3Iub3JpZ2luYWxVcmksXG5cdFx0XHRcdHJlbmFtZVVyaTogZGVzY3JpcHRvci5yZW5hbWVVcmksXG5cdFx0XHRcdHN0YXR1czogZGVzY3JpcHRvci5zdGF0dXMsXG5cdFx0XHRcdGRpZmY6IHRydW5jYXRlUmVwb0luZm9EaWZmKHJlc3VsdC5wYXRjaCA/PyAnJywgZGVzY3JpcHRvci51cmkpLFxuXHRcdFx0fTtcblx0XHR9KSkpO1xuXHRcdGlmIChwYXRjaFRvb0xhcmdlKSB7XG5cdFx0XHRyZXR1cm4gYXdhaXQgdGhpcy5fcmVwb3J0SWZUcmVlVW5jaGFuZ2VkKHRlbGVtZXRyeUNvbnRleHQsIGlzQ29udGV4dEN1cnJlbnQsIHRlbGVtZXRyeU1lc3NhZ2VJZCwgY2xpZW50VHlwZSwgbG9jYXRpb24sIHJlcG9JbmZvLCB3b3JraW5nRGlyZWN0b3J5LCB0cmVlLCAnZGlmZlRvb0xhcmdlJywgc2FmZXR5LndvcmtzcGFjZUZpbGVDb3VudCwgZmlsZURpZmZzLmxlbmd0aCwgTUFYX0RJRkZTX0pTT05fQllURVMgKyAxLCBmaWxlUmVsYXRpdmVQYXRocyk7XG5cdFx0fVxuXHRcdGNvbnN0IGRpZmZzSlNPTiA9IGRpZmZzLmxlbmd0aCA+IDAgPyBKU09OLnN0cmluZ2lmeShkaWZmcykgOiB1bmRlZmluZWQ7XG5cdFx0aWYgKCFkaWZmc0pTT04pIHtcblx0XHRcdHJldHVybiBhd2FpdCB0aGlzLl9yZXBvcnRJZlRyZWVVbmNoYW5nZWQodGVsZW1ldHJ5Q29udGV4dCwgaXNDb250ZXh0Q3VycmVudCwgdGVsZW1ldHJ5TWVzc2FnZUlkLCBjbGllbnRUeXBlLCBsb2NhdGlvbiwgcmVwb0luZm8sIHdvcmtpbmdEaXJlY3RvcnksIHRyZWUsICdzdWNjZXNzJywgc2FmZXR5LndvcmtzcGFjZUZpbGVDb3VudCwgZmlsZURpZmZzLmxlbmd0aCwgMCwgZmlsZVJlbGF0aXZlUGF0aHMpO1xuXHRcdH1cblx0XHRjb25zdCBtZWFzdXJlbWVudCA9IG1lYXN1cmVSZXBvSW5mb0RpZmZzSlNPTihkaWZmc0pTT04pO1xuXHRcdGlmIChtZWFzdXJlbWVudC50b29MYXJnZSkge1xuXHRcdFx0cmV0dXJuIGF3YWl0IHRoaXMuX3JlcG9ydElmVHJlZVVuY2hhbmdlZCh0ZWxlbWV0cnlDb250ZXh0LCBpc0NvbnRleHRDdXJyZW50LCB0ZWxlbWV0cnlNZXNzYWdlSWQsIGNsaWVudFR5cGUsIGxvY2F0aW9uLCByZXBvSW5mbywgd29ya2luZ0RpcmVjdG9yeSwgdHJlZSwgJ2RpZmZUb29MYXJnZScsIHNhZmV0eS53b3Jrc3BhY2VGaWxlQ291bnQsIGZpbGVEaWZmcy5sZW5ndGgsIG1lYXN1cmVtZW50LmRpZmZTaXplQnl0ZXMsIGZpbGVSZWxhdGl2ZVBhdGhzKTtcblx0XHR9XG5cdFx0cmV0dXJuIGF3YWl0IHRoaXMuX3JlcG9ydElmVHJlZVVuY2hhbmdlZCh0ZWxlbWV0cnlDb250ZXh0LCBpc0NvbnRleHRDdXJyZW50LCB0ZWxlbWV0cnlNZXNzYWdlSWQsIGNsaWVudFR5cGUsIGxvY2F0aW9uLCByZXBvSW5mbywgd29ya2luZ0RpcmVjdG9yeSwgdHJlZSwgJ3N1Y2Nlc3MnLCBzYWZldHkud29ya3NwYWNlRmlsZUNvdW50LCBmaWxlRGlmZnMubGVuZ3RoLCBtZWFzdXJlbWVudC5kaWZmU2l6ZUJ5dGVzLCBmaWxlUmVsYXRpdmVQYXRocywgZGlmZnNKU09OKTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgX2ZpbHRlckNvbnRlbnRFeGNsdXNpb25BbGxvd2VkRGVzY3JpcHRvcnMocmVwb3NpdG9yeVJvb3Q6IFVSSSwgZGVzY3JpcHRvcnM6IHJlYWRvbmx5IElSZXBvSW5mb0ZpbGVEZXNjcmlwdG9yW10sIGNoZWNrQ29udGVudEV4Y2x1c2lvbjogUmVwb0luZm9Db250ZW50RXhjbHVzaW9uQ2hlY2tlciB8IHVuZGVmaW5lZCk6IFByb21pc2U8SVJlcG9JbmZvRmlsZURlc2NyaXB0b3JbXT4ge1xuXHRcdGlmICghY2hlY2tDb250ZW50RXhjbHVzaW9uKSB7XG5cdFx0XHRyZXR1cm4gW107XG5cdFx0fVxuXHRcdGNvbnN0IHBhdGhzID0gWy4uLm5ldyBTZXQoZGVzY3JpcHRvcnMuZmxhdE1hcChkZXNjcmlwdG9yID0+IFtkZXNjcmlwdG9yLm9sZFBhdGgsIGRlc2NyaXB0b3IubmV3UGF0aF1cblx0XHRcdC5maWx0ZXIoKHBhdGgpOiBwYXRoIGlzIHN0cmluZyA9PiBwYXRoICE9PSB1bmRlZmluZWQpXG5cdFx0XHQubWFwKHBhdGggPT4gam9pblBhdGgocmVwb3NpdG9yeVJvb3QsIHBhdGgpLmZzUGF0aCkpKV07XG5cdFx0aWYgKHBhdGhzLmxlbmd0aCA9PT0gMCkge1xuXHRcdFx0cmV0dXJuIFtdO1xuXHRcdH1cblx0XHRsZXQgcmVzdWx0OiBBd2FpdGVkPFJldHVyblR5cGU8UmVwb0luZm9Db250ZW50RXhjbHVzaW9uQ2hlY2tlcj4+O1xuXHRcdHRyeSB7XG5cdFx0XHRyZXN1bHQgPSBhd2FpdCBjaGVja0NvbnRlbnRFeGNsdXNpb24ocGF0aHMpO1xuXHRcdH0gY2F0Y2gge1xuXHRcdFx0cmV0dXJuIFtdO1xuXHRcdH1cblx0XHRpZiAocmVzdWx0LmF2YWlsYWJsZSAhPT0gdHJ1ZSB8fCAhQXJyYXkuaXNBcnJheShyZXN1bHQuY2hlY2tzKSB8fCByZXN1bHQuY2hlY2tzLmxlbmd0aCAhPT0gcGF0aHMubGVuZ3RoKSB7XG5cdFx0XHRyZXR1cm4gW107XG5cdFx0fVxuXHRcdGNvbnN0IGFsbG93ZWRQYXRocyA9IG5ldyBTZXQ8c3RyaW5nPigpO1xuXHRcdGZvciAobGV0IGluZGV4ID0gMDsgaW5kZXggPCBwYXRocy5sZW5ndGg7IGluZGV4KyspIHtcblx0XHRcdGNvbnN0IGNoZWNrID0gcmVzdWx0LmNoZWNrc1tpbmRleF07XG5cdFx0XHRpZiAoIWNoZWNrIHx8IHR5cGVvZiBjaGVjay5wYXRoICE9PSAnc3RyaW5nJyB8fCBjaGVjay5wYXRoICE9PSBwYXRoc1tpbmRleF0gfHwgdHlwZW9mIGNoZWNrLmV4Y2x1ZGVkICE9PSAnYm9vbGVhbicpIHtcblx0XHRcdFx0cmV0dXJuIFtdO1xuXHRcdFx0fVxuXHRcdFx0aWYgKGNoZWNrLmV4Y2x1ZGVkID09PSBmYWxzZSkge1xuXHRcdFx0XHRhbGxvd2VkUGF0aHMuYWRkKGNoZWNrLnBhdGgpO1xuXHRcdFx0fVxuXHRcdH1cblx0XHRyZXR1cm4gZGVzY3JpcHRvcnMuZmlsdGVyKGRlc2NyaXB0b3IgPT4gW2Rlc2NyaXB0b3Iub2xkUGF0aCwgZGVzY3JpcHRvci5uZXdQYXRoXVxuXHRcdFx0LmZpbHRlcigocGF0aCk6IHBhdGggaXMgc3RyaW5nID0+IHBhdGggIT09IHVuZGVmaW5lZClcblx0XHRcdC5ldmVyeShwYXRoID0+IGFsbG93ZWRQYXRocy5oYXMoam9pblBhdGgocmVwb3NpdG9yeVJvb3QsIHBhdGgpLmZzUGF0aCkpKTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgX3JlcG9ydElmVHJlZVVuY2hhbmdlZCh0ZWxlbWV0cnlDb250ZXh0OiBJQWdlbnRIb3N0UmVzdHJpY3RlZFRlbGVtZXRyeUNvbnRleHQsIGlzQ29udGV4dEN1cnJlbnQ6ICgpID0+IGJvb2xlYW4sIHRlbGVtZXRyeU1lc3NhZ2VJZDogc3RyaW5nLCBjbGllbnRUeXBlOiBBZ2VudEhvc3RDbGllbnRUeXBlLCBsb2NhdGlvbjogJ2JlZ2luJyB8ICdlbmQnLCByZXBvSW5mbzogSVJlcG9JbmZvQ29udGV4dCwgd29ya2luZ0RpcmVjdG9yeTogVVJJLCBjYXB0dXJlZFRyZWU6IHN0cmluZywgc3RhYmxlUmVzdWx0OiAnc3VjY2VzcycgfCAnbm9DaGFuZ2VzJyB8ICdkaWZmVG9vTGFyZ2UnLCB3b3Jrc3BhY2VGaWxlQ291bnQ6IG51bWJlciwgY2hhbmdlZEZpbGVDb3VudDogbnVtYmVyLCBkaWZmU2l6ZUJ5dGVzOiBudW1iZXIsIGZpbGVSZWxhdGl2ZVBhdGhzPzogc3RyaW5nLCBkaWZmc0pTT04/OiBzdHJpbmcpOiBQcm9taXNlPEFnZW50SG9zdFJlcG9JbmZvUmVzdWx0PiB7XG5cdFx0Y29uc3QgY3VycmVudFRyZWUgPSBhd2FpdCB0aGlzLl9naXRTZXJ2aWNlLmNhcHR1cmVXb3JraW5nVHJlZUFzVHJlZSh3b3JraW5nRGlyZWN0b3J5KTtcblx0XHRpZiAoIWN1cnJlbnRUcmVlIHx8IGN1cnJlbnRUcmVlICE9PSBjYXB0dXJlZFRyZWUpIHtcblx0XHRcdHJldHVybiB0aGlzLl9yZXBvcnQodGVsZW1ldHJ5Q29udGV4dCwgaXNDb250ZXh0Q3VycmVudCwgdGVsZW1ldHJ5TWVzc2FnZUlkLCBjbGllbnRUeXBlLCBsb2NhdGlvbiwgcmVwb0luZm8sICdmaWxlc0NoYW5nZWQnLCB3b3Jrc3BhY2VGaWxlQ291bnQsIGNoYW5nZWRGaWxlQ291bnQsIDApO1xuXHRcdH1cblx0XHRyZXR1cm4gdGhpcy5fcmVwb3J0KHRlbGVtZXRyeUNvbnRleHQsIGlzQ29udGV4dEN1cnJlbnQsIHRlbGVtZXRyeU1lc3NhZ2VJZCwgY2xpZW50VHlwZSwgbG9jYXRpb24sIHJlcG9JbmZvLCBzdGFibGVSZXN1bHQsIHdvcmtzcGFjZUZpbGVDb3VudCwgY2hhbmdlZEZpbGVDb3VudCwgZGlmZlNpemVCeXRlcywgZmlsZVJlbGF0aXZlUGF0aHMsIGRpZmZzSlNPTik7XG5cdH1cblxuXHRwcml2YXRlIF9kZXNjcmliZUZpbGVEaWZmKHJlcG9zaXRvcnlSb290OiBVUkksIGRpZmY6IElTZXNzaW9uRmlsZURpZmYsIHVudHJhY2tlZFBhdGhzOiBSZWFkb25seVNldDxzdHJpbmc+KTogSVJlcG9JbmZvRmlsZURlc2NyaXB0b3IgfCB1bmRlZmluZWQge1xuXHRcdGNvbnN0IGJlZm9yZVVyaSA9IGRpZmYuYmVmb3JlPy51cmk7XG5cdFx0Y29uc3QgYWZ0ZXJVcmkgPSBkaWZmLmFmdGVyPy51cmk7XG5cdFx0Y29uc3Qgb2xkUGF0aCA9IGJlZm9yZVVyaSA/IHJlbGF0aXZlUGF0aChyZXBvc2l0b3J5Um9vdCwgVVJJLnBhcnNlKGJlZm9yZVVyaSkpIDogdW5kZWZpbmVkO1xuXHRcdGNvbnN0IG5ld1BhdGggPSBhZnRlclVyaSA/IHJlbGF0aXZlUGF0aChyZXBvc2l0b3J5Um9vdCwgVVJJLnBhcnNlKGFmdGVyVXJpKSkgOiB1bmRlZmluZWQ7XG5cdFx0aWYgKCghb2xkUGF0aCAmJiAhbmV3UGF0aCkgfHwgKCFiZWZvcmVVcmkgJiYgIWFmdGVyVXJpKSkge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cdFx0Y29uc3QgdXJpID0gYWZ0ZXJVcmkgPz8gYmVmb3JlVXJpITtcblx0XHRsZXQgc3RhdHVzOiBJUmVwb0luZm9GaWxlRGVzY3JpcHRvclsnc3RhdHVzJ107XG5cdFx0aWYgKCFiZWZvcmVVcmkpIHtcblx0XHRcdHN0YXR1cyA9IG5ld1BhdGggJiYgdW50cmFja2VkUGF0aHMuaGFzKG5ld1BhdGgpID8gJ1VOVFJBQ0tFRCcgOiAnSU5ERVhfQURERUQnO1xuXHRcdH0gZWxzZSBpZiAoIWFmdGVyVXJpKSB7XG5cdFx0XHRzdGF0dXMgPSAnREVMRVRFRCc7XG5cdFx0fSBlbHNlIGlmIChiZWZvcmVVcmkgIT09IGFmdGVyVXJpKSB7XG5cdFx0XHRzdGF0dXMgPSAnSU5ERVhfUkVOQU1FRCc7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHN0YXR1cyA9ICdNT0RJRklFRCc7XG5cdFx0fVxuXHRcdHJldHVybiB7XG5cdFx0XHR1cmksXG5cdFx0XHRvcmlnaW5hbFVyaTogYmVmb3JlVXJpID8/IHVyaSxcblx0XHRcdHJlbmFtZVVyaTogc3RhdHVzID09PSAnSU5ERVhfUkVOQU1FRCcgPyBhZnRlclVyaSA6IHVuZGVmaW5lZCxcblx0XHRcdHN0YXR1cyxcblx0XHRcdG9sZFBhdGgsXG5cdFx0XHRuZXdQYXRoLFxuXHRcdH07XG5cdH1cblxuXHRwcml2YXRlIF9yZXBvcnQodGVsZW1ldHJ5Q29udGV4dDogSUFnZW50SG9zdFJlc3RyaWN0ZWRUZWxlbWV0cnlDb250ZXh0LCBpc0NvbnRleHRDdXJyZW50OiAoKSA9PiBib29sZWFuLCB0ZWxlbWV0cnlNZXNzYWdlSWQ6IHN0cmluZywgY2xpZW50VHlwZTogQWdlbnRIb3N0Q2xpZW50VHlwZSwgbG9jYXRpb246ICdiZWdpbicgfCAnZW5kJywgcmVwb0luZm86IElSZXBvSW5mb0NvbnRleHQsIHJlc3VsdDogQWdlbnRIb3N0UmVwb0luZm9SZXN1bHQsIHdvcmtzcGFjZUZpbGVDb3VudDogbnVtYmVyLCBjaGFuZ2VkRmlsZUNvdW50OiBudW1iZXIsIGRpZmZTaXplQnl0ZXM6IG51bWJlciwgZmlsZVJlbGF0aXZlUGF0aHM/OiBzdHJpbmcsIGRpZmZzSlNPTj86IHN0cmluZyk6IEFnZW50SG9zdFJlcG9JbmZvUmVzdWx0IHtcblx0XHRpZiAodGhpcy5faXNEaXNwb3NlZCB8fCAhaXNDb250ZXh0Q3VycmVudCgpKSB7XG5cdFx0XHRyZXR1cm4gcmVzdWx0O1xuXHRcdH1cblx0XHR2b2lkIHRoaXMuX3JlcG9ydGVyLnJlcG9ydFJlcG9JbmZvKHRlbGVtZXRyeUNvbnRleHQsIHtcblx0XHRcdHRlbGVtZXRyeU1lc3NhZ2VJZCxcblx0XHRcdGNsaWVudFR5cGUsXG5cdFx0XHRsb2NhdGlvbixcblx0XHRcdHJlbW90ZVVybDogcmVwb0luZm8ucmVtb3RlVXJsLFxuXHRcdFx0cmVwb0lkOiByZXBvSW5mby5yZXBvSWQsXG5cdFx0XHRyZXBvVHlwZTogcmVwb0luZm8ucmVwb1R5cGUsXG5cdFx0XHRoZWFkQ29tbWl0SGFzaDogcmVwb0luZm8uaGVhZENvbW1pdEhhc2gsXG5cdFx0XHRoZWFkQnJhbmNoTmFtZTogcmVwb0luZm8uaGVhZEJyYW5jaE5hbWUsXG5cdFx0XHRmaWxlUmVsYXRpdmVQYXRocyxcblx0XHRcdGRpZmZzSlNPTixcblx0XHRcdHJlc3VsdCxcblx0XHRcdGlzQWN0aXZlUmVwb3NpdG9yeTogJ3RydWUnLFxuXHRcdFx0d29ya3NwYWNlRmlsZUNvdW50LFxuXHRcdFx0Y2hhbmdlZEZpbGVDb3VudCxcblx0XHRcdGRpZmZTaXplQnl0ZXMsXG5cdFx0fSkuY2F0Y2goZXJyID0+IHRoaXMuX2xvZ1NlcnZpY2UudHJhY2UoYFtBZ2VudEhvc3RSZXBvSW5mb1RlbGVtZXRyeV0gRmFpbGVkIHRvIHJlcG9ydCByZXBvIGluZm86ICR7ZXJyIGluc3RhbmNlb2YgRXJyb3IgPyBlcnIubWVzc2FnZSA6IFN0cmluZyhlcnIpfWApKTtcblx0XHRyZXR1cm4gcmVzdWx0O1xuXHR9XG59XG5cbmZ1bmN0aW9uIHRydW5jYXRlUmVwb0luZm9EaWZmKGRpZmY6IHN0cmluZywgdXJpOiBzdHJpbmcpOiBzdHJpbmcge1xuXHRpZiAoZGlmZi5sZW5ndGggPD0gTUFYX0RJRkZfU0laRSkge1xuXHRcdHJldHVybiBkaWZmO1xuXHR9XG5cdHJldHVybiBgJHtkaWZmLnN1YnN0cmluZygwLCBNQVhfRElGRl9TSVpFKX1cXG4uLi4gRGlmZiB0cnVuY2F0ZWQgKGV4Y2VlZGVkICR7TUFYX0RJRkZfU0laRX0gY2hhcmFjdGVycykgZm9yICR7dXJpfWA7XG59XG4iXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7OztBQUtBLFNBQVMsZUFBZTtBQUN4QixTQUFTLGtCQUFrQjtBQUMzQixTQUFTLFVBQVUsb0JBQW9CO0FBQ3ZDLFNBQVMsV0FBVztBQUNwQixTQUFTLG1CQUFtQjtBQUU1QixTQUFTLDRCQUE0QjtBQUVyQyxTQUFTLHVDQUF1QztBQUloRCxNQUFNLHVCQUF1QixNQUFNO0FBQ25DLE1BQU0sdUJBQXVCLEtBQUs7QUFDbEMsTUFBTSxjQUFjO0FBQ3BCLE1BQU0sd0JBQXdCLEtBQUssS0FBSyxLQUFLLEtBQUs7QUFDbEQsTUFBTSxtQkFBbUI7QUFDekIsTUFBTSx5QkFBeUI7QUFDL0IsTUFBTSxnQkFBZ0I7QUE2QmYsU0FBUyxzQkFBc0IsV0FBbUIsZ0JBQXlFO0FBQ2pJLFFBQU0sV0FBVyxVQUFVLFNBQVMsS0FBSyxJQUFJLFNBQVksOENBQThDLEtBQUssU0FBUztBQUNySCxNQUFJO0FBQ0osTUFBSTtBQUNKLE1BQUk7QUFDSixNQUFJLFVBQVUsUUFBUTtBQUNyQixXQUFPLFNBQVMsT0FBTyxNQUFNO0FBQzdCLFdBQU8sU0FBUyxPQUFPLE1BQU07QUFDN0IsMEJBQXNCLFdBQVcsSUFBSSxJQUFJLElBQUk7QUFBQSxFQUM5QyxPQUFPO0FBQ04sUUFBSTtBQUNKLFFBQUk7QUFDSCxlQUFTLElBQUksSUFBSSxTQUFTO0FBQUEsSUFDM0IsUUFBUTtBQUNQLGFBQU87QUFBQSxJQUNSO0FBQ0EsV0FBTyxPQUFPO0FBQ2QsV0FBTyxPQUFPO0FBQ2QsMEJBQXNCLFdBQVcsSUFBSSxHQUFHLElBQUk7QUFBQSxFQUM3QztBQUVBLFFBQU0saUJBQWlCLEtBQUssWUFBWTtBQUN4QyxRQUFNLHFCQUFxQixlQUFlLFFBQVEsU0FBUyxFQUFFO0FBQzdELFFBQU0saUJBQWlCLEtBQUssUUFBUSxj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
