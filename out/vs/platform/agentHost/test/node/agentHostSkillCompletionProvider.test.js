import assert from "assert";
import { CancellationToken } from "../../../../base/common/cancellation.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../base/test/common/utils.js";
import { NullLogService } from "../../../log/common/log.js";
import { SYNCED_CUSTOMIZATION_SCHEME } from "../../common/agentHostFileSystemService.js";
import { CompletionItemKind } from "../../common/state/protocol/commands.js";
import { CustomizationLoadStatus, CustomizationType, MessageAttachmentKind } from "../../common/state/sessionState.js";
import { CustomizationEnablementKind } from "../../common/state/protocol/state.js";
import { AgentHostCompletions, CompletionTriggerCharacter } from "../../node/agentHostCompletions.js";
import { AgentHostSkillCompletionProvider } from "../../node/agentHostSkillCompletionProvider.js";
import { MockAgent } from "./mockAgent.js";
suite("AgentHostSkillCompletionProvider", () => {
  const disposables = ensureNoDisposablesAreLeakedInTestSuite();
  function skill(name, description) {
    return {
      type: CustomizationType.Skill,
      id: `file:///skills/${name}/SKILL.md`,
      uri: `file:///skills/${name}/SKILL.md`,
      name,
      ...description !== void 0 ? { description } : {}
    };
  }
  function prompt(name) {
    return {
      type: CustomizationType.Prompt,
      id: `file:///prompts/${name}.md`,
      uri: `file:///prompts/${name}.md`,
      name
    };
  }
  function plugin(name, children, enabled = true) {
    return {
      type: CustomizationType.Plugin,
      id: `file:///plugins/${name}`,
      uri: `file:///plugins/${name}`,
      name,
      ...enabled ? {} : {
        // TODO: Step 2 selects the persisted enablement scope.
        enablement: [{ kind: CustomizationEnablementKind.Global, enabled: false }]
      },
      load: { kind: CustomizationLoadStatus.Loaded },
      ...children ? { children: [...children] } : {}
    };
  }
  function syncedPlugin(name, children) {
    return {
      ...plugin(name, children),
      id: `${SYNCED_CUSTOMIZATION_SCHEME}:/plugins/${name}`,
      uri: `${SYNCED_CUSTOMIZATION_SCHEME}:/plugins/${name}`
    };
  }
  function skillAt(name, uri, description) {
    return {
      type: CustomizationType.Skill,
      id: uri,
      uri,
      name,
      ...description !== void 0 ? { description } : {}
    };
  }
  function directory(name, uri, children) {
    return {
      type: CustomizationType.Directory,
      id: uri,
      uri,
      name,
      enabled: true,
      contents: CustomizationType.Skill,
      writable: false,
      load: { kind: CustomizationLoadStatus.Loaded },
      children: [...children]
    };
  }
  function createProvider(agent) {
    return disposables.add(new AgentHostSkillCompletionProvider(() => agent));
  }
  async function run(provider, text, offset = text.length) {
    return provider.provideCompletionItems({ kind: CompletionItemKind.UserMessage, channel: "mock:/session", text, offset }, CancellationToken.None);
  }
  test("announces slash as a trigger character", () => {
    const completions = disposables.add(new AgentHostCompletions(new NullLogService()));
    const provider = disposables.add(new AgentHostSkillCompletionProvider(() => void 0));
    disposables.add(completions.registerProvider(provider));
    assert.deepStrictEqual([...completions.triggerCharacters], [CompletionTriggerCharacter.Slash]);
  });
  test("complete skills from a plugin", async () => {
    const agent = new MockAgent("mock");
    agent.getSessionCustomizations = async () => [
      plugin("my-skill", [skill("agent-host-docs", "Use this skill when working on Agent Host code")])
    ];
    const provider = createProvider(agent);
    const result = await run(provider, "/");
    assert.deepStrictEqual(result, [{
      insertText: "/my-skill:agent-host-docs ",
      rangeStart: 0,
      rangeEnd: 1,
      attachment: {
        type: MessageAttachmentKind.Simple,
        label: "/my-skill:agent-host-docs",
        _meta: {
          uri: "file:///skills/agent-host-docs/SKILL.md",
          name: "agent-host-docs",
          displayName: "my-skill:agent-host-docs",
          description: "Use this skill when working on Agent Host code"
        }
      }
    }]);
  });
  test("complete skills from a plugin with the same name as the skill", async () => {
    const agent = new MockAgent("mock");
    agent.getSessionCustomizations = async () => [
      plugin("monitor-pr", [skill("monitor-pr", "Use this skill when working with PRs")])
    ];
    const provider = createProvider(agent);
    const result = await run(provider, "/");
    assert.deepStrictEqual(result, [{
      insertText: "/monitor-pr ",
      rangeStart: 0,
      rangeEnd: 1,
      attachment: {
        type: MessageAttachmentKind.Simple,
        label: "/monitor-pr",
        _meta: {
          uri: "file:///skills/monitor-pr/SKILL.md",
          name: "monitor-pr",
          displayName: "monitor-pr",
          description: "Use this skill when working with PRs"
        }
      }
    }]);
  });
  test("complete skills from a synced plugin without plugin prefix", async () => {
    const agent = new MockAgent("mock");
    agent.getSessionCustomizations = async () => [
      syncedPlugin("skills-bundle", [skill("monitor-pr", "Use this skill when working with PRs")])
    ];
    const provider = createProvider(agent);
    const result = await run(provider, "/");
    assert.deepStrictEqual(result, [{
      insertText: "/monitor-pr ",
      rangeStart: 0,
      rangeEnd: 1,
      attachment: {
        type: MessageAttachmentKind.Simple,
        label: "/monitor-pr",
        _meta: {
          uri: "file:///skills/monitor-pr/SKILL.md",
          name: "monitor-pr",
          displayName: "monitor-pr",
          description: "Use this skill when working with PRs"
        }
      }
    }]);
  });
  test("de-duplicates the same skill discovered via the synced bundle and the on-disk scan", async () => {
    const agent = new MockAgent("mock");
    agent.getSessionCustomizations = async () => [
      syncedPlugin("VS Code Synced Data", [skillAt("flaky-smoke-tests", "vscode-synced-customization:/plugins/bundle/skills/flaky-smoke-tests/SKILL.md", "Diagnose flaky tests")]),
      directory(".github", "file:///ws/.github/skills", [skillAt("flaky-smoke-tests", "file:///ws/.github/skills/flaky-smoke-tests/SKILL.md", "Diagnose flaky tests")])
    ];
    const provider = createProvider(agent);
    const result = await run(provider, "/");
    assert.deepStrictEqual(result.map((item) => item.insertText), ["/flaky-smoke-tests "]);
  });
  test("keeps two different skills that share a short name but have different descriptions", async () => {
    const agent = new MockAgent("mock");
    agent.getSessionCustomizations = async () => [
      directory(".copilot", "file:///home/.copilot/skills", [skillAt("update-skills", "file:///home/.copilot/skills/update-skills/SKILL.md", "Personal update-skills")]),
      directory(".github", "file:///ws/.github/skills", [skillAt("update-skills", "file:///ws/.github/skills/update-skills/SKILL.md", "Workspace update-skills")])
    ];
    const provider = createProvider(agent);
    const result = await run(provider, "/");
    assert.deepStrictEqual(result.map((item) => item.insertText), ["/update-skills ", "/update-skills "]);
  });
  test("collapses two same-named description-less skills (core-fix limitation, see Option B)", async () => {
    const agent = new MockAgent("mock");
    agent.getSessionCustomizations = async () => [
      directory(".copilot", "file:///home/.copilot/skills", [skillAt("update-skills", "file:///home/.copilot/skills/update-skills/SKILL.md")]),
      directory(".github", "file:///ws/.github/skills", [skillAt("update-skills", "file:///ws/.github/skills/update-skills/SKILL.md")])
    ];
    const provider = createProvider(agent);
    const result = await run(provider, "/");
    assert.deepStrictEqual(result.map((item) => item.insertText), ["/update-skills "]);
  });
  test("keeps same-named skills contributed by two different plugins", async () => {
    const agent = new MockAgent("mock");
    agent.getSessionCustomizations = async () => [
      plugin("plugin-a", [skillAt("review", "file:///plugins/plugin-a/skills/review/SKILL.md")]),
      plugin("plugin-b", [skillAt("review", "file:///plugins/plugin-b/skills/review/SKILL.md")])
    ];
    const provider = createProvider(agent);
    const result = await run(provider, "/");
    assert.deepStrictEqual(result.map((item) => item.insertText).sort(), ["/plugin-a:review ", "/plugin-b:review "]);
  });
  test("flattens skill children in session-effective order and ignores non-skill children", async () => {
    const agent = new MockAgent("mock");
    agent.getSessionCustomizations = async () => [
      plugin("first", [skill("session-skill"), prompt("ignored-prompt")]),
      plugin("second", [skill("global-skill")])
    ];
    const provider = createProvider(agent);
    const result = await run(provider, "/");
    assert.deepStrictEqual(result.map((item) => item.insertText), ["/first:session-skill ", "/second:global-skill "]);
  });
  test("ignores disabled customization containers", async () => {
    const agent = new MockAgent("mock");
    agent.getSessionCustomizations = async () => [
      plugin("disabled", [skill("hidden-skill")], false),
      plugin("enabled", [skill("visible-skill")])
    ];
    const provider = createProvider(agent);
    const result = await run(provider, "/");
    assert.deepStrictEqual(result.map((item) => item.insertText), ["/enabled:visible-skill "]);
  });
  test("returns an empty list when the agent has no session customizations hook", async () => {
    const agent = new MockAgent("mock");
    const provider = createProvider(agent);
    const result = await run(provider, "/");
    assert.deepStrictEqual(result, []);
  });
  test("filters skills by the typed slash prefix and replaces only that token", async () => {
    const agent = new MockAgent("mock");
    agent.getSessionCustomizations = async () => [plugin("skills", [skill("alpha"), skill("beta")])];
    const provider = createProvider(agent);
    const result = await run(provider, "/skills:b extra", "/skills:b".length);
    assert.deepStrictEqual(result.map((item) => ({ insertText: item.insertText, rangeStart: item.rangeStart, rangeEnd: item.rangeEnd })), [
      { insertText: "/skills:beta ", rangeStart: 0, rangeEnd: 9 }
    ]);
  });
  test("fuzzy matches skills by the typed slash token", async () => {
    const agent = new MockAgent("mock");
    agent.getSessionCustomizations = async () => [plugin("skills", [skill("fix-ci"), skill("other")])];
    const provider = createProvider(agent);
    const result = await run(provider, "/ci");
    assert.deepStrictEqual(result.map((item) => item.insertText), ["/skills:fix-ci "]);
  });
  test("filters skills by an in-message slash prefix and replaces only that token", async () => {
    const agent = new MockAgent("mock");
    agent.getSessionCustomizations = async () => [plugin("skills", [skill("alpha"), skill("beta")])];
    const provider = createProvider(agent);
    const text = "use /skills:b extra";
    const result = await run(provider, text, text.indexOf("/skills:b") + "/skills:b".length);
    assert.deepStrictEqual(result.map((item) => ({ insertText: item.insertText, rangeStart: item.rangeStart, rangeEnd: item.rangeEnd })), [
      { insertText: "/skills:beta ", rangeStart: 4, rangeEnd: 13 }
    ]);
  });
  test("returns skills for a slash token after whitespace", async () => {
    const agent = new MockAgent("mock");
    agent.getSessionCustomizations = async () => [plugin("skills", [skill("alpha"), skill("beta")])];
    const provider = createProvider(agent);
    const text = "use /";
    const result = await run(provider, text);
    assert.deepStrictEqual(result.map((item) => ({ insertText: item.insertText, rangeStart: item.rangeStart, rangeEnd: item.rangeEnd })), [
      { insertText: "/skills:alpha ", rangeStart: 4, rangeEnd: 5 },
      { insertText: "/skills:beta ", rangeStart: 4, rangeEnd: 5 }
    ]);
  });
  test("does not complete slash tokens embedded in non-whitespace text", async () => {
    const agent = new MockAgent("mock");
    agent.getSessionCustomizations = async () => [plugin("skills", [skill("alpha")])];
    const provider = createProvider(agent);
    const result = await run(provider, "foo/bar", "foo/bar".length);
    assert.deepStrictEqual(result, []);
  });
  test("returns an empty list when the cursor is past an in-message slash token", async () => {
    const agent = new MockAgent("mock");
    agent.getSessionCustomizations = async () => [plugin("skills", [skill("cached-skill")])];
    const provider = createProvider(agent);
    const text = "use /skills:cached-skill trailing";
    const result = await run(provider, text, text.indexOf("trailing"));
    assert.deepStrictEqual(result, []);
  });
  test("returns an empty list when the cursor is past the leading slash token", async () => {
    const agent = new MockAgent("mock");
    agent.getSessionCustomizations = async () => [plugin("skills", [skill("cached-skill")])];
    const provider = createProvider(agent);
    const text = "/skills:cached-skill trailing";
    const result = await run(provider, text, text.indexOf("trailing"));
    assert.deepStrictEqual(result, []);
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxwbGF0Zm9ybVxcYWdlbnRIb3N0XFx0ZXN0XFxub2RlXFxhZ2VudEhvc3RTa2lsbENvbXBsZXRpb25Qcm92aWRlci50ZXN0LnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IGFzc2VydCBmcm9tICdhc3NlcnQnO1xuaW1wb3J0IHsgQ2FuY2VsbGF0aW9uVG9rZW4gfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9jYW5jZWxsYXRpb24uanMnO1xuaW1wb3J0IHsgZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS90ZXN0L2NvbW1vbi91dGlscy5qcyc7XG5pbXBvcnQgeyBOdWxsTG9nU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL2xvZy9jb21tb24vbG9nLmpzJztcbmltcG9ydCB7IFNZTkNFRF9DVVNUT01JWkFUSU9OX1NDSEVNRSB9IGZyb20gJy4uLy4uL2NvbW1vbi9hZ2VudEhvc3RGaWxlU3lzdGVtU2VydmljZS5qcyc7XG5pbXBvcnQgeyBDb21wbGV0aW9uSXRlbUtpbmQgfSBmcm9tICcuLi8uLi9jb21tb24vc3RhdGUvcHJvdG9jb2wvY29tbWFuZHMuanMnO1xuaW1wb3J0IHsgQ3VzdG9taXphdGlvbkxvYWRTdGF0dXMsIEN1c3RvbWl6YXRpb25UeXBlLCBNZXNzYWdlQXR0YWNobWVudEtpbmQsIHR5cGUgRGlyZWN0b3J5Q3VzdG9taXphdGlvbiwgdHlwZSBQbHVnaW5DdXN0b21pemF0aW9uLCB0eXBlIFByb21wdEN1c3RvbWl6YXRpb24sIHR5cGUgU2tpbGxDdXN0b21pemF0aW9uIH0gZnJvbSAnLi4vLi4vY29tbW9uL3N0YXRlL3Nlc3Npb25TdGF0ZS5qcyc7XG5pbXBvcnQgeyBDdXN0b21pemF0aW9uRW5hYmxlbWVudEtpbmQgfSBmcm9tICcuLi8uLi9jb21tb24vc3RhdGUvcHJvdG9jb2wvc3RhdGUuanMnO1xuaW1wb3J0IHsgQWdlbnRIb3N0Q29tcGxldGlvbnMsIENvbXBsZXRpb25UcmlnZ2VyQ2hhcmFjdGVyIH0gZnJvbSAnLi4vLi4vbm9kZS9hZ2VudEhvc3RDb21wbGV0aW9ucy5qcyc7XG5pbXBvcnQgeyBBZ2VudEhvc3RTa2lsbENvbXBsZXRpb25Qcm92aWRlciB9IGZyb20gJy4uLy4uL25vZGUvYWdlbnRIb3N0U2tpbGxDb21wbGV0aW9uUHJvdmlkZXIuanMnO1xuaW1wb3J0IHsgTW9ja0FnZW50IH0gZnJvbSAnLi9tb2NrQWdlbnQuanMnO1xuXG5zdWl0ZSgnQWdlbnRIb3N0U2tpbGxDb21wbGV0aW9uUHJvdmlkZXInLCAoKSA9PiB7XG5cblx0Y29uc3QgZGlzcG9zYWJsZXMgPSBlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUoKTtcblxuXHRmdW5jdGlvbiBza2lsbChuYW1lOiBzdHJpbmcsIGRlc2NyaXB0aW9uPzogc3RyaW5nKTogU2tpbGxDdXN0b21pemF0aW9uIHtcblx0XHRyZXR1cm4ge1xuXHRcdFx0dHlwZTogQ3VzdG9taXphdGlvblR5cGUuU2tpbGwsXG5cdFx0XHRpZDogYGZpbGU6Ly8vc2tpbGxzLyR7bmFtZX0vU0tJTEwubWRgLFxuXHRcdFx0dXJpOiBgZmlsZTovLy9za2lsbHMvJHtuYW1lfS9TS0lMTC5tZGAsXG5cdFx0XHRuYW1lLFxuXHRcdFx0Li4uKGRlc2NyaXB0aW9uICE9PSB1bmRlZmluZWQgPyB7IGRlc2NyaXB0aW9uIH0gOiB7fSksXG5cdFx0fTtcblx0fVxuXG5cdGZ1bmN0aW9uIHByb21wdChuYW1lOiBzdHJpbmcpOiBQcm9tcHRDdXN0b21pemF0aW9uIHtcblx0XHRyZXR1cm4ge1xuXHRcdFx0dHlwZTogQ3VzdG9taXphdGlvblR5cGUuUHJvbXB0LFxuXHRcdFx0aWQ6IGBmaWxlOi8vL3Byb21wdHMvJHtuYW1lfS5tZGAsXG5cdFx0XHR1cmk6IGBmaWxlOi8vL3Byb21wdHMvJHtuYW1lfS5tZGAsXG5cdFx0XHRuYW1lLFxuXHRcdH07XG5cdH1cblxuXHRmdW5jdGlvbiBwbHVnaW4obmFtZTogc3RyaW5nLCBjaGlsZHJlbj86IHJlYWRvbmx5IChTa2lsbEN1c3RvbWl6YXRpb24gfCBQcm9tcHRDdXN0b21pemF0aW9uKVtdLCBlbmFibGVkID0gdHJ1ZSk6IFBsdWdpbkN1c3RvbWl6YXRpb24ge1xuXHRcdHJldHVybiB7XG5cdFx0XHR0eXBlOiBDdXN0b21pemF0aW9uVHlwZS5QbHVnaW4sXG5cdFx0XHRpZDogYGZpbGU6Ly8vcGx1Z2lucy8ke25hbWV9YCxcblx0XHRcdHVyaTogYGZpbGU6Ly8vcGx1Z2lucy8ke25hbWV9YCxcblx0XHRcdG5hbWUsXG5cdFx0XHQuLi4oZW5hYmxlZCA/IHt9IDoge1xuXHRcdFx0XHQvLyBUT0RPOiBTdGVwIDIgc2VsZWN0cyB0aGUgcGVyc2lzdGVkIGVuYWJsZW1lbnQgc2NvcGUuXG5cdFx0XHRcdGVuYWJsZW1lbnQ6IFt7IGtpbmQ6IEN1c3RvbWl6YXRpb25FbmFibGVtZW50S2luZC5HbG9iYWwsIGVuYWJsZWQ6IGZhbHNlIH1dLFxuXHRcdFx0fSksXG5cdFx0XHRsb2FkOiB7IGtpbmQ6IEN1c3RvbWl6YXRpb25Mb2FkU3RhdHVzLkxvYWRlZCB9LFxuXHRcdFx0Li4uKGNoaWxkcmVuID8geyBjaGlsZHJlbjogWy4uLmNoaWxkcmVuXSB9IDoge30pLFxuXHRcdH07XG5cdH1cblxuXHRmdW5jdGlvbiBzeW5jZWRQbHVnaW4obmFtZTogc3RyaW5nLCBjaGlsZHJlbj86IHJlYWRvbmx5IChTa2lsbEN1c3RvbWl6YXRpb24gfCBQcm9tcHRDdXN0b21pemF0aW9uKVtdKTogUGx1Z2luQ3VzdG9taXphdGlvbiB7XG5cdFx0cmV0dXJuIHtcblx0XHRcdC4uLnBsdWdpbihuYW1lLCBjaGlsZHJlbiksXG5cdFx0XHRpZDogYCR7U1lOQ0VEX0NVU1RPTUlaQVRJT05fU0NIRU1FfTovcGx1Z2lucy8ke25hbWV9YCxcblx0XHRcdHVyaTogYCR7U1lOQ0VEX0NVU1RPTUlaQVRJT05fU0NIRU1FfTovcGx1Z2lucy8ke25hbWV9YCxcblx0XHR9O1xuXHR9XG5cblx0LyoqIEEgc2tpbGwgd2l0aCBhbiBleHBsaWNpdCBVUkksIHNvIHRoZSBzYW1lIGxvZ2ljYWwgc2tpbGwgY2FuIGJlIG1vZGVsbGVkIGF0IHR3byBkaWZmZXJlbnQgbG9jYXRpb25zLiAqL1xuXHRmdW5jdGlvbiBza2lsbEF0KG5hbWU6IHN0cmluZywgdXJpOiBzdHJpbmcsIGRlc2NyaXB0aW9uPzogc3RyaW5nKTogU2tpbGxDdXN0b21pemF0aW9uIHtcblx0XHRyZXR1cm4ge1xuXHRcdFx0dHlwZTogQ3VzdG9taXphdGlvblR5cGUuU2tpbGwsXG5cdFx0XHRpZDogdXJpLFxuXHRcdFx0dXJpLFxuXHRcdFx0bmFtZSxcblx0XHRcdC4uLihkZXNjcmlwdGlvbiAhPT0gdW5kZWZpbmVkID8geyBkZXNjcmlwdGlvbiB9IDoge30pLFxuXHRcdH07XG5cdH1cblxuXHRmdW5jdGlvbiBkaXJlY3RvcnkobmFtZTogc3RyaW5nLCB1cmk6IHN0cmluZywgY2hpbGRyZW46IHJlYWRvbmx5IFNraWxsQ3VzdG9taXphdGlvbltdKTogRGlyZWN0b3J5Q3VzdG9taXphdGlvbiB7XG5cdFx0cmV0dXJuIHtcblx0XHRcdHR5cGU6IEN1c3RvbWl6YXRpb25UeXBlLkRpcmVjdG9yeSxcblx0XHRcdGlkOiB1cmksXG5cdFx0XHR1cmksXG5cdFx0XHRuYW1lLFxuXHRcdFx0ZW5hYmxlZDogdHJ1ZSxcblx0XHRcdGNvbnRlbnRzOiBDdXN0b21pemF0aW9uVHlwZS5Ta2lsbCxcblx0XHRcdHdyaXRhYmxlOiBmYWxzZSxcblx0XHRcdGxvYWQ6IHsga2luZDogQ3VzdG9taXphdGlvbkxvYWRTdGF0dXMuTG9hZGVkIH0sXG5cdFx0XHRjaGlsZHJlbjogWy4uLmNoaWxkcmVuXSxcblx0XHR9O1xuXHR9XG5cblx0ZnVuY3Rpb24gY3JlYXRlUHJvdmlkZXIoYWdlbnQ6IE1vY2tBZ2VudCk6IEFnZW50SG9zdFNraWxsQ29tcGxldGlvblByb3ZpZGVyIHtcblx0XHRyZXR1cm4gZGlzcG9zYWJsZXMuYWRkKG5ldyBBZ2VudEhvc3RTa2lsbENvbXBsZXRpb25Qcm92aWRlcigoKSA9PiBhZ2VudCkpO1xuXHR9XG5cblx0YXN5bmMgZnVuY3Rpb24gcnVuKHByb3ZpZGVyOiBBZ2VudEhvc3RTa2lsbENvbXBsZXRpb25Qcm92aWRlciwgdGV4dDogc3RyaW5nLCBvZmZzZXQgPSB0ZXh0Lmxlbmd0aCkge1xuXHRcdHJldHVybiBwcm92aWRlci5wcm92aWRlQ29tcGxldGlvbkl0ZW1zKHsga2luZDogQ29tcGxldGlvbkl0ZW1LaW5kLlVzZXJNZXNzYWdlLCBjaGFubmVsOiAnbW9jazovc2Vzc2lvbicsIHRleHQsIG9mZnNldCB9LCBDYW5jZWxsYXRpb25Ub2tlbi5Ob25lKTtcblx0fVxuXG5cdHRlc3QoJ2Fubm91bmNlcyBzbGFzaCBhcyBhIHRyaWdnZXIgY2hhcmFjdGVyJywgKCkgPT4ge1xuXHRcdGNvbnN0IGNvbXBsZXRpb25zID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBBZ2VudEhvc3RDb21wbGV0aW9ucyhuZXcgTnVsbExvZ1NlcnZpY2UoKSkpO1xuXHRcdGNvbnN0IHByb3ZpZGVyID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBBZ2VudEhvc3RTa2lsbENvbXBsZXRpb25Qcm92aWRlcigoKSA9PiB1bmRlZmluZWQpKTtcblx0XHRkaXNwb3NhYmxlcy5hZGQoY29tcGxldGlvbnMucmVnaXN0ZXJQcm92aWRlcihwcm92aWRlcikpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoWy4uLmNvbXBsZXRpb25zLnRyaWdnZXJDaGFyYWN0ZXJzXSwgW0NvbXBsZXRpb25UcmlnZ2VyQ2hhcmFjdGVyLlNsYXNoXSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2NvbXBsZXRlIHNraWxscyBmcm9tIGEgcGx1Z2luJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IGFnZW50ID0gbmV3IE1vY2tBZ2VudCgnbW9jaycpO1xuXHRcdGFnZW50LmdldFNlc3Npb25DdXN0b21pemF0aW9ucyA9IGFzeW5jICgpID0+IFtcblx0XHRcdHBsdWdpbignbXktc2tpbGwnLCBbc2tpbGwoJ2FnZW50LWhvc3QtZG9jcycsICdVc2UgdGhpcyBza2lsbCB3aGVuIHdvcmtpbmcgb24gQWdlbnQgSG9zdCBjb2RlJyldKSxcblx0XHRdO1xuXHRcdGNvbnN0IHByb3ZpZGVyID0gY3JlYXRlUHJvdmlkZXIoYWdlbnQpO1xuXG5cdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgcnVuKHByb3ZpZGVyLCAnLycpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChyZXN1bHQsIFt7XG5cdFx0XHRpbnNlcnRUZXh0OiAnL215LXNraWxsOmFnZW50LWhvc3QtZG9jcyAnLFxuXHRcdFx0cmFuZ2VTdGFydDogMCxcblx0XHRcdHJhbmdlRW5kOiAxLFxuXHRcdFx0YXR0YWNobWVudDoge1xuXHRcdFx0XHR0eXBlOiBNZXNzYWdlQXR0YWNobWVudEtpbmQuU2ltcGxlLFxuXHRcdFx0XHRsYWJlbDogJy9teS1za2lsbDphZ2VudC1ob3N0LWRvY3MnLFxuXHRcdFx0XHRfbWV0YToge1xuXHRcdFx0XHRcdHVyaTogJ2ZpbGU6Ly8vc2tpbGxzL2FnZW50LWhvc3QtZG9jcy9TS0lMTC5tZCcsXG5cdFx0XHRcdFx0bmFtZTogJ2FnZW50LWhvc3QtZG9jcycsXG5cdFx0XHRcdFx0ZGlzcGxheU5hbWU6ICdteS1za2lsbDphZ2VudC1ob3N0LWRvY3MnLFxuXHRcdFx0XHRcdGRlc2NyaXB0aW9uOiAnVXNlIHRoaXMgc2tpbGwgd2hlbiB3b3JraW5nIG9uIEFnZW50IEhvc3QgY29kZScsXG5cdFx0XHRcdH0sXG5cdFx0XHR9LFxuXHRcdH1dKTtcblx0fSk7XG5cblx0dGVzdCgnY29tcGxldGUgc2tpbGxzIGZyb20gYSBwbHVnaW4gd2l0aCB0aGUgc2FtZSBuYW1lIGFzIHRoZSBza2lsbCcsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBhZ2VudCA9IG5ldyBNb2NrQWdlbnQoJ21vY2snKTtcblx0XHRhZ2VudC5nZXRTZXNzaW9uQ3VzdG9taXphdGlvbnMgPSBhc3luYyAoKSA9PiBbXG5cdFx0XHRwbHVnaW4oJ21vbml0b3ItcHInLCBbc2tpbGwoJ21vbml0b3ItcHInLCAnVXNlIHRoaXMgc2tpbGwgd2hlbiB3b3JraW5nIHdpdGggUFJzJyldKSxcblx0XHRdO1xuXHRcdGNvbnN0IHByb3ZpZGVyID0gY3JlYXRlUHJvdmlkZXIoYWdlbnQpO1xuXG5cdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgcnVuKHByb3ZpZGVyLCAnLycpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChyZXN1bHQsIFt7XG5cdFx0XHRpbnNlcnRUZXh0OiAnL21vbml0b3ItcHIgJyxcblx0XHRcdHJhbmdlU3RhcnQ6IDAsXG5cdFx0XHRyYW5nZUVuZDogMSxcblx0XHRcdGF0dGFjaG1lbnQ6IHtcblx0XHRcdFx0dHlwZTogTWVzc2FnZUF0dGFjaG1lbnRLaW5kLlNpbXBsZSxcblx0XHRcdFx0bGFiZWw6ICcvbW9uaXRvci1wcicsXG5cdFx0XHRcdF9tZXRhOiB7XG5cdFx0XHRcdFx0dXJpOiAnZmlsZTovLy9za2lsbHMvbW9uaXRvci1wci9TS0lMTC5tZCcsXG5cdFx0XHRcdFx0bmFtZTogJ21vbml0b3ItcHInLFxuXHRcdFx0XHRcdGRpc3BsYXlOYW1lOiAnbW9uaXRvci1wcicsXG5cdFx0XHRcdFx0ZGVzY3JpcHRpb246ICdVc2UgdGhpcyBza2lsbCB3aGVuIHdvcmtpbmcgd2l0aCBQUnMnLFxuXHRcdFx0XHR9LFxuXHRcdFx0fSxcblx0XHR9XSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2NvbXBsZXRlIHNraWxscyBmcm9tIGEgc3luY2VkIHBsdWdpbiB3aXRob3V0IHBsdWdpbiBwcmVmaXgnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgYWdlbnQgPSBuZXcgTW9ja0FnZW50KCdtb2NrJyk7XG5cdFx0YWdlbnQuZ2V0U2Vzc2lvbkN1c3RvbWl6YXRpb25zID0gYXN5bmMgKCkgPT4gW1xuXHRcdFx0c3luY2VkUGx1Z2luKCdza2lsbHMtYnVuZGxlJywgW3NraWxsKCdtb25pdG9yLXByJywgJ1VzZSB0aGlzIHNraWxsIHdoZW4gd29ya2luZyB3aXRoIFBScycpXSksXG5cdFx0XTtcblx0XHRjb25zdCBwcm92aWRlciA9IGNyZWF0ZVByb3ZpZGVyKGFnZW50KTtcblxuXHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IHJ1bihwcm92aWRlciwgJy8nKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocmVzdWx0LCBbe1xuXHRcdFx0aW5zZXJ0VGV4dDogJy9tb25pdG9yLXByICcsXG5cdFx0XHRyYW5nZVN0YXJ0OiAwLFxuXHRcdFx0cmFuZ2VFbmQ6IDEsXG5cdFx0XHRhdHRhY2htZW50OiB7XG5cdFx0XHRcdHR5cGU6IE1lc3NhZ2VBdHRhY2htZW50S2luZC5TaW1wbGUsXG5cdFx0XHRcdGxhYmVsOiAnL21vbml0b3ItcHInLFxuXHRcdFx0XHRfbWV0YToge1xuXHRcdFx0XHRcdHVyaTogJ2ZpbGU6Ly8vc2tpbGxzL21vbml0b3ItcHIvU0tJTEwubWQnLFxuXHRcdFx0XHRcdG5hbWU6ICdtb25pdG9yLXByJyxcblx0XHRcdFx0XHRkaXNwbGF5TmFtZTogJ21vbml0b3ItcHInLFxuXHRcdFx0XHRcdGRlc2NyaXB0aW9uOiAnVXNlIHRoaXMgc2tpbGwgd2hlbiB3b3JraW5nIHdpdGggUFJzJyxcblx0XHRcdFx0fSxcblx0XHRcdH0sXG5cdFx0fV0pO1xuXHR9KTtcblxuXHR0ZXN0KCdkZS1kdXBsaWNhdGVzIHRoZSBzYW1lIHNraWxsIGRpc2NvdmVyZWQgdmlhIHRoZSBzeW5jZWQgYnVuZGxlIGFuZCB0aGUgb24tZGlzayBzY2FuJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IGFnZW50ID0gbmV3IE1vY2tBZ2VudCgnbW9jaycpO1xuXHRcdGFnZW50LmdldFNlc3Npb25DdXN0b21pemF0aW9ucyA9IGFzeW5jICgpID0+IFtcblx0XHRcdHN5bmNlZFBsdWdpbignVlMgQ29kZSBTeW5jZWQgRGF0YScsIFtza2lsbEF0KCdmbGFreS1zbW9rZS10ZXN0cycsICd2c2NvZGUtc3luY2VkLWN1c3RvbWl6YXRpb246L3BsdWdpbnMvYnVuZGxlL3NraWxscy9mbGFreS1zbW9rZS10ZXN0cy9TS0lMTC5tZCcsICdEaWFnbm9zZSBmbGFreSB0ZXN0cycpXSksXG5cdFx0XHRkaXJlY3RvcnkoJy5naXRodWInLCAnZmlsZTovLy93cy8uZ2l0aHViL3NraWxscycsIFtza2lsbEF0KCdmbGFreS1zbW9rZS10ZXN0cycsICdmaWxlOi8vL3dzLy5naXRodWIvc2tpbGxzL2ZsYWt5LXNtb2tlLXRlc3RzL1NLSUxMLm1kJywgJ0RpYWdub3NlIGZsYWt5IHRlc3RzJyldKSxcblx0XHRdO1xuXHRcdGNvbnN0IHByb3ZpZGVyID0gY3JlYXRlUHJvdmlkZXIoYWdlbnQpO1xuXG5cdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgcnVuKHByb3ZpZGVyLCAnLycpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChyZXN1bHQubWFwKGl0ZW0gPT4gaXRlbS5pbnNlcnRUZXh0KSwgWycvZmxha3ktc21va2UtdGVzdHMgJ10pO1xuXHR9KTtcblxuXHR0ZXN0KCdrZWVwcyB0d28gZGlmZmVyZW50IHNraWxscyB0aGF0IHNoYXJlIGEgc2hvcnQgbmFtZSBidXQgaGF2ZSBkaWZmZXJlbnQgZGVzY3JpcHRpb25zJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IGFnZW50ID0gbmV3IE1vY2tBZ2VudCgnbW9jaycpO1xuXHRcdGFnZW50LmdldFNlc3Npb25DdXN0b21pemF0aW9ucyA9IGFzeW5jICgpID0+IFtcblx0XHRcdGRpcmVjdG9yeSgnLmNvcGlsb3QnLCAnZmlsZTovLy9ob21lLy5jb3BpbG90L3NraWxscycsIFtza2lsbEF0KCd1cGRhdGUtc2tpbGxzJywgJ2ZpbGU6Ly8vaG9tZS8uY29waWxvdC9za2lsbHMvdXBkYXRlLXNraWxscy9TS0lMTC5tZCcsICdQZXJzb25hbCB1cGRhdGUtc2tpbGxzJyldKSxcblx0XHRcdGRpcmVjdG9yeSgnLmdpdGh1YicsICdmaWxlOi8vL3dzLy5naXRodWIvc2tpbGxzJywgW3NraWxsQXQoJ3VwZGF0ZS1za2lsbHMnLCAnZmlsZTovLy93cy8uZ2l0aHViL3NraWxscy91cGRhdGUtc2tpbGxzL1NLSUxMLm1kJywgJ1dvcmtzcGFjZSB1cGRhdGUtc2tpbGxzJyldKSxcblx0XHRdO1xuXHRcdGNvbnN0IHByb3ZpZGVyID0gY3JlYXRlUHJvdmlkZXIoYWdlbnQpO1xuXG5cdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgcnVuKHByb3ZpZGVyLCAnLycpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChyZXN1bHQubWFwKGl0ZW0gPT4gaXRlbS5pbnNlcnRUZXh0KSwgWycvdXBkYXRlLXNraWxscyAnLCAnL3VwZGF0ZS1za2lsbHMgJ10pO1xuXHR9KTtcblxuXHQvLyBLbm93biBsaW1pdGF0aW9uIG9mIHRoZSBjb3JlIGZpeDogdHdvIGRpc3RpbmN0IHNhbWUtbmFtZWQgc2tpbGxzIHRoYXQgYm90aCBvbWl0IGEgZGVzY3JpcHRpb25cblx0Ly8gcHJvZHVjZSB0aGUgc2FtZSBpZGVudGl0eSBrZXkgYW5kIGNvbGxhcHNlIHRvIG9uZS4gVGhlcmUgaXMgbm8gcmVhY2hhYmlsaXR5IGxvc3MgKGEgYmFyZSBgL1hgXG5cdC8vIHJlc29sdmVzIHRvIGV4YWN0bHkgb25lIHNraWxsIGF0IHRoZSBDTEkgcmVnYXJkbGVzcyk7IE9wdGlvbiBCIGRpc2FtYmlndWF0ZXMgdmlhIGEgcXVhbGlmaWVkIGluc2VydC5cblx0dGVzdCgnY29sbGFwc2VzIHR3byBzYW1lLW5hbWVkIGRlc2NyaXB0aW9uLWxlc3Mgc2tpbGxzIChjb3JlLWZpeCBsaW1pdGF0aW9uLCBzZWUgT3B0aW9uIEIpJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IGFnZW50ID0gbmV3IE1vY2tBZ2VudCgnbW9jaycpO1xuXHRcdGFnZW50LmdldFNlc3Npb25DdXN0b21pemF0aW9ucyA9IGFzeW5jICgpID0+IFtcblx0XHRcdGRpcmVjdG9yeSgnLmNvcGlsb3QnLCAnZmlsZTovLy9ob21lLy5jb3BpbG90L3NraWxscycsIFtza2lsbEF0KCd1cGRhdGUtc2tpbGxzJywgJ2ZpbGU6Ly8vaG9tZS8uY29waWxvdC9za2lsbHMvdXBkYXRlLXNraWxscy9TS0lMTC5tZCcpXSksXG5cdFx0XHRkaXJlY3RvcnkoJy5naXRodWInLCAnZmlsZTovLy93cy8uZ2l0aHViL3NraWxscycsIFtza2lsbEF0KCd1cGRhdGUtc2tpbGxzJywgJ2ZpbGU6Ly8vd3MvLmdpdGh1Yi9za2lsbHMvdXBkYXRlLXNraWxscy9TS0lMTC5tZCcpXSksXG5cdFx0XTtcblx0XHRjb25zdCBwcm92aWRlciA9IGNyZWF0ZVByb3ZpZGVyKGFnZW50KTtcblxuXHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IHJ1bihwcm92aWRlciwgJy8nKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocmVzdWx0Lm1hcChpdGVtID0+IGl0ZW0uaW5zZXJ0VGV4dCksIFsnL3VwZGF0ZS1za2lsbHMgJ10pO1xuXHR9KTtcblxuXHR0ZXN0KCdrZWVwcyBzYW1lLW5hbWVkIHNraWxscyBjb250cmlidXRlZCBieSB0d28gZGlmZmVyZW50IHBsdWdpbnMnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgYWdlbnQgPSBuZXcgTW9ja0FnZW50KCdtb2NrJyk7XG5cdFx0YWdlbnQuZ2V0U2Vzc2lvbkN1c3RvbWl6YXRpb25zID0gYXN5bmMgKCkgPT4gW1xuXHRcdFx0cGx1Z2luKCdwbHVnaW4tYScsIFtza2lsbEF0KCdyZXZpZXcnLCAnZmlsZTovLy9wbHVnaW5zL3BsdWdpbi1hL3NraWxscy9yZXZpZXcvU0tJTEwubWQnKV0pLFxuXHRcdFx0cGx1Z2luKCdwbHVnaW4tYicsIFtza2lsbEF0KCdyZXZpZXcnLCAnZmlsZTovLy9wbHVnaW5zL3BsdWdpbi1iL3NraWxscy9yZXZpZXcvU0tJTEwubWQnKV0pLFxuXHRcdF07XG5cdFx0Y29uc3QgcHJvdmlkZXIgPSBjcmVhdGVQcm92aWRlcihhZ2VudCk7XG5cblx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCBydW4ocHJvdmlkZXIsICcvJyk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHJlc3VsdC5tYXAoaXRlbSA9PiBpdGVtLmluc2VydFRleHQpLnNvcnQoKSwgWycvcGx1Z2luLWE6cmV2aWV3ICcsICcvcGx1Z2luLWI6cmV2aWV3ICddKTtcblx0fSk7XG5cblx0dGVzdCgnZmxhdHRlbnMgc2tpbGwgY2hpbGRyZW4gaW4gc2Vzc2lvbi1lZmZlY3RpdmUgb3JkZXIgYW5kIGlnbm9yZXMgbm9uLXNraWxsIGNoaWxkcmVuJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IGFnZW50ID0gbmV3IE1vY2tBZ2VudCgnbW9jaycpO1xuXHRcdGFnZW50LmdldFNlc3Npb25DdXN0b21pemF0aW9ucyA9IGFzeW5jICgpID0+IFtcblx0XHRcdHBsdWdpbignZmlyc3QnLCBbc2tpbGwoJ3Nlc3Npb24tc2tpbGwnKSwgcHJvbXB0KCdpZ25vcmVkLXByb21wdCcpXSksXG5cdFx0XHRwbHVnaW4oJ3NlY29uZCcsIFtza2lsbCgnZ2xvYmFsLXNraWxsJyldKSxcblx0XHRdO1xuXHRcdGNvbnN0IHByb3ZpZGVyID0gY3JlYXRlUHJvdmlkZXIoYWdlbnQpO1xuXG5cdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgcnVuKHByb3ZpZGVyLCAnLycpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChyZXN1bHQubWFwKGl0ZW0gPT4gaXRlbS5pbnNlcnRUZXh0KSwgWycvZmlyc3Q6c2Vzc2lvbi1za2lsbCAnLCAnL3NlY29uZDpnbG9iYWwtc2tpbGwgJ10pO1xuXHR9KTtcblxuXHR0ZXN0KCdpZ25vcmVzIGRpc2FibGVkIGN1c3RvbWl6YXRpb24gY29udGFpbmVycycsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBhZ2VudCA9IG5ldyBNb2NrQWdlbnQoJ21vY2snKTtcblx0XHRhZ2VudC5nZXRTZXNzaW9uQ3VzdG9taXphdGlvbnMgPSBhc3luYyAoKSA9PiBbXG5cdFx0XHRwbHVnaW4oJ2Rpc2FibGVkJywgW3NraWxsKCdoaWRkZW4tc2tpbGwnKV0sIGZhbHNlKSxcblx0XHRcdHBsdWdpbignZW5hYmxlZCcsIFtza2lsbCgndmlzaWJsZS1za2lsbCcpXSksXG5cdFx0XTtcblx0XHRjb25zdCBwcm92aWRlciA9IGNyZWF0ZVByb3ZpZGVyKGFnZW50KTtcblxuXHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IHJ1bihwcm92aWRlciwgJy8nKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocmVzdWx0Lm1hcChpdGVtID0+IGl0ZW0uaW5zZXJ0VGV4dCksIFsnL2VuYWJsZWQ6dmlzaWJsZS1za2lsbCAnXSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3JldHVybnMgYW4gZW1wdHkgbGlzdCB3aGVuIHRoZSBhZ2VudCBoYXMgbm8gc2Vzc2lvbiBjdXN0b21pemF0aW9ucyBob29rJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IGFnZW50ID0gbmV3IE1vY2tBZ2VudCgnbW9jaycpO1xuXHRcdGNvbnN0IHByb3ZpZGVyID0gY3JlYXRlUHJvdmlkZXIoYWdlbnQpO1xuXG5cdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgcnVuKHByb3ZpZGVyLCAnLycpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChyZXN1bHQsIFtdKTtcblx0fSk7XG5cblx0dGVzdCgnZmlsdGVycyBza2lsbHMgYnkgdGhlIHR5cGVkIHNsYXNoIHByZWZpeCBhbmQgcmVwbGFjZXMgb25seSB0aGF0IHRva2VuJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IGFnZW50ID0gbmV3IE1vY2tBZ2VudCgnbW9jaycpO1xuXHRcdGFnZW50LmdldFNlc3Npb25DdXN0b21pemF0aW9ucyA9IGFzeW5jICgpID0+IFtwbHVnaW4oJ3NraWxscycsIFtza2lsbCgnYWxwaGEnKSwgc2tpbGwoJ2JldGEnKV0pXTtcblx0XHRjb25zdCBwcm92aWRlciA9IGNyZWF0ZVByb3ZpZGVyKGFnZW50KTtcblxuXHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IHJ1bihwcm92aWRlciwgJy9za2lsbHM6YiBleHRyYScsICcvc2tpbGxzOmInLmxlbmd0aCk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHJlc3VsdC5tYXAoaXRlbSA9PiAoeyBpbnNlcnRUZXh0OiBpdGVtLmluc2VydFRleHQsIHJhbmdlU3RhcnQ6IGl0ZW0ucmFuZ2VTdGFydCwgcmFuZ2VFbmQ6IGl0ZW0ucmFuZ2VFbmQgfSkpLCBbXG5cdFx0XHR7IGluc2VydFRleHQ6ICcvc2tpbGxzOmJldGEgJywgcmFuZ2VTdGFydDogMCwgcmFuZ2VFbmQ6IDkgfSxcblx0XHRdKTtcblx0fSk7XG5cblx0dGVzdCgnZnV6enkgbWF0Y2hlcyBza2lsbHMgYnkgdGhlIHR5cGVkIHNsYXNoIHRva2VuJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IGFnZW50ID0gbmV3IE1vY2tBZ2VudCgnbW9jaycpO1xuXHRcdGFnZW50LmdldFNlc3Npb25DdXN0b21pemF0aW9ucyA9IGFzeW5jICgpID0+IFtwbHVnaW4oJ3NraWxscycsIFtza2lsbCgnZml4LWNpJyksIHNraWxsKCdvdGhlcicpXSldO1xuXHRcdGNvbnN0IHByb3ZpZGVyID0gY3JlYXRlUHJvdmlkZXIoYWdlbnQpO1xuXG5cdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgcnVuKHByb3ZpZGVyLCAnL2NpJyk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHJlc3VsdC5tYXAoaXRlbSA9PiBpdGVtLmluc2VydFRleHQpLCBbJy9za2lsbHM6Zml4LWNpICddKTtcblx0fSk7XG5cblx0dGVzdCgnZmlsdGVycyBza2lsbHMgYnkgYW4gaW4tbWVzc2FnZSBzbGFzaCBwcmVmaXggYW5kIHJlcGxhY2VzIG9ubHkgdGhhdCB0b2tlbicsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBhZ2VudCA9IG5ldyBNb2NrQWdlbnQoJ21vY2snKTtcblx0XHRhZ2VudC5nZXRTZXNzaW9uQ3VzdG9taXphdGlvbnMgPSBhc3luYyAoKSA9PiBbcGx1Z2luKCdza2lsbHMnLCBbc2tpbGwoJ2FscGhhJyksIHNraWxsKCdiZXRhJyldKV07XG5cdFx0Y29uc3QgcHJvdmlkZXIgPSBjcmVhdGVQcm92aWRlcihhZ2VudCk7XG5cdFx0Y29uc3QgdGV4dCA9ICd1c2UgL3NraWxsczpiIGV4dHJhJztcblxuXHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IHJ1bihwcm92aWRlciwgdGV4dCwgdGV4dC5pbmRleE9mKCcvc2tpbGxzOmInKSArICcvc2tpbGxzOmInLmxlbmd0aCk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHJlc3VsdC5tYXAoaXRlbSA9PiAoeyBpbnNlcnRUZXh0OiBpdGVtLmluc2VydFRleHQsIHJhbmdlU3RhcnQ6IGl0ZW0ucmFuZ2VTdGFydCwgcmFuZ2VFbmQ6IGl0ZW0ucmFuZ2VFbmQgfSkpLCBbXG5cdFx0XHR7IGluc2VydFRleHQ6ICcvc2tpbGxzOmJldGEgJywgcmFuZ2VTdGFydDogNCwgcmFuZ2VFbmQ6IDEzIH0sXG5cdFx0XSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3JldHVybnMgc2tpbGxzIGZvciBhIHNsYXNoIHRva2VuIGFmdGVyIHdoaXRlc3BhY2UnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgYWdlbnQgPSBuZXcgTW9ja0FnZW50KCdtb2NrJyk7XG5cdFx0YWdlbnQuZ2V0U2Vzc2lvbkN1c3RvbWl6YXRpb25zID0gYXN5bmMgKCkgPT4gW3BsdWdpbignc2tpbGxzJywgW3NraWxsKCdhbHBoYScpLCBza2lsbCgnYmV0YScpXSldO1xuXHRcdGNvbnN0IHByb3ZpZGVyID0gY3JlYXRlUHJvdmlkZXIoYWdlbnQpO1xuXHRcdGNvbnN0IHRleHQgPSAndXNlIC8nO1xuXG5cdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgcnVuKHByb3ZpZGVyLCB0ZXh0KTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocmVzdWx0Lm1hcChpdGVtID0+ICh7IGluc2VydFRleHQ6IGl0ZW0uaW5zZXJ0VGV4dCwgcmFuZ2VTdGFydDogaXRlbS5yYW5nZVN0YXJ0LCByYW5nZUVuZDogaXRlbS5yYW5nZUVuZCB9KSksIFtcblx0XHRcdHsgaW5zZXJ0VGV4dDogJy9za2lsbHM6YWxwaGEgJywgcmFuZ2VTdGFydDogNCwgcmFuZ2VFbmQ6IDUgfSxcblx0XHRcdHsgaW5zZXJ0VGV4dDogJy9za2lsbHM6YmV0YSAnLCByYW5nZVN0YXJ0OiA0LCByYW5nZUVuZDogNSB9LFxuXHRcdF0pO1xuXHR9KTtcblxuXHR0ZXN0KCdkb2VzIG5vdCBjb21wbGV0ZSBzbGFzaCB0b2tlbnMgZW1iZWRkZWQgaW4gbm9uLXdoaXRlc3BhY2UgdGV4dCcsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBhZ2VudCA9IG5ldyBNb2NrQWdlbnQoJ21vY2snKTtcblx0XHRhZ2VudC5nZXRTZXNzaW9uQ3VzdG9taXphdGlvbnMgPSBhc3luYyAoKSA9PiBbcGx1Z2luKCdza2lsbHMnLCBbc2tpbGwoJ2FscGhhJyldKV07XG5cdFx0Y29uc3QgcHJvdmlkZXIgPSBjcmVhdGVQcm92aWRlcihhZ2VudCk7XG5cblx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCBydW4ocHJvdmlkZXIsICdmb28vYmFyJywgJ2Zvby9iYXInLmxlbmd0aCk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHJlc3VsdCwgW10pO1xuXHR9KTtcblxuXHR0ZXN0KCdyZXR1cm5zIGFuIGVtcHR5IGxpc3Qgd2hlbiB0aGUgY3Vyc29yIGlzIHBhc3QgYW4gaW4tbWVzc2FnZSBzbGFzaCB0b2tlbicsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBhZ2VudCA9IG5ldyBNb2NrQWdlbnQoJ21vY2snKTtcblx0XHRhZ2VudC5nZXRTZXNzaW9uQ3VzdG9taXphdGlvbnMgPSBhc3luYyAoKSA9PiBbcGx1Z2luKCdza2lsbHMnLCBbc2tpbGwoJ2NhY2hlZC1za2lsbCcpXSldO1xuXHRcdGNvbnN0IHByb3ZpZGVyID0gY3JlYXRlUHJvdmlkZXIoYWdlbnQpO1xuXHRcdGNvbnN0IHRleHQgPSAndXNlIC9za2lsbHM6Y2FjaGVkLXNraWxsIHRyYWlsaW5nJztcblxuXHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IHJ1bihwcm92aWRlciwgdGV4dCwgdGV4dC5pbmRleE9mKCd0cmFpbGluZycpKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocmVzdWx0LCBbXSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3JldHVybnMgYW4gZW1wdHkgbGlzdCB3aGVuIHRoZSBjdXJzb3IgaXMgcGFzdCB0aGUgbGVhZGluZyBzbGFzaCB0b2tlbicsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBhZ2VudCA9IG5ldyBNb2NrQWdlbnQoJ21vY2snKTtcblx0XHRhZ2VudC5nZXRTZXNzaW9uQ3VzdG9taXphdGlvbnMgPSBhc3luYyAoKSA9PiBbcGx1Z2luKCdza2lsbHMnLCBbc2tpbGwoJ2NhY2hlZC1za2lsbCcpXSldO1xuXHRcdGNvbnN0IHByb3ZpZGVyID0gY3JlYXRlUHJvdmlkZXIoYWdlbnQpO1xuXHRcdGNvbnN0IHRleHQgPSAnL3NraWxsczpjYWNoZWQtc2tpbGwgdHJhaWxpbmcnO1xuXG5cdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgcnVuKHByb3ZpZGVyLCB0ZXh0LCB0ZXh0LmluZGV4T2YoJ3RyYWlsaW5nJykpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChyZXN1bHQsIFtdKTtcblx0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
