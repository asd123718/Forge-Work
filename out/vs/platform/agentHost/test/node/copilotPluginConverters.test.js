import assert from "assert";
import { writeFileSync, unlinkSync } from "fs";
import { fileURLToPath } from "url";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../base/test/common/utils.js";
import { DisposableStore } from "../../../../base/common/lifecycle.js";
import { Schemas } from "../../../../base/common/network.js";
import { URI } from "../../../../base/common/uri.js";
import { VSBuffer } from "../../../../base/common/buffer.js";
import { FileService } from "../../../files/common/fileService.js";
import { InMemoryFileSystemProvider } from "../../../files/common/inMemoryFilesystemProvider.js";
import { NullLogService } from "../../../log/common/log.js";
import { McpServerType } from "../../../mcp/common/mcpPlatformTypes.js";
import { toSdkInstructionDirectories, toSdkMcpServers, toSdkCustomAgents, toSdkSessionCustomAgents, toSdkSkillDirectories, parsedPluginsEqual, toSdkHooks } from "../../node/copilot/copilotPluginConverters.js";
import { PluginFormat } from "../../../agentPlugins/common/pluginParsers.js";
import { CustomizationType, McpServerStatus } from "../../common/state/protocol/state.js";
function stubMcpCustomization(name = "test") {
  return { type: CustomizationType.McpServer, id: `mcp:${name}`, uri: "file:///plugin", name, state: { kind: McpServerStatus.Starting } };
}
function stubHookCustomization(type) {
  return { type: CustomizationType.Hook, id: `hook:${type}`, uri: "file:///plugin/hooks.json", name: "hooks.json" };
}
function stubSkillCustomization(name) {
  return { type: CustomizationType.Skill, id: `skill:${name}`, uri: `file:///${name}/SKILL.md`, name };
}
suite("copilotPluginConverters", () => {
  const disposables = new DisposableStore();
  let fileService;
  setup(() => {
    fileService = disposables.add(new FileService(new NullLogService()));
    disposables.add(fileService.registerProvider(Schemas.inMemory, disposables.add(new InMemoryFileSystemProvider())));
  });
  teardown(() => disposables.clear());
  ensureNoDisposablesAreLeakedInTestSuite();
  suite("toSdkMcpServers", () => {
    test("converts local server definitions", () => {
      const defs = [{
        name: "test-server",
        uri: URI.file("/plugin"),
        configuration: {
          type: McpServerType.LOCAL,
          command: "node",
          args: ["server.js", "--port", "3000"],
          env: { NODE_ENV: "production", PORT: 3e3 },
          cwd: "/workspace"
        },
        customization: stubMcpCustomization("test-server")
      }];
      const result = toSdkMcpServers(defs);
      assert.deepStrictEqual(result, {
        "test-server": {
          type: "local",
          command: "node",
          args: ["server.js", "--port", "3000"],
          tools: ["*"],
          env: { NODE_ENV: "production", PORT: "3000" },
          cwd: "/workspace"
        }
      });
    });
    test("converts remote/http server definitions", () => {
      const defs = [{
        name: "remote-server",
        uri: URI.file("/plugin"),
        configuration: {
          type: McpServerType.REMOTE,
          url: "https://example.com/mcp",
          headers: { "Authorization": "Bearer token" }
        },
        customization: stubMcpCustomization("remote-server")
      }];
      const result = toSdkMcpServers(defs);
      assert.deepStrictEqual(result, {
        "remote-server": {
          type: "http",
          url: "https://example.com/mcp",
          tools: ["*"],
          headers: { "Authorization": "Bearer token" }
        }
      });
    });
    test("handles empty definitions", () => {
      const result = toSdkMcpServers([]);
      assert.deepStrictEqual(result, {});
    });
    test("omits optional fields when undefined", () => {
      const defs = [{
        name: "minimal",
        uri: URI.file("/plugin"),
        configuration: {
          type: McpServerType.LOCAL,
          command: "echo"
        },
        customization: stubMcpCustomization("minimal")
      }];
      const result = toSdkMcpServers(defs);
      assert.strictEqual(result["minimal"].type, "local");
      assert.deepStrictEqual(result["minimal"].args, []);
      assert.strictEqual(Object.hasOwn(result["minimal"], "env"), false);
      assert.strictEqual(Object.hasOwn(result["minimal"], "cwd"), false);
    });
    test("filters null values from env", () => {
      const defs = [{
        name: "with-null-env",
        uri: URI.file("/plugin"),
        configuration: {
          type: McpServerType.LOCAL,
          command: "test",
          env: { KEEP: "value", DROP: null }
        },
        customization: stubMcpCustomization("with-null-env")
      }];
      const result = toSdkMcpServers(defs);
      const env = result["with-null-env"].env;
      assert.deepStrictEqual(env, { KEEP: "value" });
    });
  });
  suite("toSdkCustomAgents", () => {
    test("reads agent files without frontmatter and creates configs", async () => {
      const agentUri = URI.from({ scheme: Schemas.inMemory, path: "/agents/helper.md" });
      await fileService.writeFile(agentUri, VSBuffer.fromString("You are a helpful assistant"));
      const agents = [{ uri: agentUri, name: "helper" }];
      const result = await toSdkCustomAgents(agents, fileService);
      assert.deepStrictEqual(result, [{
        name: "helper",
        tools: null,
        prompt: "You are a helpful assistant"
      }]);
    });
    test("skips agents whose files cannot be read", async () => {
      const agents = [
        { uri: URI.from({ scheme: Schemas.inMemory, path: "/nonexistent/agent.md" }), name: "missing" }
      ];
      const result = await toSdkCustomAgents(agents, fileService);
      assert.deepStrictEqual(result, []);
    });
    test("processes multiple agents, skipping failures", async () => {
      const goodUri = URI.from({ scheme: Schemas.inMemory, path: "/agents/good.md" });
      await fileService.writeFile(goodUri, VSBuffer.fromString("Good agent"));
      const agents = [
        { uri: goodUri, name: "good" },
        { uri: URI.from({ scheme: Schemas.inMemory, path: "/agents/bad.md" }), name: "bad" }
      ];
      const result = await toSdkCustomAgents(agents, fileService);
      assert.strictEqual(result.length, 1);
      assert.strictEqual(result[0].name, "good");
    });
    test("parses YAML frontmatter for name, description, tools, and body", async () => {
      const agentUri = URI.from({ scheme: Schemas.inMemory, path: "/agents/review.md" });
      await fileService.writeFile(agentUri, VSBuffer.fromString([
        "---",
        "name: code-reviewer",
        "description: Reviews code for quality issues",
        "tools:",
        "  - read_file",
        "  - grep_search",
        "---",
        "You are a meticulous code reviewer.",
        ""
      ].join("\n")));
      const agents = [{ uri: agentUri, name: "review" }];
      const result = await toSdkCustomAgents(agents, fileService);
      assert.deepStrictEqual(result, [{
        name: "code-reviewer",
        description: "Reviews code for quality issues",
        tools: ["read_file", "grep_search"],
        prompt: "You are a meticulous code reviewer.\n"
      }]);
    });
    test("parses skills and infer from frontmatter", async () => {
      const agentUri = URI.from({ scheme: Schemas.inMemory, path: "/agents/skilled.md" });
      await fileService.writeFile(agentUri, VSBuffer.fromString([
        "---",
        "name: skilled",
        "skills:",
        "  - baking-cake",
        "  - cooking-pasta",
        "infer: true",
        "---",
        "Body."
      ].join("\n")));
      const agents = [{ uri: agentUri, name: "skilled" }];
      const result = await toSdkCustomAgents(agents, fileService);
      assert.deepStrictEqual(result, [{
        name: "skilled",
        tools: null,
        skills: ["baking-cake", "cooking-pasta"],
        infer: true,
        prompt: "Body."
      }]);
    });
    test("infer defaults to false when disable-model-invocation is set", async () => {
      const agentUri = URI.from({ scheme: Schemas.inMemory, path: "/agents/no-invoke.md" });
      await fileService.writeFile(agentUri, VSBuffer.fromString([
        "---",
        "name: no-invoke",
        "disable-model-invocation: true",
        "---",
        "Body."
      ].join("\n")));
      const agents = [{ uri: agentUri, name: "no-invoke" }];
      const result = await toSdkCustomAgents(agents, fileService);
      assert.deepStrictEqual(result, [{
        name: "no-invoke",
        tools: null,
        infer: false,
        prompt: "Body."
      }]);
    });
    test("omits skills and infer when frontmatter does not specify them", async () => {
      const agentUri = URI.from({ scheme: Schemas.inMemory, path: "/agents/plain.md" });
      await fileService.writeFile(agentUri, VSBuffer.fromString([
        "---",
        "name: plain",
        "---",
        "Body."
      ].join("\n")));
      const agents = [{ uri: agentUri, name: "plain" }];
      const result = await toSdkCustomAgents(agents, fileService);
      assert.strictEqual(Object.hasOwn(result[0], "skills"), false);
      assert.strictEqual(Object.hasOwn(result[0], "infer"), false);
    });
    test("empty tools array becomes null (all tools)", async () => {
      const agentUri = URI.from({ scheme: Schemas.inMemory, path: "/agents/empty-tools.md" });
      await fileService.writeFile(agentUri, VSBuffer.fromString([
        "---",
        "name: free-for-all",
        "tools: []",
        "---",
        "Body."
      ].join("\n")));
      const agents = [{ uri: agentUri, name: "fallback" }];
      const result = await toSdkCustomAgents(agents, fileService);
      assert.deepStrictEqual(result, [{
        name: "free-for-all",
        tools: null,
        prompt: "Body."
      }]);
    });
    test("falls back to resource name when frontmatter omits name", async () => {
      const agentUri = URI.from({ scheme: Schemas.inMemory, path: "/agents/no-name.md" });
      await fileService.writeFile(agentUri, VSBuffer.fromString([
        "---",
        "description: Helper without an explicit name",
        "---",
        "Body only."
      ].join("\n")));
      const agents = [{ uri: agentUri, name: "resource-name" }];
      const result = await toSdkCustomAgents(agents, fileService);
      assert.deepStrictEqual(result, [{
        name: "resource-name",
        description: "Helper without an explicit name",
        tools: null,
        prompt: "Body only."
      }]);
    });
    test("trims whitespace from frontmatter name to match parsed agent name", async () => {
      const agentUri = URI.from({ scheme: Schemas.inMemory, path: "/agents/padded.md" });
      await fileService.writeFile(agentUri, VSBuffer.fromString([
        "---",
        'name: "  Inbox  "',
        "---",
        "Body."
      ].join("\n")));
      const agents = [{ uri: agentUri, name: "padded" }];
      const result = await toSdkCustomAgents(agents, fileService);
      assert.strictEqual(result[0].name, "Inbox");
    });
  });
  suite("toSdkSessionCustomAgents", () => {
    test("includes agents from plugins without a file directory", async () => {
      const agentUri = URI.from({ scheme: Schemas.inMemory, path: "/loose/helper.md" });
      await fileService.writeFile(agentUri, VSBuffer.fromString("Loose agent"));
      const plugins = [{ agents: [{ uri: agentUri, name: "helper" }] }];
      const result = await toSdkSessionCustomAgents(plugins, void 0, fileService);
      assert.deepStrictEqual(result, [{ name: "helper", tools: null, prompt: "Loose agent" }]);
    });
    test("excludes file-dir plugin agents when none is selected", async () => {
      const agentUri = URI.from({ scheme: Schemas.inMemory, path: "/plugin/inbox.md" });
      await fileService.writeFile(agentUri, VSBuffer.fromString("Inbox agent"));
      const plugins = [{
        pluginDir: URI.file("/plugins/inbox"),
        agents: [{ uri: agentUri, name: "Inbox" }]
      }];
      const result = await toSdkSessionCustomAgents(plugins, void 0, fileService);
      assert.deepStrictEqual(result, []);
    });
    test("forces the selected file-dir plugin agent into customAgents", async () => {
      const agentUri = URI.from({ scheme: Schemas.inMemory, path: "/plugin/inbox.md" });
      await fileService.writeFile(agentUri, VSBuffer.fromString("Inbox agent"));
      const plugins = [{
        pluginDir: URI.file("/plugins/inbox"),
        agents: [{ uri: agentUri, name: "Inbox" }]
      }];
      const result = await toSdkSessionCustomAgents(plugins, "Inbox", fileService);
      assert.deepStrictEqual(result, [{ name: "Inbox", tools: null, prompt: "Inbox agent" }]);
    });
    test("does not duplicate the selected agent when already present", async () => {
      const agentUri = URI.from({ scheme: Schemas.inMemory, path: "/loose/helper.md" });
      await fileService.writeFile(agentUri, VSBuffer.fromString("Loose agent"));
      const plugins = [{ agents: [{ uri: agentUri, name: "helper" }] }];
      const result = await toSdkSessionCustomAgents(plugins, "helper", fileService);
      assert.deepStrictEqual(result, [{ name: "helper", tools: null, prompt: "Loose agent" }]);
    });
  });
  suite("toSdkSkillDirectories", () => {
    test("extracts parent directories of skill URIs", () => {
      const skills = [
        { uri: URI.file("/plugins/skill-a/SKILL.md"), name: "skill-a" },
        { uri: URI.file("/plugins/skill-b/SKILL.md"), name: "skill-b" }
      ];
      const result = toSdkSkillDirectories(skills);
      assert.strictEqual(result.length, 2);
    });
    test("deduplicates directories", () => {
      const skills = [
        { uri: URI.file("/plugins/shared/SKILL.md"), name: "skill-a" },
        { uri: URI.file("/plugins/shared/SKILL.md"), name: "skill-b" }
      ];
      const result = toSdkSkillDirectories(skills);
      assert.strictEqual(result.length, 1);
    });
    test("handles empty input", () => {
      const result = toSdkSkillDirectories([]);
      assert.deepStrictEqual(result, []);
    });
  });
  suite("toSdkInstructionDirectories", () => {
    test("extracts parent directories of instruction files", () => {
      const instructions = [
        { uri: URI.file("/plugins/rules/project.mdc"), name: "project" },
        { uri: URI.file("/plugins/rules/review.instructions.md"), name: "review" }
      ];
      const result = toSdkInstructionDirectories(instructions);
      assert.strictEqual(result.length, 1);
      assert.strictEqual(result[0].replaceAll("\\", "/"), "/plugins/rules");
    });
    test("deduplicates directories", () => {
      const instructions = [
        { uri: URI.file("/plugins/rules/a.mdc"), name: "a" },
        { uri: URI.file("/plugins/rules/b.mdc"), name: "b" }
      ];
      const result = toSdkInstructionDirectories(instructions);
      assert.strictEqual(result.length, 1);
    });
    test("handles empty input", () => {
      const result = toSdkInstructionDirectories([]);
      assert.deepStrictEqual(result, []);
    });
  });
  suite("toSdkHooks", () => {
    function makeHookGroup(type, command) {
      return {
        type,
        commands: [{ command }],
        uri: URI.file("/plugin/hooks.json"),
        originalId: type,
        customization: stubHookCustomization(type)
      };
    }
    function echoJsonCmd(value) {
      const json = JSON.stringify(value);
      const dir = fileURLToPath(new URL(".", import.meta.url)).replace(/[\\/]$/, "");
      const filePath = `${dir}/vscode-test-hook-${Date.now()}.js`;
      writeFileSync(filePath, `process.stdout.write(${JSON.stringify(json)});
`);
      const command = `node ${filePath}`;
      return { command, cleanup: () => {
        try {
          unlinkSync(filePath);
        } catch {
        }
      } };
    }
    test("onPostToolUse returns parsed JSON output as hook result", async () => {
      const expectedOutput = { additionalContext: "Before presenting the plan, run review-plan skill" };
      const { command, cleanup } = echoJsonCmd(expectedOutput);
      try {
        const hookGroup = makeHookGroup("PostToolUse", command);
        const hooks = toSdkHooks([hookGroup]);
        const toolResult = { textResultForLlm: "ok", resultType: "success" };
        const result = await hooks.onPostToolUse({ toolName: "memory", toolArgs: {}, toolResult, timestamp: /* @__PURE__ */ new Date(0), workingDirectory: "/", sessionId: "test" }, { sessionId: "test" });
        assert.deepStrictEqual(result, expectedOutput);
      } finally {
        cleanup();
      }
    });
    test("onPostToolUse returns undefined when output is non-JSON", async () => {
      const dir = fileURLToPath(new URL(".", import.meta.url)).replace(/[\\/]$/, "");
      const filePath = `${dir}/vscode-test-hook-nonjson-${Date.now()}.js`;
      writeFileSync(filePath, `process.stdout.write('not-json');
`);
      try {
        const hookGroup = makeHookGroup("PostToolUse", `node ${filePath}`);
        const hooks = toSdkHooks([hookGroup]);
        const toolResult = { textResultForLlm: "ok", resultType: "success" };
        const result = await hooks.onPostToolUse({ toolName: "memory", toolArgs: {}, toolResult, timestamp: /* @__PURE__ */ new Date(0), workingDirectory: "/", sessionId: "test" }, { sessionId: "test" });
        assert.strictEqual(result, void 0);
      } finally {
        try {
          unlinkSync(filePath);
        } catch {
        }
      }
    });
    test("onPostToolUse returns undefined when command fails", async () => {
      const dir = fileURLToPath(new URL(".", import.meta.url)).replace(/[\\/]$/, "");
      const filePath = `${dir}/vscode-test-hook-fail-${Date.now()}.js`;
      writeFileSync(filePath, `process.exit(1);
`);
      try {
        const hookGroup = makeHookGroup("PostToolUse", `node ${filePath}`);
        const hooks = toSdkHooks([hookGroup]);
        const toolResult = { textResultForLlm: "ok", resultType: "success" };
        const result = await hooks.onPostToolUse({ toolName: "memory", toolArgs: {}, toolResult, timestamp: /* @__PURE__ */ new Date(0), workingDirectory: "/", sessionId: "test" }, { sessionId: "test" });
        assert.strictEqual(result, void 0);
      } finally {
        try {
          unlinkSync(filePath);
        } catch {
        }
      }
    });
    test("onPostToolUse returns undefined when no commands", async () => {
      const hooks = toSdkHooks([]);
      assert.strictEqual(hooks.onPostToolUse, void 0);
    });
    test("onPostToolUse calls editTrackingHooks and returns command output", async () => {
      const expectedOutput = { additionalContext: "context from hook" };
      const { command, cleanup } = echoJsonCmd(expectedOutput);
      try {
        const hookGroup = makeHookGroup("PostToolUse", command);
        let trackingInput;
        const editTrackingHooks = {
          onPreToolUse: async () => {
          },
          onPostToolUse: async (input) => {
            trackingInput = input;
          }
        };
        const hooks = toSdkHooks([hookGroup], editTrackingHooks);
        const toolResult = { textResultForLlm: "ok", resultType: "success" };
        const callInput = { toolName: "memory", toolArgs: {}, toolResult, timestamp: /* @__PURE__ */ new Date(0), workingDirectory: "/", sessionId: "test" };
        const result = await hooks.onPostToolUse(callInput, { sessionId: "test" });
        assert.deepStrictEqual(result, expectedOutput);
        assert.deepStrictEqual(trackingInput, callInput);
      } finally {
        cleanup();
      }
    });
    test("onUserPromptSubmitted returns host context without rewriting the prompt", async () => {
      const hooks = toSdkHooks([], {
        onPreToolUse: async () => {
        },
        onPostToolUse: async () => {
        },
        onUserPromptSubmitted: () => ({ additionalContext: "Rename with exact casing" })
      });
      const input = { prompt: "Keep GitHub casing", timestamp: /* @__PURE__ */ new Date(0), workingDirectory: "/", sessionId: "test" };
      const result = await hooks.onUserPromptSubmitted(input, { sessionId: "test" });
      assert.strictEqual(input.prompt, "Keep GitHub casing");
      assert.deepStrictEqual(result, { additionalContext: "Rename with exact casing" });
    });
  });
  suite("parsedPluginsEqual", () => {
    function makePlugin(overrides) {
      return {
        format: PluginFormat.Copilot,
        hooks: [],
        mcpServers: [],
        skills: [],
        agents: [],
        instructions: [],
        ...overrides
      };
    }
    test("returns true for identical empty plugins", () => {
      assert.strictEqual(parsedPluginsEqual([makePlugin()], [makePlugin()]), true);
    });
    test("returns true for same content", () => {
      const a = makePlugin({
        skills: [{ uri: URI.file("/a/SKILL.md"), name: "a", customization: stubSkillCustomization("a") }],
        mcpServers: [{
          name: "server",
          uri: URI.file("/mcp"),
          configuration: { type: McpServerType.LOCAL, command: "node" },
          customization: stubMcpCustomization("server")
        }]
      });
      const b = makePlugin({
        skills: [{ uri: URI.file("/a/SKILL.md"), name: "a", customization: stubSkillCustomization("a") }],
        mcpServers: [{
          name: "server",
          uri: URI.file("/mcp"),
          configuration: { type: McpServerType.LOCAL, command: "node" },
          customization: stubMcpCustomization("server")
        }]
      });
      assert.strictEqual(parsedPluginsEqual([a], [b]), true);
    });
    test("returns false for different content", () => {
      const a = makePlugin({ skills: [{ uri: URI.file("/a/SKILL.md"), name: "a", customization: stubSkillCustomization("a") }] });
      const b = makePlugin({ skills: [{ uri: URI.file("/b/SKILL.md"), name: "b", customization: stubSkillCustomization("b") }] });
      assert.strictEqual(parsedPluginsEqual([a], [b]), false);
    });
    test("returns false for different plugin formats", () => {
      assert.strictEqual(parsedPluginsEqual(
        [makePlugin({ format: PluginFormat.AgentPlugin })],
        [makePlugin({ format: PluginFormat.OpenPlugin })]
      ), false);
    });
    test("returns false for different lengths", () => {
      assert.strictEqual(parsedPluginsEqual([makePlugin()], [makePlugin(), makePlugin()]), false);
    });
    test("returns true for empty arrays", () => {
      assert.strictEqual(parsedPluginsEqual([], []), true);
    });
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxwbGF0Zm9ybVxcYWdlbnRIb3N0XFx0ZXN0XFxub2RlXFxjb3BpbG90UGx1Z2luQ29udmVydGVycy50ZXN0LnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IGFzc2VydCBmcm9tICdhc3NlcnQnO1xuaW1wb3J0IHsgd3JpdGVGaWxlU3luYywgdW5saW5rU3luYyB9IGZyb20gJ2ZzJztcbmltcG9ydCB7IGZpbGVVUkxUb1BhdGggfSBmcm9tICd1cmwnO1xuaW1wb3J0IHsgZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS90ZXN0L2NvbW1vbi91dGlscy5qcyc7XG5pbXBvcnQgeyBEaXNwb3NhYmxlU3RvcmUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgU2NoZW1hcyB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL25ldHdvcmsuanMnO1xuaW1wb3J0IHsgVVJJIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdXJpLmpzJztcbmltcG9ydCB7IFZTQnVmZmVyIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vYnVmZmVyLmpzJztcbmltcG9ydCB7IEZpbGVTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vZmlsZXMvY29tbW9uL2ZpbGVTZXJ2aWNlLmpzJztcbmltcG9ydCB7IEluTWVtb3J5RmlsZVN5c3RlbVByb3ZpZGVyIH0gZnJvbSAnLi4vLi4vLi4vZmlsZXMvY29tbW9uL2luTWVtb3J5RmlsZXN5c3RlbVByb3ZpZGVyLmpzJztcbmltcG9ydCB7IE51bGxMb2dTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vbG9nL2NvbW1vbi9sb2cuanMnO1xuaW1wb3J0IHsgTWNwU2VydmVyVHlwZSB9IGZyb20gJy4uLy4uLy4uL21jcC9jb21tb24vbWNwUGxhdGZvcm1UeXBlcy5qcyc7XG5pbXBvcnQgeyB0b1Nka0luc3RydWN0aW9uRGlyZWN0b3JpZXMsIHRvU2RrTWNwU2VydmVycywgdG9TZGtDdXN0b21BZ2VudHMsIHRvU2RrU2Vzc2lvbkN1c3RvbUFnZW50cywgdG9TZGtTa2lsbERpcmVjdG9yaWVzLCBwYXJzZWRQbHVnaW5zRXF1YWwsIHRvU2RrSG9va3MsIHR5cGUgSVBsdWdpbkFnZW50c0ZvclNkayB9IGZyb20gJy4uLy4uL25vZGUvY29waWxvdC9jb3BpbG90UGx1Z2luQ29udmVydGVycy5qcyc7XG5pbXBvcnQgeyBQbHVnaW5Gb3JtYXQsIHR5cGUgSU1jcFNlcnZlckRlZmluaXRpb24sIHR5cGUgSU5hbWVkUGx1Z2luUmVzb3VyY2UsIHR5cGUgSVBhcnNlZEhvb2tHcm91cCwgdHlwZSBJUGFyc2VkUGx1Z2luLCB0eXBlIElQYXJzZWRTa2lsbCB9IGZyb20gJy4uLy4uLy4uL2FnZW50UGx1Z2lucy9jb21tb24vcGx1Z2luUGFyc2Vycy5qcyc7XG5pbXBvcnQgeyBDdXN0b21pemF0aW9uVHlwZSwgTWNwU2VydmVyU3RhdHVzLCB0eXBlIEhvb2tDdXN0b21pemF0aW9uLCB0eXBlIE1jcFNlcnZlckN1c3RvbWl6YXRpb24sIHR5cGUgU2tpbGxDdXN0b21pemF0aW9uIH0gZnJvbSAnLi4vLi4vY29tbW9uL3N0YXRlL3Byb3RvY29sL3N0YXRlLmpzJztcblxuZnVuY3Rpb24gc3R1Yk1jcEN1c3RvbWl6YXRpb24obmFtZSA9ICd0ZXN0Jyk6IE1jcFNlcnZlckN1c3RvbWl6YXRpb24ge1xuXHRyZXR1cm4geyB0eXBlOiBDdXN0b21pemF0aW9uVHlwZS5NY3BTZXJ2ZXIsIGlkOiBgbWNwOiR7bmFtZX1gLCB1cmk6ICdmaWxlOi8vL3BsdWdpbicsIG5hbWUsIHN0YXRlOiB7IGtpbmQ6IE1jcFNlcnZlclN0YXR1cy5TdGFydGluZyB9IH07XG59XG5mdW5jdGlvbiBzdHViSG9va0N1c3RvbWl6YXRpb24odHlwZTogc3RyaW5nKTogSG9va0N1c3RvbWl6YXRpb24ge1xuXHRyZXR1cm4geyB0eXBlOiBDdXN0b21pemF0aW9uVHlwZS5Ib29rLCBpZDogYGhvb2s6JHt0eXBlfWAsIHVyaTogJ2ZpbGU6Ly8vcGx1Z2luL2hvb2tzLmpzb24nLCBuYW1lOiAnaG9va3MuanNvbicgfTtcbn1cbmZ1bmN0aW9uIHN0dWJTa2lsbEN1c3RvbWl6YXRpb24obmFtZTogc3RyaW5nKTogU2tpbGxDdXN0b21pemF0aW9uIHtcblx0cmV0dXJuIHsgdHlwZTogQ3VzdG9taXphdGlvblR5cGUuU2tpbGwsIGlkOiBgc2tpbGw6JHtuYW1lfWAsIHVyaTogYGZpbGU6Ly8vJHtuYW1lfS9TS0lMTC5tZGAsIG5hbWUgfTtcbn1cblxuc3VpdGUoJ2NvcGlsb3RQbHVnaW5Db252ZXJ0ZXJzJywgKCkgPT4ge1xuXG5cdGNvbnN0IGRpc3Bvc2FibGVzID0gbmV3IERpc3Bvc2FibGVTdG9yZSgpO1xuXHRsZXQgZmlsZVNlcnZpY2U6IEZpbGVTZXJ2aWNlO1xuXG5cdHNldHVwKCgpID0+IHtcblx0XHRmaWxlU2VydmljZSA9IGRpc3Bvc2FibGVzLmFkZChuZXcgRmlsZVNlcnZpY2UobmV3IE51bGxMb2dTZXJ2aWNlKCkpKTtcblx0XHRkaXNwb3NhYmxlcy5hZGQoZmlsZVNlcnZpY2UucmVnaXN0ZXJQcm92aWRlcihTY2hlbWFzLmluTWVtb3J5LCBkaXNwb3NhYmxlcy5hZGQobmV3IEluTWVtb3J5RmlsZVN5c3RlbVByb3ZpZGVyKCkpKSk7XG5cdH0pO1xuXG5cdHRlYXJkb3duKCgpID0+IGRpc3Bvc2FibGVzLmNsZWFyKCkpO1xuXHRlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUoKTtcblxuXHQvLyAtLS0tIHRvU2RrTWNwU2VydmVycyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cblxuXHRzdWl0ZSgndG9TZGtNY3BTZXJ2ZXJzJywgKCkgPT4ge1xuXG5cdFx0dGVzdCgnY29udmVydHMgbG9jYWwgc2VydmVyIGRlZmluaXRpb25zJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgZGVmczogSU1jcFNlcnZlckRlZmluaXRpb25bXSA9IFt7XG5cdFx0XHRcdG5hbWU6ICd0ZXN0LXNlcnZlcicsXG5cdFx0XHRcdHVyaTogVVJJLmZpbGUoJy9wbHVnaW4nKSxcblx0XHRcdFx0Y29uZmlndXJhdGlvbjoge1xuXHRcdFx0XHRcdHR5cGU6IE1jcFNlcnZlclR5cGUuTE9DQUwsXG5cdFx0XHRcdFx0Y29tbWFuZDogJ25vZGUnLFxuXHRcdFx0XHRcdGFyZ3M6IFsnc2VydmVyLmpzJywgJy0tcG9ydCcsICczMDAwJ10sXG5cdFx0XHRcdFx0ZW52OiB7IE5PREVfRU5WOiAncHJvZHVjdGlvbicsIFBPUlQ6IDMwMDAgYXMgdW5rbm93biBhcyBzdHJpbmcgfSxcblx0XHRcdFx0XHRjd2Q6ICcvd29ya3NwYWNlJyxcblx0XHRcdFx0fSxcblx0XHRcdFx0Y3VzdG9taXphdGlvbjogc3R1Yk1jcEN1c3RvbWl6YXRpb24oJ3Rlc3Qtc2VydmVyJyksXG5cdFx0XHR9XTtcblxuXHRcdFx0Y29uc3QgcmVzdWx0ID0gdG9TZGtNY3BTZXJ2ZXJzKGRlZnMpO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChyZXN1bHQsIHtcblx0XHRcdFx0J3Rlc3Qtc2VydmVyJzoge1xuXHRcdFx0XHRcdHR5cGU6ICdsb2NhbCcsXG5cdFx0XHRcdFx0Y29tbWFuZDogJ25vZGUnLFxuXHRcdFx0XHRcdGFyZ3M6IFsnc2VydmVyLmpzJywgJy0tcG9ydCcsICczMDAwJ10sXG5cdFx0XHRcdFx0dG9vbHM6IFsnKiddLFxuXHRcdFx0XHRcdGVudjogeyBOT0RFX0VOVjogJ3Byb2R1Y3Rpb24nLCBQT1JUOiAnMzAwMCcgfSxcblx0XHRcdFx0XHRjd2Q6ICcvd29ya3NwYWNlJyxcblx0XHRcdFx0fSxcblx0XHRcdH0pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnY29udmVydHMgcmVtb3RlL2h0dHAgc2VydmVyIGRlZmluaXRpb25zJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgZGVmczogSU1jcFNlcnZlckRlZmluaXRpb25bXSA9IFt7XG5cdFx0XHRcdG5hbWU6ICdyZW1vdGUtc2VydmVyJyxcblx0XHRcdFx0dXJpOiBVUkkuZmlsZSgnL3BsdWdpbicpLFxuXHRcdFx0XHRjb25maWd1cmF0aW9uOiB7XG5cdFx0XHRcdFx0dHlwZTogTWNwU2VydmVyVHlwZS5SRU1PVEUsXG5cdFx0XHRcdFx0dXJsOiAnaHR0cHM6Ly9leGFtcGxlLmNvbS9tY3AnLFxuXHRcdFx0XHRcdGhlYWRlcnM6IHsgJ0F1dGhvcml6YXRpb24nOiAnQmVhcmVyIHRva2VuJyB9LFxuXHRcdFx0XHR9LFxuXHRcdFx0XHRjdXN0b21pemF0aW9uOiBzdHViTWNwQ3VzdG9taXphdGlvbigncmVtb3RlLXNlcnZlcicpLFxuXHRcdFx0fV07XG5cblx0XHRcdGNvbnN0IHJlc3VsdCA9IHRvU2RrTWNwU2VydmVycyhkZWZzKTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocmVzdWx0LCB7XG5cdFx0XHRcdCdyZW1vdGUtc2VydmVyJzoge1xuXHRcdFx0XHRcdHR5cGU6ICdodHRwJyxcblx0XHRcdFx0XHR1cmw6ICdodHRwczovL2V4YW1wbGUuY29tL21jcCcsXG5cdFx0XHRcdFx0dG9vbHM6IFsnKiddLFxuXHRcdFx0XHRcdGhlYWRlcnM6IHsgJ0F1dGhvcml6YXRpb24nOiAnQmVhcmVyIHRva2VuJyB9LFxuXHRcdFx0XHR9LFxuXHRcdFx0fSk7XG5cblx0XHR9KTtcblxuXHRcdHRlc3QoJ2hhbmRsZXMgZW1wdHkgZGVmaW5pdGlvbnMnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCByZXN1bHQgPSB0b1Nka01jcFNlcnZlcnMoW10pO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChyZXN1bHQsIHt9KTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ29taXRzIG9wdGlvbmFsIGZpZWxkcyB3aGVuIHVuZGVmaW5lZCcsICgpID0+IHtcblx0XHRcdGNvbnN0IGRlZnM6IElNY3BTZXJ2ZXJEZWZpbml0aW9uW10gPSBbe1xuXHRcdFx0XHRuYW1lOiAnbWluaW1hbCcsXG5cdFx0XHRcdHVyaTogVVJJLmZpbGUoJy9wbHVnaW4nKSxcblx0XHRcdFx0Y29uZmlndXJhdGlvbjoge1xuXHRcdFx0XHRcdHR5cGU6IE1jcFNlcnZlclR5cGUuTE9DQUwsXG5cdFx0XHRcdFx0Y29tbWFuZDogJ2VjaG8nLFxuXHRcdFx0XHR9LFxuXHRcdFx0XHRjdXN0b21pemF0aW9uOiBzdHViTWNwQ3VzdG9taXphdGlvbignbWluaW1hbCcpLFxuXHRcdFx0fV07XG5cblx0XHRcdGNvbnN0IHJlc3VsdCA9IHRvU2RrTWNwU2VydmVycyhkZWZzKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHRbJ21pbmltYWwnXS50eXBlLCAnbG9jYWwnKTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoKHJlc3VsdFsnbWluaW1hbCddIGFzIHsgYXJncz86IHN0cmluZ1tdIH0pLmFyZ3MsIFtdKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChPYmplY3QuaGFzT3duKHJlc3VsdFsnbWluaW1hbCddLCAnZW52JyksIGZhbHNlKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChPYmplY3QuaGFzT3duKHJlc3VsdFsnbWluaW1hbCddLCAnY3dkJyksIGZhbHNlKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2ZpbHRlcnMgbnVsbCB2YWx1ZXMgZnJvbSBlbnYnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBkZWZzOiBJTWNwU2VydmVyRGVmaW5pdGlvbltdID0gW3tcblx0XHRcdFx0bmFtZTogJ3dpdGgtbnVsbC1lbnYnLFxuXHRcdFx0XHR1cmk6IFVSSS5maWxlKCcvcGx1Z2luJyksXG5cdFx0XHRcdGNvbmZpZ3VyYXRpb246IHtcblx0XHRcdFx0XHR0eXBlOiBNY3BTZXJ2ZXJUeXBlLkxPQ0FMLFxuXHRcdFx0XHRcdGNvbW1hbmQ6ICd0ZXN0Jyxcblx0XHRcdFx0XHRlbnY6IHsgS0VFUDogJ3ZhbHVlJywgRFJPUDogbnVsbCBhcyB1bmtub3duIGFzIHN0cmluZyB9LFxuXHRcdFx0XHR9LFxuXHRcdFx0XHRjdXN0b21pemF0aW9uOiBzdHViTWNwQ3VzdG9taXphdGlvbignd2l0aC1udWxsLWVudicpLFxuXHRcdFx0fV07XG5cblx0XHRcdGNvbnN0IHJlc3VsdCA9IHRvU2RrTWNwU2VydmVycyhkZWZzKTtcblx0XHRcdGNvbnN0IGVudiA9IChyZXN1bHRbJ3dpdGgtbnVsbC1lbnYnXSBhcyB7IGVudj86IFJlY29yZDxzdHJpbmcsIHN0cmluZz4gfSkuZW52O1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChlbnYsIHsgS0VFUDogJ3ZhbHVlJyB9KTtcblx0XHR9KTtcblx0fSk7XG5cblx0Ly8gLS0tLSB0b1Nka0N1c3RvbUFnZW50cyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG5cblx0c3VpdGUoJ3RvU2RrQ3VzdG9tQWdlbnRzJywgKCkgPT4ge1xuXG5cdFx0dGVzdCgncmVhZHMgYWdlbnQgZmlsZXMgd2l0aG91dCBmcm9udG1hdHRlciBhbmQgY3JlYXRlcyBjb25maWdzJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgYWdlbnRVcmkgPSBVUkkuZnJvbSh7IHNjaGVtZTogU2NoZW1hcy5pbk1lbW9yeSwgcGF0aDogJy9hZ2VudHMvaGVscGVyLm1kJyB9KTtcblx0XHRcdGF3YWl0IGZpbGVTZXJ2aWNlLndyaXRlRmlsZShhZ2VudFVyaSwgVlNCdWZmZXIuZnJvbVN0cmluZygnWW91IGFyZSBhIGhlbHBmdWwgYXNzaXN0YW50JykpO1xuXG5cdFx0XHRjb25zdCBhZ2VudHM6IElOYW1lZFBsdWdpblJlc291cmNlW10gPSBbeyB1cmk6IGFnZW50VXJpLCBuYW1lOiAnaGVscGVyJyB9XTtcblx0XHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IHRvU2RrQ3VzdG9tQWdlbnRzKGFnZW50cywgZmlsZVNlcnZpY2UpO1xuXG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHJlc3VsdCwgW3tcblx0XHRcdFx0bmFtZTogJ2hlbHBlcicsXG5cdFx0XHRcdHRvb2xzOiBudWxsLFxuXHRcdFx0XHRwcm9tcHQ6ICdZb3UgYXJlIGEgaGVscGZ1bCBhc3Npc3RhbnQnLFxuXHRcdFx0fV0pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnc2tpcHMgYWdlbnRzIHdob3NlIGZpbGVzIGNhbm5vdCBiZSByZWFkJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgYWdlbnRzOiBJTmFtZWRQbHVnaW5SZXNvdXJjZVtdID0gW1xuXHRcdFx0XHR7IHVyaTogVVJJLmZyb20oeyBzY2hlbWU6IFNjaGVtYXMuaW5NZW1vcnksIHBhdGg6ICcvbm9uZXhpc3RlbnQvYWdlbnQubWQnIH0pLCBuYW1lOiAnbWlzc2luZycgfSxcblx0XHRcdF07XG5cdFx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCB0b1Nka0N1c3RvbUFnZW50cyhhZ2VudHMsIGZpbGVTZXJ2aWNlKTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocmVzdWx0LCBbXSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdwcm9jZXNzZXMgbXVsdGlwbGUgYWdlbnRzLCBza2lwcGluZyBmYWlsdXJlcycsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IGdvb2RVcmkgPSBVUkkuZnJvbSh7IHNjaGVtZTogU2NoZW1hcy5pbk1lbW9yeSwgcGF0aDogJy9hZ2VudHMvZ29vZC5tZCcgfSk7XG5cdFx0XHRhd2FpdCBmaWxlU2VydmljZS53cml0ZUZpbGUoZ29vZFVyaSwgVlNCdWZmZXIuZnJvbVN0cmluZygnR29vZCBhZ2VudCcpKTtcblxuXHRcdFx0Y29uc3QgYWdlbnRzOiBJTmFtZWRQbHVnaW5SZXNvdXJjZVtdID0gW1xuXHRcdFx0XHR7IHVyaTogZ29vZFVyaSwgbmFtZTogJ2dvb2QnIH0sXG5cdFx0XHRcdHsgdXJpOiBVUkkuZnJvbSh7IHNjaGVtZTogU2NoZW1hcy5pbk1lbW9yeSwgcGF0aDogJy9hZ2VudHMvYmFkLm1kJyB9KSwgbmFtZTogJ2JhZCcgfSxcblx0XHRcdF07XG5cdFx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCB0b1Nka0N1c3RvbUFnZW50cyhhZ2VudHMsIGZpbGVTZXJ2aWNlKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQubGVuZ3RoLCAxKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHRbMF0ubmFtZSwgJ2dvb2QnKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3BhcnNlcyBZQU1MIGZyb250bWF0dGVyIGZvciBuYW1lLCBkZXNjcmlwdGlvbiwgdG9vbHMsIGFuZCBib2R5JywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgYWdlbnRVcmkgPSBVUkkuZnJvbSh7IHNjaGVtZTogU2NoZW1hcy5pbk1lbW9yeSwgcGF0aDogJy9hZ2VudHMvcmV2aWV3Lm1kJyB9KTtcblx0XHRcdGF3YWl0IGZpbGVTZXJ2aWNlLndyaXRlRmlsZShhZ2VudFVyaSwgVlNCdWZmZXIuZnJvbVN0cmluZyhbXG5cdFx0XHRcdCctLS0nLFxuXHRcdFx0XHQnbmFtZTogY29kZS1yZXZpZXdlcicsXG5cdFx0XHRcdCdkZXNjcmlwdGlvbjogUmV2aWV3cyBjb2RlIGZvciBxdWFsaXR5IGlzc3VlcycsXG5cdFx0XHRcdCd0b29sczonLFxuXHRcdFx0XHQnICAtIHJlYWRfZmlsZScsXG5cdFx0XHRcdCcgIC0gZ3JlcF9zZWFyY2gnLFxuXHRcdFx0XHQnLS0tJyxcblx0XHRcdFx0J1lvdSBhcmUgYSBtZXRpY3Vsb3VzIGNvZGUgcmV2aWV3ZXIuJyxcblx0XHRcdFx0JycsXG5cdFx0XHRdLmpvaW4oJ1xcbicpKSk7XG5cblx0XHRcdGNvbnN0IGFnZW50czogSU5hbWVkUGx1Z2luUmVzb3VyY2VbXSA9IFt7IHVyaTogYWdlbnRVcmksIG5hbWU6ICdyZXZpZXcnIH1dO1xuXHRcdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgdG9TZGtDdXN0b21BZ2VudHMoYWdlbnRzLCBmaWxlU2VydmljZSk7XG5cblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocmVzdWx0LCBbe1xuXHRcdFx0XHRuYW1lOiAnY29kZS1yZXZpZXdlcicsXG5cdFx0XHRcdGRlc2NyaXB0aW9uOiAnUmV2aWV3cyBjb2RlIGZvciBxdWFsaXR5IGlzc3VlcycsXG5cdFx0XHRcdHRvb2xzOiBbJ3JlYWRfZmlsZScsICdncmVwX3NlYXJjaCddLFxuXHRcdFx0XHRwcm9tcHQ6ICdZb3UgYXJlIGEgbWV0aWN1bG91cyBjb2RlIHJldmlld2VyLlxcbicsXG5cdFx0XHR9XSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdwYXJzZXMgc2tpbGxzIGFuZCBpbmZlciBmcm9tIGZyb250bWF0dGVyJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgYWdlbnRVcmkgPSBVUkkuZnJvbSh7IHNjaGVtZTogU2NoZW1hcy5pbk1lbW9yeSwgcGF0aDogJy9hZ2VudHMvc2tpbGxlZC5tZCcgfSk7XG5cdFx0XHRhd2FpdCBmaWxlU2VydmljZS53cml0ZUZpbGUoYWdlbnRVcmksIFZTQnVmZmVyLmZyb21TdHJpbmcoW1xuXHRcdFx0XHQnLS0tJyxcblx0XHRcdFx0J25hbWU6IHNraWxsZWQnLFxuXHRcdFx0XHQnc2tpbGxzOicsXG5cdFx0XHRcdCcgIC0gYmFraW5nLWNha2UnLFxuXHRcdFx0XHQnICAtIGNvb2tpbmctcGFzdGEnLFxuXHRcdFx0XHQnaW5mZXI6IHRydWUnLFxuXHRcdFx0XHQnLS0tJyxcblx0XHRcdFx0J0JvZHkuJyxcblx0XHRcdF0uam9pbignXFxuJykpKTtcblxuXHRcdFx0Y29uc3QgYWdlbnRzOiBJTmFtZWRQbHVnaW5SZXNvdXJjZVtdID0gW3sgdXJpOiBhZ2VudFVyaSwgbmFtZTogJ3NraWxsZWQnIH1dO1xuXHRcdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgdG9TZGtDdXN0b21BZ2VudHMoYWdlbnRzLCBmaWxlU2VydmljZSk7XG5cblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocmVzdWx0LCBbe1xuXHRcdFx0XHRuYW1lOiAnc2tpbGxlZCcsXG5cdFx0XHRcdHRvb2xzOiBudWxsLFxuXHRcdFx0XHRza2lsbHM6IFsnYmFraW5nLWNha2UnLCAnY29va2luZy1wYXN0YSddLFxuXHRcdFx0XHRpbmZlcjogdHJ1ZSxcblx0XHRcdFx0cHJvbXB0OiAnQm9keS4nLFxuXHRcdFx0fV0pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnaW5mZXIgZGVmYXVsdHMgdG8gZmFsc2Ugd2hlbiBkaXNhYmxlLW1vZGVsLWludm9jYXRpb24gaXMgc2V0JywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgYWdlbnRVcmkgPSBVUkkuZnJvbSh7IHNjaGVtZTogU2NoZW1hcy5pbk1lbW9yeSwgcGF0aDogJy9hZ2VudHMvbm8taW52b2tlLm1kJyB9KTtcblx0XHRcdGF3YWl0IGZpbGVTZXJ2aWNlLndyaXRlRmlsZShhZ2VudFVyaSwgVlNCdWZmZXIuZnJvbVN0cmluZyhbXG5cdFx0XHRcdCctLS0nLFxuXHRcdFx0XHQnbmFtZTogbm8taW52b2tlJyxcblx0XHRcdFx0J2Rpc2FibGUtbW9kZWwtaW52b2NhdGlvbjogdHJ1ZScsXG5cdFx0XHRcdCctLS0nLFxuXHRcdFx0XHQnQm9keS4nLFxuXHRcdFx0XS5qb2luKCdcXG4nKSkpO1xuXG5cdFx0XHRjb25zdCBhZ2VudHM6IElOYW1lZFBsdWdpblJlc291cmNlW10gPSBbeyB1cmk6IGFnZW50VXJpLCBuYW1lOiAnbm8taW52b2tlJyB9XTtcblx0XHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IHRvU2RrQ3VzdG9tQWdlbnRzKGFnZW50cywgZmlsZVNlcnZpY2UpO1xuXG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHJlc3VsdCwgW3tcblx0XHRcdFx0bmFtZTogJ25vLWludm9rZScsXG5cdFx0XHRcdHRvb2xzOiBudWxsLFxuXHRcdFx0XHRpbmZlcjogZmFsc2UsXG5cdFx0XHRcdHByb21wdDogJ0JvZHkuJyxcblx0XHRcdH1dKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ29taXRzIHNraWxscyBhbmQgaW5mZXIgd2hlbiBmcm9udG1hdHRlciBkb2VzIG5vdCBzcGVjaWZ5IHRoZW0nLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCBhZ2VudFVyaSA9IFVSSS5mcm9tKHsgc2NoZW1lOiBTY2hlbWFzLmluTWVtb3J5LCBwYXRoOiAnL2FnZW50cy9wbGFpbi5tZCcgfSk7XG5cdFx0XHRhd2FpdCBmaWxlU2VydmljZS53cml0ZUZpbGUoYWdlbnRVcmksIFZTQnVmZmVyLmZyb21TdHJpbmcoW1xuXHRcdFx0XHQnLS0tJyxcblx0XHRcdFx0J25hbWU6IHBsYWluJyxcblx0XHRcdFx0Jy0tLScsXG5cdFx0XHRcdCdCb2R5LicsXG5cdFx0XHRdLmpvaW4oJ1xcbicpKSk7XG5cblx0XHRcdGNvbnN0IGFnZW50czogSU5hbWVkUGx1Z2luUmVzb3VyY2VbXSA9IFt7IHVyaTogYWdlbnRVcmksIG5hbWU6ICdwbGFpbicgfV07XG5cdFx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCB0b1Nka0N1c3RvbUFnZW50cyhhZ2VudHMsIGZpbGVTZXJ2aWNlKTtcblxuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKE9iamVjdC5oYXNPd24ocmVzdWx0WzBdLCAnc2tpbGxzJyksIGZhbHNlKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChPYmplY3QuaGFzT3duKHJlc3VsdFswXSwgJ2luZmVyJyksIGZhbHNlKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2VtcHR5IHRvb2xzIGFycmF5IGJlY29tZXMgbnVsbCAoYWxsIHRvb2xzKScsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IGFnZW50VXJpID0gVVJJLmZyb20oeyBzY2hlbWU6IFNjaGVtYXMuaW5NZW1vcnksIHBhdGg6ICcvYWdlbnRzL2VtcHR5LXRvb2xzLm1kJyB9KTtcblx0XHRcdGF3YWl0IGZpbGVTZXJ2aWNlLndyaXRlRmlsZShhZ2VudFVyaSwgVlNCdWZmZXIuZnJvbVN0cmluZyhbXG5cdFx0XHRcdCctLS0nLFxuXHRcdFx0XHQnbmFtZTogZnJlZS1mb3ItYWxsJyxcblx0XHRcdFx0J3Rvb2xzOiBbXScsXG5cdFx0XHRcdCctLS0nLFxuXHRcdFx0XHQnQm9keS4nLFxuXHRcdFx0XS5qb2luKCdcXG4nKSkpO1xuXG5cdFx0XHRjb25zdCBhZ2VudHM6IElOYW1lZFBsdWdpblJlc291cmNlW10gPSBbeyB1cmk6IGFnZW50VXJpLCBuYW1lOiAnZmFsbGJhY2snIH1dO1xuXHRcdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgdG9TZGtDdXN0b21BZ2VudHMoYWdlbnRzLCBmaWxlU2VydmljZSk7XG5cblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocmVzdWx0LCBbe1xuXHRcdFx0XHRuYW1lOiAnZnJlZS1mb3ItYWxsJyxcblx0XHRcdFx0dG9vbHM6IG51bGwsXG5cdFx0XHRcdHByb21wdDogJ0JvZHkuJyxcblx0XHRcdH1dKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2ZhbGxzIGJhY2sgdG8gcmVzb3VyY2UgbmFtZSB3aGVuIGZyb250bWF0dGVyIG9taXRzIG5hbWUnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCBhZ2VudFVyaSA9IFVSSS5mcm9tKHsgc2NoZW1lOiBTY2hlbWFzLmluTWVtb3J5LCBwYXRoOiAnL2FnZW50cy9uby1uYW1lLm1kJyB9KTtcblx0XHRcdGF3YWl0IGZpbGVTZXJ2aWNlLndyaXRlRmlsZShhZ2VudFVyaSwgVlNCdWZmZXIuZnJvbVN0cmluZyhbXG5cdFx0XHRcdCctLS0nLFxuXHRcdFx0XHQnZGVzY3JpcHRpb246IEhlbHBlciB3aXRob3V0IGFuIGV4cGxpY2l0IG5hbWUnLFxuXHRcdFx0XHQnLS0tJyxcblx0XHRcdFx0J0JvZHkgb25seS4nLFxuXHRcdFx0XS5qb2luKCdcXG4nKSkpO1xuXG5cdFx0XHRjb25zdCBhZ2VudHM6IElOYW1lZFBsdWdpblJlc291cmNlW10gPSBbeyB1cmk6IGFnZW50VXJpLCBuYW1lOiAncmVzb3VyY2UtbmFtZScgfV07XG5cdFx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCB0b1Nka0N1c3RvbUFnZW50cyhhZ2VudHMsIGZpbGVTZXJ2aWNlKTtcblxuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChyZXN1bHQsIFt7XG5cdFx0XHRcdG5hbWU6ICdyZXNvdXJjZS1uYW1lJyxcblx0XHRcdFx0ZGVzY3JpcHRpb246ICdIZWxwZXIgd2l0aG91dCBhbiBleHBsaWNpdCBuYW1lJyxcblx0XHRcdFx0dG9vbHM6IG51bGwsXG5cdFx0XHRcdHByb21wdDogJ0JvZHkgb25seS4nLFxuXHRcdFx0fV0pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgndHJpbXMgd2hpdGVzcGFjZSBmcm9tIGZyb250bWF0dGVyIG5hbWUgdG8gbWF0Y2ggcGFyc2VkIGFnZW50IG5hbWUnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCBhZ2VudFVyaSA9IFVSSS5mcm9tKHsgc2NoZW1lOiBTY2hlbWFzLmluTWVtb3J5LCBwYXRoOiAnL2FnZW50cy9wYWRkZWQubWQnIH0pO1xuXHRcdFx0YXdhaXQgZmlsZVNlcnZpY2Uud3JpdGVGaWxlKGFnZW50VXJpLCBWU0J1ZmZlci5mcm9tU3RyaW5nKFtcblx0XHRcdFx0Jy0tLScsXG5cdFx0XHRcdCduYW1lOiBcIiAgSW5ib3ggIFwiJyxcblx0XHRcdFx0Jy0tLScsXG5cdFx0XHRcdCdCb2R5LicsXG5cdFx0XHRdLmpvaW4oJ1xcbicpKSk7XG5cblx0XHRcdGNvbnN0IGFnZW50czogSU5hbWVkUGx1Z2luUmVzb3VyY2VbXSA9IFt7IHVyaTogYWdlbnRVcmksIG5hbWU6ICdwYWRkZWQnIH1dO1xuXHRcdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgdG9TZGtDdXN0b21BZ2VudHMoYWdlbnRzLCBmaWxlU2VydmljZSk7XG5cblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHRbMF0ubmFtZSwgJ0luYm94Jyk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdC8vIC0tLS0gdG9TZGtTZXNzaW9uQ3VzdG9tQWdlbnRzIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuXG5cdHN1aXRlKCd0b1Nka1Nlc3Npb25DdXN0b21BZ2VudHMnLCAoKSA9PiB7XG5cblx0XHR0ZXN0KCdpbmNsdWRlcyBhZ2VudHMgZnJvbSBwbHVnaW5zIHdpdGhvdXQgYSBmaWxlIGRpcmVjdG9yeScsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IGFnZW50VXJpID0gVVJJLmZyb20oeyBzY2hlbWU6IFNjaGVtYXMuaW5NZW1vcnksIHBhdGg6ICcvbG9vc2UvaGVscGVyLm1kJyB9KTtcblx0XHRcdGF3YWl0IGZpbGVTZXJ2aWNlLndyaXRlRmlsZShhZ2VudFVyaSwgVlNCdWZmZXIuZnJvbVN0cmluZygnTG9vc2UgYWdlbnQnKSk7XG5cblx0XHRcdGNvbnN0IHBsdWdpbnM6IElQbHVnaW5BZ2VudHNGb3JTZGtbXSA9IFt7IGFnZW50czogW3sgdXJpOiBhZ2VudFVyaSwgbmFtZTogJ2hlbHBlcicgfV0gfV07XG5cdFx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCB0b1Nka1Nlc3Npb25DdXN0b21BZ2VudHMocGx1Z2lucywgdW5kZWZpbmVkLCBmaWxlU2VydmljZSk7XG5cblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocmVzdWx0LCBbeyBuYW1lOiAnaGVscGVyJywgdG9vbHM6IG51bGwsIHByb21wdDogJ0xvb3NlIGFnZW50JyB9XSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdleGNsdWRlcyBmaWxlLWRpciBwbHVnaW4gYWdlbnRzIHdoZW4gbm9uZSBpcyBzZWxlY3RlZCcsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IGFnZW50VXJpID0gVVJJLmZyb20oeyBzY2hlbWU6IFNjaGVtYXMuaW5NZW1vcnksIHBhdGg6ICcvcGx1Z2luL2luYm94Lm1kJyB9KTtcblx0XHRcdGF3YWl0IGZpbGVTZXJ2aWNlLndyaXRlRmlsZShhZ2VudFVyaSwgVlNCdWZmZXIuZnJvbVN0cmluZygnSW5ib3ggYWdlbnQnKSk7XG5cblx0XHRcdGNvbnN0IHBsdWdpbnM6IElQbHVnaW5BZ2VudHNGb3JTZGtbXSA9IFt7XG5cdFx0XHRcdHBsdWdpbkRpcjogVVJJLmZpbGUoJy9wbHVnaW5zL2luYm94JyksXG5cdFx0XHRcdGFnZW50czogW3sgdXJpOiBhZ2VudFVyaSwgbmFtZTogJ0luYm94JyB9XSxcblx0XHRcdH1dO1xuXHRcdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgdG9TZGtTZXNzaW9uQ3VzdG9tQWdlbnRzKHBsdWdpbnMsIHVuZGVmaW5lZCwgZmlsZVNlcnZpY2UpO1xuXG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHJlc3VsdCwgW10pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnZm9yY2VzIHRoZSBzZWxlY3RlZCBmaWxlLWRpciBwbHVnaW4gYWdlbnQgaW50byBjdXN0b21BZ2VudHMnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCBhZ2VudFVyaSA9IFVSSS5mcm9tKHsgc2NoZW1lOiBTY2hlbWFzLmluTWVtb3J5LCBwYXRoOiAnL3BsdWdpbi9pbmJveC5tZCcgfSk7XG5cdFx0XHRhd2FpdCBmaWxlU2VydmljZS53cml0ZUZpbGUoYWdlbnRVcmksIFZTQnVmZmVyLmZyb21TdHJpbmcoJ0luYm94IGFnZW50JykpO1xuXG5cdFx0XHRjb25zdCBwbHVnaW5zOiBJUGx1Z2luQWdlbnRzRm9yU2RrW10gPSBbe1xuXHRcdFx0XHRwbHVnaW5EaXI6IFVSSS5maWxlKCcvcGx1Z2lucy9pbmJveCcpLFxuXHRcdFx0XHRhZ2VudHM6IFt7IHVyaTogYWdlbnRVcmksIG5hbWU6ICdJbmJveCcgfV0sXG5cdFx0XHR9XTtcblx0XHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IHRvU2RrU2Vzc2lvbkN1c3RvbUFnZW50cyhwbHVnaW5zLCAnSW5ib3gnLCBmaWxlU2VydmljZSk7XG5cblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocmVzdWx0LCBbeyBuYW1lOiAnSW5ib3gnLCB0b29sczogbnVsbCwgcHJvbXB0OiAnSW5ib3ggYWdlbnQnIH1dKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2RvZXMgbm90IGR1cGxpY2F0ZSB0aGUgc2VsZWN0ZWQgYWdlbnQgd2hlbiBhbHJlYWR5IHByZXNlbnQnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCBhZ2VudFVyaSA9IFVSSS5mcm9tKHsgc2NoZW1lOiBTY2hlbWFzLmluTWVtb3J5LCBwYXRoOiAnL2xvb3NlL2hlbHBlci5tZCcgfSk7XG5cdFx0XHRhd2FpdCBmaWxlU2VydmljZS53cml0ZUZpbGUoYWdlbnRVcmksIFZTQnVmZmVyLmZyb21TdHJpbmcoJ0xvb3NlIGFnZW50JykpO1xuXG5cdFx0XHRjb25zdCBwbHVnaW5zOiBJUGx1Z2luQWdlbnRzRm9yU2RrW10gPSBbeyBhZ2VudHM6IFt7IHVyaTogYWdlbnRVcmksIG5hbWU6ICdoZWxwZXInIH1dIH1dO1xuXHRcdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgdG9TZGtTZXNzaW9uQ3VzdG9tQWdlbnRzKHBsdWdpbnMsICdoZWxwZXInLCBmaWxlU2VydmljZSk7XG5cblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocmVzdWx0LCBbeyBuYW1lOiAnaGVscGVyJywgdG9vbHM6IG51bGwsIHByb21wdDogJ0xvb3NlIGFnZW50JyB9XSk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdC8vIC0tLS0gdG9TZGtTa2lsbERpcmVjdG9yaWVzIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuXG5cdHN1aXRlKCd0b1Nka1NraWxsRGlyZWN0b3JpZXMnLCAoKSA9PiB7XG5cblx0XHR0ZXN0KCdleHRyYWN0cyBwYXJlbnQgZGlyZWN0b3JpZXMgb2Ygc2tpbGwgVVJJcycsICgpID0+IHtcblx0XHRcdGNvbnN0IHNraWxsczogSU5hbWVkUGx1Z2luUmVzb3VyY2VbXSA9IFtcblx0XHRcdFx0eyB1cmk6IFVSSS5maWxlKCcvcGx1Z2lucy9za2lsbC1hL1NLSUxMLm1kJyksIG5hbWU6ICdza2lsbC1hJyB9LFxuXHRcdFx0XHR7IHVyaTogVVJJLmZpbGUoJy9wbHVnaW5zL3NraWxsLWIvU0tJTEwubWQnKSwgbmFtZTogJ3NraWxsLWInIH0sXG5cdFx0XHRdO1xuXHRcdFx0Y29uc3QgcmVzdWx0ID0gdG9TZGtTa2lsbERpcmVjdG9yaWVzKHNraWxscyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0Lmxlbmd0aCwgMik7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdkZWR1cGxpY2F0ZXMgZGlyZWN0b3JpZXMnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBza2lsbHM6IElOYW1lZFBsdWdpblJlc291cmNlW10gPSBbXG5cdFx0XHRcdHsgdXJpOiBVUkkuZmlsZSgnL3BsdWdpbnMvc2hhcmVkL1NLSUxMLm1kJyksIG5hbWU6ICdza2lsbC1hJyB9LFxuXHRcdFx0XHR7IHVyaTogVVJJLmZpbGUoJy9wbHVnaW5zL3NoYXJlZC9TS0lMTC5tZCcpLCBuYW1lOiAnc2tpbGwtYicgfSxcblx0XHRcdF07XG5cdFx0XHRjb25zdCByZXN1bHQgPSB0b1Nka1NraWxsRGlyZWN0b3JpZXMoc2tpbGxzKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQubGVuZ3RoLCAxKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2hhbmRsZXMgZW1wdHkgaW5wdXQnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCByZXN1bHQgPSB0b1Nka1NraWxsRGlyZWN0b3JpZXMoW10pO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChyZXN1bHQsIFtdKTtcblx0XHR9KTtcblx0fSk7XG5cblx0Ly8gLS0tLSB0b1Nka0hvb2tzIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cblxuXHRzdWl0ZSgndG9TZGtJbnN0cnVjdGlvbkRpcmVjdG9yaWVzJywgKCkgPT4ge1xuXG5cdFx0dGVzdCgnZXh0cmFjdHMgcGFyZW50IGRpcmVjdG9yaWVzIG9mIGluc3RydWN0aW9uIGZpbGVzJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgaW5zdHJ1Y3Rpb25zOiBJTmFtZWRQbHVnaW5SZXNvdXJjZVtdID0gW1xuXHRcdFx0XHR7IHVyaTogVVJJLmZpbGUoJy9wbHVnaW5zL3J1bGVzL3Byb2plY3QubWRjJyksIG5hbWU6ICdwcm9qZWN0JyB9LFxuXHRcdFx0XHR7IHVyaTogVVJJLmZpbGUoJy9wbHVnaW5zL3J1bGVzL3Jldmlldy5pbnN0cnVjdGlvbnMubWQnKSwgbmFtZTogJ3JldmlldycgfSxcblx0XHRcdF07XG5cdFx0XHRjb25zdCByZXN1bHQgPSB0b1Nka0luc3RydWN0aW9uRGlyZWN0b3JpZXMoaW5zdHJ1Y3Rpb25zKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQubGVuZ3RoLCAxKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHRbMF0ucmVwbGFjZUFsbCgnXFxcXCcsICcvJyksICcvcGx1Z2lucy9ydWxlcycpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnZGVkdXBsaWNhdGVzIGRpcmVjdG9yaWVzJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgaW5zdHJ1Y3Rpb25zOiBJTmFtZWRQbHVnaW5SZXNvdXJjZVtdID0gW1xuXHRcdFx0XHR7IHVyaTogVVJJLmZpbGUoJy9wbHVnaW5zL3J1bGVzL2EubWRjJyksIG5hbWU6ICdhJyB9LFxuXHRcdFx0XHR7IHVyaTogVVJJLmZpbGUoJy9wbHVnaW5zL3J1bGVzL2IubWRjJyksIG5hbWU6ICdiJyB9LFxuXHRcdFx0XTtcblx0XHRcdGNvbnN0IHJlc3VsdCA9IHRvU2RrSW5zdHJ1Y3Rpb25EaXJlY3RvcmllcyhpbnN0cnVjdGlvbnMpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdC5sZW5ndGgsIDEpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnaGFuZGxlcyBlbXB0eSBpbnB1dCcsICgpID0+IHtcblx0XHRcdGNvbnN0IHJlc3VsdCA9IHRvU2RrSW5zdHJ1Y3Rpb25EaXJlY3RvcmllcyhbXSk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHJlc3VsdCwgW10pO1xuXHRcdH0pO1xuXHR9KTtcblxuXHQvLyAtLS0tIHRvU2RrSG9va3MgLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuXG5cdHN1aXRlKCd0b1Nka0hvb2tzJywgKCkgPT4ge1xuXG5cdFx0ZnVuY3Rpb24gbWFrZUhvb2tHcm91cCh0eXBlOiBzdHJpbmcsIGNvbW1hbmQ6IHN0cmluZyk6IElQYXJzZWRIb29rR3JvdXAge1xuXHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0dHlwZSxcblx0XHRcdFx0Y29tbWFuZHM6IFt7IGNvbW1hbmQgfV0sXG5cdFx0XHRcdHVyaTogVVJJLmZpbGUoJy9wbHVnaW4vaG9va3MuanNvbicpLFxuXHRcdFx0XHRvcmlnaW5hbElkOiB0eXBlLFxuXHRcdFx0XHRjdXN0b21pemF0aW9uOiBzdHViSG9va0N1c3RvbWl6YXRpb24odHlwZSksXG5cdFx0XHR9O1xuXHRcdH1cblxuXHRcdC8qKlxuXHRcdCAqIFdyaXRlcyBhIHRlbXAgSlMgc2NyaXB0IHRoYXQgb3V0cHV0cyBKU09OIHRvIHN0ZG91dCBhbmQgcmV0dXJuc1xuXHRcdCAqIGEgYG5vZGUgPHBhdGg+YCBjb21tYW5kLiBXb3JrcyBvbiBib3RoIGJhc2ggKC9iaW4vc2ggLWMpIGFuZFxuXHRcdCAqIGNtZC5leGUgd2l0aG91dCBhbnkgc2hlbGwtcXVvdGluZyBpc3N1ZXMuXG5cdFx0ICogVGhlIHNjcmlwdCBpcyB3cml0dGVuIGFsb25nc2lkZSB0aGUgY29tcGlsZWQgdGVzdCBmaWxlIHdoaWNoIGlzXG5cdFx0ICogZ3VhcmFudGVlZCB0byBleGlzdCwgYmUgd3JpdGFibGUsIGFuZCBoYXZlIG5vIHNwYWNlcyBpbiBDSS5cblx0XHQgKi9cblx0XHRmdW5jdGlvbiBlY2hvSnNvbkNtZCh2YWx1ZTogb2JqZWN0KTogeyBjb21tYW5kOiBzdHJpbmc7IGNsZWFudXA6ICgpID0+IHZvaWQgfSB7XG5cdFx0XHRjb25zdCBqc29uID0gSlNPTi5zdHJpbmdpZnkodmFsdWUpO1xuXHRcdFx0Ly8gZmlsZVVSTFRvUGF0aChuZXcgVVJMKCcuJywgaW1wb3J0Lm1ldGEudXJsKSkgaXMgdGhlIE5vZGUgRVNNIGVxdWl2YWxlbnRcblx0XHRcdC8vIG9mIF9fZGlybmFtZSBhbmQgd29ya3Mgb24gTm9kZSAxMissIHVubGlrZSBpbXBvcnQubWV0YS5kaXJuYW1lIChOb2RlIDIxLjIrKS5cblx0XHRcdGNvbnN0IGRpciA9IGZpbGVVUkxUb1BhdGgobmV3IFVSTCgnLicsIGltcG9ydC5tZXRhLnVybCkpLnJlcGxhY2UoL1tcXFxcL10kLywgJycpO1xuXHRcdFx0Y29uc3QgZmlsZVBhdGggPSBgJHtkaXJ9L3ZzY29kZS10ZXN0LWhvb2stJHtEYXRlLm5vdygpfS5qc2A7XG5cdFx0XHR3cml0ZUZpbGVTeW5jKGZpbGVQYXRoLCBgcHJvY2Vzcy5zdGRvdXQud3JpdGUoJHtKU09OLnN0cmluZ2lmeShqc29uKX0pO1xcbmApO1xuXHRcdFx0Ly8gRG8gTk9UIHF1b3RlIHRoZSBwYXRoOiBjbWQuZXhlIC9jIFwibm9kZSBwYXRoXCIgc3RyaXBzIHRoZSBvdXRlciBxdW90ZXMsXG5cdFx0XHQvLyBsZWF2aW5nIFwibm9kZSBwYXRoXCIgd2l0aG91dCBpbm5lciBxdW90aW5nIHdoaWNoIGNtZC5leGUgaGFuZGxlcyBjbGVhbmx5LlxuXHRcdFx0Y29uc3QgY29tbWFuZCA9IGBub2RlICR7ZmlsZVBhdGh9YDtcblx0XHRcdHJldHVybiB7IGNvbW1hbmQsIGNsZWFudXA6ICgpID0+IHsgdHJ5IHsgdW5saW5rU3luYyhmaWxlUGF0aCk7IH0gY2F0Y2ggeyAvKiBpZ25vcmUgKi8gfSB9IH07XG5cdFx0fVxuXG5cdFx0dGVzdCgnb25Qb3N0VG9vbFVzZSByZXR1cm5zIHBhcnNlZCBKU09OIG91dHB1dCBhcyBob29rIHJlc3VsdCcsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IGV4cGVjdGVkT3V0cHV0ID0geyBhZGRpdGlvbmFsQ29udGV4dDogJ0JlZm9yZSBwcmVzZW50aW5nIHRoZSBwbGFuLCBydW4gcmV2aWV3LXBsYW4gc2tpbGwnIH07XG5cdFx0XHRjb25zdCB7IGNvbW1hbmQsIGNsZWFudXAgfSA9IGVjaG9Kc29uQ21kKGV4cGVjdGVkT3V0cHV0KTtcblx0XHRcdHRyeSB7XG5cdFx0XHRcdGNvbnN0IGhvb2tHcm91cCA9IG1ha2VIb29rR3JvdXAoJ1Bvc3RUb29sVXNlJywgY29tbWFuZCk7XG5cdFx0XHRcdGNvbnN0IGhvb2tzID0gdG9TZGtIb29rcyhbaG9va0dyb3VwXSk7XG5cdFx0XHRcdGNvbnN0IHRvb2xSZXN1bHQgPSB7IHRleHRSZXN1bHRGb3JMbG06ICdvaycsIHJlc3VsdFR5cGU6ICdzdWNjZXNzJyBhcyBjb25zdCB9O1xuXHRcdFx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCBob29rcy5vblBvc3RUb29sVXNlISh7IHRvb2xOYW1lOiAnbWVtb3J5JywgdG9vbEFyZ3M6IHt9LCB0b29sUmVzdWx0LCB0aW1lc3RhbXA6IG5ldyBEYXRlKDApLCB3b3JraW5nRGlyZWN0b3J5OiAnLycsIHNlc3Npb25JZDogJ3Rlc3QnIH0sIHsgc2Vzc2lvbklkOiAndGVzdCcgfSk7XG5cdFx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocmVzdWx0LCBleHBlY3RlZE91dHB1dCk7XG5cdFx0XHR9IGZpbmFsbHkge1xuXHRcdFx0XHRjbGVhbnVwKCk7XG5cdFx0XHR9XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdvblBvc3RUb29sVXNlIHJldHVybnMgdW5kZWZpbmVkIHdoZW4gb3V0cHV0IGlzIG5vbi1KU09OJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Ly8gVXNlIGEgc2NyaXB0IGZpbGUgc28gdGhlcmUgYXJlIG5vIGNtZC5leGUgcXVvdGluZyBpc3N1ZXMgb24gV2luZG93cy5cblx0XHRcdGNvbnN0IGRpciA9IGZpbGVVUkxUb1BhdGgobmV3IFVSTCgnLicsIGltcG9ydC5tZXRhLnVybCkpLnJlcGxhY2UoL1tcXFxcL10kLywgJycpO1xuXHRcdFx0Y29uc3QgZmlsZVBhdGggPSBgJHtkaXJ9L3ZzY29kZS10ZXN0LWhvb2stbm9uanNvbi0ke0RhdGUubm93KCl9LmpzYDtcblx0XHRcdHdyaXRlRmlsZVN5bmMoZmlsZVBhdGgsIGBwcm9jZXNzLnN0ZG91dC53cml0ZSgnbm90LWpzb24nKTtcXG5gKTtcblx0XHRcdHRyeSB7XG5cdFx0XHRcdGNvbnN0IGhvb2tHcm91cCA9IG1ha2VIb29rR3JvdXAoJ1Bvc3RUb29sVXNlJywgYG5vZGUgJHtmaWxlUGF0aH1gKTtcblx0XHRcdFx0Y29uc3QgaG9va3MgPSB0b1Nka0hvb2tzKFtob29rR3JvdXBdKTtcblx0XHRcdFx0Y29uc3QgdG9vbFJlc3VsdCA9IHsgdGV4dFJlc3VsdEZvckxsbTogJ29rJywgcmVzdWx0VHlwZTogJ3N1Y2Nlc3MnIGFzIGNvbnN0IH07XG5cdFx0XHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IGhvb2tzLm9uUG9zdFRvb2xVc2UhKHsgdG9vbE5hbWU6ICdtZW1vcnknLCB0b29sQXJnczoge30sIHRvb2xSZXN1bHQsIHRpbWVzdGFtcDogbmV3IERhdGUoMCksIHdvcmtpbmdEaXJlY3Rvcnk6ICcvJywgc2Vzc2lvbklkOiAndGVzdCcgfSwgeyBzZXNzaW9uSWQ6ICd0ZXN0JyB9KTtcblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdCwgdW5kZWZpbmVkKTtcblx0XHRcdH0gZmluYWxseSB7XG5cdFx0XHRcdHRyeSB7IHVubGlua1N5bmMoZmlsZVBhdGgpOyB9IGNhdGNoIHsgLyogaWdub3JlICovIH1cblx0XHRcdH1cblx0XHR9KTtcblxuXHRcdHRlc3QoJ29uUG9zdFRvb2xVc2UgcmV0dXJucyB1bmRlZmluZWQgd2hlbiBjb21tYW5kIGZhaWxzJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgZGlyID0gZmlsZVVSTFRvUGF0aChuZXcgVVJMKCcuJywgaW1wb3J0Lm1ldGEudXJsKSkucmVwbGFjZSgvW1xcXFwvXSQvLCAnJyk7XG5cdFx0XHRjb25zdCBmaWxlUGF0aCA9IGAke2Rpcn0vdnNjb2RlLXRlc3QtaG9vay1mYWlsLSR7RGF0ZS5ub3coKX0uanNgO1xuXHRcdFx0d3JpdGVGaWxlU3luYyhmaWxlUGF0aCwgYHByb2Nlc3MuZXhpdCgxKTtcXG5gKTtcblx0XHRcdHRyeSB7XG5cdFx0XHRcdGNvbnN0IGhvb2tHcm91cCA9IG1ha2VIb29rR3JvdXAoJ1Bvc3RUb29sVXNlJywgYG5vZGUgJHtmaWxlUGF0aH1gKTtcblx0XHRcdFx0Y29uc3QgaG9va3MgPSB0b1Nka0hvb2tzKFtob29rR3JvdXBdKTtcblx0XHRcdFx0Y29uc3QgdG9vbFJlc3VsdCA9IHsgdGV4dFJlc3VsdEZvckxsbTogJ29rJywgcmVzdWx0VHlwZTogJ3N1Y2Nlc3MnIGFzIGNvbnN0IH07XG5cdFx0XHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IGhvb2tzLm9uUG9zdFRvb2xVc2UhKHsgdG9vbE5hbWU6ICdtZW1vcnknLCB0b29sQXJnczoge30sIHRvb2xSZXN1bHQsIHRpbWVzdGFtcDogbmV3IERhdGUoMCksIHdvcmtpbmdEaXJlY3Rvcnk6ICcvJywgc2Vzc2lvbklkOiAndGVzdCcgfSwgeyBzZXNzaW9uSWQ6ICd0ZXN0JyB9KTtcblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdCwgdW5kZWZpbmVkKTtcblx0XHRcdH0gZmluYWxseSB7XG5cdFx0XHRcdHRyeSB7IHVubGlua1N5bmMoZmlsZVBhdGgpOyB9IGNhdGNoIHsgLyogaWdub3JlICovIH1cblx0XHRcdH1cblx0XHR9KTtcblxuXHRcdHRlc3QoJ29uUG9zdFRvb2xVc2UgcmV0dXJucyB1bmRlZmluZWQgd2hlbiBubyBjb21tYW5kcycsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IGhvb2tzID0gdG9TZGtIb29rcyhbXSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoaG9va3Mub25Qb3N0VG9vbFVzZSwgdW5kZWZpbmVkKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ29uUG9zdFRvb2xVc2UgY2FsbHMgZWRpdFRyYWNraW5nSG9va3MgYW5kIHJldHVybnMgY29tbWFuZCBvdXRwdXQnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCBleHBlY3RlZE91dHB1dCA9IHsgYWRkaXRpb25hbENvbnRleHQ6ICdjb250ZXh0IGZyb20gaG9vaycgfTtcblx0XHRcdGNvbnN0IHsgY29tbWFuZCwgY2xlYW51cCB9ID0gZWNob0pzb25DbWQoZXhwZWN0ZWRPdXRwdXQpO1xuXHRcdFx0dHJ5IHtcblx0XHRcdFx0Y29uc3QgaG9va0dyb3VwID0gbWFrZUhvb2tHcm91cCgnUG9zdFRvb2xVc2UnLCBjb21tYW5kKTtcblx0XHRcdFx0bGV0IHRyYWNraW5nSW5wdXQ6IHVua25vd247XG5cdFx0XHRcdGNvbnN0IGVkaXRUcmFja2luZ0hvb2tzID0ge1xuXHRcdFx0XHRcdG9uUHJlVG9vbFVzZTogYXN5bmMgKCkgPT4geyB9LFxuXHRcdFx0XHRcdG9uUG9zdFRvb2xVc2U6IGFzeW5jIChpbnB1dDogdW5rbm93bikgPT4geyB0cmFja2luZ0lucHV0ID0gaW5wdXQ7IH0sXG5cdFx0XHRcdH07XG5cdFx0XHRcdGNvbnN0IGhvb2tzID0gdG9TZGtIb29rcyhbaG9va0dyb3VwXSwgZWRpdFRyYWNraW5nSG9va3MpO1xuXHRcdFx0XHRjb25zdCB0b29sUmVzdWx0ID0geyB0ZXh0UmVzdWx0Rm9yTGxtOiAnb2snLCByZXN1bHRUeXBlOiAnc3VjY2VzcycgYXMgY29uc3QgfTtcblx0XHRcdFx0Y29uc3QgY2FsbElucHV0ID0geyB0b29sTmFtZTogJ21lbW9yeScsIHRvb2xBcmdzOiB7fSwgdG9vbFJlc3VsdCwgdGltZXN0YW1wOiBuZXcgRGF0ZSgwKSwgd29ya2luZ0RpcmVjdG9yeTogJy8nLCBzZXNzaW9uSWQ6ICd0ZXN0JyB9O1xuXHRcdFx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCBob29rcy5vblBvc3RUb29sVXNlIShjYWxsSW5wdXQsIHsgc2Vzc2lvbklkOiAndGVzdCcgfSk7XG5cdFx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocmVzdWx0LCBleHBlY3RlZE91dHB1dCk7XG5cdFx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwodHJhY2tpbmdJbnB1dCwgY2FsbElucHV0KTtcblx0XHRcdH0gZmluYWxseSB7XG5cdFx0XHRcdGNsZWFudXAoKTtcblx0XHRcdH1cblx0XHR9KTtcblxuXHRcdHRlc3QoJ29uVXNlclByb21wdFN1Ym1pdHRlZCByZXR1cm5zIGhvc3QgY29udGV4dCB3aXRob3V0IHJld3JpdGluZyB0aGUgcHJvbXB0JywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgaG9va3MgPSB0b1Nka0hvb2tzKFtdLCB7XG5cdFx0XHRcdG9uUHJlVG9vbFVzZTogYXN5bmMgKCkgPT4geyB9LFxuXHRcdFx0XHRvblBvc3RUb29sVXNlOiBhc3luYyAoKSA9PiB7IH0sXG5cdFx0XHRcdG9uVXNlclByb21wdFN1Ym1pdHRlZDogKCkgPT4gKHsgYWRkaXRpb25hbENvbnRleHQ6ICdSZW5hbWUgd2l0aCBleGFjdCBjYXNpbmcnIH0pLFxuXHRcdFx0fSk7XG5cdFx0XHRjb25zdCBpbnB1dCA9IHsgcHJvbXB0OiAnS2VlcCBHaXRIdWIgY2FzaW5nJywgdGltZXN0YW1wOiBuZXcgRGF0ZSgwKSwgd29ya2luZ0RpcmVjdG9yeTogJy8nLCBzZXNzaW9uSWQ6ICd0ZXN0JyB9O1xuXG5cdFx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCBob29rcy5vblVzZXJQcm9tcHRTdWJtaXR0ZWQhKGlucHV0LCB7IHNlc3Npb25JZDogJ3Rlc3QnIH0pO1xuXG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoaW5wdXQucHJvbXB0LCAnS2VlcCBHaXRIdWIgY2FzaW5nJyk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHJlc3VsdCwgeyBhZGRpdGlvbmFsQ29udGV4dDogJ1JlbmFtZSB3aXRoIGV4YWN0IGNhc2luZycgfSk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdC8vIC0tLS0gcGFyc2VkUGx1Z2luc0VxdWFsIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuXG5cdHN1aXRlKCdwYXJzZWRQbHVnaW5zRXF1YWwnLCAoKSA9PiB7XG5cblx0XHRmdW5jdGlvbiBtYWtlUGx1Z2luKG92ZXJyaWRlcz86IFBhcnRpYWw8SVBhcnNlZFBsdWdpbj4pOiBJUGFyc2VkUGx1Z2luIHtcblx0XHRcdHJldHVybiB7XG5cdFx0XHRcdGZvcm1hdDogUGx1Z2luRm9ybWF0LkNvcGlsb3QsXG5cdFx0XHRcdGhvb2tzOiBbXSxcblx0XHRcdFx0bWNwU2VydmVyczogW10sXG5cdFx0XHRcdHNraWxsczogW10sXG5cdFx0XHRcdGFnZW50czogW10sXG5cdFx0XHRcdGluc3RydWN0aW9uczogW10sXG5cdFx0XHRcdC4uLm92ZXJyaWRlcyxcblx0XHRcdH07XG5cdFx0fVxuXG5cdFx0dGVzdCgncmV0dXJucyB0cnVlIGZvciBpZGVudGljYWwgZW1wdHkgcGx1Z2lucycsICgpID0+IHtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChwYXJzZWRQbHVnaW5zRXF1YWwoW21ha2VQbHVnaW4oKV0sIFttYWtlUGx1Z2luKCldKSwgdHJ1ZSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdyZXR1cm5zIHRydWUgZm9yIHNhbWUgY29udGVudCcsICgpID0+IHtcblx0XHRcdGNvbnN0IGEgPSBtYWtlUGx1Z2luKHtcblx0XHRcdFx0c2tpbGxzOiBbeyB1cmk6IFVSSS5maWxlKCcvYS9TS0lMTC5tZCcpLCBuYW1lOiAnYScsIGN1c3RvbWl6YXRpb246IHN0dWJTa2lsbEN1c3RvbWl6YXRpb24oJ2EnKSB9IHNhdGlzZmllcyBJUGFyc2VkU2tpbGxdLFxuXHRcdFx0XHRtY3BTZXJ2ZXJzOiBbe1xuXHRcdFx0XHRcdG5hbWU6ICdzZXJ2ZXInLFxuXHRcdFx0XHRcdHVyaTogVVJJLmZpbGUoJy9tY3AnKSxcblx0XHRcdFx0XHRjb25maWd1cmF0aW9uOiB7IHR5cGU6IE1jcFNlcnZlclR5cGUuTE9DQUwsIGNvbW1hbmQ6ICdub2RlJyB9LFxuXHRcdFx0XHRcdGN1c3RvbWl6YXRpb246IHN0dWJNY3BDdXN0b21pemF0aW9uKCdzZXJ2ZXInKSxcblx0XHRcdFx0fV0sXG5cdFx0XHR9KTtcblx0XHRcdGNvbnN0IGIgPSBtYWtlUGx1Z2luKHtcblx0XHRcdFx0c2tpbGxzOiBbeyB1cmk6IFVSSS5maWxlKCcvYS9TS0lMTC5tZCcpLCBuYW1lOiAnYScsIGN1c3RvbWl6YXRpb246IHN0dWJTa2lsbEN1c3RvbWl6YXRpb24oJ2EnKSB9IHNhdGlzZmllcyBJUGFyc2VkU2tpbGxdLFxuXHRcdFx0XHRtY3BTZXJ2ZXJzOiBbe1xuXHRcdFx0XHRcdG5hbWU6ICdzZXJ2ZXInLFxuXHRcdFx0XHRcdHVyaTogVVJJLmZpbGUoJy9tY3AnKSxcblx0XHRcdFx0XHRjb25maWd1cmF0aW9uOiB7IHR5cGU6IE1jcFNlcnZlclR5cGUuTE9DQUwsIGNvbW1hbmQ6ICdub2RlJyB9LFxuXHRcdFx0XHRcdGN1c3RvbWl6YXRpb246IHN0dWJNY3BDdXN0b21pemF0aW9uKCdzZXJ2ZXInKSxcblx0XHRcdFx0fV0sXG5cdFx0XHR9KTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChwYXJzZWRQbHVnaW5zRXF1YWwoW2FdLCBbYl0pLCB0cnVlKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3JldHVybnMgZmFsc2UgZm9yIGRpZmZlcmVudCBjb250ZW50JywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgYSA9IG1ha2VQbHVnaW4oeyBza2lsbHM6IFt7IHVyaTogVVJJLmZpbGUoJy9hL1NLSUxMLm1kJyksIG5hbWU6ICdhJywgY3VzdG9taXphdGlvbjogc3R1YlNraWxsQ3VzdG9taXphdGlvbignYScpIH0gc2F0aXNmaWVzIElQYXJzZWRTa2lsbF0gfSk7XG5cdFx0XHRjb25zdCBiID0gbWFrZVBsdWdpbih7IHNraWxsczogW3sgdXJpOiBVUkkuZmlsZSgnL2IvU0tJTEwubWQnKSwgbmFtZTogJ2InLCBjdXN0b21pemF0aW9uOiBzdHViU2tpbGxDdXN0b21pemF0aW9uKCdiJykgfSBzYXRpc2ZpZXMgSVBhcnNlZFNraWxsXSB9KTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChwYXJzZWRQbHVnaW5zRXF1YWwoW2FdLCBbYl0pLCBmYWxzZSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdyZXR1cm5zIGZhbHNlIGZvciBkaWZmZXJlbnQgcGx1Z2luIGZvcm1hdHMnLCAoKSA9PiB7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocGFyc2VkUGx1Z2luc0VxdWFsKFxuXHRcdFx0XHRbbWFrZVBsdWdpbih7IGZvcm1hdDogUGx1Z2luRm9ybWF0LkFnZW50UGx1Z2luIH0pXSxcblx0XHRcdFx0W21ha2VQbHVnaW4oeyBmb3JtYXQ6IFBsdWdpbkZvcm1hdC5PcGVuUGx1Z2luIH0pXSxcblx0XHRcdCksIGZhbHNlKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3JldHVybnMgZmFsc2UgZm9yIGRpZmZlcmVudCBsZW5ndGhzJywgKCkgPT4ge1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHBhcnNlZFBsdWdpbnNFcXVhbChbbWFrZVBsdWdpbigpXSwgW21ha2VQbHVnaW4oKSwgbWFrZVBsdWdpbigpXSksIGZhbHNlKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3JldHVybnMgdHJ1ZSBmb3IgZW1wdHkgYXJyYXlzJywgKCkgPT4ge1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHBhcnNlZFBsdWdpbnNFcXVhbChbXSwgW10pLCB0cnVlKTtcblx0XHR9KTtcblx0fSk7XG59KTtcbiJdLAogICJtYXBwaW5ncyI6ICJBQUtBLE9BQU8sWUFB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
