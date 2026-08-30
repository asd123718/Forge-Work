import { Emitter } from "../../../../../base/common/event.js";
import { URI } from "../../../../../base/common/uri.js";
import { mock } from "../../../../../base/test/common/mock.js";
import { createEditorServices, createTextModel, defineComponentFixture, defineThemedFixtureGroup, registerWorkbenchServices } from "../fixtureUtils.js";
import { CodeEditorWidget } from "../../../../../editor/browser/widget/codeEditor/codeEditorWidget.js";
import { ReferenceWidget } from "../../../../../editor/contrib/gotoSymbol/browser/peek/referencesWidget.js";
import { ReferencesModel } from "../../../../../editor/contrib/gotoSymbol/browser/referencesModel.js";
import * as peekView from "../../../../../editor/contrib/peekView/browser/peekView.js";
import { ITextModelService } from "../../../../../editor/common/services/resolverService.js";
import { IListService, ListService } from "../../../../../platform/list/browser/listService.js";
import "../../../../../editor/contrib/peekView/browser/media/peekViewWidget.css";
import "../../../../../editor/contrib/gotoSymbol/browser/peek/referencesWidget.css";
import "../../../../../base/browser/ui/codicons/codiconStyles.js";
const SAMPLE_CODE = `import { readFile, writeFile } from 'fs';

function processFile(path: string): Promise<string> {
	return new Promise((resolve, reject) => {
		readFile(path, 'utf8', (err, data) => {
			if (err) {
				reject(err);
				return;
			}
			resolve(data.toUpperCase());
		});
	});
}

async function main() {
	const result = await processFile('./input.txt');
	await writeFile('./output.txt', result);
	console.log('Done processing file');
}

main();
`;
function renderPeekReference({ container, disposableStore, theme }) {
  container.style.width = "700px";
  container.style.height = "400px";
  container.style.border = "1px solid var(--vscode-editorWidget-border)";
  const uri = URI.parse("inmemory://peek-fixture.ts");
  const fixtureTextModel = { value: void 0 };
  const instantiationService = createEditorServices(disposableStore, {
    colorTheme: theme,
    additionalServices: (reg) => {
      registerWorkbenchServices(reg);
      reg.define(IListService, ListService);
      reg.defineInstance(peekView.IPeekViewService, new class extends mock() {
        addExclusiveWidget(_editor, _widget) {
        }
      }());
      reg.defineInstance(ITextModelService, new class extends mock() {
        async createModelReference(resource) {
          const model2 = fixtureTextModel.value;
          if (model2 && resource.toString() === uri.toString()) {
            const onWillDispose = new Emitter();
            const textEditorModel = {
              textEditorModel: model2,
              onWillDispose: onWillDispose.event,
              isReadonly: () => false,
              isResolved: () => true,
              isDisposed: () => false,
              getLanguageId: () => model2.getLanguageId(),
              createSnapshot: () => model2.createSnapshot(),
              resolve: async () => {
              },
              dispose: () => onWillDispose.dispose()
            };
            return {
              object: textEditorModel,
              dispose: () => {
              }
            };
          }
          throw new Error(`No model for ${resource.toString()}`);
        }
        canHandleResource() {
          return false;
        }
        registerTextModelContentProvider() {
          return { dispose: () => {
          } };
        }
      }());
    }
  });
  const textModel = disposableStore.add(createTextModel(
    instantiationService,
    SAMPLE_CODE,
    uri,
    "typescript"
  ));
  fixtureTextModel.value = textModel;
  const editorWidgetOptions = {
    contributions: []
  };
  const editor = instantiationService.createInstance(
    CodeEditorWidget,
    container,
    {
      automaticLayout: true,
      minimap: { enabled: false },
      lineNumbers: "on",
      scrollBeyondLastLine: false,
      fontSize: 14,
      cursorBlinking: "solid"
    },
    editorWidgetOptions
  );
  editor.setModel(textModel);
  editor.focus();
  const layoutData = { ratio: 0.7, heightInLines: 10 };
  const referenceWidget = instantiationService.createInstance(
    ReferenceWidget,
    editor,
    true,
    layoutData
  );
  disposableStore.add(referenceWidget);
  disposableStore.add(editor);
  const range = { startLineNumber: 3, startColumn: 10, endLineNumber: 3, endColumn: 21 };
  referenceWidget.setTitle("processFile");
  referenceWidget.setMetaTitle("3 references");
  referenceWidget.show(range);
  const links = [
    { uri, range: { startLineNumber: 3, startColumn: 10, endLineNumber: 3, endColumn: 21 } },
    { uri, range: { startLineNumber: 16, startColumn: 26, endLineNumber: 16, endColumn: 37 } },
    { uri, range: { startLineNumber: 20, startColumn: 1, endLineNumber: 20, endColumn: 5 } }
  ];
  const model = new ReferencesModel(links, "processFile");
  disposableStore.add(model);
  referenceWidget.setModel(model);
}
var peekReference_fixture_default = defineThemedFixtureGroup({
  PeekReferences: defineComponentFixture({
    render: renderPeekReference
  })
});
export {
  peekReference_fixture_default as default
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXHRlc3RcXGJyb3dzZXJcXGNvbXBvbmVudEZpeHR1cmVzXFxlZGl0b3JcXHBlZWtSZWZlcmVuY2UuZml4dHVyZS50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB7IEVtaXR0ZXIgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9ldmVudC5qcyc7XG5pbXBvcnQgeyBJUmVmZXJlbmNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IFVSSSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3VyaS5qcyc7XG5pbXBvcnQgeyBtb2NrIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS90ZXN0L2NvbW1vbi9tb2NrLmpzJztcbmltcG9ydCB7IENvbXBvbmVudEZpeHR1cmVDb250ZXh0LCBjcmVhdGVFZGl0b3JTZXJ2aWNlcywgY3JlYXRlVGV4dE1vZGVsLCBkZWZpbmVDb21wb25lbnRGaXh0dXJlLCBkZWZpbmVUaGVtZWRGaXh0dXJlR3JvdXAsIHJlZ2lzdGVyV29ya2JlbmNoU2VydmljZXMgfSBmcm9tICcuLi9maXh0dXJlVXRpbHMuanMnO1xuaW1wb3J0IHsgQ29kZUVkaXRvcldpZGdldCwgSUNvZGVFZGl0b3JXaWRnZXRPcHRpb25zIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vZWRpdG9yL2Jyb3dzZXIvd2lkZ2V0L2NvZGVFZGl0b3IvY29kZUVkaXRvcldpZGdldC5qcyc7XG5pbXBvcnQgeyBMYXlvdXREYXRhLCBSZWZlcmVuY2VXaWRnZXQgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9lZGl0b3IvY29udHJpYi9nb3RvU3ltYm9sL2Jyb3dzZXIvcGVlay9yZWZlcmVuY2VzV2lkZ2V0LmpzJztcbmltcG9ydCB7IFJlZmVyZW5jZXNNb2RlbCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2VkaXRvci9jb250cmliL2dvdG9TeW1ib2wvYnJvd3Nlci9yZWZlcmVuY2VzTW9kZWwuanMnO1xuaW1wb3J0ICogYXMgcGVla1ZpZXcgZnJvbSAnLi4vLi4vLi4vLi4vLi4vZWRpdG9yL2NvbnRyaWIvcGVla1ZpZXcvYnJvd3Nlci9wZWVrVmlldy5qcyc7XG5pbXBvcnQgeyBJUmVzb2x2ZWRUZXh0RWRpdG9yTW9kZWwsIElUZXh0TW9kZWxTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9zZXJ2aWNlcy9yZXNvbHZlclNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSUxpc3RTZXJ2aWNlLCBMaXN0U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2xpc3QvYnJvd3Nlci9saXN0U2VydmljZS5qcyc7XG5pbXBvcnQgeyBJQ29kZUVkaXRvciB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2VkaXRvci9icm93c2VyL2VkaXRvckJyb3dzZXIuanMnO1xuaW1wb3J0IHsgSVRleHRNb2RlbCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vbW9kZWwuanMnO1xuXG5pbXBvcnQgJy4uLy4uLy4uLy4uLy4uL2VkaXRvci9jb250cmliL3BlZWtWaWV3L2Jyb3dzZXIvbWVkaWEvcGVla1ZpZXdXaWRnZXQuY3NzJztcbmltcG9ydCAnLi4vLi4vLi4vLi4vLi4vZWRpdG9yL2NvbnRyaWIvZ290b1N5bWJvbC9icm93c2VyL3BlZWsvcmVmZXJlbmNlc1dpZGdldC5jc3MnO1xuaW1wb3J0ICcuLi8uLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvdWkvY29kaWNvbnMvY29kaWNvblN0eWxlcy5qcyc7XG5cbmNvbnN0IFNBTVBMRV9DT0RFID0gYGltcG9ydCB7IHJlYWRGaWxlLCB3cml0ZUZpbGUgfSBmcm9tICdmcyc7XG5cbmZ1bmN0aW9uIHByb2Nlc3NGaWxlKHBhdGg6IHN0cmluZyk6IFByb21pc2U8c3RyaW5nPiB7XG5cdHJldHVybiBuZXcgUHJvbWlzZSgocmVzb2x2ZSwgcmVqZWN0KSA9PiB7XG5cdFx0cmVhZEZpbGUocGF0aCwgJ3V0ZjgnLCAoZXJyLCBkYXRhKSA9PiB7XG5cdFx0XHRpZiAoZXJyKSB7XG5cdFx0XHRcdHJlamVjdChlcnIpO1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cdFx0XHRyZXNvbHZlKGRhdGEudG9VcHBlckNhc2UoKSk7XG5cdFx0fSk7XG5cdH0pO1xufVxuXG5hc3luYyBmdW5jdGlvbiBtYWluKCkge1xuXHRjb25zdCByZXN1bHQgPSBhd2FpdCBwcm9jZXNzRmlsZSgnLi9pbnB1dC50eHQnKTtcblx0YXdhaXQgd3JpdGVGaWxlKCcuL291dHB1dC50eHQnLCByZXN1bHQpO1xuXHRjb25zb2xlLmxvZygnRG9uZSBwcm9jZXNzaW5nIGZpbGUnKTtcbn1cblxubWFpbigpO1xuYDtcblxuZnVuY3Rpb24gcmVuZGVyUGVla1JlZmVyZW5jZSh7IGNvbnRhaW5lciwgZGlzcG9zYWJsZVN0b3JlLCB0aGVtZSB9OiBDb21wb25lbnRGaXh0dXJlQ29udGV4dCk6IHZvaWQge1xuXHRjb250YWluZXIuc3R5bGUud2lkdGggPSAnNzAwcHgnO1xuXHRjb250YWluZXIuc3R5bGUuaGVpZ2h0ID0gJzQwMHB4Jztcblx0Y29udGFpbmVyLnN0eWxlLmJvcmRlciA9ICcxcHggc29saWQgdmFyKC0tdnNjb2RlLWVkaXRvcldpZGdldC1ib3JkZXIpJztcblxuXHRjb25zdCB1cmkgPSBVUkkucGFyc2UoJ2lubWVtb3J5Oi8vcGVlay1maXh0dXJlLnRzJyk7XG5cblx0Ly8gU3RvcmUgdGV4dCBtb2RlbCByZWZlcmVuY2UgZm9yIHRoZSBtb2NrIHNlcnZpY2Vcblx0Y29uc3QgZml4dHVyZVRleHRNb2RlbDogeyB2YWx1ZTogSVRleHRNb2RlbCB8IHVuZGVmaW5lZCB9ID0geyB2YWx1ZTogdW5kZWZpbmVkIH07XG5cblx0Y29uc3QgaW5zdGFudGlhdGlvblNlcnZpY2UgPSBjcmVhdGVFZGl0b3JTZXJ2aWNlcyhkaXNwb3NhYmxlU3RvcmUsIHtcblx0XHRjb2xvclRoZW1lOiB0aGVtZSxcblx0XHRhZGRpdGlvbmFsU2VydmljZXM6IChyZWcpID0+IHtcblx0XHRcdHJlZ2lzdGVyV29ya2JlbmNoU2VydmljZXMocmVnKTtcblx0XHRcdHJlZy5kZWZpbmUoSUxpc3RTZXJ2aWNlLCBMaXN0U2VydmljZSk7XG5cdFx0XHRyZWcuZGVmaW5lSW5zdGFuY2UocGVla1ZpZXcuSVBlZWtWaWV3U2VydmljZSwgbmV3IGNsYXNzIGV4dGVuZHMgbW9jazxwZWVrVmlldy5JUGVla1ZpZXdTZXJ2aWNlPigpIHtcblx0XHRcdFx0ZGVjbGFyZSByZWFkb25seSBfc2VydmljZUJyYW5kOiB1bmRlZmluZWQ7XG5cdFx0XHRcdG92ZXJyaWRlIGFkZEV4Y2x1c2l2ZVdpZGdldChfZWRpdG9yOiBJQ29kZUVkaXRvciwgX3dpZGdldDogcGVla1ZpZXcuUGVla1ZpZXdXaWRnZXQpIHsgfVxuXHRcdFx0fSk7XG5cdFx0XHRyZWcuZGVmaW5lSW5zdGFuY2UoSVRleHRNb2RlbFNlcnZpY2UsIG5ldyBjbGFzcyBleHRlbmRzIG1vY2s8SVRleHRNb2RlbFNlcnZpY2U+KCkge1xuXHRcdFx0XHRkZWNsYXJlIHJlYWRvbmx5IF9zZXJ2aWNlQnJhbmQ6IHVuZGVmaW5lZDtcblx0XHRcdFx0b3ZlcnJpZGUgYXN5bmMgY3JlYXRlTW9kZWxSZWZlcmVuY2UocmVzb3VyY2U6IFVSSSk6IFByb21pc2U8SVJlZmVyZW5jZTxJUmVzb2x2ZWRUZXh0RWRpdG9yTW9kZWw+PiB7XG5cdFx0XHRcdFx0Ly8gUmV0dXJuIGEgbW9jayByZWZlcmVuY2UgaWYgd2UgaGF2ZSBhIHRleHQgbW9kZWwgZm9yIHRoaXMgVVJJXG5cdFx0XHRcdFx0Y29uc3QgbW9kZWwgPSBmaXh0dXJlVGV4dE1vZGVsLnZhbHVlO1xuXHRcdFx0XHRcdGlmIChtb2RlbCAmJiByZXNvdXJjZS50b1N0cmluZygpID09PSB1cmkudG9TdHJpbmcoKSkge1xuXHRcdFx0XHRcdFx0Y29uc3Qgb25XaWxsRGlzcG9zZSA9IG5ldyBFbWl0dGVyPHZvaWQ+KCk7XG5cdFx0XHRcdFx0XHRjb25zdCB0ZXh0RWRpdG9yTW9kZWw6IElSZXNvbHZlZFRleHRFZGl0b3JNb2RlbCA9IHtcblx0XHRcdFx0XHRcdFx0dGV4dEVkaXRvck1vZGVsOiBtb2RlbCxcblx0XHRcdFx0XHRcdFx0b25XaWxsRGlzcG9zZTogb25XaWxsRGlzcG9zZS5ldmVudCxcblx0XHRcdFx0XHRcdFx0aXNSZWFkb25seTogKCkgPT4gZmFsc2UsXG5cdFx0XHRcdFx0XHRcdGlzUmVzb2x2ZWQ6ICgpID0+IHRydWUsXG5cdFx0XHRcdFx0XHRcdGlzRGlzcG9zZWQ6ICgpID0+IGZhbHNlLFxuXHRcdFx0XHRcdFx0XHRnZXRMYW5ndWFnZUlkOiAoKSA9PiBtb2RlbC5nZXRMYW5ndWFnZUlkKCksXG5cdFx0XHRcdFx0XHRcdGNyZWF0ZVNuYXBzaG90OiAoKSA9PiBtb2RlbC5jcmVhdGVTbmFwc2hvdCgpLFxuXHRcdFx0XHRcdFx0XHRyZXNvbHZlOiBhc3luYyAoKSA9PiB7IH0sXG5cdFx0XHRcdFx0XHRcdGRpc3Bvc2U6ICgpID0+IG9uV2lsbERpc3Bvc2UuZGlzcG9zZSgpLFxuXHRcdFx0XHRcdFx0fTtcblx0XHRcdFx0XHRcdHJldHVybiB7XG5cdFx0XHRcdFx0XHRcdG9iamVjdDogdGV4dEVkaXRvck1vZGVsLFxuXHRcdFx0XHRcdFx0XHRkaXNwb3NlOiAoKSA9PiB7IH0sXG5cdFx0XHRcdFx0XHR9O1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHR0aHJvdyBuZXcgRXJyb3IoYE5vIG1vZGVsIGZvciAke3Jlc291cmNlLnRvU3RyaW5nKCl9YCk7XG5cdFx0XHRcdH1cblx0XHRcdFx0b3ZlcnJpZGUgY2FuSGFuZGxlUmVzb3VyY2UoKSB7IHJldHVybiBmYWxzZTsgfVxuXHRcdFx0XHRvdmVycmlkZSByZWdpc3RlclRleHRNb2RlbENvbnRlbnRQcm92aWRlcigpIHsgcmV0dXJuIHsgZGlzcG9zZTogKCkgPT4geyB9IH07IH1cblx0XHRcdH0pO1xuXHRcdH0sXG5cdH0pO1xuXG5cdGNvbnN0IHRleHRNb2RlbCA9IGRpc3Bvc2FibGVTdG9yZS5hZGQoY3JlYXRlVGV4dE1vZGVsKFxuXHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLFxuXHRcdFNBTVBMRV9DT0RFLFxuXHRcdHVyaSxcblx0XHQndHlwZXNjcmlwdCdcblx0KSk7XG5cdGZpeHR1cmVUZXh0TW9kZWwudmFsdWUgPSB0ZXh0TW9kZWw7XG5cblx0Y29uc3QgZWRpdG9yV2lkZ2V0T3B0aW9uczogSUNvZGVFZGl0b3JXaWRnZXRPcHRpb25zID0ge1xuXHRcdGNvbnRyaWJ1dGlvbnM6IFtdXG5cdH07XG5cblx0Y29uc3QgZWRpdG9yID0gaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoXG5cdFx0Q29kZUVkaXRvcldpZGdldCxcblx0XHRjb250YWluZXIsXG5cdFx0e1xuXHRcdFx0YXV0b21hdGljTGF5b3V0OiB0cnVlLFxuXHRcdFx0bWluaW1hcDogeyBlbmFibGVkOiBmYWxzZSB9LFxuXHRcdFx0bGluZU51bWJlcnM6ICdvbicsXG5cdFx0XHRzY3JvbGxCZXlvbmRMYXN0TGluZTogZmFsc2UsXG5cdFx0XHRmb250U2l6ZTogMTQsXG5cdFx0XHRjdXJzb3JCbGlua2luZzogJ3NvbGlkJyxcblx0XHR9LFxuXHRcdGVkaXRvcldpZGdldE9wdGlvbnNcblx0KTtcblxuXHRlZGl0b3Iuc2V0TW9kZWwodGV4dE1vZGVsKTtcblx0ZWRpdG9yLmZvY3VzKCk7XG5cblx0Y29uc3QgbGF5b3V0RGF0YTogTGF5b3V0RGF0YSA9IHsgcmF0aW86IDAuNywgaGVpZ2h0SW5MaW5lczogMTAgfTtcblxuXHRjb25zdCByZWZlcmVuY2VXaWRnZXQgPSBpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShcblx0XHRSZWZlcmVuY2VXaWRnZXQsXG5cdFx0ZWRpdG9yLFxuXHRcdHRydWUsXG5cdFx0bGF5b3V0RGF0YSxcblx0KTtcblx0Ly8gUmVnaXN0ZXIgd2lkZ2V0IEJFRk9SRSBlZGl0b3Igc28gd2lkZ2V0LmRpc3Bvc2UoKSBydW5zIGZpcnN0OyBvdGhlcndpc2Vcblx0Ly8gYFJlZmVyZW5jZVdpZGdldC5kaXNwb3NlKClgIGNhbGxzIGBvYnNlcnZhYmxlQ29kZUVkaXRvcihkaXNwb3NlZCBlZGl0b3IpYFxuXHQvLyB3aGljaCBjcmVhdGVzIGEgZnJlc2ggdW50cmFja2VkIE9ic2VydmFibGVDb2RlRWRpdG9yLlxuXHRkaXNwb3NhYmxlU3RvcmUuYWRkKHJlZmVyZW5jZVdpZGdldCk7XG5cdGRpc3Bvc2FibGVTdG9yZS5hZGQoZWRpdG9yKTtcblxuXHRjb25zdCByYW5nZSA9IHsgc3RhcnRMaW5lTnVtYmVyOiAzLCBzdGFydENvbHVtbjogMTAsIGVuZExpbmVOdW1iZXI6IDMsIGVuZENvbHVtbjogMjEgfTtcblx0cmVmZXJlbmNlV2lkZ2V0LnNldFRpdGxlKCdwcm9jZXNzRmlsZScpO1xuXHRyZWZlcmVuY2VXaWRnZXQuc2V0TWV0YVRpdGxlKCczIHJlZmVyZW5jZXMnKTtcblx0cmVmZXJlbmNlV2lkZ2V0LnNob3cocmFuZ2UpO1xuXG5cdGNvbnN0IGxpbmtzID0gW1xuXHRcdHsgdXJpLCByYW5nZTogeyBzdGFydExpbmVOdW1iZXI6IDMsIHN0YXJ0Q29sdW1uOiAxMCwgZW5kTGluZU51bWJlcjogMywgZW5kQ29sdW1uOiAyMSB9IH0sXG5cdFx0eyB1cmksIHJhbmdlOiB7IHN0YXJ0TGluZU51bWJlcjogMTYsIHN0YXJ0Q29sdW1uOiAyNiwgZW5kTGluZU51bWJlcjogMTYsIGVuZENvbHVtbjogMzcgfSB9LFxuXHRcdHsgdXJpLCByYW5nZTogeyBzdGFydExpbmVOdW1iZXI6IDIwLCBzdGFydENvbHVtbjogMSwgZW5kTGluZU51bWJlcjogMjAsIGVuZENvbHVtbjogNSB9IH0sXG5cdF07XG5cblx0Y29uc3QgbW9kZWwgPSBuZXcgUmVmZXJlbmNlc01vZGVsKGxpbmtzLCAncHJvY2Vzc0ZpbGUnKTtcblx0ZGlzcG9zYWJsZVN0b3JlLmFkZChtb2RlbCk7XG5cdHJlZmVyZW5jZVdpZGdldC5zZXRNb2RlbChtb2RlbCk7XG59XG5cbmV4cG9ydCBkZWZhdWx0IGRlZmluZVRoZW1lZEZpeHR1cmVHcm91cCh7XG5cdFBlZWtSZWZlcmVuY2VzOiBkZWZpbmVDb21wb25lbnRGaXh0dXJlKHtcblx0XHRyZW5kZXI6IHJlbmRlclBlZWtSZWZlcmVuY2UsXG5cdH0pLFxufSk7XG4iXSwKICAibWFwcGluZ3MiOiAiQUFLQSxTQUFTLGVBQWU7QUFFeEIsU0FBUyxXQUFXO0FBQ3BCLFNBQVMsWUFBWTtBQUNyQixTQUFrQyxzQkFBc0IsaUJBQWlCLHdCQUF3QiwwQkFBMEIsaUNBQWlDO0FBQzVKLFNBQVMsd0JBQWtEO0FBQzNELFNBQXFCLHVCQUF1QjtBQUM1QyxTQUFTLHVCQUF1QjtBQUNoQyxZQUFZLGNBQWM7QUFDMUIsU0FBbUMseUJBQXlCO0FBQzVELFNBQVMsY0FBYyxtQkFBbUI7QUFJMUMsT0FBTztBQUNQLE9BQU87QUFDUCxPQUFPO0FBRVAsTUFBTSxjQUFjO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBdUJwQixTQUFTLG9CQUFvQixFQUFF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
