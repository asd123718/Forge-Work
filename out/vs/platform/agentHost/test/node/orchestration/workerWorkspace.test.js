import * as assert from "assert";
import { execFile } from "child_process";
import { access, mkdtemp, readFile, rename, rm, unlink, writeFile } from "fs/promises";
import { tmpdir } from "os";
import { dirname, join } from "../../../../../base/common/path.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../../base/test/common/utils.js";
import { openWorkerWorkspace } from "../../../node/orchestration/workerWorkspace.js";
function git(cwd, args) {
  return new Promise((resolve, reject) => {
    execFile("git", [...args], { cwd, windowsHide: true, encoding: "utf8" }, (error, stdout) => error ? reject(error) : resolve(stdout));
  });
}
async function createRepository() {
  const root = await mkdtemp(join(tmpdir(), "forge-worker-workspace-"));
  await git(root, ["init"]);
  await writeFile(join(root, "modify.txt"), "committed\n");
  await writeFile(join(root, "delete.txt"), "delete me\n");
  await writeFile(join(root, "rename-old.txt"), "rename me\n");
  await git(root, ["add", "--all"]);
  await git(root, ["-c", "user.name=Forge Test", "-c", "user.email=forge-test@invalid", "commit", "--no-gpg-sign", "-m", "initial"]);
  return root;
}
async function missing(path) {
  try {
    await access(path);
    return false;
  } catch {
    return true;
  }
}
suite("Forge worker workspace", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  test("mirrors dirty state and merges add, modify, delete, and rename", async () => {
    const root = await createRepository();
    try {
      await writeFile(join(root, "modify.txt"), "dirty baseline\n");
      await unlink(join(root, "delete.txt"));
      await writeFile(join(root, "untracked.txt"), "untracked baseline\n");
      const worker = await openWorkerWorkspace(root, "all-file-operations");
      try {
        assert.strictEqual(await readFile(join(worker.path, "modify.txt"), "utf8"), "dirty baseline\n");
        assert.ok(await missing(join(worker.path, "delete.txt")));
        assert.strictEqual(await readFile(join(worker.path, "untracked.txt"), "utf8"), "untracked baseline\n");
        await writeFile(join(worker.path, "modify.txt"), "worker result\n");
        await unlink(join(worker.path, "untracked.txt"));
        await rename(join(worker.path, "rename-old.txt"), join(worker.path, "rename-new.txt"));
        await writeFile(join(worker.path, "added.txt"), "added\n");
        const changed = await worker.collectChangedFiles();
        assert.deepStrictEqual([...changed].sort(), ["added.txt", "modify.txt", "rename-new.txt", "rename-old.txt", "untracked.txt"]);
        assert.deepStrictEqual([...await worker.mergeInto(root)].sort(), [...changed].sort());
      } finally {
        await worker.dispose();
      }
      assert.strictEqual(await readFile(join(root, "modify.txt"), "utf8"), "worker result\n");
      assert.ok(await missing(join(root, "delete.txt")));
      assert.ok(await missing(join(root, "untracked.txt")));
      assert.ok(await missing(join(root, "rename-old.txt")));
      assert.strictEqual((await readFile(join(root, "rename-new.txt"), "utf8")).trim(), "rename me");
      assert.strictEqual(await readFile(join(root, "added.txt"), "utf8"), "added\n");
      assert.strictEqual((await git(root, ["branch", "--list", "forge/orch-*"])).trim(), "");
      assert.ok(await missing(join(dirname(root), `${root.split(/[\\/]/).pop()}.worktrees`)));
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
  test("rejects a merge when the user changed the same file", async () => {
    const root = await createRepository();
    try {
      const worker = await openWorkerWorkspace(root, "conflict");
      try {
        await writeFile(join(worker.path, "modify.txt"), "worker result\n");
        await writeFile(join(root, "modify.txt"), "new user edit\n");
        await assert.rejects(worker.mergeInto(root), /conflict.*modify\.txt/i);
        assert.strictEqual(await readFile(join(root, "modify.txt"), "utf8"), "new user edit\n");
      } finally {
        await worker.dispose();
      }
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
  test("refuses to run without Git isolation", async () => {
    const root = await mkdtemp(join(tmpdir(), "forge-worker-no-git-"));
    try {
      await assert.rejects(openWorkerWorkspace(root, "unsafe"), /require a Git workspace/i);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxwbGF0Zm9ybVxcYWdlbnRIb3N0XFx0ZXN0XFxub2RlXFxvcmNoZXN0cmF0aW9uXFx3b3JrZXJXb3Jrc3BhY2UudGVzdC50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCAqIGFzIGFzc2VydCBmcm9tICdhc3NlcnQnO1xuaW1wb3J0IHsgZXhlY0ZpbGUgfSBmcm9tICdjaGlsZF9wcm9jZXNzJztcbmltcG9ydCB7IGFjY2VzcywgbWtkdGVtcCwgcmVhZEZpbGUsIHJlbmFtZSwgcm0sIHVubGluaywgd3JpdGVGaWxlIH0gZnJvbSAnZnMvcHJvbWlzZXMnO1xuaW1wb3J0IHsgdG1wZGlyIH0gZnJvbSAnb3MnO1xuaW1wb3J0IHsgZGlybmFtZSwgam9pbiB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3BhdGguanMnO1xuaW1wb3J0IHsgZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS90ZXN0L2NvbW1vbi91dGlscy5qcyc7XG5pbXBvcnQgeyBvcGVuV29ya2VyV29ya3NwYWNlIH0gZnJvbSAnLi4vLi4vLi4vbm9kZS9vcmNoZXN0cmF0aW9uL3dvcmtlcldvcmtzcGFjZS5qcyc7XG5cbmZ1bmN0aW9uIGdpdChjd2Q6IHN0cmluZywgYXJnczogcmVhZG9ubHkgc3RyaW5nW10pOiBQcm9taXNlPHN0cmluZz4ge1xuXHRyZXR1cm4gbmV3IFByb21pc2UoKHJlc29sdmUsIHJlamVjdCkgPT4ge1xuXHRcdGV4ZWNGaWxlKCdnaXQnLCBbLi4uYXJnc10sIHsgY3dkLCB3aW5kb3dzSGlkZTogdHJ1ZSwgZW5jb2Rpbmc6ICd1dGY4JyB9LCAoZXJyb3IsIHN0ZG91dCkgPT4gZXJyb3IgPyByZWplY3QoZXJyb3IpIDogcmVzb2x2ZShzdGRvdXQpKTtcblx0fSk7XG59XG5cbmFzeW5jIGZ1bmN0aW9uIGNyZWF0ZVJlcG9zaXRvcnkoKTogUHJvbWlzZTxzdHJpbmc+IHtcblx0Y29uc3Qgcm9vdCA9IGF3YWl0IG1rZHRlbXAoam9pbih0bXBkaXIoKSwgJ2ZvcmdlLXdvcmtlci13b3Jrc3BhY2UtJykpO1xuXHRhd2FpdCBnaXQocm9vdCwgWydpbml0J10pO1xuXHRhd2FpdCB3cml0ZUZpbGUoam9pbihyb290LCAnbW9kaWZ5LnR4dCcpLCAnY29tbWl0dGVkXFxuJyk7XG5cdGF3YWl0IHdyaXRlRmlsZShqb2luKHJvb3QsICdkZWxldGUudHh0JyksICdkZWxldGUgbWVcXG4nKTtcblx0YXdhaXQgd3JpdGVGaWxlKGpvaW4ocm9vdCwgJ3JlbmFtZS1vbGQudHh0JyksICdyZW5hbWUgbWVcXG4nKTtcblx0YXdhaXQgZ2l0KHJvb3QsIFsnYWRkJywgJy0tYWxsJ10pO1xuXHRhd2FpdCBnaXQocm9vdCwgWyctYycsICd1c2VyLm5hbWU9Rm9yZ2UgVGVzdCcsICctYycsICd1c2VyLmVtYWlsPWZvcmdlLXRlc3RAaW52YWxpZCcsICdjb21taXQnLCAnLS1uby1ncGctc2lnbicsICctbScsICdpbml0aWFsJ10pO1xuXHRyZXR1cm4gcm9vdDtcbn1cblxuYXN5bmMgZnVuY3Rpb24gbWlzc2luZyhwYXRoOiBzdHJpbmcpOiBQcm9taXNlPGJvb2xlYW4+IHtcblx0dHJ5IHtcblx0XHRhd2FpdCBhY2Nlc3MocGF0aCk7XG5cdFx0cmV0dXJuIGZhbHNlO1xuXHR9IGNhdGNoIHtcblx0XHRyZXR1cm4gdHJ1ZTtcblx0fVxufVxuXG5zdWl0ZSgnRm9yZ2Ugd29ya2VyIHdvcmtzcGFjZScsICgpID0+IHtcblx0ZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlKCk7XG5cblx0dGVzdCgnbWlycm9ycyBkaXJ0eSBzdGF0ZSBhbmQgbWVyZ2VzIGFkZCwgbW9kaWZ5LCBkZWxldGUsIGFuZCByZW5hbWUnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3Qgcm9vdCA9IGF3YWl0IGNyZWF0ZVJlcG9zaXRvcnkoKTtcblx0XHR0cnkge1xuXHRcdFx0YXdhaXQgd3JpdGVGaWxlKGpvaW4ocm9vdCwgJ21vZGlmeS50eHQnKSwgJ2RpcnR5IGJhc2VsaW5lXFxuJyk7XG5cdFx0XHRhd2FpdCB1bmxpbmsoam9pbihyb290LCAnZGVsZXRlLnR4dCcpKTtcblx0XHRcdGF3YWl0IHdyaXRlRmlsZShqb2luKHJvb3QsICd1bnRyYWNrZWQudHh0JyksICd1bnRyYWNrZWQgYmFzZWxpbmVcXG4nKTtcblxuXHRcdFx0Y29uc3Qgd29ya2VyID0gYXdhaXQgb3BlbldvcmtlcldvcmtzcGFjZShyb290LCAnYWxsLWZpbGUtb3BlcmF0aW9ucycpO1xuXHRcdFx0dHJ5IHtcblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGF3YWl0IHJlYWRGaWxlKGpvaW4od29ya2VyLnBhdGgsICdtb2RpZnkudHh0JyksICd1dGY4JyksICdkaXJ0eSBiYXNlbGluZVxcbicpO1xuXHRcdFx0XHRhc3NlcnQub2soYXdhaXQgbWlzc2luZyhqb2luKHdvcmtlci5wYXRoLCAnZGVsZXRlLnR4dCcpKSk7XG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChhd2FpdCByZWFkRmlsZShqb2luKHdvcmtlci5wYXRoLCAndW50cmFja2VkLnR4dCcpLCAndXRmOCcpLCAndW50cmFja2VkIGJhc2VsaW5lXFxuJyk7XG5cblx0XHRcdFx0YXdhaXQgd3JpdGVGaWxlKGpvaW4od29ya2VyLnBhdGgsICdtb2RpZnkudHh0JyksICd3b3JrZXIgcmVzdWx0XFxuJyk7XG5cdFx0XHRcdGF3YWl0IHVubGluayhqb2luKHdvcmtlci5wYXRoLCAndW50cmFja2VkLnR4dCcpKTtcblx0XHRcdFx0YXdhaXQgcmVuYW1lKGpvaW4od29ya2VyLnBhdGgsICdyZW5hbWUtb2xkLnR4dCcpLCBqb2luKHdvcmtlci5wYXRoLCAncmVuYW1lLW5ldy50eHQnKSk7XG5cdFx0XHRcdGF3YWl0IHdyaXRlRmlsZShqb2luKHdvcmtlci5wYXRoLCAnYWRkZWQudHh0JyksICdhZGRlZFxcbicpO1xuXG5cdFx0XHRcdGNvbnN0IGNoYW5nZWQgPSBhd2FpdCB3b3JrZXIuY29sbGVjdENoYW5nZWRGaWxlcygpO1xuXHRcdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKFsuLi5jaGFuZ2VkXS5zb3J0KCksIFsnYWRkZWQudHh0JywgJ21vZGlmeS50eHQnLCAncmVuYW1lLW5ldy50eHQnLCAncmVuYW1lLW9sZC50eHQnLCAndW50cmFja2VkLnR4dCddKTtcblx0XHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChbLi4uKGF3YWl0IHdvcmtlci5tZXJnZUludG8ocm9vdCkpXS5zb3J0KCksIFsuLi5jaGFuZ2VkXS5zb3J0KCkpO1xuXHRcdFx0fSBmaW5hbGx5IHtcblx0XHRcdFx0YXdhaXQgd29ya2VyLmRpc3Bvc2UoKTtcblx0XHRcdH1cblxuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGF3YWl0IHJlYWRGaWxlKGpvaW4ocm9vdCwgJ21vZGlmeS50eHQnKSwgJ3V0ZjgnKSwgJ3dvcmtlciByZXN1bHRcXG4nKTtcblx0XHRcdGFzc2VydC5vayhhd2FpdCBtaXNzaW5nKGpvaW4ocm9vdCwgJ2RlbGV0ZS50eHQnKSkpO1xuXHRcdFx0YXNzZXJ0Lm9rKGF3YWl0IG1pc3Npbmcoam9pbihyb290LCAndW50cmFja2VkLnR4dCcpKSk7XG5cdFx0XHRhc3NlcnQub2soYXdhaXQgbWlzc2luZyhqb2luKHJvb3QsICdyZW5hbWUtb2xkLnR4dCcpKSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoKGF3YWl0IHJlYWRGaWxlKGpvaW4ocm9vdCwgJ3JlbmFtZS1uZXcudHh0JyksICd1dGY4JykpLnRyaW0oKSwgJ3JlbmFtZSBtZScpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGF3YWl0IHJlYWRGaWxlKGpvaW4ocm9vdCwgJ2FkZGVkLnR4dCcpLCAndXRmOCcpLCAnYWRkZWRcXG4nKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbCgoYXdhaXQgZ2l0KHJvb3QsIFsnYnJhbmNoJywgJy0tbGlzdCcsICdmb3JnZS9vcmNoLSonXSkpLnRyaW0oKSwgJycpO1xuXHRcdFx0YXNzZXJ0Lm9rKGF3YWl0IG1pc3Npbmcoam9pbihkaXJuYW1lKHJvb3QpLCBgJHtyb290LnNwbGl0KC9bXFxcXC9dLykucG9wKCl9Lndvcmt0cmVlc2ApKSk7XG5cdFx0fSBmaW5hbGx5IHtcblx0XHRcdGF3YWl0IHJtKHJvb3QsIHsgcmVjdXJzaXZlOiB0cnVlLCBmb3JjZTogdHJ1ZSB9KTtcblx0XHR9XG5cdH0pO1xuXG5cdHRlc3QoJ3JlamVjdHMgYSBtZXJnZSB3aGVuIHRoZSB1c2VyIGNoYW5nZWQgdGhlIHNhbWUgZmlsZScsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCByb290ID0gYXdhaXQgY3JlYXRlUmVwb3NpdG9yeSgpO1xuXHRcdHRyeSB7XG5cdFx0XHRjb25zdCB3b3JrZXIgPSBhd2FpdCBvcGVuV29ya2VyV29ya3NwYWNlKHJvb3QsICdjb25mbGljdCcpO1xuXHRcdFx0dHJ5IHtcblx0XHRcdFx0YXdhaXQgd3JpdGVGaWxlKGpvaW4od29ya2VyLnBhdGgsICdtb2RpZnkudHh0JyksICd3b3JrZXIgcmVzdWx0XFxuJyk7XG5cdFx0XHRcdGF3YWl0IHdyaXRlRmlsZShqb2luKHJvb3QsICdtb2RpZnkudHh0JyksICduZXcgdXNlciBlZGl0XFxuJyk7XG5cdFx0XHRcdGF3YWl0IGFzc2VydC5yZWplY3RzKHdvcmtlci5tZXJnZUludG8ocm9vdCksIC9jb25mbGljdC4qbW9kaWZ5XFwudHh0L2kpO1xuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYXdhaXQgcmVhZEZpbGUoam9pbihyb290LCAnbW9kaWZ5LnR4dCcpLCAndXRmOCcpLCAnbmV3IHVzZXIgZWRpdFxcbicpO1xuXHRcdFx0fSBmaW5hbGx5IHtcblx0XHRcdFx0YXdhaXQgd29ya2VyLmRpc3Bvc2UoKTtcblx0XHRcdH1cblx0XHR9IGZpbmFsbHkge1xuXHRcdFx0YXdhaXQgcm0ocm9vdCwgeyByZWN1cnNpdmU6IHRydWUsIGZvcmNlOiB0cnVlIH0pO1xuXHRcdH1cblx0fSk7XG5cblx0dGVzdCgncmVmdXNlcyB0byBydW4gd2l0aG91dCBHaXQgaXNvbGF0aW9uJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHJvb3QgPSBhd2FpdCBta2R0ZW1wKGpvaW4odG1wZGlyKCksICdmb3JnZS13b3JrZXItbm8tZ2l0LScpKTtcblx0XHR0cnkge1xuXHRcdFx0YXdhaXQgYXNzZXJ0LnJlamVjdHMob3BlbldvcmtlcldvcmtzcGFjZShyb290LCAndW5zYWZlJyksIC9yZXF1aXJlIGEgR2l0IHdvcmtzcGFjZS9pKTtcblx0XHR9IGZpbmFsbHkge1xuXHRcdFx0YXdhaXQgcm0ocm9vdCwgeyByZWN1cnNpdmU6IHRydWUsIGZvcmNlOiB0cnVlIH0pO1xuXHRcdH1cblx0fSk7XG59KTtcbiJdLAogICJtYXBwaW5ncyI6ICJBQUtBLFlBQVksWUFBWTtBQUN4QixTQUFTLGdCQUFnQjtBQUN6QixTQUFTLFFBQVEsU0FBUyxVQUFVLFFBQVEsSUFBSSxRQUFRLGlCQUFpQjtBQUN6RSxTQUFTLGNBQWM7QUFDdkIsU0FBUyxTQUFTLFlBQVk7QUFDOUIsU0FBUywrQ0FBK0M7QUFDeEQsU0FBUywyQkFBMkI7QUFFcEMsU0FBUyxJQUFJ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Q0FBQztBQUNyRCxhQUFPLGFBQWEsTUFBTSxTQUFTLEtBQUssTUFBTSxnQkFBZ0IsR0FBRyxNQUFNLEdBQUcsS0FBSyxHQUFHLFdBQVc7QUFDN0YsYUFBTyxZQUFZLE1BQU0sU0FBUyxLQUFLLE1BQU0sV0FBVyxHQUFHLE1BQU0sR0FBRyxTQUFTO0FBQzdFLGFBQU8sYUFBYSxNQUFNLElBQUksTUFBTSxDQUFDLFVBQVUsVUFBVSxjQUFjLENBQUMsR0FBRyxLQUFLLEdBQUcsRUFBRTtBQUNyRixhQUFPLEdBQUcsTUFBTSxRQUFRLEtBQUssUUFBUSxJQUFJLEdBQUcsR0FBRyxLQUFLLE1BQU0sT0FBTyxFQUFFLElBQUksQ0FBQyxZQUFZLENBQUMsQ0FBQztBQUFBLElBQ3ZGLFVBQUU7QUFDRCxZQUFNLEdBQUcsTUFBTSxFQUFFLFdBQVcsTUFBTSxPQUFPLEtBQUssQ0FBQztBQUFBLElBQ2hEO0FBQUEsRUFDRCxDQUFDO0FBRUQsT0FBSyx1REFBdUQsWUFBWTtBQUN2RSxVQUFNLE9BQU8sTUFBTSxpQkFBaUI7QUFDcEMsUUFBSTtBQUNILFlBQU0sU0FBUyxNQUFNLG9CQUFvQixNQUFNLFVBQVU7QUFDekQsVUFBSTtBQUNILGNBQU0sVUFBVSxLQUFLLE9BQU8sTUFBTSxZQUFZLEdBQUcsaUJBQWlCO0FBQ2xFLGNBQU0sVUFBVSxLQUFLLE1BQU0sWUFBWSxHQUFHLGlCQUFpQjtBQUMzRCxjQUFNLE9BQU8sUUFBUSxPQUFPLFVBQVUsSUFBSSxHQUFHLHdCQUF3QjtBQUNyRSxlQUFPLFlBQVksTUFBTSxTQUFTLEtBQUssTUFBTSxZQUFZLEdBQUcsTUFBTSxHQUFHLGlCQUFpQjtBQUFBLE1BQ3ZGLFVBQUU7QUFDRCxjQUFNLE9BQU8sUUFBUTtBQUFBLE1BQ3RCO0FBQUEsSUFDRCxVQUFFO0FBQ0QsWUFBTSxHQUFHLE1BQU0sRUFBRSxXQUFXLE1BQU0sT0FBTyxLQUFLLENBQUM7QUFBQSxJQUNoRDtBQUFBLEVBQ0QsQ0FBQztBQUVELE9BQUssd0NBQXdDLFlBQVk7QUFDeEQsVUFBTSxPQUFPLE1BQU0sUUFBUSxLQUFLLE9BQU8sR0FBRyxzQkFBc0IsQ0FBQztBQUNqRSxRQUFJO0FBQ0gsWUFBTSxPQUFPLFFBQVEsb0JBQW9CLE1BQU0sUUFBUSxHQUFHLDBCQUEwQjtBQUFBLElBQ3JGLFVBQUU7QUFDRCxZQUFNLEdBQUcsTUFBTSxFQUFFLFdBQVcsTUFBTSxPQUFPLEtBQUssQ0FBQztBQUFBLElBQ2hEO0FBQUEsRUFDRCxDQUFDO0FBQ0YsQ0FBQzsiLAogICJuYW1lcyI6IFtdCn0K
