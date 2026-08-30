import { ok, strictEqual } from "assert";
import { extractRubyCommand, RubyCommandLinePresenter } from "../../browser/tools/commandLinePresenter/rubyCommandLinePresenter.js";
import { OperatingSystem } from "../../../../../../base/common/platform.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../../../base/test/common/utils.js";
suite("extractRubyCommand", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  suite("basic extraction", () => {
    test("should extract simple ruby -e command with double quotes", () => {
      const result = extractRubyCommand(`ruby -e "puts 'hello'"`, "bash", OperatingSystem.Linux);
      strictEqual(result, `puts 'hello'`);
    });
    test("should return undefined for non-ruby commands", () => {
      const result = extractRubyCommand("echo hello", "bash", OperatingSystem.Linux);
      strictEqual(result, void 0);
    });
    test("should return undefined for ruby without -e flag", () => {
      const result = extractRubyCommand("ruby script.rb", "bash", OperatingSystem.Linux);
      strictEqual(result, void 0);
    });
    test("should extract ruby -e with single quotes", () => {
      const result = extractRubyCommand(`ruby -e 'puts "hello"'`, "bash", OperatingSystem.Linux);
      strictEqual(result, 'puts "hello"');
    });
  });
  suite("quote unescaping - Bash", () => {
    test("should unescape backslash-escaped quotes in bash", () => {
      const result = extractRubyCommand('ruby -e "puts \\"hello\\""', "bash", OperatingSystem.Linux);
      strictEqual(result, 'puts "hello"');
    });
    test("should handle multiple escaped quotes", () => {
      const result = extractRubyCommand('ruby -e "x = \\"hello\\"; puts x"', "bash", OperatingSystem.Linux);
      strictEqual(result, 'x = "hello"; puts x');
    });
  });
  suite("single quotes - literal content", () => {
    test("should preserve content literally in single quotes (no unescaping)", () => {
      const result = extractRubyCommand(`ruby -e 'puts \\"hello\\"'`, "bash", OperatingSystem.Linux);
      strictEqual(result, 'puts \\"hello\\"');
    });
    test("should handle single quotes in PowerShell", () => {
      const result = extractRubyCommand(`ruby -e 'puts "hello"'`, "pwsh", OperatingSystem.Windows);
      strictEqual(result, 'puts "hello"');
    });
    test("should extract multiline code in single quotes", () => {
      const code = `ruby -e '3.times do |i|
  puts i
end'`;
      const result = extractRubyCommand(code, "bash", OperatingSystem.Linux);
      strictEqual(result, `3.times do |i|
  puts i
end`);
    });
  });
  suite("quote unescaping - PowerShell", () => {
    test("should unescape backtick-escaped quotes in PowerShell", () => {
      const result = extractRubyCommand('ruby -e "puts `"hello`""', "pwsh", OperatingSystem.Windows);
      strictEqual(result, 'puts "hello"');
    });
    test("should handle multiple backtick-escaped quotes", () => {
      const result = extractRubyCommand('ruby -e "x = `"hello`"; puts x"', "pwsh", OperatingSystem.Windows);
      strictEqual(result, 'x = "hello"; puts x');
    });
    test("should not unescape backslash quotes in PowerShell", () => {
      const result = extractRubyCommand('ruby -e "puts \\"hello\\""', "pwsh", OperatingSystem.Windows);
      strictEqual(result, 'puts \\"hello\\"');
    });
  });
  suite("multiline code", () => {
    test("should extract multiline Ruby code", () => {
      const code = `ruby -e "3.times do |i|
  puts i
end"`;
      const result = extractRubyCommand(code, "bash", OperatingSystem.Linux);
      strictEqual(result, `3.times do |i|
  puts i
end`);
    });
  });
  suite("edge cases", () => {
    test("should handle code with trailing whitespace trimmed", () => {
      const result = extractRubyCommand('ruby -e "  puts 1  "', "bash", OperatingSystem.Linux);
      strictEqual(result, "puts 1");
    });
    test("should return undefined for empty code", () => {
      const result = extractRubyCommand('ruby -e ""', "bash", OperatingSystem.Linux);
      strictEqual(result, void 0);
    });
    test("should return undefined when quotes are unmatched", () => {
      const result = extractRubyCommand('ruby -e "puts 1', "bash", OperatingSystem.Linux);
      strictEqual(result, void 0);
    });
  });
});
suite("RubyCommandLinePresenter", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  const presenter = new RubyCommandLinePresenter();
  test("should return Ruby presentation for ruby -e command", () => {
    const result = presenter.present({
      commandLine: { forDisplay: `ruby -e "puts 'hello'"` },
      shell: "bash",
      os: OperatingSystem.Linux
    });
    ok(result);
    strictEqual(result.commandLine, `puts 'hello'`);
    strictEqual(result.language, "ruby");
    strictEqual(result.languageDisplayName, "Ruby");
  });
  test("should return undefined for non-ruby commands", () => {
    const result = presenter.present({
      commandLine: { forDisplay: "echo hello" },
      shell: "bash",
      os: OperatingSystem.Linux
    });
    strictEqual(result, void 0);
  });
  test("should return undefined for regular ruby script execution", () => {
    const result = presenter.present({
      commandLine: { forDisplay: "ruby script.rb" },
      shell: "bash",
      os: OperatingSystem.Linux
    });
    strictEqual(result, void 0);
  });
  test("should handle PowerShell backtick escaping", () => {
    const result = presenter.present({
      commandLine: { forDisplay: 'ruby -e "puts `"hello`""' },
      shell: "pwsh",
      os: OperatingSystem.Windows
    });
    ok(result);
    strictEqual(result.commandLine, 'puts "hello"');
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXHRlcm1pbmFsQ29udHJpYlxcY2hhdEFnZW50VG9vbHNcXHRlc3RcXGJyb3dzZXJcXHJ1YnlDb21tYW5kTGluZVByZXNlbnRlci50ZXN0LnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IHsgb2ssIHN0cmljdEVxdWFsIH0gZnJvbSAnYXNzZXJ0JztcbmltcG9ydCB7IGV4dHJhY3RSdWJ5Q29tbWFuZCwgUnVieUNvbW1hbmRMaW5lUHJlc2VudGVyIH0gZnJvbSAnLi4vLi4vYnJvd3Nlci90b29scy9jb21tYW5kTGluZVByZXNlbnRlci9ydWJ5Q29tbWFuZExpbmVQcmVzZW50ZXIuanMnO1xuaW1wb3J0IHsgT3BlcmF0aW5nU3lzdGVtIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vcGxhdGZvcm0uanMnO1xuaW1wb3J0IHsgZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS90ZXN0L2NvbW1vbi91dGlscy5qcyc7XG5cbnN1aXRlKCdleHRyYWN0UnVieUNvbW1hbmQnLCAoKSA9PiB7XG5cdGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSgpO1xuXG5cdHN1aXRlKCdiYXNpYyBleHRyYWN0aW9uJywgKCkgPT4ge1xuXHRcdHRlc3QoJ3Nob3VsZCBleHRyYWN0IHNpbXBsZSBydWJ5IC1lIGNvbW1hbmQgd2l0aCBkb3VibGUgcXVvdGVzJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgcmVzdWx0ID0gZXh0cmFjdFJ1YnlDb21tYW5kKGBydWJ5IC1lIFwicHV0cyAnaGVsbG8nXCJgLCAnYmFzaCcsIE9wZXJhdGluZ1N5c3RlbS5MaW51eCk7XG5cdFx0XHRzdHJpY3RFcXVhbChyZXN1bHQsIGBwdXRzICdoZWxsbydgKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3Nob3VsZCByZXR1cm4gdW5kZWZpbmVkIGZvciBub24tcnVieSBjb21tYW5kcycsICgpID0+IHtcblx0XHRcdGNvbnN0IHJlc3VsdCA9IGV4dHJhY3RSdWJ5Q29tbWFuZCgnZWNobyBoZWxsbycsICdiYXNoJywgT3BlcmF0aW5nU3lzdGVtLkxpbnV4KTtcblx0XHRcdHN0cmljdEVxdWFsKHJlc3VsdCwgdW5kZWZpbmVkKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3Nob3VsZCByZXR1cm4gdW5kZWZpbmVkIGZvciBydWJ5IHdpdGhvdXQgLWUgZmxhZycsICgpID0+IHtcblx0XHRcdGNvbnN0IHJlc3VsdCA9IGV4dHJhY3RSdWJ5Q29tbWFuZCgncnVieSBzY3JpcHQucmInLCAnYmFzaCcsIE9wZXJhdGluZ1N5c3RlbS5MaW51eCk7XG5cdFx0XHRzdHJpY3RFcXVhbChyZXN1bHQsIHVuZGVmaW5lZCk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdzaG91bGQgZXh0cmFjdCBydWJ5IC1lIHdpdGggc2luZ2xlIHF1b3RlcycsICgpID0+IHtcblx0XHRcdGNvbnN0IHJlc3VsdCA9IGV4dHJhY3RSdWJ5Q29tbWFuZChgcnVieSAtZSAncHV0cyBcImhlbGxvXCInYCwgJ2Jhc2gnLCBPcGVyYXRpbmdTeXN0ZW0uTGludXgpO1xuXHRcdFx0c3RyaWN0RXF1YWwocmVzdWx0LCAncHV0cyBcImhlbGxvXCInKTtcblx0XHR9KTtcblx0fSk7XG5cblx0c3VpdGUoJ3F1b3RlIHVuZXNjYXBpbmcgLSBCYXNoJywgKCkgPT4ge1xuXHRcdHRlc3QoJ3Nob3VsZCB1bmVzY2FwZSBiYWNrc2xhc2gtZXNjYXBlZCBxdW90ZXMgaW4gYmFzaCcsICgpID0+IHtcblx0XHRcdGNvbnN0IHJlc3VsdCA9IGV4dHJhY3RSdWJ5Q29tbWFuZCgncnVieSAtZSBcInB1dHMgXFxcXFwiaGVsbG9cXFxcXCJcIicsICdiYXNoJywgT3BlcmF0aW5nU3lzdGVtLkxpbnV4KTtcblx0XHRcdHN0cmljdEVxdWFsKHJlc3VsdCwgJ3B1dHMgXCJoZWxsb1wiJyk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdzaG91bGQgaGFuZGxlIG11bHRpcGxlIGVzY2FwZWQgcXVvdGVzJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgcmVzdWx0ID0gZXh0cmFjdFJ1YnlDb21tYW5kKCdydWJ5IC1lIFwieCA9IFxcXFxcImhlbGxvXFxcXFwiOyBwdXRzIHhcIicsICdiYXNoJywgT3BlcmF0aW5nU3lzdGVtLkxpbnV4KTtcblx0XHRcdHN0cmljdEVxdWFsKHJlc3VsdCwgJ3ggPSBcImhlbGxvXCI7IHB1dHMgeCcpO1xuXHRcdH0pO1xuXHR9KTtcblxuXHRzdWl0ZSgnc2luZ2xlIHF1b3RlcyAtIGxpdGVyYWwgY29udGVudCcsICgpID0+IHtcblx0XHR0ZXN0KCdzaG91bGQgcHJlc2VydmUgY29udGVudCBsaXRlcmFsbHkgaW4gc2luZ2xlIHF1b3RlcyAobm8gdW5lc2NhcGluZyknLCAoKSA9PiB7XG5cdFx0XHRjb25zdCByZXN1bHQgPSBleHRyYWN0UnVieUNvbW1hbmQoYHJ1YnkgLWUgJ3B1dHMgXFxcXFwiaGVsbG9cXFxcXCInYCwgJ2Jhc2gnLCBPcGVyYXRpbmdTeXN0ZW0uTGludXgpO1xuXHRcdFx0c3RyaWN0RXF1YWwocmVzdWx0LCAncHV0cyBcXFxcXCJoZWxsb1xcXFxcIicpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnc2hvdWxkIGhhbmRsZSBzaW5nbGUgcXVvdGVzIGluIFBvd2VyU2hlbGwnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCByZXN1bHQgPSBleHRyYWN0UnVieUNvbW1hbmQoYHJ1YnkgLWUgJ3B1dHMgXCJoZWxsb1wiJ2AsICdwd3NoJywgT3BlcmF0aW5nU3lzdGVtLldpbmRvd3MpO1xuXHRcdFx0c3RyaWN0RXF1YWwocmVzdWx0LCAncHV0cyBcImhlbGxvXCInKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3Nob3VsZCBleHRyYWN0IG11bHRpbGluZSBjb2RlIGluIHNpbmdsZSBxdW90ZXMnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBjb2RlID0gYHJ1YnkgLWUgJzMudGltZXMgZG8gfGl8XFxuICBwdXRzIGlcXG5lbmQnYDtcblx0XHRcdGNvbnN0IHJlc3VsdCA9IGV4dHJhY3RSdWJ5Q29tbWFuZChjb2RlLCAnYmFzaCcsIE9wZXJhdGluZ1N5c3RlbS5MaW51eCk7XG5cdFx0XHRzdHJpY3RFcXVhbChyZXN1bHQsIGAzLnRpbWVzIGRvIHxpfFxcbiAgcHV0cyBpXFxuZW5kYCk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHN1aXRlKCdxdW90ZSB1bmVzY2FwaW5nIC0gUG93ZXJTaGVsbCcsICgpID0+IHtcblx0XHR0ZXN0KCdzaG91bGQgdW5lc2NhcGUgYmFja3RpY2stZXNjYXBlZCBxdW90ZXMgaW4gUG93ZXJTaGVsbCcsICgpID0+IHtcblx0XHRcdGNvbnN0IHJlc3VsdCA9IGV4dHJhY3RSdWJ5Q29tbWFuZCgncnVieSAtZSBcInB1dHMgYFwiaGVsbG9gXCJcIicsICdwd3NoJywgT3BlcmF0aW5nU3lzdGVtLldpbmRvd3MpO1xuXHRcdFx0c3RyaWN0RXF1YWwocmVzdWx0LCAncHV0cyBcImhlbGxvXCInKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3Nob3VsZCBoYW5kbGUgbXVsdGlwbGUgYmFja3RpY2stZXNjYXBlZCBxdW90ZXMnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCByZXN1bHQgPSBleHRyYWN0UnVieUNvbW1hbmQoJ3J1YnkgLWUgXCJ4ID0gYFwiaGVsbG9gXCI7IHB1dHMgeFwiJywgJ3B3c2gnLCBPcGVyYXRpbmdTeXN0ZW0uV2luZG93cyk7XG5cdFx0XHRzdHJpY3RFcXVhbChyZXN1bHQsICd4ID0gXCJoZWxsb1wiOyBwdXRzIHgnKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3Nob3VsZCBub3QgdW5lc2NhcGUgYmFja3NsYXNoIHF1b3RlcyBpbiBQb3dlclNoZWxsJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgcmVzdWx0ID0gZXh0cmFjdFJ1YnlDb21tYW5kKCdydWJ5IC1lIFwicHV0cyBcXFxcXCJoZWxsb1xcXFxcIlwiJywgJ3B3c2gnLCBPcGVyYXRpbmdTeXN0ZW0uV2luZG93cyk7XG5cdFx0XHRzdHJpY3RFcXVhbChyZXN1bHQsICdwdXRzIFxcXFxcImhlbGxvXFxcXFwiJyk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHN1aXRlKCdtdWx0aWxpbmUgY29kZScsICgpID0+IHtcblx0XHR0ZXN0KCdzaG91bGQgZXh0cmFjdCBtdWx0aWxpbmUgUnVieSBjb2RlJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgY29kZSA9IGBydWJ5IC1lIFwiMy50aW1lcyBkbyB8aXxcXG4gIHB1dHMgaVxcbmVuZFwiYDtcblx0XHRcdGNvbnN0IHJlc3VsdCA9IGV4dHJhY3RSdWJ5Q29tbWFuZChjb2RlLCAnYmFzaCcsIE9wZXJhdGluZ1N5c3RlbS5MaW51eCk7XG5cdFx0XHRzdHJpY3RFcXVhbChyZXN1bHQsIGAzLnRpbWVzIGRvIHxpfFxcbiAgcHV0cyBpXFxuZW5kYCk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHN1aXRlKCdlZGdlIGNhc2VzJywgKCkgPT4ge1xuXHRcdHRlc3QoJ3Nob3VsZCBoYW5kbGUgY29kZSB3aXRoIHRyYWlsaW5nIHdoaXRlc3BhY2UgdHJpbW1lZCcsICgpID0+IHtcblx0XHRcdGNvbnN0IHJlc3VsdCA9IGV4dHJhY3RSdWJ5Q29tbWFuZCgncnVieSAtZSBcIiAgcHV0cyAxICBcIicsICdiYXNoJywgT3BlcmF0aW5nU3lzdGVtLkxpbnV4KTtcblx0XHRcdHN0cmljdEVxdWFsKHJlc3VsdCwgJ3B1dHMgMScpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnc2hvdWxkIHJldHVybiB1bmRlZmluZWQgZm9yIGVtcHR5IGNvZGUnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCByZXN1bHQgPSBleHRyYWN0UnVieUNvbW1hbmQoJ3J1YnkgLWUgXCJcIicsICdiYXNoJywgT3BlcmF0aW5nU3lzdGVtLkxpbnV4KTtcblx0XHRcdHN0cmljdEVxdWFsKHJlc3VsdCwgdW5kZWZpbmVkKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3Nob3VsZCByZXR1cm4gdW5kZWZpbmVkIHdoZW4gcXVvdGVzIGFyZSB1bm1hdGNoZWQnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCByZXN1bHQgPSBleHRyYWN0UnVieUNvbW1hbmQoJ3J1YnkgLWUgXCJwdXRzIDEnLCAnYmFzaCcsIE9wZXJhdGluZ1N5c3RlbS5MaW51eCk7XG5cdFx0XHRzdHJpY3RFcXVhbChyZXN1bHQsIHVuZGVmaW5lZCk7XG5cdFx0fSk7XG5cdH0pO1xufSk7XG5cbnN1aXRlKCdSdWJ5Q29tbWFuZExpbmVQcmVzZW50ZXInLCAoKSA9PiB7XG5cdGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSgpO1xuXG5cdGNvbnN0IHByZXNlbnRlciA9IG5ldyBSdWJ5Q29tbWFuZExpbmVQcmVzZW50ZXIoKTtcblxuXHR0ZXN0KCdzaG91bGQgcmV0dXJuIFJ1YnkgcHJlc2VudGF0aW9uIGZvciBydWJ5IC1lIGNvbW1hbmQnLCAoKSA9PiB7XG5cdFx0Y29uc3QgcmVzdWx0ID0gcHJlc2VudGVyLnByZXNlbnQoe1xuXHRcdFx0Y29tbWFuZExpbmU6IHsgZm9yRGlzcGxheTogYHJ1YnkgLWUgXCJwdXRzICdoZWxsbydcImAgfSxcblx0XHRcdHNoZWxsOiAnYmFzaCcsXG5cdFx0XHRvczogT3BlcmF0aW5nU3lzdGVtLkxpbnV4XG5cdFx0fSk7XG5cdFx0b2socmVzdWx0KTtcblx0XHRzdHJpY3RFcXVhbChyZXN1bHQuY29tbWFuZExpbmUsIGBwdXRzICdoZWxsbydgKTtcblx0XHRzdHJpY3RFcXVhbChyZXN1bHQubGFuZ3VhZ2UsICdydWJ5Jyk7XG5cdFx0c3RyaWN0RXF1YWwocmVzdWx0Lmxhbmd1YWdlRGlzcGxheU5hbWUsICdSdWJ5Jyk7XG5cdH0pO1xuXG5cdHRlc3QoJ3Nob3VsZCByZXR1cm4gdW5kZWZpbmVkIGZvciBub24tcnVieSBjb21tYW5kcycsICgpID0+IHtcblx0XHRjb25zdCByZXN1bHQgPSBwcmVzZW50ZXIucHJlc2VudCh7XG5cdFx0XHRjb21tYW5kTGluZTogeyBmb3JEaXNwbGF5OiAnZWNobyBoZWxsbycgfSxcblx0XHRcdHNoZWxsOiAnYmFzaCcsXG5cdFx0XHRvczogT3BlcmF0aW5nU3lzdGVtLkxpbnV4XG5cdFx0fSk7XG5cdFx0c3RyaWN0RXF1YWwocmVzdWx0LCB1bmRlZmluZWQpO1xuXHR9KTtcblxuXHR0ZXN0KCdzaG91bGQgcmV0dXJuIHVuZGVmaW5lZCBmb3IgcmVndWxhciBydWJ5IHNjcmlwdCBleGVjdXRpb24nLCAoKSA9PiB7XG5cdFx0Y29uc3QgcmVzdWx0ID0gcHJlc2VudGVyLnByZXNlbnQoe1xuXHRcdFx0Y29tbWFuZExpbmU6IHsgZm9yRGlzcGxheTogJ3J1Ynkgc2NyaXB0LnJiJyB9LFxuXHRcdFx0c2hlbGw6ICdiYXNoJyxcblx0XHRcdG9zOiBPcGVyYXRpbmdTeXN0ZW0uTGludXhcblx0XHR9KTtcblx0XHRzdHJpY3RFcXVhbChyZXN1bHQsIHVuZGVmaW5lZCk7XG5cdH0pO1xuXG5cdHRlc3QoJ3Nob3VsZCBoYW5kbGUgUG93ZXJTaGVsbCBiYWNrdGljayBlc2NhcGluZycsICgpID0+IHtcblx0XHRjb25zdCByZXN1bHQgPSBwcmVzZW50ZXIucHJlc2VudCh7XG5cdFx0XHRjb21tYW5kTGluZTogeyBmb3JEaXNwbGF5OiAncnVieSAtZSBcInB1dHMgYFwiaGVsbG9gXCJcIicgfSxcblx0XHRcdHNoZWxsOiAncHdzaCcsXG5cdFx0XHRvczogT3BlcmF0aW5nU3lzdGVtLldpbmRvd3Ncblx0XHR9KTtcblx0XHRvayhyZXN1bHQpO1xuXHRcdHN0cmljdEVxdWFsKHJlc3VsdC5jb21tYW5kTGluZSwgJ3B1dHMgXCJoZWxsb1wiJyk7XG5cdH0pO1xufSk7XG4iXSwKICAibWFwcGluZ3MiOiAiQUFLQSxTQUFTLElBQUksbUJBQW1CO0FBQ2hDLFNBQVMsb0JBQW9CLGdDQUFnQztBQUM3RCxTQUFTLHVCQUF1QjtBQUNoQyxTQUFTLCtDQUErQztBQUV4RCxNQUFNLHNCQUFzQixNQUFNO0FBQ2pDLDBDQUF3QztBQUV4QyxRQUFNLG9CQUFvQixNQUFNO0FBQy9CLFNBQUssNERBQTRELE1BQU07QUFDdEUsWUFBTSxTQUFTLG1CQUFtQiwwQkFBMEIsUUFBUSxnQkFBZ0IsS0FBSztBQUN6RixrQkFBWSxRQUFRLGNBQWM7QUFBQSxJQUNuQyxDQUFDO0FBRUQsU0FBSyxpREFBaUQsTUFBTTtBQUMzRCxZQUFNLFNBQVMsbUJBQW1CLGNBQWMsUUFBUSxnQkFBZ0IsS0FBSztBQUM3RSxrQkFBWSxRQUFRLE1BQVM7QUFBQSxJQUM5QixDQUFDO0FBRUQsU0FBSyxvREFBb0QsTUFBTTtBQUM5RCxZQUFNLFNBQVMsbUJBQW1CLGtCQUFrQixRQUFRLGdCQUFnQixLQUFLO0FBQ2pGLGtCQUFZLFFBQVEsTUFBUztBQUFBLElBQzlCLENBQUM7QUFFRCxTQUFLLDZDQUE2QyxNQUFNO0FBQ3ZELFlBQU0sU0FBUyxtQkFBbUIsMEJBQTBCLFFBQVEsZ0JBQWdCLEtBQUs7QUFDekYsa0JBQVksUUFBUSxjQUFjO0FBQUEsSUFDbkMsQ0FBQztBQUFBLEVBQ0YsQ0FBQztBQUVELFFBQU0sMkJBQTJCLE1BQU07QUFDdEMsU0FBSyxvREFBb0QsTUFBTTtBQUM5RCxZQUFNLFNBQVMsbUJBQW1CLDhCQUE4QixRQUFRLGdCQUFnQixLQUFLO0FBQzdG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
