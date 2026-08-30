import assert from "assert";
import * as fs from "fs";
import * as os from "os";
import { join } from "../../../../base/common/path.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../base/test/common/utils.js";
import { NullLogService } from "../../../log/common/log.js";
import { createRemoteAgentHostState } from "../../common/remoteAgentHostMetadata.js";
import { PROTOCOL_VERSION } from "../../common/state/protocol/version/registry.js";
import {
  getLocalAgentHostLockfilePath,
  isPidAlive,
  readActiveAgentHostFromLockfile,
  readLocalAgentHostLockfile
} from "../../node/agentHostLockfile.js";
suite("Agent Host Lockfile (local)", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  const logService = new NullLogService();
  const serverDataFolderName = ".vscode-server-insiders";
  const quality = "insider";
  let tempDir;
  let lockfilePath;
  setup(async () => {
    tempDir = await fs.promises.mkdtemp(join(os.tmpdir(), "agent-host-lockfile-test-"));
    lockfilePath = join(tempDir, "agent-host.lock");
  });
  teardown(async () => {
    await fs.promises.rm(tempDir, { recursive: true, force: true });
  });
  function writeState(pid, port, connectionToken, overrides) {
    const state = {
      ...createRemoteAgentHostState({ pid, port, connectionToken: connectionToken ?? void 0, quality }),
      ...overrides
    };
    fs.writeFileSync(lockfilePath, JSON.stringify(state));
  }
  suite("getLocalAgentHostLockfilePath", () => {
    test("returns absolute path under home directory", () => {
      const result = getLocalAgentHostLockfilePath(serverDataFolderName, quality);
      assert.strictEqual(result, join(os.homedir(), ".vscode-server-insiders", "cli", "agent-host-insider.lock"));
    });
    test("keys lockfile name on quality", () => {
      const result = getLocalAgentHostLockfilePath(".vscode-server-oss", "stable");
      assert.strictEqual(result, join(os.homedir(), ".vscode-server-oss", "cli", "agent-host-stable.lock"));
    });
    test("rejects unsafe server data folder names", () => {
      assert.throws(() => getLocalAgentHostLockfilePath("foo bar", "stable"), /Unsafe server data folder name/);
      assert.throws(() => getLocalAgentHostLockfilePath("foo/bar", "stable"), /Unsafe server data folder name/);
      assert.throws(() => getLocalAgentHostLockfilePath("$(whoami)", "stable"), /Unsafe server data folder name/);
    });
    test("rejects unsafe quality strings", () => {
      assert.throws(() => getLocalAgentHostLockfilePath(".vscode-server-oss", "foo bar"), /Unsafe quality/);
      assert.throws(() => getLocalAgentHostLockfilePath(".vscode-server-oss", "/abs"), /Unsafe quality/);
    });
  });
  suite("isPidAlive", () => {
    test("returns true for the current process", () => {
      assert.strictEqual(isPidAlive(process.pid), true);
    });
    test("returns false for invalid PIDs", () => {
      assert.strictEqual(isPidAlive(0), false);
      assert.strictEqual(isPidAlive(-1), false);
      assert.strictEqual(isPidAlive(Number.NaN), false);
    });
    test("returns false for a clearly nonexistent PID", () => {
      assert.strictEqual(isPidAlive(2147483646), false);
    });
  });
  suite("readLocalAgentHostLockfile", () => {
    test("returns undefined when file does not exist", async () => {
      const result = await readLocalAgentHostLockfile(lockfilePath, logService);
      assert.strictEqual(result, void 0);
    });
    test("returns undefined for invalid JSON", async () => {
      fs.writeFileSync(lockfilePath, "not json at all");
      const result = await readLocalAgentHostLockfile(lockfilePath, logService);
      assert.strictEqual(result, void 0);
    });
    test("returns undefined when schema is invalid", async () => {
      fs.writeFileSync(lockfilePath, JSON.stringify({ pid: 1234, port: 8080 }));
      const result = await readLocalAgentHostLockfile(lockfilePath, logService);
      assert.strictEqual(result, void 0);
    });
    test("parses a valid state file", async () => {
      writeState(1234, 8080, "mytoken");
      const result = await readLocalAgentHostLockfile(lockfilePath, logService);
      assert.ok(result);
      assert.strictEqual(result.pid, 1234);
      assert.strictEqual(result.port, 8080);
      assert.strictEqual(result.connectionToken, "mytoken");
      assert.strictEqual(result.protocolVersion, PROTOCOL_VERSION);
    });
  });
  suite("readActiveAgentHostFromLockfile", () => {
    test("returns notFound when file is missing", async () => {
      const result = await readActiveAgentHostFromLockfile(lockfilePath, logService);
      assert.deepStrictEqual(result, { kind: "notFound" });
    });
    test("returns notFound when file is corrupt", async () => {
      fs.writeFileSync(lockfilePath, "garbage");
      const result = await readActiveAgentHostFromLockfile(lockfilePath, logService);
      assert.deepStrictEqual(result, { kind: "notFound" });
    });
    test("returns stale when PID is not running", async () => {
      writeState(2147483646, 8080, "tok");
      const result = await readActiveAgentHostFromLockfile(lockfilePath, logService);
      assert.deepStrictEqual(result, { kind: "stale", pid: 2147483646 });
    });
    test("returns compatible for a live PID with matching protocol", async () => {
      writeState(process.pid, 8080, "mytoken");
      const result = await readActiveAgentHostFromLockfile(lockfilePath, logService);
      assert.deepStrictEqual(result, {
        kind: "compatible",
        pid: process.pid,
        host: "127.0.0.1",
        port: 8080,
        connectionToken: "mytoken"
      });
    });
    test("returns compatible with undefined token when state has null token", async () => {
      writeState(process.pid, 8080, null);
      const result = await readActiveAgentHostFromLockfile(lockfilePath, logService);
      assert.deepStrictEqual(result, {
        kind: "compatible",
        pid: process.pid,
        host: "127.0.0.1",
        port: 8080,
        connectionToken: void 0
      });
    });
    test("treats newer protocol version as compatible", async () => {
      writeState(process.pid, 8080, "tok", { protocolVersion: "99.0.0" });
      const result = await readActiveAgentHostFromLockfile(lockfilePath, logService);
      assert.deepStrictEqual(result, {
        kind: "compatible",
        pid: process.pid,
        host: "127.0.0.1",
        port: 8080,
        connectionToken: "tok"
      });
    });
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxwbGF0Zm9ybVxcYWdlbnRIb3N0XFx0ZXN0XFxub2RlXFxhZ2VudEhvc3RMb2NrZmlsZS50ZXN0LnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IGFzc2VydCBmcm9tICdhc3NlcnQnO1xuaW1wb3J0ICogYXMgZnMgZnJvbSAnZnMnO1xuaW1wb3J0ICogYXMgb3MgZnJvbSAnb3MnO1xuaW1wb3J0IHsgam9pbiB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3BhdGguanMnO1xuaW1wb3J0IHsgZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS90ZXN0L2NvbW1vbi91dGlscy5qcyc7XG5pbXBvcnQgeyBOdWxsTG9nU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL2xvZy9jb21tb24vbG9nLmpzJztcbmltcG9ydCB7IGNyZWF0ZVJlbW90ZUFnZW50SG9zdFN0YXRlIH0gZnJvbSAnLi4vLi4vY29tbW9uL3JlbW90ZUFnZW50SG9zdE1ldGFkYXRhLmpzJztcbmltcG9ydCB7IFBST1RPQ09MX1ZFUlNJT04gfSBmcm9tICcuLi8uLi9jb21tb24vc3RhdGUvcHJvdG9jb2wvdmVyc2lvbi9yZWdpc3RyeS5qcyc7XG5pbXBvcnQge1xuXHRnZXRMb2NhbEFnZW50SG9zdExvY2tmaWxlUGF0aCxcblx0aXNQaWRBbGl2ZSxcblx0cmVhZEFjdGl2ZUFnZW50SG9zdEZyb21Mb2NrZmlsZSxcblx0cmVhZExvY2FsQWdlbnRIb3N0TG9ja2ZpbGUsXG59IGZyb20gJy4uLy4uL25vZGUvYWdlbnRIb3N0TG9ja2ZpbGUuanMnO1xuXG5zdWl0ZSgnQWdlbnQgSG9zdCBMb2NrZmlsZSAobG9jYWwpJywgKCkgPT4ge1xuXG5cdGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSgpO1xuXG5cdGNvbnN0IGxvZ1NlcnZpY2UgPSBuZXcgTnVsbExvZ1NlcnZpY2UoKTtcblx0Y29uc3Qgc2VydmVyRGF0YUZvbGRlck5hbWUgPSAnLnZzY29kZS1zZXJ2ZXItaW5zaWRlcnMnO1xuXHRjb25zdCBxdWFsaXR5ID0gJ2luc2lkZXInO1xuXG5cdGxldCB0ZW1wRGlyOiBzdHJpbmc7XG5cdGxldCBsb2NrZmlsZVBhdGg6IHN0cmluZztcblxuXHRzZXR1cChhc3luYyAoKSA9PiB7XG5cdFx0dGVtcERpciA9IGF3YWl0IGZzLnByb21pc2VzLm1rZHRlbXAoam9pbihvcy50bXBkaXIoKSwgJ2FnZW50LWhvc3QtbG9ja2ZpbGUtdGVzdC0nKSk7XG5cdFx0bG9ja2ZpbGVQYXRoID0gam9pbih0ZW1wRGlyLCAnYWdlbnQtaG9zdC5sb2NrJyk7XG5cdH0pO1xuXG5cdHRlYXJkb3duKGFzeW5jICgpID0+IHtcblx0XHRhd2FpdCBmcy5wcm9taXNlcy5ybSh0ZW1wRGlyLCB7IHJlY3Vyc2l2ZTogdHJ1ZSwgZm9yY2U6IHRydWUgfSk7XG5cdH0pO1xuXG5cdGZ1bmN0aW9uIHdyaXRlU3RhdGUocGlkOiBudW1iZXIsIHBvcnQ6IG51bWJlciwgY29ubmVjdGlvblRva2VuOiBzdHJpbmcgfCB1bmRlZmluZWQgfCBudWxsLCBvdmVycmlkZXM/OiBSZWNvcmQ8c3RyaW5nLCB1bmtub3duPik6IHZvaWQge1xuXHRcdGNvbnN0IHN0YXRlID0ge1xuXHRcdFx0Li4uY3JlYXRlUmVtb3RlQWdlbnRIb3N0U3RhdGUoeyBwaWQsIHBvcnQsIGNvbm5lY3Rpb25Ub2tlbjogY29ubmVjdGlvblRva2VuID8/IHVuZGVmaW5lZCwgcXVhbGl0eSB9KSxcblx0XHRcdC4uLm92ZXJyaWRlcyxcblx0XHR9O1xuXHRcdGZzLndyaXRlRmlsZVN5bmMobG9ja2ZpbGVQYXRoLCBKU09OLnN0cmluZ2lmeShzdGF0ZSkpO1xuXHR9XG5cblx0c3VpdGUoJ2dldExvY2FsQWdlbnRIb3N0TG9ja2ZpbGVQYXRoJywgKCkgPT4ge1xuXHRcdHRlc3QoJ3JldHVybnMgYWJzb2x1dGUgcGF0aCB1bmRlciBob21lIGRpcmVjdG9yeScsICgpID0+IHtcblx0XHRcdGNvbnN0IHJlc3VsdCA9IGdldExvY2FsQWdlbnRIb3N0TG9ja2ZpbGVQYXRoKHNlcnZlckRhdGFGb2xkZXJOYW1lLCBxdWFsaXR5KTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQsIGpvaW4ob3MuaG9tZWRpcigpLCAnLnZzY29kZS1zZXJ2ZXItaW5zaWRlcnMnLCAnY2xpJywgJ2FnZW50LWhvc3QtaW5zaWRlci5sb2NrJykpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgna2V5cyBsb2NrZmlsZSBuYW1lIG9uIHF1YWxpdHknLCAoKSA9PiB7XG5cdFx0XHRjb25zdCByZXN1bHQgPSBnZXRMb2NhbEFnZW50SG9zdExvY2tmaWxlUGF0aCgnLnZzY29kZS1zZXJ2ZXItb3NzJywgJ3N0YWJsZScpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdCwgam9pbihvcy5ob21lZGlyKCksICcudnNjb2RlLXNlcnZlci1vc3MnLCAnY2xpJywgJ2FnZW50LWhvc3Qtc3RhYmxlLmxvY2snKSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdyZWplY3RzIHVuc2FmZSBzZXJ2ZXIgZGF0YSBmb2xkZXIgbmFtZXMnLCAoKSA9PiB7XG5cdFx0XHRhc3NlcnQudGhyb3dzKCgpID0+IGdldExvY2FsQWdlbnRIb3N0TG9ja2ZpbGVQYXRoKCdmb28gYmFyJywgJ3N0YWJsZScpLCAvVW5zYWZlIHNlcnZlciBkYXRhIGZvbGRlciBuYW1lLyk7XG5cdFx0XHRhc3NlcnQudGhyb3dzKCgpID0+IGdldExvY2FsQWdlbnRIb3N0TG9ja2ZpbGVQYXRoKCdmb28vYmFyJywgJ3N0YWJsZScpLCAvVW5zYWZlIHNlcnZlciBkYXRhIGZvbGRlciBuYW1lLyk7XG5cdFx0XHRhc3NlcnQudGhyb3dzKCgpID0+IGdldExvY2FsQWdlbnRIb3N0TG9ja2ZpbGVQYXRoKCckKHdob2FtaSknLCAnc3RhYmxlJyksIC9VbnNhZmUgc2VydmVyIGRhdGEgZm9sZGVyIG5hbWUvKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3JlamVjdHMgdW5zYWZlIHF1YWxpdHkgc3RyaW5ncycsICgpID0+IHtcblx0XHRcdGFzc2VydC50aHJvd3MoKCkgPT4gZ2V0TG9jYWxBZ2VudEhvc3RMb2NrZmlsZVBhdGgoJy52c2NvZGUtc2VydmVyLW9zcycsICdmb28gYmFyJyksIC9VbnNhZmUgcXVhbGl0eS8pO1xuXHRcdFx0YXNzZXJ0LnRocm93cygoKSA9PiBnZXRMb2NhbEFnZW50SG9zdExvY2tmaWxlUGF0aCgnLnZzY29kZS1zZXJ2ZXItb3NzJywgJy9hYnMnKSwgL1Vuc2FmZSBxdWFsaXR5Lyk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHN1aXRlKCdpc1BpZEFsaXZlJywgKCkgPT4ge1xuXHRcdHRlc3QoJ3JldHVybnMgdHJ1ZSBmb3IgdGhlIGN1cnJlbnQgcHJvY2VzcycsICgpID0+IHtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChpc1BpZEFsaXZlKHByb2Nlc3MucGlkKSwgdHJ1ZSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdyZXR1cm5zIGZhbHNlIGZvciBpbnZhbGlkIFBJRHMnLCAoKSA9PiB7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoaXNQaWRBbGl2ZSgwKSwgZmFsc2UpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGlzUGlkQWxpdmUoLTEpLCBmYWxzZSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoaXNQaWRBbGl2ZShOdW1iZXIuTmFOKSwgZmFsc2UpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgncmV0dXJucyBmYWxzZSBmb3IgYSBjbGVhcmx5IG5vbmV4aXN0ZW50IFBJRCcsICgpID0+IHtcblx0XHRcdC8vIDJeMzEgLSAxIGlzIGEgdmFsaWQgc2lnbmVkIDMyLWJpdCBpbnQgYnV0IHZhbmlzaGluZ2x5IHVubGlrZWx5XG5cdFx0XHQvLyB0byBiZSBhIGxpdmUgUElEIG9uIGFueSByZWFsIG1hY2hpbmUuXG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoaXNQaWRBbGl2ZSgyMTQ3NDgzNjQ2KSwgZmFsc2UpO1xuXHRcdH0pO1xuXHR9KTtcblxuXHRzdWl0ZSgncmVhZExvY2FsQWdlbnRIb3N0TG9ja2ZpbGUnLCAoKSA9PiB7XG5cdFx0dGVzdCgncmV0dXJucyB1bmRlZmluZWQgd2hlbiBmaWxlIGRvZXMgbm90IGV4aXN0JywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgcmVhZExvY2FsQWdlbnRIb3N0TG9ja2ZpbGUobG9ja2ZpbGVQYXRoLCBsb2dTZXJ2aWNlKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQsIHVuZGVmaW5lZCk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdyZXR1cm5zIHVuZGVmaW5lZCBmb3IgaW52YWxpZCBKU09OJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0ZnMud3JpdGVGaWxlU3luYyhsb2NrZmlsZVBhdGgsICdub3QganNvbiBhdCBhbGwnKTtcblx0XHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IHJlYWRMb2NhbEFnZW50SG9zdExvY2tmaWxlKGxvY2tmaWxlUGF0aCwgbG9nU2VydmljZSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0LCB1bmRlZmluZWQpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgncmV0dXJucyB1bmRlZmluZWQgd2hlbiBzY2hlbWEgaXMgaW52YWxpZCcsIGFzeW5jICgpID0+IHtcblx0XHRcdGZzLndyaXRlRmlsZVN5bmMobG9ja2ZpbGVQYXRoLCBKU09OLnN0cmluZ2lmeSh7IHBpZDogMTIzNCwgcG9ydDogODA4MCB9KSk7XG5cdFx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCByZWFkTG9jYWxBZ2VudEhvc3RMb2NrZmlsZShsb2NrZmlsZVBhdGgsIGxvZ1NlcnZpY2UpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdCwgdW5kZWZpbmVkKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3BhcnNlcyBhIHZhbGlkIHN0YXRlIGZpbGUnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHR3cml0ZVN0YXRlKDEyMzQsIDgwODAsICdteXRva2VuJyk7XG5cdFx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCByZWFkTG9jYWxBZ2VudEhvc3RMb2NrZmlsZShsb2NrZmlsZVBhdGgsIGxvZ1NlcnZpY2UpO1xuXHRcdFx0YXNzZXJ0Lm9rKHJlc3VsdCk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0LnBpZCwgMTIzNCk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0LnBvcnQsIDgwODApO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdC5jb25uZWN0aW9uVG9rZW4sICdteXRva2VuJyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0LnByb3RvY29sVmVyc2lvbiwgUFJPVE9DT0xfVkVSU0lPTik7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHN1aXRlKCdyZWFkQWN0aXZlQWdlbnRIb3N0RnJvbUxvY2tmaWxlJywgKCkgPT4ge1xuXHRcdHRlc3QoJ3JldHVybnMgbm90Rm91bmQgd2hlbiBmaWxlIGlzIG1pc3NpbmcnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCByZWFkQWN0aXZlQWdlbnRIb3N0RnJvbUxvY2tmaWxlKGxvY2tmaWxlUGF0aCwgbG9nU2VydmljZSk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHJlc3VsdCwgeyBraW5kOiAnbm90Rm91bmQnIH0pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgncmV0dXJucyBub3RGb3VuZCB3aGVuIGZpbGUgaXMgY29ycnVwdCcsIGFzeW5jICgpID0+IHtcblx0XHRcdGZzLndyaXRlRmlsZVN5bmMobG9ja2ZpbGVQYXRoLCAnZ2FyYmFnZScpO1xuXHRcdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgcmVhZEFjdGl2ZUFnZW50SG9zdEZyb21Mb2NrZmlsZShsb2NrZmlsZVBhdGgsIGxvZ1NlcnZpY2UpO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChyZXN1bHQsIHsga2luZDogJ25vdEZvdW5kJyB9KTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3JldHVybnMgc3RhbGUgd2hlbiBQSUQgaXMgbm90IHJ1bm5pbmcnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHR3cml0ZVN0YXRlKDIxNDc0ODM2NDYsIDgwODAsICd0b2snKTtcblx0XHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IHJlYWRBY3RpdmVBZ2VudEhvc3RGcm9tTG9ja2ZpbGUobG9ja2ZpbGVQYXRoLCBsb2dTZXJ2aWNlKTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocmVzdWx0LCB7IGtpbmQ6ICdzdGFsZScsIHBpZDogMjE0NzQ4MzY0NiB9KTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3JldHVybnMgY29tcGF0aWJsZSBmb3IgYSBsaXZlIFBJRCB3aXRoIG1hdGNoaW5nIHByb3RvY29sJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0d3JpdGVTdGF0ZShwcm9jZXNzLnBpZCwgODA4MCwgJ215dG9rZW4nKTtcblx0XHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IHJlYWRBY3RpdmVBZ2VudEhvc3RGcm9tTG9ja2ZpbGUobG9ja2ZpbGVQYXRoLCBsb2dTZXJ2aWNlKTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocmVzdWx0LCB7XG5cdFx0XHRcdGtpbmQ6ICdjb21wYXRpYmxlJyxcblx0XHRcdFx0cGlkOiBwcm9jZXNzLnBpZCxcblx0XHRcdFx0aG9zdDogJzEyNy4wLjAuMScsXG5cdFx0XHRcdHBvcnQ6IDgwODAsXG5cdFx0XHRcdGNvbm5lY3Rpb25Ub2tlbjogJ215dG9rZW4nLFxuXHRcdFx0fSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdyZXR1cm5zIGNvbXBhdGlibGUgd2l0aCB1bmRlZmluZWQgdG9rZW4gd2hlbiBzdGF0ZSBoYXMgbnVsbCB0b2tlbicsIGFzeW5jICgpID0+IHtcblx0XHRcdHdyaXRlU3RhdGUocHJvY2Vzcy5waWQsIDgwODAsIG51bGwpO1xuXHRcdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgcmVhZEFjdGl2ZUFnZW50SG9zdEZyb21Mb2NrZmlsZShsb2NrZmlsZVBhdGgsIGxvZ1NlcnZpY2UpO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChyZXN1bHQsIHtcblx0XHRcdFx0a2luZDogJ2NvbXBhdGlibGUnLFxuXHRcdFx0XHRwaWQ6IHByb2Nlc3MucGlkLFxuXHRcdFx0XHRob3N0OiAnMTI3LjAuMC4xJyxcblx0XHRcdFx0cG9ydDogODA4MCxcblx0XHRcdFx0Y29ubmVjdGlvblRva2VuOiB1bmRlZmluZWQsXG5cdFx0XHR9KTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3RyZWF0cyBuZXdlciBwcm90b2NvbCB2ZXJzaW9uIGFzIGNvbXBhdGlibGUnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHQvLyBUaGUgYWdlbnQgaG9zdCBzZXJ2ZXIgaXMgZG93bmxvYWRlZCBvbiBkZW1hbmQgYW5kIG1heSBzcGVhayBhXG5cdFx0XHQvLyBuZXdlciBwcm90b2NvbCB0aGFuIHRoaXMgY29uc3VtZXIgd2FzIGJ1aWx0IHdpdGguIFJldXNlIGlzXG5cdFx0XHQvLyB0aGUgcmlnaHQgZGVmYXVsdDsgdGhlIHJlbmRlcmVyXHUyMTk0QUggaGFuZHNoYWtlIHN1cmZhY2VzIGFueVxuXHRcdFx0Ly8gZ2VudWluZSBpbmNvbXBhdGliaWxpdHkuXG5cdFx0XHR3cml0ZVN0YXRlKHByb2Nlc3MucGlkLCA4MDgwLCAndG9rJywgeyBwcm90b2NvbFZlcnNpb246ICc5OS4wLjAnIH0pO1xuXHRcdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgcmVhZEFjdGl2ZUFnZW50SG9zdEZyb21Mb2NrZmlsZShsb2NrZmlsZVBhdGgsIGxvZ1NlcnZpY2UpO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChyZXN1bHQsIHtcblx0XHRcdFx0a2luZDogJ2NvbXBhdGlibGUnLFxuXHRcdFx0XHRwaWQ6IHByb2Nlc3MucGlkLFxuXHRcdFx0XHRob3N0OiAnMTI3LjAuMC4xJyxcblx0XHRcdFx0cG9ydDogODA4MCxcblx0XHRcdFx0Y29ubmVjdGlvblRva2VuOiAndG9rJyxcblx0XHRcdH0pO1xuXHRcdH0pO1xuXHR9KTtcbn0pO1xuIl0sCiAgIm1hcHBpbmdzIjogIkFBS0EsT0FBTyxZQUFZO0FBQ25CLFlBQVksUUFBUTtBQUNwQixZQUFZLFFBQVE7QUFDcEIsU0FBUyxZQUFZO0FBQ3JCLFNBQVMsK0NBQStDO0FBQ3hELFNBQVMsc0JBQXNCO0FBQy9CLFNBQVMsa0NBQWtDO0FBQzNDLFNBQVMsd0JBQXdCO0FBQ2pDO0FBQUEsRUFDQztBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLE9BQ007QUFFUCxNQUFNLCtCQUErQixNQUFNO0FBRTFDLDBDQUF3QztBQUV4QyxRQUFNLGFBQWEsSUFBSSxlQUFlO0FBQ3RDLFFBQU0sdUJBQXVCO0FBQzdCLFFBQU0sVUFBVTtBQUVoQixNQUFJO0FBQ0osTUFBSTtBQUVKLFFBQU0sWUFBWTtBQUNqQixjQUFVLE1BQU0sR0FBRyxTQUFTLFFBQVEsS0FBSyxHQUFHLE9BQU8sR0FBRywyQkFBMkIsQ0FBQztBQUNsRixtQkFBZSxLQUFLLFNBQVMsaUJBQWlCO0FBQUEsRUFDL0MsQ0FBQztBQUVE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
