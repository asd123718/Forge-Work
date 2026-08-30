import { deepStrictEqual, ok, strictEqual } from "assert";
import { Separator } from "../../../../../../base/common/actions.js";
import * as marked from "../../../../../../base/common/marked/marked.js";
import { appendEscapedMarkdownInlineCode } from "../../../../../../base/common/htmlContent.js";
import { generateAutoApproveActions, TRUNCATION_MESSAGE, dedupeRules, isPowerShell, truncateOutputKeepingTail, extractCdPrefix, normalizeTerminalCommandForDisplay, normalizeCommandForExecution, isMultilineCommand, buildCommandDisplayText } from "../../browser/runInTerminalHelpers.js";
import { buildCompletionNotificationCommand } from "../../browser/tools/runInTerminalTool.js";
import { OperatingSystem } from "../../../../../../base/common/platform.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../../../base/test/common/utils.js";
import { ConfigurationTarget } from "../../../../../../platform/configuration/common/configuration.js";
import { isAutoApproveRule } from "../../browser/tools/commandLineAnalyzer/commandLineAnalyzer.js";
suite("isPowerShell", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  suite("PowerShell executables", () => {
    test("should detect powershell.exe", () => {
      ok(isPowerShell("powershell.exe", OperatingSystem.Windows));
      ok(isPowerShell("powershell", OperatingSystem.Linux));
    });
    test("should detect pwsh.exe", () => {
      ok(isPowerShell("pwsh.exe", OperatingSystem.Windows));
      ok(isPowerShell("pwsh", OperatingSystem.Linux));
    });
    test("should detect powershell-preview", () => {
      ok(isPowerShell("powershell-preview.exe", OperatingSystem.Windows));
      ok(isPowerShell("powershell-preview", OperatingSystem.Linux));
    });
    test("should detect pwsh-preview", () => {
      ok(isPowerShell("pwsh-preview.exe", OperatingSystem.Windows));
      ok(isPowerShell("pwsh-preview", OperatingSystem.Linux));
    });
  });
  suite("PowerShell with full paths", () => {
    test("should detect Windows PowerShell with full path", () => {
      ok(isPowerShell("C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe", OperatingSystem.Windows));
    });
    test("should detect PowerShell Core with full path", () => {
      ok(isPowerShell("C:\\Program Files\\PowerShell\\7\\pwsh.exe", OperatingSystem.Windows));
    });
    test("should detect PowerShell on Linux/macOS with full path", () => {
      ok(isPowerShell("/usr/bin/pwsh", OperatingSystem.Linux));
    });
    test("should detect PowerShell preview with full path", () => {
      ok(isPowerShell("/opt/microsoft/powershell/7-preview/pwsh-preview", OperatingSystem.Linux));
    });
    test("should detect nested path with powershell", () => {
      ok(isPowerShell("/some/deep/path/to/powershell.exe", OperatingSystem.Windows));
    });
  });
  suite("Case sensitivity", () => {
    test("should detect PowerShell regardless of case", () => {
      ok(isPowerShell("PowerShell.exe", OperatingSystem.Windows));
      ok(isPowerShell("POWERSHELL.EXE", OperatingSystem.Windows));
      ok(isPowerShell("Pwsh.exe", OperatingSystem.Windows));
    });
  });
  suite("Non-PowerShell shells", () => {
    test("should not detect bash", () => {
      ok(!isPowerShell("bash", OperatingSystem.Linux));
    });
    test("should not detect zsh", () => {
      ok(!isPowerShell("zsh", OperatingSystem.Linux));
    });
    test("should not detect sh", () => {
      ok(!isPowerShell("sh", OperatingSystem.Linux));
    });
    test("should not detect fish", () => {
      ok(!isPowerShell("fish", OperatingSystem.Linux));
    });
    test("should not detect cmd.exe", () => {
      ok(!isPowerShell("cmd.exe", OperatingSystem.Windows));
    });
    test("should not detect command.com", () => {
      ok(!isPowerShell("command.com", OperatingSystem.Windows));
    });
    test("should not detect dash", () => {
      ok(!isPowerShell("dash", OperatingSystem.Linux));
    });
    test("should not detect tcsh", () => {
      ok(!isPowerShell("tcsh", OperatingSystem.Linux));
    });
    test("should not detect csh", () => {
      ok(!isPowerShell("csh", OperatingSystem.Linux));
    });
  });
  suite("Non-PowerShell shells with full paths", () => {
    test("should not detect bash with full path", () => {
      ok(!isPowerShell("/bin/bash", OperatingSystem.Linux));
    });
    test("should not detect zsh with full path", () => {
      ok(!isPowerShell("/usr/bin/zsh", OperatingSystem.Linux));
    });
    test("should not detect cmd.exe with full path", () => {
      ok(!isPowerShell("C:\\Windows\\System32\\cmd.exe", OperatingSystem.Windows));
    });
    test("should not detect git bash", () => {
      ok(!isPowerShell("C:\\Program Files\\Git\\bin\\bash.exe", OperatingSystem.Windows));
    });
  });
  suite("Edge cases", () => {
    test("should handle empty string", () => {
      ok(!isPowerShell("", OperatingSystem.Windows));
    });
    test("should handle paths with spaces", () => {
      ok(isPowerShell("C:\\Program Files\\PowerShell\\7\\pwsh.exe", OperatingSystem.Windows));
      ok(!isPowerShell("C:\\Program Files\\Git\\bin\\bash.exe", OperatingSystem.Windows));
    });
    test("should not match partial strings", () => {
      ok(!isPowerShell("notpowershell", OperatingSystem.Linux));
      ok(!isPowerShell("powershellish", OperatingSystem.Linux));
      ok(!isPowerShell("mypwsh", OperatingSystem.Linux));
      ok(!isPowerShell("pwshell", OperatingSystem.Linux));
    });
    test("should handle strings containing powershell but not as basename", () => {
      ok(!isPowerShell("/powershell/bin/bash", OperatingSystem.Linux));
      ok(!isPowerShell("/usr/pwsh/bin/zsh", OperatingSystem.Linux));
      ok(!isPowerShell("C:\\powershell\\cmd.exe", OperatingSystem.Windows));
    });
    test("should handle special characters in path", () => {
      ok(isPowerShell("/path/with-dashes/pwsh.exe", OperatingSystem.Windows));
      ok(isPowerShell("/path/with_underscores/powershell", OperatingSystem.Linux));
      ok(isPowerShell("C:\\path\\with spaces\\pwsh.exe", OperatingSystem.Windows));
    });
    test("should handle relative paths", () => {
      ok(isPowerShell("./powershell.exe", OperatingSystem.Windows));
      ok(isPowerShell("../bin/pwsh", OperatingSystem.Linux));
      ok(isPowerShell("bin/powershell", OperatingSystem.Linux));
    });
    test("should not match similar named tools", () => {
      ok(!isPowerShell("powertool", OperatingSystem.Linux));
      ok(!isPowerShell("shell", OperatingSystem.Linux));
      ok(!isPowerShell("power", OperatingSystem.Linux));
      ok(!isPowerShell("pwshconfig", OperatingSystem.Linux));
    });
  });
});
suite("dedupeRules", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  function createMockRule(sourceText) {
    return {
      regex: new RegExp(sourceText),
      regexCaseInsensitive: new RegExp(sourceText, "i"),
      sourceText,
      sourceTarget: ConfigurationTarget.USER,
      isDefaultRule: false
    };
  }
  function createMockResult(result, reason, rule) {
    return {
      result,
      reason,
      rule
    };
  }
  function getSourceText(result) {
    return isAutoApproveRule(result.rule) ? result.rule.sourceText : void 0;
  }
  test("should return empty array for empty input", () => {
    const result = dedupeRules([]);
    strictEqual(result.length, 0);
  });
  test("should return same array when no duplicates exist", () => {
    const result = dedupeRules([
      createMockResult("approved", "approved by echo rule", createMockRule("echo")),
      createMockResult("approved", "approved by ls rule", createMockRule("ls"))
    ]);
    strictEqual(result.length, 2);
    strictEqual(getSourceText(result[0]), "echo");
    strictEqual(getSourceText(result[1]), "ls");
  });
  test("should deduplicate rules with same sourceText", () => {
    const result = dedupeRules([
      createMockResult("approved", "approved by echo rule", createMockRule("echo")),
      createMockResult("approved", "approved by echo rule again", createMockRule("echo")),
      createMockResult("approved", "approved by ls rule", createMockRule("ls"))
    ]);
    strictEqual(result.length, 2);
    strictEqual(getSourceText(result[0]), "echo");
    strictEqual(getSourceText(result[1]), "ls");
  });
  test("should preserve first occurrence when deduplicating", () => {
    const result = dedupeRules([
      createMockResult("approved", "first echo rule", createMockRule("echo")),
      createMockResult("approved", "second echo rule", createMockRule("echo"))
    ]);
    strictEqual(result.length, 1);
    strictEqual(result[0].reason, "first echo rule");
  });
  test("should filter out results without rules", () => {
    const result = dedupeRules([
      createMockResult("noMatch", "no rule applied"),
      createMockResult("approved", "approved by echo rule", createMockRule("echo")),
      createMockResult("denied", "denied without rule")
    ]);
    strictEqual(result.length, 1);
    strictEqual(getSourceText(result[0]), "echo");
  });
  test("should handle mix of rules and no-rule results with duplicates", () => {
    const result = dedupeRules([
      createMockResult("approved", "approved by echo rule", createMockRule("echo")),
      createMockResult("noMatch", "no rule applied"),
      createMockResult("approved", "approved by echo rule again", createMockRule("echo")),
      createMockResult("approved", "approved by ls rule", createMockRule("ls")),
      createMockResult("denied", "denied without rule")
    ]);
    strictEqual(result.length, 2);
    strictEqual(getSourceText(result[0]), "echo");
    strictEqual(getSourceText(result[1]), "ls");
  });
  test("should handle multiple duplicates of same rule", () => {
    const result = dedupeRules([
      createMockResult("approved", "npm rule 1", createMockRule("npm")),
      createMockResult("approved", "npm rule 2", createMockRule("npm")),
      createMockResult("approved", "npm rule 3", createMockRule("npm")),
      createMockResult("approved", "git rule", createMockRule("git"))
    ]);
    strictEqual(result.length, 2);
    strictEqual(getSourceText(result[0]), "npm");
    strictEqual(result[0].reason, "npm rule 1");
    strictEqual(getSourceText(result[1]), "git");
  });
});
suite("truncateOutputKeepingTail", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  test("returns original when below limit", () => {
    const output = "short output";
    strictEqual(truncateOutputKeepingTail(output, 100), output);
  });
  test("keeps tail and adds message when above limit", () => {
    const output = "a".repeat(200);
    const result = truncateOutputKeepingTail(output, 120);
    ok(result.startsWith(TRUNCATION_MESSAGE));
    strictEqual(result.length, 120);
  });
  test("gracefully handles tiny limits", () => {
    const result = truncateOutputKeepingTail("example", 5);
    strictEqual(result.length, 5);
  });
});
suite("normalizeTerminalCommandForDisplay", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  test("removes escaped single and double quotes", () => {
    const input = `git rev-parse \\'stash@{0}\\' && echo \\"done\\"`;
    strictEqual(normalizeTerminalCommandForDisplay(input), `git rev-parse 'stash@{0}' && echo "done"`);
  });
  test("normalizes escaped forward slashes", () => {
    const input = "echo \\/Users\\/me\\/project";
    strictEqual(normalizeTerminalCommandForDisplay(input), "echo /Users/me/project");
  });
  test("preserves non-quote escapes", () => {
    const input = "echo path\\ with\\ spaces";
    strictEqual(normalizeTerminalCommandForDisplay(input), input);
  });
});
suite("generateAutoApproveActions", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  function createMockRule(sourceText) {
    const escapedText = sourceText.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return {
      regex: new RegExp(escapedText),
      regexCaseInsensitive: new RegExp(escapedText, "i"),
      sourceText,
      sourceTarget: ConfigurationTarget.USER,
      isDefaultRule: false
    };
  }
  function createMockResult(result, reason, rule) {
    return {
      result,
      reason,
      rule
    };
  }
  test("should suggest mvn test when command is mvn test", () => {
    const commandLine = "mvn test";
    const subCommands = ["mvn test"];
    const autoApproveResult = {
      subCommandResults: [createMockResult("noMatch", "not approved")],
      commandLineResult: createMockResult("noMatch", "not approved")
    };
    const actions = generateAutoApproveActions(commandLine, subCommands, autoApproveResult);
    const subCommandAction = actions.find((action) => action.label.includes("mvn test"));
    ok(subCommandAction, "Should suggest mvn test approval");
  });
  test("should suggest mvn -DskipIT test when flags appear before subcommand", () => {
    const commandLine = "mvn -DskipIT test";
    const subCommands = ["mvn -DskipIT test"];
    const autoApproveResult = {
      subCommandResults: [createMockResult("noMatch", "not approved")],
      commandLineResult: createMockResult("noMatch", "not approved")
    };
    const actions = generateAutoApproveActions(commandLine, subCommands, autoApproveResult);
    const subCommandAction = actions.find((action) => action.label.includes("mvn -DskipIT test"));
    ok(subCommandAction, "Should suggest mvn -DskipIT test approval (including flags)");
  });
  test("should suggest mvn -X -DskipIT test when multiple flags appear before subcommand", () => {
    const commandLine = "mvn -X -DskipIT test";
    const subCommands = ["mvn -X -DskipIT test"];
    const autoApproveResult = {
      subCommandResults: [createMockResult("noMatch", "not approved")],
      commandLineResult: createMockResult("noMatch", "not approved")
    };
    const actions = generateAutoApproveActions(commandLine, subCommands, autoApproveResult);
    const subCommandAction = actions.find((action) => action.label.includes("mvn -X -DskipIT test"));
    ok(subCommandAction, "Should suggest mvn -X -DskipIT test approval with multiple flags");
  });
  test("should suggest gradle --info build when flags appear before subcommand", () => {
    const commandLine = "gradle --info build";
    const subCommands = ["gradle --info build"];
    const autoApproveResult = {
      subCommandResults: [createMockResult("noMatch", "not approved")],
      commandLineResult: createMockResult("noMatch", "not approved")
    };
    const actions = generateAutoApproveActions(commandLine, subCommands, autoApproveResult);
    const subCommandAction = actions.find((action) => action.label.includes("gradle --info build"));
    ok(subCommandAction, "Should suggest gradle --info build approval");
  });
  test("should suggest npm --silent run test when flags appear before subcommand", () => {
    const commandLine = "npm --silent run test";
    const subCommands = ["npm --silent run test"];
    const autoApproveResult = {
      subCommandResults: [createMockResult("noMatch", "not approved")],
      commandLineResult: createMockResult("noMatch", "not approved")
    };
    const actions = generateAutoApproveActions(commandLine, subCommands, autoApproveResult);
    const subCommandAction = actions.find((action) => action.label.includes("npm --silent run test"));
    ok(subCommandAction, "Should suggest npm --silent run test approval (sub-sub-command with flags)");
  });
  test("should suggest npm --silent run --verbose test when flags appear between subcommands", () => {
    const commandLine = "npm --silent run --verbose test";
    const subCommands = ["npm --silent run --verbose test"];
    const autoApproveResult = {
      subCommandResults: [createMockResult("noMatch", "not approved")],
      commandLineResult: createMockResult("noMatch", "not approved")
    };
    const actions = generateAutoApproveActions(commandLine, subCommands, autoApproveResult);
    const subCommandAction = actions.find((action) => action.label.includes("npm --silent run --verbose test"));
    ok(subCommandAction, "Should suggest npm --silent run --verbose test with flags between subcommands");
  });
  test("should not suggest approval when only flags and no subcommand", () => {
    const commandLine = "mvn -X -DskipIT";
    const subCommands = ["mvn -X -DskipIT"];
    const autoApproveResult = {
      subCommandResults: [createMockResult("noMatch", "not approved")],
      commandLineResult: createMockResult("noMatch", "not approved")
    };
    const actions = generateAutoApproveActions(commandLine, subCommands, autoApproveResult);
    const subCommandAction = actions.find((action) => action.label.includes("Always Allow Command:") && action.label.includes("mvn"));
    strictEqual(subCommandAction, void 0, "Should not suggest mvn approval when no subcommand found");
  });
  test("should suggest exact command line when subcommand cannot be extracted", () => {
    const commandLine = "mvn -X -DskipIT";
    const subCommands = ["mvn -X -DskipIT"];
    const autoApproveResult = {
      subCommandResults: [createMockResult("noMatch", "not approved")],
      commandLineResult: createMockResult("noMatch", "not approved")
    };
    const actions = generateAutoApproveActions(commandLine, subCommands, autoApproveResult);
    const exactCommandAction = actions.find((action) => action.label.includes("Always Allow Exact Command Line"));
    ok(exactCommandAction, "Should suggest exact command line approval");
  });
  test("should handle multiple subcommands with flags", () => {
    const commandLine = "mvn -DskipIT test && gradle --info build";
    const subCommands = ["mvn -DskipIT test", "gradle --info build"];
    const autoApproveResult = {
      subCommandResults: [
        createMockResult("noMatch", "not approved"),
        createMockResult("noMatch", "not approved")
      ],
      commandLineResult: createMockResult("noMatch", "not approved")
    };
    const actions = generateAutoApproveActions(commandLine, subCommands, autoApproveResult);
    const subCommandAction = actions.find(
      (action) => action.label.includes("mvn -DskipIT test") && action.label.includes("gradle --info build")
    );
    ok(subCommandAction, "Should suggest both mvn -DskipIT test and gradle --info build");
  });
  test("should not suggest when commands are denied", () => {
    const commandLine = "mvn -DskipIT test";
    const subCommands = ["mvn -DskipIT test"];
    const autoApproveResult = {
      subCommandResults: [createMockResult("denied", "denied by rule", createMockRule("mvn test"))],
      commandLineResult: createMockResult("noMatch", "not approved")
    };
    const actions = generateAutoApproveActions(commandLine, subCommands, autoApproveResult);
    const subCommandAction = actions.find((action) => action.label.includes("Always Allow Command:"));
    strictEqual(subCommandAction, void 0, "Should not suggest approval for denied commands");
  });
  test("should not suggest when commands are already approved", () => {
    const commandLine = "mvn -DskipIT test";
    const subCommands = ["mvn -DskipIT test"];
    const autoApproveResult = {
      subCommandResults: [createMockResult("approved", "approved by rule", createMockRule("mvn test"))],
      commandLineResult: createMockResult("noMatch", "not approved")
    };
    const actions = generateAutoApproveActions(commandLine, subCommands, autoApproveResult);
    const subCommandAction = actions.find((action) => action.label.includes("mvn -DskipIT test") && action.label.includes("Always Allow Command:"));
    strictEqual(subCommandAction, void 0, "Should not suggest approval for already approved commands");
  });
  test("should not include session-scoped actions when skipSessionScoped is set", () => {
    const commandLine = "mvn test";
    const subCommands = ["mvn test"];
    const autoApproveResult = {
      subCommandResults: [createMockResult("noMatch", "not approved")],
      commandLineResult: createMockResult("noMatch", "not approved")
    };
    const actions = generateAutoApproveActions(commandLine, subCommands, autoApproveResult, { skipSessionScoped: true });
    deepStrictEqual(actions.map((action) => action instanceof Separator ? "---" : action.label), [
      "Allow `mvn test \u2026` in this Workspace",
      "Always Allow `mvn test \u2026`",
      "---",
      "Allow Exact Command Line in this Workspace",
      "Always Allow Exact Command Line",
      "---",
      "Configure Auto Approve..."
    ]);
  });
});
suite("extractCdPrefix", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  suite("Posix", () => {
    function t(commandLine, expectedDir, expectedCommand) {
      const result = extractCdPrefix(commandLine, "bash", OperatingSystem.Linux);
      strictEqual(result?.directory, expectedDir);
      strictEqual(result?.command, expectedCommand);
    }
    test("should return undefined when no cd prefix", () => t("echo hello", void 0, void 0));
    test("should return undefined when cd has no suffix", () => t("cd /some/path", void 0, void 0));
    test("should extract cd prefix with && separator", () => t("cd /some/path && npm install", "/some/path", "npm install"));
    test("should extract quoted path", () => t('cd "/some/path" && npm install', "/some/path", "npm install"));
    test("should extract complex suffix", () => t("cd /path && npm install && npm test", "/path", "npm install && npm test"));
    suite("unsupported patterns", () => {
      test("should return undefined for path with escaped space", () => t("cd /some/path with spaces && npm install", void 0, void 0));
    });
  });
  suite("PowerShell", () => {
    function t(commandLine, expectedDir, expectedCommand) {
      const result = extractCdPrefix(commandLine, "pwsh", OperatingSystem.Windows);
      strictEqual(result?.directory, expectedDir);
      strictEqual(result?.command, expectedCommand);
    }
    test("should extract cd with ; separator", () => t("cd C:\\path; npm test", "C:\\path", "npm test"));
    test("should extract cd /d with && separator", () => t("cd /d C:\\path && echo hello", "C:\\path", "echo hello"));
    test("should extract Set-Location", () => t("Set-Location C:\\path; npm test", "C:\\path", "npm test"));
    test("should extract Set-Location -Path", () => t("Set-Location -Path C:\\path; npm test", "C:\\path", "npm test"));
    suite("unsupported patterns", () => {
      test("should return undefined for quoted path with spaces", () => t('cd "C:\\path with spaces"; npm test', void 0, void 0));
    });
  });
});
suite("normalizeCommandForExecution", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  test("should collapse newlines to spaces for simple commands", () => {
    strictEqual(normalizeCommandForExecution("echo hello\necho world"), "echo hello echo world");
  });
  test("should collapse \\r\\n to spaces", () => {
    strictEqual(normalizeCommandForExecution("echo a\r\necho b"), "echo a echo b");
  });
  test("should collapse \\r to spaces", () => {
    strictEqual(normalizeCommandForExecution("echo a\recho b"), "echo a echo b");
  });
  test("should trim whitespace", () => {
    strictEqual(normalizeCommandForExecution("  echo hello  "), "echo hello");
  });
  test("should handle single-line command", () => {
    strictEqual(normalizeCommandForExecution("ls -la"), "ls -la");
  });
});
suite("isMultilineCommand", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  test("should return true for heredoc", () => {
    strictEqual(isMultilineCommand("cat > file.txt << 'EOF'\nhello world\nEOF"), true);
  });
  test("should return true for multi-statement with \\n", () => {
    strictEqual(isMultilineCommand("echo hello\necho world"), true);
  });
  test("should return true for multi-statement with \\r\\n", () => {
    strictEqual(isMultilineCommand("echo hello\r\necho world"), true);
  });
  test("should return false for single-line command", () => {
    strictEqual(isMultilineCommand("ls -la"), false);
  });
  test("should return false for line continuation with backslash-newline", () => {
    strictEqual(isMultilineCommand("echo hello \\\n  world"), false);
  });
  test("should return false for line continuation with backslash-crlf", () => {
    strictEqual(isMultilineCommand("echo hello \\\r\n  world"), false);
  });
  test("should return true when continuation and bare newline are mixed", () => {
    strictEqual(isMultilineCommand("echo hello \\\n  world\necho done"), true);
  });
});
suite("buildCommandDisplayText", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  test("should collapse newlines (including blank lines) to spaces", () => {
    strictEqual(buildCommandDisplayText("echo a\n\necho b"), "echo a  echo b");
    strictEqual(buildCommandDisplayText("echo a\r\necho b"), "echo a echo b");
  });
  test("should truncate long commands to 80 characters", () => {
    const long = "a".repeat(200);
    const result = buildCommandDisplayText(long);
    strictEqual(result.length, 80);
    ok(result.endsWith("..."));
  });
  test("multi-line command renders as inline code (not a literal backtick)", () => {
    const opts = { gfm: true, breaks: true };
    const render = (value) => marked.parser(marked.lexer(value, opts), opts);
    const multilineCommand = "rm -rf .playwright-cli/\n\nmore text";
    const label = appendEscapedMarkdownInlineCode(buildCommandDisplayText(multilineCommand)) + " completed";
    const html = render(label);
    ok(html.includes("<code>"), `expected a code span, got: ${html}`);
    ok(!/<p>`/.test(html), `expected no literal leading backtick, got: ${html}`);
  });
});
suite("buildCompletionNotificationCommand", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  test("leaves single-line commands unchanged", () => {
    strictEqual(buildCompletionNotificationCommand("echo hello"), "echo hello");
  });
  test("keeps only the first line and appends a horizontal ellipsis for multi-line commands", () => {
    strictEqual(buildCompletionNotificationCommand("echo a\necho b"), "echo a\u2026");
    strictEqual(buildCompletionNotificationCommand("echo a\n\necho b"), "echo a\u2026");
    strictEqual(buildCompletionNotificationCommand("echo a\r\necho b"), "echo a\u2026");
    strictEqual(buildCompletionNotificationCommand("echo a\recho b"), "echo a\u2026");
  });
  test("truncates a long first line to 80 characters using a single horizontal ellipsis", () => {
    const longFirstLine = "a".repeat(200);
    const multiLine = longFirstLine + "\nignored";
    const result = buildCompletionNotificationCommand(multiLine);
    strictEqual(result.length, 80);
    ok(result.endsWith("\u2026"), `expected ellipsis suffix, got: ${result}`);
    ok(!result.endsWith("\u2026\u2026"), `expected single ellipsis suffix, got: ${result}`);
  });
  test("strips escape artifacts from the first line", () => {
    strictEqual(buildCompletionNotificationCommand('echo \\"hi\\"\necho ignored'), 'echo "hi"\u2026');
  });
  test("result renders as inline code when wrapped with appendEscapedMarkdownInlineCode", () => {
    const opts = { gfm: true, breaks: true };
    const render = (value) => marked.parser(marked.lexer(value, opts), opts);
    const multilineCommand = "rm -rf .playwright-cli/\n\nmore text";
    const label = appendEscapedMarkdownInlineCode(buildCompletionNotificationCommand(multilineCommand)) + " completed";
    const html = render(label);
    ok(html.includes("<code>"), `expected a code span, got: ${html}`);
    ok(!/<p>`/.test(html), `expected no literal leading backtick, got: ${html}`);
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXHRlcm1pbmFsQ29udHJpYlxcY2hhdEFnZW50VG9vbHNcXHRlc3RcXGJyb3dzZXJcXHJ1bkluVGVybWluYWxIZWxwZXJzLnRlc3QudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgeyBkZWVwU3RyaWN0RXF1YWwsIG9rLCBzdHJpY3RFcXVhbCB9IGZyb20gJ2Fzc2VydCc7XG5pbXBvcnQgeyBTZXBhcmF0b3IgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9hY3Rpb25zLmpzJztcbmltcG9ydCAqIGFzIG1hcmtlZCBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9tYXJrZWQvbWFya2VkLmpzJztcbmltcG9ydCB7IGFwcGVuZEVzY2FwZWRNYXJrZG93bklubGluZUNvZGUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9odG1sQ29udGVudC5qcyc7XG5pbXBvcnQgeyBnZW5lcmF0ZUF1dG9BcHByb3ZlQWN0aW9ucywgVFJVTkNBVElPTl9NRVNTQUdFLCBkZWR1cGVSdWxlcywgaXNQb3dlclNoZWxsLCB0cnVuY2F0ZU91dHB1dEtlZXBpbmdUYWlsLCBleHRyYWN0Q2RQcmVmaXgsIG5vcm1hbGl6ZVRlcm1pbmFsQ29tbWFuZEZvckRpc3BsYXksIG5vcm1hbGl6ZUNvbW1hbmRGb3JFeGVjdXRpb24sIGlzTXVsdGlsaW5lQ29tbWFuZCwgYnVpbGRDb21tYW5kRGlzcGxheVRleHQgfSBmcm9tICcuLi8uLi9icm93c2VyL3J1bkluVGVybWluYWxIZWxwZXJzLmpzJztcbmltcG9ydCB7IGJ1aWxkQ29tcGxldGlvbk5vdGlmaWNhdGlvbkNvbW1hbmQgfSBmcm9tICcuLi8uLi9icm93c2VyL3Rvb2xzL3J1bkluVGVybWluYWxUb29sLmpzJztcbmltcG9ydCB7IE9wZXJhdGluZ1N5c3RlbSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3BsYXRmb3JtLmpzJztcbmltcG9ydCB7IGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvdGVzdC9jb21tb24vdXRpbHMuanMnO1xuaW1wb3J0IHsgQ29uZmlndXJhdGlvblRhcmdldCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbmZpZ3VyYXRpb24vY29tbW9uL2NvbmZpZ3VyYXRpb24uanMnO1xuaW1wb3J0IHR5cGUgeyBJQ29tbWFuZEFwcHJvdmFsUmVzdWx0V2l0aFJlYXNvbiB9IGZyb20gJy4uLy4uL2Jyb3dzZXIvdG9vbHMvY29tbWFuZExpbmVBbmFseXplci9hdXRvQXBwcm92ZS9jb21tYW5kTGluZUF1dG9BcHByb3Zlci5qcyc7XG5pbXBvcnQgeyBpc0F1dG9BcHByb3ZlUnVsZSwgdHlwZSBJQXV0b0FwcHJvdmVSdWxlIH0gZnJvbSAnLi4vLi4vYnJvd3Nlci90b29scy9jb21tYW5kTGluZUFuYWx5emVyL2NvbW1hbmRMaW5lQW5hbHl6ZXIuanMnO1xuXG5zdWl0ZSgnaXNQb3dlclNoZWxsJywgKCkgPT4ge1xuXHRlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUoKTtcblxuXHRzdWl0ZSgnUG93ZXJTaGVsbCBleGVjdXRhYmxlcycsICgpID0+IHtcblx0XHR0ZXN0KCdzaG91bGQgZGV0ZWN0IHBvd2Vyc2hlbGwuZXhlJywgKCkgPT4ge1xuXHRcdFx0b2soaXNQb3dlclNoZWxsKCdwb3dlcnNoZWxsLmV4ZScsIE9wZXJhdGluZ1N5c3RlbS5XaW5kb3dzKSk7XG5cdFx0XHRvayhpc1Bvd2VyU2hlbGwoJ3Bvd2Vyc2hlbGwnLCBPcGVyYXRpbmdTeXN0ZW0uTGludXgpKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3Nob3VsZCBkZXRlY3QgcHdzaC5leGUnLCAoKSA9PiB7XG5cdFx0XHRvayhpc1Bvd2VyU2hlbGwoJ3B3c2guZXhlJywgT3BlcmF0aW5nU3lzdGVtLldpbmRvd3MpKTtcblx0XHRcdG9rKGlzUG93ZXJTaGVsbCgncHdzaCcsIE9wZXJhdGluZ1N5c3RlbS5MaW51eCkpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnc2hvdWxkIGRldGVjdCBwb3dlcnNoZWxsLXByZXZpZXcnLCAoKSA9PiB7XG5cdFx0XHRvayhpc1Bvd2VyU2hlbGwoJ3Bvd2Vyc2hlbGwtcHJldmlldy5leGUnLCBPcGVyYXRpbmdTeXN0ZW0uV2luZG93cykpO1xuXHRcdFx0b2soaXNQb3dlclNoZWxsKCdwb3dlcnNoZWxsLXByZXZpZXcnLCBPcGVyYXRpbmdTeXN0ZW0uTGludXgpKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3Nob3VsZCBkZXRlY3QgcHdzaC1wcmV2aWV3JywgKCkgPT4ge1xuXHRcdFx0b2soaXNQb3dlclNoZWxsKCdwd3NoLXByZXZpZXcuZXhlJywgT3BlcmF0aW5nU3lzdGVtLldpbmRvd3MpKTtcblx0XHRcdG9rKGlzUG93ZXJTaGVsbCgncHdzaC1wcmV2aWV3JywgT3BlcmF0aW5nU3lzdGVtLkxpbnV4KSk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHN1aXRlKCdQb3dlclNoZWxsIHdpdGggZnVsbCBwYXRocycsICgpID0+IHtcblx0XHR0ZXN0KCdzaG91bGQgZGV0ZWN0IFdpbmRvd3MgUG93ZXJTaGVsbCB3aXRoIGZ1bGwgcGF0aCcsICgpID0+IHtcblx0XHRcdG9rKGlzUG93ZXJTaGVsbCgnQzpcXFxcV2luZG93c1xcXFxTeXN0ZW0zMlxcXFxXaW5kb3dzUG93ZXJTaGVsbFxcXFx2MS4wXFxcXHBvd2Vyc2hlbGwuZXhlJywgT3BlcmF0aW5nU3lzdGVtLldpbmRvd3MpKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3Nob3VsZCBkZXRlY3QgUG93ZXJTaGVsbCBDb3JlIHdpdGggZnVsbCBwYXRoJywgKCkgPT4ge1xuXHRcdFx0b2soaXNQb3dlclNoZWxsKCdDOlxcXFxQcm9ncmFtIEZpbGVzXFxcXFBvd2VyU2hlbGxcXFxcN1xcXFxwd3NoLmV4ZScsIE9wZXJhdGluZ1N5c3RlbS5XaW5kb3dzKSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdzaG91bGQgZGV0ZWN0IFBvd2VyU2hlbGwgb24gTGludXgvbWFjT1Mgd2l0aCBmdWxsIHBhdGgnLCAoKSA9PiB7XG5cdFx0XHRvayhpc1Bvd2VyU2hlbGwoJy91c3IvYmluL3B3c2gnLCBPcGVyYXRpbmdTeXN0ZW0uTGludXgpKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3Nob3VsZCBkZXRlY3QgUG93ZXJTaGVsbCBwcmV2aWV3IHdpdGggZnVsbCBwYXRoJywgKCkgPT4ge1xuXHRcdFx0b2soaXNQb3dlclNoZWxsKCcvb3B0L21pY3Jvc29mdC9wb3dlcnNoZWxsLzctcHJldmlldy9wd3NoLXByZXZpZXcnLCBPcGVyYXRpbmdTeXN0ZW0uTGludXgpKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3Nob3VsZCBkZXRlY3QgbmVzdGVkIHBhdGggd2l0aCBwb3dlcnNoZWxsJywgKCkgPT4ge1xuXHRcdFx0b2soaXNQb3dlclNoZWxsKCcvc29tZS9kZWVwL3BhdGgvdG8vcG93ZXJzaGVsbC5leGUnLCBPcGVyYXRpbmdTeXN0ZW0uV2luZG93cykpO1xuXHRcdH0pO1xuXHR9KTtcblxuXHRzdWl0ZSgnQ2FzZSBzZW5zaXRpdml0eScsICgpID0+IHtcblx0XHR0ZXN0KCdzaG91bGQgZGV0ZWN0IFBvd2VyU2hlbGwgcmVnYXJkbGVzcyBvZiBjYXNlJywgKCkgPT4ge1xuXHRcdFx0b2soaXNQb3dlclNoZWxsKCdQb3dlclNoZWxsLmV4ZScsIE9wZXJhdGluZ1N5c3RlbS5XaW5kb3dzKSk7XG5cdFx0XHRvayhpc1Bvd2VyU2hlbGwoJ1BPV0VSU0hFTEwuRVhFJywgT3BlcmF0aW5nU3lzdGVtLldpbmRvd3MpKTtcblx0XHRcdG9rKGlzUG93ZXJTaGVsbCgnUHdzaC5leGUnLCBPcGVyYXRpbmdTeXN0ZW0uV2luZG93cykpO1xuXHRcdH0pO1xuXHR9KTtcblxuXHRzdWl0ZSgnTm9uLVBvd2VyU2hlbGwgc2hlbGxzJywgKCkgPT4ge1xuXHRcdHRlc3QoJ3Nob3VsZCBub3QgZGV0ZWN0IGJhc2gnLCAoKSA9PiB7XG5cdFx0XHRvayghaXNQb3dlclNoZWxsKCdiYXNoJywgT3BlcmF0aW5nU3lzdGVtLkxpbnV4KSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdzaG91bGQgbm90IGRldGVjdCB6c2gnLCAoKSA9PiB7XG5cdFx0XHRvayghaXNQb3dlclNoZWxsKCd6c2gnLCBPcGVyYXRpbmdTeXN0ZW0uTGludXgpKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3Nob3VsZCBub3QgZGV0ZWN0IHNoJywgKCkgPT4ge1xuXHRcdFx0b2soIWlzUG93ZXJTaGVsbCgnc2gnLCBPcGVyYXRpbmdTeXN0ZW0uTGludXgpKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3Nob3VsZCBub3QgZGV0ZWN0IGZpc2gnLCAoKSA9PiB7XG5cdFx0XHRvayghaXNQb3dlclNoZWxsKCdmaXNoJywgT3BlcmF0aW5nU3lzdGVtLkxpbnV4KSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdzaG91bGQgbm90IGRldGVjdCBjbWQuZXhlJywgKCkgPT4ge1xuXHRcdFx0b2soIWlzUG93ZXJTaGVsbCgnY21kLmV4ZScsIE9wZXJhdGluZ1N5c3RlbS5XaW5kb3dzKSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdzaG91bGQgbm90IGRldGVjdCBjb21tYW5kLmNvbScsICgpID0+IHtcblx0XHRcdG9rKCFpc1Bvd2VyU2hlbGwoJ2NvbW1hbmQuY29tJywgT3BlcmF0aW5nU3lzdGVtLldpbmRvd3MpKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3Nob3VsZCBub3QgZGV0ZWN0IGRhc2gnLCAoKSA9PiB7XG5cdFx0XHRvayghaXNQb3dlclNoZWxsKCdkYXNoJywgT3BlcmF0aW5nU3lzdGVtLkxpbnV4KSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdzaG91bGQgbm90IGRldGVjdCB0Y3NoJywgKCkgPT4ge1xuXHRcdFx0b2soIWlzUG93ZXJTaGVsbCgndGNzaCcsIE9wZXJhdGluZ1N5c3RlbS5MaW51eCkpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnc2hvdWxkIG5vdCBkZXRlY3QgY3NoJywgKCkgPT4ge1xuXHRcdFx0b2soIWlzUG93ZXJTaGVsbCgnY3NoJywgT3BlcmF0aW5nU3lzdGVtLkxpbnV4KSk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHN1aXRlKCdOb24tUG93ZXJTaGVsbCBzaGVsbHMgd2l0aCBmdWxsIHBhdGhzJywgKCkgPT4ge1xuXHRcdHRlc3QoJ3Nob3VsZCBub3QgZGV0ZWN0IGJhc2ggd2l0aCBmdWxsIHBhdGgnLCAoKSA9PiB7XG5cdFx0XHRvayghaXNQb3dlclNoZWxsKCcvYmluL2Jhc2gnLCBPcGVyYXRpbmdTeXN0ZW0uTGludXgpKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3Nob3VsZCBub3QgZGV0ZWN0IHpzaCB3aXRoIGZ1bGwgcGF0aCcsICgpID0+IHtcblx0XHRcdG9rKCFpc1Bvd2VyU2hlbGwoJy91c3IvYmluL3pzaCcsIE9wZXJhdGluZ1N5c3RlbS5MaW51eCkpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnc2hvdWxkIG5vdCBkZXRlY3QgY21kLmV4ZSB3aXRoIGZ1bGwgcGF0aCcsICgpID0+IHtcblx0XHRcdG9rKCFpc1Bvd2VyU2hlbGwoJ0M6XFxcXFdpbmRvd3NcXFxcU3lzdGVtMzJcXFxcY21kLmV4ZScsIE9wZXJhdGluZ1N5c3RlbS5XaW5kb3dzKSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdzaG91bGQgbm90IGRldGVjdCBnaXQgYmFzaCcsICgpID0+IHtcblx0XHRcdG9rKCFpc1Bvd2VyU2hlbGwoJ0M6XFxcXFByb2dyYW0gRmlsZXNcXFxcR2l0XFxcXGJpblxcXFxiYXNoLmV4ZScsIE9wZXJhdGluZ1N5c3RlbS5XaW5kb3dzKSk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHN1aXRlKCdFZGdlIGNhc2VzJywgKCkgPT4ge1xuXHRcdHRlc3QoJ3Nob3VsZCBoYW5kbGUgZW1wdHkgc3RyaW5nJywgKCkgPT4ge1xuXHRcdFx0b2soIWlzUG93ZXJTaGVsbCgnJywgT3BlcmF0aW5nU3lzdGVtLldpbmRvd3MpKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3Nob3VsZCBoYW5kbGUgcGF0aHMgd2l0aCBzcGFjZXMnLCAoKSA9PiB7XG5cdFx0XHRvayhpc1Bvd2VyU2hlbGwoJ0M6XFxcXFByb2dyYW0gRmlsZXNcXFxcUG93ZXJTaGVsbFxcXFw3XFxcXHB3c2guZXhlJywgT3BlcmF0aW5nU3lzdGVtLldpbmRvd3MpKTtcblx0XHRcdG9rKCFpc1Bvd2VyU2hlbGwoJ0M6XFxcXFByb2dyYW0gRmlsZXNcXFxcR2l0XFxcXGJpblxcXFxiYXNoLmV4ZScsIE9wZXJhdGluZ1N5c3RlbS5XaW5kb3dzKSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdzaG91bGQgbm90IG1hdGNoIHBhcnRpYWwgc3RyaW5ncycsICgpID0+IHtcblx0XHRcdG9rKCFpc1Bvd2VyU2hlbGwoJ25vdHBvd2Vyc2hlbGwnLCBPcGVyYXRpbmdTeXN0ZW0uTGludXgpKTtcblx0XHRcdG9rKCFpc1Bvd2VyU2hlbGwoJ3Bvd2Vyc2hlbGxpc2gnLCBPcGVyYXRpbmdTeXN0ZW0uTGludXgpKTtcblx0XHRcdG9rKCFpc1Bvd2VyU2hlbGwoJ215cHdzaCcsIE9wZXJhdGluZ1N5c3RlbS5MaW51eCkpO1xuXHRcdFx0b2soIWlzUG93ZXJTaGVsbCgncHdzaGVsbCcsIE9wZXJhdGluZ1N5c3RlbS5MaW51eCkpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnc2hvdWxkIGhhbmRsZSBzdHJpbmdzIGNvbnRhaW5pbmcgcG93ZXJzaGVsbCBidXQgbm90IGFzIGJhc2VuYW1lJywgKCkgPT4ge1xuXHRcdFx0b2soIWlzUG93ZXJTaGVsbCgnL3Bvd2Vyc2hlbGwvYmluL2Jhc2gnLCBPcGVyYXRpbmdTeXN0ZW0uTGludXgpKTtcblx0XHRcdG9rKCFpc1Bvd2VyU2hlbGwoJy91c3IvcHdzaC9iaW4venNoJywgT3BlcmF0aW5nU3lzdGVtLkxpbnV4KSk7XG5cdFx0XHRvayghaXNQb3dlclNoZWxsKCdDOlxcXFxwb3dlcnNoZWxsXFxcXGNtZC5leGUnLCBPcGVyYXRpbmdTeXN0ZW0uV2luZG93cykpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnc2hvdWxkIGhhbmRsZSBzcGVjaWFsIGNoYXJhY3RlcnMgaW4gcGF0aCcsICgpID0+IHtcblx0XHRcdG9rKGlzUG93ZXJTaGVsbCgnL3BhdGgvd2l0aC1kYXNoZXMvcHdzaC5leGUnLCBPcGVyYXRpbmdTeXN0ZW0uV2luZG93cykpO1xuXHRcdFx0b2soaXNQb3dlclNoZWxsKCcvcGF0aC93aXRoX3VuZGVyc2NvcmVzL3Bvd2Vyc2hlbGwnLCBPcGVyYXRpbmdTeXN0ZW0uTGludXgpKTtcblx0XHRcdG9rKGlzUG93ZXJTaGVsbCgnQzpcXFxccGF0aFxcXFx3aXRoIHNwYWNlc1xcXFxwd3NoLmV4ZScsIE9wZXJhdGluZ1N5c3RlbS5XaW5kb3dzKSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdzaG91bGQgaGFuZGxlIHJlbGF0aXZlIHBhdGhzJywgKCkgPT4ge1xuXHRcdFx0b2soaXNQb3dlclNoZWxsKCcuL3Bvd2Vyc2hlbGwuZXhlJywgT3BlcmF0aW5nU3lzdGVtLldpbmRvd3MpKTtcblx0XHRcdG9rKGlzUG93ZXJTaGVsbCgnLi4vYmluL3B3c2gnLCBPcGVyYXRpbmdTeXN0ZW0uTGludXgpKTtcblx0XHRcdG9rKGlzUG93ZXJTaGVsbCgnYmluL3Bvd2Vyc2hlbGwnLCBPcGVyYXRpbmdTeXN0ZW0uTGludXgpKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3Nob3VsZCBub3QgbWF0Y2ggc2ltaWxhciBuYW1lZCB0b29scycsICgpID0+IHtcblx0XHRcdG9rKCFpc1Bvd2VyU2hlbGwoJ3Bvd2VydG9vbCcsIE9wZXJhdGluZ1N5c3RlbS5MaW51eCkpO1xuXHRcdFx0b2soIWlzUG93ZXJTaGVsbCgnc2hlbGwnLCBPcGVyYXRpbmdTeXN0ZW0uTGludXgpKTtcblx0XHRcdG9rKCFpc1Bvd2VyU2hlbGwoJ3Bvd2VyJywgT3BlcmF0aW5nU3lzdGVtLkxpbnV4KSk7XG5cdFx0XHRvayghaXNQb3dlclNoZWxsKCdwd3NoY29uZmlnJywgT3BlcmF0aW5nU3lzdGVtLkxpbnV4KSk7XG5cdFx0fSk7XG5cdH0pO1xufSk7XG5cbnN1aXRlKCdkZWR1cGVSdWxlcycsICgpID0+IHtcblx0ZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlKCk7XG5cblx0ZnVuY3Rpb24gY3JlYXRlTW9ja1J1bGUoc291cmNlVGV4dDogc3RyaW5nKTogSUF1dG9BcHByb3ZlUnVsZSB7XG5cdFx0cmV0dXJuIHtcblx0XHRcdHJlZ2V4OiBuZXcgUmVnRXhwKHNvdXJjZVRleHQpLFxuXHRcdFx0cmVnZXhDYXNlSW5zZW5zaXRpdmU6IG5ldyBSZWdFeHAoc291cmNlVGV4dCwgJ2knKSxcblx0XHRcdHNvdXJjZVRleHQsXG5cdFx0XHRzb3VyY2VUYXJnZXQ6IENvbmZpZ3VyYXRpb25UYXJnZXQuVVNFUixcblx0XHRcdGlzRGVmYXVsdFJ1bGU6IGZhbHNlXG5cdFx0fTtcblx0fVxuXG5cdGZ1bmN0aW9uIGNyZWF0ZU1vY2tSZXN1bHQocmVzdWx0OiAnYXBwcm92ZWQnIHwgJ2RlbmllZCcgfCAnbm9NYXRjaCcsIHJlYXNvbjogc3RyaW5nLCBydWxlPzogSUF1dG9BcHByb3ZlUnVsZSk6IElDb21tYW5kQXBwcm92YWxSZXN1bHRXaXRoUmVhc29uIHtcblx0XHRyZXR1cm4ge1xuXHRcdFx0cmVzdWx0LFxuXHRcdFx0cmVhc29uLFxuXHRcdFx0cnVsZVxuXHRcdH07XG5cdH1cblxuXHRmdW5jdGlvbiBnZXRTb3VyY2VUZXh0KHJlc3VsdDogSUNvbW1hbmRBcHByb3ZhbFJlc3VsdFdpdGhSZWFzb24pOiBzdHJpbmcgfCB1bmRlZmluZWQge1xuXHRcdHJldHVybiBpc0F1dG9BcHByb3ZlUnVsZShyZXN1bHQucnVsZSkgPyByZXN1bHQucnVsZS5zb3VyY2VUZXh0IDogdW5kZWZpbmVkO1xuXHR9XG5cblx0dGVzdCgnc2hvdWxkIHJldHVybiBlbXB0eSBhcnJheSBmb3IgZW1wdHkgaW5wdXQnLCAoKSA9PiB7XG5cdFx0Y29uc3QgcmVzdWx0ID0gZGVkdXBlUnVsZXMoW10pO1xuXHRcdHN0cmljdEVxdWFsKHJlc3VsdC5sZW5ndGgsIDApO1xuXHR9KTtcblxuXHR0ZXN0KCdzaG91bGQgcmV0dXJuIHNhbWUgYXJyYXkgd2hlbiBubyBkdXBsaWNhdGVzIGV4aXN0JywgKCkgPT4ge1xuXHRcdGNvbnN0IHJlc3VsdCA9IGRlZHVwZVJ1bGVzKFtcblx0XHRcdGNyZWF0ZU1vY2tSZXN1bHQoJ2FwcHJvdmVkJywgJ2FwcHJvdmVkIGJ5IGVjaG8gcnVsZScsIGNyZWF0ZU1vY2tSdWxlKCdlY2hvJykpLFxuXHRcdFx0Y3JlYXRlTW9ja1Jlc3VsdCgnYXBwcm92ZWQnLCAnYXBwcm92ZWQgYnkgbHMgcnVsZScsIGNyZWF0ZU1vY2tSdWxlKCdscycpKVxuXHRcdF0pO1xuXHRcdHN0cmljdEVxdWFsKHJlc3VsdC5sZW5ndGgsIDIpO1xuXHRcdHN0cmljdEVxdWFsKGdldFNvdXJjZVRleHQocmVzdWx0WzBdKSwgJ2VjaG8nKTtcblx0XHRzdHJpY3RFcXVhbChnZXRTb3VyY2VUZXh0KHJlc3VsdFsxXSksICdscycpO1xuXHR9KTtcblxuXHR0ZXN0KCdzaG91bGQgZGVkdXBsaWNhdGUgcnVsZXMgd2l0aCBzYW1lIHNvdXJjZVRleHQnLCAoKSA9PiB7XG5cdFx0Y29uc3QgcmVzdWx0ID0gZGVkdXBlUnVsZXMoW1xuXHRcdFx0Y3JlYXRlTW9ja1Jlc3VsdCgnYXBwcm92ZWQnLCAnYXBwcm92ZWQgYnkgZWNobyBydWxlJywgY3JlYXRlTW9ja1J1bGUoJ2VjaG8nKSksXG5cdFx0XHRjcmVhdGVNb2NrUmVzdWx0KCdhcHByb3ZlZCcsICdhcHByb3ZlZCBieSBlY2hvIHJ1bGUgYWdhaW4nLCBjcmVhdGVNb2NrUnVsZSgnZWNobycpKSxcblx0XHRcdGNyZWF0ZU1vY2tSZXN1bHQoJ2FwcHJvdmVkJywgJ2FwcHJvdmVkIGJ5IGxzIHJ1bGUnLCBjcmVhdGVNb2NrUnVsZSgnbHMnKSlcblx0XHRdKTtcblx0XHRzdHJpY3RFcXVhbChyZXN1bHQubGVuZ3RoLCAyKTtcblx0XHRzdHJpY3RFcXVhbChnZXRTb3VyY2VUZXh0KHJlc3VsdFswXSksICdlY2hvJyk7XG5cdFx0c3RyaWN0RXF1YWwoZ2V0U291cmNlVGV4dChyZXN1bHRbMV0pLCAnbHMnKTtcblx0fSk7XG5cblx0dGVzdCgnc2hvdWxkIHByZXNlcnZlIGZpcnN0IG9jY3VycmVuY2Ugd2hlbiBkZWR1cGxpY2F0aW5nJywgKCkgPT4ge1xuXHRcdGNvbnN0IHJlc3VsdCA9IGRlZHVwZVJ1bGVzKFtcblx0XHRcdGNyZWF0ZU1vY2tSZXN1bHQoJ2FwcHJvdmVkJywgJ2ZpcnN0IGVjaG8gcnVsZScsIGNyZWF0ZU1vY2tSdWxlKCdlY2hvJykpLFxuXHRcdFx0Y3JlYXRlTW9ja1Jlc3VsdCgnYXBwcm92ZWQnLCAnc2Vjb25kIGVjaG8gcnVsZScsIGNyZWF0ZU1vY2tSdWxlKCdlY2hvJykpXG5cdFx0XSk7XG5cdFx0c3RyaWN0RXF1YWwocmVzdWx0Lmxlbmd0aCwgMSk7XG5cdFx0c3RyaWN0RXF1YWwocmVzdWx0WzBdLnJlYXNvbiwgJ2ZpcnN0IGVjaG8gcnVsZScpO1xuXHR9KTtcblxuXHR0ZXN0KCdzaG91bGQgZmlsdGVyIG91dCByZXN1bHRzIHdpdGhvdXQgcnVsZXMnLCAoKSA9PiB7XG5cdFx0Y29uc3QgcmVzdWx0ID0gZGVkdXBlUnVsZXMoW1xuXHRcdFx0Y3JlYXRlTW9ja1Jlc3VsdCgnbm9NYXRjaCcsICdubyBydWxlIGFwcGxpZWQnKSxcblx0XHRcdGNyZWF0ZU1vY2tSZXN1bHQoJ2FwcHJvdmVkJywgJ2FwcHJvdmVkIGJ5IGVjaG8gcnVsZScsIGNyZWF0ZU1vY2tSdWxlKCdlY2hvJykpLFxuXHRcdFx0Y3JlYXRlTW9ja1Jlc3VsdCgnZGVuaWVkJywgJ2RlbmllZCB3aXRob3V0IHJ1bGUnKVxuXHRcdF0pO1xuXHRcdHN0cmljdEVxdWFsKHJlc3VsdC5sZW5ndGgsIDEpO1xuXHRcdHN0cmljdEVxdWFsKGdldFNvdXJjZVRleHQocmVzdWx0WzBdKSwgJ2VjaG8nKTtcblx0fSk7XG5cblx0dGVzdCgnc2hvdWxkIGhhbmRsZSBtaXggb2YgcnVsZXMgYW5kIG5vLXJ1bGUgcmVzdWx0cyB3aXRoIGR1cGxpY2F0ZXMnLCAoKSA9PiB7XG5cdFx0Y29uc3QgcmVzdWx0ID0gZGVkdXBlUnVsZXMoW1xuXHRcdFx0Y3JlYXRlTW9ja1Jlc3VsdCgnYXBwcm92ZWQnLCAnYXBwcm92ZWQgYnkgZWNobyBydWxlJywgY3JlYXRlTW9ja1J1bGUoJ2VjaG8nKSksXG5cdFx0XHRjcmVhdGVNb2NrUmVzdWx0KCdub01hdGNoJywgJ25vIHJ1bGUgYXBwbGllZCcpLFxuXHRcdFx0Y3JlYXRlTW9ja1Jlc3VsdCgnYXBwcm92ZWQnLCAnYXBwcm92ZWQgYnkgZWNobyBydWxlIGFnYWluJywgY3JlYXRlTW9ja1J1bGUoJ2VjaG8nKSksXG5cdFx0XHRjcmVhdGVNb2NrUmVzdWx0KCdhcHByb3ZlZCcsICdhcHByb3ZlZCBieSBscyBydWxlJywgY3JlYXRlTW9ja1J1bGUoJ2xzJykpLFxuXHRcdFx0Y3JlYXRlTW9ja1Jlc3VsdCgnZGVuaWVkJywgJ2RlbmllZCB3aXRob3V0IHJ1bGUnKVxuXHRcdF0pO1xuXHRcdHN0cmljdEVxdWFsKHJlc3VsdC5sZW5ndGgsIDIpO1xuXHRcdHN0cmljdEVxdWFsKGdldFNvdXJjZVRleHQocmVzdWx0WzBdKSwgJ2VjaG8nKTtcblx0XHRzdHJpY3RFcXVhbChnZXRTb3VyY2VUZXh0KHJlc3VsdFsxXSksICdscycpO1xuXHR9KTtcblxuXHR0ZXN0KCdzaG91bGQgaGFuZGxlIG11bHRpcGxlIGR1cGxpY2F0ZXMgb2Ygc2FtZSBydWxlJywgKCkgPT4ge1xuXHRcdGNvbnN0IHJlc3VsdCA9IGRlZHVwZVJ1bGVzKFtcblx0XHRcdGNyZWF0ZU1vY2tSZXN1bHQoJ2FwcHJvdmVkJywgJ25wbSBydWxlIDEnLCBjcmVhdGVNb2NrUnVsZSgnbnBtJykpLFxuXHRcdFx0Y3JlYXRlTW9ja1Jlc3VsdCgnYXBwcm92ZWQnLCAnbnBtIHJ1bGUgMicsIGNyZWF0ZU1vY2tSdWxlKCducG0nKSksXG5cdFx0XHRjcmVhdGVNb2NrUmVzdWx0KCdhcHByb3ZlZCcsICducG0gcnVsZSAzJywgY3JlYXRlTW9ja1J1bGUoJ25wbScpKSxcblx0XHRcdGNyZWF0ZU1vY2tSZXN1bHQoJ2FwcHJvdmVkJywgJ2dpdCBydWxlJywgY3JlYXRlTW9ja1J1bGUoJ2dpdCcpKVxuXHRcdF0pO1xuXHRcdHN0cmljdEVxdWFsKHJlc3VsdC5sZW5ndGgsIDIpO1xuXHRcdHN0cmljdEVxdWFsKGdldFNvdXJjZVRleHQocmVzdWx0WzBdKSwgJ25wbScpO1xuXHRcdHN0cmljdEVxdWFsKHJlc3VsdFswXS5yZWFzb24sICducG0gcnVsZSAxJyk7XG5cdFx0c3RyaWN0RXF1YWwoZ2V0U291cmNlVGV4dChyZXN1bHRbMV0pLCAnZ2l0Jyk7XG5cdH0pO1xufSk7XG5cbnN1aXRlKCd0cnVuY2F0ZU91dHB1dEtlZXBpbmdUYWlsJywgKCkgPT4ge1xuXHRlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUoKTtcblx0dGVzdCgncmV0dXJucyBvcmlnaW5hbCB3aGVuIGJlbG93IGxpbWl0JywgKCkgPT4ge1xuXHRcdGNvbnN0IG91dHB1dCA9ICdzaG9ydCBvdXRwdXQnO1xuXHRcdHN0cmljdEVxdWFsKHRydW5jYXRlT3V0cHV0S2VlcGluZ1RhaWwob3V0cHV0LCAxMDApLCBvdXRwdXQpO1xuXHR9KTtcblxuXHR0ZXN0KCdrZWVwcyB0YWlsIGFuZCBhZGRzIG1lc3NhZ2Ugd2hlbiBhYm92ZSBsaW1pdCcsICgpID0+IHtcblx0XHRjb25zdCBvdXRwdXQgPSAnYScucmVwZWF0KDIwMCk7XG5cdFx0Y29uc3QgcmVzdWx0ID0gdHJ1bmNhdGVPdXRwdXRLZWVwaW5nVGFpbChvdXRwdXQsIDEyMCk7XG5cdFx0b2socmVzdWx0LnN0YXJ0c1dpdGgoVFJVTkNBVElPTl9NRVNTQUdFKSk7XG5cdFx0c3RyaWN0RXF1YWwocmVzdWx0Lmxlbmd0aCwgMTIwKTtcblx0fSk7XG5cblx0dGVzdCgnZ3JhY2VmdWxseSBoYW5kbGVzIHRpbnkgbGltaXRzJywgKCkgPT4ge1xuXHRcdGNvbnN0IHJlc3VsdCA9IHRydW5jYXRlT3V0cHV0S2VlcGluZ1RhaWwoJ2V4YW1wbGUnLCA1KTtcblx0XHRzdHJpY3RFcXVhbChyZXN1bHQubGVuZ3RoLCA1KTtcblx0fSk7XG59KTtcblxuc3VpdGUoJ25vcm1hbGl6ZVRlcm1pbmFsQ29tbWFuZEZvckRpc3BsYXknLCAoKSA9PiB7XG5cdGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSgpO1xuXG5cdHRlc3QoJ3JlbW92ZXMgZXNjYXBlZCBzaW5nbGUgYW5kIGRvdWJsZSBxdW90ZXMnLCAoKSA9PiB7XG5cdFx0Y29uc3QgaW5wdXQgPSAnZ2l0IHJldi1wYXJzZSBcXFxcXFwnc3Rhc2hAezB9XFxcXFxcJyAmJiBlY2hvIFxcXFxcXFwiZG9uZVxcXFxcXFwiJztcblx0XHRzdHJpY3RFcXVhbChub3JtYWxpemVUZXJtaW5hbENvbW1hbmRGb3JEaXNwbGF5KGlucHV0KSwgJ2dpdCByZXYtcGFyc2UgXFwnc3Rhc2hAezB9XFwnICYmIGVjaG8gXCJkb25lXCInKTtcblx0fSk7XG5cblx0dGVzdCgnbm9ybWFsaXplcyBlc2NhcGVkIGZvcndhcmQgc2xhc2hlcycsICgpID0+IHtcblx0XHRjb25zdCBpbnB1dCA9ICdlY2hvIFxcXFwvVXNlcnNcXFxcL21lXFxcXC9wcm9qZWN0Jztcblx0XHRzdHJpY3RFcXVhbChub3JtYWxpemVUZXJtaW5hbENvbW1hbmRGb3JEaXNwbGF5KGlucHV0KSwgJ2VjaG8gL1VzZXJzL21lL3Byb2plY3QnKTtcblx0fSk7XG5cblx0dGVzdCgncHJlc2VydmVzIG5vbi1xdW90ZSBlc2NhcGVzJywgKCkgPT4ge1xuXHRcdGNvbnN0IGlucHV0ID0gJ2VjaG8gcGF0aFxcXFwgd2l0aFxcXFwgc3BhY2VzJztcblx0XHRzdHJpY3RFcXVhbChub3JtYWxpemVUZXJtaW5hbENvbW1hbmRGb3JEaXNwbGF5KGlucHV0KSwgaW5wdXQpO1xuXHR9KTtcbn0pO1xuXG5zdWl0ZSgnZ2VuZXJhdGVBdXRvQXBwcm92ZUFjdGlvbnMnLCAoKSA9PiB7XG5cdGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSgpO1xuXG5cdGZ1bmN0aW9uIGNyZWF0ZU1vY2tSdWxlKHNvdXJjZVRleHQ6IHN0cmluZyk6IElBdXRvQXBwcm92ZVJ1bGUge1xuXHRcdC8vIEVzY2FwZSBzcGVjaWFsIHJlZ2V4IGNoYXJhY3RlcnMgZm9yIHRlc3QgcHVycG9zZXMgdG8gcHJldmVudCByZWdleCBlcnJvcnNcblx0XHRjb25zdCBlc2NhcGVkVGV4dCA9IHNvdXJjZVRleHQucmVwbGFjZSgvWy4qKz9eJHt9KCl8W1xcXVxcXFxdL2csICdcXFxcJCYnKTtcblx0XHRyZXR1cm4ge1xuXHRcdFx0cmVnZXg6IG5ldyBSZWdFeHAoZXNjYXBlZFRleHQpLFxuXHRcdFx0cmVnZXhDYXNlSW5zZW5zaXRpdmU6IG5ldyBSZWdFeHAoZXNjYXBlZFRleHQsICdpJyksXG5cdFx0XHRzb3VyY2VUZXh0LFxuXHRcdFx0c291cmNlVGFyZ2V0OiBDb25maWd1cmF0aW9uVGFyZ2V0LlVTRVIsXG5cdFx0XHRpc0RlZmF1bHRSdWxlOiBmYWxzZVxuXHRcdH07XG5cdH1cblxuXHRmdW5jdGlvbiBjcmVhdGVNb2NrUmVzdWx0KHJlc3VsdDogJ2FwcHJvdmVkJyB8ICdkZW5pZWQnIHwgJ25vTWF0Y2gnLCByZWFzb246IHN0cmluZywgcnVsZT86IElBdXRvQXBwcm92ZVJ1bGUpOiBJQ29tbWFuZEFwcHJvdmFsUmVzdWx0V2l0aFJlYXNvbiB7XG5cdFx0cmV0dXJuIHtcblx0XHRcdHJlc3VsdCxcblx0XHRcdHJlYXNvbixcblx0XHRcdHJ1bGVcblx0XHR9O1xuXHR9XG5cblx0dGVzdCgnc2hvdWxkIHN1Z2dlc3QgbXZuIHRlc3Qgd2hlbiBjb21tYW5kIGlzIG12biB0ZXN0JywgKCkgPT4ge1xuXHRcdGNvbnN0IGNvbW1hbmRMaW5lID0gJ212biB0ZXN0Jztcblx0XHRjb25zdCBzdWJDb21tYW5kcyA9IFsnbXZuIHRlc3QnXTtcblx0XHRjb25zdCBhdXRvQXBwcm92ZVJlc3VsdCA9IHtcblx0XHRcdHN1YkNvbW1hbmRSZXN1bHRzOiBbY3JlYXRlTW9ja1Jlc3VsdCgnbm9NYXRjaCcsICdub3QgYXBwcm92ZWQnKV0sXG5cdFx0XHRjb21tYW5kTGluZVJlc3VsdDogY3JlYXRlTW9ja1Jlc3VsdCgnbm9NYXRjaCcsICdub3QgYXBwcm92ZWQnKVxuXHRcdH07XG5cblx0XHRjb25zdCBhY3Rpb25zID0gZ2VuZXJhdGVBdXRvQXBwcm92ZUFjdGlvbnMoY29tbWFuZExpbmUsIHN1YkNvbW1hbmRzLCBhdXRvQXBwcm92ZVJlc3VsdCk7XG5cdFx0Y29uc3Qgc3ViQ29tbWFuZEFjdGlvbiA9IGFjdGlvbnMuZmluZChhY3Rpb24gPT4gYWN0aW9uLmxhYmVsLmluY2x1ZGVzKCdtdm4gdGVzdCcpKTtcblx0XHRvayhzdWJDb21tYW5kQWN0aW9uLCAnU2hvdWxkIHN1Z2dlc3QgbXZuIHRlc3QgYXBwcm92YWwnKTtcblx0fSk7XG5cblx0dGVzdCgnc2hvdWxkIHN1Z2dlc3QgbXZuIC1Ec2tpcElUIHRlc3Qgd2hlbiBmbGFncyBhcHBlYXIgYmVmb3JlIHN1YmNvbW1hbmQnLCAoKSA9PiB7XG5cdFx0Y29uc3QgY29tbWFuZExpbmUgPSAnbXZuIC1Ec2tpcElUIHRlc3QnO1xuXHRcdGNvbnN0IHN1YkNvbW1hbmRzID0gWydtdm4gLURza2lwSVQgdGVzdCddO1xuXHRcdGNvbnN0IGF1dG9BcHByb3ZlUmVzdWx0ID0ge1xuXHRcdFx0c3ViQ29tbWFuZFJlc3VsdHM6IFtjcmVhdGVNb2NrUmVzdWx0KCdub01hdGNoJywgJ25vdCBhcHByb3ZlZCcpXSxcblx0XHRcdGNvbW1hbmRMaW5lUmVzdWx0OiBjcmVhdGVNb2NrUmVzdWx0KCdub01hdGNoJywgJ25vdCBhcHByb3ZlZCcpXG5cdFx0fTtcblxuXHRcdGNvbnN0IGFjdGlvbnMgPSBnZW5lcmF0ZUF1dG9BcHByb3ZlQWN0aW9ucyhjb21tYW5kTGluZSwgc3ViQ29tbWFuZHMsIGF1dG9BcHByb3ZlUmVzdWx0KTtcblx0XHRjb25zdCBzdWJDb21tYW5kQWN0aW9uID0gYWN0aW9ucy5maW5kKGFjdGlvbiA9PiBhY3Rpb24ubGFiZWwuaW5jbHVkZXMoJ212biAtRHNraXBJVCB0ZXN0JykpO1xuXHRcdG9rKHN1YkNvbW1hbmRBY3Rpb24sICdTaG91bGQgc3VnZ2VzdCBtdm4gLURza2lwSVQgdGVzdCBhcHByb3ZhbCAoaW5jbHVkaW5nIGZsYWdzKScpO1xuXHR9KTtcblxuXHR0ZXN0KCdzaG91bGQgc3VnZ2VzdCBtdm4gLVggLURza2lwSVQgdGVzdCB3aGVuIG11bHRpcGxlIGZsYWdzIGFwcGVhciBiZWZvcmUgc3ViY29tbWFuZCcsICgpID0+IHtcblx0XHRjb25zdCBjb21tYW5kTGluZSA9ICdtdm4gLVggLURza2lwSVQgdGVzdCc7XG5cdFx0Y29uc3Qgc3ViQ29tbWFuZHMgPSBbJ212biAtWCAtRHNraXBJVCB0ZXN0J107XG5cdFx0Y29uc3QgYXV0b0FwcHJvdmVSZXN1bHQgPSB7XG5cdFx0XHRzdWJDb21tYW5kUmVzdWx0czogW2NyZWF0ZU1vY2tSZXN1bHQoJ25vTWF0Y2gnLCAnbm90IGFwcHJvdmVkJyldLFxuXHRcdFx0Y29tbWFuZExpbmVSZXN1bHQ6IGNyZWF0ZU1vY2tSZXN1bHQoJ25vTWF0Y2gnLCAnbm90IGFwcHJvdmVkJylcblx0XHR9O1xuXG5cdFx0Y29uc3QgYWN0aW9ucyA9IGdlbmVyYXRlQXV0b0FwcHJvdmVBY3Rpb25zKGNvbW1hbmRMaW5lLCBzdWJDb21tYW5kcywgYXV0b0FwcHJvdmVSZXN1bHQpO1xuXHRcdGNvbnN0IHN1YkNvbW1hbmRBY3Rpb24gPSBhY3Rpb25zLmZpbmQoYWN0aW9uID0+IGFjdGlvbi5sYWJlbC5pbmNsdWRlcygnbXZuIC1YIC1Ec2tpcElUIHRlc3QnKSk7XG5cdFx0b2soc3ViQ29tbWFuZEFjdGlvbiwgJ1Nob3VsZCBzdWdnZXN0IG12biAtWCAtRHNraXBJVCB0ZXN0IGFwcHJvdmFsIHdpdGggbXVsdGlwbGUgZmxhZ3MnKTtcblx0fSk7XG5cblx0dGVzdCgnc2hvdWxkIHN1Z2dlc3QgZ3JhZGxlIC0taW5mbyBidWlsZCB3aGVuIGZsYWdzIGFwcGVhciBiZWZvcmUgc3ViY29tbWFuZCcsICgpID0+IHtcblx0XHRjb25zdCBjb21tYW5kTGluZSA9ICdncmFkbGUgLS1pbmZvIGJ1aWxkJztcblx0XHRjb25zdCBzdWJDb21tYW5kcyA9IFsnZ3JhZGxlIC0taW5mbyBidWlsZCddO1xuXHRcdGNvbnN0IGF1dG9BcHByb3ZlUmVzdWx0ID0ge1xuXHRcdFx0c3ViQ29tbWFuZFJlc3VsdHM6IFtjcmVhdGVNb2NrUmVzdWx0KCdub01hdGNoJywgJ25vdCBhcHByb3ZlZCcpXSxcblx0XHRcdGNvbW1hbmRMaW5lUmVzdWx0OiBjcmVhdGVNb2NrUmVzdWx0KCdub01hdGNoJywgJ25vdCBhcHByb3ZlZCcpXG5cdFx0fTtcblxuXHRcdGNvbnN0IGFjdGlvbnMgPSBnZW5lcmF0ZUF1dG9BcHByb3ZlQWN0aW9ucyhjb21tYW5kTGluZSwgc3ViQ29tbWFuZHMsIGF1dG9BcHByb3ZlUmVzdWx0KTtcblx0XHRjb25zdCBzdWJDb21tYW5kQWN0aW9uID0gYWN0aW9ucy5maW5kKGFjdGlvbiA9PiBhY3Rpb24ubGFiZWwuaW5jbHVkZXMoJ2dyYWRsZSAtLWluZm8gYnVpbGQnKSk7XG5cdFx0b2soc3ViQ29tbWFuZEFjdGlvbiwgJ1Nob3VsZCBzdWdnZXN0IGdyYWRsZSAtLWluZm8gYnVpbGQgYXBwcm92YWwnKTtcblx0fSk7XG5cblx0dGVzdCgnc2hvdWxkIHN1Z2dlc3QgbnBtIC0tc2lsZW50IHJ1biB0ZXN0IHdoZW4gZmxhZ3MgYXBwZWFyIGJlZm9yZSBzdWJjb21tYW5kJywgKCkgPT4ge1xuXHRcdGNvbnN0IGNvbW1hbmRMaW5lID0gJ25wbSAtLXNpbGVudCBydW4gdGVzdCc7XG5cdFx0Y29uc3Qgc3ViQ29tbWFuZHMgPSBbJ25wbSAtLXNpbGVudCBydW4gdGVzdCddO1xuXHRcdGNvbnN0IGF1dG9BcHByb3ZlUmVzdWx0ID0ge1xuXHRcdFx0c3ViQ29tbWFuZFJlc3VsdHM6IFtjcmVhdGVNb2NrUmVzdWx0KCdub01hdGNoJywgJ25vdCBhcHByb3ZlZCcpXSxcblx0XHRcdGNvbW1hbmRMaW5lUmVzdWx0OiBjcmVhdGVNb2NrUmVzdWx0KCdub01hdGNoJywgJ25vdCBhcHByb3ZlZCcpXG5cdFx0fTtcblxuXHRcdGNvbnN0IGFjdGlvbnMgPSBnZW5lcmF0ZUF1dG9BcHByb3ZlQWN0aW9ucyhjb21tYW5kTGluZSwgc3ViQ29tbWFuZHMsIGF1dG9BcHByb3ZlUmVzdWx0KTtcblx0XHRjb25zdCBzdWJDb21tYW5kQWN0aW9uID0gYWN0aW9ucy5maW5kKGFjdGlvbiA9PiBhY3Rpb24ubGFiZWwuaW5jbHVkZXMoJ25wbSAtLXNpbGVudCBydW4gdGVzdCcpKTtcblx0XHRvayhzdWJDb21tYW5kQWN0aW9uLCAnU2hvdWxkIHN1Z2dlc3QgbnBtIC0tc2lsZW50IHJ1biB0ZXN0IGFwcHJvdmFsIChzdWItc3ViLWNvbW1hbmQgd2l0aCBmbGFncyknKTtcblx0fSk7XG5cblx0dGVzdCgnc2hvdWxkIHN1Z2dlc3QgbnBtIC0tc2lsZW50IHJ1biAtLXZlcmJvc2UgdGVzdCB3aGVuIGZsYWdzIGFwcGVhciBiZXR3ZWVuIHN1YmNvbW1hbmRzJywgKCkgPT4ge1xuXHRcdGNvbnN0IGNvbW1hbmRMaW5lID0gJ25wbSAtLXNpbGVudCBydW4gLS12ZXJib3NlIHRlc3QnO1xuXHRcdGNvbnN0IHN1YkNvbW1hbmRzID0gWyducG0gLS1zaWxlbnQgcnVuIC0tdmVyYm9zZSB0ZXN0J107XG5cdFx0Y29uc3QgYXV0b0FwcHJvdmVSZXN1bHQgPSB7XG5cdFx0XHRzdWJDb21tYW5kUmVzdWx0czogW2NyZWF0ZU1vY2tSZXN1bHQoJ25vTWF0Y2gnLCAnbm90IGFwcHJvdmVkJyldLFxuXHRcdFx0Y29tbWFuZExpbmVSZXN1bHQ6IGNyZWF0ZU1vY2tSZXN1bHQoJ25vTWF0Y2gnLCAnbm90IGFwcHJvdmVkJylcblx0XHR9O1xuXG5cdFx0Y29uc3QgYWN0aW9ucyA9IGdlbmVyYXRlQXV0b0FwcHJvdmVBY3Rpb25zKGNvbW1hbmRMaW5lLCBzdWJDb21tYW5kcywgYXV0b0FwcHJvdmVSZXN1bHQpO1xuXHRcdGNvbnN0IHN1YkNvbW1hbmRBY3Rpb24gPSBhY3Rpb25zLmZpbmQoYWN0aW9uID0+IGFjdGlvbi5sYWJlbC5pbmNsdWRlcygnbnBtIC0tc2lsZW50IHJ1biAtLXZlcmJvc2UgdGVzdCcpKTtcblx0XHRvayhzdWJDb21tYW5kQWN0aW9uLCAnU2hvdWxkIHN1Z2dlc3QgbnBtIC0tc2lsZW50IHJ1biAtLXZlcmJvc2UgdGVzdCB3aXRoIGZsYWdzIGJldHdlZW4gc3ViY29tbWFuZHMnKTtcblx0fSk7XG5cblx0dGVzdCgnc2hvdWxkIG5vdCBzdWdnZXN0IGFwcHJvdmFsIHdoZW4gb25seSBmbGFncyBhbmQgbm8gc3ViY29tbWFuZCcsICgpID0+IHtcblx0XHRjb25zdCBjb21tYW5kTGluZSA9ICdtdm4gLVggLURza2lwSVQnO1xuXHRcdGNvbnN0IHN1YkNvbW1hbmRzID0gWydtdm4gLVggLURza2lwSVQnXTtcblx0XHRjb25zdCBhdXRvQXBwcm92ZVJlc3VsdCA9IHtcblx0XHRcdHN1YkNvbW1hbmRSZXN1bHRzOiBbY3JlYXRlTW9ja1Jlc3VsdCgnbm9NYXRjaCcsICdub3QgYXBwcm92ZWQnKV0sXG5cdFx0XHRjb21tYW5kTGluZVJlc3VsdDogY3JlYXRlTW9ja1Jlc3VsdCgnbm9NYXRjaCcsICdub3QgYXBwcm92ZWQnKVxuXHRcdH07XG5cblx0XHRjb25zdCBhY3Rpb25zID0gZ2VuZXJhdGVBdXRvQXBwcm92ZUFjdGlvbnMoY29tbWFuZExpbmUsIHN1YkNvbW1hbmRzLCBhdXRvQXBwcm92ZVJlc3VsdCk7XG5cdFx0Y29uc3Qgc3ViQ29tbWFuZEFjdGlvbiA9IGFjdGlvbnMuZmluZChhY3Rpb24gPT4gYWN0aW9uLmxhYmVsLmluY2x1ZGVzKCdBbHdheXMgQWxsb3cgQ29tbWFuZDonKSAmJiBhY3Rpb24ubGFiZWwuaW5jbHVkZXMoJ212bicpKTtcblx0XHRzdHJpY3RFcXVhbChzdWJDb21tYW5kQWN0aW9uLCB1bmRlZmluZWQsICdTaG91bGQgbm90IHN1Z2dlc3QgbXZuIGFwcHJvdmFsIHdoZW4gbm8gc3ViY29tbWFuZCBmb3VuZCcpO1xuXHR9KTtcblxuXHR0ZXN0KCdzaG91bGQgc3VnZ2VzdCBleGFjdCBjb21tYW5kIGxpbmUgd2hlbiBzdWJjb21tYW5kIGNhbm5vdCBiZSBleHRyYWN0ZWQnLCAoKSA9PiB7XG5cdFx0Y29uc3QgY29tbWFuZExpbmUgPSAnbXZuIC1YIC1Ec2tpcElUJztcblx0XHRjb25zdCBzdWJDb21tYW5kcyA9IFsnbXZuIC1YIC1Ec2tpcElUJ107XG5cdFx0Y29uc3QgYXV0b0FwcHJvdmVSZXN1bHQgPSB7XG5cdFx0XHRzdWJDb21tYW5kUmVzdWx0czogW2NyZWF0ZU1vY2tSZXN1bHQoJ25vTWF0Y2gnLCAnbm90IGFwcHJvdmVkJyldLFxuXHRcdFx0Y29tbWFuZExpbmVSZXN1bHQ6IGNyZWF0ZU1vY2tSZXN1bHQoJ25vTWF0Y2gnLCAnbm90IGFwcHJvdmVkJylcblx0XHR9O1xuXG5cdFx0Y29uc3QgYWN0aW9ucyA9IGdlbmVyYXRlQXV0b0FwcHJvdmVBY3Rpb25zKGNvbW1hbmRMaW5lLCBzdWJDb21tYW5kcywgYXV0b0FwcHJvdmVSZXN1bHQpO1xuXHRcdGNvbnN0IGV4YWN0Q29tbWFuZEFjdGlvbiA9IGFjdGlvbnMuZmluZChhY3Rpb24gPT4gYWN0aW9uLmxhYmVsLmluY2x1ZGVzKCdBbHdheXMgQWxsb3cgRXhhY3QgQ29tbWFuZCBMaW5lJykpO1xuXHRcdG9rKGV4YWN0Q29tbWFuZEFjdGlvbiwgJ1Nob3VsZCBzdWdnZXN0IGV4YWN0IGNvbW1hbmQgbGluZSBhcHByb3ZhbCcpO1xuXHR9KTtcblxuXHR0ZXN0KCdzaG91bGQgaGFuZGxlIG11bHRpcGxlIHN1YmNvbW1hbmRzIHdpdGggZmxhZ3MnLCAoKSA9PiB7XG5cdFx0Y29uc3QgY29tbWFuZExpbmUgPSAnbXZuIC1Ec2tpcElUIHRlc3QgJiYgZ3JhZGxlIC0taW5mbyBidWlsZCc7XG5cdFx0Y29uc3Qgc3ViQ29tbWFuZHMgPSBbJ212biAtRHNraXBJVCB0ZXN0JywgJ2dyYWRsZSAtLWluZm8gYnVpbGQnXTtcblx0XHRjb25zdCBhdXRvQXBwcm92ZVJlc3VsdCA9IHtcblx0XHRcdHN1YkNvbW1hbmRSZXN1bHRzOiBbXG5cdFx0XHRcdGNyZWF0ZU1vY2tSZXN1bHQoJ25vTWF0Y2gnLCAnbm90IGFwcHJvdmVkJyksXG5cdFx0XHRcdGNyZWF0ZU1vY2tSZXN1bHQoJ25vTWF0Y2gnLCAnbm90IGFwcHJvdmVkJylcblx0XHRcdF0sXG5cdFx0XHRjb21tYW5kTGluZVJlc3VsdDogY3JlYXRlTW9ja1Jlc3VsdCgnbm9NYXRjaCcsICdub3QgYXBwcm92ZWQnKVxuXHRcdH07XG5cblx0XHRjb25zdCBhY3Rpb25zID0gZ2VuZXJhdGVBdXRvQXBwcm92ZUFjdGlvbnMoY29tbWFuZExpbmUsIHN1YkNvbW1hbmRzLCBhdXRvQXBwcm92ZVJlc3VsdCk7XG5cdFx0Y29uc3Qgc3ViQ29tbWFuZEFjdGlvbiA9IGFjdGlvbnMuZmluZChhY3Rpb24gPT5cblx0XHRcdGFjdGlvbi5sYWJlbC5pbmNsdWRlcygnbXZuIC1Ec2tpcElUIHRlc3QnKSAmJiBhY3Rpb24ubGFiZWwuaW5jbHVkZXMoJ2dyYWRsZSAtLWluZm8gYnVpbGQnKVxuXHRcdCk7XG5cdFx0b2soc3ViQ29tbWFuZEFjdGlvbiwgJ1Nob3VsZCBzdWdnZXN0IGJvdGggbXZuIC1Ec2tpcElUIHRlc3QgYW5kIGdyYWRsZSAtLWluZm8gYnVpbGQnKTtcblx0fSk7XG5cblx0dGVzdCgnc2hvdWxkIG5vdCBzdWdnZXN0IHdoZW4gY29tbWFuZHMgYXJlIGRlbmllZCcsICgpID0+IHtcblx0XHRjb25zdCBjb21tYW5kTGluZSA9ICdtdm4gLURza2lwSVQgdGVzdCc7XG5cdFx0Y29uc3Qgc3ViQ29tbWFuZHMgPSBbJ212biAtRHNraXBJVCB0ZXN0J107XG5cdFx0Y29uc3QgYXV0b0FwcHJvdmVSZXN1bHQgPSB7XG5cdFx0XHRzdWJDb21tYW5kUmVzdWx0czogW2NyZWF0ZU1vY2tSZXN1bHQoJ2RlbmllZCcsICdkZW5pZWQgYnkgcnVsZScsIGNyZWF0ZU1vY2tSdWxlKCdtdm4gdGVzdCcpKV0sXG5cdFx0XHRjb21tYW5kTGluZVJlc3VsdDogY3JlYXRlTW9ja1Jlc3VsdCgnbm9NYXRjaCcsICdub3QgYXBwcm92ZWQnKVxuXHRcdH07XG5cblx0XHRjb25zdCBhY3Rpb25zID0gZ2VuZXJhdGVBdXRvQXBwcm92ZUFjdGlvbnMoY29tbWFuZExpbmUsIHN1YkNvbW1hbmRzLCBhdXRvQXBwcm92ZVJlc3VsdCk7XG5cdFx0Y29uc3Qgc3ViQ29tbWFuZEFjdGlvbiA9IGFjdGlvbnMuZmluZChhY3Rpb24gPT4gYWN0aW9uLmxhYmVsLmluY2x1ZGVzKCdBbHdheXMgQWxsb3cgQ29tbWFuZDonKSk7XG5cdFx0c3RyaWN0RXF1YWwoc3ViQ29tbWFuZEFjdGlvbiwgdW5kZWZpbmVkLCAnU2hvdWxkIG5vdCBzdWdnZXN0IGFwcHJvdmFsIGZvciBkZW5pZWQgY29tbWFuZHMnKTtcblx0fSk7XG5cblx0dGVzdCgnc2hvdWxkIG5vdCBzdWdnZXN0IHdoZW4gY29tbWFuZHMgYXJlIGFscmVhZHkgYXBwcm92ZWQnLCAoKSA9PiB7XG5cdFx0Y29uc3QgY29tbWFuZExpbmUgPSAnbXZuIC1Ec2tpcElUIHRlc3QnO1xuXHRcdGNvbnN0IHN1YkNvbW1hbmRzID0gWydtdm4gLURza2lwSVQgdGVzdCddO1xuXHRcdGNvbnN0IGF1dG9BcHByb3ZlUmVzdWx0ID0ge1xuXHRcdFx0c3ViQ29tbWFuZFJlc3VsdHM6IFtjcmVhdGVNb2NrUmVzdWx0KCdhcHByb3ZlZCcsICdhcHByb3ZlZCBieSBydWxlJywgY3JlYXRlTW9ja1J1bGUoJ212biB0ZXN0JykpXSxcblx0XHRcdGNvbW1hbmRMaW5lUmVzdWx0OiBjcmVhdGVNb2NrUmVzdWx0KCdub01hdGNoJywgJ25vdCBhcHByb3ZlZCcpXG5cdFx0fTtcblxuXHRcdGNvbnN0IGFjdGlvbnMgPSBnZW5lcmF0ZUF1dG9BcHByb3ZlQWN0aW9ucyhjb21tYW5kTGluZSwgc3ViQ29tbWFuZHMsIGF1dG9BcHByb3ZlUmVzdWx0KTtcblx0XHRjb25zdCBzdWJDb21tYW5kQWN0aW9uID0gYWN0aW9ucy5maW5kKGFjdGlvbiA9PiBhY3Rpb24ubGFiZWwuaW5jbHVkZXMoJ212biAtRHNraXBJVCB0ZXN0JykgJiYgYWN0aW9uLmxhYmVsLmluY2x1ZGVzKCdBbHdheXMgQWxsb3cgQ29tbWFuZDonKSk7XG5cdFx0c3RyaWN0RXF1YWwoc3ViQ29tbWFuZEFjdGlvbiwgdW5kZWZpbmVkLCAnU2hvdWxkIG5vdCBzdWdnZXN0IGFwcHJvdmFsIGZvciBhbHJlYWR5IGFwcHJvdmVkIGNvbW1hbmRzJyk7XG5cdH0pO1xuXG5cdHRlc3QoJ3Nob3VsZCBub3QgaW5jbHVkZSBzZXNzaW9uLXNjb3BlZCBhY3Rpb25zIHdoZW4gc2tpcFNlc3Npb25TY29wZWQgaXMgc2V0JywgKCkgPT4ge1xuXHRcdGNvbnN0IGNvbW1hbmRMaW5lID0gJ212biB0ZXN0Jztcblx0XHRjb25zdCBzdWJDb21tYW5kcyA9IFsnbXZuIHRlc3QnXTtcblx0XHRjb25zdCBhdXRvQXBwcm92ZVJlc3VsdCA9IHtcblx0XHRcdHN1YkNvbW1hbmRSZXN1bHRzOiBbY3JlYXRlTW9ja1Jlc3VsdCgnbm9NYXRjaCcsICdub3QgYXBwcm92ZWQnKV0sXG5cdFx0XHRjb21tYW5kTGluZVJlc3VsdDogY3JlYXRlTW9ja1Jlc3VsdCgnbm9NYXRjaCcsICdub3QgYXBwcm92ZWQnKVxuXHRcdH07XG5cblx0XHRjb25zdCBhY3Rpb25zID0gZ2VuZXJhdGVBdXRvQXBwcm92ZUFjdGlvbnMoY29tbWFuZExpbmUsIHN1YkNvbW1hbmRzLCBhdXRvQXBwcm92ZVJlc3VsdCwgeyBza2lwU2Vzc2lvblNjb3BlZDogdHJ1ZSB9KTtcblx0XHRkZWVwU3RyaWN0RXF1YWwoYWN0aW9ucy5tYXAoYWN0aW9uID0+IGFjdGlvbiBpbnN0YW5jZW9mIFNlcGFyYXRvciA/ICctLS0nIDogYWN0aW9uLmxhYmVsKSwgW1xuXHRcdFx0J0FsbG93IGBtdm4gdGVzdCBcdTIwMjZgIGluIHRoaXMgV29ya3NwYWNlJyxcblx0XHRcdCdBbHdheXMgQWxsb3cgYG12biB0ZXN0IFx1MjAyNmAnLFxuXHRcdFx0Jy0tLScsXG5cdFx0XHQnQWxsb3cgRXhhY3QgQ29tbWFuZCBMaW5lIGluIHRoaXMgV29ya3NwYWNlJyxcblx0XHRcdCdBbHdheXMgQWxsb3cgRXhhY3QgQ29tbWFuZCBMaW5lJyxcblx0XHRcdCctLS0nLFxuXHRcdFx0J0NvbmZpZ3VyZSBBdXRvIEFwcHJvdmUuLi4nLFxuXHRcdF0pO1xuXHR9KTtcbn0pO1xuXG5zdWl0ZSgnZXh0cmFjdENkUHJlZml4JywgKCkgPT4ge1xuXHRlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUoKTtcblxuXHRzdWl0ZSgnUG9zaXgnLCAoKSA9PiB7XG5cdFx0ZnVuY3Rpb24gdChjb21tYW5kTGluZTogc3RyaW5nLCBleHBlY3RlZERpcjogc3RyaW5nIHwgdW5kZWZpbmVkLCBleHBlY3RlZENvbW1hbmQ6IHN0cmluZyB8IHVuZGVmaW5lZCkge1xuXHRcdFx0Y29uc3QgcmVzdWx0ID0gZXh0cmFjdENkUHJlZml4KGNvbW1hbmRMaW5lLCAnYmFzaCcsIE9wZXJhdGluZ1N5c3RlbS5MaW51eCk7XG5cdFx0XHRzdHJpY3RFcXVhbChyZXN1bHQ/LmRpcmVjdG9yeSwgZXhwZWN0ZWREaXIpO1xuXHRcdFx0c3RyaWN0RXF1YWwocmVzdWx0Py5jb21tYW5kLCBleHBlY3RlZENvbW1hbmQpO1xuXHRcdH1cblxuXHRcdHRlc3QoJ3Nob3VsZCByZXR1cm4gdW5kZWZpbmVkIHdoZW4gbm8gY2QgcHJlZml4JywgKCkgPT4gdCgnZWNobyBoZWxsbycsIHVuZGVmaW5lZCwgdW5kZWZpbmVkKSk7XG5cdFx0dGVzdCgnc2hvdWxkIHJldHVybiB1bmRlZmluZWQgd2hlbiBjZCBoYXMgbm8gc3VmZml4JywgKCkgPT4gdCgnY2QgL3NvbWUvcGF0aCcsIHVuZGVmaW5lZCwgdW5kZWZpbmVkKSk7XG5cdFx0dGVzdCgnc2hvdWxkIGV4dHJhY3QgY2QgcHJlZml4IHdpdGggJiYgc2VwYXJhdG9yJywgKCkgPT4gdCgnY2QgL3NvbWUvcGF0aCAmJiBucG0gaW5zdGFsbCcsICcvc29tZS9wYXRoJywgJ25wbSBpbnN0YWxsJykpO1xuXHRcdHRlc3QoJ3Nob3VsZCBleHRyYWN0IHF1b3RlZCBwYXRoJywgKCkgPT4gdCgnY2QgXCIvc29tZS9wYXRoXCIgJiYgbnBtIGluc3RhbGwnLCAnL3NvbWUvcGF0aCcsICducG0gaW5zdGFsbCcpKTtcblx0XHR0ZXN0KCdzaG91bGQgZXh0cmFjdCBjb21wbGV4IHN1ZmZpeCcsICgpID0+IHQoJ2NkIC9wYXRoICYmIG5wbSBpbnN0YWxsICYmIG5wbSB0ZXN0JywgJy9wYXRoJywgJ25wbSBpbnN0YWxsICYmIG5wbSB0ZXN0JykpO1xuXG5cdFx0c3VpdGUoJ3Vuc3VwcG9ydGVkIHBhdHRlcm5zJywgKCkgPT4ge1xuXHRcdFx0dGVzdCgnc2hvdWxkIHJldHVybiB1bmRlZmluZWQgZm9yIHBhdGggd2l0aCBlc2NhcGVkIHNwYWNlJywgKCkgPT4gdCgnY2QgL3NvbWUvcGF0aFxcIHdpdGhcXCBzcGFjZXMgJiYgbnBtIGluc3RhbGwnLCB1bmRlZmluZWQsIHVuZGVmaW5lZCkpO1xuXHRcdH0pO1xuXHR9KTtcblxuXHRzdWl0ZSgnUG93ZXJTaGVsbCcsICgpID0+IHtcblx0XHRmdW5jdGlvbiB0KGNvbW1hbmRMaW5lOiBzdHJpbmcsIGV4cGVjdGVkRGlyOiBzdHJpbmcgfCB1bmRlZmluZWQsIGV4cGVjdGVkQ29tbWFuZDogc3RyaW5nIHwgdW5kZWZpbmVkKSB7XG5cdFx0XHRjb25zdCByZXN1bHQgPSBleHRyYWN0Q2RQcmVmaXgoY29tbWFuZExpbmUsICdwd3NoJywgT3BlcmF0aW5nU3lzdGVtLldpbmRvd3MpO1xuXHRcdFx0c3RyaWN0RXF1YWwocmVzdWx0Py5kaXJlY3RvcnksIGV4cGVjdGVkRGlyKTtcblx0XHRcdHN0cmljdEVxdWFsKHJlc3VsdD8uY29tbWFuZCwgZXhwZWN0ZWRDb21tYW5kKTtcblx0XHR9XG5cblx0XHR0ZXN0KCdzaG91bGQgZXh0cmFjdCBjZCB3aXRoIDsgc2VwYXJhdG9yJywgKCkgPT4gdCgnY2QgQzpcXFxccGF0aDsgbnBtIHRlc3QnLCAnQzpcXFxccGF0aCcsICducG0gdGVzdCcpKTtcblx0XHR0ZXN0KCdzaG91bGQgZXh0cmFjdCBjZCAvZCB3aXRoICYmIHNlcGFyYXRvcicsICgpID0+IHQoJ2NkIC9kIEM6XFxcXHBhdGggJiYgZWNobyBoZWxsbycsICdDOlxcXFxwYXRoJywgJ2VjaG8gaGVsbG8nKSk7XG5cdFx0dGVzdCgnc2hvdWxkIGV4dHJhY3QgU2V0LUxvY2F0aW9uJywgKCkgPT4gdCgnU2V0LUxvY2F0aW9uIEM6XFxcXHBhdGg7IG5wbSB0ZXN0JywgJ0M6XFxcXHBhdGgnLCAnbnBtIHRlc3QnKSk7XG5cdFx0dGVzdCgnc2hvdWxkIGV4dHJhY3QgU2V0LUxvY2F0aW9uIC1QYXRoJywgKCkgPT4gdCgnU2V0LUxvY2F0aW9uIC1QYXRoIEM6XFxcXHBhdGg7IG5wbSB0ZXN0JywgJ0M6XFxcXHBhdGgnLCAnbnBtIHRlc3QnKSk7XG5cblx0XHRzdWl0ZSgndW5zdXBwb3J0ZWQgcGF0dGVybnMnLCAoKSA9PiB7XG5cdFx0XHR0ZXN0KCdzaG91bGQgcmV0dXJuIHVuZGVmaW5lZCBmb3IgcXVvdGVkIHBhdGggd2l0aCBzcGFjZXMnLCAoKSA9PiB0KCdjZCBcIkM6XFxcXHBhdGggd2l0aCBzcGFjZXNcIjsgbnBtIHRlc3QnLCB1bmRlZmluZWQsIHVuZGVmaW5lZCkpO1xuXHRcdH0pO1xuXHR9KTtcbn0pO1xuXG5zdWl0ZSgnbm9ybWFsaXplQ29tbWFuZEZvckV4ZWN1dGlvbicsICgpID0+IHtcblx0ZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlKCk7XG5cblx0dGVzdCgnc2hvdWxkIGNvbGxhcHNlIG5ld2xpbmVzIHRvIHNwYWNlcyBmb3Igc2ltcGxlIGNvbW1hbmRzJywgKCkgPT4ge1xuXHRcdHN0cmljdEVxdWFsKG5vcm1hbGl6ZUNvbW1hbmRGb3JFeGVjdXRpb24oJ2VjaG8gaGVsbG9cXG5lY2hvIHdvcmxkJyksICdlY2hvIGhlbGxvIGVjaG8gd29ybGQnKTtcblx0fSk7XG5cblx0dGVzdCgnc2hvdWxkIGNvbGxhcHNlIFxcXFxyXFxcXG4gdG8gc3BhY2VzJywgKCkgPT4ge1xuXHRcdHN0cmljdEVxdWFsKG5vcm1hbGl6ZUNvbW1hbmRGb3JFeGVjdXRpb24oJ2VjaG8gYVxcclxcbmVjaG8gYicpLCAnZWNobyBhIGVjaG8gYicpO1xuXHR9KTtcblxuXHR0ZXN0KCdzaG91bGQgY29sbGFwc2UgXFxcXHIgdG8gc3BhY2VzJywgKCkgPT4ge1xuXHRcdHN0cmljdEVxdWFsKG5vcm1hbGl6ZUNvbW1hbmRGb3JFeGVjdXRpb24oJ2VjaG8gYVxccmVjaG8gYicpLCAnZWNobyBhIGVjaG8gYicpO1xuXHR9KTtcblxuXHR0ZXN0KCdzaG91bGQgdHJpbSB3aGl0ZXNwYWNlJywgKCkgPT4ge1xuXHRcdHN0cmljdEVxdWFsKG5vcm1hbGl6ZUNvbW1hbmRGb3JFeGVjdXRpb24oJyAgZWNobyBoZWxsbyAgJyksICdlY2hvIGhlbGxvJyk7XG5cdH0pO1xuXG5cdHRlc3QoJ3Nob3VsZCBoYW5kbGUgc2luZ2xlLWxpbmUgY29tbWFuZCcsICgpID0+IHtcblx0XHRzdHJpY3RFcXVhbChub3JtYWxpemVDb21tYW5kRm9yRXhlY3V0aW9uKCdscyAtbGEnKSwgJ2xzIC1sYScpO1xuXHR9KTtcbn0pO1xuXG5zdWl0ZSgnaXNNdWx0aWxpbmVDb21tYW5kJywgKCkgPT4ge1xuXHRlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUoKTtcblxuXHR0ZXN0KCdzaG91bGQgcmV0dXJuIHRydWUgZm9yIGhlcmVkb2MnLCAoKSA9PiB7XG5cdFx0c3RyaWN0RXF1YWwoaXNNdWx0aWxpbmVDb21tYW5kKCdjYXQgPiBmaWxlLnR4dCA8PCBcXCdFT0ZcXCdcXG5oZWxsbyB3b3JsZFxcbkVPRicpLCB0cnVlKTtcblx0fSk7XG5cblx0dGVzdCgnc2hvdWxkIHJldHVybiB0cnVlIGZvciBtdWx0aS1zdGF0ZW1lbnQgd2l0aCBcXFxcbicsICgpID0+IHtcblx0XHRzdHJpY3RFcXVhbChpc011bHRpbGluZUNvbW1hbmQoJ2VjaG8gaGVsbG9cXG5lY2hvIHdvcmxkJyksIHRydWUpO1xuXHR9KTtcblxuXHR0ZXN0KCdzaG91bGQgcmV0dXJuIHRydWUgZm9yIG11bHRpLXN0YXRlbWVudCB3aXRoIFxcXFxyXFxcXG4nLCAoKSA9PiB7XG5cdFx0c3RyaWN0RXF1YWwoaXNNdWx0aWxpbmVDb21tYW5kKCdlY2hvIGhlbGxvXFxyXFxuZWNobyB3b3JsZCcpLCB0cnVlKTtcblx0fSk7XG5cblx0dGVzdCgnc2hvdWxkIHJldHVybiBmYWxzZSBmb3Igc2luZ2xlLWxpbmUgY29tbWFuZCcsICgpID0+IHtcblx0XHRzdHJpY3RFcXVhbChpc011bHRpbGluZUNvbW1hbmQoJ2xzIC1sYScpLCBmYWxzZSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3Nob3VsZCByZXR1cm4gZmFsc2UgZm9yIGxpbmUgY29udGludWF0aW9uIHdpdGggYmFja3NsYXNoLW5ld2xpbmUnLCAoKSA9PiB7XG5cdFx0c3RyaWN0RXF1YWwoaXNNdWx0aWxpbmVDb21tYW5kKCdlY2hvIGhlbGxvIFxcXFxcXG4gIHdvcmxkJyksIGZhbHNlKTtcblx0fSk7XG5cblx0dGVzdCgnc2hvdWxkIHJldHVybiBmYWxzZSBmb3IgbGluZSBjb250aW51YXRpb24gd2l0aCBiYWNrc2xhc2gtY3JsZicsICgpID0+IHtcblx0XHRzdHJpY3RFcXVhbChpc011bHRpbGluZUNvbW1hbmQoJ2VjaG8gaGVsbG8gXFxcXFxcclxcbiAgd29ybGQnKSwgZmFsc2UpO1xuXHR9KTtcblxuXHR0ZXN0KCdzaG91bGQgcmV0dXJuIHRydWUgd2hlbiBjb250aW51YXRpb24gYW5kIGJhcmUgbmV3bGluZSBhcmUgbWl4ZWQnLCAoKSA9PiB7XG5cdFx0c3RyaWN0RXF1YWwoaXNNdWx0aWxpbmVDb21tYW5kKCdlY2hvIGhlbGxvIFxcXFxcXG4gIHdvcmxkXFxuZWNobyBkb25lJyksIHRydWUpO1xuXHR9KTtcbn0pO1xuXG5zdWl0ZSgnYnVpbGRDb21tYW5kRGlzcGxheVRleHQnLCAoKSA9PiB7XG5cdGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSgpO1xuXG5cdHRlc3QoJ3Nob3VsZCBjb2xsYXBzZSBuZXdsaW5lcyAoaW5jbHVkaW5nIGJsYW5rIGxpbmVzKSB0byBzcGFjZXMnLCAoKSA9PiB7XG5cdFx0c3RyaWN0RXF1YWwoYnVpbGRDb21tYW5kRGlzcGxheVRleHQoJ2VjaG8gYVxcblxcbmVjaG8gYicpLCAnZWNobyBhICBlY2hvIGInKTtcblx0XHRzdHJpY3RFcXVhbChidWlsZENvbW1hbmREaXNwbGF5VGV4dCgnZWNobyBhXFxyXFxuZWNobyBiJyksICdlY2hvIGEgZWNobyBiJyk7XG5cdH0pO1xuXG5cdHRlc3QoJ3Nob3VsZCB0cnVuY2F0ZSBsb25nIGNvbW1hbmRzIHRvIDgwIGNoYXJhY3RlcnMnLCAoKSA9PiB7XG5cdFx0Y29uc3QgbG9uZyA9ICdhJy5yZXBlYXQoMjAwKTtcblx0XHRjb25zdCByZXN1bHQgPSBidWlsZENvbW1hbmREaXNwbGF5VGV4dChsb25nKTtcblx0XHRzdHJpY3RFcXVhbChyZXN1bHQubGVuZ3RoLCA4MCk7XG5cdFx0b2socmVzdWx0LmVuZHNXaXRoKCcuLi4nKSk7XG5cdH0pO1xuXG5cdC8vIFJlZ3Jlc3Npb24gdGVzdCBmb3IgIzMxODYwMTogc3lzdGVtIG5vdGlmaWNhdGlvbiBsYWJlbHMgdXNlZCB0byB3cmFwIHRoZVxuXHQvLyByYXcgY29tbWFuZCBpbiBhIHNpbmdsZS1iYWNrdGljayBpbmxpbmUgY29kZSBzcGFuLiBNdWx0aS1saW5lIGNvbW1hbmRzXG5cdC8vICh3aGljaCBjb250YWluIGJsYW5rIGxpbmVzKSBicm9rZSB0aGUgY29kZSBzcGFuIGFuZCByZW5kZXJlZCB0aGUgbGVhZGluZ1xuXHQvLyBiYWNrdGljayBsaXRlcmFsbHkuIFRoZSBjb21tYW5kIG11c3QgYmUgY29sbGFwc2VkIHRvIGEgc2luZ2xlIGxpbmUgYW5kXG5cdC8vIHNhZmVseSBmZW5jZWQgc28gaXQgYWx3YXlzIHJlbmRlcnMgYXMgaW5saW5lIGNvZGUuXG5cdHRlc3QoJ211bHRpLWxpbmUgY29tbWFuZCByZW5kZXJzIGFzIGlubGluZSBjb2RlIChub3QgYSBsaXRlcmFsIGJhY2t0aWNrKScsICgpID0+IHtcblx0XHRjb25zdCBvcHRzOiBtYXJrZWQuTWFya2VkT3B0aW9ucyA9IHsgZ2ZtOiB0cnVlLCBicmVha3M6IHRydWUgfTtcblx0XHRjb25zdCByZW5kZXIgPSAodmFsdWU6IHN0cmluZykgPT4gbWFya2VkLnBhcnNlcihtYXJrZWQubGV4ZXIodmFsdWUsIG9wdHMpLCBvcHRzKTtcblxuXHRcdGNvbnN0IG11bHRpbGluZUNvbW1hbmQgPSAncm0gLXJmIC5wbGF5d3JpZ2h0LWNsaS9cXG5cXG5tb3JlIHRleHQnO1xuXHRcdGNvbnN0IGxhYmVsID0gYXBwZW5kRXNjYXBlZE1hcmtkb3duSW5saW5lQ29kZShidWlsZENvbW1hbmREaXNwbGF5VGV4dChtdWx0aWxpbmVDb21tYW5kKSkgKyAnIGNvbXBsZXRlZCc7XG5cdFx0Y29uc3QgaHRtbCA9IHJlbmRlcihsYWJlbCk7XG5cblx0XHRvayhodG1sLmluY2x1ZGVzKCc8Y29kZT4nKSwgYGV4cGVjdGVkIGEgY29kZSBzcGFuLCBnb3Q6ICR7aHRtbH1gKTtcblx0XHRvayghLzxwPmAvLnRlc3QoaHRtbCksIGBleHBlY3RlZCBubyBsaXRlcmFsIGxlYWRpbmcgYmFja3RpY2ssIGdvdDogJHtodG1sfWApO1xuXHR9KTtcbn0pO1xuXG5zdWl0ZSgnYnVpbGRDb21wbGV0aW9uTm90aWZpY2F0aW9uQ29tbWFuZCcsICgpID0+IHtcblx0ZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlKCk7XG5cblx0dGVzdCgnbGVhdmVzIHNpbmdsZS1saW5lIGNvbW1hbmRzIHVuY2hhbmdlZCcsICgpID0+IHtcblx0XHRzdHJpY3RFcXVhbChidWlsZENvbXBsZXRpb25Ob3RpZmljYXRpb25Db21tYW5kKCdlY2hvIGhlbGxvJyksICdlY2hvIGhlbGxvJyk7XG5cdH0pO1xuXG5cdHRlc3QoJ2tlZXBzIG9ubHkgdGhlIGZpcnN0IGxpbmUgYW5kIGFwcGVuZHMgYSBob3Jpem9udGFsIGVsbGlwc2lzIGZvciBtdWx0aS1saW5lIGNvbW1hbmRzJywgKCkgPT4ge1xuXHRcdHN0cmljdEVxdWFsKGJ1aWxkQ29tcGxldGlvbk5vdGlmaWNhdGlvbkNvbW1hbmQoJ2VjaG8gYVxcbmVjaG8gYicpLCAnZWNobyBhXHUyMDI2Jyk7XG5cdFx0c3RyaWN0RXF1YWwoYnVpbGRDb21wbGV0aW9uTm90aWZpY2F0aW9uQ29tbWFuZCgnZWNobyBhXFxuXFxuZWNobyBiJyksICdlY2hvIGFcdTIwMjYnKTtcblx0XHRzdHJpY3RFcXVhbChidWlsZENvbXBsZXRpb25Ob3RpZmljYXRpb25Db21tYW5kKCdlY2hvIGFcXHJcXG5lY2hvIGInKSwgJ2VjaG8gYVx1MjAyNicpO1xuXHRcdHN0cmljdEVxdWFsKGJ1aWxkQ29tcGxldGlvbk5vdGlmaWNhdGlvbkNvbW1hbmQoJ2VjaG8gYVxccmVjaG8gYicpLCAnZWNobyBhXHUyMDI2Jyk7XG5cdH0pO1xuXG5cdHRlc3QoJ3RydW5jYXRlcyBhIGxvbmcgZmlyc3QgbGluZSB0byA4MCBjaGFyYWN0ZXJzIHVzaW5nIGEgc2luZ2xlIGhvcml6b250YWwgZWxsaXBzaXMnLCAoKSA9PiB7XG5cdFx0Y29uc3QgbG9uZ0ZpcnN0TGluZSA9ICdhJy5yZXBlYXQoMjAwKTtcblx0XHRjb25zdCBtdWx0aUxpbmUgPSBsb25nRmlyc3RMaW5lICsgJ1xcbmlnbm9yZWQnO1xuXHRcdGNvbnN0IHJlc3VsdCA9IGJ1aWxkQ29tcGxldGlvbk5vdGlmaWNhdGlvbkNvbW1hbmQobXVsdGlMaW5lKTtcblx0XHRzdHJpY3RFcXVhbChyZXN1bHQubGVuZ3RoLCA4MCk7XG5cdFx0b2socmVzdWx0LmVuZHNXaXRoKCdcdTIwMjYnKSwgYGV4cGVjdGVkIGVsbGlwc2lzIHN1ZmZpeCwgZ290OiAke3Jlc3VsdH1gKTtcblx0XHRvayghcmVzdWx0LmVuZHNXaXRoKCdcdTIwMjZcdTIwMjYnKSwgYGV4cGVjdGVkIHNpbmdsZSBlbGxpcHNpcyBzdWZmaXgsIGdvdDogJHtyZXN1bHR9YCk7XG5cdH0pO1xuXG5cdHRlc3QoJ3N0cmlwcyBlc2NhcGUgYXJ0aWZhY3RzIGZyb20gdGhlIGZpcnN0IGxpbmUnLCAoKSA9PiB7XG5cdFx0c3RyaWN0RXF1YWwoYnVpbGRDb21wbGV0aW9uTm90aWZpY2F0aW9uQ29tbWFuZCgnZWNobyBcXFxcXCJoaVxcXFxcIlxcbmVjaG8gaWdub3JlZCcpLCAnZWNobyBcImhpXCJcdTIwMjYnKTtcblx0fSk7XG5cblx0Ly8gUmVncmVzc2lvbiB0ZXN0IGZvciAjMzE4NjAxOiB0aGUgZmluYWwgbGFiZWwgbXVzdCByZW5kZXIgYXMgaW5saW5lIGNvZGVcblx0Ly8gKG5vIGxpdGVyYWwgYmFja3RpY2tzKSB3aGVuIGZlZCB0byB0aGUgbWFya2Rvd24gcmVuZGVyZXIgd3JhcHBlZCB3aXRoXG5cdC8vIGBhcHBlbmRFc2NhcGVkTWFya2Rvd25JbmxpbmVDb2RlYC5cblx0dGVzdCgncmVzdWx0IHJlbmRlcnMgYXMgaW5saW5lIGNvZGUgd2hlbiB3cmFwcGVkIHdpdGggYXBwZW5kRXNjYXBlZE1hcmtkb3duSW5saW5lQ29kZScsICgpID0+IHtcblx0XHRjb25zdCBvcHRzOiBtYXJrZWQuTWFya2VkT3B0aW9ucyA9IHsgZ2ZtOiB0cnVlLCBicmVha3M6IHRydWUgfTtcblx0XHRjb25zdCByZW5kZXIgPSAodmFsdWU6IHN0cmluZykgPT4gbWFya2VkLnBhcnNlcihtYXJrZWQubGV4ZXIodmFsdWUsIG9wdHMpLCBvcHRzKTtcblxuXHRcdGNvbnN0IG11bHRpbGluZUNvbW1hbmQgPSAncm0gLXJmIC5wbGF5d3JpZ2h0LWNsaS9cXG5cXG5tb3JlIHRleHQnO1xuXHRcdGNvbnN0IGxhYmVsID0gYXBwZW5kRXNjYXBlZE1hcmtkb3duSW5saW5lQ29kZShidWlsZENvbXBsZXRpb25Ob3RpZmljYXRpb25Db21tYW5kKG11bHRpbGluZUNvbW1hbmQpKSArICcgY29tcGxldGVkJztcblx0XHRjb25zdCBodG1sID0gcmVuZGVyKGxhYmVsKTtcblxuXHRcdG9rKGh0bWwuaW5jbHVkZXMoJzxjb2RlPicpLCBgZXhwZWN0ZWQgYSBjb2RlIHNwYW4sIGdvdDogJHtodG1sfWApO1xuXHRcdG9rKCEvPHA+YC8udGVzdChodG1sKSwgYGV4cGVjdGVkIG5vIGxpdGVyYWwgbGVhZGluZyBiYWNrdGljaywgZ290OiAke2h0bWx9YCk7XG5cdH0pO1xufSk7XG4iXSwKICAibWFwcGluZ3MiOiAiQUFLQSxTQUFTLGlCQUFpQixJQUFJLG1CQUFtQjtBQUNqRCxTQUFTLGlCQUFpQjtBQUMxQixZQUFZLFlBQVk7QUFDeEIsU0FBUyx1Q0FBdUM7QUFDaEQsU0FBUyw0QkFBNEIsb0JBQW9CLGFBQWEsY0FBYywyQkFBMkIsaUJBQWlCLG9DQUFvQyw4QkFBOEIsb0JBQW9CLCtCQUErQjtBQUNyUCxTQUFTLDBDQUEwQztBQUNuRCxTQUFTLHVCQUF1QjtBQUNoQyxTQUFTLCtDQUErQztBQUN4RCxTQUFTLDJCQUEyQjtBQUVwQyxTQUFTLHlCQUFnRDtBQUV6RCxNQUFNLGdCQUFnQixNQUFNO0FBQzNCLDBDQUF3QztBQUV4QyxRQUFNLDBCQUEwQixNQUFNO0FBQ3JDLFNBQUssZ0NBQWdDLE1BQU07QUFDMUMsU0FBRyxhQUFhLGtCQUFrQixnQkFBZ0IsT0FBTyxDQUFDO0FBQzFE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
