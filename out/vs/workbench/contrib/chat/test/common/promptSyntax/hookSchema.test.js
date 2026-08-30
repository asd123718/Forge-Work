import assert from "assert";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../../../base/test/common/utils.js";
import { resolveHookCommand, resolveEffectiveCommand, formatHookCommandLabel, parseSubagentHooksFromYaml, ChatRequestHooks } from "../../../common/promptSyntax/hookSchema.js";
import { URI } from "../../../../../../base/common/uri.js";
import { OperatingSystem } from "../../../../../../base/common/platform.js";
import { HookType } from "../../../common/promptSyntax/hookTypes.js";
import { Range } from "../../../../../../editor/common/core/range.js";
suite("HookSchema", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  suite("resolveHookCommand", () => {
    const workspaceRoot = URI.file("/workspace");
    const userHome = "/home/user";
    suite("command property", () => {
      test("resolves basic command", () => {
        const result = resolveHookCommand({
          type: "command",
          command: "echo hello"
        }, workspaceRoot, userHome);
        assert.deepStrictEqual(result, {
          type: "command",
          command: "echo hello",
          cwd: workspaceRoot
        });
      });
      test("resolves command with all optional properties", () => {
        const result = resolveHookCommand({
          type: "command",
          command: "./scripts/validate.sh",
          cwd: "src",
          env: { NODE_ENV: "test" },
          timeout: 60
        }, workspaceRoot, userHome);
        assert.deepStrictEqual(result, {
          type: "command",
          command: "./scripts/validate.sh",
          cwd: URI.file("/workspace/src"),
          env: { NODE_ENV: "test" },
          timeout: 60
        });
      });
      test("empty command returns object without command", () => {
        const result = resolveHookCommand({
          type: "command",
          command: ""
        }, workspaceRoot, userHome);
        assert.deepStrictEqual(result, {
          type: "command",
          cwd: workspaceRoot
        });
      });
    });
    suite("bash legacy mapping", () => {
      test("bash maps to linux and osx", () => {
        const result = resolveHookCommand({
          type: "command",
          bash: 'echo "hello world"'
        }, workspaceRoot, userHome);
        assert.deepStrictEqual(result, {
          type: "command",
          linux: 'echo "hello world"',
          osx: 'echo "hello world"',
          linuxSource: "bash",
          osxSource: "bash",
          cwd: workspaceRoot
        });
      });
      test("bash with cwd and env", () => {
        const result = resolveHookCommand({
          type: "command",
          bash: "./test.sh",
          cwd: "scripts",
          env: { DEBUG: "1" }
        }, workspaceRoot, userHome);
        assert.deepStrictEqual(result, {
          type: "command",
          linux: "./test.sh",
          osx: "./test.sh",
          linuxSource: "bash",
          osxSource: "bash",
          cwd: URI.file("/workspace/scripts"),
          env: { DEBUG: "1" }
        });
      });
      test("empty bash returns object without platform overrides", () => {
        const result = resolveHookCommand({
          type: "command",
          bash: ""
        }, workspaceRoot, userHome);
        assert.deepStrictEqual(result, {
          type: "command",
          cwd: workspaceRoot
        });
      });
    });
    suite("powershell legacy mapping", () => {
      test("powershell maps to windows", () => {
        const result = resolveHookCommand({
          type: "command",
          powershell: 'Write-Host "hello"'
        }, workspaceRoot, userHome);
        assert.deepStrictEqual(result, {
          type: "command",
          windows: 'Write-Host "hello"',
          windowsSource: "powershell",
          cwd: workspaceRoot
        });
      });
      test("powershell with timeout", () => {
        const result = resolveHookCommand({
          type: "command",
          powershell: "Get-Process",
          timeout: 30
        }, workspaceRoot, userHome);
        assert.deepStrictEqual(result, {
          type: "command",
          windows: "Get-Process",
          windowsSource: "powershell",
          cwd: workspaceRoot,
          timeout: 30
        });
      });
      test("empty powershell returns object without windows", () => {
        const result = resolveHookCommand({
          type: "command",
          powershell: ""
        }, workspaceRoot, userHome);
        assert.deepStrictEqual(result, {
          type: "command",
          cwd: workspaceRoot
        });
      });
    });
    suite("multiple properties specified", () => {
      test("preserves command with bash mapped to linux/osx", () => {
        const result = resolveHookCommand({
          type: "command",
          command: "direct-command",
          bash: "bash-script.sh"
        }, workspaceRoot, userHome);
        assert.deepStrictEqual(result, {
          type: "command",
          command: "direct-command",
          linux: "bash-script.sh",
          osx: "bash-script.sh",
          linuxSource: "bash",
          osxSource: "bash",
          cwd: workspaceRoot
        });
      });
      test("preserves command with powershell mapped to windows", () => {
        const result = resolveHookCommand({
          type: "command",
          command: "direct-command",
          powershell: "ps-script.ps1"
        }, workspaceRoot, userHome);
        assert.deepStrictEqual(result, {
          type: "command",
          command: "direct-command",
          windows: "ps-script.ps1",
          windowsSource: "powershell",
          cwd: workspaceRoot
        });
      });
      test("bash and powershell map to all platforms", () => {
        const result = resolveHookCommand({
          type: "command",
          bash: "bash-script.sh",
          powershell: "ps-script.ps1"
        }, workspaceRoot, userHome);
        assert.deepStrictEqual(result, {
          type: "command",
          windows: "ps-script.ps1",
          linux: "bash-script.sh",
          osx: "bash-script.sh",
          windowsSource: "powershell",
          linuxSource: "bash",
          osxSource: "bash",
          cwd: workspaceRoot
        });
      });
    });
    suite("cwd resolution", () => {
      test("cwd is not resolved when no workspace root", () => {
        const result = resolveHookCommand({
          type: "command",
          command: "echo hello",
          cwd: "src"
        }, void 0, userHome);
        assert.deepStrictEqual(result, {
          type: "command",
          command: "echo hello"
        });
      });
      test("cwd is resolved relative to workspace root", () => {
        const result = resolveHookCommand({
          type: "command",
          command: "echo hello",
          cwd: "nested/path"
        }, workspaceRoot, userHome);
        assert.deepStrictEqual(result, {
          type: "command",
          command: "echo hello",
          cwd: URI.file("/workspace/nested/path")
        });
      });
    });
    suite("invalid inputs", () => {
      test("wrong type returns undefined", () => {
        const result = resolveHookCommand({
          type: "script",
          command: "echo hello"
        }, workspaceRoot, userHome);
        assert.strictEqual(result, void 0);
      });
      test("missing type returns undefined", () => {
        const result = resolveHookCommand({
          command: "echo hello"
        }, workspaceRoot, userHome);
        assert.strictEqual(result, void 0);
      });
      test("no command returns object with just type and cwd", () => {
        const result = resolveHookCommand({
          type: "command",
          cwd: "/workspace"
        }, workspaceRoot, userHome);
        assert.deepStrictEqual(result, {
          type: "command",
          cwd: URI.file("/workspace")
        });
      });
      test("ignores non-string cwd", () => {
        const result = resolveHookCommand({
          type: "command",
          command: "echo hello",
          cwd: 123
        }, workspaceRoot, userHome);
        assert.deepStrictEqual(result, {
          type: "command",
          command: "echo hello",
          cwd: workspaceRoot
        });
      });
      test("ignores non-object env", () => {
        const result = resolveHookCommand({
          type: "command",
          command: "echo hello",
          env: "invalid"
        }, workspaceRoot, userHome);
        assert.deepStrictEqual(result, {
          type: "command",
          command: "echo hello",
          cwd: workspaceRoot
        });
      });
      test("ignores non-number timeout", () => {
        const result = resolveHookCommand({
          type: "command",
          command: "echo hello",
          timeout: "30"
        }, workspaceRoot, userHome);
        assert.deepStrictEqual(result, {
          type: "command",
          command: "echo hello",
          cwd: workspaceRoot
        });
      });
    });
    suite("platform-specific overrides", () => {
      test("preserves windows override as string", () => {
        const result = resolveHookCommand({
          type: "command",
          command: "default-command",
          windows: "win-command"
        }, workspaceRoot, userHome);
        assert.deepStrictEqual(result, {
          type: "command",
          command: "default-command",
          windows: "win-command",
          windowsSource: "windows",
          cwd: workspaceRoot
        });
      });
      test("preserves linux override as string", () => {
        const result = resolveHookCommand({
          type: "command",
          command: "default-command",
          linux: "linux-command"
        }, workspaceRoot, userHome);
        assert.deepStrictEqual(result, {
          type: "command",
          command: "default-command",
          linux: "linux-command",
          linuxSource: "linux",
          cwd: workspaceRoot
        });
      });
      test("preserves osx override as string", () => {
        const result = resolveHookCommand({
          type: "command",
          command: "default-command",
          osx: "osx-command"
        }, workspaceRoot, userHome);
        assert.deepStrictEqual(result, {
          type: "command",
          command: "default-command",
          osx: "osx-command",
          osxSource: "osx",
          cwd: workspaceRoot
        });
      });
      test("preserves all platform overrides", () => {
        const result = resolveHookCommand({
          type: "command",
          command: "default-command",
          windows: "win-command",
          linux: "linux-command",
          osx: "osx-command"
        }, workspaceRoot, userHome);
        assert.deepStrictEqual(result, {
          type: "command",
          command: "default-command",
          windows: "win-command",
          linux: "linux-command",
          osx: "osx-command",
          windowsSource: "windows",
          linuxSource: "linux",
          osxSource: "osx",
          cwd: workspaceRoot
        });
      });
      test("explicit platform override takes precedence over bash/powershell mapping", () => {
        const result = resolveHookCommand({
          type: "command",
          bash: "default.sh",
          linux: "explicit-linux.sh"
        }, workspaceRoot, userHome);
        assert.deepStrictEqual(result, {
          type: "command",
          linux: "explicit-linux.sh",
          osx: "default.sh",
          linuxSource: "linux",
          osxSource: "bash",
          cwd: workspaceRoot
        });
      });
      test("ignores empty platform override", () => {
        const result = resolveHookCommand({
          type: "command",
          command: "default-command",
          windows: ""
        }, workspaceRoot, userHome);
        assert.deepStrictEqual(result, {
          type: "command",
          command: "default-command",
          cwd: workspaceRoot
        });
      });
      test("ignores non-string platform override", () => {
        const result = resolveHookCommand({
          type: "command",
          command: "default-command",
          windows: { command: "invalid" }
        }, workspaceRoot, userHome);
        assert.deepStrictEqual(result, {
          type: "command",
          command: "default-command",
          cwd: workspaceRoot
        });
      });
    });
  });
  suite("resolveEffectiveCommand", () => {
    test("returns base command when no platform override", () => {
      const hook = {
        type: "command",
        command: "default-command"
      };
      assert.strictEqual(resolveEffectiveCommand(hook, OperatingSystem.Windows), "default-command");
      assert.strictEqual(resolveEffectiveCommand(hook, OperatingSystem.Macintosh), "default-command");
      assert.strictEqual(resolveEffectiveCommand(hook, OperatingSystem.Linux), "default-command");
    });
    test("applies platform override for each platform", () => {
      const hook = {
        type: "command",
        command: "default-command",
        windows: "win-command",
        linux: "linux-command",
        osx: "osx-command"
      };
      assert.strictEqual(resolveEffectiveCommand(hook, OperatingSystem.Windows), "win-command");
      assert.strictEqual(resolveEffectiveCommand(hook, OperatingSystem.Macintosh), "osx-command");
      assert.strictEqual(resolveEffectiveCommand(hook, OperatingSystem.Linux), "linux-command");
    });
    test("falls back to command when no platform-specific override", () => {
      const hook = {
        type: "command",
        command: "default-command"
      };
      assert.strictEqual(resolveEffectiveCommand(hook, OperatingSystem.Windows), "default-command");
    });
    test("returns undefined when no command at all", () => {
      const hook = {
        type: "command"
      };
      assert.strictEqual(resolveEffectiveCommand(hook, OperatingSystem.Windows), void 0);
    });
  });
  suite("formatHookCommandLabel", () => {
    test("formats command when present (no platform override)", () => {
      const hook = {
        type: "command",
        command: "echo hello"
      };
      assert.strictEqual(formatHookCommandLabel(hook, OperatingSystem.Windows), "echo hello");
      assert.strictEqual(formatHookCommandLabel(hook, OperatingSystem.Macintosh), "echo hello");
      assert.strictEqual(formatHookCommandLabel(hook, OperatingSystem.Linux), "echo hello");
    });
    test("returns empty string when no command", () => {
      const hook = {
        type: "command"
      };
      assert.strictEqual(formatHookCommandLabel(hook, OperatingSystem.Windows), "");
    });
    test("applies platform override for display", () => {
      const hook = {
        type: "command",
        command: "default-command",
        windows: "win-command",
        linux: "linux-command",
        osx: "osx-command"
      };
      assert.strictEqual(formatHookCommandLabel(hook, OperatingSystem.Windows), "win-command");
      assert.strictEqual(formatHookCommandLabel(hook, OperatingSystem.Macintosh), "osx-command");
      assert.strictEqual(formatHookCommandLabel(hook, OperatingSystem.Linux), "linux-command");
    });
    test("no platform badge when falling back to default command", () => {
      const hook = {
        type: "command",
        command: "default-command"
        // No platform-specific overrides
      };
      assert.strictEqual(formatHookCommandLabel(hook, OperatingSystem.Windows), "default-command");
    });
  });
  suite("parseSubagentHooksFromYaml", () => {
    const workspaceRoot = URI.file("/workspace");
    const userHome = "/home/user";
    const dummyRange = new Range(1, 1, 1, 1);
    function makeScalar(value) {
      return { type: "scalar", value, range: dummyRange, format: "none" };
    }
    function makeMap(entries) {
      const properties = Object.entries(entries).map(([key, value]) => ({
        key: makeScalar(key),
        value
      }));
      return { type: "map", properties, range: dummyRange };
    }
    function makeSequence(items) {
      return { type: "sequence", items, range: dummyRange };
    }
    test("parses direct command format (without matcher)", () => {
      const hooksMap = makeMap({
        "PreToolUse": makeSequence([
          makeMap({
            "type": makeScalar("command"),
            "command": makeScalar("./scripts/validate.sh")
          })
        ])
      });
      const result = parseSubagentHooksFromYaml(hooksMap, workspaceRoot, userHome);
      assert.strictEqual(result[HookType.PreToolUse]?.length, 1);
      assert.strictEqual(result[HookType.PreToolUse][0].command, "./scripts/validate.sh");
    });
    test("parses Claude format (with matcher)", () => {
      const hooksMap = makeMap({
        "PreToolUse": makeSequence([
          makeMap({
            "matcher": makeScalar("Bash"),
            "hooks": makeSequence([
              makeMap({
                "type": makeScalar("command"),
                "command": makeScalar("./scripts/validate-readonly.sh")
              })
            ])
          })
        ])
      });
      const result = parseSubagentHooksFromYaml(hooksMap, workspaceRoot, userHome);
      assert.strictEqual(result[HookType.PreToolUse]?.length, 1);
      assert.strictEqual(result[HookType.PreToolUse][0].command, "./scripts/validate-readonly.sh");
    });
    test("parses multiple hook types", () => {
      const hooksMap = makeMap({
        "PreToolUse": makeSequence([
          makeMap({
            "type": makeScalar("command"),
            "command": makeScalar("./scripts/pre.sh")
          })
        ]),
        "PostToolUse": makeSequence([
          makeMap({
            "matcher": makeScalar("Edit|Write"),
            "hooks": makeSequence([
              makeMap({
                "type": makeScalar("command"),
                "command": makeScalar("./scripts/lint.sh")
              })
            ])
          })
        ])
      });
      const result = parseSubagentHooksFromYaml(hooksMap, workspaceRoot, userHome);
      assert.strictEqual(result[HookType.PreToolUse]?.length, 1);
      assert.strictEqual(result[HookType.PreToolUse][0].command, "./scripts/pre.sh");
      assert.strictEqual(result[HookType.PostToolUse]?.length, 1);
      assert.strictEqual(result[HookType.PostToolUse][0].command, "./scripts/lint.sh");
    });
    test("skips unknown hook types", () => {
      const hooksMap = makeMap({
        "UnknownHook": makeSequence([
          makeMap({
            "type": makeScalar("command"),
            "command": makeScalar('echo "ignored"')
          })
        ])
      });
      const result = parseSubagentHooksFromYaml(hooksMap, workspaceRoot, userHome);
      assert.strictEqual(result[HookType.PreToolUse], void 0);
      assert.strictEqual(result[HookType.PostToolUse], void 0);
    });
    test("handles command without type field", () => {
      const hooksMap = makeMap({
        "PreToolUse": makeSequence([
          makeMap({
            "command": makeScalar("./scripts/validate.sh")
          })
        ])
      });
      const result = parseSubagentHooksFromYaml(hooksMap, workspaceRoot, userHome);
      assert.strictEqual(result[HookType.PreToolUse]?.length, 1);
      assert.strictEqual(result[HookType.PreToolUse][0].command, "./scripts/validate.sh");
    });
    test("resolves cwd relative to workspace", () => {
      const hooksMap = makeMap({
        "SessionStart": makeSequence([
          makeMap({
            "type": makeScalar("command"),
            "command": makeScalar('echo "start"'),
            "cwd": makeScalar("src")
          })
        ])
      });
      const result = parseSubagentHooksFromYaml(hooksMap, workspaceRoot, userHome);
      assert.strictEqual(result[HookType.SessionStart]?.length, 1);
      assert.deepStrictEqual(result[HookType.SessionStart][0].cwd, URI.file("/workspace/src"));
    });
    test("skips non-sequence hook values", () => {
      const hooksMap = makeMap({
        "PreToolUse": makeScalar("not-a-sequence")
      });
      const result = parseSubagentHooksFromYaml(hooksMap, workspaceRoot, userHome);
      assert.strictEqual(result[HookType.PreToolUse], void 0);
    });
  });
  suite("ChatRequestHooks.isEquals", () => {
    test("returns true for equivalent hook arrays", () => {
      const left = {
        [HookType.PreToolUse]: [{ command: "./scripts/pre.sh", cwd: URI.file("/workspace") }]
      };
      const right = {
        [HookType.PreToolUse]: [{ command: "./scripts/pre.sh", cwd: URI.file("/workspace") }]
      };
      assert.strictEqual(ChatRequestHooks.isEquals(left, right), true);
    });
    test("returns false for different hook commands", () => {
      const left = {
        [HookType.PreToolUse]: [{ command: "./scripts/pre.sh" }]
      };
      const right = {
        [HookType.PreToolUse]: [{ command: "./scripts/other.sh" }]
      };
      assert.strictEqual(ChatRequestHooks.isEquals(left, right), false);
    });
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXGNoYXRcXHRlc3RcXGNvbW1vblxccHJvbXB0U3ludGF4XFxob29rU2NoZW1hLnRlc3QudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgYXNzZXJ0IGZyb20gJ2Fzc2VydCc7XG5pbXBvcnQgeyBlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL3Rlc3QvY29tbW9uL3V0aWxzLmpzJztcbmltcG9ydCB7IHJlc29sdmVIb29rQ29tbWFuZCwgcmVzb2x2ZUVmZmVjdGl2ZUNvbW1hbmQsIGZvcm1hdEhvb2tDb21tYW5kTGFiZWwsIElIb29rQ29tbWFuZCwgcGFyc2VTdWJhZ2VudEhvb2tzRnJvbVlhbWwsIENoYXRSZXF1ZXN0SG9va3MgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vcHJvbXB0U3ludGF4L2hvb2tTY2hlbWEuanMnO1xuaW1wb3J0IHsgVVJJIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdXJpLmpzJztcbmltcG9ydCB7IE9wZXJhdGluZ1N5c3RlbSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3BsYXRmb3JtLmpzJztcbmltcG9ydCB7IEhvb2tUeXBlIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL3Byb21wdFN5bnRheC9ob29rVHlwZXMuanMnO1xuaW1wb3J0IHsgUmFuZ2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL2NvcmUvcmFuZ2UuanMnO1xuXG5zdWl0ZSgnSG9va1NjaGVtYScsICgpID0+IHtcblx0ZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlKCk7XG5cblx0c3VpdGUoJ3Jlc29sdmVIb29rQ29tbWFuZCcsICgpID0+IHtcblx0XHRjb25zdCB3b3Jrc3BhY2VSb290ID0gVVJJLmZpbGUoJy93b3Jrc3BhY2UnKTtcblx0XHRjb25zdCB1c2VySG9tZSA9ICcvaG9tZS91c2VyJztcblxuXHRcdHN1aXRlKCdjb21tYW5kIHByb3BlcnR5JywgKCkgPT4ge1xuXHRcdFx0dGVzdCgncmVzb2x2ZXMgYmFzaWMgY29tbWFuZCcsICgpID0+IHtcblx0XHRcdFx0Y29uc3QgcmVzdWx0ID0gcmVzb2x2ZUhvb2tDb21tYW5kKHtcblx0XHRcdFx0XHR0eXBlOiAnY29tbWFuZCcsXG5cdFx0XHRcdFx0Y29tbWFuZDogJ2VjaG8gaGVsbG8nXG5cdFx0XHRcdH0sIHdvcmtzcGFjZVJvb3QsIHVzZXJIb21lKTtcblx0XHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChyZXN1bHQsIHtcblx0XHRcdFx0XHR0eXBlOiAnY29tbWFuZCcsXG5cdFx0XHRcdFx0Y29tbWFuZDogJ2VjaG8gaGVsbG8nLFxuXHRcdFx0XHRcdGN3ZDogd29ya3NwYWNlUm9vdFxuXHRcdFx0XHR9KTtcblx0XHRcdH0pO1xuXG5cdFx0XHR0ZXN0KCdyZXNvbHZlcyBjb21tYW5kIHdpdGggYWxsIG9wdGlvbmFsIHByb3BlcnRpZXMnLCAoKSA9PiB7XG5cdFx0XHRcdGNvbnN0IHJlc3VsdCA9IHJlc29sdmVIb29rQ29tbWFuZCh7XG5cdFx0XHRcdFx0dHlwZTogJ2NvbW1hbmQnLFxuXHRcdFx0XHRcdGNvbW1hbmQ6ICcuL3NjcmlwdHMvdmFsaWRhdGUuc2gnLFxuXHRcdFx0XHRcdGN3ZDogJ3NyYycsXG5cdFx0XHRcdFx0ZW52OiB7IE5PREVfRU5WOiAndGVzdCcgfSxcblx0XHRcdFx0XHR0aW1lb3V0OiA2MFxuXHRcdFx0XHR9LCB3b3Jrc3BhY2VSb290LCB1c2VySG9tZSk7XG5cdFx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocmVzdWx0LCB7XG5cdFx0XHRcdFx0dHlwZTogJ2NvbW1hbmQnLFxuXHRcdFx0XHRcdGNvbW1hbmQ6ICcuL3NjcmlwdHMvdmFsaWRhdGUuc2gnLFxuXHRcdFx0XHRcdGN3ZDogVVJJLmZpbGUoJy93b3Jrc3BhY2Uvc3JjJyksXG5cdFx0XHRcdFx0ZW52OiB7IE5PREVfRU5WOiAndGVzdCcgfSxcblx0XHRcdFx0XHR0aW1lb3V0OiA2MFxuXHRcdFx0XHR9KTtcblx0XHRcdH0pO1xuXG5cdFx0XHR0ZXN0KCdlbXB0eSBjb21tYW5kIHJldHVybnMgb2JqZWN0IHdpdGhvdXQgY29tbWFuZCcsICgpID0+IHtcblx0XHRcdFx0Y29uc3QgcmVzdWx0ID0gcmVzb2x2ZUhvb2tDb21tYW5kKHtcblx0XHRcdFx0XHR0eXBlOiAnY29tbWFuZCcsXG5cdFx0XHRcdFx0Y29tbWFuZDogJydcblx0XHRcdFx0fSwgd29ya3NwYWNlUm9vdCwgdXNlckhvbWUpO1xuXHRcdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHJlc3VsdCwge1xuXHRcdFx0XHRcdHR5cGU6ICdjb21tYW5kJyxcblx0XHRcdFx0XHRjd2Q6IHdvcmtzcGFjZVJvb3Rcblx0XHRcdFx0fSk7XG5cdFx0XHR9KTtcblx0XHR9KTtcblxuXHRcdHN1aXRlKCdiYXNoIGxlZ2FjeSBtYXBwaW5nJywgKCkgPT4ge1xuXHRcdFx0dGVzdCgnYmFzaCBtYXBzIHRvIGxpbnV4IGFuZCBvc3gnLCAoKSA9PiB7XG5cdFx0XHRcdGNvbnN0IHJlc3VsdCA9IHJlc29sdmVIb29rQ29tbWFuZCh7XG5cdFx0XHRcdFx0dHlwZTogJ2NvbW1hbmQnLFxuXHRcdFx0XHRcdGJhc2g6ICdlY2hvIFwiaGVsbG8gd29ybGRcIidcblx0XHRcdFx0fSwgd29ya3NwYWNlUm9vdCwgdXNlckhvbWUpO1xuXHRcdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHJlc3VsdCwge1xuXHRcdFx0XHRcdHR5cGU6ICdjb21tYW5kJyxcblx0XHRcdFx0XHRsaW51eDogJ2VjaG8gXCJoZWxsbyB3b3JsZFwiJyxcblx0XHRcdFx0XHRvc3g6ICdlY2hvIFwiaGVsbG8gd29ybGRcIicsXG5cdFx0XHRcdFx0bGludXhTb3VyY2U6ICdiYXNoJyxcblx0XHRcdFx0XHRvc3hTb3VyY2U6ICdiYXNoJyxcblx0XHRcdFx0XHRjd2Q6IHdvcmtzcGFjZVJvb3Rcblx0XHRcdFx0fSk7XG5cdFx0XHR9KTtcblxuXHRcdFx0dGVzdCgnYmFzaCB3aXRoIGN3ZCBhbmQgZW52JywgKCkgPT4ge1xuXHRcdFx0XHRjb25zdCByZXN1bHQgPSByZXNvbHZlSG9va0NvbW1hbmQoe1xuXHRcdFx0XHRcdHR5cGU6ICdjb21tYW5kJyxcblx0XHRcdFx0XHRiYXNoOiAnLi90ZXN0LnNoJyxcblx0XHRcdFx0XHRjd2Q6ICdzY3JpcHRzJyxcblx0XHRcdFx0XHRlbnY6IHsgREVCVUc6ICcxJyB9XG5cdFx0XHRcdH0sIHdvcmtzcGFjZVJvb3QsIHVzZXJIb21lKTtcblx0XHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChyZXN1bHQsIHtcblx0XHRcdFx0XHR0eXBlOiAnY29tbWFuZCcsXG5cdFx0XHRcdFx0bGludXg6ICcuL3Rlc3Quc2gnLFxuXHRcdFx0XHRcdG9zeDogJy4vdGVzdC5zaCcsXG5cdFx0XHRcdFx0bGludXhTb3VyY2U6ICdiYXNoJyxcblx0XHRcdFx0XHRvc3hTb3VyY2U6ICdiYXNoJyxcblx0XHRcdFx0XHRjd2Q6IFVSSS5maWxlKCcvd29ya3NwYWNlL3NjcmlwdHMnKSxcblx0XHRcdFx0XHRlbnY6IHsgREVCVUc6ICcxJyB9XG5cdFx0XHRcdH0pO1xuXHRcdFx0fSk7XG5cblx0XHRcdHRlc3QoJ2VtcHR5IGJhc2ggcmV0dXJucyBvYmplY3Qgd2l0aG91dCBwbGF0Zm9ybSBvdmVycmlkZXMnLCAoKSA9PiB7XG5cdFx0XHRcdGNvbnN0IHJlc3VsdCA9IHJlc29sdmVIb29rQ29tbWFuZCh7XG5cdFx0XHRcdFx0dHlwZTogJ2NvbW1hbmQnLFxuXHRcdFx0XHRcdGJhc2g6ICcnXG5cdFx0XHRcdH0sIHdvcmtzcGFjZVJvb3QsIHVzZXJIb21lKTtcblx0XHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChyZXN1bHQsIHtcblx0XHRcdFx0XHR0eXBlOiAnY29tbWFuZCcsXG5cdFx0XHRcdFx0Y3dkOiB3b3Jrc3BhY2VSb290XG5cdFx0XHRcdH0pO1xuXHRcdFx0fSk7XG5cdFx0fSk7XG5cblx0XHRzdWl0ZSgncG93ZXJzaGVsbCBsZWdhY3kgbWFwcGluZycsICgpID0+IHtcblx0XHRcdHRlc3QoJ3Bvd2Vyc2hlbGwgbWFwcyB0byB3aW5kb3dzJywgKCkgPT4ge1xuXHRcdFx0XHRjb25zdCByZXN1bHQgPSByZXNvbHZlSG9va0NvbW1hbmQoe1xuXHRcdFx0XHRcdHR5cGU6ICdjb21tYW5kJyxcblx0XHRcdFx0XHRwb3dlcnNoZWxsOiAnV3JpdGUtSG9zdCBcImhlbGxvXCInXG5cdFx0XHRcdH0sIHdvcmtzcGFjZVJvb3QsIHVzZXJIb21lKTtcblx0XHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChyZXN1bHQsIHtcblx0XHRcdFx0XHR0eXBlOiAnY29tbWFuZCcsXG5cdFx0XHRcdFx0d2luZG93czogJ1dyaXRlLUhvc3QgXCJoZWxsb1wiJyxcblx0XHRcdFx0XHR3aW5kb3dzU291cmNlOiAncG93ZXJzaGVsbCcsXG5cdFx0XHRcdFx0Y3dkOiB3b3Jrc3BhY2VSb290XG5cdFx0XHRcdH0pO1xuXHRcdFx0fSk7XG5cblx0XHRcdHRlc3QoJ3Bvd2Vyc2hlbGwgd2l0aCB0aW1lb3V0JywgKCkgPT4ge1xuXHRcdFx0XHRjb25zdCByZXN1bHQgPSByZXNvbHZlSG9va0NvbW1hbmQoe1xuXHRcdFx0XHRcdHR5cGU6ICdjb21tYW5kJyxcblx0XHRcdFx0XHRwb3dlcnNoZWxsOiAnR2V0LVByb2Nlc3MnLFxuXHRcdFx0XHRcdHRpbWVvdXQ6IDMwXG5cdFx0XHRcdH0sIHdvcmtzcGFjZVJvb3QsIHVzZXJIb21lKTtcblx0XHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChyZXN1bHQsIHtcblx0XHRcdFx0XHR0eXBlOiAnY29tbWFuZCcsXG5cdFx0XHRcdFx0d2luZG93czogJ0dldC1Qcm9jZXNzJyxcblx0XHRcdFx0XHR3aW5kb3dzU291cmNlOiAncG93ZXJzaGVsbCcsXG5cdFx0XHRcdFx0Y3dkOiB3b3Jrc3BhY2VSb290LFxuXHRcdFx0XHRcdHRpbWVvdXQ6IDMwXG5cdFx0XHRcdH0pO1xuXHRcdFx0fSk7XG5cblx0XHRcdHRlc3QoJ2VtcHR5IHBvd2Vyc2hlbGwgcmV0dXJucyBvYmplY3Qgd2l0aG91dCB3aW5kb3dzJywgKCkgPT4ge1xuXHRcdFx0XHRjb25zdCByZXN1bHQgPSByZXNvbHZlSG9va0NvbW1hbmQoe1xuXHRcdFx0XHRcdHR5cGU6ICdjb21tYW5kJyxcblx0XHRcdFx0XHRwb3dlcnNoZWxsOiAnJ1xuXHRcdFx0XHR9LCB3b3Jrc3BhY2VSb290LCB1c2VySG9tZSk7XG5cdFx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocmVzdWx0LCB7XG5cdFx0XHRcdFx0dHlwZTogJ2NvbW1hbmQnLFxuXHRcdFx0XHRcdGN3ZDogd29ya3NwYWNlUm9vdFxuXHRcdFx0XHR9KTtcblx0XHRcdH0pO1xuXHRcdH0pO1xuXG5cdFx0c3VpdGUoJ211bHRpcGxlIHByb3BlcnRpZXMgc3BlY2lmaWVkJywgKCkgPT4ge1xuXHRcdFx0dGVzdCgncHJlc2VydmVzIGNvbW1hbmQgd2l0aCBiYXNoIG1hcHBlZCB0byBsaW51eC9vc3gnLCAoKSA9PiB7XG5cdFx0XHRcdGNvbnN0IHJlc3VsdCA9IHJlc29sdmVIb29rQ29tbWFuZCh7XG5cdFx0XHRcdFx0dHlwZTogJ2NvbW1hbmQnLFxuXHRcdFx0XHRcdGNvbW1hbmQ6ICdkaXJlY3QtY29tbWFuZCcsXG5cdFx0XHRcdFx0YmFzaDogJ2Jhc2gtc2NyaXB0LnNoJ1xuXHRcdFx0XHR9LCB3b3Jrc3BhY2VSb290LCB1c2VySG9tZSk7XG5cdFx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocmVzdWx0LCB7XG5cdFx0XHRcdFx0dHlwZTogJ2NvbW1hbmQnLFxuXHRcdFx0XHRcdGNvbW1hbmQ6ICdkaXJlY3QtY29tbWFuZCcsXG5cdFx0XHRcdFx0bGludXg6ICdiYXNoLXNjcmlwdC5zaCcsXG5cdFx0XHRcdFx0b3N4OiAnYmFzaC1zY3JpcHQuc2gnLFxuXHRcdFx0XHRcdGxpbnV4U291cmNlOiAnYmFzaCcsXG5cdFx0XHRcdFx0b3N4U291cmNlOiAnYmFzaCcsXG5cdFx0XHRcdFx0Y3dkOiB3b3Jrc3BhY2VSb290XG5cdFx0XHRcdH0pO1xuXHRcdFx0fSk7XG5cblx0XHRcdHRlc3QoJ3ByZXNlcnZlcyBjb21tYW5kIHdpdGggcG93ZXJzaGVsbCBtYXBwZWQgdG8gd2luZG93cycsICgpID0+IHtcblx0XHRcdFx0Y29uc3QgcmVzdWx0ID0gcmVzb2x2ZUhvb2tDb21tYW5kKHtcblx0XHRcdFx0XHR0eXBlOiAnY29tbWFuZCcsXG5cdFx0XHRcdFx0Y29tbWFuZDogJ2RpcmVjdC1jb21tYW5kJyxcblx0XHRcdFx0XHRwb3dlcnNoZWxsOiAncHMtc2NyaXB0LnBzMSdcblx0XHRcdFx0fSwgd29ya3NwYWNlUm9vdCwgdXNlckhvbWUpO1xuXHRcdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHJlc3VsdCwge1xuXHRcdFx0XHRcdHR5cGU6ICdjb21tYW5kJyxcblx0XHRcdFx0XHRjb21tYW5kOiAnZGlyZWN0LWNvbW1hbmQnLFxuXHRcdFx0XHRcdHdpbmRvd3M6ICdwcy1zY3JpcHQucHMxJyxcblx0XHRcdFx0XHR3aW5kb3dzU291cmNlOiAncG93ZXJzaGVsbCcsXG5cdFx0XHRcdFx0Y3dkOiB3b3Jrc3BhY2VSb290XG5cdFx0XHRcdH0pO1xuXHRcdFx0fSk7XG5cblx0XHRcdHRlc3QoJ2Jhc2ggYW5kIHBvd2Vyc2hlbGwgbWFwIHRvIGFsbCBwbGF0Zm9ybXMnLCAoKSA9PiB7XG5cdFx0XHRcdGNvbnN0IHJlc3VsdCA9IHJlc29sdmVIb29rQ29tbWFuZCh7XG5cdFx0XHRcdFx0dHlwZTogJ2NvbW1hbmQnLFxuXHRcdFx0XHRcdGJhc2g6ICdiYXNoLXNjcmlwdC5zaCcsXG5cdFx0XHRcdFx0cG93ZXJzaGVsbDogJ3BzLXNjcmlwdC5wczEnXG5cdFx0XHRcdH0sIHdvcmtzcGFjZVJvb3QsIHVzZXJIb21lKTtcblx0XHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChyZXN1bHQsIHtcblx0XHRcdFx0XHR0eXBlOiAnY29tbWFuZCcsXG5cdFx0XHRcdFx0d2luZG93czogJ3BzLXNjcmlwdC5wczEnLFxuXHRcdFx0XHRcdGxpbnV4OiAnYmFzaC1zY3JpcHQuc2gnLFxuXHRcdFx0XHRcdG9zeDogJ2Jhc2gtc2NyaXB0LnNoJyxcblx0XHRcdFx0XHR3aW5kb3dzU291cmNlOiAncG93ZXJzaGVsbCcsXG5cdFx0XHRcdFx0bGludXhTb3VyY2U6ICdiYXNoJyxcblx0XHRcdFx0XHRvc3hTb3VyY2U6ICdiYXNoJyxcblx0XHRcdFx0XHRjd2Q6IHdvcmtzcGFjZVJvb3Rcblx0XHRcdFx0fSk7XG5cdFx0XHR9KTtcblx0XHR9KTtcblxuXHRcdHN1aXRlKCdjd2QgcmVzb2x1dGlvbicsICgpID0+IHtcblx0XHRcdHRlc3QoJ2N3ZCBpcyBub3QgcmVzb2x2ZWQgd2hlbiBubyB3b3Jrc3BhY2Ugcm9vdCcsICgpID0+IHtcblx0XHRcdFx0Y29uc3QgcmVzdWx0ID0gcmVzb2x2ZUhvb2tDb21tYW5kKHtcblx0XHRcdFx0XHR0eXBlOiAnY29tbWFuZCcsXG5cdFx0XHRcdFx0Y29tbWFuZDogJ2VjaG8gaGVsbG8nLFxuXHRcdFx0XHRcdGN3ZDogJ3NyYydcblx0XHRcdFx0fSwgdW5kZWZpbmVkLCB1c2VySG9tZSk7XG5cdFx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocmVzdWx0LCB7XG5cdFx0XHRcdFx0dHlwZTogJ2NvbW1hbmQnLFxuXHRcdFx0XHRcdGNvbW1hbmQ6ICdlY2hvIGhlbGxvJ1xuXHRcdFx0XHR9KTtcblx0XHRcdH0pO1xuXG5cdFx0XHR0ZXN0KCdjd2QgaXMgcmVzb2x2ZWQgcmVsYXRpdmUgdG8gd29ya3NwYWNlIHJvb3QnLCAoKSA9PiB7XG5cdFx0XHRcdGNvbnN0IHJlc3VsdCA9IHJlc29sdmVIb29rQ29tbWFuZCh7XG5cdFx0XHRcdFx0dHlwZTogJ2NvbW1hbmQnLFxuXHRcdFx0XHRcdGNvbW1hbmQ6ICdlY2hvIGhlbGxvJyxcblx0XHRcdFx0XHRjd2Q6ICduZXN0ZWQvcGF0aCdcblx0XHRcdFx0fSwgd29ya3NwYWNlUm9vdCwgdXNlckhvbWUpO1xuXHRcdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHJlc3VsdCwge1xuXHRcdFx0XHRcdHR5cGU6ICdjb21tYW5kJyxcblx0XHRcdFx0XHRjb21tYW5kOiAnZWNobyBoZWxsbycsXG5cdFx0XHRcdFx0Y3dkOiBVUkkuZmlsZSgnL3dvcmtzcGFjZS9uZXN0ZWQvcGF0aCcpXG5cdFx0XHRcdH0pO1xuXHRcdFx0fSk7XG5cdFx0fSk7XG5cblx0XHRzdWl0ZSgnaW52YWxpZCBpbnB1dHMnLCAoKSA9PiB7XG5cdFx0XHR0ZXN0KCd3cm9uZyB0eXBlIHJldHVybnMgdW5kZWZpbmVkJywgKCkgPT4ge1xuXHRcdFx0XHRjb25zdCByZXN1bHQgPSByZXNvbHZlSG9va0NvbW1hbmQoe1xuXHRcdFx0XHRcdHR5cGU6ICdzY3JpcHQnLFxuXHRcdFx0XHRcdGNvbW1hbmQ6ICdlY2hvIGhlbGxvJ1xuXHRcdFx0XHR9LCB3b3Jrc3BhY2VSb290LCB1c2VySG9tZSk7XG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQsIHVuZGVmaW5lZCk7XG5cdFx0XHR9KTtcblxuXHRcdFx0dGVzdCgnbWlzc2luZyB0eXBlIHJldHVybnMgdW5kZWZpbmVkJywgKCkgPT4ge1xuXHRcdFx0XHRjb25zdCByZXN1bHQgPSByZXNvbHZlSG9va0NvbW1hbmQoe1xuXHRcdFx0XHRcdGNvbW1hbmQ6ICdlY2hvIGhlbGxvJ1xuXHRcdFx0XHR9LCB3b3Jrc3BhY2VSb290LCB1c2VySG9tZSk7XG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQsIHVuZGVmaW5lZCk7XG5cdFx0XHR9KTtcblxuXHRcdFx0dGVzdCgnbm8gY29tbWFuZCByZXR1cm5zIG9iamVjdCB3aXRoIGp1c3QgdHlwZSBhbmQgY3dkJywgKCkgPT4ge1xuXHRcdFx0XHRjb25zdCByZXN1bHQgPSByZXNvbHZlSG9va0NvbW1hbmQoe1xuXHRcdFx0XHRcdHR5cGU6ICdjb21tYW5kJyxcblx0XHRcdFx0XHRjd2Q6ICcvd29ya3NwYWNlJ1xuXHRcdFx0XHR9LCB3b3Jrc3BhY2VSb290LCB1c2VySG9tZSk7XG5cdFx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocmVzdWx0LCB7XG5cdFx0XHRcdFx0dHlwZTogJ2NvbW1hbmQnLFxuXHRcdFx0XHRcdGN3ZDogVVJJLmZpbGUoJy93b3Jrc3BhY2UnKVxuXHRcdFx0XHR9KTtcblx0XHRcdH0pO1xuXG5cdFx0XHR0ZXN0KCdpZ25vcmVzIG5vbi1zdHJpbmcgY3dkJywgKCkgPT4ge1xuXHRcdFx0XHRjb25zdCByZXN1bHQgPSByZXNvbHZlSG9va0NvbW1hbmQoe1xuXHRcdFx0XHRcdHR5cGU6ICdjb21tYW5kJyxcblx0XHRcdFx0XHRjb21tYW5kOiAnZWNobyBoZWxsbycsXG5cdFx0XHRcdFx0Y3dkOiAxMjNcblx0XHRcdFx0fSwgd29ya3NwYWNlUm9vdCwgdXNlckhvbWUpO1xuXHRcdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHJlc3VsdCwge1xuXHRcdFx0XHRcdHR5cGU6ICdjb21tYW5kJyxcblx0XHRcdFx0XHRjb21tYW5kOiAnZWNobyBoZWxsbycsXG5cdFx0XHRcdFx0Y3dkOiB3b3Jrc3BhY2VSb290XG5cdFx0XHRcdH0pO1xuXHRcdFx0fSk7XG5cblx0XHRcdHRlc3QoJ2lnbm9yZXMgbm9uLW9iamVjdCBlbnYnLCAoKSA9PiB7XG5cdFx0XHRcdGNvbnN0IHJlc3VsdCA9IHJlc29sdmVIb29rQ29tbWFuZCh7XG5cdFx0XHRcdFx0dHlwZTogJ2NvbW1hbmQnLFxuXHRcdFx0XHRcdGNvbW1hbmQ6ICdlY2hvIGhlbGxvJyxcblx0XHRcdFx0XHRlbnY6ICdpbnZhbGlkJ1xuXHRcdFx0XHR9LCB3b3Jrc3BhY2VSb290LCB1c2VySG9tZSk7XG5cdFx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocmVzdWx0LCB7XG5cdFx0XHRcdFx0dHlwZTogJ2NvbW1hbmQnLFxuXHRcdFx0XHRcdGNvbW1hbmQ6ICdlY2hvIGhlbGxvJyxcblx0XHRcdFx0XHRjd2Q6IHdvcmtzcGFjZVJvb3Rcblx0XHRcdFx0fSk7XG5cdFx0XHR9KTtcblxuXHRcdFx0dGVzdCgnaWdub3JlcyBub24tbnVtYmVyIHRpbWVvdXQnLCAoKSA9PiB7XG5cdFx0XHRcdGNvbnN0IHJlc3VsdCA9IHJlc29sdmVIb29rQ29tbWFuZCh7XG5cdFx0XHRcdFx0dHlwZTogJ2NvbW1hbmQnLFxuXHRcdFx0XHRcdGNvbW1hbmQ6ICdlY2hvIGhlbGxvJyxcblx0XHRcdFx0XHR0aW1lb3V0OiAnMzAnXG5cdFx0XHRcdH0sIHdvcmtzcGFjZVJvb3QsIHVzZXJIb21lKTtcblx0XHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChyZXN1bHQsIHtcblx0XHRcdFx0XHR0eXBlOiAnY29tbWFuZCcsXG5cdFx0XHRcdFx0Y29tbWFuZDogJ2VjaG8gaGVsbG8nLFxuXHRcdFx0XHRcdGN3ZDogd29ya3NwYWNlUm9vdFxuXHRcdFx0XHR9KTtcblx0XHRcdH0pO1xuXHRcdH0pO1xuXG5cdFx0c3VpdGUoJ3BsYXRmb3JtLXNwZWNpZmljIG92ZXJyaWRlcycsICgpID0+IHtcblx0XHRcdHRlc3QoJ3ByZXNlcnZlcyB3aW5kb3dzIG92ZXJyaWRlIGFzIHN0cmluZycsICgpID0+IHtcblx0XHRcdFx0Y29uc3QgcmVzdWx0ID0gcmVzb2x2ZUhvb2tDb21tYW5kKHtcblx0XHRcdFx0XHR0eXBlOiAnY29tbWFuZCcsXG5cdFx0XHRcdFx0Y29tbWFuZDogJ2RlZmF1bHQtY29tbWFuZCcsXG5cdFx0XHRcdFx0d2luZG93czogJ3dpbi1jb21tYW5kJ1xuXHRcdFx0XHR9LCB3b3Jrc3BhY2VSb290LCB1c2VySG9tZSk7XG5cdFx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocmVzdWx0LCB7XG5cdFx0XHRcdFx0dHlwZTogJ2NvbW1hbmQnLFxuXHRcdFx0XHRcdGNvbW1hbmQ6ICdkZWZhdWx0LWNvbW1hbmQnLFxuXHRcdFx0XHRcdHdpbmRvd3M6ICd3aW4tY29tbWFuZCcsXG5cdFx0XHRcdFx0d2luZG93c1NvdXJjZTogJ3dpbmRvd3MnLFxuXHRcdFx0XHRcdGN3ZDogd29ya3NwYWNlUm9vdFxuXHRcdFx0XHR9KTtcblx0XHRcdH0pO1xuXG5cdFx0XHR0ZXN0KCdwcmVzZXJ2ZXMgbGludXggb3ZlcnJpZGUgYXMgc3RyaW5nJywgKCkgPT4ge1xuXHRcdFx0XHRjb25zdCByZXN1bHQgPSByZXNvbHZlSG9va0NvbW1hbmQoe1xuXHRcdFx0XHRcdHR5cGU6ICdjb21tYW5kJyxcblx0XHRcdFx0XHRjb21tYW5kOiAnZGVmYXVsdC1jb21tYW5kJyxcblx0XHRcdFx0XHRsaW51eDogJ2xpbnV4LWNvbW1hbmQnXG5cdFx0XHRcdH0sIHdvcmtzcGFjZVJvb3QsIHVzZXJIb21lKTtcblx0XHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChyZXN1bHQsIHtcblx0XHRcdFx0XHR0eXBlOiAnY29tbWFuZCcsXG5cdFx0XHRcdFx0Y29tbWFuZDogJ2RlZmF1bHQtY29tbWFuZCcsXG5cdFx0XHRcdFx0bGludXg6ICdsaW51eC1jb21tYW5kJyxcblx0XHRcdFx0XHRsaW51eFNvdXJjZTogJ2xpbnV4Jyxcblx0XHRcdFx0XHRjd2Q6IHdvcmtzcGFjZVJvb3Rcblx0XHRcdFx0fSk7XG5cdFx0XHR9KTtcblxuXHRcdFx0dGVzdCgncHJlc2VydmVzIG9zeCBvdmVycmlkZSBhcyBzdHJpbmcnLCAoKSA9PiB7XG5cdFx0XHRcdGNvbnN0IHJlc3VsdCA9IHJlc29sdmVIb29rQ29tbWFuZCh7XG5cdFx0XHRcdFx0dHlwZTogJ2NvbW1hbmQnLFxuXHRcdFx0XHRcdGNvbW1hbmQ6ICdkZWZhdWx0LWNvbW1hbmQnLFxuXHRcdFx0XHRcdG9zeDogJ29zeC1jb21tYW5kJ1xuXHRcdFx0XHR9LCB3b3Jrc3BhY2VSb290LCB1c2VySG9tZSk7XG5cdFx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocmVzdWx0LCB7XG5cdFx0XHRcdFx0dHlwZTogJ2NvbW1hbmQnLFxuXHRcdFx0XHRcdGNvbW1hbmQ6ICdkZWZhdWx0LWNvbW1hbmQnLFxuXHRcdFx0XHRcdG9zeDogJ29zeC1jb21tYW5kJyxcblx0XHRcdFx0XHRvc3hTb3VyY2U6ICdvc3gnLFxuXHRcdFx0XHRcdGN3ZDogd29ya3NwYWNlUm9vdFxuXHRcdFx0XHR9KTtcblx0XHRcdH0pO1xuXG5cdFx0XHR0ZXN0KCdwcmVzZXJ2ZXMgYWxsIHBsYXRmb3JtIG92ZXJyaWRlcycsICgpID0+IHtcblx0XHRcdFx0Y29uc3QgcmVzdWx0ID0gcmVzb2x2ZUhvb2tDb21tYW5kKHtcblx0XHRcdFx0XHR0eXBlOiAnY29tbWFuZCcsXG5cdFx0XHRcdFx0Y29tbWFuZDogJ2RlZmF1bHQtY29tbWFuZCcsXG5cdFx0XHRcdFx0d2luZG93czogJ3dpbi1jb21tYW5kJyxcblx0XHRcdFx0XHRsaW51eDogJ2xpbnV4LWNvbW1hbmQnLFxuXHRcdFx0XHRcdG9zeDogJ29zeC1jb21tYW5kJ1xuXHRcdFx0XHR9LCB3b3Jrc3BhY2VSb290LCB1c2VySG9tZSk7XG5cdFx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocmVzdWx0LCB7XG5cdFx0XHRcdFx0dHlwZTogJ2NvbW1hbmQnLFxuXHRcdFx0XHRcdGNvbW1hbmQ6ICdkZWZhdWx0LWNvbW1hbmQnLFxuXHRcdFx0XHRcdHdpbmRvd3M6ICd3aW4tY29tbWFuZCcsXG5cdFx0XHRcdFx0bGludXg6ICdsaW51eC1jb21tYW5kJyxcblx0XHRcdFx0XHRvc3g6ICdvc3gtY29tbWFuZCcsXG5cdFx0XHRcdFx0d2luZG93c1NvdXJjZTogJ3dpbmRvd3MnLFxuXHRcdFx0XHRcdGxpbnV4U291cmNlOiAnbGludXgnLFxuXHRcdFx0XHRcdG9zeFNvdXJjZTogJ29zeCcsXG5cdFx0XHRcdFx0Y3dkOiB3b3Jrc3BhY2VSb290XG5cdFx0XHRcdH0pO1xuXHRcdFx0fSk7XG5cblx0XHRcdHRlc3QoJ2V4cGxpY2l0IHBsYXRmb3JtIG92ZXJyaWRlIHRha2VzIHByZWNlZGVuY2Ugb3ZlciBiYXNoL3Bvd2Vyc2hlbGwgbWFwcGluZycsICgpID0+IHtcblx0XHRcdFx0Y29uc3QgcmVzdWx0ID0gcmVzb2x2ZUhvb2tDb21tYW5kKHtcblx0XHRcdFx0XHR0eXBlOiAnY29tbWFuZCcsXG5cdFx0XHRcdFx0YmFzaDogJ2RlZmF1bHQuc2gnLFxuXHRcdFx0XHRcdGxpbnV4OiAnZXhwbGljaXQtbGludXguc2gnXG5cdFx0XHRcdH0sIHdvcmtzcGFjZVJvb3QsIHVzZXJIb21lKTtcblx0XHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChyZXN1bHQsIHtcblx0XHRcdFx0XHR0eXBlOiAnY29tbWFuZCcsXG5cdFx0XHRcdFx0bGludXg6ICdleHBsaWNpdC1saW51eC5zaCcsXG5cdFx0XHRcdFx0b3N4OiAnZGVmYXVsdC5zaCcsXG5cdFx0XHRcdFx0bGludXhTb3VyY2U6ICdsaW51eCcsXG5cdFx0XHRcdFx0b3N4U291cmNlOiAnYmFzaCcsXG5cdFx0XHRcdFx0Y3dkOiB3b3Jrc3BhY2VSb290XG5cdFx0XHRcdH0pO1xuXHRcdFx0fSk7XG5cblx0XHRcdHRlc3QoJ2lnbm9yZXMgZW1wdHkgcGxhdGZvcm0gb3ZlcnJpZGUnLCAoKSA9PiB7XG5cdFx0XHRcdGNvbnN0IHJlc3VsdCA9IHJlc29sdmVIb29rQ29tbWFuZCh7XG5cdFx0XHRcdFx0dHlwZTogJ2NvbW1hbmQnLFxuXHRcdFx0XHRcdGNvbW1hbmQ6ICdkZWZhdWx0LWNvbW1hbmQnLFxuXHRcdFx0XHRcdHdpbmRvd3M6ICcnXG5cdFx0XHRcdH0sIHdvcmtzcGFjZVJvb3QsIHVzZXJIb21lKTtcblx0XHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChyZXN1bHQsIHtcblx0XHRcdFx0XHR0eXBlOiAnY29tbWFuZCcsXG5cdFx0XHRcdFx0Y29tbWFuZDogJ2RlZmF1bHQtY29tbWFuZCcsXG5cdFx0XHRcdFx0Y3dkOiB3b3Jrc3BhY2VSb290XG5cdFx0XHRcdH0pO1xuXHRcdFx0fSk7XG5cblx0XHRcdHRlc3QoJ2lnbm9yZXMgbm9uLXN0cmluZyBwbGF0Zm9ybSBvdmVycmlkZScsICgpID0+IHtcblx0XHRcdFx0Y29uc3QgcmVzdWx0ID0gcmVzb2x2ZUhvb2tDb21tYW5kKHtcblx0XHRcdFx0XHR0eXBlOiAnY29tbWFuZCcsXG5cdFx0XHRcdFx0Y29tbWFuZDogJ2RlZmF1bHQtY29tbWFuZCcsXG5cdFx0XHRcdFx0d2luZG93czogeyBjb21tYW5kOiAnaW52YWxpZCcgfVxuXHRcdFx0XHR9LCB3b3Jrc3BhY2VSb290LCB1c2VySG9tZSk7XG5cdFx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocmVzdWx0LCB7XG5cdFx0XHRcdFx0dHlwZTogJ2NvbW1hbmQnLFxuXHRcdFx0XHRcdGNvbW1hbmQ6ICdkZWZhdWx0LWNvbW1hbmQnLFxuXHRcdFx0XHRcdGN3ZDogd29ya3NwYWNlUm9vdFxuXHRcdFx0XHR9KTtcblx0XHRcdH0pO1xuXHRcdH0pO1xuXHR9KTtcblxuXHRzdWl0ZSgncmVzb2x2ZUVmZmVjdGl2ZUNvbW1hbmQnLCAoKSA9PiB7XG5cdFx0dGVzdCgncmV0dXJucyBiYXNlIGNvbW1hbmQgd2hlbiBubyBwbGF0Zm9ybSBvdmVycmlkZScsICgpID0+IHtcblx0XHRcdGNvbnN0IGhvb2s6IElIb29rQ29tbWFuZCA9IHtcblx0XHRcdFx0dHlwZTogJ2NvbW1hbmQnLFxuXHRcdFx0XHRjb21tYW5kOiAnZGVmYXVsdC1jb21tYW5kJ1xuXHRcdFx0fTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXNvbHZlRWZmZWN0aXZlQ29tbWFuZChob29rLCBPcGVyYXRpbmdTeXN0ZW0uV2luZG93cyksICdkZWZhdWx0LWNvbW1hbmQnKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXNvbHZlRWZmZWN0aXZlQ29tbWFuZChob29rLCBPcGVyYXRpbmdTeXN0ZW0uTWFjaW50b3NoKSwgJ2RlZmF1bHQtY29tbWFuZCcpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc29sdmVFZmZlY3RpdmVDb21tYW5kKGhvb2ssIE9wZXJhdGluZ1N5c3RlbS5MaW51eCksICdkZWZhdWx0LWNvbW1hbmQnKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2FwcGxpZXMgcGxhdGZvcm0gb3ZlcnJpZGUgZm9yIGVhY2ggcGxhdGZvcm0nLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBob29rOiBJSG9va0NvbW1hbmQgPSB7XG5cdFx0XHRcdHR5cGU6ICdjb21tYW5kJyxcblx0XHRcdFx0Y29tbWFuZDogJ2RlZmF1bHQtY29tbWFuZCcsXG5cdFx0XHRcdHdpbmRvd3M6ICd3aW4tY29tbWFuZCcsXG5cdFx0XHRcdGxpbnV4OiAnbGludXgtY29tbWFuZCcsXG5cdFx0XHRcdG9zeDogJ29zeC1jb21tYW5kJ1xuXHRcdFx0fTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXNvbHZlRWZmZWN0aXZlQ29tbWFuZChob29rLCBPcGVyYXRpbmdTeXN0ZW0uV2luZG93cyksICd3aW4tY29tbWFuZCcpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc29sdmVFZmZlY3RpdmVDb21tYW5kKGhvb2ssIE9wZXJhdGluZ1N5c3RlbS5NYWNpbnRvc2gpLCAnb3N4LWNvbW1hbmQnKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXNvbHZlRWZmZWN0aXZlQ29tbWFuZChob29rLCBPcGVyYXRpbmdTeXN0ZW0uTGludXgpLCAnbGludXgtY29tbWFuZCcpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnZmFsbHMgYmFjayB0byBjb21tYW5kIHdoZW4gbm8gcGxhdGZvcm0tc3BlY2lmaWMgb3ZlcnJpZGUnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBob29rOiBJSG9va0NvbW1hbmQgPSB7XG5cdFx0XHRcdHR5cGU6ICdjb21tYW5kJyxcblx0XHRcdFx0Y29tbWFuZDogJ2RlZmF1bHQtY29tbWFuZCdcblx0XHRcdH07XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzb2x2ZUVmZmVjdGl2ZUNvbW1hbmQoaG9vaywgT3BlcmF0aW5nU3lzdGVtLldpbmRvd3MpLCAnZGVmYXVsdC1jb21tYW5kJyk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdyZXR1cm5zIHVuZGVmaW5lZCB3aGVuIG5vIGNvbW1hbmQgYXQgYWxsJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgaG9vazogSUhvb2tDb21tYW5kID0ge1xuXHRcdFx0XHR0eXBlOiAnY29tbWFuZCdcblx0XHRcdH07XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzb2x2ZUVmZmVjdGl2ZUNvbW1hbmQoaG9vaywgT3BlcmF0aW5nU3lzdGVtLldpbmRvd3MpLCB1bmRlZmluZWQpO1xuXHRcdH0pO1xuXHR9KTtcblxuXHRzdWl0ZSgnZm9ybWF0SG9va0NvbW1hbmRMYWJlbCcsICgpID0+IHtcblx0XHR0ZXN0KCdmb3JtYXRzIGNvbW1hbmQgd2hlbiBwcmVzZW50IChubyBwbGF0Zm9ybSBvdmVycmlkZSknLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBob29rOiBJSG9va0NvbW1hbmQgPSB7XG5cdFx0XHRcdHR5cGU6ICdjb21tYW5kJyxcblx0XHRcdFx0Y29tbWFuZDogJ2VjaG8gaGVsbG8nXG5cdFx0XHR9O1xuXHRcdFx0Ly8gTm8gcGxhdGZvcm0gYmFkZ2Ugd2hlbiB1c2luZyBkZWZhdWx0IGNvbW1hbmRcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChmb3JtYXRIb29rQ29tbWFuZExhYmVsKGhvb2ssIE9wZXJhdGluZ1N5c3RlbS5XaW5kb3dzKSwgJ2VjaG8gaGVsbG8nKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChmb3JtYXRIb29rQ29tbWFuZExhYmVsKGhvb2ssIE9wZXJhdGluZ1N5c3RlbS5NYWNpbnRvc2gpLCAnZWNobyBoZWxsbycpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGZvcm1hdEhvb2tDb21tYW5kTGFiZWwoaG9vaywgT3BlcmF0aW5nU3lzdGVtLkxpbnV4KSwgJ2VjaG8gaGVsbG8nKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3JldHVybnMgZW1wdHkgc3RyaW5nIHdoZW4gbm8gY29tbWFuZCcsICgpID0+IHtcblx0XHRcdGNvbnN0IGhvb2s6IElIb29rQ29tbWFuZCA9IHtcblx0XHRcdFx0dHlwZTogJ2NvbW1hbmQnXG5cdFx0XHR9O1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGZvcm1hdEhvb2tDb21tYW5kTGFiZWwoaG9vaywgT3BlcmF0aW5nU3lzdGVtLldpbmRvd3MpLCAnJyk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdhcHBsaWVzIHBsYXRmb3JtIG92ZXJyaWRlIGZvciBkaXNwbGF5JywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgaG9vazogSUhvb2tDb21tYW5kID0ge1xuXHRcdFx0XHR0eXBlOiAnY29tbWFuZCcsXG5cdFx0XHRcdGNvbW1hbmQ6ICdkZWZhdWx0LWNvbW1hbmQnLFxuXHRcdFx0XHR3aW5kb3dzOiAnd2luLWNvbW1hbmQnLFxuXHRcdFx0XHRsaW51eDogJ2xpbnV4LWNvbW1hbmQnLFxuXHRcdFx0XHRvc3g6ICdvc3gtY29tbWFuZCdcblx0XHRcdH07XG5cdFx0XHQvLyBTaG91bGQgcmVzb2x2ZSB0byBwbGF0Zm9ybS1zcGVjaWZpYyBjb21tYW5kXG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZm9ybWF0SG9va0NvbW1hbmRMYWJlbChob29rLCBPcGVyYXRpbmdTeXN0ZW0uV2luZG93cyksICd3aW4tY29tbWFuZCcpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGZvcm1hdEhvb2tDb21tYW5kTGFiZWwoaG9vaywgT3BlcmF0aW5nU3lzdGVtLk1hY2ludG9zaCksICdvc3gtY29tbWFuZCcpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGZvcm1hdEhvb2tDb21tYW5kTGFiZWwoaG9vaywgT3BlcmF0aW5nU3lzdGVtLkxpbnV4KSwgJ2xpbnV4LWNvbW1hbmQnKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ25vIHBsYXRmb3JtIGJhZGdlIHdoZW4gZmFsbGluZyBiYWNrIHRvIGRlZmF1bHQgY29tbWFuZCcsICgpID0+IHtcblx0XHRcdGNvbnN0IGhvb2s6IElIb29rQ29tbWFuZCA9IHtcblx0XHRcdFx0dHlwZTogJ2NvbW1hbmQnLFxuXHRcdFx0XHRjb21tYW5kOiAnZGVmYXVsdC1jb21tYW5kJ1xuXHRcdFx0XHQvLyBObyBwbGF0Zm9ybS1zcGVjaWZpYyBvdmVycmlkZXNcblx0XHRcdH07XG5cdFx0XHQvLyBTaG91bGQgbm90IGluY2x1ZGUgYmFkZ2Ugd2hlbiB1c2luZyBkZWZhdWx0IGNvbW1hbmRcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChmb3JtYXRIb29rQ29tbWFuZExhYmVsKGhvb2ssIE9wZXJhdGluZ1N5c3RlbS5XaW5kb3dzKSwgJ2RlZmF1bHQtY29tbWFuZCcpO1xuXHRcdH0pO1xuXHR9KTtcblxuXHRzdWl0ZSgncGFyc2VTdWJhZ2VudEhvb2tzRnJvbVlhbWwnLCAoKSA9PiB7XG5cblx0XHRjb25zdCB3b3Jrc3BhY2VSb290ID0gVVJJLmZpbGUoJy93b3Jrc3BhY2UnKTtcblx0XHRjb25zdCB1c2VySG9tZSA9ICcvaG9tZS91c2VyJztcblxuXHRcdGNvbnN0IGR1bW15UmFuZ2UgPSBuZXcgUmFuZ2UoMSwgMSwgMSwgMSk7XG5cblx0XHRmdW5jdGlvbiBtYWtlU2NhbGFyKHZhbHVlOiBzdHJpbmcpOiBpbXBvcnQoJy4uLy4uLy4uL2NvbW1vbi9wcm9tcHRTeW50YXgvcHJvbXB0RmlsZVBhcnNlci5qcycpLklTY2FsYXJWYWx1ZSB7XG5cdFx0XHRyZXR1cm4geyB0eXBlOiAnc2NhbGFyJywgdmFsdWUsIHJhbmdlOiBkdW1teVJhbmdlLCBmb3JtYXQ6ICdub25lJyB9O1xuXHRcdH1cblxuXHRcdGZ1bmN0aW9uIG1ha2VNYXAoZW50cmllczogUmVjb3JkPHN0cmluZywgaW1wb3J0KCcuLi8uLi8uLi9jb21tb24vcHJvbXB0U3ludGF4L3Byb21wdEZpbGVQYXJzZXIuanMnKS5JVmFsdWU+KTogaW1wb3J0KCcuLi8uLi8uLi9jb21tb24vcHJvbXB0U3ludGF4L3Byb21wdEZpbGVQYXJzZXIuanMnKS5JTWFwVmFsdWUge1xuXHRcdFx0Y29uc3QgcHJvcGVydGllcyA9IE9iamVjdC5lbnRyaWVzKGVudHJpZXMpLm1hcCgoW2tleSwgdmFsdWVdKSA9PiAoe1xuXHRcdFx0XHRrZXk6IG1ha2VTY2FsYXIoa2V5KSxcblx0XHRcdFx0dmFsdWUsXG5cdFx0XHR9KSk7XG5cdFx0XHRyZXR1cm4geyB0eXBlOiAnbWFwJywgcHJvcGVydGllcywgcmFuZ2U6IGR1bW15UmFuZ2UgfTtcblx0XHR9XG5cblx0XHRmdW5jdGlvbiBtYWtlU2VxdWVuY2UoaXRlbXM6IGltcG9ydCgnLi4vLi4vLi4vY29tbW9uL3Byb21wdFN5bnRheC9wcm9tcHRGaWxlUGFyc2VyLmpzJykuSVZhbHVlW10pOiBpbXBvcnQoJy4uLy4uLy4uL2NvbW1vbi9wcm9tcHRTeW50YXgvcHJvbXB0RmlsZVBhcnNlci5qcycpLklTZXF1ZW5jZVZhbHVlIHtcblx0XHRcdHJldHVybiB7IHR5cGU6ICdzZXF1ZW5jZScsIGl0ZW1zLCByYW5nZTogZHVtbXlSYW5nZSB9O1xuXHRcdH1cblxuXHRcdHRlc3QoJ3BhcnNlcyBkaXJlY3QgY29tbWFuZCBmb3JtYXQgKHdpdGhvdXQgbWF0Y2hlciknLCAoKSA9PiB7XG5cdFx0XHQvLyBob29rczpcblx0XHRcdC8vICAgUHJlVG9vbFVzZTpcblx0XHRcdC8vICAgICAtIHR5cGU6IGNvbW1hbmRcblx0XHRcdC8vICAgICAgIGNvbW1hbmQ6IFwiLi9zY3JpcHRzL3ZhbGlkYXRlLnNoXCJcblx0XHRcdGNvbnN0IGhvb2tzTWFwID0gbWFrZU1hcCh7XG5cdFx0XHRcdCdQcmVUb29sVXNlJzogbWFrZVNlcXVlbmNlKFtcblx0XHRcdFx0XHRtYWtlTWFwKHtcblx0XHRcdFx0XHRcdCd0eXBlJzogbWFrZVNjYWxhcignY29tbWFuZCcpLFxuXHRcdFx0XHRcdFx0J2NvbW1hbmQnOiBtYWtlU2NhbGFyKCcuL3NjcmlwdHMvdmFsaWRhdGUuc2gnKSxcblx0XHRcdFx0XHR9KSxcblx0XHRcdFx0XSksXG5cdFx0XHR9KTtcblxuXHRcdFx0Y29uc3QgcmVzdWx0ID0gcGFyc2VTdWJhZ2VudEhvb2tzRnJvbVlhbWwoaG9va3NNYXAsIHdvcmtzcGFjZVJvb3QsIHVzZXJIb21lKTtcblxuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdFtIb29rVHlwZS5QcmVUb29sVXNlXT8ubGVuZ3RoLCAxKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHRbSG9va1R5cGUuUHJlVG9vbFVzZV0hWzBdLmNvbW1hbmQsICcuL3NjcmlwdHMvdmFsaWRhdGUuc2gnKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3BhcnNlcyBDbGF1ZGUgZm9ybWF0ICh3aXRoIG1hdGNoZXIpJywgKCkgPT4ge1xuXHRcdFx0Ly8gaG9va3M6XG5cdFx0XHQvLyAgIFByZVRvb2xVc2U6XG5cdFx0XHQvLyAgICAgLSBtYXRjaGVyOiBcIkJhc2hcIlxuXHRcdFx0Ly8gICAgICAgaG9va3M6XG5cdFx0XHQvLyAgICAgICAgIC0gdHlwZTogY29tbWFuZFxuXHRcdFx0Ly8gICAgICAgICAgIGNvbW1hbmQ6IFwiLi9zY3JpcHRzL3ZhbGlkYXRlLXJlYWRvbmx5LnNoXCJcblx0XHRcdGNvbnN0IGhvb2tzTWFwID0gbWFrZU1hcCh7XG5cdFx0XHRcdCdQcmVUb29sVXNlJzogbWFrZVNlcXVlbmNlKFtcblx0XHRcdFx0XHRtYWtlTWFwKHtcblx0XHRcdFx0XHRcdCdtYXRjaGVyJzogbWFrZVNjYWxhcignQmFzaCcpLFxuXHRcdFx0XHRcdFx0J2hvb2tzJzogbWFrZVNlcXVlbmNlKFtcblx0XHRcdFx0XHRcdFx0bWFrZU1hcCh7XG5cdFx0XHRcdFx0XHRcdFx0J3R5cGUnOiBtYWtlU2NhbGFyKCdjb21tYW5kJyksXG5cdFx0XHRcdFx0XHRcdFx0J2NvbW1hbmQnOiBtYWtlU2NhbGFyKCcuL3NjcmlwdHMvdmFsaWRhdGUtcmVhZG9ubHkuc2gnKSxcblx0XHRcdFx0XHRcdFx0fSksXG5cdFx0XHRcdFx0XHRdKSxcblx0XHRcdFx0XHR9KSxcblx0XHRcdFx0XSksXG5cdFx0XHR9KTtcblxuXHRcdFx0Y29uc3QgcmVzdWx0ID0gcGFyc2VTdWJhZ2VudEhvb2tzRnJvbVlhbWwoaG9va3NNYXAsIHdvcmtzcGFjZVJvb3QsIHVzZXJIb21lKTtcblxuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdFtIb29rVHlwZS5QcmVUb29sVXNlXT8ubGVuZ3RoLCAxKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHRbSG9va1R5cGUuUHJlVG9vbFVzZV0hWzBdLmNvbW1hbmQsICcuL3NjcmlwdHMvdmFsaWRhdGUtcmVhZG9ubHkuc2gnKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3BhcnNlcyBtdWx0aXBsZSBob29rIHR5cGVzJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgaG9va3NNYXAgPSBtYWtlTWFwKHtcblx0XHRcdFx0J1ByZVRvb2xVc2UnOiBtYWtlU2VxdWVuY2UoW1xuXHRcdFx0XHRcdG1ha2VNYXAoe1xuXHRcdFx0XHRcdFx0J3R5cGUnOiBtYWtlU2NhbGFyKCdjb21tYW5kJyksXG5cdFx0XHRcdFx0XHQnY29tbWFuZCc6IG1ha2VTY2FsYXIoJy4vc2NyaXB0cy9wcmUuc2gnKSxcblx0XHRcdFx0XHR9KSxcblx0XHRcdFx0XSksXG5cdFx0XHRcdCdQb3N0VG9vbFVzZSc6IG1ha2VTZXF1ZW5jZShbXG5cdFx0XHRcdFx0bWFrZU1hcCh7XG5cdFx0XHRcdFx0XHQnbWF0Y2hlcic6IG1ha2VTY2FsYXIoJ0VkaXR8V3JpdGUnKSxcblx0XHRcdFx0XHRcdCdob29rcyc6IG1ha2VTZXF1ZW5jZShbXG5cdFx0XHRcdFx0XHRcdG1ha2VNYXAoe1xuXHRcdFx0XHRcdFx0XHRcdCd0eXBlJzogbWFrZVNjYWxhcignY29tbWFuZCcpLFxuXHRcdFx0XHRcdFx0XHRcdCdjb21tYW5kJzogbWFrZVNjYWxhcignLi9zY3JpcHRzL2xpbnQuc2gnKSxcblx0XHRcdFx0XHRcdFx0fSksXG5cdFx0XHRcdFx0XHRdKSxcblx0XHRcdFx0XHR9KSxcblx0XHRcdFx0XSksXG5cdFx0XHR9KTtcblxuXHRcdFx0Y29uc3QgcmVzdWx0ID0gcGFyc2VTdWJhZ2VudEhvb2tzRnJvbVlhbWwoaG9va3NNYXAsIHdvcmtzcGFjZVJvb3QsIHVzZXJIb21lKTtcblxuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdFtIb29rVHlwZS5QcmVUb29sVXNlXT8ubGVuZ3RoLCAxKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHRbSG9va1R5cGUuUHJlVG9vbFVzZV0hWzBdLmNvbW1hbmQsICcuL3NjcmlwdHMvcHJlLnNoJyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0W0hvb2tUeXBlLlBvc3RUb29sVXNlXT8ubGVuZ3RoLCAxKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHRbSG9va1R5cGUuUG9zdFRvb2xVc2VdIVswXS5jb21tYW5kLCAnLi9zY3JpcHRzL2xpbnQuc2gnKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3NraXBzIHVua25vd24gaG9vayB0eXBlcycsICgpID0+IHtcblx0XHRcdGNvbnN0IGhvb2tzTWFwID0gbWFrZU1hcCh7XG5cdFx0XHRcdCdVbmtub3duSG9vayc6IG1ha2VTZXF1ZW5jZShbXG5cdFx0XHRcdFx0bWFrZU1hcCh7XG5cdFx0XHRcdFx0XHQndHlwZSc6IG1ha2VTY2FsYXIoJ2NvbW1hbmQnKSxcblx0XHRcdFx0XHRcdCdjb21tYW5kJzogbWFrZVNjYWxhcignZWNobyBcImlnbm9yZWRcIicpLFxuXHRcdFx0XHRcdH0pLFxuXHRcdFx0XHRdKSxcblx0XHRcdH0pO1xuXG5cdFx0XHRjb25zdCByZXN1bHQgPSBwYXJzZVN1YmFnZW50SG9va3NGcm9tWWFtbChob29rc01hcCwgd29ya3NwYWNlUm9vdCwgdXNlckhvbWUpO1xuXG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0W0hvb2tUeXBlLlByZVRvb2xVc2VdLCB1bmRlZmluZWQpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdFtIb29rVHlwZS5Qb3N0VG9vbFVzZV0sIHVuZGVmaW5lZCk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdoYW5kbGVzIGNvbW1hbmQgd2l0aG91dCB0eXBlIGZpZWxkJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgaG9va3NNYXAgPSBtYWtlTWFwKHtcblx0XHRcdFx0J1ByZVRvb2xVc2UnOiBtYWtlU2VxdWVuY2UoW1xuXHRcdFx0XHRcdG1ha2VNYXAoe1xuXHRcdFx0XHRcdFx0J2NvbW1hbmQnOiBtYWtlU2NhbGFyKCcuL3NjcmlwdHMvdmFsaWRhdGUuc2gnKSxcblx0XHRcdFx0XHR9KSxcblx0XHRcdFx0XSksXG5cdFx0XHR9KTtcblxuXHRcdFx0Y29uc3QgcmVzdWx0ID0gcGFyc2VTdWJhZ2VudEhvb2tzRnJvbVlhbWwoaG9va3NNYXAsIHdvcmtzcGFjZVJvb3QsIHVzZXJIb21lKTtcblxuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdFtIb29rVHlwZS5QcmVUb29sVXNlXT8ubGVuZ3RoLCAxKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHRbSG9va1R5cGUuUHJlVG9vbFVzZV0hWzBdLmNvbW1hbmQsICcuL3NjcmlwdHMvdmFsaWRhdGUuc2gnKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3Jlc29sdmVzIGN3ZCByZWxhdGl2ZSB0byB3b3Jrc3BhY2UnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBob29rc01hcCA9IG1ha2VNYXAoe1xuXHRcdFx0XHQnU2Vzc2lvblN0YXJ0JzogbWFrZVNlcXVlbmNlKFtcblx0XHRcdFx0XHRtYWtlTWFwKHtcblx0XHRcdFx0XHRcdCd0eXBlJzogbWFrZVNjYWxhcignY29tbWFuZCcpLFxuXHRcdFx0XHRcdFx0J2NvbW1hbmQnOiBtYWtlU2NhbGFyKCdlY2hvIFwic3RhcnRcIicpLFxuXHRcdFx0XHRcdFx0J2N3ZCc6IG1ha2VTY2FsYXIoJ3NyYycpLFxuXHRcdFx0XHRcdH0pLFxuXHRcdFx0XHRdKSxcblx0XHRcdH0pO1xuXG5cdFx0XHRjb25zdCByZXN1bHQgPSBwYXJzZVN1YmFnZW50SG9va3NGcm9tWWFtbChob29rc01hcCwgd29ya3NwYWNlUm9vdCwgdXNlckhvbWUpO1xuXG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0W0hvb2tUeXBlLlNlc3Npb25TdGFydF0/Lmxlbmd0aCwgMSk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHJlc3VsdFtIb29rVHlwZS5TZXNzaW9uU3RhcnRdIVswXS5jd2QsIFVSSS5maWxlKCcvd29ya3NwYWNlL3NyYycpKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3NraXBzIG5vbi1zZXF1ZW5jZSBob29rIHZhbHVlcycsICgpID0+IHtcblx0XHRcdGNvbnN0IGhvb2tzTWFwID0gbWFrZU1hcCh7XG5cdFx0XHRcdCdQcmVUb29sVXNlJzogbWFrZVNjYWxhcignbm90LWEtc2VxdWVuY2UnKSxcblx0XHRcdH0pO1xuXG5cdFx0XHRjb25zdCByZXN1bHQgPSBwYXJzZVN1YmFnZW50SG9va3NGcm9tWWFtbChob29rc01hcCwgd29ya3NwYWNlUm9vdCwgdXNlckhvbWUpO1xuXG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0W0hvb2tUeXBlLlByZVRvb2xVc2VdLCB1bmRlZmluZWQpO1xuXHRcdH0pO1xuXHR9KTtcblxuXHRzdWl0ZSgnQ2hhdFJlcXVlc3RIb29rcy5pc0VxdWFscycsICgpID0+IHtcblx0XHR0ZXN0KCdyZXR1cm5zIHRydWUgZm9yIGVxdWl2YWxlbnQgaG9vayBhcnJheXMnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBsZWZ0OiBDaGF0UmVxdWVzdEhvb2tzID0ge1xuXHRcdFx0XHRbSG9va1R5cGUuUHJlVG9vbFVzZV06IFt7IGNvbW1hbmQ6ICcuL3NjcmlwdHMvcHJlLnNoJywgY3dkOiBVUkkuZmlsZSgnL3dvcmtzcGFjZScpIH1dLFxuXHRcdFx0fTtcblx0XHRcdGNvbnN0IHJpZ2h0OiBDaGF0UmVxdWVzdEhvb2tzID0ge1xuXHRcdFx0XHRbSG9va1R5cGUuUHJlVG9vbFVzZV06IFt7IGNvbW1hbmQ6ICcuL3NjcmlwdHMvcHJlLnNoJywgY3dkOiBVUkkuZmlsZSgnL3dvcmtzcGFjZScpIH1dLFxuXHRcdFx0fTtcblxuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKENoYXRSZXF1ZXN0SG9va3MuaXNFcXVhbHMobGVmdCwgcmlnaHQpLCB0cnVlKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3JldHVybnMgZmFsc2UgZm9yIGRpZmZlcmVudCBob29rIGNvbW1hbmRzJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgbGVmdDogQ2hhdFJlcXVlc3RIb29rcyA9IHtcblx0XHRcdFx0W0hvb2tUeXBlLlByZVRvb2xVc2VdOiBbeyBjb21tYW5kOiAnLi9zY3JpcHRzL3ByZS5zaCcgfV0sXG5cdFx0XHR9O1xuXHRcdFx0Y29uc3QgcmlnaHQ6IENoYXRSZXF1ZXN0SG9va3MgPSB7XG5cdFx0XHRcdFtIb29rVHlwZS5QcmVUb29sVXNlXTogW3sgY29tbWFuZDogJy4vc2NyaXB0cy9vdGhlci5zaCcgfV0sXG5cdFx0XHR9O1xuXG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoQ2hhdFJlcXVlc3RIb29rcy5pc0VxdWFscyhsZWZ0LCByaWdodCksIGZhbHNlKTtcblx0XHR9KTtcblx0fSk7XG59KTtcbiJdLAogICJtYXBwaW5ncyI6ICJBQUtBLE9BQU8sWUFBWTtBQUNuQixTQUFTLCtDQUErQztBQUN4RCxTQUFTLG9CQUFvQix5QkFBeUIsd0JBQXNDLDRCQUE0Qix3QkFBd0I7QUFDaEosU0FBUyxX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
