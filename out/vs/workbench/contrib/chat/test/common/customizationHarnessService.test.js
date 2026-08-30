import assert from "assert";
import { Emitter } from "../../../../../base/common/event.js";
import { URI } from "../../../../../base/common/uri.js";
import { ThemeIcon } from "../../../../../base/common/themables.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../../base/test/common/utils.js";
import { CustomizationHarnessServiceBase, createVSCodeHarnessDescriptor } from "../../common/customizationHarnessService.js";
import { PromptsType, Target } from "../../common/promptSyntax/promptTypes.js";
import { PromptsStorage } from "../../common/promptSyntax/service/promptsService.js";
import { CancellationToken } from "../../../../../base/common/cancellation.js";
import { SessionType } from "../../common/chatSessionsService.js";
import { MockPromptsService } from "./promptSyntax/service/mockPromptsService.js";
suite("CustomizationHarnessService", () => {
  const store = ensureNoDisposablesAreLeakedInTestSuite();
  function createService(...harnesses) {
    if (harnesses.length === 0) {
      harnesses = [createVSCodeHarnessDescriptor()];
    }
    const promptsService = new MockPromptsService();
    const service = new CustomizationHarnessServiceBase(harnesses, harnesses[0].id, promptsService);
    store.add(service);
    return service;
  }
  const testSessionType1 = "test-session-type1";
  const testSessionResource1 = URI.parse("test-session-type1://session1");
  const testSessionResource2 = URI.parse("test-session-type2://session2");
  suite("registerExternalHarness", () => {
    test("forwards item provider changes via onDidChangeSlashCommands with sessionType", () => {
      const service = createService();
      const emitter = new Emitter();
      store.add(emitter);
      const harnessId = "test-harness";
      const externalDescriptor = {
        id: harnessId,
        label: "Test Harness",
        icon: ThemeIcon.fromId("extensions"),
        itemProvider: {
          onDidChange: emitter.event,
          provideChatSessionCustomizations: async (_sessionResource, _token) => []
        }
      };
      store.add(service.registerExternalHarness(externalDescriptor));
      let firedSessionType;
      const listener = store.add(service.onDidChangeSlashCommands((e) => firedSessionType = e.sessionType));
      store.add(listener);
      emitter.fire();
      assert.strictEqual(firedSessionType, harnessId);
    });
    test("forwards item provider changes via onDidChangeCustomAgents with sessionType", () => {
      const service = createService();
      const emitter = new Emitter();
      store.add(emitter);
      const harnessId = "test-harness";
      const externalDescriptor = {
        id: harnessId,
        label: "Test Harness",
        icon: ThemeIcon.fromId("extensions"),
        itemProvider: {
          onDidChange: emitter.event,
          provideChatSessionCustomizations: async (_sessionResource, _token) => []
        }
      };
      store.add(service.registerExternalHarness(externalDescriptor));
      let firedSessionType;
      const listener = store.add(service.onDidChangeCustomAgents((e) => firedSessionType = e.sessionType));
      store.add(listener);
      emitter.fire();
      assert.strictEqual(firedSessionType, harnessId);
    });
    test("adds harness to available list", () => {
      const service = createService();
      assert.strictEqual(service.availableHarnesses.get().length, 1);
      const emitter = new Emitter();
      store.add(emitter);
      const externalDescriptor = {
        id: "test-ext",
        label: "Test Extension",
        icon: ThemeIcon.fromId("extensions"),
        itemProvider: {
          onDidChange: emitter.event,
          provideChatSessionCustomizations: async (_sessionResource, _token) => []
        }
      };
      const reg = service.registerExternalHarness(externalDescriptor);
      store.add(reg);
      assert.strictEqual(service.availableHarnesses.get().length, 2);
      assert.strictEqual(service.availableHarnesses.get()[1].id, "test-ext");
    });
    test("removes harness on dispose", () => {
      const service = createService();
      const emitter = new Emitter();
      store.add(emitter);
      const externalDescriptor = {
        id: "test-ext",
        label: "Test Extension",
        icon: ThemeIcon.fromId("extensions"),
        itemProvider: {
          onDidChange: emitter.event,
          provideChatSessionCustomizations: async (_sessionResource, _token) => []
        }
      };
      const reg = service.registerExternalHarness(externalDescriptor);
      assert.strictEqual(service.availableHarnesses.get().length, 2);
      reg.dispose();
      assert.strictEqual(service.availableHarnesses.get().length, 1);
    });
    test.skip("falls back to first harness when active external harness is removed", () => {
      const service = createService();
      const emitter = new Emitter();
      store.add(emitter);
      const externalDescriptor = {
        id: "test-ext",
        label: "Test Extension",
        icon: ThemeIcon.fromId("extensions"),
        itemProvider: {
          onDidChange: emitter.event,
          provideChatSessionCustomizations: async (_sessionResource, _token) => []
        }
      };
      const activeSessionResource = URI.parse("test-ext://session");
      const reg = service.registerExternalHarness(externalDescriptor);
      service.setActiveSession(activeSessionResource);
      assert.strictEqual(service.activeHarness.get(), "test-ext");
      reg.dispose();
      assert.strictEqual(service.activeHarness.get(), SessionType.Local);
    });
    test("allows switching to external harness", () => {
      const service = createService();
      const emitter = new Emitter();
      store.add(emitter);
      const externalDescriptor = {
        id: "test-ext",
        label: "Test Extension",
        icon: ThemeIcon.fromId("extensions"),
        itemProvider: {
          onDidChange: emitter.event,
          provideChatSessionCustomizations: async (_sessionResource, _token) => []
        }
      };
      const activeSessionResource = URI.parse("test-ext://session");
      store.add(service.registerExternalHarness(externalDescriptor));
      service.setActiveSession(activeSessionResource);
      assert.strictEqual(service.activeHarness.get(), "test-ext");
      const activeDescriptor = service.getActiveDescriptor();
      assert.strictEqual(activeDescriptor.id, "test-ext");
      assert.strictEqual(activeDescriptor.label, "Test Extension");
      assert.ok(activeDescriptor.itemProvider);
    });
    test("external harness provides storage filter", () => {
      const service = createService();
      const emitter = new Emitter();
      store.add(emitter);
      const externalDescriptor = {
        id: "test-ext",
        label: "Test Extension",
        icon: ThemeIcon.fromId("extensions"),
        itemProvider: {
          onDidChange: emitter.event,
          provideChatSessionCustomizations: async (_sessionResource, _token) => []
        }
      };
      const activeSessionResource = URI.parse("test-ext://session");
      store.add(service.registerExternalHarness(externalDescriptor));
      service.setActiveSession(activeSessionResource);
    });
    test("external harness item provider returns items", async () => {
      const service = createService();
      const emitter = new Emitter();
      store.add(emitter);
      const testItems = [
        { uri: URI.parse("file:///workspace/.claude/SKILL.md"), type: "skill", name: "Test Skill", description: "A test skill", source: "local", extensionId: void 0, pluginUri: void 0, userInvocable: void 0 }
      ];
      const itemProvider = {
        onDidChange: emitter.event,
        provideChatSessionCustomizations: async () => testItems
      };
      const externalDescriptor = {
        id: "test-ext",
        label: "Test Extension",
        icon: ThemeIcon.fromId("extensions"),
        itemProvider
      };
      const activeSessionResource = URI.parse("test-ext://session");
      const testSessionResource = URI.parse("test-ext://session");
      store.add(service.registerExternalHarness(externalDescriptor));
      service.setActiveSession(activeSessionResource);
      const items = await service.getActiveDescriptor().itemProvider.provideChatSessionCustomizations(testSessionResource, CancellationToken.None);
      assert.strictEqual(items?.length, 1);
      assert.strictEqual(items[0].name, "Test Skill");
      assert.strictEqual(items[0].type, "skill");
    });
    test("external harness with same id as static harness replaces it", () => {
      const staticDescriptor = {
        id: "cli",
        label: "Copilot CLI (static)",
        icon: ThemeIcon.fromId("extensions")
      };
      const service = createService(
        createVSCodeHarnessDescriptor(),
        staticDescriptor
      );
      assert.strictEqual(service.availableHarnesses.get().length, 2);
      const emitter = new Emitter();
      store.add(emitter);
      const externalDescriptor = {
        id: "cli",
        label: "Copilot CLI (from API)",
        icon: ThemeIcon.fromId("extensions"),
        itemProvider: {
          onDidChange: emitter.event,
          provideChatSessionCustomizations: async (_sessionResource, _token) => []
        }
      };
      const reg = service.registerExternalHarness(externalDescriptor);
      store.add(reg);
      assert.strictEqual(service.availableHarnesses.get().length, 2);
      const cliHarness = service.availableHarnesses.get().find((h) => h.id === "cli");
      assert.strictEqual(cliHarness.label, "Copilot CLI (from API)");
    });
    test("static harness reappears when shadowing external harness is disposed", () => {
      const staticDescriptor = {
        id: "cli",
        label: "Copilot CLI (static)",
        icon: ThemeIcon.fromId("extensions")
      };
      const service = createService(
        createVSCodeHarnessDescriptor(),
        staticDescriptor
      );
      const emitter = new Emitter();
      store.add(emitter);
      const externalDescriptor = {
        id: "cli",
        label: "Copilot CLI (from API)",
        icon: ThemeIcon.fromId("extensions"),
        itemProvider: {
          onDidChange: emitter.event,
          provideChatSessionCustomizations: async (_sessionResource, _token) => []
        }
      };
      const reg = service.registerExternalHarness(externalDescriptor);
      reg.dispose();
      assert.strictEqual(service.availableHarnesses.get().length, 2);
      const cliHarness = service.availableHarnesses.get().find((h) => h.id === "cli");
      assert.strictEqual(cliHarness.label, "Copilot CLI (static)");
    });
    test("active harness stays when shadowing external harness is disposed (static restored)", () => {
      const staticDescriptor = {
        id: "cli",
        label: "Copilot CLI (static)",
        icon: ThemeIcon.fromId("extensions")
      };
      const service = createService(
        createVSCodeHarnessDescriptor(),
        staticDescriptor
      );
      const emitter = new Emitter();
      store.add(emitter);
      const externalDescriptor = {
        id: "cli",
        label: "Copilot CLI (from API)",
        icon: ThemeIcon.fromId("extensions"),
        itemProvider: {
          onDidChange: emitter.event,
          provideChatSessionCustomizations: async (_sessionResource, _token) => []
        }
      };
      const sessionResource = URI.parse("cli://session");
      const reg = service.registerExternalHarness(externalDescriptor);
      service.setActiveSession(sessionResource);
      assert.strictEqual(service.activeHarness.get(), "cli");
      reg.dispose();
      assert.strictEqual(service.activeHarness.get(), "cli");
    });
  });
  suite("getSlashCommands", () => {
    test("uses the active harness provider for prompt and skill items", async () => {
      const testSessionType = "test-session-type";
      const testSessionResource = URI.parse("test-session-type://session");
      const emitter = new Emitter();
      store.add(emitter);
      const service = createService({
        id: testSessionType,
        label: "Test Extension",
        icon: ThemeIcon.fromId("extensions"),
        itemProvider: {
          onDidChange: emitter.event,
          provideChatSessionCustomizations: async (_sessionResource, _token) => [
            { uri: URI.parse("file:///workspace/.test/prompts/fix.prompt.md"), type: PromptsType.prompt, source: "local", name: "fix", description: "Fix something", extensionId: void 0, pluginUri: void 0, userInvocable: void 0 },
            { uri: URI.parse("file:///workspace/.test/skills/lint/SKILL.md"), type: PromptsType.skill, source: "local", name: "lint", description: "Lint skill", extensionId: void 0, pluginUri: void 0, userInvocable: void 0 },
            { uri: URI.parse("file:///workspace/.test/instructions/rule.instructions.md"), type: PromptsType.instructions, source: "local", name: "rule", description: "Ignore me", extensionId: void 0, pluginUri: void 0, userInvocable: void 0 },
            { uri: URI.parse("file:///workspace/.test/skills/disabled/SKILL.md"), type: PromptsType.skill, source: "local", name: "disabled", enabled: false, extensionId: void 0, pluginUri: void 0, userInvocable: void 0 }
          ]
        }
      });
      const commands = await service.getSlashCommands(testSessionResource, CancellationToken.None);
      assert.deepStrictEqual(commands.map((command) => ({ name: command.name, type: command.type })), [
        { name: "fix", type: PromptsType.prompt },
        { name: "lint", type: PromptsType.skill }
      ]);
    });
    test("uses plugin label for plugin-scoped commands when provider plugin URI is a pinned SHA path", async () => {
      const testSessionType = "test-session-type";
      const testSessionResource = URI.parse("test-session-type://session");
      const pluginUri = URI.parse("file:///cache/agentPlugins/github/datadog/sha_b003fcad48c3a935ffe04b6218f5cf58fe2b6760");
      const emitter = new Emitter();
      store.add(emitter);
      const service = createService({
        id: testSessionType,
        label: "Test Extension",
        icon: ThemeIcon.fromId("extensions"),
        itemProvider: {
          onDidChange: emitter.event,
          provideChatSessionCustomizations: async (_sessionResource, _token) => [
            { uri: URI.joinPath(pluginUri, "skills", "ddsetup", "SKILL.md"), type: PromptsType.skill, source: "plugin", name: "ddsetup", description: "Set up Datadog", extensionId: void 0, pluginUri, pluginLabel: "datadog", userInvocable: void 0 }
          ]
        }
      });
      const commands = await service.getSlashCommands(testSessionResource, CancellationToken.None);
      assert.deepStrictEqual(commands.map((command) => ({ name: command.name, description: command.description, type: command.type })), [
        { name: "datadog:ddsetup", description: "Set up Datadog", type: PromptsType.skill }
      ]);
    });
    test("falls back to promptsService when the active harness has no provider", async () => {
      const testSessionType = "test-session-type";
      const testSessionResource = URI.parse("test-session-type://session");
      const otherSessionResource = URI.parse("other-session-type://session");
      const promptsService = new class extends MockPromptsService {
        async getPromptSlashCommands() {
          return [
            { uri: URI.parse("file:///workspace/.github/prompts/explain.prompt.md"), name: "explain", type: PromptsType.prompt, storage: PromptsStorage.local, userInvocable: false, sessionTypes: [testSessionType] },
            { uri: URI.parse("file:///workspace/.github/skills/review/SKILL.md"), name: "review", type: PromptsType.skill, storage: PromptsStorage.user, userInvocable: true }
          ];
        }
        isValidSlashCommandName() {
          return true;
        }
      }();
      const service = new CustomizationHarnessServiceBase([createVSCodeHarnessDescriptor()], SessionType.Local, promptsService);
      store.add(service);
      {
        const commands = await service.getSlashCommands(testSessionResource, CancellationToken.None);
        assert.deepStrictEqual(commands.map((command) => ({ name: command.name, type: command.type, userInvocable: command.userInvocable, sessionTypes: command.sessionTypes })), [
          { name: "explain", type: PromptsType.prompt, userInvocable: false, sessionTypes: [testSessionType] },
          { name: "review", type: PromptsType.skill, userInvocable: true, sessionTypes: void 0 }
        ]);
      }
      {
        const commands = await service.getSlashCommands(otherSessionResource, CancellationToken.None);
        assert.deepStrictEqual(commands.map((command) => ({ name: command.name, type: command.type, userInvocable: command.userInvocable, sessionTypes: command.sessionTypes })), [
          { name: "review", type: PromptsType.skill, userInvocable: true, sessionTypes: void 0 }
        ]);
      }
    });
  });
  suite("getCustomAgents", () => {
    const createAgent = (name, path, sessionTypes, enabled) => {
      const uri = URI.parse(path);
      return {
        id: uri.toString(),
        uri,
        name,
        target: Target.GitHubCopilot,
        visibility: { userInvocable: true, agentInvocable: true },
        agentInstructions: { content: "", toolReferences: [] },
        source: { storage: PromptsStorage.local },
        sessionTypes,
        enabled
      };
    };
    test("falls back to promptsService and filters by session type", async () => {
      const promptsService = new MockPromptsService();
      promptsService.setCustomModes([
        createAgent("matching", "file:///workspace/.github/agents/matching.agent.md", [testSessionType1], true),
        createAgent("global", "file:///workspace/.github/agents/global.agent.md", void 0, true),
        createAgent("other", "file:///workspace/.github/agents/other.agent.md", ["other-session"], true)
      ]);
      const service = new CustomizationHarnessServiceBase([createVSCodeHarnessDescriptor()], SessionType.Local, promptsService);
      store.add(service);
      const agents = await service.getCustomAgents(testSessionResource1, CancellationToken.None);
      assert.deepStrictEqual(agents.map((agent) => agent.name), ["matching", "global"]);
    });
    test("uses provider item URIs to scope resolved custom agents", async () => {
      const promptsService = new MockPromptsService();
      promptsService.setCustomModes([
        createAgent("selected", "file:///workspace/.test/agents/selected.agent.md", void 0, true),
        createAgent("not-selected", "file:///workspace/.test/agents/not-selected.agent.md", void 0, false)
      ]);
      const emitter = new Emitter();
      store.add(emitter);
      const service = new CustomizationHarnessServiceBase([{
        id: testSessionType1,
        label: "Test Extension",
        icon: ThemeIcon.fromId("extensions"),
        itemProvider: {
          onDidChange: emitter.event,
          provideChatSessionCustomizations: async (_sessionResource, _token) => [
            { uri: URI.parse("file:///workspace/.test/agents/enabled.agent.md"), type: PromptsType.agent, source: "local", name: "enabled", enabled: true, extensionId: void 0, pluginUri: void 0, userInvocable: void 0 },
            { uri: URI.parse("file:///workspace/.test/agents/disabled.agent.md"), type: PromptsType.agent, source: "local", name: "disabled", enabled: false, extensionId: void 0, pluginUri: void 0, userInvocable: void 0 }
          ]
        }
      }], testSessionType1, promptsService);
      store.add(service);
      {
        const agents = await service.getCustomAgents(testSessionResource1, CancellationToken.None);
        assert.deepStrictEqual(agents.map((agent) => [agent.name, agent.enabled]), [["enabled", true], ["disabled", false]]);
      }
      {
        const agents = await service.getCustomAgents(testSessionResource2, CancellationToken.None);
        assert.deepStrictEqual(agents.map((agent) => [agent.name, agent.enabled]), [["selected", true], ["not-selected", false]]);
      }
    });
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXGNoYXRcXHRlc3RcXGNvbW1vblxcY3VzdG9taXphdGlvbkhhcm5lc3NTZXJ2aWNlLnRlc3QudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgYXNzZXJ0IGZyb20gJ2Fzc2VydCc7XG5pbXBvcnQgeyBFbWl0dGVyIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vZXZlbnQuanMnO1xuaW1wb3J0IHsgVVJJIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdXJpLmpzJztcbmltcG9ydCB7IFRoZW1lSWNvbiB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3RoZW1hYmxlcy5qcyc7XG5pbXBvcnQgeyBlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL3Rlc3QvY29tbW9uL3V0aWxzLmpzJztcbmltcG9ydCB7IEN1c3RvbWl6YXRpb25IYXJuZXNzU2VydmljZUJhc2UsIGNyZWF0ZVZTQ29kZUhhcm5lc3NEZXNjcmlwdG9yLCBJQ3VzdG9taXphdGlvbkl0ZW1Qcm92aWRlciwgSUhhcm5lc3NEZXNjcmlwdG9yLCBJQ3VzdG9taXphdGlvbkl0ZW0gfSBmcm9tICcuLi8uLi9jb21tb24vY3VzdG9taXphdGlvbkhhcm5lc3NTZXJ2aWNlLmpzJztcbmltcG9ydCB7IFByb21wdHNUeXBlLCBUYXJnZXQgfSBmcm9tICcuLi8uLi9jb21tb24vcHJvbXB0U3ludGF4L3Byb21wdFR5cGVzLmpzJztcbmltcG9ydCB7IElDdXN0b21BZ2VudCwgSVByb21wdHNTZXJ2aWNlLCBQcm9tcHRzU3RvcmFnZSB9IGZyb20gJy4uLy4uL2NvbW1vbi9wcm9tcHRTeW50YXgvc2VydmljZS9wcm9tcHRzU2VydmljZS5qcyc7XG5pbXBvcnQgeyBDYW5jZWxsYXRpb25Ub2tlbiB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2NhbmNlbGxhdGlvbi5qcyc7XG5pbXBvcnQgeyBTZXNzaW9uVHlwZSB9IGZyb20gJy4uLy4uL2NvbW1vbi9jaGF0U2Vzc2lvbnNTZXJ2aWNlLmpzJztcbmltcG9ydCB7IE1vY2tQcm9tcHRzU2VydmljZSB9IGZyb20gJy4vcHJvbXB0U3ludGF4L3NlcnZpY2UvbW9ja1Byb21wdHNTZXJ2aWNlLmpzJztcblxuc3VpdGUoJ0N1c3RvbWl6YXRpb25IYXJuZXNzU2VydmljZScsICgpID0+IHtcblx0Y29uc3Qgc3RvcmUgPSBlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUoKTtcblxuXHRmdW5jdGlvbiBjcmVhdGVTZXJ2aWNlKC4uLmhhcm5lc3NlczogSUhhcm5lc3NEZXNjcmlwdG9yW10pOiBDdXN0b21pemF0aW9uSGFybmVzc1NlcnZpY2VCYXNlIHtcblx0XHRpZiAoaGFybmVzc2VzLmxlbmd0aCA9PT0gMCkge1xuXHRcdFx0aGFybmVzc2VzID0gW2NyZWF0ZVZTQ29kZUhhcm5lc3NEZXNjcmlwdG9yKCldO1xuXHRcdH1cblx0XHRjb25zdCBwcm9tcHRzU2VydmljZTogSVByb21wdHNTZXJ2aWNlID0gbmV3IE1vY2tQcm9tcHRzU2VydmljZSgpO1xuXHRcdGNvbnN0IHNlcnZpY2UgPSBuZXcgQ3VzdG9taXphdGlvbkhhcm5lc3NTZXJ2aWNlQmFzZShoYXJuZXNzZXMsIGhhcm5lc3Nlc1swXS5pZCwgcHJvbXB0c1NlcnZpY2UpO1xuXHRcdHN0b3JlLmFkZChzZXJ2aWNlKTtcblx0XHRyZXR1cm4gc2VydmljZTtcblx0fVxuXG5cdGNvbnN0IHRlc3RTZXNzaW9uVHlwZTEgPSAndGVzdC1zZXNzaW9uLXR5cGUxJztcblx0Ly9jb25zdCB0ZXN0U2Vzc2lvblR5cGUyID0gJ3Rlc3Qtc2Vzc2lvbi10eXBlMic7XG5cdGNvbnN0IHRlc3RTZXNzaW9uUmVzb3VyY2UxID0gVVJJLnBhcnNlKCd0ZXN0LXNlc3Npb24tdHlwZTE6Ly9zZXNzaW9uMScpO1xuXHRjb25zdCB0ZXN0U2Vzc2lvblJlc291cmNlMiA9IFVSSS5wYXJzZSgndGVzdC1zZXNzaW9uLXR5cGUyOi8vc2Vzc2lvbjInKTtcblxuXHRzdWl0ZSgncmVnaXN0ZXJFeHRlcm5hbEhhcm5lc3MnLCAoKSA9PiB7XG5cblxuXG5cdFx0dGVzdCgnZm9yd2FyZHMgaXRlbSBwcm92aWRlciBjaGFuZ2VzIHZpYSBvbkRpZENoYW5nZVNsYXNoQ29tbWFuZHMgd2l0aCBzZXNzaW9uVHlwZScsICgpID0+IHtcblx0XHRcdGNvbnN0IHNlcnZpY2UgPSBjcmVhdGVTZXJ2aWNlKCk7XG5cdFx0XHRjb25zdCBlbWl0dGVyID0gbmV3IEVtaXR0ZXI8dm9pZD4oKTtcblx0XHRcdHN0b3JlLmFkZChlbWl0dGVyKTtcblx0XHRcdGNvbnN0IGhhcm5lc3NJZCA9ICd0ZXN0LWhhcm5lc3MnO1xuXHRcdFx0Y29uc3QgZXh0ZXJuYWxEZXNjcmlwdG9yOiBJSGFybmVzc0Rlc2NyaXB0b3IgPSB7XG5cdFx0XHRcdGlkOiBoYXJuZXNzSWQsXG5cdFx0XHRcdGxhYmVsOiAnVGVzdCBIYXJuZXNzJyxcblx0XHRcdFx0aWNvbjogVGhlbWVJY29uLmZyb21JZCgnZXh0ZW5zaW9ucycpLFxuXHRcdFx0XHRpdGVtUHJvdmlkZXI6IHtcblx0XHRcdFx0XHRvbkRpZENoYW5nZTogZW1pdHRlci5ldmVudCxcblx0XHRcdFx0XHRwcm92aWRlQ2hhdFNlc3Npb25DdXN0b21pemF0aW9uczogYXN5bmMgKF9zZXNzaW9uUmVzb3VyY2U6IFVSSSwgX3Rva2VuOiBDYW5jZWxsYXRpb25Ub2tlbikgPT4gW10sXG5cdFx0XHRcdH0sXG5cdFx0XHR9O1xuXG5cdFx0XHRzdG9yZS5hZGQoc2VydmljZS5yZWdpc3RlckV4dGVybmFsSGFybmVzcyhleHRlcm5hbERlc2NyaXB0b3IpKTtcblxuXHRcdFx0bGV0IGZpcmVkU2Vzc2lvblR5cGU6IHN0cmluZyB8IHVuZGVmaW5lZDtcblx0XHRcdGNvbnN0IGxpc3RlbmVyID0gc3RvcmUuYWRkKHNlcnZpY2Uub25EaWRDaGFuZ2VTbGFzaENvbW1hbmRzKGUgPT4gZmlyZWRTZXNzaW9uVHlwZSA9IGUuc2Vzc2lvblR5cGUpKTtcblx0XHRcdHN0b3JlLmFkZChsaXN0ZW5lcik7XG5cblx0XHRcdGVtaXR0ZXIuZmlyZSgpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGZpcmVkU2Vzc2lvblR5cGUsIGhhcm5lc3NJZCk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdmb3J3YXJkcyBpdGVtIHByb3ZpZGVyIGNoYW5nZXMgdmlhIG9uRGlkQ2hhbmdlQ3VzdG9tQWdlbnRzIHdpdGggc2Vzc2lvblR5cGUnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBzZXJ2aWNlID0gY3JlYXRlU2VydmljZSgpO1xuXHRcdFx0Y29uc3QgZW1pdHRlciA9IG5ldyBFbWl0dGVyPHZvaWQ+KCk7XG5cdFx0XHRzdG9yZS5hZGQoZW1pdHRlcik7XG5cdFx0XHRjb25zdCBoYXJuZXNzSWQgPSAndGVzdC1oYXJuZXNzJztcblx0XHRcdGNvbnN0IGV4dGVybmFsRGVzY3JpcHRvcjogSUhhcm5lc3NEZXNjcmlwdG9yID0ge1xuXHRcdFx0XHRpZDogaGFybmVzc0lkLFxuXHRcdFx0XHRsYWJlbDogJ1Rlc3QgSGFybmVzcycsXG5cdFx0XHRcdGljb246IFRoZW1lSWNvbi5mcm9tSWQoJ2V4dGVuc2lvbnMnKSxcblx0XHRcdFx0aXRlbVByb3ZpZGVyOiB7XG5cdFx0XHRcdFx0b25EaWRDaGFuZ2U6IGVtaXR0ZXIuZXZlbnQsXG5cdFx0XHRcdFx0cHJvdmlkZUNoYXRTZXNzaW9uQ3VzdG9taXphdGlvbnM6IGFzeW5jIChfc2Vzc2lvblJlc291cmNlOiBVUkksIF90b2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4pID0+IFtdLFxuXHRcdFx0XHR9LFxuXHRcdFx0fTtcblxuXHRcdFx0c3RvcmUuYWRkKHNlcnZpY2UucmVnaXN0ZXJFeHRlcm5hbEhhcm5lc3MoZXh0ZXJuYWxEZXNjcmlwdG9yKSk7XG5cblx0XHRcdGxldCBmaXJlZFNlc3Npb25UeXBlOiBzdHJpbmcgfCB1bmRlZmluZWQ7XG5cdFx0XHRjb25zdCBsaXN0ZW5lciA9IHN0b3JlLmFkZChzZXJ2aWNlLm9uRGlkQ2hhbmdlQ3VzdG9tQWdlbnRzKGUgPT4gZmlyZWRTZXNzaW9uVHlwZSA9IGUuc2Vzc2lvblR5cGUpKTtcblx0XHRcdHN0b3JlLmFkZChsaXN0ZW5lcik7XG5cblx0XHRcdGVtaXR0ZXIuZmlyZSgpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGZpcmVkU2Vzc2lvblR5cGUsIGhhcm5lc3NJZCk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdhZGRzIGhhcm5lc3MgdG8gYXZhaWxhYmxlIGxpc3QnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBzZXJ2aWNlID0gY3JlYXRlU2VydmljZSgpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNlcnZpY2UuYXZhaWxhYmxlSGFybmVzc2VzLmdldCgpLmxlbmd0aCwgMSk7XG5cblx0XHRcdGNvbnN0IGVtaXR0ZXIgPSBuZXcgRW1pdHRlcjx2b2lkPigpO1xuXHRcdFx0c3RvcmUuYWRkKGVtaXR0ZXIpO1xuXHRcdFx0Y29uc3QgZXh0ZXJuYWxEZXNjcmlwdG9yOiBJSGFybmVzc0Rlc2NyaXB0b3IgPSB7XG5cdFx0XHRcdGlkOiAndGVzdC1leHQnLFxuXHRcdFx0XHRsYWJlbDogJ1Rlc3QgRXh0ZW5zaW9uJyxcblx0XHRcdFx0aWNvbjogVGhlbWVJY29uLmZyb21JZCgnZXh0ZW5zaW9ucycpLFxuXHRcdFx0XHRpdGVtUHJvdmlkZXI6IHtcblx0XHRcdFx0XHRvbkRpZENoYW5nZTogZW1pdHRlci5ldmVudCxcblx0XHRcdFx0XHRwcm92aWRlQ2hhdFNlc3Npb25DdXN0b21pemF0aW9uczogYXN5bmMgKF9zZXNzaW9uUmVzb3VyY2U6IFVSSSwgX3Rva2VuOiBDYW5jZWxsYXRpb25Ub2tlbikgPT4gW10sXG5cdFx0XHRcdH0sXG5cdFx0XHR9O1xuXG5cdFx0XHRjb25zdCByZWcgPSBzZXJ2aWNlLnJlZ2lzdGVyRXh0ZXJuYWxIYXJuZXNzKGV4dGVybmFsRGVzY3JpcHRvcik7XG5cdFx0XHRzdG9yZS5hZGQocmVnKTtcblxuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNlcnZpY2UuYXZhaWxhYmxlSGFybmVzc2VzLmdldCgpLmxlbmd0aCwgMik7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2VydmljZS5hdmFpbGFibGVIYXJuZXNzZXMuZ2V0KClbMV0uaWQsICd0ZXN0LWV4dCcpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgncmVtb3ZlcyBoYXJuZXNzIG9uIGRpc3Bvc2UnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBzZXJ2aWNlID0gY3JlYXRlU2VydmljZSgpO1xuXHRcdFx0Y29uc3QgZW1pdHRlciA9IG5ldyBFbWl0dGVyPHZvaWQ+KCk7XG5cdFx0XHRzdG9yZS5hZGQoZW1pdHRlcik7XG5cdFx0XHRjb25zdCBleHRlcm5hbERlc2NyaXB0b3I6IElIYXJuZXNzRGVzY3JpcHRvciA9IHtcblx0XHRcdFx0aWQ6ICd0ZXN0LWV4dCcsXG5cdFx0XHRcdGxhYmVsOiAnVGVzdCBFeHRlbnNpb24nLFxuXHRcdFx0XHRpY29uOiBUaGVtZUljb24uZnJvbUlkKCdleHRlbnNpb25zJyksXG5cdFx0XHRcdGl0ZW1Qcm92aWRlcjoge1xuXHRcdFx0XHRcdG9uRGlkQ2hhbmdlOiBlbWl0dGVyLmV2ZW50LFxuXHRcdFx0XHRcdHByb3ZpZGVDaGF0U2Vzc2lvbkN1c3RvbWl6YXRpb25zOiBhc3luYyAoX3Nlc3Npb25SZXNvdXJjZTogVVJJLCBfdG9rZW46IENhbmNlbGxhdGlvblRva2VuKSA9PiBbXSxcblx0XHRcdFx0fSxcblx0XHRcdH07XG5cblx0XHRcdGNvbnN0IHJlZyA9IHNlcnZpY2UucmVnaXN0ZXJFeHRlcm5hbEhhcm5lc3MoZXh0ZXJuYWxEZXNjcmlwdG9yKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChzZXJ2aWNlLmF2YWlsYWJsZUhhcm5lc3Nlcy5nZXQoKS5sZW5ndGgsIDIpO1xuXG5cdFx0XHRyZWcuZGlzcG9zZSgpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNlcnZpY2UuYXZhaWxhYmxlSGFybmVzc2VzLmdldCgpLmxlbmd0aCwgMSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0LnNraXAoJ2ZhbGxzIGJhY2sgdG8gZmlyc3QgaGFybmVzcyB3aGVuIGFjdGl2ZSBleHRlcm5hbCBoYXJuZXNzIGlzIHJlbW92ZWQnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBzZXJ2aWNlID0gY3JlYXRlU2VydmljZSgpO1xuXHRcdFx0Y29uc3QgZW1pdHRlciA9IG5ldyBFbWl0dGVyPHZvaWQ+KCk7XG5cdFx0XHRzdG9yZS5hZGQoZW1pdHRlcik7XG5cdFx0XHRjb25zdCBleHRlcm5hbERlc2NyaXB0b3I6IElIYXJuZXNzRGVzY3JpcHRvciA9IHtcblx0XHRcdFx0aWQ6ICd0ZXN0LWV4dCcsXG5cdFx0XHRcdGxhYmVsOiAnVGVzdCBFeHRlbnNpb24nLFxuXHRcdFx0XHRpY29uOiBUaGVtZUljb24uZnJvbUlkKCdleHRlbnNpb25zJyksXG5cdFx0XHRcdGl0ZW1Qcm92aWRlcjoge1xuXHRcdFx0XHRcdG9uRGlkQ2hhbmdlOiBlbWl0dGVyLmV2ZW50LFxuXHRcdFx0XHRcdHByb3ZpZGVDaGF0U2Vzc2lvbkN1c3RvbWl6YXRpb25zOiBhc3luYyAoX3Nlc3Npb25SZXNvdXJjZTogVVJJLCBfdG9rZW46IENhbmNlbGxhdGlvblRva2VuKSA9PiBbXSxcblx0XHRcdFx0fSxcblx0XHRcdH07XG5cdFx0XHRjb25zdCBhY3RpdmVTZXNzaW9uUmVzb3VyY2UgPSBVUkkucGFyc2UoJ3Rlc3QtZXh0Oi8vc2Vzc2lvbicpO1xuXG5cdFx0XHRjb25zdCByZWcgPSBzZXJ2aWNlLnJlZ2lzdGVyRXh0ZXJuYWxIYXJuZXNzKGV4dGVybmFsRGVzY3JpcHRvcik7XG5cdFx0XHRzZXJ2aWNlLnNldEFjdGl2ZVNlc3Npb24oYWN0aXZlU2Vzc2lvblJlc291cmNlKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChzZXJ2aWNlLmFjdGl2ZUhhcm5lc3MuZ2V0KCksICd0ZXN0LWV4dCcpO1xuXG5cdFx0XHRyZWcuZGlzcG9zZSgpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNlcnZpY2UuYWN0aXZlSGFybmVzcy5nZXQoKSwgU2Vzc2lvblR5cGUuTG9jYWwpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnYWxsb3dzIHN3aXRjaGluZyB0byBleHRlcm5hbCBoYXJuZXNzJywgKCkgPT4ge1xuXHRcdFx0Y29uc3Qgc2VydmljZSA9IGNyZWF0ZVNlcnZpY2UoKTtcblx0XHRcdGNvbnN0IGVtaXR0ZXIgPSBuZXcgRW1pdHRlcjx2b2lkPigpO1xuXHRcdFx0c3RvcmUuYWRkKGVtaXR0ZXIpO1xuXHRcdFx0Y29uc3QgZXh0ZXJuYWxEZXNjcmlwdG9yOiBJSGFybmVzc0Rlc2NyaXB0b3IgPSB7XG5cdFx0XHRcdGlkOiAndGVzdC1leHQnLFxuXHRcdFx0XHRsYWJlbDogJ1Rlc3QgRXh0ZW5zaW9uJyxcblx0XHRcdFx0aWNvbjogVGhlbWVJY29uLmZyb21JZCgnZXh0ZW5zaW9ucycpLFxuXHRcdFx0XHRpdGVtUHJvdmlkZXI6IHtcblx0XHRcdFx0XHRvbkRpZENoYW5nZTogZW1pdHRlci5ldmVudCxcblx0XHRcdFx0XHRwcm92aWRlQ2hhdFNlc3Npb25DdXN0b21pemF0aW9uczogYXN5bmMgKF9zZXNzaW9uUmVzb3VyY2U6IFVSSSwgX3Rva2VuOiBDYW5jZWxsYXRpb25Ub2tlbikgPT4gW10sXG5cdFx0XHRcdH0sXG5cdFx0XHR9O1xuXHRcdFx0Y29uc3QgYWN0aXZlU2Vzc2lvblJlc291cmNlID0gVVJJLnBhcnNlKCd0ZXN0LWV4dDovL3Nlc3Npb24nKTtcblxuXHRcdFx0c3RvcmUuYWRkKHNlcnZpY2UucmVnaXN0ZXJFeHRlcm5hbEhhcm5lc3MoZXh0ZXJuYWxEZXNjcmlwdG9yKSk7XG5cdFx0XHRzZXJ2aWNlLnNldEFjdGl2ZVNlc3Npb24oYWN0aXZlU2Vzc2lvblJlc291cmNlKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChzZXJ2aWNlLmFjdGl2ZUhhcm5lc3MuZ2V0KCksICd0ZXN0LWV4dCcpO1xuXG5cdFx0XHRjb25zdCBhY3RpdmVEZXNjcmlwdG9yID0gc2VydmljZS5nZXRBY3RpdmVEZXNjcmlwdG9yKCk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYWN0aXZlRGVzY3JpcHRvci5pZCwgJ3Rlc3QtZXh0Jyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYWN0aXZlRGVzY3JpcHRvci5sYWJlbCwgJ1Rlc3QgRXh0ZW5zaW9uJyk7XG5cdFx0XHRhc3NlcnQub2soYWN0aXZlRGVzY3JpcHRvci5pdGVtUHJvdmlkZXIpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnZXh0ZXJuYWwgaGFybmVzcyBwcm92aWRlcyBzdG9yYWdlIGZpbHRlcicsICgpID0+IHtcblx0XHRcdGNvbnN0IHNlcnZpY2UgPSBjcmVhdGVTZXJ2aWNlKCk7XG5cdFx0XHRjb25zdCBlbWl0dGVyID0gbmV3IEVtaXR0ZXI8dm9pZD4oKTtcblx0XHRcdHN0b3JlLmFkZChlbWl0dGVyKTtcblx0XHRcdGNvbnN0IGV4dGVybmFsRGVzY3JpcHRvcjogSUhhcm5lc3NEZXNjcmlwdG9yID0ge1xuXHRcdFx0XHRpZDogJ3Rlc3QtZXh0Jyxcblx0XHRcdFx0bGFiZWw6ICdUZXN0IEV4dGVuc2lvbicsXG5cdFx0XHRcdGljb246IFRoZW1lSWNvbi5mcm9tSWQoJ2V4dGVuc2lvbnMnKSxcblx0XHRcdFx0aXRlbVByb3ZpZGVyOiB7XG5cdFx0XHRcdFx0b25EaWRDaGFuZ2U6IGVtaXR0ZXIuZXZlbnQsXG5cdFx0XHRcdFx0cHJvdmlkZUNoYXRTZXNzaW9uQ3VzdG9taXphdGlvbnM6IGFzeW5jIChfc2Vzc2lvblJlc291cmNlOiBVUkksIF90b2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4pID0+IFtdLFxuXHRcdFx0XHR9LFxuXHRcdFx0fTtcblx0XHRcdGNvbnN0IGFjdGl2ZVNlc3Npb25SZXNvdXJjZSA9IFVSSS5wYXJzZSgndGVzdC1leHQ6Ly9zZXNzaW9uJyk7XG5cblx0XHRcdHN0b3JlLmFkZChzZXJ2aWNlLnJlZ2lzdGVyRXh0ZXJuYWxIYXJuZXNzKGV4dGVybmFsRGVzY3JpcHRvcikpO1xuXHRcdFx0c2VydmljZS5zZXRBY3RpdmVTZXNzaW9uKGFjdGl2ZVNlc3Npb25SZXNvdXJjZSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdleHRlcm5hbCBoYXJuZXNzIGl0ZW0gcHJvdmlkZXIgcmV0dXJucyBpdGVtcycsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IHNlcnZpY2UgPSBjcmVhdGVTZXJ2aWNlKCk7XG5cdFx0XHRjb25zdCBlbWl0dGVyID0gbmV3IEVtaXR0ZXI8dm9pZD4oKTtcblx0XHRcdHN0b3JlLmFkZChlbWl0dGVyKTtcblx0XHRcdGNvbnN0IHRlc3RJdGVtcyA9IFtcblx0XHRcdFx0eyB1cmk6IFVSSS5wYXJzZSgnZmlsZTovLy93b3Jrc3BhY2UvLmNsYXVkZS9TS0lMTC5tZCcpLCB0eXBlOiAnc2tpbGwnLCBuYW1lOiAnVGVzdCBTa2lsbCcsIGRlc2NyaXB0aW9uOiAnQSB0ZXN0IHNraWxsJywgc291cmNlOiAnbG9jYWwnLCBleHRlbnNpb25JZDogdW5kZWZpbmVkLCBwbHVnaW5Vcmk6IHVuZGVmaW5lZCwgdXNlckludm9jYWJsZTogdW5kZWZpbmVkIH0gc2F0aXNmaWVzIElDdXN0b21pemF0aW9uSXRlbSxcblx0XHRcdF07XG5cblx0XHRcdGNvbnN0IGl0ZW1Qcm92aWRlcjogSUN1c3RvbWl6YXRpb25JdGVtUHJvdmlkZXIgPSB7XG5cdFx0XHRcdG9uRGlkQ2hhbmdlOiBlbWl0dGVyLmV2ZW50LFxuXHRcdFx0XHRwcm92aWRlQ2hhdFNlc3Npb25DdXN0b21pemF0aW9uczogYXN5bmMgKCkgPT4gdGVzdEl0ZW1zLFxuXHRcdFx0fTtcblxuXHRcdFx0Y29uc3QgZXh0ZXJuYWxEZXNjcmlwdG9yOiBJSGFybmVzc0Rlc2NyaXB0b3IgPSB7XG5cdFx0XHRcdGlkOiAndGVzdC1leHQnLFxuXHRcdFx0XHRsYWJlbDogJ1Rlc3QgRXh0ZW5zaW9uJyxcblx0XHRcdFx0aWNvbjogVGhlbWVJY29uLmZyb21JZCgnZXh0ZW5zaW9ucycpLFxuXHRcdFx0XHRpdGVtUHJvdmlkZXIsXG5cdFx0XHR9O1xuXHRcdFx0Y29uc3QgYWN0aXZlU2Vzc2lvblJlc291cmNlID0gVVJJLnBhcnNlKCd0ZXN0LWV4dDovL3Nlc3Npb24nKTtcblxuXHRcdFx0Y29uc3QgdGVzdFNlc3Npb25SZXNvdXJjZSA9IFVSSS5wYXJzZSgndGVzdC1leHQ6Ly9zZXNzaW9uJyk7XG5cblx0XHRcdHN0b3JlLmFkZChzZXJ2aWNlLnJlZ2lzdGVyRXh0ZXJuYWxIYXJuZXNzKGV4dGVybmFsRGVzY3JpcHRvcikpO1xuXHRcdFx0c2VydmljZS5zZXRBY3RpdmVTZXNzaW9uKGFjdGl2ZVNlc3Npb25SZXNvdXJjZSk7XG5cblx0XHRcdGNvbnN0IGl0ZW1zID0gYXdhaXQgc2VydmljZS5nZXRBY3RpdmVEZXNjcmlwdG9yKCkuaXRlbVByb3ZpZGVyIS5wcm92aWRlQ2hhdFNlc3Npb25DdXN0b21pemF0aW9ucyh0ZXN0U2Vzc2lvblJlc291cmNlLCBDYW5jZWxsYXRpb25Ub2tlbi5Ob25lKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChpdGVtcz8ubGVuZ3RoLCAxKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChpdGVtcyFbMF0ubmFtZSwgJ1Rlc3QgU2tpbGwnKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChpdGVtcyFbMF0udHlwZSwgJ3NraWxsJyk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdleHRlcm5hbCBoYXJuZXNzIHdpdGggc2FtZSBpZCBhcyBzdGF0aWMgaGFybmVzcyByZXBsYWNlcyBpdCcsICgpID0+IHtcblx0XHRcdGNvbnN0IHN0YXRpY0Rlc2NyaXB0b3I6IElIYXJuZXNzRGVzY3JpcHRvciA9IHtcblx0XHRcdFx0aWQ6ICdjbGknLFxuXHRcdFx0XHRsYWJlbDogJ0NvcGlsb3QgQ0xJIChzdGF0aWMpJyxcblx0XHRcdFx0aWNvbjogVGhlbWVJY29uLmZyb21JZCgnZXh0ZW5zaW9ucycpLFxuXHRcdFx0fTtcblx0XHRcdGNvbnN0IHNlcnZpY2UgPSBjcmVhdGVTZXJ2aWNlKFxuXHRcdFx0XHRjcmVhdGVWU0NvZGVIYXJuZXNzRGVzY3JpcHRvcigpLFxuXHRcdFx0XHRzdGF0aWNEZXNjcmlwdG9yLFxuXHRcdFx0KTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChzZXJ2aWNlLmF2YWlsYWJsZUhhcm5lc3Nlcy5nZXQoKS5sZW5ndGgsIDIpO1xuXG5cdFx0XHRjb25zdCBlbWl0dGVyID0gbmV3IEVtaXR0ZXI8dm9pZD4oKTtcblx0XHRcdHN0b3JlLmFkZChlbWl0dGVyKTtcblx0XHRcdGNvbnN0IGV4dGVybmFsRGVzY3JpcHRvcjogSUhhcm5lc3NEZXNjcmlwdG9yID0ge1xuXHRcdFx0XHRpZDogJ2NsaScsXG5cdFx0XHRcdGxhYmVsOiAnQ29waWxvdCBDTEkgKGZyb20gQVBJKScsXG5cdFx0XHRcdGljb246IFRoZW1lSWNvbi5mcm9tSWQoJ2V4dGVuc2lvbnMnKSxcblx0XHRcdFx0aXRlbVByb3ZpZGVyOiB7XG5cdFx0XHRcdFx0b25EaWRDaGFuZ2U6IGVtaXR0ZXIuZXZlbnQsXG5cdFx0XHRcdFx0cHJvdmlkZUNoYXRTZXNzaW9uQ3VzdG9taXphdGlvbnM6IGFzeW5jIChfc2Vzc2lvblJlc291cmNlOiBVUkksIF90b2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4pID0+IFtdLFxuXHRcdFx0XHR9LFxuXHRcdFx0fTtcblxuXHRcdFx0Y29uc3QgcmVnID0gc2VydmljZS5yZWdpc3RlckV4dGVybmFsSGFybmVzcyhleHRlcm5hbERlc2NyaXB0b3IpO1xuXHRcdFx0c3RvcmUuYWRkKHJlZyk7XG5cblx0XHRcdC8vIFNob3VsZCBzdGlsbCBiZSAyLCBub3QgMyBcdTIwMTQgdGhlIGV4dGVybmFsIHNoYWRvd3MgdGhlIHN0YXRpY1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNlcnZpY2UuYXZhaWxhYmxlSGFybmVzc2VzLmdldCgpLmxlbmd0aCwgMik7XG5cdFx0XHRjb25zdCBjbGlIYXJuZXNzID0gc2VydmljZS5hdmFpbGFibGVIYXJuZXNzZXMuZ2V0KCkuZmluZChoID0+IGguaWQgPT09ICdjbGknKSE7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY2xpSGFybmVzcy5sYWJlbCwgJ0NvcGlsb3QgQ0xJIChmcm9tIEFQSSknKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3N0YXRpYyBoYXJuZXNzIHJlYXBwZWFycyB3aGVuIHNoYWRvd2luZyBleHRlcm5hbCBoYXJuZXNzIGlzIGRpc3Bvc2VkJywgKCkgPT4ge1xuXHRcdFx0Y29uc3Qgc3RhdGljRGVzY3JpcHRvcjogSUhhcm5lc3NEZXNjcmlwdG9yID0ge1xuXHRcdFx0XHRpZDogJ2NsaScsXG5cdFx0XHRcdGxhYmVsOiAnQ29waWxvdCBDTEkgKHN0YXRpYyknLFxuXHRcdFx0XHRpY29uOiBUaGVtZUljb24uZnJvbUlkKCdleHRlbnNpb25zJyksXG5cdFx0XHR9O1xuXHRcdFx0Y29uc3Qgc2VydmljZSA9IGNyZWF0ZVNlcnZpY2UoXG5cdFx0XHRcdGNyZWF0ZVZTQ29kZUhhcm5lc3NEZXNjcmlwdG9yKCksXG5cdFx0XHRcdHN0YXRpY0Rlc2NyaXB0b3IsXG5cdFx0XHQpO1xuXG5cdFx0XHRjb25zdCBlbWl0dGVyID0gbmV3IEVtaXR0ZXI8dm9pZD4oKTtcblx0XHRcdHN0b3JlLmFkZChlbWl0dGVyKTtcblx0XHRcdGNvbnN0IGV4dGVybmFsRGVzY3JpcHRvcjogSUhhcm5lc3NEZXNjcmlwdG9yID0ge1xuXHRcdFx0XHRpZDogJ2NsaScsXG5cdFx0XHRcdGxhYmVsOiAnQ29waWxvdCBDTEkgKGZyb20gQVBJKScsXG5cdFx0XHRcdGljb246IFRoZW1lSWNvbi5mcm9tSWQoJ2V4dGVuc2lvbnMnKSxcblx0XHRcdFx0aXRlbVByb3ZpZGVyOiB7XG5cdFx0XHRcdFx0b25EaWRDaGFuZ2U6IGVtaXR0ZXIuZXZlbnQsXG5cdFx0XHRcdFx0cHJvdmlkZUNoYXRTZXNzaW9uQ3VzdG9taXphdGlvbnM6IGFzeW5jIChfc2Vzc2lvblJlc291cmNlOiBVUkksIF90b2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4pID0+IFtdLFxuXHRcdFx0XHR9LFxuXHRcdFx0fTtcblxuXHRcdFx0Y29uc3QgcmVnID0gc2VydmljZS5yZWdpc3RlckV4dGVybmFsSGFybmVzcyhleHRlcm5hbERlc2NyaXB0b3IpO1xuXHRcdFx0cmVnLmRpc3Bvc2UoKTtcblxuXHRcdFx0Ly8gU3RhdGljIGhhcm5lc3Mgc2hvdWxkIGJlIGJhY2tcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChzZXJ2aWNlLmF2YWlsYWJsZUhhcm5lc3Nlcy5nZXQoKS5sZW5ndGgsIDIpO1xuXHRcdFx0Y29uc3QgY2xpSGFybmVzcyA9IHNlcnZpY2UuYXZhaWxhYmxlSGFybmVzc2VzLmdldCgpLmZpbmQoaCA9PiBoLmlkID09PSAnY2xpJykhO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNsaUhhcm5lc3MubGFiZWwsICdDb3BpbG90IENMSSAoc3RhdGljKScpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnYWN0aXZlIGhhcm5lc3Mgc3RheXMgd2hlbiBzaGFkb3dpbmcgZXh0ZXJuYWwgaGFybmVzcyBpcyBkaXNwb3NlZCAoc3RhdGljIHJlc3RvcmVkKScsICgpID0+IHtcblx0XHRcdGNvbnN0IHN0YXRpY0Rlc2NyaXB0b3I6IElIYXJuZXNzRGVzY3JpcHRvciA9IHtcblx0XHRcdFx0aWQ6ICdjbGknLFxuXHRcdFx0XHRsYWJlbDogJ0NvcGlsb3QgQ0xJIChzdGF0aWMpJyxcblx0XHRcdFx0aWNvbjogVGhlbWVJY29uLmZyb21JZCgnZXh0ZW5zaW9ucycpLFxuXHRcdFx0fTtcblx0XHRcdGNvbnN0IHNlcnZpY2UgPSBjcmVhdGVTZXJ2aWNlKFxuXHRcdFx0XHRjcmVhdGVWU0NvZGVIYXJuZXNzRGVzY3JpcHRvcigpLFxuXHRcdFx0XHRzdGF0aWNEZXNjcmlwdG9yLFxuXHRcdFx0KTtcblxuXHRcdFx0Y29uc3QgZW1pdHRlciA9IG5ldyBFbWl0dGVyPHZvaWQ+KCk7XG5cdFx0XHRzdG9yZS5hZGQoZW1pdHRlcik7XG5cdFx0XHRjb25zdCBleHRlcm5hbERlc2NyaXB0b3I6IElIYXJuZXNzRGVzY3JpcHRvciA9IHtcblx0XHRcdFx0aWQ6ICdjbGknLFxuXHRcdFx0XHRsYWJlbDogJ0NvcGlsb3QgQ0xJIChmcm9tIEFQSSknLFxuXHRcdFx0XHRpY29uOiBUaGVtZUljb24uZnJvbUlkKCdleHRlbnNpb25zJyksXG5cdFx0XHRcdGl0ZW1Qcm92aWRlcjoge1xuXHRcdFx0XHRcdG9uRGlkQ2hhbmdlOiBlbWl0dGVyLmV2ZW50LFxuXHRcdFx0XHRcdHByb3ZpZGVDaGF0U2Vzc2lvbkN1c3RvbWl6YXRpb25zOiBhc3luYyAoX3Nlc3Npb25SZXNvdXJjZTogVVJJLCBfdG9rZW46IENhbmNlbGxhdGlvblRva2VuKSA9PiBbXSxcblx0XHRcdFx0fSxcblx0XHRcdH07XG5cdFx0XHRjb25zdCBzZXNzaW9uUmVzb3VyY2UgPSBVUkkucGFyc2UoJ2NsaTovL3Nlc3Npb24nKTtcblxuXHRcdFx0Y29uc3QgcmVnID0gc2VydmljZS5yZWdpc3RlckV4dGVybmFsSGFybmVzcyhleHRlcm5hbERlc2NyaXB0b3IpO1xuXHRcdFx0c2VydmljZS5zZXRBY3RpdmVTZXNzaW9uKHNlc3Npb25SZXNvdXJjZSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2VydmljZS5hY3RpdmVIYXJuZXNzLmdldCgpLCAnY2xpJyk7XG5cblx0XHRcdHJlZy5kaXNwb3NlKCk7XG5cblx0XHRcdC8vIEFjdGl2ZSBzdGF5cyBvbiAnY2xpJyBiZWNhdXNlIHRoZSBzdGF0aWMgaGFybmVzcyB3aXRoIHRoZSBzYW1lIGlkIGlzIHJlc3RvcmVkXG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2VydmljZS5hY3RpdmVIYXJuZXNzLmdldCgpLCAnY2xpJyk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHN1aXRlKCdnZXRTbGFzaENvbW1hbmRzJywgKCkgPT4ge1xuXHRcdHRlc3QoJ3VzZXMgdGhlIGFjdGl2ZSBoYXJuZXNzIHByb3ZpZGVyIGZvciBwcm9tcHQgYW5kIHNraWxsIGl0ZW1zJywgYXN5bmMgKCkgPT4ge1xuXG5cblx0XHRcdGNvbnN0IHRlc3RTZXNzaW9uVHlwZSA9ICd0ZXN0LXNlc3Npb24tdHlwZSc7XG5cdFx0XHRjb25zdCB0ZXN0U2Vzc2lvblJlc291cmNlID0gVVJJLnBhcnNlKCd0ZXN0LXNlc3Npb24tdHlwZTovL3Nlc3Npb24nKTtcblxuXHRcdFx0Y29uc3QgZW1pdHRlciA9IG5ldyBFbWl0dGVyPHZvaWQ+KCk7XG5cdFx0XHRzdG9yZS5hZGQoZW1pdHRlcik7XG5cdFx0XHRjb25zdCBzZXJ2aWNlID0gY3JlYXRlU2VydmljZSh7XG5cdFx0XHRcdGlkOiB0ZXN0U2Vzc2lvblR5cGUsXG5cdFx0XHRcdGxhYmVsOiAnVGVzdCBFeHRlbnNpb24nLFxuXHRcdFx0XHRpY29uOiBUaGVtZUljb24uZnJvbUlkKCdleHRlbnNpb25zJyksXG5cdFx0XHRcdGl0ZW1Qcm92aWRlcjoge1xuXHRcdFx0XHRcdG9uRGlkQ2hhbmdlOiBlbWl0dGVyLmV2ZW50LFxuXHRcdFx0XHRcdHByb3ZpZGVDaGF0U2Vzc2lvbkN1c3RvbWl6YXRpb25zOiBhc3luYyAoX3Nlc3Npb25SZXNvdXJjZTogVVJJLCBfdG9rZW46IENhbmNlbGxhdGlvblRva2VuKSA9PiBbXG5cdFx0XHRcdFx0XHR7IHVyaTogVVJJLnBhcnNlKCdmaWxlOi8vL3dvcmtzcGFjZS8udGVzdC9wcm9tcHRzL2ZpeC5wcm9tcHQubWQnKSwgdHlwZTogUHJvbXB0c1R5cGUucHJvbXB0LCBzb3VyY2U6ICdsb2NhbCcsIG5hbWU6ICdmaXgnLCBkZXNjcmlwdGlvbjogJ0ZpeCBzb21ldGhpbmcnLCBleHRlbnNpb25JZDogdW5kZWZpbmVkLCBwbHVnaW5Vcmk6IHVuZGVmaW5lZCwgdXNlckludm9jYWJsZTogdW5kZWZpbmVkIH0sXG5cdFx0XHRcdFx0XHR7IHVyaTogVVJJLnBhcnNlKCdmaWxlOi8vL3dvcmtzcGFjZS8udGVzdC9za2lsbHMvbGludC9TS0lMTC5tZCcpLCB0eXBlOiBQcm9tcHRzVHlwZS5za2lsbCwgc291cmNlOiAnbG9jYWwnLCBuYW1lOiAnbGludCcsIGRlc2NyaXB0aW9uOiAnTGludCBza2lsbCcsIGV4dGVuc2lvbklkOiB1bmRlZmluZWQsIHBsdWdpblVyaTogdW5kZWZpbmVkLCB1c2VySW52b2NhYmxlOiB1bmRlZmluZWQgfSxcblx0XHRcdFx0XHRcdHsgdXJpOiBVUkkucGFyc2UoJ2ZpbGU6Ly8vd29ya3NwYWNlLy50ZXN0L2luc3RydWN0aW9ucy9ydWxlLmluc3RydWN0aW9ucy5tZCcpLCB0eXBlOiBQcm9tcHRzVHlwZS5pbnN0cnVjdGlvbnMsIHNvdXJjZTogJ2xvY2FsJywgbmFtZTogJ3J1bGUnLCBkZXNjcmlwdGlvbjogJ0lnbm9yZSBtZScsIGV4dGVuc2lvbklkOiB1bmRlZmluZWQsIHBsdWdpblVyaTogdW5kZWZpbmVkLCB1c2VySW52b2NhYmxlOiB1bmRlZmluZWQgfSxcblx0XHRcdFx0XHRcdHsgdXJpOiBVUkkucGFyc2UoJ2ZpbGU6Ly8vd29ya3NwYWNlLy50ZXN0L3NraWxscy9kaXNhYmxlZC9TS0lMTC5tZCcpLCB0eXBlOiBQcm9tcHRzVHlwZS5za2lsbCwgc291cmNlOiAnbG9jYWwnLCBuYW1lOiAnZGlzYWJsZWQnLCBlbmFibGVkOiBmYWxzZSwgZXh0ZW5zaW9uSWQ6IHVuZGVmaW5lZCwgcGx1Z2luVXJpOiB1bmRlZmluZWQsIHVzZXJJbnZvY2FibGU6IHVuZGVmaW5lZCB9LFxuXHRcdFx0XHRcdF0sXG5cdFx0XHRcdH0sXG5cdFx0XHR9KTtcblxuXHRcdFx0Y29uc3QgY29tbWFuZHMgPSBhd2FpdCBzZXJ2aWNlLmdldFNsYXNoQ29tbWFuZHModGVzdFNlc3Npb25SZXNvdXJjZSwgQ2FuY2VsbGF0aW9uVG9rZW4uTm9uZSk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGNvbW1hbmRzLm1hcChjb21tYW5kID0+ICh7IG5hbWU6IGNvbW1hbmQubmFtZSwgdHlwZTogY29tbWFuZC50eXBlIH0pKSwgW1xuXHRcdFx0XHR7IG5hbWU6ICdmaXgnLCB0eXBlOiBQcm9tcHRzVHlwZS5wcm9tcHQgfSxcblx0XHRcdFx0eyBuYW1lOiAnbGludCcsIHR5cGU6IFByb21wdHNUeXBlLnNraWxsIH0sXG5cdFx0XHRdKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3VzZXMgcGx1Z2luIGxhYmVsIGZvciBwbHVnaW4tc2NvcGVkIGNvbW1hbmRzIHdoZW4gcHJvdmlkZXIgcGx1Z2luIFVSSSBpcyBhIHBpbm5lZCBTSEEgcGF0aCcsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IHRlc3RTZXNzaW9uVHlwZSA9ICd0ZXN0LXNlc3Npb24tdHlwZSc7XG5cdFx0XHRjb25zdCB0ZXN0U2Vzc2lvblJlc291cmNlID0gVVJJLnBhcnNlKCd0ZXN0LXNlc3Npb24tdHlwZTovL3Nlc3Npb24nKTtcblx0XHRcdGNvbnN0IHBsdWdpblVyaSA9IFVSSS5wYXJzZSgnZmlsZTovLy9jYWNoZS9hZ2VudFBsdWdpbnMvZ2l0aHViL2RhdGFkb2cvc2hhX2IwMDNmY2FkNDhjM2E5MzVmZmUwNGI2MjE4ZjVjZjU4ZmUyYjY3NjAnKTtcblxuXHRcdFx0Y29uc3QgZW1pdHRlciA9IG5ldyBFbWl0dGVyPHZvaWQ+KCk7XG5cdFx0XHRzdG9yZS5hZGQoZW1pdHRlcik7XG5cdFx0XHRjb25zdCBzZXJ2aWNlID0gY3JlYXRlU2VydmljZSh7XG5cdFx0XHRcdGlkOiB0ZXN0U2Vzc2lvblR5cGUsXG5cdFx0XHRcdGxhYmVsOiAnVGVzdCBFeHRlbnNpb24nLFxuXHRcdFx0XHRpY29uOiBUaGVtZUljb24uZnJvbUlkKCdleHRlbnNpb25zJyksXG5cdFx0XHRcdGl0ZW1Qcm92aWRlcjoge1xuXHRcdFx0XHRcdG9uRGlkQ2hhbmdlOiBlbWl0dGVyLmV2ZW50LFxuXHRcdFx0XHRcdHByb3ZpZGVDaGF0U2Vzc2lvbkN1c3RvbWl6YXRpb25zOiBhc3luYyAoX3Nlc3Npb25SZXNvdXJjZTogVVJJLCBfdG9rZW46IENhbmNlbGxhdGlvblRva2VuKSA9PiBbXG5cdFx0XHRcdFx0XHR7IHVyaTogVVJJLmpvaW5QYXRoKHBsdWdpblVyaSwgJ3NraWxscycsICdkZHNldHVwJywgJ1NLSUxMLm1kJyksIHR5cGU6IFByb21wdHNUeXBlLnNraWxsLCBzb3VyY2U6ICdwbHVnaW4nLCBuYW1lOiAnZGRzZXR1cCcsIGRlc2NyaXB0aW9uOiAnU2V0IHVwIERhdGFkb2cnLCBleHRlbnNpb25JZDogdW5kZWZpbmVkLCBwbHVnaW5VcmksIHBsdWdpbkxhYmVsOiAnZGF0YWRvZycsIHVzZXJJbnZvY2FibGU6IHVuZGVmaW5lZCB9LFxuXHRcdFx0XHRcdF0sXG5cdFx0XHRcdH0sXG5cdFx0XHR9KTtcblxuXHRcdFx0Y29uc3QgY29tbWFuZHMgPSBhd2FpdCBzZXJ2aWNlLmdldFNsYXNoQ29tbWFuZHModGVzdFNlc3Npb25SZXNvdXJjZSwgQ2FuY2VsbGF0aW9uVG9rZW4uTm9uZSk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGNvbW1hbmRzLm1hcChjb21tYW5kID0+ICh7IG5hbWU6IGNvbW1hbmQubmFtZSwgZGVzY3JpcHRpb246IGNvbW1hbmQuZGVzY3JpcHRpb24sIHR5cGU6IGNvbW1hbmQudHlwZSB9KSksIFtcblx0XHRcdFx0eyBuYW1lOiAnZGF0YWRvZzpkZHNldHVwJywgZGVzY3JpcHRpb246ICdTZXQgdXAgRGF0YWRvZycsIHR5cGU6IFByb21wdHNUeXBlLnNraWxsIH0sXG5cdFx0XHRdKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2ZhbGxzIGJhY2sgdG8gcHJvbXB0c1NlcnZpY2Ugd2hlbiB0aGUgYWN0aXZlIGhhcm5lc3MgaGFzIG5vIHByb3ZpZGVyJywgYXN5bmMgKCkgPT4ge1xuXG5cdFx0XHRjb25zdCB0ZXN0U2Vzc2lvblR5cGUgPSAndGVzdC1zZXNzaW9uLXR5cGUnO1xuXHRcdFx0Y29uc3QgdGVzdFNlc3Npb25SZXNvdXJjZSA9IFVSSS5wYXJzZSgndGVzdC1zZXNzaW9uLXR5cGU6Ly9zZXNzaW9uJyk7XG5cdFx0XHRjb25zdCBvdGhlclNlc3Npb25SZXNvdXJjZSA9IFVSSS5wYXJzZSgnb3RoZXItc2Vzc2lvbi10eXBlOi8vc2Vzc2lvbicpO1xuXHRcdFx0Y29uc3QgcHJvbXB0c1NlcnZpY2UgPSBuZXcgY2xhc3MgZXh0ZW5kcyBNb2NrUHJvbXB0c1NlcnZpY2Uge1xuXHRcdFx0XHRvdmVycmlkZSBhc3luYyBnZXRQcm9tcHRTbGFzaENvbW1hbmRzKCkge1xuXHRcdFx0XHRcdHJldHVybiBbXG5cdFx0XHRcdFx0XHR7IHVyaTogVVJJLnBhcnNlKCdmaWxlOi8vL3dvcmtzcGFjZS8uZ2l0aHViL3Byb21wdHMvZXhwbGFpbi5wcm9tcHQubWQnKSwgbmFtZTogJ2V4cGxhaW4nLCB0eXBlOiBQcm9tcHRzVHlwZS5wcm9tcHQsIHN0b3JhZ2U6IFByb21wdHNTdG9yYWdlLmxvY2FsLCB1c2VySW52b2NhYmxlOiBmYWxzZSwgc2Vzc2lvblR5cGVzOiBbdGVzdFNlc3Npb25UeXBlXSB9LFxuXHRcdFx0XHRcdFx0eyB1cmk6IFVSSS5wYXJzZSgnZmlsZTovLy93b3Jrc3BhY2UvLmdpdGh1Yi9za2lsbHMvcmV2aWV3L1NLSUxMLm1kJyksIG5hbWU6ICdyZXZpZXcnLCB0eXBlOiBQcm9tcHRzVHlwZS5za2lsbCwgc3RvcmFnZTogUHJvbXB0c1N0b3JhZ2UudXNlciwgdXNlckludm9jYWJsZTogdHJ1ZSB9LFxuXHRcdFx0XHRcdF07XG5cdFx0XHRcdH1cblx0XHRcdFx0b3ZlcnJpZGUgaXNWYWxpZFNsYXNoQ29tbWFuZE5hbWUoKSB7IHJldHVybiB0cnVlOyB9XG5cdFx0XHR9O1xuXHRcdFx0Y29uc3Qgc2VydmljZSA9IG5ldyBDdXN0b21pemF0aW9uSGFybmVzc1NlcnZpY2VCYXNlKFtjcmVhdGVWU0NvZGVIYXJuZXNzRGVzY3JpcHRvcigpXSwgU2Vzc2lvblR5cGUuTG9jYWwsIHByb21wdHNTZXJ2aWNlKTtcblx0XHRcdHN0b3JlLmFkZChzZXJ2aWNlKTtcblx0XHRcdHtcblx0XHRcdFx0Y29uc3QgY29tbWFuZHMgPSBhd2FpdCBzZXJ2aWNlLmdldFNsYXNoQ29tbWFuZHModGVzdFNlc3Npb25SZXNvdXJjZSwgQ2FuY2VsbGF0aW9uVG9rZW4uTm9uZSk7XG5cdFx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoY29tbWFuZHMubWFwKGNvbW1hbmQgPT4gKHsgbmFtZTogY29tbWFuZC5uYW1lLCB0eXBlOiBjb21tYW5kLnR5cGUsIHVzZXJJbnZvY2FibGU6IGNvbW1hbmQudXNlckludm9jYWJsZSwgc2Vzc2lvblR5cGVzOiBjb21tYW5kLnNlc3Npb25UeXBlcyB9KSksIFtcblx0XHRcdFx0XHR7IG5hbWU6ICdleHBsYWluJywgdHlwZTogUHJvbXB0c1R5cGUucHJvbXB0LCB1c2VySW52b2NhYmxlOiBmYWxzZSwgc2Vzc2lvblR5cGVzOiBbdGVzdFNlc3Npb25UeXBlXSB9LFxuXHRcdFx0XHRcdHsgbmFtZTogJ3JldmlldycsIHR5cGU6IFByb21wdHNUeXBlLnNraWxsLCB1c2VySW52b2NhYmxlOiB0cnVlLCBzZXNzaW9uVHlwZXM6IHVuZGVmaW5lZCB9LFxuXHRcdFx0XHRdKTtcblx0XHRcdH1cblx0XHRcdHtcblx0XHRcdFx0Y29uc3QgY29tbWFuZHMgPSBhd2FpdCBzZXJ2aWNlLmdldFNsYXNoQ29tbWFuZHMob3RoZXJTZXNzaW9uUmVzb3VyY2UsIENhbmNlbGxhdGlvblRva2VuLk5vbmUpO1xuXHRcdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGNvbW1hbmRzLm1hcChjb21tYW5kID0+ICh7IG5hbWU6IGNvbW1hbmQubmFtZSwgdHlwZTogY29tbWFuZC50eXBlLCB1c2VySW52b2NhYmxlOiBjb21tYW5kLnVzZXJJbnZvY2FibGUsIHNlc3Npb25UeXBlczogY29tbWFuZC5zZXNzaW9uVHlwZXMgfSkpLCBbXG5cdFx0XHRcdFx0eyBuYW1lOiAncmV2aWV3JywgdHlwZTogUHJvbXB0c1R5cGUuc2tpbGwsIHVzZXJJbnZvY2FibGU6IHRydWUsIHNlc3Npb25UeXBlczogdW5kZWZpbmVkIH0sXG5cdFx0XHRcdF0pO1xuXHRcdFx0fVxuXHRcdH0pO1xuXHR9KTtcblxuXHRzdWl0ZSgnZ2V0Q3VzdG9tQWdlbnRzJywgKCkgPT4ge1xuXHRcdGNvbnN0IGNyZWF0ZUFnZW50ID0gKG5hbWU6IHN0cmluZywgcGF0aDogc3RyaW5nLCBzZXNzaW9uVHlwZXM6IHJlYWRvbmx5IHN0cmluZ1tdIHwgdW5kZWZpbmVkLCBlbmFibGVkOiBib29sZWFuKTogSUN1c3RvbUFnZW50ID0+IHtcblx0XHRcdGNvbnN0IHVyaSA9IFVSSS5wYXJzZShwYXRoKTtcblx0XHRcdHJldHVybiB7XG5cdFx0XHRcdGlkOiB1cmkudG9TdHJpbmcoKSxcblx0XHRcdFx0dXJpLFxuXHRcdFx0XHRuYW1lLFxuXHRcdFx0XHR0YXJnZXQ6IFRhcmdldC5HaXRIdWJDb3BpbG90LFxuXHRcdFx0XHR2aXNpYmlsaXR5OiB7IHVzZXJJbnZvY2FibGU6IHRydWUsIGFnZW50SW52b2NhYmxlOiB0cnVlIH0sXG5cdFx0XHRcdGFnZW50SW5zdHJ1Y3Rpb25zOiB7IGNvbnRlbnQ6ICcnLCB0b29sUmVmZXJlbmNlczogW10gfSxcblx0XHRcdFx0c291cmNlOiB7IHN0b3JhZ2U6IFByb21wdHNTdG9yYWdlLmxvY2FsIH0sXG5cdFx0XHRcdHNlc3Npb25UeXBlcyxcblx0XHRcdFx0ZW5hYmxlZCxcblx0XHRcdH07XG5cdFx0fTtcblxuXHRcdHRlc3QoJ2ZhbGxzIGJhY2sgdG8gcHJvbXB0c1NlcnZpY2UgYW5kIGZpbHRlcnMgYnkgc2Vzc2lvbiB0eXBlJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgcHJvbXB0c1NlcnZpY2UgPSBuZXcgTW9ja1Byb21wdHNTZXJ2aWNlKCk7XG5cdFx0XHRwcm9tcHRzU2VydmljZS5zZXRDdXN0b21Nb2RlcyhbXG5cdFx0XHRcdGNyZWF0ZUFnZW50KCdtYXRjaGluZycsICdmaWxlOi8vL3dvcmtzcGFjZS8uZ2l0aHViL2FnZW50cy9tYXRjaGluZy5hZ2VudC5tZCcsIFt0ZXN0U2Vzc2lvblR5cGUxXSwgdHJ1ZSksXG5cdFx0XHRcdGNyZWF0ZUFnZW50KCdnbG9iYWwnLCAnZmlsZTovLy93b3Jrc3BhY2UvLmdpdGh1Yi9hZ2VudHMvZ2xvYmFsLmFnZW50Lm1kJywgdW5kZWZpbmVkLCB0cnVlKSxcblx0XHRcdFx0Y3JlYXRlQWdlbnQoJ290aGVyJywgJ2ZpbGU6Ly8vd29ya3NwYWNlLy5naXRodWIvYWdlbnRzL290aGVyLmFnZW50Lm1kJywgWydvdGhlci1zZXNzaW9uJ10sIHRydWUpLFxuXHRcdFx0XSk7XG5cdFx0XHRjb25zdCBzZXJ2aWNlID0gbmV3IEN1c3RvbWl6YXRpb25IYXJuZXNzU2VydmljZUJhc2UoW2NyZWF0ZVZTQ29kZUhhcm5lc3NEZXNjcmlwdG9yKCldLCBTZXNzaW9uVHlwZS5Mb2NhbCwgcHJvbXB0c1NlcnZpY2UpO1xuXHRcdFx0c3RvcmUuYWRkKHNlcnZpY2UpO1xuXG5cdFx0XHRjb25zdCBhZ2VudHMgPSBhd2FpdCBzZXJ2aWNlLmdldEN1c3RvbUFnZW50cyh0ZXN0U2Vzc2lvblJlc291cmNlMSwgQ2FuY2VsbGF0aW9uVG9rZW4uTm9uZSk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGFnZW50cy5tYXAoYWdlbnQgPT4gYWdlbnQubmFtZSksIFsnbWF0Y2hpbmcnLCAnZ2xvYmFsJ10pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgndXNlcyBwcm92aWRlciBpdGVtIFVSSXMgdG8gc2NvcGUgcmVzb2x2ZWQgY3VzdG9tIGFnZW50cycsIGFzeW5jICgpID0+IHtcblxuXHRcdFx0Y29uc3QgcHJvbXB0c1NlcnZpY2UgPSBuZXcgTW9ja1Byb21wdHNTZXJ2aWNlKCk7XG5cdFx0XHRwcm9tcHRzU2VydmljZS5zZXRDdXN0b21Nb2RlcyhbXG5cdFx0XHRcdGNyZWF0ZUFnZW50KCdzZWxlY3RlZCcsICdmaWxlOi8vL3dvcmtzcGFjZS8udGVzdC9hZ2VudHMvc2VsZWN0ZWQuYWdlbnQubWQnLCB1bmRlZmluZWQsIHRydWUpLFxuXHRcdFx0XHRjcmVhdGVBZ2VudCgnbm90LXNlbGVjdGVkJywgJ2ZpbGU6Ly8vd29ya3NwYWNlLy50ZXN0L2FnZW50cy9ub3Qtc2VsZWN0ZWQuYWdlbnQubWQnLCB1bmRlZmluZWQsIGZhbHNlKSxcblx0XHRcdF0pO1xuXG5cdFx0XHRjb25zdCBlbWl0dGVyID0gbmV3IEVtaXR0ZXI8dm9pZD4oKTtcblx0XHRcdHN0b3JlLmFkZChlbWl0dGVyKTtcblx0XHRcdGNvbnN0IHNlcnZpY2UgPSBuZXcgQ3VzdG9taXphdGlvbkhhcm5lc3NTZXJ2aWNlQmFzZShbe1xuXHRcdFx0XHRpZDogdGVzdFNlc3Npb25UeXBlMSxcblx0XHRcdFx0bGFiZWw6ICdUZXN0IEV4dGVuc2lvbicsXG5cdFx0XHRcdGljb246IFRoZW1lSWNvbi5mcm9tSWQoJ2V4dGVuc2lvbnMnKSxcblx0XHRcdFx0aXRlbVByb3ZpZGVyOiB7XG5cdFx0XHRcdFx0b25EaWRDaGFuZ2U6IGVtaXR0ZXIuZXZlbnQsXG5cdFx0XHRcdFx0cHJvdmlkZUNoYXRTZXNzaW9uQ3VzdG9taXphdGlvbnM6IGFzeW5jIChfc2Vzc2lvblJlc291cmNlOiBVUkksIF90b2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4pID0+IFtcblx0XHRcdFx0XHRcdHsgdXJpOiBVUkkucGFyc2UoJ2ZpbGU6Ly8vd29ya3NwYWNlLy50ZXN0L2FnZW50cy9lbmFibGVkLmFnZW50Lm1kJyksIHR5cGU6IFByb21wdHNUeXBlLmFnZW50LCBzb3VyY2U6ICdsb2NhbCcsIG5hbWU6ICdlbmFibGVkJywgZW5hYmxlZDogdHJ1ZSwgZXh0ZW5zaW9uSWQ6IHVuZGVmaW5lZCwgcGx1Z2luVXJpOiB1bmRlZmluZWQsIHVzZXJJbnZvY2FibGU6IHVuZGVmaW5lZCB9LFxuXHRcdFx0XHRcdFx0eyB1cmk6IFVSSS5wYXJzZSgnZmlsZTovLy93b3Jrc3BhY2UvLnRlc3QvYWdlbnRzL2Rpc2FibGVkLmFnZW50Lm1kJyksIHR5cGU6IFByb21wdHNUeXBlLmFnZW50LCBzb3VyY2U6ICdsb2NhbCcsIG5hbWU6ICdkaXNhYmxlZCcsIGVuYWJsZWQ6IGZhbHNlLCBleHRlbnNpb25JZDogdW5kZWZpbmVkLCBwbHVnaW5Vcmk6IHVuZGVmaW5lZCwgdXNlckludm9jYWJsZTogdW5kZWZpbmVkIH0sXG5cdFx0XHRcdFx0XSxcblx0XHRcdFx0fSxcblx0XHRcdH1dLCB0ZXN0U2Vzc2lvblR5cGUxLCBwcm9tcHRzU2VydmljZSk7XG5cdFx0XHRzdG9yZS5hZGQoc2VydmljZSk7XG5cdFx0XHR7XG5cdFx0XHRcdGNvbnN0IGFnZW50cyA9IChhd2FpdCBzZXJ2aWNlLmdldEN1c3RvbUFnZW50cyh0ZXN0U2Vzc2lvblJlc291cmNlMSwgQ2FuY2VsbGF0aW9uVG9rZW4uTm9uZSkpO1xuXHRcdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGFnZW50cy5tYXAoYWdlbnQgPT4gW2FnZW50Lm5hbWUsIGFnZW50LmVuYWJsZWRdKSwgW1snZW5hYmxlZCcsIHRydWVdLCBbJ2Rpc2FibGVkJywgZmFsc2VdXSk7XG5cdFx0XHR9XG5cdFx0XHR7XG5cdFx0XHRcdGNvbnN0IGFnZW50cyA9IChhd2FpdCBzZXJ2aWNlLmdldEN1c3RvbUFnZW50cyh0ZXN0U2Vzc2lvblJlc291cmNlMiwgQ2FuY2VsbGF0aW9uVG9rZW4uTm9uZSkpO1xuXHRcdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGFnZW50cy5tYXAoYWdlbnQgPT4gW2FnZW50Lm5hbWUsIGFnZW50LmVuYWJsZWRdKSwgW1snc2VsZWN0ZWQnLCB0cnVlXSwgWydub3Qtc2VsZWN0ZWQnLCBm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
