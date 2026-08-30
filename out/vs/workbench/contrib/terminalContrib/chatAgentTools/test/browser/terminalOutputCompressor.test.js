import { deepStrictEqual, ok, strictEqual } from "assert";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../../../base/test/common/utils.js";
import { gitDiffFilter, gitLogFilter, gitStatusFilter, lsFilter, npmInstallFilter, parseCommandHead, testRunnerFilter, buildToolFilter, linterFilter, envFilter, findFilter, grepFilter, treeFilter } from "../../browser/tools/terminalOutputCompressor.js";
import { isProtectedFromCompression } from "../../../../chat/common/tools/toolResultCompressor.js";
suite("parseCommandHead", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  test("returns undefined for empty input", () => {
    strictEqual(parseCommandHead(void 0), void 0);
    strictEqual(parseCommandHead(""), void 0);
    strictEqual(parseCommandHead("   "), void 0);
  });
  test("parses simple commands", () => {
    deepStrictEqual(parseCommandHead("git diff HEAD~5"), { head: "git", sub: "diff" });
    deepStrictEqual(parseCommandHead("ls -la"), { head: "ls", sub: "-la" });
  });
  test("skips env-var prefixes", () => {
    deepStrictEqual(parseCommandHead("CI=1 NODE_ENV=test npm install"), { head: "npm", sub: "install" });
  });
  test("uses only first pipeline segment", () => {
    deepStrictEqual(parseCommandHead("git diff | cat"), { head: "git", sub: "diff" });
  });
  test("skips leading long flags before the subcommand", () => {
    deepStrictEqual(parseCommandHead("git --no-pager diff src/foo.ts"), { head: "git", sub: "diff" });
  });
  test("does not skip short-flag values before the subcommand", () => {
    deepStrictEqual(parseCommandHead("git -C /tmp/repo diff"), { head: "git", sub: "-C" });
  });
});
suite("gitDiffFilter", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  const input = { command: "git diff HEAD~1" };
  test("matches git diff", () => {
    ok(gitDiffFilter.matches("run_in_terminal", input));
  });
  test("matches git --no-pager diff", () => {
    ok(gitDiffFilter.matches("run_in_terminal", { command: "git --no-pager diff src/foo.ts" }));
  });
  test("does not match git status", () => {
    ok(!gitDiffFilter.matches("run_in_terminal", { command: "git status" }));
  });
  test("preserves +/- and hunk headers verbatim", () => {
    const text = [
      "diff --git a/foo.ts b/foo.ts",
      "index abc..def 100644",
      "--- a/foo.ts",
      "+++ b/foo.ts",
      "@@ -1,3 +1,3 @@",
      " unchanged",
      "-old",
      "+new",
      " unchanged"
    ].join("\n");
    const out = gitDiffFilter.apply(text, input);
    ok(out.text.includes("-old"));
    ok(out.text.includes("+new"));
    ok(out.text.includes("@@ -1,3 +1,3 @@"));
    ok(!out.text.includes("index abc..def"));
  });
  test("collapses long unchanged-context runs into a single marker", () => {
    const ctxLines = Array.from({ length: 20 }, (_, i) => ` this is context line number ${i}`);
    const text = [
      "diff --git a/foo.ts b/foo.ts",
      "--- a/foo.ts",
      "+++ b/foo.ts",
      "@@ -1,22 +1,22 @@",
      ...ctxLines,
      "-old",
      "+new"
    ].join("\n");
    const out = gitDiffFilter.apply(text, input);
    ok(out.text.includes(" this is context line number 0"));
    ok(!out.text.includes(" this is context line number 5"));
    ok(!out.text.includes(" this is context line number 19"));
    ok(out.text.includes("19 unchanged context lines omitted"));
    ok(out.text.includes("-old"));
    ok(out.text.includes("+new"));
    strictEqual(out.compressed, true);
  });
  test("omits lockfile diffs", () => {
    const text = [
      "diff --git a/package-lock.json b/package-lock.json",
      "index 1..2 100644",
      "--- a/package-lock.json",
      "+++ b/package-lock.json",
      "@@ -1,3 +1,3 @@",
      "-old",
      "+new"
    ].join("\n");
    const out = gitDiffFilter.apply(text, input);
    ok(out.text.includes("lockfile/snapshot diff omitted"));
    ok(!out.text.includes("-old"));
    strictEqual(out.compressed, true);
  });
  test("does not omit arbitrary .lock file diffs", () => {
    const text = [
      "diff --git a/custom.lock b/custom.lock",
      "--- a/custom.lock",
      "+++ b/custom.lock",
      "@@ -1,2 +1,2 @@",
      " unchanged",
      "-old",
      "+new"
    ].join("\n");
    const out = gitDiffFilter.apply(text, input);
    ok(!out.text.includes("lockfile/snapshot diff omitted"));
    ok(out.text.includes("-old"));
    ok(out.text.includes("+new"));
  });
  test("preserves non-context metadata lines", () => {
    const text = [
      "diff --git a/foo.ts b/foo.ts",
      "new file mode 100644",
      "--- /dev/null",
      "+++ b/foo.ts",
      "@@ -0,0 +2,2 @@",
      "+line 1",
      "+line 2"
    ].join("\n");
    const out = gitDiffFilter.apply(text, input);
    ok(out.text.includes("new file mode 100644"));
  });
  test("rewrites hunk header counts to match emitted body", () => {
    const ctxLines = Array.from({ length: 20 }, (_, i) => ` ctx line ${i}`);
    const text = [
      "diff --git a/foo.ts b/foo.ts",
      "--- a/foo.ts",
      "+++ b/foo.ts",
      "@@ -10,22 +10,22 @@",
      ...ctxLines,
      "-old",
      "+new"
    ].join("\n");
    const out = gitDiffFilter.apply(text, input);
    ok(out.text.includes("@@ -10,2 +10,2 @@"));
    ok(!out.text.includes("@@ -10,22 +10,22 @@"));
  });
});
suite("lsFilter", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  test("matches only when -l flag present", () => {
    ok(!lsFilter.matches("run_in_terminal", { command: "ls" }));
    ok(lsFilter.matches("run_in_terminal", { command: "ls -la" }));
    ok(lsFilter.matches("run_in_terminal", { command: "ls -al src/" }));
  });
  test("strips long-form columns and keeps file names", () => {
    const text = [
      "total 24",
      "-rw-r--r--   1 user  staff   123 Jan 01 12:34 README.md",
      "drwxr-xr-x   5 user  staff   160 Jan 01 12:34 src"
    ].join("\n");
    const out = lsFilter.apply(text, { command: "ls -la" });
    ok(out.text.includes("README.md"));
    ok(out.text.includes("src/"));
    ok(!out.text.includes("user  staff"));
    ok(!out.text.includes("total 24"));
    strictEqual(out.compressed, true);
  });
});
suite("npmInstallFilter", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  test("matches npm install", () => {
    ok(npmInstallFilter.matches("run_in_terminal", { command: "npm install" }));
    ok(npmInstallFilter.matches("run_in_terminal", { command: "npm ci" }));
    ok(!npmInstallFilter.matches("run_in_terminal", { command: "npm test" }));
  });
  test("drops audit and funding noise", () => {
    const text = [
      "added 250 packages in 12s",
      "npm warn deprecated foo@1.0.0: please update",
      "42 packages are looking for funding",
      "  run `npm fund` for details",
      "",
      "3 vulnerabilities (1 low, 2 moderate)",
      "Run `npm audit` for details."
    ].join("\n");
    const out = npmInstallFilter.apply(text, { command: "npm install" });
    ok(out.text.includes("added 250 packages"));
    ok(!out.text.includes("deprecated foo"));
    ok(!out.text.includes("looking for funding"));
    ok(!out.text.includes("npm audit"));
    strictEqual(out.compressed, true);
  });
});
suite("gitDiffFilter - regression", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  test("does not match `git difftool` (only diff/show)", () => {
    ok(!gitDiffFilter.matches("run_in_terminal", { command: "git difftool HEAD~1" }));
    ok(!gitDiffFilter.matches("run_in_terminal", { command: "git difftool --tool=vscode" }));
  });
  test("does not match `git diff-tree` or `git diff-files`", () => {
    ok(!gitDiffFilter.matches("run_in_terminal", { command: "git diff-tree HEAD" }));
    ok(!gitDiffFilter.matches("run_in_terminal", { command: "git diff-files" }));
  });
  test("matches git show", () => {
    ok(gitDiffFilter.matches("run_in_terminal", { command: "git show HEAD" }));
  });
  test("matches inside a pipeline", () => {
    ok(gitDiffFilter.matches("run_in_terminal", { command: "git diff | cat" }));
  });
  test("matches when wrapped in sudo / time", () => {
    ok(gitDiffFilter.matches("run_in_terminal", { command: "sudo time git diff" }));
  });
});
suite("gitLogFilter", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  test("matches git log", () => {
    ok(gitLogFilter.matches("run_in_terminal", { command: "git log" }));
    ok(gitLogFilter.matches("run_in_terminal", { command: "git --no-pager log --oneline -n 20" }));
  });
  test("does not match git logout / unrelated", () => {
    ok(!gitLogFilter.matches("run_in_terminal", { command: "git status" }));
  });
});
suite("gitStatusFilter", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  test("matches git status", () => {
    ok(gitStatusFilter.matches("run_in_terminal", { command: "git status" }));
    ok(gitStatusFilter.matches("run_in_terminal", { command: "git status -s" }));
  });
  test("does not match git stash", () => {
    ok(!gitStatusFilter.matches("run_in_terminal", { command: "git stash list" }));
  });
});
suite("find / grep / tree filters", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  test("findFilter caps output and adds summary", () => {
    const lines = Array.from({ length: 500 }, (_, i) => `./file${i}.ts`).join("\n");
    const out = findFilter.apply(lines, { command: 'find . -name "*.ts"' });
    strictEqual(out.compressed, true);
    ok(out.text.includes("omitted"));
    ok(out.text.includes("./file0.ts"));
  });
  test("grepFilter caps output", () => {
    const lines = Array.from({ length: 500 }, (_, i) => `file${i}.ts:1:match`).join("\n");
    const out = grepFilter.apply(lines, { command: "grep -rn match ." });
    strictEqual(out.compressed, true);
    ok(out.text.includes("omitted"));
  });
  test("treeFilter caps output", () => {
    const lines = Array.from({ length: 500 }, (_, i) => `\u251C\u2500\u2500 file${i}.ts`).join("\n");
    const out = treeFilter.apply(lines, { command: "tree" });
    strictEqual(out.compressed, true);
  });
});
suite("testRunnerFilter", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  test("matches common test runners", () => {
    ok(testRunnerFilter.matches("run_in_terminal", { command: "npm test" }));
    ok(testRunnerFilter.matches("run_in_terminal", { command: "pytest" }));
    ok(testRunnerFilter.matches("run_in_terminal", { command: "cargo test" }));
    ok(testRunnerFilter.matches("run_in_terminal", { command: "go test ./..." }));
    ok(testRunnerFilter.matches("run_in_terminal", { command: "npx vitest run" }));
  });
});
suite("buildToolFilter", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  test("matches build commands", () => {
    ok(buildToolFilter.matches("run_in_terminal", { command: "cargo build" }));
    ok(buildToolFilter.matches("run_in_terminal", { command: "cargo check" }));
    ok(buildToolFilter.matches("run_in_terminal", { command: "go build ./..." }));
    ok(buildToolFilter.matches("run_in_terminal", { command: "make" }));
    ok(buildToolFilter.matches("run_in_terminal", { command: "tsc -p ." }));
  });
});
suite("linterFilter", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  test("matches linters", () => {
    ok(linterFilter.matches("run_in_terminal", { command: "eslint src" }));
    ok(linterFilter.matches("run_in_terminal", { command: "ruff check ." }));
    ok(linterFilter.matches("run_in_terminal", { command: "cargo clippy" }));
  });
});
suite("envFilter", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  test("matches env / printenv with no args", () => {
    ok(envFilter.matches("run_in_terminal", { command: "env" }));
    ok(envFilter.matches("run_in_terminal", { command: "printenv" }));
  });
  test("sorts and dedupes lines", () => {
    const text = ["ZSH=/bin/zsh", "PATH=/usr/bin", "PATH=/usr/bin", "HOME=/home/u"].join("\n");
    const out = envFilter.apply(text, { command: "env" });
    strictEqual(out.compressed, true);
    const lines = out.text.split("\n");
    ok(lines.indexOf("HOME=/home/u") < lines.indexOf("PATH=/usr/bin"));
    ok(lines.indexOf("PATH=/usr/bin") < lines.indexOf("ZSH=/bin/zsh"));
    strictEqual(lines.filter((l) => l === "PATH=/usr/bin").length, 1);
  });
});
suite("isProtectedFromCompression", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  test("protects JSON object output", () => {
    ok(isProtectedFromCompression('{"a":1,"b":[1,2,3]}'));
  });
  test("protects JSON array output", () => {
    ok(isProtectedFromCompression('[1, 2, 3, {"k":"v"}]'));
  });
  test("protects YAML headers", () => {
    ok(isProtectedFromCompression("---\nfoo: bar\nbaz: 1\n"));
  });
  test("protects TOML headers", () => {
    ok(isProtectedFromCompression('[package]\nname = "x"\n'));
  });
  test("does not protect plain text", () => {
    ok(!isProtectedFromCompression("hello world\nsome output\n"));
  });
  test("does not protect malformed JSON", () => {
    ok(!isProtectedFromCompression("{ this is { not json }"));
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXHRlcm1pbmFsQ29udHJpYlxcY2hhdEFnZW50VG9vbHNcXHRlc3RcXGJyb3dzZXJcXHRlcm1pbmFsT3V0cHV0Q29tcHJlc3Nvci50ZXN0LnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IHsgZGVlcFN0cmljdEVxdWFsLCBvaywgc3RyaWN0RXF1YWwgfSBmcm9tICdhc3NlcnQnO1xuaW1wb3J0IHsgZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS90ZXN0L2NvbW1vbi91dGlscy5qcyc7XG5pbXBvcnQgeyBnaXREaWZmRmlsdGVyLCBnaXRMb2dGaWx0ZXIsIGdpdFN0YXR1c0ZpbHRlciwgbHNGaWx0ZXIsIG5wbUluc3RhbGxGaWx0ZXIsIHBhcnNlQ29tbWFuZEhlYWQsIHRlc3RSdW5uZXJGaWx0ZXIsIGJ1aWxkVG9vbEZpbHRlciwgbGludGVyRmlsdGVyLCBlbnZGaWx0ZXIsIGZpbmRGaWx0ZXIsIGdyZXBGaWx0ZXIsIHRyZWVGaWx0ZXIgfSBmcm9tICcuLi8uLi9icm93c2VyL3Rvb2xzL3Rlcm1pbmFsT3V0cHV0Q29tcHJlc3Nvci5qcyc7XG5pbXBvcnQgeyBpc1Byb3RlY3RlZEZyb21Db21wcmVzc2lvbiB9IGZyb20gJy4uLy4uLy4uLy4uL2NoYXQvY29tbW9uL3Rvb2xzL3Rvb2xSZXN1bHRDb21wcmVzc29yLmpzJztcblxuc3VpdGUoJ3BhcnNlQ29tbWFuZEhlYWQnLCAoKSA9PiB7XG5cdGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSgpO1xuXG5cdHRlc3QoJ3JldHVybnMgdW5kZWZpbmVkIGZvciBlbXB0eSBpbnB1dCcsICgpID0+IHtcblx0XHRzdHJpY3RFcXVhbChwYXJzZUNvbW1hbmRIZWFkKHVuZGVmaW5lZCksIHVuZGVmaW5lZCk7XG5cdFx0c3RyaWN0RXF1YWwocGFyc2VDb21tYW5kSGVhZCgnJyksIHVuZGVmaW5lZCk7XG5cdFx0c3RyaWN0RXF1YWwocGFyc2VDb21tYW5kSGVhZCgnICAgJyksIHVuZGVmaW5lZCk7XG5cdH0pO1xuXG5cdHRlc3QoJ3BhcnNlcyBzaW1wbGUgY29tbWFuZHMnLCAoKSA9PiB7XG5cdFx0ZGVlcFN0cmljdEVxdWFsKHBhcnNlQ29tbWFuZEhlYWQoJ2dpdCBkaWZmIEhFQUR+NScpLCB7IGhlYWQ6ICdnaXQnLCBzdWI6ICdkaWZmJyB9KTtcblx0XHRkZWVwU3RyaWN0RXF1YWwocGFyc2VDb21tYW5kSGVhZCgnbHMgLWxhJyksIHsgaGVhZDogJ2xzJywgc3ViOiAnLWxhJyB9KTtcblx0fSk7XG5cblx0dGVzdCgnc2tpcHMgZW52LXZhciBwcmVmaXhlcycsICgpID0+IHtcblx0XHRkZWVwU3RyaWN0RXF1YWwocGFyc2VDb21tYW5kSGVhZCgnQ0k9MSBOT0RFX0VOVj10ZXN0IG5wbSBpbnN0YWxsJyksIHsgaGVhZDogJ25wbScsIHN1YjogJ2luc3RhbGwnIH0pO1xuXHR9KTtcblxuXHR0ZXN0KCd1c2VzIG9ubHkgZmlyc3QgcGlwZWxpbmUgc2VnbWVudCcsICgpID0+IHtcblx0XHRkZWVwU3RyaWN0RXF1YWwocGFyc2VDb21tYW5kSGVhZCgnZ2l0IGRpZmYgfCBjYXQnKSwgeyBoZWFkOiAnZ2l0Jywgc3ViOiAnZGlmZicgfSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3NraXBzIGxlYWRpbmcgbG9uZyBmbGFncyBiZWZvcmUgdGhlIHN1YmNvbW1hbmQnLCAoKSA9PiB7XG5cdFx0ZGVlcFN0cmljdEVxdWFsKHBhcnNlQ29tbWFuZEhlYWQoJ2dpdCAtLW5vLXBhZ2VyIGRpZmYgc3JjL2Zvby50cycpLCB7IGhlYWQ6ICdnaXQnLCBzdWI6ICdkaWZmJyB9KTtcblx0fSk7XG5cblx0dGVzdCgnZG9lcyBub3Qgc2tpcCBzaG9ydC1mbGFnIHZhbHVlcyBiZWZvcmUgdGhlIHN1YmNvbW1hbmQnLCAoKSA9PiB7XG5cdFx0ZGVlcFN0cmljdEVxdWFsKHBhcnNlQ29tbWFuZEhlYWQoJ2dpdCAtQyAvdG1wL3JlcG8gZGlmZicpLCB7IGhlYWQ6ICdnaXQnLCBzdWI6ICctQycgfSk7XG5cdH0pO1xufSk7XG5cbnN1aXRlKCdnaXREaWZmRmlsdGVyJywgKCkgPT4ge1xuXHRlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUoKTtcblxuXHRjb25zdCBpbnB1dCA9IHsgY29tbWFuZDogJ2dpdCBkaWZmIEhFQUR+MScgfTtcblxuXHR0ZXN0KCdtYXRjaGVzIGdpdCBkaWZmJywgKCkgPT4ge1xuXHRcdG9rKGdpdERpZmZGaWx0ZXIubWF0Y2hlcygncnVuX2luX3Rlcm1pbmFsJywgaW5wdXQpKTtcblx0fSk7XG5cblx0dGVzdCgnbWF0Y2hlcyBnaXQgLS1uby1wYWdlciBkaWZmJywgKCkgPT4ge1xuXHRcdG9rKGdpdERpZmZGaWx0ZXIubWF0Y2hlcygncnVuX2luX3Rlcm1pbmFsJywgeyBjb21tYW5kOiAnZ2l0IC0tbm8tcGFnZXIgZGlmZiBzcmMvZm9vLnRzJyB9KSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2RvZXMgbm90IG1hdGNoIGdpdCBzdGF0dXMnLCAoKSA9PiB7XG5cdFx0b2soIWdpdERpZmZGaWx0ZXIubWF0Y2hlcygncnVuX2luX3Rlcm1pbmFsJywgeyBjb21tYW5kOiAnZ2l0IHN0YXR1cycgfSkpO1xuXHR9KTtcblxuXHR0ZXN0KCdwcmVzZXJ2ZXMgKy8tIGFuZCBodW5rIGhlYWRlcnMgdmVyYmF0aW0nLCAoKSA9PiB7XG5cdFx0Y29uc3QgdGV4dCA9IFtcblx0XHRcdCdkaWZmIC0tZ2l0IGEvZm9vLnRzIGIvZm9vLnRzJyxcblx0XHRcdCdpbmRleCBhYmMuLmRlZiAxMDA2NDQnLFxuXHRcdFx0Jy0tLSBhL2Zvby50cycsXG5cdFx0XHQnKysrIGIvZm9vLnRzJyxcblx0XHRcdCdAQCAtMSwzICsxLDMgQEAnLFxuXHRcdFx0JyB1bmNoYW5nZWQnLFxuXHRcdFx0Jy1vbGQnLFxuXHRcdFx0JytuZXcnLFxuXHRcdFx0JyB1bmNoYW5nZWQnLFxuXHRcdF0uam9pbignXFxuJyk7XG5cdFx0Y29uc3Qgb3V0ID0gZ2l0RGlmZkZpbHRlci5hcHBseSh0ZXh0LCBpbnB1dCk7XG5cdFx0b2sob3V0LnRleHQuaW5jbHVkZXMoJy1vbGQnKSk7XG5cdFx0b2sob3V0LnRleHQuaW5jbHVkZXMoJytuZXcnKSk7XG5cdFx0b2sob3V0LnRleHQuaW5jbHVkZXMoJ0BAIC0xLDMgKzEsMyBAQCcpKTtcblx0XHRvayghb3V0LnRleHQuaW5jbHVkZXMoJ2luZGV4IGFiYy4uZGVmJykpO1xuXHR9KTtcblxuXHR0ZXN0KCdjb2xsYXBzZXMgbG9uZyB1bmNoYW5nZWQtY29udGV4dCBydW5zIGludG8gYSBzaW5nbGUgbWFya2VyJywgKCkgPT4ge1xuXHRcdGNvbnN0IGN0eExpbmVzID0gQXJyYXkuZnJvbSh7IGxlbmd0aDogMjAgfSwgKF8sIGkpID0+IGAgdGhpcyBpcyBjb250ZXh0IGxpbmUgbnVtYmVyICR7aX1gKTtcblx0XHRjb25zdCB0ZXh0ID0gW1xuXHRcdFx0J2RpZmYgLS1naXQgYS9mb28udHMgYi9mb28udHMnLFxuXHRcdFx0Jy0tLSBhL2Zvby50cycsXG5cdFx0XHQnKysrIGIvZm9vLnRzJyxcblx0XHRcdCdAQCAtMSwyMiArMSwyMiBAQCcsXG5cdFx0XHQuLi5jdHhMaW5lcyxcblx0XHRcdCctb2xkJyxcblx0XHRcdCcrbmV3Jyxcblx0XHRdLmpvaW4oJ1xcbicpO1xuXHRcdGNvbnN0IG91dCA9IGdpdERpZmZGaWx0ZXIuYXBwbHkodGV4dCwgaW5wdXQpO1xuXHRcdG9rKG91dC50ZXh0LmluY2x1ZGVzKCcgdGhpcyBpcyBjb250ZXh0IGxpbmUgbnVtYmVyIDAnKSk7XG5cdFx0b2soIW91dC50ZXh0LmluY2x1ZGVzKCcgdGhpcyBpcyBjb250ZXh0IGxpbmUgbnVtYmVyIDUnKSk7XG5cdFx0b2soIW91dC50ZXh0LmluY2x1ZGVzKCcgdGhpcyBpcyBjb250ZXh0IGxpbmUgbnVtYmVyIDE5JykpO1xuXHRcdG9rKG91dC50ZXh0LmluY2x1ZGVzKCcxOSB1bmNoYW5nZWQgY29udGV4dCBsaW5lcyBvbWl0dGVkJykpO1xuXHRcdG9rKG91dC50ZXh0LmluY2x1ZGVzKCctb2xkJykpO1xuXHRcdG9rKG91dC50ZXh0LmluY2x1ZGVzKCcrbmV3JykpO1xuXHRcdHN0cmljdEVxdWFsKG91dC5jb21wcmVzc2VkLCB0cnVlKTtcblx0fSk7XG5cblx0dGVzdCgnb21pdHMgbG9ja2ZpbGUgZGlmZnMnLCAoKSA9PiB7XG5cdFx0Y29uc3QgdGV4dCA9IFtcblx0XHRcdCdkaWZmIC0tZ2l0IGEvcGFja2FnZS1sb2NrLmpzb24gYi9wYWNrYWdlLWxvY2suanNvbicsXG5cdFx0XHQnaW5kZXggMS4uMiAxMDA2NDQnLFxuXHRcdFx0Jy0tLSBhL3BhY2thZ2UtbG9jay5qc29uJyxcblx0XHRcdCcrKysgYi9wYWNrYWdlLWxvY2suanNvbicsXG5cdFx0XHQnQEAgLTEsMyArMSwzIEBAJyxcblx0XHRcdCctb2xkJyxcblx0XHRcdCcrbmV3Jyxcblx0XHRdLmpvaW4oJ1xcbicpO1xuXHRcdGNvbnN0IG91dCA9IGdpdERpZmZGaWx0ZXIuYXBwbHkodGV4dCwgaW5wdXQpO1xuXHRcdG9rKG91dC50ZXh0LmluY2x1ZGVzKCdsb2NrZmlsZS9zbmFwc2hvdCBkaWZmIG9taXR0ZWQnKSk7XG5cdFx0b2soIW91dC50ZXh0LmluY2x1ZGVzKCctb2xkJykpO1xuXHRcdHN0cmljdEVxdWFsKG91dC5jb21wcmVzc2VkLCB0cnVlKTtcblx0fSk7XG5cblx0dGVzdCgnZG9lcyBub3Qgb21pdCBhcmJpdHJhcnkgLmxvY2sgZmlsZSBkaWZmcycsICgpID0+IHtcblx0XHRjb25zdCB0ZXh0ID0gW1xuXHRcdFx0J2RpZmYgLS1naXQgYS9jdXN0b20ubG9jayBiL2N1c3RvbS5sb2NrJyxcblx0XHRcdCctLS0gYS9jdXN0b20ubG9jaycsXG5cdFx0XHQnKysrIGIvY3VzdG9tLmxvY2snLFxuXHRcdFx0J0BAIC0xLDIgKzEsMiBAQCcsXG5cdFx0XHQnIHVuY2hhbmdlZCcsXG5cdFx0XHQnLW9sZCcsXG5cdFx0XHQnK25ldycsXG5cdFx0XS5qb2luKCdcXG4nKTtcblx0XHRjb25zdCBvdXQgPSBnaXREaWZmRmlsdGVyLmFwcGx5KHRleHQsIGlucHV0KTtcblx0XHRvayghb3V0LnRleHQuaW5jbHVkZXMoJ2xvY2tmaWxlL3NuYXBzaG90IGRpZmYgb21pdHRlZCcpKTtcblx0XHRvayhvdXQudGV4dC5pbmNsdWRlcygnLW9sZCcpKTtcblx0XHRvayhvdXQudGV4dC5pbmNsdWRlcygnK25ldycpKTtcblx0fSk7XG5cblx0dGVzdCgncHJlc2VydmVzIG5vbi1jb250ZXh0IG1ldGFkYXRhIGxpbmVzJywgKCkgPT4ge1xuXHRcdGNvbnN0IHRleHQgPSBbXG5cdFx0XHQnZGlmZiAtLWdpdCBhL2Zvby50cyBiL2Zvby50cycsXG5cdFx0XHQnbmV3IGZpbGUgbW9kZSAxMDA2NDQnLFxuXHRcdFx0Jy0tLSAvZGV2L251bGwnLFxuXHRcdFx0JysrKyBiL2Zvby50cycsXG5cdFx0XHQnQEAgLTAsMCArMiwyIEBAJyxcblx0XHRcdCcrbGluZSAxJyxcblx0XHRcdCcrbGluZSAyJyxcblx0XHRdLmpvaW4oJ1xcbicpO1xuXHRcdGNvbnN0IG91dCA9IGdpdERpZmZGaWx0ZXIuYXBwbHkodGV4dCwgaW5wdXQpO1xuXHRcdG9rKG91dC50ZXh0LmluY2x1ZGVzKCduZXcgZmlsZSBtb2RlIDEwMDY0NCcpKTtcblx0fSk7XG5cblx0dGVzdCgncmV3cml0ZXMgaHVuayBoZWFkZXIgY291bnRzIHRvIG1hdGNoIGVtaXR0ZWQgYm9keScsICgpID0+IHtcblx0XHRjb25zdCBjdHhMaW5lcyA9IEFycmF5LmZyb20oeyBsZW5ndGg6IDIwIH0sIChfLCBpKSA9PiBgIGN0eCBsaW5lICR7aX1gKTtcblx0XHRjb25zdCB0ZXh0ID0gW1xuXHRcdFx0J2RpZmYgLS1naXQgYS9mb28udHMgYi9mb28udHMnLFxuXHRcdFx0Jy0tLSBhL2Zvby50cycsXG5cdFx0XHQnKysrIGIvZm9vLnRzJyxcblx0XHRcdCdAQCAtMTAsMjIgKzEwLDIyIEBAJyxcblx0XHRcdC4uLmN0eExpbmVzLFxuXHRcdFx0Jy1vbGQnLFxuXHRcdFx0JytuZXcnLFxuXHRcdF0uam9pbignXFxuJyk7XG5cdFx0Y29uc3Qgb3V0ID0gZ2l0RGlmZkZpbHRlci5hcHBseSh0ZXh0LCBpbnB1dCk7XG5cdFx0b2sob3V0LnRleHQuaW5jbHVkZXMoJ0BAIC0xMCwyICsxMCwyIEBAJykpO1xuXHRcdG9rKCFvdXQudGV4dC5pbmNsdWRlcygnQEAgLTEwLDIyICsxMCwyMiBAQCcpKTtcblx0fSk7XG59KTtcblxuc3VpdGUoJ2xzRmlsdGVyJywgKCkgPT4ge1xuXHRlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUoKTtcblxuXHR0ZXN0KCdtYXRjaGVzIG9ubHkgd2hlbiAtbCBmbGFnIHByZXNlbnQnLCAoKSA9PiB7XG5cdFx0b2soIWxzRmlsdGVyLm1hdGNoZXMoJ3J1bl9pbl90ZXJtaW5hbCcsIHsgY29tbWFuZDogJ2xzJyB9KSk7XG5cdFx0b2sobHNGaWx0ZXIubWF0Y2hlcygncnVuX2luX3Rlcm1pbmFsJywgeyBjb21tYW5kOiAnbHMgLWxhJyB9KSk7XG5cdFx0b2sobHNGaWx0ZXIubWF0Y2hlcygncnVuX2luX3Rlcm1pbmFsJywgeyBjb21tYW5kOiAnbHMgLWFsIHNyYy8nIH0pKTtcblx0fSk7XG5cblx0dGVzdCgnc3RyaXBzIGxvbmctZm9ybSBjb2x1bW5zIGFuZCBrZWVwcyBmaWxlIG5hbWVzJywgKCkgPT4ge1xuXHRcdGNvbnN0IHRleHQgPSBbXG5cdFx0XHQndG90YWwgMjQnLFxuXHRcdFx0Jy1ydy1yLS1yLS0gICAxIHVzZXIgIHN0YWZmICAgMTIzIEphbiAwMSAxMjozNCBSRUFETUUubWQnLFxuXHRcdFx0J2Ryd3hyLXhyLXggICA1IHVzZXIgIHN0YWZmICAgMTYwIEphbiAwMSAxMjozNCBzcmMnLFxuXHRcdF0uam9pbignXFxuJyk7XG5cdFx0Y29uc3Qgb3V0ID0gbHNGaWx0ZXIuYXBwbHkodGV4dCwgeyBjb21tYW5kOiAnbHMgLWxhJyB9KTtcblx0XHRvayhvdXQudGV4dC5pbmNsdWRlcygnUkVBRE1FLm1kJykpO1xuXHRcdG9rKG91dC50ZXh0LmluY2x1ZGVzKCdzcmMvJykpO1xuXHRcdG9rKCFvdXQudGV4dC5pbmNsdWRlcygndXNlciAgc3RhZmYnKSk7XG5cdFx0b2soIW91dC50ZXh0LmluY2x1ZGVzKCd0b3RhbCAyNCcpKTtcblx0XHRzdHJpY3RFcXVhbChvdXQuY29tcHJlc3NlZCwgdHJ1ZSk7XG5cdH0pO1xufSk7XG5cbnN1aXRlKCducG1JbnN0YWxsRmlsdGVyJywgKCkgPT4ge1xuXHRlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUoKTtcblxuXHR0ZXN0KCdtYXRjaGVzIG5wbSBpbnN0YWxsJywgKCkgPT4ge1xuXHRcdG9rKG5wbUluc3RhbGxGaWx0ZXIubWF0Y2hlcygncnVuX2luX3Rlcm1pbmFsJywgeyBjb21tYW5kOiAnbnBtIGluc3RhbGwnIH0pKTtcblx0XHRvayhucG1JbnN0YWxsRmlsdGVyLm1hdGNoZXMoJ3J1bl9pbl90ZXJtaW5hbCcsIHsgY29tbWFuZDogJ25wbSBjaScgfSkpO1xuXHRcdG9rKCFucG1JbnN0YWxsRmlsdGVyLm1hdGNoZXMoJ3J1bl9pbl90ZXJtaW5hbCcsIHsgY29tbWFuZDogJ25wbSB0ZXN0JyB9KSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2Ryb3BzIGF1ZGl0IGFuZCBmdW5kaW5nIG5vaXNlJywgKCkgPT4ge1xuXHRcdGNvbnN0IHRleHQgPSBbXG5cdFx0XHQnYWRkZWQgMjUwIHBhY2thZ2VzIGluIDEycycsXG5cdFx0XHQnbnBtIHdhcm4gZGVwcmVjYXRlZCBmb29AMS4wLjA6IHBsZWFzZSB1cGRhdGUnLFxuXHRcdFx0JzQyIHBhY2thZ2VzIGFyZSBsb29raW5nIGZvciBmdW5kaW5nJyxcblx0XHRcdCcgIHJ1biBgbnBtIGZ1bmRgIGZvciBkZXRhaWxzJyxcblx0XHRcdCcnLFxuXHRcdFx0JzMgdnVsbmVyYWJpbGl0aWVzICgxIGxvdywgMiBtb2RlcmF0ZSknLFxuXHRcdFx0J1J1biBgbnBtIGF1ZGl0YCBmb3IgZGV0YWlscy4nLFxuXHRcdF0uam9pbignXFxuJyk7XG5cdFx0Y29uc3Qgb3V0ID0gbnBtSW5zdGFsbEZpbHRlci5hcHBseSh0ZXh0LCB7IGNvbW1hbmQ6ICducG0gaW5zdGFsbCcgfSk7XG5cdFx0b2sob3V0LnRleHQuaW5jbHVkZXMoJ2FkZGVkIDI1MCBwYWNrYWdlcycpKTtcblx0XHRvayghb3V0LnRleHQuaW5jbHVkZXMoJ2RlcHJlY2F0ZWQgZm9vJykpO1xuXHRcdG9rKCFvdXQudGV4dC5pbmNsdWRlcygnbG9va2luZyBmb3IgZnVuZGluZycpKTtcblx0XHRvayghb3V0LnRleHQuaW5jbHVkZXMoJ25wbSBhdWRpdCcpKTtcblx0XHRzdHJpY3RFcXVhbChvdXQuY29tcHJlc3NlZCwgdHJ1ZSk7XG5cdH0pO1xufSk7XG5cbnN1aXRlKCdnaXREaWZmRmlsdGVyIC0gcmVncmVzc2lvbicsICgpID0+IHtcblx0ZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlKCk7XG5cblx0dGVzdCgnZG9lcyBub3QgbWF0Y2ggYGdpdCBkaWZmdG9vbGAgKG9ubHkgZGlmZi9zaG93KScsICgpID0+IHtcblx0XHRvayghZ2l0RGlmZkZpbHRlci5tYXRjaGVzKCdydW5faW5fdGVybWluYWwnLCB7IGNvbW1hbmQ6ICdnaXQgZGlmZnRvb2wgSEVBRH4xJyB9KSk7XG5cdFx0b2soIWdpdERpZmZGaWx0ZXIubWF0Y2hlcygncnVuX2luX3Rlcm1pbmFsJywgeyBjb21tYW5kOiAnZ2l0IGRpZmZ0b29sIC0tdG9vbD12c2NvZGUnIH0pKTtcblx0fSk7XG5cblx0dGVzdCgnZG9lcyBub3QgbWF0Y2ggYGdpdCBkaWZmLXRyZWVgIG9yIGBnaXQgZGlmZi1maWxlc2AnLCAoKSA9PiB7XG5cdFx0b2soIWdpdERpZmZGaWx0ZXIubWF0Y2hlcygncnVuX2luX3Rlcm1pbmFsJywgeyBjb21tYW5kOiAnZ2l0IGRpZmYtdHJlZSBIRUFEJyB9KSk7XG5cdFx0b2soIWdpdERpZmZGaWx0ZXIubWF0Y2hlcygncnVuX2luX3Rlcm1pbmFsJywgeyBjb21tYW5kOiAnZ2l0IGRpZmYtZmlsZXMnIH0pKTtcblx0fSk7XG5cblx0dGVzdCgnbWF0Y2hlcyBnaXQgc2hvdycsICgpID0+IHtcblx0XHRvayhnaXREaWZmRmlsdGVyLm1hdGNoZXMoJ3J1bl9pbl90ZXJtaW5hbCcsIHsgY29tbWFuZDogJ2dpdCBzaG93IEhFQUQnIH0pKTtcblx0fSk7XG5cblx0dGVzdCgnbWF0Y2hlcyBpbnNpZGUgYSBwaXBlbGluZScsICgpID0+IHtcblx0XHRvayhnaXREaWZmRmlsdGVyLm1hdGNoZXMoJ3J1bl9pbl90ZXJtaW5hbCcsIHsgY29tbWFuZDogJ2dpdCBkaWZmIHwgY2F0JyB9KSk7XG5cdH0pO1xuXG5cdHRlc3QoJ21hdGNoZXMgd2hlbiB3cmFwcGVkIGluIHN1ZG8gLyB0aW1lJywgKCkgPT4ge1xuXHRcdG9rKGdpdERpZmZGaWx0ZXIubWF0Y2hlcygncnVuX2luX3Rlcm1pbmFsJywgeyBjb21tYW5kOiAnc3VkbyB0aW1lIGdpdCBkaWZmJyB9KSk7XG5cdH0pO1xufSk7XG5cbnN1aXRlKCdnaXRMb2dGaWx0ZXInLCAoKSA9PiB7XG5cdGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSgpO1xuXG5cdHRlc3QoJ21hdGNoZXMgZ2l0IGxvZycsICgpID0+IHtcblx0XHRvayhnaXRMb2dGaWx0ZXIubWF0Y2hlcygncnVuX2luX3Rlcm1pbmFsJywgeyBjb21tYW5kOiAnZ2l0IGxvZycgfSkpO1xuXHRcdG9rKGdpdExvZ0ZpbHRlci5tYXRjaGVzKCdydW5faW5fdGVybWluYWwnLCB7IGNvbW1hbmQ6ICdnaXQgLS1uby1wYWdlciBsb2cgLS1vbmVsaW5lIC1uIDIwJyB9KSk7XG5cdH0pO1xuXHR0ZXN0KCdkb2VzIG5vdCBtYXRjaCBnaXQgbG9nb3V0IC8gdW5yZWxhdGVkJywgKCkgPT4ge1xuXHRcdG9rKCFnaXRMb2dGaWx0ZXIubWF0Y2hlcygncnVuX2luX3Rlcm1pbmFsJywgeyBjb21tYW5kOiAnZ2l0IHN0YXR1cycgfSkpO1xuXHR9KTtcbn0pO1xuXG5zdWl0ZSgnZ2l0U3RhdHVzRmlsdGVyJywgKCkgPT4ge1xuXHRlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUoKTtcblxuXHR0ZXN0KCdtYXRjaGVzIGdpdCBzdGF0dXMnLCAoKSA9PiB7XG5cdFx0b2soZ2l0U3RhdHVzRmlsdGVyLm1hdGNoZXMoJ3J1bl9pbl90ZXJtaW5hbCcsIHsgY29tbWFuZDogJ2dpdCBzdGF0dXMnIH0pKTtcblx0XHRvayhnaXRTdGF0dXNGaWx0ZXIubWF0Y2hlcygncnVuX2luX3Rlcm1pbmFsJywgeyBjb21tYW5kOiAnZ2l0IHN0YXR1cyAtcycgfSkpO1xuXHR9KTtcblx0dGVzdCgnZG9lcyBub3QgbWF0Y2ggZ2l0IHN0YXNoJywgKCkgPT4ge1xuXHRcdG9rKCFnaXRTdGF0dXNGaWx0ZXIubWF0Y2hlcygncnVuX2luX3Rlcm1pbmFsJywgeyBjb21tYW5kOiAnZ2l0IHN0YXNoIGxpc3QnIH0pKTtcblx0fSk7XG59KTtcblxuc3VpdGUoJ2ZpbmQgLyBncmVwIC8gdHJlZSBmaWx0ZXJzJywgKCkgPT4ge1xuXHRlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUoKTtcblxuXHR0ZXN0KCdmaW5kRmlsdGVyIGNhcHMgb3V0cHV0IGFuZCBhZGRzIHN1bW1hcnknLCAoKSA9PiB7XG5cdFx0Y29uc3QgbGluZXMgPSBBcnJheS5mcm9tKHsgbGVuZ3RoOiA1MDAgfSwgKF8sIGkpID0+IGAuL2ZpbGUke2l9LnRzYCkuam9pbignXFxuJyk7XG5cdFx0Y29uc3Qgb3V0ID0gZmluZEZpbHRlci5hcHBseShsaW5lcywgeyBjb21tYW5kOiAnZmluZCAuIC1uYW1lIFwiKi50c1wiJyB9KTtcblx0XHRzdHJpY3RFcXVhbChvdXQuY29tcHJlc3NlZCwgdHJ1ZSk7XG5cdFx0b2sob3V0LnRleHQuaW5jbHVkZXMoJ29taXR0ZWQnKSk7XG5cdFx0Ly8gRmlyc3QgZmlsZSBzaG91bGQgc3RpbGwgYXBwZWFyLlxuXHRcdG9rKG91dC50ZXh0LmluY2x1ZGVzKCcuL2ZpbGUwLnRzJykpO1xuXHR9KTtcblxuXHR0ZXN0KCdncmVwRmlsdGVyIGNhcHMgb3V0cHV0JywgKCkgPT4ge1xuXHRcdGNvbnN0IGxpbmVzID0gQXJyYXkuZnJvbSh7IGxlbmd0aDogNTAwIH0sIChfLCBpKSA9PiBgZmlsZSR7aX0udHM6MTptYXRjaGApLmpvaW4oJ1xcbicpO1xuXHRcdGNvbnN0IG91dCA9IGdyZXBGaWx0ZXIuYXBwbHkobGluZXMsIHsgY29tbWFuZDogJ2dyZXAgLXJuIG1hdGNoIC4nIH0pO1xuXHRcdHN0cmljdEVxdWFsKG91dC5jb21wcmVzc2VkLCB0cnVlKTtcblx0XHRvayhvdXQudGV4dC5pbmNsdWRlcygnb21pdHRlZCcpKTtcblx0fSk7XG5cblx0dGVzdCgndHJlZUZpbHRlciBjYXBzIG91dHB1dCcsICgpID0+IHtcblx0XHRjb25zdCBsaW5lcyA9IEFycmF5LmZyb20oeyBsZW5ndGg6IDUwMCB9LCAoXywgaSkgPT4gYFx1MjUxQ1x1MjUwMFx1MjUwMCBmaWxlJHtpfS50c2ApLmpvaW4oJ1xcbicpO1xuXHRcdGNvbnN0IG91dCA9IHRyZWVGaWx0ZXIuYXBwbHkobGluZXMsIHsgY29tbWFuZDogJ3RyZWUnIH0pO1xuXHRcdHN0cmljdEVxdWFsKG91dC5jb21wcmVzc2VkLCB0cnVlKTtcblx0fSk7XG59KTtcblxuc3VpdGUoJ3Rlc3RSdW5uZXJGaWx0ZXInLCAoKSA9PiB7XG5cdGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSgpO1xuXG5cdHRlc3QoJ21hdGNoZXMgY29tbW9uIHRlc3QgcnVubmVycycsICgpID0+IHtcblx0XHRvayh0ZXN0UnVubmVyRmlsdGVyLm1hdGNoZXMoJ3J1bl9pbl90ZXJtaW5hbCcsIHsgY29tbWFuZDogJ25wbSB0ZXN0JyB9KSk7XG5cdFx0b2sodGVzdFJ1bm5lckZpbHRlci5tYXRjaGVzKCdydW5faW5fdGVybWluYWwnLCB7IGNvbW1hbmQ6ICdweXRlc3QnIH0pKTtcblx0XHRvayh0ZXN0UnVubmVyRmlsdGVyLm1hdGNoZXMoJ3J1bl9pbl90ZXJtaW5hbCcsIHsgY29tbWFuZDogJ2NhcmdvIHRlc3QnIH0pKTtcblx0XHRvayh0ZXN0UnVubmVyRmlsdGVyLm1hdGNoZXMoJ3J1bl9pbl90ZXJtaW5hbCcsIHsgY29tbWFuZDogJ2dvIHRlc3QgLi8uLi4nIH0pKTtcblx0XHRvayh0ZXN0UnVubmVyRmlsdGVyLm1hdGNoZXMoJ3J1bl9pbl90ZXJtaW5hbCcsIHsgY29tbWFuZDogJ25weCB2aXRlc3QgcnVuJyB9KSk7XG5cdH0pO1xufSk7XG5cbnN1aXRlKCdidWlsZFRvb2xGaWx0ZXInLCAoKSA9PiB7XG5cdGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSgpO1xuXG5cdHRlc3QoJ21hdGNoZXMgYnVpbGQgY29tbWFuZHMnLCAoKSA9PiB7XG5cdFx0b2soYnVpbGRUb29sRmlsdGVyLm1hdGNoZXMoJ3J1bl9pbl90ZXJtaW5hbCcsIHsgY29tbWFuZDogJ2NhcmdvIGJ1aWxkJyB9KSk7XG5cdFx0b2soYnVpbGRUb29sRmlsdGVyLm1hdGNoZXMoJ3J1bl9pbl90ZXJtaW5hbCcsIHsgY29tbWFuZDogJ2NhcmdvIGNoZWNrJyB9KSk7XG5cdFx0b2soYnVpbGRUb29sRmlsdGVyLm1hdGNoZXMoJ3J1bl9pbl90ZXJtaW5hbCcsIHsgY29tbWFuZDogJ2dvIGJ1aWxkIC4vLi4uJyB9KSk7XG5cdFx0b2soYnVpbGRUb29sRmlsdGVyLm1hdGNoZXMoJ3J1bl9pbl90ZXJtaW5hbCcsIHsgY29tbWFuZDogJ21ha2UnIH0pKTtcblx0XHRvayhidWlsZFRvb2xGaWx0ZXIubWF0Y2hlcygncnVuX2luX3Rlcm1pbmFsJywgeyBjb21tYW5kOiAndHNjIC1wIC4nIH0pKTtcblx0fSk7XG59KTtcblxuc3VpdGUoJ2xpbnRlckZpbHRlcicsICgpID0+IHtcblx0ZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlKCk7XG5cblx0dGVzdCgnbWF0Y2hlcyBsaW50ZXJzJywgKCkgPT4ge1xuXHRcdG9rKGxpbnRlckZpbHRlci5tYXRjaGVzKCdydW5faW5fdGVybWluYWwnLCB7IGNvbW1hbmQ6ICdlc2xpbnQgc3JjJyB9KSk7XG5cdFx0b2sobGludGVyRmlsdGVyLm1hdGNoZXMoJ3J1bl9pbl90ZXJtaW5hbCcsIHsgY29tbWFuZDogJ3J1ZmYgY2hlY2sgLicgfSkpO1xuXHRcdG9rKGxpbnRlckZpbHRlci5tYXRjaGVzKCdydW5faW5fdGVybWluYWwnLCB7IGNvbW1hbmQ6ICdjYXJnbyBjbGlwcHknIH0pKTtcblx0fSk7XG59KTtcblxuc3VpdGUoJ2VudkZpbHRlcicsICgpID0+IHtcblx0ZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlKCk7XG5cblx0dGVzdCgnbWF0Y2hlcyBlbnYgLyBwcmludGVudiB3aXRoIG5vIGFyZ3MnLCAoKSA9PiB7XG5cdFx0b2soZW52RmlsdGVyLm1hdGNoZXMoJ3J1bl9pbl90ZXJtaW5hbCcsIHsgY29tbWFuZDogJ2VudicgfSkpO1xuXHRcdG9rKGVudkZpbHRlci5tYXRjaGVzKCdydW5faW5fdGVybWluYWwnLCB7IGNvbW1hbmQ6ICdwcmludGVudicgfSkpO1xuXHR9KTtcblxuXHR0ZXN0KCdzb3J0cyBhbmQgZGVkdXBlcyBsaW5lcycsICgpID0+IHtcblx0XHRjb25zdCB0ZXh0ID0gWydaU0g9L2Jpbi96c2gnLCAnUEFUSD0vdXNyL2JpbicsICdQQVRIPS91c3IvYmluJywgJ0hPTUU9L2hvbWUvdSddLmpvaW4oJ1xcbicpO1xuXHRcdGNvbnN0IG91dCA9IGVudkZpbHRlci5hcHBseSh0ZXh0LCB7IGNvbW1hbmQ6ICdlbnYnIH0pO1xuXHRcdHN0cmljdEVxdWFsKG91dC5jb21wcmVzc2VkLCB0cnVlKTtcblx0XHQvLyBTb3J0ZWQgYWxwaGFiZXRpY2FsbHkuXG5cdFx0Y29uc3QgbGluZXMgPSBvdXQudGV4dC5zcGxpdCgnXFxuJyk7XG5cdFx0b2sobGluZXMuaW5kZXhPZignSE9NRT0vaG9tZS91JykgPCBsaW5lcy5pbmRleE9mKCdQQVRIPS91c3IvYmluJykpO1xuXHRcdG9rKGxpbmVzLmluZGV4T2YoJ1BBVEg9L3Vzci9iaW4nKSA8IGxpbmVzLmluZGV4T2YoJ1pTSD0vYmluL3pzaCcpKTtcblx0XHQvLyBEZWR1cGVkLlxuXHRcdHN0cmljdEVxdWFsKGxpbmVzLmZpbHRlcihsID0+IGwgPT09ICdQQVRIPS91c3IvYmluJykubGVuZ3RoLCAxKTtcblx0fSk7XG59KTtcblxuc3VpdGUoJ2lzUHJvdGVjdGVkRnJvbUNvbXByZXNzaW9uJywgKCkgPT4ge1xuXHRlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUoKTtcblxuXHR0ZXN0KCdwcm90ZWN0cyBKU09OIG9iamVjdCBvdXRwdXQnLCAoKSA9PiB7XG5cdFx0b2soaXNQcm90ZWN0ZWRGcm9tQ29tcHJlc3Npb24oJ3tcImFcIjoxLFwiYlwiOlsxLDIsM119JykpO1xuXHR9KTtcblx0dGVzdCgncHJvdGVjdHMgSlNPTiBhcnJheSBvdXRwdXQnLCAoKSA9PiB7XG5cdFx0b2soaXNQcm90ZWN0ZWRGcm9tQ29tcHJlc3Npb24oJ1sxLCAyLCAzLCB7XCJrXCI6XCJ2XCJ9XScpKTtcblx0fSk7XG5cdHRlc3QoJ3Byb3RlY3RzIFlBTUwgaGVhZGVycycsICgpID0+IHtcblx0XHRvayhpc1Byb3RlY3RlZEZyb21Db21wcmVzc2lvbignLS0tXFxuZm9vOiBiYXJcXG5iYXo6IDFcXG4nKSk7XG5cdH0pO1xuXHR0ZXN0KCdwcm90ZWN0cyBUT01MIGhlYWRlcnMnLCAoKSA9PiB7XG5cdFx0b2soaXNQcm90ZWN0ZWRGcm9tQ29tcHJlc3Npb24oJ1twYWNrYWdlXVxcbm5hbWUgPSBcInhcIlxcbicpKTtcblx0fSk7XG5cdHRlc3QoJ2RvZXMgbm90IHByb3RlY3QgcGxhaW4gdGV4dCcsICgpID0+IHtcblx0XHRvayghaXNQcm90ZWN0ZWRGcm9tQ29tcHJlc3Npb24oJ2hlbGxvIHdvcmxkXFxuc29tZSBvdXRwdXRcXG4nKSk7XG5cdH0pO1xuXHR0ZXN0KCdkb2VzIG5vdCBwcm90ZWN0IG1hbGZvcm1lZCBKU09OJywgKCkgPT4ge1xuXHRcdG9rKCFpc1Byb3RlY3RlZEZyb21Db21wcmVzc2lvbigneyB0aGlzIGlzIHsgbm90IGpzb24gfScpKTtcblx0fSk7XG59KTtcbiJdLAogICJtYXBwaW5ncyI6ICJBQUtBLFNBQVMsaUJBQWlCLElBQUksbUJBQW1CO0FBQ2pELFNBQVMsK0NBQStDO0FBQ3hELFNBQVMsZUFBZSxjQUFjLGlCQUFpQixVQUFVLGtCQUFrQixrQkFBa0Isa0JBQWtCLGlCQUFpQixjQUFjLFdBQVcsWUFBWSxZQUFZLGtCQUFrQjtBQUMzTSxTQUFTLGtDQUFrQztBQUUzQyxNQUFNLG9CQUFvQixNQUFNO0FBQy9CLDBDQUF3QztBQUV4QyxPQUFLLHFDQUFxQyxNQUFNO0FBQy9DLGdCQUFZLGlCQUFpQixNQUFTLEdBQUcsTUFBUztBQUNsRCxnQkFBWSxpQkFBaUIsRUFBRSxHQUFHLE1BQVM7QUFDM0MsZ0JBQVksaUJBQWlCLEtBQUssR0FBRyxNQUFTO0FBQUEsRUFDL0MsQ0FBQztBQUVELE9BQUssMEJBQTBCLE1BQU07QUFDcEMsb0JBQWdCLGlCQUFpQixpQkFBaUIsR0FBRyxFQUFFLE1B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
