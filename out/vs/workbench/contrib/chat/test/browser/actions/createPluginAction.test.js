import assert from "assert";
import { VSBuffer } from "../../../../../../base/common/buffer.js";
import { DisposableStore } from "../../../../../../base/common/lifecycle.js";
import { Schemas } from "../../../../../../base/common/network.js";
import { URI } from "../../../../../../base/common/uri.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../../../base/test/common/utils.js";
import { FileService } from "../../../../../../platform/files/common/fileService.js";
import { InMemoryFileSystemProvider } from "../../../../../../platform/files/common/inMemoryFilesystemProvider.js";
import { NullLogService } from "../../../../../../platform/log/common/log.js";
import { PromptsType } from "../../../common/promptSyntax/promptTypes.js";
import { PromptsStorage } from "../../../common/promptSyntax/service/promptsService.js";
import { McpCollectionSortOrder, McpServerTransportType } from "../../../../mcp/common/mcpTypes.js";
import {
  validatePluginName,
  getResourceLabel,
  getResourceFileName,
  serializeHookCommand,
  serializeMcpLaunch,
  writePluginToDisk,
  updateMarketplaceIfNeeded
} from "../../../browser/actions/createPluginAction.js";
function makePromptPath(overrides) {
  return overrides;
}
function makeResourceItem(overrides) {
  return { checked: false, ...overrides };
}
suite("CreatePluginAction helpers", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  suite("validatePluginName", () => {
    test("rejects empty name", () => {
      assert.ok(validatePluginName(""));
    });
    test("accepts valid names", () => {
      assert.deepStrictEqual(
        ["my-plugin", "plugin1", "a", "code-reviewer", "my.plugin", "a1b2c3"].map((n) => validatePluginName(n)),
        [void 0, void 0, void 0, void 0, void 0, void 0]
      );
    });
    test("rejects names with invalid characters", () => {
      assert.ok(validatePluginName("My-Plugin"));
      assert.ok(validatePluginName("my_plugin"));
      assert.ok(validatePluginName("my plugin"));
      assert.ok(validatePluginName("plugin!"));
    });
    test("rejects names not starting/ending with alphanumeric", () => {
      assert.ok(validatePluginName("-plugin"));
      assert.ok(validatePluginName("plugin-"));
      assert.ok(validatePluginName(".plugin"));
      assert.ok(validatePluginName("plugin."));
    });
    test("rejects consecutive hyphens or periods", () => {
      assert.ok(validatePluginName("my--plugin"));
      assert.ok(validatePluginName("my..plugin"));
    });
    test("rejects names longer than 64 characters", () => {
      assert.ok(validatePluginName("a".repeat(65)));
    });
    test("accepts name with exactly 64 characters", () => {
      assert.strictEqual(validatePluginName("a".repeat(64)), void 0);
    });
  });
  suite("getResourceLabel", () => {
    test("returns name if set", () => {
      const path = makePromptPath({
        uri: URI.file("/foo/bar.instructions.md"),
        storage: PromptsStorage.local,
        type: PromptsType.instructions,
        name: "my-instructions"
      });
      assert.strictEqual(getResourceLabel(path), "my-instructions");
    });
    test("returns basename for non-skill resources without name", () => {
      const path = makePromptPath({
        uri: URI.file("/foo/bar.instructions.md"),
        storage: PromptsStorage.local,
        type: PromptsType.instructions
      });
      assert.strictEqual(getResourceLabel(path), "bar.instructions.md");
    });
    test("returns parent directory name for skills pointing to SKILL.md", () => {
      const path = makePromptPath({
        uri: URI.file("/workspace/.github/skills/my-skill/SKILL.md"),
        storage: PromptsStorage.local,
        type: PromptsType.skill
      });
      assert.strictEqual(getResourceLabel(path), "my-skill");
    });
    test("returns basename for skill not named SKILL.md", () => {
      const path = makePromptPath({
        uri: URI.file("/workspace/.github/skills/custom.md"),
        storage: PromptsStorage.local,
        type: PromptsType.skill
      });
      assert.strictEqual(getResourceLabel(path), "custom.md");
    });
  });
  suite("getResourceFileName", () => {
    test("strips namespace prefix", () => {
      const path = makePromptPath({
        uri: URI.file("/foo/SKILL.md"),
        storage: PromptsStorage.plugin,
        type: PromptsType.skill,
        name: "hookify:writing-rules"
      });
      assert.strictEqual(getResourceFileName(path), "writing-rules");
    });
    test("returns full name when no prefix", () => {
      const path = makePromptPath({
        uri: URI.file("/foo/my-skill/SKILL.md"),
        storage: PromptsStorage.local,
        type: PromptsType.skill
      });
      assert.strictEqual(getResourceFileName(path), "my-skill");
    });
    test("handles names with multiple colons", () => {
      const path = makePromptPath({
        uri: URI.file("/foo/bar.md"),
        storage: PromptsStorage.plugin,
        type: PromptsType.agent,
        name: "ns:sub:name"
      });
      assert.strictEqual(getResourceFileName(path), "sub:name");
    });
  });
  suite("serializeHookCommand", () => {
    test("serializes basic command", () => {
      assert.deepStrictEqual(serializeHookCommand({ type: "command", command: "echo hello" }), {
        type: "command",
        command: "echo hello"
      });
    });
    test("serializes platform-specific commands", () => {
      assert.deepStrictEqual(
        serializeHookCommand({
          type: "command",
          command: "echo hello",
          windows: "echo.exe hello",
          linux: "/bin/echo hello",
          osx: "/bin/echo hello"
        }),
        {
          type: "command",
          command: "echo hello",
          windows: "echo.exe hello",
          linux: "/bin/echo hello",
          osx: "/bin/echo hello"
        }
      );
    });
    test("includes env and timeout when present", () => {
      assert.deepStrictEqual(
        serializeHookCommand({
          type: "command",
          command: "test",
          env: { FOO: "bar" },
          timeout: 5e3
        }),
        {
          type: "command",
          command: "test",
          env: { FOO: "bar" },
          timeout: 5e3
        }
      );
    });
    test("omits empty env", () => {
      const result = serializeHookCommand({ type: "command", command: "test", env: {} });
      assert.strictEqual(result["env"], void 0);
    });
    test("converts URI-like cwd to string", () => {
      const cwd = URI.file("/workspace");
      const result = serializeHookCommand({ type: "command", command: "test", cwd });
      assert.strictEqual(typeof result["cwd"], "string");
    });
    test("preserves timeout of 0", () => {
      const result = serializeHookCommand({ type: "command", command: "test", timeout: 0 });
      assert.strictEqual(result["timeout"], 0);
    });
  });
  suite("serializeMcpLaunch", () => {
    test("serializes stdio launch", () => {
      assert.deepStrictEqual(
        serializeMcpLaunch({
          type: McpServerTransportType.Stdio,
          command: "node",
          args: ["server.js"],
          cwd: "/workspace",
          env: { NODE_ENV: "production" },
          envFile: void 0,
          sandbox: void 0
        }),
        {
          type: "stdio",
          command: "node",
          args: ["server.js"],
          cwd: "/workspace",
          env: { NODE_ENV: "production" }
        }
      );
    });
    test("omits empty args and env for stdio", () => {
      assert.deepStrictEqual(
        serializeMcpLaunch({
          type: McpServerTransportType.Stdio,
          command: "server",
          args: [],
          cwd: void 0,
          env: {},
          envFile: void 0,
          sandbox: void 0
        }),
        {
          type: "stdio",
          command: "server"
        }
      );
    });
    test("serializes http launch", () => {
      assert.deepStrictEqual(
        serializeMcpLaunch({
          type: McpServerTransportType.HTTP,
          uri: URI.parse("http://localhost:3000"),
          headers: [["Authorization", "Bearer token"]]
        }),
        {
          type: "http",
          url: "http://localhost:3000/",
          headers: { Authorization: "Bearer token" }
        }
      );
    });
    test("omits empty headers for http", () => {
      assert.deepStrictEqual(
        serializeMcpLaunch({
          type: McpServerTransportType.HTTP,
          uri: URI.parse("http://localhost:3000"),
          headers: []
        }),
        {
          type: "http",
          url: "http://localhost:3000/"
        }
      );
    });
  });
});
suite("writePluginToDisk", () => {
  const disposables = new DisposableStore();
  let fileService;
  const root = URI.from({ scheme: Schemas.inMemory, path: "/test" });
  setup(() => {
    const service = disposables.add(new FileService(new NullLogService()));
    const provider = disposables.add(new InMemoryFileSystemProvider());
    disposables.add(service.registerProvider(Schemas.inMemory, provider));
    fileService = service;
  });
  teardown(() => {
    disposables.clear();
  });
  ensureNoDisposablesAreLeakedInTestSuite();
  async function readJson(uri) {
    const content = await fileService.readFile(uri);
    return JSON.parse(content.value.toString());
  }
  test("creates manifest with correct structure", async () => {
    const pluginRoot = URI.joinPath(root, "my-plugin");
    await writePluginToDisk(fileService, pluginRoot, "my-plugin", []);
    assert.deepStrictEqual(await readJson(URI.joinPath(pluginRoot, ".plugin", "plugin.json")), {
      name: "my-plugin",
      version: "1.0.0",
      description: ""
    });
  });
  test("copies instructions to rules/", async () => {
    const sourceUri = URI.joinPath(root, "source", "coding.instructions.md");
    await fileService.writeFile(sourceUri, VSBuffer.fromString("# My coding rules"));
    const pluginRoot = URI.joinPath(root, "test-plugin");
    await writePluginToDisk(fileService, pluginRoot, "test-plugin", [
      makeResourceItem({
        label: "coding",
        resourceType: "instruction",
        promptPath: makePromptPath({
          uri: sourceUri,
          storage: PromptsStorage.local,
          type: PromptsType.instructions,
          name: "coding"
        })
      })
    ]);
    const content = await fileService.readFile(URI.joinPath(pluginRoot, "rules", "coding.instructions.md"));
    assert.strictEqual(content.value.toString(), "# My coding rules");
  });
  test("preserves .mdc suffix for rule files", async () => {
    const sourceUri = URI.joinPath(root, "source", "prefer-const.mdc");
    await fileService.writeFile(sourceUri, VSBuffer.fromString("prefer const"));
    const pluginRoot = URI.joinPath(root, "test-plugin");
    await writePluginToDisk(fileService, pluginRoot, "test-plugin", [
      makeResourceItem({
        label: "prefer-const.mdc",
        resourceType: "instruction",
        promptPath: makePromptPath({
          uri: sourceUri,
          storage: PromptsStorage.local,
          type: PromptsType.instructions,
          name: "prefer-const.mdc"
        })
      })
    ]);
    const content = await fileService.readFile(URI.joinPath(pluginRoot, "rules", "prefer-const.mdc"));
    assert.strictEqual(content.value.toString(), "prefer const");
  });
  test("copies prompts to commands/", async () => {
    const sourceUri = URI.joinPath(root, "source", "review.prompt.md");
    await fileService.writeFile(sourceUri, VSBuffer.fromString("Review this code"));
    const pluginRoot = URI.joinPath(root, "test-plugin");
    await writePluginToDisk(fileService, pluginRoot, "test-plugin", [
      makeResourceItem({
        label: "review",
        resourceType: "prompt",
        promptPath: makePromptPath({
          uri: sourceUri,
          storage: PromptsStorage.local,
          type: PromptsType.prompt,
          name: "review"
        })
      })
    ]);
    const content = await fileService.readFile(URI.joinPath(pluginRoot, "commands", "review.md"));
    assert.strictEqual(content.value.toString(), "Review this code");
  });
  test("copies agents to agents/", async () => {
    const sourceUri = URI.joinPath(root, "source", "reviewer.agent.md");
    await fileService.writeFile(sourceUri, VSBuffer.fromString("---\nname: reviewer\n---\nYou review code."));
    const pluginRoot = URI.joinPath(root, "test-plugin");
    await writePluginToDisk(fileService, pluginRoot, "test-plugin", [
      makeResourceItem({
        label: "reviewer",
        resourceType: "agent",
        promptPath: makePromptPath({
          uri: sourceUri,
          storage: PromptsStorage.local,
          type: PromptsType.agent,
          name: "reviewer"
        })
      })
    ]);
    const content = await fileService.readFile(URI.joinPath(pluginRoot, "agents", "reviewer.md"));
    assert.strictEqual(content.value.toString(), "---\nname: reviewer\n---\nYou review code.");
  });
  test("copies skill directories recursively", async () => {
    const skillDir = URI.joinPath(root, "source", "skills", "my-skill");
    await fileService.writeFile(URI.joinPath(skillDir, "SKILL.md"), VSBuffer.fromString("# My Skill"));
    await fileService.writeFile(URI.joinPath(skillDir, "helper.md"), VSBuffer.fromString("helper content"));
    const pluginRoot = URI.joinPath(root, "test-plugin");
    await writePluginToDisk(fileService, pluginRoot, "test-plugin", [
      makeResourceItem({
        label: "my-skill",
        resourceType: "skill",
        promptPath: makePromptPath({
          uri: URI.joinPath(skillDir, "SKILL.md"),
          storage: PromptsStorage.local,
          type: PromptsType.skill
        })
      })
    ]);
    const skillMd = await fileService.readFile(URI.joinPath(pluginRoot, "skills", "my-skill", "SKILL.md"));
    assert.strictEqual(skillMd.value.toString(), "# My Skill");
    const helperMd = await fileService.readFile(URI.joinPath(pluginRoot, "skills", "my-skill", "helper.md"));
    assert.strictEqual(helperMd.value.toString(), "helper content");
  });
  test("merges hooks into hooks/hooks.json", async () => {
    const hooksUri = URI.joinPath(root, "source", "hooks.json");
    await fileService.writeFile(hooksUri, VSBuffer.fromString(JSON.stringify({
      hooks: {
        SessionStart: [{ type: "command", command: "echo start" }],
        PreToolUse: [{ type: "command", command: "echo pre" }]
      }
    })));
    const pluginRoot = URI.joinPath(root, "test-plugin");
    await writePluginToDisk(fileService, pluginRoot, "test-plugin", [
      makeResourceItem({
        label: "hooks",
        resourceType: "hook",
        promptPath: makePromptPath({
          uri: hooksUri,
          storage: PromptsStorage.local,
          type: PromptsType.hook
        })
      })
    ]);
    assert.deepStrictEqual(await readJson(URI.joinPath(pluginRoot, "hooks", "hooks.json")), {
      hooks: {
        SessionStart: [{ type: "command", command: "echo start" }],
        PreToolUse: [{ type: "command", command: "echo pre" }]
      }
    });
  });
  test("exports MCP servers to .mcp.json", async () => {
    const pluginRoot = URI.joinPath(root, "test-plugin");
    await writePluginToDisk(fileService, pluginRoot, "test-plugin", [
      makeResourceItem({
        label: "my-server",
        resourceType: "mcp",
        mcpServer: {
          collection: {
            id: "col1",
            label: "Test Collection",
            order: McpCollectionSortOrder.User
          },
          definition: {
            id: "def1",
            label: "my-server",
            launch: {
              type: McpServerTransportType.Stdio,
              command: "npx",
              args: ["-y", "my-mcp-server"],
              cwd: void 0,
              env: {},
              envFile: void 0,
              sandbox: void 0
            },
            cacheNonce: "1"
          }
        }
      })
    ]);
    assert.deepStrictEqual(await readJson(URI.joinPath(pluginRoot, ".mcp.json")), {
      mcpServers: {
        "my-server": {
          type: "stdio",
          command: "npx",
          args: ["-y", "my-mcp-server"]
        }
      }
    });
  });
  test("strips namespace prefix from plugin resource names", async () => {
    const sourceUri = URI.joinPath(root, "source", "rules.instructions.md");
    await fileService.writeFile(sourceUri, VSBuffer.fromString("content"));
    const pluginRoot = URI.joinPath(root, "test-plugin");
    await writePluginToDisk(fileService, pluginRoot, "test-plugin", [
      makeResourceItem({
        label: "hookify:writing-rules",
        resourceType: "instruction",
        promptPath: makePromptPath({
          uri: sourceUri,
          storage: PromptsStorage.plugin,
          type: PromptsType.instructions,
          name: "hookify:writing-rules"
        })
      })
    ]);
    const content = await fileService.readFile(URI.joinPath(pluginRoot, "rules", "writing-rules.instructions.md"));
    assert.strictEqual(content.value.toString(), "content");
  });
  test("does not create directories for empty resource types", async () => {
    const pluginRoot = URI.joinPath(root, "test-plugin");
    await writePluginToDisk(fileService, pluginRoot, "test-plugin", []);
    assert.ok(await fileService.exists(URI.joinPath(pluginRoot, ".plugin", "plugin.json")));
    assert.ok(!await fileService.exists(URI.joinPath(pluginRoot, "rules")));
    assert.ok(!await fileService.exists(URI.joinPath(pluginRoot, "commands")));
    assert.ok(!await fileService.exists(URI.joinPath(pluginRoot, "agents")));
    assert.ok(!await fileService.exists(URI.joinPath(pluginRoot, "skills")));
    assert.ok(!await fileService.exists(URI.joinPath(pluginRoot, "hooks")));
    assert.ok(!await fileService.exists(URI.joinPath(pluginRoot, ".mcp.json")));
  });
});
suite("updateMarketplaceIfNeeded", () => {
  const disposables = new DisposableStore();
  let fileService;
  const root = URI.from({ scheme: Schemas.inMemory, path: "/marketplace-test" });
  setup(() => {
    const service = disposables.add(new FileService(new NullLogService()));
    const provider = disposables.add(new InMemoryFileSystemProvider());
    disposables.add(service.registerProvider(Schemas.inMemory, provider));
    fileService = service;
  });
  teardown(() => {
    disposables.clear();
  });
  ensureNoDisposablesAreLeakedInTestSuite();
  test("adds plugin to existing marketplace.json", async () => {
    const marketplace = { name: "my-marketplace", plugins: [{ name: "existing", source: "./existing/" }] };
    await fileService.writeFile(URI.joinPath(root, "marketplace.json"), VSBuffer.fromString(JSON.stringify(marketplace)));
    await updateMarketplaceIfNeeded(fileService, root, "new-plugin");
    const content = await fileService.readFile(URI.joinPath(root, "marketplace.json"));
    const result = JSON.parse(content.value.toString());
    assert.deepStrictEqual(result.plugins, [
      { name: "existing", source: "./existing/" },
      { name: "new-plugin", source: "./new-plugin/" }
    ]);
  });
  test("creates plugins array if missing", async () => {
    await fileService.writeFile(URI.joinPath(root, "marketplace.json"), VSBuffer.fromString(JSON.stringify({ name: "test" })));
    await updateMarketplaceIfNeeded(fileService, root, "my-plugin");
    const content = await fileService.readFile(URI.joinPath(root, "marketplace.json"));
    const result = JSON.parse(content.value.toString());
    assert.deepStrictEqual(result.plugins, [
      { name: "my-plugin", source: "./my-plugin/" }
    ]);
  });
  test("detects .plugin/marketplace.json", async () => {
    const marketplace = { name: "test", plugins: [] };
    await fileService.writeFile(URI.joinPath(root, ".plugin", "marketplace.json"), VSBuffer.fromString(JSON.stringify(marketplace)));
    await updateMarketplaceIfNeeded(fileService, root, "my-plugin");
    const content = await fileService.readFile(URI.joinPath(root, ".plugin", "marketplace.json"));
    const result = JSON.parse(content.value.toString());
    assert.deepStrictEqual(result.plugins, [
      { name: "my-plugin", source: "./my-plugin/" }
    ]);
  });
  test("does nothing when no marketplace.json exists", async () => {
    await updateMarketplaceIfNeeded(fileService, root, "my-plugin");
    assert.ok(!await fileService.exists(URI.joinPath(root, "marketplace.json")));
  });
  test("does not duplicate existing plugin entry", async () => {
    const marketplace = { name: "test", plugins: [{ name: "my-plugin", source: "./my-plugin/" }] };
    await fileService.writeFile(URI.joinPath(root, "marketplace.json"), VSBuffer.fromString(JSON.stringify(marketplace)));
    await updateMarketplaceIfNeeded(fileService, root, "my-plugin");
    const content = await fileService.readFile(URI.joinPath(root, "marketplace.json"));
    const result = JSON.parse(content.value.toString());
    assert.deepStrictEqual(result.plugins, [
      { name: "my-plugin", source: "./my-plugin/" }
    ]);
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXGNoYXRcXHRlc3RcXGJyb3dzZXJcXGFjdGlvbnNcXGNyZWF0ZVBsdWdpbkFjdGlvbi50ZXN0LnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IGFzc2VydCBmcm9tICdhc3NlcnQnO1xuaW1wb3J0IHsgVlNCdWZmZXIgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9idWZmZXIuanMnO1xuaW1wb3J0IHsgRGlzcG9zYWJsZVN0b3JlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IFNjaGVtYXMgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9uZXR3b3JrLmpzJztcbmltcG9ydCB7IFVSSSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3VyaS5qcyc7XG5pbXBvcnQgeyBlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL3Rlc3QvY29tbW9uL3V0aWxzLmpzJztcbmltcG9ydCB7IEZpbGVTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vZmlsZXMvY29tbW9uL2ZpbGVTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElGaWxlU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2ZpbGVzL2NvbW1vbi9maWxlcy5qcyc7XG5pbXBvcnQgeyBJbk1lbW9yeUZpbGVTeXN0ZW1Qcm92aWRlciB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2ZpbGVzL2NvbW1vbi9pbk1lbW9yeUZpbGVzeXN0ZW1Qcm92aWRlci5qcyc7XG5pbXBvcnQgeyBOdWxsTG9nU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2xvZy9jb21tb24vbG9nLmpzJztcbmltcG9ydCB7IFByb21wdHNUeXBlIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL3Byb21wdFN5bnRheC9wcm9tcHRUeXBlcy5qcyc7XG5pbXBvcnQgeyBJUHJvbXB0UGF0aCwgUHJvbXB0c1N0b3JhZ2UgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vcHJvbXB0U3ludGF4L3NlcnZpY2UvcHJvbXB0c1NlcnZpY2UuanMnO1xuaW1wb3J0IHsgTWNwQ29sbGVjdGlvblNvcnRPcmRlciwgTWNwU2VydmVyVHJhbnNwb3J0VHlwZSB9IGZyb20gJy4uLy4uLy4uLy4uL21jcC9jb21tb24vbWNwVHlwZXMuanMnO1xuaW1wb3J0IHtcblx0dmFsaWRhdGVQbHVnaW5OYW1lLFxuXHRnZXRSZXNvdXJjZUxhYmVsLFxuXHRnZXRSZXNvdXJjZUZpbGVOYW1lLFxuXHRzZXJpYWxpemVIb29rQ29tbWFuZCxcblx0c2VyaWFsaXplTWNwTGF1bmNoLFxuXHR3cml0ZVBsdWdpblRvRGlzayxcblx0dXBkYXRlTWFya2V0cGxhY2VJZk5lZWRlZCxcblx0dHlwZSBJUmVzb3VyY2VUcmVlSXRlbSxcbn0gZnJvbSAnLi4vLi4vLi4vYnJvd3Nlci9hY3Rpb25zL2NyZWF0ZVBsdWdpbkFjdGlvbi5qcyc7XG5cbmZ1bmN0aW9uIG1ha2VQcm9tcHRQYXRoKG92ZXJyaWRlczogUGFydGlhbDxJUHJvbXB0UGF0aD4gJiB7IHVyaTogVVJJOyBzdG9yYWdlOiBQcm9tcHRzU3RvcmFnZTsgdHlwZTogUHJvbXB0c1R5cGUgfSk6IElQcm9tcHRQYXRoIHtcblx0cmV0dXJuIG92ZXJyaWRlcyBhcyBJUHJvbXB0UGF0aDtcbn1cblxuZnVuY3Rpb24gbWFrZVJlc291cmNlSXRlbShvdmVycmlkZXM6IFBhcnRpYWw8SVJlc291cmNlVHJlZUl0ZW0+ICYgUGljazxJUmVzb3VyY2VUcmVlSXRlbSwgJ2xhYmVsJyB8ICdyZXNvdXJjZVR5cGUnPik6IElSZXNvdXJjZVRyZWVJdGVtIHtcblx0cmV0dXJuIHsgY2hlY2tlZDogZmFsc2UsIC4uLm92ZXJyaWRlcyB9O1xufVxuXG5zdWl0ZSgnQ3JlYXRlUGx1Z2luQWN0aW9uIGhlbHBlcnMnLCAoKSA9PiB7XG5cblx0ZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlKCk7XG5cblx0c3VpdGUoJ3ZhbGlkYXRlUGx1Z2luTmFtZScsICgpID0+IHtcblxuXHRcdHRlc3QoJ3JlamVjdHMgZW1wdHkgbmFtZScsICgpID0+IHtcblx0XHRcdGFzc2VydC5vayh2YWxpZGF0ZVBsdWdpbk5hbWUoJycpKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2FjY2VwdHMgdmFsaWQgbmFtZXMnLCAoKSA9PiB7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKFxuXHRcdFx0XHRbJ215LXBsdWdpbicsICdwbHVnaW4xJywgJ2EnLCAnY29kZS1yZXZpZXdlcicsICdteS5wbHVnaW4nLCAnYTFiMmMzJ10ubWFwKG4gPT4gdmFsaWRhdGVQbHVnaW5OYW1lKG4pKSxcblx0XHRcdFx0W3VuZGVmaW5lZCwgdW5kZWZpbmVkLCB1bmRlZmluZWQsIHVuZGVmaW5lZCwgdW5kZWZpbmVkLCB1bmRlZmluZWRdXG5cdFx0XHQpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgncmVqZWN0cyBuYW1lcyB3aXRoIGludmFsaWQgY2hhcmFjdGVycycsICgpID0+IHtcblx0XHRcdGFzc2VydC5vayh2YWxpZGF0ZVBsdWdpbk5hbWUoJ015LVBsdWdpbicpKTtcblx0XHRcdGFzc2VydC5vayh2YWxpZGF0ZVBsdWdpbk5hbWUoJ215X3BsdWdpbicpKTtcblx0XHRcdGFzc2VydC5vayh2YWxpZGF0ZVBsdWdpbk5hbWUoJ215IHBsdWdpbicpKTtcblx0XHRcdGFzc2VydC5vayh2YWxpZGF0ZVBsdWdpbk5hbWUoJ3BsdWdpbiEnKSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdyZWplY3RzIG5hbWVzIG5vdCBzdGFydGluZy9lbmRpbmcgd2l0aCBhbHBoYW51bWVyaWMnLCAoKSA9PiB7XG5cdFx0XHRhc3NlcnQub2sodmFsaWRhdGVQbHVnaW5OYW1lKCctcGx1Z2luJykpO1xuXHRcdFx0YXNzZXJ0Lm9rKHZhbGlkYXRlUGx1Z2luTmFtZSgncGx1Z2luLScpKTtcblx0XHRcdGFzc2VydC5vayh2YWxpZGF0ZVBsdWdpbk5hbWUoJy5wbHVnaW4nKSk7XG5cdFx0XHRhc3NlcnQub2sodmFsaWRhdGVQbHVnaW5OYW1lKCdwbHVnaW4uJykpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgncmVqZWN0cyBjb25zZWN1dGl2ZSBoeXBoZW5zIG9yIHBlcmlvZHMnLCAoKSA9PiB7XG5cdFx0XHRhc3NlcnQub2sodmFsaWRhdGVQbHVnaW5OYW1lKCdteS0tcGx1Z2luJykpO1xuXHRcdFx0YXNzZXJ0Lm9rKHZhbGlkYXRlUGx1Z2luTmFtZSgnbXkuLnBsdWdpbicpKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3JlamVjdHMgbmFtZXMgbG9uZ2VyIHRoYW4gNjQgY2hhcmFjdGVycycsICgpID0+IHtcblx0XHRcdGFzc2VydC5vayh2YWxpZGF0ZVBsdWdpbk5hbWUoJ2EnLnJlcGVhdCg2NSkpKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2FjY2VwdHMgbmFtZSB3aXRoIGV4YWN0bHkgNjQgY2hhcmFjdGVycycsICgpID0+IHtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbCh2YWxpZGF0ZVBsdWdpbk5hbWUoJ2EnLnJlcGVhdCg2NCkpLCB1bmRlZmluZWQpO1xuXHRcdH0pO1xuXHR9KTtcblxuXHRzdWl0ZSgnZ2V0UmVzb3VyY2VMYWJlbCcsICgpID0+IHtcblxuXHRcdHRlc3QoJ3JldHVybnMgbmFtZSBpZiBzZXQnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBwYXRoID0gbWFrZVByb21wdFBhdGgoe1xuXHRcdFx0XHR1cmk6IFVSSS5maWxlKCcvZm9vL2Jhci5pbnN0cnVjdGlvbnMubWQnKSxcblx0XHRcdFx0c3RvcmFnZTogUHJvbXB0c1N0b3JhZ2UubG9jYWwsXG5cdFx0XHRcdHR5cGU6IFByb21wdHNUeXBlLmluc3RydWN0aW9ucyxcblx0XHRcdFx0bmFtZTogJ215LWluc3RydWN0aW9ucycsXG5cdFx0XHR9KTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChnZXRSZXNvdXJjZUxhYmVsKHBhdGgpLCAnbXktaW5zdHJ1Y3Rpb25zJyk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdyZXR1cm5zIGJhc2VuYW1lIGZvciBub24tc2tpbGwgcmVzb3VyY2VzIHdpdGhvdXQgbmFtZScsICgpID0+IHtcblx0XHRcdGNvbnN0IHBhdGggPSBtYWtlUHJvbXB0UGF0aCh7XG5cdFx0XHRcdHVyaTogVVJJLmZpbGUoJy9mb28vYmFyLmluc3RydWN0aW9ucy5tZCcpLFxuXHRcdFx0XHRzdG9yYWdlOiBQcm9tcHRzU3RvcmFnZS5sb2NhbCxcblx0XHRcdFx0dHlwZTogUHJvbXB0c1R5cGUuaW5zdHJ1Y3Rpb25zLFxuXHRcdFx0fSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZ2V0UmVzb3VyY2VMYWJlbChwYXRoKSwgJ2Jhci5pbnN0cnVjdGlvbnMubWQnKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3JldHVybnMgcGFyZW50IGRpcmVjdG9yeSBuYW1lIGZvciBza2lsbHMgcG9pbnRpbmcgdG8gU0tJTEwubWQnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBwYXRoID0gbWFrZVByb21wdFBhdGgoe1xuXHRcdFx0XHR1cmk6IFVSSS5maWxlKCcvd29ya3NwYWNlLy5naXRodWIvc2tpbGxzL215LXNraWxsL1NLSUxMLm1kJyksXG5cdFx0XHRcdHN0b3JhZ2U6IFByb21wdHNTdG9yYWdlLmxvY2FsLFxuXHRcdFx0XHR0eXBlOiBQcm9tcHRzVHlwZS5za2lsbCxcblx0XHRcdH0pO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGdldFJlc291cmNlTGFiZWwocGF0aCksICdteS1za2lsbCcpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgncmV0dXJucyBiYXNlbmFtZSBmb3Igc2tpbGwgbm90IG5hbWVkIFNLSUxMLm1kJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgcGF0aCA9IG1ha2VQcm9tcHRQYXRoKHtcblx0XHRcdFx0dXJpOiBVUkkuZmlsZSgnL3dvcmtzcGFjZS8uZ2l0aHViL3NraWxscy9jdXN0b20ubWQnKSxcblx0XHRcdFx0c3RvcmFnZTogUHJvbXB0c1N0b3JhZ2UubG9jYWwsXG5cdFx0XHRcdHR5cGU6IFByb21wdHNUeXBlLnNraWxsLFxuXHRcdFx0fSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZ2V0UmVzb3VyY2VMYWJlbChwYXRoKSwgJ2N1c3RvbS5tZCcpO1xuXHRcdH0pO1xuXHR9KTtcblxuXHRzdWl0ZSgnZ2V0UmVzb3VyY2VGaWxlTmFtZScsICgpID0+IHtcblxuXHRcdHRlc3QoJ3N0cmlwcyBuYW1lc3BhY2UgcHJlZml4JywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgcGF0aCA9IG1ha2VQcm9tcHRQYXRoKHtcblx0XHRcdFx0dXJpOiBVUkkuZmlsZSgnL2Zvby9TS0lMTC5tZCcpLFxuXHRcdFx0XHRzdG9yYWdlOiBQcm9tcHRzU3RvcmFnZS5wbHVnaW4sXG5cdFx0XHRcdHR5cGU6IFByb21wdHNUeXBlLnNraWxsLFxuXHRcdFx0XHRuYW1lOiAnaG9va2lmeTp3cml0aW5nLXJ1bGVzJyxcblx0XHRcdH0pO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGdldFJlc291cmNlRmlsZU5hbWUocGF0aCksICd3cml0aW5nLXJ1bGVzJyk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdyZXR1cm5zIGZ1bGwgbmFtZSB3aGVuIG5vIHByZWZpeCcsICgpID0+IHtcblx0XHRcdGNvbnN0IHBhdGggPSBtYWtlUHJvbXB0UGF0aCh7XG5cdFx0XHRcdHVyaTogVVJJLmZpbGUoJy9mb28vbXktc2tpbGwvU0tJTEwubWQnKSxcblx0XHRcdFx0c3RvcmFnZTogUHJvbXB0c1N0b3JhZ2UubG9jYWwsXG5cdFx0XHRcdHR5cGU6IFByb21wdHNUeXBlLnNraWxsLFxuXHRcdFx0fSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZ2V0UmVzb3VyY2VGaWxlTmFtZShwYXRoKSwgJ215LXNraWxsJyk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdoYW5kbGVzIG5hbWVzIHdpdGggbXVsdGlwbGUgY29sb25zJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgcGF0aCA9IG1ha2VQcm9tcHRQYXRoKHtcblx0XHRcdFx0dXJpOiBVUkkuZmlsZSgnL2Zvby9iYXIubWQnKSxcblx0XHRcdFx0c3RvcmFnZTogUHJvbXB0c1N0b3JhZ2UucGx1Z2luLFxuXHRcdFx0XHR0eXBlOiBQcm9tcHRzVHlwZS5hZ2VudCxcblx0XHRcdFx0bmFtZTogJ25zOnN1YjpuYW1lJyxcblx0XHRcdH0pO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGdldFJlc291cmNlRmlsZU5hbWUocGF0aCksICdzdWI6bmFtZScpO1xuXHRcdH0pO1xuXHR9KTtcblxuXHRzdWl0ZSgnc2VyaWFsaXplSG9va0NvbW1hbmQnLCAoKSA9PiB7XG5cblx0XHR0ZXN0KCdzZXJpYWxpemVzIGJhc2ljIGNvbW1hbmQnLCAoKSA9PiB7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHNlcmlhbGl6ZUhvb2tDb21tYW5kKHsgdHlwZTogJ2NvbW1hbmQnLCBjb21tYW5kOiAnZWNobyBoZWxsbycgfSksIHtcblx0XHRcdFx0dHlwZTogJ2NvbW1hbmQnLFxuXHRcdFx0XHRjb21tYW5kOiAnZWNobyBoZWxsbycsXG5cdFx0XHR9KTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3NlcmlhbGl6ZXMgcGxhdGZvcm0tc3BlY2lmaWMgY29tbWFuZHMnLCAoKSA9PiB7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKFxuXHRcdFx0XHRzZXJpYWxpemVIb29rQ29tbWFuZCh7XG5cdFx0XHRcdFx0dHlwZTogJ2NvbW1hbmQnLFxuXHRcdFx0XHRcdGNvbW1hbmQ6ICdlY2hvIGhlbGxvJyxcblx0XHRcdFx0XHR3aW5kb3dzOiAnZWNoby5leGUgaGVsbG8nLFxuXHRcdFx0XHRcdGxpbnV4OiAnL2Jpbi9lY2hvIGhlbGxvJyxcblx0XHRcdFx0XHRvc3g6ICcvYmluL2VjaG8gaGVsbG8nLFxuXHRcdFx0XHR9KSxcblx0XHRcdFx0e1xuXHRcdFx0XHRcdHR5cGU6ICdjb21tYW5kJyxcblx0XHRcdFx0XHRjb21tYW5kOiAnZWNobyBoZWxsbycsXG5cdFx0XHRcdFx0d2luZG93czogJ2VjaG8uZXhlIGhlbGxvJyxcblx0XHRcdFx0XHRsaW51eDogJy9iaW4vZWNobyBoZWxsbycsXG5cdFx0XHRcdFx0b3N4OiAnL2Jpbi9lY2hvIGhlbGxvJyxcblx0XHRcdFx0fVxuXHRcdFx0KTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2luY2x1ZGVzIGVudiBhbmQgdGltZW91dCB3aGVuIHByZXNlbnQnLCAoKSA9PiB7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKFxuXHRcdFx0XHRzZXJpYWxpemVIb29rQ29tbWFuZCh7XG5cdFx0XHRcdFx0dHlwZTogJ2NvbW1hbmQnLFxuXHRcdFx0XHRcdGNvbW1hbmQ6ICd0ZXN0Jyxcblx0XHRcdFx0XHRlbnY6IHsgRk9POiAnYmFyJyB9LFxuXHRcdFx0XHRcdHRpbWVvdXQ6IDUwMDAsXG5cdFx0XHRcdH0pLFxuXHRcdFx0XHR7XG5cdFx0XHRcdFx0dHlwZTogJ2NvbW1hbmQnLFxuXHRcdFx0XHRcdGNvbW1hbmQ6ICd0ZXN0Jyxcblx0XHRcdFx0XHRlbnY6IHsgRk9POiAnYmFyJyB9LFxuXHRcdFx0XHRcdHRpbWVvdXQ6IDUwMDAsXG5cdFx0XHRcdH1cblx0XHRcdCk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdvbWl0cyBlbXB0eSBlbnYnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCByZXN1bHQgPSBzZXJpYWxpemVIb29rQ29tbWFuZCh7IHR5cGU6ICdjb21tYW5kJywgY29tbWFuZDogJ3Rlc3QnLCBlbnY6IHt9IH0pO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdFsnZW52J10sIHVuZGVmaW5lZCk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdjb252ZXJ0cyBVUkktbGlrZSBjd2QgdG8gc3RyaW5nJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgY3dkID0gVVJJLmZpbGUoJy93b3Jrc3BhY2UnKTtcblx0XHRcdGNvbnN0IHJlc3VsdCA9IHNlcmlhbGl6ZUhvb2tDb21tYW5kKHsgdHlwZTogJ2NvbW1hbmQnLCBjb21tYW5kOiAndGVzdCcsIGN3ZCB9KTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbCh0eXBlb2YgcmVzdWx0Wydjd2QnXSwgJ3N0cmluZycpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgncHJlc2VydmVzIHRpbWVvdXQgb2YgMCcsICgpID0+IHtcblx0XHRcdGNvbnN0IHJlc3VsdCA9IHNlcmlhbGl6ZUhvb2tDb21tYW5kKHsgdHlwZTogJ2NvbW1hbmQnLCBjb21tYW5kOiAndGVzdCcsIHRpbWVvdXQ6IDAgfSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0Wyd0aW1lb3V0J10sIDApO1xuXHRcdH0pO1xuXHR9KTtcblxuXHRzdWl0ZSgnc2VyaWFsaXplTWNwTGF1bmNoJywgKCkgPT4ge1xuXG5cdFx0dGVzdCgnc2VyaWFsaXplcyBzdGRpbyBsYXVuY2gnLCAoKSA9PiB7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKFxuXHRcdFx0XHRzZXJpYWxpemVNY3BMYXVuY2goe1xuXHRcdFx0XHRcdHR5cGU6IE1jcFNlcnZlclRyYW5zcG9ydFR5cGUuU3RkaW8sXG5cdFx0XHRcdFx0Y29tbWFuZDogJ25vZGUnLFxuXHRcdFx0XHRcdGFyZ3M6IFsnc2VydmVyLmpzJ10sXG5cdFx0XHRcdFx0Y3dkOiAnL3dvcmtzcGFjZScsXG5cdFx0XHRcdFx0ZW52OiB7IE5PREVfRU5WOiAncHJvZHVjdGlvbicgfSxcblx0XHRcdFx0XHRlbnZGaWxlOiB1bmRlZmluZWQsXG5cdFx0XHRcdFx0c2FuZGJveDogdW5kZWZpbmVkLFxuXHRcdFx0XHR9KSxcblx0XHRcdFx0e1xuXHRcdFx0XHRcdHR5cGU6ICdzdGRpbycsXG5cdFx0XHRcdFx0Y29tbWFuZDogJ25vZGUnLFxuXHRcdFx0XHRcdGFyZ3M6IFsnc2VydmVyLmpzJ10sXG5cdFx0XHRcdFx0Y3dkOiAnL3dvcmtzcGFjZScsXG5cdFx0XHRcdFx0ZW52OiB7IE5PREVfRU5WOiAncHJvZHVjdGlvbicgfSxcblx0XHRcdFx0fVxuXHRcdFx0KTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ29taXRzIGVtcHR5IGFyZ3MgYW5kIGVudiBmb3Igc3RkaW8nLCAoKSA9PiB7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKFxuXHRcdFx0XHRzZXJpYWxpemVNY3BMYXVuY2goe1xuXHRcdFx0XHRcdHR5cGU6IE1jcFNlcnZlclRyYW5zcG9ydFR5cGUuU3RkaW8sXG5cdFx0XHRcdFx0Y29tbWFuZDogJ3NlcnZlcicsXG5cdFx0XHRcdFx0YXJnczogW10sXG5cdFx0XHRcdFx0Y3dkOiB1bmRlZmluZWQsXG5cdFx0XHRcdFx0ZW52OiB7fSxcblx0XHRcdFx0XHRlbnZGaWxlOiB1bmRlZmluZWQsXG5cdFx0XHRcdFx0c2FuZGJveDogdW5kZWZpbmVkLFxuXHRcdFx0XHR9KSxcblx0XHRcdFx0e1xuXHRcdFx0XHRcdHR5cGU6ICdzdGRpbycsXG5cdFx0XHRcdFx0Y29tbWFuZDogJ3NlcnZlcicsXG5cdFx0XHRcdH1cblx0XHRcdCk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdzZXJpYWxpemVzIGh0dHAgbGF1bmNoJywgKCkgPT4ge1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChcblx0XHRcdFx0c2VyaWFsaXplTWNwTGF1bmNoKHtcblx0XHRcdFx0XHR0eXBlOiBNY3BTZXJ2ZXJUcmFuc3BvcnRUeXBlLkhUVFAsXG5cdFx0XHRcdFx0dXJpOiBVUkkucGFyc2UoJ2h0dHA6Ly9sb2NhbGhvc3Q6MzAwMCcpLFxuXHRcdFx0XHRcdGhlYWRlcnM6IFtbJ0F1dGhvcml6YXRpb24nLCAnQmVhcmVyIHRva2VuJ11dLFxuXHRcdFx0XHR9KSxcblx0XHRcdFx0e1xuXHRcdFx0XHRcdHR5cGU6ICdodHRwJyxcblx0XHRcdFx0XHR1cmw6ICdodHRwOi8vbG9jYWxob3N0OjMwMDAvJyxcblx0XHRcdFx0XHRoZWFkZXJzOiB7IEF1dGhvcml6YXRpb246ICdCZWFyZXIgdG9rZW4nIH0sXG5cdFx0XHRcdH1cblx0XHRcdCk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdvbWl0cyBlbXB0eSBoZWFkZXJzIGZvciBodHRwJywgKCkgPT4ge1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChcblx0XHRcdFx0c2VyaWFsaXplTWNwTGF1bmNoKHtcblx0XHRcdFx0XHR0eXBlOiBNY3BTZXJ2ZXJUcmFuc3BvcnRUeXBlLkhUVFAsXG5cdFx0XHRcdFx0dXJpOiBVUkkucGFyc2UoJ2h0dHA6Ly9sb2NhbGhvc3Q6MzAwMCcpLFxuXHRcdFx0XHRcdGhlYWRlcnM6IFtdLFxuXHRcdFx0XHR9KSxcblx0XHRcdFx0e1xuXHRcdFx0XHRcdHR5cGU6ICdodHRwJyxcblx0XHRcdFx0XHR1cmw6ICdodHRwOi8vbG9jYWxob3N0OjMwMDAvJyxcblx0XHRcdFx0fVxuXHRcdFx0KTtcblx0XHR9KTtcblx0fSk7XG59KTtcblxuc3VpdGUoJ3dyaXRlUGx1Z2luVG9EaXNrJywgKCkgPT4ge1xuXG5cdGNvbnN0IGRpc3Bvc2FibGVzID0gbmV3IERpc3Bvc2FibGVTdG9yZSgpO1xuXHRsZXQgZmlsZVNlcnZpY2U6IElGaWxlU2VydmljZTtcblx0Y29uc3Qgcm9vdCA9IFVSSS5mcm9tKHsgc2NoZW1lOiBTY2hlbWFzLmluTWVtb3J5LCBwYXRoOiAnL3Rlc3QnIH0pO1xuXG5cdHNldHVwKCgpID0+IHtcblx0XHRjb25zdCBzZXJ2aWNlID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBGaWxlU2VydmljZShuZXcgTnVsbExvZ1NlcnZpY2UoKSkpO1xuXHRcdGNvbnN0IHByb3ZpZGVyID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBJbk1lbW9yeUZpbGVTeXN0ZW1Qcm92aWRlcigpKTtcblx0XHRkaXNwb3NhYmxlcy5hZGQoc2VydmljZS5yZWdpc3RlclByb3ZpZGVyKFNjaGVtYXMuaW5NZW1vcnksIHByb3ZpZGVyKSk7XG5cdFx0ZmlsZVNlcnZpY2UgPSBzZXJ2aWNlO1xuXHR9KTtcblxuXHR0ZWFyZG93bigoKSA9PiB7XG5cdFx0ZGlzcG9zYWJsZXMuY2xlYXIoKTtcblx0fSk7XG5cblx0ZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlKCk7XG5cblx0YXN5bmMgZnVuY3Rpb24gcmVhZEpzb24odXJpOiBVUkkpOiBQcm9taXNlPFJlY29yZDxzdHJpbmcsIHVua25vd24+PiB7XG5cdFx0Y29uc3QgY29udGVudCA9IGF3YWl0IGZpbGVTZXJ2aWNlLnJlYWRGaWxlKHVyaSk7XG5cdFx0cmV0dXJuIEpTT04ucGFyc2UoY29udGVudC52YWx1ZS50b1N0cmluZygpKTtcblx0fVxuXG5cdHRlc3QoJ2NyZWF0ZXMgbWFuaWZlc3Qgd2l0aCBjb3JyZWN0IHN0cnVjdHVyZScsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBwbHVnaW5Sb290ID0gVVJJLmpvaW5QYXRoKHJvb3QsICdteS1wbHVnaW4nKTtcblx0XHRhd2FpdCB3cml0ZVBsdWdpblRvRGlzayhmaWxlU2VydmljZSwgcGx1Z2luUm9vdCwgJ215LXBsdWdpbicsIFtdKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoYXdhaXQgcmVhZEpzb24oVVJJLmpvaW5QYXRoKHBsdWdpblJvb3QsICcucGx1Z2luJywgJ3BsdWdpbi5qc29uJykpLCB7XG5cdFx0XHRuYW1lOiAnbXktcGx1Z2luJyxcblx0XHRcdHZlcnNpb246ICcxLjAuMCcsXG5cdFx0XHRkZXNjcmlwdGlvbjogJycsXG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2NvcGllcyBpbnN0cnVjdGlvbnMgdG8gcnVsZXMvJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHNvdXJjZVVyaSA9IFVSSS5qb2luUGF0aChyb290LCAnc291cmNlJywgJ2NvZGluZy5pbnN0cnVjdGlvbnMubWQnKTtcblx0XHRhd2FpdCBmaWxlU2VydmljZS53cml0ZUZpbGUoc291cmNlVXJpLCBWU0J1ZmZlci5mcm9tU3RyaW5nKCcjIE15IGNvZGluZyBydWxlcycpKTtcblxuXHRcdGNvbnN0IHBsdWdpblJvb3QgPSBVUkkuam9pblBhdGgocm9vdCwgJ3Rlc3QtcGx1Z2luJyk7XG5cdFx0YXdhaXQgd3JpdGVQbHVnaW5Ub0Rpc2soZmlsZVNlcnZpY2UsIHBsdWdpblJvb3QsICd0ZXN0LXBsdWdpbicsIFtcblx0XHRcdG1ha2VSZXNvdXJjZUl0ZW0oe1xuXHRcdFx0XHRsYWJlbDogJ2NvZGluZycsXG5cdFx0XHRcdHJlc291cmNlVHlwZTogJ2luc3RydWN0aW9uJyxcblx0XHRcdFx0cHJvbXB0UGF0aDogbWFrZVByb21wdFBhdGgoe1xuXHRcdFx0XHRcdHVyaTogc291cmNlVXJpLFxuXHRcdFx0XHRcdHN0b3JhZ2U6IFByb21wdHNTdG9yYWdlLmxvY2FsLFxuXHRcdFx0XHRcdHR5cGU6IFByb21wdHNUeXBlLmluc3RydWN0aW9ucyxcblx0XHRcdFx0XHRuYW1lOiAnY29kaW5nJyxcblx0XHRcdFx0fSksXG5cdFx0XHR9KSxcblx0XHRdKTtcblxuXHRcdGNvbnN0IGNvbnRlbnQgPSBhd2FpdCBmaWxlU2VydmljZS5yZWFkRmlsZShVUkkuam9pblBhdGgocGx1Z2luUm9vdCwgJ3J1bGVzJywgJ2NvZGluZy5pbnN0cnVjdGlvbnMubWQnKSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNvbnRlbnQudmFsdWUudG9TdHJpbmcoKSwgJyMgTXkgY29kaW5nIHJ1bGVzJyk7XG5cdH0pO1xuXG5cdHRlc3QoJ3ByZXNlcnZlcyAubWRjIHN1ZmZpeCBmb3IgcnVsZSBmaWxlcycsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBzb3VyY2VVcmkgPSBVUkkuam9pblBhdGgocm9vdCwgJ3NvdXJjZScsICdwcmVmZXItY29uc3QubWRjJyk7XG5cdFx0YXdhaXQgZmlsZVNlcnZpY2Uud3JpdGVGaWxlKHNvdXJjZVVyaSwgVlNCdWZmZXIuZnJvbVN0cmluZygncHJlZmVyIGNvbnN0JykpO1xuXG5cdFx0Y29uc3QgcGx1Z2luUm9vdCA9IFVSSS5qb2luUGF0aChyb290LCAndGVzdC1wbHVnaW4nKTtcblx0XHRhd2FpdCB3cml0ZVBsdWdpblRvRGlzayhmaWxlU2VydmljZSwgcGx1Z2luUm9vdCwgJ3Rlc3QtcGx1Z2luJywgW1xuXHRcdFx0bWFrZVJlc291cmNlSXRlbSh7XG5cdFx0XHRcdGxhYmVsOiAncHJlZmVyLWNvbnN0Lm1kYycsXG5cdFx0XHRcdHJlc291cmNlVHlwZTogJ2luc3RydWN0aW9uJyxcblx0XHRcdFx0cHJvbXB0UGF0aDogbWFrZVByb21wdFBhdGgoe1xuXHRcdFx0XHRcdHVyaTogc291cmNlVXJpLFxuXHRcdFx0XHRcdHN0b3JhZ2U6IFByb21wdHNTdG9yYWdlLmxvY2FsLFxuXHRcdFx0XHRcdHR5cGU6IFByb21wdHNUeXBlLmluc3RydWN0aW9ucyxcblx0XHRcdFx0XHRuYW1lOiAncHJlZmVyLWNvbnN0Lm1kYycsXG5cdFx0XHRcdH0pLFxuXHRcdFx0fSksXG5cdFx0XSk7XG5cblx0XHRjb25zdCBjb250ZW50ID0gYXdhaXQgZmlsZVNlcnZpY2UucmVhZEZpbGUoVVJJLmpvaW5QYXRoKHBsdWdpblJvb3QsICdydWxlcycsICdwcmVmZXItY29uc3QubWRjJykpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChjb250ZW50LnZhbHVlLnRvU3RyaW5nKCksICdwcmVmZXIgY29uc3QnKTtcblx0fSk7XG5cblx0dGVzdCgnY29waWVzIHByb21wdHMgdG8gY29tbWFuZHMvJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHNvdXJjZVVyaSA9IFVSSS5qb2luUGF0aChyb290LCAnc291cmNlJywgJ3Jldmlldy5wcm9tcHQubWQnKTtcblx0XHRhd2FpdCBmaWxlU2VydmljZS53cml0ZUZpbGUoc291cmNlVXJpLCBWU0J1ZmZlci5mcm9tU3RyaW5nKCdSZXZpZXcgdGhpcyBjb2RlJykpO1xuXG5cdFx0Y29uc3QgcGx1Z2luUm9vdCA9IFVSSS5qb2luUGF0aChyb290LCAndGVzdC1wbHVnaW4nKTtcblx0XHRhd2FpdCB3cml0ZVBsdWdpblRvRGlzayhmaWxlU2VydmljZSwgcGx1Z2luUm9vdCwgJ3Rlc3QtcGx1Z2luJywgW1xuXHRcdFx0bWFrZVJlc291cmNlSXRlbSh7XG5cdFx0XHRcdGxhYmVsOiAncmV2aWV3Jyxcblx0XHRcdFx0cmVzb3VyY2VUeXBlOiAncHJvbXB0Jyxcblx0XHRcdFx0cHJvbXB0UGF0aDogbWFrZVByb21wdFBhdGgoe1xuXHRcdFx0XHRcdHVyaTogc291cmNlVXJpLFxuXHRcdFx0XHRcdHN0b3JhZ2U6IFByb21wdHNTdG9yYWdlLmxvY2FsLFxuXHRcdFx0XHRcdHR5cGU6IFByb21wdHNUeXBlLnByb21wdCxcblx0XHRcdFx0XHRuYW1lOiAncmV2aWV3Jyxcblx0XHRcdFx0fSksXG5cdFx0XHR9KSxcblx0XHRdKTtcblxuXHRcdGNvbnN0IGNvbnRlbnQgPSBhd2FpdCBmaWxlU2VydmljZS5yZWFkRmlsZShVUkkuam9pblBhdGgocGx1Z2luUm9vdCwgJ2NvbW1hbmRzJywgJ3Jldmlldy5tZCcpKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY29udGVudC52YWx1ZS50b1N0cmluZygpLCAnUmV2aWV3IHRoaXMgY29kZScpO1xuXHR9KTtcblxuXHR0ZXN0KCdjb3BpZXMgYWdlbnRzIHRvIGFnZW50cy8nLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3Qgc291cmNlVXJpID0gVVJJLmpvaW5QYXRoKHJvb3QsICdzb3VyY2UnLCAncmV2aWV3ZXIuYWdlbnQubWQnKTtcblx0XHRhd2FpdCBmaWxlU2VydmljZS53cml0ZUZpbGUoc291cmNlVXJpLCBWU0J1ZmZlci5mcm9tU3RyaW5nKCctLS1cXG5uYW1lOiByZXZpZXdlclxcbi0tLVxcbllvdSByZXZpZXcgY29kZS4nKSk7XG5cblx0XHRjb25zdCBwbHVnaW5Sb290ID0gVVJJLmpvaW5QYXRoKHJvb3QsICd0ZXN0LXBsdWdpbicpO1xuXHRcdGF3YWl0IHdyaXRlUGx1Z2luVG9EaXNrKGZpbGVTZXJ2aWNlLCBwbHVnaW5Sb290LCAndGVzdC1wbHVnaW4nLCBbXG5cdFx0XHRtYWtlUmVzb3VyY2VJdGVtKHtcblx0XHRcdFx0bGFiZWw6ICdyZXZpZXdlcicsXG5cdFx0XHRcdHJlc291cmNlVHlwZTogJ2FnZW50Jyxcblx0XHRcdFx0cHJvbXB0UGF0aDogbWFrZVByb21wdFBhdGgoe1xuXHRcdFx0XHRcdHVyaTogc291cmNlVXJpLFxuXHRcdFx0XHRcdHN0b3JhZ2U6IFByb21wdHNTdG9yYWdlLmxvY2FsLFxuXHRcdFx0XHRcdHR5cGU6IFByb21wdHNUeXBlLmFnZW50LFxuXHRcdFx0XHRcdG5hbWU6ICdyZXZpZXdlcicsXG5cdFx0XHRcdH0pLFxuXHRcdFx0fSksXG5cdFx0XSk7XG5cblx0XHRjb25zdCBjb250ZW50ID0gYXdhaXQgZmlsZVNlcnZpY2UucmVhZEZpbGUoVVJJLmpvaW5QYXRoKHBsdWdpblJvb3QsICdhZ2VudHMnLCAncmV2aWV3ZXIubWQnKSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNvbnRlbnQudmFsdWUudG9TdHJpbmcoKSwgJy0tLVxcbm5hbWU6IHJldmlld2VyXFxuLS0tXFxuWW91IHJldmlldyBjb2RlLicpO1xuXHR9KTtcblxuXHR0ZXN0KCdjb3BpZXMgc2tpbGwgZGlyZWN0b3JpZXMgcmVjdXJzaXZlbHknLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3Qgc2tpbGxEaXIgPSBVUkkuam9pblBhdGgocm9vdCwgJ3NvdXJjZScsICdza2lsbHMnLCAnbXktc2tpbGwnKTtcblx0XHRhd2FpdCBmaWxlU2VydmljZS53cml0ZUZpbGUoVVJJLmpvaW5QYXRoKHNraWxsRGlyLCAnU0tJTEwubWQnKSwgVlNCdWZmZXIuZnJvbVN0cmluZygnIyBNeSBTa2lsbCcpKTtcblx0XHRhd2FpdCBmaWxlU2VydmljZS53cml0ZUZpbGUoVVJJLmpvaW5QYXRoKHNraWxsRGlyLCAnaGVscGVyLm1kJyksIFZTQnVmZmVyLmZyb21TdHJpbmcoJ2hlbHBlciBjb250ZW50JykpO1xuXG5cdFx0Y29uc3QgcGx1Z2luUm9vdCA9IFVSSS5qb2luUGF0aChyb290LCAndGVzdC1wbHVnaW4nKTtcblx0XHRhd2FpdCB3cml0ZVBsdWdpblRvRGlzayhmaWxlU2VydmljZSwgcGx1Z2luUm9vdCwgJ3Rlc3QtcGx1Z2luJywgW1xuXHRcdFx0bWFrZVJlc291cmNlSXRlbSh7XG5cdFx0XHRcdGxhYmVsOiAnbXktc2tpbGwnLFxuXHRcdFx0XHRyZXNvdXJjZVR5cGU6ICdza2lsbCcsXG5cdFx0XHRcdHByb21wdFBhdGg6IG1ha2VQcm9tcHRQYXRoKHtcblx0XHRcdFx0XHR1cmk6IFVSSS5qb2luUGF0aChza2lsbERpciwgJ1NLSUxMLm1kJyksXG5cdFx0XHRcdFx0c3RvcmFnZTogUHJvbXB0c1N0b3JhZ2UubG9jYWwsXG5cdFx0XHRcdFx0dHlwZTogUHJvbXB0c1R5cGUuc2tpbGwsXG5cdFx0XHRcdH0pLFxuXHRcdFx0fSksXG5cdFx0XSk7XG5cblx0XHRjb25zdCBza2lsbE1kID0gYXdhaXQgZmlsZVNlcnZpY2UucmVhZEZpbGUoVVJJLmpvaW5QYXRoKHBsdWdpblJvb3QsICdza2lsbHMnLCAnbXktc2tpbGwnLCAnU0tJTEwubWQnKSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNraWxsTWQudmFsdWUudG9TdHJpbmcoKSwgJyMgTXkgU2tpbGwnKTtcblx0XHRjb25zdCBoZWxwZXJNZCA9IGF3YWl0IGZpbGVTZXJ2aWNlLnJlYWRGaWxlKFVSSS5qb2luUGF0aChwbHVnaW5Sb290LCAnc2tpbGxzJywgJ215LXNraWxsJywgJ2hlbHBlci5tZCcpKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoaGVscGVyTWQudmFsdWUudG9TdHJpbmcoKSwgJ2hlbHBlciBjb250ZW50Jyk7XG5cdH0pO1xuXG5cdHRlc3QoJ21lcmdlcyBob29rcyBpbnRvIGhvb2tzL2hvb2tzLmpzb24nLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgaG9va3NVcmkgPSBVUkkuam9pblBhdGgocm9vdCwgJ3NvdXJjZScsICdob29rcy5qc29uJyk7XG5cdFx0YXdhaXQgZmlsZVNlcnZpY2Uud3JpdGVGaWxlKGhvb2tzVXJpLCBWU0J1ZmZlci5mcm9tU3RyaW5nKEpTT04uc3RyaW5naWZ5KHtcblx0XHRcdGhvb2tzOiB7XG5cdFx0XHRcdFNlc3Npb25TdGFydDogW3sgdHlwZTogJ2NvbW1hbmQnLCBjb21tYW5kOiAnZWNobyBzdGFydCcgfV0sXG5cdFx0XHRcdFByZVRvb2xVc2U6IFt7IHR5cGU6ICdjb21tYW5kJywgY29tbWFuZDogJ2VjaG8gcHJlJyB9XSxcblx0XHRcdH1cblx0XHR9KSkpO1xuXG5cdFx0Y29uc3QgcGx1Z2luUm9vdCA9IFVSSS5qb2luUGF0aChyb290LCAndGVzdC1wbHVnaW4nKTtcblx0XHRhd2FpdCB3cml0ZVBsdWdpblRvRGlzayhmaWxlU2VydmljZSwgcGx1Z2luUm9vdCwgJ3Rlc3QtcGx1Z2luJywgW1xuXHRcdFx0bWFrZVJlc291cmNlSXRlbSh7XG5cdFx0XHRcdGxhYmVsOiAnaG9va3MnLFxuXHRcdFx0XHRyZXNvdXJjZVR5cGU6ICdob29rJyxcblx0XHRcdFx0cHJvbXB0UGF0aDogbWFrZVByb21wdFBhdGgoe1xuXHRcdFx0XHRcdHVyaTogaG9va3NVcmksXG5cdFx0XHRcdFx0c3RvcmFnZTogUHJvbXB0c1N0b3JhZ2UubG9jYWwsXG5cdFx0XHRcdFx0dHlwZTogUHJvbXB0c1R5cGUuaG9vayxcblx0XHRcdFx0fSksXG5cdFx0XHR9KSxcblx0XHRdKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoYXdhaXQgcmVhZEpzb24oVVJJLmpvaW5QYXRoKHBsdWdpblJvb3QsICdob29rcycsICdob29rcy5qc29uJykpLCB7XG5cdFx0XHRob29rczoge1xuXHRcdFx0XHRTZXNzaW9uU3RhcnQ6IFt7IHR5cGU6ICdjb21tYW5kJywgY29tbWFuZDogJ2VjaG8gc3RhcnQnIH1dLFxuXHRcdFx0XHRQcmVUb29sVXNlOiBbeyB0eXBlOiAnY29tbWFuZCcsIGNvbW1hbmQ6ICdlY2hvIHByZScgfV0sXG5cdFx0XHR9XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2V4cG9ydHMgTUNQIHNlcnZlcnMgdG8gLm1jcC5qc29uJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHBsdWdpblJvb3QgPSBVUkkuam9pblBhdGgocm9vdCwgJ3Rlc3QtcGx1Z2luJyk7XG5cdFx0YXdhaXQgd3JpdGVQbHVnaW5Ub0Rpc2soZmlsZVNlcnZpY2UsIHBsdWdpblJvb3QsICd0ZXN0LXBsdWdpbicsIFtcblx0XHRcdG1ha2VSZXNvdXJjZUl0ZW0oe1xuXHRcdFx0XHRsYWJlbDogJ215LXNlcnZlcicsXG5cdFx0XHRcdHJlc291cmNlVHlwZTogJ21jcCcsXG5cdFx0XHRcdG1jcFNlcnZlcjoge1xuXHRcdFx0XHRcdGNvbGxlY3Rpb246IHtcblx0XHRcdFx0XHRcdGlkOiAnY29sMScsXG5cdFx0XHRcdFx0XHRsYWJlbDogJ1Rlc3QgQ29sbGVjdGlvbicsXG5cdFx0XHRcdFx0XHRvcmRlcjogTWNwQ29sbGVjdGlvblNvcnRPcmRlci5Vc2VyLFxuXHRcdFx0XHRcdH0gYXMgSVJlc291cmNlVHJlZUl0ZW1bJ21jcFNlcnZlciddIGV4dGVuZHMgdW5kZWZpbmVkID8gbmV2ZXIgOiBOb25OdWxsYWJsZTxJUmVzb3VyY2VUcmVlSXRlbVsnbWNwU2VydmVyJ10+Wydjb2xsZWN0aW9uJ10sXG5cdFx0XHRcdFx0ZGVmaW5pdGlvbjoge1xuXHRcdFx0XHRcdFx0aWQ6ICdkZWYxJyxcblx0XHRcdFx0XHRcdGxhYmVsOiAnbXktc2VydmVyJyxcblx0XHRcdFx0XHRcdGxhdW5jaDoge1xuXHRcdFx0XHRcdFx0XHR0eXBlOiBNY3BTZXJ2ZXJUcmFuc3BvcnRUeXBlLlN0ZGlvLFxuXHRcdFx0XHRcdFx0XHRjb21tYW5kOiAnbnB4Jyxcblx0XHRcdFx0XHRcdFx0YXJnczogWycteScsICdteS1tY3Atc2VydmVyJ10sXG5cdFx0XHRcdFx0XHRcdGN3ZDogdW5kZWZpbmVkLFxuXHRcdFx0XHRcdFx0XHRlbnY6IHt9LFxuXHRcdFx0XHRcdFx0XHRlbnZGaWxlOiB1bmRlZmluZWQsXG5cdFx0XHRcdFx0XHRcdHNhbmRib3g6IHVuZGVmaW5lZCxcblx0XHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0XHRjYWNoZU5vbmNlOiAnMScsXG5cdFx0XHRcdFx0fSBhcyBJUmVzb3VyY2VUcmVlSXRlbVsnbWNwU2VydmVyJ10gZXh0ZW5kcyB1bmRlZmluZWQgPyBuZXZlciA6IE5vbk51bGxhYmxlPElSZXNvdXJjZVRyZWVJdGVtWydtY3BTZXJ2ZXInXT5bJ2RlZmluaXRpb24nXSxcblx0XHRcdFx0fSxcblx0XHRcdH0pLFxuXHRcdF0pO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChhd2FpdCByZWFkSnNvbihVUkkuam9pblBhdGgocGx1Z2luUm9vdCwgJy5tY3AuanNvbicpKSwge1xuXHRcdFx0bWNwU2VydmVyczoge1xuXHRcdFx0XHQnbXktc2VydmVyJzoge1xuXHRcdFx0XHRcdHR5cGU6ICdzdGRpbycsXG5cdFx0XHRcdFx0Y29tbWFuZDogJ25weCcsXG5cdFx0XHRcdFx0YXJnczogWycteScsICdteS1tY3Atc2VydmVyJ10sXG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnc3RyaXBzIG5hbWVzcGFjZSBwcmVmaXggZnJvbSBwbHVnaW4gcmVzb3VyY2UgbmFtZXMnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3Qgc291cmNlVXJpID0gVVJJLmpvaW5QYXRoKHJvb3QsICdzb3VyY2UnLCAncnVsZXMuaW5zdHJ1Y3Rpb25zLm1kJyk7XG5cdFx0YXdhaXQgZmlsZVNlcnZpY2Uud3JpdGVGaWxlKHNvdXJjZVVyaSwgVlNCdWZmZXIuZnJvbVN0cmluZygnY29udGVudCcpKTtcblxuXHRcdGNvbnN0IHBsdWdpblJvb3QgPSBVUkkuam9pblBhdGgocm9vdCwgJ3Rlc3QtcGx1Z2luJyk7XG5cdFx0YXdhaXQgd3JpdGVQbHVnaW5Ub0Rpc2soZmlsZVNlcnZpY2UsIHBsdWdpblJvb3QsICd0ZXN0LXBsdWdpbicsIFtcblx0XHRcdG1ha2VSZXNvdXJjZUl0ZW0oe1xuXHRcdFx0XHRsYWJlbDogJ2hvb2tpZnk6d3JpdGluZy1ydWxlcycsXG5cdFx0XHRcdHJlc291cmNlVHlwZTogJ2luc3RydWN0aW9uJyxcblx0XHRcdFx0cHJvbXB0UGF0aDogbWFrZVByb21wdFBhdGgoe1xuXHRcdFx0XHRcdHVyaTogc291cmNlVXJpLFxuXHRcdFx0XHRcdHN0b3JhZ2U6IFByb21wdHNTdG9yYWdlLnBsdWdpbixcblx0XHRcdFx0XHR0eXBlOiBQcm9tcHRzVHlwZS5pbnN0cnVjdGlvbnMsXG5cdFx0XHRcdFx0bmFtZTogJ2hvb2tpZnk6d3JpdGluZy1ydWxlcycsXG5cdFx0XHRcdH0pLFxuXHRcdFx0fSksXG5cdFx0XSk7XG5cblx0XHRjb25zdCBjb250ZW50ID0gYXdhaXQgZmlsZVNlcnZpY2UucmVhZEZpbGUoVVJJLmpvaW5QYXRoKHBsdWdpblJvb3QsICdydWxlcycsICd3cml0aW5nLXJ1bGVzLmluc3RydWN0aW9ucy5tZCcpKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY29udGVudC52YWx1ZS50b1N0cmluZygpLCAnY29udGVudCcpO1xuXHR9KTtcblxuXHR0ZXN0KCdkb2VzIG5vdCBjcmVhdGUgZGlyZWN0b3JpZXMgZm9yIGVtcHR5IHJlc291cmNlIHR5cGVzJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHBsdWdpblJvb3QgPSBVUkkuam9pblBhdGgocm9vdCwgJ3Rlc3QtcGx1Z2luJyk7XG5cdFx0YXdhaXQgd3JpdGVQbHVnaW5Ub0Rpc2soZmlsZVNlcnZpY2UsIHBsdWdpblJvb3QsICd0ZXN0LXBsdWdpbicsIFtdKTtcblxuXHRcdGFzc2VydC5vayhhd2FpdCBmaWxlU2VydmljZS5leGlzdHMoVVJJLmpvaW5QYXRoKHBsdWdpblJvb3QsICcucGx1Z2luJywgJ3BsdWdpbi5qc29uJykpKTtcblx0XHRhc3NlcnQub2soIShhd2FpdCBmaWxlU2VydmljZS5leGlzdHMoVVJJLmpvaW5QYXRoKHBsdWdpblJvb3QsICdydWxlcycpKSkpO1xuXHRcdGFzc2VydC5vayghKGF3YWl0IGZpbGVTZXJ2aWNlLmV4aXN0cyhVUkkuam9pblBhdGgocGx1Z2luUm9vdCwgJ2NvbW1hbmRzJykpKSk7XG5cdFx0YXNzZXJ0Lm9rKCEoYXdhaXQgZmlsZVNlcnZpY2UuZXhpc3RzKFVSSS5qb2luUGF0aChwbHVnaW5Sb290LCAnYWdlbnRzJykpKSk7XG5cdFx0YXNzZXJ0Lm9rKCEoYXdhaXQgZmlsZVNlcnZpY2UuZXhpc3RzKFVSSS5qb2luUGF0aChwbHVnaW5Sb290LCAnc2tpbGxzJykpKSk7XG5cdFx0YXNzZXJ0Lm9rKCEoYXdhaXQgZmlsZVNlcnZpY2UuZXhpc3RzKFVSSS5qb2luUGF0aChwbHVnaW5Sb290LCAnaG9va3MnKSkpKTtcblx0XHRhc3NlcnQub2soIShhd2FpdCBmaWxlU2VydmljZS5leGlzdHMoVVJJLmpvaW5QYXRoKHBsdWdpblJvb3QsICcubWNwLmpzb24nKSkpKTtcblx0fSk7XG59KTtcblxuc3VpdGUoJ3VwZGF0ZU1hcmtldHBsYWNlSWZOZWVkZWQnLCAoKSA9PiB7XG5cblx0Y29uc3QgZGlzcG9zYWJsZXMgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cdGxldCBmaWxlU2VydmljZTogSUZpbGVTZXJ2aWNlO1xuXHRjb25zdCByb290ID0gVVJJLmZyb20oeyBzY2hlbWU6IFNjaGVtYXMuaW5NZW1vcnksIHBhdGg6ICcvbWFya2V0cGxhY2UtdGVzdCcgfSk7XG5cblx0c2V0dXAoKCkgPT4ge1xuXHRcdGNvbnN0IHNlcnZpY2UgPSBkaXNwb3NhYmxlcy5hZGQobmV3IEZpbGVTZXJ2aWNlKG5ldyBOdWxsTG9nU2VydmljZSgpKSk7XG5cdFx0Y29uc3QgcHJvdmlkZXIgPSBkaXNwb3NhYmxlcy5hZGQobmV3IEluTWVtb3J5RmlsZVN5c3RlbVByb3ZpZGVyKCkpO1xuXHRcdGRpc3Bvc2FibGVzLmFkZChzZXJ2aWNlLnJlZ2lzdGVyUHJvdmlkZXIoU2NoZW1hcy5pbk1lbW9yeSwgcHJvdmlkZXIpKTtcblx0XHRmaWxlU2VydmljZSA9IHNlcnZpY2U7XG5cdH0pO1xuXG5cdHRlYXJkb3duKCgpID0+IHtcblx0XHRkaXNwb3NhYmxlcy5jbGVhcigpO1xuXHR9KTtcblxuXHRlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUoKTtcblxuXHR0ZXN0KCdhZGRzIHBsdWdpbiB0byBleGlzdGluZyBtYXJrZXRwbGFjZS5qc29uJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IG1hcmtldHBsYWNlID0geyBuYW1lOiAnbXktbWFya2V0cGxhY2UnLCBwbHVnaW5zOiBbeyBuYW1lOiAnZXhpc3RpbmcnLCBzb3VyY2U6ICcuL2V4aXN0aW5nLycgfV0gfTtcblx0XHRhd2FpdCBmaWxlU2VydmljZS53cml0ZUZpbGUoVVJJLmpvaW5QYXRoKHJvb3QsICdtYXJrZXRwbGFjZS5qc29uJyksIFZTQnVmZmVyLmZyb21TdHJpbmcoSlNPTi5zdHJpbmdpZnkobWFya2V0cGxhY2UpKSk7XG5cblx0XHRhd2FpdCB1cGRhdGVNYXJrZXRwbGFjZUlmTmVlZGVkKGZpbGVTZXJ2aWNlLCByb290LCAnbmV3LXBsdWdpbicpO1xuXG5cdFx0Y29uc3QgY29udGVudCA9IGF3YWl0IGZpbGVTZXJ2aWNlLnJlYWRGaWxlKFVSSS5qb2luUGF0aChyb290LCAnbWFya2V0cGxhY2UuanNvbicpKTtcblx0XHRjb25zdCByZXN1bHQgPSBKU09OLnBhcnNlKGNvbnRlbnQudmFsdWUudG9TdHJpbmcoKSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChyZXN1bHQucGx1Z2lucywgW1xuXHRcdFx0eyBuYW1lOiAnZXhpc3RpbmcnLCBzb3VyY2U6ICcuL2V4aXN0aW5nLycgfSxcblx0XHRcdHsgbmFtZTogJ25ldy1wbHVnaW4nLCBzb3VyY2U6ICcuL25ldy1wbHVnaW4vJyB9LFxuXHRcdF0pO1xuXHR9KTtcblxuXHR0ZXN0KCdjcmVhdGVzIHBsdWdpbnMgYXJyYXkgaWYgbWlzc2luZycsIGFzeW5jICgpID0+IHtcblx0XHRhd2FpdCBmaWxlU2VydmljZS53cml0ZUZpbGUoVVJJLmpvaW5QYXRoKHJvb3QsICdtYXJrZXRwbGFjZS5qc29uJyksIFZTQnVmZmVyLmZyb21TdHJpbmcoSlNPTi5zdHJpbmdpZnkoeyBuYW1lOiAndGVzdCcgfSkpKTtcblxuXHRcdGF3YWl0IHVwZGF0ZU1hcmtldHBsYWNlSWZOZWVkZWQoZmlsZVNlcnZpY2UsIHJvb3QsICdteS1wbHVnaW4nKTtcblxuXHRcdGNvbnN0IGNvbnRlbnQgPSBhd2FpdCBmaWxlU2VydmljZS5yZWFkRmlsZShVUkkuam9pblBhdGgocm9vdCwgJ21hcmtldHBsYWNlLmpzb24nKSk7XG5cdFx0Y29uc3QgcmVzdWx0ID0gSlNPTi5wYXJzZShjb250ZW50LnZhbHVlLnRvU3RyaW5nKCkpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocmVzdWx0LnBsdWdpbnMsIFtcblx0XHRcdHsgbmFtZTogJ215LXBsdWdpbicsIHNvdXJjZTogJy4vbXktcGx1Z2luLycgfSxcblx0XHRdKTtcblx0fSk7XG5cblx0dGVzdCgnZGV0ZWN0cyAucGx1Z2luL21hcmtldHBsYWNlLmpzb24nLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgbWFya2V0cGxhY2UgPSB7IG5hbWU6ICd0ZXN0JywgcGx1Z2luczogW10gfTtcblx0XHRhd2FpdCBmaWxlU2VydmljZS53cml0ZUZpbGUoVVJJLmpvaW5QYXRoKHJvb3QsICcucGx1Z2luJywgJ21hcmtldHBsYWNlLmpzb24nKSwgVlNCdWZmZXIuZnJvbVN0cmluZyhKU09OLnN0cmluZ2lmeShtYXJrZXRwbGFjZSkpKTtcblxuXHRcdGF3YWl0IHVwZGF0ZU1hcmtldHBsYWNlSWZOZWVkZWQoZmlsZVNlcnZpY2UsIHJvb3QsICdteS1wbHVnaW4nKTtcblxuXHRcdGNvbnN0IGNvbnRlbnQgPSBhd2FpdCBmaWxlU2VydmljZS5yZWFkRmlsZShVUkkuam9pblBhdGgocm9vdCwgJy5wbHVnaW4nLCAnbWFya2V0cGxhY2UuanNvbicpKTtcblx0XHRjb25zdCByZXN1bHQgPSBKU09OLnBhcnNlKGNvbnRlbnQudmFsdWUudG9TdHJpbmcoKSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChyZXN1bHQucGx1Z2lucywgW1xuXHRcdFx0eyBuYW1lOiAnbXktcGx1Z2luJywgc291cmNlOiAnLi9teS1wbHVnaW4vJyB9LFxuXHRcdF0pO1xuXHR9KTtcblxuXHR0ZXN0KCdkb2VzIG5vdGhpbmcgd2hlbiBubyBtYXJrZXRwbGFjZS5qc29uIGV4aXN0cycsIGFzeW5jICgpID0+IHtcblx0XHRhd2FpdCB1cGRhdGVNYXJrZXRwbGFjZUlmTmVlZGVkKGZpbGVTZXJ2aWNlLCByb290LCAnbXktcGx1Z2luJyk7XG5cdFx0YXNzZXJ0Lm9rKCEoYXdhaXQgZmlsZVNlcnZpY2UuZXhpc3RzKFVSSS5qb2luUGF0aChyb290LCAnbWFya2V0cGxhY2UuanNvbicpKSkpO1xuXHR9KTtcblxuXHR0ZXN0KCdkb2VzIG5vdCBkdXBsaWNhdGUgZXhpc3RpbmcgcGx1Z2luIGVudHJ5JywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IG1hcmtldHBsYWNlID0geyBuYW1lOiAndGVzdCcsIHBsdWdpbnM6IFt7IG5hbWU6ICdteS1wbHVnaW4nLCBzb3VyY2U6ICcuL215LXBsdWdpbi8nIH1dIH07XG5cdFx0YXdhaXQgZmlsZVNlcnZpY2Uud3JpdGVGaWxlKFVSSS5qb2luUGF0aChyb290LCAnbWFya2V0cGxhY2UuanNvbicpLCBWU0J1ZmZlci5mcm9tU3RyaW5nKEpTT04uc3RyaW5naWZ5KG1hcmtldHBsYWNlKSkpO1xuXG5cdFx0YXdhaXQgdXBkYXRlTWFya2V0cGxhY2VJZk5lZWRlZChmaWxlU2VydmljZSwgcm9vdCwgJ215LXBsdWdpbicpO1xuXG5cdFx0Y29uc3QgY29udGVudCA9IGF3YWl0IGZpbGVTZXJ2aWNlLnJlYWRGaWxlKFVSSS5qb2luUGF0aChyb290LCAnbWFya2V0cGxhY2UuanNvbicpKTtcblx0XHRjb25zdCByZXN1bHQgPSBKU09OLnBhcnNlKGNvbnRlbnQudmFsdWUudG9TdHJpbmcoKSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChyZXN1bHQucGx1Z2lucywgW1xuXHRcdFx0eyBuYW1lOiAnbXktcGx1Z2luJywgc291cmNlOiAnLi9teS1wbHVnaW4vJyB9LFxuXHRcdF0pO1xuXHR9KTtcbn0pO1xuIl0sCiAgIm1hcHBpbmdzIjogIkFBS0EsT0FBTyxZQUFZO0FBQ25CLFNBQVMsZ0JBQWdCO0FBQ3pCLFNBQVMsdUJBQXVCO0FBQ2hDLFNBQVMsZUFBZTtBQUN4QixTQUFTLFdBQVc7QUFDcEIsU0FBUywrQ0FBK0M7QUFDeEQsU0FBUyxtQkFBbUI7QUFFNUIsU0FBUyxrQ0FBa0M7QUFDM0MsU0FBUyxzQkFBc0I7QUFDL0IsU0FBUyxtQkFBbUI7QUFDNUIsU0FBc0Isc0JBQXNCO0FBQzVDLFNBQVMsd0JBQXdCLDhCQUE4QjtBQUMvRDtBQUFBLEVBQ0M7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxPQUVNO0FBRVAsU0FBUyxlQUFlLFdBQXlHO0FBQ2hJLFNBQU87QUFDUjtBQUVBLFNBQVMsaUJBQWlCLFdBQThHO0FBQ3ZJLFNBQU8sRUFBRSxTQUFTLE9BQU8sR0FBRyxVQUFVO0FBQ3ZDO0FBRUEsTUFBTSw4QkFBOEIsTUFBTTtBQUV6QywwQ0FBd0M7QUFFeEMsUUFBTSxzQkFBc0Is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
