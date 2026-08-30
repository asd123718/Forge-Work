import assert from "assert";
import { timeout } from "../../../../../../base/common/async.js";
import { Codicon } from "../../../../../../base/common/codicons.js";
import { Emitter, Event } from "../../../../../../base/common/event.js";
import { DisposableStore } from "../../../../../../base/common/lifecycle.js";
import { ResourceSet } from "../../../../../../base/common/map.js";
import { derived, observableValue } from "../../../../../../base/common/observable.js";
import { URI } from "../../../../../../base/common/uri.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../../../base/test/common/utils.js";
import { PluginFormat } from "../../../../../../platform/agentPlugins/common/pluginParsers.js";
import { workbenchInstantiationService } from "../../../../../test/browser/workbenchTestServices.js";
import { AICustomizationItemsModel } from "../../../browser/aiCustomization/aiCustomizationItemsModel.js";
import { AICustomizationManagementSection, AICustomizationSources, BUILTIN_STORAGE, IAICustomizationWorkspaceService } from "../../../common/aiCustomizationWorkspaceService.js";
import { ICustomizationHarnessService } from "../../../common/customizationHarnessService.js";
import { ContributionEnablementState } from "../../../common/enablement.js";
import { IAgentPluginService } from "../../../common/plugins/agentPluginService.js";
import { PromptsType, Target } from "../../../common/promptSyntax/promptTypes.js";
import { IAgentSource, IPromptsService, PromptsStorage } from "../../../common/promptSyntax/service/promptsService.js";
import { getChatSessionType } from "../../../common/model/chatUri.js";
import { basename } from "../../../../../../base/common/resources.js";
suite("AICustomizationItemsModel", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  suite("basics", () => {
    let disposables;
    let instaService;
    let activeSessionResource;
    let activeHarness;
    let availableHarnesses;
    let descriptorA;
    let descriptorB;
    let providerA_didChange;
    let providerA_callCount;
    let providerA_items;
    let plugins;
    let listPromptFilesResult;
    let disabledPromptFilesResult;
    function createDescriptor(id, provider, syncProvider) {
      return {
        id,
        label: id,
        icon: Codicon.settingsGear,
        itemProvider: provider,
        syncProvider
      };
    }
    setup(() => {
      disposables = new DisposableStore();
      providerA_didChange = disposables.add(new Emitter());
      providerA_callCount = 0;
      providerA_items = [];
      listPromptFilesResult = [];
      disabledPromptFilesResult = new ResourceSet();
      const providerA = {
        onDidChange: providerA_didChange.event,
        provideChatSessionCustomizations: (sessionResource, token) => {
          providerA_callCount++;
          return Promise.resolve(providerA_items.slice());
        }
      };
      const providerB = {
        onDidChange: Event.None,
        provideChatSessionCustomizations: (sessionResource, token) => Promise.resolve([])
      };
      descriptorA = createDescriptor("A", providerA);
      descriptorB = createDescriptor("B", providerB);
      activeSessionResource = observableValue("activeSessionResource", URI.parse(`A:///session`));
      activeHarness = derived((reader) => getChatSessionType(activeSessionResource.read(reader)));
      availableHarnesses = observableValue("availableHarnesses", [descriptorA, descriptorB]);
      plugins = observableValue("plugins", []);
      instaService = workbenchInstantiationService({}, disposables);
      function customAgentFromPromptPath(promptFile) {
        return {
          id: promptFile.uri.toString(),
          uri: promptFile.uri,
          name: promptFile.name ?? basename(promptFile.uri),
          description: promptFile.description,
          target: Target.VSCode,
          visibility: { agentInvocable: true, userInvocable: true },
          enabled: !disabledPromptFilesResult.has(promptFile.uri),
          source: IAgentSource.fromPromptPath(promptFile),
          agentInstructions: { content: "", toolReferences: [] }
        };
      }
      instaService.stub(IPromptsService, {
        onDidChangeCustomAgents: Event.None,
        onDidChangeSlashCommands: Event.None,
        onDidChangeSkills: Event.None,
        onDidChangeHooks: Event.None,
        onDidChangeInstructions: Event.None,
        onDidChangeAgentInstructions: Event.None,
        listPromptFiles: async (type) => listPromptFilesResult.filter((f) => f.type === type),
        listPromptFilesForStorage: async () => [],
        getCustomAgents: async () => listPromptFilesResult.filter((f) => f.type === PromptsType.agent).map(customAgentFromPromptPath),
        findAgentSkills: async () => [],
        getHooks: async () => void 0,
        getInstructionFiles: async () => [],
        getPromptSlashCommands: async () => [],
        listAgentInstructions: async () => [],
        getDisabledPromptFiles: () => disabledPromptFilesResult
      });
      instaService.stub(IAICustomizationWorkspaceService, {
        activeProjectRoot: observableValue("test", void 0),
        getActiveProjectRoot: () => void 0,
        managementSections: [AICustomizationManagementSection.Agents],
        isSessionsWindow: false,
        welcomePageFeatures: { showGettingStartedBanner: false },
        getSkillUIIntegrations: () => /* @__PURE__ */ new Map(),
        hasOverrideProjectRoot: observableValue("test", false),
        commitFiles: async () => {
        },
        deleteFiles: async () => {
        },
        generateCustomization: async () => {
        },
        setOverrideProjectRoot: () => {
        },
        clearOverrideProjectRoot: () => {
        }
      });
      instaService.stub(ICustomizationHarnessService, {
        activeSessionResource,
        activeHarness,
        availableHarnesses,
        setActiveSession: (sessionResource) => {
          activeSessionResource.set(sessionResource, void 0);
        },
        getActiveDescriptor: () => availableHarnesses.get().find((d) => d.id === activeHarness.get()),
        findHarnessById: (id) => availableHarnesses.get().find((d) => d.id === id),
        registerExternalHarness: () => ({ dispose() {
        } })
      });
      instaService.stub(IAgentPluginService, {
        plugins,
        enablementModel: {
          readEnabled: () => ContributionEnablementState.EnabledProfile,
          readProfileEnabled: () => true,
          setEnabled: () => {
          },
          remove: () => {
          }
        }
      });
    });
    function createLocalPlugin(name) {
      return {
        uri: URI.parse(`plugin-test://${name}`),
        format: PluginFormat.Copilot,
        label: name,
        enablement: observableValue("pluginEnablement", ContributionEnablementState.EnabledProfile),
        remove: () => {
        },
        hooks: observableValue("pluginHooks", []),
        commands: observableValue("pluginCommands", []),
        skills: observableValue("pluginSkills", []),
        agents: observableValue("pluginAgents", []),
        instructions: observableValue("pluginInstructions", []),
        mcpServerDefinitions: observableValue("pluginMcpServerDefinitions", [])
      };
    }
    teardown(() => disposables.dispose());
    test("exposes per-section observables for all prompts-based sections", () => {
      const model = disposables.add(instaService.createInstance(AICustomizationItemsModel));
      assert.ok(model.getItems(AICustomizationManagementSection.Agents));
      assert.ok(model.getItems(AICustomizationManagementSection.Skills));
      assert.ok(model.getItems(AICustomizationManagementSection.Instructions));
      assert.ok(model.getItems(AICustomizationManagementSection.Prompts));
      assert.ok(model.getItems(AICustomizationManagementSection.Hooks));
    });
    test("does not fetch on construction (lazy)", async () => {
      disposables.add(instaService.createInstance(AICustomizationItemsModel));
      await timeout(0);
      assert.strictEqual(providerA_callCount, 0);
    });
    test("first read of a section triggers a fetch", async () => {
      const model = disposables.add(instaService.createInstance(AICustomizationItemsModel));
      model.getItems(AICustomizationManagementSection.Agents);
      await timeout(0);
      assert.strictEqual(providerA_callCount, 1);
      model.getItems(AICustomizationManagementSection.Skills);
      await timeout(0);
      assert.strictEqual(providerA_callCount, 1);
      providerA_didChange.fire();
      await timeout(0);
      assert.strictEqual(providerA_callCount, 2);
      model.getItems(AICustomizationManagementSection.Agents);
      assert.strictEqual(providerA_callCount, 2);
    });
    test("source.onDidChange refetches only previously-observed sections", async () => {
      const model = disposables.add(instaService.createInstance(AICustomizationItemsModel));
      model.getItems(AICustomizationManagementSection.Agents);
      await timeout(0);
      const before = providerA_callCount;
      providerA_didChange.fire();
      await timeout(0);
      assert.strictEqual(providerA_callCount, before + 1);
    });
    test("switching harness re-binds and refetches observed sections", async () => {
      const model = disposables.add(instaService.createInstance(AICustomizationItemsModel));
      model.getItems(AICustomizationManagementSection.Agents);
      await timeout(0);
      const sourceA = model.getActiveItemSource();
      activeSessionResource.set(URI.parse("B://session"), void 0);
      await timeout(0);
      const sourceB = model.getActiveItemSource();
      assert.notStrictEqual(sourceA, sourceB);
    });
    test("preserves provider-supplied plugin storage when pluginUri is omitted", async () => {
      providerA_items = [{
        uri: URI.parse("agent-host://test-authority/plugins/my-plugin/skills/my-skill/SKILL.md"),
        type: PromptsType.skill,
        name: "My Skill",
        source: PromptsStorage.plugin,
        extensionId: void 0,
        pluginUri: void 0,
        userInvocable: true
      }];
      const model = disposables.add(instaService.createInstance(AICustomizationItemsModel));
      const items = model.getItems(AICustomizationManagementSection.Skills);
      await model.whenSectionLoaded(AICustomizationManagementSection.Skills);
      assert.deepStrictEqual(items.get().map((item) => ({
        name: item.name,
        source: item.source
      })), [{
        name: "My Skill",
        source: AICustomizationSources.plugin
      }]);
    });
    test("preserves provider-supplied builtin storage when groupKey is omitted", async () => {
      providerA_items = [{
        uri: URI.parse("agent-host://test-authority/builtin/skills/github/SKILL.md"),
        type: PromptsType.skill,
        name: "Built-in Skill",
        source: AICustomizationSources.builtin,
        extensionId: void 0,
        pluginUri: void 0,
        userInvocable: true
      }];
      const model = disposables.add(instaService.createInstance(AICustomizationItemsModel));
      const items = model.getItems(AICustomizationManagementSection.Skills);
      await model.whenSectionLoaded(AICustomizationManagementSection.Skills);
      assert.deepStrictEqual(items.get().map((item) => ({
        name: item.name,
        source: item.source,
        groupKey: item.groupKey,
        isBuiltin: item.isBuiltin
      })), [{
        name: "Built-in Skill",
        source: AICustomizationSources.builtin,
        groupKey: BUILTIN_STORAGE,
        isBuiltin: true
      }]);
    });
    test("preserves builtin grouping when only groupKey is set (no storage/extensionId/pluginUri)", async () => {
      providerA_items = [{
        uri: URI.parse("agent-app://builtin/coder.agent.md"),
        type: PromptsType.agent,
        name: "Coder",
        groupKey: BUILTIN_STORAGE,
        enabled: true,
        extensionId: void 0,
        pluginUri: void 0,
        source: AICustomizationSources.builtin
        // Ignored, should be overridden by groupKey
      }];
      const model = disposables.add(instaService.createInstance(AICustomizationItemsModel));
      const items = model.getItems(AICustomizationManagementSection.Agents);
      await model.whenSectionLoaded(AICustomizationManagementSection.Agents);
      assert.deepStrictEqual(items.get().map((item) => ({
        name: item.name,
        groupKey: item.groupKey,
        isBuiltin: item.isBuiltin
      })), [{
        name: "Coder",
        groupKey: BUILTIN_STORAGE,
        isBuiltin: true
      }]);
    });
    test("prompt service items preserve storage grouping, metadata, and disabled state without sync provider", async () => {
      availableHarnesses.set([createDescriptor("A", void 0), descriptorB], void 0);
      activeSessionResource.set(URI.parse("A:///session2"), void 0);
      listPromptFilesResult = [{
        uri: URI.parse("file:///workspace/agents/team-agent.agent.md"),
        storage: PromptsStorage.local,
        type: PromptsType.agent,
        name: "Team Agent",
        description: "Workspace agent description"
      }];
      disabledPromptFilesResult = new ResourceSet([listPromptFilesResult[0].uri]);
      const model = disposables.add(instaService.createInstance(AICustomizationItemsModel));
      const items = model.getItems(AICustomizationManagementSection.Agents);
      await model.whenSectionLoaded(AICustomizationManagementSection.Agents);
      assert.deepStrictEqual(items.get().map((item) => ({
        id: item.id,
        uri: item.uri.toString(),
        name: item.name,
        description: item.description,
        source: item.source,
        disabled: item.disabled,
        groupKey: item.groupKey,
        syncable: item.syncable,
        synced: item.synced
      })), [{
        id: "file:///workspace/agents/team-agent.agent.md",
        uri: "file:///workspace/agents/team-agent.agent.md",
        name: "Team Agent",
        description: "Workspace agent description",
        source: AICustomizationSources.local,
        disabled: true,
        groupKey: void 0,
        syncable: void 0,
        synced: void 0
      }]);
    });
    test("plugin count includes provider-supplied plugin items", async () => {
      providerA_items = [
        {
          uri: URI.parse("agent-host://test-authority/plugins/remote-one"),
          type: "plugin",
          name: "Remote One",
          source: AICustomizationSources.plugin,
          extensionId: void 0,
          pluginUri: void 0,
          userInvocable: void 0
        },
        {
          uri: URI.parse("agent-host://test-authority/plugins/remote-two"),
          type: AICustomizationManagementSection.Plugins,
          name: "Remote Two",
          source: AICustomizationSources.plugin,
          extensionId: void 0,
          pluginUri: void 0,
          userInvocable: void 0
        },
        {
          uri: URI.parse("agent-host://test-authority/plugins/remote-two/skills/my-skill/SKILL.md"),
          type: PromptsType.skill,
          name: "My Skill",
          source: AICustomizationSources.plugin,
          extensionId: void 0,
          pluginUri: void 0,
          userInvocable: true
        },
        {
          uri: URI.parse("agent-host://test-authority/plugins/local-synced"),
          type: "plugin",
          name: "Local Synced",
          source: AICustomizationSources.plugin,
          groupKey: "remote-client",
          extensionId: void 0,
          pluginUri: void 0,
          userInvocable: void 0
        }
      ];
      const model = disposables.add(instaService.createInstance(AICustomizationItemsModel));
      const count = model.getPluginCount();
      await timeout(0);
      assert.strictEqual(count.get(), 2);
    });
    test("local plugin changes update plugin count without refetching provider customizations", async () => {
      providerA_items = [{
        uri: URI.parse("agent-host://test-authority/plugins/remote-one"),
        type: "plugin",
        name: "Remote One",
        source: AICustomizationSources.plugin,
        extensionId: void 0,
        pluginUri: void 0,
        userInvocable: void 0
      }];
      const model = disposables.add(instaService.createInstance(AICustomizationItemsModel));
      const count = model.getPluginCount();
      await timeout(0);
      const callsAfterInitialCount = providerA_callCount;
      plugins.set([createLocalPlugin("local-one")], void 0);
      await timeout(0);
      assert.deepStrictEqual({
        count: count.get(),
        providerA_callCount
      }, {
        count: 2,
        providerA_callCount: callsAfterInitialCount
      });
    });
    test("plugin count dedupes provider plugins that are also installed locally", async () => {
      providerA_items = [{
        uri: URI.parse("agent-host://test-authority/plugins/model-council"),
        type: "plugin",
        name: "model-council",
        source: AICustomizationSources.plugin,
        extensionId: void 0,
        pluginUri: void 0,
        userInvocable: void 0
      }];
      const model = disposables.add(instaService.createInstance(AICustomizationItemsModel));
      const count = model.getPluginCount();
      await timeout(0);
      assert.strictEqual(count.get(), 1, "before local install: only the harness-reported plugin counts");
      plugins.set([createLocalPlugin("model-council")], void 0);
      await timeout(0);
      assert.strictEqual(count.get(), 1, "after local install: harness duplicate is folded into the local count");
    });
    test("does not double-count local syncable items when itemProvider and syncProvider are both present", async () => {
      const syncProvider_didChange = disposables.add(new Emitter());
      const syncProvider = {
        onDidChange: syncProvider_didChange.event,
        isDisabled: () => false,
        setDisabled: () => {
        }
      };
      const providerWithSync = {
        onDidChange: providerA_didChange.event,
        provideChatSessionCustomizations: (sessionResource, token) => {
          providerA_callCount++;
          return Promise.resolve(providerA_items.slice());
        }
      };
      availableHarnesses.set([createDescriptor("A", providerWithSync, syncProvider), descriptorB], void 0);
      providerA_items = [{
        uri: URI.parse("agent-host://test-authority/agents/coder.agent.md"),
        type: PromptsType.agent,
        name: "Coder",
        source: AICustomizationSources.user,
        extensionId: void 0,
        pluginUri: void 0
      }];
      listPromptFilesResult = [{
        uri: URI.parse("file:///user/agents/coder.agent.md"),
        storage: PromptsStorage.user,
        type: PromptsType.agent
      }];
      const model = disposables.add(instaService.createInstance(AICustomizationItemsModel));
      const items = model.getItems(AICustomizationManagementSection.Agents);
      await model.whenSectionLoaded(AICustomizationManagementSection.Agents);
      assert.deepStrictEqual(items.get().map((i) => i.name), ["Coder"]);
    });
    test("syncProvider.onDidChange does not refetch when itemProvider is present", async () => {
      const syncProvider_didChange = disposables.add(new Emitter());
      const syncProvider = {
        onDidChange: syncProvider_didChange.event,
        isDisabled: () => false,
        setDisabled: () => {
        }
      };
      const providerWithSync = {
        onDidChange: providerA_didChange.event,
        provideChatSessionCustomizations: (sessionResource, token) => {
          providerA_callCount++;
          return Promise.resolve(providerA_items.slice());
        }
      };
      availableHarnesses.set([createDescriptor("A", providerWithSync, syncProvider), descriptorB], void 0);
      const model = disposables.add(instaService.createInstance(AICustomizationItemsModel));
      model.getItems(AICustomizationManagementSection.Agents);
      await timeout(0);
      const before = providerA_callCount;
      syncProvider_didChange.fire();
      await timeout(0);
      assert.strictEqual(providerA_callCount, before, "syncProvider events must not trigger refetches when itemProvider owns the data path");
    });
  });
  suite("data sources", () => {
    let disposables;
    let instaService;
    let providerDidChange;
    let providerItems;
    let plugins;
    setup(() => {
      disposables = new DisposableStore();
      providerDidChange = disposables.add(new Emitter());
      providerItems = [];
      plugins = observableValue("plugins", []);
      const provider = {
        onDidChange: providerDidChange.event,
        provideChatSessionCustomizations: (sessionResource2, token) => Promise.resolve(providerItems.slice())
      };
      const descriptor = {
        id: "A",
        label: "A",
        icon: Codicon.settingsGear,
        itemProvider: provider
      };
      const sessionResource = URI.parse("A:///active-session");
      const availableHarnesses = observableValue("availableHarnesses", [descriptor]);
      instaService = workbenchInstantiationService({}, disposables);
      instaService.stub(IPromptsService, {
        onDidChangeCustomAgents: Event.None,
        onDidChangeSlashCommands: Event.None,
        onDidChangeSkills: Event.None,
        onDidChangeHooks: Event.None,
        onDidChangeInstructions: Event.None,
        onDidChangeAgentInstructions: Event.None,
        listPromptFiles: async () => [],
        listPromptFilesForStorage: async () => [],
        getCustomAgents: async () => [],
        findAgentSkills: async () => [],
        getHooks: async () => void 0,
        getInstructionFiles: async () => [],
        getDisabledPromptFiles: () => new ResourceSet()
      });
      instaService.stub(IAICustomizationWorkspaceService, {
        activeProjectRoot: observableValue("test", void 0),
        getActiveProjectRoot: () => void 0,
        managementSections: [AICustomizationManagementSection.Agents],
        isSessionsWindow: false,
        welcomePageFeatures: { showGettingStartedBanner: false },
        getSkillUIIntegrations: () => /* @__PURE__ */ new Map(),
        hasOverrideProjectRoot: observableValue("test", false),
        commitFiles: async () => {
        },
        deleteFiles: async () => {
        },
        generateCustomization: async () => {
        },
        setOverrideProjectRoot: () => {
        },
        clearOverrideProjectRoot: () => {
        }
      });
      const activeSessionResource = observableValue("activeSessionResource", sessionResource);
      const activeHarness = derived((reader) => getChatSessionType(activeSessionResource.read(reader)));
      instaService.stub(ICustomizationHarnessService, {
        activeSessionResource,
        activeHarness,
        availableHarnesses,
        setActiveSession: (sessionResource2) => {
          activeSessionResource.set(sessionResource2, void 0);
        },
        getActiveDescriptor: () => availableHarnesses.get().find((d) => d.id === activeHarness.get()),
        findHarnessById: (id) => availableHarnesses.get().find((d) => d.id === id),
        registerExternalHarness: () => ({ dispose() {
        } })
      });
      instaService.stub(IAgentPluginService, {
        plugins,
        enablementModel: {
          readEnabled: () => ContributionEnablementState.EnabledProfile,
          readProfileEnabled: () => true,
          setEnabled: () => {
          },
          remove: () => {
          }
        }
      });
    });
    teardown(() => disposables.dispose());
    function localPlugin(name) {
      return {
        uri: URI.parse(`plugin-test://${name}`),
        format: PluginFormat.Copilot,
        label: name,
        enablement: observableValue("pluginEnablement", ContributionEnablementState.EnabledProfile),
        remove: () => {
        },
        hooks: observableValue("pluginHooks", []),
        commands: observableValue("pluginCommands", []),
        skills: observableValue("pluginSkills", []),
        agents: observableValue("pluginAgents", []),
        instructions: observableValue("pluginInstructions", []),
        mcpServerDefinitions: observableValue("pluginMcpServerDefinitions", [])
      };
    }
    function harnessPluginRow(name, overrides = {}) {
      return {
        uri: URI.parse(`agent-host://t/plugins/${name}`),
        type: "plugin",
        name,
        source: AICustomizationSources.plugin,
        extensionId: void 0,
        pluginUri: void 0,
        userInvocable: void 0,
        ...overrides
      };
    }
    function providerSkill(name, uri = `agent-host://t/skills/${name}/SKILL.md`) {
      return {
        uri: URI.parse(uri),
        type: PromptsType.skill,
        name,
        source: AICustomizationSources.plugin,
        extensionId: void 0,
        pluginUri: void 0,
        userInvocable: true
      };
    }
    function providerOfType(type, name) {
      return {
        uri: URI.parse(`agent-host://t/${type}/${name}`),
        type,
        name,
        // Hooks pre-expanded items are kept under `plugin` storage; using
        // plugin storage uniformly avoids the file-system expansion path
        // in tests for non-hook types as well.
        source: AICustomizationSources.plugin,
        extensionId: void 0,
        pluginUri: void 0,
        userInvocable: true
      };
    }
    const sectionsByType = [
      [AICustomizationManagementSection.Agents, PromptsType.agent],
      [AICustomizationManagementSection.Skills, PromptsType.skill],
      [AICustomizationManagementSection.Instructions, PromptsType.instructions],
      [AICustomizationManagementSection.Prompts, PromptsType.prompt],
      [AICustomizationManagementSection.Hooks, PromptsType.hook]
    ];
    for (const [section, type] of sectionsByType) {
      test(`getCount(${section}) mirrors provider items filtered by type=${type}`, async () => {
        providerItems = [
          providerOfType(type, "a"),
          providerOfType(type, "b"),
          providerOfType(PromptsType.agent, "unrelated-1"),
          providerOfType(PromptsType.skill, "unrelated-2")
        ];
        const model = disposables.add(instaService.createInstance(AICustomizationItemsModel));
        const count = model.getCount(section);
        await model.whenSectionLoaded(section);
        const expected = providerItems.filter((i) => i.type === type).length;
        assert.strictEqual(count.get(), expected, `${section} count should equal provider items where type === ${type}`);
      });
    }
    test("getCount reacts to provider onDidChange for observed sections", async () => {
      providerItems = [providerSkill("one")];
      const model = disposables.add(instaService.createInstance(AICustomizationItemsModel));
      const count = model.getCount(AICustomizationManagementSection.Skills);
      await model.whenSectionLoaded(AICustomizationManagementSection.Skills);
      assert.strictEqual(count.get(), 1, "initial fetch reflects provider state");
      providerItems = [providerSkill("one"), providerSkill("two")];
      providerDidChange.fire();
      await timeout(0);
      assert.strictEqual(count.get(), 2, "count refetches after provider change");
    });
    test("getPluginCount returns local plugin count when harness has no plugin rows", async () => {
      providerItems = [providerSkill("not-a-plugin-row")];
      plugins.set([localPlugin("local-a"), localPlugin("local-b")], void 0);
      const model = disposables.add(instaService.createInstance(AICustomizationItemsModel));
      const count = model.getPluginCount();
      await timeout(0);
      assert.strictEqual(count.get(), 2, "plugin count uses local plugins when the harness exposes none");
    });
    test("getPluginCount returns harness plugin row count when no local plugins are installed", async () => {
      providerItems = [
        harnessPluginRow("x"),
        harnessPluginRow("y", { type: AICustomizationManagementSection.Plugins }),
        harnessPluginRow("synced", { groupKey: "remote-client" })
      ];
      plugins.set([], void 0);
      const model = disposables.add(instaService.createInstance(AICustomizationItemsModel));
      const count = model.getPluginCount();
      await timeout(0);
      assert.strictEqual(count.get(), 2, 'remote-client harness rows are excluded; both internal "plugin" and API "plugins" types are recognised');
    });
    test("getPluginCount sums local plugins and unique harness plugin rows", async () => {
      providerItems = [
        harnessPluginRow("dup"),
        harnessPluginRow("uniq")
      ];
      plugins.set([localPlugin("dup"), localPlugin("local-only")], void 0);
      const model = disposables.add(instaService.createInstance(AICustomizationItemsModel));
      const count = model.getPluginCount();
      await timeout(0);
      assert.strictEqual(count.get(), 3, "dup is counted once via the local source; uniq adds, local-only adds");
    });
    test("getPluginCount dedups against URI basename when local plugin label is empty", async () => {
      providerItems = [harnessPluginRow("basename-match")];
      const labelless = {
        ...localPlugin("basename-match"),
        uri: URI.parse("plugin-test:///basename-match"),
        label: ""
      };
      plugins.set([labelless], void 0);
      const model = disposables.add(instaService.createInstance(AICustomizationItemsModel));
      const count = model.getPluginCount();
      await timeout(0);
      assert.strictEqual(count.get(), 1, "remote row is folded into the labelless local plugin via basename");
    });
  });
  suite("agent host item source caches all types", () => {
    let disposables;
    let instaService;
    let providerItems;
    let builtinSkills;
    let disabledPromptFiles;
    let onDidChangeSkills;
    setup(() => {
      disposables = new DisposableStore();
      providerItems = [];
      builtinSkills = [];
      disabledPromptFiles = new ResourceSet();
      onDidChangeSkills = disposables.add(new Emitter());
      const sessionType = "agent-host-test";
      const provider = {
        onDidChange: Event.None,
        provideChatSessionCustomizations: () => Promise.resolve(providerItems.slice())
      };
      const descriptor = {
        id: sessionType,
        label: "Agent Host Test",
        icon: Codicon.settingsGear,
        itemProvider: provider
      };
      const sessionResource = URI.parse(`${sessionType}:///active-session`);
      const availableHarnesses = observableValue("availableHarnesses", [descriptor]);
      instaService = workbenchInstantiationService({}, disposables);
      instaService.stub(IPromptsService, {
        onDidChangeCustomAgents: Event.None,
        onDidChangeSlashCommands: Event.None,
        onDidChangeSkills: onDidChangeSkills.event,
        onDidChangeHooks: Event.None,
        onDidChangeInstructions: Event.None,
        onDidChangeAgentInstructions: Event.None,
        listPromptFiles: async () => [],
        listPromptFilesForStorage: async (type, storage) => type === PromptsType.skill && storage === PromptsStorage.builtIn ? builtinSkills.slice() : [],
        getCustomAgents: async () => [],
        findAgentSkills: async () => [],
        getHooks: async () => void 0,
        getInstructionFiles: async () => [],
        getDisabledPromptFiles: () => disabledPromptFiles
      });
      instaService.stub(IAICustomizationWorkspaceService, {
        activeProjectRoot: observableValue("test", void 0),
        getActiveProjectRoot: () => void 0,
        managementSections: [AICustomizationManagementSection.Agents],
        isSessionsWindow: false,
        welcomePageFeatures: { showGettingStartedBanner: false },
        getSkillUIIntegrations: () => /* @__PURE__ */ new Map(),
        hasOverrideProjectRoot: observableValue("test", false),
        commitFiles: async () => {
        },
        deleteFiles: async () => {
        },
        generateCustomization: async () => {
        },
        setOverrideProjectRoot: () => {
        },
        clearOverrideProjectRoot: () => {
        }
      });
      const activeSessionResource = observableValue("activeSessionResource", sessionResource);
      const activeHarness = derived((reader) => getChatSessionType(activeSessionResource.read(reader)));
      instaService.stub(ICustomizationHarnessService, {
        activeSessionResource,
        activeHarness,
        availableHarnesses,
        setActiveSession: (next) => activeSessionResource.set(next, void 0),
        getActiveDescriptor: () => availableHarnesses.get().find((d) => d.id === activeHarness.get()),
        findHarnessById: (id) => availableHarnesses.get().find((d) => d.id === id),
        registerExternalHarness: () => ({ dispose() {
        } })
      });
      instaService.stub(IAgentPluginService, {
        plugins: observableValue("plugins", []),
        enablementModel: {
          readEnabled: () => ContributionEnablementState.EnabledProfile,
          readProfileEnabled: () => true,
          setEnabled: () => {
          },
          remove: () => {
          }
        }
      });
    });
    teardown(() => disposables.dispose());
    test("observing one section does not hide items of other sections", async () => {
      providerItems = [
        { uri: URI.parse("agent-host://t/agents/coder.agent.md"), type: PromptsType.agent, name: "coder", source: AICustomizationSources.plugin, extensionId: void 0, pluginUri: void 0, userInvocable: true },
        { uri: URI.parse("agent-host://t/rules/style.instructions.md"), type: PromptsType.instructions, name: "style", source: AICustomizationSources.plugin, extensionId: void 0, pluginUri: void 0, userInvocable: void 0 },
        { uri: URI.parse("agent-host://t/skills/repo/SKILL.md"), type: PromptsType.skill, name: "repo", source: AICustomizationSources.plugin, extensionId: void 0, pluginUri: void 0, userInvocable: true }
      ];
      const model = disposables.add(instaService.createInstance(AICustomizationItemsModel));
      const agentItems = model.getItems(AICustomizationManagementSection.Agents);
      await model.whenSectionLoaded(AICustomizationManagementSection.Agents);
      const instructionItems = model.getItems(AICustomizationManagementSection.Instructions);
      await model.whenSectionLoaded(AICustomizationManagementSection.Instructions);
      assert.deepStrictEqual(
        {
          agents: agentItems.get().map((i) => i.name).sort(),
          instructions: instructionItems.get().map((i) => i.name).sort()
        },
        {
          agents: ["coder"],
          instructions: ["style"]
        }
      );
    });
    test("lists disabled built-in skills as disabled instead of dropping them", async () => {
      const disabledSkill = URI.file("/builtin/create-pr/SKILL.md");
      const enabledSkill = URI.file("/builtin/merge/SKILL.md");
      builtinSkills = [
        { uri: disabledSkill, type: PromptsType.skill, storage: PromptsStorage.builtIn, name: "create-pr" },
        { uri: enabledSkill, type: PromptsType.skill, storage: PromptsStorage.builtIn, name: "merge" }
      ];
      disabledPromptFiles = new ResourceSet([disabledSkill]);
      providerItems = [
        { uri: enabledSkill, type: PromptsType.skill, name: "merge", source: AICustomizationSources.builtin, groupKey: BUILTIN_STORAGE, extensionId: void 0, pluginUri: void 0, userInvocable: true }
      ];
      const model = disposables.add(instaService.createInstance(AICustomizationItemsModel));
      const skillItems = model.getItems(AICustomizationManagementSection.Skills);
      await model.whenSectionLoaded(AICustomizationManagementSection.Skills);
      assert.deepStrictEqual(
        skillItems.get().map((i) => ({ name: i.name, source: i.source, groupKey: i.groupKey, disabled: i.disabled })).sort((a, b) => a.name.localeCompare(b.name)),
        [
          { name: "create-pr", source: AICustomizationSources.builtin, groupKey: BUILTIN_STORAGE, disabled: true },
          { name: "merge", source: AICustomizationSources.builtin, groupKey: BUILTIN_STORAGE, disabled: false }
        ]
      );
    });
    test("refreshes built-in skill disabled state when onDidChangeSkills fires", async () => {
      const skill = URI.file("/builtin/create-pr/SKILL.md");
      builtinSkills = [
        { uri: skill, type: PromptsType.skill, storage: PromptsStorage.builtIn, name: "create-pr" }
      ];
      providerItems = [
        { uri: skill, type: PromptsType.skill, name: "create-pr", source: AICustomizationSources.builtin, groupKey: BUILTIN_STORAGE, extensionId: void 0, pluginUri: void 0, userInvocable: true }
      ];
      const model = disposables.add(instaService.createInstance(AICustomizationItemsModel));
      const skillItems = model.getItems(AICustomizationManagementSection.Skills);
      await model.whenSectionLoaded(AICustomizationManagementSection.Skills);
      await timeout(0);
      assert.deepStrictEqual(skillItems.get().map((i) => ({ name: i.name, disabled: i.disabled })), [
        { name: "create-pr", disabled: false }
      ]);
      disabledPromptFiles = new ResourceSet([skill]);
      onDidChangeSkills.fire();
      await timeout(0);
      await model.whenSectionLoaded(AICustomizationManagementSection.Skills);
      assert.deepStrictEqual(skillItems.get().map((i) => ({ name: i.name, disabled: i.disabled })), [
        { name: "create-pr", disabled: true }
      ]);
    });
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXGNoYXRcXHRlc3RcXGJyb3dzZXJcXGFpQ3VzdG9taXphdGlvblxcYWlDdXN0b21pemF0aW9uSXRlbXNNb2RlbC50ZXN0LnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IGFzc2VydCBmcm9tICdhc3NlcnQnO1xuaW1wb3J0IHsgdGltZW91dCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2FzeW5jLmpzJztcbmltcG9ydCB7IENhbmNlbGxhdGlvblRva2VuIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vY2FuY2VsbGF0aW9uLmpzJztcbmltcG9ydCB7IENvZGljb24gfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9jb2RpY29ucy5qcyc7XG5pbXBvcnQgeyBFbWl0dGVyLCBFdmVudCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2V2ZW50LmpzJztcbmltcG9ydCB7IERpc3Bvc2FibGVTdG9yZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBSZXNvdXJjZVNldCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL21hcC5qcyc7XG5pbXBvcnQgeyBkZXJpdmVkLCBJT2JzZXJ2YWJsZSwgSVNldHRhYmxlT2JzZXJ2YWJsZSwgb2JzZXJ2YWJsZVZhbHVlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vb2JzZXJ2YWJsZS5qcyc7XG5pbXBvcnQgeyBVUkkgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi91cmkuanMnO1xuaW1wb3J0IHsgZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS90ZXN0L2NvbW1vbi91dGlscy5qcyc7XG5pbXBvcnQgeyBQbHVnaW5Gb3JtYXQgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9hZ2VudFBsdWdpbnMvY29tbW9uL3BsdWdpblBhcnNlcnMuanMnO1xuaW1wb3J0IHsgVGVzdEluc3RhbnRpYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vaW5zdGFudGlhdGlvbi90ZXN0L2NvbW1vbi9pbnN0YW50aWF0aW9uU2VydmljZU1vY2suanMnO1xuaW1wb3J0IHsgd29ya2JlbmNoSW5zdGFudGlhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi90ZXN0L2Jyb3dzZXIvd29ya2JlbmNoVGVzdFNlcnZpY2VzLmpzJztcbmltcG9ydCB7IEFJQ3VzdG9taXphdGlvbkl0ZW1zTW9kZWwgfSBmcm9tICcuLi8uLi8uLi9icm93c2VyL2FpQ3VzdG9taXphdGlvbi9haUN1c3RvbWl6YXRpb25JdGVtc01vZGVsLmpzJztcbmltcG9ydCB7IEFJQ3VzdG9taXphdGlvbk1hbmFnZW1lbnRTZWN0aW9uLCBBSUN1c3RvbWl6YXRpb25Tb3VyY2VzLCBCVUlMVElOX1NUT1JBR0UsIElBSUN1c3RvbWl6YXRpb25Xb3Jrc3BhY2VTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2FpQ3VzdG9taXphdGlvbldvcmtzcGFjZVNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSUN1c3RvbWl6YXRpb25IYXJuZXNzU2VydmljZSwgSUN1c3RvbWl6YXRpb25JdGVtLCBJQ3VzdG9taXphdGlvbkl0ZW1Qcm92aWRlciwgSUN1c3RvbWl6YXRpb25TeW5jUHJvdmlkZXIsIElIYXJuZXNzRGVzY3JpcHRvciB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9jdXN0b21pemF0aW9uSGFybmVzc1NlcnZpY2UuanMnO1xuaW1wb3J0IHsgQ29udHJpYnV0aW9uRW5hYmxlbWVudFN0YXRlIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2VuYWJsZW1lbnQuanMnO1xuaW1wb3J0IHsgSUFnZW50UGx1Z2luU2VydmljZSwgdHlwZSBJQWdlbnRQbHVnaW4gfSBmcm9tICcuLi8uLi8uLi9jb21tb24vcGx1Z2lucy9hZ2VudFBsdWdpblNlcnZpY2UuanMnO1xuaW1wb3J0IHsgUHJvbXB0c1R5cGUsIFRhcmdldCB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9wcm9tcHRTeW50YXgvcHJvbXB0VHlwZXMuanMnO1xuaW1wb3J0IHsgSUFnZW50U291cmNlLCBJQ3VzdG9tQWdlbnQsIElQcm9tcHRQYXRoLCBJUHJvbXB0c1NlcnZpY2UsIFByb21wdHNTdG9yYWdlIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL3Byb21wdFN5bnRheC9zZXJ2aWNlL3Byb21wdHNTZXJ2aWNlLmpzJztcbmltcG9ydCB7IGdldENoYXRTZXNzaW9uVHlwZSB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9tb2RlbC9jaGF0VXJpLmpzJztcbmltcG9ydCB7IGJhc2VuYW1lIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vcmVzb3VyY2VzLmpzJztcblxuc3VpdGUoJ0FJQ3VzdG9taXphdGlvbkl0ZW1zTW9kZWwnLCAoKSA9PiB7XG5cdGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSgpO1xuXG5cdHN1aXRlKCdiYXNpY3MnLCAoKSA9PiB7XG5cblx0XHRsZXQgZGlzcG9zYWJsZXM6IERpc3Bvc2FibGVTdG9yZTtcblx0XHRsZXQgaW5zdGFTZXJ2aWNlOiBUZXN0SW5zdGFudGlhdGlvblNlcnZpY2U7XG5cdFx0bGV0IGFjdGl2ZVNlc3Npb25SZXNvdXJjZTogSVNldHRhYmxlT2JzZXJ2YWJsZTxVUkk+O1xuXHRcdGxldCBhY3RpdmVIYXJuZXNzOiBJT2JzZXJ2YWJsZTxzdHJpbmc+O1xuXHRcdGxldCBhdmFpbGFibGVIYXJuZXNzZXM6IElTZXR0YWJsZU9ic2VydmFibGU8cmVhZG9ubHkgSUhhcm5lc3NEZXNjcmlwdG9yW10+O1xuXHRcdGxldCBkZXNjcmlwdG9yQTogSUhhcm5lc3NEZXNjcmlwdG9yO1xuXHRcdGxldCBkZXNjcmlwdG9yQjogSUhhcm5lc3NEZXNjcmlwdG9yO1xuXHRcdGxldCBwcm92aWRlckFfZGlkQ2hhbmdlOiBFbWl0dGVyPHZvaWQ+O1xuXHRcdGxldCBwcm92aWRlckFfY2FsbENvdW50OiBudW1iZXI7XG5cdFx0bGV0IHByb3ZpZGVyQV9pdGVtczogSUN1c3RvbWl6YXRpb25JdGVtW107XG5cdFx0bGV0IHBsdWdpbnM6IElTZXR0YWJsZU9ic2VydmFibGU8cmVhZG9ubHkgSUFnZW50UGx1Z2luW10+O1xuXHRcdGxldCBsaXN0UHJvbXB0RmlsZXNSZXN1bHQ6IEF3YWl0ZWQ8UmV0dXJuVHlwZTxJUHJvbXB0c1NlcnZpY2VbJ2xpc3RQcm9tcHRGaWxlcyddPj47XG5cdFx0bGV0IGRpc2FibGVkUHJvbXB0RmlsZXNSZXN1bHQ6IFJlc291cmNlU2V0O1xuXG5cdFx0ZnVuY3Rpb24gY3JlYXRlRGVzY3JpcHRvcihpZDogc3RyaW5nLCBwcm92aWRlcjogSUN1c3RvbWl6YXRpb25JdGVtUHJvdmlkZXIgfCB1bmRlZmluZWQsIHN5bmNQcm92aWRlcj86IElDdXN0b21pemF0aW9uU3luY1Byb3ZpZGVyKTogSUhhcm5lc3NEZXNjcmlwdG9yIHtcblx0XHRcdHJldHVybiB7XG5cdFx0XHRcdGlkLFxuXHRcdFx0XHRsYWJlbDogaWQsXG5cdFx0XHRcdGljb246IENvZGljb24uc2V0dGluZ3NHZWFyLFxuXHRcdFx0XHRpdGVtUHJvdmlkZXI6IHByb3ZpZGVyLFxuXHRcdFx0XHRzeW5jUHJvdmlkZXIsXG5cdFx0XHR9O1xuXHRcdH1cblxuXHRcdHNldHVwKCgpID0+IHtcblx0XHRcdGRpc3Bvc2FibGVzID0gbmV3IERpc3Bvc2FibGVTdG9yZSgpO1xuXHRcdFx0cHJvdmlkZXJBX2RpZENoYW5nZSA9IGRpc3Bvc2FibGVzLmFkZChuZXcgRW1pdHRlcjx2b2lkPigpKTtcblx0XHRcdHByb3ZpZGVyQV9jYWxsQ291bnQgPSAwO1xuXHRcdFx0cHJvdmlkZXJBX2l0ZW1zID0gW107XG5cdFx0XHRsaXN0UHJvbXB0RmlsZXNSZXN1bHQgPSBbXTtcblx0XHRcdGRpc2FibGVkUHJvbXB0RmlsZXNSZXN1bHQgPSBuZXcgUmVzb3VyY2VTZXQoKTtcblxuXHRcdFx0Y29uc3QgcHJvdmlkZXJBOiBJQ3VzdG9taXphdGlvbkl0ZW1Qcm92aWRlciA9IHtcblx0XHRcdFx0b25EaWRDaGFuZ2U6IHByb3ZpZGVyQV9kaWRDaGFuZ2UuZXZlbnQsXG5cdFx0XHRcdHByb3ZpZGVDaGF0U2Vzc2lvbkN1c3RvbWl6YXRpb25zOiAoc2Vzc2lvblJlc291cmNlOiBVUkksIHRva2VuOiBDYW5jZWxsYXRpb25Ub2tlbikgPT4ge1xuXHRcdFx0XHRcdHByb3ZpZGVyQV9jYWxsQ291bnQrKztcblx0XHRcdFx0XHRyZXR1cm4gUHJvbWlzZS5yZXNvbHZlKHByb3ZpZGVyQV9pdGVtcy5zbGljZSgpKTtcblx0XHRcdFx0fSxcblx0XHRcdH07XG5cdFx0XHRjb25zdCBwcm92aWRlckI6IElDdXN0b21pemF0aW9uSXRlbVByb3ZpZGVyID0ge1xuXHRcdFx0XHRvbkRpZENoYW5nZTogRXZlbnQuTm9uZSxcblx0XHRcdFx0cHJvdmlkZUNoYXRTZXNzaW9uQ3VzdG9taXphdGlvbnM6IChzZXNzaW9uUmVzb3VyY2U6IFVSSSwgdG9rZW46IENhbmNlbGxhdGlvblRva2VuKSA9PiBQcm9taXNlLnJlc29sdmUoW10pLFxuXHRcdFx0fTtcblx0XHRcdGRlc2NyaXB0b3JBID0gY3JlYXRlRGVzY3JpcHRvcignQScsIHByb3ZpZGVyQSk7XG5cdFx0XHRkZXNjcmlwdG9yQiA9IGNyZWF0ZURlc2NyaXB0b3IoJ0InLCBwcm92aWRlckIpO1xuXG5cdFx0XHRhY3RpdmVTZXNzaW9uUmVzb3VyY2UgPSBvYnNlcnZhYmxlVmFsdWUoJ2FjdGl2ZVNlc3Npb25SZXNvdXJjZScsIFVSSS5wYXJzZShgQTovLy9zZXNzaW9uYCkpO1xuXHRcdFx0YWN0aXZlSGFybmVzcyA9IGRlcml2ZWQocmVhZGVyID0+IGdldENoYXRTZXNzaW9uVHlwZShhY3RpdmVTZXNzaW9uUmVzb3VyY2UucmVhZChyZWFkZXIpKSk7XG5cdFx0XHRhdmFpbGFibGVIYXJuZXNzZXMgPSBvYnNlcnZhYmxlVmFsdWU8cmVhZG9ubHkgSUhhcm5lc3NEZXNjcmlwdG9yW10+KCdhdmFpbGFibGVIYXJuZXNzZXMnLCBbZGVzY3JpcHRvckEsIGRlc2NyaXB0b3JCXSk7XG5cdFx0XHRwbHVnaW5zID0gb2JzZXJ2YWJsZVZhbHVlPHJlYWRvbmx5IElBZ2VudFBsdWdpbltdPigncGx1Z2lucycsIFtdKTtcblxuXHRcdFx0aW5zdGFTZXJ2aWNlID0gd29ya2JlbmNoSW5zdGFudGlhdGlvblNlcnZpY2Uoe30sIGRpc3Bvc2FibGVzKTtcblxuXHRcdFx0ZnVuY3Rpb24gY3VzdG9tQWdlbnRGcm9tUHJvbXB0UGF0aChwcm9tcHRGaWxlOiBJUHJvbXB0UGF0aCk6IElDdXN0b21BZ2VudCB7XG5cdFx0XHRcdHJldHVybiB7XG5cdFx0XHRcdFx0aWQ6IHByb21wdEZpbGUudXJpLnRvU3RyaW5nKCksXG5cdFx0XHRcdFx0dXJpOiBwcm9tcHRGaWxlLnVyaSxcblx0XHRcdFx0XHRuYW1lOiBwcm9tcHRGaWxlLm5hbWUgPz8gYmFzZW5hbWUocHJvbXB0RmlsZS51cmkpLFxuXHRcdFx0XHRcdGRlc2NyaXB0aW9uOiBwcm9tcHRGaWxlLmRlc2NyaXB0aW9uLFxuXHRcdFx0XHRcdHRhcmdldDogVGFyZ2V0LlZTQ29kZSxcblx0XHRcdFx0XHR2aXNpYmlsaXR5OiB7IGFnZW50SW52b2NhYmxlOiB0cnVlLCB1c2VySW52b2NhYmxlOiB0cnVlIH0sXG5cdFx0XHRcdFx0ZW5hYmxlZDogIWRpc2FibGVkUHJvbXB0RmlsZXNSZXN1bHQuaGFzKHByb21wdEZpbGUudXJpKSxcblx0XHRcdFx0XHRzb3VyY2U6IElBZ2VudFNvdXJjZS5mcm9tUHJvbXB0UGF0aChwcm9tcHRGaWxlKSxcblx0XHRcdFx0XHRhZ2VudEluc3RydWN0aW9uczogeyBjb250ZW50OiAnJywgdG9vbFJlZmVyZW5jZXM6IFtdIH0sXG5cdFx0XHRcdH07XG5cdFx0XHR9XG5cblx0XHRcdGluc3RhU2VydmljZS5zdHViKElQcm9tcHRzU2VydmljZSwge1xuXHRcdFx0XHRvbkRpZENoYW5nZUN1c3RvbUFnZW50czogRXZlbnQuTm9uZSxcblx0XHRcdFx0b25EaWRDaGFuZ2VTbGFzaENvbW1hbmRzOiBFdmVudC5Ob25lLFxuXHRcdFx0XHRvbkRpZENoYW5nZVNraWxsczogRXZlbnQuTm9uZSxcblx0XHRcdFx0b25EaWRDaGFuZ2VIb29rczogRXZlbnQuTm9uZSxcblx0XHRcdFx0b25EaWRDaGFuZ2VJbnN0cnVjdGlvbnM6IEV2ZW50Lk5vbmUsXG5cdFx0XHRcdG9uRGlkQ2hhbmdlQWdlbnRJbnN0cnVjdGlvbnM6IEV2ZW50Lk5vbmUsXG5cdFx0XHRcdGxpc3RQcm9tcHRGaWxlczogYXN5bmMgKHR5cGU6IFByb21wdHNUeXBlKSA9PiBsaXN0UHJvbXB0RmlsZXNSZXN1bHQuZmlsdGVyKGYgPT4gZi50eXBlID09PSB0eXBlKSxcblx0XHRcdFx0bGlzdFByb21wdEZpbGVzRm9yU3RvcmFnZTogYXN5bmMgKCkgPT4gW10sXG5cdFx0XHRcdGdldEN1c3RvbUFnZW50czogYXN5bmMgKCkgPT4gbGlzdFByb21wdEZpbGVzUmVzdWx0LmZpbHRlcihmID0+IGYudHlwZSA9PT0gUHJvbXB0c1R5cGUuYWdlbnQpLm1hcChjdXN0b21BZ2VudEZyb21Qcm9tcHRQYXRoKSxcblx0XHRcdFx0ZmluZEFnZW50U2tpbGxzOiBhc3luYyAoKSA9PiBbXSxcblx0XHRcdFx0Z2V0SG9va3M6IGFzeW5jICgpID0+IHVuZGVmaW5lZCxcblx0XHRcdFx0Z2V0SW5zdHJ1Y3Rpb25GaWxlczogYXN5bmMgKCkgPT4gW10sXG5cdFx0XHRcdGdldFByb21wdFNsYXNoQ29tbWFuZHM6IGFzeW5jICgpID0+IFtdLFxuXHRcdFx0XHRsaXN0QWdlbnRJbnN0cnVjdGlvbnM6IGFzeW5jICgpID0+IFtdLFxuXHRcdFx0XHRnZXREaXNhYmxlZFByb21wdEZpbGVzOiAoKSA9PiBkaXNhYmxlZFByb21wdEZpbGVzUmVzdWx0LFxuXHRcdFx0fSk7XG5cblx0XHRcdGluc3RhU2VydmljZS5zdHViKElBSUN1c3RvbWl6YXRpb25Xb3Jrc3BhY2VTZXJ2aWNlLCB7XG5cdFx0XHRcdGFjdGl2ZVByb2plY3RSb290OiBvYnNlcnZhYmxlVmFsdWUoJ3Rlc3QnLCB1bmRlZmluZWQpLFxuXHRcdFx0XHRnZXRBY3RpdmVQcm9qZWN0Um9vdDogKCkgPT4gdW5kZWZpbmVkLFxuXHRcdFx0XHRtYW5hZ2VtZW50U2VjdGlvbnM6IFtBSUN1c3RvbWl6YXRpb25NYW5hZ2VtZW50U2VjdGlvbi5BZ2VudHNdLFxuXHRcdFx0XHRpc1Nlc3Npb25zV2luZG93OiBmYWxzZSxcblx0XHRcdFx0d2VsY29tZVBhZ2VGZWF0dXJlczogeyBzaG93R2V0dGluZ1N0YXJ0ZWRCYW5uZXI6IGZhbHNlIH0sXG5cdFx0XHRcdGdldFNraWxsVUlJbnRlZ3JhdGlvbnM6ICgpID0+IG5ldyBNYXAoKSxcblx0XHRcdFx0aGFzT3ZlcnJpZGVQcm9qZWN0Um9vdDogb2JzZXJ2YWJsZVZhbHVlKCd0ZXN0JywgZmFsc2UpLFxuXHRcdFx0XHRjb21taXRGaWxlczogYXN5bmMgKCkgPT4geyB9LFxuXHRcdFx0XHRkZWxldGVGaWxlczogYXN5bmMgKCkgPT4geyB9LFxuXHRcdFx0XHRnZW5lcmF0ZUN1c3RvbWl6YXRpb246IGFzeW5jICgpID0+IHsgfSxcblx0XHRcdFx0c2V0T3ZlcnJpZGVQcm9qZWN0Um9vdDogKCkgPT4geyB9LFxuXHRcdFx0XHRjbGVhck92ZXJyaWRlUHJvamVjdFJvb3Q6ICgpID0+IHsgfSxcblx0XHRcdH0pO1xuXG5cdFx0XHRpbnN0YVNlcnZpY2Uuc3R1YihJQ3VzdG9taXphdGlvbkhhcm5lc3NTZXJ2aWNlLCB7XG5cdFx0XHRcdGFjdGl2ZVNlc3Npb25SZXNvdXJjZSxcblx0XHRcdFx0YWN0aXZlSGFybmVzcyxcblx0XHRcdFx0YXZhaWxhYmxlSGFybmVzc2VzLFxuXHRcdFx0XHRzZXRBY3RpdmVTZXNzaW9uOiAoc2Vzc2lvblJlc291cmNlOiBVUkkpID0+IHtcblx0XHRcdFx0XHRhY3RpdmVTZXNzaW9uUmVzb3VyY2Uuc2V0KHNlc3Npb25SZXNvdXJjZSwgdW5kZWZpbmVkKTtcblx0XHRcdFx0fSxcblx0XHRcdFx0Z2V0QWN0aXZlRGVzY3JpcHRvcjogKCkgPT4gYXZhaWxhYmxlSGFybmVzc2VzLmdldCgpLmZpbmQoZCA9PiBkLmlkID09PSBhY3RpdmVIYXJuZXNzLmdldCgpKSEsXG5cdFx0XHRcdGZpbmRIYXJuZXNzQnlJZDogKGlkOiBzdHJpbmcpID0+IGF2YWlsYWJsZUhhcm5lc3Nlcy5nZXQoKS5maW5kKGQgPT4gZC5pZCA9PT0gaWQpLFxuXHRcdFx0XHRyZWdpc3RlckV4dGVybmFsSGFybmVzczogKCkgPT4gKHsgZGlzcG9zZSgpIHsgfSB9KSxcblx0XHRcdH0pO1xuXG5cdFx0XHRpbnN0YVNlcnZpY2Uuc3R1YihJQWdlbnRQbHVnaW5TZXJ2aWNlLCB7XG5cdFx0XHRcdHBsdWdpbnMsXG5cdFx0XHRcdGVuYWJsZW1lbnRNb2RlbDoge1xuXHRcdFx0XHRcdHJlYWRFbmFibGVkOiAoKSA9PiBDb250cmlidXRpb25FbmFibGVtZW50U3RhdGUuRW5hYmxlZFByb2ZpbGUsXG5cdFx0XHRcdFx0cmVhZFByb2ZpbGVFbmFibGVkOiAoKSA9PiB0cnVlLFxuXHRcdFx0XHRcdHNldEVuYWJsZWQ6ICgpID0+IHsgfSxcblx0XHRcdFx0XHRyZW1vdmU6ICgpID0+IHsgfSxcblx0XHRcdFx0fSxcblx0XHRcdH0pO1xuXHRcdH0pO1xuXG5cdFx0ZnVuY3Rpb24gY3JlYXRlTG9jYWxQbHVnaW4obmFtZTogc3RyaW5nKTogSUFnZW50UGx1Z2luIHtcblx0XHRcdHJldHVybiB7XG5cdFx0XHRcdHVyaTogVVJJLnBhcnNlKGBwbHVnaW4tdGVzdDovLyR7bmFtZX1gKSxcblx0XHRcdFx0Zm9ybWF0OiBQbHVnaW5Gb3JtYXQuQ29waWxvdCxcblx0XHRcdFx0bGFiZWw6IG5hbWUsXG5cdFx0XHRcdGVuYWJsZW1lbnQ6IG9ic2VydmFibGVWYWx1ZSgncGx1Z2luRW5hYmxlbWVudCcsIENvbnRyaWJ1dGlvbkVuYWJsZW1lbnRTdGF0ZS5FbmFibGVkUHJvZmlsZSksXG5cdFx0XHRcdHJlbW92ZTogKCkgPT4geyB9LFxuXHRcdFx0XHRob29rczogb2JzZXJ2YWJsZVZhbHVlKCdwbHVnaW5Ib29rcycsIFtdKSxcblx0XHRcdFx0Y29tbWFuZHM6IG9ic2VydmFibGVWYWx1ZSgncGx1Z2luQ29tbWFuZHMnLCBbXSksXG5cdFx0XHRcdHNraWxsczogb2JzZXJ2YWJsZVZhbHVlKCdwbHVnaW5Ta2lsbHMnLCBbXSksXG5cdFx0XHRcdGFnZW50czogb2JzZXJ2YWJsZVZhbHVlKCdwbHVnaW5BZ2VudHMnLCBbXSksXG5cdFx0XHRcdGluc3RydWN0aW9uczogb2JzZXJ2YWJsZVZhbHVlKCdwbHVnaW5JbnN0cnVjdGlvbnMnLCBbXSksXG5cdFx0XHRcdG1jcFNlcnZlckRlZmluaXRpb25zOiBvYnNlcnZhYmxlVmFsdWUoJ3BsdWdpbk1jcFNlcnZlckRlZmluaXRpb25zJywgW10pLFxuXHRcdFx0fTtcblx0XHR9XG5cblx0XHR0ZWFyZG93bigoKSA9PiBkaXNwb3NhYmxlcy5kaXNwb3NlKCkpO1xuXG5cdFx0dGVzdCgnZXhwb3NlcyBwZXItc2VjdGlvbiBvYnNlcnZhYmxlcyBmb3IgYWxsIHByb21wdHMtYmFzZWQgc2VjdGlvbnMnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBtb2RlbCA9IGRpc3Bvc2FibGVzLmFkZChpbnN0YVNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoQUlDdXN0b21pemF0aW9uSXRlbXNNb2RlbCkpO1xuXHRcdFx0YXNzZXJ0Lm9rKG1vZGVsLmdldEl0ZW1zKEFJQ3VzdG9taXphdGlvbk1hbmFnZW1lbnRTZWN0aW9uLkFnZW50cykpO1xuXHRcdFx0YXNzZXJ0Lm9rKG1vZGVsLmdldEl0ZW1zKEFJQ3VzdG9taXphdGlvbk1hbmFnZW1lbnRTZWN0aW9uLlNraWxscykpO1xuXHRcdFx0YXNzZXJ0Lm9rKG1vZGVsLmdldEl0ZW1zKEFJQ3VzdG9taXphdGlvbk1hbmFnZW1lbnRTZWN0aW9uLkluc3RydWN0aW9ucykpO1xuXHRcdFx0YXNzZXJ0Lm9rKG1vZGVsLmdldEl0ZW1zKEFJQ3VzdG9taXphdGlvbk1hbmFnZW1lbnRTZWN0aW9uLlByb21wdHMpKTtcblx0XHRcdGFzc2VydC5vayhtb2RlbC5nZXRJdGVtcyhBSUN1c3RvbWl6YXRpb25NYW5hZ2VtZW50U2VjdGlvbi5Ib29rcykpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnZG9lcyBub3QgZmV0Y2ggb24gY29uc3RydWN0aW9uIChsYXp5KScsIGFzeW5jICgpID0+IHtcblx0XHRcdGRpc3Bvc2FibGVzLmFkZChpbnN0YVNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoQUlDdXN0b21pemF0aW9uSXRlbXNNb2RlbCkpO1xuXHRcdFx0YXdhaXQgdGltZW91dCgwKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChwcm92aWRlckFfY2FsbENvdW50LCAwKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2ZpcnN0IHJlYWQgb2YgYSBzZWN0aW9uIHRyaWdnZXJzIGEgZmV0Y2gnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCBtb2RlbCA9IGRpc3Bvc2FibGVzLmFkZChpbnN0YVNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoQUlDdXN0b21pemF0aW9uSXRlbXNNb2RlbCkpO1xuXHRcdFx0bW9kZWwuZ2V0SXRlbXMoQUlDdXN0b21pemF0aW9uTWFuYWdlbWVudFNlY3Rpb24uQWdlbnRzKTtcblx0XHRcdGF3YWl0IHRpbWVvdXQoMCk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocHJvdmlkZXJBX2NhbGxDb3VudCwgMSk7XG5cdFx0XHQvLyBSZWFkaW5nIGEgZGlmZmVyZW50IHNlY3Rpb24gZG9lcyBub3QgdHJpZ2dlciwgYXMgdGhlIGl0ZW1zIGFyZSBjYWNoZWRcblx0XHRcdG1vZGVsLmdldEl0ZW1zKEFJQ3VzdG9taXphdGlvbk1hbmFnZW1lbnRTZWN0aW9uLlNraWxscyk7XG5cdFx0XHRhd2FpdCB0aW1lb3V0KDApO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHByb3ZpZGVyQV9jYWxsQ291bnQsIDEpO1xuXG5cdFx0XHRwcm92aWRlckFfZGlkQ2hhbmdlLmZpcmUoKTtcblx0XHRcdGF3YWl0IHRpbWVvdXQoMCk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocHJvdmlkZXJBX2NhbGxDb3VudCwgMik7XG5cdFx0XHRtb2RlbC5nZXRJdGVtcyhBSUN1c3RvbWl6YXRpb25NYW5hZ2VtZW50U2VjdGlvbi5BZ2VudHMpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHByb3ZpZGVyQV9jYWxsQ291bnQsIDIpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnc291cmNlLm9uRGlkQ2hhbmdlIHJlZmV0Y2hlcyBvbmx5IHByZXZpb3VzbHktb2JzZXJ2ZWQgc2VjdGlvbnMnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCBtb2RlbCA9IGRpc3Bvc2FibGVzLmFkZChpbnN0YVNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoQUlDdXN0b21pemF0aW9uSXRlbXNNb2RlbCkpO1xuXHRcdFx0bW9kZWwuZ2V0SXRlbXMoQUlDdXN0b21pemF0aW9uTWFuYWdlbWVudFNlY3Rpb24uQWdlbnRzKTtcblx0XHRcdGF3YWl0IHRpbWVvdXQoMCk7XG5cdFx0XHRjb25zdCBiZWZvcmUgPSBwcm92aWRlckFfY2FsbENvdW50O1xuXHRcdFx0cHJvdmlkZXJBX2RpZENoYW5nZS5maXJlKCk7XG5cdFx0XHRhd2FpdCB0aW1lb3V0KDApO1xuXHRcdFx0Ly8gT25lIHJlZmV0Y2ggZm9yIHRoZSBvbmUgb2JzZXJ2ZWQgc2VjdGlvbiBcdTIwMTQgbm90IDUuXG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocHJvdmlkZXJBX2NhbGxDb3VudCwgYmVmb3JlICsgMSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdzd2l0Y2hpbmcgaGFybmVzcyByZS1iaW5kcyBhbmQgcmVmZXRjaGVzIG9ic2VydmVkIHNlY3Rpb25zJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgbW9kZWwgPSBkaXNwb3NhYmxlcy5hZGQoaW5zdGFTZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKEFJQ3VzdG9taXphdGlvbkl0ZW1zTW9kZWwpKTtcblx0XHRcdG1vZGVsLmdldEl0ZW1zKEFJQ3VzdG9taXphdGlvbk1hbmFnZW1lbnRTZWN0aW9uLkFnZW50cyk7XG5cdFx0XHRhd2FpdCB0aW1lb3V0KDApO1xuXHRcdFx0Y29uc3Qgc291cmNlQSA9IG1vZGVsLmdldEFjdGl2ZUl0ZW1Tb3VyY2UoKTtcblx0XHRcdGFjdGl2ZVNlc3Npb25SZXNvdXJjZS5zZXQoVVJJLnBhcnNlKCdCOi8vc2Vzc2lvbicpLCB1bmRlZmluZWQpO1xuXHRcdFx0YXdhaXQgdGltZW91dCgwKTtcblx0XHRcdGNvbnN0IHNvdXJjZUIgPSBtb2RlbC5nZXRBY3RpdmVJdGVtU291cmNlKCk7XG5cdFx0XHRhc3NlcnQubm90U3RyaWN0RXF1YWwoc291cmNlQSwgc291cmNlQik7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdwcmVzZXJ2ZXMgcHJvdmlkZXItc3VwcGxpZWQgcGx1Z2luIHN0b3JhZ2Ugd2hlbiBwbHVnaW5VcmkgaXMgb21pdHRlZCcsIGFzeW5jICgpID0+IHtcblx0XHRcdHByb3ZpZGVyQV9pdGVtcyA9IFt7XG5cdFx0XHRcdHVyaTogVVJJLnBhcnNlKCdhZ2VudC1ob3N0Oi8vdGVzdC1hdXRob3JpdHkvcGx1Z2lucy9teS1wbHVnaW4vc2tpbGxzL215LXNraWxsL1NLSUxMLm1kJyksXG5cdFx0XHRcdHR5cGU6IFByb21wdHNUeXBlLnNraWxsLFxuXHRcdFx0XHRuYW1lOiAnTXkgU2tpbGwnLFxuXHRcdFx0XHRzb3VyY2U6IFByb21wdHNTdG9yYWdlLnBsdWdpbixcblx0XHRcdFx0ZXh0ZW5zaW9uSWQ6IHVuZGVmaW5lZCxcblx0XHRcdFx0cGx1Z2luVXJpOiB1bmRlZmluZWQsXG5cdFx0XHRcdHVzZXJJbnZvY2FibGU6IHRydWUsXG5cdFx0XHR9XTtcblxuXHRcdFx0Y29uc3QgbW9kZWwgPSBkaXNwb3NhYmxlcy5hZGQoaW5zdGFTZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKEFJQ3VzdG9taXphdGlvbkl0ZW1zTW9kZWwpKTtcblx0XHRcdGNvbnN0IGl0ZW1zID0gbW9kZWwuZ2V0SXRlbXMoQUlDdXN0b21pemF0aW9uTWFuYWdlbWVudFNlY3Rpb24uU2tpbGxzKTtcblx0XHRcdGF3YWl0IG1vZGVsLndoZW5TZWN0aW9uTG9hZGVkKEFJQ3VzdG9taXphdGlvbk1hbmFnZW1lbnRTZWN0aW9uLlNraWxscyk7XG5cblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoaXRlbXMuZ2V0KCkubWFwKGl0ZW0gPT4gKHtcblx0XHRcdFx0bmFtZTogaXRlbS5uYW1lLFxuXHRcdFx0XHRzb3VyY2U6IGl0ZW0uc291cmNlLFxuXHRcdFx0fSkpLCBbe1xuXHRcdFx0XHRuYW1lOiAnTXkgU2tpbGwnLFxuXHRcdFx0XHRzb3VyY2U6IEFJQ3VzdG9taXphdGlvblNvdXJjZXMucGx1Z2luLFxuXHRcdFx0fV0pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgncHJlc2VydmVzIHByb3ZpZGVyLXN1cHBsaWVkIGJ1aWx0aW4gc3RvcmFnZSB3aGVuIGdyb3VwS2V5IGlzIG9taXR0ZWQnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRwcm92aWRlckFfaXRlbXMgPSBbe1xuXHRcdFx0XHR1cmk6IFVSSS5wYXJzZSgnYWdlbnQtaG9zdDovL3Rlc3QtYXV0aG9yaXR5L2J1aWx0aW4vc2tpbGxzL2dpdGh1Yi9TS0lMTC5tZCcpLFxuXHRcdFx0XHR0eXBlOiBQcm9tcHRzVHlwZS5za2lsbCxcblx0XHRcdFx0bmFtZTogJ0J1aWx0LWluIFNraWxsJyxcblx0XHRcdFx0c291cmNlOiBBSUN1c3RvbWl6YXRpb25Tb3VyY2VzLmJ1aWx0aW4sXG5cdFx0XHRcdGV4dGVuc2lvbklkOiB1bmRlZmluZWQsXG5cdFx0XHRcdHBsdWdpblVyaTogdW5kZWZpbmVkLFxuXHRcdFx0XHR1c2VySW52b2NhYmxlOiB0cnVlLFxuXHRcdFx0fV07XG5cblx0XHRcdGNvbnN0IG1vZGVsID0gZGlzcG9zYWJsZXMuYWRkKGluc3RhU2VydmljZS5jcmVhdGVJbnN0YW5jZShBSUN1c3RvbWl6YXRpb25JdGVtc01vZGVsKSk7XG5cdFx0XHRjb25zdCBpdGVtcyA9IG1vZGVsLmdldEl0ZW1zKEFJQ3VzdG9taXphdGlvbk1hbmFnZW1lbnRTZWN0aW9uLlNraWxscyk7XG5cdFx0XHRhd2FpdCBtb2RlbC53aGVuU2VjdGlvbkxvYWRlZChBSUN1c3RvbWl6YXRpb25NYW5hZ2VtZW50U2VjdGlvbi5Ta2lsbHMpO1xuXG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGl0ZW1zLmdldCgpLm1hcChpdGVtID0+ICh7XG5cdFx0XHRcdG5hbWU6IGl0ZW0ubmFtZSxcblx0XHRcdFx0c291cmNlOiBpdGVtLnNvdXJjZSxcblx0XHRcdFx0Z3JvdXBLZXk6IGl0ZW0uZ3JvdXBLZXksXG5cdFx0XHRcdGlzQnVpbHRpbjogaXRlbS5pc0J1aWx0aW4sXG5cdFx0XHR9KSksIFt7XG5cdFx0XHRcdG5hbWU6ICdCdWlsdC1pbiBTa2lsbCcsXG5cdFx0XHRcdHNvdXJjZTogQUlDdXN0b21pemF0aW9uU291cmNlcy5idWlsdGluLFxuXHRcdFx0XHRncm91cEtleTogQlVJTFRJTl9TVE9SQUdFLFxuXHRcdFx0XHRpc0J1aWx0aW46IHRydWUsXG5cdFx0XHR9XSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdwcmVzZXJ2ZXMgYnVpbHRpbiBncm91cGluZyB3aGVuIG9ubHkgZ3JvdXBLZXkgaXMgc2V0IChubyBzdG9yYWdlL2V4dGVuc2lvbklkL3BsdWdpblVyaSknLCBhc3luYyAoKSA9PiB7XG5cdFx0XHQvLyBSZXBybyBvZiBcIkFnZW50cyBhcHAgYnVpbHQtaW4gc2hvd24gYXMgVXNlclwiOiB0aGUgQWdlbnRzIGFwcFxuXHRcdFx0Ly8gY3VzdG9taXphdGlvbiBwcm92aWRlciBkZWNsYXJlcyBpdHMgYnVpbHQtaW4gYWdlbnRzIG9ubHkgdmlhXG5cdFx0XHQvLyBgZ3JvdXBLZXk6IEJVSUxUSU5fU1RPUkFHRWAgXHUyMDE0IHdpdGhvdXQgYHN0b3JhZ2VgLCBgZXh0ZW5zaW9uSWRgLFxuXHRcdFx0Ly8gYHBsdWdpblVyaWAsIG9yIGEgd29ya3NwYWNlLWFuY2hvcmVkIFVSSS4gVGhlIFVSSS1zbmlmZmluZ1xuXHRcdFx0Ly8gZmFsbGJhY2sgaW4gdGhlIG5vcm1hbGl6ZXIgbXVzdCBwcmVzZXJ2ZSBncm91cEtleS9pc0J1aWx0aW4gc29cblx0XHRcdC8vIHRoZSBsaXN0IHdpZGdldCByZW5kZXJzIHRoZW0gdW5kZXIgXCJCdWlsdC1pblwiIGluc3RlYWQgb2YgXCJVc2VyXCIuXG5cdFx0XHRwcm92aWRlckFfaXRlbXMgPSBbe1xuXHRcdFx0XHR1cmk6IFVSSS5wYXJzZSgnYWdlbnQtYXBwOi8vYnVpbHRpbi9jb2Rlci5hZ2VudC5tZCcpLFxuXHRcdFx0XHR0eXBlOiBQcm9tcHRzVHlwZS5hZ2VudCxcblx0XHRcdFx0bmFtZTogJ0NvZGVyJyxcblx0XHRcdFx0Z3JvdXBLZXk6IEJVSUxUSU5fU1RPUkFHRSxcblx0XHRcdFx0ZW5hYmxlZDogdHJ1ZSxcblx0XHRcdFx0ZXh0ZW5zaW9uSWQ6IHVuZGVmaW5lZCxcblx0XHRcdFx0cGx1Z2luVXJpOiB1bmRlZmluZWQsXG5cdFx0XHRcdHNvdXJjZTogQUlDdXN0b21pemF0aW9uU291cmNlcy5idWlsdGluLCAvLyBJZ25vcmVkLCBzaG91bGQgYmUgb3ZlcnJpZGRlbiBieSBncm91cEtleVxuXHRcdFx0fV07XG5cblx0XHRcdGNvbnN0IG1vZGVsID0gZGlzcG9zYWJsZXMuYWRkKGluc3RhU2VydmljZS5jcmVhdGVJbnN0YW5jZShBSUN1c3RvbWl6YXRpb25JdGVtc01vZGVsKSk7XG5cdFx0XHRjb25zdCBpdGVtcyA9IG1vZGVsLmdldEl0ZW1zKEFJQ3VzdG9taXphdGlvbk1hbmFnZW1lbnRTZWN0aW9uLkFnZW50cyk7XG5cdFx0XHRhd2FpdCBtb2RlbC53aGVuU2VjdGlvbkxvYWRlZChBSUN1c3RvbWl6YXRpb25NYW5hZ2VtZW50U2VjdGlvbi5BZ2VudHMpO1xuXG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGl0ZW1zLmdldCgpLm1hcChpdGVtID0+ICh7XG5cdFx0XHRcdG5hbWU6IGl0ZW0ubmFtZSxcblx0XHRcdFx0Z3JvdXBLZXk6IGl0ZW0uZ3JvdXBLZXksXG5cdFx0XHRcdGlzQnVpbHRpbjogaXRlbS5pc0J1aWx0aW4sXG5cdFx0XHR9KSksIFt7XG5cdFx0XHRcdG5hbWU6ICdDb2RlcicsXG5cdFx0XHRcdGdyb3VwS2V5OiBCVUlMVElOX1NUT1JBR0UsXG5cdFx0XHRcdGlzQnVpbHRpbjogdHJ1ZSxcblx0XHRcdH1dKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3Byb21wdCBzZXJ2aWNlIGl0ZW1zIHByZXNlcnZlIHN0b3JhZ2UgZ3JvdXBpbmcsIG1ldGFkYXRhLCBhbmQgZGlzYWJsZWQgc3RhdGUgd2l0aG91dCBzeW5jIHByb3ZpZGVyJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0YXZhaWxhYmxlSGFybmVzc2VzLnNldChbY3JlYXRlRGVzY3JpcHRvcignQScsIHVuZGVmaW5lZCksIGRlc2NyaXB0b3JCXSwgdW5kZWZpbmVkKTtcblx0XHRcdGFjdGl2ZVNlc3Npb25SZXNvdXJjZS5zZXQoVVJJLnBhcnNlKCdBOi8vL3Nlc3Npb24yJyksIHVuZGVmaW5lZCk7XG5cdFx0XHRsaXN0UHJvbXB0RmlsZXNSZXN1bHQgPSBbe1xuXHRcdFx0XHR1cmk6IFVSSS5wYXJzZSgnZmlsZTovLy93b3Jrc3BhY2UvYWdlbnRzL3RlYW0tYWdlbnQuYWdlbnQubWQnKSxcblx0XHRcdFx0c3RvcmFnZTogUHJvbXB0c1N0b3JhZ2UubG9jYWwsXG5cdFx0XHRcdHR5cGU6IFByb21wdHNUeXBlLmFnZW50LFxuXHRcdFx0XHRuYW1lOiAnVGVhbSBBZ2VudCcsXG5cdFx0XHRcdGRlc2NyaXB0aW9uOiAnV29ya3NwYWNlIGFnZW50IGRlc2NyaXB0aW9uJyxcblx0XHRcdH1dO1xuXHRcdFx0ZGlzYWJsZWRQcm9tcHRGaWxlc1Jlc3VsdCA9IG5ldyBSZXNvdXJjZVNldChbbGlzdFByb21wdEZpbGVzUmVzdWx0WzBdLnVyaV0pO1xuXG5cdFx0XHRjb25zdCBtb2RlbCA9IGRpc3Bvc2FibGVzLmFkZChpbnN0YVNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoQUlDdXN0b21pemF0aW9uSXRlbXNNb2RlbCkpO1xuXHRcdFx0Y29uc3QgaXRlbXMgPSBtb2RlbC5nZXRJdGVtcyhBSUN1c3RvbWl6YXRpb25NYW5hZ2VtZW50U2VjdGlvbi5BZ2VudHMpO1xuXHRcdFx0YXdhaXQgbW9kZWwud2hlblNlY3Rpb25Mb2FkZWQoQUlDdXN0b21pemF0aW9uTWFuYWdlbWVudFNlY3Rpb24uQWdlbnRzKTtcblxuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChpdGVtcy5nZXQoKS5tYXAoaXRlbSA9PiAoe1xuXHRcdFx0XHRpZDogaXRlbS5pZCxcblx0XHRcdFx0dXJpOiBpdGVtLnVyaS50b1N0cmluZygpLFxuXHRcdFx0XHRuYW1lOiBpdGVtLm5hbWUsXG5cdFx0XHRcdGRlc2NyaXB0aW9uOiBpdGVtLmRlc2NyaXB0aW9uLFxuXHRcdFx0XHRzb3VyY2U6IGl0ZW0uc291cmNlLFxuXHRcdFx0XHRkaXNhYmxlZDogaXRlbS5kaXNhYmxlZCxcblx0XHRcdFx0Z3JvdXBLZXk6IGl0ZW0uZ3JvdXBLZXksXG5cdFx0XHRcdHN5bmNhYmxlOiBpdGVtLnN5bmNhYmxlLFxuXHRcdFx0XHRzeW5jZWQ6IGl0ZW0uc3luY2VkLFxuXHRcdFx0fSkpLCBbe1xuXHRcdFx0XHRpZDogJ2ZpbGU6Ly8vd29ya3NwYWNlL2FnZW50cy90ZWFtLWFnZW50LmFnZW50Lm1kJyxcblx0XHRcdFx0dXJpOiAnZmlsZTovLy93b3Jrc3BhY2UvYWdlbnRzL3RlYW0tYWdlbnQuYWdlbnQubWQnLFxuXHRcdFx0XHRuYW1lOiAnVGVhbSBBZ2VudCcsXG5cdFx0XHRcdGRlc2NyaXB0aW9uOiAnV29ya3NwYWNlIGFnZW50IGRlc2NyaXB0aW9uJyxcblx0XHRcdFx0c291cmNlOiBBSUN1c3RvbWl6YXRpb25Tb3VyY2VzLmxvY2FsLFxuXHRcdFx0XHRkaXNhYmxlZDogdHJ1ZSxcblx0XHRcdFx0Z3JvdXBLZXk6IHVuZGVmaW5lZCxcblx0XHRcdFx0c3luY2FibGU6IHVuZGVmaW5lZCxcblx0XHRcdFx0c3luY2VkOiB1bmRlZmluZWQsXG5cdFx0XHR9XSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdwbHVnaW4gY291bnQgaW5jbHVkZXMgcHJvdmlkZXItc3VwcGxpZWQgcGx1Z2luIGl0ZW1zJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0cHJvdmlkZXJBX2l0ZW1zID0gW1xuXHRcdFx0XHR7XG5cdFx0XHRcdFx0dXJpOiBVUkkucGFyc2UoJ2FnZW50LWhvc3Q6Ly90ZXN0LWF1dGhvcml0eS9wbHVnaW5zL3JlbW90ZS1vbmUnKSxcblx0XHRcdFx0XHR0eXBlOiAncGx1Z2luJyxcblx0XHRcdFx0XHRuYW1lOiAnUmVtb3RlIE9uZScsXG5cdFx0XHRcdFx0c291cmNlOiBBSUN1c3RvbWl6YXRpb25Tb3VyY2VzLnBsdWdpbixcblx0XHRcdFx0XHRleHRlbnNpb25JZDogdW5kZWZpbmVkLFxuXHRcdFx0XHRcdHBsdWdpblVyaTogdW5kZWZpbmVkLFxuXHRcdFx0XHRcdHVzZXJJbnZvY2FibGU6IHVuZGVmaW5lZCxcblx0XHRcdFx0fSxcblx0XHRcdFx0e1xuXHRcdFx0XHRcdHVyaTogVVJJLnBhcnNlKCdhZ2VudC1ob3N0Oi8vdGVzdC1hdXRob3JpdHkvcGx1Z2lucy9yZW1vdGUtdHdvJyksXG5cdFx0XHRcdFx0dHlwZTogQUlDdXN0b21pemF0aW9uTWFuYWdlbWVudFNlY3Rpb24uUGx1Z2lucyxcblx0XHRcdFx0XHRuYW1lOiAnUmVtb3RlIFR3bycsXG5cdFx0XHRcdFx0c291cmNlOiBBSUN1c3RvbWl6YXRpb25Tb3VyY2VzLnBsdWdpbixcblx0XHRcdFx0XHRleHRlbnNpb25JZDogdW5kZWZpbmVkLFxuXHRcdFx0XHRcdHBsdWdpblVyaTogdW5kZWZpbmVkLFxuXHRcdFx0XHRcdHVzZXJJbnZvY2FibGU6IHVuZGVmaW5lZCxcblx0XHRcdFx0fSxcblx0XHRcdFx0e1xuXHRcdFx0XHRcdHVyaTogVVJJLnBhcnNlKCdhZ2VudC1ob3N0Oi8vdGVzdC1hdXRob3JpdHkvcGx1Z2lucy9yZW1vdGUtdHdvL3NraWxscy9teS1za2lsbC9TS0lMTC5tZCcpLFxuXHRcdFx0XHRcdHR5cGU6IFByb21wdHNUeXBlLnNraWxsLFxuXHRcdFx0XHRcdG5hbWU6ICdNeSBTa2lsbCcsXG5cdFx0XHRcdFx0c291cmNlOiBBSUN1c3RvbWl6YXRpb25Tb3VyY2VzLnBsdWdpbixcblx0XHRcdFx0XHRleHRlbnNpb25JZDogdW5kZWZpbmVkLFxuXHRcdFx0XHRcdHBsdWdpblVyaTogdW5kZWZpbmVkLFxuXHRcdFx0XHRcdHVzZXJJbnZvY2FibGU6IHRydWUsXG5cdFx0XHRcdH0sXG5cdFx0XHRcdHtcblx0XHRcdFx0XHR1cmk6IFVSSS5wYXJzZSgnYWdlbnQtaG9zdDovL3Rlc3QtYXV0aG9yaXR5L3BsdWdpbnMvbG9jYWwtc3luY2VkJyksXG5cdFx0XHRcdFx0dHlwZTogJ3BsdWdpbicsXG5cdFx0XHRcdFx0bmFtZTogJ0xvY2FsIFN5bmNlZCcsXG5cdFx0XHRcdFx0c291cmNlOiBBSUN1c3RvbWl6YXRpb25Tb3VyY2VzLnBsdWdpbixcblx0XHRcdFx0XHRncm91cEtleTogJ3JlbW90ZS1jbGllbnQnLFxuXHRcdFx0XHRcdGV4dGVuc2lvbklkOiB1bmRlZmluZWQsXG5cdFx0XHRcdFx0cGx1Z2luVXJpOiB1bmRlZmluZWQsXG5cdFx0XHRcdFx0dXNlckludm9jYWJsZTogdW5kZWZpbmVkLFxuXHRcdFx0XHR9LFxuXHRcdFx0XTtcblxuXHRcdFx0Y29uc3QgbW9kZWwgPSBkaXNwb3NhYmxlcy5hZGQoaW5zdGFTZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKEFJQ3VzdG9taXphdGlvbkl0ZW1zTW9kZWwpKTtcblx0XHRcdGNvbnN0IGNvdW50ID0gbW9kZWwuZ2V0UGx1Z2luQ291bnQoKTtcblx0XHRcdGF3YWl0IHRpbWVvdXQoMCk7XG5cblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChjb3VudC5nZXQoKSwgMik7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdsb2NhbCBwbHVnaW4gY2hhbmdlcyB1cGRhdGUgcGx1Z2luIGNvdW50IHdpdGhvdXQgcmVmZXRjaGluZyBwcm92aWRlciBjdXN0b21pemF0aW9ucycsIGFzeW5jICgpID0+IHtcblx0XHRcdHByb3ZpZGVyQV9pdGVtcyA9IFt7XG5cdFx0XHRcdHVyaTogVVJJLnBhcnNlKCdhZ2VudC1ob3N0Oi8vdGVzdC1hdXRob3JpdHkvcGx1Z2lucy9yZW1vdGUtb25lJyksXG5cdFx0XHRcdHR5cGU6ICdwbHVnaW4nLFxuXHRcdFx0XHRuYW1lOiAnUmVtb3RlIE9uZScsXG5cdFx0XHRcdHNvdXJjZTogQUlDdXN0b21pemF0aW9uU291cmNlcy5wbHVnaW4sXG5cdFx0XHRcdGV4dGVuc2lvbklkOiB1bmRlZmluZWQsXG5cdFx0XHRcdHBsdWdpblVyaTogdW5kZWZpbmVkLFxuXHRcdFx0XHR1c2VySW52b2NhYmxlOiB1bmRlZmluZWQsXG5cdFx0XHR9XTtcblxuXHRcdFx0Y29uc3QgbW9kZWwgPSBkaXNwb3NhYmxlcy5hZGQoaW5zdGFTZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKEFJQ3VzdG9taXphdGlvbkl0ZW1zTW9kZWwpKTtcblx0XHRcdGNvbnN0IGNvdW50ID0gbW9kZWwuZ2V0UGx1Z2luQ291bnQoKTtcblx0XHRcdGF3YWl0IHRpbWVvdXQoMCk7XG5cdFx0XHRjb25zdCBjYWxsc0FmdGVySW5pdGlhbENvdW50ID0gcHJvdmlkZXJBX2NhbGxDb3VudDtcblxuXHRcdFx0cGx1Z2lucy5zZXQoW2NyZWF0ZUxvY2FsUGx1Z2luKCdsb2NhbC1vbmUnKV0sIHVuZGVmaW5lZCk7XG5cdFx0XHRhd2FpdCB0aW1lb3V0KDApO1xuXG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdFx0Y291bnQ6IGNvdW50LmdldCgpLFxuXHRcdFx0XHRwcm92aWRlckFfY2FsbENvdW50LFxuXHRcdFx0fSwge1xuXHRcdFx0XHRjb3VudDogMixcblx0XHRcdFx0cHJvdmlkZXJBX2NhbGxDb3VudDogY2FsbHNBZnRlckluaXRpYWxDb3VudCxcblx0XHRcdH0pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgncGx1Z2luIGNvdW50IGRlZHVwZXMgcHJvdmlkZXIgcGx1Z2lucyB0aGF0IGFyZSBhbHNvIGluc3RhbGxlZCBsb2NhbGx5JywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0cHJvdmlkZXJBX2l0ZW1zID0gW3tcblx0XHRcdFx0dXJpOiBVUkkucGFyc2UoJ2FnZW50LWhvc3Q6Ly90ZXN0LWF1dGhvcml0eS9wbHVnaW5zL21vZGVsLWNvdW5jaWwnKSxcblx0XHRcdFx0dHlwZTogJ3BsdWdpbicsXG5cdFx0XHRcdG5hbWU6ICdtb2RlbC1jb3VuY2lsJyxcblx0XHRcdFx0c291cmNlOiBBSUN1c3RvbWl6YXRpb25Tb3VyY2VzLnBsdWdpbixcblx0XHRcdFx0ZXh0ZW5zaW9uSWQ6IHVuZGVmaW5lZCxcblx0XHRcdFx0cGx1Z2luVXJpOiB1bmRlZmluZWQsXG5cdFx0XHRcdHVzZXJJbnZvY2FibGU6IHVuZGVmaW5lZCxcblx0XHRcdH1dO1xuXG5cdFx0XHRjb25zdCBtb2RlbCA9IGRpc3Bvc2FibGVzLmFkZChpbnN0YVNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoQUlDdXN0b21pemF0aW9uSXRlbXNNb2RlbCkpO1xuXHRcdFx0Y29uc3QgY291bnQgPSBtb2RlbC5nZXRQbHVnaW5Db3VudCgpO1xuXHRcdFx0YXdhaXQgdGltZW91dCgwKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChjb3VudC5nZXQoKSwgMSwgJ2JlZm9yZSBsb2NhbCBpbnN0YWxsOiBvbmx5IHRoZSBoYXJuZXNzLXJlcG9ydGVkIHBsdWdpbiBjb3VudHMnKTtcblxuXHRcdFx0cGx1Z2lucy5zZXQoW2NyZWF0ZUxvY2FsUGx1Z2luKCdtb2RlbC1jb3VuY2lsJyldLCB1bmRlZmluZWQpO1xuXHRcdFx0YXdhaXQgdGltZW91dCgwKTtcblxuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNvdW50LmdldCgpLCAxLCAnYWZ0ZXIgbG9jYWwgaW5zdGFsbDogaGFybmVzcyBkdXBsaWNhdGUgaXMgZm9sZGVkIGludG8gdGhlIGxvY2FsIGNvdW50Jyk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdkb2VzIG5vdCBkb3VibGUtY291bnQgbG9jYWwgc3luY2FibGUgaXRlbXMgd2hlbiBpdGVtUHJvdmlkZXIgYW5kIHN5bmNQcm92aWRlciBhcmUgYm90aCBwcmVzZW50JywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Ly8gUmVncmVzc2lvbjogUHJvdmlkZXJDdXN0b21pemF0aW9uSXRlbVNvdXJjZS5mZXRjaEl0ZW1zIHVzZWQgdG8gdW5jb25kaXRpb25hbGx5XG5cdFx0XHQvLyBhcHBlbmQgZmV0Y2hMb2NhbFN5bmNhYmxlSXRlbXMgZXZlbiB3aGVuIGFuIGl0ZW1Qcm92aWRlciB3YXMgcHJlc2VudCwgY2F1c2luZ1xuXHRcdFx0Ly8gaXRlbXMgcmVwb3J0ZWQgYnkgdGhlIHByb3ZpZGVyIHRvIGFsc28gc2hvdyB1cCB2aWEgbG9jYWwgZW51bWVyYXRpb24uXG5cdFx0XHRjb25zdCBzeW5jUHJvdmlkZXJfZGlkQ2hhbmdlID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBFbWl0dGVyPHZvaWQ+KCkpO1xuXHRcdFx0Y29uc3Qgc3luY1Byb3ZpZGVyOiBJQ3VzdG9taXphdGlvblN5bmNQcm92aWRlciA9IHtcblx0XHRcdFx0b25EaWRDaGFuZ2U6IHN5bmNQcm92aWRlcl9kaWRDaGFuZ2UuZXZlbnQsXG5cdFx0XHRcdGlzRGlzYWJsZWQ6ICgpID0+IGZhbHNlLFxuXHRcdFx0XHRzZXREaXNhYmxlZDogKCkgPT4geyB9LFxuXHRcdFx0fTtcblx0XHRcdGNvbnN0IHByb3ZpZGVyV2l0aFN5bmM6IElDdXN0b21pemF0aW9uSXRlbVByb3ZpZGVyID0ge1xuXHRcdFx0XHRvbkRpZENoYW5nZTogcHJvdmlkZXJBX2RpZENoYW5nZS5ldmVudCxcblx0XHRcdFx0cHJvdmlkZUNoYXRTZXNzaW9uQ3VzdG9taXphdGlvbnM6IChzZXNzaW9uUmVzb3VyY2U6IFVSSSwgdG9rZW46IENhbmNlbGxhdGlvblRva2VuKSA9PiB7XG5cdFx0XHRcdFx0cHJvdmlkZXJBX2NhbGxDb3VudCsrO1xuXHRcdFx0XHRcdHJldHVybiBQcm9taXNlLnJlc29sdmUocHJvdmlkZXJBX2l0ZW1zLnNsaWNlKCkpO1xuXHRcdFx0XHR9LFxuXHRcdFx0fTtcblx0XHRcdGF2YWlsYWJsZUhhcm5lc3Nlcy5zZXQoW2NyZWF0ZURlc2NyaXB0b3IoJ0EnLCBwcm92aWRlcldpdGhTeW5jLCBzeW5jUHJvdmlkZXIpLCBkZXNjcmlwdG9yQl0sIHVuZGVmaW5lZCk7XG5cblx0XHRcdHByb3ZpZGVyQV9pdGVtcyA9IFt7XG5cdFx0XHRcdHVyaTogVVJJLnBhcnNlKCdhZ2VudC1ob3N0Oi8vdGVzdC1hdXRob3JpdHkvYWdlbnRzL2NvZGVyLmFnZW50Lm1kJyksXG5cdFx0XHRcdHR5cGU6IFByb21wdHNUeXBlLmFnZW50LFxuXHRcdFx0XHRuYW1lOiAnQ29kZXInLFxuXHRcdFx0XHRzb3VyY2U6IEFJQ3VzdG9taXphdGlvblNvdXJjZXMudXNlcixcblx0XHRcdFx0ZXh0ZW5zaW9uSWQ6IHVuZGVmaW5lZCxcblx0XHRcdFx0cGx1Z2luVXJpOiB1bmRlZmluZWQsXG5cdFx0XHR9XTtcblx0XHRcdGxpc3RQcm9tcHRGaWxlc1Jlc3VsdCA9IFt7XG5cdFx0XHRcdHVyaTogVVJJLnBhcnNlKCdmaWxlOi8vL3VzZXIvYWdlbnRzL2NvZGVyLmFnZW50Lm1kJyksXG5cdFx0XHRcdHN0b3JhZ2U6IFByb21wdHNTdG9yYWdlLnVzZXIsXG5cdFx0XHRcdHR5cGU6IFByb21wdHNUeXBlLmFnZW50LFxuXHRcdFx0fV07XG5cblx0XHRcdGNvbnN0IG1vZGVsID0gZGlzcG9zYWJsZXMuYWRkKGluc3RhU2VydmljZS5jcmVhdGVJbnN0YW5jZShBSUN1c3RvbWl6YXRpb25JdGVtc01vZGVsKSk7XG5cdFx0XHRjb25zdCBpdGVtcyA9IG1vZGVsLmdldEl0ZW1zKEFJQ3VzdG9taXphdGlvbk1hbmFnZW1lbnRTZWN0aW9uLkFnZW50cyk7XG5cdFx0XHRhd2FpdCBtb2RlbC53aGVuU2VjdGlvbkxvYWRlZChBSUN1c3RvbWl6YXRpb25NYW5hZ2VtZW50U2VjdGlvbi5BZ2VudHMpO1xuXG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGl0ZW1zLmdldCgpLm1hcChpID0+IGkubmFtZSksIFsnQ29kZXInXSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdzeW5jUHJvdmlkZXIub25EaWRDaGFuZ2UgZG9lcyBub3QgcmVmZXRjaCB3aGVuIGl0ZW1Qcm92aWRlciBpcyBwcmVzZW50JywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Ly8gVGhlIGRhdGEgcGF0aCBlYXJseS1yZXR1cm5zIHRvIHByb3ZpZGVyIGl0ZW1zIG9ubHkgd2hlbiBpdGVtUHJvdmlkZXIgZXhpc3RzLFxuXHRcdFx0Ly8gc28gc3Vic2NyaWJpbmcgdG8gc3luY1Byb3ZpZGVyL3Byb21wdHNTZXJ2aWNlIGV2ZW50cyB3b3VsZCBjYXVzZSBkdXBsaWNhdGVcblx0XHRcdC8vIHJlZnJlc2hlcyBmb3IgcHJvdmlkZXJzIHRoYXQgYWxyZWFkeSBmb3J3YXJkIHRob3NlIHVuZGVybHlpbmcgZXZlbnRzLlxuXHRcdFx0Y29uc3Qgc3luY1Byb3ZpZGVyX2RpZENoYW5nZSA9IGRpc3Bvc2FibGVzLmFkZChuZXcgRW1pdHRlcjx2b2lkPigpKTtcblx0XHRcdGNvbnN0IHN5bmNQcm92aWRlcjogSUN1c3RvbWl6YXRpb25TeW5jUHJvdmlkZXIgPSB7XG5cdFx0XHRcdG9uRGlkQ2hhbmdlOiBzeW5jUHJvdmlkZXJfZGlkQ2hhbmdlLmV2ZW50LFxuXHRcdFx0XHRpc0Rpc2FibGVkOiAoKSA9PiBmYWxzZSxcblx0XHRcdFx0c2V0RGlzYWJsZWQ6ICgpID0+IHsgfSxcblx0XHRcdH07XG5cdFx0XHRjb25zdCBwcm92aWRlcldpdGhTeW5jOiBJQ3VzdG9taXphdGlvbkl0ZW1Qcm92aWRlciA9IHtcblx0XHRcdFx0b25EaWRDaGFuZ2U6IHByb3ZpZGVyQV9kaWRDaGFuZ2UuZXZlbnQsXG5cdFx0XHRcdHByb3ZpZGVDaGF0U2Vzc2lvbkN1c3RvbWl6YXRpb25zOiAoc2Vzc2lvblJlc291cmNlOiBVUkksIHRva2VuOiBDYW5jZWxsYXRpb25Ub2tlbikgPT4ge1xuXHRcdFx0XHRcdHByb3ZpZGVyQV9jYWxsQ291bnQrKztcblx0XHRcdFx0XHRyZXR1cm4gUHJvbWlzZS5yZXNvbHZlKHByb3ZpZGVyQV9pdGVtcy5zbGljZSgpKTtcblx0XHRcdFx0fSxcblx0XHRcdH07XG5cdFx0XHRhdmFpbGFibGVIYXJuZXNzZXMuc2V0KFtjcmVhdGVEZXNjcmlwdG9yKCdBJywgcHJvdmlkZXJXaXRoU3luYywgc3luY1Byb3ZpZGVyKSwgZGVzY3JpcHRvckJdLCB1bmRlZmluZWQpO1xuXG5cdFx0XHRjb25zdCBtb2RlbCA9IGRpc3Bvc2FibGVzLmFkZChpbnN0YVNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoQUlDdXN0b21pemF0aW9uSXRlbXNNb2RlbCkpO1xuXHRcdFx0bW9kZWwuZ2V0SXRlbXMoQUlDdXN0b21pemF0aW9uTWFuYWdlbWVudFNlY3Rpb24uQWdlbnRzKTtcblx0XHRcdGF3YWl0IHRpbWVvdXQoMCk7XG5cdFx0XHRjb25zdCBiZWZvcmUgPSBwcm92aWRlckFfY2FsbENvdW50O1xuXG5cdFx0XHRzeW5jUHJvdmlkZXJfZGlkQ2hhbmdlLmZpcmUoKTtcblx0XHRcdGF3YWl0IHRpbWVvdXQoMCk7XG5cblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChwcm92aWRlckFfY2FsbENvdW50LCBiZWZvcmUsICdzeW5jUHJvdmlkZXIgZXZlbnRzIG11c3Qgbm90IHRyaWdnZXIgcmVmZXRjaGVzIHdoZW4gaXRlbVByb3ZpZGVyIG93bnMgdGhlIGRhdGEgcGF0aCcpO1xuXHRcdH0pO1xuXHR9KTtcblxuXHRzdWl0ZSgnZGF0YSBzb3VyY2VzJywgKCkgPT4ge1xuXG5cdFx0bGV0IGRpc3Bvc2FibGVzOiBEaXNwb3NhYmxlU3RvcmU7XG5cdFx0bGV0IGluc3RhU2VydmljZTogVGVzdEluc3RhbnRpYXRpb25TZXJ2aWNlO1xuXG5cdFx0bGV0IHByb3ZpZGVyRGlkQ2hhbmdlOiBFbWl0dGVyPHZvaWQ+O1xuXHRcdGxldCBwcm92aWRlckl0ZW1zOiBJQ3VzdG9taXphdGlvbkl0ZW1bXTtcblx0XHRsZXQgcGx1Z2luczogSVNldHRhYmxlT2JzZXJ2YWJsZTxyZWFkb25seSBJQWdlbnRQbHVnaW5bXT47XG5cblx0XHRzZXR1cCgoKSA9PiB7XG5cdFx0XHRkaXNwb3NhYmxlcyA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblx0XHRcdHByb3ZpZGVyRGlkQ2hhbmdlID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBFbWl0dGVyPHZvaWQ+KCkpO1xuXHRcdFx0cHJvdmlkZXJJdGVtcyA9IFtdO1xuXHRcdFx0cGx1Z2lucyA9IG9ic2VydmFibGVWYWx1ZTxyZWFkb25seSBJQWdlbnRQbHVnaW5bXT4oJ3BsdWdpbnMnLCBbXSk7XG5cblx0XHRcdGNvbnN0IHByb3ZpZGVyOiBJQ3VzdG9taXphdGlvbkl0ZW1Qcm92aWRlciA9IHtcblx0XHRcdFx0b25EaWRDaGFuZ2U6IHByb3ZpZGVyRGlkQ2hhbmdlLmV2ZW50LFxuXHRcdFx0XHRwcm92aWRlQ2hhdFNlc3Npb25DdXN0b21pemF0aW9uczogKHNlc3Npb25SZXNvdXJjZTogVVJJLCB0b2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4pID0+IFByb21pc2UucmVzb2x2ZShwcm92aWRlckl0ZW1zLnNsaWNlKCkpLFxuXHRcdFx0fTtcblx0XHRcdGNvbnN0IGRlc2NyaXB0b3I6IElIYXJuZXNzRGVzY3JpcHRvciA9IHtcblx0XHRcdFx0aWQ6ICdBJyxcblx0XHRcdFx0bGFiZWw6ICdBJyxcblx0XHRcdFx0aWNvbjogQ29kaWNvbi5zZXR0aW5nc0dlYXIsXG5cdFx0XHRcdGl0ZW1Qcm92aWRlcjogcHJvdmlkZXIsXG5cdFx0XHR9O1xuXHRcdFx0Y29uc3Qgc2Vzc2lvblJlc291cmNlID0gVVJJLnBhcnNlKCdBOi8vL2FjdGl2ZS1zZXNzaW9uJyk7XG5cdFx0XHRjb25zdCBhdmFpbGFibGVIYXJuZXNzZXMgPSBvYnNlcnZhYmxlVmFsdWU8cmVhZG9ubHkgSUhhcm5lc3NEZXNjcmlwdG9yW10+KCdhdmFpbGFibGVIYXJuZXNzZXMnLCBbZGVzY3JpcHRvcl0pO1xuXG5cdFx0XHRpbnN0YVNlcnZpY2UgPSB3b3JrYmVuY2hJbnN0YW50aWF0aW9uU2VydmljZSh7fSwgZGlzcG9zYWJsZXMpO1xuXHRcdFx0aW5zdGFTZXJ2aWNlLnN0dWIoSVByb21wdHNTZXJ2aWNlLCB7XG5cdFx0XHRcdG9uRGlkQ2hhbmdlQ3VzdG9tQWdlbnRzOiBFdmVudC5Ob25lLFxuXHRcdFx0XHRvbkRpZENoYW5nZVNsYXNoQ29tbWFuZHM6IEV2ZW50Lk5vbmUsXG5cdFx0XHRcdG9uRGlkQ2hhbmdlU2tpbGxzOiBFdmVudC5Ob25lLFxuXHRcdFx0XHRvbkRpZENoYW5nZUhvb2tzOiBFdmVudC5Ob25lLFxuXHRcdFx0XHRvbkRpZENoYW5nZUluc3RydWN0aW9uczogRXZlbnQuTm9uZSxcblx0XHRcdFx0b25EaWRDaGFuZ2VBZ2VudEluc3RydWN0aW9uczogRXZlbnQuTm9uZSxcblx0XHRcdFx0bGlzdFByb21wdEZpbGVzOiBhc3luYyAoKSA9PiBbXSxcblx0XHRcdFx0bGlzdFByb21wdEZpbGVzRm9yU3RvcmFnZTogYXN5bmMgKCkgPT4gW10sXG5cdFx0XHRcdGdldEN1c3RvbUFnZW50czogYXN5bmMgKCkgPT4gW10sXG5cdFx0XHRcdGZpbmRBZ2VudFNraWxsczogYXN5bmMgKCkgPT4gW10sXG5cdFx0XHRcdGdldEhvb2tzOiBhc3luYyAoKSA9PiB1bmRlZmluZWQsXG5cdFx0XHRcdGdldEluc3RydWN0aW9uRmlsZXM6IGFzeW5jICgpID0+IFtdLFxuXHRcdFx0XHRnZXREaXNhYmxlZFByb21wdEZpbGVzOiAoKSA9PiBuZXcgUmVzb3VyY2VTZXQoKSxcblx0XHRcdH0pO1xuXHRcdFx0aW5zdGFTZXJ2aWNlLnN0dWIoSUFJQ3VzdG9taXphdGlvbldvcmtzcGFjZVNlcnZpY2UsIHtcblx0XHRcdFx0YWN0aXZlUHJvamVjdFJvb3Q6IG9ic2VydmFibGVWYWx1ZSgndGVzdCcsIHVuZGVmaW5lZCksXG5cdFx0XHRcdGdldEFjdGl2ZVByb2plY3RSb290OiAoKSA9PiB1bmRlZmluZWQsXG5cdFx0XHRcdG1hbmFnZW1lbnRTZWN0aW9uczogW0FJQ3VzdG9taXphdGlvbk1hbmFnZW1lbnRTZWN0aW9uLkFnZW50c10sXG5cdFx0XHRcdGlzU2Vzc2lvbnNXaW5kb3c6IGZhbHNlLFxuXHRcdFx0XHR3ZWxjb21lUGFnZUZlYXR1cmVzOiB7IHNob3dHZXR0aW5nU3RhcnRlZEJhbm5lcjogZmFsc2UgfSxcblx0XHRcdFx0Z2V0U2tpbGxVSUludGVncmF0aW9uczogKCkgPT4gbmV3IE1hcCgpLFxuXHRcdFx0XHRoYXNPdmVycmlkZVByb2plY3RSb290OiBvYnNlcnZhYmxlVmFsdWUoJ3Rlc3QnLCBmYWxzZSksXG5cdFx0XHRcdGNvbW1pdEZpbGVzOiBhc3luYyAoKSA9PiB7IH0sXG5cdFx0XHRcdGRlbGV0ZUZpbGVzOiBhc3luYyAoKSA9PiB7IH0sXG5cdFx0XHRcdGdlbmVyYXRlQ3VzdG9taXphdGlvbjogYXN5bmMgKCkgPT4geyB9LFxuXHRcdFx0XHRzZXRPdmVycmlkZVByb2plY3RSb290OiAoKSA9PiB7IH0sXG5cdFx0XHRcdGNsZWFyT3ZlcnJpZGVQcm9qZWN0Um9vdDogKCkgPT4geyB9LFxuXHRcdFx0fSk7XG5cdFx0XHRjb25zdCBhY3RpdmVTZXNzaW9uUmVzb3VyY2UgPSBvYnNlcnZhYmxlVmFsdWUoJ2FjdGl2ZVNlc3Npb25SZXNvdXJjZScsIHNlc3Npb25SZXNvdXJjZSk7XG5cdFx0XHRjb25zdCBhY3RpdmVIYXJuZXNzID0gZGVyaXZlZChyZWFkZXIgPT4gZ2V0Q2hhdFNlc3Npb25UeXBlKGFjdGl2ZVNlc3Npb25SZXNvdXJjZS5yZWFkKHJlYWRlcikpKTtcblx0XHRcdGluc3RhU2VydmljZS5zdHViKElDdXN0b21pemF0aW9uSGFybmVzc1NlcnZpY2UsIHtcblx0XHRcdFx0YWN0aXZlU2Vzc2lvblJlc291cmNlLFxuXHRcdFx0XHRhY3RpdmVIYXJuZXNzLFxuXHRcdFx0XHRhdmFpbGFibGVIYXJuZXNzZXMsXG5cdFx0XHRcdHNldEFjdGl2ZVNlc3Npb246IChzZXNzaW9uUmVzb3VyY2U6IFVSSSkgPT4ge1xuXHRcdFx0XHRcdGFjdGl2ZVNlc3Npb25SZXNvdXJjZS5zZXQoc2Vzc2lvblJlc291cmNlLCB1bmRlZmluZWQpO1xuXHRcdFx0XHR9LFxuXHRcdFx0XHRnZXRBY3RpdmVEZXNjcmlwdG9yOiAoKSA9PiBhdmFpbGFibGVIYXJuZXNzZXMuZ2V0KCkuZmluZChkID0+IGQuaWQgPT09IGFjdGl2ZUhhcm5lc3MuZ2V0KCkpISxcblx0XHRcdFx0ZmluZEhhcm5lc3NCeUlkOiAoaWQ6IHN0cmluZykgPT4gYXZhaWxhYmxlSGFybmVzc2VzLmdldCgpLmZpbmQoZCA9PiBkLmlkID09PSBpZCksXG5cdFx0XHRcdHJlZ2lzdGVyRXh0ZXJuYWxIYXJuZXNzOiAoKSA9PiAoeyBkaXNwb3NlKCkgeyB9IH0pLFxuXHRcdFx0fSk7XG5cdFx0XHRpbnN0YVNlcnZpY2Uuc3R1YihJQWdlbnRQbHVnaW5TZXJ2aWNlLCB7XG5cdFx0XHRcdHBsdWdpbnMsXG5cdFx0XHRcdGVuYWJsZW1lbnRNb2RlbDoge1xuXHRcdFx0XHRcdHJlYWRFbmFibGVkOiAoKSA9PiBDb250cmlidXRpb25FbmFibGVtZW50U3RhdGUuRW5hYmxlZFByb2ZpbGUsXG5cdFx0XHRcdFx0cmVhZFByb2ZpbGVFbmFibGVkOiAoKSA9PiB0cnVlLFxuXHRcdFx0XHRcdHNldEVuYWJsZWQ6ICgpID0+IHsgfSxcblx0XHRcdFx0XHRyZW1vdmU6ICgpID0+IHsgfSxcblx0XHRcdFx0fSxcblx0XHRcdH0pO1xuXHRcdH0pO1xuXG5cdFx0dGVhcmRvd24oKCkgPT4gZGlzcG9zYWJsZXMuZGlzcG9zZSgpKTtcblxuXHRcdGZ1bmN0aW9uIGxvY2FsUGx1Z2luKG5hbWU6IHN0cmluZyk6IElBZ2VudFBsdWdpbiB7XG5cdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHR1cmk6IFVSSS5wYXJzZShgcGx1Z2luLXRlc3Q6Ly8ke25hbWV9YCksXG5cdFx0XHRcdGZvcm1hdDogUGx1Z2luRm9ybWF0LkNvcGlsb3QsXG5cdFx0XHRcdGxhYmVsOiBuYW1lLFxuXHRcdFx0XHRlbmFibGVtZW50OiBvYnNlcnZhYmxlVmFsdWUoJ3BsdWdpbkVuYWJsZW1lbnQnLCBDb250cmlidXRpb25FbmFibGVtZW50U3RhdGUuRW5hYmxlZFByb2ZpbGUpLFxuXHRcdFx0XHRyZW1vdmU6ICgpID0+IHsgfSxcblx0XHRcdFx0aG9va3M6IG9ic2VydmFibGVWYWx1ZSgncGx1Z2luSG9va3MnLCBbXSksXG5cdFx0XHRcdGNvbW1hbmRzOiBvYnNlcnZhYmxlVmFsdWUoJ3BsdWdpbkNvbW1hbmRzJywgW10pLFxuXHRcdFx0XHRza2lsbHM6IG9ic2VydmFibGVWYWx1ZSgncGx1Z2luU2tpbGxzJywgW10pLFxuXHRcdFx0XHRhZ2VudHM6IG9ic2VydmFibGVWYWx1ZSgncGx1Z2luQWdlbnRzJywgW10pLFxuXHRcdFx0XHRpbnN0cnVjdGlvbnM6IG9ic2VydmFibGVWYWx1ZSgncGx1Z2luSW5zdHJ1Y3Rpb25zJywgW10pLFxuXHRcdFx0XHRtY3BTZXJ2ZXJEZWZpbml0aW9uczogb2JzZXJ2YWJsZVZhbHVlKCdwbHVnaW5NY3BTZXJ2ZXJEZWZpbml0aW9ucycsIFtdKSxcblx0XHRcdH07XG5cdFx0fVxuXG5cdFx0ZnVuY3Rpb24gaGFybmVzc1BsdWdpblJvdyhuYW1lOiBzdHJpbmcsIG92ZXJyaWRlczogUGFydGlhbDxJQ3VzdG9taXphdGlvbkl0ZW0+ID0ge30pOiBJQ3VzdG9taXphdGlvbkl0ZW0ge1xuXHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0dXJpOiBVUkkucGFyc2UoYGFnZW50LWhvc3Q6Ly90L3BsdWdpbnMvJHtuYW1lfWApLFxuXHRcdFx0XHR0eXBlOiAncGx1Z2luJyxcblx0XHRcdFx0bmFtZSxcblx0XHRcdFx0c291cmNlOiBBSUN1c3RvbWl6YXRpb25Tb3VyY2VzLnBsdWdpbixcblx0XHRcdFx0ZXh0ZW5zaW9uSWQ6IHVuZGVmaW5lZCxcblx0XHRcdFx0cGx1Z2luVXJpOiB1bmRlZmluZWQsXG5cdFx0XHRcdHVzZXJJbnZvY2FibGU6IHVuZGVmaW5lZCxcblx0XHRcdFx0Li4ub3ZlcnJpZGVzLFxuXHRcdFx0fTtcblx0XHR9XG5cblx0XHRmdW5jdGlvbiBwcm92aWRlclNraWxsKG5hbWU6IHN0cmluZywgdXJpOiBzdHJpbmcgPSBgYWdlbnQtaG9zdDovL3Qvc2tpbGxzLyR7bmFtZX0vU0tJTEwubWRgKTogSUN1c3RvbWl6YXRpb25JdGVtIHtcblx0XHRcdHJldHVybiB7XG5cdFx0XHRcdHVyaTogVVJJLnBhcnNlKHVyaSksXG5cdFx0XHRcdHR5cGU6IFByb21wdHNUeXBlLnNraWxsLFxuXHRcdFx0XHRuYW1lLFxuXHRcdFx0XHRzb3VyY2U6IEFJQ3VzdG9taXphdGlvblNvdXJjZXMucGx1Z2luLFxuXHRcdFx0XHRleHRlbnNpb25JZDogdW5kZWZpbmVkLFxuXHRcdFx0XHRwbHVnaW5Vcmk6IHVuZGVmaW5lZCxcblx0XHRcdFx0dXNlckludm9jYWJsZTogdHJ1ZSxcblx0XHRcdH07XG5cdFx0fVxuXG5cdFx0ZnVuY3Rpb24gcHJvdmlkZXJPZlR5cGUodHlwZTogUHJvbXB0c1R5cGUsIG5hbWU6IHN0cmluZyk6IElDdXN0b21pemF0aW9uSXRlbSB7XG5cdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHR1cmk6IFVSSS5wYXJzZShgYWdlbnQtaG9zdDovL3QvJHt0eXBlfS8ke25hbWV9YCksXG5cdFx0XHRcdHR5cGUsXG5cdFx0XHRcdG5hbWUsXG5cdFx0XHRcdC8vIEhvb2tzIHByZS1leHBhbmRlZCBpdGVtcyBhcmUga2VwdCB1bmRlciBgcGx1Z2luYCBzdG9yYWdlOyB1c2luZ1xuXHRcdFx0XHQvLyBwbHVnaW4gc3RvcmFnZSB1bmlmb3JtbHkgYXZvaWRzIHRoZSBmaWxlLXN5c3RlbSBleHBhbnNpb24gcGF0aFxuXHRcdFx0XHQvLyBpbiB0ZXN0cyBmb3Igbm9uLWhvb2sgdHlwZXMgYXMgd2VsbC5cblx0XHRcdFx0c291cmNlOiBBSUN1c3RvbWl6YXRpb25Tb3VyY2VzLnBsdWdpbixcblx0XHRcdFx0ZXh0ZW5zaW9uSWQ6IHVuZGVmaW5lZCxcblx0XHRcdFx0cGx1Z2luVXJpOiB1bmRlZmluZWQsXG5cdFx0XHRcdHVzZXJJbnZvY2FibGU6IHRydWUsXG5cdFx0XHR9O1xuXHRcdH1cblxuXHRcdGNvbnN0IHNlY3Rpb25zQnlUeXBlID0gW1xuXHRcdFx0W0FJQ3VzdG9taXphdGlvbk1hbmFnZW1lbnRTZWN0aW9uLkFnZW50cywgUHJvbXB0c1R5cGUuYWdlbnRdLFxuXHRcdFx0W0FJQ3VzdG9taXphdGlvbk1hbmFnZW1lbnRTZWN0aW9uLlNraWxscywgUHJvbXB0c1R5cGUuc2tpbGxdLFxuXHRcdFx0W0FJQ3VzdG9taXphdGlvbk1hbmFnZW1lbnRTZWN0aW9uLkluc3RydWN0aW9ucywgUHJvbXB0c1R5cGUuaW5zdHJ1Y3Rpb25zXSxcblx0XHRcdFtBSUN1c3RvbWl6YXRpb25NYW5hZ2VtZW50U2VjdGlvbi5Qcm9tcHRzLCBQcm9tcHRzVHlwZS5wcm9tcHRdLFxuXHRcdFx0W0FJQ3VzdG9taXphdGlvbk1hbmFnZW1lbnRTZWN0aW9uLkhvb2tzLCBQcm9tcHRzVHlwZS5ob29rXSxcblx0XHRdIGFzIGNvbnN0O1xuXG5cdFx0Zm9yIChjb25zdCBbc2VjdGlvbiwgdHlwZV0gb2Ygc2VjdGlvbnNCeVR5cGUpIHtcblx0XHRcdHRlc3QoYGdldENvdW50KCR7c2VjdGlvbn0pIG1pcnJvcnMgcHJvdmlkZXIgaXRlbXMgZmlsdGVyZWQgYnkgdHlwZT0ke3R5cGV9YCwgYXN5bmMgKCkgPT4ge1xuXHRcdFx0XHRwcm92aWRlckl0ZW1zID0gW1xuXHRcdFx0XHRcdHByb3ZpZGVyT2ZUeXBlKHR5cGUsICdhJyksXG5cdFx0XHRcdFx0cHJvdmlkZXJPZlR5cGUodHlwZSwgJ2InKSxcblx0XHRcdFx0XHRwcm92aWRlck9mVHlwZShQcm9tcHRzVHlwZS5hZ2VudCwgJ3VucmVsYXRlZC0xJyksXG5cdFx0XHRcdFx0cHJvdmlkZXJPZlR5cGUoUHJvbXB0c1R5cGUuc2tpbGwsICd1bnJlbGF0ZWQtMicpLFxuXHRcdFx0XHRdO1xuXG5cdFx0XHRcdGNvbnN0IG1vZGVsID0gZGlzcG9zYWJsZXMuYWRkKGluc3RhU2VydmljZS5jcmVhdGVJbnN0YW5jZShBSUN1c3RvbWl6YXRpb25JdGVtc01vZGVsKSk7XG5cdFx0XHRcdGNvbnN0IGNvdW50ID0gbW9kZWwuZ2V0Q291bnQoc2VjdGlvbik7XG5cdFx0XHRcdGF3YWl0IG1vZGVsLndoZW5TZWN0aW9uTG9hZGVkKHNlY3Rpb24pO1xuXG5cdFx0XHRcdGNvbnN0IGV4cGVjdGVkID0gcHJvdmlkZXJJdGVtcy5maWx0ZXIoaSA9PiBpLnR5cGUgPT09IHR5cGUpLmxlbmd0aDtcblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNvdW50LmdldCgpLCBleHBlY3RlZCwgYCR7c2VjdGlvbn0gY291bnQgc2hvdWxkIGVxdWFsIHByb3ZpZGVyIGl0ZW1zIHdoZXJlIHR5cGUgPT09ICR7dHlwZX1gKTtcblx0XHRcdH0pO1xuXHRcdH1cblxuXHRcdHRlc3QoJ2dldENvdW50IHJlYWN0cyB0byBwcm92aWRlciBvbkRpZENoYW5nZSBmb3Igb2JzZXJ2ZWQgc2VjdGlvbnMnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRwcm92aWRlckl0ZW1zID0gW3Byb3ZpZGVyU2tpbGwoJ29uZScpXTtcblxuXHRcdFx0Y29uc3QgbW9kZWwgPSBkaXNwb3NhYmxlcy5hZGQoaW5zdGFTZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKEFJQ3VzdG9taXphdGlvbkl0ZW1zTW9kZWwpKTtcblx0XHRcdGNvbnN0IGNvdW50ID0gbW9kZWwuZ2V0Q291bnQoQUlDdXN0b21pemF0aW9uTWFuYWdlbWVudFNlY3Rpb24uU2tpbGxzKTtcblx0XHRcdGF3YWl0IG1vZGVsLndoZW5TZWN0aW9uTG9hZGVkKEFJQ3VzdG9taXphdGlvbk1hbmFnZW1lbnRTZWN0aW9uLlNraWxscyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY291bnQuZ2V0KCksIDEsICdpbml0aWFsIGZldGNoIHJlZmxlY3RzIHByb3ZpZGVyIHN0YXRlJyk7XG5cblx0XHRcdHByb3ZpZGVySXRlbXMgPSBbcHJvdmlkZXJTa2lsbCgnb25lJyksIHByb3ZpZGVyU2tpbGwoJ3R3bycpXTtcblx0XHRcdHByb3ZpZGVyRGlkQ2hhbmdlLmZpcmUoKTtcblx0XHRcdGF3YWl0IHRpbWVvdXQoMCk7XG5cblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChjb3VudC5nZXQoKSwgMiwgJ2NvdW50IHJlZmV0Y2hlcyBhZnRlciBwcm92aWRlciBjaGFuZ2UnKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2dldFBsdWdpbkNvdW50IHJldHVybnMgbG9jYWwgcGx1Z2luIGNvdW50IHdoZW4gaGFybmVzcyBoYXMgbm8gcGx1Z2luIHJvd3MnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRwcm92aWRlckl0ZW1zID0gW3Byb3ZpZGVyU2tpbGwoJ25vdC1hLXBsdWdpbi1yb3cnKV07XG5cdFx0XHRwbHVnaW5zLnNldChbbG9jYWxQbHVnaW4oJ2xvY2FsLWEnKSwgbG9jYWxQbHVnaW4oJ2xvY2FsLWInKV0sIHVuZGVmaW5lZCk7XG5cblx0XHRcdGNvbnN0IG1vZGVsID0gZGlzcG9zYWJsZXMuYWRkKGluc3RhU2VydmljZS5jcmVhdGVJbnN0YW5jZShBSUN1c3RvbWl6YXRpb25JdGVtc01vZGVsKSk7XG5cdFx0XHRjb25zdCBjb3VudCA9IG1vZGVsLmdldFBsdWdpbkNvdW50KCk7XG5cdFx0XHRhd2FpdCB0aW1lb3V0KDApO1xuXG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY291bnQuZ2V0KCksIDIsICdwbHVnaW4gY291bnQgdXNlcyBsb2NhbCBwbHVnaW5zIHdoZW4gdGhlIGhhcm5lc3MgZXhwb3NlcyBub25lJyk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdnZXRQbHVnaW5Db3VudCByZXR1cm5zIGhhcm5lc3MgcGx1Z2luIHJvdyBjb3VudCB3aGVuIG5vIGxvY2FsIHBsdWdpbnMgYXJlIGluc3RhbGxlZCcsIGFzeW5jICgpID0+IHtcblx0XHRcdHByb3ZpZGVySXRlbXMgPSBbXG5cdFx0XHRcdGhhcm5lc3NQbHVnaW5Sb3coJ3gnKSxcblx0XHRcdFx0aGFybmVzc1BsdWdpblJvdygneScsIHsgdHlwZTogQUlDdXN0b21pemF0aW9uTWFuYWdlbWVudFNlY3Rpb24uUGx1Z2lucyB9KSxcblx0XHRcdFx0aGFybmVzc1BsdWdpblJvdygnc3luY2VkJywgeyBncm91cEtleTogJ3JlbW90ZS1jbGllbnQnIH0pLFxuXHRcdFx0XTtcblx0XHRcdHBsdWdpbnMuc2V0KFtdLCB1bmRlZmluZWQpO1xuXG5cdFx0XHRjb25zdCBtb2RlbCA9IGRpc3Bvc2FibGVzLmFkZChpbnN0YVNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoQUlDdXN0b21pemF0aW9uSXRlbXNNb2RlbCkpO1xuXHRcdFx0Y29uc3QgY291bnQgPSBtb2RlbC5nZXRQbHVnaW5Db3VudCgpO1xuXHRcdFx0YXdhaXQgdGltZW91dCgwKTtcblxuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNvdW50LmdldCgpLCAyLCAncmVtb3RlLWNsaWVudCBoYXJuZXNzIHJvd3MgYXJlIGV4Y2x1ZGVkOyBib3RoIGludGVybmFsIFwicGx1Z2luXCIgYW5kIEFQSSBcInBsdWdpbnNcIiB0eXBlcyBhcmUgcmVjb2duaXNlZCcpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnZ2V0UGx1Z2luQ291bnQgc3VtcyBsb2NhbCBwbHVnaW5zIGFuZCB1bmlxdWUgaGFybmVzcyBwbHVnaW4gcm93cycsIGFzeW5jICgpID0+IHtcblx0XHRcdHByb3ZpZGVySXRlbXMgPSBbXG5cdFx0XHRcdGhhcm5lc3NQbHVnaW5Sb3coJ2R1cCcpLFxuXHRcdFx0XHRoYXJuZXNzUGx1Z2luUm93KCd1bmlxJyksXG5cdFx0XHRdO1xuXHRcdFx0cGx1Z2lucy5zZXQoW2xvY2FsUGx1Z2luKCdkdXAnKSwgbG9jYWxQbHVnaW4oJ2xvY2FsLW9ubHknKV0sIHVuZGVmaW5lZCk7XG5cblx0XHRcdGNvbnN0IG1vZGVsID0gZGlzcG9zYWJsZXMuYWRkKGluc3RhU2VydmljZS5jcmVhdGVJbnN0YW5jZShBSUN1c3RvbWl6YXRpb25JdGVtc01vZGVsKSk7XG5cdFx0XHRjb25zdCBjb3VudCA9IG1vZGVsLmdldFBsdWdpbkNvdW50KCk7XG5cdFx0XHRhd2FpdCB0aW1lb3V0KDApO1xuXG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY291bnQuZ2V0KCksIDMsICdkdXAgaXMgY291bnRlZCBvbmNlIHZpYSB0aGUgbG9jYWwgc291cmNlOyB1bmlxIGFkZHMsIGxvY2FsLW9ubHkgYWRkcycpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnZ2V0UGx1Z2luQ291bnQgZGVkdXBzIGFnYWluc3QgVVJJIGJhc2VuYW1lIHdoZW4gbG9jYWwgcGx1Z2luIGxhYmVsIGlzIGVtcHR5JywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Ly8gTWlycm9ycyBQbHVnaW5MaXN0V2lkZ2V0OiB3aGVuIGFuIGluc3RhbGxlZCBwbHVnaW4gaGFzIG5vIGxhYmVsXG5cdFx0XHQvLyAoYGxhYmVsID09PSAnJ2ApLCB0aGUgZWRpdG9yIHJlbmRlcnMgaXQgdW5kZXIgYGJhc2VuYW1lKHBsdWdpbi51cmkpYFxuXHRcdFx0Ly8gYW5kIGRlZHVwcyByZW1vdGUgcm93cyBhZ2FpbnN0IHRoYXQuIFRoZSBtb2RlbCBtdXN0IHVzZSB0aGUgc2FtZVxuXHRcdFx0Ly8gZmFsbGJhY2sgb3IgdGhlIHNpZGViYXIgY291bnQgZHJpZnRzIGFib3ZlIHRoZSBlZGl0b3IgY291bnQuXG5cdFx0XHRwcm92aWRlckl0ZW1zID0gW2hhcm5lc3NQbHVnaW5Sb3coJ2Jhc2VuYW1lLW1hdGNoJyldO1xuXHRcdFx0Y29uc3QgbGFiZWxsZXNzOiBJQWdlbnRQbHVnaW4gPSB7XG5cdFx0XHRcdC4uLmxvY2FsUGx1Z2luKCdiYXNlbmFtZS1tYXRjaCcpLFxuXHRcdFx0XHR1cmk6IFVSSS5wYXJzZSgncGx1Z2luLXRlc3Q6Ly8vYmFzZW5hbWUtbWF0Y2gnKSxcblx0XHRcdFx0bGFiZWw6ICcnLFxuXHRcdFx0fTtcblx0XHRcdHBsdWdpbnMuc2V0KFtsYWJlbGxlc3NdLCB1bmRlZmluZWQpO1xuXG5cdFx0XHRjb25zdCBtb2RlbCA9IGRpc3Bvc2FibGVzLmFkZChpbnN0YVNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoQUlDdXN0b21pemF0aW9uSXRlbXNNb2RlbCkpO1xuXHRcdFx0Y29uc3QgY291bnQgPSBtb2RlbC5nZXRQbHVnaW5Db3VudCgpO1xuXHRcdFx0YXdhaXQgdGltZW91dCgwKTtcblxuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNvdW50LmdldCgpLCAxLCAncmVtb3RlIHJvdyBpcyBmb2xkZWQgaW50byB0aGUgbGFiZWxsZXNzIGxvY2FsIHBsdWdpbiB2aWEgYmFzZW5hbWUnKTtcblx0XHR9KTtcblx0fSk7XG5cblx0Ly8gUmVncmVzc2lvbiBjb3ZlcmFnZSBmb3IgdGhlIGFnZW50LWhvc3QgaGFybmVzcyBwYXRoXG5cdC8vIChgUHVyZUl0ZW1Qcm92aWRlckl0ZW1Tb3VyY2VgKS4gVGhlIGl0ZW0tc291cmNlIGNhY2hlcyB0aGUgcHJvdmlkZXInc1xuXHQvLyBpdGVtcyBhbmQgYXBwbGllcyBlYWNoIHNlY3Rpb24ncyBgcHJvbXB0VHlwZWAgZmlsdGVyIGF0IGZldGNoIHRpbWUsXG5cdC8vIHNvIHJlYWRpbmcgb25lIHNlY3Rpb24gKGUuZy4gQWdlbnRzKSBtdXN0IG5vdCBwb2lzb24gdGhlIGNhY2hlZFxuXHQvLyBpdGVtcyBmb3IgYW55IG90aGVyIHNlY3Rpb24gKGUuZy4gSW5zdHJ1Y3Rpb25zKS5cblx0c3VpdGUoJ2FnZW50IGhvc3QgaXRlbSBzb3VyY2UgY2FjaGVzIGFsbCB0eXBlcycsICgpID0+IHtcblxuXHRcdGxldCBkaXNwb3NhYmxlczogRGlzcG9zYWJsZVN0b3JlO1xuXHRcdGxldCBpbnN0YVNlcnZpY2U6IFRlc3RJbnN0YW50aWF0aW9uU2VydmljZTtcblx0XHRsZXQgcHJvdmlkZXJJdGVtczogSUN1c3RvbWl6YXRpb25JdGVtW107XG5cdFx0bGV0IGJ1aWx0aW5Ta2lsbHM6IElQcm9tcHRQYXRoW107XG5cdFx0bGV0IGRpc2FibGVkUHJvbXB0RmlsZXM6IFJlc291cmNlU2V0O1xuXHRcdGxldCBvbkRpZENoYW5nZVNraWxsczogRW1pdHRlcjx2b2lkPjtcblxuXHRcdHNldHVwKCgpID0+IHtcblx0XHRcdGRpc3Bvc2FibGVzID0gbmV3IERpc3Bvc2FibGVTdG9yZSgpO1xuXHRcdFx0cHJvdmlkZXJJdGVtcyA9IFtdO1xuXHRcdFx0YnVpbHRpblNraWxscyA9IFtdO1xuXHRcdFx0ZGlzYWJsZWRQcm9tcHRGaWxlcyA9IG5ldyBSZXNvdXJjZVNldCgpO1xuXHRcdFx0b25EaWRDaGFuZ2VTa2lsbHMgPSBkaXNwb3NhYmxlcy5hZGQobmV3IEVtaXR0ZXI8dm9pZD4oKSk7XG5cblx0XHRcdGNvbnN0IHNlc3Npb25UeXBlID0gJ2FnZW50LWhvc3QtdGVzdCc7XG5cdFx0XHRjb25zdCBwcm92aWRlcjogSUN1c3RvbWl6YXRpb25JdGVtUHJvdmlkZXIgPSB7XG5cdFx0XHRcdG9uRGlkQ2hhbmdlOiBFdmVudC5Ob25lLFxuXHRcdFx0XHRwcm92aWRlQ2hhdFNlc3Npb25DdXN0b21pemF0aW9uczogKCkgPT4gUHJvbWlzZS5yZXNvbHZlKHByb3ZpZGVySXRlbXMuc2xpY2UoKSksXG5cdFx0XHR9O1xuXHRcdFx0Y29uc3QgZGVzY3JpcHRvcjogSUhhcm5lc3NEZXNjcmlwdG9yID0ge1xuXHRcdFx0XHRpZDogc2Vzc2lvblR5cGUsXG5cdFx0XHRcdGxhYmVsOiAnQWdlbnQgSG9zdCBUZXN0Jyxcblx0XHRcdFx0aWNvbjogQ29kaWNvbi5zZXR0aW5nc0dlYXIsXG5cdFx0XHRcdGl0ZW1Qcm92aWRlcjogcHJvdmlkZXIsXG5cdFx0XHR9O1xuXHRcdFx0Y29uc3Qgc2Vzc2lvblJlc291cmNlID0gVVJJLnBhcnNlKGAke3Nlc3Npb25UeXBlfTovLy9hY3RpdmUtc2Vzc2lvbmApO1xuXHRcdFx0Y29uc3QgYXZhaWxhYmxlSGFybmVzc2VzID0gb2JzZXJ2YWJsZVZhbHVlPHJlYWRvbmx5IElIYXJuZXNzRGVzY3JpcHRvcltdPignYXZhaWxhYmxlSGFybmVzc2VzJywgW2Rlc2NyaXB0b3JdKTtcblxuXHRcdFx0aW5zdGFTZXJ2aWNlID0gd29ya2JlbmNoSW5zdGFudGlhdGlvblNlcnZpY2Uoe30sIGRpc3Bvc2FibGVzKTtcblx0XHRcdGluc3RhU2VydmljZS5zdHViKElQcm9tcHRzU2VydmljZSwge1xuXHRcdFx0XHRvbkRpZENoYW5nZUN1c3RvbUFnZW50czogRXZlbnQuTm9uZSxcblx0XHRcdFx0b25EaWRDaGFuZ2VTbGFzaENvbW1hbmRzOiBFdmVudC5Ob25lLFxuXHRcdFx0XHRvbkRpZENoYW5nZVNraWxsczogb25EaWRDaGFuZ2VTa2lsbHMuZXZlbnQsXG5cdFx0XHRcdG9uRGlkQ2hhbmdlSG9va3M6IEV2ZW50Lk5vbmUsXG5cdFx0XHRcdG9uRGlkQ2hhbmdlSW5zdHJ1Y3Rpb25zOiBFdmVudC5Ob25lLFxuXHRcdFx0XHRvbkRpZENoYW5nZUFnZW50SW5zdHJ1Y3Rpb25zOiBFdmVudC5Ob25lLFxuXHRcdFx0XHRsaXN0UHJvbXB0RmlsZXM6IGFzeW5jICgpID0+IFtdLFxuXHRcdFx0XHRsaXN0UHJvbXB0RmlsZXNGb3JTdG9yYWdlOiBhc3luYyAodHlwZTogUHJvbXB0c1R5cGUsIHN0b3JhZ2U6IFByb21wdHNTdG9yYWdlKSA9PiAoXG5cdFx0XHRcdFx0dHlwZSA9PT0gUHJvbXB0c1R5cGUuc2tpbGwgJiYgc3RvcmFnZSA9PT0gUHJvbXB0c1N0b3JhZ2UuYnVpbHRJbiA/IGJ1aWx0aW5Ta2lsbHMuc2xpY2UoKSA6IFtdXG5cdFx0XHRcdCksXG5cdFx0XHRcdGdldEN1c3RvbUFnZW50czogYXN5bmMgKCkgPT4gW10sXG5cdFx0XHRcdGZpbmRBZ2VudFNraWxsczogYXN5bmMgKCkgPT4gW10sXG5cdFx0XHRcdGdldEhvb2tzOiBhc3luYyAoKSA9PiB1bmRlZmluZWQsXG5cdFx0XHRcdGdldEluc3RydWN0aW9uRmlsZXM6IGFzeW5jICgpID0+IFtdLFxuXHRcdFx0XHRnZXREaXNhYmxlZFByb21wdEZpbGVzOiAoKSA9PiBkaXNhYmxlZFByb21wdEZpbGVzLFxuXHRcdFx0fSk7XG5cdFx0XHRpbnN0YVNlcnZpY2Uuc3R1YihJQUlDdXN0b21pemF0aW9uV29ya3NwYWNlU2VydmljZSwge1xuXHRcdFx0XHRhY3RpdmVQcm9qZWN0Um9vdDogb2JzZXJ2YWJsZVZhbHVlKCd0ZXN0JywgdW5kZWZpbmVkKSxcblx0XHRcdFx0Z2V0QWN0aXZlUHJvamVjdFJvb3Q6ICgpID0+IHVuZGVmaW5lZCxcblx0XHRcdFx0bWFuYWdlbWVudFNlY3Rpb25zOiBbQUlDdXN0b21pemF0aW9uTWFuYWdlbWVudFNlY3Rpb24uQWdlbnRzXSxcblx0XHRcdFx0aXNTZXNzaW9uc1dpbmRvdzogZmFsc2UsXG5cdFx0XHRcdHdlbGNvbWVQYWdlRmVhdHVyZXM6IHsgc2hvd0dldHRpbmdTdGFydGVkQmFubmVyOiBmYWxzZSB9LFxuXHRcdFx0XHRnZXRTa2lsbFVJSW50ZWdyYXRpb25zOiAoKSA9PiBuZXcgTWFwKCksXG5cdFx0XHRcdGhhc092ZXJyaWRlUHJvamVjdFJvb3Q6IG9ic2VydmFibGVWYWx1ZSgndGVzdCcsIGZhbHNlKSxcblx0XHRcdFx0Y29tbWl0RmlsZXM6IGFzeW5jICgpID0+IHsgfSxcblx0XHRcdFx0ZGVsZXRlRmlsZXM6IGFzeW5jICgpID0+IHsgfSxcblx0XHRcdFx0Z2VuZXJhdGVDdXN0b21pemF0aW9uOiBhc3luYyAoKSA9PiB7IH0sXG5cdFx0XHRcdHNldE92ZXJyaWRlUHJvamVjdFJvb3Q6ICgpID0+IHsgfSxcblx0XHRcdFx0Y2xlYXJPdmVycmlkZVByb2plY3RSb290OiAoKSA9PiB7IH0sXG5cdFx0XHR9KTtcblx0XHRcdGNvbnN0IGFjdGl2ZVNlc3Npb25SZXNvdXJjZSA9IG9ic2VydmFibGVWYWx1ZSgnYWN0aXZlU2Vzc2lvblJlc291cmNlJywgc2Vzc2lvblJlc291cmNlKTtcblx0XHRcdGNvbnN0IGFjdGl2ZUhhcm5lc3MgPSBkZXJpdmVkKHJlYWRlciA9PiBnZXRDaGF0U2Vzc2lvblR5cGUoYWN0aXZlU2Vzc2lvblJlc291cmNlLnJlYWQocmVhZGVyKSkpO1xuXHRcdFx0aW5zdGFTZXJ2aWNlLnN0dWIoSUN1c3RvbWl6YXRpb25IYXJuZXNzU2VydmljZSwge1xuXHRcdFx0XHRhY3RpdmVTZXNzaW9uUmVzb3VyY2UsXG5cdFx0XHRcdGFjdGl2ZUhhcm5lc3MsXG5cdFx0XHRcdGF2YWlsYWJsZUhhcm5lc3Nlcyxcblx0XHRcdFx0c2V0QWN0aXZlU2Vzc2lvbjogKG5leHQ6IFVSSSkgPT4gYWN0aXZlU2Vzc2lvblJlc291cmNlLnNldChuZXh0LCB1bmRlZmluZWQpLFxuXHRcdFx0XHRnZXRBY3RpdmVEZXNjcmlwdG9yOiAoKSA9PiBhdmFpbGFibGVIYXJuZXNzZXMuZ2V0KCkuZmluZChkID0+IGQuaWQgPT09IGFjdGl2ZUhhcm5lc3MuZ2V0KCkpISxcblx0XHRcdFx0ZmluZEhhcm5lc3NCeUlkOiAoaWQ6IHN0cmluZykgPT4gYXZhaWxhYmxlSGFybmVzc2VzLmdldCgpLmZpbmQoZCA9PiBkLmlkID09PSBpZCksXG5cdFx0XHRcdHJlZ2lzdGVyRXh0ZXJuYWxIYXJuZXNzOiAoKSA9PiAoeyBkaXNwb3NlKCkgeyB9IH0pLFxuXHRcdFx0fSk7XG5cdFx0XHRpbnN0YVNlcnZpY2Uuc3R1YihJQWdlbnRQbHVnaW5TZXJ2aWNlLCB7XG5cdFx0XHRcdHBsdWdpbnM6IG9ic2VydmFibGVWYWx1ZTxyZWFkb25seSBJQWdlbnRQbHVnaW5bXT4oJ3BsdWdpbnMnLCBbXSksXG5cdFx0XHRcdGVuYWJsZW1lbnRNb2RlbDoge1xuXHRcdFx0XHRcdHJlYWRFbmFibGVkOiAoKSA9PiBDb250cmlidXRpb25FbmFibGVtZW50U3RhdGUuRW5hYmxlZFByb2ZpbGUsXG5cdFx0XHRcdFx0cmVhZFByb2ZpbGVFbmFibGVkOiAoKSA9PiB0cnVlLFxuXHRcdFx0XHRcdHNldEVuYWJsZWQ6ICgpID0+IHsgfSxcblx0XHRcdFx0XHRyZW1vdmU6ICgpID0+IHsgfSxcblx0XHRcdFx0fSxcblx0XHRcdH0pO1xuXHRcdH0pO1xuXG5cdFx0dGVhcmRvd24oKCkgPT4gZGlzcG9zYWJsZXMuZGlzcG9zZSgpKTtcblxuXHRcdHRlc3QoJ29ic2VydmluZyBvbmUgc2VjdGlvbiBkb2VzIG5vdCBoaWRlIGl0ZW1zIG9mIG90aGVyIHNlY3Rpb25zJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0cHJvdmlkZXJJdGVtcyA9IFtcblx0XHRcdFx0eyB1cmk6IFVSSS5wYXJzZSgnYWdlbnQtaG9zdDovL3QvYWdlbnRzL2NvZGVyLmFnZW50Lm1kJyksIHR5cGU6IFByb21wdHNUeXBlLmFnZW50LCBuYW1lOiAnY29kZXInLCBzb3VyY2U6IEFJQ3VzdG9taXphdGlvblNvdXJjZXMucGx1Z2luLCBleHRlbnNpb25JZDogdW5kZWZpbmVkLCBwbHVnaW5Vcmk6IHVuZGVmaW5lZCwgdXNlckludm9jYWJsZTogdHJ1ZSB9LFxuXHRcdFx0XHR7IHVyaTogVVJJLnBhcnNlKCdhZ2VudC1ob3N0Oi8vdC9ydWxlcy9zdHlsZS5pbnN0cnVjdGlvbnMubWQnKSwgdHlwZTogUHJvbXB0c1R5cGUuaW5zdHJ1Y3Rpb25zLCBuYW1lOiAnc3R5bGUnLCBzb3VyY2U6IEFJQ3VzdG9taXphdGlvblNvdXJjZXMucGx1Z2luLCBleHRlbnNpb25JZDogdW5kZWZpbmVkLCBwbHVnaW5Vcmk6IHVuZGVmaW5lZCwgdXNlckludm9jYWJsZTogdW5kZWZpbmVkIH0sXG5cdFx0XHRcdHsgdXJpOiBVUkkucGFyc2UoJ2FnZW50LWhvc3Q6Ly90L3NraWxscy9yZXBvL1NLSUxMLm1kJyksIHR5cGU6IFByb21wdHNUeXBlLnNraWxsLCBuYW1lOiAncmVwbycsIHNvdXJjZTogQUlDdXN0b21pemF0aW9uU291cmNlcy5wbHVnaW4sIGV4dGVuc2lvbklkOiB1bmRlZmluZWQsIHBsdWdpblVyaTogdW5kZWZpbmVkLCB1c2VySW52b2NhYmxlOiB0cnVlIH0sXG5cdFx0XHRdO1xuXG5cdFx0XHRjb25zdCBtb2RlbCA9IGRpc3Bvc2FibGVzLmFkZChpbnN0YVNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoQUlDdXN0b21pemF0aW9uSXRlbXNNb2RlbCkpO1xuXHRcdFx0Ly8gT2JzZXJ2ZSB0aGUgQWdlbnRzIHNlY3Rpb24gZmlyc3QgXHUyMDE0IHRoaXMgcHJpbWVzIHRoZSB1bmRlcmx5aW5nXG5cdFx0XHQvLyBjYWNoZS4gVGhlbiBvYnNlcnZlIEluc3RydWN0aW9ucyBvbiB0aGUgc2FtZSBtb2RlbDsgdGhlIGJ1Z1xuXHRcdFx0Ly8gY2F1c2VkIHRoaXMgc2Vjb25kIG9ic2VydmF0aW9uIHRvIHNlZSBhbiBlbXB0eSBsaXN0IGJlY2F1c2Vcblx0XHRcdC8vIHRoZSBjYWNoZSBoYWQgYWxyZWFkeSBiZWVuIG5vcm1hbGl6ZWQgZm9yIGBQcm9tcHRzVHlwZS5hZ2VudGAuXG5cdFx0XHRjb25zdCBhZ2VudEl0ZW1zID0gbW9kZWwuZ2V0SXRlbXMoQUlDdXN0b21pemF0aW9uTWFuYWdlbWVudFNlY3Rpb24uQWdlbnRzKTtcblx0XHRcdGF3YWl0IG1vZGVsLndoZW5TZWN0aW9uTG9hZGVkKEFJQ3VzdG9taXphdGlvbk1hbmFnZW1lbnRTZWN0aW9uLkFnZW50cyk7XG5cdFx0XHRjb25zdCBpbnN0cnVjdGlvbkl0ZW1zID0gbW9kZWwuZ2V0SXRlbXMoQUlDdXN0b21pemF0aW9uTWFuYWdlbWVudFNlY3Rpb24uSW5zdHJ1Y3Rpb25zKTtcblx0XHRcdGF3YWl0IG1vZGVsLndoZW5TZWN0aW9uTG9hZGVkKEFJQ3VzdG9taXphdGlvbk1hbmFnZW1lbnRTZWN0aW9uLkluc3RydWN0aW9ucyk7XG5cblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRhZ2VudHM6IGFnZW50SXRlbXMuZ2V0KCkubWFwKGkgPT4gaS5uYW1lKS5zb3J0KCksXG5cdFx0XHRcdFx0aW5zdHJ1Y3Rpb25zOiBpbnN0cnVjdGlvbkl0ZW1zLmdldCgpLm1hcChpID0+IGkubmFtZSkuc29ydCgpLFxuXHRcdFx0XHR9LFxuXHRcdFx0XHR7XG5cdFx0XHRcdFx0YWdlbnRzOiBbJ2NvZGVyJ10sXG5cdFx0XHRcdFx0aW5zdHJ1Y3Rpb25zOiBbJ3N0eWxlJ10sXG5cdFx0XHRcdH0sXG5cdFx0XHQpO1xuXHRcdH0pO1xuXG5cdFx0Ly8gUmVncmVzc2lvbjogb24gYWdlbnQtaG9zdCBoYXJuZXNzZXMgdGhlIFNraWxscyBsaXN0IHVzZWQgdG8gcmVuZGVyXG5cdFx0Ly8gc3RyYWlnaHQgZnJvbSB0aGUgcHJvdmlkZXIsIHdoaWNoIHJlcG9ydHMgdGhlIHN5bmNlZCAqYnVuZGxlKi4gQVxuXHRcdC8vIGJ1aWx0LWluIHNraWxsIGRpc2FibGVkIGZyb20gdGhlIEN1c3RvbWl6YXRpb25zIFVJIGlzIGRyb3BwZWQgZnJvbVxuXHRcdC8vIHRoYXQgYnVuZGxlLCBzbyB0aGUgc2tpbGwgdmFuaXNoZWQgZnJvbSB0aGUgbGlzdCBpbnN0ZWFkIG9mIHNob3dpbmdcblx0XHQvLyBhcyBkaXNhYmxlZCBcdTIwMTQgbGVhdmluZyBubyB3YXkgdG8gcmUtZW5hYmxlIGl0IGFuZCBtYWtpbmcgdGhlIERpc2FibGVcblx0XHQvLyBidXR0b24gbG9vayBsaWtlIGEgbm8tb3AuIEJ1aWx0LWlucyBhcmUgbm93IG1lcmdlZCBpbiBmcm9tIHRoZVxuXHRcdC8vIHByb21wdHMgc2VydmljZSwgd2hpY2ggb3ducyB0aGUgZW5hYmxlL2Rpc2FibGUgc3RhdGUuXG5cdFx0dGVzdCgnbGlzdHMgZGlzYWJsZWQgYnVpbHQtaW4gc2tpbGxzIGFzIGRpc2FibGVkIGluc3RlYWQgb2YgZHJvcHBpbmcgdGhlbScsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IGRpc2FibGVkU2tpbGwgPSBVUkkuZmlsZSgnL2J1aWx0aW4vY3JlYXRlLXByL1NLSUxMLm1kJyk7XG5cdFx0XHRjb25zdCBlbmFibGVkU2tpbGwgPSBVUkkuZmlsZSgnL2J1aWx0aW4vbWVyZ2UvU0tJTEwubWQnKTtcblx0XHRcdGJ1aWx0aW5Ta2lsbHMgPSBbXG5cdFx0XHRcdHsgdXJpOiBkaXNhYmxlZFNraWxsLCB0eXBlOiBQcm9tcHRzVHlwZS5za2lsbCwgc3RvcmFnZTogUHJvbXB0c1N0b3JhZ2UuYnVpbHRJbiwgbmFtZTogJ2NyZWF0ZS1wcicgfSBhcyBJUHJvbXB0UGF0aCxcblx0XHRcdFx0eyB1cmk6IGVuYWJsZWRTa2lsbCwgdHlwZTogUHJvbXB0c1R5cGUuc2tpbGwsIHN0b3JhZ2U6IFByb21wdHNTdG9yYWdlLmJ1aWx0SW4sIG5hbWU6ICdtZXJnZScgfSBhcyBJUHJvbXB0UGF0aCxcblx0XHRcdF07XG5cdFx0XHRkaXNhYmxlZFByb21wdEZpbGVzID0gbmV3IFJlc291cmNlU2V0KFtkaXNhYmxlZFNraWxsXSk7XG5cdFx0XHQvLyBUaGUgcHJvdmlkZXIgb25seSByZXBvcnRzIHRoZSBzdGlsbC1idW5kbGVkIHNraWxsOyB0aGUgZGlzYWJsZWRcblx0XHRcdC8vIG9uZSBpcyBhYnNlbnQgYmVjYXVzZSBpdCB3YXMgZXhjbHVkZWQgZnJvbSB0aGUgc3luY2VkIGJ1bmRsZS5cblx0XHRcdHByb3ZpZGVySXRlbXMgPSBbXG5cdFx0XHRcdHsgdXJpOiBlbmFibGVkU2tpbGwsIHR5cGU6IFByb21wdHNUeXBlLnNraWxsLCBuYW1lOiAnbWVyZ2UnLCBzb3VyY2U6IEFJQ3VzdG9taXphdGlvblNvdXJjZXMuYnVpbHRpbiwgZ3JvdXBLZXk6IEJVSUxUSU5fU1RPUkFHRSwgZXh0ZW5zaW9uSWQ6IHVuZGVmaW5lZCwgcGx1Z2luVXJpOiB1bmRlZmluZWQsIHVzZXJJbnZvY2FibGU6IHRydWUgfSxcblx0XHRcdF07XG5cblx0XHRcdGNvbnN0IG1vZGVsID0gZGlzcG9zYWJsZXMuYWRkKGluc3RhU2VydmljZS5jcmVhdGVJbnN0YW5jZShBSUN1c3RvbWl6YXRpb25JdGVtc01vZGVsKSk7XG5cdFx0XHRjb25zdCBza2lsbEl0ZW1zID0gbW9kZWwuZ2V0SXRlbXMoQUlDdXN0b21pemF0aW9uTWFuYWdlbWVudFNlY3Rpb24uU2tpbGxzKTtcblx0XHRcdGF3YWl0IG1vZGVsLndoZW5TZWN0aW9uTG9hZGVkKEFJQ3VzdG9taXphdGlvbk1hbmFnZW1lbnRTZWN0aW9uLlNraWxscyk7XG5cblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoXG5cdFx0XHRcdHNraWxsSXRlbXMuZ2V0KCkubWFwKGkgPT4gKHsgbmFtZTogaS5uYW1lLCBzb3VyY2U6IGkuc291cmNlLCBncm91cEtleTogaS5ncm91cEtleSwgZGlzYWJsZWQ6IGkuZGlzYWJsZWQgfSkpLnNvcnQoKGEsIGIpID0+IGEubmFtZS5sb2NhbGVDb21wYXJlKGIubmFtZSkpLFxuXHRcdFx0XHRbXG5cdFx0XHRcdFx0eyBuYW1lOiAnY3JlYXRlLXByJywgc291cmNlOiBBSUN1c3RvbWl6YXRpb25Tb3VyY2VzLmJ1aWx0aW4sIGdyb3VwS2V5OiBCVUlMVElOX1NUT1JBR0UsIGRpc2FibGVkOiB0cnVlIH0sXG5cdFx0XHRcdFx0eyBuYW1lOiAnbWVyZ2UnLCBzb3VyY2U6IEFJQ3VzdG9taXphdGlvblNvdXJjZXMuYnVpbHRpbiwgZ3JvdXBLZXk6IEJVSUxUSU5fU1RPUkFHRSwgZGlzYWJsZWQ6IGZhbHNlIH0sXG5cdFx0XHRcdF0sXG5cdFx0XHQpO1xuXHRcdH0pO1xuXHRcdHRlc3QoJ3JlZnJlc2hlcyBidWlsdC1pbiBza2lsbCBkaXNhYmxlZCBzdGF0ZSB3aGVuIG9uRGlkQ2hhbmdlU2tpbGxzIGZpcmVzJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Ly8gVGhlIERpc2FibGUgYWN0aW9uIHdyaXRlcyB0byBJUHJvbXB0c1NlcnZpY2UgYW5kIGZpcmVzXG5cdFx0XHQvLyBvbkRpZENoYW5nZVNraWxsczsgdGhlIHByb3ZpZGVyIGlzIHVuY2hhbmdlZCAoaXRzIGJ1bmRsZSByZWZyZXNoIGlzXG5cdFx0XHQvLyBhc3luY2hyb25vdXMgYW5kIG1heSBsYWcpLiBQdXJlSXRlbVByb3ZpZGVySXRlbVNvdXJjZSBtdXN0IHN0aWxsXG5cdFx0XHQvLyByZS1kZXJpdmUgYGRpc2FibGVkYCBmcm9tIHRoZSBwcm9tcHRzIHNlcnZpY2UsIG90aGVyd2lzZSB0aGUgcm93XG5cdFx0XHQvLyB3b3VsZCBzdGF5IHN0YWxlIHVudGlsIHNvbWUgdW5yZWxhdGVkIHByb3ZpZGVyIGNoYW5nZSBoYXBwZW5lZC5cblx0XHRcdGNvbnN0IHNraWxsID0gVVJJLmZpbGUoJy9idWlsdGluL2NyZWF0ZS1wci9TS0lMTC5tZCcpO1xuXHRcdFx0YnVpbHRpblNraWxscyA9IFtcblx0XHRcdFx0eyB1cmk6IHNraWxsLCB0eXBlOiBQcm9tcHRzVHlwZS5za2lsbCwgc3RvcmFnZTogUHJvbXB0c1N0b3JhZ2UuYnVpbHRJbiwgbmFtZTogJ2NyZWF0ZS1wcicgfSBhcyBJUHJvbXB0UGF0aCxcblx0XHRcdF07XG5cdFx0XHRwcm92aWRlckl0ZW1zID0gW1xuXHRcdFx0XHR7IHVyaTogc2tpbGwsIHR5cGU6IFByb21wdHNUeXBlLnNraWxsLCBuYW1lOiAnY3JlYXRlLXByJywgc291cmNlOiBBSUN1c3RvbWl6YXRpb25Tb3VyY2VzLmJ1aWx0aW4sIGdyb3VwS2V5OiBCVUlMVElOX1NUT1JBR0UsIGV4dGVuc2lvbklkOiB1bmRlZmluZWQsIHBsdWdpblVyaTogdW5kZWZpbmVkLCB1c2VySW52b2NhYmxlOiB0cnVlIH0sXG5cdFx0XHRdO1xuXG5cdFx0XHRjb25zdCBtb2RlbCA9IGRpc3Bvc2FibGVzLmFkZChpbnN0YVNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoQUlDdXN0b21pemF0aW9uSXRlbXNNb2RlbCkpO1xuXHRcdFx0Y29uc3Qgc2tpbGxJdGVtcyA9IG1vZGVsLmdldEl0ZW1zKEFJQ3VzdG9taXphdGlvbk1hbmFnZW1lbnRTZWN0aW9uLlNraWxscyk7XG5cdFx0XHRhd2FpdCBtb2RlbC53aGVuU2VjdGlvbkxvYWRlZChBSUN1c3RvbWl6YXRpb25NYW5hZ2VtZW50U2VjdGlvbi5Ta2lsbHMpO1xuXHRcdFx0Ly8gTGV0IGFueSByZWZldGNoIHNjaGVkdWxlZCBkdXJpbmcgY29uc3RydWN0aW9uIHNldHRsZSwgc28gdGhlXG5cdFx0XHQvLyBhc3NlcnRpb24gYmVsb3cgY2FuIG9ubHkgYmUgc2F0aXNmaWVkIGJ5IGEgcmVmZXRjaCB0aGF0IHRoZVxuXHRcdFx0Ly8gb25EaWRDaGFuZ2VTa2lsbHMgc3Vic2NyaXB0aW9uIGl0c2VsZiB0cmlnZ2VyZWQuXG5cdFx0XHRhd2FpdCB0aW1lb3V0KDApO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChza2lsbEl0ZW1zLmdldCgpLm1hcChpID0+ICh7IG5hbWU6IGkubmFtZSwgZGlzYWJsZWQ6IGkuZGlzYWJsZWQgfSkpLCBbXG5cdFx0XHRcdHsgbmFtZTogJ2NyZWF0ZS1wcicsIGRpc2FibGVkOiBmYWxzZSB9LFxuXHRcdFx0XSk7XG5cblx0XHRcdGRpc2FibGVkUHJvbXB0RmlsZXMgPSBuZXcgUmVzb3VyY2VTZXQoW3NraWxsXSk7XG5cdFx0XHRvbkRpZENoYW5nZVNraWxscy5maXJlKCk7XG5cdFx0XHRhd2FpdCB0aW1lb3V0KDApO1xuXHRcdFx0YXdhaXQgbW9kZWwud2hlblNlY3Rpb25Mb2FkZWQoQUlDdXN0b21pemF0aW9uTWFuYWdlbWVudFNlY3Rpb24uU2tpbGxzKTtcblxuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChza2lsbEl0ZW1zLmdldCgpLm1hcChpID0+ICh7IG5hbWU6IGkubmFtZSwgZGlzYWJsZWQ6IGkuZGlzYWJsZWQgfSkpLCBbXG5cdFx0XHRcdHsgbmFtZTogJ2NyZWF0ZS1wcicsIGRpc2FibGVkOiB0cnVlIH0sXG5cdFx0XHRdKTtc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
