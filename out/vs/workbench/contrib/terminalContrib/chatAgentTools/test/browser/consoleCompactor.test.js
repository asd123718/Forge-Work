import { deepStrictEqual, ok, strictEqual } from "assert";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../../../base/test/common/utils.js";
import { classifyCommand, compact } from "../../browser/tools/consoleCompactor/consoleCompactor.js";
suite("Console Compactor", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  suite("classifyCommand", () => {
    test("tags npm commands", () => {
      deepStrictEqual(classifyCommand("npm install").commandKinds, ["npm"]);
    });
    test("tags cargo commands", () => {
      deepStrictEqual(classifyCommand("cargo build").commandKinds, ["cargo"]);
    });
    test("detects go test", () => {
      const classification = classifyCommand("go test ./...");
      deepStrictEqual(classification.commandKinds, ["go"]);
      strictEqual(classification.runsGoTest, true);
    });
    test("detects source read commands", () => {
      strictEqual(classifyCommand("cat src/main.ts").isSourceReadCommand, true);
    });
    test("leaves unknown commands untagged", () => {
      deepStrictEqual(classifyCommand("echo hello"), {
        commandKinds: [],
        isSourceReadCommand: false,
        runsGoTest: false,
        mentionsSavedToolOutput: false
      });
    });
  });
  suite("compact", () => {
    test("does not change small, unremarkable output", () => {
      const output = "hello world\n";
      const report = compact("echo hello", output);
      strictEqual(report.applied, false);
      strictEqual(report.compactedOutput, output);
      deepStrictEqual(report.saved, { chars: 0, bytes: 0, lines: 0 });
    });
    test("compacts noisy npm output", () => {
      const output = Array.from(
        { length: 400 },
        (_, i) => `npm http fetch GET 200 https://registry.npmjs.org/pkg${i} ${i}ms (cache miss)`
      ).join("\n") + "\nadded 400 packages in 3s\n";
      const report = compact("npm install", output);
      strictEqual(report.applied, true);
      deepStrictEqual(report.commandKinds, ["npm"]);
      ok(report.compacted.chars < report.original.chars);
      ok(report.reduction.charsPct > 0);
    });
    test("compacts noisy cargo output", () => {
      const output = Array.from(
        { length: 300 },
        (_, i) => `   Compiling crate${i} v0.1.${i}`
      ).join("\n") + "\n    Finished dev [unoptimized + debuginfo] target(s) in 12.34s\n";
      const report = compact("cargo build", output);
      strictEqual(report.applied, true);
      deepStrictEqual(report.commandKinds, ["cargo"]);
      ok(report.compacted.chars < report.original.chars);
      ok(report.reduction.charsPct > 0);
    });
    test("compacts noisy pip output", () => {
      const output = Array.from(
        { length: 200 },
        (_, i) => `Collecting package${i}
  Downloading package${i}-1.0.0-py3-none-any.whl (${i} kB)`
      ).join("\n") + "\nSuccessfully installed pkgs\n";
      const report = compact("pip install -r requirements.txt", output);
      strictEqual(report.applied, true);
      deepStrictEqual(report.commandKinds, ["pip"]);
      ok(report.compacted.chars < report.original.chars);
      ok(report.reduction.charsPct > 0);
    });
    test("saved counts equal the difference between original and compacted", () => {
      const output = Array.from(
        { length: 400 },
        (_, i) => `npm http fetch GET 200 https://registry.npmjs.org/pkg${i} ${i}ms (cache miss)`
      ).join("\n") + "\nadded 400 packages in 3s\n";
      const report = compact("npm install", output);
      strictEqual(report.saved.chars, report.original.chars - report.compacted.chars);
      strictEqual(report.saved.bytes, report.original.bytes - report.compacted.bytes);
      strictEqual(report.saved.lines, report.original.lines - report.compacted.lines);
    });
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXHRlcm1pbmFsQ29udHJpYlxcY2hhdEFnZW50VG9vbHNcXHRlc3RcXGJyb3dzZXJcXGNvbnNvbGVDb21wYWN0b3IudGVzdC50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB7IGRlZXBTdHJpY3RFcXVhbCwgb2ssIHN0cmljdEVxdWFsIH0gZnJvbSAnYXNzZXJ0JztcbmltcG9ydCB7IGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvdGVzdC9jb21tb24vdXRpbHMuanMnO1xuaW1wb3J0IHsgY2xhc3NpZnlDb21tYW5kLCBjb21wYWN0IH0gZnJvbSAnLi4vLi4vYnJvd3Nlci90b29scy9jb25zb2xlQ29tcGFjdG9yL2NvbnNvbGVDb21wYWN0b3IuanMnO1xuXG5zdWl0ZSgnQ29uc29sZSBDb21wYWN0b3InLCAoKSA9PiB7XG5cdGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSgpO1xuXG5cdHN1aXRlKCdjbGFzc2lmeUNvbW1hbmQnLCAoKSA9PiB7XG5cdFx0dGVzdCgndGFncyBucG0gY29tbWFuZHMnLCAoKSA9PiB7XG5cdFx0XHRkZWVwU3RyaWN0RXF1YWwoY2xhc3NpZnlDb21tYW5kKCducG0gaW5zdGFsbCcpLmNvbW1hbmRLaW5kcywgWyducG0nXSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCd0YWdzIGNhcmdvIGNvbW1hbmRzJywgKCkgPT4ge1xuXHRcdFx0ZGVlcFN0cmljdEVxdWFsKGNsYXNzaWZ5Q29tbWFuZCgnY2FyZ28gYnVpbGQnKS5jb21tYW5kS2luZHMsIFsnY2FyZ28nXSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdkZXRlY3RzIGdvIHRlc3QnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBjbGFzc2lmaWNhdGlvbiA9IGNsYXNzaWZ5Q29tbWFuZCgnZ28gdGVzdCAuLy4uLicpO1xuXHRcdFx0ZGVlcFN0cmljdEVxdWFsKGNsYXNzaWZpY2F0aW9uLmNvbW1hbmRLaW5kcywgWydnbyddKTtcblx0XHRcdHN0cmljdEVxdWFsKGNsYXNzaWZpY2F0aW9uLnJ1bnNHb1Rlc3QsIHRydWUpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnZGV0ZWN0cyBzb3VyY2UgcmVhZCBjb21tYW5kcycsICgpID0+IHtcblx0XHRcdHN0cmljdEVxdWFsKGNsYXNzaWZ5Q29tbWFuZCgnY2F0IHNyYy9tYWluLnRzJykuaXNTb3VyY2VSZWFkQ29tbWFuZCwgdHJ1ZSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdsZWF2ZXMgdW5rbm93biBjb21tYW5kcyB1bnRhZ2dlZCcsICgpID0+IHtcblx0XHRcdGRlZXBTdHJpY3RFcXVhbChjbGFzc2lmeUNvbW1hbmQoJ2VjaG8gaGVsbG8nKSwge1xuXHRcdFx0XHRjb21tYW5kS2luZHM6IFtdLFxuXHRcdFx0XHRpc1NvdXJjZVJlYWRDb21tYW5kOiBmYWxzZSxcblx0XHRcdFx0cnVuc0dvVGVzdDogZmFsc2UsXG5cdFx0XHRcdG1lbnRpb25zU2F2ZWRUb29sT3V0cHV0OiBmYWxzZSxcblx0XHRcdH0pO1xuXHRcdH0pO1xuXHR9KTtcblxuXHRzdWl0ZSgnY29tcGFjdCcsICgpID0+IHtcblx0XHR0ZXN0KCdkb2VzIG5vdCBjaGFuZ2Ugc21hbGwsIHVucmVtYXJrYWJsZSBvdXRwdXQnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBvdXRwdXQgPSAnaGVsbG8gd29ybGRcXG4nO1xuXHRcdFx0Y29uc3QgcmVwb3J0ID0gY29tcGFjdCgnZWNobyBoZWxsbycsIG91dHB1dCk7XG5cdFx0XHRzdHJpY3RFcXVhbChyZXBvcnQuYXBwbGllZCwgZmFsc2UpO1xuXHRcdFx0c3RyaWN0RXF1YWwocmVwb3J0LmNvbXBhY3RlZE91dHB1dCwgb3V0cHV0KTtcblx0XHRcdGRlZXBTdHJpY3RFcXVhbChyZXBvcnQuc2F2ZWQsIHsgY2hhcnM6IDAsIGJ5dGVzOiAwLCBsaW5lczogMCB9KTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2NvbXBhY3RzIG5vaXN5IG5wbSBvdXRwdXQnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBvdXRwdXQgPSBBcnJheS5mcm9tKFxuXHRcdFx0XHR7IGxlbmd0aDogNDAwIH0sXG5cdFx0XHRcdChfLCBpKSA9PiBgbnBtIGh0dHAgZmV0Y2ggR0VUIDIwMCBodHRwczovL3JlZ2lzdHJ5Lm5wbWpzLm9yZy9wa2cke2l9ICR7aX1tcyAoY2FjaGUgbWlzcylgXG5cdFx0XHQpLmpvaW4oJ1xcbicpICsgJ1xcbmFkZGVkIDQwMCBwYWNrYWdlcyBpbiAzc1xcbic7XG5cblx0XHRcdGNvbnN0IHJlcG9ydCA9IGNvbXBhY3QoJ25wbSBpbnN0YWxsJywgb3V0cHV0KTtcblx0XHRcdHN0cmljdEVxdWFsKHJlcG9ydC5hcHBsaWVkLCB0cnVlKTtcblx0XHRcdGRlZXBTdHJpY3RFcXVhbChyZXBvcnQuY29tbWFuZEtpbmRzLCBbJ25wbSddKTtcblx0XHRcdG9rKHJlcG9ydC5jb21wYWN0ZWQuY2hhcnMgPCByZXBvcnQub3JpZ2luYWwuY2hhcnMpO1xuXHRcdFx0b2socmVwb3J0LnJlZHVjdGlvbi5jaGFyc1BjdCA+IDApO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnY29tcGFjdHMgbm9pc3kgY2FyZ28gb3V0cHV0JywgKCkgPT4ge1xuXHRcdFx0Y29uc3Qgb3V0cHV0ID0gQXJyYXkuZnJvbShcblx0XHRcdFx0eyBsZW5ndGg6IDMwMCB9LFxuXHRcdFx0XHQoXywgaSkgPT4gYCAgIENvbXBpbGluZyBjcmF0ZSR7aX0gdjAuMS4ke2l9YFxuXHRcdFx0KS5qb2luKCdcXG4nKSArICdcXG4gICAgRmluaXNoZWQgZGV2IFt1bm9wdGltaXplZCArIGRlYnVnaW5mb10gdGFyZ2V0KHMpIGluIDEyLjM0c1xcbic7XG5cblx0XHRcdGNvbnN0IHJlcG9ydCA9IGNvbXBhY3QoJ2NhcmdvIGJ1aWxkJywgb3V0cHV0KTtcblx0XHRcdHN0cmljdEVxdWFsKHJlcG9ydC5hcHBsaWVkLCB0cnVlKTtcblx0XHRcdGRlZXBTdHJpY3RFcXVhbChyZXBvcnQuY29tbWFuZEtpbmRzLCBbJ2NhcmdvJ10pO1xuXHRcdFx0b2socmVwb3J0LmNvbXBhY3RlZC5jaGFycyA8IHJlcG9ydC5vcmlnaW5hbC5jaGFycyk7XG5cdFx0XHRvayhyZXBvcnQucmVkdWN0aW9uLmNoYXJzUGN0ID4gMCk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdjb21wYWN0cyBub2lzeSBwaXAgb3V0cHV0JywgKCkgPT4ge1xuXHRcdFx0Y29uc3Qgb3V0cHV0ID0gQXJyYXkuZnJvbShcblx0XHRcdFx0eyBsZW5ndGg6IDIwMCB9LFxuXHRcdFx0XHQoXywgaSkgPT4gYENvbGxlY3RpbmcgcGFja2FnZSR7aX1cXG4gIERvd25sb2FkaW5nIHBhY2thZ2Uke2l9LTEuMC4wLXB5My1ub25lLWFueS53aGwgKCR7aX0ga0IpYFxuXHRcdFx0KS5qb2luKCdcXG4nKSArICdcXG5TdWNjZXNzZnVsbHkgaW5zdGFsbGVkIHBrZ3NcXG4nO1xuXG5cdFx0XHRjb25zdCByZXBvcnQgPSBjb21wYWN0KCdwaXAgaW5zdGFsbCAtciByZXF1aXJlbWVudHMudHh0Jywgb3V0cHV0KTtcblx0XHRcdHN0cmljdEVxdWFsKHJlcG9ydC5hcHBsaWVkLCB0cnVlKTtcblx0XHRcdGRlZXBTdHJpY3RFcXVhbChyZXBvcnQuY29tbWFuZEtpbmRzLCBbJ3BpcCddKTtcblx0XHRcdG9rKHJlcG9ydC5jb21wYWN0ZWQuY2hhcnMgPCByZXBvcnQub3JpZ2luYWwuY2hhcnMpO1xuXHRcdFx0b2socmVwb3J0LnJlZHVjdGlvbi5jaGFyc1BjdCA+IDApO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnc2F2ZWQgY291bnRzIGVxdWFsIHRoZSBkaWZmZXJlbmNlIGJldHdlZW4gb3JpZ2luYWwgYW5kIGNvbXBhY3RlZCcsICgpID0+IHtcblx0XHRcdGNvbnN0IG91dHB1dCA9IEFycmF5LmZyb20oXG5cdFx0XHRcdHsgbGVuZ3RoOiA0MDAgfSxcblx0XHRcdFx0KF8sIGkpID0+IGBucG0gaHR0cCBmZXRjaCBHRVQgMjAwIGh0dHBzOi8vcmVnaXN0cnkubnBtanMub3JnL3BrZyR7aX0gJHtpfW1zIChjYWNoZSBtaXNzKWBcblx0XHRcdCkuam9pbignXFxuJykgKyAnXFxuYWRkZWQgNDAwIHBhY2thZ2VzIGluIDNzXFxuJztcblxuXHRcdFx0Y29uc3QgcmVwb3J0ID0gY29tcGFjdCgnbnBtIGluc3RhbGwnLCBvdXRwdXQpO1xuXHRcdFx0c3RyaWN0RXF1YWwocmVwb3J0LnNhdmVkLmNoYXJzLCByZXBvcnQub3JpZ2luYWwuY2hhcnMgLSByZXBvcnQuY29tcGFjdGVkLmNoYXJzKTtcblx0XHRcdHN0cmljdEVxdWFsKHJlcG9ydC5zYXZlZC5ieXRlcywgcmVwb3J0Lm9yaWdpbmFsLmJ5dGVzIC0gcmVwb3J0LmNvbXBhY3RlZC5ieXRlcyk7XG5cdFx0XHRzdHJpY3RFcXVhbChyZXBvcnQuc2F2ZWQubGluZXMsIHJlcG9ydC5vcmlnaW5hbC5saW5lcyAtIHJlcG9ydC5jb21wYWN0ZWQubGluZXMpO1xuXHRcdH0pO1xuXHR9KTtcbn0pO1xuIl0sCiAgIm1hcHBpbmdzIjogIkFBS0EsU0FBUyxpQkFBaUIsSUFBSSxt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
