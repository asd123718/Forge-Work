import assert from "assert";
import { OperatingSystem } from "../../../../../base/common/platform.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../../base/test/common/utils.js";
import { osToTaskTargetOS, resolveTaskCommand } from "../../browser/taskCommand.js";
suite("resolveTaskCommand", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  test("shell command with args", async () => {
    const task = { label: "echo", type: "shell", command: "echo", args: ["hello", "world"] };
    assert.strictEqual(await resolveTaskCommand(task), "echo hello world");
  });
  test("plain string args containing spaces are POSIX strong-quoted", async () => {
    const task = { label: "echo", type: "shell", command: "echo", args: ["hello world", "plain"] };
    assert.strictEqual(await resolveTaskCommand(task), `echo 'hello world' plain`);
  });
  test("shell command without args", async () => {
    const task = { label: "pwd", type: "shell", command: "pwd" };
    assert.strictEqual(await resolveTaskCommand(task), "pwd");
  });
  test("npm script", async () => {
    const task = { label: "build", type: "npm", script: "build" };
    assert.strictEqual(await resolveTaskCommand(task), "npm run build");
  });
  test("npm script with no type defaults to npm", async () => {
    const task = { label: "build", script: "build" };
    assert.strictEqual(await resolveTaskCommand(task), "npm run build");
  });
  test("command takes precedence over script", async () => {
    const task = { label: "run", type: "shell", command: "make", script: "ignored" };
    assert.strictEqual(await resolveTaskCommand(task), "make");
  });
  test("os override replaces command and args", async () => {
    const task = {
      label: "list",
      type: "shell",
      command: "ls",
      args: ["-la"],
      windows: { command: "dir", args: ["/B"] }
    };
    assert.strictEqual(await resolveTaskCommand(task, { targetOS: "windows" }), "dir /B");
    assert.strictEqual(await resolveTaskCommand(task, { targetOS: "linux" }), "ls -la");
    assert.strictEqual(await resolveTaskCommand(task), "ls -la");
  });
  test("CommandString arg with quoting=strong is single-quoted", async () => {
    const task = {
      label: "echo",
      type: "shell",
      command: "echo",
      args: [{ value: "hello world", quoting: "strong" }]
    };
    assert.strictEqual(await resolveTaskCommand(task), `echo 'hello world'`);
  });
  test("CommandString arg with quoting=strong escapes embedded single quotes", async () => {
    const task = {
      label: "echo",
      type: "shell",
      command: "echo",
      args: [{ value: `it's fine`, quoting: "strong" }]
    };
    assert.strictEqual(await resolveTaskCommand(task), `echo 'it'\\''s fine'`);
  });
  test("CommandString arg with quoting=weak escapes shell metacharacters in double quotes", async () => {
    const task = {
      label: "echo",
      type: "shell",
      command: "echo",
      args: [{ value: `$HOME "x"`, quoting: "weak" }]
    };
    assert.strictEqual(await resolveTaskCommand(task), `echo "\\$HOME \\"x\\""`);
  });
  test("CommandString arg with quoting=escape backslash-escapes shell-special characters", async () => {
    const task = {
      label: "echo",
      type: "shell",
      command: "echo",
      args: [{ value: "a b;c", quoting: "escape" }]
    };
    assert.strictEqual(await resolveTaskCommand(task), "echo a\\ b\\;c");
  });
  test("returns undefined when no command or script is set", async () => {
    const task = { label: "empty" };
    assert.strictEqual(await resolveTaskCommand(task), void 0);
  });
  function lookupFrom(...tasks) {
    const map = new Map(tasks.map((t) => [t.label, t]));
    return (label) => map.get(label);
  }
  test("dependsOn with a single string label chains the dependency before the own command", async () => {
    const dep = { label: "prep", type: "shell", command: "npm", args: ["install"] };
    const task = { label: "build", type: "shell", command: "make", dependsOn: "prep" };
    assert.strictEqual(
      await resolveTaskCommand(task, { lookup: lookupFrom(dep) }),
      "npm install && make"
    );
  });
  test("dependsOn array with default sequence order joins with &&", async () => {
    const a = { label: "a", type: "shell", command: "echo", args: ["a"] };
    const b = { label: "b", type: "shell", command: "echo", args: ["b"] };
    const task = { label: "top", dependsOn: ["a", "b"] };
    assert.strictEqual(
      await resolveTaskCommand(task, { lookup: lookupFrom(a, b) }),
      "echo a && echo b"
    );
  });
  test("dependsOrder=sequence is explicit and equivalent to default", async () => {
    const a = { label: "a", type: "shell", command: "echo", args: ["a"] };
    const b = { label: "b", type: "shell", command: "echo", args: ["b"] };
    const task = { label: "top", dependsOn: ["a", "b"], dependsOrder: "sequence" };
    assert.strictEqual(
      await resolveTaskCommand(task, { lookup: lookupFrom(a, b) }),
      "echo a && echo b"
    );
  });
  test("dependsOrder=parallel renders as backgrounded subshells with trailing wait", async () => {
    const a = { label: "a", type: "shell", command: "echo", args: ["a"] };
    const b = { label: "b", type: "shell", command: "echo", args: ["b"] };
    const task = { label: "top", dependsOn: ["a", "b"], dependsOrder: "parallel" };
    assert.strictEqual(
      await resolveTaskCommand(task, { lookup: lookupFrom(a, b) }),
      "( echo a ) & ( echo b ) & wait"
    );
  });
  test("dependsOn-only task (no own command) resolves to the dependency chain", async () => {
    const a = { label: "a", type: "shell", command: "echo", args: ["a"] };
    const b = { label: "b", type: "shell", command: "echo", args: ["b"] };
    const task = { label: "group", dependsOn: ["a", "b"], dependsOrder: "sequence" };
    assert.strictEqual(
      await resolveTaskCommand(task, { lookup: lookupFrom(a, b) }),
      "echo a && echo b"
    );
  });
  test("dependsOn missing in lookup is skipped, others still resolve", async () => {
    const a = { label: "a", type: "shell", command: "echo", args: ["a"] };
    const task = { label: "top", dependsOn: ["a", "does-not-exist"] };
    assert.strictEqual(
      await resolveTaskCommand(task, { lookup: lookupFrom(a) }),
      "echo a"
    );
  });
  test("dependsOn cycles are broken by cycle-tracking", async () => {
    const a = { label: "a", type: "shell", command: "echo", args: ["a"], dependsOn: "b" };
    const b = { label: "b", type: "shell", command: "echo", args: ["b"], dependsOn: "a" };
    assert.strictEqual(
      await resolveTaskCommand(a, { lookup: lookupFrom(a, b) }),
      "echo b && echo a"
    );
  });
  test("nested dependencies resolve recursively", async () => {
    const leaf = { label: "leaf", type: "shell", command: "echo", args: ["leaf"] };
    const mid = { label: "mid", type: "shell", command: "echo", args: ["mid"], dependsOn: "leaf" };
    const top = { label: "top", type: "shell", command: "echo", args: ["top"], dependsOn: "mid" };
    assert.strictEqual(
      await resolveTaskCommand(top, { lookup: lookupFrom(leaf, mid) }),
      "echo leaf && echo mid && echo top"
    );
  });
  test("dependsOn without lookup falls back to own command (or undefined)", async () => {
    const task = { label: "top", type: "shell", command: "make", dependsOn: "prep" };
    assert.strictEqual(await resolveTaskCommand(task), "make");
    const taskNoOwn = { label: "group", dependsOn: "prep" };
    assert.strictEqual(await resolveTaskCommand(taskNoOwn), void 0);
  });
  test("resolveVariables is applied to args before quoting (plain path needs no quoting)", async () => {
    const resolveVariables = async (value) => value.replace("${workspaceFolder}", "/home/user/worktree");
    const task = {
      label: "run",
      type: "shell",
      command: "./scripts/code.sh",
      args: ["--user-data-dir=${workspaceFolder}/.profile-oss"]
    };
    assert.strictEqual(
      await resolveTaskCommand(task, { resolveVariables }),
      "./scripts/code.sh --user-data-dir=/home/user/worktree/.profile-oss"
    );
  });
  test("resolveVariables result containing spaces is strong-quoted", async () => {
    const resolveVariables = async (value) => value.replace("${workspaceFolder}", "/Users/me/my worktree");
    const task = {
      label: "run",
      type: "shell",
      command: "cat",
      args: ["${workspaceFolder}/file.txt"]
    };
    assert.strictEqual(
      await resolveTaskCommand(task, { resolveVariables }),
      `cat '/Users/me/my worktree/file.txt'`
    );
  });
  test("resolveVariables is applied to the command string", async () => {
    const resolveVariables = async (value) => value.replace("${workspaceRoot}", "/repo");
    const task = { label: "run", type: "shell", command: "${workspaceRoot}/scripts/code.sh" };
    assert.strictEqual(
      await resolveTaskCommand(task, { resolveVariables }),
      "/repo/scripts/code.sh"
    );
  });
  test("variables left untouched (and strong-quoted) when no resolveVariables hook provided", async () => {
    const task = { label: "run", type: "shell", command: "echo", args: ["${workspaceFolder}"] };
    assert.strictEqual(await resolveTaskCommand(task), "echo '${workspaceFolder}'");
  });
});
suite("osToTaskTargetOS", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  test("maps each OperatingSystem to its tasks.json key", async () => {
    assert.strictEqual(osToTaskTargetOS(OperatingSystem.Windows), "windows");
    assert.strictEqual(osToTaskTargetOS(OperatingSystem.Macintosh), "osx");
    assert.strictEqual(osToTaskTargetOS(OperatingSystem.Linux), "linux");
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxzZXNzaW9uc1xcY29udHJpYlxcY2hhdFxcdGVzdFxcYnJvd3NlclxcdGFza0NvbW1hbmQudGVzdC50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCBhc3NlcnQgZnJvbSAnYXNzZXJ0JztcbmltcG9ydCB7IE9wZXJhdGluZ1N5c3RlbSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3BsYXRmb3JtLmpzJztcbmltcG9ydCB7IGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvdGVzdC9jb21tb24vdXRpbHMuanMnO1xuaW1wb3J0IHsgSVRhc2tFbnRyeSB9IGZyb20gJy4uLy4uL2Jyb3dzZXIvc2Vzc2lvbnNUYXNrc1NlcnZpY2UuanMnO1xuaW1wb3J0IHsgb3NUb1Rhc2tUYXJnZXRPUywgcmVzb2x2ZVRhc2tDb21tYW5kIH0gZnJvbSAnLi4vLi4vYnJvd3Nlci90YXNrQ29tbWFuZC5qcyc7XG5cbnN1aXRlKCdyZXNvbHZlVGFza0NvbW1hbmQnLCAoKSA9PiB7XG5cblx0ZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlKCk7XG5cblx0dGVzdCgnc2hlbGwgY29tbWFuZCB3aXRoIGFyZ3MnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgdGFzazogSVRhc2tFbnRyeSA9IHsgbGFiZWw6ICdlY2hvJywgdHlwZTogJ3NoZWxsJywgY29tbWFuZDogJ2VjaG8nLCBhcmdzOiBbJ2hlbGxvJywgJ3dvcmxkJ10gfTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYXdhaXQgcmVzb2x2ZVRhc2tDb21tYW5kKHRhc2spLCAnZWNobyBoZWxsbyB3b3JsZCcpO1xuXHR9KTtcblxuXHR0ZXN0KCdwbGFpbiBzdHJpbmcgYXJncyBjb250YWluaW5nIHNwYWNlcyBhcmUgUE9TSVggc3Ryb25nLXF1b3RlZCcsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCB0YXNrOiBJVGFza0VudHJ5ID0geyBsYWJlbDogJ2VjaG8nLCB0eXBlOiAnc2hlbGwnLCBjb21tYW5kOiAnZWNobycsIGFyZ3M6IFsnaGVsbG8gd29ybGQnLCAncGxhaW4nXSB9O1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChhd2FpdCByZXNvbHZlVGFza0NvbW1hbmQodGFzayksIGBlY2hvICdoZWxsbyB3b3JsZCcgcGxhaW5gKTtcblx0fSk7XG5cblx0dGVzdCgnc2hlbGwgY29tbWFuZCB3aXRob3V0IGFyZ3MnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgdGFzazogSVRhc2tFbnRyeSA9IHsgbGFiZWw6ICdwd2QnLCB0eXBlOiAnc2hlbGwnLCBjb21tYW5kOiAncHdkJyB9O1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChhd2FpdCByZXNvbHZlVGFza0NvbW1hbmQodGFzayksICdwd2QnKTtcblx0fSk7XG5cblx0dGVzdCgnbnBtIHNjcmlwdCcsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCB0YXNrOiBJVGFza0VudHJ5ID0geyBsYWJlbDogJ2J1aWxkJywgdHlwZTogJ25wbScsIHNjcmlwdDogJ2J1aWxkJyB9O1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChhd2FpdCByZXNvbHZlVGFza0NvbW1hbmQodGFzayksICducG0gcnVuIGJ1aWxkJyk7XG5cdH0pO1xuXG5cdHRlc3QoJ25wbSBzY3JpcHQgd2l0aCBubyB0eXBlIGRlZmF1bHRzIHRvIG5wbScsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCB0YXNrOiBJVGFza0VudHJ5ID0geyBsYWJlbDogJ2J1aWxkJywgc2NyaXB0OiAnYnVpbGQnIH07XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGF3YWl0IHJlc29sdmVUYXNrQ29tbWFuZCh0YXNrKSwgJ25wbSBydW4gYnVpbGQnKTtcblx0fSk7XG5cblx0dGVzdCgnY29tbWFuZCB0YWtlcyBwcmVjZWRlbmNlIG92ZXIgc2NyaXB0JywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHRhc2s6IElUYXNrRW50cnkgPSB7IGxhYmVsOiAncnVuJywgdHlwZTogJ3NoZWxsJywgY29tbWFuZDogJ21ha2UnLCBzY3JpcHQ6ICdpZ25vcmVkJyB9O1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChhd2FpdCByZXNvbHZlVGFza0NvbW1hbmQodGFzayksICdtYWtlJyk7XG5cdH0pO1xuXG5cdHRlc3QoJ29zIG92ZXJyaWRlIHJlcGxhY2VzIGNvbW1hbmQgYW5kIGFyZ3MnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgdGFzazogSVRhc2tFbnRyeSA9IHtcblx0XHRcdGxhYmVsOiAnbGlzdCcsXG5cdFx0XHR0eXBlOiAnc2hlbGwnLFxuXHRcdFx0Y29tbWFuZDogJ2xzJyxcblx0XHRcdGFyZ3M6IFsnLWxhJ10sXG5cdFx0XHR3aW5kb3dzOiB7IGNvbW1hbmQ6ICdkaXInLCBhcmdzOiBbJy9CJ10gfSxcblx0XHR9O1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChhd2FpdCByZXNvbHZlVGFza0NvbW1hbmQodGFzaywgeyB0YXJnZXRPUzogJ3dpbmRvd3MnIH0pLCAnZGlyIC9CJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGF3YWl0IHJlc29sdmVUYXNrQ29tbWFuZCh0YXNrLCB7IHRhcmdldE9TOiAnbGludXgnIH0pLCAnbHMgLWxhJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGF3YWl0IHJlc29sdmVUYXNrQ29tbWFuZCh0YXNrKSwgJ2xzIC1sYScpO1xuXHR9KTtcblxuXHR0ZXN0KCdDb21tYW5kU3RyaW5nIGFyZyB3aXRoIHF1b3Rpbmc9c3Ryb25nIGlzIHNpbmdsZS1xdW90ZWQnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgdGFzazogSVRhc2tFbnRyeSA9IHtcblx0XHRcdGxhYmVsOiAnZWNobycsXG5cdFx0XHR0eXBlOiAnc2hlbGwnLFxuXHRcdFx0Y29tbWFuZDogJ2VjaG8nLFxuXHRcdFx0YXJnczogW3sgdmFsdWU6ICdoZWxsbyB3b3JsZCcsIHF1b3Rpbmc6ICdzdHJvbmcnIH1dLFxuXHRcdH07XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGF3YWl0IHJlc29sdmVUYXNrQ29tbWFuZCh0YXNrKSwgYGVjaG8gJ2hlbGxvIHdvcmxkJ2ApO1xuXHR9KTtcblxuXHR0ZXN0KCdDb21tYW5kU3RyaW5nIGFyZyB3aXRoIHF1b3Rpbmc9c3Ryb25nIGVzY2FwZXMgZW1iZWRkZWQgc2luZ2xlIHF1b3RlcycsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCB0YXNrOiBJVGFza0VudHJ5ID0ge1xuXHRcdFx0bGFiZWw6ICdlY2hvJyxcblx0XHRcdHR5cGU6ICdzaGVsbCcsXG5cdFx0XHRjb21tYW5kOiAnZWNobycsXG5cdFx0XHRhcmdzOiBbeyB2YWx1ZTogYGl0J3MgZmluZWAsIHF1b3Rpbmc6ICdzdHJvbmcnIH1dLFxuXHRcdH07XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGF3YWl0IHJlc29sdmVUYXNrQ29tbWFuZCh0YXNrKSwgYGVjaG8gJ2l0J1xcXFwnJ3MgZmluZSdgKTtcblx0fSk7XG5cblx0dGVzdCgnQ29tbWFuZFN0cmluZyBhcmcgd2l0aCBxdW90aW5nPXdlYWsgZXNjYXBlcyBzaGVsbCBtZXRhY2hhcmFjdGVycyBpbiBkb3VibGUgcXVvdGVzJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHRhc2s6IElUYXNrRW50cnkgPSB7XG5cdFx0XHRsYWJlbDogJ2VjaG8nLFxuXHRcdFx0dHlwZTogJ3NoZWxsJyxcblx0XHRcdGNvbW1hbmQ6ICdlY2hvJyxcblx0XHRcdGFyZ3M6IFt7IHZhbHVlOiBgJEhPTUUgXCJ4XCJgLCBxdW90aW5nOiAnd2VhaycgfV0sXG5cdFx0fTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYXdhaXQgcmVzb2x2ZVRhc2tDb21tYW5kKHRhc2spLCBgZWNobyBcIlxcXFwkSE9NRSBcXFxcXCJ4XFxcXFwiXCJgKTtcblx0fSk7XG5cblx0dGVzdCgnQ29tbWFuZFN0cmluZyBhcmcgd2l0aCBxdW90aW5nPWVzY2FwZSBiYWNrc2xhc2gtZXNjYXBlcyBzaGVsbC1zcGVjaWFsIGNoYXJhY3RlcnMnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgdGFzazogSVRhc2tFbnRyeSA9IHtcblx0XHRcdGxhYmVsOiAnZWNobycsXG5cdFx0XHR0eXBlOiAnc2hlbGwnLFxuXHRcdFx0Y29tbWFuZDogJ2VjaG8nLFxuXHRcdFx0YXJnczogW3sgdmFsdWU6ICdhIGI7YycsIHF1b3Rpbmc6ICdlc2NhcGUnIH1dLFxuXHRcdH07XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGF3YWl0IHJlc29sdmVUYXNrQ29tbWFuZCh0YXNrKSwgJ2VjaG8gYVxcXFwgYlxcXFw7YycpO1xuXHR9KTtcblxuXHR0ZXN0KCdyZXR1cm5zIHVuZGVmaW5lZCB3aGVuIG5vIGNvbW1hbmQgb3Igc2NyaXB0IGlzIHNldCcsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCB0YXNrOiBJVGFza0VudHJ5ID0geyBsYWJlbDogJ2VtcHR5JyB9O1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChhd2FpdCByZXNvbHZlVGFza0NvbW1hbmQodGFzayksIHVuZGVmaW5lZCk7XG5cdH0pO1xuXG5cdC8vIC0tLSBkZXBlbmRzT24gLS0tXG5cblx0ZnVuY3Rpb24gbG9va3VwRnJvbSguLi50YXNrczogSVRhc2tFbnRyeVtdKTogKGxhYmVsOiBzdHJpbmcpID0+IElUYXNrRW50cnkgfCB1bmRlZmluZWQge1xuXHRcdGNvbnN0IG1hcCA9IG5ldyBNYXAodGFza3MubWFwKHQgPT4gW3QubGFiZWwsIHRdKSk7XG5cdFx0cmV0dXJuIGxhYmVsID0+IG1hcC5nZXQobGFiZWwpO1xuXHR9XG5cblx0dGVzdCgnZGVwZW5kc09uIHdpdGggYSBzaW5nbGUgc3RyaW5nIGxhYmVsIGNoYWlucyB0aGUgZGVwZW5kZW5jeSBiZWZvcmUgdGhlIG93biBjb21tYW5kJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IGRlcDogSVRhc2tFbnRyeSA9IHsgbGFiZWw6ICdwcmVwJywgdHlwZTogJ3NoZWxsJywgY29tbWFuZDogJ25wbScsIGFyZ3M6IFsnaW5zdGFsbCddIH07XG5cdFx0Y29uc3QgdGFzazogSVRhc2tFbnRyeSA9IHsgbGFiZWw6ICdidWlsZCcsIHR5cGU6ICdzaGVsbCcsIGNvbW1hbmQ6ICdtYWtlJywgZGVwZW5kc09uOiAncHJlcCcgfTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoXG5cdFx0XHRhd2FpdCByZXNvbHZlVGFza0NvbW1hbmQodGFzaywgeyBsb29rdXA6IGxvb2t1cEZyb20oZGVwKSB9KSxcblx0XHRcdCducG0gaW5zdGFsbCAmJiBtYWtlJ1xuXHRcdCk7XG5cdH0pO1xuXG5cdHRlc3QoJ2RlcGVuZHNPbiBhcnJheSB3aXRoIGRlZmF1bHQgc2VxdWVuY2Ugb3JkZXIgam9pbnMgd2l0aCAmJicsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBhOiBJVGFza0VudHJ5ID0geyBsYWJlbDogJ2EnLCB0eXBlOiAnc2hlbGwnLCBjb21tYW5kOiAnZWNobycsIGFyZ3M6IFsnYSddIH07XG5cdFx0Y29uc3QgYjogSVRhc2tFbnRyeSA9IHsgbGFiZWw6ICdiJywgdHlwZTogJ3NoZWxsJywgY29tbWFuZDogJ2VjaG8nLCBhcmdzOiBbJ2InXSB9O1xuXHRcdGNvbnN0IHRhc2s6IElUYXNrRW50cnkgPSB7IGxhYmVsOiAndG9wJywgZGVwZW5kc09uOiBbJ2EnLCAnYiddIH07XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKFxuXHRcdFx0YXdhaXQgcmVzb2x2ZVRhc2tDb21tYW5kKHRhc2ssIHsgbG9va3VwOiBsb29rdXBGcm9tKGEsIGIpIH0pLFxuXHRcdFx0J2VjaG8gYSAmJiBlY2hvIGInXG5cdFx0KTtcblx0fSk7XG5cblx0dGVzdCgnZGVwZW5kc09yZGVyPXNlcXVlbmNlIGlzIGV4cGxpY2l0IGFuZCBlcXVpdmFsZW50IHRvIGRlZmF1bHQnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgYTogSVRhc2tFbnRyeSA9IHsgbGFiZWw6ICdhJywgdHlwZTogJ3NoZWxsJywgY29tbWFuZDogJ2VjaG8nLCBhcmdzOiBbJ2EnXSB9O1xuXHRcdGNvbnN0IGI6IElUYXNrRW50cnkgPSB7IGxhYmVsOiAnYicsIHR5cGU6ICdzaGVsbCcsIGNvbW1hbmQ6ICdlY2hvJywgYXJnczogWydiJ10gfTtcblx0XHRjb25zdCB0YXNrOiBJVGFza0VudHJ5ID0geyBsYWJlbDogJ3RvcCcsIGRlcGVuZHNPbjogWydhJywgJ2InXSwgZGVwZW5kc09yZGVyOiAnc2VxdWVuY2UnIH07XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKFxuXHRcdFx0YXdhaXQgcmVzb2x2ZVRhc2tDb21tYW5kKHRhc2ssIHsgbG9va3VwOiBsb29rdXBGcm9tKGEsIGIpIH0pLFxuXHRcdFx0J2VjaG8gYSAmJiBlY2hvIGInXG5cdFx0KTtcblx0fSk7XG5cblx0dGVzdCgnZGVwZW5kc09yZGVyPXBhcmFsbGVsIHJlbmRlcnMgYXMgYmFja2dyb3VuZGVkIHN1YnNoZWxscyB3aXRoIHRyYWlsaW5nIHdhaXQnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgYTogSVRhc2tFbnRyeSA9IHsgbGFiZWw6ICdhJywgdHlwZTogJ3NoZWxsJywgY29tbWFuZDogJ2VjaG8nLCBhcmdzOiBbJ2EnXSB9O1xuXHRcdGNvbnN0IGI6IElUYXNrRW50cnkgPSB7IGxhYmVsOiAnYicsIHR5cGU6ICdzaGVsbCcsIGNvbW1hbmQ6ICdlY2hvJywgYXJnczogWydiJ10gfTtcblx0XHRjb25zdCB0YXNrOiBJVGFza0VudHJ5ID0geyBsYWJlbDogJ3RvcCcsIGRlcGVuZHNPbjogWydhJywgJ2InXSwgZGVwZW5kc09yZGVyOiAncGFyYWxsZWwnIH07XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKFxuXHRcdFx0YXdhaXQgcmVzb2x2ZVRhc2tDb21tYW5kKHRhc2ssIHsgbG9va3VwOiBsb29rdXBGcm9tKGEsIGIpIH0pLFxuXHRcdFx0JyggZWNobyBhICkgJiAoIGVjaG8gYiApICYgd2FpdCdcblx0XHQpO1xuXHR9KTtcblxuXHR0ZXN0KCdkZXBlbmRzT24tb25seSB0YXNrIChubyBvd24gY29tbWFuZCkgcmVzb2x2ZXMgdG8gdGhlIGRlcGVuZGVuY3kgY2hhaW4nLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgYTogSVRhc2tFbnRyeSA9IHsgbGFiZWw6ICdhJywgdHlwZTogJ3NoZWxsJywgY29tbWFuZDogJ2VjaG8nLCBhcmdzOiBbJ2EnXSB9O1xuXHRcdGNvbnN0IGI6IElUYXNrRW50cnkgPSB7IGxhYmVsOiAnYicsIHR5cGU6ICdzaGVsbCcsIGNvbW1hbmQ6ICdlY2hvJywgYXJnczogWydiJ10gfTtcblx0XHRjb25zdCB0YXNrOiBJVGFza0VudHJ5ID0geyBsYWJlbDogJ2dyb3VwJywgZGVwZW5kc09uOiBbJ2EnLCAnYiddLCBkZXBlbmRzT3JkZXI6ICdzZXF1ZW5jZScgfTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoXG5cdFx0XHRhd2FpdCByZXNvbHZlVGFza0NvbW1hbmQodGFzaywgeyBsb29rdXA6IGxvb2t1cEZyb20oYSwgYikgfSksXG5cdFx0XHQnZWNobyBhICYmIGVjaG8gYidcblx0XHQpO1xuXHR9KTtcblxuXHR0ZXN0KCdkZXBlbmRzT24gbWlzc2luZyBpbiBsb29rdXAgaXMgc2tpcHBlZCwgb3RoZXJzIHN0aWxsIHJlc29sdmUnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgYTogSVRhc2tFbnRyeSA9IHsgbGFiZWw6ICdhJywgdHlwZTogJ3NoZWxsJywgY29tbWFuZDogJ2VjaG8nLCBhcmdzOiBbJ2EnXSB9O1xuXHRcdGNvbnN0IHRhc2s6IElUYXNrRW50cnkgPSB7IGxhYmVsOiAndG9wJywgZGVwZW5kc09uOiBbJ2EnLCAnZG9lcy1ub3QtZXhpc3QnXSB9O1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChcblx0XHRcdGF3YWl0IHJlc29sdmVUYXNrQ29tbWFuZCh0YXNrLCB7IGxvb2t1cDogbG9va3VwRnJvbShhKSB9KSxcblx0XHRcdCdlY2hvIGEnXG5cdFx0KTtcblx0fSk7XG5cblx0dGVzdCgnZGVwZW5kc09uIGN5Y2xlcyBhcmUgYnJva2VuIGJ5IGN5Y2xlLXRyYWNraW5nJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IGE6IElUYXNrRW50cnkgPSB7IGxhYmVsOiAnYScsIHR5cGU6ICdzaGVsbCcsIGNvbW1hbmQ6ICdlY2hvJywgYXJnczogWydhJ10sIGRlcGVuZHNPbjogJ2InIH07XG5cdFx0Y29uc3QgYjogSVRhc2tFbnRyeSA9IHsgbGFiZWw6ICdiJywgdHlwZTogJ3NoZWxsJywgY29tbWFuZDogJ2VjaG8nLCBhcmdzOiBbJ2InXSwgZGVwZW5kc09uOiAnYScgfTtcblx0XHQvLyBTdGFydGluZyBmcm9tIGBhYDogYSBkZXBlbmRzIG9uIGI7IGIgZGVwZW5kcyBvbiBhOyBhIGlzIGFscmVhZHkgb24gdGhlXG5cdFx0Ly8gc3RhY2sgc28gdGhlIGlubmVyIHJlZmVyZW5jZSBjb250cmlidXRlcyBub3RoaW5nIFx1MjAxNCBiIHJlc29sdmVzIHRvIGl0c1xuXHRcdC8vIG93biBjb21tYW5kLCB3aGljaCB0aGVuIHJ1bnMgYmVmb3JlIGEncyBvd24gY29tbWFuZC5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoXG5cdFx0XHRhd2FpdCByZXNvbHZlVGFza0NvbW1hbmQoYSwgeyBsb29rdXA6IGxvb2t1cEZyb20oYSwgYikgfSksXG5cdFx0XHQnZWNobyBiICYmIGVjaG8gYSdcblx0XHQpO1xuXHR9KTtcblxuXHR0ZXN0KCduZXN0ZWQgZGVwZW5kZW5jaWVzIHJlc29sdmUgcmVjdXJzaXZlbHknLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgbGVhZjogSVRhc2tFbnRyeSA9IHsgbGFiZWw6ICdsZWFmJywgdHlwZTogJ3NoZWxsJywgY29tbWFuZDogJ2VjaG8nLCBhcmdzOiBbJ2xlYWYnXSB9O1xuXHRcdGNvbnN0IG1pZDogSVRhc2tFbnRyeSA9IHsgbGFiZWw6ICdtaWQnLCB0eXBlOiAnc2hlbGwnLCBjb21tYW5kOiAnZWNobycsIGFyZ3M6IFsnbWlkJ10sIGRlcGVuZHNPbjogJ2xlYWYnIH07XG5cdFx0Y29uc3QgdG9wOiBJVGFza0VudHJ5ID0geyBsYWJlbDogJ3RvcCcsIHR5cGU6ICdzaGVsbCcsIGNvbW1hbmQ6ICdlY2hvJywgYXJnczogWyd0b3AnXSwgZGVwZW5kc09uOiAnbWlkJyB9O1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChcblx0XHRcdGF3YWl0IHJlc29sdmVUYXNrQ29tbWFuZCh0b3AsIHsgbG9va3VwOiBsb29rdXBGcm9tKGxlYWYsIG1pZCkgfSksXG5cdFx0XHQnZWNobyBsZWFmICYmIGVjaG8gbWlkICYmIGVjaG8gdG9wJ1xuXHRcdCk7XG5cdH0pO1xuXG5cdHRlc3QoJ2RlcGVuZHNPbiB3aXRob3V0IGxvb2t1cCBmYWxscyBiYWNrIHRvIG93biBjb21tYW5kIChvciB1bmRlZmluZWQpJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHRhc2s6IElUYXNrRW50cnkgPSB7IGxhYmVsOiAndG9wJywgdHlwZTogJ3NoZWxsJywgY29tbWFuZDogJ21ha2UnLCBkZXBlbmRzT246ICdwcmVwJyB9O1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChhd2FpdCByZXNvbHZlVGFza0NvbW1hbmQodGFzayksICdtYWtlJyk7XG5cdFx0Y29uc3QgdGFza05vT3duOiBJVGFza0VudHJ5ID0geyBsYWJlbDogJ2dyb3VwJywgZGVwZW5kc09uOiAncHJlcCcgfTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYXdhaXQgcmVzb2x2ZVRhc2tDb21tYW5kKHRhc2tOb093biksIHVuZGVmaW5lZCk7XG5cdH0pO1xuXG5cdHRlc3QoJ3Jlc29sdmVWYXJpYWJsZXMgaXMgYXBwbGllZCB0byBhcmdzIGJlZm9yZSBxdW90aW5nIChwbGFpbiBwYXRoIG5lZWRzIG5vIHF1b3RpbmcpJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHJlc29sdmVWYXJpYWJsZXMgPSBhc3luYyAodmFsdWU6IHN0cmluZykgPT4gdmFsdWUucmVwbGFjZSgnJHt3b3Jrc3BhY2VGb2xkZXJ9JywgJy9ob21lL3VzZXIvd29ya3RyZWUnKTtcblx0XHRjb25zdCB0YXNrOiBJVGFza0VudHJ5ID0ge1xuXHRcdFx0bGFiZWw6ICdydW4nLFxuXHRcdFx0dHlwZTogJ3NoZWxsJyxcblx0XHRcdGNvbW1hbmQ6ICcuL3NjcmlwdHMvY29kZS5zaCcsXG5cdFx0XHRhcmdzOiBbJy0tdXNlci1kYXRhLWRpcj0ke3dvcmtzcGFjZUZvbGRlcn0vLnByb2ZpbGUtb3NzJ10sXG5cdFx0fTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoXG5cdFx0XHRhd2FpdCByZXNvbHZlVGFza0NvbW1hbmQodGFzaywgeyByZXNvbHZlVmFyaWFibGVzIH0pLFxuXHRcdFx0Jy4vc2NyaXB0cy9jb2RlLnNoIC0tdXNlci1kYXRhLWRpcj0vaG9tZS91c2VyL3dvcmt0cmVlLy5wcm9maWxlLW9zcydcblx0XHQpO1xuXHR9KTtcblxuXHR0ZXN0KCdyZXNvbHZlVmFyaWFibGVzIHJlc3VsdCBjb250YWluaW5nIHNwYWNlcyBpcyBzdHJvbmctcXVvdGVkJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHJlc29sdmVWYXJpYWJsZXMgPSBhc3luYyAodmFsdWU6IHN0cmluZykgPT4gdmFsdWUucmVwbGFjZSgnJHt3b3Jrc3BhY2VGb2xkZXJ9JywgJy9Vc2Vycy9tZS9teSB3b3JrdHJlZScpO1xuXHRcdGNvbnN0IHRhc2s6IElUYXNrRW50cnkgPSB7XG5cdFx0XHRsYWJlbDogJ3J1bicsXG5cdFx0XHR0eXBlOiAnc2hlbGwnLFxuXHRcdFx0Y29tbWFuZDogJ2NhdCcsXG5cdFx0XHRhcmdzOiBbJyR7d29ya3NwYWNlRm9sZGVyfS9maWxlLnR4dCddLFxuXHRcdH07XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKFxuXHRcdFx0YXdhaXQgcmVzb2x2ZVRhc2tDb21tYW5kKHRhc2ssIHsgcmVzb2x2ZVZhcmlhYmxlcyB9KSxcblx0XHRcdGBjYXQgJy9Vc2Vycy9tZS9teSB3b3JrdHJlZS9maWxlLnR4dCdgXG5cdFx0KTtcblx0fSk7XG5cblx0dGVzdCgncmVzb2x2ZVZhcmlhYmxlcyBpcyBhcHBsaWVkIHRvIHRoZSBjb21tYW5kIHN0cmluZycsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCByZXNvbHZlVmFyaWFibGVzID0gYXN5bmMgKHZhbHVlOiBzdHJpbmcpID0+IHZhbHVlLnJlcGxhY2UoJyR7d29ya3NwYWNlUm9vdH0nLCAnL3JlcG8nKTtcblx0XHRjb25zdCB0YXNrOiBJVGFza0VudHJ5ID0geyBsYWJlbDogJ3J1bicsIHR5cGU6ICdzaGVsbCcsIGNvbW1hbmQ6ICcke3dvcmtzcGFjZVJvb3R9L3NjcmlwdHMvY29kZS5zaCcgfTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoXG5cdFx0XHRhd2FpdCByZXNvbHZlVGFza0NvbW1hbmQodGFzaywgeyByZXNvbHZlVmFyaWFibGVzIH0pLFxuXHRcdFx0Jy9yZXBvL3NjcmlwdHMvY29kZS5zaCdcblx0XHQpO1xuXHR9KTtcblxuXHR0ZXN0KCd2YXJpYWJsZXMgbGVmdCB1bnRvdWNoZWQgKGFuZCBzdHJvbmctcXVvdGVkKSB3aGVuIG5vIHJlc29sdmVWYXJpYWJsZXMgaG9vayBwcm92aWRlZCcsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCB0YXNrOiBJVGFza0VudHJ5ID0geyBsYWJlbDogJ3J1bicsIHR5cGU6ICdzaGVsbCcsIGNvbW1hbmQ6ICdlY2hvJywgYXJnczogWycke3dvcmtzcGFjZUZvbGRlcn0nXSB9O1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChhd2FpdCByZXNvbHZlVGFza0NvbW1hbmQodGFzayksICdlY2hvIFxcJyR7d29ya3NwYWNlRm9sZGVyfVxcJycpO1xuXHR9KTtcbn0pO1xuXG5zdWl0ZSgnb3NUb1Rhc2tUYXJnZXRPUycsICgpID0+IHtcblxuXHRlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUoKTtcblxuXHR0ZXN0KCdtYXBzIGVhY2ggT3BlcmF0aW5nU3lzdGVtIHRvIGl0cyB0YXNrcy5qc29uIGtleScsIGFzeW5jICgpID0+IHtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwob3NUb1Rhc2tUYXJnZXRPUyhPcGVyYXRpbmdTeXN0ZW0uV2luZG93cyksICd3aW5kb3dzJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG9zVG9UYXNrVGFyZ2V0T1MoT3BlcmF0aW5nU3lzdGVtLk1hY2ludG9zaCksICdvc3gnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwob3NUb1Rhc2tUYXJnZXRPUyhPcGVyYXRpbmdTeXN0ZW0uTGludXgpLCAnbGludXgnKTtcblx0fSk7XG59KTtcbiJdLAogICJtYXBwaW5ncyI6ICJBQUtBLE9BQU8sWUFBWTtBQUNuQixTQUFTLHVCQUF1QjtBQUNoQyxTQUFTLCtDQUErQztBQUV4RCxTQUFTLGtCQUFrQiwwQkFBMEI7QUFFckQsTUFBTSxzQkFBc0IsTUFBTTtBQUVqQywwQ0FBd0M7QUFFeEMsT0FBSywyQkFBMkIsWUFBWTtBQUMzQyxVQUFNLE9BQW1CLEVBQUUsT0FBTyxRQUFRLE1BQU0sU0FBUyxTQUFTLFFBQVEsTUFBTSxDQUFDLFNBQVMsT0FBTyxFQUFFO0FBQ25HLFdBQU8sWUFBWSxNQUFNLG1CQUFtQixJQUFJLEdBQUcsa0JBQWtCO0FBQUEsRUFDdEUsQ0FBQztBQUVELE9BQUssK0RBQStELFlBQVk7QUFDL0UsVUFBTSxPQUFtQixFQUFFLE9BQU8sUUFBUSxNQUFNLFNBQVMsU0FBUyxR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
