import assert from "assert";
import { Schemas } from "../../../../../../base/common/network.js";
import { URI } from "../../../../../../base/common/uri.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../../../base/test/common/utils.js";
import { FileService } from "../../../../../../platform/files/common/fileService.js";
import { InMemoryFileSystemProvider } from "../../../../../../platform/files/common/inMemoryFilesystemProvider.js";
import { NullLogService } from "../../../../../../platform/log/common/log.js";
import { AgentCustomizationContentExpander } from "../../../../../../workbench/contrib/chat/browser/agentSessions/agentHost/agentCustomizationContentExpander.js";
import { PromptsType } from "../../../common/promptSyntax/promptTypes.js";
import { mockFiles } from "../../../test/common/promptSyntax/testUtils/mockFilesystem.js";
import { AICustomizationSources } from "../../../common/aiCustomizationWorkspaceService.js";
import { CancellationToken } from "../../../../../../base/common/cancellation.js";
const REMOTE_HOST_GROUP = "remote-host";
const REMOTE_CLIENT_GROUP = "remote-client";
function expand(expander, pluginUri, groupKey, isBundleItem, source, token, pluginLabel) {
  return expander.expandPluginContents(pluginUri, groupKey, isBundleItem, source, pluginLabel, token);
}
suite("AgentCustomizationContentExpander", () => {
  const disposables = ensureNoDisposablesAreLeakedInTestSuite();
  let fileService;
  setup(() => {
    const fs = disposables.add(new FileService(new NullLogService()));
    const provider = disposables.add(new InMemoryFileSystemProvider());
    disposables.add(fs.registerProvider(Schemas.file, provider));
    fileService = fs;
  });
  suite("expandPluginContents \u2013 skills", () => {
    test("emits one item per subfolder that has a SKILL.md, skips folders without one", async () => {
      const pluginRoot = URI.file("/plugins/my-plugin");
      await mockFiles(fileService, [
        // valid skill folder with frontmatter name + description
        {
          path: "/plugins/my-plugin/skills/my-lint/SKILL.md",
          contents: [
            "---",
            "name: Lint",
            "description: Runs linting",
            "---",
            "",
            "# Body"
          ]
        },
        // skill folder missing SKILL.md → should be skipped
        {
          path: "/plugins/my-plugin/skills/broken/README.md",
          contents: [
            "no frontmatter"
          ]
        },
        // dotfile folder → should be skipped
        {
          path: "/plugins/my-plugin/skills/.hidden/SKILL.md",
          contents: [
            "---",
            "---"
          ]
        }
      ]);
      const expander = new AgentCustomizationContentExpander(fileService, new NullLogService());
      const items = await expand(expander, pluginRoot, REMOTE_HOST_GROUP, false, AICustomizationSources.plugin, CancellationToken.None);
      assert.deepStrictEqual(items.map((i) => ({ type: i.type, name: i.name, description: i.description })), [
        { type: PromptsType.skill, name: "Lint", description: "Runs linting" }
      ]);
    });
    test("uses folder name as fallback when SKILL.md has no name frontmatter", async () => {
      const pluginRoot = URI.file("/plugins/p");
      await mockFiles(fileService, [
        // SKILL.md exists but has no name/description
        {
          path: "/plugins/p/skills/unnamed-skill/SKILL.md",
          contents: [
            "---",
            "---",
            "",
            "# Content"
          ]
        }
      ]);
      const expander = new AgentCustomizationContentExpander(fileService, new NullLogService());
      const items = await expand(expander, pluginRoot, REMOTE_HOST_GROUP, false, AICustomizationSources.plugin, CancellationToken.None);
      assert.strictEqual(items.length, 1);
      assert.strictEqual(items[0].name, "unnamed-skill");
      assert.strictEqual(items[0].description, void 0);
    });
    test("rewrites skill folder URI to point at SKILL.md", async () => {
      const pluginRoot = URI.file("/plugins/q");
      await mockFiles(fileService, [
        {
          path: "/plugins/q/skills/my-skill/SKILL.md",
          contents: [
            "---",
            "name: My Skill",
            "---"
          ]
        }
      ]);
      const expander = new AgentCustomizationContentExpander(fileService, new NullLogService());
      const items = await expand(expander, pluginRoot, REMOTE_HOST_GROUP, false, AICustomizationSources.plugin, CancellationToken.None);
      assert.strictEqual(items.length, 1);
      assert.ok(items[0].uri.path.endsWith("/SKILL.md"), `expected SKILL.md URI, got ${items[0].uri}`);
    });
    test("userInvocable is surfaced from SKILL.md frontmatter", async () => {
      const pluginRoot = URI.file("/plugins/r");
      await mockFiles(fileService, [
        {
          path: "/plugins/r/skills/invocable/SKILL.md",
          contents: [
            "---",
            "name: Invocable",
            "user-invocable: true",
            "---"
          ]
        },
        {
          path: "/plugins/r/skills/silent/SKILL.md",
          contents: [
            "---",
            "name: Silent",
            "---"
          ]
        }
      ]);
      const expander = new AgentCustomizationContentExpander(fileService, new NullLogService());
      const items = await expand(expander, pluginRoot, REMOTE_HOST_GROUP, false, AICustomizationSources.plugin, CancellationToken.None);
      const invocable = items.find((i) => i.name === "Invocable");
      const silent = items.find((i) => i.name === "Silent");
      assert.ok(invocable, "should have invocable item");
      assert.ok(silent, "should have silent item");
      assert.strictEqual(invocable.userInvocable, true);
      assert.strictEqual(silent.userInvocable, void 0);
    });
    test("flat non-directory entries in skills/ are ignored", async () => {
      const pluginRoot = URI.file("/plugins/s");
      await mockFiles(fileService, [
        // flat file alongside a proper skill folder — flat files are no longer supported
        {
          path: "/plugins/s/skills/flat.skill.md",
          contents: [
            "---",
            "name: Flat",
            "---"
          ]
        },
        {
          path: "/plugins/s/skills/folder-skill/SKILL.md",
          contents: [
            "---",
            "name: Folder Skill",
            "---"
          ]
        }
      ]);
      const expander = new AgentCustomizationContentExpander(fileService, new NullLogService());
      const items = await expand(expander, pluginRoot, REMOTE_HOST_GROUP, false, AICustomizationSources.plugin, CancellationToken.None);
      assert.deepStrictEqual(items.map((i) => i.name), ["Folder Skill"]);
    });
  });
  suite("expandPluginContents \u2013 agents", () => {
    test("emits one item per .md file with name/description/userInvocable from frontmatter", async () => {
      const pluginRoot = URI.file("/plugins/agents-plugin");
      await mockFiles(fileService, [
        {
          path: "/plugins/agents-plugin/agents/my-agent.agent.md",
          contents: [
            "---",
            "name: My Agent",
            "description: Does things",
            "user-invocable: true",
            "---"
          ]
        },
        {
          path: "/plugins/agents-plugin/agents/other.agent.md",
          contents: [
            "---",
            "---"
          ]
        }
      ]);
      const expander = new AgentCustomizationContentExpander(fileService, new NullLogService());
      const items = await expand(expander, pluginRoot, REMOTE_HOST_GROUP, false, AICustomizationSources.plugin, CancellationToken.None);
      const agentItems = items.filter((i) => i.type === PromptsType.agent);
      assert.deepStrictEqual(
        agentItems.map((i) => ({ name: i.name, description: i.description, userInvocable: i.userInvocable })).sort((a, b) => a.name.localeCompare(b.name)),
        [
          { name: "My Agent", description: "Does things", userInvocable: true },
          { name: "other", description: void 0, userInvocable: void 0 }
        ]
      );
    });
    test("non-.md files in agents/ are ignored", async () => {
      const pluginRoot = URI.file("/plugins/agents-filter");
      await mockFiles(fileService, [
        {
          path: "/plugins/agents-filter/agents/valid.agent.md",
          contents: [
            "---",
            "name: Valid",
            "---"
          ]
        },
        {
          path: "/plugins/agents-filter/agents/ignored.json",
          contents: [
            "{}"
          ]
        },
        {
          path: "/plugins/agents-filter/agents/ignored.txt",
          contents: [
            "text"
          ]
        }
      ]);
      const expander = new AgentCustomizationContentExpander(fileService, new NullLogService());
      const items = await expand(expander, pluginRoot, REMOTE_HOST_GROUP, false, AICustomizationSources.plugin, CancellationToken.None);
      const agentItems = items.filter((i) => i.type === PromptsType.agent);
      assert.deepStrictEqual(agentItems.map((i) => i.name), ["Valid"]);
    });
    test("directories in agents/ are ignored", async () => {
      const pluginRoot = URI.file("/plugins/agents-no-dirs");
      await mockFiles(fileService, [
        {
          path: "/plugins/agents-no-dirs/agents/nested/some.agent.md",
          contents: [
            "---",
            "name: Nested",
            "---"
          ]
        },
        {
          path: "/plugins/agents-no-dirs/agents/flat.agent.md",
          contents: [
            "---",
            "name: Flat",
            "---"
          ]
        }
      ]);
      const expander = new AgentCustomizationContentExpander(fileService, new NullLogService());
      const items = await expand(expander, pluginRoot, REMOTE_HOST_GROUP, false, AICustomizationSources.plugin, CancellationToken.None);
      const agentItems = items.filter((i) => i.type === PromptsType.agent);
      assert.deepStrictEqual(agentItems.map((i) => i.name), ["Flat"]);
    });
  });
  suite("expandPluginContents \u2013 rules", () => {
    test("emits one item per .md file with name/description from frontmatter", async () => {
      const pluginRoot = URI.file("/plugins/rules-plugin");
      await mockFiles(fileService, [
        {
          path: "/plugins/rules-plugin/rules/style.instructions.md",
          contents: [
            "---",
            "name: Style Guide",
            "description: Enforces style",
            "---"
          ]
        },
        {
          path: "/plugins/rules-plugin/rules/noname.instructions.md",
          contents: [
            "---",
            "---"
          ]
        }
      ]);
      const expander = new AgentCustomizationContentExpander(fileService, new NullLogService());
      const items = await expand(expander, pluginRoot, REMOTE_HOST_GROUP, false, AICustomizationSources.plugin, CancellationToken.None);
      const ruleItems = items.filter((i) => i.type === PromptsType.instructions);
      assert.deepStrictEqual(
        ruleItems.map((i) => ({ name: i.name, description: i.description })).sort((a, b) => a.name.localeCompare(b.name)),
        [
          { name: "Style Guide", description: "Enforces style" },
          { name: "noname", description: void 0 }
        ].sort((a, b) => a.name.localeCompare(b.name))
      );
    });
    test("userInvocable is NOT surfaced for rules", async () => {
      const pluginRoot = URI.file("/plugins/rules-no-invocable");
      await mockFiles(fileService, [
        {
          path: "/plugins/rules-no-invocable/rules/rule.instructions.md",
          contents: [
            "---",
            "name: My Rule",
            "user-invocable: true",
            "---"
          ]
        }
      ]);
      const expander = new AgentCustomizationContentExpander(fileService, new NullLogService());
      const items = await expand(expander, pluginRoot, REMOTE_HOST_GROUP, false, AICustomizationSources.plugin, CancellationToken.None);
      const ruleItems = items.filter((i) => i.type === PromptsType.instructions);
      assert.strictEqual(ruleItems.length, 1);
      assert.strictEqual(ruleItems[0].userInvocable, void 0, "rules must not expose userInvocable");
    });
    test("emits one item per .mdc file per the Open Plugins spec", async () => {
      const pluginRoot = URI.file("/plugins/rules-mdc");
      await mockFiles(fileService, [
        { path: "/plugins/rules-mdc/rules/style.mdc", contents: ["Some rule content"] },
        { path: "/plugins/rules-mdc/rules/other.mdc", contents: ["Another rule"] },
        // `.txt` and similar must still be ignored
        { path: "/plugins/rules-mdc/rules/readme.txt", contents: ["not a rule"] }
      ]);
      const expander = new AgentCustomizationContentExpander(fileService, new NullLogService());
      const items = await expand(expander, pluginRoot, REMOTE_HOST_GROUP, false, AICustomizationSources.plugin, CancellationToken.None);
      const ruleItems = items.filter((i) => i.type === PromptsType.instructions);
      assert.deepStrictEqual(
        ruleItems.map((i) => i.name).sort(),
        ["other", "style"]
      );
    });
  });
  suite("expandPluginContents \u2013 commands", () => {
    test("emits one item per .md file, name from filename (no frontmatter parsing)", async () => {
      const pluginRoot = URI.file("/plugins/cmds-plugin");
      await mockFiles(fileService, [
        {
          path: "/plugins/cmds-plugin/commands/fix.prompt.md",
          contents: [
            "---",
            "name: Fix It",
            "---",
            "Fix the code"
          ]
        },
        {
          path: "/plugins/cmds-plugin/commands/review.prompt.md",
          contents: [
            "# Review"
          ]
        }
      ]);
      const expander = new AgentCustomizationContentExpander(fileService, new NullLogService());
      const items = await expand(expander, pluginRoot, REMOTE_HOST_GROUP, false, AICustomizationSources.plugin, CancellationToken.None);
      const cmdItems = items.filter((i) => i.type === PromptsType.prompt);
      assert.deepStrictEqual(
        cmdItems.map((i) => i.name).sort(),
        ["fix", "review"]
      );
      for (const cmd of cmdItems) {
        assert.strictEqual(cmd.description, void 0);
        assert.strictEqual(cmd.userInvocable, void 0);
      }
    });
  });
  suite("expandPluginContents \u2013 mixed plugin", () => {
    test("all four folder types are discovered and returned together", async () => {
      const pluginRoot = URI.file("/plugins/mixed");
      await mockFiles(fileService, [
        {
          path: "/plugins/mixed/agents/bot.agent.md",
          contents: [
            "---",
            "name: Bot",
            "---"
          ]
        },
        {
          path: "/plugins/mixed/skills/linter/SKILL.md",
          contents: [
            "---",
            "name: Linter",
            "---"
          ]
        },
        {
          path: "/plugins/mixed/commands/fix.prompt.md",
          contents: [
            "# Fix"
          ]
        },
        {
          path: "/plugins/mixed/rules/style.instructions.md",
          contents: [
            "---",
            "name: Style",
            "---"
          ]
        }
      ]);
      const expander = new AgentCustomizationContentExpander(fileService, new NullLogService());
      const items = await expand(expander, pluginRoot, REMOTE_HOST_GROUP, false, AICustomizationSources.plugin, CancellationToken.None);
      const byType = (t) => items.filter((i) => i.type === t).map((i) => i.name);
      assert.deepStrictEqual(byType(PromptsType.agent), ["Bot"]);
      assert.deepStrictEqual(byType(PromptsType.skill), ["Linter"]);
      assert.deepStrictEqual(byType(PromptsType.prompt), ["fix"]);
      assert.deepStrictEqual(byType(PromptsType.instructions), ["Style"]);
    });
  });
  suite("expandPluginContents \u2013 groupKey and pluginUri", () => {
    test("all child items carry the groupKey passed to expand", async () => {
      const pluginRoot = URI.file("/plugins/gk");
      await mockFiles(fileService, [
        {
          path: "/plugins/gk/agents/a.agent.md",
          contents: [
            "---",
            "---"
          ]
        },
        {
          path: "/plugins/gk/skills/s/SKILL.md",
          contents: [
            "---",
            "---"
          ]
        }
      ]);
      const expander = new AgentCustomizationContentExpander(fileService, new NullLogService());
      const items = await expand(expander, pluginRoot, REMOTE_CLIENT_GROUP, false, AICustomizationSources.plugin, CancellationToken.None);
      for (const item of items) {
        assert.strictEqual(item.groupKey, REMOTE_CLIENT_GROUP, `item ${item.name} should carry remote-client groupKey`);
      }
    });
    test("isBundleItem=true clears pluginUri and pluginLabel on child items", async () => {
      const pluginRoot = URI.file("/plugins/bundle");
      await mockFiles(fileService, [
        {
          path: "/plugins/bundle/skills/bs/SKILL.md",
          contents: [
            "---",
            "name: Bundle Skill",
            "---"
          ]
        }
      ]);
      const expander = new AgentCustomizationContentExpander(fileService, new NullLogService());
      const bundleItems = await expand(expander, pluginRoot, REMOTE_CLIENT_GROUP, true, AICustomizationSources.plugin, CancellationToken.None, "bundle-plugin");
      for (const item of bundleItems) {
        assert.deepStrictEqual({ pluginUri: item.pluginUri, pluginLabel: item.pluginLabel }, { pluginUri: void 0, pluginLabel: void 0 }, `bundle item ${item.name} must have no plugin provenance`);
      }
    });
    test("isBundleItem=false sets pluginUri and pluginLabel on child items", async () => {
      const pluginRoot = URI.file("/plugins/with-uri");
      await mockFiles(fileService, [
        {
          path: "/plugins/with-uri/skills/sk/SKILL.md",
          contents: [
            "---",
            "name: Sk",
            "---"
          ]
        }
      ]);
      const expander = new AgentCustomizationContentExpander(fileService, new NullLogService());
      const items = await expand(expander, pluginRoot, REMOTE_HOST_GROUP, false, AICustomizationSources.plugin, CancellationToken.None, "Datadog");
      assert.strictEqual(items.length, 1);
      assert.deepStrictEqual({ pluginUri: items[0].pluginUri?.toString(), pluginLabel: items[0].pluginLabel }, { pluginUri: pluginRoot.toString(), pluginLabel: "Datadog" });
    });
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXGNoYXRcXHRlc3RcXGJyb3dzZXJcXGFnZW50SG9zdFxcYWdlbnRDdXN0b21pemF0aW9uQ29udGVudEV4cGFuZGVyLnRlc3QudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgYXNzZXJ0IGZyb20gJ2Fzc2VydCc7XG5pbXBvcnQgeyBTY2hlbWFzIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbmV0d29yay5qcyc7XG5pbXBvcnQgeyBVUkkgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi91cmkuanMnO1xuaW1wb3J0IHsgZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS90ZXN0L2NvbW1vbi91dGlscy5qcyc7XG5pbXBvcnQgeyBJRmlsZVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9maWxlcy9jb21tb24vZmlsZXMuanMnO1xuaW1wb3J0IHsgRmlsZVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9maWxlcy9jb21tb24vZmlsZVNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSW5NZW1vcnlGaWxlU3lzdGVtUHJvdmlkZXIgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9maWxlcy9jb21tb24vaW5NZW1vcnlGaWxlc3lzdGVtUHJvdmlkZXIuanMnO1xuaW1wb3J0IHsgTnVsbExvZ1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9sb2cvY29tbW9uL2xvZy5qcyc7XG5pbXBvcnQgeyBBZ2VudEN1c3RvbWl6YXRpb25Db250ZW50RXhwYW5kZXIgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi93b3JrYmVuY2gvY29udHJpYi9jaGF0L2Jyb3dzZXIvYWdlbnRTZXNzaW9ucy9hZ2VudEhvc3QvYWdlbnRDdXN0b21pemF0aW9uQ29udGVudEV4cGFuZGVyLmpzJztcbmltcG9ydCB7IFByb21wdHNUeXBlIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL3Byb21wdFN5bnRheC9wcm9tcHRUeXBlcy5qcyc7XG5pbXBvcnQgeyBtb2NrRmlsZXMgfSBmcm9tICcuLi8uLi8uLi90ZXN0L2NvbW1vbi9wcm9tcHRTeW50YXgvdGVzdFV0aWxzL21vY2tGaWxlc3lzdGVtLmpzJztcbmltcG9ydCB7IEFJQ3VzdG9taXphdGlvblNvdXJjZSwgQUlDdXN0b21pemF0aW9uU291cmNlcyB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9haUN1c3RvbWl6YXRpb25Xb3Jrc3BhY2VTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElDdXN0b21pemF0aW9uSXRlbSB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9jdXN0b21pemF0aW9uSGFybmVzc1NlcnZpY2UuanMnO1xuaW1wb3J0IHsgQ2FuY2VsbGF0aW9uVG9rZW4gfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9jYW5jZWxsYXRpb24uanMnO1xuXG5jb25zdCBSRU1PVEVfSE9TVF9HUk9VUCA9ICdyZW1vdGUtaG9zdCc7XG5jb25zdCBSRU1PVEVfQ0xJRU5UX0dST1VQID0gJ3JlbW90ZS1jbGllbnQnO1xuXG4vLyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbi8vIEhlbHBlcnNcbi8vIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuXG5mdW5jdGlvbiBleHBhbmQoZXhwYW5kZXI6IEFnZW50Q3VzdG9taXphdGlvbkNvbnRlbnRFeHBhbmRlciwgcGx1Z2luVXJpOiBVUkksIGdyb3VwS2V5OiBzdHJpbmcsIGlzQnVuZGxlSXRlbTogYm9vbGVhbiwgc291cmNlOiBBSUN1c3RvbWl6YXRpb25Tb3VyY2UsIHRva2VuOiBDYW5jZWxsYXRpb25Ub2tlbiwgcGx1Z2luTGFiZWw/OiBzdHJpbmcpOiBQcm9taXNlPHJlYWRvbmx5IElDdXN0b21pemF0aW9uSXRlbVtdPiB7XG5cdHJldHVybiBleHBhbmRlci5leHBhbmRQbHVnaW5Db250ZW50cyhwbHVnaW5VcmksIGdyb3VwS2V5LCBpc0J1bmRsZUl0ZW0sIHNvdXJjZSwgcGx1Z2luTGFiZWwsIHRva2VuKTtcbn1cblxuLy8gLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4vLyBTdWl0ZVxuLy8gLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG5cbnN1aXRlKCdBZ2VudEN1c3RvbWl6YXRpb25Db250ZW50RXhwYW5kZXInLCAoKSA9PiB7XG5cdGNvbnN0IGRpc3Bvc2FibGVzID0gZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlKCk7XG5cblx0bGV0IGZpbGVTZXJ2aWNlOiBJRmlsZVNlcnZpY2U7XG5cblx0c2V0dXAoKCkgPT4ge1xuXHRcdGNvbnN0IGZzID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBGaWxlU2VydmljZShuZXcgTnVsbExvZ1NlcnZpY2UoKSkpO1xuXHRcdGNvbnN0IHByb3ZpZGVyID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBJbk1lbW9yeUZpbGVTeXN0ZW1Qcm92aWRlcigpKTtcblx0XHRkaXNwb3NhYmxlcy5hZGQoZnMucmVnaXN0ZXJQcm92aWRlcihTY2hlbWFzLmZpbGUsIHByb3ZpZGVyKSk7XG5cdFx0ZmlsZVNlcnZpY2UgPSBmcztcblx0fSk7XG5cblx0Ly8gLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cblx0Ly8gZXhwYW5kUGx1Z2luQ29udGVudHMgXHUyMDE0IHNraWxscyBmb2xkZXJcblx0Ly8gLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cblxuXHRzdWl0ZSgnZXhwYW5kUGx1Z2luQ29udGVudHMgXHUyMDEzIHNraWxscycsICgpID0+IHtcblx0XHR0ZXN0KCdlbWl0cyBvbmUgaXRlbSBwZXIgc3ViZm9sZGVyIHRoYXQgaGFzIGEgU0tJTEwubWQsIHNraXBzIGZvbGRlcnMgd2l0aG91dCBvbmUnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCBwbHVnaW5Sb290ID0gVVJJLmZpbGUoJy9wbHVnaW5zL215LXBsdWdpbicpO1xuXHRcdFx0YXdhaXQgbW9ja0ZpbGVzKGZpbGVTZXJ2aWNlLCBbXG5cdFx0XHRcdC8vIHZhbGlkIHNraWxsIGZvbGRlciB3aXRoIGZyb250bWF0dGVyIG5hbWUgKyBkZXNjcmlwdGlvblxuXHRcdFx0XHR7XG5cdFx0XHRcdFx0cGF0aDogJy9wbHVnaW5zL215LXBsdWdpbi9za2lsbHMvbXktbGludC9TS0lMTC5tZCcsIGNvbnRlbnRzOiBbXG5cdFx0XHRcdFx0XHQnLS0tJyxcblx0XHRcdFx0XHRcdCduYW1lOiBMaW50Jyxcblx0XHRcdFx0XHRcdCdkZXNjcmlwdGlvbjogUnVucyBsaW50aW5nJyxcblx0XHRcdFx0XHRcdCctLS0nLFxuXHRcdFx0XHRcdFx0JycsXG5cdFx0XHRcdFx0XHQnIyBCb2R5Jyxcblx0XHRcdFx0XHRdXG5cdFx0XHRcdH0sXG5cdFx0XHRcdC8vIHNraWxsIGZvbGRlciBtaXNzaW5nIFNLSUxMLm1kIFx1MjE5MiBzaG91bGQgYmUgc2tpcHBlZFxuXHRcdFx0XHR7XG5cdFx0XHRcdFx0cGF0aDogJy9wbHVnaW5zL215LXBsdWdpbi9za2lsbHMvYnJva2VuL1JFQURNRS5tZCcsIGNvbnRlbnRzOiBbXG5cdFx0XHRcdFx0XHQnbm8gZnJvbnRtYXR0ZXInLFxuXHRcdFx0XHRcdF1cblx0XHRcdFx0fSxcblx0XHRcdFx0Ly8gZG90ZmlsZSBmb2xkZXIgXHUyMTkyIHNob3VsZCBiZSBza2lwcGVkXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRwYXRoOiAnL3BsdWdpbnMvbXktcGx1Z2luL3NraWxscy8uaGlkZGVuL1NLSUxMLm1kJywgY29udGVudHM6IFtcblx0XHRcdFx0XHRcdCctLS0nLFxuXHRcdFx0XHRcdFx0Jy0tLScsXG5cdFx0XHRcdFx0XVxuXHRcdFx0XHR9LFxuXHRcdFx0XSk7XG5cblx0XHRcdGNvbnN0IGV4cGFuZGVyID0gbmV3IEFnZW50Q3VzdG9taXphdGlvbkNvbnRlbnRFeHBhbmRlcihmaWxlU2VydmljZSwgbmV3IE51bGxMb2dTZXJ2aWNlKCkpO1xuXHRcdFx0Y29uc3QgaXRlbXMgPSBhd2FpdCBleHBhbmQoZXhwYW5kZXIsIHBsdWdpblJvb3QsIFJFTU9URV9IT1NUX0dST1VQLCBmYWxzZSwgQUlDdXN0b21pemF0aW9uU291cmNlcy5wbHVnaW4sIENhbmNlbGxhdGlvblRva2VuLk5vbmUpO1xuXG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGl0ZW1zLm1hcChpID0+ICh7IHR5cGU6IGkudHlwZSwgbmFtZTogaS5uYW1lLCBkZXNjcmlwdGlvbjogaS5kZXNjcmlwdGlvbiB9KSksIFtcblx0XHRcdFx0eyB0eXBlOiBQcm9tcHRzVHlwZS5za2lsbCwgbmFtZTogJ0xpbnQnLCBkZXNjcmlwdGlvbjogJ1J1bnMgbGludGluZycgfSxcblx0XHRcdF0pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgndXNlcyBmb2xkZXIgbmFtZSBhcyBmYWxsYmFjayB3aGVuIFNLSUxMLm1kIGhhcyBubyBuYW1lIGZyb250bWF0dGVyJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgcGx1Z2luUm9vdCA9IFVSSS5maWxlKCcvcGx1Z2lucy9wJyk7XG5cdFx0XHRhd2FpdCBtb2NrRmlsZXMoZmlsZVNlcnZpY2UsIFtcblx0XHRcdFx0Ly8gU0tJTEwubWQgZXhpc3RzIGJ1dCBoYXMgbm8gbmFtZS9kZXNjcmlwdGlvblxuXHRcdFx0XHR7XG5cdFx0XHRcdFx0cGF0aDogJy9wbHVnaW5zL3Avc2tpbGxzL3VubmFtZWQtc2tpbGwvU0tJTEwubWQnLCBjb250ZW50czogW1xuXHRcdFx0XHRcdFx0Jy0tLScsXG5cdFx0XHRcdFx0XHQnLS0tJyxcblx0XHRcdFx0XHRcdCcnLFxuXHRcdFx0XHRcdFx0JyMgQ29udGVudCcsXG5cdFx0XHRcdFx0XVxuXHRcdFx0XHR9LFxuXHRcdFx0XSk7XG5cblx0XHRcdGNvbnN0IGV4cGFuZGVyID0gbmV3IEFnZW50Q3VzdG9taXphdGlvbkNvbnRlbnRFeHBhbmRlcihmaWxlU2VydmljZSwgbmV3IE51bGxMb2dTZXJ2aWNlKCkpO1xuXHRcdFx0Y29uc3QgaXRlbXMgPSBhd2FpdCBleHBhbmQoZXhwYW5kZXIsIHBsdWdpblJvb3QsIFJFTU9URV9IT1NUX0dST1VQLCBmYWxzZSwgQUlDdXN0b21pemF0aW9uU291cmNlcy5wbHVnaW4sIENhbmNlbGxhdGlvblRva2VuLk5vbmUpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGl0ZW1zLmxlbmd0aCwgMSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoaXRlbXNbMF0ubmFtZSwgJ3VubmFtZWQtc2tpbGwnKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChpdGVtc1swXS5kZXNjcmlwdGlvbiwgdW5kZWZpbmVkKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3Jld3JpdGVzIHNraWxsIGZvbGRlciBVUkkgdG8gcG9pbnQgYXQgU0tJTEwubWQnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCBwbHVnaW5Sb290ID0gVVJJLmZpbGUoJy9wbHVnaW5zL3EnKTtcblx0XHRcdGF3YWl0IG1vY2tGaWxlcyhmaWxlU2VydmljZSwgW1xuXHRcdFx0XHR7XG5cdFx0XHRcdFx0cGF0aDogJy9wbHVnaW5zL3Evc2tpbGxzL215LXNraWxsL1NLSUxMLm1kJywgY29udGVudHM6IFtcblx0XHRcdFx0XHRcdCctLS0nLFxuXHRcdFx0XHRcdFx0J25hbWU6IE15IFNraWxsJyxcblx0XHRcdFx0XHRcdCctLS0nLFxuXHRcdFx0XHRcdF1cblx0XHRcdFx0fSxcblx0XHRcdF0pO1xuXG5cdFx0XHRjb25zdCBleHBhbmRlciA9IG5ldyBBZ2VudEN1c3RvbWl6YXRpb25Db250ZW50RXhwYW5kZXIoZmlsZVNlcnZpY2UsIG5ldyBOdWxsTG9nU2VydmljZSgpKTtcblx0XHRcdGNvbnN0IGl0ZW1zID0gYXdhaXQgZXhwYW5kKGV4cGFuZGVyLCBwbHVnaW5Sb290LCBSRU1PVEVfSE9TVF9HUk9VUCwgZmFsc2UsIEFJQ3VzdG9taXphdGlvblNvdXJjZXMucGx1Z2luLCBDYW5jZWxsYXRpb25Ub2tlbi5Ob25lKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChpdGVtcy5sZW5ndGgsIDEpO1xuXHRcdFx0YXNzZXJ0Lm9rKGl0ZW1zWzBdLnVyaS5wYXRoLmVuZHNXaXRoKCcvU0tJTEwubWQnKSwgYGV4cGVjdGVkIFNLSUxMLm1kIFVSSSwgZ290ICR7aXRlbXNbMF0udXJpfWApO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgndXNlckludm9jYWJsZSBpcyBzdXJmYWNlZCBmcm9tIFNLSUxMLm1kIGZyb250bWF0dGVyJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgcGx1Z2luUm9vdCA9IFVSSS5maWxlKCcvcGx1Z2lucy9yJyk7XG5cdFx0XHRhd2FpdCBtb2NrRmlsZXMoZmlsZVNlcnZpY2UsIFtcblx0XHRcdFx0e1xuXHRcdFx0XHRcdHBhdGg6ICcvcGx1Z2lucy9yL3NraWxscy9pbnZvY2FibGUvU0tJTEwubWQnLCBjb250ZW50czogW1xuXHRcdFx0XHRcdFx0Jy0tLScsXG5cdFx0XHRcdFx0XHQnbmFtZTogSW52b2NhYmxlJyxcblx0XHRcdFx0XHRcdCd1c2VyLWludm9jYWJsZTogdHJ1ZScsXG5cdFx0XHRcdFx0XHQnLS0tJyxcblx0XHRcdFx0XHRdXG5cdFx0XHRcdH0sXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRwYXRoOiAnL3BsdWdpbnMvci9za2lsbHMvc2lsZW50L1NLSUxMLm1kJywgY29udGVudHM6IFtcblx0XHRcdFx0XHRcdCctLS0nLFxuXHRcdFx0XHRcdFx0J25hbWU6IFNpbGVudCcsXG5cdFx0XHRcdFx0XHQnLS0tJyxcblx0XHRcdFx0XHRdXG5cdFx0XHRcdH0sXG5cdFx0XHRdKTtcblxuXHRcdFx0Y29uc3QgZXhwYW5kZXIgPSBuZXcgQWdlbnRDdXN0b21pemF0aW9uQ29udGVudEV4cGFuZGVyKGZpbGVTZXJ2aWNlLCBuZXcgTnVsbExvZ1NlcnZpY2UoKSk7XG5cdFx0XHRjb25zdCBpdGVtcyA9IGF3YWl0IGV4cGFuZChleHBhbmRlciwgcGx1Z2luUm9vdCwgUkVNT1RFX0hPU1RfR1JPVVAsIGZhbHNlLCBBSUN1c3RvbWl6YXRpb25Tb3VyY2VzLnBsdWdpbiwgQ2FuY2VsbGF0aW9uVG9rZW4uTm9uZSk7XG5cdFx0XHRjb25zdCBpbnZvY2FibGUgPSBpdGVtcy5maW5kKGkgPT4gaS5uYW1lID09PSAnSW52b2NhYmxlJyk7XG5cdFx0XHRjb25zdCBzaWxlbnQgPSBpdGVtcy5maW5kKGkgPT4gaS5uYW1lID09PSAnU2lsZW50Jyk7XG5cdFx0XHRhc3NlcnQub2soaW52b2NhYmxlLCAnc2hvdWxkIGhhdmUgaW52b2NhYmxlIGl0ZW0nKTtcblx0XHRcdGFzc2VydC5vayhzaWxlbnQsICdzaG91bGQgaGF2ZSBzaWxlbnQgaXRlbScpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGludm9jYWJsZS51c2VySW52b2NhYmxlLCB0cnVlKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChzaWxlbnQudXNlckludm9jYWJsZSwgdW5kZWZpbmVkKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2ZsYXQgbm9uLWRpcmVjdG9yeSBlbnRyaWVzIGluIHNraWxscy8gYXJlIGlnbm9yZWQnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCBwbHVnaW5Sb290ID0gVVJJLmZpbGUoJy9wbHVnaW5zL3MnKTtcblx0XHRcdGF3YWl0IG1vY2tGaWxlcyhmaWxlU2VydmljZSwgW1xuXHRcdFx0XHQvLyBmbGF0IGZpbGUgYWxvbmdzaWRlIGEgcHJvcGVyIHNraWxsIGZvbGRlciBcdTIwMTQgZmxhdCBmaWxlcyBhcmUgbm8gbG9uZ2VyIHN1cHBvcnRlZFxuXHRcdFx0XHR7XG5cdFx0XHRcdFx0cGF0aDogJy9wbHVnaW5zL3Mvc2tpbGxzL2ZsYXQuc2tpbGwubWQnLCBjb250ZW50czogW1xuXHRcdFx0XHRcdFx0Jy0tLScsXG5cdFx0XHRcdFx0XHQnbmFtZTogRmxhdCcsXG5cdFx0XHRcdFx0XHQnLS0tJyxcblx0XHRcdFx0XHRdXG5cdFx0XHRcdH0sXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRwYXRoOiAnL3BsdWdpbnMvcy9za2lsbHMvZm9sZGVyLXNraWxsL1NLSUxMLm1kJywgY29udGVudHM6IFtcblx0XHRcdFx0XHRcdCctLS0nLFxuXHRcdFx0XHRcdFx0J25hbWU6IEZvbGRlciBTa2lsbCcsXG5cdFx0XHRcdFx0XHQnLS0tJyxcblx0XHRcdFx0XHRdXG5cdFx0XHRcdH0sXG5cdFx0XHRdKTtcblxuXHRcdFx0Y29uc3QgZXhwYW5kZXIgPSBuZXcgQWdlbnRDdXN0b21pemF0aW9uQ29udGVudEV4cGFuZGVyKGZpbGVTZXJ2aWNlLCBuZXcgTnVsbExvZ1NlcnZpY2UoKSk7XG5cdFx0XHRjb25zdCBpdGVtcyA9IGF3YWl0IGV4cGFuZChleHBhbmRlciwgcGx1Z2luUm9vdCwgUkVNT1RFX0hPU1RfR1JPVVAsIGZhbHNlLCBBSUN1c3RvbWl6YXRpb25Tb3VyY2VzLnBsdWdpbiwgQ2FuY2VsbGF0aW9uVG9rZW4uTm9uZSk7XG5cdFx0XHQvLyBPbmx5IHRoZSBmb2xkZXItYmFzZWQgc2tpbGwgc2hvdWxkIGFwcGVhcjsgdGhlIGZsYXQgZmlsZSBpcyBub3QgYSBkaXJlY3RvcnksIHNvIGl0IGlzIHNraXBwZWRcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoaXRlbXMubWFwKGkgPT4gaS5uYW1lKSwgWydGb2xkZXIgU2tpbGwnXSk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdC8vIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG5cdC8vIGV4cGFuZFBsdWdpbkNvbnRlbnRzIFx1MjAxNCBhZ2VudHMgZm9sZGVyXG5cdC8vIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG5cblx0c3VpdGUoJ2V4cGFuZFBsdWdpbkNvbnRlbnRzIFx1MjAxMyBhZ2VudHMnLCAoKSA9PiB7XG5cdFx0dGVzdCgnZW1pdHMgb25lIGl0ZW0gcGVyIC5tZCBmaWxlIHdpdGggbmFtZS9kZXNjcmlwdGlvbi91c2VySW52b2NhYmxlIGZyb20gZnJvbnRtYXR0ZXInLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCBwbHVnaW5Sb290ID0gVVJJLmZpbGUoJy9wbHVnaW5zL2FnZW50cy1wbHVnaW4nKTtcblx0XHRcdGF3YWl0IG1vY2tGaWxlcyhmaWxlU2VydmljZSwgW1xuXHRcdFx0XHR7XG5cdFx0XHRcdFx0cGF0aDogJy9wbHVnaW5zL2FnZW50cy1wbHVnaW4vYWdlbnRzL215LWFnZW50LmFnZW50Lm1kJywgY29udGVudHM6IFtcblx0XHRcdFx0XHRcdCctLS0nLFxuXHRcdFx0XHRcdFx0J25hbWU6IE15IEFnZW50Jyxcblx0XHRcdFx0XHRcdCdkZXNjcmlwdGlvbjogRG9lcyB0aGluZ3MnLFxuXHRcdFx0XHRcdFx0J3VzZXItaW52b2NhYmxlOiB0cnVlJyxcblx0XHRcdFx0XHRcdCctLS0nLFxuXHRcdFx0XHRcdF1cblx0XHRcdFx0fSxcblx0XHRcdFx0e1xuXHRcdFx0XHRcdHBhdGg6ICcvcGx1Z2lucy9hZ2VudHMtcGx1Z2luL2FnZW50cy9vdGhlci5hZ2VudC5tZCcsIGNvbnRlbnRzOiBbXG5cdFx0XHRcdFx0XHQnLS0tJyxcblx0XHRcdFx0XHRcdCctLS0nLFxuXHRcdFx0XHRcdF1cblx0XHRcdFx0fSxcblx0XHRcdF0pO1xuXG5cdFx0XHRjb25zdCBleHBhbmRlciA9IG5ldyBBZ2VudEN1c3RvbWl6YXRpb25Db250ZW50RXhwYW5kZXIoZmlsZVNlcnZpY2UsIG5ldyBOdWxsTG9nU2VydmljZSgpKTtcblx0XHRcdGNvbnN0IGl0ZW1zID0gYXdhaXQgZXhwYW5kKGV4cGFuZGVyLCBwbHVnaW5Sb290LCBSRU1PVEVfSE9TVF9HUk9VUCwgZmFsc2UsIEFJQ3VzdG9taXphdGlvblNvdXJjZXMucGx1Z2luLCBDYW5jZWxsYXRpb25Ub2tlbi5Ob25lKTtcblx0XHRcdGNvbnN0IGFnZW50SXRlbXMgPSBpdGVtcy5maWx0ZXIoaSA9PiBpLnR5cGUgPT09IFByb21wdHNUeXBlLmFnZW50KTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoXG5cdFx0XHRcdGFnZW50SXRlbXMubWFwKGkgPT4gKHsgbmFtZTogaS5uYW1lLCBkZXNjcmlwdGlvbjogaS5kZXNjcmlwdGlvbiwgdXNlckludm9jYWJsZTogaS51c2VySW52b2NhYmxlIH0pKS5zb3J0KChhLCBiKSA9PiBhLm5hbWUubG9jYWxlQ29tcGFyZShiLm5hbWUpKSxcblx0XHRcdFx0W1xuXHRcdFx0XHRcdHsgbmFtZTogJ015IEFnZW50JywgZGVzY3JpcHRpb246ICdEb2VzIHRoaW5ncycsIHVzZXJJbnZvY2FibGU6IHRydWUgfSxcblx0XHRcdFx0XHR7IG5hbWU6ICdvdGhlcicsIGRlc2NyaXB0aW9uOiB1bmRlZmluZWQsIHVzZXJJbnZvY2FibGU6IHVuZGVmaW5lZCB9LFxuXHRcdFx0XHRdLFxuXHRcdFx0KTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ25vbi0ubWQgZmlsZXMgaW4gYWdlbnRzLyBhcmUgaWdub3JlZCcsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IHBsdWdpblJvb3QgPSBVUkkuZmlsZSgnL3BsdWdpbnMvYWdlbnRzLWZpbHRlcicpO1xuXHRcdFx0YXdhaXQgbW9ja0ZpbGVzKGZpbGVTZXJ2aWNlLCBbXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRwYXRoOiAnL3BsdWdpbnMvYWdlbnRzLWZpbHRlci9hZ2VudHMvdmFsaWQuYWdlbnQubWQnLCBjb250ZW50czogW1xuXHRcdFx0XHRcdFx0Jy0tLScsXG5cdFx0XHRcdFx0XHQnbmFtZTogVmFsaWQnLFxuXHRcdFx0XHRcdFx0Jy0tLScsXG5cdFx0XHRcdFx0XVxuXHRcdFx0XHR9LFxuXHRcdFx0XHR7XG5cdFx0XHRcdFx0cGF0aDogJy9wbHVnaW5zL2FnZW50cy1maWx0ZXIvYWdlbnRzL2lnbm9yZWQuanNvbicsIGNvbnRlbnRzOiBbXG5cdFx0XHRcdFx0XHQne30nLFxuXHRcdFx0XHRcdF1cblx0XHRcdFx0fSxcblx0XHRcdFx0e1xuXHRcdFx0XHRcdHBhdGg6ICcvcGx1Z2lucy9hZ2VudHMtZmlsdGVyL2FnZW50cy9pZ25vcmVkLnR4dCcsIGNvbnRlbnRzOiBbXG5cdFx0XHRcdFx0XHQndGV4dCcsXG5cdFx0XHRcdFx0XVxuXHRcdFx0XHR9LFxuXHRcdFx0XSk7XG5cblx0XHRcdGNvbnN0IGV4cGFuZGVyID0gbmV3IEFnZW50Q3VzdG9taXphdGlvbkNvbnRlbnRFeHBhbmRlcihmaWxlU2VydmljZSwgbmV3IE51bGxMb2dTZXJ2aWNlKCkpO1xuXHRcdFx0Y29uc3QgaXRlbXMgPSBhd2FpdCBleHBhbmQoZXhwYW5kZXIsIHBsdWdpblJvb3QsIFJFTU9URV9IT1NUX0dST1VQLCBmYWxzZSwgQUlDdXN0b21pemF0aW9uU291cmNlcy5wbHVnaW4sIENhbmNlbGxhdGlvblRva2VuLk5vbmUpO1xuXHRcdFx0Y29uc3QgYWdlbnRJdGVtcyA9IGl0ZW1zLmZpbHRlcihpID0+IGkudHlwZSA9PT0gUHJvbXB0c1R5cGUuYWdlbnQpO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChhZ2VudEl0ZW1zLm1hcChpID0+IGkubmFtZSksIFsnVmFsaWQnXSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdkaXJlY3RvcmllcyBpbiBhZ2VudHMvIGFyZSBpZ25vcmVkJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgcGx1Z2luUm9vdCA9IFVSSS5maWxlKCcvcGx1Z2lucy9hZ2VudHMtbm8tZGlycycpO1xuXHRcdFx0YXdhaXQgbW9ja0ZpbGVzKGZpbGVTZXJ2aWNlLCBbXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRwYXRoOiAnL3BsdWdpbnMvYWdlbnRzLW5vLWRpcnMvYWdlbnRzL25lc3RlZC9zb21lLmFnZW50Lm1kJywgY29udGVudHM6IFtcblx0XHRcdFx0XHRcdCctLS0nLFxuXHRcdFx0XHRcdFx0J25hbWU6IE5lc3RlZCcsXG5cdFx0XHRcdFx0XHQnLS0tJyxcblx0XHRcdFx0XHRdXG5cdFx0XHRcdH0sXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRwYXRoOiAnL3BsdWdpbnMvYWdlbnRzLW5vLWRpcnMvYWdlbnRzL2ZsYXQuYWdlbnQubWQnLCBjb250ZW50czogW1xuXHRcdFx0XHRcdFx0Jy0tLScsXG5cdFx0XHRcdFx0XHQnbmFtZTogRmxhdCcsXG5cdFx0XHRcdFx0XHQnLS0tJyxcblx0XHRcdFx0XHRdXG5cdFx0XHRcdH0sXG5cdFx0XHRdKTtcblxuXHRcdFx0Y29uc3QgZXhwYW5kZXIgPSBuZXcgQWdlbnRDdXN0b21pemF0aW9uQ29udGVudEV4cGFuZGVyKGZpbGVTZXJ2aWNlLCBuZXcgTnVsbExvZ1NlcnZpY2UoKSk7XG5cdFx0XHRjb25zdCBpdGVtcyA9IGF3YWl0IGV4cGFuZChleHBhbmRlciwgcGx1Z2luUm9vdCwgUkVNT1RFX0hPU1RfR1JPVVAsIGZhbHNlLCBBSUN1c3RvbWl6YXRpb25Tb3VyY2VzLnBsdWdpbiwgQ2FuY2VsbGF0aW9uVG9rZW4uTm9uZSk7XG5cdFx0XHRjb25zdCBhZ2VudEl0ZW1zID0gaXRlbXMuZmlsdGVyKGkgPT4gaS50eXBlID09PSBQcm9tcHRzVHlwZS5hZ2VudCk7XG5cdFx0XHQvLyBPbmx5IGZsYXQuYWdlbnQubWQ7IHRoZSBuZXN0ZWQvIGRpcmVjdG9yeSBpcyBza2lwcGVkXG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGFnZW50SXRlbXMubWFwKGkgPT4gaS5uYW1lKSwgWydGbGF0J10pO1xuXHRcdH0pO1xuXHR9KTtcblxuXHQvLyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuXHQvLyBleHBhbmRQbHVnaW5Db250ZW50cyBcdTIwMTQgcnVsZXMgZm9sZGVyXG5cdC8vIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG5cblx0c3VpdGUoJ2V4cGFuZFBsdWdpbkNvbnRlbnRzIFx1MjAxMyBydWxlcycsICgpID0+IHtcblx0XHR0ZXN0KCdlbWl0cyBvbmUgaXRlbSBwZXIgLm1kIGZpbGUgd2l0aCBuYW1lL2Rlc2NyaXB0aW9uIGZyb20gZnJvbnRtYXR0ZXInLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCBwbHVnaW5Sb290ID0gVVJJLmZpbGUoJy9wbHVnaW5zL3J1bGVzLXBsdWdpbicpO1xuXHRcdFx0YXdhaXQgbW9ja0ZpbGVzKGZpbGVTZXJ2aWNlLCBbXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRwYXRoOiAnL3BsdWdpbnMvcnVsZXMtcGx1Z2luL3J1bGVzL3N0eWxlLmluc3RydWN0aW9ucy5tZCcsIGNvbnRlbnRzOiBbXG5cdFx0XHRcdFx0XHQnLS0tJyxcblx0XHRcdFx0XHRcdCduYW1lOiBTdHlsZSBHdWlkZScsXG5cdFx0XHRcdFx0XHQnZGVzY3JpcHRpb246IEVuZm9yY2VzIHN0eWxlJyxcblx0XHRcdFx0XHRcdCctLS0nLFxuXHRcdFx0XHRcdF1cblx0XHRcdFx0fSxcblx0XHRcdFx0e1xuXHRcdFx0XHRcdHBhdGg6ICcvcGx1Z2lucy9ydWxlcy1wbHVnaW4vcnVsZXMvbm9uYW1lLmluc3RydWN0aW9ucy5tZCcsIGNvbnRlbnRzOiBbXG5cdFx0XHRcdFx0XHQnLS0tJyxcblx0XHRcdFx0XHRcdCctLS0nLFxuXHRcdFx0XHRcdF1cblx0XHRcdFx0fSxcblx0XHRcdF0pO1xuXG5cdFx0XHRjb25zdCBleHBhbmRlciA9IG5ldyBBZ2VudEN1c3RvbWl6YXRpb25Db250ZW50RXhwYW5kZXIoZmlsZVNlcnZpY2UsIG5ldyBOdWxsTG9nU2VydmljZSgpKTtcblx0XHRcdGNvbnN0IGl0ZW1zID0gYXdhaXQgZXhwYW5kKGV4cGFuZGVyLCBwbHVnaW5Sb290LCBSRU1PVEVfSE9TVF9HUk9VUCwgZmFsc2UsIEFJQ3VzdG9taXphdGlvblNvdXJjZXMucGx1Z2luLCBDYW5jZWxsYXRpb25Ub2tlbi5Ob25lKTtcblx0XHRcdGNvbnN0IHJ1bGVJdGVtcyA9IGl0ZW1zLmZpbHRlcihpID0+IGkudHlwZSA9PT0gUHJvbXB0c1R5cGUuaW5zdHJ1Y3Rpb25zKTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoXG5cdFx0XHRcdHJ1bGVJdGVtcy5tYXAoaSA9PiAoeyBuYW1lOiBpLm5hbWUsIGRlc2NyaXB0aW9uOiBpLmRlc2NyaXB0aW9uIH0pKS5zb3J0KChhLCBiKSA9PiBhLm5hbWUubG9jYWxlQ29tcGFyZShiLm5hbWUpKSxcblx0XHRcdFx0W1xuXHRcdFx0XHRcdHsgbmFtZTogJ1N0eWxlIEd1aWRlJywgZGVzY3JpcHRpb246ICdFbmZvcmNlcyBzdHlsZScgfSxcblx0XHRcdFx0XHR7IG5hbWU6ICdub25hbWUnLCBkZXNjcmlwdGlvbjogdW5kZWZpbmVkIH0sXG5cdFx0XHRcdF0uc29ydCgoYSwgYikgPT4gYS5uYW1lLmxvY2FsZUNvbXBhcmUoYi5uYW1lKSksXG5cdFx0XHQpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgndXNlckludm9jYWJsZSBpcyBOT1Qgc3VyZmFjZWQgZm9yIHJ1bGVzJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgcGx1Z2luUm9vdCA9IFVSSS5maWxlKCcvcGx1Z2lucy9ydWxlcy1uby1pbnZvY2FibGUnKTtcblx0XHRcdGF3YWl0IG1vY2tGaWxlcyhmaWxlU2VydmljZSwgW1xuXHRcdFx0XHR7XG5cdFx0XHRcdFx0cGF0aDogJy9wbHVnaW5zL3J1bGVzLW5vLWludm9jYWJsZS9ydWxlcy9ydWxlLmluc3RydWN0aW9ucy5tZCcsIGNvbnRlbnRzOiBbXG5cdFx0XHRcdFx0XHQnLS0tJyxcblx0XHRcdFx0XHRcdCduYW1lOiBNeSBSdWxlJyxcblx0XHRcdFx0XHRcdCd1c2VyLWludm9jYWJsZTogdHJ1ZScsXG5cdFx0XHRcdFx0XHQnLS0tJyxcblx0XHRcdFx0XHRdXG5cdFx0XHRcdH0sXG5cdFx0XHRdKTtcblxuXHRcdFx0Y29uc3QgZXhwYW5kZXIgPSBuZXcgQWdlbnRDdXN0b21pemF0aW9uQ29udGVudEV4cGFuZGVyKGZpbGVTZXJ2aWNlLCBuZXcgTnVsbExvZ1NlcnZpY2UoKSk7XG5cdFx0XHRjb25zdCBpdGVtcyA9IGF3YWl0IGV4cGFuZChleHBhbmRlciwgcGx1Z2luUm9vdCwgUkVNT1RFX0hPU1RfR1JPVVAsIGZhbHNlLCBBSUN1c3RvbWl6YXRpb25Tb3VyY2VzLnBsdWdpbiwgQ2FuY2VsbGF0aW9uVG9rZW4uTm9uZSk7XG5cdFx0XHRjb25zdCBydWxlSXRlbXMgPSBpdGVtcy5maWx0ZXIoaSA9PiBpLnR5cGUgPT09IFByb21wdHNUeXBlLmluc3RydWN0aW9ucyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocnVsZUl0ZW1zLmxlbmd0aCwgMSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocnVsZUl0ZW1zWzBdLnVzZXJJbnZvY2FibGUsIHVuZGVmaW5lZCwgJ3J1bGVzIG11c3Qgbm90IGV4cG9zZSB1c2VySW52b2NhYmxlJyk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdlbWl0cyBvbmUgaXRlbSBwZXIgLm1kYyBmaWxlIHBlciB0aGUgT3BlbiBQbHVnaW5zIHNwZWMnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCBwbHVnaW5Sb290ID0gVVJJLmZpbGUoJy9wbHVnaW5zL3J1bGVzLW1kYycpO1xuXHRcdFx0YXdhaXQgbW9ja0ZpbGVzKGZpbGVTZXJ2aWNlLCBbXG5cdFx0XHRcdHsgcGF0aDogJy9wbHVnaW5zL3J1bGVzLW1kYy9ydWxlcy9zdHlsZS5tZGMnLCBjb250ZW50czogWydTb21lIHJ1bGUgY29udGVudCddIH0sXG5cdFx0XHRcdHsgcGF0aDogJy9wbHVnaW5zL3J1bGVzLW1kYy9ydWxlcy9vdGhlci5tZGMnLCBjb250ZW50czogWydBbm90aGVyIHJ1bGUnXSB9LFxuXHRcdFx0XHQvLyBgLnR4dGAgYW5kIHNpbWlsYXIgbXVzdCBzdGlsbCBiZSBpZ25vcmVkXG5cdFx0XHRcdHsgcGF0aDogJy9wbHVnaW5zL3J1bGVzLW1kYy9ydWxlcy9yZWFkbWUudHh0JywgY29udGVudHM6IFsnbm90IGEgcnVsZSddIH0sXG5cdFx0XHRdKTtcblxuXHRcdFx0Y29uc3QgZXhwYW5kZXIgPSBuZXcgQWdlbnRDdXN0b21pemF0aW9uQ29udGVudEV4cGFuZGVyKGZpbGVTZXJ2aWNlLCBuZXcgTnVsbExvZ1NlcnZpY2UoKSk7XG5cdFx0XHRjb25zdCBpdGVtcyA9IGF3YWl0IGV4cGFuZChleHBhbmRlciwgcGx1Z2luUm9vdCwgUkVNT1RFX0hPU1RfR1JPVVAsIGZhbHNlLCBBSUN1c3RvbWl6YXRpb25Tb3VyY2VzLnBsdWdpbiwgQ2FuY2VsbGF0aW9uVG9rZW4uTm9uZSk7XG5cdFx0XHRjb25zdCBydWxlSXRlbXMgPSBpdGVtcy5maWx0ZXIoaSA9PiBpLnR5cGUgPT09IFByb21wdHNUeXBlLmluc3RydWN0aW9ucyk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKFxuXHRcdFx0XHRydWxlSXRlbXMubWFwKGkgPT4gaS5uYW1lKS5zb3J0KCksXG5cdFx0XHRcdFsnb3RoZXInLCAnc3R5bGUnXSxcblx0XHRcdCk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdC8vIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG5cdC8vIGV4cGFuZFBsdWdpbkNvbnRlbnRzIFx1MjAxNCBjb21tYW5kcyBmb2xkZXJcblx0Ly8gLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cblxuXHRzdWl0ZSgnZXhwYW5kUGx1Z2luQ29udGVudHMgXHUyMDEzIGNvbW1hbmRzJywgKCkgPT4ge1xuXHRcdHRlc3QoJ2VtaXRzIG9uZSBpdGVtIHBlciAubWQgZmlsZSwgbmFtZSBmcm9tIGZpbGVuYW1lIChubyBmcm9udG1hdHRlciBwYXJzaW5nKScsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IHBsdWdpblJvb3QgPSBVUkkuZmlsZSgnL3BsdWdpbnMvY21kcy1wbHVnaW4nKTtcblx0XHRcdGF3YWl0IG1vY2tGaWxlcyhmaWxlU2VydmljZSwgW1xuXHRcdFx0XHR7XG5cdFx0XHRcdFx0cGF0aDogJy9wbHVnaW5zL2NtZHMtcGx1Z2luL2NvbW1hbmRzL2ZpeC5wcm9tcHQubWQnLCBjb250ZW50czogW1xuXHRcdFx0XHRcdFx0Jy0tLScsXG5cdFx0XHRcdFx0XHQnbmFtZTogRml4IEl0Jyxcblx0XHRcdFx0XHRcdCctLS0nLFxuXHRcdFx0XHRcdFx0J0ZpeCB0aGUgY29kZScsXG5cdFx0XHRcdFx0XVxuXHRcdFx0XHR9LFxuXHRcdFx0XHR7XG5cdFx0XHRcdFx0cGF0aDogJy9wbHVnaW5zL2NtZHMtcGx1Z2luL2NvbW1hbmRzL3Jldmlldy5wcm9tcHQubWQnLCBjb250ZW50czogW1xuXHRcdFx0XHRcdFx0JyMgUmV2aWV3Jyxcblx0XHRcdFx0XHRdXG5cdFx0XHRcdH0sXG5cdFx0XHRdKTtcblxuXHRcdFx0Y29uc3QgZXhwYW5kZXIgPSBuZXcgQWdlbnRDdXN0b21pemF0aW9uQ29udGVudEV4cGFuZGVyKGZpbGVTZXJ2aWNlLCBuZXcgTnVsbExvZ1NlcnZpY2UoKSk7XG5cdFx0XHRjb25zdCBpdGVtcyA9IGF3YWl0IGV4cGFuZChleHBhbmRlciwgcGx1Z2luUm9vdCwgUkVNT1RFX0hPU1RfR1JPVVAsIGZhbHNlLCBBSUN1c3RvbWl6YXRpb25Tb3VyY2VzLnBsdWdpbiwgQ2FuY2VsbGF0aW9uVG9rZW4uTm9uZSk7XG5cdFx0XHRjb25zdCBjbWRJdGVtcyA9IGl0ZW1zLmZpbHRlcihpID0+IGkudHlwZSA9PT0gUHJvbXB0c1R5cGUucHJvbXB0KTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoXG5cdFx0XHRcdGNtZEl0ZW1zLm1hcChpID0+IGkubmFtZSkuc29ydCgpLFxuXHRcdFx0XHRbJ2ZpeCcsICdyZXZpZXcnXSxcblx0XHRcdCk7XG5cdFx0XHQvLyBDb21tYW5kcyBkbyBub3QgZXhwb3NlIGRlc2NyaXB0aW9uIG9yIHVzZXJJbnZvY2FibGVcblx0XHRcdGZvciAoY29uc3QgY21kIG9mIGNtZEl0ZW1zKSB7XG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChjbWQuZGVzY3JpcHRpb24sIHVuZGVmaW5lZCk7XG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChjbWQudXNlckludm9jYWJsZSwgdW5kZWZpbmVkKTtcblx0XHRcdH1cblx0XHR9KTtcblx0fSk7XG5cblx0Ly8gLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cblx0Ly8gZXhwYW5kUGx1Z2luQ29udGVudHMgXHUyMDE0IG1peGVkIHBsdWdpblxuXHQvLyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuXG5cdHN1aXRlKCdleHBhbmRQbHVnaW5Db250ZW50cyBcdTIwMTMgbWl4ZWQgcGx1Z2luJywgKCkgPT4ge1xuXHRcdHRlc3QoJ2FsbCBmb3VyIGZvbGRlciB0eXBlcyBhcmUgZGlzY292ZXJlZCBhbmQgcmV0dXJuZWQgdG9nZXRoZXInLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCBwbHVnaW5Sb290ID0gVVJJLmZpbGUoJy9wbHVnaW5zL21peGVkJyk7XG5cdFx0XHRhd2FpdCBtb2NrRmlsZXMoZmlsZVNlcnZpY2UsIFtcblx0XHRcdFx0e1xuXHRcdFx0XHRcdHBhdGg6ICcvcGx1Z2lucy9taXhlZC9hZ2VudHMvYm90LmFnZW50Lm1kJywgY29udGVudHM6IFtcblx0XHRcdFx0XHRcdCctLS0nLFxuXHRcdFx0XHRcdFx0J25hbWU6IEJvdCcsXG5cdFx0XHRcdFx0XHQnLS0tJyxcblx0XHRcdFx0XHRdXG5cdFx0XHRcdH0sXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRwYXRoOiAnL3BsdWdpbnMvbWl4ZWQvc2tpbGxzL2xpbnRlci9TS0lMTC5tZCcsIGNvbnRlbnRzOiBbXG5cdFx0XHRcdFx0XHQnLS0tJyxcblx0XHRcdFx0XHRcdCduYW1lOiBMaW50ZXInLFxuXHRcdFx0XHRcdFx0Jy0tLScsXG5cdFx0XHRcdFx0XVxuXHRcdFx0XHR9LFxuXHRcdFx0XHR7XG5cdFx0XHRcdFx0cGF0aDogJy9wbHVnaW5zL21peGVkL2NvbW1hbmRzL2ZpeC5wcm9tcHQubWQnLCBjb250ZW50czogW1xuXHRcdFx0XHRcdFx0JyMgRml4Jyxcblx0XHRcdFx0XHRdXG5cdFx0XHRcdH0sXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRwYXRoOiAnL3BsdWdpbnMvbWl4ZWQvcnVsZXMvc3R5bGUuaW5zdHJ1Y3Rpb25zLm1kJywgY29udGVudHM6IFtcblx0XHRcdFx0XHRcdCctLS0nLFxuXHRcdFx0XHRcdFx0J25hbWU6IFN0eWxlJyxcblx0XHRcdFx0XHRcdCctLS0nLFxuXHRcdFx0XHRcdF1cblx0XHRcdFx0fSxcblx0XHRcdF0pO1xuXG5cdFx0XHRjb25zdCBleHBhbmRlciA9IG5ldyBBZ2VudEN1c3RvbWl6YXRpb25Db250ZW50RXhwYW5kZXIoZmlsZVNlcnZpY2UsIG5ldyBOdWxsTG9nU2VydmljZSgpKTtcblx0XHRcdGNvbnN0IGl0ZW1zID0gYXdhaXQgZXhwYW5kKGV4cGFuZGVyLCBwbHVnaW5Sb290LCBSRU1PVEVfSE9TVF9HUk9VUCwgZmFsc2UsIEFJQ3VzdG9taXphdGlvblNvdXJjZXMucGx1Z2luLCBDYW5jZWxsYXRpb25Ub2tlbi5Ob25lKTtcblx0XHRcdGNvbnN0IGJ5VHlwZSA9ICh0OiBQcm9tcHRzVHlwZSkgPT4gaXRlbXMuZmlsdGVyKGkgPT4gaS50eXBlID09PSB0KS5tYXAoaSA9PiBpLm5hbWUpO1xuXG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGJ5VHlwZShQcm9tcHRzVHlwZS5hZ2VudCksIFsnQm90J10pO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChieVR5cGUoUHJvbXB0c1R5cGUuc2tpbGwpLCBbJ0xpbnRlciddKTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoYnlUeXBlKFByb21wdHNUeXBlLnByb21wdCksIFsnZml4J10pO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChieVR5cGUoUHJvbXB0c1R5cGUuaW5zdHJ1Y3Rpb25zKSwgWydTdHlsZSddKTtcblx0XHR9KTtcblx0fSk7XG5cblx0Ly8gLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cblx0Ly8gZXhwYW5kUGx1Z2luQ29udGVudHMgXHUyMDE0IGdyb3VwS2V5IGFuZCBwbHVnaW5VcmkgcHJvcGFnYXRpb25cblx0Ly8gLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cblxuXHRzdWl0ZSgnZXhwYW5kUGx1Z2luQ29udGVudHMgXHUyMDEzIGdyb3VwS2V5IGFuZCBwbHVnaW5VcmknLCAoKSA9PiB7XG5cdFx0dGVzdCgnYWxsIGNoaWxkIGl0ZW1zIGNhcnJ5IHRoZSBncm91cEtleSBwYXNzZWQgdG8gZXhwYW5kJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgcGx1Z2luUm9vdCA9IFVSSS5maWxlKCcvcGx1Z2lucy9naycpO1xuXHRcdFx0YXdhaXQgbW9ja0ZpbGVzKGZpbGVTZXJ2aWNlLCBbXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRwYXRoOiAnL3BsdWdpbnMvZ2svYWdlbnRzL2EuYWdlbnQubWQnLCBjb250ZW50czogW1xuXHRcdFx0XHRcdFx0Jy0tLScsXG5cdFx0XHRcdFx0XHQnLS0tJyxcblx0XHRcdFx0XHRdXG5cdFx0XHRcdH0sXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRwYXRoOiAnL3BsdWdpbnMvZ2svc2tpbGxzL3MvU0tJTEwubWQnLCBjb250ZW50czogW1xuXHRcdFx0XHRcdFx0Jy0tLScsXG5cdFx0XHRcdFx0XHQnLS0tJyxcblx0XHRcdFx0XHRdXG5cdFx0XHRcdH0sXG5cdFx0XHRdKTtcblxuXHRcdFx0Y29uc3QgZXhwYW5kZXIgPSBuZXcgQWdlbnRDdXN0b21pemF0aW9uQ29udGVudEV4cGFuZGVyKGZpbGVTZXJ2aWNlLCBuZXcgTnVsbExvZ1NlcnZpY2UoKSk7XG5cdFx0XHRjb25zdCBpdGVtcyA9IGF3YWl0IGV4cGFuZChleHBhbmRlciwgcGx1Z2luUm9vdCwgUkVNT1RFX0NMSUVOVF9HUk9VUCwgZmFsc2UsIEFJQ3VzdG9taXphdGlvblNvdXJjZXMucGx1Z2luLCBDYW5jZWxsYXRpb25Ub2tlbi5Ob25lKTtcblx0XHRcdGZvciAoY29uc3QgaXRlbSBvZiBpdGVtcykge1xuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoaXRlbS5ncm91cEtleSwgUkVNT1RFX0NMSUVOVF9HUk9VUCwgYGl0ZW0gJHtpdGVtLm5hbWV9IHNob3VsZCBjYXJyeSByZW1vdGUtY2xpZW50IGdyb3VwS2V5YCk7XG5cdFx0XHR9XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdpc0J1bmRsZUl0ZW09dHJ1ZSBjbGVhcnMgcGx1Z2luVXJpIGFuZCBwbHVnaW5MYWJlbCBvbiBjaGlsZCBpdGVtcycsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IHBsdWdpblJvb3QgPSBVUkkuZmlsZSgnL3BsdWdpbnMvYnVuZGxlJyk7XG5cdFx0XHRhd2FpdCBtb2NrRmlsZXMoZmlsZVNlcnZpY2UsIFtcblx0XHRcdFx0e1xuXHRcdFx0XHRcdHBhdGg6ICcvcGx1Z2lucy9idW5kbGUvc2tpbGxzL2JzL1NLSUxMLm1kJywgY29udGVudHM6IFtcblx0XHRcdFx0XHRcdCctLS0nLFxuXHRcdFx0XHRcdFx0J25hbWU6IEJ1bmRsZSBTa2lsbCcsXG5cdFx0XHRcdFx0XHQnLS0tJyxcblx0XHRcdFx0XHRdXG5cdFx0XHRcdH0sXG5cdFx0XHRdKTtcblxuXHRcdFx0Y29uc3QgZXhwYW5kZXIgPSBuZXcgQWdlbnRDdXN0b21pemF0aW9uQ29udGVudEV4cGFuZGVyKGZpbGVTZXJ2aWNlLCBuZXcgTnVsbExvZ1NlcnZpY2UoKSk7XG5cdFx0XHRjb25zdCBidW5kbGVJdGVtcyA9IGF3YWl0IGV4cGFuZChleHBhbmRlciwgcGx1Z2luUm9vdCwgUkVNT1RFX0NMSUVOVF9HUk9VUCwgdHJ1ZSAvKiBpc0J1bmRsZUl0ZW0gKi8sIEFJQ3VzdG9taXphdGlvblNvdXJjZXMucGx1Z2luLCBDYW5jZWxsYXRpb25Ub2tlbi5Ob25lLCAnYnVuZGxlLXBsdWdpbicpO1xuXG5cdFx0XHRmb3IgKGNvbnN0IGl0ZW0gb2YgYnVuZGxlSXRlbXMpIHtcblx0XHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7IHBsdWdpblVyaTogaXRlbS5wbHVnaW5VcmksIHBsdWdpbkxhYmVsOiBpdGVtLnBsdWdpbkxhYmVsIH0sIHsgcGx1Z2luVXJpOiB1bmRlZmluZWQsIHBsdWdpbkxhYmVsOiB1bmRlZmluZWQgfSwgYGJ1bmRsZSBpdGVtICR7aXRlbS5uYW1lfSBtdXN0IGhhdmUgbm8gcGx1Z2luIHByb3ZlbmFuY2VgKTtcblx0XHRcdH1cblx0XHR9KTtcblxuXHRcdHRlc3QoJ2lzQnVuZGxlSXRlbT1mYWxzZSBzZXRzIHBsdWdpblVyaSBhbmQgcGx1Z2luTGFiZWwgb24gY2hpbGQgaXRlbXMnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCBwbHVnaW5Sb290ID0gVVJJLmZpbGUoJy9wbHVnaW5zL3dpdGgtdXJpJyk7XG5cdFx0XHRhd2FpdCBtb2NrRmlsZXMoZmlsZVNlcnZpY2UsIFtcblx0XHRcdFx0e1xuXHRcdFx0XHRcdHBhdGg6ICcvcGx1Z2lucy93aXRoLXVyaS9za2lsbHMvc2svU0tJTEwubWQnLCBjb250ZW50czogW1xuXHRcdFx0XHRcdFx0Jy0tLScsXG5cdFx0XHRcdFx0XHQnbmFtZTogU2snLFxuXHRcdFx0XHRcdFx0Jy0tLScsXG5cdFx0XHRcdFx0XVxuXHRcdFx0XHR9LFxuXHRcdFx0XSk7XG5cblx0XHRcdGNvbnN0IGV4cGFuZGVyID0gbmV3IEFnZW50Q3VzdG9taXphdGlvbkNvbnRlbnRFeHBhbmRlcihmaWxlU2VydmljZSwgbmV3IE51bGxMb2dTZXJ2aWNlKCkpO1xuXHRcdFx0Y29uc3QgaXRlbXMgPSBhd2FpdCBleHBhbmQoZXhwYW5kZXIsIHBsdWdpblJvb3QsIFJFTU9URV9IT1NUX0dST1VQLCBmYWxzZSwgQUlDdXN0b21pemF0aW9uU291cmNlcy5wbHVnaW4sIENhbmNlbGxhdGlvblRva2VuLk5vbmUsICdEYXRhZG9nJyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoaXRlbXMubGVuZ3RoLCAxKTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoeyBwbHVnaW5Vcmk6IGl0ZW1zWzBdLnBsdWdpblVyaT8udG9TdHJpbmcoKSwgcGx1Z2luTGFiZWw6IGl0ZW1zWzBdLnBsdWdpbkxhYmVsIH0sIHsgcGx1Z2luVXJpOiBwbHVnaW5Sb290LnRvU3RyaW5nKCksIHBsdWdpbkxhYmVsOiAnRGF0YWRvZycgfSk7XG5cdFx0fSk7XG5cdH0pO1xufSk7XG4iXSwKICAibWFwcGluZ3MiOiAiQUFLQSxPQUFPLFlBQVk7QUFDbkIsU0FBUyxlQUFlO0FBQ3hCLFNBQVMsV0FBVztBQUNwQixTQUFTLCtDQUErQztBQUV4RCxTQUFTLG1CQUFtQjtBQUM1QixTQUFTLGtDQUFrQztBQUMzQyxTQUFTLHNCQUFzQjtBQUMvQixTQUFTLHlDQUF5QztBQUNsRCxTQUFTLG1CQUFtQjtBQUM1QixTQUFTLGlCQUFpQjtBQUMxQixTQUFnQyw4QkFBOEI7QUFFOUQsU0FBUyx5QkFBeUI7QUFFbEMsTUFBTSxvQkFBb0I7QUFDMUIsTUFBTSxzQkFBc0I7QUFNNUIsU0FBUyxPQUFPLFVBQTZDLFdBQWdCLFVBQWtCLGNBQXVCLFFBQStCLE9BQTBCLGFBQThEO0FBQzVPLFNBQU8sU0FBUyxxQkFBcUIsV0FBVyxVQUFVLGNBQWMsUUFBUSxhQUFhLEtBQUs7QUFDbkc7QUFNQSxNQUFNLHFDQUFxQyxNQUFNO0FBQ2hELFFBQU0sY0FBYyx3Q0FBd0M7QUFFNUQsTUFBSTtBQUVKLFFBQU0sTUFBTTtBQUNYLFVBQU0sS0FBSyxZQUFZLElBQUksSUFBSSxZQUFZLElBQUksZUFBZSxDQUFDLENBQUM7QUFDaEUsVUFBTSxXQUFXLFlBQVksSUFBSSxJQUFJLDJCQUEyQixDQUFDO0FBQ2pFLGdCQUFZLElBQUksR0FBRyxpQkFBaUIsUUFBUSxNQUFNLFFBQVEsQ0FBQztBQUMzRCxrQkFBYztBQUFBLEVBQ2YsQ0FBQztBQU1ELFFBQU0sc0NBQWlDLE1BQU07QUFDNUMsU0FBSywrRUFBK0UsWUFBWTtBQUMvRixZQUFNLGFBQWEsSUFBSSxLQUFLLG9CQUFvQjtBQUNoRCxZQUFNLFVBQVUsYUFBYTtBQUFBO0FBQUEsUUFFNUI7QUFBQSxVQUNDLE1BQU07QUFBQSxVQUE4QyxVQUFVO0FBQUEsWUFDN0Q7QUFBQSxZQUNBO0FBQUEsWUFDQTtBQUFBLFlBQ0E7QUFB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
