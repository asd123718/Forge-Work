import assert from "assert";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../../../base/test/common/utils.js";
import { findHookCommandInYaml, findHookCommandSelection } from "../../../browser/promptSyntax/hookUtils.js";
import { buildNewHookEntry, HookSourceFormat } from "../../../common/promptSyntax/hookCompatibility.js";
function getSelectedText(content, selection) {
  const lines = content.split("\n");
  if (selection.startLineNumber === selection.endLineNumber) {
    return lines[selection.startLineNumber - 1].substring(selection.startColumn - 1, selection.endColumn - 1);
  }
  const result = [];
  result.push(lines[selection.startLineNumber - 1].substring(selection.startColumn - 1));
  for (let i = selection.startLineNumber; i < selection.endLineNumber - 1; i++) {
    result.push(lines[i]);
  }
  result.push(lines[selection.endLineNumber - 1].substring(0, selection.endColumn - 1));
  return result.join("\n");
}
suite("hookUtils", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  suite("findHookCommandSelection", () => {
    suite("simple format", () => {
      const simpleFormat = `{
	"hooks": {
		"SessionStart": [
			{
				"type": "command",
				"command": "echo first"
			},
			{
				"type": "command",
				"command": "echo second"
			}
		],
		"UserPromptSubmit": [
			{
				"type": "command",
				"command": "echo foo > test.derp"
			}
		]
	}
}`;
      test("finds first command in SessionStart", () => {
        const result = findHookCommandSelection(simpleFormat, "SessionStart", 0, "command");
        assert.ok(result);
        assert.strictEqual(getSelectedText(simpleFormat, result), "echo first");
        assert.deepStrictEqual(result, {
          startLineNumber: 6,
          startColumn: 17,
          endLineNumber: 6,
          endColumn: 27
        });
      });
      test("finds second command in SessionStart", () => {
        const result = findHookCommandSelection(simpleFormat, "SessionStart", 1, "command");
        assert.ok(result);
        assert.strictEqual(getSelectedText(simpleFormat, result), "echo second");
        assert.deepStrictEqual(result, {
          startLineNumber: 10,
          startColumn: 17,
          endLineNumber: 10,
          endColumn: 28
        });
      });
      test("finds command in UserPromptSubmit", () => {
        const result = findHookCommandSelection(simpleFormat, "UserPromptSubmit", 0, "command");
        assert.ok(result);
        assert.strictEqual(getSelectedText(simpleFormat, result), "echo foo > test.derp");
        assert.deepStrictEqual(result, {
          startLineNumber: 16,
          startColumn: 17,
          endLineNumber: 16,
          endColumn: 37
        });
      });
      test("returns undefined for out of bounds index", () => {
        const result = findHookCommandSelection(simpleFormat, "SessionStart", 5, "command");
        assert.strictEqual(result, void 0);
      });
      test("returns undefined for non-existent hook type", () => {
        const result = findHookCommandSelection(simpleFormat, "nonExistent", 0, "command");
        assert.strictEqual(result, void 0);
      });
    });
    suite("nested matcher format", () => {
      const nestedFormat = `{
	"forceLoginMethod": "console",
	"hooks": {
		"UserPromptSubmit": [
			{
				"matcher": "",
				"hooks": [
					{
						"type": "command",
						"command": "echo 'foobarbaz5' > ~/foobarbaz.txt"
					}
				]
			}
		]
	}
}`;
      test("finds command inside nested hooks", () => {
        const result = findHookCommandSelection(nestedFormat, "UserPromptSubmit", 0, "command");
        assert.ok(result);
        assert.strictEqual(getSelectedText(nestedFormat, result), "echo 'foobarbaz5' > ~/foobarbaz.txt");
        assert.deepStrictEqual(result, {
          startLineNumber: 10,
          startColumn: 19,
          endLineNumber: 10,
          endColumn: 54
        });
      });
      test("returns undefined for non-existent field name", () => {
        const result = findHookCommandSelection(nestedFormat, "UserPromptSubmit", 0, "bash");
        assert.strictEqual(result, void 0);
      });
    });
    suite("mixed format with multiple nested hooks", () => {
      const mixedFormat = `{
	"hooks": {
		"PreToolUse": [
			{
				"matcher": "edit_file",
				"hooks": [
					{
						"type": "command",
						"command": "first nested"
					},
					{
						"type": "command",
						"command": "second nested"
					}
				]
			},
			{
				"type": "command",
				"command": "simple after nested"
			}
		]
	}
}`;
      test("finds first command in first nested hooks array", () => {
        const result = findHookCommandSelection(mixedFormat, "PreToolUse", 0, "command");
        assert.ok(result);
        assert.strictEqual(getSelectedText(mixedFormat, result), "first nested");
        assert.deepStrictEqual(result, {
          startLineNumber: 9,
          startColumn: 19,
          endLineNumber: 9,
          endColumn: 31
        });
      });
      test("finds second command in first nested hooks array", () => {
        const result = findHookCommandSelection(mixedFormat, "PreToolUse", 1, "command");
        assert.ok(result);
        assert.strictEqual(getSelectedText(mixedFormat, result), "second nested");
        assert.deepStrictEqual(result, {
          startLineNumber: 13,
          startColumn: 19,
          endLineNumber: 13,
          endColumn: 32
        });
      });
      test("finds simple command after nested structure", () => {
        const result = findHookCommandSelection(mixedFormat, "PreToolUse", 2, "command");
        assert.ok(result);
        assert.strictEqual(getSelectedText(mixedFormat, result), "simple after nested");
        assert.deepStrictEqual(result, {
          startLineNumber: 19,
          startColumn: 17,
          endLineNumber: 19,
          endColumn: 36
        });
      });
    });
    suite("bash and powershell fields", () => {
      const platformSpecificFormat = `{
	"hooks": {
		"SessionStart": [
			{
				"type": "command",
				"bash": "echo hello from bash",
				"powershell": "Write-Host hello"
			}
		]
	}
}`;
      test("finds bash field", () => {
        const result = findHookCommandSelection(platformSpecificFormat, "SessionStart", 0, "bash");
        assert.ok(result);
        assert.strictEqual(getSelectedText(platformSpecificFormat, result), "echo hello from bash");
        assert.deepStrictEqual(result, {
          startLineNumber: 6,
          startColumn: 14,
          endLineNumber: 6,
          endColumn: 34
        });
      });
      test("finds powershell field", () => {
        const result = findHookCommandSelection(platformSpecificFormat, "SessionStart", 0, "powershell");
        assert.ok(result);
        assert.strictEqual(getSelectedText(platformSpecificFormat, result), "Write-Host hello");
        assert.deepStrictEqual(result, {
          startLineNumber: 7,
          startColumn: 20,
          endLineNumber: 7,
          endColumn: 36
        });
      });
    });
    suite("edge cases", () => {
      test("returns undefined for empty content", () => {
        const result = findHookCommandSelection("", "sessionStart", 0, "command");
        assert.strictEqual(result, void 0);
      });
      test("returns undefined for invalid JSON", () => {
        const result = findHookCommandSelection("{ invalid json }", "sessionStart", 0, "command");
        assert.strictEqual(result, void 0);
      });
      test("returns undefined when hooks key is missing", () => {
        const content = '{ "other": 1 }';
        const result = findHookCommandSelection(content, "sessionStart", 0, "command");
        assert.strictEqual(result, void 0);
      });
      test("returns undefined when hook type array is empty", () => {
        const content = '{ "hooks": { "sessionStart": [] } }';
        const result = findHookCommandSelection(content, "sessionStart", 0, "command");
        assert.strictEqual(result, void 0);
      });
      test("returns undefined when hook item is not an object", () => {
        const content = '{ "hooks": { "sessionStart": ["not an object"] } }';
        const result = findHookCommandSelection(content, "sessionStart", 0, "command");
        assert.strictEqual(result, void 0);
      });
      test("handles empty command string", () => {
        const content = `{
	"hooks": {
		"sessionStart": [
			{
				"type": "command",
				"command": ""
			}
		]
	}
}`;
        const result = findHookCommandSelection(content, "sessionStart", 0, "command");
        assert.ok(result);
        assert.strictEqual(getSelectedText(content, result), "");
        assert.deepStrictEqual(result, {
          startLineNumber: 6,
          startColumn: 17,
          endLineNumber: 6,
          endColumn: 17
        });
      });
      test("handles multiline command value", () => {
        const content = `{
	"hooks": {
		"sessionStart": [
			{
				"type": "command",
				"command": "line1\\nline2"
			}
		]
	}
}`;
        const result = findHookCommandSelection(content, "sessionStart", 0, "command");
        assert.ok(result);
        assert.strictEqual(getSelectedText(content, result), "line1\\nline2");
        assert.deepStrictEqual(result, {
          startLineNumber: 6,
          startColumn: 17,
          endLineNumber: 6,
          endColumn: 29
        });
      });
    });
    suite("nested matcher with empty hooks array", () => {
      const emptyNestedHooks = `{
	"hooks": {
		"UserPromptSubmit": [
			{
				"matcher": "some-pattern",
				"hooks": []
			},
			{
				"type": "command",
				"command": "after empty nested"
			}
		]
	}
}`;
      test("skips empty nested hooks and finds subsequent command", () => {
        const result = findHookCommandSelection(emptyNestedHooks, "UserPromptSubmit", 0, "command");
        assert.ok(result);
        assert.strictEqual(getSelectedText(emptyNestedHooks, result), "after empty nested");
        assert.deepStrictEqual(result, {
          startLineNumber: 10,
          startColumn: 17,
          endLineNumber: 10,
          endColumn: 35
        });
      });
    });
  });
  suite("findHookCommandSelection - copilotCLICompat", () => {
    suite("simple format", () => {
      const simpleFormat = `{
	"hooks": {
		"sessionStart": [
			{
				"type": "command",
				"command": "echo first"
			},
			{
				"type": "command",
				"command": "echo second"
			}
		],
		"userPromptSubmitted": [
			{
				"type": "command",
				"command": "echo foo > test.derp"
			}
		]
	}
}`;
      test("finds first command in sessionStart", () => {
        const result = findHookCommandSelection(simpleFormat, "sessionStart", 0, "command");
        assert.ok(result);
        assert.strictEqual(getSelectedText(simpleFormat, result), "echo first");
        assert.deepStrictEqual(result, {
          startLineNumber: 6,
          startColumn: 17,
          endLineNumber: 6,
          endColumn: 27
        });
      });
      test("finds second command in sessionStart", () => {
        const result = findHookCommandSelection(simpleFormat, "sessionStart", 1, "command");
        assert.ok(result);
        assert.strictEqual(getSelectedText(simpleFormat, result), "echo second");
        assert.deepStrictEqual(result, {
          startLineNumber: 10,
          startColumn: 17,
          endLineNumber: 10,
          endColumn: 28
        });
      });
      test("finds command in userPromptSubmitted", () => {
        const result = findHookCommandSelection(simpleFormat, "userPromptSubmitted", 0, "command");
        assert.ok(result);
        assert.strictEqual(getSelectedText(simpleFormat, result), "echo foo > test.derp");
        assert.deepStrictEqual(result, {
          startLineNumber: 16,
          startColumn: 17,
          endLineNumber: 16,
          endColumn: 37
        });
      });
      test("returns undefined for out of bounds index", () => {
        const result = findHookCommandSelection(simpleFormat, "sessionStart", 5, "command");
        assert.strictEqual(result, void 0);
      });
      test("returns undefined for non-existent hook type", () => {
        const result = findHookCommandSelection(simpleFormat, "nonExistent", 0, "command");
        assert.strictEqual(result, void 0);
      });
    });
    suite("nested matcher format", () => {
      const nestedFormat = `{
	"forceLoginMethod": "console",
	"hooks": {
		"userPromptSubmitted": [
			{
				"matcher": "",
				"hooks": [
					{
						"type": "command",
						"command": "echo 'foobarbaz5' > ~/foobarbaz.txt"
					}
				]
			}
		]
	}
}`;
      test("finds command inside nested hooks", () => {
        const result = findHookCommandSelection(nestedFormat, "userPromptSubmitted", 0, "command");
        assert.ok(result);
        assert.strictEqual(getSelectedText(nestedFormat, result), "echo 'foobarbaz5' > ~/foobarbaz.txt");
        assert.deepStrictEqual(result, {
          startLineNumber: 10,
          startColumn: 19,
          endLineNumber: 10,
          endColumn: 54
        });
      });
      test("returns undefined for non-existent field name", () => {
        const result = findHookCommandSelection(nestedFormat, "userPromptSubmitted", 0, "bash");
        assert.strictEqual(result, void 0);
      });
    });
    suite("mixed format with multiple nested hooks", () => {
      const mixedFormat = `{
	"hooks": {
		"preToolUse": [
			{
				"matcher": "edit_file",
				"hooks": [
					{
						"type": "command",
						"command": "first nested"
					},
					{
						"type": "command",
						"command": "second nested"
					}
				]
			},
			{
				"type": "command",
				"command": "simple after nested"
			}
		]
	}
}`;
      test("finds first command in first nested hooks array", () => {
        const result = findHookCommandSelection(mixedFormat, "preToolUse", 0, "command");
        assert.ok(result);
        assert.strictEqual(getSelectedText(mixedFormat, result), "first nested");
        assert.deepStrictEqual(result, {
          startLineNumber: 9,
          startColumn: 19,
          endLineNumber: 9,
          endColumn: 31
        });
      });
      test("finds second command in first nested hooks array", () => {
        const result = findHookCommandSelection(mixedFormat, "preToolUse", 1, "command");
        assert.ok(result);
        assert.strictEqual(getSelectedText(mixedFormat, result), "second nested");
        assert.deepStrictEqual(result, {
          startLineNumber: 13,
          startColumn: 19,
          endLineNumber: 13,
          endColumn: 32
        });
      });
      test("finds simple command after nested structure", () => {
        const result = findHookCommandSelection(mixedFormat, "preToolUse", 2, "command");
        assert.ok(result);
        assert.strictEqual(getSelectedText(mixedFormat, result), "simple after nested");
        assert.deepStrictEqual(result, {
          startLineNumber: 19,
          startColumn: 17,
          endLineNumber: 19,
          endColumn: 36
        });
      });
    });
    suite("bash and powershell fields", () => {
      const platformSpecificFormat = `{
	"hooks": {
		"sessionStart": [
			{
				"type": "command",
				"bash": "echo hello from bash",
				"powershell": "Write-Host hello"
			}
		]
	}
}`;
      test("finds bash field", () => {
        const result = findHookCommandSelection(platformSpecificFormat, "sessionStart", 0, "bash");
        assert.ok(result);
        assert.strictEqual(getSelectedText(platformSpecificFormat, result), "echo hello from bash");
        assert.deepStrictEqual(result, {
          startLineNumber: 6,
          startColumn: 14,
          endLineNumber: 6,
          endColumn: 34
        });
      });
      test("finds powershell field", () => {
        const result = findHookCommandSelection(platformSpecificFormat, "sessionStart", 0, "powershell");
        assert.ok(result);
        assert.strictEqual(getSelectedText(platformSpecificFormat, result), "Write-Host hello");
        assert.deepStrictEqual(result, {
          startLineNumber: 7,
          startColumn: 20,
          endLineNumber: 7,
          endColumn: 36
        });
      });
    });
    suite("edge cases", () => {
      test("returns undefined for empty content", () => {
        const result = findHookCommandSelection("", "sessionStart", 0, "command");
        assert.strictEqual(result, void 0);
      });
      test("returns undefined for invalid JSON", () => {
        const result = findHookCommandSelection("{ invalid json }", "sessionStart", 0, "command");
        assert.strictEqual(result, void 0);
      });
      test("returns undefined when hooks key is missing", () => {
        const content = '{ "other": 1 }';
        const result = findHookCommandSelection(content, "sessionStart", 0, "command");
        assert.strictEqual(result, void 0);
      });
      test("returns undefined when hook type array is empty", () => {
        const content = '{ "hooks": { "sessionStart": [] } }';
        const result = findHookCommandSelection(content, "sessionStart", 0, "command");
        assert.strictEqual(result, void 0);
      });
      test("returns undefined when hook item is not an object", () => {
        const content = '{ "hooks": { "sessionStart": ["not an object"] } }';
        const result = findHookCommandSelection(content, "sessionStart", 0, "command");
        assert.strictEqual(result, void 0);
      });
      test("handles empty command string", () => {
        const content = `{
	"hooks": {
		"sessionStart": [
			{
				"type": "command",
				"command": ""
			}
		]
	}
}`;
        const result = findHookCommandSelection(content, "sessionStart", 0, "command");
        assert.ok(result);
        assert.strictEqual(getSelectedText(content, result), "");
        assert.deepStrictEqual(result, {
          startLineNumber: 6,
          startColumn: 17,
          endLineNumber: 6,
          endColumn: 17
        });
      });
      test("handles multiline command value", () => {
        const content = `{
	"hooks": {
		"sessionStart": [
			{
				"type": "command",
				"command": "line1\\nline2"
			}
		]
	}
}`;
        const result = findHookCommandSelection(content, "sessionStart", 0, "command");
        assert.ok(result);
        assert.strictEqual(getSelectedText(content, result), "line1\\nline2");
        assert.deepStrictEqual(result, {
          startLineNumber: 6,
          startColumn: 17,
          endLineNumber: 6,
          endColumn: 29
        });
      });
    });
    suite("nested matcher with empty hooks array", () => {
      const emptyNestedHooks = `{
	"hooks": {
		"userPromptSubmitted": [
			{
				"matcher": "some-pattern",
				"hooks": []
			},
			{
				"type": "command",
				"command": "after empty nested"
			}
		]
	}
}`;
      test("skips empty nested hooks and finds subsequent command", () => {
        const result = findHookCommandSelection(emptyNestedHooks, "userPromptSubmitted", 0, "command");
        assert.ok(result);
        assert.strictEqual(getSelectedText(emptyNestedHooks, result), "after empty nested");
        assert.deepStrictEqual(result, {
          startLineNumber: 10,
          startColumn: 17,
          endLineNumber: 10,
          endColumn: 35
        });
      });
    });
  });
  suite("findHookCommandSelection with buildNewHookEntry", () => {
    test("finds command in Copilot-format generated JSON", () => {
      const entry = buildNewHookEntry(HookSourceFormat.Copilot);
      const content = JSON.stringify({ hooks: { SessionStart: [entry] } }, null, "	");
      const result = findHookCommandSelection(content, "SessionStart", 0, "command");
      assert.ok(result);
      assert.strictEqual(getSelectedText(content, result), "");
    });
    test("finds command in Claude-format generated JSON", () => {
      const entry = buildNewHookEntry(HookSourceFormat.Claude);
      const content = JSON.stringify({ hooks: { PreToolUse: [entry] } }, null, "	");
      const result = findHookCommandSelection(content, "PreToolUse", 0, "command");
      assert.ok(result);
      assert.strictEqual(getSelectedText(content, result), "");
    });
    test("finds command when appending Claude entry to existing hooks", () => {
      const entry1 = buildNewHookEntry(HookSourceFormat.Claude);
      const entry2 = buildNewHookEntry(HookSourceFormat.Claude);
      const content = JSON.stringify({ hooks: { PreToolUse: [entry1, entry2] } }, null, "	");
      const result0 = findHookCommandSelection(content, "PreToolUse", 0, "command");
      const result1 = findHookCommandSelection(content, "PreToolUse", 1, "command");
      assert.ok(result0);
      assert.ok(result1);
      assert.strictEqual(getSelectedText(content, result0), "");
      assert.strictEqual(getSelectedText(content, result1), "");
      assert.ok(result1.startLineNumber > result0.startLineNumber);
    });
    test("Claude format JSON has correct structure", () => {
      const entry = buildNewHookEntry(HookSourceFormat.Claude);
      const content = JSON.stringify({ hooks: { SubagentStart: [entry] } }, null, "	");
      const parsed = JSON.parse(content);
      assert.deepStrictEqual(parsed, {
        hooks: {
          SubagentStart: [
            {
              matcher: "",
              hooks: [{
                type: "command",
                command: ""
              }]
            }
          ]
        }
      });
    });
    test("Copilot format JSON has correct structure", () => {
      const entry = buildNewHookEntry(HookSourceFormat.Copilot);
      const content = JSON.stringify({ hooks: { SubagentStart: [entry] } }, null, "	");
      const parsed = JSON.parse(content);
      assert.deepStrictEqual(parsed, {
        hooks: {
          SubagentStart: [
            {
              type: "command",
              command: ""
            }
          ]
        }
      });
    });
  });
  suite("findHookCommandInYaml", () => {
    test("finds unquoted command value", () => {
      const content = [
        "---",
        "hooks:",
        "  sessionStart:",
        "    - command: echo hello",
        "---"
      ].join("\n");
      const result = findHookCommandInYaml(content, "echo hello");
      assert.ok(result);
      assert.strictEqual(getSelectedText(content, result), "echo hello");
      assert.deepStrictEqual(result, {
        startLineNumber: 4,
        startColumn: 16,
        endLineNumber: 4,
        endColumn: 26
      });
    });
    test("finds double-quoted command value", () => {
      const content = [
        "---",
        "hooks:",
        "  sessionStart:",
        '    - command: "echo hello"',
        "---"
      ].join("\n");
      const result = findHookCommandInYaml(content, "echo hello");
      assert.ok(result);
      assert.strictEqual(getSelectedText(content, result), "echo hello");
    });
    test("finds single-quoted command value", () => {
      const content = [
        "---",
        "hooks:",
        "  sessionStart:",
        `    - command: 'echo hello'`,
        "---"
      ].join("\n");
      const result = findHookCommandInYaml(content, "echo hello");
      assert.ok(result);
      assert.strictEqual(getSelectedText(content, result), "echo hello");
    });
    test("finds command without list prefix", () => {
      const content = [
        "---",
        "hooks:",
        "  sessionStart:",
        "    command: run-lint",
        "---"
      ].join("\n");
      const result = findHookCommandInYaml(content, "run-lint");
      assert.ok(result);
      assert.strictEqual(getSelectedText(content, result), "run-lint");
    });
    test("does not match substring of a longer command", () => {
      const content = [
        "---",
        "hooks:",
        "  sessionStart:",
        "    - command: echo hello-world",
        "---"
      ].join("\n");
      const result = findHookCommandInYaml(content, "echo hello");
      assert.strictEqual(result, void 0);
    });
    test("returns undefined when command is not found", () => {
      const content = [
        "---",
        "hooks:",
        "  sessionStart:",
        "    - command: echo hello",
        "---"
      ].join("\n");
      const result = findHookCommandInYaml(content, "echo goodbye");
      assert.strictEqual(result, void 0);
    });
    test("returns undefined when no command lines exist", () => {
      const content = [
        "---",
        "name: my-agent",
        "description: An agent",
        "---"
      ].join("\n");
      const result = findHookCommandInYaml(content, "echo hello");
      assert.strictEqual(result, void 0);
    });
    test("returns undefined for empty content", () => {
      const result = findHookCommandInYaml("", "echo hello");
      assert.strictEqual(result, void 0);
    });
    test("finds first matching command when multiple exist", () => {
      const content = [
        "---",
        "hooks:",
        "  sessionStart:",
        "    - command: echo hello",
        "  userPromptSubmit:",
        "    - command: echo hello",
        "---"
      ].join("\n");
      const result = findHookCommandInYaml(content, "echo hello");
      assert.ok(result);
      assert.strictEqual(result.startLineNumber, 4);
    });
    test("ignores lines that are not command fields", () => {
      const content = [
        "---",
        "description: run command echo hello",
        "hooks:",
        "  sessionStart:",
        "    - command: echo hello",
        "---"
      ].join("\n");
      const result = findHookCommandInYaml(content, "echo hello");
      assert.ok(result);
      assert.strictEqual(result.startLineNumber, 5);
    });
    test("handles command with special characters", () => {
      const content = [
        "---",
        "hooks:",
        "  preToolUse:",
        '    - command: echo "foo" > /tmp/out.txt',
        "---"
      ].join("\n");
      const result = findHookCommandInYaml(content, 'echo "foo" > /tmp/out.txt');
      assert.ok(result);
      assert.strictEqual(getSelectedText(content, result), 'echo "foo" > /tmp/out.txt');
    });
    test("matches command followed by trailing whitespace", () => {
      const content = [
        "---",
        "hooks:",
        "  sessionStart:",
        "    - command: echo hello   ",
        "---"
      ].join("\n");
      const result = findHookCommandInYaml(content, "echo hello");
      assert.ok(result);
      assert.strictEqual(getSelectedText(content, result), "echo hello");
    });
    test("finds short command that is a substring of the key name", () => {
      const content = [
        "hooks:",
        "  Stop:",
        "    - timeout: 10",
        '      command: "a"',
        "      type: command"
      ].join("\n");
      const result = findHookCommandInYaml(content, "a");
      assert.ok(result);
      assert.strictEqual(getSelectedText(content, result), "a");
      assert.strictEqual(result.startLineNumber, 4);
    });
    test("finds short command in bash field that is a substring of the key name", () => {
      const content = [
        "hooks:",
        "  sessionStart:",
        '    - bash: "a"',
        "      type: command"
      ].join("\n");
      const result = findHookCommandInYaml(content, "a");
      assert.ok(result);
      assert.strictEqual(getSelectedText(content, result), "a");
      assert.strictEqual(result.startLineNumber, 3);
    });
    test("finds command in powershell field", () => {
      const content = [
        "hooks:",
        "  sessionStart:",
        '    - powershell: "echo hello"',
        "      type: command"
      ].join("\n");
      const result = findHookCommandInYaml(content, "echo hello");
      assert.ok(result);
      assert.strictEqual(getSelectedText(content, result), "echo hello");
      assert.strictEqual(result.startLineNumber, 3);
    });
    test("finds command in windows field", () => {
      const content = [
        "hooks:",
        "  sessionStart:",
        '    - windows: "dir"',
        "      type: command"
      ].join("\n");
      const result = findHookCommandInYaml(content, "dir");
      assert.ok(result);
      assert.strictEqual(getSelectedText(content, result), "dir");
      assert.strictEqual(result.startLineNumber, 3);
    });
    test("finds command in linux and osx fields", () => {
      const content = [
        "hooks:",
        "  sessionStart:",
        '    - linux: "ls"',
        '      osx: "ls -G"',
        "      type: command"
      ].join("\n");
      const linuxResult = findHookCommandInYaml(content, "ls");
      assert.ok(linuxResult);
      assert.strictEqual(getSelectedText(content, linuxResult), "ls");
      assert.strictEqual(linuxResult.startLineNumber, 3);
      const osxResult = findHookCommandInYaml(content, "ls -G");
      assert.ok(osxResult);
      assert.strictEqual(getSelectedText(content, osxResult), "ls -G");
      assert.strictEqual(osxResult.startLineNumber, 4);
    });
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXGNoYXRcXHRlc3RcXGJyb3dzZXJcXHByb21wdFN5bnRheFxcaG9va1V0aWxzLnRlc3QudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgYXNzZXJ0IGZyb20gJ2Fzc2VydCc7XG5pbXBvcnQgeyBlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL3Rlc3QvY29tbW9uL3V0aWxzLmpzJztcbmltcG9ydCB7IGZpbmRIb29rQ29tbWFuZEluWWFtbCwgZmluZEhvb2tDb21tYW5kU2VsZWN0aW9uIH0gZnJvbSAnLi4vLi4vLi4vYnJvd3Nlci9wcm9tcHRTeW50YXgvaG9va1V0aWxzLmpzJztcbmltcG9ydCB7IElUZXh0RWRpdG9yU2VsZWN0aW9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vZWRpdG9yL2NvbW1vbi9lZGl0b3IuanMnO1xuaW1wb3J0IHsgYnVpbGROZXdIb29rRW50cnksIEhvb2tTb3VyY2VGb3JtYXQgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vcHJvbXB0U3ludGF4L2hvb2tDb21wYXRpYmlsaXR5LmpzJztcblxuLyoqXG4gKiBIZWxwZXIgdG8gZXh0cmFjdCB0aGUgc2VsZWN0ZWQgdGV4dCBmcm9tIGNvbnRlbnQgdXNpbmcgYSBzZWxlY3Rpb24gcmFuZ2UuXG4gKi9cbmZ1bmN0aW9uIGdldFNlbGVjdGVkVGV4dChjb250ZW50OiBzdHJpbmcsIHNlbGVjdGlvbjogSVRleHRFZGl0b3JTZWxlY3Rpb24pOiBzdHJpbmcge1xuXHRjb25zdCBsaW5lcyA9IGNvbnRlbnQuc3BsaXQoJ1xcbicpO1xuXHRpZiAoc2VsZWN0aW9uLnN0YXJ0TGluZU51bWJlciA9PT0gc2VsZWN0aW9uLmVuZExpbmVOdW1iZXIpIHtcblx0XHRyZXR1cm4gbGluZXNbc2VsZWN0aW9uLnN0YXJ0TGluZU51bWJlciAtIDFdLnN1YnN0cmluZyhzZWxlY3Rpb24uc3RhcnRDb2x1bW4gLSAxLCBzZWxlY3Rpb24uZW5kQ29sdW1uISAtIDEpO1xuXHR9XG5cdC8vIE11bHRpLWxpbmUgc2VsZWN0aW9uXG5cdGNvbnN0IHJlc3VsdDogc3RyaW5nW10gPSBbXTtcblx0cmVzdWx0LnB1c2gobGluZXNbc2VsZWN0aW9uLnN0YXJ0TGluZU51bWJlciAtIDFdLnN1YnN0cmluZyhzZWxlY3Rpb24uc3RhcnRDb2x1bW4gLSAxKSk7XG5cdGZvciAobGV0IGkgPSBzZWxlY3Rpb24uc3RhcnRMaW5lTnVtYmVyOyBpIDwgc2VsZWN0aW9uLmVuZExpbmVOdW1iZXIhIC0gMTsgaSsrKSB7XG5cdFx0cmVzdWx0LnB1c2gobGluZXNbaV0pO1xuXHR9XG5cdHJlc3VsdC5wdXNoKGxpbmVzW3NlbGVjdGlvbi5lbmRMaW5lTnVtYmVyISAtIDFdLnN1YnN0cmluZygwLCBzZWxlY3Rpb24uZW5kQ29sdW1uISAtIDEpKTtcblx0cmV0dXJuIHJlc3VsdC5qb2luKCdcXG4nKTtcbn1cblxuc3VpdGUoJ2hvb2tVdGlscycsICgpID0+IHtcblx0ZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlKCk7XG5cblx0c3VpdGUoJ2ZpbmRIb29rQ29tbWFuZFNlbGVjdGlvbicsICgpID0+IHtcblxuXHRcdHN1aXRlKCdzaW1wbGUgZm9ybWF0JywgKCkgPT4ge1xuXHRcdFx0Y29uc3Qgc2ltcGxlRm9ybWF0ID0gYHtcblx0XCJob29rc1wiOiB7XG5cdFx0XCJTZXNzaW9uU3RhcnRcIjogW1xuXHRcdFx0e1xuXHRcdFx0XHRcInR5cGVcIjogXCJjb21tYW5kXCIsXG5cdFx0XHRcdFwiY29tbWFuZFwiOiBcImVjaG8gZmlyc3RcIlxuXHRcdFx0fSxcblx0XHRcdHtcblx0XHRcdFx0XCJ0eXBlXCI6IFwiY29tbWFuZFwiLFxuXHRcdFx0XHRcImNvbW1hbmRcIjogXCJlY2hvIHNlY29uZFwiXG5cdFx0XHR9XG5cdFx0XSxcblx0XHRcIlVzZXJQcm9tcHRTdWJtaXRcIjogW1xuXHRcdFx0e1xuXHRcdFx0XHRcInR5cGVcIjogXCJjb21tYW5kXCIsXG5cdFx0XHRcdFwiY29tbWFuZFwiOiBcImVjaG8gZm9vID4gdGVzdC5kZXJwXCJcblx0XHRcdH1cblx0XHRdXG5cdH1cbn1gO1xuXG5cdFx0XHR0ZXN0KCdmaW5kcyBmaXJzdCBjb21tYW5kIGluIFNlc3Npb25TdGFydCcsICgpID0+IHtcblx0XHRcdFx0Y29uc3QgcmVzdWx0ID0gZmluZEhvb2tDb21tYW5kU2VsZWN0aW9uKHNpbXBsZUZvcm1hdCwgJ1Nlc3Npb25TdGFydCcsIDAsICdjb21tYW5kJyk7XG5cdFx0XHRcdGFzc2VydC5vayhyZXN1bHQpO1xuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZ2V0U2VsZWN0ZWRUZXh0KHNpbXBsZUZvcm1hdCwgcmVzdWx0KSwgJ2VjaG8gZmlyc3QnKTtcblx0XHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChyZXN1bHQsIHtcblx0XHRcdFx0XHRzdGFydExpbmVOdW1iZXI6IDYsXG5cdFx0XHRcdFx0c3RhcnRDb2x1bW46IDE3LFxuXHRcdFx0XHRcdGVuZExpbmVOdW1iZXI6IDYsXG5cdFx0XHRcdFx0ZW5kQ29sdW1uOiAyN1xuXHRcdFx0XHR9KTtcblx0XHRcdH0pO1xuXG5cdFx0XHR0ZXN0KCdmaW5kcyBzZWNvbmQgY29tbWFuZCBpbiBTZXNzaW9uU3RhcnQnLCAoKSA9PiB7XG5cdFx0XHRcdGNvbnN0IHJlc3VsdCA9IGZpbmRIb29rQ29tbWFuZFNlbGVjdGlvbihzaW1wbGVGb3JtYXQsICdTZXNzaW9uU3RhcnQnLCAxLCAnY29tbWFuZCcpO1xuXHRcdFx0XHRhc3NlcnQub2socmVzdWx0KTtcblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGdldFNlbGVjdGVkVGV4dChzaW1wbGVGb3JtYXQsIHJlc3VsdCksICdlY2hvIHNlY29uZCcpO1xuXHRcdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHJlc3VsdCwge1xuXHRcdFx0XHRcdHN0YXJ0TGluZU51bWJlcjogMTAsXG5cdFx0XHRcdFx0c3RhcnRDb2x1bW46IDE3LFxuXHRcdFx0XHRcdGVuZExpbmVOdW1iZXI6IDEwLFxuXHRcdFx0XHRcdGVuZENvbHVtbjogMjhcblx0XHRcdFx0fSk7XG5cdFx0XHR9KTtcblxuXHRcdFx0dGVzdCgnZmluZHMgY29tbWFuZCBpbiBVc2VyUHJvbXB0U3VibWl0JywgKCkgPT4ge1xuXHRcdFx0XHRjb25zdCByZXN1bHQgPSBmaW5kSG9va0NvbW1hbmRTZWxlY3Rpb24oc2ltcGxlRm9ybWF0LCAnVXNlclByb21wdFN1Ym1pdCcsIDAsICdjb21tYW5kJyk7XG5cdFx0XHRcdGFzc2VydC5vayhyZXN1bHQpO1xuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZ2V0U2VsZWN0ZWRUZXh0KHNpbXBsZUZvcm1hdCwgcmVzdWx0KSwgJ2VjaG8gZm9vID4gdGVzdC5kZXJwJyk7XG5cdFx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocmVzdWx0LCB7XG5cdFx0XHRcdFx0c3RhcnRMaW5lTnVtYmVyOiAxNixcblx0XHRcdFx0XHRzdGFydENvbHVtbjogMTcsXG5cdFx0XHRcdFx0ZW5kTGluZU51bWJlcjogMTYsXG5cdFx0XHRcdFx0ZW5kQ29sdW1uOiAzN1xuXHRcdFx0XHR9KTtcblx0XHRcdH0pO1xuXG5cdFx0XHR0ZXN0KCdyZXR1cm5zIHVuZGVmaW5lZCBmb3Igb3V0IG9mIGJvdW5kcyBpbmRleCcsICgpID0+IHtcblx0XHRcdFx0Y29uc3QgcmVzdWx0ID0gZmluZEhvb2tDb21tYW5kU2VsZWN0aW9uKHNpbXBsZUZvcm1hdCwgJ1Nlc3Npb25TdGFydCcsIDUsICdjb21tYW5kJyk7XG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQsIHVuZGVmaW5lZCk7XG5cdFx0XHR9KTtcblxuXHRcdFx0dGVzdCgncmV0dXJucyB1bmRlZmluZWQgZm9yIG5vbi1leGlzdGVudCBob29rIHR5cGUnLCAoKSA9PiB7XG5cdFx0XHRcdGNvbnN0IHJlc3VsdCA9IGZpbmRIb29rQ29tbWFuZFNlbGVjdGlvbihzaW1wbGVGb3JtYXQsICdub25FeGlzdGVudCcsIDAsICdjb21tYW5kJyk7XG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQsIHVuZGVmaW5lZCk7XG5cdFx0XHR9KTtcblx0XHR9KTtcblxuXHRcdHN1aXRlKCduZXN0ZWQgbWF0Y2hlciBmb3JtYXQnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBuZXN0ZWRGb3JtYXQgPSBge1xuXHRcImZvcmNlTG9naW5NZXRob2RcIjogXCJjb25zb2xlXCIsXG5cdFwiaG9va3NcIjoge1xuXHRcdFwiVXNlclByb21wdFN1Ym1pdFwiOiBbXG5cdFx0XHR7XG5cdFx0XHRcdFwibWF0Y2hlclwiOiBcIlwiLFxuXHRcdFx0XHRcImhvb2tzXCI6IFtcblx0XHRcdFx0XHR7XG5cdFx0XHRcdFx0XHRcInR5cGVcIjogXCJjb21tYW5kXCIsXG5cdFx0XHRcdFx0XHRcImNvbW1hbmRcIjogXCJlY2hvICdmb29iYXJiYXo1JyA+IH4vZm9vYmFyYmF6LnR4dFwiXG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRdXG5cdFx0XHR9XG5cdFx0XVxuXHR9XG59YDtcblxuXHRcdFx0dGVzdCgnZmluZHMgY29tbWFuZCBpbnNpZGUgbmVzdGVkIGhvb2tzJywgKCkgPT4ge1xuXHRcdFx0XHRjb25zdCByZXN1bHQgPSBmaW5kSG9va0NvbW1hbmRTZWxlY3Rpb24obmVzdGVkRm9ybWF0LCAnVXNlclByb21wdFN1Ym1pdCcsIDAsICdjb21tYW5kJyk7XG5cdFx0XHRcdGFzc2VydC5vayhyZXN1bHQpO1xuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZ2V0U2VsZWN0ZWRUZXh0KG5lc3RlZEZvcm1hdCwgcmVzdWx0KSwgJ2VjaG8gXFwnZm9vYmFyYmF6NVxcJyA+IH4vZm9vYmFyYmF6LnR4dCcpO1xuXHRcdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHJlc3VsdCwge1xuXHRcdFx0XHRcdHN0YXJ0TGluZU51bWJlcjogMTAsXG5cdFx0XHRcdFx0c3RhcnRDb2x1bW46IDE5LFxuXHRcdFx0XHRcdGVuZExpbmVOdW1iZXI6IDEwLFxuXHRcdFx0XHRcdGVuZENvbHVtbjogNTRcblx0XHRcdFx0fSk7XG5cdFx0XHR9KTtcblxuXHRcdFx0dGVzdCgncmV0dXJucyB1bmRlZmluZWQgZm9yIG5vbi1leGlzdGVudCBmaWVsZCBuYW1lJywgKCkgPT4ge1xuXHRcdFx0XHRjb25zdCByZXN1bHQgPSBmaW5kSG9va0NvbW1hbmRTZWxlY3Rpb24obmVzdGVkRm9ybWF0LCAnVXNlclByb21wdFN1Ym1pdCcsIDAsICdiYXNoJyk7XG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQsIHVuZGVmaW5lZCk7XG5cdFx0XHR9KTtcblx0XHR9KTtcblxuXHRcdHN1aXRlKCdtaXhlZCBmb3JtYXQgd2l0aCBtdWx0aXBsZSBuZXN0ZWQgaG9va3MnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBtaXhlZEZvcm1hdCA9IGB7XG5cdFwiaG9va3NcIjoge1xuXHRcdFwiUHJlVG9vbFVzZVwiOiBbXG5cdFx0XHR7XG5cdFx0XHRcdFwibWF0Y2hlclwiOiBcImVkaXRfZmlsZVwiLFxuXHRcdFx0XHRcImhvb2tzXCI6IFtcblx0XHRcdFx0XHR7XG5cdFx0XHRcdFx0XHRcInR5cGVcIjogXCJjb21tYW5kXCIsXG5cdFx0XHRcdFx0XHRcImNvbW1hbmRcIjogXCJmaXJzdCBuZXN0ZWRcIlxuXHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0e1xuXHRcdFx0XHRcdFx0XCJ0eXBlXCI6IFwiY29tbWFuZFwiLFxuXHRcdFx0XHRcdFx0XCJjb21tYW5kXCI6IFwic2Vjb25kIG5lc3RlZFwiXG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRdXG5cdFx0XHR9LFxuXHRcdFx0e1xuXHRcdFx0XHRcInR5cGVcIjogXCJjb21tYW5kXCIsXG5cdFx0XHRcdFwiY29tbWFuZFwiOiBcInNpbXBsZSBhZnRlciBuZXN0ZWRcIlxuXHRcdFx0fVxuXHRcdF1cblx0fVxufWA7XG5cblx0XHRcdHRlc3QoJ2ZpbmRzIGZpcnN0IGNvbW1hbmQgaW4gZmlyc3QgbmVzdGVkIGhvb2tzIGFycmF5JywgKCkgPT4ge1xuXHRcdFx0XHRjb25zdCByZXN1bHQgPSBmaW5kSG9va0NvbW1hbmRTZWxlY3Rpb24obWl4ZWRGb3JtYXQsICdQcmVUb29sVXNlJywgMCwgJ2NvbW1hbmQnKTtcblx0XHRcdFx0YXNzZXJ0Lm9rKHJlc3VsdCk7XG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChnZXRTZWxlY3RlZFRleHQobWl4ZWRGb3JtYXQsIHJlc3VsdCksICdmaXJzdCBuZXN0ZWQnKTtcblx0XHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChyZXN1bHQsIHtcblx0XHRcdFx0XHRzdGFydExpbmVOdW1iZXI6IDksXG5cdFx0XHRcdFx0c3RhcnRDb2x1bW46IDE5LFxuXHRcdFx0XHRcdGVuZExpbmVOdW1iZXI6IDksXG5cdFx0XHRcdFx0ZW5kQ29sdW1uOiAzMVxuXHRcdFx0XHR9KTtcblx0XHRcdH0pO1xuXG5cdFx0XHR0ZXN0KCdmaW5kcyBzZWNvbmQgY29tbWFuZCBpbiBmaXJzdCBuZXN0ZWQgaG9va3MgYXJyYXknLCAoKSA9PiB7XG5cdFx0XHRcdGNvbnN0IHJlc3VsdCA9IGZpbmRIb29rQ29tbWFuZFNlbGVjdGlvbihtaXhlZEZvcm1hdCwgJ1ByZVRvb2xVc2UnLCAxLCAnY29tbWFuZCcpO1xuXHRcdFx0XHRhc3NlcnQub2socmVzdWx0KTtcblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGdldFNlbGVjdGVkVGV4dChtaXhlZEZvcm1hdCwgcmVzdWx0KSwgJ3NlY29uZCBuZXN0ZWQnKTtcblx0XHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChyZXN1bHQsIHtcblx0XHRcdFx0XHRzdGFydExpbmVOdW1iZXI6IDEzLFxuXHRcdFx0XHRcdHN0YXJ0Q29sdW1uOiAxOSxcblx0XHRcdFx0XHRlbmRMaW5lTnVtYmVyOiAxMyxcblx0XHRcdFx0XHRlbmRDb2x1bW46IDMyXG5cdFx0XHRcdH0pO1xuXHRcdFx0fSk7XG5cblx0XHRcdHRlc3QoJ2ZpbmRzIHNpbXBsZSBjb21tYW5kIGFmdGVyIG5lc3RlZCBzdHJ1Y3R1cmUnLCAoKSA9PiB7XG5cdFx0XHRcdGNvbnN0IHJlc3VsdCA9IGZpbmRIb29rQ29tbWFuZFNlbGVjdGlvbihtaXhlZEZvcm1hdCwgJ1ByZVRvb2xVc2UnLCAyLCAnY29tbWFuZCcpO1xuXHRcdFx0XHRhc3NlcnQub2socmVzdWx0KTtcblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGdldFNlbGVjdGVkVGV4dChtaXhlZEZvcm1hdCwgcmVzdWx0KSwgJ3NpbXBsZSBhZnRlciBuZXN0ZWQnKTtcblx0XHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChyZXN1bHQsIHtcblx0XHRcdFx0XHRzdGFydExpbmVOdW1iZXI6IDE5LFxuXHRcdFx0XHRcdHN0YXJ0Q29sdW1uOiAxNyxcblx0XHRcdFx0XHRlbmRMaW5lTnVtYmVyOiAxOSxcblx0XHRcdFx0XHRlbmRDb2x1bW46IDM2XG5cdFx0XHRcdH0pO1xuXHRcdFx0fSk7XG5cdFx0fSk7XG5cblx0XHRzdWl0ZSgnYmFzaCBhbmQgcG93ZXJzaGVsbCBmaWVsZHMnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBwbGF0Zm9ybVNwZWNpZmljRm9ybWF0ID0gYHtcblx0XCJob29rc1wiOiB7XG5cdFx0XCJTZXNzaW9uU3RhcnRcIjogW1xuXHRcdFx0e1xuXHRcdFx0XHRcInR5cGVcIjogXCJjb21tYW5kXCIsXG5cdFx0XHRcdFwiYmFzaFwiOiBcImVjaG8gaGVsbG8gZnJvbSBiYXNoXCIsXG5cdFx0XHRcdFwicG93ZXJzaGVsbFwiOiBcIldyaXRlLUhvc3QgaGVsbG9cIlxuXHRcdFx0fVxuXHRcdF1cblx0fVxufWA7XG5cblx0XHRcdHRlc3QoJ2ZpbmRzIGJhc2ggZmllbGQnLCAoKSA9PiB7XG5cdFx0XHRcdGNvbnN0IHJlc3VsdCA9IGZpbmRIb29rQ29tbWFuZFNlbGVjdGlvbihwbGF0Zm9ybVNwZWNpZmljRm9ybWF0LCAnU2Vzc2lvblN0YXJ0JywgMCwgJ2Jhc2gnKTtcblx0XHRcdFx0YXNzZXJ0Lm9rKHJlc3VsdCk7XG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChnZXRTZWxlY3RlZFRleHQocGxhdGZvcm1TcGVjaWZpY0Zvcm1hdCwgcmVzdWx0KSwgJ2VjaG8gaGVsbG8gZnJvbSBiYXNoJyk7XG5cdFx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocmVzdWx0LCB7XG5cdFx0XHRcdFx0c3RhcnRMaW5lTnVtYmVyOiA2LFxuXHRcdFx0XHRcdHN0YXJ0Q29sdW1uOiAxNCxcblx0XHRcdFx0XHRlbmRMaW5lTnVtYmVyOiA2LFxuXHRcdFx0XHRcdGVuZENvbHVtbjogMzRcblx0XHRcdFx0fSk7XG5cdFx0XHR9KTtcblxuXHRcdFx0dGVzdCgnZmluZHMgcG93ZXJzaGVsbCBmaWVsZCcsICgpID0+IHtcblx0XHRcdFx0Y29uc3QgcmVzdWx0ID0gZmluZEhvb2tDb21tYW5kU2VsZWN0aW9uKHBsYXRmb3JtU3BlY2lmaWNGb3JtYXQsICdTZXNzaW9uU3RhcnQnLCAwLCAncG93ZXJzaGVsbCcpO1xuXHRcdFx0XHRhc3NlcnQub2socmVzdWx0KTtcblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGdldFNlbGVjdGVkVGV4dChwbGF0Zm9ybVNwZWNpZmljRm9ybWF0LCByZXN1bHQpLCAnV3JpdGUtSG9zdCBoZWxsbycpO1xuXHRcdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHJlc3VsdCwge1xuXHRcdFx0XHRcdHN0YXJ0TGluZU51bWJlcjogNyxcblx0XHRcdFx0XHRzdGFydENvbHVtbjogMjAsXG5cdFx0XHRcdFx0ZW5kTGluZU51bWJlcjogNyxcblx0XHRcdFx0XHRlbmRDb2x1bW46IDM2XG5cdFx0XHRcdH0pO1xuXHRcdFx0fSk7XG5cdFx0fSk7XG5cblx0XHRzdWl0ZSgnZWRnZSBjYXNlcycsICgpID0+IHtcblx0XHRcdHRlc3QoJ3JldHVybnMgdW5kZWZpbmVkIGZvciBlbXB0eSBjb250ZW50JywgKCkgPT4ge1xuXHRcdFx0XHRjb25zdCByZXN1bHQgPSBmaW5kSG9va0NvbW1hbmRTZWxlY3Rpb24oJycsICdzZXNzaW9uU3RhcnQnLCAwLCAnY29tbWFuZCcpO1xuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0LCB1bmRlZmluZWQpO1xuXHRcdFx0fSk7XG5cblx0XHRcdHRlc3QoJ3JldHVybnMgdW5kZWZpbmVkIGZvciBpbnZhbGlkIEpTT04nLCAoKSA9PiB7XG5cdFx0XHRcdGNvbnN0IHJlc3VsdCA9IGZpbmRIb29rQ29tbWFuZFNlbGVjdGlvbigneyBpbnZhbGlkIGpzb24gfScsICdzZXNzaW9uU3RhcnQnLCAwLCAnY29tbWFuZCcpO1xuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0LCB1bmRlZmluZWQpO1xuXHRcdFx0fSk7XG5cblx0XHRcdHRlc3QoJ3JldHVybnMgdW5kZWZpbmVkIHdoZW4gaG9va3Mga2V5IGlzIG1pc3NpbmcnLCAoKSA9PiB7XG5cdFx0XHRcdGNvbnN0IGNvbnRlbnQgPSAneyBcIm90aGVyXCI6IDEgfSc7XG5cdFx0XHRcdGNvbnN0IHJlc3VsdCA9IGZpbmRIb29rQ29tbWFuZFNlbGVjdGlvbihjb250ZW50LCAnc2Vzc2lvblN0YXJ0JywgMCwgJ2NvbW1hbmQnKTtcblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdCwgdW5kZWZpbmVkKTtcblx0XHRcdH0pO1xuXG5cdFx0XHR0ZXN0KCdyZXR1cm5zIHVuZGVmaW5lZCB3aGVuIGhvb2sgdHlwZSBhcnJheSBpcyBlbXB0eScsICgpID0+IHtcblx0XHRcdFx0Y29uc3QgY29udGVudCA9ICd7IFwiaG9va3NcIjogeyBcInNlc3Npb25TdGFydFwiOiBbXSB9IH0nO1xuXHRcdFx0XHRjb25zdCByZXN1bHQgPSBmaW5kSG9va0NvbW1hbmRTZWxlY3Rpb24oY29udGVudCwgJ3Nlc3Npb25TdGFydCcsIDAsICdjb21tYW5kJyk7XG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQsIHVuZGVmaW5lZCk7XG5cdFx0XHR9KTtcblxuXHRcdFx0dGVzdCgncmV0dXJucyB1bmRlZmluZWQgd2hlbiBob29rIGl0ZW0gaXMgbm90IGFuIG9iamVjdCcsICgpID0+IHtcblx0XHRcdFx0Y29uc3QgY29udGVudCA9ICd7IFwiaG9va3NcIjogeyBcInNlc3Npb25TdGFydFwiOiBbXCJub3QgYW4gb2JqZWN0XCJdIH0gfSc7XG5cdFx0XHRcdGNvbnN0IHJlc3VsdCA9IGZpbmRIb29rQ29tbWFuZFNlbGVjdGlvbihjb250ZW50LCAnc2Vzc2lvblN0YXJ0JywgMCwgJ2NvbW1hbmQnKTtcblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdCwgdW5kZWZpbmVkKTtcblx0XHRcdH0pO1xuXG5cdFx0XHR0ZXN0KCdoYW5kbGVzIGVtcHR5IGNvbW1hbmQgc3RyaW5nJywgKCkgPT4ge1xuXHRcdFx0XHRjb25zdCBjb250ZW50ID0gYHtcblx0XCJob29rc1wiOiB7XG5cdFx0XCJzZXNzaW9uU3RhcnRcIjogW1xuXHRcdFx0e1xuXHRcdFx0XHRcInR5cGVcIjogXCJjb21tYW5kXCIsXG5cdFx0XHRcdFwiY29tbWFuZFwiOiBcIlwiXG5cdFx0XHR9XG5cdFx0XVxuXHR9XG59YDtcblx0XHRcdFx0Y29uc3QgcmVzdWx0ID0gZmluZEhvb2tDb21tYW5kU2VsZWN0aW9uKGNvbnRlbnQsICdzZXNzaW9uU3RhcnQnLCAwLCAnY29tbWFuZCcpO1xuXHRcdFx0XHRhc3NlcnQub2socmVzdWx0KTtcblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGdldFNlbGVjdGVkVGV4dChjb250ZW50LCByZXN1bHQpLCAnJyk7XG5cdFx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocmVzdWx0LCB7XG5cdFx0XHRcdFx0c3RhcnRMaW5lTnVtYmVyOiA2LFxuXHRcdFx0XHRcdHN0YXJ0Q29sdW1uOiAxNyxcblx0XHRcdFx0XHRlbmRMaW5lTnVtYmVyOiA2LFxuXHRcdFx0XHRcdGVuZENvbHVtbjogMTdcblx0XHRcdFx0fSk7XG5cdFx0XHR9KTtcblxuXHRcdFx0dGVzdCgnaGFuZGxlcyBtdWx0aWxpbmUgY29tbWFuZCB2YWx1ZScsICgpID0+IHtcblx0XHRcdFx0Ly8gSlNPTiBzdHJpbmdzIGNhbiBjb250YWluIGVzY2FwZWQgbmV3bGluZXNcblx0XHRcdFx0Y29uc3QgY29udGVudCA9IGB7XG5cdFwiaG9va3NcIjoge1xuXHRcdFwic2Vzc2lvblN0YXJ0XCI6IFtcblx0XHRcdHtcblx0XHRcdFx0XCJ0eXBlXCI6IFwiY29tbWFuZFwiLFxuXHRcdFx0XHRcImNvbW1hbmRcIjogXCJsaW5lMVxcXFxubGluZTJcIlxuXHRcdFx0fVxuXHRcdF1cblx0fVxufWA7XG5cdFx0XHRcdGNvbnN0IHJlc3VsdCA9IGZpbmRIb29rQ29tbWFuZFNlbGVjdGlvbihjb250ZW50LCAnc2Vzc2lvblN0YXJ0JywgMCwgJ2NvbW1hbmQnKTtcblx0XHRcdFx0YXNzZXJ0Lm9rKHJlc3VsdCk7XG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChnZXRTZWxlY3RlZFRleHQoY29udGVudCwgcmVzdWx0KSwgJ2xpbmUxXFxcXG5saW5lMicpO1xuXHRcdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHJlc3VsdCwge1xuXHRcdFx0XHRcdHN0YXJ0TGluZU51bWJlcjogNixcblx0XHRcdFx0XHRzdGFydENvbHVtbjogMTcsXG5cdFx0XHRcdFx0ZW5kTGluZU51bWJlcjogNixcblx0XHRcdFx0XHRlbmRDb2x1bW46IDI5XG5cdFx0XHRcdH0pO1xuXHRcdFx0fSk7XG5cdFx0fSk7XG5cblx0XHRzdWl0ZSgnbmVzdGVkIG1hdGNoZXIgd2l0aCBlbXB0eSBob29rcyBhcnJheScsICgpID0+IHtcblx0XHRcdGNvbnN0IGVtcHR5TmVzdGVkSG9va3MgPSBge1xuXHRcImhvb2tzXCI6IHtcblx0XHRcIlVzZXJQcm9tcHRTdWJtaXRcIjogW1xuXHRcdFx0e1xuXHRcdFx0XHRcIm1hdGNoZXJcIjogXCJzb21lLXBhdHRlcm5cIixcblx0XHRcdFx0XCJob29rc1wiOiBbXVxuXHRcdFx0fSxcblx0XHRcdHtcblx0XHRcdFx0XCJ0eXBlXCI6IFwiY29tbWFuZFwiLFxuXHRcdFx0XHRcImNvbW1hbmRcIjogXCJhZnRlciBlbXB0eSBuZXN0ZWRcIlxuXHRcdFx0fVxuXHRcdF1cblx0fVxufWA7XG5cblx0XHRcdHRlc3QoJ3NraXBzIGVtcHR5IG5lc3RlZCBob29rcyBhbmQgZmluZHMgc3Vic2VxdWVudCBjb21tYW5kJywgKCkgPT4ge1xuXHRcdFx0XHRjb25zdCByZXN1bHQgPSBmaW5kSG9va0NvbW1hbmRTZWxlY3Rpb24oZW1wdHlOZXN0ZWRIb29rcywgJ1VzZXJQcm9tcHRTdWJtaXQnLCAwLCAnY29tbWFuZCcpO1xuXHRcdFx0XHRhc3NlcnQub2socmVzdWx0KTtcblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGdldFNlbGVjdGVkVGV4dChlbXB0eU5lc3RlZEhvb2tzLCByZXN1bHQpLCAnYWZ0ZXIgZW1wdHkgbmVzdGVkJyk7XG5cdFx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocmVzdWx0LCB7XG5cdFx0XHRcdFx0c3RhcnRMaW5lTnVtYmVyOiAxMCxcblx0XHRcdFx0XHRzdGFydENvbHVtbjogMTcsXG5cdFx0XHRcdFx0ZW5kTGluZU51bWJlcjogMTAsXG5cdFx0XHRcdFx0ZW5kQ29sdW1uOiAzNVxuXHRcdFx0XHR9KTtcblx0XHRcdH0pO1xuXHRcdH0pO1xuXHR9KTtcblxuXHRzdWl0ZSgnZmluZEhvb2tDb21tYW5kU2VsZWN0aW9uIC0gY29waWxvdENMSUNvbXBhdCcsICgpID0+IHtcblxuXHRcdHN1aXRlKCdzaW1wbGUgZm9ybWF0JywgKCkgPT4ge1xuXHRcdFx0Y29uc3Qgc2ltcGxlRm9ybWF0ID0gYHtcblx0XCJob29rc1wiOiB7XG5cdFx0XCJzZXNzaW9uU3RhcnRcIjogW1xuXHRcdFx0e1xuXHRcdFx0XHRcInR5cGVcIjogXCJjb21tYW5kXCIsXG5cdFx0XHRcdFwiY29tbWFuZFwiOiBcImVjaG8gZmlyc3RcIlxuXHRcdFx0fSxcblx0XHRcdHtcblx0XHRcdFx0XCJ0eXBlXCI6IFwiY29tbWFuZFwiLFxuXHRcdFx0XHRcImNvbW1hbmRcIjogXCJlY2hvIHNlY29uZFwiXG5cdFx0XHR9XG5cdFx0XSxcblx0XHRcInVzZXJQcm9tcHRTdWJtaXR0ZWRcIjogW1xuXHRcdFx0e1xuXHRcdFx0XHRcInR5cGVcIjogXCJjb21tYW5kXCIsXG5cdFx0XHRcdFwiY29tbWFuZFwiOiBcImVjaG8gZm9vID4gdGVzdC5kZXJwXCJcblx0XHRcdH1cblx0XHRdXG5cdH1cbn1gO1xuXG5cdFx0XHR0ZXN0KCdmaW5kcyBmaXJzdCBjb21tYW5kIGluIHNlc3Npb25TdGFydCcsICgpID0+IHtcblx0XHRcdFx0Y29uc3QgcmVzdWx0ID0gZmluZEhvb2tDb21tYW5kU2VsZWN0aW9uKHNpbXBsZUZvcm1hdCwgJ3Nlc3Npb25TdGFydCcsIDAsICdjb21tYW5kJyk7XG5cdFx0XHRcdGFzc2VydC5vayhyZXN1bHQpO1xuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZ2V0U2VsZWN0ZWRUZXh0KHNpbXBsZUZvcm1hdCwgcmVzdWx0KSwgJ2VjaG8gZmlyc3QnKTtcblx0XHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChyZXN1bHQsIHtcblx0XHRcdFx0XHRzdGFydExpbmVOdW1iZXI6IDYsXG5cdFx0XHRcdFx0c3RhcnRDb2x1bW46IDE3LFxuXHRcdFx0XHRcdGVuZExpbmVOdW1iZXI6IDYsXG5cdFx0XHRcdFx0ZW5kQ29sdW1uOiAyN1xuXHRcdFx0XHR9KTtcblx0XHRcdH0pO1xuXG5cdFx0XHR0ZXN0KCdmaW5kcyBzZWNvbmQgY29tbWFuZCBpbiBzZXNzaW9uU3RhcnQnLCAoKSA9PiB7XG5cdFx0XHRcdGNvbnN0IHJlc3VsdCA9IGZpbmRIb29rQ29tbWFuZFNlbGVjdGlvbihzaW1wbGVGb3JtYXQsICdzZXNzaW9uU3RhcnQnLCAxLCAnY29tbWFuZCcpO1xuXHRcdFx0XHRhc3NlcnQub2socmVzdWx0KTtcblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGdldFNlbGVjdGVkVGV4dChzaW1wbGVGb3JtYXQsIHJlc3VsdCksICdlY2hvIHNlY29uZCcpO1xuXHRcdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHJlc3VsdCwge1xuXHRcdFx0XHRcdHN0YXJ0TGluZU51bWJlcjogMTAsXG5cdFx0XHRcdFx0c3RhcnRDb2x1bW46IDE3LFxuXHRcdFx0XHRcdGVuZExpbmVOdW1iZXI6IDEwLFxuXHRcdFx0XHRcdGVuZENvbHVtbjogMjhcblx0XHRcdFx0fSk7XG5cdFx0XHR9KTtcblxuXHRcdFx0dGVzdCgnZmluZHMgY29tbWFuZCBpbiB1c2VyUHJvbXB0U3VibWl0dGVkJywgKCkgPT4ge1xuXHRcdFx0XHRjb25zdCByZXN1bHQgPSBmaW5kSG9va0NvbW1hbmRTZWxlY3Rpb24oc2ltcGxlRm9ybWF0LCAndXNlclByb21wdFN1Ym1pdHRlZCcsIDAsICdjb21tYW5kJyk7XG5cdFx0XHRcdGFzc2VydC5vayhyZXN1bHQpO1xuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZ2V0U2VsZWN0ZWRUZXh0KHNpbXBsZUZvcm1hdCwgcmVzdWx0KSwgJ2VjaG8gZm9vID4gdGVzdC5kZXJwJyk7XG5cdFx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocmVzdWx0LCB7XG5cdFx0XHRcdFx0c3RhcnRMaW5lTnVtYmVyOiAxNixcblx0XHRcdFx0XHRzdGFydENvbHVtbjogMTcsXG5cdFx0XHRcdFx0ZW5kTGluZU51bWJlcjogMTYsXG5cdFx0XHRcdFx0ZW5kQ29sdW1uOiAzN1xuXHRcdFx0XHR9KTtcblx0XHRcdH0pO1xuXG5cdFx0XHR0ZXN0KCdyZXR1cm5zIHVuZGVmaW5lZCBmb3Igb3V0IG9mIGJvdW5kcyBpbmRleCcsICgpID0+IHtcblx0XHRcdFx0Y29uc3QgcmVzdWx0ID0gZmluZEhvb2tDb21tYW5kU2VsZWN0aW9uKHNpbXBsZUZvcm1hdCwgJ3Nlc3Npb25TdGFydCcsIDUsICdjb21tYW5kJyk7XG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQsIHVuZGVmaW5lZCk7XG5cdFx0XHR9KTtcblxuXHRcdFx0dGVzdCgncmV0dXJucyB1bmRlZmluZWQgZm9yIG5vbi1leGlzdGVudCBob29rIHR5cGUnLCAoKSA9PiB7XG5cdFx0XHRcdGNvbnN0IHJlc3VsdCA9IGZpbmRIb29rQ29tbWFuZFNlbGVjdGlvbihzaW1wbGVGb3JtYXQsICdub25FeGlzdGVudCcsIDAsICdjb21tYW5kJyk7XG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQsIHVuZGVmaW5lZCk7XG5cdFx0XHR9KTtcblx0XHR9KTtcblxuXHRcdHN1aXRlKCduZXN0ZWQgbWF0Y2hlciBmb3JtYXQnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBuZXN0ZWRGb3JtYXQgPSBge1xuXHRcImZvcmNlTG9naW5NZXRob2RcIjogXCJjb25zb2xlXCIsXG5cdFwiaG9va3NcIjoge1xuXHRcdFwidXNlclByb21wdFN1Ym1pdHRlZFwiOiBbXG5cdFx0XHR7XG5cdFx0XHRcdFwibWF0Y2hlclwiOiBcIlwiLFxuXHRcdFx0XHRcImhvb2tzXCI6IFtcblx0XHRcdFx0XHR7XG5cdFx0XHRcdFx0XHRcInR5cGVcIjogXCJjb21tYW5kXCIsXG5cdFx0XHRcdFx0XHRcImNvbW1hbmRcIjogXCJlY2hvICdmb29iYXJiYXo1JyA+IH4vZm9vYmFyYmF6LnR4dFwiXG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRdXG5cdFx0XHR9XG5cdFx0XVxuXHR9XG59YDtcblxuXHRcdFx0dGVzdCgnZmluZHMgY29tbWFuZCBpbnNpZGUgbmVzdGVkIGhvb2tzJywgKCkgPT4ge1xuXHRcdFx0XHRjb25zdCByZXN1bHQgPSBmaW5kSG9va0NvbW1hbmRTZWxlY3Rpb24obmVzdGVkRm9ybWF0LCAndXNlclByb21wdFN1Ym1pdHRlZCcsIDAsICdjb21tYW5kJyk7XG5cdFx0XHRcdGFzc2VydC5vayhyZXN1bHQpO1xuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZ2V0U2VsZWN0ZWRUZXh0KG5lc3RlZEZvcm1hdCwgcmVzdWx0KSwgJ2VjaG8gXFwnZm9vYmFyYmF6NVxcJyA+IH4vZm9vYmFyYmF6LnR4dCcpO1xuXHRcdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHJlc3VsdCwge1xuXHRcdFx0XHRcdHN0YXJ0TGluZU51bWJlcjogMTAsXG5cdFx0XHRcdFx0c3RhcnRDb2x1bW46IDE5LFxuXHRcdFx0XHRcdGVuZExpbmVOdW1iZXI6IDEwLFxuXHRcdFx0XHRcdGVuZENvbHVtbjogNTRcblx0XHRcdFx0fSk7XG5cdFx0XHR9KTtcblxuXHRcdFx0dGVzdCgncmV0dXJucyB1bmRlZmluZWQgZm9yIG5vbi1leGlzdGVudCBmaWVsZCBuYW1lJywgKCkgPT4ge1xuXHRcdFx0XHRjb25zdCByZXN1bHQgPSBmaW5kSG9va0NvbW1hbmRTZWxlY3Rpb24obmVzdGVkRm9ybWF0LCAndXNlclByb21wdFN1Ym1pdHRlZCcsIDAsICdiYXNoJyk7XG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQsIHVuZGVmaW5lZCk7XG5cdFx0XHR9KTtcblx0XHR9KTtcblxuXHRcdHN1aXRlKCdtaXhlZCBmb3JtYXQgd2l0aCBtdWx0aXBsZSBuZXN0ZWQgaG9va3MnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBtaXhlZEZvcm1hdCA9IGB7XG5cdFwiaG9va3NcIjoge1xuXHRcdFwicHJlVG9vbFVzZVwiOiBbXG5cdFx0XHR7XG5cdFx0XHRcdFwibWF0Y2hlclwiOiBcImVkaXRfZmlsZVwiLFxuXHRcdFx0XHRcImhvb2tzXCI6IFtcblx0XHRcdFx0XHR7XG5cdFx0XHRcdFx0XHRcInR5cGVcIjogXCJjb21tYW5kXCIsXG5cdFx0XHRcdFx0XHRcImNvbW1hbmRcIjogXCJmaXJzdCBuZXN0ZWRcIlxuXHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0e1xuXHRcdFx0XHRcdFx0XCJ0eXBlXCI6IFwiY29tbWFuZFwiLFxuXHRcdFx0XHRcdFx0XCJjb21tYW5kXCI6IFwic2Vjb25kIG5lc3RlZFwiXG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRdXG5cdFx0XHR9LFxuXHRcdFx0e1xuXHRcdFx0XHRcInR5cGVcIjogXCJjb21tYW5kXCIsXG5cdFx0XHRcdFwiY29tbWFuZFwiOiBcInNpbXBsZSBhZnRlciBuZXN0ZWRcIlxuXHRcdFx0fVxuXHRcdF1cblx0fVxufWA7XG5cblx0XHRcdHRlc3QoJ2ZpbmRzIGZpcnN0IGNvbW1hbmQgaW4gZmlyc3QgbmVzdGVkIGhvb2tzIGFycmF5JywgKCkgPT4ge1xuXHRcdFx0XHRjb25zdCByZXN1bHQgPSBmaW5kSG9va0NvbW1hbmRTZWxlY3Rpb24obWl4ZWRGb3JtYXQsICdwcmVUb29sVXNlJywgMCwgJ2NvbW1hbmQnKTtcblx0XHRcdFx0YXNzZXJ0Lm9rKHJlc3VsdCk7XG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChnZXRTZWxlY3RlZFRleHQobWl4ZWRGb3JtYXQsIHJlc3VsdCksICdmaXJzdCBuZXN0ZWQnKTtcblx0XHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChyZXN1bHQsIHtcblx0XHRcdFx0XHRzdGFydExpbmVOdW1iZXI6IDksXG5cdFx0XHRcdFx0c3RhcnRDb2x1bW46IDE5LFxuXHRcdFx0XHRcdGVuZExpbmVOdW1iZXI6IDksXG5cdFx0XHRcdFx0ZW5kQ29sdW1uOiAzMVxuXHRcdFx0XHR9KTtcblx0XHRcdH0pO1xuXG5cdFx0XHR0ZXN0KCdmaW5kcyBzZWNvbmQgY29tbWFuZCBpbiBmaXJzdCBuZXN0ZWQgaG9va3MgYXJyYXknLCAoKSA9PiB7XG5cdFx0XHRcdGNvbnN0IHJlc3VsdCA9IGZpbmRIb29rQ29tbWFuZFNlbGVjdGlvbihtaXhlZEZvcm1hdCwgJ3ByZVRvb2xVc2UnLCAxLCAnY29tbWFuZCcpO1xuXHRcdFx0XHRhc3NlcnQub2socmVzdWx0KTtcblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGdldFNlbGVjdGVkVGV4dChtaXhlZEZvcm1hdCwgcmVzdWx0KSwgJ3NlY29uZCBuZXN0ZWQnKTtcblx0XHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChyZXN1bHQsIHtcblx0XHRcdFx0XHRzdGFydExpbmVOdW1iZXI6IDEzLFxuXHRcdFx0XHRcdHN0YXJ0Q29sdW1uOiAxOSxcblx0XHRcdFx0XHRlbmRMaW5lTnVtYmVyOiAxMyxcblx0XHRcdFx0XHRlbmRDb2x1bW46IDMyXG5cdFx0XHRcdH0pO1xuXHRcdFx0fSk7XG5cblx0XHRcdHRlc3QoJ2ZpbmRzIHNpbXBsZSBjb21tYW5kIGFmdGVyIG5lc3RlZCBzdHJ1Y3R1cmUnLCAoKSA9PiB7XG5cdFx0XHRcdGNvbnN0IHJlc3VsdCA9IGZpbmRIb29rQ29tbWFuZFNlbGVjdGlvbihtaXhlZEZvcm1hdCwgJ3ByZVRvb2xVc2UnLCAyLCAnY29tbWFuZCcpO1xuXHRcdFx0XHRhc3NlcnQub2socmVzdWx0KTtcblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGdldFNlbGVjdGVkVGV4dChtaXhlZEZvcm1hdCwgcmVzdWx0KSwgJ3NpbXBsZSBhZnRlciBuZXN0ZWQnKTtcblx0XHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChyZXN1bHQsIHtcblx0XHRcdFx0XHRzdGFydExpbmVOdW1iZXI6IDE5LFxuXHRcdFx0XHRcdHN0YXJ0Q29sdW1uOiAxNyxcblx0XHRcdFx0XHRlbmRMaW5lTnVtYmVyOiAxOSxcblx0XHRcdFx0XHRlbmRDb2x1bW46IDM2XG5cdFx0XHRcdH0pO1xuXHRcdFx0fSk7XG5cdFx0fSk7XG5cblx0XHRzdWl0ZSgnYmFzaCBhbmQgcG93ZXJzaGVsbCBmaWVsZHMnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBwbGF0Zm9ybVNwZWNpZmljRm9ybWF0ID0gYHtcblx0XCJob29rc1wiOiB7XG5cdFx0XCJzZXNzaW9uU3RhcnRcIjogW1xuXHRcdFx0e1xuXHRcdFx0XHRcInR5cGVcIjogXCJjb21tYW5kXCIsXG5cdFx0XHRcdFwiYmFzaFwiOiBcImVjaG8gaGVsbG8gZnJvbSBiYXNoXCIsXG5cdFx0XHRcdFwicG93ZXJzaGVsbFwiOiBcIldyaXRlLUhvc3QgaGVsbG9cIlxuXHRcdFx0fVxuXHRcdF1cblx0fVxufWA7XG5cblx0XHRcdHRlc3QoJ2ZpbmRzIGJhc2ggZmllbGQnLCAoKSA9PiB7XG5cdFx0XHRcdGNvbnN0IHJlc3VsdCA9IGZpbmRIb29rQ29tbWFuZFNlbGVjdGlvbihwbGF0Zm9ybVNwZWNpZmljRm9ybWF0LCAnc2Vzc2lvblN0YXJ0JywgMCwgJ2Jhc2gnKTtcblx0XHRcdFx0YXNzZXJ0Lm9rKHJlc3VsdCk7XG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChnZXRTZWxlY3RlZFRleHQocGxhdGZvcm1TcGVjaWZpY0Zvcm1hdCwgcmVzdWx0KSwgJ2VjaG8gaGVsbG8gZnJvbSBiYXNoJyk7XG5cdFx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocmVzdWx0LCB7XG5cdFx0XHRcdFx0c3RhcnRMaW5lTnVtYmVyOiA2LFxuXHRcdFx0XHRcdHN0YXJ0Q29sdW1uOiAxNCxcblx0XHRcdFx0XHRlbmRMaW5lTnVtYmVyOiA2LFxuXHRcdFx0XHRcdGVuZENvbHVtbjogMzRcblx0XHRcdFx0fSk7XG5cdFx0XHR9KTtcblxuXHRcdFx0dGVzdCgnZmluZHMgcG93ZXJzaGVsbCBmaWVsZCcsICgpID0+IHtcblx0XHRcdFx0Y29uc3QgcmVzdWx0ID0gZmluZEhvb2tDb21tYW5kU2VsZWN0aW9uKHBsYXRmb3JtU3BlY2lmaWNGb3JtYXQsICdzZXNzaW9uU3RhcnQnLCAwLCAncG93ZXJzaGVsbCcpO1xuXHRcdFx0XHRhc3NlcnQub2socmVzdWx0KTtcblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGdldFNlbGVjdGVkVGV4dChwbGF0Zm9ybVNwZWNpZmljRm9ybWF0LCByZXN1bHQpLCAnV3JpdGUtSG9zdCBoZWxsbycpO1xuXHRcdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHJlc3VsdCwge1xuXHRcdFx0XHRcdHN0YXJ0TGluZU51bWJlcjogNyxcblx0XHRcdFx0XHRzdGFydENvbHVtbjogMjAsXG5cdFx0XHRcdFx0ZW5kTGluZU51bWJlcjogNyxcblx0XHRcdFx0XHRlbmRDb2x1bW46IDM2XG5cdFx0XHRcdH0pO1xuXHRcdFx0fSk7XG5cdFx0fSk7XG5cblx0XHRzdWl0ZSgnZWRnZSBjYXNlcycsICgpID0+IHtcblx0XHRcdHRlc3QoJ3JldHVybnMgdW5kZWZpbmVkIGZvciBlbXB0eSBjb250ZW50JywgKCkgPT4ge1xuXHRcdFx0XHRjb25zdCByZXN1bHQgPSBmaW5kSG9va0NvbW1hbmRTZWxlY3Rpb24oJycsICdzZXNzaW9uU3RhcnQnLCAwLCAnY29tbWFuZCcpO1xuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0LCB1bmRlZmluZWQpO1xuXHRcdFx0fSk7XG5cblx0XHRcdHRlc3QoJ3JldHVybnMgdW5kZWZpbmVkIGZvciBpbnZhbGlkIEpTT04nLCAoKSA9PiB7XG5cdFx0XHRcdGNvbnN0IHJlc3VsdCA9IGZpbmRIb29rQ29tbWFuZFNlbGVjdGlvbigneyBpbnZhbGlkIGpzb24gfScsICdzZXNzaW9uU3RhcnQnLCAwLCAnY29tbWFuZCcpO1xuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0LCB1bmRlZmluZWQpO1xuXHRcdFx0fSk7XG5cblx0XHRcdHRlc3QoJ3JldHVybnMgdW5kZWZpbmVkIHdoZW4gaG9va3Mga2V5IGlzIG1pc3NpbmcnLCAoKSA9PiB7XG5cdFx0XHRcdGNvbnN0IGNvbnRlbnQgPSAneyBcIm90aGVyXCI6IDEgfSc7XG5cdFx0XHRcdGNvbnN0IHJlc3VsdCA9IGZpbmRIb29rQ29tbWFuZFNlbGVjdGlvbihjb250ZW50LCAnc2Vzc2lvblN0YXJ0JywgMCwgJ2NvbW1hbmQnKTtcblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdCwgdW5kZWZpbmVkKTtcblx0XHRcdH0pO1xuXG5cdFx0XHR0ZXN0KCdyZXR1cm5zIHVuZGVmaW5lZCB3aGVuIGhvb2sgdHlwZSBhcnJheSBpcyBlbXB0eScsICgpID0+IHtcblx0XHRcdFx0Y29uc3QgY29udGVudCA9ICd7IFwiaG9va3NcIjogeyBcInNlc3Npb25TdGFydFwiOiBbXSB9IH0nO1xuXHRcdFx0XHRjb25zdCByZXN1bHQgPSBmaW5kSG9va0NvbW1hbmRTZWxlY3Rpb24oY29udGVudCwgJ3Nlc3Npb25TdGFydCcsIDAsICdjb21tYW5kJyk7XG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQsIHVuZGVmaW5lZCk7XG5cdFx0XHR9KTtcblxuXHRcdFx0dGVzdCgncmV0dXJucyB1bmRlZmluZWQgd2hlbiBob29rIGl0ZW0gaXMgbm90IGFuIG9iamVjdCcsICgpID0+IHtcblx0XHRcdFx0Y29uc3QgY29udGVudCA9ICd7IFwiaG9va3NcIjogeyBcInNlc3Npb25TdGFydFwiOiBbXCJub3QgYW4gb2JqZWN0XCJdIH0gfSc7XG5cdFx0XHRcdGNvbnN0IHJlc3VsdCA9IGZpbmRIb29rQ29tbWFuZFNlbGVjdGlvbihjb250ZW50LCAnc2Vzc2lvblN0YXJ0JywgMCwgJ2NvbW1hbmQnKTtcblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdCwgdW5kZWZpbmVkKTtcblx0XHRcdH0pO1xuXG5cdFx0XHR0ZXN0KCdoYW5kbGVzIGVtcHR5IGNvbW1hbmQgc3RyaW5nJywgKCkgPT4ge1xuXHRcdFx0XHRjb25zdCBjb250ZW50ID0gYHtcblx0XCJob29rc1wiOiB7XG5cdFx0XCJzZXNzaW9uU3RhcnRcIjogW1xuXHRcdFx0e1xuXHRcdFx0XHRcInR5cGVcIjogXCJjb21tYW5kXCIsXG5cdFx0XHRcdFwiY29tbWFuZFwiOiBcIlwiXG5cdFx0XHR9XG5cdFx0XVxuXHR9XG59YDtcblx0XHRcdFx0Y29uc3QgcmVzdWx0ID0gZmluZEhvb2tDb21tYW5kU2VsZWN0aW9uKGNvbnRlbnQsICdzZXNzaW9uU3RhcnQnLCAwLCAnY29tbWFuZCcpO1xuXHRcdFx0XHRhc3NlcnQub2socmVzdWx0KTtcblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGdldFNlbGVjdGVkVGV4dChjb250ZW50LCByZXN1bHQpLCAnJyk7XG5cdFx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocmVzdWx0LCB7XG5cdFx0XHRcdFx0c3RhcnRMaW5lTnVtYmVyOiA2LFxuXHRcdFx0XHRcdHN0YXJ0Q29sdW1uOiAxNyxcblx0XHRcdFx0XHRlbmRMaW5lTnVtYmVyOiA2LFxuXHRcdFx0XHRcdGVuZENvbHVtbjogMTdcblx0XHRcdFx0fSk7XG5cdFx0XHR9KTtcblxuXHRcdFx0dGVzdCgnaGFuZGxlcyBtdWx0aWxpbmUgY29tbWFuZCB2YWx1ZScsICgpID0+IHtcblx0XHRcdFx0Ly8gSlNPTiBzdHJpbmdzIGNhbiBjb250YWluIGVzY2FwZWQgbmV3bGluZXNcblx0XHRcdFx0Y29uc3QgY29udGVudCA9IGB7XG5cdFwiaG9va3NcIjoge1xuXHRcdFwic2Vzc2lvblN0YXJ0XCI6IFtcblx0XHRcdHtcblx0XHRcdFx0XCJ0eXBlXCI6IFwiY29tbWFuZFwiLFxuXHRcdFx0XHRcImNvbW1hbmRcIjogXCJsaW5lMVxcXFxubGluZTJcIlxuXHRcdFx0fVxuXHRcdF1cblx0fVxufWA7XG5cdFx0XHRcdGNvbnN0IHJlc3VsdCA9IGZpbmRIb29rQ29tbWFuZFNlbGVjdGlvbihjb250ZW50LCAnc2Vzc2lvblN0YXJ0JywgMCwgJ2NvbW1hbmQnKTtcblx0XHRcdFx0YXNzZXJ0Lm9rKHJlc3VsdCk7XG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChnZXRTZWxlY3RlZFRleHQoY29udGVudCwgcmVzdWx0KSwgJ2xpbmUxXFxcXG5saW5lMicpO1xuXHRcdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHJlc3VsdCwge1xuXHRcdFx0XHRcdHN0YXJ0TGluZU51bWJlcjogNixcblx0XHRcdFx0XHRzdGFydENvbHVtbjogMTcsXG5cdFx0XHRcdFx0ZW5kTGluZU51bWJlcjogNixcblx0XHRcdFx0XHRlbmRDb2x1bW46IDI5XG5cdFx0XHRcdH0pO1xuXHRcdFx0fSk7XG5cdFx0fSk7XG5cblx0XHRzdWl0ZSgnbmVzdGVkIG1hdGNoZXIgd2l0aCBlbXB0eSBob29rcyBhcnJheScsICgpID0+IHtcblx0XHRcdGNvbnN0IGVtcHR5TmVzdGVkSG9va3MgPSBge1xuXHRcImhvb2tzXCI6IHtcblx0XHRcInVzZXJQcm9tcHRTdWJtaXR0ZWRcIjogW1xuXHRcdFx0e1xuXHRcdFx0XHRcIm1hdGNoZXJcIjogXCJzb21lLXBhdHRlcm5cIixcblx0XHRcdFx0XCJob29rc1wiOiBbXVxuXHRcdFx0fSxcblx0XHRcdHtcblx0XHRcdFx0XCJ0eXBlXCI6IFwiY29tbWFuZFwiLFxuXHRcdFx0XHRcImNvbW1hbmRcIjogXCJhZnRlciBlbXB0eSBuZXN0ZWRcIlxuXHRcdFx0fVxuXHRcdF1cblx0fVxufWA7XG5cblx0XHRcdHRlc3QoJ3NraXBzIGVtcHR5IG5lc3RlZCBob29rcyBhbmQgZmluZHMgc3Vic2VxdWVudCBjb21tYW5kJywgKCkgPT4ge1xuXHRcdFx0XHRjb25zdCByZXN1bHQgPSBmaW5kSG9va0NvbW1hbmRTZWxlY3Rpb24oZW1wdHlOZXN0ZWRIb29rcywgJ3VzZXJQcm9tcHRTdWJtaXR0ZWQnLCAwLCAnY29tbWFuZCcpO1xuXHRcdFx0XHRhc3NlcnQub2socmVzdWx0KTtcblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGdldFNlbGVjdGVkVGV4dChlbXB0eU5lc3RlZEhvb2tzLCByZXN1bHQpLCAnYWZ0ZXIgZW1wdHkgbmVzdGVkJyk7XG5cdFx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocmVzdWx0LCB7XG5cdFx0XHRcdFx0c3RhcnRMaW5lTnVtYmVyOiAxMCxcblx0XHRcdFx0XHRzdGFydENvbHVtbjogMTcsXG5cdFx0XHRcdFx0ZW5kTGluZU51bWJlcjogMTAsXG5cdFx0XHRcdFx0ZW5kQ29sdW1uOiAzNVxuXHRcdFx0XHR9KTtcblx0XHRcdH0pO1xuXHRcdH0pO1xuXHR9KTtcblxuXHRzdWl0ZSgnZmluZEhvb2tDb21tYW5kU2VsZWN0aW9uIHdpdGggYnVpbGROZXdIb29rRW50cnknLCAoKSA9PiB7XG5cblx0XHR0ZXN0KCdmaW5kcyBjb21tYW5kIGluIENvcGlsb3QtZm9ybWF0IGdlbmVyYXRlZCBKU09OJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgZW50cnkgPSBidWlsZE5ld0hvb2tFbnRyeShIb29rU291cmNlRm9ybWF0LkNvcGlsb3QpO1xuXHRcdFx0Y29uc3QgY29udGVudCA9IEpTT04uc3RyaW5naWZ5KHsgaG9va3M6IHsgU2Vzc2lvblN0YXJ0OiBbZW50cnldIH0gfSwgbnVsbCwgJ1xcdCcpO1xuXHRcdFx0Y29uc3QgcmVzdWx0ID0gZmluZEhvb2tDb21tYW5kU2VsZWN0aW9uKGNvbnRlbnQsICdTZXNzaW9uU3RhcnQnLCAwLCAnY29tbWFuZCcpO1xuXHRcdFx0YXNzZXJ0Lm9rKHJlc3VsdCk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZ2V0U2VsZWN0ZWRUZXh0KGNvbnRlbnQsIHJlc3VsdCksICcnKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2ZpbmRzIGNvbW1hbmQgaW4gQ2xhdWRlLWZvcm1hdCBnZW5lcmF0ZWQgSlNPTicsICgpID0+IHtcblx0XHRcdGNvbnN0IGVudHJ5ID0gYnVpbGROZXdIb29rRW50cnkoSG9va1NvdXJjZUZvcm1hdC5DbGF1ZGUpO1xuXHRcdFx0Y29uc3QgY29udGVudCA9IEpTT04uc3RyaW5naWZ5KHsgaG9va3M6IHsgUHJlVG9vbFVzZTogW2VudHJ5XSB9IH0sIG51bGwsICdcXHQnKTtcblx0XHRcdGNvbnN0IHJlc3VsdCA9IGZpbmRIb29rQ29tbWFuZFNlbGVjdGlvbihjb250ZW50LCAnUHJlVG9vbFVzZScsIDAsICdjb21tYW5kJyk7XG5cdFx0XHRhc3NlcnQub2socmVzdWx0KTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChnZXRTZWxlY3RlZFRleHQoY29udGVudCwgcmVzdWx0KSwgJycpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnZmluZHMgY29tbWFuZCB3aGVuIGFwcGVuZGluZyBDbGF1ZGUgZW50cnkgdG8gZXhpc3RpbmcgaG9va3MnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBlbnRyeTEgPSBidWlsZE5ld0hvb2tFbnRyeShIb29rU291cmNlRm9ybWF0LkNsYXVkZSk7XG5cdFx0XHRjb25zdCBlbnRyeTIgPSBidWlsZE5ld0hvb2tFbnRyeShIb29rU291cmNlRm9ybWF0LkNsYXVkZSk7XG5cdFx0XHRjb25zdCBjb250ZW50ID0gSlNPTi5zdHJpbmdpZnkoeyBob29rczogeyBQcmVUb29sVXNlOiBbZW50cnkxLCBlbnRyeTJdIH0gfSwgbnVsbCwgJ1xcdCcpO1xuXG5cdFx0XHRjb25zdCByZXN1bHQwID0gZmluZEhvb2tDb21tYW5kU2VsZWN0aW9uKGNvbnRlbnQsICdQcmVUb29sVXNlJywgMCwgJ2NvbW1hbmQnKTtcblx0XHRcdGNvbnN0IHJlc3VsdDEgPSBmaW5kSG9va0NvbW1hbmRTZWxlY3Rpb24oY29udGVudCwgJ1ByZVRvb2xVc2UnLCAxLCAnY29tbWFuZCcpO1xuXHRcdFx0YXNzZXJ0Lm9rKHJlc3VsdDApO1xuXHRcdFx0YXNzZXJ0Lm9rKHJlc3VsdDEpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGdldFNlbGVjdGVkVGV4dChjb250ZW50LCByZXN1bHQwKSwgJycpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGdldFNlbGVjdGVkVGV4dChjb250ZW50LCByZXN1bHQxKSwgJycpO1xuXHRcdFx0Ly8gU2Vjb25kIGVudHJ5IHNob3VsZCBiZSBvbiBhIGxhdGVyIGxpbmVcblx0XHRcdGFzc2VydC5vayhyZXN1bHQxLnN0YXJ0TGluZU51bWJlciA+IHJlc3VsdDAuc3RhcnRMaW5lTnVtYmVyKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ0NsYXVkZSBmb3JtYXQgSlNPTiBoYXMgY29ycmVjdCBzdHJ1Y3R1cmUnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBlbnRyeSA9IGJ1aWxkTmV3SG9va0VudHJ5KEhvb2tTb3VyY2VGb3JtYXQuQ2xhdWRlKTtcblx0XHRcdGNvbnN0IGNvbnRlbnQgPSBKU09OLnN0cmluZ2lmeSh7IGhvb2tzOiB7IFN1YmFnZW50U3RhcnQ6IFtlbnRyeV0gfSB9LCBudWxsLCAnXFx0Jyk7XG5cdFx0XHRjb25zdCBwYXJzZWQgPSBKU09OLnBhcnNlKGNvbnRlbnQpO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChwYXJzZWQsIHtcblx0XHRcdFx0aG9va3M6IHtcblx0XHRcdFx0XHRTdWJhZ2VudFN0YXJ0OiBbXG5cdFx0XHRcdFx0XHR7XG5cdFx0XHRcdFx0XHRcdG1hdGNoZXI6ICcnLFxuXHRcdFx0XHRcdFx0XHRob29rczogW3tcblx0XHRcdFx0XHRcdFx0XHR0eXBlOiAnY29tbWFuZCcsXG5cdFx0XHRcdFx0XHRcdFx0Y29tbWFuZDogJydcblx0XHRcdFx0XHRcdFx0fV1cblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRdXG5cdFx0XHRcdH1cblx0XHRcdH0pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnQ29waWxvdCBmb3JtYXQgSlNPTiBoYXMgY29ycmVjdCBzdHJ1Y3R1cmUnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBlbnRyeSA9IGJ1aWxkTmV3SG9va0VudHJ5KEhvb2tTb3VyY2VGb3JtYXQuQ29waWxvdCk7XG5cdFx0XHRjb25zdCBjb250ZW50ID0gSlNPTi5zdHJpbmdpZnkoeyBob29rczogeyBTdWJhZ2VudFN0YXJ0OiBbZW50cnldIH0gfSwgbnVsbCwgJ1xcdCcpO1xuXHRcdFx0Y29uc3QgcGFyc2VkID0gSlNPTi5wYXJzZShjb250ZW50KTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocGFyc2VkLCB7XG5cdFx0XHRcdGhvb2tzOiB7XG5cdFx0XHRcdFx0U3ViYWdlbnRTdGFydDogW1xuXHRcdFx0XHRcdFx0e1xuXHRcdFx0XHRcdFx0XHR0eXBlOiAnY29tbWFuZCcsXG5cdFx0XHRcdFx0XHRcdGNvbW1hbmQ6ICcnXG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XVxuXHRcdFx0XHR9XG5cdFx0XHR9KTtcblx0XHR9KTtcblx0fSk7XG5cblx0c3VpdGUoJ2ZpbmRIb29rQ29tbWFuZEluWWFtbCcsICgpID0+IHtcblxuXHRcdHRlc3QoJ2ZpbmRzIHVucXVvdGVkIGNvbW1hbmQgdmFsdWUnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBjb250ZW50ID0gW1xuXHRcdFx0XHQnLS0tJyxcblx0XHRcdFx0J2hvb2tzOicsXG5cdFx0XHRcdCcgIHNlc3Npb25TdGFydDonLFxuXHRcdFx0XHQnICAgIC0gY29tbWFuZDogZWNobyBoZWxsbycsXG5cdFx0XHRcdCctLS0nLFxuXHRcdFx0XS5qb2luKCdcXG4nKTtcblx0XHRcdGNvbnN0IHJlc3VsdCA9IGZpbmRIb29rQ29tbWFuZEluWWFtbChjb250ZW50LCAnZWNobyBoZWxsbycpO1xuXHRcdFx0YXNzZXJ0Lm9rKHJlc3VsdCk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZ2V0U2VsZWN0ZWRUZXh0KGNvbnRlbnQsIHJlc3VsdCksICdlY2hvIGhlbGxvJyk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHJlc3VsdCwge1xuXHRcdFx0XHRzdGFydExpbmVOdW1iZXI6IDQsXG5cdFx0XHRcdHN0YXJ0Q29sdW1uOiAxNixcblx0XHRcdFx0ZW5kTGluZU51bWJlcjogNCxcblx0XHRcdFx0ZW5kQ29sdW1uOiAyNlxuXHRcdFx0fSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdmaW5kcyBkb3VibGUtcXVvdGVkIGNvbW1hbmQgdmFsdWUnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBjb250ZW50ID0gW1xuXHRcdFx0XHQnLS0tJyxcblx0XHRcdFx0J2hvb2tzOicsXG5cdFx0XHRcdCcgIHNlc3Npb25TdGFydDonLFxuXHRcdFx0XHQnICAgIC0gY29tbWFuZDogXCJlY2hvIGhlbGxvXCInLFxuXHRcdFx0XHQnLS0tJyxcblx0XHRcdF0uam9pbignXFxuJyk7XG5cdFx0XHRjb25zdCByZXN1bHQgPSBmaW5kSG9va0NvbW1hbmRJbllhbWwoY29udGVudCwgJ2VjaG8gaGVsbG8nKTtcblx0XHRcdGFzc2VydC5vayhyZXN1bHQpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGdldFNlbGVjdGVkVGV4dChjb250ZW50LCByZXN1bHQpLCAnZWNobyBoZWxsbycpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnZmluZHMgc2luZ2xlLXF1b3RlZCBjb21tYW5kIHZhbHVlJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgY29udGVudCA9IFtcblx0XHRcdFx0Jy0tLScsXG5cdFx0XHRcdCdob29rczonLFxuXHRcdFx0XHQnICBzZXNzaW9uU3RhcnQ6Jyxcblx0XHRcdFx0YCAgICAtIGNvbW1hbmQ6ICdlY2hvIGhlbGxvJ2AsXG5cdFx0XHRcdCctLS0nLFxuXHRcdFx0XS5qb2luKCdcXG4nKTtcblx0XHRcdGNvbnN0IHJlc3VsdCA9IGZpbmRIb29rQ29tbWFuZEluWWFtbChjb250ZW50LCAnZWNobyBoZWxsbycpO1xuXHRcdFx0YXNzZXJ0Lm9rKHJlc3VsdCk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZ2V0U2VsZWN0ZWRUZXh0KGNvbnRlbnQsIHJlc3VsdCksICdlY2hvIGhlbGxvJyk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdmaW5kcyBjb21tYW5kIHdpdGhvdXQgbGlzdCBwcmVmaXgnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBjb250ZW50ID0gW1xuXHRcdFx0XHQnLS0tJyxcblx0XHRcdFx0J2hvb2tzOicsXG5cdFx0XHRcdCcgIHNlc3Npb25TdGFydDonLFxuXHRcdFx0XHQnICAgIGNvbW1hbmQ6IHJ1bi1saW50Jyxcblx0XHRcdFx0Jy0tLScsXG5cdFx0XHRdLmpvaW4oJ1xcbicpO1xuXHRcdFx0Y29uc3QgcmVzdWx0ID0gZmluZEhvb2tDb21tYW5kSW5ZYW1sKGNvbnRlbnQsICdydW4tbGludCcpO1xuXHRcdFx0YXNzZXJ0Lm9rKHJlc3VsdCk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZ2V0U2VsZWN0ZWRUZXh0KGNvbnRlbnQsIHJlc3VsdCksICdydW4tbGludCcpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnZG9lcyBub3QgbWF0Y2ggc3Vic3RyaW5nIG9mIGEgbG9uZ2VyIGNvbW1hbmQnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBjb250ZW50ID0gW1xuXHRcdFx0XHQnLS0tJyxcblx0XHRcdFx0J2hvb2tzOicsXG5cdFx0XHRcdCcgIHNlc3Npb25TdGFydDonLFxuXHRcdFx0XHQnICAgIC0gY29tbWFuZDogZWNobyBoZWxsby13b3JsZCcsXG5cdFx0XHRcdCctLS0nLFxuXHRcdFx0XS5qb2luKCdcXG4nKTtcblx0XHRcdGNvbnN0IHJlc3VsdCA9IGZpbmRIb29rQ29tbWFuZEluWWFtbChjb250ZW50LCAnZWNobyBoZWxsbycpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdCwgdW5kZWZpbmVkKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3JldHVybnMgdW5kZWZpbmVkIHdoZW4gY29tbWFuZCBpcyBub3QgZm91bmQnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBjb250ZW50ID0gW1xuXHRcdFx0XHQnLS0tJyxcblx0XHRcdFx0J2hvb2tzOicsXG5cdFx0XHRcdCcgIHNlc3Npb25TdGFydDonLFxuXHRcdFx0XHQnICAgIC0gY29tbWFuZDogZWNobyBoZWxsbycsXG5cdFx0XHRcdCctLS0nLFxuXHRcdFx0XS5qb2luKCdcXG4nKTtcblx0XHRcdGNvbnN0IHJlc3VsdCA9IGZpbmRIb29rQ29tbWFuZEluWWFtbChjb250ZW50LCAnZWNobyBnb29kYnllJyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0LCB1bmRlZmluZWQpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgncmV0dXJucyB1bmRlZmluZWQgd2hlbiBubyBjb21tYW5kIGxpbmVzIGV4aXN0JywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgY29udGVudCA9IFtcblx0XHRcdFx0Jy0tLScsXG5cdFx0XHRcdCduYW1lOiBteS1hZ2VudCcsXG5cdFx0XHRcdCdkZXNjcmlwdGlvbjogQW4gYWdlbnQnLFxuXHRcdFx0XHQnLS0tJyxcblx0XHRcdF0uam9pbignXFxuJyk7XG5cdFx0XHRjb25zdCByZXN1bHQgPSBmaW5kSG9va0NvbW1hbmRJbllhbWwoY29udGVudCwgJ2VjaG8gaGVsbG8nKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQsIHVuZGVmaW5lZCk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdyZXR1cm5zIHVuZGVmaW5lZCBmb3IgZW1wdHkgY29udGVudCcsICgpID0+IHtcblx0XHRcdGNvbnN0IHJlc3VsdCA9IGZpbmRIb29rQ29tbWFuZEluWWFtbCgnJywgJ2VjaG8gaGVsbG8nKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQsIHVuZGVmaW5lZCk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdmaW5kcyBmaXJzdCBtYXRjaGluZyBjb21tYW5kIHdoZW4gbXVsdGlwbGUgZXhpc3QnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBjb250ZW50ID0gW1xuXHRcdFx0XHQnLS0tJyxcblx0XHRcdFx0J2hvb2tzOicsXG5cdFx0XHRcdCcgIHNlc3Npb25TdGFydDonLFxuXHRcdFx0XHQnICAgIC0gY29tbWFuZDogZWNobyBoZWxsbycsXG5cdFx0XHRcdCcgIHVzZXJQcm9tcHRTdWJtaXQ6Jyxcblx0XHRcdFx0JyAgICAtIGNvbW1hbmQ6IGVjaG8gaGVsbG8nLFxuXHRcdFx0XHQnLS0tJyxcblx0XHRcdF0uam9pbignXFxuJyk7XG5cdFx0XHRjb25zdCByZXN1bHQgPSBmaW5kSG9va0NvbW1hbmRJbllhbWwoY29udGVudCwgJ2VjaG8gaGVsbG8nKTtcblx0XHRcdGFzc2VydC5vayhyZXN1bHQpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdC5zdGFydExpbmVOdW1iZXIsIDQpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnaWdub3JlcyBsaW5lcyB0aGF0IGFyZSBub3QgY29tbWFuZCBmaWVsZHMnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBjb250ZW50ID0gW1xuXHRcdFx0XHQnLS0tJyxcblx0XHRcdFx0J2Rlc2NyaXB0aW9uOiBydW4gY29tbWFuZCBlY2hvIGhlbGxvJyxcblx0XHRcdFx0J2hvb2tzOicsXG5cdFx0XHRcdCcgIHNlc3Npb25TdGFydDonLFxuXHRcdFx0XHQnICAgIC0gY29tbWFuZDogZWNobyBoZWxsbycsXG5cdFx0XHRcdCctLS0nLFxuXHRcdFx0XS5qb2luKCdcXG4nKTtcblx0XHRcdGNvbnN0IHJlc3VsdCA9IGZpbmRIb29rQ29tbWFuZEluWWFtbChjb250ZW50LCAnZWNobyBoZWxsbycpO1xuXHRcdFx0YXNzZXJ0Lm9rKHJlc3VsdCk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0LnN0YXJ0TGluZU51bWJlciwgNSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdoYW5kbGVzIGNvbW1hbmQgd2l0aCBzcGVjaWFsIGNoYXJhY3RlcnMnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBjb250ZW50ID0gW1xuXHRcdFx0XHQnLS0tJyxcblx0XHRcdFx0J2hvb2tzOicsXG5cdFx0XHRcdCcgIHByZVRvb2xVc2U6Jyxcblx0XHRcdFx0JyAgICAtIGNvbW1hbmQ6IGVjaG8gXCJmb29cIiA+IC90bXAvb3V0LnR4dCcsXG5cdFx0XHRcdCctLS0nLFxuXHRcdFx0XS5qb2luKCdcXG4nKTtcblx0XHRcdGNvbnN0IHJlc3VsdCA9IGZpbmRIb29rQ29tbWFuZEluWWFtbChjb250ZW50LCAnZWNobyBcImZvb1wiID4gL3RtcC9vdXQudHh0Jyk7XG5cdFx0XHRhc3NlcnQub2socmVzdWx0KTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChnZXRTZWxlY3RlZFRleHQoY29udGVudCwgcmVzdWx0KSwgJ2VjaG8gXCJmb29cIiA+IC90bXAvb3V0LnR4dCcpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnbWF0Y2hlcyBjb21tYW5kIGZvbGxvd2VkIGJ5IHRyYWlsaW5nIHdoaXRlc3BhY2UnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBjb250ZW50ID0gW1xuXHRcdFx0XHQnLS0tJyxcblx0XHRcdFx0J2hvb2tzOicsXG5cdFx0XHRcdCcgIHNlc3Npb25TdGFydDonLFxuXHRcdFx0XHQnICAgIC0gY29tbWFuZDogZWNobyBoZWxsbyAgICcsXG5cdFx0XHRcdCctLS0nLFxuXHRcdFx0XS5qb2luKCdcXG4nKTtcblx0XHRcdGNvbnN0IHJlc3VsdCA9IGZpbmRIb29rQ29tbWFuZEluWWFtbChjb250ZW50LCAnZWNobyBoZWxsbycpO1xuXHRcdFx0YXNzZXJ0Lm9rKHJlc3VsdCk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZ2V0U2VsZWN0ZWRUZXh0KGNvbnRlbnQsIHJlc3VsdCksICdlY2hvIGhlbGxvJyk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdmaW5kcyBzaG9ydCBjb21tYW5kIHRoYXQgaXMgYSBzdWJzdHJpbmcgb2YgdGhlIGtleSBuYW1lJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgY29udGVudCA9IFtcblx0XHRcdFx0J2hvb2tzOicsXG5cdFx0XHRcdCcgIFN0b3A6Jyxcblx0XHRcdFx0JyAgICAtIHRpbWVvdXQ6IDEwJyxcblx0XHRcdFx0JyAgICAgIGNvbW1hbmQ6IFwiYVwiJyxcblx0XHRcdFx0JyAgICAgIHR5cGU6IGNvbW1hbmQnLFxuXHRcdFx0XS5qb2luKCdcXG4nKTtcblx0XHRcdGNvbnN0IHJlc3VsdCA9IGZpbmRIb29rQ29tbWFuZEluWWFtbChjb250ZW50LCAnYScpO1xuXHRcdFx0YXNzZXJ0Lm9rKHJlc3VsdCk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZ2V0U2VsZWN0ZWRUZXh0KGNvbnRlbnQsIHJlc3VsdCksICdhJyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0LnN0YXJ0TGluZU51bWJlciwgNCk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdmaW5kcyBzaG9ydCBjb21tYW5kIGluIGJhc2ggZmllbGQgdGhhdCBpcyBhIHN1YnN0cmluZyBvZiB0aGUga2V5IG5hbWUnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBjb250ZW50ID0gW1xuXHRcdFx0XHQnaG9va3M6Jyxcblx0XHRcdFx0JyAgc2Vzc2lvblN0YXJ0OicsXG5cdFx0XHRcdCcgICAgLSBiYXNoOiBcImFcIicsXG5cdFx0XHRcdCcgICAgICB0eXBlOiBjb21tYW5kJyxcblx0XHRcdF0uam9pbignXFxuJyk7XG5cdFx0XHRjb25zdCByZXN1bHQgPSBmaW5kSG9va0NvbW1hbmRJbllhbWwoY29udGVudCwgJ2EnKTtcblx0XHRcdGFzc2VydC5vayhyZXN1bHQpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGdldFNlbGVjdGVkVGV4dChjb250ZW50LCByZXN1bHQpLCAnYScpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdC5zdGFydExpbmVOdW1iZXIsIDMpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnZmluZHMgY29tbWFuZCBpbiBwb3dlcnNoZWxsIGZpZWxkJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgY29udGVudCA9IFtcblx0XHRcdFx0J2hvb2tzOicsXG5cdFx0XHRcdCcgIHNlc3Npb25TdGFydDonLFxuXHRcdFx0XHQnICAgIC0gcG93ZXJzaGVsbDogXCJlY2hvIGhlbGxvXCInLFxuXHRcdFx0XHQnICAgICAgdHlwZTogY29tbWFuZCcsXG5cdFx0XHRdLmpvaW4oJ1xcbicpO1xuXHRcdFx0Y29uc3QgcmVzdWx0ID0gZmluZEhvb2tDb21tYW5kSW5ZYW1sKGNvbnRlbnQsICdlY2hvIGhlbGxvJyk7XG5cdFx0XHRhc3NlcnQub2socmVzdWx0KTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChnZXRTZWxlY3RlZFRleHQoY29udGVudCwgcmVzdWx0KSwgJ2VjaG8gaGVsbG8nKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQuc3RhcnRMaW5lTnVtYmVyLCAzKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2ZpbmRzIGNvbW1hbmQgaW4gd2luZG93cyBmaWVsZCcsICgpID0+IHtcblx0XHRcdGNvbnN0IGNvbnRlbnQgPSBbXG5cdFx0XHRcdCdob29rczonLFxuXHRcdFx0XHQnICBzZXNzaW9uU3RhcnQ6Jyxcblx0XHRcdFx0JyAgICAtIHdpbmRvd3M6IFwiZGlyXCInLFxuXHRcdFx0XHQnICAgICAgdHlwZTogY29tbWFuZCcsXG5cdFx0XHRdLmpvaW4oJ1xcbicpO1xuXHRcdFx0Y29uc3QgcmVzdWx0ID0gZmluZEhvb2tDb21tYW5kSW5ZYW1sKGNvbnRlbnQsICdkaXInKTtcblx0XHRcdGFzc2VydC5vayhyZXN1bHQpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGdldFNlbGVjdGVkVGV4dChjb250ZW50LCByZXN1bHQpLCAnZGlyJyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0LnN0YXJ0TGluZU51bWJlciwgMyk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdmaW5kcyBjb21tYW5kIGluIGxpbnV4IGFuZCBvc3ggZmllbGRzJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgY29udGVudCA9IFtcblx0XHRcdFx0J2hvb2tzOicsXG5cdFx0XHRcdCcgIHNlc3Npb25TdGFydDonLFxuXHRcdFx0XHQnICAgIC0gbGludXg6IFwibHNcIicsXG5cdFx0XHRcdCcgICAgICBvc3g6IFwibHMgLUdcIicsXG5cdFx0XHRcdCcgICAgICB0eXBlOiBjb21tYW5kJyxcblx0XHRcdF0uam9pbignXFxuJyk7XG5cdFx0XHRjb25zdCBsaW51eFJlc3VsdCA9IGZpbmRIb29rQ29tbWFuZEluWWFtbChjb250ZW50LCAnbHMnKTtcblx0XHRcdGFzc2VydC5vayhsaW51eFJlc3VsdCk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZ2V0U2VsZWN0ZWRUZXh0KGNvbnRlbnQsIGxpbnV4UmVzdWx0KSwgJ2xzJyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobGludXhSZXN1bHQuc3RhcnRMaW5lTnVtYmVyLCAzKTtcblxuXHRcdFx0Y29uc3Qgb3N4UmVzdWx0ID0gZmluZEhvb2tDb21tYW5kSW5ZYW1sKGNvbnRlbnQsICdscyAtRycpO1xuXHRcdFx0YXNzZXJ0Lm9rKG9zeFJlc3VsdCk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZ2V0U2VsZWN0ZWRUZXh0KGNvbnRlbnQsIG9zeFJlc3VsdCksICdscyAtRycpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG9zeFJlc3VsdC5zdGFydExpbmVOdW1iZXIsIDQpO1xuXHRcdH0pO1xuXHR9KTtcbn0pO1xuIl0sCiAgIm1hcHBpbmdzIjogIkFBS0EsT0FBTyxZQUFZO0FBQ25CLFNBQVMsK0NBQStDO0FBQ3hELFNBQVMsdUJBQXVCLGdDQUFnQztBQUVoRSxTQUFTLG1CQUFtQix3QkFBd0I7QUFLcEQsU0FBUyxnQkFBZ0IsU0FBaUIsV0FBeUM7QUFDbEYsUUFBTSxRQUFRLFFBQVEsTUFBTSxJQUFJO0FBQ2hDLE1BQUksVUFBVSxvQkFBb0IsVUFBVSxlQUFlO0FBQzFELFdBQU8sTUFBTSxVQUFVLGtCQUFrQixDQUFDLEVBQUUsVUFBVSxVQUFVLGNBQWMsR0FBRyxVQUFVLFlBQWEsQ0FBQztBQUFBLEVBQzFHO0FBRUEsUUFBTSxTQUFtQixDQUFDO0FBQzFCLFNBQU8sS0FBSyxNQUFNLFVBQVUsa0JBQWtCLENBQUMsRUFBRSxVQUFVLFVBQVUsY0FBYyxDQUFDLENBQUM7QUFDckYsV0FBUyxJQUFJLFVBQVUsaUJBQWlCLElBQUksVUFBVSxnQkFBaUIsR0FBRyxLQUFLO0FBQzlFLFdBQU8sS0FBSyxNQUFNLENBQUMsQ0FBQztBQUFBLEVBQ3JCO0FBQ0EsU0FBTyxLQUFLLE1BQU0sVUFBVSxnQkFBaUIsQ0FBQyxFQUFFLFVBQVUsR0FBRyxVQUFVLFlBQWEsQ0FBQyxDQUFDO0FBQ3RGLFNBQU8sT0FBTyxLQUFLLElBQUk7QUFDeEI7QUFFQSxNQUFNLGFBQWEs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
