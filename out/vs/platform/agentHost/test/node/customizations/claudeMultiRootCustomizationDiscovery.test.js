import assert from "assert";
import { DisposableStore } from "../../../../../base/common/lifecycle.js";
import { Schemas } from "../../../../../base/common/network.js";
import { URI } from "../../../../../base/common/uri.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../../base/test/common/utils.js";
import { NullLogService } from "../../../../log/common/log.js";
import { discoverClaudeMultiRootCustomizations } from "../../../node/claude/customizations/claudeMultiRootCustomizationDiscovery.js";
import { scanClaudeDiskCustomizations } from "../../../node/claude/customizations/scan/claudeAgentSkillScan.js";
import { scanClaudeNativePlugins } from "../../../node/claude/customizations/scan/claudeNativePluginScan.js";
import { createInMemoryFileService, seedFile } from "./claudeCustomizationTestUtils.js";
suite("claudeMultiRootCustomizationDiscovery", () => {
  const disposables = new DisposableStore();
  const rootA = URI.from({ scheme: Schemas.inMemory, path: "/a" });
  const rootB = URI.from({ scheme: Schemas.inMemory, path: "/b" });
  const userHome = URI.from({ scheme: Schemas.inMemory, path: "/home" });
  let fileService;
  const seed = (path, content = "") => seedFile(fileService, path, content);
  setup(() => {
    fileService = createInMemoryFileService(disposables);
  });
  teardown(() => disposables.clear());
  ensureNoDisposablesAreLeakedInTestSuite();
  test("uses the existing single-root discovery path without changing output order", async () => {
    await Promise.all([
      seed("/a/.claude/agents/project.md", "---\nname: project\ndescription: project agent\n---"),
      seed("/home/.claude/agents/user.md", "---\nname: user\ndescription: user agent\n---"),
      seed("/a/.claude/skills/project-skill/SKILL.md", "---\nname: project-skill\ndescription: project skill\n---"),
      seed("/home/.claude/skills/user-skill/SKILL.md", "---\nname: user-skill\ndescription: user skill\n---"),
      seed("/home/.claude/settings.json", JSON.stringify({ enabledPlugins: { "user-plugin@m": true } })),
      seed("/a/.claude/settings.json", JSON.stringify({ enabledPlugins: { "project-plugin@m": true } })),
      seed("/home/.claude/plugins/cache/m/user-plugin/1.0.0/.claude-plugin/plugin.json", JSON.stringify({ name: "user-plugin" })),
      seed("/home/.claude/plugins/cache/m/project-plugin/1.0.0/.claude-plugin/plugin.json", JSON.stringify({ name: "project-plugin" }))
    ]);
    const logService = new NullLogService();
    const [expectedDiscovered, expectedPlugins, actual] = await Promise.all([
      scanClaudeDiskCustomizations(rootA, userHome, fileService),
      scanClaudeNativePlugins(rootA, userHome, fileService, logService),
      discoverClaudeMultiRootCustomizations([rootA], userHome, fileService, logService)
    ]);
    assert.deepStrictEqual({
      discovered: actual.discovered,
      plugins: actual.nativePlugins
    }, {
      discovered: expectedDiscovered,
      plugins: expectedPlugins
    });
  });
  test("combines roots in order and applies first-name-wins precedence", async () => {
    await Promise.all([
      seed("/a/.claude/agents/shared.md", "---\nname: shared\ndescription: from a\n---"),
      seed("/b/.claude/agents/shared.md", "---\nname: shared\ndescription: from b\n---"),
      seed("/b/.claude/agents/b-only.md", "---\nname: b-only\ndescription: from b\n---"),
      seed("/b/.claude/skills/shared-skill/SKILL.md", "---\nname: shared-skill\ndescription: from b\n---"),
      seed("/home/.claude/skills/shared-skill/SKILL.md", "---\nname: shared-skill\ndescription: from user\n---"),
      seed("/home/.claude/skills/user-only/SKILL.md", "---\nname: user-only\ndescription: from user\n---"),
      seed("/b/.claude/commands/not-loaded.md", "---\nname: not-loaded\ndescription: added-directory command\n---")
    ]);
    const result = await discoverClaudeMultiRootCustomizations([rootA, rootB], userHome, fileService, new NullLogService());
    assert.deepStrictEqual({
      roots: result.workingDirectories.map((root) => root.path),
      items: result.discovered.map((item) => ({ name: item.name, description: item.description, path: item.uri.path }))
    }, {
      roots: ["/a", "/b"],
      items: [
        { name: "shared", description: "from a", path: "/a/.claude/agents/shared.md" },
        { name: "b-only", description: "from b", path: "/b/.claude/agents/b-only.md" },
        { name: "shared-skill", description: "from b", path: "/b/.claude/skills/shared-skill/SKILL.md" },
        { name: "user-only", description: "from user", path: "/home/.claude/skills/user-only/SKILL.md" }
      ]
    });
  });
  test("deduplicates equivalent roots without changing precedence", async () => {
    await seed("/a/.claude/agents/a.md", "---\nname: a\ndescription: A\n---");
    const result = await discoverClaudeMultiRootCustomizations([rootA, rootA], userHome, fileService, new NullLogService());
    assert.deepStrictEqual({
      roots: result.workingDirectories.map((root) => root.path),
      items: result.discovered.map((item) => item.name)
    }, {
      roots: ["/a"],
      items: ["a"]
    });
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxwbGF0Zm9ybVxcYWdlbnRIb3N0XFx0ZXN0XFxub2RlXFxjdXN0b21pemF0aW9uc1xcY2xhdWRlTXVsdGlSb290Q3VzdG9taXphdGlvbkRpc2NvdmVyeS50ZXN0LnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IGFzc2VydCBmcm9tICdhc3NlcnQnO1xuaW1wb3J0IHsgRGlzcG9zYWJsZVN0b3JlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IFNjaGVtYXMgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9uZXR3b3JrLmpzJztcbmltcG9ydCB7IFVSSSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3VyaS5qcyc7XG5pbXBvcnQgeyBlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL3Rlc3QvY29tbW9uL3V0aWxzLmpzJztcbmltcG9ydCB7IElGaWxlU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL2ZpbGVzL2NvbW1vbi9maWxlcy5qcyc7XG5pbXBvcnQgeyBOdWxsTG9nU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL2xvZy9jb21tb24vbG9nLmpzJztcbmltcG9ydCB7IGRpc2NvdmVyQ2xhdWRlTXVsdGlSb290Q3VzdG9taXphdGlvbnMgfSBmcm9tICcuLi8uLi8uLi9ub2RlL2NsYXVkZS9jdXN0b21pemF0aW9ucy9jbGF1ZGVNdWx0aVJvb3RDdXN0b21pemF0aW9uRGlzY292ZXJ5LmpzJztcbmltcG9ydCB7IHNjYW5DbGF1ZGVEaXNrQ3VzdG9taXphdGlvbnMgfSBmcm9tICcuLi8uLi8uLi9ub2RlL2NsYXVkZS9jdXN0b21pemF0aW9ucy9zY2FuL2NsYXVkZUFnZW50U2tpbGxTY2FuLmpzJztcbmltcG9ydCB7IHNjYW5DbGF1ZGVOYXRpdmVQbHVnaW5zIH0gZnJvbSAnLi4vLi4vLi4vbm9kZS9jbGF1ZGUvY3VzdG9taXphdGlvbnMvc2Nhbi9jbGF1ZGVOYXRpdmVQbHVnaW5TY2FuLmpzJztcbmltcG9ydCB7IGNyZWF0ZUluTWVtb3J5RmlsZVNlcnZpY2UsIHNlZWRGaWxlIH0gZnJvbSAnLi9jbGF1ZGVDdXN0b21pemF0aW9uVGVzdFV0aWxzLmpzJztcblxuc3VpdGUoJ2NsYXVkZU11bHRpUm9vdEN1c3RvbWl6YXRpb25EaXNjb3ZlcnknLCAoKSA9PiB7XG5cdGNvbnN0IGRpc3Bvc2FibGVzID0gbmV3IERpc3Bvc2FibGVTdG9yZSgpO1xuXHRjb25zdCByb290QSA9IFVSSS5mcm9tKHsgc2NoZW1lOiBTY2hlbWFzLmluTWVtb3J5LCBwYXRoOiAnL2EnIH0pO1xuXHRjb25zdCByb290QiA9IFVSSS5mcm9tKHsgc2NoZW1lOiBTY2hlbWFzLmluTWVtb3J5LCBwYXRoOiAnL2InIH0pO1xuXHRjb25zdCB1c2VySG9tZSA9IFVSSS5mcm9tKHsgc2NoZW1lOiBTY2hlbWFzLmluTWVtb3J5LCBwYXRoOiAnL2hvbWUnIH0pO1xuXHRsZXQgZmlsZVNlcnZpY2U6IElGaWxlU2VydmljZTtcblx0Y29uc3Qgc2VlZCA9IChwYXRoOiBzdHJpbmcsIGNvbnRlbnQgPSAnJykgPT4gc2VlZEZpbGUoZmlsZVNlcnZpY2UsIHBhdGgsIGNvbnRlbnQpO1xuXG5cdHNldHVwKCgpID0+IHtcblx0XHRmaWxlU2VydmljZSA9IGNyZWF0ZUluTWVtb3J5RmlsZVNlcnZpY2UoZGlzcG9zYWJsZXMpO1xuXHR9KTtcblxuXHR0ZWFyZG93bigoKSA9PiBkaXNwb3NhYmxlcy5jbGVhcigpKTtcblx0ZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlKCk7XG5cblx0dGVzdCgndXNlcyB0aGUgZXhpc3Rpbmcgc2luZ2xlLXJvb3QgZGlzY292ZXJ5IHBhdGggd2l0aG91dCBjaGFuZ2luZyBvdXRwdXQgb3JkZXInLCBhc3luYyAoKSA9PiB7XG5cdFx0YXdhaXQgUHJvbWlzZS5hbGwoW1xuXHRcdFx0c2VlZCgnL2EvLmNsYXVkZS9hZ2VudHMvcHJvamVjdC5tZCcsICctLS1cXG5uYW1lOiBwcm9qZWN0XFxuZGVzY3JpcHRpb246IHByb2plY3QgYWdlbnRcXG4tLS0nKSxcblx0XHRcdHNlZWQoJy9ob21lLy5jbGF1ZGUvYWdlbnRzL3VzZXIubWQnLCAnLS0tXFxubmFtZTogdXNlclxcbmRlc2NyaXB0aW9uOiB1c2VyIGFnZW50XFxuLS0tJyksXG5cdFx0XHRzZWVkKCcvYS8uY2xhdWRlL3NraWxscy9wcm9qZWN0LXNraWxsL1NLSUxMLm1kJywgJy0tLVxcbm5hbWU6IHByb2plY3Qtc2tpbGxcXG5kZXNjcmlwdGlvbjogcHJvamVjdCBza2lsbFxcbi0tLScpLFxuXHRcdFx0c2VlZCgnL2hvbWUvLmNsYXVkZS9za2lsbHMvdXNlci1za2lsbC9TS0lMTC5tZCcsICctLS1cXG5uYW1lOiB1c2VyLXNraWxsXFxuZGVzY3JpcHRpb246IHVzZXIgc2tpbGxcXG4tLS0nKSxcblx0XHRcdHNlZWQoJy9ob21lLy5jbGF1ZGUvc2V0dGluZ3MuanNvbicsIEpTT04uc3RyaW5naWZ5KHsgZW5hYmxlZFBsdWdpbnM6IHsgJ3VzZXItcGx1Z2luQG0nOiB0cnVlIH0gfSkpLFxuXHRcdFx0c2VlZCgnL2EvLmNsYXVkZS9zZXR0aW5ncy5qc29uJywgSlNPTi5zdHJpbmdpZnkoeyBlbmFibGVkUGx1Z2luczogeyAncHJvamVjdC1wbHVnaW5AbSc6IHRydWUgfSB9KSksXG5cdFx0XHRzZWVkKCcvaG9tZS8uY2xhdWRlL3BsdWdpbnMvY2FjaGUvbS91c2VyLXBsdWdpbi8xLjAuMC8uY2xhdWRlLXBsdWdpbi9wbHVnaW4uanNvbicsIEpTT04uc3RyaW5naWZ5KHsgbmFtZTogJ3VzZXItcGx1Z2luJyB9KSksXG5cdFx0XHRzZWVkKCcvaG9tZS8uY2xhdWRlL3BsdWdpbnMvY2FjaGUvbS9wcm9qZWN0LXBsdWdpbi8xLjAuMC8uY2xhdWRlLXBsdWdpbi9wbHVnaW4uanNvbicsIEpTT04uc3RyaW5naWZ5KHsgbmFtZTogJ3Byb2plY3QtcGx1Z2luJyB9KSksXG5cdFx0XSk7XG5cdFx0Y29uc3QgbG9nU2VydmljZSA9IG5ldyBOdWxsTG9nU2VydmljZSgpO1xuXHRcdGNvbnN0IFtleHBlY3RlZERpc2NvdmVyZWQsIGV4cGVjdGVkUGx1Z2lucywgYWN0dWFsXSA9IGF3YWl0IFByb21pc2UuYWxsKFtcblx0XHRcdHNjYW5DbGF1ZGVEaXNrQ3VzdG9taXphdGlvbnMocm9vdEEsIHVzZXJIb21lLCBmaWxlU2VydmljZSksXG5cdFx0XHRzY2FuQ2xhdWRlTmF0aXZlUGx1Z2lucyhyb290QSwgdXNlckhvbWUsIGZpbGVTZXJ2aWNlLCBsb2dTZXJ2aWNlKSxcblx0XHRcdGRpc2NvdmVyQ2xhdWRlTXVsdGlSb290Q3VzdG9taXphdGlvbnMoW3Jvb3RBXSwgdXNlckhvbWUsIGZpbGVTZXJ2aWNlLCBsb2dTZXJ2aWNlKSxcblx0XHRdKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0ZGlzY292ZXJlZDogYWN0dWFsLmRpc2NvdmVyZWQsXG5cdFx0XHRwbHVnaW5zOiBhY3R1YWwubmF0aXZlUGx1Z2lucyxcblx0XHR9LCB7XG5cdFx0XHRkaXNjb3ZlcmVkOiBleHBlY3RlZERpc2NvdmVyZWQsXG5cdFx0XHRwbHVnaW5zOiBleHBlY3RlZFBsdWdpbnMsXG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2NvbWJpbmVzIHJvb3RzIGluIG9yZGVyIGFuZCBhcHBsaWVzIGZpcnN0LW5hbWUtd2lucyBwcmVjZWRlbmNlJywgYXN5bmMgKCkgPT4ge1xuXHRcdGF3YWl0IFByb21pc2UuYWxsKFtcblx0XHRcdHNlZWQoJy9hLy5jbGF1ZGUvYWdlbnRzL3NoYXJlZC5tZCcsICctLS1cXG5uYW1lOiBzaGFyZWRcXG5kZXNjcmlwdGlvbjogZnJvbSBhXFxuLS0tJyksXG5cdFx0XHRzZWVkKCcvYi8uY2xhdWRlL2FnZW50cy9zaGFyZWQubWQnLCAnLS0tXFxubmFtZTogc2hhcmVkXFxuZGVzY3JpcHRpb246IGZyb20gYlxcbi0tLScpLFxuXHRcdFx0c2VlZCgnL2IvLmNsYXVkZS9hZ2VudHMvYi1vbmx5Lm1kJywgJy0tLVxcbm5hbWU6IGItb25seVxcbmRlc2NyaXB0aW9uOiBmcm9tIGJcXG4tLS0nKSxcblx0XHRcdHNlZWQoJy9iLy5jbGF1ZGUvc2tpbGxzL3NoYXJlZC1za2lsbC9TS0lMTC5tZCcsICctLS1cXG5uYW1lOiBzaGFyZWQtc2tpbGxcXG5kZXNjcmlwdGlvbjogZnJvbSBiXFxuLS0tJyksXG5cdFx0XHRzZWVkKCcvaG9tZS8uY2xhdWRlL3NraWxscy9zaGFyZWQtc2tpbGwvU0tJTEwubWQnLCAnLS0tXFxubmFtZTogc2hhcmVkLXNraWxsXFxuZGVzY3JpcHRpb246IGZyb20gdXNlclxcbi0tLScpLFxuXHRcdFx0c2VlZCgnL2hvbWUvLmNsYXVkZS9za2lsbHMvdXNlci1vbmx5L1NLSUxMLm1kJywgJy0tLVxcbm5hbWU6IHVzZXItb25seVxcbmRlc2NyaXB0aW9uOiBmcm9tIHVzZXJcXG4tLS0nKSxcblx0XHRcdHNlZWQoJy9iLy5jbGF1ZGUvY29tbWFuZHMvbm90LWxvYWRlZC5tZCcsICctLS1cXG5uYW1lOiBub3QtbG9hZGVkXFxuZGVzY3JpcHRpb246IGFkZGVkLWRpcmVjdG9yeSBjb21tYW5kXFxuLS0tJyksXG5cdFx0XSk7XG5cblx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCBkaXNjb3ZlckNsYXVkZU11bHRpUm9vdEN1c3RvbWl6YXRpb25zKFtyb290QSwgcm9vdEJdLCB1c2VySG9tZSwgZmlsZVNlcnZpY2UsIG5ldyBOdWxsTG9nU2VydmljZSgpKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0cm9vdHM6IHJlc3VsdC53b3JraW5nRGlyZWN0b3JpZXMubWFwKHJvb3QgPT4gcm9vdC5wYXRoKSxcblx0XHRcdGl0ZW1zOiByZXN1bHQuZGlzY292ZXJlZC5tYXAoaXRlbSA9PiAoeyBuYW1lOiBpdGVtLm5hbWUsIGRlc2NyaXB0aW9uOiBpdGVtLmRlc2NyaXB0aW9uLCBwYXRoOiBpdGVtLnVyaS5wYXRoIH0pKSxcblx0XHR9LCB7XG5cdFx0XHRyb290czogWycvYScsICcvYiddLFxuXHRcdFx0aXRlbXM6IFtcblx0XHRcdFx0eyBuYW1lOiAnc2hhcmVkJywgZGVzY3JpcHRpb246ICdmcm9tIGEnLCBwYXRoOiAnL2EvLmNsYXVkZS9hZ2VudHMvc2hhcmVkLm1kJyB9LFxuXHRcdFx0XHR7IG5hbWU6ICdiLW9ubHknLCBkZXNjcmlwdGlvbjogJ2Zyb20gYicsIHBhdGg6ICcvYi8uY2xhdWRlL2FnZW50cy9iLW9ubHkubWQnIH0sXG5cdFx0XHRcdHsgbmFtZTogJ3NoYXJlZC1za2lsbCcsIGRlc2NyaXB0aW9uOiAnZnJvbSBiJywgcGF0aDogJy9iLy5jbGF1ZGUvc2tpbGxzL3NoYXJlZC1za2lsbC9TS0lMTC5tZCcgfSxcblx0XHRcdFx0eyBuYW1lOiAndXNlci1vbmx5JywgZGVzY3JpcHRpb246ICdmcm9tIHVzZXInLCBwYXRoOiAnL2hvbWUvLmNsYXVkZS9za2lsbHMvdXNlci1vbmx5L1NLSUxMLm1kJyB9LFxuXHRcdFx0XSxcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnZGVkdXBsaWNhdGVzIGVxdWl2YWxlbnQgcm9vdHMgd2l0aG91dCBjaGFuZ2luZyBwcmVjZWRlbmNlJywgYXN5bmMgKCkgPT4ge1xuXHRcdGF3YWl0IHNlZWQoJy9hLy5jbGF1ZGUvYWdlbnRzL2EubWQnLCAnLS0tXFxubmFtZTogYVxcbmRlc2NyaXB0aW9uOiBBXFxuLS0tJyk7XG5cblx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCBkaXNjb3ZlckNsYXVkZU11bHRpUm9vdEN1c3RvbWl6YXRpb25zKFtyb290QSwgcm9vdEFdLCB1c2VySG9tZSwgZmlsZVNlcnZpY2UsIG5ldyBOdWxsTG9nU2VydmljZSgpKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0cm9vdHM6IHJlc3VsdC53b3JraW5nRGlyZWN0b3JpZXMubWFwKHJvb3QgPT4gcm9vdC5wYXRoKSxcblx0XHRcdGl0ZW1zOiByZXN1bHQuZGlzY292ZXJlZC5tYXAoaXRlbSA9PiBpdGVtLm5hbWUpLFxuXHRcdH0sIHtcblx0XHRcdHJvb3RzOiBbJy9hJ10sXG5cdFx0XHRpdGVtczogWydhJ10sXG5cdFx0fSk7XG5cdH0pO1xufSk7XG4iXSwKICAibWFwcGluZ3MiOiAiQUFLQSxPQUFPLFlBQVk7QUFDbkIsU0FBUyx1QkFBdUI7QUFDaEMsU0FBUyxlQUFlO0FBQ3hCLFNBQVMsV0FBVztBQUNwQixTQUFTLCtDQUErQztBQUV4RCxTQUFTLHNCQUFzQjtBQUMvQixTQUFTLDZDQUE2QztBQUN0RCxTQUFTLG9DQUFvQztBQUM3QyxTQUFTLCtCQUErQjtBQUN4QyxTQUFTLDJCQUEyQixnQkFBZ0I7QUFFcEQsTUFBTSx5Q0FBeUMsTUFBTTtBQUNwRCxRQUFNLGNBQWMsSUFBSSxnQkFBZ0I7QUFDeEMsUUFBTSxRQUFRLElBQUksS0FBSyxFQUFFLFFBQVEsUUFBUSxVQUFVLE1BQU0sS0FBSyxDQUFDO0FBQy9ELFFBQU0sUUFBUSxJQUFJLEtBQUssRUFBRSxRQUFRLFFBQVEsVUFBVSxNQUFNLEtBQUssQ0FBQztBQUMvRCxRQUFNLFdB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
