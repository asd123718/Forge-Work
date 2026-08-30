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
import { ChatConfiguration } from "../../../../common/constants.js";
import { ILanguageModelToolsService, ToolDataSource } from "../../../../common/tools/languageModelToolsService.js";
import { PromptBodyAutocompletion } from "../../../../common/promptSyntax/languageProviders/promptBodyAutocompletion.js";
import { createTextModel } from "../../../../../../../editor/test/common/testTextModel.js";
import { URI } from "../../../../../../../base/common/uri.js";
import { getLanguageIdForPromptsType, PromptsType } from "../../../../common/promptSyntax/promptTypes.js";
import { getPromptFileExtension } from "../../../../common/promptSyntax/config/promptFileLocations.js";
import { IFileService } from "../../../../../../../platform/files/common/files.js";
import { FileService } from "../../../../../../../platform/files/common/fileService.js";
import { VSBuffer } from "../../../../../../../base/common/buffer.js";
import { InMemoryFileSystemProvider } from "../../../../../../../platform/files/common/inMemoryFilesystemProvider.js";
import { ILogService, NullLogService } from "../../../../../../../platform/log/common/log.js";
import { Range } from "../../../../../../../editor/common/core/range.js";
suite("PromptBodyAutocompletion", () => {
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
    instaService.stub(ILogService, new NullLogService());
    const fileService = disposables.add(instaService.createInstance(FileService));
    instaService.stub(IFileService, fileService);
    const fileSystemProvider = disposables.add(new InMemoryFileSystemProvider());
    disposables.add(fileService.registerProvider("test", fileSystemProvider));
    await fileService.createFolder(URI.parse("test:///workspace"));
    await fileService.createFolder(URI.parse("test:///workspace/src"));
    await fileService.createFolder(URI.parse("test:///workspace/docs"));
    await fileService.writeFile(URI.parse("test:///workspace/src/index.ts"), VSBuffer.fromString("export function hello() {}"));
    await fileService.writeFile(URI.parse("test:///workspace/README.md"), VSBuffer.fromString("# Project"));
    await fileService.writeFile(URI.parse("test:///workspace/package.json"), VSBuffer.fromString("{}"));
    const toolService = disposables.add(instaService.createInstance(LanguageModelToolsService));
    const testTool1 = { id: "testTool1", displayName: "tool1", canBeReferencedInPrompt: true, modelDescription: "Test Tool 1", source: ToolDataSource.External, inputSchema: {} };
    disposables.add(toolService.registerToolData(testTool1));
    const testTool2 = { id: "testTool2", displayName: "tool2", canBeReferencedInPrompt: true, toolReferenceName: "tool2", modelDescription: "Test Tool 2", source: ToolDataSource.External, inputSchema: {} };
    disposables.add(toolService.registerToolData(testTool2));
    const myExtSource = { type: "extension", label: "My Extension", extensionId: new ExtensionIdentifier("My.extension") };
    const testTool3 = { id: "testTool3", displayName: "tool3", canBeReferencedInPrompt: true, toolReferenceName: "tool3", modelDescription: "Test Tool 3", source: myExtSource, inputSchema: {} };
    disposables.add(toolService.registerToolData(testTool3));
    const prExtSource = { type: "extension", label: "GitHub Pull Request Extension", extensionId: new ExtensionIdentifier("github.vscode-pull-request-github") };
    const prExtTool1 = { id: "suggestFix", canBeReferencedInPrompt: true, toolReferenceName: "suggest-fix", modelDescription: "tool4", displayName: "Test Tool 4", source: prExtSource, inputSchema: {} };
    disposables.add(toolService.registerToolData(prExtTool1));
    instaService.set(ILanguageModelToolsService, toolService);
    completionProvider = instaService.createInstance(PromptBodyAutocompletion);
  });
  async function getCompletions(content, line, column, promptType) {
    const languageId = getLanguageIdForPromptsType(promptType);
    const model = disposables.add(createTextModel(content, languageId, void 0, URI.parse("test://workspace/test" + getPromptFileExtension(promptType))));
    const position = new Position(line, column);
    const context = { triggerKind: CompletionTriggerKind.Invoke };
    const result = await completionProvider.provideCompletionItems(model, position, context, CancellationToken.None);
    if (!result || !result.suggestions) {
      return [];
    }
    const lineContent = model.getLineContent(position.lineNumber);
    return result.suggestions.map((s) => {
      assert(s.range instanceof Range);
      return {
        label: s.label,
        result: lineContent.substring(0, s.range.startColumn - 1) + s.insertText + lineContent.substring(s.range.endColumn - 1)
      };
    });
  }
  suite("prompt body completions", () => {
    test("default suggestions", async () => {
      const content = [
        "---",
        'description: "Test"',
        "---",
        "",
        "Use # to reference a file or tool.",
        "One more #to"
      ].join("\n");
      {
        const actual = await getCompletions(content, 5, 6, PromptsType.prompt);
        assert.deepEqual(actual, [
          {
            label: "file:",
            result: "Use #file: to reference a file or tool."
          },
          {
            label: "tool:",
            result: "Use #tool: to reference a file or tool."
          }
        ]);
      }
      {
        const actual = await getCompletions(content, 6, 13, PromptsType.prompt);
        assert.deepEqual(actual, [
          {
            label: "file:",
            result: "One more #file:"
          },
          {
            label: "tool:",
            result: "One more #tool:"
          }
        ]);
      }
    });
    test("tool suggestions", async () => {
      const content = [
        "---",
        'description: "Test"',
        "---",
        "",
        "Use #tool: to reference a tool."
      ].join("\n");
      {
        const actual = await getCompletions(content, 5, 11, PromptsType.prompt);
        assert.deepEqual(actual, [
          {
            label: "vscode",
            result: "Use #tool:vscode to reference a tool."
          },
          {
            label: "execute",
            result: "Use #tool:execute to reference a tool."
          },
          {
            label: "read",
            result: "Use #tool:read to reference a tool."
          },
          {
            label: "agent",
            result: "Use #tool:agent to reference a tool."
          },
          {
            label: "tool1",
            result: "Use #tool:tool1 to reference a tool."
          },
          {
            label: "tool2",
            result: "Use #tool:tool2 to reference a tool."
          },
          {
            label: "my.extension/tool3",
            result: "Use #tool:my.extension/tool3 to reference a tool."
          },
          {
            label: "github.vscode-pull-request-github/suggest-fix",
            result: "Use #tool:github.vscode-pull-request-github/suggest-fix to reference a tool."
          }
        ]);
      }
    });
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXGNoYXRcXHRlc3RcXGJyb3dzZXJcXHByb21wdFN5bnRheFxcbGFuZ3VhZ2VQcm92aWRlcnNcXHByb21wdEJvZHlBdXRvY29tcGxldGlvbi50ZXN0LnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IGFzc2VydCBmcm9tICdhc3NlcnQnO1xuaW1wb3J0IHsgQ2FuY2VsbGF0aW9uVG9rZW4gfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9jYW5jZWxsYXRpb24uanMnO1xuaW1wb3J0IHsgZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS90ZXN0L2NvbW1vbi91dGlscy5qcyc7XG5pbXBvcnQgeyBQb3NpdGlvbiB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vY29yZS9wb3NpdGlvbi5qcyc7XG5pbXBvcnQgeyBDb21wbGV0aW9uQ29udGV4dCwgQ29tcGxldGlvblRyaWdnZXJLaW5kIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9sYW5ndWFnZXMuanMnO1xuaW1wb3J0IHsgQ29udGV4dEtleVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb250ZXh0a2V5L2Jyb3dzZXIvY29udGV4dEtleVNlcnZpY2UuanMnO1xuaW1wb3J0IHsgVGVzdENvbmZpZ3VyYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29uZmlndXJhdGlvbi90ZXN0L2NvbW1vbi90ZXN0Q29uZmlndXJhdGlvblNlcnZpY2UuanMnO1xuaW1wb3J0IHsgRXh0ZW5zaW9uSWRlbnRpZmllciB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2V4dGVuc2lvbnMvY29tbW9uL2V4dGVuc2lvbnMuanMnO1xuaW1wb3J0IHsgVGVzdEluc3RhbnRpYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vaW5zdGFudGlhdGlvbi90ZXN0L2NvbW1vbi9pbnN0YW50aWF0aW9uU2VydmljZU1vY2suanMnO1xuaW1wb3J0IHsgd29ya2JlbmNoSW5zdGFudGlhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi90ZXN0L2Jyb3dzZXIvd29ya2JlbmNoVGVzdFNlcnZpY2VzLmpzJztcbmltcG9ydCB7IExhbmd1YWdlTW9kZWxUb29sc1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9icm93c2VyL3Rvb2xzL2xhbmd1YWdlTW9kZWxUb29sc1NlcnZpY2UuanMnO1xuaW1wb3J0IHsgQ2hhdENvbmZpZ3VyYXRpb24gfSBmcm9tICcuLi8uLi8uLi8uLi9jb21tb24vY29uc3RhbnRzLmpzJztcbmltcG9ydCB7IElMYW5ndWFnZU1vZGVsVG9vbHNTZXJ2aWNlLCBJVG9vbERhdGEsIFRvb2xEYXRhU291cmNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vY29tbW9uL3Rvb2xzL2xhbmd1YWdlTW9kZWxUb29sc1NlcnZpY2UuanMnO1xuaW1wb3J0IHsgUHJvbXB0Qm9keUF1dG9jb21wbGV0aW9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vY29tbW9uL3Byb21wdFN5bnRheC9sYW5ndWFnZVByb3ZpZGVycy9wcm9tcHRCb2R5QXV0b2NvbXBsZXRpb24uanMnO1xuaW1wb3J0IHsgY3JlYXRlVGV4dE1vZGVsIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vLi4vZWRpdG9yL3Rlc3QvY29tbW9uL3Rlc3RUZXh0TW9kZWwuanMnO1xuaW1wb3J0IHsgVVJJIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdXJpLmpzJztcbmltcG9ydCB7IGdldExhbmd1YWdlSWRGb3JQcm9tcHRzVHlwZSwgUHJvbXB0c1R5cGUgfSBmcm9tICcuLi8uLi8uLi8uLi9jb21tb24vcHJvbXB0U3ludGF4L3Byb21wdFR5cGVzLmpzJztcbmltcG9ydCB7IGdldFByb21wdEZpbGVFeHRlbnNpb24gfSBmcm9tICcuLi8uLi8uLi8uLi9jb21tb24vcHJvbXB0U3ludGF4L2NvbmZpZy9wcm9tcHRGaWxlTG9jYXRpb25zLmpzJztcbmltcG9ydCB7IElGaWxlU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2ZpbGVzL2NvbW1vbi9maWxlcy5qcyc7XG5pbXBvcnQgeyBGaWxlU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2ZpbGVzL2NvbW1vbi9maWxlU2VydmljZS5qcyc7XG5pbXBvcnQgeyBWU0J1ZmZlciB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2J1ZmZlci5qcyc7XG5pbXBvcnQgeyBJbk1lbW9yeUZpbGVTeXN0ZW1Qcm92aWRlciB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2ZpbGVzL2NvbW1vbi9pbk1lbW9yeUZpbGVzeXN0ZW1Qcm92aWRlci5qcyc7XG5pbXBvcnQgeyBJTG9nU2VydmljZSwgTnVsbExvZ1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9sb2cvY29tbW9uL2xvZy5qcyc7XG5pbXBvcnQgeyBSYW5nZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vY29yZS9yYW5nZS5qcyc7XG5cbnN1aXRlKCdQcm9tcHRCb2R5QXV0b2NvbXBsZXRpb24nLCAoKSA9PiB7XG5cdGNvbnN0IGRpc3Bvc2FibGVzID0gZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlKCk7XG5cblx0bGV0IGluc3RhU2VydmljZTogVGVzdEluc3RhbnRpYXRpb25TZXJ2aWNlO1xuXHRsZXQgY29tcGxldGlvblByb3ZpZGVyOiBQcm9tcHRCb2R5QXV0b2NvbXBsZXRpb247XG5cblx0c2V0dXAoYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHRlc3RDb25maWdTZXJ2aWNlID0gbmV3IFRlc3RDb25maWd1cmF0aW9uU2VydmljZSgpO1xuXHRcdHRlc3RDb25maWdTZXJ2aWNlLnNldFVzZXJDb25maWd1cmF0aW9uKENoYXRDb25maWd1cmF0aW9uLkV4dGVuc2lvblRvb2xzRW5hYmxlZCwgdHJ1ZSk7XG5cdFx0aW5zdGFTZXJ2aWNlID0gd29ya2JlbmNoSW5zdGFudGlhdGlvblNlcnZpY2Uoe1xuXHRcdFx0Y29udGV4dEtleVNlcnZpY2U6ICgpID0+IGRpc3Bvc2FibGVzLmFkZChuZXcgQ29udGV4dEtleVNlcnZpY2UodGVzdENvbmZpZ1NlcnZpY2UpKSxcblx0XHRcdGNvbmZpZ3VyYXRpb25TZXJ2aWNlOiAoKSA9PiB0ZXN0Q29uZmlnU2VydmljZVxuXHRcdH0sIGRpc3Bvc2FibGVzKTtcblx0XHRpbnN0YVNlcnZpY2Uuc3R1YihJTG9nU2VydmljZSwgbmV3IE51bGxMb2dTZXJ2aWNlKCkpO1xuXHRcdGNvbnN0IGZpbGVTZXJ2aWNlID0gZGlzcG9zYWJsZXMuYWRkKGluc3RhU2VydmljZS5jcmVhdGVJbnN0YW5jZShGaWxlU2VydmljZSkpO1xuXHRcdGluc3RhU2VydmljZS5zdHViKElGaWxlU2VydmljZSwgZmlsZVNlcnZpY2UpO1xuXG5cdFx0Y29uc3QgZmlsZVN5c3RlbVByb3ZpZGVyID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBJbk1lbW9yeUZpbGVTeXN0ZW1Qcm92aWRlcigpKTtcblx0XHRkaXNwb3NhYmxlcy5hZGQoZmlsZVNlcnZpY2UucmVnaXN0ZXJQcm92aWRlcigndGVzdCcsIGZpbGVTeXN0ZW1Qcm92aWRlcikpO1xuXG5cdFx0Ly8gQ3JlYXRlIHNvbWUgdGVzdCBmaWxlcyBhbmQgZGlyZWN0b3JpZXNcblx0XHRhd2FpdCBmaWxlU2VydmljZS5jcmVhdGVGb2xkZXIoVVJJLnBhcnNlKCd0ZXN0Oi8vL3dvcmtzcGFjZScpKTtcblx0XHRhd2FpdCBmaWxlU2VydmljZS5jcmVhdGVGb2xkZXIoVVJJLnBhcnNlKCd0ZXN0Oi8vL3dvcmtzcGFjZS9zcmMnKSk7XG5cdFx0YXdhaXQgZmlsZVNlcnZpY2UuY3JlYXRlRm9sZGVyKFVSSS5wYXJzZSgndGVzdDovLy93b3Jrc3BhY2UvZG9jcycpKTtcblx0XHRhd2FpdCBmaWxlU2VydmljZS53cml0ZUZpbGUoVVJJLnBhcnNlKCd0ZXN0Oi8vL3dvcmtzcGFjZS9zcmMvaW5kZXgudHMnKSwgVlNCdWZmZXIuZnJvbVN0cmluZygnZXhwb3J0IGZ1bmN0aW9uIGhlbGxvKCkge30nKSk7XG5cdFx0YXdhaXQgZmlsZVNlcnZpY2Uud3JpdGVGaWxlKFVSSS5wYXJzZSgndGVzdDovLy93b3Jrc3BhY2UvUkVBRE1FLm1kJyksIFZTQnVmZmVyLmZyb21TdHJpbmcoJyMgUHJvamVjdCcpKTtcblx0XHRhd2FpdCBmaWxlU2VydmljZS53cml0ZUZpbGUoVVJJLnBhcnNlKCd0ZXN0Oi8vL3dvcmtzcGFjZS9wYWNrYWdlLmpzb24nKSwgVlNCdWZmZXIuZnJvbVN0cmluZygne30nKSk7XG5cblx0XHRjb25zdCB0b29sU2VydmljZSA9IGRpc3Bvc2FibGVzLmFkZChpbnN0YVNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoTGFuZ3VhZ2VNb2RlbFRvb2xzU2VydmljZSkpO1xuXG5cdFx0Y29uc3QgdGVzdFRvb2wxID0geyBpZDogJ3Rlc3RUb29sMScsIGRpc3BsYXlOYW1lOiAndG9vbDEnLCBjYW5CZVJlZmVyZW5jZWRJblByb21wdDogdHJ1ZSwgbW9kZWxEZXNjcmlwdGlvbjogJ1Rlc3QgVG9vbCAxJywgc291cmNlOiBUb29sRGF0YVNvdXJjZS5FeHRlcm5hbCwgaW5wdXRTY2hlbWE6IHt9IH0gc2F0aXNmaWVzIElUb29sRGF0YTtcblx0XHRkaXNwb3NhYmxlcy5hZGQodG9vbFNlcnZpY2UucmVnaXN0ZXJUb29sRGF0YSh0ZXN0VG9vbDEpKTtcblxuXHRcdGNvbnN0IHRlc3RUb29sMiA9IHsgaWQ6ICd0ZXN0VG9vbDInLCBkaXNwbGF5TmFtZTogJ3Rvb2wyJywgY2FuQmVSZWZlcmVuY2VkSW5Qcm9tcHQ6IHRydWUsIHRvb2xSZWZlcmVuY2VOYW1lOiAndG9vbDInLCBtb2RlbERlc2NyaXB0aW9uOiAnVGVzdCBUb29sIDInLCBzb3VyY2U6IFRvb2xEYXRhU291cmNlLkV4dGVybmFsLCBpbnB1dFNjaGVtYToge30gfSBzYXRpc2ZpZXMgSVRvb2xEYXRhO1xuXHRcdGRpc3Bvc2FibGVzLmFkZCh0b29sU2VydmljZS5yZWdpc3RlclRvb2xEYXRhKHRlc3RUb29sMikpO1xuXG5cdFx0Y29uc3QgbXlFeHRTb3VyY2UgPSB7IHR5cGU6ICdleHRlbnNpb24nLCBsYWJlbDogJ015IEV4dGVuc2lvbicsIGV4dGVuc2lvbklkOiBuZXcgRXh0ZW5zaW9uSWRlbnRpZmllcignTXkuZXh0ZW5zaW9uJykgfSBzYXRpc2ZpZXMgVG9vbERhdGFTb3VyY2U7XG5cdFx0Y29uc3QgdGVzdFRvb2wzID0geyBpZDogJ3Rlc3RUb29sMycsIGRpc3BsYXlOYW1lOiAndG9vbDMnLCBjYW5CZVJlZmVyZW5jZWRJblByb21wdDogdHJ1ZSwgdG9vbFJlZmVyZW5jZU5hbWU6ICd0b29sMycsIG1vZGVsRGVzY3JpcHRpb246ICdUZXN0IFRvb2wgMycsIHNvdXJjZTogbXlFeHRTb3VyY2UsIGlucHV0U2NoZW1hOiB7fSB9IHNhdGlzZmllcyBJVG9vbERhdGE7XG5cdFx0ZGlzcG9zYWJsZXMuYWRkKHRvb2xTZXJ2aWNlLnJlZ2lzdGVyVG9vbERhdGEodGVzdFRvb2wzKSk7XG5cblx0XHRjb25zdCBwckV4dFNvdXJjZSA9IHsgdHlwZTogJ2V4dGVuc2lvbicsIGxhYmVsOiAnR2l0SHViIFB1bGwgUmVxdWVzdCBFeHRlbnNpb24nLCBleHRlbnNpb25JZDogbmV3IEV4dGVuc2lvbklkZW50aWZpZXIoJ2dpdGh1Yi52c2NvZGUtcHVsbC1yZXF1ZXN0LWdpdGh1YicpIH0gc2F0aXNmaWVzIFRvb2xEYXRhU291cmNlO1xuXHRcdGNvbnN0IHByRXh0VG9vbDEgPSB7IGlkOiAnc3VnZ2VzdEZpeCcsIGNhbkJlUmVmZXJlbmNlZEluUHJvbXB0OiB0cnVlLCB0b29sUmVmZXJlbmNlTmFtZTogJ3N1Z2dlc3QtZml4JywgbW9kZWxEZXNjcmlwdGlvbjogJ3Rvb2w0JywgZGlzcGxheU5hbWU6ICdUZXN0IFRvb2wgNCcsIHNvdXJjZTogcHJFeHRTb3VyY2UsIGlucHV0U2NoZW1hOiB7fSB9IHNhdGlzZmllcyBJVG9vbERhdGE7XG5cdFx0ZGlzcG9zYWJsZXMuYWRkKHRvb2xTZXJ2aWNlLnJlZ2lzdGVyVG9vbERhdGEocHJFeHRUb29sMSkpO1xuXG5cdFx0aW5zdGFTZXJ2aWNlLnNldChJTGFuZ3VhZ2VNb2RlbFRvb2xzU2VydmljZSwgdG9vbFNlcnZpY2UpO1xuXG5cdFx0Y29tcGxldGlvblByb3ZpZGVyID0gaW5zdGFTZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFByb21wdEJvZHlBdXRvY29tcGxldGlvbik7XG5cdH0pO1xuXG5cdGFzeW5jIGZ1bmN0aW9uIGdldENvbXBsZXRpb25zKGNvbnRlbnQ6IHN0cmluZywgbGluZTogbnVtYmVyLCBjb2x1bW46IG51bWJlciwgcHJvbXB0VHlwZTogUHJvbXB0c1R5cGUpIHtcblx0XHRjb25zdCBsYW5ndWFnZUlkID0gZ2V0TGFuZ3VhZ2VJZEZvclByb21wdHNUeXBlKHByb21wdFR5cGUpO1xuXHRcdGNvbnN0IG1vZGVsID0gZGlzcG9zYWJsZXMuYWRkKGNyZWF0ZVRleHRNb2RlbChjb250ZW50LCBsYW5ndWFnZUlkLCB1bmRlZmluZWQsIFVSSS5wYXJzZSgndGVzdDovL3dvcmtzcGFjZS90ZXN0JyArIGdldFByb21wdEZpbGVFeHRlbnNpb24ocHJvbXB0VHlwZSkpKSk7XG5cdFx0Y29uc3QgcG9zaXRpb24gPSBuZXcgUG9zaXRpb24obGluZSwgY29sdW1uKTtcblx0XHRjb25zdCBjb250ZXh0OiBDb21wbGV0aW9uQ29udGV4dCA9IHsgdHJpZ2dlcktpbmQ6IENvbXBsZXRpb25UcmlnZ2VyS2luZC5JbnZva2UgfTtcblx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCBjb21wbGV0aW9uUHJvdmlkZXIucHJvdmlkZUNvbXBsZXRpb25JdGVtcyhtb2RlbCwgcG9zaXRpb24sIGNvbnRleHQsIENhbmNlbGxhdGlvblRva2VuLk5vbmUpO1xuXHRcdGlmICghcmVzdWx0IHx8ICFyZXN1bHQuc3VnZ2VzdGlvbnMpIHtcblx0XHRcdHJldHVybiBbXTtcblx0XHR9XG5cdFx0Y29uc3QgbGluZUNvbnRlbnQgPSBtb2RlbC5nZXRMaW5lQ29udGVudChwb3NpdGlvbi5saW5lTnVtYmVyKTtcblx0XHRyZXR1cm4gcmVzdWx0LnN1Z2dlc3Rpb25zLm1hcChzID0+IHtcblx0XHRcdGFzc2VydChzLnJhbmdlIGluc3RhbmNlb2YgUmFuZ2UpO1xuXHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0bGFiZWw6IHMubGFiZWwsXG5cdFx0XHRcdHJlc3VsdDogbGluZUNvbnRlbnQuc3Vic3RyaW5nKDAsIHMucmFuZ2Uuc3RhcnRDb2x1bW4gLSAxKSArIHMuaW5zZXJ0VGV4dCArIGxpbmVDb250ZW50LnN1YnN0cmluZyhzLnJhbmdlLmVuZENvbHVtbiAtIDEpXG5cdFx0XHR9O1xuXHRcdH0pO1xuXHR9XG5cblx0c3VpdGUoJ3Byb21wdCBib2R5IGNvbXBsZXRpb25zJywgKCkgPT4ge1xuXHRcdHRlc3QoJ2RlZmF1bHQgc3VnZ2VzdGlvbnMnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCBjb250ZW50ID0gW1xuXHRcdFx0XHQnLS0tJyxcblx0XHRcdFx0J2Rlc2NyaXB0aW9uOiBcIlRlc3RcIicsXG5cdFx0XHRcdCctLS0nLFxuXHRcdFx0XHQnJyxcblx0XHRcdFx0J1VzZSAjIHRvIHJlZmVyZW5jZSBhIGZpbGUgb3IgdG9vbC4nLFxuXHRcdFx0XHQnT25lIG1vcmUgI3RvJ1xuXHRcdFx0XS5qb2luKCdcXG4nKTtcblxuXHRcdFx0e1xuXHRcdFx0XHRjb25zdCBhY3R1YWwgPSAoYXdhaXQgZ2V0Q29tcGxldGlvbnMoY29udGVudCwgNSwgNiwgUHJvbXB0c1R5cGUucHJvbXB0KSk7XG5cdFx0XHRcdGFzc2VydC5kZWVwRXF1YWwoYWN0dWFsLCBbXG5cdFx0XHRcdFx0e1xuXHRcdFx0XHRcdFx0bGFiZWw6ICdmaWxlOicsXG5cdFx0XHRcdFx0XHRyZXN1bHQ6ICdVc2UgI2ZpbGU6IHRvIHJlZmVyZW5jZSBhIGZpbGUgb3IgdG9vbC4nXG5cdFx0XHRcdFx0fSxcblx0XHRcdFx0XHR7XG5cdFx0XHRcdFx0XHRsYWJlbDogJ3Rvb2w6Jyxcblx0XHRcdFx0XHRcdHJlc3VsdDogJ1VzZSAjdG9vbDogdG8gcmVmZXJlbmNlIGEgZmlsZSBvciB0b29sLidcblx0XHRcdFx0XHR9XG5cdFx0XHRcdF0pO1xuXHRcdFx0fVxuXHRcdFx0e1xuXHRcdFx0XHRjb25zdCBhY3R1YWwgPSAoYXdhaXQgZ2V0Q29tcGxldGlvbnMoY29udGVudCwgNiwgMTMsIFByb21wdHNUeXBlLnByb21wdCkpO1xuXHRcdFx0XHRhc3NlcnQuZGVlcEVxdWFsKGFjdHVhbCwgW1xuXHRcdFx0XHRcdHtcblx0XHRcdFx0XHRcdGxhYmVsOiAnZmlsZTonLFxuXHRcdFx0XHRcdFx0cmVzdWx0OiAnT25lIG1vcmUgI2ZpbGU6J1xuXHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0e1xuXHRcdFx0XHRcdFx0bGFiZWw6ICd0b29sOicsXG5cdFx0XHRcdFx0XHRyZXN1bHQ6ICdPbmUgbW9yZSAjdG9vbDonXG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRdKTtcblx0XHRcdH1cblx0XHR9KTtcblxuXHRcdHRlc3QoJ3Rvb2wgc3VnZ2VzdGlvbnMnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCBjb250ZW50ID0gW1xuXHRcdFx0XHQnLS0tJyxcblx0XHRcdFx0J2Rlc2NyaXB0aW9uOiBcIlRlc3RcIicsXG5cdFx0XHRcdCctLS0nLFxuXHRcdFx0XHQnJyxcblx0XHRcdFx0J1VzZSAjdG9vbDogdG8gcmVmZXJlbmNlIGEgdG9vbC4nLFxuXHRcdFx0XS5qb2luKCdcXG4nKTtcblx0XHRcdHtcblx0XHRcdFx0Y29uc3QgYWN0dWFsID0gKGF3YWl0IGdldENvbXBsZXRpb25zKGNvbnRlbnQsIDUsIDExLCBQcm9tcHRzVHlwZS5wcm9tcHQpKTtcblx0XHRcdFx0YXNzZXJ0LmRlZXBFcXVhbChhY3R1YWwsIFtcblx0XHRcdFx0XHR7XG5cdFx0XHRcdFx0XHRsYWJlbDogJ3ZzY29kZScsXG5cdFx0XHRcdFx0XHRyZXN1bHQ6ICdVc2UgI3Rvb2w6dnNjb2RlIHRvIHJlZmVyZW5jZSBhIHRvb2wuJ1xuXHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0e1xuXHRcdFx0XHRcdFx0bGFiZWw6ICdleGVjdXRlJyxcblx0XHRcdFx0XHRcdHJlc3VsdDogJ1VzZSAjdG9vbDpleGVjdXRlIHRvIHJlZmVyZW5jZSBhIHRvb2wuJ1xuXHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0e1xuXHRcdFx0XHRcdFx0bGFiZWw6ICdyZWFkJyxcblx0XHRcdFx0XHRcdHJlc3VsdDogJ1VzZSAjdG9vbDpyZWFkIHRvIHJlZmVyZW5jZSBhIHRvb2wuJ1xuXHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0e1xuXHRcdFx0XHRcdFx0bGFiZWw6ICdhZ2VudCcsXG5cdFx0XHRcdFx0XHRyZXN1bHQ6ICdVc2UgI3Rvb2w6YWdlbnQgdG8gcmVmZXJlbmNlIGEgdG9vbC4nXG5cdFx0XHRcdFx0fSxcblx0XHRcdFx0XHR7XG5cdFx0XHRcdFx0XHRsYWJlbDogJ3Rvb2wxJyxcblx0XHRcdFx0XHRcdHJlc3VsdDogJ1VzZSAjdG9vbDp0b29sMSB0byByZWZlcmVuY2UgYSB0b29sLidcblx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdHtcblx0XHRcdFx0XHRcdGxhYmVsOiAndG9vbDInLFxuXHRcdFx0XHRcdFx0cmVzdWx0OiAnVXNlICN0b29sOnRvb2wyIHRvIHJlZmVyZW5jZSBhIHRvb2wuJ1xuXHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0e1xuXHRcdFx0XHRcdFx0bGFiZWw6ICdteS5leHRlbnNpb24vdG9vbDMnLFxuXHRcdFx0XHRcdFx0cmVzdWx0OiAnVXNlICN0b29sOm15LmV4dGVuc2lvbi90b29sMyB0byByZWZlcmVuY2UgYSB0b29sLidcblx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdHtcblx0XHRcdFx0XHRcdGxhYmVsOiAnZ2l0aHViLnZzY29kZS1wdWxsLXJlcXVlc3QtZ2l0aHViL3N1Z2dlc3QtZml4Jyxcblx0XHRcdFx0XHRcdHJlc3VsdDogJ1VzZSAjdG9vbDpnaXRodWIudnNjb2RlLXB1bGwtcmVxdWVzdC1naXRodWIvc3VnZ2VzdC1maXggdG8gcmVmZXJlbmNlIGEgdG9vbC4nXG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRdKTtcblx0XHRcdH1cblx0XHR9KTtcblx0fSk7XG59KTtcbiJdLAogICJtYXBwaW5ncyI6ICJBQUtBLE9BQU8sWUFBWTtBQUNuQixTQUFTLHlCQUF5QjtBQUNsQyxTQUFTLCtDQUErQztBQUN4RCxTQUFTLGdCQUFnQjtBQUN6QixTQUE0Qiw2QkFBNkI7QUFDekQsU0FBUyx5QkFBeUI7QUFDbEMsU0FBUyxnQ0FBZ0M7QUFDekMsU0FBUywyQkFBMkI7QUFFcEMsU0FBUyxxQ0FBcUM7QUFDOUMsU0FBUyxpQ0FBaUM7QUFDMUMsU0FBUyx5QkFBeUI7QUFDbEMsU0FBUyw0QkFBdUMsc0JBQXNCO0FBQ3RFLFNBQVMsZ0NB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
