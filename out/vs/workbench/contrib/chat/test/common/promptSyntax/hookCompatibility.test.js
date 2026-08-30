import assert from "assert";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../../../base/test/common/utils.js";
import { HookType } from "../../../common/promptSyntax/hookTypes.js";
import { parseCopilotHooks, parseHooksFromFile, HookSourceFormat } from "../../../common/promptSyntax/hookCompatibility.js";
import { URI } from "../../../../../../base/common/uri.js";
suite("HookCompatibility", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  suite("parseCopilotHooks", () => {
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
        const result = parseCopilotHooks(json, workspaceRoot, userHome);
        assert.strictEqual(result.size, 1);
        assert.ok(result.has(HookType.PreToolUse));
        const entry = result.get(HookType.PreToolUse);
        assert.strictEqual(entry.hooks.length, 1);
        assert.strictEqual(entry.hooks[0].command, 'echo "pre-tool"');
      });
    });
    suite("invalid inputs", () => {
      test("returns empty result for null json", () => {
        const result = parseCopilotHooks(null, workspaceRoot, userHome);
        assert.strictEqual(result.size, 0);
      });
      test("returns empty result for undefined json", () => {
        const result = parseCopilotHooks(void 0, workspaceRoot, userHome);
        assert.strictEqual(result.size, 0);
      });
      test("returns empty result for missing hooks property", () => {
        const result = parseCopilotHooks({}, workspaceRoot, userHome);
        assert.strictEqual(result.size, 0);
      });
    });
    suite("Claude-style matcher compatibility", () => {
      test("parses Claude-style nested matcher structure", () => {
        const json = {
          hooks: {
            PreToolUse: [
              {
                matcher: "Bash",
                hooks: [
                  { type: "command", command: 'echo "from matcher"' }
                ]
              }
            ]
          }
        };
        const result = parseCopilotHooks(json, workspaceRoot, userHome);
        assert.strictEqual(result.size, 1);
        const entry = result.get(HookType.PreToolUse);
        assert.strictEqual(entry.hooks.length, 1);
        assert.strictEqual(entry.hooks[0].command, 'echo "from matcher"');
      });
      test("parses Claude-style nested matcher with multiple hooks", () => {
        const json = {
          hooks: {
            PostToolUse: [
              {
                matcher: "Write",
                hooks: [
                  { type: "command", command: 'echo "first"' },
                  { type: "command", command: 'echo "second"' }
                ]
              }
            ]
          }
        };
        const result = parseCopilotHooks(json, workspaceRoot, userHome);
        const entry = result.get(HookType.PostToolUse);
        assert.strictEqual(entry.hooks.length, 2);
        assert.strictEqual(entry.hooks[0].command, 'echo "first"');
        assert.strictEqual(entry.hooks[1].command, 'echo "second"');
      });
      test("handles mixed direct and nested matcher entries", () => {
        const json = {
          hooks: {
            PreToolUse: [
              { type: "command", command: 'echo "direct"' },
              {
                matcher: "Bash",
                hooks: [
                  { type: "command", command: 'echo "nested"' }
                ]
              }
            ]
          }
        };
        const result = parseCopilotHooks(json, workspaceRoot, userHome);
        const entry = result.get(HookType.PreToolUse);
        assert.strictEqual(entry.hooks.length, 2);
        assert.strictEqual(entry.hooks[0].command, 'echo "direct"');
        assert.strictEqual(entry.hooks[1].command, 'echo "nested"');
      });
      test("handles Claude-style hook without type field", () => {
        const json = {
          hooks: {
            SessionStart: [
              { command: 'echo "no type"' }
            ]
          }
        };
        const result = parseCopilotHooks(json, workspaceRoot, userHome);
        const entry = result.get(HookType.SessionStart);
        assert.strictEqual(entry.hooks.length, 1);
        assert.strictEqual(entry.hooks[0].command, 'echo "no type"');
      });
    });
  });
  suite("parseHooksFromFile", () => {
    const workspaceRoot = URI.file("/workspace");
    const userHome = "/home/user";
    test("uses Copilot format for .github/hooks/*.json files", () => {
      const fileUri = URI.file("/workspace/.github/hooks/my-hooks.json");
      const json = {
        hooks: {
          PreToolUse: [
            { type: "command", command: 'echo "test"' }
          ]
        }
      };
      const result = parseHooksFromFile(fileUri, json, workspaceRoot, userHome);
      assert.strictEqual(result.format, HookSourceFormat.Copilot);
      assert.strictEqual(result.disabledAllHooks, false);
      assert.strictEqual(result.hooks.size, 1);
    });
    test("uses Claude format for .claude/settings.json files", () => {
      const fileUri = URI.file("/workspace/.claude/settings.json");
      const json = {
        disableAllHooks: true,
        hooks: {
          PreToolUse: [
            { type: "command", command: 'echo "test"' }
          ]
        }
      };
      const result = parseHooksFromFile(fileUri, json, workspaceRoot, userHome);
      assert.strictEqual(result.format, HookSourceFormat.Claude);
      assert.strictEqual(result.disabledAllHooks, true);
      assert.strictEqual(result.hooks.size, 0);
    });
    test("disableAllHooks is ignored for Copilot format", () => {
      const fileUri = URI.file("/workspace/.github/hooks/hooks.json");
      const json = {
        disableAllHooks: true,
        hooks: {
          SessionStart: [
            { type: "command", command: 'echo "start"' }
          ]
        }
      };
      const result = parseHooksFromFile(fileUri, json, workspaceRoot, userHome);
      assert.strictEqual(result.disabledAllHooks, false);
      assert.strictEqual(result.hooks.size, 1);
    });
    test("disabledAllHooks works for Claude format", () => {
      const fileUri = URI.file("/workspace/.claude/settings.local.json");
      const json = {
        disableAllHooks: true,
        hooks: {
          SessionStart: [
            { type: "command", command: 'echo "start"' }
          ]
        }
      };
      const result = parseHooksFromFile(fileUri, json, workspaceRoot, userHome);
      assert.strictEqual(result.disabledAllHooks, true);
      assert.strictEqual(result.hooks.size, 0);
    });
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXGNoYXRcXHRlc3RcXGNvbW1vblxccHJvbXB0U3ludGF4XFxob29rQ29tcGF0aWJpbGl0eS50ZXN0LnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IGFzc2VydCBmcm9tICdhc3NlcnQnO1xuaW1wb3J0IHsgZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS90ZXN0L2NvbW1vbi91dGlscy5qcyc7XG5pbXBvcnQgeyBIb29rVHlwZSB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9wcm9tcHRTeW50YXgvaG9va1R5cGVzLmpzJztcbmltcG9ydCB7IHBhcnNlQ29waWxvdEhvb2tzLCBwYXJzZUhvb2tzRnJvbUZpbGUsIEhvb2tTb3VyY2VGb3JtYXQgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vcHJvbXB0U3ludGF4L2hvb2tDb21wYXRpYmlsaXR5LmpzJztcbmltcG9ydCB7IFVSSSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3VyaS5qcyc7XG5cbnN1aXRlKCdIb29rQ29tcGF0aWJpbGl0eScsICgpID0+IHtcblx0ZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlKCk7XG5cblx0c3VpdGUoJ3BhcnNlQ29waWxvdEhvb2tzJywgKCkgPT4ge1xuXHRcdGNvbnN0IHdvcmtzcGFjZVJvb3QgPSBVUkkuZmlsZSgnL3dvcmtzcGFjZScpO1xuXHRcdGNvbnN0IHVzZXJIb21lID0gJy9ob21lL3VzZXInO1xuXG5cdFx0c3VpdGUoJ2Jhc2ljIHBhcnNpbmcnLCAoKSA9PiB7XG5cdFx0XHR0ZXN0KCdwYXJzZXMgc2ltcGxlIGhvb2sgd2l0aCBjb21tYW5kJywgKCkgPT4ge1xuXHRcdFx0XHRjb25zdCBqc29uID0ge1xuXHRcdFx0XHRcdGhvb2tzOiB7XG5cdFx0XHRcdFx0XHRQcmVUb29sVXNlOiBbXG5cdFx0XHRcdFx0XHRcdHsgdHlwZTogJ2NvbW1hbmQnLCBjb21tYW5kOiAnZWNobyBcInByZS10b29sXCInIH1cblx0XHRcdFx0XHRcdF1cblx0XHRcdFx0XHR9XG5cdFx0XHRcdH07XG5cblx0XHRcdFx0Y29uc3QgcmVzdWx0ID0gcGFyc2VDb3BpbG90SG9va3MoanNvbiwgd29ya3NwYWNlUm9vdCwgdXNlckhvbWUpO1xuXG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQuc2l6ZSwgMSk7XG5cdFx0XHRcdGFzc2VydC5vayhyZXN1bHQuaGFzKEhvb2tUeXBlLlByZVRvb2xVc2UpKTtcblx0XHRcdFx0Y29uc3QgZW50cnkgPSByZXN1bHQuZ2V0KEhvb2tUeXBlLlByZVRvb2xVc2UpITtcblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGVudHJ5Lmhvb2tzLmxlbmd0aCwgMSk7XG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChlbnRyeS5ob29rc1swXS5jb21tYW5kLCAnZWNobyBcInByZS10b29sXCInKTtcblx0XHRcdH0pO1xuXHRcdH0pO1xuXG5cdFx0c3VpdGUoJ2ludmFsaWQgaW5wdXRzJywgKCkgPT4ge1xuXHRcdFx0dGVzdCgncmV0dXJucyBlbXB0eSByZXN1bHQgZm9yIG51bGwganNvbicsICgpID0+IHtcblx0XHRcdFx0Y29uc3QgcmVzdWx0ID0gcGFyc2VDb3BpbG90SG9va3MobnVsbCwgd29ya3NwYWNlUm9vdCwgdXNlckhvbWUpO1xuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0LnNpemUsIDApO1xuXHRcdFx0fSk7XG5cblx0XHRcdHRlc3QoJ3JldHVybnMgZW1wdHkgcmVzdWx0IGZvciB1bmRlZmluZWQganNvbicsICgpID0+IHtcblx0XHRcdFx0Y29uc3QgcmVzdWx0ID0gcGFyc2VDb3BpbG90SG9va3ModW5kZWZpbmVkLCB3b3Jrc3BhY2VSb290LCB1c2VySG9tZSk7XG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQuc2l6ZSwgMCk7XG5cdFx0XHR9KTtcblxuXHRcdFx0dGVzdCgncmV0dXJucyBlbXB0eSByZXN1bHQgZm9yIG1pc3NpbmcgaG9va3MgcHJvcGVydHknLCAoKSA9PiB7XG5cdFx0XHRcdGNvbnN0IHJlc3VsdCA9IHBhcnNlQ29waWxvdEhvb2tzKHt9LCB3b3Jrc3BhY2VSb290LCB1c2VySG9tZSk7XG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQuc2l6ZSwgMCk7XG5cdFx0XHR9KTtcblx0XHR9KTtcblxuXHRcdHN1aXRlKCdDbGF1ZGUtc3R5bGUgbWF0Y2hlciBjb21wYXRpYmlsaXR5JywgKCkgPT4ge1xuXHRcdFx0dGVzdCgncGFyc2VzIENsYXVkZS1zdHlsZSBuZXN0ZWQgbWF0Y2hlciBzdHJ1Y3R1cmUnLCAoKSA9PiB7XG5cdFx0XHRcdC8vIFdoZW4gQ2xhdWRlIGZvcm1hdCBpcyBwYXN0ZWQgaW50byBDb3BpbG90IGhvb2tzIGZpbGVcblx0XHRcdFx0Y29uc3QganNvbiA9IHtcblx0XHRcdFx0XHRob29rczoge1xuXHRcdFx0XHRcdFx0UHJlVG9vbFVzZTogW1xuXHRcdFx0XHRcdFx0XHR7XG5cdFx0XHRcdFx0XHRcdFx0bWF0Y2hlcjogJ0Jhc2gnLFxuXHRcdFx0XHRcdFx0XHRcdGhvb2tzOiBbXG5cdFx0XHRcdFx0XHRcdFx0XHR7IHR5cGU6ICdjb21tYW5kJywgY29tbWFuZDogJ2VjaG8gXCJmcm9tIG1hdGNoZXJcIicgfVxuXHRcdFx0XHRcdFx0XHRcdF1cblx0XHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0XVxuXHRcdFx0XHRcdH1cblx0XHRcdFx0fTtcblxuXHRcdFx0XHRjb25zdCByZXN1bHQgPSBwYXJzZUNvcGlsb3RIb29rcyhqc29uLCB3b3Jrc3BhY2VSb290LCB1c2VySG9tZSk7XG5cblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdC5zaXplLCAxKTtcblx0XHRcdFx0Y29uc3QgZW50cnkgPSByZXN1bHQuZ2V0KEhvb2tUeXBlLlByZVRvb2xVc2UpITtcblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGVudHJ5Lmhvb2tzLmxlbmd0aCwgMSk7XG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChlbnRyeS5ob29rc1swXS5jb21tYW5kLCAnZWNobyBcImZyb20gbWF0Y2hlclwiJyk7XG5cdFx0XHR9KTtcblxuXHRcdFx0dGVzdCgncGFyc2VzIENsYXVkZS1zdHlsZSBuZXN0ZWQgbWF0Y2hlciB3aXRoIG11bHRpcGxlIGhvb2tzJywgKCkgPT4ge1xuXHRcdFx0XHRjb25zdCBqc29uID0ge1xuXHRcdFx0XHRcdGhvb2tzOiB7XG5cdFx0XHRcdFx0XHRQb3N0VG9vbFVzZTogW1xuXHRcdFx0XHRcdFx0XHR7XG5cdFx0XHRcdFx0XHRcdFx0bWF0Y2hlcjogJ1dyaXRlJyxcblx0XHRcdFx0XHRcdFx0XHRob29rczogW1xuXHRcdFx0XHRcdFx0XHRcdFx0eyB0eXBlOiAnY29tbWFuZCcsIGNvbW1hbmQ6ICdlY2hvIFwiZmlyc3RcIicgfSxcblx0XHRcdFx0XHRcdFx0XHRcdHsgdHlwZTogJ2NvbW1hbmQnLCBjb21tYW5kOiAnZWNobyBcInNlY29uZFwiJyB9XG5cdFx0XHRcdFx0XHRcdFx0XVxuXHRcdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHRdXG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9O1xuXG5cdFx0XHRcdGNvbnN0IHJlc3VsdCA9IHBhcnNlQ29waWxvdEhvb2tzKGpzb24sIHdvcmtzcGFjZVJvb3QsIHVzZXJIb21lKTtcblxuXHRcdFx0XHRjb25zdCBlbnRyeSA9IHJlc3VsdC5nZXQoSG9va1R5cGUuUG9zdFRvb2xVc2UpITtcblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGVudHJ5Lmhvb2tzLmxlbmd0aCwgMik7XG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChlbnRyeS5ob29rc1swXS5jb21tYW5kLCAnZWNobyBcImZpcnN0XCInKTtcblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGVudHJ5Lmhvb2tzWzFdLmNvbW1hbmQsICdlY2hvIFwic2Vjb25kXCInKTtcblx0XHRcdH0pO1xuXG5cdFx0XHR0ZXN0KCdoYW5kbGVzIG1peGVkIGRpcmVjdCBhbmQgbmVzdGVkIG1hdGNoZXIgZW50cmllcycsICgpID0+IHtcblx0XHRcdFx0Y29uc3QganNvbiA9IHtcblx0XHRcdFx0XHRob29rczoge1xuXHRcdFx0XHRcdFx0UHJlVG9vbFVzZTogW1xuXHRcdFx0XHRcdFx0XHR7IHR5cGU6ICdjb21tYW5kJywgY29tbWFuZDogJ2VjaG8gXCJkaXJlY3RcIicgfSxcblx0XHRcdFx0XHRcdFx0e1xuXHRcdFx0XHRcdFx0XHRcdG1hdGNoZXI6ICdCYXNoJyxcblx0XHRcdFx0XHRcdFx0XHRob29rczogW1xuXHRcdFx0XHRcdFx0XHRcdFx0eyB0eXBlOiAnY29tbWFuZCcsIGNvbW1hbmQ6ICdlY2hvIFwibmVzdGVkXCInIH1cblx0XHRcdFx0XHRcdFx0XHRdXG5cdFx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdF1cblx0XHRcdFx0XHR9XG5cdFx0XHRcdH07XG5cblx0XHRcdFx0Y29uc3QgcmVzdWx0ID0gcGFyc2VDb3BpbG90SG9va3MoanNvbiwgd29ya3NwYWNlUm9vdCwgdXNlckhvbWUpO1xuXG5cdFx0XHRcdGNvbnN0IGVudHJ5ID0gcmVzdWx0LmdldChIb29rVHlwZS5QcmVUb29sVXNlKSE7XG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChlbnRyeS5ob29rcy5sZW5ndGgsIDIpO1xuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZW50cnkuaG9va3NbMF0uY29tbWFuZCwgJ2VjaG8gXCJkaXJlY3RcIicpO1xuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZW50cnkuaG9va3NbMV0uY29tbWFuZCwgJ2VjaG8gXCJuZXN0ZWRcIicpO1xuXHRcdFx0fSk7XG5cblx0XHRcdHRlc3QoJ2hhbmRsZXMgQ2xhdWRlLXN0eWxlIGhvb2sgd2l0aG91dCB0eXBlIGZpZWxkJywgKCkgPT4ge1xuXHRcdFx0XHQvLyBDbGF1ZGUgYWxsb3dzIG9taXR0aW5nIHRoZSB0eXBlIGZpZWxkXG5cdFx0XHRcdGNvbnN0IGpzb24gPSB7XG5cdFx0XHRcdFx0aG9va3M6IHtcblx0XHRcdFx0XHRcdFNlc3Npb25TdGFydDogW1xuXHRcdFx0XHRcdFx0XHR7IGNvbW1hbmQ6ICdlY2hvIFwibm8gdHlwZVwiJyB9XG5cdFx0XHRcdFx0XHRdXG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9O1xuXG5cdFx0XHRcdGNvbnN0IHJlc3VsdCA9IHBhcnNlQ29waWxvdEhvb2tzKGpzb24sIHdvcmtzcGFjZVJvb3QsIHVzZXJIb21lKTtcblxuXHRcdFx0XHRjb25zdCBlbnRyeSA9IHJlc3VsdC5nZXQoSG9va1R5cGUuU2Vzc2lvblN0YXJ0KSE7XG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChlbnRyeS5ob29rcy5sZW5ndGgsIDEpO1xuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZW50cnkuaG9va3NbMF0uY29tbWFuZCwgJ2VjaG8gXCJubyB0eXBlXCInKTtcblx0XHRcdH0pO1xuXHRcdH0pO1xuXHR9KTtcblxuXHRzdWl0ZSgncGFyc2VIb29rc0Zyb21GaWxlJywgKCkgPT4ge1xuXHRcdGNvbnN0IHdvcmtzcGFjZVJvb3QgPSBVUkkuZmlsZSgnL3dvcmtzcGFjZScpO1xuXHRcdGNvbnN0IHVzZXJIb21lID0gJy9ob21lL3VzZXInO1xuXG5cdFx0dGVzdCgndXNlcyBDb3BpbG90IGZvcm1hdCBmb3IgLmdpdGh1Yi9ob29rcy8qLmpzb24gZmlsZXMnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBmaWxlVXJpID0gVVJJLmZpbGUoJy93b3Jrc3BhY2UvLmdpdGh1Yi9ob29rcy9teS1ob29rcy5qc29uJyk7XG5cdFx0XHRjb25zdCBqc29uID0ge1xuXHRcdFx0XHRob29rczoge1xuXHRcdFx0XHRcdFByZVRvb2xVc2U6IFtcblx0XHRcdFx0XHRcdHsgdHlwZTogJ2NvbW1hbmQnLCBjb21tYW5kOiAnZWNobyBcInRlc3RcIicgfVxuXHRcdFx0XHRcdF1cblx0XHRcdFx0fVxuXHRcdFx0fTtcblxuXHRcdFx0Y29uc3QgcmVzdWx0ID0gcGFyc2VIb29rc0Zyb21GaWxlKGZpbGVVcmksIGpzb24sIHdvcmtzcGFjZVJvb3QsIHVzZXJIb21lKTtcblxuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdC5mb3JtYXQsIEhvb2tTb3VyY2VGb3JtYXQuQ29waWxvdCk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0LmRpc2FibGVkQWxsSG9va3MsIGZhbHNlKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQuaG9va3Muc2l6ZSwgMSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCd1c2VzIENsYXVkZSBmb3JtYXQgZm9yIC5jbGF1ZGUvc2V0dGluZ3MuanNvbiBmaWxlcycsICgpID0+IHtcblx0XHRcdGNvbnN0IGZpbGVVcmkgPSBVUkkuZmlsZSgnL3dvcmtzcGFjZS8uY2xhdWRlL3NldHRpbmdzLmpzb24nKTtcblx0XHRcdGNvbnN0IGpzb24gPSB7XG5cdFx0XHRcdGRpc2FibGVBbGxIb29rczogdHJ1ZSxcblx0XHRcdFx0aG9va3M6IHtcblx0XHRcdFx0XHRQcmVUb29sVXNlOiBbXG5cdFx0XHRcdFx0XHR7IHR5cGU6ICdjb21tYW5kJywgY29tbWFuZDogJ2VjaG8gXCJ0ZXN0XCInIH1cblx0XHRcdFx0XHRdXG5cdFx0XHRcdH1cblx0XHRcdH07XG5cblx0XHRcdGNvbnN0IHJlc3VsdCA9IHBhcnNlSG9va3NGcm9tRmlsZShmaWxlVXJpLCBqc29uLCB3b3Jrc3BhY2VSb290LCB1c2VySG9tZSk7XG5cblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQuZm9ybWF0LCBIb29rU291cmNlRm9ybWF0LkNsYXVkZSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0LmRpc2FibGVkQWxsSG9va3MsIHRydWUpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdC5ob29rcy5zaXplLCAwKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2Rpc2FibGVBbGxIb29rcyBpcyBpZ25vcmVkIGZvciBDb3BpbG90IGZvcm1hdCcsICgpID0+IHtcblx0XHRcdGNvbnN0IGZpbGVVcmkgPSBVUkkuZmlsZSgnL3dvcmtzcGFjZS8uZ2l0aHViL2hvb2tzL2hvb2tzLmpzb24nKTtcblx0XHRcdGNvbnN0IGpzb24gPSB7XG5cdFx0XHRcdGRpc2FibGVBbGxIb29rczogdHJ1ZSxcblx0XHRcdFx0aG9va3M6IHtcblx0XHRcdFx0XHRTZXNzaW9uU3RhcnQ6IFtcblx0XHRcdFx0XHRcdHsgdHlwZTogJ2NvbW1hbmQnLCBjb21tYW5kOiAnZWNobyBcInN0YXJ0XCInIH1cblx0XHRcdFx0XHRdXG5cdFx0XHRcdH1cblx0XHRcdH07XG5cblx0XHRcdGNvbnN0IHJlc3VsdCA9IHBhcnNlSG9va3NGcm9tRmlsZShmaWxlVXJpLCBqc29uLCB3b3Jrc3BhY2VSb290LCB1c2VySG9tZSk7XG5cblx0XHRcdC8vIENvcGlsb3QgZm9ybWF0IGRvZXMgbm90IHN1cHBvcnQgZGlzYWJsZUFsbEhvb2tzXG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0LmRpc2FibGVkQWxsSG9va3MsIGZhbHNlKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQuaG9va3Muc2l6ZSwgMSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdkaXNhYmxlZEFsbEhvb2tzIHdvcmtzIGZvciBDbGF1ZGUgZm9ybWF0JywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgZmlsZVVyaSA9IFVSSS5maWxlKCcvd29ya3NwYWNlLy5jbGF1ZGUvc2V0dGluZ3MubG9jYWwuanNvbicpO1xuXHRcdFx0Y29uc3QganNvbiA9IHtcblx0XHRcdFx0ZGlzYWJsZUFsbEhvb2tzOiB0cnVlLFxuXHRcdFx0XHRob29rczoge1xuXHRcdFx0XHRcdFNlc3Npb25TdGFydDogW1xuXHRcdFx0XHRcdFx0eyB0eXBlOiAnY29tbWFuZCcsIGNvbW1hbmQ6ICdlY2hvIFwic3RhcnRcIicgfVxuXHRcdFx0XHRcdF1cblx0XHRcdFx0fVxuXHRcdFx0fTtcblxuXHRcdFx0Y29uc3QgcmVzdWx0ID0gcGFyc2VIb29rc0Zyb21GaWxlKGZpbGVVcmksIGpzb24sIHdvcmtzcGFjZVJvb3QsIHVzZXJIb21lKTtcblxuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdC5kaXNhYmxlZEFsbEhvb2tzLCB0cnVlKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQuaG9va3Muc2l6ZSwgMCk7XG5cdFx0fSk7XG5cdH0pO1xufSk7XG4iXSwKICAibWFwcGluZ3MiOiAiQUFLQSxPQUFPLFlBQVk7QUFDbkIsU0FBUywrQ0FBK0M7QUFDeEQsU0FBUyxnQkFBZ0I7QUFDekIsU0FBUyxtQkFBbUIsb0JBQW9CLHdCQUF3QjtBQUN4RSxTQUFTLFdBQVc7QUFFcEIsTUFBTSxxQkFBcUIsTUFBTTtBQUNoQywwQ0FBd0M7QUFFeEMsUUFBTSxxQkFBcUIsTUFBTTtBQUNoQyxVQUFNLGdCQUFnQixJQUFJLEtBQUssWUFBWTtBQUMzQyxVQUFNLFdBQVc7QUFFakIsVUFBTSxpQkFBaUIsTUFBTTtBQUM1QixXQUFLLG1DQUFtQyxNQUFNO0FBQzdDLGNBQU0sT0FBTztB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T0FBTztBQUMxRCxhQUFPLFlBQVksT0FBTyxrQkFBa0IsS0FBSztBQUNqRCxhQUFPLFlBQVksT0FBTyxNQUFNLE1BQU0sQ0FBQztBQUFBLElBQ3hDLENBQUM7QUFFRCxTQUFLLHNEQUFzRCxNQUFNO0FBQ2hFLFlBQU0sVUFBVSxJQUFJLEtBQUssa0NBQWtDO0FBQzNELFlBQU0sT0FBTztBQUFBLFFBQ1osaUJBQWlCO0FBQUEsUUFDakIsT0FBTztBQUFBLFVBQ04sWUFBWTtBQUFBLFlBQ1gsRUFBRSxNQUFNLFdBQVcsU0FBUyxjQUFjO0FBQUEsVUFDM0M7QUFBQSxRQUNEO0FBQUEsTUFDRDtBQUVBLFlBQU0sU0FBUyxtQkFBbUIsU0FBUyxNQUFNLGVBQWUsUUFBUTtBQUV4RSxhQUFPLFlBQVksT0FBTyxRQUFRLGlCQUFpQixNQUFNO0FBQ3pELGFBQU8sWUFBWSxPQUFPLGtCQUFrQixJQUFJO0FBQ2hELGFBQU8sWUFBWSxPQUFPLE1BQU0sTUFBTSxDQUFDO0FBQUEsSUFDeEMsQ0FBQztBQUVELFNBQUssaURBQWlELE1BQU07QUFDM0QsWUFBTSxVQUFVLElBQUksS0FBSyxxQ0FBcUM7QUFDOUQsWUFBTSxPQUFPO0FBQUEsUUFDWixpQkFBaUI7QUFBQSxRQUNqQixPQUFPO0FBQUEsVUFDTixjQUFjO0FBQUEsWUFDYixFQUFFLE1BQU0sV0FBVyxTQUFTLGVBQWU7QUFBQSxVQUM1QztBQUFBLFFBQ0Q7QUFBQSxNQUNEO0FBRUEsWUFBTSxTQUFTLG1CQUFtQixTQUFTLE1BQU0sZUFBZSxRQUFRO0FBR3hFLGFBQU8sWUFBWSxPQUFPLGtCQUFrQixLQUFLO0FBQ2pELGFBQU8sWUFBWSxPQUFPLE1BQU0sTUFBTSxDQUFDO0FBQUEsSUFDeEMsQ0FBQztBQUVELFNBQUssNENBQTRDLE1BQU07QUFDdEQsWUFBTSxVQUFVLElBQUksS0FBSyx3Q0FBd0M7QUFDakUsWUFBTSxPQUFPO0FBQUEsUUFDWixpQkFBaUI7QUFBQSxRQUNqQixPQUFPO0FBQUEsVUFDTixjQUFjO0FBQUEsWUFDYixFQUFFLE1BQU0sV0FBVyxTQUFTLGVBQWU7QUFBQSxVQUM1QztBQUFBLFFBQ0Q7QUFBQSxNQUNEO0FBRUEsWUFBTSxTQUFTLG1CQUFtQixTQUFTLE1BQU0sZUFBZSxRQUFRO0FBRXhFLGFBQU8sWUFBWSxPQUFPLGtCQUFrQixJQUFJO0FBQ2hELGFBQU8sWUFBWSxPQUFPLE1BQU0sTUFBTSxDQUFDO0FBQUEsSUFDeEMsQ0FBQztBQUFBLEVBQ0YsQ0FBQztBQUNGLENBQUM7IiwKICAibmFtZXMiOiBbXQp9Cg==
