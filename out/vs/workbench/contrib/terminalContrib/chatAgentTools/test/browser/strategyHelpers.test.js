import assert from "assert";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../../../base/test/common/utils.js";
import { stripCommandEchoAndPrompt } from "../../browser/executeStrategy/strategyHelpers.js";
suite("stripCommandEchoAndPrompt", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  test("strips single-line command echo and trailing prompt", () => {
    const output = [
      "user@host:~/src $ echo hello",
      "hello",
      "user@host:~/src $ "
    ].join("\n");
    assert.strictEqual(
      stripCommandEchoAndPrompt(output, "echo hello"),
      "hello"
    );
  });
  test("strips command echo with zsh-style prompt (] $ )", () => {
    const output = [
      "s/testWorkspace (main**) ] $  true",
      "[ alex@Alexandrus-MacBook-Pro:/Users/alex/src/vscode4/extensions/vscode-api-test",
      "s/testWorkspace (main**) ] $ "
    ].join("\n");
    assert.strictEqual(
      stripCommandEchoAndPrompt(output, "true"),
      ""
    );
  });
  test("preserves actual command output between echo and prompt", () => {
    const output = [
      "s/testWorkspace (main**) ] $  echo MARKER_123",
      "MARKER_123",
      "[ alex@host:/some/path",
      "s/testWorkspace (main**) ] $ "
    ].join("\n");
    assert.strictEqual(
      stripCommandEchoAndPrompt(output, "echo MARKER_123"),
      "MARKER_123"
    );
  });
  test("preserves multi-line command output", () => {
    const output = [
      "user@host:~ $ echo line1 && echo line2 && echo line3",
      "line1",
      "line2",
      "line3",
      "user@host:~ $ "
    ].join("\n");
    assert.strictEqual(
      stripCommandEchoAndPrompt(output, "echo line1 && echo line2 && echo line3"),
      "line1\nline2\nline3"
    );
  });
  test("handles empty output (no-output command)", () => {
    const output = [
      "s/testWorkspace (main**) ] $  true",
      "[ alex@host:/Users/alex/src/vscode4/extensions/vscode-api-test",
      "s/testWorkspace (main**) ] $"
    ].join("\n");
    assert.strictEqual(
      stripCommandEchoAndPrompt(output, "true"),
      ""
    );
  });
  test("strips sandbox-wrapped command echo (long wrapped lines)", () => {
    const sandboxCommand = `ELECTRON_RUN_AS_NODE=1 PATH="$PATH:/app/rg/bin" TMPDIR="/tmp/sandbox" "/app/sandbox-runtime/dist/cli.js" --settings "/tmp/sandbox-settings.json" -c 'curl -s https://example.com'`;
    const output = [
      's/testWorkspace (main**) ] $ ELECTRON_RUN_AS_NODE=1 PATH="$PATH:/app/rg/bin" T',
      'MPDIR="/tmp/sandbox" "/app/sandbox-runtime/dist/cli.js" --settings "/tmp/sand',
      `box-settings.json" -c 'curl -s https://example.com'`,
      "[ alex@host:/Users/alex/src/vscode4/extensions/vscode-api-test",
      "s/testWorkspace (main**) ] $ "
    ].join("\n");
    assert.strictEqual(
      stripCommandEchoAndPrompt(output, sandboxCommand),
      ""
    );
  });
  test("strips trailing prompt with various prompt styles", () => {
    assert.strictEqual(
      stripCommandEchoAndPrompt(
        ["user@host:~ $ echo hello", "hello", "user@host:~ $ "].join("\n"),
        "echo hello"
      ),
      "hello",
      "Failed for bash $ prompt"
    );
    assert.strictEqual(
      stripCommandEchoAndPrompt(
        ["root@server:/var/log# echo hello", "hello", "root@server:/var/log# "].join("\n"),
        "echo hello"
      ),
      "hello",
      "Failed for root # prompt"
    );
    assert.strictEqual(
      stripCommandEchoAndPrompt(
        ["s/workspace ] $ echo hello", "hello", "s/workspace ] $ "].join("\n"),
        "echo hello"
      ),
      "hello",
      "Failed for bracketed ] $ prompt"
    );
    assert.strictEqual(
      stripCommandEchoAndPrompt(
        ["PS C:\\Users\\test> echo hello", "hello", "PS C:\\Users\\test>"].join("\n"),
        "echo hello"
      ),
      "hello",
      "Failed for PowerShell prompt"
    );
  });
  test("does not strip output lines ending with prompt-like characters", () => {
    assert.strictEqual(
      stripCommandEchoAndPrompt(
        ['user@host:~ $ echo "100%"', "100%", "user@host:~ $ "].join("\n"),
        'echo "100%"'
      ),
      "100%",
      "Should not strip line ending with %"
    );
    assert.strictEqual(
      stripCommandEchoAndPrompt(
        ['user@host:~ $ echo "<div>"', "<div>", "user@host:~ $ "].join("\n"),
        'echo "<div>"'
      ),
      "<div>",
      "Should not strip line ending with >"
    );
    assert.strictEqual(
      stripCommandEchoAndPrompt(
        ['user@host:~ $ echo "item #"', "item #", "user@host:~ $ "].join("\n"),
        'echo "item #"'
      ),
      "item #",
      "Should not strip line ending with #"
    );
  });
  test("handles command with leading space (history prevention)", () => {
    const output = [
      "user@host:~ $  echo hello",
      "hello",
      "user@host:~ $ "
    ].join("\n");
    assert.strictEqual(
      stripCommandEchoAndPrompt(output, " echo hello"),
      "hello"
    );
  });
  test("does not strip actual output lines that happen to contain prompt chars", () => {
    const output = [
      'user@host:~ $ echo "price is $5"',
      "price is $5",
      "user@host:~ $ "
    ].join("\n");
    assert.strictEqual(
      stripCommandEchoAndPrompt(output, 'echo "price is $5"'),
      "price is $5"
    );
  });
  test("handles output with no trailing prompt (e.g. command still running)", () => {
    const output = [
      "user@host:~ $ echo hello",
      "hello"
    ].join("\n");
    assert.strictEqual(
      stripCommandEchoAndPrompt(output, "echo hello"),
      "hello"
    );
  });
  test("handles output with only the command echo and no prompt", () => {
    const output = "user@host:~ $ true";
    assert.strictEqual(
      stripCommandEchoAndPrompt(output, "true"),
      ""
    );
  });
  test("handles empty string input", () => {
    assert.strictEqual(
      stripCommandEchoAndPrompt("", "echo hello"),
      ""
    );
  });
  test("handles bash -c subshell command echo", () => {
    const output = [
      's/testWorkspace (main**) ] $  bash -c "exit 42"',
      "[ alex@host:/Users/alex/src/vscode4/extensions/vscode-api-test",
      "s/testWorkspace (main**) ] $ "
    ].join("\n");
    assert.strictEqual(
      stripCommandEchoAndPrompt(output, 'bash -c "exit 42"'),
      ""
    );
  });
  test("strips wrapped prompt lines with user@hostname pattern", () => {
    const output = [
      "user@host:~ $ echo hi",
      "hi",
      "[ alex@Alexandrus-MacBook-Pro:/very/long/path/that/wraps/across/terminal/col",
      "umns/in/the/test/workspace ] $"
    ].join("\n");
    assert.strictEqual(
      stripCommandEchoAndPrompt(output, "echo hi"),
      "hi"
    );
  });
  test("handles PowerShell-style prompt (PS C:\\>)", () => {
    const output = [
      "PS C:\\Users\\test> echo hello",
      "hello",
      "PS C:\\Users\\test>"
    ].join("\n");
    assert.strictEqual(
      stripCommandEchoAndPrompt(output, "echo hello"),
      "hello"
    );
  });
  test("strips stale prompt fragments and ^C residue before command echo", () => {
    const output = [
      "ts/testWorkspace$ ^C",
      "cloudtest@5ac6b023c000000:/mnt/vss/_work/vscode/vscode/extensions/vscode-api-tes",
      "ts/testWorkspace$  echo MARKER_123",
      "MARKER_123"
    ].join("\n");
    assert.strictEqual(
      stripCommandEchoAndPrompt(output, "echo MARKER_123"),
      "MARKER_123"
    );
  });
  test("strips stale prompt fragments for no-output command", () => {
    const output = [
      "ts/testWorkspace$ ^C",
      "cloudtest@5ac6b023c000000:/mnt/vss/_work/vscode/vscode/extensions/vscode-api-tes",
      "ts/testWorkspace$  true"
    ].join("\n");
    assert.strictEqual(
      stripCommandEchoAndPrompt(output, "true"),
      ""
    );
  });
  test("strips stale prompt fragments for multi-line output", () => {
    const output = [
      "ts/testWorkspace$ ^C",
      "cloudtest@5ac6b023c000000:/mnt/vss/_work/vscode/vscode/extensions/vscode-api-tes",
      "ts/testWorkspace$  echo M1 && echo M2 && echo M3",
      "M1",
      "M2",
      "M3"
    ].join("\n");
    assert.strictEqual(
      stripCommandEchoAndPrompt(output, "echo M1 && echo M2 && echo M3"),
      "M1\nM2\nM3"
    );
  });
  test("strips trailing prompt without @ (hostname:path user$)", () => {
    const output = [
      "dsm12-be220-abc:testWorkspace runner$  echo hello",
      "hello",
      "dsm12-be220-abc:testWorkspace runner$"
    ].join("\n");
    assert.strictEqual(
      stripCommandEchoAndPrompt(output, "echo hello"),
      "hello"
    );
  });
  test("strips wrapped trailing prompt without @ (hostname:path + fragment$)", () => {
    const output = [
      "dsm12-be220-abc:testWorkspace runner$  echo hello",
      "hello",
      "dsm12-be220-8627ea7f-2c5a-40cd-8ba1-bf324bb4f59a-DA35C080942E:testWorkspace runn",
      "er$"
    ].join("\n");
    assert.strictEqual(
      stripCommandEchoAndPrompt(output, "echo hello"),
      "hello"
    );
  });
  test("strips wrapped trailing prompt with path-like fragment (ts/testWorkspace$)", () => {
    const output = [
      "user@host:~ $ echo hello",
      "hello",
      "cloudtest@d4b0d881c000000:/mnt/vss/_work/vscode/vscode/extensions/vscode-api-tes",
      "ts/testWorkspace$"
    ].join("\n");
    assert.strictEqual(
      stripCommandEchoAndPrompt(output, "echo hello"),
      "hello"
    );
  });
  test("strips trailing prompt fragment for no-output command", () => {
    const output = [
      "dsm12-be220-abc:testWorkspace runner$  true",
      "dsm12-be220-8627ea7f-2c5a-40cd-8ba1-bf324bb4f59a-DA35C080942E:testWorkspace runn",
      "er$"
    ].join("\n");
    assert.strictEqual(
      stripCommandEchoAndPrompt(output, "true"),
      ""
    );
  });
  test("strips mid-word wrapped command continuation (PowerShell/Windows)", () => {
    const output = [
      "PS D:\\a\\_work\\vscode\\testWorkspace> echo MARK",
      "ER_123_ECHO",
      "MARKER_123_ECHO"
    ].join("\n");
    assert.strictEqual(
      stripCommandEchoAndPrompt(output, "echo MARKER_123_ECHO"),
      "MARKER_123_ECHO"
    );
  });
  test("strips PowerShell prompt from getOutput() result", () => {
    const output = "PS D:\\a\\_work\\vscode\\testWorkspace> cmd /c exit 42";
    assert.strictEqual(
      stripCommandEchoAndPrompt(output, "cmd /c exit 42"),
      ""
    );
  });
  test("strips partial command echo (suffix from wrapped getOutput)", () => {
    const output = [
      "90741 ; echo M2_1774133190741 ; echo M3_1774133190741",
      "M1_1774133190741",
      "M2_1774133190741",
      "M3_1774133190741"
    ].join("\n");
    assert.strictEqual(
      stripCommandEchoAndPrompt(output, "echo M1_1774133190741 ; echo M2_1774133190741 ; echo M3_1774133190741"),
      "M1_1774133190741\nM2_1774133190741\nM3_1774133190741"
    );
  });
  test("strips bracketed prompt without @ (hostname:path format)", () => {
    const output = [
      "[W007DV9PF9-1:~/vss/_work/1/s/extensions/vscode-api-tests/testWorkspace] cloudte",
      "st$"
    ].join("\n");
    assert.strictEqual(
      stripCommandEchoAndPrompt(output, "true"),
      ""
    );
  });
  test("strips bracketed prompt without @ (single line, no trailing $)", () => {
    const output = "[W007DV9PF9-1:~/vss/_work/1/s/extensions/vscode-api-tests/testWorkspace] cloudte";
    assert.strictEqual(
      stripCommandEchoAndPrompt(output, "true"),
      ""
    );
  });
  test("strips bracketed prompt without @ with command echo", () => {
    const output = [
      "[W007DV9PF9-1:~/vss/_work] cloudtest$  echo MARKER_123",
      "MARKER_123",
      "[W007DV9PF9-1:~/vss/_work] cloudtest$"
    ].join("\n");
    assert.strictEqual(
      stripCommandEchoAndPrompt(output, "echo MARKER_123"),
      "MARKER_123"
    );
  });
  test("strips sandbox-wrapped command echo with error output and trailing prompt", () => {
    const commandLine = `ELECTRON_RUN_AS_NODE=1 PATH="$PATH:/Users/alex/src/vscode4/node_modules/@vscode/ripgrep/bin" TMPDIR="/Users/alex/.vscode-oss-dev/tmp" CLAUDE_TMPDIR="/Users/alex/.vscode-oss-dev/tmp" "/Users/alex/src/vscode4/node_modules/@vscode/sandbox-runtime/dist/cli.js" --settings "/Users/alex/.vscode-oss-dev/tmp/vscode-sandbox-settings-cf5b6232-825b-4f4c-8902-32a8591007fd.json" -c ' echo "SANDBOX_TMP_1774127409076" > /tmp/SANDBOX_TMP_1774127409076.txt'`;
    const output = [
      'ELECTRON_RUN_AS_NODE=1 PATH="$PATH:/Users/alex/src/vscode4/node_modules/@vscode/',
      'ripgrep/bin" TMPDIR="/Users/alex/.vscode-oss-dev/tmp" CLAUDE_TMPDIR="/Users/alex',
      '/.vscode-oss-dev/tmp" "/Users/alex/src/vscode4/node_modules/@vscode/sandbox-',
      'runtime/dist/cli.js" --settings "/Users/alex/.vscode-oss-dev/tmp/vscode-sandbo',
      `x-settings-cf5b6232-825b-4f4c-8902-32a8591007fd.json" -c ' echo "SANDBOX_TMP_177`,
      `4127409076" > /tmp/SANDBOX_TMP_1774127409076.txt'`,
      "[ alex@Alexandrus-MacBook-Pro:/Users/alex/src/vscode4/extensions/vscode-api-test",
      "s/testWorkspace (alexdima/fix-303531-sandbox-no-output-leak**) ] $ ELECTRON_RUN_",
      'AS_NODE=1 PATH="$PATH:/Users/alex/src/vscode4/node_modules/@vscode/ripgrep/bin" ',
      'TMPDIR="/Users/alex/.vscode-oss-dev/tmp" CLAUDE_TMPDIR="/Users/alex/.vscode-oss-',
      'dev/tmp" "/Users/alex/src/vscode4/node_modules/@vscode/sandbox-runtime/dis',
      't/cli.js" --settings "/Users/alex/.vscode-oss-dev/tmp/vscode-sandbox-settings-cf',
      `5b6232-825b-4f4c-8902-32a8591007fd.json" -c ' echo "SANDBOX_TMP_1774127409076" >`,
      " /tmp/SANDBOX_TMP_1774127409076.txt'"
    ].join("\n");
    assert.strictEqual(
      stripCommandEchoAndPrompt(output, commandLine),
      ""
    );
  });
  suite("adversarial: output resembling prompts", () => {
    test("output ending with $ is preserved (not confused with wrapped prompt)", () => {
      const output = [
        "user@host:~ $ echo 'test$'",
        "test$",
        "user@host:~ $"
      ].join("\n");
      assert.strictEqual(
        stripCommandEchoAndPrompt(output, "echo 'test$'"),
        "test$"
      );
    });
    test("output ending with # is preserved (not confused with wrapped prompt)", () => {
      const output = [
        "user@host:~ $ echo 'div#'",
        "div#",
        "user@host:~ $"
      ].join("\n");
      assert.strictEqual(
        stripCommandEchoAndPrompt(output, "echo 'div#'"),
        "div#"
      );
    });
    test("bracketed log output [tag:~/path] is preserved", () => {
      const output = [
        "user@host:~ $ node build.js",
        "[build:~/dist] compiled successfully",
        "user@host:~ $"
      ].join("\n");
      assert.strictEqual(
        stripCommandEchoAndPrompt(output, "node build.js"),
        "[build:~/dist] compiled successfully"
      );
    });
    test("output containing user@host:path ending with # is preserved", () => {
      const output = [
        "user@host:~ $ cat /etc/motd",
        "admin@server:~/docs #",
        "user@host:~ $"
      ].join("\n");
      assert.strictEqual(
        stripCommandEchoAndPrompt(output, "cat /etc/motd"),
        "admin@server:~/docs #"
      );
    });
    test("output ending with ] $ is preserved", () => {
      const output = [
        "user@host:~ $ echo 'values: [a, b] $'",
        "values: [a, b] $",
        "user@host:~ $"
      ].join("\n");
      assert.strictEqual(
        stripCommandEchoAndPrompt(output, "echo 'values: [a, b] $'"),
        "values: [a, b] $"
      );
    });
    test("multiple prompt-like output lines are all preserved", () => {
      const output = [
        "user@host:~ $ cat prompts.txt",
        "admin@server:~/docs $",
        "root@box:/var/log #",
        "test@dev:~ $",
        "user@host:~ $"
      ].join("\n");
      assert.strictEqual(
        stripCommandEchoAndPrompt(output, "cat prompts.txt"),
        "admin@server:~/docs $\nroot@box:/var/log #\ntest@dev:~ $"
      );
    });
    test("multi-line output where last line has $ after non-word chars is preserved", () => {
      const output = [
        "user@host:~ $ ./report.sh",
        "Revenue: 1000",
        "Currency: USD$",
        "user@host:~ $"
      ].join("\n");
      assert.strictEqual(
        stripCommandEchoAndPrompt(output, "./report.sh"),
        "Revenue: 1000\nCurrency: USD$"
      );
    });
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXHRlcm1pbmFsQ29udHJpYlxcY2hhdEFnZW50VG9vbHNcXHRlc3RcXGJyb3dzZXJcXHN0cmF0ZWd5SGVscGVycy50ZXN0LnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IGFzc2VydCBmcm9tICdhc3NlcnQnO1xuaW1wb3J0IHsgZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS90ZXN0L2NvbW1vbi91dGlscy5qcyc7XG5pbXBvcnQgeyBzdHJpcENvbW1hbmRFY2hvQW5kUHJvbXB0IH0gZnJvbSAnLi4vLi4vYnJvd3Nlci9leGVjdXRlU3RyYXRlZ3kvc3RyYXRlZ3lIZWxwZXJzLmpzJztcblxuc3VpdGUoJ3N0cmlwQ29tbWFuZEVjaG9BbmRQcm9tcHQnLCAoKSA9PiB7XG5cdGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSgpO1xuXG5cdHRlc3QoJ3N0cmlwcyBzaW5nbGUtbGluZSBjb21tYW5kIGVjaG8gYW5kIHRyYWlsaW5nIHByb21wdCcsICgpID0+IHtcblx0XHRjb25zdCBvdXRwdXQgPSBbXG5cdFx0XHQndXNlckBob3N0On4vc3JjICQgZWNobyBoZWxsbycsXG5cdFx0XHQnaGVsbG8nLFxuXHRcdFx0J3VzZXJAaG9zdDp+L3NyYyAkICcsXG5cdFx0XS5qb2luKCdcXG4nKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChcblx0XHRcdHN0cmlwQ29tbWFuZEVjaG9BbmRQcm9tcHQob3V0cHV0LCAnZWNobyBoZWxsbycpLFxuXHRcdFx0J2hlbGxvJ1xuXHRcdCk7XG5cdH0pO1xuXG5cdHRlc3QoJ3N0cmlwcyBjb21tYW5kIGVjaG8gd2l0aCB6c2gtc3R5bGUgcHJvbXB0IChdICQgKScsICgpID0+IHtcblx0XHRjb25zdCBvdXRwdXQgPSBbXG5cdFx0XHQncy90ZXN0V29ya3NwYWNlIChtYWluKiopIF0gJCAgdHJ1ZScsXG5cdFx0XHQnWyBhbGV4QEFsZXhhbmRydXMtTWFjQm9vay1Qcm86L1VzZXJzL2FsZXgvc3JjL3ZzY29kZTQvZXh0ZW5zaW9ucy92c2NvZGUtYXBpLXRlc3QnLFxuXHRcdFx0J3MvdGVzdFdvcmtzcGFjZSAobWFpbioqKSBdICQgJyxcblx0XHRdLmpvaW4oJ1xcbicpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKFxuXHRcdFx0c3RyaXBDb21tYW5kRWNob0FuZFByb21wdChvdXRwdXQsICd0cnVlJyksXG5cdFx0XHQnJ1xuXHRcdCk7XG5cdH0pO1xuXG5cdHRlc3QoJ3ByZXNlcnZlcyBhY3R1YWwgY29tbWFuZCBvdXRwdXQgYmV0d2VlbiBlY2hvIGFuZCBwcm9tcHQnLCAoKSA9PiB7XG5cdFx0Y29uc3Qgb3V0cHV0ID0gW1xuXHRcdFx0J3MvdGVzdFdvcmtzcGFjZSAobWFpbioqKSBdICQgIGVjaG8gTUFSS0VSXzEyMycsXG5cdFx0XHQnTUFSS0VSXzEyMycsXG5cdFx0XHQnWyBhbGV4QGhvc3Q6L3NvbWUvcGF0aCcsXG5cdFx0XHQncy90ZXN0V29ya3NwYWNlIChtYWluKiopIF0gJCAnLFxuXHRcdF0uam9pbignXFxuJyk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoXG5cdFx0XHRzdHJpcENvbW1hbmRFY2hvQW5kUHJvbXB0KG91dHB1dCwgJ2VjaG8gTUFSS0VSXzEyMycpLFxuXHRcdFx0J01BUktFUl8xMjMnXG5cdFx0KTtcblx0fSk7XG5cblx0dGVzdCgncHJlc2VydmVzIG11bHRpLWxpbmUgY29tbWFuZCBvdXRwdXQnLCAoKSA9PiB7XG5cdFx0Y29uc3Qgb3V0cHV0ID0gW1xuXHRcdFx0J3VzZXJAaG9zdDp+ICQgZWNobyBsaW5lMSAmJiBlY2hvIGxpbmUyICYmIGVjaG8gbGluZTMnLFxuXHRcdFx0J2xpbmUxJyxcblx0XHRcdCdsaW5lMicsXG5cdFx0XHQnbGluZTMnLFxuXHRcdFx0J3VzZXJAaG9zdDp+ICQgJyxcblx0XHRdLmpvaW4oJ1xcbicpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKFxuXHRcdFx0c3RyaXBDb21tYW5kRWNob0FuZFByb21wdChvdXRwdXQsICdlY2hvIGxpbmUxICYmIGVjaG8gbGluZTIgJiYgZWNobyBsaW5lMycpLFxuXHRcdFx0J2xpbmUxXFxubGluZTJcXG5saW5lMydcblx0XHQpO1xuXHR9KTtcblxuXHR0ZXN0KCdoYW5kbGVzIGVtcHR5IG91dHB1dCAobm8tb3V0cHV0IGNvbW1hbmQpJywgKCkgPT4ge1xuXHRcdGNvbnN0IG91dHB1dCA9IFtcblx0XHRcdCdzL3Rlc3RXb3Jrc3BhY2UgKG1haW4qKikgXSAkICB0cnVlJyxcblx0XHRcdCdbIGFsZXhAaG9zdDovVXNlcnMvYWxleC9zcmMvdnNjb2RlNC9leHRlbnNpb25zL3ZzY29kZS1hcGktdGVzdCcsXG5cdFx0XHQncy90ZXN0V29ya3NwYWNlIChtYWluKiopIF0gJCcsXG5cdFx0XS5qb2luKCdcXG4nKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChcblx0XHRcdHN0cmlwQ29tbWFuZEVjaG9BbmRQcm9tcHQob3V0cHV0LCAndHJ1ZScpLFxuXHRcdFx0Jydcblx0XHQpO1xuXHR9KTtcblxuXHR0ZXN0KCdzdHJpcHMgc2FuZGJveC13cmFwcGVkIGNvbW1hbmQgZWNobyAobG9uZyB3cmFwcGVkIGxpbmVzKScsICgpID0+IHtcblx0XHRjb25zdCBzYW5kYm94Q29tbWFuZCA9ICdFTEVDVFJPTl9SVU5fQVNfTk9ERT0xIFBBVEg9XCIkUEFUSDovYXBwL3JnL2JpblwiIFRNUERJUj1cIi90bXAvc2FuZGJveFwiIFwiL2FwcC9zYW5kYm94LXJ1bnRpbWUvZGlzdC9jbGkuanNcIiAtLXNldHRpbmdzIFwiL3RtcC9zYW5kYm94LXNldHRpbmdzLmpzb25cIiAtYyBcXCdjdXJsIC1zIGh0dHBzOi8vZXhhbXBsZS5jb21cXCcnO1xuXHRcdGNvbnN0IG91dHB1dCA9IFtcblx0XHRcdCdzL3Rlc3RXb3Jrc3BhY2UgKG1haW4qKikgXSAkIEVMRUNUUk9OX1JVTl9BU19OT0RFPTEgUEFUSD1cIiRQQVRIOi9hcHAvcmcvYmluXCIgVCcsXG5cdFx0XHQnTVBESVI9XCIvdG1wL3NhbmRib3hcIiBcIi9hcHAvc2FuZGJveC1ydW50aW1lL2Rpc3QvY2xpLmpzXCIgLS1zZXR0aW5ncyBcIi90bXAvc2FuZCcsXG5cdFx0XHQnYm94LXNldHRpbmdzLmpzb25cIiAtYyBcXCdjdXJsIC1zIGh0dHBzOi8vZXhhbXBsZS5jb21cXCcnLFxuXHRcdFx0J1sgYWxleEBob3N0Oi9Vc2Vycy9hbGV4L3NyYy92c2NvZGU0L2V4dGVuc2lvbnMvdnNjb2RlLWFwaS10ZXN0Jyxcblx0XHRcdCdzL3Rlc3RXb3Jrc3BhY2UgKG1haW4qKikgXSAkICcsXG5cdFx0XS5qb2luKCdcXG4nKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChcblx0XHRcdHN0cmlwQ29tbWFuZEVjaG9BbmRQcm9tcHQob3V0cHV0LCBzYW5kYm94Q29tbWFuZCksXG5cdFx0XHQnJ1xuXHRcdCk7XG5cdH0pO1xuXG5cdHRlc3QoJ3N0cmlwcyB0cmFpbGluZyBwcm9tcHQgd2l0aCB2YXJpb3VzIHByb21wdCBzdHlsZXMnLCAoKSA9PiB7XG5cdFx0Ly8gYmFzaCB1c2VyQGhvc3Q6cGF0aCAkXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKFxuXHRcdFx0c3RyaXBDb21tYW5kRWNob0FuZFByb21wdChcblx0XHRcdFx0Wyd1c2VyQGhvc3Q6fiAkIGVjaG8gaGVsbG8nLCAnaGVsbG8nLCAndXNlckBob3N0On4gJCAnXS5qb2luKCdcXG4nKSxcblx0XHRcdFx0J2VjaG8gaGVsbG8nXG5cdFx0XHQpLFxuXHRcdFx0J2hlbGxvJyxcblx0XHRcdCdGYWlsZWQgZm9yIGJhc2ggJCBwcm9tcHQnXG5cdFx0KTtcblx0XHQvLyByb290IHVzZXJAaG9zdDpwYXRoICNcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoXG5cdFx0XHRzdHJpcENvbW1hbmRFY2hvQW5kUHJvbXB0KFxuXHRcdFx0XHRbJ3Jvb3RAc2VydmVyOi92YXIvbG9nIyBlY2hvIGhlbGxvJywgJ2hlbGxvJywgJ3Jvb3RAc2VydmVyOi92YXIvbG9nIyAnXS5qb2luKCdcXG4nKSxcblx0XHRcdFx0J2VjaG8gaGVsbG8nXG5cdFx0XHQpLFxuXHRcdFx0J2hlbGxvJyxcblx0XHRcdCdGYWlsZWQgZm9yIHJvb3QgIyBwcm9tcHQnXG5cdFx0KTtcblx0XHQvLyBicmFja2V0ZWQgcHJvbXB0IGVuZGluZyB3aXRoIF0gJFxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChcblx0XHRcdHN0cmlwQ29tbWFuZEVjaG9BbmRQcm9tcHQoXG5cdFx0XHRcdFsncy93b3Jrc3BhY2UgXSAkIGVjaG8gaGVsbG8nLCAnaGVsbG8nLCAncy93b3Jrc3BhY2UgXSAkICddLmpvaW4oJ1xcbicpLFxuXHRcdFx0XHQnZWNobyBoZWxsbydcblx0XHRcdCksXG5cdFx0XHQnaGVsbG8nLFxuXHRcdFx0J0ZhaWxlZCBmb3IgYnJhY2tldGVkIF0gJCBwcm9tcHQnXG5cdFx0KTtcblx0XHQvLyBQb3dlclNoZWxsIFBTIEM6XFw+XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKFxuXHRcdFx0c3RyaXBDb21tYW5kRWNob0FuZFByb21wdChcblx0XHRcdFx0WydQUyBDOlxcXFxVc2Vyc1xcXFx0ZXN0PiBlY2hvIGhlbGxvJywgJ2hlbGxvJywgJ1BTIEM6XFxcXFVzZXJzXFxcXHRlc3Q+J10uam9pbignXFxuJyksXG5cdFx0XHRcdCdlY2hvIGhlbGxvJ1xuXHRcdFx0KSxcblx0XHRcdCdoZWxsbycsXG5cdFx0XHQnRmFpbGVkIGZvciBQb3dlclNoZWxsIHByb21wdCdcblx0XHQpO1xuXHR9KTtcblxuXHR0ZXN0KCdkb2VzIG5vdCBzdHJpcCBvdXRwdXQgbGluZXMgZW5kaW5nIHdpdGggcHJvbXB0LWxpa2UgY2hhcmFjdGVycycsICgpID0+IHtcblx0XHQvLyBPdXRwdXQgZW5kaW5nIHdpdGggJSAoZS5nLiBwZXJjZW50YWdlKVxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChcblx0XHRcdHN0cmlwQ29tbWFuZEVjaG9BbmRQcm9tcHQoXG5cdFx0XHRcdFsndXNlckBob3N0On4gJCBlY2hvIFwiMTAwJVwiJywgJzEwMCUnLCAndXNlckBob3N0On4gJCAnXS5qb2luKCdcXG4nKSxcblx0XHRcdFx0J2VjaG8gXCIxMDAlXCInXG5cdFx0XHQpLFxuXHRcdFx0JzEwMCUnLFxuXHRcdFx0J1Nob3VsZCBub3Qgc3RyaXAgbGluZSBlbmRpbmcgd2l0aCAlJ1xuXHRcdCk7XG5cdFx0Ly8gT3V0cHV0IGVuZGluZyB3aXRoID4gKGUuZy4gSFRNTCBvciBjb21wYXJpc29uKVxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChcblx0XHRcdHN0cmlwQ29tbWFuZEVjaG9BbmRQcm9tcHQoXG5cdFx0XHRcdFsndXNlckBob3N0On4gJCBlY2hvIFwiPGRpdj5cIicsICc8ZGl2PicsICd1c2VyQGhvc3Q6fiAkICddLmpvaW4oJ1xcbicpLFxuXHRcdFx0XHQnZWNobyBcIjxkaXY+XCInXG5cdFx0XHQpLFxuXHRcdFx0JzxkaXY+Jyxcblx0XHRcdCdTaG91bGQgbm90IHN0cmlwIGxpbmUgZW5kaW5nIHdpdGggPidcblx0XHQpO1xuXHRcdC8vIE91dHB1dCBlbmRpbmcgd2l0aCAjIChlLmcuIGNvbW1lbnQgbWFya2VyKVxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChcblx0XHRcdHN0cmlwQ29tbWFuZEVjaG9BbmRQcm9tcHQoXG5cdFx0XHRcdFsndXNlckBob3N0On4gJCBlY2hvIFwiaXRlbSAjXCInLCAnaXRlbSAjJywgJ3VzZXJAaG9zdDp+ICQgJ10uam9pbignXFxuJyksXG5cdFx0XHRcdCdlY2hvIFwiaXRlbSAjXCInXG5cdFx0XHQpLFxuXHRcdFx0J2l0ZW0gIycsXG5cdFx0XHQnU2hvdWxkIG5vdCBzdHJpcCBsaW5lIGVuZGluZyB3aXRoICMnXG5cdFx0KTtcblx0fSk7XG5cblx0dGVzdCgnaGFuZGxlcyBjb21tYW5kIHdpdGggbGVhZGluZyBzcGFjZSAoaGlzdG9yeSBwcmV2ZW50aW9uKScsICgpID0+IHtcblx0XHRjb25zdCBvdXRwdXQgPSBbXG5cdFx0XHQndXNlckBob3N0On4gJCAgZWNobyBoZWxsbycsXG5cdFx0XHQnaGVsbG8nLFxuXHRcdFx0J3VzZXJAaG9zdDp+ICQgJyxcblx0XHRdLmpvaW4oJ1xcbicpO1xuXG5cdFx0Ly8gVGhlIGNvbW1hbmQgaGFzIGEgbGVhZGluZyBzcGFjZSAoZnJvbSBDb21tYW5kTGluZVByZXZlbnRIaXN0b3J5UmV3cml0ZXIpXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKFxuXHRcdFx0c3RyaXBDb21tYW5kRWNob0FuZFByb21wdChvdXRwdXQsICcgZWNobyBoZWxsbycpLFxuXHRcdFx0J2hlbGxvJ1xuXHRcdCk7XG5cdH0pO1xuXG5cdHRlc3QoJ2RvZXMgbm90IHN0cmlwIGFjdHVhbCBvdXRwdXQgbGluZXMgdGhhdCBoYXBwZW4gdG8gY29udGFpbiBwcm9tcHQgY2hhcnMnLCAoKSA9PiB7XG5cdFx0Y29uc3Qgb3V0cHV0ID0gW1xuXHRcdFx0J3VzZXJAaG9zdDp+ICQgZWNobyBcInByaWNlIGlzICQ1XCInLFxuXHRcdFx0J3ByaWNlIGlzICQ1Jyxcblx0XHRcdCd1c2VyQGhvc3Q6fiAkICcsXG5cdFx0XS5qb2luKCdcXG4nKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChcblx0XHRcdHN0cmlwQ29tbWFuZEVjaG9BbmRQcm9tcHQob3V0cHV0LCAnZWNobyBcInByaWNlIGlzICQ1XCInKSxcblx0XHRcdCdwcmljZSBpcyAkNSdcblx0XHQpO1xuXHR9KTtcblxuXHR0ZXN0KCdoYW5kbGVzIG91dHB1dCB3aXRoIG5vIHRyYWlsaW5nIHByb21wdCAoZS5nLiBjb21tYW5kIHN0aWxsIHJ1bm5pbmcpJywgKCkgPT4ge1xuXHRcdGNvbnN0IG91dHB1dCA9IFtcblx0XHRcdCd1c2VyQGhvc3Q6fiAkIGVjaG8gaGVsbG8nLFxuXHRcdFx0J2hlbGxvJyxcblx0XHRdLmpvaW4oJ1xcbicpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKFxuXHRcdFx0c3RyaXBDb21tYW5kRWNob0FuZFByb21wdChvdXRwdXQsICdlY2hvIGhlbGxvJyksXG5cdFx0XHQnaGVsbG8nXG5cdFx0KTtcblx0fSk7XG5cblx0dGVzdCgnaGFuZGxlcyBvdXRwdXQgd2l0aCBvbmx5IHRoZSBjb21tYW5kIGVjaG8gYW5kIG5vIHByb21wdCcsICgpID0+IHtcblx0XHRjb25zdCBvdXRwdXQgPSAndXNlckBob3N0On4gJCB0cnVlJztcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChcblx0XHRcdHN0cmlwQ29tbWFuZEVjaG9BbmRQcm9tcHQob3V0cHV0LCAndHJ1ZScpLFxuXHRcdFx0Jydcblx0XHQpO1xuXHR9KTtcblxuXHR0ZXN0KCdoYW5kbGVzIGVtcHR5IHN0cmluZyBpbnB1dCcsICgpID0+IHtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoXG5cdFx0XHRzdHJpcENvbW1hbmRFY2hvQW5kUHJvbXB0KCcnLCAnZWNobyBoZWxsbycpLFxuXHRcdFx0Jydcblx0XHQpO1xuXHR9KTtcblxuXHR0ZXN0KCdoYW5kbGVzIGJhc2ggLWMgc3Vic2hlbGwgY29tbWFuZCBlY2hvJywgKCkgPT4ge1xuXHRcdGNvbnN0IG91dHB1dCA9IFtcblx0XHRcdCdzL3Rlc3RXb3Jrc3BhY2UgKG1haW4qKikgXSAkICBiYXNoIC1jIFwiZXhpdCA0MlwiJyxcblx0XHRcdCdbIGFsZXhAaG9zdDovVXNlcnMvYWxleC9zcmMvdnNjb2RlNC9leHRlbnNpb25zL3ZzY29kZS1hcGktdGVzdCcsXG5cdFx0XHQncy90ZXN0V29ya3NwYWNlIChtYWluKiopIF0gJCAnLFxuXHRcdF0uam9pbignXFxuJyk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoXG5cdFx0XHRzdHJpcENvbW1hbmRFY2hvQW5kUHJvbXB0KG91dHB1dCwgJ2Jhc2ggLWMgXCJleGl0IDQyXCInKSxcblx0XHRcdCcnXG5cdFx0KTtcblx0fSk7XG5cblx0dGVzdCgnc3RyaXBzIHdyYXBwZWQgcHJvbXB0IGxpbmVzIHdpdGggdXNlckBob3N0bmFtZSBwYXR0ZXJuJywgKCkgPT4ge1xuXHRcdGNvbnN0IG91dHB1dCA9IFtcblx0XHRcdCd1c2VyQGhvc3Q6fiAkIGVjaG8gaGknLFxuXHRcdFx0J2hpJyxcblx0XHRcdCdbIGFsZXhAQWxleGFuZHJ1cy1NYWNCb29rLVBybzovdmVyeS9sb25nL3BhdGgvdGhhdC93cmFwcy9hY3Jvc3MvdGVybWluYWwvY29sJyxcblx0XHRcdCd1bW5zL2luL3RoZS90ZXN0L3dvcmtzcGFjZSBdICQnLFxuXHRcdF0uam9pbignXFxuJyk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoXG5cdFx0XHRzdHJpcENvbW1hbmRFY2hvQW5kUHJvbXB0KG91dHB1dCwgJ2VjaG8gaGknKSxcblx0XHRcdCdoaSdcblx0XHQpO1xuXHR9KTtcblxuXHR0ZXN0KCdoYW5kbGVzIFBvd2VyU2hlbGwtc3R5bGUgcHJvbXB0IChQUyBDOlxcXFw+KScsICgpID0+IHtcblx0XHRjb25zdCBvdXRwdXQgPSBbXG5cdFx0XHQnUFMgQzpcXFxcVXNlcnNcXFxcdGVzdD4gZWNobyBoZWxsbycsXG5cdFx0XHQnaGVsbG8nLFxuXHRcdFx0J1BTIEM6XFxcXFVzZXJzXFxcXHRlc3Q+Jyxcblx0XHRdLmpvaW4oJ1xcbicpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKFxuXHRcdFx0c3RyaXBDb21tYW5kRWNob0FuZFByb21wdChvdXRwdXQsICdlY2hvIGhlbGxvJyksXG5cdFx0XHQnaGVsbG8nXG5cdFx0KTtcblx0fSk7XG5cblx0dGVzdCgnc3RyaXBzIHN0YWxlIHByb21wdCBmcmFnbWVudHMgYW5kIF5DIHJlc2lkdWUgYmVmb3JlIGNvbW1hbmQgZWNobycsICgpID0+IHtcblx0XHQvLyBTaW11bGF0ZXMgQ0kgZW52aXJvbm1lbnQgd2hlcmUgcHJldmlvdXMgXkMgcHJvZHVjZXMgc3RhbGUgcHJvbXB0XG5cdFx0Ly8gZnJhZ21lbnRzIGJlZm9yZSB0aGUgYWN0dWFsIGNvbW1hbmQgZWNobyBsaW5lXG5cdFx0Y29uc3Qgb3V0cHV0ID0gW1xuXHRcdFx0J3RzL3Rlc3RXb3Jrc3BhY2UkIF5DJyxcblx0XHRcdCdjbG91ZHRlc3RANWFjNmIwMjNjMDAwMDAwOi9tbnQvdnNzL193b3JrL3ZzY29kZS92c2NvZGUvZXh0ZW5zaW9ucy92c2NvZGUtYXBpLXRlcycsXG5cdFx0XHQndHMvdGVzdFdvcmtzcGFjZSQgIGVjaG8gTUFSS0VSXzEyMycsXG5cdFx0XHQnTUFSS0VSXzEyMycsXG5cdFx0XS5qb2luKCdcXG4nKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChcblx0XHRcdHN0cmlwQ29tbWFuZEVjaG9BbmRQcm9tcHQob3V0cHV0LCAnZWNobyBNQVJLRVJfMTIzJyksXG5cdFx0XHQnTUFSS0VSXzEyMydcblx0XHQpO1xuXHR9KTtcblxuXHR0ZXN0KCdzdHJpcHMgc3RhbGUgcHJvbXB0IGZyYWdtZW50cyBmb3Igbm8tb3V0cHV0IGNvbW1hbmQnLCAoKSA9PiB7XG5cdFx0Y29uc3Qgb3V0cHV0ID0gW1xuXHRcdFx0J3RzL3Rlc3RXb3Jrc3BhY2UkIF5DJyxcblx0XHRcdCdjbG91ZHRlc3RANWFjNmIwMjNjMDAwMDAwOi9tbnQvdnNzL193b3JrL3ZzY29kZS92c2NvZGUvZXh0ZW5zaW9ucy92c2NvZGUtYXBpLXRlcycsXG5cdFx0XHQndHMvdGVzdFdvcmtzcGFjZSQgIHRydWUnLFxuXHRcdF0uam9pbignXFxuJyk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoXG5cdFx0XHRzdHJpcENvbW1hbmRFY2hvQW5kUHJvbXB0KG91dHB1dCwgJ3RydWUnKSxcblx0XHRcdCcnXG5cdFx0KTtcblx0fSk7XG5cblx0dGVzdCgnc3RyaXBzIHN0YWxlIHByb21wdCBmcmFnbWVudHMgZm9yIG11bHRpLWxpbmUgb3V0cHV0JywgKCkgPT4ge1xuXHRcdGNvbnN0IG91dHB1dCA9IFtcblx0XHRcdCd0cy90ZXN0V29ya3NwYWNlJCBeQycsXG5cdFx0XHQnY2xvdWR0ZXN0QDVhYzZiMDIzYzAwMDAwMDovbW50L3Zzcy9fd29yay92c2NvZGUvdnNjb2RlL2V4dGVuc2lvbnMvdnNjb2RlLWFwaS10ZXMnLFxuXHRcdFx0J3RzL3Rlc3RXb3Jrc3BhY2UkICBlY2hvIE0xICYmIGVjaG8gTTIgJiYgZWNobyBNMycsXG5cdFx0XHQnTTEnLFxuXHRcdFx0J00yJyxcblx0XHRcdCdNMycsXG5cdFx0XS5qb2luKCdcXG4nKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChcblx0XHRcdHN0cmlwQ29tbWFuZEVjaG9BbmRQcm9tcHQob3V0cHV0LCAnZWNobyBNMSAmJiBlY2hvIE0yICYmIGVjaG8gTTMnKSxcblx0XHRcdCdNMVxcbk0yXFxuTTMnXG5cdFx0KTtcblx0fSk7XG5cblx0dGVzdCgnc3RyaXBzIHRyYWlsaW5nIHByb21wdCB3aXRob3V0IEAgKGhvc3RuYW1lOnBhdGggdXNlciQpJywgKCkgPT4ge1xuXHRcdGNvbnN0IG91dHB1dCA9IFtcblx0XHRcdCdkc20xMi1iZTIyMC1hYmM6dGVzdFdvcmtzcGFjZSBydW5uZXIkICBlY2hvIGhlbGxvJyxcblx0XHRcdCdoZWxsbycsXG5cdFx0XHQnZHNtMTItYmUyMjAtYWJjOnRlc3RXb3Jrc3BhY2UgcnVubmVyJCcsXG5cdFx0XS5qb2luKCdcXG4nKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChcblx0XHRcdHN0cmlwQ29tbWFuZEVjaG9BbmRQcm9tcHQob3V0cHV0LCAnZWNobyBoZWxsbycpLFxuXHRcdFx0J2hlbGxvJ1xuXHRcdCk7XG5cdH0pO1xuXG5cdHRlc3QoJ3N0cmlwcyB3cmFwcGVkIHRyYWlsaW5nIHByb21wdCB3aXRob3V0IEAgKGhvc3RuYW1lOnBhdGggKyBmcmFnbWVudCQpJywgKCkgPT4ge1xuXHRcdGNvbnN0IG91dHB1dCA9IFtcblx0XHRcdCdkc20xMi1iZTIyMC1hYmM6dGVzdFdvcmtzcGFjZSBydW5uZXIkICBlY2hvIGhlbGxvJyxcblx0XHRcdCdoZWxsbycsXG5cdFx0XHQnZHNtMTItYmUyMjAtODYyN2VhN2YtMmM1YS00MGNkLThiYTEtYmYzMjRiYjRmNTlhLURBMzVDMDgwOTQyRTp0ZXN0V29ya3NwYWNlIHJ1bm4nLFxuXHRcdFx0J2VyJCcsXG5cdFx0XS5qb2luKCdcXG4nKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChcblx0XHRcdHN0cmlwQ29tbWFuZEVjaG9BbmRQcm9tcHQob3V0cHV0LCAnZWNobyBoZWxsbycpLFxuXHRcdFx0J2hlbGxvJ1xuXHRcdCk7XG5cdH0pO1xuXG5cdHRlc3QoJ3N0cmlwcyB3cmFwcGVkIHRyYWlsaW5nIHByb21wdCB3aXRoIHBhdGgtbGlrZSBmcmFnbWVudCAodHMvdGVzdFdvcmtzcGFjZSQpJywgKCkgPT4ge1xuXHRcdGNvbnN0IG91dHB1dCA9IFtcblx0XHRcdCd1c2VyQGhvc3Q6fiAkIGVjaG8gaGVsbG8nLFxuXHRcdFx0J2hlbGxvJyxcblx0XHRcdCdjbG91ZHRlc3RAZDRiMGQ4ODFjMDAwMDAwOi9tbnQvdnNzL193b3JrL3ZzY29kZS92c2NvZGUvZXh0ZW5zaW9ucy92c2NvZGUtYXBpLXRlcycsXG5cdFx0XHQndHMvdGVzdFdvcmtzcGFjZSQnLFxuXHRcdF0uam9pbignXFxuJyk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoXG5cdFx0XHRzdHJpcENvbW1hbmRFY2hvQW5kUHJvbXB0KG91dHB1dCwgJ2VjaG8gaGVsbG8nKSxcblx0XHRcdCdoZWxsbydcblx0XHQpO1xuXHR9KTtcblxuXHR0ZXN0KCdzdHJpcHMgdHJhaWxpbmcgcHJvbXB0IGZyYWdtZW50IGZvciBuby1vdXRwdXQgY29tbWFuZCcsICgpID0+IHtcblx0XHRjb25zdCBvdXRwdXQgPSBbXG5cdFx0XHQnZHNtMTItYmUyMjAtYWJjOnRlc3RXb3Jrc3BhY2UgcnVubmVyJCAgdHJ1ZScsXG5cdFx0XHQnZHNtMTItYmUyMjAtODYyN2VhN2YtMmM1YS00MGNkLThiYTEtYmYzMjRiYjRmNTlhLURBMzVDMDgwOTQyRTp0ZXN0V29ya3NwYWNlIHJ1bm4nLFxuXHRcdFx0J2VyJCcsXG5cdFx0XS5qb2luKCdcXG4nKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChcblx0XHRcdHN0cmlwQ29tbWFuZEVjaG9BbmRQcm9tcHQob3V0cHV0LCAndHJ1ZScpLFxuXHRcdFx0Jydcblx0XHQpO1xuXHR9KTtcblxuXHR0ZXN0KCdzdHJpcHMgbWlkLXdvcmQgd3JhcHBlZCBjb21tYW5kIGNvbnRpbnVhdGlvbiAoUG93ZXJTaGVsbC9XaW5kb3dzKScsICgpID0+IHtcblx0XHQvLyBQb3dlclNoZWxsIHdyYXBzIFwiZWNobyBNQVJLRVJfMTIzX0VDSE9cIiBhY3Jvc3MgbGluZXMgYXQgY29sdW1uIGJvdW5kYXJ5XG5cdFx0Y29uc3Qgb3V0cHV0ID0gW1xuXHRcdFx0J1BTIEQ6XFxcXGFcXFxcX3dvcmtcXFxcdnNjb2RlXFxcXHRlc3RXb3Jrc3BhY2U+IGVjaG8gTUFSSycsXG5cdFx0XHQnRVJfMTIzX0VDSE8nLFxuXHRcdFx0J01BUktFUl8xMjNfRUNITycsXG5cdFx0XS5qb2luKCdcXG4nKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChcblx0XHRcdHN0cmlwQ29tbWFuZEVjaG9BbmRQcm9tcHQob3V0cHV0LCAnZWNobyBNQVJLRVJfMTIzX0VDSE8nKSxcblx0XHRcdCdNQVJLRVJfMTIzX0VDSE8nXG5cdFx0KTtcblx0fSk7XG5cblx0dGVzdCgnc3RyaXBzIFBvd2VyU2hlbGwgcHJvbXB0IGZyb20gZ2V0T3V0cHV0KCkgcmVzdWx0JywgKCkgPT4ge1xuXHRcdC8vIFdoZW4gc2hlbGwgaW50ZWdyYXRpb24gbWFya2VycyBtaXNmaXJlLCBnZXRPdXRwdXQoKSBpbmNsdWRlcyB0aGUgcHJvbXB0ICsgY29tbWFuZFxuXHRcdGNvbnN0IG91dHB1dCA9ICdQUyBEOlxcXFxhXFxcXF93b3JrXFxcXHZzY29kZVxcXFx0ZXN0V29ya3NwYWNlPiBjbWQgL2MgZXhpdCA0Mic7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoXG5cdFx0XHRzdHJpcENvbW1hbmRFY2hvQW5kUHJvbXB0KG91dHB1dCwgJ2NtZCAvYyBleGl0IDQyJyksXG5cdFx0XHQnJ1xuXHRcdCk7XG5cdH0pO1xuXG5cdHRlc3QoJ3N0cmlwcyBwYXJ0aWFsIGNvbW1hbmQgZWNobyAoc3VmZml4IGZyb20gd3JhcHBlZCBnZXRPdXRwdXQpJywgKCkgPT4ge1xuXHRcdC8vIFdoZW4gZ2V0T3V0cHV0KCkgZG9lc24ndCBpbmNsdWRlIHRoZSBwcm9tcHQgbGluZSwgb25seSB0aGUgd3JhcHBlZFxuXHRcdC8vIGNvbnRpbnVhdGlvbiBvZiB0aGUgY29tbWFuZCBlY2hvIGFwcGVhcnMgYXQgdGhlIHN0YXJ0IG9mIHRoZSBvdXRwdXQuXG5cdFx0Y29uc3Qgb3V0cHV0ID0gW1xuXHRcdFx0JzkwNzQxIDsgZWNobyBNMl8xNzc0MTMzMTkwNzQxIDsgZWNobyBNM18xNzc0MTMzMTkwNzQxJyxcblx0XHRcdCdNMV8xNzc0MTMzMTkwNzQxJyxcblx0XHRcdCdNMl8xNzc0MTMzMTkwNzQxJyxcblx0XHRcdCdNM18xNzc0MTMzMTkwNzQxJyxcblx0XHRdLmpvaW4oJ1xcbicpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKFxuXHRcdFx0c3RyaXBDb21tYW5kRWNob0FuZFByb21wdChvdXRwdXQsICdlY2hvIE0xXzE3NzQxMzMxOTA3NDEgOyBlY2hvIE0yXzE3NzQxMzMxOTA3NDEgOyBlY2hvIE0zXzE3NzQxMzMxOTA3NDEnKSxcblx0XHRcdCdNMV8xNzc0MTMzMTkwNzQxXFxuTTJfMTc3NDEzMzE5MDc0MVxcbk0zXzE3NzQxMzMxOTA3NDEnXG5cdFx0KTtcblx0fSk7XG5cblx0dGVzdCgnc3RyaXBzIGJyYWNrZXRlZCBwcm9tcHQgd2l0aG91dCBAIChob3N0bmFtZTpwYXRoIGZvcm1hdCknLCAoKSA9PiB7XG5cdFx0Ly8gbWFjT1MgQ0kgcHJvbXB0OiBbaG9zdG5hbWU6cGF0aF0gdXNlcm5hbWUkICh3cmFwcGVkIHNvIHVzZXJuYW1lIGlzIHRydW5jYXRlZClcblx0XHRjb25zdCBvdXRwdXQgPSBbXG5cdFx0XHQnW1cwMDdEVjlQRjktMTp+L3Zzcy9fd29yay8xL3MvZXh0ZW5zaW9ucy92c2NvZGUtYXBpLXRlc3RzL3Rlc3RXb3Jrc3BhY2VdIGNsb3VkdGUnLFxuXHRcdFx0J3N0JCcsXG5cdFx0XS5qb2luKCdcXG4nKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChcblx0XHRcdHN0cmlwQ29tbWFuZEVjaG9BbmRQcm9tcHQob3V0cHV0LCAndHJ1ZScpLFxuXHRcdFx0Jydcblx0XHQpO1xuXHR9KTtcblxuXHR0ZXN0KCdzdHJpcHMgYnJhY2tldGVkIHByb21wdCB3aXRob3V0IEAgKHNpbmdsZSBsaW5lLCBubyB0cmFpbGluZyAkKScsICgpID0+IHtcblx0XHQvLyBXaGVuIHRoZSB0ZXJtaW5hbCBjYXB0dXJlcyBqdXN0IHRoZSBwcm9tcHQgKG5vLW91dHB1dCBjb21tYW5kKVxuXHRcdGNvbnN0IG91dHB1dCA9ICdbVzAwN0RWOVBGOS0xOn4vdnNzL193b3JrLzEvcy9leHRlbnNpb25zL3ZzY29kZS1hcGktdGVzdHMvdGVzdFdvcmtzcGFjZV0gY2xvdWR0ZSc7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoXG5cdFx0XHRzdHJpcENvbW1hbmRFY2hvQW5kUHJvbXB0KG91dHB1dCwgJ3RydWUnKSxcblx0XHRcdCcnXG5cdFx0KTtcblx0fSk7XG5cblx0dGVzdCgnc3RyaXBzIGJyYWNrZXRlZCBwcm9tcHQgd2l0aG91dCBAIHdpdGggY29tbWFuZCBlY2hvJywgKCkgPT4ge1xuXHRcdGNvbnN0IG91dHB1dCA9IFtcblx0XHRcdCdbVzAwN0RWOVBGOS0xOn4vdnNzL193b3JrXSBjbG91ZHRlc3QkICBlY2hvIE1BUktFUl8xMjMnLFxuXHRcdFx0J01BUktFUl8xMjMnLFxuXHRcdFx0J1tXMDA3RFY5UEY5LTE6fi92c3MvX3dvcmtdIGNsb3VkdGVzdCQnLFxuXHRcdF0uam9pbignXFxuJyk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoXG5cdFx0XHRzdHJpcENvbW1hbmRFY2hvQW5kUHJvbXB0KG91dHB1dCwgJ2VjaG8gTUFSS0VSXzEyMycpLFxuXHRcdFx0J01BUktFUl8xMjMnXG5cdFx0KTtcblx0fSk7XG5cblx0dGVzdCgnc3RyaXBzIHNhbmRib3gtd3JhcHBlZCBjb21tYW5kIGVjaG8gd2l0aCBlcnJvciBvdXRwdXQgYW5kIHRyYWlsaW5nIHByb21wdCcsICgpID0+IHtcblx0XHRjb25zdCBjb21tYW5kTGluZSA9ICdFTEVDVFJPTl9SVU5fQVNfTk9ERT0xIFBBVEg9XCIkUEFUSDovVXNlcnMvYWxleC9zcmMvdnNjb2RlNC9ub2RlX21vZHVsZXMvQHZzY29kZS9yaXBncmVwL2JpblwiIFRNUERJUj1cIi9Vc2Vycy9hbGV4Ly52c2NvZGUtb3NzLWRldi90bXBcIiBDTEFVREVfVE1QRElSPVwiL1VzZXJzL2FsZXgvLnZzY29kZS1vc3MtZGV2L3RtcFwiIFwiL1VzZXJzL2FsZXgvc3JjL3ZzY29kZTQvbm9kZV9tb2R1bGVzL0B2c2NvZGUvc2FuZGJveC1ydW50aW1lL2Rpc3QvY2xpLmpzXCIgLS1zZXR0aW5ncyBcIi9Vc2Vycy9hbGV4Ly52c2NvZGUtb3NzLWRldi90bXAvdnNjb2RlLXNhbmRib3gtc2V0dGluZ3MtY2Y1YjYyMzItODI1Yi00ZjRjLTg5MDItMzJhODU5MTAwN2ZkLmpzb25cIiAtYyBcXCcgZWNobyBcIlNBTkRCT1hfVE1QXzE3NzQxMjc0MDkwNzZcIiA+IC90bXAvU0FOREJPWF9UTVBfMTc3NDEyNzQwOTA3Ni50eHRcXCcnO1xuXHRcdGNvbnN0IG91dHB1dCA9IFtcblx0XHRcdCdFTEVDVFJPTl9SVU5fQVNfTk9ERT0xIFBBVEg9XCIkUEFUSDovVXNlcnMvYWxleC9zcmMvdnNjb2RlNC9ub2RlX21vZHVsZXMvQHZzY29kZS8nLFxuXHRcdFx0J3JpcGdyZXAvYmluXCIgVE1QRElSPVwiL1VzZXJzL2FsZXgvLnZzY29kZS1vc3MtZGV2L3RtcFwiIENMQVVERV9UTVBESVI9XCIvVXNlcnMvYWxleCcsXG5cdFx0XHQnLy52c2NvZGUtb3NzLWRldi90bXBcIiBcIi9Vc2Vycy9hbGV4L3NyYy92c2NvZGU0L25vZGVfbW9kdWxlcy9AdnNjb2RlL3NhbmRib3gtJyxcblx0XHRcdCdydW50aW1lL2Rpc3QvY2xpLmpzXCIgLS1zZXR0aW5ncyBcIi9Vc2Vycy9hbGV4Ly52c2NvZGUtb3NzLWRldi90bXAvdnNjb2RlLXNhbmRibycsXG5cdFx0XHQneC1zZXR0aW5ncy1jZjViNjIzMi04MjViLTRmNGMtODkwMi0zMmE4NTkxMDA3ZmQuanNvblwiIC1jIFxcJyBlY2hvIFwiU0FOREJPWF9UTVBfMTc3Jyxcblx0XHRcdCc0MTI3NDA5MDc2XCIgPiAvdG1wL1NBTkRCT1hfVE1QXzE3NzQxMjc0MDkwNzYudHh0XFwnJyxcblx0XHRcdCdbIGFsZXhAQWxleGFuZHJ1cy1NYWNCb29rLVBybzovVXNlcnMvYWxleC9zcmMvdnNjb2RlNC9leHRlbnNpb25zL3ZzY29kZS1hcGktdGVzdCcsXG5cdFx0XHQncy90ZXN0V29ya3NwYWNlIChhbGV4ZGltYS9maXgtMzAzNTMxLXNhbmRib3gtbm8tb3V0cHV0LWxlYWsqKikgXSAkIEVMRUNUUk9OX1JVTl8nLFxuXHRcdFx0J0FTX05PREU9MSBQQVRIPVwiJFBBVEg6L1VzZXJzL2FsZXgvc3JjL3ZzY29kZTQvbm9kZV9tb2R1bGVzL0B2c2NvZGUvcmlwZ3JlcC9iaW5cIiAnLFxuXHRcdFx0J1RNUERJUj1cIi9Vc2Vycy9hbGV4Ly52c2NvZGUtb3NzLWRldi90bXBcIiBDTEFVREVfVE1QRElSPVwiL1VzZXJzL2FsZXgvLnZzY29kZS1vc3MtJyxcblx0XHRcdCdkZXYvdG1wXCIgXCIvVXNlcnMvYWxleC9zcmMvdnNjb2RlNC9ub2RlX21vZHVsZXMvQHZzY29kZS9zYW5kYm94LXJ1bnRpbWUvZGlzJyxcblx0XHRcdCd0L2NsaS5qc1wiIC0tc2V0dGluZ3MgXCIvVXNlcnMvYWxleC8udnNjb2RlLW9zcy1kZXYvdG1wL3ZzY29kZS1zYW5kYm94LXNldHRpbmdzLWNmJyxcblx0XHRcdCc1YjYyMzItODI1Yi00ZjRjLTg5MDItMzJhODU5MTAwN2ZkLmpzb25cIiAtYyBcXCcgZWNobyBcIlNBTkRCT1hfVE1QXzE3NzQxMjc0MDkwNzZcIiA+Jyxcblx0XHRcdCcgL3RtcC9TQU5EQk9YX1RNUF8xNzc0MTI3NDA5MDc2LnR4dFxcJycsXG5cdFx0XS5qb2luKCdcXG4nKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChcblx0XHRcdHN0cmlwQ29tbWFuZEVjaG9BbmRQcm9tcHQob3V0cHV0LCBjb21tYW5kTGluZSksXG5cdFx0XHQnJ1xuXHRcdCk7XG5cdH0pO1xuXG5cdC8vIC0tLSBBZHZlcnNhcmlhbCB0ZXN0czogb3V0cHV0IHRoYXQgbG9va3MgbGlrZSBwcm9tcHRzIC0tLVxuXHQvLyBUaGVzZSB2ZXJpZnkgdGhhdCByZWFsaXN0aWMgb3V0cHV0IGlzIE5PVCBmYWxzZWx5IHN0cmlwcGVkLlxuXG5cdHN1aXRlKCdhZHZlcnNhcmlhbDogb3V0cHV0IHJlc2VtYmxpbmcgcHJvbXB0cycsICgpID0+IHtcblxuXHRcdHRlc3QoJ291dHB1dCBlbmRpbmcgd2l0aCAkIGlzIHByZXNlcnZlZCAobm90IGNvbmZ1c2VkIHdpdGggd3JhcHBlZCBwcm9tcHQpJywgKCkgPT4ge1xuXHRcdFx0Y29uc3Qgb3V0cHV0ID0gW1xuXHRcdFx0XHQndXNlckBob3N0On4gJCBlY2hvIFxcJ3Rlc3QkXFwnJyxcblx0XHRcdFx0J3Rlc3QkJyxcblx0XHRcdFx0J3VzZXJAaG9zdDp+ICQnLFxuXHRcdFx0XS5qb2luKCdcXG4nKTtcblxuXHRcdFx0Ly8gJ3VzZXJAaG9zdDp+ICQnIGlzIGEgY29tcGxldGUgcHJvbXB0IFx1MjE5MiBzdHJpcHBlZCBhbmQgbG9vcCBzdG9wcy5cblx0XHRcdC8vICd0ZXN0JCcgaXMgcHJlc2VydmVkIGJlY2F1c2Ugbm90aGluZyBhYm92ZSBhIGNvbXBsZXRlIHByb21wdCBpcyBzdHJpcHBlZC5cblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChcblx0XHRcdFx0c3RyaXBDb21tYW5kRWNob0FuZFByb21wdChvdXRwdXQsICdlY2hvIFxcJ3Rlc3QkXFwnJyksXG5cdFx0XHRcdCd0ZXN0JCdcblx0XHRcdCk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdvdXRwdXQgZW5kaW5nIHdpdGggIyBpcyBwcmVzZXJ2ZWQgKG5vdCBjb25mdXNlZCB3aXRoIHdyYXBwZWQgcHJvbXB0KScsICgpID0+IHtcblx0XHRcdGNvbnN0IG91dHB1dCA9IFtcblx0XHRcdFx0J3VzZXJAaG9zdDp+ICQgZWNobyBcXCdkaXYjXFwnJyxcblx0XHRcdFx0J2RpdiMnLFxuXHRcdFx0XHQndXNlckBob3N0On4gJCcsXG5cdFx0XHRdLmpvaW4oJ1xcbicpO1xuXG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoXG5cdFx0XHRcdHN0cmlwQ29tbWFuZEVjaG9BbmRQcm9tcHQob3V0cHV0LCAnZWNobyBcXCdkaXYjXFwnJyksXG5cdFx0XHRcdCdkaXYjJ1xuXHRcdFx0KTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2JyYWNrZXRlZCBsb2cgb3V0cHV0IFt0YWc6fi9wYXRoXSBpcyBwcmVzZXJ2ZWQnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBvdXRwdXQgPSBbXG5cdFx0XHRcdCd1c2VyQGhvc3Q6fiAkIG5vZGUgYnVpbGQuanMnLFxuXHRcdFx0XHQnW2J1aWxkOn4vZGlzdF0gY29tcGlsZWQgc3VjY2Vzc2Z1bGx5Jyxcblx0XHRcdFx0J3VzZXJAaG9zdDp+ICQnLFxuXHRcdFx0XS5qb2luKCdcXG4nKTtcblxuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKFxuXHRcdFx0XHRzdHJpcENvbW1hbmRFY2hvQW5kUHJvbXB0KG91dHB1dCwgJ25vZGUgYnVpbGQuanMnKSxcblx0XHRcdFx0J1tidWlsZDp+L2Rpc3RdIGNvbXBpbGVkIHN1Y2Nlc3NmdWxseSdcblx0XHRcdCk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdvdXRwdXQgY29udGFpbmluZyB1c2VyQGhvc3Q6cGF0aCBlbmRpbmcgd2l0aCAjIGlzIHByZXNlcnZlZCcsICgpID0+IHtcblx0XHRcdGNvbnN0IG91dHB1dCA9IFtcblx0XHRcdFx0J3VzZXJAaG9zdDp+ICQgY2F0IC9ldGMvbW90ZCcsXG5cdFx0XHRcdCdhZG1pbkBzZXJ2ZXI6fi9kb2NzICMnLFxuXHRcdFx0XHQndXNlckBob3N0On4gJCcsXG5cdFx0XHRdLmpvaW4oJ1xcbicpO1xuXG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoXG5cdFx0XHRcdHN0cmlwQ29tbWFuZEVjaG9BbmRQcm9tcHQob3V0cHV0LCAnY2F0IC9ldGMvbW90ZCcpLFxuXHRcdFx0XHQnYWRtaW5Ac2VydmVyOn4vZG9jcyAjJ1xuXHRcdFx0KTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ291dHB1dCBlbmRpbmcgd2l0aCBdICQgaXMgcHJlc2VydmVkJywgKCkgPT4ge1xuXHRcdFx0Y29uc3Qgb3V0cHV0ID0gW1xuXHRcdFx0XHQndXNlckBob3N0On4gJCBlY2hvIFxcJ3ZhbHVlczogW2EsIGJdICRcXCcnLFxuXHRcdFx0XHQndmFsdWVzOiBbYSwgYl0gJCcsXG5cdFx0XHRcdCd1c2VyQGhvc3Q6fiAkJyxcblx0XHRcdF0uam9pbignXFxuJyk7XG5cblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChcblx0XHRcdFx0c3RyaXBDb21tYW5kRWNob0FuZFByb21wdChvdXRwdXQsICdlY2hvIFxcJ3ZhbHVlczogW2EsIGJdICRcXCcnKSxcblx0XHRcdFx0J3ZhbHVlczogW2EsIGJdICQnXG5cdFx0XHQpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnbXVsdGlwbGUgcHJvbXB0LWxpa2Ugb3V0cHV0IGxpbmVzIGFyZSBhbGwgcHJlc2VydmVkJywgKCkgPT4ge1xuXHRcdFx0Ly8gQ29tcGxldGUgcHJvbXB0IGF0IHRoZSBib3R0b20gc3RvcHMgc3RyaXBwaW5nIGltbWVkaWF0ZWx5LFxuXHRcdFx0Ly8gc28gYWxsIHByb21wdC1saWtlIG91dHB1dCBsaW5lcyBhYm92ZSBhcmUgcHJlc2VydmVkLlxuXHRcdFx0Y29uc3Qgb3V0cHV0ID0gW1xuXHRcdFx0XHQndXNlckBob3N0On4gJCBjYXQgcHJvbXB0cy50eHQnLFxuXHRcdFx0XHQnYWRtaW5Ac2VydmVyOn4vZG9jcyAkJyxcblx0XHRcdFx0J3Jvb3RAYm94Oi92YXIvbG9nICMnLFxuXHRcdFx0XHQndGVzdEBkZXY6fiAkJyxcblx0XHRcdFx0J3VzZXJAaG9zdDp+ICQnLFxuXHRcdFx0XS5qb2luKCdcXG4nKTtcblxuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKFxuXHRcdFx0XHRzdHJpcENvbW1hbmRFY2hvQW5kUHJvbXB0KG91dHB1dCwgJ2NhdCBwcm9tcHRzLnR4dCcpLFxuXHRcdFx0XHQnYWRtaW5Ac2VydmVyOn4vZG9jcyAkXFxucm9vdEBib3g6L3Zhci9sb2cgI1xcbnRlc3RAZGV2On4gJCdcblx0XHRcdCk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdtdWx0aS1saW5lIG91dHB1dCB3aGVyZSBsYXN0IGxpbmUgaGFzICQgYWZ0ZXIgbm9uLXdvcmQgY2hhcnMgaXMgcHJlc2VydmVkJywgKCkgPT4ge1xuXHRcdFx0Y29uc3Qgb3V0cHV0ID0gW1xuXHRcdFx0XHQndXNlckBob3N0On4gJCAuL3JlcG9ydC5zaCcsXG5cdFx0XHRcdCdSZXZlbnVlOiAxMDAwJyxcblx0XHRcdFx0J0N1cnJlbmN5OiBVU0QkJyxcblx0XHRcdFx0J3VzZXJAaG9zdDp+ICQnLFxuXHRcdFx0XS5qb2luKCdcXG4nKTtcblxuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKFxuXHRcdFx0XHRzdHJpcENvbW1hbmRFY2hvQW5kUHJvbXB0KG91dHB1dCwgJy4vcmVwb3J0LnNoJyksXG5cdFx0XHRcdCdSZXZlbnVlOiAxMDAw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
