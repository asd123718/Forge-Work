import assert from "assert";
import { CancellationToken } from "../../../../../../../base/common/cancellation.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../../../../base/test/common/utils.js";
import { Position } from "../../../../../../../editor/common/core/position.js";
import { CompletionTriggerKind } from "../../../../../../../editor/common/languages.js";
import { ContextKeyService } from "../../../../../../../platform/contextkey/browser/contextKeyService.js";
import { TestConfigurationService } from "../../../../../../../platform/configuration/test/common/testConfigurationService.js";
import { ExtensionIdentifier } from "../../../../../../../platform/extensions/common/extensions.js";
import { workbenchInstantiationService } from "../../../../../../test/browser/workbenchTestServices.js";
import { LanguageModelToolsService } from "../../../../browser/tools/languageModelToolsService.js";
import { ChatAgentLocation, ChatConfiguration } from "../../../../common/constants.js";
import { ILanguageModelToolsService, ToolDataSource } from "../../../../common/tools/languageModelToolsService.js";
import { ILanguageModelsService } from "../../../../common/languageModels.js";
import { IChatModeService } from "../../../../common/chatModes.js";
import { PromptHeaderAutocompletion } from "../../../../common/promptSyntax/languageProviders/promptHeaderAutocompletion.js";
import { IPromptsService, PromptsStorage } from "../../../../common/promptSyntax/service/promptsService.js";
import { getLanguageIdForPromptsType, PromptsType, Target } from "../../../../common/promptSyntax/promptTypes.js";
import { createTextModel } from "../../../../../../../editor/test/common/testTextModel.js";
import { URI } from "../../../../../../../base/common/uri.js";
import { PromptFileParser } from "../../../../common/promptSyntax/promptFileParser.js";
import { getPromptFileExtension } from "../../../../common/promptSyntax/config/promptFileLocations.js";
import { Range } from "../../../../../../../editor/common/core/range.js";
import { MockChatModeService } from "../../../common/mockChatModeService.js";
suite("PromptHeaderAutocompletion", () => {
  const disposables = ensureNoDisposablesAreLeakedInTestSuite();
  let instaService;
  let completionProvider;
  setup(async () => {
    const testConfigService = new TestConfigurationService();
    testConfigService.setUserConfiguration(ChatConfiguration.ExtensionToolsEnabled, true);
    instaService = workbenchInstantiationService({
      contextKeyService: () => disposables.add(new ContextKeyService(testConfigService)),
      configurationService: () => testConfigService
    }, disposables);
    const toolService = disposables.add(instaService.createInstance(LanguageModelToolsService));
    const testTool1 = { id: "testTool1", displayName: "tool1", canBeReferencedInPrompt: true, modelDescription: "Test Tool 1", source: ToolDataSource.External, inputSchema: {} };
    disposables.add(toolService.registerToolData(testTool1));
    const testTool2 = { id: "testTool2", displayName: "tool2", canBeReferencedInPrompt: true, toolReferenceName: "tool2", modelDescription: "Test Tool 2", source: ToolDataSource.External, inputSchema: {} };
    disposables.add(toolService.registerToolData(testTool2));
    instaService.set(ILanguageModelToolsService, toolService);
    const testModels = [
      { id: "mae-4", name: "MAE 4", vendor: "olama", version: "1.0", family: "mae", extension: new ExtensionIdentifier("a.b"), isUserSelectable: true, maxInputTokens: 8192, maxOutputTokens: 1024, capabilities: { agentMode: true, toolCalling: true }, isDefaultForLocation: { [ChatAgentLocation.Chat]: true } },
      { id: "mae-4.1", name: "MAE 4.1", vendor: "copilot", version: "1.0", family: "mae", extension: new ExtensionIdentifier("a.b"), isUserSelectable: true, maxInputTokens: 8192, maxOutputTokens: 1024, capabilities: { agentMode: true, toolCalling: true }, isDefaultForLocation: { [ChatAgentLocation.Chat]: true } },
      { id: "gpt-4", name: "GPT 4", vendor: "openai", version: "1.0", family: "gpt", extension: new ExtensionIdentifier("a.b"), isUserSelectable: true, maxInputTokens: 8192, maxOutputTokens: 1024, capabilities: { agentMode: false, toolCalling: true }, isDefaultForLocation: { [ChatAgentLocation.Chat]: true } },
      { id: "bg-agent-model", name: "BG Agent Model", vendor: "copilot", version: "1.0", family: "bg", extension: new ExtensionIdentifier("a.b"), isUserSelectable: true, maxInputTokens: 8192, maxOutputTokens: 1024, capabilities: { agentMode: true, toolCalling: true }, isDefaultForLocation: { [ChatAgentLocation.Chat]: true }, targetChatSessionType: "background" }
    ];
    instaService.stub(ILanguageModelsService, {
      getLanguageModelIds() {
        return testModels.map((m) => m.id);
      },
      lookupLanguageModel(name) {
        return testModels.find((m) => m.id === name);
      }
    });
    const customAgent = {
      id: "agent1",
      name: "agent1",
      description: "Agent file 1.",
      agentInstructions: {
        content: "",
        toolReferences: [],
        metadata: void 0
      },
      uri: URI.parse("myFs://.github/agents/agent1.agent.md"),
      source: { storage: PromptsStorage.local },
      target: Target.Undefined,
      visibility: { userInvocable: true, agentInvocable: true },
      enabled: true
    };
    const parser = new PromptFileParser();
    instaService.stub(IPromptsService, {
      getParsedPromptFile(model) {
        return parser.parse(model.uri, model.getValue());
      },
      async getCustomAgents(token) {
        return Promise.resolve([customAgent]);
      }
    });
    instaService.stub(IChatModeService, new MockChatModeService());
    completionProvider = instaService.createInstance(PromptHeaderAutocompletion);
  });
  async function getCompletions(content, promptType, uri) {
    const languageId = getLanguageIdForPromptsType(promptType);
    uri ??= URI.parse("test:///test" + getPromptFileExtension(promptType));
    const model = disposables.add(createTextModel(content, languageId, void 0, uri));
    const lineColumnMarkerRange = model.findNextMatch("|", new Position(1, 1), false, false, "", false)?.range;
    assert.ok(lineColumnMarkerRange, "No completion marker found in test content");
    model.applyEdits([{ range: lineColumnMarkerRange, text: "" }]);
    const position = lineColumnMarkerRange.getStartPosition();
    const context = { triggerKind: CompletionTriggerKind.Invoke };
    const result = await completionProvider.provideCompletionItems(model, position, context, CancellationToken.None);
    if (!result || !result.suggestions) {
      return [];
    }
    const lineContent = model.getLineContent(position.lineNumber);
    return result.suggestions.map((s) => {
      assert(s.range instanceof Range);
      return {
        label: typeof s.label === "string" ? s.label : s.label.label,
        result: lineContent.substring(0, s.range.startColumn - 1) + s.insertText + lineContent.substring(s.range.endColumn - 1)
      };
    });
  }
  const sortByLabel = (a, b) => a.label.localeCompare(b.label);
  suite("agent header completions", () => {
    test("complete model attribute name", async () => {
      const content = [
        "---",
        'description: "Test"',
        "|",
        "---"
      ].join("\n");
      const actual = await getCompletions(content, PromptsType.agent);
      assert.deepStrictEqual(actual.sort(sortByLabel), [
        { label: "agents", result: 'agents: ${0:["*"]}' },
        { label: "argument-hint", result: "argument-hint: $0" },
        { label: "disable-model-invocation", result: "disable-model-invocation: ${0:true}" },
        { label: "github", result: "github: $0" },
        { label: "handoffs", result: "handoffs: $0" },
        { label: "hooks", result: 'hooks:\n  ${1|SessionStart,SessionEnd,UserPromptSubmit,PreToolUse,PostToolUse,PreCompact,SubagentStart,SubagentStop,Stop,ErrorOccurred|}:\n    - type: command\n      command: "$2"' },
        { label: "model", result: "model: ${0:MAE 4 (olama)}" },
        { label: "name", result: "name: $0" },
        { label: "target", result: "target: ${0:vscode}" },
        { label: "tools", result: "tools: ${0:[]}" },
        { label: "user-invocable", result: "user-invocable: ${0:true}" }
      ].sort(sortByLabel));
    });
    test("complete model attribute value", async () => {
      const content = [
        "---",
        'description: "Test"',
        "model: |",
        "---"
      ].join("\n");
      const actual = await getCompletions(content, PromptsType.agent);
      assert.deepStrictEqual(actual.sort(sortByLabel), [
        { label: "MAE 4 (olama)", result: "model: MAE 4 (olama)" },
        { label: "MAE 4.1 (copilot)", result: "model: MAE 4.1 (copilot)" }
      ].sort(sortByLabel));
    });
    test("complete model attribute value with partial input", async () => {
      const content = [
        "---",
        'description: "Test"',
        "model: MA|",
        "---"
      ].join("\n");
      const actual = await getCompletions(content, PromptsType.agent);
      assert.deepStrictEqual(actual, [
        { label: "MAE 4 (olama)", result: "model: MAE 4 (olama)" },
        { label: "MAE 4.1 (copilot)", result: "model: MAE 4.1 (copilot)" }
      ]);
    });
    test("complete model names inside model array", async () => {
      const content = [
        "---",
        'description: "Test"',
        "model: [|]",
        "---"
      ].join("\n");
      const actual = await getCompletions(content, PromptsType.agent);
      assert.deepStrictEqual(actual.sort(sortByLabel), [
        { label: "MAE 4 (olama)", result: `model: ['MAE 4 (olama)']` },
        { label: "MAE 4.1 (copilot)", result: `model: ['MAE 4.1 (copilot)']` }
      ].sort(sortByLabel));
    });
    test("complete model names inside model array with existing entries", async () => {
      const content = [
        "---",
        'description: "Test"',
        `model: ['MAE 4 (olama)', |]`,
        "---"
      ].join("\n");
      const actual = await getCompletions(content, PromptsType.agent);
      assert.deepStrictEqual(actual.sort(sortByLabel), [
        { label: "MAE 4.1 (copilot)", result: `model: ['MAE 4 (olama)', 'MAE 4.1 (copilot)']` }
      ].sort(sortByLabel));
    });
    test("complete tool names inside tools array", async () => {
      const content = [
        "---",
        'description: "Test"',
        "tools: [|]",
        "---"
      ].join("\n");
      const actual = await getCompletions(content, PromptsType.agent);
      assert.deepStrictEqual(actual.sort(sortByLabel), [
        { label: "agent", result: `tools: [agent]` },
        { label: "execute", result: `tools: [execute]` },
        { label: "read", result: `tools: [read]` },
        { label: "tool1", result: `tools: [tool1]` },
        { label: "tool2", result: `tools: [tool2]` },
        { label: "vscode", result: `tools: [vscode]` }
      ].sort(sortByLabel));
    });
    test("complete tool names inside tools array with existing single quoted entries", async () => {
      const content = [
        "---",
        'description: "Test"',
        `tools: ['read', |]`,
        "---"
      ].join("\n");
      const actual = await getCompletions(content, PromptsType.agent);
      assert.deepStrictEqual(actual.sort(sortByLabel), [
        { label: "agent", result: `tools: ['read', 'agent']` },
        { label: "execute", result: `tools: ['read', 'execute']` },
        { label: "tool1", result: `tools: ['read', 'tool1']` },
        { label: "tool2", result: `tools: ['read', 'tool2']` },
        { label: "vscode", result: `tools: ['read', 'vscode']` }
      ].sort(sortByLabel));
    });
    test("complete tool names inside tools array with existing double quoted entries", async () => {
      const content = [
        "---",
        'description: "Test"',
        `tools: ["read", "tool1", |]`,
        "---"
      ].join("\n");
      const actual = await getCompletions(content, PromptsType.agent);
      assert.deepStrictEqual(actual.sort(sortByLabel), [
        { label: "agent", result: `tools: ["read", "tool1", "agent"]` },
        { label: "execute", result: `tools: ["read", "tool1", "execute"]` },
        { label: "tool2", result: `tools: ["read", "tool1", "tool2"]` },
        { label: "vscode", result: `tools: ["read", "tool1", "vscode"]` }
      ].sort(sortByLabel));
    });
    test("complete tool names inside tools array with existing unquoted entries", async () => {
      const content = [
        "---",
        'description: "Test"',
        `tools: [read, "tool1", |]`,
        "---"
      ].join("\n");
      const actual = await getCompletions(content, PromptsType.agent);
      assert.deepStrictEqual(actual.sort(sortByLabel), [
        { label: "agent", result: `tools: [read, "tool1", agent]` },
        { label: "execute", result: `tools: [read, "tool1", execute]` },
        { label: "tool2", result: `tools: [read, "tool1", tool2]` },
        { label: "vscode", result: `tools: [read, "tool1", vscode]` }
      ].sort(sortByLabel));
    });
    test("complete tool names inside tools array with existing entries 2", async () => {
      const content = [
        "---",
        'description: "Test"',
        `tools: ['read', 'exe|cute']`,
        "---"
      ].join("\n");
      const actual = await getCompletions(content, PromptsType.agent);
      assert.deepStrictEqual(actual.sort(sortByLabel), [
        { label: "agent", result: `tools: ['read', 'agent']` },
        { label: "execute", result: `tools: ['read', 'execute']` },
        { label: "tool1", result: `tools: ['read', 'tool1']` },
        { label: "tool2", result: `tools: ['read', 'tool2']` },
        { label: "vscode", result: `tools: ['read', 'vscode']` }
      ].sort(sortByLabel));
    });
    test("complete agents inside agents array", async () => {
      const content = [
        "---",
        'description: "Test"',
        "agents: [|]",
        "---"
      ].join("\n");
      const actual = await getCompletions(content, PromptsType.agent);
      assert.deepStrictEqual(actual.sort(sortByLabel), [
        { label: "agent1", result: `agents: [agent1]` }
      ].sort(sortByLabel));
    });
    test("complete infer attribute value", async () => {
      const content = [
        "---",
        'description: "Test"',
        "infer: |",
        "---"
      ].join("\n");
      const actual = await getCompletions(content, PromptsType.agent);
      assert.deepStrictEqual(actual.sort(sortByLabel), [
        { label: "false", result: "infer: false" },
        { label: "true", result: "infer: true" }
      ].sort(sortByLabel));
    });
    test("complete user-invocable attribute value", async () => {
      const content = [
        "---",
        'description: "Test"',
        "user-invocable: |",
        "---"
      ].join("\n");
      const actual = await getCompletions(content, PromptsType.agent);
      assert.deepStrictEqual(actual.sort(sortByLabel), [
        { label: "false", result: "user-invocable: false" },
        { label: "true", result: "user-invocable: true" }
      ].sort(sortByLabel));
    });
    test("complete disable-model-invocation attribute value", async () => {
      const content = [
        "---",
        'description: "Test"',
        "disable-model-invocation: |",
        "---"
      ].join("\n");
      const actual = await getCompletions(content, PromptsType.agent);
      assert.deepStrictEqual(actual.sort(sortByLabel), [
        { label: "false", result: "disable-model-invocation: false" },
        { label: "true", result: "disable-model-invocation: true" }
      ].sort(sortByLabel));
    });
    test("exclude models with targetChatSessionType from agent model completions", async () => {
      const content = [
        "---",
        'description: "Test"',
        "model: |",
        "---"
      ].join("\n");
      const actual = await getCompletions(content, PromptsType.agent);
      const labels = actual.map((a) => a.label);
      assert.ok(!labels.includes("BG Agent Model (copilot)"), "Models with targetChatSessionType should be excluded from agent model completions");
    });
    test("exclude models with targetChatSessionType from agent model array completions", async () => {
      const content = [
        "---",
        'description: "Test"',
        "model: [|]",
        "---"
      ].join("\n");
      const actual = await getCompletions(content, PromptsType.agent);
      const labels = actual.map((a) => a.label);
      assert.ok(!labels.includes("BG Agent Model (copilot)"), "Models with targetChatSessionType should be excluded from agent model array completions");
    });
    test("complete hooks value with New Hook snippet", async () => {
      const content = [
        "---",
        'description: "Test"',
        "hooks: |",
        "---"
      ].join("\n");
      const actual = await getCompletions(content, PromptsType.agent);
      assert.deepStrictEqual(actual, [
        {
          label: "New Hook",
          result: 'hooks: \n  ${1|SessionStart,SessionEnd,UserPromptSubmit,PreToolUse,PostToolUse,PreCompact,SubagentStart,SubagentStop,Stop,ErrorOccurred|}:\n    - type: command\n      command: "$2"'
        }
      ]);
    });
    test("complete hooks value with New Hook snippet for vscode target", async () => {
      const content = [
        "---",
        'description: "Test"',
        "target: vscode",
        "hooks: |",
        "---"
      ].join("\n");
      const actual = await getCompletions(content, PromptsType.agent);
      assert.deepStrictEqual(actual, [
        {
          label: "New Hook",
          result: 'hooks: \n  ${1|SessionStart,UserPromptSubmit,PreToolUse,PostToolUse,PreCompact,SubagentStart,SubagentStop,Stop|}:\n    - type: command\n      command: "$2"'
        }
      ]);
    });
    test("complete hook event names inside hooks map", async () => {
      const content = [
        "---",
        'description: "Test"',
        "hooks:",
        "  SessionStart:",
        "    - type: command",
        '      command: "echo hi"',
        "  |",
        "---"
      ].join("\n");
      const actual = await getCompletions(content, PromptsType.agent);
      const labels = actual.map((a) => a.label).sort();
      assert.ok(!labels.includes("SessionStart"), "SessionStart should not be suggested when already present");
      assert.ok(labels.includes("SessionEnd"), "SessionEnd should be suggested");
      assert.ok(labels.includes("PreToolUse"), "PreToolUse should be suggested");
      assert.ok(labels.includes("Stop"), "Stop should be suggested");
    });
    test("complete hook event names for vscode target excludes existing hooks", async () => {
      const content = [
        "---",
        'description: "Test"',
        "target: vscode",
        "hooks:",
        "  SessionStart:",
        "    - type: command",
        '      command: "echo hi"',
        "  PreToolUse:",
        "    - type: command",
        '      command: "lint"',
        "  |",
        "---"
      ].join("\n");
      const actual = await getCompletions(content, PromptsType.agent);
      const labels = actual.map((a) => a.label).sort();
      assert.ok(!labels.includes("SessionStart"), "SessionStart should not be suggested when already present");
      assert.ok(!labels.includes("PreToolUse"), "PreToolUse should not be suggested when already present");
      assert.ok(labels.includes("UserPromptSubmit"), "UserPromptSubmit should be suggested");
      assert.ok(labels.includes("PostToolUse"), "PostToolUse should be suggested");
      assert.ok(!labels.includes("SessionEnd"), "SessionEnd should not be available for vscode target");
    });
    test("complete hook event names on empty line before existing hooks", async () => {
      const content = [
        "---",
        'description: "Test"',
        "hooks:",
        "  |",
        "  SessionStart:",
        "    - type: command",
        '      command: "echo hi"',
        "---"
      ].join("\n");
      const actual = await getCompletions(content, PromptsType.agent);
      const labels = actual.map((a) => a.label).sort();
      assert.ok(!labels.includes("SessionStart"), "SessionStart should not be suggested when already present");
      assert.ok(labels.includes("SessionEnd"), "SessionEnd should be suggested");
      assert.ok(labels.includes("PreToolUse"), "PreToolUse should be suggested");
    });
    test("complete hook event names while editing existing key name", async () => {
      const content = [
        "---",
        'description: "Test"',
        "hooks:",
        "  S|:",
        "    - type: command",
        '      command: "echo hi"',
        "---"
      ].join("\n");
      const actual = await getCompletions(content, PromptsType.agent);
      const labels = actual.map((a) => a.label).sort();
      assert.ok(labels.includes("SessionStart"), "SessionStart should be suggested");
      assert.ok(labels.includes("SubagentStart"), "SubagentStart should be suggested");
      assert.ok(labels.includes("Stop"), "Stop should be suggested");
      const sessionStartItem = actual.find((a) => a.label === "SessionStart");
      assert.ok(sessionStartItem);
      assert.strictEqual(sessionStartItem.result, "  SessionStart:");
    });
    test("hooks: cursor right after colon triggers New Hook snippet", async () => {
      const content = [
        "---",
        'description: "Test"',
        "hooks: |",
        "---"
      ].join("\n");
      const actual = await getCompletions(content, PromptsType.agent);
      const labels = actual.map((a) => a.label);
      assert.ok(labels.includes("New Hook"), "New Hook snippet should be suggested");
    });
    test("hooks: typing event name on next line triggers hook events", async () => {
      const content = [
        "---",
        'description: "Test"',
        "hooks:",
        "  S|",
        "---"
      ].join("\n");
      const actual = await getCompletions(content, PromptsType.agent);
      const labels = actual.map((a) => a.label);
      assert.ok(labels.includes("SessionStart"), "SessionStart should be suggested");
      assert.ok(labels.includes("SessionEnd"), "SessionEnd should be suggested");
      assert.ok(labels.includes("Stop"), "Stop should be suggested");
    });
    test("typing field name in first command entry triggers command fields", async () => {
      const content = [
        "---",
        'description: "Test"',
        "hooks:",
        "  SessionEnd:",
        "    - t|",
        "---"
      ].join("\n");
      const actual = await getCompletions(content, PromptsType.agent);
      const labels = actual.map((a) => a.label);
      assert.ok(labels.includes("type"), "type should be suggested");
      assert.ok(labels.includes("command"), "command should be suggested");
      assert.ok(labels.includes("timeout"), "timeout should be suggested");
    });
    test("typing field name after existing field triggers remaining command fields", async () => {
      const content = [
        "---",
        'description: "Test"',
        "hooks:",
        "  SessionEnd:",
        "    - type: command",
        "      c|",
        "---"
      ].join("\n");
      const actual = await getCompletions(content, PromptsType.agent);
      const labels = actual.map((a) => a.label);
      assert.ok(labels.includes("command"), "command should be suggested");
      assert.ok(labels.includes("cwd"), "cwd should be suggested");
      assert.ok(!labels.includes("type"), "type should not be suggested when already present");
    });
    test("typing event name after existing hook triggers hook events", async () => {
      const content = [
        "---",
        'description: "Test"',
        "hooks:",
        "  SessionEnd:",
        "    - type: command",
        '      command: echo "Session ended."',
        "  U|",
        "---"
      ].join("\n");
      const actual = await getCompletions(content, PromptsType.agent);
      const labels = actual.map((a) => a.label);
      assert.ok(labels.includes("UserPromptSubmit"), "UserPromptSubmit should be suggested");
      assert.ok(!labels.includes("SessionEnd"), "SessionEnd should not be suggested when already present");
    });
    test("typing event name between existing hooks triggers hook events", async () => {
      const content = [
        "---",
        'description: "Test"',
        "hooks:",
        "  SessionEnd:",
        "    - type: command",
        '      command: echo "Session ended."',
        "  S|",
        "  UserPromptSubmit:",
        "    - type: command",
        '      command: echo "User submitted."',
        "---"
      ].join("\n");
      const actual = await getCompletions(content, PromptsType.agent);
      const labels = actual.map((a) => a.label);
      assert.ok(labels.includes("SessionStart"), "SessionStart should be suggested");
      assert.ok(labels.includes("Stop"), "Stop should be suggested");
      assert.ok(!labels.includes("SessionEnd"), "SessionEnd should not be suggested when already present");
      assert.ok(!labels.includes("UserPromptSubmit"), "UserPromptSubmit should not be suggested when already present");
    });
    test("cursor after hook event colon triggers New Command snippet", async () => {
      const content = [
        "---",
        'description: "Test"',
        "hooks:",
        "  SessionEnd: |",
        "---"
      ].join("\n");
      const actual = await getCompletions(content, PromptsType.agent);
      const labels = actual.map((a) => a.label);
      assert.ok(labels.includes("New Command"), "New Command snippet should be suggested");
      assert.strictEqual(actual.length, 1, "Only one suggestion should be returned");
    });
  });
  suite("claude agent header completions", () => {
    const claudeAgentUri = URI.parse("test:///.claude/agents/security-reviewer.agent.md");
    test("complete attribute names", async () => {
      const content = [
        "---",
        "name: security-reviewer",
        "description: Reviews code for security vulnerabilities",
        "|",
        "---",
        "You are a senior security engineer."
      ].join("\n");
      const actual = await getCompletions(content, PromptsType.agent, claudeAgentUri);
      assert.deepStrictEqual(actual.sort(sortByLabel), [
        { label: "disallowedTools", result: "disallowedTools: ${0:Write, Edit, Bash}" },
        { label: "hooks", result: "hooks: $0" },
        { label: "mcpServers", result: "mcpServers: $0" },
        { label: "memory", result: "memory: ${0:user}" },
        { label: "model", result: "model: ${0:sonnet}" },
        { label: "permissionMode", result: "permissionMode: ${0:default}" },
        { label: "skills", result: "skills: $0" },
        { label: "tools", result: "tools: ${0:Read, Edit, Bash}" }
      ].sort(sortByLabel));
    });
    test("complete attribute names excludes already present ones", async () => {
      const content = [
        "---",
        "name: security-reviewer",
        "description: Reviews code for security vulnerabilities",
        "tools: Edit",
        "|",
        "---",
        "You are a senior security engineer."
      ].join("\n");
      const actual = await getCompletions(content, PromptsType.agent, claudeAgentUri);
      const labels = actual.map((a) => a.label).sort();
      assert.ok(!labels.includes("tools"), "tools should not be suggested when already present");
      assert.ok(!labels.includes("name"), "name should not be suggested when already present");
      assert.ok(!labels.includes("description"), "description should not be suggested when already present");
    });
    test("complete model attribute value with claude enum values", async () => {
      const content = [
        "---",
        "name: security-reviewer",
        "description: Reviews code for security vulnerabilities",
        "model: |",
        "---"
      ].join("\n");
      const actual = await getCompletions(content, PromptsType.agent, claudeAgentUri);
      assert.deepStrictEqual(actual.sort(sortByLabel), [
        { label: "haiku", result: "model: haiku" },
        { label: "inherit", result: "model: inherit" },
        { label: "opus", result: "model: opus" },
        { label: "sonnet", result: "model: sonnet" }
      ].sort(sortByLabel));
    });
    test("complete tools with comma-separated values", async () => {
      const content = [
        "---",
        "name: security-reviewer",
        "description: Reviews code for security vulnerabilities",
        "tools: Edit, |",
        "---"
      ].join("\n");
      const actual = await getCompletions(content, PromptsType.agent, claudeAgentUri);
      const labels = actual.map((a) => a.label).sort();
      assert.deepStrictEqual(labels, [
        "AskUserQuestion",
        "Bash",
        "Glob",
        "Grep",
        "LSP",
        "MCPSearch",
        "NotebookEdit",
        "Read",
        "Skill",
        "Task",
        "WebFetch",
        "WebSearch",
        "Write"
      ].sort());
    });
    test("complete tools inside array syntax", async () => {
      const content = [
        "---",
        "name: security-reviewer",
        "description: Reviews code for security vulnerabilities",
        "tools: [|]",
        "---"
      ].join("\n");
      const actual = await getCompletions(content, PromptsType.agent, claudeAgentUri);
      const labels = actual.map((a) => a.label).sort();
      assert.deepStrictEqual(labels, [
        "AskUserQuestion",
        "Bash",
        "Edit",
        "Glob",
        "Grep",
        "LSP",
        "MCPSearch",
        "NotebookEdit",
        "Read",
        "Skill",
        "Task",
        "WebFetch",
        "WebSearch",
        "Write"
      ].sort());
      assert.deepStrictEqual(actual.find((a) => a.label === "Edit")?.result, `tools: [Edit]`);
    });
    test("complete tools inside array with existing entries", async () => {
      const content = [
        "---",
        "name: security-reviewer",
        "description: Reviews code for security vulnerabilities",
        `tools: [Edit, |]`,
        "---"
      ].join("\n");
      const actual = await getCompletions(content, PromptsType.agent, claudeAgentUri);
      assert.deepStrictEqual(actual.find((a) => a.label === "Read")?.result, `tools: [Edit, Read]`);
      assert.deepStrictEqual(actual.find((a) => a.label === "Bash")?.result, `tools: [Edit, Bash]`);
    });
    test("complete disallowedTools with comma-separated values", async () => {
      const content = [
        "---",
        "name: security-reviewer",
        "description: Reviews code for security vulnerabilities",
        "disallowedTools: |",
        "---"
      ].join("\n");
      const actual = await getCompletions(content, PromptsType.agent, claudeAgentUri);
      const labels = actual.map((a) => a.label).sort();
      assert.deepStrictEqual(labels, [
        "AskUserQuestion",
        "Bash",
        "Edit",
        "Glob",
        "Grep",
        "LSP",
        "MCPSearch",
        "NotebookEdit",
        "Read",
        "Skill",
        "Task",
        "WebFetch",
        "WebSearch",
        "Write"
      ].sort());
    });
    test("complete disallowedTools inside array syntax", async () => {
      const content = [
        "---",
        "name: security-reviewer",
        "description: Reviews code for security vulnerabilities",
        "disallowedTools: [Bash, |]",
        "---"
      ].join("\n");
      const actual = await getCompletions(content, PromptsType.agent, claudeAgentUri);
      assert.deepStrictEqual(actual.find((a) => a.label === "Write")?.result, `disallowedTools: [Bash, Write]`);
      assert.deepStrictEqual(actual.find((a) => a.label === "Edit")?.result, `disallowedTools: [Bash, Edit]`);
    });
  });
  suite("prompt header completions", () => {
    test("complete model attribute name", async () => {
      const content = [
        "---",
        'description: "Test"',
        "|",
        "---"
      ].join("\n");
      const actual = await getCompletions(content, PromptsType.prompt);
      assert.deepStrictEqual(actual.sort(sortByLabel), [
        { label: "agent", result: "agent: ${0:ask}" },
        { label: "argument-hint", result: "argument-hint: $0" },
        { label: "model", result: "model: ${0:MAE 4 (olama)}" },
        { label: "name", result: "name: $0" },
        { label: "tools", result: "tools: ${0:[]}" }
      ].sort(sortByLabel));
    });
    test("complete model attribute value in prompt", async () => {
      const content = [
        "---",
        'description: "Test"',
        "model: |",
        "---"
      ].join("\n");
      const actual = await getCompletions(content, PromptsType.prompt);
      assert.deepStrictEqual(actual.sort(sortByLabel), [
        { label: "MAE 4 (olama)", result: "model: MAE 4 (olama)" },
        { label: "MAE 4.1 (copilot)", result: "model: MAE 4.1 (copilot)" },
        { label: "GPT 4 (openai)", result: "model: GPT 4 (openai)" }
      ].sort(sortByLabel));
    });
    test("exclude models with targetChatSessionType from prompt model completions", async () => {
      const content = [
        "---",
        'description: "Test"',
        "model: |",
        "---"
      ].join("\n");
      const actual = await getCompletions(content, PromptsType.prompt);
      const labels = actual.map((a) => a.label);
      assert.ok(!labels.includes("BG Agent Model (copilot)"), "Models with targetChatSessionType should be excluded from prompt model completions");
    });
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXGNoYXRcXHRlc3RcXGJyb3dzZXJcXHByb21wdFN5bnRheFxcbGFuZ3VhZ2VQcm92aWRlcnNcXHByb21wdEhlYWRlckF1dG9jb21wbGV0aW9uLnRlc3QudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgYXNzZXJ0IGZyb20gJ2Fzc2VydCc7XG5pbXBvcnQgeyBDYW5jZWxsYXRpb25Ub2tlbiB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2NhbmNlbGxhdGlvbi5qcyc7XG5pbXBvcnQgeyBlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi8uLi9iYXNlL3Rlc3QvY29tbW9uL3V0aWxzLmpzJztcbmltcG9ydCB7IFBvc2l0aW9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9jb3JlL3Bvc2l0aW9uLmpzJztcbmltcG9ydCB7IENvbXBsZXRpb25Db250ZXh0LCBDb21wbGV0aW9uVHJpZ2dlcktpbmQgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL2xhbmd1YWdlcy5qcyc7XG5pbXBvcnQgeyBDb250ZXh0S2V5U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbnRleHRrZXkvYnJvd3Nlci9jb250ZXh0S2V5U2VydmljZS5qcyc7XG5pbXBvcnQgeyBUZXN0Q29uZmlndXJhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb25maWd1cmF0aW9uL3Rlc3QvY29tbW9uL3Rlc3RDb25maWd1cmF0aW9uU2VydmljZS5qcyc7XG5pbXBvcnQgeyBFeHRlbnNpb25JZGVudGlmaWVyIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vZXh0ZW5zaW9ucy9jb21tb24vZXh0ZW5zaW9ucy5qcyc7XG5pbXBvcnQgeyBUZXN0SW5zdGFudGlhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9pbnN0YW50aWF0aW9uL3Rlc3QvY29tbW9uL2luc3RhbnRpYXRpb25TZXJ2aWNlTW9jay5qcyc7XG5pbXBvcnQgeyB3b3JrYmVuY2hJbnN0YW50aWF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3Rlc3QvYnJvd3Nlci93b3JrYmVuY2hUZXN0U2VydmljZXMuanMnO1xuaW1wb3J0IHsgTGFuZ3VhZ2VNb2RlbFRvb2xzU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jyb3dzZXIvdG9vbHMvbGFuZ3VhZ2VNb2RlbFRvb2xzU2VydmljZS5qcyc7XG5pbXBvcnQgeyBDaGF0QWdlbnRMb2NhdGlvbiwgQ2hhdENvbmZpZ3VyYXRpb24gfSBmcm9tICcuLi8uLi8uLi8uLi9jb21tb24vY29uc3RhbnRzLmpzJztcbmltcG9ydCB7IElMYW5ndWFnZU1vZGVsVG9vbHNTZXJ2aWNlLCBJVG9vbERhdGEsIFRvb2xEYXRhU291cmNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vY29tbW9uL3Rvb2xzL2xhbmd1YWdlTW9kZWxUb29sc1NlcnZpY2UuanMnO1xuaW1wb3J0IHsgSUxhbmd1YWdlTW9kZWxDaGF0TWV0YWRhdGEsIElMYW5ndWFnZU1vZGVsc1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9jb21tb24vbGFuZ3VhZ2VNb2RlbHMuanMnO1xuaW1wb3J0IHsgSUNoYXRNb2RlU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL2NvbW1vbi9jaGF0TW9kZXMuanMnO1xuaW1wb3J0IHsgUHJvbXB0SGVhZGVyQXV0b2NvbXBsZXRpb24gfSBmcm9tICcuLi8uLi8uLi8uLi9jb21tb24vcHJvbXB0U3ludGF4L2xhbmd1YWdlUHJvdmlkZXJzL3Byb21wdEhlYWRlckF1dG9jb21wbGV0aW9uLmpzJztcbmltcG9ydCB7IElDdXN0b21BZ2VudCwgSVByb21wdHNTZXJ2aWNlLCBQcm9tcHRzU3RvcmFnZSB9IGZyb20gJy4uLy4uLy4uLy4uL2NvbW1vbi9wcm9tcHRTeW50YXgvc2VydmljZS9wcm9tcHRzU2VydmljZS5qcyc7XG5pbXBvcnQgeyBnZXRMYW5ndWFnZUlkRm9yUHJvbXB0c1R5cGUsIFByb21wdHNUeXBlLCBUYXJnZXQgfSBmcm9tICcuLi8uLi8uLi8uLi9jb21tb24vcHJvbXB0U3ludGF4L3Byb21wdFR5cGVzLmpzJztcbmltcG9ydCB7IGNyZWF0ZVRleHRNb2RlbCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uLy4uL2VkaXRvci90ZXN0L2NvbW1vbi90ZXN0VGV4dE1vZGVsLmpzJztcbmltcG9ydCB7IFVSSSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3VyaS5qcyc7XG5pbXBvcnQgeyBQcm9tcHRGaWxlUGFyc2VyIH0gZnJvbSAnLi4vLi4vLi4vLi4vY29tbW9uL3Byb21wdFN5bnRheC9wcm9tcHRGaWxlUGFyc2VyLmpzJztcbmltcG9ydCB7IElUZXh0TW9kZWwgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL21vZGVsLmpzJztcbmltcG9ydCB7IGdldFByb21wdEZpbGVFeHRlbnNpb24gfSBmcm9tICcuLi8uLi8uLi8uLi9jb21tb24vcHJvbXB0U3ludGF4L2NvbmZpZy9wcm9tcHRGaWxlTG9jYXRpb25zLmpzJztcbmltcG9ydCB7IFJhbmdlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9jb3JlL3JhbmdlLmpzJztcbmltcG9ydCB7IE1vY2tDaGF0TW9kZVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vbW9ja0NoYXRNb2RlU2VydmljZS5qcyc7XG5cbnN1aXRlKCdQcm9tcHRIZWFkZXJBdXRvY29tcGxldGlvbicsICgpID0+IHtcblx0Y29uc3QgZGlzcG9zYWJsZXMgPSBlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUoKTtcblxuXHRsZXQgaW5zdGFTZXJ2aWNlOiBUZXN0SW5zdGFudGlhdGlvblNlcnZpY2U7XG5cdGxldCBjb21wbGV0aW9uUHJvdmlkZXI6IFByb21wdEhlYWRlckF1dG9jb21wbGV0aW9uO1xuXG5cdHNldHVwKGFzeW5jICgpID0+IHtcblx0XHRjb25zdCB0ZXN0Q29uZmlnU2VydmljZSA9IG5ldyBUZXN0Q29uZmlndXJhdGlvblNlcnZpY2UoKTtcblx0XHR0ZXN0Q29uZmlnU2VydmljZS5zZXRVc2VyQ29uZmlndXJhdGlvbihDaGF0Q29uZmlndXJhdGlvbi5FeHRlbnNpb25Ub29sc0VuYWJsZWQsIHRydWUpO1xuXHRcdGluc3RhU2VydmljZSA9IHdvcmtiZW5jaEluc3RhbnRpYXRpb25TZXJ2aWNlKHtcblx0XHRcdGNvbnRleHRLZXlTZXJ2aWNlOiAoKSA9PiBkaXNwb3NhYmxlcy5hZGQobmV3IENvbnRleHRLZXlTZXJ2aWNlKHRlc3RDb25maWdTZXJ2aWNlKSksXG5cdFx0XHRjb25maWd1cmF0aW9uU2VydmljZTogKCkgPT4gdGVzdENvbmZpZ1NlcnZpY2Vcblx0XHR9LCBkaXNwb3NhYmxlcyk7XG5cblx0XHRjb25zdCB0b29sU2VydmljZSA9IGRpc3Bvc2FibGVzLmFkZChpbnN0YVNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoTGFuZ3VhZ2VNb2RlbFRvb2xzU2VydmljZSkpO1xuXG5cdFx0Y29uc3QgdGVzdFRvb2wxID0geyBpZDogJ3Rlc3RUb29sMScsIGRpc3BsYXlOYW1lOiAndG9vbDEnLCBjYW5CZVJlZmVyZW5jZWRJblByb21wdDogdHJ1ZSwgbW9kZWxEZXNjcmlwdGlvbjogJ1Rlc3QgVG9vbCAxJywgc291cmNlOiBUb29sRGF0YVNvdXJjZS5FeHRlcm5hbCwgaW5wdXRTY2hlbWE6IHt9IH0gc2F0aXNmaWVzIElUb29sRGF0YTtcblx0XHRkaXNwb3NhYmxlcy5hZGQodG9vbFNlcnZpY2UucmVnaXN0ZXJUb29sRGF0YSh0ZXN0VG9vbDEpKTtcblxuXHRcdGNvbnN0IHRlc3RUb29sMiA9IHsgaWQ6ICd0ZXN0VG9vbDInLCBkaXNwbGF5TmFtZTogJ3Rvb2wyJywgY2FuQmVSZWZlcmVuY2VkSW5Qcm9tcHQ6IHRydWUsIHRvb2xSZWZlcmVuY2VOYW1lOiAndG9vbDInLCBtb2RlbERlc2NyaXB0aW9uOiAnVGVzdCBUb29sIDInLCBzb3VyY2U6IFRvb2xEYXRhU291cmNlLkV4dGVybmFsLCBpbnB1dFNjaGVtYToge30gfSBzYXRpc2ZpZXMgSVRvb2xEYXRhO1xuXHRcdGRpc3Bvc2FibGVzLmFkZCh0b29sU2VydmljZS5yZWdpc3RlclRvb2xEYXRhKHRlc3RUb29sMikpO1xuXG5cdFx0aW5zdGFTZXJ2aWNlLnNldChJTGFuZ3VhZ2VNb2RlbFRvb2xzU2VydmljZSwgdG9vbFNlcnZpY2UpO1xuXG5cdFx0Y29uc3QgdGVzdE1vZGVsczogSUxhbmd1YWdlTW9kZWxDaGF0TWV0YWRhdGFbXSA9IFtcblx0XHRcdHsgaWQ6ICdtYWUtNCcsIG5hbWU6ICdNQUUgNCcsIHZlbmRvcjogJ29sYW1hJywgdmVyc2lvbjogJzEuMCcsIGZhbWlseTogJ21hZScsIGV4dGVuc2lvbjogbmV3IEV4dGVuc2lvbklkZW50aWZpZXIoJ2EuYicpLCBpc1VzZXJTZWxlY3RhYmxlOiB0cnVlLCBtYXhJbnB1dFRva2VuczogODE5MiwgbWF4T3V0cHV0VG9rZW5zOiAxMDI0LCBjYXBhYmlsaXRpZXM6IHsgYWdlbnRNb2RlOiB0cnVlLCB0b29sQ2FsbGluZzogdHJ1ZSB9LCBpc0RlZmF1bHRGb3JMb2NhdGlvbjogeyBbQ2hhdEFnZW50TG9jYXRpb24uQ2hhdF06IHRydWUgfSB9IHNhdGlzZmllcyBJTGFuZ3VhZ2VNb2RlbENoYXRNZXRhZGF0YSxcblx0XHRcdHsgaWQ6ICdtYWUtNC4xJywgbmFtZTogJ01BRSA0LjEnLCB2ZW5kb3I6ICdjb3BpbG90JywgdmVyc2lvbjogJzEuMCcsIGZhbWlseTogJ21hZScsIGV4dGVuc2lvbjogbmV3IEV4dGVuc2lvbklkZW50aWZpZXIoJ2EuYicpLCBpc1VzZXJTZWxlY3RhYmxlOiB0cnVlLCBtYXhJbnB1dFRva2VuczogODE5MiwgbWF4T3V0cHV0VG9rZW5zOiAxMDI0LCBjYXBhYmlsaXRpZXM6IHsgYWdlbnRNb2RlOiB0cnVlLCB0b29sQ2FsbGluZzogdHJ1ZSB9LCBpc0RlZmF1bHRGb3JMb2NhdGlvbjogeyBbQ2hhdEFnZW50TG9jYXRpb24uQ2hhdF06IHRydWUgfSB9IHNhdGlzZmllcyBJTGFuZ3VhZ2VNb2RlbENoYXRNZXRhZGF0YSxcblx0XHRcdHsgaWQ6ICdncHQtNCcsIG5hbWU6ICdHUFQgNCcsIHZlbmRvcjogJ29wZW5haScsIHZlcnNpb246ICcxLjAnLCBmYW1pbHk6ICdncHQnLCBleHRlbnNpb246IG5ldyBFeHRlbnNpb25JZGVudGlmaWVyKCdhLmInKSwgaXNVc2VyU2VsZWN0YWJsZTogdHJ1ZSwgbWF4SW5wdXRUb2tlbnM6IDgxOTIsIG1heE91dHB1dFRva2VuczogMTAyNCwgY2FwYWJpbGl0aWVzOiB7IGFnZW50TW9kZTogZmFsc2UsIHRvb2xDYWxsaW5nOiB0cnVlIH0sIGlzRGVmYXVsdEZvckxvY2F0aW9uOiB7IFtDaGF0QWdlbnRMb2NhdGlvbi5DaGF0XTogdHJ1ZSB9IH0gc2F0aXNmaWVzIElMYW5ndWFnZU1vZGVsQ2hhdE1ldGFkYXRhLFxuXHRcdFx0eyBpZDogJ2JnLWFnZW50LW1vZGVsJywgbmFtZTogJ0JHIEFnZW50IE1vZGVsJywgdmVuZG9yOiAnY29waWxvdCcsIHZlcnNpb246ICcxLjAnLCBmYW1pbHk6ICdiZycsIGV4dGVuc2lvbjogbmV3IEV4dGVuc2lvbklkZW50aWZpZXIoJ2EuYicpLCBpc1VzZXJTZWxlY3RhYmxlOiB0cnVlLCBtYXhJbnB1dFRva2VuczogODE5MiwgbWF4T3V0cHV0VG9rZW5zOiAxMDI0LCBjYXBhYmlsaXRpZXM6IHsgYWdlbnRNb2RlOiB0cnVlLCB0b29sQ2FsbGluZzogdHJ1ZSB9LCBpc0RlZmF1bHRGb3JMb2NhdGlvbjogeyBbQ2hhdEFnZW50TG9jYXRpb24uQ2hhdF06IHRydWUgfSwgdGFyZ2V0Q2hhdFNlc3Npb25UeXBlOiAnYmFja2dyb3VuZCcgfSBzYXRpc2ZpZXMgSUxhbmd1YWdlTW9kZWxDaGF0TWV0YWRhdGEsXG5cdFx0XTtcblxuXHRcdGluc3RhU2VydmljZS5zdHViKElMYW5ndWFnZU1vZGVsc1NlcnZpY2UsIHtcblx0XHRcdGdldExhbmd1YWdlTW9kZWxJZHMoKSB7IHJldHVybiB0ZXN0TW9kZWxzLm1hcChtID0+IG0uaWQpOyB9LFxuXHRcdFx0bG9va3VwTGFuZ3VhZ2VNb2RlbChuYW1lOiBzdHJpbmcpIHtcblx0XHRcdFx0cmV0dXJuIHRlc3RNb2RlbHMuZmluZChtID0+IG0uaWQgPT09IG5hbWUpO1xuXHRcdFx0fVxuXHRcdH0pO1xuXG5cdFx0Y29uc3QgY3VzdG9tQWdlbnQ6IElDdXN0b21BZ2VudCA9IHtcblx0XHRcdGlkOiAnYWdlbnQxJyxcblx0XHRcdG5hbWU6ICdhZ2VudDEnLFxuXHRcdFx0ZGVzY3JpcHRpb246ICdBZ2VudCBmaWxlIDEuJyxcblx0XHRcdGFnZW50SW5zdHJ1Y3Rpb25zOiB7XG5cdFx0XHRcdGNvbnRlbnQ6ICcnLFxuXHRcdFx0XHR0b29sUmVmZXJlbmNlczogW10sXG5cdFx0XHRcdG1ldGFkYXRhOiB1bmRlZmluZWRcblx0XHRcdH0sXG5cdFx0XHR1cmk6IFVSSS5wYXJzZSgnbXlGczovLy5naXRodWIvYWdlbnRzL2FnZW50MS5hZ2VudC5tZCcpLFxuXHRcdFx0c291cmNlOiB7IHN0b3JhZ2U6IFByb21wdHNTdG9yYWdlLmxvY2FsIH0sXG5cdFx0XHR0YXJnZXQ6IFRhcmdldC5VbmRlZmluZWQsXG5cdFx0XHR2aXNpYmlsaXR5OiB7IHVzZXJJbnZvY2FibGU6IHRydWUsIGFnZW50SW52b2NhYmxlOiB0cnVlIH0sXG5cdFx0XHRlbmFibGVkOiB0cnVlLFxuXHRcdH07XG5cblx0XHRjb25zdCBwYXJzZXIgPSBuZXcgUHJvbXB0RmlsZVBhcnNlcigpO1xuXHRcdGluc3RhU2VydmljZS5zdHViKElQcm9tcHRzU2VydmljZSwge1xuXHRcdFx0Z2V0UGFyc2VkUHJvbXB0RmlsZShtb2RlbDogSVRleHRNb2RlbCkge1xuXHRcdFx0XHRyZXR1cm4gcGFyc2VyLnBhcnNlKG1vZGVsLnVyaSwgbW9kZWwuZ2V0VmFsdWUoKSk7XG5cdFx0XHR9LFxuXHRcdFx0YXN5bmMgZ2V0Q3VzdG9tQWdlbnRzKHRva2VuOiBDYW5jZWxsYXRpb25Ub2tlbikge1xuXHRcdFx0XHRyZXR1cm4gUHJvbWlzZS5yZXNvbHZlKFtjdXN0b21BZ2VudF0pO1xuXHRcdFx0fVxuXHRcdH0pO1xuXG5cdFx0aW5zdGFTZXJ2aWNlLnN0dWIoSUNoYXRNb2RlU2VydmljZSwgbmV3IE1vY2tDaGF0TW9kZVNlcnZpY2UoKSk7XG5cblx0XHRjb21wbGV0aW9uUHJvdmlkZXIgPSBpbnN0YVNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoUHJvbXB0SGVhZGVyQXV0b2NvbXBsZXRpb24pO1xuXHR9KTtcblxuXHRhc3luYyBmdW5jdGlvbiBnZXRDb21wbGV0aW9ucyhjb250ZW50OiBzdHJpbmcsIHByb21wdFR5cGU6IFByb21wdHNUeXBlLCB1cmk/OiBVUkkpIHtcblx0XHRjb25zdCBsYW5ndWFnZUlkID0gZ2V0TGFuZ3VhZ2VJZEZvclByb21wdHNUeXBlKHByb21wdFR5cGUpO1xuXHRcdHVyaSA/Pz0gVVJJLnBhcnNlKCd0ZXN0Oi8vL3Rlc3QnICsgZ2V0UHJvbXB0RmlsZUV4dGVuc2lvbihwcm9tcHRUeXBlKSk7XG5cdFx0Y29uc3QgbW9kZWwgPSBkaXNwb3NhYmxlcy5hZGQoY3JlYXRlVGV4dE1vZGVsKGNvbnRlbnQsIGxhbmd1YWdlSWQsIHVuZGVmaW5lZCwgdXJpKSk7XG5cdFx0Ly8gZ2V0IHRoZSBjb21wbGV0aW9uIGxvY2F0aW9uIGZyb20gIHRoZSAnfCcgbWFya2VyXG5cdFx0Y29uc3QgbGluZUNvbHVtbk1hcmtlclJhbmdlID0gbW9kZWwuZmluZE5leHRNYXRjaCgnfCcsIG5ldyBQb3NpdGlvbigxLCAxKSwgZmFsc2UsIGZhbHNlLCAnJywgZmFsc2UpPy5yYW5nZTtcblx0XHRhc3NlcnQub2sobGluZUNvbHVtbk1hcmtlclJhbmdlLCAnTm8gY29tcGxldGlvbiBtYXJrZXIgZm91bmQgaW4gdGVzdCBjb250ZW50Jyk7XG5cdFx0bW9kZWwuYXBwbHlFZGl0cyhbeyByYW5nZTogbGluZUNvbHVtbk1hcmtlclJhbmdlLCB0ZXh0OiAnJyB9XSk7XG5cblx0XHRjb25zdCBwb3NpdGlvbiA9IGxpbmVDb2x1bW5NYXJrZXJSYW5nZS5nZXRTdGFydFBvc2l0aW9uKCk7XG5cdFx0Y29uc3QgY29udGV4dDogQ29tcGxldGlvbkNvbnRleHQgPSB7IHRyaWdnZXJLaW5kOiBDb21wbGV0aW9uVHJpZ2dlcktpbmQuSW52b2tlIH07XG5cdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgY29tcGxldGlvblByb3ZpZGVyLnByb3ZpZGVDb21wbGV0aW9uSXRlbXMobW9kZWwsIHBvc2l0aW9uLCBjb250ZXh0LCBDYW5jZWxsYXRpb25Ub2tlbi5Ob25lKTtcblx0XHRpZiAoIXJlc3VsdCB8fCAhcmVzdWx0LnN1Z2dlc3Rpb25zKSB7XG5cdFx0XHRyZXR1cm4gW107XG5cdFx0fVxuXHRcdGNvbnN0IGxpbmVDb250ZW50ID0gbW9kZWwuZ2V0TGluZUNvbnRlbnQocG9zaXRpb24ubGluZU51bWJlcik7XG5cdFx0cmV0dXJuIHJlc3VsdC5zdWdnZXN0aW9ucy5tYXAocyA9PiB7XG5cdFx0XHRhc3NlcnQocy5yYW5nZSBpbnN0YW5jZW9mIFJhbmdlKTtcblx0XHRcdHJldHVybiB7XG5cdFx0XHRcdGxhYmVsOiB0eXBlb2Ygcy5sYWJlbCA9PT0gJ3N0cmluZycgPyBzLmxhYmVsIDogcy5sYWJlbC5sYWJlbCxcblx0XHRcdFx0cmVzdWx0OiBsaW5lQ29udGVudC5zdWJzdHJpbmcoMCwgcy5yYW5nZS5zdGFydENvbHVtbiAtIDEpICsgcy5pbnNlcnRUZXh0ICsgbGluZUNvbnRlbnQuc3Vic3RyaW5nKHMucmFuZ2UuZW5kQ29sdW1uIC0gMSlcblx0XHRcdH07XG5cdFx0fSk7XG5cdH1cblxuXHRjb25zdCBzb3J0QnlMYWJlbCA9IChhOiB7IGxhYmVsOiBzdHJpbmcgfSwgYjogeyBsYWJlbDogc3RyaW5nIH0pID0+IGEubGFiZWwubG9jYWxlQ29tcGFyZShiLmxhYmVsKTtcblxuXHRzdWl0ZSgnYWdlbnQgaGVhZGVyIGNvbXBsZXRpb25zJywgKCkgPT4ge1xuXHRcdHRlc3QoJ2NvbXBsZXRlIG1vZGVsIGF0dHJpYnV0ZSBuYW1lJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgY29udGVudCA9IFtcblx0XHRcdFx0Jy0tLScsXG5cdFx0XHRcdCdkZXNjcmlwdGlvbjogXCJUZXN0XCInLFxuXHRcdFx0XHQnfCcsXG5cdFx0XHRcdCctLS0nLFxuXHRcdFx0XS5qb2luKCdcXG4nKTtcblxuXHRcdFx0Y29uc3QgYWN0dWFsID0gYXdhaXQgZ2V0Q29tcGxldGlvbnMoY29udGVudCwgUHJvbXB0c1R5cGUuYWdlbnQpO1xuXG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGFjdHVhbC5zb3J0KHNvcnRCeUxhYmVsKSwgW1xuXHRcdFx0XHR7IGxhYmVsOiAnYWdlbnRzJywgcmVzdWx0OiAnYWdlbnRzOiAkezA6W1wiKlwiXX0nIH0sXG5cdFx0XHRcdHsgbGFiZWw6ICdhcmd1bWVudC1oaW50JywgcmVzdWx0OiAnYXJndW1lbnQtaGludDogJDAnIH0sXG5cdFx0XHRcdHsgbGFiZWw6ICdkaXNhYmxlLW1vZGVsLWludm9jYXRpb24nLCByZXN1bHQ6ICdkaXNhYmxlLW1vZGVsLWludm9jYXRpb246ICR7MDp0cnVlfScgfSxcblx0XHRcdFx0eyBsYWJlbDogJ2dpdGh1YicsIHJlc3VsdDogJ2dpdGh1YjogJDAnIH0sXG5cdFx0XHRcdHsgbGFiZWw6ICdoYW5kb2ZmcycsIHJlc3VsdDogJ2hhbmRvZmZzOiAkMCcgfSxcblx0XHRcdFx0eyBsYWJlbDogJ2hvb2tzJywgcmVzdWx0OiAnaG9va3M6XFxuICAkezF8U2Vzc2lvblN0YXJ0LFNlc3Npb25FbmQsVXNlclByb21wdFN1Ym1pdCxQcmVUb29sVXNlLFBvc3RUb29sVXNlLFByZUNvbXBhY3QsU3ViYWdlbnRTdGFydCxTdWJhZ2VudFN0b3AsU3RvcCxFcnJvck9jY3VycmVkfH06XFxuICAgIC0gdHlwZTogY29tbWFuZFxcbiAgICAgIGNvbW1hbmQ6IFwiJDJcIicgfSxcblx0XHRcdFx0eyBsYWJlbDogJ21vZGVsJywgcmVzdWx0OiAnbW9kZWw6ICR7MDpNQUUgNCAob2xhbWEpfScgfSxcblx0XHRcdFx0eyBsYWJlbDogJ25hbWUnLCByZXN1bHQ6ICduYW1lOiAkMCcgfSxcblx0XHRcdFx0eyBsYWJlbDogJ3RhcmdldCcsIHJlc3VsdDogJ3RhcmdldDogJHswOnZzY29kZX0nIH0sXG5cdFx0XHRcdHsgbGFiZWw6ICd0b29scycsIHJlc3VsdDogJ3Rvb2xzOiAkezA6W119JyB9LFxuXHRcdFx0XHR7IGxhYmVsOiAndXNlci1pbnZvY2FibGUnLCByZXN1bHQ6ICd1c2VyLWludm9jYWJsZTogJHswOnRydWV9JyB9LFxuXHRcdFx0XS5zb3J0KHNvcnRCeUxhYmVsKSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdjb21wbGV0ZSBtb2RlbCBhdHRyaWJ1dGUgdmFsdWUnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCBjb250ZW50ID0gW1xuXHRcdFx0XHQnLS0tJyxcblx0XHRcdFx0J2Rlc2NyaXB0aW9uOiBcIlRlc3RcIicsXG5cdFx0XHRcdCdtb2RlbDogfCcsXG5cdFx0XHRcdCctLS0nLFxuXHRcdFx0XS5qb2luKCdcXG4nKTtcblxuXHRcdFx0Y29uc3QgYWN0dWFsID0gYXdhaXQgZ2V0Q29tcGxldGlvbnMoY29udGVudCwgUHJvbXB0c1R5cGUuYWdlbnQpO1xuXHRcdFx0Ly8gR1BUIDQgaXMgZXhjbHVkZWQgYmVjYXVzZSBpdCBoYXMgYWdlbnRNb2RlOiBmYWxzZVxuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChhY3R1YWwuc29ydChzb3J0QnlMYWJlbCksIFtcblx0XHRcdFx0eyBsYWJlbDogJ01BRSA0IChvbGFtYSknLCByZXN1bHQ6ICdtb2RlbDogTUFFIDQgKG9sYW1hKScgfSxcblx0XHRcdFx0eyBsYWJlbDogJ01BRSA0LjEgKGNvcGlsb3QpJywgcmVzdWx0OiAnbW9kZWw6IE1BRSA0LjEgKGNvcGlsb3QpJyB9LFxuXHRcdFx0XS5zb3J0KHNvcnRCeUxhYmVsKSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdjb21wbGV0ZSBtb2RlbCBhdHRyaWJ1dGUgdmFsdWUgd2l0aCBwYXJ0aWFsIGlucHV0JywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgY29udGVudCA9IFtcblx0XHRcdFx0Jy0tLScsXG5cdFx0XHRcdCdkZXNjcmlwdGlvbjogXCJUZXN0XCInLFxuXHRcdFx0XHQnbW9kZWw6IE1BfCcsXG5cdFx0XHRcdCctLS0nLFxuXHRcdFx0XS5qb2luKCdcXG4nKTtcblxuXHRcdFx0Y29uc3QgYWN0dWFsID0gYXdhaXQgZ2V0Q29tcGxldGlvbnMoY29udGVudCwgUHJvbXB0c1R5cGUuYWdlbnQpO1xuXHRcdFx0Ly8gR1BUIDQgaXMgZXhjbHVkZWQgYmVjYXVzZSBpdCBoYXMgYWdlbnRNb2RlOiBmYWxzZVxuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChhY3R1YWwsIFtcblx0XHRcdFx0eyBsYWJlbDogJ01BRSA0IChvbGFtYSknLCByZXN1bHQ6ICdtb2RlbDogTUFFIDQgKG9sYW1hKScgfSxcblx0XHRcdFx0eyBsYWJlbDogJ01BRSA0LjEgKGNvcGlsb3QpJywgcmVzdWx0OiAnbW9kZWw6IE1BRSA0LjEgKGNvcGlsb3QpJyB9LFxuXHRcdFx0XSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdjb21wbGV0ZSBtb2RlbCBuYW1lcyBpbnNpZGUgbW9kZWwgYXJyYXknLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCBjb250ZW50ID0gW1xuXHRcdFx0XHQnLS0tJyxcblx0XHRcdFx0J2Rlc2NyaXB0aW9uOiBcIlRlc3RcIicsXG5cdFx0XHRcdCdtb2RlbDogW3xdJyxcblx0XHRcdFx0Jy0tLScsXG5cdFx0XHRdLmpvaW4oJ1xcbicpO1xuXG5cdFx0XHRjb25zdCBhY3R1YWwgPSBhd2FpdCBnZXRDb21wbGV0aW9ucyhjb250ZW50LCBQcm9tcHRzVHlwZS5hZ2VudCk7XG5cdFx0XHQvLyBHUFQgNCBpcyBleGNsdWRlZCBiZWNhdXNlIGl0IGhhcyBhZ2VudE1vZGU6IGZhbHNlXG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGFjdHVhbC5zb3J0KHNvcnRCeUxhYmVsKSwgW1xuXHRcdFx0XHR7IGxhYmVsOiAnTUFFIDQgKG9sYW1hKScsIHJlc3VsdDogYG1vZGVsOiBbJ01BRSA0IChvbGFtYSknXWAgfSxcblx0XHRcdFx0eyBsYWJlbDogJ01BRSA0LjEgKGNvcGlsb3QpJywgcmVzdWx0OiBgbW9kZWw6IFsnTUFFIDQuMSAoY29waWxvdCknXWAgfSxcblx0XHRcdF0uc29ydChzb3J0QnlMYWJlbCkpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnY29tcGxldGUgbW9kZWwgbmFtZXMgaW5zaWRlIG1vZGVsIGFycmF5IHdpdGggZXhpc3RpbmcgZW50cmllcycsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IGNvbnRlbnQgPSBbXG5cdFx0XHRcdCctLS0nLFxuXHRcdFx0XHQnZGVzY3JpcHRpb246IFwiVGVzdFwiJyxcblx0XHRcdFx0YG1vZGVsOiBbJ01BRSA0IChvbGFtYSknLCB8XWAsXG5cdFx0XHRcdCctLS0nLFxuXHRcdFx0XS5qb2luKCdcXG4nKTtcblxuXHRcdFx0Y29uc3QgYWN0dWFsID0gYXdhaXQgZ2V0Q29tcGxldGlvbnMoY29udGVudCwgUHJvbXB0c1R5cGUuYWdlbnQpO1xuXHRcdFx0Ly8gR1BUIDQgaXMgZXhjbHVkZWQgYmVjYXVzZSBpdCBoYXMgYWdlbnRNb2RlOiBmYWxzZVxuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChhY3R1YWwuc29ydChzb3J0QnlMYWJlbCksIFtcblx0XHRcdFx0eyBsYWJlbDogJ01BRSA0LjEgKGNvcGlsb3QpJywgcmVzdWx0OiBgbW9kZWw6IFsnTUFFIDQgKG9sYW1hKScsICdNQUUgNC4xIChjb3BpbG90KSddYCB9LFxuXHRcdFx0XS5zb3J0KHNvcnRCeUxhYmVsKSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdjb21wbGV0ZSB0b29sIG5hbWVzIGluc2lkZSB0b29scyBhcnJheScsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IGNvbnRlbnQgPSBbXG5cdFx0XHRcdCctLS0nLFxuXHRcdFx0XHQnZGVzY3JpcHRpb246IFwiVGVzdFwiJyxcblx0XHRcdFx0J3Rvb2xzOiBbfF0nLFxuXHRcdFx0XHQnLS0tJyxcblx0XHRcdF0uam9pbignXFxuJyk7XG5cblx0XHRcdGNvbnN0IGFjdHVhbCA9IGF3YWl0IGdldENvbXBsZXRpb25zKGNvbnRlbnQsIFByb21wdHNUeXBlLmFnZW50KTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoYWN0dWFsLnNvcnQoc29ydEJ5TGFiZWwpLCBbXG5cdFx0XHRcdHsgbGFiZWw6ICdhZ2VudCcsIHJlc3VsdDogYHRvb2xzOiBbYWdlbnRdYCB9LFxuXHRcdFx0XHR7IGxhYmVsOiAnZXhlY3V0ZScsIHJlc3VsdDogYHRvb2xzOiBbZXhlY3V0ZV1gIH0sXG5cdFx0XHRcdHsgbGFiZWw6ICdyZWFkJywgcmVzdWx0OiBgdG9vbHM6IFtyZWFkXWAgfSxcblx0XHRcdFx0eyBsYWJlbDogJ3Rvb2wxJywgcmVzdWx0OiBgdG9vbHM6IFt0b29sMV1gIH0sXG5cdFx0XHRcdHsgbGFiZWw6ICd0b29sMicsIHJlc3VsdDogYHRvb2xzOiBbdG9vbDJdYCB9LFxuXHRcdFx0XHR7IGxhYmVsOiAndnNjb2RlJywgcmVzdWx0OiBgdG9vbHM6IFt2c2NvZGVdYCB9LFxuXHRcdFx0XS5zb3J0KHNvcnRCeUxhYmVsKSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdjb21wbGV0ZSB0b29sIG5hbWVzIGluc2lkZSB0b29scyBhcnJheSB3aXRoIGV4aXN0aW5nIHNpbmdsZSBxdW90ZWQgZW50cmllcycsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IGNvbnRlbnQgPSBbXG5cdFx0XHRcdCctLS0nLFxuXHRcdFx0XHQnZGVzY3JpcHRpb246IFwiVGVzdFwiJyxcblx0XHRcdFx0YHRvb2xzOiBbJ3JlYWQnLCB8XWAsXG5cdFx0XHRcdCctLS0nLFxuXHRcdFx0XS5qb2luKCdcXG4nKTtcblxuXHRcdFx0Y29uc3QgYWN0dWFsID0gYXdhaXQgZ2V0Q29tcGxldGlvbnMoY29udGVudCwgUHJvbXB0c1R5cGUuYWdlbnQpO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChhY3R1YWwuc29ydChzb3J0QnlMYWJlbCksIFtcblx0XHRcdFx0eyBsYWJlbDogJ2FnZW50JywgcmVzdWx0OiBgdG9vbHM6IFsncmVhZCcsICdhZ2VudCddYCB9LFxuXHRcdFx0XHR7IGxhYmVsOiAnZXhlY3V0ZScsIHJlc3VsdDogYHRvb2xzOiBbJ3JlYWQnLCAnZXhlY3V0ZSddYCB9LFxuXHRcdFx0XHR7IGxhYmVsOiAndG9vbDEnLCByZXN1bHQ6IGB0b29sczogWydyZWFkJywgJ3Rvb2wxJ11gIH0sXG5cdFx0XHRcdHsgbGFiZWw6ICd0b29sMicsIHJlc3VsdDogYHRvb2xzOiBbJ3JlYWQnLCAndG9vbDInXWAgfSxcblx0XHRcdFx0eyBsYWJlbDogJ3ZzY29kZScsIHJlc3VsdDogYHRvb2xzOiBbJ3JlYWQnLCAndnNjb2RlJ11gIH0sXG5cdFx0XHRdLnNvcnQoc29ydEJ5TGFiZWwpKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2NvbXBsZXRlIHRvb2wgbmFtZXMgaW5zaWRlIHRvb2xzIGFycmF5IHdpdGggZXhpc3RpbmcgZG91YmxlIHF1b3RlZCBlbnRyaWVzJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgY29udGVudCA9IFtcblx0XHRcdFx0Jy0tLScsXG5cdFx0XHRcdCdkZXNjcmlwdGlvbjogXCJUZXN0XCInLFxuXHRcdFx0XHRgdG9vbHM6IFtcInJlYWRcIiwgXCJ0b29sMVwiLCB8XWAsXG5cdFx0XHRcdCctLS0nLFxuXHRcdFx0XS5qb2luKCdcXG4nKTtcblxuXHRcdFx0Y29uc3QgYWN0dWFsID0gYXdhaXQgZ2V0Q29tcGxldGlvbnMoY29udGVudCwgUHJvbXB0c1R5cGUuYWdlbnQpO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChhY3R1YWwuc29ydChzb3J0QnlMYWJlbCksIFtcblx0XHRcdFx0eyBsYWJlbDogJ2FnZW50JywgcmVzdWx0OiBgdG9vbHM6IFtcInJlYWRcIiwgXCJ0b29sMVwiLCBcImFnZW50XCJdYCB9LFxuXHRcdFx0XHR7IGxhYmVsOiAnZXhlY3V0ZScsIHJlc3VsdDogYHRvb2xzOiBbXCJyZWFkXCIsIFwidG9vbDFcIiwgXCJleGVjdXRlXCJdYCB9LFxuXHRcdFx0XHR7IGxhYmVsOiAndG9vbDInLCByZXN1bHQ6IGB0b29sczogW1wicmVhZFwiLCBcInRvb2wxXCIsIFwidG9vbDJcIl1gIH0sXG5cdFx0XHRcdHsgbGFiZWw6ICd2c2NvZGUnLCByZXN1bHQ6IGB0b29sczogW1wicmVhZFwiLCBcInRvb2wxXCIsIFwidnNjb2RlXCJdYCB9LFxuXHRcdFx0XS5zb3J0KHNvcnRCeUxhYmVsKSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdjb21wbGV0ZSB0b29sIG5hbWVzIGluc2lkZSB0b29scyBhcnJheSB3aXRoIGV4aXN0aW5nIHVucXVvdGVkIGVudHJpZXMnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCBjb250ZW50ID0gW1xuXHRcdFx0XHQnLS0tJyxcblx0XHRcdFx0J2Rlc2NyaXB0aW9uOiBcIlRlc3RcIicsXG5cdFx0XHRcdGB0b29sczogW3JlYWQsIFwidG9vbDFcIiwgfF1gLFxuXHRcdFx0XHQnLS0tJyxcblx0XHRcdF0uam9pbignXFxuJyk7XG5cblx0XHRcdC8vdXNlcyB0aGUgZmlyc3QgZW50cnkgdG8gZGV0ZXJtaW5lIHF1b3RlIHByZWZlcmVuY2UsIHNvIHRoZSBuZXcgZW50cnkgc2hvdWxkIGJlIHVucXVvdGVkXG5cblx0XHRcdGNvbnN0IGFjdHVhbCA9IGF3YWl0IGdldENvbXBsZXRpb25zKGNvbnRlbnQsIFByb21wdHNUeXBlLmFnZW50KTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoYWN0dWFsLnNvcnQoc29ydEJ5TGFiZWwpLCBbXG5cdFx0XHRcdHsgbGFiZWw6ICdhZ2VudCcsIHJlc3VsdDogYHRvb2xzOiBbcmVhZCwgXCJ0b29sMVwiLCBhZ2VudF1gIH0sXG5cdFx0XHRcdHsgbGFiZWw6ICdleGVjdXRlJywgcmVzdWx0OiBgdG9vbHM6IFtyZWFkLCBcInRvb2wxXCIsIGV4ZWN1dGVdYCB9LFxuXHRcdFx0XHR7IGxhYmVsOiAndG9vbDInLCByZXN1bHQ6IGB0b29sczogW3JlYWQsIFwidG9vbDFcIiwgdG9vbDJdYCB9LFxuXHRcdFx0XHR7IGxhYmVsOiAndnNjb2RlJywgcmVzdWx0OiBgdG9vbHM6IFtyZWFkLCBcInRvb2wxXCIsIHZzY29kZV1gIH0sXG5cdFx0XHRdLnNvcnQoc29ydEJ5TGFiZWwpKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2NvbXBsZXRlIHRvb2wgbmFtZXMgaW5zaWRlIHRvb2xzIGFycmF5IHdpdGggZXhpc3RpbmcgZW50cmllcyAyJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgY29udGVudCA9IFtcblx0XHRcdFx0Jy0tLScsXG5cdFx0XHRcdCdkZXNjcmlwdGlvbjogXCJUZXN0XCInLFxuXHRcdFx0XHRgdG9vbHM6IFsncmVhZCcsICdleGV8Y3V0ZSddYCxcblx0XHRcdFx0Jy0tLScsXG5cdFx0XHRdLmpvaW4oJ1xcbicpO1xuXG5cdFx0XHRjb25zdCBhY3R1YWwgPSBhd2FpdCBnZXRDb21wbGV0aW9ucyhjb250ZW50LCBQcm9tcHRzVHlwZS5hZ2VudCk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGFjdHVhbC5zb3J0KHNvcnRCeUxhYmVsKSwgW1xuXHRcdFx0XHR7IGxhYmVsOiAnYWdlbnQnLCByZXN1bHQ6IGB0b29sczogWydyZWFkJywgJ2FnZW50J11gIH0sXG5cdFx0XHRcdHsgbGFiZWw6ICdleGVjdXRlJywgcmVzdWx0OiBgdG9vbHM6IFsncmVhZCcsICdleGVjdXRlJ11gIH0sXG5cdFx0XHRcdHsgbGFiZWw6ICd0b29sMScsIHJlc3VsdDogYHRvb2xzOiBbJ3JlYWQnLCAndG9vbDEnXWAgfSxcblx0XHRcdFx0eyBsYWJlbDogJ3Rvb2wyJywgcmVzdWx0OiBgdG9vbHM6IFsncmVhZCcsICd0b29sMiddYCB9LFxuXHRcdFx0XHR7IGxhYmVsOiAndnNjb2RlJywgcmVzdWx0OiBgdG9vbHM6IFsncmVhZCcsICd2c2NvZGUnXWAgfSxcblx0XHRcdF0uc29ydChzb3J0QnlMYWJlbCkpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnY29tcGxldGUgYWdlbnRzIGluc2lkZSBhZ2VudHMgYXJyYXknLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCBjb250ZW50ID0gW1xuXHRcdFx0XHQnLS0tJyxcblx0XHRcdFx0J2Rlc2NyaXB0aW9uOiBcIlRlc3RcIicsXG5cdFx0XHRcdCdhZ2VudHM6IFt8XScsXG5cdFx0XHRcdCctLS0nLFxuXHRcdFx0XS5qb2luKCdcXG4nKTtcblxuXHRcdFx0Y29uc3QgYWN0dWFsID0gYXdhaXQgZ2V0Q29tcGxldGlvbnMoY29udGVudCwgUHJvbXB0c1R5cGUuYWdlbnQpO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChhY3R1YWwuc29ydChzb3J0QnlMYWJlbCksIFtcblx0XHRcdFx0eyBsYWJlbDogJ2FnZW50MScsIHJlc3VsdDogYGFnZW50czogW2FnZW50MV1gIH0sXG5cdFx0XHRdLnNvcnQoc29ydEJ5TGFiZWwpKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2NvbXBsZXRlIGluZmVyIGF0dHJpYnV0ZSB2YWx1ZScsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IGNvbnRlbnQgPSBbXG5cdFx0XHRcdCctLS0nLFxuXHRcdFx0XHQnZGVzY3JpcHRpb246IFwiVGVzdFwiJyxcblx0XHRcdFx0J2luZmVyOiB8Jyxcblx0XHRcdFx0Jy0tLScsXG5cdFx0XHRdLmpvaW4oJ1xcbicpO1xuXG5cdFx0XHRjb25zdCBhY3R1YWwgPSBhd2FpdCBnZXRDb21wbGV0aW9ucyhjb250ZW50LCBQcm9tcHRzVHlwZS5hZ2VudCk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGFjdHVhbC5zb3J0KHNvcnRCeUxhYmVsKSwgW1xuXHRcdFx0XHR7IGxhYmVsOiAnZmFsc2UnLCByZXN1bHQ6ICdpbmZlcjogZmFsc2UnIH0sXG5cdFx0XHRcdHsgbGFiZWw6ICd0cnVlJywgcmVzdWx0OiAnaW5mZXI6IHRydWUnIH0sXG5cdFx0XHRdLnNvcnQoc29ydEJ5TGFiZWwpKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2NvbXBsZXRlIHVzZXItaW52b2NhYmxlIGF0dHJpYnV0ZSB2YWx1ZScsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IGNvbnRlbnQgPSBbXG5cdFx0XHRcdCctLS0nLFxuXHRcdFx0XHQnZGVzY3JpcHRpb246IFwiVGVzdFwiJyxcblx0XHRcdFx0J3VzZXItaW52b2NhYmxlOiB8Jyxcblx0XHRcdFx0Jy0tLScsXG5cdFx0XHRdLmpvaW4oJ1xcbicpO1xuXG5cdFx0XHRjb25zdCBhY3R1YWwgPSBhd2FpdCBnZXRDb21wbGV0aW9ucyhjb250ZW50LCBQcm9tcHRzVHlwZS5hZ2VudCk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGFjdHVhbC5zb3J0KHNvcnRCeUxhYmVsKSwgW1xuXHRcdFx0XHR7IGxhYmVsOiAnZmFsc2UnLCByZXN1bHQ6ICd1c2VyLWludm9jYWJsZTogZmFsc2UnIH0sXG5cdFx0XHRcdHsgbGFiZWw6ICd0cnVlJywgcmVzdWx0OiAndXNlci1pbnZvY2FibGU6IHRydWUnIH0sXG5cdFx0XHRdLnNvcnQoc29ydEJ5TGFiZWwpKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2NvbXBsZXRlIGRpc2FibGUtbW9kZWwtaW52b2NhdGlvbiBhdHRyaWJ1dGUgdmFsdWUnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCBjb250ZW50ID0gW1xuXHRcdFx0XHQnLS0tJyxcblx0XHRcdFx0J2Rlc2NyaXB0aW9uOiBcIlRlc3RcIicsXG5cdFx0XHRcdCdkaXNhYmxlLW1vZGVsLWludm9jYXRpb246IHwnLFxuXHRcdFx0XHQnLS0tJyxcblx0XHRcdF0uam9pbignXFxuJyk7XG5cblx0XHRcdGNvbnN0IGFjdHVhbCA9IGF3YWl0IGdldENvbXBsZXRpb25zKGNvbnRlbnQsIFByb21wdHNUeXBlLmFnZW50KTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoYWN0dWFsLnNvcnQoc29ydEJ5TGFiZWwpLCBbXG5cdFx0XHRcdHsgbGFiZWw6ICdmYWxzZScsIHJlc3VsdDogJ2Rpc2FibGUtbW9kZWwtaW52b2NhdGlvbjogZmFsc2UnIH0sXG5cdFx0XHRcdHsgbGFiZWw6ICd0cnVlJywgcmVzdWx0OiAnZGlzYWJsZS1tb2RlbC1pbnZvY2F0aW9uOiB0cnVlJyB9LFxuXHRcdFx0XS5zb3J0KHNvcnRCeUxhYmVsKSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdleGNsdWRlIG1vZGVscyB3aXRoIHRhcmdldENoYXRTZXNzaW9uVHlwZSBmcm9tIGFnZW50IG1vZGVsIGNvbXBsZXRpb25zJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgY29udGVudCA9IFtcblx0XHRcdFx0Jy0tLScsXG5cdFx0XHRcdCdkZXNjcmlwdGlvbjogXCJUZXN0XCInLFxuXHRcdFx0XHQnbW9kZWw6IHwnLFxuXHRcdFx0XHQnLS0tJyxcblx0XHRcdF0uam9pbignXFxuJyk7XG5cblx0XHRcdGNvbnN0IGFjdHVhbCA9IGF3YWl0IGdldENvbXBsZXRpb25zKGNvbnRlbnQsIFByb21wdHNUeXBlLmFnZW50KTtcblx0XHRcdGNvbnN0IGxhYmVscyA9IGFjdHVhbC5tYXAoYSA9PiBhLmxhYmVsKTtcblx0XHRcdC8vIEJHIEFnZW50IE1vZGVsIGhhcyB0YXJnZXRDaGF0U2Vzc2lvblR5cGUgc2V0LCBzbyBpdCBzaG91bGQgYmUgZXhjbHVkZWRcblx0XHRcdGFzc2VydC5vayghbGFiZWxzLmluY2x1ZGVzKCdCRyBBZ2VudCBNb2RlbCAoY29waWxvdCknKSwgJ01vZGVscyB3aXRoIHRhcmdldENoYXRTZXNzaW9uVHlwZSBzaG91bGQgYmUgZXhjbHVkZWQgZnJvbSBhZ2VudCBtb2RlbCBjb21wbGV0aW9ucycpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnZXhjbHVkZSBtb2RlbHMgd2l0aCB0YXJnZXRDaGF0U2Vzc2lvblR5cGUgZnJvbSBhZ2VudCBtb2RlbCBhcnJheSBjb21wbGV0aW9ucycsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IGNvbnRlbnQgPSBbXG5cdFx0XHRcdCctLS0nLFxuXHRcdFx0XHQnZGVzY3JpcHRpb246IFwiVGVzdFwiJyxcblx0XHRcdFx0J21vZGVsOiBbfF0nLFxuXHRcdFx0XHQnLS0tJyxcblx0XHRcdF0uam9pbignXFxuJyk7XG5cblx0XHRcdGNvbnN0IGFjdHVhbCA9IGF3YWl0IGdldENvbXBsZXRpb25zKGNvbnRlbnQsIFByb21wdHNUeXBlLmFnZW50KTtcblx0XHRcdGNvbnN0IGxhYmVscyA9IGFjdHVhbC5tYXAoYSA9PiBhLmxhYmVsKTtcblx0XHRcdGFzc2VydC5vayghbGFiZWxzLmluY2x1ZGVzKCdCRyBBZ2VudCBNb2RlbCAoY29waWxvdCknKSwgJ01vZGVscyB3aXRoIHRhcmdldENoYXRTZXNzaW9uVHlwZSBzaG91bGQgYmUgZXhjbHVkZWQgZnJvbSBhZ2VudCBtb2RlbCBhcnJheSBjb21wbGV0aW9ucycpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnY29tcGxldGUgaG9va3MgdmFsdWUgd2l0aCBOZXcgSG9vayBzbmlwcGV0JywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgY29udGVudCA9IFtcblx0XHRcdFx0Jy0tLScsXG5cdFx0XHRcdCdkZXNjcmlwdGlvbjogXCJUZXN0XCInLFxuXHRcdFx0XHQnaG9va3M6IHwnLFxuXHRcdFx0XHQnLS0tJyxcblx0XHRcdF0uam9pbignXFxuJyk7XG5cblx0XHRcdGNvbnN0IGFjdHVhbCA9IGF3YWl0IGdldENvbXBsZXRpb25zKGNvbnRlbnQsIFByb21wdHNUeXBlLmFnZW50KTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoYWN0dWFsLCBbXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRsYWJlbDogJ05ldyBIb29rJyxcblx0XHRcdFx0XHRyZXN1bHQ6ICdob29rczogXFxuICAkezF8U2Vzc2lvblN0YXJ0LFNlc3Npb25FbmQsVXNlclByb21wdFN1Ym1pdCxQcmVUb29sVXNlLFBvc3RUb29sVXNlLFByZUNvbXBhY3QsU3ViYWdlbnRTdGFydCxTdWJhZ2VudFN0b3AsU3RvcCxFcnJvck9jY3VycmVkfH06XFxuICAgIC0gdHlwZTogY29tbWFuZFxcbiAgICAgIGNvbW1hbmQ6IFwiJDJcIidcblx0XHRcdFx0fSxcblx0XHRcdF0pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnY29tcGxldGUgaG9va3MgdmFsdWUgd2l0aCBOZXcgSG9vayBzbmlwcGV0IGZvciB2c2NvZGUgdGFyZ2V0JywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgY29udGVudCA9IFtcblx0XHRcdFx0Jy0tLScsXG5cdFx0XHRcdCdkZXNjcmlwdGlvbjogXCJUZXN0XCInLFxuXHRcdFx0XHQndGFyZ2V0OiB2c2NvZGUnLFxuXHRcdFx0XHQnaG9va3M6IHwnLFxuXHRcdFx0XHQnLS0tJyxcblx0XHRcdF0uam9pbignXFxuJyk7XG5cblx0XHRcdGNvbnN0IGFjdHVhbCA9IGF3YWl0IGdldENvbXBsZXRpb25zKGNvbnRlbnQsIFByb21wdHNUeXBlLmFnZW50KTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoYWN0dWFsLCBbXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRsYWJlbDogJ05ldyBIb29rJyxcblx0XHRcdFx0XHRyZXN1bHQ6ICdob29rczogXFxuICAkezF8U2Vzc2lvblN0YXJ0LFVzZXJQcm9tcHRTdWJtaXQsUHJlVG9vbFVzZSxQb3N0VG9vbFVzZSxQcmVDb21wYWN0LFN1YmFnZW50U3RhcnQsU3ViYWdlbnRTdG9wLFN0b3B8fTpcXG4gICAgLSB0eXBlOiBjb21tYW5kXFxuICAgICAgY29tbWFuZDogXCIkMlwiJ1xuXHRcdFx0XHR9LFxuXHRcdFx0XSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdjb21wbGV0ZSBob29rIGV2ZW50IG5hbWVzIGluc2lkZSBob29rcyBtYXAnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCBjb250ZW50ID0gW1xuXHRcdFx0XHQnLS0tJyxcblx0XHRcdFx0J2Rlc2NyaXB0aW9uOiBcIlRlc3RcIicsXG5cdFx0XHRcdCdob29rczonLFxuXHRcdFx0XHQnICBTZXNzaW9uU3RhcnQ6Jyxcblx0XHRcdFx0JyAgICAtIHR5cGU6IGNvbW1hbmQnLFxuXHRcdFx0XHQnICAgICAgY29tbWFuZDogXCJlY2hvIGhpXCInLFxuXHRcdFx0XHQnICB8Jyxcblx0XHRcdFx0Jy0tLScsXG5cdFx0XHRdLmpvaW4oJ1xcbicpO1xuXG5cdFx0XHRjb25zdCBhY3R1YWwgPSBhd2FpdCBnZXRDb21wbGV0aW9ucyhjb250ZW50LCBQcm9tcHRzVHlwZS5hZ2VudCk7XG5cdFx0XHRjb25zdCBsYWJlbHMgPSBhY3R1YWwubWFwKGEgPT4gYS5sYWJlbCkuc29ydCgpO1xuXHRcdFx0Ly8gU2Vzc2lvblN0YXJ0IHNob3VsZCBiZSBleGNsdWRlZCBzaW5jZSBpdCBhbHJlYWR5IGV4aXN0c1xuXHRcdFx0YXNzZXJ0Lm9rKCFsYWJlbHMuaW5jbHVkZXMoJ1Nlc3Npb25TdGFydCcpLCAnU2Vzc2lvblN0YXJ0IHNob3VsZCBub3QgYmUgc3VnZ2VzdGVkIHdoZW4gYWxyZWFkeSBwcmVzZW50Jyk7XG5cdFx0XHRhc3NlcnQub2sobGFiZWxzLmluY2x1ZGVzKCdTZXNzaW9uRW5kJyksICdTZXNzaW9uRW5kIHNob3VsZCBiZSBzdWdnZXN0ZWQnKTtcblx0XHRcdGFzc2VydC5vayhsYWJlbHMuaW5jbHVkZXMoJ1ByZVRvb2xVc2UnKSwgJ1ByZVRvb2xVc2Ugc2hvdWxkIGJlIHN1Z2dlc3RlZCcpO1xuXHRcdFx0YXNzZXJ0Lm9rKGxhYmVscy5pbmNsdWRlcygnU3RvcCcpLCAnU3RvcCBzaG91bGQgYmUgc3VnZ2VzdGVkJyk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdjb21wbGV0ZSBob29rIGV2ZW50IG5hbWVzIGZvciB2c2NvZGUgdGFyZ2V0IGV4Y2x1ZGVzIGV4aXN0aW5nIGhvb2tzJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgY29udGVudCA9IFtcblx0XHRcdFx0Jy0tLScsXG5cdFx0XHRcdCdkZXNjcmlwdGlvbjogXCJUZXN0XCInLFxuXHRcdFx0XHQndGFyZ2V0OiB2c2NvZGUnLFxuXHRcdFx0XHQnaG9va3M6Jyxcblx0XHRcdFx0JyAgU2Vzc2lvblN0YXJ0OicsXG5cdFx0XHRcdCcgICAgLSB0eXBlOiBjb21tYW5kJyxcblx0XHRcdFx0JyAgICAgIGNvbW1hbmQ6IFwiZWNobyBoaVwiJyxcblx0XHRcdFx0JyAgUHJlVG9vbFVzZTonLFxuXHRcdFx0XHQnICAgIC0gdHlwZTogY29tbWFuZCcsXG5cdFx0XHRcdCcgICAgICBjb21tYW5kOiBcImxpbnRcIicsXG5cdFx0XHRcdCcgIHwnLFxuXHRcdFx0XHQnLS0tJyxcblx0XHRcdF0uam9pbignXFxuJyk7XG5cblx0XHRcdGNvbnN0IGFjdHVhbCA9IGF3YWl0IGdldENvbXBsZXRpb25zKGNvbnRlbnQsIFByb21wdHNUeXBlLmFnZW50KTtcblx0XHRcdGNvbnN0IGxhYmVscyA9IGFjdHVhbC5tYXAoYSA9PiBhLmxhYmVsKS5zb3J0KCk7XG5cdFx0XHRhc3NlcnQub2soIWxhYmVscy5pbmNsdWRlcygnU2Vzc2lvblN0YXJ0JyksICdTZXNzaW9uU3RhcnQgc2hvdWxkIG5vdCBiZSBzdWdnZXN0ZWQgd2hlbiBhbHJlYWR5IHByZXNlbnQnKTtcblx0XHRcdGFzc2VydC5vayghbGFiZWxzLmluY2x1ZGVzKCdQcmVUb29sVXNlJyksICdQcmVUb29sVXNlIHNob3VsZCBub3QgYmUgc3VnZ2VzdGVkIHdoZW4gYWxyZWFkeSBwcmVzZW50Jyk7XG5cdFx0XHRhc3NlcnQub2sobGFiZWxzLmluY2x1ZGVzKCdVc2VyUHJvbXB0U3VibWl0JyksICdVc2VyUHJvbXB0U3VibWl0IHNob3VsZCBiZSBzdWdnZXN0ZWQnKTtcblx0XHRcdGFzc2VydC5vayhsYWJlbHMuaW5jbHVkZXMoJ1Bvc3RUb29sVXNlJyksICdQb3N0VG9vbFVzZSBzaG91bGQgYmUgc3VnZ2VzdGVkJyk7XG5cdFx0XHQvLyBTZXNzaW9uRW5kIGlzIG5vdCBhdmFpbGFibGUgZm9yIHZzY29kZSB0YXJnZXRcblx0XHRcdGFzc2VydC5vayghbGFiZWxzLmluY2x1ZGVzKCdTZXNzaW9uRW5kJyksICdTZXNzaW9uRW5kIHNob3VsZCBub3QgYmUgYXZhaWxhYmxlIGZvciB2c2NvZGUgdGFyZ2V0Jyk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdjb21wbGV0ZSBob29rIGV2ZW50IG5hbWVzIG9uIGVtcHR5IGxpbmUgYmVmb3JlIGV4aXN0aW5nIGhvb2tzJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgY29udGVudCA9IFtcblx0XHRcdFx0Jy0tLScsXG5cdFx0XHRcdCdkZXNjcmlwdGlvbjogXCJUZXN0XCInLFxuXHRcdFx0XHQnaG9va3M6Jyxcblx0XHRcdFx0JyAgfCcsXG5cdFx0XHRcdCcgIFNlc3Npb25TdGFydDonLFxuXHRcdFx0XHQnICAgIC0gdHlwZTogY29tbWFuZCcsXG5cdFx0XHRcdCcgICAgICBjb21tYW5kOiBcImVjaG8gaGlcIicsXG5cdFx0XHRcdCctLS0nLFxuXHRcdFx0XS5qb2luKCdcXG4nKTtcblxuXHRcdFx0Y29uc3QgYWN0dWFsID0gYXdhaXQgZ2V0Q29tcGxldGlvbnMoY29udGVudCwgUHJvbXB0c1R5cGUuYWdlbnQpO1xuXHRcdFx0Y29uc3QgbGFiZWxzID0gYWN0dWFsLm1hcChhID0+IGEubGFiZWwpLnNvcnQoKTtcblx0XHRcdGFzc2VydC5vayghbGFiZWxzLmluY2x1ZGVzKCdTZXNzaW9uU3RhcnQnKSwgJ1Nlc3Npb25TdGFydCBzaG91bGQgbm90IGJlIHN1Z2dlc3RlZCB3aGVuIGFscmVhZHkgcHJlc2VudCcpO1xuXHRcdFx0YXNzZXJ0Lm9rKGxhYmVscy5pbmNsdWRlcygnU2Vzc2lvbkVuZCcpLCAnU2Vzc2lvbkVuZCBzaG91bGQgYmUgc3VnZ2VzdGVkJyk7XG5cdFx0XHRhc3NlcnQub2sobGFiZWxzLmluY2x1ZGVzKCdQcmVUb29sVXNlJyksICdQcmVUb29sVXNlIHNob3VsZCBiZSBzdWdnZXN0ZWQnKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2NvbXBsZXRlIGhvb2sgZXZlbnQgbmFtZXMgd2hpbGUgZWRpdGluZyBleGlzdGluZyBrZXkgbmFtZScsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IGNvbnRlbnQgPSBbXG5cdFx0XHRcdCctLS0nLFxuXHRcdFx0XHQnZGVzY3JpcHRpb246IFwiVGVzdFwiJyxcblx0XHRcdFx0J2hvb2tzOicsXG5cdFx0XHRcdCcgIFN8OicsXG5cdFx0XHRcdCcgICAgLSB0eXBlOiBjb21tYW5kJyxcblx0XHRcdFx0JyAgICAgIGNvbW1hbmQ6IFwiZWNobyBoaVwiJyxcblx0XHRcdFx0Jy0tLScsXG5cdFx0XHRdLmpvaW4oJ1xcbicpO1xuXG5cdFx0XHRjb25zdCBhY3R1YWwgPSBhd2FpdCBnZXRDb21wbGV0aW9ucyhjb250ZW50LCBQcm9tcHRzVHlwZS5hZ2VudCk7XG5cdFx0XHRjb25zdCBsYWJlbHMgPSBhY3R1YWwubWFwKGEgPT4gYS5sYWJlbCkuc29ydCgpO1xuXHRcdFx0YXNzZXJ0Lm9rKGxhYmVscy5pbmNsdWRlcygnU2Vzc2lvblN0YXJ0JyksICdTZXNzaW9uU3RhcnQgc2hvdWxkIGJlIHN1Z2dlc3RlZCcpO1xuXHRcdFx0YXNzZXJ0Lm9rKGxhYmVscy5pbmNsdWRlcygnU3ViYWdlbnRTdGFydCcpLCAnU3ViYWdlbnRTdGFydCBzaG91bGQgYmUgc3VnZ2VzdGVkJyk7XG5cdFx0XHRhc3NlcnQub2sobGFiZWxzLmluY2x1ZGVzKCdTdG9wJyksICdTdG9wIHNob3VsZCBiZSBzdWdnZXN0ZWQnKTtcblx0XHRcdC8vIFZlcmlmeSBpbnNlcnRUZXh0IG9ubHkgcmVwbGFjZXMgdGhlIGtleSAobm8gZnVsbCBzbmlwcGV0KVxuXHRcdFx0Y29uc3Qgc2Vzc2lvblN0YXJ0SXRlbSA9IGFjdHVhbC5maW5kKGEgPT4gYS5sYWJlbCA9PT0gJ1Nlc3Npb25TdGFydCcpO1xuXHRcdFx0YXNzZXJ0Lm9rKHNlc3Npb25TdGFydEl0ZW0pO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNlc3Npb25TdGFydEl0ZW0ucmVzdWx0LCAnICBTZXNzaW9uU3RhcnQ6Jyk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdob29rczogY3Vyc29yIHJpZ2h0IGFmdGVyIGNvbG9uIHRyaWdnZXJzIE5ldyBIb29rIHNuaXBwZXQnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCBjb250ZW50ID0gW1xuXHRcdFx0XHQnLS0tJyxcblx0XHRcdFx0J2Rlc2NyaXB0aW9uOiBcIlRlc3RcIicsXG5cdFx0XHRcdCdob29rczogfCcsXG5cdFx0XHRcdCctLS0nLFxuXHRcdFx0XS5qb2luKCdcXG4nKTtcblxuXHRcdFx0Y29uc3QgYWN0dWFsID0gYXdhaXQgZ2V0Q29tcGxldGlvbnMoY29udGVudCwgUHJvbXB0c1R5cGUuYWdlbnQpO1xuXHRcdFx0Y29uc3QgbGFiZWxzID0gYWN0dWFsLm1hcChhID0+IGEubGFiZWwpO1xuXHRcdFx0YXNzZXJ0Lm9rKGxhYmVscy5pbmNsdWRlcygnTmV3IEhvb2snKSwgJ05ldyBIb29rIHNuaXBwZXQgc2hvdWxkIGJlIHN1Z2dlc3RlZCcpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnaG9va3M6IHR5cGluZyBldmVudCBuYW1lIG9uIG5leHQgbGluZSB0cmlnZ2VycyBob29rIGV2ZW50cycsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IGNvbnRlbnQgPSBbXG5cdFx0XHRcdCctLS0nLFxuXHRcdFx0XHQnZGVzY3JpcHRpb246IFwiVGVzdFwiJyxcblx0XHRcdFx0J2hvb2tzOicsXG5cdFx0XHRcdCcgIFN8Jyxcblx0XHRcdFx0Jy0tLScsXG5cdFx0XHRdLmpvaW4oJ1xcbicpO1xuXG5cdFx0XHRjb25zdCBhY3R1YWwgPSBhd2FpdCBnZXRDb21wbGV0aW9ucyhjb250ZW50LCBQcm9tcHRzVHlwZS5hZ2VudCk7XG5cdFx0XHRjb25zdCBsYWJlbHMgPSBhY3R1YWwubWFwKGEgPT4gYS5sYWJlbCk7XG5cdFx0XHRhc3NlcnQub2sobGFiZWxzLmluY2x1ZGVzKCdTZXNzaW9uU3RhcnQnKSwgJ1Nlc3Npb25TdGFydCBzaG91bGQgYmUgc3VnZ2VzdGVkJyk7XG5cdFx0XHRhc3NlcnQub2sobGFiZWxzLmluY2x1ZGVzKCdTZXNzaW9uRW5kJyksICdTZXNzaW9uRW5kIHNob3VsZCBiZSBzdWdnZXN0ZWQnKTtcblx0XHRcdGFzc2VydC5vayhsYWJlbHMuaW5jbHVkZXMoJ1N0b3AnKSwgJ1N0b3Agc2hvdWxkIGJlIHN1Z2dlc3RlZCcpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgndHlwaW5nIGZpZWxkIG5hbWUgaW4gZmlyc3QgY29tbWFuZCBlbnRyeSB0cmlnZ2VycyBjb21tYW5kIGZpZWxkcycsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IGNvbnRlbnQgPSBbXG5cdFx0XHRcdCctLS0nLFxuXHRcdFx0XHQnZGVzY3JpcHRpb246IFwiVGVzdFwiJyxcblx0XHRcdFx0J2hvb2tzOicsXG5cdFx0XHRcdCcgIFNlc3Npb25FbmQ6Jyxcblx0XHRcdFx0JyAgICAtIHR8Jyxcblx0XHRcdFx0Jy0tLScsXG5cdFx0XHRdLmpvaW4oJ1xcbicpO1xuXG5cdFx0XHRjb25zdCBhY3R1YWwgPSBhd2FpdCBnZXRDb21wbGV0aW9ucyhjb250ZW50LCBQcm9tcHRzVHlwZS5hZ2VudCk7XG5cdFx0XHRjb25zdCBsYWJlbHMgPSBhY3R1YWwubWFwKGEgPT4gYS5sYWJlbCk7XG5cdFx0XHRhc3NlcnQub2sobGFiZWxzLmluY2x1ZGVzKCd0eXBlJyksICd0eXBlIHNob3VsZCBiZSBzdWdnZXN0ZWQnKTtcblx0XHRcdGFzc2VydC5vayhsYWJlbHMuaW5jbHVkZXMoJ2NvbW1hbmQnKSwgJ2NvbW1hbmQgc2hvdWxkIGJlIHN1Z2dlc3RlZCcpO1xuXHRcdFx0YXNzZXJ0Lm9rKGxhYmVscy5pbmNsdWRlcygndGltZW91dCcpLCAndGltZW91dCBzaG91bGQgYmUgc3VnZ2VzdGVkJyk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCd0eXBpbmcgZmllbGQgbmFtZSBhZnRlciBleGlzdGluZyBmaWVsZCB0cmlnZ2VycyByZW1haW5pbmcgY29tbWFuZCBmaWVsZHMnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCBjb250ZW50ID0gW1xuXHRcdFx0XHQnLS0tJyxcblx0XHRcdFx0J2Rlc2NyaXB0aW9uOiBcIlRlc3RcIicsXG5cdFx0XHRcdCdob29rczonLFxuXHRcdFx0XHQnICBTZXNzaW9uRW5kOicsXG5cdFx0XHRcdCcgICAgLSB0eXBlOiBjb21tYW5kJyxcblx0XHRcdFx0JyAgICAgIGN8Jyxcblx0XHRcdFx0Jy0tLScsXG5cdFx0XHRdLmpvaW4oJ1xcbicpO1xuXG5cdFx0XHRjb25zdCBhY3R1YWwgPSBhd2FpdCBnZXRDb21wbGV0aW9ucyhjb250ZW50LCBQcm9tcHRzVHlwZS5hZ2VudCk7XG5cdFx0XHRjb25zdCBsYWJlbHMgPSBhY3R1YWwubWFwKGEgPT4gYS5sYWJlbCk7XG5cdFx0XHRhc3NlcnQub2sobGFiZWxzLmluY2x1ZGVzKCdjb21tYW5kJyksICdjb21tYW5kIHNob3VsZCBiZSBzdWdnZXN0ZWQnKTtcblx0XHRcdGFzc2VydC5vayhsYWJlbHMuaW5jbHVkZXMoJ2N3ZCcpLCAnY3dkIHNob3VsZCBiZSBzdWdnZXN0ZWQnKTtcblx0XHRcdGFzc2VydC5vayghbGFiZWxzLmluY2x1ZGVzKCd0eXBlJyksICd0eXBlIHNob3VsZCBub3QgYmUgc3VnZ2VzdGVkIHdoZW4gYWxyZWFkeSBwcmVzZW50Jyk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCd0eXBpbmcgZXZlbnQgbmFtZSBhZnRlciBleGlzdGluZyBob29rIHRyaWdnZXJzIGhvb2sgZXZlbnRzJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgY29udGVudCA9IFtcblx0XHRcdFx0Jy0tLScsXG5cdFx0XHRcdCdkZXNjcmlwdGlvbjogXCJUZXN0XCInLFxuXHRcdFx0XHQnaG9va3M6Jyxcblx0XHRcdFx0JyAgU2Vzc2lvbkVuZDonLFxuXHRcdFx0XHQnICAgIC0gdHlwZTogY29tbWFuZCcsXG5cdFx0XHRcdCcgICAgICBjb21tYW5kOiBlY2hvIFwiU2Vzc2lvbiBlbmRlZC5cIicsXG5cdFx0XHRcdCcgIFV8Jyxcblx0XHRcdFx0Jy0tLScsXG5cdFx0XHRdLmpvaW4oJ1xcbicpO1xuXG5cdFx0XHRjb25zdCBhY3R1YWwgPSBhd2FpdCBnZXRDb21wbGV0aW9ucyhjb250ZW50LCBQcm9tcHRzVHlwZS5hZ2VudCk7XG5cdFx0XHRjb25zdCBsYWJlbHMgPSBhY3R1YWwubWFwKGEgPT4gYS5sYWJlbCk7XG5cdFx0XHRhc3NlcnQub2sobGFiZWxzLmluY2x1ZGVzKCdVc2VyUHJvbXB0U3VibWl0JyksICdVc2VyUHJvbXB0U3VibWl0IHNob3VsZCBiZSBzdWdnZXN0ZWQnKTtcblx0XHRcdGFzc2VydC5vayghbGFiZWxzLmluY2x1ZGVzKCdTZXNzaW9uRW5kJyksICdTZXNzaW9uRW5kIHNob3VsZCBub3QgYmUgc3VnZ2VzdGVkIHdoZW4gYWxyZWFkeSBwcmVzZW50Jyk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCd0eXBpbmcgZXZlbnQgbmFtZSBiZXR3ZWVuIGV4aXN0aW5nIGhvb2tzIHRyaWdnZXJzIGhvb2sgZXZlbnRzJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgY29udGVudCA9IFtcblx0XHRcdFx0Jy0tLScsXG5cdFx0XHRcdCdkZXNjcmlwdGlvbjogXCJUZXN0XCInLFxuXHRcdFx0XHQnaG9va3M6Jyxcblx0XHRcdFx0JyAgU2Vzc2lvbkVuZDonLFxuXHRcdFx0XHQnICAgIC0gdHlwZTogY29tbWFuZCcsXG5cdFx0XHRcdCcgICAgICBjb21tYW5kOiBlY2hvIFwiU2Vzc2lvbiBlbmRlZC5cIicsXG5cdFx0XHRcdCcgIFN8Jyxcblx0XHRcdFx0JyAgVXNlclByb21wdFN1Ym1pdDonLFxuXHRcdFx0XHQnICAgIC0gdHlwZTogY29tbWFuZCcsXG5cdFx0XHRcdCcgICAgICBjb21tYW5kOiBlY2hvIFwiVXNlciBzdWJtaXR0ZWQuXCInLFxuXHRcdFx0XHQnLS0tJyxcblx0XHRcdF0uam9pbignXFxuJyk7XG5cblx0XHRcdGNvbnN0IGFjdHVhbCA9IGF3YWl0IGdldENvbXBsZXRpb25zKGNvbnRlbnQsIFByb21wdHNUeXBlLmFnZW50KTtcblx0XHRcdGNvbnN0IGxhYmVscyA9IGFjdHVhbC5tYXAoYSA9PiBhLmxhYmVsKTtcblx0XHRcdGFzc2VydC5vayhsYWJlbHMuaW5jbHVkZXMoJ1Nlc3Npb25TdGFydCcpLCAnU2Vzc2lvblN0YXJ0IHNob3VsZCBiZSBzdWdnZXN0ZWQnKTtcblx0XHRcdGFzc2VydC5vayhsYWJlbHMuaW5jbHVkZXMoJ1N0b3AnKSwgJ1N0b3Agc2hvdWxkIGJlIHN1Z2dlc3RlZCcpO1xuXHRcdFx0YXNzZXJ0Lm9rKCFsYWJlbHMuaW5jbHVkZXMoJ1Nlc3Npb25FbmQnKSwgJ1Nlc3Npb25FbmQgc2hvdWxkIG5vdCBiZSBzdWdnZXN0ZWQgd2hlbiBhbHJlYWR5IHByZXNlbnQnKTtcblx0XHRcdGFzc2VydC5vayghbGFiZWxzLmluY2x1ZGVzKCdVc2VyUHJvbXB0U3VibWl0JyksICdVc2VyUHJvbXB0U3VibWl0IHNob3VsZCBub3QgYmUgc3VnZ2VzdGVkIHdoZW4gYWxyZWFkeSBwcmVzZW50Jyk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdjdXJzb3IgYWZ0ZXIgaG9vayBldmVudCBjb2xvbiB0cmlnZ2VycyBOZXcgQ29tbWFuZCBzbmlwcGV0JywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgY29udGVudCA9IFtcblx0XHRcdFx0Jy0tLScsXG5cdFx0XHRcdCdkZXNjcmlwdGlvbjogXCJUZXN0XCInLFxuXHRcdFx0XHQnaG9va3M6Jyxcblx0XHRcdFx0JyAgU2Vzc2lvbkVuZDogfCcsXG5cdFx0XHRcdCctLS0nLFxuXHRcdFx0XS5qb2luKCdcXG4nKTtcblxuXHRcdFx0Y29uc3QgYWN0dWFsID0gYXdhaXQgZ2V0Q29tcGxldGlvbnMoY29udGVudCwgUHJvbXB0c1R5cGUuYWdlbnQpO1xuXHRcdFx0Y29uc3QgbGFiZWxzID0gYWN0dWFsLm1hcChhID0+IGEubGFiZWwpO1xuXHRcdFx0YXNzZXJ0Lm9rKGxhYmVscy5pbmNsdWRlcygnTmV3IENvbW1hbmQnKSwgJ05ldyBDb21tYW5kIHNuaXBwZXQgc2hvdWxkIGJlIHN1Z2dlc3RlZCcpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGFjdHVhbC5sZW5ndGgsIDEsICdPbmx5IG9uZSBzdWdnZXN0aW9uIHNob3VsZCBiZSByZXR1cm5lZCcpO1xuXHRcdH0pO1xuXHR9KTtcblxuXHRzdWl0ZSgnY2xhdWRlIGFnZW50IGhlYWRlciBjb21wbGV0aW9ucycsICgpID0+IHtcblx0XHQvLyBDbGF1ZGUgYWdlbnRzIGFyZSBpZGVudGlmaWVkIGJ5IHRoZWlyIFVSSSBiZWluZyB1bmRlciAuY2xhdWRlL2FnZW50cy9cblx0XHRjb25zdCBjbGF1ZGVBZ2VudFVyaSA9IFVSSS5wYXJzZSgndGVzdDovLy8uY2xhdWRlL2FnZW50cy9zZWN1cml0eS1yZXZpZXdlci5hZ2VudC5tZCcpO1xuXG5cdFx0dGVzdCgnY29tcGxldGUgYXR0cmlidXRlIG5hbWVzJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgY29udGVudCA9IFtcblx0XHRcdFx0Jy0tLScsXG5cdFx0XHRcdCduYW1lOiBzZWN1cml0eS1yZXZpZXdlcicsXG5cdFx0XHRcdCdkZXNjcmlwdGlvbjogUmV2aWV3cyBjb2RlIGZvciBzZWN1cml0eSB2dWxuZXJhYmlsaXRpZXMnLFxuXHRcdFx0XHQnfCcsXG5cdFx0XHRcdCctLS0nLFxuXHRcdFx0XHQnWW91IGFyZSBhIHNlbmlvciBzZWN1cml0eSBlbmdpbmVlci4nLFxuXHRcdFx0XS5qb2luKCdcXG4nKTtcblxuXHRcdFx0Y29uc3QgYWN0dWFsID0gYXdhaXQgZ2V0Q29tcGxldGlvbnMoY29udGVudCwgUHJvbXB0c1R5cGUuYWdlbnQsIGNsYXVkZUFnZW50VXJpKTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoYWN0dWFsLnNvcnQoc29ydEJ5TGFiZWwpLCBbXG5cdFx0XHRcdHsgbGFiZWw6ICdkaXNhbGxvd2VkVG9vbHMnLCByZXN1bHQ6ICdkaXNhbGxvd2VkVG9vbHM6ICR7MDpXcml0ZSwgRWRpdCwgQmFzaH0nIH0sXG5cdFx0XHRcdHsgbGFiZWw6ICdob29rcycsIHJlc3VsdDogJ2hvb2tzOiAkMCcgfSxcblx0XHRcdFx0eyBsYWJlbDogJ21jcFNlcnZlcnMnLCByZXN1bHQ6ICdtY3BTZXJ2ZXJzOiAkMCcgfSxcblx0XHRcdFx0eyBsYWJlbDogJ21lbW9yeScsIHJlc3VsdDogJ21lbW9yeTogJHswOnVzZXJ9JyB9LFxuXHRcdFx0XHR7IGxhYmVsOiAnbW9kZWwnLCByZXN1bHQ6ICdtb2RlbDogJHswOnNvbm5ldH0nIH0sXG5cdFx0XHRcdHsgbGFiZWw6ICdwZXJtaXNzaW9uTW9kZScsIHJlc3VsdDogJ3Blcm1pc3Npb25Nb2RlOiAkezA6ZGVmYXVsdH0nIH0sXG5cdFx0XHRcdHsgbGFiZWw6ICdza2lsbHMnLCByZXN1bHQ6ICdza2lsbHM6ICQwJyB9LFxuXHRcdFx0XHR7IGxhYmVsOiAndG9vbHMnLCByZXN1bHQ6ICd0b29sczogJHswOlJlYWQsIEVkaXQsIEJhc2h9JyB9LFxuXHRcdFx0XS5zb3J0KHNvcnRCeUxhYmVsKSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdjb21wbGV0ZSBhdHRyaWJ1dGUgbmFtZXMgZXhjbHVkZXMgYWxyZWFkeSBwcmVzZW50IG9uZXMnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCBjb250ZW50ID0gW1xuXHRcdFx0XHQnLS0tJyxcblx0XHRcdFx0J25hbWU6IHNlY3VyaXR5LXJldmlld2VyJyxcblx0XHRcdFx0J2Rlc2NyaXB0aW9uOiBSZXZpZXdzIGNvZGUgZm9yIHNlY3VyaXR5IHZ1bG5lcmFiaWxpdGllcycsXG5cdFx0XHRcdCd0b29sczogRWRpdCcsXG5cdFx0XHRcdCd8Jyxcblx0XHRcdFx0Jy0tLScsXG5cdFx0XHRcdCdZb3UgYXJlIGEgc2VuaW9yIHNlY3VyaXR5IGVuZ2luZWVyLicsXG5cdFx0XHRdLmpvaW4oJ1xcbicpO1xuXG5cdFx0XHRjb25zdCBhY3R1YWwgPSBhd2FpdCBnZXRDb21wbGV0aW9ucyhjb250ZW50LCBQcm9tcHRzVHlwZS5hZ2VudCwgY2xhdWRlQWdlbnRVcmkpO1xuXHRcdFx0Ly8gJ3Rvb2xzJyBzaG91bGQgbm90IGFwcGVhciBzaW5jZSBpdCBpcyBhbHJlYWR5IGluIHRoZSBoZWFkZXJcblx0XHRcdGNvbnN0IGxhYmVscyA9IGFjdHVhbC5tYXAoYSA9PiBhLmxhYmVsKS5zb3J0KCk7XG5cdFx0XHRhc3NlcnQub2soIWxhYmVscy5pbmNsdWRlcygndG9vbHMnKSwgJ3Rvb2xzIHNob3VsZCBub3QgYmUgc3VnZ2VzdGVkIHdoZW4gYWxyZWFkeSBwcmVzZW50Jyk7XG5cdFx0XHRhc3NlcnQub2soIWxhYmVscy5pbmNsdWRlcygnbmFtZScpLCAnbmFtZSBzaG91bGQgbm90IGJlIHN1Z2dlc3RlZCB3aGVuIGFscmVhZHkgcHJlc2VudCcpO1xuXHRcdFx0YXNzZXJ0Lm9rKCFsYWJlbHMuaW5jbHVkZXMoJ2Rlc2NyaXB0aW9uJyksICdkZXNjcmlwdGlvbiBzaG91bGQgbm90IGJlIHN1Z2dlc3RlZCB3aGVuIGFscmVhZHkgcHJlc2VudCcpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnY29tcGxldGUgbW9kZWwgYXR0cmlidXRlIHZhbHVlIHdpdGggY2xhdWRlIGVudW0gdmFsdWVzJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgY29udGVudCA9IFtcblx0XHRcdFx0Jy0tLScsXG5cdFx0XHRcdCduYW1lOiBzZWN1cml0eS1yZXZpZXdlcicsXG5cdFx0XHRcdCdkZXNjcmlwdGlvbjogUmV2aWV3cyBjb2RlIGZvciBzZWN1cml0eSB2dWxuZXJhYmlsaXRpZXMnLFxuXHRcdFx0XHQnbW9kZWw6IHwnLFxuXHRcdFx0XHQnLS0tJyxcblx0XHRcdF0uam9pbignXFxuJyk7XG5cblx0XHRcdGNvbnN0IGFjdHVhbCA9IGF3YWl0IGdldENvbXBsZXRpb25zKGNvbnRlbnQsIFByb21wdHNUeXBlLmFnZW50LCBjbGF1ZGVBZ2VudFVyaSk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGFjdHVhbC5zb3J0KHNvcnRCeUxhYmVsKSwgW1xuXHRcdFx0XHR7IGxhYmVsOiAnaGFpa3UnLCByZXN1bHQ6ICdtb2RlbDogaGFpa3UnIH0sXG5cdFx0XHRcdHsgbGFiZWw6ICdpbmhlcml0JywgcmVzdWx0OiAnbW9kZWw6IGluaGVyaXQnIH0sXG5cdFx0XHRcdHsgbGFiZWw6ICdvcHVzJywgcmVzdWx0OiAnbW9kZWw6IG9wdXMnIH0sXG5cdFx0XHRcdHsgbGFiZWw6ICdzb25uZXQnLCByZXN1bHQ6ICdtb2RlbDogc29ubmV0JyB9LFxuXHRcdFx0XS5zb3J0KHNvcnRCeUxhYmVsKSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdjb21wbGV0ZSB0b29scyB3aXRoIGNvbW1hLXNlcGFyYXRlZCB2YWx1ZXMnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCBjb250ZW50ID0gW1xuXHRcdFx0XHQnLS0tJyxcblx0XHRcdFx0J25hbWU6IHNlY3VyaXR5LXJldmlld2VyJyxcblx0XHRcdFx0J2Rlc2NyaXB0aW9uOiBSZXZpZXdzIGNvZGUgZm9yIHNlY3VyaXR5IHZ1bG5lcmFiaWxpdGllcycsXG5cdFx0XHRcdCd0b29sczogRWRpdCwgfCcsXG5cdFx0XHRcdCctLS0nLFxuXHRcdFx0XS5qb2luKCdcXG4nKTtcblxuXHRcdFx0Y29uc3QgYWN0dWFsID0gYXdhaXQgZ2V0Q29tcGxldGlvbnMoY29udGVudCwgUHJvbXB0c1R5cGUuYWdlbnQsIGNsYXVkZUFnZW50VXJpKTtcblx0XHRcdGNvbnN0IGxhYmVscyA9IGFjdHVhbC5tYXAoYSA9PiBhLmxhYmVsKS5zb3J0KCk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGxhYmVscywgW1xuXHRcdFx0XHQnQXNrVXNlclF1ZXN0aW9uJywgJ0Jhc2gnLCAnR2xvYicsICdHcmVwJyxcblx0XHRcdFx0J0xTUCcsICdNQ1BTZWFyY2gnLCAnTm90ZWJvb2tFZGl0JywgJ1JlYWQnLCAnU2tpbGwnLFxuXHRcdFx0XHQnVGFzaycsICdXZWJGZXRjaCcsICdXZWJTZWFyY2gnLCAnV3JpdGUnXG5cdFx0XHRdLnNvcnQoKSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdjb21wbGV0ZSB0b29scyBpbnNpZGUgYXJyYXkgc3ludGF4JywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgY29udGVudCA9IFtcblx0XHRcdFx0Jy0tLScsXG5cdFx0XHRcdCduYW1lOiBzZWN1cml0eS1yZXZpZXdlcicsXG5cdFx0XHRcdCdkZXNjcmlwdGlvbjogUmV2aWV3cyBjb2RlIGZvciBzZWN1cml0eSB2dWxuZXJhYmlsaXRpZXMnLFxuXHRcdFx0XHQndG9vbHM6IFt8XScsXG5cdFx0XHRcdCctLS0nLFxuXHRcdFx0XS5qb2luKCdcXG4nKTtcblxuXHRcdFx0Y29uc3QgYWN0dWFsID0gYXdhaXQgZ2V0Q29tcGxldGlvbnMoY29udGVudCwgUHJvbXB0c1R5cGUuYWdlbnQsIGNsYXVkZUFnZW50VXJpKTtcblx0XHRcdGNvbnN0IGxhYmVscyA9IGFjdHVhbC5tYXAoYSA9PiBhLmxhYmVsKS5zb3J0KCk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGxhYmVscywgW1xuXHRcdFx0XHQnQXNrVXNlclF1ZXN0aW9uJywgJ0Jhc2gnLCAnRWRpdCcsICdHbG9iJywgJ0dyZXAnLFxuXHRcdFx0XHQnTFNQJywgJ01DUFNlYXJjaCcsICdOb3RlYm9va0VkaXQnLCAnUmVhZCcsICdTa2lsbCcsXG5cdFx0XHRcdCdUYXNrJywgJ1dlYkZldGNoJywgJ1dlYlNlYXJjaCcsICdXcml0ZSdcblx0XHRcdF0uc29ydCgpKTtcblx0XHRcdC8vIEFycmF5IGl0ZW1zIHdpdGhvdXQgcXVvdGVzIHNob3VsZCB1c2UgdGhlIG5hbWUgZGlyZWN0bHlcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoYWN0dWFsLmZpbmQoYSA9PiBhLmxhYmVsID09PSAnRWRpdCcpPy5yZXN1bHQsIGB0b29sczogW0VkaXRdYCk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdjb21wbGV0ZSB0b29scyBpbnNpZGUgYXJyYXkgd2l0aCBleGlzdGluZyBlbnRyaWVzJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgY29udGVudCA9IFtcblx0XHRcdFx0Jy0tLScsXG5cdFx0XHRcdCduYW1lOiBzZWN1cml0eS1yZXZpZXdlcicsXG5cdFx0XHRcdCdkZXNjcmlwdGlvbjogUmV2aWV3cyBjb2RlIGZvciBzZWN1cml0eSB2dWxuZXJhYmlsaXRpZXMnLFxuXHRcdFx0XHRgdG9vbHM6IFtFZGl0LCB8XWAsXG5cdFx0XHRcdCctLS0nLFxuXHRcdFx0XS5qb2luKCdcXG4nKTtcblxuXHRcdFx0Y29uc3QgYWN0dWFsID0gYXdhaXQgZ2V0Q29tcGxldGlvbnMoY29udGVudCwgUHJvbXB0c1R5cGUuYWdlbnQsIGNsYXVkZUFnZW50VXJpKTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoYWN0dWFsLmZpbmQoYSA9PiBhLmxhYmVsID09PSAnUmVhZCcpPy5yZXN1bHQsIGB0b29sczogW0VkaXQsIFJlYWRdYCk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGFjdHVhbC5maW5kKGEgPT4gYS5sYWJlbCA9PT0gJ0Jhc2gnKT8ucmVzdWx0LCBgdG9vbHM6IFtFZGl0LCBCYXNoXWApO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnY29tcGxldGUgZGlzYWxsb3dlZFRvb2xzIHdpdGggY29tbWEtc2VwYXJhdGVkIHZhbHVlcycsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IGNvbnRlbnQgPSBbXG5cdFx0XHRcdCctLS0nLFxuXHRcdFx0XHQnbmFtZTogc2VjdXJpdHktcmV2aWV3ZXInLFxuXHRcdFx0XHQnZGVzY3JpcHRpb246IFJldmlld3MgY29kZSBmb3Igc2VjdXJpdHkgdnVsbmVyYWJpbGl0aWVzJyxcblx0XHRcdFx0J2Rpc2FsbG93ZWRUb29sczogfCcsXG5cdFx0XHRcdCctLS0nLFxuXHRcdFx0XS5qb2luKCdcXG4nKTtcblxuXHRcdFx0Y29uc3QgYWN0dWFsID0gYXdhaXQgZ2V0Q29tcGxldGlvbnMoY29udGVudCwgUHJvbXB0c1R5cGUuYWdlbnQsIGNsYXVkZUFnZW50VXJpKTtcblx0XHRcdGNvbnN0IGxhYmVscyA9IGFjdHVhbC5tYXAoYSA9PiBhLmxhYmVsKS5zb3J0KCk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGxhYmVscywgW1xuXHRcdFx0XHQnQXNrVXNlclF1ZXN0aW9uJywgJ0Jhc2gnLCAnRWRpdCcsICdHbG9iJywgJ0dyZXAnLFxuXHRcdFx0XHQnTFNQJywgJ01DUFNlYXJjaCcsICdOb3RlYm9va0VkaXQnLCAnUmVhZCcsICdTa2lsbCcsXG5cdFx0XHRcdCdUYXNrJywgJ1dlYkZldGNoJywgJ1dlYlNlYXJjaCcsICdXcml0ZSdcblx0XHRcdF0uc29ydCgpKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2NvbXBsZXRlIGRpc2FsbG93ZWRUb29scyBpbnNpZGUgYXJyYXkgc3ludGF4JywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgY29udGVudCA9IFtcblx0XHRcdFx0Jy0tLScsXG5cdFx0XHRcdCduYW1lOiBzZWN1cml0eS1yZXZpZXdlcicsXG5cdFx0XHRcdCdkZXNjcmlwdGlvbjogUmV2aWV3cyBjb2RlIGZvciBzZWN1cml0eSB2dWxuZXJhYmlsaXRpZXMnLFxuXHRcdFx0XHQnZGlzYWxsb3dlZFRvb2xzOiBbQmFzaCwgfF0nLFxuXHRcdFx0XHQnLS0tJyxcblx0XHRcdF0uam9pbignXFxuJyk7XG5cblx0XHRcdGNvbnN0IGFjdHVhbCA9IGF3YWl0IGdldENvbXBsZXRpb25zKGNvbnRlbnQsIFByb21wdHNUeXBlLmFnZW50LCBjbGF1ZGVBZ2VudFVyaSk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGFjdHVhbC5maW5kKGEgPT4gYS5sYWJlbCA9PT0gJ1dyaXRlJyk/LnJlc3VsdCwgYGRpc2FsbG93ZWRUb29sczogW0Jhc2gsIFdyaXRlXWApO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChhY3R1YWwuZmluZChhID0+IGEubGFiZWwgPT09ICdFZGl0Jyk/LnJlc3VsdCwgYGRpc2FsbG93ZWRUb29sczogW0Jhc2gsIEVkaXRdYCk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHN1aXRlKCdwcm9tcHQgaGVhZGVyIGNvbXBsZXRpb25zJywgKCkgPT4ge1xuXHRcdHRlc3QoJ2NvbXBsZXRlIG1vZGVsIGF0dHJpYnV0ZSBuYW1lJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgY29udGVudCA9IFtcblx0XHRcdFx0Jy0tLScsXG5cdFx0XHRcdCdkZXNjcmlwdGlvbjogXCJUZXN0XCInLFxuXHRcdFx0XHQnfCcsXG5cdFx0XHRcdCctLS0nLFxuXHRcdFx0XS5qb2luKCdcXG4nKTtcblxuXHRcdFx0Y29uc3QgYWN0dWFsID0gYXdhaXQgZ2V0Q29tcGxldGlvbnMoY29udGVudCwgUHJvbXB0c1R5cGUucHJvbXB0KTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoYWN0dWFsLnNvcnQoc29ydEJ5TGFiZWwpLCBbXG5cdFx0XHRcdHsgbGFiZWw6ICdhZ2VudCcsIHJlc3VsdDogJ2FnZW50OiAkezA6YXNrfScgfSxcblx0XHRcdFx0eyBsYWJlbDogJ2FyZ3VtZW50LWhpbnQnLCByZXN1bHQ6ICdhcmd1bWVudC1oaW50OiAkMCcgfSxcblx0XHRcdFx0eyBsYWJlbDogJ21vZGVsJywgcmVzdWx0OiAnbW9kZWw6ICR7MDpNQUUgNCAob2xhbWEpfScgfSxcblx0XHRcdFx0eyBsYWJlbDogJ25hbWUnLCByZXN1bHQ6ICduYW1lOiAkMCcgfSxcblx0XHRcdFx0eyBsYWJlbDogJ3Rvb2xzJywgcmVzdWx0OiAndG9vbHM6ICR7MDpbXX0nIH0sXG5cdFx0XHRdLnNvcnQoc29ydEJ5TGFiZWwpKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2NvbXBsZXRlIG1vZGVsIGF0dHJpYnV0ZSB2YWx1ZSBpbiBwcm9tcHQnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCBjb250ZW50ID0gW1xuXHRcdFx0XHQnLS0tJyxcblx0XHRcdFx0J2Rlc2NyaXB0aW9uOiBcIlRlc3RcIicsXG5cdFx0XHRcdCdtb2RlbDogfCcsXG5cdFx0XHRcdCctLS0nLFxuXHRcdFx0XS5qb2luKCdcXG4nKTtcblxuXHRcdFx0Y29uc3QgYWN0dWFsID0gYXdhaXQgZ2V0Q29tcGxldGlvbnMoY29udGVudCwgUHJvbXB0c1R5cGUucHJvbXB0KTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoYWN0dWFsLnNvcnQoc29ydEJ5TGFiZWwpLCBbXG5cdFx0XHRcdHsgbGFiZWw6ICdNQUUgNCAob2xhbWEpJywgcmVzdWx0OiAnbW9kZWw6IE1BRSA0IChvbGFtYSknIH0sXG5cdFx0XHRcdHsgbGFiZWw6ICdNQUUgNC4xIChjb3BpbG90KScsIHJlc3VsdDogJ21vZGVsOiBNQUUgNC4xIChjb3BpbG90KScgfSxcblx0XHRcdFx0eyBsYWJlbDogJ0dQVCA0IChvcGVuYWkpJywgcmVzdWx0OiAnbW9kZWw6IEdQVCA0IChvcGVuYWkpJyB9LFxuXHRcdFx0XS5zb3J0KHNvcnRCeUxhYmVsKSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdleGNsdWRlIG1vZGVscyB3aXRoIHRhcmdldENoYXRTZXNzaW9uVHlwZSBmcm9tIHByb21wdCBtb2RlbCBjb21wbGV0aW9ucycsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IGNvbnRlbnQgPSBbXG5cdFx0XHRcdCctLS0nLFxuXHRcdFx0XHQnZGVzY3JpcHRpb246IFwiVGVzdFwiJyxcblx0XHRcdFx0J21vZGVsOiB8Jyxcblx0XHRcdFx0Jy0tLScsXG5cdFx0XHRdLmpvaW4oJ1xcbicpO1xuXG5cdFx0XHRjb25zdCBhY3R1YWwgPSBhd2FpdCBnZXRDb21wbGV0aW9ucyhjb250ZW50LCBQcm9tcHRzVHlwZS5wcm9tcHQpO1xuXHRcdFx0Y29uc3QgbGFiZWxzID0gYWN0dWFsLm1hcChhID0+IGEubGFiZWwpO1xuXHRcdFx0YXNzZXJ0Lm9rKCFsYWJlbHMuaW5jbHVkZXMoJ0JHIEFnZW50IE1vZGVsIChjb3BpbG90KScpLCAnTW9kZWxzIHdpdGggdGFyZ2V0Q2hhdFNlc3Npb25UeXBlIHNob3VsZCBiZSBleGNsdWRlZCBmcm9tIHByb21wdCBtb2RlbCBjb21wbGV0aW9ucycpO1xuXHRcdH0pO1xuXHR9KTtcbn0pO1xuIl0sCiAgIm1hcHBpbmdzIjogIkFBS0EsT0FBTyxZQUFZO0FBQ25CLFNBQVMseUJBQXlCO0FBQ2xDLFNBQVMsK0NBQStDO0FBQ3hELFNBQVMsZ0JBQWdCO0FBQ3pCLFNBQTRCLDZCQUE2QjtBQUN6RCxTQUFTLHlCQUF5QjtBQUNsQyxTQUFTLGdDQUFnQztBQUN6QyxTQUFTLDJCQUEyQjtBQUVwQyxTQUFTLHFDQUFxQztBQUM5QyxTQUFTLGlDQUFpQztBQUMxQyxTQUFTLG1CQUFtQix5QkFBeUI7QUFDckQsU0FBUyw0QkFBdUMsc0JBQXNCO0FBQ3RFLFNBQXFDLDhCQUE4QjtBQUNuRSxTQUFTLHdCQUF3QjtBQUNqQyxTQUFTLGtDQUFrQztBQUMzQyxTQUF1QixpQkFBaUIsc0JBQXNCO0FBQzlELFNBQVMsNkJBQTZCLGFBQWEsY0FBYztBQUNqRSxTQUFTLHVCQUF1QjtBQUNoQyxTQUFTLFdBQVc7QUFDcEIsU0FBUyx3QkFBd0I7QUFFakMsU0FBUyw4QkFB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
