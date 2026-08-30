import assert from "assert";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../base/test/common/utils.js";
import { formatGitError, getRemoteTrackingRef, GitCheckoutProgressParser, isRetryableWorktreeRemovalError, parseChangedPaths, parseDefaultBranchRef, parseFetchRemoteUrls, parseGitDiffRawNumstat, parseGitHubRepoFromRemote, parseGitStatusV2, parseHasGitHubRemote, parseSingleLsTreeEntry, parseUntrackedPaths, summarizeStderrForError } from "../../node/agentHostGitService.js";
import { buildGitBlobUri } from "../../node/gitDiffContent.js";
import { URI } from "../../../../base/common/uri.js";
import { EMPTY_TREE_OBJECT, getBranchCompletions, resolveDiffBaseBranchName } from "../../common/agentHostGitService.js";
suite("AgentHostGitService", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  test("maps branches and GitHub pull request refs to origin tracking refs", () => {
    assert.deepStrictEqual({
      branch: getRemoteTrackingRef("feature"),
      pullRequest: getRemoteTrackingRef("refs/pull/42/head")
    }, {
      branch: {
        branchName: "feature",
        remoteBranch: "origin/feature",
        remoteRef: "refs/remotes/origin/feature",
        sourceRef: "refs/heads/feature"
      },
      pullRequest: {
        branchName: "pull/42/head",
        remoteBranch: "origin/pull/42/head",
        remoteRef: "refs/remotes/origin/pull/42/head",
        sourceRef: "refs/pull/42/head"
      }
    });
  });
  test("sorts the current and default branches before recent branches and applying the limit", () => {
    assert.deepStrictEqual(
      getBranchCompletions(
        ["feature/recent", "dev", "feature/current", "main", "feature/older"],
        { currentBranch: "feature/current", defaultBranch: "dev", limit: 3 }
      ),
      ["feature/current", "dev", "feature/recent"]
    );
  });
  test("preserves git order for branches other than the current and default branches", () => {
    assert.deepStrictEqual(
      getBranchCompletions(
        ["feature/recent", "release", "feature/older"],
        { currentBranch: "other", defaultBranch: "main" }
      ),
      ["feature/recent", "release", "feature/older"]
    );
  });
  test("filters before prioritizing the current and default branches", () => {
    assert.deepStrictEqual(
      getBranchCompletions(
        ["feature/recent", "maintenance", "main", "feature/current"],
        { currentBranch: "feature/current", defaultBranch: "maintenance", query: "ma" }
      ),
      ["maintenance", "main"]
    );
  });
  suite("GitCheckoutProgressParser", () => {
    function collect(chunks) {
      const reported = [];
      const parser = new GitCheckoutProgressParser((progress) => reported.push(progress));
      for (const chunk of chunks) {
        parser.push(chunk);
      }
      return reported;
    }
    test("forwards every complete sample and ignores non-progress output", () => {
      assert.deepStrictEqual(collect([
        "Preparing worktree (new branch agents/foo)\n",
        "Updating files:   1% (8/800)\rUpdating files:   2% (16/800)\r",
        "Updating files:   2% (20/800)\r",
        "Updating files: 100% (800/800), done.\n"
      ]), [
        { filesDone: 8, filesTotal: 800 },
        { filesDone: 16, filesTotal: 800 },
        { filesDone: 20, filesTotal: 800 },
        { filesDone: 800, filesTotal: 800 }
      ]);
    });
    test("holds back a sample split across chunk boundaries until it completes", () => {
      assert.deepStrictEqual(collect(["Updating files:  42% (33", "6/800)\r"]), [
        { filesDone: 336, filesTotal: 800 }
      ]);
    });
  });
  suite("parseGitStatusV2", () => {
    test("parses a clean checkout with upstream", () => {
      const out = [
        "# branch.oid 0123456789abcdef0123456789abcdef01234567",
        "# branch.head main",
        "# branch.upstream origin/main",
        "# branch.ab +0 -0"
      ].join("\n");
      assert.deepStrictEqual(parseGitStatusV2(out), {
        branchName: "main",
        upstreamBranchName: "origin/main",
        outgoingChanges: 0,
        incomingChanges: 0,
        uncommittedChanges: 0
      });
    });
    test("parses a dirty branch ahead and behind upstream", () => {
      const out = [
        "# branch.oid 0123456789abcdef0123456789abcdef01234567",
        "# branch.head feature",
        "# branch.upstream origin/feature",
        "# branch.ab +3 -2",
        "1 .M N... 100644 100644 100644 abc abc src/a.ts",
        "2 R. N... 100644 100644 100644 abc abc R100 src/b.ts	src/old-b.ts",
        "? src/untracked.ts"
      ].join("\n");
      assert.deepStrictEqual(parseGitStatusV2(out), {
        branchName: "feature",
        upstreamBranchName: "origin/feature",
        outgoingChanges: 3,
        incomingChanges: 2,
        uncommittedChanges: 3
      });
    });
    test("treats (detached) HEAD as no branch and omits upstream/ab when absent", () => {
      const out = [
        "# branch.oid 0123456789abcdef0123456789abcdef01234567",
        "# branch.head (detached)"
      ].join("\n");
      assert.deepStrictEqual(parseGitStatusV2(out), {
        branchName: void 0,
        upstreamBranchName: void 0,
        outgoingChanges: void 0,
        incomingChanges: void 0,
        uncommittedChanges: 0
      });
    });
    test("returns empty object for undefined input", () => {
      assert.deepStrictEqual(parseGitStatusV2(void 0), {});
    });
  });
  suite("parseHasGitHubRemote", () => {
    test("detects ssh github remote", () => {
      assert.strictEqual(parseHasGitHubRemote("origin	git@github.com:owner/repo.git (fetch)\n"), true);
    });
    test("detects https github remote", () => {
      assert.strictEqual(parseHasGitHubRemote("origin	https://github.com/owner/repo.git (fetch)\n"), true);
    });
    test("returns false for non-github remotes", () => {
      assert.strictEqual(parseHasGitHubRemote("origin	https://gitlab.com/owner/repo.git (fetch)\n"), false);
    });
    test("returns false when there are no remotes", () => {
      assert.strictEqual(parseHasGitHubRemote(""), false);
    });
    test("returns undefined when probe failed (output absent)", () => {
      assert.strictEqual(parseHasGitHubRemote(void 0), void 0);
    });
  });
  suite("parseDefaultBranchRef", () => {
    test("strips refs/remotes/origin/ prefix", () => {
      assert.strictEqual(parseDefaultBranchRef("refs/remotes/origin/main\n"), "main");
    });
    test("returns the ref as-is when prefix is not present", () => {
      assert.strictEqual(parseDefaultBranchRef("main"), "main");
    });
    test("returns undefined for empty/missing output", () => {
      assert.strictEqual(parseDefaultBranchRef(void 0), void 0);
      assert.strictEqual(parseDefaultBranchRef("   "), void 0);
    });
  });
  suite("parseGitHubRepoFromRemote", () => {
    test("parses only the requested fork remote", () => {
      const out = [
        "origin	git@github.com:base-owner/repo.git (fetch)",
        "fork	https://github.com/fork-owner/repo.git (fetch)"
      ].join("\n");
      assert.deepStrictEqual(parseGitHubRepoFromRemote(out, "fork"), { owner: "fork-owner", repo: "repo" });
    });
    test("does not fall back when the requested remote is not GitHub", () => {
      const out = [
        "origin	git@github.com:base-owner/repo.git (fetch)",
        "fork	https://gitlab.com/fork-owner/repo.git (fetch)"
      ].join("\n");
      assert.strictEqual(parseGitHubRepoFromRemote(out, "fork"), void 0);
    });
    test("parses ssh (scp-like) origin remote", () => {
      const out = "origin	git@github.com:microsoft/vscode.git (fetch)\norigin	git@github.com:microsoft/vscode.git (push)\n";
      assert.deepStrictEqual(parseGitHubRepoFromRemote(out), { owner: "microsoft", repo: "vscode" });
    });
    test("parses https origin remote without .git suffix", () => {
      const out = "origin	https://github.com/microsoft/vscode (fetch)\n";
      assert.deepStrictEqual(parseGitHubRepoFromRemote(out), { owner: "microsoft", repo: "vscode" });
    });
    test("parses ssh:// scheme remote", () => {
      const out = "origin	ssh://git@github.com/microsoft/vscode.git (fetch)\n";
      assert.deepStrictEqual(parseGitHubRepoFromRemote(out), { owner: "microsoft", repo: "vscode" });
    });
    test("prefers origin over other remotes", () => {
      const out = "fork	git@github.com:me/vscode.git (fetch)\norigin	git@github.com:microsoft/vscode.git (fetch)\n";
      assert.deepStrictEqual(parseGitHubRepoFromRemote(out), { owner: "microsoft", repo: "vscode" });
    });
    test("falls back to first github remote when origin is not github", () => {
      const out = "origin	git@gitlab.com:foo/bar.git (fetch)\nupstream	https://github.com/microsoft/vscode.git (fetch)\n";
      assert.deepStrictEqual(parseGitHubRepoFromRemote(out), { owner: "microsoft", repo: "vscode" });
    });
    test("returns undefined when no remotes are present", () => {
      assert.strictEqual(parseGitHubRepoFromRemote(""), void 0);
      assert.strictEqual(parseGitHubRepoFromRemote(void 0), void 0);
    });
    test("returns undefined when no GitHub remote is present", () => {
      const out = "origin	https://gitlab.com/foo/bar.git (fetch)\n";
      assert.strictEqual(parseGitHubRepoFromRemote(out), void 0);
    });
  });
  test("orders fetch remote URLs with origin first and excludes push URLs", () => {
    assert.deepStrictEqual(parseFetchRemoteUrls([
      "upstream	git@github.com:microsoft/vscode.git (fetch)",
      "origin	https://github.com/me/vscode.git (push)",
      "origin	https://github.com/me/vscode.git (fetch)"
    ].join("\n")), [
      "https://github.com/me/vscode.git",
      "git@github.com:microsoft/vscode.git"
    ]);
  });
  test("prefers the branch upstream remote before origin", () => {
    assert.deepStrictEqual(parseFetchRemoteUrls([
      "origin	https://github.com/me/vscode.git (fetch)",
      "upstream	https://github.com/microsoft/vscode.git (fetch)"
    ].join("\n"), "upstream"), [
      "https://github.com/microsoft/vscode.git",
      "https://github.com/me/vscode.git"
    ]);
  });
  suite("parseUntrackedPaths", () => {
    test("returns empty for empty/undefined output", () => {
      assert.deepStrictEqual(parseUntrackedPaths(void 0), []);
      assert.deepStrictEqual(parseUntrackedPaths(""), []);
    });
    test("extracts untracked entries and skips others", () => {
      const out = "?? new.txt\0 M edited.txt\0R  to.txt\0from.txt\0?? other.txt\0";
      assert.deepStrictEqual(parseUntrackedPaths(out), ["new.txt", "other.txt"]);
    });
  });
  suite("parseChangedPaths", () => {
    test("returns every changed path including delete and index rename/copy sources", () => {
      const out = [
        " M modified.txt",
        "A  added.txt",
        " D deleted.txt",
        "?? untracked.txt",
        "R  renamed-new.txt",
        "renamed-old.txt",
        " C copied-new.txt",
        "copied-old.txt",
        " M modified.txt",
        ""
      ].join("\0");
      assert.deepStrictEqual(parseChangedPaths(out), [
        "modified.txt",
        "added.txt",
        "deleted.txt",
        "untracked.txt",
        "renamed-new.txt",
        "renamed-old.txt",
        "copied-new.txt",
        "copied-old.txt"
      ]);
    });
    test("returns worktree rename/copy source paths too", () => {
      const out = [
        " R worktree-renamed-new.txt",
        "worktree-renamed-old.txt",
        " C worktree-copied-new.txt",
        "worktree-copied-old.txt",
        ""
      ].join("\0");
      assert.deepStrictEqual(parseChangedPaths(out), [
        "worktree-renamed-new.txt",
        "worktree-renamed-old.txt",
        "worktree-copied-new.txt",
        "worktree-copied-old.txt"
      ]);
    });
  });
  suite("parseGitDiffRawNumstat", () => {
    const root = URI.file("/repo");
    const sessionUri = "copilot:/abc";
    const sha = "cafe1234cafe1234cafe1234cafe1234cafe1234";
    test("parses an add, modify, delete and rename in a single stream", () => {
      const segments = [
        ":100644 100644 0000000 1111111 M",
        "modified.ts",
        ":000000 100644 0000000 2222222 A",
        "added.ts",
        ":100644 000000 3333333 0000000 D",
        "deleted.ts",
        ":100644 100644 4444444 5555555 R100",
        "old/path.ts",
        "new/path.ts",
        "5	2	modified.ts",
        "10	0	added.ts",
        "0	7	deleted.ts",
        "3	3	",
        "old/path.ts",
        "new/path.ts",
        ""
      ];
      const out = segments.join("\0");
      const diffs = parseGitDiffRawNumstat(out, root, sessionUri, sha);
      assert.deepStrictEqual(diffs, [
        {
          before: { uri: "file:///repo/modified.ts", content: { uri: buildGitBlobUri(sessionUri, sha, "modified.ts", "/repo/modified.ts") } },
          after: { uri: "file:///repo/modified.ts", content: { uri: "file:///repo/modified.ts" } },
          diff: { added: 5, removed: 2 }
        },
        {
          after: { uri: "file:///repo/added.ts", content: { uri: "file:///repo/added.ts" } },
          diff: { added: 10, removed: 0 }
        },
        {
          before: { uri: "file:///repo/deleted.ts", content: { uri: buildGitBlobUri(sessionUri, sha, "deleted.ts", "/repo/deleted.ts") } },
          diff: { added: 0, removed: 7 }
        },
        {
          before: { uri: "file:///repo/old/path.ts", content: { uri: buildGitBlobUri(sessionUri, sha, "old/path.ts", "/repo/old/path.ts") } },
          after: { uri: "file:///repo/new/path.ts", content: { uri: "file:///repo/new/path.ts" } },
          diff: { added: 3, removed: 3 }
        }
      ]);
    });
    test("treats `-` numstat values (binary) as zero", () => {
      const out = [":100644 100644 0 0 M", "image.png", "-	-	image.png", ""].join("\0");
      const diffs = parseGitDiffRawNumstat(out, root, sessionUri, sha);
      assert.strictEqual(diffs.length, 1);
      assert.deepStrictEqual(diffs[0].diff, { added: 0, removed: 0 });
    });
    test("returns empty for empty input", () => {
      assert.deepStrictEqual(parseGitDiffRawNumstat("", root, sessionUri, sha), []);
    });
    test("anchors after side to afterRef when provided (ref->ref diffs)", () => {
      const toSha = "beef5678beef5678beef5678beef5678beef5678";
      const segments = [
        ":100644 100644 0000000 1111111 M",
        "modified.ts",
        ":000000 100644 0000000 2222222 A",
        "added.ts",
        ":100644 000000 3333333 0000000 D",
        "deleted.ts",
        ":100644 100644 4444444 5555555 R100",
        "old/path.ts",
        "new/path.ts",
        "5	2	modified.ts",
        "10	0	added.ts",
        "0	7	deleted.ts",
        "3	3	",
        "old/path.ts",
        "new/path.ts",
        ""
      ];
      const diffs = parseGitDiffRawNumstat(segments.join("\0"), root, sessionUri, sha, toSha);
      assert.deepStrictEqual(diffs, [
        {
          before: { uri: "file:///repo/modified.ts", content: { uri: buildGitBlobUri(sessionUri, sha, "modified.ts", "/repo/modified.ts") } },
          after: { uri: "file:///repo/modified.ts", content: { uri: buildGitBlobUri(sessionUri, toSha, "modified.ts", "/repo/modified.ts") } },
          diff: { added: 5, removed: 2 }
        },
        {
          after: { uri: "file:///repo/added.ts", content: { uri: buildGitBlobUri(sessionUri, toSha, "added.ts", "/repo/added.ts") } },
          diff: { added: 10, removed: 0 }
        },
        {
          before: { uri: "file:///repo/deleted.ts", content: { uri: buildGitBlobUri(sessionUri, sha, "deleted.ts", "/repo/deleted.ts") } },
          diff: { added: 0, removed: 7 }
        },
        {
          before: { uri: "file:///repo/old/path.ts", content: { uri: buildGitBlobUri(sessionUri, sha, "old/path.ts", "/repo/old/path.ts") } },
          after: { uri: "file:///repo/new/path.ts", content: { uri: buildGitBlobUri(sessionUri, toSha, "new/path.ts", "/repo/new/path.ts") } },
          diff: { added: 3, removed: 3 }
        }
      ]);
    });
  });
  test("exports the well-known empty-tree object SHA", () => {
    assert.strictEqual(EMPTY_TREE_OBJECT, "4b825dc642cb6eb9a060e54bf8d69288fbee4904");
  });
  suite("formatGitError", () => {
    test("reports timeout when our timer fired and summarises progress-meter stderr", () => {
      const err = Object.assign(new Error("Command failed"), { killed: true, signal: "SIGTERM" });
      const progress = "Updating files:   0% (7/14834)\rUpdating files:   0% (149/14834)\r";
      assert.strictEqual(
        formatGitError(["worktree", "add", "-b", "x", "/tmp/y", "origin/main"], 3e4, true, err, progress),
        "git worktree timed out after 30000ms: Updating files:   0% (149/14834)"
      );
    });
    test("reports kill signal when killed but not by our timer", () => {
      const err = Object.assign(new Error("Command failed"), { killed: true, signal: "SIGTERM" });
      assert.strictEqual(
        formatGitError(["worktree", "add"], 3e4, false, err, ""),
        "git worktree killed by SIGTERM"
      );
    });
    test("reports numeric exit code when git failed normally", () => {
      const err = Object.assign(new Error("Command failed"), { code: 128 });
      assert.strictEqual(
        formatGitError(["worktree", "add", "/tmp/y", "missing-branch"], 3e4, false, err, "fatal: invalid reference: missing-branch\n"),
        "git worktree exited with code 128: fatal: invalid reference: missing-branch"
      );
    });
    test("keeps missing git-lfs error over the later generic fatal line", () => {
      const err = Object.assign(new Error("Command failed"), { code: 128 });
      const stderr = [
        "Preparing worktree (new branch 'agents/example')",
        "git-lfs filter-process: git-lfs: command not found",
        "fatal: the remote end hung up unexpectedly"
      ].join("\n");
      assert.strictEqual(
        formatGitError(["worktree", "add", "--no-track", "-b", "agents/example", "/tmp/worktree", "origin/main"], 6e4, false, err, stderr),
        "git worktree exited with code 128: git-lfs filter-process: git-lfs: command not found"
      );
    });
    test("falls back to error message when there is no signal or exit code", () => {
      const err = new Error("spawn git ENOENT");
      assert.strictEqual(
        formatGitError(["status"], 5e3, false, err, ""),
        "spawn git ENOENT"
      );
    });
  });
  suite("isRetryableWorktreeRemovalError", () => {
    test("retries transient lock / dir-not-empty races but not fatal removal errors", () => {
      assert.deepStrictEqual({
        dirNotEmpty: isRetryableWorktreeRemovalError(new Error(`git worktree exited with code 255: error: failed to delete '.git/worktrees/reply-exactly-materialized': Directory not empty`)),
        indexLock: isRetryableWorktreeRemovalError(new Error("git worktree exited with code 128: fatal: Unable to create '.git/worktrees/x/index.lock': File exists")),
        couldNotLock: isRetryableWorktreeRemovalError(new Error("git worktree exited with code 1: fatal: could not lock config file")),
        dirtyTree: isRetryableWorktreeRemovalError(new Error(`git worktree exited with code 1: fatal: 'wt' contains modified or untracked files, use --force to delete it`)),
        notAWorktree: isRetryableWorktreeRemovalError(new Error(`git worktree exited with code 128: fatal: 'wt' is not a working tree`)),
        nonError: isRetryableWorktreeRemovalError("boom")
      }, {
        dirNotEmpty: true,
        indexLock: true,
        couldNotLock: true,
        dirtyTree: false,
        notAWorktree: false,
        nonError: false
      });
    });
  });
  suite("summarizeStderrForError", () => {
    test("returns empty string for empty input", () => {
      assert.strictEqual(summarizeStderrForError(""), "");
    });
    test("returns empty string for whitespace-only input", () => {
      assert.strictEqual(summarizeStderrForError("  \r\n\r\n  "), "");
    });
    test("keeps the last non-empty line of a multi-line progress meter", () => {
      const progress = "Updating files:   0% (7/14834)\rUpdating files:   0% (149/14834)\r";
      assert.strictEqual(summarizeStderrForError(progress), "Updating files:   0% (149/14834)");
    });
    test("passes through a normal single-line message", () => {
      assert.strictEqual(summarizeStderrForError("fatal: invalid reference: x\n"), "fatal: invalid reference: x");
    });
    test("truncates very long lines with an ellipsis", () => {
      const long = `fatal: ${"a".repeat(500)}`;
      const result = summarizeStderrForError(long);
      assert.strictEqual(result.length, 200);
      assert.ok(result.endsWith("\u2026"), "expected trailing ellipsis");
    });
  });
  suite("resolveDiffBaseBranchName", () => {
    test("prefers the persisted base branch, then git state, then undefined", () => {
      assert.deepStrictEqual(
        [
          resolveDiffBaseBranchName("persisted", "gitState"),
          resolveDiffBaseBranchName(void 0, "gitState"),
          resolveDiffBaseBranchName("persisted", void 0),
          resolveDiffBaseBranchName("origin/main", void 0),
          resolveDiffBaseBranchName("refs/remotes/origin/release", void 0),
          resolveDiffBaseBranchName(void 0, void 0)
        ],
        ["persisted", "gitState", "persisted", "main", "release", void 0]
      );
    });
  });
  suite("parseSingleLsTreeEntry", () => {
    test("parses mode/oid and treats empty output as absent", () => {
      assert.deepStrictEqual(
        [
          parseSingleLsTreeEntry("100644 blob e69de29bb2d1d6434b8b29ae775ad8c2e48c5391	a.txt\0"),
          parseSingleLsTreeEntry("100755 blob abc123	dir/with space.txt\0"),
          parseSingleLsTreeEntry(""),
          parseSingleLsTreeEntry(void 0)
        ],
        [
          { mode: "100644", oid: "e69de29bb2d1d6434b8b29ae775ad8c2e48c5391" },
          { mode: "100755", oid: "abc123" },
          void 0,
          void 0
        ]
      );
    });
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxwbGF0Zm9ybVxcYWdlbnRIb3N0XFx0ZXN0XFxub2RlXFxhZ2VudEhvc3RHaXRTZXJ2aWNlLnRlc3QudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgYXNzZXJ0IGZyb20gJ2Fzc2VydCc7XG5pbXBvcnQgeyBlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL3Rlc3QvY29tbW9uL3V0aWxzLmpzJztcbmltcG9ydCB7IGZvcm1hdEdpdEVycm9yLCBnZXRSZW1vdGVUcmFja2luZ1JlZiwgR2l0Q2hlY2tvdXRQcm9ncmVzc1BhcnNlciwgaXNSZXRyeWFibGVXb3JrdHJlZVJlbW92YWxFcnJvciwgcGFyc2VDaGFuZ2VkUGF0aHMsIHBhcnNlRGVmYXVsdEJyYW5jaFJlZiwgcGFyc2VGZXRjaFJlbW90ZVVybHMsIHBhcnNlR2l0RGlmZlJhd051bXN0YXQsIHBhcnNlR2l0SHViUmVwb0Zyb21SZW1vdGUsIHBhcnNlR2l0U3RhdHVzVjIsIHBhcnNlSGFzR2l0SHViUmVtb3RlLCBwYXJzZVNpbmdsZUxzVHJlZUVudHJ5LCBwYXJzZVVudHJhY2tlZFBhdGhzLCBzdW1tYXJpemVTdGRlcnJGb3JFcnJvciB9IGZyb20gJy4uLy4uL25vZGUvYWdlbnRIb3N0R2l0U2VydmljZS5qcyc7XG5pbXBvcnQgeyBidWlsZEdpdEJsb2JVcmkgfSBmcm9tICcuLi8uLi9ub2RlL2dpdERpZmZDb250ZW50LmpzJztcbmltcG9ydCB7IFVSSSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3VyaS5qcyc7XG5pbXBvcnQgeyBFTVBUWV9UUkVFX09CSkVDVCwgZ2V0QnJhbmNoQ29tcGxldGlvbnMsIHJlc29sdmVEaWZmQmFzZUJyYW5jaE5hbWUgfSBmcm9tICcuLi8uLi9jb21tb24vYWdlbnRIb3N0R2l0U2VydmljZS5qcyc7XG5cbnN1aXRlKCdBZ2VudEhvc3RHaXRTZXJ2aWNlJywgKCkgPT4ge1xuXHRlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUoKTtcblxuXHR0ZXN0KCdtYXBzIGJyYW5jaGVzIGFuZCBHaXRIdWIgcHVsbCByZXF1ZXN0IHJlZnMgdG8gb3JpZ2luIHRyYWNraW5nIHJlZnMnLCAoKSA9PiB7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRicmFuY2g6IGdldFJlbW90ZVRyYWNraW5nUmVmKCdmZWF0dXJlJyksXG5cdFx0XHRwdWxsUmVxdWVzdDogZ2V0UmVtb3RlVHJhY2tpbmdSZWYoJ3JlZnMvcHVsbC80Mi9oZWFkJyksXG5cdFx0fSwge1xuXHRcdFx0YnJhbmNoOiB7XG5cdFx0XHRcdGJyYW5jaE5hbWU6ICdmZWF0dXJlJyxcblx0XHRcdFx0cmVtb3RlQnJhbmNoOiAnb3JpZ2luL2ZlYXR1cmUnLFxuXHRcdFx0XHRyZW1vdGVSZWY6ICdyZWZzL3JlbW90ZXMvb3JpZ2luL2ZlYXR1cmUnLFxuXHRcdFx0XHRzb3VyY2VSZWY6ICdyZWZzL2hlYWRzL2ZlYXR1cmUnLFxuXHRcdFx0fSxcblx0XHRcdHB1bGxSZXF1ZXN0OiB7XG5cdFx0XHRcdGJyYW5jaE5hbWU6ICdwdWxsLzQyL2hlYWQnLFxuXHRcdFx0XHRyZW1vdGVCcmFuY2g6ICdvcmlnaW4vcHVsbC80Mi9oZWFkJyxcblx0XHRcdFx0cmVtb3RlUmVmOiAncmVmcy9yZW1vdGVzL29yaWdpbi9wdWxsLzQyL2hlYWQnLFxuXHRcdFx0XHRzb3VyY2VSZWY6ICdyZWZzL3B1bGwvNDIvaGVhZCcsXG5cdFx0XHR9LFxuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdzb3J0cyB0aGUgY3VycmVudCBhbmQgZGVmYXVsdCBicmFuY2hlcyBiZWZvcmUgcmVjZW50IGJyYW5jaGVzIGFuZCBhcHBseWluZyB0aGUgbGltaXQnLCAoKSA9PiB7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChcblx0XHRcdGdldEJyYW5jaENvbXBsZXRpb25zKFxuXHRcdFx0XHRbJ2ZlYXR1cmUvcmVjZW50JywgJ2RldicsICdmZWF0dXJlL2N1cnJlbnQnLCAnbWFpbicsICdmZWF0dXJlL29sZGVyJ10sXG5cdFx0XHRcdHsgY3VycmVudEJyYW5jaDogJ2ZlYXR1cmUvY3VycmVudCcsIGRlZmF1bHRCcmFuY2g6ICdkZXYnLCBsaW1pdDogMyB9LFxuXHRcdFx0KSxcblx0XHRcdFsnZmVhdHVyZS9jdXJyZW50JywgJ2RldicsICdmZWF0dXJlL3JlY2VudCddLFxuXHRcdCk7XG5cdH0pO1xuXG5cdHRlc3QoJ3ByZXNlcnZlcyBnaXQgb3JkZXIgZm9yIGJyYW5jaGVzIG90aGVyIHRoYW4gdGhlIGN1cnJlbnQgYW5kIGRlZmF1bHQgYnJhbmNoZXMnLCAoKSA9PiB7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChcblx0XHRcdGdldEJyYW5jaENvbXBsZXRpb25zKFxuXHRcdFx0XHRbJ2ZlYXR1cmUvcmVjZW50JywgJ3JlbGVhc2UnLCAnZmVhdHVyZS9vbGRlciddLFxuXHRcdFx0XHR7IGN1cnJlbnRCcmFuY2g6ICdvdGhlcicsIGRlZmF1bHRCcmFuY2g6ICdtYWluJyB9LFxuXHRcdFx0KSxcblx0XHRcdFsnZmVhdHVyZS9yZWNlbnQnLCAncmVsZWFzZScsICdmZWF0dXJlL29sZGVyJ10sXG5cdFx0KTtcblx0fSk7XG5cblx0dGVzdCgnZmlsdGVycyBiZWZvcmUgcHJpb3JpdGl6aW5nIHRoZSBjdXJyZW50IGFuZCBkZWZhdWx0IGJyYW5jaGVzJywgKCkgPT4ge1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoXG5cdFx0XHRnZXRCcmFuY2hDb21wbGV0aW9ucyhcblx0XHRcdFx0WydmZWF0dXJlL3JlY2VudCcsICdtYWludGVuYW5jZScsICdtYWluJywgJ2ZlYXR1cmUvY3VycmVudCddLFxuXHRcdFx0XHR7IGN1cnJlbnRCcmFuY2g6ICdmZWF0dXJlL2N1cnJlbnQnLCBkZWZhdWx0QnJhbmNoOiAnbWFpbnRlbmFuY2UnLCBxdWVyeTogJ21hJyB9LFxuXHRcdFx0KSxcblx0XHRcdFsnbWFpbnRlbmFuY2UnLCAnbWFpbiddLFxuXHRcdCk7XG5cdH0pO1xuXG5cdHN1aXRlKCdHaXRDaGVja291dFByb2dyZXNzUGFyc2VyJywgKCkgPT4ge1xuXHRcdGZ1bmN0aW9uIGNvbGxlY3QoY2h1bmtzOiByZWFkb25seSBzdHJpbmdbXSk6IHsgZmlsZXNEb25lOiBudW1iZXI7IGZpbGVzVG90YWw6IG51bWJlciB9W10ge1xuXHRcdFx0Y29uc3QgcmVwb3J0ZWQ6IHsgZmlsZXNEb25lOiBudW1iZXI7IGZpbGVzVG90YWw6IG51bWJlciB9W10gPSBbXTtcblx0XHRcdGNvbnN0IHBhcnNlciA9IG5ldyBHaXRDaGVja291dFByb2dyZXNzUGFyc2VyKHByb2dyZXNzID0+IHJlcG9ydGVkLnB1c2gocHJvZ3Jlc3MpKTtcblx0XHRcdGZvciAoY29uc3QgY2h1bmsgb2YgY2h1bmtzKSB7XG5cdFx0XHRcdHBhcnNlci5wdXNoKGNodW5rKTtcblx0XHRcdH1cblx0XHRcdHJldHVybiByZXBvcnRlZDtcblx0XHR9XG5cblx0XHR0ZXN0KCdmb3J3YXJkcyBldmVyeSBjb21wbGV0ZSBzYW1wbGUgYW5kIGlnbm9yZXMgbm9uLXByb2dyZXNzIG91dHB1dCcsICgpID0+IHtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoY29sbGVjdChbXG5cdFx0XHRcdCdQcmVwYXJpbmcgd29ya3RyZWUgKG5ldyBicmFuY2ggYWdlbnRzL2ZvbylcXG4nLFxuXHRcdFx0XHQnVXBkYXRpbmcgZmlsZXM6ICAgMSUgKDgvODAwKVxcclVwZGF0aW5nIGZpbGVzOiAgIDIlICgxNi84MDApXFxyJyxcblx0XHRcdFx0J1VwZGF0aW5nIGZpbGVzOiAgIDIlICgyMC84MDApXFxyJyxcblx0XHRcdFx0J1VwZGF0aW5nIGZpbGVzOiAxMDAlICg4MDAvODAwKSwgZG9uZS5cXG4nLFxuXHRcdFx0XSksIFtcblx0XHRcdFx0eyBmaWxlc0RvbmU6IDgsIGZpbGVzVG90YWw6IDgwMCB9LFxuXHRcdFx0XHR7IGZpbGVzRG9uZTogMTYsIGZpbGVzVG90YWw6IDgwMCB9LFxuXHRcdFx0XHR7IGZpbGVzRG9uZTogMjAsIGZpbGVzVG90YWw6IDgwMCB9LFxuXHRcdFx0XHR7IGZpbGVzRG9uZTogODAwLCBmaWxlc1RvdGFsOiA4MDAgfSxcblx0XHRcdF0pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnaG9sZHMgYmFjayBhIHNhbXBsZSBzcGxpdCBhY3Jvc3MgY2h1bmsgYm91bmRhcmllcyB1bnRpbCBpdCBjb21wbGV0ZXMnLCAoKSA9PiB7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGNvbGxlY3QoWydVcGRhdGluZyBmaWxlczogIDQyJSAoMzMnLCAnNi84MDApXFxyJ10pLCBbXG5cdFx0XHRcdHsgZmlsZXNEb25lOiAzMzYsIGZpbGVzVG90YWw6IDgwMCB9LFxuXHRcdFx0XSk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHN1aXRlKCdwYXJzZUdpdFN0YXR1c1YyJywgKCkgPT4ge1xuXHRcdHRlc3QoJ3BhcnNlcyBhIGNsZWFuIGNoZWNrb3V0IHdpdGggdXBzdHJlYW0nLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBvdXQgPSBbXG5cdFx0XHRcdCcjIGJyYW5jaC5vaWQgMDEyMzQ1Njc4OWFiY2RlZjAxMjM0NTY3ODlhYmNkZWYwMTIzNDU2NycsXG5cdFx0XHRcdCcjIGJyYW5jaC5oZWFkIG1haW4nLFxuXHRcdFx0XHQnIyBicmFuY2gudXBzdHJlYW0gb3JpZ2luL21haW4nLFxuXHRcdFx0XHQnIyBicmFuY2guYWIgKzAgLTAnLFxuXHRcdFx0XS5qb2luKCdcXG4nKTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocGFyc2VHaXRTdGF0dXNWMihvdXQpLCB7XG5cdFx0XHRcdGJyYW5jaE5hbWU6ICdtYWluJyxcblx0XHRcdFx0dXBzdHJlYW1CcmFuY2hOYW1lOiAnb3JpZ2luL21haW4nLFxuXHRcdFx0XHRvdXRnb2luZ0NoYW5nZXM6IDAsXG5cdFx0XHRcdGluY29taW5nQ2hhbmdlczogMCxcblx0XHRcdFx0dW5jb21taXR0ZWRDaGFuZ2VzOiAwLFxuXHRcdFx0fSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdwYXJzZXMgYSBkaXJ0eSBicmFuY2ggYWhlYWQgYW5kIGJlaGluZCB1cHN0cmVhbScsICgpID0+IHtcblx0XHRcdGNvbnN0IG91dCA9IFtcblx0XHRcdFx0JyMgYnJhbmNoLm9pZCAwMTIzNDU2Nzg5YWJjZGVmMDEyMzQ1Njc4OWFiY2RlZjAxMjM0NTY3Jyxcblx0XHRcdFx0JyMgYnJhbmNoLmhlYWQgZmVhdHVyZScsXG5cdFx0XHRcdCcjIGJyYW5jaC51cHN0cmVhbSBvcmlnaW4vZmVhdHVyZScsXG5cdFx0XHRcdCcjIGJyYW5jaC5hYiArMyAtMicsXG5cdFx0XHRcdCcxIC5NIE4uLi4gMTAwNjQ0IDEwMDY0NCAxMDA2NDQgYWJjIGFiYyBzcmMvYS50cycsXG5cdFx0XHRcdCcyIFIuIE4uLi4gMTAwNjQ0IDEwMDY0NCAxMDA2NDQgYWJjIGFiYyBSMTAwIHNyYy9iLnRzXFx0c3JjL29sZC1iLnRzJyxcblx0XHRcdFx0Jz8gc3JjL3VudHJhY2tlZC50cycsXG5cdFx0XHRdLmpvaW4oJ1xcbicpO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChwYXJzZUdpdFN0YXR1c1YyKG91dCksIHtcblx0XHRcdFx0YnJhbmNoTmFtZTogJ2ZlYXR1cmUnLFxuXHRcdFx0XHR1cHN0cmVhbUJyYW5jaE5hbWU6ICdvcmlnaW4vZmVhdHVyZScsXG5cdFx0XHRcdG91dGdvaW5nQ2hhbmdlczogMyxcblx0XHRcdFx0aW5jb21pbmdDaGFuZ2VzOiAyLFxuXHRcdFx0XHR1bmNvbW1pdHRlZENoYW5nZXM6IDMsXG5cdFx0XHR9KTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3RyZWF0cyAoZGV0YWNoZWQpIEhFQUQgYXMgbm8gYnJhbmNoIGFuZCBvbWl0cyB1cHN0cmVhbS9hYiB3aGVuIGFic2VudCcsICgpID0+IHtcblx0XHRcdGNvbnN0IG91dCA9IFtcblx0XHRcdFx0JyMgYnJhbmNoLm9pZCAwMTIzNDU2Nzg5YWJjZGVmMDEyMzQ1Njc4OWFiY2RlZjAxMjM0NTY3Jyxcblx0XHRcdFx0JyMgYnJhbmNoLmhlYWQgKGRldGFjaGVkKScsXG5cdFx0XHRdLmpvaW4oJ1xcbicpO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChwYXJzZUdpdFN0YXR1c1YyKG91dCksIHtcblx0XHRcdFx0YnJhbmNoTmFtZTogdW5kZWZpbmVkLFxuXHRcdFx0XHR1cHN0cmVhbUJyYW5jaE5hbWU6IHVuZGVmaW5lZCxcblx0XHRcdFx0b3V0Z29pbmdDaGFuZ2VzOiB1bmRlZmluZWQsXG5cdFx0XHRcdGluY29taW5nQ2hhbmdlczogdW5kZWZpbmVkLFxuXHRcdFx0XHR1bmNvbW1pdHRlZENoYW5nZXM6IDAsXG5cdFx0XHR9KTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3JldHVybnMgZW1wdHkgb2JqZWN0IGZvciB1bmRlZmluZWQgaW5wdXQnLCAoKSA9PiB7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHBhcnNlR2l0U3RhdHVzVjIodW5kZWZpbmVkKSwge30pO1xuXHRcdH0pO1xuXHR9KTtcblxuXHRzdWl0ZSgncGFyc2VIYXNHaXRIdWJSZW1vdGUnLCAoKSA9PiB7XG5cdFx0dGVzdCgnZGV0ZWN0cyBzc2ggZ2l0aHViIHJlbW90ZScsICgpID0+IHtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChwYXJzZUhhc0dpdEh1YlJlbW90ZSgnb3JpZ2luXFx0Z2l0QGdpdGh1Yi5jb206b3duZXIvcmVwby5naXQgKGZldGNoKVxcbicpLCB0cnVlKTtcblx0XHR9KTtcblx0XHR0ZXN0KCdkZXRlY3RzIGh0dHBzIGdpdGh1YiByZW1vdGUnLCAoKSA9PiB7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocGFyc2VIYXNHaXRIdWJSZW1vdGUoJ29yaWdpblxcdGh0dHBzOi8vZ2l0aHViLmNvbS9vd25lci9yZXBvLmdpdCAoZmV0Y2gpXFxuJyksIHRydWUpO1xuXHRcdH0pO1xuXHRcdHRlc3QoJ3JldHVybnMgZmFsc2UgZm9yIG5vbi1naXRodWIgcmVtb3RlcycsICgpID0+IHtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChwYXJzZUhhc0dpdEh1YlJlbW90ZSgnb3JpZ2luXFx0aHR0cHM6Ly9naXRsYWIuY29tL293bmVyL3JlcG8uZ2l0IChmZXRjaClcXG4nKSwgZmFsc2UpO1xuXHRcdH0pO1xuXHRcdHRlc3QoJ3JldHVybnMgZmFsc2Ugd2hlbiB0aGVyZSBhcmUgbm8gcmVtb3RlcycsICgpID0+IHtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChwYXJzZUhhc0dpdEh1YlJlbW90ZSgnJyksIGZhbHNlKTtcblx0XHR9KTtcblx0XHR0ZXN0KCdyZXR1cm5zIHVuZGVmaW5lZCB3aGVuIHByb2JlIGZhaWxlZCAob3V0cHV0IGFic2VudCknLCAoKSA9PiB7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocGFyc2VIYXNHaXRIdWJSZW1vdGUodW5kZWZpbmVkKSwgdW5kZWZpbmVkKTtcblx0XHR9KTtcblx0fSk7XG5cblx0c3VpdGUoJ3BhcnNlRGVmYXVsdEJyYW5jaFJlZicsICgpID0+IHtcblx0XHR0ZXN0KCdzdHJpcHMgcmVmcy9yZW1vdGVzL29yaWdpbi8gcHJlZml4JywgKCkgPT4ge1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHBhcnNlRGVmYXVsdEJyYW5jaFJlZigncmVmcy9yZW1vdGVzL29yaWdpbi9tYWluXFxuJyksICdtYWluJyk7XG5cdFx0fSk7XG5cdFx0dGVzdCgncmV0dXJucyB0aGUgcmVmIGFzLWlzIHdoZW4gcHJlZml4IGlzIG5vdCBwcmVzZW50JywgKCkgPT4ge1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHBhcnNlRGVmYXVsdEJyYW5jaFJlZignbWFpbicpLCAnbWFpbicpO1xuXHRcdH0pO1xuXHRcdHRlc3QoJ3JldHVybnMgdW5kZWZpbmVkIGZvciBlbXB0eS9taXNzaW5nIG91dHB1dCcsICgpID0+IHtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChwYXJzZURlZmF1bHRCcmFuY2hSZWYodW5kZWZpbmVkKSwgdW5kZWZpbmVkKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChwYXJzZURlZmF1bHRCcmFuY2hSZWYoJyAgICcpLCB1bmRlZmluZWQpO1xuXHRcdH0pO1xuXHR9KTtcblxuXHRzdWl0ZSgncGFyc2VHaXRIdWJSZXBvRnJvbVJlbW90ZScsICgpID0+IHtcblx0XHR0ZXN0KCdwYXJzZXMgb25seSB0aGUgcmVxdWVzdGVkIGZvcmsgcmVtb3RlJywgKCkgPT4ge1xuXHRcdFx0Y29uc3Qgb3V0ID0gW1xuXHRcdFx0XHQnb3JpZ2luXFx0Z2l0QGdpdGh1Yi5jb206YmFzZS1vd25lci9yZXBvLmdpdCAoZmV0Y2gpJyxcblx0XHRcdFx0J2ZvcmtcXHRodHRwczovL2dpdGh1Yi5jb20vZm9yay1vd25lci9yZXBvLmdpdCAoZmV0Y2gpJyxcblx0XHRcdF0uam9pbignXFxuJyk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHBhcnNlR2l0SHViUmVwb0Zyb21SZW1vdGUob3V0LCAnZm9yaycpLCB7IG93bmVyOiAnZm9yay1vd25lcicsIHJlcG86ICdyZXBvJyB9KTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2RvZXMgbm90IGZhbGwgYmFjayB3aGVuIHRoZSByZXF1ZXN0ZWQgcmVtb3RlIGlzIG5vdCBHaXRIdWInLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBvdXQgPSBbXG5cdFx0XHRcdCdvcmlnaW5cXHRnaXRAZ2l0aHViLmNvbTpiYXNlLW93bmVyL3JlcG8uZ2l0IChmZXRjaCknLFxuXHRcdFx0XHQnZm9ya1xcdGh0dHBzOi8vZ2l0bGFiLmNvbS9mb3JrLW93bmVyL3JlcG8uZ2l0IChmZXRjaCknLFxuXHRcdFx0XS5qb2luKCdcXG4nKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChwYXJzZUdpdEh1YlJlcG9Gcm9tUmVtb3RlKG91dCwgJ2ZvcmsnKSwgdW5kZWZpbmVkKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3BhcnNlcyBzc2ggKHNjcC1saWtlKSBvcmlnaW4gcmVtb3RlJywgKCkgPT4ge1xuXHRcdFx0Y29uc3Qgb3V0ID0gJ29yaWdpblxcdGdpdEBnaXRodWIuY29tOm1pY3Jvc29mdC92c2NvZGUuZ2l0IChmZXRjaClcXG5vcmlnaW5cXHRnaXRAZ2l0aHViLmNvbTptaWNyb3NvZnQvdnNjb2RlLmdpdCAocHVzaClcXG4nO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChwYXJzZUdpdEh1YlJlcG9Gcm9tUmVtb3RlKG91dCksIHsgb3duZXI6ICdtaWNyb3NvZnQnLCByZXBvOiAndnNjb2RlJyB9KTtcblx0XHR9KTtcblx0XHR0ZXN0KCdwYXJzZXMgaHR0cHMgb3JpZ2luIHJlbW90ZSB3aXRob3V0IC5naXQgc3VmZml4JywgKCkgPT4ge1xuXHRcdFx0Y29uc3Qgb3V0ID0gJ29yaWdpblxcdGh0dHBzOi8vZ2l0aHViLmNvbS9taWNyb3NvZnQvdnNjb2RlIChmZXRjaClcXG4nO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChwYXJzZUdpdEh1YlJlcG9Gcm9tUmVtb3RlKG91dCksIHsgb3duZXI6ICdtaWNyb3NvZnQnLCByZXBvOiAndnNjb2RlJyB9KTtcblx0XHR9KTtcblx0XHR0ZXN0KCdwYXJzZXMgc3NoOi8vIHNjaGVtZSByZW1vdGUnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBvdXQgPSAnb3JpZ2luXFx0c3NoOi8vZ2l0QGdpdGh1Yi5jb20vbWljcm9zb2Z0L3ZzY29kZS5naXQgKGZldGNoKVxcbic7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHBhcnNlR2l0SHViUmVwb0Zyb21SZW1vdGUob3V0KSwgeyBvd25lcjogJ21pY3Jvc29mdCcsIHJlcG86ICd2c2NvZGUnIH0pO1xuXHRcdH0pO1xuXHRcdHRlc3QoJ3ByZWZlcnMgb3JpZ2luIG92ZXIgb3RoZXIgcmVtb3RlcycsICgpID0+IHtcblx0XHRcdGNvbnN0IG91dCA9XG5cdFx0XHRcdCdmb3JrXFx0Z2l0QGdpdGh1Yi5jb206bWUvdnNjb2RlLmdpdCAoZmV0Y2gpXFxuJyArXG5cdFx0XHRcdCdvcmlnaW5cXHRnaXRAZ2l0aHViLmNvbTptaWNyb3NvZnQvdnNjb2RlLmdpdCAoZmV0Y2gpXFxuJztcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocGFyc2VHaXRIdWJSZXBvRnJvbVJlbW90ZShvdXQpLCB7IG93bmVyOiAnbWljcm9zb2Z0JywgcmVwbzogJ3ZzY29kZScgfSk7XG5cdFx0fSk7XG5cdFx0dGVzdCgnZmFsbHMgYmFjayB0byBmaXJzdCBnaXRodWIgcmVtb3RlIHdoZW4gb3JpZ2luIGlzIG5vdCBnaXRodWInLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBvdXQgPVxuXHRcdFx0XHQnb3JpZ2luXFx0Z2l0QGdpdGxhYi5jb206Zm9vL2Jhci5naXQgKGZldGNoKVxcbicgK1xuXHRcdFx0XHQndXBzdHJlYW1cXHRodHRwczovL2dpdGh1Yi5jb20vbWljcm9zb2Z0L3ZzY29kZS5naXQgKGZldGNoKVxcbic7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHBhcnNlR2l0SHViUmVwb0Zyb21SZW1vdGUob3V0KSwgeyBvd25lcjogJ21pY3Jvc29mdCcsIHJlcG86ICd2c2NvZGUnIH0pO1xuXHRcdH0pO1xuXHRcdHRlc3QoJ3JldHVybnMgdW5kZWZpbmVkIHdoZW4gbm8gcmVtb3RlcyBhcmUgcHJlc2VudCcsICgpID0+IHtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChwYXJzZUdpdEh1YlJlcG9Gcm9tUmVtb3RlKCcnKSwgdW5kZWZpbmVkKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChwYXJzZUdpdEh1YlJlcG9Gcm9tUmVtb3RlKHVuZGVmaW5lZCksIHVuZGVmaW5lZCk7XG5cdFx0fSk7XG5cdFx0dGVzdCgncmV0dXJucyB1bmRlZmluZWQgd2hlbiBubyBHaXRIdWIgcmVtb3RlIGlzIHByZXNlbnQnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBvdXQgPSAnb3JpZ2luXFx0aHR0cHM6Ly9naXRsYWIuY29tL2Zvby9iYXIuZ2l0IChmZXRjaClcXG4nO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHBhcnNlR2l0SHViUmVwb0Zyb21SZW1vdGUob3V0KSwgdW5kZWZpbmVkKTtcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnb3JkZXJzIGZldGNoIHJlbW90ZSBVUkxzIHdpdGggb3JpZ2luIGZpcnN0IGFuZCBleGNsdWRlcyBwdXNoIFVSTHMnLCAoKSA9PiB7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChwYXJzZUZldGNoUmVtb3RlVXJscyhbXG5cdFx0XHQndXBzdHJlYW1cXHRnaXRAZ2l0aHViLmNvbTptaWNyb3NvZnQvdnNjb2RlLmdpdCAoZmV0Y2gpJyxcblx0XHRcdCdvcmlnaW5cXHRodHRwczovL2dpdGh1Yi5jb20vbWUvdnNjb2RlLmdpdCAocHVzaCknLFxuXHRcdFx0J29yaWdpblxcdGh0dHBzOi8vZ2l0aHViLmNvbS9tZS92c2NvZGUuZ2l0IChmZXRjaCknLFxuXHRcdF0uam9pbignXFxuJykpLCBbXG5cdFx0XHQnaHR0cHM6Ly9naXRodWIuY29tL21lL3ZzY29kZS5naXQnLFxuXHRcdFx0J2dpdEBnaXRodWIuY29tOm1pY3Jvc29mdC92c2NvZGUuZ2l0Jyxcblx0XHRdKTtcblx0fSk7XG5cblx0dGVzdCgncHJlZmVycyB0aGUgYnJhbmNoIHVwc3RyZWFtIHJlbW90ZSBiZWZvcmUgb3JpZ2luJywgKCkgPT4ge1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocGFyc2VGZXRjaFJlbW90ZVVybHMoW1xuXHRcdFx0J29yaWdpblxcdGh0dHBzOi8vZ2l0aHViLmNvbS9tZS92c2NvZGUuZ2l0IChmZXRjaCknLFxuXHRcdFx0J3Vwc3RyZWFtXFx0aHR0cHM6Ly9naXRodWIuY29tL21pY3Jvc29mdC92c2NvZGUuZ2l0IChmZXRjaCknLFxuXHRcdF0uam9pbignXFxuJyksICd1cHN0cmVhbScpLCBbXG5cdFx0XHQnaHR0cHM6Ly9naXRodWIuY29tL21pY3Jvc29mdC92c2NvZGUuZ2l0Jyxcblx0XHRcdCdodHRwczovL2dpdGh1Yi5jb20vbWUvdnNjb2RlLmdpdCcsXG5cdFx0XSk7XG5cdH0pO1xuXG5cdHN1aXRlKCdwYXJzZVVudHJhY2tlZFBhdGhzJywgKCkgPT4ge1xuXHRcdHRlc3QoJ3JldHVybnMgZW1wdHkgZm9yIGVtcHR5L3VuZGVmaW5lZCBvdXRwdXQnLCAoKSA9PiB7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHBhcnNlVW50cmFja2VkUGF0aHModW5kZWZpbmVkKSwgW10pO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChwYXJzZVVudHJhY2tlZFBhdGhzKCcnKSwgW10pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnZXh0cmFjdHMgdW50cmFja2VkIGVudHJpZXMgYW5kIHNraXBzIG90aGVycycsICgpID0+IHtcblx0XHRcdC8vIGBnaXQgc3RhdHVzIC0tcG9yY2VsYWluPXYxIC16YCBlbWl0cyBOVUwtc2VwYXJhdGVkIGVudHJpZXM7IHRoZVxuXHRcdFx0Ly8gcmVuYW1lIGVudHJ5IGluY2x1ZGVzIGEgc2Vjb25kIE5VTC1zZXBhcmF0ZWQgXCJmcm9tXCIgcGF0aCB0aGF0XG5cdFx0XHQvLyBtdXN0IGJlIHNraXBwZWQuXG5cdFx0XHRjb25zdCBvdXQgPSAnPz8gbmV3LnR4dFxceDAwIE0gZWRpdGVkLnR4dFxceDAwUiAgdG8udHh0XFx4MDBmcm9tLnR4dFxceDAwPz8gb3RoZXIudHh0XFx4MDAnO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChwYXJzZVVudHJhY2tlZFBhdGhzKG91dCksIFsnbmV3LnR4dCcsICdvdGhlci50eHQnXSk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHN1aXRlKCdwYXJzZUNoYW5nZWRQYXRocycsICgpID0+IHtcblx0XHR0ZXN0KCdyZXR1cm5zIGV2ZXJ5IGNoYW5nZWQgcGF0aCBpbmNsdWRpbmcgZGVsZXRlIGFuZCBpbmRleCByZW5hbWUvY29weSBzb3VyY2VzJywgKCkgPT4ge1xuXHRcdFx0Y29uc3Qgb3V0ID0gW1xuXHRcdFx0XHQnIE0gbW9kaWZpZWQudHh0Jyxcblx0XHRcdFx0J0EgIGFkZGVkLnR4dCcsXG5cdFx0XHRcdCcgRCBkZWxldGVkLnR4dCcsXG5cdFx0XHRcdCc/PyB1bnRyYWNrZWQudHh0Jyxcblx0XHRcdFx0J1IgIHJlbmFtZWQtbmV3LnR4dCcsXG5cdFx0XHRcdCdyZW5hbWVkLW9sZC50eHQnLFxuXHRcdFx0XHQnIEMgY29waWVkLW5ldy50eHQnLFxuXHRcdFx0XHQnY29waWVkLW9sZC50eHQnLFxuXHRcdFx0XHQnIE0gbW9kaWZpZWQudHh0Jyxcblx0XHRcdFx0JycsXG5cdFx0XHRdLmpvaW4oJ1xceDAwJyk7XG5cblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocGFyc2VDaGFuZ2VkUGF0aHMob3V0KSwgW1xuXHRcdFx0XHQnbW9kaWZpZWQudHh0Jyxcblx0XHRcdFx0J2FkZGVkLnR4dCcsXG5cdFx0XHRcdCdkZWxldGVkLnR4dCcsXG5cdFx0XHRcdCd1bnRyYWNrZWQudHh0Jyxcblx0XHRcdFx0J3JlbmFtZWQtbmV3LnR4dCcsXG5cdFx0XHRcdCdyZW5hbWVkLW9sZC50eHQnLFxuXHRcdFx0XHQnY29waWVkLW5ldy50eHQnLFxuXHRcdFx0XHQnY29waWVkLW9sZC50eHQnLFxuXHRcdFx0XSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdyZXR1cm5zIHdvcmt0cmVlIHJlbmFtZS9jb3B5IHNvdXJjZSBwYXRocyB0b28nLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBvdXQgPSBbXG5cdFx0XHRcdCcgUiB3b3JrdHJlZS1yZW5hbWVkLW5ldy50eHQnLFxuXHRcdFx0XHQnd29ya3RyZWUtcmVuYW1lZC1vbGQudHh0Jyxcblx0XHRcdFx0JyBDIHdvcmt0cmVlLWNvcGllZC1uZXcudHh0Jyxcblx0XHRcdFx0J3dvcmt0cmVlLWNvcGllZC1vbGQudHh0Jyxcblx0XHRcdFx0JycsXG5cdFx0XHRdLmpvaW4oJ1xceDAwJyk7XG5cblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocGFyc2VDaGFuZ2VkUGF0aHMob3V0KSwgW1xuXHRcdFx0XHQnd29ya3RyZWUtcmVuYW1lZC1uZXcudHh0Jyxcblx0XHRcdFx0J3dvcmt0cmVlLXJlbmFtZWQtb2xkLnR4dCcsXG5cdFx0XHRcdCd3b3JrdHJlZS1jb3BpZWQtbmV3LnR4dCcsXG5cdFx0XHRcdCd3b3JrdHJlZS1jb3BpZWQtb2xkLnR4dCcsXG5cdFx0XHRdKTtcblx0XHR9KTtcblx0fSk7XG5cblx0c3VpdGUoJ3BhcnNlR2l0RGlmZlJhd051bXN0YXQnLCAoKSA9PiB7XG5cdFx0Y29uc3Qgcm9vdCA9IFVSSS5maWxlKCcvcmVwbycpO1xuXHRcdGNvbnN0IHNlc3Npb25VcmkgPSAnY29waWxvdDovYWJjJztcblx0XHRjb25zdCBzaGEgPSAnY2FmZTEyMzRjYWZlMTIzNGNhZmUxMjM0Y2FmZTEyMzRjYWZlMTIzNCc7XG5cblx0XHR0ZXN0KCdwYXJzZXMgYW4gYWRkLCBtb2RpZnksIGRlbGV0ZSBhbmQgcmVuYW1lIGluIGEgc2luZ2xlIHN0cmVhbScsICgpID0+IHtcblx0XHRcdC8vIEZvcm1hdDogYWx0ZXJuYXRpbmcgYC0tcmF3YCBhbmQgYC0tbnVtc3RhdGAgc2VnbWVudHMgc2VwYXJhdGVkIGJ5XG5cdFx0XHQvLyBOVUwgYnl0ZXMuIFJlbmFtZXMgaGF2ZSBhbiBleHRyYSBwYXRoIHNlZ21lbnQgaW4gYm90aCBoYWx2ZXMuXG5cdFx0XHRjb25zdCBzZWdtZW50czogc3RyaW5nW10gPSBbXG5cdFx0XHRcdCc6MTAwNjQ0IDEwMDY0NCAwMDAwMDAwIDExMTExMTEgTScsICdtb2RpZmllZC50cycsXG5cdFx0XHRcdCc6MDAwMDAwIDEwMDY0NCAwMDAwMDAwIDIyMjIyMjIgQScsICdhZGRlZC50cycsXG5cdFx0XHRcdCc6MTAwNjQ0IDAwMDAwMCAzMzMzMzMzIDAwMDAwMDAgRCcsICdkZWxldGVkLnRzJyxcblx0XHRcdFx0JzoxMDA2NDQgMTAwNjQ0IDQ0NDQ0NDQgNTU1NTU1NSBSMTAwJywgJ29sZC9wYXRoLnRzJywgJ25ldy9wYXRoLnRzJyxcblx0XHRcdFx0JzVcXHQyXFx0bW9kaWZpZWQudHMnLFxuXHRcdFx0XHQnMTBcXHQwXFx0YWRkZWQudHMnLFxuXHRcdFx0XHQnMFxcdDdcXHRkZWxldGVkLnRzJyxcblx0XHRcdFx0JzNcXHQzXFx0JywgJ29sZC9wYXRoLnRzJywgJ25ldy9wYXRoLnRzJyxcblx0XHRcdFx0JycsXG5cdFx0XHRdO1xuXHRcdFx0Y29uc3Qgb3V0ID0gc2VnbWVudHMuam9pbignXFx4MDAnKTtcblx0XHRcdGNvbnN0IGRpZmZzID0gcGFyc2VHaXREaWZmUmF3TnVtc3RhdChvdXQsIHJvb3QsIHNlc3Npb25VcmksIHNoYSk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGRpZmZzLCBbXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRiZWZvcmU6IHsgdXJpOiAnZmlsZTovLy9yZXBvL21vZGlmaWVkLnRzJywgY29udGVudDogeyB1cmk6IGJ1aWxkR2l0QmxvYlVyaShzZXNzaW9uVXJpLCBzaGEsICdtb2RpZmllZC50cycsICcvcmVwby9tb2RpZmllZC50cycpIH0gfSxcblx0XHRcdFx0XHRhZnRlcjogeyB1cmk6ICdmaWxlOi8vL3JlcG8vbW9kaWZpZWQudHMnLCBjb250ZW50OiB7IHVyaTogJ2ZpbGU6Ly8vcmVwby9tb2RpZmllZC50cycgfSB9LFxuXHRcdFx0XHRcdGRpZmY6IHsgYWRkZWQ6IDUsIHJlbW92ZWQ6IDIgfSxcblx0XHRcdFx0fSxcblx0XHRcdFx0e1xuXHRcdFx0XHRcdGFmdGVyOiB7IHVyaTogJ2ZpbGU6Ly8vcmVwby9hZGRlZC50cycsIGNvbnRlbnQ6IHsgdXJpOiAnZmlsZTovLy9yZXBvL2FkZGVkLnRzJyB9IH0sXG5cdFx0XHRcdFx0ZGlmZjogeyBhZGRlZDogMTAsIHJlbW92ZWQ6IDAgfSxcblx0XHRcdFx0fSxcblx0XHRcdFx0e1xuXHRcdFx0XHRcdGJlZm9yZTogeyB1cmk6ICdmaWxlOi8vL3JlcG8vZGVsZXRlZC50cycsIGNvbnRlbnQ6IHsgdXJpOiBidWlsZEdpdEJsb2JVcmkoc2Vzc2lvblVyaSwgc2hhLCAnZGVsZXRlZC50cycsICcvcmVwby9kZWxldGVkLnRzJykgfSB9LFxuXHRcdFx0XHRcdGRpZmY6IHsgYWRkZWQ6IDAsIHJlbW92ZWQ6IDcgfSxcblx0XHRcdFx0fSxcblx0XHRcdFx0e1xuXHRcdFx0XHRcdGJlZm9yZTogeyB1cmk6ICdmaWxlOi8vL3JlcG8vb2xkL3BhdGgudHMnLCBjb250ZW50OiB7IHVyaTogYnVpbGRHaXRCbG9iVXJpKHNlc3Npb25VcmksIHNoYSwgJ29sZC9wYXRoLnRzJywgJy9yZXBvL29sZC9wYXRoLnRzJykgfSB9LFxuXHRcdFx0XHRcdGFmdGVyOiB7IHVyaTogJ2ZpbGU6Ly8vcmVwby9uZXcvcGF0aC50cycsIGNvbnRlbnQ6IHsgdXJpOiAnZmlsZTovLy9yZXBvL25ldy9wYXRoLnRzJyB9IH0sXG5cdFx0XHRcdFx0ZGlmZjogeyBhZGRlZDogMywgcmVtb3ZlZDogMyB9LFxuXHRcdFx0XHR9LFxuXHRcdFx0XSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCd0cmVhdHMgYC1gIG51bXN0YXQgdmFsdWVzIChiaW5hcnkpIGFzIHplcm8nLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBvdXQgPSBbJzoxMDA2NDQgMTAwNjQ0IDAgMCBNJywgJ2ltYWdlLnBuZycsICctXFx0LVxcdGltYWdlLnBuZycsICcnXS5qb2luKCdcXHgwMCcpO1xuXHRcdFx0Y29uc3QgZGlmZnMgPSBwYXJzZUdpdERpZmZSYXdOdW1zdGF0KG91dCwgcm9vdCwgc2Vzc2lvblVyaSwgc2hhKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChkaWZmcy5sZW5ndGgsIDEpO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChkaWZmc1swXS5kaWZmLCB7IGFkZGVkOiAwLCByZW1vdmVkOiAwIH0pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgncmV0dXJucyBlbXB0eSBmb3IgZW1wdHkgaW5wdXQnLCAoKSA9PiB7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHBhcnNlR2l0RGlmZlJhd051bXN0YXQoJycsIHJvb3QsIHNlc3Npb25VcmksIHNoYSksIFtdKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2FuY2hvcnMgYWZ0ZXIgc2lkZSB0byBhZnRlclJlZiB3aGVuIHByb3ZpZGVkIChyZWYtPnJlZiBkaWZmcyknLCAoKSA9PiB7XG5cdFx0XHQvLyBJbiBhIGNoZWNrcG9pbnQgLyByZWYtPnJlZiBkaWZmLCBib3RoIHRoZSBiZWZvcmUgYW5kIHRoZSBhZnRlclxuXHRcdFx0Ly8gY29udGVudCBtdXN0IGJlIGFuY2hvcmVkIHRvIGNvbW1pdHMgXHUyMDE0IG5ldmVyIHRvIHRoZSB3b3JraW5nXG5cdFx0XHQvLyB0cmVlLiBXaXRoIGBhZnRlclJlZmAgc2V0LCBib3RoIGBhZnRlci51cmlgIGFuZFxuXHRcdFx0Ly8gYGFmdGVyLmNvbnRlbnQudXJpYCBhcmUgYGdpdC1ibG9iOmAgVVJJcyBzbyB0aGUgZGlmZiByZWZsZWN0c1xuXHRcdFx0Ly8gdGhlIHN0YXRlIGF0IHRoYXQgY29tbWl0IGV2ZW4gaWYgdGhlIHdvcmtpbmcgdHJlZSBkaXZlcmdlc1xuXHRcdFx0Ly8gKGUuZy4gZmlsZSByZW5hbWVkLCBkZWxldGVkLCBvciBtb2RpZmllZCBvbiBkaXNrIHNpbmNlKS5cblx0XHRcdGNvbnN0IHRvU2hhID0gJ2JlZWY1Njc4YmVlZjU2NzhiZWVmNTY3OGJlZWY1Njc4YmVlZjU2NzgnO1xuXHRcdFx0Y29uc3Qgc2VnbWVudHM6IHN0cmluZ1tdID0gW1xuXHRcdFx0XHQnOjEwMDY0NCAxMDA2NDQgMDAwMDAwMCAxMTExMTExIE0nLCAnbW9kaWZpZWQudHMnLFxuXHRcdFx0XHQnOjAwMDAwMCAxMDA2NDQgMDAwMDAwMCAyMjIyMjIyIEEnLCAnYWRkZWQudHMnLFxuXHRcdFx0XHQnOjEwMDY0NCAwMDAwMDAgMzMzMzMzMyAwMDAwMDAwIEQnLCAnZGVsZXRlZC50cycsXG5cdFx0XHRcdCc6MTAwNjQ0IDEwMDY0NCA0NDQ0NDQ0IDU1NTU1NTUgUjEwMCcsICdvbGQvcGF0aC50cycsICduZXcvcGF0aC50cycsXG5cdFx0XHRcdCc1XFx0MlxcdG1vZGlmaWVkLnRzJyxcblx0XHRcdFx0JzEwXFx0MFxcdGFkZGVkLnRzJyxcblx0XHRcdFx0JzBcXHQ3XFx0ZGVsZXRlZC50cycsXG5cdFx0XHRcdCczXFx0M1xcdCcsICdvbGQvcGF0aC50cycsICduZXcvcGF0aC50cycsXG5cdFx0XHRcdCcnLFxuXHRcdFx0XTtcblx0XHRcdGNvbnN0IGRpZmZzID0gcGFyc2VHaXREaWZmUmF3TnVtc3RhdChzZWdtZW50cy5qb2luKCdcXHgwMCcpLCByb290LCBzZXNzaW9uVXJpLCBzaGEsIHRvU2hhKTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoZGlmZnMsIFtcblx0XHRcdFx0e1xuXHRcdFx0XHRcdGJlZm9yZTogeyB1cmk6ICdmaWxlOi8vL3JlcG8vbW9kaWZpZWQudHMnLCBjb250ZW50OiB7IHVyaTogYnVpbGRHaXRCbG9iVXJpKHNlc3Npb25VcmksIHNoYSwgJ21vZGlmaWVkLnRzJywgJy9yZXBvL21vZGlmaWVkLnRzJykgfSB9LFxuXHRcdFx0XHRcdGFmdGVyOiB7IHVyaTogJ2ZpbGU6Ly8vcmVwby9tb2RpZmllZC50cycsIGNvbnRlbnQ6IHsgdXJpOiBidWlsZEdpdEJsb2JVcmkoc2Vzc2lvblVyaSwgdG9TaGEsICdtb2RpZmllZC50cycsICcvcmVwby9tb2RpZmllZC50cycpIH0gfSxcblx0XHRcdFx0XHRkaWZmOiB7IGFkZGVkOiA1LCByZW1vdmVkOiAyIH0sXG5cdFx0XHRcdH0sXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRhZnRlcjogeyB1cmk6ICdmaWxlOi8vL3JlcG8vYWRkZWQudHMnLCBjb250ZW50OiB7IHVyaTogYnVpbGRHaXRCbG9iVXJpKHNlc3Npb25VcmksIHRvU2hhLCAnYWRkZWQudHMnLCAnL3JlcG8vYWRkZWQudHMnKSB9IH0sXG5cdFx0XHRcdFx0ZGlmZjogeyBhZGRlZDogMTAsIHJlbW92ZWQ6IDAgfSxcblx0XHRcdFx0fSxcblx0XHRcdFx0e1xuXHRcdFx0XHRcdGJlZm9yZTogeyB1cmk6ICdmaWxlOi8vL3JlcG8vZGVsZXRlZC50cycsIGNvbnRlbnQ6IHsgdXJpOiBidWlsZEdpdEJsb2JVcmkoc2Vzc2lvblVyaSwgc2hhLCAnZGVsZXRlZC50cycsICcvcmVwby9kZWxldGVkLnRzJykgfSB9LFxuXHRcdFx0XHRcdGRpZmY6IHsgYWRkZWQ6IDAsIHJlbW92ZWQ6IDcgfSxcblx0XHRcdFx0fSxcblx0XHRcdFx0e1xuXHRcdFx0XHRcdGJlZm9yZTogeyB1cmk6ICdmaWxlOi8vL3JlcG8vb2xkL3BhdGgudHMnLCBjb250ZW50OiB7IHVyaTogYnVpbGRHaXRCbG9iVXJpKHNlc3Npb25VcmksIHNoYSwgJ29sZC9wYXRoLnRzJywgJy9yZXBvL29sZC9wYXRoLnRzJykgfSB9LFxuXHRcdFx0XHRcdGFmdGVyOiB7IHVyaTogJ2ZpbGU6Ly8vcmVwby9uZXcvcGF0aC50cycsIGNvbnRlbnQ6IHsgdXJpOiBidWlsZEdpdEJsb2JVcmkoc2Vzc2lvblVyaSwgdG9TaGEsICduZXcvcGF0aC50cycsICcvcmVwby9uZXcvcGF0aC50cycpIH0gfSxcblx0XHRcdFx0XHRkaWZmOiB7IGFkZGVkOiAzLCByZW1vdmVkOiAzIH0sXG5cdFx0XHRcdH0sXG5cdFx0XHRdKTtcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnZXhwb3J0cyB0aGUgd2VsbC1rbm93biBlbXB0eS10cmVlIG9iamVjdCBTSEEnLCAoKSA9PiB7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKEVNUFRZX1RSRUVfT0JKRUNULCAnNGI4MjVkYzY0MmNiNmViOWEwNjBlNTRiZjhkNjkyODhmYmVlNDkwNCcpO1xuXHR9KTtcblxuXHRzdWl0ZSgnZm9ybWF0R2l0RXJyb3InLCAoKSA9PiB7XG5cdFx0dGVzdCgncmVwb3J0cyB0aW1lb3V0IHdoZW4gb3VyIHRpbWVyIGZpcmVkIGFuZCBzdW1tYXJpc2VzIHByb2dyZXNzLW1ldGVyIHN0ZGVycicsICgpID0+IHtcblx0XHRcdGNvbnN0IGVyciA9IE9iamVjdC5hc3NpZ24obmV3IEVycm9yKCdDb21tYW5kIGZhaWxlZCcpLCB7IGtpbGxlZDogdHJ1ZSwgc2lnbmFsOiAnU0lHVEVSTScgYXMgY29uc3QgfSk7XG5cdFx0XHRjb25zdCBwcm9ncmVzcyA9ICdVcGRhdGluZyBmaWxlczogICAwJSAoNy8xNDgzNClcXHJVcGRhdGluZyBmaWxlczogICAwJSAoMTQ5LzE0ODM0KVxccic7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoXG5cdFx0XHRcdGZvcm1hdEdpdEVycm9yKFsnd29ya3RyZWUnLCAnYWRkJywgJy1iJywgJ3gnLCAnL3RtcC95JywgJ29yaWdpbi9tYWluJ10sIDMwXzAwMCwgdHJ1ZSwgZXJyLCBwcm9ncmVzcyksXG5cdFx0XHRcdCdnaXQgd29ya3RyZWUgdGltZWQgb3V0IGFmdGVyIDMwMDAwbXM6IFVwZGF0aW5nIGZpbGVzOiAgIDAlICgxNDkvMTQ4MzQpJyxcblx0XHRcdCk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdyZXBvcnRzIGtpbGwgc2lnbmFsIHdoZW4ga2lsbGVkIGJ1dCBub3QgYnkgb3VyIHRpbWVyJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgZXJyID0gT2JqZWN0LmFzc2lnbihuZXcgRXJyb3IoJ0NvbW1hbmQgZmFpbGVkJyksIHsga2lsbGVkOiB0cnVlLCBzaWduYWw6ICdTSUdURVJNJyBhcyBjb25zdCB9KTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChcblx0XHRcdFx0Zm9ybWF0R2l0RXJyb3IoWyd3b3JrdHJlZScsICdhZGQnXSwgMzBfMDAwLCBmYWxzZSwgZXJyLCAnJyksXG5cdFx0XHRcdCdnaXQgd29ya3RyZWUga2lsbGVkIGJ5IFNJR1RFUk0nLFxuXHRcdFx0KTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3JlcG9ydHMgbnVtZXJpYyBleGl0IGNvZGUgd2hlbiBnaXQgZmFpbGVkIG5vcm1hbGx5JywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgZXJyID0gT2JqZWN0LmFzc2lnbihuZXcgRXJyb3IoJ0NvbW1hbmQgZmFpbGVkJyksIHsgY29kZTogMTI4IH0pO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKFxuXHRcdFx0XHRmb3JtYXRHaXRFcnJvcihbJ3dvcmt0cmVlJywgJ2FkZCcsICcvdG1wL3knLCAnbWlzc2luZy1icmFuY2gnXSwgMzBfMDAwLCBmYWxzZSwgZXJyLCAnZmF0YWw6IGludmFsaWQgcmVmZXJlbmNlOiBtaXNzaW5nLWJyYW5jaFxcbicpLFxuXHRcdFx0XHQnZ2l0IHdvcmt0cmVlIGV4aXRlZCB3aXRoIGNvZGUgMTI4OiBmYXRhbDogaW52YWxpZCByZWZlcmVuY2U6IG1pc3NpbmctYnJhbmNoJyxcblx0XHRcdCk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdrZWVwcyBtaXNzaW5nIGdpdC1sZnMgZXJyb3Igb3ZlciB0aGUgbGF0ZXIgZ2VuZXJpYyBmYXRhbCBsaW5lJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgZXJyID0gT2JqZWN0LmFzc2lnbihuZXcgRXJyb3IoJ0NvbW1hbmQgZmFpbGVkJyksIHsgY29kZTogMTI4IH0pO1xuXHRcdFx0Y29uc3Qgc3RkZXJyID0gW1xuXHRcdFx0XHQnUHJlcGFyaW5nIHdvcmt0cmVlIChuZXcgYnJhbmNoIFxcJ2FnZW50cy9leGFtcGxlXFwnKScsXG5cdFx0XHRcdCdnaXQtbGZzIGZpbHRlci1wcm9jZXNzOiBnaXQtbGZzOiBjb21tYW5kIG5vdCBmb3VuZCcsXG5cdFx0XHRcdCdmYXRhbDogdGhlIHJlbW90ZSBlbmQgaHVuZyB1cCB1bmV4cGVjdGVkbHknLFxuXHRcdFx0XS5qb2luKCdcXG4nKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChcblx0XHRcdFx0Zm9ybWF0R2l0RXJyb3IoWyd3b3JrdHJlZScsICdhZGQnLCAnLS1uby10cmFjaycsICctYicsICdhZ2VudHMvZXhhbXBsZScsICcvdG1wL3dvcmt0cmVlJywgJ29yaWdpbi9tYWluJ10sIDYwXzAwMCwgZmFsc2UsIGVyciwgc3RkZXJyKSxcblx0XHRcdFx0J2dpdCB3b3JrdHJlZSBleGl0ZWQgd2l0aCBjb2RlIDEyODogZ2l0LWxmcyBmaWx0ZXItcHJvY2VzczogZ2l0LWxmczogY29tbWFuZCBub3QgZm91bmQnLFxuXHRcdFx0KTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2ZhbGxzIGJhY2sgdG8gZXJyb3IgbWVzc2FnZSB3aGVuIHRoZXJlIGlzIG5vIHNpZ25hbCBvciBleGl0IGNvZGUnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBlcnIgPSBuZXcgRXJyb3IoJ3NwYXduIGdpdCBFTk9FTlQnKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChcblx0XHRcdFx0Zm9ybWF0R2l0RXJyb3IoWydzdGF0dXMnXSwgNV8wMDAsIGZhbHNlLCBlcnIsICcnKSxcblx0XHRcdFx0J3NwYXduIGdpdCBFTk9FTlQnLFxuXHRcdFx0KTtcblx0XHR9KTtcblx0fSk7XG5cblx0c3VpdGUoJ2lzUmV0cnlhYmxlV29ya3RyZWVSZW1vdmFsRXJyb3InLCAoKSA9PiB7XG5cdFx0dGVzdCgncmV0cmllcyB0cmFuc2llbnQgbG9jayAvIGRpci1ub3QtZW1wdHkgcmFjZXMgYnV0IG5vdCBmYXRhbCByZW1vdmFsIGVycm9ycycsICgpID0+IHtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0XHRkaXJOb3RFbXB0eTogaXNSZXRyeWFibGVXb3JrdHJlZVJlbW92YWxFcnJvcihuZXcgRXJyb3IoYGdpdCB3b3JrdHJlZSBleGl0ZWQgd2l0aCBjb2RlIDI1NTogZXJyb3I6IGZhaWxlZCB0byBkZWxldGUgJy5naXQvd29ya3RyZWVzL3JlcGx5LWV4YWN0bHktbWF0ZXJpYWxpemVkJzogRGlyZWN0b3J5IG5vdCBlbXB0eWApKSxcblx0XHRcdFx0aW5kZXhMb2NrOiBpc1JldHJ5YWJsZVdvcmt0cmVlUmVtb3ZhbEVycm9yKG5ldyBFcnJvcignZ2l0IHdvcmt0cmVlIGV4aXRlZCB3aXRoIGNvZGUgMTI4OiBmYXRhbDogVW5hYmxlIHRvIGNyZWF0ZSBcXCcuZ2l0L3dvcmt0cmVlcy94L2luZGV4LmxvY2tcXCc6IEZpbGUgZXhpc3RzJykpLFxuXHRcdFx0XHRjb3VsZE5vdExvY2s6IGlzUmV0cnlhYmxlV29ya3RyZWVSZW1vdmFsRXJyb3IobmV3IEVycm9yKCdnaXQgd29ya3RyZWUgZXhpdGVkIHdpdGggY29kZSAxOiBmYXRhbDogY291bGQgbm90IGxvY2sgY29uZmlnIGZpbGUnKSksXG5cdFx0XHRcdGRpcnR5VHJlZTogaXNSZXRyeWFibGVXb3JrdHJlZVJlbW92YWxFcnJvcihuZXcgRXJyb3IoYGdpdCB3b3JrdHJlZSBleGl0ZWQgd2l0aCBjb2RlIDE6IGZhdGFsOiAnd3QnIGNvbnRhaW5zIG1vZGlmaWVkIG9yIHVudHJhY2tlZCBmaWxlcywgdXNlIC0tZm9yY2UgdG8gZGVsZXRlIGl0YCkpLFxuXHRcdFx0XHRub3RBV29ya3RyZWU6IGlzUmV0cnlhYmxlV29ya3RyZWVSZW1vdmFsRXJyb3IobmV3IEVycm9yKGBnaXQgd29ya3RyZWUgZXhpdGVkIHdpdGggY29kZSAxMjg6IGZhdGFsOiAnd3QnIGlzIG5vdCBhIHdvcmtpbmcgdHJlZWApKSxcblx0XHRcdFx0bm9uRXJyb3I6IGlzUmV0cnlhYmxlV29ya3RyZWVSZW1vdmFsRXJyb3IoJ2Jvb20nKSxcblx0XHRcdH0sIHtcblx0XHRcdFx0ZGlyTm90RW1wdHk6IHRydWUsXG5cdFx0XHRcdGluZGV4TG9jazogdHJ1ZSxcblx0XHRcdFx0Y291bGROb3RMb2NrOiB0cnVlLFxuXHRcdFx0XHRkaXJ0eVRyZWU6IGZhbHNlLFxuXHRcdFx0XHRub3RBV29ya3RyZWU6IGZhbHNlLFxuXHRcdFx0XHRub25FcnJvcjogZmFsc2UsXG5cdFx0XHR9KTtcblx0XHR9KTtcblx0fSk7XG5cblx0c3VpdGUoJ3N1bW1hcml6ZVN0ZGVyckZvckVycm9yJywgKCkgPT4ge1xuXHRcdHRlc3QoJ3JldHVybnMgZW1wdHkgc3RyaW5nIGZvciBlbXB0eSBpbnB1dCcsICgpID0+IHtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChzdW1tYXJpemVTdGRlcnJGb3JFcnJvcignJyksICcnKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3JldHVybnMgZW1wdHkgc3RyaW5nIGZvciB3aGl0ZXNwYWNlLW9ubHkgaW5wdXQnLCAoKSA9PiB7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc3VtbWFyaXplU3RkZXJyRm9yRXJyb3IoJyAgXFxyXFxuXFxyXFxuICAnKSwgJycpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgna2VlcHMgdGhlIGxhc3Qgbm9uLWVtcHR5IGxpbmUgb2YgYSBtdWx0aS1saW5lIHByb2dyZXNzIG1ldGVyJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgcHJvZ3Jlc3MgPSAnVXBkYXRpbmcgZmlsZXM6ICAgMCUgKDcvMTQ4MzQpXFxyVXBkYXRpbmcgZmlsZXM6ICAgMCUgKDE0OS8xNDgzNClcXHInO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHN1bW1hcml6ZVN0ZGVyckZvckVycm9yKHByb2dyZXNzKSwgJ1VwZGF0aW5nIGZpbGVzOiAgIDAlICgxNDkvMTQ4MzQpJyk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdwYXNzZXMgdGhyb3VnaCBhIG5vcm1hbCBzaW5nbGUtbGluZSBtZXNzYWdlJywgKCkgPT4ge1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHN1bW1hcml6ZVN0ZGVyckZvckVycm9yKCdmYXRhbDogaW52YWxpZCByZWZlcmVuY2U6IHhcXG4nKSwgJ2ZhdGFsOiBpbnZhbGlkIHJlZmVyZW5jZTogeCcpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgndHJ1bmNhdGVzIHZlcnkgbG9uZyBsaW5lcyB3aXRoIGFuIGVsbGlwc2lzJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgbG9uZyA9IGBmYXRhbDogJHsnYScucmVwZWF0KDUwMCl9YDtcblx0XHRcdGNvbnN0IHJlc3VsdCA9IHN1bW1hcml6ZVN0ZGVyckZvckVycm9yKGxvbmcpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdC5sZW5ndGgsIDIwMCk7XG5cdFx0XHRhc3NlcnQub2socmVzdWx0LmVuZHNXaXRoKCdcdTIwMjYnKSwgJ2V4cGVjdGVkIHRyYWlsaW5nIGVsbGlwc2lzJyk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHN1aXRlKCdyZXNvbHZlRGlmZkJhc2VCcmFuY2hOYW1lJywgKCkgPT4ge1xuXHRcdHRlc3QoJ3ByZWZlcnMgdGhlIHBlcnNpc3RlZCBiYXNlIGJyYW5jaCwgdGhlbiBnaXQgc3RhdGUsIHRoZW4gdW5kZWZpbmVkJywgKCkgPT4ge1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChcblx0XHRcdFx0W1xuXHRcdFx0XHRcdHJlc29sdmVEaWZmQmFzZUJyYW5jaE5hbWUoJ3BlcnNpc3RlZCcsICdnaXRTdGF0ZScpLFxuXHRcdFx0XHRcdHJlc29sdmVEaWZmQmFzZUJyYW5jaE5hbWUodW5kZWZpbmVkLCAnZ2l0U3RhdGUnKSxcblx0XHRcdFx0XHRyZXNvbHZlRGlmZkJhc2VCcmFuY2hOYW1lKCdwZXJzaXN0ZWQnLCB1bmRlZmluZWQpLFxuXHRcdFx0XHRcdHJlc29sdmVEaWZmQmFzZUJyYW5jaE5hbWUoJ29yaWdpbi9tYWluJywgdW5kZWZpbmVkKSxcblx0XHRcdFx0XHRyZXNvbHZlRGlmZkJhc2VCcmFuY2hOYW1lKCdyZWZzL3JlbW90ZXMvb3JpZ2luL3JlbGVhc2UnLCB1bmRlZmluZWQpLFxuXHRcdFx0XHRcdHJlc29sdmVEaWZmQmFzZUJyYW5jaE5hbWUodW5kZWZpbmVkLCB1bmRlZmluZWQpLFxuXHRcdFx0XHRdLFxuXHRcdFx0XHRbJ3BlcnNpc3RlZCcsICdnaXRTdGF0ZScsICdwZXJzaXN0ZWQnLCAnbWFpbicsICdyZWxlYXNlJywgdW5kZWZpbmVkXSxcblx0XHRcdCk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHN1aXRlKCdwYXJzZVNpbmdsZUxzVHJlZUVudHJ5JywgKCkgPT4ge1xuXHRcdHRlc3QoJ3BhcnNlcyBtb2RlL29pZCBhbmQgdHJlYXRzIGVtcHR5IG91dHB1dCBhcyBhYnNlbnQnLCAoKSA9PiB7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKFxuXHRcdFx0XHRbXG5cdFx0XHRcdFx0cGFyc2VTaW5nbGVMc1RyZWVFbnRyeSgnMTAwNjQ0IGJsb2IgZTY5ZGUyOWJiMmQxZDY0MzRiOGIyOWFlNzc1YWQ4YzJlNDhjNTM5MVxcdGEudHh0XFx4MDAnKSxcblx0XHRcdFx0XHRwYXJzZVNpbmdsZUxzVHJlZUVudHJ5KCcxMDA3NTUgYmxvYiBhYmMxMjNcXHRkaXIvd2l0aCBzcGFjZS50eHRcXHgwMCcpLFxuXHRcdFx0XHRcdHBhcnNlU2luZ2xlTHNUcmVlRW50cnkoJycpLFxuXHRcdFx0XHRcdHBhcnNlU2luZ2xlTHNUcmVlRW50cnkodW5kZWZpbmVkKSxcblx0XHRcdFx0XSxcblx0XHRcdFx0W1xuXHRcdFx0XHRcdHsgbW9kZTogJzEwMDY0NCcsIG9pZDogJ2U2OWRlMjliYjJkMWQ2NDM0YjhiMjlhZTc3NWFkOGMyZTQ4YzUzOTEnIH0sXG5cdFx0XHRcdFx0eyBtb2RlOiAnMTAwNzU1Jywgb2lkOiAnYWJjMTIzJyB9LFxuXHRcdFx0XHRcdHVuZGVmaW5lZCxcblx0XHRcdFx0XHR1bmRlZmluZWQsXG5cdFx0XHRcdF0sXG5cdFx0XHQpO1xuXHRcdH0pO1xuXHR9KTtcbn0pO1xuIl0sCiAgIm1hcHBpbmdzIjogIkFBS0EsT0FBTyxZQUFZO0FBQ25CLFNBQVMsK0NBQStDO0FBQ3hELFNBQVMsZ0JBQWdCLHNCQUFzQiwyQkFBMkIsaUNBQWlDLG1CQUFtQix1QkFBdUIsc0JBQXNCLHdCQUF3QiwyQkFBMkIsa0JBQWtCLHNCQUFzQix3QkFBd0IscUJBQXFCLCtCQUErQjtBQUNsVixT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
