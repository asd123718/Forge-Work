import assert from "assert";
import { Range } from "../../../../../../editor/common/core/range.js";
import { FindMatch, ValidAnnotatedEditOperation } from "../../../../../../editor/common/model.js";
import { USUAL_WORD_SEPARATORS } from "../../../../../../editor/common/core/wordHelper.js";
import { ILanguageService } from "../../../../../../editor/common/languages/language.js";
import { FindReplaceState } from "../../../../../../editor/contrib/find/browser/findState.js";
import { IConfigurationService } from "../../../../../../platform/configuration/common/configuration.js";
import { TestConfigurationService } from "../../../../../../platform/configuration/test/common/testConfigurationService.js";
import { CellFindMatchModel, FindModel } from "../../../browser/contrib/find/findModel.js";
import { CellEditType, CellKind } from "../../../common/notebookCommon.js";
import { TestCell, withTestNotebook } from "../testNotebookEditor.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../../../base/test/common/utils.js";
suite("Notebook Find", () => {
  const disposables = ensureNoDisposablesAreLeakedInTestSuite();
  const configurationValue = {
    value: USUAL_WORD_SEPARATORS
  };
  const configurationService = new class extends TestConfigurationService {
    inspect() {
      return configurationValue;
    }
  }();
  const setupEditorForTest = (editor, viewModel) => {
    editor.changeModelDecorations = (callback) => {
      return callback({
        deltaDecorations: (oldDecorations, newDecorations) => {
          const ret = [];
          newDecorations.forEach((dec) => {
            const cell = viewModel.viewCells.find((cell2) => cell2.handle === dec.ownerId);
            const decorations = cell?.deltaModelDecorations([], dec.decorations) ?? [];
            if (decorations.length > 0) {
              ret.push({ ownerId: dec.ownerId, decorations });
            }
          });
          return ret;
        }
      });
    };
  };
  test("Update find matches basics", async function() {
    await withTestNotebook(
      [
        ["# header 1", "markdown", CellKind.Markup, [], {}],
        ["paragraph 1", "markdown", CellKind.Markup, [], {}],
        ["paragraph 2", "markdown", CellKind.Markup, [], {}]
      ],
      async (editor, viewModel, _ds, accessor) => {
        accessor.stub(IConfigurationService, configurationService);
        const state = disposables.add(new FindReplaceState());
        const model = disposables.add(new FindModel(editor, state, accessor.get(IConfigurationService)));
        const found = new Promise((resolve) => disposables.add(state.onFindReplaceStateChange((e) => {
          if (e.matchesCount) {
            resolve(true);
          }
        })));
        state.change({ isRevealed: true }, true);
        state.change({ searchString: "1" }, true);
        await found;
        assert.strictEqual(model.findMatches.length, 2);
        assert.strictEqual(model.currentMatch, 0);
        model.find({ previous: false });
        assert.strictEqual(model.currentMatch, 1);
        model.find({ previous: false });
        assert.strictEqual(model.currentMatch, 0);
        model.find({ previous: false });
        assert.strictEqual(model.currentMatch, 1);
        assert.strictEqual(editor.textModel.length, 3);
        const found2 = new Promise((resolve) => disposables.add(state.onFindReplaceStateChange((e) => {
          if (e.matchesCount) {
            resolve(true);
          }
        })));
        editor.textModel.applyEdits([{
          editType: CellEditType.Replace,
          index: 3,
          count: 0,
          cells: [
            disposables.add(new TestCell(viewModel.viewType, 3, "# next paragraph 1", "markdown", CellKind.Code, [], accessor.get(ILanguageService)))
          ]
        }], true, void 0, () => void 0, void 0, true);
        await found2;
        assert.strictEqual(editor.textModel.length, 4);
        assert.strictEqual(model.findMatches.length, 3);
        assert.strictEqual(model.currentMatch, 1);
      }
    );
  });
  test("Update find matches basics 2", async function() {
    await withTestNotebook(
      [
        ["# header 1", "markdown", CellKind.Markup, [], {}],
        ["paragraph 1.1", "markdown", CellKind.Markup, [], {}],
        ["paragraph 1.2", "markdown", CellKind.Markup, [], {}],
        ["paragraph 1.3", "markdown", CellKind.Markup, [], {}],
        ["paragraph 2", "markdown", CellKind.Markup, [], {}]
      ],
      async (editor, viewModel, _ds, accessor) => {
        setupEditorForTest(editor, viewModel);
        accessor.stub(IConfigurationService, configurationService);
        const state = disposables.add(new FindReplaceState());
        const model = disposables.add(new FindModel(editor, state, accessor.get(IConfigurationService)));
        const found = new Promise((resolve) => disposables.add(state.onFindReplaceStateChange((e) => {
          if (e.matchesCount) {
            resolve(true);
          }
        })));
        state.change({ isRevealed: true }, true);
        state.change({ searchString: "1" }, true);
        await found;
        assert.strictEqual(model.findMatches.length, 4);
        assert.strictEqual(model.currentMatch, 0);
        model.find({ previous: false });
        assert.strictEqual(model.currentMatch, 1);
        model.find({ previous: false });
        assert.strictEqual(model.currentMatch, 2);
        model.find({ previous: false });
        assert.strictEqual(model.currentMatch, 3);
        const found2 = new Promise((resolve) => disposables.add(state.onFindReplaceStateChange((e) => {
          if (e.matchesCount) {
            resolve(true);
          }
        })));
        editor.textModel.applyEdits([{
          editType: CellEditType.Replace,
          index: 2,
          count: 1,
          cells: []
        }], true, void 0, () => void 0, void 0, true);
        await found2;
        assert.strictEqual(model.findMatches.length, 3);
        assert.strictEqual(model.currentMatch, 0);
        model.find({ previous: true });
        assert.strictEqual(model.currentMatch, 3);
        model.find({ previous: false });
        assert.strictEqual(model.currentMatch, 0);
        model.find({ previous: false });
        assert.strictEqual(model.currentMatch, 1);
        model.find({ previous: false });
        assert.strictEqual(model.currentMatch, 2);
      }
    );
  });
  test("Update find matches basics 3", async function() {
    await withTestNotebook(
      [
        ["# header 1", "markdown", CellKind.Markup, [], {}],
        ["paragraph 1.1", "markdown", CellKind.Markup, [], {}],
        ["paragraph 1.2", "markdown", CellKind.Markup, [], {}],
        ["paragraph 1.3", "markdown", CellKind.Markup, [], {}],
        ["paragraph 2", "markdown", CellKind.Markup, [], {}]
      ],
      async (editor, viewModel, _ds, accessor) => {
        setupEditorForTest(editor, viewModel);
        accessor.stub(IConfigurationService, configurationService);
        const state = disposables.add(new FindReplaceState());
        const model = disposables.add(new FindModel(editor, state, accessor.get(IConfigurationService)));
        const found = new Promise((resolve) => disposables.add(state.onFindReplaceStateChange((e) => {
          if (e.matchesCount) {
            resolve(true);
          }
        })));
        state.change({ isRevealed: true }, true);
        state.change({ searchString: "1" }, true);
        await found;
        assert.strictEqual(model.findMatches.length, 4);
        assert.strictEqual(model.currentMatch, 0);
        model.find({ previous: true });
        assert.strictEqual(model.currentMatch, 4);
        const found2 = new Promise((resolve) => disposables.add(state.onFindReplaceStateChange((e) => {
          if (e.matchesCount) {
            resolve(true);
          }
        })));
        editor.textModel.applyEdits([{
          editType: CellEditType.Replace,
          index: 2,
          count: 1,
          cells: []
        }], true, void 0, () => void 0, void 0, true);
        await found2;
        assert.strictEqual(model.findMatches.length, 3);
        assert.strictEqual(model.currentMatch, 0);
        model.find({ previous: true });
        assert.strictEqual(model.currentMatch, 3);
        model.find({ previous: true });
        assert.strictEqual(model.currentMatch, 2);
      }
    );
  });
  test("Update find matches, #112748", async function() {
    await withTestNotebook(
      [
        ["# header 1", "markdown", CellKind.Markup, [], {}],
        ["paragraph 1.1", "markdown", CellKind.Markup, [], {}],
        ["paragraph 1.2", "markdown", CellKind.Markup, [], {}],
        ["paragraph 1.3", "markdown", CellKind.Markup, [], {}],
        ["paragraph 2", "markdown", CellKind.Markup, [], {}]
      ],
      async (editor, viewModel, _ds, accessor) => {
        setupEditorForTest(editor, viewModel);
        accessor.stub(IConfigurationService, configurationService);
        const state = disposables.add(new FindReplaceState());
        const model = disposables.add(new FindModel(editor, state, accessor.get(IConfigurationService)));
        const found = new Promise((resolve) => disposables.add(state.onFindReplaceStateChange((e) => {
          if (e.matchesCount) {
            resolve(true);
          }
        })));
        state.change({ isRevealed: true }, true);
        state.change({ searchString: "1" }, true);
        await found;
        assert.strictEqual(model.findMatches.length, 4);
        assert.strictEqual(model.currentMatch, 0);
        model.find({ previous: false });
        model.find({ previous: false });
        model.find({ previous: false });
        assert.strictEqual(model.currentMatch, 3);
        const found2 = new Promise((resolve) => disposables.add(state.onFindReplaceStateChange((e) => {
          if (e.matchesCount) {
            resolve(true);
          }
        })));
        viewModel.viewCells[1].textBuffer.applyEdits([
          new ValidAnnotatedEditOperation(null, new Range(1, 1, 1, 14), "", false, false, false)
        ], false, true);
        model.research();
        await found2;
        assert.strictEqual(model.currentMatch, 1);
      }
    );
  });
  test("Reset when match not found, #127198", async function() {
    await withTestNotebook(
      [
        ["# header 1", "markdown", CellKind.Markup, [], {}],
        ["paragraph 1", "markdown", CellKind.Markup, [], {}],
        ["paragraph 2", "markdown", CellKind.Markup, [], {}]
      ],
      async (editor, viewModel, _ds, accessor) => {
        accessor.stub(IConfigurationService, configurationService);
        const state = disposables.add(new FindReplaceState());
        const model = disposables.add(new FindModel(editor, state, accessor.get(IConfigurationService)));
        const found = new Promise((resolve) => disposables.add(state.onFindReplaceStateChange((e) => {
          if (e.matchesCount) {
            resolve(true);
          }
        })));
        state.change({ isRevealed: true }, true);
        state.change({ searchString: "1" }, true);
        await found;
        assert.strictEqual(model.findMatches.length, 2);
        assert.strictEqual(model.currentMatch, 0);
        model.find({ previous: false });
        assert.strictEqual(model.currentMatch, 1);
        model.find({ previous: false });
        assert.strictEqual(model.currentMatch, 0);
        model.find({ previous: false });
        assert.strictEqual(model.currentMatch, 1);
        assert.strictEqual(editor.textModel.length, 3);
        const found2 = new Promise((resolve) => disposables.add(state.onFindReplaceStateChange((e) => {
          if (e.matchesCount) {
            resolve(true);
          }
        })));
        state.change({ searchString: "3" }, true);
        await found2;
        assert.strictEqual(model.currentMatch, -1);
        assert.strictEqual(model.findMatches.length, 0);
      }
    );
  });
  test("CellFindMatchModel", async function() {
    await withTestNotebook(
      [
        ["# header 1", "markdown", CellKind.Markup, [], {}],
        ["print(1)", "typescript", CellKind.Code, [], {}]
      ],
      async (editor) => {
        const mdCell = editor.cellAt(0);
        const mdModel = new CellFindMatchModel(mdCell, 0, [], []);
        assert.strictEqual(mdModel.length, 0);
        mdModel.contentMatches.push(new FindMatch(new Range(1, 1, 1, 2), []));
        assert.strictEqual(mdModel.length, 1);
        mdModel.webviewMatches.push({
          index: 0,
          searchPreviewInfo: {
            line: "",
            range: {
              start: 0,
              end: 0
            }
          }
        }, {
          index: 1,
          searchPreviewInfo: {
            line: "",
            range: {
              start: 0,
              end: 0
            }
          }
        });
        assert.strictEqual(mdModel.length, 3);
        assert.strictEqual(mdModel.getMatch(0), mdModel.contentMatches[0]);
        assert.strictEqual(mdModel.getMatch(1), mdModel.webviewMatches[0]);
        assert.strictEqual(mdModel.getMatch(2), mdModel.webviewMatches[1]);
      }
    );
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXG5vdGVib29rXFx0ZXN0XFxicm93c2VyXFxjb250cmliXFxmaW5kLnRlc3QudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgYXNzZXJ0IGZyb20gJ2Fzc2VydCc7XG5pbXBvcnQgeyBSYW5nZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vY29yZS9yYW5nZS5qcyc7XG5pbXBvcnQgeyBGaW5kTWF0Y2gsIElUZXh0QnVmZmVyLCBWYWxpZEFubm90YXRlZEVkaXRPcGVyYXRpb24gfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL21vZGVsLmpzJztcbmltcG9ydCB7IFVTVUFMX1dPUkRfU0VQQVJBVE9SUyB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vY29yZS93b3JkSGVscGVyLmpzJztcbmltcG9ydCB7IElMYW5ndWFnZVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL2xhbmd1YWdlcy9sYW5ndWFnZS5qcyc7XG5pbXBvcnQgeyBGaW5kUmVwbGFjZVN0YXRlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vZWRpdG9yL2NvbnRyaWIvZmluZC9icm93c2VyL2ZpbmRTdGF0ZS5qcyc7XG5pbXBvcnQgeyBJQ29uZmlndXJhdGlvblNlcnZpY2UsIElDb25maWd1cmF0aW9uVmFsdWUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb25maWd1cmF0aW9uL2NvbW1vbi9jb25maWd1cmF0aW9uLmpzJztcbmltcG9ydCB7IFRlc3RDb25maWd1cmF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbmZpZ3VyYXRpb24vdGVzdC9jb21tb24vdGVzdENvbmZpZ3VyYXRpb25TZXJ2aWNlLmpzJztcbmltcG9ydCB7IE5vdGVib29rRmluZEZpbHRlcnMgfSBmcm9tICcuLi8uLi8uLi9icm93c2VyL2NvbnRyaWIvZmluZC9maW5kRmlsdGVycy5qcyc7XG5pbXBvcnQgeyBDZWxsRmluZE1hdGNoTW9kZWwsIEZpbmRNb2RlbCB9IGZyb20gJy4uLy4uLy4uL2Jyb3dzZXIvY29udHJpYi9maW5kL2ZpbmRNb2RlbC5qcyc7XG5pbXBvcnQgeyBJQWN0aXZlTm90ZWJvb2tFZGl0b3IsIElDZWxsTW9kZWxEZWNvcmF0aW9ucywgSUNlbGxNb2RlbERlbHRhRGVjb3JhdGlvbnMgfSBmcm9tICcuLi8uLi8uLi9icm93c2VyL25vdGVib29rQnJvd3Nlci5qcyc7XG5pbXBvcnQgeyBOb3RlYm9va1ZpZXdNb2RlbCB9IGZyb20gJy4uLy4uLy4uL2Jyb3dzZXIvdmlld01vZGVsL25vdGVib29rVmlld01vZGVsSW1wbC5qcyc7XG5pbXBvcnQgeyBDZWxsRWRpdFR5cGUsIENlbGxLaW5kIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL25vdGVib29rQ29tbW9uLmpzJztcbmltcG9ydCB7IFRlc3RDZWxsLCB3aXRoVGVzdE5vdGVib29rIH0gZnJvbSAnLi4vdGVzdE5vdGVib29rRWRpdG9yLmpzJztcbmltcG9ydCB7IGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvdGVzdC9jb21tb24vdXRpbHMuanMnO1xuXG5zdWl0ZSgnTm90ZWJvb2sgRmluZCcsICgpID0+IHtcblx0Y29uc3QgZGlzcG9zYWJsZXMgPSBlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUoKTtcblxuXHRjb25zdCBjb25maWd1cmF0aW9uVmFsdWU6IElDb25maWd1cmF0aW9uVmFsdWU8YW55PiA9IHtcblx0XHR2YWx1ZTogVVNVQUxfV09SRF9TRVBBUkFUT1JTXG5cdH07XG5cdGNvbnN0IGNvbmZpZ3VyYXRpb25TZXJ2aWNlID0gbmV3IGNsYXNzIGV4dGVuZHMgVGVzdENvbmZpZ3VyYXRpb25TZXJ2aWNlIHtcblx0XHRvdmVycmlkZSBpbnNwZWN0KCkge1xuXHRcdFx0cmV0dXJuIGNvbmZpZ3VyYXRpb25WYWx1ZTtcblx0XHR9XG5cdH0oKTtcblxuXHRjb25zdCBzZXR1cEVkaXRvckZvclRlc3QgPSAoZWRpdG9yOiBJQWN0aXZlTm90ZWJvb2tFZGl0b3IsIHZpZXdNb2RlbDogTm90ZWJvb2tWaWV3TW9kZWwpID0+IHtcblx0XHRlZGl0b3IuY2hhbmdlTW9kZWxEZWNvcmF0aW9ucyA9IChjYWxsYmFjaykgPT4ge1xuXHRcdFx0cmV0dXJuIGNhbGxiYWNrKHtcblx0XHRcdFx0ZGVsdGFEZWNvcmF0aW9uczogKG9sZERlY29yYXRpb25zOiBJQ2VsbE1vZGVsRGVjb3JhdGlvbnNbXSwgbmV3RGVjb3JhdGlvbnM6IElDZWxsTW9kZWxEZWx0YURlY29yYXRpb25zW10pID0+IHtcblx0XHRcdFx0XHRjb25zdCByZXQ6IElDZWxsTW9kZWxEZWNvcmF0aW9uc1tdID0gW107XG5cdFx0XHRcdFx0bmV3RGVjb3JhdGlvbnMuZm9yRWFjaChkZWMgPT4ge1xuXHRcdFx0XHRcdFx0Y29uc3QgY2VsbCA9IHZpZXdNb2RlbC52aWV3Q2VsbHMuZmluZChjZWxsID0+IGNlbGwuaGFuZGxlID09PSBkZWMub3duZXJJZCk7XG5cdFx0XHRcdFx0XHRjb25zdCBkZWNvcmF0aW9ucyA9IGNlbGw/LmRlbHRhTW9kZWxEZWNvcmF0aW9ucyhbXSwgZGVjLmRlY29yYXRpb25zKSA/PyBbXTtcblxuXHRcdFx0XHRcdFx0aWYgKGRlY29yYXRpb25zLmxlbmd0aCA+IDApIHtcblx0XHRcdFx0XHRcdFx0cmV0LnB1c2goeyBvd25lcklkOiBkZWMub3duZXJJZCwgZGVjb3JhdGlvbnM6IGRlY29yYXRpb25zIH0pO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH0pO1xuXG5cdFx0XHRcdFx0cmV0dXJuIHJldDtcblx0XHRcdFx0fVxuXHRcdFx0fSk7XG5cdFx0fTtcblx0fTtcblxuXHR0ZXN0KCdVcGRhdGUgZmluZCBtYXRjaGVzIGJhc2ljcycsIGFzeW5jIGZ1bmN0aW9uICgpIHtcblx0XHRhd2FpdCB3aXRoVGVzdE5vdGVib29rKFxuXHRcdFx0W1xuXHRcdFx0XHRbJyMgaGVhZGVyIDEnLCAnbWFya2Rvd24nLCBDZWxsS2luZC5NYXJrdXAsIFtdLCB7fV0sXG5cdFx0XHRcdFsncGFyYWdyYXBoIDEnLCAnbWFya2Rvd24nLCBDZWxsS2luZC5NYXJrdXAsIFtdLCB7fV0sXG5cdFx0XHRcdFsncGFyYWdyYXBoIDInLCAnbWFya2Rvd24nLCBDZWxsS2luZC5NYXJrdXAsIFtdLCB7fV0sXG5cdFx0XHRdLFxuXHRcdFx0YXN5bmMgKGVkaXRvciwgdmlld01vZGVsLCBfZHMsIGFjY2Vzc29yKSA9PiB7XG5cdFx0XHRcdGFjY2Vzc29yLnN0dWIoSUNvbmZpZ3VyYXRpb25TZXJ2aWNlLCBjb25maWd1cmF0aW9uU2VydmljZSk7XG5cdFx0XHRcdGNvbnN0IHN0YXRlID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBGaW5kUmVwbGFjZVN0YXRlPE5vdGVib29rRmluZEZpbHRlcnM+KCkpO1xuXHRcdFx0XHRjb25zdCBtb2RlbCA9IGRpc3Bvc2FibGVzLmFkZChuZXcgRmluZE1vZGVsKGVkaXRvciwgc3RhdGUsIGFjY2Vzc29yLmdldChJQ29uZmlndXJhdGlvblNlcnZpY2UpKSk7XG5cblx0XHRcdFx0Y29uc3QgZm91bmQgPSBuZXcgUHJvbWlzZTxib29sZWFuPihyZXNvbHZlID0+IGRpc3Bvc2FibGVzLmFkZChzdGF0ZS5vbkZpbmRSZXBsYWNlU3RhdGVDaGFuZ2UoZSA9PiB7XG5cdFx0XHRcdFx0aWYgKGUubWF0Y2hlc0NvdW50KSB7IHJlc29sdmUodHJ1ZSk7IH1cblx0XHRcdFx0fSkpKTtcblx0XHRcdFx0c3RhdGUuY2hhbmdlKHsgaXNSZXZlYWxlZDogdHJ1ZSB9LCB0cnVlKTtcblx0XHRcdFx0c3RhdGUuY2hhbmdlKHsgc2VhcmNoU3RyaW5nOiAnMScgfSwgdHJ1ZSk7XG5cdFx0XHRcdGF3YWl0IGZvdW5kO1xuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobW9kZWwuZmluZE1hdGNoZXMubGVuZ3RoLCAyKTtcblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1vZGVsLmN1cnJlbnRNYXRjaCwgMCk7XG5cdFx0XHRcdG1vZGVsLmZpbmQoeyBwcmV2aW91czogZmFsc2UgfSk7XG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChtb2RlbC5jdXJyZW50TWF0Y2gsIDEpO1xuXHRcdFx0XHRtb2RlbC5maW5kKHsgcHJldmlvdXM6IGZhbHNlIH0pO1xuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobW9kZWwuY3VycmVudE1hdGNoLCAwKTtcblx0XHRcdFx0bW9kZWwuZmluZCh7IHByZXZpb3VzOiBmYWxzZSB9KTtcblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1vZGVsLmN1cnJlbnRNYXRjaCwgMSk7XG5cblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGVkaXRvci50ZXh0TW9kZWwubGVuZ3RoLCAzKTtcblxuXHRcdFx0XHRjb25zdCBmb3VuZDIgPSBuZXcgUHJvbWlzZTxib29sZWFuPihyZXNvbHZlID0+IGRpc3Bvc2FibGVzLmFkZChzdGF0ZS5vbkZpbmRSZXBsYWNlU3RhdGVDaGFuZ2UoZSA9PiB7XG5cdFx0XHRcdFx0aWYgKGUubWF0Y2hlc0NvdW50KSB7IHJlc29sdmUodHJ1ZSk7IH1cblx0XHRcdFx0fSkpKTtcblx0XHRcdFx0ZWRpdG9yLnRleHRNb2RlbC5hcHBseUVkaXRzKFt7XG5cdFx0XHRcdFx0ZWRpdFR5cGU6IENlbGxFZGl0VHlwZS5SZXBsYWNlLCBpbmRleDogMywgY291bnQ6IDAsIGNlbGxzOiBbXG5cdFx0XHRcdFx0XHRkaXNwb3NhYmxlcy5hZGQobmV3IFRlc3RDZWxsKHZpZXdNb2RlbC52aWV3VHlwZSwgMywgJyMgbmV4dCBwYXJhZ3JhcGggMScsICdtYXJrZG93bicsIENlbGxLaW5kLkNvZGUsIFtdLCBhY2Nlc3Nvci5nZXQoSUxhbmd1YWdlU2VydmljZSkpKSxcblx0XHRcdFx0XHRdXG5cdFx0XHRcdH1dLCB0cnVlLCB1bmRlZmluZWQsICgpID0+IHVuZGVmaW5lZCwgdW5kZWZpbmVkLCB0cnVlKTtcblx0XHRcdFx0YXdhaXQgZm91bmQyO1xuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZWRpdG9yLnRleHRNb2RlbC5sZW5ndGgsIDQpO1xuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobW9kZWwuZmluZE1hdGNoZXMubGVuZ3RoLCAzKTtcblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1vZGVsLmN1cnJlbnRNYXRjaCwgMSk7XG5cdFx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnVXBkYXRlIGZpbmQgbWF0Y2hlcyBiYXNpY3MgMicsIGFzeW5jIGZ1bmN0aW9uICgpIHtcblx0XHRhd2FpdCB3aXRoVGVzdE5vdGVib29rKFxuXHRcdFx0W1xuXHRcdFx0XHRbJyMgaGVhZGVyIDEnLCAnbWFya2Rvd24nLCBDZWxsS2luZC5NYXJrdXAsIFtdLCB7fV0sXG5cdFx0XHRcdFsncGFyYWdyYXBoIDEuMScsICdtYXJrZG93bicsIENlbGxLaW5kLk1hcmt1cCwgW10sIHt9XSxcblx0XHRcdFx0WydwYXJhZ3JhcGggMS4yJywgJ21hcmtkb3duJywgQ2VsbEtpbmQuTWFya3VwLCBbXSwge31dLFxuXHRcdFx0XHRbJ3BhcmFncmFwaCAxLjMnLCAnbWFya2Rvd24nLCBDZWxsS2luZC5NYXJrdXAsIFtdLCB7fV0sXG5cdFx0XHRcdFsncGFyYWdyYXBoIDInLCAnbWFya2Rvd24nLCBDZWxsS2luZC5NYXJrdXAsIFtdLCB7fV0sXG5cdFx0XHRdLFxuXHRcdFx0YXN5bmMgKGVkaXRvciwgdmlld01vZGVsLCBfZHMsIGFjY2Vzc29yKSA9PiB7XG5cdFx0XHRcdHNldHVwRWRpdG9yRm9yVGVzdChlZGl0b3IsIHZpZXdNb2RlbCk7XG5cdFx0XHRcdGFjY2Vzc29yLnN0dWIoSUNvbmZpZ3VyYXRpb25TZXJ2aWNlLCBjb25maWd1cmF0aW9uU2VydmljZSk7XG5cdFx0XHRcdGNvbnN0IHN0YXRlID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBGaW5kUmVwbGFjZVN0YXRlPE5vdGVib29rRmluZEZpbHRlcnM+KCkpO1xuXHRcdFx0XHRjb25zdCBtb2RlbCA9IGRpc3Bvc2FibGVzLmFkZChuZXcgRmluZE1vZGVsKGVkaXRvciwgc3RhdGUsIGFjY2Vzc29yLmdldChJQ29uZmlndXJhdGlvblNlcnZpY2UpKSk7XG5cdFx0XHRcdGNvbnN0IGZvdW5kID0gbmV3IFByb21pc2U8Ym9vbGVhbj4ocmVzb2x2ZSA9PiBkaXNwb3NhYmxlcy5hZGQoc3RhdGUub25GaW5kUmVwbGFjZVN0YXRlQ2hhbmdlKGUgPT4ge1xuXHRcdFx0XHRcdGlmIChlLm1hdGNoZXNDb3VudCkgeyByZXNvbHZlKHRydWUpOyB9XG5cdFx0XHRcdH0pKSk7XG5cdFx0XHRcdHN0YXRlLmNoYW5nZSh7IGlzUmV2ZWFsZWQ6IHRydWUgfSwgdHJ1ZSk7XG5cdFx0XHRcdHN0YXRlLmNoYW5nZSh7IHNlYXJjaFN0cmluZzogJzEnIH0sIHRydWUpO1xuXHRcdFx0XHRhd2FpdCBmb3VuZDtcblx0XHRcdFx0Ly8gZmluZCBtYXRjaGVzIGlzIG5vdCBuZWNlc3NhcmlseSBmaW5kIHJlc3VsdHNcblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1vZGVsLmZpbmRNYXRjaGVzLmxlbmd0aCwgNCk7XG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChtb2RlbC5jdXJyZW50TWF0Y2gsIDApO1xuXHRcdFx0XHRtb2RlbC5maW5kKHsgcHJldmlvdXM6IGZhbHNlIH0pO1xuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobW9kZWwuY3VycmVudE1hdGNoLCAxKTtcblx0XHRcdFx0bW9kZWwuZmluZCh7IHByZXZpb3VzOiBmYWxzZSB9KTtcblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1vZGVsLmN1cnJlbnRNYXRjaCwgMik7XG5cdFx0XHRcdG1vZGVsLmZpbmQoeyBwcmV2aW91czogZmFsc2UgfSk7XG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChtb2RlbC5jdXJyZW50TWF0Y2gsIDMpO1xuXG5cdFx0XHRcdGNvbnN0IGZvdW5kMiA9IG5ldyBQcm9taXNlPGJvb2xlYW4+KHJlc29sdmUgPT4gZGlzcG9zYWJsZXMuYWRkKHN0YXRlLm9uRmluZFJlcGxhY2VTdGF0ZUNoYW5nZShlID0+IHtcblx0XHRcdFx0XHRpZiAoZS5tYXRjaGVzQ291bnQpIHsgcmVzb2x2ZSh0cnVlKTsgfVxuXHRcdFx0XHR9KSkpO1xuXHRcdFx0XHRlZGl0b3IudGV4dE1vZGVsLmFwcGx5RWRpdHMoW3tcblx0XHRcdFx0XHRlZGl0VHlwZTogQ2VsbEVkaXRUeXBlLlJlcGxhY2UsIGluZGV4OiAyLCBjb3VudDogMSwgY2VsbHM6IFtdXG5cdFx0XHRcdH1dLCB0cnVlLCB1bmRlZmluZWQsICgpID0+IHVuZGVmaW5lZCwgdW5kZWZpbmVkLCB0cnVlKTtcblx0XHRcdFx0YXdhaXQgZm91bmQyO1xuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobW9kZWwuZmluZE1hdGNoZXMubGVuZ3RoLCAzKTtcblxuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobW9kZWwuY3VycmVudE1hdGNoLCAwKTtcblx0XHRcdFx0bW9kZWwuZmluZCh7IHByZXZpb3VzOiB0cnVlIH0pO1xuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobW9kZWwuY3VycmVudE1hdGNoLCAzKTtcblx0XHRcdFx0bW9kZWwuZmluZCh7IHByZXZpb3VzOiBmYWxzZSB9KTtcblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1vZGVsLmN1cnJlbnRNYXRjaCwgMCk7XG5cdFx0XHRcdG1vZGVsLmZpbmQoeyBwcmV2aW91czogZmFsc2UgfSk7XG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChtb2RlbC5jdXJyZW50TWF0Y2gsIDEpO1xuXHRcdFx0XHRtb2RlbC5maW5kKHsgcHJldmlvdXM6IGZhbHNlIH0pO1xuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobW9kZWwuY3VycmVudE1hdGNoLCAyKTtcblx0XHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdVcGRhdGUgZmluZCBtYXRjaGVzIGJhc2ljcyAzJywgYXN5bmMgZnVuY3Rpb24gKCkge1xuXHRcdGF3YWl0IHdpdGhUZXN0Tm90ZWJvb2soXG5cdFx0XHRbXG5cdFx0XHRcdFsnIyBoZWFkZXIgMScsICdtYXJrZG93bicsIENlbGxLaW5kLk1hcmt1cCwgW10sIHt9XSxcblx0XHRcdFx0WydwYXJhZ3JhcGggMS4xJywgJ21hcmtkb3duJywgQ2VsbEtpbmQuTWFya3VwLCBbXSwge31dLFxuXHRcdFx0XHRbJ3BhcmFncmFwaCAxLjInLCAnbWFya2Rvd24nLCBDZWxsS2luZC5NYXJrdXAsIFtdLCB7fV0sXG5cdFx0XHRcdFsncGFyYWdyYXBoIDEuMycsICdtYXJrZG93bicsIENlbGxLaW5kLk1hcmt1cCwgW10sIHt9XSxcblx0XHRcdFx0WydwYXJhZ3JhcGggMicsICdtYXJrZG93bicsIENlbGxLaW5kLk1hcmt1cCwgW10sIHt9XSxcblx0XHRcdF0sXG5cdFx0XHRhc3luYyAoZWRpdG9yLCB2aWV3TW9kZWwsIF9kcywgYWNjZXNzb3IpID0+IHtcblx0XHRcdFx0c2V0dXBFZGl0b3JGb3JUZXN0KGVkaXRvciwgdmlld01vZGVsKTtcblx0XHRcdFx0YWNjZXNzb3Iuc3R1YihJQ29uZmlndXJhdGlvblNlcnZpY2UsIGNvbmZpZ3VyYXRpb25TZXJ2aWNlKTtcblx0XHRcdFx0Y29uc3Qgc3RhdGUgPSBkaXNwb3NhYmxlcy5hZGQobmV3IEZpbmRSZXBsYWNlU3RhdGU8Tm90ZWJvb2tGaW5kRmlsdGVycz4oKSk7XG5cdFx0XHRcdGNvbnN0IG1vZGVsID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBGaW5kTW9kZWwoZWRpdG9yLCBzdGF0ZSwgYWNjZXNzb3IuZ2V0KElDb25maWd1cmF0aW9uU2VydmljZSkpKTtcblx0XHRcdFx0Y29uc3QgZm91bmQgPSBuZXcgUHJvbWlzZTxib29sZWFuPihyZXNvbHZlID0+IGRpc3Bvc2FibGVzLmFkZChzdGF0ZS5vbkZpbmRSZXBsYWNlU3RhdGVDaGFuZ2UoZSA9PiB7XG5cdFx0XHRcdFx0aWYgKGUubWF0Y2hlc0NvdW50KSB7IHJlc29sdmUodHJ1ZSk7IH1cblx0XHRcdFx0fSkpKTtcblx0XHRcdFx0c3RhdGUuY2hhbmdlKHsgaXNSZXZlYWxlZDogdHJ1ZSB9LCB0cnVlKTtcblx0XHRcdFx0c3RhdGUuY2hhbmdlKHsgc2VhcmNoU3RyaW5nOiAnMScgfSwgdHJ1ZSk7XG5cdFx0XHRcdGF3YWl0IGZvdW5kO1xuXHRcdFx0XHQvLyBmaW5kIG1hdGNoZXMgaXMgbm90IG5lY2Vzc2FyaWx5IGZpbmQgcmVzdWx0c1xuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobW9kZWwuZmluZE1hdGNoZXMubGVuZ3RoLCA0KTtcblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1vZGVsLmN1cnJlbnRNYXRjaCwgMCk7XG5cdFx0XHRcdG1vZGVsLmZpbmQoeyBwcmV2aW91czogdHJ1ZSB9KTtcblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1vZGVsLmN1cnJlbnRNYXRjaCwgNCk7XG5cblx0XHRcdFx0Y29uc3QgZm91bmQyID0gbmV3IFByb21pc2U8Ym9vbGVhbj4ocmVzb2x2ZSA9PiBkaXNwb3NhYmxlcy5hZGQoc3RhdGUub25GaW5kUmVwbGFjZVN0YXRlQ2hhbmdlKGUgPT4ge1xuXHRcdFx0XHRcdGlmIChlLm1hdGNoZXNDb3VudCkgeyByZXNvbHZlKHRydWUpOyB9XG5cdFx0XHRcdH0pKSk7XG5cdFx0XHRcdGVkaXRvci50ZXh0TW9kZWwuYXBwbHlFZGl0cyhbe1xuXHRcdFx0XHRcdGVkaXRUeXBlOiBDZWxsRWRpdFR5cGUuUmVwbGFjZSwgaW5kZXg6IDIsIGNvdW50OiAxLCBjZWxsczogW11cblx0XHRcdFx0fV0sIHRydWUsIHVuZGVmaW5lZCwgKCkgPT4gdW5kZWZpbmVkLCB1bmRlZmluZWQsIHRydWUpO1xuXHRcdFx0XHRhd2FpdCBmb3VuZDI7XG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChtb2RlbC5maW5kTWF0Y2hlcy5sZW5ndGgsIDMpO1xuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobW9kZWwuY3VycmVudE1hdGNoLCAwKTtcblx0XHRcdFx0bW9kZWwuZmluZCh7IHByZXZpb3VzOiB0cnVlIH0pO1xuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobW9kZWwuY3VycmVudE1hdGNoLCAzKTtcblx0XHRcdFx0bW9kZWwuZmluZCh7IHByZXZpb3VzOiB0cnVlIH0pO1xuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobW9kZWwuY3VycmVudE1hdGNoLCAyKTtcblx0XHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdVcGRhdGUgZmluZCBtYXRjaGVzLCAjMTEyNzQ4JywgYXN5bmMgZnVuY3Rpb24gKCkge1xuXHRcdGF3YWl0IHdpdGhUZXN0Tm90ZWJvb2soXG5cdFx0XHRbXG5cdFx0XHRcdFsnIyBoZWFkZXIgMScsICdtYXJrZG93bicsIENlbGxLaW5kLk1hcmt1cCwgW10sIHt9XSxcblx0XHRcdFx0WydwYXJhZ3JhcGggMS4xJywgJ21hcmtkb3duJywgQ2VsbEtpbmQuTWFya3VwLCBbXSwge31dLFxuXHRcdFx0XHRbJ3BhcmFncmFwaCAxLjInLCAnbWFya2Rvd24nLCBDZWxsS2luZC5NYXJrdXAsIFtdLCB7fV0sXG5cdFx0XHRcdFsncGFyYWdyYXBoIDEuMycsICdtYXJrZG93bicsIENlbGxLaW5kLk1hcmt1cCwgW10sIHt9XSxcblx0XHRcdFx0WydwYXJhZ3JhcGggMicsICdtYXJrZG93bicsIENlbGxLaW5kLk1hcmt1cCwgW10sIHt9XSxcblx0XHRcdF0sXG5cdFx0XHRhc3luYyAoZWRpdG9yLCB2aWV3TW9kZWwsIF9kcywgYWNjZXNzb3IpID0+IHtcblx0XHRcdFx0c2V0dXBFZGl0b3JGb3JUZXN0KGVkaXRvciwgdmlld01vZGVsKTtcblx0XHRcdFx0YWNjZXNzb3Iuc3R1YihJQ29uZmlndXJhdGlvblNlcnZpY2UsIGNvbmZpZ3VyYXRpb25TZXJ2aWNlKTtcblx0XHRcdFx0Y29uc3Qgc3RhdGUgPSBkaXNwb3NhYmxlcy5hZGQobmV3IEZpbmRSZXBsYWNlU3RhdGU8Tm90ZWJvb2tGaW5kRmlsdGVycz4oKSk7XG5cdFx0XHRcdGNvbnN0IG1vZGVsID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBGaW5kTW9kZWwoZWRpdG9yLCBzdGF0ZSwgYWNjZXNzb3IuZ2V0KElDb25maWd1cmF0aW9uU2VydmljZSkpKTtcblx0XHRcdFx0Y29uc3QgZm91bmQgPSBuZXcgUHJvbWlzZTxib29sZWFuPihyZXNvbHZlID0+IGRpc3Bvc2FibGVzLmFkZChzdGF0ZS5vbkZpbmRSZXBsYWNlU3RhdGVDaGFuZ2UoZSA9PiB7XG5cdFx0XHRcdFx0aWYgKGUubWF0Y2hlc0NvdW50KSB7IHJlc29sdmUodHJ1ZSk7IH1cblx0XHRcdFx0fSkpKTtcblx0XHRcdFx0c3RhdGUuY2hhbmdlKHsgaXNSZXZlYWxlZDogdHJ1ZSB9LCB0cnVlKTtcblx0XHRcdFx0c3RhdGUuY2hhbmdlKHsgc2VhcmNoU3RyaW5nOiAnMScgfSwgdHJ1ZSk7XG5cdFx0XHRcdGF3YWl0IGZvdW5kO1xuXHRcdFx0XHQvLyBmaW5kIG1hdGNoZXMgaXMgbm90IG5lY2Vzc2FyaWx5IGZpbmQgcmVzdWx0c1xuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobW9kZWwuZmluZE1hdGNoZXMubGVuZ3RoLCA0KTtcblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1vZGVsLmN1cnJlbnRNYXRjaCwgMCk7XG5cdFx0XHRcdG1vZGVsLmZpbmQoeyBwcmV2aW91czogZmFsc2UgfSk7XG5cdFx0XHRcdG1vZGVsLmZpbmQoeyBwcmV2aW91czogZmFsc2UgfSk7XG5cdFx0XHRcdG1vZGVsLmZpbmQoeyBwcmV2aW91czogZmFsc2UgfSk7XG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChtb2RlbC5jdXJyZW50TWF0Y2gsIDMpO1xuXHRcdFx0XHRjb25zdCBmb3VuZDIgPSBuZXcgUHJvbWlzZTxib29sZWFuPihyZXNvbHZlID0+IGRpc3Bvc2FibGVzLmFkZChzdGF0ZS5vbkZpbmRSZXBsYWNlU3RhdGVDaGFuZ2UoZSA9PiB7XG5cdFx0XHRcdFx0aWYgKGUubWF0Y2hlc0NvdW50KSB7IHJlc29sdmUodHJ1ZSk7IH1cblx0XHRcdFx0fSkpKTtcblx0XHRcdFx0KHZpZXdNb2RlbC52aWV3Q2VsbHNbMV0udGV4dEJ1ZmZlciBhcyBJVGV4dEJ1ZmZlcikuYXBwbHlFZGl0cyhbXG5cdFx0XHRcdFx0bmV3IFZhbGlkQW5ub3RhdGVkRWRpdE9wZXJhdGlvbihudWxsLCBuZXcgUmFuZ2UoMSwgMSwgMSwgMTQpLCAnJywgZmFsc2UsIGZhbHNlLCBmYWxzZSlcblx0XHRcdFx0XSwgZmFsc2UsIHRydWUpO1xuXHRcdFx0XHQvLyBjZWxsIGNvbnRlbnQgdXBkYXRlcywgcmVjb21wdXRlXG5cdFx0XHRcdG1vZGVsLnJlc2VhcmNoKCk7XG5cdFx0XHRcdGF3YWl0IGZvdW5kMjtcblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1vZGVsLmN1cnJlbnRNYXRjaCwgMSk7XG5cdFx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnUmVzZXQgd2hlbiBtYXRjaCBub3QgZm91bmQsICMxMjcxOTgnLCBhc3luYyBmdW5jdGlvbiAoKSB7XG5cdFx0YXdhaXQgd2l0aFRlc3ROb3RlYm9vayhcblx0XHRcdFtcblx0XHRcdFx0WycjIGhlYWRlciAxJywgJ21hcmtkb3duJywgQ2VsbEtpbmQuTWFya3VwLCBbXSwge31dLFxuXHRcdFx0XHRbJ3BhcmFncmFwaCAxJywgJ21hcmtkb3duJywgQ2VsbEtpbmQuTWFya3VwLCBbXSwge31dLFxuXHRcdFx0XHRbJ3BhcmFncmFwaCAyJywgJ21hcmtkb3duJywgQ2VsbEtpbmQuTWFya3VwLCBbXSwge31dLFxuXHRcdFx0XSxcblx0XHRcdGFzeW5jIChlZGl0b3IsIHZpZXdNb2RlbCwgX2RzLCBhY2Nlc3NvcikgPT4ge1xuXHRcdFx0XHRhY2Nlc3Nvci5zdHViKElDb25maWd1cmF0aW9uU2VydmljZSwgY29uZmlndXJhdGlvblNlcnZpY2UpO1xuXHRcdFx0XHRjb25zdCBzdGF0ZSA9IGRpc3Bvc2FibGVzLmFkZChuZXcgRmluZFJlcGxhY2VTdGF0ZTxOb3RlYm9va0ZpbmRGaWx0ZXJzPigpKTtcblx0XHRcdFx0Y29uc3QgbW9kZWwgPSBkaXNwb3NhYmxlcy5hZGQobmV3IEZpbmRNb2RlbChlZGl0b3IsIHN0YXRlLCBhY2Nlc3Nvci5nZXQoSUNvbmZpZ3VyYXRpb25TZXJ2aWNlKSkpO1xuXHRcdFx0XHRjb25zdCBmb3VuZCA9IG5ldyBQcm9taXNlPGJvb2xlYW4+KHJlc29sdmUgPT4gZGlzcG9zYWJsZXMuYWRkKHN0YXRlLm9uRmluZFJlcGxhY2VTdGF0ZUNoYW5nZShlID0+IHtcblx0XHRcdFx0XHRpZiAoZS5tYXRjaGVzQ291bnQpIHsgcmVzb2x2ZSh0cnVlKTsgfVxuXHRcdFx0XHR9KSkpO1xuXHRcdFx0XHRzdGF0ZS5jaGFuZ2UoeyBpc1JldmVhbGVkOiB0cnVlIH0sIHRydWUpO1xuXHRcdFx0XHRzdGF0ZS5jaGFuZ2UoeyBzZWFyY2hTdHJpbmc6ICcxJyB9LCB0cnVlKTtcblx0XHRcdFx0YXdhaXQgZm91bmQ7XG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChtb2RlbC5maW5kTWF0Y2hlcy5sZW5ndGgsIDIpO1xuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobW9kZWwuY3VycmVudE1hdGNoLCAwKTtcblx0XHRcdFx0bW9kZWwuZmluZCh7IHByZXZpb3VzOiBmYWxzZSB9KTtcblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1vZGVsLmN1cnJlbnRNYXRjaCwgMSk7XG5cdFx0XHRcdG1vZGVsLmZpbmQoeyBwcmV2aW91czogZmFsc2UgfSk7XG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChtb2RlbC5jdXJyZW50TWF0Y2gsIDApO1xuXHRcdFx0XHRtb2RlbC5maW5kKHsgcHJldmlvdXM6IGZhbHNlIH0pO1xuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobW9kZWwuY3VycmVudE1hdGNoLCAxKTtcblxuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZWRpdG9yLnRleHRNb2RlbC5sZW5ndGgsIDMpO1xuXG5cdFx0XHRcdGNvbnN0IGZvdW5kMiA9IG5ldyBQcm9taXNlPGJvb2xlYW4+KHJlc29sdmUgPT4gZGlzcG9zYWJsZXMuYWRkKHN0YXRlLm9uRmluZFJlcGxhY2VTdGF0ZUNoYW5nZShlID0+IHtcblx0XHRcdFx0XHRpZiAoZS5tYXRjaGVzQ291bnQpIHsgcmVzb2x2ZSh0cnVlKTsgfVxuXHRcdFx0XHR9KSkpO1xuXHRcdFx0XHRzdGF0ZS5jaGFuZ2UoeyBzZWFyY2hTdHJpbmc6ICczJyB9LCB0cnVlKTtcblx0XHRcdFx0YXdhaXQgZm91bmQyO1xuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobW9kZWwuY3VycmVudE1hdGNoLCAtMSk7XG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChtb2RlbC5maW5kTWF0Y2hlcy5sZW5ndGgsIDApO1xuXHRcdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ0NlbGxGaW5kTWF0Y2hNb2RlbCcsIGFzeW5jIGZ1bmN0aW9uICgpIHtcblx0XHRhd2FpdCB3aXRoVGVzdE5vdGVib29rKFxuXHRcdFx0W1xuXHRcdFx0XHRbJyMgaGVhZGVyIDEnLCAnbWFya2Rvd24nLCBDZWxsS2luZC5NYXJrdXAsIFtdLCB7fV0sXG5cdFx0XHRcdFsncHJpbnQoMSknLCAndHlwZXNjcmlwdCcsIENlbGxLaW5kLkNvZGUsIFtdLCB7fV0sXG5cdFx0XHRdLFxuXHRcdFx0YXN5bmMgKGVkaXRvcikgPT4ge1xuXHRcdFx0XHRjb25zdCBtZENlbGwgPSBlZGl0b3IuY2VsbEF0KDApO1xuXHRcdFx0XHRjb25zdCBtZE1vZGVsID0gbmV3IENlbGxGaW5kTWF0Y2hNb2RlbChtZENlbGwsIDAsIFtdLCBbXSk7XG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChtZE1vZGVsLmxlbmd0aCwgMCk7XG5cblx0XHRcdFx0bWRNb2RlbC5jb250ZW50TWF0Y2hlcy5wdXNoKG5ldyBGaW5kTWF0Y2gobmV3IFJhbmdlKDEsIDEsIDEsIDIpLCBbXSkpO1xuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobWRNb2RlbC5sZW5ndGgsIDEpO1xuXHRcdFx0XHRtZE1vZGVsLndlYnZpZXdNYXRjaGVzLnB1c2goe1xuXHRcdFx0XHRcdGluZGV4OiAwLFxuXHRcdFx0XHRcdHNlYXJjaFByZXZpZXdJbmZvOiB7XG5cdFx0XHRcdFx0XHRsaW5lOiAnJyxcblx0XHRcdFx0XHRcdHJhbmdlOiB7XG5cdFx0XHRcdFx0XHRcdHN0YXJ0OiAwLFxuXHRcdFx0XHRcdFx0XHRlbmQ6IDAsXG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9LCB7XG5cdFx0XHRcdFx0aW5kZXg6IDEsXG5cdFx0XHRcdFx0c2VhcmNoUHJldmlld0luZm86IHtcblx0XHRcdFx0XHRcdGxpbmU6ICcnLFxuXHRcdFx0XHRcdFx0cmFuZ2U6IHtcblx0XHRcdFx0XHRcdFx0c3RhcnQ6IDAsXG5cdFx0XHRcdFx0XHRcdGVuZDogMCxcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHR9XG5cdFx0XHRcdH0pO1xuXG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChtZE1vZGVsLmxlbmd0aCwgMyk7XG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChtZE1vZGVsLmdldE1hdGNoKDApLCBtZE1vZGVsLmNvbnRlbnRNYXRjaGVzWzBdKTtcblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1kTW9kZWwuZ2V0TWF0Y2goMSksIG1kTW9kZWwud2Vidmlld01hdGNoZXNbMF0pO1xuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobWRNb2RlbC5nZXRNYXRjaCgyKSwgbWRNb2RlbC53ZWJ2aWV3TWF0Y2hlc1sxXSk7XG5cdFx0XHR9KTtcblx0fSk7XG59KTtcbiJdLAogICJtYXBwaW5ncyI6ICJBQUtBLE9BQU8sWUFBWTtBQUNuQixTQUFTLGFBQWE7QUFDdEIsU0FBUyxXQUF3QixtQ0FBbUM7QUFDcEUsU0FBUyw2QkFBNkI7QUFDdEMsU0FBUyx3QkFBd0I7QUFDakMsU0FBUyx3QkFBd0I7QUFDakMsU0FBUyw2QkFBa0Q7QUFDM0QsU0FBUyxnQ0FBZ0M7QUFFekMsU0FBUyxvQkFBb0IsaUJBQWlCO0FBRzlDLFNBQVMsY0FBYyxnQkFBZ0I7QUFDdkMsU0FBUyxVQUFVLHdCQUF3QjtBQUMzQyxTQUFTLCtDQUErQztBQUV4RCxNQUFNLGlCQUFpQixNQUFNO0FBQzVCLFFBQU0sY0FBYyx3Q0FBd0M7QUFFNUQsUUFBTSxxQkFBK0M7QUFBQSxJQUNwRCxPQUFPO0FBQUEsRUFDUjtBQUNBLFFBQU0sdUJBQXVCLElBQUksY0FBYyx5QkFBeUI7QUFBQSxJQUM5RCxVQUFVO0FBQ2xCLGFBQU87QUFBQSxJQUNSO0FBQUEsRUFDRCxFQUFFO0FBRUYsUUFBTSxxQkFBcUIsQ0FBQyxRQUErQixjQUFpQztBQUMzRixXQUFPLHlCQUF5QixDQUFDLGFBQWE7QUFDN0MsYUFBTyxTQUFTO0FBQUEsUUFDZixrQkFBa0IsQ0FBQyxnQkFBeUMsbUJBQWlEO0FBQzVHLGdCQUFNLE1BQStCLENBQUM7QUFDdEMseUJBQWUsUUFBUSxTQUFPO0FBQzdCLGtCQUFNLE9BQU8sVUFBVSxVQUFVLEtBQUssQ0FBQUEsVUFBUUEsTUFBSyxXQUFXLElBQUksT0FBTztBQUN6RSxrQkFBTSxjQUFjLE1BQU0sc0JBQXNCLENBQUMsR0FBRyxJQUFJLFdBQVcsS0FB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SSxHQUFHLElBQUk7QUFDeEMsY0FBTTtBQUNOLGVBQU8sWUFBWSxNQUFNLGNBQWMsRUFBRTtBQUN6QyxlQUFPLFlBQVksTUFBTSxZQUFZLFFBQVEsQ0FBQztBQUFBLE1BQy9DO0FBQUEsSUFBQztBQUFBLEVBQ0gsQ0FBQztBQUVELE9BQUssc0JBQXNCLGlCQUFrQjtBQUM1QyxVQUFNO0FBQUEsTUFDTDtBQUFBLFFBQ0MsQ0FBQyxjQUFjLFlBQVksU0FBUyxRQUFRLENBQUMsR0FBRyxDQUFDLENBQUM7QUFBQSxRQUNsRCxDQUFDLFlBQVksY0FBYyxTQUFTLE1BQU0sQ0FBQyxHQUFHLENBQUMsQ0FBQztBQUFBLE1BQ2pEO0FBQUEsTUFDQSxPQUFPLFdBQVc7QUFDakIsY0FBTSxTQUFTLE9BQU8sT0FBTyxDQUFDO0FBQzlCLGNBQU0sVUFBVSxJQUFJLG1CQUFtQixRQUFRLEdBQUcsQ0FBQyxHQUFHLENBQUMsQ0FBQztBQUN4RCxlQUFPLFlBQVksUUFBUSxRQUFRLENBQUM7QUFFcEMsZ0JBQVEsZUFBZSxLQUFLLElBQUksVUFBVSxJQUFJLE1BQU0sR0FBRyxHQUFHLEdBQUcsQ0FBQyxHQUFHLENBQUMsQ0FBQyxDQUFDO0FBQ3BFLGVBQU8sWUFBWSxRQUFRLFFBQVEsQ0FBQztBQUNwQyxnQkFBUSxlQUFlLEtBQUs7QUFBQSxVQUMzQixPQUFPO0FBQUEsVUFDUCxtQkFBbUI7QUFBQSxZQUNsQixNQUFNO0FBQUEsWUFDTixPQUFPO0FBQUEsY0FDTixPQUFPO0FBQUEsY0FDUCxLQUFLO0FBQUEsWUFDTjtBQUFBLFVBQ0Q7QUFBQSxRQUNELEdBQUc7QUFBQSxVQUNGLE9BQU87QUFBQSxVQUNQLG1CQUFtQjtBQUFBLFlBQ2xCLE1BQU07QUFBQSxZQUNOLE9BQU87QUFBQSxjQUNOLE9BQU87QUFBQSxjQUNQLEtBQUs7QUFBQSxZQUNOO0FBQUEsVUFDRDtBQUFBLFFBQ0QsQ0FBQztBQUVELGVBQU8sWUFBWSxRQUFRLFFBQVEsQ0FBQztBQUNwQyxlQUFPLFlBQVksUUFBUSxTQUFTLENBQUMsR0FBRyxRQUFRLGVBQWUsQ0FBQyxDQUFDO0FBQ2pFLGVBQU8sWUFBWSxRQUFRLFNBQVMsQ0FBQyxHQUFHLFFBQVEsZUFBZSxDQUFDLENBQUM7QUFDakUsZUFBTyxZQUFZLFFBQVEsU0FBUyxDQUFDLEdBQUcsUUFBUSxlQUFlLENBQUMsQ0FBQztBQUFBLE1BQ2xFO0FBQUEsSUFBQztBQUFBLEVBQ0gsQ0FBQztBQUNGLENBQUM7IiwKICAibmFtZXMiOiBbImNlbGwiXQp9Cg==
