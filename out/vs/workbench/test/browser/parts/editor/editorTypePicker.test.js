import assert from "assert";
import { mock } from "../../../../../base/test/common/mock.js";
import { URI } from "../../../../../base/common/uri.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../../base/test/common/utils.js";
import { DEFAULT_EDITOR_ASSOCIATION } from "../../../../common/editor.js";
import { EditorInput } from "../../../../common/editor/editorInput.js";
import { getAvailableEditorTypes } from "../../../../browser/parts/editor/editorTypePicker.js";
import { RegisteredEditorPriority } from "../../../../services/editor/common/editorResolverService.js";
suite("Editor Type Picker", () => {
  const disposables = ensureNoDisposablesAreLeakedInTestSuite();
  function editor(id, editorPriority, diffPriority = editorPriority) {
    return {
      id,
      label: id,
      priority: {
        editor: editorPriority,
        diff: diffPriority,
        merge: editorPriority
      }
    };
  }
  test("inline custom diff editor is classified as a diff editor", () => {
    const original = URI.file("/original/test.md");
    const modified = URI.file("/modified/test.md");
    const registeredEditors = [
      editor(DEFAULT_EDITOR_ASSOCIATION.id, RegisteredEditorPriority.builtin),
      editor("test.markdownEditor", RegisteredEditorPriority.option, RegisteredEditorPriority.explicit)
    ];
    const input = disposables.add(new class extends EditorInput {
      get typeId() {
        return "test.inlineCustomDiffEditor";
      }
      get editorId() {
        return "test.markdownEditor";
      }
      get resource() {
        return modified;
      }
      get diffResources() {
        return { original, modified };
      }
      getName() {
        return "test";
      }
    }());
    const requestedResources = [];
    const requestedOptions = [];
    const editorResolverService = new class extends mock() {
      getEditors(resourceOrOptions, options) {
        if (URI.isUri(resourceOrOptions)) {
          requestedResources.push(resourceOrOptions);
        }
        requestedOptions.push(options);
        return registeredEditors;
      }
    }();
    const result = getAvailableEditorTypes(input, editorResolverService);
    assert.deepStrictEqual({ requestedResources, requestedOptions, result }, {
      requestedResources: [modified],
      requestedOptions: [{
        excludeUnconfiguredUniversalOptionalEditors: true,
        currentEditorId: "test.markdownEditor",
        isDiffEditor: true
      }],
      result: {
        resource: modified,
        isDiffEditor: true,
        originalResource: original,
        modifiedResource: modified,
        currentId: "test.markdownEditor",
        editors: registeredEditors
      }
    });
  });
  test("hidden editor types are omitted unless currently active", () => {
    const resource = URI.file("/workspace/test.md");
    const registeredEditors = [
      editor(DEFAULT_EDITOR_ASSOCIATION.id, RegisteredEditorPriority.builtin),
      editor("test.markdownEditor", RegisteredEditorPriority.option),
      editor("test.markdownPreview", RegisteredEditorPriority.option)
    ];
    class TestEditorInput extends EditorInput {
      constructor(id) {
        super();
        this.id = id;
      }
      get typeId() {
        return "test.editor";
      }
      get editorId() {
        return this.id;
      }
      get resource() {
        return resource;
      }
      getName() {
        return "test";
      }
    }
    const editorResolverService = new class extends mock() {
      getEditors() {
        return registeredEditors;
      }
    }();
    const markdownEditor = disposables.add(new TestEditorInput("test.markdownEditor"));
    const markdownPreview = disposables.add(new TestEditorInput("test.markdownPreview"));
    const getEditorIds = (input) => getAvailableEditorTypes(input, editorResolverService, ["test.markdownPreview"])?.editors.map((editor2) => editor2.id);
    assert.deepStrictEqual({
      hidden: getEditorIds(markdownEditor),
      active: getEditorIds(markdownPreview)
    }, {
      hidden: [DEFAULT_EDITOR_ASSOCIATION.id, "test.markdownEditor"],
      active: [DEFAULT_EDITOR_ASSOCIATION.id, "test.markdownEditor", "test.markdownPreview"]
    });
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXHRlc3RcXGJyb3dzZXJcXHBhcnRzXFxlZGl0b3JcXGVkaXRvclR5cGVQaWNrZXIudGVzdC50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCBhc3NlcnQgZnJvbSAnYXNzZXJ0JztcbmltcG9ydCB7IG1vY2sgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL3Rlc3QvY29tbW9uL21vY2suanMnO1xuaW1wb3J0IHsgVVJJIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdXJpLmpzJztcbmltcG9ydCB7IGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvdGVzdC9jb21tb24vdXRpbHMuanMnO1xuaW1wb3J0IHsgREVGQVVMVF9FRElUT1JfQVNTT0NJQVRJT04sIElFZGl0b3JJbnB1dFdpdGhEaWZmUmVzb3VyY2VzIH0gZnJvbSAnLi4vLi4vLi4vLi4vY29tbW9uL2VkaXRvci5qcyc7XG5pbXBvcnQgeyBFZGl0b3JJbnB1dCB9IGZyb20gJy4uLy4uLy4uLy4uL2NvbW1vbi9lZGl0b3IvZWRpdG9ySW5wdXQuanMnO1xuaW1wb3J0IHsgZ2V0QXZhaWxhYmxlRWRpdG9yVHlwZXMgfSBmcm9tICcuLi8uLi8uLi8uLi9icm93c2VyL3BhcnRzL2VkaXRvci9lZGl0b3JUeXBlUGlja2VyLmpzJztcbmltcG9ydCB7IElFZGl0b3JSZXNvbHZlclNlcnZpY2UsIElFZGl0b3JSZXNvbHZlclNlcnZpY2VHZXRBbGxFZGl0b3JzT3B0aW9ucywgSUVkaXRvclJlc29sdmVyU2VydmljZUdldEVkaXRvcnNPcHRpb25zLCBSZWdpc3RlcmVkRWRpdG9ySW5mbywgUmVnaXN0ZXJlZEVkaXRvclByaW9yaXR5IH0gZnJvbSAnLi4vLi4vLi4vLi4vc2VydmljZXMvZWRpdG9yL2NvbW1vbi9lZGl0b3JSZXNvbHZlclNlcnZpY2UuanMnO1xuXG5zdWl0ZSgnRWRpdG9yIFR5cGUgUGlja2VyJywgKCkgPT4ge1xuXG5cdGNvbnN0IGRpc3Bvc2FibGVzID0gZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlKCk7XG5cblx0ZnVuY3Rpb24gZWRpdG9yKGlkOiBzdHJpbmcsIGVkaXRvclByaW9yaXR5OiBSZWdpc3RlcmVkRWRpdG9yUHJpb3JpdHksIGRpZmZQcmlvcml0eSA9IGVkaXRvclByaW9yaXR5KTogUmVnaXN0ZXJlZEVkaXRvckluZm8ge1xuXHRcdHJldHVybiB7XG5cdFx0XHRpZCxcblx0XHRcdGxhYmVsOiBpZCxcblx0XHRcdHByaW9yaXR5OiB7XG5cdFx0XHRcdGVkaXRvcjogZWRpdG9yUHJpb3JpdHksXG5cdFx0XHRcdGRpZmY6IGRpZmZQcmlvcml0eSxcblx0XHRcdFx0bWVyZ2U6IGVkaXRvclByaW9yaXR5LFxuXHRcdFx0fVxuXHRcdH07XG5cdH1cblxuXHR0ZXN0KCdpbmxpbmUgY3VzdG9tIGRpZmYgZWRpdG9yIGlzIGNsYXNzaWZpZWQgYXMgYSBkaWZmIGVkaXRvcicsICgpID0+IHtcblx0XHRjb25zdCBvcmlnaW5hbCA9IFVSSS5maWxlKCcvb3JpZ2luYWwvdGVzdC5tZCcpO1xuXHRcdGNvbnN0IG1vZGlmaWVkID0gVVJJLmZpbGUoJy9tb2RpZmllZC90ZXN0Lm1kJyk7XG5cdFx0Y29uc3QgcmVnaXN0ZXJlZEVkaXRvcnMgPSBbXG5cdFx0XHRlZGl0b3IoREVGQVVMVF9FRElUT1JfQVNTT0NJQVRJT04uaWQsIFJlZ2lzdGVyZWRFZGl0b3JQcmlvcml0eS5idWlsdGluKSxcblx0XHRcdGVkaXRvcigndGVzdC5tYXJrZG93bkVkaXRvcicsIFJlZ2lzdGVyZWRFZGl0b3JQcmlvcml0eS5vcHRpb24sIFJlZ2lzdGVyZWRFZGl0b3JQcmlvcml0eS5leHBsaWNpdCksXG5cdFx0XTtcblx0XHRjb25zdCBpbnB1dCA9IGRpc3Bvc2FibGVzLmFkZChuZXcgY2xhc3MgZXh0ZW5kcyBFZGl0b3JJbnB1dCBpbXBsZW1lbnRzIElFZGl0b3JJbnB1dFdpdGhEaWZmUmVzb3VyY2VzIHtcblx0XHRcdG92ZXJyaWRlIGdldCB0eXBlSWQoKTogc3RyaW5nIHsgcmV0dXJuICd0ZXN0LmlubGluZUN1c3RvbURpZmZFZGl0b3InOyB9XG5cdFx0XHRvdmVycmlkZSBnZXQgZWRpdG9ySWQoKTogc3RyaW5nIHsgcmV0dXJuICd0ZXN0Lm1hcmtkb3duRWRpdG9yJzsgfVxuXHRcdFx0b3ZlcnJpZGUgZ2V0IHJlc291cmNlKCk6IFVSSSB7IHJldHVybiBtb2RpZmllZDsgfVxuXHRcdFx0Z2V0IGRpZmZSZXNvdXJjZXMoKTogSUVkaXRvcklucHV0V2l0aERpZmZSZXNvdXJjZXNbJ2RpZmZSZXNvdXJjZXMnXSB7IHJldHVybiB7IG9yaWdpbmFsLCBtb2RpZmllZCB9OyB9XG5cdFx0XHRvdmVycmlkZSBnZXROYW1lKCk6IHN0cmluZyB7IHJldHVybiAndGVzdCc7IH1cblx0XHR9KCkpO1xuXHRcdGNvbnN0IHJlcXVlc3RlZFJlc291cmNlczogVVJJW10gPSBbXTtcblx0XHRjb25zdCByZXF1ZXN0ZWRPcHRpb25zOiAoSUVkaXRvclJlc29sdmVyU2VydmljZUdldEVkaXRvcnNPcHRpb25zIHwgdW5kZWZpbmVkKVtdID0gW107XG5cdFx0Y29uc3QgZWRpdG9yUmVzb2x2ZXJTZXJ2aWNlID0gbmV3IGNsYXNzIGV4dGVuZHMgbW9jazxJRWRpdG9yUmVzb2x2ZXJTZXJ2aWNlPigpIHtcblx0XHRcdG92ZXJyaWRlIGdldEVkaXRvcnMocmVzb3VyY2VPck9wdGlvbnM/OiBVUkkgfCBJRWRpdG9yUmVzb2x2ZXJTZXJ2aWNlR2V0QWxsRWRpdG9yc09wdGlvbnMsIG9wdGlvbnM/OiBJRWRpdG9yUmVzb2x2ZXJTZXJ2aWNlR2V0RWRpdG9yc09wdGlvbnMpOiBSZWdpc3RlcmVkRWRpdG9ySW5mb1tdIHtcblx0XHRcdFx0aWYgKFVSSS5pc1VyaShyZXNvdXJjZU9yT3B0aW9ucykpIHtcblx0XHRcdFx0XHRyZXF1ZXN0ZWRSZXNvdXJjZXMucHVzaChyZXNvdXJjZU9yT3B0aW9ucyk7XG5cdFx0XHRcdH1cblx0XHRcdFx0cmVxdWVzdGVkT3B0aW9ucy5wdXNoKG9wdGlvbnMpO1xuXHRcdFx0XHRyZXR1cm4gcmVnaXN0ZXJlZEVkaXRvcnM7XG5cdFx0XHR9XG5cdFx0fTtcblxuXHRcdGNvbnN0IHJlc3VsdCA9IGdldEF2YWlsYWJsZUVkaXRvclR5cGVzKGlucHV0LCBlZGl0b3JSZXNvbHZlclNlcnZpY2UpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7IHJlcXVlc3RlZFJlc291cmNlcywgcmVxdWVzdGVkT3B0aW9ucywgcmVzdWx0IH0sIHtcblx0XHRcdHJlcXVlc3RlZFJlc291cmNlczogW21vZGlmaWVkXSxcblx0XHRcdHJlcXVlc3RlZE9wdGlvbnM6IFt7XG5cdFx0XHRcdGV4Y2x1ZGVVbmNvbmZpZ3VyZWRVbml2ZXJzYWxPcHRpb25hbEVkaXRvcnM6IHRydWUsXG5cdFx0XHRcdGN1cnJlbnRFZGl0b3JJZDogJ3Rlc3QubWFya2Rvd25FZGl0b3InLFxuXHRcdFx0XHRpc0RpZmZFZGl0b3I6IHRydWUsXG5cdFx0XHR9XSxcblx0XHRcdHJlc3VsdDoge1xuXHRcdFx0XHRyZXNvdXJjZTogbW9kaWZpZWQsXG5cdFx0XHRcdGlzRGlmZkVkaXRvcjogdHJ1ZSxcblx0XHRcdFx0b3JpZ2luYWxSZXNvdXJjZTogb3JpZ2luYWwsXG5cdFx0XHRcdG1vZGlmaWVkUmVzb3VyY2U6IG1vZGlmaWVkLFxuXHRcdFx0XHRjdXJyZW50SWQ6ICd0ZXN0Lm1hcmtkb3duRWRpdG9yJyxcblx0XHRcdFx0ZWRpdG9yczogcmVnaXN0ZXJlZEVkaXRvcnMsXG5cdFx0XHR9XG5cdFx0fSk7XG5cdH0pO1xuXHR0ZXN0KCdoaWRkZW4gZWRpdG9yIHR5cGVzIGFyZSBvbWl0dGVkIHVubGVzcyBjdXJyZW50bHkgYWN0aXZlJywgKCkgPT4ge1xuXHRcdGNvbnN0IHJlc291cmNlID0gVVJJLmZpbGUoJy93b3Jrc3BhY2UvdGVzdC5tZCcpO1xuXHRcdGNvbnN0IHJlZ2lzdGVyZWRFZGl0b3JzID0gW1xuXHRcdFx0ZWRpdG9yKERFRkFVTFRfRURJVE9SX0FTU09DSUFUSU9OLmlkLCBSZWdpc3RlcmVkRWRpdG9yUHJpb3JpdHkuYnVpbHRpbiksXG5cdFx0XHRlZGl0b3IoJ3Rlc3QubWFya2Rvd25FZGl0b3InLCBSZWdpc3RlcmVkRWRpdG9yUHJpb3JpdHkub3B0aW9uKSxcblx0XHRcdGVkaXRvcigndGVzdC5tYXJrZG93blByZXZpZXcnLCBSZWdpc3RlcmVkRWRpdG9yUHJpb3JpdHkub3B0aW9uKSxcblx0XHRdO1xuXHRcdGNsYXNzIFRlc3RFZGl0b3JJbnB1dCBleHRlbmRzIEVkaXRvcklucHV0IHtcblx0XHRcdGNvbnN0cnVjdG9yKHByaXZhdGUgcmVhZG9ubHkgaWQ6IHN0cmluZykge1xuXHRcdFx0XHRzdXBlcigpO1xuXHRcdFx0fVxuXG5cdFx0XHRvdmVycmlkZSBnZXQgdHlwZUlkKCk6IHN0cmluZyB7IHJldHVybiAndGVzdC5lZGl0b3InOyB9XG5cdFx0XHRvdmVycmlkZSBnZXQgZWRpdG9ySWQoKTogc3RyaW5nIHsgcmV0dXJuIHRoaXMuaWQ7IH1cblx0XHRcdG92ZXJyaWRlIGdldCByZXNvdXJjZSgpOiBVUkkgeyByZXR1cm4gcmVzb3VyY2U7IH1cblx0XHRcdG92ZXJyaWRlIGdldE5hbWUoKTogc3RyaW5nIHsgcmV0dXJuICd0ZXN0JzsgfVxuXHRcdH1cblx0XHRjb25zdCBlZGl0b3JSZXNvbHZlclNlcnZpY2UgPSBuZXcgY2xhc3MgZXh0ZW5kcyBtb2NrPElFZGl0b3JSZXNvbHZlclNlcnZpY2U+KCkge1xuXHRcdFx0b3ZlcnJpZGUgZ2V0RWRpdG9ycygpOiBSZWdpc3RlcmVkRWRpdG9ySW5mb1tdIHtcblx0XHRcdFx0cmV0dXJuIHJlZ2lzdGVyZWRFZGl0b3JzO1xuXHRcdFx0fVxuXHRcdH07XG5cdFx0Y29uc3QgbWFya2Rvd25FZGl0b3IgPSBkaXNwb3NhYmxlcy5hZGQobmV3IFRlc3RFZGl0b3JJbnB1dCgndGVzdC5tYXJrZG93bkVkaXRvcicpKTtcblx0XHRjb25zdCBtYXJrZG93blByZXZpZXcgPSBkaXNwb3NhYmxlcy5hZGQobmV3IFRlc3RFZGl0b3JJbnB1dCgndGVzdC5tYXJrZG93blByZXZpZXcnKSk7XG5cdFx0Y29uc3QgZ2V0RWRpdG9ySWRzID0gKGlucHV0OiBFZGl0b3JJbnB1dCkgPT4gZ2V0QXZhaWxhYmxlRWRpdG9yVHlwZXMoaW5wdXQsIGVkaXRvclJlc29sdmVyU2VydmljZSwgWyd0ZXN0Lm1hcmtkb3duUHJldmlldyddKT8uZWRpdG9ycy5tYXAoZWRpdG9yID0+IGVkaXRvci5pZCk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdGhpZGRlbjogZ2V0RWRpdG9ySWRzKG1hcmtkb3duRWRpdG9yKSxcblx0XHRcdGFjdGl2ZTogZ2V0RWRpdG9ySWRzKG1hcmtkb3duUHJldmlldyksXG5cdFx0fSwge1xuXHRcdFx0aGlkZGVuOiBbREVGQVVMVF9FRElUT1JfQVNTT0NJQVRJT04uaWQsICd0ZXN0Lm1hcmtkb3duRWRpdG9yJ10sXG5cdFx0XHRhY3RpdmU6IFtERUZBVUxUX0VESVRPUl9BU1NPQ0lBVElPTi5pZCwgJ3Rlc3QubWFya2Rvd25FZGl0b3InLCAndGVzdC5tYXJrZG93blByZXZpZXcnXSxcblx0XHR9KTtcblx0fSk7XG5cbn0pOyJdLAogICJtYXBwaW5ncyI6ICJBQUtBLE9BQU8sWUFBWTtBQUNuQixTQUFTLFlBQVk7QUFDckIsU0FBUyxXQUFXO0FBQ3BCLFNBQVMsK0NBQStDO0FBQ3hELFNBQVMsa0NBQWlFO0FBQzFFLFNBQVMsbUJBQW1CO0FBQzVCLFNBQVMsK0JBQStCO0FBQ3hDLFNBQTRJLGdDQUFnQztBQUU1SyxNQUFNLHNCQUFzQixNQUFNO0FBRWpDLFFBQU0sY0FBYyx3Q0FBd0M7QUFFNUQsV0FBUyxPQUFPLElBQVksZ0JBQTBDLGVBQWUsZ0JBQXNDO0FBQzFILFdBQU87QUFBQSxNQUNOO0FBQUEsTUFDQSxPQUFPO0FBQUEsTUFDUCxVQUFVO0FBQUEsUUFDVCxRQUFRO0FBQUEsUUFDUixNQUFNO0FBQUEsUUFDTixPQUFPO0FBQUEsTUFDUjtBQUFBLElBQ0Q7QUFBQSxFQUNEO0FBRUEsT0FBSyw0REFBNEQsTUFBTTtBQUN0RSxVQUFNLFdBQVcsSUFBSSxLQUFLLG1CQUFtQjtBQUM3QyxVQUFNLFdBQVcsSUFBSSxLQUFLLG1CQUFtQjtBQUM3QyxVQUFNLG9CQUFvQjtBQUFBLE1BQ3pCLE9BQU8sMkJBQTJCLElBQUkseUJBQXlCLE9BQU87QUFBQSxNQUN0RSxPQUFPLHVCQUF1Qix5QkFBeUIsUUFBUSx5QkFBeUIsUUFBUTtBQUFBLElBQ2pHO0FBQ0EsVUFBTSxRQUFRLFlBQVksSUFBSSxJQUFJLGNBQWMsWUFBcUQ7QUFBQSxNQUNwRyxJQUFhLFNBQWlCO0FBQUUsZUFBTztBQUFBLE1BQStCO0FBQUEsTUFDdEUsSUFBYSxXQUFtQjtBQUFFLGVBQU87QUFBQSxNQUF1QjtBQUFBLE1BQ2hFLElBQWEsV0FBZ0I7QUFBRSxlQUFPO0FBQUEsTUFBVTtBQUFBLE1BQ2hELElBQUksZ0JBQWdFO0FBQUUsZUFBTyxFQUFFLFVBQVUsU0FBUztBQUFBLE1BQUc7QUFBQSxNQUM1RixVQUFrQjtBQUFFLGVBQU87QUFBQSxNQUFRO0FBQUEs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
