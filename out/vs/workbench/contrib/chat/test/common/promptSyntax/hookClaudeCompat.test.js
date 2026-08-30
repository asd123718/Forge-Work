import assert from "assert";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../../../base/test/common/utils.js";
import { HookType } from "../../../common/promptSyntax/hookTypes.js";
import { parseClaudeHooks, resolveClaudeHookType, getClaudeHookTypeName, extractHookCommandsFromItem } from "../../../common/promptSyntax/hookClaudeCompat.js";
import { getHookSourceFormat, HookSourceFormat, buildNewHookEntry } from "../../../common/promptSyntax/hookCompatibility.js";
import { URI } from "../../../../../../base/common/uri.js";
suite("HookClaudeCompat", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  suite("extractHookCommandsFromItem", () => {
    const workspaceRoot = URI.file("/workspace");
    const userHome = "/home/user";
    test("extracts direct command object", () => {
      const item = { type: "command", command: 'echo "test"' };
      const result = extractHookCommandsFromItem(item, workspaceRoot, userHome);
      assert.strictEqual(result.length, 1);
      assert.strictEqual(result[0].command, 'echo "test"');
    });
    test("extracts from nested matcher structure", () => {
      const item = {
        matcher: "Bash",
        hooks: [
          { type: "command", command: 'echo "nested"' }
        ]
      };
      const result = extractHookCommandsFromItem(item, workspaceRoot, userHome);
      assert.strictEqual(result.length, 1);
      assert.strictEqual(result[0].command, 'echo "nested"');
    });
    test("extracts multiple hooks from matcher structure", () => {
      const item = {
        matcher: "Write",
        hooks: [
          { type: "command", command: 'echo "first"' },
          { type: "command", command: 'echo "second"' }
        ]
      };
      const result = extractHookCommandsFromItem(item, workspaceRoot, userHome);
      assert.strictEqual(result.length, 2);
      assert.strictEqual(result[0].command, 'echo "first"');
      assert.strictEqual(result[1].command, 'echo "second"');
    });
    test("handles command without type field (Claude format)", () => {
      const item = { command: 'echo "no type"' };
      const result = extractHookCommandsFromItem(item, workspaceRoot, userHome);
      assert.strictEqual(result.length, 1);
      assert.strictEqual(result[0].command, 'echo "no type"');
    });
    test("handles nested command without type field", () => {
      const item = {
        matcher: "Bash",
        hooks: [
          { command: 'echo "no type nested"' }
        ]
      };
      const result = extractHookCommandsFromItem(item, workspaceRoot, userHome);
      assert.strictEqual(result.length, 1);
      assert.strictEqual(result[0].command, 'echo "no type nested"');
    });
    test("returns empty array for null item", () => {
      const result = extractHookCommandsFromItem(null, workspaceRoot, userHome);
      assert.strictEqual(result.length, 0);
    });
    test("returns empty array for undefined item", () => {
      const result = extractHookCommandsFromItem(void 0, workspaceRoot, userHome);
      assert.strictEqual(result.length, 0);
    });
    test("returns empty array for invalid type", () => {
      const item = { type: "script", command: 'echo "wrong type"' };
      const result = extractHookCommandsFromItem(item, workspaceRoot, userHome);
      assert.strictEqual(result.length, 0);
    });
  });
  suite("resolveClaudeHookType", () => {
    test("resolves PreToolUse", () => {
      assert.strictEqual(resolveClaudeHookType("PreToolUse"), HookType.PreToolUse);
    });
    test("resolves UserPromptSubmit", () => {
      assert.strictEqual(resolveClaudeHookType("UserPromptSubmit"), HookType.UserPromptSubmit);
    });
    test("returns undefined for unknown type", () => {
      assert.strictEqual(resolveClaudeHookType("UnknownHook"), void 0);
    });
    test("returns undefined for camelCase (not Claude format)", () => {
      assert.strictEqual(resolveClaudeHookType("preToolUse"), void 0);
    });
  });
  suite("getClaudeHookTypeName", () => {
    test("gets PreToolUse for HookType.PreToolUse", () => {
      assert.strictEqual(getClaudeHookTypeName(HookType.PreToolUse), "PreToolUse");
    });
    test("gets UserPromptSubmit for HookType.UserPromptSubmit", () => {
      assert.strictEqual(getClaudeHookTypeName(HookType.UserPromptSubmit), "UserPromptSubmit");
    });
  });
  suite("parseClaudeHooks", () => {
    const workspaceRoot = URI.file("/workspace");
    const userHome = "/home/user";
    suite("basic parsing", () => {
      test("parses simple hook with command", () => {
        const json = {
          hooks: {
            PreToolUse: [
              { type: "command", command: 'echo "pre-tool"' }
            ]
          }
        };
        const result = parseClaudeHooks(json, workspaceRoot, userHome);
        assert.strictEqual(result.disabledAllHooks, false);
        assert.strictEqual(result.hooks.size, 1);
        assert.ok(result.hooks.has(HookType.PreToolUse));
        const entry = result.hooks.get(HookType.PreToolUse);
        assert.strictEqual(entry.originalId, "PreToolUse");
        assert.strictEqual(entry.hooks.length, 1);
        assert.strictEqual(entry.hooks[0].command, 'echo "pre-tool"');
      });
      test("parses multiple hook types", () => {
        const json = {
          hooks: {
            SessionStart: [{ type: "command", command: 'echo "start"' }],
            Stop: [{ type: "command", command: 'echo "stop"' }]
          }
        };
        const result = parseClaudeHooks(json, workspaceRoot, userHome);
        assert.strictEqual(result.hooks.size, 2);
        assert.ok(result.hooks.has(HookType.SessionStart));
        assert.ok(result.hooks.has(HookType.Stop));
      });
      test("parses multiple commands for same hook type", () => {
        const json = {
          hooks: {
            PreToolUse: [
              { type: "command", command: 'echo "first"' },
              { type: "command", command: 'echo "second"' }
            ]
          }
        };
        const result = parseClaudeHooks(json, workspaceRoot, userHome);
        const entry = result.hooks.get(HookType.PreToolUse);
        assert.strictEqual(entry.hooks.length, 2);
        assert.strictEqual(entry.hooks[0].command, 'echo "first"');
        assert.strictEqual(entry.hooks[1].command, 'echo "second"');
      });
    });
    suite("disableAllHooks", () => {
      test("returns empty hooks and disabledAllHooks=true when disableAllHooks is true", () => {
        const json = {
          disableAllHooks: true,
          hooks: {
            PreToolUse: [
              { type: "command", command: 'echo "should be ignored"' }
            ]
          }
        };
        const result = parseClaudeHooks(json, workspaceRoot, userHome);
        assert.strictEqual(result.disabledAllHooks, true);
        assert.strictEqual(result.hooks.size, 0);
      });
      test("parses hooks normally when disableAllHooks is false", () => {
        const json = {
          disableAllHooks: false,
          hooks: {
            PreToolUse: [
              { type: "command", command: 'echo "should be parsed"' }
            ]
          }
        };
        const result = parseClaudeHooks(json, workspaceRoot, userHome);
        assert.strictEqual(result.disabledAllHooks, false);
        assert.strictEqual(result.hooks.size, 1);
      });
      test("parses hooks normally when disableAllHooks is not present", () => {
        const json = {
          hooks: {
            PreToolUse: [
              { type: "command", command: 'echo "should be parsed"' }
            ]
          }
        };
        const result = parseClaudeHooks(json, workspaceRoot, userHome);
        assert.strictEqual(result.disabledAllHooks, false);
        assert.strictEqual(result.hooks.size, 1);
      });
    });
    suite("nested hooks with matchers", () => {
      test("parses nested hooks with matcher", () => {
        const json = {
          hooks: {
            PreToolUse: [
              {
                matcher: "Bash",
                hooks: [
                  { type: "command", command: 'echo "bash hook"' }
                ]
              }
            ]
          }
        };
        const result = parseClaudeHooks(json, workspaceRoot, userHome);
        const entry = result.hooks.get(HookType.PreToolUse);
        assert.strictEqual(entry.hooks.length, 1);
        assert.strictEqual(entry.hooks[0].command, 'echo "bash hook"');
      });
      test("parses multiple nested hooks within one matcher", () => {
        const json = {
          hooks: {
            PreToolUse: [
              {
                matcher: "Bash",
                hooks: [
                  { type: "command", command: 'echo "first"' },
                  { type: "command", command: 'echo "second"' }
                ]
              }
            ]
          }
        };
        const result = parseClaudeHooks(json, workspaceRoot, userHome);
        const entry = result.hooks.get(HookType.PreToolUse);
        assert.strictEqual(entry.hooks.length, 2);
      });
      test("parses multiple matchers for same hook type", () => {
        const json = {
          hooks: {
            PreToolUse: [
              {
                matcher: "Bash",
                hooks: [{ type: "command", command: 'echo "bash"' }]
              },
              {
                matcher: "Write",
                hooks: [{ type: "command", command: 'echo "write"' }]
              }
            ]
          }
        };
        const result = parseClaudeHooks(json, workspaceRoot, userHome);
        const entry = result.hooks.get(HookType.PreToolUse);
        assert.strictEqual(entry.hooks.length, 2);
        assert.strictEqual(entry.hooks[0].command, 'echo "bash"');
        assert.strictEqual(entry.hooks[1].command, 'echo "write"');
      });
      test("parses mix of direct and nested hooks", () => {
        const json = {
          hooks: {
            PreToolUse: [
              { type: "command", command: 'echo "direct"' },
              {
                matcher: "Bash",
                hooks: [{ type: "command", command: 'echo "nested"' }]
              }
            ]
          }
        };
        const result = parseClaudeHooks(json, workspaceRoot, userHome);
        const entry = result.hooks.get(HookType.PreToolUse);
        assert.strictEqual(entry.hooks.length, 2);
        assert.strictEqual(entry.hooks[0].command, 'echo "direct"');
        assert.strictEqual(entry.hooks[1].command, 'echo "nested"');
      });
    });
    suite("invalid inputs", () => {
      test("returns empty map for null json", () => {
        const result = parseClaudeHooks(null, workspaceRoot, userHome);
        assert.strictEqual(result.hooks.size, 0);
        assert.strictEqual(result.disabledAllHooks, false);
      });
      test("returns empty map for undefined json", () => {
        const result = parseClaudeHooks(void 0, workspaceRoot, userHome);
        assert.strictEqual(result.hooks.size, 0);
        assert.strictEqual(result.disabledAllHooks, false);
      });
      test("returns empty map for non-object json", () => {
        const result = parseClaudeHooks("string", workspaceRoot, userHome);
        assert.strictEqual(result.hooks.size, 0);
        assert.strictEqual(result.disabledAllHooks, false);
      });
      test("returns empty map for missing hooks property", () => {
        const result = parseClaudeHooks({}, workspaceRoot, userHome);
        assert.strictEqual(result.hooks.size, 0);
        assert.strictEqual(result.disabledAllHooks, false);
      });
      test("returns empty map for non-object hooks property", () => {
        const result = parseClaudeHooks({ hooks: "invalid" }, workspaceRoot, userHome);
        assert.strictEqual(result.hooks.size, 0);
        assert.strictEqual(result.disabledAllHooks, false);
      });
      test("skips unknown hook types", () => {
        const json = {
          hooks: {
            UnknownType: [{ type: "command", command: 'echo "test"' }],
            PreToolUse: [{ type: "command", command: 'echo "known"' }]
          }
        };
        const result = parseClaudeHooks(json, workspaceRoot, userHome);
        assert.strictEqual(result.hooks.size, 1);
        assert.ok(result.hooks.has(HookType.PreToolUse));
      });
      test("skips non-array hook entries", () => {
        const json = {
          hooks: {
            PreToolUse: { type: "command", command: 'echo "not array"' }
          }
        };
        const result = parseClaudeHooks(json, workspaceRoot, userHome);
        assert.strictEqual(result.hooks.size, 0);
      });
      test("skips invalid command entries", () => {
        const json = {
          hooks: {
            PreToolUse: [
              "invalid string",
              null,
              { type: "command", command: "valid" }
            ]
          }
        };
        const result = parseClaudeHooks(json, workspaceRoot, userHome);
        const entry = result.hooks.get(HookType.PreToolUse);
        assert.strictEqual(entry.hooks.length, 1);
        assert.strictEqual(entry.hooks[0].command, "valid");
      });
      test("skips commands with wrong type", () => {
        const json = {
          hooks: {
            PreToolUse: [
              { type: "script", command: "invalid type" },
              { type: "command", command: "valid" }
            ]
          }
        };
        const result = parseClaudeHooks(json, workspaceRoot, userHome);
        const entry = result.hooks.get(HookType.PreToolUse);
        assert.strictEqual(entry.hooks.length, 1);
        assert.strictEqual(entry.hooks[0].command, "valid");
      });
    });
    suite("cwd and env resolution", () => {
      test("resolves cwd relative to workspace", () => {
        const json = {
          hooks: {
            PreToolUse: [
              { type: "command", command: 'echo "test"', cwd: "src" }
            ]
          }
        };
        const result = parseClaudeHooks(json, workspaceRoot, userHome);
        const entry = result.hooks.get(HookType.PreToolUse);
        assert.deepStrictEqual(entry.hooks[0].cwd, URI.file("/workspace/src"));
      });
      test("preserves env variables", () => {
        const json = {
          hooks: {
            PreToolUse: [
              { type: "command", command: 'echo "test"', env: { NODE_ENV: "production" } }
            ]
          }
        };
        const result = parseClaudeHooks(json, workspaceRoot, userHome);
        const entry = result.hooks.get(HookType.PreToolUse);
        assert.deepStrictEqual(entry.hooks[0].env, { NODE_ENV: "production" });
      });
      test("preserves timeout", () => {
        const json = {
          hooks: {
            PreToolUse: [
              { type: "command", command: 'echo "test"', timeout: 60 }
            ]
          }
        };
        const result = parseClaudeHooks(json, workspaceRoot, userHome);
        const entry = result.hooks.get(HookType.PreToolUse);
        assert.strictEqual(entry.hooks[0].timeout, 60);
      });
      test("supports Claude timeout alias", () => {
        const json = {
          hooks: {
            PreToolUse: [
              { type: "command", command: 'echo "test"', timeout: 1 }
            ]
          }
        };
        const result = parseClaudeHooks(json, workspaceRoot, userHome);
        const entry = result.hooks.get(HookType.PreToolUse);
        assert.strictEqual(entry.hooks[0].timeout, 1);
      });
    });
  });
});
suite("HookSourceFormat", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  suite("getHookSourceFormat", () => {
    test("detects Claude format for .claude/settings.json", () => {
      assert.strictEqual(getHookSourceFormat(URI.file("/workspace/.claude/settings.json")), HookSourceFormat.Claude);
    });
    test("detects Claude format for .claude/settings.local.json", () => {
      assert.strictEqual(getHookSourceFormat(URI.file("/workspace/.claude/settings.local.json")), HookSourceFormat.Claude);
    });
    test("detects Claude format for ~/.claude/settings.json", () => {
      assert.strictEqual(getHookSourceFormat(URI.file("/home/user/.claude/settings.json")), HookSourceFormat.Claude);
    });
    test("returns Copilot format for .github/hooks/hooks.json", () => {
      assert.strictEqual(getHookSourceFormat(URI.file("/workspace/.github/hooks/hooks.json")), HookSourceFormat.Copilot);
    });
    test("returns Copilot format for arbitrary .json file", () => {
      assert.strictEqual(getHookSourceFormat(URI.file("/workspace/.github/hooks/my-hooks.json")), HookSourceFormat.Copilot);
    });
    test("returns Copilot format for settings.json not inside .claude", () => {
      assert.strictEqual(getHookSourceFormat(URI.file("/workspace/.vscode/settings.json")), HookSourceFormat.Copilot);
    });
  });
  suite("buildNewHookEntry", () => {
    test("builds Copilot format entry", () => {
      assert.deepStrictEqual(buildNewHookEntry(HookSourceFormat.Copilot), {
        type: "command",
        command: ""
      });
    });
    test("builds Claude format entry with matcher wrapper", () => {
      assert.deepStrictEqual(buildNewHookEntry(HookSourceFormat.Claude), {
        matcher: "",
        hooks: [{
          type: "command",
          command: ""
        }]
      });
    });
    test("Claude format entry serializes correctly in JSON", () => {
      const entry = buildNewHookEntry(HookSourceFormat.Claude);
      const hooksContent = {
        hooks: {
          SubagentStart: [entry]
        }
      };
      const json = JSON.stringify(hooksContent, null, "	");
      const parsed = JSON.parse(json);
      assert.deepStrictEqual(parsed.hooks.SubagentStart[0], {
        matcher: "",
        hooks: [{
          type: "command",
          command: ""
        }]
      });
    });
    test("Copilot format entry serializes correctly in JSON", () => {
      const entry = buildNewHookEntry(HookSourceFormat.Copilot);
      const hooksContent = {
        hooks: {
          SubagentStart: [entry]
        }
      };
      const json = JSON.stringify(hooksContent, null, "	");
      const parsed = JSON.parse(json);
      assert.deepStrictEqual(parsed.hooks.SubagentStart[0], {
        type: "command",
        command: ""
      });
    });
    test("Claude format round-trips through parseClaudeHooks", () => {
      const entry = buildNewHookEntry(HookSourceFormat.Claude);
      const hooksContent = {
        hooks: {
          PreToolUse: [entry]
        }
      };
      const result = parseClaudeHooks(hooksContent, URI.file("/workspace"), "/home/user");
      assert.strictEqual(result.hooks.size, 1);
      assert.ok(result.hooks.has(HookType.PreToolUse));
      const hooks = result.hooks.get(HookType.PreToolUse);
      assert.strictEqual(hooks.hooks.length, 1);
      assert.strictEqual(hooks.hooks[0].command, void 0);
    });
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXGNoYXRcXHRlc3RcXGNvbW1vblxccHJvbXB0U3ludGF4XFxob29rQ2xhdWRlQ29tcGF0LnRlc3QudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgYXNzZXJ0IGZyb20gJ2Fzc2VydCc7XG5pbXBvcnQgeyBlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL3Rlc3QvY29tbW9uL3V0aWxzLmpzJztcbmltcG9ydCB7IEhvb2tUeXBlIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL3Byb21wdFN5bnRheC9ob29rVHlwZXMuanMnO1xuaW1wb3J0IHsgcGFyc2VDbGF1ZGVIb29rcywgcmVzb2x2ZUNsYXVkZUhvb2tUeXBlLCBnZXRDbGF1ZGVIb29rVHlwZU5hbWUsIGV4dHJhY3RIb29rQ29tbWFuZHNGcm9tSXRlbSB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9wcm9tcHRTeW50YXgvaG9va0NsYXVkZUNvbXBhdC5qcyc7XG5pbXBvcnQgeyBnZXRIb29rU291cmNlRm9ybWF0LCBIb29rU291cmNlRm9ybWF0LCBidWlsZE5ld0hvb2tFbnRyeSB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9wcm9tcHRTeW50YXgvaG9va0NvbXBhdGliaWxpdHkuanMnO1xuaW1wb3J0IHsgVVJJIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdXJpLmpzJztcblxuc3VpdGUoJ0hvb2tDbGF1ZGVDb21wYXQnLCAoKSA9PiB7XG5cdGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSgpO1xuXG5cdHN1aXRlKCdleHRyYWN0SG9va0NvbW1hbmRzRnJvbUl0ZW0nLCAoKSA9PiB7XG5cdFx0Y29uc3Qgd29ya3NwYWNlUm9vdCA9IFVSSS5maWxlKCcvd29ya3NwYWNlJyk7XG5cdFx0Y29uc3QgdXNlckhvbWUgPSAnL2hvbWUvdXNlcic7XG5cblx0XHR0ZXN0KCdleHRyYWN0cyBkaXJlY3QgY29tbWFuZCBvYmplY3QnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBpdGVtID0geyB0eXBlOiAnY29tbWFuZCcsIGNvbW1hbmQ6ICdlY2hvIFwidGVzdFwiJyB9O1xuXG5cdFx0XHRjb25zdCByZXN1bHQgPSBleHRyYWN0SG9va0NvbW1hbmRzRnJvbUl0ZW0oaXRlbSwgd29ya3NwYWNlUm9vdCwgdXNlckhvbWUpO1xuXG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0Lmxlbmd0aCwgMSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0WzBdLmNvbW1hbmQsICdlY2hvIFwidGVzdFwiJyk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdleHRyYWN0cyBmcm9tIG5lc3RlZCBtYXRjaGVyIHN0cnVjdHVyZScsICgpID0+IHtcblx0XHRcdGNvbnN0IGl0ZW0gPSB7XG5cdFx0XHRcdG1hdGNoZXI6ICdCYXNoJyxcblx0XHRcdFx0aG9va3M6IFtcblx0XHRcdFx0XHR7IHR5cGU6ICdjb21tYW5kJywgY29tbWFuZDogJ2VjaG8gXCJuZXN0ZWRcIicgfVxuXHRcdFx0XHRdXG5cdFx0XHR9O1xuXG5cdFx0XHRjb25zdCByZXN1bHQgPSBleHRyYWN0SG9va0NvbW1hbmRzRnJvbUl0ZW0oaXRlbSwgd29ya3NwYWNlUm9vdCwgdXNlckhvbWUpO1xuXG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0Lmxlbmd0aCwgMSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0WzBdLmNvbW1hbmQsICdlY2hvIFwibmVzdGVkXCInKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2V4dHJhY3RzIG11bHRpcGxlIGhvb2tzIGZyb20gbWF0Y2hlciBzdHJ1Y3R1cmUnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBpdGVtID0ge1xuXHRcdFx0XHRtYXRjaGVyOiAnV3JpdGUnLFxuXHRcdFx0XHRob29rczogW1xuXHRcdFx0XHRcdHsgdHlwZTogJ2NvbW1hbmQnLCBjb21tYW5kOiAnZWNobyBcImZpcnN0XCInIH0sXG5cdFx0XHRcdFx0eyB0eXBlOiAnY29tbWFuZCcsIGNvbW1hbmQ6ICdlY2hvIFwic2Vjb25kXCInIH1cblx0XHRcdFx0XVxuXHRcdFx0fTtcblxuXHRcdFx0Y29uc3QgcmVzdWx0ID0gZXh0cmFjdEhvb2tDb21tYW5kc0Zyb21JdGVtKGl0ZW0sIHdvcmtzcGFjZVJvb3QsIHVzZXJIb21lKTtcblxuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdC5sZW5ndGgsIDIpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdFswXS5jb21tYW5kLCAnZWNobyBcImZpcnN0XCInKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHRbMV0uY29tbWFuZCwgJ2VjaG8gXCJzZWNvbmRcIicpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnaGFuZGxlcyBjb21tYW5kIHdpdGhvdXQgdHlwZSBmaWVsZCAoQ2xhdWRlIGZvcm1hdCknLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBpdGVtID0geyBjb21tYW5kOiAnZWNobyBcIm5vIHR5cGVcIicgfTtcblxuXHRcdFx0Y29uc3QgcmVzdWx0ID0gZXh0cmFjdEhvb2tDb21tYW5kc0Zyb21JdGVtKGl0ZW0sIHdvcmtzcGFjZVJvb3QsIHVzZXJIb21lKTtcblxuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdC5sZW5ndGgsIDEpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdFswXS5jb21tYW5kLCAnZWNobyBcIm5vIHR5cGVcIicpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnaGFuZGxlcyBuZXN0ZWQgY29tbWFuZCB3aXRob3V0IHR5cGUgZmllbGQnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBpdGVtID0ge1xuXHRcdFx0XHRtYXRjaGVyOiAnQmFzaCcsXG5cdFx0XHRcdGhvb2tzOiBbXG5cdFx0XHRcdFx0eyBjb21tYW5kOiAnZWNobyBcIm5vIHR5cGUgbmVzdGVkXCInIH1cblx0XHRcdFx0XVxuXHRcdFx0fTtcblxuXHRcdFx0Y29uc3QgcmVzdWx0ID0gZXh0cmFjdEhvb2tDb21tYW5kc0Zyb21JdGVtKGl0ZW0sIHdvcmtzcGFjZVJvb3QsIHVzZXJIb21lKTtcblxuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdC5sZW5ndGgsIDEpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdFswXS5jb21tYW5kLCAnZWNobyBcIm5vIHR5cGUgbmVzdGVkXCInKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3JldHVybnMgZW1wdHkgYXJyYXkgZm9yIG51bGwgaXRlbScsICgpID0+IHtcblx0XHRcdGNvbnN0IHJlc3VsdCA9IGV4dHJhY3RIb29rQ29tbWFuZHNGcm9tSXRlbShudWxsLCB3b3Jrc3BhY2VSb290LCB1c2VySG9tZSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0Lmxlbmd0aCwgMCk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdyZXR1cm5zIGVtcHR5IGFycmF5IGZvciB1bmRlZmluZWQgaXRlbScsICgpID0+IHtcblx0XHRcdGNvbnN0IHJlc3VsdCA9IGV4dHJhY3RIb29rQ29tbWFuZHNGcm9tSXRlbSh1bmRlZmluZWQsIHdvcmtzcGFjZVJvb3QsIHVzZXJIb21lKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQubGVuZ3RoLCAwKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3JldHVybnMgZW1wdHkgYXJyYXkgZm9yIGludmFsaWQgdHlwZScsICgpID0+IHtcblx0XHRcdGNvbnN0IGl0ZW0gPSB7IHR5cGU6ICdzY3JpcHQnLCBjb21tYW5kOiAnZWNobyBcIndyb25nIHR5cGVcIicgfTtcblxuXHRcdFx0Y29uc3QgcmVzdWx0ID0gZXh0cmFjdEhvb2tDb21tYW5kc0Zyb21JdGVtKGl0ZW0sIHdvcmtzcGFjZVJvb3QsIHVzZXJIb21lKTtcblxuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdC5sZW5ndGgsIDApO1xuXHRcdH0pO1xuXHR9KTtcblxuXHRzdWl0ZSgncmVzb2x2ZUNsYXVkZUhvb2tUeXBlJywgKCkgPT4ge1xuXHRcdHRlc3QoJ3Jlc29sdmVzIFByZVRvb2xVc2UnLCAoKSA9PiB7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzb2x2ZUNsYXVkZUhvb2tUeXBlKCdQcmVUb29sVXNlJyksIEhvb2tUeXBlLlByZVRvb2xVc2UpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgncmVzb2x2ZXMgVXNlclByb21wdFN1Ym1pdCcsICgpID0+IHtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXNvbHZlQ2xhdWRlSG9va1R5cGUoJ1VzZXJQcm9tcHRTdWJtaXQnKSwgSG9va1R5cGUuVXNlclByb21wdFN1Ym1pdCk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdyZXR1cm5zIHVuZGVmaW5lZCBmb3IgdW5rbm93biB0eXBlJywgKCkgPT4ge1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc29sdmVDbGF1ZGVIb29rVHlwZSgnVW5rbm93bkhvb2snKSwgdW5kZWZpbmVkKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3JldHVybnMgdW5kZWZpbmVkIGZvciBjYW1lbENhc2UgKG5vdCBDbGF1ZGUgZm9ybWF0KScsICgpID0+IHtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXNvbHZlQ2xhdWRlSG9va1R5cGUoJ3ByZVRvb2xVc2UnKSwgdW5kZWZpbmVkKTtcblx0XHR9KTtcblx0fSk7XG5cblx0c3VpdGUoJ2dldENsYXVkZUhvb2tUeXBlTmFtZScsICgpID0+IHtcblx0XHR0ZXN0KCdnZXRzIFByZVRvb2xVc2UgZm9yIEhvb2tUeXBlLlByZVRvb2xVc2UnLCAoKSA9PiB7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZ2V0Q2xhdWRlSG9va1R5cGVOYW1lKEhvb2tUeXBlLlByZVRvb2xVc2UpLCAnUHJlVG9vbFVzZScpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnZ2V0cyBVc2VyUHJvbXB0U3VibWl0IGZvciBIb29rVHlwZS5Vc2VyUHJvbXB0U3VibWl0JywgKCkgPT4ge1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGdldENsYXVkZUhvb2tUeXBlTmFtZShIb29rVHlwZS5Vc2VyUHJvbXB0U3VibWl0KSwgJ1VzZXJQcm9tcHRTdWJtaXQnKTtcblx0XHR9KTtcblx0fSk7XG5cblx0c3VpdGUoJ3BhcnNlQ2xhdWRlSG9va3MnLCAoKSA9PiB7XG5cdFx0Y29uc3Qgd29ya3NwYWNlUm9vdCA9IFVSSS5maWxlKCcvd29ya3NwYWNlJyk7XG5cdFx0Y29uc3QgdXNlckhvbWUgPSAnL2hvbWUvdXNlcic7XG5cblx0XHRzdWl0ZSgnYmFzaWMgcGFyc2luZycsICgpID0+IHtcblx0XHRcdHRlc3QoJ3BhcnNlcyBzaW1wbGUgaG9vayB3aXRoIGNvbW1hbmQnLCAoKSA9PiB7XG5cdFx0XHRcdGNvbnN0IGpzb24gPSB7XG5cdFx0XHRcdFx0aG9va3M6IHtcblx0XHRcdFx0XHRcdFByZVRvb2xVc2U6IFtcblx0XHRcdFx0XHRcdFx0eyB0eXBlOiAnY29tbWFuZCcsIGNvbW1hbmQ6ICdlY2hvIFwicHJlLXRvb2xcIicgfVxuXHRcdFx0XHRcdFx0XVxuXHRcdFx0XHRcdH1cblx0XHRcdFx0fTtcblxuXHRcdFx0XHRjb25zdCByZXN1bHQgPSBwYXJzZUNsYXVkZUhvb2tzKGpzb24sIHdvcmtzcGFjZVJvb3QsIHVzZXJIb21lKTtcblxuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0LmRpc2FibGVkQWxsSG9va3MsIGZhbHNlKTtcblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdC5ob29rcy5zaXplLCAxKTtcblx0XHRcdFx0YXNzZXJ0Lm9rKHJlc3VsdC5ob29rcy5oYXMoSG9va1R5cGUuUHJlVG9vbFVzZSkpO1xuXHRcdFx0XHRjb25zdCBlbnRyeSA9IHJlc3VsdC5ob29rcy5nZXQoSG9va1R5cGUuUHJlVG9vbFVzZSkhO1xuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZW50cnkub3JpZ2luYWxJZCwgJ1ByZVRvb2xVc2UnKTtcblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGVudHJ5Lmhvb2tzLmxlbmd0aCwgMSk7XG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChlbnRyeS5ob29rc1swXS5jb21tYW5kLCAnZWNobyBcInByZS10b29sXCInKTtcblx0XHRcdH0pO1xuXG5cdFx0XHR0ZXN0KCdwYXJzZXMgbXVsdGlwbGUgaG9vayB0eXBlcycsICgpID0+IHtcblx0XHRcdFx0Y29uc3QganNvbiA9IHtcblx0XHRcdFx0XHRob29rczoge1xuXHRcdFx0XHRcdFx0U2Vzc2lvblN0YXJ0OiBbeyB0eXBlOiAnY29tbWFuZCcsIGNvbW1hbmQ6ICdlY2hvIFwic3RhcnRcIicgfV0sXG5cdFx0XHRcdFx0XHRTdG9wOiBbeyB0eXBlOiAnY29tbWFuZCcsIGNvbW1hbmQ6ICdlY2hvIFwic3RvcFwiJyB9XVxuXHRcdFx0XHRcdH1cblx0XHRcdFx0fTtcblxuXHRcdFx0XHRjb25zdCByZXN1bHQgPSBwYXJzZUNsYXVkZUhvb2tzKGpzb24sIHdvcmtzcGFjZVJvb3QsIHVzZXJIb21lKTtcblxuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0Lmhvb2tzLnNpemUsIDIpO1xuXHRcdFx0XHRhc3NlcnQub2socmVzdWx0Lmhvb2tzLmhhcyhIb29rVHlwZS5TZXNzaW9uU3RhcnQpKTtcblx0XHRcdFx0YXNzZXJ0Lm9rKHJlc3VsdC5ob29rcy5oYXMoSG9va1R5cGUuU3RvcCkpO1xuXHRcdFx0fSk7XG5cblx0XHRcdHRlc3QoJ3BhcnNlcyBtdWx0aXBsZSBjb21tYW5kcyBmb3Igc2FtZSBob29rIHR5cGUnLCAoKSA9PiB7XG5cdFx0XHRcdGNvbnN0IGpzb24gPSB7XG5cdFx0XHRcdFx0aG9va3M6IHtcblx0XHRcdFx0XHRcdFByZVRvb2xVc2U6IFtcblx0XHRcdFx0XHRcdFx0eyB0eXBlOiAnY29tbWFuZCcsIGNvbW1hbmQ6ICdlY2hvIFwiZmlyc3RcIicgfSxcblx0XHRcdFx0XHRcdFx0eyB0eXBlOiAnY29tbWFuZCcsIGNvbW1hbmQ6ICdlY2hvIFwic2Vjb25kXCInIH1cblx0XHRcdFx0XHRcdF1cblx0XHRcdFx0XHR9XG5cdFx0XHRcdH07XG5cblx0XHRcdFx0Y29uc3QgcmVzdWx0ID0gcGFyc2VDbGF1ZGVIb29rcyhqc29uLCB3b3Jrc3BhY2VSb290LCB1c2VySG9tZSk7XG5cblx0XHRcdFx0Y29uc3QgZW50cnkgPSByZXN1bHQuaG9va3MuZ2V0KEhvb2tUeXBlLlByZVRvb2xVc2UpITtcblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGVudHJ5Lmhvb2tzLmxlbmd0aCwgMik7XG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChlbnRyeS5ob29rc1swXS5jb21tYW5kLCAnZWNobyBcImZpcnN0XCInKTtcblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGVudHJ5Lmhvb2tzWzFdLmNvbW1hbmQsICdlY2hvIFwic2Vjb25kXCInKTtcblx0XHRcdH0pO1xuXHRcdH0pO1xuXG5cdFx0c3VpdGUoJ2Rpc2FibGVBbGxIb29rcycsICgpID0+IHtcblx0XHRcdHRlc3QoJ3JldHVybnMgZW1wdHkgaG9va3MgYW5kIGRpc2FibGVkQWxsSG9va3M9dHJ1ZSB3aGVuIGRpc2FibGVBbGxIb29rcyBpcyB0cnVlJywgKCkgPT4ge1xuXHRcdFx0XHRjb25zdCBqc29uID0ge1xuXHRcdFx0XHRcdGRpc2FibGVBbGxIb29rczogdHJ1ZSxcblx0XHRcdFx0XHRob29rczoge1xuXHRcdFx0XHRcdFx0UHJlVG9vbFVzZTogW1xuXHRcdFx0XHRcdFx0XHR7IHR5cGU6ICdjb21tYW5kJywgY29tbWFuZDogJ2VjaG8gXCJzaG91bGQgYmUgaWdub3JlZFwiJyB9XG5cdFx0XHRcdFx0XHRdXG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9O1xuXG5cdFx0XHRcdGNvbnN0IHJlc3VsdCA9IHBhcnNlQ2xhdWRlSG9va3MoanNvbiwgd29ya3NwYWNlUm9vdCwgdXNlckhvbWUpO1xuXG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQuZGlzYWJsZWRBbGxIb29rcywgdHJ1ZSk7XG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQuaG9va3Muc2l6ZSwgMCk7XG5cdFx0XHR9KTtcblxuXHRcdFx0dGVzdCgncGFyc2VzIGhvb2tzIG5vcm1hbGx5IHdoZW4gZGlzYWJsZUFsbEhvb2tzIGlzIGZhbHNlJywgKCkgPT4ge1xuXHRcdFx0XHRjb25zdCBqc29uID0ge1xuXHRcdFx0XHRcdGRpc2FibGVBbGxIb29rczogZmFsc2UsXG5cdFx0XHRcdFx0aG9va3M6IHtcblx0XHRcdFx0XHRcdFByZVRvb2xVc2U6IFtcblx0XHRcdFx0XHRcdFx0eyB0eXBlOiAnY29tbWFuZCcsIGNvbW1hbmQ6ICdlY2hvIFwic2hvdWxkIGJlIHBhcnNlZFwiJyB9XG5cdFx0XHRcdFx0XHRdXG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9O1xuXG5cdFx0XHRcdGNvbnN0IHJlc3VsdCA9IHBhcnNlQ2xhdWRlSG9va3MoanNvbiwgd29ya3NwYWNlUm9vdCwgdXNlckhvbWUpO1xuXG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQuZGlzYWJsZWRBbGxIb29rcywgZmFsc2UpO1xuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0Lmhvb2tzLnNpemUsIDEpO1xuXHRcdFx0fSk7XG5cblx0XHRcdHRlc3QoJ3BhcnNlcyBob29rcyBub3JtYWxseSB3aGVuIGRpc2FibGVBbGxIb29rcyBpcyBub3QgcHJlc2VudCcsICgpID0+IHtcblx0XHRcdFx0Y29uc3QganNvbiA9IHtcblx0XHRcdFx0XHRob29rczoge1xuXHRcdFx0XHRcdFx0UHJlVG9vbFVzZTogW1xuXHRcdFx0XHRcdFx0XHR7IHR5cGU6ICdjb21tYW5kJywgY29tbWFuZDogJ2VjaG8gXCJzaG91bGQgYmUgcGFyc2VkXCInIH1cblx0XHRcdFx0XHRcdF1cblx0XHRcdFx0XHR9XG5cdFx0XHRcdH07XG5cblx0XHRcdFx0Y29uc3QgcmVzdWx0ID0gcGFyc2VDbGF1ZGVIb29rcyhqc29uLCB3b3Jrc3BhY2VSb290LCB1c2VySG9tZSk7XG5cblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdC5kaXNhYmxlZEFsbEhvb2tzLCBmYWxzZSk7XG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQuaG9va3Muc2l6ZSwgMSk7XG5cdFx0XHR9KTtcblx0XHR9KTtcblxuXHRcdHN1aXRlKCduZXN0ZWQgaG9va3Mgd2l0aCBtYXRjaGVycycsICgpID0+IHtcblx0XHRcdHRlc3QoJ3BhcnNlcyBuZXN0ZWQgaG9va3Mgd2l0aCBtYXRjaGVyJywgKCkgPT4ge1xuXHRcdFx0XHRjb25zdCBqc29uID0ge1xuXHRcdFx0XHRcdGhvb2tzOiB7XG5cdFx0XHRcdFx0XHRQcmVUb29sVXNlOiBbXG5cdFx0XHRcdFx0XHRcdHtcblx0XHRcdFx0XHRcdFx0XHRtYXRjaGVyOiAnQmFzaCcsXG5cdFx0XHRcdFx0XHRcdFx0aG9va3M6IFtcblx0XHRcdFx0XHRcdFx0XHRcdHsgdHlwZTogJ2NvbW1hbmQnLCBjb21tYW5kOiAnZWNobyBcImJhc2ggaG9va1wiJyB9XG5cdFx0XHRcdFx0XHRcdFx0XVxuXHRcdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHRdXG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9O1xuXG5cdFx0XHRcdGNvbnN0IHJlc3VsdCA9IHBhcnNlQ2xhdWRlSG9va3MoanNvbiwgd29ya3NwYWNlUm9vdCwgdXNlckhvbWUpO1xuXG5cdFx0XHRcdGNvbnN0IGVudHJ5ID0gcmVzdWx0Lmhvb2tzLmdldChIb29rVHlwZS5QcmVUb29sVXNlKSE7XG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChlbnRyeS5ob29rcy5sZW5ndGgsIDEpO1xuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZW50cnkuaG9va3NbMF0uY29tbWFuZCwgJ2VjaG8gXCJiYXNoIGhvb2tcIicpO1xuXHRcdFx0fSk7XG5cblx0XHRcdHRlc3QoJ3BhcnNlcyBtdWx0aXBsZSBuZXN0ZWQgaG9va3Mgd2l0aGluIG9uZSBtYXRjaGVyJywgKCkgPT4ge1xuXHRcdFx0XHRjb25zdCBqc29uID0ge1xuXHRcdFx0XHRcdGhvb2tzOiB7XG5cdFx0XHRcdFx0XHRQcmVUb29sVXNlOiBbXG5cdFx0XHRcdFx0XHRcdHtcblx0XHRcdFx0XHRcdFx0XHRtYXRjaGVyOiAnQmFzaCcsXG5cdFx0XHRcdFx0XHRcdFx0aG9va3M6IFtcblx0XHRcdFx0XHRcdFx0XHRcdHsgdHlwZTogJ2NvbW1hbmQnLCBjb21tYW5kOiAnZWNobyBcImZpcnN0XCInIH0sXG5cdFx0XHRcdFx0XHRcdFx0XHR7IHR5cGU6ICdjb21tYW5kJywgY29tbWFuZDogJ2VjaG8gXCJzZWNvbmRcIicgfVxuXHRcdFx0XHRcdFx0XHRcdF1cblx0XHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0XVxuXHRcdFx0XHRcdH1cblx0XHRcdFx0fTtcblxuXHRcdFx0XHRjb25zdCByZXN1bHQgPSBwYXJzZUNsYXVkZUhvb2tzKGpzb24sIHdvcmtzcGFjZVJvb3QsIHVzZXJIb21lKTtcblxuXHRcdFx0XHRjb25zdCBlbnRyeSA9IHJlc3VsdC5ob29rcy5nZXQoSG9va1R5cGUuUHJlVG9vbFVzZSkhO1xuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZW50cnkuaG9va3MubGVuZ3RoLCAyKTtcblx0XHRcdH0pO1xuXG5cdFx0XHR0ZXN0KCdwYXJzZXMgbXVsdGlwbGUgbWF0Y2hlcnMgZm9yIHNhbWUgaG9vayB0eXBlJywgKCkgPT4ge1xuXHRcdFx0XHRjb25zdCBqc29uID0ge1xuXHRcdFx0XHRcdGhvb2tzOiB7XG5cdFx0XHRcdFx0XHRQcmVUb29sVXNlOiBbXG5cdFx0XHRcdFx0XHRcdHtcblx0XHRcdFx0XHRcdFx0XHRtYXRjaGVyOiAnQmFzaCcsXG5cdFx0XHRcdFx0XHRcdFx0aG9va3M6IFt7IHR5cGU6ICdjb21tYW5kJywgY29tbWFuZDogJ2VjaG8gXCJiYXNoXCInIH1dXG5cdFx0XHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0XHRcdHtcblx0XHRcdFx0XHRcdFx0XHRtYXRjaGVyOiAnV3JpdGUnLFxuXHRcdFx0XHRcdFx0XHRcdGhvb2tzOiBbeyB0eXBlOiAnY29tbWFuZCcsIGNvbW1hbmQ6ICdlY2hvIFwid3JpdGVcIicgfV1cblx0XHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0XVxuXHRcdFx0XHRcdH1cblx0XHRcdFx0fTtcblxuXHRcdFx0XHRjb25zdCByZXN1bHQgPSBwYXJzZUNsYXVkZUhvb2tzKGpzb24sIHdvcmtzcGFjZVJvb3QsIHVzZXJIb21lKTtcblxuXHRcdFx0XHRjb25zdCBlbnRyeSA9IHJlc3VsdC5ob29rcy5nZXQoSG9va1R5cGUuUHJlVG9vbFVzZSkhO1xuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZW50cnkuaG9va3MubGVuZ3RoLCAyKTtcblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGVudHJ5Lmhvb2tzWzBdLmNvbW1hbmQsICdlY2hvIFwiYmFzaFwiJyk7XG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChlbnRyeS5ob29rc1sxXS5jb21tYW5kLCAnZWNobyBcIndyaXRlXCInKTtcblx0XHRcdH0pO1xuXG5cdFx0XHR0ZXN0KCdwYXJzZXMgbWl4IG9mIGRpcmVjdCBhbmQgbmVzdGVkIGhvb2tzJywgKCkgPT4ge1xuXHRcdFx0XHRjb25zdCBqc29uID0ge1xuXHRcdFx0XHRcdGhvb2tzOiB7XG5cdFx0XHRcdFx0XHRQcmVUb29sVXNlOiBbXG5cdFx0XHRcdFx0XHRcdHsgdHlwZTogJ2NvbW1hbmQnLCBjb21tYW5kOiAnZWNobyBcImRpcmVjdFwiJyB9LFxuXHRcdFx0XHRcdFx0XHR7XG5cdFx0XHRcdFx0XHRcdFx0bWF0Y2hlcjogJ0Jhc2gnLFxuXHRcdFx0XHRcdFx0XHRcdGhvb2tzOiBbeyB0eXBlOiAnY29tbWFuZCcsIGNvbW1hbmQ6ICdlY2hvIFwibmVzdGVkXCInIH1dXG5cdFx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdF1cblx0XHRcdFx0XHR9XG5cdFx0XHRcdH07XG5cblx0XHRcdFx0Y29uc3QgcmVzdWx0ID0gcGFyc2VDbGF1ZGVIb29rcyhqc29uLCB3b3Jrc3BhY2VSb290LCB1c2VySG9tZSk7XG5cblx0XHRcdFx0Y29uc3QgZW50cnkgPSByZXN1bHQuaG9va3MuZ2V0KEhvb2tUeXBlLlByZVRvb2xVc2UpITtcblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGVudHJ5Lmhvb2tzLmxlbmd0aCwgMik7XG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChlbnRyeS5ob29rc1swXS5jb21tYW5kLCAnZWNobyBcImRpcmVjdFwiJyk7XG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChlbnRyeS5ob29rc1sxXS5jb21tYW5kLCAnZWNobyBcIm5lc3RlZFwiJyk7XG5cdFx0XHR9KTtcblx0XHR9KTtcblxuXHRcdHN1aXRlKCdpbnZhbGlkIGlucHV0cycsICgpID0+IHtcblx0XHRcdHRlc3QoJ3JldHVybnMgZW1wdHkgbWFwIGZvciBudWxsIGpzb24nLCAoKSA9PiB7XG5cdFx0XHRcdGNvbnN0IHJlc3VsdCA9IHBhcnNlQ2xhdWRlSG9va3MobnVsbCwgd29ya3NwYWNlUm9vdCwgdXNlckhvbWUpO1xuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0Lmhvb2tzLnNpemUsIDApO1xuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0LmRpc2FibGVkQWxsSG9va3MsIGZhbHNlKTtcblx0XHRcdH0pO1xuXG5cdFx0XHR0ZXN0KCdyZXR1cm5zIGVtcHR5IG1hcCBmb3IgdW5kZWZpbmVkIGpzb24nLCAoKSA9PiB7XG5cdFx0XHRcdGNvbnN0IHJlc3VsdCA9IHBhcnNlQ2xhdWRlSG9va3ModW5kZWZpbmVkLCB3b3Jrc3BhY2VSb290LCB1c2VySG9tZSk7XG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQuaG9va3Muc2l6ZSwgMCk7XG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQuZGlzYWJsZWRBbGxIb29rcywgZmFsc2UpO1xuXHRcdFx0fSk7XG5cblx0XHRcdHRlc3QoJ3JldHVybnMgZW1wdHkgbWFwIGZvciBub24tb2JqZWN0IGpzb24nLCAoKSA9PiB7XG5cdFx0XHRcdGNvbnN0IHJlc3VsdCA9IHBhcnNlQ2xhdWRlSG9va3MoJ3N0cmluZycsIHdvcmtzcGFjZVJvb3QsIHVzZXJIb21lKTtcblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdC5ob29rcy5zaXplLCAwKTtcblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdC5kaXNhYmxlZEFsbEhvb2tzLCBmYWxzZSk7XG5cdFx0XHR9KTtcblxuXHRcdFx0dGVzdCgncmV0dXJucyBlbXB0eSBtYXAgZm9yIG1pc3NpbmcgaG9va3MgcHJvcGVydHknLCAoKSA9PiB7XG5cdFx0XHRcdGNvbnN0IHJlc3VsdCA9IHBhcnNlQ2xhdWRlSG9va3Moe30sIHdvcmtzcGFjZVJvb3QsIHVzZXJIb21lKTtcblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdC5ob29rcy5zaXplLCAwKTtcblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdC5kaXNhYmxlZEFsbEhvb2tzLCBmYWxzZSk7XG5cdFx0XHR9KTtcblxuXHRcdFx0dGVzdCgncmV0dXJucyBlbXB0eSBtYXAgZm9yIG5vbi1vYmplY3QgaG9va3MgcHJvcGVydHknLCAoKSA9PiB7XG5cdFx0XHRcdGNvbnN0IHJlc3VsdCA9IHBhcnNlQ2xhdWRlSG9va3MoeyBob29rczogJ2ludmFsaWQnIH0sIHdvcmtzcGFjZVJvb3QsIHVzZXJIb21lKTtcblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdC5ob29rcy5zaXplLCAwKTtcblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdC5kaXNhYmxlZEFsbEhvb2tzLCBmYWxzZSk7XG5cdFx0XHR9KTtcblxuXHRcdFx0dGVzdCgnc2tpcHMgdW5rbm93biBob29rIHR5cGVzJywgKCkgPT4ge1xuXHRcdFx0XHRjb25zdCBqc29uID0ge1xuXHRcdFx0XHRcdGhvb2tzOiB7XG5cdFx0XHRcdFx0XHRVbmtub3duVHlwZTogW3sgdHlwZTogJ2NvbW1hbmQnLCBjb21tYW5kOiAnZWNobyBcInRlc3RcIicgfV0sXG5cdFx0XHRcdFx0XHRQcmVUb29sVXNlOiBbeyB0eXBlOiAnY29tbWFuZCcsIGNvbW1hbmQ6ICdlY2hvIFwia25vd25cIicgfV1cblx0XHRcdFx0XHR9XG5cdFx0XHRcdH07XG5cblx0XHRcdFx0Y29uc3QgcmVzdWx0ID0gcGFyc2VDbGF1ZGVIb29rcyhqc29uLCB3b3Jrc3BhY2VSb290LCB1c2VySG9tZSk7XG5cblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdC5ob29rcy5zaXplLCAxKTtcblx0XHRcdFx0YXNzZXJ0Lm9rKHJlc3VsdC5ob29rcy5oYXMoSG9va1R5cGUuUHJlVG9vbFVzZSkpO1xuXHRcdFx0fSk7XG5cblx0XHRcdHRlc3QoJ3NraXBzIG5vbi1hcnJheSBob29rIGVudHJpZXMnLCAoKSA9PiB7XG5cdFx0XHRcdGNvbnN0IGpzb24gPSB7XG5cdFx0XHRcdFx0aG9va3M6IHtcblx0XHRcdFx0XHRcdFByZVRvb2xVc2U6IHsgdHlwZTogJ2NvbW1hbmQnLCBjb21tYW5kOiAnZWNobyBcIm5vdCBhcnJheVwiJyB9XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9O1xuXG5cdFx0XHRcdGNvbnN0IHJlc3VsdCA9IHBhcnNlQ2xhdWRlSG9va3MoanNvbiwgd29ya3NwYWNlUm9vdCwgdXNlckhvbWUpO1xuXG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQuaG9va3Muc2l6ZSwgMCk7XG5cdFx0XHR9KTtcblxuXHRcdFx0dGVzdCgnc2tpcHMgaW52YWxpZCBjb21tYW5kIGVudHJpZXMnLCAoKSA9PiB7XG5cdFx0XHRcdGNvbnN0IGpzb24gPSB7XG5cdFx0XHRcdFx0aG9va3M6IHtcblx0XHRcdFx0XHRcdFByZVRvb2xVc2U6IFtcblx0XHRcdFx0XHRcdFx0J2ludmFsaWQgc3RyaW5nJyxcblx0XHRcdFx0XHRcdFx0bnVsbCxcblx0XHRcdFx0XHRcdFx0eyB0eXBlOiAnY29tbWFuZCcsIGNvbW1hbmQ6ICd2YWxpZCcgfVxuXHRcdFx0XHRcdFx0XVxuXHRcdFx0XHRcdH1cblx0XHRcdFx0fTtcblxuXHRcdFx0XHRjb25zdCByZXN1bHQgPSBwYXJzZUNsYXVkZUhvb2tzKGpzb24sIHdvcmtzcGFjZVJvb3QsIHVzZXJIb21lKTtcblxuXHRcdFx0XHRjb25zdCBlbnRyeSA9IHJlc3VsdC5ob29rcy5nZXQoSG9va1R5cGUuUHJlVG9vbFVzZSkhO1xuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZW50cnkuaG9va3MubGVuZ3RoLCAxKTtcblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGVudHJ5Lmhvb2tzWzBdLmNvbW1hbmQsICd2YWxpZCcpO1xuXHRcdFx0fSk7XG5cblx0XHRcdHRlc3QoJ3NraXBzIGNvbW1hbmRzIHdpdGggd3JvbmcgdHlwZScsICgpID0+IHtcblx0XHRcdFx0Y29uc3QganNvbiA9IHtcblx0XHRcdFx0XHRob29rczoge1xuXHRcdFx0XHRcdFx0UHJlVG9vbFVzZTogW1xuXHRcdFx0XHRcdFx0XHR7IHR5cGU6ICdzY3JpcHQnLCBjb21tYW5kOiAnaW52YWxpZCB0eXBlJyB9LFxuXHRcdFx0XHRcdFx0XHR7IHR5cGU6ICdjb21tYW5kJywgY29tbWFuZDogJ3ZhbGlkJyB9XG5cdFx0XHRcdFx0XHRdXG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9O1xuXG5cdFx0XHRcdGNvbnN0IHJlc3VsdCA9IHBhcnNlQ2xhdWRlSG9va3MoanNvbiwgd29ya3NwYWNlUm9vdCwgdXNlckhvbWUpO1xuXG5cdFx0XHRcdGNvbnN0IGVudHJ5ID0gcmVzdWx0Lmhvb2tzLmdldChIb29rVHlwZS5QcmVUb29sVXNlKSE7XG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChlbnRyeS5ob29rcy5sZW5ndGgsIDEpO1xuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZW50cnkuaG9va3NbMF0uY29tbWFuZCwgJ3ZhbGlkJyk7XG5cdFx0XHR9KTtcblx0XHR9KTtcblxuXHRcdHN1aXRlKCdjd2QgYW5kIGVudiByZXNvbHV0aW9uJywgKCkgPT4ge1xuXHRcdFx0dGVzdCgncmVzb2x2ZXMgY3dkIHJlbGF0aXZlIHRvIHdvcmtzcGFjZScsICgpID0+IHtcblx0XHRcdFx0Y29uc3QganNvbiA9IHtcblx0XHRcdFx0XHRob29rczoge1xuXHRcdFx0XHRcdFx0UHJlVG9vbFVzZTogW1xuXHRcdFx0XHRcdFx0XHR7IHR5cGU6ICdjb21tYW5kJywgY29tbWFuZDogJ2VjaG8gXCJ0ZXN0XCInLCBjd2Q6ICdzcmMnIH1cblx0XHRcdFx0XHRcdF1cblx0XHRcdFx0XHR9XG5cdFx0XHRcdH07XG5cblx0XHRcdFx0Y29uc3QgcmVzdWx0ID0gcGFyc2VDbGF1ZGVIb29rcyhqc29uLCB3b3Jrc3BhY2VSb290LCB1c2VySG9tZSk7XG5cblx0XHRcdFx0Y29uc3QgZW50cnkgPSByZXN1bHQuaG9va3MuZ2V0KEhvb2tUeXBlLlByZVRvb2xVc2UpITtcblx0XHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChlbnRyeS5ob29rc1swXS5jd2QsIFVSSS5maWxlKCcvd29ya3NwYWNlL3NyYycpKTtcblx0XHRcdH0pO1xuXG5cdFx0XHR0ZXN0KCdwcmVzZXJ2ZXMgZW52IHZhcmlhYmxlcycsICgpID0+IHtcblx0XHRcdFx0Y29uc3QganNvbiA9IHtcblx0XHRcdFx0XHRob29rczoge1xuXHRcdFx0XHRcdFx0UHJlVG9vbFVzZTogW1xuXHRcdFx0XHRcdFx0XHR7IHR5cGU6ICdjb21tYW5kJywgY29tbWFuZDogJ2VjaG8gXCJ0ZXN0XCInLCBlbnY6IHsgTk9ERV9FTlY6ICdwcm9kdWN0aW9uJyB9IH1cblx0XHRcdFx0XHRcdF1cblx0XHRcdFx0XHR9XG5cdFx0XHRcdH07XG5cblx0XHRcdFx0Y29uc3QgcmVzdWx0ID0gcGFyc2VDbGF1ZGVIb29rcyhqc29uLCB3b3Jrc3BhY2VSb290LCB1c2VySG9tZSk7XG5cblx0XHRcdFx0Y29uc3QgZW50cnkgPSByZXN1bHQuaG9va3MuZ2V0KEhvb2tUeXBlLlByZVRvb2xVc2UpITtcblx0XHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChlbnRyeS5ob29rc1swXS5lbnYsIHsgTk9ERV9FTlY6ICdwcm9kdWN0aW9uJyB9KTtcblx0XHRcdH0pO1xuXG5cdFx0XHR0ZXN0KCdwcmVzZXJ2ZXMgdGltZW91dCcsICgpID0+IHtcblx0XHRcdFx0Y29uc3QganNvbiA9IHtcblx0XHRcdFx0XHRob29rczoge1xuXHRcdFx0XHRcdFx0UHJlVG9vbFVzZTogW1xuXHRcdFx0XHRcdFx0XHR7IHR5cGU6ICdjb21tYW5kJywgY29tbWFuZDogJ2VjaG8gXCJ0ZXN0XCInLCB0aW1lb3V0OiA2MCB9XG5cdFx0XHRcdFx0XHRdXG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9O1xuXG5cdFx0XHRcdGNvbnN0IHJlc3VsdCA9IHBhcnNlQ2xhdWRlSG9va3MoanNvbiwgd29ya3NwYWNlUm9vdCwgdXNlckhvbWUpO1xuXG5cdFx0XHRcdGNvbnN0IGVudHJ5ID0gcmVzdWx0Lmhvb2tzLmdldChIb29rVHlwZS5QcmVUb29sVXNlKSE7XG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChlbnRyeS5ob29rc1swXS50aW1lb3V0LCA2MCk7XG5cdFx0XHR9KTtcblxuXHRcdFx0dGVzdCgnc3VwcG9ydHMgQ2xhdWRlIHRpbWVvdXQgYWxpYXMnLCAoKSA9PiB7XG5cdFx0XHRcdGNvbnN0IGpzb24gPSB7XG5cdFx0XHRcdFx0aG9va3M6IHtcblx0XHRcdFx0XHRcdFByZVRvb2xVc2U6IFtcblx0XHRcdFx0XHRcdFx0eyB0eXBlOiAnY29tbWFuZCcsIGNvbW1hbmQ6ICdlY2hvIFwidGVzdFwiJywgdGltZW91dDogMSB9XG5cdFx0XHRcdFx0XHRdXG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9O1xuXG5cdFx0XHRcdGNvbnN0IHJlc3VsdCA9IHBhcnNlQ2xhdWRlSG9va3MoanNvbiwgd29ya3NwYWNlUm9vdCwgdXNlckhvbWUpO1xuXG5cdFx0XHRcdGNvbnN0IGVudHJ5ID0gcmVzdWx0Lmhvb2tzLmdldChIb29rVHlwZS5QcmVUb29sVXNlKSE7XG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChlbnRyeS5ob29rc1swXS50aW1lb3V0LCAxKTtcblx0XHRcdH0pO1xuXHRcdH0pO1xuXHR9KTtcbn0pO1xuXG5zdWl0ZSgnSG9va1NvdXJjZUZvcm1hdCcsICgpID0+IHtcblx0ZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlKCk7XG5cblx0c3VpdGUoJ2dldEhvb2tTb3VyY2VGb3JtYXQnLCAoKSA9PiB7XG5cdFx0dGVzdCgnZGV0ZWN0cyBDbGF1ZGUgZm9ybWF0IGZvciAuY2xhdWRlL3NldHRpbmdzLmpzb24nLCAoKSA9PiB7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZ2V0SG9va1NvdXJjZUZvcm1hdChVUkkuZmlsZSgnL3dvcmtzcGFjZS8uY2xhdWRlL3NldHRpbmdzLmpzb24nKSksIEhvb2tTb3VyY2VGb3JtYXQuQ2xhdWRlKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2RldGVjdHMgQ2xhdWRlIGZvcm1hdCBmb3IgLmNsYXVkZS9zZXR0aW5ncy5sb2NhbC5qc29uJywgKCkgPT4ge1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGdldEhvb2tTb3VyY2VGb3JtYXQoVVJJLmZpbGUoJy93b3Jrc3BhY2UvLmNsYXVkZS9zZXR0aW5ncy5sb2NhbC5qc29uJykpLCBIb29rU291cmNlRm9ybWF0LkNsYXVkZSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdkZXRlY3RzIENsYXVkZSBmb3JtYXQgZm9yIH4vLmNsYXVkZS9zZXR0aW5ncy5qc29uJywgKCkgPT4ge1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGdldEhvb2tTb3VyY2VGb3JtYXQoVVJJLmZpbGUoJy9ob21lL3VzZXIvLmNsYXVkZS9zZXR0aW5ncy5qc29uJykpLCBIb29rU291cmNlRm9ybWF0LkNsYXVkZSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdyZXR1cm5zIENvcGlsb3QgZm9ybWF0IGZvciAuZ2l0aHViL2hvb2tzL2hvb2tzLmpzb24nLCAoKSA9PiB7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZ2V0SG9va1NvdXJjZUZvcm1hdChVUkkuZmlsZSgnL3dvcmtzcGFjZS8uZ2l0aHViL2hvb2tzL2hvb2tzLmpzb24nKSksIEhvb2tTb3VyY2VGb3JtYXQuQ29waWxvdCk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdyZXR1cm5zIENvcGlsb3QgZm9ybWF0IGZvciBhcmJpdHJhcnkgLmpzb24gZmlsZScsICgpID0+IHtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChnZXRIb29rU291cmNlRm9ybWF0KFVSSS5maWxlKCcvd29ya3NwYWNlLy5naXRodWIvaG9va3MvbXktaG9va3MuanNvbicpKSwgSG9va1NvdXJjZUZvcm1hdC5Db3BpbG90KTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3JldHVybnMgQ29waWxvdCBmb3JtYXQgZm9yIHNldHRpbmdzLmpzb24gbm90IGluc2lkZSAuY2xhdWRlJywgKCkgPT4ge1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGdldEhvb2tTb3VyY2VGb3JtYXQoVVJJLmZpbGUoJy93b3Jrc3BhY2UvLnZzY29kZS9zZXR0aW5ncy5qc29uJykpLCBIb29rU291cmNlRm9ybWF0LkNvcGlsb3QpO1xuXHRcdH0pO1xuXHR9KTtcblxuXHRzdWl0ZSgnYnVpbGROZXdIb29rRW50cnknLCAoKSA9PiB7XG5cdFx0dGVzdCgnYnVpbGRzIENvcGlsb3QgZm9ybWF0IGVudHJ5JywgKCkgPT4ge1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChidWlsZE5ld0hvb2tFbnRyeShIb29rU291cmNlRm9ybWF0LkNvcGlsb3QpLCB7XG5cdFx0XHRcdHR5cGU6ICdjb21tYW5kJyxcblx0XHRcdFx0Y29tbWFuZDogJydcblx0XHRcdH0pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnYnVpbGRzIENsYXVkZSBmb3JtYXQgZW50cnkgd2l0aCBtYXRjaGVyIHdyYXBwZXInLCAoKSA9PiB7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGJ1aWxkTmV3SG9va0VudHJ5KEhvb2tTb3VyY2VGb3JtYXQuQ2xhdWRlKSwge1xuXHRcdFx0XHRtYXRjaGVyOiAnJyxcblx0XHRcdFx0aG9va3M6IFt7XG5cdFx0XHRcdFx0dHlwZTogJ2NvbW1hbmQnLFxuXHRcdFx0XHRcdGNvbW1hbmQ6ICcnXG5cdFx0XHRcdH1dXG5cdFx0XHR9KTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ0NsYXVkZSBmb3JtYXQgZW50cnkgc2VyaWFsaXplcyBjb3JyZWN0bHkgaW4gSlNPTicsICgpID0+IHtcblx0XHRcdGNvbnN0IGVudHJ5ID0gYnVpbGROZXdIb29rRW50cnkoSG9va1NvdXJjZUZvcm1hdC5DbGF1ZGUpO1xuXHRcdFx0Y29uc3QgaG9va3NDb250ZW50ID0ge1xuXHRcdFx0XHRob29rczoge1xuXHRcdFx0XHRcdFN1YmFnZW50U3RhcnQ6IFtlbnRyeV1cblx0XHRcdFx0fVxuXHRcdFx0fTtcblx0XHRcdGNvbnN0IGpzb24gPSBKU09OLnN0cmluZ2lmeShob29rc0NvbnRlbnQsIG51bGwsICdcXHQnKTtcblx0XHRcdGNvbnN0IHBhcnNlZCA9IEpTT04ucGFyc2UoanNvbik7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHBhcnNlZC5ob29rcy5TdWJhZ2VudFN0YXJ0WzBdLCB7XG5cdFx0XHRcdG1hdGNoZXI6ICcnLFxuXHRcdFx0XHRob29rczogW3tcblx0XHRcdFx0XHR0eXBlOiAnY29tbWFuZCcsXG5cdFx0XHRcdFx0Y29tbWFuZDogJydcblx0XHRcdFx0fV1cblx0XHRcdH0pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnQ29waWxvdCBmb3JtYXQgZW50cnkgc2VyaWFsaXplcyBjb3JyZWN0bHkgaW4gSlNPTicsICgpID0+IHtcblx0XHRcdGNvbnN0IGVudHJ5ID0gYnVpbGROZXdIb29rRW50cnkoSG9va1NvdXJjZUZvcm1hdC5Db3BpbG90KTtcblx0XHRcdGNvbnN0IGhvb2tzQ29udGVudCA9IHtcblx0XHRcdFx0aG9va3M6IHtcblx0XHRcdFx0XHRTdWJhZ2VudFN0YXJ0OiBbZW50cnldXG5cdFx0XHRcdH1cblx0XHRcdH07XG5cdFx0XHRjb25zdCBqc29uID0gSlNPTi5zdHJpbmdpZnkoaG9va3NDb250ZW50LCBudWxsLCAnXFx0Jyk7XG5cdFx0XHRjb25zdCBwYXJzZWQgPSBKU09OLnBhcnNlKGpzb24pO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChwYXJzZWQuaG9va3MuU3ViYWdlbnRTdGFydFswXSwge1xuXHRcdFx0XHR0eXBlOiAnY29tbWFuZCcsXG5cdFx0XHRcdGNvbW1hbmQ6ICcnXG5cdFx0XHR9KTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ0NsYXVkZSBmb3JtYXQgcm91bmQtdHJpcHMgdGhyb3VnaCBwYXJzZUNsYXVkZUhvb2tzJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgZW50cnkgPSBidWlsZE5ld0hvb2tFbnRyeShIb29rU291cmNlRm9ybWF0LkNsYXVkZSk7XG5cdFx0XHRjb25zdCBob29rc0NvbnRlbnQgPSB7XG5cdFx0XHRcdGhvb2tzOiB7XG5cdFx0XHRcdFx0UHJlVG9vbFVzZTogW2VudHJ5XVxuXHRcdFx0XHR9XG5cdFx0XHR9O1xuXG5cdFx0XHRjb25zdCByZXN1bHQgPSBwYXJzZUNsYXVkZUhvb2tzKGhvb2tzQ29udGVudCwgVVJJLmZpbGUoJy93b3Jrc3BhY2UnKSwgJy9ob21lL3VzZXInKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQuaG9va3Muc2l6ZSwgMSk7XG5cdFx0XHRhc3NlcnQub2socmVzdWx0Lmhvb2tzLmhhcyhIb29rVHlwZS5QcmVUb29sVXNlKSk7XG5cdFx0XHRjb25zdCBob29rcyA9IHJlc3VsdC5ob29rcy5nZXQoSG9va1R5cGUuUHJlVG9vbFVzZSkhO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGhvb2tzLmhvb2tzLmxlbmd0aCwgMSk7XG5cdFx0XHQvLyBFbXB0eSBjb21tYW5kIHN0cmluZyBpcyBmYWxzeSBhbmQgZ2V0cyBvbWl0dGVkIGJ5IHJlc29sdmVIb29rQ29tbWFuZFxuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGhvb2tzLmhvb2tzWzBdLmNvbW1hbmQsIHVuZGVmaW5lZCk7XG5cdFx0fSk7XG5cdH0pO1xufSk7XG4iXSwKICAibWFwcGluZ3MiOiAiQUFLQSxPQUFPLFlBQVk7QUFDbkIsU0FBUywrQ0FBK0M7QUFDeEQsU0FBUyxnQkFBZ0I7QUFDekIsU0FBUyxrQkFBa0IsdUJBQXVCLHVCQUF1QixtQ0FBbUM7QUFDNUcsU0FBUyxxQkFBcUIsa0JBQWtCLHlCQUF5QjtBQUN6RSxTQUFTLFdBQVc7QUFFcEIsTUFBTSxvQkFBb0IsTUFBTTtBQUMvQiwwQ0FBd0M7QUFFeEMsUUFBTSwrQkFBK0IsTUFBTTtBQUMxQyxVQUFNLGdCQUFnQixJQUFJLEtBQUssWUFBWTtBQUMzQyxVQUFNLFdBQVc7QUFFakIsU0FBSyxrQ0FBa0MsTUFBTTtBQUM1QyxZQUFNLE9BQU8sRUFBRSxNQUFNLFdBQVcsU0FBUyxjQUFjO0FBRXZELFlBQU0sU0FBUyw0QkFBNEIsTUFBTSxlQUFlLFFBQVE7QUFFeEUsYUFBTyxZQUFZLE9BQU8sUUFBUSxDQUFDO0FBQ25DLGFBQU8sWUFBWSxPQUFPLENBQUMs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
