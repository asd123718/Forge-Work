import assert from "assert";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { CancellationToken, CancellationTokenSource } from "../../../../base/common/cancellation.js";
import { CancellationError } from "../../../../base/common/errors.js";
import { DisposableStore } from "../../../../base/common/lifecycle.js";
import { join } from "../../../../base/common/path.js";
import { URI } from "../../../../base/common/uri.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../base/test/common/utils.js";
import { NullLogService } from "../../../log/common/log.js";
import { resolveAgentHostFileCompletionRoots } from "../../node/agentHostFileCompletionUtils.js";
import { AgentHostWorkspaceFiles } from "../../node/agentHostWorkspaceFiles.js";
suite("AgentHostWorkspaceFiles", () => {
  const disposables = new DisposableStore();
  const tempDirs = [];
  function createTempDir() {
    const dir = mkdtempSync(`${tmpdir()}/ahp-files-`);
    tempDirs.push(dir);
    return dir;
  }
  teardown(async () => {
    disposables.clear();
    for (const dir of tempDirs) {
      let lastErr;
      for (let i = 0; i < 10; i++) {
        try {
          rmSync(dir, { recursive: true, force: true });
          lastErr = void 0;
          break;
        } catch (err) {
          lastErr = err;
          await new Promise((r) => setTimeout(r, 50));
        }
      }
      if (lastErr) {
        throw lastErr;
      }
    }
    tempDirs.length = 0;
  });
  ensureNoDisposablesAreLeakedInTestSuite();
  test("enumerates files in the working directory", async () => {
    const dir = createTempDir();
    writeFileSync(join(dir, "a.txt"), "a");
    mkdirSync(join(dir, "sub"));
    writeFileSync(join(dir, "sub", "b.txt"), "b");
    const files = disposables.add(new AgentHostWorkspaceFiles(new NullLogService()));
    const result = await files.getFiles(URI.file(dir), CancellationToken.None);
    const names = result.files.map((uri) => uri.path).sort();
    assert.ok(names.some((p) => p.endsWith("/a.txt")), `expected a.txt in ${names.join(",")}`);
    assert.ok(names.some((p) => p.endsWith("/sub/b.txt")), `expected sub/b.txt in ${names.join(",")}`);
  });
  test("caches an empty directory as a successful result", async () => {
    const dir = createTempDir();
    const files = disposables.add(new AgentHostWorkspaceFiles(new NullLogService()));
    const workingDirectory = URI.file(dir);
    const first = await files.getFiles(workingDirectory, CancellationToken.None);
    const second = await files.getFiles(workingDirectory, CancellationToken.None);
    assert.deepStrictEqual({ first, cacheHit: first === second }, { first: { files: [], isTruncated: false }, cacheHit: true });
  });
  test("respects .gitignore", async () => {
    const dir = createTempDir();
    writeFileSync(join(dir, ".gitignore"), "ignored.txt\n");
    writeFileSync(join(dir, "kept.txt"), "k");
    writeFileSync(join(dir, "ignored.txt"), "i");
    const files = disposables.add(new AgentHostWorkspaceFiles(new NullLogService()));
    const result = await files.getFiles(URI.file(dir), CancellationToken.None);
    const names = result.files.map((uri) => uri.path);
    assert.ok(names.some((p) => p.endsWith("/kept.txt")));
    assert.ok(!names.some((p) => p.endsWith("/ignored.txt")), `ignored.txt should not be listed: ${names.join(",")}`);
  });
  test("uses outer-root ignore semantics when a declared nested root is covered", async () => {
    const dir = createTempDir();
    const nestedDir = join(dir, "sub");
    mkdirSync(nestedDir);
    writeFileSync(join(dir, ".gitignore"), "sub/parent-ignored.txt\n");
    writeFileSync(join(nestedDir, ".gitignore"), "nested-ignored.txt\n");
    writeFileSync(join(nestedDir, "kept.txt"), "kept");
    writeFileSync(join(nestedDir, "parent-ignored.txt"), "ignored by parent");
    writeFileSync(join(nestedDir, "nested-ignored.txt"), "ignored by nested");
    const roots = resolveAgentHostFileCompletionRoots([URI.file(dir), URI.file(nestedDir)]);
    const files = disposables.add(new AgentHostWorkspaceFiles(new NullLogService()));
    const results = await Promise.all(roots.enumerationRoots.map((root) => files.getFiles(root, CancellationToken.None)));
    assert.deepStrictEqual({
      enumeratedRoots: roots.enumerationRoots.map((root) => root.path),
      files: results.flatMap((result) => result.files).map((uri) => uri.path.slice(URI.file(dir).path.length + 1)).sort()
    }, {
      enumeratedRoots: [URI.file(dir).path],
      files: [".gitignore", "sub/.gitignore", "sub/kept.txt"]
    });
  });
  test("excludes the .git directory", async () => {
    const dir = createTempDir();
    writeFileSync(join(dir, "a.txt"), "a");
    mkdirSync(join(dir, ".git"));
    writeFileSync(join(dir, ".git", "HEAD"), "ref: refs/heads/main");
    const files = disposables.add(new AgentHostWorkspaceFiles(new NullLogService()));
    const result = await files.getFiles(URI.file(dir), CancellationToken.None);
    const names = result.files.map((uri) => uri.path);
    assert.ok(names.some((p) => p.endsWith("/a.txt")));
    assert.ok(!names.some((p) => p.includes("/.git/")), `.git contents should be excluded: ${names.join(",")}`);
  });
  test("returns [] for non-file URIs", async () => {
    const files = disposables.add(new AgentHostWorkspaceFiles(new NullLogService()));
    const result = await files.getFiles(URI.parse("vscode-vfs://github/foo/bar"), CancellationToken.None);
    assert.deepStrictEqual(result, { files: [], isTruncated: false });
  });
  test("caches concurrent calls for the same working directory", async () => {
    const dir = createTempDir();
    writeFileSync(join(dir, "a.txt"), "a");
    const files = disposables.add(new AgentHostWorkspaceFiles(new NullLogService()));
    const wd = URI.file(dir);
    const [r1, r2] = await Promise.all([
      files.getFiles(wd, CancellationToken.None),
      files.getFiles(wd, CancellationToken.None)
    ]);
    assert.strictEqual(r1, r2, "concurrent calls should share the same promise / result array");
  });
  test("rejects with CancellationError on cancellation", async () => {
    const dir = createTempDir();
    writeFileSync(join(dir, "a.txt"), "a");
    const files = disposables.add(new AgentHostWorkspaceFiles(new NullLogService()));
    const cts = new CancellationTokenSource();
    const promise = files.getFiles(URI.file(dir), cts.token);
    cts.cancel();
    await assert.rejects(promise, (err) => err instanceof CancellationError);
    cts.dispose();
  });
  test("cancelling one caller does not poison concurrent callers sharing the cache", async () => {
    const dir = createTempDir();
    writeFileSync(join(dir, "a.txt"), "a");
    const files = disposables.add(new AgentHostWorkspaceFiles(new NullLogService()));
    const wd = URI.file(dir);
    const cts = new CancellationTokenSource();
    const cancelled = files.getFiles(wd, cts.token);
    const survivor = files.getFiles(wd, CancellationToken.None);
    cts.cancel();
    cts.dispose();
    await assert.rejects(cancelled, (err) => err instanceof CancellationError);
    const result = await survivor;
    assert.ok(result.files.some((uri) => uri.path.endsWith("/a.txt")), `survivor should resolve with files even when first caller cancelled: ${result.files.map((u) => u.path).join(",")}`);
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxwbGF0Zm9ybVxcYWdlbnRIb3N0XFx0ZXN0XFxub2RlXFxhZ2VudEhvc3RXb3Jrc3BhY2VGaWxlcy50ZXN0LnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IGFzc2VydCBmcm9tICdhc3NlcnQnO1xuaW1wb3J0IHsgbWtkaXJTeW5jLCBta2R0ZW1wU3luYywgcm1TeW5jLCB3cml0ZUZpbGVTeW5jIH0gZnJvbSAnZnMnO1xuaW1wb3J0IHsgdG1wZGlyIH0gZnJvbSAnb3MnO1xuaW1wb3J0IHsgQ2FuY2VsbGF0aW9uVG9rZW4sIENhbmNlbGxhdGlvblRva2VuU291cmNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vY2FuY2VsbGF0aW9uLmpzJztcbmltcG9ydCB7IENhbmNlbGxhdGlvbkVycm9yIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vZXJyb3JzLmpzJztcbmltcG9ydCB7IERpc3Bvc2FibGVTdG9yZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBqb2luIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vcGF0aC5qcyc7XG5pbXBvcnQgeyBVUkkgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi91cmkuanMnO1xuaW1wb3J0IHsgZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS90ZXN0L2NvbW1vbi91dGlscy5qcyc7XG5pbXBvcnQgeyBOdWxsTG9nU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL2xvZy9jb21tb24vbG9nLmpzJztcbmltcG9ydCB7IHJlc29sdmVBZ2VudEhvc3RGaWxlQ29tcGxldGlvblJvb3RzIH0gZnJvbSAnLi4vLi4vbm9kZS9hZ2VudEhvc3RGaWxlQ29tcGxldGlvblV0aWxzLmpzJztcbmltcG9ydCB7IEFnZW50SG9zdFdvcmtzcGFjZUZpbGVzIH0gZnJvbSAnLi4vLi4vbm9kZS9hZ2VudEhvc3RXb3Jrc3BhY2VGaWxlcy5qcyc7XG5cbnN1aXRlKCdBZ2VudEhvc3RXb3Jrc3BhY2VGaWxlcycsICgpID0+IHtcblxuXHRjb25zdCBkaXNwb3NhYmxlcyA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblx0Y29uc3QgdGVtcERpcnM6IHN0cmluZ1tdID0gW107XG5cblx0ZnVuY3Rpb24gY3JlYXRlVGVtcERpcigpOiBzdHJpbmcge1xuXHRcdGNvbnN0IGRpciA9IG1rZHRlbXBTeW5jKGAke3RtcGRpcigpfS9haHAtZmlsZXMtYCk7XG5cdFx0dGVtcERpcnMucHVzaChkaXIpO1xuXHRcdHJldHVybiBkaXI7XG5cdH1cblxuXHR0ZWFyZG93bihhc3luYyAoKSA9PiB7XG5cdFx0ZGlzcG9zYWJsZXMuY2xlYXIoKTtcblx0XHQvLyBPbiBXaW5kb3dzLCByaXBncmVwIGhhbmRsZXMgbWF5IHRha2UgYSB0aWNrIHRvIHJlbGVhc2UgYWZ0ZXJcblx0XHQvLyBkaXNwb3NlKCkga2lsbHMgdGhlIGNoaWxkIHByb2Nlc3MuIFJldHJ5IHJtU3luYyByYXRoZXIgdGhhblxuXHRcdC8vIGZhaWxpbmcgb24gdHJhbnNpZW50IEVCVVNZLlxuXHRcdGZvciAoY29uc3QgZGlyIG9mIHRlbXBEaXJzKSB7XG5cdFx0XHRsZXQgbGFzdEVycjogdW5rbm93bjtcblx0XHRcdGZvciAobGV0IGkgPSAwOyBpIDwgMTA7IGkrKykge1xuXHRcdFx0XHR0cnkge1xuXHRcdFx0XHRcdHJtU3luYyhkaXIsIHsgcmVjdXJzaXZlOiB0cnVlLCBmb3JjZTogdHJ1ZSB9KTtcblx0XHRcdFx0XHRsYXN0RXJyID0gdW5kZWZpbmVkO1xuXHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHR9IGNhdGNoIChlcnIpIHtcblx0XHRcdFx0XHRsYXN0RXJyID0gZXJyO1xuXHRcdFx0XHRcdGF3YWl0IG5ldyBQcm9taXNlKHIgPT4gc2V0VGltZW91dChyLCA1MCkpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0XHRpZiAobGFzdEVycikge1xuXHRcdFx0XHR0aHJvdyBsYXN0RXJyO1xuXHRcdFx0fVxuXHRcdH1cblx0XHR0ZW1wRGlycy5sZW5ndGggPSAwO1xuXHR9KTtcblxuXHRlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUoKTtcblxuXHR0ZXN0KCdlbnVtZXJhdGVzIGZpbGVzIGluIHRoZSB3b3JraW5nIGRpcmVjdG9yeScsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBkaXIgPSBjcmVhdGVUZW1wRGlyKCk7XG5cdFx0d3JpdGVGaWxlU3luYyhqb2luKGRpciwgJ2EudHh0JyksICdhJyk7XG5cdFx0bWtkaXJTeW5jKGpvaW4oZGlyLCAnc3ViJykpO1xuXHRcdHdyaXRlRmlsZVN5bmMoam9pbihkaXIsICdzdWInLCAnYi50eHQnKSwgJ2InKTtcblxuXHRcdGNvbnN0IGZpbGVzID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBBZ2VudEhvc3RXb3Jrc3BhY2VGaWxlcyhuZXcgTnVsbExvZ1NlcnZpY2UoKSkpO1xuXHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IGZpbGVzLmdldEZpbGVzKFVSSS5maWxlKGRpciksIENhbmNlbGxhdGlvblRva2VuLk5vbmUpO1xuXHRcdGNvbnN0IG5hbWVzID0gcmVzdWx0LmZpbGVzLm1hcCh1cmkgPT4gdXJpLnBhdGgpLnNvcnQoKTtcblxuXHRcdGFzc2VydC5vayhuYW1lcy5zb21lKHAgPT4gcC5lbmRzV2l0aCgnL2EudHh0JykpLCBgZXhwZWN0ZWQgYS50eHQgaW4gJHtuYW1lcy5qb2luKCcsJyl9YCk7XG5cdFx0YXNzZXJ0Lm9rKG5hbWVzLnNvbWUocCA9PiBwLmVuZHNXaXRoKCcvc3ViL2IudHh0JykpLCBgZXhwZWN0ZWQgc3ViL2IudHh0IGluICR7bmFtZXMuam9pbignLCcpfWApO1xuXHR9KTtcblxuXHR0ZXN0KCdjYWNoZXMgYW4gZW1wdHkgZGlyZWN0b3J5IGFzIGEgc3VjY2Vzc2Z1bCByZXN1bHQnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgZGlyID0gY3JlYXRlVGVtcERpcigpO1xuXHRcdGNvbnN0IGZpbGVzID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBBZ2VudEhvc3RXb3Jrc3BhY2VGaWxlcyhuZXcgTnVsbExvZ1NlcnZpY2UoKSkpO1xuXHRcdGNvbnN0IHdvcmtpbmdEaXJlY3RvcnkgPSBVUkkuZmlsZShkaXIpO1xuXG5cdFx0Y29uc3QgZmlyc3QgPSBhd2FpdCBmaWxlcy5nZXRGaWxlcyh3b3JraW5nRGlyZWN0b3J5LCBDYW5jZWxsYXRpb25Ub2tlbi5Ob25lKTtcblx0XHRjb25zdCBzZWNvbmQgPSBhd2FpdCBmaWxlcy5nZXRGaWxlcyh3b3JraW5nRGlyZWN0b3J5LCBDYW5jZWxsYXRpb25Ub2tlbi5Ob25lKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoeyBmaXJzdCwgY2FjaGVIaXQ6IGZpcnN0ID09PSBzZWNvbmQgfSwgeyBmaXJzdDogeyBmaWxlczogW10sIGlzVHJ1bmNhdGVkOiBmYWxzZSB9LCBjYWNoZUhpdDogdHJ1ZSB9KTtcblx0fSk7XG5cblx0dGVzdCgncmVzcGVjdHMgLmdpdGlnbm9yZScsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBkaXIgPSBjcmVhdGVUZW1wRGlyKCk7XG5cdFx0d3JpdGVGaWxlU3luYyhqb2luKGRpciwgJy5naXRpZ25vcmUnKSwgJ2lnbm9yZWQudHh0XFxuJyk7XG5cdFx0d3JpdGVGaWxlU3luYyhqb2luKGRpciwgJ2tlcHQudHh0JyksICdrJyk7XG5cdFx0d3JpdGVGaWxlU3luYyhqb2luKGRpciwgJ2lnbm9yZWQudHh0JyksICdpJyk7XG5cblx0XHRjb25zdCBmaWxlcyA9IGRpc3Bvc2FibGVzLmFkZChuZXcgQWdlbnRIb3N0V29ya3NwYWNlRmlsZXMobmV3IE51bGxMb2dTZXJ2aWNlKCkpKTtcblx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCBmaWxlcy5nZXRGaWxlcyhVUkkuZmlsZShkaXIpLCBDYW5jZWxsYXRpb25Ub2tlbi5Ob25lKTtcblx0XHRjb25zdCBuYW1lcyA9IHJlc3VsdC5maWxlcy5tYXAodXJpID0+IHVyaS5wYXRoKTtcblxuXHRcdGFzc2VydC5vayhuYW1lcy5zb21lKHAgPT4gcC5lbmRzV2l0aCgnL2tlcHQudHh0JykpKTtcblx0XHRhc3NlcnQub2soIW5hbWVzLnNvbWUocCA9PiBwLmVuZHNXaXRoKCcvaWdub3JlZC50eHQnKSksIGBpZ25vcmVkLnR4dCBzaG91bGQgbm90IGJlIGxpc3RlZDogJHtuYW1lcy5qb2luKCcsJyl9YCk7XG5cdH0pO1xuXG5cdHRlc3QoJ3VzZXMgb3V0ZXItcm9vdCBpZ25vcmUgc2VtYW50aWNzIHdoZW4gYSBkZWNsYXJlZCBuZXN0ZWQgcm9vdCBpcyBjb3ZlcmVkJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IGRpciA9IGNyZWF0ZVRlbXBEaXIoKTtcblx0XHRjb25zdCBuZXN0ZWREaXIgPSBqb2luKGRpciwgJ3N1YicpO1xuXHRcdG1rZGlyU3luYyhuZXN0ZWREaXIpO1xuXHRcdHdyaXRlRmlsZVN5bmMoam9pbihkaXIsICcuZ2l0aWdub3JlJyksICdzdWIvcGFyZW50LWlnbm9yZWQudHh0XFxuJyk7XG5cdFx0d3JpdGVGaWxlU3luYyhqb2luKG5lc3RlZERpciwgJy5naXRpZ25vcmUnKSwgJ25lc3RlZC1pZ25vcmVkLnR4dFxcbicpO1xuXHRcdHdyaXRlRmlsZVN5bmMoam9pbihuZXN0ZWREaXIsICdrZXB0LnR4dCcpLCAna2VwdCcpO1xuXHRcdHdyaXRlRmlsZVN5bmMoam9pbihuZXN0ZWREaXIsICdwYXJlbnQtaWdub3JlZC50eHQnKSwgJ2lnbm9yZWQgYnkgcGFyZW50Jyk7XG5cdFx0d3JpdGVGaWxlU3luYyhqb2luKG5lc3RlZERpciwgJ25lc3RlZC1pZ25vcmVkLnR4dCcpLCAnaWdub3JlZCBieSBuZXN0ZWQnKTtcblxuXHRcdGNvbnN0IHJvb3RzID0gcmVzb2x2ZUFnZW50SG9zdEZpbGVDb21wbGV0aW9uUm9vdHMoW1VSSS5maWxlKGRpciksIFVSSS5maWxlKG5lc3RlZERpcildKTtcblx0XHRjb25zdCBmaWxlcyA9IGRpc3Bvc2FibGVzLmFkZChuZXcgQWdlbnRIb3N0V29ya3NwYWNlRmlsZXMobmV3IE51bGxMb2dTZXJ2aWNlKCkpKTtcblx0XHRjb25zdCByZXN1bHRzID0gYXdhaXQgUHJvbWlzZS5hbGwocm9vdHMuZW51bWVyYXRpb25Sb290cy5tYXAocm9vdCA9PiBmaWxlcy5nZXRGaWxlcyhyb290LCBDYW5jZWxsYXRpb25Ub2tlbi5Ob25lKSkpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRlbnVtZXJhdGVkUm9vdHM6IHJvb3RzLmVudW1lcmF0aW9uUm9vdHMubWFwKHJvb3QgPT4gcm9vdC5wYXRoKSxcblx0XHRcdGZpbGVzOiByZXN1bHRzLmZsYXRNYXAocmVzdWx0ID0+IHJlc3VsdC5maWxlcykubWFwKHVyaSA9PiB1cmkucGF0aC5zbGljZShVUkkuZmlsZShkaXIpLnBhdGgubGVuZ3RoICsgMSkpLnNvcnQoKSxcblx0XHR9LCB7XG5cdFx0XHRlbnVtZXJhdGVkUm9vdHM6IFtVUkkuZmlsZShkaXIpLnBhdGhdLFxuXHRcdFx0ZmlsZXM6IFsnLmdpdGlnbm9yZScsICdzdWIvLmdpdGlnbm9yZScsICdzdWIva2VwdC50eHQnXSxcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnZXhjbHVkZXMgdGhlIC5naXQgZGlyZWN0b3J5JywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IGRpciA9IGNyZWF0ZVRlbXBEaXIoKTtcblx0XHR3cml0ZUZpbGVTeW5jKGpvaW4oZGlyLCAnYS50eHQnKSwgJ2EnKTtcblx0XHRta2RpclN5bmMoam9pbihkaXIsICcuZ2l0JykpO1xuXHRcdHdyaXRlRmlsZVN5bmMoam9pbihkaXIsICcuZ2l0JywgJ0hFQUQnKSwgJ3JlZjogcmVmcy9oZWFkcy9tYWluJyk7XG5cblx0XHRjb25zdCBmaWxlcyA9IGRpc3Bvc2FibGVzLmFkZChuZXcgQWdlbnRIb3N0V29ya3NwYWNlRmlsZXMobmV3IE51bGxMb2dTZXJ2aWNlKCkpKTtcblx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCBmaWxlcy5nZXRGaWxlcyhVUkkuZmlsZShkaXIpLCBDYW5jZWxsYXRpb25Ub2tlbi5Ob25lKTtcblx0XHRjb25zdCBuYW1lcyA9IHJlc3VsdC5maWxlcy5tYXAodXJpID0+IHVyaS5wYXRoKTtcblxuXHRcdGFzc2VydC5vayhuYW1lcy5zb21lKHAgPT4gcC5lbmRzV2l0aCgnL2EudHh0JykpKTtcblx0XHRhc3NlcnQub2soIW5hbWVzLnNvbWUocCA9PiBwLmluY2x1ZGVzKCcvLmdpdC8nKSksIGAuZ2l0IGNvbnRlbnRzIHNob3VsZCBiZSBleGNsdWRlZDogJHtuYW1lcy5qb2luKCcsJyl9YCk7XG5cdH0pO1xuXG5cdHRlc3QoJ3JldHVybnMgW10gZm9yIG5vbi1maWxlIFVSSXMnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgZmlsZXMgPSBkaXNwb3NhYmxlcy5hZGQobmV3IEFnZW50SG9zdFdvcmtzcGFjZUZpbGVzKG5ldyBOdWxsTG9nU2VydmljZSgpKSk7XG5cdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgZmlsZXMuZ2V0RmlsZXMoVVJJLnBhcnNlKCd2c2NvZGUtdmZzOi8vZ2l0aHViL2Zvby9iYXInKSwgQ2FuY2VsbGF0aW9uVG9rZW4uTm9uZSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChyZXN1bHQsIHsgZmlsZXM6IFtdLCBpc1RydW5jYXRlZDogZmFsc2UgfSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2NhY2hlcyBjb25jdXJyZW50IGNhbGxzIGZvciB0aGUgc2FtZSB3b3JraW5nIGRpcmVjdG9yeScsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBkaXIgPSBjcmVhdGVUZW1wRGlyKCk7XG5cdFx0d3JpdGVGaWxlU3luYyhqb2luKGRpciwgJ2EudHh0JyksICdhJyk7XG5cblx0XHRjb25zdCBmaWxlcyA9IGRpc3Bvc2FibGVzLmFkZChuZXcgQWdlbnRIb3N0V29ya3NwYWNlRmlsZXMobmV3IE51bGxMb2dTZXJ2aWNlKCkpKTtcblx0XHRjb25zdCB3ZCA9IFVSSS5maWxlKGRpcik7XG5cdFx0Y29uc3QgW3IxLCByMl0gPSBhd2FpdCBQcm9taXNlLmFsbChbXG5cdFx0XHRmaWxlcy5nZXRGaWxlcyh3ZCwgQ2FuY2VsbGF0aW9uVG9rZW4uTm9uZSksXG5cdFx0XHRmaWxlcy5nZXRGaWxlcyh3ZCwgQ2FuY2VsbGF0aW9uVG9rZW4uTm9uZSksXG5cdFx0XSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHIxLCByMiwgJ2NvbmN1cnJlbnQgY2FsbHMgc2hvdWxkIHNoYXJlIHRoZSBzYW1lIHByb21pc2UgLyByZXN1bHQgYXJyYXknKTtcblx0fSk7XG5cblx0dGVzdCgncmVqZWN0cyB3aXRoIENhbmNlbGxhdGlvbkVycm9yIG9uIGNhbmNlbGxhdGlvbicsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBkaXIgPSBjcmVhdGVUZW1wRGlyKCk7XG5cdFx0d3JpdGVGaWxlU3luYyhqb2luKGRpciwgJ2EudHh0JyksICdhJyk7XG5cblx0XHRjb25zdCBmaWxlcyA9IGRpc3Bvc2FibGVzLmFkZChuZXcgQWdlbnRIb3N0V29ya3NwYWNlRmlsZXMobmV3IE51bGxMb2dTZXJ2aWNlKCkpKTtcblx0XHRjb25zdCBjdHMgPSBuZXcgQ2FuY2VsbGF0aW9uVG9rZW5Tb3VyY2UoKTtcblx0XHRjb25zdCBwcm9taXNlID0gZmlsZXMuZ2V0RmlsZXMoVVJJLmZpbGUoZGlyKSwgY3RzLnRva2VuKTtcblx0XHRjdHMuY2FuY2VsKCk7XG5cdFx0YXdhaXQgYXNzZXJ0LnJlamVjdHMocHJvbWlzZSwgKGVycjogdW5rbm93bikgPT4gZXJyIGluc3RhbmNlb2YgQ2FuY2VsbGF0aW9uRXJyb3IpO1xuXHRcdGN0cy5kaXNwb3NlKCk7XG5cdH0pO1xuXG5cdHRlc3QoJ2NhbmNlbGxpbmcgb25lIGNhbGxlciBkb2VzIG5vdCBwb2lzb24gY29uY3VycmVudCBjYWxsZXJzIHNoYXJpbmcgdGhlIGNhY2hlJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IGRpciA9IGNyZWF0ZVRlbXBEaXIoKTtcblx0XHR3cml0ZUZpbGVTeW5jKGpvaW4oZGlyLCAnYS50eHQnKSwgJ2EnKTtcblxuXHRcdGNvbnN0IGZpbGVzID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBBZ2VudEhvc3RXb3Jrc3BhY2VGaWxlcyhuZXcgTnVsbExvZ1NlcnZpY2UoKSkpO1xuXHRcdGNvbnN0IHdkID0gVVJJLmZpbGUoZGlyKTtcblxuXHRcdGNvbnN0IGN0cyA9IG5ldyBDYW5jZWxsYXRpb25Ub2tlblNvdXJjZSgpO1xuXHRcdGNvbnN0IGNhbmNlbGxlZCA9IGZpbGVzLmdldEZpbGVzKHdkLCBjdHMudG9rZW4pO1xuXHRcdGNvbnN0IHN1cnZpdm9yID0gZmlsZXMuZ2V0RmlsZXMod2QsIENhbmNlbGxhdGlvblRva2VuLk5vbmUpO1xuXHRcdGN0cy5jYW5jZWwoKTtcblx0XHRjdHMuZGlzcG9zZSgpO1xuXG5cdFx0YXdhaXQgYXNzZXJ0LnJlamVjdHMoY2FuY2VsbGVkLCAoZXJyOiB1bmtub3duKSA9PiBlcnIgaW5zdGFuY2VvZiBDYW5jZWxsYXRpb25FcnJvcik7XG5cdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgc3Vydml2b3I7XG5cdFx0YXNzZXJ0Lm9rKHJlc3VsdC5maWxlcy5zb21lKHVyaSA9PiB1cmkucGF0aC5lbmRzV2l0aCgnL2EudHh0JykpLCBgc3Vydml2b3Igc2hvdWxkIHJlc29sdmUgd2l0aCBmaWxlcyBldmVuIHdoZW4gZmlyc3QgY2FsbGVyIGNhbmNlbGxlZDogJHtyZXN1bHQuZmlsZXMubWFwKHUgPT4gdS5wYXRoKS5qb2luKCcsJyl9YCk7XG5cdH0pO1xufSk7XG4iXSwKICAibWFwcGluZ3MiOiAiQUFLQSxPQUFPLFlBQVk7QUFDbkIsU0FBUyxXQUFXLGFBQWEsUUFBUSxxQkFBcUI7QUFDOUQsU0FBUyxjQUFjO0FBQ3ZCLFNBQVMsbUJBQW1CLCtCQUErQjtBQUMzRCxTQUFTLHlCQUF5QjtBQUNsQyxTQUFTLHVCQUF1QjtBQUNoQyxTQUFTLFlBQVk7QUFDckIsU0FBUyxXQUFXO0FBQ3BCLFNBQVMsK0NBQStDO0FBQ3hELFNBQVMsc0JBQXNCO0FBQy9CLFNBQVMsMkNBQTJDO0FBQ3BELFNBQVMsK0JBQStCO0FBRXhDLE1BQU0sMkJBQTJCLE1BQU07QUFFdEMsUUFBTSxjQUFjLElBQUksZ0JBQWdCO0FBQ3hDLFFBQU0sV0FBcUIsQ0FBQztBQUU1QixXQUFTLGdCQUF3QjtBQUNoQyxVQUFNLE1BQU0sWUFBWSxHQUFHLE9BQU8sQ0FBQyxhQUFhO0FBQ2hELGFBQVMsS0FBSyxHQUFHO0FBQ2pCLFdBQU87QUFBQSxFQUNSO0FBRUEsV0FBUyxZQUFZO0FBQ3BCLGdCQUFZLE1BQU07QUFJbEIsZUFBVyxPQUFPLFVBQVU7QUFDM0IsVUFBSTtBQUNKLGVBQVMsSUFBSSxHQUFHLElBQUksSUFBSSxLQUFLO0FBQzVCLFlBQUk7QUFDSCxpQkFBTyxLQUFLLEVBQUUsV0FBVyxNQUFNLE9BQU8sS0FBSyxDQUFDO0FBQzVDLG9CQUFVO0FBQ1Y7QUFBQSxRQUNELFNBQVMsS0FBSztBQUNiLG9CQUFVO0FBQ1YsZ0JBQU0sSUFBSSxRQUFRLE9BQUssV0FBVyxHQUFHLEVBQUUsQ0FBQztBQUFBLFFBQ3pDO0FBQUEsTUFDRDtBQUNBLFVBQUksU0FBUztBQUNaLGNB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
