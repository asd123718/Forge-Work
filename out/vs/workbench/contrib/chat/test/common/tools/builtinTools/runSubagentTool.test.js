import assert from "assert";
import { CancellationToken } from "../../../../../../../base/common/cancellation.js";
import { URI } from "../../../../../../../base/common/uri.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../../../../base/test/common/utils.js";
import { NullLogService } from "../../../../../../../platform/log/common/log.js";
import { TestConfigurationService } from "../../../../../../../platform/configuration/test/common/testConfigurationService.js";
import { RUN_SUBAGENT_MAX_NESTING_DEPTH, RunSubagentTool } from "../../../../common/tools/builtinTools/runSubagentTool.js";
import { MockLanguageModelToolsService } from "../mockLanguageModelToolsService.js";
import { COPILOT_VENDOR_ID } from "../../../../common/languageModels.js";
import { PromptsStorage } from "../../../../common/promptSyntax/service/promptsService.js";
import { Target } from "../../../../common/promptSyntax/promptTypes.js";
import { MockPromptsService } from "../../promptSyntax/service/mockPromptsService.js";
import { ExtensionIdentifier } from "../../../../../../../platform/extensions/common/extensions.js";
import { ChatConfiguration } from "../../../../common/constants.js";
suite("RunSubagentTool", () => {
  const testDisposables = ensureNoDisposablesAreLeakedInTestSuite();
  suite("resultText trimming", () => {
    test("trims leading empty codeblocks (```\\n```) from result", () => {
      const testCases = [
        { input: "```\n```\nActual content", expected: "Actual content" },
        { input: "\n```\n```\nActual content", expected: "Actual content" },
        { input: "\n\n```\n\n```\n\nActual content", expected: "Actual content" },
        { input: "```\n```\n```\n```\nActual content", expected: "```\n```\nActual content" },
        // Only trims leading
        { input: "No codeblock here", expected: "No codeblock here" },
        { input: "```\n```\n", expected: "" },
        { input: "", expected: "" }
      ];
      for (const { input, expected } of testCases) {
        const result = input.replace(/^\n*```\n+```\n*/g, "").trim();
        assert.strictEqual(result, expected, `Failed for input: ${JSON.stringify(input)}`);
      }
    });
  });
  suite("prepareToolInvocation", () => {
    test("returns correct toolSpecificData", async () => {
      const mockToolsService = testDisposables.add(new MockLanguageModelToolsService());
      const promptsService = new MockPromptsService();
      const customMode = {
        id: "file:///test/custom-agent.md",
        uri: URI.parse("file:///test/custom-agent.md"),
        name: "CustomAgent",
        description: "A test custom agent",
        tools: ["tool1", "tool2"],
        agentInstructions: { content: "Custom agent body", toolReferences: [] },
        source: { storage: PromptsStorage.local },
        target: Target.Undefined,
        visibility: { userInvocable: true, agentInvocable: true },
        enabled: true
      };
      promptsService.setCustomModes([customMode]);
      const tool = testDisposables.add(new RunSubagentTool(
        {},
        {},
        mockToolsService,
        {},
        new NullLogService(),
        new TestConfigurationService(),
        promptsService,
        {},
        {}
      ));
      const result = await tool.prepareToolInvocation(
        {
          parameters: {
            prompt: "Test prompt",
            description: "Test task",
            agentName: "CustomAgent"
          },
          toolCallId: "test-call-1",
          chatSessionResource: URI.parse("test://session")
        },
        CancellationToken.None
      );
      assert.ok(result);
      assert.strictEqual(result.invocationMessage, "Test task");
      assert.deepStrictEqual(result.toolSpecificData, {
        kind: "subagent",
        description: "Test task",
        agentName: "CustomAgent",
        prompt: "Test prompt",
        modelName: void 0
      });
    });
    function createTool(opts) {
      const mockToolsService = testDisposables.add(new MockLanguageModelToolsService());
      const promptsService = new MockPromptsService();
      if (opts?.customAgents) {
        promptsService.setCustomModes(opts.customAgents);
      }
      const tool = testDisposables.add(new RunSubagentTool(
        {},
        {},
        mockToolsService,
        {},
        new NullLogService(),
        new TestConfigurationService(),
        promptsService,
        {},
        {}
      ));
      return tool;
    }
    test("passes through unknown agentName", async () => {
      const tool = createTool();
      const result = await tool.prepareToolInvocation(
        {
          parameters: { prompt: "Test prompt", description: "Test task", agentName: "NonExistentAgent" },
          toolCallId: "test-call-unknown",
          chatSessionResource: URI.parse("test://session")
        },
        CancellationToken.None
      );
      assert.ok(result);
      assert.deepStrictEqual(result.toolSpecificData, {
        kind: "subagent",
        description: "Test task",
        agentName: "NonExistentAgent",
        prompt: "Test prompt",
        modelName: void 0
      });
    });
  });
  suite("getToolData", () => {
    test("returns basic tool data", () => {
      const mockToolsService = testDisposables.add(new MockLanguageModelToolsService());
      const promptsService = new MockPromptsService();
      const tool = testDisposables.add(new RunSubagentTool(
        {},
        {},
        mockToolsService,
        {},
        new NullLogService(),
        new TestConfigurationService(),
        promptsService,
        {},
        {}
      ));
      const toolData = tool.getToolData();
      assert.strictEqual(toolData.id, "runSubagent");
      assert.ok(toolData.inputSchema);
      assert.ok(toolData.inputSchema.properties?.prompt);
      assert.ok(toolData.inputSchema.properties?.description);
      assert.ok(toolData.inputSchema.properties?.agentName, "agentName should be in schema properties");
      assert.deepStrictEqual(toolData.inputSchema.required, ["prompt", "description"]);
    });
  });
  suite("onDidInvokeTool event", () => {
    test("mock service fires onDidInvokeTool events with correct data", () => {
      const mockToolsService = testDisposables.add(new MockLanguageModelToolsService());
      const sessionResource = URI.parse("test://session");
      const receivedEvents = [];
      testDisposables.add(mockToolsService.onDidInvokeTool((e) => {
        receivedEvents.push(e);
      }));
      mockToolsService.fireOnDidInvokeTool({
        toolId: "test-tool",
        sessionResource,
        requestId: "request-123",
        subagentInvocationId: "subagent-456"
      });
      assert.strictEqual(receivedEvents.length, 1);
      assert.deepStrictEqual(receivedEvents[0], {
        toolId: "test-tool",
        sessionResource,
        requestId: "request-123",
        subagentInvocationId: "subagent-456"
      });
    });
    test("events with different subagentInvocationId are distinguishable", () => {
      const mockToolsService = testDisposables.add(new MockLanguageModelToolsService());
      const targetSubagentId = "target-subagent";
      const matchingEvents = [];
      testDisposables.add(mockToolsService.onDidInvokeTool((e) => {
        if (e.subagentInvocationId === targetSubagentId) {
          matchingEvents.push(e.toolId);
        }
      }));
      mockToolsService.fireOnDidInvokeTool({
        toolId: "unrelated-tool",
        sessionResource: void 0,
        requestId: void 0,
        subagentInvocationId: "different-subagent"
      });
      mockToolsService.fireOnDidInvokeTool({
        toolId: "matching-tool",
        sessionResource: void 0,
        requestId: void 0,
        subagentInvocationId: targetSubagentId
      });
      mockToolsService.fireOnDidInvokeTool({
        toolId: "another-unrelated-tool",
        sessionResource: void 0,
        requestId: void 0,
        subagentInvocationId: void 0
      });
      assert.deepStrictEqual(matchingEvents, ["matching-tool"]);
    });
  });
  suite("model fallback behavior", () => {
    const BUILTIN_CHAT_EXTENSION_ID = "github.copilot-chat";
    const builtinProductService = { defaultChatAgent: { chatExtensionId: BUILTIN_CHAT_EXTENSION_ID } };
    function createMetadata(name, multiplierNumeric, vendor = "TestVendor") {
      return {
        extension: new ExtensionIdentifier("test.extension"),
        name,
        id: name.toLowerCase().replace(/\s+/g, "-"),
        vendor,
        version: "1.0",
        family: "test",
        maxInputTokens: 128e3,
        maxOutputTokens: 8192,
        isDefaultForLocation: {},
        multiplierNumeric,
        capabilities: { toolCalling: true },
        isBYOK: vendor !== COPILOT_VENDOR_ID
      };
    }
    function createTool(opts) {
      const mockToolsService = testDisposables.add(new MockLanguageModelToolsService());
      const promptsService = new MockPromptsService();
      if (opts.customAgents) {
        promptsService.setCustomModes(opts.customAgents);
      }
      const mockLanguageModelsService = {
        getLanguageModelIds() {
          return Array.from(opts.models.keys());
        },
        lookupLanguageModel(modelId) {
          return opts.models.get(modelId);
        },
        lookupLanguageModelByQualifiedName(qualifiedName) {
          return opts.qualifiedNameMap?.get(qualifiedName);
        }
      };
      const tool = testDisposables.add(new RunSubagentTool(
        {},
        {},
        mockToolsService,
        mockLanguageModelsService,
        new NullLogService(),
        new TestConfigurationService(),
        promptsService,
        {},
        builtinProductService
      ));
      return tool;
    }
    function createAgent(name, modelQualifiedNames) {
      const id = `file:///test/${name}.md`;
      return {
        uri: URI.parse(id),
        id,
        name,
        description: `Agent ${name}`,
        tools: ["tool1"],
        model: modelQualifiedNames,
        agentInstructions: { content: "test", toolReferences: [] },
        source: { storage: PromptsStorage.local },
        target: Target.Undefined,
        visibility: { userInvocable: true, agentInvocable: true },
        enabled: true
      };
    }
    function createBuiltinAgent(name, modelQualifiedNames) {
      return {
        ...createAgent(name, modelQualifiedNames),
        source: { storage: PromptsStorage.extension, extensionId: new ExtensionIdentifier(BUILTIN_CHAT_EXTENSION_ID) }
      };
    }
    test("throws error when subagent model has higher multiplier", async () => {
      const mainMeta = createMetadata("GPT-4o", 1);
      const expensiveMeta = createMetadata("O3 Pro", 50);
      const models = /* @__PURE__ */ new Map([
        ["main-model-id", mainMeta],
        ["expensive-model-id", expensiveMeta]
      ]);
      const qualifiedNameMap = /* @__PURE__ */ new Map([
        ["O3 Pro (TestVendor)", { metadata: expensiveMeta, identifier: "expensive-model-id" }]
      ]);
      const agent = createAgent("ExpensiveAgent", ["O3 Pro (TestVendor)"]);
      const tool = createTool({ models, qualifiedNameMap, customAgents: [agent] });
      await assert.rejects(
        () => tool.prepareToolInvocation({
          parameters: { prompt: "test", description: "test task", agentName: "ExpensiveAgent" },
          toolCallId: "call-1",
          modelId: "main-model-id",
          chatSessionResource: URI.parse("test://session")
        }, CancellationToken.None),
        (err) => {
          assert.ok(err.message.includes("O3 Pro"));
          assert.ok(err.message.includes("exceeds"));
          assert.ok(err.message.includes("cost tier"));
          assert.ok(err.message.includes("Unavailable"));
          return true;
        }
      );
    });
    test("uses subagent model when it has equal multiplier", async () => {
      const mainMeta = createMetadata("GPT-4o", 1);
      const sameCostMeta = createMetadata("Claude Sonnet", 1);
      const models = /* @__PURE__ */ new Map([
        ["main-model-id", mainMeta],
        ["same-cost-model-id", sameCostMeta]
      ]);
      const qualifiedNameMap = /* @__PURE__ */ new Map([
        ["Claude Sonnet (TestVendor)", { metadata: sameCostMeta, identifier: "same-cost-model-id" }]
      ]);
      const agent = createAgent("SameCostAgent", ["Claude Sonnet (TestVendor)"]);
      const tool = createTool({ models, qualifiedNameMap, customAgents: [agent] });
      const result = await tool.prepareToolInvocation({
        parameters: { prompt: "test", description: "test task", agentName: "SameCostAgent" },
        toolCallId: "call-2",
        modelId: "main-model-id",
        chatSessionResource: URI.parse("test://session")
      }, CancellationToken.None);
      assert.ok(result);
      assert.deepStrictEqual(result.toolSpecificData, {
        kind: "subagent",
        description: "test task",
        agentName: "SameCostAgent",
        prompt: "test",
        modelName: "Claude Sonnet"
      });
    });
    test("uses subagent model when it has lower multiplier", async () => {
      const mainMeta = createMetadata("O3 Pro", 50);
      const cheapMeta = createMetadata("GPT-4o Mini", 0.25);
      const models = /* @__PURE__ */ new Map([
        ["main-model-id", mainMeta],
        ["cheap-model-id", cheapMeta]
      ]);
      const qualifiedNameMap = /* @__PURE__ */ new Map([
        ["GPT-4o Mini (TestVendor)", { metadata: cheapMeta, identifier: "cheap-model-id" }]
      ]);
      const agent = createAgent("CheapAgent", ["GPT-4o Mini (TestVendor)"]);
      const tool = createTool({ models, qualifiedNameMap, customAgents: [agent] });
      const result = await tool.prepareToolInvocation({
        parameters: { prompt: "test", description: "test task", agentName: "CheapAgent" },
        toolCallId: "call-3",
        modelId: "main-model-id",
        chatSessionResource: URI.parse("test://session")
      }, CancellationToken.None);
      assert.ok(result);
      assert.deepStrictEqual(result.toolSpecificData, {
        kind: "subagent",
        description: "test task",
        agentName: "CheapAgent",
        prompt: "test",
        modelName: "GPT-4o Mini"
      });
    });
    test("uses subagent model when main model has no multiplier", async () => {
      const mainMeta = createMetadata("Unknown Model", void 0);
      const subMeta = createMetadata("O3 Pro", 50);
      const models = /* @__PURE__ */ new Map([
        ["main-model-id", mainMeta],
        ["sub-model-id", subMeta]
      ]);
      const qualifiedNameMap = /* @__PURE__ */ new Map([
        ["O3 Pro (TestVendor)", { metadata: subMeta, identifier: "sub-model-id" }]
      ]);
      const agent = createAgent("SubAgent", ["O3 Pro (TestVendor)"]);
      const tool = createTool({ models, qualifiedNameMap, customAgents: [agent] });
      const result = await tool.prepareToolInvocation({
        parameters: { prompt: "test", description: "test task", agentName: "SubAgent" },
        toolCallId: "call-4",
        modelId: "main-model-id",
        chatSessionResource: URI.parse("test://session")
      }, CancellationToken.None);
      assert.ok(result);
      assert.deepStrictEqual(result.toolSpecificData, {
        kind: "subagent",
        description: "test task",
        agentName: "SubAgent",
        prompt: "test",
        modelName: "O3 Pro"
      });
    });
    test("uses subagent model when subagent model has no multiplier", async () => {
      const mainMeta = createMetadata("GPT-4o", 1);
      const subMeta = createMetadata("Custom Model", void 0);
      const models = /* @__PURE__ */ new Map([
        ["main-model-id", mainMeta],
        ["sub-model-id", subMeta]
      ]);
      const qualifiedNameMap = /* @__PURE__ */ new Map([
        ["Custom Model (TestVendor)", { metadata: subMeta, identifier: "sub-model-id" }]
      ]);
      const agent = createAgent("CustomAgent", ["Custom Model (TestVendor)"]);
      const tool = createTool({ models, qualifiedNameMap, customAgents: [agent] });
      const result = await tool.prepareToolInvocation({
        parameters: { prompt: "test", description: "test task", agentName: "CustomAgent" },
        toolCallId: "call-5",
        modelId: "main-model-id",
        chatSessionResource: URI.parse("test://session")
      }, CancellationToken.None);
      assert.ok(result);
      assert.deepStrictEqual(result.toolSpecificData, {
        kind: "subagent",
        description: "test task",
        agentName: "CustomAgent",
        prompt: "test",
        modelName: "Custom Model"
      });
    });
    test("uses main model when no subagent is specified", async () => {
      const mainMeta = createMetadata("GPT-4o", 1);
      const models = /* @__PURE__ */ new Map([["main-model-id", mainMeta]]);
      const tool = createTool({ models });
      const result = await tool.prepareToolInvocation({
        parameters: { prompt: "test", description: "test task" },
        toolCallId: "call-6",
        modelId: "main-model-id",
        chatSessionResource: URI.parse("test://session")
      }, CancellationToken.None);
      assert.ok(result);
      assert.deepStrictEqual(result.toolSpecificData, {
        kind: "subagent",
        description: "test task",
        agentName: void 0,
        prompt: "test",
        modelName: "GPT-4o"
      });
    });
    test("uses main model when subagent has no model configured", async () => {
      const mainMeta = createMetadata("GPT-4o", 1);
      const models = /* @__PURE__ */ new Map([["main-model-id", mainMeta]]);
      const agent = createAgent("NoModelAgent", void 0);
      const tool = createTool({ models, customAgents: [agent] });
      const result = await tool.prepareToolInvocation({
        parameters: { prompt: "test", description: "test task", agentName: "NoModelAgent" },
        toolCallId: "call-7",
        modelId: "main-model-id",
        chatSessionResource: URI.parse("test://session")
      }, CancellationToken.None);
      assert.ok(result);
      assert.deepStrictEqual(result.toolSpecificData, {
        kind: "subagent",
        description: "test task",
        agentName: "NoModelAgent",
        prompt: "test",
        modelName: "GPT-4o"
      });
    });
    test("skips Copilot fallback models when main model is BYOK and inherits the main model", async () => {
      const mainMeta = createMetadata("Claude Sonnet BYOK", void 0, "anthropic");
      const copilotFallback = createMetadata("Copilot Haiku", void 0, COPILOT_VENDOR_ID);
      const models = /* @__PURE__ */ new Map([
        ["main-byok-id", mainMeta],
        ["copilot-fallback-id", copilotFallback]
      ]);
      const qualifiedNameMap = /* @__PURE__ */ new Map([
        ["Copilot Haiku (copilot)", { metadata: copilotFallback, identifier: "copilot-fallback-id" }]
      ]);
      const agent = createBuiltinAgent("ExploreAgent", ["Copilot Haiku (copilot)"]);
      const tool = createTool({ models, qualifiedNameMap, customAgents: [agent] });
      const result = await tool.prepareToolInvocation({
        parameters: { prompt: "test", description: "test task", agentName: "ExploreAgent" },
        toolCallId: "byok-call-1",
        modelId: "main-byok-id",
        chatSessionResource: URI.parse("test://session")
      }, CancellationToken.None);
      assert.ok(result);
      assert.deepStrictEqual(result.toolSpecificData, {
        kind: "subagent",
        description: "test task",
        agentName: "ExploreAgent",
        prompt: "test",
        modelName: "Claude Sonnet BYOK"
      });
    });
    test("skips Copilot fallback but uses a non-Copilot fallback when main model is BYOK", async () => {
      const mainMeta = createMetadata("Claude Sonnet BYOK", void 0, "anthropic");
      const copilotFallback = createMetadata("Copilot Haiku", void 0, COPILOT_VENDOR_ID);
      const byokFallback = createMetadata("Ollama Llama", void 0, "ollama");
      const models = /* @__PURE__ */ new Map([
        ["main-byok-id", mainMeta],
        ["copilot-fallback-id", copilotFallback],
        ["byok-fallback-id", byokFallback]
      ]);
      const qualifiedNameMap = /* @__PURE__ */ new Map([
        ["Copilot Haiku (copilot)", { metadata: copilotFallback, identifier: "copilot-fallback-id" }],
        ["Ollama Llama (ollama)", { metadata: byokFallback, identifier: "byok-fallback-id" }]
      ]);
      const agent = createBuiltinAgent("ExploreAgent", ["Copilot Haiku (copilot)", "Ollama Llama (ollama)"]);
      const tool = createTool({ models, qualifiedNameMap, customAgents: [agent] });
      const result = await tool.prepareToolInvocation({
        parameters: { prompt: "test", description: "test task", agentName: "ExploreAgent" },
        toolCallId: "byok-call-2",
        modelId: "main-byok-id",
        chatSessionResource: URI.parse("test://session")
      }, CancellationToken.None);
      assert.ok(result);
      assert.deepStrictEqual(result.toolSpecificData, {
        kind: "subagent",
        description: "test task",
        agentName: "ExploreAgent",
        prompt: "test",
        modelName: "Ollama Llama"
      });
    });
    test("uses the Copilot fallback model when the main model is also Copilot", async () => {
      const mainMeta = createMetadata("Copilot GPT-4o", void 0, COPILOT_VENDOR_ID);
      const copilotFallback = createMetadata("Copilot Haiku", void 0, COPILOT_VENDOR_ID);
      const models = /* @__PURE__ */ new Map([
        ["main-copilot-id", mainMeta],
        ["copilot-fallback-id", copilotFallback]
      ]);
      const qualifiedNameMap = /* @__PURE__ */ new Map([
        ["Copilot Haiku (copilot)", { metadata: copilotFallback, identifier: "copilot-fallback-id" }]
      ]);
      const agent = createBuiltinAgent("ExploreAgent", ["Copilot Haiku (copilot)"]);
      const tool = createTool({ models, qualifiedNameMap, customAgents: [agent] });
      const result = await tool.prepareToolInvocation({
        parameters: { prompt: "test", description: "test task", agentName: "ExploreAgent" },
        toolCallId: "byok-call-3",
        modelId: "main-copilot-id",
        chatSessionResource: URI.parse("test://session")
      }, CancellationToken.None);
      assert.ok(result);
      assert.deepStrictEqual(result.toolSpecificData, {
        kind: "subagent",
        description: "test task",
        agentName: "ExploreAgent",
        prompt: "test",
        modelName: "Copilot Haiku"
      });
    });
    test("uses the Copilot fallback model when no main model is set", async () => {
      const copilotFallback = createMetadata("Copilot Haiku", void 0, COPILOT_VENDOR_ID);
      const models = /* @__PURE__ */ new Map([
        ["copilot-fallback-id", copilotFallback]
      ]);
      const qualifiedNameMap = /* @__PURE__ */ new Map([
        ["Copilot Haiku (copilot)", { metadata: copilotFallback, identifier: "copilot-fallback-id" }]
      ]);
      const agent = createBuiltinAgent("ExploreAgent", ["Copilot Haiku (copilot)"]);
      const tool = createTool({ models, qualifiedNameMap, customAgents: [agent] });
      const result = await tool.prepareToolInvocation({
        parameters: { prompt: "test", description: "test task", agentName: "ExploreAgent" },
        toolCallId: "byok-call-4",
        modelId: void 0,
        chatSessionResource: URI.parse("test://session")
      }, CancellationToken.None);
      assert.ok(result);
      assert.deepStrictEqual(result.toolSpecificData, {
        kind: "subagent",
        description: "test task",
        agentName: "ExploreAgent",
        prompt: "test",
        modelName: "Copilot Haiku"
      });
    });
    test("honors a user-authored agent's explicit Copilot model even when main model is BYOK", async () => {
      const mainMeta = createMetadata("Claude Sonnet BYOK", void 0, "anthropic");
      const copilotPinned = createMetadata("Copilot Sonnet", void 0, COPILOT_VENDOR_ID);
      const models = /* @__PURE__ */ new Map([
        ["main-byok-id", mainMeta],
        ["copilot-pinned-id", copilotPinned]
      ]);
      const qualifiedNameMap = /* @__PURE__ */ new Map([
        ["Copilot Sonnet (copilot)", { metadata: copilotPinned, identifier: "copilot-pinned-id" }]
      ]);
      const agent = createAgent("MyAgent", ["Copilot Sonnet (copilot)"]);
      const tool = createTool({ models, qualifiedNameMap, customAgents: [agent] });
      const result = await tool.prepareToolInvocation({
        parameters: { prompt: "test", description: "test task", agentName: "MyAgent" },
        toolCallId: "byok-call-5",
        modelId: "main-byok-id",
        chatSessionResource: URI.parse("test://session")
      }, CancellationToken.None);
      assert.ok(result);
      assert.deepStrictEqual(result.toolSpecificData, {
        kind: "subagent",
        description: "test task",
        agentName: "MyAgent",
        prompt: "test",
        modelName: "Copilot Sonnet"
      });
    });
  });
  suite("explicit model parameter", () => {
    function createMetadata(name, multiplierNumeric) {
      return {
        extension: new ExtensionIdentifier("test.extension"),
        name,
        id: name.toLowerCase().replace(/\s+/g, "-"),
        vendor: "TestVendor",
        version: "1.0",
        family: "test",
        maxInputTokens: 128e3,
        maxOutputTokens: 8192,
        isDefaultForLocation: {},
        multiplierNumeric,
        capabilities: { toolCalling: true }
      };
    }
    function createTool(opts) {
      const mockToolsService = testDisposables.add(new MockLanguageModelToolsService());
      const promptsService = new MockPromptsService();
      if (opts.customAgents) {
        promptsService.setCustomModes(opts.customAgents);
      }
      const mockLanguageModelsService = {
        getLanguageModelIds() {
          return Array.from(opts.models.keys());
        },
        lookupLanguageModel(modelId) {
          return opts.models.get(modelId);
        },
        lookupLanguageModelByQualifiedName(qualifiedName) {
          return opts.qualifiedNameMap?.get(qualifiedName);
        }
      };
      const tool = testDisposables.add(new RunSubagentTool(
        {},
        {},
        mockToolsService,
        mockLanguageModelsService,
        new NullLogService(),
        new TestConfigurationService(),
        promptsService,
        {},
        {}
      ));
      return tool;
    }
    function createAgent(name, modelQualifiedNames) {
      const id = `file:///test/${name}.md`;
      return {
        id,
        uri: URI.parse(id),
        name,
        description: `Agent ${name}`,
        tools: ["tool1"],
        model: modelQualifiedNames,
        agentInstructions: { content: "test", toolReferences: [] },
        source: { storage: PromptsStorage.local },
        target: Target.Undefined,
        visibility: { userInvocable: true, agentInvocable: true },
        enabled: true
      };
    }
    test("model property is included in tool schema without enum", () => {
      const models = /* @__PURE__ */ new Map([
        ["model-1", createMetadata("GPT-4o")],
        ["model-2", createMetadata("Claude Sonnet")]
      ]);
      const tool = createTool({ models });
      const toolData = tool.getToolData();
      assert.ok(toolData.inputSchema?.properties?.model, "model should be in schema");
      assert.strictEqual(toolData.inputSchema?.properties?.model?.type, "string");
      assert.strictEqual(toolData.inputSchema?.properties?.model?.enum, void 0, "model should not have an enum");
    });
    test("resolves explicit model parameter without agentName", async () => {
      const mainMeta = createMetadata("GPT-4o", 1);
      const explicitMeta = createMetadata("Claude Sonnet", 1);
      const models = /* @__PURE__ */ new Map([
        ["main-model-id", mainMeta],
        ["explicit-model-id", explicitMeta]
      ]);
      const qualifiedNameMap = /* @__PURE__ */ new Map([
        ["Claude Sonnet (TestVendor)", { metadata: explicitMeta, identifier: "explicit-model-id" }]
      ]);
      const tool = createTool({ models, qualifiedNameMap });
      const result = await tool.prepareToolInvocation({
        parameters: { prompt: "test", description: "test task", model: "Claude Sonnet (TestVendor)" },
        toolCallId: "model-call-1",
        modelId: "main-model-id",
        chatSessionResource: URI.parse("test://session")
      }, CancellationToken.None);
      assert.ok(result);
      assert.deepStrictEqual(result.toolSpecificData, {
        kind: "subagent",
        description: "test task",
        agentName: void 0,
        prompt: "test",
        modelName: "Claude Sonnet"
      });
    });
    test("explicit model overrides agent configured model", async () => {
      const mainMeta = createMetadata("GPT-4o", 1);
      const agentMeta = createMetadata("Agent Model", 1);
      const explicitMeta = createMetadata("Claude Sonnet", 1);
      const models = /* @__PURE__ */ new Map([
        ["main-model-id", mainMeta],
        ["agent-model-id", agentMeta],
        ["explicit-model-id", explicitMeta]
      ]);
      const qualifiedNameMap = /* @__PURE__ */ new Map([
        ["Agent Model (TestVendor)", { metadata: agentMeta, identifier: "agent-model-id" }],
        ["Claude Sonnet (TestVendor)", { metadata: explicitMeta, identifier: "explicit-model-id" }]
      ]);
      const agent = createAgent("MyAgent", ["Agent Model (TestVendor)"]);
      const tool = createTool({ models, qualifiedNameMap, customAgents: [agent] });
      const result = await tool.prepareToolInvocation({
        parameters: { prompt: "test", description: "test task", agentName: "MyAgent", model: "Claude Sonnet (TestVendor)" },
        toolCallId: "model-call-2",
        modelId: "main-model-id",
        chatSessionResource: URI.parse("test://session")
      }, CancellationToken.None);
      assert.ok(result);
      assert.deepStrictEqual(result.toolSpecificData, {
        kind: "subagent",
        description: "test task",
        agentName: "MyAgent",
        prompt: "test",
        modelName: "Claude Sonnet"
      });
    });
    test("throws error when explicit model has higher multiplier", async () => {
      const mainMeta = createMetadata("GPT-4o", 1);
      const expensiveMeta = createMetadata("O3 Pro", 50);
      const models = /* @__PURE__ */ new Map([
        ["main-model-id", mainMeta],
        ["expensive-model-id", expensiveMeta]
      ]);
      const qualifiedNameMap = /* @__PURE__ */ new Map([
        ["O3 Pro (TestVendor)", { metadata: expensiveMeta, identifier: "expensive-model-id" }]
      ]);
      const tool = createTool({ models, qualifiedNameMap });
      await assert.rejects(
        () => tool.prepareToolInvocation({
          parameters: { prompt: "test", description: "test task", model: "O3 Pro (TestVendor)" },
          toolCallId: "model-call-3",
          modelId: "main-model-id",
          chatSessionResource: URI.parse("test://session")
        }, CancellationToken.None),
        (err) => {
          assert.ok(err.message.includes("O3 Pro"));
          assert.ok(err.message.includes("exceeds"));
          assert.ok(err.message.includes("cost tier"));
          assert.ok(err.message.includes("Unavailable"));
          return true;
        }
      );
    });
    test("throws error with available models when explicit model is not found", async () => {
      const mainMeta = createMetadata("GPT-4o", 1);
      const otherMeta = createMetadata("Claude Sonnet", 1);
      const models = /* @__PURE__ */ new Map([
        ["main-model-id", mainMeta],
        ["other-model-id", otherMeta]
      ]);
      const tool = createTool({ models, qualifiedNameMap: /* @__PURE__ */ new Map() });
      await assert.rejects(
        () => tool.prepareToolInvocation({
          parameters: { prompt: "test", description: "test task", model: "Nonexistent Model (Vendor)" },
          toolCallId: "model-call-4",
          modelId: "main-model-id",
          chatSessionResource: URI.parse("test://session")
        }, CancellationToken.None),
        (err) => {
          assert.ok(err.message.includes("Nonexistent Model (Vendor)"));
          assert.ok(err.message.includes("not found"));
          assert.ok(err.message.includes("Available models:"));
          assert.ok(err.message.includes("GPT-4o (TestVendor)"));
          assert.ok(err.message.includes("Claude Sonnet (TestVendor)"));
          return true;
        }
      );
    });
    test("throws error with no models message when no models are available", async () => {
      const tool = createTool({ models: /* @__PURE__ */ new Map(), qualifiedNameMap: /* @__PURE__ */ new Map() });
      await assert.rejects(
        () => tool.prepareToolInvocation({
          parameters: { prompt: "test", description: "test task", model: "Nonexistent Model (Vendor)" },
          toolCallId: "model-call-5",
          modelId: void 0,
          chatSessionResource: URI.parse("test://session")
        }, CancellationToken.None),
        (err) => {
          assert.ok(err.message.includes("Nonexistent Model (Vendor)"));
          assert.ok(err.message.includes("not found"));
          assert.ok(err.message.includes("No models available"));
          return true;
        }
      );
    });
  });
  suite("nested subagent depth tracking", () => {
    let callIdCounter = 0;
    function createInvokableTool(opts) {
      const mockToolsService = testDisposables.add(new MockLanguageModelToolsService());
      const configService = new TestConfigurationService({
        [ChatConfiguration.SubagentsAllowInvocationsFromSubagents]: opts.allowInvocationsFromSubagents
      });
      const promptsService = new MockPromptsService();
      const mockChatAgentService = {
        getDefaultAgent() {
          return { id: "default-agent" };
        },
        async invokeAgent(_id, request, _progress, _history, _token) {
          opts.capturedRequests.push(request);
          return {};
        }
      };
      const mockChatService = {
        getSession() {
          return {
            getRequests: () => [{
              id: "req-1",
              modeInfo: opts.currentModeInstructions ? {
                kind: void 0,
                isBuiltin: false,
                modeInstructions: opts.currentModeInstructions,
                telemetryModeId: "custom",
                applyCodeBlockSuggestionId: void 0
              } : void 0
            }],
            acceptResponseProgress: () => {
            }
          };
        }
      };
      const mockInstantiationService = {
        createInstance(..._args) {
          return { collect: async () => {
          } };
        }
      };
      const tool = testDisposables.add(new RunSubagentTool(
        mockChatAgentService,
        mockChatService,
        mockToolsService,
        {},
        new NullLogService(),
        configService,
        promptsService,
        mockInstantiationService,
        {}
      ));
      return { tool, mockChatAgentService };
    }
    function createInvocation(sessionUri, userSelectedTools) {
      return {
        callId: `call-${++callIdCounter}`,
        toolId: "runSubagent",
        parameters: { prompt: "do something", description: "test" },
        context: { sessionResource: sessionUri },
        userSelectedTools: userSelectedTools ?? { runSubagent: true }
      };
    }
    const countTokens = async () => 0;
    const noProgress = { report() {
    } };
    test("disables runSubagent tool when nesting is disabled", async () => {
      const capturedRequests = [];
      const { tool } = createInvokableTool({ allowInvocationsFromSubagents: false, capturedRequests });
      const sessionUri = URI.parse("test://session/depth0");
      await tool.invoke(createInvocation(sessionUri), countTokens, noProgress, CancellationToken.None);
      assert.strictEqual(capturedRequests.length, 1);
      assert.strictEqual(capturedRequests[0].userSelectedTools?.["runSubagent"], false);
    });
    test("enables runSubagent tool at depth 0 when nesting is enabled", async () => {
      const capturedRequests = [];
      const { tool } = createInvokableTool({ allowInvocationsFromSubagents: true, capturedRequests });
      const sessionUri = URI.parse("test://session/depth-enabled");
      await tool.invoke(createInvocation(sessionUri), countTokens, noProgress, CancellationToken.None);
      assert.strictEqual(capturedRequests.length, 1);
      assert.strictEqual(capturedRequests[0].userSelectedTools?.["runSubagent"], true);
    });
    test("disables runSubagent tool when depth reaches hard limit", async () => {
      const capturedRequests = [];
      const sessionUri = URI.parse("test://session/depth-limit");
      const { tool, mockChatAgentService } = createInvokableTool({ allowInvocationsFromSubagents: true, capturedRequests });
      capturedRequests.length = 0;
      let nestedInvocations = 0;
      mockChatAgentService.invokeAgent = async (_id, request) => {
        capturedRequests.push(request);
        if (nestedInvocations++ < RUN_SUBAGENT_MAX_NESTING_DEPTH + 1) {
          await tool.invoke(createInvocation(sessionUri), countTokens, noProgress, CancellationToken.None);
        }
        return {};
      };
      await tool.invoke(createInvocation(sessionUri), countTokens, noProgress, CancellationToken.None);
      assert.ok(capturedRequests.length >= 2);
      const enabledFlags = capturedRequests.map((r) => r.userSelectedTools?.["runSubagent"]);
      assert.strictEqual(enabledFlags[0], true);
      assert.strictEqual(enabledFlags[1], true);
      assert.strictEqual(enabledFlags[RUN_SUBAGENT_MAX_NESTING_DEPTH], false);
    });
    test("depth is decremented after invoke completes", async () => {
      const capturedRequests = [];
      const { tool } = createInvokableTool({ allowInvocationsFromSubagents: true, capturedRequests });
      const sessionUri = URI.parse("test://session/depth-decrement");
      await tool.invoke(createInvocation(sessionUri), countTokens, noProgress, CancellationToken.None);
      await tool.invoke(createInvocation(sessionUri), countTokens, noProgress, CancellationToken.None);
      assert.strictEqual(capturedRequests.length, 2);
      assert.strictEqual(capturedRequests[0].userSelectedTools?.["runSubagent"], true);
      assert.strictEqual(capturedRequests[1].userSelectedTools?.["runSubagent"], true);
    });
    test("inherits the current agent instructions when agentName is omitted", async () => {
      const capturedRequests = [];
      const currentModeInstructions = { name: "CurrentAgent", content: "Current agent instructions", toolReferences: [] };
      const { tool } = createInvokableTool({ allowInvocationsFromSubagents: false, capturedRequests, currentModeInstructions });
      const sessionUri = URI.parse("test://session/current-agent");
      await tool.invoke(createInvocation(sessionUri), countTokens, noProgress, CancellationToken.None);
      assert.strictEqual(capturedRequests.length, 1);
      assert.strictEqual(capturedRequests[0].subAgentName, "CurrentAgent");
      assert.deepStrictEqual(capturedRequests[0].modeInstructions, currentModeInstructions);
    });
  });
  suite("subagent credits", () => {
    let creditsCallIdCounter = 0;
    function createCreditTool(usageParts, result = {}) {
      const mockToolsService = testDisposables.add(new MockLanguageModelToolsService());
      const configService = new TestConfigurationService();
      const promptsService = new MockPromptsService();
      const parentCredits = [];
      const mockChatAgentService = {
        getDefaultAgent() {
          return { id: "default-agent" };
        },
        async invokeAgent(_id, _request, progress) {
          progress(usageParts);
          return result;
        }
      };
      const mockChatService = {
        getSession() {
          return {
            getRequests: () => [{
              id: "req-1",
              response: {
                setSubagentCopilotCredits: (subagentCallId, copilotCredits) => parentCredits.push({ subagentCallId, copilotCredits })
              }
            }],
            acceptResponseProgress: () => {
            }
          };
        }
      };
      const mockInstantiationService = {
        createInstance(..._args) {
          return { collect: async () => {
          } };
        }
      };
      const tool = testDisposables.add(new RunSubagentTool(
        mockChatAgentService,
        mockChatService,
        mockToolsService,
        {},
        new NullLogService(),
        configService,
        promptsService,
        mockInstantiationService,
        {}
      ));
      return { tool, parentCredits };
    }
    function createSubagentInvocation(chatStreamToolCallId) {
      return {
        callId: `credits-call-${++creditsCallIdCounter}`,
        chatStreamToolCallId,
        toolId: "runSubagent",
        parameters: { prompt: "do something", description: "test" },
        context: { sessionResource: URI.parse("test://session/credits") },
        userSelectedTools: { runSubagent: true },
        toolSpecificData: { kind: "subagent", description: "test" }
      };
    }
    const countTokens = async () => 0;
    const noProgress = { report() {
    } };
    test("writes the running credit total onto the subagent toolSpecificData", async () => {
      const { tool, parentCredits } = createCreditTool([
        { kind: "usage", promptTokens: 10, completionTokens: 5, copilotCredits: 2 },
        { kind: "usage", promptTokens: 20, completionTokens: 8, copilotCredits: 5 },
        { kind: "usage", promptTokens: 20, completionTokens: 8, copilotCredits: 3 }
      ]);
      const invocation = createSubagentInvocation("stream-tool-call");
      await tool.invoke(invocation, countTokens, noProgress, CancellationToken.None);
      assert.deepStrictEqual({
        toolCredits: invocation.toolSpecificData?.kind === "subagent" ? invocation.toolSpecificData.credits : void 0,
        parentCredits
      }, {
        toolCredits: 5,
        parentCredits: [{ subagentCallId: invocation.callId, copilotCredits: 5 }]
      });
    });
    test("records credits when the subagent fails after reporting usage", async () => {
      const { tool, parentCredits } = createCreditTool(
        [{ kind: "usage", promptTokens: 10, completionTokens: 5, copilotCredits: 3 }],
        { errorDetails: { message: "failed" } }
      );
      const invocation = createSubagentInvocation();
      await tool.invoke(invocation, countTokens, noProgress, CancellationToken.None);
      assert.deepStrictEqual({
        toolCredits: invocation.toolSpecificData?.kind === "subagent" ? invocation.toolSpecificData.credits : void 0,
        parentCredits
      }, {
        toolCredits: 3,
        parentCredits: [{ subagentCallId: invocation.callId, copilotCredits: 3 }]
      });
    });
    test("leaves credits unset when no usage is reported", async () => {
      const { tool } = createCreditTool([]);
      const invocation = createSubagentInvocation();
      await tool.invoke(invocation, countTokens, noProgress, CancellationToken.None);
      assert.strictEqual(invocation.toolSpecificData?.kind === "subagent" ? invocation.toolSpecificData.credits : void 0, void 0);
    });
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXGNoYXRcXHRlc3RcXGNvbW1vblxcdG9vbHNcXGJ1aWx0aW5Ub29sc1xccnVuU3ViYWdlbnRUb29sLnRlc3QudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgYXNzZXJ0IGZyb20gJ2Fzc2VydCc7XG5pbXBvcnQgeyBDYW5jZWxsYXRpb25Ub2tlbiB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2NhbmNlbGxhdGlvbi5qcyc7XG5pbXBvcnQgeyBVUkkgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi91cmkuanMnO1xuaW1wb3J0IHsgZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS90ZXN0L2NvbW1vbi91dGlscy5qcyc7XG5pbXBvcnQgeyBOdWxsTG9nU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2xvZy9jb21tb24vbG9nLmpzJztcbmltcG9ydCB7IFRlc3RDb25maWd1cmF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbmZpZ3VyYXRpb24vdGVzdC9jb21tb24vdGVzdENvbmZpZ3VyYXRpb25TZXJ2aWNlLmpzJztcbmltcG9ydCB7IFJVTl9TVUJBR0VOVF9NQVhfTkVTVElOR19ERVBUSCwgUnVuU3ViYWdlbnRUb29sIH0gZnJvbSAnLi4vLi4vLi4vLi4vY29tbW9uL3Rvb2xzL2J1aWx0aW5Ub29scy9ydW5TdWJhZ2VudFRvb2wuanMnO1xuaW1wb3J0IHsgTW9ja0xhbmd1YWdlTW9kZWxUb29sc1NlcnZpY2UgfSBmcm9tICcuLi9tb2NrTGFuZ3VhZ2VNb2RlbFRvb2xzU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJQ2hhdEFnZW50SGlzdG9yeUVudHJ5LCBJQ2hhdEFnZW50UmVxdWVzdCwgSUNoYXRBZ2VudFJlc3VsdCwgSUNoYXRBZ2VudFNlcnZpY2UsIFVzZXJTZWxlY3RlZFRvb2xzIH0gZnJvbSAnLi4vLi4vLi4vLi4vY29tbW9uL3BhcnRpY2lwYW50cy9jaGF0QWdlbnRzLmpzJztcbmltcG9ydCB7IElDaGF0UHJvZ3Jlc3MsIElDaGF0U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL2NvbW1vbi9jaGF0U2VydmljZS9jaGF0U2VydmljZS5qcyc7XG5pbXBvcnQgeyBDT1BJTE9UX1ZFTkRPUl9JRCwgSUxhbmd1YWdlTW9kZWxDaGF0TWV0YWRhdGEsIElMYW5ndWFnZU1vZGVsQ2hhdE1ldGFkYXRhQW5kSWRlbnRpZmllciwgSUxhbmd1YWdlTW9kZWxzU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL2NvbW1vbi9sYW5ndWFnZU1vZGVscy5qcyc7XG5pbXBvcnQgeyBJSW5zdGFudGlhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9pbnN0YW50aWF0aW9uL2NvbW1vbi9pbnN0YW50aWF0aW9uLmpzJztcbmltcG9ydCB7IElQcm9kdWN0U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL3Byb2R1Y3QvY29tbW9uL3Byb2R1Y3RTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElDdXN0b21BZ2VudCwgUHJvbXB0c1N0b3JhZ2UgfSBmcm9tICcuLi8uLi8uLi8uLi9jb21tb24vcHJvbXB0U3ludGF4L3NlcnZpY2UvcHJvbXB0c1NlcnZpY2UuanMnO1xuaW1wb3J0IHsgVGFyZ2V0IH0gZnJvbSAnLi4vLi4vLi4vLi4vY29tbW9uL3Byb21wdFN5bnRheC9wcm9tcHRUeXBlcy5qcyc7XG5pbXBvcnQgeyBNb2NrUHJvbXB0c1NlcnZpY2UgfSBmcm9tICcuLi8uLi9wcm9tcHRTeW50YXgvc2VydmljZS9tb2NrUHJvbXB0c1NlcnZpY2UuanMnO1xuaW1wb3J0IHsgRXh0ZW5zaW9uSWRlbnRpZmllciB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2V4dGVuc2lvbnMvY29tbW9uL2V4dGVuc2lvbnMuanMnO1xuaW1wb3J0IHsgSVRvb2xJbnZvY2F0aW9uLCBUb29sUHJvZ3Jlc3MgfSBmcm9tICcuLi8uLi8uLi8uLi9jb21tb24vdG9vbHMvbGFuZ3VhZ2VNb2RlbFRvb2xzU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJQ2hhdE1vZGVsLCBJQ2hhdFJlcXVlc3RNb2RlSW5zdHJ1Y3Rpb25zIH0gZnJvbSAnLi4vLi4vLi4vLi4vY29tbW9uL21vZGVsL2NoYXRNb2RlbC5qcyc7XG5pbXBvcnQgeyBDaGF0Q29uZmlndXJhdGlvbiB9IGZyb20gJy4uLy4uLy4uLy4uL2NvbW1vbi9jb25zdGFudHMuanMnO1xuXG5zdWl0ZSgnUnVuU3ViYWdlbnRUb29sJywgKCkgPT4ge1xuXHRjb25zdCB0ZXN0RGlzcG9zYWJsZXMgPSBlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUoKTtcblxuXHRzdWl0ZSgncmVzdWx0VGV4dCB0cmltbWluZycsICgpID0+IHtcblx0XHR0ZXN0KCd0cmltcyBsZWFkaW5nIGVtcHR5IGNvZGVibG9ja3MgKGBgYFxcXFxuYGBgKSBmcm9tIHJlc3VsdCcsICgpID0+IHtcblx0XHRcdC8vIFRoaXMgdGVzdHMgdGhlIHJlZ2V4OiAvXlxcbipgYGBcXG4rYGBgXFxuKi9nXG5cdFx0XHRjb25zdCB0ZXN0Q2FzZXMgPSBbXG5cdFx0XHRcdHsgaW5wdXQ6ICdgYGBcXG5gYGBcXG5BY3R1YWwgY29udGVudCcsIGV4cGVjdGVkOiAnQWN0dWFsIGNvbnRlbnQnIH0sXG5cdFx0XHRcdHsgaW5wdXQ6ICdcXG5gYGBcXG5gYGBcXG5BY3R1YWwgY29udGVudCcsIGV4cGVjdGVkOiAnQWN0dWFsIGNvbnRlbnQnIH0sXG5cdFx0XHRcdHsgaW5wdXQ6ICdcXG5cXG5gYGBcXG5cXG5gYGBcXG5cXG5BY3R1YWwgY29udGVudCcsIGV4cGVjdGVkOiAnQWN0dWFsIGNvbnRlbnQnIH0sXG5cdFx0XHRcdHsgaW5wdXQ6ICdgYGBcXG5gYGBcXG5gYGBcXG5gYGBcXG5BY3R1YWwgY29udGVudCcsIGV4cGVjdGVkOiAnYGBgXFxuYGBgXFxuQWN0dWFsIGNvbnRlbnQnIH0sIC8vIE9ubHkgdHJpbXMgbGVhZGluZ1xuXHRcdFx0XHR7IGlucHV0OiAnTm8gY29kZWJsb2NrIGhlcmUnLCBleHBlY3RlZDogJ05vIGNvZGVibG9jayBoZXJlJyB9LFxuXHRcdFx0XHR7IGlucHV0OiAnYGBgXFxuYGBgXFxuJywgZXhwZWN0ZWQ6ICcnIH0sXG5cdFx0XHRcdHsgaW5wdXQ6ICcnLCBleHBlY3RlZDogJycgfSxcblx0XHRcdF07XG5cblx0XHRcdGZvciAoY29uc3QgeyBpbnB1dCwgZXhwZWN0ZWQgfSBvZiB0ZXN0Q2FzZXMpIHtcblx0XHRcdFx0Y29uc3QgcmVzdWx0ID0gaW5wdXQucmVwbGFjZSgvXlxcbipgYGBcXG4rYGBgXFxuKi9nLCAnJykudHJpbSgpO1xuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0LCBleHBlY3RlZCwgYEZhaWxlZCBmb3IgaW5wdXQ6ICR7SlNPTi5zdHJpbmdpZnkoaW5wdXQpfWApO1xuXHRcdFx0fVxuXHRcdH0pO1xuXHR9KTtcblxuXHRzdWl0ZSgncHJlcGFyZVRvb2xJbnZvY2F0aW9uJywgKCkgPT4ge1xuXHRcdHRlc3QoJ3JldHVybnMgY29ycmVjdCB0b29sU3BlY2lmaWNEYXRhJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgbW9ja1Rvb2xzU2VydmljZSA9IHRlc3REaXNwb3NhYmxlcy5hZGQobmV3IE1vY2tMYW5ndWFnZU1vZGVsVG9vbHNTZXJ2aWNlKCkpO1xuXG5cdFx0XHRjb25zdCBwcm9tcHRzU2VydmljZSA9IG5ldyBNb2NrUHJvbXB0c1NlcnZpY2UoKTtcblx0XHRcdGNvbnN0IGN1c3RvbU1vZGU6IElDdXN0b21BZ2VudCA9IHtcblx0XHRcdFx0aWQ6ICdmaWxlOi8vL3Rlc3QvY3VzdG9tLWFnZW50Lm1kJyxcblx0XHRcdFx0dXJpOiBVUkkucGFyc2UoJ2ZpbGU6Ly8vdGVzdC9jdXN0b20tYWdlbnQubWQnKSxcblx0XHRcdFx0bmFtZTogJ0N1c3RvbUFnZW50Jyxcblx0XHRcdFx0ZGVzY3JpcHRpb246ICdBIHRlc3QgY3VzdG9tIGFnZW50Jyxcblx0XHRcdFx0dG9vbHM6IFsndG9vbDEnLCAndG9vbDInXSxcblx0XHRcdFx0YWdlbnRJbnN0cnVjdGlvbnM6IHsgY29udGVudDogJ0N1c3RvbSBhZ2VudCBib2R5JywgdG9vbFJlZmVyZW5jZXM6IFtdIH0sXG5cdFx0XHRcdHNvdXJjZTogeyBzdG9yYWdlOiBQcm9tcHRzU3RvcmFnZS5sb2NhbCB9LFxuXHRcdFx0XHR0YXJnZXQ6IFRhcmdldC5VbmRlZmluZWQsXG5cdFx0XHRcdHZpc2liaWxpdHk6IHsgdXNlckludm9jYWJsZTogdHJ1ZSwgYWdlbnRJbnZvY2FibGU6IHRydWUgfSxcblx0XHRcdFx0ZW5hYmxlZDogdHJ1ZVxuXHRcdFx0fTtcblx0XHRcdHByb21wdHNTZXJ2aWNlLnNldEN1c3RvbU1vZGVzKFtjdXN0b21Nb2RlXSk7XG5cblx0XHRcdGNvbnN0IHRvb2wgPSB0ZXN0RGlzcG9zYWJsZXMuYWRkKG5ldyBSdW5TdWJhZ2VudFRvb2woXG5cdFx0XHRcdHt9IGFzIElDaGF0QWdlbnRTZXJ2aWNlLFxuXHRcdFx0XHR7fSBhcyBJQ2hhdFNlcnZpY2UsXG5cdFx0XHRcdG1vY2tUb29sc1NlcnZpY2UsXG5cdFx0XHRcdHt9IGFzIElMYW5ndWFnZU1vZGVsc1NlcnZpY2UsXG5cdFx0XHRcdG5ldyBOdWxsTG9nU2VydmljZSgpLFxuXHRcdFx0XHRuZXcgVGVzdENvbmZpZ3VyYXRpb25TZXJ2aWNlKCksXG5cdFx0XHRcdHByb21wdHNTZXJ2aWNlLFxuXHRcdFx0XHR7fSBhcyBJSW5zdGFudGlhdGlvblNlcnZpY2UsXG5cdFx0XHRcdHt9IGFzIElQcm9kdWN0U2VydmljZSxcblx0XHRcdCkpO1xuXG5cdFx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCB0b29sLnByZXBhcmVUb29sSW52b2NhdGlvbihcblx0XHRcdFx0e1xuXHRcdFx0XHRcdHBhcmFtZXRlcnM6IHtcblx0XHRcdFx0XHRcdHByb21wdDogJ1Rlc3QgcHJvbXB0Jyxcblx0XHRcdFx0XHRcdGRlc2NyaXB0aW9uOiAnVGVzdCB0YXNrJyxcblx0XHRcdFx0XHRcdGFnZW50TmFtZTogJ0N1c3RvbUFnZW50Jyxcblx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdHRvb2xDYWxsSWQ6ICd0ZXN0LWNhbGwtMScsXG5cdFx0XHRcdFx0Y2hhdFNlc3Npb25SZXNvdXJjZTogVVJJLnBhcnNlKCd0ZXN0Oi8vc2Vzc2lvbicpLFxuXHRcdFx0XHR9LFxuXHRcdFx0XHRDYW5jZWxsYXRpb25Ub2tlbi5Ob25lXG5cdFx0XHQpO1xuXG5cdFx0XHRhc3NlcnQub2socmVzdWx0KTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQuaW52b2NhdGlvbk1lc3NhZ2UsICdUZXN0IHRhc2snKTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocmVzdWx0LnRvb2xTcGVjaWZpY0RhdGEsIHtcblx0XHRcdFx0a2luZDogJ3N1YmFnZW50Jyxcblx0XHRcdFx0ZGVzY3JpcHRpb246ICdUZXN0IHRhc2snLFxuXHRcdFx0XHRhZ2VudE5hbWU6ICdDdXN0b21BZ2VudCcsXG5cdFx0XHRcdHByb21wdDogJ1Rlc3QgcHJvbXB0Jyxcblx0XHRcdFx0bW9kZWxOYW1lOiB1bmRlZmluZWQsXG5cdFx0XHR9KTtcblx0XHR9KTtcblxuXHRcdGZ1bmN0aW9uIGNyZWF0ZVRvb2wob3B0cz86IHsgY3VzdG9tQWdlbnRzPzogSUN1c3RvbUFnZW50W10gfSkge1xuXHRcdFx0Y29uc3QgbW9ja1Rvb2xzU2VydmljZSA9IHRlc3REaXNwb3NhYmxlcy5hZGQobmV3IE1vY2tMYW5ndWFnZU1vZGVsVG9vbHNTZXJ2aWNlKCkpO1xuXHRcdFx0Y29uc3QgcHJvbXB0c1NlcnZpY2UgPSBuZXcgTW9ja1Byb21wdHNTZXJ2aWNlKCk7XG5cdFx0XHRpZiAob3B0cz8uY3VzdG9tQWdlbnRzKSB7XG5cdFx0XHRcdHByb21wdHNTZXJ2aWNlLnNldEN1c3RvbU1vZGVzKG9wdHMuY3VzdG9tQWdlbnRzKTtcblx0XHRcdH1cblxuXHRcdFx0Y29uc3QgdG9vbCA9IHRlc3REaXNwb3NhYmxlcy5hZGQobmV3IFJ1blN1YmFnZW50VG9vbChcblx0XHRcdFx0e30gYXMgSUNoYXRBZ2VudFNlcnZpY2UsXG5cdFx0XHRcdHt9IGFzIElDaGF0U2VydmljZSxcblx0XHRcdFx0bW9ja1Rvb2xzU2VydmljZSxcblx0XHRcdFx0e30gYXMgSUxhbmd1YWdlTW9kZWxzU2VydmljZSxcblx0XHRcdFx0bmV3IE51bGxMb2dTZXJ2aWNlKCksXG5cdFx0XHRcdG5ldyBUZXN0Q29uZmlndXJhdGlvblNlcnZpY2UoKSxcblx0XHRcdFx0cHJvbXB0c1NlcnZpY2UsXG5cdFx0XHRcdHt9IGFzIElJbnN0YW50aWF0aW9uU2VydmljZSxcblx0XHRcdFx0e30gYXMgSVByb2R1Y3RTZXJ2aWNlLFxuXHRcdFx0KSk7XG5cdFx0XHRyZXR1cm4gdG9vbDtcblx0XHR9XG5cblx0XHR0ZXN0KCdwYXNzZXMgdGhyb3VnaCB1bmtub3duIGFnZW50TmFtZScsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IHRvb2wgPSBjcmVhdGVUb29sKCk7XG5cblx0XHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IHRvb2wucHJlcGFyZVRvb2xJbnZvY2F0aW9uKFxuXHRcdFx0XHR7XG5cdFx0XHRcdFx0cGFyYW1ldGVyczogeyBwcm9tcHQ6ICdUZXN0IHByb21wdCcsIGRlc2NyaXB0aW9uOiAnVGVzdCB0YXNrJywgYWdlbnROYW1lOiAnTm9uRXhpc3RlbnRBZ2VudCcgfSxcblx0XHRcdFx0XHR0b29sQ2FsbElkOiAndGVzdC1jYWxsLXVua25vd24nLFxuXHRcdFx0XHRcdGNoYXRTZXNzaW9uUmVzb3VyY2U6IFVSSS5wYXJzZSgndGVzdDovL3Nlc3Npb24nKSxcblx0XHRcdFx0fSxcblx0XHRcdFx0Q2FuY2VsbGF0aW9uVG9rZW4uTm9uZVxuXHRcdFx0KTtcblxuXHRcdFx0YXNzZXJ0Lm9rKHJlc3VsdCk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHJlc3VsdC50b29sU3BlY2lmaWNEYXRhLCB7XG5cdFx0XHRcdGtpbmQ6ICdzdWJhZ2VudCcsXG5cdFx0XHRcdGRlc2NyaXB0aW9uOiAnVGVzdCB0YXNrJyxcblx0XHRcdFx0YWdlbnROYW1lOiAnTm9uRXhpc3RlbnRBZ2VudCcsXG5cdFx0XHRcdHByb21wdDogJ1Rlc3QgcHJvbXB0Jyxcblx0XHRcdFx0bW9kZWxOYW1lOiB1bmRlZmluZWQsXG5cdFx0XHR9KTtcblx0XHR9KTtcblx0fSk7XG5cblx0c3VpdGUoJ2dldFRvb2xEYXRhJywgKCkgPT4ge1xuXHRcdHRlc3QoJ3JldHVybnMgYmFzaWMgdG9vbCBkYXRhJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgbW9ja1Rvb2xzU2VydmljZSA9IHRlc3REaXNwb3NhYmxlcy5hZGQobmV3IE1vY2tMYW5ndWFnZU1vZGVsVG9vbHNTZXJ2aWNlKCkpO1xuXHRcdFx0Y29uc3QgcHJvbXB0c1NlcnZpY2UgPSBuZXcgTW9ja1Byb21wdHNTZXJ2aWNlKCk7XG5cblx0XHRcdGNvbnN0IHRvb2wgPSB0ZXN0RGlzcG9zYWJsZXMuYWRkKG5ldyBSdW5TdWJhZ2VudFRvb2woXG5cdFx0XHRcdHt9IGFzIElDaGF0QWdlbnRTZXJ2aWNlLFxuXHRcdFx0XHR7fSBhcyBJQ2hhdFNlcnZpY2UsXG5cdFx0XHRcdG1vY2tUb29sc1NlcnZpY2UsXG5cdFx0XHRcdHt9IGFzIElMYW5ndWFnZU1vZGVsc1NlcnZpY2UsXG5cdFx0XHRcdG5ldyBOdWxsTG9nU2VydmljZSgpLFxuXHRcdFx0XHRuZXcgVGVzdENvbmZpZ3VyYXRpb25TZXJ2aWNlKCksXG5cdFx0XHRcdHByb21wdHNTZXJ2aWNlLFxuXHRcdFx0XHR7fSBhcyBJSW5zdGFudGlhdGlvblNlcnZpY2UsXG5cdFx0XHRcdHt9IGFzIElQcm9kdWN0U2VydmljZSxcblx0XHRcdCkpO1xuXG5cdFx0XHRjb25zdCB0b29sRGF0YSA9IHRvb2wuZ2V0VG9vbERhdGEoKTtcblxuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHRvb2xEYXRhLmlkLCAncnVuU3ViYWdlbnQnKTtcblx0XHRcdGFzc2VydC5vayh0b29sRGF0YS5pbnB1dFNjaGVtYSk7XG5cdFx0XHRhc3NlcnQub2sodG9vbERhdGEuaW5wdXRTY2hlbWEucHJvcGVydGllcz8ucHJvbXB0KTtcblx0XHRcdGFzc2VydC5vayh0b29sRGF0YS5pbnB1dFNjaGVtYS5wcm9wZXJ0aWVzPy5kZXNjcmlwdGlvbik7XG5cdFx0XHRhc3NlcnQub2sodG9vbERhdGEuaW5wdXRTY2hlbWEucHJvcGVydGllcz8uYWdlbnROYW1lLCAnYWdlbnROYW1lIHNob3VsZCBiZSBpbiBzY2hlbWEgcHJvcGVydGllcycpO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh0b29sRGF0YS5pbnB1dFNjaGVtYS5yZXF1aXJlZCwgWydwcm9tcHQnLCAnZGVzY3JpcHRpb24nXSk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHN1aXRlKCdvbkRpZEludm9rZVRvb2wgZXZlbnQnLCAoKSA9PiB7XG5cdFx0dGVzdCgnbW9jayBzZXJ2aWNlIGZpcmVzIG9uRGlkSW52b2tlVG9vbCBldmVudHMgd2l0aCBjb3JyZWN0IGRhdGEnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBtb2NrVG9vbHNTZXJ2aWNlID0gdGVzdERpc3Bvc2FibGVzLmFkZChuZXcgTW9ja0xhbmd1YWdlTW9kZWxUb29sc1NlcnZpY2UoKSk7XG5cdFx0XHRjb25zdCBzZXNzaW9uUmVzb3VyY2UgPSBVUkkucGFyc2UoJ3Rlc3Q6Ly9zZXNzaW9uJyk7XG5cdFx0XHRjb25zdCByZWNlaXZlZEV2ZW50czogeyB0b29sSWQ6IHN0cmluZzsgc2Vzc2lvblJlc291cmNlOiBVUkkgfCB1bmRlZmluZWQ7IHJlcXVlc3RJZDogc3RyaW5nIHwgdW5kZWZpbmVkOyBzdWJhZ2VudEludm9jYXRpb25JZDogc3RyaW5nIHwgdW5kZWZpbmVkIH1bXSA9IFtdO1xuXG5cdFx0XHR0ZXN0RGlzcG9zYWJsZXMuYWRkKG1vY2tUb29sc1NlcnZpY2Uub25EaWRJbnZva2VUb29sKGUgPT4ge1xuXHRcdFx0XHRyZWNlaXZlZEV2ZW50cy5wdXNoKGUpO1xuXHRcdFx0fSkpO1xuXG5cdFx0XHRtb2NrVG9vbHNTZXJ2aWNlLmZpcmVPbkRpZEludm9rZVRvb2woe1xuXHRcdFx0XHR0b29sSWQ6ICd0ZXN0LXRvb2wnLFxuXHRcdFx0XHRzZXNzaW9uUmVzb3VyY2UsXG5cdFx0XHRcdHJlcXVlc3RJZDogJ3JlcXVlc3QtMTIzJyxcblx0XHRcdFx0c3ViYWdlbnRJbnZvY2F0aW9uSWQ6ICdzdWJhZ2VudC00NTYnLFxuXHRcdFx0fSk7XG5cblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZWNlaXZlZEV2ZW50cy5sZW5ndGgsIDEpO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChyZWNlaXZlZEV2ZW50c1swXSwge1xuXHRcdFx0XHR0b29sSWQ6ICd0ZXN0LXRvb2wnLFxuXHRcdFx0XHRzZXNzaW9uUmVzb3VyY2UsXG5cdFx0XHRcdHJlcXVlc3RJZDogJ3JlcXVlc3QtMTIzJyxcblx0XHRcdFx0c3ViYWdlbnRJbnZvY2F0aW9uSWQ6ICdzdWJhZ2VudC00NTYnLFxuXHRcdFx0fSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdldmVudHMgd2l0aCBkaWZmZXJlbnQgc3ViYWdlbnRJbnZvY2F0aW9uSWQgYXJlIGRpc3Rpbmd1aXNoYWJsZScsICgpID0+IHtcblx0XHRcdC8vIFRoaXMgdGVzdHMgdGhlIGZpbHRlcmluZyBsb2dpYyB1c2VkIGluIFJ1blN1YmFnZW50VG9vbC5pbnZva2UoKVxuXHRcdFx0Ly8gVGhlIHRvb2wgc3Vic2NyaWJlcyB0byBvbkRpZEludm9rZVRvb2wgYW5kIGNoZWNrcyBpZiBlLnN1YmFnZW50SW52b2NhdGlvbklkIG1hdGNoZXMgaXRzIG93biBjYWxsSWRcblx0XHRcdGNvbnN0IG1vY2tUb29sc1NlcnZpY2UgPSB0ZXN0RGlzcG9zYWJsZXMuYWRkKG5ldyBNb2NrTGFuZ3VhZ2VNb2RlbFRvb2xzU2VydmljZSgpKTtcblx0XHRcdGNvbnN0IHRhcmdldFN1YmFnZW50SWQgPSAndGFyZ2V0LXN1YmFnZW50JztcblxuXHRcdFx0Y29uc3QgbWF0Y2hpbmdFdmVudHM6IHN0cmluZ1tdID0gW107XG5cdFx0XHR0ZXN0RGlzcG9zYWJsZXMuYWRkKG1vY2tUb29sc1NlcnZpY2Uub25EaWRJbnZva2VUb29sKGUgPT4ge1xuXHRcdFx0XHRpZiAoZS5zdWJhZ2VudEludm9jYXRpb25JZCA9PT0gdGFyZ2V0U3ViYWdlbnRJZCkge1xuXHRcdFx0XHRcdG1hdGNoaW5nRXZlbnRzLnB1c2goZS50b29sSWQpO1xuXHRcdFx0XHR9XG5cdFx0XHR9KSk7XG5cblx0XHRcdC8vIEZpcmUgZXZlbnRzIHdpdGggZGlmZmVyZW50IHN1YmFnZW50SW52b2NhdGlvbklkc1xuXHRcdFx0bW9ja1Rvb2xzU2VydmljZS5maXJlT25EaWRJbnZva2VUb29sKHtcblx0XHRcdFx0dG9vbElkOiAndW5yZWxhdGVkLXRvb2wnLFxuXHRcdFx0XHRzZXNzaW9uUmVzb3VyY2U6IHVuZGVmaW5lZCxcblx0XHRcdFx0cmVxdWVzdElkOiB1bmRlZmluZWQsXG5cdFx0XHRcdHN1YmFnZW50SW52b2NhdGlvbklkOiAnZGlmZmVyZW50LXN1YmFnZW50Jyxcblx0XHRcdH0pO1xuXHRcdFx0bW9ja1Rvb2xzU2VydmljZS5maXJlT25EaWRJbnZva2VUb29sKHtcblx0XHRcdFx0dG9vbElkOiAnbWF0Y2hpbmctdG9vbCcsXG5cdFx0XHRcdHNlc3Npb25SZXNvdXJjZTogdW5kZWZpbmVkLFxuXHRcdFx0XHRyZXF1ZXN0SWQ6IHVuZGVmaW5lZCxcblx0XHRcdFx0c3ViYWdlbnRJbnZvY2F0aW9uSWQ6IHRhcmdldFN1YmFnZW50SWQsXG5cdFx0XHR9KTtcblx0XHRcdG1vY2tUb29sc1NlcnZpY2UuZmlyZU9uRGlkSW52b2tlVG9vbCh7XG5cdFx0XHRcdHRvb2xJZDogJ2Fub3RoZXItdW5yZWxhdGVkLXRvb2wnLFxuXHRcdFx0XHRzZXNzaW9uUmVzb3VyY2U6IHVuZGVmaW5lZCxcblx0XHRcdFx0cmVxdWVzdElkOiB1bmRlZmluZWQsXG5cdFx0XHRcdHN1YmFnZW50SW52b2NhdGlvbklkOiB1bmRlZmluZWQsXG5cdFx0XHR9KTtcblxuXHRcdFx0Ly8gT25seSB0aGUgbWF0Y2hpbmcgZXZlbnQgc2hvdWxkIGJlIGNhcHR1cmVkXG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKG1hdGNoaW5nRXZlbnRzLCBbJ21hdGNoaW5nLXRvb2wnXSk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHN1aXRlKCdtb2RlbCBmYWxsYmFjayBiZWhhdmlvcicsICgpID0+IHtcblx0XHRjb25zdCBCVUlMVElOX0NIQVRfRVhURU5TSU9OX0lEID0gJ2dpdGh1Yi5jb3BpbG90LWNoYXQnO1xuXHRcdGNvbnN0IGJ1aWx0aW5Qcm9kdWN0U2VydmljZSA9IHsgZGVmYXVsdENoYXRBZ2VudDogeyBjaGF0RXh0ZW5zaW9uSWQ6IEJVSUxUSU5fQ0hBVF9FWFRFTlNJT05fSUQgfSB9IGFzIElQcm9kdWN0U2VydmljZTtcblxuXHRcdGZ1bmN0aW9uIGNyZWF0ZU1ldGFkYXRhKG5hbWU6IHN0cmluZywgbXVsdGlwbGllck51bWVyaWM/OiBudW1iZXIsIHZlbmRvcjogc3RyaW5nID0gJ1Rlc3RWZW5kb3InKTogSUxhbmd1YWdlTW9kZWxDaGF0TWV0YWRhdGEge1xuXHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0ZXh0ZW5zaW9uOiBuZXcgRXh0ZW5zaW9uSWRlbnRpZmllcigndGVzdC5leHRlbnNpb24nKSxcblx0XHRcdFx0bmFtZSxcblx0XHRcdFx0aWQ6IG5hbWUudG9Mb3dlckNhc2UoKS5yZXBsYWNlKC9cXHMrL2csICctJyksXG5cdFx0XHRcdHZlbmRvcixcblx0XHRcdFx0dmVyc2lvbjogJzEuMCcsXG5cdFx0XHRcdGZhbWlseTogJ3Rlc3QnLFxuXHRcdFx0XHRtYXhJbnB1dFRva2VuczogMTI4MDAwLFxuXHRcdFx0XHRtYXhPdXRwdXRUb2tlbnM6IDgxOTIsXG5cdFx0XHRcdGlzRGVmYXVsdEZvckxvY2F0aW9uOiB7fSxcblx0XHRcdFx0bXVsdGlwbGllck51bWVyaWMsXG5cdFx0XHRcdGNhcGFiaWxpdGllczogeyB0b29sQ2FsbGluZzogdHJ1ZSB9LFxuXHRcdFx0XHRpc0JZT0s6IHZlbmRvciAhPT0gQ09QSUxPVF9WRU5ET1JfSUQsXG5cdFx0XHR9O1xuXHRcdH1cblxuXHRcdGZ1bmN0aW9uIGNyZWF0ZVRvb2wob3B0czoge1xuXHRcdFx0bW9kZWxzOiBNYXA8c3RyaW5nLCBJTGFuZ3VhZ2VNb2RlbENoYXRNZXRhZGF0YT47XG5cdFx0XHRxdWFsaWZpZWROYW1lTWFwPzogTWFwPHN0cmluZywgSUxhbmd1YWdlTW9kZWxDaGF0TWV0YWRhdGFBbmRJZGVudGlmaWVyPjtcblx0XHRcdGN1c3RvbUFnZW50cz86IElDdXN0b21BZ2VudFtdO1xuXHRcdH0pIHtcblx0XHRcdGNvbnN0IG1vY2tUb29sc1NlcnZpY2UgPSB0ZXN0RGlzcG9zYWJsZXMuYWRkKG5ldyBNb2NrTGFuZ3VhZ2VNb2RlbFRvb2xzU2VydmljZSgpKTtcblx0XHRcdGNvbnN0IHByb21wdHNTZXJ2aWNlID0gbmV3IE1vY2tQcm9tcHRzU2VydmljZSgpO1xuXHRcdFx0aWYgKG9wdHMuY3VzdG9tQWdlbnRzKSB7XG5cdFx0XHRcdHByb21wdHNTZXJ2aWNlLnNldEN1c3RvbU1vZGVzKG9wdHMuY3VzdG9tQWdlbnRzKTtcblx0XHRcdH1cblxuXHRcdFx0Y29uc3QgbW9ja0xhbmd1YWdlTW9kZWxzU2VydmljZTogUGFydGlhbDxJTGFuZ3VhZ2VNb2RlbHNTZXJ2aWNlPiA9IHtcblx0XHRcdFx0Z2V0TGFuZ3VhZ2VNb2RlbElkcygpIHtcblx0XHRcdFx0XHRyZXR1cm4gQXJyYXkuZnJvbShvcHRzLm1vZGVscy5rZXlzKCkpO1xuXHRcdFx0XHR9LFxuXHRcdFx0XHRsb29rdXBMYW5ndWFnZU1vZGVsKG1vZGVsSWQ6IHN0cmluZykge1xuXHRcdFx0XHRcdHJldHVybiBvcHRzLm1vZGVscy5nZXQobW9kZWxJZCk7XG5cdFx0XHRcdH0sXG5cdFx0XHRcdGxvb2t1cExhbmd1YWdlTW9kZWxCeVF1YWxpZmllZE5hbWUocXVhbGlmaWVkTmFtZTogc3RyaW5nKSB7XG5cdFx0XHRcdFx0cmV0dXJuIG9wdHMucXVhbGlmaWVkTmFtZU1hcD8uZ2V0KHF1YWxpZmllZE5hbWUpO1xuXHRcdFx0XHR9LFxuXHRcdFx0fTtcblxuXHRcdFx0Y29uc3QgdG9vbCA9IHRlc3REaXNwb3NhYmxlcy5hZGQobmV3IFJ1blN1YmFnZW50VG9vbChcblx0XHRcdFx0e30gYXMgSUNoYXRBZ2VudFNlcnZpY2UsXG5cdFx0XHRcdHt9IGFzIElDaGF0U2VydmljZSxcblx0XHRcdFx0bW9ja1Rvb2xzU2VydmljZSxcblx0XHRcdFx0bW9ja0xhbmd1YWdlTW9kZWxzU2VydmljZSBhcyBJTGFuZ3VhZ2VNb2RlbHNTZXJ2aWNlLFxuXHRcdFx0XHRuZXcgTnVsbExvZ1NlcnZpY2UoKSxcblx0XHRcdFx0bmV3IFRlc3RDb25maWd1cmF0aW9uU2VydmljZSgpLFxuXHRcdFx0XHRwcm9tcHRzU2VydmljZSxcblx0XHRcdFx0e30gYXMgSUluc3RhbnRpYXRpb25TZXJ2aWNlLFxuXHRcdFx0XHRidWlsdGluUHJvZHVjdFNlcnZpY2UsXG5cdFx0XHQpKTtcblxuXHRcdFx0cmV0dXJuIHRvb2w7XG5cdFx0fVxuXG5cdFx0ZnVuY3Rpb24gY3JlYXRlQWdlbnQobmFtZTogc3RyaW5nLCBtb2RlbFF1YWxpZmllZE5hbWVzPzogc3RyaW5nW10pOiBJQ3VzdG9tQWdlbnQge1xuXHRcdFx0Y29uc3QgaWQgPSBgZmlsZTovLy90ZXN0LyR7bmFtZX0ubWRgO1xuXHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0dXJpOiBVUkkucGFyc2UoaWQpLFxuXHRcdFx0XHRpZCxcblx0XHRcdFx0bmFtZSxcblx0XHRcdFx0ZGVzY3JpcHRpb246IGBBZ2VudCAke25hbWV9YCxcblx0XHRcdFx0dG9vbHM6IFsndG9vbDEnXSxcblx0XHRcdFx0bW9kZWw6IG1vZGVsUXVhbGlmaWVkTmFtZXMsXG5cdFx0XHRcdGFnZW50SW5zdHJ1Y3Rpb25zOiB7IGNvbnRlbnQ6ICd0ZXN0JywgdG9vbFJlZmVyZW5jZXM6IFtdIH0sXG5cdFx0XHRcdHNvdXJjZTogeyBzdG9yYWdlOiBQcm9tcHRzU3RvcmFnZS5sb2NhbCB9LFxuXHRcdFx0XHR0YXJnZXQ6IFRhcmdldC5VbmRlZmluZWQsXG5cdFx0XHRcdHZpc2liaWxpdHk6IHsgdXNlckludm9jYWJsZTogdHJ1ZSwgYWdlbnRJbnZvY2FibGU6IHRydWUgfSxcblx0XHRcdFx0ZW5hYmxlZDogdHJ1ZVxuXHRcdFx0fTtcblx0XHR9XG5cblx0XHQvLyBBIGJ1aWx0LWluIChleHRlbnNpb24tc2hpcHBlZCkgYWdlbnQgc3VjaCBhcyBFeHBsb3JlLCB3aG9zZSBtb2RlbCBsaXN0IGlzIGEgY3VyYXRlZCBmYWxsYmFjayBsaXN0LlxuXHRcdGZ1bmN0aW9uIGNyZWF0ZUJ1aWx0aW5BZ2VudChuYW1lOiBzdHJpbmcsIG1vZGVsUXVhbGlmaWVkTmFtZXM/OiBzdHJpbmdbXSk6IElDdXN0b21BZ2VudCB7XG5cdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHQuLi5jcmVhdGVBZ2VudChuYW1lLCBtb2RlbFF1YWxpZmllZE5hbWVzKSxcblx0XHRcdFx0c291cmNlOiB7IHN0b3JhZ2U6IFByb21wdHNTdG9yYWdlLmV4dGVuc2lvbiwgZXh0ZW5zaW9uSWQ6IG5ldyBFeHRlbnNpb25JZGVudGlmaWVyKEJVSUxUSU5fQ0hBVF9FWFRFTlNJT05fSUQpIH0sXG5cdFx0XHR9O1xuXHRcdH1cblxuXHRcdHRlc3QoJ3Rocm93cyBlcnJvciB3aGVuIHN1YmFnZW50IG1vZGVsIGhhcyBoaWdoZXIgbXVsdGlwbGllcicsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IG1haW5NZXRhID0gY3JlYXRlTWV0YWRhdGEoJ0dQVC00bycsIDEpO1xuXHRcdFx0Y29uc3QgZXhwZW5zaXZlTWV0YSA9IGNyZWF0ZU1ldGFkYXRhKCdPMyBQcm8nLCA1MCk7XG5cdFx0XHRjb25zdCBtb2RlbHMgPSBuZXcgTWFwKFtcblx0XHRcdFx0WydtYWluLW1vZGVsLWlkJywgbWFpbk1ldGFdLFxuXHRcdFx0XHRbJ2V4cGVuc2l2ZS1tb2RlbC1pZCcsIGV4cGVuc2l2ZU1ldGFdLFxuXHRcdFx0XSk7XG5cdFx0XHRjb25zdCBxdWFsaWZpZWROYW1lTWFwID0gbmV3IE1hcChbXG5cdFx0XHRcdFsnTzMgUHJvIChUZXN0VmVuZG9yKScsIHsgbWV0YWRhdGE6IGV4cGVuc2l2ZU1ldGEsIGlkZW50aWZpZXI6ICdleHBlbnNpdmUtbW9kZWwtaWQnIH1dLFxuXHRcdFx0XSk7XG5cblx0XHRcdGNvbnN0IGFnZW50ID0gY3JlYXRlQWdlbnQoJ0V4cGVuc2l2ZUFnZW50JywgWydPMyBQcm8gKFRlc3RWZW5kb3IpJ10pO1xuXHRcdFx0Y29uc3QgdG9vbCA9IGNyZWF0ZVRvb2woeyBtb2RlbHMsIHF1YWxpZmllZE5hbWVNYXAsIGN1c3RvbUFnZW50czogW2FnZW50XSB9KTtcblxuXHRcdFx0YXdhaXQgYXNzZXJ0LnJlamVjdHMoXG5cdFx0XHRcdCgpID0+IHRvb2wucHJlcGFyZVRvb2xJbnZvY2F0aW9uKHtcblx0XHRcdFx0XHRwYXJhbWV0ZXJzOiB7IHByb21wdDogJ3Rlc3QnLCBkZXNjcmlwdGlvbjogJ3Rlc3QgdGFzaycsIGFnZW50TmFtZTogJ0V4cGVuc2l2ZUFnZW50JyB9LFxuXHRcdFx0XHRcdHRvb2xDYWxsSWQ6ICdjYWxsLTEnLFxuXHRcdFx0XHRcdG1vZGVsSWQ6ICdtYWluLW1vZGVsLWlkJyxcblx0XHRcdFx0XHRjaGF0U2Vzc2lvblJlc291cmNlOiBVUkkucGFyc2UoJ3Rlc3Q6Ly9zZXNzaW9uJyksXG5cdFx0XHRcdH0sIENhbmNlbGxhdGlvblRva2VuLk5vbmUpLFxuXHRcdFx0XHQoZXJyOiBFcnJvcikgPT4ge1xuXHRcdFx0XHRcdGFzc2VydC5vayhlcnIubWVzc2FnZS5pbmNsdWRlcygnTzMgUHJvJykpO1xuXHRcdFx0XHRcdGFzc2VydC5vayhlcnIubWVzc2FnZS5pbmNsdWRlcygnZXhjZWVkcycpKTtcblx0XHRcdFx0XHRhc3NlcnQub2soZXJyLm1lc3NhZ2UuaW5jbHVkZXMoJ2Nvc3QgdGllcicpKTtcblx0XHRcdFx0XHRhc3NlcnQub2soZXJyLm1lc3NhZ2UuaW5jbHVkZXMoJ1VuYXZhaWxhYmxlJykpO1xuXHRcdFx0XHRcdHJldHVybiB0cnVlO1xuXHRcdFx0XHR9XG5cdFx0XHQpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgndXNlcyBzdWJhZ2VudCBtb2RlbCB3aGVuIGl0IGhhcyBlcXVhbCBtdWx0aXBsaWVyJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgbWFpbk1ldGEgPSBjcmVhdGVNZXRhZGF0YSgnR1BULTRvJywgMSk7XG5cdFx0XHRjb25zdCBzYW1lQ29zdE1ldGEgPSBjcmVhdGVNZXRhZGF0YSgnQ2xhdWRlIFNvbm5ldCcsIDEpO1xuXHRcdFx0Y29uc3QgbW9kZWxzID0gbmV3IE1hcChbXG5cdFx0XHRcdFsnbWFpbi1tb2RlbC1pZCcsIG1haW5NZXRhXSxcblx0XHRcdFx0WydzYW1lLWNvc3QtbW9kZWwtaWQnLCBzYW1lQ29zdE1ldGFdLFxuXHRcdFx0XSk7XG5cdFx0XHRjb25zdCBxdWFsaWZpZWROYW1lTWFwID0gbmV3IE1hcChbXG5cdFx0XHRcdFsnQ2xhdWRlIFNvbm5ldCAoVGVzdFZlbmRvciknLCB7IG1ldGFkYXRhOiBzYW1lQ29zdE1ldGEsIGlkZW50aWZpZXI6ICdzYW1lLWNvc3QtbW9kZWwtaWQnIH1dLFxuXHRcdFx0XSk7XG5cblx0XHRcdGNvbnN0IGFnZW50ID0gY3JlYXRlQWdlbnQoJ1NhbWVDb3N0QWdlbnQnLCBbJ0NsYXVkZSBTb25uZXQgKFRlc3RWZW5kb3IpJ10pO1xuXHRcdFx0Y29uc3QgdG9vbCA9IGNyZWF0ZVRvb2woeyBtb2RlbHMsIHF1YWxpZmllZE5hbWVNYXAsIGN1c3RvbUFnZW50czogW2FnZW50XSB9KTtcblxuXHRcdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgdG9vbC5wcmVwYXJlVG9vbEludm9jYXRpb24oe1xuXHRcdFx0XHRwYXJhbWV0ZXJzOiB7IHByb21wdDogJ3Rlc3QnLCBkZXNjcmlwdGlvbjogJ3Rlc3QgdGFzaycsIGFnZW50TmFtZTogJ1NhbWVDb3N0QWdlbnQnIH0sXG5cdFx0XHRcdHRvb2xDYWxsSWQ6ICdjYWxsLTInLFxuXHRcdFx0XHRtb2RlbElkOiAnbWFpbi1tb2RlbC1pZCcsXG5cdFx0XHRcdGNoYXRTZXNzaW9uUmVzb3VyY2U6IFVSSS5wYXJzZSgndGVzdDovL3Nlc3Npb24nKSxcblx0XHRcdH0sIENhbmNlbGxhdGlvblRva2VuLk5vbmUpO1xuXG5cdFx0XHRhc3NlcnQub2socmVzdWx0KTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocmVzdWx0LnRvb2xTcGVjaWZpY0RhdGEsIHtcblx0XHRcdFx0a2luZDogJ3N1YmFnZW50Jyxcblx0XHRcdFx0ZGVzY3JpcHRpb246ICd0ZXN0IHRhc2snLFxuXHRcdFx0XHRhZ2VudE5hbWU6ICdTYW1lQ29zdEFnZW50Jyxcblx0XHRcdFx0cHJvbXB0OiAndGVzdCcsXG5cdFx0XHRcdG1vZGVsTmFtZTogJ0NsYXVkZSBTb25uZXQnLFxuXHRcdFx0fSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCd1c2VzIHN1YmFnZW50IG1vZGVsIHdoZW4gaXQgaGFzIGxvd2VyIG11bHRpcGxpZXInLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCBtYWluTWV0YSA9IGNyZWF0ZU1ldGFkYXRhKCdPMyBQcm8nLCA1MCk7XG5cdFx0XHRjb25zdCBjaGVhcE1ldGEgPSBjcmVhdGVNZXRhZGF0YSgnR1BULTRvIE1pbmknLCAwLjI1KTtcblx0XHRcdGNvbnN0IG1vZGVscyA9IG5ldyBNYXAoW1xuXHRcdFx0XHRbJ21haW4tbW9kZWwtaWQnLCBtYWluTWV0YV0sXG5cdFx0XHRcdFsnY2hlYXAtbW9kZWwtaWQnLCBjaGVhcE1ldGFdLFxuXHRcdFx0XSk7XG5cdFx0XHRjb25zdCBxdWFsaWZpZWROYW1lTWFwID0gbmV3IE1hcChbXG5cdFx0XHRcdFsnR1BULTRvIE1pbmkgKFRlc3RWZW5kb3IpJywgeyBtZXRhZGF0YTogY2hlYXBNZXRhLCBpZGVudGlmaWVyOiAnY2hlYXAtbW9kZWwtaWQnIH1dLFxuXHRcdFx0XSk7XG5cblx0XHRcdGNvbnN0IGFnZW50ID0gY3JlYXRlQWdlbnQoJ0NoZWFwQWdlbnQnLCBbJ0dQVC00byBNaW5pIChUZXN0VmVuZG9yKSddKTtcblx0XHRcdGNvbnN0IHRvb2wgPSBjcmVhdGVUb29sKHsgbW9kZWxzLCBxdWFsaWZpZWROYW1lTWFwLCBjdXN0b21BZ2VudHM6IFthZ2VudF0gfSk7XG5cblx0XHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IHRvb2wucHJlcGFyZVRvb2xJbnZvY2F0aW9uKHtcblx0XHRcdFx0cGFyYW1ldGVyczogeyBwcm9tcHQ6ICd0ZXN0JywgZGVzY3JpcHRpb246ICd0ZXN0IHRhc2snLCBhZ2VudE5hbWU6ICdDaGVhcEFnZW50JyB9LFxuXHRcdFx0XHR0b29sQ2FsbElkOiAnY2FsbC0zJyxcblx0XHRcdFx0bW9kZWxJZDogJ21haW4tbW9kZWwtaWQnLFxuXHRcdFx0XHRjaGF0U2Vzc2lvblJlc291cmNlOiBVUkkucGFyc2UoJ3Rlc3Q6Ly9zZXNzaW9uJyksXG5cdFx0XHR9LCBDYW5jZWxsYXRpb25Ub2tlbi5Ob25lKTtcblxuXHRcdFx0YXNzZXJ0Lm9rKHJlc3VsdCk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHJlc3VsdC50b29sU3BlY2lmaWNEYXRhLCB7XG5cdFx0XHRcdGtpbmQ6ICdzdWJhZ2VudCcsXG5cdFx0XHRcdGRlc2NyaXB0aW9uOiAndGVzdCB0YXNrJyxcblx0XHRcdFx0YWdlbnROYW1lOiAnQ2hlYXBBZ2VudCcsXG5cdFx0XHRcdHByb21wdDogJ3Rlc3QnLFxuXHRcdFx0XHRtb2RlbE5hbWU6ICdHUFQtNG8gTWluaScsXG5cdFx0XHR9KTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3VzZXMgc3ViYWdlbnQgbW9kZWwgd2hlbiBtYWluIG1vZGVsIGhhcyBubyBtdWx0aXBsaWVyJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgbWFpbk1ldGEgPSBjcmVhdGVNZXRhZGF0YSgnVW5rbm93biBNb2RlbCcsIHVuZGVmaW5lZCk7XG5cdFx0XHRjb25zdCBzdWJNZXRhID0gY3JlYXRlTWV0YWRhdGEoJ08zIFBybycsIDUwKTtcblx0XHRcdGNvbnN0IG1vZGVscyA9IG5ldyBNYXAoW1xuXHRcdFx0XHRbJ21haW4tbW9kZWwtaWQnLCBtYWluTWV0YV0sXG5cdFx0XHRcdFsnc3ViLW1vZGVsLWlkJywgc3ViTWV0YV0sXG5cdFx0XHRdKTtcblx0XHRcdGNvbnN0IHF1YWxpZmllZE5hbWVNYXAgPSBuZXcgTWFwKFtcblx0XHRcdFx0WydPMyBQcm8gKFRlc3RWZW5kb3IpJywgeyBtZXRhZGF0YTogc3ViTWV0YSwgaWRlbnRpZmllcjogJ3N1Yi1tb2RlbC1pZCcgfV0sXG5cdFx0XHRdKTtcblxuXHRcdFx0Y29uc3QgYWdlbnQgPSBjcmVhdGVBZ2VudCgnU3ViQWdlbnQnLCBbJ08zIFBybyAoVGVzdFZlbmRvciknXSk7XG5cdFx0XHRjb25zdCB0b29sID0gY3JlYXRlVG9vbCh7IG1vZGVscywgcXVhbGlmaWVkTmFtZU1hcCwgY3VzdG9tQWdlbnRzOiBbYWdlbnRdIH0pO1xuXG5cdFx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCB0b29sLnByZXBhcmVUb29sSW52b2NhdGlvbih7XG5cdFx0XHRcdHBhcmFtZXRlcnM6IHsgcHJvbXB0OiAndGVzdCcsIGRlc2NyaXB0aW9uOiAndGVzdCB0YXNrJywgYWdlbnROYW1lOiAnU3ViQWdlbnQnIH0sXG5cdFx0XHRcdHRvb2xDYWxsSWQ6ICdjYWxsLTQnLFxuXHRcdFx0XHRtb2RlbElkOiAnbWFpbi1tb2RlbC1pZCcsXG5cdFx0XHRcdGNoYXRTZXNzaW9uUmVzb3VyY2U6IFVSSS5wYXJzZSgndGVzdDovL3Nlc3Npb24nKSxcblx0XHRcdH0sIENhbmNlbGxhdGlvblRva2VuLk5vbmUpO1xuXG5cdFx0XHRhc3NlcnQub2socmVzdWx0KTtcblx0XHRcdC8vIE5vIGZhbGxiYWNrIHdoZW4gbWFpbiBtb2RlbCdzIG11bHRpcGxpZXIgaXMgdW5rbm93blxuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChyZXN1bHQudG9vbFNwZWNpZmljRGF0YSwge1xuXHRcdFx0XHRraW5kOiAnc3ViYWdlbnQnLFxuXHRcdFx0XHRkZXNjcmlwdGlvbjogJ3Rlc3QgdGFzaycsXG5cdFx0XHRcdGFnZW50TmFtZTogJ1N1YkFnZW50Jyxcblx0XHRcdFx0cHJvbXB0OiAndGVzdCcsXG5cdFx0XHRcdG1vZGVsTmFtZTogJ08zIFBybycsXG5cdFx0XHR9KTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3VzZXMgc3ViYWdlbnQgbW9kZWwgd2hlbiBzdWJhZ2VudCBtb2RlbCBoYXMgbm8gbXVsdGlwbGllcicsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IG1haW5NZXRhID0gY3JlYXRlTWV0YWRhdGEoJ0dQVC00bycsIDEpO1xuXHRcdFx0Y29uc3Qgc3ViTWV0YSA9IGNyZWF0ZU1ldGFkYXRhKCdDdXN0b20gTW9kZWwnLCB1bmRlZmluZWQpO1xuXHRcdFx0Y29uc3QgbW9kZWxzID0gbmV3IE1hcChbXG5cdFx0XHRcdFsnbWFpbi1tb2RlbC1pZCcsIG1haW5NZXRhXSxcblx0XHRcdFx0WydzdWItbW9kZWwtaWQnLCBzdWJNZXRhXSxcblx0XHRcdF0pO1xuXHRcdFx0Y29uc3QgcXVhbGlmaWVkTmFtZU1hcCA9IG5ldyBNYXAoW1xuXHRcdFx0XHRbJ0N1c3RvbSBNb2RlbCAoVGVzdFZlbmRvciknLCB7IG1ldGFkYXRhOiBzdWJNZXRhLCBpZGVudGlmaWVyOiAnc3ViLW1vZGVsLWlkJyB9XSxcblx0XHRcdF0pO1xuXG5cdFx0XHRjb25zdCBhZ2VudCA9IGNyZWF0ZUFnZW50KCdDdXN0b21BZ2VudCcsIFsnQ3VzdG9tIE1vZGVsIChUZXN0VmVuZG9yKSddKTtcblx0XHRcdGNvbnN0IHRvb2wgPSBjcmVhdGVUb29sKHsgbW9kZWxzLCBxdWFsaWZpZWROYW1lTWFwLCBjdXN0b21BZ2VudHM6IFthZ2VudF0gfSk7XG5cblx0XHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IHRvb2wucHJlcGFyZVRvb2xJbnZvY2F0aW9uKHtcblx0XHRcdFx0cGFyYW1ldGVyczogeyBwcm9tcHQ6ICd0ZXN0JywgZGVzY3JpcHRpb246ICd0ZXN0IHRhc2snLCBhZ2VudE5hbWU6ICdDdXN0b21BZ2VudCcgfSxcblx0XHRcdFx0dG9vbENhbGxJZDogJ2NhbGwtNScsXG5cdFx0XHRcdG1vZGVsSWQ6ICdtYWluLW1vZGVsLWlkJyxcblx0XHRcdFx0Y2hhdFNlc3Npb25SZXNvdXJjZTogVVJJLnBhcnNlKCd0ZXN0Oi8vc2Vzc2lvbicpLFxuXHRcdFx0fSwgQ2FuY2VsbGF0aW9uVG9rZW4uTm9uZSk7XG5cblx0XHRcdGFzc2VydC5vayhyZXN1bHQpO1xuXHRcdFx0Ly8gTm8gZmFsbGJhY2sgd2hlbiBzdWJhZ2VudCBtb2RlbCdzIG11bHRpcGxpZXIgaXMgdW5rbm93blxuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChyZXN1bHQudG9vbFNwZWNpZmljRGF0YSwge1xuXHRcdFx0XHRraW5kOiAnc3ViYWdlbnQnLFxuXHRcdFx0XHRkZXNjcmlwdGlvbjogJ3Rlc3QgdGFzaycsXG5cdFx0XHRcdGFnZW50TmFtZTogJ0N1c3RvbUFnZW50Jyxcblx0XHRcdFx0cHJvbXB0OiAndGVzdCcsXG5cdFx0XHRcdG1vZGVsTmFtZTogJ0N1c3RvbSBNb2RlbCcsXG5cdFx0XHR9KTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3VzZXMgbWFpbiBtb2RlbCB3aGVuIG5vIHN1YmFnZW50IGlzIHNwZWNpZmllZCcsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IG1haW5NZXRhID0gY3JlYXRlTWV0YWRhdGEoJ0dQVC00bycsIDEpO1xuXHRcdFx0Y29uc3QgbW9kZWxzID0gbmV3IE1hcChbWydtYWluLW1vZGVsLWlkJywgbWFpbk1ldGFdXSk7XG5cblx0XHRcdGNvbnN0IHRvb2wgPSBjcmVhdGVUb29sKHsgbW9kZWxzIH0pO1xuXG5cdFx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCB0b29sLnByZXBhcmVUb29sSW52b2NhdGlvbih7XG5cdFx0XHRcdHBhcmFtZXRlcnM6IHsgcHJvbXB0OiAndGVzdCcsIGRlc2NyaXB0aW9uOiAndGVzdCB0YXNrJyB9LFxuXHRcdFx0XHR0b29sQ2FsbElkOiAnY2FsbC02Jyxcblx0XHRcdFx0bW9kZWxJZDogJ21haW4tbW9kZWwtaWQnLFxuXHRcdFx0XHRjaGF0U2Vzc2lvblJlc291cmNlOiBVUkkucGFyc2UoJ3Rlc3Q6Ly9zZXNzaW9uJyksXG5cdFx0XHR9LCBDYW5jZWxsYXRpb25Ub2tlbi5Ob25lKTtcblxuXHRcdFx0YXNzZXJ0Lm9rKHJlc3VsdCk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHJlc3VsdC50b29sU3BlY2lmaWNEYXRhLCB7XG5cdFx0XHRcdGtpbmQ6ICdzdWJhZ2VudCcsXG5cdFx0XHRcdGRlc2NyaXB0aW9uOiAndGVzdCB0YXNrJyxcblx0XHRcdFx0YWdlbnROYW1lOiB1bmRlZmluZWQsXG5cdFx0XHRcdHByb21wdDogJ3Rlc3QnLFxuXHRcdFx0XHRtb2RlbE5hbWU6ICdHUFQtNG8nLFxuXHRcdFx0fSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCd1c2VzIG1haW4gbW9kZWwgd2hlbiBzdWJhZ2VudCBoYXMgbm8gbW9kZWwgY29uZmlndXJlZCcsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IG1haW5NZXRhID0gY3JlYXRlTWV0YWRhdGEoJ0dQVC00bycsIDEpO1xuXHRcdFx0Y29uc3QgbW9kZWxzID0gbmV3IE1hcChbWydtYWluLW1vZGVsLWlkJywgbWFpbk1ldGFdXSk7XG5cblx0XHRcdGNvbnN0IGFnZW50ID0gY3JlYXRlQWdlbnQoJ05vTW9kZWxBZ2VudCcsIHVuZGVmaW5lZCk7XG5cdFx0XHRjb25zdCB0b29sID0gY3JlYXRlVG9vbCh7IG1vZGVscywgY3VzdG9tQWdlbnRzOiBbYWdlbnRdIH0pO1xuXG5cdFx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCB0b29sLnByZXBhcmVUb29sSW52b2NhdGlvbih7XG5cdFx0XHRcdHBhcmFtZXRlcnM6IHsgcHJvbXB0OiAndGVzdCcsIGRlc2NyaXB0aW9uOiAndGVzdCB0YXNrJywgYWdlbnROYW1lOiAnTm9Nb2RlbEFnZW50JyB9LFxuXHRcdFx0XHR0b29sQ2FsbElkOiAnY2FsbC03Jyxcblx0XHRcdFx0bW9kZWxJZDogJ21haW4tbW9kZWwtaWQnLFxuXHRcdFx0XHRjaGF0U2Vzc2lvblJlc291cmNlOiBVUkkucGFyc2UoJ3Rlc3Q6Ly9zZXNzaW9uJyksXG5cdFx0XHR9LCBDYW5jZWxsYXRpb25Ub2tlbi5Ob25lKTtcblxuXHRcdFx0YXNzZXJ0Lm9rKHJlc3VsdCk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHJlc3VsdC50b29sU3BlY2lmaWNEYXRhLCB7XG5cdFx0XHRcdGtpbmQ6ICdzdWJhZ2VudCcsXG5cdFx0XHRcdGRlc2NyaXB0aW9uOiAndGVzdCB0YXNrJyxcblx0XHRcdFx0YWdlbnROYW1lOiAnTm9Nb2RlbEFnZW50Jyxcblx0XHRcdFx0cHJvbXB0OiAndGVzdCcsXG5cdFx0XHRcdG1vZGVsTmFtZTogJ0dQVC00bycsXG5cdFx0XHR9KTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3NraXBzIENvcGlsb3QgZmFsbGJhY2sgbW9kZWxzIHdoZW4gbWFpbiBtb2RlbCBpcyBCWU9LIGFuZCBpbmhlcml0cyB0aGUgbWFpbiBtb2RlbCcsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IG1haW5NZXRhID0gY3JlYXRlTWV0YWRhdGEoJ0NsYXVkZSBTb25uZXQgQllPSycsIHVuZGVmaW5lZCwgJ2FudGhyb3BpYycpO1xuXHRcdFx0Y29uc3QgY29waWxvdEZhbGxiYWNrID0gY3JlYXRlTWV0YWRhdGEoJ0NvcGlsb3QgSGFpa3UnLCB1bmRlZmluZWQsIENPUElMT1RfVkVORE9SX0lEKTtcblx0XHRcdGNvbnN0IG1vZGVscyA9IG5ldyBNYXAoW1xuXHRcdFx0XHRbJ21haW4tYnlvay1pZCcsIG1haW5NZXRhXSxcblx0XHRcdFx0Wydjb3BpbG90LWZhbGxiYWNrLWlkJywgY29waWxvdEZhbGxiYWNrXSxcblx0XHRcdF0pO1xuXHRcdFx0Y29uc3QgcXVhbGlmaWVkTmFtZU1hcCA9IG5ldyBNYXAoW1xuXHRcdFx0XHRbJ0NvcGlsb3QgSGFpa3UgKGNvcGlsb3QpJywgeyBtZXRhZGF0YTogY29waWxvdEZhbGxiYWNrLCBpZGVudGlmaWVyOiAnY29waWxvdC1mYWxsYmFjay1pZCcgfV0sXG5cdFx0XHRdKTtcblxuXHRcdFx0Y29uc3QgYWdlbnQgPSBjcmVhdGVCdWlsdGluQWdlbnQoJ0V4cGxvcmVBZ2VudCcsIFsnQ29waWxvdCBIYWlrdSAoY29waWxvdCknXSk7XG5cdFx0XHRjb25zdCB0b29sID0gY3JlYXRlVG9vbCh7IG1vZGVscywgcXVhbGlmaWVkTmFtZU1hcCwgY3VzdG9tQWdlbnRzOiBbYWdlbnRdIH0pO1xuXG5cdFx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCB0b29sLnByZXBhcmVUb29sSW52b2NhdGlvbih7XG5cdFx0XHRcdHBhcmFtZXRlcnM6IHsgcHJvbXB0OiAndGVzdCcsIGRlc2NyaXB0aW9uOiAndGVzdCB0YXNrJywgYWdlbnROYW1lOiAnRXhwbG9yZUFnZW50JyB9LFxuXHRcdFx0XHR0b29sQ2FsbElkOiAnYnlvay1jYWxsLTEnLFxuXHRcdFx0XHRtb2RlbElkOiAnbWFpbi1ieW9rLWlkJyxcblx0XHRcdFx0Y2hhdFNlc3Npb25SZXNvdXJjZTogVVJJLnBhcnNlKCd0ZXN0Oi8vc2Vzc2lvbicpLFxuXHRcdFx0fSwgQ2FuY2VsbGF0aW9uVG9rZW4uTm9uZSk7XG5cblx0XHRcdGFzc2VydC5vayhyZXN1bHQpO1xuXHRcdFx0Ly8gVGhlIENvcGlsb3QgZmFsbGJhY2sgaXMgc2tpcHBlZCwgc28gdGhlIHN1YmFnZW50IGluaGVyaXRzIHRoZSBCWU9LIG1haW4gbW9kZWwuXG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHJlc3VsdC50b29sU3BlY2lmaWNEYXRhLCB7XG5cdFx0XHRcdGtpbmQ6ICdzdWJhZ2VudCcsXG5cdFx0XHRcdGRlc2NyaXB0aW9uOiAndGVzdCB0YXNrJyxcblx0XHRcdFx0YWdlbnROYW1lOiAnRXhwbG9yZUFnZW50Jyxcblx0XHRcdFx0cHJvbXB0OiAndGVzdCcsXG5cdFx0XHRcdG1vZGVsTmFtZTogJ0NsYXVkZSBTb25uZXQgQllPSycsXG5cdFx0XHR9KTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3NraXBzIENvcGlsb3QgZmFsbGJhY2sgYnV0IHVzZXMgYSBub24tQ29waWxvdCBmYWxsYmFjayB3aGVuIG1haW4gbW9kZWwgaXMgQllPSycsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IG1haW5NZXRhID0gY3JlYXRlTWV0YWRhdGEoJ0NsYXVkZSBTb25uZXQgQllPSycsIHVuZGVmaW5lZCwgJ2FudGhyb3BpYycpO1xuXHRcdFx0Y29uc3QgY29waWxvdEZhbGxiYWNrID0gY3JlYXRlTWV0YWRhdGEoJ0NvcGlsb3QgSGFpa3UnLCB1bmRlZmluZWQsIENPUElMT1RfVkVORE9SX0lEKTtcblx0XHRcdGNvbnN0IGJ5b2tGYWxsYmFjayA9IGNyZWF0ZU1ldGFkYXRhKCdPbGxhbWEgTGxhbWEnLCB1bmRlZmluZWQsICdvbGxhbWEnKTtcblx0XHRcdGNvbnN0IG1vZGVscyA9IG5ldyBNYXAoW1xuXHRcdFx0XHRbJ21haW4tYnlvay1pZCcsIG1haW5NZXRhXSxcblx0XHRcdFx0Wydjb3BpbG90LWZhbGxiYWNrLWlkJywgY29waWxvdEZhbGxiYWNrXSxcblx0XHRcdFx0WydieW9rLWZhbGxiYWNrLWlkJywgYnlva0ZhbGxiYWNrXSxcblx0XHRcdF0pO1xuXHRcdFx0Y29uc3QgcXVhbGlmaWVkTmFtZU1hcCA9IG5ldyBNYXAoW1xuXHRcdFx0XHRbJ0NvcGlsb3QgSGFpa3UgKGNvcGlsb3QpJywgeyBtZXRhZGF0YTogY29waWxvdEZhbGxiYWNrLCBpZGVudGlmaWVyOiAnY29waWxvdC1mYWxsYmFjay1pZCcgfV0sXG5cdFx0XHRcdFsnT2xsYW1hIExsYW1hIChvbGxhbWEpJywgeyBtZXRhZGF0YTogYnlva0ZhbGxiYWNrLCBpZGVudGlmaWVyOiAnYnlvay1mYWxsYmFjay1pZCcgfV0sXG5cdFx0XHRdKTtcblxuXHRcdFx0Ly8gQ29waWxvdCBmYWxsYmFjayBpcyBsaXN0ZWQgZmlyc3QsIHRoZSBCWU9LIGZhbGxiYWNrIHNlY29uZC5cblx0XHRcdGNvbnN0IGFnZW50ID0gY3JlYXRlQnVpbHRpbkFnZW50KCdFeHBsb3JlQWdlbnQnLCBbJ0NvcGlsb3QgSGFpa3UgKGNvcGlsb3QpJywgJ09sbGFtYSBMbGFtYSAob2xsYW1hKSddKTtcblx0XHRcdGNvbnN0IHRvb2wgPSBjcmVhdGVUb29sKHsgbW9kZWxzLCBxdWFsaWZpZWROYW1lTWFwLCBjdXN0b21BZ2VudHM6IFthZ2VudF0gfSk7XG5cblx0XHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IHRvb2wucHJlcGFyZVRvb2xJbnZvY2F0aW9uKHtcblx0XHRcdFx0cGFyYW1ldGVyczogeyBwcm9tcHQ6ICd0ZXN0JywgZGVzY3JpcHRpb246ICd0ZXN0IHRhc2snLCBhZ2VudE5hbWU6ICdFeHBsb3JlQWdlbnQnIH0sXG5cdFx0XHRcdHRvb2xDYWxsSWQ6ICdieW9rLWNhbGwtMicsXG5cdFx0XHRcdG1vZGVsSWQ6ICdtYWluLWJ5b2staWQnLFxuXHRcdFx0XHRjaGF0U2Vzc2lvblJlc291cmNlOiBVUkkucGFyc2UoJ3Rlc3Q6Ly9zZXNzaW9uJyksXG5cdFx0XHR9LCBDYW5jZWxsYXRpb25Ub2tlbi5Ob25lKTtcblxuXHRcdFx0YXNzZXJ0Lm9rKHJlc3VsdCk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHJlc3VsdC50b29sU3BlY2lmaWNEYXRhLCB7XG5cdFx0XHRcdGtpbmQ6ICdzdWJhZ2VudCcsXG5cdFx0XHRcdGRlc2NyaXB0aW9uOiAndGVzdCB0YXNrJyxcblx0XHRcdFx0YWdlbnROYW1lOiAnRXhwbG9yZUFnZW50Jyxcblx0XHRcdFx0cHJvbXB0OiAndGVzdCcsXG5cdFx0XHRcdG1vZGVsTmFtZTogJ09sbGFtYSBMbGFtYScsXG5cdFx0XHR9KTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3VzZXMgdGhlIENvcGlsb3QgZmFsbGJhY2sgbW9kZWwgd2hlbiB0aGUgbWFpbiBtb2RlbCBpcyBhbHNvIENvcGlsb3QnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCBtYWluTWV0YSA9IGNyZWF0ZU1ldGFkYXRhKCdDb3BpbG90IEdQVC00bycsIHVuZGVmaW5lZCwgQ09QSUxPVF9WRU5ET1JfSUQpO1xuXHRcdFx0Y29uc3QgY29waWxvdEZhbGxiYWNrID0gY3JlYXRlTWV0YWRhdGEoJ0NvcGlsb3QgSGFpa3UnLCB1bmRlZmluZWQsIENPUElMT1RfVkVORE9SX0lEKTtcblx0XHRcdGNvbnN0IG1vZGVscyA9IG5ldyBNYXAoW1xuXHRcdFx0XHRbJ21haW4tY29waWxvdC1pZCcsIG1haW5NZXRhXSxcblx0XHRcdFx0Wydjb3BpbG90LWZhbGxiYWNrLWlkJywgY29waWxvdEZhbGxiYWNrXSxcblx0XHRcdF0pO1xuXHRcdFx0Y29uc3QgcXVhbGlmaWVkTmFtZU1hcCA9IG5ldyBNYXAoW1xuXHRcdFx0XHRbJ0NvcGlsb3QgSGFpa3UgKGNvcGlsb3QpJywgeyBtZXRhZGF0YTogY29waWxvdEZhbGxiYWNrLCBpZGVudGlmaWVyOiAnY29waWxvdC1mYWxsYmFjay1pZCcgfV0sXG5cdFx0XHRdKTtcblxuXHRcdFx0Y29uc3QgYWdlbnQgPSBjcmVhdGVCdWlsdGluQWdlbnQoJ0V4cGxvcmVBZ2VudCcsIFsnQ29waWxvdCBIYWlrdSAoY29waWxvdCknXSk7XG5cdFx0XHRjb25zdCB0b29sID0gY3JlYXRlVG9vbCh7IG1vZGVscywgcXVhbGlmaWVkTmFtZU1hcCwgY3VzdG9tQWdlbnRzOiBbYWdlbnRdIH0pO1xuXG5cdFx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCB0b29sLnByZXBhcmVUb29sSW52b2NhdGlvbih7XG5cdFx0XHRcdHBhcmFtZXRlcnM6IHsgcHJvbXB0OiAndGVzdCcsIGRlc2NyaXB0aW9uOiAndGVzdCB0YXNrJywgYWdlbnROYW1lOiAnRXhwbG9yZUFnZW50JyB9LFxuXHRcdFx0XHR0b29sQ2FsbElkOiAnYnlvay1jYWxsLTMnLFxuXHRcdFx0XHRtb2RlbElkOiAnbWFpbi1jb3BpbG90LWlkJyxcblx0XHRcdFx0Y2hhdFNlc3Npb25SZXNvdXJjZTogVVJJLnBhcnNlKCd0ZXN0Oi8vc2Vzc2lvbicpLFxuXHRcdFx0fSwgQ2FuY2VsbGF0aW9uVG9rZW4uTm9uZSk7XG5cblx0XHRcdGFzc2VydC5vayhyZXN1bHQpO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChyZXN1bHQudG9vbFNwZWNpZmljRGF0YSwge1xuXHRcdFx0XHRraW5kOiAnc3ViYWdlbnQnLFxuXHRcdFx0XHRkZXNjcmlwdGlvbjogJ3Rlc3QgdGFzaycsXG5cdFx0XHRcdGFnZW50TmFtZTogJ0V4cGxvcmVBZ2VudCcsXG5cdFx0XHRcdHByb21wdDogJ3Rlc3QnLFxuXHRcdFx0XHRtb2RlbE5hbWU6ICdDb3BpbG90IEhhaWt1Jyxcblx0XHRcdH0pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgndXNlcyB0aGUgQ29waWxvdCBmYWxsYmFjayBtb2RlbCB3aGVuIG5vIG1haW4gbW9kZWwgaXMgc2V0JywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgY29waWxvdEZhbGxiYWNrID0gY3JlYXRlTWV0YWRhdGEoJ0NvcGlsb3QgSGFpa3UnLCB1bmRlZmluZWQsIENPUElMT1RfVkVORE9SX0lEKTtcblx0XHRcdGNvbnN0IG1vZGVscyA9IG5ldyBNYXAoW1xuXHRcdFx0XHRbJ2NvcGlsb3QtZmFsbGJhY2staWQnLCBjb3BpbG90RmFsbGJhY2tdLFxuXHRcdFx0XSk7XG5cdFx0XHRjb25zdCBxdWFsaWZpZWROYW1lTWFwID0gbmV3IE1hcChbXG5cdFx0XHRcdFsnQ29waWxvdCBIYWlrdSAoY29waWxvdCknLCB7IG1ldGFkYXRhOiBjb3BpbG90RmFsbGJhY2ssIGlkZW50aWZpZXI6ICdjb3BpbG90LWZhbGxiYWNrLWlkJyB9XSxcblx0XHRcdF0pO1xuXG5cdFx0XHRjb25zdCBhZ2VudCA9IGNyZWF0ZUJ1aWx0aW5BZ2VudCgnRXhwbG9yZUFnZW50JywgWydDb3BpbG90IEhhaWt1IChjb3BpbG90KSddKTtcblx0XHRcdGNvbnN0IHRvb2wgPSBjcmVhdGVUb29sKHsgbW9kZWxzLCBxdWFsaWZpZWROYW1lTWFwLCBjdXN0b21BZ2VudHM6IFthZ2VudF0gfSk7XG5cblx0XHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IHRvb2wucHJlcGFyZVRvb2xJbnZvY2F0aW9uKHtcblx0XHRcdFx0cGFyYW1ldGVyczogeyBwcm9tcHQ6ICd0ZXN0JywgZGVzY3JpcHRpb246ICd0ZXN0IHRhc2snLCBhZ2VudE5hbWU6ICdFeHBsb3JlQWdlbnQnIH0sXG5cdFx0XHRcdHRvb2xDYWxsSWQ6ICdieW9rLWNhbGwtNCcsXG5cdFx0XHRcdG1vZGVsSWQ6IHVuZGVmaW5lZCxcblx0XHRcdFx0Y2hhdFNlc3Npb25SZXNvdXJjZTogVVJJLnBhcnNlKCd0ZXN0Oi8vc2Vzc2lvbicpLFxuXHRcdFx0fSwgQ2FuY2VsbGF0aW9uVG9rZW4uTm9uZSk7XG5cblx0XHRcdGFzc2VydC5vayhyZXN1bHQpO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChyZXN1bHQudG9vbFNwZWNpZmljRGF0YSwge1xuXHRcdFx0XHRraW5kOiAnc3ViYWdlbnQnLFxuXHRcdFx0XHRkZXNjcmlwdGlvbjogJ3Rlc3QgdGFzaycsXG5cdFx0XHRcdGFnZW50TmFtZTogJ0V4cGxvcmVBZ2VudCcsXG5cdFx0XHRcdHByb21wdDogJ3Rlc3QnLFxuXHRcdFx0XHRtb2RlbE5hbWU6ICdDb3BpbG90IEhhaWt1Jyxcblx0XHRcdH0pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnaG9ub3JzIGEgdXNlci1hdXRob3JlZCBhZ2VudFxcJ3MgZXhwbGljaXQgQ29waWxvdCBtb2RlbCBldmVuIHdoZW4gbWFpbiBtb2RlbCBpcyBCWU9LJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgbWFpbk1ldGEgPSBjcmVhdGVNZXRhZGF0YSgnQ2xhdWRlIFNvbm5ldCBCWU9LJywgdW5kZWZpbmVkLCAnYW50aHJvcGljJyk7XG5cdFx0XHRjb25zdCBjb3BpbG90UGlubmVkID0gY3JlYXRlTWV0YWRhdGEoJ0NvcGlsb3QgU29ubmV0JywgdW5kZWZpbmVkLCBDT1BJTE9UX1ZFTkRPUl9JRCk7XG5cdFx0XHRjb25zdCBtb2RlbHMgPSBuZXcgTWFwKFtcblx0XHRcdFx0WydtYWluLWJ5b2staWQnLCBtYWluTWV0YV0sXG5cdFx0XHRcdFsnY29waWxvdC1waW5uZWQtaWQnLCBjb3BpbG90UGlubmVkXSxcblx0XHRcdF0pO1xuXHRcdFx0Y29uc3QgcXVhbGlmaWVkTmFtZU1hcCA9IG5ldyBNYXAoW1xuXHRcdFx0XHRbJ0NvcGlsb3QgU29ubmV0IChjb3BpbG90KScsIHsgbWV0YWRhdGE6IGNvcGlsb3RQaW5uZWQsIGlkZW50aWZpZXI6ICdjb3BpbG90LXBpbm5lZC1pZCcgfV0sXG5cdFx0XHRdKTtcblxuXHRcdFx0Ly8gQSB1c2VyLWF1dGhvcmVkIChsb2NhbCkgYWdlbnQgdGhhdCBkZWxpYmVyYXRlbHkgcGlucyBhIENvcGlsb3QgbW9kZWwgXHUyMDE0IG11c3Qgbm90IGJlIHNraXBwZWQuXG5cdFx0XHRjb25zdCBhZ2VudCA9IGNyZWF0ZUFnZW50KCdNeUFnZW50JywgWydDb3BpbG90IFNvbm5ldCAoY29waWxvdCknXSk7XG5cdFx0XHRjb25zdCB0b29sID0gY3JlYXRlVG9vbCh7IG1vZGVscywgcXVhbGlmaWVkTmFtZU1hcCwgY3VzdG9tQWdlbnRzOiBbYWdlbnRdIH0pO1xuXG5cdFx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCB0b29sLnByZXBhcmVUb29sSW52b2NhdGlvbih7XG5cdFx0XHRcdHBhcmFtZXRlcnM6IHsgcHJvbXB0OiAndGVzdCcsIGRlc2NyaXB0aW9uOiAndGVzdCB0YXNrJywgYWdlbnROYW1lOiAnTXlBZ2VudCcgfSxcblx0XHRcdFx0dG9vbENhbGxJZDogJ2J5b2stY2FsbC01Jyxcblx0XHRcdFx0bW9kZWxJZDogJ21haW4tYnlvay1pZCcsXG5cdFx0XHRcdGNoYXRTZXNzaW9uUmVzb3VyY2U6IFVSSS5wYXJzZSgndGVzdDovL3Nlc3Npb24nKSxcblx0XHRcdH0sIENhbmNlbGxhdGlvblRva2VuLk5vbmUpO1xuXG5cdFx0XHRhc3NlcnQub2socmVzdWx0KTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocmVzdWx0LnRvb2xTcGVjaWZpY0RhdGEsIHtcblx0XHRcdFx0a2luZDogJ3N1YmFnZW50Jyxcblx0XHRcdFx0ZGVzY3JpcHRpb246ICd0ZXN0IHRhc2snLFxuXHRcdFx0XHRhZ2VudE5hbWU6ICdNeUFnZW50Jyxcblx0XHRcdFx0cHJvbXB0OiAndGVzdCcsXG5cdFx0XHRcdG1vZGVsTmFtZTogJ0NvcGlsb3QgU29ubmV0Jyxcblx0XHRcdH0pO1xuXHRcdH0pO1xuXHR9KTtcblxuXHRzdWl0ZSgnZXhwbGljaXQgbW9kZWwgcGFyYW1ldGVyJywgKCkgPT4ge1xuXHRcdGZ1bmN0aW9uIGNyZWF0ZU1ldGFkYXRhKG5hbWU6IHN0cmluZywgbXVsdGlwbGllck51bWVyaWM/OiBudW1iZXIpOiBJTGFuZ3VhZ2VNb2RlbENoYXRNZXRhZGF0YSB7XG5cdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRleHRlbnNpb246IG5ldyBFeHRlbnNpb25JZGVudGlmaWVyKCd0ZXN0LmV4dGVuc2lvbicpLFxuXHRcdFx0XHRuYW1lLFxuXHRcdFx0XHRpZDogbmFtZS50b0xvd2VyQ2FzZSgpLnJlcGxhY2UoL1xccysvZywgJy0nKSxcblx0XHRcdFx0dmVuZG9yOiAnVGVzdFZlbmRvcicsXG5cdFx0XHRcdHZlcnNpb246ICcxLjAnLFxuXHRcdFx0XHRmYW1pbHk6ICd0ZXN0Jyxcblx0XHRcdFx0bWF4SW5wdXRUb2tlbnM6IDEyODAwMCxcblx0XHRcdFx0bWF4T3V0cHV0VG9rZW5zOiA4MTkyLFxuXHRcdFx0XHRpc0RlZmF1bHRGb3JMb2NhdGlvbjoge30sXG5cdFx0XHRcdG11bHRpcGxpZXJOdW1lcmljLFxuXHRcdFx0XHRjYXBhYmlsaXRpZXM6IHsgdG9vbENhbGxpbmc6IHRydWUgfSxcblx0XHRcdH07XG5cdFx0fVxuXG5cdFx0ZnVuY3Rpb24gY3JlYXRlVG9vbChvcHRzOiB7XG5cdFx0XHRtb2RlbHM6IE1hcDxzdHJpbmcsIElMYW5ndWFnZU1vZGVsQ2hhdE1ldGFkYXRhPjtcblx0XHRcdHF1YWxpZmllZE5hbWVNYXA/OiBNYXA8c3RyaW5nLCBJTGFuZ3VhZ2VNb2RlbENoYXRNZXRhZGF0YUFuZElkZW50aWZpZXI+O1xuXHRcdFx0Y3VzdG9tQWdlbnRzPzogSUN1c3RvbUFnZW50W107XG5cdFx0fSkge1xuXHRcdFx0Y29uc3QgbW9ja1Rvb2xzU2VydmljZSA9IHRlc3REaXNwb3NhYmxlcy5hZGQobmV3IE1vY2tMYW5ndWFnZU1vZGVsVG9vbHNTZXJ2aWNlKCkpO1xuXHRcdFx0Y29uc3QgcHJvbXB0c1NlcnZpY2UgPSBuZXcgTW9ja1Byb21wdHNTZXJ2aWNlKCk7XG5cdFx0XHRpZiAob3B0cy5jdXN0b21BZ2VudHMpIHtcblx0XHRcdFx0cHJvbXB0c1NlcnZpY2Uuc2V0Q3VzdG9tTW9kZXMob3B0cy5jdXN0b21BZ2VudHMpO1xuXHRcdFx0fVxuXG5cdFx0XHRjb25zdCBtb2NrTGFuZ3VhZ2VNb2RlbHNTZXJ2aWNlOiBQYXJ0aWFsPElMYW5ndWFnZU1vZGVsc1NlcnZpY2U+ID0ge1xuXHRcdFx0XHRnZXRMYW5ndWFnZU1vZGVsSWRzKCkge1xuXHRcdFx0XHRcdHJldHVybiBBcnJheS5mcm9tKG9wdHMubW9kZWxzLmtleXMoKSk7XG5cdFx0XHRcdH0sXG5cdFx0XHRcdGxvb2t1cExhbmd1YWdlTW9kZWwobW9kZWxJZDogc3RyaW5nKSB7XG5cdFx0XHRcdFx0cmV0dXJuIG9wdHMubW9kZWxzLmdldChtb2RlbElkKTtcblx0XHRcdFx0fSxcblx0XHRcdFx0bG9va3VwTGFuZ3VhZ2VNb2RlbEJ5UXVhbGlmaWVkTmFtZShxdWFsaWZpZWROYW1lOiBzdHJpbmcpIHtcblx0XHRcdFx0XHRyZXR1cm4gb3B0cy5xdWFsaWZpZWROYW1lTWFwPy5nZXQocXVhbGlmaWVkTmFtZSk7XG5cdFx0XHRcdH0sXG5cdFx0XHR9O1xuXG5cdFx0XHRjb25zdCB0b29sID0gdGVzdERpc3Bvc2FibGVzLmFkZChuZXcgUnVuU3ViYWdlbnRUb29sKFxuXHRcdFx0XHR7fSBhcyBJQ2hhdEFnZW50U2VydmljZSxcblx0XHRcdFx0e30gYXMgSUNoYXRTZXJ2aWNlLFxuXHRcdFx0XHRtb2NrVG9vbHNTZXJ2aWNlLFxuXHRcdFx0XHRtb2NrTGFuZ3VhZ2VNb2RlbHNTZXJ2aWNlIGFzIElMYW5ndWFnZU1vZGVsc1NlcnZpY2UsXG5cdFx0XHRcdG5ldyBOdWxsTG9nU2VydmljZSgpLFxuXHRcdFx0XHRuZXcgVGVzdENvbmZpZ3VyYXRpb25TZXJ2aWNlKCksXG5cdFx0XHRcdHByb21wdHNTZXJ2aWNlLFxuXHRcdFx0XHR7fSBhcyBJSW5zdGFudGlhdGlvblNlcnZpY2UsXG5cdFx0XHRcdHt9IGFzIElQcm9kdWN0U2VydmljZSxcblx0XHRcdCkpO1xuXG5cdFx0XHRyZXR1cm4gdG9vbDtcblx0XHR9XG5cblx0XHRmdW5jdGlvbiBjcmVhdGVBZ2VudChuYW1lOiBzdHJpbmcsIG1vZGVsUXVhbGlmaWVkTmFtZXM/OiBzdHJpbmdbXSk6IElDdXN0b21BZ2VudCB7XG5cdFx0XHRjb25zdCBpZCA9IGBmaWxlOi8vL3Rlc3QvJHtuYW1lfS5tZGA7XG5cdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRpZCxcblx0XHRcdFx0dXJpOiBVUkkucGFyc2UoaWQpLFxuXHRcdFx0XHRuYW1lLFxuXHRcdFx0XHRkZXNjcmlwdGlvbjogYEFnZW50ICR7bmFtZX1gLFxuXHRcdFx0XHR0b29sczogWyd0b29sMSddLFxuXHRcdFx0XHRtb2RlbDogbW9kZWxRdWFsaWZpZWROYW1lcyxcblx0XHRcdFx0YWdlbnRJbnN0cnVjdGlvbnM6IHsgY29udGVudDogJ3Rlc3QnLCB0b29sUmVmZXJlbmNlczogW10gfSxcblx0XHRcdFx0c291cmNlOiB7IHN0b3JhZ2U6IFByb21wdHNTdG9yYWdlLmxvY2FsIH0sXG5cdFx0XHRcdHRhcmdldDogVGFyZ2V0LlVuZGVmaW5lZCxcblx0XHRcdFx0dmlzaWJpbGl0eTogeyB1c2VySW52b2NhYmxlOiB0cnVlLCBhZ2VudEludm9jYWJsZTogdHJ1ZSB9LFxuXHRcdFx0XHRlbmFibGVkOiB0cnVlXG5cdFx0XHR9O1xuXHRcdH1cblxuXHRcdHRlc3QoJ21vZGVsIHByb3BlcnR5IGlzIGluY2x1ZGVkIGluIHRvb2wgc2NoZW1hIHdpdGhvdXQgZW51bScsICgpID0+IHtcblx0XHRcdGNvbnN0IG1vZGVscyA9IG5ldyBNYXAoW1xuXHRcdFx0XHRbJ21vZGVsLTEnLCBjcmVhdGVNZXRhZGF0YSgnR1BULTRvJyldLFxuXHRcdFx0XHRbJ21vZGVsLTInLCBjcmVhdGVNZXRhZGF0YSgnQ2xhdWRlIFNvbm5ldCcpXSxcblx0XHRcdF0pO1xuXG5cdFx0XHRjb25zdCB0b29sID0gY3JlYXRlVG9vbCh7IG1vZGVscyB9KTtcblx0XHRcdGNvbnN0IHRvb2xEYXRhID0gdG9vbC5nZXRUb29sRGF0YSgpO1xuXG5cdFx0XHRhc3NlcnQub2sodG9vbERhdGEuaW5wdXRTY2hlbWE/LnByb3BlcnRpZXM/Lm1vZGVsLCAnbW9kZWwgc2hvdWxkIGJlIGluIHNjaGVtYScpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHRvb2xEYXRhLmlucHV0U2NoZW1hPy5wcm9wZXJ0aWVzPy5tb2RlbD8udHlwZSwgJ3N0cmluZycpO1xuXHRcdFx0Ly8gTm8gZW51bSBzaG91bGQgYmUgcHJlc2VudCAtIHZhbGlkYXRpb24gaGFwcGVucyBhdCBydW50aW1lXG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodG9vbERhdGEuaW5wdXRTY2hlbWE/LnByb3BlcnRpZXM/Lm1vZGVsPy5lbnVtLCB1bmRlZmluZWQsICdtb2RlbCBzaG91bGQgbm90IGhhdmUgYW4gZW51bScpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgncmVzb2x2ZXMgZXhwbGljaXQgbW9kZWwgcGFyYW1ldGVyIHdpdGhvdXQgYWdlbnROYW1lJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgbWFpbk1ldGEgPSBjcmVhdGVNZXRhZGF0YSgnR1BULTRvJywgMSk7XG5cdFx0XHRjb25zdCBleHBsaWNpdE1ldGEgPSBjcmVhdGVNZXRhZGF0YSgnQ2xhdWRlIFNvbm5ldCcsIDEpO1xuXHRcdFx0Y29uc3QgbW9kZWxzID0gbmV3IE1hcChbXG5cdFx0XHRcdFsnbWFpbi1tb2RlbC1pZCcsIG1haW5NZXRhXSxcblx0XHRcdFx0WydleHBsaWNpdC1tb2RlbC1pZCcsIGV4cGxpY2l0TWV0YV0sXG5cdFx0XHRdKTtcblx0XHRcdGNvbnN0IHF1YWxpZmllZE5hbWVNYXAgPSBuZXcgTWFwKFtcblx0XHRcdFx0WydDbGF1ZGUgU29ubmV0IChUZXN0VmVuZG9yKScsIHsgbWV0YWRhdGE6IGV4cGxpY2l0TWV0YSwgaWRlbnRpZmllcjogJ2V4cGxpY2l0LW1vZGVsLWlkJyB9XSxcblx0XHRcdF0pO1xuXG5cdFx0XHRjb25zdCB0b29sID0gY3JlYXRlVG9vbCh7IG1vZGVscywgcXVhbGlmaWVkTmFtZU1hcCB9KTtcblxuXHRcdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgdG9vbC5wcmVwYXJlVG9vbEludm9jYXRpb24oe1xuXHRcdFx0XHRwYXJhbWV0ZXJzOiB7IHByb21wdDogJ3Rlc3QnLCBkZXNjcmlwdGlvbjogJ3Rlc3QgdGFzaycsIG1vZGVsOiAnQ2xhdWRlIFNvbm5ldCAoVGVzdFZlbmRvciknIH0sXG5cdFx0XHRcdHRvb2xDYWxsSWQ6ICdtb2RlbC1jYWxsLTEnLFxuXHRcdFx0XHRtb2RlbElkOiAnbWFpbi1tb2RlbC1pZCcsXG5cdFx0XHRcdGNoYXRTZXNzaW9uUmVzb3VyY2U6IFVSSS5wYXJzZSgndGVzdDovL3Nlc3Npb24nKSxcblx0XHRcdH0sIENhbmNlbGxhdGlvblRva2VuLk5vbmUpO1xuXG5cdFx0XHRhc3NlcnQub2socmVzdWx0KTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocmVzdWx0LnRvb2xTcGVjaWZpY0RhdGEsIHtcblx0XHRcdFx0a2luZDogJ3N1YmFnZW50Jyxcblx0XHRcdFx0ZGVzY3JpcHRpb246ICd0ZXN0IHRhc2snLFxuXHRcdFx0XHRhZ2VudE5hbWU6IHVuZGVmaW5lZCxcblx0XHRcdFx0cHJvbXB0OiAndGVzdCcsXG5cdFx0XHRcdG1vZGVsTmFtZTogJ0NsYXVkZSBTb25uZXQnLFxuXHRcdFx0fSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdleHBsaWNpdCBtb2RlbCBvdmVycmlkZXMgYWdlbnQgY29uZmlndXJlZCBtb2RlbCcsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IG1haW5NZXRhID0gY3JlYXRlTWV0YWRhdGEoJ0dQVC00bycsIDEpO1xuXHRcdFx0Y29uc3QgYWdlbnRNZXRhID0gY3JlYXRlTWV0YWRhdGEoJ0FnZW50IE1vZGVsJywgMSk7XG5cdFx0XHRjb25zdCBleHBsaWNpdE1ldGEgPSBjcmVhdGVNZXRhZGF0YSgnQ2xhdWRlIFNvbm5ldCcsIDEpO1xuXHRcdFx0Y29uc3QgbW9kZWxzID0gbmV3IE1hcChbXG5cdFx0XHRcdFsnbWFpbi1tb2RlbC1pZCcsIG1haW5NZXRhXSxcblx0XHRcdFx0WydhZ2VudC1tb2RlbC1pZCcsIGFnZW50TWV0YV0sXG5cdFx0XHRcdFsnZXhwbGljaXQtbW9kZWwtaWQnLCBleHBsaWNpdE1ldGFdLFxuXHRcdFx0XSk7XG5cdFx0XHRjb25zdCBxdWFsaWZpZWROYW1lTWFwID0gbmV3IE1hcChbXG5cdFx0XHRcdFsnQWdlbnQgTW9kZWwgKFRlc3RWZW5kb3IpJywgeyBtZXRhZGF0YTogYWdlbnRNZXRhLCBpZGVudGlmaWVyOiAnYWdlbnQtbW9kZWwtaWQnIH1dLFxuXHRcdFx0XHRbJ0NsYXVkZSBTb25uZXQgKFRlc3RWZW5kb3IpJywgeyBtZXRhZGF0YTogZXhwbGljaXRNZXRhLCBpZGVudGlmaWVyOiAnZXhwbGljaXQtbW9kZWwtaWQnIH1dLFxuXHRcdFx0XSk7XG5cblx0XHRcdGNvbnN0IGFnZW50ID0gY3JlYXRlQWdlbnQoJ015QWdlbnQnLCBbJ0FnZW50IE1vZGVsIChUZXN0VmVuZG9yKSddKTtcblx0XHRcdGNvbnN0IHRvb2wgPSBjcmVhdGVUb29sKHsgbW9kZWxzLCBxdWFsaWZpZWROYW1lTWFwLCBjdXN0b21BZ2VudHM6IFthZ2VudF0gfSk7XG5cblx0XHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IHRvb2wucHJlcGFyZVRvb2xJbnZvY2F0aW9uKHtcblx0XHRcdFx0cGFyYW1ldGVyczogeyBwcm9tcHQ6ICd0ZXN0JywgZGVzY3JpcHRpb246ICd0ZXN0IHRhc2snLCBhZ2VudE5hbWU6ICdNeUFnZW50JywgbW9kZWw6ICdDbGF1ZGUgU29ubmV0IChUZXN0VmVuZG9yKScgfSxcblx0XHRcdFx0dG9vbENhbGxJZDogJ21vZGVsLWNhbGwtMicsXG5cdFx0XHRcdG1vZGVsSWQ6ICdtYWluLW1vZGVsLWlkJyxcblx0XHRcdFx0Y2hhdFNlc3Npb25SZXNvdXJjZTogVVJJLnBhcnNlKCd0ZXN0Oi8vc2Vzc2lvbicpLFxuXHRcdFx0fSwgQ2FuY2VsbGF0aW9uVG9rZW4uTm9uZSk7XG5cblx0XHRcdGFzc2VydC5vayhyZXN1bHQpO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChyZXN1bHQudG9vbFNwZWNpZmljRGF0YSwge1xuXHRcdFx0XHRraW5kOiAnc3ViYWdlbnQnLFxuXHRcdFx0XHRkZXNjcmlwdGlvbjogJ3Rlc3QgdGFzaycsXG5cdFx0XHRcdGFnZW50TmFtZTogJ015QWdlbnQnLFxuXHRcdFx0XHRwcm9tcHQ6ICd0ZXN0Jyxcblx0XHRcdFx0bW9kZWxOYW1lOiAnQ2xhdWRlIFNvbm5ldCcsXG5cdFx0XHR9KTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3Rocm93cyBlcnJvciB3aGVuIGV4cGxpY2l0IG1vZGVsIGhhcyBoaWdoZXIgbXVsdGlwbGllcicsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IG1haW5NZXRhID0gY3JlYXRlTWV0YWRhdGEoJ0dQVC00bycsIDEpO1xuXHRcdFx0Y29uc3QgZXhwZW5zaXZlTWV0YSA9IGNyZWF0ZU1ldGFkYXRhKCdPMyBQcm8nLCA1MCk7XG5cdFx0XHRjb25zdCBtb2RlbHMgPSBuZXcgTWFwKFtcblx0XHRcdFx0WydtYWluLW1vZGVsLWlkJywgbWFpbk1ldGFdLFxuXHRcdFx0XHRbJ2V4cGVuc2l2ZS1tb2RlbC1pZCcsIGV4cGVuc2l2ZU1ldGFdLFxuXHRcdFx0XSk7XG5cdFx0XHRjb25zdCBxdWFsaWZpZWROYW1lTWFwID0gbmV3IE1hcChbXG5cdFx0XHRcdFsnTzMgUHJvIChUZXN0VmVuZG9yKScsIHsgbWV0YWRhdGE6IGV4cGVuc2l2ZU1ldGEsIGlkZW50aWZpZXI6ICdleHBlbnNpdmUtbW9kZWwtaWQnIH1dLFxuXHRcdFx0XSk7XG5cblx0XHRcdGNvbnN0IHRvb2wgPSBjcmVhdGVUb29sKHsgbW9kZWxzLCBxdWFsaWZpZWROYW1lTWFwIH0pO1xuXG5cdFx0XHRhd2FpdCBhc3NlcnQucmVqZWN0cyhcblx0XHRcdFx0KCkgPT4gdG9vbC5wcmVwYXJlVG9vbEludm9jYXRpb24oe1xuXHRcdFx0XHRcdHBhcmFtZXRlcnM6IHsgcHJvbXB0OiAndGVzdCcsIGRlc2NyaXB0aW9uOiAndGVzdCB0YXNrJywgbW9kZWw6ICdPMyBQcm8gKFRlc3RWZW5kb3IpJyB9LFxuXHRcdFx0XHRcdHRvb2xDYWxsSWQ6ICdtb2RlbC1jYWxsLTMnLFxuXHRcdFx0XHRcdG1vZGVsSWQ6ICdtYWluLW1vZGVsLWlkJyxcblx0XHRcdFx0XHRjaGF0U2Vzc2lvblJlc291cmNlOiBVUkkucGFyc2UoJ3Rlc3Q6Ly9zZXNzaW9uJyksXG5cdFx0XHRcdH0sIENhbmNlbGxhdGlvblRva2VuLk5vbmUpLFxuXHRcdFx0XHQoZXJyOiBFcnJvcikgPT4ge1xuXHRcdFx0XHRcdGFzc2VydC5vayhlcnIubWVzc2FnZS5pbmNsdWRlcygnTzMgUHJvJykpO1xuXHRcdFx0XHRcdGFzc2VydC5vayhlcnIubWVzc2FnZS5pbmNsdWRlcygnZXhjZWVkcycpKTtcblx0XHRcdFx0XHRhc3NlcnQub2soZXJyLm1lc3NhZ2UuaW5jbHVkZXMoJ2Nvc3QgdGllcicpKTtcblx0XHRcdFx0XHRhc3NlcnQub2soZXJyLm1lc3NhZ2UuaW5jbHVkZXMoJ1VuYXZhaWxhYmxlJykpO1xuXHRcdFx0XHRcdHJldHVybiB0cnVlO1xuXHRcdFx0XHR9XG5cdFx0XHQpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgndGhyb3dzIGVycm9yIHdpdGggYXZhaWxhYmxlIG1vZGVscyB3aGVuIGV4cGxpY2l0IG1vZGVsIGlzIG5vdCBmb3VuZCcsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IG1haW5NZXRhID0gY3JlYXRlTWV0YWRhdGEoJ0dQVC00bycsIDEpO1xuXHRcdFx0Y29uc3Qgb3RoZXJNZXRhID0gY3JlYXRlTWV0YWRhdGEoJ0NsYXVkZSBTb25uZXQnLCAxKTtcblx0XHRcdGNvbnN0IG1vZGVscyA9IG5ldyBNYXAoW1xuXHRcdFx0XHRbJ21haW4tbW9kZWwtaWQnLCBtYWluTWV0YV0sXG5cdFx0XHRcdFsnb3RoZXItbW9kZWwtaWQnLCBvdGhlck1ldGFdLFxuXHRcdFx0XSk7XG5cblx0XHRcdGNvbnN0IHRvb2wgPSBjcmVhdGVUb29sKHsgbW9kZWxzLCBxdWFsaWZpZWROYW1lTWFwOiBuZXcgTWFwKCkgfSk7XG5cblx0XHRcdGF3YWl0IGFzc2VydC5yZWplY3RzKFxuXHRcdFx0XHQoKSA9PiB0b29sLnByZXBhcmVUb29sSW52b2NhdGlvbih7XG5cdFx0XHRcdFx0cGFyYW1ldGVyczogeyBwcm9tcHQ6ICd0ZXN0JywgZGVzY3JpcHRpb246ICd0ZXN0IHRhc2snLCBtb2RlbDogJ05vbmV4aXN0ZW50IE1vZGVsIChWZW5kb3IpJyB9LFxuXHRcdFx0XHRcdHRvb2xDYWxsSWQ6ICdtb2RlbC1jYWxsLTQnLFxuXHRcdFx0XHRcdG1vZGVsSWQ6ICdtYWluLW1vZGVsLWlkJyxcblx0XHRcdFx0XHRjaGF0U2Vzc2lvblJlc291cmNlOiBVUkkucGFyc2UoJ3Rlc3Q6Ly9zZXNzaW9uJyksXG5cdFx0XHRcdH0sIENhbmNlbGxhdGlvblRva2VuLk5vbmUpLFxuXHRcdFx0XHQoZXJyOiBFcnJvcikgPT4ge1xuXHRcdFx0XHRcdGFzc2VydC5vayhlcnIubWVzc2FnZS5pbmNsdWRlcygnTm9uZXhpc3RlbnQgTW9kZWwgKFZlbmRvciknKSk7XG5cdFx0XHRcdFx0YXNzZXJ0Lm9rKGVyci5tZXNzYWdlLmluY2x1ZGVzKCdub3QgZm91bmQnKSk7XG5cdFx0XHRcdFx0YXNzZXJ0Lm9rKGVyci5tZXNzYWdlLmluY2x1ZGVzKCdBdmFpbGFibGUgbW9kZWxzOicpKTtcblx0XHRcdFx0XHRhc3NlcnQub2soZXJyLm1lc3NhZ2UuaW5jbHVkZXMoJ0dQVC00byAoVGVzdFZlbmRvciknKSk7XG5cdFx0XHRcdFx0YXNzZXJ0Lm9rKGVyci5tZXNzYWdlLmluY2x1ZGVzKCdDbGF1ZGUgU29ubmV0IChUZXN0VmVuZG9yKScpKTtcblx0XHRcdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHRcdFx0fVxuXHRcdFx0KTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3Rocm93cyBlcnJvciB3aXRoIG5vIG1vZGVscyBtZXNzYWdlIHdoZW4gbm8gbW9kZWxzIGFyZSBhdmFpbGFibGUnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCB0b29sID0gY3JlYXRlVG9vbCh7IG1vZGVsczogbmV3IE1hcCgpLCBxdWFsaWZpZWROYW1lTWFwOiBuZXcgTWFwKCkgfSk7XG5cblx0XHRcdGF3YWl0IGFzc2VydC5yZWplY3RzKFxuXHRcdFx0XHQoKSA9PiB0b29sLnByZXBhcmVUb29sSW52b2NhdGlvbih7XG5cdFx0XHRcdFx0cGFyYW1ldGVyczogeyBwcm9tcHQ6ICd0ZXN0JywgZGVzY3JpcHRpb246ICd0ZXN0IHRhc2snLCBtb2RlbDogJ05vbmV4aXN0ZW50IE1vZGVsIChWZW5kb3IpJyB9LFxuXHRcdFx0XHRcdHRvb2xDYWxsSWQ6ICdtb2RlbC1jYWxsLTUnLFxuXHRcdFx0XHRcdG1vZGVsSWQ6IHVuZGVmaW5lZCxcblx0XHRcdFx0XHRjaGF0U2Vzc2lvblJlc291cmNlOiBVUkkucGFyc2UoJ3Rlc3Q6Ly9zZXNzaW9uJyksXG5cdFx0XHRcdH0sIENhbmNlbGxhdGlvblRva2VuLk5vbmUpLFxuXHRcdFx0XHQoZXJyOiBFcnJvcikgPT4ge1xuXHRcdFx0XHRcdGFzc2VydC5vayhlcnIubWVzc2FnZS5pbmNsdWRlcygnTm9uZXhpc3RlbnQgTW9kZWwgKFZlbmRvciknKSk7XG5cdFx0XHRcdFx0YXNzZXJ0Lm9rKGVyci5tZXNzYWdlLmluY2x1ZGVzKCdub3QgZm91bmQnKSk7XG5cdFx0XHRcdFx0YXNzZXJ0Lm9rKGVyci5tZXNzYWdlLmluY2x1ZGVzKCdObyBtb2RlbHMgYXZhaWxhYmxlJykpO1xuXHRcdFx0XHRcdHJldHVybiB0cnVlO1xuXHRcdFx0XHR9XG5cdFx0XHQpO1xuXHRcdH0pO1xuXHR9KTtcblxuXHRzdWl0ZSgnbmVzdGVkIHN1YmFnZW50IGRlcHRoIHRyYWNraW5nJywgKCkgPT4ge1xuXHRcdC8qKlxuXHRcdCAqIENyZWF0ZXMgYSBSdW5TdWJhZ2VudFRvb2wgd2l0aCBtb2NrZWQgc2VydmljZXMgc3VpdGFibGUgZm9yIGludm9rZSgpIHRlc3RpbmcuXG5cdFx0ICogVGhlIHJldHVybmVkIGBjYXB0dXJlZFJlcXVlc3RzYCBhcnJheSBjb2xsZWN0cyBldmVyeSBJQ2hhdEFnZW50UmVxdWVzdCBwYXNzZWQgdG8gaW52b2tlQWdlbnQuXG5cdFx0ICovXG5cdFx0bGV0IGNhbGxJZENvdW50ZXIgPSAwO1xuXHRcdGZ1bmN0aW9uIGNyZWF0ZUludm9rYWJsZVRvb2wob3B0czoge1xuXHRcdFx0YWxsb3dJbnZvY2F0aW9uc0Zyb21TdWJhZ2VudHM6IGJvb2xlYW47XG5cdFx0XHRjYXB0dXJlZFJlcXVlc3RzOiBJQ2hhdEFnZW50UmVxdWVzdFtdO1xuXHRcdFx0Y3VycmVudE1vZGVJbnN0cnVjdGlvbnM/OiBJQ2hhdFJlcXVlc3RNb2RlSW5zdHJ1Y3Rpb25zO1xuXHRcdH0pIHtcblx0XHRcdGNvbnN0IG1vY2tUb29sc1NlcnZpY2UgPSB0ZXN0RGlzcG9zYWJsZXMuYWRkKG5ldyBNb2NrTGFuZ3VhZ2VNb2RlbFRvb2xzU2VydmljZSgpKTtcblx0XHRcdGNvbnN0IGNvbmZpZ1NlcnZpY2UgPSBuZXcgVGVzdENvbmZpZ3VyYXRpb25TZXJ2aWNlKHtcblx0XHRcdFx0W0NoYXRDb25maWd1cmF0aW9uLlN1YmFnZW50c0FsbG93SW52b2NhdGlvbnNGcm9tU3ViYWdlbnRzXTogb3B0cy5hbGxvd0ludm9jYXRpb25zRnJvbVN1YmFnZW50cyxcblx0XHRcdH0pO1xuXHRcdFx0Y29uc3QgcHJvbXB0c1NlcnZpY2UgPSBuZXcgTW9ja1Byb21wdHNTZXJ2aWNlKCk7XG5cblx0XHRcdGNvbnN0IG1vY2tDaGF0QWdlbnRTZXJ2aWNlOiBQaWNrPElDaGF0QWdlbnRTZXJ2aWNlLCAnZ2V0RGVmYXVsdEFnZW50JyB8ICdpbnZva2VBZ2VudCc+ID0ge1xuXHRcdFx0XHRnZXREZWZhdWx0QWdlbnQoKSB7XG5cdFx0XHRcdFx0cmV0dXJuIHsgaWQ6ICdkZWZhdWx0LWFnZW50JyB9IGFzIElDaGF0QWdlbnRTZXJ2aWNlIGV4dGVuZHMgeyBnZXREZWZhdWx0QWdlbnQoLi4uYXJnczogaW5mZXIgX0EpOiBpbmZlciBSIH0gPyBOb25OdWxsYWJsZTxSPiA6IG5ldmVyO1xuXHRcdFx0XHR9LFxuXHRcdFx0XHRhc3luYyBpbnZva2VBZ2VudChfaWQ6IHN0cmluZywgcmVxdWVzdDogSUNoYXRBZ2VudFJlcXVlc3QsIF9wcm9ncmVzczogKHBhcnRzOiBJQ2hhdFByb2dyZXNzW10pID0+IHZvaWQsIF9oaXN0b3J5OiBJQ2hhdEFnZW50SGlzdG9yeUVudHJ5W10sIF90b2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4pOiBQcm9taXNlPElDaGF0QWdlbnRSZXN1bHQ+IHtcblx0XHRcdFx0XHRvcHRzLmNhcHR1cmVkUmVxdWVzdHMucHVzaChyZXF1ZXN0KTtcblx0XHRcdFx0XHRyZXR1cm4ge307XG5cdFx0XHRcdH0sXG5cdFx0XHR9O1xuXG5cdFx0XHRjb25zdCBtb2NrQ2hhdFNlcnZpY2U6IFBpY2s8SUNoYXRTZXJ2aWNlLCAnZ2V0U2Vzc2lvbic+ID0ge1xuXHRcdFx0XHRnZXRTZXNzaW9uKCkge1xuXHRcdFx0XHRcdHJldHVybiB7XG5cdFx0XHRcdFx0XHRnZXRSZXF1ZXN0czogKCkgPT4gW3tcblx0XHRcdFx0XHRcdFx0aWQ6ICdyZXEtMScsXG5cdFx0XHRcdFx0XHRcdG1vZGVJbmZvOiBvcHRzLmN1cnJlbnRNb2RlSW5zdHJ1Y3Rpb25zID8ge1xuXHRcdFx0XHRcdFx0XHRcdGtpbmQ6IHVuZGVmaW5lZCxcblx0XHRcdFx0XHRcdFx0XHRpc0J1aWx0aW46IGZhbHNlLFxuXHRcdFx0XHRcdFx0XHRcdG1vZGVJbnN0cnVjdGlvbnM6IG9wdHMuY3VycmVudE1vZGVJbnN0cnVjdGlvbnMsXG5cdFx0XHRcdFx0XHRcdFx0dGVsZW1ldHJ5TW9kZUlkOiAnY3VzdG9tJyxcblx0XHRcdFx0XHRcdFx0XHRhcHBseUNvZGVCbG9ja1N1Z2dlc3Rpb25JZDogdW5kZWZpbmVkLFxuXHRcdFx0XHRcdFx0XHR9IDogdW5kZWZpbmVkXG5cdFx0XHRcdFx0XHR9XSxcblx0XHRcdFx0XHRcdGFjY2VwdFJlc3BvbnNlUHJvZ3Jlc3M6ICgpID0+IHsgfSxcblx0XHRcdFx0XHR9IGFzIHVua25vd24gYXMgSUNoYXRNb2RlbDtcblx0XHRcdFx0fSxcblx0XHRcdH07XG5cblx0XHRcdGNvbnN0IG1vY2tJbnN0YW50aWF0aW9uU2VydmljZTogUGljazxJSW5zdGFudGlhdGlvblNlcnZpY2UsICdjcmVhdGVJbnN0YW5jZSc+ID0ge1xuXHRcdFx0XHRjcmVhdGVJbnN0YW5jZSguLi5fYXJnczogbmV2ZXJbXSk6IHsgY29sbGVjdDogKCkgPT4gUHJvbWlzZTx2b2lkPiB9IHtcblx0XHRcdFx0XHRyZXR1cm4geyBjb2xsZWN0OiBhc3luYyAoKSA9PiB7IH0gfTtcblx0XHRcdFx0fSxcblx0XHRcdH07XG5cblx0XHRcdGNvbnN0IHRvb2wgPSB0ZXN0RGlzcG9zYWJsZXMuYWRkKG5ldyBSdW5TdWJhZ2VudFRvb2woXG5cdFx0XHRcdG1vY2tDaGF0QWdlbnRTZXJ2aWNlIGFzIElDaGF0QWdlbnRTZXJ2aWNlLFxuXHRcdFx0XHRtb2NrQ2hhdFNlcnZpY2UgYXMgSUNoYXRTZXJ2aWNlLFxuXHRcdFx0XHRtb2NrVG9vbHNTZXJ2aWNlLFxuXHRcdFx0XHR7fSBhcyBJTGFuZ3VhZ2VNb2RlbHNTZXJ2aWNlLFxuXHRcdFx0XHRuZXcgTnVsbExvZ1NlcnZpY2UoKSxcblx0XHRcdFx0Y29uZmlnU2VydmljZSxcblx0XHRcdFx0cHJvbXB0c1NlcnZpY2UsXG5cdFx0XHRcdG1vY2tJbnN0YW50aWF0aW9uU2VydmljZSBhcyBJSW5zdGFudGlhdGlvblNlcnZpY2UsXG5cdFx0XHRcdHt9IGFzIElQcm9kdWN0U2VydmljZSxcblx0XHRcdCkpO1xuXG5cdFx0XHRyZXR1cm4geyB0b29sLCBtb2NrQ2hhdEFnZW50U2VydmljZSB9O1xuXHRcdH1cblxuXHRcdGZ1bmN0aW9uIGNyZWF0ZUludm9jYXRpb24oc2Vzc2lvblVyaTogVVJJLCB1c2VyU2VsZWN0ZWRUb29scz86IFVzZXJTZWxlY3RlZFRvb2xzKTogSVRvb2xJbnZvY2F0aW9uIHtcblx0XHRcdHJldHVybiB7XG5cdFx0XHRcdGNhbGxJZDogYGNhbGwtJHsrK2NhbGxJZENvdW50ZXJ9YCxcblx0XHRcdFx0dG9vbElkOiAncnVuU3ViYWdlbnQnLFxuXHRcdFx0XHRwYXJhbWV0ZXJzOiB7IHByb21wdDogJ2RvIHNvbWV0aGluZycsIGRlc2NyaXB0aW9uOiAndGVzdCcgfSxcblx0XHRcdFx0Y29udGV4dDogeyBzZXNzaW9uUmVzb3VyY2U6IHNlc3Npb25VcmkgfSxcblx0XHRcdFx0dXNlclNlbGVjdGVkVG9vbHM6IHVzZXJTZWxlY3RlZFRvb2xzID8/IHsgcnVuU3ViYWdlbnQ6IHRydWUgfSxcblx0XHRcdH0gYXMgSVRvb2xJbnZvY2F0aW9uO1xuXHRcdH1cblxuXHRcdGNvbnN0IGNvdW50VG9rZW5zID0gYXN5bmMgKCkgPT4gMDtcblx0XHRjb25zdCBub1Byb2dyZXNzOiBUb29sUHJvZ3Jlc3MgPSB7IHJlcG9ydCgpIHsgfSB9O1xuXG5cdFx0dGVzdCgnZGlzYWJsZXMgcnVuU3ViYWdlbnQgdG9vbCB3aGVuIG5lc3RpbmcgaXMgZGlzYWJsZWQnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCBjYXB0dXJlZFJlcXVlc3RzOiBJQ2hhdEFnZW50UmVxdWVzdFtdID0gW107XG5cdFx0XHRjb25zdCB7IHRvb2wgfSA9IGNyZWF0ZUludm9rYWJsZVRvb2woeyBhbGxvd0ludm9jYXRpb25zRnJvbVN1YmFnZW50czogZmFsc2UsIGNhcHR1cmVkUmVxdWVzdHMgfSk7XG5cdFx0XHRjb25zdCBzZXNzaW9uVXJpID0gVVJJLnBhcnNlKCd0ZXN0Oi8vc2Vzc2lvbi9kZXB0aDAnKTtcblxuXHRcdFx0YXdhaXQgdG9vbC5pbnZva2UoY3JlYXRlSW52b2NhdGlvbihzZXNzaW9uVXJpKSwgY291bnRUb2tlbnMsIG5vUHJvZ3Jlc3MsIENhbmNlbGxhdGlvblRva2VuLk5vbmUpO1xuXG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY2FwdHVyZWRSZXF1ZXN0cy5sZW5ndGgsIDEpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNhcHR1cmVkUmVxdWVzdHNbMF0udXNlclNlbGVjdGVkVG9vbHM/LlsncnVuU3ViYWdlbnQnXSwgZmFsc2UpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnZW5hYmxlcyBydW5TdWJhZ2VudCB0b29sIGF0IGRlcHRoIDAgd2hlbiBuZXN0aW5nIGlzIGVuYWJsZWQnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCBjYXB0dXJlZFJlcXVlc3RzOiBJQ2hhdEFnZW50UmVxdWVzdFtdID0gW107XG5cdFx0XHRjb25zdCB7IHRvb2wgfSA9IGNyZWF0ZUludm9rYWJsZVRvb2woeyBhbGxvd0ludm9jYXRpb25zRnJvbVN1YmFnZW50czogdHJ1ZSwgY2FwdHVyZWRSZXF1ZXN0cyB9KTtcblx0XHRcdGNvbnN0IHNlc3Npb25VcmkgPSBVUkkucGFyc2UoJ3Rlc3Q6Ly9zZXNzaW9uL2RlcHRoLWVuYWJsZWQnKTtcblxuXHRcdFx0YXdhaXQgdG9vbC5pbnZva2UoY3JlYXRlSW52b2NhdGlvbihzZXNzaW9uVXJpKSwgY291bnRUb2tlbnMsIG5vUHJvZ3Jlc3MsIENhbmNlbGxhdGlvblRva2VuLk5vbmUpO1xuXG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY2FwdHVyZWRSZXF1ZXN0cy5sZW5ndGgsIDEpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNhcHR1cmVkUmVxdWVzdHNbMF0udXNlclNlbGVjdGVkVG9vbHM/LlsncnVuU3ViYWdlbnQnXSwgdHJ1ZSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdkaXNhYmxlcyBydW5TdWJhZ2VudCB0b29sIHdoZW4gZGVwdGggcmVhY2hlcyBoYXJkIGxpbWl0JywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgY2FwdHVyZWRSZXF1ZXN0czogSUNoYXRBZ2VudFJlcXVlc3RbXSA9IFtdO1xuXHRcdFx0Y29uc3Qgc2Vzc2lvblVyaSA9IFVSSS5wYXJzZSgndGVzdDovL3Nlc3Npb24vZGVwdGgtbGltaXQnKTtcblxuXHRcdFx0Ly8gV2hlbiBuZXN0aW5nIGlzIGVuYWJsZWQsIHRoZSB0b29sIGVuZm9yY2VzIGEgaGFyZGNvZGVkIG1heGltdW0gZGVwdGggb2YgNS5cblx0XHRcdC8vIFNpbXVsYXRlIG5lc3RlZCBpbnZvY2F0aW9uIHVudGlsIHdlIGV4Y2VlZCB0aGUgbGltaXQgYW5kIGVuc3VyZSBpdCBkaXNhYmxlcyBuZXN0aW5nLlxuXHRcdFx0Y29uc3QgeyB0b29sLCBtb2NrQ2hhdEFnZW50U2VydmljZSB9ID0gY3JlYXRlSW52b2thYmxlVG9vbCh7IGFsbG93SW52b2NhdGlvbnNGcm9tU3ViYWdlbnRzOiB0cnVlLCBjYXB0dXJlZFJlcXVlc3RzIH0pO1xuXG5cdFx0XHQvLyBTaW11bGF0ZSBuZXN0ZWQgaW52b2NhdGlvbjogdGhlIGZpcnN0IGludm9rZSdzIGludm9rZUFnZW50IGNhbGxiYWNrXG5cdFx0XHQvLyB0cmlnZ2VycyBhIHNlY29uZCBpbnZva2Ugb24gdGhlIHNhbWUgdG9vbCAoc2FtZSBzZXNzaW9uKS5cblx0XHRcdGNhcHR1cmVkUmVxdWVzdHMubGVuZ3RoID0gMDtcblx0XHRcdGxldCBuZXN0ZWRJbnZvY2F0aW9ucyA9IDA7XG5cdFx0XHRtb2NrQ2hhdEFnZW50U2VydmljZS5pbnZva2VBZ2VudCA9IGFzeW5jIChfaWQ6IHN0cmluZywgcmVxdWVzdDogSUNoYXRBZ2VudFJlcXVlc3QpID0+IHtcblx0XHRcdFx0Y2FwdHVyZWRSZXF1ZXN0cy5wdXNoKHJlcXVlc3QpO1xuXHRcdFx0XHQvLyBLZWVwIG5lc3RpbmcgdW50aWwgd2UgZ28gYmV5b25kIHRoZSBoYXJkY29kZWQgbWF4RGVwdGhcblx0XHRcdFx0aWYgKG5lc3RlZEludm9jYXRpb25zKysgPCBSVU5fU1VCQUdFTlRfTUFYX05FU1RJTkdfREVQVEggKyAxKSB7XG5cdFx0XHRcdFx0YXdhaXQgdG9vbC5pbnZva2UoY3JlYXRlSW52b2NhdGlvbihzZXNzaW9uVXJpKSwgY291bnRUb2tlbnMsIG5vUHJvZ3Jlc3MsIENhbmNlbGxhdGlvblRva2VuLk5vbmUpO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHJldHVybiB7fTtcblx0XHRcdH07XG5cblx0XHRcdGF3YWl0IHRvb2wuaW52b2tlKGNyZWF0ZUludm9jYXRpb24oc2Vzc2lvblVyaSksIGNvdW50VG9rZW5zLCBub1Byb2dyZXNzLCBDYW5jZWxsYXRpb25Ub2tlbi5Ob25lKTtcblxuXHRcdFx0YXNzZXJ0Lm9rKGNhcHR1cmVkUmVxdWVzdHMubGVuZ3RoID49IDIpO1xuXHRcdFx0Ly8gQXQgZGVwdGggMC4uKG1heERlcHRoLTEpLCBuZXN0aW5nIGlzIGFsbG93ZWQuIE9uY2UgZGVwdGggcmVhY2hlcyBtYXhEZXB0aCwgdGhlIG5leHQgY2FsbCBzaG91bGQgZGlzYWJsZSBuZXN0aW5nLlxuXHRcdFx0Y29uc3QgZW5hYmxlZEZsYWdzID0gY2FwdHVyZWRSZXF1ZXN0cy5tYXAociA9PiByLnVzZXJTZWxlY3RlZFRvb2xzPy5bJ3J1blN1YmFnZW50J10pO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGVuYWJsZWRGbGFnc1swXSwgdHJ1ZSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZW5hYmxlZEZsYWdzWzFdLCB0cnVlKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChlbmFibGVkRmxhZ3NbUlVOX1NVQkFHRU5UX01BWF9ORVNUSU5HX0RFUFRIXSwgZmFsc2UpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnZGVwdGggaXMgZGVjcmVtZW50ZWQgYWZ0ZXIgaW52b2tlIGNvbXBsZXRlcycsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IGNhcHR1cmVkUmVxdWVzdHM6IElDaGF0QWdlbnRSZXF1ZXN0W10gPSBbXTtcblx0XHRcdGNvbnN0IHsgdG9vbCB9ID0gY3JlYXRlSW52b2thYmxlVG9vbCh7IGFsbG93SW52b2NhdGlvbnNGcm9tU3ViYWdlbnRzOiB0cnVlLCBjYXB0dXJlZFJlcXVlc3RzIH0pO1xuXHRcdFx0Y29uc3Qgc2Vzc2lvblVyaSA9IFVSSS5wYXJzZSgndGVzdDovL3Nlc3Npb24vZGVwdGgtZGVjcmVtZW50Jyk7XG5cblx0XHRcdC8vIEZpcnN0IGludm9rZVxuXHRcdFx0YXdhaXQgdG9vbC5pbnZva2UoY3JlYXRlSW52b2NhdGlvbihzZXNzaW9uVXJpKSwgY291bnRUb2tlbnMsIG5vUHJvZ3Jlc3MsIENhbmNlbGxhdGlvblRva2VuLk5vbmUpO1xuXHRcdFx0Ly8gU2Vjb25kIGludm9rZSBvbiBzYW1lIHNlc3Npb24gc2hvdWxkIHN0YXJ0IGF0IGRlcHRoIDAgYWdhaW5cblx0XHRcdGF3YWl0IHRvb2wuaW52b2tlKGNyZWF0ZUludm9jYXRpb24oc2Vzc2lvblVyaSksIGNvdW50VG9rZW5zLCBub1Byb2dyZXNzLCBDYW5jZWxsYXRpb25Ub2tlbi5Ob25lKTtcblxuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNhcHR1cmVkUmVxdWVzdHMubGVuZ3RoLCAyKTtcblx0XHRcdC8vIEJvdGggc2hvdWxkIGhhdmUgcnVuU3ViYWdlbnQgZW5hYmxlZCBzaW5jZSBkZXB0aCByZXNldHMgYWZ0ZXIgZWFjaCBpbnZva2Vcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChjYXB0dXJlZFJlcXVlc3RzWzBdLnVzZXJTZWxlY3RlZFRvb2xzPy5bJ3J1blN1YmFnZW50J10sIHRydWUpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNhcHR1cmVkUmVxdWVzdHNbMV0udXNlclNlbGVjdGVkVG9vbHM/LlsncnVuU3ViYWdlbnQnXSwgdHJ1ZSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdpbmhlcml0cyB0aGUgY3VycmVudCBhZ2VudCBpbnN0cnVjdGlvbnMgd2hlbiBhZ2VudE5hbWUgaXMgb21pdHRlZCcsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IGNhcHR1cmVkUmVxdWVzdHM6IElDaGF0QWdlbnRSZXF1ZXN0W10gPSBbXTtcblx0XHRcdGNvbnN0IGN1cnJlbnRNb2RlSW5zdHJ1Y3Rpb25zID0geyBuYW1lOiAnQ3VycmVudEFnZW50JywgY29udGVudDogJ0N1cnJlbnQgYWdlbnQgaW5zdHJ1Y3Rpb25zJywgdG9vbFJlZmVyZW5jZXM6IFtdIH07XG5cdFx0XHRjb25zdCB7IHRvb2wgfSA9IGNyZWF0ZUludm9rYWJsZVRvb2woeyBhbGxvd0ludm9jYXRpb25zRnJvbVN1YmFnZW50czogZmFsc2UsIGNhcHR1cmVkUmVxdWVzdHMsIGN1cnJlbnRNb2RlSW5zdHJ1Y3Rpb25zIH0pO1xuXHRcdFx0Y29uc3Qgc2Vzc2lvblVyaSA9IFVSSS5wYXJzZSgndGVzdDovL3Nlc3Npb24vY3VycmVudC1hZ2VudCcpO1xuXG5cdFx0XHRhd2FpdCB0b29sLmludm9rZShjcmVhdGVJbnZvY2F0aW9uKHNlc3Npb25VcmkpLCBjb3VudFRva2Vucywgbm9Qcm9ncmVzcywgQ2FuY2VsbGF0aW9uVG9rZW4uTm9uZSk7XG5cblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChjYXB0dXJlZFJlcXVlc3RzLmxlbmd0aCwgMSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY2FwdHVyZWRSZXF1ZXN0c1swXS5zdWJBZ2VudE5hbWUsICdDdXJyZW50QWdlbnQnKTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoY2FwdHVyZWRSZXF1ZXN0c1swXS5tb2RlSW5zdHJ1Y3Rpb25zLCBjdXJyZW50TW9kZUluc3RydWN0aW9ucyk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHN1aXRlKCdzdWJhZ2VudCBjcmVkaXRzJywgKCkgPT4ge1xuXHRcdGxldCBjcmVkaXRzQ2FsbElkQ291bnRlciA9IDA7XG5cblx0XHQvKipcblx0XHQgKiBDcmVhdGVzIGEgUnVuU3ViYWdlbnRUb29sIHdob3NlIHN1YmFnZW50IGludm9jYXRpb24gZW1pdHMgdGhlIHN1cHBsaWVkXG5cdFx0ICogdXNhZ2UgcHJvZ3Jlc3MgcGFydHMsIHNvIHRlc3RzIGNhbiBhc3NlcnQgaG93IHRoZSBzdWJhZ2VudCdzIGNyZWRpdFxuXHRcdCAqIChBSUMpIGNvc3QgaXMgc3VyZmFjZWQgb24gaXRzIHRvb2wncyBgdG9vbFNwZWNpZmljRGF0YWAuXG5cdFx0ICovXG5cdFx0ZnVuY3Rpb24gY3JlYXRlQ3JlZGl0VG9vbCh1c2FnZVBhcnRzOiBJQ2hhdFByb2dyZXNzW10sIHJlc3VsdDogSUNoYXRBZ2VudFJlc3VsdCA9IHt9KSB7XG5cdFx0XHRjb25zdCBtb2NrVG9vbHNTZXJ2aWNlID0gdGVzdERpc3Bvc2FibGVzLmFkZChuZXcgTW9ja0xhbmd1YWdlTW9kZWxUb29sc1NlcnZpY2UoKSk7XG5cdFx0XHRjb25zdCBjb25maWdTZXJ2aWNlID0gbmV3IFRlc3RDb25maWd1cmF0aW9uU2VydmljZSgpO1xuXHRcdFx0Y29uc3QgcHJvbXB0c1NlcnZpY2UgPSBuZXcgTW9ja1Byb21wdHNTZXJ2aWNlKCk7XG5cdFx0XHRjb25zdCBwYXJlbnRDcmVkaXRzOiB7IHN1YmFnZW50Q2FsbElkOiBzdHJpbmc7IGNvcGlsb3RDcmVkaXRzOiBudW1iZXIgfVtdID0gW107XG5cblx0XHRcdGNvbnN0IG1vY2tDaGF0QWdlbnRTZXJ2aWNlOiBQaWNrPElDaGF0QWdlbnRTZXJ2aWNlLCAnZ2V0RGVmYXVsdEFnZW50JyB8ICdpbnZva2VBZ2VudCc+ID0ge1xuXHRcdFx0XHRnZXREZWZhdWx0QWdlbnQoKSB7XG5cdFx0XHRcdFx0cmV0dXJuIHsgaWQ6ICdkZWZhdWx0LWFnZW50JyB9IGFzIElDaGF0QWdlbnRTZXJ2aWNlIGV4dGVuZHMgeyBnZXREZWZhdWx0QWdlbnQoLi4uYXJnczogaW5mZXIgX0EpOiBpbmZlciBSIH0gPyBOb25OdWxsYWJsZTxSPiA6IG5ldmVyO1xuXHRcdFx0XHR9LFxuXHRcdFx0XHRhc3luYyBpbnZva2VBZ2VudChfaWQ6IHN0cmluZywgX3JlcXVlc3Q6IElDaGF0QWdlbnRSZXF1ZXN0LCBwcm9ncmVzczogKHBhcnRzOiBJQ2hhdFByb2dyZXNzW10pID0+IHZvaWQpOiBQcm9taXNlPElDaGF0QWdlbnRSZXN1bHQ+IHtcblx0XHRcdFx0XHRwcm9ncmVzcyh1c2FnZVBhcnRzKTtcblx0XHRcdFx0XHRyZXR1cm4gcmVzdWx0O1xuXHRcdFx0XHR9LFxuXHRcdFx0fTtcblxuXHRcdFx0Y29uc3QgbW9ja0NoYXRTZXJ2aWNlOiBQaWNrPElDaGF0U2VydmljZSwgJ2dldFNlc3Npb24nPiA9IHtcblx0XHRcdFx0Z2V0U2Vzc2lvbigpIHtcblx0XHRcdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRcdFx0Z2V0UmVxdWVzdHM6ICgpID0+IFt7XG5cdFx0XHRcdFx0XHRcdGlkOiAncmVxLTEnLFxuXHRcdFx0XHRcdFx0XHRyZXNwb25zZToge1xuXHRcdFx0XHRcdFx0XHRcdHNldFN1YmFnZW50Q29waWxvdENyZWRpdHM6IChzdWJhZ2VudENhbGxJZDogc3RyaW5nLCBjb3BpbG90Q3JlZGl0czogbnVtYmVyKSA9PiBwYXJlbnRDcmVkaXRzLnB1c2goeyBzdWJhZ2VudENhbGxJZCwgY29waWxvdENyZWRpdHMgfSksXG5cdFx0XHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0XHR9XSxcblx0XHRcdFx0XHRcdGFjY2VwdFJlc3BvbnNlUHJvZ3Jlc3M6ICgpID0+IHsgfSxcblx0XHRcdFx0XHR9IGFzIHVua25vd24gYXMgSUNoYXRNb2RlbDtcblx0XHRcdFx0fSxcblx0XHRcdH07XG5cblx0XHRcdGNvbnN0IG1vY2tJbnN0YW50aWF0aW9uU2VydmljZTogUGljazxJSW5zdGFudGlhdGlvblNlcnZpY2UsICdjcmVhdGVJbnN0YW5jZSc+ID0ge1xuXHRcdFx0XHRjcmVhdGVJbnN0YW5jZSguLi5fYXJnczogbmV2ZXJbXSk6IHsgY29sbGVjdDogKCkgPT4gUHJvbWlzZTx2b2lkPiB9IHtcblx0XHRcdFx0XHRyZXR1cm4geyBjb2xsZWN0OiBhc3luYyAoKSA9PiB7IH0gfTtcblx0XHRcdFx0fSxcblx0XHRcdH07XG5cblx0XHRcdGNvbnN0IHRvb2wgPSB0ZXN0RGlzcG9zYWJsZXMuYWRkKG5ldyBSdW5TdWJhZ2VudFRvb2woXG5cdFx0XHRcdG1vY2tDaGF0QWdlbnRTZXJ2aWNlIGFzIElDaGF0QWdlbnRTZXJ2aWNlLFxuXHRcdFx0XHRtb2NrQ2hhdFNlcnZpY2UgYXMgSUNoYXRTZXJ2aWNlLFxuXHRcdFx0XHRtb2NrVG9vbHNTZXJ2aWNlLFxuXHRcdFx0XHR7fSBhcyBJTGFuZ3VhZ2VNb2RlbHNTZXJ2aWNlLFxuXHRcdFx0XHRuZXcgTnVsbExvZ1NlcnZpY2UoKSxcblx0XHRcdFx0Y29uZmlnU2VydmljZSxcblx0XHRcdFx0cHJvbXB0c1NlcnZpY2UsXG5cdFx0XHRcdG1vY2tJbnN0YW50aWF0aW9uU2VydmljZSBhcyBJSW5zdGFudGlhdGlvblNlcnZpY2UsXG5cdFx0XHRcdHt9IGFzIElQcm9kdWN0U2VydmljZSxcblx0XHRcdCkpO1xuXHRcdFx0cmV0dXJuIHsgdG9vbCwgcGFyZW50Q3JlZGl0cyB9O1xuXHRcdH1cblxuXHRcdGZ1bmN0aW9uIGNyZWF0ZVN1YmFnZW50SW52b2NhdGlvbihjaGF0U3RyZWFtVG9vbENhbGxJZD86IHN0cmluZyk6IElUb29sSW52b2NhdGlvbiB7XG5cdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRjYWxsSWQ6IGBjcmVkaXRzLWNhbGwtJHsrK2NyZWRpdHNDYWxsSWRDb3VudGVyfWAsXG5cdFx0XHRcdGNoYXRTdHJlYW1Ub29sQ2FsbElkLFxuXHRcdFx0XHR0b29sSWQ6ICdydW5TdWJhZ2VudCcsXG5cdFx0XHRcdHBhcmFtZXRlcnM6IHsgcHJvbXB0OiAnZG8gc29tZXRoaW5nJywgZGVzY3JpcHRpb246ICd0ZXN0JyB9LFxuXHRcdFx0XHRjb250ZXh0OiB7IHNlc3Npb25SZXNvdXJjZTogVVJJLnBhcnNlKCd0ZXN0Oi8vc2Vzc2lvbi9jcmVkaXRzJykgfSxcblx0XHRcdFx0dXNlclNlbGVjdGVkVG9vbHM6IHsgcnVuU3ViYWdlbnQ6IHRydWUgfSxcblx0XHRcdFx0dG9vbFNwZWNpZmljRGF0YTogeyBraW5kOiAnc3ViYWdlbnQnLCBkZXNjcmlwdGlvbjogJ3Rlc3QnIH0sXG5cdFx0XHR9IGFzIElUb29sSW52b2NhdGlvbjtcblx0XHR9XG5cblx0XHRjb25zdCBjb3VudFRva2VucyA9IGFzeW5jICgpID0+IDA7XG5cdFx0Y29uc3Qgbm9Qcm9ncmVzczogVG9vbFByb2dyZXNzID0geyByZXBvcnQoKSB7IH0gfTtcblxuXHRcdHRlc3QoJ3dyaXRlcyB0aGUgcnVubmluZyBjcmVkaXQgdG90YWwgb250byB0aGUgc3ViYWdlbnQgdG9vbFNwZWNpZmljRGF0YScsIGFzeW5jICgpID0+IHtcblx0XHRcdC8vIENyZWRpdHMgYXJlIGN1bXVsYXRpdmUgcGVyIHVzYWdlIGV2ZW50OyB0aGUgbGF0ZXN0IHZhbHVlIGlzIHRoZSB0b3RhbC5cblx0XHRcdGNvbnN0IHsgdG9vbCwgcGFyZW50Q3JlZGl0cyB9ID0gY3JlYXRlQ3JlZGl0VG9vbChbXG5cdFx0XHRcdHsga2luZDogJ3VzYWdlJywgcHJvbXB0VG9rZW5zOiAxMCwgY29tcGxldGlvblRva2VuczogNSwgY29waWxvdENyZWRpdHM6IDIgfSxcblx0XHRcdFx0eyBraW5kOiAndXNhZ2UnLCBwcm9tcHRUb2tlbnM6IDIwLCBjb21wbGV0aW9uVG9rZW5zOiA4LCBjb3BpbG90Q3JlZGl0czogNSB9LFxuXHRcdFx0XHR7IGtpbmQ6ICd1c2FnZScsIHByb21wdFRva2VuczogMjAsIGNvbXBsZXRpb25Ub2tlbnM6IDgsIGNvcGlsb3RDcmVkaXRzOiAzIH0sXG5cdFx0XHRdKTtcblx0XHRcdGNvbnN0IGludm9jYXRpb24gPSBjcmVhdGVTdWJhZ2VudEludm9jYXRpb24oJ3N0cmVhbS10b29sLWNhbGwnKTtcblxuXHRcdFx0YXdhaXQgdG9vbC5pbnZva2UoaW52b2NhdGlvbiwgY291bnRUb2tlbnMsIG5vUHJvZ3Jlc3MsIENhbmNlbGxhdGlvblRva2VuLk5vbmUpO1xuXG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdFx0dG9vbENyZWRpdHM6IGludm9jYXRpb24udG9vbFNwZWNpZmljRGF0YT8ua2luZCA9PT0gJ3N1YmFnZW50JyA/IGludm9jYXRpb24udG9vbFNwZWNpZmljRGF0YS5jcmVkaXRzIDogdW5kZWZpbmVkLFxuXHRcdFx0XHRwYXJlbnRDcmVkaXRzLFxuXHRcdFx0fSwge1xuXHRcdFx0XHR0b29sQ3JlZGl0czogNSxcblx0XHRcdFx0cGFyZW50Q3JlZGl0czogW3sgc3ViYWdlbnRDYWxsSWQ6IGludm9jYXRpb24uY2FsbElkLCBjb3BpbG90Q3JlZGl0czogNSB9XSxcblx0XHRcdH0pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgncmVjb3JkcyBjcmVkaXRzIHdoZW4gdGhlIHN1YmFnZW50IGZhaWxzIGFmdGVyIHJlcG9ydGluZyB1c2FnZScsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IHsgdG9vbCwgcGFyZW50Q3JlZGl0cyB9ID0gY3JlYXRlQ3JlZGl0VG9vbChcblx0XHRcdFx0W3sga2luZDogJ3VzYWdlJywgcHJvbXB0VG9rZW5zOiAxMCwgY29tcGxldGlvblRva2VuczogNSwgY29waWxvdENyZWRpdHM6IDMgfV0sXG5cdFx0XHRcdHsgZXJyb3JEZXRhaWxzOiB7IG1lc3NhZ2U6ICdmYWlsZWQnIH0gfSxcblx0XHRcdCk7XG5cdFx0XHRjb25zdCBpbnZvY2F0aW9uID0gY3JlYXRlU3ViYWdlbnRJbnZvY2F0aW9uKCk7XG5cblx0XHRcdGF3YWl0IHRvb2wuaW52b2tlKGludm9jYXRpb24sIGNvdW50VG9rZW5zLCBub1Byb2dyZXNzLCBDYW5jZWxsYXRpb25Ub2tlbi5Ob25lKTtcblxuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRcdHRvb2xDcmVkaXRzOiBpbnZvY2F0aW9uLnRvb2xTcGVjaWZpY0RhdGE/LmtpbmQgPT09ICdzdWJhZ2VudCcgPyBpbnZvY2F0aW9uLnRvb2xTcGVjaWZpY0RhdGEuY3JlZGl0cyA6IHVuZGVmaW5lZCxcblx0XHRcdFx0cGFyZW50Q3JlZGl0cyxcblx0XHRcdH0sIHtcblx0XHRcdFx0dG9vbENyZWRpdHM6IDMsXG5cdFx0XHRcdHBhcmVudENyZWRpdHM6IFt7IHN1YmFnZW50Q2FsbElkOiBpbnZvY2F0aW9uLmNhbGxJZCwgY29waWxvdENyZWRpdHM6IDMgfV0sXG5cdFx0XHR9KTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2xlYXZlcyBjcmVkaXRzIHVuc2V0IHdoZW4gbm8gdXNhZ2UgaXMgcmVwb3J0ZWQnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCB7IHRvb2wgfSA9IGNyZWF0ZUNyZWRpdFRvb2woW10pO1xuXHRcdFx0Y29uc3QgaW52b2NhdGlvbiA9IGNyZWF0ZVN1YmFnZW50SW52b2NhdGlvbigpO1xuXG5cdFx0XHRhd2FpdCB0b29sLmludm9rZShpbnZvY2F0aW9uLCBjb3VudFRva2Vucywgbm9Qcm9ncmVzcywgQ2FuY2VsbGF0aW9uVG9rZW4uTm9uZSk7XG5cblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChpbnZvY2F0aW9uLnRvb2xTcGVjaWZpY0RhdGE/LmtpbmQgPT09ICdzdWJhZ2VudCcgPyBpbnZvY2F0aW9uLnRvb2xTcGVjaWZpY0RhdGEuY3JlZGl0cyA6IHVuZGVmaW5lZCwgdW5kZWZpbmVkKTtcblx0XHR9KTtcblx0fSk7XG59KTtcbiJdLAogICJtYXBwaW5ncyI6ICJBQUtBLE9BQU8sWUFBWTtBQUNuQixTQUFTLHlCQUF5QjtBQUNsQyxTQUFTLFdBQVc7QUFDcEIsU0FBUywrQ0FBK0M7QUFDeEQsU0FBUyxzQkFBc0I7QUFDL0IsU0FBUyxnQ0FBZ0M7QUFDekMsU0FBUyxnQ0FBZ0MsdUJBQXVCO0FBQ2hFLFNBQVMscUNBQXFDO0FBRzlDLFNBQVMseUJBQXNIO0FBRy9ILFNBQXVCLHNCQUFzQjtBQUM3QyxTQUFTLGNBQWM7QUFDdkIsU0FBUywwQkFBMEI7QUFDbkMsU0FBUywyQkFBMkI7QUFHcEMsU0FBUyx5QkFBeUI7QUFFbEMsTUFBTSxtQkFBbUIsTUFBTTtBQUM5QixRQUFNLGtCQUFrQix3Q0FBd0M7QUFFaEUsUUFBTSx1QkFBdUIsTUFBTTtBQUNsQyxTQUFLLDBEQUEwRCxNQUFNO0FBRXBFLFlBQU0sWUFBWTtBQUFBLFFBQ2pCLEVBQUUsT0FBTyw0QkFBNEIsVUFBVSxpQkFBaUI7QUFBQSxRQUNoRSxFQUFFLE9BQU8sOEJBQThCLFVBQVUsaUJBQWlCO0FBQUEsUUFDbEUsRUFBRSxPQUFPLG9DQUFvQyxVQUFVLGlCQUFpQjtBQUFBLFFBQ3hFLEVBQUUsT0FBTyxzQ0FBc0MsVUFBVSwyQkFBMkI7QUFBQTtBQUFBLFFBQ3BGLEVBQUUsT0FBTyxxQkFBcUIsVUFBVSxvQkFBb0I7QUFBQSxRQUM1RCxFQUFFLE9BQU8sY0FBYyxVQUFVLEdBQUc7QUFBQSxRQUNwQyxFQUFFLE9BQU8sSUFBSSxVQUFVLEdBQUc7QUFBQSxNQUMzQjtBQUVBLGlCQUFXLEVBQUUsT0FBTyxTQUFTLEtBQUssV0FBVztBQUM1QyxjQUFNLFNBQVMsTUFBTSxRQUFRLHFCQUFxQixFQUFFLEVB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
