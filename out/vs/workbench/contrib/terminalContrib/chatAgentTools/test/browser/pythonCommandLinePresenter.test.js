import { ok, strictEqual } from "assert";
import { extractPythonCommand, PythonCommandLinePresenter } from "../../browser/tools/commandLinePresenter/pythonCommandLinePresenter.js";
import { OperatingSystem } from "../../../../../../base/common/platform.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../../../base/test/common/utils.js";
suite("extractPythonCommand", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  suite("basic extraction", () => {
    test("should extract simple python -c command with double quotes", () => {
      const result = extractPythonCommand(`python -c "print('hello')"`, "bash", OperatingSystem.Linux);
      strictEqual(result, `print('hello')`);
    });
    test("should extract python3 -c command", () => {
      const result = extractPythonCommand(`python3 -c "print('hello')"`, "bash", OperatingSystem.Linux);
      strictEqual(result, `print('hello')`);
    });
    test("should return undefined for non-python commands", () => {
      const result = extractPythonCommand("echo hello", "bash", OperatingSystem.Linux);
      strictEqual(result, void 0);
    });
    test("should return undefined for python without -c flag", () => {
      const result = extractPythonCommand("python script.py", "bash", OperatingSystem.Linux);
      strictEqual(result, void 0);
    });
    test("should extract python -c with single quotes", () => {
      const result = extractPythonCommand(`python -c 'print("hello")'`, "bash", OperatingSystem.Linux);
      strictEqual(result, 'print("hello")');
    });
    test("should extract python3 -c with single quotes", () => {
      const result = extractPythonCommand(`python3 -c 'x = 1; print(x)'`, "bash", OperatingSystem.Linux);
      strictEqual(result, "x = 1; print(x)");
    });
  });
  suite("quote unescaping - Bash", () => {
    test("should unescape backslash-escaped quotes in bash", () => {
      const result = extractPythonCommand('python -c "print(\\"hello\\")"', "bash", OperatingSystem.Linux);
      strictEqual(result, 'print("hello")');
    });
    test("should handle multiple escaped quotes", () => {
      const result = extractPythonCommand('python -c "x = \\"hello\\"; print(x)"', "bash", OperatingSystem.Linux);
      strictEqual(result, 'x = "hello"; print(x)');
    });
  });
  suite("single quotes - literal content", () => {
    test("should preserve content literally in single quotes (no unescaping)", () => {
      const result = extractPythonCommand(`python -c 'print(\\"hello\\")'`, "bash", OperatingSystem.Linux);
      strictEqual(result, 'print(\\"hello\\")');
    });
    test("should handle single quotes in PowerShell", () => {
      const result = extractPythonCommand(`python -c 'print("hello")'`, "pwsh", OperatingSystem.Windows);
      strictEqual(result, 'print("hello")');
    });
    test("should extract multiline code in single quotes", () => {
      const code = `python -c 'for i in range(3):
    print(i)'`;
      const result = extractPythonCommand(code, "bash", OperatingSystem.Linux);
      strictEqual(result, `for i in range(3):
    print(i)`);
    });
  });
  suite("quote unescaping - PowerShell", () => {
    test("should unescape backtick-escaped quotes in PowerShell", () => {
      const result = extractPythonCommand('python -c "print(`"hello`")"', "pwsh", OperatingSystem.Windows);
      strictEqual(result, 'print("hello")');
    });
    test("should handle multiple backtick-escaped quotes", () => {
      const result = extractPythonCommand('python -c "x = `"hello`"; print(x)"', "pwsh", OperatingSystem.Windows);
      strictEqual(result, 'x = "hello"; print(x)');
    });
    test("should not unescape backslash quotes in PowerShell", () => {
      const result = extractPythonCommand('python -c "print(\\"hello\\")"', "pwsh", OperatingSystem.Windows);
      strictEqual(result, 'print(\\"hello\\")');
    });
  });
  suite("multiline code", () => {
    test("should extract multiline python code", () => {
      const code = `python -c "for i in range(3):
    print(i)"`;
      const result = extractPythonCommand(code, "bash", OperatingSystem.Linux);
      strictEqual(result, `for i in range(3):
    print(i)`);
    });
  });
  suite("edge cases", () => {
    test("should handle code with trailing whitespace trimmed", () => {
      const result = extractPythonCommand('python -c "  print(1)  "', "bash", OperatingSystem.Linux);
      strictEqual(result, "print(1)");
    });
    test("should return undefined for empty code", () => {
      const result = extractPythonCommand('python -c ""', "bash", OperatingSystem.Linux);
      strictEqual(result, void 0);
    });
    test("should return undefined when quotes are unmatched", () => {
      const result = extractPythonCommand('python -c "print(1)', "bash", OperatingSystem.Linux);
      strictEqual(result, void 0);
    });
  });
});
suite("PythonCommandLinePresenter", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  const presenter = new PythonCommandLinePresenter();
  test("should return Python presentation for python -c command", () => {
    const result = presenter.present({
      commandLine: { forDisplay: `python -c "print('hello')"` },
      shell: "bash",
      os: OperatingSystem.Linux
    });
    ok(result);
    strictEqual(result.commandLine, `print('hello')`);
    strictEqual(result.language, "python");
    strictEqual(result.languageDisplayName, "Python");
  });
  test("should return Python presentation for python3 -c command", () => {
    const result = presenter.present({
      commandLine: { forDisplay: `python3 -c 'x = 1; print(x)'` },
      shell: "bash",
      os: OperatingSystem.Linux
    });
    ok(result);
    strictEqual(result.commandLine, "x = 1; print(x)");
    strictEqual(result.language, "python");
    strictEqual(result.languageDisplayName, "Python");
  });
  test("should return undefined for non-python commands", () => {
    const result = presenter.present({
      commandLine: { forDisplay: "echo hello" },
      shell: "bash",
      os: OperatingSystem.Linux
    });
    strictEqual(result, void 0);
  });
  test("should return undefined for regular python script execution", () => {
    const result = presenter.present({
      commandLine: { forDisplay: "python script.py" },
      shell: "bash",
      os: OperatingSystem.Linux
    });
    strictEqual(result, void 0);
  });
  test("should handle PowerShell backtick escaping", () => {
    const result = presenter.present({
      commandLine: { forDisplay: 'python -c "print(`"hello`")"' },
      shell: "pwsh",
      os: OperatingSystem.Windows
    });
    ok(result);
    strictEqual(result.commandLine, 'print("hello")');
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXHRlcm1pbmFsQ29udHJpYlxcY2hhdEFnZW50VG9vbHNcXHRlc3RcXGJyb3dzZXJcXHB5dGhvbkNvbW1hbmRMaW5lUHJlc2VudGVyLnRlc3QudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgeyBvaywgc3RyaWN0RXF1YWwgfSBmcm9tICdhc3NlcnQnO1xuaW1wb3J0IHsgZXh0cmFjdFB5dGhvbkNvbW1hbmQsIFB5dGhvbkNvbW1hbmRMaW5lUHJlc2VudGVyIH0gZnJvbSAnLi4vLi4vYnJvd3Nlci90b29scy9jb21tYW5kTGluZVByZXNlbnRlci9weXRob25Db21tYW5kTGluZVByZXNlbnRlci5qcyc7XG5pbXBvcnQgeyBPcGVyYXRpbmdTeXN0ZW0gfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9wbGF0Zm9ybS5qcyc7XG5pbXBvcnQgeyBlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL3Rlc3QvY29tbW9uL3V0aWxzLmpzJztcblxuc3VpdGUoJ2V4dHJhY3RQeXRob25Db21tYW5kJywgKCkgPT4ge1xuXHRlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUoKTtcblxuXHRzdWl0ZSgnYmFzaWMgZXh0cmFjdGlvbicsICgpID0+IHtcblx0XHR0ZXN0KCdzaG91bGQgZXh0cmFjdCBzaW1wbGUgcHl0aG9uIC1jIGNvbW1hbmQgd2l0aCBkb3VibGUgcXVvdGVzJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgcmVzdWx0ID0gZXh0cmFjdFB5dGhvbkNvbW1hbmQoJ3B5dGhvbiAtYyBcInByaW50KFxcJ2hlbGxvXFwnKVwiJywgJ2Jhc2gnLCBPcGVyYXRpbmdTeXN0ZW0uTGludXgpO1xuXHRcdFx0c3RyaWN0RXF1YWwocmVzdWx0LCBgcHJpbnQoJ2hlbGxvJylgKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3Nob3VsZCBleHRyYWN0IHB5dGhvbjMgLWMgY29tbWFuZCcsICgpID0+IHtcblx0XHRcdGNvbnN0IHJlc3VsdCA9IGV4dHJhY3RQeXRob25Db21tYW5kKCdweXRob24zIC1jIFwicHJpbnQoXFwnaGVsbG9cXCcpXCInLCAnYmFzaCcsIE9wZXJhdGluZ1N5c3RlbS5MaW51eCk7XG5cdFx0XHRzdHJpY3RFcXVhbChyZXN1bHQsIGBwcmludCgnaGVsbG8nKWApO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnc2hvdWxkIHJldHVybiB1bmRlZmluZWQgZm9yIG5vbi1weXRob24gY29tbWFuZHMnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCByZXN1bHQgPSBleHRyYWN0UHl0aG9uQ29tbWFuZCgnZWNobyBoZWxsbycsICdiYXNoJywgT3BlcmF0aW5nU3lzdGVtLkxpbnV4KTtcblx0XHRcdHN0cmljdEVxdWFsKHJlc3VsdCwgdW5kZWZpbmVkKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3Nob3VsZCByZXR1cm4gdW5kZWZpbmVkIGZvciBweXRob24gd2l0aG91dCAtYyBmbGFnJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgcmVzdWx0ID0gZXh0cmFjdFB5dGhvbkNvbW1hbmQoJ3B5dGhvbiBzY3JpcHQucHknLCAnYmFzaCcsIE9wZXJhdGluZ1N5c3RlbS5MaW51eCk7XG5cdFx0XHRzdHJpY3RFcXVhbChyZXN1bHQsIHVuZGVmaW5lZCk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdzaG91bGQgZXh0cmFjdCBweXRob24gLWMgd2l0aCBzaW5nbGUgcXVvdGVzJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgcmVzdWx0ID0gZXh0cmFjdFB5dGhvbkNvbW1hbmQoYHB5dGhvbiAtYyAncHJpbnQoXCJoZWxsb1wiKSdgLCAnYmFzaCcsIE9wZXJhdGluZ1N5c3RlbS5MaW51eCk7XG5cdFx0XHRzdHJpY3RFcXVhbChyZXN1bHQsICdwcmludChcImhlbGxvXCIpJyk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdzaG91bGQgZXh0cmFjdCBweXRob24zIC1jIHdpdGggc2luZ2xlIHF1b3RlcycsICgpID0+IHtcblx0XHRcdGNvbnN0IHJlc3VsdCA9IGV4dHJhY3RQeXRob25Db21tYW5kKGBweXRob24zIC1jICd4ID0gMTsgcHJpbnQoeCknYCwgJ2Jhc2gnLCBPcGVyYXRpbmdTeXN0ZW0uTGludXgpO1xuXHRcdFx0c3RyaWN0RXF1YWwocmVzdWx0LCAneCA9IDE7IHByaW50KHgpJyk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHN1aXRlKCdxdW90ZSB1bmVzY2FwaW5nIC0gQmFzaCcsICgpID0+IHtcblx0XHR0ZXN0KCdzaG91bGQgdW5lc2NhcGUgYmFja3NsYXNoLWVzY2FwZWQgcXVvdGVzIGluIGJhc2gnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCByZXN1bHQgPSBleHRyYWN0UHl0aG9uQ29tbWFuZCgncHl0aG9uIC1jIFwicHJpbnQoXFxcXFwiaGVsbG9cXFxcXCIpXCInLCAnYmFzaCcsIE9wZXJhdGluZ1N5c3RlbS5MaW51eCk7XG5cdFx0XHRzdHJpY3RFcXVhbChyZXN1bHQsICdwcmludChcImhlbGxvXCIpJyk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdzaG91bGQgaGFuZGxlIG11bHRpcGxlIGVzY2FwZWQgcXVvdGVzJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgcmVzdWx0ID0gZXh0cmFjdFB5dGhvbkNvbW1hbmQoJ3B5dGhvbiAtYyBcInggPSBcXFxcXFxcImhlbGxvXFxcXFxcXCI7IHByaW50KHgpXCInLCAnYmFzaCcsIE9wZXJhdGluZ1N5c3RlbS5MaW51eCk7XG5cdFx0XHRzdHJpY3RFcXVhbChyZXN1bHQsICd4ID0gXCJoZWxsb1wiOyBwcmludCh4KScpO1xuXHRcdH0pO1xuXHR9KTtcblxuXHRzdWl0ZSgnc2luZ2xlIHF1b3RlcyAtIGxpdGVyYWwgY29udGVudCcsICgpID0+IHtcblx0XHR0ZXN0KCdzaG91bGQgcHJlc2VydmUgY29udGVudCBsaXRlcmFsbHkgaW4gc2luZ2xlIHF1b3RlcyAobm8gdW5lc2NhcGluZyknLCAoKSA9PiB7XG5cdFx0XHQvLyBTaW5nbGUgcXVvdGVzIGluIGJhc2ggYXJlIGxpdGVyYWwgLSBiYWNrc2xhc2hlcyBhcmUgbm90IGVzY2FwZSBzZXF1ZW5jZXNcblx0XHRcdGNvbnN0IHJlc3VsdCA9IGV4dHJhY3RQeXRob25Db21tYW5kKGBweXRob24gLWMgJ3ByaW50KFxcXFxcImhlbGxvXFxcXFwiKSdgLCAnYmFzaCcsIE9wZXJhdGluZ1N5c3RlbS5MaW51eCk7XG5cdFx0XHRzdHJpY3RFcXVhbChyZXN1bHQsICdwcmludChcXFxcXCJoZWxsb1xcXFxcIiknKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3Nob3VsZCBoYW5kbGUgc2luZ2xlIHF1b3RlcyBpbiBQb3dlclNoZWxsJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgcmVzdWx0ID0gZXh0cmFjdFB5dGhvbkNvbW1hbmQoYHB5dGhvbiAtYyAncHJpbnQoXCJoZWxsb1wiKSdgLCAncHdzaCcsIE9wZXJhdGluZ1N5c3RlbS5XaW5kb3dzKTtcblx0XHRcdHN0cmljdEVxdWFsKHJlc3VsdCwgJ3ByaW50KFwiaGVsbG9cIiknKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3Nob3VsZCBleHRyYWN0IG11bHRpbGluZSBjb2RlIGluIHNpbmdsZSBxdW90ZXMnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBjb2RlID0gYHB5dGhvbiAtYyAnZm9yIGkgaW4gcmFuZ2UoMyk6XFxuICAgIHByaW50KGkpJ2A7XG5cdFx0XHRjb25zdCByZXN1bHQgPSBleHRyYWN0UHl0aG9uQ29tbWFuZChjb2RlLCAnYmFzaCcsIE9wZXJhdGluZ1N5c3RlbS5MaW51eCk7XG5cdFx0XHRzdHJpY3RFcXVhbChyZXN1bHQsIGBmb3IgaSBpbiByYW5nZSgzKTpcXG4gICAgcHJpbnQoaSlgKTtcblx0XHR9KTtcblx0fSk7XG5cblx0c3VpdGUoJ3F1b3RlIHVuZXNjYXBpbmcgLSBQb3dlclNoZWxsJywgKCkgPT4ge1xuXHRcdHRlc3QoJ3Nob3VsZCB1bmVzY2FwZSBiYWNrdGljay1lc2NhcGVkIHF1b3RlcyBpbiBQb3dlclNoZWxsJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgcmVzdWx0ID0gZXh0cmFjdFB5dGhvbkNvbW1hbmQoJ3B5dGhvbiAtYyBcInByaW50KGBcImhlbGxvYFwiKVwiJywgJ3B3c2gnLCBPcGVyYXRpbmdTeXN0ZW0uV2luZG93cyk7XG5cdFx0XHRzdHJpY3RFcXVhbChyZXN1bHQsICdwcmludChcImhlbGxvXCIpJyk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdzaG91bGQgaGFuZGxlIG11bHRpcGxlIGJhY2t0aWNrLWVzY2FwZWQgcXVvdGVzJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgcmVzdWx0ID0gZXh0cmFjdFB5dGhvbkNvbW1hbmQoJ3B5dGhvbiAtYyBcInggPSBgXCJoZWxsb2BcIjsgcHJpbnQoeClcIicsICdwd3NoJywgT3BlcmF0aW5nU3lzdGVtLldpbmRvd3MpO1xuXHRcdFx0c3RyaWN0RXF1YWwocmVzdWx0LCAneCA9IFwiaGVsbG9cIjsgcHJpbnQoeCknKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3Nob3VsZCBub3QgdW5lc2NhcGUgYmFja3NsYXNoIHF1b3RlcyBpbiBQb3dlclNoZWxsJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgcmVzdWx0ID0gZXh0cmFjdFB5dGhvbkNvbW1hbmQoJ3B5dGhvbiAtYyBcInByaW50KFxcXFxcImhlbGxvXFxcXFwiKVwiJywgJ3B3c2gnLCBPcGVyYXRpbmdTeXN0ZW0uV2luZG93cyk7XG5cdFx0XHRzdHJpY3RFcXVhbChyZXN1bHQsICdwcmludChcXFxcXCJoZWxsb1xcXFxcIiknKTtcblx0XHR9KTtcblx0fSk7XG5cblx0c3VpdGUoJ211bHRpbGluZSBjb2RlJywgKCkgPT4ge1xuXHRcdHRlc3QoJ3Nob3VsZCBleHRyYWN0IG11bHRpbGluZSBweXRob24gY29kZScsICgpID0+IHtcblx0XHRcdGNvbnN0IGNvZGUgPSBgcHl0aG9uIC1jIFwiZm9yIGkgaW4gcmFuZ2UoMyk6XFxuICAgIHByaW50KGkpXCJgO1xuXHRcdFx0Y29uc3QgcmVzdWx0ID0gZXh0cmFjdFB5dGhvbkNvbW1hbmQoY29kZSwgJ2Jhc2gnLCBPcGVyYXRpbmdTeXN0ZW0uTGludXgpO1xuXHRcdFx0c3RyaWN0RXF1YWwocmVzdWx0LCBgZm9yIGkgaW4gcmFuZ2UoMyk6XFxuICAgIHByaW50KGkpYCk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHN1aXRlKCdlZGdlIGNhc2VzJywgKCkgPT4ge1xuXHRcdHRlc3QoJ3Nob3VsZCBoYW5kbGUgY29kZSB3aXRoIHRyYWlsaW5nIHdoaXRlc3BhY2UgdHJpbW1lZCcsICgpID0+IHtcblx0XHRcdGNvbnN0IHJlc3VsdCA9IGV4dHJhY3RQeXRob25Db21tYW5kKCdweXRob24gLWMgXCIgIHByaW50KDEpICBcIicsICdiYXNoJywgT3BlcmF0aW5nU3lzdGVtLkxpbnV4KTtcblx0XHRcdHN0cmljdEVxdWFsKHJlc3VsdCwgJ3ByaW50KDEpJyk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdzaG91bGQgcmV0dXJuIHVuZGVmaW5lZCBmb3IgZW1wdHkgY29kZScsICgpID0+IHtcblx0XHRcdGNvbnN0IHJlc3VsdCA9IGV4dHJhY3RQeXRob25Db21tYW5kKCdweXRob24gLWMgXCJcIicsICdiYXNoJywgT3BlcmF0aW5nU3lzdGVtLkxpbnV4KTtcblx0XHRcdHN0cmljdEVxdWFsKHJlc3VsdCwgdW5kZWZpbmVkKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3Nob3VsZCByZXR1cm4gdW5kZWZpbmVkIHdoZW4gcXVvdGVzIGFyZSB1bm1hdGNoZWQnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCByZXN1bHQgPSBleHRyYWN0UHl0aG9uQ29tbWFuZCgncHl0aG9uIC1jIFwicHJpbnQoMSknLCAnYmFzaCcsIE9wZXJhdGluZ1N5c3RlbS5MaW51eCk7XG5cdFx0XHRzdHJpY3RFcXVhbChyZXN1bHQsIHVuZGVmaW5lZCk7XG5cdFx0fSk7XG5cdH0pO1xufSk7XG5cbnN1aXRlKCdQeXRob25Db21tYW5kTGluZVByZXNlbnRlcicsICgpID0+IHtcblx0ZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlKCk7XG5cblx0Y29uc3QgcHJlc2VudGVyID0gbmV3IFB5dGhvbkNvbW1hbmRMaW5lUHJlc2VudGVyKCk7XG5cblx0dGVzdCgnc2hvdWxkIHJldHVybiBQeXRob24gcHJlc2VudGF0aW9uIGZvciBweXRob24gLWMgY29tbWFuZCcsICgpID0+IHtcblx0XHRjb25zdCByZXN1bHQgPSBwcmVzZW50ZXIucHJlc2VudCh7XG5cdFx0XHRjb21tYW5kTGluZTogeyBmb3JEaXNwbGF5OiBgcHl0aG9uIC1jIFwicHJpbnQoJ2hlbGxvJylcImAgfSxcblx0XHRcdHNoZWxsOiAnYmFzaCcsXG5cdFx0XHRvczogT3BlcmF0aW5nU3lzdGVtLkxpbnV4XG5cdFx0fSk7XG5cdFx0b2socmVzdWx0KTtcblx0XHRzdHJpY3RFcXVhbChyZXN1bHQuY29tbWFuZExpbmUsIGBwcmludCgnaGVsbG8nKWApO1xuXHRcdHN0cmljdEVxdWFsKHJlc3VsdC5sYW5ndWFnZSwgJ3B5dGhvbicpO1xuXHRcdHN0cmljdEVxdWFsKHJlc3VsdC5sYW5ndWFnZURpc3BsYXlOYW1lLCAnUHl0aG9uJyk7XG5cdH0pO1xuXG5cdHRlc3QoJ3Nob3VsZCByZXR1cm4gUHl0aG9uIHByZXNlbnRhdGlvbiBmb3IgcHl0aG9uMyAtYyBjb21tYW5kJywgKCkgPT4ge1xuXHRcdGNvbnN0IHJlc3VsdCA9IHByZXNlbnRlci5wcmVzZW50KHtcblx0XHRcdGNvbW1hbmRMaW5lOiB7IGZvckRpc3BsYXk6IGBweXRob24zIC1jICd4ID0gMTsgcHJpbnQoeCknYCB9LFxuXHRcdFx0c2hlbGw6ICdiYXNoJyxcblx0XHRcdG9zOiBPcGVyYXRpbmdTeXN0ZW0uTGludXhcblx0XHR9KTtcblx0XHRvayhyZXN1bHQpO1xuXHRcdHN0cmljdEVxdWFsKHJlc3VsdC5jb21tYW5kTGluZSwgJ3ggPSAxOyBwcmludCh4KScpO1xuXHRcdHN0cmljdEVxdWFsKHJlc3VsdC5sYW5ndWFnZSwgJ3B5dGhvbicpO1xuXHRcdHN0cmljdEVxdWFsKHJlc3VsdC5sYW5ndWFnZURpc3BsYXlOYW1lLCAnUHl0aG9uJyk7XG5cdH0pO1xuXG5cdHRlc3QoJ3Nob3VsZCByZXR1cm4gdW5kZWZpbmVkIGZvciBub24tcHl0aG9uIGNvbW1hbmRzJywgKCkgPT4ge1xuXHRcdGNvbnN0IHJlc3VsdCA9IHByZXNlbnRlci5wcmVzZW50KHtcblx0XHRcdGNvbW1hbmRMaW5lOiB7IGZvckRpc3BsYXk6ICdlY2hvIGhlbGxvJyB9LFxuXHRcdFx0c2hlbGw6ICdiYXNoJyxcblx0XHRcdG9zOiBPcGVyYXRpbmdTeXN0ZW0uTGludXhcblx0XHR9KTtcblx0XHRzdHJpY3RFcXVhbChyZXN1bHQsIHVuZGVmaW5lZCk7XG5cdH0pO1xuXG5cdHRlc3QoJ3Nob3VsZCByZXR1cm4gdW5kZWZpbmVkIGZvciByZWd1bGFyIHB5dGhvbiBzY3JpcHQgZXhlY3V0aW9uJywgKCkgPT4ge1xuXHRcdGNvbnN0IHJlc3VsdCA9IHByZXNlbnRlci5wcmVzZW50KHtcblx0XHRcdGNvbW1hbmRMaW5lOiB7IGZvckRpc3BsYXk6ICdweXRob24gc2NyaXB0LnB5JyB9LFxuXHRcdFx0c2hlbGw6ICdiYXNoJyxcblx0XHRcdG9zOiBPcGVyYXRpbmdTeXN0ZW0uTGludXhcblx0XHR9KTtcblx0XHRzdHJpY3RFcXVhbChyZXN1bHQsIHVuZGVmaW5lZCk7XG5cdH0pO1xuXG5cdHRlc3QoJ3Nob3VsZCBoYW5kbGUgUG93ZXJTaGVsbCBiYWNrdGljayBlc2NhcGluZycsICgpID0+IHtcblx0XHRjb25zdCByZXN1bHQgPSBwcmVzZW50ZXIucHJlc2VudCh7XG5cdFx0XHRjb21tYW5kTGluZTogeyBmb3JEaXNwbGF5OiAncHl0aG9uIC1jIFwicHJpbnQoYFwiaGVsbG9gXCIpXCInIH0sXG5cdFx0XHRzaGVsbDogJ3B3c2gnLFxuXHRcdFx0b3M6IE9wZXJhdGluZ1N5c3RlbS5XaW5kb3dzXG5cdFx0fSk7XG5cdFx0b2socmVzdWx0KTtcblx0XHRzdHJpY3RFcXVhbChyZXN1bHQuY29tbWFuZExpbmUsICdwcmludChcImhlbGxvXCIpJyk7XG5cdH0pO1xufSk7XG4iXSwKICAibWFwcGluZ3MiOiAiQUFLQSxTQUFTLElBQUksbUJBQW1CO0FBQ2hDLFNBQVMsc0JBQXNCLGtDQUFrQztBQUNqRSxTQUFTLHVCQUF1QjtBQUNoQyxTQUFTLCtDQUErQztBQUV4RCxNQUFNLHdCQUF3QixNQUFNO0FBQ25DLDBDQUF3QztBQUV4QyxRQUFNLG9CQUFvQixNQUFNO0FBQy9CLFNBQUssOERBQThELE1BQU07QUFDeEUsWUFBTSxTQUFTLHFCQUFxQiw4QkFBZ0MsUUFBUSxnQkFBZ0IsS0FBSztBQUNqRyxrQkFBWSxRQUFRLGdCQUFnQjtBQUFBLElBQ3JDLENBQUM7QUFFRCxTQUFLLHFDQUFxQyxNQUFNO0FBQy9DLFlBQU0sU0FBUyxxQkFBcUIsK0JBQWlDLFFBQVEsZ0JBQWdCLEtBQUs7QUFDbEcsa0JBQVksUUFBUSxnQkFBZ0I7QUFBQSxJQUNyQyxDQUFDO0FBRUQsU0FBSyxtREFBbUQsTUFBTTtBQUM3RCxZQUFNLFNBQVMscUJBQXFCLGNBQWMsUUFBUSxnQkFBZ0IsS0FBSztBQUMvRSxrQkFBWSxR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
