import assert from "assert";
import { URI } from "../../../../../../../base/common/uri.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../../../../base/test/common/utils.js";
import { getPromptFileType, getCleanPromptName, isPromptOrInstructionsFile, isSkillFilename } from "../../../../common/promptSyntax/config/promptFileLocations.js";
import { PromptsType } from "../../../../common/promptSyntax/promptTypes.js";
suite("promptFileLocations", function() {
  ensureNoDisposablesAreLeakedInTestSuite();
  suite("getPromptFileType", () => {
    test(".prompt.md files", () => {
      const uri = URI.file("/workspace/test.prompt.md");
      assert.strictEqual(getPromptFileType(uri), PromptsType.prompt);
    });
    test(".instructions.md files", () => {
      const uri = URI.file("/workspace/test.instructions.md");
      assert.strictEqual(getPromptFileType(uri), PromptsType.instructions);
    });
    test(".agent.md files", () => {
      const uri = URI.file("/workspace/test.agent.md");
      assert.strictEqual(getPromptFileType(uri), PromptsType.agent);
    });
    test(".chatmode.md files (legacy)", () => {
      const uri = URI.file("/workspace/test.chatmode.md");
      assert.strictEqual(getPromptFileType(uri), PromptsType.agent);
    });
    test(".md files in .github/agents/ folder should be recognized as agent files", () => {
      const uri = URI.file("/workspace/.github/agents/demonstrate.md");
      assert.strictEqual(getPromptFileType(uri), PromptsType.agent);
    });
    test("README.md in .github/agents/ should NOT be recognized as agent file", () => {
      const uri = URI.file("/workspace/.github/agents/README.md");
      assert.strictEqual(getPromptFileType(uri), void 0);
    });
    test(".md files in .github/agents/ subfolder should NOT be recognized as agent files", () => {
      const uri = URI.file("/workspace/.github/agents/subfolder/test.md");
      assert.strictEqual(getPromptFileType(uri), void 0);
    });
    test(".md files in .claude/agents/ subfolder should NOT be recognized as agent files", () => {
      const uri = URI.file("/workspace/.claude/agents/subfolder/test.md");
      assert.strictEqual(getPromptFileType(uri), void 0);
    });
    test(".md files in ~/.copilot/agents/ subfolder should NOT be recognized as agent files", () => {
      const uri = URI.file("/home/user/.copilot/agents/subfolder/test.md");
      assert.strictEqual(getPromptFileType(uri), void 0);
    });
    test(".md files in .claude/agents/ folder should be recognized as agent files", () => {
      const uri = URI.file("/workspace/.claude/agents/demonstrate.md");
      assert.strictEqual(getPromptFileType(uri), PromptsType.agent);
    });
    test("README.md in .claude/agents/ should NOT be recognized as agent file", () => {
      const uri = URI.file("/workspace/.claude/agents/README.md");
      assert.strictEqual(getPromptFileType(uri), void 0);
    });
    test(".md files in ~/.copilot/agents/ folder should be recognized as agent files", () => {
      const uri = URI.file("/home/user/.copilot/agents/my-agent.md");
      assert.strictEqual(getPromptFileType(uri), PromptsType.agent);
    });
    test("README.md in ~/.copilot/agents/ should NOT be recognized as agent file", () => {
      const uri = URI.file("/home/user/.copilot/agents/README.md");
      assert.strictEqual(getPromptFileType(uri), void 0);
    });
    test(".md files outside .github/agents/ should not be recognized as agent files", () => {
      const uri = URI.file("/workspace/test/foo.md");
      assert.strictEqual(getPromptFileType(uri), void 0);
    });
    test(".md files in other .github/ subfolders should not be recognized as agent files", () => {
      const uri = URI.file("/workspace/.github/prompts/test.md");
      assert.strictEqual(getPromptFileType(uri), void 0);
    });
    test("copilot-instructions.md should be recognized as instructions", () => {
      const uri = URI.file("/workspace/.github/copilot-instructions.md");
      assert.strictEqual(getPromptFileType(uri), PromptsType.instructions);
    });
    test("regular .md files should return undefined", () => {
      const uri = URI.file("/workspace/README.md");
      assert.strictEqual(getPromptFileType(uri), void 0);
    });
    test("SKILL.md (uppercase) should be recognized as skill", () => {
      const uri = URI.file("/workspace/.github/skills/test/SKILL.md");
      assert.strictEqual(getPromptFileType(uri), PromptsType.skill);
    });
    test("skill.md (lowercase) should be recognized as skill", () => {
      const uri = URI.file("/workspace/.github/skills/test/skill.md");
      assert.strictEqual(getPromptFileType(uri), PromptsType.skill);
    });
    test("Skill.md (mixed case) should be recognized as skill", () => {
      const uri = URI.file("/workspace/.github/skills/test/Skill.md");
      assert.strictEqual(getPromptFileType(uri), PromptsType.skill);
    });
    test("any .json file should be recognized as hook", () => {
      assert.strictEqual(getPromptFileType(URI.file("/workspace/.github/hooks/hooks.json")), PromptsType.hook);
      assert.strictEqual(getPromptFileType(URI.file("/workspace/.github/hooks/custom-hooks.json")), PromptsType.hook);
      assert.strictEqual(getPromptFileType(URI.file("/workspace/.claude/settings.json")), PromptsType.hook);
      assert.strictEqual(getPromptFileType(URI.file("/workspace/.claude/settings.local.json")), PromptsType.hook);
      assert.strictEqual(getPromptFileType(URI.file("/workspace/any/path/config.json")), PromptsType.hook);
    });
    test(".json files are case insensitive", () => {
      assert.strictEqual(getPromptFileType(URI.file("/workspace/.github/hooks/HOOKS.JSON")), PromptsType.hook);
      assert.strictEqual(getPromptFileType(URI.file("/workspace/.claude/SETTINGS.JSON")), PromptsType.hook);
    });
    test("non-json file in .github/hooks folder should NOT be recognized as hook", () => {
      const uri = URI.file("/workspace/.github/hooks/readme.md");
      assert.strictEqual(getPromptFileType(uri), void 0);
    });
  });
  suite("getCleanPromptName", () => {
    test("removes .prompt.md extension", () => {
      const uri = URI.file("/workspace/test.prompt.md");
      assert.strictEqual(getCleanPromptName(uri), "test");
    });
    test("removes .instructions.md extension", () => {
      const uri = URI.file("/workspace/test.instructions.md");
      assert.strictEqual(getCleanPromptName(uri), "test");
    });
    test("removes .agent.md extension", () => {
      const uri = URI.file("/workspace/test.agent.md");
      assert.strictEqual(getCleanPromptName(uri), "test");
    });
    test("removes .chatmode.md extension (legacy)", () => {
      const uri = URI.file("/workspace/test.chatmode.md");
      assert.strictEqual(getCleanPromptName(uri), "test");
    });
    test("removes .md extension for files in .github/agents/", () => {
      const uri = URI.file("/workspace/.github/agents/demonstrate.md");
      assert.strictEqual(getCleanPromptName(uri), "demonstrate");
    });
    test("removes .md extension for files in .claude/agents/", () => {
      const uri = URI.file("/workspace/.claude/agents/claude-agent.md");
      assert.strictEqual(getCleanPromptName(uri), "claude-agent");
    });
    test("removes .md extension for files in ~/.copilot/agents/", () => {
      const uri = URI.file("/home/user/.copilot/agents/my-agent.md");
      assert.strictEqual(getCleanPromptName(uri), "my-agent");
    });
    test("README.md in .github/agents/ should keep .md extension", () => {
      const uri = URI.file("/workspace/.github/agents/README.md");
      assert.strictEqual(getCleanPromptName(uri), "README.md");
    });
    test("removes .md extension for copilot-instructions.md", () => {
      const uri = URI.file("/workspace/.github/copilot-instructions.md");
      assert.strictEqual(getCleanPromptName(uri), "copilot-instructions");
    });
    test("keeps .md extension for regular files", () => {
      const uri = URI.file("/workspace/README.md");
      assert.strictEqual(getCleanPromptName(uri), "README.md");
    });
    test("keeps full filename for files without known extensions", () => {
      const uri = URI.file("/workspace/test.txt");
      assert.strictEqual(getCleanPromptName(uri), "test.txt");
    });
    test("returns folder name for SKILL.md (uppercase)", () => {
      const uri = URI.file("/workspace/.github/skills/test/SKILL.md");
      assert.strictEqual(getCleanPromptName(uri), "test");
    });
    test("returns folder name for skill.md (lowercase)", () => {
      const uri = URI.file("/workspace/.github/skills/my-skill/skill.md");
      assert.strictEqual(getCleanPromptName(uri), "my-skill");
    });
    test("returns folder name for Skill.md (mixed case)", () => {
      const uri = URI.file("/workspace/.github/skills/another-skill/Skill.md");
      assert.strictEqual(getCleanPromptName(uri), "another-skill");
    });
  });
  suite("isPromptOrInstructionsFile", () => {
    test("SKILL.md files should return true", () => {
      assert.strictEqual(isPromptOrInstructionsFile(URI.file("/workspace/.github/skills/test/SKILL.md")), true);
    });
    test("skill.md (lowercase) should return true", () => {
      assert.strictEqual(isPromptOrInstructionsFile(URI.file("/workspace/.claude/skills/myskill/skill.md")), true);
    });
    test("Skill.md (mixed case) should return true", () => {
      assert.strictEqual(isPromptOrInstructionsFile(URI.file("/workspace/skills/Skill.md")), true);
    });
    test("regular .md files should return false", () => {
      assert.strictEqual(isPromptOrInstructionsFile(URI.file("/workspace/SKILL2.md")), false);
    });
    test("any .json file should return true", () => {
      assert.strictEqual(isPromptOrInstructionsFile(URI.file("/workspace/.github/hooks/custom-hooks.json")), true);
      assert.strictEqual(isPromptOrInstructionsFile(URI.file("/workspace/.claude/settings.json")), true);
      assert.strictEqual(isPromptOrInstructionsFile(URI.file("/workspace/.claude/settings.local.json")), true);
      assert.strictEqual(isPromptOrInstructionsFile(URI.file("/workspace/settings.json")), true);
    });
  });
  suite("isSkillFilename", () => {
    test("SKILL.md (uppercase) should return true", () => {
      assert.strictEqual(isSkillFilename("SKILL.md"), true);
    });
    test("skill.md (lowercase) should return true", () => {
      assert.strictEqual(isSkillFilename("skill.md"), true);
    });
    test("Skill.md (mixed case) should return true", () => {
      assert.strictEqual(isSkillFilename("Skill.md"), true);
    });
    test("other filenames should return false", () => {
      assert.strictEqual(isSkillFilename("README.md"), false);
      assert.strictEqual(isSkillFilename("SKILL.txt"), false);
      assert.strictEqual(isSkillFilename("my-skill.md"), false);
    });
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXGNoYXRcXHRlc3RcXGNvbW1vblxccHJvbXB0U3ludGF4XFxjb25maWdcXHByb21wdEZpbGVMb2NhdGlvbnMudGVzdC50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCBhc3NlcnQgZnJvbSAnYXNzZXJ0JztcbmltcG9ydCB7IFVSSSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3VyaS5qcyc7XG5pbXBvcnQgeyBlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi8uLi9iYXNlL3Rlc3QvY29tbW9uL3V0aWxzLmpzJztcbmltcG9ydCB7IGdldFByb21wdEZpbGVUeXBlLCBnZXRDbGVhblByb21wdE5hbWUsIGlzUHJvbXB0T3JJbnN0cnVjdGlvbnNGaWxlLCBpc1NraWxsRmlsZW5hbWUgfSBmcm9tICcuLi8uLi8uLi8uLi9jb21tb24vcHJvbXB0U3ludGF4L2NvbmZpZy9wcm9tcHRGaWxlTG9jYXRpb25zLmpzJztcbmltcG9ydCB7IFByb21wdHNUeXBlIH0gZnJvbSAnLi4vLi4vLi4vLi4vY29tbW9uL3Byb21wdFN5bnRheC9wcm9tcHRUeXBlcy5qcyc7XG5cbnN1aXRlKCdwcm9tcHRGaWxlTG9jYXRpb25zJywgZnVuY3Rpb24gKCkge1xuXHRlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUoKTtcblxuXHRzdWl0ZSgnZ2V0UHJvbXB0RmlsZVR5cGUnLCAoKSA9PiB7XG5cdFx0dGVzdCgnLnByb21wdC5tZCBmaWxlcycsICgpID0+IHtcblx0XHRcdGNvbnN0IHVyaSA9IFVSSS5maWxlKCcvd29ya3NwYWNlL3Rlc3QucHJvbXB0Lm1kJyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZ2V0UHJvbXB0RmlsZVR5cGUodXJpKSwgUHJvbXB0c1R5cGUucHJvbXB0KTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJy5pbnN0cnVjdGlvbnMubWQgZmlsZXMnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCB1cmkgPSBVUkkuZmlsZSgnL3dvcmtzcGFjZS90ZXN0Lmluc3RydWN0aW9ucy5tZCcpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGdldFByb21wdEZpbGVUeXBlKHVyaSksIFByb21wdHNUeXBlLmluc3RydWN0aW9ucyk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCcuYWdlbnQubWQgZmlsZXMnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCB1cmkgPSBVUkkuZmlsZSgnL3dvcmtzcGFjZS90ZXN0LmFnZW50Lm1kJyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZ2V0UHJvbXB0RmlsZVR5cGUodXJpKSwgUHJvbXB0c1R5cGUuYWdlbnQpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnLmNoYXRtb2RlLm1kIGZpbGVzIChsZWdhY3kpJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgdXJpID0gVVJJLmZpbGUoJy93b3Jrc3BhY2UvdGVzdC5jaGF0bW9kZS5tZCcpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGdldFByb21wdEZpbGVUeXBlKHVyaSksIFByb21wdHNUeXBlLmFnZW50KTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJy5tZCBmaWxlcyBpbiAuZ2l0aHViL2FnZW50cy8gZm9sZGVyIHNob3VsZCBiZSByZWNvZ25pemVkIGFzIGFnZW50IGZpbGVzJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgdXJpID0gVVJJLmZpbGUoJy93b3Jrc3BhY2UvLmdpdGh1Yi9hZ2VudHMvZGVtb25zdHJhdGUubWQnKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChnZXRQcm9tcHRGaWxlVHlwZSh1cmkpLCBQcm9tcHRzVHlwZS5hZ2VudCk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdSRUFETUUubWQgaW4gLmdpdGh1Yi9hZ2VudHMvIHNob3VsZCBOT1QgYmUgcmVjb2duaXplZCBhcyBhZ2VudCBmaWxlJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgdXJpID0gVVJJLmZpbGUoJy93b3Jrc3BhY2UvLmdpdGh1Yi9hZ2VudHMvUkVBRE1FLm1kJyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZ2V0UHJvbXB0RmlsZVR5cGUodXJpKSwgdW5kZWZpbmVkKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJy5tZCBmaWxlcyBpbiAuZ2l0aHViL2FnZW50cy8gc3ViZm9sZGVyIHNob3VsZCBOT1QgYmUgcmVjb2duaXplZCBhcyBhZ2VudCBmaWxlcycsICgpID0+IHtcblx0XHRcdGNvbnN0IHVyaSA9IFVSSS5maWxlKCcvd29ya3NwYWNlLy5naXRodWIvYWdlbnRzL3N1YmZvbGRlci90ZXN0Lm1kJyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZ2V0UHJvbXB0RmlsZVR5cGUodXJpKSwgdW5kZWZpbmVkKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJy5tZCBmaWxlcyBpbiAuY2xhdWRlL2FnZW50cy8gc3ViZm9sZGVyIHNob3VsZCBOT1QgYmUgcmVjb2duaXplZCBhcyBhZ2VudCBmaWxlcycsICgpID0+IHtcblx0XHRcdGNvbnN0IHVyaSA9IFVSSS5maWxlKCcvd29ya3NwYWNlLy5jbGF1ZGUvYWdlbnRzL3N1YmZvbGRlci90ZXN0Lm1kJyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZ2V0UHJvbXB0RmlsZVR5cGUodXJpKSwgdW5kZWZpbmVkKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJy5tZCBmaWxlcyBpbiB+Ly5jb3BpbG90L2FnZW50cy8gc3ViZm9sZGVyIHNob3VsZCBOT1QgYmUgcmVjb2duaXplZCBhcyBhZ2VudCBmaWxlcycsICgpID0+IHtcblx0XHRcdGNvbnN0IHVyaSA9IFVSSS5maWxlKCcvaG9tZS91c2VyLy5jb3BpbG90L2FnZW50cy9zdWJmb2xkZXIvdGVzdC5tZCcpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGdldFByb21wdEZpbGVUeXBlKHVyaSksIHVuZGVmaW5lZCk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCcubWQgZmlsZXMgaW4gLmNsYXVkZS9hZ2VudHMvIGZvbGRlciBzaG91bGQgYmUgcmVjb2duaXplZCBhcyBhZ2VudCBmaWxlcycsICgpID0+IHtcblx0XHRcdGNvbnN0IHVyaSA9IFVSSS5maWxlKCcvd29ya3NwYWNlLy5jbGF1ZGUvYWdlbnRzL2RlbW9uc3RyYXRlLm1kJyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZ2V0UHJvbXB0RmlsZVR5cGUodXJpKSwgUHJvbXB0c1R5cGUuYWdlbnQpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnUkVBRE1FLm1kIGluIC5jbGF1ZGUvYWdlbnRzLyBzaG91bGQgTk9UIGJlIHJlY29nbml6ZWQgYXMgYWdlbnQgZmlsZScsICgpID0+IHtcblx0XHRcdGNvbnN0IHVyaSA9IFVSSS5maWxlKCcvd29ya3NwYWNlLy5jbGF1ZGUvYWdlbnRzL1JFQURNRS5tZCcpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGdldFByb21wdEZpbGVUeXBlKHVyaSksIHVuZGVmaW5lZCk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCcubWQgZmlsZXMgaW4gfi8uY29waWxvdC9hZ2VudHMvIGZvbGRlciBzaG91bGQgYmUgcmVjb2duaXplZCBhcyBhZ2VudCBmaWxlcycsICgpID0+IHtcblx0XHRcdGNvbnN0IHVyaSA9IFVSSS5maWxlKCcvaG9tZS91c2VyLy5jb3BpbG90L2FnZW50cy9teS1hZ2VudC5tZCcpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGdldFByb21wdEZpbGVUeXBlKHVyaSksIFByb21wdHNUeXBlLmFnZW50KTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ1JFQURNRS5tZCBpbiB+Ly5jb3BpbG90L2FnZW50cy8gc2hvdWxkIE5PVCBiZSByZWNvZ25pemVkIGFzIGFnZW50IGZpbGUnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCB1cmkgPSBVUkkuZmlsZSgnL2hvbWUvdXNlci8uY29waWxvdC9hZ2VudHMvUkVBRE1FLm1kJyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZ2V0UHJvbXB0RmlsZVR5cGUodXJpKSwgdW5kZWZpbmVkKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJy5tZCBmaWxlcyBvdXRzaWRlIC5naXRodWIvYWdlbnRzLyBzaG91bGQgbm90IGJlIHJlY29nbml6ZWQgYXMgYWdlbnQgZmlsZXMnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCB1cmkgPSBVUkkuZmlsZSgnL3dvcmtzcGFjZS90ZXN0L2Zvby5tZCcpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGdldFByb21wdEZpbGVUeXBlKHVyaSksIHVuZGVmaW5lZCk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCcubWQgZmlsZXMgaW4gb3RoZXIgLmdpdGh1Yi8gc3ViZm9sZGVycyBzaG91bGQgbm90IGJlIHJlY29nbml6ZWQgYXMgYWdlbnQgZmlsZXMnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCB1cmkgPSBVUkkuZmlsZSgnL3dvcmtzcGFjZS8uZ2l0aHViL3Byb21wdHMvdGVzdC5tZCcpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGdldFByb21wdEZpbGVUeXBlKHVyaSksIHVuZGVmaW5lZCk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdjb3BpbG90LWluc3RydWN0aW9ucy5tZCBzaG91bGQgYmUgcmVjb2duaXplZCBhcyBpbnN0cnVjdGlvbnMnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCB1cmkgPSBVUkkuZmlsZSgnL3dvcmtzcGFjZS8uZ2l0aHViL2NvcGlsb3QtaW5zdHJ1Y3Rpb25zLm1kJyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZ2V0UHJvbXB0RmlsZVR5cGUodXJpKSwgUHJvbXB0c1R5cGUuaW5zdHJ1Y3Rpb25zKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3JlZ3VsYXIgLm1kIGZpbGVzIHNob3VsZCByZXR1cm4gdW5kZWZpbmVkJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgdXJpID0gVVJJLmZpbGUoJy93b3Jrc3BhY2UvUkVBRE1FLm1kJyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZ2V0UHJvbXB0RmlsZVR5cGUodXJpKSwgdW5kZWZpbmVkKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ1NLSUxMLm1kICh1cHBlcmNhc2UpIHNob3VsZCBiZSByZWNvZ25pemVkIGFzIHNraWxsJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgdXJpID0gVVJJLmZpbGUoJy93b3Jrc3BhY2UvLmdpdGh1Yi9za2lsbHMvdGVzdC9TS0lMTC5tZCcpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGdldFByb21wdEZpbGVUeXBlKHVyaSksIFByb21wdHNUeXBlLnNraWxsKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3NraWxsLm1kIChsb3dlcmNhc2UpIHNob3VsZCBiZSByZWNvZ25pemVkIGFzIHNraWxsJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgdXJpID0gVVJJLmZpbGUoJy93b3Jrc3BhY2UvLmdpdGh1Yi9za2lsbHMvdGVzdC9za2lsbC5tZCcpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGdldFByb21wdEZpbGVUeXBlKHVyaSksIFByb21wdHNUeXBlLnNraWxsKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ1NraWxsLm1kIChtaXhlZCBjYXNlKSBzaG91bGQgYmUgcmVjb2duaXplZCBhcyBza2lsbCcsICgpID0+IHtcblx0XHRcdGNvbnN0IHVyaSA9IFVSSS5maWxlKCcvd29ya3NwYWNlLy5naXRodWIvc2tpbGxzL3Rlc3QvU2tpbGwubWQnKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChnZXRQcm9tcHRGaWxlVHlwZSh1cmkpLCBQcm9tcHRzVHlwZS5za2lsbCk7XG5cdFx0fSk7XG5cblx0XHQvLyBOb3RlOiBnZXRQcm9tcHRGaWxlVHlwZSBhc3N1bWVzIHRoZSBVUkkgaXMgZnJvbSBhIHZhbGlkIHByb21wdCBzb3VyY2UgZm9sZGVyLlxuXHRcdC8vIEFueSAuanNvbiBmaWxlIHJldHVybnMgUHJvbXB0c1R5cGUuaG9vayAtIHRoZSBjYWxsZXIgZmlsdGVycyBieSBmb2xkZXIuXG5cdFx0dGVzdCgnYW55IC5qc29uIGZpbGUgc2hvdWxkIGJlIHJlY29nbml6ZWQgYXMgaG9vaycsICgpID0+IHtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChnZXRQcm9tcHRGaWxlVHlwZShVUkkuZmlsZSgnL3dvcmtzcGFjZS8uZ2l0aHViL2hvb2tzL2hvb2tzLmpzb24nKSksIFByb21wdHNUeXBlLmhvb2spO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGdldFByb21wdEZpbGVUeXBlKFVSSS5maWxlKCcvd29ya3NwYWNlLy5naXRodWIvaG9va3MvY3VzdG9tLWhvb2tzLmpzb24nKSksIFByb21wdHNUeXBlLmhvb2spO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGdldFByb21wdEZpbGVUeXBlKFVSSS5maWxlKCcvd29ya3NwYWNlLy5jbGF1ZGUvc2V0dGluZ3MuanNvbicpKSwgUHJvbXB0c1R5cGUuaG9vayk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZ2V0UHJvbXB0RmlsZVR5cGUoVVJJLmZpbGUoJy93b3Jrc3BhY2UvLmNsYXVkZS9zZXR0aW5ncy5sb2NhbC5qc29uJykpLCBQcm9tcHRzVHlwZS5ob29rKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChnZXRQcm9tcHRGaWxlVHlwZShVUkkuZmlsZSgnL3dvcmtzcGFjZS9hbnkvcGF0aC9jb25maWcuanNvbicpKSwgUHJvbXB0c1R5cGUuaG9vayk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCcuanNvbiBmaWxlcyBhcmUgY2FzZSBpbnNlbnNpdGl2ZScsICgpID0+IHtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChnZXRQcm9tcHRGaWxlVHlwZShVUkkuZmlsZSgnL3dvcmtzcGFjZS8uZ2l0aHViL2hvb2tzL0hPT0tTLkpTT04nKSksIFByb21wdHNUeXBlLmhvb2spO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGdldFByb21wdEZpbGVUeXBlKFVSSS5maWxlKCcvd29ya3NwYWNlLy5jbGF1ZGUvU0VUVElOR1MuSlNPTicpKSwgUHJvbXB0c1R5cGUuaG9vayk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdub24tanNvbiBmaWxlIGluIC5naXRodWIvaG9va3MgZm9sZGVyIHNob3VsZCBOT1QgYmUgcmVjb2duaXplZCBhcyBob29rJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgdXJpID0gVVJJLmZpbGUoJy93b3Jrc3BhY2UvLmdpdGh1Yi9ob29rcy9yZWFkbWUubWQnKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChnZXRQcm9tcHRGaWxlVHlwZSh1cmkpLCB1bmRlZmluZWQpO1xuXHRcdH0pO1xuXHR9KTtcblxuXHRzdWl0ZSgnZ2V0Q2xlYW5Qcm9tcHROYW1lJywgKCkgPT4ge1xuXHRcdHRlc3QoJ3JlbW92ZXMgLnByb21wdC5tZCBleHRlbnNpb24nLCAoKSA9PiB7XG5cdFx0XHRjb25zdCB1cmkgPSBVUkkuZmlsZSgnL3dvcmtzcGFjZS90ZXN0LnByb21wdC5tZCcpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGdldENsZWFuUHJvbXB0TmFtZSh1cmkpLCAndGVzdCcpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgncmVtb3ZlcyAuaW5zdHJ1Y3Rpb25zLm1kIGV4dGVuc2lvbicsICgpID0+IHtcblx0XHRcdGNvbnN0IHVyaSA9IFVSSS5maWxlKCcvd29ya3NwYWNlL3Rlc3QuaW5zdHJ1Y3Rpb25zLm1kJyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZ2V0Q2xlYW5Qcm9tcHROYW1lKHVyaSksICd0ZXN0Jyk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdyZW1vdmVzIC5hZ2VudC5tZCBleHRlbnNpb24nLCAoKSA9PiB7XG5cdFx0XHRjb25zdCB1cmkgPSBVUkkuZmlsZSgnL3dvcmtzcGFjZS90ZXN0LmFnZW50Lm1kJyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZ2V0Q2xlYW5Qcm9tcHROYW1lKHVyaSksICd0ZXN0Jyk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdyZW1vdmVzIC5jaGF0bW9kZS5tZCBleHRlbnNpb24gKGxlZ2FjeSknLCAoKSA9PiB7XG5cdFx0XHRjb25zdCB1cmkgPSBVUkkuZmlsZSgnL3dvcmtzcGFjZS90ZXN0LmNoYXRtb2RlLm1kJyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZ2V0Q2xlYW5Qcm9tcHROYW1lKHVyaSksICd0ZXN0Jyk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdyZW1vdmVzIC5tZCBleHRlbnNpb24gZm9yIGZpbGVzIGluIC5naXRodWIvYWdlbnRzLycsICgpID0+IHtcblx0XHRcdGNvbnN0IHVyaSA9IFVSSS5maWxlKCcvd29ya3NwYWNlLy5naXRodWIvYWdlbnRzL2RlbW9uc3RyYXRlLm1kJyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZ2V0Q2xlYW5Qcm9tcHROYW1lKHVyaSksICdkZW1vbnN0cmF0ZScpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgncmVtb3ZlcyAubWQgZXh0ZW5zaW9uIGZvciBmaWxlcyBpbiAuY2xhdWRlL2FnZW50cy8nLCAoKSA9PiB7XG5cdFx0XHRjb25zdCB1cmkgPSBVUkkuZmlsZSgnL3dvcmtzcGFjZS8uY2xhdWRlL2FnZW50cy9jbGF1ZGUtYWdlbnQubWQnKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChnZXRDbGVhblByb21wdE5hbWUodXJpKSwgJ2NsYXVkZS1hZ2VudCcpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgncmVtb3ZlcyAubWQgZXh0ZW5zaW9uIGZvciBmaWxlcyBpbiB+Ly5jb3BpbG90L2FnZW50cy8nLCAoKSA9PiB7XG5cdFx0XHRjb25zdCB1cmkgPSBVUkkuZmlsZSgnL2hvbWUvdXNlci8uY29waWxvdC9hZ2VudHMvbXktYWdlbnQubWQnKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChnZXRDbGVhblByb21wdE5hbWUodXJpKSwgJ215LWFnZW50Jyk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdSRUFETUUubWQgaW4gLmdpdGh1Yi9hZ2VudHMvIHNob3VsZCBrZWVwIC5tZCBleHRlbnNpb24nLCAoKSA9PiB7XG5cdFx0XHRjb25zdCB1cmkgPSBVUkkuZmlsZSgnL3dvcmtzcGFjZS8uZ2l0aHViL2FnZW50cy9SRUFETUUubWQnKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChnZXRDbGVhblByb21wdE5hbWUodXJpKSwgJ1JFQURNRS5tZCcpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgncmVtb3ZlcyAubWQgZXh0ZW5zaW9uIGZvciBjb3BpbG90LWluc3RydWN0aW9ucy5tZCcsICgpID0+IHtcblx0XHRcdGNvbnN0IHVyaSA9IFVSSS5maWxlKCcvd29ya3NwYWNlLy5naXRodWIvY29waWxvdC1pbnN0cnVjdGlvbnMubWQnKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChnZXRDbGVhblByb21wdE5hbWUodXJpKSwgJ2NvcGlsb3QtaW5zdHJ1Y3Rpb25zJyk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdrZWVwcyAubWQgZXh0ZW5zaW9uIGZvciByZWd1bGFyIGZpbGVzJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgdXJpID0gVVJJLmZpbGUoJy93b3Jrc3BhY2UvUkVBRE1FLm1kJyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZ2V0Q2xlYW5Qcm9tcHROYW1lKHVyaSksICdSRUFETUUubWQnKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2tlZXBzIGZ1bGwgZmlsZW5hbWUgZm9yIGZpbGVzIHdpdGhvdXQga25vd24gZXh0ZW5zaW9ucycsICgpID0+IHtcblx0XHRcdGNvbnN0IHVyaSA9IFVSSS5maWxlKCcvd29ya3NwYWNlL3Rlc3QudHh0Jyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZ2V0Q2xlYW5Qcm9tcHROYW1lKHVyaSksICd0ZXN0LnR4dCcpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgncmV0dXJucyBmb2xkZXIgbmFtZSBmb3IgU0tJTEwubWQgKHVwcGVyY2FzZSknLCAoKSA9PiB7XG5cdFx0XHRjb25zdCB1cmkgPSBVUkkuZmlsZSgnL3dvcmtzcGFjZS8uZ2l0aHViL3NraWxscy90ZXN0L1NLSUxMLm1kJyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZ2V0Q2xlYW5Qcm9tcHROYW1lKHVyaSksICd0ZXN0Jyk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdyZXR1cm5zIGZvbGRlciBuYW1lIGZvciBza2lsbC5tZCAobG93ZXJjYXNlKScsICgpID0+IHtcblx0XHRcdGNvbnN0IHVyaSA9IFVSSS5maWxlKCcvd29ya3NwYWNlLy5naXRodWIvc2tpbGxzL215LXNraWxsL3NraWxsLm1kJyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZ2V0Q2xlYW5Qcm9tcHROYW1lKHVyaSksICdteS1za2lsbCcpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgncmV0dXJucyBmb2xkZXIgbmFtZSBmb3IgU2tpbGwubWQgKG1peGVkIGNhc2UpJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgdXJpID0gVVJJLmZpbGUoJy93b3Jrc3BhY2UvLmdpdGh1Yi9za2lsbHMvYW5vdGhlci1za2lsbC9Ta2lsbC5tZCcpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGdldENsZWFuUHJvbXB0TmFtZSh1cmkpLCAnYW5vdGhlci1za2lsbCcpO1xuXHRcdH0pO1xuXHR9KTtcblxuXHRzdWl0ZSgnaXNQcm9tcHRPckluc3RydWN0aW9uc0ZpbGUnLCAoKSA9PiB7XG5cdFx0dGVzdCgnU0tJTEwubWQgZmlsZXMgc2hvdWxkIHJldHVybiB0cnVlJywgKCkgPT4ge1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGlzUHJvbXB0T3JJbnN0cnVjdGlvbnNGaWxlKFVSSS5maWxlKCcvd29ya3NwYWNlLy5naXRodWIvc2tpbGxzL3Rlc3QvU0tJTEwubWQnKSksIHRydWUpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnc2tpbGwubWQgKGxvd2VyY2FzZSkgc2hvdWxkIHJldHVybiB0cnVlJywgKCkgPT4ge1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGlzUHJvbXB0T3JJbnN0cnVjdGlvbnNGaWxlKFVSSS5maWxlKCcvd29ya3NwYWNlLy5jbGF1ZGUvc2tpbGxzL215c2tpbGwvc2tpbGwubWQnKSksIHRydWUpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnU2tpbGwubWQgKG1peGVkIGNhc2UpIHNob3VsZCByZXR1cm4gdHJ1ZScsICgpID0+IHtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChpc1Byb21wdE9ySW5zdHJ1Y3Rpb25zRmlsZShVUkkuZmlsZSgnL3dvcmtzcGFjZS9za2lsbHMvU2tpbGwubWQnKSksIHRydWUpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgncmVndWxhciAubWQgZmlsZXMgc2hvdWxkIHJldHVybiBmYWxzZScsICgpID0+IHtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChpc1Byb21wdE9ySW5zdHJ1Y3Rpb25zRmlsZShVUkkuZmlsZSgnL3dvcmtzcGFjZS9TS0lMTDIubWQnKSksIGZhbHNlKTtcblx0XHR9KTtcblxuXHRcdC8vIE5vdGU6IEFueSAuanNvbiBmaWxlIHJldHVybnMgdHJ1ZSBiZWNhdXNlIGdldFByb21wdEZpbGVUeXBlIHJldHVybnMgaG9vayBmb3IgYWxsIEpTT04uXG5cdFx0Ly8gVGhlIGNhbGxlciBpcyByZXNwb25zaWJsZSBmb3Igb25seSBwYXNzaW5nIFVSSXMgZnJvbSB2YWxpZCBwcm9tcHQgc291cmNlIGZvbGRlcnMuXG5cdFx0dGVzdCgnYW55IC5qc29uIGZpbGUgc2hvdWxkIHJldHVybiB0cnVlJywgKCkgPT4ge1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGlzUHJvbXB0T3JJbnN0cnVjdGlvbnNGaWxlKFVSSS5maWxlKCcvd29ya3NwYWNlLy5naXRodWIvaG9va3MvY3VzdG9tLWhvb2tzLmpzb24nKSksIHRydWUpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGlzUHJvbXB0T3JJbnN0cnVjdGlvbnNGaWxlKFVSSS5maWxlKCcvd29ya3NwYWNlLy5jbGF1ZGUvc2V0dGluZ3MuanNvbicpKSwgdHJ1ZSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoaXNQcm9tcHRPckluc3RydWN0aW9uc0ZpbGUoVVJJLmZpbGUoJy93b3Jrc3BhY2UvLmNsYXVkZS9zZXR0aW5ncy5sb2NhbC5qc29uJykpLCB0cnVlKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChpc1Byb21wdE9ySW5zdHJ1Y3Rpb25zRmlsZShVUkkuZmlsZSgnL3dvcmtzcGFjZS9zZXR0aW5ncy5qc29uJykpLCB0cnVlKTtcblx0XHR9KTtcblx0fSk7XG5cblx0c3VpdGUoJ2lzU2tpbGxGaWxlbmFtZScsICgpID0+IHtcblx0XHR0ZXN0KCdTS0lMTC5tZCAodXBwZXJjYXNlKSBzaG91bGQgcmV0dXJuIHRydWUnLCAoKSA9PiB7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoaXNTa2lsbEZpbGVuYW1lKCdTS0lMTC5tZCcpLCB0cnVlKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3NraWxsLm1kIChsb3dlcmNhc2UpIHNob3VsZCByZXR1cm4gdHJ1ZScsICgpID0+IHtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChpc1NraWxsRmlsZW5hbWUoJ3NraWxsLm1kJyksIHRydWUpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnU2tpbGwubWQgKG1peGVkIGNhc2UpIHNob3VsZCByZXR1cm4gdHJ1ZScsICgpID0+IHtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChpc1NraWxsRmlsZW5hbWUoJ1NraWxsLm1kJyksIHRydWUpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnb3RoZXIgZmlsZW5hbWVzIHNob3VsZCByZXR1cm4gZmFsc2UnLCAoKSA9PiB7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoaXNTa2lsbEZpbGVuYW1lKCdSRUFETUUubWQnKSwgZmFsc2UpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGlzU2tpbGxGaWxlbmFtZSgnU0tJTEwudHh0JyksIGZhbHNlKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChpc1NraWxsRmlsZW5hbWUoJ215LXNraWxsLm1kJyksIGZhbHNlKTtcblx0XHR9KTtcblx0fSk7XG59KTtcbiJdLAogICJtYXBwaW5ncyI6ICJBQUtBLE9BQU8sWUFBWTtBQUNuQixTQUFTLFdBQVc7QUFDcEIsU0FBUywrQ0FBK0M7QUFDeEQsU0FBUyxtQkFBbUIsb0JBQW9CLDRCQUE0Qix1QkFBdUI7QUFDbkcsU0FBUyxtQkFBbUI7QUFFNUIsTUFBTSx1QkFBdUIsV0FBWTtBQUN4QywwQ0FBd0M7QUFFeEMsUUFBTSxxQkFBcUIsTUFBTTtBQUNoQyxTQUFLLG9CQUFvQixNQUFNO0FBQzlCLFlBQU0sTUFBTSxJQUFJLEtBQUssMkJBQTJCO0FBQ2hELGFBQU8sWUFBWSxrQkFBa0IsR0FBRyxHQUFHLFlBQVksTUFBTTtBQUFBLElBQzlELENBQUM7QUFFRCxTQUFLLDBCQUEwQixNQUFNO0FBQ3BDLFlBQU0sTUFBTSxJQUFJLEtBQUssaUNBQWlDO0FBQ3RELGFBQU8sWUFBWSxrQkFBa0IsR0FBRyxHQUFHLFlBQVksWUFBWTtBQUFBLElBQ3BFLENBQUM7QUFFRCxTQUFLLG1CQUFtQixNQUFNO0FBQzdCLFlBQU0sTUFBTSxJQUFJLEtBQUssMEJBQTBCO0FBQy9DLGFBQU8sWUFBWSxrQkFBa0IsR0FBRyxHQUFHLFlBQVksS0FBSztBQUFBLElBQzdE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
