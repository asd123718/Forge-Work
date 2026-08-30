import assert from "assert";
import { VSBuffer } from "../../../../base/common/buffer.js";
import { DisposableStore } from "../../../../base/common/lifecycle.js";
import { Schemas } from "../../../../base/common/network.js";
import { URI } from "../../../../base/common/uri.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../base/test/common/utils.js";
import { FileService } from "../../../files/common/fileService.js";
import { FileSystemProviderCapabilities } from "../../../files/common/files.js";
import { InMemoryFileSystemProvider } from "../../../files/common/inMemoryFilesystemProvider.js";
import { NullLogService } from "../../../log/common/log.js";
import { McpServerType } from "../../../mcp/common/mcpPlatformTypes.js";
import { CustomizationType, McpServerStatus } from "../../../agentHost/common/state/protocol/state.js";
import { DEFAULT_MCP_APP } from "../../../agentHost/common/state/protocol/mcpAppDefaults.js";
import { customizationId } from "../../../agentHost/common/state/sessionState.js";
function stubMcpCustomization() {
  return { type: CustomizationType.McpServer, id: "stub", uri: "file:///plugin", name: "test", state: { kind: McpServerStatus.Starting } };
}
import {
  IParsedHookCommand,
  makeMcpServerCustomization,
  parseComponentPathConfig,
  parseHooksJson,
  resolveComponentDirs,
  normalizeMcpServerConfiguration,
  shellQuotePluginRootInCommand,
  interpolateMcpPluginRoot,
  convertBareEnvVarsToVsCodeSyntax,
  toParsedAgent,
  toParsedSkill,
  parsePlugin,
  PluginFormat
} from "../../common/pluginParsers.js";
import { AGENT_PLUGIN_MCP_SCHEMA, AGENT_PLUGIN_SCHEMA } from "../../common/agentPluginParser.js";
suite("pluginParsers", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  suite("parseComponentPathConfig", () => {
    test("returns empty config for undefined", () => {
      const result = parseComponentPathConfig(void 0);
      assert.deepStrictEqual(result, { paths: [], exclusive: false });
    });
    test("returns empty config for null", () => {
      const result = parseComponentPathConfig(null);
      assert.deepStrictEqual(result, { paths: [], exclusive: false });
    });
    test("parses a string to single-element paths", () => {
      const result = parseComponentPathConfig("custom/skills");
      assert.deepStrictEqual(result, { paths: ["custom/skills"], exclusive: false });
    });
    test("trims whitespace from string", () => {
      const result = parseComponentPathConfig("  spaced  ");
      assert.deepStrictEqual(result, { paths: ["spaced"], exclusive: false });
    });
    test("returns empty for blank string", () => {
      const result = parseComponentPathConfig("   ");
      assert.deepStrictEqual(result, { paths: [], exclusive: false });
    });
    test("parses a string array", () => {
      const result = parseComponentPathConfig(["a", "b", "c"]);
      assert.deepStrictEqual(result, { paths: ["a", "b", "c"], exclusive: false });
    });
    test("filters non-string entries from arrays", () => {
      const result = parseComponentPathConfig(["valid", 42, null, "ok"]);
      assert.deepStrictEqual(result, { paths: ["valid", "ok"], exclusive: false });
    });
    test("parses object with paths and exclusive", () => {
      const result = parseComponentPathConfig({ paths: ["x", "y"], exclusive: true });
      assert.deepStrictEqual(result, { paths: ["x", "y"], exclusive: true });
    });
    test("object without exclusive defaults to false", () => {
      const result = parseComponentPathConfig({ paths: ["z"] });
      assert.deepStrictEqual(result, { paths: ["z"], exclusive: false });
    });
    test("returns empty for unrecognized types", () => {
      const result = parseComponentPathConfig(42);
      assert.deepStrictEqual(result, { paths: [], exclusive: false });
    });
  });
  suite("resolveComponentDirs", () => {
    const pluginUri = URI.file("/workspace/.plugin-root");
    test("includes default directory when not exclusive", () => {
      const dirs = resolveComponentDirs(pluginUri, "skills", { paths: [], exclusive: false });
      assert.strictEqual(dirs.length, 1);
      assert.ok(dirs[0].path.endsWith("/skills"));
    });
    test("excludes default directory when exclusive", () => {
      const dirs = resolveComponentDirs(pluginUri, "skills", { paths: ["custom"], exclusive: true });
      assert.ok(!dirs.some((d) => d.path.endsWith("/skills")));
      assert.ok(dirs.some((d) => d.path.endsWith("/custom")));
    });
    test("resolves relative paths from plugin root", () => {
      const dirs = resolveComponentDirs(pluginUri, "skills", { paths: ["other/skills"], exclusive: false });
      assert.strictEqual(dirs.length, 2);
      assert.ok(dirs[1].path.endsWith("/other/skills"));
    });
    test("rejects paths that escape plugin root", () => {
      const dirs = resolveComponentDirs(pluginUri, "skills", { paths: ["../../outside"], exclusive: false });
      assert.strictEqual(dirs.length, 1);
    });
    test("allows paths that escape plugin root but stay within boundaryUri", () => {
      const boundaryUri = URI.file("/workspace");
      const dirs = resolveComponentDirs(pluginUri, "skills", { paths: ["../shared-skills"], exclusive: false }, boundaryUri);
      assert.strictEqual(dirs.length, 2);
      assert.ok(dirs[1].path.endsWith("/shared-skills"));
    });
    test("rejects paths that escape boundaryUri", () => {
      const boundaryUri = URI.file("/workspace");
      const dirs = resolveComponentDirs(pluginUri, "skills", { paths: ["../../outside"], exclusive: false }, boundaryUri);
      assert.strictEqual(dirs.length, 1);
    });
    test("falls back to pluginUri when boundaryUri is not an ancestor of pluginUri", () => {
      const boundaryUri = URI.file("/unrelated/directory");
      const dirs = resolveComponentDirs(pluginUri, "skills", { paths: ["custom"], exclusive: false }, boundaryUri);
      assert.strictEqual(dirs.length, 2);
      assert.ok(dirs[1].path.endsWith("/custom"));
    });
  });
  suite("normalizeMcpServerConfiguration", () => {
    test("returns undefined for non-object input", () => {
      assert.strictEqual(normalizeMcpServerConfiguration(null), void 0);
      assert.strictEqual(normalizeMcpServerConfiguration("string"), void 0);
      assert.strictEqual(normalizeMcpServerConfiguration(42), void 0);
    });
    test("parses local server with command", () => {
      const result = normalizeMcpServerConfiguration({
        type: "stdio",
        command: "node",
        args: ["server.js"],
        env: { KEY: "value" },
        cwd: "/workspace"
      });
      assert.ok(result);
      assert.strictEqual(result.type, McpServerType.LOCAL);
      assert.strictEqual(result.command, "node");
    });
    test("infers local type from command without explicit type", () => {
      const result = normalizeMcpServerConfiguration({ command: "python" });
      assert.ok(result);
      assert.strictEqual(result.type, McpServerType.LOCAL);
    });
    test("parses remote server with url", () => {
      const result = normalizeMcpServerConfiguration({
        type: "sse",
        url: "https://example.com",
        headers: { "X-Key": "val" }
      });
      assert.ok(result);
      assert.strictEqual(result.type, McpServerType.REMOTE);
    });
    test("infers remote type from url without explicit type", () => {
      const result = normalizeMcpServerConfiguration({ url: "https://example.com" });
      assert.ok(result);
      assert.strictEqual(result.type, McpServerType.REMOTE);
    });
    test("rejects ws type", () => {
      const result = normalizeMcpServerConfiguration({ type: "ws", url: "ws://localhost:3000" });
      assert.strictEqual(result, void 0);
    });
    test("rejects local type without command", () => {
      const result = normalizeMcpServerConfiguration({ type: "stdio" });
      assert.strictEqual(result, void 0);
    });
    test("filters non-string args", () => {
      const result = normalizeMcpServerConfiguration({
        command: "test",
        args: ["valid", 42, null, "also-valid"]
      });
      assert.ok(result);
      const args = result.args;
      assert.deepStrictEqual(args, ["valid", "also-valid"]);
    });
  });
  suite("shellQuotePluginRootInCommand", () => {
    test("replaces token with path when no special chars", () => {
      const result = shellQuotePluginRootInCommand(
        "cd ${PLUGIN_ROOT} && run",
        "/simple/path",
        "${PLUGIN_ROOT}"
      );
      assert.strictEqual(result, "cd /simple/path && run");
    });
    test("quotes path with spaces", () => {
      const result = shellQuotePluginRootInCommand(
        "cd ${PLUGIN_ROOT} && run",
        "/path with spaces",
        "${PLUGIN_ROOT}"
      );
      assert.ok(result.includes('"'), "should add quotes for path with spaces");
      assert.ok(result.includes("/path with spaces"));
    });
    test("returns unchanged when token not present", () => {
      const result = shellQuotePluginRootInCommand("echo hello", "/path", "${PLUGIN_ROOT}");
      assert.strictEqual(result, "echo hello");
    });
    test("handles already-quoted token", () => {
      const result = shellQuotePluginRootInCommand(
        '"${PLUGIN_ROOT}/script.sh"',
        "/path with spaces",
        "${PLUGIN_ROOT}"
      );
      assert.ok(!result.includes('""'), "should not double-quote");
    });
  });
  suite("interpolateMcpPluginRoot", () => {
    test("replaces tokens and sets env vars without pairing array entries", () => {
      const result = interpolateMcpPluginRoot({
        name: "test",
        uri: URI.file("/plugin/.mcp.json"),
        configuration: {
          type: McpServerType.LOCAL,
          command: "${PLUGIN_ROOT}/bin/server",
          args: ["--data", "${CLAUDE_PLUGIN_ROOT}/data"]
        },
        customization: stubMcpCustomization()
      }, "/plugin", ["${PLUGIN_ROOT}", "${CLAUDE_PLUGIN_ROOT}"], ["PLUGIN_ROOT"]);
      assert.deepStrictEqual(result.configuration, {
        type: McpServerType.LOCAL,
        command: "/plugin/bin/server",
        args: ["--data", "/plugin/data"],
        env: { PLUGIN_ROOT: "/plugin" }
      });
    });
  });
  suite("convertBareEnvVarsToVsCodeSyntax", () => {
    test("converts bare env vars to VS Code syntax", () => {
      const def = {
        name: "test",
        uri: URI.file("/plugin"),
        configuration: {
          type: McpServerType.LOCAL,
          command: "${MY_TOOL}",
          args: ["--key=${API_KEY}"]
        },
        customization: stubMcpCustomization()
      };
      const result = convertBareEnvVarsToVsCodeSyntax(def);
      assert.strictEqual(result.configuration.command, "${env:MY_TOOL}");
      assert.deepStrictEqual(result.configuration.args, ["--key=${env:API_KEY}"]);
    });
    test("does not convert already-qualified vars", () => {
      const def = {
        name: "test",
        uri: URI.file("/plugin"),
        configuration: {
          type: McpServerType.LOCAL,
          command: "${env:ALREADY_QUALIFIED}"
        },
        customization: stubMcpCustomization()
      };
      const result = convertBareEnvVarsToVsCodeSyntax(def);
      assert.strictEqual(result.configuration.command, "${env:ALREADY_QUALIFIED}");
    });
    test("ignores lowercase vars", () => {
      const def = {
        name: "test",
        uri: URI.file("/plugin"),
        configuration: {
          type: McpServerType.LOCAL,
          command: "${lowercase}"
        },
        customization: stubMcpCustomization()
      };
      const result = convertBareEnvVarsToVsCodeSyntax(def);
      assert.strictEqual(result.configuration.command, "${lowercase}");
    });
  });
  suite("IParsedHookCommand.isEquals", () => {
    test("returns true for structurally equivalent commands", () => {
      const left = {
        command: "echo hi",
        windows: "Write-Host hi",
        linux: "echo hi",
        osx: "echo hi",
        cwd: URI.file("/workspace"),
        env: { A: "1" },
        timeout: 10,
        sourceUri: URI.file("/workspace/.github/hooks.yml")
      };
      const right = {
        command: "echo hi",
        windows: "Write-Host hi",
        linux: "echo hi",
        osx: "echo hi",
        cwd: URI.file("/workspace"),
        env: { A: "1" },
        timeout: 10,
        sourceUri: URI.file("/workspace/.github/hooks.yml")
      };
      assert.strictEqual(IParsedHookCommand.isEquals(left, right), true);
    });
    test("returns false when any field differs", () => {
      const left = {
        command: "echo hi",
        cwd: URI.file("/workspace"),
        env: { A: "1" },
        timeout: 10,
        sourceUri: URI.file("/workspace/.github/hooks.yml")
      };
      const right = {
        command: "echo bye",
        cwd: URI.file("/workspace/other"),
        env: { A: "2" },
        timeout: 20,
        sourceUri: URI.file("/workspace/.github/other-hooks.yml")
      };
      assert.strictEqual(IParsedHookCommand.isEquals(left, right), false);
    });
  });
  suite("toParsedAgent / toParsedSkill", () => {
    test("toParsedAgent pairs the resource with an AgentCustomization", () => {
      const uri = URI.file("/home/.claude/agents/explore.md");
      const parsed = toParsedAgent({ uri, name: "explore", description: "Explore the codebase" });
      assert.deepStrictEqual(parsed, {
        uri,
        name: "explore",
        description: "Explore the codebase",
        customization: {
          type: CustomizationType.Agent,
          id: customizationId(uri.toString()),
          uri: uri.toString(),
          name: "explore",
          description: "Explore the codebase"
        }
      });
    });
    test("toParsedSkill pairs the resource with a SkillCustomization and omits an absent description", () => {
      const uri = URI.file("/home/.claude/skills/mapper/SKILL.md");
      const parsed = toParsedSkill({ uri, name: "mapper" });
      assert.deepStrictEqual(parsed, {
        uri,
        name: "mapper",
        customization: {
          type: CustomizationType.Skill,
          id: customizationId(uri.toString()),
          uri: uri.toString(),
          name: "mapper"
        }
      });
    });
  });
  suite("makeMcpServerCustomization", () => {
    test("builds a Stopped server with DEFAULT_MCP_APP and a name-disambiguated id", () => {
      const uri = URI.file("/workspace/.mcp.json");
      const customization = makeMcpServerCustomization(uri, "fs server");
      assert.deepStrictEqual(customization, {
        type: CustomizationType.McpServer,
        id: `${customizationId(uri.toString())}#mcp=${encodeURIComponent("fs server")}`,
        uri: uri.toString(),
        name: "fs server",
        state: { kind: McpServerStatus.Stopped },
        mcpApp: DEFAULT_MCP_APP
      });
    });
    suite("Agent Plugin", () => {
      const store = new DisposableStore();
      let fileService;
      setup(() => {
        fileService = store.add(new FileService(new NullLogService()));
        store.add(fileService.registerProvider(Schemas.inMemory, store.add(new InMemoryFileSystemProvider())));
      });
      teardown(() => store.clear());
      async function write(path, contents) {
        await fileService.writeFile(URI.from({ scheme: Schemas.inMemory, path }), VSBuffer.fromString(contents));
      }
      async function parse(path = "/plugins/example") {
        const root = URI.from({ scheme: Schemas.inMemory, path });
        return parsePlugin(root, fileService, void 0, URI.from({ scheme: Schemas.inMemory, path: "/home" }), root);
      }
      test("recognizes the Agent Plugin schema and gives it precedence over legacy metadata", async () => {
        await write("/plugins/example/plugin.json", JSON.stringify({
          $schema: AGENT_PLUGIN_SCHEMA.replace("/1.0.0/", "/1.0.1/"),
          name: "agent-plugin",
          description: 42,
          unknown: true,
          extensions: "ignored"
        }));
        await write("/plugins/example/.plugin/plugin.json", JSON.stringify({ name: "legacy-plugin", commands: "./commands" }));
        await write("/plugins/example/commands/legacy.md", "# Legacy");
        await write("/plugins/example/skills/good/SKILL.md", "---\nname: good\ndescription: A valid skill\n---\nUse it.");
        await write("/plugins/example/SKILL.md", "---\nname: example\ndescription: Root fallback\n---");
        const plugin = await parse();
        assert.deepStrictEqual({
          format: plugin.format,
          skills: plugin.skills.map((skill) => skill.name),
          agents: plugin.agents.length,
          hooks: plugin.hooks.length,
          instructions: plugin.instructions.length
        }, {
          format: PluginFormat.AgentPlugin,
          skills: ["good"],
          agents: 0,
          hooks: 0,
          instructions: 0
        });
      });
      test("reads Copilot components from the sanctioned extension directory by default", async () => {
        await write("/plugins/example/plugin.json", JSON.stringify({
          $schema: AGENT_PLUGIN_SCHEMA,
          name: "example",
          extensions: {
            "com.example.client": {
              agents: { paths: ["agents"], exclusive: true }
            },
            "com.github.copilot": {}
          }
        }));
        await write("/plugins/example/com.github.copilot/agents/helper.agent.md", "---\nname: helper\ndescription: Helps\n---");
        await write("/plugins/example/com.github.copilot/rules/project.instructions.md", "---\nname: project-rule\n---");
        await write("/plugins/example/com.github.copilot/hooks/hooks.json", JSON.stringify({
          hooks: {
            PostToolUse: [{ hooks: [{ type: "command", command: "echo done" }] }]
          }
        }));
        await write("/plugins/example/agents/legacy.md", "# Legacy agent");
        await write("/plugins/example/rules/legacy.instructions.md", "# Legacy rule");
        const plugin = await parse();
        assert.deepStrictEqual({
          agents: plugin.agents.map((agent) => agent.name),
          instructions: plugin.instructions.map((instruction) => instruction.name),
          hooks: plugin.hooks.map((hook) => ({
            type: hook.type,
            commands: hook.commands.map((command) => command.command)
          }))
        }, {
          agents: ["helper"],
          instructions: ["project"],
          hooks: [{ type: "PostToolUse", commands: ["echo done"] }]
        });
      });
      test("resolves namespaced component paths relative to the extension directory", async () => {
        await write("/plugins/example/plugin.json", JSON.stringify({
          $schema: AGENT_PLUGIN_SCHEMA,
          name: "example",
          extensions: {
            "com.github.copilot": {
              agents: { paths: ["custom/agents", "../outside-agents"], exclusive: true },
              rules: { paths: ["custom/rules"], exclusive: true },
              hooks: { paths: ["custom/hooks.json"], exclusive: true },
              skills: { paths: ["custom/skills"] },
              mcpServers: { paths: ["custom/mcp.json"], exclusive: true }
            }
          }
        }));
        await write("/plugins/example/com.github.copilot/custom/agents/helper.md", "---\nname: custom-agent\n---");
        await write("/plugins/example/com.github.copilot/custom/rules/project.mdc", "# Custom rule");
        await write("/plugins/example/com.github.copilot/custom/hooks.json", JSON.stringify({
          hooks: {
            Stop: [{ type: "command", command: "echo stop" }]
          }
        }));
        await write("/plugins/example/skills/core/SKILL.md", "---\nname: core\ndescription: Core skill\n---");
        await write("/plugins/example/com.github.copilot/custom/skills/extra/SKILL.md", "---\nname: extra\ndescription: Extra skill\n---");
        await write("/plugins/example/com.github.copilot/custom/mcp.json", JSON.stringify({
          mcpServers: {
            custom: { type: "stdio", command: "custom-server" }
          }
        }));
        await write("/plugins/example/outside-agents/escape.md", "---\nname: escaped\n---");
        const plugin = await parse();
        assert.deepStrictEqual({
          agents: plugin.agents.map((agent) => agent.name),
          instructions: plugin.instructions.map((instruction) => instruction.name),
          hooks: plugin.hooks.map((hook) => hook.type),
          skills: plugin.skills.map((skill) => skill.name),
          mcpServers: plugin.mcpServers.map((server) => server.name)
        }, {
          agents: ["custom-agent"],
          instructions: ["project"],
          hooks: ["Stop"],
          skills: ["core", "extra"],
          mcpServers: ["custom"]
        });
      });
      test("reads inline Copilot extension hooks and MCP servers", async () => {
        await write("/plugins/example/plugin.json", JSON.stringify({
          $schema: AGENT_PLUGIN_SCHEMA,
          name: "example",
          extensions: {
            "com.github.copilot": {
              hooks: {
                SessionStart: [{ type: "command", command: "echo start" }]
              },
              mcpServers: {
                inline: { type: "stdio", command: "inline-server" }
              }
            }
          }
        }));
        const plugin = await parse();
        assert.deepStrictEqual({
          hooks: plugin.hooks.map((hook) => ({
            type: hook.type,
            commands: hook.commands.map((command) => command.command)
          })),
          mcpServers: plugin.mcpServers.map((server) => server.name)
        }, {
          hooks: [{ type: "SessionStart", commands: ["echo start"] }],
          mcpServers: ["inline"]
        });
      });
      test("reads usable immediate-child skills permissively", async () => {
        await write("/plugins/example/plugin.json", JSON.stringify({ $schema: AGENT_PLUGIN_SCHEMA, name: "example" }));
        await write("/plugins/example/skills/SKILL.md", "---\nname: ignored\ndescription: Not an immediate child\n---");
        await write("/plugins/example/skills/valid/SKILL.md", "---\nname: valid\ndescription: Valid skill\n---");
        await write("/plugins/example/skills/mismatch/SKILL.md", "---\nname: other\ndescription: Wrong directory\n---");
        await write("/plugins/example/skills/nested/deeper/SKILL.md", "---\nname: deeper\ndescription: Too deep\n---");
        assert.deepStrictEqual((await parse()).skills.map((skill) => skill.name), ["other", "valid"]);
      });
      test("reads known MCP fields and leaves harness placeholders unresolved", async () => {
        await write("/plugins/example/plugin.json", JSON.stringify({ $schema: AGENT_PLUGIN_SCHEMA, name: "example" }));
        await write("/plugins/example/mcp.json", JSON.stringify({
          $schema: AGENT_PLUGIN_MCP_SCHEMA.replace("/1.0.0/", "/1.0.1/"),
          mcpServers: {
            stdio: {
              type: "stdio",
              command: "server",
              args: ["${PLUGIN_ROOT}", "${PLUGIN_DATA}", "${UNKNOWN}"],
              env: { ROOT: "${PLUGIN_ROOT}" },
              cwd: "./work"
            },
            http: { type: "streamable-http", url: "https://example.com/mcp" },
            sse: { type: "sse", url: "http://127.0.0.2:3000/sse" }
          }
        }));
        const servers = new Map((await parse()).mcpServers.map((server) => [server.name, server.configuration]));
        assert.deepStrictEqual([...servers.keys()], ["http", "sse", "stdio"]);
        assert.strictEqual(servers.get("http")?.type, McpServerType.REMOTE);
        assert.strictEqual(servers.get("sse")?.type, McpServerType.REMOTE);
        const stdio = servers.get("stdio");
        assert.ok(stdio?.type === McpServerType.LOCAL);
        assert.deepStrictEqual({
          command: stdio.command,
          args: stdio.args,
          env: stdio.env,
          cwd: stdio.cwd
        }, {
          command: "server",
          args: ["${PLUGIN_ROOT}", "${PLUGIN_DATA}", "${UNKNOWN}"],
          env: { ROOT: "${PLUGIN_ROOT}" },
          cwd: "./work"
        });
      });
      test("rejects filesystem-resolved component escapes", async () => {
        class RealpathProvider extends InMemoryFileSystemProvider {
          get capabilities() {
            return super.capabilities | FileSystemProviderCapabilities.FileRealpath;
          }
          async realpath(resource) {
            return resource.path.includes("/escape") || resource.path.endsWith("/hooks/hooks.json") ? `/outside/${resource.path.split("/").at(-1)}` : resource.path;
          }
        }
        fileService = store.add(new FileService(new NullLogService()));
        store.add(fileService.registerProvider(Schemas.inMemory, store.add(new RealpathProvider())));
        await write("/plugins/example/plugin.json", JSON.stringify({
          $schema: AGENT_PLUGIN_SCHEMA,
          name: "example",
          extensions: { "com.github.copilot": {} }
        }));
        await write("/plugins/example/skills/escape/SKILL.md", "---\nname: escape\ndescription: Escaped\n---");
        await write("/plugins/example/com.github.copilot/agents/escape.md", "# Escaped agent");
        await write("/plugins/example/com.github.copilot/rules/escape.instructions.md", "# Escaped rule");
        await write("/plugins/example/com.github.copilot/hooks/hooks.json", JSON.stringify({
          hooks: { Stop: [{ type: "command", command: "echo stop" }] }
        }));
        const plugin = await parse();
        assert.deepStrictEqual({
          skills: plugin.skills,
          agents: plugin.agents,
          instructions: plugin.instructions,
          hooks: plugin.hooks
        }, {
          skills: [],
          agents: [],
          instructions: [],
          hooks: []
        });
      });
    });
    test("two servers declared in the same file get distinct ids", () => {
      const uri = URI.file("/workspace/.mcp.json");
      assert.notStrictEqual(makeMcpServerCustomization(uri, "a").id, makeMcpServerCustomization(uri, "b").id);
    });
  });
  suite("parseHooksJson", () => {
    const hookUri = URI.file("/workspace/.claude/settings.json");
    const parse = (json) => parseHooksJson(hookUri, json, void 0, URI.file("/home"));
    test("returns [] for a non-object, a missing hooks block, or disableAllHooks", () => {
      assert.deepStrictEqual(parse(void 0), []);
      assert.deepStrictEqual(parse({ model: "x" }), []);
      assert.deepStrictEqual(parse({ disableAllHooks: true, hooks: { PostToolUse: [{ hooks: [{ type: "command", command: "echo" }] }] } }), []);
    });
    test("canonicalizes event names (camelCase \u2192 PascalCase) and ignores unrecognized events", () => {
      const groups = parse({
        hooks: {
          postToolUse: [{ hooks: [{ type: "command", command: "echo a" }] }],
          bogusEvent: [{ hooks: [{ type: "command", command: "echo b" }] }]
        }
      });
      assert.deepStrictEqual(groups.map((g) => g.type), ["PostToolUse"]);
    });
    test("extracts commands from the nested matcher form and drops empty groups", () => {
      const groups = parse({
        hooks: {
          PreToolUse: [{ matcher: "Bash", hooks: [{ type: "command", command: "echo run" }] }],
          Stop: [{ matcher: "X", hooks: [{ type: "not-a-command" }] }]
        }
      });
      assert.deepStrictEqual(groups.map((g) => g.type), ["PreToolUse"]);
      assert.deepStrictEqual(groups[0].commands.map((c) => c.command), ["echo run"]);
    });
    test("extracts commands from the flat (non-nested) command form", () => {
      const groups = parse({
        hooks: { PostToolUse: [{ type: "command", command: "echo flat" }] }
      });
      assert.deepStrictEqual(groups.map((g) => g.type), ["PostToolUse"]);
      assert.deepStrictEqual(groups[0].commands.map((c) => c.command), ["echo flat"]);
    });
    test("all groups from one file share a single file-level customization", () => {
      const groups = parse({
        hooks: {
          PreToolUse: [{ hooks: [{ type: "command", command: "a" }] }],
          PostToolUse: [{ hooks: [{ type: "command", command: "b" }] }]
        }
      });
      assert.strictEqual(groups.length, 2);
      assert.strictEqual(groups[0].customization, groups[1].customization);
      assert.deepStrictEqual(groups[0].customization, {
        type: CustomizationType.Hook,
        id: customizationId(hookUri.toString()),
        uri: hookUri.toString(),
        name: "settings.json"
      });
    });
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxwbGF0Zm9ybVxcYWdlbnRQbHVnaW5zXFx0ZXN0XFxjb21tb25cXHBsdWdpblBhcnNlcnMudGVzdC50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCBhc3NlcnQgZnJvbSAnYXNzZXJ0JztcbmltcG9ydCB7IFZTQnVmZmVyIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vYnVmZmVyLmpzJztcbmltcG9ydCB7IERpc3Bvc2FibGVTdG9yZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBTY2hlbWFzIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbmV0d29yay5qcyc7XG5pbXBvcnQgeyBVUkkgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi91cmkuanMnO1xuaW1wb3J0IHsgZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS90ZXN0L2NvbW1vbi91dGlscy5qcyc7XG5pbXBvcnQgeyBGaWxlU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL2ZpbGVzL2NvbW1vbi9maWxlU2VydmljZS5qcyc7XG5pbXBvcnQgeyBGaWxlU3lzdGVtUHJvdmlkZXJDYXBhYmlsaXRpZXMgfSBmcm9tICcuLi8uLi8uLi9maWxlcy9jb21tb24vZmlsZXMuanMnO1xuaW1wb3J0IHsgSW5NZW1vcnlGaWxlU3lzdGVtUHJvdmlkZXIgfSBmcm9tICcuLi8uLi8uLi9maWxlcy9jb21tb24vaW5NZW1vcnlGaWxlc3lzdGVtUHJvdmlkZXIuanMnO1xuaW1wb3J0IHsgTnVsbExvZ1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9sb2cvY29tbW9uL2xvZy5qcyc7XG5pbXBvcnQgeyBNY3BTZXJ2ZXJUeXBlIH0gZnJvbSAnLi4vLi4vLi4vbWNwL2NvbW1vbi9tY3BQbGF0Zm9ybVR5cGVzLmpzJztcbmltcG9ydCB7IEN1c3RvbWl6YXRpb25UeXBlLCBNY3BTZXJ2ZXJTdGF0dXMsIHR5cGUgTWNwU2VydmVyQ3VzdG9taXphdGlvbiB9IGZyb20gJy4uLy4uLy4uL2FnZW50SG9zdC9jb21tb24vc3RhdGUvcHJvdG9jb2wvc3RhdGUuanMnO1xuaW1wb3J0IHsgREVGQVVMVF9NQ1BfQVBQIH0gZnJvbSAnLi4vLi4vLi4vYWdlbnRIb3N0L2NvbW1vbi9zdGF0ZS9wcm90b2NvbC9tY3BBcHBEZWZhdWx0cy5qcyc7XG5pbXBvcnQgeyBjdXN0b21pemF0aW9uSWQgfSBmcm9tICcuLi8uLi8uLi9hZ2VudEhvc3QvY29tbW9uL3N0YXRlL3Nlc3Npb25TdGF0ZS5qcyc7XG5cbmZ1bmN0aW9uIHN0dWJNY3BDdXN0b21pemF0aW9uKCk6IE1jcFNlcnZlckN1c3RvbWl6YXRpb24ge1xuXHRyZXR1cm4geyB0eXBlOiBDdXN0b21pemF0aW9uVHlwZS5NY3BTZXJ2ZXIsIGlkOiAnc3R1YicsIHVyaTogJ2ZpbGU6Ly8vcGx1Z2luJywgbmFtZTogJ3Rlc3QnLCBzdGF0ZTogeyBraW5kOiBNY3BTZXJ2ZXJTdGF0dXMuU3RhcnRpbmcgfSB9O1xufVxuaW1wb3J0IHtcblx0SVBhcnNlZEhvb2tDb21tYW5kLFxuXHRtYWtlTWNwU2VydmVyQ3VzdG9taXphdGlvbixcblx0cGFyc2VDb21wb25lbnRQYXRoQ29uZmlnLFxuXHRwYXJzZUhvb2tzSnNvbixcblx0cmVzb2x2ZUNvbXBvbmVudERpcnMsXG5cdG5vcm1hbGl6ZU1jcFNlcnZlckNvbmZpZ3VyYXRpb24sXG5cdHNoZWxsUXVvdGVQbHVnaW5Sb290SW5Db21tYW5kLFxuXHRpbnRlcnBvbGF0ZU1jcFBsdWdpblJvb3QsXG5cdGNvbnZlcnRCYXJlRW52VmFyc1RvVnNDb2RlU3ludGF4LFxuXHR0b1BhcnNlZEFnZW50LFxuXHR0b1BhcnNlZFNraWxsLFxuXHRwYXJzZVBsdWdpbixcblx0UGx1Z2luRm9ybWF0LFxufSBmcm9tICcuLi8uLi9jb21tb24vcGx1Z2luUGFyc2Vycy5qcyc7XG5pbXBvcnQgeyBBR0VOVF9QTFVHSU5fTUNQX1NDSEVNQSwgQUdFTlRfUExVR0lOX1NDSEVNQSB9IGZyb20gJy4uLy4uL2NvbW1vbi9hZ2VudFBsdWdpblBhcnNlci5qcyc7XG5cbnN1aXRlKCdwbHVnaW5QYXJzZXJzJywgKCkgPT4ge1xuXG5cdGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSgpO1xuXG5cdC8vIC0tLS0gcGFyc2VDb21wb25lbnRQYXRoQ29uZmlnIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuXG5cdHN1aXRlKCdwYXJzZUNvbXBvbmVudFBhdGhDb25maWcnLCAoKSA9PiB7XG5cblx0XHR0ZXN0KCdyZXR1cm5zIGVtcHR5IGNvbmZpZyBmb3IgdW5kZWZpbmVkJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgcmVzdWx0ID0gcGFyc2VDb21wb25lbnRQYXRoQ29uZmlnKHVuZGVmaW5lZCk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHJlc3VsdCwgeyBwYXRoczogW10sIGV4Y2x1c2l2ZTogZmFsc2UgfSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdyZXR1cm5zIGVtcHR5IGNvbmZpZyBmb3IgbnVsbCcsICgpID0+IHtcblx0XHRcdGNvbnN0IHJlc3VsdCA9IHBhcnNlQ29tcG9uZW50UGF0aENvbmZpZyhudWxsKTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocmVzdWx0LCB7IHBhdGhzOiBbXSwgZXhjbHVzaXZlOiBmYWxzZSB9KTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3BhcnNlcyBhIHN0cmluZyB0byBzaW5nbGUtZWxlbWVudCBwYXRocycsICgpID0+IHtcblx0XHRcdGNvbnN0IHJlc3VsdCA9IHBhcnNlQ29tcG9uZW50UGF0aENvbmZpZygnY3VzdG9tL3NraWxscycpO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChyZXN1bHQsIHsgcGF0aHM6IFsnY3VzdG9tL3NraWxscyddLCBleGNsdXNpdmU6IGZhbHNlIH0pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgndHJpbXMgd2hpdGVzcGFjZSBmcm9tIHN0cmluZycsICgpID0+IHtcblx0XHRcdGNvbnN0IHJlc3VsdCA9IHBhcnNlQ29tcG9uZW50UGF0aENvbmZpZygnICBzcGFjZWQgICcpO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChyZXN1bHQsIHsgcGF0aHM6IFsnc3BhY2VkJ10sIGV4Y2x1c2l2ZTogZmFsc2UgfSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdyZXR1cm5zIGVtcHR5IGZvciBibGFuayBzdHJpbmcnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCByZXN1bHQgPSBwYXJzZUNvbXBvbmVudFBhdGhDb25maWcoJyAgICcpO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChyZXN1bHQsIHsgcGF0aHM6IFtdLCBleGNsdXNpdmU6IGZhbHNlIH0pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgncGFyc2VzIGEgc3RyaW5nIGFycmF5JywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgcmVzdWx0ID0gcGFyc2VDb21wb25lbnRQYXRoQ29uZmlnKFsnYScsICdiJywgJ2MnXSk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHJlc3VsdCwgeyBwYXRoczogWydhJywgJ2InLCAnYyddLCBleGNsdXNpdmU6IGZhbHNlIH0pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnZmlsdGVycyBub24tc3RyaW5nIGVudHJpZXMgZnJvbSBhcnJheXMnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCByZXN1bHQgPSBwYXJzZUNvbXBvbmVudFBhdGhDb25maWcoWyd2YWxpZCcsIDQyLCBudWxsLCAnb2snXSk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHJlc3VsdCwgeyBwYXRoczogWyd2YWxpZCcsICdvayddLCBleGNsdXNpdmU6IGZhbHNlIH0pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgncGFyc2VzIG9iamVjdCB3aXRoIHBhdGhzIGFuZCBleGNsdXNpdmUnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCByZXN1bHQgPSBwYXJzZUNvbXBvbmVudFBhdGhDb25maWcoeyBwYXRoczogWyd4JywgJ3knXSwgZXhjbHVzaXZlOiB0cnVlIH0pO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChyZXN1bHQsIHsgcGF0aHM6IFsneCcsICd5J10sIGV4Y2x1c2l2ZTogdHJ1ZSB9KTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ29iamVjdCB3aXRob3V0IGV4Y2x1c2l2ZSBkZWZhdWx0cyB0byBmYWxzZScsICgpID0+IHtcblx0XHRcdGNvbnN0IHJlc3VsdCA9IHBhcnNlQ29tcG9uZW50UGF0aENvbmZpZyh7IHBhdGhzOiBbJ3onXSB9KTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocmVzdWx0LCB7IHBhdGhzOiBbJ3onXSwgZXhjbHVzaXZlOiBmYWxzZSB9KTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3JldHVybnMgZW1wdHkgZm9yIHVucmVjb2duaXplZCB0eXBlcycsICgpID0+IHtcblx0XHRcdGNvbnN0IHJlc3VsdCA9IHBhcnNlQ29tcG9uZW50UGF0aENvbmZpZyg0Mik7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHJlc3VsdCwgeyBwYXRoczogW10sIGV4Y2x1c2l2ZTogZmFsc2UgfSk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdC8vIC0tLS0gcmVzb2x2ZUNvbXBvbmVudERpcnMgLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuXG5cdHN1aXRlKCdyZXNvbHZlQ29tcG9uZW50RGlycycsICgpID0+IHtcblxuXHRcdGNvbnN0IHBsdWdpblVyaSA9IFVSSS5maWxlKCcvd29ya3NwYWNlLy5wbHVnaW4tcm9vdCcpO1xuXG5cdFx0dGVzdCgnaW5jbHVkZXMgZGVmYXVsdCBkaXJlY3Rvcnkgd2hlbiBub3QgZXhjbHVzaXZlJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgZGlycyA9IHJlc29sdmVDb21wb25lbnREaXJzKHBsdWdpblVyaSwgJ3NraWxscycsIHsgcGF0aHM6IFtdLCBleGNsdXNpdmU6IGZhbHNlIH0pO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGRpcnMubGVuZ3RoLCAxKTtcblx0XHRcdGFzc2VydC5vayhkaXJzWzBdLnBhdGguZW5kc1dpdGgoJy9za2lsbHMnKSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdleGNsdWRlcyBkZWZhdWx0IGRpcmVjdG9yeSB3aGVuIGV4Y2x1c2l2ZScsICgpID0+IHtcblx0XHRcdGNvbnN0IGRpcnMgPSByZXNvbHZlQ29tcG9uZW50RGlycyhwbHVnaW5VcmksICdza2lsbHMnLCB7IHBhdGhzOiBbJ2N1c3RvbSddLCBleGNsdXNpdmU6IHRydWUgfSk7XG5cdFx0XHRhc3NlcnQub2soIWRpcnMuc29tZShkID0+IGQucGF0aC5lbmRzV2l0aCgnL3NraWxscycpKSk7XG5cdFx0XHRhc3NlcnQub2soZGlycy5zb21lKGQgPT4gZC5wYXRoLmVuZHNXaXRoKCcvY3VzdG9tJykpKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3Jlc29sdmVzIHJlbGF0aXZlIHBhdGhzIGZyb20gcGx1Z2luIHJvb3QnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBkaXJzID0gcmVzb2x2ZUNvbXBvbmVudERpcnMocGx1Z2luVXJpLCAnc2tpbGxzJywgeyBwYXRoczogWydvdGhlci9za2lsbHMnXSwgZXhjbHVzaXZlOiBmYWxzZSB9KTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChkaXJzLmxlbmd0aCwgMik7XG5cdFx0XHRhc3NlcnQub2soZGlyc1sxXS5wYXRoLmVuZHNXaXRoKCcvb3RoZXIvc2tpbGxzJykpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgncmVqZWN0cyBwYXRocyB0aGF0IGVzY2FwZSBwbHVnaW4gcm9vdCcsICgpID0+IHtcblx0XHRcdGNvbnN0IGRpcnMgPSByZXNvbHZlQ29tcG9uZW50RGlycyhwbHVnaW5VcmksICdza2lsbHMnLCB7IHBhdGhzOiBbJy4uLy4uL291dHNpZGUnXSwgZXhjbHVzaXZlOiBmYWxzZSB9KTtcblx0XHRcdC8vIFNob3VsZCBvbmx5IGhhdmUgdGhlIGRlZmF1bHQgZGlyLCB0aGUgdHJhdmVyc2FsIHBhdGggaXMgcmVqZWN0ZWRcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChkaXJzLmxlbmd0aCwgMSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdhbGxvd3MgcGF0aHMgdGhhdCBlc2NhcGUgcGx1Z2luIHJvb3QgYnV0IHN0YXkgd2l0aGluIGJvdW5kYXJ5VXJpJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgYm91bmRhcnlVcmkgPSBVUkkuZmlsZSgnL3dvcmtzcGFjZScpO1xuXHRcdFx0Y29uc3QgZGlycyA9IHJlc29sdmVDb21wb25lbnREaXJzKHBsdWdpblVyaSwgJ3NraWxscycsIHsgcGF0aHM6IFsnLi4vc2hhcmVkLXNraWxscyddLCBleGNsdXNpdmU6IGZhbHNlIH0sIGJvdW5kYXJ5VXJpKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChkaXJzLmxlbmd0aCwgMik7XG5cdFx0XHRhc3NlcnQub2soZGlyc1sxXS5wYXRoLmVuZHNXaXRoKCcvc2hhcmVkLXNraWxscycpKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3JlamVjdHMgcGF0aHMgdGhhdCBlc2NhcGUgYm91bmRhcnlVcmknLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBib3VuZGFyeVVyaSA9IFVSSS5maWxlKCcvd29ya3NwYWNlJyk7XG5cdFx0XHRjb25zdCBkaXJzID0gcmVzb2x2ZUNvbXBvbmVudERpcnMocGx1Z2luVXJpLCAnc2tpbGxzJywgeyBwYXRoczogWycuLi8uLi9vdXRzaWRlJ10sIGV4Y2x1c2l2ZTogZmFsc2UgfSwgYm91bmRhcnlVcmkpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGRpcnMubGVuZ3RoLCAxKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2ZhbGxzIGJhY2sgdG8gcGx1Z2luVXJpIHdoZW4gYm91bmRhcnlVcmkgaXMgbm90IGFuIGFuY2VzdG9yIG9mIHBsdWdpblVyaScsICgpID0+IHtcblx0XHRcdGNvbnN0IGJvdW5kYXJ5VXJpID0gVVJJLmZpbGUoJy91bnJlbGF0ZWQvZGlyZWN0b3J5Jyk7XG5cdFx0XHRjb25zdCBkaXJzID0gcmVzb2x2ZUNvbXBvbmVudERpcnMocGx1Z2luVXJpLCAnc2tpbGxzJywgeyBwYXRoczogWydjdXN0b20nXSwgZXhjbHVzaXZlOiBmYWxzZSB9LCBib3VuZGFyeVVyaSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZGlycy5sZW5ndGgsIDIpO1xuXHRcdFx0YXNzZXJ0Lm9rKGRpcnNbMV0ucGF0aC5lbmRzV2l0aCgnL2N1c3RvbScpKTtcblx0XHR9KTtcblx0fSk7XG5cblx0Ly8gLS0tLSBub3JtYWxpemVNY3BTZXJ2ZXJDb25maWd1cmF0aW9uIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG5cblx0c3VpdGUoJ25vcm1hbGl6ZU1jcFNlcnZlckNvbmZpZ3VyYXRpb24nLCAoKSA9PiB7XG5cblx0XHR0ZXN0KCdyZXR1cm5zIHVuZGVmaW5lZCBmb3Igbm9uLW9iamVjdCBpbnB1dCcsICgpID0+IHtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChub3JtYWxpemVNY3BTZXJ2ZXJDb25maWd1cmF0aW9uKG51bGwpLCB1bmRlZmluZWQpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG5vcm1hbGl6ZU1jcFNlcnZlckNvbmZpZ3VyYXRpb24oJ3N0cmluZycpLCB1bmRlZmluZWQpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG5vcm1hbGl6ZU1jcFNlcnZlckNvbmZpZ3VyYXRpb24oNDIpLCB1bmRlZmluZWQpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgncGFyc2VzIGxvY2FsIHNlcnZlciB3aXRoIGNvbW1hbmQnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCByZXN1bHQgPSBub3JtYWxpemVNY3BTZXJ2ZXJDb25maWd1cmF0aW9uKHtcblx0XHRcdFx0dHlwZTogJ3N0ZGlvJyxcblx0XHRcdFx0Y29tbWFuZDogJ25vZGUnLFxuXHRcdFx0XHRhcmdzOiBbJ3NlcnZlci5qcyddLFxuXHRcdFx0XHRlbnY6IHsgS0VZOiAndmFsdWUnIH0sXG5cdFx0XHRcdGN3ZDogJy93b3Jrc3BhY2UnLFxuXHRcdFx0fSk7XG5cdFx0XHRhc3NlcnQub2socmVzdWx0KTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQhLnR5cGUsIE1jcFNlcnZlclR5cGUuTE9DQUwpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKChyZXN1bHQgYXMgeyBjb21tYW5kOiBzdHJpbmcgfSkuY29tbWFuZCwgJ25vZGUnKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2luZmVycyBsb2NhbCB0eXBlIGZyb20gY29tbWFuZCB3aXRob3V0IGV4cGxpY2l0IHR5cGUnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCByZXN1bHQgPSBub3JtYWxpemVNY3BTZXJ2ZXJDb25maWd1cmF0aW9uKHsgY29tbWFuZDogJ3B5dGhvbicgfSk7XG5cdFx0XHRhc3NlcnQub2socmVzdWx0KTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQhLnR5cGUsIE1jcFNlcnZlclR5cGUuTE9DQUwpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgncGFyc2VzIHJlbW90ZSBzZXJ2ZXIgd2l0aCB1cmwnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCByZXN1bHQgPSBub3JtYWxpemVNY3BTZXJ2ZXJDb25maWd1cmF0aW9uKHtcblx0XHRcdFx0dHlwZTogJ3NzZScsXG5cdFx0XHRcdHVybDogJ2h0dHBzOi8vZXhhbXBsZS5jb20nLFxuXHRcdFx0XHRoZWFkZXJzOiB7ICdYLUtleSc6ICd2YWwnIH0sXG5cdFx0XHR9KTtcblx0XHRcdGFzc2VydC5vayhyZXN1bHQpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdCEudHlwZSwgTWNwU2VydmVyVHlwZS5SRU1PVEUpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnaW5mZXJzIHJlbW90ZSB0eXBlIGZyb20gdXJsIHdpdGhvdXQgZXhwbGljaXQgdHlwZScsICgpID0+IHtcblx0XHRcdGNvbnN0IHJlc3VsdCA9IG5vcm1hbGl6ZU1jcFNlcnZlckNvbmZpZ3VyYXRpb24oeyB1cmw6ICdodHRwczovL2V4YW1wbGUuY29tJyB9KTtcblx0XHRcdGFzc2VydC5vayhyZXN1bHQpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdCEudHlwZSwgTWNwU2VydmVyVHlwZS5SRU1PVEUpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgncmVqZWN0cyB3cyB0eXBlJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgcmVzdWx0ID0gbm9ybWFsaXplTWNwU2VydmVyQ29uZmlndXJhdGlvbih7IHR5cGU6ICd3cycsIHVybDogJ3dzOi8vbG9jYWxob3N0OjMwMDAnIH0pO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdCwgdW5kZWZpbmVkKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3JlamVjdHMgbG9jYWwgdHlwZSB3aXRob3V0IGNvbW1hbmQnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCByZXN1bHQgPSBub3JtYWxpemVNY3BTZXJ2ZXJDb25maWd1cmF0aW9uKHsgdHlwZTogJ3N0ZGlvJyB9KTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQsIHVuZGVmaW5lZCk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdmaWx0ZXJzIG5vbi1zdHJpbmcgYXJncycsICgpID0+IHtcblx0XHRcdGNvbnN0IHJlc3VsdCA9IG5vcm1hbGl6ZU1jcFNlcnZlckNvbmZpZ3VyYXRpb24oe1xuXHRcdFx0XHRjb21tYW5kOiAndGVzdCcsXG5cdFx0XHRcdGFyZ3M6IFsndmFsaWQnLCA0MiwgbnVsbCwgJ2Fsc28tdmFsaWQnXSxcblx0XHRcdH0pO1xuXHRcdFx0YXNzZXJ0Lm9rKHJlc3VsdCk7XG5cdFx0XHRjb25zdCBhcmdzID0gKHJlc3VsdCBhcyB7IGFyZ3M/OiBzdHJpbmdbXSB9KS5hcmdzO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChhcmdzLCBbJ3ZhbGlkJywgJ2Fsc28tdmFsaWQnXSk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdC8vIC0tLS0gc2hlbGxRdW90ZVBsdWdpblJvb3RJbkNvbW1hbmQgLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cblxuXHRzdWl0ZSgnc2hlbGxRdW90ZVBsdWdpblJvb3RJbkNvbW1hbmQnLCAoKSA9PiB7XG5cblx0XHR0ZXN0KCdyZXBsYWNlcyB0b2tlbiB3aXRoIHBhdGggd2hlbiBubyBzcGVjaWFsIGNoYXJzJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgcmVzdWx0ID0gc2hlbGxRdW90ZVBsdWdpblJvb3RJbkNvbW1hbmQoXG5cdFx0XHRcdCdjZCAke1BMVUdJTl9ST09UfSAmJiBydW4nLFxuXHRcdFx0XHQnL3NpbXBsZS9wYXRoJyxcblx0XHRcdFx0JyR7UExVR0lOX1JPT1R9J1xuXHRcdFx0KTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQsICdjZCAvc2ltcGxlL3BhdGggJiYgcnVuJyk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdxdW90ZXMgcGF0aCB3aXRoIHNwYWNlcycsICgpID0+IHtcblx0XHRcdGNvbnN0IHJlc3VsdCA9IHNoZWxsUXVvdGVQbHVnaW5Sb290SW5Db21tYW5kKFxuXHRcdFx0XHQnY2QgJHtQTFVHSU5fUk9PVH0gJiYgcnVuJyxcblx0XHRcdFx0Jy9wYXRoIHdpdGggc3BhY2VzJyxcblx0XHRcdFx0JyR7UExVR0lOX1JPT1R9J1xuXHRcdFx0KTtcblx0XHRcdGFzc2VydC5vayhyZXN1bHQuaW5jbHVkZXMoJ1wiJyksICdzaG91bGQgYWRkIHF1b3RlcyBmb3IgcGF0aCB3aXRoIHNwYWNlcycpO1xuXHRcdFx0YXNzZXJ0Lm9rKHJlc3VsdC5pbmNsdWRlcygnL3BhdGggd2l0aCBzcGFjZXMnKSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdyZXR1cm5zIHVuY2hhbmdlZCB3aGVuIHRva2VuIG5vdCBwcmVzZW50JywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgcmVzdWx0ID0gc2hlbGxRdW90ZVBsdWdpblJvb3RJbkNvbW1hbmQoJ2VjaG8gaGVsbG8nLCAnL3BhdGgnLCAnJHtQTFVHSU5fUk9PVH0nKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQsICdlY2hvIGhlbGxvJyk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdoYW5kbGVzIGFscmVhZHktcXVvdGVkIHRva2VuJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgcmVzdWx0ID0gc2hlbGxRdW90ZVBsdWdpblJvb3RJbkNvbW1hbmQoXG5cdFx0XHRcdCdcIiR7UExVR0lOX1JPT1R9L3NjcmlwdC5zaFwiJyxcblx0XHRcdFx0Jy9wYXRoIHdpdGggc3BhY2VzJyxcblx0XHRcdFx0JyR7UExVR0lOX1JPT1R9J1xuXHRcdFx0KTtcblx0XHRcdGFzc2VydC5vayghcmVzdWx0LmluY2x1ZGVzKCdcIlwiJyksICdzaG91bGQgbm90IGRvdWJsZS1xdW90ZScpO1xuXHRcdH0pO1xuXHR9KTtcblxuXHRzdWl0ZSgnaW50ZXJwb2xhdGVNY3BQbHVnaW5Sb290JywgKCkgPT4ge1xuXG5cdFx0dGVzdCgncmVwbGFjZXMgdG9rZW5zIGFuZCBzZXRzIGVudiB2YXJzIHdpdGhvdXQgcGFpcmluZyBhcnJheSBlbnRyaWVzJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgcmVzdWx0ID0gaW50ZXJwb2xhdGVNY3BQbHVnaW5Sb290KHtcblx0XHRcdFx0bmFtZTogJ3Rlc3QnLFxuXHRcdFx0XHR1cmk6IFVSSS5maWxlKCcvcGx1Z2luLy5tY3AuanNvbicpLFxuXHRcdFx0XHRjb25maWd1cmF0aW9uOiB7XG5cdFx0XHRcdFx0dHlwZTogTWNwU2VydmVyVHlwZS5MT0NBTCxcblx0XHRcdFx0XHRjb21tYW5kOiAnJHtQTFVHSU5fUk9PVH0vYmluL3NlcnZlcicsXG5cdFx0XHRcdFx0YXJnczogWyctLWRhdGEnLCAnJHtDTEFVREVfUExVR0lOX1JPT1R9L2RhdGEnXSxcblx0XHRcdFx0fSxcblx0XHRcdFx0Y3VzdG9taXphdGlvbjogc3R1Yk1jcEN1c3RvbWl6YXRpb24oKSxcblx0XHRcdH0sICcvcGx1Z2luJywgWycke1BMVUdJTl9ST09UfScsICcke0NMQVVERV9QTFVHSU5fUk9PVH0nXSwgWydQTFVHSU5fUk9PVCddKTtcblxuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChyZXN1bHQuY29uZmlndXJhdGlvbiwge1xuXHRcdFx0XHR0eXBlOiBNY3BTZXJ2ZXJUeXBlLkxPQ0FMLFxuXHRcdFx0XHRjb21tYW5kOiAnL3BsdWdpbi9iaW4vc2VydmVyJyxcblx0XHRcdFx0YXJnczogWyctLWRhdGEnLCAnL3BsdWdpbi9kYXRhJ10sXG5cdFx0XHRcdGVudjogeyBQTFVHSU5fUk9PVDogJy9wbHVnaW4nIH0sXG5cdFx0XHR9KTtcblx0XHR9KTtcblx0fSk7XG5cblx0Ly8gLS0tLSBjb252ZXJ0QmFyZUVudlZhcnNUb1ZzQ29kZVN5bnRheCAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG5cblx0c3VpdGUoJ2NvbnZlcnRCYXJlRW52VmFyc1RvVnNDb2RlU3ludGF4JywgKCkgPT4ge1xuXG5cdFx0dGVzdCgnY29udmVydHMgYmFyZSBlbnYgdmFycyB0byBWUyBDb2RlIHN5bnRheCcsICgpID0+IHtcblx0XHRcdGNvbnN0IGRlZiA9IHtcblx0XHRcdFx0bmFtZTogJ3Rlc3QnLFxuXHRcdFx0XHR1cmk6IFVSSS5maWxlKCcvcGx1Z2luJyksXG5cdFx0XHRcdGNvbmZpZ3VyYXRpb246IHtcblx0XHRcdFx0XHR0eXBlOiBNY3BTZXJ2ZXJUeXBlLkxPQ0FMIGFzIGNvbnN0LFxuXHRcdFx0XHRcdGNvbW1hbmQ6ICcke01ZX1RPT0x9Jyxcblx0XHRcdFx0XHRhcmdzOiBbJy0ta2V5PSR7QVBJX0tFWX0nXSxcblx0XHRcdFx0fSxcblx0XHRcdFx0Y3VzdG9taXphdGlvbjogc3R1Yk1jcEN1c3RvbWl6YXRpb24oKSxcblx0XHRcdH07XG5cdFx0XHRjb25zdCByZXN1bHQgPSBjb252ZXJ0QmFyZUVudlZhcnNUb1ZzQ29kZVN5bnRheChkZWYpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKChyZXN1bHQuY29uZmlndXJhdGlvbiBhcyB7IGNvbW1hbmQ6IHN0cmluZyB9KS5jb21tYW5kLCAnJHtlbnY6TVlfVE9PTH0nKTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoKHJlc3VsdC5jb25maWd1cmF0aW9uIGFzIHVua25vd24gYXMgeyBhcmdzOiBzdHJpbmdbXSB9KS5hcmdzLCBbJy0ta2V5PSR7ZW52OkFQSV9LRVl9J10pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnZG9lcyBub3QgY29udmVydCBhbHJlYWR5LXF1YWxpZmllZCB2YXJzJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgZGVmID0ge1xuXHRcdFx0XHRuYW1lOiAndGVzdCcsXG5cdFx0XHRcdHVyaTogVVJJLmZpbGUoJy9wbHVnaW4nKSxcblx0XHRcdFx0Y29uZmlndXJhdGlvbjoge1xuXHRcdFx0XHRcdHR5cGU6IE1jcFNlcnZlclR5cGUuTE9DQUwgYXMgY29uc3QsXG5cdFx0XHRcdFx0Y29tbWFuZDogJyR7ZW52OkFMUkVBRFlfUVVBTElGSUVEfScsXG5cdFx0XHRcdH0sXG5cdFx0XHRcdGN1c3RvbWl6YXRpb246IHN0dWJNY3BDdXN0b21pemF0aW9uKCksXG5cdFx0XHR9O1xuXHRcdFx0Y29uc3QgcmVzdWx0ID0gY29udmVydEJhcmVFbnZWYXJzVG9Wc0NvZGVTeW50YXgoZGVmKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbCgocmVzdWx0LmNvbmZpZ3VyYXRpb24gYXMgeyBjb21tYW5kOiBzdHJpbmcgfSkuY29tbWFuZCwgJyR7ZW52OkFMUkVBRFlfUVVBTElGSUVEfScpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnaWdub3JlcyBsb3dlcmNhc2UgdmFycycsICgpID0+IHtcblx0XHRcdGNvbnN0IGRlZiA9IHtcblx0XHRcdFx0bmFtZTogJ3Rlc3QnLFxuXHRcdFx0XHR1cmk6IFVSSS5maWxlKCcvcGx1Z2luJyksXG5cdFx0XHRcdGNvbmZpZ3VyYXRpb246IHtcblx0XHRcdFx0XHR0eXBlOiBNY3BTZXJ2ZXJUeXBlLkxPQ0FMIGFzIGNvbnN0LFxuXHRcdFx0XHRcdGNvbW1hbmQ6ICcke2xvd2VyY2FzZX0nLFxuXHRcdFx0XHR9LFxuXHRcdFx0XHRjdXN0b21pemF0aW9uOiBzdHViTWNwQ3VzdG9taXphdGlvbigpLFxuXHRcdFx0fTtcblx0XHRcdGNvbnN0IHJlc3VsdCA9IGNvbnZlcnRCYXJlRW52VmFyc1RvVnNDb2RlU3ludGF4KGRlZik7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoKHJlc3VsdC5jb25maWd1cmF0aW9uIGFzIHsgY29tbWFuZDogc3RyaW5nIH0pLmNvbW1hbmQsICcke2xvd2VyY2FzZX0nKTtcblx0XHR9KTtcblx0fSk7XG5cblx0c3VpdGUoJ0lQYXJzZWRIb29rQ29tbWFuZC5pc0VxdWFscycsICgpID0+IHtcblxuXHRcdHRlc3QoJ3JldHVybnMgdHJ1ZSBmb3Igc3RydWN0dXJhbGx5IGVxdWl2YWxlbnQgY29tbWFuZHMnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBsZWZ0OiBJUGFyc2VkSG9va0NvbW1hbmQgPSB7XG5cdFx0XHRcdGNvbW1hbmQ6ICdlY2hvIGhpJyxcblx0XHRcdFx0d2luZG93czogJ1dyaXRlLUhvc3QgaGknLFxuXHRcdFx0XHRsaW51eDogJ2VjaG8gaGknLFxuXHRcdFx0XHRvc3g6ICdlY2hvIGhpJyxcblx0XHRcdFx0Y3dkOiBVUkkuZmlsZSgnL3dvcmtzcGFjZScpLFxuXHRcdFx0XHRlbnY6IHsgQTogJzEnIH0sXG5cdFx0XHRcdHRpbWVvdXQ6IDEwLFxuXHRcdFx0XHRzb3VyY2VVcmk6IFVSSS5maWxlKCcvd29ya3NwYWNlLy5naXRodWIvaG9va3MueW1sJylcblx0XHRcdH07XG5cdFx0XHRjb25zdCByaWdodDogSVBhcnNlZEhvb2tDb21tYW5kID0ge1xuXHRcdFx0XHRjb21tYW5kOiAnZWNobyBoaScsXG5cdFx0XHRcdHdpbmRvd3M6ICdXcml0ZS1Ib3N0IGhpJyxcblx0XHRcdFx0bGludXg6ICdlY2hvIGhpJyxcblx0XHRcdFx0b3N4OiAnZWNobyBoaScsXG5cdFx0XHRcdGN3ZDogVVJJLmZpbGUoJy93b3Jrc3BhY2UnKSxcblx0XHRcdFx0ZW52OiB7IEE6ICcxJyB9LFxuXHRcdFx0XHR0aW1lb3V0OiAxMCxcblx0XHRcdFx0c291cmNlVXJpOiBVUkkuZmlsZSgnL3dvcmtzcGFjZS8uZ2l0aHViL2hvb2tzLnltbCcpXG5cdFx0XHR9O1xuXG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoSVBhcnNlZEhvb2tDb21tYW5kLmlzRXF1YWxzKGxlZnQsIHJpZ2h0KSwgdHJ1ZSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdyZXR1cm5zIGZhbHNlIHdoZW4gYW55IGZpZWxkIGRpZmZlcnMnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBsZWZ0OiBJUGFyc2VkSG9va0NvbW1hbmQgPSB7XG5cdFx0XHRcdGNvbW1hbmQ6ICdlY2hvIGhpJyxcblx0XHRcdFx0Y3dkOiBVUkkuZmlsZSgnL3dvcmtzcGFjZScpLFxuXHRcdFx0XHRlbnY6IHsgQTogJzEnIH0sXG5cdFx0XHRcdHRpbWVvdXQ6IDEwLFxuXHRcdFx0XHRzb3VyY2VVcmk6IFVSSS5maWxlKCcvd29ya3NwYWNlLy5naXRodWIvaG9va3MueW1sJylcblx0XHRcdH07XG5cdFx0XHRjb25zdCByaWdodDogSVBhcnNlZEhvb2tDb21tYW5kID0ge1xuXHRcdFx0XHRjb21tYW5kOiAnZWNobyBieWUnLFxuXHRcdFx0XHRjd2Q6IFVSSS5maWxlKCcvd29ya3NwYWNlL290aGVyJyksXG5cdFx0XHRcdGVudjogeyBBOiAnMicgfSxcblx0XHRcdFx0dGltZW91dDogMjAsXG5cdFx0XHRcdHNvdXJjZVVyaTogVVJJLmZpbGUoJy93b3Jrc3BhY2UvLmdpdGh1Yi9vdGhlci1ob29rcy55bWwnKVxuXHRcdFx0fTtcblxuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKElQYXJzZWRIb29rQ29tbWFuZC5pc0VxdWFscyhsZWZ0LCByaWdodCksIGZhbHNlKTtcblx0XHR9KTtcblx0fSk7XG5cblx0c3VpdGUoJ3RvUGFyc2VkQWdlbnQgLyB0b1BhcnNlZFNraWxsJywgKCkgPT4ge1xuXG5cdFx0dGVzdCgndG9QYXJzZWRBZ2VudCBwYWlycyB0aGUgcmVzb3VyY2Ugd2l0aCBhbiBBZ2VudEN1c3RvbWl6YXRpb24nLCAoKSA9PiB7XG5cdFx0XHRjb25zdCB1cmkgPSBVUkkuZmlsZSgnL2hvbWUvLmNsYXVkZS9hZ2VudHMvZXhwbG9yZS5tZCcpO1xuXHRcdFx0Y29uc3QgcGFyc2VkID0gdG9QYXJzZWRBZ2VudCh7IHVyaSwgbmFtZTogJ2V4cGxvcmUnLCBkZXNjcmlwdGlvbjogJ0V4cGxvcmUgdGhlIGNvZGViYXNlJyB9KTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocGFyc2VkLCB7XG5cdFx0XHRcdHVyaSxcblx0XHRcdFx0bmFtZTogJ2V4cGxvcmUnLFxuXHRcdFx0XHRkZXNjcmlwdGlvbjogJ0V4cGxvcmUgdGhlIGNvZGViYXNlJyxcblx0XHRcdFx0Y3VzdG9taXphdGlvbjoge1xuXHRcdFx0XHRcdHR5cGU6IEN1c3RvbWl6YXRpb25UeXBlLkFnZW50LFxuXHRcdFx0XHRcdGlkOiBjdXN0b21pemF0aW9uSWQodXJpLnRvU3RyaW5nKCkpLFxuXHRcdFx0XHRcdHVyaTogdXJpLnRvU3RyaW5nKCksXG5cdFx0XHRcdFx0bmFtZTogJ2V4cGxvcmUnLFxuXHRcdFx0XHRcdGRlc2NyaXB0aW9uOiAnRXhwbG9yZSB0aGUgY29kZWJhc2UnLFxuXHRcdFx0XHR9LFxuXHRcdFx0fSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCd0b1BhcnNlZFNraWxsIHBhaXJzIHRoZSByZXNvdXJjZSB3aXRoIGEgU2tpbGxDdXN0b21pemF0aW9uIGFuZCBvbWl0cyBhbiBhYnNlbnQgZGVzY3JpcHRpb24nLCAoKSA9PiB7XG5cdFx0XHRjb25zdCB1cmkgPSBVUkkuZmlsZSgnL2hvbWUvLmNsYXVkZS9za2lsbHMvbWFwcGVyL1NLSUxMLm1kJyk7XG5cdFx0XHRjb25zdCBwYXJzZWQgPSB0b1BhcnNlZFNraWxsKHsgdXJpLCBuYW1lOiAnbWFwcGVyJyB9KTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocGFyc2VkLCB7XG5cdFx0XHRcdHVyaSxcblx0XHRcdFx0bmFtZTogJ21hcHBlcicsXG5cdFx0XHRcdGN1c3RvbWl6YXRpb246IHtcblx0XHRcdFx0XHR0eXBlOiBDdXN0b21pemF0aW9uVHlwZS5Ta2lsbCxcblx0XHRcdFx0XHRpZDogY3VzdG9taXphdGlvbklkKHVyaS50b1N0cmluZygpKSxcblx0XHRcdFx0XHR1cmk6IHVyaS50b1N0cmluZygpLFxuXHRcdFx0XHRcdG5hbWU6ICdtYXBwZXInLFxuXHRcdFx0XHR9LFxuXHRcdFx0fSk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHN1aXRlKCdtYWtlTWNwU2VydmVyQ3VzdG9taXphdGlvbicsICgpID0+IHtcblxuXHRcdHRlc3QoJ2J1aWxkcyBhIFN0b3BwZWQgc2VydmVyIHdpdGggREVGQVVMVF9NQ1BfQVBQIGFuZCBhIG5hbWUtZGlzYW1iaWd1YXRlZCBpZCcsICgpID0+IHtcblx0XHRcdGNvbnN0IHVyaSA9IFVSSS5maWxlKCcvd29ya3NwYWNlLy5tY3AuanNvbicpO1xuXHRcdFx0Y29uc3QgY3VzdG9taXphdGlvbiA9IG1ha2VNY3BTZXJ2ZXJDdXN0b21pemF0aW9uKHVyaSwgJ2ZzIHNlcnZlcicpO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChjdXN0b21pemF0aW9uLCB7XG5cdFx0XHRcdHR5cGU6IEN1c3RvbWl6YXRpb25UeXBlLk1jcFNlcnZlcixcblx0XHRcdFx0aWQ6IGAke2N1c3RvbWl6YXRpb25JZCh1cmkudG9TdHJpbmcoKSl9I21jcD0ke2VuY29kZVVSSUNvbXBvbmVudCgnZnMgc2VydmVyJyl9YCxcblx0XHRcdFx0dXJpOiB1cmkudG9TdHJpbmcoKSxcblx0XHRcdFx0bmFtZTogJ2ZzIHNlcnZlcicsXG5cdFx0XHRcdHN0YXRlOiB7IGtpbmQ6IE1jcFNlcnZlclN0YXR1cy5TdG9wcGVkIH0sXG5cdFx0XHRcdG1jcEFwcDogREVGQVVMVF9NQ1BfQVBQLFxuXHRcdFx0fSk7XG5cdFx0fSk7XG5cblx0XHRzdWl0ZSgnQWdlbnQgUGx1Z2luJywgKCkgPT4ge1xuXHRcdFx0Y29uc3Qgc3RvcmUgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cdFx0XHRsZXQgZmlsZVNlcnZpY2U6IEZpbGVTZXJ2aWNlO1xuXG5cdFx0XHRzZXR1cCgoKSA9PiB7XG5cdFx0XHRcdGZpbGVTZXJ2aWNlID0gc3RvcmUuYWRkKG5ldyBGaWxlU2VydmljZShuZXcgTnVsbExvZ1NlcnZpY2UoKSkpO1xuXHRcdFx0XHRzdG9yZS5hZGQoZmlsZVNlcnZpY2UucmVnaXN0ZXJQcm92aWRlcihTY2hlbWFzLmluTWVtb3J5LCBzdG9yZS5hZGQobmV3IEluTWVtb3J5RmlsZVN5c3RlbVByb3ZpZGVyKCkpKSk7XG5cdFx0XHR9KTtcblxuXHRcdFx0dGVhcmRvd24oKCkgPT4gc3RvcmUuY2xlYXIoKSk7XG5cblx0XHRcdGFzeW5jIGZ1bmN0aW9uIHdyaXRlKHBhdGg6IHN0cmluZywgY29udGVudHM6IHN0cmluZyk6IFByb21pc2U8dm9pZD4ge1xuXHRcdFx0XHRhd2FpdCBmaWxlU2VydmljZS53cml0ZUZpbGUoVVJJLmZyb20oeyBzY2hlbWU6IFNjaGVtYXMuaW5NZW1vcnksIHBhdGggfSksIFZTQnVmZmVyLmZyb21TdHJpbmcoY29udGVudHMpKTtcblx0XHRcdH1cblxuXHRcdFx0YXN5bmMgZnVuY3Rpb24gcGFyc2UocGF0aCA9ICcvcGx1Z2lucy9leGFtcGxlJykge1xuXHRcdFx0XHRjb25zdCByb290ID0gVVJJLmZyb20oeyBzY2hlbWU6IFNjaGVtYXMuaW5NZW1vcnksIHBhdGggfSk7XG5cdFx0XHRcdHJldHVybiBwYXJzZVBsdWdpbihyb290LCBmaWxlU2VydmljZSwgdW5kZWZpbmVkLCBVUkkuZnJvbSh7IHNjaGVtZTogU2NoZW1hcy5pbk1lbW9yeSwgcGF0aDogJy9ob21lJyB9KSwgcm9vdCk7XG5cdFx0XHR9XG5cblx0XHRcdHRlc3QoJ3JlY29nbml6ZXMgdGhlIEFnZW50IFBsdWdpbiBzY2hlbWEgYW5kIGdpdmVzIGl0IHByZWNlZGVuY2Ugb3ZlciBsZWdhY3kgbWV0YWRhdGEnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRcdGF3YWl0IHdyaXRlKCcvcGx1Z2lucy9leGFtcGxlL3BsdWdpbi5qc29uJywgSlNPTi5zdHJpbmdpZnkoe1xuXHRcdFx0XHRcdCRzY2hlbWE6IEFHRU5UX1BMVUdJTl9TQ0hFTUEucmVwbGFjZSgnLzEuMC4wLycsICcvMS4wLjEvJyksXG5cdFx0XHRcdFx0bmFtZTogJ2FnZW50LXBsdWdpbicsXG5cdFx0XHRcdFx0ZGVzY3JpcHRpb246IDQyLFxuXHRcdFx0XHRcdHVua25vd246IHRydWUsXG5cdFx0XHRcdFx0ZXh0ZW5zaW9uczogJ2lnbm9yZWQnLFxuXHRcdFx0XHR9KSk7XG5cdFx0XHRcdGF3YWl0IHdyaXRlKCcvcGx1Z2lucy9leGFtcGxlLy5wbHVnaW4vcGx1Z2luLmpzb24nLCBKU09OLnN0cmluZ2lmeSh7IG5hbWU6ICdsZWdhY3ktcGx1Z2luJywgY29tbWFuZHM6ICcuL2NvbW1hbmRzJyB9KSk7XG5cdFx0XHRcdGF3YWl0IHdyaXRlKCcvcGx1Z2lucy9leGFtcGxlL2NvbW1hbmRzL2xlZ2FjeS5tZCcsICcjIExlZ2FjeScpO1xuXHRcdFx0XHRhd2FpdCB3cml0ZSgnL3BsdWdpbnMvZXhhbXBsZS9za2lsbHMvZ29vZC9TS0lMTC5tZCcsICctLS1cXG5uYW1lOiBnb29kXFxuZGVzY3JpcHRpb246IEEgdmFsaWQgc2tpbGxcXG4tLS1cXG5Vc2UgaXQuJyk7XG5cdFx0XHRcdGF3YWl0IHdyaXRlKCcvcGx1Z2lucy9leGFtcGxlL1NLSUxMLm1kJywgJy0tLVxcbm5hbWU6IGV4YW1wbGVcXG5kZXNjcmlwdGlvbjogUm9vdCBmYWxsYmFja1xcbi0tLScpO1xuXG5cdFx0XHRcdGNvbnN0IHBsdWdpbiA9IGF3YWl0IHBhcnNlKCk7XG5cdFx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0XHRcdGZvcm1hdDogcGx1Z2luLmZvcm1hdCxcblx0XHRcdFx0XHRza2lsbHM6IHBsdWdpbi5za2lsbHMubWFwKHNraWxsID0+IHNraWxsLm5hbWUpLFxuXHRcdFx0XHRcdGFnZW50czogcGx1Z2luLmFnZW50cy5sZW5ndGgsXG5cdFx0XHRcdFx0aG9va3M6IHBsdWdpbi5ob29rcy5sZW5ndGgsXG5cdFx0XHRcdFx0aW5zdHJ1Y3Rpb25zOiBwbHVnaW4uaW5zdHJ1Y3Rpb25zLmxlbmd0aCxcblx0XHRcdFx0fSwge1xuXHRcdFx0XHRcdGZvcm1hdDogUGx1Z2luRm9ybWF0LkFnZW50UGx1Z2luLFxuXHRcdFx0XHRcdHNraWxsczogWydnb29kJ10sXG5cdFx0XHRcdFx0YWdlbnRzOiAwLFxuXHRcdFx0XHRcdGhvb2tzOiAwLFxuXHRcdFx0XHRcdGluc3RydWN0aW9uczogMCxcblx0XHRcdFx0fSk7XG5cdFx0XHR9KTtcblxuXHRcdFx0dGVzdCgncmVhZHMgQ29waWxvdCBjb21wb25lbnRzIGZyb20gdGhlIHNhbmN0aW9uZWQgZXh0ZW5zaW9uIGRpcmVjdG9yeSBieSBkZWZhdWx0JywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0XHRhd2FpdCB3cml0ZSgnL3BsdWdpbnMvZXhhbXBsZS9wbHVnaW4uanNvbicsIEpTT04uc3RyaW5naWZ5KHtcblx0XHRcdFx0XHQkc2NoZW1hOiBBR0VOVF9QTFVHSU5fU0NIRU1BLFxuXHRcdFx0XHRcdG5hbWU6ICdleGFtcGxlJyxcblx0XHRcdFx0XHRleHRlbnNpb25zOiB7XG5cdFx0XHRcdFx0XHQnY29tLmV4YW1wbGUuY2xpZW50Jzoge1xuXHRcdFx0XHRcdFx0XHRhZ2VudHM6IHsgcGF0aHM6IFsnYWdlbnRzJ10sIGV4Y2x1c2l2ZTogdHJ1ZSB9LFxuXHRcdFx0XHRcdFx0fSxcblx0XHRcdFx0XHRcdCdjb20uZ2l0aHViLmNvcGlsb3QnOiB7fSxcblx0XHRcdFx0XHR9LFxuXHRcdFx0XHR9KSk7XG5cdFx0XHRcdGF3YWl0IHdyaXRlKCcvcGx1Z2lucy9leGFtcGxlL2NvbS5naXRodWIuY29waWxvdC9hZ2VudHMvaGVscGVyLmFnZW50Lm1kJywgJy0tLVxcbm5hbWU6IGhlbHBlclxcbmRlc2NyaXB0aW9uOiBIZWxwc1xcbi0tLScpO1xuXHRcdFx0XHRhd2FpdCB3cml0ZSgnL3BsdWdpbnMvZXhhbXBsZS9jb20uZ2l0aHViLmNvcGlsb3QvcnVsZXMvcHJvamVjdC5pbnN0cnVjdGlvbnMubWQnLCAnLS0tXFxubmFtZTogcHJvamVjdC1ydWxlXFxuLS0tJyk7XG5cdFx0XHRcdGF3YWl0IHdyaXRlKCcvcGx1Z2lucy9leGFtcGxlL2NvbS5naXRodWIuY29waWxvdC9ob29rcy9ob29rcy5qc29uJywgSlNPTi5zdHJpbmdpZnkoe1xuXHRcdFx0XHRcdGhvb2tzOiB7XG5cdFx0XHRcdFx0XHRQb3N0VG9vbFVzZTogW3sgaG9va3M6IFt7IHR5cGU6ICdjb21tYW5kJywgY29tbWFuZDogJ2VjaG8gZG9uZScgfV0gfV0sXG5cdFx0XHRcdFx0fSxcblx0XHRcdFx0fSkpO1xuXHRcdFx0XHRhd2FpdCB3cml0ZSgnL3BsdWdpbnMvZXhhbXBsZS9hZ2VudHMvbGVnYWN5Lm1kJywgJyMgTGVnYWN5IGFnZW50Jyk7XG5cdFx0XHRcdGF3YWl0IHdyaXRlKCcvcGx1Z2lucy9leGFtcGxlL3J1bGVzL2xlZ2FjeS5pbnN0cnVjdGlvbnMubWQnLCAnIyBMZWdhY3kgcnVsZScpO1xuXG5cdFx0XHRcdGNvbnN0IHBsdWdpbiA9IGF3YWl0IHBhcnNlKCk7XG5cdFx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0XHRcdGFnZW50czogcGx1Z2luLmFnZW50cy5tYXAoYWdlbnQgPT4gYWdlbnQubmFtZSksXG5cdFx0XHRcdFx0aW5zdHJ1Y3Rpb25zOiBwbHVnaW4uaW5zdHJ1Y3Rpb25zLm1hcChpbnN0cnVjdGlvbiA9PiBpbnN0cnVjdGlvbi5uYW1lKSxcblx0XHRcdFx0XHRob29rczogcGx1Z2luLmhvb2tzLm1hcChob29rID0+ICh7XG5cdFx0XHRcdFx0XHR0eXBlOiBob29rLnR5cGUsXG5cdFx0XHRcdFx0XHRjb21tYW5kczogaG9vay5jb21tYW5kcy5tYXAoY29tbWFuZCA9PiBjb21tYW5kLmNvbW1hbmQpLFxuXHRcdFx0XHRcdH0pKSxcblx0XHRcdFx0fSwge1xuXHRcdFx0XHRcdGFnZW50czogWydoZWxwZXInXSxcblx0XHRcdFx0XHRpbnN0cnVjdGlvbnM6IFsncHJvamVjdCddLFxuXHRcdFx0XHRcdGhvb2tzOiBbeyB0eXBlOiAnUG9zdFRvb2xVc2UnLCBjb21tYW5kczogWydlY2hvIGRvbmUnXSB9XSxcblx0XHRcdFx0fSk7XG5cdFx0XHR9KTtcblxuXHRcdFx0dGVzdCgncmVzb2x2ZXMgbmFtZXNwYWNlZCBjb21wb25lbnQgcGF0aHMgcmVsYXRpdmUgdG8gdGhlIGV4dGVuc2lvbiBkaXJlY3RvcnknLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRcdGF3YWl0IHdyaXRlKCcvcGx1Z2lucy9leGFtcGxlL3BsdWdpbi5qc29uJywgSlNPTi5zdHJpbmdpZnkoe1xuXHRcdFx0XHRcdCRzY2hlbWE6IEFHRU5UX1BMVUdJTl9TQ0hFTUEsXG5cdFx0XHRcdFx0bmFtZTogJ2V4YW1wbGUnLFxuXHRcdFx0XHRcdGV4dGVuc2lvbnM6IHtcblx0XHRcdFx0XHRcdCdjb20uZ2l0aHViLmNvcGlsb3QnOiB7XG5cdFx0XHRcdFx0XHRcdGFnZW50czogeyBwYXRoczogWydjdXN0b20vYWdlbnRzJywgJy4uL291dHNpZGUtYWdlbnRzJ10sIGV4Y2x1c2l2ZTogdHJ1ZSB9LFxuXHRcdFx0XHRcdFx0XHRydWxlczogeyBwYXRoczogWydjdXN0b20vcnVsZXMnXSwgZXhjbHVzaXZlOiB0cnVlIH0sXG5cdFx0XHRcdFx0XHRcdGhvb2tzOiB7IHBhdGhzOiBbJ2N1c3RvbS9ob29rcy5qc29uJ10sIGV4Y2x1c2l2ZTogdHJ1ZSB9LFxuXHRcdFx0XHRcdFx0XHRza2lsbHM6IHsgcGF0aHM6IFsnY3VzdG9tL3NraWxscyddIH0sXG5cdFx0XHRcdFx0XHRcdG1jcFNlcnZlcnM6IHsgcGF0aHM6IFsnY3VzdG9tL21jcC5qc29uJ10sIGV4Y2x1c2l2ZTogdHJ1ZSB9LFxuXHRcdFx0XHRcdFx0fSxcblx0XHRcdFx0XHR9LFxuXHRcdFx0XHR9KSk7XG5cdFx0XHRcdGF3YWl0IHdyaXRlKCcvcGx1Z2lucy9leGFtcGxlL2NvbS5naXRodWIuY29waWxvdC9jdXN0b20vYWdlbnRzL2hlbHBlci5tZCcsICctLS1cXG5uYW1lOiBjdXN0b20tYWdlbnRcXG4tLS0nKTtcblx0XHRcdFx0YXdhaXQgd3JpdGUoJy9wbHVnaW5zL2V4YW1wbGUvY29tLmdpdGh1Yi5jb3BpbG90L2N1c3RvbS9ydWxlcy9wcm9qZWN0Lm1kYycsICcjIEN1c3RvbSBydWxlJyk7XG5cdFx0XHRcdGF3YWl0IHdyaXRlKCcvcGx1Z2lucy9leGFtcGxlL2NvbS5naXRodWIuY29waWxvdC9jdXN0b20vaG9va3MuanNvbicsIEpTT04uc3RyaW5naWZ5KHtcblx0XHRcdFx0XHRob29rczoge1xuXHRcdFx0XHRcdFx0U3RvcDogW3sgdHlwZTogJ2NvbW1hbmQnLCBjb21tYW5kOiAnZWNobyBzdG9wJyB9XSxcblx0XHRcdFx0XHR9LFxuXHRcdFx0XHR9KSk7XG5cdFx0XHRcdGF3YWl0IHdyaXRlKCcvcGx1Z2lucy9leGFtcGxlL3NraWxscy9jb3JlL1NLSUxMLm1kJywgJy0tLVxcbm5hbWU6IGNvcmVcXG5kZXNjcmlwdGlvbjogQ29yZSBza2lsbFxcbi0tLScpO1xuXHRcdFx0XHRhd2FpdCB3cml0ZSgnL3BsdWdpbnMvZXhhbXBsZS9jb20uZ2l0aHViLmNvcGlsb3QvY3VzdG9tL3NraWxscy9leHRyYS9TS0lMTC5tZCcsICctLS1cXG5uYW1lOiBleHRyYVxcbmRlc2NyaXB0aW9uOiBFeHRyYSBza2lsbFxcbi0tLScpO1xuXHRcdFx0XHRhd2FpdCB3cml0ZSgnL3BsdWdpbnMvZXhhbXBsZS9jb20uZ2l0aHViLmNvcGlsb3QvY3VzdG9tL21jcC5qc29uJywgSlNPTi5zdHJpbmdpZnkoe1xuXHRcdFx0XHRcdG1jcFNlcnZlcnM6IHtcblx0XHRcdFx0XHRcdGN1c3RvbTogeyB0eXBlOiAnc3RkaW8nLCBjb21tYW5kOiAnY3VzdG9tLXNlcnZlcicgfSxcblx0XHRcdFx0XHR9LFxuXHRcdFx0XHR9KSk7XG5cdFx0XHRcdGF3YWl0IHdyaXRlKCcvcGx1Z2lucy9leGFtcGxlL291dHNpZGUtYWdlbnRzL2VzY2FwZS5tZCcsICctLS1cXG5uYW1lOiBlc2NhcGVkXFxuLS0tJyk7XG5cblx0XHRcdFx0Y29uc3QgcGx1Z2luID0gYXdhaXQgcGFyc2UoKTtcblx0XHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRcdFx0YWdlbnRzOiBwbHVnaW4uYWdlbnRzLm1hcChhZ2VudCA9PiBhZ2VudC5uYW1lKSxcblx0XHRcdFx0XHRpbnN0cnVjdGlvbnM6IHBsdWdpbi5pbnN0cnVjdGlvbnMubWFwKGluc3RydWN0aW9uID0+IGluc3RydWN0aW9uLm5hbWUpLFxuXHRcdFx0XHRcdGhvb2tzOiBwbHVnaW4uaG9va3MubWFwKGhvb2sgPT4gaG9vay50eXBlKSxcblx0XHRcdFx0XHRza2lsbHM6IHBsdWdpbi5za2lsbHMubWFwKHNraWxsID0+IHNraWxsLm5hbWUpLFxuXHRcdFx0XHRcdG1jcFNlcnZlcnM6IHBsdWdpbi5tY3BTZXJ2ZXJzLm1hcChzZXJ2ZXIgPT4gc2VydmVyLm5hbWUpLFxuXHRcdFx0XHR9LCB7XG5cdFx0XHRcdFx0YWdlbnRzOiBbJ2N1c3RvbS1hZ2VudCddLFxuXHRcdFx0XHRcdGluc3RydWN0aW9uczogWydwcm9qZWN0J10sXG5cdFx0XHRcdFx0aG9va3M6IFsnU3RvcCddLFxuXHRcdFx0XHRcdHNraWxsczogWydjb3JlJywgJ2V4dHJhJ10sXG5cdFx0XHRcdFx0bWNwU2VydmVyczogWydjdXN0b20nXSxcblx0XHRcdFx0fSk7XG5cdFx0XHR9KTtcblxuXHRcdFx0dGVzdCgncmVhZHMgaW5saW5lIENvcGlsb3QgZXh0ZW5zaW9uIGhvb2tzIGFuZCBNQ1Agc2VydmVycycsIGFzeW5jICgpID0+IHtcblx0XHRcdFx0YXdhaXQgd3JpdGUoJy9wbHVnaW5zL2V4YW1wbGUvcGx1Z2luLmpzb24nLCBKU09OLnN0cmluZ2lmeSh7XG5cdFx0XHRcdFx0JHNjaGVtYTogQUdFTlRfUExVR0lOX1NDSEVNQSxcblx0XHRcdFx0XHRuYW1lOiAnZXhhbXBsZScsXG5cdFx0XHRcdFx0ZXh0ZW5zaW9uczoge1xuXHRcdFx0XHRcdFx0J2NvbS5naXRodWIuY29waWxvdCc6IHtcblx0XHRcdFx0XHRcdFx0aG9va3M6IHtcblx0XHRcdFx0XHRcdFx0XHRTZXNzaW9uU3RhcnQ6IFt7IHR5cGU6ICdjb21tYW5kJywgY29tbWFuZDogJ2VjaG8gc3RhcnQnIH1dLFxuXHRcdFx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdFx0XHRtY3BTZXJ2ZXJzOiB7XG5cdFx0XHRcdFx0XHRcdFx0aW5saW5lOiB7IHR5cGU6ICdzdGRpbycsIGNvbW1hbmQ6ICdpbmxpbmUtc2VydmVyJyB9LFxuXHRcdFx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdFx0fSxcblx0XHRcdFx0XHR9LFxuXHRcdFx0XHR9KSk7XG5cblx0XHRcdFx0Y29uc3QgcGx1Z2luID0gYXdhaXQgcGFyc2UoKTtcblx0XHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRcdFx0aG9va3M6IHBsdWdpbi5ob29rcy5tYXAoaG9vayA9PiAoe1xuXHRcdFx0XHRcdFx0dHlwZTogaG9vay50eXBlLFxuXHRcdFx0XHRcdFx0Y29tbWFuZHM6IGhvb2suY29tbWFuZHMubWFwKGNvbW1hbmQgPT4gY29tbWFuZC5jb21tYW5kKSxcblx0XHRcdFx0XHR9KSksXG5cdFx0XHRcdFx0bWNwU2VydmVyczogcGx1Z2luLm1jcFNlcnZlcnMubWFwKHNlcnZlciA9PiBzZXJ2ZXIubmFtZSksXG5cdFx0XHRcdH0sIHtcblx0XHRcdFx0XHRob29rczogW3sgdHlwZTogJ1Nlc3Npb25TdGFydCcsIGNvbW1hbmRzOiBbJ2VjaG8gc3RhcnQnXSB9XSxcblx0XHRcdFx0XHRtY3BTZXJ2ZXJzOiBbJ2lubGluZSddLFxuXHRcdFx0XHR9KTtcblx0XHRcdH0pO1xuXG5cdFx0XHR0ZXN0KCdyZWFkcyB1c2FibGUgaW1tZWRpYXRlLWNoaWxkIHNraWxscyBwZXJtaXNzaXZlbHknLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRcdGF3YWl0IHdyaXRlKCcvcGx1Z2lucy9leGFtcGxlL3BsdWdpbi5qc29uJywgSlNPTi5zdHJpbmdpZnkoeyAkc2NoZW1hOiBBR0VOVF9QTFVHSU5fU0NIRU1BLCBuYW1lOiAnZXhhbXBsZScgfSkpO1xuXHRcdFx0XHRhd2FpdCB3cml0ZSgnL3BsdWdpbnMvZXhhbXBsZS9za2lsbHMvU0tJTEwubWQnLCAnLS0tXFxubmFtZTogaWdub3JlZFxcbmRlc2NyaXB0aW9uOiBOb3QgYW4gaW1tZWRpYXRlIGNoaWxkXFxuLS0tJyk7XG5cdFx0XHRcdGF3YWl0IHdyaXRlKCcvcGx1Z2lucy9leGFtcGxlL3NraWxscy92YWxpZC9TS0lMTC5tZCcsICctLS1cXG5uYW1lOiB2YWxpZFxcbmRlc2NyaXB0aW9uOiBWYWxpZCBza2lsbFxcbi0tLScpO1xuXHRcdFx0XHRhd2FpdCB3cml0ZSgnL3BsdWdpbnMvZXhhbXBsZS9za2lsbHMvbWlzbWF0Y2gvU0tJTEwubWQnLCAnLS0tXFxubmFtZTogb3RoZXJcXG5kZXNjcmlwdGlvbjogV3JvbmcgZGlyZWN0b3J5XFxuLS0tJyk7XG5cdFx0XHRcdGF3YWl0IHdyaXRlKCcvcGx1Z2lucy9leGFtcGxlL3NraWxscy9uZXN0ZWQvZGVlcGVyL1NLSUxMLm1kJywgJy0tLVxcbm5hbWU6IGRlZXBlclxcbmRlc2NyaXB0aW9uOiBUb28gZGVlcFxcbi0tLScpO1xuXG5cdFx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoKGF3YWl0IHBhcnNlKCkpLnNraWxscy5tYXAoc2tpbGwgPT4gc2tpbGwubmFtZSksIFsnb3RoZXInLCAndmFsaWQnXSk7XG5cdFx0XHR9KTtcblxuXHRcdFx0dGVzdCgncmVhZHMga25vd24gTUNQIGZpZWxkcyBhbmQgbGVhdmVzIGhhcm5lc3MgcGxhY2Vob2xkZXJzIHVucmVzb2x2ZWQnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRcdGF3YWl0IHdyaXRlKCcvcGx1Z2lucy9leGFtcGxlL3BsdWdpbi5qc29uJywgSlNPTi5zdHJpbmdpZnkoeyAkc2NoZW1hOiBBR0VOVF9QTFVHSU5fU0NIRU1BLCBuYW1lOiAnZXhhbXBsZScgfSkpO1xuXHRcdFx0XHRhd2FpdCB3cml0ZSgnL3BsdWdpbnMvZXhhbXBsZS9tY3AuanNvbicsIEpTT04uc3RyaW5naWZ5KHtcblx0XHRcdFx0XHQkc2NoZW1hOiBBR0VOVF9QTFVHSU5fTUNQX1NDSEVNQS5yZXBsYWNlKCcvMS4wLjAvJywgJy8xLjAuMS8nKSxcblx0XHRcdFx0XHRtY3BTZXJ2ZXJzOiB7XG5cdFx0XHRcdFx0XHRzdGRpbzoge1xuXHRcdFx0XHRcdFx0XHR0eXBlOiAnc3RkaW8nLFxuXHRcdFx0XHRcdFx0XHRjb21tYW5kOiAnc2VydmVyJyxcblx0XHRcdFx0XHRcdFx0YXJnczogWycke1BMVUdJTl9ST09UfScsICcke1BMVUdJTl9EQVRBfScsICcke1VOS05PV059J10sXG5cdFx0XHRcdFx0XHRcdGVudjogeyBST09UOiAnJHtQTFVHSU5fUk9PVH0nIH0sXG5cdFx0XHRcdFx0XHRcdGN3ZDogJy4vd29yaycsXG5cdFx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdFx0aHR0cDogeyB0eXBlOiAnc3RyZWFtYWJsZS1odHRwJywgdXJsOiAnaHR0cHM6Ly9leGFtcGxlLmNvbS9tY3AnIH0sXG5cdFx0XHRcdFx0XHRzc2U6IHsgdHlwZTogJ3NzZScsIHVybDogJ2h0dHA6Ly8xMjcuMC4wLjI6MzAwMC9zc2UnIH0sXG5cdFx0XHRcdFx0fSxcblx0XHRcdFx0fSkpO1xuXG5cdFx0XHRcdGNvbnN0IHNlcnZlcnMgPSBuZXcgTWFwKChhd2FpdCBwYXJzZSgpKS5tY3BTZXJ2ZXJzLm1hcChzZXJ2ZXIgPT4gW3NlcnZlci5uYW1lLCBzZXJ2ZXIuY29uZmlndXJhdGlvbl0pKTtcblx0XHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChbLi4uc2VydmVycy5rZXlzKCldLCBbJ2h0dHAnLCAnc3NlJywgJ3N0ZGlvJ10pO1xuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2VydmVycy5nZXQoJ2h0dHAnKT8udHlwZSwgTWNwU2VydmVyVHlwZS5SRU1PVEUpO1xuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2VydmVycy5nZXQoJ3NzZScpPy50eXBlLCBNY3BTZXJ2ZXJUeXBlLlJFTU9URSk7XG5cdFx0XHRcdGNvbnN0IHN0ZGlvID0gc2VydmVycy5nZXQoJ3N0ZGlvJyk7XG5cdFx0XHRcdGFzc2VydC5vayhzdGRpbz8udHlwZSA9PT0gTWNwU2VydmVyVHlwZS5MT0NBTCk7XG5cdFx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0XHRcdGNvbW1hbmQ6IHN0ZGlvLmNvbW1hbmQsXG5cdFx0XHRcdFx0YXJnczogc3RkaW8uYXJncyxcblx0XHRcdFx0XHRlbnY6IHN0ZGlvLmVudixcblx0XHRcdFx0XHRjd2Q6IHN0ZGlvLmN3ZCxcblx0XHRcdFx0fSwge1xuXHRcdFx0XHRcdGNvbW1hbmQ6ICdzZXJ2ZXInLFxuXHRcdFx0XHRcdGFyZ3M6IFsnJHtQTFVHSU5fUk9PVH0nLCAnJHtQTFVHSU5fREFUQX0nLCAnJHtVTktOT1dOfSddLFxuXHRcdFx0XHRcdGVudjogeyBST09UOiAnJHtQTFVHSU5fUk9PVH0nIH0sXG5cdFx0XHRcdFx0Y3dkOiAnLi93b3JrJyxcblx0XHRcdFx0fSk7XG5cdFx0XHR9KTtcblxuXHRcdFx0dGVzdCgncmVqZWN0cyBmaWxlc3lzdGVtLXJlc29sdmVkIGNvbXBvbmVudCBlc2NhcGVzJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0XHRjbGFzcyBSZWFscGF0aFByb3ZpZGVyIGV4dGVuZHMgSW5NZW1vcnlGaWxlU3lzdGVtUHJvdmlkZXIge1xuXHRcdFx0XHRcdG92ZXJyaWRlIGdldCBjYXBhYmlsaXRpZXMoKTogRmlsZVN5c3RlbVByb3ZpZGVyQ2FwYWJpbGl0aWVzIHtcblx0XHRcdFx0XHRcdHJldHVybiBzdXBlci5jYXBhYmlsaXRpZXMgfCBGaWxlU3lzdGVtUHJvdmlkZXJDYXBhYmlsaXRpZXMuRmlsZVJlYWxwYXRoO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRhc3luYyByZWFscGF0aChyZXNvdXJjZTogVVJJKTogUHJvbWlzZTxzdHJpbmc+IHtcblx0XHRcdFx0XHRcdHJldHVybiByZXNvdXJjZS5wYXRoLmluY2x1ZGVzKCcvZXNjYXBlJylcblx0XHRcdFx0XHRcdFx0fHwgcmVzb3VyY2UucGF0aC5lbmRzV2l0aCgnL2hvb2tzL2hvb2tzLmpzb24nKVxuXHRcdFx0XHRcdFx0XHQ/IGAvb3V0c2lkZS8ke3Jlc291cmNlLnBhdGguc3BsaXQoJy8nKS5hdCgtMSl9YFxuXHRcdFx0XHRcdFx0XHQ6IHJlc291cmNlLnBhdGg7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cblx0XHRcdFx0ZmlsZVNlcnZpY2UgPSBzdG9yZS5hZGQobmV3IEZpbGVTZXJ2aWNlKG5ldyBOdWxsTG9nU2VydmljZSgpKSk7XG5cdFx0XHRcdHN0b3JlLmFkZChmaWxlU2VydmljZS5yZWdpc3RlclByb3ZpZGVyKFNjaGVtYXMuaW5NZW1vcnksIHN0b3JlLmFkZChuZXcgUmVhbHBhdGhQcm92aWRlcigpKSkpO1xuXHRcdFx0XHRhd2FpdCB3cml0ZSgnL3BsdWdpbnMvZXhhbXBsZS9wbHVnaW4uanNvbicsIEpTT04uc3RyaW5naWZ5KHtcblx0XHRcdFx0XHQkc2NoZW1hOiBBR0VOVF9QTFVHSU5fU0NIRU1BLFxuXHRcdFx0XHRcdG5hbWU6ICdleGFtcGxlJyxcblx0XHRcdFx0XHRleHRlbnNpb25zOiB7ICdjb20uZ2l0aHViLmNvcGlsb3QnOiB7fSB9LFxuXHRcdFx0XHR9KSk7XG5cdFx0XHRcdGF3YWl0IHdyaXRlKCcvcGx1Z2lucy9leGFtcGxlL3NraWxscy9lc2NhcGUvU0tJTEwubWQnLCAnLS0tXFxubmFtZTogZXNjYXBlXFxuZGVzY3JpcHRpb246IEVzY2FwZWRcXG4tLS0nKTtcblx0XHRcdFx0YXdhaXQgd3JpdGUoJy9wbHVnaW5zL2V4YW1wbGUvY29tLmdpdGh1Yi5jb3BpbG90L2FnZW50cy9lc2NhcGUubWQnLCAnIyBFc2NhcGVkIGFnZW50Jyk7XG5cdFx0XHRcdGF3YWl0IHdyaXRlKCcvcGx1Z2lucy9leGFtcGxlL2NvbS5naXRodWIuY29waWxvdC9ydWxlcy9lc2NhcGUuaW5zdHJ1Y3Rpb25zLm1kJywgJyMgRXNjYXBlZCBydWxlJyk7XG5cdFx0XHRcdGF3YWl0IHdyaXRlKCcvcGx1Z2lucy9leGFtcGxlL2NvbS5naXRodWIuY29waWxvdC9ob29rcy9ob29rcy5qc29uJywgSlNPTi5zdHJpbmdpZnkoe1xuXHRcdFx0XHRcdGhvb2tzOiB7IFN0b3A6IFt7IHR5cGU6ICdjb21tYW5kJywgY29tbWFuZDogJ2VjaG8gc3RvcCcgfV0gfSxcblx0XHRcdFx0fSkpO1xuXG5cdFx0XHRcdGNvbnN0IHBsdWdpbiA9IGF3YWl0IHBhcnNlKCk7XG5cdFx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0XHRcdHNraWxsczogcGx1Z2luLnNraWxscyxcblx0XHRcdFx0XHRhZ2VudHM6IHBsdWdpbi5hZ2VudHMsXG5cdFx0XHRcdFx0aW5zdHJ1Y3Rpb25zOiBwbHVnaW4uaW5zdHJ1Y3Rpb25zLFxuXHRcdFx0XHRcdGhvb2tzOiBwbHVnaW4uaG9va3MsXG5cdFx0XHRcdH0sIHtcblx0XHRcdFx0XHRza2lsbHM6IFtdLFxuXHRcdFx0XHRcdGFnZW50czogW10sXG5cdFx0XHRcdFx0aW5zdHJ1Y3Rpb25zOiBbXSxcblx0XHRcdFx0XHRob29rczogW10sXG5cdFx0XHRcdH0pO1xuXHRcdFx0fSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCd0d28gc2VydmVycyBkZWNsYXJlZCBpbiB0aGUgc2FtZSBmaWxlIGdldCBkaXN0aW5jdCBpZHMnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCB1cmkgPSBVUkkuZmlsZSgnL3dvcmtzcGFjZS8ubWNwLmpzb24nKTtcblx0XHRcdGFzc2VydC5ub3RTdHJpY3RFcXVhbChtYWtlTWNwU2VydmVyQ3VzdG9taXphdGlvbih1cmksICdhJykuaWQsIG1ha2VNY3BTZXJ2ZXJDdXN0b21pemF0aW9uKHVyaSwgJ2InKS5pZCk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdC8vIC0tLS0gcGFyc2VIb29rc0pzb24gLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuXG5cdHN1aXRlKCdwYXJzZUhvb2tzSnNvbicsICgpID0+IHtcblxuXHRcdGNvbnN0IGhvb2tVcmkgPSBVUkkuZmlsZSgnL3dvcmtzcGFjZS8uY2xhdWRlL3NldHRpbmdzLmpzb24nKTtcblx0XHRjb25zdCBwYXJzZSA9IChqc29uOiB1bmtub3duKSA9PiBwYXJzZUhvb2tzSnNvbihob29rVXJpLCBqc29uLCB1bmRlZmluZWQsIFVSSS5maWxlKCcvaG9tZScpKTtcblxuXHRcdHRlc3QoJ3JldHVybnMgW10gZm9yIGEgbm9uLW9iamVjdCwgYSBtaXNzaW5nIGhvb2tzIGJsb2NrLCBvciBkaXNhYmxlQWxsSG9va3MnLCAoKSA9PiB7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHBhcnNlKHVuZGVmaW5lZCksIFtdKTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocGFyc2UoeyBtb2RlbDogJ3gnIH0pLCBbXSk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHBhcnNlKHsgZGlzYWJsZUFsbEhvb2tzOiB0cnVlLCBob29rczogeyBQb3N0VG9vbFVzZTogW3sgaG9va3M6IFt7IHR5cGU6ICdjb21tYW5kJywgY29tbWFuZDogJ2VjaG8nIH1dIH1dIH0gfSksIFtdKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2Nhbm9uaWNhbGl6ZXMgZXZlbnQgbmFtZXMgKGNhbWVsQ2FzZSBcdTIxOTIgUGFzY2FsQ2FzZSkgYW5kIGlnbm9yZXMgdW5yZWNvZ25pemVkIGV2ZW50cycsICgpID0+IHtcblx0XHRcdGNvbnN0IGdyb3VwcyA9IHBhcnNlKHtcblx0XHRcdFx0aG9va3M6IHtcblx0XHRcdFx0XHRwb3N0VG9vbFVzZTogW3sgaG9va3M6IFt7IHR5cGU6ICdjb21tYW5kJywgY29tbWFuZDogJ2VjaG8gYScgfV0gfV0sXG5cdFx0XHRcdFx0Ym9ndXNFdmVudDogW3sgaG9va3M6IFt7IHR5cGU6ICdjb21tYW5kJywgY29tbWFuZDogJ2VjaG8gYicgfV0gfV0sXG5cdFx0XHRcdH0sXG5cdFx0XHR9KTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoZ3JvdXBzLm1hcChnID0+IGcudHlwZSksIFsnUG9zdFRvb2xVc2UnXSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdleHRyYWN0cyBjb21tYW5kcyBmcm9tIHRoZSBuZXN0ZWQgbWF0Y2hlciBmb3JtIGFuZCBkcm9wcyBlbXB0eSBncm91cHMnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBncm91cHMgPSBwYXJzZSh7XG5cdFx0XHRcdGhvb2tzOiB7XG5cdFx0XHRcdFx0UHJlVG9vbFVzZTogW3sgbWF0Y2hlcjogJ0Jhc2gnLCBob29rczogW3sgdHlwZTogJ2NvbW1hbmQnLCBjb21tYW5kOiAnZWNobyBydW4nIH1dIH1dLFxuXHRcdFx0XHRcdFN0b3A6IFt7IG1hdGNoZXI6ICdYJywgaG9va3M6IFt7IHR5cGU6ICdub3QtYS1jb21tYW5kJyB9XSB9XSxcblx0XHRcdFx0fSxcblx0XHRcdH0pO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChncm91cHMubWFwKGcgPT4gZy50eXBlKSwgWydQcmVUb29sVXNlJ10pO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChncm91cHNbMF0uY29tbWFuZHMubWFwKGMgPT4gYy5jb21tYW5kKSwgWydlY2hvIHJ1biddKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2V4dHJhY3RzIGNvbW1hbmRzIGZyb20gdGhlIGZsYXQgKG5vbi1uZXN0ZWQpIGNvbW1hbmQgZm9ybScsICgpID0+IHtcblx0XHRcdGNvbnN0IGdyb3VwcyA9IHBhcnNlKHtcblx0XHRcdFx0aG9va3M6IHsgUG9zdFRvb2xVc2U6IFt7IHR5cGU6ICdjb21tYW5kJywgY29tbWFuZDogJ2VjaG8gZmxhdCcgfV0gfSxcblx0XHRcdH0pO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChncm91cHMubWFwKGcgPT4gZy50eXBlKSwgWydQb3N0VG9vbFVzZSddKTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoZ3JvdXBzWzBdLmNvbW1hbmRzLm1hcChjID0+IGMuY29tbWFuZCksIFsnZWNobyBmbGF0J10pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnYWxsIGdyb3VwcyBmcm9tIG9uZSBmaWxlIHNoYXJlIGEgc2luZ2xlIGZpbGUtbGV2ZWwgY3VzdG9taXphdGlvbicsICgpID0+IHtcblx0XHRcdGNvbnN0IGdyb3VwcyA9IHBhcnNlKHtcblx0XHRcdFx0aG9va3M6IHtcblx0XHRcdFx0XHRQcmVUb29sVXNlOiBbeyBob29rczogW3sgdHlwZTogJ2NvbW1hbmQnLCBjb21tYW5kOiAnYScgfV0gfV0sXG5cdFx0XHRcdFx0UG9zdFRvb2xVc2U6IFt7IGhvb2tzOiBbeyB0eXBlOiAnY29tbWFuZCcsIGNvbW1hbmQ6ICdiJyB9XSB9XSxcblx0XHRcdFx0fSxcblx0XHRcdH0pO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGdyb3Vwcy5sZW5ndGgsIDIpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGdyb3Vwc1swXS5jdXN0b21pemF0aW9uLCBncm91cHNbMV0uY3VzdG9taXphdGlvbik7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGdyb3Vwc1swXS5jdXN0b21pemF0aW9uLCB7XG5cdFx0XHRcdHR5cGU6IEN1c3RvbWl6YXRpb25UeXBlLkhvb2ssXG5cdFx0XHRcdGlkOiBjdXN0b21pemF0aW9uSWQoaG9va1VyaS50b1N0cmluZygpKSxcblx0XHRcdFx0dXJpOiBob29rVXJpLnRvU3RyaW5nKCksXG5cdFx0XHRcdG5hbWU6ICdzZXR0aW5ncy5qc29uJyxcblx0XHRcdH0pO1xuXHRcdH0pO1xuXHR9KTtcbn0pO1xuIl0sCiAgIm1hcHBpbmdzIjogIkFBS0EsT0FBTyxZQUFZO0FBQ25CLFNBQVMsZ0JBQWdCO0FBQ3pCLFNBQVMsdUJBQXVCO0FBQ2hDLFNBQVMsZUFBZTtBQUN4QixTQUFTLFdBQVc7QUFDcEIsU0FBUywrQ0FBK0M7QUFDeEQsU0FBUyxtQkFBbUI7QUFDNUIsU0FBUyxzQ0FBc0M7QUFDL0MsU0FBUyxrQ0FBa0M7QUFDM0MsU0FBUyxzQkFBc0I7QUFDL0IsU0FBUyxxQkFBcUI7QUFDOUIsU0FBUyxtQkFBbUIsdUJBQW9EO0FBQ2hGLFNBQVMsdUJBQXVCO0FBQ2hDLFNBQVMsdUJBQXVCO0FBRWhDLFNBQVMsdUJBQStDO0FBQ3ZELFNBQU8sRUFBRSxNQUFNLGtCQUFrQixXQUFXLElBQUksUUFBUSxLQUFLLGtCQUFrQixNQUFNLFFBQVEsT0FBTyxFQUFFLE1BQU0sZ0JBQWdCLFNBQVMsRUFBRTtBQUN4STtBQUNBO0FBQUEsRUFDQztBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLE9BQ007QUFDUCxTQUFTLHlCQUF5QiwyQkFBMkI7QUFFN0QsTUFBTSxpQkFBaUIsTUFBTTtBQUU1QiwwQ0FBd0M7QUFJeEMsUUFBTSw0QkFBNEIsTUFBTTtB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
