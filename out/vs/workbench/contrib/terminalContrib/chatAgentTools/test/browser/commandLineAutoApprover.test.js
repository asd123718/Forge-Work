import { OperatingSystem } from "../../../../../../base/common/platform.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../../../base/test/common/utils.js";
import { TestConfigurationService } from "../../../../../../platform/configuration/test/common/testConfigurationService.js";
import { workbenchInstantiationService } from "../../../../../test/browser/workbenchTestServices.js";
import { terminalChatAgentToolsConfiguration, TerminalChatAgentToolsSettingId } from "../../common/terminalChatAgentToolsConfiguration.js";
import { ConfigurationTarget } from "../../../../../../platform/configuration/common/configuration.js";
import { deepStrictEqual, ok, strictEqual } from "assert";
import { CommandLineAutoApprover } from "../../browser/tools/commandLineAnalyzer/autoApprove/commandLineAutoApprover.js";
import { isAutoApproveRule } from "../../browser/tools/commandLineAnalyzer/commandLineAnalyzer.js";
suite("CommandLineAutoApprover", () => {
  const store = ensureNoDisposablesAreLeakedInTestSuite();
  let instantiationService;
  let configurationService;
  let commandLineAutoApprover;
  let shell;
  let os;
  setup(() => {
    configurationService = new TestConfigurationService();
    instantiationService = workbenchInstantiationService({
      configurationService: () => configurationService
    }, store);
    shell = "bash";
    os = OperatingSystem.Linux;
    commandLineAutoApprover = store.add(instantiationService.createInstance(CommandLineAutoApprover));
  });
  function setAutoApprove(value) {
    setConfig(TerminalChatAgentToolsSettingId.AutoApprove, value);
  }
  function setAutoApproveWithCommandLine(value) {
    setConfig(TerminalChatAgentToolsSettingId.AutoApprove, value);
  }
  function setConfig(key, value) {
    configurationService.setUserConfiguration(key, value);
    configurationService.onDidChangeConfigurationEmitter.fire({
      affectsConfiguration: () => true,
      affectedKeys: /* @__PURE__ */ new Set([key]),
      source: ConfigurationTarget.USER,
      change: null
    });
  }
  async function isAutoApproved(commandLine) {
    return (await commandLineAutoApprover.isCommandAutoApproved(commandLine, shell, os, void 0)).result === "approved";
  }
  function isCommandLineAutoApproved(commandLine) {
    return commandLineAutoApprover.isCommandLineAutoApproved(commandLine).result === "approved";
  }
  suite("default PowerShell rules", () => {
    setup(() => {
      shell = "pwsh";
      os = OperatingSystem.Windows;
      setAutoApproveWithCommandLine(
        terminalChatAgentToolsConfiguration[TerminalChatAgentToolsSettingId.AutoApprove].default
      );
    });
    test("auto-approves explicit safe cmdlets case-insensitively", async () => {
      const commands = [
        "Select-Object Name",
        "select-object Name",
        "Measure-Object Length",
        "Compare-Object $a $b",
        "Format-Table",
        "Sort-Object Name"
      ];
      strictEqual((await Promise.all(commands.map(isAutoApproved))).every(Boolean), true);
    });
    test("does not auto-approve arbitrary cmdlets by verb", async () => {
      const commands = [
        "Select-Custom",
        "Measure-Command",
        "Compare-Custom",
        "Format-Hex",
        "Sort-Custom"
      ];
      deepStrictEqual(await Promise.all(commands.map(isAutoApproved)), [false, false, false, false, false]);
    });
  });
  suite("default sort rules", () => {
    setup(() => {
      setAutoApproveWithCommandLine(
        terminalChatAgentToolsConfiguration[TerminalChatAgentToolsSettingId.AutoApprove].default
      );
    });
    test("auto-approves benign forms", async () => {
      const commands = [
        "sort input.txt",
        "sort --check input.txt",
        "sort --check=quiet input.txt",
        'sort "--check" input.txt',
        "sort --buffer-size=1K input.txt",
        "sort<input.txt"
      ];
      deepStrictEqual(await Promise.all(commands.map(isAutoApproved)), commands.map(() => true));
    });
    test("denies blocked options", async () => {
      const commands = [
        "sort -o output.txt input.txt",
        "sort -S 1G input.txt",
        "sort --compress-program=/bin/sh input.txt",
        "sort --compress-program /bin/sh input.txt",
        "sort --compress-prog=/bin/sh input.txt",
        "sort --compress-p=/bin/sh input.txt",
        "sort --com=/bin/sh input.txt",
        "sort --co=/bin/sh input.txt",
        'sort "--compress-program=/bin/sh" input.txt',
        "sort '--compress-prog=/bin/sh' input.txt",
        "sort \\-\\-compress-program=/bin/sh input.txt",
        "sort --compress-program\\=/bin/sh input.txt",
        'sort --"compress-program=/bin/sh" input.txt',
        "sort $'--compress-program=/bin/sh' input.txt"
      ];
      deepStrictEqual(await Promise.all(commands.map(isAutoApproved)), commands.map(() => false));
    });
  });
  suite("default sed rules", () => {
    setup(() => {
      setAutoApproveWithCommandLine(
        terminalChatAgentToolsConfiguration[TerminalChatAgentToolsSettingId.AutoApprove].default
      );
    });
    test("auto-approves benign substitutions", async () => {
      const commands = [
        'sed "s/foo/bar/g" file.txt',
        'sed -n "1,10p" file.txt',
        'sed "/err/d" file.txt',
        'sed "y/abc/xyz/" file.txt',
        'sed "s/a/b/;s/c/d/" file.txt',
        'sed "/w/d" file.txt'
      ];
      deepStrictEqual(await Promise.all(commands.map(isAutoApproved)), commands.map(() => true));
    });
    test("denies dangerous script forms", async () => {
      const commands = [
        'sed -e "s/foo/bar/"',
        'sed --expression "s/foo/bar/"',
        'sed "s/foo/bar/e"',
        'sed "s/foo/bar/w"',
        'sed "1e id > /tmp/SECURITY_TEST_pwned"',
        'sed "1w /tmp/SECURITY_TEST_pwned_file" input.txt',
        'sed "1r /etc/passwd" input.txt',
        'sed "1W /tmp/x" input.txt',
        'sed "e id"',
        'sed "s/a/b/;e id"',
        'sed "/pat/e id"',
        'sed -n "1e id" file.txt',
        "sed 1e id",
        'sed "s/a/b/; e id"',
        `sed "s/a/'/;e id"`,
        "sed /pat/e input.txt",
        'sed "1 e id"',
        'sed "1!e id"',
        'sed "1, 3 w /tmp/x" input.txt',
        'sed -l 80 "e id" input.txt',
        'sed --line-length 80 "1w /tmp/x" input.txt',
        'sed --line-length=80 "1r /etc/passwd" input.txt',
        'sed "s/a/\\"/;e id" input.txt',
        'sed "/x/p;//e id" input.txt',
        "sed e"
      ];
      deepStrictEqual(await Promise.all(commands.map(isAutoApproved)), commands.map(() => false));
    });
  });
  suite("autoApprove with allow patterns only", () => {
    test("should auto-approve exact command match", async () => {
      setAutoApprove({
        "echo": true
      });
      ok(await isAutoApproved("echo"));
    });
    test("should auto-approve command with arguments", async () => {
      setAutoApprove({
        "echo": true
      });
      ok(await isAutoApproved("echo hello world"));
    });
    test("should not auto-approve when there is no match", async () => {
      setAutoApprove({
        "echo": true
      });
      ok(!await isAutoApproved("ls"));
    });
    test("should not auto-approve partial command matches", async () => {
      setAutoApprove({
        "echo": true
      });
      ok(!await isAutoApproved("echotest"));
    });
    test("should handle multiple commands in autoApprove", async () => {
      setAutoApprove({
        "echo": true,
        "ls": true,
        "pwd": true
      });
      ok(await isAutoApproved("echo"));
      ok(await isAutoApproved("ls -la"));
      ok(await isAutoApproved("pwd"));
      ok(!await isAutoApproved("rm"));
    });
  });
  suite("autoApprove with deny patterns only", () => {
    test("should deny commands in autoApprove", async () => {
      setAutoApprove({
        "rm": false,
        "del": false
      });
      ok(!await isAutoApproved("rm file.txt"));
      ok(!await isAutoApproved("del file.txt"));
    });
    test("should not auto-approve safe commands when no allow patterns are present", async () => {
      setAutoApprove({
        "rm": false
      });
      ok(!await isAutoApproved("echo hello"));
      ok(!await isAutoApproved("ls"));
    });
  });
  suite("autoApprove with mixed allow and deny patterns", () => {
    test("should deny commands set to false even if other commands are set to true", async () => {
      setAutoApprove({
        "echo": true,
        "rm": false
      });
      ok(await isAutoApproved("echo hello"));
      ok(!await isAutoApproved("rm file.txt"));
    });
    test("should auto-approve allow patterns not set to false", async () => {
      setAutoApprove({
        "echo": true,
        "ls": true,
        "pwd": true,
        "rm": false,
        "del": false
      });
      ok(await isAutoApproved("echo"));
      ok(await isAutoApproved("ls"));
      ok(await isAutoApproved("pwd"));
      ok(!await isAutoApproved("rm"));
      ok(!await isAutoApproved("del"));
    });
  });
  suite("regex patterns", () => {
    test("should handle /.*/", async () => {
      setAutoApprove({
        "/.*/": true
      });
      ok(await isAutoApproved("echo hello"));
    });
    test("should handle regex patterns in autoApprove", async () => {
      setAutoApprove({
        "/^echo/": true,
        "/^ls/": true,
        "pwd": true
      });
      ok(await isAutoApproved("echo hello"));
      ok(await isAutoApproved("ls -la"));
      ok(await isAutoApproved("pwd"));
      ok(!await isAutoApproved("rm file"));
    });
    test("should handle regex patterns for deny", async () => {
      setAutoApprove({
        "echo": true,
        "rm": true,
        "/^rm\\s+/": false,
        "/^del\\s+/": false
      });
      ok(await isAutoApproved("echo hello"));
      ok(await isAutoApproved("rm"));
      ok(!await isAutoApproved("rm file.txt"));
      ok(!await isAutoApproved("del file.txt"));
    });
    test("should handle complex regex patterns", async () => {
      setAutoApprove({
        "/^(echo|ls|pwd)\\b/": true,
        "/^git (status|show\\b.*)$/": true,
        "/rm|del|kill/": false
      });
      ok(await isAutoApproved("echo test"));
      ok(await isAutoApproved("ls -la"));
      ok(await isAutoApproved("pwd"));
      ok(await isAutoApproved("git status"));
      ok(await isAutoApproved("git show"));
      ok(await isAutoApproved("git show HEAD"));
      ok(!await isAutoApproved("rm file"));
      ok(!await isAutoApproved("del file"));
      ok(!await isAutoApproved("kill process"));
    });
    test("should handle git patterns with -C and --no-pager", async () => {
      setAutoApprove({
        "/^git(\\s+(-C\\s+\\S+|--no-pager))*\\s+status\\b/": true,
        "/^git(\\s+(-C\\s+\\S+|--no-pager))*\\s+log\\b/": true,
        "/^git(\\s+(-C\\s+\\S+|--no-pager))*\\s+show\\b/": true,
        "/^git(\\s+(-C\\s+\\S+|--no-pager))*\\s+diff\\b/": true,
        "/^git(\\s+(-C\\s+\\S+|--no-pager))*\\s+ls-files\\b/": true,
        "/^git(\\s+(-C\\s+\\S+|--no-pager))*\\s+grep\\b/": true,
        "/^git(\\s+(-C\\s+\\S+|--no-pager))*\\s+branch\\b/": true,
        "/^git(\\s+(-C\\s+\\S+|--no-pager))*\\s+branch\\b.*-(d|D|m|M|-delete|-force)\\b/": false
      });
      ok(await isAutoApproved("git status"));
      ok(await isAutoApproved("git log"));
      ok(await isAutoApproved("git show HEAD"));
      ok(await isAutoApproved("git diff"));
      ok(await isAutoApproved("git ls-files"));
      ok(await isAutoApproved("git grep pattern"));
      ok(await isAutoApproved("git branch"));
      ok(await isAutoApproved("git ls-files --cached"));
      ok(await isAutoApproved("git -C /path ls-files"));
      ok(await isAutoApproved("git --no-pager ls-files"));
      ok(await isAutoApproved("git -C /some/path status"));
      ok(await isAutoApproved("git -C ../relative log"));
      ok(await isAutoApproved("git -C . diff"));
      ok(await isAutoApproved("git --no-pager status"));
      ok(await isAutoApproved("git --no-pager log"));
      ok(await isAutoApproved("git --no-pager diff HEAD~1"));
      ok(await isAutoApproved("git -C /path --no-pager status"));
      ok(await isAutoApproved("git --no-pager -C /path log"));
      ok(await isAutoApproved("git -C /path1 -C /path2 status"));
      ok(await isAutoApproved("git --no-pager --no-pager log"));
      ok(!await isAutoApproved("git branch -d feature"));
      ok(!await isAutoApproved("git branch -D feature"));
      ok(!await isAutoApproved("git branch --delete feature"));
      ok(!await isAutoApproved("git -C /path branch -d feature"));
      ok(!await isAutoApproved("git --no-pager branch -D feature"));
      ok(!await isAutoApproved("git -C /path --no-pager branch --force"));
      ok(!await isAutoApproved("git branch -m old new"));
      ok(!await isAutoApproved("git branch -M old new"));
      ok(!await isAutoApproved("git -C /path branch -m old new"));
    });
    suite("flags", () => {
      test("should handle case-insensitive regex patterns with i flag", async () => {
        setAutoApprove({
          "/^echo/i": true,
          "/^ls/i": true,
          "/rm|del/i": false
        });
        ok(await isAutoApproved("echo hello"));
        ok(await isAutoApproved("ECHO hello"));
        ok(await isAutoApproved("Echo hello"));
        ok(await isAutoApproved("ls -la"));
        ok(await isAutoApproved("LS -la"));
        ok(await isAutoApproved("Ls -la"));
        ok(!await isAutoApproved("rm file"));
        ok(!await isAutoApproved("RM file"));
        ok(!await isAutoApproved("del file"));
        ok(!await isAutoApproved("DEL file"));
      });
      test("should handle multiple regex flags", async () => {
        setAutoApprove({
          "/^git\\s+/gim": true,
          "/dangerous/gim": false
        });
        ok(await isAutoApproved("git status"));
        ok(await isAutoApproved("GIT status"));
        ok(await isAutoApproved("Git status"));
        ok(!await isAutoApproved("dangerous command"));
        ok(!await isAutoApproved("DANGEROUS command"));
      });
      test("should handle various regex flags", async () => {
        setAutoApprove({
          "/^echo.*/s": true,
          // dotall flag
          "/^git\\s+/i": true,
          // case-insensitive flag
          "/rm|del/g": false
          // global flag
        });
        ok(await isAutoApproved("echo hello\nworld"));
        ok(await isAutoApproved("git status"));
        ok(await isAutoApproved("GIT status"));
        ok(!await isAutoApproved("rm file"));
        ok(!await isAutoApproved("del file"));
      });
      test("should handle regex patterns without flags", async () => {
        setAutoApprove({
          "/^echo/": true,
          "/rm|del/": false
        });
        ok(await isAutoApproved("echo hello"));
        ok(!await isAutoApproved("ECHO hello"), "Should be case-sensitive without i flag");
        ok(!await isAutoApproved("rm file"));
        ok(!await isAutoApproved("RM file"), "Should be case-sensitive without i flag");
      });
    });
  });
  suite("edge cases", () => {
    test("should handle empty autoApprove", async () => {
      setAutoApprove({});
      ok(!await isAutoApproved("echo hello"));
      ok(!await isAutoApproved("ls"));
      ok(!await isAutoApproved("rm file"));
    });
    test("should handle empty command strings", async () => {
      setAutoApprove({
        "echo": true
      });
      ok(!await isAutoApproved(""));
      ok(!await isAutoApproved("   "));
    });
    test("should handle whitespace in commands", async () => {
      setAutoApprove({
        "echo": true
      });
      ok(await isAutoApproved("echo   hello   world"));
    });
    test("should be case-sensitive by default", async () => {
      setAutoApprove({
        "echo": true
      });
      ok(await isAutoApproved("echo hello"));
      ok(!await isAutoApproved("ECHO hello"));
      ok(!await isAutoApproved("Echo hello"));
    });
    test("should handle string-based values with special regex characters", async () => {
      setAutoApprove({
        "pwsh.exe -File D:\\foo.bar\\a-script.ps1": true
      });
      ok(await isAutoApproved("pwsh.exe -File D:\\foo.bar\\a-script.ps1"));
      ok(await isAutoApproved("pwsh.exe -File D:\\foo.bar\\a-script.ps1 -AnotherArg"));
    });
    test("should ignore the empty string key", async () => {
      setAutoApprove({
        "": true
      });
      ok(!await isAutoApproved("echo hello"));
    });
    test("should handle empty regex patterns that could cause endless loops", async () => {
      setAutoApprove({
        "//": true,
        "/(?:)/": true,
        "/*/": true,
        // Invalid regex pattern
        "/.**/": true
        // Invalid regex pattern
      });
      ok(!await isAutoApproved("echo hello"));
      ok(!await isAutoApproved("ls"));
      ok(!await isAutoApproved(""));
    });
    test("should handle regex patterns that would cause endless loops", async () => {
      setAutoApprove({
        "/a*/": true,
        "/b?/": true,
        "/(x|)*/": true,
        "/(?:)*/": true
      });
      ok(!await isAutoApproved("echo hello"));
      ok(!await isAutoApproved("ls"));
      ok(!await isAutoApproved("a"));
      ok(!await isAutoApproved("b"));
    });
    test("should handle mixed valid and problematic regex patterns", async () => {
      setAutoApprove({
        "/^echo/": true,
        // Valid pattern
        "//": true,
        // Empty pattern
        "/^ls/": true,
        // Valid pattern
        "/a*/": true,
        // Potential endless loop
        "pwd": true
        // Valid string pattern
      });
      ok(await isAutoApproved("echo hello"));
      ok(await isAutoApproved("ls -la"));
      ok(await isAutoApproved("pwd"));
      ok(!await isAutoApproved("rm file"));
    });
    test("should handle invalid regex patterns gracefully", async () => {
      setAutoApprove({
        "/*/": true,
        // Invalid regex - nothing to repeat
        "/(?:+/": true,
        // Invalid regex - incomplete quantifier
        "/[/": true,
        // Invalid regex - unclosed character class
        "/^echo/": true,
        // Valid pattern
        "ls": true
        // Valid string pattern
      });
      ok(await isAutoApproved("echo hello"));
      ok(await isAutoApproved("ls -la"));
      ok(!await isAutoApproved("random command"));
    });
  });
  suite("path-aware auto approval", () => {
    test("should handle path variations with forward slashes", async () => {
      setAutoApprove({
        "bin/foo": true
      });
      ok(await isAutoApproved("bin/foo"));
      ok(await isAutoApproved("bin/foo --arg"));
      ok(await isAutoApproved("bin\\foo"));
      ok(await isAutoApproved("bin\\foo --arg"));
      ok(await isAutoApproved("./bin/foo"));
      ok(await isAutoApproved(".\\bin/foo"));
      ok(await isAutoApproved("./bin\\foo"));
      ok(await isAutoApproved(".\\bin\\foo"));
      ok(!await isAutoApproved("bin/foobar"));
      ok(!await isAutoApproved("notbin/foo"));
    });
    test("should handle path variations with backslashes", async () => {
      setAutoApprove({
        "bin\\script.bat": true
      });
      ok(await isAutoApproved("bin\\script.bat"));
      ok(await isAutoApproved("bin\\script.bat --help"));
      ok(await isAutoApproved("bin/script.bat"));
      ok(await isAutoApproved("bin/script.bat --help"));
      ok(await isAutoApproved("./bin\\script.bat"));
      ok(await isAutoApproved(".\\bin\\script.bat"));
      ok(await isAutoApproved("./bin/script.bat"));
      ok(await isAutoApproved(".\\bin/script.bat"));
    });
    test("should handle deep paths", async () => {
      setAutoApprove({
        "src/utils/helper.js": true
      });
      ok(await isAutoApproved("src/utils/helper.js"));
      ok(await isAutoApproved("src\\utils\\helper.js"));
      ok(await isAutoApproved("src/utils\\helper.js"));
      ok(await isAutoApproved("src\\utils/helper.js"));
      ok(await isAutoApproved("./src/utils/helper.js"));
      ok(await isAutoApproved(".\\src\\utils\\helper.js"));
    });
    test("should not treat non-paths as paths", async () => {
      setAutoApprove({
        "echo": true,
        // Not a path
        "ls": true,
        // Not a path
        "git": true
        // Not a path
      });
      ok(await isAutoApproved("echo"));
      ok(await isAutoApproved("ls"));
      ok(await isAutoApproved("git"));
      ok(!await isAutoApproved("./echo"));
      ok(!await isAutoApproved(".\\ls"));
    });
    test("should handle paths with mixed separators in config", async () => {
      setAutoApprove({
        "bin/foo\\bar": true
        // Mixed separators in config
      });
      ok(await isAutoApproved("bin/foo\\bar"));
      ok(await isAutoApproved("bin\\foo/bar"));
      ok(await isAutoApproved("bin/foo/bar"));
      ok(await isAutoApproved("bin\\foo\\bar"));
      ok(await isAutoApproved("./bin/foo\\bar"));
      ok(await isAutoApproved(".\\bin\\foo\\bar"));
    });
    test("should work with command line auto approval for paths", async () => {
      setAutoApproveWithCommandLine({
        "bin/deploy": { approve: true, matchCommandLine: true }
      });
      ok(isCommandLineAutoApproved("bin/deploy --prod"));
      ok(isCommandLineAutoApproved("bin\\deploy --prod"));
      ok(isCommandLineAutoApproved("./bin/deploy --prod"));
      ok(isCommandLineAutoApproved(".\\bin\\deploy --prod"));
    });
    test("should handle special characters in paths", async () => {
      setAutoApprove({
        "bin/my-script.sh": true,
        "scripts/build_all.py": true,
        "tools/run (debug).exe": true
      });
      ok(await isAutoApproved("bin/my-script.sh"));
      ok(await isAutoApproved("bin\\my-script.sh"));
      ok(await isAutoApproved("./bin/my-script.sh"));
      ok(await isAutoApproved("scripts/build_all.py"));
      ok(await isAutoApproved("scripts\\build_all.py"));
      ok(await isAutoApproved("tools/run (debug).exe"));
      ok(await isAutoApproved("tools\\run (debug).exe"));
    });
  });
  suite("PowerShell-specific commands", () => {
    setup(() => {
      shell = "pwsh";
    });
    test("should handle Windows PowerShell commands", async () => {
      setAutoApprove({
        "Get-ChildItem": true,
        "Get-Content": true,
        "Get-Location": true,
        "Remove-Item": false,
        "del": false
      });
      ok(await isAutoApproved("Get-ChildItem"));
      ok(await isAutoApproved("Get-Content file.txt"));
      ok(await isAutoApproved("Get-Location"));
      ok(!await isAutoApproved("Remove-Item file.txt"));
    });
    test("should handle ( prefixes", async () => {
      setAutoApprove({
        "Get-Content": true
      });
      ok(await isAutoApproved("Get-Content file.txt"));
      ok(await isAutoApproved("(Get-Content file.txt"));
      ok(!await isAutoApproved("[Get-Content"));
      ok(!await isAutoApproved("foo"));
    });
    test("should be case-insensitive for PowerShell commands", async () => {
      setAutoApprove({
        "Get-ChildItem": true,
        "Get-Content": true,
        "Remove-Item": false
      });
      ok(await isAutoApproved("Get-ChildItem"));
      ok(await isAutoApproved("get-childitem"));
      ok(await isAutoApproved("GET-CHILDITEM"));
      ok(await isAutoApproved("Get-childitem"));
      ok(await isAutoApproved("get-ChildItem"));
      ok(await isAutoApproved("Get-Content file.txt"));
      ok(await isAutoApproved("get-content file.txt"));
      ok(await isAutoApproved("GET-CONTENT file.txt"));
      ok(await isAutoApproved("Get-content file.txt"));
      ok(!await isAutoApproved("Remove-Item file.txt"));
      ok(!await isAutoApproved("remove-item file.txt"));
      ok(!await isAutoApproved("REMOVE-ITEM file.txt"));
      ok(!await isAutoApproved("Remove-item file.txt"));
    });
    test("should be case-insensitive for PowerShell aliases", async () => {
      setAutoApprove({
        "ls": true,
        "dir": true,
        "rm": false,
        "del": false
      });
      ok(await isAutoApproved("ls"));
      ok(await isAutoApproved("LS"));
      ok(await isAutoApproved("Ls"));
      ok(await isAutoApproved("dir"));
      ok(await isAutoApproved("DIR"));
      ok(await isAutoApproved("Dir"));
      ok(!await isAutoApproved("rm file.txt"));
      ok(!await isAutoApproved("RM file.txt"));
      ok(!await isAutoApproved("Rm file.txt"));
      ok(!await isAutoApproved("del file.txt"));
      ok(!await isAutoApproved("DEL file.txt"));
      ok(!await isAutoApproved("Del file.txt"));
    });
    test("should be case-insensitive with regex patterns", async () => {
      setAutoApprove({
        "/^Get-/": true,
        "/Remove-Item|rm/": false
      });
      ok(await isAutoApproved("Get-ChildItem"));
      ok(await isAutoApproved("get-childitem"));
      ok(await isAutoApproved("GET-PROCESS"));
      ok(await isAutoApproved("Get-Location"));
      ok(!await isAutoApproved("Remove-Item file.txt"));
      ok(!await isAutoApproved("remove-item file.txt"));
      ok(!await isAutoApproved("rm file.txt"));
      ok(!await isAutoApproved("RM file.txt"));
    });
    test("should handle case-insensitive PowerShell commands on different OS", async () => {
      setAutoApprove({
        "Get-Process": true,
        "Stop-Process": false
      });
      for (const currnetOS of [OperatingSystem.Windows, OperatingSystem.Linux, OperatingSystem.Macintosh]) {
        os = currnetOS;
        ok(await isAutoApproved("Get-Process"), `os=${os}`);
        ok(await isAutoApproved("get-process"), `os=${os}`);
        ok(await isAutoApproved("GET-PROCESS"), `os=${os}`);
        ok(!await isAutoApproved("Stop-Process"), `os=${os}`);
        ok(!await isAutoApproved("stop-process"), `os=${os}`);
      }
    });
  });
  suite("isCommandLineAutoApproved - matchCommandLine functionality", () => {
    test("should auto-approve command line patterns with matchCommandLine: true", async () => {
      setAutoApproveWithCommandLine({
        "echo": { approve: true, matchCommandLine: true }
      });
      ok(isCommandLineAutoApproved("echo hello"));
      ok(isCommandLineAutoApproved("echo test && ls"));
    });
    test("should not auto-approve regular patterns with isCommandLineAutoApproved", async () => {
      setAutoApprove({
        "echo": true
      });
      ok(!isCommandLineAutoApproved("echo hello"));
    });
    test("should handle regex patterns with matchCommandLine: true", async () => {
      setAutoApproveWithCommandLine({
        "/echo.*world/": { approve: true, matchCommandLine: true }
      });
      ok(isCommandLineAutoApproved("echo hello world"));
      ok(!isCommandLineAutoApproved("echo hello"));
    });
    test("should handle case-insensitive regex with matchCommandLine: true", async () => {
      setAutoApproveWithCommandLine({
        "/echo/i": { approve: true, matchCommandLine: true }
      });
      ok(isCommandLineAutoApproved("echo hello"));
      ok(isCommandLineAutoApproved("ECHO hello"));
      ok(isCommandLineAutoApproved("Echo hello"));
    });
    test("should handle complex command line patterns", async () => {
      setAutoApproveWithCommandLine({
        "/^npm run build/": { approve: true, matchCommandLine: true },
        "/.ps1/i": { approve: true, matchCommandLine: true }
      });
      ok(isCommandLineAutoApproved("npm run build --production"));
      ok(isCommandLineAutoApproved("powershell -File script.ps1"));
      ok(isCommandLineAutoApproved("pwsh -File SCRIPT.PS1"));
      ok(!isCommandLineAutoApproved("npm install"));
    });
    test("should return false for empty command line", async () => {
      setAutoApproveWithCommandLine({
        "echo": { approve: true, matchCommandLine: true }
      });
      ok(!isCommandLineAutoApproved(""));
      ok(!isCommandLineAutoApproved("   "));
    });
    test("should handle mixed configuration with matchCommandLine entries", async () => {
      setAutoApproveWithCommandLine({
        "echo": true,
        // Regular pattern
        "ls": { approve: true, matchCommandLine: true },
        // Command line pattern
        "rm": { approve: true, matchCommandLine: false }
        // Explicit regular pattern
      });
      ok(isCommandLineAutoApproved("ls -la"));
      ok(!isCommandLineAutoApproved("echo hello"));
      ok(!isCommandLineAutoApproved("rm file.txt"));
    });
    test("should handle deny patterns with matchCommandLine: true", async () => {
      setAutoApproveWithCommandLine({
        "echo": { approve: true, matchCommandLine: true },
        "/dangerous/": { approve: false, matchCommandLine: true }
      });
      ok(isCommandLineAutoApproved("echo hello"));
      ok(!isCommandLineAutoApproved("echo dangerous command"));
      ok(!isCommandLineAutoApproved("dangerous operation"));
    });
    test("should prioritize deny list over allow list for command line patterns", async () => {
      setAutoApproveWithCommandLine({
        "/echo/": { approve: true, matchCommandLine: true },
        "/echo.*dangerous/": { approve: false, matchCommandLine: true }
      });
      ok(isCommandLineAutoApproved("echo hello"));
      ok(!isCommandLineAutoApproved("echo dangerous command"));
    });
    test("should handle complex deny patterns with matchCommandLine", async () => {
      setAutoApproveWithCommandLine({
        "npm": { approve: true, matchCommandLine: true },
        "/npm.*--force/": { approve: false, matchCommandLine: true },
        "/.ps1.*-ExecutionPolicy/i": { approve: false, matchCommandLine: true }
      });
      ok(isCommandLineAutoApproved("npm install"));
      ok(isCommandLineAutoApproved("npm run build"));
      ok(!isCommandLineAutoApproved("npm install --force"));
      ok(!isCommandLineAutoApproved("powershell -File script.ps1 -ExecutionPolicy Bypass"));
    });
    test("should handle empty regex patterns with matchCommandLine that could cause endless loops", async () => {
      setAutoApproveWithCommandLine({
        "//": { approve: true, matchCommandLine: true },
        "/(?:)/": { approve: true, matchCommandLine: true },
        "/*/": { approve: true, matchCommandLine: true },
        // Invalid regex pattern
        "/.**/": { approve: true, matchCommandLine: true }
        // Invalid regex pattern
      });
      ok(!isCommandLineAutoApproved("echo hello"));
      ok(!isCommandLineAutoApproved("ls"));
      ok(!isCommandLineAutoApproved(""));
    });
    test("should handle regex patterns with matchCommandLine that would cause endless loops", async () => {
      setAutoApproveWithCommandLine({
        "/a*/": { approve: true, matchCommandLine: true },
        "/b?/": { approve: true, matchCommandLine: true },
        "/(x|)*/": { approve: true, matchCommandLine: true },
        "/(?:)*/": { approve: true, matchCommandLine: true }
      });
      ok(!isCommandLineAutoApproved("echo hello"));
      ok(!isCommandLineAutoApproved("ls"));
      ok(!isCommandLineAutoApproved("a"));
      ok(!isCommandLineAutoApproved("b"));
    });
    test("should handle mixed valid and problematic regex patterns with matchCommandLine", async () => {
      setAutoApproveWithCommandLine({
        "/^echo/": { approve: true, matchCommandLine: true },
        // Valid pattern
        "//": { approve: true, matchCommandLine: true },
        // Empty pattern
        "/^ls/": { approve: true, matchCommandLine: true },
        // Valid pattern
        "/a*/": { approve: true, matchCommandLine: true },
        // Potential endless loop
        "pwd": { approve: true, matchCommandLine: true }
        // Valid string pattern
      });
      ok(isCommandLineAutoApproved("echo hello"));
      ok(isCommandLineAutoApproved("ls -la"));
      ok(isCommandLineAutoApproved("pwd"));
      ok(!isCommandLineAutoApproved("rm file"));
    });
    test("should handle invalid regex patterns with matchCommandLine gracefully", async () => {
      setAutoApproveWithCommandLine({
        "/*/": { approve: true, matchCommandLine: true },
        // Invalid regex - nothing to repeat
        "/(?:+/": { approve: true, matchCommandLine: true },
        // Invalid regex - incomplete quantifier
        "/[/": { approve: true, matchCommandLine: true },
        // Invalid regex - unclosed character class
        "/^echo/": { approve: true, matchCommandLine: true },
        // Valid pattern
        "ls": { approve: true, matchCommandLine: true }
        // Valid string pattern
      });
      ok(isCommandLineAutoApproved("echo hello"));
      ok(isCommandLineAutoApproved("ls -la"));
      ok(!isCommandLineAutoApproved("random command"));
    });
  });
  suite("reasons", () => {
    async function getCommandReason(command) {
      return (await commandLineAutoApprover.isCommandAutoApproved(command, shell, os, void 0)).reason;
    }
    function getCommandLineReason(commandLine) {
      return commandLineAutoApprover.isCommandLineAutoApproved(commandLine).reason;
    }
    suite("command", () => {
      test("approved", async () => {
        setAutoApprove({ echo: true });
        strictEqual(await getCommandReason("echo hello"), `Command 'echo hello' is approved by allow list rule: echo`);
      });
      test("not approved", async () => {
        setAutoApprove({ echo: false });
        strictEqual(await getCommandReason("echo hello"), `Command 'echo hello' is denied by deny list rule: echo`);
      });
      test("no match", async () => {
        setAutoApprove({});
        strictEqual(await getCommandReason("echo hello"), `Command 'echo hello' has no matching auto approve entries`);
      });
    });
    suite("command line", () => {
      test("approved", async () => {
        setAutoApproveWithCommandLine({ echo: { approve: true, matchCommandLine: true } });
        strictEqual(getCommandLineReason("echo hello"), `Command line 'echo hello' is approved by allow list rule: echo`);
      });
      test("not approved", async () => {
        setAutoApproveWithCommandLine({ echo: { approve: false, matchCommandLine: true } });
        strictEqual(getCommandLineReason("echo hello"), `Command line 'echo hello' is denied by deny list rule: echo`);
      });
      test("no match", async () => {
        setAutoApproveWithCommandLine({});
        strictEqual(getCommandLineReason("echo hello"), `Command line 'echo hello' has no matching auto approve entries`);
      });
    });
  });
  suite("isDefaultRule logic", () => {
    async function getIsDefaultRule(command) {
      const rule = (await commandLineAutoApprover.isCommandAutoApproved(command, shell, os, void 0)).rule;
      return isAutoApproveRule(rule) ? rule.isDefaultRule : void 0;
    }
    function getCommandLineIsDefaultRule(commandLine) {
      const rule = commandLineAutoApprover.isCommandLineAutoApproved(commandLine).rule;
      return isAutoApproveRule(rule) ? rule.isDefaultRule : void 0;
    }
    function setAutoApproveWithDefaults(userConfig, defaultConfig) {
      configurationService.setUserConfiguration(TerminalChatAgentToolsSettingId.AutoApprove, userConfig);
      const originalInspect = configurationService.inspect;
      const originalGetValue = configurationService.getValue;
      configurationService.inspect = (key) => {
        if (key === TerminalChatAgentToolsSettingId.AutoApprove) {
          return {
            default: { value: defaultConfig },
            user: { value: userConfig },
            workspace: void 0,
            workspaceFolder: void 0,
            application: void 0,
            policy: void 0,
            memory: void 0,
            value: { ...defaultConfig, ...userConfig }
          };
        }
        return originalInspect.call(configurationService, key);
      };
      configurationService.getValue = (key) => {
        if (key === TerminalChatAgentToolsSettingId.AutoApprove) {
          return { ...defaultConfig, ...userConfig };
        }
        return originalGetValue.call(configurationService, key);
      };
      configurationService.onDidChangeConfigurationEmitter.fire({
        affectsConfiguration: () => true,
        affectedKeys: /* @__PURE__ */ new Set([TerminalChatAgentToolsSettingId.AutoApprove]),
        source: ConfigurationTarget.USER,
        change: null
      });
    }
    function setAutoApproveWithDefaultsCommandLine(userConfig, defaultConfig) {
      configurationService.setUserConfiguration(TerminalChatAgentToolsSettingId.AutoApprove, userConfig);
      const originalInspect = configurationService.inspect;
      const originalGetValue = configurationService.getValue;
      configurationService.inspect = (key) => {
        if (key === TerminalChatAgentToolsSettingId.AutoApprove) {
          return {
            default: { value: defaultConfig },
            user: { value: userConfig },
            workspace: void 0,
            workspaceFolder: void 0,
            application: void 0,
            policy: void 0,
            memory: void 0,
            value: { ...defaultConfig, ...userConfig }
          };
        }
        return originalInspect.call(configurationService, key);
      };
      configurationService.getValue = (key) => {
        if (key === TerminalChatAgentToolsSettingId.AutoApprove) {
          return { ...defaultConfig, ...userConfig };
        }
        return originalGetValue.call(configurationService, key);
      };
      configurationService.onDidChangeConfigurationEmitter.fire({
        affectsConfiguration: () => true,
        affectedKeys: /* @__PURE__ */ new Set([TerminalChatAgentToolsSettingId.AutoApprove]),
        source: ConfigurationTarget.USER,
        change: null
      });
    }
    test("should correctly identify default rules vs user-defined rules", async () => {
      setAutoApproveWithDefaults(
        { "echo": true, "ls": true, "pwd": false },
        { "echo": true, "cat": true }
      );
      strictEqual(await getIsDefaultRule("echo hello"), true, "echo is in both default and user config with same value - should be marked as default");
      strictEqual(await getIsDefaultRule("ls -la"), false, "ls is only in user config - should be marked as user-defined");
      strictEqual(await getIsDefaultRule("pwd"), false, "pwd is only in user config - should be marked as user-defined");
      strictEqual(await getIsDefaultRule("cat file.txt"), true, "cat is in both default and user config with same value - should be marked as default");
    });
    test("should mark as default when command is only in default config but not in user config", async () => {
      setAutoApproveWithDefaults(
        { "echo": true, "ls": true },
        // User config (cat is NOT here)
        { "echo": true, "cat": true }
        // Default config (cat IS here)
      );
      strictEqual((await commandLineAutoApprover.isCommandAutoApproved("echo", shell, os, void 0)).result, "approved", "echo should be approved");
      strictEqual((await commandLineAutoApprover.isCommandAutoApproved("ls", shell, os, void 0)).result, "approved", "ls should be approved");
      const catResult = await commandLineAutoApprover.isCommandAutoApproved("cat", shell, os, void 0);
      strictEqual(catResult.result, "approved", "cat should be approved from default config");
      strictEqual(isAutoApproveRule(catResult.rule) ? catResult.rule.isDefaultRule : void 0, true, "cat is only in default config, not in user config - should be marked as default");
    });
    test("should handle default rules with different values", async () => {
      setAutoApproveWithDefaults(
        { "echo": true, "rm": true },
        { "echo": false, "rm": true }
      );
      strictEqual(await getIsDefaultRule("echo hello"), false, "echo has different values in default vs user - should be marked as user-defined");
      strictEqual(await getIsDefaultRule("rm file.txt"), true, "rm has same value in both - should be marked as default");
    });
    test("should handle regex patterns as default rules", async () => {
      setAutoApproveWithDefaults(
        { "/^git/": true, "/^npm/": false },
        { "/^git/": true, "/^docker/": true }
      );
      strictEqual(await getIsDefaultRule("git status"), true, "git pattern matches default - should be marked as default");
      strictEqual(await getIsDefaultRule("npm install"), false, "npm pattern is user-only - should be marked as user-defined");
    });
    test("should handle mixed string and regex patterns", async () => {
      setAutoApproveWithDefaults(
        { "echo": true, "/^ls/": false },
        { "echo": true, "cat": true }
      );
      strictEqual(await getIsDefaultRule("echo hello"), true, "String pattern matching default");
      strictEqual(await getIsDefaultRule("ls -la"), false, "Regex pattern user-defined");
    });
    test("should handle command line rules with isDefaultRule", async () => {
      setAutoApproveWithDefaultsCommandLine(
        {
          "echo": { approve: true, matchCommandLine: true },
          "ls": { approve: false, matchCommandLine: true }
        },
        {
          "echo": { approve: true, matchCommandLine: true },
          "cat": { approve: true, matchCommandLine: true }
        }
      );
      strictEqual(getCommandLineIsDefaultRule("echo hello world"), true, "echo matches default config exactly using structural equality - should be marked as default");
      strictEqual(getCommandLineIsDefaultRule("ls -la"), false, "ls is user-defined only - should be marked as user-defined");
    });
    test("should handle command line rules with different matchCommandLine values", async () => {
      setAutoApproveWithDefaultsCommandLine(
        {
          "echo": { approve: true, matchCommandLine: true },
          "ls": { approve: true, matchCommandLine: false }
        },
        {
          "echo": { approve: true, matchCommandLine: false },
          "ls": { approve: true, matchCommandLine: false }
        }
      );
      strictEqual(getCommandLineIsDefaultRule("echo hello"), false, "echo has different matchCommandLine value - should be user-defined");
      strictEqual(getCommandLineIsDefaultRule("ls -la"), void 0, "ls matches exactly - should be default (but won't match command line check since matchCommandLine is false)");
    });
    test("should handle boolean vs object format consistency", async () => {
      setAutoApproveWithDefaultsCommandLine(
        {
          "echo": true,
          "ls": { approve: true, matchCommandLine: true }
        },
        {
          "echo": true,
          "ls": { approve: true, matchCommandLine: true }
        }
      );
      strictEqual(await getIsDefaultRule("echo hello"), true, "Boolean format matching - should be default");
      strictEqual(getCommandLineIsDefaultRule("ls -la"), true, "Object format matching using structural equality - should be default");
    });
    test("should return undefined for noMatch cases", async () => {
      setAutoApproveWithDefaults(
        { "echo": true },
        { "cat": true }
      );
      strictEqual(await getIsDefaultRule("unknown-command"), void 0, "Command that matches neither user nor default config");
      strictEqual(getCommandLineIsDefaultRule("unknown-command"), void 0, "Command that matches neither user nor default config");
    });
    test("should handle empty configurations", async () => {
      setAutoApproveWithDefaults(
        {},
        {}
      );
      strictEqual(await getIsDefaultRule("echo hello"), void 0);
      strictEqual(getCommandLineIsDefaultRule("echo hello"), void 0);
    });
    test("should handle only default config with no user overrides", async () => {
      setAutoApproveWithDefaults(
        {},
        { "echo": true, "ls": false }
      );
      strictEqual(await getIsDefaultRule("echo hello"), true, "Commands in default config should be marked as default rules even with empty user config");
      strictEqual(await getIsDefaultRule("ls -la"), true, "Commands in default config should be marked as default rules even with empty user config");
    });
    test("should handle complex nested object rules", async () => {
      setAutoApproveWithDefaultsCommandLine(
        {
          "npm": { approve: true, matchCommandLine: true },
          "git": { approve: false, matchCommandLine: false }
        },
        {
          "npm": { approve: true, matchCommandLine: true },
          "docker": { approve: true, matchCommandLine: true }
        }
      );
      strictEqual(getCommandLineIsDefaultRule("npm install"), true, "npm matches default exactly using structural equality - should be default");
      strictEqual(getCommandLineIsDefaultRule("git status"), void 0, "git is user-defined - should be user-defined (but won't match command line since matchCommandLine is false)");
    });
    test("should handle PowerShell case-insensitive matching with defaults", async () => {
      shell = "pwsh";
      os = OperatingSystem.Windows;
      setAutoApproveWithDefaults(
        { "Get-Process": true },
        { "Get-Process": true }
      );
      strictEqual(await getIsDefaultRule("Get-Process"), true, "Case-insensitive PowerShell command matching default");
      strictEqual(await getIsDefaultRule("get-process"), true, "Case-insensitive PowerShell command matching default");
      strictEqual(await getIsDefaultRule("GET-PROCESS"), true, "Case-insensitive PowerShell command matching default");
    });
    test("should use structural equality for object comparison", async () => {
      const userConfig = { "test": { approve: true, matchCommandLine: true } };
      const defaultConfig = { "test": { approve: true, matchCommandLine: true } };
      setAutoApproveWithDefaultsCommandLine(userConfig, defaultConfig);
      strictEqual(getCommandLineIsDefaultRule("test command"), true, "Even though userConfig and defaultConfig are different object instances, they have the same structure and values, so should be considered default");
    });
    test("should detect structural differences in objects", async () => {
      const userConfig = { "test": { approve: true, matchCommandLine: true } };
      const defaultConfig = { "test": { approve: true, matchCommandLine: false } };
      setAutoApproveWithDefaultsCommandLine(userConfig, defaultConfig);
      strictEqual(getCommandLineIsDefaultRule("test command"), false, "Objects have different matchCommandLine values, so should be user-defined");
    });
    test("should handle mixed types correctly", async () => {
      const userConfig = {
        "cmd1": true,
        "cmd2": { approve: false, matchCommandLine: true }
      };
      const defaultConfig = {
        "cmd1": true,
        "cmd2": { approve: false, matchCommandLine: true }
      };
      setAutoApproveWithDefaultsCommandLine(userConfig, defaultConfig);
      strictEqual(await getIsDefaultRule("cmd1 arg"), true, "Boolean type should match default");
      strictEqual(getCommandLineIsDefaultRule("cmd2 arg"), true, "Object type should match default using structural equality (even though it's a deny rule)");
    });
  });
  suite("ignoreDefaultAutoApproveRules", () => {
    function setAutoApproveWithDefaults(userConfig, defaultConfig) {
      configurationService.setUserConfiguration(TerminalChatAgentToolsSettingId.AutoApprove, userConfig);
      const originalInspect = configurationService.inspect;
      const originalGetValue = configurationService.getValue;
      configurationService.inspect = (key) => {
        if (key === TerminalChatAgentToolsSettingId.AutoApprove) {
          return {
            default: { value: defaultConfig },
            user: { value: userConfig },
            workspace: void 0,
            workspaceFolder: void 0,
            application: void 0,
            policy: void 0,
            memory: void 0,
            value: { ...defaultConfig, ...userConfig }
          };
        }
        return originalInspect.call(configurationService, key);
      };
      configurationService.getValue = (key) => {
        if (key === TerminalChatAgentToolsSettingId.AutoApprove) {
          return { ...defaultConfig, ...userConfig };
        }
        return originalGetValue.call(configurationService, key);
      };
      configurationService.onDidChangeConfigurationEmitter.fire({
        affectsConfiguration: () => true,
        affectedKeys: /* @__PURE__ */ new Set([TerminalChatAgentToolsSettingId.AutoApprove]),
        source: ConfigurationTarget.USER,
        change: null
      });
    }
    function setIgnoreDefaultAutoApproveRules(value) {
      setConfig(TerminalChatAgentToolsSettingId.IgnoreDefaultAutoApproveRules, value);
    }
    test("should include default rules when ignoreDefaultAutoApproveRules is false (default behavior)", async () => {
      setAutoApproveWithDefaults(
        { "ls": true },
        { "echo": true, "cat": true }
      );
      setIgnoreDefaultAutoApproveRules(false);
      ok(await isAutoApproved("ls -la"), "User-defined rule should work");
      ok(await isAutoApproved("echo hello"), "Default rule should work when not ignored");
      ok(await isAutoApproved("cat file.txt"), "Default rule should work when not ignored");
    });
    test("should exclude default rules when ignoreDefaultAutoApproveRules is true", async () => {
      setAutoApproveWithDefaults(
        { "ls": true },
        { "echo": true, "cat": true }
      );
      setIgnoreDefaultAutoApproveRules(true);
      ok(await isAutoApproved("ls -la"), "User-defined rule should still work");
      ok(!await isAutoApproved("echo hello"), "Default rule should be ignored");
      ok(!await isAutoApproved("cat file.txt"), "Default rule should be ignored");
    });
    test("should attribute workspace-folder-scoped rules to WORKSPACE_FOLDER target", async () => {
      const workspaceFolderConfig = { "git": true };
      configurationService.setUserConfiguration(TerminalChatAgentToolsSettingId.AutoApprove, workspaceFolderConfig);
      const originalInspect = configurationService.inspect;
      const originalGetValue = configurationService.getValue;
      configurationService.inspect = (key) => {
        if (key === TerminalChatAgentToolsSettingId.AutoApprove) {
          return {
            default: void 0,
            user: void 0,
            workspace: void 0,
            workspaceFolder: void 0,
            workspaceFolderValue: workspaceFolderConfig,
            application: void 0,
            policy: void 0,
            memory: void 0,
            value: workspaceFolderConfig
          };
        }
        return originalInspect.call(configurationService, key);
      };
      configurationService.getValue = (key) => {
        if (key === TerminalChatAgentToolsSettingId.AutoApprove) {
          return workspaceFolderConfig;
        }
        return originalGetValue.call(configurationService, key);
      };
      configurationService.onDidChangeConfigurationEmitter.fire({
        affectsConfiguration: () => true,
        affectedKeys: /* @__PURE__ */ new Set([TerminalChatAgentToolsSettingId.AutoApprove]),
        source: ConfigurationTarget.WORKSPACE_FOLDER,
        change: null
      });
      const result = await commandLineAutoApprover.isCommandAutoApproved("git status", shell, os, void 0);
      strictEqual(result.result, "approved", "git command should be approved");
      ok(isAutoApproveRule(result.rule), "result should have an auto-approve rule");
      strictEqual(result.rule.sourceTarget, ConfigurationTarget.WORKSPACE_FOLDER, "workspace-folder-scoped rule should have WORKSPACE_FOLDER source target");
    });
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXHRlcm1pbmFsQ29udHJpYlxcY2hhdEFnZW50VG9vbHNcXHRlc3RcXGJyb3dzZXJcXGNvbW1hbmRMaW5lQXV0b0FwcHJvdmVyLnRlc3QudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgeyBPcGVyYXRpbmdTeXN0ZW0gfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9wbGF0Zm9ybS5qcyc7XG5pbXBvcnQgeyBlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL3Rlc3QvY29tbW9uL3V0aWxzLmpzJztcbmltcG9ydCB7IFRlc3RDb25maWd1cmF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbmZpZ3VyYXRpb24vdGVzdC9jb21tb24vdGVzdENvbmZpZ3VyYXRpb25TZXJ2aWNlLmpzJztcbmltcG9ydCB0eXBlIHsgSUluc3RhbnRpYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vaW5zdGFudGlhdGlvbi9jb21tb24vaW5zdGFudGlhdGlvbi5qcyc7XG5pbXBvcnQgeyB3b3JrYmVuY2hJbnN0YW50aWF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3Rlc3QvYnJvd3Nlci93b3JrYmVuY2hUZXN0U2VydmljZXMuanMnO1xuaW1wb3J0IHsgdGVybWluYWxDaGF0QWdlbnRUb29sc0NvbmZpZ3VyYXRpb24sIFRlcm1pbmFsQ2hhdEFnZW50VG9vbHNTZXR0aW5nSWQgfSBmcm9tICcuLi8uLi9jb21tb24vdGVybWluYWxDaGF0QWdlbnRUb29sc0NvbmZpZ3VyYXRpb24uanMnO1xuaW1wb3J0IHsgQ29uZmlndXJhdGlvblRhcmdldCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbmZpZ3VyYXRpb24vY29tbW9uL2NvbmZpZ3VyYXRpb24uanMnO1xuaW1wb3J0IHsgZGVlcFN0cmljdEVxdWFsLCBvaywgc3RyaWN0RXF1YWwgfSBmcm9tICdhc3NlcnQnO1xuaW1wb3J0IHsgQ29tbWFuZExpbmVBdXRvQXBwcm92ZXIgfSBmcm9tICcuLi8uLi9icm93c2VyL3Rvb2xzL2NvbW1hbmRMaW5lQW5hbHl6ZXIvYXV0b0FwcHJvdmUvY29tbWFuZExpbmVBdXRvQXBwcm92ZXIuanMnO1xuaW1wb3J0IHsgaXNBdXRvQXBwcm92ZVJ1bGUgfSBmcm9tICcuLi8uLi9icm93c2VyL3Rvb2xzL2NvbW1hbmRMaW5lQW5hbHl6ZXIvY29tbWFuZExpbmVBbmFseXplci5qcyc7XG5cbnN1aXRlKCdDb21tYW5kTGluZUF1dG9BcHByb3ZlcicsICgpID0+IHtcblx0Y29uc3Qgc3RvcmUgPSBlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUoKTtcblxuXHRsZXQgaW5zdGFudGlhdGlvblNlcnZpY2U6IElJbnN0YW50aWF0aW9uU2VydmljZTtcblx0bGV0IGNvbmZpZ3VyYXRpb25TZXJ2aWNlOiBUZXN0Q29uZmlndXJhdGlvblNlcnZpY2U7XG5cblx0bGV0IGNvbW1hbmRMaW5lQXV0b0FwcHJvdmVyOiBDb21tYW5kTGluZUF1dG9BcHByb3Zlcjtcblx0bGV0IHNoZWxsOiBzdHJpbmc7XG5cdGxldCBvczogT3BlcmF0aW5nU3lzdGVtO1xuXG5cdHNldHVwKCgpID0+IHtcblx0XHRjb25maWd1cmF0aW9uU2VydmljZSA9IG5ldyBUZXN0Q29uZmlndXJhdGlvblNlcnZpY2UoKTtcblx0XHRpbnN0YW50aWF0aW9uU2VydmljZSA9IHdvcmtiZW5jaEluc3RhbnRpYXRpb25TZXJ2aWNlKHtcblx0XHRcdGNvbmZpZ3VyYXRpb25TZXJ2aWNlOiAoKSA9PiBjb25maWd1cmF0aW9uU2VydmljZVxuXHRcdH0sIHN0b3JlKTtcblxuXHRcdHNoZWxsID0gJ2Jhc2gnO1xuXHRcdG9zID0gT3BlcmF0aW5nU3lzdGVtLkxpbnV4O1xuXHRcdGNvbW1hbmRMaW5lQXV0b0FwcHJvdmVyID0gc3RvcmUuYWRkKGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKENvbW1hbmRMaW5lQXV0b0FwcHJvdmVyKSk7XG5cdH0pO1xuXG5cdGZ1bmN0aW9uIHNldEF1dG9BcHByb3ZlKHZhbHVlOiB7IFtrZXk6IHN0cmluZ106IGJvb2xlYW4gfSkge1xuXHRcdHNldENvbmZpZyhUZXJtaW5hbENoYXRBZ2VudFRvb2xzU2V0dGluZ0lkLkF1dG9BcHByb3ZlLCB2YWx1ZSk7XG5cdH1cblxuXHRmdW5jdGlvbiBzZXRBdXRvQXBwcm92ZVdpdGhDb21tYW5kTGluZSh2YWx1ZTogeyBba2V5OiBzdHJpbmddOiB7IGFwcHJvdmU6IGJvb2xlYW47IG1hdGNoQ29tbWFuZExpbmU/OiBib29sZWFuIH0gfCBib29sZWFuIH0pIHtcblx0XHRzZXRDb25maWcoVGVybWluYWxDaGF0QWdlbnRUb29sc1NldHRpbmdJZC5BdXRvQXBwcm92ZSwgdmFsdWUpO1xuXHR9XG5cblx0ZnVuY3Rpb24gc2V0Q29uZmlnKGtleTogc3RyaW5nLCB2YWx1ZTogdW5rbm93bikge1xuXHRcdGNvbmZpZ3VyYXRpb25TZXJ2aWNlLnNldFVzZXJDb25maWd1cmF0aW9uKGtleSwgdmFsdWUpO1xuXHRcdGNvbmZpZ3VyYXRpb25TZXJ2aWNlLm9uRGlkQ2hhbmdlQ29uZmlndXJhdGlvbkVtaXR0ZXIuZmlyZSh7XG5cdFx0XHRhZmZlY3RzQ29uZmlndXJhdGlvbjogKCkgPT4gdHJ1ZSxcblx0XHRcdGFmZmVjdGVkS2V5czogbmV3IFNldChba2V5XSksXG5cdFx0XHRzb3VyY2U6IENvbmZpZ3VyYXRpb25UYXJnZXQuVVNFUixcblx0XHRcdGNoYW5nZTogbnVsbCEsXG5cdFx0fSk7XG5cdH1cblxuXHRhc3luYyBmdW5jdGlvbiBpc0F1dG9BcHByb3ZlZChjb21tYW5kTGluZTogc3RyaW5nKTogUHJvbWlzZTxib29sZWFuPiB7XG5cdFx0cmV0dXJuIChhd2FpdCBjb21tYW5kTGluZUF1dG9BcHByb3Zlci5pc0NvbW1hbmRBdXRvQXBwcm92ZWQoY29tbWFuZExpbmUsIHNoZWxsLCBvcywgdW5kZWZpbmVkKSkucmVzdWx0ID09PSAnYXBwcm92ZWQnO1xuXHR9XG5cblx0ZnVuY3Rpb24gaXNDb21tYW5kTGluZUF1dG9BcHByb3ZlZChjb21tYW5kTGluZTogc3RyaW5nKTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuIGNvbW1hbmRMaW5lQXV0b0FwcHJvdmVyLmlzQ29tbWFuZExpbmVBdXRvQXBwcm92ZWQoY29tbWFuZExpbmUpLnJlc3VsdCA9PT0gJ2FwcHJvdmVkJztcblx0fVxuXG5cdHN1aXRlKCdkZWZhdWx0IFBvd2VyU2hlbGwgcnVsZXMnLCAoKSA9PiB7XG5cdFx0c2V0dXAoKCkgPT4ge1xuXHRcdFx0c2hlbGwgPSAncHdzaCc7XG5cdFx0XHRvcyA9IE9wZXJhdGluZ1N5c3RlbS5XaW5kb3dzO1xuXHRcdFx0c2V0QXV0b0FwcHJvdmVXaXRoQ29tbWFuZExpbmUoXG5cdFx0XHRcdHRlcm1pbmFsQ2hhdEFnZW50VG9vbHNDb25maWd1cmF0aW9uW1Rlcm1pbmFsQ2hhdEFnZW50VG9vbHNTZXR0aW5nSWQuQXV0b0FwcHJvdmVdLmRlZmF1bHQgYXMgUmVjb3JkPHN0cmluZywgYm9vbGVhbiB8IHsgYXBwcm92ZTogYm9vbGVhbjsgbWF0Y2hDb21tYW5kTGluZT86IGJvb2xlYW4gfT5cblx0XHRcdCk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdhdXRvLWFwcHJvdmVzIGV4cGxpY2l0IHNhZmUgY21kbGV0cyBjYXNlLWluc2Vuc2l0aXZlbHknLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCBjb21tYW5kcyA9IFtcblx0XHRcdFx0J1NlbGVjdC1PYmplY3QgTmFtZScsXG5cdFx0XHRcdCdzZWxlY3Qtb2JqZWN0IE5hbWUnLFxuXHRcdFx0XHQnTWVhc3VyZS1PYmplY3QgTGVuZ3RoJyxcblx0XHRcdFx0J0NvbXBhcmUtT2JqZWN0ICRhICRiJyxcblx0XHRcdFx0J0Zvcm1hdC1UYWJsZScsXG5cdFx0XHRcdCdTb3J0LU9iamVjdCBOYW1lJyxcblx0XHRcdF07XG5cdFx0XHRzdHJpY3RFcXVhbCgoYXdhaXQgUHJvbWlzZS5hbGwoY29tbWFuZHMubWFwKGlzQXV0b0FwcHJvdmVkKSkpLmV2ZXJ5KEJvb2xlYW4pLCB0cnVlKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2RvZXMgbm90IGF1dG8tYXBwcm92ZSBhcmJpdHJhcnkgY21kbGV0cyBieSB2ZXJiJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgY29tbWFuZHMgPSBbXG5cdFx0XHRcdCdTZWxlY3QtQ3VzdG9tJyxcblx0XHRcdFx0J01lYXN1cmUtQ29tbWFuZCcsXG5cdFx0XHRcdCdDb21wYXJlLUN1c3RvbScsXG5cdFx0XHRcdCdGb3JtYXQtSGV4Jyxcblx0XHRcdFx0J1NvcnQtQ3VzdG9tJyxcblx0XHRcdF07XG5cdFx0XHRkZWVwU3RyaWN0RXF1YWwoYXdhaXQgUHJvbWlzZS5hbGwoY29tbWFuZHMubWFwKGlzQXV0b0FwcHJvdmVkKSksIFtmYWxzZSwgZmFsc2UsIGZhbHNlLCBmYWxzZSwgZmFsc2VdKTtcblx0XHR9KTtcblx0fSk7XG5cblx0c3VpdGUoJ2RlZmF1bHQgc29ydCBydWxlcycsICgpID0+IHtcblx0XHRzZXR1cCgoKSA9PiB7XG5cdFx0XHRzZXRBdXRvQXBwcm92ZVdpdGhDb21tYW5kTGluZShcblx0XHRcdFx0dGVybWluYWxDaGF0QWdlbnRUb29sc0NvbmZpZ3VyYXRpb25bVGVybWluYWxDaGF0QWdlbnRUb29sc1NldHRpbmdJZC5BdXRvQXBwcm92ZV0uZGVmYXVsdCBhcyBSZWNvcmQ8c3RyaW5nLCBib29sZWFuIHwgeyBhcHByb3ZlOiBib29sZWFuOyBtYXRjaENvbW1hbmRMaW5lPzogYm9vbGVhbiB9PlxuXHRcdFx0KTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2F1dG8tYXBwcm92ZXMgYmVuaWduIGZvcm1zJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgY29tbWFuZHMgPSBbXG5cdFx0XHRcdCdzb3J0IGlucHV0LnR4dCcsXG5cdFx0XHRcdCdzb3J0IC0tY2hlY2sgaW5wdXQudHh0Jyxcblx0XHRcdFx0J3NvcnQgLS1jaGVjaz1xdWlldCBpbnB1dC50eHQnLFxuXHRcdFx0XHQnc29ydCBcIi0tY2hlY2tcIiBpbnB1dC50eHQnLFxuXHRcdFx0XHQnc29ydCAtLWJ1ZmZlci1zaXplPTFLIGlucHV0LnR4dCcsXG5cdFx0XHRcdCdzb3J0PGlucHV0LnR4dCcsXG5cdFx0XHRdO1xuXHRcdFx0ZGVlcFN0cmljdEVxdWFsKGF3YWl0IFByb21pc2UuYWxsKGNvbW1hbmRzLm1hcChpc0F1dG9BcHByb3ZlZCkpLCBjb21tYW5kcy5tYXAoKCkgPT4gdHJ1ZSkpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnZGVuaWVzIGJsb2NrZWQgb3B0aW9ucycsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IGNvbW1hbmRzID0gW1xuXHRcdFx0XHQnc29ydCAtbyBvdXRwdXQudHh0IGlucHV0LnR4dCcsXG5cdFx0XHRcdCdzb3J0IC1TIDFHIGlucHV0LnR4dCcsXG5cdFx0XHRcdCdzb3J0IC0tY29tcHJlc3MtcHJvZ3JhbT0vYmluL3NoIGlucHV0LnR4dCcsXG5cdFx0XHRcdCdzb3J0IC0tY29tcHJlc3MtcHJvZ3JhbSAvYmluL3NoIGlucHV0LnR4dCcsXG5cdFx0XHRcdCdzb3J0IC0tY29tcHJlc3MtcHJvZz0vYmluL3NoIGlucHV0LnR4dCcsXG5cdFx0XHRcdCdzb3J0IC0tY29tcHJlc3MtcD0vYmluL3NoIGlucHV0LnR4dCcsXG5cdFx0XHRcdCdzb3J0IC0tY29tPS9iaW4vc2ggaW5wdXQudHh0Jyxcblx0XHRcdFx0J3NvcnQgLS1jbz0vYmluL3NoIGlucHV0LnR4dCcsXG5cdFx0XHRcdCdzb3J0IFwiLS1jb21wcmVzcy1wcm9ncmFtPS9iaW4vc2hcIiBpbnB1dC50eHQnLFxuXHRcdFx0XHQnc29ydCBcXCctLWNvbXByZXNzLXByb2c9L2Jpbi9zaFxcJyBpbnB1dC50eHQnLFxuXHRcdFx0XHQnc29ydCBcXFxcLVxcXFwtY29tcHJlc3MtcHJvZ3JhbT0vYmluL3NoIGlucHV0LnR4dCcsXG5cdFx0XHRcdCdzb3J0IC0tY29tcHJlc3MtcHJvZ3JhbVxcXFw9L2Jpbi9zaCBpbnB1dC50eHQnLFxuXHRcdFx0XHQnc29ydCAtLVwiY29tcHJlc3MtcHJvZ3JhbT0vYmluL3NoXCIgaW5wdXQudHh0Jyxcblx0XHRcdFx0J3NvcnQgJFxcJy0tY29tcHJlc3MtcHJvZ3JhbT0vYmluL3NoXFwnIGlucHV0LnR4dCcsXG5cdFx0XHRdO1xuXHRcdFx0ZGVlcFN0cmljdEVxdWFsKGF3YWl0IFByb21pc2UuYWxsKGNvbW1hbmRzLm1hcChpc0F1dG9BcHByb3ZlZCkpLCBjb21tYW5kcy5tYXAoKCkgPT4gZmFsc2UpKTtcblx0XHR9KTtcblx0fSk7XG5cblx0c3VpdGUoJ2RlZmF1bHQgc2VkIHJ1bGVzJywgKCkgPT4ge1xuXHRcdHNldHVwKCgpID0+IHtcblx0XHRcdHNldEF1dG9BcHByb3ZlV2l0aENvbW1hbmRMaW5lKFxuXHRcdFx0XHR0ZXJtaW5hbENoYXRBZ2VudFRvb2xzQ29uZmlndXJhdGlvbltUZXJtaW5hbENoYXRBZ2VudFRvb2xzU2V0dGluZ0lkLkF1dG9BcHByb3ZlXS5kZWZhdWx0IGFzIFJlY29yZDxzdHJpbmcsIGJvb2xlYW4gfCB7IGFwcHJvdmU6IGJvb2xlYW47IG1hdGNoQ29tbWFuZExpbmU/OiBib29sZWFuIH0+XG5cdFx0XHQpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnYXV0by1hcHByb3ZlcyBiZW5pZ24gc3Vic3RpdHV0aW9ucycsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IGNvbW1hbmRzID0gW1xuXHRcdFx0XHQnc2VkIFwicy9mb28vYmFyL2dcIiBmaWxlLnR4dCcsXG5cdFx0XHRcdCdzZWQgLW4gXCIxLDEwcFwiIGZpbGUudHh0Jyxcblx0XHRcdFx0J3NlZCBcIi9lcnIvZFwiIGZpbGUudHh0Jyxcblx0XHRcdFx0J3NlZCBcInkvYWJjL3h5ei9cIiBmaWxlLnR4dCcsXG5cdFx0XHRcdCdzZWQgXCJzL2EvYi87cy9jL2QvXCIgZmlsZS50eHQnLFxuXHRcdFx0XHQnc2VkIFwiL3cvZFwiIGZpbGUudHh0Jyxcblx0XHRcdF07XG5cdFx0XHRkZWVwU3RyaWN0RXF1YWwoYXdhaXQgUHJvbWlzZS5hbGwoY29tbWFuZHMubWFwKGlzQXV0b0FwcHJvdmVkKSksIGNvbW1hbmRzLm1hcCgoKSA9PiB0cnVlKSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdkZW5pZXMgZGFuZ2Vyb3VzIHNjcmlwdCBmb3JtcycsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IGNvbW1hbmRzID0gW1xuXHRcdFx0XHQnc2VkIC1lIFwicy9mb28vYmFyL1wiJyxcblx0XHRcdFx0J3NlZCAtLWV4cHJlc3Npb24gXCJzL2Zvby9iYXIvXCInLFxuXHRcdFx0XHQnc2VkIFwicy9mb28vYmFyL2VcIicsXG5cdFx0XHRcdCdzZWQgXCJzL2Zvby9iYXIvd1wiJyxcblx0XHRcdFx0J3NlZCBcIjFlIGlkID4gL3RtcC9TRUNVUklUWV9URVNUX3B3bmVkXCInLFxuXHRcdFx0XHQnc2VkIFwiMXcgL3RtcC9TRUNVUklUWV9URVNUX3B3bmVkX2ZpbGVcIiBpbnB1dC50eHQnLFxuXHRcdFx0XHQnc2VkIFwiMXIgL2V0Yy9wYXNzd2RcIiBpbnB1dC50eHQnLFxuXHRcdFx0XHQnc2VkIFwiMVcgL3RtcC94XCIgaW5wdXQudHh0Jyxcblx0XHRcdFx0J3NlZCBcImUgaWRcIicsXG5cdFx0XHRcdCdzZWQgXCJzL2EvYi87ZSBpZFwiJyxcblx0XHRcdFx0J3NlZCBcIi9wYXQvZSBpZFwiJyxcblx0XHRcdFx0J3NlZCAtbiBcIjFlIGlkXCIgZmlsZS50eHQnLFxuXHRcdFx0XHQnc2VkIDFlIGlkJyxcblx0XHRcdFx0J3NlZCBcInMvYS9iLzsgZSBpZFwiJyxcblx0XHRcdFx0J3NlZCBcInMvYS9cXCcvO2UgaWRcIicsXG5cdFx0XHRcdCdzZWQgL3BhdC9lIGlucHV0LnR4dCcsXG5cdFx0XHRcdCdzZWQgXCIxIGUgaWRcIicsXG5cdFx0XHRcdCdzZWQgXCIxIWUgaWRcIicsXG5cdFx0XHRcdCdzZWQgXCIxLCAzIHcgL3RtcC94XCIgaW5wdXQudHh0Jyxcblx0XHRcdFx0J3NlZCAtbCA4MCBcImUgaWRcIiBpbnB1dC50eHQnLFxuXHRcdFx0XHQnc2VkIC0tbGluZS1sZW5ndGggODAgXCIxdyAvdG1wL3hcIiBpbnB1dC50eHQnLFxuXHRcdFx0XHQnc2VkIC0tbGluZS1sZW5ndGg9ODAgXCIxciAvZXRjL3Bhc3N3ZFwiIGlucHV0LnR4dCcsXG5cdFx0XHRcdCdzZWQgXCJzL2EvXFxcXFwiLztlIGlkXCIgaW5wdXQudHh0Jyxcblx0XHRcdFx0J3NlZCBcIi94L3A7Ly9lIGlkXCIgaW5wdXQudHh0Jyxcblx0XHRcdFx0J3NlZCBlJyxcblx0XHRcdF07XG5cdFx0XHRkZWVwU3RyaWN0RXF1YWwoYXdhaXQgUHJvbWlzZS5hbGwoY29tbWFuZHMubWFwKGlzQXV0b0FwcHJvdmVkKSksIGNvbW1hbmRzLm1hcCgoKSA9PiBmYWxzZSkpO1xuXHRcdH0pO1xuXHR9KTtcblxuXHRzdWl0ZSgnYXV0b0FwcHJvdmUgd2l0aCBhbGxvdyBwYXR0ZXJucyBvbmx5JywgKCkgPT4ge1xuXHRcdHRlc3QoJ3Nob3VsZCBhdXRvLWFwcHJvdmUgZXhhY3QgY29tbWFuZCBtYXRjaCcsIGFzeW5jICgpID0+IHtcblx0XHRcdHNldEF1dG9BcHByb3ZlKHtcblx0XHRcdFx0J2VjaG8nOiB0cnVlXG5cdFx0XHR9KTtcblx0XHRcdG9rKGF3YWl0IGlzQXV0b0FwcHJvdmVkKCdlY2hvJykpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnc2hvdWxkIGF1dG8tYXBwcm92ZSBjb21tYW5kIHdpdGggYXJndW1lbnRzJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0c2V0QXV0b0FwcHJvdmUoe1xuXHRcdFx0XHQnZWNobyc6IHRydWVcblx0XHRcdH0pO1xuXHRcdFx0b2soYXdhaXQgaXNBdXRvQXBwcm92ZWQoJ2VjaG8gaGVsbG8gd29ybGQnKSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdzaG91bGQgbm90IGF1dG8tYXBwcm92ZSB3aGVuIHRoZXJlIGlzIG5vIG1hdGNoJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0c2V0QXV0b0FwcHJvdmUoe1xuXHRcdFx0XHQnZWNobyc6IHRydWVcblx0XHRcdH0pO1xuXHRcdFx0b2soIWF3YWl0IGlzQXV0b0FwcHJvdmVkKCdscycpKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3Nob3VsZCBub3QgYXV0by1hcHByb3ZlIHBhcnRpYWwgY29tbWFuZCBtYXRjaGVzJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0c2V0QXV0b0FwcHJvdmUoe1xuXHRcdFx0XHQnZWNobyc6IHRydWVcblx0XHRcdH0pO1xuXHRcdFx0b2soIWF3YWl0IGlzQXV0b0FwcHJvdmVkKCdlY2hvdGVzdCcpKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3Nob3VsZCBoYW5kbGUgbXVsdGlwbGUgY29tbWFuZHMgaW4gYXV0b0FwcHJvdmUnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRzZXRBdXRvQXBwcm92ZSh7XG5cdFx0XHRcdCdlY2hvJzogdHJ1ZSxcblx0XHRcdFx0J2xzJzogdHJ1ZSxcblx0XHRcdFx0J3B3ZCc6IHRydWVcblx0XHRcdH0pO1xuXHRcdFx0b2soYXdhaXQgaXNBdXRvQXBwcm92ZWQoJ2VjaG8nKSk7XG5cdFx0XHRvayhhd2FpdCBpc0F1dG9BcHByb3ZlZCgnbHMgLWxhJykpO1xuXHRcdFx0b2soYXdhaXQgaXNBdXRvQXBwcm92ZWQoJ3B3ZCcpKTtcblx0XHRcdG9rKCFhd2FpdCBpc0F1dG9BcHByb3ZlZCgncm0nKSk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHN1aXRlKCdhdXRvQXBwcm92ZSB3aXRoIGRlbnkgcGF0dGVybnMgb25seScsICgpID0+IHtcblx0XHR0ZXN0KCdzaG91bGQgZGVueSBjb21tYW5kcyBpbiBhdXRvQXBwcm92ZScsIGFzeW5jICgpID0+IHtcblx0XHRcdHNldEF1dG9BcHByb3ZlKHtcblx0XHRcdFx0J3JtJzogZmFsc2UsXG5cdFx0XHRcdCdkZWwnOiBmYWxzZVxuXHRcdFx0fSk7XG5cdFx0XHRvayghYXdhaXQgaXNBdXRvQXBwcm92ZWQoJ3JtIGZpbGUudHh0JykpO1xuXHRcdFx0b2soIWF3YWl0IGlzQXV0b0FwcHJvdmVkKCdkZWwgZmlsZS50eHQnKSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdzaG91bGQgbm90IGF1dG8tYXBwcm92ZSBzYWZlIGNvbW1hbmRzIHdoZW4gbm8gYWxsb3cgcGF0dGVybnMgYXJlIHByZXNlbnQnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRzZXRBdXRvQXBwcm92ZSh7XG5cdFx0XHRcdCdybSc6IGZhbHNlXG5cdFx0XHR9KTtcblx0XHRcdG9rKCFhd2FpdCBpc0F1dG9BcHByb3ZlZCgnZWNobyBoZWxsbycpKTtcblx0XHRcdG9rKCFhd2FpdCBpc0F1dG9BcHByb3ZlZCgnbHMnKSk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHN1aXRlKCdhdXRvQXBwcm92ZSB3aXRoIG1peGVkIGFsbG93IGFuZCBkZW55IHBhdHRlcm5zJywgKCkgPT4ge1xuXHRcdHRlc3QoJ3Nob3VsZCBkZW55IGNvbW1hbmRzIHNldCB0byBmYWxzZSBldmVuIGlmIG90aGVyIGNvbW1hbmRzIGFyZSBzZXQgdG8gdHJ1ZScsIGFzeW5jICgpID0+IHtcblx0XHRcdHNldEF1dG9BcHByb3ZlKHtcblx0XHRcdFx0J2VjaG8nOiB0cnVlLFxuXHRcdFx0XHQncm0nOiBmYWxzZVxuXHRcdFx0fSk7XG5cdFx0XHRvayhhd2FpdCBpc0F1dG9BcHByb3ZlZCgnZWNobyBoZWxsbycpKTtcblx0XHRcdG9rKCFhd2FpdCBpc0F1dG9BcHByb3ZlZCgncm0gZmlsZS50eHQnKSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdzaG91bGQgYXV0by1hcHByb3ZlIGFsbG93IHBhdHRlcm5zIG5vdCBzZXQgdG8gZmFsc2UnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRzZXRBdXRvQXBwcm92ZSh7XG5cdFx0XHRcdCdlY2hvJzogdHJ1ZSxcblx0XHRcdFx0J2xzJzogdHJ1ZSxcblx0XHRcdFx0J3B3ZCc6IHRydWUsXG5cdFx0XHRcdCdybSc6IGZhbHNlLFxuXHRcdFx0XHQnZGVsJzogZmFsc2Vcblx0XHRcdH0pO1xuXHRcdFx0b2soYXdhaXQgaXNBdXRvQXBwcm92ZWQoJ2VjaG8nKSk7XG5cdFx0XHRvayhhd2FpdCBpc0F1dG9BcHByb3ZlZCgnbHMnKSk7XG5cdFx0XHRvayhhd2FpdCBpc0F1dG9BcHByb3ZlZCgncHdkJykpO1xuXHRcdFx0b2soIWF3YWl0IGlzQXV0b0FwcHJvdmVkKCdybScpKTtcblx0XHRcdG9rKCFhd2FpdCBpc0F1dG9BcHByb3ZlZCgnZGVsJykpO1xuXHRcdH0pO1xuXHR9KTtcblxuXHRzdWl0ZSgncmVnZXggcGF0dGVybnMnLCAoKSA9PiB7XG5cdFx0dGVzdCgnc2hvdWxkIGhhbmRsZSAvLiovJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0c2V0QXV0b0FwcHJvdmUoe1xuXHRcdFx0XHQnLy4qLyc6IHRydWUsXG5cdFx0XHR9KTtcblxuXHRcdFx0b2soYXdhaXQgaXNBdXRvQXBwcm92ZWQoJ2VjaG8gaGVsbG8nKSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdzaG91bGQgaGFuZGxlIHJlZ2V4IHBhdHRlcm5zIGluIGF1dG9BcHByb3ZlJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0c2V0QXV0b0FwcHJvdmUoe1xuXHRcdFx0XHQnL15lY2hvLyc6IHRydWUsXG5cdFx0XHRcdCcvXmxzLyc6IHRydWUsXG5cdFx0XHRcdCdwd2QnOiB0cnVlXG5cdFx0XHR9KTtcblxuXHRcdFx0b2soYXdhaXQgaXNBdXRvQXBwcm92ZWQoJ2VjaG8gaGVsbG8nKSk7XG5cdFx0XHRvayhhd2FpdCBpc0F1dG9BcHByb3ZlZCgnbHMgLWxhJykpO1xuXHRcdFx0b2soYXdhaXQgaXNBdXRvQXBwcm92ZWQoJ3B3ZCcpKTtcblx0XHRcdG9rKCFhd2FpdCBpc0F1dG9BcHByb3ZlZCgncm0gZmlsZScpKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3Nob3VsZCBoYW5kbGUgcmVnZXggcGF0dGVybnMgZm9yIGRlbnknLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRzZXRBdXRvQXBwcm92ZSh7XG5cdFx0XHRcdCdlY2hvJzogdHJ1ZSxcblx0XHRcdFx0J3JtJzogdHJ1ZSxcblx0XHRcdFx0Jy9ecm1cXFxccysvJzogZmFsc2UsXG5cdFx0XHRcdCcvXmRlbFxcXFxzKy8nOiBmYWxzZVxuXHRcdFx0fSk7XG5cblx0XHRcdG9rKGF3YWl0IGlzQXV0b0FwcHJvdmVkKCdlY2hvIGhlbGxvJykpO1xuXHRcdFx0b2soYXdhaXQgaXNBdXRvQXBwcm92ZWQoJ3JtJykpO1xuXHRcdFx0b2soIWF3YWl0IGlzQXV0b0FwcHJvdmVkKCdybSBmaWxlLnR4dCcpKTtcblx0XHRcdG9rKCFhd2FpdCBpc0F1dG9BcHByb3ZlZCgnZGVsIGZpbGUudHh0JykpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnc2hvdWxkIGhhbmRsZSBjb21wbGV4IHJlZ2V4IHBhdHRlcm5zJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0c2V0QXV0b0FwcHJvdmUoe1xuXHRcdFx0XHQnL14oZWNob3xsc3xwd2QpXFxcXGIvJzogdHJ1ZSxcblx0XHRcdFx0Jy9eZ2l0IChzdGF0dXN8c2hvd1xcXFxiLiopJC8nOiB0cnVlLFxuXHRcdFx0XHQnL3JtfGRlbHxraWxsLyc6IGZhbHNlXG5cdFx0XHR9KTtcblxuXHRcdFx0b2soYXdhaXQgaXNBdXRvQXBwcm92ZWQoJ2VjaG8gdGVzdCcpKTtcblx0XHRcdG9rKGF3YWl0IGlzQXV0b0FwcHJvdmVkKCdscyAtbGEnKSk7XG5cdFx0XHRvayhhd2FpdCBpc0F1dG9BcHByb3ZlZCgncHdkJykpO1xuXHRcdFx0b2soYXdhaXQgaXNBdXRvQXBwcm92ZWQoJ2dpdCBzdGF0dXMnKSk7XG5cdFx0XHRvayhhd2FpdCBpc0F1dG9BcHByb3ZlZCgnZ2l0IHNob3cnKSk7XG5cdFx0XHRvayhhd2FpdCBpc0F1dG9BcHByb3ZlZCgnZ2l0IHNob3cgSEVBRCcpKTtcblx0XHRcdG9rKCFhd2FpdCBpc0F1dG9BcHByb3ZlZCgncm0gZmlsZScpKTtcblx0XHRcdG9rKCFhd2FpdCBpc0F1dG9BcHByb3ZlZCgnZGVsIGZpbGUnKSk7XG5cdFx0XHRvayghYXdhaXQgaXNBdXRvQXBwcm92ZWQoJ2tpbGwgcHJvY2VzcycpKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3Nob3VsZCBoYW5kbGUgZ2l0IHBhdHRlcm5zIHdpdGggLUMgYW5kIC0tbm8tcGFnZXInLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRzZXRBdXRvQXBwcm92ZSh7XG5cdFx0XHRcdCcvXmdpdChcXFxccysoLUNcXFxccytcXFxcUyt8LS1uby1wYWdlcikpKlxcXFxzK3N0YXR1c1xcXFxiLyc6IHRydWUsXG5cdFx0XHRcdCcvXmdpdChcXFxccysoLUNcXFxccytcXFxcUyt8LS1uby1wYWdlcikpKlxcXFxzK2xvZ1xcXFxiLyc6IHRydWUsXG5cdFx0XHRcdCcvXmdpdChcXFxccysoLUNcXFxccytcXFxcUyt8LS1uby1wYWdlcikpKlxcXFxzK3Nob3dcXFxcYi8nOiB0cnVlLFxuXHRcdFx0XHQnL15naXQoXFxcXHMrKC1DXFxcXHMrXFxcXFMrfC0tbm8tcGFnZXIpKSpcXFxccytkaWZmXFxcXGIvJzogdHJ1ZSxcblx0XHRcdFx0Jy9eZ2l0KFxcXFxzKygtQ1xcXFxzK1xcXFxTK3wtLW5vLXBhZ2VyKSkqXFxcXHMrbHMtZmlsZXNcXFxcYi8nOiB0cnVlLFxuXHRcdFx0XHQnL15naXQoXFxcXHMrKC1DXFxcXHMrXFxcXFMrfC0tbm8tcGFnZXIpKSpcXFxccytncmVwXFxcXGIvJzogdHJ1ZSxcblx0XHRcdFx0Jy9eZ2l0KFxcXFxzKygtQ1xcXFxzK1xcXFxTK3wtLW5vLXBhZ2VyKSkqXFxcXHMrYnJhbmNoXFxcXGIvJzogdHJ1ZSxcblx0XHRcdFx0Jy9eZ2l0KFxcXFxzKygtQ1xcXFxzK1xcXFxTK3wtLW5vLXBhZ2VyKSkqXFxcXHMrYnJhbmNoXFxcXGIuKi0oZHxEfG18TXwtZGVsZXRlfC1mb3JjZSlcXFxcYi8nOiBmYWxzZSxcblx0XHRcdH0pO1xuXG5cdFx0XHQvLyBCYXNpYyBjb21tYW5kc1xuXHRcdFx0b2soYXdhaXQgaXNBdXRvQXBwcm92ZWQoJ2dpdCBzdGF0dXMnKSk7XG5cdFx0XHRvayhhd2FpdCBpc0F1dG9BcHByb3ZlZCgnZ2l0IGxvZycpKTtcblx0XHRcdG9rKGF3YWl0IGlzQXV0b0FwcHJvdmVkKCdnaXQgc2hvdyBIRUFEJykpO1xuXHRcdFx0b2soYXdhaXQgaXNBdXRvQXBwcm92ZWQoJ2dpdCBkaWZmJykpO1xuXHRcdFx0b2soYXdhaXQgaXNBdXRvQXBwcm92ZWQoJ2dpdCBscy1maWxlcycpKTtcblx0XHRcdG9rKGF3YWl0IGlzQXV0b0FwcHJvdmVkKCdnaXQgZ3JlcCBwYXR0ZXJuJykpO1xuXHRcdFx0b2soYXdhaXQgaXNBdXRvQXBwcm92ZWQoJ2dpdCBicmFuY2gnKSk7XG5cblx0XHRcdC8vIGxzLWZpbGVzIHdpdGggb3B0aW9uc1xuXHRcdFx0b2soYXdhaXQgaXNBdXRvQXBwcm92ZWQoJ2dpdCBscy1maWxlcyAtLWNhY2hlZCcpKTtcblx0XHRcdG9rKGF3YWl0IGlzQXV0b0FwcHJvdmVkKCdnaXQgLUMgL3BhdGggbHMtZmlsZXMnKSk7XG5cdFx0XHRvayhhd2FpdCBpc0F1dG9BcHByb3ZlZCgnZ2l0IC0tbm8tcGFnZXIgbHMtZmlsZXMnKSk7XG5cblx0XHRcdC8vIFdpdGggLUMgcGF0aFxuXHRcdFx0b2soYXdhaXQgaXNBdXRvQXBwcm92ZWQoJ2dpdCAtQyAvc29tZS9wYXRoIHN0YXR1cycpKTtcblx0XHRcdG9rKGF3YWl0IGlzQXV0b0FwcHJvdmVkKCdnaXQgLUMgLi4vcmVsYXRpdmUgbG9nJykpO1xuXHRcdFx0b2soYXdhaXQgaXNBdXRvQXBwcm92ZWQoJ2dpdCAtQyAuIGRpZmYnKSk7XG5cblx0XHRcdC8vIFdpdGggLS1uby1wYWdlclxuXHRcdFx0b2soYXdhaXQgaXNBdXRvQXBwcm92ZWQoJ2dpdCAtLW5vLXBhZ2VyIHN0YXR1cycpKTtcblx0XHRcdG9rKGF3YWl0IGlzQXV0b0FwcHJvdmVkKCdnaXQgLS1uby1wYWdlciBsb2cnKSk7XG5cdFx0XHRvayhhd2FpdCBpc0F1dG9BcHByb3ZlZCgnZ2l0IC0tbm8tcGFnZXIgZGlmZiBIRUFEfjEnKSk7XG5cblx0XHRcdC8vIFdpdGggYm90aCAtQyBhbmQgLS1uby1wYWdlclxuXHRcdFx0b2soYXdhaXQgaXNBdXRvQXBwcm92ZWQoJ2dpdCAtQyAvcGF0aCAtLW5vLXBhZ2VyIHN0YXR1cycpKTtcblx0XHRcdG9rKGF3YWl0IGlzQXV0b0FwcHJvdmVkKCdnaXQgLS1uby1wYWdlciAtQyAvcGF0aCBsb2cnKSk7XG5cdFx0XHRvayhhd2FpdCBpc0F1dG9BcHByb3ZlZCgnZ2l0IC1DIC9wYXRoMSAtQyAvcGF0aDIgc3RhdHVzJykpO1xuXHRcdFx0b2soYXdhaXQgaXNBdXRvQXBwcm92ZWQoJ2dpdCAtLW5vLXBhZ2VyIC0tbm8tcGFnZXIgbG9nJykpO1xuXG5cdFx0XHQvLyBCcmFuY2ggZGVsZXRpb24gc2hvdWxkIGJlIGRlbmllZFxuXHRcdFx0b2soIWF3YWl0IGlzQXV0b0FwcHJvdmVkKCdnaXQgYnJhbmNoIC1kIGZlYXR1cmUnKSk7XG5cdFx0XHRvayghYXdhaXQgaXNBdXRvQXBwcm92ZWQoJ2dpdCBicmFuY2ggLUQgZmVhdHVyZScpKTtcblx0XHRcdG9rKCFhd2FpdCBpc0F1dG9BcHByb3ZlZCgnZ2l0IGJyYW5jaCAtLWRlbGV0ZSBmZWF0dXJlJykpO1xuXHRcdFx0b2soIWF3YWl0IGlzQXV0b0FwcHJvdmVkKCdnaXQgLUMgL3BhdGggYnJhbmNoIC1kIGZlYXR1cmUnKSk7XG5cdFx0XHRvayghYXdhaXQgaXNBdXRvQXBwcm92ZWQoJ2dpdCAtLW5vLXBhZ2VyIGJyYW5jaCAtRCBmZWF0dXJlJykpO1xuXHRcdFx0b2soIWF3YWl0IGlzQXV0b0FwcHJvdmVkKCdnaXQgLUMgL3BhdGggLS1uby1wYWdlciBicmFuY2ggLS1mb3JjZScpKTtcblxuXHRcdFx0Ly8gQnJhbmNoIHJlbmFtZSBzaG91bGQgYmUgZGVuaWVkXG5cdFx0XHRvayghYXdhaXQgaXNBdXRvQXBwcm92ZWQoJ2dpdCBicmFuY2ggLW0gb2xkIG5ldycpKTtcblx0XHRcdG9rKCFhd2FpdCBpc0F1dG9BcHByb3ZlZCgnZ2l0IGJyYW5jaCAtTSBvbGQgbmV3JykpO1xuXHRcdFx0b2soIWF3YWl0IGlzQXV0b0FwcHJvdmVkKCdnaXQgLUMgL3BhdGggYnJhbmNoIC1tIG9sZCBuZXcnKSk7XG5cdFx0fSk7XG5cblx0XHRzdWl0ZSgnZmxhZ3MnLCAoKSA9PiB7XG5cdFx0XHR0ZXN0KCdzaG91bGQgaGFuZGxlIGNhc2UtaW5zZW5zaXRpdmUgcmVnZXggcGF0dGVybnMgd2l0aCBpIGZsYWcnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRcdHNldEF1dG9BcHByb3ZlKHtcblx0XHRcdFx0XHQnL15lY2hvL2knOiB0cnVlLFxuXHRcdFx0XHRcdCcvXmxzL2knOiB0cnVlLFxuXHRcdFx0XHRcdCcvcm18ZGVsL2knOiBmYWxzZVxuXHRcdFx0XHR9KTtcblxuXHRcdFx0XHRvayhhd2FpdCBpc0F1dG9BcHByb3ZlZCgnZWNobyBoZWxsbycpKTtcblx0XHRcdFx0b2soYXdhaXQgaXNBdXRvQXBwcm92ZWQoJ0VDSE8gaGVsbG8nKSk7XG5cdFx0XHRcdG9rKGF3YWl0IGlzQXV0b0FwcHJvdmVkKCdFY2hvIGhlbGxvJykpO1xuXHRcdFx0XHRvayhhd2FpdCBpc0F1dG9BcHByb3ZlZCgnbHMgLWxhJykpO1xuXHRcdFx0XHRvayhhd2FpdCBpc0F1dG9BcHByb3ZlZCgnTFMgLWxhJykpO1xuXHRcdFx0XHRvayhhd2FpdCBpc0F1dG9BcHByb3ZlZCgnTHMgLWxhJykpO1xuXHRcdFx0XHRvayghYXdhaXQgaXNBdXRvQXBwcm92ZWQoJ3JtIGZpbGUnKSk7XG5cdFx0XHRcdG9rKCFhd2FpdCBpc0F1dG9BcHByb3ZlZCgnUk0gZmlsZScpKTtcblx0XHRcdFx0b2soIWF3YWl0IGlzQXV0b0FwcHJvdmVkKCdkZWwgZmlsZScpKTtcblx0XHRcdFx0b2soIWF3YWl0IGlzQXV0b0FwcHJvdmVkKCdERUwgZmlsZScpKTtcblx0XHRcdH0pO1xuXG5cdFx0XHR0ZXN0KCdzaG91bGQgaGFuZGxlIG11bHRpcGxlIHJlZ2V4IGZsYWdzJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0XHRzZXRBdXRvQXBwcm92ZSh7XG5cdFx0XHRcdFx0Jy9eZ2l0XFxcXHMrL2dpbSc6IHRydWUsXG5cdFx0XHRcdFx0Jy9kYW5nZXJvdXMvZ2ltJzogZmFsc2Vcblx0XHRcdFx0fSk7XG5cblx0XHRcdFx0b2soYXdhaXQgaXNBdXRvQXBwcm92ZWQoJ2dpdCBzdGF0dXMnKSk7XG5cdFx0XHRcdG9rKGF3YWl0IGlzQXV0b0FwcHJvdmVkKCdHSVQgc3RhdHVzJykpO1xuXHRcdFx0XHRvayhhd2FpdCBpc0F1dG9BcHByb3ZlZCgnR2l0IHN0YXR1cycpKTtcblx0XHRcdFx0b2soIWF3YWl0IGlzQXV0b0FwcHJvdmVkKCdkYW5nZXJvdXMgY29tbWFuZCcpKTtcblx0XHRcdFx0b2soIWF3YWl0IGlzQXV0b0FwcHJvdmVkKCdEQU5HRVJPVVMgY29tbWFuZCcpKTtcblx0XHRcdH0pO1xuXG5cdFx0XHR0ZXN0KCdzaG91bGQgaGFuZGxlIHZhcmlvdXMgcmVnZXggZmxhZ3MnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRcdHNldEF1dG9BcHByb3ZlKHtcblx0XHRcdFx0XHQnL15lY2hvLiovcyc6IHRydWUsICAvLyBkb3RhbGwgZmxhZ1xuXHRcdFx0XHRcdCcvXmdpdFxcXFxzKy9pJzogdHJ1ZSwgLy8gY2FzZS1pbnNlbnNpdGl2ZSBmbGFnXG5cdFx0XHRcdFx0Jy9ybXxkZWwvZyc6IGZhbHNlICAgLy8gZ2xvYmFsIGZsYWdcblx0XHRcdFx0fSk7XG5cblx0XHRcdFx0b2soYXdhaXQgaXNBdXRvQXBwcm92ZWQoJ2VjaG8gaGVsbG9cXG53b3JsZCcpKTtcblx0XHRcdFx0b2soYXdhaXQgaXNBdXRvQXBwcm92ZWQoJ2dpdCBzdGF0dXMnKSk7XG5cdFx0XHRcdG9rKGF3YWl0IGlzQXV0b0FwcHJvdmVkKCdHSVQgc3RhdHVzJykpO1xuXHRcdFx0XHRvayghYXdhaXQgaXNBdXRvQXBwcm92ZWQoJ3JtIGZpbGUnKSk7XG5cdFx0XHRcdG9rKCFhd2FpdCBpc0F1dG9BcHByb3ZlZCgnZGVsIGZpbGUnKSk7XG5cdFx0XHR9KTtcblxuXHRcdFx0dGVzdCgnc2hvdWxkIGhhbmRsZSByZWdleCBwYXR0ZXJucyB3aXRob3V0IGZsYWdzJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0XHRzZXRBdXRvQXBwcm92ZSh7XG5cdFx0XHRcdFx0Jy9eZWNoby8nOiB0cnVlLFxuXHRcdFx0XHRcdCcvcm18ZGVsLyc6IGZhbHNlXG5cdFx0XHRcdH0pO1xuXG5cdFx0XHRcdG9rKGF3YWl0IGlzQXV0b0FwcHJvdmVkKCdlY2hvIGhlbGxvJykpO1xuXHRcdFx0XHRvayghYXdhaXQgaXNBdXRvQXBwcm92ZWQoJ0VDSE8gaGVsbG8nKSwgJ1Nob3VsZCBiZSBjYXNlLXNlbnNpdGl2ZSB3aXRob3V0IGkgZmxhZycpO1xuXHRcdFx0XHRvayghYXdhaXQgaXNBdXRvQXBwcm92ZWQoJ3JtIGZpbGUnKSk7XG5cdFx0XHRcdG9rKCFhd2FpdCBpc0F1dG9BcHByb3ZlZCgnUk0gZmlsZScpLCAnU2hvdWxkIGJlIGNhc2Utc2Vuc2l0aXZlIHdpdGhvdXQgaSBmbGFnJyk7XG5cdFx0XHR9KTtcblx0XHR9KTtcblx0fSk7XG5cblx0c3VpdGUoJ2VkZ2UgY2FzZXMnLCAoKSA9PiB7XG5cdFx0dGVzdCgnc2hvdWxkIGhhbmRsZSBlbXB0eSBhdXRvQXBwcm92ZScsIGFzeW5jICgpID0+IHtcblx0XHRcdHNldEF1dG9BcHByb3ZlKHt9KTtcblxuXHRcdFx0b2soIWF3YWl0IGlzQXV0b0FwcHJvdmVkKCdlY2hvIGhlbGxvJykpO1xuXHRcdFx0b2soIWF3YWl0IGlzQXV0b0FwcHJvdmVkKCdscycpKTtcblx0XHRcdG9rKCFhd2FpdCBpc0F1dG9BcHByb3ZlZCgncm0gZmlsZScpKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3Nob3VsZCBoYW5kbGUgZW1wdHkgY29tbWFuZCBzdHJpbmdzJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0c2V0QXV0b0FwcHJvdmUoe1xuXHRcdFx0XHQnZWNobyc6IHRydWVcblx0XHRcdH0pO1xuXG5cdFx0XHRvayghYXdhaXQgaXNBdXRvQXBwcm92ZWQoJycpKTtcblx0XHRcdG9rKCFhd2FpdCBpc0F1dG9BcHByb3ZlZCgnICAgJykpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnc2hvdWxkIGhhbmRsZSB3aGl0ZXNwYWNlIGluIGNvbW1hbmRzJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0c2V0QXV0b0FwcHJvdmUoe1xuXHRcdFx0XHQnZWNobyc6IHRydWVcblx0XHRcdH0pO1xuXG5cdFx0XHRvayhhd2FpdCBpc0F1dG9BcHByb3ZlZCgnZWNobyAgIGhlbGxvICAgd29ybGQnKSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdzaG91bGQgYmUgY2FzZS1zZW5zaXRpdmUgYnkgZGVmYXVsdCcsIGFzeW5jICgpID0+IHtcblx0XHRcdHNldEF1dG9BcHByb3ZlKHtcblx0XHRcdFx0J2VjaG8nOiB0cnVlXG5cdFx0XHR9KTtcblxuXHRcdFx0b2soYXdhaXQgaXNBdXRvQXBwcm92ZWQoJ2VjaG8gaGVsbG8nKSk7XG5cdFx0XHRvayghYXdhaXQgaXNBdXRvQXBwcm92ZWQoJ0VDSE8gaGVsbG8nKSk7XG5cdFx0XHRvayghYXdhaXQgaXNBdXRvQXBwcm92ZWQoJ0VjaG8gaGVsbG8nKSk7XG5cdFx0fSk7XG5cblx0XHQvLyBodHRwczovL2dpdGh1Yi5jb20vbWljcm9zb2Z0L3ZzY29kZS9pc3N1ZXMvMjUyNDExXG5cdFx0dGVzdCgnc2hvdWxkIGhhbmRsZSBzdHJpbmctYmFzZWQgdmFsdWVzIHdpdGggc3BlY2lhbCByZWdleCBjaGFyYWN0ZXJzJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0c2V0QXV0b0FwcHJvdmUoe1xuXHRcdFx0XHQncHdzaC5leGUgLUZpbGUgRDpcXFxcZm9vLmJhclxcXFxhLXNjcmlwdC5wczEnOiB0cnVlXG5cdFx0XHR9KTtcblxuXHRcdFx0b2soYXdhaXQgaXNBdXRvQXBwcm92ZWQoJ3B3c2guZXhlIC1GaWxlIEQ6XFxcXGZvby5iYXJcXFxcYS1zY3JpcHQucHMxJykpO1xuXHRcdFx0b2soYXdhaXQgaXNBdXRvQXBwcm92ZWQoJ3B3c2guZXhlIC1GaWxlIEQ6XFxcXGZvby5iYXJcXFxcYS1zY3JpcHQucHMxIC1Bbm90aGVyQXJnJykpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnc2hvdWxkIGlnbm9yZSB0aGUgZW1wdHkgc3RyaW5nIGtleScsIGFzeW5jICgpID0+IHtcblx0XHRcdHNldEF1dG9BcHByb3ZlKHtcblx0XHRcdFx0Jyc6IHRydWVcblx0XHRcdH0pO1xuXG5cdFx0XHRvayghYXdhaXQgaXNBdXRvQXBwcm92ZWQoJ2VjaG8gaGVsbG8nKSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdzaG91bGQgaGFuZGxlIGVtcHR5IHJlZ2V4IHBhdHRlcm5zIHRoYXQgY291bGQgY2F1c2UgZW5kbGVzcyBsb29wcycsIGFzeW5jICgpID0+IHtcblx0XHRcdHNldEF1dG9BcHByb3ZlKHtcblx0XHRcdFx0Jy8vJzogdHJ1ZSxcblx0XHRcdFx0Jy8oPzopLyc6IHRydWUsXG5cdFx0XHRcdCcvKi8nOiB0cnVlLCAgICAgICAgICAgIC8vIEludmFsaWQgcmVnZXggcGF0dGVyblxuXHRcdFx0XHQnLy4qKi8nOiB0cnVlICAgICAgICAgICAvLyBJbnZhbGlkIHJlZ2V4IHBhdHRlcm5cblx0XHRcdH0pO1xuXG5cdFx0XHQvLyBUaGVzZSBwYXR0ZXJucyBzaG91bGQgbm90IGNhdXNlIGVuZGxlc3MgbG9vcHMgYW5kIHNob3VsZCBub3QgbWF0Y2ggYW55IGNvbW1hbmRzXG5cdFx0XHQvLyBJbnZhbGlkIHBhdHRlcm5zIHNob3VsZCBiZSBoYW5kbGVkIGdyYWNlZnVsbHkgYW5kIG5vdCBtYXRjaCBhbnl0aGluZ1xuXHRcdFx0b2soIWF3YWl0IGlzQXV0b0FwcHJvdmVkKCdlY2hvIGhlbGxvJykpO1xuXHRcdFx0b2soIWF3YWl0IGlzQXV0b0FwcHJvdmVkKCdscycpKTtcblx0XHRcdG9rKCFhd2FpdCBpc0F1dG9BcHByb3ZlZCgnJykpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnc2hvdWxkIGhhbmRsZSByZWdleCBwYXR0ZXJucyB0aGF0IHdvdWxkIGNhdXNlIGVuZGxlc3MgbG9vcHMnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRzZXRBdXRvQXBwcm92ZSh7XG5cdFx0XHRcdCcvYSovJzogdHJ1ZSxcblx0XHRcdFx0Jy9iPy8nOiB0cnVlLFxuXHRcdFx0XHQnLyh4fCkqLyc6IHRydWUsXG5cdFx0XHRcdCcvKD86KSovJzogdHJ1ZVxuXHRcdFx0fSk7XG5cblx0XHRcdC8vIENvbW1hbmRzIHNob3VsZCBzdGlsbCB3b3JrIG5vcm1hbGx5LCBlbmRsZXNzIGxvb3AgcGF0dGVybnMgc2hvdWxkIGJlIHNhZmVseSBoYW5kbGVkXG5cdFx0XHRvayghYXdhaXQgaXNBdXRvQXBwcm92ZWQoJ2VjaG8gaGVsbG8nKSk7XG5cdFx0XHRvayghYXdhaXQgaXNBdXRvQXBwcm92ZWQoJ2xzJykpO1xuXHRcdFx0b2soIWF3YWl0IGlzQXV0b0FwcHJvdmVkKCdhJykpO1xuXHRcdFx0b2soIWF3YWl0IGlzQXV0b0FwcHJvdmVkKCdiJykpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnc2hvdWxkIGhhbmRsZSBtaXhlZCB2YWxpZCBhbmQgcHJvYmxlbWF0aWMgcmVnZXggcGF0dGVybnMnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRzZXRBdXRvQXBwcm92ZSh7XG5cdFx0XHRcdCcvXmVjaG8vJzogdHJ1ZSwgICAgICAgIC8vIFZhbGlkIHBhdHRlcm5cblx0XHRcdFx0Jy8vJzogdHJ1ZSwgICAgICAgICAgICAgLy8gRW1wdHkgcGF0dGVyblxuXHRcdFx0XHQnL15scy8nOiB0cnVlLCAgICAgICAgICAvLyBWYWxpZCBwYXR0ZXJuXG5cdFx0XHRcdCcvYSovJzogdHJ1ZSwgICAgICAgICAgIC8vIFBvdGVudGlhbCBlbmRsZXNzIGxvb3Bcblx0XHRcdFx0J3B3ZCc6IHRydWUgICAgICAgICAgICAgLy8gVmFsaWQgc3RyaW5nIHBhdHRlcm5cblx0XHRcdH0pO1xuXG5cdFx0XHRvayhhd2FpdCBpc0F1dG9BcHByb3ZlZCgnZWNobyBoZWxsbycpKTtcblx0XHRcdG9rKGF3YWl0IGlzQXV0b0FwcHJvdmVkKCdscyAtbGEnKSk7XG5cdFx0XHRvayhhd2FpdCBpc0F1dG9BcHByb3ZlZCgncHdkJykpO1xuXHRcdFx0b2soIWF3YWl0IGlzQXV0b0FwcHJvdmVkKCdybSBmaWxlJykpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnc2hvdWxkIGhhbmRsZSBpbnZhbGlkIHJlZ2V4IHBhdHRlcm5zIGdyYWNlZnVsbHknLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRzZXRBdXRvQXBwcm92ZSh7XG5cdFx0XHRcdCcvKi8nOiB0cnVlLCAgICAgICAgICAgICAgICAgICAgLy8gSW52YWxpZCByZWdleCAtIG5vdGhpbmcgdG8gcmVwZWF0XG5cdFx0XHRcdCcvKD86Ky8nOiB0cnVlLCAgICAgICAgICAgICAgICAgLy8gSW52YWxpZCByZWdleCAtIGluY29tcGxldGUgcXVhbnRpZmllclxuXHRcdFx0XHQnL1svJzogdHJ1ZSwgICAgICAgICAgICAgICAgICAgIC8vIEludmFsaWQgcmVnZXggLSB1bmNsb3NlZCBjaGFyYWN0ZXIgY2xhc3Ncblx0XHRcdFx0Jy9eZWNoby8nOiB0cnVlLCAgICAgICAgICAgICAgICAvLyBWYWxpZCBwYXR0ZXJuXG5cdFx0XHRcdCdscyc6IHRydWUgICAgICAgICAgICAgICAgICAgICAgLy8gVmFsaWQgc3RyaW5nIHBhdHRlcm5cblx0XHRcdH0pO1xuXG5cdFx0XHQvLyBWYWxpZCBwYXR0ZXJucyBzaG91bGQgc3RpbGwgd29ya1xuXHRcdFx0b2soYXdhaXQgaXNBdXRvQXBwcm92ZWQoJ2VjaG8gaGVsbG8nKSk7XG5cdFx0XHRvayhhd2FpdCBpc0F1dG9BcHByb3ZlZCgnbHMgLWxhJykpO1xuXHRcdFx0Ly8gSW52YWxpZCBwYXR0ZXJucyBzaG91bGQgbm90IG1hdGNoIGFueXRoaW5nIGFuZCBub3QgY2F1c2UgY3Jhc2hlc1xuXHRcdFx0b2soIWF3YWl0IGlzQXV0b0FwcHJvdmVkKCdyYW5kb20gY29tbWFuZCcpKTtcblx0XHR9KTtcblx0fSk7XG5cblx0c3VpdGUoJ3BhdGgtYXdhcmUgYXV0byBhcHByb3ZhbCcsICgpID0+IHtcblx0XHR0ZXN0KCdzaG91bGQgaGFuZGxlIHBhdGggdmFyaWF0aW9ucyB3aXRoIGZvcndhcmQgc2xhc2hlcycsIGFzeW5jICgpID0+IHtcblx0XHRcdHNldEF1dG9BcHByb3ZlKHtcblx0XHRcdFx0J2Jpbi9mb28nOiB0cnVlXG5cdFx0XHR9KTtcblxuXHRcdFx0Ly8gU2hvdWxkIGFwcHJvdmUgdGhlIGV4YWN0IG1hdGNoXG5cdFx0XHRvayhhd2FpdCBpc0F1dG9BcHByb3ZlZCgnYmluL2ZvbycpKTtcblx0XHRcdG9rKGF3YWl0IGlzQXV0b0FwcHJvdmVkKCdiaW4vZm9vIC0tYXJnJykpO1xuXG5cdFx0XHQvLyBTaG91bGQgYXBwcm92ZSB3aXRoIFdpbmRvd3MgYmFja3NsYXNoZXNcblx0XHRcdG9rKGF3YWl0IGlzQXV0b0FwcHJvdmVkKCdiaW5cXFxcZm9vJykpO1xuXHRcdFx0b2soYXdhaXQgaXNBdXRvQXBwcm92ZWQoJ2JpblxcXFxmb28gLS1hcmcnKSk7XG5cblx0XHRcdC8vIFNob3VsZCBhcHByb3ZlIHdpdGggY3VycmVudCBkaXJlY3RvcnkgcHJlZml4ZXNcblx0XHRcdG9rKGF3YWl0IGlzQXV0b0FwcHJvdmVkKCcuL2Jpbi9mb28nKSk7XG5cdFx0XHRvayhhd2FpdCBpc0F1dG9BcHByb3ZlZCgnLlxcXFxiaW4vZm9vJykpO1xuXHRcdFx0b2soYXdhaXQgaXNBdXRvQXBwcm92ZWQoJy4vYmluXFxcXGZvbycpKTtcblx0XHRcdG9rKGF3YWl0IGlzQXV0b0FwcHJvdmVkKCcuXFxcXGJpblxcXFxmb28nKSk7XG5cblx0XHRcdC8vIFNob3VsZCBub3QgYXBwcm92ZSBwYXJ0aWFsIG1hdGNoZXNcblx0XHRcdG9rKCFhd2FpdCBpc0F1dG9BcHByb3ZlZCgnYmluL2Zvb2JhcicpKTtcblx0XHRcdG9rKCFhd2FpdCBpc0F1dG9BcHByb3ZlZCgnbm90YmluL2ZvbycpKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3Nob3VsZCBoYW5kbGUgcGF0aCB2YXJpYXRpb25zIHdpdGggYmFja3NsYXNoZXMnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRzZXRBdXRvQXBwcm92ZSh7XG5cdFx0XHRcdCdiaW5cXFxcc2NyaXB0LmJhdCc6IHRydWVcblx0XHRcdH0pO1xuXG5cdFx0XHQvLyBTaG91bGQgYXBwcm92ZSB0aGUgZXhhY3QgbWF0Y2hcblx0XHRcdG9rKGF3YWl0IGlzQXV0b0FwcHJvdmVkKCdiaW5cXFxcc2NyaXB0LmJhdCcpKTtcblx0XHRcdG9rKGF3YWl0IGlzQXV0b0FwcHJvdmVkKCdiaW5cXFxcc2NyaXB0LmJhdCAtLWhlbHAnKSk7XG5cblx0XHRcdC8vIFNob3VsZCBhcHByb3ZlIHdpdGggZm9yd2FyZCBzbGFzaGVzXG5cdFx0XHRvayhhd2FpdCBpc0F1dG9BcHByb3ZlZCgnYmluL3NjcmlwdC5iYXQnKSk7XG5cdFx0XHRvayhhd2FpdCBpc0F1dG9BcHByb3ZlZCgnYmluL3NjcmlwdC5iYXQgLS1oZWxwJykpO1xuXG5cdFx0XHQvLyBTaG91bGQgYXBwcm92ZSB3aXRoIGN1cnJlbnQgZGlyZWN0b3J5IHByZWZpeGVzXG5cdFx0XHRvayhhd2FpdCBpc0F1dG9BcHByb3ZlZCgnLi9iaW5cXFxcc2NyaXB0LmJhdCcpKTtcblx0XHRcdG9rKGF3YWl0IGlzQXV0b0FwcHJvdmVkKCcuXFxcXGJpblxcXFxzY3JpcHQuYmF0JykpO1xuXHRcdFx0b2soYXdhaXQgaXNBdXRvQXBwcm92ZWQoJy4vYmluL3NjcmlwdC5iYXQnKSk7XG5cdFx0XHRvayhhd2FpdCBpc0F1dG9BcHByb3ZlZCgnLlxcXFxiaW4vc2NyaXB0LmJhdCcpKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3Nob3VsZCBoYW5kbGUgZGVlcCBwYXRocycsIGFzeW5jICgpID0+IHtcblx0XHRcdHNldEF1dG9BcHByb3ZlKHtcblx0XHRcdFx0J3NyYy91dGlscy9oZWxwZXIuanMnOiB0cnVlXG5cdFx0XHR9KTtcblxuXHRcdFx0b2soYXdhaXQgaXNBdXRvQXBwcm92ZWQoJ3NyYy91dGlscy9oZWxwZXIuanMnKSk7XG5cdFx0XHRvayhhd2FpdCBpc0F1dG9BcHByb3ZlZCgnc3JjXFxcXHV0aWxzXFxcXGhlbHBlci5qcycpKTtcblx0XHRcdG9rKGF3YWl0IGlzQXV0b0FwcHJvdmVkKCdzcmMvdXRpbHNcXFxcaGVscGVyLmpzJykpO1xuXHRcdFx0b2soYXdhaXQgaXNBdXRvQXBwcm92ZWQoJ3NyY1xcXFx1dGlscy9oZWxwZXIuanMnKSk7XG5cdFx0XHRvayhhd2FpdCBpc0F1dG9BcHByb3ZlZCgnLi9zcmMvdXRpbHMvaGVscGVyLmpzJykpO1xuXHRcdFx0b2soYXdhaXQgaXNBdXRvQXBwcm92ZWQoJy5cXFxcc3JjXFxcXHV0aWxzXFxcXGhlbHBlci5qcycpKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3Nob3VsZCBub3QgdHJlYXQgbm9uLXBhdGhzIGFzIHBhdGhzJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0c2V0QXV0b0FwcHJvdmUoe1xuXHRcdFx0XHQnZWNobyc6IHRydWUsICAvLyBOb3QgYSBwYXRoXG5cdFx0XHRcdCdscyc6IHRydWUsICAgIC8vIE5vdCBhIHBhdGhcblx0XHRcdFx0J2dpdCc6IHRydWUgICAgLy8gTm90IGEgcGF0aFxuXHRcdFx0fSk7XG5cblx0XHRcdC8vIFRoZXNlIHNob3VsZCB3b3JrIGFzIG5vcm1hbCBjb21tYW5kIG1hdGNoaW5nLCBub3QgcGF0aCBtYXRjaGluZ1xuXHRcdFx0b2soYXdhaXQgaXNBdXRvQXBwcm92ZWQoJ2VjaG8nKSk7XG5cdFx0XHRvayhhd2FpdCBpc0F1dG9BcHByb3ZlZCgnbHMnKSk7XG5cdFx0XHRvayhhd2FpdCBpc0F1dG9BcHByb3ZlZCgnZ2l0JykpO1xuXG5cdFx0XHQvLyBTaG91bGQgbm90IGJlIHRyZWF0ZWQgYXMgcGF0aHMsIHNvIHRoZXNlIHByZWZpeGVzIHNob3VsZG4ndCB3b3JrXG5cdFx0XHRvayghYXdhaXQgaXNBdXRvQXBwcm92ZWQoJy4vZWNobycpKTtcblx0XHRcdG9rKCFhd2FpdCBpc0F1dG9BcHByb3ZlZCgnLlxcXFxscycpKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3Nob3VsZCBoYW5kbGUgcGF0aHMgd2l0aCBtaXhlZCBzZXBhcmF0b3JzIGluIGNvbmZpZycsIGFzeW5jICgpID0+IHtcblx0XHRcdHNldEF1dG9BcHByb3ZlKHtcblx0XHRcdFx0J2Jpbi9mb29cXFxcYmFyJzogdHJ1ZSAgLy8gTWl4ZWQgc2VwYXJhdG9ycyBpbiBjb25maWdcblx0XHRcdH0pO1xuXG5cdFx0XHRvayhhd2FpdCBpc0F1dG9BcHByb3ZlZCgnYmluL2Zvb1xcXFxiYXInKSk7XG5cdFx0XHRvayhhd2FpdCBpc0F1dG9BcHByb3ZlZCgnYmluXFxcXGZvby9iYXInKSk7XG5cdFx0XHRvayhhd2FpdCBpc0F1dG9BcHByb3ZlZCgnYmluL2Zvby9iYXInKSk7XG5cdFx0XHRvayhhd2FpdCBpc0F1dG9BcHByb3ZlZCgnYmluXFxcXGZvb1xcXFxiYXInKSk7XG5cdFx0XHRvayhhd2FpdCBpc0F1dG9BcHByb3ZlZCgnLi9iaW4vZm9vXFxcXGJhcicpKTtcblx0XHRcdG9rKGF3YWl0IGlzQXV0b0FwcHJvdmVkKCcuXFxcXGJpblxcXFxmb29cXFxcYmFyJykpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnc2hvdWxkIHdvcmsgd2l0aCBjb21tYW5kIGxpbmUgYXV0byBhcHByb3ZhbCBmb3IgcGF0aHMnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRzZXRBdXRvQXBwcm92ZVdpdGhDb21tYW5kTGluZSh7XG5cdFx0XHRcdCdiaW4vZGVwbG95JzogeyBhcHByb3ZlOiB0cnVlLCBtYXRjaENvbW1hbmRMaW5lOiB0cnVlIH1cblx0XHRcdH0pO1xuXG5cdFx0XHRvayhpc0NvbW1hbmRMaW5lQXV0b0FwcHJvdmVkKCdiaW4vZGVwbG95IC0tcHJvZCcpKTtcblx0XHRcdG9rKGlzQ29tbWFuZExpbmVBdXRvQXBwcm92ZWQoJ2JpblxcXFxkZXBsb3kgLS1wcm9kJykpO1xuXHRcdFx0b2soaXNDb21tYW5kTGluZUF1dG9BcHByb3ZlZCgnLi9iaW4vZGVwbG95IC0tcHJvZCcpKTtcblx0XHRcdG9rKGlzQ29tbWFuZExpbmVBdXRvQXBwcm92ZWQoJy5cXFxcYmluXFxcXGRlcGxveSAtLXByb2QnKSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdzaG91bGQgaGFuZGxlIHNwZWNpYWwgY2hhcmFjdGVycyBpbiBwYXRocycsIGFzeW5jICgpID0+IHtcblx0XHRcdHNldEF1dG9BcHByb3ZlKHtcblx0XHRcdFx0J2Jpbi9teS1zY3JpcHQuc2gnOiB0cnVlLFxuXHRcdFx0XHQnc2NyaXB0cy9idWlsZF9hbGwucHknOiB0cnVlLFxuXHRcdFx0XHQndG9vbHMvcnVuIChkZWJ1ZykuZXhlJzogdHJ1ZVxuXHRcdFx0fSk7XG5cblx0XHRcdG9rKGF3YWl0IGlzQXV0b0FwcHJvdmVkKCdiaW4vbXktc2NyaXB0LnNoJykpO1xuXHRcdFx0b2soYXdhaXQgaXNBdXRvQXBwcm92ZWQoJ2JpblxcXFxteS1zY3JpcHQuc2gnKSk7XG5cdFx0XHRvayhhd2FpdCBpc0F1dG9BcHByb3ZlZCgnLi9iaW4vbXktc2NyaXB0LnNoJykpO1xuXG5cdFx0XHRvayhhd2FpdCBpc0F1dG9BcHByb3ZlZCgnc2NyaXB0cy9idWlsZF9hbGwucHknKSk7XG5cdFx0XHRvayhhd2FpdCBpc0F1dG9BcHByb3ZlZCgnc2NyaXB0c1xcXFxidWlsZF9hbGwucHknKSk7XG5cblx0XHRcdG9rKGF3YWl0IGlzQXV0b0FwcHJvdmVkKCd0b29scy9ydW4gKGRlYnVnKS5leGUnKSk7XG5cdFx0XHRvayhhd2FpdCBpc0F1dG9BcHByb3ZlZCgndG9vbHNcXFxccnVuIChkZWJ1ZykuZXhlJykpO1xuXHRcdH0pO1xuXHR9KTtcblxuXHRzdWl0ZSgnUG93ZXJTaGVsbC1zcGVjaWZpYyBjb21tYW5kcycsICgpID0+IHtcblx0XHRzZXR1cCgoKSA9PiB7XG5cdFx0XHRzaGVsbCA9ICdwd3NoJztcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3Nob3VsZCBoYW5kbGUgV2luZG93cyBQb3dlclNoZWxsIGNvbW1hbmRzJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0c2V0QXV0b0FwcHJvdmUoe1xuXHRcdFx0XHQnR2V0LUNoaWxkSXRlbSc6IHRydWUsXG5cdFx0XHRcdCdHZXQtQ29udGVudCc6IHRydWUsXG5cdFx0XHRcdCdHZXQtTG9jYXRpb24nOiB0cnVlLFxuXHRcdFx0XHQnUmVtb3ZlLUl0ZW0nOiBmYWxzZSxcblx0XHRcdFx0J2RlbCc6IGZhbHNlXG5cdFx0XHR9KTtcblxuXHRcdFx0b2soYXdhaXQgaXNBdXRvQXBwcm92ZWQoJ0dldC1DaGlsZEl0ZW0nKSk7XG5cdFx0XHRvayhhd2FpdCBpc0F1dG9BcHByb3ZlZCgnR2V0LUNvbnRlbnQgZmlsZS50eHQnKSk7XG5cdFx0XHRvayhhd2FpdCBpc0F1dG9BcHByb3ZlZCgnR2V0LUxvY2F0aW9uJykpO1xuXHRcdFx0b2soIWF3YWl0IGlzQXV0b0FwcHJvdmVkKCdSZW1vdmUtSXRlbSBmaWxlLnR4dCcpKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3Nob3VsZCBoYW5kbGUgKCBwcmVmaXhlcycsIGFzeW5jICgpID0+IHtcblx0XHRcdHNldEF1dG9BcHByb3ZlKHtcblx0XHRcdFx0J0dldC1Db250ZW50JzogdHJ1ZVxuXHRcdFx0fSk7XG5cblx0XHRcdG9rKGF3YWl0IGlzQXV0b0FwcHJvdmVkKCdHZXQtQ29udGVudCBmaWxlLnR4dCcpKTtcblx0XHRcdG9rKGF3YWl0IGlzQXV0b0FwcHJvdmVkKCcoR2V0LUNvbnRlbnQgZmlsZS50eHQnKSk7XG5cdFx0XHRvayghYXdhaXQgaXNBdXRvQXBwcm92ZWQoJ1tHZXQtQ29udGVudCcpKTtcblx0XHRcdG9rKCFhd2FpdCBpc0F1dG9BcHByb3ZlZCgnZm9vJykpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnc2hvdWxkIGJlIGNhc2UtaW5zZW5zaXRpdmUgZm9yIFBvd2VyU2hlbGwgY29tbWFuZHMnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRzZXRBdXRvQXBwcm92ZSh7XG5cdFx0XHRcdCdHZXQtQ2hpbGRJdGVtJzogdHJ1ZSxcblx0XHRcdFx0J0dldC1Db250ZW50JzogdHJ1ZSxcblx0XHRcdFx0J1JlbW92ZS1JdGVtJzogZmFsc2Vcblx0XHRcdH0pO1xuXG5cdFx0XHRvayhhd2FpdCBpc0F1dG9BcHByb3ZlZCgnR2V0LUNoaWxkSXRlbScpKTtcblx0XHRcdG9rKGF3YWl0IGlzQXV0b0FwcHJvdmVkKCdnZXQtY2hpbGRpdGVtJykpO1xuXHRcdFx0b2soYXdhaXQgaXNBdXRvQXBwcm92ZWQoJ0dFVC1DSElMRElURU0nKSk7XG5cdFx0XHRvayhhd2FpdCBpc0F1dG9BcHByb3ZlZCgnR2V0LWNoaWxkaXRlbScpKTtcblx0XHRcdG9rKGF3YWl0IGlzQXV0b0FwcHJvdmVkKCdnZXQtQ2hpbGRJdGVtJykpO1xuXG5cdFx0XHRvayhhd2FpdCBpc0F1dG9BcHByb3ZlZCgnR2V0LUNvbnRlbnQgZmlsZS50eHQnKSk7XG5cdFx0XHRvayhhd2FpdCBpc0F1dG9BcHByb3ZlZCgnZ2V0LWNvbnRlbnQgZmlsZS50eHQnKSk7XG5cdFx0XHRvayhhd2FpdCBpc0F1dG9BcHByb3ZlZCgnR0VULUNPTlRFTlQgZmlsZS50eHQnKSk7XG5cdFx0XHRvayhhd2FpdCBpc0F1dG9BcHByb3ZlZCgnR2V0LWNvbnRlbnQgZmlsZS50eHQnKSk7XG5cblx0XHRcdG9rKCFhd2FpdCBpc0F1dG9BcHByb3ZlZCgnUmVtb3ZlLUl0ZW0gZmlsZS50eHQnKSk7XG5cdFx0XHRvayghYXdhaXQgaXNBdXRvQXBwcm92ZWQoJ3JlbW92ZS1pdGVtIGZpbGUudHh0JykpO1xuXHRcdFx0b2soIWF3YWl0IGlzQXV0b0FwcHJvdmVkKCdSRU1PVkUtSVRFTSBmaWxlLnR4dCcpKTtcblx0XHRcdG9rKCFhd2FpdCBpc0F1dG9BcHByb3ZlZCgnUmVtb3ZlLWl0ZW0gZmlsZS50eHQnKSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdzaG91bGQgYmUgY2FzZS1pbnNlbnNpdGl2ZSBmb3IgUG93ZXJTaGVsbCBhbGlhc2VzJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0c2V0QXV0b0FwcHJvdmUoe1xuXHRcdFx0XHQnbHMnOiB0cnVlLFxuXHRcdFx0XHQnZGlyJzogdHJ1ZSxcblx0XHRcdFx0J3JtJzogZmFsc2UsXG5cdFx0XHRcdCdkZWwnOiBmYWxzZVxuXHRcdFx0fSk7XG5cblx0XHRcdC8vIFRlc3QgY2FzZS1pbnNlbnNpdGl2ZSBtYXRjaGluZyBmb3IgYWxpYXNlc1xuXHRcdFx0b2soYXdhaXQgaXNBdXRvQXBwcm92ZWQoJ2xzJykpO1xuXHRcdFx0b2soYXdhaXQgaXNBdXRvQXBwcm92ZWQoJ0xTJykpO1xuXHRcdFx0b2soYXdhaXQgaXNBdXRvQXBwcm92ZWQoJ0xzJykpO1xuXG5cdFx0XHRvayhhd2FpdCBpc0F1dG9BcHByb3ZlZCgnZGlyJykpO1xuXHRcdFx0b2soYXdhaXQgaXNBdXRvQXBwcm92ZWQoJ0RJUicpKTtcblx0XHRcdG9rKGF3YWl0IGlzQXV0b0FwcHJvdmVkKCdEaXInKSk7XG5cblx0XHRcdG9rKCFhd2FpdCBpc0F1dG9BcHByb3ZlZCgncm0gZmlsZS50eHQnKSk7XG5cdFx0XHRvayghYXdhaXQgaXNBdXRvQXBwcm92ZWQoJ1JNIGZpbGUudHh0JykpO1xuXHRcdFx0b2soIWF3YWl0IGlzQXV0b0FwcHJvdmVkKCdSbSBmaWxlLnR4dCcpKTtcblxuXHRcdFx0b2soIWF3YWl0IGlzQXV0b0FwcHJvdmVkKCdkZWwgZmlsZS50eHQnKSk7XG5cdFx0XHRvayghYXdhaXQgaXNBdXRvQXBwcm92ZWQoJ0RFTCBmaWxlLnR4dCcpKTtcblx0XHRcdG9rKCFhd2FpdCBpc0F1dG9BcHByb3ZlZCgnRGVsIGZpbGUudHh0JykpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnc2hvdWxkIGJlIGNhc2UtaW5zZW5zaXRpdmUgd2l0aCByZWdleCBwYXR0ZXJucycsIGFzeW5jICgpID0+IHtcblx0XHRcdHNldEF1dG9BcHByb3ZlKHtcblx0XHRcdFx0Jy9eR2V0LS8nOiB0cnVlLFxuXHRcdFx0XHQnL1JlbW92ZS1JdGVtfHJtLyc6IGZhbHNlXG5cdFx0XHR9KTtcblxuXHRcdFx0b2soYXdhaXQgaXNBdXRvQXBwcm92ZWQoJ0dldC1DaGlsZEl0ZW0nKSk7XG5cdFx0XHRvayhhd2FpdCBpc0F1dG9BcHByb3ZlZCgnZ2V0LWNoaWxkaXRlbScpKTtcblx0XHRcdG9rKGF3YWl0IGlzQXV0b0FwcHJvdmVkKCdHRVQtUFJPQ0VTUycpKTtcblx0XHRcdG9rKGF3YWl0IGlzQXV0b0FwcHJvdmVkKCdHZXQtTG9jYXRpb24nKSk7XG5cblx0XHRcdG9rKCFhd2FpdCBpc0F1dG9BcHByb3ZlZCgnUmVtb3ZlLUl0ZW0gZmlsZS50eHQnKSk7XG5cdFx0XHRvayghYXdhaXQgaXNBdXRvQXBwcm92ZWQoJ3JlbW92ZS1pdGVtIGZpbGUudHh0JykpO1xuXHRcdFx0b2soIWF3YWl0IGlzQXV0b0FwcHJvdmVkKCdybSBmaWxlLnR4dCcpKTtcblx0XHRcdG9rKCFhd2FpdCBpc0F1dG9BcHByb3ZlZCgnUk0gZmlsZS50eHQnKSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdzaG91bGQgaGFuZGxlIGNhc2UtaW5zZW5zaXRpdmUgUG93ZXJTaGVsbCBjb21tYW5kcyBvbiBkaWZmZXJlbnQgT1MnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRzZXRBdXRvQXBwcm92ZSh7XG5cdFx0XHRcdCdHZXQtUHJvY2Vzcyc6IHRydWUsXG5cdFx0XHRcdCdTdG9wLVByb2Nlc3MnOiBmYWxzZVxuXHRcdFx0fSk7XG5cblx0XHRcdGZvciAoY29uc3QgY3Vycm5ldE9TIG9mIFtPcGVyYXRpbmdTeXN0ZW0uV2luZG93cywgT3BlcmF0aW5nU3lzdGVtLkxpbnV4LCBPcGVyYXRpbmdTeXN0ZW0uTWFjaW50b3NoXSkge1xuXHRcdFx0XHRvcyA9IGN1cnJuZXRPUztcblx0XHRcdFx0b2soYXdhaXQgaXNBdXRvQXBwcm92ZWQoJ0dldC1Qcm9jZXNzJyksIGBvcz0ke29zfWApO1xuXHRcdFx0XHRvayhhd2FpdCBpc0F1dG9BcHByb3ZlZCgnZ2V0LXByb2Nlc3MnKSwgYG9zPSR7b3N9YCk7XG5cdFx0XHRcdG9rKGF3YWl0IGlzQXV0b0FwcHJvdmVkKCdHRVQtUFJPQ0VTUycpLCBgb3M9JHtvc31gKTtcblx0XHRcdFx0b2soIWF3YWl0IGlzQXV0b0FwcHJvdmVkKCdTdG9wLVByb2Nlc3MnKSwgYG9zPSR7b3N9YCk7XG5cdFx0XHRcdG9rKCFhd2FpdCBpc0F1dG9BcHByb3ZlZCgnc3RvcC1wcm9jZXNzJyksIGBvcz0ke29zfWApO1xuXHRcdFx0fVxuXHRcdH0pO1xuXHR9KTtcblxuXHRzdWl0ZSgnaXNDb21tYW5kTGluZUF1dG9BcHByb3ZlZCAtIG1hdGNoQ29tbWFuZExpbmUgZnVuY3Rpb25hbGl0eScsICgpID0+IHtcblx0XHR0ZXN0KCdzaG91bGQgYXV0by1hcHByb3ZlIGNvbW1hbmQgbGluZSBwYXR0ZXJucyB3aXRoIG1hdGNoQ29tbWFuZExpbmU6IHRydWUnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRzZXRBdXRvQXBwcm92ZVdpdGhDb21tYW5kTGluZSh7XG5cdFx0XHRcdCdlY2hvJzogeyBhcHByb3ZlOiB0cnVlLCBtYXRjaENvbW1hbmRMaW5lOiB0cnVlIH1cblx0XHRcdH0pO1xuXG5cdFx0XHRvayhpc0NvbW1hbmRMaW5lQXV0b0FwcHJvdmVkKCdlY2hvIGhlbGxvJykpO1xuXHRcdFx0b2soaXNDb21tYW5kTGluZUF1dG9BcHByb3ZlZCgnZWNobyB0ZXN0ICYmIGxzJykpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnc2hvdWxkIG5vdCBhdXRvLWFwcHJvdmUgcmVndWxhciBwYXR0ZXJucyB3aXRoIGlzQ29tbWFuZExpbmVBdXRvQXBwcm92ZWQnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRzZXRBdXRvQXBwcm92ZSh7XG5cdFx0XHRcdCdlY2hvJzogdHJ1ZVxuXHRcdFx0fSk7XG5cblx0XHRcdC8vIFJlZ3VsYXIgcGF0dGVybnMgc2hvdWxkIG5vdCBiZSBtYXRjaGVkIGJ5IGlzQ29tbWFuZExpbmVBdXRvQXBwcm92ZWRcblx0XHRcdG9rKCFpc0NvbW1hbmRMaW5lQXV0b0FwcHJvdmVkKCdlY2hvIGhlbGxvJykpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnc2hvdWxkIGhhbmRsZSByZWdleCBwYXR0ZXJucyB3aXRoIG1hdGNoQ29tbWFuZExpbmU6IHRydWUnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRzZXRBdXRvQXBwcm92ZVdpdGhDb21tYW5kTGluZSh7XG5cdFx0XHRcdCcvZWNoby4qd29ybGQvJzogeyBhcHByb3ZlOiB0cnVlLCBtYXRjaENvbW1hbmRMaW5lOiB0cnVlIH1cblx0XHRcdH0pO1xuXG5cdFx0XHRvayhpc0NvbW1hbmRMaW5lQXV0b0FwcHJvdmVkKCdlY2hvIGhlbGxvIHdvcmxkJykpO1xuXHRcdFx0b2soIWlzQ29tbWFuZExpbmVBdXRvQXBwcm92ZWQoJ2VjaG8gaGVsbG8nKSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdzaG91bGQgaGFuZGxlIGNhc2UtaW5zZW5zaXRpdmUgcmVnZXggd2l0aCBtYXRjaENvbW1hbmRMaW5lOiB0cnVlJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0c2V0QXV0b0FwcHJvdmVXaXRoQ29tbWFuZExpbmUoe1xuXHRcdFx0XHQnL2VjaG8vaSc6IHsgYXBwcm92ZTogdHJ1ZSwgbWF0Y2hDb21tYW5kTGluZTogdHJ1ZSB9XG5cdFx0XHR9KTtcblxuXHRcdFx0b2soaXNDb21tYW5kTGluZUF1dG9BcHByb3ZlZCgnZWNobyBoZWxsbycpKTtcblx0XHRcdG9rKGlzQ29tbWFuZExpbmVBdXRvQXBwcm92ZWQoJ0VDSE8gaGVsbG8nKSk7XG5cdFx0XHRvayhpc0NvbW1hbmRMaW5lQXV0b0FwcHJvdmVkKCdFY2hvIGhlbGxvJykpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnc2hvdWxkIGhhbmRsZSBjb21wbGV4IGNvbW1hbmQgbGluZSBwYXR0ZXJucycsIGFzeW5jICgpID0+IHtcblx0XHRcdHNldEF1dG9BcHByb3ZlV2l0aENvbW1hbmRMaW5lKHtcblx0XHRcdFx0Jy9ebnBtIHJ1biBidWlsZC8nOiB7IGFwcHJvdmU6IHRydWUsIG1hdGNoQ29tbWFuZExpbmU6IHRydWUgfSxcblx0XHRcdFx0Jy9cXC5wczEvaSc6IHsgYXBwcm92ZTogdHJ1ZSwgbWF0Y2hDb21tYW5kTGluZTogdHJ1ZSB9XG5cdFx0XHR9KTtcblxuXHRcdFx0b2soaXNDb21tYW5kTGluZUF1dG9BcHByb3ZlZCgnbnBtIHJ1biBidWlsZCAtLXByb2R1Y3Rpb24nKSk7XG5cdFx0XHRvayhpc0NvbW1hbmRMaW5lQXV0b0FwcHJvdmVkKCdwb3dlcnNoZWxsIC1GaWxlIHNjcmlwdC5wczEnKSk7XG5cdFx0XHRvayhpc0NvbW1hbmRMaW5lQXV0b0FwcHJvdmVkKCdwd3NoIC1GaWxlIFNDUklQVC5QUzEnKSk7XG5cdFx0XHRvayghaXNDb21tYW5kTGluZUF1dG9BcHByb3ZlZCgnbnBtIGluc3RhbGwnKSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdzaG91bGQgcmV0dXJuIGZhbHNlIGZvciBlbXB0eSBjb21tYW5kIGxpbmUnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRzZXRBdXRvQXBwcm92ZVdpdGhDb21tYW5kTGluZSh7XG5cdFx0XHRcdCdlY2hvJzogeyBhcHByb3ZlOiB0cnVlLCBtYXRjaENvbW1hbmRMaW5lOiB0cnVlIH1cblx0XHRcdH0pO1xuXG5cdFx0XHRvayghaXNDb21tYW5kTGluZUF1dG9BcHByb3ZlZCgnJykpO1xuXHRcdFx0b2soIWlzQ29tbWFuZExpbmVBdXRvQXBwcm92ZWQoJyAgICcpKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3Nob3VsZCBoYW5kbGUgbWl4ZWQgY29uZmlndXJhdGlvbiB3aXRoIG1hdGNoQ29tbWFuZExpbmUgZW50cmllcycsIGFzeW5jICgpID0+IHtcblx0XHRcdHNldEF1dG9BcHByb3ZlV2l0aENvbW1hbmRMaW5lKHtcblx0XHRcdFx0J2VjaG8nOiB0cnVlLCAgLy8gUmVndWxhciBwYXR0ZXJuXG5cdFx0XHRcdCdscyc6IHsgYXBwcm92ZTogdHJ1ZSwgbWF0Y2hDb21tYW5kTGluZTogdHJ1ZSB9LCAgLy8gQ29tbWFuZCBsaW5lIHBhdHRlcm5cblx0XHRcdFx0J3JtJzogeyBhcHByb3ZlOiB0cnVlLCBtYXRjaENvbW1hbmRMaW5lOiBmYWxzZSB9ICAvLyBFeHBsaWNpdCByZWd1bGFyIHBhdHRlcm5cblx0XHRcdH0pO1xuXG5cdFx0XHQvLyBPbmx5IHRoZSBtYXRjaENvbW1hbmRMaW5lOiB0cnVlIGVudHJ5IHNob3VsZCB3b3JrIHdpdGggaXNDb21tYW5kTGluZUF1dG9BcHByb3ZlZFxuXHRcdFx0b2soaXNDb21tYW5kTGluZUF1dG9BcHByb3ZlZCgnbHMgLWxhJykpO1xuXHRcdFx0b2soIWlzQ29tbWFuZExpbmVBdXRvQXBwcm92ZWQoJ2VjaG8gaGVsbG8nKSk7XG5cdFx0XHRvayghaXNDb21tYW5kTGluZUF1dG9BcHByb3ZlZCgncm0gZmlsZS50eHQnKSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdzaG91bGQgaGFuZGxlIGRlbnkgcGF0dGVybnMgd2l0aCBtYXRjaENvbW1hbmRMaW5lOiB0cnVlJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0c2V0QXV0b0FwcHJvdmVXaXRoQ29tbWFuZExpbmUoe1xuXHRcdFx0XHQnZWNobyc6IHsgYXBwcm92ZTogdHJ1ZSwgbWF0Y2hDb21tYW5kTGluZTogdHJ1ZSB9LFxuXHRcdFx0XHQnL2Rhbmdlcm91cy8nOiB7IGFwcHJvdmU6IGZhbHNlLCBtYXRjaENvbW1hbmRMaW5lOiB0cnVlIH1cblx0XHRcdH0pO1xuXG5cdFx0XHRvayhpc0NvbW1hbmRMaW5lQXV0b0FwcHJvdmVkKCdlY2hvIGhlbGxvJykpO1xuXHRcdFx0b2soIWlzQ29tbWFuZExpbmVBdXRvQXBwcm92ZWQoJ2VjaG8gZGFuZ2Vyb3VzIGNvbW1hbmQnKSk7XG5cdFx0XHRvayghaXNDb21tYW5kTGluZUF1dG9BcHByb3ZlZCgnZGFuZ2Vyb3VzIG9wZXJhdGlvbicpKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3Nob3VsZCBwcmlvcml0aXplIGRlbnkgbGlzdCBvdmVyIGFsbG93IGxpc3QgZm9yIGNvbW1hbmQgbGluZSBwYXR0ZXJucycsIGFzeW5jICgpID0+IHtcblx0XHRcdHNldEF1dG9BcHByb3ZlV2l0aENvbW1hbmRMaW5lKHtcblx0XHRcdFx0Jy9lY2hvLyc6IHsgYXBwcm92ZTogdHJ1ZSwgbWF0Y2hDb21tYW5kTGluZTogdHJ1ZSB9LFxuXHRcdFx0XHQnL2VjaG8uKmRhbmdlcm91cy8nOiB7IGFwcHJvdmU6IGZhbHNlLCBtYXRjaENvbW1hbmRMaW5lOiB0cnVlIH1cblx0XHRcdH0pO1xuXG5cdFx0XHRvayhpc0NvbW1hbmRMaW5lQXV0b0FwcHJvdmVkKCdlY2hvIGhlbGxvJykpO1xuXHRcdFx0b2soIWlzQ29tbWFuZExpbmVBdXRvQXBwcm92ZWQoJ2VjaG8gZGFuZ2Vyb3VzIGNvbW1hbmQnKSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdzaG91bGQgaGFuZGxlIGNvbXBsZXggZGVueSBwYXR0ZXJucyB3aXRoIG1hdGNoQ29tbWFuZExpbmUnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRzZXRBdXRvQXBwcm92ZVdpdGhDb21tYW5kTGluZSh7XG5cdFx0XHRcdCducG0nOiB7IGFwcHJvdmU6IHRydWUsIG1hdGNoQ29tbWFuZExpbmU6IHRydWUgfSxcblx0XHRcdFx0Jy9ucG0uKi0tZm9yY2UvJzogeyBhcHByb3ZlOiBmYWxzZSwgbWF0Y2hDb21tYW5kTGluZTogdHJ1ZSB9LFxuXHRcdFx0XHQnL1xcLnBzMS4qLUV4ZWN1dGlvblBvbGljeS9pJzogeyBhcHByb3ZlOiBmYWxzZSwgbWF0Y2hDb21tYW5kTGluZTogdHJ1ZSB9XG5cdFx0XHR9KTtcblxuXHRcdFx0b2soaXNDb21tYW5kTGluZUF1dG9BcHByb3ZlZCgnbnBtIGluc3RhbGwnKSk7XG5cdFx0XHRvayhpc0NvbW1hbmRMaW5lQXV0b0FwcHJvdmVkKCducG0gcnVuIGJ1aWxkJykpO1xuXHRcdFx0b2soIWlzQ29tbWFuZExpbmVBdXRvQXBwcm92ZWQoJ25wbSBpbnN0YWxsIC0tZm9yY2UnKSk7XG5cdFx0XHRvayghaXNDb21tYW5kTGluZUF1dG9BcHByb3ZlZCgncG93ZXJzaGVsbCAtRmlsZSBzY3JpcHQucHMxIC1FeGVjdXRpb25Qb2xpY3kgQnlwYXNzJykpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnc2hvdWxkIGhhbmRsZSBlbXB0eSByZWdleCBwYXR0ZXJucyB3aXRoIG1hdGNoQ29tbWFuZExpbmUgdGhhdCBjb3VsZCBjYXVzZSBlbmRsZXNzIGxvb3BzJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0c2V0QXV0b0FwcHJvdmVXaXRoQ29tbWFuZExpbmUoe1xuXHRcdFx0XHQnLy8nOiB7IGFwcHJvdmU6IHRydWUsIG1hdGNoQ29tbWFuZExpbmU6IHRydWUgfSxcblx0XHRcdFx0Jy8oPzopLyc6IHsgYXBwcm92ZTogdHJ1ZSwgbWF0Y2hDb21tYW5kTGluZTogdHJ1ZSB9LFxuXHRcdFx0XHQnLyovJzogeyBhcHByb3ZlOiB0cnVlLCBtYXRjaENvbW1hbmRMaW5lOiB0cnVlIH0sICAgICAgICAgICAgLy8gSW52YWxpZCByZWdleCBwYXR0ZXJuXG5cdFx0XHRcdCcvLioqLyc6IHsgYXBwcm92ZTogdHJ1ZSwgbWF0Y2hDb21tYW5kTGluZTogdHJ1ZSB9ICAgICAgICAgICAvLyBJbnZhbGlkIHJlZ2V4IHBhdHRlcm5cblx0XHRcdH0pO1xuXG5cdFx0XHQvLyBUaGVzZSBwYXR0ZXJucyBzaG91bGQgbm90IGNhdXNlIGVuZGxlc3MgbG9vcHMgYW5kIHNob3VsZCBub3QgbWF0Y2ggYW55IGNvbW1hbmRzXG5cdFx0XHQvLyBJbnZhbGlkIHBhdHRlcm5zIHNob3VsZCBiZSBoYW5kbGVkIGdyYWNlZnVsbHkgYW5kIG5vdCBtYXRjaCBhbnl0aGluZ1xuXHRcdFx0b2soIWlzQ29tbWFuZExpbmVBdXRvQXBwcm92ZWQoJ2VjaG8gaGVsbG8nKSk7XG5cdFx0XHRvayghaXNDb21tYW5kTGluZUF1dG9BcHByb3ZlZCgnbHMnKSk7XG5cdFx0XHRvayghaXNDb21tYW5kTGluZUF1dG9BcHByb3ZlZCgnJykpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnc2hvdWxkIGhhbmRsZSByZWdleCBwYXR0ZXJucyB3aXRoIG1hdGNoQ29tbWFuZExpbmUgdGhhdCB3b3VsZCBjYXVzZSBlbmRsZXNzIGxvb3BzJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0c2V0QXV0b0FwcHJvdmVXaXRoQ29tbWFuZExpbmUoe1xuXHRcdFx0XHQnL2EqLyc6IHsgYXBwcm92ZTogdHJ1ZSwgbWF0Y2hDb21tYW5kTGluZTogdHJ1ZSB9LFxuXHRcdFx0XHQnL2I/Lyc6IHsgYXBwcm92ZTogdHJ1ZSwgbWF0Y2hDb21tYW5kTGluZTogdHJ1ZSB9LFxuXHRcdFx0XHQnLyh4fCkqLyc6IHsgYXBwcm92ZTogdHJ1ZSwgbWF0Y2hDb21tYW5kTGluZTogdHJ1ZSB9LFxuXHRcdFx0XHQnLyg/OikqLyc6IHsgYXBwcm92ZTogdHJ1ZSwgbWF0Y2hDb21tYW5kTGluZTogdHJ1ZSB9XG5cdFx0XHR9KTtcblxuXHRcdFx0Ly8gQ29tbWFuZHMgc2hvdWxkIHN0aWxsIHdvcmsgbm9ybWFsbHksIGVuZGxlc3MgbG9vcCBwYXR0ZXJucyBzaG91bGQgYmUgc2FmZWx5IGhhbmRsZWRcblx0XHRcdG9rKCFpc0NvbW1hbmRMaW5lQXV0b0FwcHJvdmVkKCdlY2hvIGhlbGxvJykpO1xuXHRcdFx0b2soIWlzQ29tbWFuZExpbmVBdXRvQXBwcm92ZWQoJ2xzJykpO1xuXHRcdFx0b2soIWlzQ29tbWFuZExpbmVBdXRvQXBwcm92ZWQoJ2EnKSk7XG5cdFx0XHRvayghaXNDb21tYW5kTGluZUF1dG9BcHByb3ZlZCgnYicpKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3Nob3VsZCBoYW5kbGUgbWl4ZWQgdmFsaWQgYW5kIHByb2JsZW1hdGljIHJlZ2V4IHBhdHRlcm5zIHdpdGggbWF0Y2hDb21tYW5kTGluZScsIGFzeW5jICgpID0+IHtcblx0XHRcdHNldEF1dG9BcHByb3ZlV2l0aENvbW1hbmRMaW5lKHtcblx0XHRcdFx0Jy9eZWNoby8nOiB7IGFwcHJvdmU6IHRydWUsIG1hdGNoQ29tbWFuZExpbmU6IHRydWUgfSwgICAgICAgIC8vIFZhbGlkIHBhdHRlcm5cblx0XHRcdFx0Jy8vJzogeyBhcHByb3ZlOiB0cnVlLCBtYXRjaENvbW1hbmRMaW5lOiB0cnVlIH0sICAgICAgICAgICAgIC8vIEVtcHR5IHBhdHRlcm5cblx0XHRcdFx0Jy9ebHMvJzogeyBhcHByb3ZlOiB0cnVlLCBtYXRjaENvbW1hbmRMaW5lOiB0cnVlIH0sICAgICAgICAgIC8vIFZhbGlkIHBhdHRlcm5cblx0XHRcdFx0Jy9hKi8nOiB7IGFwcHJvdmU6IHRydWUsIG1hdGNoQ29tbWFuZExpbmU6IHRydWUgfSwgICAgICAgICAgIC8vIFBvdGVudGlhbCBlbmRsZXNzIGxvb3Bcblx0XHRcdFx0J3B3ZCc6IHsgYXBwcm92ZTogdHJ1ZSwgbWF0Y2hDb21tYW5kTGluZTogdHJ1ZSB9ICAgICAgICAgICAgIC8vIFZhbGlkIHN0cmluZyBwYXR0ZXJuXG5cdFx0XHR9KTtcblxuXHRcdFx0b2soaXNDb21tYW5kTGluZUF1dG9BcHByb3ZlZCgnZWNobyBoZWxsbycpKTtcblx0XHRcdG9rKGlzQ29tbWFuZExpbmVBdXRvQXBwcm92ZWQoJ2xzIC1sYScpKTtcblx0XHRcdG9rKGlzQ29tbWFuZExpbmVBdXRvQXBwcm92ZWQoJ3B3ZCcpKTtcblx0XHRcdG9rKCFpc0NvbW1hbmRMaW5lQXV0b0FwcHJvdmVkKCdybSBmaWxlJykpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnc2hvdWxkIGhhbmRsZSBpbnZhbGlkIHJlZ2V4IHBhdHRlcm5zIHdpdGggbWF0Y2hDb21tYW5kTGluZSBncmFjZWZ1bGx5JywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0c2V0QXV0b0FwcHJvdmVXaXRoQ29tbWFuZExpbmUoe1xuXHRcdFx0XHQnLyovJzogeyBhcHByb3ZlOiB0cnVlLCBtYXRjaENvbW1hbmRMaW5lOiB0cnVlIH0sICAgICAgICAgICAgICAgICAgICAvLyBJbnZhbGlkIHJlZ2V4IC0gbm90aGluZyB0byByZXBlYXRcblx0XHRcdFx0Jy8oPzorLyc6IHsgYXBwcm92ZTogdHJ1ZSwgbWF0Y2hDb21tYW5kTGluZTogdHJ1ZSB9LCAgICAgICAgICAgICAgICAgLy8gSW52YWxpZCByZWdleCAtIGluY29tcGxldGUgcXVhbnRpZmllclxuXHRcdFx0XHQnL1svJzogeyBhcHByb3ZlOiB0cnVlLCBtYXRjaENvbW1hbmRMaW5lOiB0cnVlIH0sICAgICAgICAgICAgICAgICAgICAvLyBJbnZhbGlkIHJlZ2V4IC0gdW5jbG9zZWQgY2hhcmFjdGVyIGNsYXNzXG5cdFx0XHRcdCcvXmVjaG8vJzogeyBhcHByb3ZlOiB0cnVlLCBtYXRjaENvbW1hbmRMaW5lOiB0cnVlIH0sICAgICAgICAgICAgICAgIC8vIFZhbGlkIHBhdHRlcm5cblx0XHRcdFx0J2xzJzogeyBhcHByb3ZlOiB0cnVlLCBtYXRjaENvbW1hbmRMaW5lOiB0cnVlIH0gICAgICAgICAgICAgICAgICAgICAgLy8gVmFsaWQgc3RyaW5nIHBhdHRlcm5cblx0XHRcdH0pO1xuXG5cdFx0XHQvLyBWYWxpZCBwYXR0ZXJucyBzaG91bGQgc3RpbGwgd29ya1xuXHRcdFx0b2soaXNDb21tYW5kTGluZUF1dG9BcHByb3ZlZCgnZWNobyBoZWxsbycpKTtcblx0XHRcdG9rKGlzQ29tbWFuZExpbmVBdXRvQXBwcm92ZWQoJ2xzIC1sYScpKTtcblx0XHRcdC8vIEludmFsaWQgcGF0dGVybnMgc2hvdWxkIG5vdCBtYXRjaCBhbnl0aGluZyBhbmQgbm90IGNhdXNlIGNyYXNoZXNcblx0XHRcdG9rKCFpc0NvbW1hbmRMaW5lQXV0b0FwcHJvdmVkKCdyYW5kb20gY29tbWFuZCcpKTtcblx0XHR9KTtcblx0fSk7XG5cblx0c3VpdGUoJ3JlYXNvbnMnLCAoKSA9PiB7XG5cdFx0YXN5bmMgZnVuY3Rpb24gZ2V0Q29tbWFuZFJlYXNvbihjb21tYW5kOiBzdHJpbmcpOiBQcm9taXNlPHN0cmluZz4ge1xuXHRcdFx0cmV0dXJuIChhd2FpdCBjb21tYW5kTGluZUF1dG9BcHByb3Zlci5pc0NvbW1hbmRBdXRvQXBwcm92ZWQoY29tbWFuZCwgc2hlbGwsIG9zLCB1bmRlZmluZWQpKS5yZWFzb247XG5cdFx0fVxuXG5cdFx0ZnVuY3Rpb24gZ2V0Q29tbWFuZExpbmVSZWFzb24oY29tbWFuZExpbmU6IHN0cmluZyk6IHN0cmluZyB7XG5cdFx0XHRyZXR1cm4gY29tbWFuZExpbmVBdXRvQXBwcm92ZXIuaXNDb21tYW5kTGluZUF1dG9BcHByb3ZlZChjb21tYW5kTGluZSkucmVhc29uO1xuXHRcdH1cblxuXHRcdHN1aXRlKCdjb21tYW5kJywgKCkgPT4ge1xuXHRcdFx0dGVzdCgnYXBwcm92ZWQnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRcdHNldEF1dG9BcHByb3ZlKHsgZWNobzogdHJ1ZSB9KTtcblx0XHRcdFx0c3RyaWN0RXF1YWwoYXdhaXQgZ2V0Q29tbWFuZFJlYXNvbignZWNobyBoZWxsbycpLCBgQ29tbWFuZCAnZWNobyBoZWxsbycgaXMgYXBwcm92ZWQgYnkgYWxsb3cgbGlzdCBydWxlOiBlY2hvYCk7XG5cdFx0XHR9KTtcblx0XHRcdHRlc3QoJ25vdCBhcHByb3ZlZCcsIGFzeW5jICgpID0+IHtcblx0XHRcdFx0c2V0QXV0b0FwcHJvdmUoeyBlY2hvOiBmYWxzZSB9KTtcblx0XHRcdFx0c3RyaWN0RXF1YWwoYXdhaXQgZ2V0Q29tbWFuZFJlYXNvbignZWNobyBoZWxsbycpLCBgQ29tbWFuZCAnZWNobyBoZWxsbycgaXMgZGVuaWVkIGJ5IGRlbnkgbGlzdCBydWxlOiBlY2hvYCk7XG5cdFx0XHR9KTtcblx0XHRcdHRlc3QoJ25vIG1hdGNoJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0XHRzZXRBdXRvQXBwcm92ZSh7fSk7XG5cdFx0XHRcdHN0cmljdEVxdWFsKGF3YWl0IGdldENvbW1hbmRSZWFzb24oJ2VjaG8gaGVsbG8nKSwgYENvbW1hbmQgJ2VjaG8gaGVsbG8nIGhhcyBubyBtYXRjaGluZyBhdXRvIGFwcHJvdmUgZW50cmllc2ApO1xuXHRcdFx0fSk7XG5cdFx0fSk7XG5cblx0XHRzdWl0ZSgnY29tbWFuZCBsaW5lJywgKCkgPT4ge1xuXHRcdFx0dGVzdCgnYXBwcm92ZWQnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRcdHNldEF1dG9BcHByb3ZlV2l0aENvbW1hbmRMaW5lKHsgZWNobzogeyBhcHByb3ZlOiB0cnVlLCBtYXRjaENvbW1hbmRMaW5lOiB0cnVlIH0gfSk7XG5cdFx0XHRcdHN0cmljdEVxdWFsKGdldENvbW1hbmRMaW5lUmVhc29uKCdlY2hvIGhlbGxvJyksIGBDb21tYW5kIGxpbmUgJ2VjaG8gaGVsbG8nIGlzIGFwcHJvdmVkIGJ5IGFsbG93IGxpc3QgcnVsZTogZWNob2ApO1xuXHRcdFx0fSk7XG5cdFx0XHR0ZXN0KCdub3QgYXBwcm92ZWQnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRcdHNldEF1dG9BcHByb3ZlV2l0aENvbW1hbmRMaW5lKHsgZWNobzogeyBhcHByb3ZlOiBmYWxzZSwgbWF0Y2hDb21tYW5kTGluZTogdHJ1ZSB9IH0pO1xuXHRcdFx0XHRzdHJpY3RFcXVhbChnZXRDb21tYW5kTGluZVJlYXNvbignZWNobyBoZWxsbycpLCBgQ29tbWFuZCBsaW5lICdlY2hvIGhlbGxvJyBpcyBkZW5pZWQgYnkgZGVueSBsaXN0IHJ1bGU6IGVjaG9gKTtcblx0XHRcdH0pO1xuXHRcdFx0dGVzdCgnbm8gbWF0Y2gnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRcdHNldEF1dG9BcHByb3ZlV2l0aENvbW1hbmRMaW5lKHt9KTtcblx0XHRcdFx0c3RyaWN0RXF1YWwoZ2V0Q29tbWFuZExpbmVSZWFzb24oJ2VjaG8gaGVsbG8nKSwgYENvbW1hbmQgbGluZSAnZWNobyBoZWxsbycgaGFzIG5vIG1hdGNoaW5nIGF1dG8gYXBwcm92ZSBlbnRyaWVzYCk7XG5cdFx0XHR9KTtcblx0XHR9KTtcblx0fSk7XG5cblx0c3VpdGUoJ2lzRGVmYXVsdFJ1bGUgbG9naWMnLCAoKSA9PiB7XG5cdFx0YXN5bmMgZnVuY3Rpb24gZ2V0SXNEZWZhdWx0UnVsZShjb21tYW5kOiBzdHJpbmcpOiBQcm9taXNlPGJvb2xlYW4gfCB1bmRlZmluZWQ+IHtcblx0XHRcdGNvbnN0IHJ1bGUgPSAoYXdhaXQgY29tbWFuZExpbmVBdXRvQXBwcm92ZXIuaXNDb21tYW5kQXV0b0FwcHJvdmVkKGNvbW1hbmQsIHNoZWxsLCBvcywgdW5kZWZpbmVkKSkucnVsZTtcblx0XHRcdHJldHVybiBpc0F1dG9BcHByb3ZlUnVsZShydWxlKSA/IHJ1bGUuaXNEZWZhdWx0UnVsZSA6IHVuZGVmaW5lZDtcblx0XHR9XG5cblx0XHRmdW5jdGlvbiBnZXRDb21tYW5kTGluZUlzRGVmYXVsdFJ1bGUoY29tbWFuZExpbmU6IHN0cmluZyk6IGJvb2xlYW4gfCB1bmRlZmluZWQge1xuXHRcdFx0Y29uc3QgcnVsZSA9IGNvbW1hbmRMaW5lQXV0b0FwcHJvdmVyLmlzQ29tbWFuZExpbmVBdXRvQXBwcm92ZWQoY29tbWFuZExpbmUpLnJ1bGU7XG5cdFx0XHRyZXR1cm4gaXNBdXRvQXBwcm92ZVJ1bGUocnVsZSkgPyBydWxlLmlzRGVmYXVsdFJ1bGUgOiB1bmRlZmluZWQ7XG5cdFx0fVxuXG5cdFx0ZnVuY3Rpb24gc2V0QXV0b0FwcHJvdmVXaXRoRGVmYXVsdHModXNlckNvbmZpZzogeyBba2V5OiBzdHJpbmddOiBib29sZWFuIH0sIGRlZmF1bHRDb25maWc6IHsgW2tleTogc3RyaW5nXTogYm9vbGVhbiB9KSB7XG5cdFx0XHQvLyBTZXQgdXAgbW9jayBjb25maWd1cmF0aW9uIHdpdGggZGVmYXVsdCB2YWx1ZXNcblx0XHRcdGNvbmZpZ3VyYXRpb25TZXJ2aWNlLnNldFVzZXJDb25maWd1cmF0aW9uKFRlcm1pbmFsQ2hhdEFnZW50VG9vbHNTZXR0aW5nSWQuQXV0b0FwcHJvdmUsIHVzZXJDb25maWcpO1xuXG5cdFx0XHQvLyBNb2NrIHRoZSBpbnNwZWN0IG1ldGhvZCB0byByZXR1cm4gZGVmYXVsdCB2YWx1ZXNcblx0XHRcdGNvbnN0IG9yaWdpbmFsSW5zcGVjdCA9IGNvbmZpZ3VyYXRpb25TZXJ2aWNlLmluc3BlY3Q7XG5cdFx0XHRjb25zdCBvcmlnaW5hbEdldFZhbHVlID0gY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0VmFsdWU7XG5cblx0XHRcdGNvbmZpZ3VyYXRpb25TZXJ2aWNlLmluc3BlY3QgPSAoa2V5OiBzdHJpbmcpOiBhbnkgPT4ge1xuXHRcdFx0XHRpZiAoa2V5ID09PSBUZXJtaW5hbENoYXRBZ2VudFRvb2xzU2V0dGluZ0lkLkF1dG9BcHByb3ZlKSB7XG5cdFx0XHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0XHRcdGRlZmF1bHQ6IHsgdmFsdWU6IGRlZmF1bHRDb25maWcgfSxcblx0XHRcdFx0XHRcdHVzZXI6IHsgdmFsdWU6IHVzZXJDb25maWcgfSxcblx0XHRcdFx0XHRcdHdvcmtzcGFjZTogdW5kZWZpbmVkLFxuXHRcdFx0XHRcdFx0d29ya3NwYWNlRm9sZGVyOiB1bmRlZmluZWQsXG5cdFx0XHRcdFx0XHRhcHBsaWNhdGlvbjogdW5kZWZpbmVkLFxuXHRcdFx0XHRcdFx0cG9saWN5OiB1bmRlZmluZWQsXG5cdFx0XHRcdFx0XHRtZW1vcnk6IHVuZGVmaW5lZCxcblx0XHRcdFx0XHRcdHZhbHVlOiB7IC4uLmRlZmF1bHRDb25maWcsIC4uLnVzZXJDb25maWcgfVxuXHRcdFx0XHRcdH07XG5cdFx0XHRcdH1cblx0XHRcdFx0cmV0dXJuIG9yaWdpbmFsSW5zcGVjdC5jYWxsKGNvbmZpZ3VyYXRpb25TZXJ2aWNlLCBrZXkpO1xuXHRcdFx0fTtcblxuXHRcdFx0Y29uZmlndXJhdGlvblNlcnZpY2UuZ2V0VmFsdWUgPSAoa2V5OiBzdHJpbmcpOiBhbnkgPT4ge1xuXHRcdFx0XHRpZiAoa2V5ID09PSBUZXJtaW5hbENoYXRBZ2VudFRvb2xzU2V0dGluZ0lkLkF1dG9BcHByb3ZlKSB7XG5cdFx0XHRcdFx0cmV0dXJuIHsgLi4uZGVmYXVsdENvbmZpZywgLi4udXNlckNvbmZpZyB9O1xuXHRcdFx0XHR9XG5cdFx0XHRcdHJldHVybiBvcmlnaW5hbEdldFZhbHVlLmNhbGwoY29uZmlndXJhdGlvblNlcnZpY2UsIGtleSk7XG5cdFx0XHR9O1xuXG5cdFx0XHQvLyBUcmlnZ2VyIGNvbmZpZ3VyYXRpb24gdXBkYXRlXG5cdFx0XHRjb25maWd1cmF0aW9uU2VydmljZS5vbkRpZENoYW5nZUNvbmZpZ3VyYXRpb25FbWl0dGVyLmZpcmUoe1xuXHRcdFx0XHRhZmZlY3RzQ29uZmlndXJhdGlvbjogKCkgPT4gdHJ1ZSxcblx0XHRcdFx0YWZmZWN0ZWRLZXlzOiBuZXcgU2V0KFtUZXJtaW5hbENoYXRBZ2VudFRvb2xzU2V0dGluZ0lkLkF1dG9BcHByb3ZlXSksXG5cdFx0XHRcdHNvdXJjZTogQ29uZmlndXJhdGlvblRhcmdldC5VU0VSLFxuXHRcdFx0XHRjaGFuZ2U6IG51bGwhLFxuXHRcdFx0fSk7XG5cdFx0fVxuXG5cdFx0ZnVuY3Rpb24gc2V0QXV0b0FwcHJvdmVXaXRoRGVmYXVsdHNDb21tYW5kTGluZShcblx0XHRcdHVzZXJDb25maWc6IHsgW2tleTogc3RyaW5nXTogeyBhcHByb3ZlOiBib29sZWFuOyBtYXRjaENvbW1hbmRMaW5lPzogYm9vbGVhbiB9IHwgYm9vbGVhbiB9LFxuXHRcdFx0ZGVmYXVsdENvbmZpZzogeyBba2V5OiBzdHJpbmddOiB7IGFwcHJvdmU6IGJvb2xlYW47IG1hdGNoQ29tbWFuZExpbmU/OiBib29sZWFuIH0gfCBib29sZWFuIH1cblx0XHQpIHtcblx0XHRcdC8vIFNldCB1cCBtb2NrIGNvbmZpZ3VyYXRpb24gd2l0aCBkZWZhdWx0IHZhbHVlcyBmb3IgY29tbWFuZCBsaW5lIHJ1bGVzXG5cdFx0XHRjb25maWd1cmF0aW9uU2VydmljZS5zZXRVc2VyQ29uZmlndXJhdGlvbihUZXJtaW5hbENoYXRBZ2VudFRvb2xzU2V0dGluZ0lkLkF1dG9BcHByb3ZlLCB1c2VyQ29uZmlnKTtcblxuXHRcdFx0Ly8gTW9jayB0aGUgaW5zcGVjdCBtZXRob2QgdG8gcmV0dXJuIGRlZmF1bHQgdmFsdWVzXG5cdFx0XHRjb25zdCBvcmlnaW5hbEluc3BlY3QgPSBjb25maWd1cmF0aW9uU2VydmljZS5pbnNwZWN0O1xuXHRcdFx0Y29uc3Qgb3JpZ2luYWxHZXRWYWx1ZSA9IGNvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldFZhbHVlO1xuXG5cdFx0XHRjb25maWd1cmF0aW9uU2VydmljZS5pbnNwZWN0ID0gPFQ+KGtleTogc3RyaW5nKTogYW55ID0+IHtcblx0XHRcdFx0aWYgKGtleSA9PT0gVGVybWluYWxDaGF0QWdlbnRUb29sc1NldHRpbmdJZC5BdXRvQXBwcm92ZSkge1xuXHRcdFx0XHRcdHJldHVybiB7XG5cdFx0XHRcdFx0XHRkZWZhdWx0OiB7IHZhbHVlOiBkZWZhdWx0Q29uZmlnIH0sXG5cdFx0XHRcdFx0XHR1c2VyOiB7IHZhbHVlOiB1c2VyQ29uZmlnIH0sXG5cdFx0XHRcdFx0XHR3b3Jrc3BhY2U6IHVuZGVmaW5lZCxcblx0XHRcdFx0XHRcdHdvcmtzcGFjZUZvbGRlcjogdW5kZWZpbmVkLFxuXHRcdFx0XHRcdFx0YXBwbGljYXRpb246IHVuZGVmaW5lZCxcblx0XHRcdFx0XHRcdHBvbGljeTogdW5kZWZpbmVkLFxuXHRcdFx0XHRcdFx0bWVtb3J5OiB1bmRlZmluZWQsXG5cdFx0XHRcdFx0XHR2YWx1ZTogeyAuLi5kZWZhdWx0Q29uZmlnLCAuLi51c2VyQ29uZmlnIH1cblx0XHRcdFx0XHR9O1xuXHRcdFx0XHR9XG5cdFx0XHRcdHJldHVybiBvcmlnaW5hbEluc3BlY3QuY2FsbChjb25maWd1cmF0aW9uU2VydmljZSwga2V5KTtcblx0XHRcdH07XG5cblx0XHRcdGNvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldFZhbHVlID0gKGtleTogc3RyaW5nKTogYW55ID0+IHtcblx0XHRcdFx0aWYgKGtleSA9PT0gVGVybWluYWxDaGF0QWdlbnRUb29sc1NldHRpbmdJZC5BdXRvQXBwcm92ZSkge1xuXHRcdFx0XHRcdHJldHVybiB7IC4uLmRlZmF1bHRDb25maWcsIC4uLnVzZXJDb25maWcgfTtcblx0XHRcdFx0fVxuXHRcdFx0XHRyZXR1cm4gb3JpZ2luYWxHZXRWYWx1ZS5jYWxsKGNvbmZpZ3VyYXRpb25TZXJ2aWNlLCBrZXkpO1xuXHRcdFx0fTtcblxuXHRcdFx0Ly8gVHJpZ2dlciBjb25maWd1cmF0aW9uIHVwZGF0ZVxuXHRcdFx0Y29uZmlndXJhdGlvblNlcnZpY2Uub25EaWRDaGFuZ2VDb25maWd1cmF0aW9uRW1pdHRlci5maXJlKHtcblx0XHRcdFx0YWZmZWN0c0NvbmZpZ3VyYXRpb246ICgpID0+IHRydWUsXG5cdFx0XHRcdGFmZmVjdGVkS2V5czogbmV3IFNldChbVGVybWluYWxDaGF0QWdlbnRUb29sc1NldHRpbmdJZC5BdXRvQXBwcm92ZV0pLFxuXHRcdFx0XHRzb3VyY2U6IENvbmZpZ3VyYXRpb25UYXJnZXQuVVNFUixcblx0XHRcdFx0Y2hhbmdlOiBudWxsISxcblx0XHRcdH0pO1xuXHRcdH1cblxuXHRcdHRlc3QoJ3Nob3VsZCBjb3JyZWN0bHkgaWRlbnRpZnkgZGVmYXVsdCBydWxlcyB2cyB1c2VyLWRlZmluZWQgcnVsZXMnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRzZXRBdXRvQXBwcm92ZVdpdGhEZWZhdWx0cyhcblx0XHRcdFx0eyAnZWNobyc6IHRydWUsICdscyc6IHRydWUsICdwd2QnOiBmYWxzZSB9LFxuXHRcdFx0XHR7ICdlY2hvJzogdHJ1ZSwgJ2NhdCc6IHRydWUgfVxuXHRcdFx0KTtcblxuXHRcdFx0c3RyaWN0RXF1YWwoYXdhaXQgZ2V0SXNEZWZhdWx0UnVsZSgnZWNobyBoZWxsbycpLCB0cnVlLCAnZWNobyBpcyBpbiBib3RoIGRlZmF1bHQgYW5kIHVzZXIgY29uZmlnIHdpdGggc2FtZSB2YWx1ZSAtIHNob3VsZCBiZSBtYXJrZWQgYXMgZGVmYXVsdCcpO1xuXHRcdFx0c3RyaWN0RXF1YWwoYXdhaXQgZ2V0SXNEZWZhdWx0UnVsZSgnbHMgLWxhJyksIGZhbHNlLCAnbHMgaXMgb25seSBpbiB1c2VyIGNvbmZpZyAtIHNob3VsZCBiZSBtYXJrZWQgYXMgdXNlci1kZWZpbmVkJyk7XG5cdFx0XHRzdHJpY3RFcXVhbChhd2FpdCBnZXRJc0RlZmF1bHRSdWxlKCdwd2QnKSwgZmFsc2UsICdwd2QgaXMgb25seSBpbiB1c2VyIGNvbmZpZyAtIHNob3VsZCBiZSBtYXJrZWQgYXMgdXNlci1kZWZpbmVkJyk7XG5cdFx0XHRzdHJpY3RFcXVhbChhd2FpdCBnZXRJc0RlZmF1bHRSdWxlKCdjYXQgZmlsZS50eHQnKSwgdHJ1ZSwgJ2NhdCBpcyBpbiBib3RoIGRlZmF1bHQgYW5kIHVzZXIgY29uZmlnIHdpdGggc2FtZSB2YWx1ZSAtIHNob3VsZCBiZSBtYXJrZWQgYXMgZGVmYXVsdCcpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnc2hvdWxkIG1hcmsgYXMgZGVmYXVsdCB3aGVuIGNvbW1hbmQgaXMgb25seSBpbiBkZWZhdWx0IGNvbmZpZyBidXQgbm90IGluIHVzZXIgY29uZmlnJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0c2V0QXV0b0FwcHJvdmVXaXRoRGVmYXVsdHMoXG5cdFx0XHRcdHsgJ2VjaG8nOiB0cnVlLCAnbHMnOiB0cnVlIH0sICAvLyBVc2VyIGNvbmZpZyAoY2F0IGlzIE5PVCBoZXJlKVxuXHRcdFx0XHR7ICdlY2hvJzogdHJ1ZSwgJ2NhdCc6IHRydWUgfSAgLy8gRGVmYXVsdCBjb25maWcgKGNhdCBJUyBoZXJlKVxuXHRcdFx0KTtcblxuXHRcdFx0Ly8gVGVzdCB0aGF0IG1lcmdlZCBjb25maWcgaW5jbHVkZXMgYWxsIGNvbW1hbmRzXG5cdFx0XHRzdHJpY3RFcXVhbCgoYXdhaXQgY29tbWFuZExpbmVBdXRvQXBwcm92ZXIuaXNDb21tYW5kQXV0b0FwcHJvdmVkKCdlY2hvJywgc2hlbGwsIG9zLCB1bmRlZmluZWQpKS5yZXN1bHQsICdhcHByb3ZlZCcsICdlY2hvIHNob3VsZCBiZSBhcHByb3ZlZCcpO1xuXHRcdFx0c3RyaWN0RXF1YWwoKGF3YWl0IGNvbW1hbmRMaW5lQXV0b0FwcHJvdmVyLmlzQ29tbWFuZEF1dG9BcHByb3ZlZCgnbHMnLCBzaGVsbCwgb3MsIHVuZGVmaW5lZCkpLnJlc3VsdCwgJ2FwcHJvdmVkJywgJ2xzIHNob3VsZCBiZSBhcHByb3ZlZCcpO1xuXG5cdFx0XHQvLyBjYXQgc2hvdWxkIGJlIGFwcHJvdmVkIGJlY2F1c2UgaXQncyBpbiB0aGUgbWVyZ2VkIGNvbmZpZ1xuXHRcdFx0Y29uc3QgY2F0UmVzdWx0ID0gYXdhaXQgY29tbWFuZExpbmVBdXRvQXBwcm92ZXIuaXNDb21tYW5kQXV0b0FwcHJvdmVkKCdjYXQnLCBzaGVsbCwgb3MsIHVuZGVmaW5lZCk7XG5cdFx0XHRzdHJpY3RFcXVhbChjYXRSZXN1bHQucmVzdWx0LCAnYXBwcm92ZWQnLCAnY2F0IHNob3VsZCBiZSBhcHByb3ZlZCBmcm9tIGRlZmF1bHQgY29uZmlnJyk7XG5cblx0XHRcdC8vIGNhdCBzaG91bGQgYmUgbWFya2VkIGFzIGRlZmF1bHQgcnVsZSBzaW5jZSBpdCBjb21lcyBmcm9tIGRlZmF1bHQgY29uZmlnIG9ubHlcblx0XHRcdHN0cmljdEVxdWFsKGlzQXV0b0FwcHJvdmVSdWxlKGNhdFJlc3VsdC5ydWxlKSA/IGNhdFJlc3VsdC5ydWxlLmlzRGVmYXVsdFJ1bGUgOiB1bmRlZmluZWQsIHRydWUsICdjYXQgaXMgb25seSBpbiBkZWZhdWx0IGNvbmZpZywgbm90IGluIHVzZXIgY29uZmlnIC0gc2hvdWxkIGJlIG1hcmtlZCBhcyBkZWZhdWx0Jyk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdzaG91bGQgaGFuZGxlIGRlZmF1bHQgcnVsZXMgd2l0aCBkaWZmZXJlbnQgdmFsdWVzJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0c2V0QXV0b0FwcHJvdmVXaXRoRGVmYXVsdHMoXG5cdFx0XHRcdHsgJ2VjaG8nOiB0cnVlLCAncm0nOiB0cnVlIH0sXG5cdFx0XHRcdHsgJ2VjaG8nOiBmYWxzZSwgJ3JtJzogdHJ1ZSB9XG5cdFx0XHQpO1xuXG5cdFx0XHRzdHJpY3RFcXVhbChhd2FpdCBnZXRJc0RlZmF1bHRSdWxlKCdlY2hvIGhlbGxvJyksIGZhbHNlLCAnZWNobyBoYXMgZGlmZmVyZW50IHZhbHVlcyBpbiBkZWZhdWx0IHZzIHVzZXIgLSBzaG91bGQgYmUgbWFya2VkIGFzIHVzZXItZGVmaW5lZCcpO1xuXHRcdFx0c3RyaWN0RXF1YWwoYXdhaXQgZ2V0SXNEZWZhdWx0UnVsZSgncm0gZmlsZS50eHQnKSwgdHJ1ZSwgJ3JtIGhhcyBzYW1lIHZhbHVlIGluIGJvdGggLSBzaG91bGQgYmUgbWFya2VkIGFzIGRlZmF1bHQnKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3Nob3VsZCBoYW5kbGUgcmVnZXggcGF0dGVybnMgYXMgZGVmYXVsdCBydWxlcycsIGFzeW5jICgpID0+IHtcblx0XHRcdHNldEF1dG9BcHByb3ZlV2l0aERlZmF1bHRzKFxuXHRcdFx0XHR7ICcvXmdpdC8nOiB0cnVlLCAnL15ucG0vJzogZmFsc2UgfSxcblx0XHRcdFx0eyAnL15naXQvJzogdHJ1ZSwgJy9eZG9ja2VyLyc6IHRydWUgfVxuXHRcdFx0KTtcblxuXHRcdFx0c3RyaWN0RXF1YWwoYXdhaXQgZ2V0SXNEZWZhdWx0UnVsZSgnZ2l0IHN0YXR1cycpLCB0cnVlLCAnZ2l0IHBhdHRlcm4gbWF0Y2hlcyBkZWZhdWx0IC0gc2hvdWxkIGJlIG1hcmtlZCBhcyBkZWZhdWx0Jyk7XG5cdFx0XHRzdHJpY3RFcXVhbChhd2FpdCBnZXRJc0RlZmF1bHRSdWxlKCducG0gaW5zdGFsbCcpLCBmYWxzZSwgJ25wbSBwYXR0ZXJuIGlzIHVzZXItb25seSAtIHNob3VsZCBiZSBtYXJrZWQgYXMgdXNlci1kZWZpbmVkJyk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdzaG91bGQgaGFuZGxlIG1peGVkIHN0cmluZyBhbmQgcmVnZXggcGF0dGVybnMnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRzZXRBdXRvQXBwcm92ZVdpdGhEZWZhdWx0cyhcblx0XHRcdFx0eyAnZWNobyc6IHRydWUsICcvXmxzLyc6IGZhbHNlIH0sXG5cdFx0XHRcdHsgJ2VjaG8nOiB0cnVlLCAnY2F0JzogdHJ1ZSB9XG5cdFx0XHQpO1xuXG5cdFx0XHRzdHJpY3RFcXVhbChhd2FpdCBnZXRJc0RlZmF1bHRSdWxlKCdlY2hvIGhlbGxvJyksIHRydWUsICdTdHJpbmcgcGF0dGVybiBtYXRjaGluZyBkZWZhdWx0Jyk7XG5cdFx0XHRzdHJpY3RFcXVhbChhd2FpdCBnZXRJc0RlZmF1bHRSdWxlKCdscyAtbGEnKSwgZmFsc2UsICdSZWdleCBwYXR0ZXJuIHVzZXItZGVmaW5lZCcpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnc2hvdWxkIGhhbmRsZSBjb21tYW5kIGxpbmUgcnVsZXMgd2l0aCBpc0RlZmF1bHRSdWxlJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0c2V0QXV0b0FwcHJvdmVXaXRoRGVmYXVsdHNDb21tYW5kTGluZShcblx0XHRcdFx0e1xuXHRcdFx0XHRcdCdlY2hvJzogeyBhcHByb3ZlOiB0cnVlLCBtYXRjaENvbW1hbmRMaW5lOiB0cnVlIH0sXG5cdFx0XHRcdFx0J2xzJzogeyBhcHByb3ZlOiBmYWxzZSwgbWF0Y2hDb21tYW5kTGluZTogdHJ1ZSB9XG5cdFx0XHRcdH0sXG5cdFx0XHRcdHtcblx0XHRcdFx0XHQnZWNobyc6IHsgYXBwcm92ZTogdHJ1ZSwgbWF0Y2hDb21tYW5kTGluZTogdHJ1ZSB9LFxuXHRcdFx0XHRcdCdjYXQnOiB7IGFwcHJvdmU6IHRydWUsIG1hdGNoQ29tbWFuZExpbmU6IHRydWUgfVxuXHRcdFx0XHR9XG5cdFx0XHQpO1xuXG5cdFx0XHRzdHJpY3RFcXVhbChnZXRDb21tYW5kTGluZUlzRGVmYXVsdFJ1bGUoJ2VjaG8gaGVsbG8gd29ybGQnKSwgdHJ1ZSwgJ2VjaG8gbWF0Y2hlcyBkZWZhdWx0IGNvbmZpZyBleGFjdGx5IHVzaW5nIHN0cnVjdHVyYWwgZXF1YWxpdHkgLSBzaG91bGQgYmUgbWFya2VkIGFzIGRlZmF1bHQnKTtcblx0XHRcdHN0cmljdEVxdWFsKGdldENvbW1hbmRMaW5lSXNEZWZhdWx0UnVsZSgnbHMgLWxhJyksIGZhbHNlLCAnbHMgaXMgdXNlci1kZWZpbmVkIG9ubHkgLSBzaG91bGQgYmUgbWFya2VkIGFzIHVzZXItZGVmaW5lZCcpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnc2hvdWxkIGhhbmRsZSBjb21tYW5kIGxpbmUgcnVsZXMgd2l0aCBkaWZmZXJlbnQgbWF0Y2hDb21tYW5kTGluZSB2YWx1ZXMnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRzZXRBdXRvQXBwcm92ZVdpdGhEZWZhdWx0c0NvbW1hbmRMaW5lKFxuXHRcdFx0XHR7XG5cdFx0XHRcdFx0J2VjaG8nOiB7IGFwcHJvdmU6IHRydWUsIG1hdGNoQ29tbWFuZExpbmU6IHRydWUgfSxcblx0XHRcdFx0XHQnbHMnOiB7IGFwcHJvdmU6IHRydWUsIG1hdGNoQ29tbWFuZExpbmU6IGZhbHNlIH1cblx0XHRcdFx0fSxcblx0XHRcdFx0e1xuXHRcdFx0XHRcdCdlY2hvJzogeyBhcHByb3ZlOiB0cnVlLCBtYXRjaENvbW1hbmRMaW5lOiBmYWxzZSB9LFxuXHRcdFx0XHRcdCdscyc6IHsgYXBwcm92ZTogdHJ1ZSwgbWF0Y2hDb21tYW5kTGluZTogZmFsc2UgfVxuXHRcdFx0XHR9XG5cdFx0XHQpO1xuXG5cdFx0XHRzdHJpY3RFcXVhbChnZXRDb21tYW5kTGluZUlzRGVmYXVsdFJ1bGUoJ2VjaG8gaGVsbG8nKSwgZmFsc2UsICdlY2hvIGhhcyBkaWZmZXJlbnQgbWF0Y2hDb21tYW5kTGluZSB2YWx1ZSAtIHNob3VsZCBiZSB1c2VyLWRlZmluZWQnKTtcblx0XHRcdHN0cmljdEVxdWFsKGdldENvbW1hbmRMaW5lSXNEZWZhdWx0UnVsZSgnbHMgLWxhJyksIHVuZGVmaW5lZCwgJ2xzIG1hdGNoZXMgZXhhY3RseSAtIHNob3VsZCBiZSBkZWZhdWx0IChidXQgd29uXFwndCBtYXRjaCBjb21tYW5kIGxpbmUgY2hlY2sgc2luY2UgbWF0Y2hDb21tYW5kTGluZSBpcyBmYWxzZSknKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3Nob3VsZCBoYW5kbGUgYm9vbGVhbiB2cyBvYmplY3QgZm9ybWF0IGNvbnNpc3RlbmN5JywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0c2V0QXV0b0FwcHJvdmVXaXRoRGVmYXVsdHNDb21tYW5kTGluZShcblx0XHRcdFx0e1xuXHRcdFx0XHRcdCdlY2hvJzogdHJ1ZSxcblx0XHRcdFx0XHQnbHMnOiB7IGFwcHJvdmU6IHRydWUsIG1hdGNoQ29tbWFuZExpbmU6IHRydWUgfVxuXHRcdFx0XHR9LFxuXHRcdFx0XHR7XG5cdFx0XHRcdFx0J2VjaG8nOiB0cnVlLFxuXHRcdFx0XHRcdCdscyc6IHsgYXBwcm92ZTogdHJ1ZSwgbWF0Y2hDb21tYW5kTGluZTogdHJ1ZSB9XG5cdFx0XHRcdH1cblx0XHRcdCk7XG5cblx0XHRcdHN0cmljdEVxdWFsKGF3YWl0IGdldElzRGVmYXVsdFJ1bGUoJ2VjaG8gaGVsbG8nKSwgdHJ1ZSwgJ0Jvb2xlYW4gZm9ybWF0IG1hdGNoaW5nIC0gc2hvdWxkIGJlIGRlZmF1bHQnKTtcblx0XHRcdHN0cmljdEVxdWFsKGdldENvbW1hbmRMaW5lSXNEZWZhdWx0UnVsZSgnbHMgLWxhJyksIHRydWUsICdPYmplY3QgZm9ybWF0IG1hdGNoaW5nIHVzaW5nIHN0cnVjdHVyYWwgZXF1YWxpdHkgLSBzaG91bGQgYmUgZGVmYXVsdCcpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnc2hvdWxkIHJldHVybiB1bmRlZmluZWQgZm9yIG5vTWF0Y2ggY2FzZXMnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRzZXRBdXRvQXBwcm92ZVdpdGhEZWZhdWx0cyhcblx0XHRcdFx0eyAnZWNobyc6IHRydWUgfSxcblx0XHRcdFx0eyAnY2F0JzogdHJ1ZSB9XG5cdFx0XHQpO1xuXG5cdFx0XHRzdHJpY3RFcXVhbChhd2FpdCBnZXRJc0RlZmF1bHRSdWxlKCd1bmtub3duLWNvbW1hbmQnKSwgdW5kZWZpbmVkLCAnQ29tbWFuZCB0aGF0IG1hdGNoZXMgbmVpdGhlciB1c2VyIG5vciBkZWZhdWx0IGNvbmZpZycpO1xuXHRcdFx0c3RyaWN0RXF1YWwoZ2V0Q29tbWFuZExpbmVJc0RlZmF1bHRSdWxlKCd1bmtub3duLWNvbW1hbmQnKSwgdW5kZWZpbmVkLCAnQ29tbWFuZCB0aGF0IG1hdGNoZXMgbmVpdGhlciB1c2VyIG5vciBkZWZhdWx0IGNvbmZpZycpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnc2hvdWxkIGhhbmRsZSBlbXB0eSBjb25maWd1cmF0aW9ucycsIGFzeW5jICgpID0+IHtcblx0XHRcdHNldEF1dG9BcHByb3ZlV2l0aERlZmF1bHRzKFxuXHRcdFx0XHR7fSxcblx0XHRcdFx0e31cblx0XHRcdCk7XG5cblx0XHRcdHN0cmljdEVxdWFsKGF3YWl0IGdldElzRGVmYXVsdFJ1bGUoJ2VjaG8gaGVsbG8nKSwgdW5kZWZpbmVkKTtcblx0XHRcdHN0cmljdEVxdWFsKGdldENvbW1hbmRMaW5lSXNEZWZhdWx0UnVsZSgnZWNobyBoZWxsbycpLCB1bmRlZmluZWQpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnc2hvdWxkIGhhbmRsZSBvbmx5IGRlZmF1bHQgY29uZmlnIHdpdGggbm8gdXNlciBvdmVycmlkZXMnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRzZXRBdXRvQXBwcm92ZVdpdGhEZWZhdWx0cyhcblx0XHRcdFx0e30sXG5cdFx0XHRcdHsgJ2VjaG8nOiB0cnVlLCAnbHMnOiBmYWxzZSB9XG5cdFx0XHQpO1xuXG5cdFx0XHRzdHJpY3RFcXVhbChhd2FpdCBnZXRJc0RlZmF1bHRSdWxlKCdlY2hvIGhlbGxvJyksIHRydWUsICdDb21tYW5kcyBpbiBkZWZhdWx0IGNvbmZpZyBzaG91bGQgYmUgbWFya2VkIGFzIGRlZmF1bHQgcnVsZXMgZXZlbiB3aXRoIGVtcHR5IHVzZXIgY29uZmlnJyk7XG5cdFx0XHRzdHJpY3RFcXVhbChhd2FpdCBnZXRJc0RlZmF1bHRSdWxlKCdscyAtbGEnKSwgdHJ1ZSwgJ0NvbW1hbmRzIGluIGRlZmF1bHQgY29uZmlnIHNob3VsZCBiZSBtYXJrZWQgYXMgZGVmYXVsdCBydWxlcyBldmVuIHdpdGggZW1wdHkgdXNlciBjb25maWcnKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3Nob3VsZCBoYW5kbGUgY29tcGxleCBuZXN0ZWQgb2JqZWN0IHJ1bGVzJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0c2V0QXV0b0FwcHJvdmVXaXRoRGVmYXVsdHNDb21tYW5kTGluZShcblx0XHRcdFx0e1xuXHRcdFx0XHRcdCducG0nOiB7IGFwcHJvdmU6IHRydWUsIG1hdGNoQ29tbWFuZExpbmU6IHRydWUgfSxcblx0XHRcdFx0XHQnZ2l0JzogeyBhcHByb3ZlOiBmYWxzZSwgbWF0Y2hDb21tYW5kTGluZTogZmFsc2UgfVxuXHRcdFx0XHR9LFxuXHRcdFx0XHR7XG5cdFx0XHRcdFx0J25wbSc6IHsgYXBwcm92ZTogdHJ1ZSwgbWF0Y2hDb21tYW5kTGluZTogdHJ1ZSB9LFxuXHRcdFx0XHRcdCdkb2NrZXInOiB7IGFwcHJvdmU6IHRydWUsIG1hdGNoQ29tbWFuZExpbmU6IHRydWUgfVxuXHRcdFx0XHR9XG5cdFx0XHQpO1xuXG5cdFx0XHRzdHJpY3RFcXVhbChnZXRDb21tYW5kTGluZUlzRGVmYXVsdFJ1bGUoJ25wbSBpbnN0YWxsJyksIHRydWUsICducG0gbWF0Y2hlcyBkZWZhdWx0IGV4YWN0bHkgdXNpbmcgc3RydWN0dXJhbCBlcXVhbGl0eSAtIHNob3VsZCBiZSBkZWZhdWx0Jyk7XG5cdFx0XHRzdHJpY3RFcXVhbChnZXRDb21tYW5kTGluZUlzRGVmYXVsdFJ1bGUoJ2dpdCBzdGF0dXMnKSwgdW5kZWZpbmVkLCAnZ2l0IGlzIHVzZXItZGVmaW5lZCAtIHNob3VsZCBiZSB1c2VyLWRlZmluZWQgKGJ1dCB3b25cXCd0IG1hdGNoIGNvbW1hbmQgbGluZSBzaW5jZSBtYXRjaENvbW1hbmRMaW5lIGlzIGZhbHNlKScpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnc2hvdWxkIGhhbmRsZSBQb3dlclNoZWxsIGNhc2UtaW5zZW5zaXRpdmUgbWF0Y2hpbmcgd2l0aCBkZWZhdWx0cycsIGFzeW5jICgpID0+IHtcblx0XHRcdHNoZWxsID0gJ3B3c2gnO1xuXHRcdFx0b3MgPSBPcGVyYXRpbmdTeXN0ZW0uV2luZG93cztcblxuXHRcdFx0c2V0QXV0b0FwcHJvdmVXaXRoRGVmYXVsdHMoXG5cdFx0XHRcdHsgJ0dldC1Qcm9jZXNzJzogdHJ1ZSB9LFxuXHRcdFx0XHR7ICdHZXQtUHJvY2Vzcyc6IHRydWUgfVxuXHRcdFx0KTtcblxuXHRcdFx0c3RyaWN0RXF1YWwoYXdhaXQgZ2V0SXNEZWZhdWx0UnVsZSgnR2V0LVByb2Nlc3MnKSwgdHJ1ZSwgJ0Nhc2UtaW5zZW5zaXRpdmUgUG93ZXJTaGVsbCBjb21tYW5kIG1hdGNoaW5nIGRlZmF1bHQnKTtcblx0XHRcdHN0cmljdEVxdWFsKGF3YWl0IGdldElzRGVmYXVsdFJ1bGUoJ2dldC1wcm9jZXNzJyksIHRydWUsICdDYXNlLWluc2Vuc2l0aXZlIFBvd2VyU2hlbGwgY29tbWFuZCBtYXRjaGluZyBkZWZhdWx0Jyk7XG5cdFx0XHRzdHJpY3RFcXVhbChhd2FpdCBnZXRJc0RlZmF1bHRSdWxlKCdHRVQtUFJPQ0VTUycpLCB0cnVlLCAnQ2FzZS1pbnNlbnNpdGl2ZSBQb3dlclNoZWxsIGNvbW1hbmQgbWF0Y2hpbmcgZGVmYXVsdCcpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnc2hvdWxkIHVzZSBzdHJ1Y3R1cmFsIGVxdWFsaXR5IGZvciBvYmplY3QgY29tcGFyaXNvbicsIGFzeW5jICgpID0+IHtcblx0XHRcdC8vIFRlc3QgdGhhdCBvYmplY3RzIHdpdGggc2FtZSBjb250ZW50IGJ1dCBkaWZmZXJlbnQgaW5zdGFuY2VzIGFyZSB0cmVhdGVkIGFzIGVxdWFsXG5cdFx0XHRjb25zdCB1c2VyQ29uZmlnID0geyAndGVzdCc6IHsgYXBwcm92ZTogdHJ1ZSwgbWF0Y2hDb21tYW5kTGluZTogdHJ1ZSB9IH07XG5cdFx0XHRjb25zdCBkZWZhdWx0Q29uZmlnID0geyAndGVzdCc6IHsgYXBwcm92ZTogdHJ1ZSwgbWF0Y2hDb21tYW5kTGluZTogdHJ1ZSB9IH07XG5cblx0XHRcdHNldEF1dG9BcHByb3ZlV2l0aERlZmF1bHRzQ29tbWFuZExpbmUodXNlckNvbmZpZywgZGVmYXVsdENvbmZpZyk7XG5cblx0XHRcdHN0cmljdEVxdWFsKGdldENvbW1hbmRMaW5lSXNEZWZhdWx0UnVsZSgndGVzdCBjb21tYW5kJyksIHRydWUsICdFdmVuIHRob3VnaCB1c2VyQ29uZmlnIGFuZCBkZWZhdWx0Q29uZmlnIGFyZSBkaWZmZXJlbnQgb2JqZWN0IGluc3RhbmNlcywgdGhleSBoYXZlIHRoZSBzYW1lIHN0cnVjdHVyZSBhbmQgdmFsdWVzLCBzbyBzaG91bGQgYmUgY29uc2lkZXJlZCBkZWZhdWx0Jyk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdzaG91bGQgZGV0ZWN0IHN0cnVjdHVyYWwgZGlmZmVyZW5jZXMgaW4gb2JqZWN0cycsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IHVzZXJDb25maWcgPSB7ICd0ZXN0JzogeyBhcHByb3ZlOiB0cnVlLCBtYXRjaENvbW1hbmRMaW5lOiB0cnVlIH0gfTtcblx0XHRcdGNvbnN0IGRlZmF1bHRDb25maWcgPSB7ICd0ZXN0JzogeyBhcHByb3ZlOiB0cnVlLCBtYXRjaENvbW1hbmRMaW5lOiBmYWxzZSB9IH07XG5cblx0XHRcdHNldEF1dG9BcHByb3ZlV2l0aERlZmF1bHRzQ29tbWFuZExpbmUodXNlckNvbmZpZywgZGVmYXVsdENvbmZpZyk7XG5cblx0XHRcdHN0cmljdEVxdWFsKGdldENvbW1hbmRMaW5lSXNEZWZhdWx0UnVsZSgndGVzdCBjb21tYW5kJyksIGZhbHNlLCAnT2JqZWN0cyBoYXZlIGRpZmZlcmVudCBtYXRjaENvbW1hbmRMaW5lIHZhbHVlcywgc28gc2hvdWxkIGJlIHVzZXItZGVmaW5lZCcpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnc2hvdWxkIGhhbmRsZSBtaXhlZCB0eXBlcyBjb3JyZWN0bHknLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCB1c2VyQ29uZmlnID0ge1xuXHRcdFx0XHQnY21kMSc6IHRydWUsXG5cdFx0XHRcdCdjbWQyJzogeyBhcHByb3ZlOiBmYWxzZSwgbWF0Y2hDb21tYW5kTGluZTogdHJ1ZSB9XG5cdFx0XHR9O1xuXHRcdFx0Y29uc3QgZGVmYXVsdENvbmZpZyA9IHtcblx0XHRcdFx0J2NtZDEnOiB0cnVlLFxuXHRcdFx0XHQnY21kMic6IHsgYXBwcm92ZTogZmFsc2UsIG1hdGNoQ29tbWFuZExpbmU6IHRydWUgfVxuXHRcdFx0fTtcblxuXHRcdFx0c2V0QXV0b0FwcHJvdmVXaXRoRGVmYXVsdHNDb21tYW5kTGluZSh1c2VyQ29uZmlnLCBkZWZhdWx0Q29uZmlnKTtcblxuXHRcdFx0c3RyaWN0RXF1YWwoYXdhaXQgZ2V0SXNEZWZhdWx0UnVsZSgnY21kMSBhcmcnKSwgdHJ1ZSwgJ0Jvb2xlYW4gdHlwZSBzaG91bGQgbWF0Y2ggZGVmYXVsdCcpO1xuXHRcdFx0c3RyaWN0RXF1YWwoZ2V0Q29tbWFuZExpbmVJc0RlZmF1bHRSdWxlKCdjbWQyIGFyZycpLCB0cnVlLCAnT2JqZWN0IHR5cGUgc2hvdWxkIG1hdGNoIGRlZmF1bHQgdXNpbmcgc3RydWN0dXJhbCBlcXVhbGl0eSAoZXZlbiB0aG91Z2ggaXRcXCdzIGEgZGVueSBydWxlKScpO1xuXHRcdH0pO1xuXHR9KTtcblxuXHRzdWl0ZSgnaWdub3JlRGVmYXVsdEF1dG9BcHByb3ZlUnVsZXMnLCAoKSA9PiB7XG5cdFx0ZnVuY3Rpb24gc2V0QXV0b0FwcHJvdmVXaXRoRGVmYXVsdHModXNlckNvbmZpZzogeyBba2V5OiBzdHJpbmddOiBib29sZWFuIH0sIGRlZmF1bHRDb25maWc6IHsgW2tleTogc3RyaW5nXTogYm9vbGVhbiB9KSB7XG5cdFx0XHQvLyBTZXQgdXAgbW9jayBjb25maWd1cmF0aW9uIHdpdGggZGVmYXVsdCB2YWx1ZXNcblx0XHRcdGNvbmZpZ3VyYXRpb25TZXJ2aWNlLnNldFVzZXJDb25maWd1cmF0aW9uKFRlcm1pbmFsQ2hhdEFnZW50VG9vbHNTZXR0aW5nSWQuQXV0b0FwcHJvdmUsIHVzZXJDb25maWcpO1xuXG5cdFx0XHQvLyBNb2NrIHRoZSBpbnNwZWN0IG1ldGhvZCB0byByZXR1cm4gZGVmYXVsdCB2YWx1ZXNcblx0XHRcdGNvbnN0IG9yaWdpbmFsSW5zcGVjdCA9IGNvbmZpZ3VyYXRpb25TZXJ2aWNlLmluc3BlY3Q7XG5cdFx0XHRjb25zdCBvcmlnaW5hbEdldFZhbHVlID0gY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0VmFsdWU7XG5cblx0XHRcdGNvbmZpZ3VyYXRpb25TZXJ2aWNlLmluc3BlY3QgPSAoa2V5OiBzdHJpbmcpOiBhbnkgPT4ge1xuXHRcdFx0XHRpZiAoa2V5ID09PSBUZXJtaW5hbENoYXRBZ2VudFRvb2xzU2V0dGluZ0lkLkF1dG9BcHByb3ZlKSB7XG5cdFx0XHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0XHRcdGRlZmF1bHQ6IHsgdmFsdWU6IGRlZmF1bHRDb25maWcgfSxcblx0XHRcdFx0XHRcdHVzZXI6IHsgdmFsdWU6IHVzZXJDb25maWcgfSxcblx0XHRcdFx0XHRcdHdvcmtzcGFjZTogdW5kZWZpbmVkLFxuXHRcdFx0XHRcdFx0d29ya3NwYWNlRm9sZGVyOiB1bmRlZmluZWQsXG5cdFx0XHRcdFx0XHRhcHBsaWNhdGlvbjogdW5kZWZpbmVkLFxuXHRcdFx0XHRcdFx0cG9saWN5OiB1bmRlZmluZWQsXG5cdFx0XHRcdFx0XHRtZW1vcnk6IHVuZGVmaW5lZCxcblx0XHRcdFx0XHRcdHZhbHVlOiB7IC4uLmRlZmF1bHRDb25maWcsIC4uLnVzZXJDb25maWcgfVxuXHRcdFx0XHRcdH07XG5cdFx0XHRcdH1cblx0XHRcdFx0cmV0dXJuIG9yaWdpbmFsSW5zcGVjdC5jYWxsKGNvbmZpZ3VyYXRpb25TZXJ2aWNlLCBrZXkpO1xuXHRcdFx0fTtcblxuXHRcdFx0Y29uZmlndXJhdGlvblNlcnZpY2UuZ2V0VmFsdWUgPSAoa2V5OiBzdHJpbmcpOiBhbnkgPT4ge1xuXHRcdFx0XHRpZiAoa2V5ID09PSBUZXJtaW5hbENoYXRBZ2VudFRvb2xzU2V0dGluZ0lkLkF1dG9BcHByb3ZlKSB7XG5cdFx0XHRcdFx0cmV0dXJuIHsgLi4uZGVmYXVsdENvbmZpZywgLi4udXNlckNvbmZpZyB9O1xuXHRcdFx0XHR9XG5cdFx0XHRcdHJldHVybiBvcmlnaW5hbEdldFZhbHVlLmNhbGwoY29uZmlndXJhdGlvblNlcnZpY2UsIGtleSk7XG5cdFx0XHR9O1xuXG5cdFx0XHQvLyBUcmlnZ2VyIGNvbmZpZ3VyYXRpb24gdXBkYXRlXG5cdFx0XHRjb25maWd1cmF0aW9uU2VydmljZS5vbkRpZENoYW5nZUNvbmZpZ3VyYXRpb25FbWl0dGVyLmZpcmUoe1xuXHRcdFx0XHRhZmZlY3RzQ29uZmlndXJhdGlvbjogKCkgPT4gdHJ1ZSxcblx0XHRcdFx0YWZmZWN0ZWRLZXlzOiBuZXcgU2V0KFtUZXJtaW5hbENoYXRBZ2VudFRvb2xzU2V0dGluZ0lkLkF1dG9BcHByb3ZlXSksXG5cdFx0XHRcdHNvdXJjZTogQ29uZmlndXJhdGlvblRhcmdldC5VU0VSLFxuXHRcdFx0XHRjaGFuZ2U6IG51bGwhLFxuXHRcdFx0fSk7XG5cdFx0fVxuXG5cdFx0ZnVuY3Rpb24gc2V0SWdub3JlRGVmYXVsdEF1dG9BcHByb3ZlUnVsZXModmFsdWU6IGJvb2xlYW4pIHtcblx0XHRcdHNldENvbmZpZyhUZXJtaW5hbENoYXRBZ2VudFRvb2xzU2V0dGluZ0lkLklnbm9yZURlZmF1bHRBdXRvQXBwcm92ZVJ1bGVzLCB2YWx1ZSk7XG5cdFx0fVxuXG5cdFx0dGVzdCgnc2hvdWxkIGluY2x1ZGUgZGVmYXVsdCBydWxlcyB3aGVuIGlnbm9yZURlZmF1bHRBdXRvQXBwcm92ZVJ1bGVzIGlzIGZhbHNlIChkZWZhdWx0IGJlaGF2aW9yKScsIGFzeW5jICgpID0+IHtcblx0XHRcdHNldEF1dG9BcHByb3ZlV2l0aERlZmF1bHRzKFxuXHRcdFx0XHR7ICdscyc6IHRydWUgfSxcblx0XHRcdFx0eyAnZWNobyc6IHRydWUsICdjYXQnOiB0cnVlIH1cblx0XHRcdCk7XG5cdFx0XHRzZXRJZ25vcmVEZWZhdWx0QXV0b0FwcHJvdmVSdWxlcyhmYWxzZSk7XG5cblx0XHRcdG9rKGF3YWl0IGlzQXV0b0FwcHJvdmVkKCdscyAtbGEnKSwgJ1VzZXItZGVmaW5lZCBydWxlIHNob3VsZCB3b3JrJyk7XG5cdFx0XHRvayhhd2FpdCBpc0F1dG9BcHByb3ZlZCgnZWNobyBoZWxsbycpLCAnRGVmYXVsdCBydWxlIHNob3VsZCB3b3JrIHdoZW4gbm90IGlnbm9yZWQnKTtcblx0XHRcdG9rKGF3YWl0IGlzQXV0b0FwcHJvdmVkKCdjYXQgZmlsZS50eHQnKSwgJ0RlZmF1bHQgcnVsZSBzaG91bGQgd29yayB3aGVuIG5vdCBpZ25vcmVkJyk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdzaG91bGQgZXhjbHVkZSBkZWZhdWx0IHJ1bGVzIHdoZW4gaWdub3JlRGVmYXVsdEF1dG9BcHByb3ZlUnVsZXMgaXMgdHJ1ZScsIGFzeW5jICgpID0+IHtcblx0XHRcdHNldEF1dG9BcHByb3ZlV2l0aERlZmF1bHRzKFxuXHRcdFx0XHR7ICdscyc6IHRydWUgfSxcblx0XHRcdFx0eyAnZWNobyc6IHRydWUsICdjYXQnOiB0cnVlIH1cblx0XHRcdCk7XG5cdFx0XHRzZXRJZ25vcmVEZWZhdWx0QXV0b0FwcHJvdmVSdWxlcyh0cnVlKTtcblxuXHRcdFx0b2soYXdhaXQgaXNBdXRvQXBwcm92ZWQoJ2xzIC1sYScpLCAnVXNlci1kZWZpbmVkIHJ1bGUgc2hvdWxkIHN0aWxsIHdvcmsnKTtcblx0XHRcdG9rKCFhd2FpdCBpc0F1dG9BcHByb3ZlZCgnZWNobyBoZWxsbycpLCAnRGVmYXVsdCBydWxlIHNob3VsZCBiZSBpZ25vcmVkJyk7XG5cdFx0XHRvayghYXdhaXQgaXNBdXRvQXBwcm92ZWQoJ2NhdCBmaWxlLnR4dCcpLCAnRGVmYXVsdCBydWxlIHNob3VsZCBiZSBpZ25vcmVkJyk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdzaG91bGQgYXR0cmlidXRlIHdvcmtzcGFjZS1mb2xkZXItc2NvcGVkIHJ1bGVzIHRvIFdPUktTUEFDRV9GT0xERVIgdGFyZ2V0JywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3Qgd29ya3NwYWNlRm9sZGVyQ29uZmlnID0geyAnZ2l0JzogdHJ1ZSB9O1xuXHRcdFx0Y29uZmlndXJhdGlvblNlcnZpY2Uuc2V0VXNlckNvbmZpZ3VyYXRpb24oVGVybWluYWxDaGF0QWdlbnRUb29sc1NldHRpbmdJZC5BdXRvQXBwcm92ZSwgd29ya3NwYWNlRm9sZGVyQ29uZmlnKTtcblxuXHRcdFx0Y29uc3Qgb3JpZ2luYWxJbnNwZWN0ID0gY29uZmlndXJhdGlvblNlcnZpY2UuaW5zcGVjdDtcblx0XHRcdGNvbnN0IG9yaWdpbmFsR2V0VmFsdWUgPSBjb25maWd1cmF0aW9uU2VydmljZS5nZXRWYWx1ZTtcblxuXHRcdFx0Y29uZmlndXJhdGlvblNlcnZpY2UuaW5zcGVjdCA9IChrZXk6IHN0cmluZyk6IGFueSA9PiB7XG5cdFx0XHRcdGlmIChrZXkgPT09IFRlcm1pbmFsQ2hhdEFnZW50VG9vbHNTZXR0aW5nSWQuQXV0b0FwcHJvdmUpIHtcblx0XHRcdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRcdFx0ZGVmYXVsdDogdW5kZWZpbmVkLFxuXHRcdFx0XHRcdFx0dXNlcjogdW5kZWZpbmVkLFxuXHRcdFx0XHRcdFx0d29ya3NwYWNlOiB1bmRlZmluZWQsXG5cdFx0XHRcdFx0XHR3b3Jrc3BhY2VGb2xkZXI6IHVuZGVmaW5lZCxcblx0XHRcdFx0XHRcdHdvcmtzcGFjZUZvbGRlclZhbHVlOiB3b3Jrc3BhY2VGb2xkZXJDb25maWcsXG5cdFx0XHRcdFx0XHRhcHBsaWNhdGlvbjogdW5kZWZpbmVkLFxuXHRcdFx0XHRcdFx0cG9saWN5OiB1bmRlZmluZWQsXG5cdFx0XHRcdFx0XHRtZW1vcnk6IHVuZGVmaW5lZCxcblx0XHRcdFx0XHRcdHZhbHVlOiB3b3Jrc3BhY2VGb2xkZXJDb25maWdcblx0XHRcdFx0XHR9O1xuXHRcdFx0XHR9XG5cdFx0XHRcdHJldHVybiBvcmlnaW5hbEluc3BlY3QuY2FsbChjb25maWd1cmF0aW9uU2VydmljZSwga2V5KTtcblx0XHRcdH07XG5cblx0XHRcdGNvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldFZhbHVlID0gKGtleTogc3RyaW5nKTogYW55ID0+IHtcblx0XHRcdFx0aWYgKGtleSA9PT0gVGVybWluYWxDaGF0QWdlbnRUb29sc1NldHRpbmdJZC5BdXRvQXBwcm92ZSkge1xuXHRcdFx0XHRcdHJldHVybiB3b3Jrc3BhY2VGb2xkZXJDb25maWc7XG5cdFx0XHRcdH1cblx0XHRcdFx0cmV0dXJuIG9yaWdpbmFsR2V0VmFsdWUuY2FsbChjb25maWd1cmF0aW9uU2VydmljZSwga2V5KTtcblx0XHRcdH07XG5cblx0XHRcdGNvbmZpZ3VyYXRpb25TZXJ2aWNlLm9uRGlkQ2hhbmdlQ29uZmlndXJhdGlvbkVtaXR0ZXIuZmlyZSh7XG5cdFx0XHRcdGFmZmVjdHNDb25maWd1cmF0aW9uOiAoKSA9PiB0cnVlLFxuXHRcdFx0XHRhZmZlY3RlZEtleXM6IG5ldyBTZXQoW1Rlcm1pbmFsQ2hhdEFnZW50VG9vbHNTZXR0aW5nSWQuQXV0b0FwcHJvdmVdKSxcblx0XHRcdFx0c291cmNlOiBDb25maWd1cmF0aW9uVGFyZ2V0LldPUktTUEFDRV9GT0xERVIsXG5cdFx0XHRcdGNoYW5nZTogbnVsbCEsXG5cdFx0XHR9KTtcblxuXHRcdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgY29tbWFuZExpbmVBdXRvQXBwcm92ZXIuaXNDb21tYW5kQXV0b0FwcHJvdmVkKCdnaXQgc3RhdHVzJywgc2hlbGwsIG9zLCB1bmRlZmluZWQpO1xuXHRcdFx0c3RyaWN0RXF1YWwocmVzdWx0LnJlc3VsdCwgJ2FwcHJvdmVkJywgJ2dpdCBjb21tYW5kIHNob3VsZCBiZSBhcHByb3ZlZCcpO1xuXHRcdFx0b2soaXNBdXRvQXBwcm92ZVJ1bGUocmVzdWx0LnJ1bGUpLCAncmVzdWx0IHNob3VsZCBoYXZlIGFuIGF1dG8tYXBwcm92ZSBydWxlJyk7XG5cdFx0XHRzdHJpY3RFcXVhbChyZXN1bHQucnVsZS5zb3VyY2VUYXJnZXQsIENvbmZpZ3VyYXRpb25UYXJnZXQuV09SS1NQQUNFX0ZPTERFUiwgJ3dvcmtzcGFjZS1mb2xkZXItc2NvcGVkIHJ1bGUgc2hvdWxkIGhhdmUgV09SS1NQQUNFX0ZPTERFUiBzb3VyY2UgdGFyZ2V0Jyk7XG5cdFx0fSk7XG5cdH0pO1xufSk7XG4iXSwKICAibWFwcGluZ3MiOiAi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
