import assert from "assert";
import { ResourceSet } from "../../../../../../../base/common/map.js";
import { URI } from "../../../../../../../base/common/uri.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../../../../base/test/common/utils.js";
import { ContextKeyService } from "../../../../../../../platform/contextkey/browser/contextKeyService.js";
import { TestConfigurationService } from "../../../../../../../platform/configuration/test/common/testConfigurationService.js";
import { ExtensionIdentifier } from "../../../../../../../platform/extensions/common/extensions.js";
import { IFileService } from "../../../../../../../platform/files/common/files.js";
import { ILabelService } from "../../../../../../../platform/label/common/label.js";
import { MarkerSeverity, MarkerTag } from "../../../../../../../platform/markers/common/markers.js";
import { workbenchInstantiationService } from "../../../../../../test/browser/workbenchTestServices.js";
import { LanguageModelToolsService } from "../../../../browser/tools/languageModelToolsService.js";
import { ChatMode, CustomChatMode, IChatModeService } from "../../../../common/chatModes.js";
import { ChatAgentLocation, ChatConfiguration } from "../../../../common/constants.js";
import { ILanguageModelToolsService, ToolDataSource } from "../../../../common/tools/languageModelToolsService.js";
import { ILanguageModelChatMetadata, ILanguageModelsService } from "../../../../common/languageModels.js";
import { getPromptFileExtension } from "../../../../common/promptSyntax/config/promptFileLocations.js";
import { PromptValidator } from "../../../../common/promptSyntax/languageProviders/promptValidator.js";
import { PromptsType, Target } from "../../../../common/promptSyntax/promptTypes.js";
import { PromptFileParser } from "../../../../common/promptSyntax/promptFileParser.js";
import { IPromptsService, PromptsStorage } from "../../../../common/promptSyntax/service/promptsService.js";
import { MockChatModeService } from "../../../common/mockChatModeService.js";
import { MockPromptsService } from "../../../common/promptSyntax/service/mockPromptsService.js";
suite("PromptValidator", () => {
  const disposables = ensureNoDisposablesAreLeakedInTestSuite();
  let instaService;
  let testConfigService;
  const existingRef1 = URI.parse("myFs://test/reference1.md");
  const existingRef2 = URI.parse("myFs://test/reference2.md");
  setup(async () => {
    testConfigService = new TestConfigurationService();
    testConfigService.setUserConfiguration(ChatConfiguration.ExtensionToolsEnabled, true);
    instaService = workbenchInstantiationService({
      contextKeyService: () => disposables.add(new ContextKeyService(testConfigService)),
      configurationService: () => testConfigService
    }, disposables);
    instaService.stub(ILabelService, { getUriLabel: (resource) => resource.path });
    const toolService = disposables.add(instaService.createInstance(LanguageModelToolsService));
    const testTool1 = { id: "testTool1", displayName: "tool1", canBeReferencedInPrompt: true, modelDescription: "Test Tool 1", source: ToolDataSource.External, inputSchema: {} };
    disposables.add(toolService.registerToolData(testTool1));
    const testTool2 = { id: "testTool2", displayName: "tool2", canBeReferencedInPrompt: true, toolReferenceName: "tool2", modelDescription: "Test Tool 2", source: ToolDataSource.External, inputSchema: {} };
    disposables.add(toolService.registerToolData(testTool2));
    const shellTool = { id: "shell", displayName: "shell", canBeReferencedInPrompt: true, toolReferenceName: "shell", modelDescription: "Runs commands in the terminal", source: ToolDataSource.External, inputSchema: {} };
    disposables.add(toolService.registerToolData(shellTool));
    const myExtSource = { type: "extension", label: "My Extension", extensionId: new ExtensionIdentifier("My.extension") };
    const testTool3 = { id: "testTool3", displayName: "tool3", canBeReferencedInPrompt: true, toolReferenceName: "tool3", modelDescription: "Test Tool 3", source: myExtSource, inputSchema: {} };
    disposables.add(toolService.registerToolData(testTool3));
    const prExtSource = { type: "extension", label: "GitHub Pull Request Extension", extensionId: new ExtensionIdentifier("github.vscode-pull-request-github") };
    const prExtTool1 = { id: "suggestFix", canBeReferencedInPrompt: true, toolReferenceName: "suggest-fix", modelDescription: "tool4", displayName: "Test Tool 4", source: prExtSource, inputSchema: {} };
    disposables.add(toolService.registerToolData(prExtTool1));
    const toolWithLegacy = { id: "newTool", toolReferenceName: "newToolRef", displayName: "New Tool", canBeReferencedInPrompt: true, modelDescription: "New Tool", source: ToolDataSource.External, inputSchema: {}, legacyToolReferenceFullNames: ["oldToolName", "deprecatedToolName"] };
    disposables.add(toolService.registerToolData(toolWithLegacy));
    const toolSetWithLegacy = disposables.add(toolService.createToolSet(
      ToolDataSource.External,
      "newToolSet",
      "newToolSetRef",
      { description: "New Tool Set", legacyFullNames: ["oldToolSet", "deprecatedToolSet"] }
    ));
    const toolInSet = { id: "toolInSet", toolReferenceName: "toolInSetRef", displayName: "Tool In Set", canBeReferencedInPrompt: false, modelDescription: "Tool In Set", source: ToolDataSource.External, inputSchema: {} };
    disposables.add(toolService.registerToolData(toolInSet));
    disposables.add(toolSetWithLegacy.addTool(toolInSet));
    const anotherToolWithLegacy = { id: "anotherTool", toolReferenceName: "anotherToolRef", displayName: "Another Tool", canBeReferencedInPrompt: true, modelDescription: "Another Tool", source: ToolDataSource.External, inputSchema: {}, legacyToolReferenceFullNames: ["legacyTool"] };
    disposables.add(toolService.registerToolData(anotherToolWithLegacy));
    const anotherToolSetWithLegacy = disposables.add(toolService.createToolSet(
      ToolDataSource.External,
      "anotherToolSet",
      "anotherToolSetRef",
      { description: "Another Tool Set", legacyFullNames: ["legacyToolSet"] }
    ));
    const anotherToolInSet = { id: "anotherToolInSet", toolReferenceName: "anotherToolInSetRef", displayName: "Another Tool In Set", canBeReferencedInPrompt: false, modelDescription: "Another Tool In Set", source: ToolDataSource.External, inputSchema: {} };
    disposables.add(toolService.registerToolData(anotherToolInSet));
    disposables.add(anotherToolSetWithLegacy.addTool(anotherToolInSet));
    const conflictToolSet1 = disposables.add(toolService.createToolSet(
      ToolDataSource.External,
      "conflictSet1",
      "conflictSet1Ref",
      { legacyFullNames: ["sharedLegacyName"] }
    ));
    const conflictTool1 = { id: "conflictTool1", toolReferenceName: "conflictTool1Ref", displayName: "Conflict Tool 1", canBeReferencedInPrompt: false, modelDescription: "Conflict Tool 1", source: ToolDataSource.External, inputSchema: {} };
    disposables.add(toolService.registerToolData(conflictTool1));
    disposables.add(conflictToolSet1.addTool(conflictTool1));
    const conflictToolSet2 = disposables.add(toolService.createToolSet(
      ToolDataSource.External,
      "conflictSet2",
      "conflictSet2Ref",
      { legacyFullNames: ["sharedLegacyName"] }
    ));
    const conflictTool2 = { id: "conflictTool2", toolReferenceName: "conflictTool2Ref", displayName: "Conflict Tool 2", canBeReferencedInPrompt: false, modelDescription: "Conflict Tool 2", source: ToolDataSource.External, inputSchema: {} };
    disposables.add(toolService.registerToolData(conflictTool2));
    disposables.add(conflictToolSet2.addTool(conflictTool2));
    const toolInVscodeSet = { id: "browserTool", toolReferenceName: "openIntegratedBrowser", legacyToolReferenceFullNames: ["openSimpleBrowser"], displayName: "Open Integrated Browser", canBeReferencedInPrompt: true, modelDescription: "Open browser", source: ToolDataSource.Internal, inputSchema: {} };
    disposables.add(toolService.registerToolData(toolInVscodeSet));
    disposables.add(toolService.vscodeToolSet.addTool(toolInVscodeSet));
    instaService.set(ILanguageModelToolsService, toolService);
    const testModels = [
      { id: "mae-4", name: "MAE 4", vendor: "olama", version: "1.0", family: "mae", extension: new ExtensionIdentifier("a.b"), isUserSelectable: true, maxInputTokens: 8192, maxOutputTokens: 1024, capabilities: { agentMode: true, toolCalling: true }, isDefaultForLocation: { [ChatAgentLocation.Chat]: true } },
      { id: "mae-4.1", name: "MAE 4.1", vendor: "copilot", version: "1.0", family: "mae", extension: new ExtensionIdentifier("a.b"), isUserSelectable: true, maxInputTokens: 8192, maxOutputTokens: 1024, capabilities: { agentMode: true, toolCalling: true }, isDefaultForLocation: { [ChatAgentLocation.Chat]: true } },
      { id: "mae-3.5-turbo", name: "MAE 3.5 Turbo", vendor: "copilot", version: "1.0", family: "mae", extension: new ExtensionIdentifier("a.b"), isUserSelectable: true, maxInputTokens: 8192, maxOutputTokens: 1024, isDefaultForLocation: { [ChatAgentLocation.Chat]: true } }
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
    const existingFiles = new ResourceSet([existingRef1, existingRef2]);
    instaService.stub(IFileService, {
      exists(uri) {
        return Promise.resolve(existingFiles.has(uri));
      }
    });
    const promptsService = new MockPromptsService();
    const customMode = {
      id: "custom-mode",
      uri: URI.parse("file:///test/custom-mode.md"),
      name: "Plan",
      description: "A test custom mode",
      tools: ["tool1", "tool2"],
      agentInstructions: { content: "Custom mode body", toolReferences: [] },
      source: { storage: PromptsStorage.local },
      target: Target.Undefined,
      visibility: { userInvocable: true, agentInvocable: true },
      enabled: true
    };
    promptsService.setCustomModes([customMode]);
    instaService.stub(IPromptsService, promptsService);
  });
  async function validate(code, promptType, uri) {
    if (!uri) {
      uri = URI.parse("myFs://test/testFile" + getPromptFileExtension(promptType));
    }
    const result = new PromptFileParser().parse(uri, code);
    const validator = instaService.createInstance(PromptValidator);
    const markers = [];
    await validator.validate(result, promptType, (m) => markers.push(m));
    return markers;
  }
  suite("agents", () => {
    test("correct agent", async () => {
      const content = [
        /* 01 */
        "---",
        /* 02 */
        `description: "Agent mode test"`,
        /* 03 */
        "model: MAE 4.1",
        /* 04 */
        `tools: ['tool1', 'tool2']`,
        /* 05 */
        "---",
        /* 06 */
        "This is a chat agent test.",
        /* 07 */
        "Here is a #tool1 variable and a #file:./reference1.md as well as a [reference](./reference2.md)."
      ].join("\n");
      const markers = await validate(content, PromptsType.agent);
      assert.deepStrictEqual(markers, []);
    });
    test("agent with errors (empty description, unknown tool & model)", async () => {
      const content = [
        /* 01 */
        "---",
        /* 02 */
        `description: ""`,
        // empty description -> error
        /* 03 */
        "model: MAE 4.2",
        // unknown model -> warning
        /* 04 */
        `tools: ['tool1', 'tool2', 'tool4', 'my.extension/tool3']`,
        // tool4 unknown -> error
        /* 05 */
        "---",
        /* 06 */
        "Body"
      ].join("\n");
      const markers = await validate(content, PromptsType.agent);
      assert.deepStrictEqual(
        markers.map((m) => ({ severity: m.severity, message: m.message, tags: m.tags })),
        [
          { severity: MarkerSeverity.Error, message: `The 'description' attribute should not be empty.`, tags: void 0 },
          { severity: MarkerSeverity.Hint, message: `Unknown tool 'tool4' will be ignored.`, tags: [MarkerTag.Unnecessary] },
          { severity: MarkerSeverity.Hint, message: `Unknown model 'MAE 4.2' will be ignored.`, tags: [MarkerTag.Unnecessary] }
        ]
      );
    });
    test("tools must be array or string", async () => {
      const content = [
        "---",
        'description: "Test"',
        `tools: 'tool1'`,
        "---"
      ].join("\n");
      const markers = await validate(content, PromptsType.agent);
      assert.strictEqual(markers.length, 0);
    });
    test("model as string array - valid", async () => {
      const content = [
        "---",
        'description: "Test with model array"',
        `model: ['MAE 4 (olama)', 'MAE 4.1']`,
        "---"
      ].join("\n");
      const markers = await validate(content, PromptsType.agent);
      assert.deepStrictEqual(markers, []);
    });
    test("model as string array - unknown model is ignored", async () => {
      const content = [
        "---",
        'description: "Test with model array"',
        `model: ['MAE 4 (olama)', 'Unknown Model']`,
        "---"
      ].join("\n");
      const markers = await validate(content, PromptsType.agent);
      assert.strictEqual(markers.length, 1);
      assert.strictEqual(markers[0].severity, MarkerSeverity.Hint);
      assert.deepStrictEqual(markers[0].tags, [MarkerTag.Unnecessary]);
      assert.strictEqual(markers[0].message, `Unknown model 'Unknown Model' will be ignored.`);
    });
    test("model as string array - unsuitable model", async () => {
      const content = [
        "---",
        'description: "Test with model array"',
        `model: ['MAE 4 (olama)', 'MAE 3.5 Turbo']`,
        "---"
      ].join("\n");
      const markers = await validate(content, PromptsType.agent);
      assert.strictEqual(markers.length, 1);
      assert.strictEqual(markers[0].severity, MarkerSeverity.Warning);
      assert.strictEqual(markers[0].message, `Model 'MAE 3.5 Turbo' is not suited for agent mode.`);
    });
    test("model as string array - empty array", async () => {
      const content = [
        "---",
        'description: "Test with empty model array"',
        `model: []`,
        "---"
      ].join("\n");
      const markers = await validate(content, PromptsType.agent);
      assert.strictEqual(markers.length, 1);
      assert.strictEqual(markers[0].severity, MarkerSeverity.Error);
      assert.strictEqual(markers[0].message, `The 'model' array must not be empty.`);
    });
    test("model as string array - non-string item", async () => {
      const content = [
        "---",
        'description: "Test with invalid model array"',
        `model: ['MAE 4 (olama)', []]`,
        "---"
      ].join("\n");
      const markers = await validate(content, PromptsType.agent);
      assert.strictEqual(markers.length, 1);
      assert.strictEqual(markers[0].severity, MarkerSeverity.Error);
      assert.strictEqual(markers[0].message, `The 'model' array must contain only strings.`);
    });
    test("model as string array - empty string item", async () => {
      const content = [
        "---",
        'description: "Test with empty string in model array"',
        `model: ['MAE 4 (olama)', '']`,
        "---"
      ].join("\n");
      const markers = await validate(content, PromptsType.agent);
      assert.strictEqual(markers.length, 1);
      assert.strictEqual(markers[0].severity, MarkerSeverity.Error);
      assert.strictEqual(markers[0].message, `Model names in the array must be non-empty strings.`);
    });
    test("model as invalid type", async () => {
      const content = [
        "---",
        'description: "Test with invalid model type"',
        `model: {}`,
        "---"
      ].join("\n");
      const markers = await validate(content, PromptsType.agent);
      assert.strictEqual(markers.length, 1);
      assert.strictEqual(markers[0].severity, MarkerSeverity.Error);
      assert.strictEqual(markers[0].message, `The 'model' attribute must be a string or an array of strings.`);
    });
    test("each tool must be string", async () => {
      const content = [
        "---",
        'description: "Test"',
        `tools: ['tool1', {}]`,
        "---"
      ].join("\n");
      const markers = await validate(content, PromptsType.agent);
      assert.deepStrictEqual(
        markers.map((m) => ({ severity: m.severity, message: m.message })),
        [
          { severity: MarkerSeverity.Error, message: `Each tool name in the 'tools' attribute must be a string.` }
        ]
      );
    });
    test("old tool reference", async () => {
      const content = [
        "---",
        'description: "Test"',
        `tools: ['tool1', 'tool3']`,
        "---"
      ].join("\n");
      const markers = await validate(content, PromptsType.agent);
      assert.deepStrictEqual(
        markers.map((m) => ({ severity: m.severity, message: m.message })),
        [
          { severity: MarkerSeverity.Info, message: `Tool or toolset 'tool3' has been renamed, use 'my.extension/tool3' instead.` }
        ]
      );
    });
    test("legacy tool reference names", async () => {
      {
        const content = [
          "---",
          'description: "Test"',
          `tools: ['tool1', 'oldToolName']`,
          "---"
        ].join("\n");
        const markers = await validate(content, PromptsType.agent);
        assert.deepStrictEqual(
          markers.map((m) => ({ severity: m.severity, message: m.message })),
          [
            { severity: MarkerSeverity.Info, message: `Tool or toolset 'oldToolName' has been renamed, use 'newToolRef' instead.` }
          ]
        );
      }
      {
        const content = [
          "---",
          'description: "Test"',
          `tools: ['tool1', 'deprecatedToolName']`,
          "---"
        ].join("\n");
        const markers = await validate(content, PromptsType.agent);
        assert.deepStrictEqual(
          markers.map((m) => ({ severity: m.severity, message: m.message })),
          [
            { severity: MarkerSeverity.Info, message: `Tool or toolset 'deprecatedToolName' has been renamed, use 'newToolRef' instead.` }
          ]
        );
      }
    });
    test("legacy toolset names", async () => {
      {
        const content = [
          "---",
          'description: "Test"',
          `tools: ['tool1', 'oldToolSet']`,
          "---"
        ].join("\n");
        const markers = await validate(content, PromptsType.agent);
        assert.deepStrictEqual(
          markers.map((m) => ({ severity: m.severity, message: m.message })),
          [
            { severity: MarkerSeverity.Info, message: `Tool or toolset 'oldToolSet' has been renamed, use 'newToolSetRef' instead.` }
          ]
        );
      }
      {
        const content = [
          "---",
          'description: "Test"',
          `tools: ['tool1', 'deprecatedToolSet']`,
          "---"
        ].join("\n");
        const markers = await validate(content, PromptsType.agent);
        assert.deepStrictEqual(
          markers.map((m) => ({ severity: m.severity, message: m.message })),
          [
            { severity: MarkerSeverity.Info, message: `Tool or toolset 'deprecatedToolSet' has been renamed, use 'newToolSetRef' instead.` }
          ]
        );
      }
    });
    test("multiple legacy names in same tools list", async () => {
      const content = [
        "---",
        'description: "Test"',
        `tools: ['legacyTool', 'legacyToolSet', 'tool3']`,
        "---"
      ].join("\n");
      const markers = await validate(content, PromptsType.agent);
      assert.deepStrictEqual(
        markers.map((m) => ({ severity: m.severity, message: m.message })),
        [
          { severity: MarkerSeverity.Info, message: `Tool or toolset 'legacyTool' has been renamed, use 'anotherToolRef' instead.` },
          { severity: MarkerSeverity.Info, message: `Tool or toolset 'legacyToolSet' has been renamed, use 'anotherToolSetRef' instead.` },
          { severity: MarkerSeverity.Info, message: `Tool or toolset 'tool3' has been renamed, use 'my.extension/tool3' instead.` }
        ]
      );
    });
    test("deprecated tool name mapping to multiple new names", async () => {
      const content = [
        "---",
        'description: "Test"',
        `tools: ['sharedLegacyName']`,
        "---"
      ].join("\n");
      const markers = await validate(content, PromptsType.agent);
      assert.strictEqual(markers.length, 1);
      assert.strictEqual(markers[0].severity, MarkerSeverity.Info);
      const expectedMessage = `Tool or toolset 'sharedLegacyName' has been renamed, use the following tools instead: conflictSet1Ref, conflictSet2Ref`;
      assert.strictEqual(markers[0].message, expectedMessage);
    });
    test("deprecated tool name in body variable reference - single mapping", async () => {
      const content = [
        "---",
        'description: "Test"',
        "---",
        "Body with #tool:oldToolName reference"
      ].join("\n");
      const markers = await validate(content, PromptsType.agent);
      assert.strictEqual(markers.length, 1);
      assert.strictEqual(markers[0].severity, MarkerSeverity.Info);
      assert.strictEqual(markers[0].message, `Tool or toolset 'oldToolName' has been renamed, use 'newToolRef' instead.`);
    });
    test("deprecated tool name in body variable reference - multiple mappings", async () => {
      const multiMapToolSet1 = disposables.add(instaService.get(ILanguageModelToolsService).createToolSet(
        ToolDataSource.External,
        "multiMapSet1",
        "multiMapSet1Ref",
        { legacyFullNames: ["multiMapLegacy"] }
      ));
      const multiMapTool1 = { id: "multiMapTool1", toolReferenceName: "multiMapTool1Ref", displayName: "Multi Map Tool 1", canBeReferencedInPrompt: true, modelDescription: "Multi Map Tool 1", source: ToolDataSource.External, inputSchema: {} };
      disposables.add(instaService.get(ILanguageModelToolsService).registerToolData(multiMapTool1));
      disposables.add(multiMapToolSet1.addTool(multiMapTool1));
      const multiMapToolSet2 = disposables.add(instaService.get(ILanguageModelToolsService).createToolSet(
        ToolDataSource.External,
        "multiMapSet2",
        "multiMapSet2Ref",
        { legacyFullNames: ["multiMapLegacy"] }
      ));
      const multiMapTool2 = { id: "multiMapTool2", toolReferenceName: "multiMapTool2Ref", displayName: "Multi Map Tool 2", canBeReferencedInPrompt: true, modelDescription: "Multi Map Tool 2", source: ToolDataSource.External, inputSchema: {} };
      disposables.add(instaService.get(ILanguageModelToolsService).registerToolData(multiMapTool2));
      disposables.add(multiMapToolSet2.addTool(multiMapTool2));
      const content = [
        "---",
        'description: "Test"',
        "---",
        "Body with #tool:multiMapLegacy reference"
      ].join("\n");
      const markers = await validate(content, PromptsType.agent);
      assert.strictEqual(markers.length, 1);
      assert.strictEqual(markers[0].severity, MarkerSeverity.Info);
      const expectedMessage = `Tool or toolset 'multiMapLegacy' has been renamed, use the following tools instead: multiMapSet1Ref, multiMapSet2Ref`;
      assert.strictEqual(markers[0].message, expectedMessage);
    });
    test("namespaced deprecated tool name in tools header shows rename hint", async () => {
      const content = [
        "---",
        'description: "Test"',
        `tools: ['vscode/openSimpleBrowser']`,
        "---"
      ].join("\n");
      const markers = await validate(content, PromptsType.agent);
      assert.deepStrictEqual(
        markers.map((m) => ({ severity: m.severity, message: m.message })),
        [
          { severity: MarkerSeverity.Info, message: `Tool or toolset 'vscode/openSimpleBrowser' has been renamed, use 'vscode/openIntegratedBrowser' instead.` }
        ]
      );
    });
    test("bare deprecated tool name in tools header also shows rename hint", async () => {
      const content = [
        "---",
        'description: "Test"',
        `tools: ['openSimpleBrowser']`,
        "---"
      ].join("\n");
      const markers = await validate(content, PromptsType.agent);
      assert.deepStrictEqual(
        markers.map((m) => ({ severity: m.severity, message: m.message })),
        [
          { severity: MarkerSeverity.Info, message: `Tool or toolset 'openSimpleBrowser' has been renamed, use 'vscode/openIntegratedBrowser' instead.` }
        ]
      );
    });
    test("unknown attribute in agent file", async () => {
      const content = [
        "---",
        'description: "Test"',
        `applyTo: '*.ts'`,
        // not allowed in agent file
        "---"
      ].join("\n");
      const markers = await validate(content, PromptsType.agent);
      assert.deepStrictEqual(
        markers.map((m) => ({ severity: m.severity, message: m.message, tags: m.tags })),
        [
          { severity: MarkerSeverity.Hint, message: `Attribute 'applyTo' is not supported in VS Code agent files. Supported: agents, argument-hint, description, disable-model-invocation, github, handoffs, hooks, model, name, target, tools, user-invocable.`, tags: [MarkerTag.Unnecessary] }
        ]
      );
    });
    test("tools with invalid handoffs", async () => {
      {
        const content = [
          "---",
          'description: "Test"',
          `handoffs: next`,
          "---"
        ].join("\n");
        const markers = await validate(content, PromptsType.agent);
        assert.strictEqual(markers.length, 1);
        assert.deepStrictEqual(markers.map((m) => m.message), [`The 'handoffs' attribute must be an array.`]);
      }
      {
        const content = [
          "---",
          'description: "Test"',
          `handoffs:`,
          `  - label: '123'`,
          "---"
        ].join("\n");
        const markers = await validate(content, PromptsType.agent);
        assert.strictEqual(markers.length, 1);
        assert.deepStrictEqual(markers.map((m) => m.message), [`Missing required properties 'agent', 'prompt' in handoff object.`]);
      }
      {
        const content = [
          "---",
          'description: "Test"',
          `handoffs:`,
          `  - label: '123'`,
          `    agent: ''`,
          `    prompt: ''`,
          `    send: true`,
          "---"
        ].join("\n");
        const markers = await validate(content, PromptsType.agent);
        assert.strictEqual(markers.length, 1);
        assert.deepStrictEqual(markers.map((m) => m.message), [`The 'agent' property in a handoff must be a non-empty string.`]);
      }
      {
        const content = [
          "---",
          'description: "Test"',
          `handoffs:`,
          `  - label: '123'`,
          `    agent: 'Cool'`,
          `    prompt: ''`,
          `    send: true`,
          "---"
        ].join("\n");
        const markers = await validate(content, PromptsType.agent);
        assert.strictEqual(markers.length, 1);
        assert.deepStrictEqual(markers.map((m) => m.message), [`Unknown agent 'Cool'. Available agents: agent, ask, edit, BeastMode.`]);
      }
    });
    test("agent with handoffs attribute", async () => {
      const content = [
        "---",
        'description: "Test agent with handoffs"',
        `handoffs:`,
        "  - label: Test Prompt",
        "    agent: agent",
        "    prompt: Add tests for this code",
        "  - label: Optimize Performance",
        "    agent: agent",
        "    prompt: Optimize for performance",
        "---",
        "Body"
      ].join("\n");
      const markers = await validate(content, PromptsType.agent);
      assert.deepStrictEqual(markers, [], "Expected no validation issues for handoffs attribute");
    });
    test("duplicate handoff labels are reported", async () => {
      const content = [
        "---",
        'description: "Test"',
        `handoffs:`,
        "  - label: Start Implementation",
        "    agent: agent",
        "    prompt: Go implement",
        "  - label: Start Implementation",
        "    agent: agent",
        "    prompt: Go implement again",
        "---"
      ].join("\n");
      const markers = await validate(content, PromptsType.agent);
      assert.deepStrictEqual(markers.map((m) => m.message), [
        "Duplicate handoff label 'Start Implementation'. Each handoff must have a unique label."
      ]);
    });
    test("duplicate handoff labels are case-insensitive", async () => {
      const content = [
        "---",
        'description: "Test"',
        `handoffs:`,
        "  - label: Start Implementation",
        "    agent: agent",
        "    prompt: Go implement",
        "  - label: start implementation",
        "    agent: edit",
        "    prompt: Different prompt",
        "---"
      ].join("\n");
      const markers = await validate(content, PromptsType.agent);
      assert.deepStrictEqual(markers.map((m) => m.message), [
        "Duplicate handoff label 'start implementation'. Each handoff must have a unique label."
      ]);
    });
    test("handoff label must contain alphanumeric character", async () => {
      const content = [
        "---",
        'description: "Test"',
        `handoffs:`,
        '  - label: "!!!"',
        "    agent: agent",
        "    prompt: Go",
        "---"
      ].join("\n");
      const markers = await validate(content, PromptsType.agent);
      assert.deepStrictEqual(markers.map((m) => m.message), [
        "The 'label' property in a handoff must contain at least one alphanumeric character."
      ]);
    });
    test("github-copilot agent with supported attributes", async () => {
      const content = [
        "---",
        'name: "GitHub_Copilot_Custom_Agent"',
        'description: "GitHub Copilot agent"',
        "target: github-copilot",
        `tools: ['shell', 'edit', 'search', 'custom-agent']`,
        "mcp-servers: []",
        "---",
        "Body with #search and #edit references"
      ].join("\n");
      const markers = await validate(content, PromptsType.agent);
      assert.deepStrictEqual(markers, [], "Expected no validation issues for github-copilot target");
    });
    test("github-copilot agent warns about model and handoffs attributes", async () => {
      const content = [
        "---",
        'name: "GitHubAgent"',
        'description: "GitHub Copilot agent"',
        "target: github-copilot",
        "model: MAE 4.1",
        `tools: ['shell', 'edit']`,
        `handoffs:`,
        "  - label: Test",
        "    agent: Default",
        "    prompt: Test",
        "---",
        "Body"
      ].join("\n");
      const markers = await validate(content, PromptsType.agent);
      const messages = markers.map((m) => m.message);
      assert.deepStrictEqual(messages, [
        "Attribute 'model' is not supported in custom GitHub Copilot agent files. Supported: description, github, infer, mcp-servers, name, target, tools.",
        "Attribute 'handoffs' is not supported in custom GitHub Copilot agent files. Supported: description, github, infer, mcp-servers, name, target, tools."
      ], "Model and handoffs are not validated for github-copilot target");
    });
    test("github-copilot agent does not validate variable references", async () => {
      const content = [
        "---",
        'name: "GitHubAgent"',
        'description: "GitHub Copilot agent"',
        "target: github-copilot",
        `tools: ['shell', 'edit']`,
        "---",
        "Body with #unknownTool reference"
      ].join("\n");
      const markers = await validate(content, PromptsType.agent);
      assert.deepStrictEqual(markers, [], "Variable references are not validated for github-copilot target");
    });
    test("github-copilot agent rejects unsupported attributes", async () => {
      const content = [
        "---",
        'name: "GitHubAgent"',
        'description: "GitHub Copilot agent"',
        "target: github-copilot",
        'argument-hint: "test hint"',
        `tools: ['shell']`,
        "---",
        "Body"
      ].join("\n");
      const markers = await validate(content, PromptsType.agent);
      assert.strictEqual(markers.length, 1);
      assert.strictEqual(markers[0].severity, MarkerSeverity.Hint);
      assert.deepStrictEqual(markers[0].tags, [MarkerTag.Unnecessary]);
      assert.ok(markers[0].message.includes(`Attribute 'argument-hint' is not supported`), "Expected hint about unsupported attribute");
    });
    test("github-copilot agent with valid permissions", async () => {
      const content = [
        "---",
        'name: "IssueTriage"',
        'description: "Triages issues"',
        "target: github-copilot",
        `tools: ['read']`,
        "github:",
        "  permissions:",
        "    issues: write",
        "    contents: read",
        "    metadata: read",
        "---",
        "Body"
      ].join("\n");
      const markers = await validate(content, PromptsType.agent);
      assert.deepStrictEqual(markers, []);
    });
    test("github-copilot agent with invalid permission scope", async () => {
      const content = [
        "---",
        'name: "TestAgent"',
        'description: "Test"',
        "target: github-copilot",
        `tools: ['read']`,
        "github:",
        "  permissions:",
        "    unknown-scope: read",
        "---",
        "Body"
      ].join("\n");
      const markers = await validate(content, PromptsType.agent);
      assert.strictEqual(markers.length, 1);
      assert.strictEqual(markers[0].severity, MarkerSeverity.Warning);
      assert.ok(markers[0].message.includes("Unknown permission scope 'unknown-scope'"));
    });
    test("github-copilot agent with invalid permission value", async () => {
      const content = [
        "---",
        'name: "TestAgent"',
        'description: "Test"',
        "target: github-copilot",
        `tools: ['read']`,
        "github:",
        "  permissions:",
        "    metadata: write",
        "---",
        "Body"
      ].join("\n");
      const markers = await validate(content, PromptsType.agent);
      assert.strictEqual(markers.length, 1);
      assert.strictEqual(markers[0].severity, MarkerSeverity.Error);
      assert.ok(markers[0].message.includes("Invalid permission value 'write' for scope 'metadata'"));
    });
    test("github-copilot agent with non-map github attribute", async () => {
      const content = [
        "---",
        'name: "TestAgent"',
        'description: "Test"',
        "target: github-copilot",
        `tools: ['read']`,
        "github: invalid",
        "---",
        "Body"
      ].join("\n");
      const markers = await validate(content, PromptsType.agent);
      assert.strictEqual(markers.length, 1);
      assert.strictEqual(markers[0].severity, MarkerSeverity.Error);
      assert.strictEqual(markers[0].message, "The 'github' attribute must be an object.");
    });
    test("github-copilot agent with unknown github sub-property", async () => {
      const content = [
        "---",
        'name: "TestAgent"',
        'description: "Test"',
        "target: github-copilot",
        `tools: ['read']`,
        "github:",
        "  unknown: value",
        "---",
        "Body"
      ].join("\n");
      const markers = await validate(content, PromptsType.agent);
      assert.strictEqual(markers.length, 1);
      assert.strictEqual(markers[0].severity, MarkerSeverity.Warning);
      assert.ok(markers[0].message.includes("Unknown property 'unknown'"));
    });
    test("undefined target agent with valid github permissions", async () => {
      const content = [
        "---",
        'description: "Agent without target"',
        "github:",
        "  permissions:",
        "    issues: write",
        "    contents: read",
        "---",
        "Body"
      ].join("\n");
      const markers = await validate(content, PromptsType.agent);
      assert.deepStrictEqual(markers, []);
    });
    test("undefined target agent with invalid github permission scope", async () => {
      const content = [
        "---",
        'description: "Agent without target"',
        "github:",
        "  permissions:",
        "    unknown-scope: read",
        "---",
        "Body"
      ].join("\n");
      const markers = await validate(content, PromptsType.agent);
      assert.strictEqual(markers.length, 1);
      assert.strictEqual(markers[0].severity, MarkerSeverity.Warning);
      assert.ok(markers[0].message.includes("Unknown permission scope 'unknown-scope'"));
    });
    test("undefined target agent with invalid github permission value", async () => {
      const content = [
        "---",
        'description: "Agent without target"',
        "github:",
        "  permissions:",
        "    metadata: write",
        "---",
        "Body"
      ].join("\n");
      const markers = await validate(content, PromptsType.agent);
      assert.strictEqual(markers.length, 1);
      assert.strictEqual(markers[0].severity, MarkerSeverity.Error);
      assert.ok(markers[0].message.includes("Invalid permission value 'write' for scope 'metadata'"));
    });
    test("undefined target agent with non-map github attribute", async () => {
      const content = [
        "---",
        'description: "Agent without target"',
        "github: invalid",
        "---",
        "Body"
      ].join("\n");
      const markers = await validate(content, PromptsType.agent);
      assert.strictEqual(markers.length, 1);
      assert.strictEqual(markers[0].severity, MarkerSeverity.Error);
      assert.strictEqual(markers[0].message, "The 'github' attribute must be an object.");
    });
    test("vscode target agent validates normally", async () => {
      const content = [
        "---",
        'description: "VS Code agent"',
        "target: vscode",
        "model: MAE 4.1",
        `tools: ['tool1', 'tool2']`,
        "---",
        "Body with #tool1"
      ].join("\n");
      const markers = await validate(content, PromptsType.agent);
      assert.deepStrictEqual(markers, [], "VS Code target should validate normally");
    });
    test("vscode target agent marks unknown tools as unnecessary hints", async () => {
      const content = [
        "---",
        'description: "VS Code agent"',
        "target: vscode",
        `tools: ['tool1', 'unknownTool']`,
        "---",
        "Body"
      ].join("\n");
      const markers = await validate(content, PromptsType.agent);
      assert.strictEqual(markers.length, 1);
      assert.strictEqual(markers[0].severity, MarkerSeverity.Hint);
      assert.deepStrictEqual(markers[0].tags, [MarkerTag.Unnecessary]);
      assert.strictEqual(markers[0].message, `Unknown tool 'unknownTool' will be ignored.`);
    });
    test("vscode target agent with mcp-servers and github-tools", async () => {
      const content = [
        "---",
        'description: "VS Code agent"',
        "target: vscode",
        `tools: ['tool1', 'edit']`,
        `mcp-servers: {}`,
        "---",
        "Body"
      ].join("\n");
      const markers = await validate(content, PromptsType.agent);
      const messages = markers.map((m) => m.message);
      assert.deepStrictEqual(messages, [
        "Attribute 'mcp-servers' is ignored when running locally in VS Code.",
        "Unknown tool 'edit' will be ignored."
      ]);
    });
    test("undefined target with mcp-servers and github-tools", async () => {
      const content = [
        "---",
        'description: "VS Code agent"',
        `tools: ['tool1', 'shell']`,
        `mcp-servers: {}`,
        "---",
        "Body"
      ].join("\n");
      const markers = await validate(content, PromptsType.agent);
      const messages = markers.map((m) => m.message);
      assert.deepStrictEqual(messages, [
        "Attribute 'mcp-servers' is ignored when running locally in VS Code."
      ]);
    });
    test("default target (no target specified) validates as vscode", async () => {
      const content = [
        "---",
        'description: "Agent without target"',
        "model: MAE 4.1",
        `tools: ['tool1']`,
        'argument-hint: "test hint"',
        "---",
        "Body"
      ].join("\n");
      const markers = await validate(content, PromptsType.agent);
      assert.deepStrictEqual(markers, [], "Agent without target should validate as vscode");
    });
    test("name attribute validation", async () => {
      {
        const content = [
          "---",
          'name: "MyAgent"',
          'description: "Test agent"',
          "target: vscode",
          "---",
          "Body"
        ].join("\n");
        const markers = await validate(content, PromptsType.agent);
        assert.deepStrictEqual(markers, [], "Valid name should not produce errors");
      }
      {
        const content = [
          "---",
          'name: ""',
          'description: "Test agent"',
          "target: vscode",
          "---",
          "Body"
        ].join("\n");
        const markers = await validate(content, PromptsType.agent);
        assert.strictEqual(markers.length, 1);
        assert.strictEqual(markers[0].severity, MarkerSeverity.Error);
        assert.strictEqual(markers[0].message, `The 'name' attribute must not be empty.`);
      }
      {
        const content = [
          "---",
          "name: []",
          'description: "Test agent"',
          "target: vscode",
          "---",
          "Body"
        ].join("\n");
        const markers = await validate(content, PromptsType.agent);
        assert.strictEqual(markers.length, 1);
        assert.strictEqual(markers[0].severity, MarkerSeverity.Error);
        assert.strictEqual(markers[0].message, `The 'name' attribute must be a string.`);
      }
      {
        const content = [
          "---",
          'name: "My_Agent-2.0 with spaces"',
          'description: "Test agent"',
          "target: vscode",
          "---",
          "Body"
        ].join("\n");
        const markers = await validate(content, PromptsType.agent);
        assert.deepStrictEqual(markers, [], "Name with allowed characters should be valid");
      }
    });
    test("github-copilot target requires name attribute", async () => {
      {
        const content = [
          "---",
          'description: "GitHub Copilot agent"',
          "target: github-copilot",
          `tools: ['shell']`,
          "---",
          "Body"
        ].join("\n");
        const markers = await validate(content, PromptsType.agent);
        assert.strictEqual(markers.length, 0);
      }
      {
        const content = [
          "---",
          'name: "GitHubAgent"',
          'description: "GitHub Copilot agent"',
          "target: github-copilot",
          `tools: ['shell']`,
          "---",
          "Body"
        ].join("\n");
        const markers = await validate(content, PromptsType.agent);
        assert.deepStrictEqual(markers, [], "Valid github-copilot agent with name should not produce errors");
      }
      {
        const content = [
          "---",
          'description: "VS Code agent"',
          "target: vscode",
          `tools: ['tool1']`,
          "---",
          "Body"
        ].join("\n");
        const markers = await validate(content, PromptsType.agent);
        assert.deepStrictEqual(markers, [], "Name should be optional for vscode target");
      }
    });
    test("infer attribute validation", async () => {
      const deprecationMessage = `The 'infer' attribute is deprecated in favour of 'user-invocable' and 'disable-model-invocation'.`;
      {
        const content = [
          "---",
          'name: "TestAgent"',
          'description: "Test agent"',
          "infer: true",
          "---",
          "Body"
        ].join("\n");
        const markers = await validate(content, PromptsType.agent);
        assert.strictEqual(markers.length, 1, "infer: true should produce deprecation warning");
        assert.strictEqual(markers[0].message, deprecationMessage);
        assert.strictEqual(markers[0].severity, MarkerSeverity.Error);
      }
      {
        const content = [
          "---",
          'name: "TestAgent"',
          'description: "Test agent"',
          "infer: false",
          "---",
          "Body"
        ].join("\n");
        const markers = await validate(content, PromptsType.agent);
        assert.strictEqual(markers.length, 1, "infer: false should produce deprecation warning");
        assert.strictEqual(markers[0].message, deprecationMessage);
        assert.strictEqual(markers[0].severity, MarkerSeverity.Error);
      }
      {
        const content = [
          "---",
          'name: "TestAgent"',
          'description: "Test agent"',
          'infer: "yes"',
          "---",
          "Body"
        ].join("\n");
        const markers = await validate(content, PromptsType.agent);
        assert.strictEqual(markers.length, 1, 'infer: "yes" should produce deprecation warning');
        assert.strictEqual(markers[0].message, deprecationMessage);
        assert.strictEqual(markers[0].severity, MarkerSeverity.Error);
      }
      {
        const content = [
          "---",
          'name: "TestAgent"',
          'description: "Test agent"',
          "---",
          "Body"
        ].join("\n");
        const markers = await validate(content, PromptsType.agent);
        assert.deepStrictEqual(markers, [], "Missing infer attribute should be allowed");
      }
    });
    test("agents attribute must be an array", async () => {
      const content = [
        "---",
        'description: "Test"',
        `agents: 'myAgent'`,
        "---"
      ].join("\n");
      const markers = await validate(content, PromptsType.agent);
      assert.deepStrictEqual(markers.map((m) => m.message), [`The 'agents' attribute must be an array.`]);
    });
    test("each agent name in agents attribute must be a string", async () => {
      const content = [
        "---",
        'description: "Test"',
        `agents: ['agent', {}]`,
        `tools: ['agent']`,
        "---"
      ].join("\n");
      const markers = await validate(content, PromptsType.agent);
      assert.deepStrictEqual(markers.map((m) => m.message), [`Each agent name in the 'agents' attribute must be a string.`]);
    });
    test("unknown agent in agents attribute shows unnecessary hint", async () => {
      const content = [
        "---",
        'description: "Test"',
        `agents: ['UnknownAgent']`,
        `tools: ['agent']`,
        "---"
      ].join("\n");
      const markers = await validate(content, PromptsType.agent);
      assert.strictEqual(markers.length, 1);
      assert.strictEqual(markers[0].severity, MarkerSeverity.Hint);
      assert.deepStrictEqual(markers[0].tags, [MarkerTag.Unnecessary]);
      assert.strictEqual(markers[0].message, `Unknown agent 'UnknownAgent' will be ignored. Available agents: Plan, agent.`);
    });
    test("agents attribute with non-empty value requires agent tool 1", async () => {
      const content = [
        "---",
        'description: "Test"',
        `agents: ['agent', 'Plan']`,
        "---"
      ].join("\n");
      const markers = await validate(content, PromptsType.agent);
      assert.deepStrictEqual(markers.map((m) => m.message), [], `No warnings about agents attribute when no tools are specified`);
    });
    test("agents attribute with non-empty value requires agent tool 2", async () => {
      const content = [
        "---",
        'description: "Test"',
        `agents: ['agent', 'Plan']`,
        `tools: ['shell']`,
        "---"
      ].join("\n");
      const markers = await validate(content, PromptsType.agent);
      assert.deepStrictEqual(markers.map((m) => m.message), [`When 'agents' and 'tools' are specified, the 'agent' tool must be included in the 'tools' attribute.`]);
    });
    test("agents attribute with non-empty value requires agent tool 3", async () => {
      const content = [
        "---",
        'description: "Test"',
        `agents: ['agent', 'Plan']`,
        `tools: ['agent']`,
        "---"
      ].join("\n");
      const markers = await validate(content, PromptsType.agent);
      assert.deepStrictEqual(markers.map((m) => m.message), [], `No warnings about agents attribute when agent tool is in header`);
    });
    test("agents attribute with non-empty value requires agent tool 4", async () => {
      const content = [
        "---",
        'description: "Test"',
        `agents: ['*']`,
        `tools: ['shell']`,
        "---"
      ].join("\n");
      const markers = await validate(content, PromptsType.agent);
      assert.deepStrictEqual(markers.map((m) => m.message), [`When 'agents' and 'tools' are specified, the 'agent' tool must be included in the 'tools' attribute.`]);
    });
    test("agents attribute with empty array does not require agent tool", async () => {
      const content = [
        "---",
        'description: "Test"',
        `agents: []`,
        "---"
      ].join("\n");
      const markers = await validate(content, PromptsType.agent);
      assert.deepStrictEqual(markers, [], "Empty array should not require agent tool");
    });
    test("user-invocable attribute validation", async () => {
      {
        const content = [
          "---",
          'name: "TestAgent"',
          'description: "Test agent"',
          "user-invocable: true",
          "---",
          "Body"
        ].join("\n");
        const markers = await validate(content, PromptsType.agent);
        assert.deepStrictEqual(markers, [], "Valid user-invocable: true should not produce errors");
      }
      {
        const content = [
          "---",
          'name: "TestAgent"',
          'description: "Test agent"',
          "user-invocable: false",
          "---",
          "Body"
        ].join("\n");
        const markers = await validate(content, PromptsType.agent);
        assert.deepStrictEqual(markers, [], "Valid user-invocable: false should not produce errors");
      }
      {
        const content = [
          "---",
          'name: "TestAgent"',
          'description: "Test agent"',
          'user-invocable: "yes"',
          "---",
          "Body"
        ].join("\n");
        const markers = await validate(content, PromptsType.agent);
        assert.strictEqual(markers.length, 1);
        assert.strictEqual(markers[0].severity, MarkerSeverity.Error);
        assert.strictEqual(markers[0].message, `The 'user-invocable' attribute must be 'true' or 'false'.`);
      }
      {
        const content = [
          "---",
          'name: "TestAgent"',
          'description: "Test agent"',
          "user-invocable: 1",
          "---",
          "Body"
        ].join("\n");
        const markers = await validate(content, PromptsType.agent);
        assert.strictEqual(markers.length, 1);
        assert.strictEqual(markers[0].severity, MarkerSeverity.Error);
        assert.strictEqual(markers[0].message, `The 'user-invocable' attribute must be 'true' or 'false'.`);
      }
    });
    test("removed user-invokable attribute is reported as unknown", async () => {
      const content = [
        "---",
        'name: "TestAgent"',
        'description: "Test agent"',
        "user-invokable: true",
        "---",
        "Body"
      ].join("\n");
      const markers = await validate(content, PromptsType.agent);
      assert.strictEqual(markers.length, 1, "user-invokable should produce exactly one diagnostic");
      assert.strictEqual(markers[0].severity, MarkerSeverity.Hint);
      assert.deepStrictEqual(markers[0].tags, [MarkerTag.Unnecessary]);
      assert.ok(markers[0].message.includes("user-invokable"), "hint should mention the attribute name");
      assert.ok(markers[0].message.includes("not supported"), "hint should say attribute is not supported");
    });
    test("disable-model-invocation attribute validation", async () => {
      {
        const content = [
          "---",
          'name: "TestAgent"',
          'description: "Test agent"',
          "disable-model-invocation: true",
          "---",
          "Body"
        ].join("\n");
        const markers = await validate(content, PromptsType.agent);
        assert.deepStrictEqual(markers, [], "Valid disable-model-invocation: true should not produce errors");
      }
      {
        const content = [
          "---",
          'name: "TestAgent"',
          'description: "Test agent"',
          "disable-model-invocation: false",
          "---",
          "Body"
        ].join("\n");
        const markers = await validate(content, PromptsType.agent);
        assert.deepStrictEqual(markers, [], "Valid disable-model-invocation: false should not produce errors");
      }
      {
        const content = [
          "---",
          'name: "TestAgent"',
          'description: "Test agent"',
          'disable-model-invocation: "yes"',
          "---",
          "Body"
        ].join("\n");
        const markers = await validate(content, PromptsType.agent);
        assert.strictEqual(markers.length, 1);
        assert.strictEqual(markers[0].severity, MarkerSeverity.Error);
        assert.strictEqual(markers[0].message, `The 'disable-model-invocation' attribute must be 'true' or 'false'.`);
      }
      {
        const content = [
          "---",
          'name: "TestAgent"',
          'description: "Test agent"',
          "disable-model-invocation: 0",
          "---",
          "Body"
        ].join("\n");
        const markers = await validate(content, PromptsType.agent);
        assert.strictEqual(markers.length, 1);
        assert.strictEqual(markers[0].severity, MarkerSeverity.Error);
        assert.strictEqual(markers[0].message, `The 'disable-model-invocation' attribute must be 'true' or 'false'.`);
      }
    });
    test("hooks - valid hook commands", async () => {
      const content = [
        "---",
        'description: "Test"',
        "hooks:",
        "  SessionStart:",
        "    - type: command",
        "      command: echo hello",
        "  PreToolUse:",
        "    - type: command",
        "      command: ./validate.sh",
        "      cwd: scripts",
        "      timeout: 30",
        "---"
      ].join("\n");
      const markers = await validate(content, PromptsType.agent);
      assert.deepStrictEqual(markers, []);
    });
    test("hooks - must be a map", async () => {
      const content = [
        "---",
        'description: "Test"',
        "hooks: invalid",
        "---"
      ].join("\n");
      const markers = await validate(content, PromptsType.agent);
      assert.deepStrictEqual(
        markers.map((m) => ({ severity: m.severity, message: m.message })),
        [
          { severity: MarkerSeverity.Error, message: `The 'hooks' attribute must be a map of hook event types to command arrays.` }
        ]
      );
    });
    test("hooks - unknown hook event type", async () => {
      const content = [
        "---",
        'description: "Test"',
        "hooks:",
        "  UnknownEvent:",
        "    - type: command",
        "      command: echo hello",
        "---"
      ].join("\n");
      const markers = await validate(content, PromptsType.agent);
      assert.deepStrictEqual(
        markers.map((m) => ({ severity: m.severity, message: m.message })),
        [
          { severity: MarkerSeverity.Warning, message: `Unknown hook event type 'UnknownEvent'. Supported: SessionStart, SessionEnd, UserPromptSubmit, PreToolUse, PostToolUse, PreCompact, SubagentStart, SubagentStop, Stop, ErrorOccurred.` }
        ]
      );
    });
    test("hooks - hook value must be array", async () => {
      const content = [
        "---",
        'description: "Test"',
        "hooks:",
        "  SessionStart: invalid",
        "---"
      ].join("\n");
      const markers = await validate(content, PromptsType.agent);
      assert.deepStrictEqual(
        markers.map((m) => ({ severity: m.severity, message: m.message })),
        [
          { severity: MarkerSeverity.Error, message: `Hook event 'SessionStart' must have an array of command objects as its value.` }
        ]
      );
    });
    test("hooks - command item must be object", async () => {
      const content = [
        "---",
        'description: "Test"',
        "hooks:",
        "  SessionStart:",
        "    - just a string",
        "---"
      ].join("\n");
      const markers = await validate(content, PromptsType.agent);
      assert.deepStrictEqual(
        markers.map((m) => ({ severity: m.severity, message: m.message })),
        [
          { severity: MarkerSeverity.Error, message: `Each hook command must be an object.` }
        ]
      );
    });
    test("hooks - missing type property", async () => {
      const content = [
        "---",
        'description: "Test"',
        "hooks:",
        "  SessionStart:",
        "    - command: echo hello",
        "---"
      ].join("\n");
      const markers = await validate(content, PromptsType.agent);
      assert.deepStrictEqual(
        markers.map((m) => ({ severity: m.severity, message: m.message })),
        [
          { severity: MarkerSeverity.Error, message: `Hook command is missing required property 'type'.` }
        ]
      );
    });
    test("hooks - type must be command", async () => {
      const content = [
        "---",
        'description: "Test"',
        "hooks:",
        "  SessionStart:",
        "    - type: script",
        "      command: echo hello",
        "---"
      ].join("\n");
      const markers = await validate(content, PromptsType.agent);
      assert.deepStrictEqual(
        markers.map((m) => ({ severity: m.severity, message: m.message })),
        [
          { severity: MarkerSeverity.Error, message: `The 'type' property in a hook command must be 'command'.` }
        ]
      );
    });
    test("hooks - missing command field", async () => {
      const content = [
        "---",
        'description: "Test"',
        "hooks:",
        "  SessionStart:",
        "    - type: command",
        "---"
      ].join("\n");
      const markers = await validate(content, PromptsType.agent);
      assert.deepStrictEqual(
        markers.map((m) => ({ severity: m.severity, message: m.message })),
        [
          { severity: MarkerSeverity.Error, message: `Hook command must specify at least one of 'command', 'windows', 'linux', or 'osx'.` }
        ]
      );
    });
    test("hooks - empty command string", async () => {
      const content = [
        "---",
        'description: "Test"',
        "hooks:",
        "  SessionStart:",
        "    - type: command",
        '      command: ""',
        "---"
      ].join("\n");
      const markers = await validate(content, PromptsType.agent);
      assert.deepStrictEqual(
        markers.map((m) => ({ severity: m.severity, message: m.message })),
        [
          { severity: MarkerSeverity.Error, message: `The 'command' property in a hook command must be a non-empty string.` }
        ]
      );
    });
    test("hooks - platform-specific commands are valid", async () => {
      const content = [
        "---",
        'description: "Test"',
        "hooks:",
        "  SessionStart:",
        "    - type: command",
        "      windows: echo hello",
        "      linux: echo hello",
        "      osx: echo hello",
        "---"
      ].join("\n");
      const markers = await validate(content, PromptsType.agent);
      assert.deepStrictEqual(markers, []);
    });
    test("hooks - env must be a map with string values", async () => {
      const content = [
        "---",
        'description: "Test"',
        "hooks:",
        "  SessionStart:",
        "    - type: command",
        "      command: echo hello",
        "      env: invalid",
        "---"
      ].join("\n");
      const markers = await validate(content, PromptsType.agent);
      assert.deepStrictEqual(
        markers.map((m) => ({ severity: m.severity, message: m.message })),
        [
          { severity: MarkerSeverity.Error, message: `The 'env' property in a hook command must be a map of string values.` }
        ]
      );
    });
    test("hooks - valid env map", async () => {
      const content = [
        "---",
        'description: "Test"',
        "hooks:",
        "  SessionStart:",
        "    - type: command",
        "      command: echo hello",
        "      env:",
        "        NODE_ENV: production",
        '        DEBUG: "true"',
        "---"
      ].join("\n");
      const markers = await validate(content, PromptsType.agent);
      assert.deepStrictEqual(markers, []);
    });
    test("hooks - unknown property warns", async () => {
      const content = [
        "---",
        'description: "Test"',
        "hooks:",
        "  SessionStart:",
        "    - type: command",
        "      command: echo hello",
        "      unknownProp: value",
        "---"
      ].join("\n");
      const markers = await validate(content, PromptsType.agent);
      assert.deepStrictEqual(
        markers.map((m) => ({ severity: m.severity, message: m.message })),
        [
          { severity: MarkerSeverity.Warning, message: `Unknown property 'unknownProp' in hook command.` }
        ]
      );
    });
    test("hooks - timeout must be number", async () => {
      const content = [
        "---",
        'description: "Test"',
        "hooks:",
        "  SessionStart:",
        "    - type: command",
        "      command: echo hello",
        "      timeout: not-a-number",
        "---"
      ].join("\n");
      const markers = await validate(content, PromptsType.agent);
      assert.deepStrictEqual(
        markers.map((m) => ({ severity: m.severity, message: m.message })),
        [
          { severity: MarkerSeverity.Error, message: `The 'timeout' property in a hook command must be a number.` }
        ]
      );
    });
    test("hooks - cwd must be string", async () => {
      const content = [
        "---",
        'description: "Test"',
        "hooks:",
        "  SessionStart:",
        "    - type: command",
        "      command: echo hello",
        "      cwd:",
        "        - array",
        "---"
      ].join("\n");
      const markers = await validate(content, PromptsType.agent);
      assert.deepStrictEqual(
        markers.map((m) => ({ severity: m.severity, message: m.message })),
        [
          { severity: MarkerSeverity.Error, message: `The 'cwd' property in a hook command must be a string.` }
        ]
      );
    });
    test("hooks - multiple errors in one command", async () => {
      const content = [
        "---",
        'description: "Test"',
        "hooks:",
        "  SessionStart:",
        "    - type: script",
        "      unknownProp: value",
        "---"
      ].join("\n");
      const markers = await validate(content, PromptsType.agent);
      assert.deepStrictEqual(
        markers.map((m) => ({ severity: m.severity, message: m.message })),
        [
          { severity: MarkerSeverity.Error, message: `The 'type' property in a hook command must be 'command'.` },
          { severity: MarkerSeverity.Warning, message: `Unknown property 'unknownProp' in hook command.` },
          { severity: MarkerSeverity.Error, message: `Hook command must specify at least one of 'command', 'windows', 'linux', or 'osx'.` }
        ]
      );
    });
    test("hooks - nested matcher format is valid", async () => {
      const content = [
        "---",
        'description: "Test"',
        "hooks:",
        "  UserPromptSubmit:",
        "    - hooks:",
        "        - type: command",
        '          command: "echo foo"',
        "---"
      ].join("\n");
      const markers = await validate(content, PromptsType.agent);
      assert.deepStrictEqual(markers, []);
    });
    test("hooks - nested matcher validates inner commands", async () => {
      const content = [
        "---",
        'description: "Test"',
        "hooks:",
        "  PreToolUse:",
        "    - matcher: Bash",
        "      hooks:",
        "        - type: script",
        '          command: "echo foo"',
        "---"
      ].join("\n");
      const markers = await validate(content, PromptsType.agent);
      assert.deepStrictEqual(
        markers.map((m) => ({ severity: m.severity, message: m.message })),
        [
          { severity: MarkerSeverity.Error, message: `The 'type' property in a hook command must be 'command'.` }
        ]
      );
    });
    test("hooks - nested hooks must be array", async () => {
      const content = [
        "---",
        'description: "Test"',
        "hooks:",
        "  PreToolUse:",
        "    - hooks: invalid",
        "---"
      ].join("\n");
      const markers = await validate(content, PromptsType.agent);
      assert.deepStrictEqual(
        markers.map((m) => ({ severity: m.severity, message: m.message })),
        [
          { severity: MarkerSeverity.Error, message: `The 'hooks' property in a matcher must be an array of command objects.` }
        ]
      );
    });
  });
  suite("instructions", () => {
    test("instructions valid", async () => {
      const content = [
        "---",
        'description: "Instr"',
        "applyTo: *.ts,*.js",
        "---"
      ].join("\n");
      const markers = await validate(content, PromptsType.instructions);
      assert.deepEqual(markers, []);
    });
    test("instructions invalid applyTo type", async () => {
      const content = [
        "---",
        'description: "Instr"',
        "applyTo: []",
        "---"
      ].join("\n");
      const markers = await validate(content, PromptsType.instructions);
      assert.strictEqual(markers.length, 1);
      assert.strictEqual(markers[0].message, `The 'applyTo' attribute must be a string.`);
    });
    test("instructions invalid applyTo glob & unknown attribute", async () => {
      const content = [
        "---",
        'description: "Instr"',
        `applyTo: ''`,
        // empty -> invalid glob
        "model: mae-4",
        // model not allowed in instructions
        "---"
      ].join("\n");
      const markers = await validate(content, PromptsType.instructions);
      assert.strictEqual(markers.length, 2);
      assert.strictEqual(markers[0].severity, MarkerSeverity.Hint);
      assert.deepStrictEqual(markers[0].tags, [MarkerTag.Unnecessary]);
      assert.ok(markers[0].message.startsWith(`Attribute 'model' is not supported in instructions files.`));
      assert.strictEqual(markers[1].message, `The 'applyTo' attribute must be a valid glob pattern.`);
    });
    test("invalid header structure (YAML array)", async () => {
      const content = [
        "---",
        "- item1",
        "---",
        "Body"
      ].join("\n");
      const markers = await validate(content, PromptsType.instructions);
      assert.strictEqual(markers.length, 1);
      assert.strictEqual(markers[0].message, "Invalid header, expecting <key: value> pairs");
    });
    test("name attribute validation in instructions", async () => {
      {
        const content = [
          "---",
          'name: "MyInstructions"',
          'description: "Test instructions"',
          'applyTo: "**/*.ts"',
          "---",
          "Body"
        ].join("\n");
        const markers = await validate(content, PromptsType.instructions);
        assert.deepStrictEqual(markers, [], "Valid name should not produce errors");
      }
      {
        const content = [
          "---",
          'name: ""',
          'description: "Test instructions"',
          'applyTo: "**/*.ts"',
          "---",
          "Body"
        ].join("\n");
        const markers = await validate(content, PromptsType.instructions);
        assert.strictEqual(markers.length, 1);
        assert.strictEqual(markers[0].severity, MarkerSeverity.Error);
        assert.strictEqual(markers[0].message, `The 'name' attribute must not be empty.`);
      }
    });
  });
  suite("prompts", () => {
    test("prompt valid with agent mode (default) and tools and a BYO model", async () => {
      const content = [
        "---",
        'description: "Prompt with tools"',
        "model: MAE 4.1",
        `tools: ['tool1','tool2']`,
        "---",
        "Body"
      ].join("\n");
      const markers = await validate(content, PromptsType.prompt);
      assert.deepStrictEqual(markers, []);
    });
    test("prompt model not suited for agent mode", async () => {
      const content = [
        "---",
        'description: "Prompt with unsuitable model"',
        "model: MAE 3.5 Turbo",
        "---",
        "Body"
      ].join("\n");
      const markers = await validate(content, PromptsType.prompt);
      assert.strictEqual(markers.length, 1, "Expected one warning about unsuitable model");
      assert.strictEqual(markers[0].severity, MarkerSeverity.Warning);
      assert.strictEqual(markers[0].message, `Model 'MAE 3.5 Turbo' is not suited for agent mode.`);
    });
    test("prompt with custom agent BeastMode and tools", async () => {
      const content = [
        "---",
        'description: "Prompt custom mode"',
        "agent: BeastMode",
        `tools: ['tool1']`,
        "---",
        "Body"
      ].join("\n");
      const markers = await validate(content, PromptsType.prompt);
      assert.deepStrictEqual(markers, []);
    });
    test("prompt with custom mode BeastMode and tools", async () => {
      const content = [
        "---",
        'description: "Prompt custom mode"',
        "mode: BeastMode",
        `tools: ['tool1']`,
        "---",
        "Body"
      ].join("\n");
      const markers = await validate(content, PromptsType.prompt);
      assert.strictEqual(markers.length, 1);
      assert.deepStrictEqual(markers.map((m) => m.message), [`The 'mode' attribute has been deprecated. Please rename it to 'agent'.`]);
    });
    test("prompt with custom mode an agent", async () => {
      const content = [
        "---",
        'description: "Prompt custom mode"',
        "mode: BeastMode",
        `agent: agent`,
        "---",
        "Body"
      ].join("\n");
      const markers = await validate(content, PromptsType.prompt);
      assert.strictEqual(markers.length, 1);
      assert.deepStrictEqual(markers.map((m) => m.message), [`The 'mode' attribute has been deprecated. The 'agent' attribute is used instead.`]);
    });
    test("prompt with unknown agent Ask", async () => {
      const content = [
        "---",
        'description: "Prompt unknown agent Ask"',
        "agent: Ask",
        `tools: ['tool1','tool2']`,
        "---",
        "Body"
      ].join("\n");
      const markers = await validate(content, PromptsType.prompt);
      assert.strictEqual(markers.length, 1, "Expected one warning about tools in non-agent mode");
      assert.strictEqual(markers[0].severity, MarkerSeverity.Warning);
      assert.strictEqual(markers[0].message, `Unknown agent 'Ask'. Available agents: agent, ask, edit, BeastMode.`);
    });
    test("prompt with agent edit", async () => {
      const content = [
        "---",
        'description: "Prompt edit mode with tool"',
        "agent: edit",
        `tools: ['tool1']`,
        "---",
        "Body"
      ].join("\n");
      const markers = await validate(content, PromptsType.prompt);
      assert.strictEqual(markers.length, 1);
      assert.strictEqual(markers[0].severity, MarkerSeverity.Warning);
      assert.strictEqual(markers[0].message, `The 'tools' attribute is only supported when using agents. Attribute will be ignored.`);
    });
    test("name attribute validation in prompts", async () => {
      {
        const content = [
          "---",
          'name: "MyPrompt"',
          'description: "Test prompt"',
          "---",
          "Body"
        ].join("\n");
        const markers = await validate(content, PromptsType.prompt);
        assert.deepStrictEqual(markers, [], "Valid name should not produce errors");
      }
      {
        const content = [
          "---",
          'name: ""',
          'description: "Test prompt"',
          "---",
          "Body"
        ].join("\n");
        const markers = await validate(content, PromptsType.prompt);
        assert.strictEqual(markers.length, 1);
        assert.strictEqual(markers[0].severity, MarkerSeverity.Error);
        assert.strictEqual(markers[0].message, `The 'name' attribute must not be empty.`);
      }
    });
  });
  suite("body", () => {
    test("body with existing file references and known tools has no markers", async () => {
      const content = [
        "---",
        'description: "Refs"',
        "---",
        "Here is a #file:./reference1.md and a markdown [reference](./reference2.md) plus variables #tool1 and #tool2"
      ].join("\n");
      const markers = await validate(content, PromptsType.prompt);
      assert.deepStrictEqual(markers, [], "Expected no validation issues");
    });
    test("body with missing file references reports warnings", async () => {
      const content = [
        "---",
        'description: "Missing Refs"',
        "---",
        "Here is a #file:./missing1.md and a markdown [missing link](./missing2.md)."
      ].join("\n");
      const markers = await validate(content, PromptsType.prompt);
      const messages = markers.map((m) => m.message).sort();
      assert.deepStrictEqual(messages, [
        `File './missing1.md' not found at '/missing1.md'.`,
        `File './missing2.md' not found at '/missing2.md'.`
      ]);
    });
    test("body with http link", async () => {
      const content = [
        "---",
        'description: "HTTP Link"',
        "---",
        "Here is a [http link](http://example.com)."
      ].join("\n");
      const markers = await validate(content, PromptsType.prompt);
      assert.deepStrictEqual(markers, [], "Expected no validation issues");
    });
    test("body with url link", async () => {
      const nonExistingRef = existingRef1.with({ path: "/nonexisting" });
      const content = [
        "---",
        'description: "URL Links"',
        "---",
        `Here is a [url link](${existingRef1.toString()}).`,
        `Here is a [url link](${nonExistingRef.toString()}).`
      ].join("\n");
      const markers = await validate(content, PromptsType.prompt);
      const messages = markers.map((m) => m.message).sort();
      assert.deepStrictEqual(messages, [
        `File 'myFs://test/nonexisting' not found at '/nonexisting'.`
      ]);
    });
    test("body with unknown tool variable reference is an unnecessary hint", async () => {
      const content = [
        "---",
        'description: "Unknown tool var"',
        "---",
        "This line references known #tool:tool1 and unknown #tool:toolX"
      ].join("\n");
      const markers = await validate(content, PromptsType.prompt);
      assert.strictEqual(markers.length, 1, "Expected one diagnostic for unknown tool variable");
      assert.strictEqual(markers[0].severity, MarkerSeverity.Hint);
      assert.deepStrictEqual(markers[0].tags, [MarkerTag.Unnecessary]);
      assert.strictEqual(markers[0].message, `Unknown tool or toolset 'toolX'.`);
    });
    test("body with tool not present in tools list", async () => {
      const content = [
        "---",
        "tools: []",
        "---",
        "I need",
        "#tool:ms-azuretools.vscode-azure-github-copilot/azure_recommend_custom_modes",
        "#tool:github.vscode-pull-request-github/suggest-fix",
        "#tool:openSimpleBrowser"
      ].join("\n");
      const markers = await validate(content, PromptsType.prompt);
      const actual = markers.sort((a, b) => a.startLineNumber - b.startLineNumber).map((m) => ({ message: m.message, startColumn: m.startColumn, endColumn: m.endColumn }));
      assert.deepEqual(actual, [
        { message: `Unknown extension tool 'ms-azuretools.vscode-azure-github-copilot/azure_recommend_custom_modes'. It is likely to be a missing extension, please ensure it is installed and enabled.`, startColumn: 7, endColumn: 77 },
        { message: `Tool or toolset 'github.vscode-pull-request-github/suggest-fix' also needs to be enabled in the header.`, startColumn: 7, endColumn: 52 },
        { message: `Tool or toolset 'openSimpleBrowser' has been renamed, use 'vscode/openIntegratedBrowser' instead.`, startColumn: 7, endColumn: 24 }
      ]);
    });
  });
  suite("skills", () => {
    test("skill name matches folder name", async () => {
      const content = [
        "---",
        "name: my-skill",
        "description: Test Skill",
        "---",
        "This is a skill."
      ].join("\n");
      const markers = await validate(content, PromptsType.skill, URI.parse("file:///.github/skills/my-skill/SKILL.md"));
      assert.deepStrictEqual(markers, [], "Expected no validation issues when name matches folder");
    });
    test("skill name does not match folder name", async () => {
      const content = [
        "---",
        "name: different-name",
        "description: Test Skill",
        "---",
        "This is a skill."
      ].join("\n");
      const markers = await validate(content, PromptsType.skill, URI.parse("file:///.github/skills/my-skill/SKILL.md"));
      assert.strictEqual(markers.length, 1);
      assert.strictEqual(markers[0].severity, MarkerSeverity.Warning);
      assert.strictEqual(markers[0].message, `The skill name 'different-name' should match the folder name 'my-skill'.`);
    });
    test("skill without name attribute should warn", async () => {
      const content = [
        "---",
        "description: Test Skill",
        "---",
        "This is a skill without a name."
      ].join("\n");
      const markers = await validate(content, PromptsType.skill, URI.parse("file:///.github/skills/my-skill/SKILL.md"));
      assert.strictEqual(markers.length, 1);
      assert.strictEqual(markers[0].severity, MarkerSeverity.Warning);
      assert.strictEqual(markers[0].message, "Skill should provide a name.");
    });
    test("skill without frontmatter should not warn about missing name or description", async () => {
      const content = "This is a skill without any frontmatter.";
      const markers = await validate(content, PromptsType.skill, URI.parse("file:///.github/skills/my-skill/SKILL.md"));
      assert.deepStrictEqual(markers, []);
    });
    test("skill with empty name should error", async () => {
      const content = [
        "---",
        'name: ""',
        "description: Test Skill",
        "---",
        "This is a skill."
      ].join("\n");
      const markers = await validate(content, PromptsType.skill, URI.parse("file:///.github/skills/my-skill/SKILL.md"));
      assert.strictEqual(markers.length, 1);
      assert.strictEqual(markers[0].severity, MarkerSeverity.Error);
      assert.strictEqual(markers[0].message, `The 'name' attribute must not be empty.`);
    });
    test("skill without description attribute should warn", async () => {
      const content = [
        "---",
        "name: my-skill",
        "---",
        "This is a skill without a description."
      ].join("\n");
      const markers = await validate(content, PromptsType.skill, URI.parse("file:///.github/skills/my-skill/SKILL.md"));
      assert.strictEqual(markers.length, 1);
      assert.strictEqual(markers[0].severity, MarkerSeverity.Warning);
      assert.strictEqual(markers[0].message, "Skill should provide a description.");
    });
    test("skill without description but with user-invocable false should error on that attribute", async () => {
      const content = [
        "---",
        "name: my-skill",
        "user-invocable: false",
        "---",
        "This is a skill."
      ].join("\n");
      const markers = await validate(content, PromptsType.skill, URI.parse("file:///.github/skills/my-skill/SKILL.md"));
      assert.strictEqual(markers.length, 2);
      assert.strictEqual(markers[0].severity, MarkerSeverity.Warning);
      assert.strictEqual(markers[0].message, "Skill should provide a description.");
      assert.strictEqual(markers[1].severity, MarkerSeverity.Error);
      assert.ok(markers[1].message.includes("description is required when user-invocable is false"));
    });
    test("skill without description but with disable-model-invocation false should error on that attribute", async () => {
      const content = [
        "---",
        "name: my-skill",
        "disable-model-invocation: false",
        "---",
        "This is a skill."
      ].join("\n");
      const markers = await validate(content, PromptsType.skill, URI.parse("file:///.github/skills/my-skill/SKILL.md"));
      assert.strictEqual(markers.length, 2);
      assert.strictEqual(markers[0].severity, MarkerSeverity.Warning);
      assert.strictEqual(markers[0].message, "Skill should provide a description.");
      assert.strictEqual(markers[1].severity, MarkerSeverity.Error);
      assert.ok(markers[1].message.includes("description is required when model invocation is enabled"));
    });
    test("skill with empty description should error", async () => {
      const content = [
        "---",
        "name: my-skill",
        'description: ""',
        "---",
        "This is a skill."
      ].join("\n");
      const markers = await validate(content, PromptsType.skill, URI.parse("file:///.github/skills/my-skill/SKILL.md"));
      assert.strictEqual(markers.length, 1);
      assert.strictEqual(markers[0].severity, MarkerSeverity.Error);
      assert.strictEqual(markers[0].message, `The 'description' attribute should not be empty.`);
    });
    test("skill name with invalid characters should error", async () => {
      const content = [
        "---",
        "name: My Skill",
        "description: Test Skill",
        "---",
        "This is a skill."
      ].join("\n");
      const markers = await validate(content, PromptsType.skill, URI.parse("file:///.github/skills/my-skill/SKILL.md"));
      assert.ok(markers.some((m) => m.severity === MarkerSeverity.Error && m.message === "Skill name may only contain lowercase letters, numbers, and hyphens."));
    });
    test("skill name with whitespace trimmed matches folder name", async () => {
      const content = [
        "---",
        'name: "  my-skill  "',
        "description: Test Skill",
        "---",
        "This is a skill."
      ].join("\n");
      const markers = await validate(content, PromptsType.skill, URI.parse("file:///.github/skills/my-skill/SKILL.md"));
      assert.deepStrictEqual(markers, [], "Expected no validation issues when trimmed name matches folder");
    });
    test("skill name validation with different folder depths", async () => {
      {
        const content = [
          "---",
          "name: advanced-skill",
          "description: Test Skill",
          "---",
          "This is a skill."
        ].join("\n");
        const markers = await validate(content, PromptsType.skill, URI.parse("file:///home/user/.github/skills/advanced-skill/SKILL.md"));
        assert.deepStrictEqual(markers, [], "Expected no issues for deeper path when name matches");
      }
      {
        const content = [
          "---",
          "name: wrong-name",
          "description: Test Skill",
          "---",
          "This is a skill."
        ].join("\n");
        const markers = await validate(content, PromptsType.skill, URI.parse("file:///home/user/.github/skills/correct-folder/SKILL.md"));
        assert.strictEqual(markers.length, 1);
        assert.strictEqual(markers[0].message, `The skill name 'wrong-name' should match the folder name 'correct-folder'.`);
      }
    });
    test("skill name validation with special characters in folder", async () => {
      const content = [
        "---",
        "name: my_special-skill.v2",
        "description: Test Skill",
        "---",
        "This is a skill."
      ].join("\n");
      const markers = await validate(content, PromptsType.skill, URI.parse("file:///.github/skills/my_special-skill.v2/SKILL.md"));
      assert.ok(markers.some((m) => m.severity === MarkerSeverity.Error && m.message === "Skill name may only contain lowercase letters, numbers, and hyphens."), "Expected error for invalid characters in skill name");
    });
    test("skill with non-string name type does not validate folder match", async () => {
      const content = [
        "---",
        "name: []",
        "description: Test Skill",
        "---",
        "This is a skill."
      ].join("\n");
      const markers = await validate(content, PromptsType.skill, URI.parse("file:///.github/skills/my-skill/SKILL.md"));
      assert.ok(markers.some((m) => m.message.includes("must be a string")), "Expected error for non-string name");
      assert.ok(!markers.some((m) => m.message.includes("should match the folder name")), "Should not warn about folder mismatch for non-string name");
    });
    test("skill folder name validation only for skill type", async () => {
      const content = [
        "---",
        "name: different-name",
        "description: Test Agent",
        "---",
        "This is an agent."
      ].join("\n");
      const markers = await validate(content, PromptsType.agent, URI.parse("file:///.github/agents/my-agent/AGENT.md"));
      assert.ok(!markers.some((m) => m.message.includes("should match the folder name")), "Should not validate folder names for agents");
    });
    test("skill with unknown attributes shows unnecessary hints", async () => {
      const content = [
        "---",
        "name: my-skill",
        "description: Test Skill",
        "unknownAttr: value",
        "anotherUnknown: 123",
        "---",
        "This is a skill."
      ].join("\n");
      const markers = await validate(content, PromptsType.skill, URI.parse("file:///.github/skills/my-skill/SKILL.md"));
      assert.strictEqual(markers.length, 2);
      assert.ok(markers.every((m) => m.severity === MarkerSeverity.Hint));
      assert.ok(markers.every((m) => JSON.stringify(m.tags) === JSON.stringify([MarkerTag.Unnecessary])));
      assert.ok(markers.some((m) => m.message.includes("unknownAttr")));
      assert.ok(markers.some((m) => m.message.includes("anotherUnknown")));
      assert.ok(markers.every((m) => m.message.includes("Supported: ")));
    });
    test("skill with user-invocable: false is valid", async () => {
      const content = [
        "---",
        "name: my-skill",
        "description: Background knowledge skill",
        "user-invocable: false",
        "---",
        "This skill provides background context."
      ].join("\n");
      const markers = await validate(content, PromptsType.skill, URI.parse("file:///.github/skills/my-skill/SKILL.md"));
      assert.deepStrictEqual(markers, [], "user-invocable: false should be valid for skills");
    });
    test("skill with user-invocable: true is valid", async () => {
      const content = [
        "---",
        "name: my-skill",
        "description: User-accessible skill",
        "user-invocable: true",
        "---",
        "This skill can be invoked by users."
      ].join("\n");
      const markers = await validate(content, PromptsType.skill, URI.parse("file:///.github/skills/my-skill/SKILL.md"));
      assert.deepStrictEqual(markers, [], "user-invocable: true should be valid for skills");
    });
    test("skill with invalid user-invocable value shows error", async () => {
      {
        const content = [
          "---",
          "name: my-skill",
          "description: Test Skill",
          'user-invocable: "false"',
          "---",
          "Body"
        ].join("\n");
        const markers = await validate(content, PromptsType.skill, URI.parse("file:///.github/skills/my-skill/SKILL.md"));
        assert.strictEqual(markers.length, 1);
        assert.strictEqual(markers[0].severity, MarkerSeverity.Error);
        assert.strictEqual(markers[0].message, `The 'user-invocable' attribute must be 'true' or 'false'.`);
      }
      {
        const content = [
          "---",
          "name: my-skill",
          "description: Test Skill",
          "user-invocable: 0",
          "---",
          "Body"
        ].join("\n");
        const markers = await validate(content, PromptsType.skill, URI.parse("file:///.github/skills/my-skill/SKILL.md"));
        assert.strictEqual(markers.length, 1);
        assert.strictEqual(markers[0].severity, MarkerSeverity.Error);
        assert.strictEqual(markers[0].message, `The 'user-invocable' attribute must be 'true' or 'false'.`);
      }
    });
    test("skill with disable-model-invocation: true is valid", async () => {
      const content = [
        "---",
        "name: my-skill",
        "description: Manual-only skill",
        "disable-model-invocation: true",
        "---",
        "This skill must be triggered manually with /name."
      ].join("\n");
      const markers = await validate(content, PromptsType.skill, URI.parse("file:///.github/skills/my-skill/SKILL.md"));
      assert.deepStrictEqual(markers, [], "disable-model-invocation: true should be valid for skills");
    });
    test("skill with disable-model-invocation: false is valid", async () => {
      const content = [
        "---",
        "name: my-skill",
        "description: Auto-loadable skill",
        "disable-model-invocation: false",
        "---",
        "This skill can be loaded automatically by the agent."
      ].join("\n");
      const markers = await validate(content, PromptsType.skill, URI.parse("file:///.github/skills/my-skill/SKILL.md"));
      assert.deepStrictEqual(markers, [], "disable-model-invocation: false should be valid for skills");
    });
    test("skill with invalid disable-model-invocation value shows error", async () => {
      {
        const content = [
          "---",
          "name: my-skill",
          "description: Test Skill",
          'disable-model-invocation: "true"',
          "---",
          "Body"
        ].join("\n");
        const markers = await validate(content, PromptsType.skill, URI.parse("file:///.github/skills/my-skill/SKILL.md"));
        assert.strictEqual(markers.length, 1);
        assert.strictEqual(markers[0].severity, MarkerSeverity.Error);
        assert.strictEqual(markers[0].message, `The 'disable-model-invocation' attribute must be 'true' or 'false'.`);
      }
      {
        const content = [
          "---",
          "name: my-skill",
          "description: Test Skill",
          "disable-model-invocation: 1",
          "---",
          "Body"
        ].join("\n");
        const markers = await validate(content, PromptsType.skill, URI.parse("file:///.github/skills/my-skill/SKILL.md"));
        assert.strictEqual(markers.length, 1);
        assert.strictEqual(markers[0].severity, MarkerSeverity.Error);
        assert.strictEqual(markers[0].message, `The 'disable-model-invocation' attribute must be 'true' or 'false'.`);
      }
    });
    test("skill with argument-hint is valid", async () => {
      const content = [
        "---",
        "name: my-skill",
        "description: Skill with argument hint",
        'argument-hint: "[issue-number]"',
        "---",
        "This skill expects an issue number."
      ].join("\n");
      const markers = await validate(content, PromptsType.skill, URI.parse("file:///.github/skills/my-skill/SKILL.md"));
      assert.deepStrictEqual(markers, [], "argument-hint should be valid for skills");
    });
    test("skill with empty argument-hint shows warning", async () => {
      const content = [
        "---",
        "name: my-skill",
        "description: Test Skill",
        'argument-hint: ""',
        "---",
        "Body"
      ].join("\n");
      const markers = await validate(content, PromptsType.skill, URI.parse("file:///.github/skills/my-skill/SKILL.md"));
      assert.strictEqual(markers.length, 1);
      assert.strictEqual(markers[0].severity, MarkerSeverity.Warning);
      assert.strictEqual(markers[0].message, `The 'argument-hint' attribute should not be empty.`);
    });
    test("skill with non-string argument-hint shows error", async () => {
      const content = [
        "---",
        "name: my-skill",
        "description: Test Skill",
        "argument-hint: []",
        "---",
        "Body"
      ].join("\n");
      const markers = await validate(content, PromptsType.skill, URI.parse("file:///.github/skills/my-skill/SKILL.md"));
      assert.strictEqual(markers.length, 1);
      assert.strictEqual(markers[0].severity, MarkerSeverity.Error);
      assert.strictEqual(markers[0].message, `The 'argument-hint' attribute must be a string.`);
    });
    test("skill with all visibility attributes combined is valid", async () => {
      const content = [
        "---",
        "name: my-skill",
        "description: Complex visibility skill",
        "user-invocable: false",
        "disable-model-invocation: true",
        'argument-hint: "[optional-arg]"',
        "---",
        "This skill has complex visibility settings."
      ].join("\n");
      const markers = await validate(content, PromptsType.skill, URI.parse("file:///.github/skills/my-skill/SKILL.md"));
      assert.deepStrictEqual(markers, [], "All visibility attributes combined should be valid");
    });
  });
  suite("claude rules", () => {
    const claudeRulesUri = URI.parse("myFs://test/.claude/rules/my-rule.md");
    test("valid claude rules with paths attribute", async () => {
      const content = [
        "---",
        'description: "TypeScript rules"',
        `paths: ['**/*.ts', '**/*.tsx']`,
        "---",
        "Always use strict mode."
      ].join("\n");
      const markers = await validate(content, PromptsType.instructions, claudeRulesUri);
      assert.deepStrictEqual(markers, []);
    });
    test("valid claude rules without paths attribute", async () => {
      const content = [
        "---",
        'description: "General rules"',
        "---",
        "Follow coding guidelines."
      ].join("\n");
      const markers = await validate(content, PromptsType.instructions, claudeRulesUri);
      assert.deepStrictEqual(markers, []);
    });
    test("claude rules paths must be an array", async () => {
      const content = [
        "---",
        'description: "Rules"',
        'paths: "**/*.ts"',
        "---"
      ].join("\n");
      const markers = await validate(content, PromptsType.instructions, claudeRulesUri);
      assert.strictEqual(markers.length, 1);
      assert.strictEqual(markers[0].severity, MarkerSeverity.Error);
      assert.strictEqual(markers[0].message, `The 'paths' attribute must be an array of glob patterns.`);
    });
    test("claude rules with unknown attribute shows unnecessary hint", async () => {
      const content = [
        "---",
        'description: "Rules"',
        'applyTo: "**/*.ts"',
        "---"
      ].join("\n");
      const markers = await validate(content, PromptsType.instructions, claudeRulesUri);
      assert.strictEqual(markers.length, 1);
      assert.strictEqual(markers[0].severity, MarkerSeverity.Hint);
      assert.deepStrictEqual(markers[0].tags, [MarkerTag.Unnecessary]);
      assert.ok(markers[0].message.includes(`Attribute 'applyTo' is not supported in rules files by VS Code agents.`));
    });
    test("claude rules with multiple validation errors", async () => {
      const content = [
        "---",
        'description: ""',
        `paths: ['', 123]`,
        "---"
      ].join("\n");
      const markers = await validate(content, PromptsType.instructions, claudeRulesUri);
      assert.deepStrictEqual(
        markers.map((m) => ({ severity: m.severity, message: m.message })),
        [
          { severity: MarkerSeverity.Error, message: `The 'description' attribute should not be empty.` },
          { severity: MarkerSeverity.Error, message: `Path entries must be non-empty glob patterns.` }
        ]
      );
    });
    test("claude rules in subdirectory", async () => {
      const subDirUri = URI.parse("myFs://test/.claude/rules/sub/deep-rule.md");
      const content = [
        "---",
        'description: "Nested rules"',
        `paths: ['src/**/*.ts']`,
        "---",
        "Nested rule content."
      ].join("\n");
      const markers = await validate(content, PromptsType.instructions, subDirUri);
      assert.deepStrictEqual(markers, []);
    });
  });
  suite("claude agents", () => {
    const claudeAgentUri = URI.parse("myFs://test/.claude/agents/test.agent.md");
    test("valid Claude agent with all common attributes", async () => {
      const content = [
        "---",
        "name: security-reviewer",
        "description: Reviews code for security vulnerabilities",
        `tools: ['Edit', 'Grep', 'AskUserQuestion', 'WebFetch']`,
        "model: opus",
        "permissionMode: delegate",
        "---",
        "You are a senior security engineer."
      ].join("\n");
      const markers = await validate(content, PromptsType.agent, claudeAgentUri);
      assert.deepStrictEqual(markers, []);
    });
    test("valid Claude agent with minimal attributes", async () => {
      const content = [
        "---",
        "name: helper",
        "description: A simple helper agent",
        "---",
        "You help with tasks."
      ].join("\n");
      const markers = await validate(content, PromptsType.agent, claudeAgentUri);
      assert.deepStrictEqual(markers, []);
    });
    test("Claude agent with valid model values", async () => {
      for (const modelName of ["sonnet", "opus", "haiku", "inherit"]) {
        const content = [
          "---",
          "name: test-agent",
          "description: Test",
          `model: ${modelName}`,
          "---"
        ].join("\n");
        const markers = await validate(content, PromptsType.agent, claudeAgentUri);
        assert.deepStrictEqual(markers, [], `Model '${modelName}' should be valid`);
      }
    });
    test("Claude agent with unknown model value", async () => {
      const content = [
        "---",
        "name: test-agent",
        "description: Test",
        "model: gpt-4",
        "---"
      ].join("\n");
      const markers = await validate(content, PromptsType.agent, claudeAgentUri);
      assert.strictEqual(markers.length, 1);
      assert.strictEqual(markers[0].severity, MarkerSeverity.Warning);
      assert.strictEqual(markers[0].message, `Unknown value 'gpt-4', valid: sonnet, opus, haiku, inherit.`);
    });
    test("Claude agent with non-string model value", async () => {
      const content = [
        "---",
        "name: test-agent",
        "description: Test",
        "model: []",
        "---"
      ].join("\n");
      const markers = await validate(content, PromptsType.agent, claudeAgentUri);
      assert.strictEqual(markers.length, 1);
      assert.strictEqual(markers[0].severity, MarkerSeverity.Error);
      assert.strictEqual(markers[0].message, `The 'model' attribute must be a string.`);
    });
    test("Claude agent with valid permissionMode values", async () => {
      for (const mode of ["default", "acceptEdits", "plan", "delegate", "dontAsk", "bypassPermissions"]) {
        const content = [
          "---",
          "name: test-agent",
          "description: Test",
          `permissionMode: ${mode}`,
          "---"
        ].join("\n");
        const markers = await validate(content, PromptsType.agent, claudeAgentUri);
        assert.deepStrictEqual(markers, [], `permissionMode '${mode}' should be valid`);
      }
    });
    test("Claude agent with unknown permissionMode value", async () => {
      const content = [
        "---",
        "name: test-agent",
        "description: Test",
        "model: sonnet",
        "permissionMode: allowAll",
        "---"
      ].join("\n");
      const markers = await validate(content, PromptsType.agent, claudeAgentUri);
      assert.strictEqual(markers.length, 1);
      assert.strictEqual(markers[0].severity, MarkerSeverity.Warning);
      assert.strictEqual(markers[0].message, `Unknown value 'allowAll', valid: default, acceptEdits, plan, delegate, dontAsk, bypassPermissions.`);
    });
    test("Claude agent with valid memory values", async () => {
      for (const mem of ["user", "project", "local"]) {
        const content = [
          "---",
          "name: test-agent",
          "description: Test",
          `memory: ${mem}`,
          "---"
        ].join("\n");
        const markers = await validate(content, PromptsType.agent, claudeAgentUri);
        assert.deepStrictEqual(markers, [], `memory '${mem}' should be valid`);
      }
    });
    test("Claude agent with unknown memory value", async () => {
      const content = [
        "---",
        "name: test-agent",
        "description: Test",
        "model: sonnet",
        "permissionMode: default",
        "memory: global",
        "---"
      ].join("\n");
      const markers = await validate(content, PromptsType.agent, claudeAgentUri);
      assert.strictEqual(markers.length, 1);
      assert.strictEqual(markers[0].severity, MarkerSeverity.Warning);
      assert.strictEqual(markers[0].message, `Unknown value 'global', valid: user, project, local.`);
    });
    test("Claude agent with empty name shows error", async () => {
      const content = [
        "---",
        'name: ""',
        "description: Test",
        "---"
      ].join("\n");
      const markers = await validate(content, PromptsType.agent, claudeAgentUri);
      assert.strictEqual(markers.length, 1);
      assert.strictEqual(markers[0].severity, MarkerSeverity.Error);
      assert.strictEqual(markers[0].message, `The 'name' attribute must not be empty.`);
    });
    test("Claude agent with empty description shows error", async () => {
      const content = [
        "---",
        "name: test-agent",
        'description: ""',
        "---"
      ].join("\n");
      const markers = await validate(content, PromptsType.agent, claudeAgentUri);
      assert.strictEqual(markers.length, 1);
      assert.strictEqual(markers[0].severity, MarkerSeverity.Error);
      assert.strictEqual(markers[0].message, `The 'description' attribute should not be empty.`);
    });
    test("Claude agent with unknown attributes does not warn", async () => {
      const content = [
        "---",
        "name: test-agent",
        "description: Test",
        "customAttribute: someValue",
        "anotherCustom: 123",
        "---"
      ].join("\n");
      const markers = await validate(content, PromptsType.agent, claudeAgentUri);
      assert.deepStrictEqual(markers, [], "Unknown attributes should be silently ignored for Claude agents");
    });
    test("Claude agent tools are not validated against VS Code tool registry", async () => {
      const content = [
        "---",
        "name: test-agent",
        "description: Test",
        `tools: ['Edit', 'Grep', 'UnknownClaudeTool', 'WebFetch']`,
        "---"
      ].join("\n");
      const markers = await validate(content, PromptsType.agent, claudeAgentUri);
      assert.deepStrictEqual(markers, [], "Claude tools should not be validated against VS Code registry");
    });
    test("Claude agent with comma-separated tools string", async () => {
      const content = [
        "---",
        "name: security-reviewer",
        "description: Reviews code",
        "tools: Edit, Grep, AskUserQuestion, WebFetch",
        "---"
      ].join("\n");
      const markers = await validate(content, PromptsType.agent, claudeAgentUri);
      assert.deepStrictEqual(markers, [], "Comma-separated tools string should be valid for Claude");
    });
    test("Claude agent does not validate handoffs or agents attributes", async () => {
      const content = [
        "---",
        "name: test-agent",
        "description: Test",
        "model: opus",
        "---"
      ].join("\n");
      const markers = await validate(content, PromptsType.agent, claudeAgentUri);
      assert.deepStrictEqual(markers, []);
    });
    test("Claude agent full realistic example", async () => {
      const content = [
        "---",
        "name: security-reviewer",
        "description: Reviews code for security vulnerabilities",
        `tools: ['Edit', 'Grep', 'AskUserQuestion', 'WebFetch']`,
        "model: opus",
        "permissionMode: delegate",
        "memory: project",
        "---",
        "You are a senior security engineer.",
        "Review the code for common vulnerabilities."
      ].join("\n");
      const markers = await validate(content, PromptsType.agent, claudeAgentUri);
      assert.deepStrictEqual(markers, []);
    });
    test("Claude agent with multiple validation errors", async () => {
      const content = [
        "---",
        'name: ""',
        'description: ""',
        "model: unknown-model",
        "permissionMode: invalid-mode",
        "---"
      ].join("\n");
      const markers = await validate(content, PromptsType.agent, claudeAgentUri);
      assert.deepStrictEqual(
        markers.map((m) => ({ severity: m.severity, message: m.message })),
        [
          { severity: MarkerSeverity.Error, message: `The 'name' attribute must not be empty.` },
          { severity: MarkerSeverity.Error, message: `The 'description' attribute should not be empty.` },
          { severity: MarkerSeverity.Warning, message: `Unknown value 'unknown-model', valid: sonnet, opus, haiku, inherit.` },
          { severity: MarkerSeverity.Warning, message: `Unknown value 'invalid-mode', valid: default, acceptEdits, plan, delegate, dontAsk, bypassPermissions.` }
        ]
      );
    });
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXGNoYXRcXHRlc3RcXGJyb3dzZXJcXHByb21wdFN5bnRheFxcbGFuZ3VhZ2VQcm92aWRlcnNcXHByb21wdFZhbGlkYXRvci50ZXN0LnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IGFzc2VydCBmcm9tICdhc3NlcnQnO1xuXG5pbXBvcnQgeyBSZXNvdXJjZVNldCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL21hcC5qcyc7XG5pbXBvcnQgeyBVUkkgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi91cmkuanMnO1xuaW1wb3J0IHsgZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS90ZXN0L2NvbW1vbi91dGlscy5qcyc7XG5pbXBvcnQgeyBDb250ZXh0S2V5U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbnRleHRrZXkvYnJvd3Nlci9jb250ZXh0S2V5U2VydmljZS5qcyc7XG5pbXBvcnQgeyBUZXN0Q29uZmlndXJhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb25maWd1cmF0aW9uL3Rlc3QvY29tbW9uL3Rlc3RDb25maWd1cmF0aW9uU2VydmljZS5qcyc7XG5pbXBvcnQgeyBFeHRlbnNpb25JZGVudGlmaWVyIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vZXh0ZW5zaW9ucy9jb21tb24vZXh0ZW5zaW9ucy5qcyc7XG5pbXBvcnQgeyBJRmlsZVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9maWxlcy9jb21tb24vZmlsZXMuanMnO1xuaW1wb3J0IHsgVGVzdEluc3RhbnRpYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vaW5zdGFudGlhdGlvbi90ZXN0L2NvbW1vbi9pbnN0YW50aWF0aW9uU2VydmljZU1vY2suanMnO1xuaW1wb3J0IHsgSUxhYmVsU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2xhYmVsL2NvbW1vbi9sYWJlbC5qcyc7XG5pbXBvcnQgeyBJTWFya2VyRGF0YSwgTWFya2VyU2V2ZXJpdHksIE1hcmtlclRhZyB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL21hcmtlcnMvY29tbW9uL21hcmtlcnMuanMnO1xuaW1wb3J0IHsgd29ya2JlbmNoSW5zdGFudGlhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi90ZXN0L2Jyb3dzZXIvd29ya2JlbmNoVGVzdFNlcnZpY2VzLmpzJztcbmltcG9ydCB7IExhbmd1YWdlTW9kZWxUb29sc1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9icm93c2VyL3Rvb2xzL2xhbmd1YWdlTW9kZWxUb29sc1NlcnZpY2UuanMnO1xuaW1wb3J0IHsgQ2hhdE1vZGUsIEN1c3RvbUNoYXRNb2RlLCBJQ2hhdE1vZGVTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vY29tbW9uL2NoYXRNb2Rlcy5qcyc7XG5pbXBvcnQgeyBDaGF0QWdlbnRMb2NhdGlvbiwgQ2hhdENvbmZpZ3VyYXRpb24gfSBmcm9tICcuLi8uLi8uLi8uLi9jb21tb24vY29uc3RhbnRzLmpzJztcbmltcG9ydCB7IElMYW5ndWFnZU1vZGVsVG9vbHNTZXJ2aWNlLCBJVG9vbERhdGEsIFRvb2xEYXRhU291cmNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vY29tbW9uL3Rvb2xzL2xhbmd1YWdlTW9kZWxUb29sc1NlcnZpY2UuanMnO1xuaW1wb3J0IHsgSUxhbmd1YWdlTW9kZWxDaGF0TWV0YWRhdGEsIElMYW5ndWFnZU1vZGVsc1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9jb21tb24vbGFuZ3VhZ2VNb2RlbHMuanMnO1xuaW1wb3J0IHsgZ2V0UHJvbXB0RmlsZUV4dGVuc2lvbiB9IGZyb20gJy4uLy4uLy4uLy4uL2NvbW1vbi9wcm9tcHRTeW50YXgvY29uZmlnL3Byb21wdEZpbGVMb2NhdGlvbnMuanMnO1xuaW1wb3J0IHsgUHJvbXB0VmFsaWRhdG9yIH0gZnJvbSAnLi4vLi4vLi4vLi4vY29tbW9uL3Byb21wdFN5bnRheC9sYW5ndWFnZVByb3ZpZGVycy9wcm9tcHRWYWxpZGF0b3IuanMnO1xuaW1wb3J0IHsgUHJvbXB0c1R5cGUsIFRhcmdldCB9IGZyb20gJy4uLy4uLy4uLy4uL2NvbW1vbi9wcm9tcHRTeW50YXgvcHJvbXB0VHlwZXMuanMnO1xuaW1wb3J0IHsgUHJvbXB0RmlsZVBhcnNlciB9IGZyb20gJy4uLy4uLy4uLy4uL2NvbW1vbi9wcm9tcHRTeW50YXgvcHJvbXB0RmlsZVBhcnNlci5qcyc7XG5pbXBvcnQgeyBJQ3VzdG9tQWdlbnQsIElQcm9tcHRzU2VydmljZSwgUHJvbXB0c1N0b3JhZ2UgfSBmcm9tICcuLi8uLi8uLi8uLi9jb21tb24vcHJvbXB0U3ludGF4L3NlcnZpY2UvcHJvbXB0c1NlcnZpY2UuanMnO1xuaW1wb3J0IHsgTW9ja0NoYXRNb2RlU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9tb2NrQ2hhdE1vZGVTZXJ2aWNlLmpzJztcbmltcG9ydCB7IE1vY2tQcm9tcHRzU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9wcm9tcHRTeW50YXgvc2VydmljZS9tb2NrUHJvbXB0c1NlcnZpY2UuanMnO1xuXG5zdWl0ZSgnUHJvbXB0VmFsaWRhdG9yJywgKCkgPT4ge1xuXHRjb25zdCBkaXNwb3NhYmxlcyA9IGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSgpO1xuXG5cdGxldCBpbnN0YVNlcnZpY2U6IFRlc3RJbnN0YW50aWF0aW9uU2VydmljZTtcblx0bGV0IHRlc3RDb25maWdTZXJ2aWNlOiBUZXN0Q29uZmlndXJhdGlvblNlcnZpY2U7XG5cblx0Y29uc3QgZXhpc3RpbmdSZWYxID0gVVJJLnBhcnNlKCdteUZzOi8vdGVzdC9yZWZlcmVuY2UxLm1kJyk7XG5cdGNvbnN0IGV4aXN0aW5nUmVmMiA9IFVSSS5wYXJzZSgnbXlGczovL3Rlc3QvcmVmZXJlbmNlMi5tZCcpO1xuXG5cdHNldHVwKGFzeW5jICgpID0+IHtcblxuXHRcdHRlc3RDb25maWdTZXJ2aWNlID0gbmV3IFRlc3RDb25maWd1cmF0aW9uU2VydmljZSgpO1xuXHRcdHRlc3RDb25maWdTZXJ2aWNlLnNldFVzZXJDb25maWd1cmF0aW9uKENoYXRDb25maWd1cmF0aW9uLkV4dGVuc2lvblRvb2xzRW5hYmxlZCwgdHJ1ZSk7XG5cdFx0aW5zdGFTZXJ2aWNlID0gd29ya2JlbmNoSW5zdGFudGlhdGlvblNlcnZpY2Uoe1xuXHRcdFx0Y29udGV4dEtleVNlcnZpY2U6ICgpID0+IGRpc3Bvc2FibGVzLmFkZChuZXcgQ29udGV4dEtleVNlcnZpY2UodGVzdENvbmZpZ1NlcnZpY2UpKSxcblx0XHRcdGNvbmZpZ3VyYXRpb25TZXJ2aWNlOiAoKSA9PiB0ZXN0Q29uZmlnU2VydmljZVxuXHRcdH0sIGRpc3Bvc2FibGVzKTtcblx0XHRpbnN0YVNlcnZpY2Uuc3R1YihJTGFiZWxTZXJ2aWNlLCB7IGdldFVyaUxhYmVsOiAocmVzb3VyY2UpID0+IHJlc291cmNlLnBhdGggfSk7XG5cblx0XHRjb25zdCB0b29sU2VydmljZSA9IGRpc3Bvc2FibGVzLmFkZChpbnN0YVNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoTGFuZ3VhZ2VNb2RlbFRvb2xzU2VydmljZSkpO1xuXG5cdFx0Y29uc3QgdGVzdFRvb2wxID0geyBpZDogJ3Rlc3RUb29sMScsIGRpc3BsYXlOYW1lOiAndG9vbDEnLCBjYW5CZVJlZmVyZW5jZWRJblByb21wdDogdHJ1ZSwgbW9kZWxEZXNjcmlwdGlvbjogJ1Rlc3QgVG9vbCAxJywgc291cmNlOiBUb29sRGF0YVNvdXJjZS5FeHRlcm5hbCwgaW5wdXRTY2hlbWE6IHt9IH0gc2F0aXNmaWVzIElUb29sRGF0YTtcblx0XHRkaXNwb3NhYmxlcy5hZGQodG9vbFNlcnZpY2UucmVnaXN0ZXJUb29sRGF0YSh0ZXN0VG9vbDEpKTtcblx0XHRjb25zdCB0ZXN0VG9vbDIgPSB7IGlkOiAndGVzdFRvb2wyJywgZGlzcGxheU5hbWU6ICd0b29sMicsIGNhbkJlUmVmZXJlbmNlZEluUHJvbXB0OiB0cnVlLCB0b29sUmVmZXJlbmNlTmFtZTogJ3Rvb2wyJywgbW9kZWxEZXNjcmlwdGlvbjogJ1Rlc3QgVG9vbCAyJywgc291cmNlOiBUb29sRGF0YVNvdXJjZS5FeHRlcm5hbCwgaW5wdXRTY2hlbWE6IHt9IH0gc2F0aXNmaWVzIElUb29sRGF0YTtcblx0XHRkaXNwb3NhYmxlcy5hZGQodG9vbFNlcnZpY2UucmVnaXN0ZXJUb29sRGF0YSh0ZXN0VG9vbDIpKTtcblx0XHRjb25zdCBzaGVsbFRvb2wgPSB7IGlkOiAnc2hlbGwnLCBkaXNwbGF5TmFtZTogJ3NoZWxsJywgY2FuQmVSZWZlcmVuY2VkSW5Qcm9tcHQ6IHRydWUsIHRvb2xSZWZlcmVuY2VOYW1lOiAnc2hlbGwnLCBtb2RlbERlc2NyaXB0aW9uOiAnUnVucyBjb21tYW5kcyBpbiB0aGUgdGVybWluYWwnLCBzb3VyY2U6IFRvb2xEYXRhU291cmNlLkV4dGVybmFsLCBpbnB1dFNjaGVtYToge30gfSBzYXRpc2ZpZXMgSVRvb2xEYXRhO1xuXHRcdGRpc3Bvc2FibGVzLmFkZCh0b29sU2VydmljZS5yZWdpc3RlclRvb2xEYXRhKHNoZWxsVG9vbCkpO1xuXG5cdFx0Y29uc3QgbXlFeHRTb3VyY2UgPSB7IHR5cGU6ICdleHRlbnNpb24nLCBsYWJlbDogJ015IEV4dGVuc2lvbicsIGV4dGVuc2lvbklkOiBuZXcgRXh0ZW5zaW9uSWRlbnRpZmllcignTXkuZXh0ZW5zaW9uJykgfSBzYXRpc2ZpZXMgVG9vbERhdGFTb3VyY2U7XG5cdFx0Y29uc3QgdGVzdFRvb2wzID0geyBpZDogJ3Rlc3RUb29sMycsIGRpc3BsYXlOYW1lOiAndG9vbDMnLCBjYW5CZVJlZmVyZW5jZWRJblByb21wdDogdHJ1ZSwgdG9vbFJlZmVyZW5jZU5hbWU6ICd0b29sMycsIG1vZGVsRGVzY3JpcHRpb246ICdUZXN0IFRvb2wgMycsIHNvdXJjZTogbXlFeHRTb3VyY2UsIGlucHV0U2NoZW1hOiB7fSB9IHNhdGlzZmllcyBJVG9vbERhdGE7XG5cdFx0ZGlzcG9zYWJsZXMuYWRkKHRvb2xTZXJ2aWNlLnJlZ2lzdGVyVG9vbERhdGEodGVzdFRvb2wzKSk7XG5cblx0XHRjb25zdCBwckV4dFNvdXJjZSA9IHsgdHlwZTogJ2V4dGVuc2lvbicsIGxhYmVsOiAnR2l0SHViIFB1bGwgUmVxdWVzdCBFeHRlbnNpb24nLCBleHRlbnNpb25JZDogbmV3IEV4dGVuc2lvbklkZW50aWZpZXIoJ2dpdGh1Yi52c2NvZGUtcHVsbC1yZXF1ZXN0LWdpdGh1YicpIH0gc2F0aXNmaWVzIFRvb2xEYXRhU291cmNlO1xuXHRcdGNvbnN0IHByRXh0VG9vbDEgPSB7IGlkOiAnc3VnZ2VzdEZpeCcsIGNhbkJlUmVmZXJlbmNlZEluUHJvbXB0OiB0cnVlLCB0b29sUmVmZXJlbmNlTmFtZTogJ3N1Z2dlc3QtZml4JywgbW9kZWxEZXNjcmlwdGlvbjogJ3Rvb2w0JywgZGlzcGxheU5hbWU6ICdUZXN0IFRvb2wgNCcsIHNvdXJjZTogcHJFeHRTb3VyY2UsIGlucHV0U2NoZW1hOiB7fSB9IHNhdGlzZmllcyBJVG9vbERhdGE7XG5cdFx0ZGlzcG9zYWJsZXMuYWRkKHRvb2xTZXJ2aWNlLnJlZ2lzdGVyVG9vbERhdGEocHJFeHRUb29sMSkpO1xuXG5cdFx0Y29uc3QgdG9vbFdpdGhMZWdhY3kgPSB7IGlkOiAnbmV3VG9vbCcsIHRvb2xSZWZlcmVuY2VOYW1lOiAnbmV3VG9vbFJlZicsIGRpc3BsYXlOYW1lOiAnTmV3IFRvb2wnLCBjYW5CZVJlZmVyZW5jZWRJblByb21wdDogdHJ1ZSwgbW9kZWxEZXNjcmlwdGlvbjogJ05ldyBUb29sJywgc291cmNlOiBUb29sRGF0YVNvdXJjZS5FeHRlcm5hbCwgaW5wdXRTY2hlbWE6IHt9LCBsZWdhY3lUb29sUmVmZXJlbmNlRnVsbE5hbWVzOiBbJ29sZFRvb2xOYW1lJywgJ2RlcHJlY2F0ZWRUb29sTmFtZSddIH0gc2F0aXNmaWVzIElUb29sRGF0YTtcblx0XHRkaXNwb3NhYmxlcy5hZGQodG9vbFNlcnZpY2UucmVnaXN0ZXJUb29sRGF0YSh0b29sV2l0aExlZ2FjeSkpO1xuXG5cdFx0Y29uc3QgdG9vbFNldFdpdGhMZWdhY3kgPSBkaXNwb3NhYmxlcy5hZGQodG9vbFNlcnZpY2UuY3JlYXRlVG9vbFNldChcblx0XHRcdFRvb2xEYXRhU291cmNlLkV4dGVybmFsLFxuXHRcdFx0J25ld1Rvb2xTZXQnLFxuXHRcdFx0J25ld1Rvb2xTZXRSZWYnLFxuXHRcdFx0eyBkZXNjcmlwdGlvbjogJ05ldyBUb29sIFNldCcsIGxlZ2FjeUZ1bGxOYW1lczogWydvbGRUb29sU2V0JywgJ2RlcHJlY2F0ZWRUb29sU2V0J10gfVxuXHRcdCkpO1xuXHRcdGNvbnN0IHRvb2xJblNldCA9IHsgaWQ6ICd0b29sSW5TZXQnLCB0b29sUmVmZXJlbmNlTmFtZTogJ3Rvb2xJblNldFJlZicsIGRpc3BsYXlOYW1lOiAnVG9vbCBJbiBTZXQnLCBjYW5CZVJlZmVyZW5jZWRJblByb21wdDogZmFsc2UsIG1vZGVsRGVzY3JpcHRpb246ICdUb29sIEluIFNldCcsIHNvdXJjZTogVG9vbERhdGFTb3VyY2UuRXh0ZXJuYWwsIGlucHV0U2NoZW1hOiB7fSB9IHNhdGlzZmllcyBJVG9vbERhdGE7XG5cdFx0ZGlzcG9zYWJsZXMuYWRkKHRvb2xTZXJ2aWNlLnJlZ2lzdGVyVG9vbERhdGEodG9vbEluU2V0KSk7XG5cdFx0ZGlzcG9zYWJsZXMuYWRkKHRvb2xTZXRXaXRoTGVnYWN5LmFkZFRvb2wodG9vbEluU2V0KSk7XG5cblx0XHRjb25zdCBhbm90aGVyVG9vbFdpdGhMZWdhY3kgPSB7IGlkOiAnYW5vdGhlclRvb2wnLCB0b29sUmVmZXJlbmNlTmFtZTogJ2Fub3RoZXJUb29sUmVmJywgZGlzcGxheU5hbWU6ICdBbm90aGVyIFRvb2wnLCBjYW5CZVJlZmVyZW5jZWRJblByb21wdDogdHJ1ZSwgbW9kZWxEZXNjcmlwdGlvbjogJ0Fub3RoZXIgVG9vbCcsIHNvdXJjZTogVG9vbERhdGFTb3VyY2UuRXh0ZXJuYWwsIGlucHV0U2NoZW1hOiB7fSwgbGVnYWN5VG9vbFJlZmVyZW5jZUZ1bGxOYW1lczogWydsZWdhY3lUb29sJ10gfSBzYXRpc2ZpZXMgSVRvb2xEYXRhO1xuXHRcdGRpc3Bvc2FibGVzLmFkZCh0b29sU2VydmljZS5yZWdpc3RlclRvb2xEYXRhKGFub3RoZXJUb29sV2l0aExlZ2FjeSkpO1xuXG5cdFx0Y29uc3QgYW5vdGhlclRvb2xTZXRXaXRoTGVnYWN5ID0gZGlzcG9zYWJsZXMuYWRkKHRvb2xTZXJ2aWNlLmNyZWF0ZVRvb2xTZXQoXG5cdFx0XHRUb29sRGF0YVNvdXJjZS5FeHRlcm5hbCxcblx0XHRcdCdhbm90aGVyVG9vbFNldCcsXG5cdFx0XHQnYW5vdGhlclRvb2xTZXRSZWYnLFxuXHRcdFx0eyBkZXNjcmlwdGlvbjogJ0Fub3RoZXIgVG9vbCBTZXQnLCBsZWdhY3lGdWxsTmFtZXM6IFsnbGVnYWN5VG9vbFNldCddIH1cblx0XHQpKTtcblx0XHRjb25zdCBhbm90aGVyVG9vbEluU2V0ID0geyBpZDogJ2Fub3RoZXJUb29sSW5TZXQnLCB0b29sUmVmZXJlbmNlTmFtZTogJ2Fub3RoZXJUb29sSW5TZXRSZWYnLCBkaXNwbGF5TmFtZTogJ0Fub3RoZXIgVG9vbCBJbiBTZXQnLCBjYW5CZVJlZmVyZW5jZWRJblByb21wdDogZmFsc2UsIG1vZGVsRGVzY3JpcHRpb246ICdBbm90aGVyIFRvb2wgSW4gU2V0Jywgc291cmNlOiBUb29sRGF0YVNvdXJjZS5FeHRlcm5hbCwgaW5wdXRTY2hlbWE6IHt9IH0gc2F0aXNmaWVzIElUb29sRGF0YTtcblx0XHRkaXNwb3NhYmxlcy5hZGQodG9vbFNlcnZpY2UucmVnaXN0ZXJUb29sRGF0YShhbm90aGVyVG9vbEluU2V0KSk7XG5cdFx0ZGlzcG9zYWJsZXMuYWRkKGFub3RoZXJUb29sU2V0V2l0aExlZ2FjeS5hZGRUb29sKGFub3RoZXJUb29sSW5TZXQpKTtcblxuXHRcdGNvbnN0IGNvbmZsaWN0VG9vbFNldDEgPSBkaXNwb3NhYmxlcy5hZGQodG9vbFNlcnZpY2UuY3JlYXRlVG9vbFNldChcblx0XHRcdFRvb2xEYXRhU291cmNlLkV4dGVybmFsLFxuXHRcdFx0J2NvbmZsaWN0U2V0MScsXG5cdFx0XHQnY29uZmxpY3RTZXQxUmVmJyxcblx0XHRcdHsgbGVnYWN5RnVsbE5hbWVzOiBbJ3NoYXJlZExlZ2FjeU5hbWUnXSB9XG5cdFx0KSk7XG5cdFx0Y29uc3QgY29uZmxpY3RUb29sMSA9IHsgaWQ6ICdjb25mbGljdFRvb2wxJywgdG9vbFJlZmVyZW5jZU5hbWU6ICdjb25mbGljdFRvb2wxUmVmJywgZGlzcGxheU5hbWU6ICdDb25mbGljdCBUb29sIDEnLCBjYW5CZVJlZmVyZW5jZWRJblByb21wdDogZmFsc2UsIG1vZGVsRGVzY3JpcHRpb246ICdDb25mbGljdCBUb29sIDEnLCBzb3VyY2U6IFRvb2xEYXRhU291cmNlLkV4dGVybmFsLCBpbnB1dFNjaGVtYToge30gfSBzYXRpc2ZpZXMgSVRvb2xEYXRhO1xuXHRcdGRpc3Bvc2FibGVzLmFkZCh0b29sU2VydmljZS5yZWdpc3RlclRvb2xEYXRhKGNvbmZsaWN0VG9vbDEpKTtcblx0XHRkaXNwb3NhYmxlcy5hZGQoY29uZmxpY3RUb29sU2V0MS5hZGRUb29sKGNvbmZsaWN0VG9vbDEpKTtcblxuXHRcdGNvbnN0IGNvbmZsaWN0VG9vbFNldDIgPSBkaXNwb3NhYmxlcy5hZGQodG9vbFNlcnZpY2UuY3JlYXRlVG9vbFNldChcblx0XHRcdFRvb2xEYXRhU291cmNlLkV4dGVybmFsLFxuXHRcdFx0J2NvbmZsaWN0U2V0MicsXG5cdFx0XHQnY29uZmxpY3RTZXQyUmVmJyxcblx0XHRcdHsgbGVnYWN5RnVsbE5hbWVzOiBbJ3NoYXJlZExlZ2FjeU5hbWUnXSB9XG5cdFx0KSk7XG5cdFx0Y29uc3QgY29uZmxpY3RUb29sMiA9IHsgaWQ6ICdjb25mbGljdFRvb2wyJywgdG9vbFJlZmVyZW5jZU5hbWU6ICdjb25mbGljdFRvb2wyUmVmJywgZGlzcGxheU5hbWU6ICdDb25mbGljdCBUb29sIDInLCBjYW5CZVJlZmVyZW5jZWRJblByb21wdDogZmFsc2UsIG1vZGVsRGVzY3JpcHRpb246ICdDb25mbGljdCBUb29sIDInLCBzb3VyY2U6IFRvb2xEYXRhU291cmNlLkV4dGVybmFsLCBpbnB1dFNjaGVtYToge30gfSBzYXRpc2ZpZXMgSVRvb2xEYXRhO1xuXHRcdGRpc3Bvc2FibGVzLmFkZCh0b29sU2VydmljZS5yZWdpc3RlclRvb2xEYXRhKGNvbmZsaWN0VG9vbDIpKTtcblx0XHRkaXNwb3NhYmxlcy5hZGQoY29uZmxpY3RUb29sU2V0Mi5hZGRUb29sKGNvbmZsaWN0VG9vbDIpKTtcblxuXHRcdC8vIFRvb2wgaW4gdGhlIHZzY29kZSB0b29sc2V0IHdpdGggYSBsZWdhY3kgbmFtZSBcdTIwMTQgZm9yIHRlc3RpbmcgbmFtZXNwYWNlZCBkZXByZWNhdGVkIG5hbWUgcmVzb2x1dGlvblxuXHRcdGNvbnN0IHRvb2xJblZzY29kZVNldCA9IHsgaWQ6ICdicm93c2VyVG9vbCcsIHRvb2xSZWZlcmVuY2VOYW1lOiAnb3BlbkludGVncmF0ZWRCcm93c2VyJywgbGVnYWN5VG9vbFJlZmVyZW5jZUZ1bGxOYW1lczogWydvcGVuU2ltcGxlQnJvd3NlciddLCBkaXNwbGF5TmFtZTogJ09wZW4gSW50ZWdyYXRlZCBCcm93c2VyJywgY2FuQmVSZWZlcmVuY2VkSW5Qcm9tcHQ6IHRydWUsIG1vZGVsRGVzY3JpcHRpb246ICdPcGVuIGJyb3dzZXInLCBzb3VyY2U6IFRvb2xEYXRhU291cmNlLkludGVybmFsLCBpbnB1dFNjaGVtYToge30gfSBzYXRpc2ZpZXMgSVRvb2xEYXRhO1xuXHRcdGRpc3Bvc2FibGVzLmFkZCh0b29sU2VydmljZS5yZWdpc3RlclRvb2xEYXRhKHRvb2xJblZzY29kZVNldCkpO1xuXHRcdGRpc3Bvc2FibGVzLmFkZCh0b29sU2VydmljZS52c2NvZGVUb29sU2V0LmFkZFRvb2wodG9vbEluVnNjb2RlU2V0KSk7XG5cblx0XHRpbnN0YVNlcnZpY2Uuc2V0KElMYW5ndWFnZU1vZGVsVG9vbHNTZXJ2aWNlLCB0b29sU2VydmljZSk7XG5cblx0XHRjb25zdCB0ZXN0TW9kZWxzOiBJTGFuZ3VhZ2VNb2RlbENoYXRNZXRhZGF0YVtdID0gW1xuXHRcdFx0eyBpZDogJ21hZS00JywgbmFtZTogJ01BRSA0JywgdmVuZG9yOiAnb2xhbWEnLCB2ZXJzaW9uOiAnMS4wJywgZmFtaWx5OiAnbWFlJywgZXh0ZW5zaW9uOiBuZXcgRXh0ZW5zaW9uSWRlbnRpZmllcignYS5iJyksIGlzVXNlclNlbGVjdGFibGU6IHRydWUsIG1heElucHV0VG9rZW5zOiA4MTkyLCBtYXhPdXRwdXRUb2tlbnM6IDEwMjQsIGNhcGFiaWxpdGllczogeyBhZ2VudE1vZGU6IHRydWUsIHRvb2xDYWxsaW5nOiB0cnVlIH0sIGlzRGVmYXVsdEZvckxvY2F0aW9uOiB7IFtDaGF0QWdlbnRMb2NhdGlvbi5DaGF0XTogdHJ1ZSB9IH0gc2F0aXNmaWVzIElMYW5ndWFnZU1vZGVsQ2hhdE1ldGFkYXRhLFxuXHRcdFx0eyBpZDogJ21hZS00LjEnLCBuYW1lOiAnTUFFIDQuMScsIHZlbmRvcjogJ2NvcGlsb3QnLCB2ZXJzaW9uOiAnMS4wJywgZmFtaWx5OiAnbWFlJywgZXh0ZW5zaW9uOiBuZXcgRXh0ZW5zaW9uSWRlbnRpZmllcignYS5iJyksIGlzVXNlclNlbGVjdGFibGU6IHRydWUsIG1heElucHV0VG9rZW5zOiA4MTkyLCBtYXhPdXRwdXRUb2tlbnM6IDEwMjQsIGNhcGFiaWxpdGllczogeyBhZ2VudE1vZGU6IHRydWUsIHRvb2xDYWxsaW5nOiB0cnVlIH0sIGlzRGVmYXVsdEZvckxvY2F0aW9uOiB7IFtDaGF0QWdlbnRMb2NhdGlvbi5DaGF0XTogdHJ1ZSB9IH0gc2F0aXNmaWVzIElMYW5ndWFnZU1vZGVsQ2hhdE1ldGFkYXRhLFxuXHRcdFx0eyBpZDogJ21hZS0zLjUtdHVyYm8nLCBuYW1lOiAnTUFFIDMuNSBUdXJibycsIHZlbmRvcjogJ2NvcGlsb3QnLCB2ZXJzaW9uOiAnMS4wJywgZmFtaWx5OiAnbWFlJywgZXh0ZW5zaW9uOiBuZXcgRXh0ZW5zaW9uSWRlbnRpZmllcignYS5iJyksIGlzVXNlclNlbGVjdGFibGU6IHRydWUsIG1heElucHV0VG9rZW5zOiA4MTkyLCBtYXhPdXRwdXRUb2tlbnM6IDEwMjQsIGlzRGVmYXVsdEZvckxvY2F0aW9uOiB7IFtDaGF0QWdlbnRMb2NhdGlvbi5DaGF0XTogdHJ1ZSB9IH0gc2F0aXNmaWVzIElMYW5ndWFnZU1vZGVsQ2hhdE1ldGFkYXRhXG5cdFx0XTtcblxuXHRcdGluc3RhU2VydmljZS5zdHViKElMYW5ndWFnZU1vZGVsc1NlcnZpY2UsIHtcblx0XHRcdGdldExhbmd1YWdlTW9kZWxJZHMoKSB7IHJldHVybiB0ZXN0TW9kZWxzLm1hcChtID0+IG0uaWQpOyB9LFxuXHRcdFx0bG9va3VwTGFuZ3VhZ2VNb2RlbEJ5UXVhbGlmaWVkTmFtZShxdWFsaWZpZWROYW1lOiBzdHJpbmcpIHtcblx0XHRcdFx0Zm9yIChjb25zdCBtZXRhZGF0YSBvZiB0ZXN0TW9kZWxzKSB7XG5cdFx0XHRcdFx0aWYgKElMYW5ndWFnZU1vZGVsQ2hhdE1ldGFkYXRhLm1hdGNoZXNRdWFsaWZpZWROYW1lKHF1YWxpZmllZE5hbWUsIG1ldGFkYXRhKSkge1xuXHRcdFx0XHRcdFx0cmV0dXJuIHsgbWV0YWRhdGEsIGlkZW50aWZpZXI6IG1ldGFkYXRhLmlkIH07XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0XHR9XG5cdFx0fSk7XG5cblx0XHRjb25zdCBjdXN0b21DaGF0TW9kZSA9IG5ldyBDdXN0b21DaGF0TW9kZSh7XG5cdFx0XHRpZDogJ2JlYXN0LW1vZGUnLFxuXHRcdFx0dXJpOiBVUkkucGFyc2UoJ215RnM6Ly90ZXN0L3Rlc3QvY2hhdG1vZGUubWQnKSxcblx0XHRcdG5hbWU6ICdCZWFzdE1vZGUnLFxuXHRcdFx0YWdlbnRJbnN0cnVjdGlvbnM6IHsgY29udGVudDogJ0JlYXN0IG1vZGUgaW5zdHJ1Y3Rpb25zJywgdG9vbFJlZmVyZW5jZXM6IFtdIH0sXG5cdFx0XHRzb3VyY2U6IHsgc3RvcmFnZTogUHJvbXB0c1N0b3JhZ2UubG9jYWwgfSxcblx0XHRcdHRhcmdldDogVGFyZ2V0LlVuZGVmaW5lZCxcblx0XHRcdHZpc2liaWxpdHk6IHsgdXNlckludm9jYWJsZTogdHJ1ZSwgYWdlbnRJbnZvY2FibGU6IHRydWUgfSxcblx0XHRcdGVuYWJsZWQ6IHRydWVcblx0XHR9KTtcblx0XHRpbnN0YVNlcnZpY2Uuc3R1YihJQ2hhdE1vZGVTZXJ2aWNlLCBuZXcgTW9ja0NoYXRNb2RlU2VydmljZSh7IGJ1aWx0aW46IFtDaGF0TW9kZS5BZ2VudCwgQ2hhdE1vZGUuQXNrLCBDaGF0TW9kZS5FZGl0XSwgY3VzdG9tOiBbY3VzdG9tQ2hhdE1vZGVdIH0pKTtcblxuXG5cdFx0Y29uc3QgZXhpc3RpbmdGaWxlcyA9IG5ldyBSZXNvdXJjZVNldChbZXhpc3RpbmdSZWYxLCBleGlzdGluZ1JlZjJdKTtcblx0XHRpbnN0YVNlcnZpY2Uuc3R1YihJRmlsZVNlcnZpY2UsIHtcblx0XHRcdGV4aXN0cyh1cmk6IFVSSSkge1xuXHRcdFx0XHRyZXR1cm4gUHJvbWlzZS5yZXNvbHZlKGV4aXN0aW5nRmlsZXMuaGFzKHVyaSkpO1xuXHRcdFx0fVxuXHRcdH0pO1xuXHRcdGNvbnN0IHByb21wdHNTZXJ2aWNlID0gbmV3IE1vY2tQcm9tcHRzU2VydmljZSgpO1xuXHRcdGNvbnN0IGN1c3RvbU1vZGU6IElDdXN0b21BZ2VudCA9IHtcblx0XHRcdGlkOiAnY3VzdG9tLW1vZGUnLFxuXHRcdFx0dXJpOiBVUkkucGFyc2UoJ2ZpbGU6Ly8vdGVzdC9jdXN0b20tbW9kZS5tZCcpLFxuXHRcdFx0bmFtZTogJ1BsYW4nLFxuXHRcdFx0ZGVzY3JpcHRpb246ICdBIHRlc3QgY3VzdG9tIG1vZGUnLFxuXHRcdFx0dG9vbHM6IFsndG9vbDEnLCAndG9vbDInXSxcblx0XHRcdGFnZW50SW5zdHJ1Y3Rpb25zOiB7IGNvbnRlbnQ6ICdDdXN0b20gbW9kZSBib2R5JywgdG9vbFJlZmVyZW5jZXM6IFtdIH0sXG5cdFx0XHRzb3VyY2U6IHsgc3RvcmFnZTogUHJvbXB0c1N0b3JhZ2UubG9jYWwgfSxcblx0XHRcdHRhcmdldDogVGFyZ2V0LlVuZGVmaW5lZCxcblx0XHRcdHZpc2liaWxpdHk6IHsgdXNlckludm9jYWJsZTogdHJ1ZSwgYWdlbnRJbnZvY2FibGU6IHRydWUgfSxcblx0XHRcdGVuYWJsZWQ6IHRydWVcblx0XHR9O1xuXHRcdHByb21wdHNTZXJ2aWNlLnNldEN1c3RvbU1vZGVzKFtjdXN0b21Nb2RlXSk7XG5cdFx0aW5zdGFTZXJ2aWNlLnN0dWIoSVByb21wdHNTZXJ2aWNlLCBwcm9tcHRzU2VydmljZSk7XG5cdH0pO1xuXG5cdGFzeW5jIGZ1bmN0aW9uIHZhbGlkYXRlKGNvZGU6IHN0cmluZywgcHJvbXB0VHlwZTogUHJvbXB0c1R5cGUsIHVyaT86IFVSSSk6IFByb21pc2U8SU1hcmtlckRhdGFbXT4ge1xuXHRcdGlmICghdXJpKSB7XG5cdFx0XHR1cmkgPSBVUkkucGFyc2UoJ215RnM6Ly90ZXN0L3Rlc3RGaWxlJyArIGdldFByb21wdEZpbGVFeHRlbnNpb24ocHJvbXB0VHlwZSkpO1xuXHRcdH1cblx0XHRjb25zdCByZXN1bHQgPSBuZXcgUHJvbXB0RmlsZVBhcnNlcigpLnBhcnNlKHVyaSwgY29kZSk7XG5cdFx0Y29uc3QgdmFsaWRhdG9yID0gaW5zdGFTZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFByb21wdFZhbGlkYXRvcik7XG5cdFx0Y29uc3QgbWFya2VyczogSU1hcmtlckRhdGFbXSA9IFtdO1xuXHRcdGF3YWl0IHZhbGlkYXRvci52YWxpZGF0ZShyZXN1bHQsIHByb21wdFR5cGUsIG0gPT4gbWFya2Vycy5wdXNoKG0pKTtcblx0XHRyZXR1cm4gbWFya2Vycztcblx0fVxuXHRzdWl0ZSgnYWdlbnRzJywgKCkgPT4ge1xuXG5cdFx0dGVzdCgnY29ycmVjdCBhZ2VudCcsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IGNvbnRlbnQgPSBbXG5cdFx0XHQvKiAwMSAqLyctLS0nLFxuXHRcdFx0LyogMDIgKi9gZGVzY3JpcHRpb246IFwiQWdlbnQgbW9kZSB0ZXN0XCJgLFxuXHRcdFx0LyogMDMgKi8nbW9kZWw6IE1BRSA0LjEnLFxuXHRcdFx0LyogMDQgKi9gdG9vbHM6IFsndG9vbDEnLCAndG9vbDInXWAsXG5cdFx0XHQvKiAwNSAqLyctLS0nLFxuXHRcdFx0LyogMDYgKi8nVGhpcyBpcyBhIGNoYXQgYWdlbnQgdGVzdC4nLFxuXHRcdFx0LyogMDcgKi8nSGVyZSBpcyBhICN0b29sMSB2YXJpYWJsZSBhbmQgYSAjZmlsZTouL3JlZmVyZW5jZTEubWQgYXMgd2VsbCBhcyBhIFtyZWZlcmVuY2VdKC4vcmVmZXJlbmNlMi5tZCkuJyxcblx0XHRcdF0uam9pbignXFxuJyk7XG5cdFx0XHRjb25zdCBtYXJrZXJzID0gYXdhaXQgdmFsaWRhdGUoY29udGVudCwgUHJvbXB0c1R5cGUuYWdlbnQpO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChtYXJrZXJzLCBbXSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdhZ2VudCB3aXRoIGVycm9ycyAoZW1wdHkgZGVzY3JpcHRpb24sIHVua25vd24gdG9vbCAmIG1vZGVsKScsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IGNvbnRlbnQgPSBbXG5cdFx0XHQvKiAwMSAqLyctLS0nLFxuXHRcdFx0LyogMDIgKi9gZGVzY3JpcHRpb246IFwiXCJgLCAvLyBlbXB0eSBkZXNjcmlwdGlvbiAtPiBlcnJvclxuXHRcdFx0LyogMDMgKi8nbW9kZWw6IE1BRSA0LjInLCAvLyB1bmtub3duIG1vZGVsIC0+IHdhcm5pbmdcblx0XHRcdC8qIDA0ICovYHRvb2xzOiBbJ3Rvb2wxJywgJ3Rvb2wyJywgJ3Rvb2w0JywgJ215LmV4dGVuc2lvbi90b29sMyddYCwgLy8gdG9vbDQgdW5rbm93biAtPiBlcnJvclxuXHRcdFx0LyogMDUgKi8nLS0tJyxcblx0XHRcdC8qIDA2ICovJ0JvZHknLFxuXHRcdFx0XS5qb2luKCdcXG4nKTtcblx0XHRcdGNvbnN0IG1hcmtlcnMgPSBhd2FpdCB2YWxpZGF0ZShjb250ZW50LCBQcm9tcHRzVHlwZS5hZ2VudCk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKFxuXHRcdFx0XHRtYXJrZXJzLm1hcChtID0+ICh7IHNldmVyaXR5OiBtLnNldmVyaXR5LCBtZXNzYWdlOiBtLm1lc3NhZ2UsIHRhZ3M6IG0udGFncyB9KSksXG5cdFx0XHRcdFtcblx0XHRcdFx0XHR7IHNldmVyaXR5OiBNYXJrZXJTZXZlcml0eS5FcnJvciwgbWVzc2FnZTogYFRoZSAnZGVzY3JpcHRpb24nIGF0dHJpYnV0ZSBzaG91bGQgbm90IGJlIGVtcHR5LmAsIHRhZ3M6IHVuZGVmaW5lZCB9LFxuXHRcdFx0XHRcdHsgc2V2ZXJpdHk6IE1hcmtlclNldmVyaXR5LkhpbnQsIG1lc3NhZ2U6IGBVbmtub3duIHRvb2wgJ3Rvb2w0JyB3aWxsIGJlIGlnbm9yZWQuYCwgdGFnczogW01hcmtlclRhZy5Vbm5lY2Vzc2FyeV0gfSxcblx0XHRcdFx0XHR7IHNldmVyaXR5OiBNYXJrZXJTZXZlcml0eS5IaW50LCBtZXNzYWdlOiBgVW5rbm93biBtb2RlbCAnTUFFIDQuMicgd2lsbCBiZSBpZ25vcmVkLmAsIHRhZ3M6IFtNYXJrZXJUYWcuVW5uZWNlc3NhcnldIH0sXG5cdFx0XHRcdF1cblx0XHRcdCk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCd0b29scyBtdXN0IGJlIGFycmF5IG9yIHN0cmluZycsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IGNvbnRlbnQgPSBbXG5cdFx0XHRcdCctLS0nLFxuXHRcdFx0XHQnZGVzY3JpcHRpb246IFwiVGVzdFwiJyxcblx0XHRcdFx0YHRvb2xzOiAndG9vbDEnYCxcblx0XHRcdFx0Jy0tLScsXG5cdFx0XHRdLmpvaW4oJ1xcbicpO1xuXHRcdFx0Y29uc3QgbWFya2VycyA9IGF3YWl0IHZhbGlkYXRlKGNvbnRlbnQsIFByb21wdHNUeXBlLmFnZW50KTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChtYXJrZXJzLmxlbmd0aCwgMCk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdtb2RlbCBhcyBzdHJpbmcgYXJyYXkgLSB2YWxpZCcsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IGNvbnRlbnQgPSBbXG5cdFx0XHRcdCctLS0nLFxuXHRcdFx0XHQnZGVzY3JpcHRpb246IFwiVGVzdCB3aXRoIG1vZGVsIGFycmF5XCInLFxuXHRcdFx0XHRgbW9kZWw6IFsnTUFFIDQgKG9sYW1hKScsICdNQUUgNC4xJ11gLFxuXHRcdFx0XHQnLS0tJyxcblx0XHRcdF0uam9pbignXFxuJyk7XG5cdFx0XHRjb25zdCBtYXJrZXJzID0gYXdhaXQgdmFsaWRhdGUoY29udGVudCwgUHJvbXB0c1R5cGUuYWdlbnQpO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChtYXJrZXJzLCBbXSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdtb2RlbCBhcyBzdHJpbmcgYXJyYXkgLSB1bmtub3duIG1vZGVsIGlzIGlnbm9yZWQnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCBjb250ZW50ID0gW1xuXHRcdFx0XHQnLS0tJyxcblx0XHRcdFx0J2Rlc2NyaXB0aW9uOiBcIlRlc3Qgd2l0aCBtb2RlbCBhcnJheVwiJyxcblx0XHRcdFx0YG1vZGVsOiBbJ01BRSA0IChvbGFtYSknLCAnVW5rbm93biBNb2RlbCddYCxcblx0XHRcdFx0Jy0tLScsXG5cdFx0XHRdLmpvaW4oJ1xcbicpO1xuXHRcdFx0Y29uc3QgbWFya2VycyA9IGF3YWl0IHZhbGlkYXRlKGNvbnRlbnQsIFByb21wdHNUeXBlLmFnZW50KTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChtYXJrZXJzLmxlbmd0aCwgMSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobWFya2Vyc1swXS5zZXZlcml0eSwgTWFya2VyU2V2ZXJpdHkuSGludCk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKG1hcmtlcnNbMF0udGFncywgW01hcmtlclRhZy5Vbm5lY2Vzc2FyeV0pO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1hcmtlcnNbMF0ubWVzc2FnZSwgYFVua25vd24gbW9kZWwgJ1Vua25vd24gTW9kZWwnIHdpbGwgYmUgaWdub3JlZC5gKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ21vZGVsIGFzIHN0cmluZyBhcnJheSAtIHVuc3VpdGFibGUgbW9kZWwnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCBjb250ZW50ID0gW1xuXHRcdFx0XHQnLS0tJyxcblx0XHRcdFx0J2Rlc2NyaXB0aW9uOiBcIlRlc3Qgd2l0aCBtb2RlbCBhcnJheVwiJyxcblx0XHRcdFx0YG1vZGVsOiBbJ01BRSA0IChvbGFtYSknLCAnTUFFIDMuNSBUdXJibyddYCxcblx0XHRcdFx0Jy0tLScsXG5cdFx0XHRdLmpvaW4oJ1xcbicpO1xuXHRcdFx0Y29uc3QgbWFya2VycyA9IGF3YWl0IHZhbGlkYXRlKGNvbnRlbnQsIFByb21wdHNUeXBlLmFnZW50KTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChtYXJrZXJzLmxlbmd0aCwgMSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobWFya2Vyc1swXS5zZXZlcml0eSwgTWFya2VyU2V2ZXJpdHkuV2FybmluZyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobWFya2Vyc1swXS5tZXNzYWdlLCBgTW9kZWwgJ01BRSAzLjUgVHVyYm8nIGlzIG5vdCBzdWl0ZWQgZm9yIGFnZW50IG1vZGUuYCk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdtb2RlbCBhcyBzdHJpbmcgYXJyYXkgLSBlbXB0eSBhcnJheScsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IGNvbnRlbnQgPSBbXG5cdFx0XHRcdCctLS0nLFxuXHRcdFx0XHQnZGVzY3JpcHRpb246IFwiVGVzdCB3aXRoIGVtcHR5IG1vZGVsIGFycmF5XCInLFxuXHRcdFx0XHRgbW9kZWw6IFtdYCxcblx0XHRcdFx0Jy0tLScsXG5cdFx0XHRdLmpvaW4oJ1xcbicpO1xuXHRcdFx0Y29uc3QgbWFya2VycyA9IGF3YWl0IHZhbGlkYXRlKGNvbnRlbnQsIFByb21wdHNUeXBlLmFnZW50KTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChtYXJrZXJzLmxlbmd0aCwgMSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobWFya2Vyc1swXS5zZXZlcml0eSwgTWFya2VyU2V2ZXJpdHkuRXJyb3IpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1hcmtlcnNbMF0ubWVzc2FnZSwgYFRoZSAnbW9kZWwnIGFycmF5IG11c3Qgbm90IGJlIGVtcHR5LmApO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnbW9kZWwgYXMgc3RyaW5nIGFycmF5IC0gbm9uLXN0cmluZyBpdGVtJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgY29udGVudCA9IFtcblx0XHRcdFx0Jy0tLScsXG5cdFx0XHRcdCdkZXNjcmlwdGlvbjogXCJUZXN0IHdpdGggaW52YWxpZCBtb2RlbCBhcnJheVwiJyxcblx0XHRcdFx0YG1vZGVsOiBbJ01BRSA0IChvbGFtYSknLCBbXV1gLFxuXHRcdFx0XHQnLS0tJyxcblx0XHRcdF0uam9pbignXFxuJyk7XG5cdFx0XHRjb25zdCBtYXJrZXJzID0gYXdhaXQgdmFsaWRhdGUoY29udGVudCwgUHJvbXB0c1R5cGUuYWdlbnQpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1hcmtlcnMubGVuZ3RoLCAxKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChtYXJrZXJzWzBdLnNldmVyaXR5LCBNYXJrZXJTZXZlcml0eS5FcnJvcik7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobWFya2Vyc1swXS5tZXNzYWdlLCBgVGhlICdtb2RlbCcgYXJyYXkgbXVzdCBjb250YWluIG9ubHkgc3RyaW5ncy5gKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ21vZGVsIGFzIHN0cmluZyBhcnJheSAtIGVtcHR5IHN0cmluZyBpdGVtJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgY29udGVudCA9IFtcblx0XHRcdFx0Jy0tLScsXG5cdFx0XHRcdCdkZXNjcmlwdGlvbjogXCJUZXN0IHdpdGggZW1wdHkgc3RyaW5nIGluIG1vZGVsIGFycmF5XCInLFxuXHRcdFx0XHRgbW9kZWw6IFsnTUFFIDQgKG9sYW1hKScsICcnXWAsXG5cdFx0XHRcdCctLS0nLFxuXHRcdFx0XS5qb2luKCdcXG4nKTtcblx0XHRcdGNvbnN0IG1hcmtlcnMgPSBhd2FpdCB2YWxpZGF0ZShjb250ZW50LCBQcm9tcHRzVHlwZS5hZ2VudCk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobWFya2Vycy5sZW5ndGgsIDEpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1hcmtlcnNbMF0uc2V2ZXJpdHksIE1hcmtlclNldmVyaXR5LkVycm9yKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChtYXJrZXJzWzBdLm1lc3NhZ2UsIGBNb2RlbCBuYW1lcyBpbiB0aGUgYXJyYXkgbXVzdCBiZSBub24tZW1wdHkgc3RyaW5ncy5gKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ21vZGVsIGFzIGludmFsaWQgdHlwZScsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IGNvbnRlbnQgPSBbXG5cdFx0XHRcdCctLS0nLFxuXHRcdFx0XHQnZGVzY3JpcHRpb246IFwiVGVzdCB3aXRoIGludmFsaWQgbW9kZWwgdHlwZVwiJyxcblx0XHRcdFx0YG1vZGVsOiB7fWAsXG5cdFx0XHRcdCctLS0nLFxuXHRcdFx0XS5qb2luKCdcXG4nKTtcblx0XHRcdGNvbnN0IG1hcmtlcnMgPSBhd2FpdCB2YWxpZGF0ZShjb250ZW50LCBQcm9tcHRzVHlwZS5hZ2VudCk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobWFya2Vycy5sZW5ndGgsIDEpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1hcmtlcnNbMF0uc2V2ZXJpdHksIE1hcmtlclNldmVyaXR5LkVycm9yKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChtYXJrZXJzWzBdLm1lc3NhZ2UsIGBUaGUgJ21vZGVsJyBhdHRyaWJ1dGUgbXVzdCBiZSBhIHN0cmluZyBvciBhbiBhcnJheSBvZiBzdHJpbmdzLmApO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnZWFjaCB0b29sIG11c3QgYmUgc3RyaW5nJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgY29udGVudCA9IFtcblx0XHRcdFx0Jy0tLScsXG5cdFx0XHRcdCdkZXNjcmlwdGlvbjogXCJUZXN0XCInLFxuXHRcdFx0XHRgdG9vbHM6IFsndG9vbDEnLCB7fV1gLFxuXHRcdFx0XHQnLS0tJyxcblx0XHRcdF0uam9pbignXFxuJyk7XG5cdFx0XHRjb25zdCBtYXJrZXJzID0gYXdhaXQgdmFsaWRhdGUoY29udGVudCwgUHJvbXB0c1R5cGUuYWdlbnQpO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChcblx0XHRcdFx0bWFya2Vycy5tYXAobSA9PiAoeyBzZXZlcml0eTogbS5zZXZlcml0eSwgbWVzc2FnZTogbS5tZXNzYWdlIH0pKSxcblx0XHRcdFx0W1xuXHRcdFx0XHRcdHsgc2V2ZXJpdHk6IE1hcmtlclNldmVyaXR5LkVycm9yLCBtZXNzYWdlOiBgRWFjaCB0b29sIG5hbWUgaW4gdGhlICd0b29scycgYXR0cmlidXRlIG11c3QgYmUgYSBzdHJpbmcuYCB9LFxuXHRcdFx0XHRdXG5cdFx0XHQpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnb2xkIHRvb2wgcmVmZXJlbmNlJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgY29udGVudCA9IFtcblx0XHRcdFx0Jy0tLScsXG5cdFx0XHRcdCdkZXNjcmlwdGlvbjogXCJUZXN0XCInLFxuXHRcdFx0XHRgdG9vbHM6IFsndG9vbDEnLCAndG9vbDMnXWAsXG5cdFx0XHRcdCctLS0nLFxuXHRcdFx0XS5qb2luKCdcXG4nKTtcblx0XHRcdGNvbnN0IG1hcmtlcnMgPSBhd2FpdCB2YWxpZGF0ZShjb250ZW50LCBQcm9tcHRzVHlwZS5hZ2VudCk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKFxuXHRcdFx0XHRtYXJrZXJzLm1hcChtID0+ICh7IHNldmVyaXR5OiBtLnNldmVyaXR5LCBtZXNzYWdlOiBtLm1lc3NhZ2UgfSkpLFxuXHRcdFx0XHRbXG5cdFx0XHRcdFx0eyBzZXZlcml0eTogTWFya2VyU2V2ZXJpdHkuSW5mbywgbWVzc2FnZTogYFRvb2wgb3IgdG9vbHNldCAndG9vbDMnIGhhcyBiZWVuIHJlbmFtZWQsIHVzZSAnbXkuZXh0ZW5zaW9uL3Rvb2wzJyBpbnN0ZWFkLmAgfSxcblx0XHRcdFx0XVxuXHRcdFx0KTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2xlZ2FjeSB0b29sIHJlZmVyZW5jZSBuYW1lcycsIGFzeW5jICgpID0+IHtcblx0XHRcdC8vIFRlc3QgdXNpbmcgbGVnYWN5IHRvb2wgcmVmZXJlbmNlIG5hbWVcblx0XHRcdHtcblx0XHRcdFx0Y29uc3QgY29udGVudCA9IFtcblx0XHRcdFx0XHQnLS0tJyxcblx0XHRcdFx0XHQnZGVzY3JpcHRpb246IFwiVGVzdFwiJyxcblx0XHRcdFx0XHRgdG9vbHM6IFsndG9vbDEnLCAnb2xkVG9vbE5hbWUnXWAsXG5cdFx0XHRcdFx0Jy0tLScsXG5cdFx0XHRcdF0uam9pbignXFxuJyk7XG5cdFx0XHRcdGNvbnN0IG1hcmtlcnMgPSBhd2FpdCB2YWxpZGF0ZShjb250ZW50LCBQcm9tcHRzVHlwZS5hZ2VudCk7XG5cdFx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoXG5cdFx0XHRcdFx0bWFya2Vycy5tYXAobSA9PiAoeyBzZXZlcml0eTogbS5zZXZlcml0eSwgbWVzc2FnZTogbS5tZXNzYWdlIH0pKSxcblx0XHRcdFx0XHRbXG5cdFx0XHRcdFx0XHR7IHNldmVyaXR5OiBNYXJrZXJTZXZlcml0eS5JbmZvLCBtZXNzYWdlOiBgVG9vbCBvciB0b29sc2V0ICdvbGRUb29sTmFtZScgaGFzIGJlZW4gcmVuYW1lZCwgdXNlICduZXdUb29sUmVmJyBpbnN0ZWFkLmAgfSxcblx0XHRcdFx0XHRdXG5cdFx0XHRcdCk7XG5cdFx0XHR9XG5cblx0XHRcdC8vIFRlc3QgdXNpbmcgYW5vdGhlciBsZWdhY3kgdG9vbCByZWZlcmVuY2UgbmFtZVxuXHRcdFx0e1xuXHRcdFx0XHRjb25zdCBjb250ZW50ID0gW1xuXHRcdFx0XHRcdCctLS0nLFxuXHRcdFx0XHRcdCdkZXNjcmlwdGlvbjogXCJUZXN0XCInLFxuXHRcdFx0XHRcdGB0b29sczogWyd0b29sMScsICdkZXByZWNhdGVkVG9vbE5hbWUnXWAsXG5cdFx0XHRcdFx0Jy0tLScsXG5cdFx0XHRcdF0uam9pbignXFxuJyk7XG5cdFx0XHRcdGNvbnN0IG1hcmtlcnMgPSBhd2FpdCB2YWxpZGF0ZShjb250ZW50LCBQcm9tcHRzVHlwZS5hZ2VudCk7XG5cdFx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoXG5cdFx0XHRcdFx0bWFya2Vycy5tYXAobSA9PiAoeyBzZXZlcml0eTogbS5zZXZlcml0eSwgbWVzc2FnZTogbS5tZXNzYWdlIH0pKSxcblx0XHRcdFx0XHRbXG5cdFx0XHRcdFx0XHR7IHNldmVyaXR5OiBNYXJrZXJTZXZlcml0eS5JbmZvLCBtZXNzYWdlOiBgVG9vbCBvciB0b29sc2V0ICdkZXByZWNhdGVkVG9vbE5hbWUnIGhhcyBiZWVuIHJlbmFtZWQsIHVzZSAnbmV3VG9vbFJlZicgaW5zdGVhZC5gIH0sXG5cdFx0XHRcdFx0XVxuXHRcdFx0XHQpO1xuXHRcdFx0fVxuXHRcdH0pO1xuXG5cdFx0dGVzdCgnbGVnYWN5IHRvb2xzZXQgbmFtZXMnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHQvLyBUZXN0IHVzaW5nIGxlZ2FjeSB0b29sc2V0IG5hbWVcblx0XHRcdHtcblx0XHRcdFx0Y29uc3QgY29udGVudCA9IFtcblx0XHRcdFx0XHQnLS0tJyxcblx0XHRcdFx0XHQnZGVzY3JpcHRpb246IFwiVGVzdFwiJyxcblx0XHRcdFx0XHRgdG9vbHM6IFsndG9vbDEnLCAnb2xkVG9vbFNldCddYCxcblx0XHRcdFx0XHQnLS0tJyxcblx0XHRcdFx0XS5qb2luKCdcXG4nKTtcblx0XHRcdFx0Y29uc3QgbWFya2VycyA9IGF3YWl0IHZhbGlkYXRlKGNvbnRlbnQsIFByb21wdHNUeXBlLmFnZW50KTtcblx0XHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChcblx0XHRcdFx0XHRtYXJrZXJzLm1hcChtID0+ICh7IHNldmVyaXR5OiBtLnNldmVyaXR5LCBtZXNzYWdlOiBtLm1lc3NhZ2UgfSkpLFxuXHRcdFx0XHRcdFtcblx0XHRcdFx0XHRcdHsgc2V2ZXJpdHk6IE1hcmtlclNldmVyaXR5LkluZm8sIG1lc3NhZ2U6IGBUb29sIG9yIHRvb2xzZXQgJ29sZFRvb2xTZXQnIGhhcyBiZWVuIHJlbmFtZWQsIHVzZSAnbmV3VG9vbFNldFJlZicgaW5zdGVhZC5gIH0sXG5cdFx0XHRcdFx0XVxuXHRcdFx0XHQpO1xuXHRcdFx0fVxuXG5cdFx0XHQvLyBUZXN0IHVzaW5nIGFub3RoZXIgbGVnYWN5IHRvb2xzZXQgbmFtZVxuXHRcdFx0e1xuXHRcdFx0XHRjb25zdCBjb250ZW50ID0gW1xuXHRcdFx0XHRcdCctLS0nLFxuXHRcdFx0XHRcdCdkZXNjcmlwdGlvbjogXCJUZXN0XCInLFxuXHRcdFx0XHRcdGB0b29sczogWyd0b29sMScsICdkZXByZWNhdGVkVG9vbFNldCddYCxcblx0XHRcdFx0XHQnLS0tJyxcblx0XHRcdFx0XS5qb2luKCdcXG4nKTtcblx0XHRcdFx0Y29uc3QgbWFya2VycyA9IGF3YWl0IHZhbGlkYXRlKGNvbnRlbnQsIFByb21wdHNUeXBlLmFnZW50KTtcblx0XHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChcblx0XHRcdFx0XHRtYXJrZXJzLm1hcChtID0+ICh7IHNldmVyaXR5OiBtLnNldmVyaXR5LCBtZXNzYWdlOiBtLm1lc3NhZ2UgfSkpLFxuXHRcdFx0XHRcdFtcblx0XHRcdFx0XHRcdHsgc2V2ZXJpdHk6IE1hcmtlclNldmVyaXR5LkluZm8sIG1lc3NhZ2U6IGBUb29sIG9yIHRvb2xzZXQgJ2RlcHJlY2F0ZWRUb29sU2V0JyBoYXMgYmVlbiByZW5hbWVkLCB1c2UgJ25ld1Rvb2xTZXRSZWYnIGluc3RlYWQuYCB9LFxuXHRcdFx0XHRcdF1cblx0XHRcdFx0KTtcblx0XHRcdH1cblx0XHR9KTtcblxuXHRcdHRlc3QoJ211bHRpcGxlIGxlZ2FjeSBuYW1lcyBpbiBzYW1lIHRvb2xzIGxpc3QnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHQvLyBUZXN0IG11bHRpcGxlIGxlZ2FjeSBuYW1lcyB0b2dldGhlclxuXHRcdFx0Y29uc3QgY29udGVudCA9IFtcblx0XHRcdFx0Jy0tLScsXG5cdFx0XHRcdCdkZXNjcmlwdGlvbjogXCJUZXN0XCInLFxuXHRcdFx0XHRgdG9vbHM6IFsnbGVnYWN5VG9vbCcsICdsZWdhY3lUb29sU2V0JywgJ3Rvb2wzJ11gLFxuXHRcdFx0XHQnLS0tJyxcblx0XHRcdF0uam9pbignXFxuJyk7XG5cdFx0XHRjb25zdCBtYXJrZXJzID0gYXdhaXQgdmFsaWRhdGUoY29udGVudCwgUHJvbXB0c1R5cGUuYWdlbnQpO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChcblx0XHRcdFx0bWFya2Vycy5tYXAobSA9PiAoeyBzZXZlcml0eTogbS5zZXZlcml0eSwgbWVzc2FnZTogbS5tZXNzYWdlIH0pKSxcblx0XHRcdFx0W1xuXHRcdFx0XHRcdHsgc2V2ZXJpdHk6IE1hcmtlclNldmVyaXR5LkluZm8sIG1lc3NhZ2U6IGBUb29sIG9yIHRvb2xzZXQgJ2xlZ2FjeVRvb2wnIGhhcyBiZWVuIHJlbmFtZWQsIHVzZSAnYW5vdGhlclRvb2xSZWYnIGluc3RlYWQuYCB9LFxuXHRcdFx0XHRcdHsgc2V2ZXJpdHk6IE1hcmtlclNldmVyaXR5LkluZm8sIG1lc3NhZ2U6IGBUb29sIG9yIHRvb2xzZXQgJ2xlZ2FjeVRvb2xTZXQnIGhhcyBiZWVuIHJlbmFtZWQsIHVzZSAnYW5vdGhlclRvb2xTZXRSZWYnIGluc3RlYWQuYCB9LFxuXHRcdFx0XHRcdHsgc2V2ZXJpdHk6IE1hcmtlclNldmVyaXR5LkluZm8sIG1lc3NhZ2U6IGBUb29sIG9yIHRvb2xzZXQgJ3Rvb2wzJyBoYXMgYmVlbiByZW5hbWVkLCB1c2UgJ215LmV4dGVuc2lvbi90b29sMycgaW5zdGVhZC5gIH0sXG5cdFx0XHRcdF1cblx0XHRcdCk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdkZXByZWNhdGVkIHRvb2wgbmFtZSBtYXBwaW5nIHRvIG11bHRpcGxlIG5ldyBuYW1lcycsIGFzeW5jICgpID0+IHtcblx0XHRcdC8vIFRoZSB0b29sc2V0cyBhcmUgcmVnaXN0ZXJlZCBpbiBzZXR1cCB3aXRoIGEgc2hhcmVkIGxlZ2FjeSBuYW1lICdzaGFyZWRMZWdhY3lOYW1lJ1xuXHRcdFx0Ly8gVGhpcyBzaW11bGF0ZXMgdGhlIGNhc2Ugd2hlcmUgb25lIGRlcHJlY2F0ZWQgbmFtZSBtYXBzIHRvIG11bHRpcGxlIGN1cnJlbnQgbmFtZXNcblx0XHRcdGNvbnN0IGNvbnRlbnQgPSBbXG5cdFx0XHRcdCctLS0nLFxuXHRcdFx0XHQnZGVzY3JpcHRpb246IFwiVGVzdFwiJyxcblx0XHRcdFx0YHRvb2xzOiBbJ3NoYXJlZExlZ2FjeU5hbWUnXWAsXG5cdFx0XHRcdCctLS0nLFxuXHRcdFx0XS5qb2luKCdcXG4nKTtcblx0XHRcdGNvbnN0IG1hcmtlcnMgPSBhd2FpdCB2YWxpZGF0ZShjb250ZW50LCBQcm9tcHRzVHlwZS5hZ2VudCk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobWFya2Vycy5sZW5ndGgsIDEpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1hcmtlcnNbMF0uc2V2ZXJpdHksIE1hcmtlclNldmVyaXR5LkluZm8pO1xuXHRcdFx0Ly8gV2hlbiBtdWx0aXBsZSB0b29sc2V0cyBzaGFyZSB0aGUgc2FtZSBsZWdhY3kgbmFtZSwgdGhlIG1lc3NhZ2Ugc2hvdWxkIGluZGljYXRlIG11bHRpcGxlIG9wdGlvbnNcblx0XHRcdC8vIFRoZSBtZXNzYWdlIHdpbGwgc2F5IFwidXNlIHRoZSBmb2xsb3dpbmcgdG9vbHMgaW5zdGVhZDpcIiBmb3IgbXVsdGlwbGUgbWFwcGluZ3Ncblx0XHRcdGNvbnN0IGV4cGVjdGVkTWVzc2FnZSA9IGBUb29sIG9yIHRvb2xzZXQgJ3NoYXJlZExlZ2FjeU5hbWUnIGhhcyBiZWVuIHJlbmFtZWQsIHVzZSB0aGUgZm9sbG93aW5nIHRvb2xzIGluc3RlYWQ6IGNvbmZsaWN0U2V0MVJlZiwgY29uZmxpY3RTZXQyUmVmYDtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChtYXJrZXJzWzBdLm1lc3NhZ2UsIGV4cGVjdGVkTWVzc2FnZSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdkZXByZWNhdGVkIHRvb2wgbmFtZSBpbiBib2R5IHZhcmlhYmxlIHJlZmVyZW5jZSAtIHNpbmdsZSBtYXBwaW5nJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Ly8gVGVzdCBkZXByZWNhdGVkIHRvb2wgbmFtZSB1c2VkIGFzIHZhcmlhYmxlIHJlZmVyZW5jZSBpbiBib2R5XG5cdFx0XHRjb25zdCBjb250ZW50ID0gW1xuXHRcdFx0XHQnLS0tJyxcblx0XHRcdFx0J2Rlc2NyaXB0aW9uOiBcIlRlc3RcIicsXG5cdFx0XHRcdCctLS0nLFxuXHRcdFx0XHQnQm9keSB3aXRoICN0b29sOm9sZFRvb2xOYW1lIHJlZmVyZW5jZScsXG5cdFx0XHRdLmpvaW4oJ1xcbicpO1xuXHRcdFx0Y29uc3QgbWFya2VycyA9IGF3YWl0IHZhbGlkYXRlKGNvbnRlbnQsIFByb21wdHNUeXBlLmFnZW50KTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChtYXJrZXJzLmxlbmd0aCwgMSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobWFya2Vyc1swXS5zZXZlcml0eSwgTWFya2VyU2V2ZXJpdHkuSW5mbyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobWFya2Vyc1swXS5tZXNzYWdlLCBgVG9vbCBvciB0b29sc2V0ICdvbGRUb29sTmFtZScgaGFzIGJlZW4gcmVuYW1lZCwgdXNlICduZXdUb29sUmVmJyBpbnN0ZWFkLmApO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnZGVwcmVjYXRlZCB0b29sIG5hbWUgaW4gYm9keSB2YXJpYWJsZSByZWZlcmVuY2UgLSBtdWx0aXBsZSBtYXBwaW5ncycsIGFzeW5jICgpID0+IHtcblx0XHRcdC8vIFJlZ2lzdGVyIHRvb2xzIHdpdGggdGhlIHNhbWUgbGVnYWN5IG5hbWUgdG8gY3JlYXRlIG11bHRpcGxlIG1hcHBpbmdzXG5cdFx0XHRjb25zdCBtdWx0aU1hcFRvb2xTZXQxID0gZGlzcG9zYWJsZXMuYWRkKGluc3RhU2VydmljZS5nZXQoSUxhbmd1YWdlTW9kZWxUb29sc1NlcnZpY2UpLmNyZWF0ZVRvb2xTZXQoXG5cdFx0XHRcdFRvb2xEYXRhU291cmNlLkV4dGVybmFsLFxuXHRcdFx0XHQnbXVsdGlNYXBTZXQxJyxcblx0XHRcdFx0J211bHRpTWFwU2V0MVJlZicsXG5cdFx0XHRcdHsgbGVnYWN5RnVsbE5hbWVzOiBbJ211bHRpTWFwTGVnYWN5J10gfVxuXHRcdFx0KSk7XG5cdFx0XHRjb25zdCBtdWx0aU1hcFRvb2wxID0geyBpZDogJ211bHRpTWFwVG9vbDEnLCB0b29sUmVmZXJlbmNlTmFtZTogJ211bHRpTWFwVG9vbDFSZWYnLCBkaXNwbGF5TmFtZTogJ011bHRpIE1hcCBUb29sIDEnLCBjYW5CZVJlZmVyZW5jZWRJblByb21wdDogdHJ1ZSwgbW9kZWxEZXNjcmlwdGlvbjogJ011bHRpIE1hcCBUb29sIDEnLCBzb3VyY2U6IFRvb2xEYXRhU291cmNlLkV4dGVybmFsLCBpbnB1dFNjaGVtYToge30gfSBzYXRpc2ZpZXMgSVRvb2xEYXRhO1xuXHRcdFx0ZGlzcG9zYWJsZXMuYWRkKGluc3RhU2VydmljZS5nZXQoSUxhbmd1YWdlTW9kZWxUb29sc1NlcnZpY2UpLnJlZ2lzdGVyVG9vbERhdGEobXVsdGlNYXBUb29sMSkpO1xuXHRcdFx0ZGlzcG9zYWJsZXMuYWRkKG11bHRpTWFwVG9vbFNldDEuYWRkVG9vbChtdWx0aU1hcFRvb2wxKSk7XG5cblx0XHRcdGNvbnN0IG11bHRpTWFwVG9vbFNldDIgPSBkaXNwb3NhYmxlcy5hZGQoaW5zdGFTZXJ2aWNlLmdldChJTGFuZ3VhZ2VNb2RlbFRvb2xzU2VydmljZSkuY3JlYXRlVG9vbFNldChcblx0XHRcdFx0VG9vbERhdGFTb3VyY2UuRXh0ZXJuYWwsXG5cdFx0XHRcdCdtdWx0aU1hcFNldDInLFxuXHRcdFx0XHQnbXVsdGlNYXBTZXQyUmVmJyxcblx0XHRcdFx0eyBsZWdhY3lGdWxsTmFtZXM6IFsnbXVsdGlNYXBMZWdhY3knXSB9XG5cdFx0XHQpKTtcblx0XHRcdGNvbnN0IG11bHRpTWFwVG9vbDIgPSB7IGlkOiAnbXVsdGlNYXBUb29sMicsIHRvb2xSZWZlcmVuY2VOYW1lOiAnbXVsdGlNYXBUb29sMlJlZicsIGRpc3BsYXlOYW1lOiAnTXVsdGkgTWFwIFRvb2wgMicsIGNhbkJlUmVmZXJlbmNlZEluUHJvbXB0OiB0cnVlLCBtb2RlbERlc2NyaXB0aW9uOiAnTXVsdGkgTWFwIFRvb2wgMicsIHNvdXJjZTogVG9vbERhdGFTb3VyY2UuRXh0ZXJuYWwsIGlucHV0U2NoZW1hOiB7fSB9IHNhdGlzZmllcyBJVG9vbERhdGE7XG5cdFx0XHRkaXNwb3NhYmxlcy5hZGQoaW5zdGFTZXJ2aWNlLmdldChJTGFuZ3VhZ2VNb2RlbFRvb2xzU2VydmljZSkucmVnaXN0ZXJUb29sRGF0YShtdWx0aU1hcFRvb2wyKSk7XG5cdFx0XHRkaXNwb3NhYmxlcy5hZGQobXVsdGlNYXBUb29sU2V0Mi5hZGRUb29sKG11bHRpTWFwVG9vbDIpKTtcblxuXHRcdFx0Y29uc3QgY29udGVudCA9IFtcblx0XHRcdFx0Jy0tLScsXG5cdFx0XHRcdCdkZXNjcmlwdGlvbjogXCJUZXN0XCInLFxuXHRcdFx0XHQnLS0tJyxcblx0XHRcdFx0J0JvZHkgd2l0aCAjdG9vbDptdWx0aU1hcExlZ2FjeSByZWZlcmVuY2UnLFxuXHRcdFx0XS5qb2luKCdcXG4nKTtcblx0XHRcdGNvbnN0IG1hcmtlcnMgPSBhd2FpdCB2YWxpZGF0ZShjb250ZW50LCBQcm9tcHRzVHlwZS5hZ2VudCk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobWFya2Vycy5sZW5ndGgsIDEpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1hcmtlcnNbMF0uc2V2ZXJpdHksIE1hcmtlclNldmVyaXR5LkluZm8pO1xuXHRcdFx0Ly8gV2hlbiBtdWx0aXBsZSB0b29sc2V0cyBzaGFyZSB0aGUgc2FtZSBsZWdhY3kgbmFtZSwgdGhlIG1lc3NhZ2Ugc2hvdWxkIGluZGljYXRlIG11bHRpcGxlIG9wdGlvbnNcblx0XHRcdC8vIFRoZSBtZXNzYWdlIHdpbGwgc2F5IFwidXNlIHRoZSBmb2xsb3dpbmcgdG9vbHMgaW5zdGVhZDpcIiBmb3IgbXVsdGlwbGUgbWFwcGluZ3MgaW4gYm9keSByZWZlcmVuY2VzXG5cdFx0XHRjb25zdCBleHBlY3RlZE1lc3NhZ2UgPSBgVG9vbCBvciB0b29sc2V0ICdtdWx0aU1hcExlZ2FjeScgaGFzIGJlZW4gcmVuYW1lZCwgdXNlIHRoZSBmb2xsb3dpbmcgdG9vbHMgaW5zdGVhZDogbXVsdGlNYXBTZXQxUmVmLCBtdWx0aU1hcFNldDJSZWZgO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1hcmtlcnNbMF0ubWVzc2FnZSwgZXhwZWN0ZWRNZXNzYWdlKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ25hbWVzcGFjZWQgZGVwcmVjYXRlZCB0b29sIG5hbWUgaW4gdG9vbHMgaGVhZGVyIHNob3dzIHJlbmFtZSBoaW50JywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Ly8gV2hlbiBhIHRvb2wgaXMgaW4gYSB0b29sc2V0IChlLmcuIHZzY29kZS9vcGVuSW50ZWdyYXRlZEJyb3dzZXIpIGFuZCBoYXMgYSBsZWdhY3kgbmFtZSxcblx0XHRcdC8vIHVzaW5nIHRoZSBuYW1lc3BhY2VkIG9sZCBuYW1lICh2c2NvZGUvb3BlblNpbXBsZUJyb3dzZXIpIHNob3VsZCBzaG93IHRoZSByZW5hbWUgaGludFxuXHRcdFx0Y29uc3QgY29udGVudCA9IFtcblx0XHRcdFx0Jy0tLScsXG5cdFx0XHRcdCdkZXNjcmlwdGlvbjogXCJUZXN0XCInLFxuXHRcdFx0XHRgdG9vbHM6IFsndnNjb2RlL29wZW5TaW1wbGVCcm93c2VyJ11gLFxuXHRcdFx0XHQnLS0tJyxcblx0XHRcdF0uam9pbignXFxuJyk7XG5cdFx0XHRjb25zdCBtYXJrZXJzID0gYXdhaXQgdmFsaWRhdGUoY29udGVudCwgUHJvbXB0c1R5cGUuYWdlbnQpO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChcblx0XHRcdFx0bWFya2Vycy5tYXAobSA9PiAoeyBzZXZlcml0eTogbS5zZXZlcml0eSwgbWVzc2FnZTogbS5tZXNzYWdlIH0pKSxcblx0XHRcdFx0W1xuXHRcdFx0XHRcdHsgc2V2ZXJpdHk6IE1hcmtlclNldmVyaXR5LkluZm8sIG1lc3NhZ2U6IGBUb29sIG9yIHRvb2xzZXQgJ3ZzY29kZS9vcGVuU2ltcGxlQnJvd3NlcicgaGFzIGJlZW4gcmVuYW1lZCwgdXNlICd2c2NvZGUvb3BlbkludGVncmF0ZWRCcm93c2VyJyBpbnN0ZWFkLmAgfSxcblx0XHRcdFx0XVxuXHRcdFx0KTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2JhcmUgZGVwcmVjYXRlZCB0b29sIG5hbWUgaW4gdG9vbHMgaGVhZGVyIGFsc28gc2hvd3MgcmVuYW1lIGhpbnQnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHQvLyBUaGUgYmFyZSAobm9uLW5hbWVzcGFjZWQpIGxlZ2FjeSBuYW1lIHNob3VsZCBhbHNvIHJlc29sdmVcblx0XHRcdGNvbnN0IGNvbnRlbnQgPSBbXG5cdFx0XHRcdCctLS0nLFxuXHRcdFx0XHQnZGVzY3JpcHRpb246IFwiVGVzdFwiJyxcblx0XHRcdFx0YHRvb2xzOiBbJ29wZW5TaW1wbGVCcm93c2VyJ11gLFxuXHRcdFx0XHQnLS0tJyxcblx0XHRcdF0uam9pbignXFxuJyk7XG5cdFx0XHRjb25zdCBtYXJrZXJzID0gYXdhaXQgdmFsaWRhdGUoY29udGVudCwgUHJvbXB0c1R5cGUuYWdlbnQpO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChcblx0XHRcdFx0bWFya2Vycy5tYXAobSA9PiAoeyBzZXZlcml0eTogbS5zZXZlcml0eSwgbWVzc2FnZTogbS5tZXNzYWdlIH0pKSxcblx0XHRcdFx0W1xuXHRcdFx0XHRcdHsgc2V2ZXJpdHk6IE1hcmtlclNldmVyaXR5LkluZm8sIG1lc3NhZ2U6IGBUb29sIG9yIHRvb2xzZXQgJ29wZW5TaW1wbGVCcm93c2VyJyBoYXMgYmVlbiByZW5hbWVkLCB1c2UgJ3ZzY29kZS9vcGVuSW50ZWdyYXRlZEJyb3dzZXInIGluc3RlYWQuYCB9LFxuXHRcdFx0XHRdXG5cdFx0XHQpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgndW5rbm93biBhdHRyaWJ1dGUgaW4gYWdlbnQgZmlsZScsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IGNvbnRlbnQgPSBbXG5cdFx0XHRcdCctLS0nLFxuXHRcdFx0XHQnZGVzY3JpcHRpb246IFwiVGVzdFwiJyxcblx0XHRcdFx0YGFwcGx5VG86ICcqLnRzJ2AsIC8vIG5vdCBhbGxvd2VkIGluIGFnZW50IGZpbGVcblx0XHRcdFx0Jy0tLScsXG5cdFx0XHRdLmpvaW4oJ1xcbicpO1xuXHRcdFx0Y29uc3QgbWFya2VycyA9IGF3YWl0IHZhbGlkYXRlKGNvbnRlbnQsIFByb21wdHNUeXBlLmFnZW50KTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoXG5cdFx0XHRcdG1hcmtlcnMubWFwKG0gPT4gKHsgc2V2ZXJpdHk6IG0uc2V2ZXJpdHksIG1lc3NhZ2U6IG0ubWVzc2FnZSwgdGFnczogbS50YWdzIH0pKSxcblx0XHRcdFx0W1xuXHRcdFx0XHRcdHsgc2V2ZXJpdHk6IE1hcmtlclNldmVyaXR5LkhpbnQsIG1lc3NhZ2U6IGBBdHRyaWJ1dGUgJ2FwcGx5VG8nIGlzIG5vdCBzdXBwb3J0ZWQgaW4gVlMgQ29kZSBhZ2VudCBmaWxlcy4gU3VwcG9ydGVkOiBhZ2VudHMsIGFyZ3VtZW50LWhpbnQsIGRlc2NyaXB0aW9uLCBkaXNhYmxlLW1vZGVsLWludm9jYXRpb24sIGdpdGh1YiwgaGFuZG9mZnMsIGhvb2tzLCBtb2RlbCwgbmFtZSwgdGFyZ2V0LCB0b29scywgdXNlci1pbnZvY2FibGUuYCwgdGFnczogW01hcmtlclRhZy5Vbm5lY2Vzc2FyeV0gfSxcblx0XHRcdFx0XVxuXHRcdFx0KTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3Rvb2xzIHdpdGggaW52YWxpZCBoYW5kb2ZmcycsIGFzeW5jICgpID0+IHtcblx0XHRcdHtcblx0XHRcdFx0Y29uc3QgY29udGVudCA9IFtcblx0XHRcdFx0XHQnLS0tJyxcblx0XHRcdFx0XHQnZGVzY3JpcHRpb246IFwiVGVzdFwiJyxcblx0XHRcdFx0XHRgaGFuZG9mZnM6IG5leHRgLFxuXHRcdFx0XHRcdCctLS0nLFxuXHRcdFx0XHRdLmpvaW4oJ1xcbicpO1xuXHRcdFx0XHRjb25zdCBtYXJrZXJzID0gYXdhaXQgdmFsaWRhdGUoY29udGVudCwgUHJvbXB0c1R5cGUuYWdlbnQpO1xuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobWFya2Vycy5sZW5ndGgsIDEpO1xuXHRcdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKG1hcmtlcnMubWFwKG0gPT4gbS5tZXNzYWdlKSwgW2BUaGUgJ2hhbmRvZmZzJyBhdHRyaWJ1dGUgbXVzdCBiZSBhbiBhcnJheS5gXSk7XG5cdFx0XHR9XG5cdFx0XHR7XG5cdFx0XHRcdGNvbnN0IGNvbnRlbnQgPSBbXG5cdFx0XHRcdFx0Jy0tLScsXG5cdFx0XHRcdFx0J2Rlc2NyaXB0aW9uOiBcIlRlc3RcIicsXG5cdFx0XHRcdFx0YGhhbmRvZmZzOmAsXG5cdFx0XHRcdFx0YCAgLSBsYWJlbDogJzEyMydgLFxuXHRcdFx0XHRcdCctLS0nLFxuXHRcdFx0XHRdLmpvaW4oJ1xcbicpO1xuXHRcdFx0XHRjb25zdCBtYXJrZXJzID0gYXdhaXQgdmFsaWRhdGUoY29udGVudCwgUHJvbXB0c1R5cGUuYWdlbnQpO1xuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobWFya2Vycy5sZW5ndGgsIDEpO1xuXHRcdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKG1hcmtlcnMubWFwKG0gPT4gbS5tZXNzYWdlKSwgW2BNaXNzaW5nIHJlcXVpcmVkIHByb3BlcnRpZXMgJ2FnZW50JywgJ3Byb21wdCcgaW4gaGFuZG9mZiBvYmplY3QuYF0pO1xuXHRcdFx0fVxuXHRcdFx0e1xuXHRcdFx0XHRjb25zdCBjb250ZW50ID0gW1xuXHRcdFx0XHRcdCctLS0nLFxuXHRcdFx0XHRcdCdkZXNjcmlwdGlvbjogXCJUZXN0XCInLFxuXHRcdFx0XHRcdGBoYW5kb2ZmczpgLFxuXHRcdFx0XHRcdGAgIC0gbGFiZWw6ICcxMjMnYCxcblx0XHRcdFx0XHRgICAgIGFnZW50OiAnJ2AsXG5cdFx0XHRcdFx0YCAgICBwcm9tcHQ6ICcnYCxcblx0XHRcdFx0XHRgICAgIHNlbmQ6IHRydWVgLFxuXHRcdFx0XHRcdCctLS0nLFxuXHRcdFx0XHRdLmpvaW4oJ1xcbicpO1xuXHRcdFx0XHRjb25zdCBtYXJrZXJzID0gYXdhaXQgdmFsaWRhdGUoY29udGVudCwgUHJvbXB0c1R5cGUuYWdlbnQpO1xuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobWFya2Vycy5sZW5ndGgsIDEpO1xuXHRcdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKG1hcmtlcnMubWFwKG0gPT4gbS5tZXNzYWdlKSwgW2BUaGUgJ2FnZW50JyBwcm9wZXJ0eSBpbiBhIGhhbmRvZmYgbXVzdCBiZSBhIG5vbi1lbXB0eSBzdHJpbmcuYF0pO1xuXHRcdFx0fVxuXHRcdFx0e1xuXHRcdFx0XHRjb25zdCBjb250ZW50ID0gW1xuXHRcdFx0XHRcdCctLS0nLFxuXHRcdFx0XHRcdCdkZXNjcmlwdGlvbjogXCJUZXN0XCInLFxuXHRcdFx0XHRcdGBoYW5kb2ZmczpgLFxuXHRcdFx0XHRcdGAgIC0gbGFiZWw6ICcxMjMnYCxcblx0XHRcdFx0XHRgICAgIGFnZW50OiAnQ29vbCdgLFxuXHRcdFx0XHRcdGAgICAgcHJvbXB0OiAnJ2AsXG5cdFx0XHRcdFx0YCAgICBzZW5kOiB0cnVlYCxcblx0XHRcdFx0XHQnLS0tJyxcblx0XHRcdFx0XS5qb2luKCdcXG4nKTtcblx0XHRcdFx0Y29uc3QgbWFya2VycyA9IGF3YWl0IHZhbGlkYXRlKGNvbnRlbnQsIFByb21wdHNUeXBlLmFnZW50KTtcblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1hcmtlcnMubGVuZ3RoLCAxKTtcblx0XHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChtYXJrZXJzLm1hcChtID0+IG0ubWVzc2FnZSksIFtgVW5rbm93biBhZ2VudCAnQ29vbCcuIEF2YWlsYWJsZSBhZ2VudHM6IGFnZW50LCBhc2ssIGVkaXQsIEJlYXN0TW9kZS5gXSk7XG5cdFx0XHR9XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdhZ2VudCB3aXRoIGhhbmRvZmZzIGF0dHJpYnV0ZScsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IGNvbnRlbnQgPSBbXG5cdFx0XHRcdCctLS0nLFxuXHRcdFx0XHQnZGVzY3JpcHRpb246IFxcXCJUZXN0IGFnZW50IHdpdGggaGFuZG9mZnNcXFwiJyxcblx0XHRcdFx0YGhhbmRvZmZzOmAsXG5cdFx0XHRcdCcgIC0gbGFiZWw6IFRlc3QgUHJvbXB0Jyxcblx0XHRcdFx0JyAgICBhZ2VudDogYWdlbnQnLFxuXHRcdFx0XHQnICAgIHByb21wdDogQWRkIHRlc3RzIGZvciB0aGlzIGNvZGUnLFxuXHRcdFx0XHQnICAtIGxhYmVsOiBPcHRpbWl6ZSBQZXJmb3JtYW5jZScsXG5cdFx0XHRcdCcgICAgYWdlbnQ6IGFnZW50Jyxcblx0XHRcdFx0JyAgICBwcm9tcHQ6IE9wdGltaXplIGZvciBwZXJmb3JtYW5jZScsXG5cdFx0XHRcdCctLS0nLFxuXHRcdFx0XHQnQm9keScsXG5cdFx0XHRdLmpvaW4oJ1xcbicpO1xuXHRcdFx0Y29uc3QgbWFya2VycyA9IGF3YWl0IHZhbGlkYXRlKGNvbnRlbnQsIFByb21wdHNUeXBlLmFnZW50KTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwobWFya2VycywgW10sICdFeHBlY3RlZCBubyB2YWxpZGF0aW9uIGlzc3VlcyBmb3IgaGFuZG9mZnMgYXR0cmlidXRlJyk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdkdXBsaWNhdGUgaGFuZG9mZiBsYWJlbHMgYXJlIHJlcG9ydGVkJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgY29udGVudCA9IFtcblx0XHRcdFx0Jy0tLScsXG5cdFx0XHRcdCdkZXNjcmlwdGlvbjogXCJUZXN0XCInLFxuXHRcdFx0XHRgaGFuZG9mZnM6YCxcblx0XHRcdFx0JyAgLSBsYWJlbDogU3RhcnQgSW1wbGVtZW50YXRpb24nLFxuXHRcdFx0XHQnICAgIGFnZW50OiBhZ2VudCcsXG5cdFx0XHRcdCcgICAgcHJvbXB0OiBHbyBpbXBsZW1lbnQnLFxuXHRcdFx0XHQnICAtIGxhYmVsOiBTdGFydCBJbXBsZW1lbnRhdGlvbicsXG5cdFx0XHRcdCcgICAgYWdlbnQ6IGFnZW50Jyxcblx0XHRcdFx0JyAgICBwcm9tcHQ6IEdvIGltcGxlbWVudCBhZ2FpbicsXG5cdFx0XHRcdCctLS0nLFxuXHRcdFx0XS5qb2luKCdcXG4nKTtcblx0XHRcdGNvbnN0IG1hcmtlcnMgPSBhd2FpdCB2YWxpZGF0ZShjb250ZW50LCBQcm9tcHRzVHlwZS5hZ2VudCk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKG1hcmtlcnMubWFwKG0gPT4gbS5tZXNzYWdlKSwgW1xuXHRcdFx0XHQnRHVwbGljYXRlIGhhbmRvZmYgbGFiZWwgXFwnU3RhcnQgSW1wbGVtZW50YXRpb25cXCcuIEVhY2ggaGFuZG9mZiBtdXN0IGhhdmUgYSB1bmlxdWUgbGFiZWwuJyxcblx0XHRcdF0pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnZHVwbGljYXRlIGhhbmRvZmYgbGFiZWxzIGFyZSBjYXNlLWluc2Vuc2l0aXZlJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgY29udGVudCA9IFtcblx0XHRcdFx0Jy0tLScsXG5cdFx0XHRcdCdkZXNjcmlwdGlvbjogXCJUZXN0XCInLFxuXHRcdFx0XHRgaGFuZG9mZnM6YCxcblx0XHRcdFx0JyAgLSBsYWJlbDogU3RhcnQgSW1wbGVtZW50YXRpb24nLFxuXHRcdFx0XHQnICAgIGFnZW50OiBhZ2VudCcsXG5cdFx0XHRcdCcgICAgcHJvbXB0OiBHbyBpbXBsZW1lbnQnLFxuXHRcdFx0XHQnICAtIGxhYmVsOiBzdGFydCBpbXBsZW1lbnRhdGlvbicsXG5cdFx0XHRcdCcgICAgYWdlbnQ6IGVkaXQnLFxuXHRcdFx0XHQnICAgIHByb21wdDogRGlmZmVyZW50IHByb21wdCcsXG5cdFx0XHRcdCctLS0nLFxuXHRcdFx0XS5qb2luKCdcXG4nKTtcblx0XHRcdGNvbnN0IG1hcmtlcnMgPSBhd2FpdCB2YWxpZGF0ZShjb250ZW50LCBQcm9tcHRzVHlwZS5hZ2VudCk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKG1hcmtlcnMubWFwKG0gPT4gbS5tZXNzYWdlKSwgW1xuXHRcdFx0XHQnRHVwbGljYXRlIGhhbmRvZmYgbGFiZWwgXFwnc3RhcnQgaW1wbGVtZW50YXRpb25cXCcuIEVhY2ggaGFuZG9mZiBtdXN0IGhhdmUgYSB1bmlxdWUgbGFiZWwuJyxcblx0XHRcdF0pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnaGFuZG9mZiBsYWJlbCBtdXN0IGNvbnRhaW4gYWxwaGFudW1lcmljIGNoYXJhY3RlcicsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IGNvbnRlbnQgPSBbXG5cdFx0XHRcdCctLS0nLFxuXHRcdFx0XHQnZGVzY3JpcHRpb246IFwiVGVzdFwiJyxcblx0XHRcdFx0YGhhbmRvZmZzOmAsXG5cdFx0XHRcdCcgIC0gbGFiZWw6IFwiISEhXCInLFxuXHRcdFx0XHQnICAgIGFnZW50OiBhZ2VudCcsXG5cdFx0XHRcdCcgICAgcHJvbXB0OiBHbycsXG5cdFx0XHRcdCctLS0nLFxuXHRcdFx0XS5qb2luKCdcXG4nKTtcblx0XHRcdGNvbnN0IG1hcmtlcnMgPSBhd2FpdCB2YWxpZGF0ZShjb250ZW50LCBQcm9tcHRzVHlwZS5hZ2VudCk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKG1hcmtlcnMubWFwKG0gPT4gbS5tZXNzYWdlKSwgW1xuXHRcdFx0XHQnVGhlIFxcJ2xhYmVsXFwnIHByb3BlcnR5IGluIGEgaGFuZG9mZiBtdXN0IGNvbnRhaW4gYXQgbGVhc3Qgb25lIGFscGhhbnVtZXJpYyBjaGFyYWN0ZXIuJyxcblx0XHRcdF0pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnZ2l0aHViLWNvcGlsb3QgYWdlbnQgd2l0aCBzdXBwb3J0ZWQgYXR0cmlidXRlcycsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IGNvbnRlbnQgPSBbXG5cdFx0XHRcdCctLS0nLFxuXHRcdFx0XHQnbmFtZTogXCJHaXRIdWJfQ29waWxvdF9DdXN0b21fQWdlbnRcIicsXG5cdFx0XHRcdCdkZXNjcmlwdGlvbjogXCJHaXRIdWIgQ29waWxvdCBhZ2VudFwiJyxcblx0XHRcdFx0J3RhcmdldDogZ2l0aHViLWNvcGlsb3QnLFxuXHRcdFx0XHRgdG9vbHM6IFsnc2hlbGwnLCAnZWRpdCcsICdzZWFyY2gnLCAnY3VzdG9tLWFnZW50J11gLFxuXHRcdFx0XHQnbWNwLXNlcnZlcnM6IFtdJyxcblx0XHRcdFx0Jy0tLScsXG5cdFx0XHRcdCdCb2R5IHdpdGggI3NlYXJjaCBhbmQgI2VkaXQgcmVmZXJlbmNlcycsXG5cdFx0XHRdLmpvaW4oJ1xcbicpO1xuXHRcdFx0Y29uc3QgbWFya2VycyA9IGF3YWl0IHZhbGlkYXRlKGNvbnRlbnQsIFByb21wdHNUeXBlLmFnZW50KTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwobWFya2VycywgW10sICdFeHBlY3RlZCBubyB2YWxpZGF0aW9uIGlzc3VlcyBmb3IgZ2l0aHViLWNvcGlsb3QgdGFyZ2V0Jyk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdnaXRodWItY29waWxvdCBhZ2VudCB3YXJucyBhYm91dCBtb2RlbCBhbmQgaGFuZG9mZnMgYXR0cmlidXRlcycsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IGNvbnRlbnQgPSBbXG5cdFx0XHRcdCctLS0nLFxuXHRcdFx0XHQnbmFtZTogXCJHaXRIdWJBZ2VudFwiJyxcblx0XHRcdFx0J2Rlc2NyaXB0aW9uOiBcIkdpdEh1YiBDb3BpbG90IGFnZW50XCInLFxuXHRcdFx0XHQndGFyZ2V0OiBnaXRodWItY29waWxvdCcsXG5cdFx0XHRcdCdtb2RlbDogTUFFIDQuMScsXG5cdFx0XHRcdGB0b29sczogWydzaGVsbCcsICdlZGl0J11gLFxuXHRcdFx0XHRgaGFuZG9mZnM6YCxcblx0XHRcdFx0JyAgLSBsYWJlbDogVGVzdCcsXG5cdFx0XHRcdCcgICAgYWdlbnQ6IERlZmF1bHQnLFxuXHRcdFx0XHQnICAgIHByb21wdDogVGVzdCcsXG5cdFx0XHRcdCctLS0nLFxuXHRcdFx0XHQnQm9keScsXG5cdFx0XHRdLmpvaW4oJ1xcbicpO1xuXHRcdFx0Y29uc3QgbWFya2VycyA9IGF3YWl0IHZhbGlkYXRlKGNvbnRlbnQsIFByb21wdHNUeXBlLmFnZW50KTtcblx0XHRcdGNvbnN0IG1lc3NhZ2VzID0gbWFya2Vycy5tYXAobSA9PiBtLm1lc3NhZ2UpO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChtZXNzYWdlcywgW1xuXHRcdFx0XHQnQXR0cmlidXRlIFxcJ21vZGVsXFwnIGlzIG5vdCBzdXBwb3J0ZWQgaW4gY3VzdG9tIEdpdEh1YiBDb3BpbG90IGFnZW50IGZpbGVzLiBTdXBwb3J0ZWQ6IGRlc2NyaXB0aW9uLCBnaXRodWIsIGluZmVyLCBtY3Atc2VydmVycywgbmFtZSwgdGFyZ2V0LCB0b29scy4nLFxuXHRcdFx0XHQnQXR0cmlidXRlIFxcJ2hhbmRvZmZzXFwnIGlzIG5vdCBzdXBwb3J0ZWQgaW4gY3VzdG9tIEdpdEh1YiBDb3BpbG90IGFnZW50IGZpbGVzLiBTdXBwb3J0ZWQ6IGRlc2NyaXB0aW9uLCBnaXRodWIsIGluZmVyLCBtY3Atc2VydmVycywgbmFtZSwgdGFyZ2V0LCB0b29scy4nLFxuXHRcdFx0XSwgJ01vZGVsIGFuZCBoYW5kb2ZmcyBhcmUgbm90IHZhbGlkYXRlZCBmb3IgZ2l0aHViLWNvcGlsb3QgdGFyZ2V0Jyk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdnaXRodWItY29waWxvdCBhZ2VudCBkb2VzIG5vdCB2YWxpZGF0ZSB2YXJpYWJsZSByZWZlcmVuY2VzJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgY29udGVudCA9IFtcblx0XHRcdFx0Jy0tLScsXG5cdFx0XHRcdCduYW1lOiBcIkdpdEh1YkFnZW50XCInLFxuXHRcdFx0XHQnZGVzY3JpcHRpb246IFwiR2l0SHViIENvcGlsb3QgYWdlbnRcIicsXG5cdFx0XHRcdCd0YXJnZXQ6IGdpdGh1Yi1jb3BpbG90Jyxcblx0XHRcdFx0YHRvb2xzOiBbJ3NoZWxsJywgJ2VkaXQnXWAsXG5cdFx0XHRcdCctLS0nLFxuXHRcdFx0XHQnQm9keSB3aXRoICN1bmtub3duVG9vbCByZWZlcmVuY2UnLFxuXHRcdFx0XS5qb2luKCdcXG4nKTtcblx0XHRcdGNvbnN0IG1hcmtlcnMgPSBhd2FpdCB2YWxpZGF0ZShjb250ZW50LCBQcm9tcHRzVHlwZS5hZ2VudCk7XG5cdFx0XHQvLyBWYXJpYWJsZSByZWZlcmVuY2VzIHNob3VsZCBub3QgYmUgdmFsaWRhdGVkIGZvciBnaXRodWItY29waWxvdCB0YXJnZXRcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwobWFya2VycywgW10sICdWYXJpYWJsZSByZWZlcmVuY2VzIGFyZSBub3QgdmFsaWRhdGVkIGZvciBnaXRodWItY29waWxvdCB0YXJnZXQnKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2dpdGh1Yi1jb3BpbG90IGFnZW50IHJlamVjdHMgdW5zdXBwb3J0ZWQgYXR0cmlidXRlcycsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IGNvbnRlbnQgPSBbXG5cdFx0XHRcdCctLS0nLFxuXHRcdFx0XHQnbmFtZTogXCJHaXRIdWJBZ2VudFwiJyxcblx0XHRcdFx0J2Rlc2NyaXB0aW9uOiBcIkdpdEh1YiBDb3BpbG90IGFnZW50XCInLFxuXHRcdFx0XHQndGFyZ2V0OiBnaXRodWItY29waWxvdCcsXG5cdFx0XHRcdCdhcmd1bWVudC1oaW50OiBcInRlc3QgaGludFwiJyxcblx0XHRcdFx0YHRvb2xzOiBbJ3NoZWxsJ11gLFxuXHRcdFx0XHQnLS0tJyxcblx0XHRcdFx0J0JvZHknLFxuXHRcdFx0XS5qb2luKCdcXG4nKTtcblx0XHRcdGNvbnN0IG1hcmtlcnMgPSBhd2FpdCB2YWxpZGF0ZShjb250ZW50LCBQcm9tcHRzVHlwZS5hZ2VudCk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobWFya2Vycy5sZW5ndGgsIDEpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1hcmtlcnNbMF0uc2V2ZXJpdHksIE1hcmtlclNldmVyaXR5LkhpbnQpO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChtYXJrZXJzWzBdLnRhZ3MsIFtNYXJrZXJUYWcuVW5uZWNlc3NhcnldKTtcblx0XHRcdGFzc2VydC5vayhtYXJrZXJzWzBdLm1lc3NhZ2UuaW5jbHVkZXMoYEF0dHJpYnV0ZSAnYXJndW1lbnQtaGludCcgaXMgbm90IHN1cHBvcnRlZGApLCAnRXhwZWN0ZWQgaGludCBhYm91dCB1bnN1cHBvcnRlZCBhdHRyaWJ1dGUnKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2dpdGh1Yi1jb3BpbG90IGFnZW50IHdpdGggdmFsaWQgcGVybWlzc2lvbnMnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCBjb250ZW50ID0gW1xuXHRcdFx0XHQnLS0tJyxcblx0XHRcdFx0J25hbWU6IFwiSXNzdWVUcmlhZ2VcIicsXG5cdFx0XHRcdCdkZXNjcmlwdGlvbjogXCJUcmlhZ2VzIGlzc3Vlc1wiJyxcblx0XHRcdFx0J3RhcmdldDogZ2l0aHViLWNvcGlsb3QnLFxuXHRcdFx0XHRgdG9vbHM6IFsncmVhZCddYCxcblx0XHRcdFx0J2dpdGh1YjonLFxuXHRcdFx0XHQnICBwZXJtaXNzaW9uczonLFxuXHRcdFx0XHQnICAgIGlzc3Vlczogd3JpdGUnLFxuXHRcdFx0XHQnICAgIGNvbnRlbnRzOiByZWFkJyxcblx0XHRcdFx0JyAgICBtZXRhZGF0YTogcmVhZCcsXG5cdFx0XHRcdCctLS0nLFxuXHRcdFx0XHQnQm9keScsXG5cdFx0XHRdLmpvaW4oJ1xcbicpO1xuXHRcdFx0Y29uc3QgbWFya2VycyA9IGF3YWl0IHZhbGlkYXRlKGNvbnRlbnQsIFByb21wdHNUeXBlLmFnZW50KTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwobWFya2VycywgW10pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnZ2l0aHViLWNvcGlsb3QgYWdlbnQgd2l0aCBpbnZhbGlkIHBlcm1pc3Npb24gc2NvcGUnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCBjb250ZW50ID0gW1xuXHRcdFx0XHQnLS0tJyxcblx0XHRcdFx0J25hbWU6IFwiVGVzdEFnZW50XCInLFxuXHRcdFx0XHQnZGVzY3JpcHRpb246IFwiVGVzdFwiJyxcblx0XHRcdFx0J3RhcmdldDogZ2l0aHViLWNvcGlsb3QnLFxuXHRcdFx0XHRgdG9vbHM6IFsncmVhZCddYCxcblx0XHRcdFx0J2dpdGh1YjonLFxuXHRcdFx0XHQnICBwZXJtaXNzaW9uczonLFxuXHRcdFx0XHQnICAgIHVua25vd24tc2NvcGU6IHJlYWQnLFxuXHRcdFx0XHQnLS0tJyxcblx0XHRcdFx0J0JvZHknLFxuXHRcdFx0XS5qb2luKCdcXG4nKTtcblx0XHRcdGNvbnN0IG1hcmtlcnMgPSBhd2FpdCB2YWxpZGF0ZShjb250ZW50LCBQcm9tcHRzVHlwZS5hZ2VudCk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobWFya2Vycy5sZW5ndGgsIDEpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1hcmtlcnNbMF0uc2V2ZXJpdHksIE1hcmtlclNldmVyaXR5Lldhcm5pbmcpO1xuXHRcdFx0YXNzZXJ0Lm9rKG1hcmtlcnNbMF0ubWVzc2FnZS5pbmNsdWRlcygnVW5rbm93biBwZXJtaXNzaW9uIHNjb3BlIFxcJ3Vua25vd24tc2NvcGVcXCcnKSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdnaXRodWItY29waWxvdCBhZ2VudCB3aXRoIGludmFsaWQgcGVybWlzc2lvbiB2YWx1ZScsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IGNvbnRlbnQgPSBbXG5cdFx0XHRcdCctLS0nLFxuXHRcdFx0XHQnbmFtZTogXCJUZXN0QWdlbnRcIicsXG5cdFx0XHRcdCdkZXNjcmlwdGlvbjogXCJUZXN0XCInLFxuXHRcdFx0XHQndGFyZ2V0OiBnaXRodWItY29waWxvdCcsXG5cdFx0XHRcdGB0b29sczogWydyZWFkJ11gLFxuXHRcdFx0XHQnZ2l0aHViOicsXG5cdFx0XHRcdCcgIHBlcm1pc3Npb25zOicsXG5cdFx0XHRcdCcgICAgbWV0YWRhdGE6IHdyaXRlJyxcblx0XHRcdFx0Jy0tLScsXG5cdFx0XHRcdCdCb2R5Jyxcblx0XHRcdF0uam9pbignXFxuJyk7XG5cdFx0XHRjb25zdCBtYXJrZXJzID0gYXdhaXQgdmFsaWRhdGUoY29udGVudCwgUHJvbXB0c1R5cGUuYWdlbnQpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1hcmtlcnMubGVuZ3RoLCAxKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChtYXJrZXJzWzBdLnNldmVyaXR5LCBNYXJrZXJTZXZlcml0eS5FcnJvcik7XG5cdFx0XHRhc3NlcnQub2sobWFya2Vyc1swXS5tZXNzYWdlLmluY2x1ZGVzKCdJbnZhbGlkIHBlcm1pc3Npb24gdmFsdWUgXFwnd3JpdGVcXCcgZm9yIHNjb3BlIFxcJ21ldGFkYXRhXFwnJykpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnZ2l0aHViLWNvcGlsb3QgYWdlbnQgd2l0aCBub24tbWFwIGdpdGh1YiBhdHRyaWJ1dGUnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCBjb250ZW50ID0gW1xuXHRcdFx0XHQnLS0tJyxcblx0XHRcdFx0J25hbWU6IFwiVGVzdEFnZW50XCInLFxuXHRcdFx0XHQnZGVzY3JpcHRpb246IFwiVGVzdFwiJyxcblx0XHRcdFx0J3RhcmdldDogZ2l0aHViLWNvcGlsb3QnLFxuXHRcdFx0XHRgdG9vbHM6IFsncmVhZCddYCxcblx0XHRcdFx0J2dpdGh1YjogaW52YWxpZCcsXG5cdFx0XHRcdCctLS0nLFxuXHRcdFx0XHQnQm9keScsXG5cdFx0XHRdLmpvaW4oJ1xcbicpO1xuXHRcdFx0Y29uc3QgbWFya2VycyA9IGF3YWl0IHZhbGlkYXRlKGNvbnRlbnQsIFByb21wdHNUeXBlLmFnZW50KTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChtYXJrZXJzLmxlbmd0aCwgMSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobWFya2Vyc1swXS5zZXZlcml0eSwgTWFya2VyU2V2ZXJpdHkuRXJyb3IpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1hcmtlcnNbMF0ubWVzc2FnZSwgJ1RoZSBcXCdnaXRodWJcXCcgYXR0cmlidXRlIG11c3QgYmUgYW4gb2JqZWN0LicpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnZ2l0aHViLWNvcGlsb3QgYWdlbnQgd2l0aCB1bmtub3duIGdpdGh1YiBzdWItcHJvcGVydHknLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCBjb250ZW50ID0gW1xuXHRcdFx0XHQnLS0tJyxcblx0XHRcdFx0J25hbWU6IFwiVGVzdEFnZW50XCInLFxuXHRcdFx0XHQnZGVzY3JpcHRpb246IFwiVGVzdFwiJyxcblx0XHRcdFx0J3RhcmdldDogZ2l0aHViLWNvcGlsb3QnLFxuXHRcdFx0XHRgdG9vbHM6IFsncmVhZCddYCxcblx0XHRcdFx0J2dpdGh1YjonLFxuXHRcdFx0XHQnICB1bmtub3duOiB2YWx1ZScsXG5cdFx0XHRcdCctLS0nLFxuXHRcdFx0XHQnQm9keScsXG5cdFx0XHRdLmpvaW4oJ1xcbicpO1xuXHRcdFx0Y29uc3QgbWFya2VycyA9IGF3YWl0IHZhbGlkYXRlKGNvbnRlbnQsIFByb21wdHNUeXBlLmFnZW50KTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChtYXJrZXJzLmxlbmd0aCwgMSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobWFya2Vyc1swXS5zZXZlcml0eSwgTWFya2VyU2V2ZXJpdHkuV2FybmluZyk7XG5cdFx0XHRhc3NlcnQub2sobWFya2Vyc1swXS5tZXNzYWdlLmluY2x1ZGVzKCdVbmtub3duIHByb3BlcnR5IFxcJ3Vua25vd25cXCcnKSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCd1bmRlZmluZWQgdGFyZ2V0IGFnZW50IHdpdGggdmFsaWQgZ2l0aHViIHBlcm1pc3Npb25zJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgY29udGVudCA9IFtcblx0XHRcdFx0Jy0tLScsXG5cdFx0XHRcdCdkZXNjcmlwdGlvbjogXCJBZ2VudCB3aXRob3V0IHRhcmdldFwiJyxcblx0XHRcdFx0J2dpdGh1YjonLFxuXHRcdFx0XHQnICBwZXJtaXNzaW9uczonLFxuXHRcdFx0XHQnICAgIGlzc3Vlczogd3JpdGUnLFxuXHRcdFx0XHQnICAgIGNvbnRlbnRzOiByZWFkJyxcblx0XHRcdFx0Jy0tLScsXG5cdFx0XHRcdCdCb2R5Jyxcblx0XHRcdF0uam9pbignXFxuJyk7XG5cdFx0XHRjb25zdCBtYXJrZXJzID0gYXdhaXQgdmFsaWRhdGUoY29udGVudCwgUHJvbXB0c1R5cGUuYWdlbnQpO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChtYXJrZXJzLCBbXSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCd1bmRlZmluZWQgdGFyZ2V0IGFnZW50IHdpdGggaW52YWxpZCBnaXRodWIgcGVybWlzc2lvbiBzY29wZScsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IGNvbnRlbnQgPSBbXG5cdFx0XHRcdCctLS0nLFxuXHRcdFx0XHQnZGVzY3JpcHRpb246IFwiQWdlbnQgd2l0aG91dCB0YXJnZXRcIicsXG5cdFx0XHRcdCdnaXRodWI6Jyxcblx0XHRcdFx0JyAgcGVybWlzc2lvbnM6Jyxcblx0XHRcdFx0JyAgICB1bmtub3duLXNjb3BlOiByZWFkJyxcblx0XHRcdFx0Jy0tLScsXG5cdFx0XHRcdCdCb2R5Jyxcblx0XHRcdF0uam9pbignXFxuJyk7XG5cdFx0XHRjb25zdCBtYXJrZXJzID0gYXdhaXQgdmFsaWRhdGUoY29udGVudCwgUHJvbXB0c1R5cGUuYWdlbnQpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1hcmtlcnMubGVuZ3RoLCAxKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChtYXJrZXJzWzBdLnNldmVyaXR5LCBNYXJrZXJTZXZlcml0eS5XYXJuaW5nKTtcblx0XHRcdGFzc2VydC5vayhtYXJrZXJzWzBdLm1lc3NhZ2UuaW5jbHVkZXMoJ1Vua25vd24gcGVybWlzc2lvbiBzY29wZSBcXCd1bmtub3duLXNjb3BlXFwnJykpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgndW5kZWZpbmVkIHRhcmdldCBhZ2VudCB3aXRoIGludmFsaWQgZ2l0aHViIHBlcm1pc3Npb24gdmFsdWUnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCBjb250ZW50ID0gW1xuXHRcdFx0XHQnLS0tJyxcblx0XHRcdFx0J2Rlc2NyaXB0aW9uOiBcIkFnZW50IHdpdGhvdXQgdGFyZ2V0XCInLFxuXHRcdFx0XHQnZ2l0aHViOicsXG5cdFx0XHRcdCcgIHBlcm1pc3Npb25zOicsXG5cdFx0XHRcdCcgICAgbWV0YWRhdGE6IHdyaXRlJyxcblx0XHRcdFx0Jy0tLScsXG5cdFx0XHRcdCdCb2R5Jyxcblx0XHRcdF0uam9pbignXFxuJyk7XG5cdFx0XHRjb25zdCBtYXJrZXJzID0gYXdhaXQgdmFsaWRhdGUoY29udGVudCwgUHJvbXB0c1R5cGUuYWdlbnQpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1hcmtlcnMubGVuZ3RoLCAxKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChtYXJrZXJzWzBdLnNldmVyaXR5LCBNYXJrZXJTZXZlcml0eS5FcnJvcik7XG5cdFx0XHRhc3NlcnQub2sobWFya2Vyc1swXS5tZXNzYWdlLmluY2x1ZGVzKCdJbnZhbGlkIHBlcm1pc3Npb24gdmFsdWUgXFwnd3JpdGVcXCcgZm9yIHNjb3BlIFxcJ21ldGFkYXRhXFwnJykpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgndW5kZWZpbmVkIHRhcmdldCBhZ2VudCB3aXRoIG5vbi1tYXAgZ2l0aHViIGF0dHJpYnV0ZScsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IGNvbnRlbnQgPSBbXG5cdFx0XHRcdCctLS0nLFxuXHRcdFx0XHQnZGVzY3JpcHRpb246IFwiQWdlbnQgd2l0aG91dCB0YXJnZXRcIicsXG5cdFx0XHRcdCdnaXRodWI6IGludmFsaWQnLFxuXHRcdFx0XHQnLS0tJyxcblx0XHRcdFx0J0JvZHknLFxuXHRcdFx0XS5qb2luKCdcXG4nKTtcblx0XHRcdGNvbnN0IG1hcmtlcnMgPSBhd2FpdCB2YWxpZGF0ZShjb250ZW50LCBQcm9tcHRzVHlwZS5hZ2VudCk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobWFya2Vycy5sZW5ndGgsIDEpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1hcmtlcnNbMF0uc2V2ZXJpdHksIE1hcmtlclNldmVyaXR5LkVycm9yKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChtYXJrZXJzWzBdLm1lc3NhZ2UsICdUaGUgXFwnZ2l0aHViXFwnIGF0dHJpYnV0ZSBtdXN0IGJlIGFuIG9iamVjdC4nKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3ZzY29kZSB0YXJnZXQgYWdlbnQgdmFsaWRhdGVzIG5vcm1hbGx5JywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgY29udGVudCA9IFtcblx0XHRcdFx0Jy0tLScsXG5cdFx0XHRcdCdkZXNjcmlwdGlvbjogXCJWUyBDb2RlIGFnZW50XCInLFxuXHRcdFx0XHQndGFyZ2V0OiB2c2NvZGUnLFxuXHRcdFx0XHQnbW9kZWw6IE1BRSA0LjEnLFxuXHRcdFx0XHRgdG9vbHM6IFsndG9vbDEnLCAndG9vbDInXWAsXG5cdFx0XHRcdCctLS0nLFxuXHRcdFx0XHQnQm9keSB3aXRoICN0b29sMScsXG5cdFx0XHRdLmpvaW4oJ1xcbicpO1xuXHRcdFx0Y29uc3QgbWFya2VycyA9IGF3YWl0IHZhbGlkYXRlKGNvbnRlbnQsIFByb21wdHNUeXBlLmFnZW50KTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwobWFya2VycywgW10sICdWUyBDb2RlIHRhcmdldCBzaG91bGQgdmFsaWRhdGUgbm9ybWFsbHknKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3ZzY29kZSB0YXJnZXQgYWdlbnQgbWFya3MgdW5rbm93biB0b29scyBhcyB1bm5lY2Vzc2FyeSBoaW50cycsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IGNvbnRlbnQgPSBbXG5cdFx0XHRcdCctLS0nLFxuXHRcdFx0XHQnZGVzY3JpcHRpb246IFwiVlMgQ29kZSBhZ2VudFwiJyxcblx0XHRcdFx0J3RhcmdldDogdnNjb2RlJyxcblx0XHRcdFx0YHRvb2xzOiBbJ3Rvb2wxJywgJ3Vua25vd25Ub29sJ11gLFxuXHRcdFx0XHQnLS0tJyxcblx0XHRcdFx0J0JvZHknLFxuXHRcdFx0XS5qb2luKCdcXG4nKTtcblx0XHRcdGNvbnN0IG1hcmtlcnMgPSBhd2FpdCB2YWxpZGF0ZShjb250ZW50LCBQcm9tcHRzVHlwZS5hZ2VudCk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobWFya2Vycy5sZW5ndGgsIDEpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1hcmtlcnNbMF0uc2V2ZXJpdHksIE1hcmtlclNldmVyaXR5LkhpbnQpO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChtYXJrZXJzWzBdLnRhZ3MsIFtNYXJrZXJUYWcuVW5uZWNlc3NhcnldKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChtYXJrZXJzWzBdLm1lc3NhZ2UsIGBVbmtub3duIHRvb2wgJ3Vua25vd25Ub29sJyB3aWxsIGJlIGlnbm9yZWQuYCk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCd2c2NvZGUgdGFyZ2V0IGFnZW50IHdpdGggbWNwLXNlcnZlcnMgYW5kIGdpdGh1Yi10b29scycsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IGNvbnRlbnQgPSBbXG5cdFx0XHRcdCctLS0nLFxuXHRcdFx0XHQnZGVzY3JpcHRpb246IFwiVlMgQ29kZSBhZ2VudFwiJyxcblx0XHRcdFx0J3RhcmdldDogdnNjb2RlJyxcblx0XHRcdFx0YHRvb2xzOiBbJ3Rvb2wxJywgJ2VkaXQnXWAsXG5cdFx0XHRcdGBtY3Atc2VydmVyczoge31gLFxuXHRcdFx0XHQnLS0tJyxcblx0XHRcdFx0J0JvZHknLFxuXHRcdFx0XS5qb2luKCdcXG4nKTtcblx0XHRcdGNvbnN0IG1hcmtlcnMgPSBhd2FpdCB2YWxpZGF0ZShjb250ZW50LCBQcm9tcHRzVHlwZS5hZ2VudCk7XG5cdFx0XHRjb25zdCBtZXNzYWdlcyA9IG1hcmtlcnMubWFwKG0gPT4gbS5tZXNzYWdlKTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwobWVzc2FnZXMsIFtcblx0XHRcdFx0J0F0dHJpYnV0ZSBcXCdtY3Atc2VydmVyc1xcJyBpcyBpZ25vcmVkIHdoZW4gcnVubmluZyBsb2NhbGx5IGluIFZTIENvZGUuJyxcblx0XHRcdFx0J1Vua25vd24gdG9vbCBcXCdlZGl0XFwnIHdpbGwgYmUgaWdub3JlZC4nLFxuXHRcdFx0XSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCd1bmRlZmluZWQgdGFyZ2V0IHdpdGggbWNwLXNlcnZlcnMgYW5kIGdpdGh1Yi10b29scycsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IGNvbnRlbnQgPSBbXG5cdFx0XHRcdCctLS0nLFxuXHRcdFx0XHQnZGVzY3JpcHRpb246IFwiVlMgQ29kZSBhZ2VudFwiJyxcblx0XHRcdFx0YHRvb2xzOiBbJ3Rvb2wxJywgJ3NoZWxsJ11gLFxuXHRcdFx0XHRgbWNwLXNlcnZlcnM6IHt9YCxcblx0XHRcdFx0Jy0tLScsXG5cdFx0XHRcdCdCb2R5Jyxcblx0XHRcdF0uam9pbignXFxuJyk7XG5cdFx0XHRjb25zdCBtYXJrZXJzID0gYXdhaXQgdmFsaWRhdGUoY29udGVudCwgUHJvbXB0c1R5cGUuYWdlbnQpO1xuXHRcdFx0Y29uc3QgbWVzc2FnZXMgPSBtYXJrZXJzLm1hcChtID0+IG0ubWVzc2FnZSk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKG1lc3NhZ2VzLCBbXG5cdFx0XHRcdCdBdHRyaWJ1dGUgXFwnbWNwLXNlcnZlcnNcXCcgaXMgaWdub3JlZCB3aGVuIHJ1bm5pbmcgbG9jYWxseSBpbiBWUyBDb2RlLicsXG5cdFx0XHRdKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2RlZmF1bHQgdGFyZ2V0IChubyB0YXJnZXQgc3BlY2lmaWVkKSB2YWxpZGF0ZXMgYXMgdnNjb2RlJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgY29udGVudCA9IFtcblx0XHRcdFx0Jy0tLScsXG5cdFx0XHRcdCdkZXNjcmlwdGlvbjogXCJBZ2VudCB3aXRob3V0IHRhcmdldFwiJyxcblx0XHRcdFx0J21vZGVsOiBNQUUgNC4xJyxcblx0XHRcdFx0YHRvb2xzOiBbJ3Rvb2wxJ11gLFxuXHRcdFx0XHQnYXJndW1lbnQtaGludDogXCJ0ZXN0IGhpbnRcIicsXG5cdFx0XHRcdCctLS0nLFxuXHRcdFx0XHQnQm9keScsXG5cdFx0XHRdLmpvaW4oJ1xcbicpO1xuXHRcdFx0Y29uc3QgbWFya2VycyA9IGF3YWl0IHZhbGlkYXRlKGNvbnRlbnQsIFByb21wdHNUeXBlLmFnZW50KTtcblx0XHRcdC8vIFNob3VsZCB2YWxpZGF0ZSBub3JtYWxseSBhcyBpZiB0YXJnZXQgd2FzIHZzY29kZVxuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChtYXJrZXJzLCBbXSwgJ0FnZW50IHdpdGhvdXQgdGFyZ2V0IHNob3VsZCB2YWxpZGF0ZSBhcyB2c2NvZGUnKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ25hbWUgYXR0cmlidXRlIHZhbGlkYXRpb24nLCBhc3luYyAoKSA9PiB7XG5cdFx0XHQvLyBWYWxpZCBuYW1lXG5cdFx0XHR7XG5cdFx0XHRcdGNvbnN0IGNvbnRlbnQgPSBbXG5cdFx0XHRcdFx0Jy0tLScsXG5cdFx0XHRcdFx0J25hbWU6IFwiTXlBZ2VudFwiJyxcblx0XHRcdFx0XHQnZGVzY3JpcHRpb246IFwiVGVzdCBhZ2VudFwiJyxcblx0XHRcdFx0XHQndGFyZ2V0OiB2c2NvZGUnLFxuXHRcdFx0XHRcdCctLS0nLFxuXHRcdFx0XHRcdCdCb2R5Jyxcblx0XHRcdFx0XS5qb2luKCdcXG4nKTtcblx0XHRcdFx0Y29uc3QgbWFya2VycyA9IGF3YWl0IHZhbGlkYXRlKGNvbnRlbnQsIFByb21wdHNUeXBlLmFnZW50KTtcblx0XHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChtYXJrZXJzLCBbXSwgJ1ZhbGlkIG5hbWUgc2hvdWxkIG5vdCBwcm9kdWNlIGVycm9ycycpO1xuXHRcdFx0fVxuXG5cdFx0XHQvLyBFbXB0eSBuYW1lXG5cdFx0XHR7XG5cdFx0XHRcdGNvbnN0IGNvbnRlbnQgPSBbXG5cdFx0XHRcdFx0Jy0tLScsXG5cdFx0XHRcdFx0J25hbWU6IFwiXCInLFxuXHRcdFx0XHRcdCdkZXNjcmlwdGlvbjogXCJUZXN0IGFnZW50XCInLFxuXHRcdFx0XHRcdCd0YXJnZXQ6IHZzY29kZScsXG5cdFx0XHRcdFx0Jy0tLScsXG5cdFx0XHRcdFx0J0JvZHknLFxuXHRcdFx0XHRdLmpvaW4oJ1xcbicpO1xuXHRcdFx0XHRjb25zdCBtYXJrZXJzID0gYXdhaXQgdmFsaWRhdGUoY29udGVudCwgUHJvbXB0c1R5cGUuYWdlbnQpO1xuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobWFya2Vycy5sZW5ndGgsIDEpO1xuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobWFya2Vyc1swXS5zZXZlcml0eSwgTWFya2VyU2V2ZXJpdHkuRXJyb3IpO1xuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobWFya2Vyc1swXS5tZXNzYWdlLCBgVGhlICduYW1lJyBhdHRyaWJ1dGUgbXVzdCBub3QgYmUgZW1wdHkuYCk7XG5cdFx0XHR9XG5cblx0XHRcdC8vIE5vbi1zdHJpbmcgbmFtZVxuXHRcdFx0e1xuXHRcdFx0XHRjb25zdCBjb250ZW50ID0gW1xuXHRcdFx0XHRcdCctLS0nLFxuXHRcdFx0XHRcdCduYW1lOiBbXScsXG5cdFx0XHRcdFx0J2Rlc2NyaXB0aW9uOiBcIlRlc3QgYWdlbnRcIicsXG5cdFx0XHRcdFx0J3RhcmdldDogdnNjb2RlJyxcblx0XHRcdFx0XHQnLS0tJyxcblx0XHRcdFx0XHQnQm9keScsXG5cdFx0XHRcdF0uam9pbignXFxuJyk7XG5cdFx0XHRcdGNvbnN0IG1hcmtlcnMgPSBhd2FpdCB2YWxpZGF0ZShjb250ZW50LCBQcm9tcHRzVHlwZS5hZ2VudCk7XG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChtYXJrZXJzLmxlbmd0aCwgMSk7XG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChtYXJrZXJzWzBdLnNldmVyaXR5LCBNYXJrZXJTZXZlcml0eS5FcnJvcik7XG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChtYXJrZXJzWzBdLm1lc3NhZ2UsIGBUaGUgJ25hbWUnIGF0dHJpYnV0ZSBtdXN0IGJlIGEgc3RyaW5nLmApO1xuXHRcdFx0fVxuXG5cdFx0XHQvLyBWYWxpZCBuYW1lIHdpdGggYWxsb3dlZCBjaGFyYWN0ZXJzXG5cdFx0XHR7XG5cdFx0XHRcdGNvbnN0IGNvbnRlbnQgPSBbXG5cdFx0XHRcdFx0Jy0tLScsXG5cdFx0XHRcdFx0J25hbWU6IFwiTXlfQWdlbnQtMi4wIHdpdGggc3BhY2VzXCInLFxuXHRcdFx0XHRcdCdkZXNjcmlwdGlvbjogXCJUZXN0IGFnZW50XCInLFxuXHRcdFx0XHRcdCd0YXJnZXQ6IHZzY29kZScsXG5cdFx0XHRcdFx0Jy0tLScsXG5cdFx0XHRcdFx0J0JvZHknLFxuXHRcdFx0XHRdLmpvaW4oJ1xcbicpO1xuXHRcdFx0XHRjb25zdCBtYXJrZXJzID0gYXdhaXQgdmFsaWRhdGUoY29udGVudCwgUHJvbXB0c1R5cGUuYWdlbnQpO1xuXHRcdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKG1hcmtlcnMsIFtdLCAnTmFtZSB3aXRoIGFsbG93ZWQgY2hhcmFjdGVycyBzaG91bGQgYmUgdmFsaWQnKTtcblx0XHRcdH1cblx0XHR9KTtcblxuXHRcdHRlc3QoJ2dpdGh1Yi1jb3BpbG90IHRhcmdldCByZXF1aXJlcyBuYW1lIGF0dHJpYnV0ZScsIGFzeW5jICgpID0+IHtcblx0XHRcdC8vIE1pc3NpbmcgbmFtZSB3aXRoIGdpdGh1Yi1jb3BpbG90IHRhcmdldFxuXHRcdFx0e1xuXHRcdFx0XHRjb25zdCBjb250ZW50ID0gW1xuXHRcdFx0XHRcdCctLS0nLFxuXHRcdFx0XHRcdCdkZXNjcmlwdGlvbjogXCJHaXRIdWIgQ29waWxvdCBhZ2VudFwiJyxcblx0XHRcdFx0XHQndGFyZ2V0OiBnaXRodWItY29waWxvdCcsXG5cdFx0XHRcdFx0YHRvb2xzOiBbJ3NoZWxsJ11gLFxuXHRcdFx0XHRcdCctLS0nLFxuXHRcdFx0XHRcdCdCb2R5Jyxcblx0XHRcdFx0XS5qb2luKCdcXG4nKTtcblx0XHRcdFx0Y29uc3QgbWFya2VycyA9IGF3YWl0IHZhbGlkYXRlKGNvbnRlbnQsIFByb21wdHNUeXBlLmFnZW50KTtcblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1hcmtlcnMubGVuZ3RoLCAwKTtcblx0XHRcdH1cblxuXHRcdFx0Ly8gVmFsaWQgbmFtZSB3aXRoIGdpdGh1Yi1jb3BpbG90IHRhcmdldFxuXHRcdFx0e1xuXHRcdFx0XHRjb25zdCBjb250ZW50ID0gW1xuXHRcdFx0XHRcdCctLS0nLFxuXHRcdFx0XHRcdCduYW1lOiBcIkdpdEh1YkFnZW50XCInLFxuXHRcdFx0XHRcdCdkZXNjcmlwdGlvbjogXCJHaXRIdWIgQ29waWxvdCBhZ2VudFwiJyxcblx0XHRcdFx0XHQndGFyZ2V0OiBnaXRodWItY29waWxvdCcsXG5cdFx0XHRcdFx0YHRvb2xzOiBbJ3NoZWxsJ11gLFxuXHRcdFx0XHRcdCctLS0nLFxuXHRcdFx0XHRcdCdCb2R5Jyxcblx0XHRcdFx0XS5qb2luKCdcXG4nKTtcblx0XHRcdFx0Y29uc3QgbWFya2VycyA9IGF3YWl0IHZhbGlkYXRlKGNvbnRlbnQsIFByb21wdHNUeXBlLmFnZW50KTtcblx0XHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChtYXJrZXJzLCBbXSwgJ1ZhbGlkIGdpdGh1Yi1jb3BpbG90IGFnZW50IHdpdGggbmFtZSBzaG91bGQgbm90IHByb2R1Y2UgZXJyb3JzJyk7XG5cdFx0XHR9XG5cblx0XHRcdC8vIE1pc3NpbmcgbmFtZSB3aXRoIHZzY29kZSB0YXJnZXQgKHNob3VsZCBiZSBvcHRpb25hbClcblx0XHRcdHtcblx0XHRcdFx0Y29uc3QgY29udGVudCA9IFtcblx0XHRcdFx0XHQnLS0tJyxcblx0XHRcdFx0XHQnZGVzY3JpcHRpb246IFwiVlMgQ29kZSBhZ2VudFwiJyxcblx0XHRcdFx0XHQndGFyZ2V0OiB2c2NvZGUnLFxuXHRcdFx0XHRcdGB0b29sczogWyd0b29sMSddYCxcblx0XHRcdFx0XHQnLS0tJyxcblx0XHRcdFx0XHQnQm9keScsXG5cdFx0XHRcdF0uam9pbignXFxuJyk7XG5cdFx0XHRcdGNvbnN0IG1hcmtlcnMgPSBhd2FpdCB2YWxpZGF0ZShjb250ZW50LCBQcm9tcHRzVHlwZS5hZ2VudCk7XG5cdFx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwobWFya2VycywgW10sICdOYW1lIHNob3VsZCBiZSBvcHRpb25hbCBmb3IgdnNjb2RlIHRhcmdldCcpO1xuXHRcdFx0fVxuXHRcdH0pO1xuXG5cdFx0dGVzdCgnaW5mZXIgYXR0cmlidXRlIHZhbGlkYXRpb24nLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCBkZXByZWNhdGlvbk1lc3NhZ2UgPSBgVGhlICdpbmZlcicgYXR0cmlidXRlIGlzIGRlcHJlY2F0ZWQgaW4gZmF2b3VyIG9mICd1c2VyLWludm9jYWJsZScgYW5kICdkaXNhYmxlLW1vZGVsLWludm9jYXRpb24nLmA7XG5cblx0XHRcdC8vIFZhbGlkIGluZmVyOiB0cnVlIChtYXBzIHRvICdhbGwnKSAtIHNob3dzIGRlcHJlY2F0aW9uIHdhcm5pbmdcblx0XHRcdHtcblx0XHRcdFx0Y29uc3QgY29udGVudCA9IFtcblx0XHRcdFx0XHQnLS0tJyxcblx0XHRcdFx0XHQnbmFtZTogXCJUZXN0QWdlbnRcIicsXG5cdFx0XHRcdFx0J2Rlc2NyaXB0aW9uOiBcIlRlc3QgYWdlbnRcIicsXG5cdFx0XHRcdFx0J2luZmVyOiB0cnVlJyxcblx0XHRcdFx0XHQnLS0tJyxcblx0XHRcdFx0XHQnQm9keScsXG5cdFx0XHRcdF0uam9pbignXFxuJyk7XG5cdFx0XHRcdGNvbnN0IG1hcmtlcnMgPSBhd2FpdCB2YWxpZGF0ZShjb250ZW50LCBQcm9tcHRzVHlwZS5hZ2VudCk7XG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChtYXJrZXJzLmxlbmd0aCwgMSwgJ2luZmVyOiB0cnVlIHNob3VsZCBwcm9kdWNlIGRlcHJlY2F0aW9uIHdhcm5pbmcnKTtcblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1hcmtlcnNbMF0ubWVzc2FnZSwgZGVwcmVjYXRpb25NZXNzYWdlKTtcblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1hcmtlcnNbMF0uc2V2ZXJpdHksIE1hcmtlclNldmVyaXR5LkVycm9yKTtcblx0XHRcdH1cblxuXHRcdFx0Ly8gVmFsaWQgaW5mZXI6IGZhbHNlIChtYXBzIHRvICd1c2VyJykgLSBzaG93cyBkZXByZWNhdGlvbiB3YXJuaW5nXG5cdFx0XHR7XG5cdFx0XHRcdGNvbnN0IGNvbnRlbnQgPSBbXG5cdFx0XHRcdFx0Jy0tLScsXG5cdFx0XHRcdFx0J25hbWU6IFwiVGVzdEFnZW50XCInLFxuXHRcdFx0XHRcdCdkZXNjcmlwdGlvbjogXCJUZXN0IGFnZW50XCInLFxuXHRcdFx0XHRcdCdpbmZlcjogZmFsc2UnLFxuXHRcdFx0XHRcdCctLS0nLFxuXHRcdFx0XHRcdCdCb2R5Jyxcblx0XHRcdFx0XS5qb2luKCdcXG4nKTtcblx0XHRcdFx0Y29uc3QgbWFya2VycyA9IGF3YWl0IHZhbGlkYXRlKGNvbnRlbnQsIFByb21wdHNUeXBlLmFnZW50KTtcblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1hcmtlcnMubGVuZ3RoLCAxLCAnaW5mZXI6IGZhbHNlIHNob3VsZCBwcm9kdWNlIGRlcHJlY2F0aW9uIHdhcm5pbmcnKTtcblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1hcmtlcnNbMF0ubWVzc2FnZSwgZGVwcmVjYXRpb25NZXNzYWdlKTtcblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1hcmtlcnNbMF0uc2V2ZXJpdHksIE1hcmtlclNldmVyaXR5LkVycm9yKTtcblx0XHRcdH1cblxuXHRcdFx0Ly8gSW52YWxpZCBpbmZlcjogdW5rbm93biBzdHJpbmcgdmFsdWUgLSBzaG93cyBkZXByZWNhdGlvbiB3YXJuaW5nICh2YWxpZGF0aW9uIHJlbW92ZWQgZm9yIGRlcHJlY2F0ZWQgYXR0cmlidXRlKVxuXHRcdFx0e1xuXHRcdFx0XHRjb25zdCBjb250ZW50ID0gW1xuXHRcdFx0XHRcdCctLS0nLFxuXHRcdFx0XHRcdCduYW1lOiBcIlRlc3RBZ2VudFwiJyxcblx0XHRcdFx0XHQnZGVzY3JpcHRpb246IFwiVGVzdCBhZ2VudFwiJyxcblx0XHRcdFx0XHQnaW5mZXI6IFwieWVzXCInLFxuXHRcdFx0XHRcdCctLS0nLFxuXHRcdFx0XHRcdCdCb2R5Jyxcblx0XHRcdFx0XS5qb2luKCdcXG4nKTtcblx0XHRcdFx0Y29uc3QgbWFya2VycyA9IGF3YWl0IHZhbGlkYXRlKGNvbnRlbnQsIFByb21wdHNUeXBlLmFnZW50KTtcblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1hcmtlcnMubGVuZ3RoLCAxLCAnaW5mZXI6IFwieWVzXCIgc2hvdWxkIHByb2R1Y2UgZGVwcmVjYXRpb24gd2FybmluZycpO1xuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobWFya2Vyc1swXS5tZXNzYWdlLCBkZXByZWNhdGlvbk1lc3NhZ2UpO1xuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobWFya2Vyc1swXS5zZXZlcml0eSwgTWFya2VyU2V2ZXJpdHkuRXJyb3IpO1xuXHRcdFx0fVxuXG5cdFx0XHQvLyBNaXNzaW5nIGluZmVyIGF0dHJpYnV0ZSAoc2hvdWxkIGJlIG9wdGlvbmFsKVxuXHRcdFx0e1xuXHRcdFx0XHRjb25zdCBjb250ZW50ID0gW1xuXHRcdFx0XHRcdCctLS0nLFxuXHRcdFx0XHRcdCduYW1lOiBcIlRlc3RBZ2VudFwiJyxcblx0XHRcdFx0XHQnZGVzY3JpcHRpb246IFwiVGVzdCBhZ2VudFwiJyxcblx0XHRcdFx0XHQnLS0tJyxcblx0XHRcdFx0XHQnQm9keScsXG5cdFx0XHRcdF0uam9pbignXFxuJyk7XG5cdFx0XHRcdGNvbnN0IG1hcmtlcnMgPSBhd2FpdCB2YWxpZGF0ZShjb250ZW50LCBQcm9tcHRzVHlwZS5hZ2VudCk7XG5cdFx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwobWFya2VycywgW10sICdNaXNzaW5nIGluZmVyIGF0dHJpYnV0ZSBzaG91bGQgYmUgYWxsb3dlZCcpO1xuXHRcdFx0fVxuXHRcdH0pO1xuXG5cblx0XHR0ZXN0KCdhZ2VudHMgYXR0cmlidXRlIG11c3QgYmUgYW4gYXJyYXknLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCBjb250ZW50ID0gW1xuXHRcdFx0XHQnLS0tJyxcblx0XHRcdFx0J2Rlc2NyaXB0aW9uOiBcIlRlc3RcIicsXG5cdFx0XHRcdGBhZ2VudHM6ICdteUFnZW50J2AsXG5cdFx0XHRcdCctLS0nLFxuXHRcdFx0XS5qb2luKCdcXG4nKTtcblx0XHRcdGNvbnN0IG1hcmtlcnMgPSBhd2FpdCB2YWxpZGF0ZShjb250ZW50LCBQcm9tcHRzVHlwZS5hZ2VudCk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKG1hcmtlcnMubWFwKG0gPT4gbS5tZXNzYWdlKSwgW2BUaGUgJ2FnZW50cycgYXR0cmlidXRlIG11c3QgYmUgYW4gYXJyYXkuYF0pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnZWFjaCBhZ2VudCBuYW1lIGluIGFnZW50cyBhdHRyaWJ1dGUgbXVzdCBiZSBhIHN0cmluZycsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IGNvbnRlbnQgPSBbXG5cdFx0XHRcdCctLS0nLFxuXHRcdFx0XHQnZGVzY3JpcHRpb246IFwiVGVzdFwiJyxcblx0XHRcdFx0YGFnZW50czogWydhZ2VudCcsIHt9XWAsXG5cdFx0XHRcdGB0b29sczogWydhZ2VudCddYCxcblx0XHRcdFx0Jy0tLScsXG5cdFx0XHRdLmpvaW4oJ1xcbicpO1xuXHRcdFx0Y29uc3QgbWFya2VycyA9IGF3YWl0IHZhbGlkYXRlKGNvbnRlbnQsIFByb21wdHNUeXBlLmFnZW50KTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwobWFya2Vycy5tYXAobSA9PiBtLm1lc3NhZ2UpLCBbYEVhY2ggYWdlbnQgbmFtZSBpbiB0aGUgJ2FnZW50cycgYXR0cmlidXRlIG11c3QgYmUgYSBzdHJpbmcuYF0pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgndW5rbm93biBhZ2VudCBpbiBhZ2VudHMgYXR0cmlidXRlIHNob3dzIHVubmVjZXNzYXJ5IGhpbnQnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCBjb250ZW50ID0gW1xuXHRcdFx0XHQnLS0tJyxcblx0XHRcdFx0J2Rlc2NyaXB0aW9uOiBcIlRlc3RcIicsXG5cdFx0XHRcdGBhZ2VudHM6IFsnVW5rbm93bkFnZW50J11gLFxuXHRcdFx0XHRgdG9vbHM6IFsnYWdlbnQnXWAsXG5cdFx0XHRcdCctLS0nLFxuXHRcdFx0XS5qb2luKCdcXG4nKTtcblx0XHRcdGNvbnN0IG1hcmtlcnMgPSBhd2FpdCB2YWxpZGF0ZShjb250ZW50LCBQcm9tcHRzVHlwZS5hZ2VudCk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobWFya2Vycy5sZW5ndGgsIDEpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1hcmtlcnNbMF0uc2V2ZXJpdHksIE1hcmtlclNldmVyaXR5LkhpbnQpO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChtYXJrZXJzWzBdLnRhZ3MsIFtNYXJrZXJUYWcuVW5uZWNlc3NhcnldKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChtYXJrZXJzWzBdLm1lc3NhZ2UsIGBVbmtub3duIGFnZW50ICdVbmtub3duQWdlbnQnIHdpbGwgYmUgaWdub3JlZC4gQXZhaWxhYmxlIGFnZW50czogUGxhbiwgYWdlbnQuYCk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdhZ2VudHMgYXR0cmlidXRlIHdpdGggbm9uLWVtcHR5IHZhbHVlIHJlcXVpcmVzIGFnZW50IHRvb2wgMScsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IGNvbnRlbnQgPSBbXG5cdFx0XHRcdCctLS0nLFxuXHRcdFx0XHQnZGVzY3JpcHRpb246IFwiVGVzdFwiJyxcblx0XHRcdFx0YGFnZW50czogWydhZ2VudCcsICdQbGFuJ11gLFxuXHRcdFx0XHQnLS0tJyxcblx0XHRcdF0uam9pbignXFxuJyk7XG5cdFx0XHRjb25zdCBtYXJrZXJzID0gYXdhaXQgdmFsaWRhdGUoY29udGVudCwgUHJvbXB0c1R5cGUuYWdlbnQpO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChtYXJrZXJzLm1hcChtID0+IG0ubWVzc2FnZSksIFtdLCBgTm8gd2FybmluZ3MgYWJvdXQgYWdlbnRzIGF0dHJpYnV0ZSB3aGVuIG5vIHRvb2xzIGFyZSBzcGVjaWZpZWRgKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2FnZW50cyBhdHRyaWJ1dGUgd2l0aCBub24tZW1wdHkgdmFsdWUgcmVxdWlyZXMgYWdlbnQgdG9vbCAyJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgY29udGVudCA9IFtcblx0XHRcdFx0Jy0tLScsXG5cdFx0XHRcdCdkZXNjcmlwdGlvbjogXCJUZXN0XCInLFxuXHRcdFx0XHRgYWdlbnRzOiBbJ2FnZW50JywgJ1BsYW4nXWAsXG5cdFx0XHRcdGB0b29sczogWydzaGVsbCddYCxcblx0XHRcdFx0Jy0tLScsXG5cdFx0XHRdLmpvaW4oJ1xcbicpO1xuXHRcdFx0Y29uc3QgbWFya2VycyA9IGF3YWl0IHZhbGlkYXRlKGNvbnRlbnQsIFByb21wdHNUeXBlLmFnZW50KTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwobWFya2Vycy5tYXAobSA9PiBtLm1lc3NhZ2UpLCBbYFdoZW4gJ2FnZW50cycgYW5kICd0b29scycgYXJlIHNwZWNpZmllZCwgdGhlICdhZ2VudCcgdG9vbCBtdXN0IGJlIGluY2x1ZGVkIGluIHRoZSAndG9vbHMnIGF0dHJpYnV0ZS5gXSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdhZ2VudHMgYXR0cmlidXRlIHdpdGggbm9uLWVtcHR5IHZhbHVlIHJlcXVpcmVzIGFnZW50IHRvb2wgMycsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IGNvbnRlbnQgPSBbXG5cdFx0XHRcdCctLS0nLFxuXHRcdFx0XHQnZGVzY3JpcHRpb246IFwiVGVzdFwiJyxcblx0XHRcdFx0YGFnZW50czogWydhZ2VudCcsICdQbGFuJ11gLFxuXHRcdFx0XHRgdG9vbHM6IFsnYWdlbnQnXWAsXG5cdFx0XHRcdCctLS0nLFxuXHRcdFx0XS5qb2luKCdcXG4nKTtcblx0XHRcdGNvbnN0IG1hcmtlcnMgPSBhd2FpdCB2YWxpZGF0ZShjb250ZW50LCBQcm9tcHRzVHlwZS5hZ2VudCk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKG1hcmtlcnMubWFwKG0gPT4gbS5tZXNzYWdlKSwgW10sIGBObyB3YXJuaW5ncyBhYm91dCBhZ2VudHMgYXR0cmlidXRlIHdoZW4gYWdlbnQgdG9vbCBpcyBpbiBoZWFkZXJgKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2FnZW50cyBhdHRyaWJ1dGUgd2l0aCBub24tZW1wdHkgdmFsdWUgcmVxdWlyZXMgYWdlbnQgdG9vbCA0JywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgY29udGVudCA9IFtcblx0XHRcdFx0Jy0tLScsXG5cdFx0XHRcdCdkZXNjcmlwdGlvbjogXCJUZXN0XCInLFxuXHRcdFx0XHRgYWdlbnRzOiBbJyonXWAsXG5cdFx0XHRcdGB0b29sczogWydzaGVsbCddYCxcblx0XHRcdFx0Jy0tLScsXG5cdFx0XHRdLmpvaW4oJ1xcbicpO1xuXHRcdFx0Y29uc3QgbWFya2VycyA9IGF3YWl0IHZhbGlkYXRlKGNvbnRlbnQsIFByb21wdHNUeXBlLmFnZW50KTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwobWFya2Vycy5tYXAobSA9PiBtLm1lc3NhZ2UpLCBbYFdoZW4gJ2FnZW50cycgYW5kICd0b29scycgYXJlIHNwZWNpZmllZCwgdGhlICdhZ2VudCcgdG9vbCBtdXN0IGJlIGluY2x1ZGVkIGluIHRoZSAndG9vbHMnIGF0dHJpYnV0ZS5gXSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdhZ2VudHMgYXR0cmlidXRlIHdpdGggZW1wdHkgYXJyYXkgZG9lcyBub3QgcmVxdWlyZSBhZ2VudCB0b29sJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgY29udGVudCA9IFtcblx0XHRcdFx0Jy0tLScsXG5cdFx0XHRcdCdkZXNjcmlwdGlvbjogXCJUZXN0XCInLFxuXHRcdFx0XHRgYWdlbnRzOiBbXWAsXG5cdFx0XHRcdCctLS0nLFxuXHRcdFx0XS5qb2luKCdcXG4nKTtcblx0XHRcdGNvbnN0IG1hcmtlcnMgPSBhd2FpdCB2YWxpZGF0ZShjb250ZW50LCBQcm9tcHRzVHlwZS5hZ2VudCk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKG1hcmtlcnMsIFtdLCAnRW1wdHkgYXJyYXkgc2hvdWxkIG5vdCByZXF1aXJlIGFnZW50IHRvb2wnKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3VzZXItaW52b2NhYmxlIGF0dHJpYnV0ZSB2YWxpZGF0aW9uJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Ly8gVmFsaWQgdXNlci1pbnZvY2FibGU6IHRydWVcblx0XHRcdHtcblx0XHRcdFx0Y29uc3QgY29udGVudCA9IFtcblx0XHRcdFx0XHQnLS0tJyxcblx0XHRcdFx0XHQnbmFtZTogXCJUZXN0QWdlbnRcIicsXG5cdFx0XHRcdFx0J2Rlc2NyaXB0aW9uOiBcIlRlc3QgYWdlbnRcIicsXG5cdFx0XHRcdFx0J3VzZXItaW52b2NhYmxlOiB0cnVlJyxcblx0XHRcdFx0XHQnLS0tJyxcblx0XHRcdFx0XHQnQm9keScsXG5cdFx0XHRcdF0uam9pbignXFxuJyk7XG5cdFx0XHRcdGNvbnN0IG1hcmtlcnMgPSBhd2FpdCB2YWxpZGF0ZShjb250ZW50LCBQcm9tcHRzVHlwZS5hZ2VudCk7XG5cdFx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwobWFya2VycywgW10sICdWYWxpZCB1c2VyLWludm9jYWJsZTogdHJ1ZSBzaG91bGQgbm90IHByb2R1Y2UgZXJyb3JzJyk7XG5cdFx0XHR9XG5cblx0XHRcdC8vIFZhbGlkIHVzZXItaW52b2NhYmxlOiBmYWxzZVxuXHRcdFx0e1xuXHRcdFx0XHRjb25zdCBjb250ZW50ID0gW1xuXHRcdFx0XHRcdCctLS0nLFxuXHRcdFx0XHRcdCduYW1lOiBcIlRlc3RBZ2VudFwiJyxcblx0XHRcdFx0XHQnZGVzY3JpcHRpb246IFwiVGVzdCBhZ2VudFwiJyxcblx0XHRcdFx0XHQndXNlci1pbnZvY2FibGU6IGZhbHNlJyxcblx0XHRcdFx0XHQnLS0tJyxcblx0XHRcdFx0XHQnQm9keScsXG5cdFx0XHRcdF0uam9pbignXFxuJyk7XG5cdFx0XHRcdGNvbnN0IG1hcmtlcnMgPSBhd2FpdCB2YWxpZGF0ZShjb250ZW50LCBQcm9tcHRzVHlwZS5hZ2VudCk7XG5cdFx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwobWFya2VycywgW10sICdWYWxpZCB1c2VyLWludm9jYWJsZTogZmFsc2Ugc2hvdWxkIG5vdCBwcm9kdWNlIGVycm9ycycpO1xuXHRcdFx0fVxuXG5cdFx0XHQvLyBJbnZhbGlkIHVzZXItaW52b2NhYmxlOiBzdHJpbmcgdmFsdWVcblx0XHRcdHtcblx0XHRcdFx0Y29uc3QgY29udGVudCA9IFtcblx0XHRcdFx0XHQnLS0tJyxcblx0XHRcdFx0XHQnbmFtZTogXCJUZXN0QWdlbnRcIicsXG5cdFx0XHRcdFx0J2Rlc2NyaXB0aW9uOiBcIlRlc3QgYWdlbnRcIicsXG5cdFx0XHRcdFx0J3VzZXItaW52b2NhYmxlOiBcInllc1wiJyxcblx0XHRcdFx0XHQnLS0tJyxcblx0XHRcdFx0XHQnQm9keScsXG5cdFx0XHRcdF0uam9pbignXFxuJyk7XG5cdFx0XHRcdGNvbnN0IG1hcmtlcnMgPSBhd2FpdCB2YWxpZGF0ZShjb250ZW50LCBQcm9tcHRzVHlwZS5hZ2VudCk7XG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChtYXJrZXJzLmxlbmd0aCwgMSk7XG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChtYXJrZXJzWzBdLnNldmVyaXR5LCBNYXJrZXJTZXZlcml0eS5FcnJvcik7XG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChtYXJrZXJzWzBdLm1lc3NhZ2UsIGBUaGUgJ3VzZXItaW52b2NhYmxlJyBhdHRyaWJ1dGUgbXVzdCBiZSAndHJ1ZScgb3IgJ2ZhbHNlJy5gKTtcblx0XHRcdH1cblxuXHRcdFx0Ly8gSW52YWxpZCB1c2VyLWludm9jYWJsZTogbnVtYmVyIHZhbHVlXG5cdFx0XHR7XG5cdFx0XHRcdGNvbnN0IGNvbnRlbnQgPSBbXG5cdFx0XHRcdFx0Jy0tLScsXG5cdFx0XHRcdFx0J25hbWU6IFwiVGVzdEFnZW50XCInLFxuXHRcdFx0XHRcdCdkZXNjcmlwdGlvbjogXCJUZXN0IGFnZW50XCInLFxuXHRcdFx0XHRcdCd1c2VyLWludm9jYWJsZTogMScsXG5cdFx0XHRcdFx0Jy0tLScsXG5cdFx0XHRcdFx0J0JvZHknLFxuXHRcdFx0XHRdLmpvaW4oJ1xcbicpO1xuXHRcdFx0XHRjb25zdCBtYXJrZXJzID0gYXdhaXQgdmFsaWRhdGUoY29udGVudCwgUHJvbXB0c1R5cGUuYWdlbnQpO1xuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobWFya2Vycy5sZW5ndGgsIDEpO1xuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobWFya2Vyc1swXS5zZXZlcml0eSwgTWFya2VyU2V2ZXJpdHkuRXJyb3IpO1xuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobWFya2Vyc1swXS5tZXNzYWdlLCBgVGhlICd1c2VyLWludm9jYWJsZScgYXR0cmlidXRlIG11c3QgYmUgJ3RydWUnIG9yICdmYWxzZScuYCk7XG5cdFx0XHR9XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdyZW1vdmVkIHVzZXItaW52b2thYmxlIGF0dHJpYnV0ZSBpcyByZXBvcnRlZCBhcyB1bmtub3duJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgY29udGVudCA9IFtcblx0XHRcdFx0Jy0tLScsXG5cdFx0XHRcdCduYW1lOiBcIlRlc3RBZ2VudFwiJyxcblx0XHRcdFx0J2Rlc2NyaXB0aW9uOiBcIlRlc3QgYWdlbnRcIicsXG5cdFx0XHRcdCd1c2VyLWludm9rYWJsZTogdHJ1ZScsXG5cdFx0XHRcdCctLS0nLFxuXHRcdFx0XHQnQm9keScsXG5cdFx0XHRdLmpvaW4oJ1xcbicpO1xuXHRcdFx0Y29uc3QgbWFya2VycyA9IGF3YWl0IHZhbGlkYXRlKGNvbnRlbnQsIFByb21wdHNUeXBlLmFnZW50KTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChtYXJrZXJzLmxlbmd0aCwgMSwgJ3VzZXItaW52b2thYmxlIHNob3VsZCBwcm9kdWNlIGV4YWN0bHkgb25lIGRpYWdub3N0aWMnKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChtYXJrZXJzWzBdLnNldmVyaXR5LCBNYXJrZXJTZXZlcml0eS5IaW50KTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwobWFya2Vyc1swXS50YWdzLCBbTWFya2VyVGFnLlVubmVjZXNzYXJ5XSk7XG5cdFx0XHRhc3NlcnQub2sobWFya2Vyc1swXS5tZXNzYWdlLmluY2x1ZGVzKCd1c2VyLWludm9rYWJsZScpLCAnaGludCBzaG91bGQgbWVudGlvbiB0aGUgYXR0cmlidXRlIG5hbWUnKTtcblx0XHRcdGFzc2VydC5vayhtYXJrZXJzWzBdLm1lc3NhZ2UuaW5jbHVkZXMoJ25vdCBzdXBwb3J0ZWQnKSwgJ2hpbnQgc2hvdWxkIHNheSBhdHRyaWJ1dGUgaXMgbm90IHN1cHBvcnRlZCcpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnZGlzYWJsZS1tb2RlbC1pbnZvY2F0aW9uIGF0dHJpYnV0ZSB2YWxpZGF0aW9uJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Ly8gVmFsaWQgZGlzYWJsZS1tb2RlbC1pbnZvY2F0aW9uOiB0cnVlXG5cdFx0XHR7XG5cdFx0XHRcdGNvbnN0IGNvbnRlbnQgPSBbXG5cdFx0XHRcdFx0Jy0tLScsXG5cdFx0XHRcdFx0J25hbWU6IFwiVGVzdEFnZW50XCInLFxuXHRcdFx0XHRcdCdkZXNjcmlwdGlvbjogXCJUZXN0IGFnZW50XCInLFxuXHRcdFx0XHRcdCdkaXNhYmxlLW1vZGVsLWludm9jYXRpb246IHRydWUnLFxuXHRcdFx0XHRcdCctLS0nLFxuXHRcdFx0XHRcdCdCb2R5Jyxcblx0XHRcdFx0XS5qb2luKCdcXG4nKTtcblx0XHRcdFx0Y29uc3QgbWFya2VycyA9IGF3YWl0IHZhbGlkYXRlKGNvbnRlbnQsIFByb21wdHNUeXBlLmFnZW50KTtcblx0XHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChtYXJrZXJzLCBbXSwgJ1ZhbGlkIGRpc2FibGUtbW9kZWwtaW52b2NhdGlvbjogdHJ1ZSBzaG91bGQgbm90IHByb2R1Y2UgZXJyb3JzJyk7XG5cdFx0XHR9XG5cblx0XHRcdC8vIFZhbGlkIGRpc2FibGUtbW9kZWwtaW52b2NhdGlvbjogZmFsc2Vcblx0XHRcdHtcblx0XHRcdFx0Y29uc3QgY29udGVudCA9IFtcblx0XHRcdFx0XHQnLS0tJyxcblx0XHRcdFx0XHQnbmFtZTogXCJUZXN0QWdlbnRcIicsXG5cdFx0XHRcdFx0J2Rlc2NyaXB0aW9uOiBcIlRlc3QgYWdlbnRcIicsXG5cdFx0XHRcdFx0J2Rpc2FibGUtbW9kZWwtaW52b2NhdGlvbjogZmFsc2UnLFxuXHRcdFx0XHRcdCctLS0nLFxuXHRcdFx0XHRcdCdCb2R5Jyxcblx0XHRcdFx0XS5qb2luKCdcXG4nKTtcblx0XHRcdFx0Y29uc3QgbWFya2VycyA9IGF3YWl0IHZhbGlkYXRlKGNvbnRlbnQsIFByb21wdHNUeXBlLmFnZW50KTtcblx0XHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChtYXJrZXJzLCBbXSwgJ1ZhbGlkIGRpc2FibGUtbW9kZWwtaW52b2NhdGlvbjogZmFsc2Ugc2hvdWxkIG5vdCBwcm9kdWNlIGVycm9ycycpO1xuXHRcdFx0fVxuXG5cdFx0XHQvLyBJbnZhbGlkIGRpc2FibGUtbW9kZWwtaW52b2NhdGlvbjogc3RyaW5nIHZhbHVlXG5cdFx0XHR7XG5cdFx0XHRcdGNvbnN0IGNvbnRlbnQgPSBbXG5cdFx0XHRcdFx0Jy0tLScsXG5cdFx0XHRcdFx0J25hbWU6IFwiVGVzdEFnZW50XCInLFxuXHRcdFx0XHRcdCdkZXNjcmlwdGlvbjogXCJUZXN0IGFnZW50XCInLFxuXHRcdFx0XHRcdCdkaXNhYmxlLW1vZGVsLWludm9jYXRpb246IFwieWVzXCInLFxuXHRcdFx0XHRcdCctLS0nLFxuXHRcdFx0XHRcdCdCb2R5Jyxcblx0XHRcdFx0XS5qb2luKCdcXG4nKTtcblx0XHRcdFx0Y29uc3QgbWFya2VycyA9IGF3YWl0IHZhbGlkYXRlKGNvbnRlbnQsIFByb21wdHNUeXBlLmFnZW50KTtcblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1hcmtlcnMubGVuZ3RoLCAxKTtcblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1hcmtlcnNbMF0uc2V2ZXJpdHksIE1hcmtlclNldmVyaXR5LkVycm9yKTtcblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1hcmtlcnNbMF0ubWVzc2FnZSwgYFRoZSAnZGlzYWJsZS1tb2RlbC1pbnZvY2F0aW9uJyBhdHRyaWJ1dGUgbXVzdCBiZSAndHJ1ZScgb3IgJ2ZhbHNlJy5gKTtcblx0XHRcdH1cblxuXHRcdFx0Ly8gSW52YWxpZCBkaXNhYmxlLW1vZGVsLWludm9jYXRpb246IG51bWJlciB2YWx1ZVxuXHRcdFx0e1xuXHRcdFx0XHRjb25zdCBjb250ZW50ID0gW1xuXHRcdFx0XHRcdCctLS0nLFxuXHRcdFx0XHRcdCduYW1lOiBcIlRlc3RBZ2VudFwiJyxcblx0XHRcdFx0XHQnZGVzY3JpcHRpb246IFwiVGVzdCBhZ2VudFwiJyxcblx0XHRcdFx0XHQnZGlzYWJsZS1tb2RlbC1pbnZvY2F0aW9uOiAwJyxcblx0XHRcdFx0XHQnLS0tJyxcblx0XHRcdFx0XHQnQm9keScsXG5cdFx0XHRcdF0uam9pbignXFxuJyk7XG5cdFx0XHRcdGNvbnN0IG1hcmtlcnMgPSBhd2FpdCB2YWxpZGF0ZShjb250ZW50LCBQcm9tcHRzVHlwZS5hZ2VudCk7XG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChtYXJrZXJzLmxlbmd0aCwgMSk7XG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChtYXJrZXJzWzBdLnNldmVyaXR5LCBNYXJrZXJTZXZlcml0eS5FcnJvcik7XG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChtYXJrZXJzWzBdLm1lc3NhZ2UsIGBUaGUgJ2Rpc2FibGUtbW9kZWwtaW52b2NhdGlvbicgYXR0cmlidXRlIG11c3QgYmUgJ3RydWUnIG9yICdmYWxzZScuYCk7XG5cdFx0XHR9XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdob29rcyAtIHZhbGlkIGhvb2sgY29tbWFuZHMnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCBjb250ZW50ID0gW1xuXHRcdFx0XHQnLS0tJyxcblx0XHRcdFx0J2Rlc2NyaXB0aW9uOiBcIlRlc3RcIicsXG5cdFx0XHRcdCdob29rczonLFxuXHRcdFx0XHQnICBTZXNzaW9uU3RhcnQ6Jyxcblx0XHRcdFx0JyAgICAtIHR5cGU6IGNvbW1hbmQnLFxuXHRcdFx0XHQnICAgICAgY29tbWFuZDogZWNobyBoZWxsbycsXG5cdFx0XHRcdCcgIFByZVRvb2xVc2U6Jyxcblx0XHRcdFx0JyAgICAtIHR5cGU6IGNvbW1hbmQnLFxuXHRcdFx0XHQnICAgICAgY29tbWFuZDogLi92YWxpZGF0ZS5zaCcsXG5cdFx0XHRcdCcgICAgICBjd2Q6IHNjcmlwdHMnLFxuXHRcdFx0XHQnICAgICAgdGltZW91dDogMzAnLFxuXHRcdFx0XHQnLS0tJyxcblx0XHRcdF0uam9pbignXFxuJyk7XG5cdFx0XHRjb25zdCBtYXJrZXJzID0gYXdhaXQgdmFsaWRhdGUoY29udGVudCwgUHJvbXB0c1R5cGUuYWdlbnQpO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChtYXJrZXJzLCBbXSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdob29rcyAtIG11c3QgYmUgYSBtYXAnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCBjb250ZW50ID0gW1xuXHRcdFx0XHQnLS0tJyxcblx0XHRcdFx0J2Rlc2NyaXB0aW9uOiBcIlRlc3RcIicsXG5cdFx0XHRcdCdob29rczogaW52YWxpZCcsXG5cdFx0XHRcdCctLS0nLFxuXHRcdFx0XS5qb2luKCdcXG4nKTtcblx0XHRcdGNvbnN0IG1hcmtlcnMgPSBhd2FpdCB2YWxpZGF0ZShjb250ZW50LCBQcm9tcHRzVHlwZS5hZ2VudCk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKFxuXHRcdFx0XHRtYXJrZXJzLm1hcChtID0+ICh7IHNldmVyaXR5OiBtLnNldmVyaXR5LCBtZXNzYWdlOiBtLm1lc3NhZ2UgfSkpLFxuXHRcdFx0XHRbXG5cdFx0XHRcdFx0eyBzZXZlcml0eTogTWFya2VyU2V2ZXJpdHkuRXJyb3IsIG1lc3NhZ2U6IGBUaGUgJ2hvb2tzJyBhdHRyaWJ1dGUgbXVzdCBiZSBhIG1hcCBvZiBob29rIGV2ZW50IHR5cGVzIHRvIGNvbW1hbmQgYXJyYXlzLmAgfSxcblx0XHRcdFx0XVxuXHRcdFx0KTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2hvb2tzIC0gdW5rbm93biBob29rIGV2ZW50IHR5cGUnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCBjb250ZW50ID0gW1xuXHRcdFx0XHQnLS0tJyxcblx0XHRcdFx0J2Rlc2NyaXB0aW9uOiBcIlRlc3RcIicsXG5cdFx0XHRcdCdob29rczonLFxuXHRcdFx0XHQnICBVbmtub3duRXZlbnQ6Jyxcblx0XHRcdFx0JyAgICAtIHR5cGU6IGNvbW1hbmQnLFxuXHRcdFx0XHQnICAgICAgY29tbWFuZDogZWNobyBoZWxsbycsXG5cdFx0XHRcdCctLS0nLFxuXHRcdFx0XS5qb2luKCdcXG4nKTtcblx0XHRcdGNvbnN0IG1hcmtlcnMgPSBhd2FpdCB2YWxpZGF0ZShjb250ZW50LCBQcm9tcHRzVHlwZS5hZ2VudCk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKFxuXHRcdFx0XHRtYXJrZXJzLm1hcChtID0+ICh7IHNldmVyaXR5OiBtLnNldmVyaXR5LCBtZXNzYWdlOiBtLm1lc3NhZ2UgfSkpLFxuXHRcdFx0XHRbXG5cdFx0XHRcdFx0eyBzZXZlcml0eTogTWFya2VyU2V2ZXJpdHkuV2FybmluZywgbWVzc2FnZTogYFVua25vd24gaG9vayBldmVudCB0eXBlICdVbmtub3duRXZlbnQnLiBTdXBwb3J0ZWQ6IFNlc3Npb25TdGFydCwgU2Vzc2lvbkVuZCwgVXNlclByb21wdFN1Ym1pdCwgUHJlVG9vbFVzZSwgUG9zdFRvb2xVc2UsIFByZUNvbXBhY3QsIFN1YmFnZW50U3RhcnQsIFN1YmFnZW50U3RvcCwgU3RvcCwgRXJyb3JPY2N1cnJlZC5gIH0sXG5cdFx0XHRcdF1cblx0XHRcdCk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdob29rcyAtIGhvb2sgdmFsdWUgbXVzdCBiZSBhcnJheScsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IGNvbnRlbnQgPSBbXG5cdFx0XHRcdCctLS0nLFxuXHRcdFx0XHQnZGVzY3JpcHRpb246IFwiVGVzdFwiJyxcblx0XHRcdFx0J2hvb2tzOicsXG5cdFx0XHRcdCcgIFNlc3Npb25TdGFydDogaW52YWxpZCcsXG5cdFx0XHRcdCctLS0nLFxuXHRcdFx0XS5qb2luKCdcXG4nKTtcblx0XHRcdGNvbnN0IG1hcmtlcnMgPSBhd2FpdCB2YWxpZGF0ZShjb250ZW50LCBQcm9tcHRzVHlwZS5hZ2VudCk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKFxuXHRcdFx0XHRtYXJrZXJzLm1hcChtID0+ICh7IHNldmVyaXR5OiBtLnNldmVyaXR5LCBtZXNzYWdlOiBtLm1lc3NhZ2UgfSkpLFxuXHRcdFx0XHRbXG5cdFx0XHRcdFx0eyBzZXZlcml0eTogTWFya2VyU2V2ZXJpdHkuRXJyb3IsIG1lc3NhZ2U6IGBIb29rIGV2ZW50ICdTZXNzaW9uU3RhcnQnIG11c3QgaGF2ZSBhbiBhcnJheSBvZiBjb21tYW5kIG9iamVjdHMgYXMgaXRzIHZhbHVlLmAgfSxcblx0XHRcdFx0XVxuXHRcdFx0KTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2hvb2tzIC0gY29tbWFuZCBpdGVtIG11c3QgYmUgb2JqZWN0JywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgY29udGVudCA9IFtcblx0XHRcdFx0Jy0tLScsXG5cdFx0XHRcdCdkZXNjcmlwdGlvbjogXCJUZXN0XCInLFxuXHRcdFx0XHQnaG9va3M6Jyxcblx0XHRcdFx0JyAgU2Vzc2lvblN0YXJ0OicsXG5cdFx0XHRcdCcgICAgLSBqdXN0IGEgc3RyaW5nJyxcblx0XHRcdFx0Jy0tLScsXG5cdFx0XHRdLmpvaW4oJ1xcbicpO1xuXHRcdFx0Y29uc3QgbWFya2VycyA9IGF3YWl0IHZhbGlkYXRlKGNvbnRlbnQsIFByb21wdHNUeXBlLmFnZW50KTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoXG5cdFx0XHRcdG1hcmtlcnMubWFwKG0gPT4gKHsgc2V2ZXJpdHk6IG0uc2V2ZXJpdHksIG1lc3NhZ2U6IG0ubWVzc2FnZSB9KSksXG5cdFx0XHRcdFtcblx0XHRcdFx0XHR7IHNldmVyaXR5OiBNYXJrZXJTZXZlcml0eS5FcnJvciwgbWVzc2FnZTogYEVhY2ggaG9vayBjb21tYW5kIG11c3QgYmUgYW4gb2JqZWN0LmAgfSxcblx0XHRcdFx0XVxuXHRcdFx0KTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2hvb2tzIC0gbWlzc2luZyB0eXBlIHByb3BlcnR5JywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgY29udGVudCA9IFtcblx0XHRcdFx0Jy0tLScsXG5cdFx0XHRcdCdkZXNjcmlwdGlvbjogXCJUZXN0XCInLFxuXHRcdFx0XHQnaG9va3M6Jyxcblx0XHRcdFx0JyAgU2Vzc2lvblN0YXJ0OicsXG5cdFx0XHRcdCcgICAgLSBjb21tYW5kOiBlY2hvIGhlbGxvJyxcblx0XHRcdFx0Jy0tLScsXG5cdFx0XHRdLmpvaW4oJ1xcbicpO1xuXHRcdFx0Y29uc3QgbWFya2VycyA9IGF3YWl0IHZhbGlkYXRlKGNvbnRlbnQsIFByb21wdHNUeXBlLmFnZW50KTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoXG5cdFx0XHRcdG1hcmtlcnMubWFwKG0gPT4gKHsgc2V2ZXJpdHk6IG0uc2V2ZXJpdHksIG1lc3NhZ2U6IG0ubWVzc2FnZSB9KSksXG5cdFx0XHRcdFtcblx0XHRcdFx0XHR7IHNldmVyaXR5OiBNYXJrZXJTZXZlcml0eS5FcnJvciwgbWVzc2FnZTogYEhvb2sgY29tbWFuZCBpcyBtaXNzaW5nIHJlcXVpcmVkIHByb3BlcnR5ICd0eXBlJy5gIH0sXG5cdFx0XHRcdF1cblx0XHRcdCk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdob29rcyAtIHR5cGUgbXVzdCBiZSBjb21tYW5kJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgY29udGVudCA9IFtcblx0XHRcdFx0Jy0tLScsXG5cdFx0XHRcdCdkZXNjcmlwdGlvbjogXCJUZXN0XCInLFxuXHRcdFx0XHQnaG9va3M6Jyxcblx0XHRcdFx0JyAgU2Vzc2lvblN0YXJ0OicsXG5cdFx0XHRcdCcgICAgLSB0eXBlOiBzY3JpcHQnLFxuXHRcdFx0XHQnICAgICAgY29tbWFuZDogZWNobyBoZWxsbycsXG5cdFx0XHRcdCctLS0nLFxuXHRcdFx0XS5qb2luKCdcXG4nKTtcblx0XHRcdGNvbnN0IG1hcmtlcnMgPSBhd2FpdCB2YWxpZGF0ZShjb250ZW50LCBQcm9tcHRzVHlwZS5hZ2VudCk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKFxuXHRcdFx0XHRtYXJrZXJzLm1hcChtID0+ICh7IHNldmVyaXR5OiBtLnNldmVyaXR5LCBtZXNzYWdlOiBtLm1lc3NhZ2UgfSkpLFxuXHRcdFx0XHRbXG5cdFx0XHRcdFx0eyBzZXZlcml0eTogTWFya2VyU2V2ZXJpdHkuRXJyb3IsIG1lc3NhZ2U6IGBUaGUgJ3R5cGUnIHByb3BlcnR5IGluIGEgaG9vayBjb21tYW5kIG11c3QgYmUgJ2NvbW1hbmQnLmAgfSxcblx0XHRcdFx0XVxuXHRcdFx0KTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2hvb2tzIC0gbWlzc2luZyBjb21tYW5kIGZpZWxkJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgY29udGVudCA9IFtcblx0XHRcdFx0Jy0tLScsXG5cdFx0XHRcdCdkZXNjcmlwdGlvbjogXCJUZXN0XCInLFxuXHRcdFx0XHQnaG9va3M6Jyxcblx0XHRcdFx0JyAgU2Vzc2lvblN0YXJ0OicsXG5cdFx0XHRcdCcgICAgLSB0eXBlOiBjb21tYW5kJyxcblx0XHRcdFx0Jy0tLScsXG5cdFx0XHRdLmpvaW4oJ1xcbicpO1xuXHRcdFx0Y29uc3QgbWFya2VycyA9IGF3YWl0IHZhbGlkYXRlKGNvbnRlbnQsIFByb21wdHNUeXBlLmFnZW50KTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoXG5cdFx0XHRcdG1hcmtlcnMubWFwKG0gPT4gKHsgc2V2ZXJpdHk6IG0uc2V2ZXJpdHksIG1lc3NhZ2U6IG0ubWVzc2FnZSB9KSksXG5cdFx0XHRcdFtcblx0XHRcdFx0XHR7IHNldmVyaXR5OiBNYXJrZXJTZXZlcml0eS5FcnJvciwgbWVzc2FnZTogYEhvb2sgY29tbWFuZCBtdXN0IHNwZWNpZnkgYXQgbGVhc3Qgb25lIG9mICdjb21tYW5kJywgJ3dpbmRvd3MnLCAnbGludXgnLCBvciAnb3N4Jy5gIH0sXG5cdFx0XHRcdF1cblx0XHRcdCk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdob29rcyAtIGVtcHR5IGNvbW1hbmQgc3RyaW5nJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgY29udGVudCA9IFtcblx0XHRcdFx0Jy0tLScsXG5cdFx0XHRcdCdkZXNjcmlwdGlvbjogXCJUZXN0XCInLFxuXHRcdFx0XHQnaG9va3M6Jyxcblx0XHRcdFx0JyAgU2Vzc2lvblN0YXJ0OicsXG5cdFx0XHRcdCcgICAgLSB0eXBlOiBjb21tYW5kJyxcblx0XHRcdFx0JyAgICAgIGNvbW1hbmQ6IFwiXCInLFxuXHRcdFx0XHQnLS0tJyxcblx0XHRcdF0uam9pbignXFxuJyk7XG5cdFx0XHRjb25zdCBtYXJrZXJzID0gYXdhaXQgdmFsaWRhdGUoY29udGVudCwgUHJvbXB0c1R5cGUuYWdlbnQpO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChcblx0XHRcdFx0bWFya2Vycy5tYXAobSA9PiAoeyBzZXZlcml0eTogbS5zZXZlcml0eSwgbWVzc2FnZTogbS5tZXNzYWdlIH0pKSxcblx0XHRcdFx0W1xuXHRcdFx0XHRcdHsgc2V2ZXJpdHk6IE1hcmtlclNldmVyaXR5LkVycm9yLCBtZXNzYWdlOiBgVGhlICdjb21tYW5kJyBwcm9wZXJ0eSBpbiBhIGhvb2sgY29tbWFuZCBtdXN0IGJlIGEgbm9uLWVtcHR5IHN0cmluZy5gIH0sXG5cdFx0XHRcdF1cblx0XHRcdCk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdob29rcyAtIHBsYXRmb3JtLXNwZWNpZmljIGNvbW1hbmRzIGFyZSB2YWxpZCcsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IGNvbnRlbnQgPSBbXG5cdFx0XHRcdCctLS0nLFxuXHRcdFx0XHQnZGVzY3JpcHRpb246IFwiVGVzdFwiJyxcblx0XHRcdFx0J2hvb2tzOicsXG5cdFx0XHRcdCcgIFNlc3Npb25TdGFydDonLFxuXHRcdFx0XHQnICAgIC0gdHlwZTogY29tbWFuZCcsXG5cdFx0XHRcdCcgICAgICB3aW5kb3dzOiBlY2hvIGhlbGxvJyxcblx0XHRcdFx0JyAgICAgIGxpbnV4OiBlY2hvIGhlbGxvJyxcblx0XHRcdFx0JyAgICAgIG9zeDogZWNobyBoZWxsbycsXG5cdFx0XHRcdCctLS0nLFxuXHRcdFx0XS5qb2luKCdcXG4nKTtcblx0XHRcdGNvbnN0IG1hcmtlcnMgPSBhd2FpdCB2YWxpZGF0ZShjb250ZW50LCBQcm9tcHRzVHlwZS5hZ2VudCk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKG1hcmtlcnMsIFtdKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2hvb2tzIC0gZW52IG11c3QgYmUgYSBtYXAgd2l0aCBzdHJpbmcgdmFsdWVzJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgY29udGVudCA9IFtcblx0XHRcdFx0Jy0tLScsXG5cdFx0XHRcdCdkZXNjcmlwdGlvbjogXCJUZXN0XCInLFxuXHRcdFx0XHQnaG9va3M6Jyxcblx0XHRcdFx0JyAgU2Vzc2lvblN0YXJ0OicsXG5cdFx0XHRcdCcgICAgLSB0eXBlOiBjb21tYW5kJyxcblx0XHRcdFx0JyAgICAgIGNvbW1hbmQ6IGVjaG8gaGVsbG8nLFxuXHRcdFx0XHQnICAgICAgZW52OiBpbnZhbGlkJyxcblx0XHRcdFx0Jy0tLScsXG5cdFx0XHRdLmpvaW4oJ1xcbicpO1xuXHRcdFx0Y29uc3QgbWFya2VycyA9IGF3YWl0IHZhbGlkYXRlKGNvbnRlbnQsIFByb21wdHNUeXBlLmFnZW50KTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoXG5cdFx0XHRcdG1hcmtlcnMubWFwKG0gPT4gKHsgc2V2ZXJpdHk6IG0uc2V2ZXJpdHksIG1lc3NhZ2U6IG0ubWVzc2FnZSB9KSksXG5cdFx0XHRcdFtcblx0XHRcdFx0XHR7IHNldmVyaXR5OiBNYXJrZXJTZXZlcml0eS5FcnJvciwgbWVzc2FnZTogYFRoZSAnZW52JyBwcm9wZXJ0eSBpbiBhIGhvb2sgY29tbWFuZCBtdXN0IGJlIGEgbWFwIG9mIHN0cmluZyB2YWx1ZXMuYCB9LFxuXHRcdFx0XHRdXG5cdFx0XHQpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnaG9va3MgLSB2YWxpZCBlbnYgbWFwJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgY29udGVudCA9IFtcblx0XHRcdFx0Jy0tLScsXG5cdFx0XHRcdCdkZXNjcmlwdGlvbjogXCJUZXN0XCInLFxuXHRcdFx0XHQnaG9va3M6Jyxcblx0XHRcdFx0JyAgU2Vzc2lvblN0YXJ0OicsXG5cdFx0XHRcdCcgICAgLSB0eXBlOiBjb21tYW5kJyxcblx0XHRcdFx0JyAgICAgIGNvbW1hbmQ6IGVjaG8gaGVsbG8nLFxuXHRcdFx0XHQnICAgICAgZW52OicsXG5cdFx0XHRcdCcgICAgICAgIE5PREVfRU5WOiBwcm9kdWN0aW9uJyxcblx0XHRcdFx0JyAgICAgICAgREVCVUc6IFwidHJ1ZVwiJyxcblx0XHRcdFx0Jy0tLScsXG5cdFx0XHRdLmpvaW4oJ1xcbicpO1xuXHRcdFx0Y29uc3QgbWFya2VycyA9IGF3YWl0IHZhbGlkYXRlKGNvbnRlbnQsIFByb21wdHNUeXBlLmFnZW50KTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwobWFya2VycywgW10pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnaG9va3MgLSB1bmtub3duIHByb3BlcnR5IHdhcm5zJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgY29udGVudCA9IFtcblx0XHRcdFx0Jy0tLScsXG5cdFx0XHRcdCdkZXNjcmlwdGlvbjogXCJUZXN0XCInLFxuXHRcdFx0XHQnaG9va3M6Jyxcblx0XHRcdFx0JyAgU2Vzc2lvblN0YXJ0OicsXG5cdFx0XHRcdCcgICAgLSB0eXBlOiBjb21tYW5kJyxcblx0XHRcdFx0JyAgICAgIGNvbW1hbmQ6IGVjaG8gaGVsbG8nLFxuXHRcdFx0XHQnICAgICAgdW5rbm93blByb3A6IHZhbHVlJyxcblx0XHRcdFx0Jy0tLScsXG5cdFx0XHRdLmpvaW4oJ1xcbicpO1xuXHRcdFx0Y29uc3QgbWFya2VycyA9IGF3YWl0IHZhbGlkYXRlKGNvbnRlbnQsIFByb21wdHNUeXBlLmFnZW50KTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoXG5cdFx0XHRcdG1hcmtlcnMubWFwKG0gPT4gKHsgc2V2ZXJpdHk6IG0uc2V2ZXJpdHksIG1lc3NhZ2U6IG0ubWVzc2FnZSB9KSksXG5cdFx0XHRcdFtcblx0XHRcdFx0XHR7IHNldmVyaXR5OiBNYXJrZXJTZXZlcml0eS5XYXJuaW5nLCBtZXNzYWdlOiBgVW5rbm93biBwcm9wZXJ0eSAndW5rbm93blByb3AnIGluIGhvb2sgY29tbWFuZC5gIH0sXG5cdFx0XHRcdF1cblx0XHRcdCk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdob29rcyAtIHRpbWVvdXQgbXVzdCBiZSBudW1iZXInLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCBjb250ZW50ID0gW1xuXHRcdFx0XHQnLS0tJyxcblx0XHRcdFx0J2Rlc2NyaXB0aW9uOiBcIlRlc3RcIicsXG5cdFx0XHRcdCdob29rczonLFxuXHRcdFx0XHQnICBTZXNzaW9uU3RhcnQ6Jyxcblx0XHRcdFx0JyAgICAtIHR5cGU6IGNvbW1hbmQnLFxuXHRcdFx0XHQnICAgICAgY29tbWFuZDogZWNobyBoZWxsbycsXG5cdFx0XHRcdCcgICAgICB0aW1lb3V0OiBub3QtYS1udW1iZXInLFxuXHRcdFx0XHQnLS0tJyxcblx0XHRcdF0uam9pbignXFxuJyk7XG5cdFx0XHRjb25zdCBtYXJrZXJzID0gYXdhaXQgdmFsaWRhdGUoY29udGVudCwgUHJvbXB0c1R5cGUuYWdlbnQpO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChcblx0XHRcdFx0bWFya2Vycy5tYXAobSA9PiAoeyBzZXZlcml0eTogbS5zZXZlcml0eSwgbWVzc2FnZTogbS5tZXNzYWdlIH0pKSxcblx0XHRcdFx0W1xuXHRcdFx0XHRcdHsgc2V2ZXJpdHk6IE1hcmtlclNldmVyaXR5LkVycm9yLCBtZXNzYWdlOiBgVGhlICd0aW1lb3V0JyBwcm9wZXJ0eSBpbiBhIGhvb2sgY29tbWFuZCBtdXN0IGJlIGEgbnVtYmVyLmAgfSxcblx0XHRcdFx0XVxuXHRcdFx0KTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2hvb2tzIC0gY3dkIG11c3QgYmUgc3RyaW5nJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgY29udGVudCA9IFtcblx0XHRcdFx0Jy0tLScsXG5cdFx0XHRcdCdkZXNjcmlwdGlvbjogXCJUZXN0XCInLFxuXHRcdFx0XHQnaG9va3M6Jyxcblx0XHRcdFx0JyAgU2Vzc2lvblN0YXJ0OicsXG5cdFx0XHRcdCcgICAgLSB0eXBlOiBjb21tYW5kJyxcblx0XHRcdFx0JyAgICAgIGNvbW1hbmQ6IGVjaG8gaGVsbG8nLFxuXHRcdFx0XHQnICAgICAgY3dkOicsXG5cdFx0XHRcdCcgICAgICAgIC0gYXJyYXknLFxuXHRcdFx0XHQnLS0tJyxcblx0XHRcdF0uam9pbignXFxuJyk7XG5cdFx0XHRjb25zdCBtYXJrZXJzID0gYXdhaXQgdmFsaWRhdGUoY29udGVudCwgUHJvbXB0c1R5cGUuYWdlbnQpO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChcblx0XHRcdFx0bWFya2Vycy5tYXAobSA9PiAoeyBzZXZlcml0eTogbS5zZXZlcml0eSwgbWVzc2FnZTogbS5tZXNzYWdlIH0pKSxcblx0XHRcdFx0W1xuXHRcdFx0XHRcdHsgc2V2ZXJpdHk6IE1hcmtlclNldmVyaXR5LkVycm9yLCBtZXNzYWdlOiBgVGhlICdjd2QnIHByb3BlcnR5IGluIGEgaG9vayBjb21tYW5kIG11c3QgYmUgYSBzdHJpbmcuYCB9LFxuXHRcdFx0XHRdXG5cdFx0XHQpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnaG9va3MgLSBtdWx0aXBsZSBlcnJvcnMgaW4gb25lIGNvbW1hbmQnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCBjb250ZW50ID0gW1xuXHRcdFx0XHQnLS0tJyxcblx0XHRcdFx0J2Rlc2NyaXB0aW9uOiBcIlRlc3RcIicsXG5cdFx0XHRcdCdob29rczonLFxuXHRcdFx0XHQnICBTZXNzaW9uU3RhcnQ6Jyxcblx0XHRcdFx0JyAgICAtIHR5cGU6IHNjcmlwdCcsXG5cdFx0XHRcdCcgICAgICB1bmtub3duUHJvcDogdmFsdWUnLFxuXHRcdFx0XHQnLS0tJyxcblx0XHRcdF0uam9pbignXFxuJyk7XG5cdFx0XHRjb25zdCBtYXJrZXJzID0gYXdhaXQgdmFsaWRhdGUoY29udGVudCwgUHJvbXB0c1R5cGUuYWdlbnQpO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChcblx0XHRcdFx0bWFya2Vycy5tYXAobSA9PiAoeyBzZXZlcml0eTogbS5zZXZlcml0eSwgbWVzc2FnZTogbS5tZXNzYWdlIH0pKSxcblx0XHRcdFx0W1xuXHRcdFx0XHRcdHsgc2V2ZXJpdHk6IE1hcmtlclNldmVyaXR5LkVycm9yLCBtZXNzYWdlOiBgVGhlICd0eXBlJyBwcm9wZXJ0eSBpbiBhIGhvb2sgY29tbWFuZCBtdXN0IGJlICdjb21tYW5kJy5gIH0sXG5cdFx0XHRcdFx0eyBzZXZlcml0eTogTWFya2VyU2V2ZXJpdHkuV2FybmluZywgbWVzc2FnZTogYFVua25vd24gcHJvcGVydHkgJ3Vua25vd25Qcm9wJyBpbiBob29rIGNvbW1hbmQuYCB9LFxuXHRcdFx0XHRcdHsgc2V2ZXJpdHk6IE1hcmtlclNldmVyaXR5LkVycm9yLCBtZXNzYWdlOiBgSG9vayBjb21tYW5kIG11c3Qgc3BlY2lmeSBhdCBsZWFzdCBvbmUgb2YgJ2NvbW1hbmQnLCAnd2luZG93cycsICdsaW51eCcsIG9yICdvc3gnLmAgfSxcblx0XHRcdFx0XVxuXHRcdFx0KTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2hvb2tzIC0gbmVzdGVkIG1hdGNoZXIgZm9ybWF0IGlzIHZhbGlkJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgY29udGVudCA9IFtcblx0XHRcdFx0Jy0tLScsXG5cdFx0XHRcdCdkZXNjcmlwdGlvbjogXCJUZXN0XCInLFxuXHRcdFx0XHQnaG9va3M6Jyxcblx0XHRcdFx0JyAgVXNlclByb21wdFN1Ym1pdDonLFxuXHRcdFx0XHQnICAgIC0gaG9va3M6Jyxcblx0XHRcdFx0JyAgICAgICAgLSB0eXBlOiBjb21tYW5kJyxcblx0XHRcdFx0JyAgICAgICAgICBjb21tYW5kOiBcImVjaG8gZm9vXCInLFxuXHRcdFx0XHQnLS0tJyxcblx0XHRcdF0uam9pbignXFxuJyk7XG5cdFx0XHRjb25zdCBtYXJrZXJzID0gYXdhaXQgdmFsaWRhdGUoY29udGVudCwgUHJvbXB0c1R5cGUuYWdlbnQpO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChtYXJrZXJzLCBbXSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdob29rcyAtIG5lc3RlZCBtYXRjaGVyIHZhbGlkYXRlcyBpbm5lciBjb21tYW5kcycsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IGNvbnRlbnQgPSBbXG5cdFx0XHRcdCctLS0nLFxuXHRcdFx0XHQnZGVzY3JpcHRpb246IFwiVGVzdFwiJyxcblx0XHRcdFx0J2hvb2tzOicsXG5cdFx0XHRcdCcgIFByZVRvb2xVc2U6Jyxcblx0XHRcdFx0JyAgICAtIG1hdGNoZXI6IEJhc2gnLFxuXHRcdFx0XHQnICAgICAgaG9va3M6Jyxcblx0XHRcdFx0JyAgICAgICAgLSB0eXBlOiBzY3JpcHQnLFxuXHRcdFx0XHQnICAgICAgICAgIGNvbW1hbmQ6IFwiZWNobyBmb29cIicsXG5cdFx0XHRcdCctLS0nLFxuXHRcdFx0XS5qb2luKCdcXG4nKTtcblx0XHRcdGNvbnN0IG1hcmtlcnMgPSBhd2FpdCB2YWxpZGF0ZShjb250ZW50LCBQcm9tcHRzVHlwZS5hZ2VudCk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKFxuXHRcdFx0XHRtYXJrZXJzLm1hcChtID0+ICh7IHNldmVyaXR5OiBtLnNldmVyaXR5LCBtZXNzYWdlOiBtLm1lc3NhZ2UgfSkpLFxuXHRcdFx0XHRbXG5cdFx0XHRcdFx0eyBzZXZlcml0eTogTWFya2VyU2V2ZXJpdHkuRXJyb3IsIG1lc3NhZ2U6IGBUaGUgJ3R5cGUnIHByb3BlcnR5IGluIGEgaG9vayBjb21tYW5kIG11c3QgYmUgJ2NvbW1hbmQnLmAgfSxcblx0XHRcdFx0XVxuXHRcdFx0KTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2hvb2tzIC0gbmVzdGVkIGhvb2tzIG11c3QgYmUgYXJyYXknLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCBjb250ZW50ID0gW1xuXHRcdFx0XHQnLS0tJyxcblx0XHRcdFx0J2Rlc2NyaXB0aW9uOiBcIlRlc3RcIicsXG5cdFx0XHRcdCdob29rczonLFxuXHRcdFx0XHQnICBQcmVUb29sVXNlOicsXG5cdFx0XHRcdCcgICAgLSBob29rczogaW52YWxpZCcsXG5cdFx0XHRcdCctLS0nLFxuXHRcdFx0XS5qb2luKCdcXG4nKTtcblx0XHRcdGNvbnN0IG1hcmtlcnMgPSBhd2FpdCB2YWxpZGF0ZShjb250ZW50LCBQcm9tcHRzVHlwZS5hZ2VudCk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKFxuXHRcdFx0XHRtYXJrZXJzLm1hcChtID0+ICh7IHNldmVyaXR5OiBtLnNldmVyaXR5LCBtZXNzYWdlOiBtLm1lc3NhZ2UgfSkpLFxuXHRcdFx0XHRbXG5cdFx0XHRcdFx0eyBzZXZlcml0eTogTWFya2VyU2V2ZXJpdHkuRXJyb3IsIG1lc3NhZ2U6IGBUaGUgJ2hvb2tzJyBwcm9wZXJ0eSBpbiBhIG1hdGNoZXIgbXVzdCBiZSBhbiBhcnJheSBvZiBjb21tYW5kIG9iamVjdHMuYCB9LFxuXHRcdFx0XHRdXG5cdFx0XHQpO1xuXHRcdH0pO1xuXHR9KTtcblxuXHRzdWl0ZSgnaW5zdHJ1Y3Rpb25zJywgKCkgPT4ge1xuXG5cdFx0dGVzdCgnaW5zdHJ1Y3Rpb25zIHZhbGlkJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgY29udGVudCA9IFtcblx0XHRcdFx0Jy0tLScsXG5cdFx0XHRcdCdkZXNjcmlwdGlvbjogXCJJbnN0clwiJyxcblx0XHRcdFx0J2FwcGx5VG86ICoudHMsKi5qcycsXG5cdFx0XHRcdCctLS0nLFxuXHRcdFx0XS5qb2luKCdcXG4nKTtcblx0XHRcdGNvbnN0IG1hcmtlcnMgPSBhd2FpdCB2YWxpZGF0ZShjb250ZW50LCBQcm9tcHRzVHlwZS5pbnN0cnVjdGlvbnMpO1xuXHRcdFx0YXNzZXJ0LmRlZXBFcXVhbChtYXJrZXJzLCBbXSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdpbnN0cnVjdGlvbnMgaW52YWxpZCBhcHBseVRvIHR5cGUnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCBjb250ZW50ID0gW1xuXHRcdFx0XHQnLS0tJyxcblx0XHRcdFx0J2Rlc2NyaXB0aW9uOiBcIkluc3RyXCInLFxuXHRcdFx0XHQnYXBwbHlUbzogW10nLFxuXHRcdFx0XHQnLS0tJyxcblx0XHRcdF0uam9pbignXFxuJyk7XG5cdFx0XHRjb25zdCBtYXJrZXJzID0gYXdhaXQgdmFsaWRhdGUoY29udGVudCwgUHJvbXB0c1R5cGUuaW5zdHJ1Y3Rpb25zKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChtYXJrZXJzLmxlbmd0aCwgMSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobWFya2Vyc1swXS5tZXNzYWdlLCBgVGhlICdhcHBseVRvJyBhdHRyaWJ1dGUgbXVzdCBiZSBhIHN0cmluZy5gKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2luc3RydWN0aW9ucyBpbnZhbGlkIGFwcGx5VG8gZ2xvYiAmIHVua25vd24gYXR0cmlidXRlJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgY29udGVudCA9IFtcblx0XHRcdFx0Jy0tLScsXG5cdFx0XHRcdCdkZXNjcmlwdGlvbjogXCJJbnN0clwiJyxcblx0XHRcdFx0YGFwcGx5VG86ICcnYCwgLy8gZW1wdHkgLT4gaW52YWxpZCBnbG9iXG5cdFx0XHRcdCdtb2RlbDogbWFlLTQnLCAvLyBtb2RlbCBub3QgYWxsb3dlZCBpbiBpbnN0cnVjdGlvbnNcblx0XHRcdFx0Jy0tLScsXG5cdFx0XHRdLmpvaW4oJ1xcbicpO1xuXHRcdFx0Y29uc3QgbWFya2VycyA9IGF3YWl0IHZhbGlkYXRlKGNvbnRlbnQsIFByb21wdHNUeXBlLmluc3RydWN0aW9ucyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobWFya2Vycy5sZW5ndGgsIDIpO1xuXHRcdFx0Ly8gT3JkZXI6IHVua25vd24gYXR0cmlidXRlIGhpbnRzIGZpcnN0IChhdHRyaWJ1dGUgaXRlcmF0aW9uKSB0aGVuIGFwcGx5VG8gdmFsaWRhdGlvblxuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1hcmtlcnNbMF0uc2V2ZXJpdHksIE1hcmtlclNldmVyaXR5LkhpbnQpO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChtYXJrZXJzWzBdLnRhZ3MsIFtNYXJrZXJUYWcuVW5uZWNlc3NhcnldKTtcblx0XHRcdGFzc2VydC5vayhtYXJrZXJzWzBdLm1lc3NhZ2Uuc3RhcnRzV2l0aChgQXR0cmlidXRlICdtb2RlbCcgaXMgbm90IHN1cHBvcnRlZCBpbiBpbnN0cnVjdGlvbnMgZmlsZXMuYCkpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1hcmtlcnNbMV0ubWVzc2FnZSwgYFRoZSAnYXBwbHlUbycgYXR0cmlidXRlIG11c3QgYmUgYSB2YWxpZCBnbG9iIHBhdHRlcm4uYCk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdpbnZhbGlkIGhlYWRlciBzdHJ1Y3R1cmUgKFlBTUwgYXJyYXkpJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgY29udGVudCA9IFtcblx0XHRcdFx0Jy0tLScsXG5cdFx0XHRcdCctIGl0ZW0xJyxcblx0XHRcdFx0Jy0tLScsXG5cdFx0XHRcdCdCb2R5Jyxcblx0XHRcdF0uam9pbignXFxuJyk7XG5cdFx0XHRjb25zdCBtYXJrZXJzID0gYXdhaXQgdmFsaWRhdGUoY29udGVudCwgUHJvbXB0c1R5cGUuaW5zdHJ1Y3Rpb25zKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChtYXJrZXJzLmxlbmd0aCwgMSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobWFya2Vyc1swXS5tZXNzYWdlLCAnSW52YWxpZCBoZWFkZXIsIGV4cGVjdGluZyA8a2V5OiB2YWx1ZT4gcGFpcnMnKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ25hbWUgYXR0cmlidXRlIHZhbGlkYXRpb24gaW4gaW5zdHJ1Y3Rpb25zJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Ly8gVmFsaWQgbmFtZVxuXHRcdFx0e1xuXHRcdFx0XHRjb25zdCBjb250ZW50ID0gW1xuXHRcdFx0XHRcdCctLS0nLFxuXHRcdFx0XHRcdCduYW1lOiBcIk15SW5zdHJ1Y3Rpb25zXCInLFxuXHRcdFx0XHRcdCdkZXNjcmlwdGlvbjogXCJUZXN0IGluc3RydWN0aW9uc1wiJyxcblx0XHRcdFx0XHQnYXBwbHlUbzogXCIqKi8qLnRzXCInLFxuXHRcdFx0XHRcdCctLS0nLFxuXHRcdFx0XHRcdCdCb2R5Jyxcblx0XHRcdFx0XS5qb2luKCdcXG4nKTtcblx0XHRcdFx0Y29uc3QgbWFya2VycyA9IGF3YWl0IHZhbGlkYXRlKGNvbnRlbnQsIFByb21wdHNUeXBlLmluc3RydWN0aW9ucyk7XG5cdFx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwobWFya2VycywgW10sICdWYWxpZCBuYW1lIHNob3VsZCBub3QgcHJvZHVjZSBlcnJvcnMnKTtcblx0XHRcdH1cblxuXHRcdFx0Ly8gRW1wdHkgbmFtZVxuXHRcdFx0e1xuXHRcdFx0XHRjb25zdCBjb250ZW50ID0gW1xuXHRcdFx0XHRcdCctLS0nLFxuXHRcdFx0XHRcdCduYW1lOiBcIlwiJyxcblx0XHRcdFx0XHQnZGVzY3JpcHRpb246IFwiVGVzdCBpbnN0cnVjdGlvbnNcIicsXG5cdFx0XHRcdFx0J2FwcGx5VG86IFwiKiovKi50c1wiJyxcblx0XHRcdFx0XHQnLS0tJyxcblx0XHRcdFx0XHQnQm9keScsXG5cdFx0XHRcdF0uam9pbignXFxuJyk7XG5cdFx0XHRcdGNvbnN0IG1hcmtlcnMgPSBhd2FpdCB2YWxpZGF0ZShjb250ZW50LCBQcm9tcHRzVHlwZS5pbnN0cnVjdGlvbnMpO1xuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobWFya2Vycy5sZW5ndGgsIDEpO1xuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobWFya2Vyc1swXS5zZXZlcml0eSwgTWFya2VyU2V2ZXJpdHkuRXJyb3IpO1xuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobWFya2Vyc1swXS5tZXNzYWdlLCBgVGhlICduYW1lJyBhdHRyaWJ1dGUgbXVzdCBub3QgYmUgZW1wdHkuYCk7XG5cdFx0XHR9XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHN1aXRlKCdwcm9tcHRzJywgKCkgPT4ge1xuXG5cdFx0dGVzdCgncHJvbXB0IHZhbGlkIHdpdGggYWdlbnQgbW9kZSAoZGVmYXVsdCkgYW5kIHRvb2xzIGFuZCBhIEJZTyBtb2RlbCcsIGFzeW5jICgpID0+IHtcblx0XHRcdC8vIG1vZGUgb21pdHRlZCAtPiBkZWZhdWx0cyB0byBBZ2VudDsgdG9vbHMrbW9kZWwgc2hvdWxkIHZhbGlkYXRlOyBtb2RlbCBNQUUgNCBpcyBhZ2VudCBjYXBhYmxlXG5cdFx0XHRjb25zdCBjb250ZW50ID0gW1xuXHRcdFx0XHQnLS0tJyxcblx0XHRcdFx0J2Rlc2NyaXB0aW9uOiBcIlByb21wdCB3aXRoIHRvb2xzXCInLFxuXHRcdFx0XHQnbW9kZWw6IE1BRSA0LjEnLFxuXHRcdFx0XHRgdG9vbHM6IFsndG9vbDEnLCd0b29sMiddYCxcblx0XHRcdFx0Jy0tLScsXG5cdFx0XHRcdCdCb2R5J1xuXHRcdFx0XS5qb2luKCdcXG4nKTtcblx0XHRcdGNvbnN0IG1hcmtlcnMgPSBhd2FpdCB2YWxpZGF0ZShjb250ZW50LCBQcm9tcHRzVHlwZS5wcm9tcHQpO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChtYXJrZXJzLCBbXSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdwcm9tcHQgbW9kZWwgbm90IHN1aXRlZCBmb3IgYWdlbnQgbW9kZScsIGFzeW5jICgpID0+IHtcblx0XHRcdC8vIE1BRSAzLjUgVHVyYm8gbGFja3MgYWdlbnRNb2RlIGNhcGFiaWxpdHkgLT4gd2FybmluZyB3aGVuIHVzZWQgaW4gYWdlbnQgKGRlZmF1bHQpXG5cdFx0XHRjb25zdCBjb250ZW50ID0gW1xuXHRcdFx0XHQnLS0tJyxcblx0XHRcdFx0J2Rlc2NyaXB0aW9uOiBcIlByb21wdCB3aXRoIHVuc3VpdGFibGUgbW9kZWxcIicsXG5cdFx0XHRcdCdtb2RlbDogTUFFIDMuNSBUdXJibycsXG5cdFx0XHRcdCctLS0nLFxuXHRcdFx0XHQnQm9keSdcblx0XHRcdF0uam9pbignXFxuJyk7XG5cdFx0XHRjb25zdCBtYXJrZXJzID0gYXdhaXQgdmFsaWRhdGUoY29udGVudCwgUHJvbXB0c1R5cGUucHJvbXB0KTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChtYXJrZXJzLmxlbmd0aCwgMSwgJ0V4cGVjdGVkIG9uZSB3YXJuaW5nIGFib3V0IHVuc3VpdGFibGUgbW9kZWwnKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChtYXJrZXJzWzBdLnNldmVyaXR5LCBNYXJrZXJTZXZlcml0eS5XYXJuaW5nKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChtYXJrZXJzWzBdLm1lc3NhZ2UsIGBNb2RlbCAnTUFFIDMuNSBUdXJibycgaXMgbm90IHN1aXRlZCBmb3IgYWdlbnQgbW9kZS5gKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3Byb21wdCB3aXRoIGN1c3RvbSBhZ2VudCBCZWFzdE1vZGUgYW5kIHRvb2xzJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Ly8gRXhwbGljaXQgY3VzdG9tIGFnZW50IHNob3VsZCBiZSByZWNvZ25pemVkOyBCZWFzdE1vZGUga2luZCBjb21lcyBmcm9tIHNldHVwOyBlbnN1cmUgdG9vbHMgYWNjZXB0ZWRcblx0XHRcdGNvbnN0IGNvbnRlbnQgPSBbXG5cdFx0XHRcdCctLS0nLFxuXHRcdFx0XHQnZGVzY3JpcHRpb246IFwiUHJvbXB0IGN1c3RvbSBtb2RlXCInLFxuXHRcdFx0XHQnYWdlbnQ6IEJlYXN0TW9kZScsXG5cdFx0XHRcdGB0b29sczogWyd0b29sMSddYCxcblx0XHRcdFx0Jy0tLScsXG5cdFx0XHRcdCdCb2R5J1xuXHRcdFx0XS5qb2luKCdcXG4nKTtcblx0XHRcdGNvbnN0IG1hcmtlcnMgPSBhd2FpdCB2YWxpZGF0ZShjb250ZW50LCBQcm9tcHRzVHlwZS5wcm9tcHQpO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChtYXJrZXJzLCBbXSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdwcm9tcHQgd2l0aCBjdXN0b20gbW9kZSBCZWFzdE1vZGUgYW5kIHRvb2xzJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Ly8gRXhwbGljaXQgY3VzdG9tIG1vZGUgc2hvdWxkIGJlIHJlY29nbml6ZWQ7IEJlYXN0TW9kZSBraW5kIGNvbWVzIGZyb20gc2V0dXA7IGVuc3VyZSB0b29scyBhY2NlcHRlZFxuXHRcdFx0Y29uc3QgY29udGVudCA9IFtcblx0XHRcdFx0Jy0tLScsXG5cdFx0XHRcdCdkZXNjcmlwdGlvbjogXCJQcm9tcHQgY3VzdG9tIG1vZGVcIicsXG5cdFx0XHRcdCdtb2RlOiBCZWFzdE1vZGUnLFxuXHRcdFx0XHRgdG9vbHM6IFsndG9vbDEnXWAsXG5cdFx0XHRcdCctLS0nLFxuXHRcdFx0XHQnQm9keSdcblx0XHRcdF0uam9pbignXFxuJyk7XG5cdFx0XHRjb25zdCBtYXJrZXJzID0gYXdhaXQgdmFsaWRhdGUoY29udGVudCwgUHJvbXB0c1R5cGUucHJvbXB0KTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChtYXJrZXJzLmxlbmd0aCwgMSk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKG1hcmtlcnMubWFwKG0gPT4gbS5tZXNzYWdlKSwgW2BUaGUgJ21vZGUnIGF0dHJpYnV0ZSBoYXMgYmVlbiBkZXByZWNhdGVkLiBQbGVhc2UgcmVuYW1lIGl0IHRvICdhZ2VudCcuYF0pO1xuXG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdwcm9tcHQgd2l0aCBjdXN0b20gbW9kZSBhbiBhZ2VudCcsIGFzeW5jICgpID0+IHtcblx0XHRcdC8vIEV4cGxpY2l0IGN1c3RvbSBtb2RlIHNob3VsZCBiZSByZWNvZ25pemVkOyBCZWFzdE1vZGUga2luZCBjb21lcyBmcm9tIHNldHVwOyBlbnN1cmUgdG9vbHMgYWNjZXB0ZWRcblx0XHRcdGNvbnN0IGNvbnRlbnQgPSBbXG5cdFx0XHRcdCctLS0nLFxuXHRcdFx0XHQnZGVzY3JpcHRpb246IFwiUHJvbXB0IGN1c3RvbSBtb2RlXCInLFxuXHRcdFx0XHQnbW9kZTogQmVhc3RNb2RlJyxcblx0XHRcdFx0YGFnZW50OiBhZ2VudGAsXG5cdFx0XHRcdCctLS0nLFxuXHRcdFx0XHQnQm9keSdcblx0XHRcdF0uam9pbignXFxuJyk7XG5cdFx0XHRjb25zdCBtYXJrZXJzID0gYXdhaXQgdmFsaWRhdGUoY29udGVudCwgUHJvbXB0c1R5cGUucHJvbXB0KTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChtYXJrZXJzLmxlbmd0aCwgMSk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKG1hcmtlcnMubWFwKG0gPT4gbS5tZXNzYWdlKSwgW2BUaGUgJ21vZGUnIGF0dHJpYnV0ZSBoYXMgYmVlbiBkZXByZWNhdGVkLiBUaGUgJ2FnZW50JyBhdHRyaWJ1dGUgaXMgdXNlZCBpbnN0ZWFkLmBdKTtcblxuXHRcdH0pO1xuXG5cdFx0dGVzdCgncHJvbXB0IHdpdGggdW5rbm93biBhZ2VudCBBc2snLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCBjb250ZW50ID0gW1xuXHRcdFx0XHQnLS0tJyxcblx0XHRcdFx0J2Rlc2NyaXB0aW9uOiBcIlByb21wdCB1bmtub3duIGFnZW50IEFza1wiJyxcblx0XHRcdFx0J2FnZW50OiBBc2snLFxuXHRcdFx0XHRgdG9vbHM6IFsndG9vbDEnLCd0b29sMiddYCxcblx0XHRcdFx0Jy0tLScsXG5cdFx0XHRcdCdCb2R5J1xuXHRcdFx0XS5qb2luKCdcXG4nKTtcblx0XHRcdGNvbnN0IG1hcmtlcnMgPSBhd2FpdCB2YWxpZGF0ZShjb250ZW50LCBQcm9tcHRzVHlwZS5wcm9tcHQpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1hcmtlcnMubGVuZ3RoLCAxLCAnRXhwZWN0ZWQgb25lIHdhcm5pbmcgYWJvdXQgdG9vbHMgaW4gbm9uLWFnZW50IG1vZGUnKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChtYXJrZXJzWzBdLnNldmVyaXR5LCBNYXJrZXJTZXZlcml0eS5XYXJuaW5nKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChtYXJrZXJzWzBdLm1lc3NhZ2UsIGBVbmtub3duIGFnZW50ICdBc2snLiBBdmFpbGFibGUgYWdlbnRzOiBhZ2VudCwgYXNrLCBlZGl0LCBCZWFzdE1vZGUuYCk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdwcm9tcHQgd2l0aCBhZ2VudCBlZGl0JywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgY29udGVudCA9IFtcblx0XHRcdFx0Jy0tLScsXG5cdFx0XHRcdCdkZXNjcmlwdGlvbjogXCJQcm9tcHQgZWRpdCBtb2RlIHdpdGggdG9vbFwiJyxcblx0XHRcdFx0J2FnZW50OiBlZGl0Jyxcblx0XHRcdFx0YHRvb2xzOiBbJ3Rvb2wxJ11gLFxuXHRcdFx0XHQnLS0tJyxcblx0XHRcdFx0J0JvZHknXG5cdFx0XHRdLmpvaW4oJ1xcbicpO1xuXHRcdFx0Y29uc3QgbWFya2VycyA9IGF3YWl0IHZhbGlkYXRlKGNvbnRlbnQsIFByb21wdHNUeXBlLnByb21wdCk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobWFya2Vycy5sZW5ndGgsIDEpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1hcmtlcnNbMF0uc2V2ZXJpdHksIE1hcmtlclNldmVyaXR5Lldhcm5pbmcpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1hcmtlcnNbMF0ubWVzc2FnZSwgYFRoZSAndG9vbHMnIGF0dHJpYnV0ZSBpcyBvbmx5IHN1cHBvcnRlZCB3aGVuIHVzaW5nIGFnZW50cy4gQXR0cmlidXRlIHdpbGwgYmUgaWdub3JlZC5gKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ25hbWUgYXR0cmlidXRlIHZhbGlkYXRpb24gaW4gcHJvbXB0cycsIGFzeW5jICgpID0+IHtcblx0XHRcdC8vIFZhbGlkIG5hbWVcblx0XHRcdHtcblx0XHRcdFx0Y29uc3QgY29udGVudCA9IFtcblx0XHRcdFx0XHQnLS0tJyxcblx0XHRcdFx0XHQnbmFtZTogXCJNeVByb21wdFwiJyxcblx0XHRcdFx0XHQnZGVzY3JpcHRpb246IFwiVGVzdCBwcm9tcHRcIicsXG5cdFx0XHRcdFx0Jy0tLScsXG5cdFx0XHRcdFx0J0JvZHknLFxuXHRcdFx0XHRdLmpvaW4oJ1xcbicpO1xuXHRcdFx0XHRjb25zdCBtYXJrZXJzID0gYXdhaXQgdmFsaWRhdGUoY29udGVudCwgUHJvbXB0c1R5cGUucHJvbXB0KTtcblx0XHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChtYXJrZXJzLCBbXSwgJ1ZhbGlkIG5hbWUgc2hvdWxkIG5vdCBwcm9kdWNlIGVycm9ycycpO1xuXHRcdFx0fVxuXG5cdFx0XHQvLyBFbXB0eSBuYW1lXG5cdFx0XHR7XG5cdFx0XHRcdGNvbnN0IGNvbnRlbnQgPSBbXG5cdFx0XHRcdFx0Jy0tLScsXG5cdFx0XHRcdFx0J25hbWU6IFwiXCInLFxuXHRcdFx0XHRcdCdkZXNjcmlwdGlvbjogXCJUZXN0IHByb21wdFwiJyxcblx0XHRcdFx0XHQnLS0tJyxcblx0XHRcdFx0XHQnQm9keScsXG5cdFx0XHRcdF0uam9pbignXFxuJyk7XG5cdFx0XHRcdGNvbnN0IG1hcmtlcnMgPSBhd2FpdCB2YWxpZGF0ZShjb250ZW50LCBQcm9tcHRzVHlwZS5wcm9tcHQpO1xuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobWFya2Vycy5sZW5ndGgsIDEpO1xuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobWFya2Vyc1swXS5zZXZlcml0eSwgTWFya2VyU2V2ZXJpdHkuRXJyb3IpO1xuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobWFya2Vyc1swXS5tZXNzYWdlLCBgVGhlICduYW1lJyBhdHRyaWJ1dGUgbXVzdCBub3QgYmUgZW1wdHkuYCk7XG5cdFx0XHR9XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHN1aXRlKCdib2R5JywgKCkgPT4ge1xuXHRcdHRlc3QoJ2JvZHkgd2l0aCBleGlzdGluZyBmaWxlIHJlZmVyZW5jZXMgYW5kIGtub3duIHRvb2xzIGhhcyBubyBtYXJrZXJzJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgY29udGVudCA9IFtcblx0XHRcdFx0Jy0tLScsXG5cdFx0XHRcdCdkZXNjcmlwdGlvbjogXCJSZWZzXCInLFxuXHRcdFx0XHQnLS0tJyxcblx0XHRcdFx0J0hlcmUgaXMgYSAjZmlsZTouL3JlZmVyZW5jZTEubWQgYW5kIGEgbWFya2Rvd24gW3JlZmVyZW5jZV0oLi9yZWZlcmVuY2UyLm1kKSBwbHVzIHZhcmlhYmxlcyAjdG9vbDEgYW5kICN0b29sMidcblx0XHRcdF0uam9pbignXFxuJyk7XG5cdFx0XHRjb25zdCBtYXJrZXJzID0gYXdhaXQgdmFsaWRhdGUoY29udGVudCwgUHJvbXB0c1R5cGUucHJvbXB0KTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwobWFya2VycywgW10sICdFeHBlY3RlZCBubyB2YWxpZGF0aW9uIGlzc3VlcycpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnYm9keSB3aXRoIG1pc3NpbmcgZmlsZSByZWZlcmVuY2VzIHJlcG9ydHMgd2FybmluZ3MnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCBjb250ZW50ID0gW1xuXHRcdFx0XHQnLS0tJyxcblx0XHRcdFx0J2Rlc2NyaXB0aW9uOiBcIk1pc3NpbmcgUmVmc1wiJyxcblx0XHRcdFx0Jy0tLScsXG5cdFx0XHRcdCdIZXJlIGlzIGEgI2ZpbGU6Li9taXNzaW5nMS5tZCBhbmQgYSBtYXJrZG93biBbbWlzc2luZyBsaW5rXSguL21pc3NpbmcyLm1kKS4nXG5cdFx0XHRdLmpvaW4oJ1xcbicpO1xuXHRcdFx0Y29uc3QgbWFya2VycyA9IGF3YWl0IHZhbGlkYXRlKGNvbnRlbnQsIFByb21wdHNUeXBlLnByb21wdCk7XG5cdFx0XHRjb25zdCBtZXNzYWdlcyA9IG1hcmtlcnMubWFwKG0gPT4gbS5tZXNzYWdlKS5zb3J0KCk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKG1lc3NhZ2VzLCBbXG5cdFx0XHRcdGBGaWxlICcuL21pc3NpbmcxLm1kJyBub3QgZm91bmQgYXQgJy9taXNzaW5nMS5tZCcuYCxcblx0XHRcdFx0YEZpbGUgJy4vbWlzc2luZzIubWQnIG5vdCBmb3VuZCBhdCAnL21pc3NpbmcyLm1kJy5gXG5cdFx0XHRdKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2JvZHkgd2l0aCBodHRwIGxpbmsnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCBjb250ZW50ID0gW1xuXHRcdFx0XHQnLS0tJyxcblx0XHRcdFx0J2Rlc2NyaXB0aW9uOiBcIkhUVFAgTGlua1wiJyxcblx0XHRcdFx0Jy0tLScsXG5cdFx0XHRcdCdIZXJlIGlzIGEgW2h0dHAgbGlua10oaHR0cDovL2V4YW1wbGUuY29tKS4nXG5cdFx0XHRdLmpvaW4oJ1xcbicpO1xuXHRcdFx0Y29uc3QgbWFya2VycyA9IGF3YWl0IHZhbGlkYXRlKGNvbnRlbnQsIFByb21wdHNUeXBlLnByb21wdCk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKG1hcmtlcnMsIFtdLCAnRXhwZWN0ZWQgbm8gdmFsaWRhdGlvbiBpc3N1ZXMnKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2JvZHkgd2l0aCB1cmwgbGluaycsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IG5vbkV4aXN0aW5nUmVmID0gZXhpc3RpbmdSZWYxLndpdGgoeyBwYXRoOiAnL25vbmV4aXN0aW5nJyB9KTtcblx0XHRcdGNvbnN0IGNvbnRlbnQgPSBbXG5cdFx0XHRcdCctLS0nLFxuXHRcdFx0XHQnZGVzY3JpcHRpb246IFwiVVJMIExpbmtzXCInLFxuXHRcdFx0XHQnLS0tJyxcblx0XHRcdFx0YEhlcmUgaXMgYSBbdXJsIGxpbmtdKCR7ZXhpc3RpbmdSZWYxLnRvU3RyaW5nKCl9KS5gLFxuXHRcdFx0XHRgSGVyZSBpcyBhIFt1cmwgbGlua10oJHtub25FeGlzdGluZ1JlZi50b1N0cmluZygpfSkuYFxuXHRcdFx0XS5qb2luKCdcXG4nKTtcblx0XHRcdGNvbnN0IG1hcmtlcnMgPSBhd2FpdCB2YWxpZGF0ZShjb250ZW50LCBQcm9tcHRzVHlwZS5wcm9tcHQpO1xuXHRcdFx0Y29uc3QgbWVzc2FnZXMgPSBtYXJrZXJzLm1hcChtID0+IG0ubWVzc2FnZSkuc29ydCgpO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChtZXNzYWdlcywgW1xuXHRcdFx0XHRgRmlsZSAnbXlGczovL3Rlc3Qvbm9uZXhpc3RpbmcnIG5vdCBmb3VuZCBhdCAnL25vbmV4aXN0aW5nJy5gLFxuXHRcdFx0XSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdib2R5IHdpdGggdW5rbm93biB0b29sIHZhcmlhYmxlIHJlZmVyZW5jZSBpcyBhbiB1bm5lY2Vzc2FyeSBoaW50JywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgY29udGVudCA9IFtcblx0XHRcdFx0Jy0tLScsXG5cdFx0XHRcdCdkZXNjcmlwdGlvbjogXCJVbmtub3duIHRvb2wgdmFyXCInLFxuXHRcdFx0XHQnLS0tJyxcblx0XHRcdFx0J1RoaXMgbGluZSByZWZlcmVuY2VzIGtub3duICN0b29sOnRvb2wxIGFuZCB1bmtub3duICN0b29sOnRvb2xYJ1xuXHRcdFx0XS5qb2luKCdcXG4nKTtcblx0XHRcdGNvbnN0IG1hcmtlcnMgPSBhd2FpdCB2YWxpZGF0ZShjb250ZW50LCBQcm9tcHRzVHlwZS5wcm9tcHQpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1hcmtlcnMubGVuZ3RoLCAxLCAnRXhwZWN0ZWQgb25lIGRpYWdub3N0aWMgZm9yIHVua25vd24gdG9vbCB2YXJpYWJsZScpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1hcmtlcnNbMF0uc2V2ZXJpdHksIE1hcmtlclNldmVyaXR5LkhpbnQpO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChtYXJrZXJzWzBdLnRhZ3MsIFtNYXJrZXJUYWcuVW5uZWNlc3NhcnldKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChtYXJrZXJzWzBdLm1lc3NhZ2UsIGBVbmtub3duIHRvb2wgb3IgdG9vbHNldCAndG9vbFgnLmApO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnYm9keSB3aXRoIHRvb2wgbm90IHByZXNlbnQgaW4gdG9vbHMgbGlzdCcsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IGNvbnRlbnQgPSBbXG5cdFx0XHRcdCctLS0nLFxuXHRcdFx0XHQndG9vbHM6IFtdJyxcblx0XHRcdFx0Jy0tLScsXG5cdFx0XHRcdCdJIG5lZWQnLFxuXHRcdFx0XHQnI3Rvb2w6bXMtYXp1cmV0b29scy52c2NvZGUtYXp1cmUtZ2l0aHViLWNvcGlsb3QvYXp1cmVfcmVjb21tZW5kX2N1c3RvbV9tb2RlcycsXG5cdFx0XHRcdCcjdG9vbDpnaXRodWIudnNjb2RlLXB1bGwtcmVxdWVzdC1naXRodWIvc3VnZ2VzdC1maXgnLFxuXHRcdFx0XHQnI3Rvb2w6b3BlblNpbXBsZUJyb3dzZXInLFxuXHRcdFx0XS5qb2luKCdcXG4nKTtcblx0XHRcdGNvbnN0IG1hcmtlcnMgPSBhd2FpdCB2YWxpZGF0ZShjb250ZW50LCBQcm9tcHRzVHlwZS5wcm9tcHQpO1xuXHRcdFx0Y29uc3QgYWN0dWFsID0gbWFya2Vycy5zb3J0KChhLCBiKSA9PiBhLnN0YXJ0TGluZU51bWJlciAtIGIuc3RhcnRMaW5lTnVtYmVyKS5tYXAobSA9PiAoeyBtZXNzYWdlOiBtLm1lc3NhZ2UsIHN0YXJ0Q29sdW1uOiBtLnN0YXJ0Q29sdW1uLCBlbmRDb2x1bW46IG0uZW5kQ29sdW1uIH0pKTtcblx0XHRcdGFzc2VydC5kZWVwRXF1YWwoYWN0dWFsLCBbXG5cdFx0XHRcdHsgbWVzc2FnZTogYFVua25vd24gZXh0ZW5zaW9uIHRvb2wgJ21zLWF6dXJldG9vbHMudnNjb2RlLWF6dXJlLWdpdGh1Yi1jb3BpbG90L2F6dXJlX3JlY29tbWVuZF9jdXN0b21fbW9kZXMnLiBJdCBpcyBsaWtlbHkgdG8gYmUgYSBtaXNzaW5nIGV4dGVuc2lvbiwgcGxlYXNlIGVuc3VyZSBpdCBpcyBpbnN0YWxsZWQgYW5kIGVuYWJsZWQuYCwgc3RhcnRDb2x1bW46IDcsIGVuZENvbHVtbjogNzcgfSxcblx0XHRcdFx0eyBtZXNzYWdlOiBgVG9vbCBvciB0b29sc2V0ICdnaXRodWIudnNjb2RlLXB1bGwtcmVxdWVzdC1naXRodWIvc3VnZ2VzdC1maXgnIGFsc28gbmVlZHMgdG8gYmUgZW5hYmxlZCBpbiB0aGUgaGVhZGVyLmAsIHN0YXJ0Q29sdW1uOiA3LCBlbmRDb2x1bW46IDUyIH0sXG5cdFx0XHRcdHsgbWVzc2FnZTogYFRvb2wgb3IgdG9vbHNldCAnb3BlblNpbXBsZUJyb3dzZXInIGhhcyBiZWVuIHJlbmFtZWQsIHVzZSAndnNjb2RlL29wZW5JbnRlZ3JhdGVkQnJvd3NlcicgaW5zdGVhZC5gLCBzdGFydENvbHVtbjogNywgZW5kQ29sdW1uOiAyNCB9LFxuXHRcdFx0XSk7XG5cdFx0fSk7XG5cblx0fSk7XG5cblx0c3VpdGUoJ3NraWxscycsICgpID0+IHtcblxuXHRcdHRlc3QoJ3NraWxsIG5hbWUgbWF0Y2hlcyBmb2xkZXIgbmFtZScsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IGNvbnRlbnQgPSBbXG5cdFx0XHRcdCctLS0nLFxuXHRcdFx0XHQnbmFtZTogbXktc2tpbGwnLFxuXHRcdFx0XHQnZGVzY3JpcHRpb246IFRlc3QgU2tpbGwnLFxuXHRcdFx0XHQnLS0tJyxcblx0XHRcdFx0J1RoaXMgaXMgYSBza2lsbC4nXG5cdFx0XHRdLmpvaW4oJ1xcbicpO1xuXHRcdFx0Y29uc3QgbWFya2VycyA9IGF3YWl0IHZhbGlkYXRlKGNvbnRlbnQsIFByb21wdHNUeXBlLnNraWxsLCBVUkkucGFyc2UoJ2ZpbGU6Ly8vLmdpdGh1Yi9za2lsbHMvbXktc2tpbGwvU0tJTEwubWQnKSk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKG1hcmtlcnMsIFtdLCAnRXhwZWN0ZWQgbm8gdmFsaWRhdGlvbiBpc3N1ZXMgd2hlbiBuYW1lIG1hdGNoZXMgZm9sZGVyJyk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdza2lsbCBuYW1lIGRvZXMgbm90IG1hdGNoIGZvbGRlciBuYW1lJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgY29udGVudCA9IFtcblx0XHRcdFx0Jy0tLScsXG5cdFx0XHRcdCduYW1lOiBkaWZmZXJlbnQtbmFtZScsXG5cdFx0XHRcdCdkZXNjcmlwdGlvbjogVGVzdCBTa2lsbCcsXG5cdFx0XHRcdCctLS0nLFxuXHRcdFx0XHQnVGhpcyBpcyBhIHNraWxsLidcblx0XHRcdF0uam9pbignXFxuJyk7XG5cdFx0XHRjb25zdCBtYXJrZXJzID0gYXdhaXQgdmFsaWRhdGUoY29udGVudCwgUHJvbXB0c1R5cGUuc2tpbGwsIFVSSS5wYXJzZSgnZmlsZTovLy8uZ2l0aHViL3NraWxscy9teS1za2lsbC9TS0lMTC5tZCcpKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChtYXJrZXJzLmxlbmd0aCwgMSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobWFya2Vyc1swXS5zZXZlcml0eSwgTWFya2VyU2V2ZXJpdHkuV2FybmluZyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobWFya2Vyc1swXS5tZXNzYWdlLCBgVGhlIHNraWxsIG5hbWUgJ2RpZmZlcmVudC1uYW1lJyBzaG91bGQgbWF0Y2ggdGhlIGZvbGRlciBuYW1lICdteS1za2lsbCcuYCk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdza2lsbCB3aXRob3V0IG5hbWUgYXR0cmlidXRlIHNob3VsZCB3YXJuJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgY29udGVudCA9IFtcblx0XHRcdFx0Jy0tLScsXG5cdFx0XHRcdCdkZXNjcmlwdGlvbjogVGVzdCBTa2lsbCcsXG5cdFx0XHRcdCctLS0nLFxuXHRcdFx0XHQnVGhpcyBpcyBhIHNraWxsIHdpdGhvdXQgYSBuYW1lLidcblx0XHRcdF0uam9pbignXFxuJyk7XG5cdFx0XHRjb25zdCBtYXJrZXJzID0gYXdhaXQgdmFsaWRhdGUoY29udGVudCwgUHJvbXB0c1R5cGUuc2tpbGwsIFVSSS5wYXJzZSgnZmlsZTovLy8uZ2l0aHViL3NraWxscy9teS1za2lsbC9TS0lMTC5tZCcpKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChtYXJrZXJzLmxlbmd0aCwgMSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobWFya2Vyc1swXS5zZXZlcml0eSwgTWFya2VyU2V2ZXJpdHkuV2FybmluZyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobWFya2Vyc1swXS5tZXNzYWdlLCAnU2tpbGwgc2hvdWxkIHByb3ZpZGUgYSBuYW1lLicpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnc2tpbGwgd2l0aG91dCBmcm9udG1hdHRlciBzaG91bGQgbm90IHdhcm4gYWJvdXQgbWlzc2luZyBuYW1lIG9yIGRlc2NyaXB0aW9uJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgY29udGVudCA9ICdUaGlzIGlzIGEgc2tpbGwgd2l0aG91dCBhbnkgZnJvbnRtYXR0ZXIuJztcblx0XHRcdGNvbnN0IG1hcmtlcnMgPSBhd2FpdCB2YWxpZGF0ZShjb250ZW50LCBQcm9tcHRzVHlwZS5za2lsbCwgVVJJLnBhcnNlKCdmaWxlOi8vLy5naXRodWIvc2tpbGxzL215LXNraWxsL1NLSUxMLm1kJykpO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChtYXJrZXJzLCBbXSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdza2lsbCB3aXRoIGVtcHR5IG5hbWUgc2hvdWxkIGVycm9yJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgY29udGVudCA9IFtcblx0XHRcdFx0Jy0tLScsXG5cdFx0XHRcdCduYW1lOiBcIlwiJyxcblx0XHRcdFx0J2Rlc2NyaXB0aW9uOiBUZXN0IFNraWxsJyxcblx0XHRcdFx0Jy0tLScsXG5cdFx0XHRcdCdUaGlzIGlzIGEgc2tpbGwuJ1xuXHRcdFx0XS5qb2luKCdcXG4nKTtcblx0XHRcdGNvbnN0IG1hcmtlcnMgPSBhd2FpdCB2YWxpZGF0ZShjb250ZW50LCBQcm9tcHRzVHlwZS5za2lsbCwgVVJJLnBhcnNlKCdmaWxlOi8vLy5naXRodWIvc2tpbGxzL215LXNraWxsL1NLSUxMLm1kJykpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1hcmtlcnMubGVuZ3RoLCAxKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChtYXJrZXJzWzBdLnNldmVyaXR5LCBNYXJrZXJTZXZlcml0eS5FcnJvcik7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobWFya2Vyc1swXS5tZXNzYWdlLCBgVGhlICduYW1lJyBhdHRyaWJ1dGUgbXVzdCBub3QgYmUgZW1wdHkuYCk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdza2lsbCB3aXRob3V0IGRlc2NyaXB0aW9uIGF0dHJpYnV0ZSBzaG91bGQgd2FybicsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IGNvbnRlbnQgPSBbXG5cdFx0XHRcdCctLS0nLFxuXHRcdFx0XHQnbmFtZTogbXktc2tpbGwnLFxuXHRcdFx0XHQnLS0tJyxcblx0XHRcdFx0J1RoaXMgaXMgYSBza2lsbCB3aXRob3V0IGEgZGVzY3JpcHRpb24uJ1xuXHRcdFx0XS5qb2luKCdcXG4nKTtcblx0XHRcdGNvbnN0IG1hcmtlcnMgPSBhd2FpdCB2YWxpZGF0ZShjb250ZW50LCBQcm9tcHRzVHlwZS5za2lsbCwgVVJJLnBhcnNlKCdmaWxlOi8vLy5naXRodWIvc2tpbGxzL215LXNraWxsL1NLSUxMLm1kJykpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1hcmtlcnMubGVuZ3RoLCAxKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChtYXJrZXJzWzBdLnNldmVyaXR5LCBNYXJrZXJTZXZlcml0eS5XYXJuaW5nKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChtYXJrZXJzWzBdLm1lc3NhZ2UsICdTa2lsbCBzaG91bGQgcHJvdmlkZSBhIGRlc2NyaXB0aW9uLicpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnc2tpbGwgd2l0aG91dCBkZXNjcmlwdGlvbiBidXQgd2l0aCB1c2VyLWludm9jYWJsZSBmYWxzZSBzaG91bGQgZXJyb3Igb24gdGhhdCBhdHRyaWJ1dGUnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCBjb250ZW50ID0gW1xuXHRcdFx0XHQnLS0tJyxcblx0XHRcdFx0J25hbWU6IG15LXNraWxsJyxcblx0XHRcdFx0J3VzZXItaW52b2NhYmxlOiBmYWxzZScsXG5cdFx0XHRcdCctLS0nLFxuXHRcdFx0XHQnVGhpcyBpcyBhIHNraWxsLidcblx0XHRcdF0uam9pbignXFxuJyk7XG5cdFx0XHRjb25zdCBtYXJrZXJzID0gYXdhaXQgdmFsaWRhdGUoY29udGVudCwgUHJvbXB0c1R5cGUuc2tpbGwsIFVSSS5wYXJzZSgnZmlsZTovLy8uZ2l0aHViL3NraWxscy9teS1za2lsbC9TS0lMTC5tZCcpKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChtYXJrZXJzLmxlbmd0aCwgMik7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobWFya2Vyc1swXS5zZXZlcml0eSwgTWFya2VyU2V2ZXJpdHkuV2FybmluZyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobWFya2Vyc1swXS5tZXNzYWdlLCAnU2tpbGwgc2hvdWxkIHByb3ZpZGUgYSBkZXNjcmlwdGlvbi4nKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChtYXJrZXJzWzFdLnNldmVyaXR5LCBNYXJrZXJTZXZlcml0eS5FcnJvcik7XG5cdFx0XHRhc3NlcnQub2sobWFya2Vyc1sxXS5tZXNzYWdlLmluY2x1ZGVzKCdkZXNjcmlwdGlvbiBpcyByZXF1aXJlZCB3aGVuIHVzZXItaW52b2NhYmxlIGlzIGZhbHNlJykpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnc2tpbGwgd2l0aG91dCBkZXNjcmlwdGlvbiBidXQgd2l0aCBkaXNhYmxlLW1vZGVsLWludm9jYXRpb24gZmFsc2Ugc2hvdWxkIGVycm9yIG9uIHRoYXQgYXR0cmlidXRlJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgY29udGVudCA9IFtcblx0XHRcdFx0Jy0tLScsXG5cdFx0XHRcdCduYW1lOiBteS1za2lsbCcsXG5cdFx0XHRcdCdkaXNhYmxlLW1vZGVsLWludm9jYXRpb246IGZhbHNlJyxcblx0XHRcdFx0Jy0tLScsXG5cdFx0XHRcdCdUaGlzIGlzIGEgc2tpbGwuJ1xuXHRcdFx0XS5qb2luKCdcXG4nKTtcblx0XHRcdGNvbnN0IG1hcmtlcnMgPSBhd2FpdCB2YWxpZGF0ZShjb250ZW50LCBQcm9tcHRzVHlwZS5za2lsbCwgVVJJLnBhcnNlKCdmaWxlOi8vLy5naXRodWIvc2tpbGxzL215LXNraWxsL1NLSUxMLm1kJykpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1hcmtlcnMubGVuZ3RoLCAyKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChtYXJrZXJzWzBdLnNldmVyaXR5LCBNYXJrZXJTZXZlcml0eS5XYXJuaW5nKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChtYXJrZXJzWzBdLm1lc3NhZ2UsICdTa2lsbCBzaG91bGQgcHJvdmlkZSBhIGRlc2NyaXB0aW9uLicpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1hcmtlcnNbMV0uc2V2ZXJpdHksIE1hcmtlclNldmVyaXR5LkVycm9yKTtcblx0XHRcdGFzc2VydC5vayhtYXJrZXJzWzFdLm1lc3NhZ2UuaW5jbHVkZXMoJ2Rlc2NyaXB0aW9uIGlzIHJlcXVpcmVkIHdoZW4gbW9kZWwgaW52b2NhdGlvbiBpcyBlbmFibGVkJykpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnc2tpbGwgd2l0aCBlbXB0eSBkZXNjcmlwdGlvbiBzaG91bGQgZXJyb3InLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCBjb250ZW50ID0gW1xuXHRcdFx0XHQnLS0tJyxcblx0XHRcdFx0J25hbWU6IG15LXNraWxsJyxcblx0XHRcdFx0J2Rlc2NyaXB0aW9uOiBcIlwiJyxcblx0XHRcdFx0Jy0tLScsXG5cdFx0XHRcdCdUaGlzIGlzIGEgc2tpbGwuJ1xuXHRcdFx0XS5qb2luKCdcXG4nKTtcblx0XHRcdGNvbnN0IG1hcmtlcnMgPSBhd2FpdCB2YWxpZGF0ZShjb250ZW50LCBQcm9tcHRzVHlwZS5za2lsbCwgVVJJLnBhcnNlKCdmaWxlOi8vLy5naXRodWIvc2tpbGxzL215LXNraWxsL1NLSUxMLm1kJykpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1hcmtlcnMubGVuZ3RoLCAxKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChtYXJrZXJzWzBdLnNldmVyaXR5LCBNYXJrZXJTZXZlcml0eS5FcnJvcik7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobWFya2Vyc1swXS5tZXNzYWdlLCBgVGhlICdkZXNjcmlwdGlvbicgYXR0cmlidXRlIHNob3VsZCBub3QgYmUgZW1wdHkuYCk7XG5cdFx0fSk7XG5cblxuXHRcdHRlc3QoJ3NraWxsIG5hbWUgd2l0aCBpbnZhbGlkIGNoYXJhY3RlcnMgc2hvdWxkIGVycm9yJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgY29udGVudCA9IFtcblx0XHRcdFx0Jy0tLScsXG5cdFx0XHRcdCduYW1lOiBNeSBTa2lsbCcsXG5cdFx0XHRcdCdkZXNjcmlwdGlvbjogVGVzdCBTa2lsbCcsXG5cdFx0XHRcdCctLS0nLFxuXHRcdFx0XHQnVGhpcyBpcyBhIHNraWxsLidcblx0XHRcdF0uam9pbignXFxuJyk7XG5cdFx0XHRjb25zdCBtYXJrZXJzID0gYXdhaXQgdmFsaWRhdGUoY29udGVudCwgUHJvbXB0c1R5cGUuc2tpbGwsIFVSSS5wYXJzZSgnZmlsZTovLy8uZ2l0aHViL3NraWxscy9teS1za2lsbC9TS0lMTC5tZCcpKTtcblx0XHRcdGFzc2VydC5vayhtYXJrZXJzLnNvbWUobSA9PiBtLnNldmVyaXR5ID09PSBNYXJrZXJTZXZlcml0eS5FcnJvciAmJiBtLm1lc3NhZ2UgPT09ICdTa2lsbCBuYW1lIG1heSBvbmx5IGNvbnRhaW4gbG93ZXJjYXNlIGxldHRlcnMsIG51bWJlcnMsIGFuZCBoeXBoZW5zLicpKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3NraWxsIG5hbWUgd2l0aCB3aGl0ZXNwYWNlIHRyaW1tZWQgbWF0Y2hlcyBmb2xkZXIgbmFtZScsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IGNvbnRlbnQgPSBbXG5cdFx0XHRcdCctLS0nLFxuXHRcdFx0XHQnbmFtZTogXCIgIG15LXNraWxsICBcIicsXG5cdFx0XHRcdCdkZXNjcmlwdGlvbjogVGVzdCBTa2lsbCcsXG5cdFx0XHRcdCctLS0nLFxuXHRcdFx0XHQnVGhpcyBpcyBhIHNraWxsLidcblx0XHRcdF0uam9pbignXFxuJyk7XG5cdFx0XHRjb25zdCBtYXJrZXJzID0gYXdhaXQgdmFsaWRhdGUoY29udGVudCwgUHJvbXB0c1R5cGUuc2tpbGwsIFVSSS5wYXJzZSgnZmlsZTovLy8uZ2l0aHViL3NraWxscy9teS1za2lsbC9TS0lMTC5tZCcpKTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwobWFya2VycywgW10sICdFeHBlY3RlZCBubyB2YWxpZGF0aW9uIGlzc3VlcyB3aGVuIHRyaW1tZWQgbmFtZSBtYXRjaGVzIGZvbGRlcicpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnc2tpbGwgbmFtZSB2YWxpZGF0aW9uIHdpdGggZGlmZmVyZW50IGZvbGRlciBkZXB0aHMnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHQvLyBUZXN0IHdpdGggZGVlcGVyIHBhdGggc3RydWN0dXJlXG5cdFx0XHR7XG5cdFx0XHRcdGNvbnN0IGNvbnRlbnQgPSBbXG5cdFx0XHRcdFx0Jy0tLScsXG5cdFx0XHRcdFx0J25hbWU6IGFkdmFuY2VkLXNraWxsJyxcblx0XHRcdFx0XHQnZGVzY3JpcHRpb246IFRlc3QgU2tpbGwnLFxuXHRcdFx0XHRcdCctLS0nLFxuXHRcdFx0XHRcdCdUaGlzIGlzIGEgc2tpbGwuJ1xuXHRcdFx0XHRdLmpvaW4oJ1xcbicpO1xuXHRcdFx0XHRjb25zdCBtYXJrZXJzID0gYXdhaXQgdmFsaWRhdGUoY29udGVudCwgUHJvbXB0c1R5cGUuc2tpbGwsIFVSSS5wYXJzZSgnZmlsZTovLy9ob21lL3VzZXIvLmdpdGh1Yi9za2lsbHMvYWR2YW5jZWQtc2tpbGwvU0tJTEwubWQnKSk7XG5cdFx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwobWFya2VycywgW10sICdFeHBlY3RlZCBubyBpc3N1ZXMgZm9yIGRlZXBlciBwYXRoIHdoZW4gbmFtZSBtYXRjaGVzJyk7XG5cdFx0XHR9XG5cblx0XHRcdC8vIFRlc3Qgd2l0aCBtaXNtYXRjaCBpbiBkZWVwZXIgcGF0aFxuXHRcdFx0e1xuXHRcdFx0XHRjb25zdCBjb250ZW50ID0gW1xuXHRcdFx0XHRcdCctLS0nLFxuXHRcdFx0XHRcdCduYW1lOiB3cm9uZy1uYW1lJyxcblx0XHRcdFx0XHQnZGVzY3JpcHRpb246IFRlc3QgU2tpbGwnLFxuXHRcdFx0XHRcdCctLS0nLFxuXHRcdFx0XHRcdCdUaGlzIGlzIGEgc2tpbGwuJ1xuXHRcdFx0XHRdLmpvaW4oJ1xcbicpO1xuXHRcdFx0XHRjb25zdCBtYXJrZXJzID0gYXdhaXQgdmFsaWRhdGUoY29udGVudCwgUHJvbXB0c1R5cGUuc2tpbGwsIFVSSS5wYXJzZSgnZmlsZTovLy9ob21lL3VzZXIvLmdpdGh1Yi9za2lsbHMvY29ycmVjdC1mb2xkZXIvU0tJTEwubWQnKSk7XG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChtYXJrZXJzLmxlbmd0aCwgMSk7XG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChtYXJrZXJzWzBdLm1lc3NhZ2UsIGBUaGUgc2tpbGwgbmFtZSAnd3JvbmctbmFtZScgc2hvdWxkIG1hdGNoIHRoZSBmb2xkZXIgbmFtZSAnY29ycmVjdC1mb2xkZXInLmApO1xuXHRcdFx0fVxuXHRcdH0pO1xuXG5cdFx0dGVzdCgnc2tpbGwgbmFtZSB2YWxpZGF0aW9uIHdpdGggc3BlY2lhbCBjaGFyYWN0ZXJzIGluIGZvbGRlcicsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IGNvbnRlbnQgPSBbXG5cdFx0XHRcdCctLS0nLFxuXHRcdFx0XHQnbmFtZTogbXlfc3BlY2lhbC1za2lsbC52MicsXG5cdFx0XHRcdCdkZXNjcmlwdGlvbjogVGVzdCBTa2lsbCcsXG5cdFx0XHRcdCctLS0nLFxuXHRcdFx0XHQnVGhpcyBpcyBhIHNraWxsLidcblx0XHRcdF0uam9pbignXFxuJyk7XG5cdFx0XHRjb25zdCBtYXJrZXJzID0gYXdhaXQgdmFsaWRhdGUoY29udGVudCwgUHJvbXB0c1R5cGUuc2tpbGwsIFVSSS5wYXJzZSgnZmlsZTovLy8uZ2l0aHViL3NraWxscy9teV9zcGVjaWFsLXNraWxsLnYyL1NLSUxMLm1kJykpO1xuXHRcdFx0YXNzZXJ0Lm9rKG1hcmtlcnMuc29tZShtID0+IG0uc2V2ZXJpdHkgPT09IE1hcmtlclNldmVyaXR5LkVycm9yICYmIG0ubWVzc2FnZSA9PT0gJ1NraWxsIG5hbWUgbWF5IG9ubHkgY29udGFpbiBsb3dlcmNhc2UgbGV0dGVycywgbnVtYmVycywgYW5kIGh5cGhlbnMuJyksICdFeHBlY3RlZCBlcnJvciBmb3IgaW52YWxpZCBjaGFyYWN0ZXJzIGluIHNraWxsIG5hbWUnKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3NraWxsIHdpdGggbm9uLXN0cmluZyBuYW1lIHR5cGUgZG9lcyBub3QgdmFsaWRhdGUgZm9sZGVyIG1hdGNoJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgY29udGVudCA9IFtcblx0XHRcdFx0Jy0tLScsXG5cdFx0XHRcdCduYW1lOiBbXScsXG5cdFx0XHRcdCdkZXNjcmlwdGlvbjogVGVzdCBTa2lsbCcsXG5cdFx0XHRcdCctLS0nLFxuXHRcdFx0XHQnVGhpcyBpcyBhIHNraWxsLidcblx0XHRcdF0uam9pbignXFxuJyk7XG5cdFx0XHRjb25zdCBtYXJrZXJzID0gYXdhaXQgdmFsaWRhdGUoY29udGVudCwgUHJvbXB0c1R5cGUuc2tpbGwsIFVSSS5wYXJzZSgnZmlsZTovLy8uZ2l0aHViL3NraWxscy9teS1za2lsbC9TS0lMTC5tZCcpKTtcblx0XHRcdC8vIFNob3VsZCBnZXQgZXJyb3IgZm9yIG5vbi1zdHJpbmcgbmFtZSB0eXBlLCBidXQgbm8gZm9sZGVyIG1pc21hdGNoIHdhcm5pbmdcblx0XHRcdGFzc2VydC5vayhtYXJrZXJzLnNvbWUobSA9PiBtLm1lc3NhZ2UuaW5jbHVkZXMoJ211c3QgYmUgYSBzdHJpbmcnKSksICdFeHBlY3RlZCBlcnJvciBmb3Igbm9uLXN0cmluZyBuYW1lJyk7XG5cdFx0XHRhc3NlcnQub2soIW1hcmtlcnMuc29tZShtID0+IG0ubWVzc2FnZS5pbmNsdWRlcygnc2hvdWxkIG1hdGNoIHRoZSBmb2xkZXIgbmFtZScpKSwgJ1Nob3VsZCBub3Qgd2FybiBhYm91dCBmb2xkZXIgbWlzbWF0Y2ggZm9yIG5vbi1zdHJpbmcgbmFtZScpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnc2tpbGwgZm9sZGVyIG5hbWUgdmFsaWRhdGlvbiBvbmx5IGZvciBza2lsbCB0eXBlJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Ly8gVmVyaWZ5IHRoYXQgZm9sZGVyIG5hbWUgdmFsaWRhdGlvbiBkb2Vzbid0IHJ1biBmb3Igbm9uLXNraWxsIHByb21wdCB0eXBlc1xuXHRcdFx0Y29uc3QgY29udGVudCA9IFtcblx0XHRcdFx0Jy0tLScsXG5cdFx0XHRcdCduYW1lOiBkaWZmZXJlbnQtbmFtZScsXG5cdFx0XHRcdCdkZXNjcmlwdGlvbjogVGVzdCBBZ2VudCcsXG5cdFx0XHRcdCctLS0nLFxuXHRcdFx0XHQnVGhpcyBpcyBhbiBhZ2VudC4nXG5cdFx0XHRdLmpvaW4oJ1xcbicpO1xuXHRcdFx0Y29uc3QgbWFya2VycyA9IGF3YWl0IHZhbGlkYXRlKGNvbnRlbnQsIFByb21wdHNUeXBlLmFnZW50LCBVUkkucGFyc2UoJ2ZpbGU6Ly8vLmdpdGh1Yi9hZ2VudHMvbXktYWdlbnQvQUdFTlQubWQnKSk7XG5cdFx0XHQvLyBTaG91bGQgbm90IGdldCBmb2xkZXIgbmFtZSBtaXNtYXRjaCB3YXJuaW5nIGZvciBhZ2VudHNcblx0XHRcdGFzc2VydC5vayghbWFya2Vycy5zb21lKG0gPT4gbS5tZXNzYWdlLmluY2x1ZGVzKCdzaG91bGQgbWF0Y2ggdGhlIGZvbGRlciBuYW1lJykpLCAnU2hvdWxkIG5vdCB2YWxpZGF0ZSBmb2xkZXIgbmFtZXMgZm9yIGFnZW50cycpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnc2tpbGwgd2l0aCB1bmtub3duIGF0dHJpYnV0ZXMgc2hvd3MgdW5uZWNlc3NhcnkgaGludHMnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCBjb250ZW50ID0gW1xuXHRcdFx0XHQnLS0tJyxcblx0XHRcdFx0J25hbWU6IG15LXNraWxsJyxcblx0XHRcdFx0J2Rlc2NyaXB0aW9uOiBUZXN0IFNraWxsJyxcblx0XHRcdFx0J3Vua25vd25BdHRyOiB2YWx1ZScsXG5cdFx0XHRcdCdhbm90aGVyVW5rbm93bjogMTIzJyxcblx0XHRcdFx0Jy0tLScsXG5cdFx0XHRcdCdUaGlzIGlzIGEgc2tpbGwuJ1xuXHRcdFx0XS5qb2luKCdcXG4nKTtcblx0XHRcdGNvbnN0IG1hcmtlcnMgPSBhd2FpdCB2YWxpZGF0ZShjb250ZW50LCBQcm9tcHRzVHlwZS5za2lsbCwgVVJJLnBhcnNlKCdmaWxlOi8vLy5naXRodWIvc2tpbGxzL215LXNraWxsL1NLSUxMLm1kJykpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1hcmtlcnMubGVuZ3RoLCAyKTtcblx0XHRcdGFzc2VydC5vayhtYXJrZXJzLmV2ZXJ5KG0gPT4gbS5zZXZlcml0eSA9PT0gTWFya2VyU2V2ZXJpdHkuSGludCkpO1xuXHRcdFx0YXNzZXJ0Lm9rKG1hcmtlcnMuZXZlcnkobSA9PiBKU09OLnN0cmluZ2lmeShtLnRhZ3MpID09PSBKU09OLnN0cmluZ2lmeShbTWFya2VyVGFnLlVubmVjZXNzYXJ5XSkpKTtcblx0XHRcdGFzc2VydC5vayhtYXJrZXJzLnNvbWUobSA9PiBtLm1lc3NhZ2UuaW5jbHVkZXMoJ3Vua25vd25BdHRyJykpKTtcblx0XHRcdGFzc2VydC5vayhtYXJrZXJzLnNvbWUobSA9PiBtLm1lc3NhZ2UuaW5jbHVkZXMoJ2Fub3RoZXJVbmtub3duJykpKTtcblx0XHRcdGFzc2VydC5vayhtYXJrZXJzLmV2ZXJ5KG0gPT4gbS5tZXNzYWdlLmluY2x1ZGVzKCdTdXBwb3J0ZWQ6ICcpKSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdza2lsbCB3aXRoIHVzZXItaW52b2NhYmxlOiBmYWxzZSBpcyB2YWxpZCcsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IGNvbnRlbnQgPSBbXG5cdFx0XHRcdCctLS0nLFxuXHRcdFx0XHQnbmFtZTogbXktc2tpbGwnLFxuXHRcdFx0XHQnZGVzY3JpcHRpb246IEJhY2tncm91bmQga25vd2xlZGdlIHNraWxsJyxcblx0XHRcdFx0J3VzZXItaW52b2NhYmxlOiBmYWxzZScsXG5cdFx0XHRcdCctLS0nLFxuXHRcdFx0XHQnVGhpcyBza2lsbCBwcm92aWRlcyBiYWNrZ3JvdW5kIGNvbnRleHQuJ1xuXHRcdFx0XS5qb2luKCdcXG4nKTtcblx0XHRcdGNvbnN0IG1hcmtlcnMgPSBhd2FpdCB2YWxpZGF0ZShjb250ZW50LCBQcm9tcHRzVHlwZS5za2lsbCwgVVJJLnBhcnNlKCdmaWxlOi8vLy5naXRodWIvc2tpbGxzL215LXNraWxsL1NLSUxMLm1kJykpO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChtYXJrZXJzLCBbXSwgJ3VzZXItaW52b2NhYmxlOiBmYWxzZSBzaG91bGQgYmUgdmFsaWQgZm9yIHNraWxscycpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnc2tpbGwgd2l0aCB1c2VyLWludm9jYWJsZTogdHJ1ZSBpcyB2YWxpZCcsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IGNvbnRlbnQgPSBbXG5cdFx0XHRcdCctLS0nLFxuXHRcdFx0XHQnbmFtZTogbXktc2tpbGwnLFxuXHRcdFx0XHQnZGVzY3JpcHRpb246IFVzZXItYWNjZXNzaWJsZSBza2lsbCcsXG5cdFx0XHRcdCd1c2VyLWludm9jYWJsZTogdHJ1ZScsXG5cdFx0XHRcdCctLS0nLFxuXHRcdFx0XHQnVGhpcyBza2lsbCBjYW4gYmUgaW52b2tlZCBieSB1c2Vycy4nXG5cdFx0XHRdLmpvaW4oJ1xcbicpO1xuXHRcdFx0Y29uc3QgbWFya2VycyA9IGF3YWl0IHZhbGlkYXRlKGNvbnRlbnQsIFByb21wdHNUeXBlLnNraWxsLCBVUkkucGFyc2UoJ2ZpbGU6Ly8vLmdpdGh1Yi9za2lsbHMvbXktc2tpbGwvU0tJTEwubWQnKSk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKG1hcmtlcnMsIFtdLCAndXNlci1pbnZvY2FibGU6IHRydWUgc2hvdWxkIGJlIHZhbGlkIGZvciBza2lsbHMnKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3NraWxsIHdpdGggaW52YWxpZCB1c2VyLWludm9jYWJsZSB2YWx1ZSBzaG93cyBlcnJvcicsIGFzeW5jICgpID0+IHtcblx0XHRcdC8vIFN0cmluZyB2YWx1ZSBpbnN0ZWFkIG9mIGJvb2xlYW5cblx0XHRcdHtcblx0XHRcdFx0Y29uc3QgY29udGVudCA9IFtcblx0XHRcdFx0XHQnLS0tJyxcblx0XHRcdFx0XHQnbmFtZTogbXktc2tpbGwnLFxuXHRcdFx0XHRcdCdkZXNjcmlwdGlvbjogVGVzdCBTa2lsbCcsXG5cdFx0XHRcdFx0J3VzZXItaW52b2NhYmxlOiBcImZhbHNlXCInLFxuXHRcdFx0XHRcdCctLS0nLFxuXHRcdFx0XHRcdCdCb2R5J1xuXHRcdFx0XHRdLmpvaW4oJ1xcbicpO1xuXHRcdFx0XHRjb25zdCBtYXJrZXJzID0gYXdhaXQgdmFsaWRhdGUoY29udGVudCwgUHJvbXB0c1R5cGUuc2tpbGwsIFVSSS5wYXJzZSgnZmlsZTovLy8uZ2l0aHViL3NraWxscy9teS1za2lsbC9TS0lMTC5tZCcpKTtcblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1hcmtlcnMubGVuZ3RoLCAxKTtcblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1hcmtlcnNbMF0uc2V2ZXJpdHksIE1hcmtlclNldmVyaXR5LkVycm9yKTtcblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1hcmtlcnNbMF0ubWVzc2FnZSwgYFRoZSAndXNlci1pbnZvY2FibGUnIGF0dHJpYnV0ZSBtdXN0IGJlICd0cnVlJyBvciAnZmFsc2UnLmApO1xuXHRcdFx0fVxuXG5cdFx0XHQvLyBOdW1iZXIgdmFsdWUgaW5zdGVhZCBvZiBib29sZWFuXG5cdFx0XHR7XG5cdFx0XHRcdGNvbnN0IGNvbnRlbnQgPSBbXG5cdFx0XHRcdFx0Jy0tLScsXG5cdFx0XHRcdFx0J25hbWU6IG15LXNraWxsJyxcblx0XHRcdFx0XHQnZGVzY3JpcHRpb246IFRlc3QgU2tpbGwnLFxuXHRcdFx0XHRcdCd1c2VyLWludm9jYWJsZTogMCcsXG5cdFx0XHRcdFx0Jy0tLScsXG5cdFx0XHRcdFx0J0JvZHknXG5cdFx0XHRcdF0uam9pbignXFxuJyk7XG5cdFx0XHRcdGNvbnN0IG1hcmtlcnMgPSBhd2FpdCB2YWxpZGF0ZShjb250ZW50LCBQcm9tcHRzVHlwZS5za2lsbCwgVVJJLnBhcnNlKCdmaWxlOi8vLy5naXRodWIvc2tpbGxzL215LXNraWxsL1NLSUxMLm1kJykpO1xuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobWFya2Vycy5sZW5ndGgsIDEpO1xuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobWFya2Vyc1swXS5zZXZlcml0eSwgTWFya2VyU2V2ZXJpdHkuRXJyb3IpO1xuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobWFya2Vyc1swXS5tZXNzYWdlLCBgVGhlICd1c2VyLWludm9jYWJsZScgYXR0cmlidXRlIG11c3QgYmUgJ3RydWUnIG9yICdmYWxzZScuYCk7XG5cdFx0XHR9XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdza2lsbCB3aXRoIGRpc2FibGUtbW9kZWwtaW52b2NhdGlvbjogdHJ1ZSBpcyB2YWxpZCcsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IGNvbnRlbnQgPSBbXG5cdFx0XHRcdCctLS0nLFxuXHRcdFx0XHQnbmFtZTogbXktc2tpbGwnLFxuXHRcdFx0XHQnZGVzY3JpcHRpb246IE1hbnVhbC1vbmx5IHNraWxsJyxcblx0XHRcdFx0J2Rpc2FibGUtbW9kZWwtaW52b2NhdGlvbjogdHJ1ZScsXG5cdFx0XHRcdCctLS0nLFxuXHRcdFx0XHQnVGhpcyBza2lsbCBtdXN0IGJlIHRyaWdnZXJlZCBtYW51YWxseSB3aXRoIC9uYW1lLidcblx0XHRcdF0uam9pbignXFxuJyk7XG5cdFx0XHRjb25zdCBtYXJrZXJzID0gYXdhaXQgdmFsaWRhdGUoY29udGVudCwgUHJvbXB0c1R5cGUuc2tpbGwsIFVSSS5wYXJzZSgnZmlsZTovLy8uZ2l0aHViL3NraWxscy9teS1za2lsbC9TS0lMTC5tZCcpKTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwobWFya2VycywgW10sICdkaXNhYmxlLW1vZGVsLWludm9jYXRpb246IHRydWUgc2hvdWxkIGJlIHZhbGlkIGZvciBza2lsbHMnKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3NraWxsIHdpdGggZGlzYWJsZS1tb2RlbC1pbnZvY2F0aW9uOiBmYWxzZSBpcyB2YWxpZCcsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IGNvbnRlbnQgPSBbXG5cdFx0XHRcdCctLS0nLFxuXHRcdFx0XHQnbmFtZTogbXktc2tpbGwnLFxuXHRcdFx0XHQnZGVzY3JpcHRpb246IEF1dG8tbG9hZGFibGUgc2tpbGwnLFxuXHRcdFx0XHQnZGlzYWJsZS1tb2RlbC1pbnZvY2F0aW9uOiBmYWxzZScsXG5cdFx0XHRcdCctLS0nLFxuXHRcdFx0XHQnVGhpcyBza2lsbCBjYW4gYmUgbG9hZGVkIGF1dG9tYXRpY2FsbHkgYnkgdGhlIGFnZW50Lidcblx0XHRcdF0uam9pbignXFxuJyk7XG5cdFx0XHRjb25zdCBtYXJrZXJzID0gYXdhaXQgdmFsaWRhdGUoY29udGVudCwgUHJvbXB0c1R5cGUuc2tpbGwsIFVSSS5wYXJzZSgnZmlsZTovLy8uZ2l0aHViL3NraWxscy9teS1za2lsbC9TS0lMTC5tZCcpKTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwobWFya2VycywgW10sICdkaXNhYmxlLW1vZGVsLWludm9jYXRpb246IGZhbHNlIHNob3VsZCBiZSB2YWxpZCBmb3Igc2tpbGxzJyk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdza2lsbCB3aXRoIGludmFsaWQgZGlzYWJsZS1tb2RlbC1pbnZvY2F0aW9uIHZhbHVlIHNob3dzIGVycm9yJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Ly8gU3RyaW5nIHZhbHVlIGluc3RlYWQgb2YgYm9vbGVhblxuXHRcdFx0e1xuXHRcdFx0XHRjb25zdCBjb250ZW50ID0gW1xuXHRcdFx0XHRcdCctLS0nLFxuXHRcdFx0XHRcdCduYW1lOiBteS1za2lsbCcsXG5cdFx0XHRcdFx0J2Rlc2NyaXB0aW9uOiBUZXN0IFNraWxsJyxcblx0XHRcdFx0XHQnZGlzYWJsZS1tb2RlbC1pbnZvY2F0aW9uOiBcInRydWVcIicsXG5cdFx0XHRcdFx0Jy0tLScsXG5cdFx0XHRcdFx0J0JvZHknXG5cdFx0XHRcdF0uam9pbignXFxuJyk7XG5cdFx0XHRcdGNvbnN0IG1hcmtlcnMgPSBhd2FpdCB2YWxpZGF0ZShjb250ZW50LCBQcm9tcHRzVHlwZS5za2lsbCwgVVJJLnBhcnNlKCdmaWxlOi8vLy5naXRodWIvc2tpbGxzL215LXNraWxsL1NLSUxMLm1kJykpO1xuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobWFya2Vycy5sZW5ndGgsIDEpO1xuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobWFya2Vyc1swXS5zZXZlcml0eSwgTWFya2VyU2V2ZXJpdHkuRXJyb3IpO1xuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobWFya2Vyc1swXS5tZXNzYWdlLCBgVGhlICdkaXNhYmxlLW1vZGVsLWludm9jYXRpb24nIGF0dHJpYnV0ZSBtdXN0IGJlICd0cnVlJyBvciAnZmFsc2UnLmApO1xuXHRcdFx0fVxuXG5cdFx0XHQvLyBOdW1iZXIgdmFsdWUgaW5zdGVhZCBvZiBib29sZWFuXG5cdFx0XHR7XG5cdFx0XHRcdGNvbnN0IGNvbnRlbnQgPSBbXG5cdFx0XHRcdFx0Jy0tLScsXG5cdFx0XHRcdFx0J25hbWU6IG15LXNraWxsJyxcblx0XHRcdFx0XHQnZGVzY3JpcHRpb246IFRlc3QgU2tpbGwnLFxuXHRcdFx0XHRcdCdkaXNhYmxlLW1vZGVsLWludm9jYXRpb246IDEnLFxuXHRcdFx0XHRcdCctLS0nLFxuXHRcdFx0XHRcdCdCb2R5J1xuXHRcdFx0XHRdLmpvaW4oJ1xcbicpO1xuXHRcdFx0XHRjb25zdCBtYXJrZXJzID0gYXdhaXQgdmFsaWRhdGUoY29udGVudCwgUHJvbXB0c1R5cGUuc2tpbGwsIFVSSS5wYXJzZSgnZmlsZTovLy8uZ2l0aHViL3NraWxscy9teS1za2lsbC9TS0lMTC5tZCcpKTtcblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1hcmtlcnMubGVuZ3RoLCAxKTtcblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1hcmtlcnNbMF0uc2V2ZXJpdHksIE1hcmtlclNldmVyaXR5LkVycm9yKTtcblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1hcmtlcnNbMF0ubWVzc2FnZSwgYFRoZSAnZGlzYWJsZS1tb2RlbC1pbnZvY2F0aW9uJyBhdHRyaWJ1dGUgbXVzdCBiZSAndHJ1ZScgb3IgJ2ZhbHNlJy5gKTtcblx0XHRcdH1cblx0XHR9KTtcblxuXHRcdHRlc3QoJ3NraWxsIHdpdGggYXJndW1lbnQtaGludCBpcyB2YWxpZCcsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IGNvbnRlbnQgPSBbXG5cdFx0XHRcdCctLS0nLFxuXHRcdFx0XHQnbmFtZTogbXktc2tpbGwnLFxuXHRcdFx0XHQnZGVzY3JpcHRpb246IFNraWxsIHdpdGggYXJndW1lbnQgaGludCcsXG5cdFx0XHRcdCdhcmd1bWVudC1oaW50OiBcIltpc3N1ZS1udW1iZXJdXCInLFxuXHRcdFx0XHQnLS0tJyxcblx0XHRcdFx0J1RoaXMgc2tpbGwgZXhwZWN0cyBhbiBpc3N1ZSBudW1iZXIuJ1xuXHRcdFx0XS5qb2luKCdcXG4nKTtcblx0XHRcdGNvbnN0IG1hcmtlcnMgPSBhd2FpdCB2YWxpZGF0ZShjb250ZW50LCBQcm9tcHRzVHlwZS5za2lsbCwgVVJJLnBhcnNlKCdmaWxlOi8vLy5naXRodWIvc2tpbGxzL215LXNraWxsL1NLSUxMLm1kJykpO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChtYXJrZXJzLCBbXSwgJ2FyZ3VtZW50LWhpbnQgc2hvdWxkIGJlIHZhbGlkIGZvciBza2lsbHMnKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3NraWxsIHdpdGggZW1wdHkgYXJndW1lbnQtaGludCBzaG93cyB3YXJuaW5nJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgY29udGVudCA9IFtcblx0XHRcdFx0Jy0tLScsXG5cdFx0XHRcdCduYW1lOiBteS1za2lsbCcsXG5cdFx0XHRcdCdkZXNjcmlwdGlvbjogVGVzdCBTa2lsbCcsXG5cdFx0XHRcdCdhcmd1bWVudC1oaW50OiBcIlwiJyxcblx0XHRcdFx0Jy0tLScsXG5cdFx0XHRcdCdCb2R5J1xuXHRcdFx0XS5qb2luKCdcXG4nKTtcblx0XHRcdGNvbnN0IG1hcmtlcnMgPSBhd2FpdCB2YWxpZGF0ZShjb250ZW50LCBQcm9tcHRzVHlwZS5za2lsbCwgVVJJLnBhcnNlKCdmaWxlOi8vLy5naXRodWIvc2tpbGxzL215LXNraWxsL1NLSUxMLm1kJykpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1hcmtlcnMubGVuZ3RoLCAxKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChtYXJrZXJzWzBdLnNldmVyaXR5LCBNYXJrZXJTZXZlcml0eS5XYXJuaW5nKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChtYXJrZXJzWzBdLm1lc3NhZ2UsIGBUaGUgJ2FyZ3VtZW50LWhpbnQnIGF0dHJpYnV0ZSBzaG91bGQgbm90IGJlIGVtcHR5LmApO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnc2tpbGwgd2l0aCBub24tc3RyaW5nIGFyZ3VtZW50LWhpbnQgc2hvd3MgZXJyb3InLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCBjb250ZW50ID0gW1xuXHRcdFx0XHQnLS0tJyxcblx0XHRcdFx0J25hbWU6IG15LXNraWxsJyxcblx0XHRcdFx0J2Rlc2NyaXB0aW9uOiBUZXN0IFNraWxsJyxcblx0XHRcdFx0J2FyZ3VtZW50LWhpbnQ6IFtdJyxcblx0XHRcdFx0Jy0tLScsXG5cdFx0XHRcdCdCb2R5J1xuXHRcdFx0XS5qb2luKCdcXG4nKTtcblx0XHRcdGNvbnN0IG1hcmtlcnMgPSBhd2FpdCB2YWxpZGF0ZShjb250ZW50LCBQcm9tcHRzVHlwZS5za2lsbCwgVVJJLnBhcnNlKCdmaWxlOi8vLy5naXRodWIvc2tpbGxzL215LXNraWxsL1NLSUxMLm1kJykpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1hcmtlcnMubGVuZ3RoLCAxKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChtYXJrZXJzWzBdLnNldmVyaXR5LCBNYXJrZXJTZXZlcml0eS5FcnJvcik7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobWFya2Vyc1swXS5tZXNzYWdlLCBgVGhlICdhcmd1bWVudC1oaW50JyBhdHRyaWJ1dGUgbXVzdCBiZSBhIHN0cmluZy5gKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3NraWxsIHdpdGggYWxsIHZpc2liaWxpdHkgYXR0cmlidXRlcyBjb21iaW5lZCBpcyB2YWxpZCcsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IGNvbnRlbnQgPSBbXG5cdFx0XHRcdCctLS0nLFxuXHRcdFx0XHQnbmFtZTogbXktc2tpbGwnLFxuXHRcdFx0XHQnZGVzY3JpcHRpb246IENvbXBsZXggdmlzaWJpbGl0eSBza2lsbCcsXG5cdFx0XHRcdCd1c2VyLWludm9jYWJsZTogZmFsc2UnLFxuXHRcdFx0XHQnZGlzYWJsZS1tb2RlbC1pbnZvY2F0aW9uOiB0cnVlJyxcblx0XHRcdFx0J2FyZ3VtZW50LWhpbnQ6IFwiW29wdGlvbmFsLWFyZ11cIicsXG5cdFx0XHRcdCctLS0nLFxuXHRcdFx0XHQnVGhpcyBza2lsbCBoYXMgY29tcGxleCB2aXNpYmlsaXR5IHNldHRpbmdzLidcblx0XHRcdF0uam9pbignXFxuJyk7XG5cdFx0XHRjb25zdCBtYXJrZXJzID0gYXdhaXQgdmFsaWRhdGUoY29udGVudCwgUHJvbXB0c1R5cGUuc2tpbGwsIFVSSS5wYXJzZSgnZmlsZTovLy8uZ2l0aHViL3NraWxscy9teS1za2lsbC9TS0lMTC5tZCcpKTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwobWFya2VycywgW10sICdBbGwgdmlzaWJpbGl0eSBhdHRyaWJ1dGVzIGNvbWJpbmVkIHNob3VsZCBiZSB2YWxpZCcpO1xuXHRcdH0pO1xuXG5cdH0pO1xuXG5cdHN1aXRlKCdjbGF1ZGUgcnVsZXMnLCAoKSA9PiB7XG5cblx0XHQvLyBIZWxwZXIgVVJJIGZvciBDbGF1ZGUgcnVsZXMgXHUyMDE0IGZpbGUgbXVzdCBiZSB1bmRlciAuY2xhdWRlL3J1bGVzLyBmb3IgdGFyZ2V0IGRldGVjdGlvblxuXHRcdGNvbnN0IGNsYXVkZVJ1bGVzVXJpID0gVVJJLnBhcnNlKCdteUZzOi8vdGVzdC8uY2xhdWRlL3J1bGVzL215LXJ1bGUubWQnKTtcblxuXHRcdHRlc3QoJ3ZhbGlkIGNsYXVkZSBydWxlcyB3aXRoIHBhdGhzIGF0dHJpYnV0ZScsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IGNvbnRlbnQgPSBbXG5cdFx0XHRcdCctLS0nLFxuXHRcdFx0XHQnZGVzY3JpcHRpb246IFwiVHlwZVNjcmlwdCBydWxlc1wiJyxcblx0XHRcdFx0YHBhdGhzOiBbJyoqLyoudHMnLCAnKiovKi50c3gnXWAsXG5cdFx0XHRcdCctLS0nLFxuXHRcdFx0XHQnQWx3YXlzIHVzZSBzdHJpY3QgbW9kZS4nLFxuXHRcdFx0XS5qb2luKCdcXG4nKTtcblx0XHRcdGNvbnN0IG1hcmtlcnMgPSBhd2FpdCB2YWxpZGF0ZShjb250ZW50LCBQcm9tcHRzVHlwZS5pbnN0cnVjdGlvbnMsIGNsYXVkZVJ1bGVzVXJpKTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwobWFya2VycywgW10pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgndmFsaWQgY2xhdWRlIHJ1bGVzIHdpdGhvdXQgcGF0aHMgYXR0cmlidXRlJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgY29udGVudCA9IFtcblx0XHRcdFx0Jy0tLScsXG5cdFx0XHRcdCdkZXNjcmlwdGlvbjogXCJHZW5lcmFsIHJ1bGVzXCInLFxuXHRcdFx0XHQnLS0tJyxcblx0XHRcdFx0J0ZvbGxvdyBjb2RpbmcgZ3VpZGVsaW5lcy4nLFxuXHRcdFx0XS5qb2luKCdcXG4nKTtcblx0XHRcdGNvbnN0IG1hcmtlcnMgPSBhd2FpdCB2YWxpZGF0ZShjb250ZW50LCBQcm9tcHRzVHlwZS5pbnN0cnVjdGlvbnMsIGNsYXVkZVJ1bGVzVXJpKTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwobWFya2VycywgW10pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnY2xhdWRlIHJ1bGVzIHBhdGhzIG11c3QgYmUgYW4gYXJyYXknLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCBjb250ZW50ID0gW1xuXHRcdFx0XHQnLS0tJyxcblx0XHRcdFx0J2Rlc2NyaXB0aW9uOiBcIlJ1bGVzXCInLFxuXHRcdFx0XHQncGF0aHM6IFwiKiovKi50c1wiJyxcblx0XHRcdFx0Jy0tLScsXG5cdFx0XHRdLmpvaW4oJ1xcbicpO1xuXHRcdFx0Y29uc3QgbWFya2VycyA9IGF3YWl0IHZhbGlkYXRlKGNvbnRlbnQsIFByb21wdHNUeXBlLmluc3RydWN0aW9ucywgY2xhdWRlUnVsZXNVcmkpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1hcmtlcnMubGVuZ3RoLCAxKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChtYXJrZXJzWzBdLnNldmVyaXR5LCBNYXJrZXJTZXZlcml0eS5FcnJvcik7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobWFya2Vyc1swXS5tZXNzYWdlLCBgVGhlICdwYXRocycgYXR0cmlidXRlIG11c3QgYmUgYW4gYXJyYXkgb2YgZ2xvYiBwYXR0ZXJucy5gKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2NsYXVkZSBydWxlcyB3aXRoIHVua25vd24gYXR0cmlidXRlIHNob3dzIHVubmVjZXNzYXJ5IGhpbnQnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCBjb250ZW50ID0gW1xuXHRcdFx0XHQnLS0tJyxcblx0XHRcdFx0J2Rlc2NyaXB0aW9uOiBcIlJ1bGVzXCInLFxuXHRcdFx0XHQnYXBwbHlUbzogXCIqKi8qLnRzXCInLFxuXHRcdFx0XHQnLS0tJyxcblx0XHRcdF0uam9pbignXFxuJyk7XG5cdFx0XHRjb25zdCBtYXJrZXJzID0gYXdhaXQgdmFsaWRhdGUoY29udGVudCwgUHJvbXB0c1R5cGUuaW5zdHJ1Y3Rpb25zLCBjbGF1ZGVSdWxlc1VyaSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobWFya2Vycy5sZW5ndGgsIDEpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1hcmtlcnNbMF0uc2V2ZXJpdHksIE1hcmtlclNldmVyaXR5LkhpbnQpO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChtYXJrZXJzWzBdLnRhZ3MsIFtNYXJrZXJUYWcuVW5uZWNlc3NhcnldKTtcblx0XHRcdGFzc2VydC5vayhtYXJrZXJzWzBdLm1lc3NhZ2UuaW5jbHVkZXMoYEF0dHJpYnV0ZSAnYXBwbHlUbycgaXMgbm90IHN1cHBvcnRlZCBpbiBydWxlcyBmaWxlcyBieSBWUyBDb2RlIGFnZW50cy5gKSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdjbGF1ZGUgcnVsZXMgd2l0aCBtdWx0aXBsZSB2YWxpZGF0aW9uIGVycm9ycycsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IGNvbnRlbnQgPSBbXG5cdFx0XHRcdCctLS0nLFxuXHRcdFx0XHQnZGVzY3JpcHRpb246IFwiXCInLFxuXHRcdFx0XHRgcGF0aHM6IFsnJywgMTIzXWAsXG5cdFx0XHRcdCctLS0nLFxuXHRcdFx0XS5qb2luKCdcXG4nKTtcblx0XHRcdGNvbnN0IG1hcmtlcnMgPSBhd2FpdCB2YWxpZGF0ZShjb250ZW50LCBQcm9tcHRzVHlwZS5pbnN0cnVjdGlvbnMsIGNsYXVkZVJ1bGVzVXJpKTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoXG5cdFx0XHRcdG1hcmtlcnMubWFwKG0gPT4gKHsgc2V2ZXJpdHk6IG0uc2V2ZXJpdHksIG1lc3NhZ2U6IG0ubWVzc2FnZSB9KSksXG5cdFx0XHRcdFtcblx0XHRcdFx0XHR7IHNldmVyaXR5OiBNYXJrZXJTZXZlcml0eS5FcnJvciwgbWVzc2FnZTogYFRoZSAnZGVzY3JpcHRpb24nIGF0dHJpYnV0ZSBzaG91bGQgbm90IGJlIGVtcHR5LmAgfSxcblx0XHRcdFx0XHR7IHNldmVyaXR5OiBNYXJrZXJTZXZlcml0eS5FcnJvciwgbWVzc2FnZTogYFBhdGggZW50cmllcyBtdXN0IGJlIG5vbi1lbXB0eSBnbG9iIHBhdHRlcm5zLmAgfSxcblx0XHRcdFx0XVxuXHRcdFx0KTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2NsYXVkZSBydWxlcyBpbiBzdWJkaXJlY3RvcnknLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCBzdWJEaXJVcmkgPSBVUkkucGFyc2UoJ215RnM6Ly90ZXN0Ly5jbGF1ZGUvcnVsZXMvc3ViL2RlZXAtcnVsZS5tZCcpO1xuXHRcdFx0Y29uc3QgY29udGVudCA9IFtcblx0XHRcdFx0Jy0tLScsXG5cdFx0XHRcdCdkZXNjcmlwdGlvbjogXCJOZXN0ZWQgcnVsZXNcIicsXG5cdFx0XHRcdGBwYXRoczogWydzcmMvKiovKi50cyddYCxcblx0XHRcdFx0Jy0tLScsXG5cdFx0XHRcdCdOZXN0ZWQgcnVsZSBjb250ZW50LicsXG5cdFx0XHRdLmpvaW4oJ1xcbicpO1xuXHRcdFx0Y29uc3QgbWFya2VycyA9IGF3YWl0IHZhbGlkYXRlKGNvbnRlbnQsIFByb21wdHNUeXBlLmluc3RydWN0aW9ucywgc3ViRGlyVXJpKTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwobWFya2VycywgW10pO1xuXHRcdH0pO1xuXHR9KTtcblxuXHRzdWl0ZSgnY2xhdWRlIGFnZW50cycsICgpID0+IHtcblxuXHRcdC8vIEhlbHBlciBVUkkgZm9yIENsYXVkZSBhZ2VudHMgXHUyMDE0IGZpbGUgbXVzdCBiZSB1bmRlciAuY2xhdWRlL2FnZW50cy8gZm9yIHRhcmdldCBkZXRlY3Rpb25cblx0XHRjb25zdCBjbGF1ZGVBZ2VudFVyaSA9IFVSSS5wYXJzZSgnbXlGczovL3Rlc3QvLmNsYXVkZS9hZ2VudHMvdGVzdC5hZ2VudC5tZCcpO1xuXG5cdFx0dGVzdCgndmFsaWQgQ2xhdWRlIGFnZW50IHdpdGggYWxsIGNvbW1vbiBhdHRyaWJ1dGVzJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgY29udGVudCA9IFtcblx0XHRcdFx0Jy0tLScsXG5cdFx0XHRcdCduYW1lOiBzZWN1cml0eS1yZXZpZXdlcicsXG5cdFx0XHRcdCdkZXNjcmlwdGlvbjogUmV2aWV3cyBjb2RlIGZvciBzZWN1cml0eSB2dWxuZXJhYmlsaXRpZXMnLFxuXHRcdFx0XHRgdG9vbHM6IFsnRWRpdCcsICdHcmVwJywgJ0Fza1VzZXJRdWVzdGlvbicsICdXZWJGZXRjaCddYCxcblx0XHRcdFx0J21vZGVsOiBvcHVzJyxcblx0XHRcdFx0J3Blcm1pc3Npb25Nb2RlOiBkZWxlZ2F0ZScsXG5cdFx0XHRcdCctLS0nLFxuXHRcdFx0XHQnWW91IGFyZSBhIHNlbmlvciBzZWN1cml0eSBlbmdpbmVlci4nLFxuXHRcdFx0XS5qb2luKCdcXG4nKTtcblx0XHRcdGNvbnN0IG1hcmtlcnMgPSBhd2FpdCB2YWxpZGF0ZShjb250ZW50LCBQcm9tcHRzVHlwZS5hZ2VudCwgY2xhdWRlQWdlbnRVcmkpO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChtYXJrZXJzLCBbXSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCd2YWxpZCBDbGF1ZGUgYWdlbnQgd2l0aCBtaW5pbWFsIGF0dHJpYnV0ZXMnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCBjb250ZW50ID0gW1xuXHRcdFx0XHQnLS0tJyxcblx0XHRcdFx0J25hbWU6IGhlbHBlcicsXG5cdFx0XHRcdCdkZXNjcmlwdGlvbjogQSBzaW1wbGUgaGVscGVyIGFnZW50Jyxcblx0XHRcdFx0Jy0tLScsXG5cdFx0XHRcdCdZb3UgaGVscCB3aXRoIHRhc2tzLicsXG5cdFx0XHRdLmpvaW4oJ1xcbicpO1xuXHRcdFx0Y29uc3QgbWFya2VycyA9IGF3YWl0IHZhbGlkYXRlKGNvbnRlbnQsIFByb21wdHNUeXBlLmFnZW50LCBjbGF1ZGVBZ2VudFVyaSk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKG1hcmtlcnMsIFtdKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ0NsYXVkZSBhZ2VudCB3aXRoIHZhbGlkIG1vZGVsIHZhbHVlcycsIGFzeW5jICgpID0+IHtcblx0XHRcdC8vIEVhY2gga25vd24gQ2xhdWRlIG1vZGVsIHNob3VsZCBiZSB2YWxpZFxuXHRcdFx0Zm9yIChjb25zdCBtb2RlbE5hbWUgb2YgWydzb25uZXQnLCAnb3B1cycsICdoYWlrdScsICdpbmhlcml0J10pIHtcblx0XHRcdFx0Y29uc3QgY29udGVudCA9IFtcblx0XHRcdFx0XHQnLS0tJyxcblx0XHRcdFx0XHQnbmFtZTogdGVzdC1hZ2VudCcsXG5cdFx0XHRcdFx0J2Rlc2NyaXB0aW9uOiBUZXN0Jyxcblx0XHRcdFx0XHRgbW9kZWw6ICR7bW9kZWxOYW1lfWAsXG5cdFx0XHRcdFx0Jy0tLScsXG5cdFx0XHRcdF0uam9pbignXFxuJyk7XG5cdFx0XHRcdGNvbnN0IG1hcmtlcnMgPSBhd2FpdCB2YWxpZGF0ZShjb250ZW50LCBQcm9tcHRzVHlwZS5hZ2VudCwgY2xhdWRlQWdlbnRVcmkpO1xuXHRcdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKG1hcmtlcnMsIFtdLCBgTW9kZWwgJyR7bW9kZWxOYW1lfScgc2hvdWxkIGJlIHZhbGlkYCk7XG5cdFx0XHR9XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdDbGF1ZGUgYWdlbnQgd2l0aCB1bmtub3duIG1vZGVsIHZhbHVlJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgY29udGVudCA9IFtcblx0XHRcdFx0Jy0tLScsXG5cdFx0XHRcdCduYW1lOiB0ZXN0LWFnZW50Jyxcblx0XHRcdFx0J2Rlc2NyaXB0aW9uOiBUZXN0Jyxcblx0XHRcdFx0J21vZGVsOiBncHQtNCcsXG5cdFx0XHRcdCctLS0nLFxuXHRcdFx0XS5qb2luKCdcXG4nKTtcblx0XHRcdGNvbnN0IG1hcmtlcnMgPSBhd2FpdCB2YWxpZGF0ZShjb250ZW50LCBQcm9tcHRzVHlwZS5hZ2VudCwgY2xhdWRlQWdlbnRVcmkpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1hcmtlcnMubGVuZ3RoLCAxKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChtYXJrZXJzWzBdLnNldmVyaXR5LCBNYXJrZXJTZXZlcml0eS5XYXJuaW5nKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChtYXJrZXJzWzBdLm1lc3NhZ2UsIGBVbmtub3duIHZhbHVlICdncHQtNCcsIHZhbGlkOiBzb25uZXQsIG9wdXMsIGhhaWt1LCBpbmhlcml0LmApO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnQ2xhdWRlIGFnZW50IHdpdGggbm9uLXN0cmluZyBtb2RlbCB2YWx1ZScsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IGNvbnRlbnQgPSBbXG5cdFx0XHRcdCctLS0nLFxuXHRcdFx0XHQnbmFtZTogdGVzdC1hZ2VudCcsXG5cdFx0XHRcdCdkZXNjcmlwdGlvbjogVGVzdCcsXG5cdFx0XHRcdCdtb2RlbDogW10nLFxuXHRcdFx0XHQnLS0tJyxcblx0XHRcdF0uam9pbignXFxuJyk7XG5cdFx0XHRjb25zdCBtYXJrZXJzID0gYXdhaXQgdmFsaWRhdGUoY29udGVudCwgUHJvbXB0c1R5cGUuYWdlbnQsIGNsYXVkZUFnZW50VXJpKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChtYXJrZXJzLmxlbmd0aCwgMSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobWFya2Vyc1swXS5zZXZlcml0eSwgTWFya2VyU2V2ZXJpdHkuRXJyb3IpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1hcmtlcnNbMF0ubWVzc2FnZSwgYFRoZSAnbW9kZWwnIGF0dHJpYnV0ZSBtdXN0IGJlIGEgc3RyaW5nLmApO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnQ2xhdWRlIGFnZW50IHdpdGggdmFsaWQgcGVybWlzc2lvbk1vZGUgdmFsdWVzJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Zm9yIChjb25zdCBtb2RlIG9mIFsnZGVmYXVsdCcsICdhY2NlcHRFZGl0cycsICdwbGFuJywgJ2RlbGVnYXRlJywgJ2RvbnRBc2snLCAnYnlwYXNzUGVybWlzc2lvbnMnXSkge1xuXHRcdFx0XHRjb25zdCBjb250ZW50ID0gW1xuXHRcdFx0XHRcdCctLS0nLFxuXHRcdFx0XHRcdCduYW1lOiB0ZXN0LWFnZW50Jyxcblx0XHRcdFx0XHQnZGVzY3JpcHRpb246IFRlc3QnLFxuXHRcdFx0XHRcdGBwZXJtaXNzaW9uTW9kZTogJHttb2RlfWAsXG5cdFx0XHRcdFx0Jy0tLScsXG5cdFx0XHRcdF0uam9pbignXFxuJyk7XG5cdFx0XHRcdGNvbnN0IG1hcmtlcnMgPSBhd2FpdCB2YWxpZGF0ZShjb250ZW50LCBQcm9tcHRzVHlwZS5hZ2VudCwgY2xhdWRlQWdlbnRVcmkpO1xuXHRcdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKG1hcmtlcnMsIFtdLCBgcGVybWlzc2lvbk1vZGUgJyR7bW9kZX0nIHNob3VsZCBiZSB2YWxpZGApO1xuXHRcdFx0fVxuXHRcdH0pO1xuXG5cdFx0dGVzdCgnQ2xhdWRlIGFnZW50IHdpdGggdW5rbm93biBwZXJtaXNzaW9uTW9kZSB2YWx1ZScsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IGNvbnRlbnQgPSBbXG5cdFx0XHRcdCctLS0nLFxuXHRcdFx0XHQnbmFtZTogdGVzdC1hZ2VudCcsXG5cdFx0XHRcdCdkZXNjcmlwdGlvbjogVGVzdCcsXG5cdFx0XHRcdCdtb2RlbDogc29ubmV0Jyxcblx0XHRcdFx0J3Blcm1pc3Npb25Nb2RlOiBhbGxvd0FsbCcsXG5cdFx0XHRcdCctLS0nLFxuXHRcdFx0XS5qb2luKCdcXG4nKTtcblx0XHRcdGNvbnN0IG1hcmtlcnMgPSBhd2FpdCB2YWxpZGF0ZShjb250ZW50LCBQcm9tcHRzVHlwZS5hZ2VudCwgY2xhdWRlQWdlbnRVcmkpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1hcmtlcnMubGVuZ3RoLCAxKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChtYXJrZXJzWzBdLnNldmVyaXR5LCBNYXJrZXJTZXZlcml0eS5XYXJuaW5nKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChtYXJrZXJzWzBdLm1lc3NhZ2UsIGBVbmtub3duIHZhbHVlICdhbGxvd0FsbCcsIHZhbGlkOiBkZWZhdWx0LCBhY2NlcHRFZGl0cywgcGxhbiwgZGVsZWdhdGUsIGRvbnRBc2ssIGJ5cGFzc1Blcm1pc3Npb25zLmApO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnQ2xhdWRlIGFnZW50IHdpdGggdmFsaWQgbWVtb3J5IHZhbHVlcycsIGFzeW5jICgpID0+IHtcblx0XHRcdGZvciAoY29uc3QgbWVtIG9mIFsndXNlcicsICdwcm9qZWN0JywgJ2xvY2FsJ10pIHtcblx0XHRcdFx0Y29uc3QgY29udGVudCA9IFtcblx0XHRcdFx0XHQnLS0tJyxcblx0XHRcdFx0XHQnbmFtZTogdGVzdC1hZ2VudCcsXG5cdFx0XHRcdFx0J2Rlc2NyaXB0aW9uOiBUZXN0Jyxcblx0XHRcdFx0XHRgbWVtb3J5OiAke21lbX1gLFxuXHRcdFx0XHRcdCctLS0nLFxuXHRcdFx0XHRdLmpvaW4oJ1xcbicpO1xuXHRcdFx0XHRjb25zdCBtYXJrZXJzID0gYXdhaXQgdmFsaWRhdGUoY29udGVudCwgUHJvbXB0c1R5cGUuYWdlbnQsIGNsYXVkZUFnZW50VXJpKTtcblx0XHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChtYXJrZXJzLCBbXSwgYG1lbW9yeSAnJHttZW19JyBzaG91bGQgYmUgdmFsaWRgKTtcblx0XHRcdH1cblx0XHR9KTtcblxuXHRcdHRlc3QoJ0NsYXVkZSBhZ2VudCB3aXRoIHVua25vd24gbWVtb3J5IHZhbHVlJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgY29udGVudCA9IFtcblx0XHRcdFx0Jy0tLScsXG5cdFx0XHRcdCduYW1lOiB0ZXN0LWFnZW50Jyxcblx0XHRcdFx0J2Rlc2NyaXB0aW9uOiBUZXN0Jyxcblx0XHRcdFx0J21vZGVsOiBzb25uZXQnLFxuXHRcdFx0XHQncGVybWlzc2lvbk1vZGU6IGRlZmF1bHQnLFxuXHRcdFx0XHQnbWVtb3J5OiBnbG9iYWwnLFxuXHRcdFx0XHQnLS0tJyxcblx0XHRcdF0uam9pbignXFxuJyk7XG5cdFx0XHRjb25zdCBtYXJrZXJzID0gYXdhaXQgdmFsaWRhdGUoY29udGVudCwgUHJvbXB0c1R5cGUuYWdlbnQsIGNsYXVkZUFnZW50VXJpKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChtYXJrZXJzLmxlbmd0aCwgMSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobWFya2Vyc1swXS5zZXZlcml0eSwgTWFya2VyU2V2ZXJpdHkuV2FybmluZyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobWFya2Vyc1swXS5tZXNzYWdlLCBgVW5rbm93biB2YWx1ZSAnZ2xvYmFsJywgdmFsaWQ6IHVzZXIsIHByb2plY3QsIGxvY2FsLmApO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnQ2xhdWRlIGFnZW50IHdpdGggZW1wdHkgbmFtZSBzaG93cyBlcnJvcicsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IGNvbnRlbnQgPSBbXG5cdFx0XHRcdCctLS0nLFxuXHRcdFx0XHQnbmFtZTogXCJcIicsXG5cdFx0XHRcdCdkZXNjcmlwdGlvbjogVGVzdCcsXG5cdFx0XHRcdCctLS0nLFxuXHRcdFx0XS5qb2luKCdcXG4nKTtcblx0XHRcdGNvbnN0IG1hcmtlcnMgPSBhd2FpdCB2YWxpZGF0ZShjb250ZW50LCBQcm9tcHRzVHlwZS5hZ2VudCwgY2xhdWRlQWdlbnRVcmkpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1hcmtlcnMubGVuZ3RoLCAxKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChtYXJrZXJzWzBdLnNldmVyaXR5LCBNYXJrZXJTZXZlcml0eS5FcnJvcik7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobWFya2Vyc1swXS5tZXNzYWdlLCBgVGhlICduYW1lJyBhdHRyaWJ1dGUgbXVzdCBub3QgYmUgZW1wdHkuYCk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdDbGF1ZGUgYWdlbnQgd2l0aCBlbXB0eSBkZXNjcmlwdGlvbiBzaG93cyBlcnJvcicsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IGNvbnRlbnQgPSBbXG5cdFx0XHRcdCctLS0nLFxuXHRcdFx0XHQnbmFtZTogdGVzdC1hZ2VudCcsXG5cdFx0XHRcdCdkZXNjcmlwdGlvbjogXCJcIicsXG5cdFx0XHRcdCctLS0nLFxuXHRcdFx0XS5qb2luKCdcXG4nKTtcblx0XHRcdGNvbnN0IG1hcmtlcnMgPSBhd2FpdCB2YWxpZGF0ZShjb250ZW50LCBQcm9tcHRzVHlwZS5hZ2VudCwgY2xhdWRlQWdlbnRVcmkpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1hcmtlcnMubGVuZ3RoLCAxKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChtYXJrZXJzWzBdLnNldmVyaXR5LCBNYXJrZXJTZXZlcml0eS5FcnJvcik7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobWFya2Vyc1swXS5tZXNzYWdlLCBgVGhlICdkZXNjcmlwdGlvbicgYXR0cmlidXRlIHNob3VsZCBub3QgYmUgZW1wdHkuYCk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdDbGF1ZGUgYWdlbnQgd2l0aCB1bmtub3duIGF0dHJpYnV0ZXMgZG9lcyBub3Qgd2FybicsIGFzeW5jICgpID0+IHtcblx0XHRcdC8vIENsYXVkZSB0YXJnZXQgaWdub3JlcyB1bmtub3duIGF0dHJpYnV0ZXMgc2luY2Ugd2UgZG9uJ3QgaGF2ZSBhIGZ1bGwgbGlzdFxuXHRcdFx0Y29uc3QgY29udGVudCA9IFtcblx0XHRcdFx0Jy0tLScsXG5cdFx0XHRcdCduYW1lOiB0ZXN0LWFnZW50Jyxcblx0XHRcdFx0J2Rlc2NyaXB0aW9uOiBUZXN0Jyxcblx0XHRcdFx0J2N1c3RvbUF0dHJpYnV0ZTogc29tZVZhbHVlJyxcblx0XHRcdFx0J2Fub3RoZXJDdXN0b206IDEyMycsXG5cdFx0XHRcdCctLS0nLFxuXHRcdFx0XS5qb2luKCdcXG4nKTtcblx0XHRcdGNvbnN0IG1hcmtlcnMgPSBhd2FpdCB2YWxpZGF0ZShjb250ZW50LCBQcm9tcHRzVHlwZS5hZ2VudCwgY2xhdWRlQWdlbnRVcmkpO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChtYXJrZXJzLCBbXSwgJ1Vua25vd24gYXR0cmlidXRlcyBzaG91bGQgYmUgc2lsZW50bHkgaWdub3JlZCBmb3IgQ2xhdWRlIGFnZW50cycpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnQ2xhdWRlIGFnZW50IHRvb2xzIGFyZSBub3QgdmFsaWRhdGVkIGFnYWluc3QgVlMgQ29kZSB0b29sIHJlZ2lzdHJ5JywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Ly8gQ2xhdWRlIHRvb2wgbmFtZXMgKEVkaXQsIEdyZXAsIGV0Yy4pIGRvbid0IGV4aXN0IGluIFZTIENvZGUncyB0b29sIHJlZ2lzdHJ5XG5cdFx0XHQvLyBidXQgc2hvdWxkIG5vdCBwcm9kdWNlIHdhcm5pbmdzIGZvciBDbGF1ZGUgdGFyZ2V0XG5cdFx0XHRjb25zdCBjb250ZW50ID0gW1xuXHRcdFx0XHQnLS0tJyxcblx0XHRcdFx0J25hbWU6IHRlc3QtYWdlbnQnLFxuXHRcdFx0XHQnZGVzY3JpcHRpb246IFRlc3QnLFxuXHRcdFx0XHRgdG9vbHM6IFsnRWRpdCcsICdHcmVwJywgJ1Vua25vd25DbGF1ZGVUb29sJywgJ1dlYkZldGNoJ11gLFxuXHRcdFx0XHQnLS0tJyxcblx0XHRcdF0uam9pbignXFxuJyk7XG5cdFx0XHRjb25zdCBtYXJrZXJzID0gYXdhaXQgdmFsaWRhdGUoY29udGVudCwgUHJvbXB0c1R5cGUuYWdlbnQsIGNsYXVkZUFnZW50VXJpKTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwobWFya2VycywgW10sICdDbGF1ZGUgdG9vbHMgc2hvdWxkIG5vdCBiZSB2YWxpZGF0ZWQgYWdhaW5zdCBWUyBDb2RlIHJlZ2lzdHJ5Jyk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdDbGF1ZGUgYWdlbnQgd2l0aCBjb21tYS1zZXBhcmF0ZWQgdG9vbHMgc3RyaW5nJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgY29udGVudCA9IFtcblx0XHRcdFx0Jy0tLScsXG5cdFx0XHRcdCduYW1lOiBzZWN1cml0eS1yZXZpZXdlcicsXG5cdFx0XHRcdCdkZXNjcmlwdGlvbjogUmV2aWV3cyBjb2RlJyxcblx0XHRcdFx0J3Rvb2xzOiBFZGl0LCBHcmVwLCBBc2tVc2VyUXVlc3Rpb24sIFdlYkZldGNoJyxcblx0XHRcdFx0Jy0tLScsXG5cdFx0XHRdLmpvaW4oJ1xcbicpO1xuXHRcdFx0Y29uc3QgbWFya2VycyA9IGF3YWl0IHZhbGlkYXRlKGNvbnRlbnQsIFByb21wdHNUeXBlLmFnZW50LCBjbGF1ZGVBZ2VudFVyaSk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKG1hcmtlcnMsIFtdLCAnQ29tbWEtc2VwYXJhdGVkIHRvb2xzIHN0cmluZyBzaG91bGQgYmUgdmFsaWQgZm9yIENsYXVkZScpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnQ2xhdWRlIGFnZW50IGRvZXMgbm90IHZhbGlkYXRlIGhhbmRvZmZzIG9yIGFnZW50cyBhdHRyaWJ1dGVzJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Ly8gaGFuZG9mZnMgYW5kIGFnZW50cyBhcmUgVlMgQ29kZS1zcGVjaWZpYzsgdGhleSBzaG91bGRuJ3QgYmUgdmFsaWRhdGVkIGZvciBDbGF1ZGVcblx0XHRcdGNvbnN0IGNvbnRlbnQgPSBbXG5cdFx0XHRcdCctLS0nLFxuXHRcdFx0XHQnbmFtZTogdGVzdC1hZ2VudCcsXG5cdFx0XHRcdCdkZXNjcmlwdGlvbjogVGVzdCcsXG5cdFx0XHRcdCdtb2RlbDogb3B1cycsXG5cdFx0XHRcdCctLS0nLFxuXHRcdFx0XS5qb2luKCdcXG4nKTtcblx0XHRcdGNvbnN0IG1hcmtlcnMgPSBhd2FpdCB2YWxpZGF0ZShjb250ZW50LCBQcm9tcHRzVHlwZS5hZ2VudCwgY2xhdWRlQWdlbnRVcmkpO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChtYXJrZXJzLCBbXSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdDbGF1ZGUgYWdlbnQgZnVsbCByZWFsaXN0aWMgZXhhbXBsZScsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IGNvbnRlbnQgPSBbXG5cdFx0XHRcdCctLS0nLFxuXHRcdFx0XHQnbmFtZTogc2VjdXJpdHktcmV2aWV3ZXInLFxuXHRcdFx0XHQnZGVzY3JpcHRpb246IFJldmlld3MgY29kZSBmb3Igc2VjdXJpdHkgdnVsbmVyYWJpbGl0aWVzJyxcblx0XHRcdFx0YHRvb2xzOiBbJ0VkaXQnLCAnR3JlcCcsICdBc2tVc2VyUXVlc3Rpb24nLCAnV2ViRmV0Y2gnXWAsXG5cdFx0XHRcdCdtb2RlbDogb3B1cycsXG5cdFx0XHRcdCdwZXJtaXNzaW9uTW9kZTogZGVsZWdhdGUnLFxuXHRcdFx0XHQnbWVtb3J5OiBwcm9qZWN0Jyxcblx0XHRcdFx0Jy0tLScsXG5cdFx0XHRcdCdZb3UgYXJlIGEgc2VuaW9yIHNlY3VyaXR5IGVuZ2luZWVyLicsXG5cdFx0XHRcdCdSZXZpZXcgdGhlIGNvZGUgZm9yIGNvbW1vbiB2dWxuZXJhYmlsaXRpZXMuJyxcblx0XHRcdF0uam9pbignXFxuJyk7XG5cdFx0XHRjb25zdCBtYXJrZXJzID0gYXdhaXQgdmFsaWRhdGUoY29udGVudCwgUHJvbXB0c1R5cGUuYWdlbnQsIGNsYXVkZUFnZW50VXJpKTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwobWFya2VycywgW10pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnQ2xhdWRlIGFnZW50IHdpdGggbXVsdGlwbGUgdmFsaWRhdGlvbiBlcnJvcnMnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCBjb250ZW50ID0gW1xuXHRcdFx0XHQnLS0tJyxcblx0XHRcdFx0J25hbWU6IFwiXCInLFxuXHRcdFx0XHQnZGVzY3JpcHRpb246IFwiXCInLFxuXHRcdFx0XHQnbW9kZWw6IHVua25vd24tbW9kZWwnLFxuXHRcdFx0XHQncGVybWlzc2lvbk1vZGU6IGludmFsaWQtbW9kZScsXG5cdFx0XHRcdCctLS0nLFxuXHRcdFx0XS5qb2luKCdcXG4nKTtcblx0XHRcdGNvbnN0IG1hcmtlcnMgPSBhd2FpdCB2YWxpZGF0ZShjb250ZW50LCBQcm9tcHRzVHlwZS5hZ2VudCwgY2xhdWRlQWdlbnRVcmkpO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChcblx0XHRcdFx0bWFya2Vycy5tYXAobSA9PiAoeyBzZXZlcml0eTogbS5zZXZlcml0eSwgbWVzc2FnZTogbS5tZXNzYWdlIH0pKSxcblx0XHRcdFx0W1xuXHRcdFx0XHRcdHsgc2V2ZXJpdHk6IE1hcmtlclNldmVyaXR5LkVycm9yLCBtZXNzYWdlOiBgVGhlICduYW1lJyBhdHRyaWJ1dGUgbXVzdCBub3QgYmUgZW1wdHkuYCB9LFxuXHRcdFx0XHRcdHsgc2V2ZXJpdHk6IE1hcmtlclNldmVyaXR5LkVycm9yLCBtZXNzYWdlOiBgVGhlICdkZXNjcmlwdGlvbicgYXR0cmlidXRlIHNob3VsZCBub3QgYmUgZW1wdHkuYCB9LFxuXHRcdFx0XHRcdHsgc2V2ZXJpdHk6IE1hcmtlclNldmVyaXR5Lldhcm5pbmcsIG1lc3NhZ2U6IGBVbmtub3duIHZhbHVlICd1bmtub3duLW1vZGVsJywgdmFsaWQ6IHNvbm5ldCwgb3B1cywgaGFpa3UsIGluaGVyaXQuYCB9LFxuXHRcdFx0XHRcdHsgc2V2ZXJpdHk6IE1hcmtlclNldmVyaXR5Lldhcm5pbmcsIG1lc3NhZ2U6IGBVbmtub3duIHZhbHVlICdpbnZhbGlkLW1vZGUnLCB2YWxpZDogZGVmYXVsdCwgYWNjZXB0RWRpdHMsIHBsYW4sIGRlbGVnYXRlLCBkb250QXNrLCBieXBhc3NQZXJtaXNzaW9ucy5gIH0sXG5cdFx0XHRcdF1cblx0XHRcdCk7XG5cdFx0fSk7XG5cdH0pO1xuXG59KTtcbiJdLAogICJtYXBwaW5ncyI6ICJBQUtBLE9BQU8sWUFBWTtBQUVuQixTQUFTLG1CQUFtQjtBQUM1QixTQUFTLFdBQVc7QUFDcEIsU0FBUywrQ0FBK0M7QUFDeEQsU0FBUyx5QkFBeUI7QUFDbEMsU0FBUyxnQ0FBZ0M7QUFDekMsU0FBUywyQkFBMkI7QUFDcEMsU0FBUyxvQkFBb0I7QUFFN0IsU0FBUyxxQkFBcUI7QUFDOUIsU0FBc0IsZ0JBQWdCLGlCQUFpQjtBQUN2RCxTQUFTLHFDQUFxQztBQUM5QyxTQUFTLGlDQUFpQztBQUMxQyxTQUFTLFVBQVUsZ0JBQWdCLHdCQUF3QjtBQUMzRCxTQUFTLG1CQUFtQix5QkFBeUI7QUFDckQsU0FBUyw0QkFBdUMsc0JBQXNCO0FBQ3RFLFNBQVMsNEJBQTRCLDhCQUE4QjtBQUNuRSxTQUFTLDhCQUE4QjtBQUN2QyxTQUFTLHVCQUF1QjtBQUNoQyxTQUFTLGFBQWEsY0FBYztBQUNwQyxTQUFTLHdCQUF3QjtBQUNqQyxTQUF1QixpQkFBaUIsc0JBQXNCO0FBQzlELFNBQVMsMkJBQTJCO0FBQ3BDLFNBQVMsMEJBQTBCO0FBRW5DLE1BQU0sbUJBQW1CLE1BQU07QUFDOUIsUUFBTSxjQUFjLHdDQUF3QztBQUU1RCxNQUFJO0FBQ0osTUFBSTtBQUVKLFFBQU0sZUFBZSxJQUFJLE1BQU0sMkJBQTJCO0FBQzFELFFBQU0sZUFBZSxJQUFJLE1BQU0sMkJBQTJCO0FBRTFELFFBQU0sWUFBWTtBQUVqQix3QkFBb0IsSUFBSSx5QkFBeUI7QUFDakQsc0JBQWtCLHFCQUFxQixrQkFBa0IsdUJBQXVCLElBQUk7QUFDcEYsbUJBQWUsOEJBQThCO0FBQUEsTUFDNUMsbUJBQW1CLE1BQU0sWUFBWSxJQUFJLElBQUksa0JBQWtCLGlCQUFpQixDQUFDO0FB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
