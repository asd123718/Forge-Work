import assert from "assert";
import { Event } from "../../../../../base/common/event.js";
import { toDisposable } from "../../../../../base/common/lifecycle.js";
import { mock } from "../../../../../base/test/common/mock.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../../base/test/common/utils.js";
import { IMenuService } from "../../../../../platform/actions/common/actions.js";
import { ServiceCollection } from "../../../../../platform/instantiation/common/serviceCollection.js";
import { IMarkdownRendererService } from "../../../../../platform/markdown/browser/markdownRenderer.js";
import { InMemoryStorageService, IStorageService } from "../../../../../platform/storage/common/storage.js";
import { CodeEditorWidget } from "../../../../browser/widget/codeEditor/codeEditorWidget.js";
import { EditorOption } from "../../../../common/config/editorOptions.js";
import { CompletionItemKind } from "../../../../common/languages.js";
import { createCodeEditorServices } from "../../../../test/browser/testCodeEditor.js";
import { createTextModel } from "../../../../test/common/testTextModel.js";
import { CompletionModel } from "../../browser/completionModel.js";
import { CompletionItem } from "../../browser/suggest.js";
import { SuggestWidget } from "../../browser/suggestWidget.js";
import { WordDistance } from "../../browser/wordDistance.js";
suite("SuggestWidget", () => {
  const store = ensureNoDisposablesAreLeakedInTestSuite();
  test("measures suggestions in an auxiliary window", () => {
    const iframe = document.createElement("iframe");
    document.body.appendChild(iframe);
    store.add(toDisposable(() => iframe.remove()));
    const auxiliaryDocument = iframe.contentDocument;
    const container = document.createElement("div");
    container.style.width = "500px";
    container.style.height = "300px";
    auxiliaryDocument.body.appendChild(container);
    const createElement = auxiliaryDocument.createElement;
    auxiliaryDocument.createElement = () => {
      throw new Error("Not allowed to create elements in child window JavaScript context.");
    };
    store.add(toDisposable(() => auxiliaryDocument.createElement = createElement));
    const services = new ServiceCollection(
      [IStorageService, store.add(new InMemoryStorageService())],
      [IMarkdownRendererService, new class extends mock() {
      }()],
      [IMenuService, new class extends mock() {
        createMenu() {
          return new class extends mock() {
            constructor() {
              super(...arguments);
              this.onDidChange = Event.None;
            }
            dispose() {
            }
          }();
        }
      }()]
    );
    const instantiationService = createCodeEditorServices(store, services);
    const editor = store.add(instantiationService.createInstance(
      CodeEditorWidget,
      container,
      { suggest: { fitWidthToDetails: true } },
      { contributions: [] }
    ));
    const textModel = store.add(createTextModel("a"));
    editor.setModel(textModel);
    editor.layout({ width: 500, height: 300 });
    const position = { lineNumber: 1, column: 2 };
    const completion = {
      label: { label: "agent", detail: " with a detailed description" },
      insertText: "agent",
      kind: CompletionItemKind.Function,
      range: { startLineNumber: 1, startColumn: 1, endLineNumber: 1, endColumn: 2 }
    };
    const completionList = { suggestions: [completion] };
    const provider = {
      _debugDisplayName: "test",
      provideCompletionItems: () => completionList
    };
    const completionModel = new CompletionModel(
      [new CompletionItem(position, completion, completionList, provider)],
      position.column,
      { leadingLineContent: "a", characterCountDelta: 0 },
      WordDistance.None,
      editor.getOption(EditorOption.suggest),
      editor.getOption(EditorOption.snippetSuggestions)
    );
    const widget = store.add(instantiationService.createInstance(SuggestWidget, editor));
    widget.showSuggestions(completionModel, 0, false, false, false);
    assert.deepStrictEqual({
      ownerDocument: widget.element.domNode.ownerDocument === auxiliaryDocument,
      mainRealmElement: widget.element.domNode instanceof HTMLElement,
      attached: auxiliaryDocument.body.contains(widget.element.domNode)
    }, {
      ownerDocument: true,
      mainRealmElement: true,
      attached: true
    });
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxlZGl0b3JcXGNvbnRyaWJcXHN1Z2dlc3RcXHRlc3RcXGJyb3dzZXJcXHN1Z2dlc3RXaWRnZXQudGVzdC50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCBhc3NlcnQgZnJvbSAnYXNzZXJ0JztcbmltcG9ydCB7IEV2ZW50IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vZXZlbnQuanMnO1xuaW1wb3J0IHsgdG9EaXNwb3NhYmxlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IG1vY2sgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL3Rlc3QvY29tbW9uL21vY2suanMnO1xuaW1wb3J0IHsgZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS90ZXN0L2NvbW1vbi91dGlscy5qcyc7XG5pbXBvcnQgeyBJTWVudSwgSU1lbnVTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vYWN0aW9ucy9jb21tb24vYWN0aW9ucy5qcyc7XG5pbXBvcnQgeyBTZXJ2aWNlQ29sbGVjdGlvbiB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2luc3RhbnRpYXRpb24vY29tbW9uL3NlcnZpY2VDb2xsZWN0aW9uLmpzJztcbmltcG9ydCB7IElNYXJrZG93blJlbmRlcmVyU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL21hcmtkb3duL2Jyb3dzZXIvbWFya2Rvd25SZW5kZXJlci5qcyc7XG5pbXBvcnQgeyBJbk1lbW9yeVN0b3JhZ2VTZXJ2aWNlLCBJU3RvcmFnZVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9zdG9yYWdlL2NvbW1vbi9zdG9yYWdlLmpzJztcbmltcG9ydCB7IENvZGVFZGl0b3JXaWRnZXQgfSBmcm9tICcuLi8uLi8uLi8uLi9icm93c2VyL3dpZGdldC9jb2RlRWRpdG9yL2NvZGVFZGl0b3JXaWRnZXQuanMnO1xuaW1wb3J0IHsgRWRpdG9yT3B0aW9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vY29tbW9uL2NvbmZpZy9lZGl0b3JPcHRpb25zLmpzJztcbmltcG9ydCB7IENvbXBsZXRpb25JdGVtS2luZCwgQ29tcGxldGlvbkl0ZW1Qcm92aWRlciB9IGZyb20gJy4uLy4uLy4uLy4uL2NvbW1vbi9sYW5ndWFnZXMuanMnO1xuaW1wb3J0IHsgY3JlYXRlQ29kZUVkaXRvclNlcnZpY2VzIH0gZnJvbSAnLi4vLi4vLi4vLi4vdGVzdC9icm93c2VyL3Rlc3RDb2RlRWRpdG9yLmpzJztcbmltcG9ydCB7IGNyZWF0ZVRleHRNb2RlbCB9IGZyb20gJy4uLy4uLy4uLy4uL3Rlc3QvY29tbW9uL3Rlc3RUZXh0TW9kZWwuanMnO1xuaW1wb3J0IHsgQ29tcGxldGlvbk1vZGVsIH0gZnJvbSAnLi4vLi4vYnJvd3Nlci9jb21wbGV0aW9uTW9kZWwuanMnO1xuaW1wb3J0IHsgQ29tcGxldGlvbkl0ZW0gfSBmcm9tICcuLi8uLi9icm93c2VyL3N1Z2dlc3QuanMnO1xuaW1wb3J0IHsgU3VnZ2VzdFdpZGdldCB9IGZyb20gJy4uLy4uL2Jyb3dzZXIvc3VnZ2VzdFdpZGdldC5qcyc7XG5pbXBvcnQgeyBXb3JkRGlzdGFuY2UgfSBmcm9tICcuLi8uLi9icm93c2VyL3dvcmREaXN0YW5jZS5qcyc7XG5cbnN1aXRlKCdTdWdnZXN0V2lkZ2V0JywgKCkgPT4ge1xuXHRjb25zdCBzdG9yZSA9IGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSgpO1xuXG5cdHRlc3QoJ21lYXN1cmVzIHN1Z2dlc3Rpb25zIGluIGFuIGF1eGlsaWFyeSB3aW5kb3cnLCAoKSA9PiB7XG5cdFx0Y29uc3QgaWZyYW1lID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnaWZyYW1lJyk7XG5cdFx0ZG9jdW1lbnQuYm9keS5hcHBlbmRDaGlsZChpZnJhbWUpO1xuXHRcdHN0b3JlLmFkZCh0b0Rpc3Bvc2FibGUoKCkgPT4gaWZyYW1lLnJlbW92ZSgpKSk7XG5cblx0XHRjb25zdCBhdXhpbGlhcnlEb2N1bWVudCA9IGlmcmFtZS5jb250ZW50RG9jdW1lbnQhO1xuXHRcdGNvbnN0IGNvbnRhaW5lciA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2RpdicpO1xuXHRcdGNvbnRhaW5lci5zdHlsZS53aWR0aCA9ICc1MDBweCc7XG5cdFx0Y29udGFpbmVyLnN0eWxlLmhlaWdodCA9ICczMDBweCc7XG5cdFx0YXV4aWxpYXJ5RG9jdW1lbnQuYm9keS5hcHBlbmRDaGlsZChjb250YWluZXIpO1xuXG5cdFx0Y29uc3QgY3JlYXRlRWxlbWVudCA9IGF1eGlsaWFyeURvY3VtZW50LmNyZWF0ZUVsZW1lbnQ7XG5cdFx0YXV4aWxpYXJ5RG9jdW1lbnQuY3JlYXRlRWxlbWVudCA9ICgpID0+IHtcblx0XHRcdHRocm93IG5ldyBFcnJvcignTm90IGFsbG93ZWQgdG8gY3JlYXRlIGVsZW1lbnRzIGluIGNoaWxkIHdpbmRvdyBKYXZhU2NyaXB0IGNvbnRleHQuJyk7XG5cdFx0fTtcblx0XHRzdG9yZS5hZGQodG9EaXNwb3NhYmxlKCgpID0+IGF1eGlsaWFyeURvY3VtZW50LmNyZWF0ZUVsZW1lbnQgPSBjcmVhdGVFbGVtZW50KSk7XG5cblx0XHRjb25zdCBzZXJ2aWNlcyA9IG5ldyBTZXJ2aWNlQ29sbGVjdGlvbihcblx0XHRcdFtJU3RvcmFnZVNlcnZpY2UsIHN0b3JlLmFkZChuZXcgSW5NZW1vcnlTdG9yYWdlU2VydmljZSgpKV0sXG5cdFx0XHRbSU1hcmtkb3duUmVuZGVyZXJTZXJ2aWNlLCBuZXcgY2xhc3MgZXh0ZW5kcyBtb2NrPElNYXJrZG93blJlbmRlcmVyU2VydmljZT4oKSB7IH1dLFxuXHRcdFx0W0lNZW51U2VydmljZSwgbmV3IGNsYXNzIGV4dGVuZHMgbW9jazxJTWVudVNlcnZpY2U+KCkge1xuXHRcdFx0XHRvdmVycmlkZSBjcmVhdGVNZW51KCk6IElNZW51IHtcblx0XHRcdFx0XHRyZXR1cm4gbmV3IGNsYXNzIGV4dGVuZHMgbW9jazxJTWVudT4oKSB7XG5cdFx0XHRcdFx0XHRvdmVycmlkZSByZWFkb25seSBvbkRpZENoYW5nZSA9IEV2ZW50Lk5vbmU7XG5cdFx0XHRcdFx0XHRvdmVycmlkZSBkaXNwb3NlKCk6IHZvaWQgeyB9XG5cdFx0XHRcdFx0fTtcblx0XHRcdFx0fVxuXHRcdFx0fV0sXG5cdFx0KTtcblx0XHRjb25zdCBpbnN0YW50aWF0aW9uU2VydmljZSA9IGNyZWF0ZUNvZGVFZGl0b3JTZXJ2aWNlcyhzdG9yZSwgc2VydmljZXMpO1xuXHRcdGNvbnN0IGVkaXRvciA9IHN0b3JlLmFkZChpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShcblx0XHRcdENvZGVFZGl0b3JXaWRnZXQsXG5cdFx0XHRjb250YWluZXIsXG5cdFx0XHR7IHN1Z2dlc3Q6IHsgZml0V2lkdGhUb0RldGFpbHM6IHRydWUgfSB9LFxuXHRcdFx0eyBjb250cmlidXRpb25zOiBbXSB9LFxuXHRcdCkpO1xuXHRcdGNvbnN0IHRleHRNb2RlbCA9IHN0b3JlLmFkZChjcmVhdGVUZXh0TW9kZWwoJ2EnKSk7XG5cdFx0ZWRpdG9yLnNldE1vZGVsKHRleHRNb2RlbCk7XG5cdFx0ZWRpdG9yLmxheW91dCh7IHdpZHRoOiA1MDAsIGhlaWdodDogMzAwIH0pO1xuXG5cdFx0Y29uc3QgcG9zaXRpb24gPSB7IGxpbmVOdW1iZXI6IDEsIGNvbHVtbjogMiB9O1xuXHRcdGNvbnN0IGNvbXBsZXRpb24gPSB7XG5cdFx0XHRsYWJlbDogeyBsYWJlbDogJ2FnZW50JywgZGV0YWlsOiAnIHdpdGggYSBkZXRhaWxlZCBkZXNjcmlwdGlvbicgfSxcblx0XHRcdGluc2VydFRleHQ6ICdhZ2VudCcsXG5cdFx0XHRraW5kOiBDb21wbGV0aW9uSXRlbUtpbmQuRnVuY3Rpb24sXG5cdFx0XHRyYW5nZTogeyBzdGFydExpbmVOdW1iZXI6IDEsIHN0YXJ0Q29sdW1uOiAxLCBlbmRMaW5lTnVtYmVyOiAxLCBlbmRDb2x1bW46IDIgfSxcblx0XHR9O1xuXHRcdGNvbnN0IGNvbXBsZXRpb25MaXN0ID0geyBzdWdnZXN0aW9uczogW2NvbXBsZXRpb25dIH07XG5cdFx0Y29uc3QgcHJvdmlkZXI6IENvbXBsZXRpb25JdGVtUHJvdmlkZXIgPSB7XG5cdFx0XHRfZGVidWdEaXNwbGF5TmFtZTogJ3Rlc3QnLFxuXHRcdFx0cHJvdmlkZUNvbXBsZXRpb25JdGVtczogKCkgPT4gY29tcGxldGlvbkxpc3QsXG5cdFx0fTtcblx0XHRjb25zdCBjb21wbGV0aW9uTW9kZWwgPSBuZXcgQ29tcGxldGlvbk1vZGVsKFxuXHRcdFx0W25ldyBDb21wbGV0aW9uSXRlbShwb3NpdGlvbiwgY29tcGxldGlvbiwgY29tcGxldGlvbkxpc3QsIHByb3ZpZGVyKV0sXG5cdFx0XHRwb3NpdGlvbi5jb2x1bW4sXG5cdFx0XHR7IGxlYWRpbmdMaW5lQ29udGVudDogJ2EnLCBjaGFyYWN0ZXJDb3VudERlbHRhOiAwIH0sXG5cdFx0XHRXb3JkRGlzdGFuY2UuTm9uZSxcblx0XHRcdGVkaXRvci5nZXRPcHRpb24oRWRpdG9yT3B0aW9uLnN1Z2dlc3QpLFxuXHRcdFx0ZWRpdG9yLmdldE9wdGlvbihFZGl0b3JPcHRpb24uc25pcHBldFN1Z2dlc3Rpb25zKSxcblx0XHQpO1xuXHRcdGNvbnN0IHdpZGdldCA9IHN0b3JlLmFkZChpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShTdWdnZXN0V2lkZ2V0LCBlZGl0b3IpKTtcblxuXHRcdHdpZGdldC5zaG93U3VnZ2VzdGlvbnMoY29tcGxldGlvbk1vZGVsLCAwLCBmYWxzZSwgZmFsc2UsIGZhbHNlKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0b3duZXJEb2N1bWVudDogd2lkZ2V0LmVsZW1lbnQuZG9tTm9kZS5vd25lckRvY3VtZW50ID09PSBhdXhpbGlhcnlEb2N1bWVudCxcblx0XHRcdG1haW5SZWFsbUVsZW1lbnQ6IHdpZGdldC5lbGVtZW50LmRvbU5vZGUgaW5zdGFuY2VvZiBIVE1MRWxlbWVudCxcblx0XHRcdGF0dGFjaGVkOiBhdXhpbGlhcnlEb2N1bWVudC5ib2R5LmNvbnRhaW5zKHdpZGdldC5lbGVtZW50LmRvbU5vZGUpLFxuXHRcdH0sIHtcblx0XHRcdG93bmVyRG9jdW1lbnQ6IHRydWUsXG5cdFx0XHRtYWluUmVhbG1FbGVtZW50OiB0cnVlLFxuXHRcdFx0YXR0YWNoZWQ6IHRydWUsXG5cdFx0fSk7XG5cdH0pO1xufSk7XG4iXSwKICAibWFwcGluZ3MiOiAiQUFLQSxPQUFPLFlBQVk7QUFDbkIsU0FBUyxhQUFhO0FBQ3RCLFNBQVMsb0JBQW9CO0FBQzdCLFNBQVMsWUFBWTtBQUNyQixTQUFTLCtDQUErQztBQUN4RCxTQUFnQixvQkFBb0I7QUFDcEMsU0FBUyx5QkFBeUI7QUFDbEMsU0FBUyxnQ0FBZ0M7QUFDekMsU0FBUyx3QkFBd0IsdUJBQXVCO0FBQ3hELFNBQVMsd0JBQXdCO0FBQ2pDLFNBQVMsb0JBQW9CO0FBQzdCLFNBQVMsMEJBQWtEO0FBQzNELFNBQVMsZ0NBQWdDO0FBQ3pDLFNBQVMsdUJBQXVCO0FBQ2hDLFNB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
