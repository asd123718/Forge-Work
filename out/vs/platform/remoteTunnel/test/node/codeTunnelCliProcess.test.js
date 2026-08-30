import assert from "assert";
import { EventEmitter } from "events";
import { homedir } from "os";
import { PassThrough } from "stream";
import * as sinon from "sinon";
import { join } from "../../../../base/common/path.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../base/test/common/utils.js";
import { CodeTunnelCli, resolveTunnelCommandLocation } from "../../node/codeTunnelCliProcess.js";
function createTestChildProcess(pid = 123) {
  const stdout = new PassThrough();
  const stderr = new PassThrough();
  const kill = sinon.spy();
  const child = Object.assign(new EventEmitter(), { pid, stdout, stderr, kill });
  return { child, stdout, stderr, kill };
}
function createTestCli(isBuilt, appRoot = join("installation", "resources", "app")) {
  const spawnCalls = [];
  const spawn = (command, args, options) => {
    const process = createTestChildProcess();
    spawnCalls.push({ command, args, options, process });
    return process.child;
  };
  return { cli: new CodeTunnelCli({ appRoot, isBuilt, tunnelApplicationName: "code-tunnel", win32VersionedUpdate: false, spawn }), spawnCalls };
}
suite("CodeTunnelCli", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  teardown(() => sinon.restore());
  test("resolves command locations for supported installation layouts", () => {
    const macAppRoot = join("installation", "mac", "Contents", "Resources", "app");
    const windowsAppRoot = join("installation", "windows", "resources", "app");
    const versionedWindowsAppRoot = join("installation", "versioned-windows", "1.0.0", "resources", "app");
    const linuxAppRoot = join("installation", "linux", "resources", "app");
    assert.deepStrictEqual([
      resolveTunnelCommandLocation(macAppRoot, "darwin", "code-tunnel", false),
      resolveTunnelCommandLocation(windowsAppRoot, "win32", "code-tunnel", false),
      resolveTunnelCommandLocation(versionedWindowsAppRoot, "win32", "code-tunnel", true),
      resolveTunnelCommandLocation(linuxAppRoot, "linux", "code-tunnel", false)
    ], [
      join(macAppRoot, "bin", "code-tunnel"),
      join("installation", "windows", "bin", "code-tunnel.exe"),
      join("installation", "versioned-windows", "bin", "code-tunnel.exe"),
      join("installation", "linux", "bin", "code-tunnel")
    ]);
  });
  test("uses built and source CLI invocation locations", async () => {
    const appRoot = join("installation", "resources", "app");
    const built = createTestCli(true, appRoot);
    const source = createTestCli(false, appRoot);
    const builtRun = built.cli.run("built", ["tunnel", "--name", "host"], () => {
    });
    const sourceRun = source.cli.run("source", ["tunnel", "--name", "host"], () => {
    });
    built.spawnCalls[0].process.child.emit("exit", 0);
    source.spawnCalls[0].process.child.emit("exit", 0);
    await Promise.all([builtRun.result, sourceRun.result]);
    assert.deepStrictEqual([
      {
        command: built.spawnCalls[0].command,
        args: built.spawnCalls[0].args,
        cwd: built.spawnCalls[0].options.cwd
      },
      {
        command: source.spawnCalls[0].command,
        args: source.spawnCalls[0].args,
        cwd: source.spawnCalls[0].options.cwd
      }
    ], [
      {
        command: built.cli.commandLocation,
        args: ["tunnel", "--name", "host"],
        cwd: homedir()
      },
      {
        command: "cargo",
        args: ["run", "--", "tunnel", "--name", "host"],
        cwd: join(appRoot, "cli")
      }
    ]);
  });
  test("splits standard output and error output into lines", async () => {
    const { cli, spawnCalls } = createTestCli(true);
    const output = [];
    const onOutput = (message, isError) => output.push({ message, isError });
    const run = cli.run("serve", ["tunnel", "--name", "host"], onOutput);
    const process = spawnCalls[0].process;
    process.stdout.write("standard one\nstandard two\n");
    process.stderr.write("error one\nerror two\n");
    process.child.emit("exit", 7);
    assert.deepStrictEqual({ result: await run.result, output }, {
      result: 7,
      output: [
        { message: "Running tunnel CLI\n", isError: false },
        { message: `serve Spawning: ${cli.commandLocation} tunnel --name host
`, isError: false },
        { message: "standard one\n", isError: false },
        { message: "standard two\n", isError: false },
        { message: "error one\n", isError: true },
        { message: "error two\n", isError: true },
        { message: "serve exit(123): + 7 ", isError: false }
      ]
    });
  });
  test("rejects with the underlying spawn error", async () => {
    const { cli, spawnCalls } = createTestCli(true);
    const run = cli.run("serve", ["tunnel", "--name", "host"], () => {
    });
    const spawnError = new Error("spawn code-tunnel ENOENT");
    spawnCalls[0].process.child.emit("error", spawnError);
    await assert.rejects(run.result, (error) => error === spawnError);
  });
  test("kills the CLI process when cancelled", async () => {
    const logs = [];
    const spawnCalls = [];
    const spawn = (command, args, options) => {
      const process = createTestChildProcess();
      spawnCalls.push({ command, args, options, process });
      return process.child;
    };
    const cli = new CodeTunnelCli({ appRoot: join("installation", "resources", "app"), isBuilt: true, tunnelApplicationName: "code-tunnel", win32VersionedUpdate: false, spawn, onLog: (message) => logs.push(message) });
    const run = cli.run("serve", ["tunnel"], () => {
    });
    run.result.cancel();
    await assert.rejects(run.result);
    spawnCalls[0].process.child.emit("exit", null);
    assert.deepStrictEqual({ killCalls: spawnCalls[0].process.kill.callCount, logs }, {
      killCalls: 1,
      logs: ["serve terminating(123)"]
    });
  });
  test("waits for actual process exit when stopped", async () => {
    const { cli, spawnCalls } = createTestCli(true);
    const run = cli.run("serve", ["tunnel"], () => {
    });
    let stopped = false;
    const stop = run.stop().then(() => stopped = true);
    assert.deepStrictEqual({ killCalls: spawnCalls[0].process.kill.callCount, stopped }, { killCalls: 1, stopped: false });
    spawnCalls[0].process.child.emit("exit", null);
    await stop;
    assert.strictEqual(stopped, true);
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxwbGF0Zm9ybVxccmVtb3RlVHVubmVsXFx0ZXN0XFxub2RlXFxjb2RlVHVubmVsQ2xpUHJvY2Vzcy50ZXN0LnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IGFzc2VydCBmcm9tICdhc3NlcnQnO1xuaW1wb3J0IHsgQ2hpbGRQcm9jZXNzLCBTcGF3bk9wdGlvbnMgfSBmcm9tICdjaGlsZF9wcm9jZXNzJztcbmltcG9ydCB7IEV2ZW50RW1pdHRlciB9IGZyb20gJ2V2ZW50cyc7XG5pbXBvcnQgeyBob21lZGlyIH0gZnJvbSAnb3MnO1xuaW1wb3J0IHsgUGFzc1Rocm91Z2ggfSBmcm9tICdzdHJlYW0nO1xuaW1wb3J0ICogYXMgc2lub24gZnJvbSAnc2lub24nO1xuaW1wb3J0IHsgam9pbiB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3BhdGguanMnO1xuaW1wb3J0IHsgZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS90ZXN0L2NvbW1vbi91dGlscy5qcyc7XG5pbXBvcnQgeyBDb2RlVHVubmVsQ2xpLCBDb2RlVHVubmVsQ2xpT3V0cHV0LCBDb2RlVHVubmVsU3Bhd24sIHJlc29sdmVUdW5uZWxDb21tYW5kTG9jYXRpb24gfSBmcm9tICcuLi8uLi9ub2RlL2NvZGVUdW5uZWxDbGlQcm9jZXNzLmpzJztcblxuaW50ZXJmYWNlIFRlc3RDaGlsZFByb2Nlc3Mge1xuXHRyZWFkb25seSBjaGlsZDogQ2hpbGRQcm9jZXNzO1xuXHRyZWFkb25seSBzdGRvdXQ6IFBhc3NUaHJvdWdoO1xuXHRyZWFkb25seSBzdGRlcnI6IFBhc3NUaHJvdWdoO1xuXHRyZWFkb25seSBraWxsOiBzaW5vbi5TaW5vblNweTtcbn1cblxuaW50ZXJmYWNlIFNwYXduQ2FsbCB7XG5cdHJlYWRvbmx5IGNvbW1hbmQ6IHN0cmluZztcblx0cmVhZG9ubHkgYXJnczogcmVhZG9ubHkgc3RyaW5nW107XG5cdHJlYWRvbmx5IG9wdGlvbnM6IFNwYXduT3B0aW9ucztcblx0cmVhZG9ubHkgcHJvY2VzczogVGVzdENoaWxkUHJvY2Vzcztcbn1cblxuZnVuY3Rpb24gY3JlYXRlVGVzdENoaWxkUHJvY2VzcyhwaWQgPSAxMjMpOiBUZXN0Q2hpbGRQcm9jZXNzIHtcblx0Y29uc3Qgc3Rkb3V0ID0gbmV3IFBhc3NUaHJvdWdoKCk7XG5cdGNvbnN0IHN0ZGVyciA9IG5ldyBQYXNzVGhyb3VnaCgpO1xuXHRjb25zdCBraWxsID0gc2lub24uc3B5KCk7XG5cdGNvbnN0IGNoaWxkID0gT2JqZWN0LmFzc2lnbihuZXcgRXZlbnRFbWl0dGVyKCksIHsgcGlkLCBzdGRvdXQsIHN0ZGVyciwga2lsbCB9KSBhcyB1bmtub3duIGFzIENoaWxkUHJvY2Vzcztcblx0cmV0dXJuIHsgY2hpbGQsIHN0ZG91dCwgc3RkZXJyLCBraWxsIH07XG59XG5cbmZ1bmN0aW9uIGNyZWF0ZVRlc3RDbGkoaXNCdWlsdDogYm9vbGVhbiwgYXBwUm9vdCA9IGpvaW4oJ2luc3RhbGxhdGlvbicsICdyZXNvdXJjZXMnLCAnYXBwJykpOiB7IGNsaTogQ29kZVR1bm5lbENsaTsgc3Bhd25DYWxsczogU3Bhd25DYWxsW10gfSB7XG5cdGNvbnN0IHNwYXduQ2FsbHM6IFNwYXduQ2FsbFtdID0gW107XG5cdGNvbnN0IHNwYXduOiBDb2RlVHVubmVsU3Bhd24gPSAoY29tbWFuZCwgYXJncywgb3B0aW9ucykgPT4ge1xuXHRcdGNvbnN0IHByb2Nlc3MgPSBjcmVhdGVUZXN0Q2hpbGRQcm9jZXNzKCk7XG5cdFx0c3Bhd25DYWxscy5wdXNoKHsgY29tbWFuZCwgYXJncywgb3B0aW9ucywgcHJvY2VzcyB9KTtcblx0XHRyZXR1cm4gcHJvY2Vzcy5jaGlsZDtcblx0fTtcblx0cmV0dXJuIHsgY2xpOiBuZXcgQ29kZVR1bm5lbENsaSh7IGFwcFJvb3QsIGlzQnVpbHQsIHR1bm5lbEFwcGxpY2F0aW9uTmFtZTogJ2NvZGUtdHVubmVsJywgd2luMzJWZXJzaW9uZWRVcGRhdGU6IGZhbHNlLCBzcGF3biB9KSwgc3Bhd25DYWxscyB9O1xufVxuXG5zdWl0ZSgnQ29kZVR1bm5lbENsaScsICgpID0+IHtcblx0ZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlKCk7XG5cblx0dGVhcmRvd24oKCkgPT4gc2lub24ucmVzdG9yZSgpKTtcblxuXHR0ZXN0KCdyZXNvbHZlcyBjb21tYW5kIGxvY2F0aW9ucyBmb3Igc3VwcG9ydGVkIGluc3RhbGxhdGlvbiBsYXlvdXRzJywgKCkgPT4ge1xuXHRcdGNvbnN0IG1hY0FwcFJvb3QgPSBqb2luKCdpbnN0YWxsYXRpb24nLCAnbWFjJywgJ0NvbnRlbnRzJywgJ1Jlc291cmNlcycsICdhcHAnKTtcblx0XHRjb25zdCB3aW5kb3dzQXBwUm9vdCA9IGpvaW4oJ2luc3RhbGxhdGlvbicsICd3aW5kb3dzJywgJ3Jlc291cmNlcycsICdhcHAnKTtcblx0XHRjb25zdCB2ZXJzaW9uZWRXaW5kb3dzQXBwUm9vdCA9IGpvaW4oJ2luc3RhbGxhdGlvbicsICd2ZXJzaW9uZWQtd2luZG93cycsICcxLjAuMCcsICdyZXNvdXJjZXMnLCAnYXBwJyk7XG5cdFx0Y29uc3QgbGludXhBcHBSb290ID0gam9pbignaW5zdGFsbGF0aW9uJywgJ2xpbnV4JywgJ3Jlc291cmNlcycsICdhcHAnKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoW1xuXHRcdFx0cmVzb2x2ZVR1bm5lbENvbW1hbmRMb2NhdGlvbihtYWNBcHBSb290LCAnZGFyd2luJywgJ2NvZGUtdHVubmVsJywgZmFsc2UpLFxuXHRcdFx0cmVzb2x2ZVR1bm5lbENvbW1hbmRMb2NhdGlvbih3aW5kb3dzQXBwUm9vdCwgJ3dpbjMyJywgJ2NvZGUtdHVubmVsJywgZmFsc2UpLFxuXHRcdFx0cmVzb2x2ZVR1bm5lbENvbW1hbmRMb2NhdGlvbih2ZXJzaW9uZWRXaW5kb3dzQXBwUm9vdCwgJ3dpbjMyJywgJ2NvZGUtdHVubmVsJywgdHJ1ZSksXG5cdFx0XHRyZXNvbHZlVHVubmVsQ29tbWFuZExvY2F0aW9uKGxpbnV4QXBwUm9vdCwgJ2xpbnV4JywgJ2NvZGUtdHVubmVsJywgZmFsc2UpLFxuXHRcdF0sIFtcblx0XHRcdGpvaW4obWFjQXBwUm9vdCwgJ2JpbicsICdjb2RlLXR1bm5lbCcpLFxuXHRcdFx0am9pbignaW5zdGFsbGF0aW9uJywgJ3dpbmRvd3MnLCAnYmluJywgJ2NvZGUtdHVubmVsLmV4ZScpLFxuXHRcdFx0am9pbignaW5zdGFsbGF0aW9uJywgJ3ZlcnNpb25lZC13aW5kb3dzJywgJ2JpbicsICdjb2RlLXR1bm5lbC5leGUnKSxcblx0XHRcdGpvaW4oJ2luc3RhbGxhdGlvbicsICdsaW51eCcsICdiaW4nLCAnY29kZS10dW5uZWwnKSxcblx0XHRdKTtcblx0fSk7XG5cblx0dGVzdCgndXNlcyBidWlsdCBhbmQgc291cmNlIENMSSBpbnZvY2F0aW9uIGxvY2F0aW9ucycsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBhcHBSb290ID0gam9pbignaW5zdGFsbGF0aW9uJywgJ3Jlc291cmNlcycsICdhcHAnKTtcblx0XHRjb25zdCBidWlsdCA9IGNyZWF0ZVRlc3RDbGkodHJ1ZSwgYXBwUm9vdCk7XG5cdFx0Y29uc3Qgc291cmNlID0gY3JlYXRlVGVzdENsaShmYWxzZSwgYXBwUm9vdCk7XG5cdFx0Y29uc3QgYnVpbHRSdW4gPSBidWlsdC5jbGkucnVuKCdidWlsdCcsIFsndHVubmVsJywgJy0tbmFtZScsICdob3N0J10sICgpID0+IHsgfSk7XG5cdFx0Y29uc3Qgc291cmNlUnVuID0gc291cmNlLmNsaS5ydW4oJ3NvdXJjZScsIFsndHVubmVsJywgJy0tbmFtZScsICdob3N0J10sICgpID0+IHsgfSk7XG5cblx0XHRidWlsdC5zcGF3bkNhbGxzWzBdLnByb2Nlc3MuY2hpbGQuZW1pdCgnZXhpdCcsIDApO1xuXHRcdHNvdXJjZS5zcGF3bkNhbGxzWzBdLnByb2Nlc3MuY2hpbGQuZW1pdCgnZXhpdCcsIDApO1xuXHRcdGF3YWl0IFByb21pc2UuYWxsKFtidWlsdFJ1bi5yZXN1bHQsIHNvdXJjZVJ1bi5yZXN1bHRdKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoW1xuXHRcdFx0e1xuXHRcdFx0XHRjb21tYW5kOiBidWlsdC5zcGF3bkNhbGxzWzBdLmNvbW1hbmQsXG5cdFx0XHRcdGFyZ3M6IGJ1aWx0LnNwYXduQ2FsbHNbMF0uYXJncyxcblx0XHRcdFx0Y3dkOiBidWlsdC5zcGF3bkNhbGxzWzBdLm9wdGlvbnMuY3dkLFxuXHRcdFx0fSxcblx0XHRcdHtcblx0XHRcdFx0Y29tbWFuZDogc291cmNlLnNwYXduQ2FsbHNbMF0uY29tbWFuZCxcblx0XHRcdFx0YXJnczogc291cmNlLnNwYXduQ2FsbHNbMF0uYXJncyxcblx0XHRcdFx0Y3dkOiBzb3VyY2Uuc3Bhd25DYWxsc1swXS5vcHRpb25zLmN3ZCxcblx0XHRcdH0sXG5cdFx0XSwgW1xuXHRcdFx0e1xuXHRcdFx0XHRjb21tYW5kOiBidWlsdC5jbGkuY29tbWFuZExvY2F0aW9uLFxuXHRcdFx0XHRhcmdzOiBbJ3R1bm5lbCcsICctLW5hbWUnLCAnaG9zdCddLFxuXHRcdFx0XHRjd2Q6IGhvbWVkaXIoKSxcblx0XHRcdH0sXG5cdFx0XHR7XG5cdFx0XHRcdGNvbW1hbmQ6ICdjYXJnbycsXG5cdFx0XHRcdGFyZ3M6IFsncnVuJywgJy0tJywgJ3R1bm5lbCcsICctLW5hbWUnLCAnaG9zdCddLFxuXHRcdFx0XHRjd2Q6IGpvaW4oYXBwUm9vdCwgJ2NsaScpLFxuXHRcdFx0fSxcblx0XHRdKTtcblx0fSk7XG5cblx0dGVzdCgnc3BsaXRzIHN0YW5kYXJkIG91dHB1dCBhbmQgZXJyb3Igb3V0cHV0IGludG8gbGluZXMnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgeyBjbGksIHNwYXduQ2FsbHMgfSA9IGNyZWF0ZVRlc3RDbGkodHJ1ZSk7XG5cdFx0Y29uc3Qgb3V0cHV0OiB7IG1lc3NhZ2U6IHN0cmluZzsgaXNFcnJvcjogYm9vbGVhbiB9W10gPSBbXTtcblx0XHRjb25zdCBvbk91dHB1dDogQ29kZVR1bm5lbENsaU91dHB1dCA9IChtZXNzYWdlLCBpc0Vycm9yKSA9PiBvdXRwdXQucHVzaCh7IG1lc3NhZ2UsIGlzRXJyb3IgfSk7XG5cdFx0Y29uc3QgcnVuID0gY2xpLnJ1bignc2VydmUnLCBbJ3R1bm5lbCcsICctLW5hbWUnLCAnaG9zdCddLCBvbk91dHB1dCk7XG5cdFx0Y29uc3QgcHJvY2VzcyA9IHNwYXduQ2FsbHNbMF0ucHJvY2VzcztcblxuXHRcdHByb2Nlc3Muc3Rkb3V0LndyaXRlKCdzdGFuZGFyZCBvbmVcXG5zdGFuZGFyZCB0d29cXG4nKTtcblx0XHRwcm9jZXNzLnN0ZGVyci53cml0ZSgnZXJyb3Igb25lXFxuZXJyb3IgdHdvXFxuJyk7XG5cdFx0cHJvY2Vzcy5jaGlsZC5lbWl0KCdleGl0JywgNyk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHsgcmVzdWx0OiBhd2FpdCBydW4ucmVzdWx0LCBvdXRwdXQgfSwge1xuXHRcdFx0cmVzdWx0OiA3LFxuXHRcdFx0b3V0cHV0OiBbXG5cdFx0XHRcdHsgbWVzc2FnZTogJ1J1bm5pbmcgdHVubmVsIENMSVxcbicsIGlzRXJyb3I6IGZhbHNlIH0sXG5cdFx0XHRcdHsgbWVzc2FnZTogYHNlcnZlIFNwYXduaW5nOiAke2NsaS5jb21tYW5kTG9jYXRpb259IHR1bm5lbCAtLW5hbWUgaG9zdFxcbmAsIGlzRXJyb3I6IGZhbHNlIH0sXG5cdFx0XHRcdHsgbWVzc2FnZTogJ3N0YW5kYXJkIG9uZVxcbicsIGlzRXJyb3I6IGZhbHNlIH0sXG5cdFx0XHRcdHsgbWVzc2FnZTogJ3N0YW5kYXJkIHR3b1xcbicsIGlzRXJyb3I6IGZhbHNlIH0sXG5cdFx0XHRcdHsgbWVzc2FnZTogJ2Vycm9yIG9uZVxcbicsIGlzRXJyb3I6IHRydWUgfSxcblx0XHRcdFx0eyBtZXNzYWdlOiAnZXJyb3IgdHdvXFxuJywgaXNFcnJvcjogdHJ1ZSB9LFxuXHRcdFx0XHR7IG1lc3NhZ2U6ICdzZXJ2ZSBleGl0KDEyMyk6ICsgNyAnLCBpc0Vycm9yOiBmYWxzZSB9LFxuXHRcdFx0XSxcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgncmVqZWN0cyB3aXRoIHRoZSB1bmRlcmx5aW5nIHNwYXduIGVycm9yJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHsgY2xpLCBzcGF3bkNhbGxzIH0gPSBjcmVhdGVUZXN0Q2xpKHRydWUpO1xuXHRcdGNvbnN0IHJ1biA9IGNsaS5ydW4oJ3NlcnZlJywgWyd0dW5uZWwnLCAnLS1uYW1lJywgJ2hvc3QnXSwgKCkgPT4geyB9KTtcblx0XHRjb25zdCBzcGF3bkVycm9yID0gbmV3IEVycm9yKCdzcGF3biBjb2RlLXR1bm5lbCBFTk9FTlQnKTtcblxuXHRcdHNwYXduQ2FsbHNbMF0ucHJvY2Vzcy5jaGlsZC5lbWl0KCdlcnJvcicsIHNwYXduRXJyb3IpO1xuXG5cdFx0Ly8gQW4gdW5kZWZpbmVkIHJlamVjdGlvbiBsb3NlcyB0aGUgYWN0aW9uYWJsZSBjYXVzZSwgc3VjaCBhcyBhIG1pc3Npbmdcblx0XHQvLyBvciBub24tZXhlY3V0YWJsZSB0dW5uZWwgYmluYXJ5LlxuXHRcdGF3YWl0IGFzc2VydC5yZWplY3RzKHJ1bi5yZXN1bHQsIChlcnJvcjogdW5rbm93bikgPT4gZXJyb3IgPT09IHNwYXduRXJyb3IpO1xuXHR9KTtcblxuXHR0ZXN0KCdraWxscyB0aGUgQ0xJIHByb2Nlc3Mgd2hlbiBjYW5jZWxsZWQnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgbG9nczogc3RyaW5nW10gPSBbXTtcblx0XHRjb25zdCBzcGF3bkNhbGxzOiBTcGF3bkNhbGxbXSA9IFtdO1xuXHRcdGNvbnN0IHNwYXduOiBDb2RlVHVubmVsU3Bhd24gPSAoY29tbWFuZCwgYXJncywgb3B0aW9ucykgPT4ge1xuXHRcdFx0Y29uc3QgcHJvY2VzcyA9IGNyZWF0ZVRlc3RDaGlsZFByb2Nlc3MoKTtcblx0XHRcdHNwYXduQ2FsbHMucHVzaCh7IGNvbW1hbmQsIGFyZ3MsIG9wdGlvbnMsIHByb2Nlc3MgfSk7XG5cdFx0XHRyZXR1cm4gcHJvY2Vzcy5jaGlsZDtcblx0XHR9O1xuXHRcdGNvbnN0IGNsaSA9IG5ldyBDb2RlVHVubmVsQ2xpKHsgYXBwUm9vdDogam9pbignaW5zdGFsbGF0aW9uJywgJ3Jlc291cmNlcycsICdhcHAnKSwgaXNCdWlsdDogdHJ1ZSwgdHVubmVsQXBwbGljYXRpb25OYW1lOiAnY29kZS10dW5uZWwnLCB3aW4zMlZlcnNpb25lZFVwZGF0ZTogZmFsc2UsIHNwYXduLCBvbkxvZzogbWVzc2FnZSA9PiBsb2dzLnB1c2gobWVzc2FnZSkgfSk7XG5cdFx0Y29uc3QgcnVuID0gY2xpLnJ1bignc2VydmUnLCBbJ3R1bm5lbCddLCAoKSA9PiB7IH0pO1xuXG5cdFx0cnVuLnJlc3VsdC5jYW5jZWwoKTtcblx0XHRhd2FpdCBhc3NlcnQucmVqZWN0cyhydW4ucmVzdWx0KTtcblx0XHRzcGF3bkNhbGxzWzBdLnByb2Nlc3MuY2hpbGQuZW1pdCgnZXhpdCcsIG51bGwpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7IGtpbGxDYWxsczogc3Bhd25DYWxsc1swXS5wcm9jZXNzLmtpbGwuY2FsbENvdW50LCBsb2dzIH0sIHtcblx0XHRcdGtpbGxDYWxsczogMSxcblx0XHRcdGxvZ3M6IFsnc2VydmUgdGVybWluYXRpbmcoMTIzKSddLFxuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCd3YWl0cyBmb3IgYWN0dWFsIHByb2Nlc3MgZXhpdCB3aGVuIHN0b3BwZWQnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgeyBjbGksIHNwYXduQ2FsbHMgfSA9IGNyZWF0ZVRlc3RDbGkodHJ1ZSk7XG5cdFx0Y29uc3QgcnVuID0gY2xpLnJ1bignc2VydmUnLCBbJ3R1bm5lbCddLCAoKSA9PiB7IH0pO1xuXHRcdGxldCBzdG9wcGVkID0gZmFsc2U7XG5cdFx0Y29uc3Qgc3RvcCA9IHJ1bi5zdG9wKCkudGhlbigoKSA9PiBzdG9wcGVkID0gdHJ1ZSk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHsga2lsbENhbGxzOiBzcGF3bkNhbGxzWzBdLnByb2Nlc3Mua2lsbC5jYWxsQ291bnQsIHN0b3BwZWQgfSwgeyBraWxsQ2FsbHM6IDEsIHN0b3BwZWQ6IGZhbHNlIH0pO1xuXHRcdHNwYXduQ2FsbHNbMF0ucHJvY2Vzcy5jaGlsZC5lbWl0KCdleGl0JywgbnVsbCk7XG5cdFx0YXdhaXQgc3RvcDtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc3RvcHBlZCwgdHJ1ZSk7XG5cdH0pO1xufSk7XG4iXSwKICAibWFwcGluZ3MiOiAiQUFLQSxPQUFPLFlBQVk7QUFFbkIsU0FBUyxvQkFBb0I7QUFDN0IsU0FBUyxlQUFlO0FBQ3hCLFNBQVMsbUJBQW1CO0FBQzVCLFlBQVksV0FBVztBQUN2QixTQUFTLFlBQVk7QUFDckIsU0FBUywrQ0FBK0M7QUFDeEQsU0FBUyxlQUFxRCxvQ0FBb0M7QUFnQmxHLFNBQVMsdUJBQXVCLE1BQU0sS0FBdUI7QUFDNUQsUUFBTSxTQUFTLElBQUksWUFBWTtBQUMvQixRQUFNLFNBQVMsSUFBSSxZQUFZO0FBQy9CLFFBQU0sT0FBTyxNQUFNLElBQUk7QUFDdkIsUUFBTSxRQUFRLE9BQU8sT0FBTyxJQUFJLGFBQWEsR0FB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
