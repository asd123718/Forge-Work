import assert from "assert";
import { DeferredPromise, raceTimeout, timeout } from "../../../../base/common/async.js";
import { VSBuffer } from "../../../../base/common/buffer.js";
import { CancellationToken, CancellationTokenSource } from "../../../../base/common/cancellation.js";
import { DisposableStore } from "../../../../base/common/lifecycle.js";
import { Schemas } from "../../../../base/common/network.js";
import { URI } from "../../../../base/common/uri.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../base/test/common/utils.js";
import { FileService } from "../../../files/common/fileService.js";
import { IFileService } from "../../../files/common/files.js";
import { InMemoryFileSystemProvider } from "../../../files/common/inMemoryFilesystemProvider.js";
import { TestInstantiationService } from "../../../instantiation/test/common/instantiationServiceMock.js";
import { ILogService, NullLogService } from "../../../log/common/log.js";
import { IAgentPluginManager } from "../../common/agentPluginManager.js";
import { DiscoveredType, SessionCustomizationDiscovery } from "../../node/copilot/sessionCustomizationDiscovery.js";
import { SessionPluginBundler } from "../../node/shared/sessionPluginBundler.js";
import { mapToParsedPlugin, toDiscoveredDirectoryCustomizations } from "../../node/copilot/copilotAgent.js";
suite("SessionCustomizationDiscovery", () => {
  const disposables = new DisposableStore();
  let fileService;
  let instantiationService;
  let workspace;
  let userHome;
  let pluginBasePath;
  setup(() => {
    fileService = disposables.add(new FileService(new NullLogService()));
    const memFs = disposables.add(new InMemoryFileSystemProvider());
    disposables.add(fileService.registerProvider(Schemas.inMemory, memFs));
    instantiationService = disposables.add(new TestInstantiationService());
    instantiationService.stub(IFileService, fileService);
    instantiationService.stub(ILogService, new NullLogService());
    workspace = URI.from({ scheme: Schemas.inMemory, path: "/workspace" });
    userHome = URI.from({ scheme: Schemas.inMemory, path: "/home" });
    pluginBasePath = URI.from({ scheme: Schemas.inMemory, path: "/agentPlugins" });
    instantiationService.stub(IAgentPluginManager, { basePath: pluginBasePath });
  });
  teardown(() => {
    disposables.clear();
  });
  ensureNoDisposablesAreLeakedInTestSuite();
  async function seed(path, content = "") {
    const uri = URI.from({ scheme: Schemas.inMemory, path });
    await fileService.writeFile(uri, VSBuffer.fromString(content));
    return uri;
  }
  const inMemoryPathToUri = (path) => URI.from({ scheme: Schemas.inMemory, path: path.replace(/\\/g, "/") });
  test("discovers supported agent instruction files in workspace roots", async () => {
    const wsCopilotInstructions = await seed("/workspace/.github/copilot-instructions.md", "workspace copilot instructions");
    const wsGeminiInstructions = await seed("/workspace/GEMINI.md", "workspace gemini instructions");
    const discovery = disposables.add(instantiationService.createInstance(SessionCustomizationDiscovery, [workspace], userHome, URI.file));
    const files = (await discovery.scan(CancellationToken.None)).flatMap((directory) => directory.files.map((file) => ({ uri: file.uri, type: directory.type }))).filter((entry) => entry.type === DiscoveredType.AgentInstruction).map((entry) => entry.uri.toString()).sort((a, b) => a.localeCompare(b));
    assert.deepStrictEqual(files, [
      wsCopilotInstructions.toString(),
      wsGeminiInstructions.toString()
    ].sort((a, b) => a.localeCompare(b)));
  });
  test("groups discovered customizations by parent folder", async () => {
    const discovery = disposables.add(instantiationService.createInstance(SessionCustomizationDiscovery, [workspace], userHome, inMemoryPathToUri));
    const client = {
      rpc: {
        agents: {
          discover: async () => ({
            agents: [
              { id: "one", name: "One", description: "", path: "/workspace/.github/agents/one.agent.md", userInvocable: false },
              { id: "two", name: "Two", description: "", path: "/workspace/.github/agents/two.agent.md", userInvocable: true },
              { id: "three", name: "Three", description: "", path: "/workspace/.github/other/three.agent.md", userInvocable: false }
            ]
          })
        },
        instructions: { discover: async () => ({ sources: [] }) },
        skills: { discover: async () => ({ skills: [] }) }
      }
    };
    const customizations = await discovery.discover(client, CancellationToken.None);
    const agentDirectories = customizations.filter((customization) => customization.contents === "agent");
    const getPath = (uri) => URI.parse(uri).path;
    assert.strictEqual(agentDirectories.length, 2);
    assert.deepStrictEqual(agentDirectories.map((customization) => getPath(customization.uri)).sort(), [
      "/workspace/.github/agents",
      "/workspace/.github/other"
    ]);
    const agentsInAgentsDir = agentDirectories.find((customization) => getPath(customization.uri) === "/workspace/.github/agents");
    assert.ok(agentsInAgentsDir);
    assert.deepStrictEqual(agentsInAgentsDir.children?.map((child) => getPath(child.uri)).sort(), [
      "/workspace/.github/agents/one.agent.md",
      "/workspace/.github/agents/two.agent.md"
    ]);
  });
  test("discover includes hooks from recursive and fixed hook locations", async () => {
    await seed("/workspace/.github/hooks/pre-tool.json", '{"PreToolUse": []}');
    await seed("/workspace/.github/copilot/settings.json", '{"hooks": {"PreToolUse": []}}');
    const discovery = disposables.add(instantiationService.createInstance(SessionCustomizationDiscovery, [workspace], userHome, inMemoryPathToUri));
    const client = {
      rpc: {
        agents: {
          getDiscoveryPaths: async () => ({ paths: [] }),
          discover: async () => ({ agents: [] })
        },
        instructions: {
          getDiscoveryPaths: async () => ({ paths: [] }),
          discover: async () => ({ sources: [] })
        },
        skills: {
          getDiscoveryPaths: async () => ({ paths: [] }),
          discover: async () => ({ skills: [] })
        }
      }
    };
    const customizations = await discovery.discover(client, CancellationToken.None);
    const hookDirectories = customizations.filter((customization) => customization.contents === "hook").map((customization) => ({
      uri: URI.parse(customization.uri).path,
      children: (customization.children ?? []).map((child) => URI.parse(child.uri).path).sort()
    })).sort((a, b) => a.uri.localeCompare(b.uri));
    assert.deepStrictEqual(hookDirectories, [
      { uri: "/home/.copilot/hooks", children: [] },
      { uri: "/workspace/.github/copilot", children: ["/workspace/.github/copilot/settings.json"] },
      { uri: "/workspace/.github/hooks", children: ["/workspace/.github/hooks/pre-tool.json"] }
    ]);
  });
  test("marks agent instruction rule sources as always apply", async () => {
    await seed("/workspace/AGENTS.md", "workspace agents instructions");
    await seed("/workspace/.github/instructions/rule.instructions.md", "scoped instruction");
    const discovery = disposables.add(instantiationService.createInstance(SessionCustomizationDiscovery, [workspace], userHome, inMemoryPathToUri));
    const client = {
      rpc: {
        agents: {
          getDiscoveryPaths: async () => ({ paths: [] }),
          discover: async () => ({ agents: [] })
        },
        instructions: {
          getDiscoveryPaths: async () => ({
            paths: [
              { path: "/workspace/.github/instructions", kind: "directory" },
              { path: "/workspace/AGENTS.md", kind: "file" }
            ]
          }),
          discover: async () => ({
            sources: [
              { id: "agentInstruction", label: "AGENTS.md", sourcePath: "/workspace/AGENTS.md", applyTo: [], type: "repo" },
              { id: "scopedInstruction", label: "Rule", sourcePath: "/workspace/.github/instructions/rule.instructions.md", applyTo: ["src/**"], type: "child-instructions" }
            ]
          })
        },
        skills: {
          getDiscoveryPaths: async () => ({ paths: [] }),
          discover: async () => ({ skills: [] })
        }
      }
    };
    const customizations = await discovery.discover(client, CancellationToken.None);
    const rules = customizations.filter((customization) => customization.contents === "rule").flatMap((customization) => customization.children ?? []).map((child) => ({
      uri: URI.parse(child.uri).path,
      alwaysApply: child.type === "rule" ? child.alwaysApply : void 0
    })).sort((a, b) => a.uri.localeCompare(b.uri));
    assert.deepStrictEqual(rules, [
      { uri: "/workspace/.github/instructions/rule.instructions.md", alwaysApply: false },
      { uri: "/workspace/AGENTS.md", alwaysApply: true }
    ]);
  });
  test("drops missing agent instruction files and empty agent instruction directories", async () => {
    await seed("/workspace/.github/instructions/rule.instructions.md", "scoped instruction");
    const discovery = disposables.add(instantiationService.createInstance(SessionCustomizationDiscovery, [workspace], userHome, inMemoryPathToUri));
    const client = {
      rpc: {
        agents: {
          getDiscoveryPaths: async () => ({ paths: [] }),
          discover: async () => ({ agents: [] })
        },
        instructions: {
          getDiscoveryPaths: async () => ({
            paths: [
              { path: "/workspace/.github/instructions", kind: "directory" },
              { path: "/workspace/AGENTS.md", kind: "file" }
            ]
          }),
          discover: async () => ({
            sources: [
              { id: "agentInstruction", label: "AGENTS.md", sourcePath: "/workspace/AGENTS.md", applyTo: [], type: "repo" },
              { id: "scopedInstruction", label: "Rule", sourcePath: "/workspace/.github/instructions/rule.instructions.md", applyTo: ["src/**"], type: "child-instructions" }
            ]
          })
        },
        skills: {
          getDiscoveryPaths: async () => ({ paths: [] }),
          discover: async () => ({ skills: [] })
        }
      }
    };
    const customizations = await discovery.discover(client, CancellationToken.None);
    const ruleDirectories = customizations.filter((customization) => customization.contents === "rule").map((customization) => ({
      uri: URI.parse(customization.uri).path,
      children: (customization.children ?? []).map((child) => URI.parse(child.uri).path).sort()
    })).sort((a, b) => a.uri.localeCompare(b.uri));
    assert.deepStrictEqual(ruleDirectories, [
      { uri: "/workspace/.github/instructions", children: ["/workspace/.github/instructions/rule.instructions.md"] }
    ]);
  });
  test("discover returns working-directory agents, skills, instructions, hooks, and agent instructions", async () => {
    await seed("/workspace/.github/agents/foo.agent.md", "agent body");
    await seed("/workspace/.github/skills/bar/SKILL.md", "skill body");
    await seed("/workspace/.github/instructions/baz.instructions.md", "instruction body");
    await seed("/workspace/.github/hooks/pre-tool.json", '{"PreToolUse": []}');
    await seed("/workspace/.github/copilot/settings.json", '{"hooks": {"PreToolUse": []}}');
    await seed("/workspace/.github/copilot-instructions.md", "workspace copilot instructions");
    await seed("/workspace/AGENTS.md", "workspace agents instructions");
    await seed("/home/.copilot/copilot-instructions.md", "user copilot instructions");
    const discovery = disposables.add(instantiationService.createInstance(SessionCustomizationDiscovery, [workspace], userHome, inMemoryPathToUri));
    const client = {
      rpc: {
        agents: {
          getDiscoveryPaths: async () => ({ paths: [{ path: "/workspace/.github/agents" }] }),
          discover: async () => ({
            agents: [
              { id: "agent", name: "Agent", description: "agent description", path: "/workspace/.github/agents/foo.agent.md", userInvocable: true }
            ]
          })
        },
        instructions: {
          getDiscoveryPaths: async () => ({
            paths: [
              { path: "/workspace/.github/instructions", kind: "directory" },
              { path: "/workspace/.github/copilot-instructions.md", kind: "file" },
              { path: "/workspace/AGENTS.md", kind: "file" },
              { path: "/home/.copilot/copilot-instructions.md", kind: "file" }
            ]
          }),
          discover: async () => ({
            sources: [
              { id: "rule", label: "Rule", description: "rule description", sourcePath: "/workspace/.github/instructions/baz.instructions.md", applyTo: [] }
            ]
          })
        },
        skills: {
          getDiscoveryPaths: async () => ({ paths: [{ path: "/workspace/.github/skills" }] }),
          discover: async () => ({
            skills: [
              { name: "Skill", description: "skill description", path: "/workspace/.github/skills/bar/SKILL.md" }
            ]
          })
        }
      }
    };
    const customizations = await discovery.discover(client, CancellationToken.None);
    const directories = customizations.map((customization) => ({
      contents: customization.contents,
      uri: URI.parse(customization.uri).path,
      writable: customization.writable,
      children: (customization.children ?? []).map((child) => URI.parse(child.uri).path).sort()
    })).sort((a, b) => a.uri.localeCompare(b.uri));
    assert.deepStrictEqual(directories, [
      { contents: "rule", uri: "/home", writable: false, children: ["/home/.copilot/copilot-instructions.md"] },
      { contents: "hook", uri: "/home/.copilot/hooks", writable: true, children: [] },
      { contents: "rule", uri: "/workspace", writable: false, children: ["/workspace/.github/copilot-instructions.md", "/workspace/AGENTS.md"] },
      { contents: "agent", uri: "/workspace/.github/agents", writable: true, children: ["/workspace/.github/agents/foo.agent.md"] },
      { contents: "hook", uri: "/workspace/.github/copilot", writable: true, children: ["/workspace/.github/copilot/settings.json"] },
      { contents: "hook", uri: "/workspace/.github/hooks", writable: true, children: ["/workspace/.github/hooks/pre-tool.json"] },
      { contents: "rule", uri: "/workspace/.github/instructions", writable: true, children: ["/workspace/.github/instructions/baz.instructions.md"] },
      { contents: "skill", uri: "/workspace/.github/skills", writable: true, children: ["/workspace/.github/skills/bar/SKILL.md"] }
    ]);
  });
  test("discover groups case-variant instructions and nested skills under their roots", async () => {
    const caseVariantUserHome = URI.from({ scheme: Schemas.inMemory, path: "/HOME" });
    await seed("/home/.copilot/copilot-instructions.md", "user copilot instructions");
    await seed("/workspace/.github/skills/bar/SKILL.md", "skill body");
    const discovery = disposables.add(instantiationService.createInstance(SessionCustomizationDiscovery, [workspace], caseVariantUserHome, inMemoryPathToUri));
    const client = {
      rpc: {
        agents: {
          getDiscoveryPaths: async () => ({ paths: [] }),
          discover: async () => ({ agents: [] })
        },
        instructions: {
          getDiscoveryPaths: async () => ({ paths: [{ path: "/home/.copilot/copilot-instructions.md", kind: "file" }] }),
          discover: async () => ({ sources: [{ id: "userInstruction", label: "User instruction", sourcePath: "/home/.copilot/copilot-instructions.md", type: "home" }] })
        },
        skills: {
          getDiscoveryPaths: async () => ({
            paths: [
              { path: "/workspace/.github/skills" },
              { path: "/workspace/.github/skills/bar" }
            ]
          }),
          discover: async () => ({ skills: [{ name: "Skill", description: "skill description", path: "/workspace/.github/skills/bar/SKILL.md" }] })
        }
      }
    };
    const customizations = await discovery.discover(client, CancellationToken.None);
    const directories = customizations.filter((customization) => customization.contents === "rule" || customization.contents === "skill").map((customization) => ({
      contents: customization.contents,
      uri: URI.parse(customization.uri).path,
      children: (customization.children ?? []).map((child) => URI.parse(child.uri).path)
    }));
    assert.deepStrictEqual(directories, [
      { contents: "rule", uri: "/HOME", children: ["/home/.copilot/copilot-instructions.md"] },
      { contents: "skill", uri: "/workspace/.github/skills", children: ["/workspace/.github/skills/bar/SKILL.md"] }
    ]);
  });
  test("returns directories sorted by type and URI", async () => {
    await seed("/workspace/.github/agents/aaa.agent.md", "workspace agent a");
    await seed("/workspace/.github/agents/foo.agent.md", "workspace agent");
    await seed("/workspace/.github/skills/alpha/SKILL.md", "workspace skill alpha");
    await seed("/workspace/.github/skills/bar/SKILL.md", "workspace skill");
    await seed("/workspace/.github/instructions/alpha.instructions.md", "workspace instruction alpha");
    await seed("/workspace/.github/instructions/baz.instructions.md", "workspace instruction");
    await seed("/workspace/.github/copilot-instructions.md", "workspace copilot instructions");
    await seed("/home/.copilot/agents/abc.agent.md", "user agent abc");
    await seed("/home/.copilot/agents/qux.agent.md", "user agent");
    await seed("/home/.copilot/skills/alpha/SKILL.md", "user copilot skill");
    await seed("/home/.agents/skills/aaa/SKILL.md", "user skill aaa");
    await seed("/home/.agents/skills/zap/SKILL.md", "user skill");
    const discovery = disposables.add(instantiationService.createInstance(SessionCustomizationDiscovery, [workspace], userHome, URI.file));
    const directories = await discovery.scan(CancellationToken.None);
    const actual = directories.map((directory) => `${directory.type}:${directory.uri.toString()}`);
    const expected = [...actual].sort((a, b) => a < b ? -1 : a > b ? 1 : 0);
    assert.deepStrictEqual(actual, expected);
    for (const directory of directories) {
      const actualFiles = directory.files.map((file) => file.uri.toString());
      const expectedFiles = [...actualFiles].sort((a, b) => a < b ? -1 : a > b ? 1 : 0);
      assert.deepStrictEqual(actualFiles, expectedFiles);
    }
  });
  test("does not discover agent instruction files outside supported roots", async () => {
    await seed("/workspace/.github/copilot-instructions.md", "workspace copilot instructions");
    await seed("/workspace/docs/AGENTS.md", "unsupported root");
    await seed("/workspace/.claude/GEMINI.md", "unsupported filename in .claude");
    await seed("/home/copilot-instructions.md", "unsupported home root");
    const discovery = disposables.add(instantiationService.createInstance(SessionCustomizationDiscovery, [workspace], userHome, URI.file));
    const files = (await discovery.scan(CancellationToken.None)).flatMap((directory) => directory.files.map((file) => ({ uri: file.uri, type: directory.type }))).filter((entry) => entry.type === DiscoveredType.AgentInstruction).map((entry) => entry.uri.toString()).sort((a, b) => a.localeCompare(b));
    assert.deepStrictEqual(files, [
      URI.from({ scheme: Schemas.inMemory, path: "/workspace/.github/copilot-instructions.md" }).toString()
    ]);
  });
  test("installs watchers for roots that contain discovered customizations", async () => {
    await seed("/workspace/.github/agents/foo.agent.md", "workspace agent");
    await seed("/workspace/.github/skills/bar/SKILL.md", "workspace skill");
    await seed("/workspace/.github/instructions/rules.instructions.md", "workspace instruction");
    await seed("/workspace/.github/hooks/pre-tool.json", '{"PreToolUse": []}');
    await seed("/workspace/.github/copilot-instructions.md", "workspace copilot instructions");
    await seed("/workspace/.claude/CLAUDE.md", "workspace claude instruction");
    await seed("/home/.copilot/agents/user.agent.md", "user agent");
    await seed("/home/.copilot/skills/copilot-user-skill/SKILL.md", "user copilot skill");
    await seed("/home/.agents/skills/user-skill/SKILL.md", "user skill");
    await seed("/home/.copilot/instructions/user.instructions.md", "user instruction");
    await seed("/home/.copilot/hooks/post-tool.json", '{"PostToolUse": []}');
    await seed("/home/.copilot/copilot-instructions.md", "user copilot instructions");
    const watchCalls = [];
    const originalWatch = fileService.watch.bind(fileService);
    disposables.add({ dispose: () => {
      fileService.watch = originalWatch;
    } });
    fileService.watch = ((resource, options) => {
      watchCalls.push({ resource: resource.toString(), recursive: options?.recursive === true });
      return originalWatch(resource, options);
    });
    const discovery = disposables.add(instantiationService.createInstance(SessionCustomizationDiscovery, [workspace], userHome, URI.file));
    await discovery.scan(CancellationToken.None);
    const watched = /* @__PURE__ */ new Map();
    for (const call of watchCalls) {
      const previous = watched.get(call.resource);
      watched.set(call.resource, previous === true || call.recursive);
    }
    assert.strictEqual(watched.get(workspace.toString()), false);
    assert.strictEqual(watched.get(URI.joinPath(workspace, ".github").toString()), false);
    assert.strictEqual(watched.get(URI.joinPath(workspace, ".claude").toString()), false);
    assert.strictEqual(watched.get(URI.joinPath(workspace, ".github", "agents").toString()), false);
    assert.strictEqual(watched.get(URI.joinPath(workspace, ".github", "skills").toString()), true);
    assert.strictEqual(watched.get(URI.joinPath(workspace, ".github", "instructions").toString()), true);
    assert.strictEqual(watched.get(URI.joinPath(workspace, ".github", "hooks").toString()), true);
    assert.strictEqual(watched.get(URI.joinPath(userHome, ".copilot").toString()), false);
    assert.strictEqual(watched.get(URI.joinPath(userHome, ".copilot", "agents").toString()), false);
    assert.strictEqual(watched.get(URI.joinPath(userHome, ".copilot", "skills").toString()), true);
    assert.strictEqual(watched.get(URI.joinPath(userHome, ".agents", "skills").toString()), true);
    assert.strictEqual(watched.get(URI.joinPath(userHome, ".copilot", "instructions").toString()), true);
    assert.strictEqual(watched.get(URI.joinPath(userHome, ".copilot", "hooks").toString()), true);
  });
  test("refresh keeps existing watchers when discovered roots are unchanged", async () => {
    await seed("/workspace/.github/agents/foo.agent.md", "workspace agent");
    const watchCalls = [];
    let watchDisposeCalls = 0;
    const originalWatch = fileService.watch.bind(fileService);
    disposables.add({ dispose: () => {
      fileService.watch = originalWatch;
    } });
    fileService.watch = ((resource, options) => {
      watchCalls.push(resource.toString());
      const disposable = originalWatch(resource, options);
      return {
        dispose: () => {
          watchDisposeCalls++;
          disposable.dispose();
        }
      };
    });
    const discovery = disposables.add(instantiationService.createInstance(SessionCustomizationDiscovery, [workspace], userHome, URI.file));
    await discovery.scan(CancellationToken.None);
    const watchCallsAfterFirstScan = watchCalls.length;
    await discovery.scan(CancellationToken.None);
    assert.strictEqual(watchCalls.length, watchCallsAfterFirstScan, "expected no new watch registrations for unchanged roots");
    assert.strictEqual(watchDisposeCalls, 0, "expected existing watchers to remain active for unchanged roots");
  });
  test("fires onDidChange when a new agent file is added under a non-recursively watched root", async () => {
    await seed("/workspace/.github/agents/foo.agent.md", "workspace agent");
    const discovery = disposables.add(instantiationService.createInstance(SessionCustomizationDiscovery, [workspace], userHome, URI.file));
    await discovery.scan(CancellationToken.None);
    await timeout(50);
    let changeCount = 0;
    const fired = new DeferredPromise();
    disposables.add(discovery.onDidChange(() => {
      changeCount++;
      fired.complete();
    }));
    await seed("/workspace/.github/agents/bar.agent.md", "new workspace agent");
    await raceTimeout(fired.p, 500);
    assert.strictEqual(changeCount, 1, "expected onDidChange to fire for a new agent file inside the watched directory");
  });
  test("fires onDidChange when an existing agent file is modified under a non-recursively watched root", async () => {
    await seed("/workspace/.github/agents/foo.agent.md", "workspace agent");
    const discovery = disposables.add(instantiationService.createInstance(SessionCustomizationDiscovery, [workspace], userHome, URI.file));
    await discovery.scan(CancellationToken.None);
    await timeout(50);
    let changeCount = 0;
    const fired = new DeferredPromise();
    disposables.add(discovery.onDidChange(() => {
      changeCount++;
      fired.complete();
    }));
    await seed("/workspace/.github/agents/foo.agent.md", "workspace agent (updated)");
    await raceTimeout(fired.p, 500);
    assert.strictEqual(changeCount, 1, "expected onDidChange to fire when an existing agent file is modified");
  });
  test("fires onDidChange when an existing agent file is deleted under a non-recursively watched root", async () => {
    const agentUri = await seed("/workspace/.github/agents/foo.agent.md", "workspace agent");
    await seed("/workspace/.github/agents/bar.agent.md", "workspace agent bar");
    const discovery = disposables.add(instantiationService.createInstance(SessionCustomizationDiscovery, [workspace], userHome, URI.file));
    await discovery.scan(CancellationToken.None);
    await timeout(50);
    let changeCount = 0;
    const fired = new DeferredPromise();
    disposables.add(discovery.onDidChange(() => {
      changeCount++;
      fired.complete();
    }));
    await fileService.del(agentUri);
    await raceTimeout(fired.p, 500);
    assert.strictEqual(changeCount, 1, "expected onDidChange to fire when an existing agent file is deleted");
  });
  test("fires onDidChange when AGENTS.md in the workspace root is modified", async () => {
    await seed("/workspace/AGENTS.md", "agents instructions");
    const discovery = disposables.add(instantiationService.createInstance(SessionCustomizationDiscovery, [workspace], userHome, URI.file));
    await discovery.scan(CancellationToken.None);
    await timeout(50);
    let changeCount = 0;
    const fired = new DeferredPromise();
    disposables.add(discovery.onDidChange(() => {
      changeCount++;
      fired.complete();
    }));
    await seed("/workspace/AGENTS.md", "agents instructions (updated)");
    await raceTimeout(fired.p, 500);
    assert.strictEqual(changeCount, 1, "expected onDidChange to fire when AGENTS.md at the workspace root is modified");
  });
  test("does not fire onDidChange for files outside any trigger URI", async () => {
    await seed("/workspace/.github/agents/foo.agent.md", "workspace agent");
    const discovery = disposables.add(instantiationService.createInstance(SessionCustomizationDiscovery, [workspace], userHome, URI.file));
    await discovery.scan(CancellationToken.None);
    await timeout(50);
    let changeCount = 0;
    disposables.add(discovery.onDidChange(() => {
      changeCount++;
    }));
    await seed("/workspace/.git/HEAD", "ref: refs/heads/main");
    await seed("/workspace/.vscode/settings.json", "{}");
    await seed("/workspace/README.md", "# project");
    await seed("/workspace/src/index.ts", "export {};");
    await timeout(100);
    assert.strictEqual(changeCount, 0, "expected onDidChange not to fire for paths outside any trigger URI");
  });
  test("discover mode watches the discovered skill root so new skills fire onDidChange", async () => {
    await fileService.createFolder(URI.from({ scheme: Schemas.inMemory, path: "/workspace/.github/skills" }));
    const discovery = disposables.add(instantiationService.createInstance(SessionCustomizationDiscovery, [workspace], userHome, inMemoryPathToUri));
    const client = {
      rpc: {
        agents: {
          getDiscoveryPaths: async () => ({ paths: [] }),
          discover: async () => ({ agents: [] })
        },
        instructions: {
          getDiscoveryPaths: async () => ({ paths: [] }),
          discover: async () => ({ sources: [] })
        },
        skills: {
          getDiscoveryPaths: async () => ({ paths: [{ path: "/workspace/.github/skills" }] }),
          discover: async () => ({ skills: [] })
        }
      }
    };
    await discovery.discover(client, CancellationToken.None);
    await timeout(50);
    let changeCount = 0;
    const fired = new DeferredPromise();
    disposables.add(discovery.onDidChange(() => {
      changeCount++;
      fired.complete();
    }));
    await seed("/workspace/.github/skills/new-skill/SKILL.md", "new workspace skill");
    await raceTimeout(fired.p, 500);
    assert.strictEqual(changeCount, 1, "expected onDidChange to fire when a skill is added under the discovered skill root");
  });
  test("cancellation of one caller does not affect another concurrent caller", async () => {
    await seed("/workspace/.github/agents/foo.agent.md", "workspace agent");
    const discovery = disposables.add(instantiationService.createInstance(SessionCustomizationDiscovery, [workspace], userHome, URI.file));
    const cancelSource = new CancellationTokenSource();
    disposables.add(cancelSource);
    const cancelled = discovery.scan(cancelSource.token);
    const nonCancelled = discovery.scan(CancellationToken.None);
    cancelSource.cancel();
    await assert.rejects(cancelled);
    const directories = await nonCancelled;
    assert.ok(directories.some((directory) => directory.type === DiscoveredType.Agent));
  });
  test("discovers agents, skills, instructions, and hooks across workspace and home roots", async () => {
    const wsAgent = await seed("/workspace/.github/agents/foo.agent.md", "agent body");
    const wsSkill = await seed("/workspace/.github/skills/bar/SKILL.md", "skill body");
    const wsInstr = await seed("/workspace/.github/instructions/baz.instructions.md", "instr body");
    const wsHook = await seed("/workspace/.github/hooks/pre-tool.json", '{"PreToolUse": []}');
    const userAgent = await seed("/home/.copilot/agents/qux.agent.md", "user agent");
    const userCopilotSkill = await seed("/home/.copilot/skills/copilot-zap/SKILL.md", "user copilot skill");
    const userSkill = await seed("/home/.agents/skills/zap/SKILL.md", "user skill");
    const userHook = await seed("/home/.copilot/hooks/post-tool.json", '{"PostToolUse": []}');
    await seed("/workspace/.github/agents/not-an-agent.txt", "ignored");
    await seed("/workspace/.github/hooks/not-a-hook.md", "ignored");
    const discovery = disposables.add(instantiationService.createInstance(SessionCustomizationDiscovery, [workspace], userHome, URI.file));
    const directories = await discovery.scan(CancellationToken.None);
    const files = directories.flatMap((directory) => directory.files.map((file) => ({ uri: file.uri, type: directory.type })));
    assert.deepStrictEqual([...files].sort((a, b) => a.uri.toString().localeCompare(b.uri.toString())), [
      { uri: userAgent, type: DiscoveredType.Agent },
      { uri: userCopilotSkill, type: DiscoveredType.Skill },
      { uri: userHook, type: DiscoveredType.Hook },
      { uri: userSkill, type: DiscoveredType.Skill },
      { uri: wsAgent, type: DiscoveredType.Agent },
      { uri: wsHook, type: DiscoveredType.Hook },
      { uri: wsInstr, type: DiscoveredType.Instruction },
      { uri: wsSkill, type: DiscoveredType.Skill }
    ].sort((a, b) => a.uri.toString().localeCompare(b.uri.toString())));
    assert.ok(directories.some((directory) => directory.uri.toString() === URI.joinPath(workspace, ".github", "agents").toString()));
  });
  test("discovers nested .json hook files", async () => {
    const nestedWsHook = await seed("/workspace/.github/hooks/team/security/pre-tool.json", '{"PreToolUse": []}');
    const nestedUserHook = await seed("/home/.copilot/hooks/domain/tools/post-tool.json", '{"PostToolUse": []}');
    const discovery = disposables.add(instantiationService.createInstance(SessionCustomizationDiscovery, [workspace], userHome, URI.file));
    const files = (await discovery.scan(CancellationToken.None)).flatMap((directory) => directory.files.map((file) => ({ uri: file.uri, type: directory.type })));
    assert.deepStrictEqual([...files].sort((a, b) => a.uri.toString().localeCompare(b.uri.toString())), [
      { uri: nestedUserHook, type: DiscoveredType.Hook },
      { uri: nestedWsHook, type: DiscoveredType.Hook }
    ].sort((a, b) => a.uri.toString().localeCompare(b.uri.toString())));
  });
  test("discovers hook settings files from fixed workspace locations", async () => {
    const githubSettings = await seed("/workspace/.github/copilot/settings.json", '{"hooks": {"PreToolUse": []}}');
    const githubLocalSettings = await seed("/workspace/.github/copilot/settings.local.json", '{"hooks": {"PostToolUse": []}}');
    const claudeSettings = await seed("/workspace/.claude/settings.json", '{"hooks": {"SessionStart": []}}');
    const claudeLocalSettings = await seed("/workspace/.claude/settings.local.json", '{"hooks": {"SessionEnd": []}}');
    await seed("/workspace/.github/copilot/settings.dev.json", '{"hooks": {"Ignored": []}}');
    const discovery = disposables.add(instantiationService.createInstance(SessionCustomizationDiscovery, [workspace], userHome, URI.file));
    const files = (await discovery.scan(CancellationToken.None)).flatMap((directory) => directory.files.map((file) => ({ uri: file.uri, type: directory.type })));
    assert.deepStrictEqual([...files].sort((a, b) => a.uri.toString().localeCompare(b.uri.toString())), [
      { uri: claudeLocalSettings, type: DiscoveredType.Hook },
      { uri: claudeSettings, type: DiscoveredType.Hook },
      { uri: githubLocalSettings, type: DiscoveredType.Hook },
      { uri: githubSettings, type: DiscoveredType.Hook }
    ].sort((a, b) => a.uri.toString().localeCompare(b.uri.toString())));
  });
  test("fires onDidChange when fixed hook settings file is modified", async () => {
    await seed("/workspace/.github/copilot/settings.json", '{"hooks": {"PreToolUse": []}}');
    const discovery = disposables.add(instantiationService.createInstance(SessionCustomizationDiscovery, [workspace], userHome, URI.file));
    await discovery.scan(CancellationToken.None);
    await timeout(50);
    let changeCount = 0;
    const fired = new DeferredPromise();
    disposables.add(discovery.onDidChange(() => {
      changeCount++;
      fired.complete();
    }));
    await seed("/workspace/.github/copilot/settings.json", '{"hooks": {"PreToolUse": [{"command": "echo test"}]}}');
    await raceTimeout(fired.p, 500);
    assert.strictEqual(changeCount, 1, "expected onDidChange to fire when fixed hook settings file is modified");
  });
  test("excludes exact-case README.md inside agent folders", async () => {
    const wsAgent = await seed("/workspace/.github/agents/foo.agent.md", "agent body");
    const wsPlainAgent = await seed("/workspace/.github/agents/plain.md", "plain agent body");
    const wsLowerReadmeAgent = await seed("/workspace/.github/agents/readme.md", "docs lower");
    await seed("/workspace/.github/agents/README.md", "docs");
    const discovery = disposables.add(instantiationService.createInstance(SessionCustomizationDiscovery, [workspace], userHome, URI.file));
    const files = (await discovery.scan(CancellationToken.None)).flatMap((directory) => directory.files.map((file) => ({ uri: file.uri, type: directory.type })));
    assert.deepStrictEqual([...files].sort((a, b) => a.uri.toString().localeCompare(b.uri.toString())), [
      { uri: wsAgent, type: DiscoveredType.Agent },
      { uri: wsLowerReadmeAgent, type: DiscoveredType.Agent },
      { uri: wsPlainAgent, type: DiscoveredType.Agent }
    ].sort((a, b) => a.uri.toString().localeCompare(b.uri.toString())));
  });
  test("includes non-README markdown files inside agent folders", async () => {
    const wsAgent = await seed("/workspace/.github/agents/foo.agent.md", "agent body");
    const wsLegacyMode = await seed("/workspace/.github/agents/legacy.chatmode.md", "legacy mode body");
    const wsPrompt = await seed("/workspace/.github/agents/bar.prompt.md", "prompt body");
    const wsInstruction = await seed("/workspace/.github/agents/baz.instructions.md", "instruction body");
    const wsCopilotInstructions = await seed("/workspace/.github/agents/copilot-instructions.md", "copilot instructions body");
    const wsSkill = await seed("/workspace/.github/agents/SKILL.md", "skill body");
    const wsSkillLowercase = await seed("/workspace/.github/agents/skill.md", "skill body lowercase");
    const discovery = disposables.add(instantiationService.createInstance(SessionCustomizationDiscovery, [workspace], userHome, URI.file));
    const files = (await discovery.scan(CancellationToken.None)).flatMap((directory) => directory.files.map((file) => ({ uri: file.uri, type: directory.type })));
    assert.deepStrictEqual([...files].sort((a, b) => a.uri.toString().localeCompare(b.uri.toString())), [
      { uri: wsCopilotInstructions, type: DiscoveredType.Agent },
      { uri: wsAgent, type: DiscoveredType.Agent },
      { uri: wsInstruction, type: DiscoveredType.Agent },
      { uri: wsLegacyMode, type: DiscoveredType.Agent },
      { uri: wsPrompt, type: DiscoveredType.Agent },
      { uri: wsSkill, type: DiscoveredType.Agent },
      { uri: wsSkillLowercase, type: DiscoveredType.Agent }
    ].sort((a, b) => a.uri.toString().localeCompare(b.uri.toString())));
  });
  test("discovers nested .instructions.md files", async () => {
    const nestedWsInstr = await seed("/workspace/.github/instructions/team/security/policy.instructions.md", "workspace nested instruction");
    const nestedUserInstr = await seed("/home/.copilot/instructions/domain/tools/deep.instructions.md", "user nested instruction");
    const discovery = disposables.add(instantiationService.createInstance(SessionCustomizationDiscovery, [workspace], userHome, URI.file));
    const files = (await discovery.scan(CancellationToken.None)).flatMap((directory) => directory.files.map((file) => ({ uri: file.uri, type: directory.type })));
    assert.deepStrictEqual([...files].sort((a, b) => a.uri.toString().localeCompare(b.uri.toString())), [
      { uri: nestedUserInstr, type: DiscoveredType.Instruction },
      { uri: nestedWsInstr, type: DiscoveredType.Instruction }
    ].sort((a, b) => a.uri.toString().localeCompare(b.uri.toString())));
  });
  test("bundles nested .instructions.md files into rules", async () => {
    await seed("/workspace/.github/instructions/team/security/policy.instructions.md", "workspace nested instruction");
    await seed("/home/.copilot/instructions/domain/tools/deep.instructions.md", "user nested instruction");
    const discovery = disposables.add(instantiationService.createInstance(SessionCustomizationDiscovery, [workspace], userHome, URI.file));
    const bundler = disposables.add(instantiationService.createInstance(SessionPluginBundler, workspace));
    const result = await bundler.bundle(await discovery.scan(CancellationToken.None));
    assert.ok(result);
    const root = bundler.rootUri;
    const workspaceInstr = await fileService.readFile(URI.joinPath(root, "rules", "policy.instructions.md"));
    assert.strictEqual(workspaceInstr.value.toString(), "workspace nested instruction");
    const userInstr = await fileService.readFile(URI.joinPath(root, "rules", "deep.instructions.md"));
    assert.strictEqual(userInstr.value.toString(), "user nested instruction");
  });
  test("returns undefined when no files were discovered", async () => {
    await fileService.createFolder(workspace);
    await fileService.createFolder(userHome);
    const discovery = disposables.add(instantiationService.createInstance(SessionCustomizationDiscovery, [workspace], userHome, URI.file));
    const directories = await discovery.scan(CancellationToken.None);
    assert.ok(Array.isArray(directories), `Expected directories to be an array, got ${JSON.stringify(directories)}`);
    if (directories.length === 0) {
      return;
    }
    for (const dir of directories) {
      assert.strictEqual(dir.files.length, 0, `Expected ${dir.uri.toString()} to have no files`);
    }
    const bundler = disposables.add(instantiationService.createInstance(SessionPluginBundler, workspace));
    await bundler.bundle(directories);
  });
  test("maps discovered files to parsed plugin preserving source URIs", async () => {
    const agent = await seed("/workspace/.github/agents/foo.agent.md", "---\nname: Workspace Agent\ndescription: Agent description\n---\nbody");
    const skill = await seed("/workspace/.github/skills/bar/SKILL.md", "---\nname: Workspace Skill\ndescription: Skill description\n---\nbody");
    const instruction = await seed("/workspace/.github/instructions/baz.instructions.md", "---\nname: Workspace Rule\ndescription: Rule description\nglobs:\n  - src/**\n---\nbody");
    const discovery = disposables.add(instantiationService.createInstance(SessionCustomizationDiscovery, [workspace], userHome, URI.file));
    const customizations = await toDiscoveredDirectoryCustomizations(await discovery.scan(CancellationToken.None), fileService);
    const plugin = mapToParsedPlugin(customizations);
    assert.ok(plugin);
    assert.strictEqual(plugin.agents.length, 1);
    assert.strictEqual(plugin.skills.length, 1);
    assert.strictEqual(plugin.instructions.length, 1);
    assert.deepStrictEqual(
      {
        agentUri: plugin.agents[0].uri.toString(),
        agentDescription: plugin.agents[0].description,
        skillUri: plugin.skills[0].uri.toString(),
        skillDescription: plugin.skills[0].description,
        ruleUri: plugin.instructions[0].uri.toString(),
        ruleDescription: plugin.instructions[0].description
      },
      {
        agentUri: agent.toString(),
        agentDescription: "Agent description",
        skillUri: skill.toString(),
        skillDescription: "Skill description",
        ruleUri: instruction.toString(),
        ruleDescription: "Rule description"
      }
    );
  });
  test("does not include parsed agent-instruction rules in mapToParsedPlugin output", async () => {
    await seed("/workspace/.github/copilot-instructions.md", "workspace instructions");
    await seed("/workspace/.agents/skills/bar/SKILL.md", "---\nname: bar\ndescription: Skill description\n---\nbody");
    const discovery = disposables.add(instantiationService.createInstance(SessionCustomizationDiscovery, [workspace], userHome, URI.file));
    const customizations = await toDiscoveredDirectoryCustomizations(await discovery.scan(CancellationToken.None), fileService);
    const plugin = mapToParsedPlugin(customizations);
    assert.ok(plugin);
    assert.strictEqual(plugin.skills.length, 1);
    assert.strictEqual(plugin.instructions.length, 0);
  });
  test("returns undefined from mapToParsedPlugin when all customizations are agent-instruction files", async () => {
    await seed("/workspace/.github/copilot-instructions.md", "workspace instructions");
    await seed("/home/.copilot/copilot-instructions.md", "user instructions");
    const discovery = disposables.add(instantiationService.createInstance(SessionCustomizationDiscovery, [workspace], userHome, URI.file));
    const customizations = await toDiscoveredDirectoryCustomizations(await discovery.scan(CancellationToken.None), fileService);
    const plugin = mapToParsedPlugin(customizations);
    assert.strictEqual(plugin, void 0);
  });
  test("scan discovers agent instruction files across every working directory", async () => {
    const secondWorkspace = URI.from({ scheme: Schemas.inMemory, path: "/workspace2" });
    const first = await seed("/workspace/.github/copilot-instructions.md", "first");
    const second = await seed("/workspace2/.github/copilot-instructions.md", "second");
    const discovery = disposables.add(instantiationService.createInstance(SessionCustomizationDiscovery, [workspace, secondWorkspace], userHome, URI.file));
    const files = (await discovery.scan(CancellationToken.None)).filter((directory) => directory.type === DiscoveredType.AgentInstruction).flatMap((directory) => directory.files.map((file) => file.uri.toString())).sort((a, b) => a.localeCompare(b));
    assert.deepStrictEqual(files, [first.toString(), second.toString()].sort((a, b) => a.localeCompare(b)));
  });
  test("constructor rejects an empty working-directory set (non-empty, primary-first invariant)", () => {
    assert.throws(
      () => instantiationService.createInstance(SessionCustomizationDiscovery, [], userHome, URI.file),
      /at least one working directory/
    );
  });
  test("scan discovers hooks from the primary working directory only", async () => {
    const secondWorkspace = URI.from({ scheme: Schemas.inMemory, path: "/workspace2" });
    const primaryHook = await seed("/workspace/.github/hooks/pre-tool.json", '{"PreToolUse": []}');
    await seed("/workspace2/.github/hooks/pre-tool.json", '{"PreToolUse": []}');
    const discovery = disposables.add(instantiationService.createInstance(SessionCustomizationDiscovery, [workspace, secondWorkspace], userHome, URI.file));
    const hookFiles = (await discovery.scan(CancellationToken.None)).filter((directory) => directory.type === DiscoveredType.Hook).flatMap((directory) => directory.files.map((file) => file.uri.toString())).sort((a, b) => a.localeCompare(b));
    assert.deepStrictEqual(hookFiles, [primaryHook.toString()]);
  });
  test("discover includes hooks from the primary working directory only", async () => {
    const secondWorkspace = URI.from({ scheme: Schemas.inMemory, path: "/workspace2" });
    await seed("/workspace/.github/hooks/pre-tool.json", '{"PreToolUse": []}');
    await seed("/workspace2/.github/hooks/pre-tool.json", '{"PreToolUse": []}');
    const discovery = disposables.add(instantiationService.createInstance(SessionCustomizationDiscovery, [workspace, secondWorkspace], userHome, inMemoryPathToUri));
    const client = {
      rpc: {
        agents: { getDiscoveryPaths: async () => ({ paths: [] }), discover: async () => ({ agents: [] }) },
        instructions: { getDiscoveryPaths: async () => ({ paths: [] }), discover: async () => ({ sources: [] }) },
        skills: { getDiscoveryPaths: async () => ({ paths: [] }), discover: async () => ({ skills: [] }) }
      }
    };
    const hookChildren = (await discovery.discover(client, CancellationToken.None)).filter((customization) => customization.contents === "hook").flatMap((customization) => (customization.children ?? []).map((child) => URI.parse(child.uri).path)).sort();
    assert.deepStrictEqual(hookChildren, ["/workspace/.github/hooks/pre-tool.json"]);
  });
  test("discover resolves relative instructions against their attributed project root and groups per root", async () => {
    const secondWorkspace = URI.from({ scheme: Schemas.inMemory, path: "/workspace2" });
    const firstFile = await seed("/workspace/.github/copilot-instructions.md", "first");
    const secondFile = await seed("/workspace2/.github/copilot-instructions.md", "second");
    let requestedProjectPaths;
    const discovery = disposables.add(instantiationService.createInstance(SessionCustomizationDiscovery, [workspace, secondWorkspace], userHome, inMemoryPathToUri));
    const client = {
      rpc: {
        agents: { getDiscoveryPaths: async () => ({ paths: [] }), discover: async () => ({ agents: [] }) },
        instructions: {
          getDiscoveryPaths: async () => ({
            paths: [
              { path: "/workspace/.github/copilot-instructions.md", kind: "file" },
              { path: "/workspace2/.github/copilot-instructions.md", kind: "file" }
            ]
          }),
          discover: async (request) => {
            requestedProjectPaths = request.projectPaths;
            return {
              sources: [
                { id: "a", label: "A", sourcePath: ".github/copilot-instructions.md", applyTo: void 0, type: "repo", projectPath: workspace.fsPath },
                { id: "b", label: "B", sourcePath: ".github/copilot-instructions.md", applyTo: void 0, type: "repo", projectPath: secondWorkspace.fsPath }
              ]
            };
          }
        },
        skills: { getDiscoveryPaths: async () => ({ paths: [] }), discover: async () => ({ skills: [] }) }
      }
    };
    const customizations = await discovery.discover(client, CancellationToken.None);
    const ruleDirectories = customizations.filter((customization) => customization.contents === "rule").map((customization) => ({
      uri: customization.uri,
      children: (customization.children ?? []).map((child) => child.uri).sort()
    })).sort((a, b) => a.uri.localeCompare(b.uri));
    assert.deepStrictEqual({ requestedProjectPaths, ruleDirectories }, {
      requestedProjectPaths: [workspace.fsPath, secondWorkspace.fsPath],
      ruleDirectories: [
        { uri: workspace.toString(), children: [firstFile.toString()] },
        { uri: secondWorkspace.toString(), children: [secondFile.toString()] }
      ].sort((a, b) => a.uri.localeCompare(b.uri))
    });
  });
  test("discover surfaces agents and skills from every working directory in one call", async () => {
    const secondWorkspace = URI.from({ scheme: Schemas.inMemory, path: "/workspace2" });
    let agentProjectPaths;
    const discovery = disposables.add(instantiationService.createInstance(SessionCustomizationDiscovery, [workspace, secondWorkspace], userHome, inMemoryPathToUri));
    const client = {
      rpc: {
        agents: {
          getDiscoveryPaths: async () => ({ paths: [] }),
          discover: async (request) => {
            agentProjectPaths = request.projectPaths;
            return {
              agents: [
                { id: "one", name: "One", description: "", path: "/workspace/.github/agents/one.agent.md", userInvocable: false },
                { id: "two", name: "Two", description: "", path: "/workspace2/.github/agents/two.agent.md", userInvocable: false }
              ]
            };
          }
        },
        instructions: { getDiscoveryPaths: async () => ({ paths: [] }), discover: async () => ({ sources: [] }) },
        skills: {
          getDiscoveryPaths: async () => ({ paths: [] }),
          discover: async () => ({
            skills: [
              { path: "/workspace/.github/skills/a", name: "A", description: "" },
              { path: "/workspace2/.github/skills/b", name: "B", description: "" }
            ]
          })
        }
      }
    };
    const customizations = await discovery.discover(client, CancellationToken.None);
    const childUris = customizations.flatMap((customization) => (customization.children ?? []).map((child) => URI.parse(child.uri).path)).sort();
    assert.deepStrictEqual({ agentProjectPaths, childUris }, {
      agentProjectPaths: [workspace.fsPath, secondWorkspace.fsPath],
      childUris: [
        "/workspace/.github/agents/one.agent.md",
        "/workspace/.github/skills/a",
        "/workspace2/.github/agents/two.agent.md",
        "/workspace2/.github/skills/b"
      ]
    });
  });
});
suite("SessionPluginBundler", () => {
  const disposables = new DisposableStore();
  let fileService;
  let instantiationService;
  let workspace;
  let userHome;
  let pluginBasePath;
  setup(() => {
    fileService = disposables.add(new FileService(new NullLogService()));
    const memFs = disposables.add(new InMemoryFileSystemProvider());
    disposables.add(fileService.registerProvider(Schemas.inMemory, memFs));
    instantiationService = disposables.add(new TestInstantiationService());
    instantiationService.stub(IFileService, fileService);
    instantiationService.stub(ILogService, new NullLogService());
    workspace = URI.from({ scheme: Schemas.inMemory, path: "/workspace" });
    userHome = URI.from({ scheme: Schemas.inMemory, path: "/home" });
    pluginBasePath = URI.from({ scheme: Schemas.inMemory, path: "/agentPlugins" });
    instantiationService.stub(IAgentPluginManager, { basePath: pluginBasePath });
  });
  teardown(() => {
    disposables.clear();
  });
  ensureNoDisposablesAreLeakedInTestSuite();
  async function seed(path, content = "") {
    const uri = URI.from({ scheme: Schemas.inMemory, path });
    await fileService.writeFile(uri, VSBuffer.fromString(content));
    return uri;
  }
  test("bundles discovered files into the synthetic plugin tree", async () => {
    await seed("/workspace/.github/agents/foo.agent.md", "agent body");
    await seed("/workspace/.github/skills/bar/SKILL.md", "skill body");
    await seed("/workspace/.github/instructions/baz.instructions.md", "instr body");
    await seed("/workspace/.github/hooks/pre-tool.json", '{"PreToolUse": []}');
    const discovery = disposables.add(instantiationService.createInstance(SessionCustomizationDiscovery, [workspace], userHome, URI.file));
    const bundler = disposables.add(instantiationService.createInstance(SessionPluginBundler, workspace));
    const directories = await discovery.scan(CancellationToken.None);
    const result = await bundler.bundle(directories);
    assert.ok(result);
    assert.strictEqual(result.ref.name, "VS Code Synced Data");
    assert.ok(result.ref.nonce);
    const root = bundler.rootUri;
    const manifest = await fileService.readFile(URI.joinPath(root, ".plugin", "plugin.json"));
    assert.match(manifest.value.toString(), /"name": "VS Code Synced Data"/);
    const agent = await fileService.readFile(URI.joinPath(root, "agents", "foo.agent.md"));
    assert.strictEqual(agent.value.toString(), "agent body");
    const skill = await fileService.readFile(URI.joinPath(root, "skills", "bar", "SKILL.md"));
    assert.strictEqual(skill.value.toString(), "skill body");
    const instr = await fileService.readFile(URI.joinPath(root, "rules", "baz.instructions.md"));
    assert.strictEqual(instr.value.toString(), "instr body");
    const hook = await fileService.readFile(URI.joinPath(root, "hooks", "pre-tool.json"));
    assert.strictEqual(hook.value.toString(), '{"PreToolUse": []}');
  });
  test("produces a stable nonce for identical content", async () => {
    await seed("/workspace/.github/agents/foo.agent.md", "agent body");
    await seed("/workspace/.github/skills/bar/SKILL.md", "skill body");
    const discovery = disposables.add(instantiationService.createInstance(SessionCustomizationDiscovery, [workspace], userHome, URI.file));
    const bundler = disposables.add(instantiationService.createInstance(SessionPluginBundler, workspace));
    const first = await bundler.bundle(await discovery.scan(CancellationToken.None));
    let writeCalls = 0;
    let deleteCalls = 0;
    const originalWriteFile = fileService.writeFile.bind(fileService);
    const originalDel = fileService.del.bind(fileService);
    disposables.add({
      dispose: () => {
        fileService.writeFile = originalWriteFile;
        fileService.del = originalDel;
      }
    });
    fileService.writeFile = ((...args) => {
      writeCalls++;
      return originalWriteFile(...args);
    });
    fileService.del = ((...args) => {
      deleteCalls++;
      return originalDel(...args);
    });
    const second = await bundler.bundle(await discovery.scan(CancellationToken.None));
    assert.ok(first);
    assert.ok(second);
    assert.deepStrictEqual({
      firstNonce: first.ref.nonce,
      secondNonce: second.ref.nonce,
      writeCalls,
      deleteCalls
    }, {
      firstNonce: first.ref.nonce,
      secondNonce: first.ref.nonce,
      writeCalls: 0,
      deleteCalls: 0
    });
  });
  test("returns undefined without rewriting when cancelled", async () => {
    await seed("/workspace/.github/agents/foo.agent.md", "agent body");
    const discovery = disposables.add(instantiationService.createInstance(SessionCustomizationDiscovery, [workspace], userHome, URI.file));
    const bundler = disposables.add(instantiationService.createInstance(SessionPluginBundler, workspace));
    let writeCalls = 0;
    let deleteCalls = 0;
    const originalWriteFile = fileService.writeFile.bind(fileService);
    const originalDel = fileService.del.bind(fileService);
    disposables.add({
      dispose: () => {
        fileService.writeFile = originalWriteFile;
        fileService.del = originalDel;
      }
    });
    fileService.writeFile = ((...args) => {
      writeCalls++;
      return originalWriteFile(...args);
    });
    fileService.del = ((...args) => {
      deleteCalls++;
      return originalDel(...args);
    });
    const result = await bundler.bundle(await discovery.scan(CancellationToken.None), CancellationToken.Cancelled);
    assert.deepStrictEqual({ result, writeCalls, deleteCalls }, { result: void 0, writeCalls: 0, deleteCalls: 0 });
  });
  test("different working directories produce different bundle authorities", async () => {
    const otherWorkspace = URI.from({ scheme: Schemas.inMemory, path: "/other-workspace" });
    const a = disposables.add(instantiationService.createInstance(SessionPluginBundler, workspace));
    const b = disposables.add(instantiationService.createInstance(SessionPluginBundler, otherWorkspace));
    assert.notStrictEqual(a.rootUri.toString(), b.rootUri.toString());
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxwbGF0Zm9ybVxcYWdlbnRIb3N0XFx0ZXN0XFxub2RlXFxzZXNzaW9uQ3VzdG9taXphdGlvbkRpc2NvdmVyeS50ZXN0LnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IGFzc2VydCBmcm9tICdhc3NlcnQnO1xuaW1wb3J0IHR5cGUgeyBDb3BpbG90Q2xpZW50IH0gZnJvbSAnQGdpdGh1Yi9jb3BpbG90LXNkayc7XG5pbXBvcnQgeyBEZWZlcnJlZFByb21pc2UsIHJhY2VUaW1lb3V0LCB0aW1lb3V0IH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vYXN5bmMuanMnO1xuaW1wb3J0IHsgVlNCdWZmZXIgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9idWZmZXIuanMnO1xuaW1wb3J0IHsgQ2FuY2VsbGF0aW9uVG9rZW4sIENhbmNlbGxhdGlvblRva2VuU291cmNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vY2FuY2VsbGF0aW9uLmpzJztcbmltcG9ydCB7IERpc3Bvc2FibGVTdG9yZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBTY2hlbWFzIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbmV0d29yay5qcyc7XG5pbXBvcnQgeyBVUkkgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi91cmkuanMnO1xuaW1wb3J0IHsgZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS90ZXN0L2NvbW1vbi91dGlscy5qcyc7XG5pbXBvcnQgeyBGaWxlU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL2ZpbGVzL2NvbW1vbi9maWxlU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJRmlsZVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9maWxlcy9jb21tb24vZmlsZXMuanMnO1xuaW1wb3J0IHsgSW5NZW1vcnlGaWxlU3lzdGVtUHJvdmlkZXIgfSBmcm9tICcuLi8uLi8uLi9maWxlcy9jb21tb24vaW5NZW1vcnlGaWxlc3lzdGVtUHJvdmlkZXIuanMnO1xuaW1wb3J0IHsgVGVzdEluc3RhbnRpYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vaW5zdGFudGlhdGlvbi90ZXN0L2NvbW1vbi9pbnN0YW50aWF0aW9uU2VydmljZU1vY2suanMnO1xuaW1wb3J0IHsgSUxvZ1NlcnZpY2UsIE51bGxMb2dTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vbG9nL2NvbW1vbi9sb2cuanMnO1xuaW1wb3J0IHsgSUFnZW50UGx1Z2luTWFuYWdlciB9IGZyb20gJy4uLy4uL2NvbW1vbi9hZ2VudFBsdWdpbk1hbmFnZXIuanMnO1xuaW1wb3J0IHsgRGlzY292ZXJlZFR5cGUsIFNlc3Npb25DdXN0b21pemF0aW9uRGlzY292ZXJ5IH0gZnJvbSAnLi4vLi4vbm9kZS9jb3BpbG90L3Nlc3Npb25DdXN0b21pemF0aW9uRGlzY292ZXJ5LmpzJztcbmltcG9ydCB7IFNlc3Npb25QbHVnaW5CdW5kbGVyIH0gZnJvbSAnLi4vLi4vbm9kZS9zaGFyZWQvc2Vzc2lvblBsdWdpbkJ1bmRsZXIuanMnO1xuaW1wb3J0IHsgbWFwVG9QYXJzZWRQbHVnaW4sIHRvRGlzY292ZXJlZERpcmVjdG9yeUN1c3RvbWl6YXRpb25zIH0gZnJvbSAnLi4vLi4vbm9kZS9jb3BpbG90L2NvcGlsb3RBZ2VudC5qcyc7XG5cbnR5cGUgQWdlbnRzRGlzY292ZXJSZXF1ZXN0ID0gUGFyYW1ldGVyczxDb3BpbG90Q2xpZW50WydycGMnXVsnYWdlbnRzJ11bJ2Rpc2NvdmVyJ10+WzBdO1xuXG5zdWl0ZSgnU2Vzc2lvbkN1c3RvbWl6YXRpb25EaXNjb3ZlcnknLCAoKSA9PiB7XG5cblx0Y29uc3QgZGlzcG9zYWJsZXMgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cdGxldCBmaWxlU2VydmljZTogRmlsZVNlcnZpY2U7XG5cdGxldCBpbnN0YW50aWF0aW9uU2VydmljZTogVGVzdEluc3RhbnRpYXRpb25TZXJ2aWNlO1xuXHRsZXQgd29ya3NwYWNlOiBVUkk7XG5cdGxldCB1c2VySG9tZTogVVJJO1xuXHRsZXQgcGx1Z2luQmFzZVBhdGg6IFVSSTtcblxuXHRzZXR1cCgoKSA9PiB7XG5cdFx0ZmlsZVNlcnZpY2UgPSBkaXNwb3NhYmxlcy5hZGQobmV3IEZpbGVTZXJ2aWNlKG5ldyBOdWxsTG9nU2VydmljZSgpKSk7XG5cdFx0Y29uc3QgbWVtRnMgPSBkaXNwb3NhYmxlcy5hZGQobmV3IEluTWVtb3J5RmlsZVN5c3RlbVByb3ZpZGVyKCkpO1xuXHRcdGRpc3Bvc2FibGVzLmFkZChmaWxlU2VydmljZS5yZWdpc3RlclByb3ZpZGVyKFNjaGVtYXMuaW5NZW1vcnksIG1lbUZzKSk7XG5cblx0XHRpbnN0YW50aWF0aW9uU2VydmljZSA9IGRpc3Bvc2FibGVzLmFkZChuZXcgVGVzdEluc3RhbnRpYXRpb25TZXJ2aWNlKCkpO1xuXHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSUZpbGVTZXJ2aWNlLCBmaWxlU2VydmljZSk7XG5cdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJTG9nU2VydmljZSwgbmV3IE51bGxMb2dTZXJ2aWNlKCkpO1xuXG5cdFx0d29ya3NwYWNlID0gVVJJLmZyb20oeyBzY2hlbWU6IFNjaGVtYXMuaW5NZW1vcnksIHBhdGg6ICcvd29ya3NwYWNlJyB9KTtcblx0XHR1c2VySG9tZSA9IFVSSS5mcm9tKHsgc2NoZW1lOiBTY2hlbWFzLmluTWVtb3J5LCBwYXRoOiAnL2hvbWUnIH0pO1xuXHRcdHBsdWdpbkJhc2VQYXRoID0gVVJJLmZyb20oeyBzY2hlbWU6IFNjaGVtYXMuaW5NZW1vcnksIHBhdGg6ICcvYWdlbnRQbHVnaW5zJyB9KTtcblx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElBZ2VudFBsdWdpbk1hbmFnZXIsIHsgYmFzZVBhdGg6IHBsdWdpbkJhc2VQYXRoIH0gYXMgUGFydGlhbDxJQWdlbnRQbHVnaW5NYW5hZ2VyPik7XG5cdH0pO1xuXG5cdHRlYXJkb3duKCgpID0+IHtcblx0XHRkaXNwb3NhYmxlcy5jbGVhcigpO1xuXHR9KTtcblx0ZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlKCk7XG5cblx0YXN5bmMgZnVuY3Rpb24gc2VlZChwYXRoOiBzdHJpbmcsIGNvbnRlbnQgPSAnJyk6IFByb21pc2U8VVJJPiB7XG5cdFx0Y29uc3QgdXJpID0gVVJJLmZyb20oeyBzY2hlbWU6IFNjaGVtYXMuaW5NZW1vcnksIHBhdGggfSk7XG5cdFx0YXdhaXQgZmlsZVNlcnZpY2Uud3JpdGVGaWxlKHVyaSwgVlNCdWZmZXIuZnJvbVN0cmluZyhjb250ZW50KSk7XG5cdFx0cmV0dXJuIHVyaTtcblx0fVxuXG5cdC8vIE1pcnJvciBgVVJJLmZpbGVgJ3Mgc2VwYXJhdG9yIG5vcm1hbGl6YXRpb24gKGl0IHJld3JpdGVzIGBcXGAgXHUyMTkyIGAvYCBvbiBXaW5kb3dzKSBzbyBhXG5cdC8vIHJvdW5kLXRyaXAgdGhyb3VnaCBgLmZzUGF0aGAgXHUyMDE0IHVzZWQgYnkgYHByb2plY3RQYXRoYCBhdHRyaWJ1dGlvbiBpbiBkaXNjb3ZlcnkgXHUyMDE0IG1hdGNoZXNcblx0Ly8gb24gV2luZG93cyB0b28sIHdoZXJlIGBVUkkuZnNQYXRoYCB5aWVsZHMgYmFja3NsYXNoZXMuXG5cdGNvbnN0IGluTWVtb3J5UGF0aFRvVXJpID0gKHBhdGg6IHN0cmluZykgPT4gVVJJLmZyb20oeyBzY2hlbWU6IFNjaGVtYXMuaW5NZW1vcnksIHBhdGg6IHBhdGgucmVwbGFjZSgvXFxcXC9nLCAnLycpIH0pO1xuXG5cdHRlc3QoJ2Rpc2NvdmVycyBzdXBwb3J0ZWQgYWdlbnQgaW5zdHJ1Y3Rpb24gZmlsZXMgaW4gd29ya3NwYWNlIHJvb3RzJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHdzQ29waWxvdEluc3RydWN0aW9ucyA9IGF3YWl0IHNlZWQoJy93b3Jrc3BhY2UvLmdpdGh1Yi9jb3BpbG90LWluc3RydWN0aW9ucy5tZCcsICd3b3Jrc3BhY2UgY29waWxvdCBpbnN0cnVjdGlvbnMnKTtcblx0XHRjb25zdCB3c0dlbWluaUluc3RydWN0aW9ucyA9IGF3YWl0IHNlZWQoJy93b3Jrc3BhY2UvR0VNSU5JLm1kJywgJ3dvcmtzcGFjZSBnZW1pbmkgaW5zdHJ1Y3Rpb25zJyk7XG5cblx0XHRjb25zdCBkaXNjb3ZlcnkgPSBkaXNwb3NhYmxlcy5hZGQoaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoU2Vzc2lvbkN1c3RvbWl6YXRpb25EaXNjb3ZlcnksIFt3b3Jrc3BhY2VdLCB1c2VySG9tZSwgVVJJLmZpbGUpKTtcblx0XHRjb25zdCBmaWxlcyA9IChhd2FpdCBkaXNjb3Zlcnkuc2NhbihDYW5jZWxsYXRpb25Ub2tlbi5Ob25lKSlcblx0XHRcdC5mbGF0TWFwKGRpcmVjdG9yeSA9PiBkaXJlY3RvcnkuZmlsZXMubWFwKGZpbGUgPT4gKHsgdXJpOiBmaWxlLnVyaSwgdHlwZTogZGlyZWN0b3J5LnR5cGUgfSkpKVxuXHRcdFx0LmZpbHRlcihlbnRyeSA9PiBlbnRyeS50eXBlID09PSBEaXNjb3ZlcmVkVHlwZS5BZ2VudEluc3RydWN0aW9uKVxuXHRcdFx0Lm1hcChlbnRyeSA9PiBlbnRyeS51cmkudG9TdHJpbmcoKSlcblx0XHRcdC5zb3J0KChhLCBiKSA9PiBhLmxvY2FsZUNvbXBhcmUoYikpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChmaWxlcywgW1xuXHRcdFx0d3NDb3BpbG90SW5zdHJ1Y3Rpb25zLnRvU3RyaW5nKCksXG5cdFx0XHR3c0dlbWluaUluc3RydWN0aW9ucy50b1N0cmluZygpLFxuXHRcdF0uc29ydCgoYSwgYikgPT4gYS5sb2NhbGVDb21wYXJlKGIpKSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2dyb3VwcyBkaXNjb3ZlcmVkIGN1c3RvbWl6YXRpb25zIGJ5IHBhcmVudCBmb2xkZXInLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgZGlzY292ZXJ5ID0gZGlzcG9zYWJsZXMuYWRkKGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFNlc3Npb25DdXN0b21pemF0aW9uRGlzY292ZXJ5LCBbd29ya3NwYWNlXSwgdXNlckhvbWUsIGluTWVtb3J5UGF0aFRvVXJpKSk7XG5cdFx0Y29uc3QgY2xpZW50ID0ge1xuXHRcdFx0cnBjOiB7XG5cdFx0XHRcdGFnZW50czoge1xuXHRcdFx0XHRcdGRpc2NvdmVyOiBhc3luYyAoKSA9PiAoe1xuXHRcdFx0XHRcdFx0YWdlbnRzOiBbXG5cdFx0XHRcdFx0XHRcdHsgaWQ6ICdvbmUnLCBuYW1lOiAnT25lJywgZGVzY3JpcHRpb246ICcnLCBwYXRoOiAnL3dvcmtzcGFjZS8uZ2l0aHViL2FnZW50cy9vbmUuYWdlbnQubWQnLCB1c2VySW52b2NhYmxlOiBmYWxzZSB9LFxuXHRcdFx0XHRcdFx0XHR7IGlkOiAndHdvJywgbmFtZTogJ1R3bycsIGRlc2NyaXB0aW9uOiAnJywgcGF0aDogJy93b3Jrc3BhY2UvLmdpdGh1Yi9hZ2VudHMvdHdvLmFnZW50Lm1kJywgdXNlckludm9jYWJsZTogdHJ1ZSB9LFxuXHRcdFx0XHRcdFx0XHR7IGlkOiAndGhyZWUnLCBuYW1lOiAnVGhyZWUnLCBkZXNjcmlwdGlvbjogJycsIHBhdGg6ICcvd29ya3NwYWNlLy5naXRodWIvb3RoZXIvdGhyZWUuYWdlbnQubWQnLCB1c2VySW52b2NhYmxlOiBmYWxzZSB9LFxuXHRcdFx0XHRcdFx0XSxcblx0XHRcdFx0XHR9KSxcblx0XHRcdFx0fSxcblx0XHRcdFx0aW5zdHJ1Y3Rpb25zOiB7IGRpc2NvdmVyOiBhc3luYyAoKSA9PiAoeyBzb3VyY2VzOiBbXSB9KSB9LFxuXHRcdFx0XHRza2lsbHM6IHsgZGlzY292ZXI6IGFzeW5jICgpID0+ICh7IHNraWxsczogW10gfSkgfSxcblx0XHRcdH0sXG5cdFx0fSBhcyB1bmtub3duIGFzIENvcGlsb3RDbGllbnQ7XG5cblx0XHRjb25zdCBjdXN0b21pemF0aW9ucyA9IGF3YWl0IGRpc2NvdmVyeS5kaXNjb3ZlcihjbGllbnQsIENhbmNlbGxhdGlvblRva2VuLk5vbmUpO1xuXHRcdGNvbnN0IGFnZW50RGlyZWN0b3JpZXMgPSBjdXN0b21pemF0aW9ucy5maWx0ZXIoY3VzdG9taXphdGlvbiA9PiBjdXN0b21pemF0aW9uLmNvbnRlbnRzID09PSAnYWdlbnQnKTtcblxuXHRcdGNvbnN0IGdldFBhdGggPSAodXJpOiBzdHJpbmcpID0+IFVSSS5wYXJzZSh1cmkpLnBhdGg7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYWdlbnREaXJlY3Rvcmllcy5sZW5ndGgsIDIpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoYWdlbnREaXJlY3Rvcmllcy5tYXAoY3VzdG9taXphdGlvbiA9PiBnZXRQYXRoKGN1c3RvbWl6YXRpb24udXJpKSkuc29ydCgpLCBbXG5cdFx0XHQnL3dvcmtzcGFjZS8uZ2l0aHViL2FnZW50cycsXG5cdFx0XHQnL3dvcmtzcGFjZS8uZ2l0aHViL290aGVyJyxcblx0XHRdKTtcblx0XHRjb25zdCBhZ2VudHNJbkFnZW50c0RpciA9IGFnZW50RGlyZWN0b3JpZXMuZmluZChjdXN0b21pemF0aW9uID0+IGdldFBhdGgoY3VzdG9taXphdGlvbi51cmkpID09PSAnL3dvcmtzcGFjZS8uZ2l0aHViL2FnZW50cycpO1xuXHRcdGFzc2VydC5vayhhZ2VudHNJbkFnZW50c0Rpcik7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChhZ2VudHNJbkFnZW50c0Rpci5jaGlsZHJlbj8ubWFwKGNoaWxkID0+IGdldFBhdGgoY2hpbGQudXJpKSkuc29ydCgpLCBbXG5cdFx0XHQnL3dvcmtzcGFjZS8uZ2l0aHViL2FnZW50cy9vbmUuYWdlbnQubWQnLFxuXHRcdFx0Jy93b3Jrc3BhY2UvLmdpdGh1Yi9hZ2VudHMvdHdvLmFnZW50Lm1kJyxcblx0XHRdKTtcblx0fSk7XG5cblx0dGVzdCgnZGlzY292ZXIgaW5jbHVkZXMgaG9va3MgZnJvbSByZWN1cnNpdmUgYW5kIGZpeGVkIGhvb2sgbG9jYXRpb25zJywgYXN5bmMgKCkgPT4ge1xuXHRcdGF3YWl0IHNlZWQoJy93b3Jrc3BhY2UvLmdpdGh1Yi9ob29rcy9wcmUtdG9vbC5qc29uJywgJ3tcIlByZVRvb2xVc2VcIjogW119Jyk7XG5cdFx0YXdhaXQgc2VlZCgnL3dvcmtzcGFjZS8uZ2l0aHViL2NvcGlsb3Qvc2V0dGluZ3MuanNvbicsICd7XCJob29rc1wiOiB7XCJQcmVUb29sVXNlXCI6IFtdfX0nKTtcblxuXHRcdGNvbnN0IGRpc2NvdmVyeSA9IGRpc3Bvc2FibGVzLmFkZChpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShTZXNzaW9uQ3VzdG9taXphdGlvbkRpc2NvdmVyeSwgW3dvcmtzcGFjZV0sIHVzZXJIb21lLCBpbk1lbW9yeVBhdGhUb1VyaSkpO1xuXHRcdGNvbnN0IGNsaWVudCA9IHtcblx0XHRcdHJwYzoge1xuXHRcdFx0XHRhZ2VudHM6IHtcblx0XHRcdFx0XHRnZXREaXNjb3ZlcnlQYXRoczogYXN5bmMgKCkgPT4gKHsgcGF0aHM6IFtdIH0pLFxuXHRcdFx0XHRcdGRpc2NvdmVyOiBhc3luYyAoKSA9PiAoeyBhZ2VudHM6IFtdIH0pLFxuXHRcdFx0XHR9LFxuXHRcdFx0XHRpbnN0cnVjdGlvbnM6IHtcblx0XHRcdFx0XHRnZXREaXNjb3ZlcnlQYXRoczogYXN5bmMgKCkgPT4gKHsgcGF0aHM6IFtdIH0pLFxuXHRcdFx0XHRcdGRpc2NvdmVyOiBhc3luYyAoKSA9PiAoeyBzb3VyY2VzOiBbXSB9KSxcblx0XHRcdFx0fSxcblx0XHRcdFx0c2tpbGxzOiB7XG5cdFx0XHRcdFx0Z2V0RGlzY292ZXJ5UGF0aHM6IGFzeW5jICgpID0+ICh7IHBhdGhzOiBbXSB9KSxcblx0XHRcdFx0XHRkaXNjb3ZlcjogYXN5bmMgKCkgPT4gKHsgc2tpbGxzOiBbXSB9KSxcblx0XHRcdFx0fSxcblx0XHRcdH0sXG5cdFx0fSBhcyB1bmtub3duIGFzIENvcGlsb3RDbGllbnQ7XG5cblx0XHRjb25zdCBjdXN0b21pemF0aW9ucyA9IGF3YWl0IGRpc2NvdmVyeS5kaXNjb3ZlcihjbGllbnQsIENhbmNlbGxhdGlvblRva2VuLk5vbmUpO1xuXHRcdGNvbnN0IGhvb2tEaXJlY3RvcmllcyA9IGN1c3RvbWl6YXRpb25zXG5cdFx0XHQuZmlsdGVyKGN1c3RvbWl6YXRpb24gPT4gY3VzdG9taXphdGlvbi5jb250ZW50cyA9PT0gJ2hvb2snKVxuXHRcdFx0Lm1hcChjdXN0b21pemF0aW9uID0+ICh7XG5cdFx0XHRcdHVyaTogVVJJLnBhcnNlKGN1c3RvbWl6YXRpb24udXJpKS5wYXRoLFxuXHRcdFx0XHRjaGlsZHJlbjogKGN1c3RvbWl6YXRpb24uY2hpbGRyZW4gPz8gW10pLm1hcChjaGlsZCA9PiBVUkkucGFyc2UoY2hpbGQudXJpKS5wYXRoKS5zb3J0KCksXG5cdFx0XHR9KSlcblx0XHRcdC5zb3J0KChhLCBiKSA9PiBhLnVyaS5sb2NhbGVDb21wYXJlKGIudXJpKSk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGhvb2tEaXJlY3RvcmllcywgW1xuXHRcdFx0eyB1cmk6ICcvaG9tZS8uY29waWxvdC9ob29rcycsIGNoaWxkcmVuOiBbXSB9LFxuXHRcdFx0eyB1cmk6ICcvd29ya3NwYWNlLy5naXRodWIvY29waWxvdCcsIGNoaWxkcmVuOiBbJy93b3Jrc3BhY2UvLmdpdGh1Yi9jb3BpbG90L3NldHRpbmdzLmpzb24nXSB9LFxuXHRcdFx0eyB1cmk6ICcvd29ya3NwYWNlLy5naXRodWIvaG9va3MnLCBjaGlsZHJlbjogWycvd29ya3NwYWNlLy5naXRodWIvaG9va3MvcHJlLXRvb2wuanNvbiddIH0sXG5cdFx0XSk7XG5cdH0pO1xuXG5cdHRlc3QoJ21hcmtzIGFnZW50IGluc3RydWN0aW9uIHJ1bGUgc291cmNlcyBhcyBhbHdheXMgYXBwbHknLCBhc3luYyAoKSA9PiB7XG5cdFx0YXdhaXQgc2VlZCgnL3dvcmtzcGFjZS9BR0VOVFMubWQnLCAnd29ya3NwYWNlIGFnZW50cyBpbnN0cnVjdGlvbnMnKTtcblx0XHRhd2FpdCBzZWVkKCcvd29ya3NwYWNlLy5naXRodWIvaW5zdHJ1Y3Rpb25zL3J1bGUuaW5zdHJ1Y3Rpb25zLm1kJywgJ3Njb3BlZCBpbnN0cnVjdGlvbicpO1xuXG5cdFx0Y29uc3QgZGlzY292ZXJ5ID0gZGlzcG9zYWJsZXMuYWRkKGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFNlc3Npb25DdXN0b21pemF0aW9uRGlzY292ZXJ5LCBbd29ya3NwYWNlXSwgdXNlckhvbWUsIGluTWVtb3J5UGF0aFRvVXJpKSk7XG5cdFx0Y29uc3QgY2xpZW50ID0ge1xuXHRcdFx0cnBjOiB7XG5cdFx0XHRcdGFnZW50czoge1xuXHRcdFx0XHRcdGdldERpc2NvdmVyeVBhdGhzOiBhc3luYyAoKSA9PiAoeyBwYXRoczogW10gfSksXG5cdFx0XHRcdFx0ZGlzY292ZXI6IGFzeW5jICgpID0+ICh7IGFnZW50czogW10gfSksXG5cdFx0XHRcdH0sXG5cdFx0XHRcdGluc3RydWN0aW9uczoge1xuXHRcdFx0XHRcdGdldERpc2NvdmVyeVBhdGhzOiBhc3luYyAoKSA9PiAoe1xuXHRcdFx0XHRcdFx0cGF0aHM6IFtcblx0XHRcdFx0XHRcdFx0eyBwYXRoOiAnL3dvcmtzcGFjZS8uZ2l0aHViL2luc3RydWN0aW9ucycsIGtpbmQ6ICdkaXJlY3RvcnknIH0sXG5cdFx0XHRcdFx0XHRcdHsgcGF0aDogJy93b3Jrc3BhY2UvQUdFTlRTLm1kJywga2luZDogJ2ZpbGUnIH0sXG5cdFx0XHRcdFx0XHRdLFxuXHRcdFx0XHRcdH0pLFxuXHRcdFx0XHRcdGRpc2NvdmVyOiBhc3luYyAoKSA9PiAoe1xuXHRcdFx0XHRcdFx0c291cmNlczogW1xuXHRcdFx0XHRcdFx0XHR7IGlkOiAnYWdlbnRJbnN0cnVjdGlvbicsIGxhYmVsOiAnQUdFTlRTLm1kJywgc291cmNlUGF0aDogJy93b3Jrc3BhY2UvQUdFTlRTLm1kJywgYXBwbHlUbzogW10sIHR5cGU6ICdyZXBvJyB9LFxuXHRcdFx0XHRcdFx0XHR7IGlkOiAnc2NvcGVkSW5zdHJ1Y3Rpb24nLCBsYWJlbDogJ1J1bGUnLCBzb3VyY2VQYXRoOiAnL3dvcmtzcGFjZS8uZ2l0aHViL2luc3RydWN0aW9ucy9ydWxlLmluc3RydWN0aW9ucy5tZCcsIGFwcGx5VG86IFsnc3JjLyoqJ10sIHR5cGU6ICdjaGlsZC1pbnN0cnVjdGlvbnMnIH0sXG5cdFx0XHRcdFx0XHRdLFxuXHRcdFx0XHRcdH0pLFxuXHRcdFx0XHR9LFxuXHRcdFx0XHRza2lsbHM6IHtcblx0XHRcdFx0XHRnZXREaXNjb3ZlcnlQYXRoczogYXN5bmMgKCkgPT4gKHsgcGF0aHM6IFtdIH0pLFxuXHRcdFx0XHRcdGRpc2NvdmVyOiBhc3luYyAoKSA9PiAoeyBza2lsbHM6IFtdIH0pLFxuXHRcdFx0XHR9LFxuXHRcdFx0fSxcblx0XHR9IGFzIHVua25vd24gYXMgQ29waWxvdENsaWVudDtcblxuXHRcdGNvbnN0IGN1c3RvbWl6YXRpb25zID0gYXdhaXQgZGlzY292ZXJ5LmRpc2NvdmVyKGNsaWVudCwgQ2FuY2VsbGF0aW9uVG9rZW4uTm9uZSk7XG5cdFx0Y29uc3QgcnVsZXMgPSBjdXN0b21pemF0aW9uc1xuXHRcdFx0LmZpbHRlcihjdXN0b21pemF0aW9uID0+IGN1c3RvbWl6YXRpb24uY29udGVudHMgPT09ICdydWxlJylcblx0XHRcdC5mbGF0TWFwKGN1c3RvbWl6YXRpb24gPT4gY3VzdG9taXphdGlvbi5jaGlsZHJlbiA/PyBbXSlcblx0XHRcdC5tYXAoY2hpbGQgPT4gKHtcblx0XHRcdFx0dXJpOiBVUkkucGFyc2UoY2hpbGQudXJpKS5wYXRoLFxuXHRcdFx0XHRhbHdheXNBcHBseTogY2hpbGQudHlwZSA9PT0gJ3J1bGUnID8gY2hpbGQuYWx3YXlzQXBwbHkgOiB1bmRlZmluZWQsXG5cdFx0XHR9KSlcblx0XHRcdC5zb3J0KChhLCBiKSA9PiBhLnVyaS5sb2NhbGVDb21wYXJlKGIudXJpKSk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHJ1bGVzLCBbXG5cdFx0XHR7IHVyaTogJy93b3Jrc3BhY2UvLmdpdGh1Yi9pbnN0cnVjdGlvbnMvcnVsZS5pbnN0cnVjdGlvbnMubWQnLCBhbHdheXNBcHBseTogZmFsc2UgfSxcblx0XHRcdHsgdXJpOiAnL3dvcmtzcGFjZS9BR0VOVFMubWQnLCBhbHdheXNBcHBseTogdHJ1ZSB9LFxuXHRcdF0pO1xuXHR9KTtcblxuXHR0ZXN0KCdkcm9wcyBtaXNzaW5nIGFnZW50IGluc3RydWN0aW9uIGZpbGVzIGFuZCBlbXB0eSBhZ2VudCBpbnN0cnVjdGlvbiBkaXJlY3RvcmllcycsIGFzeW5jICgpID0+IHtcblx0XHRhd2FpdCBzZWVkKCcvd29ya3NwYWNlLy5naXRodWIvaW5zdHJ1Y3Rpb25zL3J1bGUuaW5zdHJ1Y3Rpb25zLm1kJywgJ3Njb3BlZCBpbnN0cnVjdGlvbicpO1xuXG5cdFx0Y29uc3QgZGlzY292ZXJ5ID0gZGlzcG9zYWJsZXMuYWRkKGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFNlc3Npb25DdXN0b21pemF0aW9uRGlzY292ZXJ5LCBbd29ya3NwYWNlXSwgdXNlckhvbWUsIGluTWVtb3J5UGF0aFRvVXJpKSk7XG5cdFx0Y29uc3QgY2xpZW50ID0ge1xuXHRcdFx0cnBjOiB7XG5cdFx0XHRcdGFnZW50czoge1xuXHRcdFx0XHRcdGdldERpc2NvdmVyeVBhdGhzOiBhc3luYyAoKSA9PiAoeyBwYXRoczogW10gfSksXG5cdFx0XHRcdFx0ZGlzY292ZXI6IGFzeW5jICgpID0+ICh7IGFnZW50czogW10gfSksXG5cdFx0XHRcdH0sXG5cdFx0XHRcdGluc3RydWN0aW9uczoge1xuXHRcdFx0XHRcdGdldERpc2NvdmVyeVBhdGhzOiBhc3luYyAoKSA9PiAoe1xuXHRcdFx0XHRcdFx0cGF0aHM6IFtcblx0XHRcdFx0XHRcdFx0eyBwYXRoOiAnL3dvcmtzcGFjZS8uZ2l0aHViL2luc3RydWN0aW9ucycsIGtpbmQ6ICdkaXJlY3RvcnknIH0sXG5cdFx0XHRcdFx0XHRcdHsgcGF0aDogJy93b3Jrc3BhY2UvQUdFTlRTLm1kJywga2luZDogJ2ZpbGUnIH0sXG5cdFx0XHRcdFx0XHRdLFxuXHRcdFx0XHRcdH0pLFxuXHRcdFx0XHRcdGRpc2NvdmVyOiBhc3luYyAoKSA9PiAoe1xuXHRcdFx0XHRcdFx0c291cmNlczogW1xuXHRcdFx0XHRcdFx0XHR7IGlkOiAnYWdlbnRJbnN0cnVjdGlvbicsIGxhYmVsOiAnQUdFTlRTLm1kJywgc291cmNlUGF0aDogJy93b3Jrc3BhY2UvQUdFTlRTLm1kJywgYXBwbHlUbzogW10sIHR5cGU6ICdyZXBvJyB9LFxuXHRcdFx0XHRcdFx0XHR7IGlkOiAnc2NvcGVkSW5zdHJ1Y3Rpb24nLCBsYWJlbDogJ1J1bGUnLCBzb3VyY2VQYXRoOiAnL3dvcmtzcGFjZS8uZ2l0aHViL2luc3RydWN0aW9ucy9ydWxlLmluc3RydWN0aW9ucy5tZCcsIGFwcGx5VG86IFsnc3JjLyoqJ10sIHR5cGU6ICdjaGlsZC1pbnN0cnVjdGlvbnMnIH0sXG5cdFx0XHRcdFx0XHRdLFxuXHRcdFx0XHRcdH0pLFxuXHRcdFx0XHR9LFxuXHRcdFx0XHRza2lsbHM6IHtcblx0XHRcdFx0XHRnZXREaXNjb3ZlcnlQYXRoczogYXN5bmMgKCkgPT4gKHsgcGF0aHM6IFtdIH0pLFxuXHRcdFx0XHRcdGRpc2NvdmVyOiBhc3luYyAoKSA9PiAoeyBza2lsbHM6IFtdIH0pLFxuXHRcdFx0XHR9LFxuXHRcdFx0fSxcblx0XHR9IGFzIHVua25vd24gYXMgQ29waWxvdENsaWVudDtcblxuXHRcdGNvbnN0IGN1c3RvbWl6YXRpb25zID0gYXdhaXQgZGlzY292ZXJ5LmRpc2NvdmVyKGNsaWVudCwgQ2FuY2VsbGF0aW9uVG9rZW4uTm9uZSk7XG5cdFx0Y29uc3QgcnVsZURpcmVjdG9yaWVzID0gY3VzdG9taXphdGlvbnNcblx0XHRcdC5maWx0ZXIoY3VzdG9taXphdGlvbiA9PiBjdXN0b21pemF0aW9uLmNvbnRlbnRzID09PSAncnVsZScpXG5cdFx0XHQubWFwKGN1c3RvbWl6YXRpb24gPT4gKHtcblx0XHRcdFx0dXJpOiBVUkkucGFyc2UoY3VzdG9taXphdGlvbi51cmkpLnBhdGgsXG5cdFx0XHRcdGNoaWxkcmVuOiAoY3VzdG9taXphdGlvbi5jaGlsZHJlbiA/PyBbXSkubWFwKGNoaWxkID0+IFVSSS5wYXJzZShjaGlsZC51cmkpLnBhdGgpLnNvcnQoKSxcblx0XHRcdH0pKVxuXHRcdFx0LnNvcnQoKGEsIGIpID0+IGEudXJpLmxvY2FsZUNvbXBhcmUoYi51cmkpKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocnVsZURpcmVjdG9yaWVzLCBbXG5cdFx0XHR7IHVyaTogJy93b3Jrc3BhY2UvLmdpdGh1Yi9pbnN0cnVjdGlvbnMnLCBjaGlsZHJlbjogWycvd29ya3NwYWNlLy5naXRodWIvaW5zdHJ1Y3Rpb25zL3J1bGUuaW5zdHJ1Y3Rpb25zLm1kJ10gfSxcblx0XHRdKTtcblx0fSk7XG5cblx0dGVzdCgnZGlzY292ZXIgcmV0dXJucyB3b3JraW5nLWRpcmVjdG9yeSBhZ2VudHMsIHNraWxscywgaW5zdHJ1Y3Rpb25zLCBob29rcywgYW5kIGFnZW50IGluc3RydWN0aW9ucycsIGFzeW5jICgpID0+IHtcblx0XHRhd2FpdCBzZWVkKCcvd29ya3NwYWNlLy5naXRodWIvYWdlbnRzL2Zvby5hZ2VudC5tZCcsICdhZ2VudCBib2R5Jyk7XG5cdFx0YXdhaXQgc2VlZCgnL3dvcmtzcGFjZS8uZ2l0aHViL3NraWxscy9iYXIvU0tJTEwubWQnLCAnc2tpbGwgYm9keScpO1xuXHRcdGF3YWl0IHNlZWQoJy93b3Jrc3BhY2UvLmdpdGh1Yi9pbnN0cnVjdGlvbnMvYmF6Lmluc3RydWN0aW9ucy5tZCcsICdpbnN0cnVjdGlvbiBib2R5Jyk7XG5cdFx0YXdhaXQgc2VlZCgnL3dvcmtzcGFjZS8uZ2l0aHViL2hvb2tzL3ByZS10b29sLmpzb24nLCAne1wiUHJlVG9vbFVzZVwiOiBbXX0nKTtcblx0XHRhd2FpdCBzZWVkKCcvd29ya3NwYWNlLy5naXRodWIvY29waWxvdC9zZXR0aW5ncy5qc29uJywgJ3tcImhvb2tzXCI6IHtcIlByZVRvb2xVc2VcIjogW119fScpO1xuXHRcdGF3YWl0IHNlZWQoJy93b3Jrc3BhY2UvLmdpdGh1Yi9jb3BpbG90LWluc3RydWN0aW9ucy5tZCcsICd3b3Jrc3BhY2UgY29waWxvdCBpbnN0cnVjdGlvbnMnKTtcblx0XHRhd2FpdCBzZWVkKCcvd29ya3NwYWNlL0FHRU5UUy5tZCcsICd3b3Jrc3BhY2UgYWdlbnRzIGluc3RydWN0aW9ucycpO1xuXHRcdGF3YWl0IHNlZWQoJy9ob21lLy5jb3BpbG90L2NvcGlsb3QtaW5zdHJ1Y3Rpb25zLm1kJywgJ3VzZXIgY29waWxvdCBpbnN0cnVjdGlvbnMnKTtcblxuXHRcdGNvbnN0IGRpc2NvdmVyeSA9IGRpc3Bvc2FibGVzLmFkZChpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShTZXNzaW9uQ3VzdG9taXphdGlvbkRpc2NvdmVyeSwgW3dvcmtzcGFjZV0sIHVzZXJIb21lLCBpbk1lbW9yeVBhdGhUb1VyaSkpO1xuXHRcdGNvbnN0IGNsaWVudCA9IHtcblx0XHRcdHJwYzoge1xuXHRcdFx0XHRhZ2VudHM6IHtcblx0XHRcdFx0XHRnZXREaXNjb3ZlcnlQYXRoczogYXN5bmMgKCkgPT4gKHsgcGF0aHM6IFt7IHBhdGg6ICcvd29ya3NwYWNlLy5naXRodWIvYWdlbnRzJyB9XSB9KSxcblx0XHRcdFx0XHRkaXNjb3ZlcjogYXN5bmMgKCkgPT4gKHtcblx0XHRcdFx0XHRcdGFnZW50czogW1xuXHRcdFx0XHRcdFx0XHR7IGlkOiAnYWdlbnQnLCBuYW1lOiAnQWdlbnQnLCBkZXNjcmlwdGlvbjogJ2FnZW50IGRlc2NyaXB0aW9uJywgcGF0aDogJy93b3Jrc3BhY2UvLmdpdGh1Yi9hZ2VudHMvZm9vLmFnZW50Lm1kJywgdXNlckludm9jYWJsZTogdHJ1ZSB9LFxuXHRcdFx0XHRcdFx0XSxcblx0XHRcdFx0XHR9KSxcblx0XHRcdFx0fSxcblx0XHRcdFx0aW5zdHJ1Y3Rpb25zOiB7XG5cdFx0XHRcdFx0Z2V0RGlzY292ZXJ5UGF0aHM6IGFzeW5jICgpID0+ICh7XG5cdFx0XHRcdFx0XHRwYXRoczogW1xuXHRcdFx0XHRcdFx0XHR7IHBhdGg6ICcvd29ya3NwYWNlLy5naXRodWIvaW5zdHJ1Y3Rpb25zJywga2luZDogJ2RpcmVjdG9yeScgfSxcblx0XHRcdFx0XHRcdFx0eyBwYXRoOiAnL3dvcmtzcGFjZS8uZ2l0aHViL2NvcGlsb3QtaW5zdHJ1Y3Rpb25zLm1kJywga2luZDogJ2ZpbGUnIH0sXG5cdFx0XHRcdFx0XHRcdHsgcGF0aDogJy93b3Jrc3BhY2UvQUdFTlRTLm1kJywga2luZDogJ2ZpbGUnIH0sXG5cdFx0XHRcdFx0XHRcdHsgcGF0aDogJy9ob21lLy5jb3BpbG90L2NvcGlsb3QtaW5zdHJ1Y3Rpb25zLm1kJywga2luZDogJ2ZpbGUnIH0sXG5cdFx0XHRcdFx0XHRdLFxuXHRcdFx0XHRcdH0pLFxuXHRcdFx0XHRcdGRpc2NvdmVyOiBhc3luYyAoKSA9PiAoe1xuXHRcdFx0XHRcdFx0c291cmNlczogW1xuXHRcdFx0XHRcdFx0XHR7IGlkOiAncnVsZScsIGxhYmVsOiAnUnVsZScsIGRlc2NyaXB0aW9uOiAncnVsZSBkZXNjcmlwdGlvbicsIHNvdXJjZVBhdGg6ICcvd29ya3NwYWNlLy5naXRodWIvaW5zdHJ1Y3Rpb25zL2Jhei5pbnN0cnVjdGlvbnMubWQnLCBhcHBseVRvOiBbXSB9LFxuXHRcdFx0XHRcdFx0XSxcblx0XHRcdFx0XHR9KSxcblx0XHRcdFx0fSxcblx0XHRcdFx0c2tpbGxzOiB7XG5cdFx0XHRcdFx0Z2V0RGlzY292ZXJ5UGF0aHM6IGFzeW5jICgpID0+ICh7IHBhdGhzOiBbeyBwYXRoOiAnL3dvcmtzcGFjZS8uZ2l0aHViL3NraWxscycgfV0gfSksXG5cdFx0XHRcdFx0ZGlzY292ZXI6IGFzeW5jICgpID0+ICh7XG5cdFx0XHRcdFx0XHRza2lsbHM6IFtcblx0XHRcdFx0XHRcdFx0eyBuYW1lOiAnU2tpbGwnLCBkZXNjcmlwdGlvbjogJ3NraWxsIGRlc2NyaXB0aW9uJywgcGF0aDogJy93b3Jrc3BhY2UvLmdpdGh1Yi9za2lsbHMvYmFyL1NLSUxMLm1kJyB9LFxuXHRcdFx0XHRcdFx0XSxcblx0XHRcdFx0XHR9KSxcblx0XHRcdFx0fSxcblx0XHRcdH0sXG5cdFx0fSBhcyB1bmtub3duIGFzIENvcGlsb3RDbGllbnQ7XG5cblx0XHRjb25zdCBjdXN0b21pemF0aW9ucyA9IGF3YWl0IGRpc2NvdmVyeS5kaXNjb3ZlcihjbGllbnQsIENhbmNlbGxhdGlvblRva2VuLk5vbmUpO1xuXHRcdGNvbnN0IGRpcmVjdG9yaWVzID0gY3VzdG9taXphdGlvbnNcblx0XHRcdC5tYXAoY3VzdG9taXphdGlvbiA9PiAoe1xuXHRcdFx0XHRjb250ZW50czogY3VzdG9taXphdGlvbi5jb250ZW50cyxcblx0XHRcdFx0dXJpOiBVUkkucGFyc2UoY3VzdG9taXphdGlvbi51cmkpLnBhdGgsXG5cdFx0XHRcdHdyaXRhYmxlOiBjdXN0b21pemF0aW9uLndyaXRhYmxlLFxuXHRcdFx0XHRjaGlsZHJlbjogKGN1c3RvbWl6YXRpb24uY2hpbGRyZW4gPz8gW10pLm1hcChjaGlsZCA9PiBVUkkucGFyc2UoY2hpbGQudXJpKS5wYXRoKS5zb3J0KCksXG5cdFx0XHR9KSlcblx0XHRcdC5zb3J0KChhLCBiKSA9PiBhLnVyaS5sb2NhbGVDb21wYXJlKGIudXJpKSk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGRpcmVjdG9yaWVzLCBbXG5cdFx0XHR7IGNvbnRlbnRzOiAncnVsZScsIHVyaTogJy9ob21lJywgd3JpdGFibGU6IGZhbHNlLCBjaGlsZHJlbjogWycvaG9tZS8uY29waWxvdC9jb3BpbG90LWluc3RydWN0aW9ucy5tZCddIH0sXG5cdFx0XHR7IGNvbnRlbnRzOiAnaG9vaycsIHVyaTogJy9ob21lLy5jb3BpbG90L2hvb2tzJywgd3JpdGFibGU6IHRydWUsIGNoaWxkcmVuOiBbXSB9LFxuXHRcdFx0eyBjb250ZW50czogJ3J1bGUnLCB1cmk6ICcvd29ya3NwYWNlJywgd3JpdGFibGU6IGZhbHNlLCBjaGlsZHJlbjogWycvd29ya3NwYWNlLy5naXRodWIvY29waWxvdC1pbnN0cnVjdGlvbnMubWQnLCAnL3dvcmtzcGFjZS9BR0VOVFMubWQnXSB9LFxuXHRcdFx0eyBjb250ZW50czogJ2FnZW50JywgdXJpOiAnL3dvcmtzcGFjZS8uZ2l0aHViL2FnZW50cycsIHdyaXRhYmxlOiB0cnVlLCBjaGlsZHJlbjogWycvd29ya3NwYWNlLy5naXRodWIvYWdlbnRzL2Zvby5hZ2VudC5tZCddIH0sXG5cdFx0XHR7IGNvbnRlbnRzOiAnaG9vaycsIHVyaTogJy93b3Jrc3BhY2UvLmdpdGh1Yi9jb3BpbG90Jywgd3JpdGFibGU6IHRydWUsIGNoaWxkcmVuOiBbJy93b3Jrc3BhY2UvLmdpdGh1Yi9jb3BpbG90L3NldHRpbmdzLmpzb24nXSB9LFxuXHRcdFx0eyBjb250ZW50czogJ2hvb2snLCB1cmk6ICcvd29ya3NwYWNlLy5naXRodWIvaG9va3MnLCB3cml0YWJsZTogdHJ1ZSwgY2hpbGRyZW46IFsnL3dvcmtzcGFjZS8uZ2l0aHViL2hvb2tzL3ByZS10b29sLmpzb24nXSB9LFxuXHRcdFx0eyBjb250ZW50czogJ3J1bGUnLCB1cmk6ICcvd29ya3NwYWNlLy5naXRodWIvaW5zdHJ1Y3Rpb25zJywgd3JpdGFibGU6IHRydWUsIGNoaWxkcmVuOiBbJy93b3Jrc3BhY2UvLmdpdGh1Yi9pbnN0cnVjdGlvbnMvYmF6Lmluc3RydWN0aW9ucy5tZCddIH0sXG5cdFx0XHR7IGNvbnRlbnRzOiAnc2tpbGwnLCB1cmk6ICcvd29ya3NwYWNlLy5naXRodWIvc2tpbGxzJywgd3JpdGFibGU6IHRydWUsIGNoaWxkcmVuOiBbJy93b3Jrc3BhY2UvLmdpdGh1Yi9za2lsbHMvYmFyL1NLSUxMLm1kJ10gfSxcblx0XHRdKTtcblx0fSk7XG5cblx0dGVzdCgnZGlzY292ZXIgZ3JvdXBzIGNhc2UtdmFyaWFudCBpbnN0cnVjdGlvbnMgYW5kIG5lc3RlZCBza2lsbHMgdW5kZXIgdGhlaXIgcm9vdHMnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgY2FzZVZhcmlhbnRVc2VySG9tZSA9IFVSSS5mcm9tKHsgc2NoZW1lOiBTY2hlbWFzLmluTWVtb3J5LCBwYXRoOiAnL0hPTUUnIH0pO1xuXHRcdGF3YWl0IHNlZWQoJy9ob21lLy5jb3BpbG90L2NvcGlsb3QtaW5zdHJ1Y3Rpb25zLm1kJywgJ3VzZXIgY29waWxvdCBpbnN0cnVjdGlvbnMnKTtcblx0XHRhd2FpdCBzZWVkKCcvd29ya3NwYWNlLy5naXRodWIvc2tpbGxzL2Jhci9TS0lMTC5tZCcsICdza2lsbCBib2R5Jyk7XG5cblx0XHRjb25zdCBkaXNjb3ZlcnkgPSBkaXNwb3NhYmxlcy5hZGQoaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoU2Vzc2lvbkN1c3RvbWl6YXRpb25EaXNjb3ZlcnksIFt3b3Jrc3BhY2VdLCBjYXNlVmFyaWFudFVzZXJIb21lLCBpbk1lbW9yeVBhdGhUb1VyaSkpO1xuXHRcdGNvbnN0IGNsaWVudCA9IHtcblx0XHRcdHJwYzoge1xuXHRcdFx0XHRhZ2VudHM6IHtcblx0XHRcdFx0XHRnZXREaXNjb3ZlcnlQYXRoczogYXN5bmMgKCkgPT4gKHsgcGF0aHM6IFtdIH0pLFxuXHRcdFx0XHRcdGRpc2NvdmVyOiBhc3luYyAoKSA9PiAoeyBhZ2VudHM6IFtdIH0pLFxuXHRcdFx0XHR9LFxuXHRcdFx0XHRpbnN0cnVjdGlvbnM6IHtcblx0XHRcdFx0XHRnZXREaXNjb3ZlcnlQYXRoczogYXN5bmMgKCkgPT4gKHsgcGF0aHM6IFt7IHBhdGg6ICcvaG9tZS8uY29waWxvdC9jb3BpbG90LWluc3RydWN0aW9ucy5tZCcsIGtpbmQ6ICdmaWxlJyB9XSB9KSxcblx0XHRcdFx0XHRkaXNjb3ZlcjogYXN5bmMgKCkgPT4gKHsgc291cmNlczogW3sgaWQ6ICd1c2VySW5zdHJ1Y3Rpb24nLCBsYWJlbDogJ1VzZXIgaW5zdHJ1Y3Rpb24nLCBzb3VyY2VQYXRoOiAnL2hvbWUvLmNvcGlsb3QvY29waWxvdC1pbnN0cnVjdGlvbnMubWQnLCB0eXBlOiAnaG9tZScgfV0gfSksXG5cdFx0XHRcdH0sXG5cdFx0XHRcdHNraWxsczoge1xuXHRcdFx0XHRcdGdldERpc2NvdmVyeVBhdGhzOiBhc3luYyAoKSA9PiAoe1xuXHRcdFx0XHRcdFx0cGF0aHM6IFtcblx0XHRcdFx0XHRcdFx0eyBwYXRoOiAnL3dvcmtzcGFjZS8uZ2l0aHViL3NraWxscycgfSxcblx0XHRcdFx0XHRcdFx0eyBwYXRoOiAnL3dvcmtzcGFjZS8uZ2l0aHViL3NraWxscy9iYXInIH0sXG5cdFx0XHRcdFx0XHRdXG5cdFx0XHRcdFx0fSksXG5cdFx0XHRcdFx0ZGlzY292ZXI6IGFzeW5jICgpID0+ICh7IHNraWxsczogW3sgbmFtZTogJ1NraWxsJywgZGVzY3JpcHRpb246ICdza2lsbCBkZXNjcmlwdGlvbicsIHBhdGg6ICcvd29ya3NwYWNlLy5naXRodWIvc2tpbGxzL2Jhci9TS0lMTC5tZCcgfV0gfSksXG5cdFx0XHRcdH0sXG5cdFx0XHR9LFxuXHRcdH0gYXMgdW5rbm93biBhcyBDb3BpbG90Q2xpZW50O1xuXG5cdFx0Y29uc3QgY3VzdG9taXphdGlvbnMgPSBhd2FpdCBkaXNjb3ZlcnkuZGlzY292ZXIoY2xpZW50LCBDYW5jZWxsYXRpb25Ub2tlbi5Ob25lKTtcblx0XHRjb25zdCBkaXJlY3RvcmllcyA9IGN1c3RvbWl6YXRpb25zXG5cdFx0XHQuZmlsdGVyKGN1c3RvbWl6YXRpb24gPT4gY3VzdG9taXphdGlvbi5jb250ZW50cyA9PT0gJ3J1bGUnIHx8IGN1c3RvbWl6YXRpb24uY29udGVudHMgPT09ICdza2lsbCcpXG5cdFx0XHQubWFwKGN1c3RvbWl6YXRpb24gPT4gKHtcblx0XHRcdFx0Y29udGVudHM6IGN1c3RvbWl6YXRpb24uY29udGVudHMsXG5cdFx0XHRcdHVyaTogVVJJLnBhcnNlKGN1c3RvbWl6YXRpb24udXJpKS5wYXRoLFxuXHRcdFx0XHRjaGlsZHJlbjogKGN1c3RvbWl6YXRpb24uY2hpbGRyZW4gPz8gW10pLm1hcChjaGlsZCA9PiBVUkkucGFyc2UoY2hpbGQudXJpKS5wYXRoKSxcblx0XHRcdH0pKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoZGlyZWN0b3JpZXMsIFtcblx0XHRcdHsgY29udGVudHM6ICdydWxlJywgdXJpOiAnL0hPTUUnLCBjaGlsZHJlbjogWycvaG9tZS8uY29waWxvdC9jb3BpbG90LWluc3RydWN0aW9ucy5tZCddIH0sXG5cdFx0XHR7IGNvbnRlbnRzOiAnc2tpbGwnLCB1cmk6ICcvd29ya3NwYWNlLy5naXRodWIvc2tpbGxzJywgY2hpbGRyZW46IFsnL3dvcmtzcGFjZS8uZ2l0aHViL3NraWxscy9iYXIvU0tJTEwubWQnXSB9LFxuXHRcdF0pO1xuXHR9KTtcblxuXHR0ZXN0KCdyZXR1cm5zIGRpcmVjdG9yaWVzIHNvcnRlZCBieSB0eXBlIGFuZCBVUkknLCBhc3luYyAoKSA9PiB7XG5cdFx0YXdhaXQgc2VlZCgnL3dvcmtzcGFjZS8uZ2l0aHViL2FnZW50cy9hYWEuYWdlbnQubWQnLCAnd29ya3NwYWNlIGFnZW50IGEnKTtcblx0XHRhd2FpdCBzZWVkKCcvd29ya3NwYWNlLy5naXRodWIvYWdlbnRzL2Zvby5hZ2VudC5tZCcsICd3b3Jrc3BhY2UgYWdlbnQnKTtcblx0XHRhd2FpdCBzZWVkKCcvd29ya3NwYWNlLy5naXRodWIvc2tpbGxzL2FscGhhL1NLSUxMLm1kJywgJ3dvcmtzcGFjZSBza2lsbCBhbHBoYScpO1xuXHRcdGF3YWl0IHNlZWQoJy93b3Jrc3BhY2UvLmdpdGh1Yi9za2lsbHMvYmFyL1NLSUxMLm1kJywgJ3dvcmtzcGFjZSBza2lsbCcpO1xuXHRcdGF3YWl0IHNlZWQoJy93b3Jrc3BhY2UvLmdpdGh1Yi9pbnN0cnVjdGlvbnMvYWxwaGEuaW5zdHJ1Y3Rpb25zLm1kJywgJ3dvcmtzcGFjZSBpbnN0cnVjdGlvbiBhbHBoYScpO1xuXHRcdGF3YWl0IHNlZWQoJy93b3Jrc3BhY2UvLmdpdGh1Yi9pbnN0cnVjdGlvbnMvYmF6Lmluc3RydWN0aW9ucy5tZCcsICd3b3Jrc3BhY2UgaW5zdHJ1Y3Rpb24nKTtcblx0XHRhd2FpdCBzZWVkKCcvd29ya3NwYWNlLy5naXRodWIvY29waWxvdC1pbnN0cnVjdGlvbnMubWQnLCAnd29ya3NwYWNlIGNvcGlsb3QgaW5zdHJ1Y3Rpb25zJyk7XG5cdFx0YXdhaXQgc2VlZCgnL2hvbWUvLmNvcGlsb3QvYWdlbnRzL2FiYy5hZ2VudC5tZCcsICd1c2VyIGFnZW50IGFiYycpO1xuXHRcdGF3YWl0IHNlZWQoJy9ob21lLy5jb3BpbG90L2FnZW50cy9xdXguYWdlbnQubWQnLCAndXNlciBhZ2VudCcpO1xuXHRcdGF3YWl0IHNlZWQoJy9ob21lLy5jb3BpbG90L3NraWxscy9hbHBoYS9TS0lMTC5tZCcsICd1c2VyIGNvcGlsb3Qgc2tpbGwnKTtcblx0XHRhd2FpdCBzZWVkKCcvaG9tZS8uYWdlbnRzL3NraWxscy9hYWEvU0tJTEwubWQnLCAndXNlciBza2lsbCBhYWEnKTtcblx0XHRhd2FpdCBzZWVkKCcvaG9tZS8uYWdlbnRzL3NraWxscy96YXAvU0tJTEwubWQnLCAndXNlciBza2lsbCcpO1xuXG5cdFx0Y29uc3QgZGlzY292ZXJ5ID0gZGlzcG9zYWJsZXMuYWRkKGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFNlc3Npb25DdXN0b21pemF0aW9uRGlzY292ZXJ5LCBbd29ya3NwYWNlXSwgdXNlckhvbWUsIFVSSS5maWxlKSk7XG5cdFx0Y29uc3QgZGlyZWN0b3JpZXMgPSBhd2FpdCBkaXNjb3Zlcnkuc2NhbihDYW5jZWxsYXRpb25Ub2tlbi5Ob25lKTtcblx0XHRjb25zdCBhY3R1YWwgPSBkaXJlY3Rvcmllcy5tYXAoZGlyZWN0b3J5ID0+IGAke2RpcmVjdG9yeS50eXBlfToke2RpcmVjdG9yeS51cmkudG9TdHJpbmcoKX1gKTtcblx0XHRjb25zdCBleHBlY3RlZCA9IFsuLi5hY3R1YWxdLnNvcnQoKGEsIGIpID0+IGEgPCBiID8gLTEgOiBhID4gYiA/IDEgOiAwKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoYWN0dWFsLCBleHBlY3RlZCk7XG5cdFx0Zm9yIChjb25zdCBkaXJlY3Rvcnkgb2YgZGlyZWN0b3JpZXMpIHtcblx0XHRcdGNvbnN0IGFjdHVhbEZpbGVzID0gZGlyZWN0b3J5LmZpbGVzLm1hcChmaWxlID0+IGZpbGUudXJpLnRvU3RyaW5nKCkpO1xuXHRcdFx0Y29uc3QgZXhwZWN0ZWRGaWxlcyA9IFsuLi5hY3R1YWxGaWxlc10uc29ydCgoYSwgYikgPT4gYSA8IGIgPyAtMSA6IGEgPiBiID8gMSA6IDApO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChhY3R1YWxGaWxlcywgZXhwZWN0ZWRGaWxlcyk7XG5cdFx0fVxuXHR9KTtcblxuXHR0ZXN0KCdkb2VzIG5vdCBkaXNjb3ZlciBhZ2VudCBpbnN0cnVjdGlvbiBmaWxlcyBvdXRzaWRlIHN1cHBvcnRlZCByb290cycsIGFzeW5jICgpID0+IHtcblx0XHRhd2FpdCBzZWVkKCcvd29ya3NwYWNlLy5naXRodWIvY29waWxvdC1pbnN0cnVjdGlvbnMubWQnLCAnd29ya3NwYWNlIGNvcGlsb3QgaW5zdHJ1Y3Rpb25zJyk7XG5cdFx0YXdhaXQgc2VlZCgnL3dvcmtzcGFjZS9kb2NzL0FHRU5UUy5tZCcsICd1bnN1cHBvcnRlZCByb290Jyk7XG5cdFx0YXdhaXQgc2VlZCgnL3dvcmtzcGFjZS8uY2xhdWRlL0dFTUlOSS5tZCcsICd1bnN1cHBvcnRlZCBmaWxlbmFtZSBpbiAuY2xhdWRlJyk7XG5cdFx0YXdhaXQgc2VlZCgnL2hvbWUvY29waWxvdC1pbnN0cnVjdGlvbnMubWQnLCAndW5zdXBwb3J0ZWQgaG9tZSByb290Jyk7XG5cblx0XHRjb25zdCBkaXNjb3ZlcnkgPSBkaXNwb3NhYmxlcy5hZGQoaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoU2Vzc2lvbkN1c3RvbWl6YXRpb25EaXNjb3ZlcnksIFt3b3Jrc3BhY2VdLCB1c2VySG9tZSwgVVJJLmZpbGUpKTtcblx0XHRjb25zdCBmaWxlcyA9IChhd2FpdCBkaXNjb3Zlcnkuc2NhbihDYW5jZWxsYXRpb25Ub2tlbi5Ob25lKSlcblx0XHRcdC5mbGF0TWFwKGRpcmVjdG9yeSA9PiBkaXJlY3RvcnkuZmlsZXMubWFwKGZpbGUgPT4gKHsgdXJpOiBmaWxlLnVyaSwgdHlwZTogZGlyZWN0b3J5LnR5cGUgfSkpKVxuXHRcdFx0LmZpbHRlcihlbnRyeSA9PiBlbnRyeS50eXBlID09PSBEaXNjb3ZlcmVkVHlwZS5BZ2VudEluc3RydWN0aW9uKVxuXHRcdFx0Lm1hcChlbnRyeSA9PiBlbnRyeS51cmkudG9TdHJpbmcoKSlcblx0XHRcdC5zb3J0KChhLCBiKSA9PiBhLmxvY2FsZUNvbXBhcmUoYikpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChmaWxlcywgW1xuXHRcdFx0VVJJLmZyb20oeyBzY2hlbWU6IFNjaGVtYXMuaW5NZW1vcnksIHBhdGg6ICcvd29ya3NwYWNlLy5naXRodWIvY29waWxvdC1pbnN0cnVjdGlvbnMubWQnIH0pLnRvU3RyaW5nKCksXG5cdFx0XSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2luc3RhbGxzIHdhdGNoZXJzIGZvciByb290cyB0aGF0IGNvbnRhaW4gZGlzY292ZXJlZCBjdXN0b21pemF0aW9ucycsIGFzeW5jICgpID0+IHtcblx0XHRhd2FpdCBzZWVkKCcvd29ya3NwYWNlLy5naXRodWIvYWdlbnRzL2Zvby5hZ2VudC5tZCcsICd3b3Jrc3BhY2UgYWdlbnQnKTtcblx0XHRhd2FpdCBzZWVkKCcvd29ya3NwYWNlLy5naXRodWIvc2tpbGxzL2Jhci9TS0lMTC5tZCcsICd3b3Jrc3BhY2Ugc2tpbGwnKTtcblx0XHRhd2FpdCBzZWVkKCcvd29ya3NwYWNlLy5naXRodWIvaW5zdHJ1Y3Rpb25zL3J1bGVzLmluc3RydWN0aW9ucy5tZCcsICd3b3Jrc3BhY2UgaW5zdHJ1Y3Rpb24nKTtcblx0XHRhd2FpdCBzZWVkKCcvd29ya3NwYWNlLy5naXRodWIvaG9va3MvcHJlLXRvb2wuanNvbicsICd7XCJQcmVUb29sVXNlXCI6IFtdfScpO1xuXHRcdGF3YWl0IHNlZWQoJy93b3Jrc3BhY2UvLmdpdGh1Yi9jb3BpbG90LWluc3RydWN0aW9ucy5tZCcsICd3b3Jrc3BhY2UgY29waWxvdCBpbnN0cnVjdGlvbnMnKTtcblx0XHRhd2FpdCBzZWVkKCcvd29ya3NwYWNlLy5jbGF1ZGUvQ0xBVURFLm1kJywgJ3dvcmtzcGFjZSBjbGF1ZGUgaW5zdHJ1Y3Rpb24nKTtcblx0XHRhd2FpdCBzZWVkKCcvaG9tZS8uY29waWxvdC9hZ2VudHMvdXNlci5hZ2VudC5tZCcsICd1c2VyIGFnZW50Jyk7XG5cdFx0YXdhaXQgc2VlZCgnL2hvbWUvLmNvcGlsb3Qvc2tpbGxzL2NvcGlsb3QtdXNlci1za2lsbC9TS0lMTC5tZCcsICd1c2VyIGNvcGlsb3Qgc2tpbGwnKTtcblx0XHRhd2FpdCBzZWVkKCcvaG9tZS8uYWdlbnRzL3NraWxscy91c2VyLXNraWxsL1NLSUxMLm1kJywgJ3VzZXIgc2tpbGwnKTtcblx0XHRhd2FpdCBzZWVkKCcvaG9tZS8uY29waWxvdC9pbnN0cnVjdGlvbnMvdXNlci5pbnN0cnVjdGlvbnMubWQnLCAndXNlciBpbnN0cnVjdGlvbicpO1xuXHRcdGF3YWl0IHNlZWQoJy9ob21lLy5jb3BpbG90L2hvb2tzL3Bvc3QtdG9vbC5qc29uJywgJ3tcIlBvc3RUb29sVXNlXCI6IFtdfScpO1xuXHRcdGF3YWl0IHNlZWQoJy9ob21lLy5jb3BpbG90L2NvcGlsb3QtaW5zdHJ1Y3Rpb25zLm1kJywgJ3VzZXIgY29waWxvdCBpbnN0cnVjdGlvbnMnKTtcblxuXHRcdGNvbnN0IHdhdGNoQ2FsbHM6IEFycmF5PHsgcmVzb3VyY2U6IHN0cmluZzsgcmVjdXJzaXZlOiBib29sZWFuIH0+ID0gW107XG5cdFx0Y29uc3Qgb3JpZ2luYWxXYXRjaCA9IGZpbGVTZXJ2aWNlLndhdGNoLmJpbmQoZmlsZVNlcnZpY2UpO1xuXHRcdGRpc3Bvc2FibGVzLmFkZCh7IGRpc3Bvc2U6ICgpID0+IHsgZmlsZVNlcnZpY2Uud2F0Y2ggPSBvcmlnaW5hbFdhdGNoIGFzIHR5cGVvZiBmaWxlU2VydmljZS53YXRjaDsgfSB9KTtcblx0XHRmaWxlU2VydmljZS53YXRjaCA9ICgocmVzb3VyY2UsIG9wdGlvbnMpID0+IHtcblx0XHRcdHdhdGNoQ2FsbHMucHVzaCh7IHJlc291cmNlOiByZXNvdXJjZS50b1N0cmluZygpLCByZWN1cnNpdmU6IG9wdGlvbnM/LnJlY3Vyc2l2ZSA9PT0gdHJ1ZSB9KTtcblx0XHRcdHJldHVybiBvcmlnaW5hbFdhdGNoKHJlc291cmNlLCBvcHRpb25zKTtcblx0XHR9KSBhcyB0eXBlb2YgZmlsZVNlcnZpY2Uud2F0Y2g7XG5cblx0XHRjb25zdCBkaXNjb3ZlcnkgPSBkaXNwb3NhYmxlcy5hZGQoaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoU2Vzc2lvbkN1c3RvbWl6YXRpb25EaXNjb3ZlcnksIFt3b3Jrc3BhY2VdLCB1c2VySG9tZSwgVVJJLmZpbGUpKTtcblx0XHRhd2FpdCBkaXNjb3Zlcnkuc2NhbihDYW5jZWxsYXRpb25Ub2tlbi5Ob25lKTtcblxuXHRcdGNvbnN0IHdhdGNoZWQgPSBuZXcgTWFwPHN0cmluZywgYm9vbGVhbj4oKTtcblx0XHRmb3IgKGNvbnN0IGNhbGwgb2Ygd2F0Y2hDYWxscykge1xuXHRcdFx0Y29uc3QgcHJldmlvdXMgPSB3YXRjaGVkLmdldChjYWxsLnJlc291cmNlKTtcblx0XHRcdHdhdGNoZWQuc2V0KGNhbGwucmVzb3VyY2UsIHByZXZpb3VzID09PSB0cnVlIHx8IGNhbGwucmVjdXJzaXZlKTtcblx0XHR9XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHdhdGNoZWQuZ2V0KHdvcmtzcGFjZS50b1N0cmluZygpKSwgZmFsc2UpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh3YXRjaGVkLmdldChVUkkuam9pblBhdGgod29ya3NwYWNlLCAnLmdpdGh1YicpLnRvU3RyaW5nKCkpLCBmYWxzZSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHdhdGNoZWQuZ2V0KFVSSS5qb2luUGF0aCh3b3Jrc3BhY2UsICcuY2xhdWRlJykudG9TdHJpbmcoKSksIGZhbHNlKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwod2F0Y2hlZC5nZXQoVVJJLmpvaW5QYXRoKHdvcmtzcGFjZSwgJy5naXRodWInLCAnYWdlbnRzJykudG9TdHJpbmcoKSksIGZhbHNlKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwod2F0Y2hlZC5nZXQoVVJJLmpvaW5QYXRoKHdvcmtzcGFjZSwgJy5naXRodWInLCAnc2tpbGxzJykudG9TdHJpbmcoKSksIHRydWUpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh3YXRjaGVkLmdldChVUkkuam9pblBhdGgod29ya3NwYWNlLCAnLmdpdGh1YicsICdpbnN0cnVjdGlvbnMnKS50b1N0cmluZygpKSwgdHJ1ZSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHdhdGNoZWQuZ2V0KFVSSS5qb2luUGF0aCh3b3Jrc3BhY2UsICcuZ2l0aHViJywgJ2hvb2tzJykudG9TdHJpbmcoKSksIHRydWUpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh3YXRjaGVkLmdldChVUkkuam9pblBhdGgodXNlckhvbWUsICcuY29waWxvdCcpLnRvU3RyaW5nKCkpLCBmYWxzZSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHdhdGNoZWQuZ2V0KFVSSS5qb2luUGF0aCh1c2VySG9tZSwgJy5jb3BpbG90JywgJ2FnZW50cycpLnRvU3RyaW5nKCkpLCBmYWxzZSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHdhdGNoZWQuZ2V0KFVSSS5qb2luUGF0aCh1c2VySG9tZSwgJy5jb3BpbG90JywgJ3NraWxscycpLnRvU3RyaW5nKCkpLCB0cnVlKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwod2F0Y2hlZC5nZXQoVVJJLmpvaW5QYXRoKHVzZXJIb21lLCAnLmFnZW50cycsICdza2lsbHMnKS50b1N0cmluZygpKSwgdHJ1ZSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHdhdGNoZWQuZ2V0KFVSSS5qb2luUGF0aCh1c2VySG9tZSwgJy5jb3BpbG90JywgJ2luc3RydWN0aW9ucycpLnRvU3RyaW5nKCkpLCB0cnVlKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwod2F0Y2hlZC5nZXQoVVJJLmpvaW5QYXRoKHVzZXJIb21lLCAnLmNvcGlsb3QnLCAnaG9va3MnKS50b1N0cmluZygpKSwgdHJ1ZSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3JlZnJlc2gga2VlcHMgZXhpc3Rpbmcgd2F0Y2hlcnMgd2hlbiBkaXNjb3ZlcmVkIHJvb3RzIGFyZSB1bmNoYW5nZWQnLCBhc3luYyAoKSA9PiB7XG5cdFx0YXdhaXQgc2VlZCgnL3dvcmtzcGFjZS8uZ2l0aHViL2FnZW50cy9mb28uYWdlbnQubWQnLCAnd29ya3NwYWNlIGFnZW50Jyk7XG5cblx0XHRjb25zdCB3YXRjaENhbGxzOiBzdHJpbmdbXSA9IFtdO1xuXHRcdGxldCB3YXRjaERpc3Bvc2VDYWxscyA9IDA7XG5cdFx0Y29uc3Qgb3JpZ2luYWxXYXRjaCA9IGZpbGVTZXJ2aWNlLndhdGNoLmJpbmQoZmlsZVNlcnZpY2UpO1xuXHRcdGRpc3Bvc2FibGVzLmFkZCh7IGRpc3Bvc2U6ICgpID0+IHsgZmlsZVNlcnZpY2Uud2F0Y2ggPSBvcmlnaW5hbFdhdGNoIGFzIHR5cGVvZiBmaWxlU2VydmljZS53YXRjaDsgfSB9KTtcblx0XHRmaWxlU2VydmljZS53YXRjaCA9ICgocmVzb3VyY2UsIG9wdGlvbnMpID0+IHtcblx0XHRcdHdhdGNoQ2FsbHMucHVzaChyZXNvdXJjZS50b1N0cmluZygpKTtcblx0XHRcdGNvbnN0IGRpc3Bvc2FibGUgPSBvcmlnaW5hbFdhdGNoKHJlc291cmNlLCBvcHRpb25zKTtcblx0XHRcdHJldHVybiB7XG5cdFx0XHRcdGRpc3Bvc2U6ICgpID0+IHtcblx0XHRcdFx0XHR3YXRjaERpc3Bvc2VDYWxscysrO1xuXHRcdFx0XHRcdGRpc3Bvc2FibGUuZGlzcG9zZSgpO1xuXHRcdFx0XHR9XG5cdFx0XHR9O1xuXHRcdH0pIGFzIHR5cGVvZiBmaWxlU2VydmljZS53YXRjaDtcblxuXHRcdGNvbnN0IGRpc2NvdmVyeSA9IGRpc3Bvc2FibGVzLmFkZChpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShTZXNzaW9uQ3VzdG9taXphdGlvbkRpc2NvdmVyeSwgW3dvcmtzcGFjZV0sIHVzZXJIb21lLCBVUkkuZmlsZSkpO1xuXHRcdGF3YWl0IGRpc2NvdmVyeS5zY2FuKENhbmNlbGxhdGlvblRva2VuLk5vbmUpO1xuXHRcdGNvbnN0IHdhdGNoQ2FsbHNBZnRlckZpcnN0U2NhbiA9IHdhdGNoQ2FsbHMubGVuZ3RoO1xuXG5cdFx0YXdhaXQgZGlzY292ZXJ5LnNjYW4oQ2FuY2VsbGF0aW9uVG9rZW4uTm9uZSk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwod2F0Y2hDYWxscy5sZW5ndGgsIHdhdGNoQ2FsbHNBZnRlckZpcnN0U2NhbiwgJ2V4cGVjdGVkIG5vIG5ldyB3YXRjaCByZWdpc3RyYXRpb25zIGZvciB1bmNoYW5nZWQgcm9vdHMnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwod2F0Y2hEaXNwb3NlQ2FsbHMsIDAsICdleHBlY3RlZCBleGlzdGluZyB3YXRjaGVycyB0byByZW1haW4gYWN0aXZlIGZvciB1bmNoYW5nZWQgcm9vdHMnKTtcblx0fSk7XG5cblx0dGVzdCgnZmlyZXMgb25EaWRDaGFuZ2Ugd2hlbiBhIG5ldyBhZ2VudCBmaWxlIGlzIGFkZGVkIHVuZGVyIGEgbm9uLXJlY3Vyc2l2ZWx5IHdhdGNoZWQgcm9vdCcsIGFzeW5jICgpID0+IHtcblx0XHQvLyBTZWVkIGFuIGV4aXN0aW5nIGFnZW50IHNvIGAuZ2l0aHViL2FnZW50c2AgaXMgZGlzY292ZXJlZCBhbmQgd2F0Y2hlZC5cblx0XHRhd2FpdCBzZWVkKCcvd29ya3NwYWNlLy5naXRodWIvYWdlbnRzL2Zvby5hZ2VudC5tZCcsICd3b3Jrc3BhY2UgYWdlbnQnKTtcblxuXHRcdGNvbnN0IGRpc2NvdmVyeSA9IGRpc3Bvc2FibGVzLmFkZChpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShTZXNzaW9uQ3VzdG9taXphdGlvbkRpc2NvdmVyeSwgW3dvcmtzcGFjZV0sIHVzZXJIb21lLCBVUkkuZmlsZSkpO1xuXHRcdGF3YWl0IGRpc2NvdmVyeS5zY2FuKENhbmNlbGxhdGlvblRva2VuLk5vbmUpO1xuXG5cdFx0Ly8gRmx1c2ggYnVmZmVyZWQgZmlsZSBjaGFuZ2UgZXZlbnRzIGZyb20gdGhlIGluaXRpYWwgc2VlZC9zY2FuIHNvIHRoZVxuXHRcdC8vIGFzc2VydGlvbiBiZWxvdyBvbmx5IG9ic2VydmVzIHRoZSBldmVudCB0cmlnZ2VyZWQgYnkgdGhlIG5ldyBmaWxlLlxuXHRcdGF3YWl0IHRpbWVvdXQoNTApO1xuXG5cdFx0bGV0IGNoYW5nZUNvdW50ID0gMDtcblx0XHRjb25zdCBmaXJlZCA9IG5ldyBEZWZlcnJlZFByb21pc2U8dm9pZD4oKTtcblx0XHRkaXNwb3NhYmxlcy5hZGQoZGlzY292ZXJ5Lm9uRGlkQ2hhbmdlKCgpID0+IHtcblx0XHRcdGNoYW5nZUNvdW50Kys7XG5cdFx0XHRmaXJlZC5jb21wbGV0ZSgpO1xuXHRcdH0pKTtcblxuXHRcdGF3YWl0IHNlZWQoJy93b3Jrc3BhY2UvLmdpdGh1Yi9hZ2VudHMvYmFyLmFnZW50Lm1kJywgJ25ldyB3b3Jrc3BhY2UgYWdlbnQnKTtcblx0XHRhd2FpdCByYWNlVGltZW91dChmaXJlZC5wLCA1MDApO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNoYW5nZUNvdW50LCAxLCAnZXhwZWN0ZWQgb25EaWRDaGFuZ2UgdG8gZmlyZSBmb3IgYSBuZXcgYWdlbnQgZmlsZSBpbnNpZGUgdGhlIHdhdGNoZWQgZGlyZWN0b3J5Jyk7XG5cdH0pO1xuXG5cdHRlc3QoJ2ZpcmVzIG9uRGlkQ2hhbmdlIHdoZW4gYW4gZXhpc3RpbmcgYWdlbnQgZmlsZSBpcyBtb2RpZmllZCB1bmRlciBhIG5vbi1yZWN1cnNpdmVseSB3YXRjaGVkIHJvb3QnLCBhc3luYyAoKSA9PiB7XG5cdFx0YXdhaXQgc2VlZCgnL3dvcmtzcGFjZS8uZ2l0aHViL2FnZW50cy9mb28uYWdlbnQubWQnLCAnd29ya3NwYWNlIGFnZW50Jyk7XG5cblx0XHRjb25zdCBkaXNjb3ZlcnkgPSBkaXNwb3NhYmxlcy5hZGQoaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoU2Vzc2lvbkN1c3RvbWl6YXRpb25EaXNjb3ZlcnksIFt3b3Jrc3BhY2VdLCB1c2VySG9tZSwgVVJJLmZpbGUpKTtcblx0XHRhd2FpdCBkaXNjb3Zlcnkuc2NhbihDYW5jZWxsYXRpb25Ub2tlbi5Ob25lKTtcblx0XHRhd2FpdCB0aW1lb3V0KDUwKTtcblxuXHRcdGxldCBjaGFuZ2VDb3VudCA9IDA7XG5cdFx0Y29uc3QgZmlyZWQgPSBuZXcgRGVmZXJyZWRQcm9taXNlPHZvaWQ+KCk7XG5cdFx0ZGlzcG9zYWJsZXMuYWRkKGRpc2NvdmVyeS5vbkRpZENoYW5nZSgoKSA9PiB7XG5cdFx0XHRjaGFuZ2VDb3VudCsrO1xuXHRcdFx0ZmlyZWQuY29tcGxldGUoKTtcblx0XHR9KSk7XG5cblx0XHQvLyBPdmVyd3JpdGUgdGhlIGV4aXN0aW5nIGFnZW50IGZpbGUgdG8gcHJvZHVjZSBhbiBVUERBVEVEIGV2ZW50LlxuXHRcdGF3YWl0IHNlZWQoJy93b3Jrc3BhY2UvLmdpdGh1Yi9hZ2VudHMvZm9vLmFnZW50Lm1kJywgJ3dvcmtzcGFjZSBhZ2VudCAodXBkYXRlZCknKTtcblx0XHRhd2FpdCByYWNlVGltZW91dChmaXJlZC5wLCA1MDApO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNoYW5nZUNvdW50LCAxLCAnZXhwZWN0ZWQgb25EaWRDaGFuZ2UgdG8gZmlyZSB3aGVuIGFuIGV4aXN0aW5nIGFnZW50IGZpbGUgaXMgbW9kaWZpZWQnKTtcblx0fSk7XG5cblx0dGVzdCgnZmlyZXMgb25EaWRDaGFuZ2Ugd2hlbiBhbiBleGlzdGluZyBhZ2VudCBmaWxlIGlzIGRlbGV0ZWQgdW5kZXIgYSBub24tcmVjdXJzaXZlbHkgd2F0Y2hlZCByb290JywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IGFnZW50VXJpID0gYXdhaXQgc2VlZCgnL3dvcmtzcGFjZS8uZ2l0aHViL2FnZW50cy9mb28uYWdlbnQubWQnLCAnd29ya3NwYWNlIGFnZW50Jyk7XG5cdFx0Ly8gU2VlZCBhIHNlY29uZCBhZ2VudCBzbyB0aGUgcGFyZW50IGRpcmVjdG9yeSBzdGlsbCBleGlzdHMgYWZ0ZXIgdGhlIGRlbGV0aW9uLlxuXHRcdGF3YWl0IHNlZWQoJy93b3Jrc3BhY2UvLmdpdGh1Yi9hZ2VudHMvYmFyLmFnZW50Lm1kJywgJ3dvcmtzcGFjZSBhZ2VudCBiYXInKTtcblxuXHRcdGNvbnN0IGRpc2NvdmVyeSA9IGRpc3Bvc2FibGVzLmFkZChpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShTZXNzaW9uQ3VzdG9taXphdGlvbkRpc2NvdmVyeSwgW3dvcmtzcGFjZV0sIHVzZXJIb21lLCBVUkkuZmlsZSkpO1xuXHRcdGF3YWl0IGRpc2NvdmVyeS5zY2FuKENhbmNlbGxhdGlvblRva2VuLk5vbmUpO1xuXHRcdGF3YWl0IHRpbWVvdXQoNTApO1xuXG5cdFx0bGV0IGNoYW5nZUNvdW50ID0gMDtcblx0XHRjb25zdCBmaXJlZCA9IG5ldyBEZWZlcnJlZFByb21pc2U8dm9pZD4oKTtcblx0XHRkaXNwb3NhYmxlcy5hZGQoZGlzY292ZXJ5Lm9uRGlkQ2hhbmdlKCgpID0+IHtcblx0XHRcdGNoYW5nZUNvdW50Kys7XG5cdFx0XHRmaXJlZC5jb21wbGV0ZSgpO1xuXHRcdH0pKTtcblxuXHRcdGF3YWl0IGZpbGVTZXJ2aWNlLmRlbChhZ2VudFVyaSk7XG5cdFx0YXdhaXQgcmFjZVRpbWVvdXQoZmlyZWQucCwgNTAwKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChjaGFuZ2VDb3VudCwgMSwgJ2V4cGVjdGVkIG9uRGlkQ2hhbmdlIHRvIGZpcmUgd2hlbiBhbiBleGlzdGluZyBhZ2VudCBmaWxlIGlzIGRlbGV0ZWQnKTtcblx0fSk7XG5cblx0dGVzdCgnZmlyZXMgb25EaWRDaGFuZ2Ugd2hlbiBBR0VOVFMubWQgaW4gdGhlIHdvcmtzcGFjZSByb290IGlzIG1vZGlmaWVkJywgYXN5bmMgKCkgPT4ge1xuXHRcdC8vIEFHRU5UUy5tZCBsaXZlcyBkaXJlY3RseSB1bmRlciB0aGUgd29ya3NwYWNlIHJvb3QsIHdoaWNoIGlzIHdhdGNoZWQgbm9uLXJlY3Vyc2l2ZWx5LlxuXHRcdGF3YWl0IHNlZWQoJy93b3Jrc3BhY2UvQUdFTlRTLm1kJywgJ2FnZW50cyBpbnN0cnVjdGlvbnMnKTtcblxuXHRcdGNvbnN0IGRpc2NvdmVyeSA9IGRpc3Bvc2FibGVzLmFkZChpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShTZXNzaW9uQ3VzdG9taXphdGlvbkRpc2NvdmVyeSwgW3dvcmtzcGFjZV0sIHVzZXJIb21lLCBVUkkuZmlsZSkpO1xuXHRcdGF3YWl0IGRpc2NvdmVyeS5zY2FuKENhbmNlbGxhdGlvblRva2VuLk5vbmUpO1xuXHRcdGF3YWl0IHRpbWVvdXQoNTApO1xuXG5cdFx0bGV0IGNoYW5nZUNvdW50ID0gMDtcblx0XHRjb25zdCBmaXJlZCA9IG5ldyBEZWZlcnJlZFByb21pc2U8dm9pZD4oKTtcblx0XHRkaXNwb3NhYmxlcy5hZGQoZGlzY292ZXJ5Lm9uRGlkQ2hhbmdlKCgpID0+IHtcblx0XHRcdGNoYW5nZUNvdW50Kys7XG5cdFx0XHRmaXJlZC5jb21wbGV0ZSgpO1xuXHRcdH0pKTtcblxuXHRcdGF3YWl0IHNlZWQoJy93b3Jrc3BhY2UvQUdFTlRTLm1kJywgJ2FnZW50cyBpbnN0cnVjdGlvbnMgKHVwZGF0ZWQpJyk7XG5cdFx0YXdhaXQgcmFjZVRpbWVvdXQoZmlyZWQucCwgNTAwKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChjaGFuZ2VDb3VudCwgMSwgJ2V4cGVjdGVkIG9uRGlkQ2hhbmdlIHRvIGZpcmUgd2hlbiBBR0VOVFMubWQgYXQgdGhlIHdvcmtzcGFjZSByb290IGlzIG1vZGlmaWVkJyk7XG5cdH0pO1xuXG5cdHRlc3QoJ2RvZXMgbm90IGZpcmUgb25EaWRDaGFuZ2UgZm9yIGZpbGVzIG91dHNpZGUgYW55IHRyaWdnZXIgVVJJJywgYXN5bmMgKCkgPT4ge1xuXHRcdC8vIFNlZWQgYSBjdXN0b21pemF0aW9uIHNvIHRoZSB3b3Jrc3BhY2UgKyBgLmdpdGh1YmAgZGlycyBnZXQgd2F0Y2hlcnMuXG5cdFx0YXdhaXQgc2VlZCgnL3dvcmtzcGFjZS8uZ2l0aHViL2FnZW50cy9mb28uYWdlbnQubWQnLCAnd29ya3NwYWNlIGFnZW50Jyk7XG5cblx0XHRjb25zdCBkaXNjb3ZlcnkgPSBkaXNwb3NhYmxlcy5hZGQoaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoU2Vzc2lvbkN1c3RvbWl6YXRpb25EaXNjb3ZlcnksIFt3b3Jrc3BhY2VdLCB1c2VySG9tZSwgVVJJLmZpbGUpKTtcblx0XHRhd2FpdCBkaXNjb3Zlcnkuc2NhbihDYW5jZWxsYXRpb25Ub2tlbi5Ob25lKTtcblx0XHRhd2FpdCB0aW1lb3V0KDUwKTtcblxuXHRcdGxldCBjaGFuZ2VDb3VudCA9IDA7XG5cdFx0ZGlzcG9zYWJsZXMuYWRkKGRpc2NvdmVyeS5vbkRpZENoYW5nZSgoKSA9PiB7XG5cdFx0XHRjaGFuZ2VDb3VudCsrO1xuXHRcdH0pKTtcblxuXHRcdC8vIE5vbmUgb2YgdGhlc2UgcGF0aHMgaW50ZXJzZWN0IGFueSB0cmlnZ2VyIFVSSTpcblx0XHQvLyAgLSBgLmdpdC9IRUFEYCAgICAgICAgICAgICA6IGAuZ2l0YCBpcyB1bnJlbGF0ZWQgKG5vdCBgLmdpdGh1YmApXG5cdFx0Ly8gIC0gYC52c2NvZGUvc2V0dGluZ3MuanNvbmAgOiBgLnZzY29kZWAgaXMgdW5yZWxhdGVkXG5cdFx0Ly8gIC0gYFJFQURNRS5tZGAgICAgICAgICAgICAgOiBhdCB3b3Jrc3BhY2Ugcm9vdCBidXQgbm90IEFHRU5UUy5tZC9DTEFVREUubWQvR0VNSU5JLm1kXG5cdFx0Ly8gIC0gYHNyYy9pbmRleC50c2AgICAgICAgICAgOiB1bnJlbGF0ZWQgdG9wLWxldmVsIGRpcmVjdG9yeVxuXHRcdGF3YWl0IHNlZWQoJy93b3Jrc3BhY2UvLmdpdC9IRUFEJywgJ3JlZjogcmVmcy9oZWFkcy9tYWluJyk7XG5cdFx0YXdhaXQgc2VlZCgnL3dvcmtzcGFjZS8udnNjb2RlL3NldHRpbmdzLmpzb24nLCAne30nKTtcblx0XHRhd2FpdCBzZWVkKCcvd29ya3NwYWNlL1JFQURNRS5tZCcsICcjIHByb2plY3QnKTtcblx0XHRhd2FpdCBzZWVkKCcvd29ya3NwYWNlL3NyYy9pbmRleC50cycsICdleHBvcnQge307Jyk7XG5cblx0XHQvLyBHaXZlIHRoZSBpbi1tZW1vcnkgcHJvdmlkZXIgdGltZSB0byBkZWxpdmVyIGFueSAoc3RyYXkpIGV2ZW50cy5cblx0XHRhd2FpdCB0aW1lb3V0KDEwMCk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY2hhbmdlQ291bnQsIDAsICdleHBlY3RlZCBvbkRpZENoYW5nZSBub3QgdG8gZmlyZSBmb3IgcGF0aHMgb3V0c2lkZSBhbnkgdHJpZ2dlciBVUkknKTtcblx0fSk7XG5cblx0dGVzdCgnZGlzY292ZXIgbW9kZSB3YXRjaGVzIHRoZSBkaXNjb3ZlcmVkIHNraWxsIHJvb3Qgc28gbmV3IHNraWxscyBmaXJlIG9uRGlkQ2hhbmdlJywgYXN5bmMgKCkgPT4ge1xuXHRcdC8vIFRoZSBza2lsbCByb290IGV4aXN0cyBidXQgaXMgZW1wdHk7IGdldERpc2NvdmVyeVBhdGhzIHN0aWxsIHJlcG9ydHMgaXQuXG5cdFx0YXdhaXQgZmlsZVNlcnZpY2UuY3JlYXRlRm9sZGVyKFVSSS5mcm9tKHsgc2NoZW1lOiBTY2hlbWFzLmluTWVtb3J5LCBwYXRoOiAnL3dvcmtzcGFjZS8uZ2l0aHViL3NraWxscycgfSkpO1xuXG5cdFx0Y29uc3QgZGlzY292ZXJ5ID0gZGlzcG9zYWJsZXMuYWRkKGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFNlc3Npb25DdXN0b21pemF0aW9uRGlzY292ZXJ5LCBbd29ya3NwYWNlXSwgdXNlckhvbWUsIGluTWVtb3J5UGF0aFRvVXJpKSk7XG5cdFx0Y29uc3QgY2xpZW50ID0ge1xuXHRcdFx0cnBjOiB7XG5cdFx0XHRcdGFnZW50czoge1xuXHRcdFx0XHRcdGdldERpc2NvdmVyeVBhdGhzOiBhc3luYyAoKSA9PiAoeyBwYXRoczogW10gfSksXG5cdFx0XHRcdFx0ZGlzY292ZXI6IGFzeW5jICgpID0+ICh7IGFnZW50czogW10gfSksXG5cdFx0XHRcdH0sXG5cdFx0XHRcdGluc3RydWN0aW9uczoge1xuXHRcdFx0XHRcdGdldERpc2NvdmVyeVBhdGhzOiBhc3luYyAoKSA9PiAoeyBwYXRoczogW10gfSksXG5cdFx0XHRcdFx0ZGlzY292ZXI6IGFzeW5jICgpID0+ICh7IHNvdXJjZXM6IFtdIH0pLFxuXHRcdFx0XHR9LFxuXHRcdFx0XHRza2lsbHM6IHtcblx0XHRcdFx0XHRnZXREaXNjb3ZlcnlQYXRoczogYXN5bmMgKCkgPT4gKHsgcGF0aHM6IFt7IHBhdGg6ICcvd29ya3NwYWNlLy5naXRodWIvc2tpbGxzJyB9XSB9KSxcblx0XHRcdFx0XHRkaXNjb3ZlcjogYXN5bmMgKCkgPT4gKHsgc2tpbGxzOiBbXSB9KSxcblx0XHRcdFx0fSxcblx0XHRcdH0sXG5cdFx0fSBhcyB1bmtub3duIGFzIENvcGlsb3RDbGllbnQ7XG5cblx0XHRhd2FpdCBkaXNjb3ZlcnkuZGlzY292ZXIoY2xpZW50LCBDYW5jZWxsYXRpb25Ub2tlbi5Ob25lKTtcblx0XHRhd2FpdCB0aW1lb3V0KDUwKTtcblxuXHRcdGxldCBjaGFuZ2VDb3VudCA9IDA7XG5cdFx0Y29uc3QgZmlyZWQgPSBuZXcgRGVmZXJyZWRQcm9taXNlPHZvaWQ+KCk7XG5cdFx0ZGlzcG9zYWJsZXMuYWRkKGRpc2NvdmVyeS5vbkRpZENoYW5nZSgoKSA9PiB7XG5cdFx0XHRjaGFuZ2VDb3VudCsrO1xuXHRcdFx0ZmlyZWQuY29tcGxldGUoKTtcblx0XHR9KSk7XG5cblx0XHRhd2FpdCBzZWVkKCcvd29ya3NwYWNlLy5naXRodWIvc2tpbGxzL25ldy1za2lsbC9TS0lMTC5tZCcsICduZXcgd29ya3NwYWNlIHNraWxsJyk7XG5cdFx0YXdhaXQgcmFjZVRpbWVvdXQoZmlyZWQucCwgNTAwKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChjaGFuZ2VDb3VudCwgMSwgJ2V4cGVjdGVkIG9uRGlkQ2hhbmdlIHRvIGZpcmUgd2hlbiBhIHNraWxsIGlzIGFkZGVkIHVuZGVyIHRoZSBkaXNjb3ZlcmVkIHNraWxsIHJvb3QnKTtcblx0fSk7XG5cblx0dGVzdCgnY2FuY2VsbGF0aW9uIG9mIG9uZSBjYWxsZXIgZG9lcyBub3QgYWZmZWN0IGFub3RoZXIgY29uY3VycmVudCBjYWxsZXInLCBhc3luYyAoKSA9PiB7XG5cdFx0YXdhaXQgc2VlZCgnL3dvcmtzcGFjZS8uZ2l0aHViL2FnZW50cy9mb28uYWdlbnQubWQnLCAnd29ya3NwYWNlIGFnZW50Jyk7XG5cblx0XHRjb25zdCBkaXNjb3ZlcnkgPSBkaXNwb3NhYmxlcy5hZGQoaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoU2Vzc2lvbkN1c3RvbWl6YXRpb25EaXNjb3ZlcnksIFt3b3Jrc3BhY2VdLCB1c2VySG9tZSwgVVJJLmZpbGUpKTtcblx0XHRjb25zdCBjYW5jZWxTb3VyY2UgPSBuZXcgQ2FuY2VsbGF0aW9uVG9rZW5Tb3VyY2UoKTtcblx0XHRkaXNwb3NhYmxlcy5hZGQoY2FuY2VsU291cmNlKTtcblxuXHRcdGNvbnN0IGNhbmNlbGxlZCA9IGRpc2NvdmVyeS5zY2FuKGNhbmNlbFNvdXJjZS50b2tlbik7XG5cdFx0Y29uc3Qgbm9uQ2FuY2VsbGVkID0gZGlzY292ZXJ5LnNjYW4oQ2FuY2VsbGF0aW9uVG9rZW4uTm9uZSk7XG5cdFx0Y2FuY2VsU291cmNlLmNhbmNlbCgpO1xuXG5cdFx0YXdhaXQgYXNzZXJ0LnJlamVjdHMoY2FuY2VsbGVkKTtcblx0XHRjb25zdCBkaXJlY3RvcmllcyA9IGF3YWl0IG5vbkNhbmNlbGxlZDtcblx0XHRhc3NlcnQub2soZGlyZWN0b3JpZXMuc29tZShkaXJlY3RvcnkgPT4gZGlyZWN0b3J5LnR5cGUgPT09IERpc2NvdmVyZWRUeXBlLkFnZW50KSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2Rpc2NvdmVycyBhZ2VudHMsIHNraWxscywgaW5zdHJ1Y3Rpb25zLCBhbmQgaG9va3MgYWNyb3NzIHdvcmtzcGFjZSBhbmQgaG9tZSByb290cycsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCB3c0FnZW50ID0gYXdhaXQgc2VlZCgnL3dvcmtzcGFjZS8uZ2l0aHViL2FnZW50cy9mb28uYWdlbnQubWQnLCAnYWdlbnQgYm9keScpO1xuXHRcdGNvbnN0IHdzU2tpbGwgPSBhd2FpdCBzZWVkKCcvd29ya3NwYWNlLy5naXRodWIvc2tpbGxzL2Jhci9TS0lMTC5tZCcsICdza2lsbCBib2R5Jyk7XG5cdFx0Y29uc3Qgd3NJbnN0ciA9IGF3YWl0IHNlZWQoJy93b3Jrc3BhY2UvLmdpdGh1Yi9pbnN0cnVjdGlvbnMvYmF6Lmluc3RydWN0aW9ucy5tZCcsICdpbnN0ciBib2R5Jyk7XG5cdFx0Y29uc3Qgd3NIb29rID0gYXdhaXQgc2VlZCgnL3dvcmtzcGFjZS8uZ2l0aHViL2hvb2tzL3ByZS10b29sLmpzb24nLCAne1wiUHJlVG9vbFVzZVwiOiBbXX0nKTtcblx0XHRjb25zdCB1c2VyQWdlbnQgPSBhd2FpdCBzZWVkKCcvaG9tZS8uY29waWxvdC9hZ2VudHMvcXV4LmFnZW50Lm1kJywgJ3VzZXIgYWdlbnQnKTtcblx0XHRjb25zdCB1c2VyQ29waWxvdFNraWxsID0gYXdhaXQgc2VlZCgnL2hvbWUvLmNvcGlsb3Qvc2tpbGxzL2NvcGlsb3QtemFwL1NLSUxMLm1kJywgJ3VzZXIgY29waWxvdCBza2lsbCcpO1xuXHRcdGNvbnN0IHVzZXJTa2lsbCA9IGF3YWl0IHNlZWQoJy9ob21lLy5hZ2VudHMvc2tpbGxzL3phcC9TS0lMTC5tZCcsICd1c2VyIHNraWxsJyk7XG5cdFx0Y29uc3QgdXNlckhvb2sgPSBhd2FpdCBzZWVkKCcvaG9tZS8uY29waWxvdC9ob29rcy9wb3N0LXRvb2wuanNvbicsICd7XCJQb3N0VG9vbFVzZVwiOiBbXX0nKTtcblx0XHQvLyBOb2lzZSB0aGF0IHNob3VsZCBub3QgYmUgcGlja2VkIHVwXG5cdFx0YXdhaXQgc2VlZCgnL3dvcmtzcGFjZS8uZ2l0aHViL2FnZW50cy9ub3QtYW4tYWdlbnQudHh0JywgJ2lnbm9yZWQnKTtcblx0XHRhd2FpdCBzZWVkKCcvd29ya3NwYWNlLy5naXRodWIvaG9va3Mvbm90LWEtaG9vay5tZCcsICdpZ25vcmVkJyk7XG5cblx0XHRjb25zdCBkaXNjb3ZlcnkgPSBkaXNwb3NhYmxlcy5hZGQoaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoU2Vzc2lvbkN1c3RvbWl6YXRpb25EaXNjb3ZlcnksIFt3b3Jrc3BhY2VdLCB1c2VySG9tZSwgVVJJLmZpbGUpKTtcblx0XHRjb25zdCBkaXJlY3RvcmllcyA9IGF3YWl0IGRpc2NvdmVyeS5zY2FuKENhbmNlbGxhdGlvblRva2VuLk5vbmUpO1xuXHRcdGNvbnN0IGZpbGVzID0gZGlyZWN0b3JpZXMuZmxhdE1hcChkaXJlY3RvcnkgPT4gZGlyZWN0b3J5LmZpbGVzLm1hcChmaWxlID0+ICh7IHVyaTogZmlsZS51cmksIHR5cGU6IGRpcmVjdG9yeS50eXBlIH0pKSk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKFsuLi5maWxlc10uc29ydCgoYSwgYikgPT4gYS51cmkudG9TdHJpbmcoKS5sb2NhbGVDb21wYXJlKGIudXJpLnRvU3RyaW5nKCkpKSwgW1xuXHRcdFx0eyB1cmk6IHVzZXJBZ2VudCwgdHlwZTogRGlzY292ZXJlZFR5cGUuQWdlbnQgfSxcblx0XHRcdHsgdXJpOiB1c2VyQ29waWxvdFNraWxsLCB0eXBlOiBEaXNjb3ZlcmVkVHlwZS5Ta2lsbCB9LFxuXHRcdFx0eyB1cmk6IHVzZXJIb29rLCB0eXBlOiBEaXNjb3ZlcmVkVHlwZS5Ib29rIH0sXG5cdFx0XHR7IHVyaTogdXNlclNraWxsLCB0eXBlOiBEaXNjb3ZlcmVkVHlwZS5Ta2lsbCB9LFxuXHRcdFx0eyB1cmk6IHdzQWdlbnQsIHR5cGU6IERpc2NvdmVyZWRUeXBlLkFnZW50IH0sXG5cdFx0XHR7IHVyaTogd3NIb29rLCB0eXBlOiBEaXNjb3ZlcmVkVHlwZS5Ib29rIH0sXG5cdFx0XHR7IHVyaTogd3NJbnN0ciwgdHlwZTogRGlzY292ZXJlZFR5cGUuSW5zdHJ1Y3Rpb24gfSxcblx0XHRcdHsgdXJpOiB3c1NraWxsLCB0eXBlOiBEaXNjb3ZlcmVkVHlwZS5Ta2lsbCB9LFxuXHRcdF0uc29ydCgoYSwgYikgPT4gYS51cmkudG9TdHJpbmcoKS5sb2NhbGVDb21wYXJlKGIudXJpLnRvU3RyaW5nKCkpKSk7XG5cdFx0YXNzZXJ0Lm9rKGRpcmVjdG9yaWVzLnNvbWUoZGlyZWN0b3J5ID0+IGRpcmVjdG9yeS51cmkudG9TdHJpbmcoKSA9PT0gVVJJLmpvaW5QYXRoKHdvcmtzcGFjZSwgJy5naXRodWInLCAnYWdlbnRzJykudG9TdHJpbmcoKSkpO1xuXHR9KTtcblxuXHR0ZXN0KCdkaXNjb3ZlcnMgbmVzdGVkIC5qc29uIGhvb2sgZmlsZXMnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgbmVzdGVkV3NIb29rID0gYXdhaXQgc2VlZCgnL3dvcmtzcGFjZS8uZ2l0aHViL2hvb2tzL3RlYW0vc2VjdXJpdHkvcHJlLXRvb2wuanNvbicsICd7XCJQcmVUb29sVXNlXCI6IFtdfScpO1xuXHRcdGNvbnN0IG5lc3RlZFVzZXJIb29rID0gYXdhaXQgc2VlZCgnL2hvbWUvLmNvcGlsb3QvaG9va3MvZG9tYWluL3Rvb2xzL3Bvc3QtdG9vbC5qc29uJywgJ3tcIlBvc3RUb29sVXNlXCI6IFtdfScpO1xuXG5cdFx0Y29uc3QgZGlzY292ZXJ5ID0gZGlzcG9zYWJsZXMuYWRkKGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFNlc3Npb25DdXN0b21pemF0aW9uRGlzY292ZXJ5LCBbd29ya3NwYWNlXSwgdXNlckhvbWUsIFVSSS5maWxlKSk7XG5cdFx0Y29uc3QgZmlsZXMgPSAoYXdhaXQgZGlzY292ZXJ5LnNjYW4oQ2FuY2VsbGF0aW9uVG9rZW4uTm9uZSkpLmZsYXRNYXAoZGlyZWN0b3J5ID0+IGRpcmVjdG9yeS5maWxlcy5tYXAoZmlsZSA9PiAoeyB1cmk6IGZpbGUudXJpLCB0eXBlOiBkaXJlY3RvcnkudHlwZSB9KSkpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChbLi4uZmlsZXNdLnNvcnQoKGEsIGIpID0+IGEudXJpLnRvU3RyaW5nKCkubG9jYWxlQ29tcGFyZShiLnVyaS50b1N0cmluZygpKSksIFtcblx0XHRcdHsgdXJpOiBuZXN0ZWRVc2VySG9vaywgdHlwZTogRGlzY292ZXJlZFR5cGUuSG9vayB9LFxuXHRcdFx0eyB1cmk6IG5lc3RlZFdzSG9vaywgdHlwZTogRGlzY292ZXJlZFR5cGUuSG9vayB9LFxuXHRcdF0uc29ydCgoYSwgYikgPT4gYS51cmkudG9TdHJpbmcoKS5sb2NhbGVDb21wYXJlKGIudXJpLnRvU3RyaW5nKCkpKSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2Rpc2NvdmVycyBob29rIHNldHRpbmdzIGZpbGVzIGZyb20gZml4ZWQgd29ya3NwYWNlIGxvY2F0aW9ucycsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBnaXRodWJTZXR0aW5ncyA9IGF3YWl0IHNlZWQoJy93b3Jrc3BhY2UvLmdpdGh1Yi9jb3BpbG90L3NldHRpbmdzLmpzb24nLCAne1wiaG9va3NcIjoge1wiUHJlVG9vbFVzZVwiOiBbXX19Jyk7XG5cdFx0Y29uc3QgZ2l0aHViTG9jYWxTZXR0aW5ncyA9IGF3YWl0IHNlZWQoJy93b3Jrc3BhY2UvLmdpdGh1Yi9jb3BpbG90L3NldHRpbmdzLmxvY2FsLmpzb24nLCAne1wiaG9va3NcIjoge1wiUG9zdFRvb2xVc2VcIjogW119fScpO1xuXHRcdGNvbnN0IGNsYXVkZVNldHRpbmdzID0gYXdhaXQgc2VlZCgnL3dvcmtzcGFjZS8uY2xhdWRlL3NldHRpbmdzLmpzb24nLCAne1wiaG9va3NcIjoge1wiU2Vzc2lvblN0YXJ0XCI6IFtdfX0nKTtcblx0XHRjb25zdCBjbGF1ZGVMb2NhbFNldHRpbmdzID0gYXdhaXQgc2VlZCgnL3dvcmtzcGFjZS8uY2xhdWRlL3NldHRpbmdzLmxvY2FsLmpzb24nLCAne1wiaG9va3NcIjoge1wiU2Vzc2lvbkVuZFwiOiBbXX19Jyk7XG5cdFx0YXdhaXQgc2VlZCgnL3dvcmtzcGFjZS8uZ2l0aHViL2NvcGlsb3Qvc2V0dGluZ3MuZGV2Lmpzb24nLCAne1wiaG9va3NcIjoge1wiSWdub3JlZFwiOiBbXX19Jyk7XG5cblx0XHRjb25zdCBkaXNjb3ZlcnkgPSBkaXNwb3NhYmxlcy5hZGQoaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoU2Vzc2lvbkN1c3RvbWl6YXRpb25EaXNjb3ZlcnksIFt3b3Jrc3BhY2VdLCB1c2VySG9tZSwgVVJJLmZpbGUpKTtcblx0XHRjb25zdCBmaWxlcyA9IChhd2FpdCBkaXNjb3Zlcnkuc2NhbihDYW5jZWxsYXRpb25Ub2tlbi5Ob25lKSkuZmxhdE1hcChkaXJlY3RvcnkgPT4gZGlyZWN0b3J5LmZpbGVzLm1hcChmaWxlID0+ICh7IHVyaTogZmlsZS51cmksIHR5cGU6IGRpcmVjdG9yeS50eXBlIH0pKSk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKFsuLi5maWxlc10uc29ydCgoYSwgYikgPT4gYS51cmkudG9TdHJpbmcoKS5sb2NhbGVDb21wYXJlKGIudXJpLnRvU3RyaW5nKCkpKSwgW1xuXHRcdFx0eyB1cmk6IGNsYXVkZUxvY2FsU2V0dGluZ3MsIHR5cGU6IERpc2NvdmVyZWRUeXBlLkhvb2sgfSxcblx0XHRcdHsgdXJpOiBjbGF1ZGVTZXR0aW5ncywgdHlwZTogRGlzY292ZXJlZFR5cGUuSG9vayB9LFxuXHRcdFx0eyB1cmk6IGdpdGh1YkxvY2FsU2V0dGluZ3MsIHR5cGU6IERpc2NvdmVyZWRUeXBlLkhvb2sgfSxcblx0XHRcdHsgdXJpOiBnaXRodWJTZXR0aW5ncywgdHlwZTogRGlzY292ZXJlZFR5cGUuSG9vayB9LFxuXHRcdF0uc29ydCgoYSwgYikgPT4gYS51cmkudG9TdHJpbmcoKS5sb2NhbGVDb21wYXJlKGIudXJpLnRvU3RyaW5nKCkpKSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2ZpcmVzIG9uRGlkQ2hhbmdlIHdoZW4gZml4ZWQgaG9vayBzZXR0aW5ncyBmaWxlIGlzIG1vZGlmaWVkJywgYXN5bmMgKCkgPT4ge1xuXHRcdGF3YWl0IHNlZWQoJy93b3Jrc3BhY2UvLmdpdGh1Yi9jb3BpbG90L3NldHRpbmdzLmpzb24nLCAne1wiaG9va3NcIjoge1wiUHJlVG9vbFVzZVwiOiBbXX19Jyk7XG5cblx0XHRjb25zdCBkaXNjb3ZlcnkgPSBkaXNwb3NhYmxlcy5hZGQoaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoU2Vzc2lvbkN1c3RvbWl6YXRpb25EaXNjb3ZlcnksIFt3b3Jrc3BhY2VdLCB1c2VySG9tZSwgVVJJLmZpbGUpKTtcblx0XHRhd2FpdCBkaXNjb3Zlcnkuc2NhbihDYW5jZWxsYXRpb25Ub2tlbi5Ob25lKTtcblx0XHRhd2FpdCB0aW1lb3V0KDUwKTtcblxuXHRcdGxldCBjaGFuZ2VDb3VudCA9IDA7XG5cdFx0Y29uc3QgZmlyZWQgPSBuZXcgRGVmZXJyZWRQcm9taXNlPHZvaWQ+KCk7XG5cdFx0ZGlzcG9zYWJsZXMuYWRkKGRpc2NvdmVyeS5vbkRpZENoYW5nZSgoKSA9PiB7XG5cdFx0XHRjaGFuZ2VDb3VudCsrO1xuXHRcdFx0ZmlyZWQuY29tcGxldGUoKTtcblx0XHR9KSk7XG5cblx0XHRhd2FpdCBzZWVkKCcvd29ya3NwYWNlLy5naXRodWIvY29waWxvdC9zZXR0aW5ncy5qc29uJywgJ3tcImhvb2tzXCI6IHtcIlByZVRvb2xVc2VcIjogW3tcImNvbW1hbmRcIjogXCJlY2hvIHRlc3RcIn1dfX0nKTtcblx0XHRhd2FpdCByYWNlVGltZW91dChmaXJlZC5wLCA1MDApO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNoYW5nZUNvdW50LCAxLCAnZXhwZWN0ZWQgb25EaWRDaGFuZ2UgdG8gZmlyZSB3aGVuIGZpeGVkIGhvb2sgc2V0dGluZ3MgZmlsZSBpcyBtb2RpZmllZCcpO1xuXHR9KTtcblxuXHR0ZXN0KCdleGNsdWRlcyBleGFjdC1jYXNlIFJFQURNRS5tZCBpbnNpZGUgYWdlbnQgZm9sZGVycycsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCB3c0FnZW50ID0gYXdhaXQgc2VlZCgnL3dvcmtzcGFjZS8uZ2l0aHViL2FnZW50cy9mb28uYWdlbnQubWQnLCAnYWdlbnQgYm9keScpO1xuXHRcdGNvbnN0IHdzUGxhaW5BZ2VudCA9IGF3YWl0IHNlZWQoJy93b3Jrc3BhY2UvLmdpdGh1Yi9hZ2VudHMvcGxhaW4ubWQnLCAncGxhaW4gYWdlbnQgYm9keScpO1xuXHRcdGNvbnN0IHdzTG93ZXJSZWFkbWVBZ2VudCA9IGF3YWl0IHNlZWQoJy93b3Jrc3BhY2UvLmdpdGh1Yi9hZ2VudHMvcmVhZG1lLm1kJywgJ2RvY3MgbG93ZXInKTtcblx0XHRhd2FpdCBzZWVkKCcvd29ya3NwYWNlLy5naXRodWIvYWdlbnRzL1JFQURNRS5tZCcsICdkb2NzJyk7XG5cblx0XHRjb25zdCBkaXNjb3ZlcnkgPSBkaXNwb3NhYmxlcy5hZGQoaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoU2Vzc2lvbkN1c3RvbWl6YXRpb25EaXNjb3ZlcnksIFt3b3Jrc3BhY2VdLCB1c2VySG9tZSwgVVJJLmZpbGUpKTtcblx0XHRjb25zdCBmaWxlcyA9IChhd2FpdCBkaXNjb3Zlcnkuc2NhbihDYW5jZWxsYXRpb25Ub2tlbi5Ob25lKSkuZmxhdE1hcChkaXJlY3RvcnkgPT4gZGlyZWN0b3J5LmZpbGVzLm1hcChmaWxlID0+ICh7IHVyaTogZmlsZS51cmksIHR5cGU6IGRpcmVjdG9yeS50eXBlIH0pKSk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKFsuLi5maWxlc10uc29ydCgoYSwgYikgPT4gYS51cmkudG9TdHJpbmcoKS5sb2NhbGVDb21wYXJlKGIudXJpLnRvU3RyaW5nKCkpKSwgW1xuXHRcdFx0eyB1cmk6IHdzQWdlbnQsIHR5cGU6IERpc2NvdmVyZWRUeXBlLkFnZW50IH0sXG5cdFx0XHR7IHVyaTogd3NMb3dlclJlYWRtZUFnZW50LCB0eXBlOiBEaXNjb3ZlcmVkVHlwZS5BZ2VudCB9LFxuXHRcdFx0eyB1cmk6IHdzUGxhaW5BZ2VudCwgdHlwZTogRGlzY292ZXJlZFR5cGUuQWdlbnQgfSxcblx0XHRdLnNvcnQoKGEsIGIpID0+IGEudXJpLnRvU3RyaW5nKCkubG9jYWxlQ29tcGFyZShiLnVyaS50b1N0cmluZygpKSkpO1xuXHR9KTtcblxuXHR0ZXN0KCdpbmNsdWRlcyBub24tUkVBRE1FIG1hcmtkb3duIGZpbGVzIGluc2lkZSBhZ2VudCBmb2xkZXJzJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHdzQWdlbnQgPSBhd2FpdCBzZWVkKCcvd29ya3NwYWNlLy5naXRodWIvYWdlbnRzL2Zvby5hZ2VudC5tZCcsICdhZ2VudCBib2R5Jyk7XG5cdFx0Y29uc3Qgd3NMZWdhY3lNb2RlID0gYXdhaXQgc2VlZCgnL3dvcmtzcGFjZS8uZ2l0aHViL2FnZW50cy9sZWdhY3kuY2hhdG1vZGUubWQnLCAnbGVnYWN5IG1vZGUgYm9keScpO1xuXHRcdGNvbnN0IHdzUHJvbXB0ID0gYXdhaXQgc2VlZCgnL3dvcmtzcGFjZS8uZ2l0aHViL2FnZW50cy9iYXIucHJvbXB0Lm1kJywgJ3Byb21wdCBib2R5Jyk7XG5cdFx0Y29uc3Qgd3NJbnN0cnVjdGlvbiA9IGF3YWl0IHNlZWQoJy93b3Jrc3BhY2UvLmdpdGh1Yi9hZ2VudHMvYmF6Lmluc3RydWN0aW9ucy5tZCcsICdpbnN0cnVjdGlvbiBib2R5Jyk7XG5cdFx0Y29uc3Qgd3NDb3BpbG90SW5zdHJ1Y3Rpb25zID0gYXdhaXQgc2VlZCgnL3dvcmtzcGFjZS8uZ2l0aHViL2FnZW50cy9jb3BpbG90LWluc3RydWN0aW9ucy5tZCcsICdjb3BpbG90IGluc3RydWN0aW9ucyBib2R5Jyk7XG5cdFx0Y29uc3Qgd3NTa2lsbCA9IGF3YWl0IHNlZWQoJy93b3Jrc3BhY2UvLmdpdGh1Yi9hZ2VudHMvU0tJTEwubWQnLCAnc2tpbGwgYm9keScpO1xuXHRcdGNvbnN0IHdzU2tpbGxMb3dlcmNhc2UgPSBhd2FpdCBzZWVkKCcvd29ya3NwYWNlLy5naXRodWIvYWdlbnRzL3NraWxsLm1kJywgJ3NraWxsIGJvZHkgbG93ZXJjYXNlJyk7XG5cblx0XHRjb25zdCBkaXNjb3ZlcnkgPSBkaXNwb3NhYmxlcy5hZGQoaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoU2Vzc2lvbkN1c3RvbWl6YXRpb25EaXNjb3ZlcnksIFt3b3Jrc3BhY2VdLCB1c2VySG9tZSwgVVJJLmZpbGUpKTtcblx0XHRjb25zdCBmaWxlcyA9IChhd2FpdCBkaXNjb3Zlcnkuc2NhbihDYW5jZWxsYXRpb25Ub2tlbi5Ob25lKSkuZmxhdE1hcChkaXJlY3RvcnkgPT4gZGlyZWN0b3J5LmZpbGVzLm1hcChmaWxlID0+ICh7IHVyaTogZmlsZS51cmksIHR5cGU6IGRpcmVjdG9yeS50eXBlIH0pKSk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKFsuLi5maWxlc10uc29ydCgoYSwgYikgPT4gYS51cmkudG9TdHJpbmcoKS5sb2NhbGVDb21wYXJlKGIudXJpLnRvU3RyaW5nKCkpKSwgW1xuXHRcdFx0eyB1cmk6IHdzQ29waWxvdEluc3RydWN0aW9ucywgdHlwZTogRGlzY292ZXJlZFR5cGUuQWdlbnQgfSxcblx0XHRcdHsgdXJpOiB3c0FnZW50LCB0eXBlOiBEaXNjb3ZlcmVkVHlwZS5BZ2VudCB9LFxuXHRcdFx0eyB1cmk6IHdzSW5zdHJ1Y3Rpb24sIHR5cGU6IERpc2NvdmVyZWRUeXBlLkFnZW50IH0sXG5cdFx0XHR7IHVyaTogd3NMZWdhY3lNb2RlLCB0eXBlOiBEaXNjb3ZlcmVkVHlwZS5BZ2VudCB9LFxuXHRcdFx0eyB1cmk6IHdzUHJvbXB0LCB0eXBlOiBEaXNjb3ZlcmVkVHlwZS5BZ2VudCB9LFxuXHRcdFx0eyB1cmk6IHdzU2tpbGwsIHR5cGU6IERpc2NvdmVyZWRUeXBlLkFnZW50IH0sXG5cdFx0XHR7IHVyaTogd3NTa2lsbExvd2VyY2FzZSwgdHlwZTogRGlzY292ZXJlZFR5cGUuQWdlbnQgfSxcblx0XHRdLnNvcnQoKGEsIGIpID0+IGEudXJpLnRvU3RyaW5nKCkubG9jYWxlQ29tcGFyZShiLnVyaS50b1N0cmluZygpKSkpO1xuXHR9KTtcblxuXHR0ZXN0KCdkaXNjb3ZlcnMgbmVzdGVkIC5pbnN0cnVjdGlvbnMubWQgZmlsZXMnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgbmVzdGVkV3NJbnN0ciA9IGF3YWl0IHNlZWQoJy93b3Jrc3BhY2UvLmdpdGh1Yi9pbnN0cnVjdGlvbnMvdGVhbS9zZWN1cml0eS9wb2xpY3kuaW5zdHJ1Y3Rpb25zLm1kJywgJ3dvcmtzcGFjZSBuZXN0ZWQgaW5zdHJ1Y3Rpb24nKTtcblx0XHRjb25zdCBuZXN0ZWRVc2VySW5zdHIgPSBhd2FpdCBzZWVkKCcvaG9tZS8uY29waWxvdC9pbnN0cnVjdGlvbnMvZG9tYWluL3Rvb2xzL2RlZXAuaW5zdHJ1Y3Rpb25zLm1kJywgJ3VzZXIgbmVzdGVkIGluc3RydWN0aW9uJyk7XG5cblx0XHRjb25zdCBkaXNjb3ZlcnkgPSBkaXNwb3NhYmxlcy5hZGQoaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoU2Vzc2lvbkN1c3RvbWl6YXRpb25EaXNjb3ZlcnksIFt3b3Jrc3BhY2VdLCB1c2VySG9tZSwgVVJJLmZpbGUpKTtcblx0XHRjb25zdCBmaWxlcyA9IChhd2FpdCBkaXNjb3Zlcnkuc2NhbihDYW5jZWxsYXRpb25Ub2tlbi5Ob25lKSkuZmxhdE1hcChkaXJlY3RvcnkgPT4gZGlyZWN0b3J5LmZpbGVzLm1hcChmaWxlID0+ICh7IHVyaTogZmlsZS51cmksIHR5cGU6IGRpcmVjdG9yeS50eXBlIH0pKSk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKFsuLi5maWxlc10uc29ydCgoYSwgYikgPT4gYS51cmkudG9TdHJpbmcoKS5sb2NhbGVDb21wYXJlKGIudXJpLnRvU3RyaW5nKCkpKSwgW1xuXHRcdFx0eyB1cmk6IG5lc3RlZFVzZXJJbnN0ciwgdHlwZTogRGlzY292ZXJlZFR5cGUuSW5zdHJ1Y3Rpb24gfSxcblx0XHRcdHsgdXJpOiBuZXN0ZWRXc0luc3RyLCB0eXBlOiBEaXNjb3ZlcmVkVHlwZS5JbnN0cnVjdGlvbiB9LFxuXHRcdF0uc29ydCgoYSwgYikgPT4gYS51cmkudG9TdHJpbmcoKS5sb2NhbGVDb21wYXJlKGIudXJpLnRvU3RyaW5nKCkpKSk7XG5cdH0pO1xuXG5cblxuXHR0ZXN0KCdidW5kbGVzIG5lc3RlZCAuaW5zdHJ1Y3Rpb25zLm1kIGZpbGVzIGludG8gcnVsZXMnLCBhc3luYyAoKSA9PiB7XG5cdFx0YXdhaXQgc2VlZCgnL3dvcmtzcGFjZS8uZ2l0aHViL2luc3RydWN0aW9ucy90ZWFtL3NlY3VyaXR5L3BvbGljeS5pbnN0cnVjdGlvbnMubWQnLCAnd29ya3NwYWNlIG5lc3RlZCBpbnN0cnVjdGlvbicpO1xuXHRcdGF3YWl0IHNlZWQoJy9ob21lLy5jb3BpbG90L2luc3RydWN0aW9ucy9kb21haW4vdG9vbHMvZGVlcC5pbnN0cnVjdGlvbnMubWQnLCAndXNlciBuZXN0ZWQgaW5zdHJ1Y3Rpb24nKTtcblxuXHRcdGNvbnN0IGRpc2NvdmVyeSA9IGRpc3Bvc2FibGVzLmFkZChpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShTZXNzaW9uQ3VzdG9taXphdGlvbkRpc2NvdmVyeSwgW3dvcmtzcGFjZV0sIHVzZXJIb21lLCBVUkkuZmlsZSkpO1xuXHRcdGNvbnN0IGJ1bmRsZXIgPSBkaXNwb3NhYmxlcy5hZGQoaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoU2Vzc2lvblBsdWdpbkJ1bmRsZXIsIHdvcmtzcGFjZSkpO1xuXHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IGJ1bmRsZXIuYnVuZGxlKGF3YWl0IGRpc2NvdmVyeS5zY2FuKENhbmNlbGxhdGlvblRva2VuLk5vbmUpKTtcblxuXHRcdGFzc2VydC5vayhyZXN1bHQpO1xuXG5cdFx0Y29uc3Qgcm9vdCA9IGJ1bmRsZXIucm9vdFVyaTtcblx0XHRjb25zdCB3b3Jrc3BhY2VJbnN0ciA9IGF3YWl0IGZpbGVTZXJ2aWNlLnJlYWRGaWxlKFVSSS5qb2luUGF0aChyb290LCAncnVsZXMnLCAncG9saWN5Lmluc3RydWN0aW9ucy5tZCcpKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwod29ya3NwYWNlSW5zdHIudmFsdWUudG9TdHJpbmcoKSwgJ3dvcmtzcGFjZSBuZXN0ZWQgaW5zdHJ1Y3Rpb24nKTtcblxuXHRcdGNvbnN0IHVzZXJJbnN0ciA9IGF3YWl0IGZpbGVTZXJ2aWNlLnJlYWRGaWxlKFVSSS5qb2luUGF0aChyb290LCAncnVsZXMnLCAnZGVlcC5pbnN0cnVjdGlvbnMubWQnKSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHVzZXJJbnN0ci52YWx1ZS50b1N0cmluZygpLCAndXNlciBuZXN0ZWQgaW5zdHJ1Y3Rpb24nKTtcblx0fSk7XG5cblx0dGVzdCgncmV0dXJucyB1bmRlZmluZWQgd2hlbiBubyBmaWxlcyB3ZXJlIGRpc2NvdmVyZWQnLCBhc3luYyAoKSA9PiB7XG5cdFx0Ly8gRW5zdXJlIHdvcmtzcGFjZSByb290IGV4aXN0c1xuXHRcdGF3YWl0IGZpbGVTZXJ2aWNlLmNyZWF0ZUZvbGRlcih3b3Jrc3BhY2UpO1xuXHRcdGF3YWl0IGZpbGVTZXJ2aWNlLmNyZWF0ZUZvbGRlcih1c2VySG9tZSk7XG5cblx0XHRjb25zdCBkaXNjb3ZlcnkgPSBkaXNwb3NhYmxlcy5hZGQoaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoU2Vzc2lvbkN1c3RvbWl6YXRpb25EaXNjb3ZlcnksIFt3b3Jrc3BhY2VdLCB1c2VySG9tZSwgVVJJLmZpbGUpKTtcblx0XHRjb25zdCBkaXJlY3RvcmllcyA9IGF3YWl0IGRpc2NvdmVyeS5zY2FuKENhbmNlbGxhdGlvblRva2VuLk5vbmUpO1xuXG5cdFx0Ly8gRXZlbiB3aXRoIG5vIGZpbGVzLCBkaXNjb3Zlcnkgc2hvdWxkIHJldHVybiBhbGwgc2VhcmNoIHJvb3QgZGlyZWN0b3JpZXNcblx0XHQvLyBkaXJlY3RvcmllcyBzaG91bGQgbmV2ZXIgYmUgbnVsbC91bmRlZmluZWQsIHNob3VsZCBiZSBhbiBlbXB0eSBhcnJheSBpZiBubyBkaXJlY3RvcmllcyBmb3VuZFxuXHRcdGFzc2VydC5vayhBcnJheS5pc0FycmF5KGRpcmVjdG9yaWVzKSwgYEV4cGVjdGVkIGRpcmVjdG9yaWVzIHRvIGJlIGFuIGFycmF5LCBnb3QgJHtKU09OLnN0cmluZ2lmeShkaXJlY3Rvcmllcyl9YCk7XG5cblx0XHQvLyBTaW5jZSB3ZSdyZSBub3cgZGlzY292ZXJpbmcgYWxsIHJvb3RzIGV2ZW4gaWYgdGhleSBkb24ndCBleGlzdCxcblx0XHQvLyB3ZSBleHBlY3QgdG8gZmluZCBzb21lIGRpcmVjdG9yaWVzIChhdCBtaW5pbXVtIHRoZSB3b3Jrc3BhY2Ugcm9vdCBmb3IgQUdFTlRTLm1kKVxuXHRcdGlmIChkaXJlY3Rvcmllcy5sZW5ndGggPT09IDApIHtcblx0XHRcdC8vIElmIG5vIGRpcmVjdG9yaWVzIGFyZSBkaXNjb3ZlcmVkLCB0aGF0J3Mgb2theSBmb3IgdGhpcyB0ZXN0IC0gaXQgbWVhbnMgZGlzY292ZXJ5XG5cdFx0XHQvLyBpcyBzdGlsbCBsb29raW5nIGZvciBhY3R1YWwgZmlsZXMvZGlyZWN0b3JpZXMuIFVwZGF0ZSB0ZXN0IGV4cGVjdGF0aW9ucy5cblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHQvLyBBbGwgZGlyZWN0b3JpZXMgc2hvdWxkIGJlIGVtcHR5IHNpbmNlIG5vIGZpbGVzIHdlcmUgY3JlYXRlZFxuXHRcdGZvciAoY29uc3QgZGlyIG9mIGRpcmVjdG9yaWVzKSB7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZGlyLmZpbGVzLmxlbmd0aCwgMCwgYEV4cGVjdGVkICR7ZGlyLnVyaS50b1N0cmluZygpfSB0byBoYXZlIG5vIGZpbGVzYCk7XG5cdFx0fVxuXG5cdFx0Ly8gQnVuZGxlciByZXR1cm5zIHVuZGVmaW5lZCB3aGVuIGRpcmVjdG9yaWVzIGFyZSBlbXB0eSAobm8gY3VzdG9taXphdGlvbnMgdG8gYnVuZGxlKVxuXHRcdGNvbnN0IGJ1bmRsZXIgPSBkaXNwb3NhYmxlcy5hZGQoaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoU2Vzc2lvblBsdWdpbkJ1bmRsZXIsIHdvcmtzcGFjZSkpO1xuXHRcdGF3YWl0IGJ1bmRsZXIuYnVuZGxlKGRpcmVjdG9yaWVzKTtcblx0XHQvLyBKdXN0IHZlcmlmeSBidW5kbGluZyBkb2Vzbid0IGNyYXNoXG5cdH0pO1xuXG5cdHRlc3QoJ21hcHMgZGlzY292ZXJlZCBmaWxlcyB0byBwYXJzZWQgcGx1Z2luIHByZXNlcnZpbmcgc291cmNlIFVSSXMnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgYWdlbnQgPSBhd2FpdCBzZWVkKCcvd29ya3NwYWNlLy5naXRodWIvYWdlbnRzL2Zvby5hZ2VudC5tZCcsICctLS1cXG5uYW1lOiBXb3Jrc3BhY2UgQWdlbnRcXG5kZXNjcmlwdGlvbjogQWdlbnQgZGVzY3JpcHRpb25cXG4tLS1cXG5ib2R5Jyk7XG5cdFx0Y29uc3Qgc2tpbGwgPSBhd2FpdCBzZWVkKCcvd29ya3NwYWNlLy5naXRodWIvc2tpbGxzL2Jhci9TS0lMTC5tZCcsICctLS1cXG5uYW1lOiBXb3Jrc3BhY2UgU2tpbGxcXG5kZXNjcmlwdGlvbjogU2tpbGwgZGVzY3JpcHRpb25cXG4tLS1cXG5ib2R5Jyk7XG5cdFx0Y29uc3QgaW5zdHJ1Y3Rpb24gPSBhd2FpdCBzZWVkKCcvd29ya3NwYWNlLy5naXRodWIvaW5zdHJ1Y3Rpb25zL2Jhei5pbnN0cnVjdGlvbnMubWQnLCAnLS0tXFxubmFtZTogV29ya3NwYWNlIFJ1bGVcXG5kZXNjcmlwdGlvbjogUnVsZSBkZXNjcmlwdGlvblxcbmdsb2JzOlxcbiAgLSBzcmMvKipcXG4tLS1cXG5ib2R5Jyk7XG5cblx0XHRjb25zdCBkaXNjb3ZlcnkgPSBkaXNwb3NhYmxlcy5hZGQoaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoU2Vzc2lvbkN1c3RvbWl6YXRpb25EaXNjb3ZlcnksIFt3b3Jrc3BhY2VdLCB1c2VySG9tZSwgVVJJLmZpbGUpKTtcblx0XHRjb25zdCBjdXN0b21pemF0aW9ucyA9IGF3YWl0IHRvRGlzY292ZXJlZERpcmVjdG9yeUN1c3RvbWl6YXRpb25zKGF3YWl0IGRpc2NvdmVyeS5zY2FuKENhbmNlbGxhdGlvblRva2VuLk5vbmUpLCBmaWxlU2VydmljZSk7XG5cblx0XHRjb25zdCBwbHVnaW4gPSBtYXBUb1BhcnNlZFBsdWdpbihjdXN0b21pemF0aW9ucyk7XG5cblx0XHRhc3NlcnQub2socGx1Z2luKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocGx1Z2luLmFnZW50cy5sZW5ndGgsIDEpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChwbHVnaW4uc2tpbGxzLmxlbmd0aCwgMSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHBsdWdpbi5pbnN0cnVjdGlvbnMubGVuZ3RoLCAxKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKFxuXHRcdFx0e1xuXHRcdFx0XHRhZ2VudFVyaTogcGx1Z2luLmFnZW50c1swXS51cmkudG9TdHJpbmcoKSxcblx0XHRcdFx0YWdlbnREZXNjcmlwdGlvbjogcGx1Z2luLmFnZW50c1swXS5kZXNjcmlwdGlvbixcblx0XHRcdFx0c2tpbGxVcmk6IHBsdWdpbi5za2lsbHNbMF0udXJpLnRvU3RyaW5nKCksXG5cdFx0XHRcdHNraWxsRGVzY3JpcHRpb246IHBsdWdpbi5za2lsbHNbMF0uZGVzY3JpcHRpb24sXG5cdFx0XHRcdHJ1bGVVcmk6IHBsdWdpbi5pbnN0cnVjdGlvbnNbMF0udXJpLnRvU3RyaW5nKCksXG5cdFx0XHRcdHJ1bGVEZXNjcmlwdGlvbjogcGx1Z2luLmluc3RydWN0aW9uc1swXS5kZXNjcmlwdGlvbixcblx0XHRcdH0sXG5cdFx0XHR7XG5cdFx0XHRcdGFnZW50VXJpOiBhZ2VudC50b1N0cmluZygpLFxuXHRcdFx0XHRhZ2VudERlc2NyaXB0aW9uOiAnQWdlbnQgZGVzY3JpcHRpb24nLFxuXHRcdFx0XHRza2lsbFVyaTogc2tpbGwudG9TdHJpbmcoKSxcblx0XHRcdFx0c2tpbGxEZXNjcmlwdGlvbjogJ1NraWxsIGRlc2NyaXB0aW9uJyxcblx0XHRcdFx0cnVsZVVyaTogaW5zdHJ1Y3Rpb24udG9TdHJpbmcoKSxcblx0XHRcdFx0cnVsZURlc2NyaXB0aW9uOiAnUnVsZSBkZXNjcmlwdGlvbicsXG5cdFx0XHR9XG5cdFx0KTtcblx0fSk7XG5cblx0dGVzdCgnZG9lcyBub3QgaW5jbHVkZSBwYXJzZWQgYWdlbnQtaW5zdHJ1Y3Rpb24gcnVsZXMgaW4gbWFwVG9QYXJzZWRQbHVnaW4gb3V0cHV0JywgYXN5bmMgKCkgPT4ge1xuXHRcdGF3YWl0IHNlZWQoJy93b3Jrc3BhY2UvLmdpdGh1Yi9jb3BpbG90LWluc3RydWN0aW9ucy5tZCcsICd3b3Jrc3BhY2UgaW5zdHJ1Y3Rpb25zJyk7XG5cdFx0YXdhaXQgc2VlZCgnL3dvcmtzcGFjZS8uYWdlbnRzL3NraWxscy9iYXIvU0tJTEwubWQnLCAnLS0tXFxubmFtZTogYmFyXFxuZGVzY3JpcHRpb246IFNraWxsIGRlc2NyaXB0aW9uXFxuLS0tXFxuYm9keScpO1xuXG5cdFx0Y29uc3QgZGlzY292ZXJ5ID0gZGlzcG9zYWJsZXMuYWRkKGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFNlc3Npb25DdXN0b21pemF0aW9uRGlzY292ZXJ5LCBbd29ya3NwYWNlXSwgdXNlckhvbWUsIFVSSS5maWxlKSk7XG5cdFx0Y29uc3QgY3VzdG9taXphdGlvbnMgPSBhd2FpdCB0b0Rpc2NvdmVyZWREaXJlY3RvcnlDdXN0b21pemF0aW9ucyhhd2FpdCBkaXNjb3Zlcnkuc2NhbihDYW5jZWxsYXRpb25Ub2tlbi5Ob25lKSwgZmlsZVNlcnZpY2UpO1xuXG5cdFx0Y29uc3QgcGx1Z2luID0gbWFwVG9QYXJzZWRQbHVnaW4oY3VzdG9taXphdGlvbnMpO1xuXG5cdFx0YXNzZXJ0Lm9rKHBsdWdpbik7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHBsdWdpbi5za2lsbHMubGVuZ3RoLCAxKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocGx1Z2luLmluc3RydWN0aW9ucy5sZW5ndGgsIDApO1xuXHR9KTtcblxuXHR0ZXN0KCdyZXR1cm5zIHVuZGVmaW5lZCBmcm9tIG1hcFRvUGFyc2VkUGx1Z2luIHdoZW4gYWxsIGN1c3RvbWl6YXRpb25zIGFyZSBhZ2VudC1pbnN0cnVjdGlvbiBmaWxlcycsIGFzeW5jICgpID0+IHtcblx0XHQvLyBPbmx5IGFnZW50IGluc3RydWN0aW9uIGZpbGVzIGFyZSBkaXNjb3ZlcmVkIFx1MjAxNCB0aGVzZSBhcmUgZXhjbHVkZWQgZnJvbSB0aGUgcGFyc2VkIHBsdWdpbiBvdXRwdXQuXG5cdFx0YXdhaXQgc2VlZCgnL3dvcmtzcGFjZS8uZ2l0aHViL2NvcGlsb3QtaW5zdHJ1Y3Rpb25zLm1kJywgJ3dvcmtzcGFjZSBpbnN0cnVjdGlvbnMnKTtcblx0XHRhd2FpdCBzZWVkKCcvaG9tZS8uY29waWxvdC9jb3BpbG90LWluc3RydWN0aW9ucy5tZCcsICd1c2VyIGluc3RydWN0aW9ucycpO1xuXG5cdFx0Y29uc3QgZGlzY292ZXJ5ID0gZGlzcG9zYWJsZXMuYWRkKGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFNlc3Npb25DdXN0b21pemF0aW9uRGlzY292ZXJ5LCBbd29ya3NwYWNlXSwgdXNlckhvbWUsIFVSSS5maWxlKSk7XG5cdFx0Y29uc3QgY3VzdG9taXphdGlvbnMgPSBhd2FpdCB0b0Rpc2NvdmVyZWREaXJlY3RvcnlDdXN0b21pemF0aW9ucyhhd2FpdCBkaXNjb3Zlcnkuc2NhbihDYW5jZWxsYXRpb25Ub2tlbi5Ob25lKSwgZmlsZVNlcnZpY2UpO1xuXG5cdFx0Y29uc3QgcGx1Z2luID0gbWFwVG9QYXJzZWRQbHVnaW4oY3VzdG9taXphdGlvbnMpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHBsdWdpbiwgdW5kZWZpbmVkKTtcblx0fSk7XG5cblx0dGVzdCgnc2NhbiBkaXNjb3ZlcnMgYWdlbnQgaW5zdHJ1Y3Rpb24gZmlsZXMgYWNyb3NzIGV2ZXJ5IHdvcmtpbmcgZGlyZWN0b3J5JywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHNlY29uZFdvcmtzcGFjZSA9IFVSSS5mcm9tKHsgc2NoZW1lOiBTY2hlbWFzLmluTWVtb3J5LCBwYXRoOiAnL3dvcmtzcGFjZTInIH0pO1xuXHRcdGNvbnN0IGZpcnN0ID0gYXdhaXQgc2VlZCgnL3dvcmtzcGFjZS8uZ2l0aHViL2NvcGlsb3QtaW5zdHJ1Y3Rpb25zLm1kJywgJ2ZpcnN0Jyk7XG5cdFx0Y29uc3Qgc2Vjb25kID0gYXdhaXQgc2VlZCgnL3dvcmtzcGFjZTIvLmdpdGh1Yi9jb3BpbG90LWluc3RydWN0aW9ucy5tZCcsICdzZWNvbmQnKTtcblxuXHRcdGNvbnN0IGRpc2NvdmVyeSA9IGRpc3Bvc2FibGVzLmFkZChpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShTZXNzaW9uQ3VzdG9taXphdGlvbkRpc2NvdmVyeSwgW3dvcmtzcGFjZSwgc2Vjb25kV29ya3NwYWNlXSwgdXNlckhvbWUsIFVSSS5maWxlKSk7XG5cdFx0Y29uc3QgZmlsZXMgPSAoYXdhaXQgZGlzY292ZXJ5LnNjYW4oQ2FuY2VsbGF0aW9uVG9rZW4uTm9uZSkpXG5cdFx0XHQuZmlsdGVyKGRpcmVjdG9yeSA9PiBkaXJlY3RvcnkudHlwZSA9PT0gRGlzY292ZXJlZFR5cGUuQWdlbnRJbnN0cnVjdGlvbilcblx0XHRcdC5mbGF0TWFwKGRpcmVjdG9yeSA9PiBkaXJlY3RvcnkuZmlsZXMubWFwKGZpbGUgPT4gZmlsZS51cmkudG9TdHJpbmcoKSkpXG5cdFx0XHQuc29ydCgoYSwgYikgPT4gYS5sb2NhbGVDb21wYXJlKGIpKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoZmlsZXMsIFtmaXJzdC50b1N0cmluZygpLCBzZWNvbmQudG9TdHJpbmcoKV0uc29ydCgoYSwgYikgPT4gYS5sb2NhbGVDb21wYXJlKGIpKSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2NvbnN0cnVjdG9yIHJlamVjdHMgYW4gZW1wdHkgd29ya2luZy1kaXJlY3Rvcnkgc2V0IChub24tZW1wdHksIHByaW1hcnktZmlyc3QgaW52YXJpYW50KScsICgpID0+IHtcblx0XHRhc3NlcnQudGhyb3dzKFxuXHRcdFx0KCkgPT4gaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoU2Vzc2lvbkN1c3RvbWl6YXRpb25EaXNjb3ZlcnksIFtdLCB1c2VySG9tZSwgVVJJLmZpbGUpLFxuXHRcdFx0L2F0IGxlYXN0IG9uZSB3b3JraW5nIGRpcmVjdG9yeS8sXG5cdFx0KTtcblx0fSk7XG5cblx0dGVzdCgnc2NhbiBkaXNjb3ZlcnMgaG9va3MgZnJvbSB0aGUgcHJpbWFyeSB3b3JraW5nIGRpcmVjdG9yeSBvbmx5JywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHNlY29uZFdvcmtzcGFjZSA9IFVSSS5mcm9tKHsgc2NoZW1lOiBTY2hlbWFzLmluTWVtb3J5LCBwYXRoOiAnL3dvcmtzcGFjZTInIH0pO1xuXHRcdC8vIGB3b3Jrc3BhY2VgIGlzIHByaW1hcnkgKGluZGV4IDApOyBgc2Vjb25kV29ya3NwYWNlYCBpcyBhIG5vbi1wcmltYXJ5IHJvb3QuXG5cdFx0Y29uc3QgcHJpbWFyeUhvb2sgPSBhd2FpdCBzZWVkKCcvd29ya3NwYWNlLy5naXRodWIvaG9va3MvcHJlLXRvb2wuanNvbicsICd7XCJQcmVUb29sVXNlXCI6IFtdfScpO1xuXHRcdGF3YWl0IHNlZWQoJy93b3Jrc3BhY2UyLy5naXRodWIvaG9va3MvcHJlLXRvb2wuanNvbicsICd7XCJQcmVUb29sVXNlXCI6IFtdfScpO1xuXG5cdFx0Y29uc3QgZGlzY292ZXJ5ID0gZGlzcG9zYWJsZXMuYWRkKGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFNlc3Npb25DdXN0b21pemF0aW9uRGlzY292ZXJ5LCBbd29ya3NwYWNlLCBzZWNvbmRXb3Jrc3BhY2VdLCB1c2VySG9tZSwgVVJJLmZpbGUpKTtcblx0XHRjb25zdCBob29rRmlsZXMgPSAoYXdhaXQgZGlzY292ZXJ5LnNjYW4oQ2FuY2VsbGF0aW9uVG9rZW4uTm9uZSkpXG5cdFx0XHQuZmlsdGVyKGRpcmVjdG9yeSA9PiBkaXJlY3RvcnkudHlwZSA9PT0gRGlzY292ZXJlZFR5cGUuSG9vaylcblx0XHRcdC5mbGF0TWFwKGRpcmVjdG9yeSA9PiBkaXJlY3RvcnkuZmlsZXMubWFwKGZpbGUgPT4gZmlsZS51cmkudG9TdHJpbmcoKSkpXG5cdFx0XHQuc29ydCgoYSwgYikgPT4gYS5sb2NhbGVDb21wYXJlKGIpKTtcblxuXHRcdC8vIE9ubHkgdGhlIHByaW1hcnkgcm9vdCdzIGhvb2sgaXMgZGlzY292ZXJlZDsgdGhlIG5vbi1wcmltYXJ5IHJvb3QncyBob29rIGlzIGlnbm9yZWQuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChob29rRmlsZXMsIFtwcmltYXJ5SG9vay50b1N0cmluZygpXSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2Rpc2NvdmVyIGluY2x1ZGVzIGhvb2tzIGZyb20gdGhlIHByaW1hcnkgd29ya2luZyBkaXJlY3Rvcnkgb25seScsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBzZWNvbmRXb3Jrc3BhY2UgPSBVUkkuZnJvbSh7IHNjaGVtZTogU2NoZW1hcy5pbk1lbW9yeSwgcGF0aDogJy93b3Jrc3BhY2UyJyB9KTtcblx0XHRhd2FpdCBzZWVkKCcvd29ya3NwYWNlLy5naXRodWIvaG9va3MvcHJlLXRvb2wuanNvbicsICd7XCJQcmVUb29sVXNlXCI6IFtdfScpO1xuXHRcdGF3YWl0IHNlZWQoJy93b3Jrc3BhY2UyLy5naXRodWIvaG9va3MvcHJlLXRvb2wuanNvbicsICd7XCJQcmVUb29sVXNlXCI6IFtdfScpO1xuXG5cdFx0Y29uc3QgZGlzY292ZXJ5ID0gZGlzcG9zYWJsZXMuYWRkKGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFNlc3Npb25DdXN0b21pemF0aW9uRGlzY292ZXJ5LCBbd29ya3NwYWNlLCBzZWNvbmRXb3Jrc3BhY2VdLCB1c2VySG9tZSwgaW5NZW1vcnlQYXRoVG9VcmkpKTtcblx0XHRjb25zdCBjbGllbnQgPSB7XG5cdFx0XHRycGM6IHtcblx0XHRcdFx0YWdlbnRzOiB7IGdldERpc2NvdmVyeVBhdGhzOiBhc3luYyAoKSA9PiAoeyBwYXRoczogW10gfSksIGRpc2NvdmVyOiBhc3luYyAoKSA9PiAoeyBhZ2VudHM6IFtdIH0pIH0sXG5cdFx0XHRcdGluc3RydWN0aW9uczogeyBnZXREaXNjb3ZlcnlQYXRoczogYXN5bmMgKCkgPT4gKHsgcGF0aHM6IFtdIH0pLCBkaXNjb3ZlcjogYXN5bmMgKCkgPT4gKHsgc291cmNlczogW10gfSkgfSxcblx0XHRcdFx0c2tpbGxzOiB7IGdldERpc2NvdmVyeVBhdGhzOiBhc3luYyAoKSA9PiAoeyBwYXRoczogW10gfSksIGRpc2NvdmVyOiBhc3luYyAoKSA9PiAoeyBza2lsbHM6IFtdIH0pIH0sXG5cdFx0XHR9LFxuXHRcdH0gYXMgdW5rbm93biBhcyBDb3BpbG90Q2xpZW50O1xuXG5cdFx0Y29uc3QgaG9va0NoaWxkcmVuID0gKGF3YWl0IGRpc2NvdmVyeS5kaXNjb3ZlcihjbGllbnQsIENhbmNlbGxhdGlvblRva2VuLk5vbmUpKVxuXHRcdFx0LmZpbHRlcihjdXN0b21pemF0aW9uID0+IGN1c3RvbWl6YXRpb24uY29udGVudHMgPT09ICdob29rJylcblx0XHRcdC5mbGF0TWFwKGN1c3RvbWl6YXRpb24gPT4gKGN1c3RvbWl6YXRpb24uY2hpbGRyZW4gPz8gW10pLm1hcChjaGlsZCA9PiBVUkkucGFyc2UoY2hpbGQudXJpKS5wYXRoKSlcblx0XHRcdC5zb3J0KCk7XG5cblx0XHQvLyBIb29rcyBjb21lIG9ubHkgZnJvbSB0aGUgcHJpbWFyeSByb290IChgL3dvcmtzcGFjZWApLCBuZXZlciBgL3dvcmtzcGFjZTJgLlxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoaG9va0NoaWxkcmVuLCBbJy93b3Jrc3BhY2UvLmdpdGh1Yi9ob29rcy9wcmUtdG9vbC5qc29uJ10pO1xuXHR9KTtcblxuXHR0ZXN0KCdkaXNjb3ZlciByZXNvbHZlcyByZWxhdGl2ZSBpbnN0cnVjdGlvbnMgYWdhaW5zdCB0aGVpciBhdHRyaWJ1dGVkIHByb2plY3Qgcm9vdCBhbmQgZ3JvdXBzIHBlciByb290JywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHNlY29uZFdvcmtzcGFjZSA9IFVSSS5mcm9tKHsgc2NoZW1lOiBTY2hlbWFzLmluTWVtb3J5LCBwYXRoOiAnL3dvcmtzcGFjZTInIH0pO1xuXHRcdGNvbnN0IGZpcnN0RmlsZSA9IGF3YWl0IHNlZWQoJy93b3Jrc3BhY2UvLmdpdGh1Yi9jb3BpbG90LWluc3RydWN0aW9ucy5tZCcsICdmaXJzdCcpO1xuXHRcdGNvbnN0IHNlY29uZEZpbGUgPSBhd2FpdCBzZWVkKCcvd29ya3NwYWNlMi8uZ2l0aHViL2NvcGlsb3QtaW5zdHJ1Y3Rpb25zLm1kJywgJ3NlY29uZCcpO1xuXG5cdFx0bGV0IHJlcXVlc3RlZFByb2plY3RQYXRoczogc3RyaW5nW10gfCB1bmRlZmluZWQ7XG5cdFx0Y29uc3QgZGlzY292ZXJ5ID0gZGlzcG9zYWJsZXMuYWRkKGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFNlc3Npb25DdXN0b21pemF0aW9uRGlzY292ZXJ5LCBbd29ya3NwYWNlLCBzZWNvbmRXb3Jrc3BhY2VdLCB1c2VySG9tZSwgaW5NZW1vcnlQYXRoVG9VcmkpKTtcblx0XHRjb25zdCBjbGllbnQgPSB7XG5cdFx0XHRycGM6IHtcblx0XHRcdFx0YWdlbnRzOiB7IGdldERpc2NvdmVyeVBhdGhzOiBhc3luYyAoKSA9PiAoeyBwYXRoczogW10gfSksIGRpc2NvdmVyOiBhc3luYyAoKSA9PiAoeyBhZ2VudHM6IFtdIH0pIH0sXG5cdFx0XHRcdGluc3RydWN0aW9uczoge1xuXHRcdFx0XHRcdGdldERpc2NvdmVyeVBhdGhzOiBhc3luYyAoKSA9PiAoe1xuXHRcdFx0XHRcdFx0cGF0aHM6IFtcblx0XHRcdFx0XHRcdFx0eyBwYXRoOiAnL3dvcmtzcGFjZS8uZ2l0aHViL2NvcGlsb3QtaW5zdHJ1Y3Rpb25zLm1kJywga2luZDogJ2ZpbGUnIH0sXG5cdFx0XHRcdFx0XHRcdHsgcGF0aDogJy93b3Jrc3BhY2UyLy5naXRodWIvY29waWxvdC1pbnN0cnVjdGlvbnMubWQnLCBraW5kOiAnZmlsZScgfSxcblx0XHRcdFx0XHRcdF0sXG5cdFx0XHRcdFx0fSksXG5cdFx0XHRcdFx0ZGlzY292ZXI6IGFzeW5jIChyZXF1ZXN0OiBBZ2VudHNEaXNjb3ZlclJlcXVlc3QpID0+IHtcblx0XHRcdFx0XHRcdHJlcXVlc3RlZFByb2plY3RQYXRocyA9IHJlcXVlc3QucHJvamVjdFBhdGhzO1xuXHRcdFx0XHRcdFx0Ly8gU2FtZSBSRUxBVElWRSBzb3VyY2VQYXRoIGZyb20gdHdvIHJvb3RzLCBkaXNhbWJpZ3VhdGVkIG9ubHkgYnkgcHJvamVjdFBhdGguXG5cdFx0XHRcdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRcdFx0XHRzb3VyY2VzOiBbXG5cdFx0XHRcdFx0XHRcdFx0eyBpZDogJ2EnLCBsYWJlbDogJ0EnLCBzb3VyY2VQYXRoOiAnLmdpdGh1Yi9jb3BpbG90LWluc3RydWN0aW9ucy5tZCcsIGFwcGx5VG86IHVuZGVmaW5lZCwgdHlwZTogJ3JlcG8nLCBwcm9qZWN0UGF0aDogd29ya3NwYWNlLmZzUGF0aCB9LFxuXHRcdFx0XHRcdFx0XHRcdHsgaWQ6ICdiJywgbGFiZWw6ICdCJywgc291cmNlUGF0aDogJy5naXRodWIvY29waWxvdC1pbnN0cnVjdGlvbnMubWQnLCBhcHBseVRvOiB1bmRlZmluZWQsIHR5cGU6ICdyZXBvJywgcHJvamVjdFBhdGg6IHNlY29uZFdvcmtzcGFjZS5mc1BhdGggfSxcblx0XHRcdFx0XHRcdFx0XSxcblx0XHRcdFx0XHRcdH07XG5cdFx0XHRcdFx0fSxcblx0XHRcdFx0fSxcblx0XHRcdFx0c2tpbGxzOiB7IGdldERpc2NvdmVyeVBhdGhzOiBhc3luYyAoKSA9PiAoeyBwYXRoczogW10gfSksIGRpc2NvdmVyOiBhc3luYyAoKSA9PiAoeyBza2lsbHM6IFtdIH0pIH0sXG5cdFx0XHR9LFxuXHRcdH0gYXMgdW5rbm93biBhcyBDb3BpbG90Q2xpZW50O1xuXG5cdFx0Y29uc3QgY3VzdG9taXphdGlvbnMgPSBhd2FpdCBkaXNjb3ZlcnkuZGlzY292ZXIoY2xpZW50LCBDYW5jZWxsYXRpb25Ub2tlbi5Ob25lKTtcblx0XHRjb25zdCBydWxlRGlyZWN0b3JpZXMgPSBjdXN0b21pemF0aW9uc1xuXHRcdFx0LmZpbHRlcihjdXN0b21pemF0aW9uID0+IGN1c3RvbWl6YXRpb24uY29udGVudHMgPT09ICdydWxlJylcblx0XHRcdC5tYXAoY3VzdG9taXphdGlvbiA9PiAoe1xuXHRcdFx0XHR1cmk6IGN1c3RvbWl6YXRpb24udXJpLFxuXHRcdFx0XHRjaGlsZHJlbjogKGN1c3RvbWl6YXRpb24uY2hpbGRyZW4gPz8gW10pLm1hcChjaGlsZCA9PiBjaGlsZC51cmkpLnNvcnQoKSxcblx0XHRcdH0pKVxuXHRcdFx0LnNvcnQoKGEsIGIpID0+IGEudXJpLmxvY2FsZUNvbXBhcmUoYi51cmkpKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoeyByZXF1ZXN0ZWRQcm9qZWN0UGF0aHMsIHJ1bGVEaXJlY3RvcmllcyB9LCB7XG5cdFx0XHRyZXF1ZXN0ZWRQcm9qZWN0UGF0aHM6IFt3b3Jrc3BhY2UuZnNQYXRoLCBzZWNvbmRXb3Jrc3BhY2UuZnNQYXRoXSxcblx0XHRcdHJ1bGVEaXJlY3RvcmllczogW1xuXHRcdFx0XHR7IHVyaTogd29ya3NwYWNlLnRvU3RyaW5nKCksIGNoaWxkcmVuOiBbZmlyc3RGaWxlLnRvU3RyaW5nKCldIH0sXG5cdFx0XHRcdHsgdXJpOiBzZWNvbmRXb3Jrc3BhY2UudG9TdHJpbmcoKSwgY2hpbGRyZW46IFtzZWNvbmRGaWxlLnRvU3RyaW5nKCldIH0sXG5cdFx0XHRdLnNvcnQoKGEsIGIpID0+IGEudXJpLmxvY2FsZUNvbXBhcmUoYi51cmkpKSxcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnZGlzY292ZXIgc3VyZmFjZXMgYWdlbnRzIGFuZCBza2lsbHMgZnJvbSBldmVyeSB3b3JraW5nIGRpcmVjdG9yeSBpbiBvbmUgY2FsbCcsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBzZWNvbmRXb3Jrc3BhY2UgPSBVUkkuZnJvbSh7IHNjaGVtZTogU2NoZW1hcy5pbk1lbW9yeSwgcGF0aDogJy93b3Jrc3BhY2UyJyB9KTtcblx0XHRsZXQgYWdlbnRQcm9qZWN0UGF0aHM6IHN0cmluZ1tdIHwgdW5kZWZpbmVkO1xuXHRcdGNvbnN0IGRpc2NvdmVyeSA9IGRpc3Bvc2FibGVzLmFkZChpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShTZXNzaW9uQ3VzdG9taXphdGlvbkRpc2NvdmVyeSwgW3dvcmtzcGFjZSwgc2Vjb25kV29ya3NwYWNlXSwgdXNlckhvbWUsIGluTWVtb3J5UGF0aFRvVXJpKSk7XG5cdFx0Y29uc3QgY2xpZW50ID0ge1xuXHRcdFx0cnBjOiB7XG5cdFx0XHRcdGFnZW50czoge1xuXHRcdFx0XHRcdGdldERpc2NvdmVyeVBhdGhzOiBhc3luYyAoKSA9PiAoeyBwYXRoczogW10gfSksXG5cdFx0XHRcdFx0ZGlzY292ZXI6IGFzeW5jIChyZXF1ZXN0OiBBZ2VudHNEaXNjb3ZlclJlcXVlc3QpID0+IHtcblx0XHRcdFx0XHRcdGFnZW50UHJvamVjdFBhdGhzID0gcmVxdWVzdC5wcm9qZWN0UGF0aHM7XG5cdFx0XHRcdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRcdFx0XHRhZ2VudHM6IFtcblx0XHRcdFx0XHRcdFx0XHR7IGlkOiAnb25lJywgbmFtZTogJ09uZScsIGRlc2NyaXB0aW9uOiAnJywgcGF0aDogJy93b3Jrc3BhY2UvLmdpdGh1Yi9hZ2VudHMvb25lLmFnZW50Lm1kJywgdXNlckludm9jYWJsZTogZmFsc2UgfSxcblx0XHRcdFx0XHRcdFx0XHR7IGlkOiAndHdvJywgbmFtZTogJ1R3bycsIGRlc2NyaXB0aW9uOiAnJywgcGF0aDogJy93b3Jrc3BhY2UyLy5naXRodWIvYWdlbnRzL3R3by5hZ2VudC5tZCcsIHVzZXJJbnZvY2FibGU6IGZhbHNlIH0sXG5cdFx0XHRcdFx0XHRcdF0sXG5cdFx0XHRcdFx0XHR9O1xuXHRcdFx0XHRcdH0sXG5cdFx0XHRcdH0sXG5cdFx0XHRcdGluc3RydWN0aW9uczogeyBnZXREaXNjb3ZlcnlQYXRoczogYXN5bmMgKCkgPT4gKHsgcGF0aHM6IFtdIH0pLCBkaXNjb3ZlcjogYXN5bmMgKCkgPT4gKHsgc291cmNlczogW10gfSkgfSxcblx0XHRcdFx0c2tpbGxzOiB7XG5cdFx0XHRcdFx0Z2V0RGlzY292ZXJ5UGF0aHM6IGFzeW5jICgpID0+ICh7IHBhdGhzOiBbXSB9KSxcblx0XHRcdFx0XHRkaXNjb3ZlcjogYXN5bmMgKCkgPT4gKHtcblx0XHRcdFx0XHRcdHNraWxsczogW1xuXHRcdFx0XHRcdFx0XHR7IHBhdGg6ICcvd29ya3NwYWNlLy5naXRodWIvc2tpbGxzL2EnLCBuYW1lOiAnQScsIGRlc2NyaXB0aW9uOiAnJyB9LFxuXHRcdFx0XHRcdFx0XHR7IHBhdGg6ICcvd29ya3NwYWNlMi8uZ2l0aHViL3NraWxscy9iJywgbmFtZTogJ0InLCBkZXNjcmlwdGlvbjogJycgfSxcblx0XHRcdFx0XHRcdF0sXG5cdFx0XHRcdFx0fSksXG5cdFx0XHRcdH0sXG5cdFx0XHR9LFxuXHRcdH0gYXMgdW5rbm93biBhcyBDb3BpbG90Q2xpZW50O1xuXG5cdFx0Y29uc3QgY3VzdG9taXphdGlvbnMgPSBhd2FpdCBkaXNjb3ZlcnkuZGlzY292ZXIoY2xpZW50LCBDYW5jZWxsYXRpb25Ub2tlbi5Ob25lKTtcblx0XHRjb25zdCBjaGlsZFVyaXMgPSBjdXN0b21pemF0aW9uc1xuXHRcdFx0LmZsYXRNYXAoY3VzdG9taXphdGlvbiA9PiAoY3VzdG9taXphdGlvbi5jaGlsZHJlbiA/PyBbXSkubWFwKGNoaWxkID0+IFVSSS5wYXJzZShjaGlsZC51cmkpLnBhdGgpKVxuXHRcdFx0LnNvcnQoKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoeyBhZ2VudFByb2plY3RQYXRocywgY2hpbGRVcmlzIH0sIHtcblx0XHRcdGFnZW50UHJvamVjdFBhdGhzOiBbd29ya3NwYWNlLmZzUGF0aCwgc2Vjb25kV29ya3NwYWNlLmZzUGF0aF0sXG5cdFx0XHRjaGlsZFVyaXM6IFtcblx0XHRcdFx0Jy93b3Jrc3BhY2UvLmdpdGh1Yi9hZ2VudHMvb25lLmFnZW50Lm1kJyxcblx0XHRcdFx0Jy93b3Jrc3BhY2UvLmdpdGh1Yi9za2lsbHMvYScsXG5cdFx0XHRcdCcvd29ya3NwYWNlMi8uZ2l0aHViL2FnZW50cy90d28uYWdlbnQubWQnLFxuXHRcdFx0XHQnL3dvcmtzcGFjZTIvLmdpdGh1Yi9za2lsbHMvYicsXG5cdFx0XHRdLFxuXHRcdH0pO1xuXHR9KTtcbn0pO1xuXG5cbnN1aXRlKCdTZXNzaW9uUGx1Z2luQnVuZGxlcicsICgpID0+IHtcblx0Y29uc3QgZGlzcG9zYWJsZXMgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cdGxldCBmaWxlU2VydmljZTogRmlsZVNlcnZpY2U7XG5cdGxldCBpbnN0YW50aWF0aW9uU2VydmljZTogVGVzdEluc3RhbnRpYXRpb25TZXJ2aWNlO1xuXHRsZXQgd29ya3NwYWNlOiBVUkk7XG5cdGxldCB1c2VySG9tZTogVVJJO1xuXHRsZXQgcGx1Z2luQmFzZVBhdGg6IFVSSTtcblxuXHRzZXR1cCgoKSA9PiB7XG5cdFx0ZmlsZVNlcnZpY2UgPSBkaXNwb3NhYmxlcy5hZGQobmV3IEZpbGVTZXJ2aWNlKG5ldyBOdWxsTG9nU2VydmljZSgpKSk7XG5cdFx0Y29uc3QgbWVtRnMgPSBkaXNwb3NhYmxlcy5hZGQobmV3IEluTWVtb3J5RmlsZVN5c3RlbVByb3ZpZGVyKCkpO1xuXHRcdGRpc3Bvc2FibGVzLmFkZChmaWxlU2VydmljZS5yZWdpc3RlclByb3ZpZGVyKFNjaGVtYXMuaW5NZW1vcnksIG1lbUZzKSk7XG5cblx0XHRpbnN0YW50aWF0aW9uU2VydmljZSA9IGRpc3Bvc2FibGVzLmFkZChuZXcgVGVzdEluc3RhbnRpYXRpb25TZXJ2aWNlKCkpO1xuXHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSUZpbGVTZXJ2aWNlLCBmaWxlU2VydmljZSk7XG5cdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJTG9nU2VydmljZSwgbmV3IE51bGxMb2dTZXJ2aWNlKCkpO1xuXG5cdFx0d29ya3NwYWNlID0gVVJJLmZyb20oeyBzY2hlbWU6IFNjaGVtYXMuaW5NZW1vcnksIHBhdGg6ICcvd29ya3NwYWNlJyB9KTtcblx0XHR1c2VySG9tZSA9IFVSSS5mcm9tKHsgc2NoZW1lOiBTY2hlbWFzLmluTWVtb3J5LCBwYXRoOiAnL2hvbWUnIH0pO1xuXHRcdHBsdWdpbkJhc2VQYXRoID0gVVJJLmZyb20oeyBzY2hlbWU6IFNjaGVtYXMuaW5NZW1vcnksIHBhdGg6ICcvYWdlbnRQbHVnaW5zJyB9KTtcblx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElBZ2VudFBsdWdpbk1hbmFnZXIsIHsgYmFzZVBhdGg6IHBsdWdpbkJhc2VQYXRoIH0gYXMgUGFydGlhbDxJQWdlbnRQbHVnaW5NYW5hZ2VyPik7XG5cdH0pO1xuXG5cdHRlYXJkb3duKCgpID0+IHtcblx0XHRkaXNwb3NhYmxlcy5jbGVhcigpO1xuXHR9KTtcblx0ZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlKCk7XG5cblx0YXN5bmMgZnVuY3Rpb24gc2VlZChwYXRoOiBzdHJpbmcsIGNvbnRlbnQgPSAnJyk6IFByb21pc2U8VVJJPiB7XG5cdFx0Y29uc3QgdXJpID0gVVJJLmZyb20oeyBzY2hlbWU6IFNjaGVtYXMuaW5NZW1vcnksIHBhdGggfSk7XG5cdFx0YXdhaXQgZmlsZVNlcnZpY2Uud3JpdGVGaWxlKHVyaSwgVlNCdWZmZXIuZnJvbVN0cmluZyhjb250ZW50KSk7XG5cdFx0cmV0dXJuIHVyaTtcblx0fVxuXG5cdHRlc3QoJ2J1bmRsZXMgZGlzY292ZXJlZCBmaWxlcyBpbnRvIHRoZSBzeW50aGV0aWMgcGx1Z2luIHRyZWUnLCBhc3luYyAoKSA9PiB7XG5cdFx0YXdhaXQgc2VlZCgnL3dvcmtzcGFjZS8uZ2l0aHViL2FnZW50cy9mb28uYWdlbnQubWQnLCAnYWdlbnQgYm9keScpO1xuXHRcdGF3YWl0IHNlZWQoJy93b3Jrc3BhY2UvLmdpdGh1Yi9za2lsbHMvYmFyL1NLSUxMLm1kJywgJ3NraWxsIGJvZHknKTtcblx0XHRhd2FpdCBzZWVkKCcvd29ya3NwYWNlLy5naXRodWIvaW5zdHJ1Y3Rpb25zL2Jhei5pbnN0cnVjdGlvbnMubWQnLCAnaW5zdHIgYm9keScpO1xuXHRcdGF3YWl0IHNlZWQoJy93b3Jrc3BhY2UvLmdpdGh1Yi9ob29rcy9wcmUtdG9vbC5qc29uJywgJ3tcIlByZVRvb2xVc2VcIjogW119Jyk7XG5cblx0XHRjb25zdCBkaXNjb3ZlcnkgPSBkaXNwb3NhYmxlcy5hZGQoaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoU2Vzc2lvbkN1c3RvbWl6YXRpb25EaXNjb3ZlcnksIFt3b3Jrc3BhY2VdLCB1c2VySG9tZSwgVVJJLmZpbGUpKTtcblx0XHRjb25zdCBidW5kbGVyID0gZGlzcG9zYWJsZXMuYWRkKGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFNlc3Npb25QbHVnaW5CdW5kbGVyLCB3b3Jrc3BhY2UpKTtcblx0XHRjb25zdCBkaXJlY3RvcmllcyA9IGF3YWl0IGRpc2NvdmVyeS5zY2FuKENhbmNlbGxhdGlvblRva2VuLk5vbmUpO1xuXHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IGJ1bmRsZXIuYnVuZGxlKGRpcmVjdG9yaWVzKTtcblxuXHRcdGFzc2VydC5vayhyZXN1bHQpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQucmVmLm5hbWUsICdWUyBDb2RlIFN5bmNlZCBEYXRhJyk7XG5cdFx0YXNzZXJ0Lm9rKHJlc3VsdC5yZWYubm9uY2UpO1xuXG5cdFx0Y29uc3Qgcm9vdCA9IGJ1bmRsZXIucm9vdFVyaTtcblx0XHRjb25zdCBtYW5pZmVzdCA9IGF3YWl0IGZpbGVTZXJ2aWNlLnJlYWRGaWxlKFVSSS5qb2luUGF0aChyb290LCAnLnBsdWdpbicsICdwbHVnaW4uanNvbicpKTtcblx0XHRhc3NlcnQubWF0Y2gobWFuaWZlc3QudmFsdWUudG9TdHJpbmcoKSwgL1wibmFtZVwiOiBcIlZTIENvZGUgU3luY2VkIERhdGFcIi8pO1xuXG5cdFx0Y29uc3QgYWdlbnQgPSBhd2FpdCBmaWxlU2VydmljZS5yZWFkRmlsZShVUkkuam9pblBhdGgocm9vdCwgJ2FnZW50cycsICdmb28uYWdlbnQubWQnKSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGFnZW50LnZhbHVlLnRvU3RyaW5nKCksICdhZ2VudCBib2R5Jyk7XG5cblx0XHRjb25zdCBza2lsbCA9IGF3YWl0IGZpbGVTZXJ2aWNlLnJlYWRGaWxlKFVSSS5qb2luUGF0aChyb290LCAnc2tpbGxzJywgJ2JhcicsICdTS0lMTC5tZCcpKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2tpbGwudmFsdWUudG9TdHJpbmcoKSwgJ3NraWxsIGJvZHknKTtcblxuXHRcdGNvbnN0IGluc3RyID0gYXdhaXQgZmlsZVNlcnZpY2UucmVhZEZpbGUoVVJJLmpvaW5QYXRoKHJvb3QsICdydWxlcycsICdiYXouaW5zdHJ1Y3Rpb25zLm1kJykpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChpbnN0ci52YWx1ZS50b1N0cmluZygpLCAnaW5zdHIgYm9keScpO1xuXG5cdFx0Y29uc3QgaG9vayA9IGF3YWl0IGZpbGVTZXJ2aWNlLnJlYWRGaWxlKFVSSS5qb2luUGF0aChyb290LCAnaG9va3MnLCAncHJlLXRvb2wuanNvbicpKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoaG9vay52YWx1ZS50b1N0cmluZygpLCAne1wiUHJlVG9vbFVzZVwiOiBbXX0nKTtcblx0fSk7XG5cblxuXHR0ZXN0KCdwcm9kdWNlcyBhIHN0YWJsZSBub25jZSBmb3IgaWRlbnRpY2FsIGNvbnRlbnQnLCBhc3luYyAoKSA9PiB7XG5cdFx0YXdhaXQgc2VlZCgnL3dvcmtzcGFjZS8uZ2l0aHViL2FnZW50cy9mb28uYWdlbnQubWQnLCAnYWdlbnQgYm9keScpO1xuXHRcdGF3YWl0IHNlZWQoJy93b3Jrc3BhY2UvLmdpdGh1Yi9za2lsbHMvYmFyL1NLSUxMLm1kJywgJ3NraWxsIGJvZHknKTtcblxuXHRcdGNvbnN0IGRpc2NvdmVyeSA9IGRpc3Bvc2FibGVzLmFkZChpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShTZXNzaW9uQ3VzdG9taXphdGlvbkRpc2NvdmVyeSwgW3dvcmtzcGFjZV0sIHVzZXJIb21lLCBVUkkuZmlsZSkpO1xuXHRcdGNvbnN0IGJ1bmRsZXIgPSBkaXNwb3NhYmxlcy5hZGQoaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoU2Vzc2lvblBsdWdpbkJ1bmRsZXIsIHdvcmtzcGFjZSkpO1xuXHRcdGNvbnN0IGZpcnN0ID0gYXdhaXQgYnVuZGxlci5idW5kbGUoYXdhaXQgZGlzY292ZXJ5LnNjYW4oQ2FuY2VsbGF0aW9uVG9rZW4uTm9uZSkpO1xuXG5cdFx0bGV0IHdyaXRlQ2FsbHMgPSAwO1xuXHRcdGxldCBkZWxldGVDYWxscyA9IDA7XG5cdFx0Y29uc3Qgb3JpZ2luYWxXcml0ZUZpbGUgPSBmaWxlU2VydmljZS53cml0ZUZpbGUuYmluZChmaWxlU2VydmljZSk7XG5cdFx0Y29uc3Qgb3JpZ2luYWxEZWwgPSBmaWxlU2VydmljZS5kZWwuYmluZChmaWxlU2VydmljZSk7XG5cdFx0ZGlzcG9zYWJsZXMuYWRkKHtcblx0XHRcdGRpc3Bvc2U6ICgpID0+IHtcblx0XHRcdFx0ZmlsZVNlcnZpY2Uud3JpdGVGaWxlID0gb3JpZ2luYWxXcml0ZUZpbGUgYXMgdHlwZW9mIGZpbGVTZXJ2aWNlLndyaXRlRmlsZTtcblx0XHRcdFx0ZmlsZVNlcnZpY2UuZGVsID0gb3JpZ2luYWxEZWwgYXMgdHlwZW9mIGZpbGVTZXJ2aWNlLmRlbDtcblx0XHRcdH1cblx0XHR9KTtcblx0XHRmaWxlU2VydmljZS53cml0ZUZpbGUgPSAoKC4uLmFyZ3M6IFBhcmFtZXRlcnM8dHlwZW9mIGZpbGVTZXJ2aWNlLndyaXRlRmlsZT4pID0+IHtcblx0XHRcdHdyaXRlQ2FsbHMrKztcblx0XHRcdHJldHVybiBvcmlnaW5hbFdyaXRlRmlsZSguLi5hcmdzKTtcblx0XHR9KSBhcyB0eXBlb2YgZmlsZVNlcnZpY2Uud3JpdGVGaWxlO1xuXHRcdGZpbGVTZXJ2aWNlLmRlbCA9ICgoLi4uYXJnczogUGFyYW1ldGVyczx0eXBlb2YgZmlsZVNlcnZpY2UuZGVsPikgPT4ge1xuXHRcdFx0ZGVsZXRlQ2FsbHMrKztcblx0XHRcdHJldHVybiBvcmlnaW5hbERlbCguLi5hcmdzKTtcblx0XHR9KSBhcyB0eXBlb2YgZmlsZVNlcnZpY2UuZGVsO1xuXG5cdFx0Y29uc3Qgc2Vjb25kID0gYXdhaXQgYnVuZGxlci5idW5kbGUoYXdhaXQgZGlzY292ZXJ5LnNjYW4oQ2FuY2VsbGF0aW9uVG9rZW4uTm9uZSkpO1xuXHRcdGFzc2VydC5vayhmaXJzdCk7XG5cdFx0YXNzZXJ0Lm9rKHNlY29uZCk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRmaXJzdE5vbmNlOiBmaXJzdC5yZWYubm9uY2UsXG5cdFx0XHRzZWNvbmROb25jZTogc2Vjb25kLnJlZi5ub25jZSxcblx0XHRcdHdyaXRlQ2FsbHMsXG5cdFx0XHRkZWxldGVDYWxscyxcblx0XHR9LCB7XG5cdFx0XHRmaXJzdE5vbmNlOiBmaXJzdC5yZWYubm9uY2UsXG5cdFx0XHRzZWNvbmROb25jZTogZmlyc3QucmVmLm5vbmNlLFxuXHRcdFx0d3JpdGVDYWxsczogMCxcblx0XHRcdGRlbGV0ZUNhbGxzOiAwLFxuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdyZXR1cm5zIHVuZGVmaW5lZCB3aXRob3V0IHJld3JpdGluZyB3aGVuIGNhbmNlbGxlZCcsIGFzeW5jICgpID0+IHtcblx0XHRhd2FpdCBzZWVkKCcvd29ya3NwYWNlLy5naXRodWIvYWdlbnRzL2Zvby5hZ2VudC5tZCcsICdhZ2VudCBib2R5Jyk7XG5cblx0XHRjb25zdCBkaXNjb3ZlcnkgPSBkaXNwb3NhYmxlcy5hZGQoaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoU2Vzc2lvbkN1c3RvbWl6YXRpb25EaXNjb3ZlcnksIFt3b3Jrc3BhY2VdLCB1c2VySG9tZSwgVVJJLmZpbGUpKTtcblx0XHRjb25zdCBidW5kbGVyID0gZGlzcG9zYWJsZXMuYWRkKGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFNlc3Npb25QbHVnaW5CdW5kbGVyLCB3b3Jrc3BhY2UpKTtcblxuXHRcdGxldCB3cml0ZUNhbGxzID0gMDtcblx0XHRsZXQgZGVsZXRlQ2FsbHMgPSAwO1xuXHRcdGNvbnN0IG9yaWdpbmFsV3JpdGVGaWxlID0gZmlsZVNlcnZpY2Uud3JpdGVGaWxlLmJpbmQoZmlsZVNlcnZpY2UpO1xuXHRcdGNvbnN0IG9yaWdpbmFsRGVsID0gZmlsZVNlcnZpY2UuZGVsLmJpbmQoZmlsZVNlcnZpY2UpO1xuXHRcdGRpc3Bvc2FibGVzLmFkZCh7XG5cdFx0XHRkaXNwb3NlOiAoKSA9PiB7XG5cdFx0XHRcdGZpbGVTZXJ2aWNlLndyaXRlRmlsZSA9IG9yaWdpbmFsV3JpdGVGaWxlIGFzIHR5cGVvZiBmaWxlU2VydmljZS53cml0ZUZpbGU7XG5cdFx0XHRcdGZpbGVTZXJ2aWNlLmRlbCA9IG9yaWdpbmFsRGVsIGFzIHR5cGVvZiBmaWxlU2VydmljZS5kZWw7XG5cdFx0XHR9XG5cdFx0fSk7XG5cdFx0ZmlsZVNlcnZpY2Uud3JpdGVGaWxlID0gKCguLi5hcmdzOiBQYXJhbWV0ZXJzPHR5cGVvZiBmaWxlU2VydmljZS53cml0ZUZpbGU+KSA9PiB7XG5cdFx0XHR3cml0ZUNhbGxzKys7XG5cdFx0XHRyZXR1cm4gb3JpZ2luYWxXcml0ZUZpbGUoLi4uYXJncyk7XG5cdFx0fSkgYXMgdHlwZW9mIGZpbGVTZXJ2aWNlLndyaXRlRmlsZTtcblx0XHRmaWxlU2VydmljZS5kZWwgPSAoKC4uLmFyZ3M6IFBhcmFtZXRlcnM8dHlwZW9mIGZpbGVTZXJ2aWNlLmRlbD4pID0+IHtcblx0XHRcdGRlbGV0ZUNhbGxzKys7XG5cdFx0XHRyZXR1cm4gb3JpZ2luYWxEZWwoLi4uYXJncyk7XG5cdFx0fSkgYXMgdHlwZW9mIGZpbGVTZXJ2aWNlLmRlbDtcblxuXHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IGJ1bmRsZXIuYnVuZGxlKGF3YWl0IGRpc2NvdmVyeS5zY2FuKENhbmNlbGxhdGlvblRva2VuLk5vbmUpLCBDYW5jZWxsYXRpb25Ub2tlbi5DYW5jZWxsZWQpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoeyByZXN1bHQsIHdyaXRlQ2FsbHMsIGRlbGV0ZUNhbGxzIH0sIHsgcmVzdWx0OiB1bmRlZmluZWQsIHdyaXRlQ2FsbHM6IDAsIGRlbGV0ZUNhbGxzOiAwIH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdkaWZmZXJlbnQgd29ya2luZyBkaXJlY3RvcmllcyBwcm9kdWNlIGRpZmZlcmVudCBidW5kbGUgYXV0aG9yaXRpZXMnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3Qgb3RoZXJXb3Jrc3BhY2UgPSBVUkkuZnJvbSh7IHNjaGVtZTogU2NoZW1hcy5pbk1lbW9yeSwgcGF0aDogJy9vdGhlci13b3Jrc3BhY2UnIH0pO1xuXHRcdGNvbnN0IGEgPSBkaXNwb3NhYmxlcy5hZGQoaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoU2Vzc2lvblBsdWdpbkJ1bmRsZXIsIHdvcmtzcGFjZSkpO1xuXHRcdGNvbnN0IGIgPSBkaXNwb3NhYmxlcy5hZGQoaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoU2Vzc2lvblBsdWdpbkJ1bmRsZXIsIG90aGVyV29ya3NwYWNlKSk7XG5cdFx0YXNzZXJ0Lm5vdFN0cmljdEVxdWFsKGEucm9vdFVyaS50b1N0cmluZygpLCBiLnJvb3RVcmkudG9T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
