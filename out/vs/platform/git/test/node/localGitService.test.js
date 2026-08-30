import assert from "assert";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../base/test/common/utils.js";
import { NullLogService } from "../../../log/common/log.js";
import { LocalGitService } from "../../node/localGitService.js";
function createExecFile(expectations) {
  return ((command, args, _options, callback) => {
    assert.strictEqual(command, "git");
    const expectation = expectations.shift();
    assert.ok(expectation, `Unexpected git call: ${args.join(" ")}`);
    assert.deepStrictEqual(args, expectation.args);
    queueMicrotask(() => callback(expectation.error ?? null, expectation.stdout ?? "", expectation.stderr ?? ""));
    return {};
  });
}
function createDivergedPullError() {
  const error = new Error("fatal: Not possible to fast-forward, aborting.");
  error.code = 128;
  error.stderr = "fatal: Not possible to fast-forward, aborting.";
  return error;
}
function createPullError(message, stderr, code = 128) {
  const error = new Error(message);
  error.code = code;
  error.stderr = stderr;
  return error;
}
suite("LocalGitService", () => {
  const store = ensureNoDisposablesAreLeakedInTestSuite();
  void store;
  test("pull runs ff-only for normal updates", async () => {
    const expectations = [
      { args: ["rev-parse", "HEAD"], stdout: "aaaa\n" },
      { args: ["pull", "--ff-only"] },
      { args: ["rev-parse", "HEAD"], stdout: "bbbb\n" }
    ];
    const service = new LocalGitService(new NullLogService(), createExecFile(expectations));
    const changed = await service.pull("test-op", "C:\\repo");
    assert.strictEqual(changed, true);
    assert.strictEqual(expectations.length, 0);
  });
  test("pull recovers from diverged history by resetting to upstream", async () => {
    const expectations = [
      { args: ["rev-parse", "HEAD"], stdout: "aaaa\n" },
      { args: ["pull", "--ff-only"], error: createDivergedPullError() },
      { args: ["fetch", "--prune"] },
      { args: ["pull", "--ff-only"], error: createDivergedPullError() },
      { args: ["status", "--porcelain"], stdout: "" },
      { args: ["rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{u}"], stdout: "origin/main\n" },
      { args: ["rev-list", "--count", "HEAD..@{u}"], stdout: "2\n" },
      { args: ["rev-list", "--count", "@{u}..HEAD"], stdout: "1\n" },
      { args: ["reset", "--hard", "origin/main"] },
      { args: ["rev-parse", "HEAD"], stdout: "bbbb\n" }
    ];
    const service = new LocalGitService(new NullLogService(), createExecFile(expectations));
    const changed = await service.pull("test-op", "C:\\repo", { allowHardResetOnDivergence: true });
    assert.strictEqual(changed, true);
    assert.strictEqual(expectations.length, 0);
  });
  test("pull rejects hard reset recovery when working tree is dirty", async () => {
    const expectations = [
      { args: ["rev-parse", "HEAD"], stdout: "aaaa\n" },
      { args: ["pull", "--ff-only"], error: createDivergedPullError() },
      { args: ["fetch", "--prune"] },
      { args: ["pull", "--ff-only"], error: createDivergedPullError() },
      { args: ["status", "--porcelain"], stdout: " M package.json\n" }
    ];
    const service = new LocalGitService(new NullLogService(), createExecFile(expectations));
    await assert.rejects(
      () => service.pull("test-op", "C:\\repo", { allowHardResetOnDivergence: true }),
      /Not possible to fast-forward/
    );
    assert.strictEqual(expectations.length, 0);
  });
  test("pull rethrows non-fast-forward errors without retrying", async () => {
    const pullError = createPullError("fatal: Failed to pull", "fatal: Authentication failed");
    const expectations = [
      { args: ["rev-parse", "HEAD"], stdout: "aaaa\n" },
      { args: ["pull", "--ff-only"], error: pullError, stderr: "fatal: Authentication failed" }
    ];
    const service = new LocalGitService(new NullLogService(), createExecFile(expectations));
    await assert.rejects(
      () => service.pull("test-op", "C:\\repo", { allowHardResetOnDivergence: true }),
      /Failed to pull/
    );
    assert.strictEqual(expectations.length, 0);
  });
  test("pull rethrows retry failures that are not fast-forward related", async () => {
    const retryError = createPullError("fatal: Failed to pull", "fatal: Authentication failed");
    const expectations = [
      { args: ["rev-parse", "HEAD"], stdout: "aaaa\n" },
      { args: ["pull", "--ff-only"], error: createDivergedPullError() },
      { args: ["fetch", "--prune"] },
      { args: ["pull", "--ff-only"], error: retryError, stderr: "fatal: Authentication failed" }
    ];
    const service = new LocalGitService(new NullLogService(), createExecFile(expectations));
    await assert.rejects(
      () => service.pull("test-op", "C:\\repo", { allowHardResetOnDivergence: true }),
      /Failed to pull/
    );
    assert.strictEqual(expectations.length, 0);
  });
  test("pull succeeds on second ff-only attempt after fetch", async () => {
    const expectations = [
      { args: ["rev-parse", "HEAD"], stdout: "aaaa\n" },
      { args: ["pull", "--ff-only"], error: createDivergedPullError() },
      { args: ["fetch", "--prune"] },
      { args: ["pull", "--ff-only"] },
      { args: ["rev-parse", "HEAD"], stdout: "bbbb\n" }
    ];
    const service = new LocalGitService(new NullLogService(), createExecFile(expectations));
    const changed = await service.pull("test-op", "C:\\repo");
    assert.strictEqual(changed, true);
    assert.strictEqual(expectations.length, 0);
  });
  test("pull without hard-reset option does not attempt destructive recovery", async () => {
    const expectations = [
      { args: ["rev-parse", "HEAD"], stdout: "aaaa\n" },
      { args: ["pull", "--ff-only"], error: createDivergedPullError() },
      { args: ["fetch", "--prune"] },
      { args: ["pull", "--ff-only"], error: createDivergedPullError() }
    ];
    const service = new LocalGitService(new NullLogService(), createExecFile(expectations));
    await assert.rejects(
      () => service.pull("test-op", "C:\\repo"),
      /Not possible to fast-forward/
    );
    assert.strictEqual(expectations.length, 0);
  });
  test("pull rethrows when upstream cannot be resolved during recovery", async () => {
    const expectations = [
      { args: ["rev-parse", "HEAD"], stdout: "aaaa\n" },
      { args: ["pull", "--ff-only"], error: createDivergedPullError() },
      { args: ["fetch", "--prune"] },
      { args: ["pull", "--ff-only"], error: createDivergedPullError() },
      { args: ["status", "--porcelain"], stdout: "" },
      { args: ["rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{u}"], error: new Error("no upstream configured") }
    ];
    const service = new LocalGitService(new NullLogService(), createExecFile(expectations));
    await assert.rejects(
      () => service.pull("test-op", "C:\\repo", { allowHardResetOnDivergence: true }),
      /Not possible to fast-forward/
    );
    assert.strictEqual(expectations.length, 0);
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxwbGF0Zm9ybVxcZ2l0XFx0ZXN0XFxub2RlXFxsb2NhbEdpdFNlcnZpY2UudGVzdC50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCBhc3NlcnQgZnJvbSAnYXNzZXJ0JztcbmltcG9ydCAqIGFzIGNwIGZyb20gJ2NoaWxkX3Byb2Nlc3MnO1xuaW1wb3J0IHsgZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS90ZXN0L2NvbW1vbi91dGlscy5qcyc7XG5pbXBvcnQgeyBOdWxsTG9nU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL2xvZy9jb21tb24vbG9nLmpzJztcbmltcG9ydCB7IExvY2FsR2l0U2VydmljZSB9IGZyb20gJy4uLy4uL25vZGUvbG9jYWxHaXRTZXJ2aWNlLmpzJztcblxuaW50ZXJmYWNlIElFeGVjRmlsZUV4cGVjdGF0aW9uIHtcblx0YXJnczogc3RyaW5nW107XG5cdHN0ZG91dD86IHN0cmluZztcblx0c3RkZXJyPzogc3RyaW5nO1xuXHRlcnJvcj86IGNwLkV4ZWNGaWxlRXhjZXB0aW9uO1xufVxuXG5mdW5jdGlvbiBjcmVhdGVFeGVjRmlsZShleHBlY3RhdGlvbnM6IElFeGVjRmlsZUV4cGVjdGF0aW9uW10pOiB0eXBlb2YgY3AuZXhlY0ZpbGUge1xuXHRyZXR1cm4gKChjb21tYW5kOiBzdHJpbmcsIGFyZ3M6IHJlYWRvbmx5IHN0cmluZ1tdLCBfb3B0aW9uczogY3AuRXhlY0ZpbGVPcHRpb25zLCBjYWxsYmFjazogKGVycm9yOiBjcC5FeGVjRmlsZUV4Y2VwdGlvbiB8IG51bGwsIHN0ZG91dDogc3RyaW5nLCBzdGRlcnI6IHN0cmluZykgPT4gdm9pZCkgPT4ge1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChjb21tYW5kLCAnZ2l0Jyk7XG5cblx0XHRjb25zdCBleHBlY3RhdGlvbiA9IGV4cGVjdGF0aW9ucy5zaGlmdCgpO1xuXHRcdGFzc2VydC5vayhleHBlY3RhdGlvbiwgYFVuZXhwZWN0ZWQgZ2l0IGNhbGw6ICR7KGFyZ3MgYXMgc3RyaW5nW10pLmpvaW4oJyAnKX1gKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGFyZ3MsIGV4cGVjdGF0aW9uLmFyZ3MpO1xuXG5cdFx0cXVldWVNaWNyb3Rhc2soKCkgPT4gY2FsbGJhY2soZXhwZWN0YXRpb24uZXJyb3IgPz8gbnVsbCwgZXhwZWN0YXRpb24uc3Rkb3V0ID8/ICcnLCBleHBlY3RhdGlvbi5zdGRlcnIgPz8gJycpKTtcblxuXHRcdHJldHVybiB7fSBhcyBjcC5DaGlsZFByb2Nlc3M7XG5cdH0pIGFzIHR5cGVvZiBjcC5leGVjRmlsZTtcbn1cblxuZnVuY3Rpb24gY3JlYXRlRGl2ZXJnZWRQdWxsRXJyb3IoKTogY3AuRXhlY0ZpbGVFeGNlcHRpb24ge1xuXHRjb25zdCBlcnJvciA9IG5ldyBFcnJvcignZmF0YWw6IE5vdCBwb3NzaWJsZSB0byBmYXN0LWZvcndhcmQsIGFib3J0aW5nLicpIGFzIGNwLkV4ZWNGaWxlRXhjZXB0aW9uICYgeyBzdGRlcnI6IHN0cmluZyB9O1xuXHRlcnJvci5jb2RlID0gMTI4O1xuXHRlcnJvci5zdGRlcnIgPSAnZmF0YWw6IE5vdCBwb3NzaWJsZSB0byBmYXN0LWZvcndhcmQsIGFib3J0aW5nLic7XG5cdHJldHVybiBlcnJvcjtcbn1cblxuZnVuY3Rpb24gY3JlYXRlUHVsbEVycm9yKG1lc3NhZ2U6IHN0cmluZywgc3RkZXJyOiBzdHJpbmcsIGNvZGUgPSAxMjgpOiBjcC5FeGVjRmlsZUV4Y2VwdGlvbiB7XG5cdGNvbnN0IGVycm9yID0gbmV3IEVycm9yKG1lc3NhZ2UpIGFzIGNwLkV4ZWNGaWxlRXhjZXB0aW9uICYgeyBzdGRlcnI6IHN0cmluZyB9O1xuXHRlcnJvci5jb2RlID0gY29kZTtcblx0ZXJyb3Iuc3RkZXJyID0gc3RkZXJyO1xuXHRyZXR1cm4gZXJyb3I7XG59XG5cbnN1aXRlKCdMb2NhbEdpdFNlcnZpY2UnLCAoKSA9PiB7XG5cdGNvbnN0IHN0b3JlID0gZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlKCk7XG5cdHZvaWQgc3RvcmU7XG5cblx0dGVzdCgncHVsbCBydW5zIGZmLW9ubHkgZm9yIG5vcm1hbCB1cGRhdGVzJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IGV4cGVjdGF0aW9uczogSUV4ZWNGaWxlRXhwZWN0YXRpb25bXSA9IFtcblx0XHRcdHsgYXJnczogWydyZXYtcGFyc2UnLCAnSEVBRCddLCBzdGRvdXQ6ICdhYWFhXFxuJyB9LFxuXHRcdFx0eyBhcmdzOiBbJ3B1bGwnLCAnLS1mZi1vbmx5J10gfSxcblx0XHRcdHsgYXJnczogWydyZXYtcGFyc2UnLCAnSEVBRCddLCBzdGRvdXQ6ICdiYmJiXFxuJyB9LFxuXHRcdF07XG5cdFx0Y29uc3Qgc2VydmljZSA9IG5ldyBMb2NhbEdpdFNlcnZpY2UobmV3IE51bGxMb2dTZXJ2aWNlKCksIGNyZWF0ZUV4ZWNGaWxlKGV4cGVjdGF0aW9ucykpO1xuXG5cdFx0Y29uc3QgY2hhbmdlZCA9IGF3YWl0IHNlcnZpY2UucHVsbCgndGVzdC1vcCcsICdDOlxcXFxyZXBvJyk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY2hhbmdlZCwgdHJ1ZSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGV4cGVjdGF0aW9ucy5sZW5ndGgsIDApO1xuXHR9KTtcblxuXHR0ZXN0KCdwdWxsIHJlY292ZXJzIGZyb20gZGl2ZXJnZWQgaGlzdG9yeSBieSByZXNldHRpbmcgdG8gdXBzdHJlYW0nLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgZXhwZWN0YXRpb25zOiBJRXhlY0ZpbGVFeHBlY3RhdGlvbltdID0gW1xuXHRcdFx0eyBhcmdzOiBbJ3Jldi1wYXJzZScsICdIRUFEJ10sIHN0ZG91dDogJ2FhYWFcXG4nIH0sXG5cdFx0XHR7IGFyZ3M6IFsncHVsbCcsICctLWZmLW9ubHknXSwgZXJyb3I6IGNyZWF0ZURpdmVyZ2VkUHVsbEVycm9yKCkgfSxcblx0XHRcdHsgYXJnczogWydmZXRjaCcsICctLXBydW5lJ10gfSxcblx0XHRcdHsgYXJnczogWydwdWxsJywgJy0tZmYtb25seSddLCBlcnJvcjogY3JlYXRlRGl2ZXJnZWRQdWxsRXJyb3IoKSB9LFxuXHRcdFx0eyBhcmdzOiBbJ3N0YXR1cycsICctLXBvcmNlbGFpbiddLCBzdGRvdXQ6ICcnIH0sXG5cdFx0XHR7IGFyZ3M6IFsncmV2LXBhcnNlJywgJy0tYWJicmV2LXJlZicsICctLXN5bWJvbGljLWZ1bGwtbmFtZScsICdAe3V9J10sIHN0ZG91dDogJ29yaWdpbi9tYWluXFxuJyB9LFxuXHRcdFx0eyBhcmdzOiBbJ3Jldi1saXN0JywgJy0tY291bnQnLCAnSEVBRC4uQHt1fSddLCBzdGRvdXQ6ICcyXFxuJyB9LFxuXHRcdFx0eyBhcmdzOiBbJ3Jldi1saXN0JywgJy0tY291bnQnLCAnQHt1fS4uSEVBRCddLCBzdGRvdXQ6ICcxXFxuJyB9LFxuXHRcdFx0eyBhcmdzOiBbJ3Jlc2V0JywgJy0taGFyZCcsICdvcmlnaW4vbWFpbiddIH0sXG5cdFx0XHR7IGFyZ3M6IFsncmV2LXBhcnNlJywgJ0hFQUQnXSwgc3Rkb3V0OiAnYmJiYlxcbicgfSxcblx0XHRdO1xuXHRcdGNvbnN0IHNlcnZpY2UgPSBuZXcgTG9jYWxHaXRTZXJ2aWNlKG5ldyBOdWxsTG9nU2VydmljZSgpLCBjcmVhdGVFeGVjRmlsZShleHBlY3RhdGlvbnMpKTtcblxuXHRcdGNvbnN0IGNoYW5nZWQgPSBhd2FpdCBzZXJ2aWNlLnB1bGwoJ3Rlc3Qtb3AnLCAnQzpcXFxccmVwbycsIHsgYWxsb3dIYXJkUmVzZXRPbkRpdmVyZ2VuY2U6IHRydWUgfSk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY2hhbmdlZCwgdHJ1ZSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGV4cGVjdGF0aW9ucy5sZW5ndGgsIDApO1xuXHR9KTtcblxuXHR0ZXN0KCdwdWxsIHJlamVjdHMgaGFyZCByZXNldCByZWNvdmVyeSB3aGVuIHdvcmtpbmcgdHJlZSBpcyBkaXJ0eScsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBleHBlY3RhdGlvbnM6IElFeGVjRmlsZUV4cGVjdGF0aW9uW10gPSBbXG5cdFx0XHR7IGFyZ3M6IFsncmV2LXBhcnNlJywgJ0hFQUQnXSwgc3Rkb3V0OiAnYWFhYVxcbicgfSxcblx0XHRcdHsgYXJnczogWydwdWxsJywgJy0tZmYtb25seSddLCBlcnJvcjogY3JlYXRlRGl2ZXJnZWRQdWxsRXJyb3IoKSB9LFxuXHRcdFx0eyBhcmdzOiBbJ2ZldGNoJywgJy0tcHJ1bmUnXSB9LFxuXHRcdFx0eyBhcmdzOiBbJ3B1bGwnLCAnLS1mZi1vbmx5J10sIGVycm9yOiBjcmVhdGVEaXZlcmdlZFB1bGxFcnJvcigpIH0sXG5cdFx0XHR7IGFyZ3M6IFsnc3RhdHVzJywgJy0tcG9yY2VsYWluJ10sIHN0ZG91dDogJyBNIHBhY2thZ2UuanNvblxcbicgfSxcblx0XHRdO1xuXHRcdGNvbnN0IHNlcnZpY2UgPSBuZXcgTG9jYWxHaXRTZXJ2aWNlKG5ldyBOdWxsTG9nU2VydmljZSgpLCBjcmVhdGVFeGVjRmlsZShleHBlY3RhdGlvbnMpKTtcblxuXHRcdGF3YWl0IGFzc2VydC5yZWplY3RzKFxuXHRcdFx0KCkgPT4gc2VydmljZS5wdWxsKCd0ZXN0LW9wJywgJ0M6XFxcXHJlcG8nLCB7IGFsbG93SGFyZFJlc2V0T25EaXZlcmdlbmNlOiB0cnVlIH0pLFxuXHRcdFx0L05vdCBwb3NzaWJsZSB0byBmYXN0LWZvcndhcmQvXG5cdFx0KTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZXhwZWN0YXRpb25zLmxlbmd0aCwgMCk7XG5cdH0pO1xuXG5cdHRlc3QoJ3B1bGwgcmV0aHJvd3Mgbm9uLWZhc3QtZm9yd2FyZCBlcnJvcnMgd2l0aG91dCByZXRyeWluZycsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBwdWxsRXJyb3IgPSBjcmVhdGVQdWxsRXJyb3IoJ2ZhdGFsOiBGYWlsZWQgdG8gcHVsbCcsICdmYXRhbDogQXV0aGVudGljYXRpb24gZmFpbGVkJyk7XG5cdFx0Y29uc3QgZXhwZWN0YXRpb25zOiBJRXhlY0ZpbGVFeHBlY3RhdGlvbltdID0gW1xuXHRcdFx0eyBhcmdzOiBbJ3Jldi1wYXJzZScsICdIRUFEJ10sIHN0ZG91dDogJ2FhYWFcXG4nIH0sXG5cdFx0XHR7IGFyZ3M6IFsncHVsbCcsICctLWZmLW9ubHknXSwgZXJyb3I6IHB1bGxFcnJvciwgc3RkZXJyOiAnZmF0YWw6IEF1dGhlbnRpY2F0aW9uIGZhaWxlZCcgfSxcblx0XHRdO1xuXHRcdGNvbnN0IHNlcnZpY2UgPSBuZXcgTG9jYWxHaXRTZXJ2aWNlKG5ldyBOdWxsTG9nU2VydmljZSgpLCBjcmVhdGVFeGVjRmlsZShleHBlY3RhdGlvbnMpKTtcblxuXHRcdGF3YWl0IGFzc2VydC5yZWplY3RzKFxuXHRcdFx0KCkgPT4gc2VydmljZS5wdWxsKCd0ZXN0LW9wJywgJ0M6XFxcXHJlcG8nLCB7IGFsbG93SGFyZFJlc2V0T25EaXZlcmdlbmNlOiB0cnVlIH0pLFxuXHRcdFx0L0ZhaWxlZCB0byBwdWxsL1xuXHRcdCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGV4cGVjdGF0aW9ucy5sZW5ndGgsIDApO1xuXHR9KTtcblxuXHR0ZXN0KCdwdWxsIHJldGhyb3dzIHJldHJ5IGZhaWx1cmVzIHRoYXQgYXJlIG5vdCBmYXN0LWZvcndhcmQgcmVsYXRlZCcsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCByZXRyeUVycm9yID0gY3JlYXRlUHVsbEVycm9yKCdmYXRhbDogRmFpbGVkIHRvIHB1bGwnLCAnZmF0YWw6IEF1dGhlbnRpY2F0aW9uIGZhaWxlZCcpO1xuXHRcdGNvbnN0IGV4cGVjdGF0aW9uczogSUV4ZWNGaWxlRXhwZWN0YXRpb25bXSA9IFtcblx0XHRcdHsgYXJnczogWydyZXYtcGFyc2UnLCAnSEVBRCddLCBzdGRvdXQ6ICdhYWFhXFxuJyB9LFxuXHRcdFx0eyBhcmdzOiBbJ3B1bGwnLCAnLS1mZi1vbmx5J10sIGVycm9yOiBjcmVhdGVEaXZlcmdlZFB1bGxFcnJvcigpIH0sXG5cdFx0XHR7IGFyZ3M6IFsnZmV0Y2gnLCAnLS1wcnVuZSddIH0sXG5cdFx0XHR7IGFyZ3M6IFsncHVsbCcsICctLWZmLW9ubHknXSwgZXJyb3I6IHJldHJ5RXJyb3IsIHN0ZGVycjogJ2ZhdGFsOiBBdXRoZW50aWNhdGlvbiBmYWlsZWQnIH0sXG5cdFx0XTtcblx0XHRjb25zdCBzZXJ2aWNlID0gbmV3IExvY2FsR2l0U2VydmljZShuZXcgTnVsbExvZ1NlcnZpY2UoKSwgY3JlYXRlRXhlY0ZpbGUoZXhwZWN0YXRpb25zKSk7XG5cblx0XHRhd2FpdCBhc3NlcnQucmVqZWN0cyhcblx0XHRcdCgpID0+IHNlcnZpY2UucHVsbCgndGVzdC1vcCcsICdDOlxcXFxyZXBvJywgeyBhbGxvd0hhcmRSZXNldE9uRGl2ZXJnZW5jZTogdHJ1ZSB9KSxcblx0XHRcdC9GYWlsZWQgdG8gcHVsbC9cblx0XHQpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChleHBlY3RhdGlvbnMubGVuZ3RoLCAwKTtcblx0fSk7XG5cblx0dGVzdCgncHVsbCBzdWNjZWVkcyBvbiBzZWNvbmQgZmYtb25seSBhdHRlbXB0IGFmdGVyIGZldGNoJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IGV4cGVjdGF0aW9uczogSUV4ZWNGaWxlRXhwZWN0YXRpb25bXSA9IFtcblx0XHRcdHsgYXJnczogWydyZXYtcGFyc2UnLCAnSEVBRCddLCBzdGRvdXQ6ICdhYWFhXFxuJyB9LFxuXHRcdFx0eyBhcmdzOiBbJ3B1bGwnLCAnLS1mZi1vbmx5J10sIGVycm9yOiBjcmVhdGVEaXZlcmdlZFB1bGxFcnJvcigpIH0sXG5cdFx0XHR7IGFyZ3M6IFsnZmV0Y2gnLCAnLS1wcnVuZSddIH0sXG5cdFx0XHR7IGFyZ3M6IFsncHVsbCcsICctLWZmLW9ubHknXSB9LFxuXHRcdFx0eyBhcmdzOiBbJ3Jldi1wYXJzZScsICdIRUFEJ10sIHN0ZG91dDogJ2JiYmJcXG4nIH0sXG5cdFx0XTtcblx0XHRjb25zdCBzZXJ2aWNlID0gbmV3IExvY2FsR2l0U2VydmljZShuZXcgTnVsbExvZ1NlcnZpY2UoKSwgY3JlYXRlRXhlY0ZpbGUoZXhwZWN0YXRpb25zKSk7XG5cblx0XHRjb25zdCBjaGFuZ2VkID0gYXdhaXQgc2VydmljZS5wdWxsKCd0ZXN0LW9wJywgJ0M6XFxcXHJlcG8nKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChjaGFuZ2VkLCB0cnVlKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZXhwZWN0YXRpb25zLmxlbmd0aCwgMCk7XG5cdH0pO1xuXG5cdHRlc3QoJ3B1bGwgd2l0aG91dCBoYXJkLXJlc2V0IG9wdGlvbiBkb2VzIG5vdCBhdHRlbXB0IGRlc3RydWN0aXZlIHJlY292ZXJ5JywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IGV4cGVjdGF0aW9uczogSUV4ZWNGaWxlRXhwZWN0YXRpb25bXSA9IFtcblx0XHRcdHsgYXJnczogWydyZXYtcGFyc2UnLCAnSEVBRCddLCBzdGRvdXQ6ICdhYWFhXFxuJyB9LFxuXHRcdFx0eyBhcmdzOiBbJ3B1bGwnLCAnLS1mZi1vbmx5J10sIGVycm9yOiBjcmVhdGVEaXZlcmdlZFB1bGxFcnJvcigpIH0sXG5cdFx0XHR7IGFyZ3M6IFsnZmV0Y2gnLCAnLS1wcnVuZSddIH0sXG5cdFx0XHR7IGFyZ3M6IFsncHVsbCcsICctLWZmLW9ubHknXSwgZXJyb3I6IGNyZWF0ZURpdmVyZ2VkUHVsbEVycm9yKCkgfSxcblx0XHRdO1xuXHRcdGNvbnN0IHNlcnZpY2UgPSBuZXcgTG9jYWxHaXRTZXJ2aWNlKG5ldyBOdWxsTG9nU2VydmljZSgpLCBjcmVhdGVFeGVjRmlsZShleHBlY3RhdGlvbnMpKTtcblxuXHRcdGF3YWl0IGFzc2VydC5yZWplY3RzKFxuXHRcdFx0KCkgPT4gc2VydmljZS5wdWxsKCd0ZXN0LW9wJywgJ0M6XFxcXHJlcG8nKSxcblx0XHRcdC9Ob3QgcG9zc2libGUgdG8gZmFzdC1mb3J3YXJkL1xuXHRcdCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGV4cGVjdGF0aW9ucy5sZW5ndGgsIDApO1xuXHR9KTtcblxuXHR0ZXN0KCdwdWxsIHJldGhyb3dzIHdoZW4gdXBzdHJlYW0gY2Fubm90IGJlIHJlc29sdmVkIGR1cmluZyByZWNvdmVyeScsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBleHBlY3RhdGlvbnM6IElFeGVjRmlsZUV4cGVjdGF0aW9uW10gPSBbXG5cdFx0XHR7IGFyZ3M6IFsncmV2LXBhcnNlJywgJ0hFQUQnXSwgc3Rkb3V0OiAnYWFhYVxcbicgfSxcblx0XHRcdHsgYXJnczogWydwdWxsJywgJy0tZmYtb25seSddLCBlcnJvcjogY3JlYXRlRGl2ZXJnZWRQdWxsRXJyb3IoKSB9LFxuXHRcdFx0eyBhcmdzOiBbJ2ZldGNoJywgJy0tcHJ1bmUnXSB9LFxuXHRcdFx0eyBhcmdzOiBbJ3B1bGwnLCAnLS1mZi1vbmx5J10sIGVycm9yOiBjcmVhdGVEaXZlcmdlZFB1bGxFcnJvcigpIH0sXG5cdFx0XHR7IGFyZ3M6IFsnc3RhdHVzJywgJy0tcG9yY2VsYWluJ10sIHN0ZG91dDogJycgfSxcblx0XHRcdHsgYXJnczogWydyZXYtcGFyc2UnLCAnLS1hYmJyZXYtcmVmJywgJy0tc3ltYm9saWMtZnVsbC1uYW1lJywgJ0B7dX0nXSwgZXJyb3I6IG5ldyBFcnJvcignbm8gdXBzdHJlYW0gY29uZmlndXJlZCcpIGFzIGNwLkV4ZWNGaWxlRXhjZXB0aW9uIH0sXG5cdFx0XTtcblx0XHRjb25zdCBzZXJ2aWNlID0gbmV3IExvY2FsR2l0U2VydmljZShuZXcgTnVsbExvZ1NlcnZpY2UoKSwgY3JlYXRlRXhlY0ZpbGUoZXhwZWN0YXRpb25zKSk7XG5cblx0XHRhd2FpdCBhc3NlcnQucmVqZWN0cyhcblx0XHRcdCgpID0+IHNlcnZpY2UucHVsbCgndGVzdC1vcCcsICdDOlxcXFxyZXBvJywgeyBhbGxvd0hhcmRSZXNldE9uRGl2ZXJnZW5jZTogdHJ1ZSB9KSxcblx0XHRcdC9Ob3QgcG9zc2libGUgdG8gZmFzdC1mb3J3YXJkL1xuXHRcdCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGV4cGVjdGF0aW9ucy5sZW5ndGgsIDApO1xuXHR9KTtcbn0pO1xuIl0sCiAgIm1hcHBpbmdzIjogIkFBS0EsT0FBTyxZQUFZO0FBRW5CLFNBQVMsK0NBQStDO0FBQ3hELFNBQVMsc0JBQXNCO0FBQy9CLFNBQVMsdUJBQXVCO0FBU2hDLFNBQVMsZUFBZSxjQUEwRDtBQUNqRixVQUFRLENBQUMsU0FBaUIsTUFBeUIsVUFBOEIsYUFBMkY7QUFDM0ssV0FBTyxZQUFZLFNBQVMsS0FBSztBQUVqQyxVQUFNLGNBQWMsYUFBYSxNQUFNO0FBQ3ZDLFdBQU8sR0FBRyxhQUFhLHdCQUF5QixLQUFrQixLQUFLLEdBQUcsQ0FBQyxFQUFFO0FBQzdFLFdBQU8sZ0JBQWdCLE1BQU0sWUFBWSxJQUFJO0FBRTdDLG1CQUFlLE1BQU0sU0FBUyxZQUFZLFNBQVMsTUFBTSxZQUFZLFVBQVUsSUFBSSxZQUFZLFVBQVUsRUFBRSxDQUFDO0FBRTVHLFdBQU8sQ0FBQztBQUFBLEVBQ1Q7QUFDRDtBQUVBLFNBQVMsMEJBQWdEO0FBQ3hELFFBQU0sUUFBUSxJQUFJLE1BQU0sZ0RBQWdEO0FBQ3hFLFFBQU0sT0FBTztBQUNiLFFBQU0sU0FBUztBQUNmLFNBQU87QUFDUjtBQUVBLFNBQVMsZ0JBQWdCLFNBQWlC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
