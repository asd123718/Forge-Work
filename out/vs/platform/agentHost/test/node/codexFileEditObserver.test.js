import assert from "assert";
import { mkdtemp, mkdir, rm, writeFile } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import { URI } from "../../../../base/common/uri.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../base/test/common/utils.js";
import {
  LIVE_PREVIEW_UNAVAILABLE_MESSAGE,
  applyUnifiedDiff,
  invertUnifiedDiff,
  parseGitTurnDiff,
  previewFileChange,
  readShellSnapshot,
  resolveTurnDiffPath,
  shellCommandFileCandidates,
  shellSnapshotMaxFileBytes,
  shellSnapshotMaxFiles,
  shellSnapshotMaxTotalBytes,
  snapshotDirectory
} from "../../node/codex/codexFileEditObserver.js";
suite("CodexFileEditObserver", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  test("previews streamed add and delete changes with first-class identities", () => {
    assert.deepStrictEqual(previewFileChange("", {
      path: "new.txt",
      kind: { type: "add" },
      diff: "one\ntwo\n"
    }), { ok: true, after: "one\ntwo\n", omitBefore: true, omitAfter: false });
    assert.deepStrictEqual(previewFileChange("old\n", {
      path: "old.txt",
      kind: { type: "delete" },
      diff: "old\n"
    }), { ok: true, after: "", omitBefore: false, omitAfter: true });
  });
  test("applies multiple unified diff hunks to the original content", () => {
    const original = "one\ntwo\nthree\nfour\nfive\n";
    const diff = [
      "@@ -1,3 +1,3 @@",
      " one",
      "-two",
      "+TWO",
      " three",
      "@@ -4,2 +4,3 @@",
      " four",
      "+four-and-a-half",
      " five",
      ""
    ].join("\n");
    assert.strictEqual(applyUnifiedDiff(original, diff), "one\nTWO\nthree\nfour\nfour-and-a-half\nfive\n");
  });
  test("removes Codex move metadata before previewing an update", () => {
    assert.deepStrictEqual(previewFileChange("before\n", {
      path: "old.txt",
      kind: { type: "update", move_path: "new.txt" },
      diff: "@@ -1 +1 @@\n-before\n+after\n\nMoved to: new.txt"
    }), { ok: true, after: "after\n", afterPath: "new.txt", omitBefore: false, omitAfter: false });
  });
  test("parses and reverses a cumulative turn diff", () => {
    const patch = [
      "diff --git a/src/a.ts b/src/a.ts",
      "--- a/src/a.ts",
      "+++ b/src/a.ts",
      "@@ -1,3 +1,4 @@",
      " one",
      "-two",
      "+TWO",
      " three",
      "+four",
      ""
    ].join("\n");
    const files = parseGitTurnDiff(patch);
    assert.deepStrictEqual(files.map((file) => ({ path: file.path, beforeExisted: file.beforeExisted, afterExists: file.afterExists })), [
      { path: "src/a.ts", beforeExisted: true, afterExists: true }
    ]);
    assert.strictEqual(applyUnifiedDiff("one\nTWO\nthree\nfour\n", invertUnifiedDiff(files[0].patch)), "one\ntwo\nthree\n");
  });
  test("extracts absolute and relative shell write targets", () => {
    const candidates = shellCommandFileCandidates(
      `$p='D:\\Test\\index.html'; [IO.File]::WriteAllText($p, 'x'); Set-Content .\\src\\app.ts 'y'`,
      "D:\\Test"
    );
    assert.ok(candidates.some((path) => path.toLowerCase() === "d:\\test\\index.html"));
    assert.ok(candidates.some((path) => path.toLowerCase() === "d:\\test\\src\\app.ts"));
  });
  test("skips PowerShell variable and wildcard paths", () => {
    const candidates = shellCommandFileCandidates(
      `Set-Content $env:TEMP\\out.txt 'x'; Copy-Item .\\src\\*.ts .\\dest`,
      "D:\\Test"
    );
    assert.ok(!candidates.some((path) => path.toLowerCase().includes("$env")));
    assert.ok(!candidates.some((path) => path.includes("*")));
  });
  test("applies a patch to an empty file", () => {
    const diff = ["@@ -0,0 +1,2 @@", "+hello", "+world", ""].join("\n");
    assert.strictEqual(applyUnifiedDiff("", diff), "hello\nworld\n");
  });
  test("preserves CRLF when the baseline uses CRLF", () => {
    const original = "one\r\ntwo\r\nthree\r\n";
    const diff = ["@@ -1,3 +1,3 @@", " one", "-two", "+TWO", " three", ""].join("\n");
    assert.strictEqual(applyUnifiedDiff(original, diff), "one\r\nTWO\r\nthree\r\n");
  });
  test("handles a file with no trailing newline", () => {
    const original = "one\ntwo";
    const diff = ["@@ -1,2 +1,2 @@", " one", "-two", "+TWO", "\\ No newline at end of file", ""].join("\n");
    assert.strictEqual(applyUnifiedDiff(original, diff), "one\nTWO");
  });
  test("fails closed when hunk context does not match", () => {
    const original = "one\ntwo\nthree\n";
    const diff = ["@@ -1,3 +1,3 @@", " one", "-nope", "+TWO", " three", ""].join("\n");
    assert.strictEqual(applyUnifiedDiff(original, diff), void 0);
    assert.deepStrictEqual(previewFileChange(original, {
      path: "a.ts",
      kind: { type: "update", move_path: null },
      diff
    }), { ok: false, reason: LIVE_PREVIEW_UNAVAILABLE_MESSAGE });
  });
  test("fails closed when a later hunk mismatches after an earlier hunk succeeds", () => {
    const original = "one\ntwo\nthree\nfour\n";
    const diff = [
      "@@ -1,2 +1,2 @@",
      " one",
      "-two",
      "+TWO",
      "@@ -3,2 +3,2 @@",
      " wrong",
      "-four",
      "+FOUR",
      ""
    ].join("\n");
    assert.strictEqual(applyUnifiedDiff(original, diff), void 0);
  });
  test("fails closed when the update diff contains no hunks", () => {
    assert.strictEqual(applyUnifiedDiff("keep\n", "not a patch"), void 0);
    assert.deepStrictEqual(previewFileChange("keep\n", {
      path: "a.ts",
      kind: { type: "update", move_path: null },
      diff: "not a patch"
    }), { ok: false, reason: LIVE_PREVIEW_UNAVAILABLE_MESSAGE });
  });
  test("refuses a turn-diff reconstruction when the inverted patch does not apply", () => {
    const after = "one\nTWO\nthree\n";
    const inverted = invertUnifiedDiff([
      "diff --git a/a.ts b/a.ts",
      "--- a/a.ts",
      "+++ b/a.ts",
      "@@ -1,3 +1,3 @@",
      " one",
      "-two",
      "+TWO",
      " three",
      ""
    ].join("\n"));
    assert.ok(applyUnifiedDiff(after, inverted));
    assert.strictEqual(applyUnifiedDiff("unrelated\n", inverted), void 0);
  });
  test("parses rename and delete turn diffs", () => {
    const patch = [
      "diff --git a/old.ts b/new.ts",
      "--- a/old.ts",
      "+++ b/new.ts",
      "@@ -1 +1 @@",
      "-old",
      "+new",
      "diff --git a/gone.ts b/gone.ts",
      "--- a/gone.ts",
      "+++ /dev/null",
      "@@ -1 +0,0 @@",
      "-bye",
      ""
    ].join("\n");
    assert.deepStrictEqual(parseGitTurnDiff(patch).map((file) => ({ path: file.path, beforeExisted: file.beforeExisted, afterExists: file.afterExists })), [
      { path: "new.ts", beforeExisted: true, afterExists: true },
      { path: "gone.ts", beforeExisted: true, afterExists: false }
    ]);
  });
  test("resolves a turn-diff path against the matching multi-root folder", async () => {
    const rootA = URI.file("C:\\work\\alpha");
    const rootB = URI.file("C:\\work\\beta");
    const path = await resolveTurnDiffPath("beta/src/app.ts", true, [rootA, rootB], async (candidate) => candidate.replace(/\\/g, "/").endsWith("beta/src/app.ts"));
    assert.ok(path.replace(/\\/g, "/").toLowerCase().endsWith("beta/src/app.ts"));
  });
  test("documents snapshot limits used for shell walk truncation", () => {
    assert.strictEqual(shellSnapshotMaxFiles, 3e3);
    assert.strictEqual(shellSnapshotMaxFileBytes, 2 * 1024 * 1024);
    assert.strictEqual(shellSnapshotMaxTotalBytes, 24 * 1024 * 1024);
  });
  test("shell snapshots include empty files and skip binaries, oversized files, and node_modules", async () => {
    const root = await mkdtemp(join(tmpdir(), "forge-observer-"));
    try {
      await writeFile(join(root, "empty.txt"), "");
      await writeFile(join(root, "ok.txt"), "hello");
      await writeFile(join(root, "binary.bin"), Buffer.from([0, 1, 2]));
      await writeFile(join(root, "huge.txt"), Buffer.alloc(shellSnapshotMaxFileBytes + 1, 97));
      await mkdir(join(root, "node_modules", "pkg"), { recursive: true });
      await writeFile(join(root, "node_modules", "pkg", "index.js"), "skipped");
      const empty = await readShellSnapshot(join(root, "empty.txt"));
      const ok = await readShellSnapshot(join(root, "ok.txt"));
      const binary = await readShellSnapshot(join(root, "binary.bin"));
      const huge = await readShellSnapshot(join(root, "huge.txt"));
      assert.deepStrictEqual({ existed: empty.existed, content: empty.content, skippedContent: empty.skippedContent }, { existed: true, content: "", skippedContent: false });
      assert.deepStrictEqual({ existed: ok.existed, content: ok.content, skippedContent: ok.skippedContent }, { existed: true, content: "hello", skippedContent: false });
      assert.strictEqual(binary.skippedContent, true);
      assert.strictEqual(huge.skippedContent, true);
      const snapshots = /* @__PURE__ */ new Map();
      await snapshotDirectory(root, snapshots, 50, 1024 * 1024);
      const keys = [...snapshots.keys()].map((path) => path.replace(/\\/g, "/"));
      assert.ok(keys.some((path) => path.endsWith("/empty.txt")));
      assert.ok(keys.some((path) => path.endsWith("/ok.txt")));
      assert.ok(!keys.some((path) => path.includes("/node_modules/")));
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
  test("truncates a directory walk at the file-count and byte budgets", async () => {
    const root = await mkdtemp(join(tmpdir(), "forge-observer-limit-"));
    try {
      for (let index = 0; index < 5; index++) {
        await writeFile(join(root, `f${index}.txt`), "x");
      }
      const byCount = /* @__PURE__ */ new Map();
      const countResult = await snapshotDirectory(root, byCount, 3, 1024 * 1024);
      assert.strictEqual(countResult.files, 3);
      assert.strictEqual(byCount.size, 3);
      const byteRoot = join(root, "bytes");
      await mkdir(byteRoot);
      await writeFile(join(byteRoot, "a.txt"), "aaaa");
      await writeFile(join(byteRoot, "b.txt"), "bbbb");
      await writeFile(join(byteRoot, "c.txt"), "cccc");
      const byBytes = /* @__PURE__ */ new Map();
      await snapshotDirectory(byteRoot, byBytes, 50, 6);
      const stored = [...byBytes.values()].filter((snapshot) => !snapshot.skippedContent);
      assert.ok(stored.length <= 1);
      assert.ok([...byBytes.values()].reduce((total, snapshot) => total + (snapshot.skippedContent ? 0 : snapshot.size), 0) <= 6);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxwbGF0Zm9ybVxcYWdlbnRIb3N0XFx0ZXN0XFxub2RlXFxjb2RleEZpbGVFZGl0T2JzZXJ2ZXIudGVzdC50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCBhc3NlcnQgZnJvbSAnYXNzZXJ0JztcbmltcG9ydCB7IG1rZHRlbXAsIG1rZGlyLCBybSwgd3JpdGVGaWxlIH0gZnJvbSAnZnMvcHJvbWlzZXMnO1xuaW1wb3J0IHsgdG1wZGlyIH0gZnJvbSAnb3MnO1xuaW1wb3J0IHsgam9pbiB9IGZyb20gJ3BhdGgnO1xuaW1wb3J0IHsgVVJJIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdXJpLmpzJztcbmltcG9ydCB7IGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvdGVzdC9jb21tb24vdXRpbHMuanMnO1xuaW1wb3J0IHtcblx0TElWRV9QUkVWSUVXX1VOQVZBSUxBQkxFX01FU1NBR0UsXG5cdGFwcGx5VW5pZmllZERpZmYsXG5cdGludmVydFVuaWZpZWREaWZmLFxuXHRwYXJzZUdpdFR1cm5EaWZmLFxuXHRwcmV2aWV3RmlsZUNoYW5nZSxcblx0cmVhZFNoZWxsU25hcHNob3QsXG5cdHJlc29sdmVUdXJuRGlmZlBhdGgsXG5cdHNoZWxsQ29tbWFuZEZpbGVDYW5kaWRhdGVzLFxuXHRzaGVsbFNuYXBzaG90TWF4RmlsZUJ5dGVzLFxuXHRzaGVsbFNuYXBzaG90TWF4RmlsZXMsXG5cdHNoZWxsU25hcHNob3RNYXhUb3RhbEJ5dGVzLFxuXHRzbmFwc2hvdERpcmVjdG9yeSxcbn0gZnJvbSAnLi4vLi4vbm9kZS9jb2RleC9jb2RleEZpbGVFZGl0T2JzZXJ2ZXIuanMnO1xuXG5zdWl0ZSgnQ29kZXhGaWxlRWRpdE9ic2VydmVyJywgKCkgPT4ge1xuXHRlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUoKTtcblxuXHR0ZXN0KCdwcmV2aWV3cyBzdHJlYW1lZCBhZGQgYW5kIGRlbGV0ZSBjaGFuZ2VzIHdpdGggZmlyc3QtY2xhc3MgaWRlbnRpdGllcycsICgpID0+IHtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHByZXZpZXdGaWxlQ2hhbmdlKCcnLCB7XG5cdFx0XHRwYXRoOiAnbmV3LnR4dCcsXG5cdFx0XHRraW5kOiB7IHR5cGU6ICdhZGQnIH0sXG5cdFx0XHRkaWZmOiAnb25lXFxudHdvXFxuJyxcblx0XHR9KSwgeyBvazogdHJ1ZSwgYWZ0ZXI6ICdvbmVcXG50d29cXG4nLCBvbWl0QmVmb3JlOiB0cnVlLCBvbWl0QWZ0ZXI6IGZhbHNlIH0pO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocHJldmlld0ZpbGVDaGFuZ2UoJ29sZFxcbicsIHtcblx0XHRcdHBhdGg6ICdvbGQudHh0Jyxcblx0XHRcdGtpbmQ6IHsgdHlwZTogJ2RlbGV0ZScgfSxcblx0XHRcdGRpZmY6ICdvbGRcXG4nLFxuXHRcdH0pLCB7IG9rOiB0cnVlLCBhZnRlcjogJycsIG9taXRCZWZvcmU6IGZhbHNlLCBvbWl0QWZ0ZXI6IHRydWUgfSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2FwcGxpZXMgbXVsdGlwbGUgdW5pZmllZCBkaWZmIGh1bmtzIHRvIHRoZSBvcmlnaW5hbCBjb250ZW50JywgKCkgPT4ge1xuXHRcdGNvbnN0IG9yaWdpbmFsID0gJ29uZVxcbnR3b1xcbnRocmVlXFxuZm91clxcbmZpdmVcXG4nO1xuXHRcdGNvbnN0IGRpZmYgPSBbXG5cdFx0XHQnQEAgLTEsMyArMSwzIEBAJyxcblx0XHRcdCcgb25lJyxcblx0XHRcdCctdHdvJyxcblx0XHRcdCcrVFdPJyxcblx0XHRcdCcgdGhyZWUnLFxuXHRcdFx0J0BAIC00LDIgKzQsMyBAQCcsXG5cdFx0XHQnIGZvdXInLFxuXHRcdFx0Jytmb3VyLWFuZC1hLWhhbGYnLFxuXHRcdFx0JyBmaXZlJyxcblx0XHRcdCcnLFxuXHRcdF0uam9pbignXFxuJyk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYXBwbHlVbmlmaWVkRGlmZihvcmlnaW5hbCwgZGlmZiksICdvbmVcXG5UV09cXG50aHJlZVxcbmZvdXJcXG5mb3VyLWFuZC1hLWhhbGZcXG5maXZlXFxuJyk7XG5cdH0pO1xuXG5cdHRlc3QoJ3JlbW92ZXMgQ29kZXggbW92ZSBtZXRhZGF0YSBiZWZvcmUgcHJldmlld2luZyBhbiB1cGRhdGUnLCAoKSA9PiB7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChwcmV2aWV3RmlsZUNoYW5nZSgnYmVmb3JlXFxuJywge1xuXHRcdFx0cGF0aDogJ29sZC50eHQnLFxuXHRcdFx0a2luZDogeyB0eXBlOiAndXBkYXRlJywgbW92ZV9wYXRoOiAnbmV3LnR4dCcgfSxcblx0XHRcdGRpZmY6ICdAQCAtMSArMSBAQFxcbi1iZWZvcmVcXG4rYWZ0ZXJcXG5cXG5Nb3ZlZCB0bzogbmV3LnR4dCcsXG5cdFx0fSksIHsgb2s6IHRydWUsIGFmdGVyOiAnYWZ0ZXJcXG4nLCBhZnRlclBhdGg6ICduZXcudHh0Jywgb21pdEJlZm9yZTogZmFsc2UsIG9taXRBZnRlcjogZmFsc2UgfSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3BhcnNlcyBhbmQgcmV2ZXJzZXMgYSBjdW11bGF0aXZlIHR1cm4gZGlmZicsICgpID0+IHtcblx0XHRjb25zdCBwYXRjaCA9IFtcblx0XHRcdCdkaWZmIC0tZ2l0IGEvc3JjL2EudHMgYi9zcmMvYS50cycsXG5cdFx0XHQnLS0tIGEvc3JjL2EudHMnLFxuXHRcdFx0JysrKyBiL3NyYy9hLnRzJyxcblx0XHRcdCdAQCAtMSwzICsxLDQgQEAnLFxuXHRcdFx0JyBvbmUnLFxuXHRcdFx0Jy10d28nLFxuXHRcdFx0JytUV08nLFxuXHRcdFx0JyB0aHJlZScsXG5cdFx0XHQnK2ZvdXInLFxuXHRcdFx0JycsXG5cdFx0XS5qb2luKCdcXG4nKTtcblx0XHRjb25zdCBmaWxlcyA9IHBhcnNlR2l0VHVybkRpZmYocGF0Y2gpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoZmlsZXMubWFwKGZpbGUgPT4gKHsgcGF0aDogZmlsZS5wYXRoLCBiZWZvcmVFeGlzdGVkOiBmaWxlLmJlZm9yZUV4aXN0ZWQsIGFmdGVyRXhpc3RzOiBmaWxlLmFmdGVyRXhpc3RzIH0pKSwgW1xuXHRcdFx0eyBwYXRoOiAnc3JjL2EudHMnLCBiZWZvcmVFeGlzdGVkOiB0cnVlLCBhZnRlckV4aXN0czogdHJ1ZSB9LFxuXHRcdF0pO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChhcHBseVVuaWZpZWREaWZmKCdvbmVcXG5UV09cXG50aHJlZVxcbmZvdXJcXG4nLCBpbnZlcnRVbmlmaWVkRGlmZihmaWxlc1swXS5wYXRjaCkpLCAnb25lXFxudHdvXFxudGhyZWVcXG4nKTtcblx0fSk7XG5cblx0dGVzdCgnZXh0cmFjdHMgYWJzb2x1dGUgYW5kIHJlbGF0aXZlIHNoZWxsIHdyaXRlIHRhcmdldHMnLCAoKSA9PiB7XG5cdFx0Y29uc3QgY2FuZGlkYXRlcyA9IHNoZWxsQ29tbWFuZEZpbGVDYW5kaWRhdGVzKFxuXHRcdFx0YCRwPSdEOlxcXFxUZXN0XFxcXGluZGV4Lmh0bWwnOyBbSU8uRmlsZV06OldyaXRlQWxsVGV4dCgkcCwgJ3gnKTsgU2V0LUNvbnRlbnQgLlxcXFxzcmNcXFxcYXBwLnRzICd5J2AsXG5cdFx0XHQnRDpcXFxcVGVzdCcsXG5cdFx0KTtcblx0XHRhc3NlcnQub2soY2FuZGlkYXRlcy5zb21lKHBhdGggPT4gcGF0aC50b0xvd2VyQ2FzZSgpID09PSAnZDpcXFxcdGVzdFxcXFxpbmRleC5odG1sJykpO1xuXHRcdGFzc2VydC5vayhjYW5kaWRhdGVzLnNvbWUocGF0aCA9PiBwYXRoLnRvTG93ZXJDYXNlKCkgPT09ICdkOlxcXFx0ZXN0XFxcXHNyY1xcXFxhcHAudHMnKSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3NraXBzIFBvd2VyU2hlbGwgdmFyaWFibGUgYW5kIHdpbGRjYXJkIHBhdGhzJywgKCkgPT4ge1xuXHRcdGNvbnN0IGNhbmRpZGF0ZXMgPSBzaGVsbENvbW1hbmRGaWxlQ2FuZGlkYXRlcyhcblx0XHRcdGBTZXQtQ29udGVudCAkZW52OlRFTVBcXFxcb3V0LnR4dCAneCc7IENvcHktSXRlbSAuXFxcXHNyY1xcXFwqLnRzIC5cXFxcZGVzdGAsXG5cdFx0XHQnRDpcXFxcVGVzdCcsXG5cdFx0KTtcblx0XHRhc3NlcnQub2soIWNhbmRpZGF0ZXMuc29tZShwYXRoID0+IHBhdGgudG9Mb3dlckNhc2UoKS5pbmNsdWRlcygnJGVudicpKSk7XG5cdFx0YXNzZXJ0Lm9rKCFjYW5kaWRhdGVzLnNvbWUocGF0aCA9PiBwYXRoLmluY2x1ZGVzKCcqJykpKTtcblx0fSk7XG5cblx0dGVzdCgnYXBwbGllcyBhIHBhdGNoIHRvIGFuIGVtcHR5IGZpbGUnLCAoKSA9PiB7XG5cdFx0Y29uc3QgZGlmZiA9IFsnQEAgLTAsMCArMSwyIEBAJywgJytoZWxsbycsICcrd29ybGQnLCAnJ10uam9pbignXFxuJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGFwcGx5VW5pZmllZERpZmYoJycsIGRpZmYpLCAnaGVsbG9cXG53b3JsZFxcbicpO1xuXHR9KTtcblxuXHR0ZXN0KCdwcmVzZXJ2ZXMgQ1JMRiB3aGVuIHRoZSBiYXNlbGluZSB1c2VzIENSTEYnLCAoKSA9PiB7XG5cdFx0Y29uc3Qgb3JpZ2luYWwgPSAnb25lXFxyXFxudHdvXFxyXFxudGhyZWVcXHJcXG4nO1xuXHRcdGNvbnN0IGRpZmYgPSBbJ0BAIC0xLDMgKzEsMyBAQCcsICcgb25lJywgJy10d28nLCAnK1RXTycsICcgdGhyZWUnLCAnJ10uam9pbignXFxuJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGFwcGx5VW5pZmllZERpZmYob3JpZ2luYWwsIGRpZmYpLCAnb25lXFxyXFxuVFdPXFxyXFxudGhyZWVcXHJcXG4nKTtcblx0fSk7XG5cblx0dGVzdCgnaGFuZGxlcyBhIGZpbGUgd2l0aCBubyB0cmFpbGluZyBuZXdsaW5lJywgKCkgPT4ge1xuXHRcdGNvbnN0IG9yaWdpbmFsID0gJ29uZVxcbnR3byc7XG5cdFx0Y29uc3QgZGlmZiA9IFsnQEAgLTEsMiArMSwyIEBAJywgJyBvbmUnLCAnLXR3bycsICcrVFdPJywgJ1xcXFwgTm8gbmV3bGluZSBhdCBlbmQgb2YgZmlsZScsICcnXS5qb2luKCdcXG4nKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYXBwbHlVbmlmaWVkRGlmZihvcmlnaW5hbCwgZGlmZiksICdvbmVcXG5UV08nKTtcblx0fSk7XG5cblx0dGVzdCgnZmFpbHMgY2xvc2VkIHdoZW4gaHVuayBjb250ZXh0IGRvZXMgbm90IG1hdGNoJywgKCkgPT4ge1xuXHRcdGNvbnN0IG9yaWdpbmFsID0gJ29uZVxcbnR3b1xcbnRocmVlXFxuJztcblx0XHRjb25zdCBkaWZmID0gWydAQCAtMSwzICsxLDMgQEAnLCAnIG9uZScsICctbm9wZScsICcrVFdPJywgJyB0aHJlZScsICcnXS5qb2luKCdcXG4nKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYXBwbHlVbmlmaWVkRGlmZihvcmlnaW5hbCwgZGlmZiksIHVuZGVmaW5lZCk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChwcmV2aWV3RmlsZUNoYW5nZShvcmlnaW5hbCwge1xuXHRcdFx0cGF0aDogJ2EudHMnLFxuXHRcdFx0a2luZDogeyB0eXBlOiAndXBkYXRlJywgbW92ZV9wYXRoOiBudWxsIH0sXG5cdFx0XHRkaWZmLFxuXHRcdH0pLCB7IG9rOiBmYWxzZSwgcmVhc29uOiBMSVZFX1BSRVZJRVdfVU5BVkFJTEFCTEVfTUVTU0FHRSB9KTtcblx0fSk7XG5cblx0dGVzdCgnZmFpbHMgY2xvc2VkIHdoZW4gYSBsYXRlciBodW5rIG1pc21hdGNoZXMgYWZ0ZXIgYW4gZWFybGllciBodW5rIHN1Y2NlZWRzJywgKCkgPT4ge1xuXHRcdGNvbnN0IG9yaWdpbmFsID0gJ29uZVxcbnR3b1xcbnRocmVlXFxuZm91clxcbic7XG5cdFx0Y29uc3QgZGlmZiA9IFtcblx0XHRcdCdAQCAtMSwyICsxLDIgQEAnLFxuXHRcdFx0JyBvbmUnLFxuXHRcdFx0Jy10d28nLFxuXHRcdFx0JytUV08nLFxuXHRcdFx0J0BAIC0zLDIgKzMsMiBAQCcsXG5cdFx0XHQnIHdyb25nJyxcblx0XHRcdCctZm91cicsXG5cdFx0XHQnK0ZPVVInLFxuXHRcdFx0JycsXG5cdFx0XS5qb2luKCdcXG4nKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYXBwbHlVbmlmaWVkRGlmZihvcmlnaW5hbCwgZGlmZiksIHVuZGVmaW5lZCk7XG5cdH0pO1xuXG5cdHRlc3QoJ2ZhaWxzIGNsb3NlZCB3aGVuIHRoZSB1cGRhdGUgZGlmZiBjb250YWlucyBubyBodW5rcycsICgpID0+IHtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYXBwbHlVbmlmaWVkRGlmZigna2VlcFxcbicsICdub3QgYSBwYXRjaCcpLCB1bmRlZmluZWQpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocHJldmlld0ZpbGVDaGFuZ2UoJ2tlZXBcXG4nLCB7XG5cdFx0XHRwYXRoOiAnYS50cycsXG5cdFx0XHRraW5kOiB7IHR5cGU6ICd1cGRhdGUnLCBtb3ZlX3BhdGg6IG51bGwgfSxcblx0XHRcdGRpZmY6ICdub3QgYSBwYXRjaCcsXG5cdFx0fSksIHsgb2s6IGZhbHNlLCByZWFzb246IExJVkVfUFJFVklFV19VTkFWQUlMQUJMRV9NRVNTQUdFIH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdyZWZ1c2VzIGEgdHVybi1kaWZmIHJlY29uc3RydWN0aW9uIHdoZW4gdGhlIGludmVydGVkIHBhdGNoIGRvZXMgbm90IGFwcGx5JywgKCkgPT4ge1xuXHRcdGNvbnN0IGFmdGVyID0gJ29uZVxcblRXT1xcbnRocmVlXFxuJztcblx0XHRjb25zdCBpbnZlcnRlZCA9IGludmVydFVuaWZpZWREaWZmKFtcblx0XHRcdCdkaWZmIC0tZ2l0IGEvYS50cyBiL2EudHMnLFxuXHRcdFx0Jy0tLSBhL2EudHMnLFxuXHRcdFx0JysrKyBiL2EudHMnLFxuXHRcdFx0J0BAIC0xLDMgKzEsMyBAQCcsXG5cdFx0XHQnIG9uZScsXG5cdFx0XHQnLXR3bycsXG5cdFx0XHQnK1RXTycsXG5cdFx0XHQnIHRocmVlJyxcblx0XHRcdCcnLFxuXHRcdF0uam9pbignXFxuJykpO1xuXHRcdGFzc2VydC5vayhhcHBseVVuaWZpZWREaWZmKGFmdGVyLCBpbnZlcnRlZCkpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChhcHBseVVuaWZpZWREaWZmKCd1bnJlbGF0ZWRcXG4nLCBpbnZlcnRlZCksIHVuZGVmaW5lZCk7XG5cdH0pO1xuXG5cdHRlc3QoJ3BhcnNlcyByZW5hbWUgYW5kIGRlbGV0ZSB0dXJuIGRpZmZzJywgKCkgPT4ge1xuXHRcdGNvbnN0IHBhdGNoID0gW1xuXHRcdFx0J2RpZmYgLS1naXQgYS9vbGQudHMgYi9uZXcudHMnLFxuXHRcdFx0Jy0tLSBhL29sZC50cycsXG5cdFx0XHQnKysrIGIvbmV3LnRzJyxcblx0XHRcdCdAQCAtMSArMSBAQCcsXG5cdFx0XHQnLW9sZCcsXG5cdFx0XHQnK25ldycsXG5cdFx0XHQnZGlmZiAtLWdpdCBhL2dvbmUudHMgYi9nb25lLnRzJyxcblx0XHRcdCctLS0gYS9nb25lLnRzJyxcblx0XHRcdCcrKysgL2Rldi9udWxsJyxcblx0XHRcdCdAQCAtMSArMCwwIEBAJyxcblx0XHRcdCctYnllJyxcblx0XHRcdCcnLFxuXHRcdF0uam9pbignXFxuJyk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChwYXJzZUdpdFR1cm5EaWZmKHBhdGNoKS5tYXAoZmlsZSA9PiAoeyBwYXRoOiBmaWxlLnBhdGgsIGJlZm9yZUV4aXN0ZWQ6IGZpbGUuYmVmb3JlRXhpc3RlZCwgYWZ0ZXJFeGlzdHM6IGZpbGUuYWZ0ZXJFeGlzdHMgfSkpLCBbXG5cdFx0XHR7IHBhdGg6ICduZXcudHMnLCBiZWZvcmVFeGlzdGVkOiB0cnVlLCBhZnRlckV4aXN0czogdHJ1ZSB9LFxuXHRcdFx0eyBwYXRoOiAnZ29uZS50cycsIGJlZm9yZUV4aXN0ZWQ6IHRydWUsIGFmdGVyRXhpc3RzOiBmYWxzZSB9LFxuXHRcdF0pO1xuXHR9KTtcblxuXHR0ZXN0KCdyZXNvbHZlcyBhIHR1cm4tZGlmZiBwYXRoIGFnYWluc3QgdGhlIG1hdGNoaW5nIG11bHRpLXJvb3QgZm9sZGVyJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHJvb3RBID0gVVJJLmZpbGUoJ0M6XFxcXHdvcmtcXFxcYWxwaGEnKTtcblx0XHRjb25zdCByb290QiA9IFVSSS5maWxlKCdDOlxcXFx3b3JrXFxcXGJldGEnKTtcblx0XHRjb25zdCBwYXRoID0gYXdhaXQgcmVzb2x2ZVR1cm5EaWZmUGF0aCgnYmV0YS9zcmMvYXBwLnRzJywgdHJ1ZSwgW3Jvb3RBLCByb290Ql0sIGFzeW5jIGNhbmRpZGF0ZSA9PiBjYW5kaWRhdGUucmVwbGFjZSgvXFxcXC9nLCAnLycpLmVuZHNXaXRoKCdiZXRhL3NyYy9hcHAudHMnKSk7XG5cdFx0YXNzZXJ0Lm9rKHBhdGgucmVwbGFjZSgvXFxcXC9nLCAnLycpLnRvTG93ZXJDYXNlKCkuZW5kc1dpdGgoJ2JldGEvc3JjL2FwcC50cycpKTtcblx0fSk7XG5cblx0dGVzdCgnZG9jdW1lbnRzIHNuYXBzaG90IGxpbWl0cyB1c2VkIGZvciBzaGVsbCB3YWxrIHRydW5jYXRpb24nLCAoKSA9PiB7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNoZWxsU25hcHNob3RNYXhGaWxlcywgM18wMDApO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzaGVsbFNuYXBzaG90TWF4RmlsZUJ5dGVzLCAyICogMTAyNCAqIDEwMjQpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzaGVsbFNuYXBzaG90TWF4VG90YWxCeXRlcywgMjQgKiAxMDI0ICogMTAyNCk7XG5cdH0pO1xuXG5cdHRlc3QoJ3NoZWxsIHNuYXBzaG90cyBpbmNsdWRlIGVtcHR5IGZpbGVzIGFuZCBza2lwIGJpbmFyaWVzLCBvdmVyc2l6ZWQgZmlsZXMsIGFuZCBub2RlX21vZHVsZXMnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3Qgcm9vdCA9IGF3YWl0IG1rZHRlbXAoam9pbih0bXBkaXIoKSwgJ2ZvcmdlLW9ic2VydmVyLScpKTtcblx0XHR0cnkge1xuXHRcdFx0YXdhaXQgd3JpdGVGaWxlKGpvaW4ocm9vdCwgJ2VtcHR5LnR4dCcpLCAnJyk7XG5cdFx0XHRhd2FpdCB3cml0ZUZpbGUoam9pbihyb290LCAnb2sudHh0JyksICdoZWxsbycpO1xuXHRcdFx0YXdhaXQgd3JpdGVGaWxlKGpvaW4ocm9vdCwgJ2JpbmFyeS5iaW4nKSwgQnVmZmVyLmZyb20oWzB4MDAsIDB4MDEsIDB4MDJdKSk7XG5cdFx0XHRhd2FpdCB3cml0ZUZpbGUoam9pbihyb290LCAnaHVnZS50eHQnKSwgQnVmZmVyLmFsbG9jKHNoZWxsU25hcHNob3RNYXhGaWxlQnl0ZXMgKyAxLCAweDYxKSk7XG5cdFx0XHRhd2FpdCBta2Rpcihqb2luKHJvb3QsICdub2RlX21vZHVsZXMnLCAncGtnJyksIHsgcmVjdXJzaXZlOiB0cnVlIH0pO1xuXHRcdFx0YXdhaXQgd3JpdGVGaWxlKGpvaW4ocm9vdCwgJ25vZGVfbW9kdWxlcycsICdwa2cnLCAnaW5kZXguanMnKSwgJ3NraXBwZWQnKTtcblxuXHRcdFx0Y29uc3QgZW1wdHkgPSBhd2FpdCByZWFkU2hlbGxTbmFwc2hvdChqb2luKHJvb3QsICdlbXB0eS50eHQnKSk7XG5cdFx0XHRjb25zdCBvayA9IGF3YWl0IHJlYWRTaGVsbFNuYXBzaG90KGpvaW4ocm9vdCwgJ29rLnR4dCcpKTtcblx0XHRcdGNvbnN0IGJpbmFyeSA9IGF3YWl0IHJlYWRTaGVsbFNuYXBzaG90KGpvaW4ocm9vdCwgJ2JpbmFyeS5iaW4nKSk7XG5cdFx0XHRjb25zdCBodWdlID0gYXdhaXQgcmVhZFNoZWxsU25hcHNob3Qoam9pbihyb290LCAnaHVnZS50eHQnKSk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHsgZXhpc3RlZDogZW1wdHkuZXhpc3RlZCwgY29udGVudDogZW1wdHkuY29udGVudCwgc2tpcHBlZENvbnRlbnQ6IGVtcHR5LnNraXBwZWRDb250ZW50IH0sIHsgZXhpc3RlZDogdHJ1ZSwgY29udGVudDogJycsIHNraXBwZWRDb250ZW50OiBmYWxzZSB9KTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoeyBleGlzdGVkOiBvay5leGlzdGVkLCBjb250ZW50OiBvay5jb250ZW50LCBza2lwcGVkQ29udGVudDogb2suc2tpcHBlZENvbnRlbnQgfSwgeyBleGlzdGVkOiB0cnVlLCBjb250ZW50OiAnaGVsbG8nLCBza2lwcGVkQ29udGVudDogZmFsc2UgfSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYmluYXJ5LnNraXBwZWRDb250ZW50LCB0cnVlKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChodWdlLnNraXBwZWRDb250ZW50LCB0cnVlKTtcblxuXHRcdFx0Y29uc3Qgc25hcHNob3RzID0gbmV3IE1hcCgpO1xuXHRcdFx0YXdhaXQgc25hcHNob3REaXJlY3Rvcnkocm9vdCwgc25hcHNob3RzLCA1MCwgMTAyNCAqIDEwMjQpO1xuXHRcdFx0Y29uc3Qga2V5cyA9IFsuLi5zbmFwc2hvdHMua2V5cygpXS5tYXAocGF0aCA9PiBwYXRoLnJlcGxhY2UoL1xcXFwvZywgJy8nKSk7XG5cdFx0XHRhc3NlcnQub2soa2V5cy5zb21lKHBhdGggPT4gcGF0aC5lbmRzV2l0aCgnL2VtcHR5LnR4dCcpKSk7XG5cdFx0XHRhc3NlcnQub2soa2V5cy5zb21lKHBhdGggPT4gcGF0aC5lbmRzV2l0aCgnL29rLnR4dCcpKSk7XG5cdFx0XHRhc3NlcnQub2soIWtleXMuc29tZShwYXRoID0+IHBhdGguaW5jbHVkZXMoJy9ub2RlX21vZHVsZXMvJykpKTtcblx0XHR9IGZpbmFsbHkge1xuXHRcdFx0YXdhaXQgcm0ocm9vdCwgeyByZWN1cnNpdmU6IHRydWUsIGZvcmNlOiB0cnVlIH0pO1xuXHRcdH1cblx0fSk7XG5cblx0dGVzdCgndHJ1bmNhdGVzIGEgZGlyZWN0b3J5IHdhbGsgYXQgdGhlIGZpbGUtY291bnQgYW5kIGJ5dGUgYnVkZ2V0cycsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCByb290ID0gYXdhaXQgbWtkdGVtcChqb2luKHRtcGRpcigpLCAnZm9yZ2Utb2JzZXJ2ZXItbGltaXQtJykpO1xuXHRcdHRyeSB7XG5cdFx0XHRmb3IgKGxldCBpbmRleCA9IDA7IGluZGV4IDwgNTsgaW5kZXgrKykge1xuXHRcdFx0XHRhd2FpdCB3cml0ZUZpbGUoam9pbihyb290LCBgZiR7aW5kZXh9LnR4dGApLCAneCcpO1xuXHRcdFx0fVxuXHRcdFx0Y29uc3QgYnlDb3VudCA9IG5ldyBNYXAoKTtcblx0XHRcdGNvbnN0IGNvdW50UmVzdWx0ID0gYXdhaXQgc25hcHNob3REaXJlY3Rvcnkocm9vdCwgYnlDb3VudCwgMywgMTAyNCAqIDEwMjQpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNvdW50UmVzdWx0LmZpbGVzLCAzKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChieUNvdW50LnNpemUsIDMpO1xuXG5cdFx0XHRjb25zdCBieXRlUm9vdCA9IGpvaW4ocm9vdCwgJ2J5dGVzJyk7XG5cdFx0XHRhd2FpdCBta2RpcihieXRlUm9vdCk7XG5cdFx0XHRhd2FpdCB3cml0ZUZpbGUoam9pbihieXRlUm9vdCwgJ2EudHh0JyksICdhYWFhJyk7XG5cdFx0XHRhd2FpdCB3cml0ZUZpbGUoam9pbihieXRlUm9vdCwgJ2IudHh0JyksICdiYmJiJyk7XG5cdFx0XHRhd2FpdCB3cml0ZUZpbGUoam9pbihieXRlUm9vdCwgJ2MudHh0JyksICdjY2NjJyk7XG5cdFx0XHRjb25zdCBieUJ5dGVzID0gbmV3IE1hcCgpO1xuXHRcdFx0YXdhaXQgc25hcHNob3REaXJlY3RvcnkoYnl0ZVJvb3QsIGJ5Qnl0ZXMsIDUwLCA2KTtcblx0XHRcdGNvbnN0IHN0b3JlZCA9IFsuLi5ieUJ5dGVzLnZhbHVlcygpXS5maWx0ZXIoc25hcHNob3QgPT4gIXNuYXBzaG90LnNraXBwZWRDb250ZW50KTtcblx0XHRcdGFzc2VydC5vayhzdG9yZWQubGVuZ3RoIDw9IDEpO1xuXHRcdFx0YXNzZXJ0Lm9rKFsuLi5ieUJ5dGVzLnZhbHVlcygpXS5yZWR1Y2UoKHRvdGFsLCBzbmFwc2hvdCkgPT4gdG90YWwgKyAoc25hcHNob3Quc2tpcHBlZENvbnRlbnQgPyAwIDogc25hcHNob3Quc2l6ZSksIDApIDw9IDYpO1xuXHRcdH0gZmluYWxseSB7XG5cdFx0XHRhd2FpdCBybShyb290LCB7IHJlY3Vyc2l2ZTogdHJ1ZSwgZm9yY2U6IHRydWUgfSk7XG5cdFx0fVxuXHR9KTtcbn0pO1xuIl0sCiAgIm1hcHBpbmdzIjogIkFBS0EsT0FBTyxZQUFZO0FBQ25CLFNBQVMsU0FBUyxPQUFPLElBQUksaUJBQWlCO0FBQzlDLFNBQVMsY0FBYztBQUN2QixTQUFTLFlBQVk7QUFDckIsU0FBUyxXQUFXO0FBQ3BCLFNBQVMsK0NBQStDO0FBQ3hEO0FBQUEsRUFDQztBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsT0FDTTtBQUVQLE1BQU0seUJBQXlCLE1BQU07QUFDcEMsMENBQXdDO0FBRXhDLE9BQUssd0VBQXdFLE1BQU07QUFDbEYsV0FBTyxnQkFBZ0Isa0JBQWtCLElBQUk7QUFBQSxNQUM1QyxN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
