import assert from "assert";
import { CancellationToken } from "../../../../../../../base/common/cancellation.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../../../../base/test/common/utils.js";
import { Position } from "../../../../../../../editor/common/core/position.js";
import { ContextKeyService } from "../../../../../../../platform/contextkey/browser/contextKeyService.js";
import { TestConfigurationService } from "../../../../../../../platform/configuration/test/common/testConfigurationService.js";
import { ExtensionIdentifier } from "../../../../../../../platform/extensions/common/extensions.js";
import { workbenchInstantiationService } from "../../../../../../test/browser/workbenchTestServices.js";
import { LanguageModelToolsService } from "../../../../browser/tools/languageModelToolsService.js";
import { ChatMode, CustomChatMode, IChatModeService } from "../../../../common/chatModes.js";
import { ChatAgentLocation, ChatConfiguration } from "../../../../common/constants.js";
import { ILanguageModelToolsService, ToolDataSource } from "../../../../common/tools/languageModelToolsService.js";
import { ILanguageModelChatMetadata, ILanguageModelsService } from "../../../../common/languageModels.js";
import { PromptHoverProvider } from "../../../../common/promptSyntax/languageProviders/promptHovers.js";
import { IPromptsService, PromptsStorage } from "../../../../common/promptSyntax/service/promptsService.js";
import { getLanguageIdForPromptsType, PromptsType, Target } from "../../../../common/promptSyntax/promptTypes.js";
import { MockChatModeService } from "../../../common/mockChatModeService.js";
import { createTextModel } from "../../../../../../../editor/test/common/testTextModel.js";
import { URI } from "../../../../../../../base/common/uri.js";
import { PromptFileParser } from "../../../../common/promptSyntax/promptFileParser.js";
import { MarkdownString } from "../../../../../../../base/common/htmlContent.js";
import { getPromptFileExtension } from "../../../../common/promptSyntax/config/promptFileLocations.js";
suite("PromptHoverProvider", () => {
  const disposables = ensureNoDisposablesAreLeakedInTestSuite();
  let instaService;
  let hoverProvider;
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
      // Claude model equivalents
      { id: "claude-sonnet-4.5", name: "Claude Sonnet 4.5", vendor: "copilot", version: "1.0", family: "claude", extension: new ExtensionIdentifier("a.b"), isUserSelectable: true, maxInputTokens: 2e5, maxOutputTokens: 8192, capabilities: { agentMode: true, toolCalling: true }, isDefaultForLocation: {} },
      { id: "claude-opus-4.6", name: "Claude Opus 4.6", vendor: "copilot", version: "1.0", family: "claude", extension: new ExtensionIdentifier("a.b"), isUserSelectable: true, maxInputTokens: 2e5, maxOutputTokens: 8192, capabilities: { agentMode: true, toolCalling: true }, isDefaultForLocation: {} },
      { id: "claude-haiku-4.5", name: "Claude Haiku 4.5", vendor: "copilot", version: "1.0", family: "claude", extension: new ExtensionIdentifier("a.b"), isUserSelectable: true, maxInputTokens: 2e5, maxOutputTokens: 8192, capabilities: { agentMode: true, toolCalling: true }, isDefaultForLocation: {} }
    ];
    instaService.stub(ILanguageModelsService, {
      getLanguageModelIds() {
        return testModels.map((m) => m.id);
      },
      lookupLanguageModelByQualifiedName(qualifiedName) {
        for (const metadata of testModels) {
          if (ILanguageModelChatMetadata.matchesQualifiedName(qualifiedName, metadata)) {
            return { metadata, identifier: metadata.id };
          }
        }
        return void 0;
      }
    });
    const customChatMode = new CustomChatMode({
      id: "beast-mode",
      uri: URI.parse("myFs://test/test/chatmode.md"),
      name: "BeastMode",
      agentInstructions: { content: "Beast mode instructions", toolReferences: [] },
      source: { storage: PromptsStorage.local },
      target: Target.Undefined,
      visibility: { userInvocable: true, agentInvocable: true },
      enabled: true
    });
    instaService.stub(IChatModeService, new MockChatModeService({ builtin: [ChatMode.Agent, ChatMode.Ask, ChatMode.Edit], custom: [customChatMode] }));
    const parser = new PromptFileParser();
    instaService.stub(IPromptsService, {
      getParsedPromptFile(model) {
        return parser.parse(model.uri, model.getValue());
      }
    });
    hoverProvider = instaService.createInstance(PromptHoverProvider);
  });
  async function getHover(content, line, column, promptType, options) {
    const languageId = getLanguageIdForPromptsType(promptType);
    const ext = getPromptFileExtension(promptType);
    const path = options?.claudeAgent ? `/.claude/agents/test${ext}` : `/test${ext}`;
    const uri = URI.parse("test://" + path);
    const model = disposables.add(createTextModel(content, languageId, void 0, uri));
    const position = new Position(line, column);
    const hover = await hoverProvider.provideHover(model, position, CancellationToken.None);
    if (!hover || hover.contents.length === 0) {
      return void 0;
    }
    const firstContent = hover.contents[0];
    if (firstContent instanceof MarkdownString) {
      return firstContent.value;
    }
    return void 0;
  }
  suite("agent hovers", () => {
    test("hover on target attribute shows description", async () => {
      const content = [
        "---",
        'description: "Test"',
        "target: vscode",
        "---"
      ].join("\n");
      const hover = await getHover(content, 3, 1, PromptsType.agent);
      assert.strictEqual(hover, "The target to which the header attributes like tools apply to. Possible values are `github-copilot` and `vscode`.");
    });
    test("hover on model attribute with github-copilot target shows note", async () => {
      const content = [
        "---",
        'description: "Test"',
        "target: github-copilot",
        "model: MAE 4",
        "---"
      ].join("\n");
      const hover = await getHover(content, 4, 1, PromptsType.agent);
      const expected = [
        "Specify the model that runs this custom agent. Can also be a list of models. The first available model will be used.",
        "",
        "Note: This attribute is not used when target is github-copilot."
      ].join("\n");
      assert.strictEqual(hover, expected);
    });
    test("hover on model attribute with vscode target shows model info", async () => {
      const content = [
        "---",
        'description: "Test"',
        "target: vscode",
        "model: MAE 4 (olama)",
        "---"
      ].join("\n");
      const hover = await getHover(content, 4, 1, PromptsType.agent);
      const expected = [
        "Specify the model that runs this custom agent. Can also be a list of models. The first available model will be used.",
        "",
        "- Name: MAE 4",
        "- Family: mae",
        "- Vendor: olama"
      ].join("\n");
      assert.strictEqual(hover, expected);
    });
    test("hover on handoffs attribute with github-copilot target shows note", async () => {
      const content = [
        "---",
        'description: "Test"',
        "target: github-copilot",
        "handoffs:",
        "  - label: Test",
        "    agent: Default",
        "    prompt: Test",
        "---"
      ].join("\n");
      const hover = await getHover(content, 4, 1, PromptsType.agent);
      const expected = [
        "Possible handoff actions when the agent has completed its task.",
        "",
        "Note: This attribute is not used in GitHub Copilot or Claude targets."
      ].join("\n");
      assert.strictEqual(hover, expected);
    });
    test("hover on handoffs attribute with vscode target shows description", async () => {
      const content = [
        "---",
        'description: "Test"',
        "target: vscode",
        "handoffs:",
        "  - label: Test",
        "    agent: Default",
        "    prompt: Test",
        "---"
      ].join("\n");
      const hover = await getHover(content, 4, 1, PromptsType.agent);
      assert.strictEqual(hover, "Possible handoff actions when the agent has completed its task.");
    });
    test("hover on github-copilot tool shows simple description", async () => {
      const content = [
        "---",
        'description: "Test"',
        "target: github-copilot",
        `tools: ['execute', 'read']`,
        "---"
      ].join("\n");
      const hoverShell = await getHover(content, 4, 10, PromptsType.agent);
      assert.strictEqual(hoverShell, "ToolSet: execute\n\n\nExecute code and applications on your machine");
      const hoverEdit = await getHover(content, 4, 20, PromptsType.agent);
      assert.strictEqual(hoverEdit, "ToolSet: read\n\n\nRead files in your workspace");
    });
    test("hover on github-copilot tool with target undefined", async () => {
      const content = [
        "---",
        'name: "Test"',
        'description: "Test"',
        `tools: ['shell', 'read']`,
        "---"
      ].join("\n");
      const hoverShell = await getHover(content, 4, 10, PromptsType.agent);
      assert.strictEqual(hoverShell, "ToolSet: execute\n\n\nExecute code and applications on your machine");
      const hoverEdit = await getHover(content, 4, 20, PromptsType.agent);
      assert.strictEqual(hoverEdit, "ToolSet: read\n\n\nRead files in your workspace");
    });
    test("hover on vscode tool shows detailed description", async () => {
      const content = [
        "---",
        'description: "Test"',
        "target: vscode",
        `tools: ['tool1', 'tool2']`,
        "---"
      ].join("\n");
      const hover = await getHover(content, 4, 10, PromptsType.agent);
      assert.strictEqual(hover, "Test Tool 1");
    });
    test("hover on model attribute with vscode target and model array", async () => {
      const content = [
        "---",
        'description: "Test"',
        "target: vscode",
        `model: ['MAE 4 (olama)', 'MAE 4.1 (copilot)']`,
        "---"
      ].join("\n");
      const hover = await getHover(content, 4, 10, PromptsType.agent);
      const expected = [
        "Specify the model that runs this custom agent. Can also be a list of models. The first available model will be used.",
        "",
        "- Name: MAE 4",
        "- Family: mae",
        "- Vendor: olama"
      ].join("\n");
      assert.strictEqual(hover, expected);
    });
    test("hover on second model in model array", async () => {
      const content = [
        "---",
        'description: "Test"',
        "target: vscode",
        `model: ['MAE 4 (olama)', 'MAE 4.1 (copilot)']`,
        "---"
      ].join("\n");
      const hover = await getHover(content, 4, 30, PromptsType.agent);
      const expected = [
        "Specify the model that runs this custom agent. Can also be a list of models. The first available model will be used.",
        "",
        "- Name: MAE 4.1",
        "- Family: mae",
        "- Vendor: copilot"
      ].join("\n");
      assert.strictEqual(hover, expected);
    });
    test("hover on description attribute", async () => {
      const content = [
        "---",
        'description: "Test agent"',
        "target: vscode",
        "---"
      ].join("\n");
      const hover = await getHover(content, 2, 1, PromptsType.agent);
      assert.strictEqual(hover, "The description of the custom agent, what it does and when to use it.");
    });
    test("hover on argument-hint attribute", async () => {
      const content = [
        "---",
        'description: "Test"',
        'argument-hint: "test hint"',
        "---"
      ].join("\n");
      const hover = await getHover(content, 3, 1, PromptsType.agent);
      assert.strictEqual(hover, "The argument-hint describes what inputs the custom agent expects or supports.");
    });
    test("hover on name attribute", async () => {
      const content = [
        "---",
        'name: "My Agent"',
        'description: "Test agent"',
        "target: vscode",
        "---"
      ].join("\n");
      const hover = await getHover(content, 2, 1, PromptsType.agent);
      assert.strictEqual(hover, "The name of the agent as shown in the UI.");
    });
    test("hover on infer attribute shows description", async () => {
      const content = [
        "---",
        'name: "Test Agent"',
        'description: "Test agent"',
        "infer: true",
        "---"
      ].join("\n");
      const hover = await getHover(content, 4, 1, PromptsType.agent);
      assert.strictEqual(hover, "Controls visibility of the agent.\n\nDeprecated: Use `user-invocable` and `disable-model-invocation` instead.");
    });
    test("hover on agents attribute shows description", async () => {
      const content = [
        "---",
        'name: "Test Agent"',
        'description: "Test agent"',
        'agents: ["*"]',
        "---"
      ].join("\n");
      const hover = await getHover(content, 4, 1, PromptsType.agent);
      assert.strictEqual(hover, "One or more agents that this agent can use as subagents. Use '*' to specify all available agents.");
    });
    test("hover on user-invocable attribute shows description", async () => {
      const content = [
        "---",
        'name: "Test Agent"',
        'description: "Test agent"',
        "user-invocable: true",
        "---"
      ].join("\n");
      const hover = await getHover(content, 4, 1, PromptsType.agent);
      assert.strictEqual(hover, "Whether the agent can be selected and invoked by users in the UI.");
    });
    test("hover on disable-model-invocation attribute shows description", async () => {
      const content = [
        "---",
        'name: "Test Agent"',
        'description: "Test agent"',
        "disable-model-invocation: true",
        "---"
      ].join("\n");
      const hover = await getHover(content, 4, 1, PromptsType.agent);
      assert.strictEqual(hover, "If true, prevents the agent from being invoked as a subagent.");
    });
  });
  suite("prompt hovers", () => {
    test("hover on model attribute shows model info", async () => {
      const content = [
        "---",
        'description: "Test"',
        "model: MAE 4 (olama)",
        "---"
      ].join("\n");
      const hover = await getHover(content, 3, 1, PromptsType.prompt);
      const expected = [
        "The model to use in this prompt. Can also be a list of models. The first available model will be used.",
        "",
        "- Name: MAE 4",
        "- Family: mae",
        "- Vendor: olama"
      ].join("\n");
      assert.strictEqual(hover, expected);
    });
    test("hover on tools attribute shows tool description", async () => {
      const content = [
        "---",
        'description: "Test"',
        `tools: ['tool1']`,
        "---"
      ].join("\n");
      const hover = await getHover(content, 3, 10, PromptsType.prompt);
      assert.strictEqual(hover, "Test Tool 1");
    });
    test("hover on agent attribute shows agent info", async () => {
      const content = [
        "---",
        'description: "Test"',
        "agent: BeastMode",
        "---"
      ].join("\n");
      const hover = await getHover(content, 3, 1, PromptsType.prompt);
      const expected = [
        "The agent to use when running this prompt.",
        "",
        "**Built-in agents:**",
        "- `agent`: Describe what to build",
        "- `ask`: Explore and understand your code",
        "- `edit`: Edit or refactor selected code",
        "",
        "**Custom agents:**",
        "- `BeastMode`: Custom agent"
      ].join("\n");
      assert.strictEqual(hover, expected);
    });
    test("hover on name attribute", async () => {
      const content = [
        "---",
        'name: "My Prompt"',
        'description: "Test prompt"',
        "---"
      ].join("\n");
      const hover = await getHover(content, 2, 1, PromptsType.prompt);
      assert.strictEqual(hover, "The name of the prompt. This is also the name of the slash command that will run this prompt.");
    });
  });
  suite("instructions hovers", () => {
    test("hover on description attribute", async () => {
      const content = [
        "---",
        'description: "Test instruction"',
        'applyTo: "**/*.ts"',
        "---"
      ].join("\n");
      const hover = await getHover(content, 2, 1, PromptsType.instructions);
      assert.strictEqual(hover, "The description of the instruction file. It can be used to provide additional context or information about the instructions and is passed to the language model as part of the prompt.");
    });
    test("hover on applyTo attribute", async () => {
      const content = [
        "---",
        'description: "Test"',
        'applyTo: "**/*.ts"',
        "---"
      ].join("\n");
      const hover = await getHover(content, 3, 1, PromptsType.instructions);
      const expected = [
        "One or more glob pattern (separated by comma) that describe for which files the instructions apply to. Based on these patterns, the file is automatically included in the prompt, when the context contains a file that matches one or more of these patterns. Use `**` when you want this file to always be added.",
        "Example: `**/*.ts`, `**/*.js`, `client/**`"
      ].join("\n");
      assert.strictEqual(hover, expected);
    });
    test("hover on name attribute", async () => {
      const content = [
        "---",
        'name: "My Instructions"',
        'description: "Test instruction"',
        'applyTo: "**/*.ts"',
        "---"
      ].join("\n");
      const hover = await getHover(content, 2, 1, PromptsType.instructions);
      assert.strictEqual(hover, "The name of the instruction file as shown in the UI. If not set, the name is derived from the file name.");
    });
  });
  suite("skill hovers", () => {
    test("hover on name attribute", async () => {
      const content = [
        "---",
        'name: "My Skill"',
        'description: "Test skill"',
        "---"
      ].join("\n");
      const hover = await getHover(content, 2, 1, PromptsType.skill);
      assert.strictEqual(hover, "The name of the skill.");
    });
    test("hover on description attribute", async () => {
      const content = [
        "---",
        'name: "Test Skill"',
        'description: "Test skill description"',
        "---"
      ].join("\n");
      const hover = await getHover(content, 3, 1, PromptsType.skill);
      assert.strictEqual(hover, "The description of the skill. The description is added to every request and will be used by the agent to decide when to load the skill.");
    });
    test("hover on file attribute", async () => {
      const content = [
        "---",
        'name: "Test Skill"',
        'description: "Test skill"',
        'file: "SKILL.md"',
        "---"
      ].join("\n");
      const hover = await getHover(content, 4, 1, PromptsType.skill);
      assert.strictEqual(hover, void 0);
    });
  });
  suite("claude agent hovers", () => {
    async function getClaudeHover(content, line, column) {
      return getHover(content, line, column, PromptsType.agent, { claudeAgent: true });
    }
    test("hover on name attribute shows Claude description", async () => {
      const content = [
        "---",
        "name: security-reviewer",
        "description: Reviews code for security vulnerabilities",
        "---"
      ].join("\n");
      const hover = await getClaudeHover(content, 2, 1);
      assert.strictEqual(hover, "Unique identifier using lowercase letters and hyphens (required)");
    });
    test("hover on description attribute shows Claude description", async () => {
      const content = [
        "---",
        "name: security-reviewer",
        "description: Reviews code for security vulnerabilities",
        "---"
      ].join("\n");
      const hover = await getClaudeHover(content, 3, 1);
      assert.strictEqual(hover, "When to delegate to this subagent (required)");
    });
    test("hover on tools attribute shows Claude description", async () => {
      const content = [
        "---",
        "name: security-reviewer",
        "description: Reviews code for security vulnerabilities",
        "tools: Edit, Grep, AskUserQuestion, WebFetch",
        "---"
      ].join("\n");
      const hover = await getClaudeHover(content, 4, 1);
      assert.strictEqual(hover, "Array of tools the subagent can use. Inherits all tools if omitted");
    });
    test("hover on individual Claude tool shows tool description", async () => {
      const content = [
        "---",
        "name: security-reviewer",
        "description: Reviews code",
        `tools: ['Edit', 'Grep', 'WebFetch']`,
        "---"
      ].join("\n");
      const hoverEdit = await getClaudeHover(content, 4, 10);
      assert.strictEqual(hoverEdit, "Make targeted file edits");
      const hoverGrep = await getClaudeHover(content, 4, 17);
      assert.strictEqual(hoverGrep, "Search file contents with regex");
      const hoverFetch = await getClaudeHover(content, 4, 27);
      assert.strictEqual(hoverFetch, "Fetch URL content");
    });
    test("hover on model attribute shows Claude description", async () => {
      const content = [
        "---",
        "name: security-reviewer",
        "description: Reviews code",
        "model: opus",
        "---"
      ].join("\n");
      const hover = await getClaudeHover(content, 4, 1);
      const expected = [
        "Model to use: sonnet, opus, haiku, or inherit. Defaults to inherit.",
        "",
        "Claude model `opus` maps to the following model:",
        "",
        "- Name: Claude Opus 4.6",
        "- Family: claude",
        "- Vendor: copilot"
      ].join("\n");
      assert.strictEqual(hover, expected);
    });
    test("hover on model attribute with sonnet value", async () => {
      const content = [
        "---",
        "name: test-agent",
        "description: Test",
        "model: sonnet",
        "---"
      ].join("\n");
      const hover = await getClaudeHover(content, 4, 1);
      const expected = [
        "Model to use: sonnet, opus, haiku, or inherit. Defaults to inherit.",
        "",
        "Claude model `sonnet` maps to the following model:",
        "",
        "- Name: Claude Sonnet 4.5",
        "- Family: claude",
        "- Vendor: copilot"
      ].join("\n");
      assert.strictEqual(hover, expected);
    });
    test("hover on model attribute with haiku value", async () => {
      const content = [
        "---",
        "name: test-agent",
        "description: Test",
        "model: haiku",
        "---"
      ].join("\n");
      const hover = await getClaudeHover(content, 4, 1);
      const expected = [
        "Model to use: sonnet, opus, haiku, or inherit. Defaults to inherit.",
        "",
        "Claude model `haiku` maps to the following model:",
        "",
        "- Name: Claude Haiku 4.5",
        "- Family: claude",
        "- Vendor: copilot"
      ].join("\n");
      assert.strictEqual(hover, expected);
    });
    test("hover on model attribute with inherit value", async () => {
      const content = [
        "---",
        "name: test-agent",
        "description: Test",
        "model: inherit",
        "---"
      ].join("\n");
      const hover = await getClaudeHover(content, 4, 1);
      const expected = [
        "Model to use: sonnet, opus, haiku, or inherit. Defaults to inherit.",
        "",
        "Inherit model from parent agent or prompt"
      ].join("\n");
      assert.strictEqual(hover, expected);
    });
    test("hover on disallowedTools attribute shows Claude description", async () => {
      const content = [
        "---",
        "name: read-only-agent",
        "description: Read-only analysis agent",
        `disallowedTools: ['Write', 'Edit', 'Bash']`,
        "---"
      ].join("\n");
      const hover = await getClaudeHover(content, 4, 1);
      assert.strictEqual(hover, "Tools to deny, removed from inherited or specified list");
    });
    test("hover on individual disallowedTools value shows tool description", async () => {
      const content = [
        "---",
        "name: read-only-agent",
        "description: Read-only",
        `disallowedTools: ['Bash', 'Write']`,
        "---"
      ].join("\n");
      const hoverBash = await getClaudeHover(content, 4, 20);
      assert.strictEqual(hoverBash, "Execute shell commands");
      const hoverWrite = await getClaudeHover(content, 4, 28);
      assert.strictEqual(hoverWrite, "Create/overwrite files");
    });
    test("hover on permissionMode attribute shows Claude description", async () => {
      const content = [
        "---",
        "name: test-agent",
        "description: Test",
        "permissionMode: acceptEdits",
        "---"
      ].join("\n");
      const hover = await getClaudeHover(content, 4, 1);
      assert.strictEqual(hover, "Permission mode: default, acceptEdits, dontAsk, bypassPermissions, or plan.");
    });
    test("hover on memory attribute shows Claude description", async () => {
      const content = [
        "---",
        "name: test-agent",
        "description: Test",
        "memory: project",
        "---"
      ].join("\n");
      const hover = await getClaudeHover(content, 4, 1);
      assert.strictEqual(hover, "Persistent memory scope: user, project, or local. Enables cross-session learning.");
    });
    test("hover on skills attribute shows Claude description", async () => {
      const content = [
        "---",
        "name: test-agent",
        "description: Test",
        'skills: ["code-review"]',
        "---"
      ].join("\n");
      const hover = await getClaudeHover(content, 4, 1);
      assert.strictEqual(hover, "Skills to load into the subagent's context at startup.");
    });
    test("hover on hooks attribute shows Claude description", async () => {
      const content = [
        "---",
        "name: test-agent",
        "description: Test",
        "hooks: {}",
        "---"
      ].join("\n");
      const hover = await getClaudeHover(content, 4, 1);
      assert.strictEqual(hover, "Lifecycle hooks scoped to this subagent.");
    });
    test("hover on handoffs attribute in Claude agent shows not-used note", async () => {
      const content = [
        "---",
        "name: test-agent",
        "description: Test",
        "handoffs:",
        "  - label: Test",
        "    agent: Default",
        "    prompt: Test",
        "---"
      ].join("\n");
      const hover = await getClaudeHover(content, 4, 1);
      assert.strictEqual(hover, void 0);
    });
    test("full example: hover on each attribute of a Claude agent", async () => {
      const content = [
        "---",
        "name: security-reviewer",
        "description: Reviews code for security vulnerabilities",
        `tools: ['Edit', 'Grep', 'AskUserQuestion', 'WebFetch']`,
        "model: opus",
        "---",
        "You are a senior security engineer."
      ].join("\n");
      const nameHover = await getClaudeHover(content, 2, 1);
      assert.strictEqual(nameHover, "Unique identifier using lowercase letters and hyphens (required)");
      const descHover = await getClaudeHover(content, 3, 1);
      assert.strictEqual(descHover, "When to delegate to this subagent (required)");
      const toolsHover = await getClaudeHover(content, 4, 1);
      assert.strictEqual(toolsHover, "Array of tools the subagent can use. Inherits all tools if omitted");
      const askHover = await getClaudeHover(content, 4, 28);
      assert.strictEqual(askHover, "Ask multiple-choice questions");
      const modelHover = await getClaudeHover(content, 5, 1);
      const expectedModelHover = [
        "Model to use: sonnet, opus, haiku, or inherit. Defaults to inherit.",
        "",
        "Claude model `opus` maps to the following model:",
        "",
        "- Name: Claude Opus 4.6",
        "- Family: claude",
        "- Vendor: copilot"
      ].join("\n");
      assert.strictEqual(modelHover, expectedModelHover);
    });
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXGNoYXRcXHRlc3RcXGJyb3dzZXJcXHByb21wdFN5bnRheFxcbGFuZ3VhZ2VQcm92aWRlcnNcXHByb21wdEhvdmVycy50ZXN0LnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IGFzc2VydCBmcm9tICdhc3NlcnQnO1xuaW1wb3J0IHsgQ2FuY2VsbGF0aW9uVG9rZW4gfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9jYW5jZWxsYXRpb24uanMnO1xuaW1wb3J0IHsgZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS90ZXN0L2NvbW1vbi91dGlscy5qcyc7XG5pbXBvcnQgeyBQb3NpdGlvbiB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vY29yZS9wb3NpdGlvbi5qcyc7XG5pbXBvcnQgeyBDb250ZXh0S2V5U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbnRleHRrZXkvYnJvd3Nlci9jb250ZXh0S2V5U2VydmljZS5qcyc7XG5pbXBvcnQgeyBUZXN0Q29uZmlndXJhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb25maWd1cmF0aW9uL3Rlc3QvY29tbW9uL3Rlc3RDb25maWd1cmF0aW9uU2VydmljZS5qcyc7XG5pbXBvcnQgeyBFeHRlbnNpb25JZGVudGlmaWVyIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vZXh0ZW5zaW9ucy9jb21tb24vZXh0ZW5zaW9ucy5qcyc7XG5pbXBvcnQgeyBUZXN0SW5zdGFudGlhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9pbnN0YW50aWF0aW9uL3Rlc3QvY29tbW9uL2luc3RhbnRpYXRpb25TZXJ2aWNlTW9jay5qcyc7XG5pbXBvcnQgeyB3b3JrYmVuY2hJbnN0YW50aWF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3Rlc3QvYnJvd3Nlci93b3JrYmVuY2hUZXN0U2VydmljZXMuanMnO1xuaW1wb3J0IHsgTGFuZ3VhZ2VNb2RlbFRvb2xzU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jyb3dzZXIvdG9vbHMvbGFuZ3VhZ2VNb2RlbFRvb2xzU2VydmljZS5qcyc7XG5pbXBvcnQgeyBDaGF0TW9kZSwgQ3VzdG9tQ2hhdE1vZGUsIElDaGF0TW9kZVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9jb21tb24vY2hhdE1vZGVzLmpzJztcbmltcG9ydCB7IENoYXRBZ2VudExvY2F0aW9uLCBDaGF0Q29uZmlndXJhdGlvbiB9IGZyb20gJy4uLy4uLy4uLy4uL2NvbW1vbi9jb25zdGFudHMuanMnO1xuaW1wb3J0IHsgSUxhbmd1YWdlTW9kZWxUb29sc1NlcnZpY2UsIElUb29sRGF0YSwgVG9vbERhdGFTb3VyY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9jb21tb24vdG9vbHMvbGFuZ3VhZ2VNb2RlbFRvb2xzU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJTGFuZ3VhZ2VNb2RlbENoYXRNZXRhZGF0YSwgSUxhbmd1YWdlTW9kZWxzU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL2NvbW1vbi9sYW5ndWFnZU1vZGVscy5qcyc7XG5pbXBvcnQgeyBQcm9tcHRIb3ZlclByb3ZpZGVyIH0gZnJvbSAnLi4vLi4vLi4vLi4vY29tbW9uL3Byb21wdFN5bnRheC9sYW5ndWFnZVByb3ZpZGVycy9wcm9tcHRIb3ZlcnMuanMnO1xuaW1wb3J0IHsgSVByb21wdHNTZXJ2aWNlLCBQcm9tcHRzU3RvcmFnZSB9IGZyb20gJy4uLy4uLy4uLy4uL2NvbW1vbi9wcm9tcHRTeW50YXgvc2VydmljZS9wcm9tcHRzU2VydmljZS5qcyc7XG5pbXBvcnQgeyBnZXRMYW5ndWFnZUlkRm9yUHJvbXB0c1R5cGUsIFByb21wdHNUeXBlLCBUYXJnZXQgfSBmcm9tICcuLi8uLi8uLi8uLi9jb21tb24vcHJvbXB0U3ludGF4L3Byb21wdFR5cGVzLmpzJztcbmltcG9ydCB7IE1vY2tDaGF0TW9kZVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vbW9ja0NoYXRNb2RlU2VydmljZS5qcyc7XG5pbXBvcnQgeyBjcmVhdGVUZXh0TW9kZWwgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi8uLi9lZGl0b3IvdGVzdC9jb21tb24vdGVzdFRleHRNb2RlbC5qcyc7XG5pbXBvcnQgeyBVUkkgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi91cmkuanMnO1xuaW1wb3J0IHsgUHJvbXB0RmlsZVBhcnNlciB9IGZyb20gJy4uLy4uLy4uLy4uL2NvbW1vbi9wcm9tcHRTeW50YXgvcHJvbXB0RmlsZVBhcnNlci5qcyc7XG5pbXBvcnQgeyBJVGV4dE1vZGVsIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9tb2RlbC5qcyc7XG5pbXBvcnQgeyBNYXJrZG93blN0cmluZyB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2h0bWxDb250ZW50LmpzJztcbmltcG9ydCB7IGdldFByb21wdEZpbGVFeHRlbnNpb24gfSBmcm9tICcuLi8uLi8uLi8uLi9jb21tb24vcHJvbXB0U3ludGF4L2NvbmZpZy9wcm9tcHRGaWxlTG9jYXRpb25zLmpzJztcblxuc3VpdGUoJ1Byb21wdEhvdmVyUHJvdmlkZXInLCAoKSA9PiB7XG5cdGNvbnN0IGRpc3Bvc2FibGVzID0gZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlKCk7XG5cblx0bGV0IGluc3RhU2VydmljZTogVGVzdEluc3RhbnRpYXRpb25TZXJ2aWNlO1xuXHRsZXQgaG92ZXJQcm92aWRlcjogUHJvbXB0SG92ZXJQcm92aWRlcjtcblxuXHRzZXR1cChhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgdGVzdENvbmZpZ1NlcnZpY2UgPSBuZXcgVGVzdENvbmZpZ3VyYXRpb25TZXJ2aWNlKCk7XG5cdFx0dGVzdENvbmZpZ1NlcnZpY2Uuc2V0VXNlckNvbmZpZ3VyYXRpb24oQ2hhdENvbmZpZ3VyYXRpb24uRXh0ZW5zaW9uVG9vbHNFbmFibGVkLCB0cnVlKTtcblx0XHRpbnN0YVNlcnZpY2UgPSB3b3JrYmVuY2hJbnN0YW50aWF0aW9uU2VydmljZSh7XG5cdFx0XHRjb250ZXh0S2V5U2VydmljZTogKCkgPT4gZGlzcG9zYWJsZXMuYWRkKG5ldyBDb250ZXh0S2V5U2VydmljZSh0ZXN0Q29uZmlnU2VydmljZSkpLFxuXHRcdFx0Y29uZmlndXJhdGlvblNlcnZpY2U6ICgpID0+IHRlc3RDb25maWdTZXJ2aWNlXG5cdFx0fSwgZGlzcG9zYWJsZXMpO1xuXG5cdFx0Y29uc3QgdG9vbFNlcnZpY2UgPSBkaXNwb3NhYmxlcy5hZGQoaW5zdGFTZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKExhbmd1YWdlTW9kZWxUb29sc1NlcnZpY2UpKTtcblxuXHRcdGNvbnN0IHRlc3RUb29sMSA9IHsgaWQ6ICd0ZXN0VG9vbDEnLCBkaXNwbGF5TmFtZTogJ3Rvb2wxJywgY2FuQmVSZWZlcmVuY2VkSW5Qcm9tcHQ6IHRydWUsIG1vZGVsRGVzY3JpcHRpb246ICdUZXN0IFRvb2wgMScsIHNvdXJjZTogVG9vbERhdGFTb3VyY2UuRXh0ZXJuYWwsIGlucHV0U2NoZW1hOiB7fSB9IHNhdGlzZmllcyBJVG9vbERhdGE7XG5cdFx0ZGlzcG9zYWJsZXMuYWRkKHRvb2xTZXJ2aWNlLnJlZ2lzdGVyVG9vbERhdGEodGVzdFRvb2wxKSk7XG5cblx0XHRjb25zdCB0ZXN0VG9vbDIgPSB7IGlkOiAndGVzdFRvb2wyJywgZGlzcGxheU5hbWU6ICd0b29sMicsIGNhbkJlUmVmZXJlbmNlZEluUHJvbXB0OiB0cnVlLCB0b29sUmVmZXJlbmNlTmFtZTogJ3Rvb2wyJywgbW9kZWxEZXNjcmlwdGlvbjogJ1Rlc3QgVG9vbCAyJywgc291cmNlOiBUb29sRGF0YVNvdXJjZS5FeHRlcm5hbCwgaW5wdXRTY2hlbWE6IHt9IH0gc2F0aXNmaWVzIElUb29sRGF0YTtcblx0XHRkaXNwb3NhYmxlcy5hZGQodG9vbFNlcnZpY2UucmVnaXN0ZXJUb29sRGF0YSh0ZXN0VG9vbDIpKTtcblxuXHRcdGluc3RhU2VydmljZS5zZXQoSUxhbmd1YWdlTW9kZWxUb29sc1NlcnZpY2UsIHRvb2xTZXJ2aWNlKTtcblxuXHRcdGNvbnN0IHRlc3RNb2RlbHM6IElMYW5ndWFnZU1vZGVsQ2hhdE1ldGFkYXRhW10gPSBbXG5cdFx0XHR7IGlkOiAnbWFlLTQnLCBuYW1lOiAnTUFFIDQnLCB2ZW5kb3I6ICdvbGFtYScsIHZlcnNpb246ICcxLjAnLCBmYW1pbHk6ICdtYWUnLCBleHRlbnNpb246IG5ldyBFeHRlbnNpb25JZGVudGlmaWVyKCdhLmInKSwgaXNVc2VyU2VsZWN0YWJsZTogdHJ1ZSwgbWF4SW5wdXRUb2tlbnM6IDgxOTIsIG1heE91dHB1dFRva2VuczogMTAyNCwgY2FwYWJpbGl0aWVzOiB7IGFnZW50TW9kZTogdHJ1ZSwgdG9vbENhbGxpbmc6IHRydWUgfSwgaXNEZWZhdWx0Rm9yTG9jYXRpb246IHsgW0NoYXRBZ2VudExvY2F0aW9uLkNoYXRdOiB0cnVlIH0gfSBzYXRpc2ZpZXMgSUxhbmd1YWdlTW9kZWxDaGF0TWV0YWRhdGEsXG5cdFx0XHR7IGlkOiAnbWFlLTQuMScsIG5hbWU6ICdNQUUgNC4xJywgdmVuZG9yOiAnY29waWxvdCcsIHZlcnNpb246ICcxLjAnLCBmYW1pbHk6ICdtYWUnLCBleHRlbnNpb246IG5ldyBFeHRlbnNpb25JZGVudGlmaWVyKCdhLmInKSwgaXNVc2VyU2VsZWN0YWJsZTogdHJ1ZSwgbWF4SW5wdXRUb2tlbnM6IDgxOTIsIG1heE91dHB1dFRva2VuczogMTAyNCwgY2FwYWJpbGl0aWVzOiB7IGFnZW50TW9kZTogdHJ1ZSwgdG9vbENhbGxpbmc6IHRydWUgfSwgaXNEZWZhdWx0Rm9yTG9jYXRpb246IHsgW0NoYXRBZ2VudExvY2F0aW9uLkNoYXRdOiB0cnVlIH0gfSBzYXRpc2ZpZXMgSUxhbmd1YWdlTW9kZWxDaGF0TWV0YWRhdGEsXG5cdFx0XHQvLyBDbGF1ZGUgbW9kZWwgZXF1aXZhbGVudHNcblx0XHRcdHsgaWQ6ICdjbGF1ZGUtc29ubmV0LTQuNScsIG5hbWU6ICdDbGF1ZGUgU29ubmV0IDQuNScsIHZlbmRvcjogJ2NvcGlsb3QnLCB2ZXJzaW9uOiAnMS4wJywgZmFtaWx5OiAnY2xhdWRlJywgZXh0ZW5zaW9uOiBuZXcgRXh0ZW5zaW9uSWRlbnRpZmllcignYS5iJyksIGlzVXNlclNlbGVjdGFibGU6IHRydWUsIG1heElucHV0VG9rZW5zOiAyMDAwMDAsIG1heE91dHB1dFRva2VuczogODE5MiwgY2FwYWJpbGl0aWVzOiB7IGFnZW50TW9kZTogdHJ1ZSwgdG9vbENhbGxpbmc6IHRydWUgfSwgaXNEZWZhdWx0Rm9yTG9jYXRpb246IHt9IH0gc2F0aXNmaWVzIElMYW5ndWFnZU1vZGVsQ2hhdE1ldGFkYXRhLFxuXHRcdFx0eyBpZDogJ2NsYXVkZS1vcHVzLTQuNicsIG5hbWU6ICdDbGF1ZGUgT3B1cyA0LjYnLCB2ZW5kb3I6ICdjb3BpbG90JywgdmVyc2lvbjogJzEuMCcsIGZhbWlseTogJ2NsYXVkZScsIGV4dGVuc2lvbjogbmV3IEV4dGVuc2lvbklkZW50aWZpZXIoJ2EuYicpLCBpc1VzZXJTZWxlY3RhYmxlOiB0cnVlLCBtYXhJbnB1dFRva2VuczogMjAwMDAwLCBtYXhPdXRwdXRUb2tlbnM6IDgxOTIsIGNhcGFiaWxpdGllczogeyBhZ2VudE1vZGU6IHRydWUsIHRvb2xDYWxsaW5nOiB0cnVlIH0sIGlzRGVmYXVsdEZvckxvY2F0aW9uOiB7fSB9IHNhdGlzZmllcyBJTGFuZ3VhZ2VNb2RlbENoYXRNZXRhZGF0YSxcblx0XHRcdHsgaWQ6ICdjbGF1ZGUtaGFpa3UtNC41JywgbmFtZTogJ0NsYXVkZSBIYWlrdSA0LjUnLCB2ZW5kb3I6ICdjb3BpbG90JywgdmVyc2lvbjogJzEuMCcsIGZhbWlseTogJ2NsYXVkZScsIGV4dGVuc2lvbjogbmV3IEV4dGVuc2lvbklkZW50aWZpZXIoJ2EuYicpLCBpc1VzZXJTZWxlY3RhYmxlOiB0cnVlLCBtYXhJbnB1dFRva2VuczogMjAwMDAwLCBtYXhPdXRwdXRUb2tlbnM6IDgxOTIsIGNhcGFiaWxpdGllczogeyBhZ2VudE1vZGU6IHRydWUsIHRvb2xDYWxsaW5nOiB0cnVlIH0sIGlzRGVmYXVsdEZvckxvY2F0aW9uOiB7fSB9IHNhdGlzZmllcyBJTGFuZ3VhZ2VNb2RlbENoYXRNZXRhZGF0YSxcblx0XHRdO1xuXG5cdFx0aW5zdGFTZXJ2aWNlLnN0dWIoSUxhbmd1YWdlTW9kZWxzU2VydmljZSwge1xuXHRcdFx0Z2V0TGFuZ3VhZ2VNb2RlbElkcygpIHsgcmV0dXJuIHRlc3RNb2RlbHMubWFwKG0gPT4gbS5pZCk7IH0sXG5cdFx0XHRsb29rdXBMYW5ndWFnZU1vZGVsQnlRdWFsaWZpZWROYW1lKHF1YWxpZmllZE5hbWU6IHN0cmluZykge1xuXHRcdFx0XHRmb3IgKGNvbnN0IG1ldGFkYXRhIG9mIHRlc3RNb2RlbHMpIHtcblx0XHRcdFx0XHRpZiAoSUxhbmd1YWdlTW9kZWxDaGF0TWV0YWRhdGEubWF0Y2hlc1F1YWxpZmllZE5hbWUocXVhbGlmaWVkTmFtZSwgbWV0YWRhdGEpKSB7XG5cdFx0XHRcdFx0XHRyZXR1cm4geyBtZXRhZGF0YSwgaWRlbnRpZmllcjogbWV0YWRhdGEuaWQgfTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHRcdH1cblx0XHR9KTtcblxuXHRcdGNvbnN0IGN1c3RvbUNoYXRNb2RlID0gbmV3IEN1c3RvbUNoYXRNb2RlKHtcblx0XHRcdGlkOiAnYmVhc3QtbW9kZScsXG5cdFx0XHR1cmk6IFVSSS5wYXJzZSgnbXlGczovL3Rlc3QvdGVzdC9jaGF0bW9kZS5tZCcpLFxuXHRcdFx0bmFtZTogJ0JlYXN0TW9kZScsXG5cdFx0XHRhZ2VudEluc3RydWN0aW9uczogeyBjb250ZW50OiAnQmVhc3QgbW9kZSBpbnN0cnVjdGlvbnMnLCB0b29sUmVmZXJlbmNlczogW10gfSxcblx0XHRcdHNvdXJjZTogeyBzdG9yYWdlOiBQcm9tcHRzU3RvcmFnZS5sb2NhbCB9LFxuXHRcdFx0dGFyZ2V0OiBUYXJnZXQuVW5kZWZpbmVkLFxuXHRcdFx0dmlzaWJpbGl0eTogeyB1c2VySW52b2NhYmxlOiB0cnVlLCBhZ2VudEludm9jYWJsZTogdHJ1ZSB9LFxuXHRcdFx0ZW5hYmxlZDogdHJ1ZSxcblx0XHR9KTtcblx0XHRpbnN0YVNlcnZpY2Uuc3R1YihJQ2hhdE1vZGVTZXJ2aWNlLCBuZXcgTW9ja0NoYXRNb2RlU2VydmljZSh7IGJ1aWx0aW46IFtDaGF0TW9kZS5BZ2VudCwgQ2hhdE1vZGUuQXNrLCBDaGF0TW9kZS5FZGl0XSwgY3VzdG9tOiBbY3VzdG9tQ2hhdE1vZGVdIH0pKTtcblxuXHRcdGNvbnN0IHBhcnNlciA9IG5ldyBQcm9tcHRGaWxlUGFyc2VyKCk7XG5cdFx0aW5zdGFTZXJ2aWNlLnN0dWIoSVByb21wdHNTZXJ2aWNlLCB7XG5cdFx0XHRnZXRQYXJzZWRQcm9tcHRGaWxlKG1vZGVsOiBJVGV4dE1vZGVsKSB7XG5cdFx0XHRcdHJldHVybiBwYXJzZXIucGFyc2UobW9kZWwudXJpLCBtb2RlbC5nZXRWYWx1ZSgpKTtcblx0XHRcdH1cblx0XHR9KTtcblxuXHRcdGhvdmVyUHJvdmlkZXIgPSBpbnN0YVNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoUHJvbXB0SG92ZXJQcm92aWRlcik7XG5cdH0pO1xuXG5cdGFzeW5jIGZ1bmN0aW9uIGdldEhvdmVyKGNvbnRlbnQ6IHN0cmluZywgbGluZTogbnVtYmVyLCBjb2x1bW46IG51bWJlciwgcHJvbXB0VHlwZTogUHJvbXB0c1R5cGUsIG9wdGlvbnM/OiB7IGNsYXVkZUFnZW50PzogYm9vbGVhbiB9KTogUHJvbWlzZTxzdHJpbmcgfCB1bmRlZmluZWQ+IHtcblx0XHRjb25zdCBsYW5ndWFnZUlkID0gZ2V0TGFuZ3VhZ2VJZEZvclByb21wdHNUeXBlKHByb21wdFR5cGUpO1xuXHRcdGNvbnN0IGV4dCA9IGdldFByb21wdEZpbGVFeHRlbnNpb24ocHJvbXB0VHlwZSk7XG5cdFx0Y29uc3QgcGF0aCA9IG9wdGlvbnM/LmNsYXVkZUFnZW50ID8gYC8uY2xhdWRlL2FnZW50cy90ZXN0JHtleHR9YCA6IGAvdGVzdCR7ZXh0fWA7XG5cdFx0Y29uc3QgdXJpID0gVVJJLnBhcnNlKCd0ZXN0Oi8vJyArIHBhdGgpO1xuXHRcdGNvbnN0IG1vZGVsID0gZGlzcG9zYWJsZXMuYWRkKGNyZWF0ZVRleHRNb2RlbChjb250ZW50LCBsYW5ndWFnZUlkLCB1bmRlZmluZWQsIHVyaSkpO1xuXHRcdGNvbnN0IHBvc2l0aW9uID0gbmV3IFBvc2l0aW9uKGxpbmUsIGNvbHVtbik7XG5cdFx0Y29uc3QgaG92ZXIgPSBhd2FpdCBob3ZlclByb3ZpZGVyLnByb3ZpZGVIb3Zlcihtb2RlbCwgcG9zaXRpb24sIENhbmNlbGxhdGlvblRva2VuLk5vbmUpO1xuXHRcdGlmICghaG92ZXIgfHwgaG92ZXIuY29udGVudHMubGVuZ3RoID09PSAwKSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblx0XHQvLyBSZXR1cm4gdGhlIG1hcmtkb3duIHZhbHVlIGZyb20gdGhlIGZpcnN0IGNvbnRlbnRcblx0XHRjb25zdCBmaXJzdENvbnRlbnQgPSBob3Zlci5jb250ZW50c1swXTtcblx0XHRpZiAoZmlyc3RDb250ZW50IGluc3RhbmNlb2YgTWFya2Rvd25TdHJpbmcpIHtcblx0XHRcdHJldHVybiBmaXJzdENvbnRlbnQudmFsdWU7XG5cdFx0fVxuXHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdH1cblxuXHRzdWl0ZSgnYWdlbnQgaG92ZXJzJywgKCkgPT4ge1xuXHRcdHRlc3QoJ2hvdmVyIG9uIHRhcmdldCBhdHRyaWJ1dGUgc2hvd3MgZGVzY3JpcHRpb24nLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCBjb250ZW50ID0gW1xuXHRcdFx0XHQnLS0tJyxcblx0XHRcdFx0J2Rlc2NyaXB0aW9uOiBcIlRlc3RcIicsXG5cdFx0XHRcdCd0YXJnZXQ6IHZzY29kZScsXG5cdFx0XHRcdCctLS0nLFxuXHRcdFx0XS5qb2luKCdcXG4nKTtcblx0XHRcdGNvbnN0IGhvdmVyID0gYXdhaXQgZ2V0SG92ZXIoY29udGVudCwgMywgMSwgUHJvbXB0c1R5cGUuYWdlbnQpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGhvdmVyLCAnVGhlIHRhcmdldCB0byB3aGljaCB0aGUgaGVhZGVyIGF0dHJpYnV0ZXMgbGlrZSB0b29scyBhcHBseSB0by4gUG9zc2libGUgdmFsdWVzIGFyZSBgZ2l0aHViLWNvcGlsb3RgIGFuZCBgdnNjb2RlYC4nKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2hvdmVyIG9uIG1vZGVsIGF0dHJpYnV0ZSB3aXRoIGdpdGh1Yi1jb3BpbG90IHRhcmdldCBzaG93cyBub3RlJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgY29udGVudCA9IFtcblx0XHRcdFx0Jy0tLScsXG5cdFx0XHRcdCdkZXNjcmlwdGlvbjogXCJUZXN0XCInLFxuXHRcdFx0XHQndGFyZ2V0OiBnaXRodWItY29waWxvdCcsXG5cdFx0XHRcdCdtb2RlbDogTUFFIDQnLFxuXHRcdFx0XHQnLS0tJyxcblx0XHRcdF0uam9pbignXFxuJyk7XG5cdFx0XHRjb25zdCBob3ZlciA9IGF3YWl0IGdldEhvdmVyKGNvbnRlbnQsIDQsIDEsIFByb21wdHNUeXBlLmFnZW50KTtcblx0XHRcdGNvbnN0IGV4cGVjdGVkID0gW1xuXHRcdFx0XHQnU3BlY2lmeSB0aGUgbW9kZWwgdGhhdCBydW5zIHRoaXMgY3VzdG9tIGFnZW50LiBDYW4gYWxzbyBiZSBhIGxpc3Qgb2YgbW9kZWxzLiBUaGUgZmlyc3QgYXZhaWxhYmxlIG1vZGVsIHdpbGwgYmUgdXNlZC4nLFxuXHRcdFx0XHQnJyxcblx0XHRcdFx0J05vdGU6IFRoaXMgYXR0cmlidXRlIGlzIG5vdCB1c2VkIHdoZW4gdGFyZ2V0IGlzIGdpdGh1Yi1jb3BpbG90Lidcblx0XHRcdF0uam9pbignXFxuJyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoaG92ZXIsIGV4cGVjdGVkKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2hvdmVyIG9uIG1vZGVsIGF0dHJpYnV0ZSB3aXRoIHZzY29kZSB0YXJnZXQgc2hvd3MgbW9kZWwgaW5mbycsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IGNvbnRlbnQgPSBbXG5cdFx0XHRcdCctLS0nLFxuXHRcdFx0XHQnZGVzY3JpcHRpb246IFwiVGVzdFwiJyxcblx0XHRcdFx0J3RhcmdldDogdnNjb2RlJyxcblx0XHRcdFx0J21vZGVsOiBNQUUgNCAob2xhbWEpJyxcblx0XHRcdFx0Jy0tLScsXG5cdFx0XHRdLmpvaW4oJ1xcbicpO1xuXHRcdFx0Y29uc3QgaG92ZXIgPSBhd2FpdCBnZXRIb3Zlcihjb250ZW50LCA0LCAxLCBQcm9tcHRzVHlwZS5hZ2VudCk7XG5cdFx0XHRjb25zdCBleHBlY3RlZCA9IFtcblx0XHRcdFx0J1NwZWNpZnkgdGhlIG1vZGVsIHRoYXQgcnVucyB0aGlzIGN1c3RvbSBhZ2VudC4gQ2FuIGFsc28gYmUgYSBsaXN0IG9mIG1vZGVscy4gVGhlIGZpcnN0IGF2YWlsYWJsZSBtb2RlbCB3aWxsIGJlIHVzZWQuJyxcblx0XHRcdFx0JycsXG5cdFx0XHRcdCctIE5hbWU6IE1BRSA0Jyxcblx0XHRcdFx0Jy0gRmFtaWx5OiBtYWUnLFxuXHRcdFx0XHQnLSBWZW5kb3I6IG9sYW1hJ1xuXHRcdFx0XS5qb2luKCdcXG4nKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChob3ZlciwgZXhwZWN0ZWQpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnaG92ZXIgb24gaGFuZG9mZnMgYXR0cmlidXRlIHdpdGggZ2l0aHViLWNvcGlsb3QgdGFyZ2V0IHNob3dzIG5vdGUnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCBjb250ZW50ID0gW1xuXHRcdFx0XHQnLS0tJyxcblx0XHRcdFx0J2Rlc2NyaXB0aW9uOiBcIlRlc3RcIicsXG5cdFx0XHRcdCd0YXJnZXQ6IGdpdGh1Yi1jb3BpbG90Jyxcblx0XHRcdFx0J2hhbmRvZmZzOicsXG5cdFx0XHRcdCcgIC0gbGFiZWw6IFRlc3QnLFxuXHRcdFx0XHQnICAgIGFnZW50OiBEZWZhdWx0Jyxcblx0XHRcdFx0JyAgICBwcm9tcHQ6IFRlc3QnLFxuXHRcdFx0XHQnLS0tJyxcblx0XHRcdF0uam9pbignXFxuJyk7XG5cdFx0XHRjb25zdCBob3ZlciA9IGF3YWl0IGdldEhvdmVyKGNvbnRlbnQsIDQsIDEsIFByb21wdHNUeXBlLmFnZW50KTtcblx0XHRcdGNvbnN0IGV4cGVjdGVkID0gW1xuXHRcdFx0XHQnUG9zc2libGUgaGFuZG9mZiBhY3Rpb25zIHdoZW4gdGhlIGFnZW50IGhhcyBjb21wbGV0ZWQgaXRzIHRhc2suJyxcblx0XHRcdFx0JycsXG5cdFx0XHRcdCdOb3RlOiBUaGlzIGF0dHJpYnV0ZSBpcyBub3QgdXNlZCBpbiBHaXRIdWIgQ29waWxvdCBvciBDbGF1ZGUgdGFyZ2V0cy4nXG5cdFx0XHRdLmpvaW4oJ1xcbicpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGhvdmVyLCBleHBlY3RlZCk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdob3ZlciBvbiBoYW5kb2ZmcyBhdHRyaWJ1dGUgd2l0aCB2c2NvZGUgdGFyZ2V0IHNob3dzIGRlc2NyaXB0aW9uJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgY29udGVudCA9IFtcblx0XHRcdFx0Jy0tLScsXG5cdFx0XHRcdCdkZXNjcmlwdGlvbjogXCJUZXN0XCInLFxuXHRcdFx0XHQndGFyZ2V0OiB2c2NvZGUnLFxuXHRcdFx0XHQnaGFuZG9mZnM6Jyxcblx0XHRcdFx0JyAgLSBsYWJlbDogVGVzdCcsXG5cdFx0XHRcdCcgICAgYWdlbnQ6IERlZmF1bHQnLFxuXHRcdFx0XHQnICAgIHByb21wdDogVGVzdCcsXG5cdFx0XHRcdCctLS0nLFxuXHRcdFx0XS5qb2luKCdcXG4nKTtcblx0XHRcdGNvbnN0IGhvdmVyID0gYXdhaXQgZ2V0SG92ZXIoY29udGVudCwgNCwgMSwgUHJvbXB0c1R5cGUuYWdlbnQpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGhvdmVyLCAnUG9zc2libGUgaGFuZG9mZiBhY3Rpb25zIHdoZW4gdGhlIGFnZW50IGhhcyBjb21wbGV0ZWQgaXRzIHRhc2suJyk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdob3ZlciBvbiBnaXRodWItY29waWxvdCB0b29sIHNob3dzIHNpbXBsZSBkZXNjcmlwdGlvbicsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IGNvbnRlbnQgPSBbXG5cdFx0XHRcdCctLS0nLFxuXHRcdFx0XHQnZGVzY3JpcHRpb246IFwiVGVzdFwiJyxcblx0XHRcdFx0J3RhcmdldDogZ2l0aHViLWNvcGlsb3QnLFxuXHRcdFx0XHRgdG9vbHM6IFsnZXhlY3V0ZScsICdyZWFkJ11gLFxuXHRcdFx0XHQnLS0tJyxcblx0XHRcdF0uam9pbignXFxuJyk7XG5cdFx0XHQvLyBIb3ZlciBvbiAnc2hlbGwnIHRvb2xcblx0XHRcdGNvbnN0IGhvdmVyU2hlbGwgPSBhd2FpdCBnZXRIb3Zlcihjb250ZW50LCA0LCAxMCwgUHJvbXB0c1R5cGUuYWdlbnQpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGhvdmVyU2hlbGwsICdUb29sU2V0OiBleGVjdXRlXFxuXFxuXFxuRXhlY3V0ZSBjb2RlIGFuZCBhcHBsaWNhdGlvbnMgb24geW91ciBtYWNoaW5lJyk7XG5cblx0XHRcdC8vIEhvdmVyIG9uICdyZWFkJyB0b29sXG5cdFx0XHRjb25zdCBob3ZlckVkaXQgPSBhd2FpdCBnZXRIb3Zlcihjb250ZW50LCA0LCAyMCwgUHJvbXB0c1R5cGUuYWdlbnQpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGhvdmVyRWRpdCwgJ1Rvb2xTZXQ6IHJlYWRcXG5cXG5cXG5SZWFkIGZpbGVzIGluIHlvdXIgd29ya3NwYWNlJyk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdob3ZlciBvbiBnaXRodWItY29waWxvdCB0b29sIHdpdGggdGFyZ2V0IHVuZGVmaW5lZCcsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IGNvbnRlbnQgPSBbXG5cdFx0XHRcdCctLS0nLFxuXHRcdFx0XHQnbmFtZTogXCJUZXN0XCInLFxuXHRcdFx0XHQnZGVzY3JpcHRpb246IFwiVGVzdFwiJyxcblx0XHRcdFx0YHRvb2xzOiBbJ3NoZWxsJywgJ3JlYWQnXWAsXG5cdFx0XHRcdCctLS0nLFxuXHRcdFx0XS5qb2luKCdcXG4nKTtcblx0XHRcdC8vIEhvdmVyIG9uICdzaGVsbCcgdG9vbFxuXHRcdFx0Y29uc3QgaG92ZXJTaGVsbCA9IGF3YWl0IGdldEhvdmVyKGNvbnRlbnQsIDQsIDEwLCBQcm9tcHRzVHlwZS5hZ2VudCk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoaG92ZXJTaGVsbCwgJ1Rvb2xTZXQ6IGV4ZWN1dGVcXG5cXG5cXG5FeGVjdXRlIGNvZGUgYW5kIGFwcGxpY2F0aW9ucyBvbiB5b3VyIG1hY2hpbmUnKTtcblxuXHRcdFx0Ly8gSG92ZXIgb24gJ3JlYWQnIHRvb2xcblx0XHRcdGNvbnN0IGhvdmVyRWRpdCA9IGF3YWl0IGdldEhvdmVyKGNvbnRlbnQsIDQsIDIwLCBQcm9tcHRzVHlwZS5hZ2VudCk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoaG92ZXJFZGl0LCAnVG9vbFNldDogcmVhZFxcblxcblxcblJlYWQgZmlsZXMgaW4geW91ciB3b3Jrc3BhY2UnKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2hvdmVyIG9uIHZzY29kZSB0b29sIHNob3dzIGRldGFpbGVkIGRlc2NyaXB0aW9uJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgY29udGVudCA9IFtcblx0XHRcdFx0Jy0tLScsXG5cdFx0XHRcdCdkZXNjcmlwdGlvbjogXCJUZXN0XCInLFxuXHRcdFx0XHQndGFyZ2V0OiB2c2NvZGUnLFxuXHRcdFx0XHRgdG9vbHM6IFsndG9vbDEnLCAndG9vbDInXWAsXG5cdFx0XHRcdCctLS0nLFxuXHRcdFx0XS5qb2luKCdcXG4nKTtcblx0XHRcdC8vIEhvdmVyIG9uICd0b29sMSdcblx0XHRcdGNvbnN0IGhvdmVyID0gYXdhaXQgZ2V0SG92ZXIoY29udGVudCwgNCwgMTAsIFByb21wdHNUeXBlLmFnZW50KTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChob3ZlciwgJ1Rlc3QgVG9vbCAxJyk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdob3ZlciBvbiBtb2RlbCBhdHRyaWJ1dGUgd2l0aCB2c2NvZGUgdGFyZ2V0IGFuZCBtb2RlbCBhcnJheScsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IGNvbnRlbnQgPSBbXG5cdFx0XHRcdCctLS0nLFxuXHRcdFx0XHQnZGVzY3JpcHRpb246IFwiVGVzdFwiJyxcblx0XHRcdFx0J3RhcmdldDogdnNjb2RlJyxcblx0XHRcdFx0YG1vZGVsOiBbJ01BRSA0IChvbGFtYSknLCAnTUFFIDQuMSAoY29waWxvdCknXWAsXG5cdFx0XHRcdCctLS0nLFxuXHRcdFx0XS5qb2luKCdcXG4nKTtcblx0XHRcdGNvbnN0IGhvdmVyID0gYXdhaXQgZ2V0SG92ZXIoY29udGVudCwgNCwgMTAsIFByb21wdHNUeXBlLmFnZW50KTtcblx0XHRcdGNvbnN0IGV4cGVjdGVkID0gW1xuXHRcdFx0XHQnU3BlY2lmeSB0aGUgbW9kZWwgdGhhdCBydW5zIHRoaXMgY3VzdG9tIGFnZW50LiBDYW4gYWxzbyBiZSBhIGxpc3Qgb2YgbW9kZWxzLiBUaGUgZmlyc3QgYXZhaWxhYmxlIG1vZGVsIHdpbGwgYmUgdXNlZC4nLFxuXHRcdFx0XHQnJyxcblx0XHRcdFx0Jy0gTmFtZTogTUFFIDQnLFxuXHRcdFx0XHQnLSBGYW1pbHk6IG1hZScsXG5cdFx0XHRcdCctIFZlbmRvcjogb2xhbWEnXG5cdFx0XHRdLmpvaW4oJ1xcbicpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGhvdmVyLCBleHBlY3RlZCk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdob3ZlciBvbiBzZWNvbmQgbW9kZWwgaW4gbW9kZWwgYXJyYXknLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCBjb250ZW50ID0gW1xuXHRcdFx0XHQnLS0tJyxcblx0XHRcdFx0J2Rlc2NyaXB0aW9uOiBcIlRlc3RcIicsXG5cdFx0XHRcdCd0YXJnZXQ6IHZzY29kZScsXG5cdFx0XHRcdGBtb2RlbDogWydNQUUgNCAob2xhbWEpJywgJ01BRSA0LjEgKGNvcGlsb3QpJ11gLFxuXHRcdFx0XHQnLS0tJyxcblx0XHRcdF0uam9pbignXFxuJyk7XG5cdFx0XHRjb25zdCBob3ZlciA9IGF3YWl0IGdldEhvdmVyKGNvbnRlbnQsIDQsIDMwLCBQcm9tcHRzVHlwZS5hZ2VudCk7XG5cdFx0XHRjb25zdCBleHBlY3RlZCA9IFtcblx0XHRcdFx0J1NwZWNpZnkgdGhlIG1vZGVsIHRoYXQgcnVucyB0aGlzIGN1c3RvbSBhZ2VudC4gQ2FuIGFsc28gYmUgYSBsaXN0IG9mIG1vZGVscy4gVGhlIGZpcnN0IGF2YWlsYWJsZSBtb2RlbCB3aWxsIGJlIHVzZWQuJyxcblx0XHRcdFx0JycsXG5cdFx0XHRcdCctIE5hbWU6IE1BRSA0LjEnLFxuXHRcdFx0XHQnLSBGYW1pbHk6IG1hZScsXG5cdFx0XHRcdCctIFZlbmRvcjogY29waWxvdCdcblx0XHRcdF0uam9pbignXFxuJyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoaG92ZXIsIGV4cGVjdGVkKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2hvdmVyIG9uIGRlc2NyaXB0aW9uIGF0dHJpYnV0ZScsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IGNvbnRlbnQgPSBbXG5cdFx0XHRcdCctLS0nLFxuXHRcdFx0XHQnZGVzY3JpcHRpb246IFwiVGVzdCBhZ2VudFwiJyxcblx0XHRcdFx0J3RhcmdldDogdnNjb2RlJyxcblx0XHRcdFx0Jy0tLScsXG5cdFx0XHRdLmpvaW4oJ1xcbicpO1xuXHRcdFx0Y29uc3QgaG92ZXIgPSBhd2FpdCBnZXRIb3Zlcihjb250ZW50LCAyLCAxLCBQcm9tcHRzVHlwZS5hZ2VudCk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoaG92ZXIsICdUaGUgZGVzY3JpcHRpb24gb2YgdGhlIGN1c3RvbSBhZ2VudCwgd2hhdCBpdCBkb2VzIGFuZCB3aGVuIHRvIHVzZSBpdC4nKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2hvdmVyIG9uIGFyZ3VtZW50LWhpbnQgYXR0cmlidXRlJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgY29udGVudCA9IFtcblx0XHRcdFx0Jy0tLScsXG5cdFx0XHRcdCdkZXNjcmlwdGlvbjogXCJUZXN0XCInLFxuXHRcdFx0XHQnYXJndW1lbnQtaGludDogXCJ0ZXN0IGhpbnRcIicsXG5cdFx0XHRcdCctLS0nLFxuXHRcdFx0XS5qb2luKCdcXG4nKTtcblx0XHRcdGNvbnN0IGhvdmVyID0gYXdhaXQgZ2V0SG92ZXIoY29udGVudCwgMywgMSwgUHJvbXB0c1R5cGUuYWdlbnQpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGhvdmVyLCAnVGhlIGFyZ3VtZW50LWhpbnQgZGVzY3JpYmVzIHdoYXQgaW5wdXRzIHRoZSBjdXN0b20gYWdlbnQgZXhwZWN0cyBvciBzdXBwb3J0cy4nKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2hvdmVyIG9uIG5hbWUgYXR0cmlidXRlJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgY29udGVudCA9IFtcblx0XHRcdFx0Jy0tLScsXG5cdFx0XHRcdCduYW1lOiBcIk15IEFnZW50XCInLFxuXHRcdFx0XHQnZGVzY3JpcHRpb246IFwiVGVzdCBhZ2VudFwiJyxcblx0XHRcdFx0J3RhcmdldDogdnNjb2RlJyxcblx0XHRcdFx0Jy0tLScsXG5cdFx0XHRdLmpvaW4oJ1xcbicpO1xuXHRcdFx0Y29uc3QgaG92ZXIgPSBhd2FpdCBnZXRIb3Zlcihjb250ZW50LCAyLCAxLCBQcm9tcHRzVHlwZS5hZ2VudCk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoaG92ZXIsICdUaGUgbmFtZSBvZiB0aGUgYWdlbnQgYXMgc2hvd24gaW4gdGhlIFVJLicpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnaG92ZXIgb24gaW5mZXIgYXR0cmlidXRlIHNob3dzIGRlc2NyaXB0aW9uJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgY29udGVudCA9IFtcblx0XHRcdFx0Jy0tLScsXG5cdFx0XHRcdCduYW1lOiBcIlRlc3QgQWdlbnRcIicsXG5cdFx0XHRcdCdkZXNjcmlwdGlvbjogXCJUZXN0IGFnZW50XCInLFxuXHRcdFx0XHQnaW5mZXI6IHRydWUnLFxuXHRcdFx0XHQnLS0tJyxcblx0XHRcdF0uam9pbignXFxuJyk7XG5cdFx0XHRjb25zdCBob3ZlciA9IGF3YWl0IGdldEhvdmVyKGNvbnRlbnQsIDQsIDEsIFByb21wdHNUeXBlLmFnZW50KTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChob3ZlciwgJ0NvbnRyb2xzIHZpc2liaWxpdHkgb2YgdGhlIGFnZW50LlxcblxcbkRlcHJlY2F0ZWQ6IFVzZSBgdXNlci1pbnZvY2FibGVgIGFuZCBgZGlzYWJsZS1tb2RlbC1pbnZvY2F0aW9uYCBpbnN0ZWFkLicpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnaG92ZXIgb24gYWdlbnRzIGF0dHJpYnV0ZSBzaG93cyBkZXNjcmlwdGlvbicsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IGNvbnRlbnQgPSBbXG5cdFx0XHRcdCctLS0nLFxuXHRcdFx0XHQnbmFtZTogXCJUZXN0IEFnZW50XCInLFxuXHRcdFx0XHQnZGVzY3JpcHRpb246IFwiVGVzdCBhZ2VudFwiJyxcblx0XHRcdFx0J2FnZW50czogW1wiKlwiXScsXG5cdFx0XHRcdCctLS0nLFxuXHRcdFx0XS5qb2luKCdcXG4nKTtcblx0XHRcdGNvbnN0IGhvdmVyID0gYXdhaXQgZ2V0SG92ZXIoY29udGVudCwgNCwgMSwgUHJvbXB0c1R5cGUuYWdlbnQpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGhvdmVyLCAnT25lIG9yIG1vcmUgYWdlbnRzIHRoYXQgdGhpcyBhZ2VudCBjYW4gdXNlIGFzIHN1YmFnZW50cy4gVXNlIFxcJypcXCcgdG8gc3BlY2lmeSBhbGwgYXZhaWxhYmxlIGFnZW50cy4nKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2hvdmVyIG9uIHVzZXItaW52b2NhYmxlIGF0dHJpYnV0ZSBzaG93cyBkZXNjcmlwdGlvbicsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IGNvbnRlbnQgPSBbXG5cdFx0XHRcdCctLS0nLFxuXHRcdFx0XHQnbmFtZTogXCJUZXN0IEFnZW50XCInLFxuXHRcdFx0XHQnZGVzY3JpcHRpb246IFwiVGVzdCBhZ2VudFwiJyxcblx0XHRcdFx0J3VzZXItaW52b2NhYmxlOiB0cnVlJyxcblx0XHRcdFx0Jy0tLScsXG5cdFx0XHRdLmpvaW4oJ1xcbicpO1xuXHRcdFx0Y29uc3QgaG92ZXIgPSBhd2FpdCBnZXRIb3Zlcihjb250ZW50LCA0LCAxLCBQcm9tcHRzVHlwZS5hZ2VudCk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoaG92ZXIsICdXaGV0aGVyIHRoZSBhZ2VudCBjYW4gYmUgc2VsZWN0ZWQgYW5kIGludm9rZWQgYnkgdXNlcnMgaW4gdGhlIFVJLicpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnaG92ZXIgb24gZGlzYWJsZS1tb2RlbC1pbnZvY2F0aW9uIGF0dHJpYnV0ZSBzaG93cyBkZXNjcmlwdGlvbicsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IGNvbnRlbnQgPSBbXG5cdFx0XHRcdCctLS0nLFxuXHRcdFx0XHQnbmFtZTogXCJUZXN0IEFnZW50XCInLFxuXHRcdFx0XHQnZGVzY3JpcHRpb246IFwiVGVzdCBhZ2VudFwiJyxcblx0XHRcdFx0J2Rpc2FibGUtbW9kZWwtaW52b2NhdGlvbjogdHJ1ZScsXG5cdFx0XHRcdCctLS0nLFxuXHRcdFx0XS5qb2luKCdcXG4nKTtcblx0XHRcdGNvbnN0IGhvdmVyID0gYXdhaXQgZ2V0SG92ZXIoY29udGVudCwgNCwgMSwgUHJvbXB0c1R5cGUuYWdlbnQpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGhvdmVyLCAnSWYgdHJ1ZSwgcHJldmVudHMgdGhlIGFnZW50IGZyb20gYmVpbmcgaW52b2tlZCBhcyBhIHN1YmFnZW50LicpO1xuXHRcdH0pO1xuXHR9KTtcblxuXHRzdWl0ZSgncHJvbXB0IGhvdmVycycsICgpID0+IHtcblx0XHR0ZXN0KCdob3ZlciBvbiBtb2RlbCBhdHRyaWJ1dGUgc2hvd3MgbW9kZWwgaW5mbycsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IGNvbnRlbnQgPSBbXG5cdFx0XHRcdCctLS0nLFxuXHRcdFx0XHQnZGVzY3JpcHRpb246IFwiVGVzdFwiJyxcblx0XHRcdFx0J21vZGVsOiBNQUUgNCAob2xhbWEpJyxcblx0XHRcdFx0Jy0tLScsXG5cdFx0XHRdLmpvaW4oJ1xcbicpO1xuXHRcdFx0Y29uc3QgaG92ZXIgPSBhd2FpdCBnZXRIb3Zlcihjb250ZW50LCAzLCAxLCBQcm9tcHRzVHlwZS5wcm9tcHQpO1xuXHRcdFx0Y29uc3QgZXhwZWN0ZWQgPSBbXG5cdFx0XHRcdCdUaGUgbW9kZWwgdG8gdXNlIGluIHRoaXMgcHJvbXB0LiBDYW4gYWxzbyBiZSBhIGxpc3Qgb2YgbW9kZWxzLiBUaGUgZmlyc3QgYXZhaWxhYmxlIG1vZGVsIHdpbGwgYmUgdXNlZC4nLFxuXHRcdFx0XHQnJyxcblx0XHRcdFx0Jy0gTmFtZTogTUFFIDQnLFxuXHRcdFx0XHQnLSBGYW1pbHk6IG1hZScsXG5cdFx0XHRcdCctIFZlbmRvcjogb2xhbWEnXG5cdFx0XHRdLmpvaW4oJ1xcbicpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGhvdmVyLCBleHBlY3RlZCk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdob3ZlciBvbiB0b29scyBhdHRyaWJ1dGUgc2hvd3MgdG9vbCBkZXNjcmlwdGlvbicsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IGNvbnRlbnQgPSBbXG5cdFx0XHRcdCctLS0nLFxuXHRcdFx0XHQnZGVzY3JpcHRpb246IFwiVGVzdFwiJyxcblx0XHRcdFx0YHRvb2xzOiBbJ3Rvb2wxJ11gLFxuXHRcdFx0XHQnLS0tJyxcblx0XHRcdF0uam9pbignXFxuJyk7XG5cdFx0XHRjb25zdCBob3ZlciA9IGF3YWl0IGdldEhvdmVyKGNvbnRlbnQsIDMsIDEwLCBQcm9tcHRzVHlwZS5wcm9tcHQpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGhvdmVyLCAnVGVzdCBUb29sIDEnKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2hvdmVyIG9uIGFnZW50IGF0dHJpYnV0ZSBzaG93cyBhZ2VudCBpbmZvJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgY29udGVudCA9IFtcblx0XHRcdFx0Jy0tLScsXG5cdFx0XHRcdCdkZXNjcmlwdGlvbjogXCJUZXN0XCInLFxuXHRcdFx0XHQnYWdlbnQ6IEJlYXN0TW9kZScsXG5cdFx0XHRcdCctLS0nLFxuXHRcdFx0XS5qb2luKCdcXG4nKTtcblx0XHRcdGNvbnN0IGhvdmVyID0gYXdhaXQgZ2V0SG92ZXIoY29udGVudCwgMywgMSwgUHJvbXB0c1R5cGUucHJvbXB0KTtcblx0XHRcdGNvbnN0IGV4cGVjdGVkID0gW1xuXHRcdFx0XHQnVGhlIGFnZW50IHRvIHVzZSB3aGVuIHJ1bm5pbmcgdGhpcyBwcm9tcHQuJyxcblx0XHRcdFx0JycsXG5cdFx0XHRcdCcqKkJ1aWx0LWluIGFnZW50czoqKicsXG5cdFx0XHRcdCctIGBhZ2VudGA6IERlc2NyaWJlIHdoYXQgdG8gYnVpbGQnLFxuXHRcdFx0XHQnLSBgYXNrYDogRXhwbG9yZSBhbmQgdW5kZXJzdGFuZCB5b3VyIGNvZGUnLFxuXHRcdFx0XHQnLSBgZWRpdGA6IEVkaXQgb3IgcmVmYWN0b3Igc2VsZWN0ZWQgY29kZScsXG5cdFx0XHRcdCcnLFxuXHRcdFx0XHQnKipDdXN0b20gYWdlbnRzOioqJyxcblx0XHRcdFx0Jy0gYEJlYXN0TW9kZWA6IEN1c3RvbSBhZ2VudCdcblx0XHRcdF0uam9pbignXFxuJyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoaG92ZXIsIGV4cGVjdGVkKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2hvdmVyIG9uIG5hbWUgYXR0cmlidXRlJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgY29udGVudCA9IFtcblx0XHRcdFx0Jy0tLScsXG5cdFx0XHRcdCduYW1lOiBcIk15IFByb21wdFwiJyxcblx0XHRcdFx0J2Rlc2NyaXB0aW9uOiBcIlRlc3QgcHJvbXB0XCInLFxuXHRcdFx0XHQnLS0tJyxcblx0XHRcdF0uam9pbignXFxuJyk7XG5cdFx0XHRjb25zdCBob3ZlciA9IGF3YWl0IGdldEhvdmVyKGNvbnRlbnQsIDIsIDEsIFByb21wdHNUeXBlLnByb21wdCk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoaG92ZXIsICdUaGUgbmFtZSBvZiB0aGUgcHJvbXB0LiBUaGlzIGlzIGFsc28gdGhlIG5hbWUgb2YgdGhlIHNsYXNoIGNvbW1hbmQgdGhhdCB3aWxsIHJ1biB0aGlzIHByb21wdC4nKTtcblx0XHR9KTtcblx0fSk7XG5cblx0c3VpdGUoJ2luc3RydWN0aW9ucyBob3ZlcnMnLCAoKSA9PiB7XG5cdFx0dGVzdCgnaG92ZXIgb24gZGVzY3JpcHRpb24gYXR0cmlidXRlJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgY29udGVudCA9IFtcblx0XHRcdFx0Jy0tLScsXG5cdFx0XHRcdCdkZXNjcmlwdGlvbjogXCJUZXN0IGluc3RydWN0aW9uXCInLFxuXHRcdFx0XHQnYXBwbHlUbzogXCIqKi8qLnRzXCInLFxuXHRcdFx0XHQnLS0tJyxcblx0XHRcdF0uam9pbignXFxuJyk7XG5cdFx0XHRjb25zdCBob3ZlciA9IGF3YWl0IGdldEhvdmVyKGNvbnRlbnQsIDIsIDEsIFByb21wdHNUeXBlLmluc3RydWN0aW9ucyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoaG92ZXIsICdUaGUgZGVzY3JpcHRpb24gb2YgdGhlIGluc3RydWN0aW9uIGZpbGUuIEl0IGNhbiBiZSB1c2VkIHRvIHByb3ZpZGUgYWRkaXRpb25hbCBjb250ZXh0IG9yIGluZm9ybWF0aW9uIGFib3V0IHRoZSBpbnN0cnVjdGlvbnMgYW5kIGlzIHBhc3NlZCB0byB0aGUgbGFuZ3VhZ2UgbW9kZWwgYXMgcGFydCBvZiB0aGUgcHJvbXB0LicpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnaG92ZXIgb24gYXBwbHlUbyBhdHRyaWJ1dGUnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCBjb250ZW50ID0gW1xuXHRcdFx0XHQnLS0tJyxcblx0XHRcdFx0J2Rlc2NyaXB0aW9uOiBcIlRlc3RcIicsXG5cdFx0XHRcdCdhcHBseVRvOiBcIioqLyoudHNcIicsXG5cdFx0XHRcdCctLS0nLFxuXHRcdFx0XS5qb2luKCdcXG4nKTtcblx0XHRcdGNvbnN0IGhvdmVyID0gYXdhaXQgZ2V0SG92ZXIoY29udGVudCwgMywgMSwgUHJvbXB0c1R5cGUuaW5zdHJ1Y3Rpb25zKTtcblx0XHRcdGNvbnN0IGV4cGVjdGVkID0gW1xuXHRcdFx0XHQnT25lIG9yIG1vcmUgZ2xvYiBwYXR0ZXJuIChzZXBhcmF0ZWQgYnkgY29tbWEpIHRoYXQgZGVzY3JpYmUgZm9yIHdoaWNoIGZpbGVzIHRoZSBpbnN0cnVjdGlvbnMgYXBwbHkgdG8uIEJhc2VkIG9uIHRoZXNlIHBhdHRlcm5zLCB0aGUgZmlsZSBpcyBhdXRvbWF0aWNhbGx5IGluY2x1ZGVkIGluIHRoZSBwcm9tcHQsIHdoZW4gdGhlIGNvbnRleHQgY29udGFpbnMgYSBmaWxlIHRoYXQgbWF0Y2hlcyBvbmUgb3IgbW9yZSBvZiB0aGVzZSBwYXR0ZXJucy4gVXNlIGAqKmAgd2hlbiB5b3Ugd2FudCB0aGlzIGZpbGUgdG8gYWx3YXlzIGJlIGFkZGVkLicsXG5cdFx0XHRcdCdFeGFtcGxlOiBgKiovKi50c2AsIGAqKi8qLmpzYCwgYGNsaWVudC8qKmAnXG5cdFx0XHRdLmpvaW4oJ1xcbicpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGhvdmVyLCBleHBlY3RlZCk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdob3ZlciBvbiBuYW1lIGF0dHJpYnV0ZScsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IGNvbnRlbnQgPSBbXG5cdFx0XHRcdCctLS0nLFxuXHRcdFx0XHQnbmFtZTogXCJNeSBJbnN0cnVjdGlvbnNcIicsXG5cdFx0XHRcdCdkZXNjcmlwdGlvbjogXCJUZXN0IGluc3RydWN0aW9uXCInLFxuXHRcdFx0XHQnYXBwbHlUbzogXCIqKi8qLnRzXCInLFxuXHRcdFx0XHQnLS0tJyxcblx0XHRcdF0uam9pbignXFxuJyk7XG5cdFx0XHRjb25zdCBob3ZlciA9IGF3YWl0IGdldEhvdmVyKGNvbnRlbnQsIDIsIDEsIFByb21wdHNUeXBlLmluc3RydWN0aW9ucyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoaG92ZXIsICdUaGUgbmFtZSBvZiB0aGUgaW5zdHJ1Y3Rpb24gZmlsZSBhcyBzaG93biBpbiB0aGUgVUkuIElmIG5vdCBzZXQsIHRoZSBuYW1lIGlzIGRlcml2ZWQgZnJvbSB0aGUgZmlsZSBuYW1lLicpO1xuXHRcdH0pO1xuXHR9KTtcblxuXHRzdWl0ZSgnc2tpbGwgaG92ZXJzJywgKCkgPT4ge1xuXHRcdHRlc3QoJ2hvdmVyIG9uIG5hbWUgYXR0cmlidXRlJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgY29udGVudCA9IFtcblx0XHRcdFx0Jy0tLScsXG5cdFx0XHRcdCduYW1lOiBcIk15IFNraWxsXCInLFxuXHRcdFx0XHQnZGVzY3JpcHRpb246IFwiVGVzdCBza2lsbFwiJyxcblx0XHRcdFx0Jy0tLScsXG5cdFx0XHRdLmpvaW4oJ1xcbicpO1xuXHRcdFx0Y29uc3QgaG92ZXIgPSBhd2FpdCBnZXRIb3Zlcihjb250ZW50LCAyLCAxLCBQcm9tcHRzVHlwZS5za2lsbCk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoaG92ZXIsICdUaGUgbmFtZSBvZiB0aGUgc2tpbGwuJyk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdob3ZlciBvbiBkZXNjcmlwdGlvbiBhdHRyaWJ1dGUnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCBjb250ZW50ID0gW1xuXHRcdFx0XHQnLS0tJyxcblx0XHRcdFx0J25hbWU6IFwiVGVzdCBTa2lsbFwiJyxcblx0XHRcdFx0J2Rlc2NyaXB0aW9uOiBcIlRlc3Qgc2tpbGwgZGVzY3JpcHRpb25cIicsXG5cdFx0XHRcdCctLS0nLFxuXHRcdFx0XS5qb2luKCdcXG4nKTtcblx0XHRcdGNvbnN0IGhvdmVyID0gYXdhaXQgZ2V0SG92ZXIoY29udGVudCwgMywgMSwgUHJvbXB0c1R5cGUuc2tpbGwpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGhvdmVyLCAnVGhlIGRlc2NyaXB0aW9uIG9mIHRoZSBza2lsbC4gVGhlIGRlc2NyaXB0aW9uIGlzIGFkZGVkIHRvIGV2ZXJ5IHJlcXVlc3QgYW5kIHdpbGwgYmUgdXNlZCBieSB0aGUgYWdlbnQgdG8gZGVjaWRlIHdoZW4gdG8gbG9hZCB0aGUgc2tpbGwuJyk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdob3ZlciBvbiBmaWxlIGF0dHJpYnV0ZScsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IGNvbnRlbnQgPSBbXG5cdFx0XHRcdCctLS0nLFxuXHRcdFx0XHQnbmFtZTogXCJUZXN0IFNraWxsXCInLFxuXHRcdFx0XHQnZGVzY3JpcHRpb246IFwiVGVzdCBza2lsbFwiJyxcblx0XHRcdFx0J2ZpbGU6IFwiU0tJTEwubWRcIicsXG5cdFx0XHRcdCctLS0nLFxuXHRcdFx0XS5qb2luKCdcXG4nKTtcblx0XHRcdGNvbnN0IGhvdmVyID0gYXdhaXQgZ2V0SG92ZXIoY29udGVudCwgNCwgMSwgUHJvbXB0c1R5cGUuc2tpbGwpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGhvdmVyLCB1bmRlZmluZWQpO1xuXHRcdH0pO1xuXHR9KTtcblxuXHRzdWl0ZSgnY2xhdWRlIGFnZW50IGhvdmVycycsICgpID0+IHtcblx0XHQvLyBIZWxwZXIgdGhhdCBjcmVhdGVzIGEgaG92ZXIgaW4gYSBDbGF1ZGUgYWdlbnQgZmlsZSAoVVJJIHVuZGVyIC5jbGF1ZGUvYWdlbnRzLylcblx0XHRhc3luYyBmdW5jdGlvbiBnZXRDbGF1ZGVIb3Zlcihjb250ZW50OiBzdHJpbmcsIGxpbmU6IG51bWJlciwgY29sdW1uOiBudW1iZXIpOiBQcm9taXNlPHN0cmluZyB8IHVuZGVmaW5lZD4ge1xuXHRcdFx0cmV0dXJuIGdldEhvdmVyKGNvbnRlbnQsIGxpbmUsIGNvbHVtbiwgUHJvbXB0c1R5cGUuYWdlbnQsIHsgY2xhdWRlQWdlbnQ6IHRydWUgfSk7XG5cdFx0fVxuXG5cdFx0dGVzdCgnaG92ZXIgb24gbmFtZSBhdHRyaWJ1dGUgc2hvd3MgQ2xhdWRlIGRlc2NyaXB0aW9uJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgY29udGVudCA9IFtcblx0XHRcdFx0Jy0tLScsXG5cdFx0XHRcdCduYW1lOiBzZWN1cml0eS1yZXZpZXdlcicsXG5cdFx0XHRcdCdkZXNjcmlwdGlvbjogUmV2aWV3cyBjb2RlIGZvciBzZWN1cml0eSB2dWxuZXJhYmlsaXRpZXMnLFxuXHRcdFx0XHQnLS0tJyxcblx0XHRcdF0uam9pbignXFxuJyk7XG5cdFx0XHRjb25zdCBob3ZlciA9IGF3YWl0IGdldENsYXVkZUhvdmVyKGNvbnRlbnQsIDIsIDEpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGhvdmVyLCAnVW5pcXVlIGlkZW50aWZpZXIgdXNpbmcgbG93ZXJjYXNlIGxldHRlcnMgYW5kIGh5cGhlbnMgKHJlcXVpcmVkKScpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnaG92ZXIgb24gZGVzY3JpcHRpb24gYXR0cmlidXRlIHNob3dzIENsYXVkZSBkZXNjcmlwdGlvbicsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IGNvbnRlbnQgPSBbXG5cdFx0XHRcdCctLS0nLFxuXHRcdFx0XHQnbmFtZTogc2VjdXJpdHktcmV2aWV3ZXInLFxuXHRcdFx0XHQnZGVzY3JpcHRpb246IFJldmlld3MgY29kZSBmb3Igc2VjdXJpdHkgdnVsbmVyYWJpbGl0aWVzJyxcblx0XHRcdFx0Jy0tLScsXG5cdFx0XHRdLmpvaW4oJ1xcbicpO1xuXHRcdFx0Y29uc3QgaG92ZXIgPSBhd2FpdCBnZXRDbGF1ZGVIb3Zlcihjb250ZW50LCAzLCAxKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChob3ZlciwgJ1doZW4gdG8gZGVsZWdhdGUgdG8gdGhpcyBzdWJhZ2VudCAocmVxdWlyZWQpJyk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdob3ZlciBvbiB0b29scyBhdHRyaWJ1dGUgc2hvd3MgQ2xhdWRlIGRlc2NyaXB0aW9uJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgY29udGVudCA9IFtcblx0XHRcdFx0Jy0tLScsXG5cdFx0XHRcdCduYW1lOiBzZWN1cml0eS1yZXZpZXdlcicsXG5cdFx0XHRcdCdkZXNjcmlwdGlvbjogUmV2aWV3cyBjb2RlIGZvciBzZWN1cml0eSB2dWxuZXJhYmlsaXRpZXMnLFxuXHRcdFx0XHQndG9vbHM6IEVkaXQsIEdyZXAsIEFza1VzZXJRdWVzdGlvbiwgV2ViRmV0Y2gnLFxuXHRcdFx0XHQnLS0tJyxcblx0XHRcdF0uam9pbignXFxuJyk7XG5cdFx0XHRjb25zdCBob3ZlciA9IGF3YWl0IGdldENsYXVkZUhvdmVyKGNvbnRlbnQsIDQsIDEpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGhvdmVyLCAnQXJyYXkgb2YgdG9vbHMgdGhlIHN1YmFnZW50IGNhbiB1c2UuIEluaGVyaXRzIGFsbCB0b29scyBpZiBvbWl0dGVkJyk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdob3ZlciBvbiBpbmRpdmlkdWFsIENsYXVkZSB0b29sIHNob3dzIHRvb2wgZGVzY3JpcHRpb24nLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCBjb250ZW50ID0gW1xuXHRcdFx0XHQnLS0tJyxcblx0XHRcdFx0J25hbWU6IHNlY3VyaXR5LXJldmlld2VyJyxcblx0XHRcdFx0J2Rlc2NyaXB0aW9uOiBSZXZpZXdzIGNvZGUnLFxuXHRcdFx0XHRgdG9vbHM6IFsnRWRpdCcsICdHcmVwJywgJ1dlYkZldGNoJ11gLFxuXHRcdFx0XHQnLS0tJyxcblx0XHRcdF0uam9pbignXFxuJyk7XG5cdFx0XHQvLyBIb3ZlciBvbiAnRWRpdCcgdG9vbFxuXHRcdFx0Y29uc3QgaG92ZXJFZGl0ID0gYXdhaXQgZ2V0Q2xhdWRlSG92ZXIoY29udGVudCwgNCwgMTApO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGhvdmVyRWRpdCwgJ01ha2UgdGFyZ2V0ZWQgZmlsZSBlZGl0cycpO1xuXG5cdFx0XHQvLyBIb3ZlciBvbiAnR3JlcCcgdG9vbFxuXHRcdFx0Y29uc3QgaG92ZXJHcmVwID0gYXdhaXQgZ2V0Q2xhdWRlSG92ZXIoY29udGVudCwgNCwgMTcpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGhvdmVyR3JlcCwgJ1NlYXJjaCBmaWxlIGNvbnRlbnRzIHdpdGggcmVnZXgnKTtcblxuXHRcdFx0Ly8gSG92ZXIgb24gJ1dlYkZldGNoJyB0b29sXG5cdFx0XHRjb25zdCBob3ZlckZldGNoID0gYXdhaXQgZ2V0Q2xhdWRlSG92ZXIoY29udGVudCwgNCwgMjcpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGhvdmVyRmV0Y2gsICdGZXRjaCBVUkwgY29udGVudCcpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnaG92ZXIgb24gbW9kZWwgYXR0cmlidXRlIHNob3dzIENsYXVkZSBkZXNjcmlwdGlvbicsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IGNvbnRlbnQgPSBbXG5cdFx0XHRcdCctLS0nLFxuXHRcdFx0XHQnbmFtZTogc2VjdXJpdHktcmV2aWV3ZXInLFxuXHRcdFx0XHQnZGVzY3JpcHRpb246IFJldmlld3MgY29kZScsXG5cdFx0XHRcdCdtb2RlbDogb3B1cycsXG5cdFx0XHRcdCctLS0nLFxuXHRcdFx0XS5qb2luKCdcXG4nKTtcblx0XHRcdGNvbnN0IGhvdmVyID0gYXdhaXQgZ2V0Q2xhdWRlSG92ZXIoY29udGVudCwgNCwgMSk7XG5cdFx0XHRjb25zdCBleHBlY3RlZCA9IFtcblx0XHRcdFx0J01vZGVsIHRvIHVzZTogc29ubmV0LCBvcHVzLCBoYWlrdSwgb3IgaW5oZXJpdC4gRGVmYXVsdHMgdG8gaW5oZXJpdC4nLFxuXHRcdFx0XHQnJyxcblx0XHRcdFx0J0NsYXVkZSBtb2RlbCBgb3B1c2AgbWFwcyB0byB0aGUgZm9sbG93aW5nIG1vZGVsOicsXG5cdFx0XHRcdCcnLFxuXHRcdFx0XHQnLSBOYW1lOiBDbGF1ZGUgT3B1cyA0LjYnLFxuXHRcdFx0XHQnLSBGYW1pbHk6IGNsYXVkZScsXG5cdFx0XHRcdCctIFZlbmRvcjogY29waWxvdCdcblx0XHRcdF0uam9pbignXFxuJyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoaG92ZXIsIGV4cGVjdGVkKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2hvdmVyIG9uIG1vZGVsIGF0dHJpYnV0ZSB3aXRoIHNvbm5ldCB2YWx1ZScsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IGNvbnRlbnQgPSBbXG5cdFx0XHRcdCctLS0nLFxuXHRcdFx0XHQnbmFtZTogdGVzdC1hZ2VudCcsXG5cdFx0XHRcdCdkZXNjcmlwdGlvbjogVGVzdCcsXG5cdFx0XHRcdCdtb2RlbDogc29ubmV0Jyxcblx0XHRcdFx0Jy0tLScsXG5cdFx0XHRdLmpvaW4oJ1xcbicpO1xuXHRcdFx0Y29uc3QgaG92ZXIgPSBhd2FpdCBnZXRDbGF1ZGVIb3Zlcihjb250ZW50LCA0LCAxKTtcblx0XHRcdGNvbnN0IGV4cGVjdGVkID0gW1xuXHRcdFx0XHQnTW9kZWwgdG8gdXNlOiBzb25uZXQsIG9wdXMsIGhhaWt1LCBvciBpbmhlcml0LiBEZWZhdWx0cyB0byBpbmhlcml0LicsXG5cdFx0XHRcdCcnLFxuXHRcdFx0XHQnQ2xhdWRlIG1vZGVsIGBzb25uZXRgIG1hcHMgdG8gdGhlIGZvbGxvd2luZyBtb2RlbDonLFxuXHRcdFx0XHQnJyxcblx0XHRcdFx0Jy0gTmFtZTogQ2xhdWRlIFNvbm5ldCA0LjUnLFxuXHRcdFx0XHQnLSBGYW1pbHk6IGNsYXVkZScsXG5cdFx0XHRcdCctIFZlbmRvcjogY29waWxvdCdcblx0XHRcdF0uam9pbignXFxuJyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoaG92ZXIsIGV4cGVjdGVkKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2hvdmVyIG9uIG1vZGVsIGF0dHJpYnV0ZSB3aXRoIGhhaWt1IHZhbHVlJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgY29udGVudCA9IFtcblx0XHRcdFx0Jy0tLScsXG5cdFx0XHRcdCduYW1lOiB0ZXN0LWFnZW50Jyxcblx0XHRcdFx0J2Rlc2NyaXB0aW9uOiBUZXN0Jyxcblx0XHRcdFx0J21vZGVsOiBoYWlrdScsXG5cdFx0XHRcdCctLS0nLFxuXHRcdFx0XS5qb2luKCdcXG4nKTtcblx0XHRcdGNvbnN0IGhvdmVyID0gYXdhaXQgZ2V0Q2xhdWRlSG92ZXIoY29udGVudCwgNCwgMSk7XG5cdFx0XHRjb25zdCBleHBlY3RlZCA9IFtcblx0XHRcdFx0J01vZGVsIHRvIHVzZTogc29ubmV0LCBvcHVzLCBoYWlrdSwgb3IgaW5oZXJpdC4gRGVmYXVsdHMgdG8gaW5oZXJpdC4nLFxuXHRcdFx0XHQnJyxcblx0XHRcdFx0J0NsYXVkZSBtb2RlbCBgaGFpa3VgIG1hcHMgdG8gdGhlIGZvbGxvd2luZyBtb2RlbDonLFxuXHRcdFx0XHQnJyxcblx0XHRcdFx0Jy0gTmFtZTogQ2xhdWRlIEhhaWt1IDQuNScsXG5cdFx0XHRcdCctIEZhbWlseTogY2xhdWRlJyxcblx0XHRcdFx0Jy0gVmVuZG9yOiBjb3BpbG90J1xuXHRcdFx0XS5qb2luKCdcXG4nKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChob3ZlciwgZXhwZWN0ZWQpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnaG92ZXIgb24gbW9kZWwgYXR0cmlidXRlIHdpdGggaW5oZXJpdCB2YWx1ZScsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IGNvbnRlbnQgPSBbXG5cdFx0XHRcdCctLS0nLFxuXHRcdFx0XHQnbmFtZTogdGVzdC1hZ2VudCcsXG5cdFx0XHRcdCdkZXNjcmlwdGlvbjogVGVzdCcsXG5cdFx0XHRcdCdtb2RlbDogaW5oZXJpdCcsXG5cdFx0XHRcdCctLS0nLFxuXHRcdFx0XS5qb2luKCdcXG4nKTtcblx0XHRcdGNvbnN0IGhvdmVyID0gYXdhaXQgZ2V0Q2xhdWRlSG92ZXIoY29udGVudCwgNCwgMSk7XG5cdFx0XHRjb25zdCBleHBlY3RlZCA9IFtcblx0XHRcdFx0J01vZGVsIHRvIHVzZTogc29ubmV0LCBvcHVzLCBoYWlrdSwgb3IgaW5oZXJpdC4gRGVmYXVsdHMgdG8gaW5oZXJpdC4nLFxuXHRcdFx0XHQnJyxcblx0XHRcdFx0J0luaGVyaXQgbW9kZWwgZnJvbSBwYXJlbnQgYWdlbnQgb3IgcHJvbXB0J1xuXHRcdFx0XS5qb2luKCdcXG4nKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChob3ZlciwgZXhwZWN0ZWQpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnaG92ZXIgb24gZGlzYWxsb3dlZFRvb2xzIGF0dHJpYnV0ZSBzaG93cyBDbGF1ZGUgZGVzY3JpcHRpb24nLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCBjb250ZW50ID0gW1xuXHRcdFx0XHQnLS0tJyxcblx0XHRcdFx0J25hbWU6IHJlYWQtb25seS1hZ2VudCcsXG5cdFx0XHRcdCdkZXNjcmlwdGlvbjogUmVhZC1vbmx5IGFuYWx5c2lzIGFnZW50Jyxcblx0XHRcdFx0YGRpc2FsbG93ZWRUb29sczogWydXcml0ZScsICdFZGl0JywgJ0Jhc2gnXWAsXG5cdFx0XHRcdCctLS0nLFxuXHRcdFx0XS5qb2luKCdcXG4nKTtcblx0XHRcdGNvbnN0IGhvdmVyID0gYXdhaXQgZ2V0Q2xhdWRlSG92ZXIoY29udGVudCwgNCwgMSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoaG92ZXIsICdUb29scyB0byBkZW55LCByZW1vdmVkIGZyb20gaW5oZXJpdGVkIG9yIHNwZWNpZmllZCBsaXN0Jyk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdob3ZlciBvbiBpbmRpdmlkdWFsIGRpc2FsbG93ZWRUb29scyB2YWx1ZSBzaG93cyB0b29sIGRlc2NyaXB0aW9uJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgY29udGVudCA9IFtcblx0XHRcdFx0Jy0tLScsXG5cdFx0XHRcdCduYW1lOiByZWFkLW9ubHktYWdlbnQnLFxuXHRcdFx0XHQnZGVzY3JpcHRpb246IFJlYWQtb25seScsXG5cdFx0XHRcdGBkaXNhbGxvd2VkVG9vbHM6IFsnQmFzaCcsICdXcml0ZSddYCxcblx0XHRcdFx0Jy0tLScsXG5cdFx0XHRdLmpvaW4oJ1xcbicpO1xuXHRcdFx0Ly8gSG92ZXIgb24gJ0Jhc2gnIHRvb2wgdmFsdWVcblx0XHRcdGNvbnN0IGhvdmVyQmFzaCA9IGF3YWl0IGdldENsYXVkZUhvdmVyKGNvbnRlbnQsIDQsIDIwKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChob3ZlckJhc2gsICdFeGVjdXRlIHNoZWxsIGNvbW1hbmRzJyk7XG5cblx0XHRcdC8vIEhvdmVyIG9uICdXcml0ZScgdG9vbCB2YWx1ZVxuXHRcdFx0Y29uc3QgaG92ZXJXcml0ZSA9IGF3YWl0IGdldENsYXVkZUhvdmVyKGNvbnRlbnQsIDQsIDI4KTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChob3ZlcldyaXRlLCAnQ3JlYXRlL292ZXJ3cml0ZSBmaWxlcycpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnaG92ZXIgb24gcGVybWlzc2lvbk1vZGUgYXR0cmlidXRlIHNob3dzIENsYXVkZSBkZXNjcmlwdGlvbicsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IGNvbnRlbnQgPSBbXG5cdFx0XHRcdCctLS0nLFxuXHRcdFx0XHQnbmFtZTogdGVzdC1hZ2VudCcsXG5cdFx0XHRcdCdkZXNjcmlwdGlvbjogVGVzdCcsXG5cdFx0XHRcdCdwZXJtaXNzaW9uTW9kZTogYWNjZXB0RWRpdHMnLFxuXHRcdFx0XHQnLS0tJyxcblx0XHRcdF0uam9pbignXFxuJyk7XG5cdFx0XHRjb25zdCBob3ZlciA9IGF3YWl0IGdldENsYXVkZUhvdmVyKGNvbnRlbnQsIDQsIDEpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGhvdmVyLCAnUGVybWlzc2lvbiBtb2RlOiBkZWZhdWx0LCBhY2NlcHRFZGl0cywgZG9udEFzaywgYnlwYXNzUGVybWlzc2lvbnMsIG9yIHBsYW4uJyk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdob3ZlciBvbiBtZW1vcnkgYXR0cmlidXRlIHNob3dzIENsYXVkZSBkZXNjcmlwdGlvbicsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IGNvbnRlbnQgPSBbXG5cdFx0XHRcdCctLS0nLFxuXHRcdFx0XHQnbmFtZTogdGVzdC1hZ2VudCcsXG5cdFx0XHRcdCdkZXNjcmlwdGlvbjogVGVzdCcsXG5cdFx0XHRcdCdtZW1vcnk6IHByb2plY3QnLFxuXHRcdFx0XHQnLS0tJyxcblx0XHRcdF0uam9pbignXFxuJyk7XG5cdFx0XHRjb25zdCBob3ZlciA9IGF3YWl0IGdldENsYXVkZUhvdmVyKGNvbnRlbnQsIDQsIDEpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGhvdmVyLCAnUGVyc2lzdGVudCBtZW1vcnkgc2NvcGU6IHVzZXIsIHByb2plY3QsIG9yIGxvY2FsLiBFbmFibGVzIGNyb3NzLXNlc3Npb24gbGVhcm5pbmcuJyk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdob3ZlciBvbiBza2lsbHMgYXR0cmlidXRlIHNob3dzIENsYXVkZSBkZXNjcmlwdGlvbicsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IGNvbnRlbnQgPSBbXG5cdFx0XHRcdCctLS0nLFxuXHRcdFx0XHQnbmFtZTogdGVzdC1hZ2VudCcsXG5cdFx0XHRcdCdkZXNjcmlwdGlvbjogVGVzdCcsXG5cdFx0XHRcdCdza2lsbHM6IFtcImNvZGUtcmV2aWV3XCJdJyxcblx0XHRcdFx0Jy0tLScsXG5cdFx0XHRdLmpvaW4oJ1xcbicpO1xuXHRcdFx0Y29uc3QgaG92ZXIgPSBhd2FpdCBnZXRDbGF1ZGVIb3Zlcihjb250ZW50LCA0LCAxKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChob3ZlciwgJ1NraWxscyB0byBsb2FkIGludG8gdGhlIHN1YmFnZW50XFwncyBjb250ZXh0IGF0IHN0YXJ0dXAuJyk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdob3ZlciBvbiBob29rcyBhdHRyaWJ1dGUgc2hvd3MgQ2xhdWRlIGRlc2NyaXB0aW9uJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgY29udGVudCA9IFtcblx0XHRcdFx0Jy0tLScsXG5cdFx0XHRcdCduYW1lOiB0ZXN0LWFnZW50Jyxcblx0XHRcdFx0J2Rlc2NyaXB0aW9uOiBUZXN0Jyxcblx0XHRcdFx0J2hvb2tzOiB7fScsXG5cdFx0XHRcdCctLS0nLFxuXHRcdFx0XS5qb2luKCdcXG4nKTtcblx0XHRcdGNvbnN0IGhvdmVyID0gYXdhaXQgZ2V0Q2xhdWRlSG92ZXIoY29udGVudCwgNCwgMSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoaG92ZXIsICdMaWZlY3ljbGUgaG9va3Mgc2NvcGVkIHRvIHRoaXMgc3ViYWdlbnQuJyk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdob3ZlciBvbiBoYW5kb2ZmcyBhdHRyaWJ1dGUgaW4gQ2xhdWRlIGFnZW50IHNob3dzIG5vdC11c2VkIG5vdGUnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCBjb250ZW50ID0gW1xuXHRcdFx0XHQnLS0tJyxcblx0XHRcdFx0J25hbWU6IHRlc3QtYWdlbnQnLFxuXHRcdFx0XHQnZGVzY3JpcHRpb246IFRlc3QnLFxuXHRcdFx0XHQnaGFuZG9mZnM6Jyxcblx0XHRcdFx0JyAgLSBsYWJlbDogVGVzdCcsXG5cdFx0XHRcdCcgICAgYWdlbnQ6IERlZmF1bHQnLFxuXHRcdFx0XHQnICAgIHByb21wdDogVGVzdCcsXG5cdFx0XHRcdCctLS0nLFxuXHRcdFx0XS5qb2luKCdcXG4nKTtcblx0XHRcdGNvbnN0IGhvdmVyID0gYXdhaXQgZ2V0Q2xhdWRlSG92ZXIoY29udGVudCwgNCwgMSk7XG5cdFx0XHQvLyBoYW5kb2ZmcyBpcyBub3QgYSBDbGF1ZGUgYXR0cmlidXRlLCBzbyBubyBob3ZlciBzaG91bGQgYXBwZWFyXG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoaG92ZXIsIHVuZGVmaW5lZCk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdmdWxsIGV4YW1wbGU6IGhvdmVyIG9uIGVhY2ggYXR0cmlidXRlIG9mIGEgQ2xhdWRlIGFnZW50JywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Ly8gUmVhbGlzdGljIENsYXVkZSBhZ2VudCBmaWxlIGFzIHVzZXIgcHJvdmlkZWRcblx0XHRcdGNvbnN0IGNvbnRlbnQgPSBbXG5cdFx0XHRcdCctLS0nLFxuXHRcdFx0XHQnbmFtZTogc2VjdXJpdHktcmV2aWV3ZXInLFxuXHRcdFx0XHQnZGVzY3JpcHRpb246IFJldmlld3MgY29kZSBmb3Igc2VjdXJpdHkgdnVsbmVyYWJpbGl0aWVzJyxcblx0XHRcdFx0YHRvb2xzOiBbJ0VkaXQnLCAnR3JlcCcsICdBc2tVc2VyUXVlc3Rpb24nLCAnV2ViRmV0Y2gnXWAsXG5cdFx0XHRcdCdtb2RlbDogb3B1cycsXG5cdFx0XHRcdCctLS0nLFxuXHRcdFx0XHQnWW91IGFyZSBhIHNlbmlvciBzZWN1cml0eSBlbmdpbmVlci4nLFxuXHRcdFx0XS5qb2luKCdcXG4nKTtcblxuXHRcdFx0Ly8gSG92ZXIgb24gbmFtZSAobGluZSAyKVxuXHRcdFx0Y29uc3QgbmFtZUhvdmVyID0gYXdhaXQgZ2V0Q2xhdWRlSG92ZXIoY29udGVudCwgMiwgMSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobmFtZUhvdmVyLCAnVW5pcXVlIGlkZW50aWZpZXIgdXNpbmcgbG93ZXJjYXNlIGxldHRlcnMgYW5kIGh5cGhlbnMgKHJlcXVpcmVkKScpO1xuXG5cdFx0XHQvLyBIb3ZlciBvbiBkZXNjcmlwdGlvbiAobGluZSAzKVxuXHRcdFx0Y29uc3QgZGVzY0hvdmVyID0gYXdhaXQgZ2V0Q2xhdWRlSG92ZXIoY29udGVudCwgMywgMSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZGVzY0hvdmVyLCAnV2hlbiB0byBkZWxlZ2F0ZSB0byB0aGlzIHN1YmFnZW50IChyZXF1aXJlZCknKTtcblxuXHRcdFx0Ly8gSG92ZXIgb24gdG9vbHMgYXR0cmlidXRlIGtleSAobGluZSA0LCBjb2x1bW4gMSlcblx0XHRcdGNvbnN0IHRvb2xzSG92ZXIgPSBhd2FpdCBnZXRDbGF1ZGVIb3Zlcihjb250ZW50LCA0LCAxKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbCh0b29sc0hvdmVyLCAnQXJyYXkgb2YgdG9vbHMgdGhlIHN1YmFnZW50IGNhbiB1c2UuIEluaGVyaXRzIGFsbCB0b29scyBpZiBvbWl0dGVkJyk7XG5cblx0XHRcdC8vIEhvdmVyIG9uICdBc2tVc2VyUXVlc3Rpb24nIHRvb2wgdmFsdWUgKGxpbmUgNClcblx0XHRcdGNvbnN0IGFza0hvdmVyID0gYXdhaXQgZ2V0Q2xhdWRlSG92ZXIoY29udGVudCwgNCwgMjgpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGFza0hvdmVyLCAnQXNrIG11bHRpcGxlLWNob2ljZSBxdWVzdGlvbnMnKTtcblxuXHRcdFx0Ly8gSG92ZXIgb24gbW9kZWwgdmFsdWUgJ29wdXMnIChsaW5lIDUpXG5cdFx0XHRjb25zdCBtb2RlbEhvdmVyID0gYXdhaXQgZ2V0Q2xhdWRlSG92ZXIoY29udGVudCwgNSwgMSk7XG5cdFx0XHRjb25zdCBleHBlY3RlZE1vZGVsSG92ZXIgPSBbXG5cdFx0XHRcdCdNb2RlbCB0byB1c2U6IHNvbm5ldCwgb3B1cywgaGFpa3UsIG9yIGluaGVyaXQuIERlZmF1bHRzIHRvIGluaGVyaXQuJyxcblx0XHRcdFx0JycsXG5cdFx0XHRcdCdDbGF1ZGUgbW9kZWwgYG9wdXNgIG1hcHMgdG8gdGhlIGZvbGxvd2luZyBtb2RlbDonLFxuXHRcdFx0XHQnJyxcblx0XHRcdFx0Jy0gTmFtZTogQ2xhdWRlIE9wdXMgNC42Jyxcblx0XHRcdFx0Jy0gRmFtaWx5OiBjbGF1ZGUnLFxuXHRcdFx0XHQnLSBWZW5kb3I6IGNvcGlsb3QnXG5cdFx0XHRdLmpvaW4oJ1xcbicpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1vZGVsSG92ZXIsIGV4cGVjdGVkTW9kZWxIb3Zlcik7XG5cdFx0fSk7XG5cdH0pO1xufSk7XG4iXSwKICAibWFwcGluZ3MiOiAiQUFLQSxPQUFPLFlBQVk7QUFDbkIsU0FBUyx5QkFBeUI7QUFDbEMsU0FBUywrQ0FBK0M7QUFDeEQsU0FBUyxnQkFBZ0I7QUFDekIsU0FBUyx5QkFBeUI7QUFDbEMsU0FBUyxnQ0FBZ0M7QUFDekMsU0FBUywyQkFBMkI7QUFFcEMsU0FBUyxxQ0FBcUM7QUFDOUMsU0FBUyxpQ0FBaUM7QUFDMUMsU0FBUyxVQUFVLGdCQUFnQix3QkFBd0I7QUFDM0QsU0FBUyxtQkFBbUIseUJBQXlCO0FBQ3JELFNBQVMsNEJBQXVDLHNCQUFzQjtBQUN0RSxTQUFTLDRCQUE0Qiw4QkFBOEI7QUFDbkUsU0FBUywyQkFBMkI7QUFDcEMsU0FBUyxpQkFBaUIsc0JBQXNCO0FBQ2hELFNBQVMsNkJBQTZCLGFBQWEsY0FBYztBQUNqRSxTQUFTLDJCQUEyQjtBQUNwQyxTQUFTLHVCQUF1QjtBQUNoQyxTQUFTLFdBQVc7QUFDcEIsU0FBUyx3QkFBd0I7QUFFakMsU0FBUyxzQkFBc0I7QUFDL0IsU0FBUyw4QkFBOEI7QUFFdkMsTUFBTSx1QkFBdUIsTUFBTTtBQUNsQyxRQUFNLGNBQWMsd0NBQXdDO0FBRTVELE1BQUk7QUFDSixNQUFJO0FBRUosUUFB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
