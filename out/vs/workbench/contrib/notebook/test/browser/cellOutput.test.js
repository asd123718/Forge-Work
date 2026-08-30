import assert from "assert";
import { VSBuffer } from "../../../../../base/common/buffer.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../../base/test/common/utils.js";
import { CellOutputContainer } from "../../browser/view/cellParts/cellOutput.js";
import { CellKind } from "../../common/notebookCommon.js";
import { setupInstantiationService, withTestNotebook } from "./testNotebookEditor.js";
import { FastDomNode } from "../../../../../base/browser/fastDomNode.js";
import { INotebookService } from "../../common/notebookService.js";
import { mock } from "../../../../../base/test/common/mock.js";
import { IMenuService } from "../../../../../platform/actions/common/actions.js";
import { Event } from "../../../../../base/common/event.js";
import { getAllOutputsText } from "../../browser/viewModel/cellOutputTextHelper.js";
suite("CellOutput", () => {
  const store = ensureNoDisposablesAreLeakedInTestSuite();
  let instantiationService;
  let outputMenus = [];
  setup(() => {
    outputMenus = [];
    instantiationService = setupInstantiationService(store);
    instantiationService.stub(INotebookService, new class extends mock() {
      getOutputMimeTypeInfo(_textModel, _kernelProvides, output) {
        return [{
          rendererId: "plainTextRendererId",
          mimeType: "text/plain",
          isTrusted: true
        }, {
          rendererId: "htmlRendererId",
          mimeType: "text/html",
          isTrusted: true
        }, {
          rendererId: "errorRendererId",
          mimeType: "application/vnd.code.notebook.error",
          isTrusted: true
        }, {
          rendererId: "stderrRendererId",
          mimeType: "application/vnd.code.notebook.stderr",
          isTrusted: true
        }, {
          rendererId: "stdoutRendererId",
          mimeType: "application/vnd.code.notebook.stdout",
          isTrusted: true
        }].filter((info) => output.outputs.some((output2) => output2.mime === info.mimeType));
      }
      getRendererInfo() {
        return {
          id: "rendererId",
          displayName: "Stubbed Renderer",
          extensionId: { _lower: "id", value: "id" }
        };
      }
    }());
    instantiationService.stub(IMenuService, new class extends mock() {
      createMenu() {
        const menu = new class extends mock() {
          constructor() {
            super(...arguments);
            this.onDidChange = Event.None;
          }
          getActions() {
            return [];
          }
          dispose() {
            outputMenus = outputMenus.filter((item) => item !== menu);
          }
        }();
        outputMenus.push(menu);
        return menu;
      }
    }());
  });
  test("Render cell output items with multiple mime types", async function() {
    const outputItem = { data: VSBuffer.fromString("output content"), mime: "text/plain" };
    const htmlOutputItem = { data: VSBuffer.fromString("output content"), mime: "text/html" };
    const output1 = { outputId: "abc", outputs: [outputItem, htmlOutputItem] };
    const output2 = { outputId: "def", outputs: [outputItem, htmlOutputItem] };
    await withTestNotebook(
      [
        ["print(output content)", "python", CellKind.Code, [output1, output2], {}]
      ],
      (editor, viewModel, disposables, accessor) => {
        const cell = viewModel.viewCells[0];
        const cellTemplate = createCellTemplate(disposables);
        const output = disposables.add(accessor.createInstance(CellOutputContainer, editor, cell, cellTemplate, { limit: 100 }));
        output.render();
        cell.outputsViewModels[0].setVisible(true);
        assert.strictEqual(outputMenus.length, 1, "should have 1 output menus");
        assert(cellTemplate.outputContainer.domNode.style.display !== "none", "output container should be visible");
        cell.outputsViewModels[1].setVisible(true);
        assert.strictEqual(outputMenus.length, 2, "should have 2 output menus");
        cell.outputsViewModels[1].setVisible(true);
        assert.strictEqual(outputMenus.length, 2, "should still have 2 output menus");
      },
      instantiationService
    );
  });
  test("One of many cell outputs becomes hidden", async function() {
    const outputItem = { data: VSBuffer.fromString("output content"), mime: "text/plain" };
    const htmlOutputItem = { data: VSBuffer.fromString("output content"), mime: "text/html" };
    const output1 = { outputId: "abc", outputs: [outputItem, htmlOutputItem] };
    const output2 = { outputId: "def", outputs: [outputItem, htmlOutputItem] };
    const output3 = { outputId: "ghi", outputs: [outputItem, htmlOutputItem] };
    await withTestNotebook(
      [
        ["print(output content)", "python", CellKind.Code, [output1, output2, output3], {}]
      ],
      (editor, viewModel, disposables, accessor) => {
        const cell = viewModel.viewCells[0];
        const cellTemplate = createCellTemplate(disposables);
        const output = disposables.add(accessor.createInstance(CellOutputContainer, editor, cell, cellTemplate, { limit: 100 }));
        output.render();
        cell.outputsViewModels[0].setVisible(true);
        cell.outputsViewModels[1].setVisible(true);
        cell.outputsViewModels[2].setVisible(true);
        cell.outputsViewModels[1].setVisible(false);
        assert(cellTemplate.outputContainer.domNode.style.display !== "none", "output container should be visible");
        assert.strictEqual(outputMenus.length, 2, "should have 2 output menus");
      },
      instantiationService
    );
  });
  test("get all adjacent stream outputs", async () => {
    const stdout = { data: VSBuffer.fromString("stdout"), mime: "application/vnd.code.notebook.stdout" };
    const stderr = { data: VSBuffer.fromString("stderr"), mime: "application/vnd.code.notebook.stderr" };
    const output1 = { outputId: "abc", outputs: [stdout] };
    const output2 = { outputId: "abc", outputs: [stderr] };
    await withTestNotebook(
      [
        ["print(output content)", "python", CellKind.Code, [output1, output2], {}]
      ],
      (_editor, viewModel) => {
        const cell = viewModel.viewCells[0];
        const notebook = viewModel.notebookDocument;
        const result = getAllOutputsText(notebook, cell);
        assert.strictEqual(result, "stdoutstderr");
      },
      instantiationService
    );
  });
  test("get all mixed outputs of cell", async () => {
    const stdout = { data: VSBuffer.fromString("stdout"), mime: "application/vnd.code.notebook.stdout" };
    const stderr = { data: VSBuffer.fromString("stderr"), mime: "application/vnd.code.notebook.stderr" };
    const plainText = { data: VSBuffer.fromString("output content"), mime: "text/plain" };
    const error = { data: VSBuffer.fromString(`{"name":"Error Name","message":"error message","stack":"error stack"}`), mime: "application/vnd.code.notebook.error" };
    const output1 = { outputId: "abc", outputs: [stdout] };
    const output2 = { outputId: "abc", outputs: [stderr] };
    const output3 = { outputId: "abc", outputs: [plainText] };
    const output4 = { outputId: "abc", outputs: [error] };
    await withTestNotebook(
      [
        ["print(output content)", "python", CellKind.Code, [output1, output2, output3, output4], {}]
      ],
      (_editor, viewModel) => {
        const cell = viewModel.viewCells[0];
        const notebook = viewModel.notebookDocument;
        const result = getAllOutputsText(notebook, cell);
        assert.strictEqual(
          result,
          "Cell output 1 of 3\nstdoutstderr\nCell output 2 of 3\noutput content\nCell output 3 of 3\nerror stack"
        );
      },
      instantiationService
    );
  });
});
function createCellTemplate(disposables) {
  return {
    outputContainer: new FastDomNode(document.createElement("div")),
    outputShowMoreContainer: new FastDomNode(document.createElement("div")),
    focusSinkElement: document.createElement("div"),
    templateDisposables: disposables,
    elementDisposables: disposables
  };
}
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXG5vdGVib29rXFx0ZXN0XFxicm93c2VyXFxjZWxsT3V0cHV0LnRlc3QudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgYXNzZXJ0IGZyb20gJ2Fzc2VydCc7XG5pbXBvcnQgeyBWU0J1ZmZlciB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2J1ZmZlci5qcyc7XG5pbXBvcnQgeyBlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL3Rlc3QvY29tbW9uL3V0aWxzLmpzJztcbmltcG9ydCB7IENlbGxPdXRwdXRDb250YWluZXIgfSBmcm9tICcuLi8uLi9icm93c2VyL3ZpZXcvY2VsbFBhcnRzL2NlbGxPdXRwdXQuanMnO1xuaW1wb3J0IHsgQ29kZUNlbGxSZW5kZXJUZW1wbGF0ZSB9IGZyb20gJy4uLy4uL2Jyb3dzZXIvdmlldy9ub3RlYm9va1JlbmRlcmluZ0NvbW1vbi5qcyc7XG5pbXBvcnQgeyBDb2RlQ2VsbFZpZXdNb2RlbCB9IGZyb20gJy4uLy4uL2Jyb3dzZXIvdmlld01vZGVsL2NvZGVDZWxsVmlld01vZGVsLmpzJztcbmltcG9ydCB7IENlbGxLaW5kLCBJTm90ZWJvb2tSZW5kZXJlckluZm8sIElPdXRwdXREdG8gfSBmcm9tICcuLi8uLi9jb21tb24vbm90ZWJvb2tDb21tb24uanMnO1xuaW1wb3J0IHsgc2V0dXBJbnN0YW50aWF0aW9uU2VydmljZSwgd2l0aFRlc3ROb3RlYm9vayB9IGZyb20gJy4vdGVzdE5vdGVib29rRWRpdG9yLmpzJztcbmltcG9ydCB7IEZhc3REb21Ob2RlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL2Zhc3REb21Ob2RlLmpzJztcbmltcG9ydCB7IERpc3Bvc2FibGVTdG9yZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBJTm90ZWJvb2tTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vY29tbW9uL25vdGVib29rU2VydmljZS5qcyc7XG5pbXBvcnQgeyBtb2NrIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS90ZXN0L2NvbW1vbi9tb2NrLmpzJztcbmltcG9ydCB7IElNZW51LCBJTWVudVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9hY3Rpb25zL2NvbW1vbi9hY3Rpb25zLmpzJztcbmltcG9ydCB7IEV2ZW50IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vZXZlbnQuanMnO1xuaW1wb3J0IHsgVGVzdEluc3RhbnRpYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vaW5zdGFudGlhdGlvbi90ZXN0L2NvbW1vbi9pbnN0YW50aWF0aW9uU2VydmljZU1vY2suanMnO1xuaW1wb3J0IHsgZ2V0QWxsT3V0cHV0c1RleHQgfSBmcm9tICcuLi8uLi9icm93c2VyL3ZpZXdNb2RlbC9jZWxsT3V0cHV0VGV4dEhlbHBlci5qcyc7XG5cbnN1aXRlKCdDZWxsT3V0cHV0JywgKCkgPT4ge1xuXHRjb25zdCBzdG9yZSA9IGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSgpO1xuXHRsZXQgaW5zdGFudGlhdGlvblNlcnZpY2U6IFRlc3RJbnN0YW50aWF0aW9uU2VydmljZTtcblx0bGV0IG91dHB1dE1lbnVzOiBJTWVudVtdID0gW107XG5cblx0c2V0dXAoKCkgPT4ge1xuXHRcdG91dHB1dE1lbnVzID0gW107XG5cdFx0aW5zdGFudGlhdGlvblNlcnZpY2UgPSBzZXR1cEluc3RhbnRpYXRpb25TZXJ2aWNlKHN0b3JlKTtcblx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElOb3RlYm9va1NlcnZpY2UsIG5ldyBjbGFzcyBleHRlbmRzIG1vY2s8SU5vdGVib29rU2VydmljZT4oKSB7XG5cdFx0XHRvdmVycmlkZSBnZXRPdXRwdXRNaW1lVHlwZUluZm8oX3RleHRNb2RlbDogYW55LCBfa2VybmVsUHJvdmlkZXM6IHJlYWRvbmx5IHN0cmluZ1tdIHwgdW5kZWZpbmVkLCBvdXRwdXQ6IElPdXRwdXREdG8pIHtcblx0XHRcdFx0cmV0dXJuIFt7XG5cdFx0XHRcdFx0cmVuZGVyZXJJZDogJ3BsYWluVGV4dFJlbmRlcmVySWQnLFxuXHRcdFx0XHRcdG1pbWVUeXBlOiAndGV4dC9wbGFpbicsXG5cdFx0XHRcdFx0aXNUcnVzdGVkOiB0cnVlXG5cdFx0XHRcdH0sIHtcblx0XHRcdFx0XHRyZW5kZXJlcklkOiAnaHRtbFJlbmRlcmVySWQnLFxuXHRcdFx0XHRcdG1pbWVUeXBlOiAndGV4dC9odG1sJyxcblx0XHRcdFx0XHRpc1RydXN0ZWQ6IHRydWVcblx0XHRcdFx0fSwge1xuXHRcdFx0XHRcdHJlbmRlcmVySWQ6ICdlcnJvclJlbmRlcmVySWQnLFxuXHRcdFx0XHRcdG1pbWVUeXBlOiAnYXBwbGljYXRpb24vdm5kLmNvZGUubm90ZWJvb2suZXJyb3InLFxuXHRcdFx0XHRcdGlzVHJ1c3RlZDogdHJ1ZVxuXHRcdFx0XHR9LCB7XG5cdFx0XHRcdFx0cmVuZGVyZXJJZDogJ3N0ZGVyclJlbmRlcmVySWQnLFxuXHRcdFx0XHRcdG1pbWVUeXBlOiAnYXBwbGljYXRpb24vdm5kLmNvZGUubm90ZWJvb2suc3RkZXJyJyxcblx0XHRcdFx0XHRpc1RydXN0ZWQ6IHRydWVcblx0XHRcdFx0fSwge1xuXHRcdFx0XHRcdHJlbmRlcmVySWQ6ICdzdGRvdXRSZW5kZXJlcklkJyxcblx0XHRcdFx0XHRtaW1lVHlwZTogJ2FwcGxpY2F0aW9uL3ZuZC5jb2RlLm5vdGVib29rLnN0ZG91dCcsXG5cdFx0XHRcdFx0aXNUcnVzdGVkOiB0cnVlXG5cdFx0XHRcdH1dXG5cdFx0XHRcdFx0LmZpbHRlcihpbmZvID0+IG91dHB1dC5vdXRwdXRzLnNvbWUob3V0cHV0ID0+IG91dHB1dC5taW1lID09PSBpbmZvLm1pbWVUeXBlKSk7XG5cdFx0XHR9XG5cdFx0XHRvdmVycmlkZSBnZXRSZW5kZXJlckluZm8oKTogSU5vdGVib29rUmVuZGVyZXJJbmZvIHtcblx0XHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0XHRpZDogJ3JlbmRlcmVySWQnLFxuXHRcdFx0XHRcdGRpc3BsYXlOYW1lOiAnU3R1YmJlZCBSZW5kZXJlcicsXG5cdFx0XHRcdFx0ZXh0ZW5zaW9uSWQ6IHsgX2xvd2VyOiAnaWQnLCB2YWx1ZTogJ2lkJyB9LFxuXHRcdFx0XHR9IGFzIElOb3RlYm9va1JlbmRlcmVySW5mbztcblx0XHRcdH1cblx0XHR9KTtcblx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElNZW51U2VydmljZSwgbmV3IGNsYXNzIGV4dGVuZHMgbW9jazxJTWVudVNlcnZpY2U+KCkge1xuXHRcdFx0b3ZlcnJpZGUgY3JlYXRlTWVudSgpIHtcblx0XHRcdFx0Y29uc3QgbWVudSA9IG5ldyBjbGFzcyBleHRlbmRzIG1vY2s8SU1lbnU+KCkge1xuXHRcdFx0XHRcdG92ZXJyaWRlIG9uRGlkQ2hhbmdlID0gRXZlbnQuTm9uZTtcblx0XHRcdFx0XHRvdmVycmlkZSBnZXRBY3Rpb25zKCkgeyByZXR1cm4gW107IH1cblx0XHRcdFx0XHRvdmVycmlkZSBkaXNwb3NlKCkgeyBvdXRwdXRNZW51cyA9IG91dHB1dE1lbnVzLmZpbHRlcihpdGVtID0+IGl0ZW0gIT09IG1lbnUpOyB9XG5cdFx0XHRcdH07XG5cdFx0XHRcdG91dHB1dE1lbnVzLnB1c2gobWVudSk7XG5cdFx0XHRcdHJldHVybiBtZW51O1xuXHRcdFx0fVxuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdSZW5kZXIgY2VsbCBvdXRwdXQgaXRlbXMgd2l0aCBtdWx0aXBsZSBtaW1lIHR5cGVzJywgYXN5bmMgZnVuY3Rpb24gKCkge1xuXHRcdGNvbnN0IG91dHB1dEl0ZW0gPSB7IGRhdGE6IFZTQnVmZmVyLmZyb21TdHJpbmcoJ291dHB1dCBjb250ZW50JyksIG1pbWU6ICd0ZXh0L3BsYWluJyB9O1xuXHRcdGNvbnN0IGh0bWxPdXRwdXRJdGVtID0geyBkYXRhOiBWU0J1ZmZlci5mcm9tU3RyaW5nKCdvdXRwdXQgY29udGVudCcpLCBtaW1lOiAndGV4dC9odG1sJyB9O1xuXHRcdGNvbnN0IG91dHB1dDE6IElPdXRwdXREdG8gPSB7IG91dHB1dElkOiAnYWJjJywgb3V0cHV0czogW291dHB1dEl0ZW0sIGh0bWxPdXRwdXRJdGVtXSB9O1xuXHRcdGNvbnN0IG91dHB1dDI6IElPdXRwdXREdG8gPSB7IG91dHB1dElkOiAnZGVmJywgb3V0cHV0czogW291dHB1dEl0ZW0sIGh0bWxPdXRwdXRJdGVtXSB9O1xuXG5cdFx0YXdhaXQgd2l0aFRlc3ROb3RlYm9vayhcblx0XHRcdFtcblx0XHRcdFx0WydwcmludChvdXRwdXQgY29udGVudCknLCAncHl0aG9uJywgQ2VsbEtpbmQuQ29kZSwgW291dHB1dDEsIG91dHB1dDJdLCB7fV0sXG5cdFx0XHRdLFxuXHRcdFx0KGVkaXRvciwgdmlld01vZGVsLCBkaXNwb3NhYmxlcywgYWNjZXNzb3IpID0+IHtcblxuXHRcdFx0XHRjb25zdCBjZWxsID0gdmlld01vZGVsLnZpZXdDZWxsc1swXSBhcyBDb2RlQ2VsbFZpZXdNb2RlbDtcblx0XHRcdFx0Y29uc3QgY2VsbFRlbXBsYXRlID0gY3JlYXRlQ2VsbFRlbXBsYXRlKGRpc3Bvc2FibGVzKTtcblx0XHRcdFx0Y29uc3Qgb3V0cHV0ID0gZGlzcG9zYWJsZXMuYWRkKGFjY2Vzc29yLmNyZWF0ZUluc3RhbmNlKENlbGxPdXRwdXRDb250YWluZXIsIGVkaXRvciwgY2VsbCwgY2VsbFRlbXBsYXRlLCB7IGxpbWl0OiAxMDAgfSkpO1xuXHRcdFx0XHRvdXRwdXQucmVuZGVyKCk7XG5cdFx0XHRcdGNlbGwub3V0cHV0c1ZpZXdNb2RlbHNbMF0uc2V0VmlzaWJsZSh0cnVlKTtcblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG91dHB1dE1lbnVzLmxlbmd0aCwgMSwgJ3Nob3VsZCBoYXZlIDEgb3V0cHV0IG1lbnVzJyk7XG5cdFx0XHRcdGFzc2VydChjZWxsVGVtcGxhdGUub3V0cHV0Q29udGFpbmVyLmRvbU5vZGUuc3R5bGUuZGlzcGxheSAhPT0gJ25vbmUnLCAnb3V0cHV0IGNvbnRhaW5lciBzaG91bGQgYmUgdmlzaWJsZScpO1xuXHRcdFx0XHRjZWxsLm91dHB1dHNWaWV3TW9kZWxzWzFdLnNldFZpc2libGUodHJ1ZSk7XG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChvdXRwdXRNZW51cy5sZW5ndGgsIDIsICdzaG91bGQgaGF2ZSAyIG91dHB1dCBtZW51cycpO1xuXHRcdFx0XHRjZWxsLm91dHB1dHNWaWV3TW9kZWxzWzFdLnNldFZpc2libGUodHJ1ZSk7XG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChvdXRwdXRNZW51cy5sZW5ndGgsIDIsICdzaG91bGQgc3RpbGwgaGF2ZSAyIG91dHB1dCBtZW51cycpO1xuXHRcdFx0fSxcblx0XHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlXG5cdFx0KTtcblx0fSk7XG5cblx0dGVzdCgnT25lIG9mIG1hbnkgY2VsbCBvdXRwdXRzIGJlY29tZXMgaGlkZGVuJywgYXN5bmMgZnVuY3Rpb24gKCkge1xuXHRcdGNvbnN0IG91dHB1dEl0ZW0gPSB7IGRhdGE6IFZTQnVmZmVyLmZyb21TdHJpbmcoJ291dHB1dCBjb250ZW50JyksIG1pbWU6ICd0ZXh0L3BsYWluJyB9O1xuXHRcdGNvbnN0IGh0bWxPdXRwdXRJdGVtID0geyBkYXRhOiBWU0J1ZmZlci5mcm9tU3RyaW5nKCdvdXRwdXQgY29udGVudCcpLCBtaW1lOiAndGV4dC9odG1sJyB9O1xuXHRcdGNvbnN0IG91dHB1dDE6IElPdXRwdXREdG8gPSB7IG91dHB1dElkOiAnYWJjJywgb3V0cHV0czogW291dHB1dEl0ZW0sIGh0bWxPdXRwdXRJdGVtXSB9O1xuXHRcdGNvbnN0IG91dHB1dDI6IElPdXRwdXREdG8gPSB7IG91dHB1dElkOiAnZGVmJywgb3V0cHV0czogW291dHB1dEl0ZW0sIGh0bWxPdXRwdXRJdGVtXSB9O1xuXHRcdGNvbnN0IG91dHB1dDM6IElPdXRwdXREdG8gPSB7IG91dHB1dElkOiAnZ2hpJywgb3V0cHV0czogW291dHB1dEl0ZW0sIGh0bWxPdXRwdXRJdGVtXSB9O1xuXG5cdFx0YXdhaXQgd2l0aFRlc3ROb3RlYm9vayhcblx0XHRcdFtcblx0XHRcdFx0WydwcmludChvdXRwdXQgY29udGVudCknLCAncHl0aG9uJywgQ2VsbEtpbmQuQ29kZSwgW291dHB1dDEsIG91dHB1dDIsIG91dHB1dDNdLCB7fV0sXG5cdFx0XHRdLFxuXHRcdFx0KGVkaXRvciwgdmlld01vZGVsLCBkaXNwb3NhYmxlcywgYWNjZXNzb3IpID0+IHtcblxuXHRcdFx0XHRjb25zdCBjZWxsID0gdmlld01vZGVsLnZpZXdDZWxsc1swXSBhcyBDb2RlQ2VsbFZpZXdNb2RlbDtcblx0XHRcdFx0Y29uc3QgY2VsbFRlbXBsYXRlID0gY3JlYXRlQ2VsbFRlbXBsYXRlKGRpc3Bvc2FibGVzKTtcblx0XHRcdFx0Y29uc3Qgb3V0cHV0ID0gZGlzcG9zYWJsZXMuYWRkKGFjY2Vzc29yLmNyZWF0ZUluc3RhbmNlKENlbGxPdXRwdXRDb250YWluZXIsIGVkaXRvciwgY2VsbCwgY2VsbFRlbXBsYXRlLCB7IGxpbWl0OiAxMDAgfSkpO1xuXHRcdFx0XHRvdXRwdXQucmVuZGVyKCk7XG5cdFx0XHRcdGNlbGwub3V0cHV0c1ZpZXdNb2RlbHNbMF0uc2V0VmlzaWJsZSh0cnVlKTtcblx0XHRcdFx0Y2VsbC5vdXRwdXRzVmlld01vZGVsc1sxXS5zZXRWaXNpYmxlKHRydWUpO1xuXHRcdFx0XHRjZWxsLm91dHB1dHNWaWV3TW9kZWxzWzJdLnNldFZpc2libGUodHJ1ZSk7XG5cdFx0XHRcdGNlbGwub3V0cHV0c1ZpZXdNb2RlbHNbMV0uc2V0VmlzaWJsZShmYWxzZSk7XG5cdFx0XHRcdGFzc2VydChjZWxsVGVtcGxhdGUub3V0cHV0Q29udGFpbmVyLmRvbU5vZGUuc3R5bGUuZGlzcGxheSAhPT0gJ25vbmUnLCAnb3V0cHV0IGNvbnRhaW5lciBzaG91bGQgYmUgdmlzaWJsZScpO1xuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwob3V0cHV0TWVudXMubGVuZ3RoLCAyLCAnc2hvdWxkIGhhdmUgMiBvdXRwdXQgbWVudXMnKTtcblx0XHRcdH0sXG5cdFx0XHRpbnN0YW50aWF0aW9uU2VydmljZVxuXHRcdCk7XG5cdH0pO1xuXG5cdHRlc3QoJ2dldCBhbGwgYWRqYWNlbnQgc3RyZWFtIG91dHB1dHMnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3Qgc3Rkb3V0ID0geyBkYXRhOiBWU0J1ZmZlci5mcm9tU3RyaW5nKCdzdGRvdXQnKSwgbWltZTogJ2FwcGxpY2F0aW9uL3ZuZC5jb2RlLm5vdGVib29rLnN0ZG91dCcgfTtcblx0XHRjb25zdCBzdGRlcnIgPSB7IGRhdGE6IFZTQnVmZmVyLmZyb21TdHJpbmcoJ3N0ZGVycicpLCBtaW1lOiAnYXBwbGljYXRpb24vdm5kLmNvZGUubm90ZWJvb2suc3RkZXJyJyB9O1xuXHRcdGNvbnN0IG91dHB1dDE6IElPdXRwdXREdG8gPSB7IG91dHB1dElkOiAnYWJjJywgb3V0cHV0czogW3N0ZG91dF0gfTtcblx0XHRjb25zdCBvdXRwdXQyOiBJT3V0cHV0RHRvID0geyBvdXRwdXRJZDogJ2FiYycsIG91dHB1dHM6IFtzdGRlcnJdIH07XG5cblx0XHRhd2FpdCB3aXRoVGVzdE5vdGVib29rKFxuXHRcdFx0W1xuXHRcdFx0XHRbJ3ByaW50KG91dHB1dCBjb250ZW50KScsICdweXRob24nLCBDZWxsS2luZC5Db2RlLCBbb3V0cHV0MSwgb3V0cHV0Ml0sIHt9XSxcblx0XHRcdF0sXG5cdFx0XHQoX2VkaXRvciwgdmlld01vZGVsKSA9PiB7XG5cdFx0XHRcdGNvbnN0IGNlbGwgPSB2aWV3TW9kZWwudmlld0NlbGxzWzBdO1xuXHRcdFx0XHRjb25zdCBub3RlYm9vayA9IHZpZXdNb2RlbC5ub3RlYm9va0RvY3VtZW50O1xuXHRcdFx0XHRjb25zdCByZXN1bHQgPSBnZXRBbGxPdXRwdXRzVGV4dChub3RlYm9vaywgY2VsbCk7XG5cblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdCwgJ3N0ZG91dHN0ZGVycicpO1xuXHRcdFx0fSxcblx0XHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlXG5cdFx0KTtcblx0fSk7XG5cblx0dGVzdCgnZ2V0IGFsbCBtaXhlZCBvdXRwdXRzIG9mIGNlbGwnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3Qgc3Rkb3V0ID0geyBkYXRhOiBWU0J1ZmZlci5mcm9tU3RyaW5nKCdzdGRvdXQnKSwgbWltZTogJ2FwcGxpY2F0aW9uL3ZuZC5jb2RlLm5vdGVib29rLnN0ZG91dCcgfTtcblx0XHRjb25zdCBzdGRlcnIgPSB7IGRhdGE6IFZTQnVmZmVyLmZyb21TdHJpbmcoJ3N0ZGVycicpLCBtaW1lOiAnYXBwbGljYXRpb24vdm5kLmNvZGUubm90ZWJvb2suc3RkZXJyJyB9O1xuXHRcdGNvbnN0IHBsYWluVGV4dCA9IHsgZGF0YTogVlNCdWZmZXIuZnJvbVN0cmluZygnb3V0cHV0IGNvbnRlbnQnKSwgbWltZTogJ3RleHQvcGxhaW4nIH07XG5cdFx0Y29uc3QgZXJyb3IgPSB7IGRhdGE6IFZTQnVmZmVyLmZyb21TdHJpbmcoYHtcIm5hbWVcIjpcIkVycm9yIE5hbWVcIixcIm1lc3NhZ2VcIjpcImVycm9yIG1lc3NhZ2VcIixcInN0YWNrXCI6XCJlcnJvciBzdGFja1wifWApLCBtaW1lOiAnYXBwbGljYXRpb24vdm5kLmNvZGUubm90ZWJvb2suZXJyb3InIH07XG5cdFx0Y29uc3Qgb3V0cHV0MTogSU91dHB1dER0byA9IHsgb3V0cHV0SWQ6ICdhYmMnLCBvdXRwdXRzOiBbc3Rkb3V0XSB9O1xuXHRcdGNvbnN0IG91dHB1dDI6IElPdXRwdXREdG8gPSB7IG91dHB1dElkOiAnYWJjJywgb3V0cHV0czogW3N0ZGVycl0gfTtcblx0XHRjb25zdCBvdXRwdXQzOiBJT3V0cHV0RHRvID0geyBvdXRwdXRJZDogJ2FiYycsIG91dHB1dHM6IFtwbGFpblRleHRdIH07XG5cdFx0Y29uc3Qgb3V0cHV0NDogSU91dHB1dER0byA9IHsgb3V0cHV0SWQ6ICdhYmMnLCBvdXRwdXRzOiBbZXJyb3JdIH07XG5cblx0XHRhd2FpdCB3aXRoVGVzdE5vdGVib29rKFxuXHRcdFx0W1xuXHRcdFx0XHRbJ3ByaW50KG91dHB1dCBjb250ZW50KScsICdweXRob24nLCBDZWxsS2luZC5Db2RlLCBbb3V0cHV0MSwgb3V0cHV0Miwgb3V0cHV0Mywgb3V0cHV0NF0sIHt9XSxcblx0XHRcdF0sXG5cdFx0XHQoX2VkaXRvciwgdmlld01vZGVsKSA9PiB7XG5cdFx0XHRcdGNvbnN0IGNlbGwgPSB2aWV3TW9kZWwudmlld0NlbGxzWzBdO1xuXHRcdFx0XHRjb25zdCBub3RlYm9vayA9IHZpZXdNb2RlbC5ub3RlYm9va0RvY3VtZW50O1xuXHRcdFx0XHRjb25zdCByZXN1bHQgPSBnZXRBbGxPdXRwdXRzVGV4dChub3RlYm9vaywgY2VsbCk7XG5cblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdCxcblx0XHRcdFx0XHQnQ2VsbCBvdXRwdXQgMSBvZiAzXFxuJyArXG5cdFx0XHRcdFx0J3N0ZG91dHN0ZGVyclxcbicgK1xuXHRcdFx0XHRcdCdDZWxsIG91dHB1dCAyIG9mIDNcXG4nICtcblx0XHRcdFx0XHQnb3V0cHV0IGNvbnRlbnRcXG4nICtcblx0XHRcdFx0XHQnQ2VsbCBvdXRwdXQgMyBvZiAzXFxuJyArXG5cdFx0XHRcdFx0J2Vycm9yIHN0YWNrJ1xuXHRcdFx0XHQpO1xuXHRcdFx0fSxcblx0XHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlXG5cdFx0KTtcblxuXHR9KTtcblxuXG59KTtcblxuZnVuY3Rpb24gY3JlYXRlQ2VsbFRlbXBsYXRlKGRpc3Bvc2FibGVzOiBEaXNwb3NhYmxlU3RvcmUpIHtcblx0cmV0dXJuIHtcblx0XHRvdXRwdXRDb250YWluZXI6IG5ldyBGYXN0RG9tTm9kZShkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdkaXYnKSksXG5cdFx0b3V0cHV0U2hvd01vcmVDb250YWluZXI6IG5ldyBGYXN0RG9tTm9kZShkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdkaXYnKSksXG5cdFx0Zm9jdXNTaW5rRWxlbWVudDogZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnZGl2JyksXG5cdFx0dGVtcGxhdGVEaXNwb3NhYmxlczogZGlzcG9zYWJsZXMsXG5cdFx0ZWxlbWVudERpc3Bvc2FibGVzOiBkaXNwb3NhYmxlcyxcblx0fSBhcyB1bmtub3duIGFzIENvZGVDZWxsUmVuZGVyVGVtcGxhdGU7XG59XG4iXSwKICAibWFwcGluZ3MiOiAiQUFLQSxPQUFPLFlBQVk7QUFDbkIsU0FBUyxnQkFBZ0I7QUFDekIsU0FBUywrQ0FBK0M7QUFDeEQsU0FBUywyQkFBMkI7QUFHcEMsU0FBUyxnQkFBbUQ7QUFDNUQsU0FBUywyQkFBMkIsd0JBQXdCO0FBQzVELFNBQVMsbUJBQW1CO0FBRTVCLFNBQVMsd0JBQXdCO0FBQ2pDLFNBQVMsWUFBWTtBQUNyQixTQUFnQixvQkFBb0I7QUFDcEMsU0FBUyxhQUFhO0FBRXRCLFNBQVMseUJBQXlCO0FBRWxDLE1BQU0sY0FBYyxNQUFNO0FBQ3pCLFFBQU0sUUFBUSx3Q0FBd0M7QUFDdEQsTUFBSTtBQUNKLE1BQUksY0FBdUIsQ0FBQztBQUU1QixRQUFNLE1BQU07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
