import assert from "assert";
import { VSBuffer } from "../../../../../base/common/buffer.js";
import { DisposableStore } from "../../../../../base/common/lifecycle.js";
import { Schemas } from "../../../../../base/common/network.js";
import { sep } from "../../../../../base/common/path.js";
import { isLinux } from "../../../../../base/common/platform.js";
import { URI } from "../../../../../base/common/uri.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../../base/test/common/utils.js";
import { FileService } from "../../../../files/common/fileService.js";
import { InMemoryFileSystemProvider } from "../../../../files/common/inMemoryFilesystemProvider.js";
import { NullLogService } from "../../../../log/common/log.js";
import { CustomizationType } from "../../../common/state/protocol/channels-session/state.js";
import { codexHooksToContainers, codexSelectedCapabilityRootCandidates, codexSkillsToContainers, discoverCodexWorkspaceAgents } from "../../../node/codex/codexCustomizations.js";
suite("codexCustomizations", () => {
  const disposables = new DisposableStore();
  teardown(() => disposables.clear());
  ensureNoDisposablesAreLeakedInTestSuite();
  const skill = (name, scope, path, enabled = true) => ({ name, description: `${name} desc`, path, scope, enabled });
  const skillsResponse = (...entries) => ({ data: entries.map((e) => ({ cwd: e.cwd, skills: e.skills, errors: [] })) });
  const hook = (key, eventName, sourcePath, displayOrder = 0, enabled = true) => ({ key, eventName, handlerType: "command", matcher: null, command: "echo hi", timeoutSec: 5n, statusMessage: null, additionalContextLimit: null, sourcePath, source: "project", pluginId: null, displayOrder: BigInt(displayOrder), enabled, isManaged: false, currentHash: "h", trustStatus: "trusted" });
  test("discovers workspace agents without client-pushed local customizations", async () => {
    const fileService = disposables.add(new FileService(new NullLogService()));
    disposables.add(fileService.registerProvider(Schemas.inMemory, disposables.add(new InMemoryFileSystemProvider())));
    const workspace = URI.from({ scheme: Schemas.inMemory, path: "/workspace" });
    const agentsDirectory = URI.joinPath(workspace, ".github", "agents");
    const agent = URI.joinPath(agentsDirectory, "reviewer.agent.md");
    await fileService.createFolder(agentsDirectory);
    await Promise.all([
      fileService.writeFile(agent, VSBuffer.fromString("---\nname: Reviewer\ndescription: Reviews carefully\nmodel: [gpt-first, gpt-second]\ntools: [read_file, search]\ninfer: true\ndisable-model-invocation: true\n---\nReview every change.")),
      fileService.writeFile(URI.joinPath(agentsDirectory, "README.md"), VSBuffer.fromString("---\nname: Reviewer\n---\nDocumentation only."))
    ]);
    const discovered = await discoverCodexWorkspaceAgents([workspace], fileService);
    assert.deepStrictEqual({
      agents: discovered.agents.map((item) => ({ name: item.name, uri: item.uri.toString(), agentInvocable: item.disableModelInvocation !== true })),
      containers: discovered.containers.map((container) => ({
        uri: container.uri,
        contents: container.contents,
        writable: container.writable,
        children: container.children?.map((child) => ({ name: child.name, uri: child.uri, model: child.type === CustomizationType.Agent ? child.model : void 0, tools: child.type === CustomizationType.Agent ? child.tools : void 0 }))
      }))
    }, {
      agents: [{ name: "Reviewer", uri: agent.toString(), agentInvocable: true }],
      containers: [{
        uri: agentsDirectory.toString(),
        contents: CustomizationType.Agent,
        writable: true,
        children: [{ name: "Reviewer", uri: agent.toString(), model: "gpt-first", tools: ["read_file", "search"] }]
      }]
    });
  });
  test("discovers every workspace root with primary-root name precedence", async () => {
    const fileService = disposables.add(new FileService(new NullLogService()));
    disposables.add(fileService.registerProvider(Schemas.inMemory, disposables.add(new InMemoryFileSystemProvider())));
    const primaryWorkspace = URI.from({ scheme: Schemas.inMemory, path: "/primary" });
    const secondaryWorkspace = URI.from({ scheme: Schemas.inMemory, path: "/secondary" });
    const primaryDirectory = URI.joinPath(primaryWorkspace, ".github", "agents");
    const secondaryDirectory = URI.joinPath(secondaryWorkspace, ".github", "agents");
    const primaryAgent = URI.joinPath(primaryDirectory, "reviewer.agent.md");
    const secondaryAgent = URI.joinPath(secondaryDirectory, "reviewer.agent.md");
    const secondaryOnlyAgent = URI.joinPath(secondaryDirectory, "secondary.agent.md");
    await Promise.all([
      fileService.createFolder(primaryDirectory),
      fileService.createFolder(secondaryDirectory)
    ]);
    await Promise.all([
      fileService.writeFile(primaryAgent, VSBuffer.fromString("---\nname: Shared Reviewer\n---\nUse the primary workspace instructions.")),
      fileService.writeFile(secondaryAgent, VSBuffer.fromString("---\nname: Shared Reviewer\n---\nDo not use the duplicate.")),
      fileService.writeFile(secondaryOnlyAgent, VSBuffer.fromString("---\nname: Secondary Agent\n---\nUse the secondary workspace instructions."))
    ]);
    const discovered = await discoverCodexWorkspaceAgents([primaryWorkspace, secondaryWorkspace, primaryWorkspace], fileService);
    assert.deepStrictEqual({
      agents: discovered.agents.map((agent) => ({ name: agent.name, uri: agent.uri.toString() })),
      containers: discovered.containers.map((container) => ({
        uri: container.uri,
        children: container.children?.map((child) => ({ name: child.name, uri: child.uri }))
      }))
    }, {
      agents: [
        { name: "Shared Reviewer", uri: primaryAgent.toString() },
        { name: "Secondary Agent", uri: secondaryOnlyAgent.toString() }
      ],
      containers: [
        { uri: primaryDirectory.toString(), children: [{ name: "Shared Reviewer", uri: primaryAgent.toString() }] },
        { uri: secondaryDirectory.toString(), children: [{ name: "Secondary Agent", uri: secondaryOnlyAgent.toString() }] }
      ]
    });
  });
  test("groups skills by scope into read-only containers, sorted by name", () => {
    const containers = codexSkillsToContainers(skillsResponse({
      cwd: "/repo",
      skills: [
        skill("beta", "repo", "/repo/.agents/skills/beta/SKILL.md"),
        skill("alpha", "repo", "/repo/.agents/skills/alpha/SKILL.md"),
        skill("gamma", "user", "/home/.agents/skills/gamma/SKILL.md", false)
      ]
    }));
    assert.deepStrictEqual(containers.map((c) => ({
      name: c.name,
      contents: c.contents,
      writable: c.writable,
      children: c.children?.map((ch) => ({ type: ch.type, name: ch.name, enabled: ch.enabled }))
    })), [
      {
        name: "Repository",
        contents: CustomizationType.Skill,
        writable: false,
        children: [
          { type: CustomizationType.Skill, name: "alpha", enabled: true },
          { type: CustomizationType.Skill, name: "beta", enabled: true }
        ]
      },
      {
        name: "User",
        contents: CustomizationType.Skill,
        writable: false,
        children: [{ type: CustomizationType.Skill, name: "gamma", enabled: false }]
      }
    ]);
  });
  test("de-duplicates skills by path across cwd entries and orders scopes repo/user/system", () => {
    const dup = skill("shared", "user", "/home/.agents/skills/shared/SKILL.md");
    const containers = codexSkillsToContainers(skillsResponse(
      { cwd: "/a", skills: [dup, skill("sys", "system", "/sys/imagegen/SKILL.md")] },
      { cwd: "/b", skills: [dup] }
    ));
    assert.deepStrictEqual(containers.map((c) => [c.name, c.children?.length]), [["User", 1], ["Built-in", 1]]);
  });
  test("skill child uri is a file uri and id is stable", () => {
    const [container] = codexSkillsToContainers(skillsResponse({ cwd: "/r", skills: [skill("s", "repo", "/r/.agents/skills/s/SKILL.md")] }));
    const child = container.children[0];
    assert.deepStrictEqual({ uriStartsWith: child.uri.toString().startsWith("file://"), sameId: child.id === codexSkillsToContainers(skillsResponse({ cwd: "/r", skills: [skill("s", "repo", "/r/.agents/skills/s/SKILL.md")] }))[0].children[0].id }, { uriStartsWith: true, sameId: true });
  });
  test("empty / undefined skills responses yield no containers", () => {
    assert.deepStrictEqual([codexSkillsToContainers(void 0), codexSkillsToContainers(skillsResponse()), codexSkillsToContainers(skillsResponse({ cwd: "/x", skills: [] }))], [[], [], []]);
  });
  test("hooks project into a single container, de-duped by key and ordered by displayOrder", () => {
    const containers = codexHooksToContainers({
      data: [{
        cwd: "/repo",
        hooks: [
          hook("k2", "postToolUse", "/repo/.codex/config.toml", 2),
          hook("k1", "preToolUse", "/repo/.codex/config.toml", 1, false),
          hook("k1", "preToolUse", "/repo/.codex/config.toml", 1)
        ],
        warnings: [],
        errors: []
      }]
    });
    assert.deepStrictEqual(containers.map((c) => ({
      name: c.name,
      contents: c.contents,
      writable: c.writable,
      children: c.children?.map((ch) => ({ type: ch.type, name: ch.name, enabled: ch.enabled }))
    })), [{
      name: "Hooks",
      contents: CustomizationType.Hook,
      writable: false,
      children: [
        { type: CustomizationType.Hook, name: "preToolUse", enabled: false },
        { type: CustomizationType.Hook, name: "postToolUse", enabled: true }
      ]
    }]);
  });
  test("empty / undefined hooks responses yield no containers", () => {
    assert.deepStrictEqual([codexHooksToContainers(void 0), codexHooksToContainers({ data: [] }), codexHooksToContainers({ data: [{ cwd: "/x", hooks: [], warnings: [], errors: [] }] })], [[], [], []]);
  });
  test("builds both secondary skill conventions in workspace order", () => {
    const rootA = URI.file("/workspace/a");
    const rootB = URI.file("/workspace/b");
    const rootC = URI.file("/workspace/c");
    assert.deepStrictEqual(
      codexSelectedCapabilityRootCandidates([rootA, rootB, rootC]).map((root) => root.location.path),
      [
        URI.joinPath(rootB, ".agents", "skills").fsPath,
        URI.joinPath(rootB, ".codex", "skills").fsPath,
        URI.joinPath(rootC, ".agents", "skills").fsPath,
        URI.joinPath(rootC, ".codex", "skills").fsPath
      ]
    );
  });
  test("excludes primary-equivalent and duplicate secondary roots", () => {
    const rootA = URI.file("/workspace/a");
    const rootB = URI.file("/workspace/b");
    const primaryEquivalent = URI.file(`${rootA.fsPath}${sep}`);
    const duplicateB = URI.file(`${rootB.fsPath}${sep}`);
    const caseVariantA = URI.file(rootA.fsPath.toUpperCase());
    const caseVariantB = URI.file(rootB.fsPath.toUpperCase());
    const candidates = codexSelectedCapabilityRootCandidates([
      rootA,
      primaryEquivalent,
      ...!isLinux ? [caseVariantA] : [],
      rootB,
      duplicateB,
      ...!isLinux ? [caseVariantB] : []
    ]);
    assert.deepStrictEqual(candidates.map((root) => root.location.path), [
      URI.joinPath(rootB, ".agents", "skills").fsPath,
      URI.joinPath(rootB, ".codex", "skills").fsPath
    ]);
  });
  test("rejects non-file secondary roots", () => {
    const rootA = URI.file("/workspace/a");
    assert.deepStrictEqual(codexSelectedCapabilityRootCandidates([
      rootA,
      URI.from({ scheme: Schemas.vscodeRemote, authority: "host", path: "/workspace/b" })
    ]), []);
  });
  test("produces stable versioned ids for equivalent roots and distinct conventions", () => {
    const rootA = URI.file("/workspace/a");
    const rootB = URI.file("/workspace/b");
    const rootC = URI.file("/workspace/c");
    const first = codexSelectedCapabilityRootCandidates([rootA, rootB]);
    const second = codexSelectedCapabilityRootCandidates([rootA, URI.file(`${rootB.fsPath}${sep}`)]);
    const distinctRoot = codexSelectedCapabilityRootCandidates([rootA, rootC]);
    assert.deepStrictEqual({
      firstIds: first.map((root) => root.id),
      secondIds: second.map((root) => root.id),
      versioned: first.every((root) => /^codex-selected-capability-root-v1-[0-9a-f]{64}$/.test(root.id)),
      distinctConventions: first[0].id !== first[1].id,
      distinctRoots: first[0].id !== distinctRoot[0].id
    }, {
      firstIds: second.map((root) => root.id),
      secondIds: second.map((root) => root.id),
      versioned: true,
      distinctConventions: true,
      distinctRoots: true
    });
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxwbGF0Zm9ybVxcYWdlbnRIb3N0XFx0ZXN0XFxub2RlXFxjb2RleFxcY29kZXhDdXN0b21pemF0aW9ucy50ZXN0LnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IGFzc2VydCBmcm9tICdhc3NlcnQnO1xuaW1wb3J0IHsgVlNCdWZmZXIgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9idWZmZXIuanMnO1xuaW1wb3J0IHsgRGlzcG9zYWJsZVN0b3JlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IFNjaGVtYXMgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9uZXR3b3JrLmpzJztcbmltcG9ydCB7IHNlcCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3BhdGguanMnO1xuaW1wb3J0IHsgaXNMaW51eCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3BsYXRmb3JtLmpzJztcbmltcG9ydCB7IFVSSSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3VyaS5qcyc7XG5pbXBvcnQgeyBlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL3Rlc3QvY29tbW9uL3V0aWxzLmpzJztcbmltcG9ydCB7IEZpbGVTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vZmlsZXMvY29tbW9uL2ZpbGVTZXJ2aWNlLmpzJztcbmltcG9ydCB7IEluTWVtb3J5RmlsZVN5c3RlbVByb3ZpZGVyIH0gZnJvbSAnLi4vLi4vLi4vLi4vZmlsZXMvY29tbW9uL2luTWVtb3J5RmlsZXN5c3RlbVByb3ZpZGVyLmpzJztcbmltcG9ydCB7IE51bGxMb2dTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vbG9nL2NvbW1vbi9sb2cuanMnO1xuaW1wb3J0IHsgQ3VzdG9taXphdGlvblR5cGUgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vc3RhdGUvcHJvdG9jb2wvY2hhbm5lbHMtc2Vzc2lvbi9zdGF0ZS5qcyc7XG5pbXBvcnQgeyBjb2RleEhvb2tzVG9Db250YWluZXJzLCBjb2RleFNlbGVjdGVkQ2FwYWJpbGl0eVJvb3RDYW5kaWRhdGVzLCBjb2RleFNraWxsc1RvQ29udGFpbmVycywgZGlzY292ZXJDb2RleFdvcmtzcGFjZUFnZW50cyB9IGZyb20gJy4uLy4uLy4uL25vZGUvY29kZXgvY29kZXhDdXN0b21pemF0aW9ucy5qcyc7XG5pbXBvcnQgdHlwZSB7IEhvb2tNZXRhZGF0YSB9IGZyb20gJy4uLy4uLy4uL25vZGUvY29kZXgvcHJvdG9jb2wvZ2VuZXJhdGVkL3YyL0hvb2tNZXRhZGF0YS5qcyc7XG5pbXBvcnQgdHlwZSB7IFNraWxsTWV0YWRhdGEgfSBmcm9tICcuLi8uLi8uLi9ub2RlL2NvZGV4L3Byb3RvY29sL2dlbmVyYXRlZC92Mi9Ta2lsbE1ldGFkYXRhLmpzJztcbmltcG9ydCB0eXBlIHsgU2tpbGxTY29wZSB9IGZyb20gJy4uLy4uLy4uL25vZGUvY29kZXgvcHJvdG9jb2wvZ2VuZXJhdGVkL3YyL1NraWxsU2NvcGUuanMnO1xuaW1wb3J0IHR5cGUgeyBTa2lsbHNMaXN0UmVzcG9uc2UgfSBmcm9tICcuLi8uLi8uLi9ub2RlL2NvZGV4L3Byb3RvY29sL2dlbmVyYXRlZC92Mi9Ta2lsbHNMaXN0UmVzcG9uc2UuanMnO1xuXG5zdWl0ZSgnY29kZXhDdXN0b21pemF0aW9ucycsICgpID0+IHtcblxuXHRjb25zdCBkaXNwb3NhYmxlcyA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblx0dGVhcmRvd24oKCkgPT4gZGlzcG9zYWJsZXMuY2xlYXIoKSk7XG5cblx0ZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlKCk7XG5cblx0Y29uc3Qgc2tpbGwgPSAobmFtZTogc3RyaW5nLCBzY29wZTogU2tpbGxTY29wZSwgcGF0aDogc3RyaW5nLCBlbmFibGVkID0gdHJ1ZSk6IFNraWxsTWV0YWRhdGEgPT5cblx0XHQoeyBuYW1lLCBkZXNjcmlwdGlvbjogYCR7bmFtZX0gZGVzY2AsIHBhdGgsIHNjb3BlLCBlbmFibGVkIH0pO1xuXG5cdGNvbnN0IHNraWxsc1Jlc3BvbnNlID0gKC4uLmVudHJpZXM6IHsgY3dkOiBzdHJpbmc7IHNraWxsczogU2tpbGxNZXRhZGF0YVtdIH1bXSk6IFNraWxsc0xpc3RSZXNwb25zZSA9PlxuXHRcdCh7IGRhdGE6IGVudHJpZXMubWFwKGUgPT4gKHsgY3dkOiBlLmN3ZCwgc2tpbGxzOiBlLnNraWxscywgZXJyb3JzOiBbXSB9KSkgfSk7XG5cblx0Y29uc3QgaG9vayA9IChrZXk6IHN0cmluZywgZXZlbnROYW1lOiBIb29rTWV0YWRhdGFbJ2V2ZW50TmFtZSddLCBzb3VyY2VQYXRoOiBzdHJpbmcsIGRpc3BsYXlPcmRlciA9IDAsIGVuYWJsZWQgPSB0cnVlKTogSG9va01ldGFkYXRhID0+XG5cdFx0KHsga2V5LCBldmVudE5hbWUsIGhhbmRsZXJUeXBlOiAnY29tbWFuZCcsIG1hdGNoZXI6IG51bGwsIGNvbW1hbmQ6ICdlY2hvIGhpJywgdGltZW91dFNlYzogNW4sIHN0YXR1c01lc3NhZ2U6IG51bGwsIGFkZGl0aW9uYWxDb250ZXh0TGltaXQ6IG51bGwsIHNvdXJjZVBhdGgsIHNvdXJjZTogJ3Byb2plY3QnLCBwbHVnaW5JZDogbnVsbCwgZGlzcGxheU9yZGVyOiBCaWdJbnQoZGlzcGxheU9yZGVyKSwgZW5hYmxlZCwgaXNNYW5hZ2VkOiBmYWxzZSwgY3VycmVudEhhc2g6ICdoJywgdHJ1c3RTdGF0dXM6ICd0cnVzdGVkJyB9KTtcblxuXHR0ZXN0KCdkaXNjb3ZlcnMgd29ya3NwYWNlIGFnZW50cyB3aXRob3V0IGNsaWVudC1wdXNoZWQgbG9jYWwgY3VzdG9taXphdGlvbnMnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgZmlsZVNlcnZpY2UgPSBkaXNwb3NhYmxlcy5hZGQobmV3IEZpbGVTZXJ2aWNlKG5ldyBOdWxsTG9nU2VydmljZSgpKSk7XG5cdFx0ZGlzcG9zYWJsZXMuYWRkKGZpbGVTZXJ2aWNlLnJlZ2lzdGVyUHJvdmlkZXIoU2NoZW1hcy5pbk1lbW9yeSwgZGlzcG9zYWJsZXMuYWRkKG5ldyBJbk1lbW9yeUZpbGVTeXN0ZW1Qcm92aWRlcigpKSkpO1xuXHRcdGNvbnN0IHdvcmtzcGFjZSA9IFVSSS5mcm9tKHsgc2NoZW1lOiBTY2hlbWFzLmluTWVtb3J5LCBwYXRoOiAnL3dvcmtzcGFjZScgfSk7XG5cdFx0Y29uc3QgYWdlbnRzRGlyZWN0b3J5ID0gVVJJLmpvaW5QYXRoKHdvcmtzcGFjZSwgJy5naXRodWInLCAnYWdlbnRzJyk7XG5cdFx0Y29uc3QgYWdlbnQgPSBVUkkuam9pblBhdGgoYWdlbnRzRGlyZWN0b3J5LCAncmV2aWV3ZXIuYWdlbnQubWQnKTtcblx0XHRhd2FpdCBmaWxlU2VydmljZS5jcmVhdGVGb2xkZXIoYWdlbnRzRGlyZWN0b3J5KTtcblx0XHRhd2FpdCBQcm9taXNlLmFsbChbXG5cdFx0XHRmaWxlU2VydmljZS53cml0ZUZpbGUoYWdlbnQsIFZTQnVmZmVyLmZyb21TdHJpbmcoJy0tLVxcbm5hbWU6IFJldmlld2VyXFxuZGVzY3JpcHRpb246IFJldmlld3MgY2FyZWZ1bGx5XFxubW9kZWw6IFtncHQtZmlyc3QsIGdwdC1zZWNvbmRdXFxudG9vbHM6IFtyZWFkX2ZpbGUsIHNlYXJjaF1cXG5pbmZlcjogdHJ1ZVxcbmRpc2FibGUtbW9kZWwtaW52b2NhdGlvbjogdHJ1ZVxcbi0tLVxcblJldmlldyBldmVyeSBjaGFuZ2UuJykpLFxuXHRcdFx0ZmlsZVNlcnZpY2Uud3JpdGVGaWxlKFVSSS5qb2luUGF0aChhZ2VudHNEaXJlY3RvcnksICdSRUFETUUubWQnKSwgVlNCdWZmZXIuZnJvbVN0cmluZygnLS0tXFxubmFtZTogUmV2aWV3ZXJcXG4tLS1cXG5Eb2N1bWVudGF0aW9uIG9ubHkuJykpLFxuXHRcdF0pO1xuXG5cdFx0Y29uc3QgZGlzY292ZXJlZCA9IGF3YWl0IGRpc2NvdmVyQ29kZXhXb3Jrc3BhY2VBZ2VudHMoW3dvcmtzcGFjZV0sIGZpbGVTZXJ2aWNlKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0YWdlbnRzOiBkaXNjb3ZlcmVkLmFnZW50cy5tYXAoaXRlbSA9PiAoeyBuYW1lOiBpdGVtLm5hbWUsIHVyaTogaXRlbS51cmkudG9TdHJpbmcoKSwgYWdlbnRJbnZvY2FibGU6IGl0ZW0uZGlzYWJsZU1vZGVsSW52b2NhdGlvbiAhPT0gdHJ1ZSB9KSksXG5cdFx0XHRjb250YWluZXJzOiBkaXNjb3ZlcmVkLmNvbnRhaW5lcnMubWFwKGNvbnRhaW5lciA9PiAoe1xuXHRcdFx0XHR1cmk6IGNvbnRhaW5lci51cmksXG5cdFx0XHRcdGNvbnRlbnRzOiBjb250YWluZXIuY29udGVudHMsXG5cdFx0XHRcdHdyaXRhYmxlOiBjb250YWluZXIud3JpdGFibGUsXG5cdFx0XHRcdGNoaWxkcmVuOiBjb250YWluZXIuY2hpbGRyZW4/Lm1hcChjaGlsZCA9PiAoeyBuYW1lOiBjaGlsZC5uYW1lLCB1cmk6IGNoaWxkLnVyaSwgbW9kZWw6IGNoaWxkLnR5cGUgPT09IEN1c3RvbWl6YXRpb25UeXBlLkFnZW50ID8gY2hpbGQubW9kZWwgOiB1bmRlZmluZWQsIHRvb2xzOiBjaGlsZC50eXBlID09PSBDdXN0b21pemF0aW9uVHlwZS5BZ2VudCA/IGNoaWxkLnRvb2xzIDogdW5kZWZpbmVkIH0pKSxcblx0XHRcdH0pKSxcblx0XHR9LCB7XG5cdFx0XHRhZ2VudHM6IFt7IG5hbWU6ICdSZXZpZXdlcicsIHVyaTogYWdlbnQudG9TdHJpbmcoKSwgYWdlbnRJbnZvY2FibGU6IHRydWUgfV0sXG5cdFx0XHRjb250YWluZXJzOiBbe1xuXHRcdFx0XHR1cmk6IGFnZW50c0RpcmVjdG9yeS50b1N0cmluZygpLFxuXHRcdFx0XHRjb250ZW50czogQ3VzdG9taXphdGlvblR5cGUuQWdlbnQsXG5cdFx0XHRcdHdyaXRhYmxlOiB0cnVlLFxuXHRcdFx0XHRjaGlsZHJlbjogW3sgbmFtZTogJ1Jldmlld2VyJywgdXJpOiBhZ2VudC50b1N0cmluZygpLCBtb2RlbDogJ2dwdC1maXJzdCcsIHRvb2xzOiBbJ3JlYWRfZmlsZScsICdzZWFyY2gnXSB9XSxcblx0XHRcdH1dLFxuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdkaXNjb3ZlcnMgZXZlcnkgd29ya3NwYWNlIHJvb3Qgd2l0aCBwcmltYXJ5LXJvb3QgbmFtZSBwcmVjZWRlbmNlJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IGZpbGVTZXJ2aWNlID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBGaWxlU2VydmljZShuZXcgTnVsbExvZ1NlcnZpY2UoKSkpO1xuXHRcdGRpc3Bvc2FibGVzLmFkZChmaWxlU2VydmljZS5yZWdpc3RlclByb3ZpZGVyKFNjaGVtYXMuaW5NZW1vcnksIGRpc3Bvc2FibGVzLmFkZChuZXcgSW5NZW1vcnlGaWxlU3lzdGVtUHJvdmlkZXIoKSkpKTtcblx0XHRjb25zdCBwcmltYXJ5V29ya3NwYWNlID0gVVJJLmZyb20oeyBzY2hlbWU6IFNjaGVtYXMuaW5NZW1vcnksIHBhdGg6ICcvcHJpbWFyeScgfSk7XG5cdFx0Y29uc3Qgc2Vjb25kYXJ5V29ya3NwYWNlID0gVVJJLmZyb20oeyBzY2hlbWU6IFNjaGVtYXMuaW5NZW1vcnksIHBhdGg6ICcvc2Vjb25kYXJ5JyB9KTtcblx0XHRjb25zdCBwcmltYXJ5RGlyZWN0b3J5ID0gVVJJLmpvaW5QYXRoKHByaW1hcnlXb3Jrc3BhY2UsICcuZ2l0aHViJywgJ2FnZW50cycpO1xuXHRcdGNvbnN0IHNlY29uZGFyeURpcmVjdG9yeSA9IFVSSS5qb2luUGF0aChzZWNvbmRhcnlXb3Jrc3BhY2UsICcuZ2l0aHViJywgJ2FnZW50cycpO1xuXHRcdGNvbnN0IHByaW1hcnlBZ2VudCA9IFVSSS5qb2luUGF0aChwcmltYXJ5RGlyZWN0b3J5LCAncmV2aWV3ZXIuYWdlbnQubWQnKTtcblx0XHRjb25zdCBzZWNvbmRhcnlBZ2VudCA9IFVSSS5qb2luUGF0aChzZWNvbmRhcnlEaXJlY3RvcnksICdyZXZpZXdlci5hZ2VudC5tZCcpO1xuXHRcdGNvbnN0IHNlY29uZGFyeU9ubHlBZ2VudCA9IFVSSS5qb2luUGF0aChzZWNvbmRhcnlEaXJlY3RvcnksICdzZWNvbmRhcnkuYWdlbnQubWQnKTtcblx0XHRhd2FpdCBQcm9taXNlLmFsbChbXG5cdFx0XHRmaWxlU2VydmljZS5jcmVhdGVGb2xkZXIocHJpbWFyeURpcmVjdG9yeSksXG5cdFx0XHRmaWxlU2VydmljZS5jcmVhdGVGb2xkZXIoc2Vjb25kYXJ5RGlyZWN0b3J5KSxcblx0XHRdKTtcblx0XHRhd2FpdCBQcm9taXNlLmFsbChbXG5cdFx0XHRmaWxlU2VydmljZS53cml0ZUZpbGUocHJpbWFyeUFnZW50LCBWU0J1ZmZlci5mcm9tU3RyaW5nKCctLS1cXG5uYW1lOiBTaGFyZWQgUmV2aWV3ZXJcXG4tLS1cXG5Vc2UgdGhlIHByaW1hcnkgd29ya3NwYWNlIGluc3RydWN0aW9ucy4nKSksXG5cdFx0XHRmaWxlU2VydmljZS53cml0ZUZpbGUoc2Vjb25kYXJ5QWdlbnQsIFZTQnVmZmVyLmZyb21TdHJpbmcoJy0tLVxcbm5hbWU6IFNoYXJlZCBSZXZpZXdlclxcbi0tLVxcbkRvIG5vdCB1c2UgdGhlIGR1cGxpY2F0ZS4nKSksXG5cdFx0XHRmaWxlU2VydmljZS53cml0ZUZpbGUoc2Vjb25kYXJ5T25seUFnZW50LCBWU0J1ZmZlci5mcm9tU3RyaW5nKCctLS1cXG5uYW1lOiBTZWNvbmRhcnkgQWdlbnRcXG4tLS1cXG5Vc2UgdGhlIHNlY29uZGFyeSB3b3Jrc3BhY2UgaW5zdHJ1Y3Rpb25zLicpKSxcblx0XHRdKTtcblxuXHRcdGNvbnN0IGRpc2NvdmVyZWQgPSBhd2FpdCBkaXNjb3ZlckNvZGV4V29ya3NwYWNlQWdlbnRzKFtwcmltYXJ5V29ya3NwYWNlLCBzZWNvbmRhcnlXb3Jrc3BhY2UsIHByaW1hcnlXb3Jrc3BhY2VdLCBmaWxlU2VydmljZSk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdGFnZW50czogZGlzY292ZXJlZC5hZ2VudHMubWFwKGFnZW50ID0+ICh7IG5hbWU6IGFnZW50Lm5hbWUsIHVyaTogYWdlbnQudXJpLnRvU3RyaW5nKCkgfSkpLFxuXHRcdFx0Y29udGFpbmVyczogZGlzY292ZXJlZC5jb250YWluZXJzLm1hcChjb250YWluZXIgPT4gKHtcblx0XHRcdFx0dXJpOiBjb250YWluZXIudXJpLFxuXHRcdFx0XHRjaGlsZHJlbjogY29udGFpbmVyLmNoaWxkcmVuPy5tYXAoY2hpbGQgPT4gKHsgbmFtZTogY2hpbGQubmFtZSwgdXJpOiBjaGlsZC51cmkgfSkpLFxuXHRcdFx0fSkpLFxuXHRcdH0sIHtcblx0XHRcdGFnZW50czogW1xuXHRcdFx0XHR7IG5hbWU6ICdTaGFyZWQgUmV2aWV3ZXInLCB1cmk6IHByaW1hcnlBZ2VudC50b1N0cmluZygpIH0sXG5cdFx0XHRcdHsgbmFtZTogJ1NlY29uZGFyeSBBZ2VudCcsIHVyaTogc2Vjb25kYXJ5T25seUFnZW50LnRvU3RyaW5nKCkgfSxcblx0XHRcdF0sXG5cdFx0XHRjb250YWluZXJzOiBbXG5cdFx0XHRcdHsgdXJpOiBwcmltYXJ5RGlyZWN0b3J5LnRvU3RyaW5nKCksIGNoaWxkcmVuOiBbeyBuYW1lOiAnU2hhcmVkIFJldmlld2VyJywgdXJpOiBwcmltYXJ5QWdlbnQudG9TdHJpbmcoKSB9XSB9LFxuXHRcdFx0XHR7IHVyaTogc2Vjb25kYXJ5RGlyZWN0b3J5LnRvU3RyaW5nKCksIGNoaWxkcmVuOiBbeyBuYW1lOiAnU2Vjb25kYXJ5IEFnZW50JywgdXJpOiBzZWNvbmRhcnlPbmx5QWdlbnQudG9TdHJpbmcoKSB9XSB9LFxuXHRcdFx0XSxcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnZ3JvdXBzIHNraWxscyBieSBzY29wZSBpbnRvIHJlYWQtb25seSBjb250YWluZXJzLCBzb3J0ZWQgYnkgbmFtZScsICgpID0+IHtcblx0XHRjb25zdCBjb250YWluZXJzID0gY29kZXhTa2lsbHNUb0NvbnRhaW5lcnMoc2tpbGxzUmVzcG9uc2Uoe1xuXHRcdFx0Y3dkOiAnL3JlcG8nLFxuXHRcdFx0c2tpbGxzOiBbXG5cdFx0XHRcdHNraWxsKCdiZXRhJywgJ3JlcG8nLCAnL3JlcG8vLmFnZW50cy9za2lsbHMvYmV0YS9TS0lMTC5tZCcpLFxuXHRcdFx0XHRza2lsbCgnYWxwaGEnLCAncmVwbycsICcvcmVwby8uYWdlbnRzL3NraWxscy9hbHBoYS9TS0lMTC5tZCcpLFxuXHRcdFx0XHRza2lsbCgnZ2FtbWEnLCAndXNlcicsICcvaG9tZS8uYWdlbnRzL3NraWxscy9nYW1tYS9TS0lMTC5tZCcsIGZhbHNlKSxcblx0XHRcdF0sXG5cdFx0fSkpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoY29udGFpbmVycy5tYXAoYyA9PiAoe1xuXHRcdFx0bmFtZTogYy5uYW1lLFxuXHRcdFx0Y29udGVudHM6IGMuY29udGVudHMsXG5cdFx0XHR3cml0YWJsZTogYy53cml0YWJsZSxcblx0XHRcdGNoaWxkcmVuOiBjLmNoaWxkcmVuPy5tYXAoY2ggPT4gKHsgdHlwZTogY2gudHlwZSwgbmFtZTogY2gubmFtZSwgZW5hYmxlZDogKGNoIGFzIHsgZW5hYmxlZD86IGJvb2xlYW4gfSkuZW5hYmxlZCB9KSksXG5cdFx0fSkpLCBbXG5cdFx0XHR7XG5cdFx0XHRcdG5hbWU6ICdSZXBvc2l0b3J5JywgY29udGVudHM6IEN1c3RvbWl6YXRpb25UeXBlLlNraWxsLCB3cml0YWJsZTogZmFsc2UsXG5cdFx0XHRcdGNoaWxkcmVuOiBbXG5cdFx0XHRcdFx0eyB0eXBlOiBDdXN0b21pemF0aW9uVHlwZS5Ta2lsbCwgbmFtZTogJ2FscGhhJywgZW5hYmxlZDogdHJ1ZSB9LFxuXHRcdFx0XHRcdHsgdHlwZTogQ3VzdG9taXphdGlvblR5cGUuU2tpbGwsIG5hbWU6ICdiZXRhJywgZW5hYmxlZDogdHJ1ZSB9LFxuXHRcdFx0XHRdLFxuXHRcdFx0fSxcblx0XHRcdHtcblx0XHRcdFx0bmFtZTogJ1VzZXInLCBjb250ZW50czogQ3VzdG9taXphdGlvblR5cGUuU2tpbGwsIHdyaXRhYmxlOiBmYWxzZSxcblx0XHRcdFx0Y2hpbGRyZW46IFt7IHR5cGU6IEN1c3RvbWl6YXRpb25UeXBlLlNraWxsLCBuYW1lOiAnZ2FtbWEnLCBlbmFibGVkOiBmYWxzZSB9XSxcblx0XHRcdH0sXG5cdFx0XSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2RlLWR1cGxpY2F0ZXMgc2tpbGxzIGJ5IHBhdGggYWNyb3NzIGN3ZCBlbnRyaWVzIGFuZCBvcmRlcnMgc2NvcGVzIHJlcG8vdXNlci9zeXN0ZW0nLCAoKSA9PiB7XG5cdFx0Y29uc3QgZHVwID0gc2tpbGwoJ3NoYXJlZCcsICd1c2VyJywgJy9ob21lLy5hZ2VudHMvc2tpbGxzL3NoYXJlZC9TS0lMTC5tZCcpO1xuXHRcdGNvbnN0IGNvbnRhaW5lcnMgPSBjb2RleFNraWxsc1RvQ29udGFpbmVycyhza2lsbHNSZXNwb25zZShcblx0XHRcdHsgY3dkOiAnL2EnLCBza2lsbHM6IFtkdXAsIHNraWxsKCdzeXMnLCAnc3lzdGVtJywgJy9zeXMvaW1hZ2VnZW4vU0tJTEwubWQnKV0gfSxcblx0XHRcdHsgY3dkOiAnL2InLCBza2lsbHM6IFtkdXBdIH0sXG5cdFx0KSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChjb250YWluZXJzLm1hcChjID0+IFtjLm5hbWUsIGMuY2hpbGRyZW4/Lmxlbmd0aF0pLCBbWydVc2VyJywgMV0sIFsnQnVpbHQtaW4nLCAxXV0pO1xuXHR9KTtcblxuXHR0ZXN0KCdza2lsbCBjaGlsZCB1cmkgaXMgYSBmaWxlIHVyaSBhbmQgaWQgaXMgc3RhYmxlJywgKCkgPT4ge1xuXHRcdGNvbnN0IFtjb250YWluZXJdID0gY29kZXhTa2lsbHNUb0NvbnRhaW5lcnMoc2tpbGxzUmVzcG9uc2UoeyBjd2Q6ICcvcicsIHNraWxsczogW3NraWxsKCdzJywgJ3JlcG8nLCAnL3IvLmFnZW50cy9za2lsbHMvcy9TS0lMTC5tZCcpXSB9KSk7XG5cdFx0Y29uc3QgY2hpbGQgPSBjb250YWluZXIuY2hpbGRyZW4hWzBdO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoeyB1cmlTdGFydHNXaXRoOiBjaGlsZC51cmkudG9TdHJpbmcoKS5zdGFydHNXaXRoKCdmaWxlOi8vJyksIHNhbWVJZDogY2hpbGQuaWQgPT09IGNvZGV4U2tpbGxzVG9Db250YWluZXJzKHNraWxsc1Jlc3BvbnNlKHsgY3dkOiAnL3InLCBza2lsbHM6IFtza2lsbCgncycsICdyZXBvJywgJy9yLy5hZ2VudHMvc2tpbGxzL3MvU0tJTEwubWQnKV0gfSkpWzBdLmNoaWxkcmVuIVswXS5pZCB9LCB7IHVyaVN0YXJ0c1dpdGg6IHRydWUsIHNhbWVJZDogdHJ1ZSB9KTtcblx0fSk7XG5cblx0dGVzdCgnZW1wdHkgLyB1bmRlZmluZWQgc2tpbGxzIHJlc3BvbnNlcyB5aWVsZCBubyBjb250YWluZXJzJywgKCkgPT4ge1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoW2NvZGV4U2tpbGxzVG9Db250YWluZXJzKHVuZGVmaW5lZCksIGNvZGV4U2tpbGxzVG9Db250YWluZXJzKHNraWxsc1Jlc3BvbnNlKCkpLCBjb2RleFNraWxsc1RvQ29udGFpbmVycyhza2lsbHNSZXNwb25zZSh7IGN3ZDogJy94Jywgc2tpbGxzOiBbXSB9KSldLCBbW10sIFtdLCBbXV0pO1xuXHR9KTtcblxuXHR0ZXN0KCdob29rcyBwcm9qZWN0IGludG8gYSBzaW5nbGUgY29udGFpbmVyLCBkZS1kdXBlZCBieSBrZXkgYW5kIG9yZGVyZWQgYnkgZGlzcGxheU9yZGVyJywgKCkgPT4ge1xuXHRcdGNvbnN0IGNvbnRhaW5lcnMgPSBjb2RleEhvb2tzVG9Db250YWluZXJzKHtcblx0XHRcdGRhdGE6IFt7XG5cdFx0XHRcdGN3ZDogJy9yZXBvJyxcblx0XHRcdFx0aG9va3M6IFtcblx0XHRcdFx0XHRob29rKCdrMicsICdwb3N0VG9vbFVzZScsICcvcmVwby8uY29kZXgvY29uZmlnLnRvbWwnLCAyKSxcblx0XHRcdFx0XHRob29rKCdrMScsICdwcmVUb29sVXNlJywgJy9yZXBvLy5jb2RleC9jb25maWcudG9tbCcsIDEsIGZhbHNlKSxcblx0XHRcdFx0XHRob29rKCdrMScsICdwcmVUb29sVXNlJywgJy9yZXBvLy5jb2RleC9jb25maWcudG9tbCcsIDEpLFxuXHRcdFx0XHRdLFxuXHRcdFx0XHR3YXJuaW5nczogW10sXG5cdFx0XHRcdGVycm9yczogW10sXG5cdFx0XHR9XSxcblx0XHR9KTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGNvbnRhaW5lcnMubWFwKGMgPT4gKHtcblx0XHRcdG5hbWU6IGMubmFtZSwgY29udGVudHM6IGMuY29udGVudHMsIHdyaXRhYmxlOiBjLndyaXRhYmxlLFxuXHRcdFx0Y2hpbGRyZW46IGMuY2hpbGRyZW4/Lm1hcChjaCA9PiAoeyB0eXBlOiBjaC50eXBlLCBuYW1lOiBjaC5uYW1lLCBlbmFibGVkOiAoY2ggYXMgeyBlbmFibGVkPzogYm9vbGVhbiB9KS5lbmFibGVkIH0pKSxcblx0XHR9KSksIFt7XG5cdFx0XHRuYW1lOiAnSG9va3MnLCBjb250ZW50czogQ3VzdG9taXphdGlvblR5cGUuSG9vaywgd3JpdGFibGU6IGZhbHNlLFxuXHRcdFx0Y2hpbGRyZW46IFtcblx0XHRcdFx0eyB0eXBlOiBDdXN0b21pemF0aW9uVHlwZS5Ib29rLCBuYW1lOiAncHJlVG9vbFVzZScsIGVuYWJsZWQ6IGZhbHNlIH0sXG5cdFx0XHRcdHsgdHlwZTogQ3VzdG9taXphdGlvblR5cGUuSG9vaywgbmFtZTogJ3Bvc3RUb29sVXNlJywgZW5hYmxlZDogdHJ1ZSB9LFxuXHRcdFx0XSxcblx0XHR9XSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2VtcHR5IC8gdW5kZWZpbmVkIGhvb2tzIHJlc3BvbnNlcyB5aWVsZCBubyBjb250YWluZXJzJywgKCkgPT4ge1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoW2NvZGV4SG9va3NUb0NvbnRhaW5lcnModW5kZWZpbmVkKSwgY29kZXhIb29rc1RvQ29udGFpbmVycyh7IGRhdGE6IFtdIH0pLCBjb2RleEhvb2tzVG9Db250YWluZXJzKHsgZGF0YTogW3sgY3dkOiAnL3gnLCBob29rczogW10sIHdhcm5pbmdzOiBbXSwgZXJyb3JzOiBbXSB9XSB9KV0sIFtbXSwgW10sIFtdXSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2J1aWxkcyBib3RoIHNlY29uZGFyeSBza2lsbCBjb252ZW50aW9ucyBpbiB3b3Jrc3BhY2Ugb3JkZXInLCAoKSA9PiB7XG5cdFx0Y29uc3Qgcm9vdEEgPSBVUkkuZmlsZSgnL3dvcmtzcGFjZS9hJyk7XG5cdFx0Y29uc3Qgcm9vdEIgPSBVUkkuZmlsZSgnL3dvcmtzcGFjZS9iJyk7XG5cdFx0Y29uc3Qgcm9vdEMgPSBVUkkuZmlsZSgnL3dvcmtzcGFjZS9jJyk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKFxuXHRcdFx0Y29kZXhTZWxlY3RlZENhcGFiaWxpdHlSb290Q2FuZGlkYXRlcyhbcm9vdEEsIHJvb3RCLCByb290Q10pLm1hcChyb290ID0+IHJvb3QubG9jYXRpb24ucGF0aCksXG5cdFx0XHRbXG5cdFx0XHRcdFVSSS5qb2luUGF0aChyb290QiwgJy5hZ2VudHMnLCAnc2tpbGxzJykuZnNQYXRoLFxuXHRcdFx0XHRVUkkuam9pblBhdGgocm9vdEIsICcuY29kZXgnLCAnc2tpbGxzJykuZnNQYXRoLFxuXHRcdFx0XHRVUkkuam9pblBhdGgocm9vdEMsICcuYWdlbnRzJywgJ3NraWxscycpLmZzUGF0aCxcblx0XHRcdFx0VVJJLmpvaW5QYXRoKHJvb3RDLCAnLmNvZGV4JywgJ3NraWxscycpLmZzUGF0aCxcblx0XHRcdF0sXG5cdFx0KTtcblx0fSk7XG5cblx0dGVzdCgnZXhjbHVkZXMgcHJpbWFyeS1lcXVpdmFsZW50IGFuZCBkdXBsaWNhdGUgc2Vjb25kYXJ5IHJvb3RzJywgKCkgPT4ge1xuXHRcdGNvbnN0IHJvb3RBID0gVVJJLmZpbGUoJy93b3Jrc3BhY2UvYScpO1xuXHRcdGNvbnN0IHJvb3RCID0gVVJJLmZpbGUoJy93b3Jrc3BhY2UvYicpO1xuXHRcdGNvbnN0IHByaW1hcnlFcXVpdmFsZW50ID0gVVJJLmZpbGUoYCR7cm9vdEEuZnNQYXRofSR7c2VwfWApO1xuXHRcdGNvbnN0IGR1cGxpY2F0ZUIgPSBVUkkuZmlsZShgJHtyb290Qi5mc1BhdGh9JHtzZXB9YCk7XG5cdFx0Y29uc3QgY2FzZVZhcmlhbnRBID0gVVJJLmZpbGUocm9vdEEuZnNQYXRoLnRvVXBwZXJDYXNlKCkpO1xuXHRcdGNvbnN0IGNhc2VWYXJpYW50QiA9IFVSSS5maWxlKHJvb3RCLmZzUGF0aC50b1VwcGVyQ2FzZSgpKTtcblxuXHRcdGNvbnN0IGNhbmRpZGF0ZXMgPSBjb2RleFNlbGVjdGVkQ2FwYWJpbGl0eVJvb3RDYW5kaWRhdGVzKFtcblx0XHRcdHJvb3RBLFxuXHRcdFx0cHJpbWFyeUVxdWl2YWxlbnQsXG5cdFx0XHQuLi4oIWlzTGludXggPyBbY2FzZVZhcmlhbnRBXSA6IFtdKSxcblx0XHRcdHJvb3RCLFxuXHRcdFx0ZHVwbGljYXRlQixcblx0XHRcdC4uLighaXNMaW51eCA/IFtjYXNlVmFyaWFudEJdIDogW10pLFxuXHRcdF0pO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChjYW5kaWRhdGVzLm1hcChyb290ID0+IHJvb3QubG9jYXRpb24ucGF0aCksIFtcblx0XHRcdFVSSS5qb2luUGF0aChyb290QiwgJy5hZ2VudHMnLCAnc2tpbGxzJykuZnNQYXRoLFxuXHRcdFx0VVJJLmpvaW5QYXRoKHJvb3RCLCAnLmNvZGV4JywgJ3NraWxscycpLmZzUGF0aCxcblx0XHRdKTtcblx0fSk7XG5cblx0dGVzdCgncmVqZWN0cyBub24tZmlsZSBzZWNvbmRhcnkgcm9vdHMnLCAoKSA9PiB7XG5cdFx0Y29uc3Qgcm9vdEEgPSBVUkkuZmlsZSgnL3dvcmtzcGFjZS9hJyk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGNvZGV4U2VsZWN0ZWRDYXBhYmlsaXR5Um9vdENhbmRpZGF0ZXMoW1xuXHRcdFx0cm9vdEEsXG5cdFx0XHRVUkkuZnJvbSh7IHNjaGVtZTogU2NoZW1hcy52c2NvZGVSZW1vdGUsIGF1dGhvcml0eTogJ2hvc3QnLCBwYXRoOiAnL3dvcmtzcGFjZS9iJyB9KSxcblx0XHRdKSwgW10pO1xuXHR9KTtcblxuXHR0ZXN0KCdwcm9kdWNlcyBzdGFibGUgdmVyc2lvbmVkIGlkcyBmb3IgZXF1aXZhbGVudCByb290cyBhbmQgZGlzdGluY3QgY29udmVudGlvbnMnLCAoKSA9PiB7XG5cdFx0Y29uc3Qgcm9vdEEgPSBVUkkuZmlsZSgnL3dvcmtzcGFjZS9hJyk7XG5cdFx0Y29uc3Qgcm9vdEIgPSBVUkkuZmlsZSgnL3dvcmtzcGFjZS9iJyk7XG5cdFx0Y29uc3Qgcm9vdEMgPSBVUkkuZmlsZSgnL3dvcmtzcGFjZS9jJyk7XG5cdFx0Y29uc3QgZmlyc3QgPSBjb2RleFNlbGVjdGVkQ2FwYWJpbGl0eVJvb3RDYW5kaWRhdGVzKFtyb290QSwgcm9vdEJdKTtcblx0XHRjb25zdCBzZWNvbmQgPSBjb2RleFNlbGVjdGVkQ2FwYWJpbGl0eVJvb3RDYW5kaWRhdGVzKFtyb290QSwgVVJJLmZpbGUoYCR7cm9vdEIuZnNQYXRofSR7c2VwfWApXSk7XG5cdFx0Y29uc3QgZGlzdGluY3RSb290ID0gY29kZXhTZWxlY3RlZENhcGFiaWxpdHlSb290Q2FuZGlkYXRlcyhbcm9vdEEsIHJvb3RDXSk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdGZpcnN0SWRzOiBmaXJzdC5tYXAocm9vdCA9PiByb290LmlkKSxcblx0XHRcdHNlY29uZElkczogc2Vjb25kLm1hcChyb290ID0+IHJvb3QuaWQpLFxuXHRcdFx0dmVyc2lvbmVkOiBmaXJzdC5ldmVyeShyb290ID0+IC9eY29kZXgtc2VsZWN0ZWQtY2FwYWJpbGl0eS1yb290LXYxLVswLTlhLWZdezY0fSQvLnRlc3Qocm9vdC5pZCkpLFxuXHRcdFx0ZGlzdGluY3RDb252ZW50aW9uczogZmlyc3RbMF0uaWQgIT09IGZpcnN0WzFdLmlkLFxuXHRcdFx0ZGlzdGluY3RSb290czogZmlyc3RbMF0uaWQgIT09IGRpc3RpbmN0Um9vdFswXS5pZCxcblx0XHR9LCB7XG5cdFx0XHRmaXJzdElkczogc2Vjb25kLm1hcChyb290ID0+IHJvb3QuaWQpLFxuXHRcdFx0c2Vjb25kSWRzOiBzZWNvbmQubWFwKHJvb3QgPT4gcm9vdC5pZCksXG5cdFx0XHR2ZXJzaW9uZWQ6IHRydWUsXG5cdFx0XHRkaXN0aW5jdENvbnZlbnRpb25zOiB0cnVlLFxuXHRcdFx0ZGlzdGluY3RSb290czogdHJ1ZSxcblx0XHR9KTtcblx0fSk7XG59KTtcbiJdLAogICJtYXBwaW5ncyI6ICJBQUtBLE9BQU8sWUFBWTtBQUNuQixTQUFTLGdCQUFnQjtBQUN6QixTQUFTLHVCQUF1QjtBQUNoQyxTQUFTLGVBQWU7QUFDeEIsU0FBUyxXQUFXO0FBQ3BCLFNBQVMsZUFBZTtBQUN4QixTQUFTLFdBQVc7QUFDcEIsU0FBUywrQ0FBK0M7QUFDeEQsU0FBUyxtQkFBbUI7QUFDNUIsU0FBUyxrQ0FBa0M7QUFDM0MsU0FBUyxzQkFBc0I7QUFDL0IsU0FBUyx5QkFBeUI7QUFDbEMsU0FBUyx3QkFBd0IsdUNBQXVDLHlCQUF5QixvQ0FBb0M7QUFNckksTUFBTSx1QkFBdUIsTUFBTTtBQUVsQyxRQUFNLGNBQWMsSUFBSSxnQkFBZ0I7QUFDeEMsV0FBUyxNQUFNLFlBQVksTUFBTSxDQUFDO0FBRWxDLDBDQUF3QztBQUV4QyxRQUFNLFFBQVEsQ0FBQyxNQUFjLE9BQW1CLE1BQWMsVUFBVSxVQUN0RSxFQUFFLE1BQU0sYUFBYSxHQUFHLElBQUksU0FBUyxNQUFNLE9BQU8sUUFBUTtBQUU1RCxRQUFNLGlCQUFpQixJQUFJLGFBQ3pCLEVBQUUsTUFBTSxRQUFRLElBQUksUUFBTSxFQUFFLEtBQUssRUFBRSxLQUFLLFFBQVEsRUFBRSxRQUFRLFFBQVEsQ0FBQyxFQUFFLEVBQUUsRUFBRTtBQUUzRSxRQUFNLE9BQU8sQ0FBQyxLQUFhLFdBQXNDLFlBQW9CLGVBQWUsR0FBRyxVQUFVLFVBQy9HLEVBQUUsS0FBSyxXQUFXLGFBQWEsV0FBVyxTQUFTLE1BQU0sU0FBUyxXQUFXLFlBQVksSUFBSSxlQUFlLE1BQU0sd0JBQXdCLE1BQU0sWUFBWSxRQUFRLFdBQVcsVUFBVSxNQUFNLGNBQWMsT0FBTyxZQUFZLEdBQUcsU0FBUyxXQUFXLE9BQU8sYUFBYSxLQUFLLGFBQWEsVUFBVTtBQUV6UyxPQUFLLHlFQUF5RSxZQUFZO0FBQ3pGLFVBQU0sY0FBYyxZQUFZLElBQUksSUFBSSxZQUFZLElBQUksZUFBZSxDQUFDLENBQUM7QUFDekUsZ0JBQVksSUFBSSxZQUFZLGlCQUFpQixRQUFRLFVBQVUsWUFBWSxJQUFJLElBQUksMkJBQTJCLENBQUMsQ0FBQyxDQUFDO0FBQ2pILFVBQU0sWUFBWSxJQUFJLEtBQUssRUFBRSxRQUFRLFFBQVEsVUFBVSxNQUFNLGFBQWEsQ0FBQztBQUMzRSxVQUFNLGtCQUFrQixJQUFJLFNBQVMsV0FBVyxXQUFXLFFBQVE7QUFDbkUsVUFBTSxRQUFRLElBQUksU0FBUyxpQkFBaUIsbUJBQW1CO0FBQy9ELFVBQU0sWUFBWSxhQUFhLGVBQWU7QUFDOUMsVUFBTSxRQUFRLElBQUk7QUFBQSxNQUNqQixZQUFZLFVBQVUsT0FBTyxTQUFTLFdBQVcseUxBQXlMLENBQUM7QUFBQSxNQUMzTyxZQUFZLFVBQVUsSUFBSSxTQUFTLGlCQUFpQixXQUFXLEdBQUcsU0FBUyxXQUFXLCtDQUErQyxDQUFDO0FBQUEsSUFDdkksQ0FBQztBQUVELFVBQU0sYUFBYSxNQUFNLDZCQUE2QixDQUFDLFNBQVMsR0FBRyxXQUFXO0FBRTlFLFdBQU8sZ0JBQWdCO0FBQUEsTUFDdEIsUUFBUSxXQUFXLE9BQU8sSUFBSSxXQUFTLEVBQUUsTUFBTSxLQUFLLE1BQU0sS0FBSyxLQUFLLElBQUksU0FBUyxHQUFHLGdCQUFnQixLQUFLLDJCQUEyQixLQUFLLEVBQUU7QUFBQSxNQUMzSSxZQUFZLFdBQVcsV0FBVyxJQUFJLGdCQUFjO0FBQUEsUUFDbkQsS0FBSyxVQUFVO0FBQUEsUUFDZixVQUFVLFVBQVU7QUFBQSxRQUNwQixVQUFVLFVBQVU7QUFBQSxRQUNwQixVQUFVLFVBQVUsVUFBVSxJQUFJLFlBQVUsRUFBRSxNQUFNLE1BQU0sTUFBTSxLQUFLLE1BQU0sS0FBSyxPQUFPLE1BQU0sU0FBUyxrQkFBa0IsUUFBUSxNQUFNLFFBQVEsUUFBVyxPQUFPLE1BQU0sU0FBUyxrQkFBa0IsUUFBUSxNQUFNLFFBQVEsT0FBVSxFQUFFO0FBQUEsTUFDcE8sRUFBRTtBQUFBLElBQ0gsR0FBRztBQUFBLE1BQ0YsUUFBUSxDQUFDLEVBQUUsTUFBTSxZQUFZLEtBQUssTUFBTSxTQUFTLEdBQUcsZ0JBQWdCLEtBQUssQ0FBQztBQUFBLE1BQzFFLFlBQVksQ0FBQztBQUFBLFFBQ1osS0FBSyxnQkFBZ0IsU0FBUztBQUFBLFFBQzlCLFVBQVUsa0JBQWtCO0FBQUEsUUFDNUIsVUFBVTtBQUFBLFFBQ1YsVUFBVSxDQUFDLEVBQUUsTUFBTSxZQUFZLEtBQUssTUFBTSxTQUFTLEdBQUcsT0FBTyxhQUFhLE9BQU8sQ0FBQyxhQUFhLFFBQVEsRUFBRSxDQUFDO0FBQUEsTUFDM0csQ0FBQztBQUFBLElBQ0YsQ0FBQztBQUFBLEVBQ0YsQ0FBQztBQUVELE9BQUssb0VBQW9FLFlBQVk7QUFDcEYsVUFBTSxjQUFjLFlBQVksSUFBSSxJQUFJLFlBQVksSUFBSSxlQUFlLENBQUMsQ0FBQztBQUN6RSxnQkFBWSxJQUFJLFlBQVksaUJBQWlCLFFBQVEsVUFBVSxZQUFZLElBQUksSUFBSSwyQkFBMkIsQ0FBQyxDQUFDLENBQUM7QUFDakgsVUFBTSxtQkFBbUIsSUFBSSxLQUFLLEVBQUUsUUFBUSxRQUFRLFVBQVUsTUFBTSxXQUFXLENBQUM7QUFDaEYsVUFBTSxxQkFBcUIsSUFBSSxLQUFLLEVBQUUsUUFBUSxRQUFRLFVBQVUsTUFBTSxhQUFhLENBQUM7QUFDcEYsVUFBTSxtQkFBbUIsSUFBSSxTQUFTLGtCQUFrQixXQUFXLFFBQVE7QUFDM0UsVUFBTSxxQkFBcUIsSUFBSSxTQUFTLG9CQUFvQixXQUFXLFFBQVE7QUFDL0UsVUFBTSxlQUFlLElBQUksU0FBUyxrQkFBa0IsbUJBQW1CO0FBQ3ZFLFVBQU0saUJBQWlCLElBQUksU0FBUyxvQkFBb0IsbUJBQW1CO0FBQzNFLFVBQU0scUJBQXFCLElBQUksU0FBUyxvQkFBb0Isb0JBQW9CO0FBQ2hGLFVBQU0sUUFBUSxJQUFJO0FBQUEsTUFDakIsWUFBWSxhQUFhLGdCQUFnQjtBQUFBLE1BQ3pDLFlBQVksYUFBYSxrQkFBa0I7QUFBQSxJQUM1QyxDQUFDO0FBQ0QsVUFBTSxRQUFRLElBQUk7QUFBQSxNQUNqQixZQUFZLFVBQVUsY0FBYyxTQUFTLFdBQVcsMEVBQTBFLENBQUM7QUFBQSxNQUNuSSxZQUFZLFVBQVUsZ0JBQWdCLFNBQVMsV0FBVyw0REFBNEQsQ0FBQztBQUFBLE1BQ3ZILFlBQVksVUFBVSxvQkFBb0IsU0FBUyxXQUFXLDRFQUE0RSxDQUFDO0FBQUEsSUFDNUksQ0FBQztBQUVELFVBQU0sYUFBYSxNQUFNLDZCQUE2QixDQUFDLGtCQUFrQixvQkFBb0IsZ0JBQWdCLEdBQUcsV0FBVztBQUUzSCxXQUFPLGdCQUFnQjtBQUFBLE1BQ3RCLFFBQVEsV0FBVyxPQUFPLElBQUksWUFBVSxFQUFFLE1BQU0sTUFBTSxNQUFNLEtBQUssTUFBTSxJQUFJLFNBQVMsRUFBRSxFQUFFO0FBQUEsTUFDeEYsWUFBWSxXQUFXLFdBQVcsSUFBSSxnQkFBYztBQUFBLFFBQ25ELEtBQUssVUFBVTtBQUFBLFFBQ2YsVUFBVSxVQUFVLFVBQVUsSUFBSSxZQUFVLEVBQUUsTUFBTSxNQUFNLE1BQU0sS0FBSyxNQUFNLElBQUksRUFBRTtBQUFBLE1BQ2xGLEVBQUU7QUFBQSxJQUNILEdBQUc7QUFBQSxNQUNGLFFBQVE7QUFBQSxRQUNQLEVBQUUsTUFBTSxtQkFBbUIsS0FBSyxhQUFhLFNBQVMsRUFBRTtBQUFBLFFBQ3hELEVBQUUsTUFBTSxtQkFBbUIsS0FBSyxtQkFBbUIsU0FBUyxFQUFFO0FBQUEsTUFDL0Q7QUFBQSxNQUNBLFlBQVk7QUFBQSxRQUNYLEVBQUUsS0FBSyxpQkFBaUIsU0FBUyxHQUFHLFVBQVUsQ0FBQyxFQUFFLE1BQU0sbUJBQW1CLEtBQUssYUFBYSxTQUFTLEVBQUUsQ0FBQyxFQUFFO0FBQUEsUUFDMUcsRUFBRSxLQUFLLG1CQUFtQixTQUFTLEdBQUcsVUFBVSxDQUFDLEVBQUUsTUFBTSxtQkFBbUIsS0FBSyxtQkFBbUIsU0FBUyxFQUFFLENBQUMsRUFBRTtBQUFBLE1BQ25IO0FBQUEsSUFDRCxDQUFDO0FBQUEsRUFDRixDQUFDO0FBRUQsT0FBSyxvRUFBb0UsTUFBTTtBQUM5RSxVQUFNLGFBQWEsd0JBQXdCLGVBQWU7QUFBQSxNQUN6RCxLQUFLO0FBQUEsTUFDTCxRQUFRO0FBQUEsUUFDUCxNQUFNLFFBQVEsUUFBUSxvQ0FBb0M7QUFBQSxRQUMxRCxNQUFNLFNBQVMsUUFBUSxxQ0FBcUM7QUFBQSxRQUM1RCxNQUFNLFNBQVMsUUFBUSx1Q0FBdUMsS0FBSztBQUFBLE1BQ3BFO0FBQUEsSUFDRCxDQUFDLENBQUM7QUFDRixXQUFPLGdCQUFnQixXQUFXLElBQUksUUFBTTtBQUFBLE1BQzNDLE1BQU0sRUFBRTtBQUFBLE1BQ1IsVUFBVSxFQUFFO0FBQUEsTUFDWixVQUFVLEVBQUU7QUFBQSxNQUNaLFVBQVUsRUFBRSxVQUFVLElBQUksU0FBTyxFQUFFLE1BQU0sR0FBRyxNQUFNLE1BQU0sR0FBRyxNQUFNLFNBQVUsR0FBNkIsUUFBUSxFQUFFO0FBQUEsSUFDbkgsRUFBRSxHQUFHO0FBQUEsTUFDSjtBQUFBLFFBQ0MsTUFBTTtBQUFBLFFBQWMsVUFBVSxrQkFBa0I7QUFBQSxRQUFPLFVBQVU7QUFBQSxRQUNqRSxVQUFVO0FBQUEsVUFDVCxFQUFFLE1BQU0sa0JBQWtCLE9BQU8sTUFBTSxTQUFTLFNBQVMsS0FBSztBQUFBLFVBQzlELEVBQUUsTUFBTSxrQkFBa0IsT0FBTyxNQUFNLFFBQVEsU0FBUyxLQUFLO0FBQUEsUUFDOUQ7QUFBQSxNQUNEO0FBQUEsTUFDQTtBQUFBLFFBQ0MsTUFBTTtBQUFBLFFBQVEsVUFBVSxrQkFBa0I7QUFBQSxRQUFPLFVBQVU7QUFBQSxRQUMzRCxVQUFVLENBQUMsRUFBRSxNQUFNLGtCQUFrQixPQUFPLE1BQU0sU0FBUyxTQUFTLE1BQU0sQ0FBQztBQUFBLE1BQzVFO0FBQUEsSUFDRCxDQUFDO0FBQUEsRUFDRixDQUFDO0FBRUQsT0FBSyxzRkFBc0YsTUFBTTtBQUNoRyxVQUFNLE1BQU0sTUFBTSxVQUFVLFFBQVEsc0NBQXNDO0FBQzFFLFVBQU0sYUFBYSx3QkFBd0I7QUFBQSxNQUMxQyxFQUFFLEtBQUssTUFBTSxRQUFRLENBQUMsS0FBSyxNQUFNLE9BQU8sVUFBVSx3QkFBd0IsQ0FBQyxFQUFFO0FBQUEsTUFDN0UsRUFBRSxLQUFLLE1BQU0sUUFBUSxDQUFDLEdBQUcsRUFBRTtBQUFBLElBQzVCLENBQUM7QUFDRCxXQUFPLGdCQUFnQixXQUFXLElBQUksT0FBSyxDQUFDLEVBQUUsTUFBTSxFQUFFLFVBQVUsTUFBTSxDQUFDLEdBQUcsQ0FBQyxDQUFDLFFBQVEsQ0FBQyxHQUFHLENBQUMsWUFBWSxDQUFDLENBQUMsQ0FBQztBQUFBLEVBQ3pHLENBQUM7QUFFRCxPQUFLLGtEQUFrRCxNQUFNO0FBQzVELFVBQU0sQ0FBQyxTQUFTLElBQUksd0JBQXdCLGVBQWUsRUFBRSxLQUFLLE1BQU0sUUFBUSxDQUFDLE1BQU0sS0FBSyxRQUFRLDhCQUE4QixDQUFDLEVBQUUsQ0FBQyxDQUFDO0FBQ3ZJLFVBQU0sUUFBUSxVQUFVLFNBQVUsQ0FBQztBQUNuQyxXQUFPLGdCQUFnQixFQUFFLGVBQWUsTUFBTSxJQUFJLFNBQVMsRUFBRSxXQUFXLFNBQVMsR0FBRyxRQUFRLE1BQU0sT0FBTyx3QkFBd0IsZUFBZSxFQUFFLEtBQUssTUFBTSxRQUFRLENBQUMsTUFBTSxLQUFLLFFBQVEsOEJBQThCLENBQUMsRUFBRSxDQUFDLENBQUMsRUFBRSxDQUFDLEVBQUUsU0FBVSxDQUFDLEVBQUUsR0FBRyxHQUFHLEVBQUUsZUFBZSxNQUFNLFFBQVEsS0FBSyxDQUFDO0FBQUEsRUFDMVIsQ0FBQztBQUVELE9BQUssMERBQTBELE1BQU07QUFDcEUsV0FBTyxnQkFBZ0IsQ0FBQyx3QkFBd0IsTUFBUyxHQUFHLHdCQUF3QixlQUFlLENBQUMsR0FBRyx3QkFBd0IsZUFBZSxFQUFFLEtBQUssTUFBTSxRQUFRLENBQUMsRUFBRSxDQUFDLENBQUMsQ0FBQyxHQUFHLENBQUMsQ0FBQyxHQUFHLENBQUMsR0FBRyxDQUFDLENBQUMsQ0FBQztBQUFBLEVBQ3pMLENBQUM7QUFFRCxPQUFLLHNGQUFzRixNQUFNO0FBQ2hHLFVBQU0sYUFBYSx1QkFBdUI7QUFBQSxNQUN6QyxNQUFNLENBQUM7QUFBQSxRQUNOLEtBQUs7QUFBQSxRQUNMLE9BQU87QUFBQSxVQUNOLEtBQUssTUFBTSxlQUFlLDRCQUE0QixDQUFDO0FBQUEsVUFDdkQsS0FBSyxNQUFNLGNBQWMsNEJBQTRCLEdBQUcsS0FBSztBQUFBLFVBQzdELEtBQUssTUFBTSxjQUFjLDRCQUE0QixDQUFDO0FBQUEsUUFDdkQ7QUFBQSxRQUNBLFVBQVUsQ0FBQztBQUFBLFFBQ1gsUUFBUSxDQUFDO0FBQUEsTUFDVixDQUFDO0FBQUEsSUFDRixDQUFDO0FBQ0QsV0FBTyxnQkFBZ0IsV0FBVyxJQUFJLFFBQU07QUFBQSxNQUMzQyxNQUFNLEVBQUU7QUFBQSxNQUFNLFVBQVUsRUFBRTtBQUFBLE1BQVUsVUFBVSxFQUFFO0FBQUEsTUFDaEQsVUFBVSxFQUFFLFVBQVUsSUFBSSxTQUFPLEVBQUUsTUFBTSxHQUFHLE1BQU0sTUFBTSxHQUFHLE1BQU0sU0FBVSxHQUE2QixRQUFRLEVBQUU7QUFBQSxJQUNuSCxFQUFFLEdBQUcsQ0FBQztBQUFBLE1BQ0wsTUFBTTtBQUFBLE1BQVMsVUFBVSxrQkFBa0I7QUFBQSxNQUFNLFVBQVU7QUFBQSxNQUMzRCxVQUFVO0FBQUEsUUFDVCxFQUFFLE1BQU0sa0JBQWtCLE1BQU0sTUFBTSxjQUFjLFNBQVMsTUFBTTtBQUFBLFFBQ25FLEVBQUUsTUFBTSxrQkFBa0IsTUFBTSxNQUFNLGVBQWUsU0FBUyxLQUFLO0FBQUEsTUFDcEU7QUFBQSxJQUNELENBQUMsQ0FBQztBQUFBLEVBQ0gsQ0FBQztBQUVELE9BQUsseURBQXlELE1BQU07QUFDbkUsV0FBTyxnQkFBZ0IsQ0FBQyx1QkFBdUIsTUFBUyxHQUFHLHVCQUF1QixFQUFFLE1BQU0sQ0FBQyxFQUFFLENBQUMsR0FBRyx1QkFBdUIsRUFBRSxNQUFNLENBQUMsRUFBRSxLQUFLLE1BQU0sT0FBTyxDQUFDLEdBQUcsVUFBVSxDQUFDLEdBQUcsUUFBUSxDQUFDLEVBQUUsQ0FBQyxFQUFFLENBQUMsQ0FBQyxHQUFHLENBQUMsQ0FBQyxHQUFHLENBQUMsR0FBRyxDQUFDLENBQUMsQ0FBQztBQUFBLEVBQ3ZNLENBQUM7QUFFRCxPQUFLLDhEQUE4RCxNQUFNO0FBQ3hFLFVBQU0sUUFBUSxJQUFJLEtBQUssY0FBYztBQUNyQyxVQUFNLFFBQVEsSUFBSSxLQUFLLGNBQWM7QUFDckMsVUFBTSxRQUFRLElBQUksS0FBSyxjQUFjO0FBRXJDLFdBQU87QUFBQSxNQUNOLHNDQUFzQyxDQUFDLE9BQU8sT0FBTyxLQUFLLENBQUMsRUFBRSxJQUFJLFVBQVEsS0FBSyxTQUFTLElBQUk7QUFBQSxNQUMzRjtBQUFBLFFBQ0MsSUFBSSxTQUFTLE9BQU8sV0FBVyxRQUFRLEVBQUU7QUFBQSxRQUN6QyxJQUFJLFNBQVMsT0FBTyxVQUFVLFFBQVEsRUFBRTtBQUFBLFFBQ3hDLElBQUksU0FBUyxPQUFPLFdBQVcsUUFBUSxFQUFFO0FBQUEsUUFDekMsSUFBSSxTQUFTLE9BQU8sVUFBVSxRQUFRLEVBQUU7QUFBQSxNQUN6QztBQUFBLElBQ0Q7QUFBQSxFQUNELENBQUM7QUFFRCxPQUFLLDZEQUE2RCxNQUFNO0FBQ3ZFLFVBQU0sUUFBUSxJQUFJLEtBQUssY0FBYztBQUNyQyxVQUFNLFFBQVEsSUFBSSxLQUFLLGNBQWM7QUFDckMsVUFBTSxvQkFBb0IsSUFBSSxLQUFLLEdBQUcsTUFBTSxNQUFNLEdBQUcsR0FBRyxFQUFFO0FBQzFELFVBQU0sYUFBYSxJQUFJLEtBQUssR0FBRyxNQUFNLE1BQU0sR0FBRyxHQUFHLEVBQUU7QUFDbkQsVUFBTSxlQUFlLElBQUksS0FBSyxNQUFNLE9BQU8sWUFBWSxDQUFDO0FBQ3hELFVBQU0sZUFBZSxJQUFJLEtBQUssTUFBTSxPQUFPLFlBQVksQ0FBQztBQUV4RCxVQUFNLGFBQWEsc0NBQXNDO0FBQUEsTUFDeEQ7QUFBQSxNQUNBO0FBQUEsTUFDQSxHQUFJLENBQUMsVUFBVSxDQUFDLFlBQVksSUFBSSxDQUFDO0FBQUEsTUFDakM7QUFBQSxNQUNBO0FBQUEsTUFDQSxHQUFJLENBQUMsVUFBVSxDQUFDLFlBQVksSUFBSSxDQUFDO0FBQUEsSUFDbEMsQ0FBQztBQUVELFdBQU8sZ0JBQWdCLFdBQVcsSUFBSSxVQUFRLEtBQUssU0FBUyxJQUFJLEdBQUc7QUFBQSxNQUNsRSxJQUFJLFNBQVMsT0FBTyxXQUFXLFFBQVEsRUFBRTtBQUFBLE1BQ3pDLElBQUksU0FBUyxPQUFPLFVBQVUsUUFBUSxFQUFFO0FBQUEsSUFDekMsQ0FBQztBQUFBLEVBQ0YsQ0FBQztBQUVELE9BQUssb0NBQW9DLE1BQU07QUFDOUMsVUFBTSxRQUFRLElBQUksS0FBSyxjQUFjO0FBRXJDLFdBQU8sZ0JBQWdCLHNDQUFzQztBQUFBLE1BQzVEO0FBQUEsTUFDQSxJQUFJLEtBQUssRUFBRSxRQUFRLFFBQVEsY0FBYyxXQUFXLFFBQVEsTUFBTSxlQUFlLENBQUM7QUFBQSxJQUNuRixDQUFDLEdBQUcsQ0FBQyxDQUFDO0FBQUEsRUFDUCxDQUFDO0FBRUQsT0FBSywrRUFBK0UsTUFBTTtBQUN6RixVQUFNLFFBQVEsSUFBSSxLQUFLLGNBQWM7QUFDckMsVUFBTSxRQUFRLElBQUksS0FBSyxjQUFjO0FBQ3JDLFVBQU0sUUFBUSxJQUFJLEtBQUssY0FBYztBQUNyQyxVQUFNLFFBQVEsc0NBQXNDLENBQUMsT0FBTyxLQUFLLENBQUM7QUFDbEUsVUFBTSxTQUFTLHNDQUFzQyxDQUFDLE9BQU8sSUFBSSxLQUFLLEdBQUcsTUFBTSxNQUFNLEdBQUcsR0FBRyxFQUFFLENBQUMsQ0FBQztBQUMvRixVQUFNLGVBQWUsc0NBQXNDLENBQUMsT0FBTyxLQUFLLENBQUM7QUFFekUsV0FBTyxnQkFBZ0I7QUFBQSxNQUN0QixVQUFVLE1BQU0sSUFBSSxVQUFRLEtBQUssRUFBRTtBQUFBLE1BQ25DLFdBQVcsT0FBTyxJQUFJLFVBQVEsS0FBSyxFQUFFO0FBQUEsTUFDckMsV0FBVyxNQUFNLE1BQU0sVUFBUSxtREFBbUQsS0FBSyxLQUFLLEVBQUUsQ0FBQztBQUFBLE1BQy9GLHFCQUFxQixNQUFNLENBQUMsRUFBRSxPQUFPLE1BQU0sQ0FBQyxFQUFFO0FBQUEsTUFDOUMsZUFBZSxNQUFNLENBQUMsRUFBRSxPQUFPLGFBQWEsQ0FBQyxFQUFFO0FBQUEsSUFDaEQsR0FBRztBQUFBLE1BQ0YsVUFBVSxPQUFPLElBQUksVUFBUSxLQUFLLEVBQUU7QUFBQSxNQUNwQyxXQUFXLE9BQU8sSUFBSSxVQUFRLEtBQUssRUFBRTtBQUFBLE1BQ3JDLFdBQVc7QUFBQSxNQUNYLHFCQUFxQjtBQUFBLE1BQ3JCLGVBQWU7QUFBQSxJQUNoQixDQUFDO0FBQUEsRUFDRixDQUFDO0FBQ0YsQ0FBQzsiLAogICJuYW1lcyI6IFtdCn0K
