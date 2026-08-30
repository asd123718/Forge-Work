import { ok, strictEqual } from "assert";
import { extractNodeCommand, NodeCommandLinePresenter } from "../../browser/tools/commandLinePresenter/nodeCommandLinePresenter.js";
import { OperatingSystem } from "../../../../../../base/common/platform.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../../../base/test/common/utils.js";
suite("extractNodeCommand", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  suite("basic extraction", () => {
    test("should extract simple node -e command with double quotes", () => {
      const result = extractNodeCommand(`node -e "console.log('hello')"`, "bash", OperatingSystem.Linux);
      strictEqual(result, `console.log('hello')`);
    });
    test("should extract nodejs -e command", () => {
      const result = extractNodeCommand(`nodejs -e "console.log('hello')"`, "bash", OperatingSystem.Linux);
      strictEqual(result, `console.log('hello')`);
    });
    test("should extract node --eval command", () => {
      const result = extractNodeCommand(`node --eval "console.log('hello')"`, "bash", OperatingSystem.Linux);
      strictEqual(result, `console.log('hello')`);
    });
    test("should extract nodejs --eval command", () => {
      const result = extractNodeCommand(`nodejs --eval "console.log('hello')"`, "bash", OperatingSystem.Linux);
      strictEqual(result, `console.log('hello')`);
    });
    test("should return undefined for non-node commands", () => {
      const result = extractNodeCommand("echo hello", "bash", OperatingSystem.Linux);
      strictEqual(result, void 0);
    });
    test("should return undefined for node without -e flag", () => {
      const result = extractNodeCommand("node script.js", "bash", OperatingSystem.Linux);
      strictEqual(result, void 0);
    });
    test("should extract node -e with single quotes", () => {
      const result = extractNodeCommand(`node -e 'console.log("hello")'`, "bash", OperatingSystem.Linux);
      strictEqual(result, 'console.log("hello")');
    });
    test("should extract nodejs -e with single quotes", () => {
      const result = extractNodeCommand(`nodejs -e 'const x = 1; console.log(x)'`, "bash", OperatingSystem.Linux);
      strictEqual(result, "const x = 1; console.log(x)");
    });
    test("should extract node --eval with single quotes", () => {
      const result = extractNodeCommand(`node --eval 'console.log("hello")'`, "bash", OperatingSystem.Linux);
      strictEqual(result, 'console.log("hello")');
    });
  });
  suite("quote unescaping - Bash", () => {
    test("should unescape backslash-escaped quotes in bash", () => {
      const result = extractNodeCommand('node -e "console.log(\\"hello\\")"', "bash", OperatingSystem.Linux);
      strictEqual(result, 'console.log("hello")');
    });
    test("should handle multiple escaped quotes", () => {
      const result = extractNodeCommand('node -e "const x = \\"hello\\"; console.log(x)"', "bash", OperatingSystem.Linux);
      strictEqual(result, 'const x = "hello"; console.log(x)');
    });
  });
  suite("single quotes - literal content", () => {
    test("should preserve content literally in single quotes (no unescaping)", () => {
      const result = extractNodeCommand(`node -e 'console.log(\\"hello\\")'`, "bash", OperatingSystem.Linux);
      strictEqual(result, 'console.log(\\"hello\\")');
    });
    test("should handle single quotes in PowerShell", () => {
      const result = extractNodeCommand(`node -e 'console.log("hello")'`, "pwsh", OperatingSystem.Windows);
      strictEqual(result, 'console.log("hello")');
    });
    test("should extract multiline code in single quotes", () => {
      const code = `node -e 'for (let i = 0; i < 3; i++) {
    console.log(i);
}'`;
      const result = extractNodeCommand(code, "bash", OperatingSystem.Linux);
      strictEqual(result, `for (let i = 0; i < 3; i++) {
    console.log(i);
}`);
    });
  });
  suite("quote unescaping - PowerShell", () => {
    test("should unescape backtick-escaped quotes in PowerShell", () => {
      const result = extractNodeCommand('node -e "console.log(`"hello`")"', "pwsh", OperatingSystem.Windows);
      strictEqual(result, 'console.log("hello")');
    });
    test("should handle multiple backtick-escaped quotes", () => {
      const result = extractNodeCommand('node -e "const x = `"hello`"; console.log(x)"', "pwsh", OperatingSystem.Windows);
      strictEqual(result, 'const x = "hello"; console.log(x)');
    });
    test("should not unescape backslash quotes in PowerShell", () => {
      const result = extractNodeCommand('node -e "console.log(\\"hello\\")"', "pwsh", OperatingSystem.Windows);
      strictEqual(result, 'console.log(\\"hello\\")');
    });
  });
  suite("multiline code", () => {
    test("should extract multiline JavaScript code", () => {
      const code = `node -e "for (let i = 0; i < 3; i++) {
    console.log(i);
}"`;
      const result = extractNodeCommand(code, "bash", OperatingSystem.Linux);
      strictEqual(result, `for (let i = 0; i < 3; i++) {
    console.log(i);
}`);
    });
  });
  suite("edge cases", () => {
    test("should handle code with trailing whitespace trimmed", () => {
      const result = extractNodeCommand('node -e "  console.log(1)  "', "bash", OperatingSystem.Linux);
      strictEqual(result, "console.log(1)");
    });
    test("should return undefined for empty code", () => {
      const result = extractNodeCommand('node -e ""', "bash", OperatingSystem.Linux);
      strictEqual(result, void 0);
    });
    test("should return undefined when quotes are unmatched", () => {
      const result = extractNodeCommand('node -e "console.log(1)', "bash", OperatingSystem.Linux);
      strictEqual(result, void 0);
    });
  });
});
suite("NodeCommandLinePresenter", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  const presenter = new NodeCommandLinePresenter();
  test("should return JavaScript presentation for node -e command", () => {
    const result = presenter.present({
      commandLine: { forDisplay: `node -e "console.log('hello')"` },
      shell: "bash",
      os: OperatingSystem.Linux
    });
    ok(result);
    strictEqual(result.commandLine, `console.log('hello')`);
    strictEqual(result.language, "javascript");
    strictEqual(result.languageDisplayName, "Node.js");
  });
  test("should return JavaScript presentation for nodejs -e command", () => {
    const result = presenter.present({
      commandLine: { forDisplay: `nodejs -e 'const x = 1; console.log(x)'` },
      shell: "bash",
      os: OperatingSystem.Linux
    });
    ok(result);
    strictEqual(result.commandLine, "const x = 1; console.log(x)");
    strictEqual(result.language, "javascript");
    strictEqual(result.languageDisplayName, "Node.js");
  });
  test("should return JavaScript presentation for node --eval command", () => {
    const result = presenter.present({
      commandLine: { forDisplay: `node --eval "console.log('hello')"` },
      shell: "bash",
      os: OperatingSystem.Linux
    });
    ok(result);
    strictEqual(result.commandLine, `console.log('hello')`);
    strictEqual(result.language, "javascript");
    strictEqual(result.languageDisplayName, "Node.js");
  });
  test("should return undefined for non-node commands", () => {
    const result = presenter.present({
      commandLine: { forDisplay: "echo hello" },
      shell: "bash",
      os: OperatingSystem.Linux
    });
    strictEqual(result, void 0);
  });
  test("should return undefined for regular node script execution", () => {
    const result = presenter.present({
      commandLine: { forDisplay: "node script.js" },
      shell: "bash",
      os: OperatingSystem.Linux
    });
    strictEqual(result, void 0);
  });
  test("should handle PowerShell backtick escaping", () => {
    const result = presenter.present({
      commandLine: { forDisplay: 'node -e "console.log(`"hello`")"' },
      shell: "pwsh",
      os: OperatingSystem.Windows
    });
    ok(result);
    strictEqual(result.commandLine, 'console.log("hello")');
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXHRlcm1pbmFsQ29udHJpYlxcY2hhdEFnZW50VG9vbHNcXHRlc3RcXGJyb3dzZXJcXG5vZGVDb21tYW5kTGluZVByZXNlbnRlci50ZXN0LnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IHsgb2ssIHN0cmljdEVxdWFsIH0gZnJvbSAnYXNzZXJ0JztcbmltcG9ydCB7IGV4dHJhY3ROb2RlQ29tbWFuZCwgTm9kZUNvbW1hbmRMaW5lUHJlc2VudGVyIH0gZnJvbSAnLi4vLi4vYnJvd3Nlci90b29scy9jb21tYW5kTGluZVByZXNlbnRlci9ub2RlQ29tbWFuZExpbmVQcmVzZW50ZXIuanMnO1xuaW1wb3J0IHsgT3BlcmF0aW5nU3lzdGVtIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vcGxhdGZvcm0uanMnO1xuaW1wb3J0IHsgZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS90ZXN0L2NvbW1vbi91dGlscy5qcyc7XG5cbnN1aXRlKCdleHRyYWN0Tm9kZUNvbW1hbmQnLCAoKSA9PiB7XG5cdGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSgpO1xuXG5cdHN1aXRlKCdiYXNpYyBleHRyYWN0aW9uJywgKCkgPT4ge1xuXHRcdHRlc3QoJ3Nob3VsZCBleHRyYWN0IHNpbXBsZSBub2RlIC1lIGNvbW1hbmQgd2l0aCBkb3VibGUgcXVvdGVzJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgcmVzdWx0ID0gZXh0cmFjdE5vZGVDb21tYW5kKGBub2RlIC1lIFwiY29uc29sZS5sb2coJ2hlbGxvJylcImAsICdiYXNoJywgT3BlcmF0aW5nU3lzdGVtLkxpbnV4KTtcblx0XHRcdHN0cmljdEVxdWFsKHJlc3VsdCwgYGNvbnNvbGUubG9nKCdoZWxsbycpYCk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdzaG91bGQgZXh0cmFjdCBub2RlanMgLWUgY29tbWFuZCcsICgpID0+IHtcblx0XHRcdGNvbnN0IHJlc3VsdCA9IGV4dHJhY3ROb2RlQ29tbWFuZChgbm9kZWpzIC1lIFwiY29uc29sZS5sb2coJ2hlbGxvJylcImAsICdiYXNoJywgT3BlcmF0aW5nU3lzdGVtLkxpbnV4KTtcblx0XHRcdHN0cmljdEVxdWFsKHJlc3VsdCwgYGNvbnNvbGUubG9nKCdoZWxsbycpYCk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdzaG91bGQgZXh0cmFjdCBub2RlIC0tZXZhbCBjb21tYW5kJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgcmVzdWx0ID0gZXh0cmFjdE5vZGVDb21tYW5kKGBub2RlIC0tZXZhbCBcImNvbnNvbGUubG9nKCdoZWxsbycpXCJgLCAnYmFzaCcsIE9wZXJhdGluZ1N5c3RlbS5MaW51eCk7XG5cdFx0XHRzdHJpY3RFcXVhbChyZXN1bHQsIGBjb25zb2xlLmxvZygnaGVsbG8nKWApO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnc2hvdWxkIGV4dHJhY3Qgbm9kZWpzIC0tZXZhbCBjb21tYW5kJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgcmVzdWx0ID0gZXh0cmFjdE5vZGVDb21tYW5kKGBub2RlanMgLS1ldmFsIFwiY29uc29sZS5sb2coJ2hlbGxvJylcImAsICdiYXNoJywgT3BlcmF0aW5nU3lzdGVtLkxpbnV4KTtcblx0XHRcdHN0cmljdEVxdWFsKHJlc3VsdCwgYGNvbnNvbGUubG9nKCdoZWxsbycpYCk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdzaG91bGQgcmV0dXJuIHVuZGVmaW5lZCBmb3Igbm9uLW5vZGUgY29tbWFuZHMnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCByZXN1bHQgPSBleHRyYWN0Tm9kZUNvbW1hbmQoJ2VjaG8gaGVsbG8nLCAnYmFzaCcsIE9wZXJhdGluZ1N5c3RlbS5MaW51eCk7XG5cdFx0XHRzdHJpY3RFcXVhbChyZXN1bHQsIHVuZGVmaW5lZCk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdzaG91bGQgcmV0dXJuIHVuZGVmaW5lZCBmb3Igbm9kZSB3aXRob3V0IC1lIGZsYWcnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCByZXN1bHQgPSBleHRyYWN0Tm9kZUNvbW1hbmQoJ25vZGUgc2NyaXB0LmpzJywgJ2Jhc2gnLCBPcGVyYXRpbmdTeXN0ZW0uTGludXgpO1xuXHRcdFx0c3RyaWN0RXF1YWwocmVzdWx0LCB1bmRlZmluZWQpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnc2hvdWxkIGV4dHJhY3Qgbm9kZSAtZSB3aXRoIHNpbmdsZSBxdW90ZXMnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCByZXN1bHQgPSBleHRyYWN0Tm9kZUNvbW1hbmQoYG5vZGUgLWUgJ2NvbnNvbGUubG9nKFwiaGVsbG9cIiknYCwgJ2Jhc2gnLCBPcGVyYXRpbmdTeXN0ZW0uTGludXgpO1xuXHRcdFx0c3RyaWN0RXF1YWwocmVzdWx0LCAnY29uc29sZS5sb2coXCJoZWxsb1wiKScpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnc2hvdWxkIGV4dHJhY3Qgbm9kZWpzIC1lIHdpdGggc2luZ2xlIHF1b3RlcycsICgpID0+IHtcblx0XHRcdGNvbnN0IHJlc3VsdCA9IGV4dHJhY3ROb2RlQ29tbWFuZChgbm9kZWpzIC1lICdjb25zdCB4ID0gMTsgY29uc29sZS5sb2coeCknYCwgJ2Jhc2gnLCBPcGVyYXRpbmdTeXN0ZW0uTGludXgpO1xuXHRcdFx0c3RyaWN0RXF1YWwocmVzdWx0LCAnY29uc3QgeCA9IDE7IGNvbnNvbGUubG9nKHgpJyk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdzaG91bGQgZXh0cmFjdCBub2RlIC0tZXZhbCB3aXRoIHNpbmdsZSBxdW90ZXMnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCByZXN1bHQgPSBleHRyYWN0Tm9kZUNvbW1hbmQoYG5vZGUgLS1ldmFsICdjb25zb2xlLmxvZyhcImhlbGxvXCIpJ2AsICdiYXNoJywgT3BlcmF0aW5nU3lzdGVtLkxpbnV4KTtcblx0XHRcdHN0cmljdEVxdWFsKHJlc3VsdCwgJ2NvbnNvbGUubG9nKFwiaGVsbG9cIiknKTtcblx0XHR9KTtcblx0fSk7XG5cblx0c3VpdGUoJ3F1b3RlIHVuZXNjYXBpbmcgLSBCYXNoJywgKCkgPT4ge1xuXHRcdHRlc3QoJ3Nob3VsZCB1bmVzY2FwZSBiYWNrc2xhc2gtZXNjYXBlZCBxdW90ZXMgaW4gYmFzaCcsICgpID0+IHtcblx0XHRcdGNvbnN0IHJlc3VsdCA9IGV4dHJhY3ROb2RlQ29tbWFuZCgnbm9kZSAtZSBcImNvbnNvbGUubG9nKFxcXFxcImhlbGxvXFxcXFwiKVwiJywgJ2Jhc2gnLCBPcGVyYXRpbmdTeXN0ZW0uTGludXgpO1xuXHRcdFx0c3RyaWN0RXF1YWwocmVzdWx0LCAnY29uc29sZS5sb2coXCJoZWxsb1wiKScpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnc2hvdWxkIGhhbmRsZSBtdWx0aXBsZSBlc2NhcGVkIHF1b3RlcycsICgpID0+IHtcblx0XHRcdGNvbnN0IHJlc3VsdCA9IGV4dHJhY3ROb2RlQ29tbWFuZCgnbm9kZSAtZSBcImNvbnN0IHggPSBcXFxcXCJoZWxsb1xcXFxcIjsgY29uc29sZS5sb2coeClcIicsICdiYXNoJywgT3BlcmF0aW5nU3lzdGVtLkxpbnV4KTtcblx0XHRcdHN0cmljdEVxdWFsKHJlc3VsdCwgJ2NvbnN0IHggPSBcImhlbGxvXCI7IGNvbnNvbGUubG9nKHgpJyk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHN1aXRlKCdzaW5nbGUgcXVvdGVzIC0gbGl0ZXJhbCBjb250ZW50JywgKCkgPT4ge1xuXHRcdHRlc3QoJ3Nob3VsZCBwcmVzZXJ2ZSBjb250ZW50IGxpdGVyYWxseSBpbiBzaW5nbGUgcXVvdGVzIChubyB1bmVzY2FwaW5nKScsICgpID0+IHtcblx0XHRcdC8vIFNpbmdsZSBxdW90ZXMgaW4gYmFzaCBhcmUgbGl0ZXJhbCAtIGJhY2tzbGFzaGVzIGFyZSBub3QgZXNjYXBlIHNlcXVlbmNlc1xuXHRcdFx0Y29uc3QgcmVzdWx0ID0gZXh0cmFjdE5vZGVDb21tYW5kKGBub2RlIC1lICdjb25zb2xlLmxvZyhcXFxcXCJoZWxsb1xcXFxcIiknYCwgJ2Jhc2gnLCBPcGVyYXRpbmdTeXN0ZW0uTGludXgpO1xuXHRcdFx0c3RyaWN0RXF1YWwocmVzdWx0LCAnY29uc29sZS5sb2coXFxcXFwiaGVsbG9cXFxcXCIpJyk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdzaG91bGQgaGFuZGxlIHNpbmdsZSBxdW90ZXMgaW4gUG93ZXJTaGVsbCcsICgpID0+IHtcblx0XHRcdGNvbnN0IHJlc3VsdCA9IGV4dHJhY3ROb2RlQ29tbWFuZChgbm9kZSAtZSAnY29uc29sZS5sb2coXCJoZWxsb1wiKSdgLCAncHdzaCcsIE9wZXJhdGluZ1N5c3RlbS5XaW5kb3dzKTtcblx0XHRcdHN0cmljdEVxdWFsKHJlc3VsdCwgJ2NvbnNvbGUubG9nKFwiaGVsbG9cIiknKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3Nob3VsZCBleHRyYWN0IG11bHRpbGluZSBjb2RlIGluIHNpbmdsZSBxdW90ZXMnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBjb2RlID0gYG5vZGUgLWUgJ2ZvciAobGV0IGkgPSAwOyBpIDwgMzsgaSsrKSB7XFxuICAgIGNvbnNvbGUubG9nKGkpO1xcbn0nYDtcblx0XHRcdGNvbnN0IHJlc3VsdCA9IGV4dHJhY3ROb2RlQ29tbWFuZChjb2RlLCAnYmFzaCcsIE9wZXJhdGluZ1N5c3RlbS5MaW51eCk7XG5cdFx0XHRzdHJpY3RFcXVhbChyZXN1bHQsIGBmb3IgKGxldCBpID0gMDsgaSA8IDM7IGkrKykge1xcbiAgICBjb25zb2xlLmxvZyhpKTtcXG59YCk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHN1aXRlKCdxdW90ZSB1bmVzY2FwaW5nIC0gUG93ZXJTaGVsbCcsICgpID0+IHtcblx0XHR0ZXN0KCdzaG91bGQgdW5lc2NhcGUgYmFja3RpY2stZXNjYXBlZCBxdW90ZXMgaW4gUG93ZXJTaGVsbCcsICgpID0+IHtcblx0XHRcdGNvbnN0IHJlc3VsdCA9IGV4dHJhY3ROb2RlQ29tbWFuZCgnbm9kZSAtZSBcImNvbnNvbGUubG9nKGBcImhlbGxvYFwiKVwiJywgJ3B3c2gnLCBPcGVyYXRpbmdTeXN0ZW0uV2luZG93cyk7XG5cdFx0XHRzdHJpY3RFcXVhbChyZXN1bHQsICdjb25zb2xlLmxvZyhcImhlbGxvXCIpJyk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdzaG91bGQgaGFuZGxlIG11bHRpcGxlIGJhY2t0aWNrLWVzY2FwZWQgcXVvdGVzJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgcmVzdWx0ID0gZXh0cmFjdE5vZGVDb21tYW5kKCdub2RlIC1lIFwiY29uc3QgeCA9IGBcImhlbGxvYFwiOyBjb25zb2xlLmxvZyh4KVwiJywgJ3B3c2gnLCBPcGVyYXRpbmdTeXN0ZW0uV2luZG93cyk7XG5cdFx0XHRzdHJpY3RFcXVhbChyZXN1bHQsICdjb25zdCB4ID0gXCJoZWxsb1wiOyBjb25zb2xlLmxvZyh4KScpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnc2hvdWxkIG5vdCB1bmVzY2FwZSBiYWNrc2xhc2ggcXVvdGVzIGluIFBvd2VyU2hlbGwnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCByZXN1bHQgPSBleHRyYWN0Tm9kZUNvbW1hbmQoJ25vZGUgLWUgXCJjb25zb2xlLmxvZyhcXFxcXCJoZWxsb1xcXFxcIilcIicsICdwd3NoJywgT3BlcmF0aW5nU3lzdGVtLldpbmRvd3MpO1xuXHRcdFx0c3RyaWN0RXF1YWwocmVzdWx0LCAnY29uc29sZS5sb2coXFxcXFwiaGVsbG9cXFxcXCIpJyk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHN1aXRlKCdtdWx0aWxpbmUgY29kZScsICgpID0+IHtcblx0XHR0ZXN0KCdzaG91bGQgZXh0cmFjdCBtdWx0aWxpbmUgSmF2YVNjcmlwdCBjb2RlJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgY29kZSA9IGBub2RlIC1lIFwiZm9yIChsZXQgaSA9IDA7IGkgPCAzOyBpKyspIHtcXG4gICAgY29uc29sZS5sb2coaSk7XFxufVwiYDtcblx0XHRcdGNvbnN0IHJlc3VsdCA9IGV4dHJhY3ROb2RlQ29tbWFuZChjb2RlLCAnYmFzaCcsIE9wZXJhdGluZ1N5c3RlbS5MaW51eCk7XG5cdFx0XHRzdHJpY3RFcXVhbChyZXN1bHQsIGBmb3IgKGxldCBpID0gMDsgaSA8IDM7IGkrKykge1xcbiAgICBjb25zb2xlLmxvZyhpKTtcXG59YCk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHN1aXRlKCdlZGdlIGNhc2VzJywgKCkgPT4ge1xuXHRcdHRlc3QoJ3Nob3VsZCBoYW5kbGUgY29kZSB3aXRoIHRyYWlsaW5nIHdoaXRlc3BhY2UgdHJpbW1lZCcsICgpID0+IHtcblx0XHRcdGNvbnN0IHJlc3VsdCA9IGV4dHJhY3ROb2RlQ29tbWFuZCgnbm9kZSAtZSBcIiAgY29uc29sZS5sb2coMSkgIFwiJywgJ2Jhc2gnLCBPcGVyYXRpbmdTeXN0ZW0uTGludXgpO1xuXHRcdFx0c3RyaWN0RXF1YWwocmVzdWx0LCAnY29uc29sZS5sb2coMSknKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3Nob3VsZCByZXR1cm4gdW5kZWZpbmVkIGZvciBlbXB0eSBjb2RlJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgcmVzdWx0ID0gZXh0cmFjdE5vZGVDb21tYW5kKCdub2RlIC1lIFwiXCInLCAnYmFzaCcsIE9wZXJhdGluZ1N5c3RlbS5MaW51eCk7XG5cdFx0XHRzdHJpY3RFcXVhbChyZXN1bHQsIHVuZGVmaW5lZCk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdzaG91bGQgcmV0dXJuIHVuZGVmaW5lZCB3aGVuIHF1b3RlcyBhcmUgdW5tYXRjaGVkJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgcmVzdWx0ID0gZXh0cmFjdE5vZGVDb21tYW5kKCdub2RlIC1lIFwiY29uc29sZS5sb2coMSknLCAnYmFzaCcsIE9wZXJhdGluZ1N5c3RlbS5MaW51eCk7XG5cdFx0XHRzdHJpY3RFcXVhbChyZXN1bHQsIHVuZGVmaW5lZCk7XG5cdFx0fSk7XG5cdH0pO1xufSk7XG5cbnN1aXRlKCdOb2RlQ29tbWFuZExpbmVQcmVzZW50ZXInLCAoKSA9PiB7XG5cdGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSgpO1xuXG5cdGNvbnN0IHByZXNlbnRlciA9IG5ldyBOb2RlQ29tbWFuZExpbmVQcmVzZW50ZXIoKTtcblxuXHR0ZXN0KCdzaG91bGQgcmV0dXJuIEphdmFTY3JpcHQgcHJlc2VudGF0aW9uIGZvciBub2RlIC1lIGNvbW1hbmQnLCAoKSA9PiB7XG5cdFx0Y29uc3QgcmVzdWx0ID0gcHJlc2VudGVyLnByZXNlbnQoe1xuXHRcdFx0Y29tbWFuZExpbmU6IHsgZm9yRGlzcGxheTogYG5vZGUgLWUgXCJjb25zb2xlLmxvZygnaGVsbG8nKVwiYCB9LFxuXHRcdFx0c2hlbGw6ICdiYXNoJyxcblx0XHRcdG9zOiBPcGVyYXRpbmdTeXN0ZW0uTGludXhcblx0XHR9KTtcblx0XHRvayhyZXN1bHQpO1xuXHRcdHN0cmljdEVxdWFsKHJlc3VsdC5jb21tYW5kTGluZSwgYGNvbnNvbGUubG9nKCdoZWxsbycpYCk7XG5cdFx0c3RyaWN0RXF1YWwocmVzdWx0Lmxhbmd1YWdlLCAnamF2YXNjcmlwdCcpO1xuXHRcdHN0cmljdEVxdWFsKHJlc3VsdC5sYW5ndWFnZURpc3BsYXlOYW1lLCAnTm9kZS5qcycpO1xuXHR9KTtcblxuXHR0ZXN0KCdzaG91bGQgcmV0dXJuIEphdmFTY3JpcHQgcHJlc2VudGF0aW9uIGZvciBub2RlanMgLWUgY29tbWFuZCcsICgpID0+IHtcblx0XHRjb25zdCByZXN1bHQgPSBwcmVzZW50ZXIucHJlc2VudCh7XG5cdFx0XHRjb21tYW5kTGluZTogeyBmb3JEaXNwbGF5OiBgbm9kZWpzIC1lICdjb25zdCB4ID0gMTsgY29uc29sZS5sb2coeCknYCB9LFxuXHRcdFx0c2hlbGw6ICdiYXNoJyxcblx0XHRcdG9zOiBPcGVyYXRpbmdTeXN0ZW0uTGludXhcblx0XHR9KTtcblx0XHRvayhyZXN1bHQpO1xuXHRcdHN0cmljdEVxdWFsKHJlc3VsdC5jb21tYW5kTGluZSwgJ2NvbnN0IHggPSAxOyBjb25zb2xlLmxvZyh4KScpO1xuXHRcdHN0cmljdEVxdWFsKHJlc3VsdC5sYW5ndWFnZSwgJ2phdmFzY3JpcHQnKTtcblx0XHRzdHJpY3RFcXVhbChyZXN1bHQubGFuZ3VhZ2VEaXNwbGF5TmFtZSwgJ05vZGUuanMnKTtcblx0fSk7XG5cblx0dGVzdCgnc2hvdWxkIHJldHVybiBKYXZhU2NyaXB0IHByZXNlbnRhdGlvbiBmb3Igbm9kZSAtLWV2YWwgY29tbWFuZCcsICgpID0+IHtcblx0XHRjb25zdCByZXN1bHQgPSBwcmVzZW50ZXIucHJlc2VudCh7XG5cdFx0XHRjb21tYW5kTGluZTogeyBmb3JEaXNwbGF5OiBgbm9kZSAtLWV2YWwgXCJjb25zb2xlLmxvZygnaGVsbG8nKVwiYCB9LFxuXHRcdFx0c2hlbGw6ICdiYXNoJyxcblx0XHRcdG9zOiBPcGVyYXRpbmdTeXN0ZW0uTGludXhcblx0XHR9KTtcblx0XHRvayhyZXN1bHQpO1xuXHRcdHN0cmljdEVxdWFsKHJlc3VsdC5jb21tYW5kTGluZSwgYGNvbnNvbGUubG9nKCdoZWxsbycpYCk7XG5cdFx0c3RyaWN0RXF1YWwocmVzdWx0Lmxhbmd1YWdlLCAnamF2YXNjcmlwdCcpO1xuXHRcdHN0cmljdEVxdWFsKHJlc3VsdC5sYW5ndWFnZURpc3BsYXlOYW1lLCAnTm9kZS5qcycpO1xuXHR9KTtcblxuXHR0ZXN0KCdzaG91bGQgcmV0dXJuIHVuZGVmaW5lZCBmb3Igbm9uLW5vZGUgY29tbWFuZHMnLCAoKSA9PiB7XG5cdFx0Y29uc3QgcmVzdWx0ID0gcHJlc2VudGVyLnByZXNlbnQoe1xuXHRcdFx0Y29tbWFuZExpbmU6IHsgZm9yRGlzcGxheTogJ2VjaG8gaGVsbG8nIH0sXG5cdFx0XHRzaGVsbDogJ2Jhc2gnLFxuXHRcdFx0b3M6IE9wZXJhdGluZ1N5c3RlbS5MaW51eFxuXHRcdH0pO1xuXHRcdHN0cmljdEVxdWFsKHJlc3VsdCwgdW5kZWZpbmVkKTtcblx0fSk7XG5cblx0dGVzdCgnc2hvdWxkIHJldHVybiB1bmRlZmluZWQgZm9yIHJlZ3VsYXIgbm9kZSBzY3JpcHQgZXhlY3V0aW9uJywgKCkgPT4ge1xuXHRcdGNvbnN0IHJlc3VsdCA9IHByZXNlbnRlci5wcmVzZW50KHtcblx0XHRcdGNvbW1hbmRMaW5lOiB7IGZvckRpc3BsYXk6ICdub2RlIHNjcmlwdC5qcycgfSxcblx0XHRcdHNoZWxsOiAnYmFzaCcsXG5cdFx0XHRvczogT3BlcmF0aW5nU3lzdGVtLkxpbnV4XG5cdFx0fSk7XG5cdFx0c3RyaWN0RXF1YWwocmVzdWx0LCB1bmRlZmluZWQpO1xuXHR9KTtcblxuXHR0ZXN0KCdzaG91bGQgaGFuZGxlIFBvd2VyU2hlbGwgYmFja3RpY2sgZXNjYXBpbmcnLCAoKSA9PiB7XG5cdFx0Y29uc3QgcmVzdWx0ID0gcHJlc2VudGVyLnByZXNlbnQoe1xuXHRcdFx0Y29tbWFuZExpbmU6IHsgZm9yRGlzcGxheTogJ25vZGUgLWUgXCJjb25zb2xlLmxvZyhgXCJoZWxsb2BcIilcIicgfSxcblx0XHRcdHNoZWxsOiAncHdzaCcsXG5cdFx0XHRvczogT3BlcmF0aW5nU3lzdGVtLldpbmRvd3Ncblx0XHR9KTtcblx0XHRvayhyZXN1bHQpO1xuXHRcdHN0cmljdEVxdWFsKHJlc3VsdC5jb21tYW5kTGluZSwgJ2NvbnNv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
