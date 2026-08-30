import { constObservable } from "../../../../../../base/common/observable.js";
import { URI } from "../../../../../../base/common/uri.js";
import { createEditorServices, defineThemedFixtureGroup, defineComponentFixture, createTextModel } from "../../fixtureUtils.js";
import { EditorExtensionsRegistry } from "../../../../../../editor/browser/editorExtensions.js";
import { CodeEditorWidget } from "../../../../../../editor/browser/widget/codeEditor/codeEditorWidget.js";
import { Range } from "../../../../../../editor/common/core/range.js";
import { InlineCompletionsController } from "../../../../../../editor/contrib/inlineCompletions/browser/controller/inlineCompletionsController.js";
import "../../../../../../editor/contrib/inlineCompletions/browser/inlineCompletions.contribution.js";
import { InlineCompletionsSource, InlineCompletionsState } from "../../../../../../editor/contrib/inlineCompletions/browser/model/inlineCompletionsSource.js";
import { InlineEditItem } from "../../../../../../editor/contrib/inlineCompletions/browser/model/inlineSuggestionItem.js";
import { TextModelValueReference } from "../../../../../../editor/contrib/inlineCompletions/browser/model/textModelValueReference.js";
function renderInlineEdit(options) {
  const { container, disposableStore, theme } = options;
  container.style.width = options.width ?? "500px";
  container.style.height = options.height ?? "170px";
  container.style.border = "1px solid var(--vscode-editorWidget-border)";
  const instantiationService = createEditorServices(disposableStore, { colorTheme: theme });
  const textModel = disposableStore.add(createTextModel(
    instantiationService,
    options.code,
    URI.parse("inmemory://inline-edit.ts"),
    "typescript"
  ));
  instantiationService.stubInstance(InlineCompletionsSource, {
    cancelUpdate: () => {
    },
    clear: () => {
    },
    clearOperationOnTextModelChange: constObservable(void 0),
    clearSuggestWidgetInlineCompletions: () => {
    },
    dispose: () => {
    },
    fetch: async () => true,
    inlineCompletions: constObservable(disposableStore.add(new InlineCompletionsState([
      InlineEditItem.createForTest(
        TextModelValueReference.snapshot(textModel),
        new Range(
          options.range.startLineNumber,
          options.range.startColumn,
          options.range.endLineNumber,
          options.range.endColumn
        ),
        options.newText
      )
    ], void 0))),
    loading: constObservable(false),
    seedInlineCompletionsWithSuggestWidget: () => {
    },
    seedWithCompletion: () => {
    },
    suggestWidgetInlineCompletions: constObservable(disposableStore.add(InlineCompletionsState.createEmpty()))
  });
  const editorWidgetOptions = {
    contributions: EditorExtensionsRegistry.getEditorContributions()
  };
  const editor = disposableStore.add(instantiationService.createInstance(
    CodeEditorWidget,
    container,
    {
      automaticLayout: true,
      minimap: { enabled: false },
      lineNumbers: "on",
      scrollBeyondLastLine: false,
      fontSize: 14,
      cursorBlinking: "solid",
      ...options.editorOptions
    },
    editorWidgetOptions
  ));
  editor.setModel(textModel);
  editor.setPosition({ lineNumber: options.cursorLine, column: 1 });
  editor.focus();
  const controller = InlineCompletionsController.get(editor);
  controller?.model?.get();
}
var views_fixture_default = defineThemedFixtureGroup({ path: "editor/inlineCompletions/" }, {
  // Side-by-side view: Narrow editor with multi-line replacement
  SideBySideViewSmall: defineComponentFixture({
    labels: { kind: "screenshot" },
    render: (context) => renderInlineEdit({
      ...context,
      code: `function calculate(a, b) {
	const sum = a + b;
	return sum;
}`,
      cursorLine: 2,
      range: { startLineNumber: 2, startColumn: 1, endLineNumber: 3, endColumn: 100 },
      newText: "	const result = a * b + a + b;\n	console.log(result);\n	return result;"
    })
  }),
  // Side-by-side view: Wide editor with multi-line replacement
  SideBySideViewWide: defineComponentFixture({
    labels: { kind: "screenshot" },
    render: (context) => renderInlineEdit({
      ...context,
      code: `function calculate(a, b) {
	const sum = a + b;
	return sum;
}`,
      cursorLine: 2,
      range: { startLineNumber: 2, startColumn: 1, endLineNumber: 3, endColumn: 100 },
      newText: "	const result = a * b + a + b;\n	console.log(result);\n	return result;",
      width: "800px"
    })
  }),
  // Word replacement view: Single word change
  WordReplacementView: defineComponentFixture({
    labels: { kind: "screenshot" },
    render: (context) => renderInlineEdit({
      ...context,
      code: `class BufferData {
	append(data: number[]) {
		this.data.push(data);
	}
}`,
      cursorLine: 2,
      range: { startLineNumber: 2, startColumn: 2, endLineNumber: 2, endColumn: 8 },
      newText: "push",
      height: "200px"
    })
  }),
  // Insertion view: Insert new content
  InsertionView: defineComponentFixture({
    labels: { kind: "screenshot", flaky: true },
    render: (context) => renderInlineEdit({
      ...context,
      code: `class BufferData {
	append(data: number[]) {} // appends data
}`,
      cursorLine: 2,
      range: { startLineNumber: 2, startColumn: 26, endLineNumber: 2, endColumn: 26 },
      newText: `
		console.log(data);
	`,
      height: "200px",
      editorOptions: {
        inlineSuggest: {
          edits: { allowCodeShifting: "always" }
        }
      }
    })
  }),
  // Deletion view: Removing code
  DeletionView: defineComponentFixture({
    labels: { kind: "screenshot" },
    render: (context) => renderInlineEdit({
      ...context,
      code: `function process(data: string[]) {
	console.log("processing:", data);
	const result = data.map(d => d.trim());
	return result;
}`,
      cursorLine: 2,
      range: { startLineNumber: 2, startColumn: 1, endLineNumber: 2, endColumn: 100 },
      newText: "",
      height: "200px"
    })
  }),
  // Line replacement view: Single-line with multiple changes
  LineReplacementView: defineComponentFixture({
    labels: { kind: "screenshot" },
    render: (context) => renderInlineEdit({
      ...context,
      code: `function calculate(width: number, height: number): number {
	const area = width * height;
	return area;
}`,
      cursorLine: 2,
      range: { startLineNumber: 2, startColumn: 1, endLineNumber: 2, endColumn: 100 },
      newText: "	const volume = width * height * depth;",
      height: "200px"
    })
  })
});
export {
  views_fixture_default as default
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXHRlc3RcXGJyb3dzZXJcXGNvbXBvbmVudEZpeHR1cmVzXFxlZGl0b3JcXGlubGluZUNvbXBsZXRpb25zXFx2aWV3cy5maXh0dXJlLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuXG4vLyBJbXBvcnQgdG8gcmVnaXN0ZXIgdGhlIGlubGluZSBjb21wbGV0aW9ucyBjb250cmlidXRpb25cbmltcG9ydCB7IGNvbnN0T2JzZXJ2YWJsZSwgSU9ic2VydmFibGVXaXRoQ2hhbmdlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vb2JzZXJ2YWJsZS5qcyc7XG5pbXBvcnQgeyBVUkkgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi91cmkuanMnO1xuaW1wb3J0IHsgQ29tcG9uZW50Rml4dHVyZUNvbnRleHQsIGNyZWF0ZUVkaXRvclNlcnZpY2VzLCBkZWZpbmVUaGVtZWRGaXh0dXJlR3JvdXAsIGRlZmluZUNvbXBvbmVudEZpeHR1cmUsIGNyZWF0ZVRleHRNb2RlbCB9IGZyb20gJy4uLy4uL2ZpeHR1cmVVdGlscy5qcyc7XG5pbXBvcnQgeyBFZGl0b3JFeHRlbnNpb25zUmVnaXN0cnkgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9lZGl0b3IvYnJvd3Nlci9lZGl0b3JFeHRlbnNpb25zLmpzJztcbmltcG9ydCB7IElDb2RlRWRpdG9yV2lkZ2V0T3B0aW9ucywgQ29kZUVkaXRvcldpZGdldCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2VkaXRvci9icm93c2VyL3dpZGdldC9jb2RlRWRpdG9yL2NvZGVFZGl0b3JXaWRnZXQuanMnO1xuaW1wb3J0IHsgSUVkaXRvck9wdGlvbnMgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL2NvbmZpZy9lZGl0b3JPcHRpb25zLmpzJztcbmltcG9ydCB7IFJhbmdlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9jb3JlL3JhbmdlLmpzJztcbmltcG9ydCB7IElubGluZUNvbXBsZXRpb25zQ29udHJvbGxlciB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2VkaXRvci9jb250cmliL2lubGluZUNvbXBsZXRpb25zL2Jyb3dzZXIvY29udHJvbGxlci9pbmxpbmVDb21wbGV0aW9uc0NvbnRyb2xsZXIuanMnO1xuaW1wb3J0ICcuLi8uLi8uLi8uLi8uLi8uLi9lZGl0b3IvY29udHJpYi9pbmxpbmVDb21wbGV0aW9ucy9icm93c2VyL2lubGluZUNvbXBsZXRpb25zLmNvbnRyaWJ1dGlvbi5qcyc7XG5pbXBvcnQgeyBJbmxpbmVDb21wbGV0aW9uc1NvdXJjZSwgSW5saW5lQ29tcGxldGlvbnNTdGF0ZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2VkaXRvci9jb250cmliL2lubGluZUNvbXBsZXRpb25zL2Jyb3dzZXIvbW9kZWwvaW5saW5lQ29tcGxldGlvbnNTb3VyY2UuanMnO1xuaW1wb3J0IHsgSW5saW5lRWRpdEl0ZW0gfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9lZGl0b3IvY29udHJpYi9pbmxpbmVDb21wbGV0aW9ucy9icm93c2VyL21vZGVsL2lubGluZVN1Z2dlc3Rpb25JdGVtLmpzJztcbmltcG9ydCB7IFRleHRNb2RlbFZhbHVlUmVmZXJlbmNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vZWRpdG9yL2NvbnRyaWIvaW5saW5lQ29tcGxldGlvbnMvYnJvd3Nlci9tb2RlbC90ZXh0TW9kZWxWYWx1ZVJlZmVyZW5jZS5qcyc7XG5cblxuLy8gPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxuLy8gSW5saW5lIEVkaXQgRml4dHVyZVxuLy8gPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxuXG5pbnRlcmZhY2UgSW5saW5lRWRpdE9wdGlvbnMgZXh0ZW5kcyBDb21wb25lbnRGaXh0dXJlQ29udGV4dCB7XG5cdGNvZGU6IHN0cmluZztcblx0Y3Vyc29yTGluZTogbnVtYmVyO1xuXHRyYW5nZTogeyBzdGFydExpbmVOdW1iZXI6IG51bWJlcjsgc3RhcnRDb2x1bW46IG51bWJlcjsgZW5kTGluZU51bWJlcjogbnVtYmVyOyBlbmRDb2x1bW46IG51bWJlciB9O1xuXHRuZXdUZXh0OiBzdHJpbmc7XG5cdHdpZHRoPzogc3RyaW5nO1xuXHRoZWlnaHQ/OiBzdHJpbmc7XG5cdGVkaXRvck9wdGlvbnM/OiBJRWRpdG9yT3B0aW9ucztcbn1cblxuZnVuY3Rpb24gcmVuZGVySW5saW5lRWRpdChvcHRpb25zOiBJbmxpbmVFZGl0T3B0aW9ucyk6IHZvaWQge1xuXHRjb25zdCB7IGNvbnRhaW5lciwgZGlzcG9zYWJsZVN0b3JlLCB0aGVtZSB9ID0gb3B0aW9ucztcblx0Y29udGFpbmVyLnN0eWxlLndpZHRoID0gb3B0aW9ucy53aWR0aCA/PyAnNTAwcHgnO1xuXHRjb250YWluZXIuc3R5bGUuaGVpZ2h0ID0gb3B0aW9ucy5oZWlnaHQgPz8gJzE3MHB4Jztcblx0Y29udGFpbmVyLnN0eWxlLmJvcmRlciA9ICcxcHggc29saWQgdmFyKC0tdnNjb2RlLWVkaXRvcldpZGdldC1ib3JkZXIpJztcblxuXHRjb25zdCBpbnN0YW50aWF0aW9uU2VydmljZSA9IGNyZWF0ZUVkaXRvclNlcnZpY2VzKGRpc3Bvc2FibGVTdG9yZSwgeyBjb2xvclRoZW1lOiB0aGVtZSB9KTtcblxuXHRjb25zdCB0ZXh0TW9kZWwgPSBkaXNwb3NhYmxlU3RvcmUuYWRkKGNyZWF0ZVRleHRNb2RlbChcblx0XHRpbnN0YW50aWF0aW9uU2VydmljZSxcblx0XHRvcHRpb25zLmNvZGUsXG5cdFx0VVJJLnBhcnNlKCdpbm1lbW9yeTovL2lubGluZS1lZGl0LnRzJyksXG5cdFx0J3R5cGVzY3JpcHQnXG5cdCkpO1xuXG5cdC8vIE1vY2sgdGhlIElubGluZUNvbXBsZXRpb25zU291cmNlIHRvIHByb3ZpZGUgb3VyIHRlc3QgY29tcGxldGlvblxuXHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViSW5zdGFuY2UoSW5saW5lQ29tcGxldGlvbnNTb3VyY2UsIHtcblx0XHRjYW5jZWxVcGRhdGU6ICgpID0+IHsgfSxcblx0XHRjbGVhcjogKCkgPT4geyB9LFxuXHRcdGNsZWFyT3BlcmF0aW9uT25UZXh0TW9kZWxDaGFuZ2U6IGNvbnN0T2JzZXJ2YWJsZSh1bmRlZmluZWQpIGFzIElPYnNlcnZhYmxlV2l0aENoYW5nZTx1bmRlZmluZWQsIHZvaWQ+LFxuXHRcdGNsZWFyU3VnZ2VzdFdpZGdldElubGluZUNvbXBsZXRpb25zOiAoKSA9PiB7IH0sXG5cdFx0ZGlzcG9zZTogKCkgPT4geyB9LFxuXHRcdGZldGNoOiBhc3luYyAoKSA9PiB0cnVlLFxuXHRcdGlubGluZUNvbXBsZXRpb25zOiBjb25zdE9ic2VydmFibGUoZGlzcG9zYWJsZVN0b3JlLmFkZChuZXcgSW5saW5lQ29tcGxldGlvbnNTdGF0ZShbXG5cdFx0XHRJbmxpbmVFZGl0SXRlbS5jcmVhdGVGb3JUZXN0KFxuXHRcdFx0XHRUZXh0TW9kZWxWYWx1ZVJlZmVyZW5jZS5zbmFwc2hvdCh0ZXh0TW9kZWwpLFxuXHRcdFx0XHRuZXcgUmFuZ2UoXG5cdFx0XHRcdFx0b3B0aW9ucy5yYW5nZS5zdGFydExpbmVOdW1iZXIsXG5cdFx0XHRcdFx0b3B0aW9ucy5yYW5nZS5zdGFydENvbHVtbixcblx0XHRcdFx0XHRvcHRpb25zLnJhbmdlLmVuZExpbmVOdW1iZXIsXG5cdFx0XHRcdFx0b3B0aW9ucy5yYW5nZS5lbmRDb2x1bW5cblx0XHRcdFx0KSxcblx0XHRcdFx0b3B0aW9ucy5uZXdUZXh0XG5cdFx0XHQpXG5cdFx0XSwgdW5kZWZpbmVkKSkpLFxuXHRcdGxvYWRpbmc6IGNvbnN0T2JzZXJ2YWJsZShmYWxzZSksXG5cdFx0c2VlZElubGluZUNvbXBsZXRpb25zV2l0aFN1Z2dlc3RXaWRnZXQ6ICgpID0+IHsgfSxcblx0XHRzZWVkV2l0aENvbXBsZXRpb246ICgpID0+IHsgfSxcblx0XHRzdWdnZXN0V2lkZ2V0SW5saW5lQ29tcGxldGlvbnM6IGNvbnN0T2JzZXJ2YWJsZShkaXNwb3NhYmxlU3RvcmUuYWRkKElubGluZUNvbXBsZXRpb25zU3RhdGUuY3JlYXRlRW1wdHkoKSkpLFxuXHR9KTtcblxuXHRjb25zdCBlZGl0b3JXaWRnZXRPcHRpb25zOiBJQ29kZUVkaXRvcldpZGdldE9wdGlvbnMgPSB7XG5cdFx0Y29udHJpYnV0aW9uczogRWRpdG9yRXh0ZW5zaW9uc1JlZ2lzdHJ5LmdldEVkaXRvckNvbnRyaWJ1dGlvbnMoKVxuXHR9O1xuXG5cdGNvbnN0IGVkaXRvciA9IGRpc3Bvc2FibGVTdG9yZS5hZGQoaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoXG5cdFx0Q29kZUVkaXRvcldpZGdldCxcblx0XHRjb250YWluZXIsXG5cdFx0e1xuXHRcdFx0YXV0b21hdGljTGF5b3V0OiB0cnVlLFxuXHRcdFx0bWluaW1hcDogeyBlbmFibGVkOiBmYWxzZSB9LFxuXHRcdFx0bGluZU51bWJlcnM6ICdvbicsXG5cdFx0XHRzY3JvbGxCZXlvbmRMYXN0TGluZTogZmFsc2UsXG5cdFx0XHRmb250U2l6ZTogMTQsXG5cdFx0XHRjdXJzb3JCbGlua2luZzogJ3NvbGlkJyxcblx0XHRcdC4uLm9wdGlvbnMuZWRpdG9yT3B0aW9ucyxcblx0XHR9LFxuXHRcdGVkaXRvcldpZGdldE9wdGlvbnNcblx0KSk7XG5cblx0ZWRpdG9yLnNldE1vZGVsKHRleHRNb2RlbCk7XG5cdGVkaXRvci5zZXRQb3NpdGlvbih7IGxpbmVOdW1iZXI6IG9wdGlvbnMuY3Vyc29yTGluZSwgY29sdW1uOiAxIH0pO1xuXHRlZGl0b3IuZm9jdXMoKTtcblxuXHQvLyBUcmlnZ2VyIGlubGluZSBjb21wbGV0aW9uc1xuXHRjb25zdCBjb250cm9sbGVyID0gSW5saW5lQ29tcGxldGlvbnNDb250cm9sbGVyLmdldChlZGl0b3IpO1xuXHRjb250cm9sbGVyPy5tb2RlbD8uZ2V0KCk7XG59XG5cblxuLy8gPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxuLy8gRml4dHVyZXNcbi8vID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT1cblxuZXhwb3J0IGRlZmF1bHQgZGVmaW5lVGhlbWVkRml4dHVyZUdyb3VwKHsgcGF0aDogJ2VkaXRvci9pbmxpbmVDb21wbGV0aW9ucy8nIH0sIHtcblx0Ly8gU2lkZS1ieS1zaWRlIHZpZXc6IE5hcnJvdyBlZGl0b3Igd2l0aCBtdWx0aS1saW5lIHJlcGxhY2VtZW50XG5cdFNpZGVCeVNpZGVWaWV3U21hbGw6IGRlZmluZUNvbXBvbmVudEZpeHR1cmUoe1xuXHRcdGxhYmVsczogeyBraW5kOiAnc2NyZWVuc2hvdCcgfSxcblx0XHRyZW5kZXI6IChjb250ZXh0KSA9PiByZW5kZXJJbmxpbmVFZGl0KHtcblx0XHRcdC4uLmNvbnRleHQsXG5cdFx0XHRjb2RlOiBgZnVuY3Rpb24gY2FsY3VsYXRlKGEsIGIpIHtcblx0Y29uc3Qgc3VtID0gYSArIGI7XG5cdHJldHVybiBzdW07XG59YCxcblx0XHRcdGN1cnNvckxpbmU6IDIsXG5cdFx0XHRyYW5nZTogeyBzdGFydExpbmVOdW1iZXI6IDIsIHN0YXJ0Q29sdW1uOiAxLCBlbmRMaW5lTnVtYmVyOiAzLCBlbmRDb2x1bW46IDEwMCB9LFxuXHRcdFx0bmV3VGV4dDogJ1xcdGNvbnN0IHJlc3VsdCA9IGEgKiBiICsgYSArIGI7XFxuXFx0Y29uc29sZS5sb2cocmVzdWx0KTtcXG5cXHRyZXR1cm4gcmVzdWx0OycsXG5cdFx0fSksXG5cdH0pLFxuXG5cdC8vIFNpZGUtYnktc2lkZSB2aWV3OiBXaWRlIGVkaXRvciB3aXRoIG11bHRpLWxpbmUgcmVwbGFjZW1lbnRcblx0U2lkZUJ5U2lkZVZpZXdXaWRlOiBkZWZpbmVDb21wb25lbnRGaXh0dXJlKHtcblx0XHRsYWJlbHM6IHsga2luZDogJ3NjcmVlbnNob3QnIH0sXG5cdFx0cmVuZGVyOiAoY29udGV4dCkgPT4gcmVuZGVySW5saW5lRWRpdCh7XG5cdFx0XHQuLi5jb250ZXh0LFxuXHRcdFx0Y29kZTogYGZ1bmN0aW9uIGNhbGN1bGF0ZShhLCBiKSB7XG5cdGNvbnN0IHN1bSA9IGEgKyBiO1xuXHRyZXR1cm4gc3VtO1xufWAsXG5cdFx0XHRjdXJzb3JMaW5lOiAyLFxuXHRcdFx0cmFuZ2U6IHsgc3RhcnRMaW5lTnVtYmVyOiAyLCBzdGFydENvbHVtbjogMSwgZW5kTGluZU51bWJlcjogMywgZW5kQ29sdW1uOiAxMDAgfSxcblx0XHRcdG5ld1RleHQ6ICdcXHRjb25zdCByZXN1bHQgPSBhICogYiArIGEgKyBiO1xcblxcdGNvbnNvbGUubG9nKHJlc3VsdCk7XFxuXFx0cmV0dXJuIHJlc3VsdDsnLFxuXHRcdFx0d2lkdGg6ICc4MDBweCcsXG5cdFx0fSksXG5cdH0pLFxuXG5cdC8vIFdvcmQgcmVwbGFjZW1lbnQgdmlldzogU2luZ2xlIHdvcmQgY2hhbmdlXG5cdFdvcmRSZXBsYWNlbWVudFZpZXc6IGRlZmluZUNvbXBvbmVudEZpeHR1cmUoe1xuXHRcdGxhYmVsczogeyBraW5kOiAnc2NyZWVuc2hvdCcgfSxcblx0XHRyZW5kZXI6IChjb250ZXh0KSA9PiByZW5kZXJJbmxpbmVFZGl0KHtcblx0XHRcdC4uLmNvbnRleHQsXG5cdFx0XHRjb2RlOiBgY2xhc3MgQnVmZmVyRGF0YSB7XG5cdGFwcGVuZChkYXRhOiBudW1iZXJbXSkge1xuXHRcdHRoaXMuZGF0YS5wdXNoKGRhdGEpO1xuXHR9XG59YCxcblx0XHRcdGN1cnNvckxpbmU6IDIsXG5cdFx0XHRyYW5nZTogeyBzdGFydExpbmVOdW1iZXI6IDIsIHN0YXJ0Q29sdW1uOiAyLCBlbmRMaW5lTnVtYmVyOiAyLCBlbmRDb2x1bW46IDggfSxcblx0XHRcdG5ld1RleHQ6ICdwdXNoJyxcblx0XHRcdGhlaWdodDogJzIwMHB4Jyxcblx0XHR9KSxcblx0fSksXG5cblx0Ly8gSW5zZXJ0aW9uIHZpZXc6IEluc2VydCBuZXcgY29udGVudFxuXHRJbnNlcnRpb25WaWV3OiBkZWZpbmVDb21wb25lbnRGaXh0dXJlKHtcblx0XHRsYWJlbHM6IHsga2luZDogJ3NjcmVlbnNob3QnLCBmbGFreTogdHJ1ZSB9LFxuXHRcdHJlbmRlcjogKGNvbnRleHQpID0+IHJlbmRlcklubGluZUVkaXQoe1xuXHRcdFx0Li4uY29udGV4dCxcblx0XHRcdGNvZGU6IGBjbGFzcyBCdWZmZXJEYXRhIHtcblx0YXBwZW5kKGRhdGE6IG51bWJlcltdKSB7fSAvLyBhcHBlbmRzIGRhdGFcbn1gLFxuXHRcdFx0Y3Vyc29yTGluZTogMixcblx0XHRcdHJhbmdlOiB7IHN0YXJ0TGluZU51bWJlcjogMiwgc3RhcnRDb2x1bW46IDI2LCBlbmRMaW5lTnVtYmVyOiAyLCBlbmRDb2x1bW46IDI2IH0sXG5cdFx0XHRuZXdUZXh0OiBgXG5cdFx0Y29uc29sZS5sb2coZGF0YSk7XG5cdGAsXG5cdFx0XHRoZWlnaHQ6ICcyMDBweCcsXG5cdFx0XHRlZGl0b3JPcHRpb25zOiB7XG5cdFx0XHRcdGlubGluZVN1Z2dlc3Q6IHtcblx0XHRcdFx0XHRlZGl0czogeyBhbGxvd0NvZGVTaGlmdGluZzogJ2Fsd2F5cycgfVxuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fSksXG5cdH0pLFxuXG5cdC8vIERlbGV0aW9uIHZpZXc6IFJlbW92aW5nIGNvZGVcblx0RGVsZXRpb25WaWV3OiBkZWZpbmVDb21wb25lbnRGaXh0dXJlKHtcblx0XHRsYWJlbHM6IHsga2luZDogJ3NjcmVlbnNob3QnIH0sXG5cdFx0cmVuZGVyOiAoY29udGV4dCkgPT4gcmVuZGVySW5saW5lRWRpdCh7XG5cdFx0XHQuLi5jb250ZXh0LFxuXHRcdFx0Y29kZTogYGZ1bmN0aW9uIHByb2Nlc3MoZGF0YTogc3RyaW5nW10pIHtcblx0Y29uc29sZS5sb2coXCJwcm9jZXNzaW5nOlwiLCBkYXRhKTtcblx0Y29uc3QgcmVzdWx0ID0gZGF0YS5tYXAoZCA9PiBkLnRyaW0oKSk7XG5cdHJldHVybiByZXN1bHQ7XG59YCxcblx0XHRcdGN1cnNvckxpbmU6IDIsXG5cdFx0XHRyYW5nZTogeyBzdGFydExpbmVOdW1iZXI6IDIsIHN0YXJ0Q29sdW1uOiAxLCBlbmRMaW5lTnVtYmVyOiAyLCBlbmRDb2x1bW46IDEwMCB9LFxuXHRcdFx0bmV3VGV4dDogJycsXG5cdFx0XHRoZWlnaHQ6ICcyMDBweCcsXG5cdFx0fSksXG5cdH0pLFxuXG5cdC8vIExpbmUgcmVwbGFjZW1lbnQgdmlldzogU2luZ2xlLWxpbmUgd2l0aCBtdWx0aXBsZSBjaGFuZ2VzXG5cdExpbmVSZXBsYWNlbWVudFZpZXc6IGRlZmluZUNvbXBvbmVudEZpeHR1cmUoe1xuXHRcdGxhYmVsczogeyBraW5kOiAnc2NyZWVuc2hvdCcgfSxcblx0XHRyZW5kZXI6IChjb250ZXh0KSA9PiByZW5kZXJJbmxpbmVFZGl0KHtcblx0XHRcdC4uLmNvbnRleHQsXG5cdFx0XHRjb2RlOiBgZnVuY3Rpb24gY2FsY3VsYXRlKHdpZHRoOiBudW1iZXIsIGhlaWdodDogbnVtYmVyKTogbnVtYmVyIHtcblx0Y29uc3QgYXJlYSA9IHdpZHRoICogaGVpZ2h0O1xuXHRyZXR1cm4gYXJlYTtcbn1gLFxuXHRcdFx0Y3Vyc29yTGluZTogMixcblx0XHRcdHJhbmdlOiB7IHN0YXJ0TGluZU51bWJlcjogMiwgc3RhcnRDb2x1bW46IDEsIGVuZExpbmVOdW1iZXI6IDIsIGVuZENvbHVtbjogMTAwIH0sXG5cdFx0XHRuZXdUZXh0OiAnXFx0Y29uc3Qgdm9sdW1lID0gd2lkdGggKiBoZWlnaHQgKiBkZXB0aDsnLFxuXHRcdFx0aGVpZ2h0OiAnMjAwcHgnLFxuXHRcdH0pLFxuXHR9KSxcbn0pO1xuIl0sCiAgIm1hcHBpbmdzIjogIkFBT0EsU0FBUyx1QkFBOEM7QUFDdkQsU0FBUyxXQUFXO0FBQ3BCLFNBQWtDLHNCQUFzQiwwQkFBMEIsd0JBQXdCLHVCQUF1QjtBQUNqSSxTQUFTLGdDQUFnQztBQUN6QyxTQUFtQyx3QkFBd0I7QUFFM0QsU0FBUyxhQUFhO0FBQ3RCLFNBQVMsbUNBQW1DO0FBQzVDLE9BQU87QUFDUCxTQUFTLHlCQUF5Qiw4QkFBOEI7QUFDaEUsU0FBUyxzQkFBc0I7QUFDL0IsU0FBUywrQkFBK0I7QUFpQnhDLFNBQVMsaUJBQWlCLFNBQWtDO0FBQzNELFFBQU0sRUFBRSxXQUFXLGlCQUFpQixNQUFNLElBQUk7QUFDOUMsWUFBVSxNQUFNLFFBQVEsUUFBUSxTQUFTO0FBQ3pDLFlBQVUsTUFBTSxTQUFTLFFBQVEsVUFBVTtBQUMzQyxZQUFVLE1BQU0sU0FBUztBQUV6QixRQUFNLHVCQUF1QixxQkFBcUIsaUJBQWlCLEVBQUUsWUFBWSxNQUFNLENBQUM7QUFFeEYsUUFBTSxZQUFZLGdCQUFnQixJQUFJO0FBQUEsSUFDckM7QUFBQSxJQUNBLFFBQVE7QUFBQSxJQUNSLElBQUksTUFBTSwyQkFBMkI7QUFBQSxJQUNyQztBQUFBLEVBQ0QsQ0FBQztBQUdELHVCQUFxQixhQUFhLHlCQUF5QjtBQUFBLElBQzFELGNBQWMsTUFBTTtBQUFBLElBQUU7QUFBQSxJQUN0QixPQUFPLE1BQU07QUFB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
