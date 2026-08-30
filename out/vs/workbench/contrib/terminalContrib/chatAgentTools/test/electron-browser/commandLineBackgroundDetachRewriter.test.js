import { deepStrictEqual, strictEqual } from "assert";
import { OperatingSystem } from "../../../../../../base/common/platform.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../../../base/test/common/utils.js";
import { TestConfigurationService } from "../../../../../../platform/configuration/test/common/testConfigurationService.js";
import { workbenchInstantiationService } from "../../../../../test/browser/workbenchTestServices.js";
import { CommandLineBackgroundDetachRewriter } from "../../browser/tools/commandLineRewriter/commandLineBackgroundDetachRewriter.js";
import { TerminalChatAgentToolsSettingId } from "../../common/terminalChatAgentToolsConfiguration.js";
suite("CommandLineBackgroundDetachRewriter", () => {
  const store = ensureNoDisposablesAreLeakedInTestSuite();
  let instantiationService;
  let configurationService;
  let rewriter;
  function createOptions(command, shell, os, isBackground) {
    return {
      commandLine: command,
      cwd: void 0,
      shell,
      os,
      isBackground
    };
  }
  setup(() => {
    configurationService = new TestConfigurationService();
    configurationService.setUserConfiguration(TerminalChatAgentToolsSettingId.DetachBackgroundProcesses, true);
    instantiationService = workbenchInstantiationService({
      configurationService: () => configurationService
    }, store);
    rewriter = store.add(instantiationService.createInstance(CommandLineBackgroundDetachRewriter));
  });
  test("should return undefined for foreground commands", () => {
    strictEqual(rewriter.rewrite(createOptions("echo hello", "/bin/bash", OperatingSystem.Linux, false)), void 0);
  });
  test("should return undefined when isBackground is not set", () => {
    strictEqual(rewriter.rewrite(createOptions("echo hello", "/bin/bash", OperatingSystem.Linux)), void 0);
  });
  test("should return undefined when setting is disabled", () => {
    configurationService.setUserConfiguration(TerminalChatAgentToolsSettingId.DetachBackgroundProcesses, false);
    strictEqual(rewriter.rewrite(createOptions("python3 app.py", "/bin/bash", OperatingSystem.Linux, true)), void 0);
  });
  suite("POSIX (bash)", () => {
    test("should wrap with nohup on Linux", () => {
      deepStrictEqual(rewriter.rewrite(createOptions("python3 app.py", "/bin/bash", OperatingSystem.Linux, true)), {
        rewritten: "nohup python3 app.py & disown",
        reasoning: "Wrapped background command with nohup to survive terminal shutdown",
        forDisplay: "python3 app.py"
      });
    });
    test("should wrap with nohup on macOS", () => {
      deepStrictEqual(rewriter.rewrite(createOptions("flask run", "/bin/bash", OperatingSystem.Macintosh, true)), {
        rewritten: "nohup flask run & disown",
        reasoning: "Wrapped background command with nohup to survive terminal shutdown",
        forDisplay: "flask run"
      });
    });
    test("should not duplicate trailing & when command already backgrounds itself", () => {
      deepStrictEqual(rewriter.rewrite(createOptions("pypi-server ... &", "/bin/bash", OperatingSystem.Linux, true)), {
        rewritten: "nohup pypi-server ... & disown",
        reasoning: "Wrapped background command with nohup to survive terminal shutdown",
        forDisplay: "pypi-server ... &"
      });
    });
    test("should wrap chained commands in shell -c to preserve shell semantics", () => {
      deepStrictEqual(rewriter.rewrite(createOptions("cd /app && python3 service.py &", "/bin/bash", OperatingSystem.Linux, true)), {
        rewritten: `nohup /bin/bash -c 'cd /app && python3 service.py' & disown`,
        reasoning: "Wrapped background command with nohup to survive terminal shutdown",
        forDisplay: "cd /app && python3 service.py &"
      });
    });
    test("should trim trailing whitespace before detecting existing &", () => {
      deepStrictEqual(rewriter.rewrite(createOptions("node server.js &   ", "/bin/bash", OperatingSystem.Linux, true)), {
        rewritten: "nohup node server.js & disown",
        reasoning: "Wrapped background command with nohup to survive terminal shutdown",
        forDisplay: "node server.js &   "
      });
    });
  });
  suite("POSIX shell -c wrapping for compound commands and builtins", () => {
    test("for loop should be wrapped using bash shell path", () => {
      deepStrictEqual(rewriter.rewrite(createOptions("for i in $(seq 1 90); do echo $i; sleep 1; done", "/bin/bash", OperatingSystem.Linux, true)), {
        rewritten: `nohup /bin/bash -c 'for i in $(seq 1 90); do echo $i; sleep 1; done' & disown`,
        reasoning: "Wrapped background command with nohup to survive terminal shutdown",
        forDisplay: "for i in $(seq 1 90); do echo $i; sleep 1; done"
      });
    });
    test("while loop should be wrapped in shell -c", () => {
      deepStrictEqual(rewriter.rewrite(createOptions("while true; do sleep 1; done", "/bin/bash", OperatingSystem.Linux, true)), {
        rewritten: `nohup /bin/bash -c 'while true; do sleep 1; done' & disown`,
        reasoning: "Wrapped background command with nohup to survive terminal shutdown",
        forDisplay: "while true; do sleep 1; done"
      });
    });
    test("if statement should be wrapped in shell -c", () => {
      deepStrictEqual(rewriter.rewrite(createOptions("if [ -f file ]; then cat file; fi", "/bin/bash", OperatingSystem.Linux, true)), {
        rewritten: `nohup /bin/bash -c 'if [ -f file ]; then cat file; fi' & disown`,
        reasoning: "Wrapped background command with nohup to survive terminal shutdown",
        forDisplay: "if [ -f file ]; then cat file; fi"
      });
    });
    test("eval builtin should be wrapped in shell -c", () => {
      deepStrictEqual(rewriter.rewrite(createOptions("eval $SETUP_ENV && opam install coq --yes", "/bin/bash", OperatingSystem.Linux, true)), {
        rewritten: `nohup /bin/bash -c 'eval $SETUP_ENV && opam install coq --yes' & disown`,
        reasoning: "Wrapped background command with nohup to survive terminal shutdown",
        forDisplay: "eval $SETUP_ENV && opam install coq --yes"
      });
    });
    test("set builtin should be wrapped in shell -c", () => {
      deepStrictEqual(rewriter.rewrite(createOptions("set -e; cmd1; cmd2", "/bin/bash", OperatingSystem.Linux, true)), {
        rewritten: `nohup /bin/bash -c 'set -e; cmd1; cmd2' & disown`,
        reasoning: "Wrapped background command with nohup to survive terminal shutdown",
        forDisplay: "set -e; cmd1; cmd2"
      });
    });
    test("export builtin should be wrapped in shell -c", () => {
      deepStrictEqual(rewriter.rewrite(createOptions('export PATH="/usr/local/bin:$PATH"; myapp', "/bin/bash", OperatingSystem.Linux, true)), {
        rewritten: `nohup /bin/bash -c 'export PATH="/usr/local/bin:$PATH"; myapp' & disown`,
        reasoning: "Wrapped background command with nohup to survive terminal shutdown",
        forDisplay: 'export PATH="/usr/local/bin:$PATH"; myapp'
      });
    });
    test("dot-source builtin should be wrapped in shell -c", () => {
      deepStrictEqual(rewriter.rewrite(createOptions(". /etc/profile; myapp", "/bin/bash", OperatingSystem.Linux, true)), {
        rewritten: `nohup /bin/bash -c '. /etc/profile; myapp' & disown`,
        reasoning: "Wrapped background command with nohup to survive terminal shutdown",
        forDisplay: ". /etc/profile; myapp"
      });
    });
    test("relative path ./script should NOT be wrapped in shell -c", () => {
      deepStrictEqual(rewriter.rewrite(createOptions("./start.sh", "/bin/bash", OperatingSystem.Linux, true)), {
        rewritten: "nohup ./start.sh & disown",
        reasoning: "Wrapped background command with nohup to survive terminal shutdown",
        forDisplay: "./start.sh"
      });
    });
    test("brace group should be wrapped in shell -c", () => {
      deepStrictEqual(rewriter.rewrite(createOptions("{ cmd1; cmd2; }", "/bin/bash", OperatingSystem.Linux, true)), {
        rewritten: `nohup /bin/bash -c '{ cmd1; cmd2; }' & disown`,
        reasoning: "Wrapped background command with nohup to survive terminal shutdown",
        forDisplay: "{ cmd1; cmd2; }"
      });
    });
    test("single quotes in command should be properly escaped", () => {
      deepStrictEqual(rewriter.rewrite(createOptions(`for f in *.txt; do echo 'file:' $f; done`, "/bin/bash", OperatingSystem.Linux, true)), {
        rewritten: `nohup /bin/bash -c 'for f in *.txt; do echo '\\''file:'\\'' $f; done' & disown`,
        reasoning: "Wrapped background command with nohup to survive terminal shutdown",
        forDisplay: `for f in *.txt; do echo 'file:' $f; done`
      });
    });
    test("simple external command should NOT be wrapped in shell -c", () => {
      deepStrictEqual(rewriter.rewrite(createOptions("python3 app.py", "/bin/bash", OperatingSystem.Linux, true)), {
        rewritten: "nohup python3 app.py & disown",
        reasoning: "Wrapped background command with nohup to survive terminal shutdown",
        forDisplay: "python3 app.py"
      });
    });
  });
  suite("POSIX inline env var assignments", () => {
    test("single env var assignment before command should be wrapped in shell -c", () => {
      deepStrictEqual(rewriter.rewrite(createOptions("OPAMROOT=/root/.opam opam install menhir", "/bin/bash", OperatingSystem.Linux, true)), {
        rewritten: `nohup /bin/bash -c 'OPAMROOT=/root/.opam opam install menhir' & disown`,
        reasoning: "Wrapped background command with nohup to survive terminal shutdown",
        forDisplay: "OPAMROOT=/root/.opam opam install menhir"
      });
    });
    test("multiple env var assignments before command should be wrapped in shell -c", () => {
      deepStrictEqual(rewriter.rewrite(createOptions("OPAMROOT=/root/.opam OPAMYES=1 opam install menhir", "/bin/bash", OperatingSystem.Linux, true)), {
        rewritten: `nohup /bin/bash -c 'OPAMROOT=/root/.opam OPAMYES=1 opam install menhir' & disown`,
        reasoning: "Wrapped background command with nohup to survive terminal shutdown",
        forDisplay: "OPAMROOT=/root/.opam OPAMYES=1 opam install menhir"
      });
    });
    test("env var with quoted value should be wrapped in shell -c", () => {
      deepStrictEqual(rewriter.rewrite(createOptions('FOO="a b" cmd', "/bin/bash", OperatingSystem.Linux, true)), {
        rewritten: `nohup /bin/bash -c 'FOO="a b" cmd' & disown`,
        reasoning: "Wrapped background command with nohup to survive terminal shutdown",
        forDisplay: 'FOO="a b" cmd'
      });
    });
    test("env command should NOT trigger env var detection", () => {
      deepStrictEqual(rewriter.rewrite(createOptions("env FOO=1 cmd", "/bin/bash", OperatingSystem.Linux, true)), {
        rewritten: "nohup env FOO=1 cmd & disown",
        reasoning: "Wrapped background command with nohup to survive terminal shutdown",
        forDisplay: "env FOO=1 cmd"
      });
    });
  });
  suite("POSIX shell operator wrapping", () => {
    test("pipe should be wrapped in shell -c", () => {
      deepStrictEqual(rewriter.rewrite(createOptions("cat log.txt | grep error", "/bin/bash", OperatingSystem.Linux, true)), {
        rewritten: `nohup /bin/bash -c 'cat log.txt | grep error' & disown`,
        reasoning: "Wrapped background command with nohup to survive terminal shutdown",
        forDisplay: "cat log.txt | grep error"
      });
    });
    test("semicolon chain should be wrapped in shell -c", () => {
      deepStrictEqual(rewriter.rewrite(createOptions("cmd1; cmd2", "/bin/bash", OperatingSystem.Linux, true)), {
        rewritten: `nohup /bin/bash -c 'cmd1; cmd2' & disown`,
        reasoning: "Wrapped background command with nohup to survive terminal shutdown",
        forDisplay: "cmd1; cmd2"
      });
    });
    test("&& chain should be wrapped in shell -c", () => {
      deepStrictEqual(rewriter.rewrite(createOptions("mkdir -p /tmp/build && make", "/bin/bash", OperatingSystem.Linux, true)), {
        rewritten: `nohup /bin/bash -c 'mkdir -p /tmp/build && make' & disown`,
        reasoning: "Wrapped background command with nohup to survive terminal shutdown",
        forDisplay: "mkdir -p /tmp/build && make"
      });
    });
    test("|| chain should be wrapped in shell -c", () => {
      deepStrictEqual(rewriter.rewrite(createOptions("cmd1 || cmd2", "/bin/bash", OperatingSystem.Linux, true)), {
        rewritten: `nohup /bin/bash -c 'cmd1 || cmd2' & disown`,
        reasoning: "Wrapped background command with nohup to survive terminal shutdown",
        forDisplay: "cmd1 || cmd2"
      });
    });
    test("cd builtin should be wrapped in shell -c", () => {
      deepStrictEqual(rewriter.rewrite(createOptions("cd /app", "/bin/bash", OperatingSystem.Linux, true)), {
        rewritten: `nohup /bin/bash -c 'cd /app' & disown`,
        reasoning: "Wrapped background command with nohup to survive terminal shutdown",
        forDisplay: "cd /app"
      });
    });
    test("mid-command & (background operator) should be wrapped in shell -c", () => {
      deepStrictEqual(rewriter.rewrite(createOptions("server start & client connect", "/bin/bash", OperatingSystem.Linux, true)), {
        rewritten: `nohup /bin/bash -c 'server start & client connect' & disown`,
        reasoning: "Wrapped background command with nohup to survive terminal shutdown",
        forDisplay: "server start & client connect"
      });
    });
  });
  suite("POSIX (zsh)", () => {
    test("should wrap with nohup", () => {
      deepStrictEqual(rewriter.rewrite(createOptions("node server.js", "/bin/zsh", OperatingSystem.Linux, true)), {
        rewritten: "nohup node server.js & disown",
        reasoning: "Wrapped background command with nohup to survive terminal shutdown",
        forDisplay: "node server.js"
      });
    });
    test("for loop should be wrapped using zsh shell path", () => {
      deepStrictEqual(rewriter.rewrite(createOptions("for i in $(seq 1 10); do echo $i; done", "/bin/zsh", OperatingSystem.Linux, true)), {
        rewritten: `nohup /bin/zsh -c 'for i in $(seq 1 10); do echo $i; done' & disown`,
        reasoning: "Wrapped background command with nohup to survive terminal shutdown",
        forDisplay: "for i in $(seq 1 10); do echo $i; done"
      });
    });
  });
  suite("POSIX (fish)", () => {
    test("should wrap with nohup", () => {
      deepStrictEqual(rewriter.rewrite(createOptions("ruby app.rb", "/usr/bin/fish", OperatingSystem.Linux, true)), {
        rewritten: "nohup ruby app.rb &",
        reasoning: "Wrapped background command with nohup to survive terminal shutdown",
        forDisplay: "ruby app.rb"
      });
    });
    test("for loop should be wrapped using fish shell path with double-quote escaping", () => {
      deepStrictEqual(rewriter.rewrite(createOptions("for i in (seq 1 10); echo $i; end", "/usr/bin/fish", OperatingSystem.Linux, true)), {
        rewritten: `nohup /usr/bin/fish -c "for i in (seq 1 10); echo $i; end" &`,
        reasoning: "Wrapped background command with nohup to survive terminal shutdown",
        forDisplay: "for i in (seq 1 10); echo $i; end"
      });
    });
    test("compound command with double quotes should be escaped for fish", () => {
      deepStrictEqual(rewriter.rewrite(createOptions('for f in *.txt; echo "file: $f"; end', "/usr/bin/fish", OperatingSystem.Linux, true)), {
        rewritten: `nohup /usr/bin/fish -c "for f in *.txt; echo \\"file: $f\\"; end" &`,
        reasoning: "Wrapped background command with nohup to survive terminal shutdown",
        forDisplay: 'for f in *.txt; echo "file: $f"; end'
      });
    });
  });
  suite("Windows (PowerShell)", () => {
    test("should wrap with Start-Process for pwsh", () => {
      deepStrictEqual(rewriter.rewrite(createOptions("python app.py", "C:\\Program Files\\PowerShell\\7\\pwsh.exe", OperatingSystem.Windows, true)), {
        rewritten: 'Start-Process -WindowStyle Hidden -FilePath "C:\\Program Files\\PowerShell\\7\\pwsh.exe" -ArgumentList "-NoProfile", "-Command", "python app.py"',
        reasoning: "Wrapped background command with Start-Process to survive terminal shutdown",
        forDisplay: "python app.py"
      });
    });
    test("should wrap with Start-Process for Windows PowerShell", () => {
      deepStrictEqual(rewriter.rewrite(createOptions("node server.js", "C:\\WINDOWS\\System32\\WindowsPowerShell\\v1.0\\powershell.exe", OperatingSystem.Windows, true)), {
        rewritten: 'Start-Process -WindowStyle Hidden -FilePath "C:\\WINDOWS\\System32\\WindowsPowerShell\\v1.0\\powershell.exe" -ArgumentList "-NoProfile", "-Command", "node server.js"',
        reasoning: "Wrapped background command with Start-Process to survive terminal shutdown",
        forDisplay: "node server.js"
      });
    });
    test("should escape double quotes in PowerShell commands", () => {
      deepStrictEqual(rewriter.rewrite(createOptions('echo "hello world"', "C:\\Program Files\\PowerShell\\7\\pwsh.exe", OperatingSystem.Windows, true)), {
        rewritten: 'Start-Process -WindowStyle Hidden -FilePath "C:\\Program Files\\PowerShell\\7\\pwsh.exe" -ArgumentList "-NoProfile", "-Command", "echo \\"hello world\\""',
        reasoning: "Wrapped background command with Start-Process to survive terminal shutdown",
        forDisplay: 'echo "hello world"'
      });
    });
    test("should return undefined for non-PowerShell Windows shell", () => {
      strictEqual(rewriter.rewrite(createOptions("echo hello", "cmd.exe", OperatingSystem.Windows, true)), void 0);
    });
  });
  suite("Interactive front-end skip", () => {
    const interactives = [
      "expect setup_vm.exp",
      "gdb ./a.out",
      "lldb ./a.out",
      "passwd",
      "vim file.txt",
      "nano notes.md",
      "less /var/log/syslog",
      "sftp user@host",
      "telnet host 23",
      "psql",
      "psql mydb",
      "mysql -u root",
      "ssh user@host",
      "sudo apt-get install -y foo"
    ];
    for (const cmd of interactives) {
      test(`should skip detach-wrap for interactive: ${cmd}`, () => {
        strictEqual(rewriter.rewrite(createOptions(cmd, "/bin/bash", OperatingSystem.Linux, true)), void 0);
      });
    }
    test("should still wrap psql when -c is passed (non-interactive)", () => {
      deepStrictEqual(rewriter.rewrite(createOptions('psql -c "select 1"', "/bin/bash", OperatingSystem.Linux, true)), {
        rewritten: 'nohup psql -c "select 1" & disown',
        reasoning: "Wrapped background command with nohup to survive terminal shutdown",
        forDisplay: 'psql -c "select 1"'
      });
    });
    test("should still wrap mysql when -e is passed (non-interactive)", () => {
      deepStrictEqual(rewriter.rewrite(createOptions('mysql -e "show databases"', "/bin/bash", OperatingSystem.Linux, true)), {
        rewritten: 'nohup mysql -e "show databases" & disown',
        reasoning: "Wrapped background command with nohup to survive terminal shutdown",
        forDisplay: 'mysql -e "show databases"'
      });
    });
    test("should still wrap ssh when running a remote command (non-interactive)", () => {
      deepStrictEqual(rewriter.rewrite(createOptions("ssh -T user@host", "/bin/bash", OperatingSystem.Linux, true)), {
        rewritten: "nohup ssh -T user@host & disown",
        reasoning: "Wrapped background command with nohup to survive terminal shutdown",
        forDisplay: "ssh -T user@host"
      });
    });
    test("should still wrap sudo when -n is passed (non-interactive)", () => {
      deepStrictEqual(rewriter.rewrite(createOptions("sudo -n systemctl restart nginx", "/bin/bash", OperatingSystem.Linux, true)), {
        rewritten: "nohup sudo -n systemctl restart nginx & disown",
        reasoning: "Wrapped background command with nohup to survive terminal shutdown",
        forDisplay: "sudo -n systemctl restart nginx"
      });
    });
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXHRlcm1pbmFsQ29udHJpYlxcY2hhdEFnZW50VG9vbHNcXHRlc3RcXGVsZWN0cm9uLWJyb3dzZXJcXGNvbW1hbmRMaW5lQmFja2dyb3VuZERldGFjaFJld3JpdGVyLnRlc3QudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgeyBkZWVwU3RyaWN0RXF1YWwsIHN0cmljdEVxdWFsIH0gZnJvbSAnYXNzZXJ0JztcbmltcG9ydCB7IE9wZXJhdGluZ1N5c3RlbSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3BsYXRmb3JtLmpzJztcbmltcG9ydCB7IGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvdGVzdC9jb21tb24vdXRpbHMuanMnO1xuaW1wb3J0IHR5cGUgeyBUZXN0SW5zdGFudGlhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9pbnN0YW50aWF0aW9uL3Rlc3QvY29tbW9uL2luc3RhbnRpYXRpb25TZXJ2aWNlTW9jay5qcyc7XG5pbXBvcnQgeyBUZXN0Q29uZmlndXJhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb25maWd1cmF0aW9uL3Rlc3QvY29tbW9uL3Rlc3RDb25maWd1cmF0aW9uU2VydmljZS5qcyc7XG5pbXBvcnQgeyB3b3JrYmVuY2hJbnN0YW50aWF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3Rlc3QvYnJvd3Nlci93b3JrYmVuY2hUZXN0U2VydmljZXMuanMnO1xuaW1wb3J0IHsgQ29tbWFuZExpbmVCYWNrZ3JvdW5kRGV0YWNoUmV3cml0ZXIgfSBmcm9tICcuLi8uLi9icm93c2VyL3Rvb2xzL2NvbW1hbmRMaW5lUmV3cml0ZXIvY29tbWFuZExpbmVCYWNrZ3JvdW5kRGV0YWNoUmV3cml0ZXIuanMnO1xuaW1wb3J0IHR5cGUgeyBJQ29tbWFuZExpbmVSZXdyaXRlck9wdGlvbnMgfSBmcm9tICcuLi8uLi9icm93c2VyL3Rvb2xzL2NvbW1hbmRMaW5lUmV3cml0ZXIvY29tbWFuZExpbmVSZXdyaXRlci5qcyc7XG5pbXBvcnQgeyBUZXJtaW5hbENoYXRBZ2VudFRvb2xzU2V0dGluZ0lkIH0gZnJvbSAnLi4vLi4vY29tbW9uL3Rlcm1pbmFsQ2hhdEFnZW50VG9vbHNDb25maWd1cmF0aW9uLmpzJztcblxuc3VpdGUoJ0NvbW1hbmRMaW5lQmFja2dyb3VuZERldGFjaFJld3JpdGVyJywgKCkgPT4ge1xuXHRjb25zdCBzdG9yZSA9IGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSgpO1xuXG5cdGxldCBpbnN0YW50aWF0aW9uU2VydmljZTogVGVzdEluc3RhbnRpYXRpb25TZXJ2aWNlO1xuXHRsZXQgY29uZmlndXJhdGlvblNlcnZpY2U6IFRlc3RDb25maWd1cmF0aW9uU2VydmljZTtcblx0bGV0IHJld3JpdGVyOiBDb21tYW5kTGluZUJhY2tncm91bmREZXRhY2hSZXdyaXRlcjtcblxuXHRmdW5jdGlvbiBjcmVhdGVPcHRpb25zKGNvbW1hbmQ6IHN0cmluZywgc2hlbGw6IHN0cmluZywgb3M6IE9wZXJhdGluZ1N5c3RlbSwgaXNCYWNrZ3JvdW5kPzogYm9vbGVhbik6IElDb21tYW5kTGluZVJld3JpdGVyT3B0aW9ucyB7XG5cdFx0cmV0dXJuIHtcblx0XHRcdGNvbW1hbmRMaW5lOiBjb21tYW5kLFxuXHRcdFx0Y3dkOiB1bmRlZmluZWQsXG5cdFx0XHRzaGVsbCxcblx0XHRcdG9zLFxuXHRcdFx0aXNCYWNrZ3JvdW5kLFxuXHRcdH07XG5cdH1cblxuXHRzZXR1cCgoKSA9PiB7XG5cdFx0Y29uZmlndXJhdGlvblNlcnZpY2UgPSBuZXcgVGVzdENvbmZpZ3VyYXRpb25TZXJ2aWNlKCk7XG5cdFx0Y29uZmlndXJhdGlvblNlcnZpY2Uuc2V0VXNlckNvbmZpZ3VyYXRpb24oVGVybWluYWxDaGF0QWdlbnRUb29sc1NldHRpbmdJZC5EZXRhY2hCYWNrZ3JvdW5kUHJvY2Vzc2VzLCB0cnVlKTtcblx0XHRpbnN0YW50aWF0aW9uU2VydmljZSA9IHdvcmtiZW5jaEluc3RhbnRpYXRpb25TZXJ2aWNlKHtcblx0XHRcdGNvbmZpZ3VyYXRpb25TZXJ2aWNlOiAoKSA9PiBjb25maWd1cmF0aW9uU2VydmljZVxuXHRcdH0sIHN0b3JlKTtcblx0XHRyZXdyaXRlciA9IHN0b3JlLmFkZChpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShDb21tYW5kTGluZUJhY2tncm91bmREZXRhY2hSZXdyaXRlcikpO1xuXHR9KTtcblxuXHR0ZXN0KCdzaG91bGQgcmV0dXJuIHVuZGVmaW5lZCBmb3IgZm9yZWdyb3VuZCBjb21tYW5kcycsICgpID0+IHtcblx0XHRzdHJpY3RFcXVhbChyZXdyaXRlci5yZXdyaXRlKGNyZWF0ZU9wdGlvbnMoJ2VjaG8gaGVsbG8nLCAnL2Jpbi9iYXNoJywgT3BlcmF0aW5nU3lzdGVtLkxpbnV4LCBmYWxzZSkpLCB1bmRlZmluZWQpO1xuXHR9KTtcblxuXHR0ZXN0KCdzaG91bGQgcmV0dXJuIHVuZGVmaW5lZCB3aGVuIGlzQmFja2dyb3VuZCBpcyBub3Qgc2V0JywgKCkgPT4ge1xuXHRcdHN0cmljdEVxdWFsKHJld3JpdGVyLnJld3JpdGUoY3JlYXRlT3B0aW9ucygnZWNobyBoZWxsbycsICcvYmluL2Jhc2gnLCBPcGVyYXRpbmdTeXN0ZW0uTGludXgpKSwgdW5kZWZpbmVkKTtcblx0fSk7XG5cblx0dGVzdCgnc2hvdWxkIHJldHVybiB1bmRlZmluZWQgd2hlbiBzZXR0aW5nIGlzIGRpc2FibGVkJywgKCkgPT4ge1xuXHRcdGNvbmZpZ3VyYXRpb25TZXJ2aWNlLnNldFVzZXJDb25maWd1cmF0aW9uKFRlcm1pbmFsQ2hhdEFnZW50VG9vbHNTZXR0aW5nSWQuRGV0YWNoQmFja2dyb3VuZFByb2Nlc3NlcywgZmFsc2UpO1xuXHRcdHN0cmljdEVxdWFsKHJld3JpdGVyLnJld3JpdGUoY3JlYXRlT3B0aW9ucygncHl0aG9uMyBhcHAucHknLCAnL2Jpbi9iYXNoJywgT3BlcmF0aW5nU3lzdGVtLkxpbnV4LCB0cnVlKSksIHVuZGVmaW5lZCk7XG5cdH0pO1xuXG5cdHN1aXRlKCdQT1NJWCAoYmFzaCknLCAoKSA9PiB7XG5cdFx0dGVzdCgnc2hvdWxkIHdyYXAgd2l0aCBub2h1cCBvbiBMaW51eCcsICgpID0+IHtcblx0XHRcdGRlZXBTdHJpY3RFcXVhbChyZXdyaXRlci5yZXdyaXRlKGNyZWF0ZU9wdGlvbnMoJ3B5dGhvbjMgYXBwLnB5JywgJy9iaW4vYmFzaCcsIE9wZXJhdGluZ1N5c3RlbS5MaW51eCwgdHJ1ZSkpLCB7XG5cdFx0XHRcdHJld3JpdHRlbjogJ25vaHVwIHB5dGhvbjMgYXBwLnB5ICYgZGlzb3duJyxcblx0XHRcdFx0cmVhc29uaW5nOiAnV3JhcHBlZCBiYWNrZ3JvdW5kIGNvbW1hbmQgd2l0aCBub2h1cCB0byBzdXJ2aXZlIHRlcm1pbmFsIHNodXRkb3duJyxcblx0XHRcdFx0Zm9yRGlzcGxheTogJ3B5dGhvbjMgYXBwLnB5Jyxcblx0XHRcdH0pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnc2hvdWxkIHdyYXAgd2l0aCBub2h1cCBvbiBtYWNPUycsICgpID0+IHtcblx0XHRcdGRlZXBTdHJpY3RFcXVhbChyZXdyaXRlci5yZXdyaXRlKGNyZWF0ZU9wdGlvbnMoJ2ZsYXNrIHJ1bicsICcvYmluL2Jhc2gnLCBPcGVyYXRpbmdTeXN0ZW0uTWFjaW50b3NoLCB0cnVlKSksIHtcblx0XHRcdFx0cmV3cml0dGVuOiAnbm9odXAgZmxhc2sgcnVuICYgZGlzb3duJyxcblx0XHRcdFx0cmVhc29uaW5nOiAnV3JhcHBlZCBiYWNrZ3JvdW5kIGNvbW1hbmQgd2l0aCBub2h1cCB0byBzdXJ2aXZlIHRlcm1pbmFsIHNodXRkb3duJyxcblx0XHRcdFx0Zm9yRGlzcGxheTogJ2ZsYXNrIHJ1bicsXG5cdFx0XHR9KTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3Nob3VsZCBub3QgZHVwbGljYXRlIHRyYWlsaW5nICYgd2hlbiBjb21tYW5kIGFscmVhZHkgYmFja2dyb3VuZHMgaXRzZWxmJywgKCkgPT4ge1xuXHRcdFx0ZGVlcFN0cmljdEVxdWFsKHJld3JpdGVyLnJld3JpdGUoY3JlYXRlT3B0aW9ucygncHlwaS1zZXJ2ZXIgLi4uICYnLCAnL2Jpbi9iYXNoJywgT3BlcmF0aW5nU3lzdGVtLkxpbnV4LCB0cnVlKSksIHtcblx0XHRcdFx0cmV3cml0dGVuOiAnbm9odXAgcHlwaS1zZXJ2ZXIgLi4uICYgZGlzb3duJyxcblx0XHRcdFx0cmVhc29uaW5nOiAnV3JhcHBlZCBiYWNrZ3JvdW5kIGNvbW1hbmQgd2l0aCBub2h1cCB0byBzdXJ2aXZlIHRlcm1pbmFsIHNodXRkb3duJyxcblx0XHRcdFx0Zm9yRGlzcGxheTogJ3B5cGktc2VydmVyIC4uLiAmJyxcblx0XHRcdH0pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnc2hvdWxkIHdyYXAgY2hhaW5lZCBjb21tYW5kcyBpbiBzaGVsbCAtYyB0byBwcmVzZXJ2ZSBzaGVsbCBzZW1hbnRpY3MnLCAoKSA9PiB7XG5cdFx0XHRkZWVwU3RyaWN0RXF1YWwocmV3cml0ZXIucmV3cml0ZShjcmVhdGVPcHRpb25zKCdjZCAvYXBwICYmIHB5dGhvbjMgc2VydmljZS5weSAmJywgJy9iaW4vYmFzaCcsIE9wZXJhdGluZ1N5c3RlbS5MaW51eCwgdHJ1ZSkpLCB7XG5cdFx0XHRcdHJld3JpdHRlbjogYG5vaHVwIC9iaW4vYmFzaCAtYyAnY2QgL2FwcCAmJiBweXRob24zIHNlcnZpY2UucHknICYgZGlzb3duYCxcblx0XHRcdFx0cmVhc29uaW5nOiAnV3JhcHBlZCBiYWNrZ3JvdW5kIGNvbW1hbmQgd2l0aCBub2h1cCB0byBzdXJ2aXZlIHRlcm1pbmFsIHNodXRkb3duJyxcblx0XHRcdFx0Zm9yRGlzcGxheTogJ2NkIC9hcHAgJiYgcHl0aG9uMyBzZXJ2aWNlLnB5ICYnLFxuXHRcdFx0fSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdzaG91bGQgdHJpbSB0cmFpbGluZyB3aGl0ZXNwYWNlIGJlZm9yZSBkZXRlY3RpbmcgZXhpc3RpbmcgJicsICgpID0+IHtcblx0XHRcdGRlZXBTdHJpY3RFcXVhbChyZXdyaXRlci5yZXdyaXRlKGNyZWF0ZU9wdGlvbnMoJ25vZGUgc2VydmVyLmpzICYgICAnLCAnL2Jpbi9iYXNoJywgT3BlcmF0aW5nU3lzdGVtLkxpbnV4LCB0cnVlKSksIHtcblx0XHRcdFx0cmV3cml0dGVuOiAnbm9odXAgbm9kZSBzZXJ2ZXIuanMgJiBkaXNvd24nLFxuXHRcdFx0XHRyZWFzb25pbmc6ICdXcmFwcGVkIGJhY2tncm91bmQgY29tbWFuZCB3aXRoIG5vaHVwIHRvIHN1cnZpdmUgdGVybWluYWwgc2h1dGRvd24nLFxuXHRcdFx0XHRmb3JEaXNwbGF5OiAnbm9kZSBzZXJ2ZXIuanMgJiAgICcsXG5cdFx0XHR9KTtcblx0XHR9KTtcblx0fSk7XG5cblx0c3VpdGUoJ1BPU0lYIHNoZWxsIC1jIHdyYXBwaW5nIGZvciBjb21wb3VuZCBjb21tYW5kcyBhbmQgYnVpbHRpbnMnLCAoKSA9PiB7XG5cdFx0dGVzdCgnZm9yIGxvb3Agc2hvdWxkIGJlIHdyYXBwZWQgdXNpbmcgYmFzaCBzaGVsbCBwYXRoJywgKCkgPT4ge1xuXHRcdFx0ZGVlcFN0cmljdEVxdWFsKHJld3JpdGVyLnJld3JpdGUoY3JlYXRlT3B0aW9ucygnZm9yIGkgaW4gJChzZXEgMSA5MCk7IGRvIGVjaG8gJGk7IHNsZWVwIDE7IGRvbmUnLCAnL2Jpbi9iYXNoJywgT3BlcmF0aW5nU3lzdGVtLkxpbnV4LCB0cnVlKSksIHtcblx0XHRcdFx0cmV3cml0dGVuOiBgbm9odXAgL2Jpbi9iYXNoIC1jICdmb3IgaSBpbiAkKHNlcSAxIDkwKTsgZG8gZWNobyAkaTsgc2xlZXAgMTsgZG9uZScgJiBkaXNvd25gLFxuXHRcdFx0XHRyZWFzb25pbmc6ICdXcmFwcGVkIGJhY2tncm91bmQgY29tbWFuZCB3aXRoIG5vaHVwIHRvIHN1cnZpdmUgdGVybWluYWwgc2h1dGRvd24nLFxuXHRcdFx0XHRmb3JEaXNwbGF5OiAnZm9yIGkgaW4gJChzZXEgMSA5MCk7IGRvIGVjaG8gJGk7IHNsZWVwIDE7IGRvbmUnLFxuXHRcdFx0fSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCd3aGlsZSBsb29wIHNob3VsZCBiZSB3cmFwcGVkIGluIHNoZWxsIC1jJywgKCkgPT4ge1xuXHRcdFx0ZGVlcFN0cmljdEVxdWFsKHJld3JpdGVyLnJld3JpdGUoY3JlYXRlT3B0aW9ucygnd2hpbGUgdHJ1ZTsgZG8gc2xlZXAgMTsgZG9uZScsICcvYmluL2Jhc2gnLCBPcGVyYXRpbmdTeXN0ZW0uTGludXgsIHRydWUpKSwge1xuXHRcdFx0XHRyZXdyaXR0ZW46IGBub2h1cCAvYmluL2Jhc2ggLWMgJ3doaWxlIHRydWU7IGRvIHNsZWVwIDE7IGRvbmUnICYgZGlzb3duYCxcblx0XHRcdFx0cmVhc29uaW5nOiAnV3JhcHBlZCBiYWNrZ3JvdW5kIGNvbW1hbmQgd2l0aCBub2h1cCB0byBzdXJ2aXZlIHRlcm1pbmFsIHNodXRkb3duJyxcblx0XHRcdFx0Zm9yRGlzcGxheTogJ3doaWxlIHRydWU7IGRvIHNsZWVwIDE7IGRvbmUnLFxuXHRcdFx0fSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdpZiBzdGF0ZW1lbnQgc2hvdWxkIGJlIHdyYXBwZWQgaW4gc2hlbGwgLWMnLCAoKSA9PiB7XG5cdFx0XHRkZWVwU3RyaWN0RXF1YWwocmV3cml0ZXIucmV3cml0ZShjcmVhdGVPcHRpb25zKCdpZiBbIC1mIGZpbGUgXTsgdGhlbiBjYXQgZmlsZTsgZmknLCAnL2Jpbi9iYXNoJywgT3BlcmF0aW5nU3lzdGVtLkxpbnV4LCB0cnVlKSksIHtcblx0XHRcdFx0cmV3cml0dGVuOiBgbm9odXAgL2Jpbi9iYXNoIC1jICdpZiBbIC1mIGZpbGUgXTsgdGhlbiBjYXQgZmlsZTsgZmknICYgZGlzb3duYCxcblx0XHRcdFx0cmVhc29uaW5nOiAnV3JhcHBlZCBiYWNrZ3JvdW5kIGNvbW1hbmQgd2l0aCBub2h1cCB0byBzdXJ2aXZlIHRlcm1pbmFsIHNodXRkb3duJyxcblx0XHRcdFx0Zm9yRGlzcGxheTogJ2lmIFsgLWYgZmlsZSBdOyB0aGVuIGNhdCBmaWxlOyBmaScsXG5cdFx0XHR9KTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2V2YWwgYnVpbHRpbiBzaG91bGQgYmUgd3JhcHBlZCBpbiBzaGVsbCAtYycsICgpID0+IHtcblx0XHRcdGRlZXBTdHJpY3RFcXVhbChyZXdyaXRlci5yZXdyaXRlKGNyZWF0ZU9wdGlvbnMoJ2V2YWwgJFNFVFVQX0VOViAmJiBvcGFtIGluc3RhbGwgY29xIC0teWVzJywgJy9iaW4vYmFzaCcsIE9wZXJhdGluZ1N5c3RlbS5MaW51eCwgdHJ1ZSkpLCB7XG5cdFx0XHRcdHJld3JpdHRlbjogYG5vaHVwIC9iaW4vYmFzaCAtYyAnZXZhbCAkU0VUVVBfRU5WICYmIG9wYW0gaW5zdGFsbCBjb3EgLS15ZXMnICYgZGlzb3duYCxcblx0XHRcdFx0cmVhc29uaW5nOiAnV3JhcHBlZCBiYWNrZ3JvdW5kIGNvbW1hbmQgd2l0aCBub2h1cCB0byBzdXJ2aXZlIHRlcm1pbmFsIHNodXRkb3duJyxcblx0XHRcdFx0Zm9yRGlzcGxheTogJ2V2YWwgJFNFVFVQX0VOViAmJiBvcGFtIGluc3RhbGwgY29xIC0teWVzJyxcblx0XHRcdH0pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnc2V0IGJ1aWx0aW4gc2hvdWxkIGJlIHdyYXBwZWQgaW4gc2hlbGwgLWMnLCAoKSA9PiB7XG5cdFx0XHRkZWVwU3RyaWN0RXF1YWwocmV3cml0ZXIucmV3cml0ZShjcmVhdGVPcHRpb25zKCdzZXQgLWU7IGNtZDE7IGNtZDInLCAnL2Jpbi9iYXNoJywgT3BlcmF0aW5nU3lzdGVtLkxpbnV4LCB0cnVlKSksIHtcblx0XHRcdFx0cmV3cml0dGVuOiBgbm9odXAgL2Jpbi9iYXNoIC1jICdzZXQgLWU7IGNtZDE7IGNtZDInICYgZGlzb3duYCxcblx0XHRcdFx0cmVhc29uaW5nOiAnV3JhcHBlZCBiYWNrZ3JvdW5kIGNvbW1hbmQgd2l0aCBub2h1cCB0byBzdXJ2aXZlIHRlcm1pbmFsIHNodXRkb3duJyxcblx0XHRcdFx0Zm9yRGlzcGxheTogJ3NldCAtZTsgY21kMTsgY21kMicsXG5cdFx0XHR9KTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2V4cG9ydCBidWlsdGluIHNob3VsZCBiZSB3cmFwcGVkIGluIHNoZWxsIC1jJywgKCkgPT4ge1xuXHRcdFx0ZGVlcFN0cmljdEVxdWFsKHJld3JpdGVyLnJld3JpdGUoY3JlYXRlT3B0aW9ucygnZXhwb3J0IFBBVEg9XCIvdXNyL2xvY2FsL2JpbjokUEFUSFwiOyBteWFwcCcsICcvYmluL2Jhc2gnLCBPcGVyYXRpbmdTeXN0ZW0uTGludXgsIHRydWUpKSwge1xuXHRcdFx0XHRyZXdyaXR0ZW46IGBub2h1cCAvYmluL2Jhc2ggLWMgJ2V4cG9ydCBQQVRIPVwiL3Vzci9sb2NhbC9iaW46JFBBVEhcIjsgbXlhcHAnICYgZGlzb3duYCxcblx0XHRcdFx0cmVhc29uaW5nOiAnV3JhcHBlZCBiYWNrZ3JvdW5kIGNvbW1hbmQgd2l0aCBub2h1cCB0byBzdXJ2aXZlIHRlcm1pbmFsIHNodXRkb3duJyxcblx0XHRcdFx0Zm9yRGlzcGxheTogJ2V4cG9ydCBQQVRIPVwiL3Vzci9sb2NhbC9iaW46JFBBVEhcIjsgbXlhcHAnLFxuXHRcdFx0fSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdkb3Qtc291cmNlIGJ1aWx0aW4gc2hvdWxkIGJlIHdyYXBwZWQgaW4gc2hlbGwgLWMnLCAoKSA9PiB7XG5cdFx0XHRkZWVwU3RyaWN0RXF1YWwocmV3cml0ZXIucmV3cml0ZShjcmVhdGVPcHRpb25zKCcuIC9ldGMvcHJvZmlsZTsgbXlhcHAnLCAnL2Jpbi9iYXNoJywgT3BlcmF0aW5nU3lzdGVtLkxpbnV4LCB0cnVlKSksIHtcblx0XHRcdFx0cmV3cml0dGVuOiBgbm9odXAgL2Jpbi9iYXNoIC1jICcuIC9ldGMvcHJvZmlsZTsgbXlhcHAnICYgZGlzb3duYCxcblx0XHRcdFx0cmVhc29uaW5nOiAnV3JhcHBlZCBiYWNrZ3JvdW5kIGNvbW1hbmQgd2l0aCBub2h1cCB0byBzdXJ2aXZlIHRlcm1pbmFsIHNodXRkb3duJyxcblx0XHRcdFx0Zm9yRGlzcGxheTogJy4gL2V0Yy9wcm9maWxlOyBteWFwcCcsXG5cdFx0XHR9KTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3JlbGF0aXZlIHBhdGggLi9zY3JpcHQgc2hvdWxkIE5PVCBiZSB3cmFwcGVkIGluIHNoZWxsIC1jJywgKCkgPT4ge1xuXHRcdFx0ZGVlcFN0cmljdEVxdWFsKHJld3JpdGVyLnJld3JpdGUoY3JlYXRlT3B0aW9ucygnLi9zdGFydC5zaCcsICcvYmluL2Jhc2gnLCBPcGVyYXRpbmdTeXN0ZW0uTGludXgsIHRydWUpKSwge1xuXHRcdFx0XHRyZXdyaXR0ZW46ICdub2h1cCAuL3N0YXJ0LnNoICYgZGlzb3duJyxcblx0XHRcdFx0cmVhc29uaW5nOiAnV3JhcHBlZCBiYWNrZ3JvdW5kIGNvbW1hbmQgd2l0aCBub2h1cCB0byBzdXJ2aXZlIHRlcm1pbmFsIHNodXRkb3duJyxcblx0XHRcdFx0Zm9yRGlzcGxheTogJy4vc3RhcnQuc2gnLFxuXHRcdFx0fSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdicmFjZSBncm91cCBzaG91bGQgYmUgd3JhcHBlZCBpbiBzaGVsbCAtYycsICgpID0+IHtcblx0XHRcdGRlZXBTdHJpY3RFcXVhbChyZXdyaXRlci5yZXdyaXRlKGNyZWF0ZU9wdGlvbnMoJ3sgY21kMTsgY21kMjsgfScsICcvYmluL2Jhc2gnLCBPcGVyYXRpbmdTeXN0ZW0uTGludXgsIHRydWUpKSwge1xuXHRcdFx0XHRyZXdyaXR0ZW46IGBub2h1cCAvYmluL2Jhc2ggLWMgJ3sgY21kMTsgY21kMjsgfScgJiBkaXNvd25gLFxuXHRcdFx0XHRyZWFzb25pbmc6ICdXcmFwcGVkIGJhY2tncm91bmQgY29tbWFuZCB3aXRoIG5vaHVwIHRvIHN1cnZpdmUgdGVybWluYWwgc2h1dGRvd24nLFxuXHRcdFx0XHRmb3JEaXNwbGF5OiAneyBjbWQxOyBjbWQyOyB9Jyxcblx0XHRcdH0pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnc2luZ2xlIHF1b3RlcyBpbiBjb21tYW5kIHNob3VsZCBiZSBwcm9wZXJseSBlc2NhcGVkJywgKCkgPT4ge1xuXHRcdFx0ZGVlcFN0cmljdEVxdWFsKHJld3JpdGVyLnJld3JpdGUoY3JlYXRlT3B0aW9ucyhgZm9yIGYgaW4gKi50eHQ7IGRvIGVjaG8gJ2ZpbGU6JyAkZjsgZG9uZWAsICcvYmluL2Jhc2gnLCBPcGVyYXRpbmdTeXN0ZW0uTGludXgsIHRydWUpKSwge1xuXHRcdFx0XHRyZXdyaXR0ZW46IGBub2h1cCAvYmluL2Jhc2ggLWMgJ2ZvciBmIGluICoudHh0OyBkbyBlY2hvICdcXFxcJydmaWxlOidcXFxcJycgJGY7IGRvbmUnICYgZGlzb3duYCxcblx0XHRcdFx0cmVhc29uaW5nOiAnV3JhcHBlZCBiYWNrZ3JvdW5kIGNvbW1hbmQgd2l0aCBub2h1cCB0byBzdXJ2aXZlIHRlcm1pbmFsIHNodXRkb3duJyxcblx0XHRcdFx0Zm9yRGlzcGxheTogYGZvciBmIGluICoudHh0OyBkbyBlY2hvICdmaWxlOicgJGY7IGRvbmVgLFxuXHRcdFx0fSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdzaW1wbGUgZXh0ZXJuYWwgY29tbWFuZCBzaG91bGQgTk9UIGJlIHdyYXBwZWQgaW4gc2hlbGwgLWMnLCAoKSA9PiB7XG5cdFx0XHRkZWVwU3RyaWN0RXF1YWwocmV3cml0ZXIucmV3cml0ZShjcmVhdGVPcHRpb25zKCdweXRob24zIGFwcC5weScsICcvYmluL2Jhc2gnLCBPcGVyYXRpbmdTeXN0ZW0uTGludXgsIHRydWUpKSwge1xuXHRcdFx0XHRyZXdyaXR0ZW46ICdub2h1cCBweXRob24zIGFwcC5weSAmIGRpc293bicsXG5cdFx0XHRcdHJlYXNvbmluZzogJ1dyYXBwZWQgYmFja2dyb3VuZCBjb21tYW5kIHdpdGggbm9odXAgdG8gc3Vydml2ZSB0ZXJtaW5hbCBzaHV0ZG93bicsXG5cdFx0XHRcdGZvckRpc3BsYXk6ICdweXRob24zIGFwcC5weScsXG5cdFx0XHR9KTtcblx0XHR9KTtcblx0fSk7XG5cblx0c3VpdGUoJ1BPU0lYIGlubGluZSBlbnYgdmFyIGFzc2lnbm1lbnRzJywgKCkgPT4ge1xuXHRcdHRlc3QoJ3NpbmdsZSBlbnYgdmFyIGFzc2lnbm1lbnQgYmVmb3JlIGNvbW1hbmQgc2hvdWxkIGJlIHdyYXBwZWQgaW4gc2hlbGwgLWMnLCAoKSA9PiB7XG5cdFx0XHRkZWVwU3RyaWN0RXF1YWwocmV3cml0ZXIucmV3cml0ZShjcmVhdGVPcHRpb25zKCdPUEFNUk9PVD0vcm9vdC8ub3BhbSBvcGFtIGluc3RhbGwgbWVuaGlyJywgJy9iaW4vYmFzaCcsIE9wZXJhdGluZ1N5c3RlbS5MaW51eCwgdHJ1ZSkpLCB7XG5cdFx0XHRcdHJld3JpdHRlbjogYG5vaHVwIC9iaW4vYmFzaCAtYyAnT1BBTVJPT1Q9L3Jvb3QvLm9wYW0gb3BhbSBpbnN0YWxsIG1lbmhpcicgJiBkaXNvd25gLFxuXHRcdFx0XHRyZWFzb25pbmc6ICdXcmFwcGVkIGJhY2tncm91bmQgY29tbWFuZCB3aXRoIG5vaHVwIHRvIHN1cnZpdmUgdGVybWluYWwgc2h1dGRvd24nLFxuXHRcdFx0XHRmb3JEaXNwbGF5OiAnT1BBTVJPT1Q9L3Jvb3QvLm9wYW0gb3BhbSBpbnN0YWxsIG1lbmhpcicsXG5cdFx0XHR9KTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ211bHRpcGxlIGVudiB2YXIgYXNzaWdubWVudHMgYmVmb3JlIGNvbW1hbmQgc2hvdWxkIGJlIHdyYXBwZWQgaW4gc2hlbGwgLWMnLCAoKSA9PiB7XG5cdFx0XHRkZWVwU3RyaWN0RXF1YWwocmV3cml0ZXIucmV3cml0ZShjcmVhdGVPcHRpb25zKCdPUEFNUk9PVD0vcm9vdC8ub3BhbSBPUEFNWUVTPTEgb3BhbSBpbnN0YWxsIG1lbmhpcicsICcvYmluL2Jhc2gnLCBPcGVyYXRpbmdTeXN0ZW0uTGludXgsIHRydWUpKSwge1xuXHRcdFx0XHRyZXdyaXR0ZW46IGBub2h1cCAvYmluL2Jhc2ggLWMgJ09QQU1ST09UPS9yb290Ly5vcGFtIE9QQU1ZRVM9MSBvcGFtIGluc3RhbGwgbWVuaGlyJyAmIGRpc293bmAsXG5cdFx0XHRcdHJlYXNvbmluZzogJ1dyYXBwZWQgYmFja2dyb3VuZCBjb21tYW5kIHdpdGggbm9odXAgdG8gc3Vydml2ZSB0ZXJtaW5hbCBzaHV0ZG93bicsXG5cdFx0XHRcdGZvckRpc3BsYXk6ICdPUEFNUk9PVD0vcm9vdC8ub3BhbSBPUEFNWUVTPTEgb3BhbSBpbnN0YWxsIG1lbmhpcicsXG5cdFx0XHR9KTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2VudiB2YXIgd2l0aCBxdW90ZWQgdmFsdWUgc2hvdWxkIGJlIHdyYXBwZWQgaW4gc2hlbGwgLWMnLCAoKSA9PiB7XG5cdFx0XHRkZWVwU3RyaWN0RXF1YWwocmV3cml0ZXIucmV3cml0ZShjcmVhdGVPcHRpb25zKCdGT089XCJhIGJcIiBjbWQnLCAnL2Jpbi9iYXNoJywgT3BlcmF0aW5nU3lzdGVtLkxpbnV4LCB0cnVlKSksIHtcblx0XHRcdFx0cmV3cml0dGVuOiBgbm9odXAgL2Jpbi9iYXNoIC1jICdGT089XCJhIGJcIiBjbWQnICYgZGlzb3duYCxcblx0XHRcdFx0cmVhc29uaW5nOiAnV3JhcHBlZCBiYWNrZ3JvdW5kIGNvbW1hbmQgd2l0aCBub2h1cCB0byBzdXJ2aXZlIHRlcm1pbmFsIHNodXRkb3duJyxcblx0XHRcdFx0Zm9yRGlzcGxheTogJ0ZPTz1cImEgYlwiIGNtZCcsXG5cdFx0XHR9KTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2VudiBjb21tYW5kIHNob3VsZCBOT1QgdHJpZ2dlciBlbnYgdmFyIGRldGVjdGlvbicsICgpID0+IHtcblx0XHRcdGRlZXBTdHJpY3RFcXVhbChyZXdyaXRlci5yZXdyaXRlKGNyZWF0ZU9wdGlvbnMoJ2VudiBGT089MSBjbWQnLCAnL2Jpbi9iYXNoJywgT3BlcmF0aW5nU3lzdGVtLkxpbnV4LCB0cnVlKSksIHtcblx0XHRcdFx0cmV3cml0dGVuOiAnbm9odXAgZW52IEZPTz0xIGNtZCAmIGRpc293bicsXG5cdFx0XHRcdHJlYXNvbmluZzogJ1dyYXBwZWQgYmFja2dyb3VuZCBjb21tYW5kIHdpdGggbm9odXAgdG8gc3Vydml2ZSB0ZXJtaW5hbCBzaHV0ZG93bicsXG5cdFx0XHRcdGZvckRpc3BsYXk6ICdlbnYgRk9PPTEgY21kJyxcblx0XHRcdH0pO1xuXHRcdH0pO1xuXHR9KTtcblxuXHRzdWl0ZSgnUE9TSVggc2hlbGwgb3BlcmF0b3Igd3JhcHBpbmcnLCAoKSA9PiB7XG5cdFx0dGVzdCgncGlwZSBzaG91bGQgYmUgd3JhcHBlZCBpbiBzaGVsbCAtYycsICgpID0+IHtcblx0XHRcdGRlZXBTdHJpY3RFcXVhbChyZXdyaXRlci5yZXdyaXRlKGNyZWF0ZU9wdGlvbnMoJ2NhdCBsb2cudHh0IHwgZ3JlcCBlcnJvcicsICcvYmluL2Jhc2gnLCBPcGVyYXRpbmdTeXN0ZW0uTGludXgsIHRydWUpKSwge1xuXHRcdFx0XHRyZXdyaXR0ZW46IGBub2h1cCAvYmluL2Jhc2ggLWMgJ2NhdCBsb2cudHh0IHwgZ3JlcCBlcnJvcicgJiBkaXNvd25gLFxuXHRcdFx0XHRyZWFzb25pbmc6ICdXcmFwcGVkIGJhY2tncm91bmQgY29tbWFuZCB3aXRoIG5vaHVwIHRvIHN1cnZpdmUgdGVybWluYWwgc2h1dGRvd24nLFxuXHRcdFx0XHRmb3JEaXNwbGF5OiAnY2F0IGxvZy50eHQgfCBncmVwIGVycm9yJyxcblx0XHRcdH0pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnc2VtaWNvbG9uIGNoYWluIHNob3VsZCBiZSB3cmFwcGVkIGluIHNoZWxsIC1jJywgKCkgPT4ge1xuXHRcdFx0ZGVlcFN0cmljdEVxdWFsKHJld3JpdGVyLnJld3JpdGUoY3JlYXRlT3B0aW9ucygnY21kMTsgY21kMicsICcvYmluL2Jhc2gnLCBPcGVyYXRpbmdTeXN0ZW0uTGludXgsIHRydWUpKSwge1xuXHRcdFx0XHRyZXdyaXR0ZW46IGBub2h1cCAvYmluL2Jhc2ggLWMgJ2NtZDE7IGNtZDInICYgZGlzb3duYCxcblx0XHRcdFx0cmVhc29uaW5nOiAnV3JhcHBlZCBiYWNrZ3JvdW5kIGNvbW1hbmQgd2l0aCBub2h1cCB0byBzdXJ2aXZlIHRlcm1pbmFsIHNodXRkb3duJyxcblx0XHRcdFx0Zm9yRGlzcGxheTogJ2NtZDE7IGNtZDInLFxuXHRcdFx0fSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCcmJiBjaGFpbiBzaG91bGQgYmUgd3JhcHBlZCBpbiBzaGVsbCAtYycsICgpID0+IHtcblx0XHRcdGRlZXBTdHJpY3RFcXVhbChyZXdyaXRlci5yZXdyaXRlKGNyZWF0ZU9wdGlvbnMoJ21rZGlyIC1wIC90bXAvYnVpbGQgJiYgbWFrZScsICcvYmluL2Jhc2gnLCBPcGVyYXRpbmdTeXN0ZW0uTGludXgsIHRydWUpKSwge1xuXHRcdFx0XHRyZXdyaXR0ZW46IGBub2h1cCAvYmluL2Jhc2ggLWMgJ21rZGlyIC1wIC90bXAvYnVpbGQgJiYgbWFrZScgJiBkaXNvd25gLFxuXHRcdFx0XHRyZWFzb25pbmc6ICdXcmFwcGVkIGJhY2tncm91bmQgY29tbWFuZCB3aXRoIG5vaHVwIHRvIHN1cnZpdmUgdGVybWluYWwgc2h1dGRvd24nLFxuXHRcdFx0XHRmb3JEaXNwbGF5OiAnbWtkaXIgLXAgL3RtcC9idWlsZCAmJiBtYWtlJyxcblx0XHRcdH0pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnfHwgY2hhaW4gc2hvdWxkIGJlIHdyYXBwZWQgaW4gc2hlbGwgLWMnLCAoKSA9PiB7XG5cdFx0XHRkZWVwU3RyaWN0RXF1YWwocmV3cml0ZXIucmV3cml0ZShjcmVhdGVPcHRpb25zKCdjbWQxIHx8IGNtZDInLCAnL2Jpbi9iYXNoJywgT3BlcmF0aW5nU3lzdGVtLkxpbnV4LCB0cnVlKSksIHtcblx0XHRcdFx0cmV3cml0dGVuOiBgbm9odXAgL2Jpbi9iYXNoIC1jICdjbWQxIHx8IGNtZDInICYgZGlzb3duYCxcblx0XHRcdFx0cmVhc29uaW5nOiAnV3JhcHBlZCBiYWNrZ3JvdW5kIGNvbW1hbmQgd2l0aCBub2h1cCB0byBzdXJ2aXZlIHRlcm1pbmFsIHNodXRkb3duJyxcblx0XHRcdFx0Zm9yRGlzcGxheTogJ2NtZDEgfHwgY21kMicsXG5cdFx0XHR9KTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2NkIGJ1aWx0aW4gc2hvdWxkIGJlIHdyYXBwZWQgaW4gc2hlbGwgLWMnLCAoKSA9PiB7XG5cdFx0XHRkZWVwU3RyaWN0RXF1YWwocmV3cml0ZXIucmV3cml0ZShjcmVhdGVPcHRpb25zKCdjZCAvYXBwJywgJy9iaW4vYmFzaCcsIE9wZXJhdGluZ1N5c3RlbS5MaW51eCwgdHJ1ZSkpLCB7XG5cdFx0XHRcdHJld3JpdHRlbjogYG5vaHVwIC9iaW4vYmFzaCAtYyAnY2QgL2FwcCcgJiBkaXNvd25gLFxuXHRcdFx0XHRyZWFzb25pbmc6ICdXcmFwcGVkIGJhY2tncm91bmQgY29tbWFuZCB3aXRoIG5vaHVwIHRvIHN1cnZpdmUgdGVybWluYWwgc2h1dGRvd24nLFxuXHRcdFx0XHRmb3JEaXNwbGF5OiAnY2QgL2FwcCcsXG5cdFx0XHR9KTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ21pZC1jb21tYW5kICYgKGJhY2tncm91bmQgb3BlcmF0b3IpIHNob3VsZCBiZSB3cmFwcGVkIGluIHNoZWxsIC1jJywgKCkgPT4ge1xuXHRcdFx0ZGVlcFN0cmljdEVxdWFsKHJld3JpdGVyLnJld3JpdGUoY3JlYXRlT3B0aW9ucygnc2VydmVyIHN0YXJ0ICYgY2xpZW50IGNvbm5lY3QnLCAnL2Jpbi9iYXNoJywgT3BlcmF0aW5nU3lzdGVtLkxpbnV4LCB0cnVlKSksIHtcblx0XHRcdFx0cmV3cml0dGVuOiBgbm9odXAgL2Jpbi9iYXNoIC1jICdzZXJ2ZXIgc3RhcnQgJiBjbGllbnQgY29ubmVjdCcgJiBkaXNvd25gLFxuXHRcdFx0XHRyZWFzb25pbmc6ICdXcmFwcGVkIGJhY2tncm91bmQgY29tbWFuZCB3aXRoIG5vaHVwIHRvIHN1cnZpdmUgdGVybWluYWwgc2h1dGRvd24nLFxuXHRcdFx0XHRmb3JEaXNwbGF5OiAnc2VydmVyIHN0YXJ0ICYgY2xpZW50IGNvbm5lY3QnLFxuXHRcdFx0fSk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHN1aXRlKCdQT1NJWCAoenNoKScsICgpID0+IHtcblx0XHR0ZXN0KCdzaG91bGQgd3JhcCB3aXRoIG5vaHVwJywgKCkgPT4ge1xuXHRcdFx0ZGVlcFN0cmljdEVxdWFsKHJld3JpdGVyLnJld3JpdGUoY3JlYXRlT3B0aW9ucygnbm9kZSBzZXJ2ZXIuanMnLCAnL2Jpbi96c2gnLCBPcGVyYXRpbmdTeXN0ZW0uTGludXgsIHRydWUpKSwge1xuXHRcdFx0XHRyZXdyaXR0ZW46ICdub2h1cCBub2RlIHNlcnZlci5qcyAmIGRpc293bicsXG5cdFx0XHRcdHJlYXNvbmluZzogJ1dyYXBwZWQgYmFja2dyb3VuZCBjb21tYW5kIHdpdGggbm9odXAgdG8gc3Vydml2ZSB0ZXJtaW5hbCBzaHV0ZG93bicsXG5cdFx0XHRcdGZvckRpc3BsYXk6ICdub2RlIHNlcnZlci5qcycsXG5cdFx0XHR9KTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2ZvciBsb29wIHNob3VsZCBiZSB3cmFwcGVkIHVzaW5nIHpzaCBzaGVsbCBwYXRoJywgKCkgPT4ge1xuXHRcdFx0ZGVlcFN0cmljdEVxdWFsKHJld3JpdGVyLnJld3JpdGUoY3JlYXRlT3B0aW9ucygnZm9yIGkgaW4gJChzZXEgMSAxMCk7IGRvIGVjaG8gJGk7IGRvbmUnLCAnL2Jpbi96c2gnLCBPcGVyYXRpbmdTeXN0ZW0uTGludXgsIHRydWUpKSwge1xuXHRcdFx0XHRyZXdyaXR0ZW46IGBub2h1cCAvYmluL3pzaCAtYyAnZm9yIGkgaW4gJChzZXEgMSAxMCk7IGRvIGVjaG8gJGk7IGRvbmUnICYgZGlzb3duYCxcblx0XHRcdFx0cmVhc29uaW5nOiAnV3JhcHBlZCBiYWNrZ3JvdW5kIGNvbW1hbmQgd2l0aCBub2h1cCB0byBzdXJ2aXZlIHRlcm1pbmFsIHNodXRkb3duJyxcblx0XHRcdFx0Zm9yRGlzcGxheTogJ2ZvciBpIGluICQoc2VxIDEgMTApOyBkbyBlY2hvICRpOyBkb25lJyxcblx0XHRcdH0pO1xuXHRcdH0pO1xuXHR9KTtcblxuXHRzdWl0ZSgnUE9TSVggKGZpc2gpJywgKCkgPT4ge1xuXHRcdHRlc3QoJ3Nob3VsZCB3cmFwIHdpdGggbm9odXAnLCAoKSA9PiB7XG5cdFx0XHRkZWVwU3RyaWN0RXF1YWwocmV3cml0ZXIucmV3cml0ZShjcmVhdGVPcHRpb25zKCdydWJ5IGFwcC5yYicsICcvdXNyL2Jpbi9maXNoJywgT3BlcmF0aW5nU3lzdGVtLkxpbnV4LCB0cnVlKSksIHtcblx0XHRcdFx0cmV3cml0dGVuOiAnbm9odXAgcnVieSBhcHAucmIgJicsXG5cdFx0XHRcdHJlYXNvbmluZzogJ1dyYXBwZWQgYmFja2dyb3VuZCBjb21tYW5kIHdpdGggbm9odXAgdG8gc3Vydml2ZSB0ZXJtaW5hbCBzaHV0ZG93bicsXG5cdFx0XHRcdGZvckRpc3BsYXk6ICdydWJ5IGFwcC5yYicsXG5cdFx0XHR9KTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2ZvciBsb29wIHNob3VsZCBiZSB3cmFwcGVkIHVzaW5nIGZpc2ggc2hlbGwgcGF0aCB3aXRoIGRvdWJsZS1xdW90ZSBlc2NhcGluZycsICgpID0+IHtcblx0XHRcdGRlZXBTdHJpY3RFcXVhbChyZXdyaXRlci5yZXdyaXRlKGNyZWF0ZU9wdGlvbnMoJ2ZvciBpIGluIChzZXEgMSAxMCk7IGVjaG8gJGk7IGVuZCcsICcvdXNyL2Jpbi9maXNoJywgT3BlcmF0aW5nU3lzdGVtLkxpbnV4LCB0cnVlKSksIHtcblx0XHRcdFx0cmV3cml0dGVuOiBgbm9odXAgL3Vzci9iaW4vZmlzaCAtYyBcImZvciBpIGluIChzZXEgMSAxMCk7IGVjaG8gJGk7IGVuZFwiICZgLFxuXHRcdFx0XHRyZWFzb25pbmc6ICdXcmFwcGVkIGJhY2tncm91bmQgY29tbWFuZCB3aXRoIG5vaHVwIHRvIHN1cnZpdmUgdGVybWluYWwgc2h1dGRvd24nLFxuXHRcdFx0XHRmb3JEaXNwbGF5OiAnZm9yIGkgaW4gKHNlcSAxIDEwKTsgZWNobyAkaTsgZW5kJyxcblx0XHRcdH0pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnY29tcG91bmQgY29tbWFuZCB3aXRoIGRvdWJsZSBxdW90ZXMgc2hvdWxkIGJlIGVzY2FwZWQgZm9yIGZpc2gnLCAoKSA9PiB7XG5cdFx0XHRkZWVwU3RyaWN0RXF1YWwocmV3cml0ZXIucmV3cml0ZShjcmVhdGVPcHRpb25zKCdmb3IgZiBpbiAqLnR4dDsgZWNobyBcImZpbGU6ICRmXCI7IGVuZCcsICcvdXNyL2Jpbi9maXNoJywgT3BlcmF0aW5nU3lzdGVtLkxpbnV4LCB0cnVlKSksIHtcblx0XHRcdFx0cmV3cml0dGVuOiBgbm9odXAgL3Vzci9iaW4vZmlzaCAtYyBcImZvciBmIGluICoudHh0OyBlY2hvIFxcXFxcImZpbGU6ICRmXFxcXFwiOyBlbmRcIiAmYCxcblx0XHRcdFx0cmVhc29uaW5nOiAnV3JhcHBlZCBiYWNrZ3JvdW5kIGNvbW1hbmQgd2l0aCBub2h1cCB0byBzdXJ2aXZlIHRlcm1pbmFsIHNodXRkb3duJyxcblx0XHRcdFx0Zm9yRGlzcGxheTogJ2ZvciBmIGluICoudHh0OyBlY2hvIFwiZmlsZTogJGZcIjsgZW5kJyxcblx0XHRcdH0pO1xuXHRcdH0pO1xuXHR9KTtcblxuXHRzdWl0ZSgnV2luZG93cyAoUG93ZXJTaGVsbCknLCAoKSA9PiB7XG5cdFx0dGVzdCgnc2hvdWxkIHdyYXAgd2l0aCBTdGFydC1Qcm9jZXNzIGZvciBwd3NoJywgKCkgPT4ge1xuXHRcdFx0ZGVlcFN0cmljdEVxdWFsKHJld3JpdGVyLnJld3JpdGUoY3JlYXRlT3B0aW9ucygncHl0aG9uIGFwcC5weScsICdDOlxcXFxQcm9ncmFtIEZpbGVzXFxcXFBvd2VyU2hlbGxcXFxcN1xcXFxwd3NoLmV4ZScsIE9wZXJhdGluZ1N5c3RlbS5XaW5kb3dzLCB0cnVlKSksIHtcblx0XHRcdFx0cmV3cml0dGVuOiAnU3RhcnQtUHJvY2VzcyAtV2luZG93U3R5bGUgSGlkZGVuIC1GaWxlUGF0aCBcIkM6XFxcXFByb2dyYW0gRmlsZXNcXFxcUG93ZXJTaGVsbFxcXFw3XFxcXHB3c2guZXhlXCIgLUFyZ3VtZW50TGlzdCBcIi1Ob1Byb2ZpbGVcIiwgXCItQ29tbWFuZFwiLCBcInB5dGhvbiBhcHAucHlcIicsXG5cdFx0XHRcdHJlYXNvbmluZzogJ1dyYXBwZWQgYmFja2dyb3VuZCBjb21tYW5kIHdpdGggU3RhcnQtUHJvY2VzcyB0byBzdXJ2aXZlIHRlcm1pbmFsIHNodXRkb3duJyxcblx0XHRcdFx0Zm9yRGlzcGxheTogJ3B5dGhvbiBhcHAucHknLFxuXHRcdFx0fSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdzaG91bGQgd3JhcCB3aXRoIFN0YXJ0LVByb2Nlc3MgZm9yIFdpbmRvd3MgUG93ZXJTaGVsbCcsICgpID0+IHtcblx0XHRcdGRlZXBTdHJpY3RFcXVhbChyZXdyaXRlci5yZXdyaXRlKGNyZWF0ZU9wdGlvbnMoJ25vZGUgc2VydmVyLmpzJywgJ0M6XFxcXFdJTkRPV1NcXFxcU3lzdGVtMzJcXFxcV2luZG93c1Bvd2VyU2hlbGxcXFxcdjEuMFxcXFxwb3dlcnNoZWxsLmV4ZScsIE9wZXJhdGluZ1N5c3RlbS5XaW5kb3dzLCB0cnVlKSksIHtcblx0XHRcdFx0cmV3cml0dGVuOiAnU3RhcnQtUHJvY2VzcyAtV2luZG93U3R5bGUgSGlkZGVuIC1GaWxlUGF0aCBcIkM6XFxcXFdJTkRPV1NcXFxcU3lzdGVtMzJcXFxcV2luZG93c1Bvd2VyU2hlbGxcXFxcdjEuMFxcXFxwb3dlcnNoZWxsLmV4ZVwiIC1Bcmd1bWVudExpc3QgXCItTm9Qcm9maWxlXCIsIFwiLUNvbW1hbmRcIiwgXCJub2RlIHNlcnZlci5qc1wiJyxcblx0XHRcdFx0cmVhc29uaW5nOiAnV3JhcHBlZCBiYWNrZ3JvdW5kIGNvbW1hbmQgd2l0aCBTdGFydC1Qcm9jZXNzIHRvIHN1cnZpdmUgdGVybWluYWwgc2h1dGRvd24nLFxuXHRcdFx0XHRmb3JEaXNwbGF5OiAnbm9kZSBzZXJ2ZXIuanMnLFxuXHRcdFx0fSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdzaG91bGQgZXNjYXBlIGRvdWJsZSBxdW90ZXMgaW4gUG93ZXJTaGVsbCBjb21tYW5kcycsICgpID0+IHtcblx0XHRcdGRlZXBTdHJpY3RFcXVhbChyZXdyaXRlci5yZXdyaXRlKGNyZWF0ZU9wdGlvbnMoJ2VjaG8gXCJoZWxsbyB3b3JsZFwiJywgJ0M6XFxcXFByb2dyYW0gRmlsZXNcXFxcUG93ZXJTaGVsbFxcXFw3XFxcXHB3c2guZXhlJywgT3BlcmF0aW5nU3lzdGVtLldpbmRvd3MsIHRydWUpKSwge1xuXHRcdFx0XHRyZXdyaXR0ZW46ICdTdGFydC1Qcm9jZXNzIC1XaW5kb3dTdHlsZSBIaWRkZW4gLUZpbGVQYXRoIFwiQzpcXFxcUHJvZ3JhbSBGaWxlc1xcXFxQb3dlclNoZWxsXFxcXDdcXFxccHdzaC5leGVcIiAtQXJndW1lbnRMaXN0IFwiLU5vUHJvZmlsZVwiLCBcIi1Db21tYW5kXCIsIFwiZWNobyBcXFxcXCJoZWxsbyB3b3JsZFxcXFxcIlwiJyxcblx0XHRcdFx0cmVhc29uaW5nOiAnV3JhcHBlZCBiYWNrZ3JvdW5kIGNvbW1hbmQgd2l0aCBTdGFydC1Qcm9jZXNzIHRvIHN1cnZpdmUgdGVybWluYWwgc2h1dGRvd24nLFxuXHRcdFx0XHRmb3JEaXNwbGF5OiAnZWNobyBcImhlbGxvIHdvcmxkXCInLFxuXHRcdFx0fSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdzaG91bGQgcmV0dXJuIHVuZGVmaW5lZCBmb3Igbm9uLVBvd2VyU2hlbGwgV2luZG93cyBzaGVsbCcsICgpID0+IHtcblx0XHRcdHN0cmljdEVxdWFsKHJld3JpdGVyLnJld3JpdGUoY3JlYXRlT3B0aW9ucygnZWNobyBoZWxsbycsICdjbWQuZXhlJywgT3BlcmF0aW5nU3lzdGVtLldpbmRvd3MsIHRydWUpKSwgdW5kZWZpbmVkKTtcblx0XHR9KTtcblx0fSk7XG5cblx0c3VpdGUoJ0ludGVyYWN0aXZlIGZyb250LWVuZCBza2lwJywgKCkgPT4ge1xuXHRcdGNvbnN0IGludGVyYWN0aXZlcyA9IFtcblx0XHRcdCdleHBlY3Qgc2V0dXBfdm0uZXhwJyxcblx0XHRcdCdnZGIgLi9hLm91dCcsXG5cdFx0XHQnbGxkYiAuL2Eub3V0Jyxcblx0XHRcdCdwYXNzd2QnLFxuXHRcdFx0J3ZpbSBmaWxlLnR4dCcsXG5cdFx0XHQnbmFubyBub3Rlcy5tZCcsXG5cdFx0XHQnbGVzcyAvdmFyL2xvZy9zeXNsb2cnLFxuXHRcdFx0J3NmdHAgdXNlckBob3N0Jyxcblx0XHRcdCd0ZWxuZXQgaG9zdCAyMycsXG5cdFx0XHQncHNxbCcsXG5cdFx0XHQncHNxbCBteWRiJyxcblx0XHRcdCdteXNxbCAtdSByb290Jyxcblx0XHRcdCdzc2ggdXNlckBob3N0Jyxcblx0XHRcdCdzdWRvIGFwdC1nZXQgaW5zdGFsbCAteSBmb28nLFxuXHRcdF07XG5cdFx0Zm9yIChjb25zdCBjbWQgb2YgaW50ZXJhY3RpdmVzKSB7XG5cdFx0XHR0ZXN0KGBzaG91bGQgc2tpcCBkZXRhY2gtd3JhcCBmb3IgaW50ZXJhY3RpdmU6ICR7Y21kfWAsICgpID0+IHtcblx0XHRcdFx0c3RyaWN0RXF1YWwocmV3cml0ZXIucmV3cml0ZShjcmVhdGVPcHRpb25zKGNtZCwgJy9iaW4vYmFzaCcsIE9wZXJhdGluZ1N5c3RlbS5MaW51eCwgdHJ1ZSkpLCB1bmRlZmluZWQpO1xuXHRcdFx0fSk7XG5cdFx0fVxuXG5cdFx0dGVzdCgnc2hvdWxkIHN0aWxsIHdyYXAgcHNxbCB3aGVuIC1jIGlzIHBhc3NlZCAobm9uLWludGVyYWN0aXZlKScsICgpID0+IHtcblx0XHRcdGRlZXBTdHJpY3RFcXVhbChyZXdyaXRlci5yZXdyaXRlKGNyZWF0ZU9wdGlvbnMoJ3BzcWwgLWMgXCJzZWxlY3QgMVwiJywgJy9iaW4vYmFzaCcsIE9wZXJhdGluZ1N5c3RlbS5MaW51eCwgdHJ1ZSkpLCB7XG5cdFx0XHRcdHJld3JpdHRlbjogJ25vaHVwIHBzcWwgLWMgXCJzZWxlY3QgMVwiICYgZGlzb3duJyxcblx0XHRcdFx0cmVhc29uaW5nOiAnV3JhcHBlZCBiYWNrZ3JvdW5kIGNvbW1hbmQgd2l0aCBub2h1cCB0byBzdXJ2aXZlIHRlcm1pbmFsIHNodXRkb3duJyxcblx0XHRcdFx0Zm9yRGlzcGxheTogJ3BzcWwgLWMgXCJzZWxlY3QgMVwiJyxcblx0XHRcdH0pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnc2hvdWxkIHN0aWxsIHdyYXAgbXlzcWwgd2hlbiAtZSBpcyBwYXNzZWQgKG5vbi1pbnRlcmFjdGl2ZSknLCAoKSA9PiB7XG5cdFx0XHRkZWVwU3RyaWN0RXF1YWwocmV3cml0ZXIucmV3cml0ZShjcmVhdGVPcHRpb25zKCdteXNxbCAtZSBcInNob3cgZGF0YWJhc2VzXCInLCAnL2Jpbi9iYXNoJywgT3BlcmF0aW5nU3lzdGVtLkxpbnV4LCB0cnVlKSksIHtcblx0XHRcdFx0cmV3cml0dGVuOiAnbm9odXAgbXlzcWwgLWUgXCJzaG93IGRhdGFiYXNlc1wiICYgZGlzb3duJyxcblx0XHRcdFx0cmVhc29uaW5nOiAnV3JhcHBlZCBiYWNrZ3JvdW5kIGNvbW1hbmQgd2l0aCBub2h1cCB0byBzdXJ2aXZlIHRlcm1pbmFsIHNodXRkb3duJyxcblx0XHRcdFx0Zm9yRGlzcGxheTogJ215c3FsIC1lIFwic2hvdyBkYXRhYmFzZXNcIicsXG5cdFx0XHR9KTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3Nob3VsZCBzdGlsbCB3cmFwIHNzaCB3aGVuIHJ1bm5pbmcgYSByZW1vdGUgY29tbWFuZCAobm9uLWludGVyYWN0aXZlKScsICgpID0+IHtcblx0XHRcdGRlZXBTdHJpY3RFcXVhbChyZXdyaXRlci5yZXdyaXRlKGNyZWF0ZU9wdGlvbnMoJ3NzaCAtVCB1c2VyQGhvc3QnLCAnL2Jpbi9iYXNoJywgT3BlcmF0aW5nU3lzdGVtLkxpbnV4LCB0cnVlKSksIHtcblx0XHRcdFx0cmV3cml0dGVuOiAnbm9odXAgc3NoIC1UIHVzZXJAaG9zdCAmIGRpc293bicsXG5cdFx0XHRcdHJlYXNvbmluZzogJ1dyYXBwZWQgYmFja2dyb3VuZCBjb21tYW5kIHdpdGggbm9odXAgdG8gc3Vydml2ZSB0ZXJtaW5hbCBzaHV0ZG93bicsXG5cdFx0XHRcdGZvckRpc3BsYXk6ICdzc2ggLVQgdXNlckBob3N0Jyxcblx0XHRcdH0pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnc2hvdWxkIHN0aWxsIHdyYXAgc3VkbyB3aGVuIC1uIGlzIHBhc3NlZCAobm9uLWludGVyYWN0aXZlKScsICgpID0+IHtcblx0XHRcdGRlZXBTdHJpY3RFcXVhbChyZXdyaXRlci5yZXdyaXRlKGNyZWF0ZU9wdGlvbnMoJ3N1ZG8gLW4gc3lzdGVtY3RsIHJlc3RhcnQgbmdpbngnLCAnL2Jpbi9iYXNoJywgT3BlcmF0aW5nU3lzdGVtLkxpbnV4LCB0cnVlKSksIHtcblx0XHRcdFx0cmV3cml0dGVuOiAnbm9odXAgc3VkbyAtbiBzeXN0ZW1jdGwgcmVzdGFydCBuZ2lueCAmIGRpc293bicsXG5cdFx0XHRcdHJlYXNvbmluZzogJ1dyYXBwZWQgYmFja2dyb3VuZCBjb21tYW5kIHdpdGggbm9odXAgdG8gc3Vydml2ZSB0ZXJtaW5hbCBzaHV0ZG93bicsXG5cdFx0XHRcdGZvckRpc3BsYXk6ICdzdWRvIC1uIHN5c3RlbWN0bCByZXN0YXJ0IG5naW54Jyxcblx0XHRcdH0pO1xuXHRcdH0pO1xuXHR9KTtcbn0pO1xuIl0sCiAgIm1hcHBpbmdzIjogIkFBS0EsU0FBUyxpQkFBaUIsbUJBQW1CO0FBQzdDLFNBQVMsdUJBQXVCO0FBQ2hDLFNBQVMsK0NBQStDO0FBRXhELFNBQVMsZ0NBQWdDO0FBQ3pDLFNBQVMscUNB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
