import assert from "assert";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../base/test/common/utils.js";
import { NullLogService } from "../../../log/common/log.js";
import { CommandAutoApprover } from "../../node/commandAutoApprover.js";
suite("CommandAutoApprover initialization", () => {
  const disposables = ensureNoDisposablesAreLeakedInTestSuite();
  test("initializes concurrent approvers", async () => {
    const approvers = Array.from({ length: 20 }, () => disposables.add(new CommandAutoApprover(new NullLogService())));
    await Promise.all(approvers.map((approver) => approver.initialize()));
    assert.deepStrictEqual(
      approvers.map((approver) => [
        approver.shouldAutoApprove("ls"),
        approver.shouldAutoApprove("Get-ChildItem", { language: "powershell" })
      ]),
      Array.from({ length: approvers.length }, () => ["approved", "approved"])
    );
  });
});
suite("CommandAutoApprover", () => {
  const disposables = ensureNoDisposablesAreLeakedInTestSuite();
  let approver;
  setup(async () => {
    approver = disposables.add(new CommandAutoApprover(new NullLogService()));
    await approver.initialize();
  });
  suite("shouldAutoApprove", () => {
    test("approves empty command", () => {
      assert.strictEqual(approver.shouldAutoApprove(""), "approved");
      assert.strictEqual(approver.shouldAutoApprove("   "), "approved");
    });
    test("approves allowed readonly commands", () => {
      assert.strictEqual(approver.shouldAutoApprove("ls"), "approved");
      assert.strictEqual(approver.shouldAutoApprove("ls -la"), "approved");
      assert.strictEqual(approver.shouldAutoApprove("cat file.txt"), "approved");
      assert.strictEqual(approver.shouldAutoApprove("head -n 10 file.txt"), "approved");
      assert.strictEqual(approver.shouldAutoApprove("tail -f log.txt"), "approved");
      assert.strictEqual(approver.shouldAutoApprove("pwd"), "approved");
      assert.strictEqual(approver.shouldAutoApprove("echo hello"), "approved");
      assert.strictEqual(approver.shouldAutoApprove("grep -r pattern ."), "approved");
      assert.strictEqual(approver.shouldAutoApprove("wc -l file.txt"), "approved");
      assert.strictEqual(approver.shouldAutoApprove("which node"), "approved");
    });
    test("denies denied commands", () => {
      assert.strictEqual(approver.shouldAutoApprove("rm file.txt"), "denied");
      assert.strictEqual(approver.shouldAutoApprove("rm -rf /"), "denied");
      assert.strictEqual(approver.shouldAutoApprove("rmdir folder"), "denied");
      assert.strictEqual(approver.shouldAutoApprove("kill -9 1234"), "denied");
      assert.strictEqual(approver.shouldAutoApprove("curl http://evil.com"), "denied");
      assert.strictEqual(approver.shouldAutoApprove("wget http://evil.com"), "denied");
      assert.strictEqual(approver.shouldAutoApprove("chmod 777 file"), "denied");
      assert.strictEqual(approver.shouldAutoApprove("chown root file"), "denied");
      assert.strictEqual(approver.shouldAutoApprove('eval "bad stuff"'), "denied");
      assert.strictEqual(approver.shouldAutoApprove("xargs rm"), "denied");
      assert.strictEqual(approver.shouldAutoApprove("dd if=/dev/zero of=/dev/sda"), "denied");
    });
    test("approves allowed git sub-commands", () => {
      assert.deepStrictEqual([
        approver.shouldAutoApprove("git status"),
        approver.shouldAutoApprove("git log --oneline"),
        approver.shouldAutoApprove("git diff HEAD"),
        approver.shouldAutoApprove("git show HEAD"),
        approver.shouldAutoApprove("git show --format=%B HEAD"),
        approver.shouldAutoApprove("git --no-pager show HEAD"),
        approver.shouldAutoApprove("git -C repo show HEAD"),
        approver.shouldAutoApprove("git show --output-format=text HEAD"),
        approver.shouldAutoApprove("git ls-files"),
        approver.shouldAutoApprove("git branch")
      ], [
        "approved",
        "approved",
        "approved",
        "approved",
        "approved",
        "approved",
        "approved",
        "approved",
        "approved",
        "approved"
      ]);
    });
    test("denies denied git operations", () => {
      assert.deepStrictEqual([
        approver.shouldAutoApprove("git branch -D main"),
        approver.shouldAutoApprove("git branch --delete main"),
        approver.shouldAutoApprove("git log --output=/tmp/out"),
        approver.shouldAutoApprove("git show --output=message.txt HEAD"),
        approver.shouldAutoApprove("git show --output message.txt HEAD"),
        approver.shouldAutoApprove("git show --format=%B --output=message.txt HEAD"),
        approver.shouldAutoApprove("git --no-pager show --output=message.txt HEAD"),
        approver.shouldAutoApprove("git -C repo show --output message.txt HEAD")
      ], [
        "denied",
        "denied",
        "denied",
        "denied",
        "denied",
        "denied",
        "denied",
        "denied"
      ]);
    });
    test("handles find with blocked args", () => {
      assert.strictEqual(approver.shouldAutoApprove('find . -name "*.ts"'), "approved");
      assert.strictEqual(approver.shouldAutoApprove("find . -delete"), "denied");
      assert.strictEqual(approver.shouldAutoApprove("find . -exec rm {} ;"), "denied");
    });
    test("handles sort with blocked args", () => {
      assert.deepStrictEqual([
        approver.shouldAutoApprove("sort input.txt"),
        approver.shouldAutoApprove("sort --check input.txt"),
        approver.shouldAutoApprove("sort --check=quiet input.txt"),
        approver.shouldAutoApprove('sort "--check" input.txt'),
        approver.shouldAutoApprove("sort --buffer-size=1K input.txt"),
        approver.shouldAutoApprove("sort -o output.txt input.txt"),
        approver.shouldAutoApprove("sort -S 1G input.txt"),
        approver.shouldAutoApprove("sort --compress-program=/bin/sh input.txt"),
        approver.shouldAutoApprove("sort --compress-program /bin/sh input.txt"),
        approver.shouldAutoApprove("sort --compress-prog=/bin/sh input.txt"),
        approver.shouldAutoApprove("sort --compress-p=/bin/sh input.txt"),
        approver.shouldAutoApprove("sort --com=/bin/sh input.txt"),
        approver.shouldAutoApprove("sort --co=/bin/sh input.txt"),
        approver.shouldAutoApprove('sort "--compress-program=/bin/sh" input.txt'),
        approver.shouldAutoApprove("sort '--compress-prog=/bin/sh' input.txt"),
        approver.shouldAutoApprove("sort \\-\\-compress-program=/bin/sh input.txt"),
        approver.shouldAutoApprove("sort --compress-program\\=/bin/sh input.txt"),
        approver.shouldAutoApprove('sort --"compress-program=/bin/sh" input.txt'),
        approver.shouldAutoApprove("sort $'--compress-program=/bin/sh' input.txt")
      ], [
        "approved",
        "approved",
        "approved",
        "approved",
        "approved",
        "denied",
        "denied",
        "denied",
        "denied",
        "denied",
        "denied",
        "denied",
        "denied",
        "denied",
        "denied",
        "denied",
        "denied",
        "denied",
        "denied"
      ]);
    });
    test("handles sed with blocked args", () => {
      assert.deepStrictEqual([
        approver.shouldAutoApprove('sed "s/foo/bar/g" file.txt'),
        approver.shouldAutoApprove('sed -e "s/foo/bar/"'),
        approver.shouldAutoApprove('sed --expression "s/foo/bar/"'),
        approver.shouldAutoApprove('sed "s/foo/bar/e"'),
        approver.shouldAutoApprove('sed "s/foo/bar/w"'),
        approver.shouldAutoApprove('sed "1e id > /tmp/SECURITY_TEST_pwned"'),
        approver.shouldAutoApprove('sed "1w /tmp/SECURITY_TEST_pwned_file" input.txt'),
        approver.shouldAutoApprove('sed "1r /etc/passwd" input.txt'),
        approver.shouldAutoApprove('sed "1W /tmp/x" input.txt'),
        approver.shouldAutoApprove('sed "e id"'),
        approver.shouldAutoApprove('sed "s/a/b/;e id"'),
        approver.shouldAutoApprove('sed "/pat/e id"'),
        approver.shouldAutoApprove('sed -n "1e id" file.txt'),
        approver.shouldAutoApprove("sed 1e id"),
        approver.shouldAutoApprove('sed "s/a/b/; e id"'),
        approver.shouldAutoApprove(`sed "s/a/'/;e id"`),
        approver.shouldAutoApprove("sed /pat/e input.txt"),
        approver.shouldAutoApprove('sed "1 e id"'),
        approver.shouldAutoApprove('sed "1!e id"'),
        approver.shouldAutoApprove('sed "1, 3 w /tmp/x" input.txt'),
        approver.shouldAutoApprove('sed -l 80 "e id" input.txt'),
        approver.shouldAutoApprove('sed --line-length 80 "1w /tmp/x" input.txt'),
        approver.shouldAutoApprove('sed --line-length=80 "1r /etc/passwd" input.txt'),
        approver.shouldAutoApprove('sed "s/a/\\"/;e id" input.txt'),
        approver.shouldAutoApprove('sed "/x/p;//e id" input.txt'),
        approver.shouldAutoApprove("sed e"),
        approver.shouldAutoApprove('sed -i "s/foo/bar/" file.txt'),
        approver.shouldAutoApprove('sed -I "s/foo/bar/" file.txt'),
        approver.shouldAutoApprove('sed -ni "s/foo/bar/" file.txt'),
        approver.shouldAutoApprove('sed -i.bak "s/foo/bar/" file.txt'),
        approver.shouldAutoApprove(`sed -i '' "s/foo/bar/" file.txt`),
        approver.shouldAutoApprove('sed --in-place "s/foo/bar/" file.txt'),
        approver.shouldAutoApprove('sed --in-place=.bak "s/foo/bar/" file.txt')
      ], [
        "approved",
        "denied",
        "denied",
        "denied",
        "denied",
        "denied",
        "denied",
        "denied",
        "denied",
        "denied",
        "denied",
        "denied",
        "denied",
        "denied",
        "denied",
        "denied",
        "denied",
        "denied",
        "denied",
        "denied",
        "denied",
        "denied",
        "denied",
        "denied",
        "denied",
        "denied",
        "denied",
        "denied",
        "denied",
        "denied",
        "denied",
        "denied",
        "denied"
      ]);
    });
    test("sed in-place commands cannot be allowed by a full-command rule", () => {
      const commandLine = 'sed -i "s/foo/bar/" file.txt';
      assert.deepStrictEqual(approver.evaluate(commandLine, {
        autoApproveRules: {
          sed: true,
          '/^sed -i "s\\/foo\\/bar\\/" file\\.txt$/': { approve: true, matchCommandLine: true }
        }
      }), { result: "denied", autoApproveRuleResolvable: false });
    });
    test("approves allowed npm commands", () => {
      assert.strictEqual(approver.shouldAutoApprove("npm ci"), "approved");
      assert.strictEqual(approver.shouldAutoApprove("npm ls"), "approved");
      assert.strictEqual(approver.shouldAutoApprove("npm audit"), "approved");
    });
    test("returns noMatch for unknown commands", () => {
      assert.strictEqual(approver.shouldAutoApprove("my-custom-script"), "noMatch");
      assert.strictEqual(approver.shouldAutoApprove("python script.py"), "noMatch");
      assert.strictEqual(approver.shouldAutoApprove("node index.js"), "noMatch");
    });
    test("respects forwarded terminal auto-approve rule config", () => {
      assert.deepStrictEqual([
        approver.shouldAutoApprove("echo hello", { autoApproveRules: { echo: false } }),
        approver.shouldAutoApprove("python script.py", { autoApproveRules: { python: true } }),
        approver.shouldAutoApprove("echo hello", { autoApproveRules: { echo: null } }),
        approver.shouldAutoApprove("npm run build", { autoApproveRules: { "/^npm run build$/": { approve: true, matchCommandLine: true } } }),
        approver.shouldAutoApprove("echo hello", { autoApproveRules: { echo: true, "/^echo hello$/": { approve: false, matchCommandLine: true } } })
      ], [
        "denied",
        "approved",
        "noMatch",
        "approved",
        "denied"
      ]);
    });
    test("uses forwarded terminal auto-approve rules instead of fallback defaults", () => {
      assert.deepStrictEqual([
        approver.shouldAutoApprove("echo hello", { autoApproveRules: {} }),
        approver.shouldAutoApprove("rm file.txt", { autoApproveRules: {} })
      ], [
        "noMatch",
        "noMatch"
      ]);
    });
    test("denies transient environment variable assignments", () => {
      assert.strictEqual(approver.shouldAutoApprove("FOO=bar some-command"), "denied");
      assert.strictEqual(approver.shouldAutoApprove("PATH=/evil:$PATH ls"), "denied");
    });
    test("fails closed on Bash shell state mutations", () => {
      assert.deepStrictEqual([
        approver.shouldAutoApprove("FOO=bar && git status"),
        approver.shouldAutoApprove("export FOO=bar && git status"),
        approver.shouldAutoApprove("declare -x FOO=bar && git status"),
        approver.shouldAutoApprove("typeset FOO=bar && git status"),
        approver.shouldAutoApprove("readonly FOO=bar && git status"),
        approver.shouldAutoApprove("local FOO=bar && git status"),
        approver.shouldAutoApprove("FOO=bar git status")
      ], ["noMatch", "noMatch", "noMatch", "noMatch", "noMatch", "noMatch", "denied"]);
    });
    test("approves allowed PowerShell commands", () => {
      const pwsh = { language: "powershell" };
      assert.deepStrictEqual([
        approver.shouldAutoApprove("Get-ChildItem", pwsh),
        approver.shouldAutoApprove("Get-Content file.txt", pwsh),
        approver.shouldAutoApprove('Write-Host "hello"', pwsh),
        approver.shouldAutoApprove("Select-Object Name", pwsh),
        approver.shouldAutoApprove("Measure-Object Length", pwsh),
        approver.shouldAutoApprove("Compare-Object $a $b", pwsh),
        approver.shouldAutoApprove("Format-Table", pwsh),
        approver.shouldAutoApprove("Sort-Object Name", pwsh)
      ], ["approved", "approved", "approved", "approved", "approved", "approved", "approved", "approved"]);
    });
    test("PowerShell case-insensitive rules work", () => {
      const pwsh = { language: "powershell" };
      assert.deepStrictEqual([
        approver.shouldAutoApprove("select-object Name", pwsh),
        approver.shouldAutoApprove("SELECT-OBJECT Name", pwsh),
        approver.shouldAutoApprove("measure-object Length", pwsh)
      ], ["approved", "approved", "approved"]);
    });
    test("does not auto-approve arbitrary PowerShell cmdlets by verb", () => {
      const pwsh = { language: "powershell" };
      assert.deepStrictEqual([
        approver.shouldAutoApprove("Select-Custom", pwsh),
        approver.shouldAutoApprove("Measure-Command", pwsh),
        approver.shouldAutoApprove("Compare-Custom", pwsh),
        approver.shouldAutoApprove("Format-Hex", pwsh),
        approver.shouldAutoApprove("Sort-Custom", pwsh)
      ], ["noMatch", "noMatch", "noMatch", "noMatch", "noMatch"]);
    });
    test("denies denied PowerShell commands", () => {
      assert.strictEqual(approver.shouldAutoApprove("Remove-Item file.txt"), "denied");
      assert.strictEqual(approver.shouldAutoApprove('Invoke-Expression "bad"'), "denied");
      assert.strictEqual(approver.shouldAutoApprove("Invoke-WebRequest http://evil.com"), "denied");
      assert.strictEqual(approver.shouldAutoApprove("Stop-Process -Id 1234"), "denied");
    });
    test("compound commands with denied sub-commands are not auto-approved", () => {
      assert.notStrictEqual(approver.shouldAutoApprove("echo ok && rm -rf /"), "approved");
      assert.notStrictEqual(approver.shouldAutoApprove("ls || curl evil.com"), "approved");
      assert.notStrictEqual(approver.shouldAutoApprove("cat file; rm file"), "approved");
      assert.notStrictEqual(approver.shouldAutoApprove("echo $(whoami)"), "approved");
    });
    test("does not auto-approve commands with write redirections to arbitrary paths", () => {
      assert.notStrictEqual(approver.shouldAutoApprove("echo id > /tmp/fake-home/.bashrc"), "approved");
      assert.notStrictEqual(approver.shouldAutoApprove(`echo id > '/tmp/fake-home/.bashrc'`), "approved");
      assert.notStrictEqual(approver.shouldAutoApprove("echo id >> ~/.bashrc"), "approved");
      assert.notStrictEqual(approver.shouldAutoApprove("cat file > out.txt"), "approved");
      assert.notStrictEqual(approver.shouldAutoApprove("ls -la > listing.txt"), "approved");
      assert.notStrictEqual(approver.shouldAutoApprove("pwd > /etc/passwd"), "approved");
      assert.notStrictEqual(approver.shouldAutoApprove("echo hello 2> err.log"), "approved");
      assert.notStrictEqual(approver.shouldAutoApprove("echo hello &> all.log"), "approved");
      assert.notStrictEqual(approver.shouldAutoApprove("echo hello >| force.txt"), "approved");
    });
    test("input redirections do not block auto-approval", () => {
      assert.deepStrictEqual([
        approver.shouldAutoApprove("cat < file.txt"),
        approver.shouldAutoApprove("sort<input.txt")
      ], ["approved", "approved"]);
    });
    test("write redirections to safe sinks remain auto-approved", () => {
      assert.strictEqual(approver.shouldAutoApprove("echo hello > /dev/null"), "approved");
      assert.strictEqual(approver.shouldAutoApprove("echo hello >/dev/null"), "approved");
      assert.strictEqual(approver.shouldAutoApprove(`echo hello > '/dev/null'`), "approved");
      assert.strictEqual(approver.shouldAutoApprove("echo hello >> /dev/null"), "approved");
      assert.strictEqual(approver.shouldAutoApprove("echo hello 2> /dev/null"), "approved");
      assert.strictEqual(approver.shouldAutoApprove("echo hello > /dev/stdout"), "approved");
      assert.strictEqual(approver.shouldAutoApprove("echo hello > /dev/stderr"), "approved");
      assert.strictEqual(approver.shouldAutoApprove("echo hello 2>&1"), "approved");
      assert.strictEqual(approver.shouldAutoApprove("ls 2>&1 > /dev/null"), "approved");
    });
    test("mixed safe and unsafe redirections still require confirmation", () => {
      assert.notStrictEqual(approver.shouldAutoApprove("echo hello 2> /dev/null > /tmp/out"), "approved");
      assert.notStrictEqual(approver.shouldAutoApprove("echo hello > out.txt 2> /dev/null"), "approved");
    });
    test("does not auto-approve <> read-write redirects or process substitution targets", () => {
      assert.notStrictEqual(approver.shouldAutoApprove("echo data 1<>/etc/passwd"), "approved");
      assert.notStrictEqual(approver.shouldAutoApprove("echo data <>/tmp/file"), "approved");
      assert.notStrictEqual(approver.shouldAutoApprove("cat < <(tee ~/.bashrc <<< id)"), "approved");
      assert.notStrictEqual(approver.shouldAutoApprove("ls > >(tee ~/.bashrc)"), "approved");
    });
    test("respects the isWriteDestApproved predicate for write redirections", () => {
      const seen = [];
      const opts = {
        isWriteDestApproved: (d) => {
          seen.push(d);
          return d === "out.txt" || d === "/workspace/log.txt";
        }
      };
      assert.strictEqual(approver.shouldAutoApprove("echo hi > out.txt", opts), "approved");
      assert.strictEqual(approver.shouldAutoApprove("echo hi > /workspace/log.txt", opts), "approved");
      assert.strictEqual(approver.shouldAutoApprove(`echo hi > 'out.txt'`, opts), "approved");
      assert.notStrictEqual(approver.shouldAutoApprove("echo hi > /tmp/elsewhere", opts), "approved");
      assert.notStrictEqual(approver.shouldAutoApprove("echo hi > out.txt 2> /tmp/err", opts), "approved");
      seen.length = 0;
      assert.strictEqual(approver.shouldAutoApprove("echo hi > /dev/null 2>&1", opts), "approved");
      assert.deepStrictEqual(seen, []);
    });
  });
  suite("evaluate", () => {
    test("reports whether a persistent rule could resolve the outcome", () => {
      const cases = [
        // Approved and denied outcomes leave nothing for a rule to resolve.
        ["ls", { result: "approved", autoApproveRuleResolvable: false }],
        ["rm file.txt", { result: "denied", autoApproveRuleResolvable: false }],
        // Unknown command blocked only by a missing allow rule.
        ["my-custom-script", { result: "noMatch", autoApproveRuleResolvable: true }],
        // Transient env-var assignments are denied outright.
        ["FOO=bar my-custom-script", { result: "denied", autoApproveRuleResolvable: false }],
        // Unapproved write redirects block regardless of rules, whether
        // the command itself is approved or unmatched.
        ["echo hi > /etc/passwd", { result: "noMatch", autoApproveRuleResolvable: false }],
        ["my-custom-script > /etc/passwd", { result: "noMatch", autoApproveRuleResolvable: false }],
        // Safe sinks do not block.
        ["echo hi > /dev/null", { result: "approved", autoApproveRuleResolvable: false }]
      ];
      assert.deepStrictEqual(cases.map(([commandLine]) => approver.evaluate(commandLine)), cases.map(([, expected]) => expected));
    });
    test("is not rule-resolvable while the parser is unavailable", () => {
      const uninitialized = disposables.add(new CommandAutoApprover(new NullLogService()));
      assert.deepStrictEqual(uninitialized.evaluate("ls"), { result: "noMatch", autoApproveRuleResolvable: false });
    });
  });
  suite("PowerShell grammar", () => {
    const pwsh = { language: "powershell" };
    test("parses PowerShell-specific syntax that the bash grammar mangles", () => {
      assert.deepStrictEqual([
        approver.shouldAutoApprove("Get-ChildItem -Recurse", pwsh),
        approver.shouldAutoApprove("Get-ChildItem | Select-Object Name", pwsh),
        // Backtick line continuations are valid PowerShell and parse as a single command.
        approver.shouldAutoApprove("Get-ChildItem `\n  -Path .", pwsh),
        // Expression-style invocations capture the inner command without the parentheses.
        approver.shouldAutoApprove("(Get-Content README.md).Length", pwsh),
        // Subexpressions are traversed so their nested commands are checked.
        approver.shouldAutoApprove("Write-Host $(Get-Date)", pwsh),
        approver.shouldAutoApprove("Write-Host $(Remove-Item x)", pwsh)
      ], ["approved", "approved", "approved", "approved", "approved", "denied"]);
    });
    test("matches rules case-insensitively like PowerShell itself", () => {
      assert.deepStrictEqual([
        approver.shouldAutoApprove("get-childitem", pwsh),
        approver.shouldAutoApprove('IEX "bad"', pwsh),
        // bash rule matching stays case-sensitive.
        approver.shouldAutoApprove("get-childitem")
      ], ["approved", "denied", "noMatch"]);
    });
    test("denies commands nested inside script blocks", () => {
      assert.deepStrictEqual([
        approver.shouldAutoApprove("Get-ChildItem | Where-Object { Remove-Item $_ }", pwsh),
        approver.shouldAutoApprove("Get-ChildItem | ForEach-Object { Invoke-Expression $_ }", pwsh)
      ], ["denied", "denied"]);
    });
    test("does not auto-approve denied commands nested in Measure-Command script blocks", () => {
      const rules = {
        ...pwsh,
        autoApproveRules: {
          "Measure-Command": true,
          "Where-Object": true,
          "Set-Content": false,
          "Start-Process": false,
          "Invoke-Expression": false
        }
      };
      assert.deepStrictEqual([
        approver.shouldAutoApprove("Measure-Command { Set-Content -Path out.txt -Value pwned }", rules),
        approver.shouldAutoApprove('Measure-Command { Invoke-Expression "Write-Output hi" }', rules),
        approver.shouldAutoApprove("Get-ChildItem | Where-Object { Start-Process notepad }", rules),
        // Visible separators already rejected nested denied commands.
        approver.shouldAutoApprove("Write-Host hi; Set-Content -Path out.txt -Value pwned", rules),
        // The wrong dialect demonstrates the opaque-block bypass.
        approver.shouldAutoApprove("Measure-Command { Set-Content -Path out.txt -Value pwned }", { language: "bash", autoApproveRules: rules.autoApproveRules })
      ], ["denied", "denied", "denied", "denied", "approved"]);
    });
    test("treats unquoted $null redirects as safe sinks but blocks file writes", () => {
      assert.deepStrictEqual([
        approver.shouldAutoApprove("Get-Content file.txt 2>$null", pwsh),
        approver.shouldAutoApprove("Get-Content file.txt 2> $null", pwsh),
        approver.shouldAutoApprove("Write-Host hi >$null", pwsh),
        approver.shouldAutoApprove("Write-Host hi 2>&1", pwsh),
        approver.shouldAutoApprove("Write-Host hi > /dev/null", pwsh),
        approver.shouldAutoApprove("Write-Host hi >/dev/null", pwsh),
        approver.shouldAutoApprove(`Write-Host hi > '$null'`, pwsh),
        approver.shouldAutoApprove("Write-Host hi > out.txt", pwsh),
        approver.shouldAutoApprove("Write-Host hi >out.txt", pwsh)
      ], ["approved", "approved", "approved", "approved", "noMatch", "noMatch", "noMatch", "noMatch", "noMatch"]);
    });
    test("distinguishes embedded greater-than text from a redirect operator", () => {
      const seen = [];
      const options = {
        ...pwsh,
        isWriteDestApproved: (dest) => {
          seen.push(dest);
          return false;
        }
      };
      assert.deepStrictEqual([
        approver.shouldAutoApprove("Write-Host hi>../../outside.txt", options),
        approver.shouldAutoApprove("Write-Host hi >../../outside.txt", options)
      ], ["approved", "noMatch"]);
      assert.deepStrictEqual(seen, ["../../outside.txt"]);
    });
    test("masks --flag=value arguments before parsing", () => {
      assert.deepStrictEqual([
        approver.shouldAutoApprove('git log --format="%h|%s" -5', pwsh),
        approver.shouldAutoApprove('git log --format="a|b"; Remove-Item x', pwsh)
      ], ["approved", "denied"]);
    });
    test("requires confirmation for incomplete PowerShell parses", () => {
      assert.deepStrictEqual([
        approver.shouldAutoApprove('Write-Output before; "unterminated', pwsh),
        approver.shouldAutoApprove("Write-Output before; `Write-Output after", pwsh),
        approver.shouldAutoApprove("Get-ChildItem -Recurse", pwsh)
      ], ["noMatch", "noMatch", "approved"]);
    });
    test("PowerShell matchCommandLine allow rules stay case-sensitive", () => {
      const autoApproveRules = { "/^Get-ChildItem$/": { approve: true, matchCommandLine: true } };
      assert.deepStrictEqual([
        approver.shouldAutoApprove("Get-ChildItem", { language: "powershell", autoApproveRules }),
        approver.shouldAutoApprove("get-childitem", { language: "powershell", autoApproveRules })
      ], ["approved", "noMatch"]);
    });
    test("PowerShell matchCommandLine deny rules retain configured casing", () => {
      const caseSensitiveRules = {
        "Get-ChildItem": true,
        "/^Get-ChildItem -Force$/": { approve: false, matchCommandLine: true }
      };
      const caseInsensitiveRules = {
        "Get-ChildItem": true,
        "/^Get-ChildItem -Force$/i": { approve: false, matchCommandLine: true }
      };
      assert.deepStrictEqual([
        approver.shouldAutoApprove("Get-ChildItem -Force", { language: "powershell", autoApproveRules: caseSensitiveRules }),
        approver.shouldAutoApprove("get-childitem -Force", { language: "powershell", autoApproveRules: caseSensitiveRules }),
        approver.shouldAutoApprove("get-childitem -Force", { language: "powershell", autoApproveRules: caseInsensitiveRules }),
        approver.shouldAutoApprove("get-childitem -Force", { language: "bash", autoApproveRules: caseSensitiveRules })
      ], ["denied", "approved", "denied", "noMatch"]);
    });
    test("reports rule resolvability", () => {
      const cases = [
        ["My-CustomCmdlet", { result: "noMatch", autoApproveRuleResolvable: true }],
        // Unapproved write redirects block regardless of rules.
        ["Write-Host hi > out.txt", { result: "noMatch", autoApproveRuleResolvable: false }],
        // Commands the grammar cannot parse are never rule-resolvable.
        ["if ($x -eq", { result: "noMatch", autoApproveRuleResolvable: false }]
      ];
      assert.deepStrictEqual(cases.map(([commandLine]) => approver.evaluate(commandLine, pwsh)), cases.map(([, expected]) => expected));
    });
    test("fails closed on PowerShell assignments and invocations", () => {
      assert.deepStrictEqual([
        approver.shouldAutoApprove('$env:GIT_SSH_COMMAND="evil"; git status', pwsh),
        approver.shouldAutoApprove('Write-Output ($env:FOO="evil"); Get-ChildItem', pwsh),
        approver.shouldAutoApprove('Get-ChildItem | Where-Object { $env:FOO="evil"; $true }', pwsh),
        approver.shouldAutoApprove('Get-ChildItem; [System.IO.File]::Delete("x")', pwsh),
        approver.shouldAutoApprove("Get-ChildItem | Where-Object { [System.IO.File]::Delete($_.FullName) }", pwsh),
        approver.shouldAutoApprove("Get-ChildItem; $obj.Delete()", pwsh),
        approver.shouldAutoApprove("[Math]::Max(1, 2) | Out-String", pwsh),
        approver.shouldAutoApprove(`Out-String -InputObject ([scriptblock]::Create('Write-Output ok').Invoke())`, pwsh),
        // Deliberate over-block: an invocation in an argument is usually
        // harmless, but the rules cannot tell `[math]::Round` from
        // `[System.IO.File]::Delete`, so both require confirmation.
        approver.shouldAutoApprove("Write-Output ([math]::Round(1.5))", pwsh),
        // Property access executes no method, so it stays approved.
        approver.shouldAutoApprove("(Get-Content README.md).Length", pwsh)
      ], ["noMatch", "noMatch", "noMatch", "noMatch", "noMatch", "noMatch", "noMatch", "noMatch", "noMatch", "approved"]);
    });
    test("exact allow rules require a safely analyzable command line", () => {
      const parseErrorAllow = { "/^if \\(\\$x -eq$/": { approve: true, matchCommandLine: true } };
      const parseErrorDeny = { "/^if \\(\\$x -eq$/": { approve: false, matchCommandLine: true } };
      const invocationAllow = { "/^Write-Output \\(\\[math\\]::Round\\(1\\.5\\)\\)$/": { approve: true, matchCommandLine: true } };
      const redirectAllow = {
        Write: true,
        "/^Write-Host hi >out\\.txt$/": { approve: true, matchCommandLine: true }
      };
      const deniedSubCommand = {
        Get: true,
        Remove: false,
        "/^Get-ChildItem; Remove-Item x$/": { approve: true, matchCommandLine: true }
      };
      assert.deepStrictEqual([
        approver.shouldAutoApprove("if ($x -eq", { language: "powershell", autoApproveRules: parseErrorAllow }),
        approver.shouldAutoApprove("if ($x -eq", { language: "powershell", autoApproveRules: parseErrorDeny }),
        approver.shouldAutoApprove("Write-Output ([math]::Round(1.5))", { language: "powershell", autoApproveRules: invocationAllow }),
        approver.shouldAutoApprove("Write-Host hi >out.txt", { language: "powershell", autoApproveRules: redirectAllow }),
        approver.shouldAutoApprove("Get-ChildItem; Remove-Item x", { language: "powershell", autoApproveRules: deniedSubCommand })
      ], ["noMatch", "denied", "noMatch", "noMatch", "denied"]);
    });
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxwbGF0Zm9ybVxcYWdlbnRIb3N0XFx0ZXN0XFxub2RlXFxjb21tYW5kQXV0b0FwcHJvdmVyLnRlc3QudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgYXNzZXJ0IGZyb20gJ2Fzc2VydCc7XG5pbXBvcnQgeyBlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL3Rlc3QvY29tbW9uL3V0aWxzLmpzJztcbmltcG9ydCB7IE51bGxMb2dTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vbG9nL2NvbW1vbi9sb2cuanMnO1xuaW1wb3J0IHsgQ29tbWFuZEF1dG9BcHByb3ZlciwgdHlwZSBJQ29tbWFuZEFwcHJvdmFsRXZhbHVhdGlvbiB9IGZyb20gJy4uLy4uL25vZGUvY29tbWFuZEF1dG9BcHByb3Zlci5qcyc7XG5cbnN1aXRlKCdDb21tYW5kQXV0b0FwcHJvdmVyIGluaXRpYWxpemF0aW9uJywgKCkgPT4ge1xuXG5cdGNvbnN0IGRpc3Bvc2FibGVzID0gZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlKCk7XG5cblx0dGVzdCgnaW5pdGlhbGl6ZXMgY29uY3VycmVudCBhcHByb3ZlcnMnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgYXBwcm92ZXJzID0gQXJyYXkuZnJvbSh7IGxlbmd0aDogMjAgfSwgKCkgPT4gZGlzcG9zYWJsZXMuYWRkKG5ldyBDb21tYW5kQXV0b0FwcHJvdmVyKG5ldyBOdWxsTG9nU2VydmljZSgpKSkpO1xuXG5cdFx0YXdhaXQgUHJvbWlzZS5hbGwoYXBwcm92ZXJzLm1hcChhcHByb3ZlciA9PiBhcHByb3Zlci5pbml0aWFsaXplKCkpKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoXG5cdFx0XHRhcHByb3ZlcnMubWFwKGFwcHJvdmVyID0+IFtcblx0XHRcdFx0YXBwcm92ZXIuc2hvdWxkQXV0b0FwcHJvdmUoJ2xzJyksXG5cdFx0XHRcdGFwcHJvdmVyLnNob3VsZEF1dG9BcHByb3ZlKCdHZXQtQ2hpbGRJdGVtJywgeyBsYW5ndWFnZTogJ3Bvd2Vyc2hlbGwnIH0pLFxuXHRcdFx0XSksXG5cdFx0XHRBcnJheS5mcm9tKHsgbGVuZ3RoOiBhcHByb3ZlcnMubGVuZ3RoIH0sICgpID0+IFsnYXBwcm92ZWQnLCAnYXBwcm92ZWQnXSksXG5cdFx0KTtcblx0fSk7XG59KTtcblxuc3VpdGUoJ0NvbW1hbmRBdXRvQXBwcm92ZXInLCAoKSA9PiB7XG5cblx0Y29uc3QgZGlzcG9zYWJsZXMgPSBlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUoKTtcblxuXHRsZXQgYXBwcm92ZXI6IENvbW1hbmRBdXRvQXBwcm92ZXI7XG5cblx0c2V0dXAoYXN5bmMgKCkgPT4ge1xuXHRcdGFwcHJvdmVyID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBDb21tYW5kQXV0b0FwcHJvdmVyKG5ldyBOdWxsTG9nU2VydmljZSgpKSk7XG5cdFx0YXdhaXQgYXBwcm92ZXIuaW5pdGlhbGl6ZSgpO1xuXHR9KTtcblxuXHRzdWl0ZSgnc2hvdWxkQXV0b0FwcHJvdmUnLCAoKSA9PiB7XG5cblx0XHR0ZXN0KCdhcHByb3ZlcyBlbXB0eSBjb21tYW5kJywgKCkgPT4ge1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGFwcHJvdmVyLnNob3VsZEF1dG9BcHByb3ZlKCcnKSwgJ2FwcHJvdmVkJyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYXBwcm92ZXIuc2hvdWxkQXV0b0FwcHJvdmUoJyAgICcpLCAnYXBwcm92ZWQnKTtcblx0XHR9KTtcblxuXHRcdC8vIFNhZmUgcmVhZG9ubHkgY29tbWFuZHNcblx0XHR0ZXN0KCdhcHByb3ZlcyBhbGxvd2VkIHJlYWRvbmx5IGNvbW1hbmRzJywgKCkgPT4ge1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGFwcHJvdmVyLnNob3VsZEF1dG9BcHByb3ZlKCdscycpLCAnYXBwcm92ZWQnKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChhcHByb3Zlci5zaG91bGRBdXRvQXBwcm92ZSgnbHMgLWxhJyksICdhcHByb3ZlZCcpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGFwcHJvdmVyLnNob3VsZEF1dG9BcHByb3ZlKCdjYXQgZmlsZS50eHQnKSwgJ2FwcHJvdmVkJyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYXBwcm92ZXIuc2hvdWxkQXV0b0FwcHJvdmUoJ2hlYWQgLW4gMTAgZmlsZS50eHQnKSwgJ2FwcHJvdmVkJyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYXBwcm92ZXIuc2hvdWxkQXV0b0FwcHJvdmUoJ3RhaWwgLWYgbG9nLnR4dCcpLCAnYXBwcm92ZWQnKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChhcHByb3Zlci5zaG91bGRBdXRvQXBwcm92ZSgncHdkJyksICdhcHByb3ZlZCcpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGFwcHJvdmVyLnNob3VsZEF1dG9BcHByb3ZlKCdlY2hvIGhlbGxvJyksICdhcHByb3ZlZCcpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGFwcHJvdmVyLnNob3VsZEF1dG9BcHByb3ZlKCdncmVwIC1yIHBhdHRlcm4gLicpLCAnYXBwcm92ZWQnKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChhcHByb3Zlci5zaG91bGRBdXRvQXBwcm92ZSgnd2MgLWwgZmlsZS50eHQnKSwgJ2FwcHJvdmVkJyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYXBwcm92ZXIuc2hvdWxkQXV0b0FwcHJvdmUoJ3doaWNoIG5vZGUnKSwgJ2FwcHJvdmVkJyk7XG5cdFx0fSk7XG5cblx0XHQvLyBEYW5nZXJvdXMgY29tbWFuZHNcblx0XHR0ZXN0KCdkZW5pZXMgZGVuaWVkIGNvbW1hbmRzJywgKCkgPT4ge1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGFwcHJvdmVyLnNob3VsZEF1dG9BcHByb3ZlKCdybSBmaWxlLnR4dCcpLCAnZGVuaWVkJyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYXBwcm92ZXIuc2hvdWxkQXV0b0FwcHJvdmUoJ3JtIC1yZiAvJyksICdkZW5pZWQnKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChhcHByb3Zlci5zaG91bGRBdXRvQXBwcm92ZSgncm1kaXIgZm9sZGVyJyksICdkZW5pZWQnKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChhcHByb3Zlci5zaG91bGRBdXRvQXBwcm92ZSgna2lsbCAtOSAxMjM0JyksICdkZW5pZWQnKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChhcHByb3Zlci5zaG91bGRBdXRvQXBwcm92ZSgnY3VybCBodHRwOi8vZXZpbC5jb20nKSwgJ2RlbmllZCcpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGFwcHJvdmVyLnNob3VsZEF1dG9BcHByb3ZlKCd3Z2V0IGh0dHA6Ly9ldmlsLmNvbScpLCAnZGVuaWVkJyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYXBwcm92ZXIuc2hvdWxkQXV0b0FwcHJvdmUoJ2NobW9kIDc3NyBmaWxlJyksICdkZW5pZWQnKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChhcHByb3Zlci5zaG91bGRBdXRvQXBwcm92ZSgnY2hvd24gcm9vdCBmaWxlJyksICdkZW5pZWQnKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChhcHByb3Zlci5zaG91bGRBdXRvQXBwcm92ZSgnZXZhbCBcImJhZCBzdHVmZlwiJyksICdkZW5pZWQnKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChhcHByb3Zlci5zaG91bGRBdXRvQXBwcm92ZSgneGFyZ3Mgcm0nKSwgJ2RlbmllZCcpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGFwcHJvdmVyLnNob3VsZEF1dG9BcHByb3ZlKCdkZCBpZj0vZGV2L3plcm8gb2Y9L2Rldi9zZGEnKSwgJ2RlbmllZCcpO1xuXHRcdH0pO1xuXG5cdFx0Ly8gU2FmZSBnaXQgc3ViLWNvbW1hbmRzXG5cdFx0dGVzdCgnYXBwcm92ZXMgYWxsb3dlZCBnaXQgc3ViLWNvbW1hbmRzJywgKCkgPT4ge1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChbXG5cdFx0XHRcdGFwcHJvdmVyLnNob3VsZEF1dG9BcHByb3ZlKCdnaXQgc3RhdHVzJyksXG5cdFx0XHRcdGFwcHJvdmVyLnNob3VsZEF1dG9BcHByb3ZlKCdnaXQgbG9nIC0tb25lbGluZScpLFxuXHRcdFx0XHRhcHByb3Zlci5zaG91bGRBdXRvQXBwcm92ZSgnZ2l0IGRpZmYgSEVBRCcpLFxuXHRcdFx0XHRhcHByb3Zlci5zaG91bGRBdXRvQXBwcm92ZSgnZ2l0IHNob3cgSEVBRCcpLFxuXHRcdFx0XHRhcHByb3Zlci5zaG91bGRBdXRvQXBwcm92ZSgnZ2l0IHNob3cgLS1mb3JtYXQ9JUIgSEVBRCcpLFxuXHRcdFx0XHRhcHByb3Zlci5zaG91bGRBdXRvQXBwcm92ZSgnZ2l0IC0tbm8tcGFnZXIgc2hvdyBIRUFEJyksXG5cdFx0XHRcdGFwcHJvdmVyLnNob3VsZEF1dG9BcHByb3ZlKCdnaXQgLUMgcmVwbyBzaG93IEhFQUQnKSxcblx0XHRcdFx0YXBwcm92ZXIuc2hvdWxkQXV0b0FwcHJvdmUoJ2dpdCBzaG93IC0tb3V0cHV0LWZvcm1hdD10ZXh0IEhFQUQnKSxcblx0XHRcdFx0YXBwcm92ZXIuc2hvdWxkQXV0b0FwcHJvdmUoJ2dpdCBscy1maWxlcycpLFxuXHRcdFx0XHRhcHByb3Zlci5zaG91bGRBdXRvQXBwcm92ZSgnZ2l0IGJyYW5jaCcpLFxuXHRcdFx0XSwgW1xuXHRcdFx0XHQnYXBwcm92ZWQnLFxuXHRcdFx0XHQnYXBwcm92ZWQnLFxuXHRcdFx0XHQnYXBwcm92ZWQnLFxuXHRcdFx0XHQnYXBwcm92ZWQnLFxuXHRcdFx0XHQnYXBwcm92ZWQnLFxuXHRcdFx0XHQnYXBwcm92ZWQnLFxuXHRcdFx0XHQnYXBwcm92ZWQnLFxuXHRcdFx0XHQnYXBwcm92ZWQnLFxuXHRcdFx0XHQnYXBwcm92ZWQnLFxuXHRcdFx0XHQnYXBwcm92ZWQnLFxuXHRcdFx0XSk7XG5cdFx0fSk7XG5cblx0XHQvLyBVbnNhZmUgZ2l0IHN1Yi1jb21tYW5kc1xuXHRcdHRlc3QoJ2RlbmllcyBkZW5pZWQgZ2l0IG9wZXJhdGlvbnMnLCAoKSA9PiB7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKFtcblx0XHRcdFx0YXBwcm92ZXIuc2hvdWxkQXV0b0FwcHJvdmUoJ2dpdCBicmFuY2ggLUQgbWFpbicpLFxuXHRcdFx0XHRhcHByb3Zlci5zaG91bGRBdXRvQXBwcm92ZSgnZ2l0IGJyYW5jaCAtLWRlbGV0ZSBtYWluJyksXG5cdFx0XHRcdGFwcHJvdmVyLnNob3VsZEF1dG9BcHByb3ZlKCdnaXQgbG9nIC0tb3V0cHV0PS90bXAvb3V0JyksXG5cdFx0XHRcdGFwcHJvdmVyLnNob3VsZEF1dG9BcHByb3ZlKCdnaXQgc2hvdyAtLW91dHB1dD1tZXNzYWdlLnR4dCBIRUFEJyksXG5cdFx0XHRcdGFwcHJvdmVyLnNob3VsZEF1dG9BcHByb3ZlKCdnaXQgc2hvdyAtLW91dHB1dCBtZXNzYWdlLnR4dCBIRUFEJyksXG5cdFx0XHRcdGFwcHJvdmVyLnNob3VsZEF1dG9BcHByb3ZlKCdnaXQgc2hvdyAtLWZvcm1hdD0lQiAtLW91dHB1dD1tZXNzYWdlLnR4dCBIRUFEJyksXG5cdFx0XHRcdGFwcHJvdmVyLnNob3VsZEF1dG9BcHByb3ZlKCdnaXQgLS1uby1wYWdlciBzaG93IC0tb3V0cHV0PW1lc3NhZ2UudHh0IEhFQUQnKSxcblx0XHRcdFx0YXBwcm92ZXIuc2hvdWxkQXV0b0FwcHJvdmUoJ2dpdCAtQyByZXBvIHNob3cgLS1vdXRwdXQgbWVzc2FnZS50eHQgSEVBRCcpLFxuXHRcdFx0XSwgW1xuXHRcdFx0XHQnZGVuaWVkJyxcblx0XHRcdFx0J2RlbmllZCcsXG5cdFx0XHRcdCdkZW5pZWQnLFxuXHRcdFx0XHQnZGVuaWVkJyxcblx0XHRcdFx0J2RlbmllZCcsXG5cdFx0XHRcdCdkZW5pZWQnLFxuXHRcdFx0XHQnZGVuaWVkJyxcblx0XHRcdFx0J2RlbmllZCcsXG5cdFx0XHRdKTtcblx0XHR9KTtcblxuXHRcdC8vIFNhZmUgY29tbWFuZHMgd2l0aCBkYW5nZXJvdXMgYXJnIGJsb2NraW5nXG5cdFx0dGVzdCgnaGFuZGxlcyBmaW5kIHdpdGggYmxvY2tlZCBhcmdzJywgKCkgPT4ge1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGFwcHJvdmVyLnNob3VsZEF1dG9BcHByb3ZlKCdmaW5kIC4gLW5hbWUgXCIqLnRzXCInKSwgJ2FwcHJvdmVkJyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYXBwcm92ZXIuc2hvdWxkQXV0b0FwcHJvdmUoJ2ZpbmQgLiAtZGVsZXRlJyksICdkZW5pZWQnKTtcblx0XHRcdC8vIGZpbmQgLWV4ZWMgbWF0Y2hlcyB0aGUgZGVueSBydWxlIGZvciBmaW5kJ3MgZGFuZ2Vyb3VzIGFyZ3MuXG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYXBwcm92ZXIuc2hvdWxkQXV0b0FwcHJvdmUoJ2ZpbmQgLiAtZXhlYyBybSB7fSA7JyksICdkZW5pZWQnKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2hhbmRsZXMgc29ydCB3aXRoIGJsb2NrZWQgYXJncycsICgpID0+IHtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoW1xuXHRcdFx0XHRhcHByb3Zlci5zaG91bGRBdXRvQXBwcm92ZSgnc29ydCBpbnB1dC50eHQnKSxcblx0XHRcdFx0YXBwcm92ZXIuc2hvdWxkQXV0b0FwcHJvdmUoJ3NvcnQgLS1jaGVjayBpbnB1dC50eHQnKSxcblx0XHRcdFx0YXBwcm92ZXIuc2hvdWxkQXV0b0FwcHJvdmUoJ3NvcnQgLS1jaGVjaz1xdWlldCBpbnB1dC50eHQnKSxcblx0XHRcdFx0YXBwcm92ZXIuc2hvdWxkQXV0b0FwcHJvdmUoJ3NvcnQgXCItLWNoZWNrXCIgaW5wdXQudHh0JyksXG5cdFx0XHRcdGFwcHJvdmVyLnNob3VsZEF1dG9BcHByb3ZlKCdzb3J0IC0tYnVmZmVyLXNpemU9MUsgaW5wdXQudHh0JyksXG5cdFx0XHRcdGFwcHJvdmVyLnNob3VsZEF1dG9BcHByb3ZlKCdzb3J0IC1vIG91dHB1dC50eHQgaW5wdXQudHh0JyksXG5cdFx0XHRcdGFwcHJvdmVyLnNob3VsZEF1dG9BcHByb3ZlKCdzb3J0IC1TIDFHIGlucHV0LnR4dCcpLFxuXHRcdFx0XHRhcHByb3Zlci5zaG91bGRBdXRvQXBwcm92ZSgnc29ydCAtLWNvbXByZXNzLXByb2dyYW09L2Jpbi9zaCBpbnB1dC50eHQnKSxcblx0XHRcdFx0YXBwcm92ZXIuc2hvdWxkQXV0b0FwcHJvdmUoJ3NvcnQgLS1jb21wcmVzcy1wcm9ncmFtIC9iaW4vc2ggaW5wdXQudHh0JyksXG5cdFx0XHRcdGFwcHJvdmVyLnNob3VsZEF1dG9BcHByb3ZlKCdzb3J0IC0tY29tcHJlc3MtcHJvZz0vYmluL3NoIGlucHV0LnR4dCcpLFxuXHRcdFx0XHRhcHByb3Zlci5zaG91bGRBdXRvQXBwcm92ZSgnc29ydCAtLWNvbXByZXNzLXA9L2Jpbi9zaCBpbnB1dC50eHQnKSxcblx0XHRcdFx0YXBwcm92ZXIuc2hvdWxkQXV0b0FwcHJvdmUoJ3NvcnQgLS1jb209L2Jpbi9zaCBpbnB1dC50eHQnKSxcblx0XHRcdFx0YXBwcm92ZXIuc2hvdWxkQXV0b0FwcHJvdmUoJ3NvcnQgLS1jbz0vYmluL3NoIGlucHV0LnR4dCcpLFxuXHRcdFx0XHRhcHByb3Zlci5zaG91bGRBdXRvQXBwcm92ZSgnc29ydCBcIi0tY29tcHJlc3MtcHJvZ3JhbT0vYmluL3NoXCIgaW5wdXQudHh0JyksXG5cdFx0XHRcdGFwcHJvdmVyLnNob3VsZEF1dG9BcHByb3ZlKCdzb3J0IFxcJy0tY29tcHJlc3MtcHJvZz0vYmluL3NoXFwnIGlucHV0LnR4dCcpLFxuXHRcdFx0XHRhcHByb3Zlci5zaG91bGRBdXRvQXBwcm92ZSgnc29ydCBcXFxcLVxcXFwtY29tcHJlc3MtcHJvZ3JhbT0vYmluL3NoIGlucHV0LnR4dCcpLFxuXHRcdFx0XHRhcHByb3Zlci5zaG91bGRBdXRvQXBwcm92ZSgnc29ydCAtLWNvbXByZXNzLXByb2dyYW1cXFxcPS9iaW4vc2ggaW5wdXQudHh0JyksXG5cdFx0XHRcdGFwcHJvdmVyLnNob3VsZEF1dG9BcHByb3ZlKCdzb3J0IC0tXCJjb21wcmVzcy1wcm9ncmFtPS9iaW4vc2hcIiBpbnB1dC50eHQnKSxcblx0XHRcdFx0YXBwcm92ZXIuc2hvdWxkQXV0b0FwcHJvdmUoJ3NvcnQgJFxcJy0tY29tcHJlc3MtcHJvZ3JhbT0vYmluL3NoXFwnIGlucHV0LnR4dCcpLFxuXHRcdFx0XSwgW1xuXHRcdFx0XHQnYXBwcm92ZWQnLFxuXHRcdFx0XHQnYXBwcm92ZWQnLFxuXHRcdFx0XHQnYXBwcm92ZWQnLFxuXHRcdFx0XHQnYXBwcm92ZWQnLFxuXHRcdFx0XHQnYXBwcm92ZWQnLFxuXHRcdFx0XHQnZGVuaWVkJyxcblx0XHRcdFx0J2RlbmllZCcsXG5cdFx0XHRcdCdkZW5pZWQnLFxuXHRcdFx0XHQnZGVuaWVkJyxcblx0XHRcdFx0J2RlbmllZCcsXG5cdFx0XHRcdCdkZW5pZWQnLFxuXHRcdFx0XHQnZGVuaWVkJyxcblx0XHRcdFx0J2RlbmllZCcsXG5cdFx0XHRcdCdkZW5pZWQnLFxuXHRcdFx0XHQnZGVuaWVkJyxcblx0XHRcdFx0J2RlbmllZCcsXG5cdFx0XHRcdCdkZW5pZWQnLFxuXHRcdFx0XHQnZGVuaWVkJyxcblx0XHRcdFx0J2RlbmllZCcsXG5cdFx0XHRdKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2hhbmRsZXMgc2VkIHdpdGggYmxvY2tlZCBhcmdzJywgKCkgPT4ge1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChbXG5cdFx0XHRcdGFwcHJvdmVyLnNob3VsZEF1dG9BcHByb3ZlKCdzZWQgXCJzL2Zvby9iYXIvZ1wiIGZpbGUudHh0JyksXG5cdFx0XHRcdGFwcHJvdmVyLnNob3VsZEF1dG9BcHByb3ZlKCdzZWQgLWUgXCJzL2Zvby9iYXIvXCInKSxcblx0XHRcdFx0YXBwcm92ZXIuc2hvdWxkQXV0b0FwcHJvdmUoJ3NlZCAtLWV4cHJlc3Npb24gXCJzL2Zvby9iYXIvXCInKSxcblx0XHRcdFx0YXBwcm92ZXIuc2hvdWxkQXV0b0FwcHJvdmUoJ3NlZCBcInMvZm9vL2Jhci9lXCInKSxcblx0XHRcdFx0YXBwcm92ZXIuc2hvdWxkQXV0b0FwcHJvdmUoJ3NlZCBcInMvZm9vL2Jhci93XCInKSxcblx0XHRcdFx0YXBwcm92ZXIuc2hvdWxkQXV0b0FwcHJvdmUoJ3NlZCBcIjFlIGlkID4gL3RtcC9TRUNVUklUWV9URVNUX3B3bmVkXCInKSxcblx0XHRcdFx0YXBwcm92ZXIuc2hvdWxkQXV0b0FwcHJvdmUoJ3NlZCBcIjF3IC90bXAvU0VDVVJJVFlfVEVTVF9wd25lZF9maWxlXCIgaW5wdXQudHh0JyksXG5cdFx0XHRcdGFwcHJvdmVyLnNob3VsZEF1dG9BcHByb3ZlKCdzZWQgXCIxciAvZXRjL3Bhc3N3ZFwiIGlucHV0LnR4dCcpLFxuXHRcdFx0XHRhcHByb3Zlci5zaG91bGRBdXRvQXBwcm92ZSgnc2VkIFwiMVcgL3RtcC94XCIgaW5wdXQudHh0JyksXG5cdFx0XHRcdGFwcHJvdmVyLnNob3VsZEF1dG9BcHByb3ZlKCdzZWQgXCJlIGlkXCInKSxcblx0XHRcdFx0YXBwcm92ZXIuc2hvdWxkQXV0b0FwcHJvdmUoJ3NlZCBcInMvYS9iLztlIGlkXCInKSxcblx0XHRcdFx0YXBwcm92ZXIuc2hvdWxkQXV0b0FwcHJvdmUoJ3NlZCBcIi9wYXQvZSBpZFwiJyksXG5cdFx0XHRcdGFwcHJvdmVyLnNob3VsZEF1dG9BcHByb3ZlKCdzZWQgLW4gXCIxZSBpZFwiIGZpbGUudHh0JyksXG5cdFx0XHRcdGFwcHJvdmVyLnNob3VsZEF1dG9BcHByb3ZlKCdzZWQgMWUgaWQnKSxcblx0XHRcdFx0YXBwcm92ZXIuc2hvdWxkQXV0b0FwcHJvdmUoJ3NlZCBcInMvYS9iLzsgZSBpZFwiJyksXG5cdFx0XHRcdGFwcHJvdmVyLnNob3VsZEF1dG9BcHByb3ZlKCdzZWQgXCJzL2EvXFwnLztlIGlkXCInKSxcblx0XHRcdFx0YXBwcm92ZXIuc2hvdWxkQXV0b0FwcHJvdmUoJ3NlZCAvcGF0L2UgaW5wdXQudHh0JyksXG5cdFx0XHRcdGFwcHJvdmVyLnNob3VsZEF1dG9BcHByb3ZlKCdzZWQgXCIxIGUgaWRcIicpLFxuXHRcdFx0XHRhcHByb3Zlci5zaG91bGRBdXRvQXBwcm92ZSgnc2VkIFwiMSFlIGlkXCInKSxcblx0XHRcdFx0YXBwcm92ZXIuc2hvdWxkQXV0b0FwcHJvdmUoJ3NlZCBcIjEsIDMgdyAvdG1wL3hcIiBpbnB1dC50eHQnKSxcblx0XHRcdFx0YXBwcm92ZXIuc2hvdWxkQXV0b0FwcHJvdmUoJ3NlZCAtbCA4MCBcImUgaWRcIiBpbnB1dC50eHQnKSxcblx0XHRcdFx0YXBwcm92ZXIuc2hvdWxkQXV0b0FwcHJvdmUoJ3NlZCAtLWxpbmUtbGVuZ3RoIDgwIFwiMXcgL3RtcC94XCIgaW5wdXQudHh0JyksXG5cdFx0XHRcdGFwcHJvdmVyLnNob3VsZEF1dG9BcHByb3ZlKCdzZWQgLS1saW5lLWxlbmd0aD04MCBcIjFyIC9ldGMvcGFzc3dkXCIgaW5wdXQudHh0JyksXG5cdFx0XHRcdGFwcHJvdmVyLnNob3VsZEF1dG9BcHByb3ZlKCdzZWQgXCJzL2EvXFxcXFwiLztlIGlkXCIgaW5wdXQudHh0JyksXG5cdFx0XHRcdGFwcHJvdmVyLnNob3VsZEF1dG9BcHByb3ZlKCdzZWQgXCIveC9wOy8vZSBpZFwiIGlucHV0LnR4dCcpLFxuXHRcdFx0XHRhcHByb3Zlci5zaG91bGRBdXRvQXBwcm92ZSgnc2VkIGUnKSxcblx0XHRcdFx0YXBwcm92ZXIuc2hvdWxkQXV0b0FwcHJvdmUoJ3NlZCAtaSBcInMvZm9vL2Jhci9cIiBmaWxlLnR4dCcpLFxuXHRcdFx0XHRhcHByb3Zlci5zaG91bGRBdXRvQXBwcm92ZSgnc2VkIC1JIFwicy9mb28vYmFyL1wiIGZpbGUudHh0JyksXG5cdFx0XHRcdGFwcHJvdmVyLnNob3VsZEF1dG9BcHByb3ZlKCdzZWQgLW5pIFwicy9mb28vYmFyL1wiIGZpbGUudHh0JyksXG5cdFx0XHRcdGFwcHJvdmVyLnNob3VsZEF1dG9BcHByb3ZlKCdzZWQgLWkuYmFrIFwicy9mb28vYmFyL1wiIGZpbGUudHh0JyksXG5cdFx0XHRcdGFwcHJvdmVyLnNob3VsZEF1dG9BcHByb3ZlKCdzZWQgLWkgXFwnXFwnIFwicy9mb28vYmFyL1wiIGZpbGUudHh0JyksXG5cdFx0XHRcdGFwcHJvdmVyLnNob3VsZEF1dG9BcHByb3ZlKCdzZWQgLS1pbi1wbGFjZSBcInMvZm9vL2Jhci9cIiBmaWxlLnR4dCcpLFxuXHRcdFx0XHRhcHByb3Zlci5zaG91bGRBdXRvQXBwcm92ZSgnc2VkIC0taW4tcGxhY2U9LmJhayBcInMvZm9vL2Jhci9cIiBmaWxlLnR4dCcpLFxuXHRcdFx0XSwgW1xuXHRcdFx0XHQnYXBwcm92ZWQnLFxuXHRcdFx0XHQnZGVuaWVkJyxcblx0XHRcdFx0J2RlbmllZCcsXG5cdFx0XHRcdCdkZW5pZWQnLFxuXHRcdFx0XHQnZGVuaWVkJyxcblx0XHRcdFx0J2RlbmllZCcsXG5cdFx0XHRcdCdkZW5pZWQnLFxuXHRcdFx0XHQnZGVuaWVkJyxcblx0XHRcdFx0J2RlbmllZCcsXG5cdFx0XHRcdCdkZW5pZWQnLFxuXHRcdFx0XHQnZGVuaWVkJyxcblx0XHRcdFx0J2RlbmllZCcsXG5cdFx0XHRcdCdkZW5pZWQnLFxuXHRcdFx0XHQnZGVuaWVkJyxcblx0XHRcdFx0J2RlbmllZCcsXG5cdFx0XHRcdCdkZW5pZWQnLFxuXHRcdFx0XHQnZGVuaWVkJyxcblx0XHRcdFx0J2RlbmllZCcsXG5cdFx0XHRcdCdkZW5pZWQnLFxuXHRcdFx0XHQnZGVuaWVkJyxcblx0XHRcdFx0J2RlbmllZCcsXG5cdFx0XHRcdCdkZW5pZWQnLFxuXHRcdFx0XHQnZGVuaWVkJyxcblx0XHRcdFx0J2RlbmllZCcsXG5cdFx0XHRcdCdkZW5pZWQnLFxuXHRcdFx0XHQnZGVuaWVkJyxcblx0XHRcdFx0J2RlbmllZCcsXG5cdFx0XHRcdCdkZW5pZWQnLFxuXHRcdFx0XHQnZGVuaWVkJyxcblx0XHRcdFx0J2RlbmllZCcsXG5cdFx0XHRcdCdkZW5pZWQnLFxuXHRcdFx0XHQnZGVuaWVkJyxcblx0XHRcdFx0J2RlbmllZCcsXG5cdFx0XHRdKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3NlZCBpbi1wbGFjZSBjb21tYW5kcyBjYW5ub3QgYmUgYWxsb3dlZCBieSBhIGZ1bGwtY29tbWFuZCBydWxlJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgY29tbWFuZExpbmUgPSAnc2VkIC1pIFwicy9mb28vYmFyL1wiIGZpbGUudHh0Jztcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoYXBwcm92ZXIuZXZhbHVhdGUoY29tbWFuZExpbmUsIHtcblx0XHRcdFx0YXV0b0FwcHJvdmVSdWxlczoge1xuXHRcdFx0XHRcdHNlZDogdHJ1ZSxcblx0XHRcdFx0XHQnL15zZWQgLWkgXCJzXFxcXC9mb29cXFxcL2JhclxcXFwvXCIgZmlsZVxcXFwudHh0JC8nOiB7IGFwcHJvdmU6IHRydWUsIG1hdGNoQ29tbWFuZExpbmU6IHRydWUgfSxcblx0XHRcdFx0fSxcblx0XHRcdH0pLCB7IHJlc3VsdDogJ2RlbmllZCcsIGF1dG9BcHByb3ZlUnVsZVJlc29sdmFibGU6IGZhbHNlIH0pO1xuXHRcdH0pO1xuXG5cdFx0Ly8gbnBtL3BhY2thZ2UgbWFuYWdlcnNcblx0XHR0ZXN0KCdhcHByb3ZlcyBhbGxvd2VkIG5wbSBjb21tYW5kcycsICgpID0+IHtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChhcHByb3Zlci5zaG91bGRBdXRvQXBwcm92ZSgnbnBtIGNpJyksICdhcHByb3ZlZCcpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGFwcHJvdmVyLnNob3VsZEF1dG9BcHByb3ZlKCducG0gbHMnKSwgJ2FwcHJvdmVkJyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYXBwcm92ZXIuc2hvdWxkQXV0b0FwcHJvdmUoJ25wbSBhdWRpdCcpLCAnYXBwcm92ZWQnKTtcblx0XHR9KTtcblxuXHRcdC8vIFVua25vd24gY29tbWFuZHMgZ2V0IG5vTWF0Y2hcblx0XHR0ZXN0KCdyZXR1cm5zIG5vTWF0Y2ggZm9yIHVua25vd24gY29tbWFuZHMnLCAoKSA9PiB7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYXBwcm92ZXIuc2hvdWxkQXV0b0FwcHJvdmUoJ215LWN1c3RvbS1zY3JpcHQnKSwgJ25vTWF0Y2gnKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChhcHByb3Zlci5zaG91bGRBdXRvQXBwcm92ZSgncHl0aG9uIHNjcmlwdC5weScpLCAnbm9NYXRjaCcpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGFwcHJvdmVyLnNob3VsZEF1dG9BcHByb3ZlKCdub2RlIGluZGV4LmpzJyksICdub01hdGNoJyk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdyZXNwZWN0cyBmb3J3YXJkZWQgdGVybWluYWwgYXV0by1hcHByb3ZlIHJ1bGUgY29uZmlnJywgKCkgPT4ge1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChbXG5cdFx0XHRcdGFwcHJvdmVyLnNob3VsZEF1dG9BcHByb3ZlKCdlY2hvIGhlbGxvJywgeyBhdXRvQXBwcm92ZVJ1bGVzOiB7IGVjaG86IGZhbHNlIH0gfSksXG5cdFx0XHRcdGFwcHJvdmVyLnNob3VsZEF1dG9BcHByb3ZlKCdweXRob24gc2NyaXB0LnB5JywgeyBhdXRvQXBwcm92ZVJ1bGVzOiB7IHB5dGhvbjogdHJ1ZSB9IH0pLFxuXHRcdFx0XHRhcHByb3Zlci5zaG91bGRBdXRvQXBwcm92ZSgnZWNobyBoZWxsbycsIHsgYXV0b0FwcHJvdmVSdWxlczogeyBlY2hvOiBudWxsIH0gfSksXG5cdFx0XHRcdGFwcHJvdmVyLnNob3VsZEF1dG9BcHByb3ZlKCducG0gcnVuIGJ1aWxkJywgeyBhdXRvQXBwcm92ZVJ1bGVzOiB7ICcvXm5wbSBydW4gYnVpbGQkLyc6IHsgYXBwcm92ZTogdHJ1ZSwgbWF0Y2hDb21tYW5kTGluZTogdHJ1ZSB9IH0gfSksXG5cdFx0XHRcdGFwcHJvdmVyLnNob3VsZEF1dG9BcHByb3ZlKCdlY2hvIGhlbGxvJywgeyBhdXRvQXBwcm92ZVJ1bGVzOiB7IGVjaG86IHRydWUsICcvXmVjaG8gaGVsbG8kLyc6IHsgYXBwcm92ZTogZmFsc2UsIG1hdGNoQ29tbWFuZExpbmU6IHRydWUgfSB9IH0pLFxuXHRcdFx0XSwgW1xuXHRcdFx0XHQnZGVuaWVkJyxcblx0XHRcdFx0J2FwcHJvdmVkJyxcblx0XHRcdFx0J25vTWF0Y2gnLFxuXHRcdFx0XHQnYXBwcm92ZWQnLFxuXHRcdFx0XHQnZGVuaWVkJyxcblx0XHRcdF0pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgndXNlcyBmb3J3YXJkZWQgdGVybWluYWwgYXV0by1hcHByb3ZlIHJ1bGVzIGluc3RlYWQgb2YgZmFsbGJhY2sgZGVmYXVsdHMnLCAoKSA9PiB7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKFtcblx0XHRcdFx0YXBwcm92ZXIuc2hvdWxkQXV0b0FwcHJvdmUoJ2VjaG8gaGVsbG8nLCB7IGF1dG9BcHByb3ZlUnVsZXM6IHt9IH0pLFxuXHRcdFx0XHRhcHByb3Zlci5zaG91bGRBdXRvQXBwcm92ZSgncm0gZmlsZS50eHQnLCB7IGF1dG9BcHByb3ZlUnVsZXM6IHt9IH0pLFxuXHRcdFx0XSwgW1xuXHRcdFx0XHQnbm9NYXRjaCcsXG5cdFx0XHRcdCdub01hdGNoJyxcblx0XHRcdF0pO1xuXHRcdH0pO1xuXG5cdFx0Ly8gVHJhbnNpZW50IGVudiB2YXJzXG5cdFx0dGVzdCgnZGVuaWVzIHRyYW5zaWVudCBlbnZpcm9ubWVudCB2YXJpYWJsZSBhc3NpZ25tZW50cycsICgpID0+IHtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChhcHByb3Zlci5zaG91bGRBdXRvQXBwcm92ZSgnRk9PPWJhciBzb21lLWNvbW1hbmQnKSwgJ2RlbmllZCcpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGFwcHJvdmVyLnNob3VsZEF1dG9BcHByb3ZlKCdQQVRIPS9ldmlsOiRQQVRIIGxzJyksICdkZW5pZWQnKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2ZhaWxzIGNsb3NlZCBvbiBCYXNoIHNoZWxsIHN0YXRlIG11dGF0aW9ucycsICgpID0+IHtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoW1xuXHRcdFx0XHRhcHByb3Zlci5zaG91bGRBdXRvQXBwcm92ZSgnRk9PPWJhciAmJiBnaXQgc3RhdHVzJyksXG5cdFx0XHRcdGFwcHJvdmVyLnNob3VsZEF1dG9BcHByb3ZlKCdleHBvcnQgRk9PPWJhciAmJiBnaXQgc3RhdHVzJyksXG5cdFx0XHRcdGFwcHJvdmVyLnNob3VsZEF1dG9BcHByb3ZlKCdkZWNsYXJlIC14IEZPTz1iYXIgJiYgZ2l0IHN0YXR1cycpLFxuXHRcdFx0XHRhcHByb3Zlci5zaG91bGRBdXRvQXBwcm92ZSgndHlwZXNldCBGT089YmFyICYmIGdpdCBzdGF0dXMnKSxcblx0XHRcdFx0YXBwcm92ZXIuc2hvdWxkQXV0b0FwcHJvdmUoJ3JlYWRvbmx5IEZPTz1iYXIgJiYgZ2l0IHN0YXR1cycpLFxuXHRcdFx0XHRhcHByb3Zlci5zaG91bGRBdXRvQXBwcm92ZSgnbG9jYWwgRk9PPWJhciAmJiBnaXQgc3RhdHVzJyksXG5cdFx0XHRcdGFwcHJvdmVyLnNob3VsZEF1dG9BcHByb3ZlKCdGT089YmFyIGdpdCBzdGF0dXMnKSxcblx0XHRcdF0sIFsnbm9NYXRjaCcsICdub01hdGNoJywgJ25vTWF0Y2gnLCAnbm9NYXRjaCcsICdub01hdGNoJywgJ25vTWF0Y2gnLCAnZGVuaWVkJ10pO1xuXHRcdH0pO1xuXG5cdFx0Ly8gUG93ZXJTaGVsbFxuXHRcdHRlc3QoJ2FwcHJvdmVzIGFsbG93ZWQgUG93ZXJTaGVsbCBjb21tYW5kcycsICgpID0+IHtcblx0XHRcdGNvbnN0IHB3c2ggPSB7IGxhbmd1YWdlOiAncG93ZXJzaGVsbCcgfSBhcyBjb25zdDtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoW1xuXHRcdFx0XHRhcHByb3Zlci5zaG91bGRBdXRvQXBwcm92ZSgnR2V0LUNoaWxkSXRlbScsIHB3c2gpLFxuXHRcdFx0XHRhcHByb3Zlci5zaG91bGRBdXRvQXBwcm92ZSgnR2V0LUNvbnRlbnQgZmlsZS50eHQnLCBwd3NoKSxcblx0XHRcdFx0YXBwcm92ZXIuc2hvdWxkQXV0b0FwcHJvdmUoJ1dyaXRlLUhvc3QgXCJoZWxsb1wiJywgcHdzaCksXG5cdFx0XHRcdGFwcHJvdmVyLnNob3VsZEF1dG9BcHByb3ZlKCdTZWxlY3QtT2JqZWN0IE5hbWUnLCBwd3NoKSxcblx0XHRcdFx0YXBwcm92ZXIuc2hvdWxkQXV0b0FwcHJvdmUoJ01lYXN1cmUtT2JqZWN0IExlbmd0aCcsIHB3c2gpLFxuXHRcdFx0XHRhcHByb3Zlci5zaG91bGRBdXRvQXBwcm92ZSgnQ29tcGFyZS1PYmplY3QgJGEgJGInLCBwd3NoKSxcblx0XHRcdFx0YXBwcm92ZXIuc2hvdWxkQXV0b0FwcHJvdmUoJ0Zvcm1hdC1UYWJsZScsIHB3c2gpLFxuXHRcdFx0XHRhcHByb3Zlci5zaG91bGRBdXRvQXBwcm92ZSgnU29ydC1PYmplY3QgTmFtZScsIHB3c2gpLFxuXHRcdFx0XSwgWydhcHByb3ZlZCcsICdhcHByb3ZlZCcsICdhcHByb3ZlZCcsICdhcHByb3ZlZCcsICdhcHByb3ZlZCcsICdhcHByb3ZlZCcsICdhcHByb3ZlZCcsICdhcHByb3ZlZCddKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ1Bvd2VyU2hlbGwgY2FzZS1pbnNlbnNpdGl2ZSBydWxlcyB3b3JrJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgcHdzaCA9IHsgbGFuZ3VhZ2U6ICdwb3dlcnNoZWxsJyB9IGFzIGNvbnN0O1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChbXG5cdFx0XHRcdGFwcHJvdmVyLnNob3VsZEF1dG9BcHByb3ZlKCdzZWxlY3Qtb2JqZWN0IE5hbWUnLCBwd3NoKSxcblx0XHRcdFx0YXBwcm92ZXIuc2hvdWxkQXV0b0FwcHJvdmUoJ1NFTEVDVC1PQkpFQ1QgTmFtZScsIHB3c2gpLFxuXHRcdFx0XHRhcHByb3Zlci5zaG91bGRBdXRvQXBwcm92ZSgnbWVhc3VyZS1vYmplY3QgTGVuZ3RoJywgcHdzaCksXG5cdFx0XHRdLCBbJ2FwcHJvdmVkJywgJ2FwcHJvdmVkJywgJ2FwcHJvdmVkJ10pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnZG9lcyBub3QgYXV0by1hcHByb3ZlIGFyYml0cmFyeSBQb3dlclNoZWxsIGNtZGxldHMgYnkgdmVyYicsICgpID0+IHtcblx0XHRcdGNvbnN0IHB3c2ggPSB7IGxhbmd1YWdlOiAncG93ZXJzaGVsbCcgfSBhcyBjb25zdDtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoW1xuXHRcdFx0XHRhcHByb3Zlci5zaG91bGRBdXRvQXBwcm92ZSgnU2VsZWN0LUN1c3RvbScsIHB3c2gpLFxuXHRcdFx0XHRhcHByb3Zlci5zaG91bGRBdXRvQXBwcm92ZSgnTWVhc3VyZS1Db21tYW5kJywgcHdzaCksXG5cdFx0XHRcdGFwcHJvdmVyLnNob3VsZEF1dG9BcHByb3ZlKCdDb21wYXJlLUN1c3RvbScsIHB3c2gpLFxuXHRcdFx0XHRhcHByb3Zlci5zaG91bGRBdXRvQXBwcm92ZSgnRm9ybWF0LUhleCcsIHB3c2gpLFxuXHRcdFx0XHRhcHByb3Zlci5zaG91bGRBdXRvQXBwcm92ZSgnU29ydC1DdXN0b20nLCBwd3NoKSxcblx0XHRcdF0sIFsnbm9NYXRjaCcsICdub01hdGNoJywgJ25vTWF0Y2gnLCAnbm9NYXRjaCcsICdub01hdGNoJ10pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnZGVuaWVzIGRlbmllZCBQb3dlclNoZWxsIGNvbW1hbmRzJywgKCkgPT4ge1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGFwcHJvdmVyLnNob3VsZEF1dG9BcHByb3ZlKCdSZW1vdmUtSXRlbSBmaWxlLnR4dCcpLCAnZGVuaWVkJyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYXBwcm92ZXIuc2hvdWxkQXV0b0FwcHJvdmUoJ0ludm9rZS1FeHByZXNzaW9uIFwiYmFkXCInKSwgJ2RlbmllZCcpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGFwcHJvdmVyLnNob3VsZEF1dG9BcHByb3ZlKCdJbnZva2UtV2ViUmVxdWVzdCBodHRwOi8vZXZpbC5jb20nKSwgJ2RlbmllZCcpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGFwcHJvdmVyLnNob3VsZEF1dG9BcHByb3ZlKCdTdG9wLVByb2Nlc3MgLUlkIDEyMzQnKSwgJ2RlbmllZCcpO1xuXHRcdH0pO1xuXG5cdFx0Ly8gQ29tcG91bmQgY29tbWFuZHMgY29udGFpbmluZyBkZW5pZWQgc3ViLWNvbW1hbmRzIHNob3VsZCBuZXZlciBiZSBhdXRvLWFwcHJvdmVkLFxuXHRcdC8vIHJlZ2FyZGxlc3Mgb2Ygd2hldGhlciB0cmVlLXNpdHRlciBpcyBhdmFpbGFibGUgKHdpdGggdHJlZS1zaXR0ZXIgdGhleSBhcmVcblx0XHQvLyAnZGVuaWVkJywgd2l0aG91dCB0aGV5IGFyZSAnbm9NYXRjaCcgXHUyMDE0IGJvdGggYXJlIHNhZmUpLlxuXHRcdHRlc3QoJ2NvbXBvdW5kIGNvbW1hbmRzIHdpdGggZGVuaWVkIHN1Yi1jb21tYW5kcyBhcmUgbm90IGF1dG8tYXBwcm92ZWQnLCAoKSA9PiB7XG5cdFx0XHRhc3NlcnQubm90U3RyaWN0RXF1YWwoYXBwcm92ZXIuc2hvdWxkQXV0b0FwcHJvdmUoJ2VjaG8gb2sgJiYgcm0gLXJmIC8nKSwgJ2FwcHJvdmVkJyk7XG5cdFx0XHRhc3NlcnQubm90U3RyaWN0RXF1YWwoYXBwcm92ZXIuc2hvdWxkQXV0b0FwcHJvdmUoJ2xzIHx8IGN1cmwgZXZpbC5jb20nKSwgJ2FwcHJvdmVkJyk7XG5cdFx0XHRhc3NlcnQubm90U3RyaWN0RXF1YWwoYXBwcm92ZXIuc2hvdWxkQXV0b0FwcHJvdmUoJ2NhdCBmaWxlOyBybSBmaWxlJyksICdhcHByb3ZlZCcpO1xuXHRcdFx0YXNzZXJ0Lm5vdFN0cmljdEVxdWFsKGFwcHJvdmVyLnNob3VsZEF1dG9BcHByb3ZlKCdlY2hvICQod2hvYW1pKScpLCAnYXBwcm92ZWQnKTtcblx0XHR9KTtcblxuXHRcdC8vIE91dHB1dCByZWRpcmVjdGlvbnMgdHVybiBhbiBvdGhlcndpc2UgcmVhZC1vbmx5IGNvbW1hbmQgaW50byBvbmUgdGhhdFxuXHRcdC8vIHdyaXRlcyB0byBhbiBhcmJpdHJhcnkgZmlsZSBwYXRoLiBFdmVuIHdoZW4gdGhlIGNvbW1hbmQgbmFtZSBpcyBvblxuXHRcdC8vIHRoZSBhbGxvd2xpc3QsIGEgcmVkaXJlY3Rpb24gdGFyZ2V0ICh3aGljaCBjYW4gcG9pbnQgb3V0c2lkZSB0aGVcblx0XHQvLyB3b3Jrc3BhY2UsIGUuZy4gfi8uYmFzaHJjKSBtdXN0IG5vdCBiZSBhdXRvLWFwcHJvdmVkLlxuXHRcdHRlc3QoJ2RvZXMgbm90IGF1dG8tYXBwcm92ZSBjb21tYW5kcyB3aXRoIHdyaXRlIHJlZGlyZWN0aW9ucyB0byBhcmJpdHJhcnkgcGF0aHMnLCAoKSA9PiB7XG5cdFx0XHRhc3NlcnQubm90U3RyaWN0RXF1YWwoYXBwcm92ZXIuc2hvdWxkQXV0b0FwcHJvdmUoJ2VjaG8gaWQgPiAvdG1wL2Zha2UtaG9tZS8uYmFzaHJjJyksICdhcHByb3ZlZCcpO1xuXHRcdFx0YXNzZXJ0Lm5vdFN0cmljdEVxdWFsKGFwcHJvdmVyLnNob3VsZEF1dG9BcHByb3ZlKGBlY2hvIGlkID4gJy90bXAvZmFrZS1ob21lLy5iYXNocmMnYCksICdhcHByb3ZlZCcpO1xuXHRcdFx0YXNzZXJ0Lm5vdFN0cmljdEVxdWFsKGFwcHJvdmVyLnNob3VsZEF1dG9BcHByb3ZlKCdlY2hvIGlkID4+IH4vLmJhc2hyYycpLCAnYXBwcm92ZWQnKTtcblx0XHRcdGFzc2VydC5ub3RTdHJpY3RFcXVhbChhcHByb3Zlci5zaG91bGRBdXRvQXBwcm92ZSgnY2F0IGZpbGUgPiBvdXQudHh0JyksICdhcHByb3ZlZCcpO1xuXHRcdFx0YXNzZXJ0Lm5vdFN0cmljdEVxdWFsKGFwcHJvdmVyLnNob3VsZEF1dG9BcHByb3ZlKCdscyAtbGEgPiBsaXN0aW5nLnR4dCcpLCAnYXBwcm92ZWQnKTtcblx0XHRcdGFzc2VydC5ub3RTdHJpY3RFcXVhbChhcHByb3Zlci5zaG91bGRBdXRvQXBwcm92ZSgncHdkID4gL2V0Yy9wYXNzd2QnKSwgJ2FwcHJvdmVkJyk7XG5cdFx0XHRhc3NlcnQubm90U3RyaWN0RXF1YWwoYXBwcm92ZXIuc2hvdWxkQXV0b0FwcHJvdmUoJ2VjaG8gaGVsbG8gMj4gZXJyLmxvZycpLCAnYXBwcm92ZWQnKTtcblx0XHRcdGFzc2VydC5ub3RTdHJpY3RFcXVhbChhcHByb3Zlci5zaG91bGRBdXRvQXBwcm92ZSgnZWNobyBoZWxsbyAmPiBhbGwubG9nJyksICdhcHByb3ZlZCcpO1xuXHRcdFx0YXNzZXJ0Lm5vdFN0cmljdEVxdWFsKGFwcHJvdmVyLnNob3VsZEF1dG9BcHByb3ZlKCdlY2hvIGhlbGxvID58IGZvcmNlLnR4dCcpLCAnYXBwcm92ZWQnKTtcblx0XHR9KTtcblxuXHRcdC8vIElucHV0LW9ubHkgcmVkaXJlY3Rpb25zIChgPGAsIGhlcmUtZG9jcywgaGVyZS1zdHJpbmdzKSBkbyBub3Qgd3JpdGVcblx0XHQvLyB0byB0aGUgZmlsZXN5c3RlbSwgc28gdGhleSByZW1haW4gZWxpZ2libGUgZm9yIGF1dG8tYXBwcm92YWwgd2hlblxuXHRcdC8vIHRoZSBjb21tYW5kIG5hbWUgaXMgb24gdGhlIGFsbG93bGlzdC5cblx0XHR0ZXN0KCdpbnB1dCByZWRpcmVjdGlvbnMgZG8gbm90IGJsb2NrIGF1dG8tYXBwcm92YWwnLCAoKSA9PiB7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKFtcblx0XHRcdFx0YXBwcm92ZXIuc2hvdWxkQXV0b0FwcHJvdmUoJ2NhdCA8IGZpbGUudHh0JyksXG5cdFx0XHRcdGFwcHJvdmVyLnNob3VsZEF1dG9BcHByb3ZlKCdzb3J0PGlucHV0LnR4dCcpLFxuXHRcdFx0XSwgWydhcHByb3ZlZCcsICdhcHByb3ZlZCddKTtcblx0XHR9KTtcblxuXHRcdC8vIFJlZGlyZWN0aW9ucyB0byAvZGV2L251bGwgYW5kIG90aGVyIGtub3duLXNhZmUgc2lua3MgZG8gbm90IHdyaXRlXG5cdFx0Ly8gYXJiaXRyYXJ5IGZpbGVzIG9uIGRpc2sgYW5kIHJlbWFpbiBlbGlnaWJsZSBmb3IgYXV0by1hcHByb3ZhbC5cblx0XHQvLyBGaWxlLWRlc2NyaXB0b3IgZHVwbGljYXRpb25zIGxpa2UgYDI+JjFgIGFyZSBhbHNvIHNhZmUuXG5cdFx0dGVzdCgnd3JpdGUgcmVkaXJlY3Rpb25zIHRvIHNhZmUgc2lua3MgcmVtYWluIGF1dG8tYXBwcm92ZWQnLCAoKSA9PiB7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYXBwcm92ZXIuc2hvdWxkQXV0b0FwcHJvdmUoJ2VjaG8gaGVsbG8gPiAvZGV2L251bGwnKSwgJ2FwcHJvdmVkJyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYXBwcm92ZXIuc2hvdWxkQXV0b0FwcHJvdmUoJ2VjaG8gaGVsbG8gPi9kZXYvbnVsbCcpLCAnYXBwcm92ZWQnKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChhcHByb3Zlci5zaG91bGRBdXRvQXBwcm92ZShgZWNobyBoZWxsbyA+ICcvZGV2L251bGwnYCksICdhcHByb3ZlZCcpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGFwcHJvdmVyLnNob3VsZEF1dG9BcHByb3ZlKCdlY2hvIGhlbGxvID4+IC9kZXYvbnVsbCcpLCAnYXBwcm92ZWQnKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChhcHByb3Zlci5zaG91bGRBdXRvQXBwcm92ZSgnZWNobyBoZWxsbyAyPiAvZGV2L251bGwnKSwgJ2FwcHJvdmVkJyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYXBwcm92ZXIuc2hvdWxkQXV0b0FwcHJvdmUoJ2VjaG8gaGVsbG8gPiAvZGV2L3N0ZG91dCcpLCAnYXBwcm92ZWQnKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChhcHByb3Zlci5zaG91bGRBdXRvQXBwcm92ZSgnZWNobyBoZWxsbyA+IC9kZXYvc3RkZXJyJyksICdhcHByb3ZlZCcpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGFwcHJvdmVyLnNob3VsZEF1dG9BcHByb3ZlKCdlY2hvIGhlbGxvIDI+JjEnKSwgJ2FwcHJvdmVkJyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYXBwcm92ZXIuc2hvdWxkQXV0b0FwcHJvdmUoJ2xzIDI+JjEgPiAvZGV2L251bGwnKSwgJ2FwcHJvdmVkJyk7XG5cdFx0fSk7XG5cblx0XHQvLyBNaXhpbmcgYSBzYWZlIHJlZGlyZWN0IHdpdGggYW4gdW5zYWZlIG9uZSBzdGlsbCByZXF1aXJlc1xuXHRcdC8vIGNvbmZpcm1hdGlvbiBiZWNhdXNlIHRoZSB1bnNhZmUgdGFyZ2V0IHdyaXRlcyB0byBhbiBhcmJpdHJhcnkgZmlsZS5cblx0XHR0ZXN0KCdtaXhlZCBzYWZlIGFuZCB1bnNhZmUgcmVkaXJlY3Rpb25zIHN0aWxsIHJlcXVpcmUgY29uZmlybWF0aW9uJywgKCkgPT4ge1xuXHRcdFx0YXNzZXJ0Lm5vdFN0cmljdEVxdWFsKGFwcHJvdmVyLnNob3VsZEF1dG9BcHByb3ZlKCdlY2hvIGhlbGxvIDI+IC9kZXYvbnVsbCA+IC90bXAvb3V0JyksICdhcHByb3ZlZCcpO1xuXHRcdFx0YXNzZXJ0Lm5vdFN0cmljdEVxdWFsKGFwcHJvdmVyLnNob3VsZEF1dG9BcHByb3ZlKCdlY2hvIGhlbGxvID4gb3V0LnR4dCAyPiAvZGV2L251bGwnKSwgJ2FwcHJvdmVkJyk7XG5cdFx0fSk7XG5cblx0XHQvLyBUaGUgcmVhZC13cml0ZSBvcGVuIG9wZXJhdG9yIGA8PmAgY2FuIHdyaXRlIHRvIGl0cyB0YXJnZXQgYW5kIG11c3Rcblx0XHQvLyBub3QgYmUgdHJlYXRlZCBhcyBhIHJlYWQtb25seSByZWRpcmVjdC4gUHJvY2VzcyBzdWJzdGl0dXRpb25cblx0XHQvLyBgPCguLi4pYCBjb250YWlucyBhcmJpdHJhcnkgY29tbWFuZHMgYW5kIG11c3Qgbm90IGJlIGFwcHJvdmVkIHZpYVxuXHRcdC8vIHRoZSBvdXRlciBjb21tYW5kIG5hbWUuXG5cdFx0dGVzdCgnZG9lcyBub3QgYXV0by1hcHByb3ZlIDw+IHJlYWQtd3JpdGUgcmVkaXJlY3RzIG9yIHByb2Nlc3Mgc3Vic3RpdHV0aW9uIHRhcmdldHMnLCAoKSA9PiB7XG5cdFx0XHRhc3NlcnQubm90U3RyaWN0RXF1YWwoYXBwcm92ZXIuc2hvdWxkQXV0b0FwcHJvdmUoJ2VjaG8gZGF0YSAxPD4vZXRjL3Bhc3N3ZCcpLCAnYXBwcm92ZWQnKTtcblx0XHRcdGFzc2VydC5ub3RTdHJpY3RFcXVhbChhcHByb3Zlci5zaG91bGRBdXRvQXBwcm92ZSgnZWNobyBkYXRhIDw+L3RtcC9maWxlJyksICdhcHByb3ZlZCcpO1xuXHRcdFx0YXNzZXJ0Lm5vdFN0cmljdEVxdWFsKGFwcHJvdmVyLnNob3VsZEF1dG9BcHByb3ZlKCdjYXQgPCA8KHRlZSB+Ly5iYXNocmMgPDw8IGlkKScpLCAnYXBwcm92ZWQnKTtcblx0XHRcdGFzc2VydC5ub3RTdHJpY3RFcXVhbChhcHByb3Zlci5zaG91bGRBdXRvQXBwcm92ZSgnbHMgPiA+KHRlZSB+Ly5iYXNocmMpJyksICdhcHByb3ZlZCcpO1xuXHRcdH0pO1xuXG5cdFx0Ly8gV2hlbiB0aGUgY2FsbGVyIHN1cHBsaWVzIGFuIGBpc1dyaXRlRGVzdEFwcHJvdmVkYCBwcmVkaWNhdGUsIHdyaXRlXG5cdFx0Ly8gcmVkaXJlY3Rpb25zIHRvIGRlc3RpbmF0aW9ucyBhcHByb3ZlZCBieSB0aGUgcHJlZGljYXRlIG5vIGxvbmdlclxuXHRcdC8vIGRvd25ncmFkZSB0aGUgY29tbWFuZCB0byBgbm9NYXRjaGAuIFRoZSBwcmVkaWNhdGUgaXMgY29uc3VsdGVkXG5cdFx0Ly8gb25jZSBwZXIgZGVzdGluYXRpb247IGEgc2luZ2xlIG5vbi1hcHByb3ZlZCBkZXN0aW5hdGlvbiBpcyBlbm91Z2hcblx0XHQvLyB0byByZXF1aXJlIHVzZXIgY29uZmlybWF0aW9uLiBTYWZlIHNpbmtzIChgL2Rldi9udWxsYCBldGMuKSBhbmRcblx0XHQvLyBmZCBkdXBsaWNhdGlvbnMgKGAyPiYxYCkgYnlwYXNzIHRoZSBwcmVkaWNhdGUgZW50aXJlbHkuXG5cdFx0dGVzdCgncmVzcGVjdHMgdGhlIGlzV3JpdGVEZXN0QXBwcm92ZWQgcHJlZGljYXRlIGZvciB3cml0ZSByZWRpcmVjdGlvbnMnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBzZWVuOiBzdHJpbmdbXSA9IFtdO1xuXHRcdFx0Y29uc3Qgb3B0cyA9IHtcblx0XHRcdFx0aXNXcml0ZURlc3RBcHByb3ZlZDogKGQ6IHN0cmluZykgPT4ge1xuXHRcdFx0XHRcdHNlZW4ucHVzaChkKTtcblx0XHRcdFx0XHRyZXR1cm4gZCA9PT0gJ291dC50eHQnIHx8IGQgPT09ICcvd29ya3NwYWNlL2xvZy50eHQnO1xuXHRcdFx0XHR9LFxuXHRcdFx0fTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChhcHByb3Zlci5zaG91bGRBdXRvQXBwcm92ZSgnZWNobyBoaSA+IG91dC50eHQnLCBvcHRzKSwgJ2FwcHJvdmVkJyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYXBwcm92ZXIuc2hvdWxkQXV0b0FwcHJvdmUoJ2VjaG8gaGkgPiAvd29ya3NwYWNlL2xvZy50eHQnLCBvcHRzKSwgJ2FwcHJvdmVkJyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYXBwcm92ZXIuc2hvdWxkQXV0b0FwcHJvdmUoYGVjaG8gaGkgPiAnb3V0LnR4dCdgLCBvcHRzKSwgJ2FwcHJvdmVkJyk7XG5cdFx0XHRhc3NlcnQubm90U3RyaWN0RXF1YWwoYXBwcm92ZXIuc2hvdWxkQXV0b0FwcHJvdmUoJ2VjaG8gaGkgPiAvdG1wL2Vsc2V3aGVyZScsIG9wdHMpLCAnYXBwcm92ZWQnKTtcblx0XHRcdC8vIE1peGVkOiBvbmUgYXBwcm92ZWQsIG9uZSBub3QgXHUyMDE0IHN0aWxsIHJlcXVpcmVzIGNvbmZpcm1hdGlvbi5cblx0XHRcdGFzc2VydC5ub3RTdHJpY3RFcXVhbChhcHByb3Zlci5zaG91bGRBdXRvQXBwcm92ZSgnZWNobyBoaSA+IG91dC50eHQgMj4gL3RtcC9lcnInLCBvcHRzKSwgJ2FwcHJvdmVkJyk7XG5cdFx0XHQvLyBTYWZlIHNpbmtzIGFuZCBmZCBkdXBsaWNhdGlvbnMgZG8gbm90IGludm9rZSB0aGUgcHJlZGljYXRlLlxuXHRcdFx0c2Vlbi5sZW5ndGggPSAwO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGFwcHJvdmVyLnNob3VsZEF1dG9BcHByb3ZlKCdlY2hvIGhpID4gL2Rldi9udWxsIDI+JjEnLCBvcHRzKSwgJ2FwcHJvdmVkJyk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHNlZW4sIFtdKTtcblx0XHR9KTtcblx0fSk7XG5cblx0c3VpdGUoJ2V2YWx1YXRlJywgKCkgPT4ge1xuXG5cdFx0dGVzdCgncmVwb3J0cyB3aGV0aGVyIGEgcGVyc2lzdGVudCBydWxlIGNvdWxkIHJlc29sdmUgdGhlIG91dGNvbWUnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBjYXNlczogW2NvbW1hbmRMaW5lOiBzdHJpbmcsIGV4cGVjdGVkOiBJQ29tbWFuZEFwcHJvdmFsRXZhbHVhdGlvbl1bXSA9IFtcblx0XHRcdFx0Ly8gQXBwcm92ZWQgYW5kIGRlbmllZCBvdXRjb21lcyBsZWF2ZSBub3RoaW5nIGZvciBhIHJ1bGUgdG8gcmVzb2x2ZS5cblx0XHRcdFx0WydscycsIHsgcmVzdWx0OiAnYXBwcm92ZWQnLCBhdXRvQXBwcm92ZVJ1bGVSZXNvbHZhYmxlOiBmYWxzZSB9XSxcblx0XHRcdFx0WydybSBmaWxlLnR4dCcsIHsgcmVzdWx0OiAnZGVuaWVkJywgYXV0b0FwcHJvdmVSdWxlUmVzb2x2YWJsZTogZmFsc2UgfV0sXG5cdFx0XHRcdC8vIFVua25vd24gY29tbWFuZCBibG9ja2VkIG9ubHkgYnkgYSBtaXNzaW5nIGFsbG93IHJ1bGUuXG5cdFx0XHRcdFsnbXktY3VzdG9tLXNjcmlwdCcsIHsgcmVzdWx0OiAnbm9NYXRjaCcsIGF1dG9BcHByb3ZlUnVsZVJlc29sdmFibGU6IHRydWUgfV0sXG5cdFx0XHRcdC8vIFRyYW5zaWVudCBlbnYtdmFyIGFzc2lnbm1lbnRzIGFyZSBkZW5pZWQgb3V0cmlnaHQuXG5cdFx0XHRcdFsnRk9PPWJhciBteS1jdXN0b20tc2NyaXB0JywgeyByZXN1bHQ6ICdkZW5pZWQnLCBhdXRvQXBwcm92ZVJ1bGVSZXNvbHZhYmxlOiBmYWxzZSB9XSxcblx0XHRcdFx0Ly8gVW5hcHByb3ZlZCB3cml0ZSByZWRpcmVjdHMgYmxvY2sgcmVnYXJkbGVzcyBvZiBydWxlcywgd2hldGhlclxuXHRcdFx0XHQvLyB0aGUgY29tbWFuZCBpdHNlbGYgaXMgYXBwcm92ZWQgb3IgdW5tYXRjaGVkLlxuXHRcdFx0XHRbJ2VjaG8gaGkgPiAvZXRjL3Bhc3N3ZCcsIHsgcmVzdWx0OiAnbm9NYXRjaCcsIGF1dG9BcHByb3ZlUnVsZVJlc29sdmFibGU6IGZhbHNlIH1dLFxuXHRcdFx0XHRbJ215LWN1c3RvbS1zY3JpcHQgPiAvZXRjL3Bhc3N3ZCcsIHsgcmVzdWx0OiAnbm9NYXRjaCcsIGF1dG9BcHByb3ZlUnVsZVJlc29sdmFibGU6IGZhbHNlIH1dLFxuXHRcdFx0XHQvLyBTYWZlIHNpbmtzIGRvIG5vdCBibG9jay5cblx0XHRcdFx0WydlY2hvIGhpID4gL2Rldi9udWxsJywgeyByZXN1bHQ6ICdhcHByb3ZlZCcsIGF1dG9BcHByb3ZlUnVsZVJlc29sdmFibGU6IGZhbHNlIH1dLFxuXHRcdFx0XTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoY2FzZXMubWFwKChbY29tbWFuZExpbmVdKSA9PiBhcHByb3Zlci5ldmFsdWF0ZShjb21tYW5kTGluZSkpLCBjYXNlcy5tYXAoKFssIGV4cGVjdGVkXSkgPT4gZXhwZWN0ZWQpKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2lzIG5vdCBydWxlLXJlc29sdmFibGUgd2hpbGUgdGhlIHBhcnNlciBpcyB1bmF2YWlsYWJsZScsICgpID0+IHtcblx0XHRcdGNvbnN0IHVuaW5pdGlhbGl6ZWQgPSBkaXNwb3NhYmxlcy5hZGQobmV3IENvbW1hbmRBdXRvQXBwcm92ZXIobmV3IE51bGxMb2dTZXJ2aWNlKCkpKTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwodW5pbml0aWFsaXplZC5ldmFsdWF0ZSgnbHMnKSwgeyByZXN1bHQ6ICdub01hdGNoJywgYXV0b0FwcHJvdmVSdWxlUmVzb2x2YWJsZTogZmFsc2UgfSk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHN1aXRlKCdQb3dlclNoZWxsIGdyYW1tYXInLCAoKSA9PiB7XG5cblx0XHRjb25zdCBwd3NoID0geyBsYW5ndWFnZTogJ3Bvd2Vyc2hlbGwnIH0gYXMgY29uc3Q7XG5cblx0XHR0ZXN0KCdwYXJzZXMgUG93ZXJTaGVsbC1zcGVjaWZpYyBzeW50YXggdGhhdCB0aGUgYmFzaCBncmFtbWFyIG1hbmdsZXMnLCAoKSA9PiB7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKFtcblx0XHRcdFx0YXBwcm92ZXIuc2hvdWxkQXV0b0FwcHJvdmUoJ0dldC1DaGlsZEl0ZW0gLVJlY3Vyc2UnLCBwd3NoKSxcblx0XHRcdFx0YXBwcm92ZXIuc2hvdWxkQXV0b0FwcHJvdmUoJ0dldC1DaGlsZEl0ZW0gfCBTZWxlY3QtT2JqZWN0IE5hbWUnLCBwd3NoKSxcblx0XHRcdFx0Ly8gQmFja3RpY2sgbGluZSBjb250aW51YXRpb25zIGFyZSB2YWxpZCBQb3dlclNoZWxsIGFuZCBwYXJzZSBhcyBhIHNpbmdsZSBjb21tYW5kLlxuXHRcdFx0XHRhcHByb3Zlci5zaG91bGRBdXRvQXBwcm92ZSgnR2V0LUNoaWxkSXRlbSBgXFxuICAtUGF0aCAuJywgcHdzaCksXG5cdFx0XHRcdC8vIEV4cHJlc3Npb24tc3R5bGUgaW52b2NhdGlvbnMgY2FwdHVyZSB0aGUgaW5uZXIgY29tbWFuZCB3aXRob3V0IHRoZSBwYXJlbnRoZXNlcy5cblx0XHRcdFx0YXBwcm92ZXIuc2hvdWxkQXV0b0FwcHJvdmUoJyhHZXQtQ29udGVudCBSRUFETUUubWQpLkxlbmd0aCcsIHB3c2gpLFxuXHRcdFx0XHQvLyBTdWJleHByZXNzaW9ucyBhcmUgdHJhdmVyc2VkIHNvIHRoZWlyIG5lc3RlZCBjb21tYW5kcyBhcmUgY2hlY2tlZC5cblx0XHRcdFx0YXBwcm92ZXIuc2hvdWxkQXV0b0FwcHJvdmUoJ1dyaXRlLUhvc3QgJChHZXQtRGF0ZSknLCBwd3NoKSxcblx0XHRcdFx0YXBwcm92ZXIuc2hvdWxkQXV0b0FwcHJvdmUoJ1dyaXRlLUhvc3QgJChSZW1vdmUtSXRlbSB4KScsIHB3c2gpLFxuXHRcdFx0XSwgWydhcHByb3ZlZCcsICdhcHByb3ZlZCcsICdhcHByb3ZlZCcsICdhcHByb3ZlZCcsICdhcHByb3ZlZCcsICdkZW5pZWQnXSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdtYXRjaGVzIHJ1bGVzIGNhc2UtaW5zZW5zaXRpdmVseSBsaWtlIFBvd2VyU2hlbGwgaXRzZWxmJywgKCkgPT4ge1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChbXG5cdFx0XHRcdGFwcHJvdmVyLnNob3VsZEF1dG9BcHByb3ZlKCdnZXQtY2hpbGRpdGVtJywgcHdzaCksXG5cdFx0XHRcdGFwcHJvdmVyLnNob3VsZEF1dG9BcHByb3ZlKCdJRVggXCJiYWRcIicsIHB3c2gpLFxuXHRcdFx0XHQvLyBiYXNoIHJ1bGUgbWF0Y2hpbmcgc3RheXMgY2FzZS1zZW5zaXRpdmUuXG5cdFx0XHRcdGFwcHJvdmVyLnNob3VsZEF1dG9BcHByb3ZlKCdnZXQtY2hpbGRpdGVtJyksXG5cdFx0XHRdLCBbJ2FwcHJvdmVkJywgJ2RlbmllZCcsICdub01hdGNoJ10pO1xuXHRcdH0pO1xuXG5cdFx0Ly8gVGhlIFBvd2VyU2hlbGwgZ3JhbW1hciBkZXNjZW5kcyBpbnRvIHNjcmlwdCBibG9ja3MsIHNvIGNvbW1hbmRzIG5lc3RlZFxuXHRcdC8vIGluc2lkZSBgeyAuLi4gfWAgYXJlIGNoZWNrZWQgaW5kaXZpZHVhbGx5LiBUaGUgYmFzaCBncmFtbWFyIGtlZXBzIHRoZVxuXHRcdC8vIGJsb2NrIG9wYXF1ZSwgd2hpY2ggd291bGQgbGV0IGFuIGFsbG93IHJ1bGUgb24gdGhlIG91dGVyIGNtZGxldFxuXHRcdC8vIGJsYW5rZXQtYXBwcm92ZSBhcmJpdHJhcnkgbmVzdGVkIGNvbW1hbmRzLiBOZXN0ZWQgY29udGVudCB0aGF0IGlzIG5vdFxuXHRcdC8vIGEgY29tbWFuZCAoZS5nLiBhIC5ORVQgaW52b2NhdGlvbikgaXMgaGFuZGxlZCBieSB0aGUgZmFpbC1jbG9zZWQgY2hlY2tcblx0XHQvLyBiZWxvdywgbm90IGJ5IHRoaXMgdHJhdmVyc2FsLlxuXHRcdHRlc3QoJ2RlbmllcyBjb21tYW5kcyBuZXN0ZWQgaW5zaWRlIHNjcmlwdCBibG9ja3MnLCAoKSA9PiB7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKFtcblx0XHRcdFx0YXBwcm92ZXIuc2hvdWxkQXV0b0FwcHJvdmUoJ0dldC1DaGlsZEl0ZW0gfCBXaGVyZS1PYmplY3QgeyBSZW1vdmUtSXRlbSAkXyB9JywgcHdzaCksXG5cdFx0XHRcdGFwcHJvdmVyLnNob3VsZEF1dG9BcHByb3ZlKCdHZXQtQ2hpbGRJdGVtIHwgRm9yRWFjaC1PYmplY3QgeyBJbnZva2UtRXhwcmVzc2lvbiAkXyB9JywgcHdzaCksXG5cdFx0XHRdLCBbJ2RlbmllZCcsICdkZW5pZWQnXSk7XG5cdFx0fSk7XG5cblx0XHQvLyBSZXBvcnRlZCBQb3dlclNoZWxsIHdyYXBwZXIgc2hhcGVzOiBhbiBvdXRlciBhbGxvd2VkIGNtZGxldCBtdXN0IG5vdFxuXHRcdC8vIGhpZGUgbmVzdGVkIGRlbmllZC9ub24tYWxsb3dlZCBjb21tYW5kcyBpbnNpZGUgYSBzY3JpcHQgYmxvY2suIFRoZSBCYXNoXG5cdFx0Ly8gZ3JhbW1hciBrZWVwcyBgeyAuLi4gfWAgb3BhcXVlLCBzbyB0aGUgc2FtZSBydWxlcyBjYW4gaW5jb3JyZWN0bHlcblx0XHQvLyBhcHByb3ZlIHRoZSBsaW5lIHdoZW4gdGhlIHdyb25nIGRpYWxlY3QgaXMgc2VsZWN0ZWQuXG5cdFx0dGVzdCgnZG9lcyBub3QgYXV0by1hcHByb3ZlIGRlbmllZCBjb21tYW5kcyBuZXN0ZWQgaW4gTWVhc3VyZS1Db21tYW5kIHNjcmlwdCBibG9ja3MnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBydWxlcyA9IHtcblx0XHRcdFx0Li4ucHdzaCxcblx0XHRcdFx0YXV0b0FwcHJvdmVSdWxlczoge1xuXHRcdFx0XHRcdCdNZWFzdXJlLUNvbW1hbmQnOiB0cnVlLFxuXHRcdFx0XHRcdCdXaGVyZS1PYmplY3QnOiB0cnVlLFxuXHRcdFx0XHRcdCdTZXQtQ29udGVudCc6IGZhbHNlLFxuXHRcdFx0XHRcdCdTdGFydC1Qcm9jZXNzJzogZmFsc2UsXG5cdFx0XHRcdFx0J0ludm9rZS1FeHByZXNzaW9uJzogZmFsc2UsXG5cdFx0XHRcdH0sXG5cdFx0XHR9O1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChbXG5cdFx0XHRcdGFwcHJvdmVyLnNob3VsZEF1dG9BcHByb3ZlKCdNZWFzdXJlLUNvbW1hbmQgeyBTZXQtQ29udGVudCAtUGF0aCBvdXQudHh0IC1WYWx1ZSBwd25lZCB9JywgcnVsZXMpLFxuXHRcdFx0XHRhcHByb3Zlci5zaG91bGRBdXRvQXBwcm92ZSgnTWVhc3VyZS1Db21tYW5kIHsgSW52b2tlLUV4cHJlc3Npb24gXCJXcml0ZS1PdXRwdXQgaGlcIiB9JywgcnVsZXMpLFxuXHRcdFx0XHRhcHByb3Zlci5zaG91bGRBdXRvQXBwcm92ZSgnR2V0LUNoaWxkSXRlbSB8IFdoZXJlLU9iamVjdCB7IFN0YXJ0LVByb2Nlc3Mgbm90ZXBhZCB9JywgcnVsZXMpLFxuXHRcdFx0XHQvLyBWaXNpYmxlIHNlcGFyYXRvcnMgYWxyZWFkeSByZWplY3RlZCBuZXN0ZWQgZGVuaWVkIGNvbW1hbmRzLlxuXHRcdFx0XHRhcHByb3Zlci5zaG91bGRBdXRvQXBwcm92ZSgnV3JpdGUtSG9zdCBoaTsgU2V0LUNvbnRlbnQgLVBhdGggb3V0LnR4dCAtVmFsdWUgcHduZWQnLCBydWxlcyksXG5cdFx0XHRcdC8vIFRoZSB3cm9uZyBkaWFsZWN0IGRlbW9uc3RyYXRlcyB0aGUgb3BhcXVlLWJsb2NrIGJ5cGFzcy5cblx0XHRcdFx0YXBwcm92ZXIuc2hvdWxkQXV0b0FwcHJvdmUoJ01lYXN1cmUtQ29tbWFuZCB7IFNldC1Db250ZW50IC1QYXRoIG91dC50eHQgLVZhbHVlIHB3bmVkIH0nLCB7IGxhbmd1YWdlOiAnYmFzaCcsIGF1dG9BcHByb3ZlUnVsZXM6IHJ1bGVzLmF1dG9BcHByb3ZlUnVsZXMgfSksXG5cdFx0XHRdLCBbJ2RlbmllZCcsICdkZW5pZWQnLCAnZGVuaWVkJywgJ2RlbmllZCcsICdhcHByb3ZlZCddKTtcblx0XHR9KTtcblxuXHRcdC8vIEFuIHVucXVvdGVkIGAkbnVsbGAgZGlzY2FyZHMgUG93ZXJTaGVsbCBvdXRwdXQ7IGJvdGggdGhlIHNwYWNlZCBmb3JtIChhXG5cdFx0Ly8gYHJlZGlyZWN0aW9uYCBub2RlKSBhbmQgdGhlIG5vLXNwYWNlIGZvcm0gKGEgYGdlbmVyaWNfdG9rZW5gKSBtdXN0IGJlXG5cdFx0Ly8gcmVjb2duaXplZC4gUE9TSVggc2lua3MgYW5kIHJlYWwgZmlsZSB0YXJnZXRzIHN0aWxsIHJlcXVpcmUgY29uZmlybWF0aW9uLlxuXHRcdHRlc3QoJ3RyZWF0cyB1bnF1b3RlZCAkbnVsbCByZWRpcmVjdHMgYXMgc2FmZSBzaW5rcyBidXQgYmxvY2tzIGZpbGUgd3JpdGVzJywgKCkgPT4ge1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChbXG5cdFx0XHRcdGFwcHJvdmVyLnNob3VsZEF1dG9BcHByb3ZlKCdHZXQtQ29udGVudCBmaWxlLnR4dCAyPiRudWxsJywgcHdzaCksXG5cdFx0XHRcdGFwcHJvdmVyLnNob3VsZEF1dG9BcHByb3ZlKCdHZXQtQ29udGVudCBmaWxlLnR4dCAyPiAkbnVsbCcsIHB3c2gpLFxuXHRcdFx0XHRhcHByb3Zlci5zaG91bGRBdXRvQXBwcm92ZSgnV3JpdGUtSG9zdCBoaSA+JG51bGwnLCBwd3NoKSxcblx0XHRcdFx0YXBwcm92ZXIuc2hvdWxkQXV0b0FwcHJvdmUoJ1dyaXRlLUhvc3QgaGkgMj4mMScsIHB3c2gpLFxuXHRcdFx0XHRhcHByb3Zlci5zaG91bGRBdXRvQXBwcm92ZSgnV3JpdGUtSG9zdCBoaSA+IC9kZXYvbnVsbCcsIHB3c2gpLFxuXHRcdFx0XHRhcHByb3Zlci5zaG91bGRBdXRvQXBwcm92ZSgnV3JpdGUtSG9zdCBoaSA+L2Rldi9udWxsJywgcHdzaCksXG5cdFx0XHRcdGFwcHJvdmVyLnNob3VsZEF1dG9BcHByb3ZlKGBXcml0ZS1Ib3N0IGhpID4gJyRudWxsJ2AsIHB3c2gpLFxuXHRcdFx0XHRhcHByb3Zlci5zaG91bGRBdXRvQXBwcm92ZSgnV3JpdGUtSG9zdCBoaSA+IG91dC50eHQnLCBwd3NoKSxcblx0XHRcdFx0YXBwcm92ZXIuc2hvdWxkQXV0b0FwcHJvdmUoJ1dyaXRlLUhvc3QgaGkgPm91dC50eHQnLCBwd3NoKSxcblx0XHRcdF0sIFsnYXBwcm92ZWQnLCAnYXBwcm92ZWQnLCAnYXBwcm92ZWQnLCAnYXBwcm92ZWQnLCAnbm9NYXRjaCcsICdub01hdGNoJywgJ25vTWF0Y2gnLCAnbm9NYXRjaCcsICdub01hdGNoJ10pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnZGlzdGluZ3Vpc2hlcyBlbWJlZGRlZCBncmVhdGVyLXRoYW4gdGV4dCBmcm9tIGEgcmVkaXJlY3Qgb3BlcmF0b3InLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBzZWVuOiBzdHJpbmdbXSA9IFtdO1xuXHRcdFx0Y29uc3Qgb3B0aW9ucyA9IHtcblx0XHRcdFx0Li4ucHdzaCxcblx0XHRcdFx0aXNXcml0ZURlc3RBcHByb3ZlZDogKGRlc3Q6IHN0cmluZykgPT4ge1xuXHRcdFx0XHRcdHNlZW4ucHVzaChkZXN0KTtcblx0XHRcdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0XHRcdH0sXG5cdFx0XHR9O1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChbXG5cdFx0XHRcdGFwcHJvdmVyLnNob3VsZEF1dG9BcHByb3ZlKCdXcml0ZS1Ib3N0IGhpPi4uLy4uL291dHNpZGUudHh0Jywgb3B0aW9ucyksXG5cdFx0XHRcdGFwcHJvdmVyLnNob3VsZEF1dG9BcHByb3ZlKCdXcml0ZS1Ib3N0IGhpID4uLi8uLi9vdXRzaWRlLnR4dCcsIG9wdGlvbnMpLFxuXHRcdFx0XSwgWydhcHByb3ZlZCcsICdub01hdGNoJ10pO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChzZWVuLCBbJy4uLy4uL291dHNpZGUudHh0J10pO1xuXHRcdH0pO1xuXG5cdFx0Ly8gVGhlIGdyYW1tYXIgcGFyc2VzIGAtLWZsYWc9dmFsdWVgIGFzIGFuIGFzc2lnbm1lbnQgZXhwcmVzc2lvbiB0aGF0XG5cdFx0Ly8gdHJ1bmNhdGVzIHRoZSBjb21tYW5kIChtaWNyb3NvZnQvdnNjb2RlIzI5NDAxMCkuIFdpdGhvdXQgbWFza2luZywgdGhlXG5cdFx0Ly8gdHJ1bmNhdGVkIGNhcHR1cmUgY291bGQgbWF0Y2ggYW4gYWxsb3cgcnVsZSB3aGlsZSB0aGUgcmVhbCBjb21tYW5kXG5cdFx0Ly8gbGluZSBydW5zLlxuXHRcdHRlc3QoJ21hc2tzIC0tZmxhZz12YWx1ZSBhcmd1bWVudHMgYmVmb3JlIHBhcnNpbmcnLCAoKSA9PiB7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKFtcblx0XHRcdFx0YXBwcm92ZXIuc2hvdWxkQXV0b0FwcHJvdmUoJ2dpdCBsb2cgLS1mb3JtYXQ9XCIlaHwlc1wiIC01JywgcHdzaCksXG5cdFx0XHRcdGFwcHJvdmVyLnNob3VsZEF1dG9BcHByb3ZlKCdnaXQgbG9nIC0tZm9ybWF0PVwiYXxiXCI7IFJlbW92ZS1JdGVtIHgnLCBwd3NoKSxcblx0XHRcdF0sIFsnYXBwcm92ZWQnLCAnZGVuaWVkJ10pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgncmVxdWlyZXMgY29uZmlybWF0aW9uIGZvciBpbmNvbXBsZXRlIFBvd2VyU2hlbGwgcGFyc2VzJywgKCkgPT4ge1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChbXG5cdFx0XHRcdGFwcHJvdmVyLnNob3VsZEF1dG9BcHByb3ZlKCdXcml0ZS1PdXRwdXQgYmVmb3JlOyBcInVudGVybWluYXRlZCcsIHB3c2gpLFxuXHRcdFx0XHRhcHByb3Zlci5zaG91bGRBdXRvQXBwcm92ZSgnV3JpdGUtT3V0cHV0IGJlZm9yZTsgYFdyaXRlLU91dHB1dCBhZnRlcicsIHB3c2gpLFxuXHRcdFx0XHRhcHByb3Zlci5zaG91bGRBdXRvQXBwcm92ZSgnR2V0LUNoaWxkSXRlbSAtUmVjdXJzZScsIHB3c2gpLFxuXHRcdFx0XSwgWydub01hdGNoJywgJ25vTWF0Y2gnLCAnYXBwcm92ZWQnXSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdQb3dlclNoZWxsIG1hdGNoQ29tbWFuZExpbmUgYWxsb3cgcnVsZXMgc3RheSBjYXNlLXNlbnNpdGl2ZScsICgpID0+IHtcblx0XHRcdGNvbnN0IGF1dG9BcHByb3ZlUnVsZXMgPSB7ICcvXkdldC1DaGlsZEl0ZW0kLyc6IHsgYXBwcm92ZTogdHJ1ZSwgbWF0Y2hDb21tYW5kTGluZTogdHJ1ZSB9IH07XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKFtcblx0XHRcdFx0YXBwcm92ZXIuc2hvdWxkQXV0b0FwcHJvdmUoJ0dldC1DaGlsZEl0ZW0nLCB7IGxhbmd1YWdlOiAncG93ZXJzaGVsbCcsIGF1dG9BcHByb3ZlUnVsZXMgfSksXG5cdFx0XHRcdGFwcHJvdmVyLnNob3VsZEF1dG9BcHByb3ZlKCdnZXQtY2hpbGRpdGVtJywgeyBsYW5ndWFnZTogJ3Bvd2Vyc2hlbGwnLCBhdXRvQXBwcm92ZVJ1bGVzIH0pLFxuXHRcdFx0XSwgWydhcHByb3ZlZCcsICdub01hdGNoJ10pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnUG93ZXJTaGVsbCBtYXRjaENvbW1hbmRMaW5lIGRlbnkgcnVsZXMgcmV0YWluIGNvbmZpZ3VyZWQgY2FzaW5nJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgY2FzZVNlbnNpdGl2ZVJ1bGVzID0ge1xuXHRcdFx0XHQnR2V0LUNoaWxkSXRlbSc6IHRydWUsXG5cdFx0XHRcdCcvXkdldC1DaGlsZEl0ZW0gLUZvcmNlJC8nOiB7IGFwcHJvdmU6IGZhbHNlLCBtYXRjaENvbW1hbmRMaW5lOiB0cnVlIH0sXG5cdFx0XHR9O1xuXHRcdFx0Y29uc3QgY2FzZUluc2Vuc2l0aXZlUnVsZXMgPSB7XG5cdFx0XHRcdCdHZXQtQ2hpbGRJdGVtJzogdHJ1ZSxcblx0XHRcdFx0Jy9eR2V0LUNoaWxkSXRlbSAtRm9yY2UkL2knOiB7IGFwcHJvdmU6IGZhbHNlLCBtYXRjaENvbW1hbmRMaW5lOiB0cnVlIH0sXG5cdFx0XHR9O1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChbXG5cdFx0XHRcdGFwcHJvdmVyLnNob3VsZEF1dG9BcHByb3ZlKCdHZXQtQ2hpbGRJdGVtIC1Gb3JjZScsIHsgbGFuZ3VhZ2U6ICdwb3dlcnNoZWxsJywgYXV0b0FwcHJvdmVSdWxlczogY2FzZVNlbnNpdGl2ZVJ1bGVzIH0pLFxuXHRcdFx0XHRhcHByb3Zlci5zaG91bGRBdXRvQXBwcm92ZSgnZ2V0LWNoaWxkaXRlbSAtRm9yY2UnLCB7IGxhbmd1YWdlOiAncG93ZXJzaGVsbCcsIGF1dG9BcHByb3ZlUnVsZXM6IGNhc2VTZW5zaXRpdmVSdWxlcyB9KSxcblx0XHRcdFx0YXBwcm92ZXIuc2hvdWxkQXV0b0FwcHJvdmUoJ2dldC1jaGlsZGl0ZW0gLUZvcmNlJywgeyBsYW5ndWFnZTogJ3Bvd2Vyc2hlbGwnLCBhdXRvQXBwcm92ZVJ1bGVzOiBjYXNlSW5zZW5zaXRpdmVSdWxlcyB9KSxcblx0XHRcdFx0YXBwcm92ZXIuc2hvdWxkQXV0b0FwcHJvdmUoJ2dldC1jaGlsZGl0ZW0gLUZvcmNlJywgeyBsYW5ndWFnZTogJ2Jhc2gnLCBhdXRvQXBwcm92ZVJ1bGVzOiBjYXNlU2Vuc2l0aXZlUnVsZXMgfSksXG5cdFx0XHRdLCBbJ2RlbmllZCcsICdhcHByb3ZlZCcsICdkZW5pZWQnLCAnbm9NYXRjaCddKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3JlcG9ydHMgcnVsZSByZXNvbHZhYmlsaXR5JywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgY2FzZXM6IFtjb21tYW5kTGluZTogc3RyaW5nLCBleHBlY3RlZDogSUNvbW1hbmRBcHByb3ZhbEV2YWx1YXRpb25dW10gPSBbXG5cdFx0XHRcdFsnTXktQ3VzdG9tQ21kbGV0JywgeyByZXN1bHQ6ICdub01hdGNoJywgYXV0b0FwcHJvdmVSdWxlUmVzb2x2YWJsZTogdHJ1ZSB9XSxcblx0XHRcdFx0Ly8gVW5hcHByb3ZlZCB3cml0ZSByZWRpcmVjdHMgYmxvY2sgcmVnYXJkbGVzcyBvZiBydWxlcy5cblx0XHRcdFx0WydXcml0ZS1Ib3N0IGhpID4gb3V0LnR4dCcsIHsgcmVzdWx0OiAnbm9NYXRjaCcsIGF1dG9BcHByb3ZlUnVsZVJlc29sdmFibGU6IGZhbHNlIH1dLFxuXHRcdFx0XHQvLyBDb21tYW5kcyB0aGUgZ3JhbW1hciBjYW5ub3QgcGFyc2UgYXJlIG5ldmVyIHJ1bGUtcmVzb2x2YWJsZS5cblx0XHRcdFx0WydpZiAoJHggLWVxJywgeyByZXN1bHQ6ICdub01hdGNoJywgYXV0b0FwcHJvdmVSdWxlUmVzb2x2YWJsZTogZmFsc2UgfV0sXG5cdFx0XHRdO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChjYXNlcy5tYXAoKFtjb21tYW5kTGluZV0pID0+IGFwcHJvdmVyLmV2YWx1YXRlKGNvbW1hbmRMaW5lLCBwd3NoKSksIGNhc2VzLm1hcCgoWywgZXhwZWN0ZWRdKSA9PiBleHBlY3RlZCkpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnZmFpbHMgY2xvc2VkIG9uIFBvd2VyU2hlbGwgYXNzaWdubWVudHMgYW5kIGludm9jYXRpb25zJywgKCkgPT4ge1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChbXG5cdFx0XHRcdGFwcHJvdmVyLnNob3VsZEF1dG9BcHByb3ZlKCckZW52OkdJVF9TU0hfQ09NTUFORD1cImV2aWxcIjsgZ2l0IHN0YXR1cycsIHB3c2gpLFxuXHRcdFx0XHRhcHByb3Zlci5zaG91bGRBdXRvQXBwcm92ZSgnV3JpdGUtT3V0cHV0ICgkZW52OkZPTz1cImV2aWxcIik7IEdldC1DaGlsZEl0ZW0nLCBwd3NoKSxcblx0XHRcdFx0YXBwcm92ZXIuc2hvdWxkQXV0b0FwcHJvdmUoJ0dldC1DaGlsZEl0ZW0gfCBXaGVyZS1PYmplY3QgeyAkZW52OkZPTz1cImV2aWxcIjsgJHRydWUgfScsIHB3c2gpLFxuXHRcdFx0XHRhcHByb3Zlci5zaG91bGRBdXRvQXBwcm92ZSgnR2V0LUNoaWxkSXRlbTsgW1N5c3RlbS5JTy5GaWxlXTo6RGVsZXRlKFwieFwiKScsIHB3c2gpLFxuXHRcdFx0XHRhcHByb3Zlci5zaG91bGRBdXRvQXBwcm92ZSgnR2V0LUNoaWxkSXRlbSB8IFdoZXJlLU9iamVjdCB7IFtTeXN0ZW0uSU8uRmlsZV06OkRlbGV0ZSgkXy5GdWxsTmFtZSkgfScsIHB3c2gpLFxuXHRcdFx0XHRhcHByb3Zlci5zaG91bGRBdXRvQXBwcm92ZSgnR2V0LUNoaWxkSXRlbTsgJG9iai5EZWxldGUoKScsIHB3c2gpLFxuXHRcdFx0XHRhcHByb3Zlci5zaG91bGRBdXRvQXBwcm92ZSgnW01hdGhdOjpNYXgoMSwgMikgfCBPdXQtU3RyaW5nJywgcHdzaCksXG5cdFx0XHRcdGFwcHJvdmVyLnNob3VsZEF1dG9BcHByb3ZlKGBPdXQtU3RyaW5nIC1JbnB1dE9iamVjdCAoW3NjcmlwdGJsb2NrXTo6Q3JlYXRlKCdXcml0ZS1PdXRwdXQgb2snKS5JbnZva2UoKSlgLCBwd3NoKSxcblx0XHRcdFx0Ly8gRGVsaWJlcmF0ZSBvdmVyLWJsb2NrOiBhbiBpbnZvY2F0aW9uIGluIGFuIGFyZ3VtZW50IGlzIHVzdWFsbHlcblx0XHRcdFx0Ly8gaGFybWxlc3MsIGJ1dCB0aGUgcnVsZXMgY2Fubm90IHRlbGwgYFttYXRoXTo6Um91bmRgIGZyb21cblx0XHRcdFx0Ly8gYFtTeXN0ZW0uSU8uRmlsZV06OkRlbGV0ZWAsIHNvIGJvdGggcmVxdWlyZSBjb25maXJtYXRpb24uXG5cdFx0XHRcdGFwcHJvdmVyLnNob3VsZEF1dG9BcHByb3ZlKCdXcml0ZS1PdXRwdXQgKFttYXRoXTo6Um91bmQoMS41KSknLCBwd3NoKSxcblx0XHRcdFx0Ly8gUHJvcGVydHkgYWNjZXNzIGV4ZWN1dGVzIG5vIG1ldGhvZCwgc28gaXQgc3RheXMgYXBwcm92ZWQuXG5cdFx0XHRcdGFwcHJvdmVyLnNob3VsZEF1dG9BcHByb3ZlKCcoR2V0LUNvbnRlbnQgUkVBRE1FLm1kKS5MZW5ndGgnLCBwd3NoKSxcblx0XHRcdF0sIFsnbm9NYXRjaCcsICdub01hdGNoJywgJ25vTWF0Y2gnLCAnbm9NYXRjaCcsICdub01hdGNoJywgJ25vTWF0Y2gnLCAnbm9NYXRjaCcsICdub01hdGNoJywgJ25vTWF0Y2gnLCAnYXBwcm92ZWQnXSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdleGFjdCBhbGxvdyBydWxlcyByZXF1aXJlIGEgc2FmZWx5IGFuYWx5emFibGUgY29tbWFuZCBsaW5lJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgcGFyc2VFcnJvckFsbG93ID0geyAnL15pZiBcXFxcKFxcXFwkeCAtZXEkLyc6IHsgYXBwcm92ZTogdHJ1ZSwgbWF0Y2hDb21tYW5kTGluZTogdHJ1ZSB9IH07XG5cdFx0XHRjb25zdCBwYXJzZUVycm9yRGVueSA9IHsgJy9eaWYgXFxcXChcXFxcJHggLWVxJC8nOiB7IGFwcHJvdmU6IGZhbHNlLCBtYXRjaENvbW1hbmRMaW5lOiB0cnVlIH0gfTtcblx0XHRcdGNvbnN0IGludm9jYXRpb25BbGxvdyA9IHsgJy9eV3JpdGUtT3V0cHV0IFxcXFwoXFxcXFttYXRoXFxcXF06OlJvdW5kXFxcXCgxXFxcXC41XFxcXClcXFxcKSQvJzogeyBhcHByb3ZlOiB0cnVlLCBtYXRjaENvbW1hbmRMaW5lOiB0cnVlIH0gfTtcblx0XHRcdGNvbnN0IHJlZGlyZWN0QWxsb3cgPSB7XG5cdFx0XHRcdFdyaXRlOiB0cnVlLFxuXHRcdFx0XHQnL15Xcml0ZS1Ib3N0IGhpID5vdXRcXFxcLnR4dCQvJzogeyBhcHByb3ZlOiB0cnVlLCBtYXRjaENvbW1hbmRMaW5lOiB0cnVlIH0sXG5cdFx0XHR9O1xuXHRcdFx0Y29uc3QgZGVuaWVkU3ViQ29tbWFuZCA9IHtcblx0XHRcdFx0R2V0OiB0cnVlLFxuXHRcdFx0XHRSZW1vdmU6IGZhbHNlLFxuXHRcdFx0XHQnL15HZXQtQ2hpbGRJdGVtOyBSZW1vdmUtSXRlbSB4JC8nOiB7IGFwcHJvdmU6IHRydWUsIG1hdGNoQ29tbWFuZExpbmU6IHRydWUgfSxcblx0XHRcdH07XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKFtcblx0XHRcdFx0YXBwcm92ZXIuc2hvdWxkQXV0b0FwcHJvdmUoJ2lmICgkeCAtZXEnLCB7IGxhbmd1YWdlOiAncG93ZXJzaGVsbCcsIGF1dG9BcHByb3ZlUnVsZXM6IHBhcnNlRXJyb3JBbGxvdyB9KSxcblx0XHRcdFx0YXBwcm92ZXIuc2hvdWxkQXV0b0FwcHJvdmUoJ2lmICgkeCAtZXEnLCB7IGxhbmd1YWdlOiAncG93ZXJzaGVsbCcsIGF1dG9BcHByb3ZlUnVsZXM6IHBhcnNlRXJyb3JEZW55IH0pLFxuXHRcdFx0XHRhcHByb3Zlci5zaG91bGRBdXRvQXBwcm92ZSgnV3JpdGUtT3V0cHV0IChbbWF0aF06OlJvdW5kKDEuNSkpJywgeyBsYW5ndWFnZTogJ3Bvd2Vyc2hlbGwnLCBhdXRvQXBwcm92ZVJ1bGVzOiBpbnZvY2F0aW9uQWxsb3cgfSksXG5cdFx0XHRcdGFwcHJvdmVyLnNob3VsZEF1dG9BcHByb3ZlKCdXcml0ZS1Ib3N0IGhpID5vdXQudHh0JywgeyBsYW5ndWFnZTogJ3Bvd2Vyc2hlbGwnLCBhdXRvQXBwcm92ZVJ1bGVzOiByZWRpcmVjdEFsbG93IH0pLFxuXHRcdFx0XHRhcHByb3Zlci5zaG91bGRBdXRvQXBwcm92ZSgnR2V0LUNoaWxkSXRlbTsgUmVtb3ZlLUl0ZW0geCcsIHsgbGFuZ3VhZ2U6ICdwb3dlcnNoZWxsJywgYXV0b0FwcHJvdmVSdWxlczogZGVuaWVkU3ViQ29tbWFuZCB9KSxcblx0XHRcdF0sIFsnbm9NYXRjaCcsICdkZW5pZWQnLCAnbm9N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
