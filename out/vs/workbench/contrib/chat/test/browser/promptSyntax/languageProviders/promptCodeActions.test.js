import assert from "assert";
import { CancellationToken } from "../../../../../../../base/common/cancellation.js";
import { URI } from "../../../../../../../base/common/uri.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../../../../base/test/common/utils.js";
import { Range } from "../../../../../../../editor/common/core/range.js";
import { CodeActionTriggerType } from "../../../../../../../editor/common/languages.js";
import { createTextModel } from "../../../../../../../editor/test/common/testTextModel.js";
import { TestConfigurationService } from "../../../../../../../platform/configuration/test/common/testConfigurationService.js";
import { ContextKeyService } from "../../../../../../../platform/contextkey/browser/contextKeyService.js";
import { IMarkerService, MarkerSeverity } from "../../../../../../../platform/markers/common/markers.js";
import { workbenchInstantiationService } from "../../../../../../test/browser/workbenchTestServices.js";
import { ChatConfiguration } from "../../../../common/constants.js";
import { ILanguageModelToolsService, ToolDataSource } from "../../../../common/tools/languageModelToolsService.js";
import { LanguageModelToolsService } from "../../../../browser/tools/languageModelToolsService.js";
import { IPromptsService } from "../../../../common/promptSyntax/service/promptsService.js";
import { getLanguageIdForPromptsType, PromptsType } from "../../../../common/promptSyntax/promptTypes.js";
import { getPromptFileExtension } from "../../../../common/promptSyntax/config/promptFileLocations.js";
import { PromptFileParser } from "../../../../common/promptSyntax/promptFileParser.js";
import { PromptCodeActionProvider } from "../../../../common/promptSyntax/languageProviders/promptCodeActions.js";
import { PromptValidatorMarkerCode } from "../../../../common/promptSyntax/languageProviders/promptValidator.js";
import { IFileService } from "../../../../../../../platform/files/common/files.js";
import { CodeActionKind } from "../../../../../../../editor/contrib/codeAction/common/types.js";
suite("PromptCodeActionProvider", () => {
  const disposables = ensureNoDisposablesAreLeakedInTestSuite();
  let instaService;
  let codeActionProvider;
  let fileService;
  let markerData = [];
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
    const deprecatedTool = { id: "oldTool", displayName: "oldTool", canBeReferencedInPrompt: true, modelDescription: "Deprecated Tool", source: ToolDataSource.External, inputSchema: {} };
    disposables.add(toolService.registerToolData(deprecatedTool));
    toolService.getDeprecatedFullReferenceNames = () => {
      const map = /* @__PURE__ */ new Map();
      map.set("oldTool", /* @__PURE__ */ new Set(["newTool1", "newTool2"]));
      map.set("singleDeprecated", /* @__PURE__ */ new Set(["singleReplacement"]));
      return map;
    };
    instaService.set(ILanguageModelToolsService, toolService);
    markerData = [];
    instaService.stub(IMarkerService, { read: () => markerData });
    fileService = {
      canMove: async (source, target) => {
        return true;
      }
    };
    instaService.set(IFileService, fileService);
    const parser = new PromptFileParser();
    instaService.stub(IPromptsService, {
      getParsedPromptFile(model) {
        return parser.parse(model.uri, model.getValue());
      },
      getAgentFileURIFromModeFile(uri) {
        if (uri.path.endsWith(".chatmode.md")) {
          return uri.with({ path: uri.path.replace(".chatmode.md", ".agent.md") });
        }
        return void 0;
      }
    });
    codeActionProvider = instaService.createInstance(PromptCodeActionProvider);
  });
  async function getCodeActions(content, line, column, promptType, fileExtension) {
    const languageId = getLanguageIdForPromptsType(promptType);
    const uri = URI.parse("test:///test" + (fileExtension ?? getPromptFileExtension(promptType)));
    const model = disposables.add(createTextModel(content, languageId, void 0, uri));
    const range = new Range(line, column, line, column);
    const context = { trigger: CodeActionTriggerType.Invoke };
    const result = await codeActionProvider.provideCodeActions(model, range, context, CancellationToken.None);
    if (!result || result.actions.length === 0) {
      return [];
    }
    for (const action of result.actions) {
      assert.equal(action.kind, CodeActionKind.QuickFix.value);
    }
    return result.actions.map((action) => ({
      title: action.title,
      textEdits: action.edit?.edits?.filter((edit) => "textEdit" in edit),
      fileEdits: action.edit?.edits?.filter((edit) => "oldResource" in edit)
    }));
  }
  suite("agent code actions", () => {
    test("no code actions for instructions files", async () => {
      const content = [
        "---",
        'description: "Test instruction"',
        'applyTo: "**/*.ts"',
        "---"
      ].join("\n");
      const actions = await getCodeActions(content, 2, 1, PromptsType.instructions);
      assert.strictEqual(actions.length, 0);
    });
    test("migrate mode file to agent file", async () => {
      const content = [
        "---",
        'name: "Test Mode"',
        'description: "Test mode file"',
        "---"
      ].join("\n");
      const actions = await getCodeActions(content, 1, 1, PromptsType.agent, ".chatmode.md");
      assert.strictEqual(actions.length, 1);
      assert.strictEqual(actions[0].title, `Migrate to custom agent file`);
    });
    test("update deprecated tool names - single replacement", async () => {
      const content = [
        "---",
        'description: "Test"',
        "target: vscode",
        `tools: ['singleDeprecated']`,
        "---"
      ].join("\n");
      const actions = await getCodeActions(content, 4, 10, PromptsType.agent);
      assert.strictEqual(actions.length, 1);
      assert.strictEqual(actions[0].title, `Update to 'singleReplacement'`);
      assert.ok(actions[0].textEdits);
      assert.strictEqual(actions[0].textEdits.length, 1);
      assert.strictEqual(actions[0].textEdits[0].textEdit.text, `'singleReplacement'`);
    });
    test("update deprecated tool names - multiple replacements", async () => {
      const content = [
        "---",
        'description: "Test"',
        "target: vscode",
        `tools: ['oldTool']`,
        "---"
      ].join("\n");
      const actions = await getCodeActions(content, 4, 10, PromptsType.agent);
      assert.strictEqual(actions.length, 1);
      assert.strictEqual(actions[0].title, `Expand to 2 tools`);
      assert.ok(actions[0].textEdits);
      assert.strictEqual(actions[0].textEdits.length, 1);
      assert.strictEqual(actions[0].textEdits[0].textEdit.text, `'newTool1','newTool2'`);
    });
    test("update all deprecated tool names", async () => {
      const content = [
        "---",
        'description: "Test"',
        "target: vscode",
        `tools: ['oldTool', 'singleDeprecated', 'validTool']`,
        "---"
      ].join("\n");
      const actions = await getCodeActions(content, 4, 8, PromptsType.agent);
      assert.strictEqual(actions.length, 1);
      assert.strictEqual(actions[0].title, `Update all tool names`);
      assert.ok(actions[0].textEdits);
      assert.strictEqual(actions[0].textEdits.length, 2);
    });
    test("handles double quotes in tool names", async () => {
      const content = [
        "---",
        'description: "Test"',
        "target: vscode",
        `tools: ["singleDeprecated"]`,
        "---"
      ].join("\n");
      const actions = await getCodeActions(content, 4, 10, PromptsType.agent);
      assert.strictEqual(actions.length, 1);
      assert.strictEqual(actions[0].title, `Update to 'singleReplacement'`);
      assert.ok(actions[0].textEdits);
      assert.strictEqual(actions[0].textEdits[0].textEdit.text, `"singleReplacement"`);
    });
    test("handles unquoted tool names", async () => {
      const content = [
        "---",
        'description: "Test"',
        "target: vscode",
        "tools: [singleDeprecated]",
        // No quotes
        "---"
      ].join("\n");
      const actions = await getCodeActions(content, 4, 10, PromptsType.agent);
      assert.strictEqual(actions.length, 1);
      assert.strictEqual(actions[0].title, `Update to 'singleReplacement'`);
      assert.ok(actions[0].textEdits);
      assert.strictEqual(actions[0].textEdits[0].textEdit.text, `singleReplacement`);
    });
    test("no code actions when range not in tools array", async () => {
      const content = [
        "---",
        'description: "Test"',
        "target: vscode",
        `tools: ['singleDeprecated']`,
        "---"
      ].join("\n");
      const actions = await getCodeActions(content, 2, 1, PromptsType.agent);
      assert.strictEqual(actions.length, 0);
    });
    test("offers quick fix to enable built-in github mcp server", async () => {
      markerData = [{
        code: { value: PromptValidatorMarkerCode.MissingGithubMcpServer, target: URI.parse("https://marketplace.visualstudio.com/items?itemName=io.github.github/github-mcp-server") },
        owner: "prompts-diagnostics-provider",
        resource: URI.parse("test:///test" + getPromptFileExtension(PromptsType.agent)),
        severity: MarkerSeverity.Warning,
        message: "Missing github mcp server",
        startLineNumber: 4,
        startColumn: 9,
        endLineNumber: 4,
        endColumn: 19
      }];
      const content = [
        "---",
        'description: "Test"',
        "target: vscode",
        `tools: ['github/*']`,
        "---"
      ].join("\n");
      const actions = await getCodeActions(content, 4, 11, PromptsType.agent);
      assert.deepStrictEqual(actions.map((action) => action.title), [
        "Enable Built-in GitHub MCP Server",
        "Install GitHub MCP Server from Marketplace"
      ]);
    });
    test("offers quick fix to install playwright mcp server from marketplace", async () => {
      markerData = [{
        code: { value: PromptValidatorMarkerCode.MissingPlaywrightMcpServer, target: URI.parse("https://marketplace.visualstudio.com/items?itemName=microsoft.playwright-mcp") },
        owner: "prompts-diagnostics-provider",
        resource: URI.parse("test:///test" + getPromptFileExtension(PromptsType.agent)),
        severity: MarkerSeverity.Warning,
        message: "Missing playwright mcp server",
        startLineNumber: 4,
        startColumn: 9,
        endLineNumber: 4,
        endColumn: 21
      }];
      const content = [
        "---",
        'description: "Test"',
        "target: vscode",
        `tools: ['playwrite/*']`,
        "---"
      ].join("\n");
      const actions = await getCodeActions(content, 4, 11, PromptsType.agent);
      assert.deepStrictEqual(actions.map((action) => action.title), [
        "Install Playwright MCP Server from Marketplace"
      ]);
    });
    test("offers quick fix to search marketplace for an extension-style tool reference", async () => {
      markerData = [{
        code: PromptValidatorMarkerCode.UnknownExtensionReference,
        owner: "prompts-diagnostics-provider",
        resource: URI.parse("test:///test" + getPromptFileExtension(PromptsType.agent)),
        severity: MarkerSeverity.Hint,
        message: "Unknown extension tool",
        startLineNumber: 4,
        startColumn: 9,
        endLineNumber: 4,
        endColumn: 28
      }];
      const content = [
        "---",
        'description: "Test"',
        "target: vscode",
        `tools: ['my.extension/tool']`,
        "---"
      ].join("\n");
      const actions = await getCodeActions(content, 4, 11, PromptsType.agent);
      assert.deepStrictEqual(actions.map((action) => action.title), [
        `Search Marketplace for Extension 'my.extension'`
      ]);
    });
    test("offers quick fix to search marketplace for an mcp-style tool reference", async () => {
      markerData = [{
        code: PromptValidatorMarkerCode.UnknownMcpServerReference,
        owner: "prompts-diagnostics-provider",
        resource: URI.parse("test:///test" + getPromptFileExtension(PromptsType.agent)),
        severity: MarkerSeverity.Hint,
        message: "Unknown MCP server",
        startLineNumber: 4,
        startColumn: 9,
        endLineNumber: 4,
        endColumn: 59
      }];
      const content = [
        "---",
        'description: "Test"',
        "target: vscode",
        `tools: ['io.github.github/github-mcp-server/create_branch']`,
        "---"
      ].join("\n");
      const actions = await getCodeActions(content, 4, 11, PromptsType.agent);
      assert.deepStrictEqual(actions.map((action) => action.title), [
        `Search Marketplace for MCP Server 'io.github.github/github-mcp-server/create_branch'`
      ]);
    });
  });
  suite("prompt code actions", () => {
    test("rename mode to agent", async () => {
      const content = [
        "---",
        'description: "Test"',
        "mode: edit",
        "---"
      ].join("\n");
      const actions = await getCodeActions(content, 3, 1, PromptsType.prompt);
      assert.strictEqual(actions.length, 1);
      assert.strictEqual(actions[0].title, `Rename to 'agent'`);
      assert.ok(actions[0].textEdits);
      assert.strictEqual(actions[0].textEdits.length, 1);
      assert.strictEqual(actions[0].textEdits[0].textEdit.text, "agent");
    });
    test("update deprecated tool names in prompt", async () => {
      const content = [
        "---",
        'description: "Test"',
        `tools: ['singleDeprecated']`,
        "---"
      ].join("\n");
      const actions = await getCodeActions(content, 3, 10, PromptsType.prompt);
      assert.strictEqual(actions.length, 1);
      assert.strictEqual(actions[0].title, `Update to 'singleReplacement'`);
      assert.ok(actions[0].textEdits);
      assert.strictEqual(actions[0].textEdits.length, 1);
      assert.strictEqual(actions[0].textEdits[0].textEdit.text, `'singleReplacement'`);
    });
    test("no code actions when range not in mode attribute", async () => {
      const content = [
        "---",
        'description: "Test"',
        "mode: edit",
        "---"
      ].join("\n");
      const actions = await getCodeActions(content, 2, 1, PromptsType.prompt);
      assert.strictEqual(actions.length, 0);
    });
    test("both mode and tools code actions available", async () => {
      const content = [
        "---",
        'description: "Test"',
        "mode: edit",
        `tools: ['singleDeprecated']`,
        "---"
      ].join("\n");
      const modeActions = await getCodeActions(content, 3, 1, PromptsType.prompt);
      assert.strictEqual(modeActions.length, 1);
      assert.strictEqual(modeActions[0].title, `Rename to 'agent'`);
      const toolActions = await getCodeActions(content, 4, 10, PromptsType.prompt);
      assert.strictEqual(toolActions.length, 1);
      assert.strictEqual(toolActions[0].title, `Update to 'singleReplacement'`);
    });
  });
  test("returns undefined when no code actions available", async () => {
    const content = [
      "---",
      'description: "Test"',
      "target: vscode",
      `tools: ['validTool']`,
      // No deprecated tools
      "---"
    ].join("\n");
    const actions = await getCodeActions(content, 4, 10, PromptsType.agent);
    assert.strictEqual(actions.length, 0);
  });
  test("uses comma-space delimiter when separator includes comma", async () => {
    const content = [
      "---",
      'description: "Test"',
      "target: vscode",
      `tools: ['oldTool', 'validTool']`,
      "---"
    ].join("\n");
    const actions = await getCodeActions(content, 4, 10, PromptsType.agent);
    assert.strictEqual(actions.length, 1);
    assert.strictEqual(actions[0].title, `Expand to 2 tools`);
    assert.ok(actions[0].textEdits);
    assert.strictEqual(actions[0].textEdits[0].textEdit.text, `'newTool1', 'newTool2'`);
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXGNoYXRcXHRlc3RcXGJyb3dzZXJcXHByb21wdFN5bnRheFxcbGFuZ3VhZ2VQcm92aWRlcnNcXHByb21wdENvZGVBY3Rpb25zLnRlc3QudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgYXNzZXJ0IGZyb20gJ2Fzc2VydCc7XG5pbXBvcnQgeyBDYW5jZWxsYXRpb25Ub2tlbiB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2NhbmNlbGxhdGlvbi5qcyc7XG5pbXBvcnQgeyBVUkkgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi91cmkuanMnO1xuaW1wb3J0IHsgZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS90ZXN0L2NvbW1vbi91dGlscy5qcyc7XG5pbXBvcnQgeyBSYW5nZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vY29yZS9yYW5nZS5qcyc7XG5pbXBvcnQgeyBDb2RlQWN0aW9uQ29udGV4dCwgQ29kZUFjdGlvblRyaWdnZXJUeXBlLCBJV29ya3NwYWNlVGV4dEVkaXQsIElXb3Jrc3BhY2VGaWxlRWRpdCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vbGFuZ3VhZ2VzLmpzJztcbmltcG9ydCB7IGNyZWF0ZVRleHRNb2RlbCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uLy4uL2VkaXRvci90ZXN0L2NvbW1vbi90ZXN0VGV4dE1vZGVsLmpzJztcbmltcG9ydCB7IElUZXh0TW9kZWwgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL21vZGVsLmpzJztcbmltcG9ydCB7IFRlc3RDb25maWd1cmF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbmZpZ3VyYXRpb24vdGVzdC9jb21tb24vdGVzdENvbmZpZ3VyYXRpb25TZXJ2aWNlLmpzJztcbmltcG9ydCB7IENvbnRleHRLZXlTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29udGV4dGtleS9icm93c2VyL2NvbnRleHRLZXlTZXJ2aWNlLmpzJztcbmltcG9ydCB7IFRlc3RJbnN0YW50aWF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2luc3RhbnRpYXRpb24vdGVzdC9jb21tb24vaW5zdGFudGlhdGlvblNlcnZpY2VNb2NrLmpzJztcbmltcG9ydCB7IElNYXJrZXIsIElNYXJrZXJTZXJ2aWNlLCBNYXJrZXJTZXZlcml0eSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL21hcmtlcnMvY29tbW9uL21hcmtlcnMuanMnO1xuaW1wb3J0IHsgd29ya2JlbmNoSW5zdGFudGlhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi90ZXN0L2Jyb3dzZXIvd29ya2JlbmNoVGVzdFNlcnZpY2VzLmpzJztcbmltcG9ydCB7IENoYXRDb25maWd1cmF0aW9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vY29tbW9uL2NvbnN0YW50cy5qcyc7XG5pbXBvcnQgeyBJTGFuZ3VhZ2VNb2RlbFRvb2xzU2VydmljZSwgSVRvb2xEYXRhLCBUb29sRGF0YVNvdXJjZSB9IGZyb20gJy4uLy4uLy4uLy4uL2NvbW1vbi90b29scy9sYW5ndWFnZU1vZGVsVG9vbHNTZXJ2aWNlLmpzJztcbmltcG9ydCB7IExhbmd1YWdlTW9kZWxUb29sc1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9icm93c2VyL3Rvb2xzL2xhbmd1YWdlTW9kZWxUb29sc1NlcnZpY2UuanMnO1xuaW1wb3J0IHsgSVByb21wdHNTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vY29tbW9uL3Byb21wdFN5bnRheC9zZXJ2aWNlL3Byb21wdHNTZXJ2aWNlLmpzJztcbmltcG9ydCB7IGdldExhbmd1YWdlSWRGb3JQcm9tcHRzVHlwZSwgUHJvbXB0c1R5cGUgfSBmcm9tICcuLi8uLi8uLi8uLi9jb21tb24vcHJvbXB0U3ludGF4L3Byb21wdFR5cGVzLmpzJztcbmltcG9ydCB7IGdldFByb21wdEZpbGVFeHRlbnNpb24gfSBmcm9tICcuLi8uLi8uLi8uLi9jb21tb24vcHJvbXB0U3ludGF4L2NvbmZpZy9wcm9tcHRGaWxlTG9jYXRpb25zLmpzJztcbmltcG9ydCB7IFByb21wdEZpbGVQYXJzZXIgfSBmcm9tICcuLi8uLi8uLi8uLi9jb21tb24vcHJvbXB0U3ludGF4L3Byb21wdEZpbGVQYXJzZXIuanMnO1xuaW1wb3J0IHsgUHJvbXB0Q29kZUFjdGlvblByb3ZpZGVyIH0gZnJvbSAnLi4vLi4vLi4vLi4vY29tbW9uL3Byb21wdFN5bnRheC9sYW5ndWFnZVByb3ZpZGVycy9wcm9tcHRDb2RlQWN0aW9ucy5qcyc7XG5pbXBvcnQgeyBQcm9tcHRWYWxpZGF0b3JNYXJrZXJDb2RlIH0gZnJvbSAnLi4vLi4vLi4vLi4vY29tbW9uL3Byb21wdFN5bnRheC9sYW5ndWFnZVByb3ZpZGVycy9wcm9tcHRWYWxpZGF0b3IuanMnO1xuaW1wb3J0IHsgSUZpbGVTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vZmlsZXMvY29tbW9uL2ZpbGVzLmpzJztcbmltcG9ydCB7IENvZGVBY3Rpb25LaW5kIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vLi4vZWRpdG9yL2NvbnRyaWIvY29kZUFjdGlvbi9jb21tb24vdHlwZXMuanMnO1xuXG5zdWl0ZSgnUHJvbXB0Q29kZUFjdGlvblByb3ZpZGVyJywgKCkgPT4ge1xuXHRjb25zdCBkaXNwb3NhYmxlcyA9IGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSgpO1xuXG5cdGxldCBpbnN0YVNlcnZpY2U6IFRlc3RJbnN0YW50aWF0aW9uU2VydmljZTtcblx0bGV0IGNvZGVBY3Rpb25Qcm92aWRlcjogUHJvbXB0Q29kZUFjdGlvblByb3ZpZGVyO1xuXHRsZXQgZmlsZVNlcnZpY2U6IElGaWxlU2VydmljZTtcblx0bGV0IG1hcmtlckRhdGE6IElNYXJrZXJbXSA9IFtdO1xuXG5cdHNldHVwKGFzeW5jICgpID0+IHtcblx0XHRjb25zdCB0ZXN0Q29uZmlnU2VydmljZSA9IG5ldyBUZXN0Q29uZmlndXJhdGlvblNlcnZpY2UoKTtcblx0XHR0ZXN0Q29uZmlnU2VydmljZS5zZXRVc2VyQ29uZmlndXJhdGlvbihDaGF0Q29uZmlndXJhdGlvbi5FeHRlbnNpb25Ub29sc0VuYWJsZWQsIHRydWUpO1xuXHRcdGluc3RhU2VydmljZSA9IHdvcmtiZW5jaEluc3RhbnRpYXRpb25TZXJ2aWNlKHtcblx0XHRcdGNvbnRleHRLZXlTZXJ2aWNlOiAoKSA9PiBkaXNwb3NhYmxlcy5hZGQobmV3IENvbnRleHRLZXlTZXJ2aWNlKHRlc3RDb25maWdTZXJ2aWNlKSksXG5cdFx0XHRjb25maWd1cmF0aW9uU2VydmljZTogKCkgPT4gdGVzdENvbmZpZ1NlcnZpY2Vcblx0XHR9LCBkaXNwb3NhYmxlcyk7XG5cblx0XHRjb25zdCB0b29sU2VydmljZSA9IGRpc3Bvc2FibGVzLmFkZChpbnN0YVNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoTGFuZ3VhZ2VNb2RlbFRvb2xzU2VydmljZSkpO1xuXG5cdFx0Ly8gUmVnaXN0ZXIgdGVzdCB0b29scyBpbmNsdWRpbmcgZGVwcmVjYXRlZCBvbmVzXG5cdFx0Y29uc3QgdGVzdFRvb2wxID0geyBpZDogJ3Rlc3RUb29sMScsIGRpc3BsYXlOYW1lOiAndG9vbDEnLCBjYW5CZVJlZmVyZW5jZWRJblByb21wdDogdHJ1ZSwgbW9kZWxEZXNjcmlwdGlvbjogJ1Rlc3QgVG9vbCAxJywgc291cmNlOiBUb29sRGF0YVNvdXJjZS5FeHRlcm5hbCwgaW5wdXRTY2hlbWE6IHt9IH0gc2F0aXNmaWVzIElUb29sRGF0YTtcblx0XHRkaXNwb3NhYmxlcy5hZGQodG9vbFNlcnZpY2UucmVnaXN0ZXJUb29sRGF0YSh0ZXN0VG9vbDEpKTtcblxuXHRcdGNvbnN0IGRlcHJlY2F0ZWRUb29sID0geyBpZDogJ29sZFRvb2wnLCBkaXNwbGF5TmFtZTogJ29sZFRvb2wnLCBjYW5CZVJlZmVyZW5jZWRJblByb21wdDogdHJ1ZSwgbW9kZWxEZXNjcmlwdGlvbjogJ0RlcHJlY2F0ZWQgVG9vbCcsIHNvdXJjZTogVG9vbERhdGFTb3VyY2UuRXh0ZXJuYWwsIGlucHV0U2NoZW1hOiB7fSB9IHNhdGlzZmllcyBJVG9vbERhdGE7XG5cdFx0ZGlzcG9zYWJsZXMuYWRkKHRvb2xTZXJ2aWNlLnJlZ2lzdGVyVG9vbERhdGEoZGVwcmVjYXRlZFRvb2wpKTtcblxuXHRcdC8vIE1vY2sgZGVwcmVjYXRlZCB0b29sIG5hbWVzXG5cdFx0dG9vbFNlcnZpY2UuZ2V0RGVwcmVjYXRlZEZ1bGxSZWZlcmVuY2VOYW1lcyA9ICgpID0+IHtcblx0XHRcdGNvbnN0IG1hcCA9IG5ldyBNYXA8c3RyaW5nLCBTZXQ8c3RyaW5nPj4oKTtcblx0XHRcdG1hcC5zZXQoJ29sZFRvb2wnLCBuZXcgU2V0KFsnbmV3VG9vbDEnLCAnbmV3VG9vbDInXSkpO1xuXHRcdFx0bWFwLnNldCgnc2luZ2xlRGVwcmVjYXRlZCcsIG5ldyBTZXQoWydzaW5nbGVSZXBsYWNlbWVudCddKSk7XG5cdFx0XHRyZXR1cm4gbWFwO1xuXHRcdH07XG5cblx0XHRpbnN0YVNlcnZpY2Uuc2V0KElMYW5ndWFnZU1vZGVsVG9vbHNTZXJ2aWNlLCB0b29sU2VydmljZSk7XG5cdFx0bWFya2VyRGF0YSA9IFtdO1xuXHRcdGluc3RhU2VydmljZS5zdHViKElNYXJrZXJTZXJ2aWNlLCB7IHJlYWQ6ICgpID0+IG1hcmtlckRhdGEgfSk7XG5cblx0XHRmaWxlU2VydmljZSA9IHtcblx0XHRcdGNhbk1vdmU6IGFzeW5jIChzb3VyY2U6IFVSSSwgdGFyZ2V0OiBVUkkpID0+IHtcblx0XHRcdFx0Ly8gTW9jayBmaWxlIHNlcnZpY2UgdGhhdCBhbGxvd3MgbW92ZXMgZm9yIHRlc3Rpbmdcblx0XHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0XHR9XG5cdFx0fSBhcyBJRmlsZVNlcnZpY2U7XG5cdFx0aW5zdGFTZXJ2aWNlLnNldChJRmlsZVNlcnZpY2UsIGZpbGVTZXJ2aWNlKTtcblxuXHRcdGNvbnN0IHBhcnNlciA9IG5ldyBQcm9tcHRGaWxlUGFyc2VyKCk7XG5cdFx0aW5zdGFTZXJ2aWNlLnN0dWIoSVByb21wdHNTZXJ2aWNlLCB7XG5cdFx0XHRnZXRQYXJzZWRQcm9tcHRGaWxlKG1vZGVsOiBJVGV4dE1vZGVsKSB7XG5cdFx0XHRcdHJldHVybiBwYXJzZXIucGFyc2UobW9kZWwudXJpLCBtb2RlbC5nZXRWYWx1ZSgpKTtcblx0XHRcdH0sXG5cdFx0XHRnZXRBZ2VudEZpbGVVUklGcm9tTW9kZUZpbGUodXJpOiBVUkkpIHtcblx0XHRcdFx0Ly8gTW9jayBjb252ZXJzaW9uIGZyb20gLmNoYXRtb2RlLm1kIHRvIC5hZ2VudC5tZFxuXHRcdFx0XHRpZiAodXJpLnBhdGguZW5kc1dpdGgoJy5jaGF0bW9kZS5tZCcpKSB7XG5cdFx0XHRcdFx0cmV0dXJuIHVyaS53aXRoKHsgcGF0aDogdXJpLnBhdGgucmVwbGFjZSgnLmNoYXRtb2RlLm1kJywgJy5hZ2VudC5tZCcpIH0pO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0XHR9XG5cdFx0fSk7XG5cblx0XHRjb2RlQWN0aW9uUHJvdmlkZXIgPSBpbnN0YVNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoUHJvbXB0Q29kZUFjdGlvblByb3ZpZGVyKTtcblx0fSk7XG5cblx0YXN5bmMgZnVuY3Rpb24gZ2V0Q29kZUFjdGlvbnMoY29udGVudDogc3RyaW5nLCBsaW5lOiBudW1iZXIsIGNvbHVtbjogbnVtYmVyLCBwcm9tcHRUeXBlOiBQcm9tcHRzVHlwZSwgZmlsZUV4dGVuc2lvbj86IHN0cmluZyk6IFByb21pc2U8eyB0aXRsZTogc3RyaW5nOyB0ZXh0RWRpdHM/OiBJV29ya3NwYWNlVGV4dEVkaXRbXTsgZmlsZUVkaXRzPzogSVdvcmtzcGFjZUZpbGVFZGl0W10gfVtdPiB7XG5cdFx0Y29uc3QgbGFuZ3VhZ2VJZCA9IGdldExhbmd1YWdlSWRGb3JQcm9tcHRzVHlwZShwcm9tcHRUeXBlKTtcblx0XHRjb25zdCB1cmkgPSBVUkkucGFyc2UoJ3Rlc3Q6Ly8vdGVzdCcgKyAoZmlsZUV4dGVuc2lvbiA/PyBnZXRQcm9tcHRGaWxlRXh0ZW5zaW9uKHByb21wdFR5cGUpKSk7XG5cdFx0Y29uc3QgbW9kZWwgPSBkaXNwb3NhYmxlcy5hZGQoY3JlYXRlVGV4dE1vZGVsKGNvbnRlbnQsIGxhbmd1YWdlSWQsIHVuZGVmaW5lZCwgdXJpKSk7XG5cdFx0Y29uc3QgcmFuZ2UgPSBuZXcgUmFuZ2UobGluZSwgY29sdW1uLCBsaW5lLCBjb2x1bW4pO1xuXHRcdGNvbnN0IGNvbnRleHQ6IENvZGVBY3Rpb25Db250ZXh0ID0geyB0cmlnZ2VyOiBDb2RlQWN0aW9uVHJpZ2dlclR5cGUuSW52b2tlIH07XG5cblx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCBjb2RlQWN0aW9uUHJvdmlkZXIucHJvdmlkZUNvZGVBY3Rpb25zKG1vZGVsLCByYW5nZSwgY29udGV4dCwgQ2FuY2VsbGF0aW9uVG9rZW4uTm9uZSk7XG5cdFx0aWYgKCFyZXN1bHQgfHwgcmVzdWx0LmFjdGlvbnMubGVuZ3RoID09PSAwKSB7XG5cdFx0XHRyZXR1cm4gW107XG5cdFx0fVxuXG5cdFx0Zm9yIChjb25zdCBhY3Rpb24gb2YgcmVzdWx0LmFjdGlvbnMpIHtcblx0XHRcdGFzc2VydC5lcXVhbChhY3Rpb24ua2luZCwgQ29kZUFjdGlvbktpbmQuUXVpY2tGaXgudmFsdWUpO1xuXHRcdH1cblxuXHRcdHJldHVybiByZXN1bHQuYWN0aW9ucy5tYXAoYWN0aW9uID0+ICh7XG5cdFx0XHR0aXRsZTogYWN0aW9uLnRpdGxlLFxuXHRcdFx0dGV4dEVkaXRzOiBhY3Rpb24uZWRpdD8uZWRpdHM/LmZpbHRlcigoZWRpdCk6IGVkaXQgaXMgSVdvcmtzcGFjZVRleHRFZGl0ID0+ICd0ZXh0RWRpdCcgaW4gZWRpdCksXG5cdFx0XHRmaWxlRWRpdHM6IGFjdGlvbi5lZGl0Py5lZGl0cz8uZmlsdGVyKChlZGl0KTogZWRpdCBpcyBJV29ya3NwYWNlRmlsZUVkaXQgPT4gJ29sZFJlc291cmNlJyBpbiBlZGl0KVxuXHRcdH0pKTtcblx0fVxuXG5cdHN1aXRlKCdhZ2VudCBjb2RlIGFjdGlvbnMnLCAoKSA9PiB7XG5cdFx0dGVzdCgnbm8gY29kZSBhY3Rpb25zIGZvciBpbnN0cnVjdGlvbnMgZmlsZXMnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCBjb250ZW50ID0gW1xuXHRcdFx0XHQnLS0tJyxcblx0XHRcdFx0J2Rlc2NyaXB0aW9uOiBcIlRlc3QgaW5zdHJ1Y3Rpb25cIicsXG5cdFx0XHRcdCdhcHBseVRvOiBcIioqLyoudHNcIicsXG5cdFx0XHRcdCctLS0nLFxuXHRcdFx0XS5qb2luKCdcXG4nKTtcblx0XHRcdGNvbnN0IGFjdGlvbnMgPSBhd2FpdCBnZXRDb2RlQWN0aW9ucyhjb250ZW50LCAyLCAxLCBQcm9tcHRzVHlwZS5pbnN0cnVjdGlvbnMpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGFjdGlvbnMubGVuZ3RoLCAwKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ21pZ3JhdGUgbW9kZSBmaWxlIHRvIGFnZW50IGZpbGUnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCBjb250ZW50ID0gW1xuXHRcdFx0XHQnLS0tJyxcblx0XHRcdFx0J25hbWU6IFwiVGVzdCBNb2RlXCInLFxuXHRcdFx0XHQnZGVzY3JpcHRpb246IFwiVGVzdCBtb2RlIGZpbGVcIicsXG5cdFx0XHRcdCctLS0nLFxuXHRcdFx0XS5qb2luKCdcXG4nKTtcblx0XHRcdGNvbnN0IGFjdGlvbnMgPSBhd2FpdCBnZXRDb2RlQWN0aW9ucyhjb250ZW50LCAxLCAxLCBQcm9tcHRzVHlwZS5hZ2VudCwgJy5jaGF0bW9kZS5tZCcpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGFjdGlvbnMubGVuZ3RoLCAxKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChhY3Rpb25zWzBdLnRpdGxlLCBgTWlncmF0ZSB0byBjdXN0b20gYWdlbnQgZmlsZWApO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgndXBkYXRlIGRlcHJlY2F0ZWQgdG9vbCBuYW1lcyAtIHNpbmdsZSByZXBsYWNlbWVudCcsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IGNvbnRlbnQgPSBbXG5cdFx0XHRcdCctLS0nLFxuXHRcdFx0XHQnZGVzY3JpcHRpb246IFwiVGVzdFwiJyxcblx0XHRcdFx0J3RhcmdldDogdnNjb2RlJyxcblx0XHRcdFx0YHRvb2xzOiBbJ3NpbmdsZURlcHJlY2F0ZWQnXWAsXG5cdFx0XHRcdCctLS0nLFxuXHRcdFx0XS5qb2luKCdcXG4nKTtcblx0XHRcdGNvbnN0IGFjdGlvbnMgPSBhd2FpdCBnZXRDb2RlQWN0aW9ucyhjb250ZW50LCA0LCAxMCwgUHJvbXB0c1R5cGUuYWdlbnQpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGFjdGlvbnMubGVuZ3RoLCAxKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChhY3Rpb25zWzBdLnRpdGxlLCBgVXBkYXRlIHRvICdzaW5nbGVSZXBsYWNlbWVudCdgKTtcblx0XHRcdGFzc2VydC5vayhhY3Rpb25zWzBdLnRleHRFZGl0cyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYWN0aW9uc1swXS50ZXh0RWRpdHMhLmxlbmd0aCwgMSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYWN0aW9uc1swXS50ZXh0RWRpdHMhWzBdLnRleHRFZGl0LnRleHQsIGAnc2luZ2xlUmVwbGFjZW1lbnQnYCk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCd1cGRhdGUgZGVwcmVjYXRlZCB0b29sIG5hbWVzIC0gbXVsdGlwbGUgcmVwbGFjZW1lbnRzJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgY29udGVudCA9IFtcblx0XHRcdFx0Jy0tLScsXG5cdFx0XHRcdCdkZXNjcmlwdGlvbjogXCJUZXN0XCInLFxuXHRcdFx0XHQndGFyZ2V0OiB2c2NvZGUnLFxuXHRcdFx0XHRgdG9vbHM6IFsnb2xkVG9vbCddYCxcblx0XHRcdFx0Jy0tLScsXG5cdFx0XHRdLmpvaW4oJ1xcbicpO1xuXHRcdFx0Y29uc3QgYWN0aW9ucyA9IGF3YWl0IGdldENvZGVBY3Rpb25zKGNvbnRlbnQsIDQsIDEwLCBQcm9tcHRzVHlwZS5hZ2VudCk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYWN0aW9ucy5sZW5ndGgsIDEpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGFjdGlvbnNbMF0udGl0bGUsIGBFeHBhbmQgdG8gMiB0b29sc2ApO1xuXHRcdFx0YXNzZXJ0Lm9rKGFjdGlvbnNbMF0udGV4dEVkaXRzKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChhY3Rpb25zWzBdLnRleHRFZGl0cyEubGVuZ3RoLCAxKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChhY3Rpb25zWzBdLnRleHRFZGl0cyFbMF0udGV4dEVkaXQudGV4dCwgYCduZXdUb29sMScsJ25ld1Rvb2wyJ2ApO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgndXBkYXRlIGFsbCBkZXByZWNhdGVkIHRvb2wgbmFtZXMnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCBjb250ZW50ID0gW1xuXHRcdFx0XHQnLS0tJyxcblx0XHRcdFx0J2Rlc2NyaXB0aW9uOiBcIlRlc3RcIicsXG5cdFx0XHRcdCd0YXJnZXQ6IHZzY29kZScsXG5cdFx0XHRcdGB0b29sczogWydvbGRUb29sJywgJ3NpbmdsZURlcHJlY2F0ZWQnLCAndmFsaWRUb29sJ11gLFxuXHRcdFx0XHQnLS0tJyxcblx0XHRcdF0uam9pbignXFxuJyk7XG5cdFx0XHRjb25zdCBhY3Rpb25zID0gYXdhaXQgZ2V0Q29kZUFjdGlvbnMoY29udGVudCwgNCwgOCwgUHJvbXB0c1R5cGUuYWdlbnQpOyAvLyBQb3NpdGlvbiBhdCB0aGUgYnJhY2tldFxuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGFjdGlvbnMubGVuZ3RoLCAxKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChhY3Rpb25zWzBdLnRpdGxlLCBgVXBkYXRlIGFsbCB0b29sIG5hbWVzYCk7XG5cdFx0XHRhc3NlcnQub2soYWN0aW9uc1swXS50ZXh0RWRpdHMpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGFjdGlvbnNbMF0udGV4dEVkaXRzIS5sZW5ndGgsIDIpOyAvLyBPbmx5IGRlcHJlY2F0ZWQgdG9vbHMgYXJlIHVwZGF0ZWRcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2hhbmRsZXMgZG91YmxlIHF1b3RlcyBpbiB0b29sIG5hbWVzJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgY29udGVudCA9IFtcblx0XHRcdFx0Jy0tLScsXG5cdFx0XHRcdCdkZXNjcmlwdGlvbjogXCJUZXN0XCInLFxuXHRcdFx0XHQndGFyZ2V0OiB2c2NvZGUnLFxuXHRcdFx0XHRgdG9vbHM6IFtcInNpbmdsZURlcHJlY2F0ZWRcIl1gLFxuXHRcdFx0XHQnLS0tJyxcblx0XHRcdF0uam9pbignXFxuJyk7XG5cdFx0XHRjb25zdCBhY3Rpb25zID0gYXdhaXQgZ2V0Q29kZUFjdGlvbnMoY29udGVudCwgNCwgMTAsIFByb21wdHNUeXBlLmFnZW50KTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChhY3Rpb25zLmxlbmd0aCwgMSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYWN0aW9uc1swXS50aXRsZSwgYFVwZGF0ZSB0byAnc2luZ2xlUmVwbGFjZW1lbnQnYCk7XG5cdFx0XHRhc3NlcnQub2soYWN0aW9uc1swXS50ZXh0RWRpdHMpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGFjdGlvbnNbMF0udGV4dEVkaXRzIVswXS50ZXh0RWRpdC50ZXh0LCBgXCJzaW5nbGVSZXBsYWNlbWVudFwiYCk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdoYW5kbGVzIHVucXVvdGVkIHRvb2wgbmFtZXMnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCBjb250ZW50ID0gW1xuXHRcdFx0XHQnLS0tJyxcblx0XHRcdFx0J2Rlc2NyaXB0aW9uOiBcIlRlc3RcIicsXG5cdFx0XHRcdCd0YXJnZXQ6IHZzY29kZScsXG5cdFx0XHRcdCd0b29sczogW3NpbmdsZURlcHJlY2F0ZWRdJywgLy8gTm8gcXVvdGVzXG5cdFx0XHRcdCctLS0nLFxuXHRcdFx0XS5qb2luKCdcXG4nKTtcblx0XHRcdGNvbnN0IGFjdGlvbnMgPSBhd2FpdCBnZXRDb2RlQWN0aW9ucyhjb250ZW50LCA0LCAxMCwgUHJvbXB0c1R5cGUuYWdlbnQpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGFjdGlvbnMubGVuZ3RoLCAxKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChhY3Rpb25zWzBdLnRpdGxlLCBgVXBkYXRlIHRvICdzaW5nbGVSZXBsYWNlbWVudCdgKTtcblx0XHRcdGFzc2VydC5vayhhY3Rpb25zWzBdLnRleHRFZGl0cyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYWN0aW9uc1swXS50ZXh0RWRpdHMhWzBdLnRleHRFZGl0LnRleHQsIGBzaW5nbGVSZXBsYWNlbWVudGApOyAvLyBObyBxdW90ZXMgcHJlc2VydmVkXG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdubyBjb2RlIGFjdGlvbnMgd2hlbiByYW5nZSBub3QgaW4gdG9vbHMgYXJyYXknLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCBjb250ZW50ID0gW1xuXHRcdFx0XHQnLS0tJyxcblx0XHRcdFx0J2Rlc2NyaXB0aW9uOiBcIlRlc3RcIicsXG5cdFx0XHRcdCd0YXJnZXQ6IHZzY29kZScsXG5cdFx0XHRcdGB0b29sczogWydzaW5nbGVEZXByZWNhdGVkJ11gLFxuXHRcdFx0XHQnLS0tJyxcblx0XHRcdF0uam9pbignXFxuJyk7XG5cdFx0XHRjb25zdCBhY3Rpb25zID0gYXdhaXQgZ2V0Q29kZUFjdGlvbnMoY29udGVudCwgMiwgMSwgUHJvbXB0c1R5cGUuYWdlbnQpOyAvLyBSYW5nZSBpbiBkZXNjcmlwdGlvbiwgbm90IHRvb2xzXG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYWN0aW9ucy5sZW5ndGgsIDApO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnb2ZmZXJzIHF1aWNrIGZpeCB0byBlbmFibGUgYnVpbHQtaW4gZ2l0aHViIG1jcCBzZXJ2ZXInLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRtYXJrZXJEYXRhID0gW3tcblx0XHRcdFx0Y29kZTogeyB2YWx1ZTogUHJvbXB0VmFsaWRhdG9yTWFya2VyQ29kZS5NaXNzaW5nR2l0aHViTWNwU2VydmVyLCB0YXJnZXQ6IFVSSS5wYXJzZSgnaHR0cHM6Ly9tYXJrZXRwbGFjZS52aXN1YWxzdHVkaW8uY29tL2l0ZW1zP2l0ZW1OYW1lPWlvLmdpdGh1Yi5naXRodWIvZ2l0aHViLW1jcC1zZXJ2ZXInKSB9LFxuXHRcdFx0XHRvd25lcjogJ3Byb21wdHMtZGlhZ25vc3RpY3MtcHJvdmlkZXInLFxuXHRcdFx0XHRyZXNvdXJjZTogVVJJLnBhcnNlKCd0ZXN0Oi8vL3Rlc3QnICsgZ2V0UHJvbXB0RmlsZUV4dGVuc2lvbihQcm9tcHRzVHlwZS5hZ2VudCkpLFxuXHRcdFx0XHRzZXZlcml0eTogTWFya2VyU2V2ZXJpdHkuV2FybmluZyxcblx0XHRcdFx0bWVzc2FnZTogJ01pc3NpbmcgZ2l0aHViIG1jcCBzZXJ2ZXInLFxuXHRcdFx0XHRzdGFydExpbmVOdW1iZXI6IDQsXG5cdFx0XHRcdHN0YXJ0Q29sdW1uOiA5LFxuXHRcdFx0XHRlbmRMaW5lTnVtYmVyOiA0LFxuXHRcdFx0XHRlbmRDb2x1bW46IDE5XG5cdFx0XHR9XTtcblx0XHRcdGNvbnN0IGNvbnRlbnQgPSBbXG5cdFx0XHRcdCctLS0nLFxuXHRcdFx0XHQnZGVzY3JpcHRpb246IFwiVGVzdFwiJyxcblx0XHRcdFx0J3RhcmdldDogdnNjb2RlJyxcblx0XHRcdFx0YHRvb2xzOiBbJ2dpdGh1Yi8qJ11gLFxuXHRcdFx0XHQnLS0tJyxcblx0XHRcdF0uam9pbignXFxuJyk7XG5cdFx0XHRjb25zdCBhY3Rpb25zID0gYXdhaXQgZ2V0Q29kZUFjdGlvbnMoY29udGVudCwgNCwgMTEsIFByb21wdHNUeXBlLmFnZW50KTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoYWN0aW9ucy5tYXAoYWN0aW9uID0+IGFjdGlvbi50aXRsZSksIFtcblx0XHRcdFx0J0VuYWJsZSBCdWlsdC1pbiBHaXRIdWIgTUNQIFNlcnZlcicsXG5cdFx0XHRcdCdJbnN0YWxsIEdpdEh1YiBNQ1AgU2VydmVyIGZyb20gTWFya2V0cGxhY2UnXG5cdFx0XHRdKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ29mZmVycyBxdWljayBmaXggdG8gaW5zdGFsbCBwbGF5d3JpZ2h0IG1jcCBzZXJ2ZXIgZnJvbSBtYXJrZXRwbGFjZScsIGFzeW5jICgpID0+IHtcblx0XHRcdG1hcmtlckRhdGEgPSBbe1xuXHRcdFx0XHRjb2RlOiB7IHZhbHVlOiBQcm9tcHRWYWxpZGF0b3JNYXJrZXJDb2RlLk1pc3NpbmdQbGF5d3JpZ2h0TWNwU2VydmVyLCB0YXJnZXQ6IFVSSS5wYXJzZSgnaHR0cHM6Ly9tYXJrZXRwbGFjZS52aXN1YWxzdHVkaW8uY29tL2l0ZW1zP2l0ZW1OYW1lPW1pY3Jvc29mdC5wbGF5d3JpZ2h0LW1jcCcpIH0sXG5cdFx0XHRcdG93bmVyOiAncHJvbXB0cy1kaWFnbm9zdGljcy1wcm92aWRlcicsXG5cdFx0XHRcdHJlc291cmNlOiBVUkkucGFyc2UoJ3Rlc3Q6Ly8vdGVzdCcgKyBnZXRQcm9tcHRGaWxlRXh0ZW5zaW9uKFByb21wdHNUeXBlLmFnZW50KSksXG5cdFx0XHRcdHNldmVyaXR5OiBNYXJrZXJTZXZlcml0eS5XYXJuaW5nLFxuXHRcdFx0XHRtZXNzYWdlOiAnTWlzc2luZyBwbGF5d3JpZ2h0IG1jcCBzZXJ2ZXInLFxuXHRcdFx0XHRzdGFydExpbmVOdW1iZXI6IDQsXG5cdFx0XHRcdHN0YXJ0Q29sdW1uOiA5LFxuXHRcdFx0XHRlbmRMaW5lTnVtYmVyOiA0LFxuXHRcdFx0XHRlbmRDb2x1bW46IDIxXG5cdFx0XHR9XTtcblx0XHRcdGNvbnN0IGNvbnRlbnQgPSBbXG5cdFx0XHRcdCctLS0nLFxuXHRcdFx0XHQnZGVzY3JpcHRpb246IFwiVGVzdFwiJyxcblx0XHRcdFx0J3RhcmdldDogdnNjb2RlJyxcblx0XHRcdFx0YHRvb2xzOiBbJ3BsYXl3cml0ZS8qJ11gLFxuXHRcdFx0XHQnLS0tJyxcblx0XHRcdF0uam9pbignXFxuJyk7XG5cdFx0XHRjb25zdCBhY3Rpb25zID0gYXdhaXQgZ2V0Q29kZUFjdGlvbnMoY29udGVudCwgNCwgMTEsIFByb21wdHNUeXBlLmFnZW50KTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoYWN0aW9ucy5tYXAoYWN0aW9uID0+IGFjdGlvbi50aXRsZSksIFtcblx0XHRcdFx0J0luc3RhbGwgUGxheXdyaWdodCBNQ1AgU2VydmVyIGZyb20gTWFya2V0cGxhY2UnXG5cdFx0XHRdKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ29mZmVycyBxdWljayBmaXggdG8gc2VhcmNoIG1hcmtldHBsYWNlIGZvciBhbiBleHRlbnNpb24tc3R5bGUgdG9vbCByZWZlcmVuY2UnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRtYXJrZXJEYXRhID0gW3tcblx0XHRcdFx0Y29kZTogUHJvbXB0VmFsaWRhdG9yTWFya2VyQ29kZS5Vbmtub3duRXh0ZW5zaW9uUmVmZXJlbmNlLFxuXHRcdFx0XHRvd25lcjogJ3Byb21wdHMtZGlhZ25vc3RpY3MtcHJvdmlkZXInLFxuXHRcdFx0XHRyZXNvdXJjZTogVVJJLnBhcnNlKCd0ZXN0Oi8vL3Rlc3QnICsgZ2V0UHJvbXB0RmlsZUV4dGVuc2lvbihQcm9tcHRzVHlwZS5hZ2VudCkpLFxuXHRcdFx0XHRzZXZlcml0eTogTWFya2VyU2V2ZXJpdHkuSGludCxcblx0XHRcdFx0bWVzc2FnZTogJ1Vua25vd24gZXh0ZW5zaW9uIHRvb2wnLFxuXHRcdFx0XHRzdGFydExpbmVOdW1iZXI6IDQsXG5cdFx0XHRcdHN0YXJ0Q29sdW1uOiA5LFxuXHRcdFx0XHRlbmRMaW5lTnVtYmVyOiA0LFxuXHRcdFx0XHRlbmRDb2x1bW46IDI4XG5cdFx0XHR9XTtcblx0XHRcdGNvbnN0IGNvbnRlbnQgPSBbXG5cdFx0XHRcdCctLS0nLFxuXHRcdFx0XHQnZGVzY3JpcHRpb246IFwiVGVzdFwiJyxcblx0XHRcdFx0J3RhcmdldDogdnNjb2RlJyxcblx0XHRcdFx0YHRvb2xzOiBbJ215LmV4dGVuc2lvbi90b29sJ11gLFxuXHRcdFx0XHQnLS0tJyxcblx0XHRcdF0uam9pbignXFxuJyk7XG5cdFx0XHRjb25zdCBhY3Rpb25zID0gYXdhaXQgZ2V0Q29kZUFjdGlvbnMoY29udGVudCwgNCwgMTEsIFByb21wdHNUeXBlLmFnZW50KTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoYWN0aW9ucy5tYXAoYWN0aW9uID0+IGFjdGlvbi50aXRsZSksIFtcblx0XHRcdFx0YFNlYXJjaCBNYXJrZXRwbGFjZSBmb3IgRXh0ZW5zaW9uICdteS5leHRlbnNpb24nYFxuXHRcdFx0XSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdvZmZlcnMgcXVpY2sgZml4IHRvIHNlYXJjaCBtYXJrZXRwbGFjZSBmb3IgYW4gbWNwLXN0eWxlIHRvb2wgcmVmZXJlbmNlJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0bWFya2VyRGF0YSA9IFt7XG5cdFx0XHRcdGNvZGU6IFByb21wdFZhbGlkYXRvck1hcmtlckNvZGUuVW5rbm93bk1jcFNlcnZlclJlZmVyZW5jZSxcblx0XHRcdFx0b3duZXI6ICdwcm9tcHRzLWRpYWdub3N0aWNzLXByb3ZpZGVyJyxcblx0XHRcdFx0cmVzb3VyY2U6IFVSSS5wYXJzZSgndGVzdDovLy90ZXN0JyArIGdldFByb21wdEZpbGVFeHRlbnNpb24oUHJvbXB0c1R5cGUuYWdlbnQpKSxcblx0XHRcdFx0c2V2ZXJpdHk6IE1hcmtlclNldmVyaXR5LkhpbnQsXG5cdFx0XHRcdG1lc3NhZ2U6ICdVbmtub3duIE1DUCBzZXJ2ZXInLFxuXHRcdFx0XHRzdGFydExpbmVOdW1iZXI6IDQsXG5cdFx0XHRcdHN0YXJ0Q29sdW1uOiA5LFxuXHRcdFx0XHRlbmRMaW5lTnVtYmVyOiA0LFxuXHRcdFx0XHRlbmRDb2x1bW46IDU5XG5cdFx0XHR9XTtcblx0XHRcdGNvbnN0IGNvbnRlbnQgPSBbXG5cdFx0XHRcdCctLS0nLFxuXHRcdFx0XHQnZGVzY3JpcHRpb246IFwiVGVzdFwiJyxcblx0XHRcdFx0J3RhcmdldDogdnNjb2RlJyxcblx0XHRcdFx0YHRvb2xzOiBbJ2lvLmdpdGh1Yi5naXRodWIvZ2l0aHViLW1jcC1zZXJ2ZXIvY3JlYXRlX2JyYW5jaCddYCxcblx0XHRcdFx0Jy0tLScsXG5cdFx0XHRdLmpvaW4oJ1xcbicpO1xuXHRcdFx0Y29uc3QgYWN0aW9ucyA9IGF3YWl0IGdldENvZGVBY3Rpb25zKGNvbnRlbnQsIDQsIDExLCBQcm9tcHRzVHlwZS5hZ2VudCk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGFjdGlvbnMubWFwKGFjdGlvbiA9PiBhY3Rpb24udGl0bGUpLCBbXG5cdFx0XHRcdGBTZWFyY2ggTWFya2V0cGxhY2UgZm9yIE1DUCBTZXJ2ZXIgJ2lvLmdpdGh1Yi5naXRodWIvZ2l0aHViLW1jcC1zZXJ2ZXIvY3JlYXRlX2JyYW5jaCdgXG5cdFx0XHRdKTtcblx0XHR9KTtcblx0fSk7XG5cblx0c3VpdGUoJ3Byb21wdCBjb2RlIGFjdGlvbnMnLCAoKSA9PiB7XG5cdFx0dGVzdCgncmVuYW1lIG1vZGUgdG8gYWdlbnQnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCBjb250ZW50ID0gW1xuXHRcdFx0XHQnLS0tJyxcblx0XHRcdFx0J2Rlc2NyaXB0aW9uOiBcIlRlc3RcIicsXG5cdFx0XHRcdCdtb2RlOiBlZGl0Jyxcblx0XHRcdFx0Jy0tLScsXG5cdFx0XHRdLmpvaW4oJ1xcbicpO1xuXHRcdFx0Y29uc3QgYWN0aW9ucyA9IGF3YWl0IGdldENvZGVBY3Rpb25zKGNvbnRlbnQsIDMsIDEsIFByb21wdHNUeXBlLnByb21wdCk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYWN0aW9ucy5sZW5ndGgsIDEpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGFjdGlvbnNbMF0udGl0bGUsIGBSZW5hbWUgdG8gJ2FnZW50J2ApO1xuXHRcdFx0YXNzZXJ0Lm9rKGFjdGlvbnNbMF0udGV4dEVkaXRzKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChhY3Rpb25zWzBdLnRleHRFZGl0cyEubGVuZ3RoLCAxKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChhY3Rpb25zWzBdLnRleHRFZGl0cyFbMF0udGV4dEVkaXQudGV4dCwgJ2FnZW50Jyk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCd1cGRhdGUgZGVwcmVjYXRlZCB0b29sIG5hbWVzIGluIHByb21wdCcsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IGNvbnRlbnQgPSBbXG5cdFx0XHRcdCctLS0nLFxuXHRcdFx0XHQnZGVzY3JpcHRpb246IFwiVGVzdFwiJyxcblx0XHRcdFx0YHRvb2xzOiBbJ3NpbmdsZURlcHJlY2F0ZWQnXWAsXG5cdFx0XHRcdCctLS0nLFxuXHRcdFx0XS5qb2luKCdcXG4nKTtcblx0XHRcdGNvbnN0IGFjdGlvbnMgPSBhd2FpdCBnZXRDb2RlQWN0aW9ucyhjb250ZW50LCAzLCAxMCwgUHJvbXB0c1R5cGUucHJvbXB0KTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChhY3Rpb25zLmxlbmd0aCwgMSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYWN0aW9uc1swXS50aXRsZSwgYFVwZGF0ZSB0byAnc2luZ2xlUmVwbGFjZW1lbnQnYCk7XG5cdFx0XHRhc3NlcnQub2soYWN0aW9uc1swXS50ZXh0RWRpdHMpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGFjdGlvbnNbMF0udGV4dEVkaXRzIS5sZW5ndGgsIDEpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGFjdGlvbnNbMF0udGV4dEVkaXRzIVswXS50ZXh0RWRpdC50ZXh0LCBgJ3NpbmdsZVJlcGxhY2VtZW50J2ApO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnbm8gY29kZSBhY3Rpb25zIHdoZW4gcmFuZ2Ugbm90IGluIG1vZGUgYXR0cmlidXRlJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgY29udGVudCA9IFtcblx0XHRcdFx0Jy0tLScsXG5cdFx0XHRcdCdkZXNjcmlwdGlvbjogXCJUZXN0XCInLFxuXHRcdFx0XHQnbW9kZTogZWRpdCcsXG5cdFx0XHRcdCctLS0nLFxuXHRcdFx0XS5qb2luKCdcXG4nKTtcblx0XHRcdGNvbnN0IGFjdGlvbnMgPSBhd2FpdCBnZXRDb2RlQWN0aW9ucyhjb250ZW50LCAyLCAxLCBQcm9tcHRzVHlwZS5wcm9tcHQpOyAvLyBSYW5nZSBpbiBkZXNjcmlwdGlvbiwgbm90IG1vZGVcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChhY3Rpb25zLmxlbmd0aCwgMCk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdib3RoIG1vZGUgYW5kIHRvb2xzIGNvZGUgYWN0aW9ucyBhdmFpbGFibGUnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCBjb250ZW50ID0gW1xuXHRcdFx0XHQnLS0tJyxcblx0XHRcdFx0J2Rlc2NyaXB0aW9uOiBcIlRlc3RcIicsXG5cdFx0XHRcdCdtb2RlOiBlZGl0Jyxcblx0XHRcdFx0YHRvb2xzOiBbJ3NpbmdsZURlcHJlY2F0ZWQnXWAsXG5cdFx0XHRcdCctLS0nLFxuXHRcdFx0XS5qb2luKCdcXG4nKTtcblx0XHRcdC8vIFRlc3QgbW9kZSBhY3Rpb25cblx0XHRcdGNvbnN0IG1vZGVBY3Rpb25zID0gYXdhaXQgZ2V0Q29kZUFjdGlvbnMoY29udGVudCwgMywgMSwgUHJvbXB0c1R5cGUucHJvbXB0KTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChtb2RlQWN0aW9ucy5sZW5ndGgsIDEpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1vZGVBY3Rpb25zWzBdLnRpdGxlLCBgUmVuYW1lIHRvICdhZ2VudCdgKTtcblxuXHRcdFx0Ly8gVGVzdCB0b29scyBhY3Rpb25cblx0XHRcdGNvbnN0IHRvb2xBY3Rpb25zID0gYXdhaXQgZ2V0Q29kZUFjdGlvbnMoY29udGVudCwgNCwgMTAsIFByb21wdHNUeXBlLnByb21wdCk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodG9vbEFjdGlvbnMubGVuZ3RoLCAxKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbCh0b29sQWN0aW9uc1swXS50aXRsZSwgYFVwZGF0ZSB0byAnc2luZ2xlUmVwbGFjZW1lbnQnYCk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3JldHVybnMgdW5kZWZpbmVkIHdoZW4gbm8gY29kZSBhY3Rpb25zIGF2YWlsYWJsZScsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBjb250ZW50ID0gW1xuXHRcdFx0Jy0tLScsXG5cdFx0XHQnZGVzY3JpcHRpb246IFwiVGVzdFwiJyxcblx0XHRcdCd0YXJnZXQ6IHZzY29kZScsXG5cdFx0XHRgdG9vbHM6IFsndmFsaWRUb29sJ11gLCAvLyBObyBkZXByZWNhdGVkIHRvb2xzXG5cdFx0XHQnLS0tJyxcblx0XHRdLmpvaW4oJ1xcbicpO1xuXHRcdGNvbnN0IGFjdGlvbnMgPSBhd2FpdCBnZXRDb2RlQWN0aW9ucyhjb250ZW50LCA0LCAxMCwgUHJvbXB0c1R5cGUuYWdlbnQpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChhY3Rpb25zLmxlbmd0aCwgMCk7XG5cdH0pO1xuXG5cdHRlc3QoJ3VzZXMgY29tbWEtc3BhY2UgZGVsaW1pdGVyIHdoZW4gc2VwYXJhdG9yIGluY2x1ZGVzIGNvbW1hJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IGNvbnRlbnQgPSBbXG5cdFx0XHQnLS0tJyxcblx0XHRcdCdkZXNjcmlwdGlvbjogXCJUZXN0XCInLFxuXHRcdFx0J3RhcmdldDogdnNjb2RlJyxcblx0XHRcdGB0b29sczogWydvbGRUb29sJywgJ3ZhbGlkVG9vbCddYCxcblx0XHRcdCctLS0nLFxuXHRcdF0uam9pbignXFxuJyk7XG5cdFx0Y29uc3QgYWN0aW9ucyA9IGF3YWl0IGdldENvZGVBY3Rpb25zKGNvbnRlbnQsIDQsIDEwLCBQcm9tcHRzVHlwZS5hZ2VudCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGFjdGlvbnMubGVuZ3RoLCAxKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYWN0aW9uc1swXS50aXRsZSwgYEV4cGFuZCB0byAyIHRvb2xzYCk7XG5cdFx0YXNzZXJ0Lm9rKGFjdGlvbnNbMF0udGV4dEVkaXRzKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYWN0aW9uc1swXS50ZXh0RWRpdHMhWzBdLnRleHRFZGl0LnRleHQsIGAnbmV3VG9vbDEnLCAnbmV3VG9vbDInYCk7XG5cdH0pO1xuXG59KTtcbiJdLAogICJtYXBwaW5ncyI6ICJBQUtBLE9BQU8sWUFBWTtBQUNuQixTQUFTLHlCQUF5QjtBQUNsQyxTQUFTLFdBQVc7QUFDcEIsU0FBUywrQ0FBK0M7QUFDeEQsU0FBUyxhQUFhO0FBQ3RCLFNBQTRCLDZCQUFxRTtBQUNqRyxTQUFTLHVCQUF1QjtBQUVoQyxTQUFTLGdDQUFnQztBQUN6QyxTQUFTLHlCQUF5QjtBQUVsQyxTQUFrQixnQkFBZ0Isc0JBQXNCO0FBQ3hELFNBQVMscUNBQXFDO0FBQzlDLFNBQVMseUJBQXlCO0FB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
