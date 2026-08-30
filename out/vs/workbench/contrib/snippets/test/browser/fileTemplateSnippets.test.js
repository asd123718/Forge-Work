import assert from "assert";
import { DisposableStore } from "../../../../../base/common/lifecycle.js";
import { URI } from "../../../../../base/common/uri.js";
import { generateUuid } from "../../../../../base/common/uuid.js";
import { mock } from "../../../../../base/test/common/mock.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../../base/test/common/utils.js";
import { ILanguageService } from "../../../../../editor/common/languages/language.js";
import { ILanguageConfigurationService } from "../../../../../editor/common/languages/languageConfigurationRegistry.js";
import { SnippetController2 } from "../../../../../editor/contrib/snippet/browser/snippetController2.js";
import { createCodeEditorServices, instantiateTestCodeEditor } from "../../../../../editor/test/browser/testCodeEditor.js";
import { TestLanguageConfigurationService } from "../../../../../editor/test/common/modes/testLanguageConfigurationService.js";
import { instantiateTextModel } from "../../../../../editor/test/common/testTextModel.js";
import { ServiceCollection } from "../../../../../platform/instantiation/common/serviceCollection.js";
import { IQuickInputService } from "../../../../../platform/quickinput/common/quickInput.js";
import { IEditorService } from "../../../../services/editor/common/editorService.js";
import { ApplyFileSnippetAction } from "../../browser/commands/fileTemplateSnippets.js";
import { ISnippetsService } from "../../browser/snippets.js";
import { Snippet, SnippetSource } from "../../browser/snippetsFile.js";
suite("ApplyFileSnippetAction", () => {
  let disposables;
  let instantiationService;
  let model;
  let editor;
  setup(() => {
    disposables = new DisposableStore();
    const langConfigService = disposables.add(new TestLanguageConfigurationService());
    disposables.add(langConfigService.register("csharp", {
      comments: {
        lineComment: "//",
        blockComment: ["/*", "*/"]
      }
    }));
    const services = new ServiceCollection(
      [ILanguageConfigurationService, langConfigService]
    );
    instantiationService = createCodeEditorServices(disposables, services);
    const langService = instantiationService.get(ILanguageService);
    disposables.add(langService.registerLanguage({ id: "csharp", extensions: [".cs"] }));
    model = disposables.add(instantiateTextModel(instantiationService, "", null, {}, URI.parse("untitled:Untitled-1")));
    editor = disposables.add(instantiateTestCodeEditor(instantiationService, model));
    editor.registerAndInstantiateContribution(SnippetController2.ID, SnippetController2);
    instantiationService.stub(ISnippetsService, new class extends mock() {
      async getSnippets() {
        return [new Snippet(
          true,
          ["csharp"],
          "comment template",
          "comment template",
          "comment template",
          "$BLOCK_COMMENT_START block $BLOCK_COMMENT_END\n$LINE_COMMENT line",
          "user",
          SnippetSource.User,
          generateUuid()
        )];
      }
    }());
    instantiationService.stub(IQuickInputService, new class extends mock() {
      async pick(picks) {
        const resolved = Array.isArray(picks) ? picks : await picks;
        return resolved.find((p) => p.type !== "separator");
      }
    }());
    instantiationService.stub(IEditorService, new class extends mock() {
      constructor() {
        super(...arguments);
        this.activeTextEditorControl = editor;
      }
    }());
  });
  teardown(() => {
    disposables.dispose();
  });
  ensureNoDisposablesAreLeakedInTestSuite();
  test("resolves comment variables using selected file template language", async () => {
    await instantiationService.invokeFunction((accessor) => new ApplyFileSnippetAction().run(accessor));
    assert.strictEqual(model.getValue(), "/* block */\n// line");
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXHNuaXBwZXRzXFx0ZXN0XFxicm93c2VyXFxmaWxlVGVtcGxhdGVTbmlwcGV0cy50ZXN0LnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IGFzc2VydCBmcm9tICdhc3NlcnQnO1xuaW1wb3J0IHsgRGlzcG9zYWJsZVN0b3JlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IFVSSSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3VyaS5qcyc7XG5pbXBvcnQgeyBnZW5lcmF0ZVV1aWQgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi91dWlkLmpzJztcbmltcG9ydCB7IG1vY2sgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL3Rlc3QvY29tbW9uL21vY2suanMnO1xuaW1wb3J0IHsgZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS90ZXN0L2NvbW1vbi91dGlscy5qcyc7XG5pbXBvcnQgeyBJTGFuZ3VhZ2VTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9sYW5ndWFnZXMvbGFuZ3VhZ2UuanMnO1xuaW1wb3J0IHsgSUxhbmd1YWdlQ29uZmlndXJhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL2xhbmd1YWdlcy9sYW5ndWFnZUNvbmZpZ3VyYXRpb25SZWdpc3RyeS5qcyc7XG5pbXBvcnQgeyBUZXh0TW9kZWwgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL21vZGVsL3RleHRNb2RlbC5qcyc7XG5pbXBvcnQgeyBTbmlwcGV0Q29udHJvbGxlcjIgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9lZGl0b3IvY29udHJpYi9zbmlwcGV0L2Jyb3dzZXIvc25pcHBldENvbnRyb2xsZXIyLmpzJztcbmltcG9ydCB7IGNyZWF0ZUNvZGVFZGl0b3JTZXJ2aWNlcywgaW5zdGFudGlhdGVUZXN0Q29kZUVkaXRvciwgSVRlc3RDb2RlRWRpdG9yIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vZWRpdG9yL3Rlc3QvYnJvd3Nlci90ZXN0Q29kZUVkaXRvci5qcyc7XG5pbXBvcnQgeyBUZXN0TGFuZ3VhZ2VDb25maWd1cmF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2VkaXRvci90ZXN0L2NvbW1vbi9tb2Rlcy90ZXN0TGFuZ3VhZ2VDb25maWd1cmF0aW9uU2VydmljZS5qcyc7XG5pbXBvcnQgeyBpbnN0YW50aWF0ZVRleHRNb2RlbCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2VkaXRvci90ZXN0L2NvbW1vbi90ZXN0VGV4dE1vZGVsLmpzJztcbmltcG9ydCB7IFNlcnZpY2VDb2xsZWN0aW9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vaW5zdGFudGlhdGlvbi9jb21tb24vc2VydmljZUNvbGxlY3Rpb24uanMnO1xuaW1wb3J0IHsgVGVzdEluc3RhbnRpYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vaW5zdGFudGlhdGlvbi90ZXN0L2NvbW1vbi9pbnN0YW50aWF0aW9uU2VydmljZU1vY2suanMnO1xuaW1wb3J0IHsgSVF1aWNrSW5wdXRTZXJ2aWNlLCBJUXVpY2tQaWNrSXRlbSwgUXVpY2tQaWNrSW5wdXQgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9xdWlja2lucHV0L2NvbW1vbi9xdWlja0lucHV0LmpzJztcbmltcG9ydCB7IElFZGl0b3JTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vc2VydmljZXMvZWRpdG9yL2NvbW1vbi9lZGl0b3JTZXJ2aWNlLmpzJztcbmltcG9ydCB7IEFwcGx5RmlsZVNuaXBwZXRBY3Rpb24gfSBmcm9tICcuLi8uLi9icm93c2VyL2NvbW1hbmRzL2ZpbGVUZW1wbGF0ZVNuaXBwZXRzLmpzJztcbmltcG9ydCB7IElTbmlwcGV0c1NlcnZpY2UgfSBmcm9tICcuLi8uLi9icm93c2VyL3NuaXBwZXRzLmpzJztcbmltcG9ydCB7IFNuaXBwZXQsIFNuaXBwZXRTb3VyY2UgfSBmcm9tICcuLi8uLi9icm93c2VyL3NuaXBwZXRzRmlsZS5qcyc7XG5cbnN1aXRlKCdBcHBseUZpbGVTbmlwcGV0QWN0aW9uJywgKCkgPT4ge1xuXG5cdGxldCBkaXNwb3NhYmxlczogRGlzcG9zYWJsZVN0b3JlO1xuXHRsZXQgaW5zdGFudGlhdGlvblNlcnZpY2U6IFRlc3RJbnN0YW50aWF0aW9uU2VydmljZTtcblx0bGV0IG1vZGVsOiBUZXh0TW9kZWw7XG5cdGxldCBlZGl0b3I6IElUZXN0Q29kZUVkaXRvcjtcblxuXHRzZXR1cCgoKSA9PiB7XG5cdFx0ZGlzcG9zYWJsZXMgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cblx0XHRjb25zdCBsYW5nQ29uZmlnU2VydmljZSA9IGRpc3Bvc2FibGVzLmFkZChuZXcgVGVzdExhbmd1YWdlQ29uZmlndXJhdGlvblNlcnZpY2UoKSk7XG5cdFx0ZGlzcG9zYWJsZXMuYWRkKGxhbmdDb25maWdTZXJ2aWNlLnJlZ2lzdGVyKCdjc2hhcnAnLCB7XG5cdFx0XHRjb21tZW50czoge1xuXHRcdFx0XHRsaW5lQ29tbWVudDogJy8vJyxcblx0XHRcdFx0YmxvY2tDb21tZW50OiBbJy8qJywgJyovJ11cblx0XHRcdH1cblx0XHR9KSk7XG5cblx0XHRjb25zdCBzZXJ2aWNlcyA9IG5ldyBTZXJ2aWNlQ29sbGVjdGlvbihcblx0XHRcdFtJTGFuZ3VhZ2VDb25maWd1cmF0aW9uU2VydmljZSwgbGFuZ0NvbmZpZ1NlcnZpY2VdXG5cdFx0KTtcblx0XHRpbnN0YW50aWF0aW9uU2VydmljZSA9IGNyZWF0ZUNvZGVFZGl0b3JTZXJ2aWNlcyhkaXNwb3NhYmxlcywgc2VydmljZXMpO1xuXG5cdFx0Y29uc3QgbGFuZ1NlcnZpY2UgPSBpbnN0YW50aWF0aW9uU2VydmljZS5nZXQoSUxhbmd1YWdlU2VydmljZSk7XG5cdFx0ZGlzcG9zYWJsZXMuYWRkKGxhbmdTZXJ2aWNlLnJlZ2lzdGVyTGFuZ3VhZ2UoeyBpZDogJ2NzaGFycCcsIGV4dGVuc2lvbnM6IFsnLmNzJ10gfSkpO1xuXG5cdFx0bW9kZWwgPSBkaXNwb3NhYmxlcy5hZGQoaW5zdGFudGlhdGVUZXh0TW9kZWwoaW5zdGFudGlhdGlvblNlcnZpY2UsICcnLCBudWxsLCB7fSwgVVJJLnBhcnNlKCd1bnRpdGxlZDpVbnRpdGxlZC0xJykpKTtcblx0XHRlZGl0b3IgPSBkaXNwb3NhYmxlcy5hZGQoaW5zdGFudGlhdGVUZXN0Q29kZUVkaXRvcihpbnN0YW50aWF0aW9uU2VydmljZSwgbW9kZWwpKTtcblx0XHRlZGl0b3IucmVnaXN0ZXJBbmRJbnN0YW50aWF0ZUNvbnRyaWJ1dGlvbihTbmlwcGV0Q29udHJvbGxlcjIuSUQsIFNuaXBwZXRDb250cm9sbGVyMik7XG5cblx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElTbmlwcGV0c1NlcnZpY2UsIG5ldyBjbGFzcyBleHRlbmRzIG1vY2s8SVNuaXBwZXRzU2VydmljZT4oKSB7XG5cdFx0XHRvdmVycmlkZSBhc3luYyBnZXRTbmlwcGV0cygpIHtcblx0XHRcdFx0cmV0dXJuIFtuZXcgU25pcHBldChcblx0XHRcdFx0XHR0cnVlLFxuXHRcdFx0XHRcdFsnY3NoYXJwJ10sXG5cdFx0XHRcdFx0J2NvbW1lbnQgdGVtcGxhdGUnLFxuXHRcdFx0XHRcdCdjb21tZW50IHRlbXBsYXRlJyxcblx0XHRcdFx0XHQnY29tbWVudCB0ZW1wbGF0ZScsXG5cdFx0XHRcdFx0JyRCTE9DS19DT01NRU5UX1NUQVJUIGJsb2NrICRCTE9DS19DT01NRU5UX0VORFxcbiRMSU5FX0NPTU1FTlQgbGluZScsXG5cdFx0XHRcdFx0J3VzZXInLFxuXHRcdFx0XHRcdFNuaXBwZXRTb3VyY2UuVXNlcixcblx0XHRcdFx0XHRnZW5lcmF0ZVV1aWQoKVxuXHRcdFx0XHQpXTtcblx0XHRcdH1cblx0XHR9KTtcblxuXHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSVF1aWNrSW5wdXRTZXJ2aWNlLCBuZXcgY2xhc3MgZXh0ZW5kcyBtb2NrPElRdWlja0lucHV0U2VydmljZT4oKSB7XG5cdFx0XHRvdmVycmlkZSBhc3luYyBwaWNrPFQgZXh0ZW5kcyBJUXVpY2tQaWNrSXRlbT4ocGlja3M6IFByb21pc2U8UXVpY2tQaWNrSW5wdXQ8VD5bXT4gfCBRdWlja1BpY2tJbnB1dDxUPltdKTogUHJvbWlzZTxUIHwgdW5kZWZpbmVkPiB7XG5cdFx0XHRcdGNvbnN0IHJlc29sdmVkID0gQXJyYXkuaXNBcnJheShwaWNrcykgPyBwaWNrcyA6IGF3YWl0IHBpY2tzO1xuXHRcdFx0XHRyZXR1cm4gcmVzb2x2ZWQuZmluZChwID0+IHAudHlwZSAhPT0gJ3NlcGFyYXRvcicpIGFzIFQgfCB1bmRlZmluZWQ7XG5cdFx0XHR9XG5cdFx0fSk7XG5cblx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElFZGl0b3JTZXJ2aWNlLCBuZXcgY2xhc3MgZXh0ZW5kcyBtb2NrPElFZGl0b3JTZXJ2aWNlPigpIHtcblx0XHRcdG92ZXJyaWRlIGFjdGl2ZVRleHRFZGl0b3JDb250cm9sID0gZWRpdG9yO1xuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZWFyZG93bigoKSA9PiB7XG5cdFx0ZGlzcG9zYWJsZXMuZGlzcG9zZSgpO1xuXHR9KTtcblxuXHRlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUoKTtcblxuXHR0ZXN0KCdyZXNvbHZlcyBjb21tZW50IHZhcmlhYmxlcyB1c2luZyBzZWxlY3RlZCBmaWxlIHRlbXBsYXRlIGxhbmd1YWdlJywgYXN5bmMgKCkgPT4ge1xuXHRcdGF3YWl0IGluc3RhbnRpYXRpb25TZXJ2aWNlLmludm9rZUZ1bmN0aW9uKGFjY2Vzc29yID0+IG5ldyBBcHBseUZpbGVTbmlwcGV0QWN0aW9uKCkucnVuKGFjY2Vzc29yKSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1vZGVsLmdldFZhbHVlKCksICcvKiBibG9jayAqL1xcbi8vIGxpbmUnKTtcblx0fSk7XG59KTtcbiJdLAogICJtYXBwaW5ncyI6ICJBQUtBLE9BQU8sWUFBWTtBQUNuQixTQUFTLHVCQUF1QjtBQUNoQyxTQUFTLFdBQVc7QUFDcEIsU0FBUyxvQkFBb0I7QUFDN0IsU0FBUyxZQUFZO0FBQ3JCLFNBQVMsK0NBQStDO0FBQ3hELFNBQVMsd0JBQXdCO0FBQ2pDLFNBQVMscUNBQXFDO0FBRTlDLFNBQVMsMEJBQTBCO0FBQ25DLFNBQVMsMEJBQTBCLGlDQUFrRDtBQUNyRixTQUFTLHdDQUF3QztBQUNqRCxTQUFTLDRCQUE0QjtBQUNyQyxTQUFTLHlCQUF5QjtBQUVsQyxTQUFTLDBCQUEwRDtBQUNuRSxTQUFTLHNCQUFzQjtBQUMvQixTQUFTLDhCQUE4QjtBQUN2QyxTQUFTLHdCQUF3QjtBQUNqQyxTQUFTLFNBQVMscUJBQXFCO0FBRXZDLE1BQU0sMEJBQTBCLE1BQU07QUFFckMsTUFBSTtBQUNKLE1BQUk7QUFDSixNQUFJO0FBQ0osTUFBSTtBQUVKLFFBQU0sTUFBTTtBQUNYLGtCQUFjLElBQUksZ0JBQWdCO0FBRWxDLFVBQU0sb0JBQW9CLFlBQVksSUFBSSxJQUFJLGlDQUFpQyxDQUFDO0FBQ2hGLGdCQUFZLElBQUksa0JBQWtCLFNBQVMsVUFBVTtBQUFBLE1BQ3BELFVBQVU7QUFBQSxRQUNULGFBQWE7QUFBQSxRQUNiLGNBQWMsQ0FBQyxNQUFNLElBQUk7QUFBQSxNQUMxQjtBQUFBLElBQ0QsQ0FBQyxDQUFDO0FBRUYsVUFBTSxXQUFXLElBQUk7QUFBQSxNQUNwQixDQUFDLCtCQUErQixpQkFBaUI7QUFBQSxJQUNsRDtBQUNBLDJCQUF1Qix5QkFBeUIsYUFBYSxRQUFRO0FBRXJFLFVBQU0sY0FBYyxxQkFBcUIsSUFBSSxnQkFBZ0I7QUFDN0QsZ0JBQVksSUFBSSxZQUFZLGlCQUFpQixFQUFFLElBQUksVUFBVSxZQUFZLENBQUMsS0FBSyxFQUFFLENBQUMsQ0FBQztBQUVuRixZQUFRLFlBQVksSUFBSSxxQkFBcUIsc0JBQXNCLElBQUksTUFBTSxDQUFDLEdBQUcsSUFBSSxNQUFNLHFCQUFxQixDQUFDLENBQUM7QUFDbEgsYUFBUyxZQUFZLElBQUksMEJBQTBCLHNCQUFzQixLQUFLLENBQUM7QUFDL0UsV0FBTyxtQ0FBbUMsbUJBQW1CLElBQUksa0JBQWtCO0FBRW5GLHlCQUFxQixLQUFLLGtCQUFrQixJQUFJLGNBQWMsS0FBdUIsRUFBRTtBQUFBLE1BQ3RGLE1BQWUsY0FBYztBQUM1QixlQUFPLENBQUMsSUFBSTtBQUFBLFVBQ1g7QUFBQSxVQUNBLENBQUMsUUFBUTtBQUFBLFVBQ1Q7QUFBQSxVQUNBO0FBQUEsVUFDQTtBQUFBLFVBQ0E7QUFBQSxVQUNBO0FBQUEsVUFDQSxjQUFjO0FBQUEsVUFDZCxhQUFhO0FBQUEsUUFDZCxDQUFDO0FBQUEsTUFDRjtBQUFBLElBQ0QsR0FBQztBQUVELHlCQUFxQixLQUFLLG9CQUFvQixJQUFJLGNBQWMsS0FBeUIsRUFBRTtBQUFBLE1BQzFGLE1BQWUsS0FBK0IsT0FBbUY7QUFDaEksY0FBTSxXQUFXLE1BQU0sUUFBUSxLQUFLLElBQUksUUFBUSxNQUFNO0FBQ3RELGVBQU8sU0FBUyxLQUFLLE9BQUssRUFBRSxTQUFTLFdBQVc7QUFBQSxNQUNqRDtBQUFBLElBQ0QsR0FBQztBQUVELHlCQUFxQixLQUFLLGdCQUFnQixJQUFJLGNBQWMsS0FBcUIsRUFBRTtBQUFBLE1BQXJDO0FBQUE7QUFDN0MsYUFBUywwQkFBMEI7QUFBQTtBQUFBLElBQ3BDLEdBQUM7QUFBQSxFQUNGLENBQUM7QUFFRCxXQUFTLE1BQU07QUFDZCxnQkFBWSxRQUFRO0FBQUEsRUFDckIsQ0FBQztBQUVELDBDQUF3QztBQUV4QyxPQUFLLG9FQUFvRSxZQUFZO0FBQ3BGLFVBQU0scUJBQXFCLGVBQWUsY0FBWSxJQUFJLHVCQUF1QixFQUFFLElBQUksUUFBUSxDQUFDO0FBQ2hHLFdBQU8sWUFBWSxNQUFNLFNBQVMsR0FBRyxzQkFBc0I7QUFBQSxFQUM1RCxDQUFDO0FBQ0YsQ0FBQzsiLAogICJuYW1lcyI6IFtdCn0K
