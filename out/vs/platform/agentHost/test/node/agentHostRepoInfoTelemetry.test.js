import assert from "assert";
import { URI } from "../../../../base/common/uri.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../base/test/common/utils.js";
import { NullLogService } from "../../../log/common/log.js";
import { AgentHostClientType } from "../../common/agentHostClientInfo.js";
import { AgentHostRepoInfoTelemetry, measureRepoInfoDiffsJSON, resolveRepoInfoRemote } from "../../node/agentHostRepoInfoTelemetry.js";
import { createNoopGitService } from "../common/sessionTestHelpers.js";
import { createTestGitHubEndpointService } from "./testGitHubEndpointService.js";
const restrictedContext = {
  restrictedTelemetryEnabled: true,
  trackingId: "tracking-id",
  telemetryEndpoint: "https://telemetry.example/telemetry",
  isInternal: true,
  userName: "octocat",
  isVscodeTeamMember: true,
  copilotIgnoreEnabled: false
};
suite("AgentHostRepoInfoTelemetry", () => {
  const disposables = ensureNoDisposablesAreLeakedInTestSuite();
  test("resolves dotcom and configured Enterprise remotes", () => {
    assert.deepStrictEqual({
      https: resolveRepoInfoRemote("https://github.com/microsoft/vscode.git", void 0),
      ssh: resolveRepoInfoRemote("git@github.com:microsoft/vscode.git", void 0),
      enterprise: resolveRepoInfoRemote("ssh://git@ghe.example.com/octo/repo.git", "ghe.example.com"),
      enterprisePort: resolveRepoInfoRemote("https://ghe.example.com:8443/octo/repo.git", "ghe.example.com:8443"),
      adoHttps: resolveRepoInfoRemote("https://dev.azure.com/Org/Project/_git/Repo", void 0),
      adoSsh: resolveRepoInfoRemote("git@ssh.dev.azure.com:v3/Org/Project/Repo", void 0),
      wrongEnterprise: resolveRepoInfoRemote("https://other.example.com/octo/repo.git", "ghe.example.com")
    }, {
      https: { remoteUrl: "https://github.com/microsoft/vscode.git", repoId: "microsoft/vscode", repoType: "github" },
      ssh: { remoteUrl: "https://github.com/microsoft/vscode.git", repoId: "microsoft/vscode", repoType: "github" },
      enterprise: { remoteUrl: "https://ghe.example.com/octo/repo.git", repoId: "octo/repo", repoType: "github" },
      enterprisePort: { remoteUrl: "https://ghe.example.com:8443/octo/repo.git", repoId: "octo/repo", repoType: "github" },
      adoHttps: { remoteUrl: "https://dev.azure.com/Org/Project/_git/Repo", repoId: "org/project/repo", repoType: "ado" },
      adoSsh: { remoteUrl: "https://ssh.dev.azure.com/v3/Org/Project/Repo", repoId: "org/project/repo", repoType: "ado" },
      wrongEnterprise: void 0
    });
  });
  test("applies the legacy byte and multiplex character limits", () => {
    assert.deepStrictEqual({
      atCharacterLimit: measureRepoInfoDiffsJSON("x".repeat(50 * 8192)).tooLarge,
      overCharacterLimit: measureRepoInfoDiffsJSON("x".repeat(50 * 8192 + 1)).tooLarge,
      overByteLimit: measureRepoInfoDiffsJSON("\u20AC".repeat(307201)).tooLarge
    }, {
      atCharacterLimit: false,
      overCharacterLimit: true,
      overByteLimit: true
    });
  });
  test("emits structured begin and end snapshots against the branch baseline", async () => {
    const root = URI.file("/repo");
    const snapshots = ["tree-begin", "tree-begin", "tree-end", "tree-end"];
    const patches = [];
    const fileDiff = {
      before: { uri: URI.joinPath(root, "src/a.ts").toString(), content: { uri: "git-blob://before" } },
      after: { uri: URI.joinPath(root, "src/a.ts").toString(), content: { uri: "git-blob://after" } },
      diff: { added: 1, removed: 1 }
    };
    const gitService = {
      ...createNoopGitService(),
      getRepositoryRoot: async () => root,
      getSessionGitState: async () => ({ branchName: "feature", baseBranchName: "main" }),
      getFetchRemoteUrls: async () => ["git@github.com:microsoft/vscode.git"],
      resolveBranchBaselineCommit: async () => "base",
      getBranchDiffSafetyInfo: async () => ({ hasVirtualFileSystem: false, baselineCommitTimestamp: Date.now(), commitCount: 1, workspaceFileCount: 42 }),
      captureWorkingTreeAsTree: async () => snapshots.shift(),
      computeFileDiffsBetweenRefs: async () => [fileDiff],
      getDiffPatchBetweenRefs: async (_workingDirectory, options) => {
        patches.push(options.toRef);
        return { patch: `patch-${options.toRef}`, tooLarge: false };
      }
    };
    const reports = [];
    const collector = disposables.add(new AgentHostRepoInfoTelemetry({
      reportRepoInfo: async (_context, report) => {
        reports.push(report);
      }
    }, gitService, createTestGitHubEndpointService(), new NullLogService()));
    await collector.reportBegin(restrictedContext, "agent-session://copilot/s1", "turn-1", AgentHostClientType.EditorWindow, root, void 0, () => true);
    await collector.reportEnd(restrictedContext, "agent-session://copilot/s1", "turn-1", root, void 0, () => true);
    assert.deepStrictEqual({
      patches,
      reports: reports.map((report) => ({
        telemetryMessageId: report.telemetryMessageId,
        clientType: report.clientType,
        location: report.location,
        result: report.result,
        remoteUrl: report.remoteUrl,
        repoId: report.repoId,
        headCommitHash: report.headCommitHash,
        headBranchName: report.headBranchName,
        fileRelativePaths: report.fileRelativePaths,
        diffs: report.diffsJSON ? JSON.parse(report.diffsJSON) : void 0,
        workspaceFileCount: report.workspaceFileCount,
        changedFileCount: report.changedFileCount
      }))
    }, {
      patches: ["tree-begin", "tree-end"],
      reports: [{
        telemetryMessageId: "turn-1",
        clientType: AgentHostClientType.EditorWindow,
        location: "begin",
        result: "success",
        remoteUrl: "https://github.com/microsoft/vscode.git",
        repoId: "microsoft/vscode",
        headCommitHash: "base",
        headBranchName: "feature",
        fileRelativePaths: JSON.stringify(["src/a.ts"]),
        diffs: [{
          uri: URI.joinPath(root, "src/a.ts").toString(),
          originalUri: URI.joinPath(root, "src/a.ts").toString(),
          status: "MODIFIED",
          diff: "patch-tree-begin"
        }],
        workspaceFileCount: 42,
        changedFileCount: 1
      }, {
        telemetryMessageId: "turn-1",
        clientType: AgentHostClientType.EditorWindow,
        location: "end",
        result: "success",
        remoteUrl: "https://github.com/microsoft/vscode.git",
        repoId: "microsoft/vscode",
        headCommitHash: "base",
        headBranchName: "feature",
        fileRelativePaths: JSON.stringify(["src/a.ts"]),
        diffs: [{
          uri: URI.joinPath(root, "src/a.ts").toString(),
          originalUri: URI.joinPath(root, "src/a.ts").toString(),
          status: "MODIFIED",
          diff: "patch-tree-end"
        }],
        workspaceFileCount: 42,
        changedFileCount: 1
      }]
    });
  });
  test("skips Git collection when restricted telemetry is unavailable", async () => {
    let gitCalls = 0;
    const gitService = {
      ...createNoopGitService(),
      getSessionGitState: async () => {
        gitCalls++;
        return void 0;
      }
    };
    const collector = disposables.add(new AgentHostRepoInfoTelemetry({ reportRepoInfo: async () => {
    } }, gitService, createTestGitHubEndpointService(), new NullLogService()));
    await collector.reportBegin({ ...restrictedContext, restrictedTelemetryEnabled: false, isInternal: false }, "agent-session://copilot/s1", "turn-1", AgentHostClientType.Unknown, URI.file("/repo"), void 0, () => true);
    assert.strictEqual(gitCalls, 0);
  });
  test("does not emit end after a begin result that legacy suppresses", async () => {
    const root = URI.file("/repo");
    const fileDiffs = Array.from({ length: 101 }, (_, index) => ({
      after: { uri: URI.joinPath(root, `file-${index}.txt`).toString(), content: { uri: `git-blob://after/${index}` } },
      diff: { added: 1, removed: 0 }
    }));
    let snapshots = 0;
    const gitService = {
      ...createNoopGitService(),
      getRepositoryRoot: async () => root,
      getSessionGitState: async () => ({ branchName: "feature", baseBranchName: "main" }),
      getFetchRemoteUrls: async () => ["https://github.com/microsoft/vscode"],
      resolveBranchBaselineCommit: async () => "base",
      getBranchDiffSafetyInfo: async () => ({ hasVirtualFileSystem: false, baselineCommitTimestamp: Date.now(), commitCount: 1, workspaceFileCount: 42 }),
      captureWorkingTreeAsTree: async () => {
        snapshots++;
        return "tree";
      },
      computeFileDiffsBetweenRefs: async () => fileDiffs
    };
    const reports = [];
    const collector = disposables.add(new AgentHostRepoInfoTelemetry({ reportRepoInfo: async (_context, report) => {
      reports.push(report);
    } }, gitService, createTestGitHubEndpointService(), new NullLogService()));
    await collector.reportBegin(restrictedContext, "agent-session://copilot/s1", "turn-1", AgentHostClientType.AgentsWindow, root, void 0, () => true);
    await collector.reportEnd(restrictedContext, "agent-session://copilot/s1", "turn-1", root, void 0, () => true);
    assert.deepStrictEqual({ snapshots, results: reports.map((report) => report.result) }, { snapshots: 1, results: ["tooManyChanges"] });
  });
  test("fails closed when content exclusion is unavailable or no checker is provided", async () => {
    const root = URI.file("/repo");
    let patchCalls = 0;
    const gitService = {
      ...createNoopGitService(),
      getRepositoryRoot: async () => root,
      getSessionGitState: async () => ({ branchName: "feature", baseBranchName: "main" }),
      getFetchRemoteUrls: async () => ["https://github.com/Microsoft/VSCode"],
      getUntrackedPaths: async () => ["new.txt"],
      resolveBranchBaselineCommit: async () => "base",
      getBranchDiffSafetyInfo: async () => ({ hasVirtualFileSystem: false, baselineCommitTimestamp: Date.now(), commitCount: 1, workspaceFileCount: 2 }),
      captureWorkingTreeAsTree: async () => "tree",
      computeFileDiffsBetweenRefs: async () => [{
        after: { uri: URI.joinPath(root, "new.txt").toString(), content: { uri: "git-blob://after" } },
        diff: { added: 1, removed: 0 }
      }],
      getDiffPatchBetweenRefs: async () => {
        patchCalls++;
        return { patch: "secret", tooLarge: false };
      }
    };
    const reports = [];
    const collector = disposables.add(new AgentHostRepoInfoTelemetry({ reportRepoInfo: async (_context, report) => {
      reports.push(report);
    } }, gitService, createTestGitHubEndpointService(), new NullLogService()));
    await collector.reportBegin({ ...restrictedContext, copilotIgnoreEnabled: true }, "agent-session://copilot/s1", "turn-0", AgentHostClientType.Unknown, root, void 0, () => true, async () => ({ available: false, checks: [] }));
    await collector.reportBegin({ ...restrictedContext, copilotIgnoreEnabled: void 0 }, "agent-session://copilot/s1", "turn-1", AgentHostClientType.Unknown, root, void 0, () => true);
    await collector.reportBegin({ ...restrictedContext, copilotIgnoreEnabled: true }, "agent-session://copilot/s1", "turn-2", AgentHostClientType.Unknown, root, void 0, () => true, async () => {
      throw new Error("policy unavailable");
    });
    await collector.reportBegin({ ...restrictedContext, copilotIgnoreEnabled: true }, "agent-session://copilot/s1", "turn-3", AgentHostClientType.Unknown, root, void 0, () => true, async () => ({ available: "yes", checks: [{ path: "/repo/new.txt", excluded: null }] }));
    assert.deepStrictEqual({
      patchCalls,
      reports: reports.map((report) => ({
        repoId: report.repoId,
        fileRelativePaths: report.fileRelativePaths,
        diffsJSON: report.diffsJSON,
        result: report.result
      }))
    }, {
      patchCalls: 0,
      reports: [{
        repoId: "microsoft/vscode",
        fileRelativePaths: JSON.stringify([]),
        diffsJSON: void 0,
        result: "success"
      }, {
        repoId: "microsoft/vscode",
        fileRelativePaths: JSON.stringify([]),
        diffsJSON: void 0,
        result: "success"
      }, {
        repoId: "microsoft/vscode",
        fileRelativePaths: JSON.stringify([]),
        diffsJSON: void 0,
        result: "success"
      }, {
        repoId: "microsoft/vscode",
        fileRelativePaths: JSON.stringify([]),
        diffsJSON: void 0,
        result: "success"
      }]
    });
  });
  test("emits paths and patches only when every path for a change is allowed", async () => {
    const root = URI.file("/repo");
    const allowedUri = URI.joinPath(root, "allowed.txt");
    const excludedOldUri = URI.joinPath(root, "excluded-old.txt");
    const excludedNewUri = URI.joinPath(root, "excluded-new.txt");
    const checkedPaths = [];
    const patchPaths = [];
    const reports = [];
    const gitService = {
      ...createNoopGitService(),
      getRepositoryRoot: async () => root,
      getSessionGitState: async () => ({ branchName: "feature", baseBranchName: "main" }),
      getFetchRemoteUrls: async () => ["https://github.com/microsoft/vscode"],
      resolveBranchBaselineCommit: async () => "base",
      getBranchDiffSafetyInfo: async () => ({ hasVirtualFileSystem: false, baselineCommitTimestamp: Date.now(), commitCount: 1, workspaceFileCount: 2 }),
      captureWorkingTreeAsTree: async () => "tree",
      computeFileDiffsBetweenRefs: async () => [{
        before: { uri: allowedUri.toString(), content: { uri: "git-blob://allowed-before" } },
        after: { uri: allowedUri.toString(), content: { uri: "git-blob://allowed-after" } },
        diff: { added: 1, removed: 1 }
      }, {
        before: { uri: excludedOldUri.toString(), content: { uri: "git-blob://excluded-before" } },
        after: { uri: excludedNewUri.toString(), content: { uri: "git-blob://excluded-after" } },
        diff: { added: 1, removed: 1 }
      }],
      getDiffPatchBetweenRefs: async (_cwd, options) => {
        patchPaths.push([...options.paths]);
        return { patch: "allowed-patch", tooLarge: false };
      }
    };
    const collector = disposables.add(new AgentHostRepoInfoTelemetry({ reportRepoInfo: async (_context, report) => {
      reports.push(report);
    } }, gitService, createTestGitHubEndpointService(), new NullLogService()));
    await collector.reportBegin({ ...restrictedContext, copilotIgnoreEnabled: true }, "agent-session://copilot/s1", "turn-1", AgentHostClientType.EditorWindow, root, void 0, () => true, async (paths) => {
      checkedPaths.push([...paths]);
      return {
        available: true,
        checks: paths.map((path) => ({ path, excluded: path === excludedOldUri.fsPath }))
      };
    });
    assert.deepStrictEqual({
      checkedPaths,
      patchPaths,
      fileRelativePaths: reports[0].fileRelativePaths,
      diffs: JSON.parse(reports[0].diffsJSON ?? "[]").map((diff) => ({ uri: diff.uri, diff: diff.diff }))
    }, {
      checkedPaths: [[allowedUri.fsPath, excludedOldUri.fsPath, excludedNewUri.fsPath]],
      patchPaths: [["allowed.txt"]],
      fileRelativePaths: JSON.stringify(["allowed.txt"]),
      diffs: [{ uri: allowedUri.toString(), diff: "allowed-patch" }]
    });
  });
  test("reports filesChanged when the working tree changes during collection", async () => {
    const root = URI.file("/repo");
    const trees = ["tree-before", "tree-after"];
    const reports = [];
    const gitService = {
      ...createNoopGitService(),
      getRepositoryRoot: async () => root,
      getSessionGitState: async () => ({ branchName: "feature", baseBranchName: "main" }),
      getFetchRemoteUrls: async () => ["https://github.com/microsoft/vscode"],
      resolveBranchBaselineCommit: async () => "base",
      getBranchDiffSafetyInfo: async () => ({ hasVirtualFileSystem: false, baselineCommitTimestamp: Date.now(), commitCount: 1, workspaceFileCount: 1 }),
      captureWorkingTreeAsTree: async () => trees.shift(),
      computeFileDiffsBetweenRefs: async () => [{
        before: { uri: URI.joinPath(root, "a.txt").toString(), content: { uri: "git-blob://before" } },
        after: { uri: URI.joinPath(root, "a.txt").toString(), content: { uri: "git-blob://after" } },
        diff: { added: 1, removed: 1 }
      }],
      getDiffPatchBetweenRefs: async () => ({ patch: "-before\n+after", tooLarge: false })
    };
    const collector = disposables.add(new AgentHostRepoInfoTelemetry({ reportRepoInfo: async (_context, report) => {
      reports.push(report);
    } }, gitService, createTestGitHubEndpointService(), new NullLogService()));
    await collector.reportBegin(restrictedContext, "agent-session://copilot/s1", "turn-1", AgentHostClientType.EditorWindow, root, void 0, () => true);
    assert.deepStrictEqual(reports.map((report) => ({ result: report.result, diffsJSON: report.diffsJSON, fileRelativePaths: report.fileRelativePaths })), [{
      result: "filesChanged",
      diffsJSON: void 0,
      fileRelativePaths: void 0
    }]);
  });
  test("marks untracked files and truncates each diff at the legacy limit", async () => {
    const root = URI.file("/repo");
    const reports = [];
    const gitService = {
      ...createNoopGitService(),
      getRepositoryRoot: async () => root,
      getSessionGitState: async () => ({ branchName: "feature", baseBranchName: "main" }),
      getFetchRemoteUrls: async () => ["https://github.com/microsoft/vscode"],
      getUntrackedPaths: async () => ["new.txt"],
      resolveBranchBaselineCommit: async () => "base",
      getBranchDiffSafetyInfo: async () => ({ hasVirtualFileSystem: false, baselineCommitTimestamp: Date.now(), commitCount: 1, workspaceFileCount: 1 }),
      captureWorkingTreeAsTree: async () => "tree",
      computeFileDiffsBetweenRefs: async () => [{
        after: { uri: URI.joinPath(root, "new.txt").toString(), content: { uri: "git-blob://after" } },
        diff: { added: 1, removed: 0 }
      }],
      getDiffPatchBetweenRefs: async () => ({ patch: "x".repeat(100001), tooLarge: false })
    };
    const collector = disposables.add(new AgentHostRepoInfoTelemetry({ reportRepoInfo: async (_context, report) => {
      reports.push(report);
    } }, gitService, createTestGitHubEndpointService(), new NullLogService()));
    await collector.reportBegin(restrictedContext, "agent-session://copilot/s1", "turn-1", AgentHostClientType.EditorWindow, root, void 0, () => true);
    const diffs = JSON.parse(reports[0].diffsJSON ?? "[]");
    assert.deepStrictEqual({
      status: diffs[0]?.status,
      diffLength: diffs[0]?.diff.length,
      truncated: diffs[0]?.diff.endsWith(`... Diff truncated (exceeded 100000 characters) for ${URI.joinPath(root, "new.txt").toString()}`)
    }, {
      status: "UNTRACKED",
      diffLength: 100001 + `... Diff truncated (exceeded 100000 characters) for ${URI.joinPath(root, "new.txt").toString()}`.length,
      truncated: true
    });
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxwbGF0Zm9ybVxcYWdlbnRIb3N0XFx0ZXN0XFxub2RlXFxhZ2VudEhvc3RSZXBvSW5mb1RlbGVtZXRyeS50ZXN0LnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IGFzc2VydCBmcm9tICdhc3NlcnQnO1xuaW1wb3J0IHsgVVJJIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdXJpLmpzJztcbmltcG9ydCB7IGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvdGVzdC9jb21tb24vdXRpbHMuanMnO1xuaW1wb3J0IHsgTnVsbExvZ1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9sb2cvY29tbW9uL2xvZy5qcyc7XG5pbXBvcnQgeyBBZ2VudEhvc3RDbGllbnRUeXBlIH0gZnJvbSAnLi4vLi4vY29tbW9uL2FnZW50SG9zdENsaWVudEluZm8uanMnO1xuaW1wb3J0IHR5cGUgeyBJQWdlbnRIb3N0R2l0U2VydmljZSB9IGZyb20gJy4uLy4uL2NvbW1vbi9hZ2VudEhvc3RHaXRTZXJ2aWNlLmpzJztcbmltcG9ydCB0eXBlIHsgSVNlc3Npb25GaWxlRGlmZiB9IGZyb20gJy4uLy4uL2NvbW1vbi9zdGF0ZS9zZXNzaW9uU3RhdGUuanMnO1xuaW1wb3J0IHsgQWdlbnRIb3N0UmVwb0luZm9UZWxlbWV0cnksIG1lYXN1cmVSZXBvSW5mb0RpZmZzSlNPTiwgcmVzb2x2ZVJlcG9JbmZvUmVtb3RlIH0gZnJvbSAnLi4vLi4vbm9kZS9hZ2VudEhvc3RSZXBvSW5mb1RlbGVtZXRyeS5qcyc7XG5pbXBvcnQgdHlwZSB7IElBZ2VudEhvc3RSZXBvSW5mb1JlcG9ydCB9IGZyb20gJy4uLy4uL25vZGUvYWdlbnRIb3N0VGVsZW1ldHJ5UmVwb3J0ZXIuanMnO1xuaW1wb3J0IHsgY3JlYXRlTm9vcEdpdFNlcnZpY2UgfSBmcm9tICcuLi9jb21tb24vc2Vzc2lvblRlc3RIZWxwZXJzLmpzJztcbmltcG9ydCB7IGNyZWF0ZVRlc3RHaXRIdWJFbmRwb2ludFNlcnZpY2UgfSBmcm9tICcuL3Rlc3RHaXRIdWJFbmRwb2ludFNlcnZpY2UuanMnO1xuXG5jb25zdCByZXN0cmljdGVkQ29udGV4dCA9IHtcblx0cmVzdHJpY3RlZFRlbGVtZXRyeUVuYWJsZWQ6IHRydWUsXG5cdHRyYWNraW5nSWQ6ICd0cmFja2luZy1pZCcsXG5cdHRlbGVtZXRyeUVuZHBvaW50OiAnaHR0cHM6Ly90ZWxlbWV0cnkuZXhhbXBsZS90ZWxlbWV0cnknLFxuXHRpc0ludGVybmFsOiB0cnVlLFxuXHR1c2VyTmFtZTogJ29jdG9jYXQnLFxuXHRpc1ZzY29kZVRlYW1NZW1iZXI6IHRydWUsXG5cdGNvcGlsb3RJZ25vcmVFbmFibGVkOiBmYWxzZSxcbn07XG5cbnN1aXRlKCdBZ2VudEhvc3RSZXBvSW5mb1RlbGVtZXRyeScsICgpID0+IHtcblx0Y29uc3QgZGlzcG9zYWJsZXMgPSBlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUoKTtcblxuXHR0ZXN0KCdyZXNvbHZlcyBkb3Rjb20gYW5kIGNvbmZpZ3VyZWQgRW50ZXJwcmlzZSByZW1vdGVzJywgKCkgPT4ge1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0aHR0cHM6IHJlc29sdmVSZXBvSW5mb1JlbW90ZSgnaHR0cHM6Ly9naXRodWIuY29tL21pY3Jvc29mdC92c2NvZGUuZ2l0JywgdW5kZWZpbmVkKSxcblx0XHRcdHNzaDogcmVzb2x2ZVJlcG9JbmZvUmVtb3RlKCdnaXRAZ2l0aHViLmNvbTptaWNyb3NvZnQvdnNjb2RlLmdpdCcsIHVuZGVmaW5lZCksXG5cdFx0XHRlbnRlcnByaXNlOiByZXNvbHZlUmVwb0luZm9SZW1vdGUoJ3NzaDovL2dpdEBnaGUuZXhhbXBsZS5jb20vb2N0by9yZXBvLmdpdCcsICdnaGUuZXhhbXBsZS5jb20nKSxcblx0XHRcdGVudGVycHJpc2VQb3J0OiByZXNvbHZlUmVwb0luZm9SZW1vdGUoJ2h0dHBzOi8vZ2hlLmV4YW1wbGUuY29tOjg0NDMvb2N0by9yZXBvLmdpdCcsICdnaGUuZXhhbXBsZS5jb206ODQ0MycpLFxuXHRcdFx0YWRvSHR0cHM6IHJlc29sdmVSZXBvSW5mb1JlbW90ZSgnaHR0cHM6Ly9kZXYuYXp1cmUuY29tL09yZy9Qcm9qZWN0L19naXQvUmVwbycsIHVuZGVmaW5lZCksXG5cdFx0XHRhZG9Tc2g6IHJlc29sdmVSZXBvSW5mb1JlbW90ZSgnZ2l0QHNzaC5kZXYuYXp1cmUuY29tOnYzL09yZy9Qcm9qZWN0L1JlcG8nLCB1bmRlZmluZWQpLFxuXHRcdFx0d3JvbmdFbnRlcnByaXNlOiByZXNvbHZlUmVwb0luZm9SZW1vdGUoJ2h0dHBzOi8vb3RoZXIuZXhhbXBsZS5jb20vb2N0by9yZXBvLmdpdCcsICdnaGUuZXhhbXBsZS5jb20nKSxcblx0XHR9LCB7XG5cdFx0XHRodHRwczogeyByZW1vdGVVcmw6ICdodHRwczovL2dpdGh1Yi5jb20vbWljcm9zb2Z0L3ZzY29kZS5naXQnLCByZXBvSWQ6ICdtaWNyb3NvZnQvdnNjb2RlJywgcmVwb1R5cGU6ICdnaXRodWInIH0sXG5cdFx0XHRzc2g6IHsgcmVtb3RlVXJsOiAnaHR0cHM6Ly9naXRodWIuY29tL21pY3Jvc29mdC92c2NvZGUuZ2l0JywgcmVwb0lkOiAnbWljcm9zb2Z0L3ZzY29kZScsIHJlcG9UeXBlOiAnZ2l0aHViJyB9LFxuXHRcdFx0ZW50ZXJwcmlzZTogeyByZW1vdGVVcmw6ICdodHRwczovL2doZS5leGFtcGxlLmNvbS9vY3RvL3JlcG8uZ2l0JywgcmVwb0lkOiAnb2N0by9yZXBvJywgcmVwb1R5cGU6ICdnaXRodWInIH0sXG5cdFx0XHRlbnRlcnByaXNlUG9ydDogeyByZW1vdGVVcmw6ICdodHRwczovL2doZS5leGFtcGxlLmNvbTo4NDQzL29jdG8vcmVwby5naXQnLCByZXBvSWQ6ICdvY3RvL3JlcG8nLCByZXBvVHlwZTogJ2dpdGh1YicgfSxcblx0XHRcdGFkb0h0dHBzOiB7IHJlbW90ZVVybDogJ2h0dHBzOi8vZGV2LmF6dXJlLmNvbS9PcmcvUHJvamVjdC9fZ2l0L1JlcG8nLCByZXBvSWQ6ICdvcmcvcHJvamVjdC9yZXBvJywgcmVwb1R5cGU6ICdhZG8nIH0sXG5cdFx0XHRhZG9Tc2g6IHsgcmVtb3RlVXJsOiAnaHR0cHM6Ly9zc2guZGV2LmF6dXJlLmNvbS92My9PcmcvUHJvamVjdC9SZXBvJywgcmVwb0lkOiAnb3JnL3Byb2plY3QvcmVwbycsIHJlcG9UeXBlOiAnYWRvJyB9LFxuXHRcdFx0d3JvbmdFbnRlcnByaXNlOiB1bmRlZmluZWQsXG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2FwcGxpZXMgdGhlIGxlZ2FjeSBieXRlIGFuZCBtdWx0aXBsZXggY2hhcmFjdGVyIGxpbWl0cycsICgpID0+IHtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdGF0Q2hhcmFjdGVyTGltaXQ6IG1lYXN1cmVSZXBvSW5mb0RpZmZzSlNPTigneCcucmVwZWF0KDUwICogODE5MikpLnRvb0xhcmdlLFxuXHRcdFx0b3ZlckNoYXJhY3RlckxpbWl0OiBtZWFzdXJlUmVwb0luZm9EaWZmc0pTT04oJ3gnLnJlcGVhdCg1MCAqIDgxOTIgKyAxKSkudG9vTGFyZ2UsXG5cdFx0XHRvdmVyQnl0ZUxpbWl0OiBtZWFzdXJlUmVwb0luZm9EaWZmc0pTT04oJ1xcdTIwYWMnLnJlcGVhdCgzMDdfMjAxKSkudG9vTGFyZ2UsXG5cdFx0fSwge1xuXHRcdFx0YXRDaGFyYWN0ZXJMaW1pdDogZmFsc2UsXG5cdFx0XHRvdmVyQ2hhcmFjdGVyTGltaXQ6IHRydWUsXG5cdFx0XHRvdmVyQnl0ZUxpbWl0OiB0cnVlLFxuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdlbWl0cyBzdHJ1Y3R1cmVkIGJlZ2luIGFuZCBlbmQgc25hcHNob3RzIGFnYWluc3QgdGhlIGJyYW5jaCBiYXNlbGluZScsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCByb290ID0gVVJJLmZpbGUoJy9yZXBvJyk7XG5cdFx0Y29uc3Qgc25hcHNob3RzID0gWyd0cmVlLWJlZ2luJywgJ3RyZWUtYmVnaW4nLCAndHJlZS1lbmQnLCAndHJlZS1lbmQnXTtcblx0XHRjb25zdCBwYXRjaGVzOiBzdHJpbmdbXSA9IFtdO1xuXHRcdGNvbnN0IGZpbGVEaWZmOiBJU2Vzc2lvbkZpbGVEaWZmID0ge1xuXHRcdFx0YmVmb3JlOiB7IHVyaTogVVJJLmpvaW5QYXRoKHJvb3QsICdzcmMvYS50cycpLnRvU3RyaW5nKCksIGNvbnRlbnQ6IHsgdXJpOiAnZ2l0LWJsb2I6Ly9iZWZvcmUnIH0gfSxcblx0XHRcdGFmdGVyOiB7IHVyaTogVVJJLmpvaW5QYXRoKHJvb3QsICdzcmMvYS50cycpLnRvU3RyaW5nKCksIGNvbnRlbnQ6IHsgdXJpOiAnZ2l0LWJsb2I6Ly9hZnRlcicgfSB9LFxuXHRcdFx0ZGlmZjogeyBhZGRlZDogMSwgcmVtb3ZlZDogMSB9LFxuXHRcdH07XG5cdFx0Y29uc3QgZ2l0U2VydmljZTogSUFnZW50SG9zdEdpdFNlcnZpY2UgPSB7XG5cdFx0XHQuLi5jcmVhdGVOb29wR2l0U2VydmljZSgpLFxuXHRcdFx0Z2V0UmVwb3NpdG9yeVJvb3Q6IGFzeW5jICgpID0+IHJvb3QsXG5cdFx0XHRnZXRTZXNzaW9uR2l0U3RhdGU6IGFzeW5jICgpID0+ICh7IGJyYW5jaE5hbWU6ICdmZWF0dXJlJywgYmFzZUJyYW5jaE5hbWU6ICdtYWluJyB9KSxcblx0XHRcdGdldEZldGNoUmVtb3RlVXJsczogYXN5bmMgKCkgPT4gWydnaXRAZ2l0aHViLmNvbTptaWNyb3NvZnQvdnNjb2RlLmdpdCddLFxuXHRcdFx0cmVzb2x2ZUJyYW5jaEJhc2VsaW5lQ29tbWl0OiBhc3luYyAoKSA9PiAnYmFzZScsXG5cdFx0XHRnZXRCcmFuY2hEaWZmU2FmZXR5SW5mbzogYXN5bmMgKCkgPT4gKHsgaGFzVmlydHVhbEZpbGVTeXN0ZW06IGZhbHNlLCBiYXNlbGluZUNvbW1pdFRpbWVzdGFtcDogRGF0ZS5ub3coKSwgY29tbWl0Q291bnQ6IDEsIHdvcmtzcGFjZUZpbGVDb3VudDogNDIgfSksXG5cdFx0XHRjYXB0dXJlV29ya2luZ1RyZWVBc1RyZWU6IGFzeW5jICgpID0+IHNuYXBzaG90cy5zaGlmdCgpLFxuXHRcdFx0Y29tcHV0ZUZpbGVEaWZmc0JldHdlZW5SZWZzOiBhc3luYyAoKSA9PiBbZmlsZURpZmZdLFxuXHRcdFx0Z2V0RGlmZlBhdGNoQmV0d2VlblJlZnM6IGFzeW5jIChfd29ya2luZ0RpcmVjdG9yeSwgb3B0aW9ucykgPT4ge1xuXHRcdFx0XHRwYXRjaGVzLnB1c2gob3B0aW9ucy50b1JlZik7XG5cdFx0XHRcdHJldHVybiB7IHBhdGNoOiBgcGF0Y2gtJHtvcHRpb25zLnRvUmVmfWAsIHRvb0xhcmdlOiBmYWxzZSB9O1xuXHRcdFx0fSxcblx0XHR9O1xuXHRcdGNvbnN0IHJlcG9ydHM6IElBZ2VudEhvc3RSZXBvSW5mb1JlcG9ydFtdID0gW107XG5cdFx0Y29uc3QgY29sbGVjdG9yID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBBZ2VudEhvc3RSZXBvSW5mb1RlbGVtZXRyeSh7XG5cdFx0XHRyZXBvcnRSZXBvSW5mbzogYXN5bmMgKF9jb250ZXh0LCByZXBvcnQpID0+IHsgcmVwb3J0cy5wdXNoKHJlcG9ydCk7IH0sXG5cdFx0fSwgZ2l0U2VydmljZSwgY3JlYXRlVGVzdEdpdEh1YkVuZHBvaW50U2VydmljZSgpLCBuZXcgTnVsbExvZ1NlcnZpY2UoKSkpO1xuXG5cdFx0YXdhaXQgY29sbGVjdG9yLnJlcG9ydEJlZ2luKHJlc3RyaWN0ZWRDb250ZXh0LCAnYWdlbnQtc2Vzc2lvbjovL2NvcGlsb3QvczEnLCAndHVybi0xJywgQWdlbnRIb3N0Q2xpZW50VHlwZS5FZGl0b3JXaW5kb3csIHJvb3QsIHVuZGVmaW5lZCwgKCkgPT4gdHJ1ZSk7XG5cdFx0YXdhaXQgY29sbGVjdG9yLnJlcG9ydEVuZChyZXN0cmljdGVkQ29udGV4dCwgJ2FnZW50LXNlc3Npb246Ly9jb3BpbG90L3MxJywgJ3R1cm4tMScsIHJvb3QsIHVuZGVmaW5lZCwgKCkgPT4gdHJ1ZSk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdHBhdGNoZXMsXG5cdFx0XHRyZXBvcnRzOiByZXBvcnRzLm1hcChyZXBvcnQgPT4gKHtcblx0XHRcdFx0dGVsZW1ldHJ5TWVzc2FnZUlkOiByZXBvcnQudGVsZW1ldHJ5TWVzc2FnZUlkLFxuXHRcdFx0XHRjbGllbnRUeXBlOiByZXBvcnQuY2xpZW50VHlwZSxcblx0XHRcdFx0bG9jYXRpb246IHJlcG9ydC5sb2NhdGlvbixcblx0XHRcdFx0cmVzdWx0OiByZXBvcnQucmVzdWx0LFxuXHRcdFx0XHRyZW1vdGVVcmw6IHJlcG9ydC5yZW1vdGVVcmwsXG5cdFx0XHRcdHJlcG9JZDogcmVwb3J0LnJlcG9JZCxcblx0XHRcdFx0aGVhZENvbW1pdEhhc2g6IHJlcG9ydC5oZWFkQ29tbWl0SGFzaCxcblx0XHRcdFx0aGVhZEJyYW5jaE5hbWU6IHJlcG9ydC5oZWFkQnJhbmNoTmFtZSxcblx0XHRcdFx0ZmlsZVJlbGF0aXZlUGF0aHM6IHJlcG9ydC5maWxlUmVsYXRpdmVQYXRocyxcblx0XHRcdFx0ZGlmZnM6IHJlcG9ydC5kaWZmc0pTT04gPyBKU09OLnBhcnNlKHJlcG9ydC5kaWZmc0pTT04pIDogdW5kZWZpbmVkLFxuXHRcdFx0XHR3b3Jrc3BhY2VGaWxlQ291bnQ6IHJlcG9ydC53b3Jrc3BhY2VGaWxlQ291bnQsXG5cdFx0XHRcdGNoYW5nZWRGaWxlQ291bnQ6IHJlcG9ydC5jaGFuZ2VkRmlsZUNvdW50LFxuXHRcdFx0fSkpLFxuXHRcdH0sIHtcblx0XHRcdHBhdGNoZXM6IFsndHJlZS1iZWdpbicsICd0cmVlLWVuZCddLFxuXHRcdFx0cmVwb3J0czogW3tcblx0XHRcdFx0dGVsZW1ldHJ5TWVzc2FnZUlkOiAndHVybi0xJyxcblx0XHRcdFx0Y2xpZW50VHlwZTogQWdlbnRIb3N0Q2xpZW50VHlwZS5FZGl0b3JXaW5kb3csXG5cdFx0XHRcdGxvY2F0aW9uOiAnYmVnaW4nLFxuXHRcdFx0XHRyZXN1bHQ6ICdzdWNjZXNzJyxcblx0XHRcdFx0cmVtb3RlVXJsOiAnaHR0cHM6Ly9naXRodWIuY29tL21pY3Jvc29mdC92c2NvZGUuZ2l0Jyxcblx0XHRcdFx0cmVwb0lkOiAnbWljcm9zb2Z0L3ZzY29kZScsXG5cdFx0XHRcdGhlYWRDb21taXRIYXNoOiAnYmFzZScsXG5cdFx0XHRcdGhlYWRCcmFuY2hOYW1lOiAnZmVhdHVyZScsXG5cdFx0XHRcdGZpbGVSZWxhdGl2ZVBhdGhzOiBKU09OLnN0cmluZ2lmeShbJ3NyYy9hLnRzJ10pLFxuXHRcdFx0XHRkaWZmczogW3tcblx0XHRcdFx0XHR1cmk6IFVSSS5qb2luUGF0aChyb290LCAnc3JjL2EudHMnKS50b1N0cmluZygpLFxuXHRcdFx0XHRcdG9yaWdpbmFsVXJpOiBVUkkuam9pblBhdGgocm9vdCwgJ3NyYy9hLnRzJykudG9TdHJpbmcoKSxcblx0XHRcdFx0XHRzdGF0dXM6ICdNT0RJRklFRCcsXG5cdFx0XHRcdFx0ZGlmZjogJ3BhdGNoLXRyZWUtYmVnaW4nLFxuXHRcdFx0XHR9XSxcblx0XHRcdFx0d29ya3NwYWNlRmlsZUNvdW50OiA0Mixcblx0XHRcdFx0Y2hhbmdlZEZpbGVDb3VudDogMSxcblx0XHRcdH0sIHtcblx0XHRcdFx0dGVsZW1ldHJ5TWVzc2FnZUlkOiAndHVybi0xJyxcblx0XHRcdFx0Y2xpZW50VHlwZTogQWdlbnRIb3N0Q2xpZW50VHlwZS5FZGl0b3JXaW5kb3csXG5cdFx0XHRcdGxvY2F0aW9uOiAnZW5kJyxcblx0XHRcdFx0cmVzdWx0OiAnc3VjY2VzcycsXG5cdFx0XHRcdHJlbW90ZVVybDogJ2h0dHBzOi8vZ2l0aHViLmNvbS9taWNyb3NvZnQvdnNjb2RlLmdpdCcsXG5cdFx0XHRcdHJlcG9JZDogJ21pY3Jvc29mdC92c2NvZGUnLFxuXHRcdFx0XHRoZWFkQ29tbWl0SGFzaDogJ2Jhc2UnLFxuXHRcdFx0XHRoZWFkQnJhbmNoTmFtZTogJ2ZlYXR1cmUnLFxuXHRcdFx0XHRmaWxlUmVsYXRpdmVQYXRoczogSlNPTi5zdHJpbmdpZnkoWydzcmMvYS50cyddKSxcblx0XHRcdFx0ZGlmZnM6IFt7XG5cdFx0XHRcdFx0dXJpOiBVUkkuam9pblBhdGgocm9vdCwgJ3NyYy9hLnRzJykudG9TdHJpbmcoKSxcblx0XHRcdFx0XHRvcmlnaW5hbFVyaTogVVJJLmpvaW5QYXRoKHJvb3QsICdzcmMvYS50cycpLnRvU3RyaW5nKCksXG5cdFx0XHRcdFx0c3RhdHVzOiAnTU9ESUZJRUQnLFxuXHRcdFx0XHRcdGRpZmY6ICdwYXRjaC10cmVlLWVuZCcsXG5cdFx0XHRcdH1dLFxuXHRcdFx0XHR3b3Jrc3BhY2VGaWxlQ291bnQ6IDQyLFxuXHRcdFx0XHRjaGFuZ2VkRmlsZUNvdW50OiAxLFxuXHRcdFx0fV0sXG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3NraXBzIEdpdCBjb2xsZWN0aW9uIHdoZW4gcmVzdHJpY3RlZCB0ZWxlbWV0cnkgaXMgdW5hdmFpbGFibGUnLCBhc3luYyAoKSA9PiB7XG5cdFx0bGV0IGdpdENhbGxzID0gMDtcblx0XHRjb25zdCBnaXRTZXJ2aWNlOiBJQWdlbnRIb3N0R2l0U2VydmljZSA9IHtcblx0XHRcdC4uLmNyZWF0ZU5vb3BHaXRTZXJ2aWNlKCksXG5cdFx0XHRnZXRTZXNzaW9uR2l0U3RhdGU6IGFzeW5jICgpID0+IHsgZ2l0Q2FsbHMrKzsgcmV0dXJuIHVuZGVmaW5lZDsgfSxcblx0XHR9O1xuXHRcdGNvbnN0IGNvbGxlY3RvciA9IGRpc3Bvc2FibGVzLmFkZChuZXcgQWdlbnRIb3N0UmVwb0luZm9UZWxlbWV0cnkoeyByZXBvcnRSZXBvSW5mbzogYXN5bmMgKCkgPT4geyB9IH0sIGdpdFNlcnZpY2UsIGNyZWF0ZVRlc3RHaXRIdWJFbmRwb2ludFNlcnZpY2UoKSwgbmV3IE51bGxMb2dTZXJ2aWNlKCkpKTtcblxuXHRcdGF3YWl0IGNvbGxlY3Rvci5yZXBvcnRCZWdpbih7IC4uLnJlc3RyaWN0ZWRDb250ZXh0LCByZXN0cmljdGVkVGVsZW1ldHJ5RW5hYmxlZDogZmFsc2UsIGlzSW50ZXJuYWw6IGZhbHNlIH0sICdhZ2VudC1zZXNzaW9uOi8vY29waWxvdC9zMScsICd0dXJuLTEnLCBBZ2VudEhvc3RDbGllbnRUeXBlLlVua25vd24sIFVSSS5maWxlKCcvcmVwbycpLCB1bmRlZmluZWQsICgpID0+IHRydWUpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGdpdENhbGxzLCAwKTtcblx0fSk7XG5cblx0dGVzdCgnZG9lcyBub3QgZW1pdCBlbmQgYWZ0ZXIgYSBiZWdpbiByZXN1bHQgdGhhdCBsZWdhY3kgc3VwcHJlc3NlcycsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCByb290ID0gVVJJLmZpbGUoJy9yZXBvJyk7XG5cdFx0Y29uc3QgZmlsZURpZmZzOiBJU2Vzc2lvbkZpbGVEaWZmW10gPSBBcnJheS5mcm9tKHsgbGVuZ3RoOiAxMDEgfSwgKF8sIGluZGV4KSA9PiAoe1xuXHRcdFx0YWZ0ZXI6IHsgdXJpOiBVUkkuam9pblBhdGgocm9vdCwgYGZpbGUtJHtpbmRleH0udHh0YCkudG9TdHJpbmcoKSwgY29udGVudDogeyB1cmk6IGBnaXQtYmxvYjovL2FmdGVyLyR7aW5kZXh9YCB9IH0sXG5cdFx0XHRkaWZmOiB7IGFkZGVkOiAxLCByZW1vdmVkOiAwIH0sXG5cdFx0fSkpO1xuXHRcdGxldCBzbmFwc2hvdHMgPSAwO1xuXHRcdGNvbnN0IGdpdFNlcnZpY2U6IElBZ2VudEhvc3RHaXRTZXJ2aWNlID0ge1xuXHRcdFx0Li4uY3JlYXRlTm9vcEdpdFNlcnZpY2UoKSxcblx0XHRcdGdldFJlcG9zaXRvcnlSb290OiBhc3luYyAoKSA9PiByb290LFxuXHRcdFx0Z2V0U2Vzc2lvbkdpdFN0YXRlOiBhc3luYyAoKSA9PiAoeyBicmFuY2hOYW1lOiAnZmVhdHVyZScsIGJhc2VCcmFuY2hOYW1lOiAnbWFpbicgfSksXG5cdFx0XHRnZXRGZXRjaFJlbW90ZVVybHM6IGFzeW5jICgpID0+IFsnaHR0cHM6Ly9naXRodWIuY29tL21pY3Jvc29mdC92c2NvZGUnXSxcblx0XHRcdHJlc29sdmVCcmFuY2hCYXNlbGluZUNvbW1pdDogYXN5bmMgKCkgPT4gJ2Jhc2UnLFxuXHRcdFx0Z2V0QnJhbmNoRGlmZlNhZmV0eUluZm86IGFzeW5jICgpID0+ICh7IGhhc1ZpcnR1YWxGaWxlU3lzdGVtOiBmYWxzZSwgYmFzZWxpbmVDb21taXRUaW1lc3RhbXA6IERhdGUubm93KCksIGNvbW1pdENvdW50OiAxLCB3b3Jrc3BhY2VGaWxlQ291bnQ6IDQyIH0pLFxuXHRcdFx0Y2FwdHVyZVdvcmtpbmdUcmVlQXNUcmVlOiBhc3luYyAoKSA9PiB7IHNuYXBzaG90cysrOyByZXR1cm4gJ3RyZWUnOyB9LFxuXHRcdFx0Y29tcHV0ZUZpbGVEaWZmc0JldHdlZW5SZWZzOiBhc3luYyAoKSA9PiBmaWxlRGlmZnMsXG5cdFx0fTtcblx0XHRjb25zdCByZXBvcnRzOiBJQWdlbnRIb3N0UmVwb0luZm9SZXBvcnRbXSA9IFtdO1xuXHRcdGNvbnN0IGNvbGxlY3RvciA9IGRpc3Bvc2FibGVzLmFkZChuZXcgQWdlbnRIb3N0UmVwb0luZm9UZWxlbWV0cnkoeyByZXBvcnRSZXBvSW5mbzogYXN5bmMgKF9jb250ZXh0LCByZXBvcnQpID0+IHsgcmVwb3J0cy5wdXNoKHJlcG9ydCk7IH0gfSwgZ2l0U2VydmljZSwgY3JlYXRlVGVzdEdpdEh1YkVuZHBvaW50U2VydmljZSgpLCBuZXcgTnVsbExvZ1NlcnZpY2UoKSkpO1xuXG5cdFx0YXdhaXQgY29sbGVjdG9yLnJlcG9ydEJlZ2luKHJlc3RyaWN0ZWRDb250ZXh0LCAnYWdlbnQtc2Vzc2lvbjovL2NvcGlsb3QvczEnLCAndHVybi0xJywgQWdlbnRIb3N0Q2xpZW50VHlwZS5BZ2VudHNXaW5kb3csIHJvb3QsIHVuZGVmaW5lZCwgKCkgPT4gdHJ1ZSk7XG5cdFx0YXdhaXQgY29sbGVjdG9yLnJlcG9ydEVuZChyZXN0cmljdGVkQ29udGV4dCwgJ2FnZW50LXNlc3Npb246Ly9jb3BpbG90L3MxJywgJ3R1cm4tMScsIHJvb3QsIHVuZGVmaW5lZCwgKCkgPT4gdHJ1ZSk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHsgc25hcHNob3RzLCByZXN1bHRzOiByZXBvcnRzLm1hcChyZXBvcnQgPT4gcmVwb3J0LnJlc3VsdCkgfSwgeyBzbmFwc2hvdHM6IDEsIHJlc3VsdHM6IFsndG9vTWFueUNoYW5nZXMnXSB9KTtcblx0fSk7XG5cblx0dGVzdCgnZmFpbHMgY2xvc2VkIHdoZW4gY29udGVudCBleGNsdXNpb24gaXMgdW5hdmFpbGFibGUgb3Igbm8gY2hlY2tlciBpcyBwcm92aWRlZCcsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCByb290ID0gVVJJLmZpbGUoJy9yZXBvJyk7XG5cdFx0bGV0IHBhdGNoQ2FsbHMgPSAwO1xuXHRcdGNvbnN0IGdpdFNlcnZpY2U6IElBZ2VudEhvc3RHaXRTZXJ2aWNlID0ge1xuXHRcdFx0Li4uY3JlYXRlTm9vcEdpdFNlcnZpY2UoKSxcblx0XHRcdGdldFJlcG9zaXRvcnlSb290OiBhc3luYyAoKSA9PiByb290LFxuXHRcdFx0Z2V0U2Vzc2lvbkdpdFN0YXRlOiBhc3luYyAoKSA9PiAoeyBicmFuY2hOYW1lOiAnZmVhdHVyZScsIGJhc2VCcmFuY2hOYW1lOiAnbWFpbicgfSksXG5cdFx0XHRnZXRGZXRjaFJlbW90ZVVybHM6IGFzeW5jICgpID0+IFsnaHR0cHM6Ly9naXRodWIuY29tL01pY3Jvc29mdC9WU0NvZGUnXSxcblx0XHRcdGdldFVudHJhY2tlZFBhdGhzOiBhc3luYyAoKSA9PiBbJ25ldy50eHQnXSxcblx0XHRcdHJlc29sdmVCcmFuY2hCYXNlbGluZUNvbW1pdDogYXN5bmMgKCkgPT4gJ2Jhc2UnLFxuXHRcdFx0Z2V0QnJhbmNoRGlmZlNhZmV0eUluZm86IGFzeW5jICgpID0+ICh7IGhhc1ZpcnR1YWxGaWxlU3lzdGVtOiBmYWxzZSwgYmFzZWxpbmVDb21taXRUaW1lc3RhbXA6IERhdGUubm93KCksIGNvbW1pdENvdW50OiAxLCB3b3Jrc3BhY2VGaWxlQ291bnQ6IDIgfSksXG5cdFx0XHRjYXB0dXJlV29ya2luZ1RyZWVBc1RyZWU6IGFzeW5jICgpID0+ICd0cmVlJyxcblx0XHRcdGNvbXB1dGVGaWxlRGlmZnNCZXR3ZWVuUmVmczogYXN5bmMgKCkgPT4gW3tcblx0XHRcdFx0YWZ0ZXI6IHsgdXJpOiBVUkkuam9pblBhdGgocm9vdCwgJ25ldy50eHQnKS50b1N0cmluZygpLCBjb250ZW50OiB7IHVyaTogJ2dpdC1ibG9iOi8vYWZ0ZXInIH0gfSxcblx0XHRcdFx0ZGlmZjogeyBhZGRlZDogMSwgcmVtb3ZlZDogMCB9LFxuXHRcdFx0fV0sXG5cdFx0XHRnZXREaWZmUGF0Y2hCZXR3ZWVuUmVmczogYXN5bmMgKCkgPT4geyBwYXRjaENhbGxzKys7IHJldHVybiB7IHBhdGNoOiAnc2VjcmV0JywgdG9vTGFyZ2U6IGZhbHNlIH07IH0sXG5cdFx0fTtcblx0XHRjb25zdCByZXBvcnRzOiBJQWdlbnRIb3N0UmVwb0luZm9SZXBvcnRbXSA9IFtdO1xuXHRcdGNvbnN0IGNvbGxlY3RvciA9IGRpc3Bvc2FibGVzLmFkZChuZXcgQWdlbnRIb3N0UmVwb0luZm9UZWxlbWV0cnkoeyByZXBvcnRSZXBvSW5mbzogYXN5bmMgKF9jb250ZXh0LCByZXBvcnQpID0+IHsgcmVwb3J0cy5wdXNoKHJlcG9ydCk7IH0gfSwgZ2l0U2VydmljZSwgY3JlYXRlVGVzdEdpdEh1YkVuZHBvaW50U2VydmljZSgpLCBuZXcgTnVsbExvZ1NlcnZpY2UoKSkpO1xuXG5cdFx0YXdhaXQgY29sbGVjdG9yLnJlcG9ydEJlZ2luKHsgLi4ucmVzdHJpY3RlZENvbnRleHQsIGNvcGlsb3RJZ25vcmVFbmFibGVkOiB0cnVlIH0sICdhZ2VudC1zZXNzaW9uOi8vY29waWxvdC9zMScsICd0dXJuLTAnLCBBZ2VudEhvc3RDbGllbnRUeXBlLlVua25vd24sIHJvb3QsIHVuZGVmaW5lZCwgKCkgPT4gdHJ1ZSwgYXN5bmMgKCkgPT4gKHsgYXZhaWxhYmxlOiBmYWxzZSwgY2hlY2tzOiBbXSB9KSk7XG5cdFx0YXdhaXQgY29sbGVjdG9yLnJlcG9ydEJlZ2luKHsgLi4ucmVzdHJpY3RlZENvbnRleHQsIGNvcGlsb3RJZ25vcmVFbmFibGVkOiB1bmRlZmluZWQgfSwgJ2FnZW50LXNlc3Npb246Ly9jb3BpbG90L3MxJywgJ3R1cm4tMScsIEFnZW50SG9zdENsaWVudFR5cGUuVW5rbm93biwgcm9vdCwgdW5kZWZpbmVkLCAoKSA9PiB0cnVlKTtcblx0XHRhd2FpdCBjb2xsZWN0b3IucmVwb3J0QmVnaW4oeyAuLi5yZXN0cmljdGVkQ29udGV4dCwgY29waWxvdElnbm9yZUVuYWJsZWQ6IHRydWUgfSwgJ2FnZW50LXNlc3Npb246Ly9jb3BpbG90L3MxJywgJ3R1cm4tMicsIEFnZW50SG9zdENsaWVudFR5cGUuVW5rbm93biwgcm9vdCwgdW5kZWZpbmVkLCAoKSA9PiB0cnVlLCBhc3luYyAoKSA9PiB7IHRocm93IG5ldyBFcnJvcigncG9saWN5IHVuYXZhaWxhYmxlJyk7IH0pO1xuXHRcdGF3YWl0IGNvbGxlY3Rvci5yZXBvcnRCZWdpbih7IC4uLnJlc3RyaWN0ZWRDb250ZXh0LCBjb3BpbG90SWdub3JlRW5hYmxlZDogdHJ1ZSB9LCAnYWdlbnQtc2Vzc2lvbjovL2NvcGlsb3QvczEnLCAndHVybi0zJywgQWdlbnRIb3N0Q2xpZW50VHlwZS5Vbmtub3duLCByb290LCB1bmRlZmluZWQsICgpID0+IHRydWUsIGFzeW5jICgpID0+ICh7IGF2YWlsYWJsZTogJ3llcycsIGNoZWNrczogW3sgcGF0aDogJy9yZXBvL25ldy50eHQnLCBleGNsdWRlZDogbnVsbCB9XSB9KSBhcyBuZXZlcik7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdHBhdGNoQ2FsbHMsXG5cdFx0XHRyZXBvcnRzOiByZXBvcnRzLm1hcChyZXBvcnQgPT4gKHtcblx0XHRcdFx0cmVwb0lkOiByZXBvcnQucmVwb0lkLFxuXHRcdFx0XHRmaWxlUmVsYXRpdmVQYXRoczogcmVwb3J0LmZpbGVSZWxhdGl2ZVBhdGhzLFxuXHRcdFx0XHRkaWZmc0pTT046IHJlcG9ydC5kaWZmc0pTT04sXG5cdFx0XHRcdHJlc3VsdDogcmVwb3J0LnJlc3VsdCxcblx0XHRcdH0pKSxcblx0XHR9LCB7XG5cdFx0XHRwYXRjaENhbGxzOiAwLFxuXHRcdFx0cmVwb3J0czogW3tcblx0XHRcdFx0cmVwb0lkOiAnbWljcm9zb2Z0L3ZzY29kZScsXG5cdFx0XHRcdGZpbGVSZWxhdGl2ZVBhdGhzOiBKU09OLnN0cmluZ2lmeShbXSksXG5cdFx0XHRcdGRpZmZzSlNPTjogdW5kZWZpbmVkLFxuXHRcdFx0XHRyZXN1bHQ6ICdzdWNjZXNzJyxcblx0XHRcdH0sIHtcblx0XHRcdFx0cmVwb0lkOiAnbWljcm9zb2Z0L3ZzY29kZScsXG5cdFx0XHRcdGZpbGVSZWxhdGl2ZVBhdGhzOiBKU09OLnN0cmluZ2lmeShbXSksXG5cdFx0XHRcdGRpZmZzSlNPTjogdW5kZWZpbmVkLFxuXHRcdFx0XHRyZXN1bHQ6ICdzdWNjZXNzJyxcblx0XHRcdH0sIHtcblx0XHRcdFx0cmVwb0lkOiAnbWljcm9zb2Z0L3ZzY29kZScsXG5cdFx0XHRcdGZpbGVSZWxhdGl2ZVBhdGhzOiBKU09OLnN0cmluZ2lmeShbXSksXG5cdFx0XHRcdGRpZmZzSlNPTjogdW5kZWZpbmVkLFxuXHRcdFx0XHRyZXN1bHQ6ICdzdWNjZXNzJyxcblx0XHRcdH0sIHtcblx0XHRcdFx0cmVwb0lkOiAnbWljcm9zb2Z0L3ZzY29kZScsXG5cdFx0XHRcdGZpbGVSZWxhdGl2ZVBhdGhzOiBKU09OLnN0cmluZ2lmeShbXSksXG5cdFx0XHRcdGRpZmZzSlNPTjogdW5kZWZpbmVkLFxuXHRcdFx0XHRyZXN1bHQ6ICdzdWNjZXNzJyxcblx0XHRcdH1dLFxuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdlbWl0cyBwYXRocyBhbmQgcGF0Y2hlcyBvbmx5IHdoZW4gZXZlcnkgcGF0aCBmb3IgYSBjaGFuZ2UgaXMgYWxsb3dlZCcsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCByb290ID0gVVJJLmZpbGUoJy9yZXBvJyk7XG5cdFx0Y29uc3QgYWxsb3dlZFVyaSA9IFVSSS5qb2luUGF0aChyb290LCAnYWxsb3dlZC50eHQnKTtcblx0XHRjb25zdCBleGNsdWRlZE9sZFVyaSA9IFVSSS5qb2luUGF0aChyb290LCAnZXhjbHVkZWQtb2xkLnR4dCcpO1xuXHRcdGNvbnN0IGV4Y2x1ZGVkTmV3VXJpID0gVVJJLmpvaW5QYXRoKHJvb3QsICdleGNsdWRlZC1uZXcudHh0Jyk7XG5cdFx0Y29uc3QgY2hlY2tlZFBhdGhzOiBzdHJpbmdbXVtdID0gW107XG5cdFx0Y29uc3QgcGF0Y2hQYXRoczogc3RyaW5nW11bXSA9IFtdO1xuXHRcdGNvbnN0IHJlcG9ydHM6IElBZ2VudEhvc3RSZXBvSW5mb1JlcG9ydFtdID0gW107XG5cdFx0Y29uc3QgZ2l0U2VydmljZTogSUFnZW50SG9zdEdpdFNlcnZpY2UgPSB7XG5cdFx0XHQuLi5jcmVhdGVOb29wR2l0U2VydmljZSgpLFxuXHRcdFx0Z2V0UmVwb3NpdG9yeVJvb3Q6IGFzeW5jICgpID0+IHJvb3QsXG5cdFx0XHRnZXRTZXNzaW9uR2l0U3RhdGU6IGFzeW5jICgpID0+ICh7IGJyYW5jaE5hbWU6ICdmZWF0dXJlJywgYmFzZUJyYW5jaE5hbWU6ICdtYWluJyB9KSxcblx0XHRcdGdldEZldGNoUmVtb3RlVXJsczogYXN5bmMgKCkgPT4gWydodHRwczovL2dpdGh1Yi5jb20vbWljcm9zb2Z0L3ZzY29kZSddLFxuXHRcdFx0cmVzb2x2ZUJyYW5jaEJhc2VsaW5lQ29tbWl0OiBhc3luYyAoKSA9PiAnYmFzZScsXG5cdFx0XHRnZXRCcmFuY2hEaWZmU2FmZXR5SW5mbzogYXN5bmMgKCkgPT4gKHsgaGFzVmlydHVhbEZpbGVTeXN0ZW06IGZhbHNlLCBiYXNlbGluZUNvbW1pdFRpbWVzdGFtcDogRGF0ZS5ub3coKSwgY29tbWl0Q291bnQ6IDEsIHdvcmtzcGFjZUZpbGVDb3VudDogMiB9KSxcblx0XHRcdGNhcHR1cmVXb3JraW5nVHJlZUFzVHJlZTogYXN5bmMgKCkgPT4gJ3RyZWUnLFxuXHRcdFx0Y29tcHV0ZUZpbGVEaWZmc0JldHdlZW5SZWZzOiBhc3luYyAoKSA9PiBbe1xuXHRcdFx0XHRiZWZvcmU6IHsgdXJpOiBhbGxvd2VkVXJpLnRvU3RyaW5nKCksIGNvbnRlbnQ6IHsgdXJpOiAnZ2l0LWJsb2I6Ly9hbGxvd2VkLWJlZm9yZScgfSB9LFxuXHRcdFx0XHRhZnRlcjogeyB1cmk6IGFsbG93ZWRVcmkudG9TdHJpbmcoKSwgY29udGVudDogeyB1cmk6ICdnaXQtYmxvYjovL2FsbG93ZWQtYWZ0ZXInIH0gfSxcblx0XHRcdFx0ZGlmZjogeyBhZGRlZDogMSwgcmVtb3ZlZDogMSB9LFxuXHRcdFx0fSwge1xuXHRcdFx0XHRiZWZvcmU6IHsgdXJpOiBleGNsdWRlZE9sZFVyaS50b1N0cmluZygpLCBjb250ZW50OiB7IHVyaTogJ2dpdC1ibG9iOi8vZXhjbHVkZWQtYmVmb3JlJyB9IH0sXG5cdFx0XHRcdGFmdGVyOiB7IHVyaTogZXhjbHVkZWROZXdVcmkudG9TdHJpbmcoKSwgY29udGVudDogeyB1cmk6ICdnaXQtYmxvYjovL2V4Y2x1ZGVkLWFmdGVyJyB9IH0sXG5cdFx0XHRcdGRpZmY6IHsgYWRkZWQ6IDEsIHJlbW92ZWQ6IDEgfSxcblx0XHRcdH1dLFxuXHRcdFx0Z2V0RGlmZlBhdGNoQmV0d2VlblJlZnM6IGFzeW5jIChfY3dkLCBvcHRpb25zKSA9PiB7XG5cdFx0XHRcdHBhdGNoUGF0aHMucHVzaChbLi4ub3B0aW9ucy5wYXRoc10pO1xuXHRcdFx0XHRyZXR1cm4geyBwYXRjaDogJ2FsbG93ZWQtcGF0Y2gnLCB0b29MYXJnZTogZmFsc2UgfTtcblx0XHRcdH0sXG5cdFx0fTtcblx0XHRjb25zdCBjb2xsZWN0b3IgPSBkaXNwb3NhYmxlcy5hZGQobmV3IEFnZW50SG9zdFJlcG9JbmZvVGVsZW1ldHJ5KHsgcmVwb3J0UmVwb0luZm86IGFzeW5jIChfY29udGV4dCwgcmVwb3J0KSA9PiB7IHJlcG9ydHMucHVzaChyZXBvcnQpOyB9IH0sIGdpdFNlcnZpY2UsIGNyZWF0ZVRlc3RHaXRIdWJFbmRwb2ludFNlcnZpY2UoKSwgbmV3IE51bGxMb2dTZXJ2aWNlKCkpKTtcblxuXHRcdGF3YWl0IGNvbGxlY3Rvci5yZXBvcnRCZWdpbih7IC4uLnJlc3RyaWN0ZWRDb250ZXh0LCBjb3BpbG90SWdub3JlRW5hYmxlZDogdHJ1ZSB9LCAnYWdlbnQtc2Vzc2lvbjovL2NvcGlsb3QvczEnLCAndHVybi0xJywgQWdlbnRIb3N0Q2xpZW50VHlwZS5FZGl0b3JXaW5kb3csIHJvb3QsIHVuZGVmaW5lZCwgKCkgPT4gdHJ1ZSwgYXN5bmMgcGF0aHMgPT4ge1xuXHRcdFx0Y2hlY2tlZFBhdGhzLnB1c2goWy4uLnBhdGhzXSk7XG5cdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRhdmFpbGFibGU6IHRydWUsXG5cdFx0XHRcdGNoZWNrczogcGF0aHMubWFwKHBhdGggPT4gKHsgcGF0aCwgZXhjbHVkZWQ6IHBhdGggPT09IGV4Y2x1ZGVkT2xkVXJpLmZzUGF0aCB9KSksXG5cdFx0XHR9O1xuXHRcdH0pO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRjaGVja2VkUGF0aHMsXG5cdFx0XHRwYXRjaFBhdGhzLFxuXHRcdFx0ZmlsZVJlbGF0aXZlUGF0aHM6IHJlcG9ydHNbMF0uZmlsZVJlbGF0aXZlUGF0aHMsXG5cdFx0XHRkaWZmczogSlNPTi5wYXJzZShyZXBvcnRzWzBdLmRpZmZzSlNPTiA/PyAnW10nKS5tYXAoKGRpZmY6IHsgdXJpOiBzdHJpbmc7IGRpZmY6IHN0cmluZyB9KSA9PiAoeyB1cmk6IGRpZmYudXJpLCBkaWZmOiBkaWZmLmRpZmYgfSkpLFxuXHRcdH0sIHtcblx0XHRcdGNoZWNrZWRQYXRoczogW1thbGxvd2VkVXJpLmZzUGF0aCwgZXhjbHVkZWRPbGRVcmkuZnNQYXRoLCBleGNsdWRlZE5ld1VyaS5mc1BhdGhdXSxcblx0XHRcdHBhdGNoUGF0aHM6IFtbJ2FsbG93ZWQudHh0J11dLFxuXHRcdFx0ZmlsZVJlbGF0aXZlUGF0aHM6IEpTT04uc3RyaW5naWZ5KFsnYWxsb3dlZC50eHQnXSksXG5cdFx0XHRkaWZmczogW3sgdXJpOiBhbGxvd2VkVXJpLnRvU3RyaW5nKCksIGRpZmY6ICdhbGxvd2VkLXBhdGNoJyB9XSxcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgncmVwb3J0cyBmaWxlc0NoYW5nZWQgd2hlbiB0aGUgd29ya2luZyB0cmVlIGNoYW5nZXMgZHVyaW5nIGNvbGxlY3Rpb24nLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3Qgcm9vdCA9IFVSSS5maWxlKCcvcmVwbycpO1xuXHRcdGNvbnN0IHRyZWVzID0gWyd0cmVlLWJlZm9yZScsICd0cmVlLWFmdGVyJ107XG5cdFx0Y29uc3QgcmVwb3J0czogSUFnZW50SG9zdFJlcG9JbmZvUmVwb3J0W10gPSBbXTtcblx0XHRjb25zdCBnaXRTZXJ2aWNlOiBJQWdlbnRIb3N0R2l0U2VydmljZSA9IHtcblx0XHRcdC4uLmNyZWF0ZU5vb3BHaXRTZXJ2aWNlKCksXG5cdFx0XHRnZXRSZXBvc2l0b3J5Um9vdDogYXN5bmMgKCkgPT4gcm9vdCxcblx0XHRcdGdldFNlc3Npb25HaXRTdGF0ZTogYXN5bmMgKCkgPT4gKHsgYnJhbmNoTmFtZTogJ2ZlYXR1cmUnLCBiYXNlQnJhbmNoTmFtZTogJ21haW4nIH0pLFxuXHRcdFx0Z2V0RmV0Y2hSZW1vdGVVcmxzOiBhc3luYyAoKSA9PiBbJ2h0dHBzOi8vZ2l0aHViLmNvbS9taWNyb3NvZnQvdnNjb2RlJ10sXG5cdFx0XHRyZXNvbHZlQnJhbmNoQmFzZWxpbmVDb21taXQ6IGFzeW5jICgpID0+ICdiYXNlJyxcblx0XHRcdGdldEJyYW5jaERpZmZTYWZldHlJbmZvOiBhc3luYyAoKSA9PiAoeyBoYXNWaXJ0dWFsRmlsZVN5c3RlbTogZmFsc2UsIGJhc2VsaW5lQ29tbWl0VGltZXN0YW1wOiBEYXRlLm5vdygpLCBjb21taXRDb3VudDogMSwgd29ya3NwYWNlRmlsZUNvdW50OiAxIH0pLFxuXHRcdFx0Y2FwdHVyZVdvcmtpbmdUcmVlQXNUcmVlOiBhc3luYyAoKSA9PiB0cmVlcy5zaGlmdCgpLFxuXHRcdFx0Y29tcHV0ZUZpbGVEaWZmc0JldHdlZW5SZWZzOiBhc3luYyAoKSA9PiBbe1xuXHRcdFx0XHRiZWZvcmU6IHsgdXJpOiBVUkkuam9pblBhdGgocm9vdCwgJ2EudHh0JykudG9TdHJpbmcoKSwgY29udGVudDogeyB1cmk6ICdnaXQtYmxvYjovL2JlZm9yZScgfSB9LFxuXHRcdFx0XHRhZnRlcjogeyB1cmk6IFVSSS5qb2luUGF0aChyb290LCAnYS50eHQnKS50b1N0cmluZygpLCBjb250ZW50OiB7IHVyaTogJ2dpdC1ibG9iOi8vYWZ0ZXInIH0gfSxcblx0XHRcdFx0ZGlmZjogeyBhZGRlZDogMSwgcmVtb3ZlZDogMSB9LFxuXHRcdFx0fV0sXG5cdFx0XHRnZXREaWZmUGF0Y2hCZXR3ZWVuUmVmczogYXN5bmMgKCkgPT4gKHsgcGF0Y2g6ICctYmVmb3JlXFxuK2FmdGVyJywgdG9vTGFyZ2U6IGZhbHNlIH0pLFxuXHRcdH07XG5cdFx0Y29uc3QgY29sbGVjdG9yID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBBZ2VudEhvc3RSZXBvSW5mb1RlbGVtZXRyeSh7IHJlcG9ydFJlcG9JbmZvOiBhc3luYyAoX2NvbnRleHQsIHJlcG9ydCkgPT4geyByZXBvcnRzLnB1c2gocmVwb3J0KTsgfSB9LCBnaXRTZXJ2aWNlLCBjcmVhdGVUZXN0R2l0SHViRW5kcG9pbnRTZXJ2aWNlKCksIG5ldyBOdWxsTG9nU2VydmljZSgpKSk7XG5cblx0XHRhd2FpdCBjb2xsZWN0b3IucmVwb3J0QmVnaW4ocmVzdHJpY3RlZENvbnRleHQsICdhZ2VudC1zZXNzaW9uOi8vY29waWxvdC9zMScsICd0dXJuLTEnLCBBZ2VudEhvc3RDbGllbnRUeXBlLkVkaXRvcldpbmRvdywgcm9vdCwgdW5kZWZpbmVkLCAoKSA9PiB0cnVlKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocmVwb3J0cy5tYXAocmVwb3J0ID0+ICh7IHJlc3VsdDogcmVwb3J0LnJlc3VsdCwgZGlmZnNKU09OOiByZXBvcnQuZGlmZnNKU09OLCBmaWxlUmVsYXRpdmVQYXRoczogcmVwb3J0LmZpbGVSZWxhdGl2ZVBhdGhzIH0pKSwgW3tcblx0XHRcdHJlc3VsdDogJ2ZpbGVzQ2hhbmdlZCcsXG5cdFx0XHRkaWZmc0pTT046IHVuZGVmaW5lZCxcblx0XHRcdGZpbGVSZWxhdGl2ZVBhdGhzOiB1bmRlZmluZWQsXG5cdFx0fV0pO1xuXHR9KTtcblxuXHR0ZXN0KCdtYXJrcyB1bnRyYWNrZWQgZmlsZXMgYW5kIHRydW5jYXRlcyBlYWNoIGRpZmYgYXQgdGhlIGxlZ2FjeSBsaW1pdCcsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCByb290ID0gVVJJLmZpbGUoJy9yZXBvJyk7XG5cdFx0Y29uc3QgcmVwb3J0czogSUFnZW50SG9zdFJlcG9JbmZvUmVwb3J0W10gPSBbXTtcblx0XHRjb25zdCBnaXRTZXJ2aWNlOiBJQWdlbnRIb3N0R2l0U2VydmljZSA9IHtcblx0XHRcdC4uLmNyZWF0ZU5vb3BHaXRTZXJ2aWNlKCksXG5cdFx0XHRnZXRSZXBvc2l0b3J5Um9vdDogYXN5bmMgKCkgPT4gcm9vdCxcblx0XHRcdGdldFNlc3Npb25HaXRTdGF0ZTogYXN5bmMgKCkgPT4gKHsgYnJhbmNoTmFtZTogJ2ZlYXR1cmUnLCBiYXNlQnJhbmNoTmFtZTogJ21haW4nIH0pLFxuXHRcdFx0Z2V0RmV0Y2hSZW1vdGVVcmxzOiBhc3luYyAoKSA9PiBbJ2h0dHBzOi8vZ2l0aHViLmNvbS9taWNyb3NvZnQvdnNjb2RlJ10sXG5cdFx0XHRnZXRVbnRyYWNrZWRQYXRoczogYXN5bmMgKCkgPT4gWyduZXcudHh0J10sXG5cdFx0XHRyZXNvbHZlQnJhbmNoQmFzZWxpbmVDb21taXQ6IGFzeW5jICgpID0+ICdiYXNlJyxcblx0XHRcdGdldEJyYW5jaERpZmZTYWZldHlJbmZvOiBhc3luYyAoKSA9PiAoeyBoYXNWaXJ0dWFsRmlsZVN5c3RlbTogZmFsc2UsIGJhc2VsaW5lQ29tbWl0VGltZXN0YW1wOiBEYXRlLm5vdygpLCBjb21taXRDb3VudDogMSwgd29ya3NwYWNlRmlsZUNvdW50OiAxIH0pLFxuXHRcdFx0Y2FwdHVyZVdvcmtpbmdUcmVlQXNUcmVlOiBhc3luYyAoKSA9PiAndHJlZScsXG5cdFx0XHRjb21wdXRlRmlsZURpZmZzQmV0d2VlblJlZnM6IGFzeW5jICgpID0+IFt7XG5cdFx0XHRcdGFmdGVyOiB7IHVyaTogVVJJLmpvaW5QYXRoKHJvb3QsICduZXcudHh0JykudG9TdHJpbmcoKSwgY29udGVudDogeyB1cmk6ICdnaXQtYmxvYjovL2FmdGVyJyB9IH0sXG5cdFx0XHRcdGRpZmY6IHsgYWRkZWQ6IDEsIHJlbW92ZWQ6IDAgfSxcblx0XHRcdH1dLFxuXHRcdFx0Z2V0RGlmZlBhdGNoQmV0d2VlblJlZnM6IGFzeW5jICgpID0+ICh7IHBhdGNoOiAneCcucmVwZWF0KDEwMF8wMDEpLCB0b29MYXJnZTogZmFsc2UgfSksXG5cdFx0fTtcblx0XHRjb25zdCBjb2xsZWN0b3IgPSBkaXNwb3NhYmxlcy5hZGQobmV3IEFnZW50SG9zdFJlcG9JbmZvVGVsZW1ldHJ5KHsgcmVwb3J0UmVwb0luZm86IGFzeW5jIChfY29udGV4dCwgcmVwb3J0KSA9PiB7IHJlcG9ydHMucHVzaChyZXBvcnQpOyB9IH0sIGdpdFNlcnZpY2UsIGNyZWF0ZVRlc3RHaXRIdWJFbmRwb2ludFNlcnZpY2UoKSwgbmV3IE51bGxMb2dTZXJ2aWNlKCkpKTtcblxuXHRcdGF3YWl0IGNvbGxlY3Rvci5yZXBvcnRCZWdpbihyZXN0cmljdGVkQ29udGV4dCwgJ2FnZW50LXNlc3Npb246Ly9jb3BpbG90L3MxJywgJ3R1cm4tMScsIEFnZW50SG9zdENsaWVudFR5cGUuRWRpdG9yV2luZG93LCByb290LCB1bmRlZmluZWQsICgpID0+IHRydWUpO1xuXG5cdFx0Y29uc3QgZGlmZnMgPSBKU09OLnBhcnNlKHJlcG9ydHNbMF0uZGlmZnNKU09OID8/ICdbXScpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0c3RhdHVzOiBkaWZmc1swXT8uc3RhdHVzLFxuXHRcdFx0ZGlmZkxlbmd0aDogZGlmZnNbMF0/LmRpZmYubGVuZ3RoLFxuXHRcdFx0dHJ1bmNhdGVkOiBkaWZmc1swXT8uZGlmZi5lbmRzV2l0aChgLi4uIERpZmYgdHJ1bmNhdGVkIChleGNlZWRlZCAxMDAwMDAgY2hhcmFjdGVycykgZm9yICR7VVJJLmpvaW5QYXRoKHJvb3QsICduZXcudHh0JykudG9TdHJpbmcoKX1gKSxcblx0XHR9LCB7XG5cdFx0XHRzdGF0dXM6ICdVTlRSQUNLRUQnLFxuXHRcdFx0ZGlmZkxlbmd0aDogMTAwXzAwMSArIGAuLi4gRGlmZiB0cnVuY2F0ZWQgKGV4Y2VlZGVkIDEwMDAwMCBjaGFyYWN0ZXJzKSBmb3IgJHtVUkkuam9pblBhdGgocm9vdCwgJ25ldy50eHQnKS50b1N0cmluZygpfWAubGVuZ3RoLFxuXHRcdFx0dHJ1bmNhdGVkOiB0cnVlLFxuXHRcdH0pO1xuXHR9KTtcbn0pO1xuIl0sCiAgIm1hcHBpbmdzIjogIkFBS0EsT0FBTyxZQUFZO0FBQ25CLFNBQVMsV0FBVztBQUNwQixTQUFTLCtDQUErQztBQUN4RCxTQUFTLHNCQUFzQjtBQUMvQixTQUFTLDJCQUEyQjtBQUdwQyxTQUFTLDRCQUE0QiwwQkFBMEIsNkJBQTZCO0FBRTVGLFNBQVMsNEJBQTRCO0FBQ3JDLFNBQVMsdUNBQXVDO0FBRWhELE1BQU0sb0JBQW9CO0FBQUEsRUFDekIsNEJBQTRCO0FBQUEsRUFDNUIsWUFBWTtBQUFBLEVBQ1osbUJBQW1CO0FBQUEsRUFDbkIsWUFB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
