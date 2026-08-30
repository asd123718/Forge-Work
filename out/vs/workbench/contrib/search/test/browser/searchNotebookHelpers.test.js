import assert from "assert";
import { Range } from "../../../../../editor/common/core/range.js";
import { FindMatch } from "../../../../../editor/common/model.js";
import { QueryType } from "../../../../services/search/common/search.js";
import { CellKind } from "../../../notebook/common/notebookCommon.js";
import { contentMatchesToTextSearchMatches, webviewMatchesToTextSearchMatches } from "../../browser/notebookSearch/searchNotebookHelpers.js";
import { CellFindMatchModel } from "../../../notebook/browser/contrib/find/findModel.js";
import { SearchModelImpl } from "../../browser/searchTreeModel/searchModel.js";
import { URI } from "../../../../../base/common/uri.js";
import { TestInstantiationService } from "../../../../../platform/instantiation/test/common/instantiationServiceMock.js";
import { createFileUriFromPathFromRoot, stubModelService, stubNotebookEditorService } from "./searchTestCommon.js";
import { IModelService } from "../../../../../editor/common/services/model.js";
import { INotebookEditorService } from "../../../notebook/browser/services/notebookEditorService.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../../base/test/common/utils.js";
import { CellMatch, NotebookCompatibleFileMatch, textSearchMatchesToNotebookMatches } from "../../browser/notebookSearch/notebookSearchModel.js";
import { FolderMatchImpl } from "../../browser/searchTreeModel/folderMatch.js";
suite("searchNotebookHelpers", () => {
  let instantiationService;
  let mdCellFindMatch;
  let codeCellFindMatch;
  let mdInputCell;
  let codeCell;
  let markdownContentResults;
  let codeContentResults;
  let codeWebviewResults;
  const store = ensureNoDisposablesAreLeakedInTestSuite();
  let counter = 0;
  setup(() => {
    instantiationService = new TestInstantiationService();
    store.add(instantiationService);
    const modelService = stubModelService(instantiationService, (e) => store.add(e));
    const notebookEditorService = stubNotebookEditorService(instantiationService, (e) => store.add(e));
    instantiationService.stub(IModelService, modelService);
    instantiationService.stub(INotebookEditorService, notebookEditorService);
    mdInputCell = {
      id: "mdCell",
      cellKind: CellKind.Markup,
      textBuffer: {
        getLineContent(lineNumber) {
          if (lineNumber === 1) {
            return "# Hello World Test";
          } else {
            return "";
          }
        }
      }
    };
    const findMatchMds = [new FindMatch(new Range(1, 15, 1, 19), ["Test"])];
    codeCell = {
      id: "codeCell",
      cellKind: CellKind.Code,
      textBuffer: {
        getLineContent(lineNumber) {
          if (lineNumber === 1) {
            return 'print("test! testing!!")';
          } else if (lineNumber === 2) {
            return 'print("this is a Test")';
          } else {
            return "";
          }
        }
      }
    };
    const findMatchCodeCells = [
      new FindMatch(new Range(1, 8, 1, 12), ["test"]),
      new FindMatch(new Range(1, 14, 1, 18), ["test"]),
      new FindMatch(new Range(2, 18, 2, 22), ["Test"])
    ];
    const webviewMatches = [
      {
        index: 0,
        searchPreviewInfo: {
          line: "test! testing!!",
          range: {
            start: 1,
            end: 5
          }
        }
      },
      {
        index: 1,
        searchPreviewInfo: {
          line: "test! testing!!",
          range: {
            start: 7,
            end: 11
          }
        }
      },
      {
        index: 3,
        searchPreviewInfo: {
          line: "this is a Test",
          range: {
            start: 11,
            end: 15
          }
        }
      }
    ];
    mdCellFindMatch = new CellFindMatchModel(
      mdInputCell,
      0,
      findMatchMds,
      []
    );
    codeCellFindMatch = new CellFindMatchModel(
      codeCell,
      5,
      findMatchCodeCells,
      webviewMatches
    );
  });
  teardown(() => {
    instantiationService.dispose();
  });
  suite("notebookEditorMatchesToTextSearchResults", () => {
    function assertRangesEqual(actual, expected) {
      if (!Array.isArray(actual)) {
        actual = [actual];
      }
      assert.strictEqual(actual.length, expected.length);
      actual.forEach((r, i) => {
        const expectedRange = expected[i];
        assert.deepStrictEqual(
          { startLineNumber: r.startLineNumber, startColumn: r.startColumn, endLineNumber: r.endLineNumber, endColumn: r.endColumn },
          { startLineNumber: expectedRange.startLineNumber, startColumn: expectedRange.startColumn, endLineNumber: expectedRange.endLineNumber, endColumn: expectedRange.endColumn }
        );
      });
    }
    test("convert CellFindMatchModel to ITextSearchMatch and check results", () => {
      markdownContentResults = contentMatchesToTextSearchMatches(mdCellFindMatch.contentMatches, mdInputCell);
      codeContentResults = contentMatchesToTextSearchMatches(codeCellFindMatch.contentMatches, codeCell);
      codeWebviewResults = webviewMatchesToTextSearchMatches(codeCellFindMatch.webviewMatches);
      assert.strictEqual(markdownContentResults.length, 1);
      assert.strictEqual(markdownContentResults[0].previewText, "# Hello World Test\n");
      assertRangesEqual(markdownContentResults[0].rangeLocations.map((e) => e.preview), [new Range(0, 14, 0, 18)]);
      assertRangesEqual(markdownContentResults[0].rangeLocations.map((e) => e.source), [new Range(0, 14, 0, 18)]);
      assert.strictEqual(codeContentResults.length, 2);
      assert.strictEqual(codeContentResults[0].previewText, 'print("test! testing!!")\n');
      assert.strictEqual(codeContentResults[1].previewText, 'print("this is a Test")\n');
      assertRangesEqual(codeContentResults[0].rangeLocations.map((e) => e.preview), [new Range(0, 7, 0, 11), new Range(0, 13, 0, 17)]);
      assertRangesEqual(codeContentResults[0].rangeLocations.map((e) => e.source), [new Range(0, 7, 0, 11), new Range(0, 13, 0, 17)]);
      assert.strictEqual(codeWebviewResults.length, 3);
      assert.strictEqual(codeWebviewResults[0].previewText, "test! testing!!");
      assert.strictEqual(codeWebviewResults[1].previewText, "test! testing!!");
      assert.strictEqual(codeWebviewResults[2].previewText, "this is a Test");
      assertRangesEqual(codeWebviewResults[0].rangeLocations.map((e) => e.preview), [new Range(0, 1, 0, 5)]);
      assertRangesEqual(codeWebviewResults[1].rangeLocations.map((e) => e.preview), [new Range(0, 7, 0, 11)]);
      assertRangesEqual(codeWebviewResults[2].rangeLocations.map((e) => e.preview), [new Range(0, 11, 0, 15)]);
      assertRangesEqual(codeWebviewResults[0].rangeLocations.map((e) => e.source), [new Range(0, 1, 0, 5)]);
      assertRangesEqual(codeWebviewResults[1].rangeLocations.map((e) => e.source), [new Range(0, 7, 0, 11)]);
      assertRangesEqual(codeWebviewResults[2].rangeLocations.map((e) => e.source), [new Range(0, 11, 0, 15)]);
    });
    test("convert ITextSearchMatch to MatchInNotebook", () => {
      const mdCellMatch = new CellMatch(aFileMatch(), mdInputCell, 0);
      const markdownCellContentMatchObjs = textSearchMatchesToNotebookMatches(markdownContentResults, mdCellMatch);
      const codeCellMatch = new CellMatch(aFileMatch(), codeCell, 0);
      const codeCellContentMatchObjs = textSearchMatchesToNotebookMatches(codeContentResults, codeCellMatch);
      const codeWebviewContentMatchObjs = textSearchMatchesToNotebookMatches(codeWebviewResults, codeCellMatch);
      assert.strictEqual(markdownCellContentMatchObjs[0].cell?.id, mdCellMatch.id);
      assertRangesEqual(markdownCellContentMatchObjs[0].range(), [new Range(1, 15, 1, 19)]);
      assert.strictEqual(codeCellContentMatchObjs[0].cell?.id, codeCellMatch.id);
      assert.strictEqual(codeCellContentMatchObjs[1].cell?.id, codeCellMatch.id);
      assertRangesEqual(codeCellContentMatchObjs[0].range(), [new Range(1, 8, 1, 12)]);
      assertRangesEqual(codeCellContentMatchObjs[1].range(), [new Range(1, 14, 1, 18)]);
      assertRangesEqual(codeCellContentMatchObjs[2].range(), [new Range(2, 18, 2, 22)]);
      assert.strictEqual(codeWebviewContentMatchObjs[0].cell?.id, codeCellMatch.id);
      assert.strictEqual(codeWebviewContentMatchObjs[1].cell?.id, codeCellMatch.id);
      assert.strictEqual(codeWebviewContentMatchObjs[2].cell?.id, codeCellMatch.id);
      assertRangesEqual(codeWebviewContentMatchObjs[0].range(), [new Range(1, 2, 1, 6)]);
      assertRangesEqual(codeWebviewContentMatchObjs[1].range(), [new Range(1, 8, 1, 12)]);
      assertRangesEqual(codeWebviewContentMatchObjs[2].range(), [new Range(1, 12, 1, 16)]);
    });
    function aFileMatch() {
      const rawMatch = {
        resource: URI.file("somepath" + ++counter),
        results: []
      };
      const searchModel = instantiationService.createInstance(SearchModelImpl);
      store.add(searchModel);
      const folderMatch = instantiationService.createInstance(FolderMatchImpl, URI.file("somepath"), "", 0, {
        type: QueryType.Text,
        folderQueries: [{ folder: createFileUriFromPathFromRoot() }],
        contentPattern: {
          pattern: ""
        }
      }, searchModel.searchResult.plainTextSearchResult, searchModel.searchResult, null);
      const fileMatch = instantiationService.createInstance(NotebookCompatibleFileMatch, {
        pattern: ""
      }, void 0, void 0, folderMatch, rawMatch, null, "");
      fileMatch.createMatches();
      store.add(folderMatch);
      store.add(fileMatch);
      return fileMatch;
    }
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXHNlYXJjaFxcdGVzdFxcYnJvd3Nlclxcc2VhcmNoTm90ZWJvb2tIZWxwZXJzLnRlc3QudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgYXNzZXJ0IGZyb20gJ2Fzc2VydCc7XG5pbXBvcnQgeyBSYW5nZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vY29yZS9yYW5nZS5qcyc7XG5pbXBvcnQgeyBGaW5kTWF0Y2gsIElSZWFkb25seVRleHRCdWZmZXIgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL21vZGVsLmpzJztcbmltcG9ydCB7IElGaWxlTWF0Y2gsIElTZWFyY2hSYW5nZSwgSVRleHRTZWFyY2hNYXRjaCwgUXVlcnlUeXBlIH0gZnJvbSAnLi4vLi4vLi4vLi4vc2VydmljZXMvc2VhcmNoL2NvbW1vbi9zZWFyY2guanMnO1xuaW1wb3J0IHsgSUNlbGxWaWV3TW9kZWwgfSBmcm9tICcuLi8uLi8uLi9ub3RlYm9vay9icm93c2VyL25vdGVib29rQnJvd3Nlci5qcyc7XG5pbXBvcnQgeyBDZWxsS2luZCB9IGZyb20gJy4uLy4uLy4uL25vdGVib29rL2NvbW1vbi9ub3RlYm9va0NvbW1vbi5qcyc7XG5pbXBvcnQgeyBjb250ZW50TWF0Y2hlc1RvVGV4dFNlYXJjaE1hdGNoZXMsIHdlYnZpZXdNYXRjaGVzVG9UZXh0U2VhcmNoTWF0Y2hlcyB9IGZyb20gJy4uLy4uL2Jyb3dzZXIvbm90ZWJvb2tTZWFyY2gvc2VhcmNoTm90ZWJvb2tIZWxwZXJzLmpzJztcbmltcG9ydCB7IENlbGxGaW5kTWF0Y2hNb2RlbCB9IGZyb20gJy4uLy4uLy4uL25vdGVib29rL2Jyb3dzZXIvY29udHJpYi9maW5kL2ZpbmRNb2RlbC5qcyc7XG5pbXBvcnQgeyBTZWFyY2hNb2RlbEltcGwgfSBmcm9tICcuLi8uLi9icm93c2VyL3NlYXJjaFRyZWVNb2RlbC9zZWFyY2hNb2RlbC5qcyc7XG5pbXBvcnQgeyBVUkkgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi91cmkuanMnO1xuaW1wb3J0IHsgVGVzdEluc3RhbnRpYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vaW5zdGFudGlhdGlvbi90ZXN0L2NvbW1vbi9pbnN0YW50aWF0aW9uU2VydmljZU1vY2suanMnO1xuaW1wb3J0IHsgY3JlYXRlRmlsZVVyaUZyb21QYXRoRnJvbVJvb3QsIHN0dWJNb2RlbFNlcnZpY2UsIHN0dWJOb3RlYm9va0VkaXRvclNlcnZpY2UgfSBmcm9tICcuL3NlYXJjaFRlc3RDb21tb24uanMnO1xuaW1wb3J0IHsgSU1vZGVsU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vc2VydmljZXMvbW9kZWwuanMnO1xuaW1wb3J0IHsgSU5vdGVib29rRWRpdG9yU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL25vdGVib29rL2Jyb3dzZXIvc2VydmljZXMvbm90ZWJvb2tFZGl0b3JTZXJ2aWNlLmpzJztcbmltcG9ydCB7IGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvdGVzdC9jb21tb24vdXRpbHMuanMnO1xuaW1wb3J0IHsgQ2VsbE1hdGNoLCBOb3RlYm9va0NvbXBhdGlibGVGaWxlTWF0Y2gsIHRleHRTZWFyY2hNYXRjaGVzVG9Ob3RlYm9va01hdGNoZXMgfSBmcm9tICcuLi8uLi9icm93c2VyL25vdGVib29rU2VhcmNoL25vdGVib29rU2VhcmNoTW9kZWwuanMnO1xuaW1wb3J0IHsgRm9sZGVyTWF0Y2hJbXBsIH0gZnJvbSAnLi4vLi4vYnJvd3Nlci9zZWFyY2hUcmVlTW9kZWwvZm9sZGVyTWF0Y2guanMnO1xuaW1wb3J0IHsgSU5vdGVib29rRmlsZUluc3RhbmNlTWF0Y2ggfSBmcm9tICcuLi8uLi9icm93c2VyL25vdGVib29rU2VhcmNoL25vdGVib29rU2VhcmNoTW9kZWxCYXNlLmpzJztcblxuc3VpdGUoJ3NlYXJjaE5vdGVib29rSGVscGVycycsICgpID0+IHtcblx0bGV0IGluc3RhbnRpYXRpb25TZXJ2aWNlOiBUZXN0SW5zdGFudGlhdGlvblNlcnZpY2U7XG5cdGxldCBtZENlbGxGaW5kTWF0Y2g6IENlbGxGaW5kTWF0Y2hNb2RlbDtcblx0bGV0IGNvZGVDZWxsRmluZE1hdGNoOiBDZWxsRmluZE1hdGNoTW9kZWw7XG5cdGxldCBtZElucHV0Q2VsbDogSUNlbGxWaWV3TW9kZWw7XG5cdGxldCBjb2RlQ2VsbDogSUNlbGxWaWV3TW9kZWw7XG5cblx0bGV0IG1hcmtkb3duQ29udGVudFJlc3VsdHM6IElUZXh0U2VhcmNoTWF0Y2hbXTtcblx0bGV0IGNvZGVDb250ZW50UmVzdWx0czogSVRleHRTZWFyY2hNYXRjaFtdO1xuXHRsZXQgY29kZVdlYnZpZXdSZXN1bHRzOiBJVGV4dFNlYXJjaE1hdGNoW107XG5cdGNvbnN0IHN0b3JlID0gZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlKCk7XG5cdGxldCBjb3VudGVyOiBudW1iZXIgPSAwO1xuXHRzZXR1cCgoKSA9PiB7XG5cblx0XHRpbnN0YW50aWF0aW9uU2VydmljZSA9IG5ldyBUZXN0SW5zdGFudGlhdGlvblNlcnZpY2UoKTtcblx0XHRzdG9yZS5hZGQoaW5zdGFudGlhdGlvblNlcnZpY2UpO1xuXHRcdGNvbnN0IG1vZGVsU2VydmljZSA9IHN0dWJNb2RlbFNlcnZpY2UoaW5zdGFudGlhdGlvblNlcnZpY2UsIChlKSA9PiBzdG9yZS5hZGQoZSkpO1xuXHRcdGNvbnN0IG5vdGVib29rRWRpdG9yU2VydmljZSA9IHN0dWJOb3RlYm9va0VkaXRvclNlcnZpY2UoaW5zdGFudGlhdGlvblNlcnZpY2UsIChlKSA9PiBzdG9yZS5hZGQoZSkpO1xuXHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSU1vZGVsU2VydmljZSwgbW9kZWxTZXJ2aWNlKTtcblx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElOb3RlYm9va0VkaXRvclNlcnZpY2UsIG5vdGVib29rRWRpdG9yU2VydmljZSk7XG5cdFx0bWRJbnB1dENlbGwgPSB7XG5cdFx0XHRpZDogJ21kQ2VsbCcsXG5cdFx0XHRjZWxsS2luZDogQ2VsbEtpbmQuTWFya3VwLCB0ZXh0QnVmZmVyOiA8SVJlYWRvbmx5VGV4dEJ1ZmZlcj57XG5cdFx0XHRcdGdldExpbmVDb250ZW50KGxpbmVOdW1iZXI6IG51bWJlcik6IHN0cmluZyB7XG5cdFx0XHRcdFx0aWYgKGxpbmVOdW1iZXIgPT09IDEpIHtcblx0XHRcdFx0XHRcdHJldHVybiAnIyBIZWxsbyBXb3JsZCBUZXN0Jztcblx0XHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdFx0cmV0dXJuICcnO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH0gYXMgSUNlbGxWaWV3TW9kZWw7XG5cblx0XHRjb25zdCBmaW5kTWF0Y2hNZHMgPSBbbmV3IEZpbmRNYXRjaChuZXcgUmFuZ2UoMSwgMTUsIDEsIDE5KSwgWydUZXN0J10pXTtcblx0XHRjb2RlQ2VsbCA9IHtcblx0XHRcdGlkOiAnY29kZUNlbGwnLFxuXHRcdFx0Y2VsbEtpbmQ6IENlbGxLaW5kLkNvZGUsIHRleHRCdWZmZXI6IDxJUmVhZG9ubHlUZXh0QnVmZmVyPntcblx0XHRcdFx0Z2V0TGluZUNvbnRlbnQobGluZU51bWJlcjogbnVtYmVyKTogc3RyaW5nIHtcblx0XHRcdFx0XHRpZiAobGluZU51bWJlciA9PT0gMSkge1xuXHRcdFx0XHRcdFx0cmV0dXJuICdwcmludChcInRlc3QhIHRlc3RpbmchIVwiKSc7XG5cdFx0XHRcdFx0fSBlbHNlIGlmIChsaW5lTnVtYmVyID09PSAyKSB7XG5cdFx0XHRcdFx0XHRyZXR1cm4gJ3ByaW50KFwidGhpcyBpcyBhIFRlc3RcIiknO1xuXHRcdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0XHRyZXR1cm4gJyc7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fSBhcyBJQ2VsbFZpZXdNb2RlbDtcblx0XHRjb25zdCBmaW5kTWF0Y2hDb2RlQ2VsbHMgPVxuXHRcdFx0W25ldyBGaW5kTWF0Y2gobmV3IFJhbmdlKDEsIDgsIDEsIDEyKSwgWyd0ZXN0J10pLFxuXHRcdFx0bmV3IEZpbmRNYXRjaChuZXcgUmFuZ2UoMSwgMTQsIDEsIDE4KSwgWyd0ZXN0J10pLFxuXHRcdFx0bmV3IEZpbmRNYXRjaChuZXcgUmFuZ2UoMiwgMTgsIDIsIDIyKSwgWydUZXN0J10pXG5cdFx0XHRdO1xuXG5cdFx0Y29uc3Qgd2Vidmlld01hdGNoZXMgPSBbe1xuXHRcdFx0aW5kZXg6IDAsXG5cdFx0XHRzZWFyY2hQcmV2aWV3SW5mbzoge1xuXHRcdFx0XHRsaW5lOiAndGVzdCEgdGVzdGluZyEhJyxcblx0XHRcdFx0cmFuZ2U6IHtcblx0XHRcdFx0XHRzdGFydDogMSxcblx0XHRcdFx0XHRlbmQ6IDVcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH0sXG5cdFx0e1xuXHRcdFx0aW5kZXg6IDEsXG5cdFx0XHRzZWFyY2hQcmV2aWV3SW5mbzoge1xuXHRcdFx0XHRsaW5lOiAndGVzdCEgdGVzdGluZyEhJyxcblx0XHRcdFx0cmFuZ2U6IHtcblx0XHRcdFx0XHRzdGFydDogNyxcblx0XHRcdFx0XHRlbmQ6IDExXG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9LFxuXHRcdHtcblx0XHRcdGluZGV4OiAzLFxuXHRcdFx0c2VhcmNoUHJldmlld0luZm86IHtcblx0XHRcdFx0bGluZTogJ3RoaXMgaXMgYSBUZXN0Jyxcblx0XHRcdFx0cmFuZ2U6IHtcblx0XHRcdFx0XHRzdGFydDogMTEsXG5cdFx0XHRcdFx0ZW5kOiAxNVxuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0XTtcblxuXG5cdFx0bWRDZWxsRmluZE1hdGNoID0gbmV3IENlbGxGaW5kTWF0Y2hNb2RlbChcblx0XHRcdG1kSW5wdXRDZWxsLFxuXHRcdFx0MCxcblx0XHRcdGZpbmRNYXRjaE1kcyxcblx0XHRcdFtdLFxuXHRcdCk7XG5cblx0XHRjb2RlQ2VsbEZpbmRNYXRjaCA9IG5ldyBDZWxsRmluZE1hdGNoTW9kZWwoXG5cdFx0XHRjb2RlQ2VsbCxcblx0XHRcdDUsXG5cdFx0XHRmaW5kTWF0Y2hDb2RlQ2VsbHMsXG5cdFx0XHR3ZWJ2aWV3TWF0Y2hlc1xuXHRcdCk7XG5cblx0fSk7XG5cblx0dGVhcmRvd24oKCkgPT4ge1xuXHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLmRpc3Bvc2UoKTtcblx0fSk7XG5cblx0c3VpdGUoJ25vdGVib29rRWRpdG9yTWF0Y2hlc1RvVGV4dFNlYXJjaFJlc3VsdHMnLCAoKSA9PiB7XG5cblx0XHRmdW5jdGlvbiBhc3NlcnRSYW5nZXNFcXVhbChhY3R1YWw6IElTZWFyY2hSYW5nZSB8IElTZWFyY2hSYW5nZVtdLCBleHBlY3RlZDogSVNlYXJjaFJhbmdlW10pIHtcblx0XHRcdGlmICghQXJyYXkuaXNBcnJheShhY3R1YWwpKSB7XG5cdFx0XHRcdGFjdHVhbCA9IFthY3R1YWxdO1xuXHRcdFx0fVxuXG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYWN0dWFsLmxlbmd0aCwgZXhwZWN0ZWQubGVuZ3RoKTtcblx0XHRcdGFjdHVhbC5mb3JFYWNoKChyLCBpKSA9PiB7XG5cdFx0XHRcdGNvbnN0IGV4cGVjdGVkUmFuZ2UgPSBleHBlY3RlZFtpXTtcblx0XHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChcblx0XHRcdFx0XHR7IHN0YXJ0TGluZU51bWJlcjogci5zdGFydExpbmVOdW1iZXIsIHN0YXJ0Q29sdW1uOiByLnN0YXJ0Q29sdW1uLCBlbmRMaW5lTnVtYmVyOiByLmVuZExpbmVOdW1iZXIsIGVuZENvbHVtbjogci5lbmRDb2x1bW4gfSxcblx0XHRcdFx0XHR7IHN0YXJ0TGluZU51bWJlcjogZXhwZWN0ZWRSYW5nZS5zdGFydExpbmVOdW1iZXIsIHN0YXJ0Q29sdW1uOiBleHBlY3RlZFJhbmdlLnN0YXJ0Q29sdW1uLCBlbmRMaW5lTnVtYmVyOiBleHBlY3RlZFJhbmdlLmVuZExpbmVOdW1iZXIsIGVuZENvbHVtbjogZXhwZWN0ZWRSYW5nZS5lbmRDb2x1bW4gfSk7XG5cdFx0XHR9KTtcblx0XHR9XG5cblx0XHR0ZXN0KCdjb252ZXJ0IENlbGxGaW5kTWF0Y2hNb2RlbCB0byBJVGV4dFNlYXJjaE1hdGNoIGFuZCBjaGVjayByZXN1bHRzJywgKCkgPT4ge1xuXHRcdFx0bWFya2Rvd25Db250ZW50UmVzdWx0cyA9IGNvbnRlbnRNYXRjaGVzVG9UZXh0U2VhcmNoTWF0Y2hlcyhtZENlbGxGaW5kTWF0Y2guY29udGVudE1hdGNoZXMsIG1kSW5wdXRDZWxsKTtcblx0XHRcdGNvZGVDb250ZW50UmVzdWx0cyA9IGNvbnRlbnRNYXRjaGVzVG9UZXh0U2VhcmNoTWF0Y2hlcyhjb2RlQ2VsbEZpbmRNYXRjaC5jb250ZW50TWF0Y2hlcywgY29kZUNlbGwpO1xuXHRcdFx0Y29kZVdlYnZpZXdSZXN1bHRzID0gd2Vidmlld01hdGNoZXNUb1RleHRTZWFyY2hNYXRjaGVzKGNvZGVDZWxsRmluZE1hdGNoLndlYnZpZXdNYXRjaGVzKTtcblxuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1hcmtkb3duQ29udGVudFJlc3VsdHMubGVuZ3RoLCAxKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChtYXJrZG93bkNvbnRlbnRSZXN1bHRzWzBdLnByZXZpZXdUZXh0LCAnIyBIZWxsbyBXb3JsZCBUZXN0XFxuJyk7XG5cdFx0XHRhc3NlcnRSYW5nZXNFcXVhbChtYXJrZG93bkNvbnRlbnRSZXN1bHRzWzBdLnJhbmdlTG9jYXRpb25zLm1hcChlID0+IGUucHJldmlldyksIFtuZXcgUmFuZ2UoMCwgMTQsIDAsIDE4KV0pO1xuXHRcdFx0YXNzZXJ0UmFuZ2VzRXF1YWwobWFya2Rvd25Db250ZW50UmVzdWx0c1swXS5yYW5nZUxvY2F0aW9ucy5tYXAoZSA9PiBlLnNvdXJjZSksIFtuZXcgUmFuZ2UoMCwgMTQsIDAsIDE4KV0pO1xuXG5cblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChjb2RlQ29udGVudFJlc3VsdHMubGVuZ3RoLCAyKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChjb2RlQ29udGVudFJlc3VsdHNbMF0ucHJldmlld1RleHQsICdwcmludChcInRlc3QhIHRlc3RpbmchIVwiKVxcbicpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNvZGVDb250ZW50UmVzdWx0c1sxXS5wcmV2aWV3VGV4dCwgJ3ByaW50KFwidGhpcyBpcyBhIFRlc3RcIilcXG4nKTtcblx0XHRcdGFzc2VydFJhbmdlc0VxdWFsKGNvZGVDb250ZW50UmVzdWx0c1swXS5yYW5nZUxvY2F0aW9ucy5tYXAoZSA9PiBlLnByZXZpZXcpLCBbbmV3IFJhbmdlKDAsIDcsIDAsIDExKSwgbmV3IFJhbmdlKDAsIDEzLCAwLCAxNyldKTtcblx0XHRcdGFzc2VydFJhbmdlc0VxdWFsKGNvZGVDb250ZW50UmVzdWx0c1swXS5yYW5nZUxvY2F0aW9ucy5tYXAoZSA9PiBlLnNvdXJjZSksIFtuZXcgUmFuZ2UoMCwgNywgMCwgMTEpLCBuZXcgUmFuZ2UoMCwgMTMsIDAsIDE3KV0pO1xuXG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY29kZVdlYnZpZXdSZXN1bHRzLmxlbmd0aCwgMyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY29kZVdlYnZpZXdSZXN1bHRzWzBdLnByZXZpZXdUZXh0LCAndGVzdCEgdGVzdGluZyEhJyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY29kZVdlYnZpZXdSZXN1bHRzWzFdLnByZXZpZXdUZXh0LCAndGVzdCEgdGVzdGluZyEhJyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY29kZVdlYnZpZXdSZXN1bHRzWzJdLnByZXZpZXdUZXh0LCAndGhpcyBpcyBhIFRlc3QnKTtcblxuXHRcdFx0YXNzZXJ0UmFuZ2VzRXF1YWwoY29kZVdlYnZpZXdSZXN1bHRzWzBdLnJhbmdlTG9jYXRpb25zLm1hcChlID0+IGUucHJldmlldyksIFtuZXcgUmFuZ2UoMCwgMSwgMCwgNSldKTtcblx0XHRcdGFzc2VydFJhbmdlc0VxdWFsKGNvZGVXZWJ2aWV3UmVzdWx0c1sxXS5yYW5nZUxvY2F0aW9ucy5tYXAoZSA9PiBlLnByZXZpZXcpLCBbbmV3IFJhbmdlKDAsIDcsIDAsIDExKV0pO1xuXHRcdFx0YXNzZXJ0UmFuZ2VzRXF1YWwoY29kZVdlYnZpZXdSZXN1bHRzWzJdLnJhbmdlTG9jYXRpb25zLm1hcChlID0+IGUucHJldmlldyksIFtuZXcgUmFuZ2UoMCwgMTEsIDAsIDE1KV0pO1xuXHRcdFx0YXNzZXJ0UmFuZ2VzRXF1YWwoY29kZVdlYnZpZXdSZXN1bHRzWzBdLnJhbmdlTG9jYXRpb25zLm1hcChlID0+IGUuc291cmNlKSwgW25ldyBSYW5nZSgwLCAxLCAwLCA1KV0pO1xuXHRcdFx0YXNzZXJ0UmFuZ2VzRXF1YWwoY29kZVdlYnZpZXdSZXN1bHRzWzFdLnJhbmdlTG9jYXRpb25zLm1hcChlID0+IGUuc291cmNlKSwgW25ldyBSYW5nZSgwLCA3LCAwLCAxMSldKTtcblx0XHRcdGFzc2VydFJhbmdlc0VxdWFsKGNvZGVXZWJ2aWV3UmVzdWx0c1syXS5yYW5nZUxvY2F0aW9ucy5tYXAoZSA9PiBlLnNvdXJjZSksIFtuZXcgUmFuZ2UoMCwgMTEsIDAsIDE1KV0pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnY29udmVydCBJVGV4dFNlYXJjaE1hdGNoIHRvIE1hdGNoSW5Ob3RlYm9vaycsICgpID0+IHtcblx0XHRcdGNvbnN0IG1kQ2VsbE1hdGNoID0gbmV3IENlbGxNYXRjaChhRmlsZU1hdGNoKCksIG1kSW5wdXRDZWxsLCAwKTtcblx0XHRcdGNvbnN0IG1hcmtkb3duQ2VsbENvbnRlbnRNYXRjaE9ianMgPSB0ZXh0U2VhcmNoTWF0Y2hlc1RvTm90ZWJvb2tNYXRjaGVzKG1hcmtkb3duQ29udGVudFJlc3VsdHMsIG1kQ2VsbE1hdGNoKTtcblxuXHRcdFx0Y29uc3QgY29kZUNlbGxNYXRjaCA9IG5ldyBDZWxsTWF0Y2goYUZpbGVNYXRjaCgpLCBjb2RlQ2VsbCwgMCk7XG5cdFx0XHRjb25zdCBjb2RlQ2VsbENvbnRlbnRNYXRjaE9ianMgPSB0ZXh0U2VhcmNoTWF0Y2hlc1RvTm90ZWJvb2tNYXRjaGVzKGNvZGVDb250ZW50UmVzdWx0cywgY29kZUNlbGxNYXRjaCk7XG5cdFx0XHRjb25zdCBjb2RlV2Vidmlld0NvbnRlbnRNYXRjaE9ianMgPSB0ZXh0U2VhcmNoTWF0Y2hlc1RvTm90ZWJvb2tNYXRjaGVzKGNvZGVXZWJ2aWV3UmVzdWx0cywgY29kZUNlbGxNYXRjaCk7XG5cblxuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1hcmtkb3duQ2VsbENvbnRlbnRNYXRjaE9ianNbMF0uY2VsbD8uaWQsIG1kQ2VsbE1hdGNoLmlkKTtcblx0XHRcdGFzc2VydFJhbmdlc0VxdWFsKG1hcmtkb3duQ2VsbENvbnRlbnRNYXRjaE9ianNbMF0ucmFuZ2UoKSwgW25ldyBSYW5nZSgxLCAxNSwgMSwgMTkpXSk7XG5cblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChjb2RlQ2VsbENvbnRlbnRNYXRjaE9ianNbMF0uY2VsbD8uaWQsIGNvZGVDZWxsTWF0Y2guaWQpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNvZGVDZWxsQ29udGVudE1hdGNoT2Jqc1sxXS5jZWxsPy5pZCwgY29kZUNlbGxNYXRjaC5pZCk7XG5cdFx0XHRhc3NlcnRSYW5nZXNFcXVhbChjb2RlQ2VsbENvbnRlbnRNYXRjaE9ianNbMF0ucmFuZ2UoKSwgW25ldyBSYW5nZSgxLCA4LCAxLCAxMildKTtcblx0XHRcdGFzc2VydFJhbmdlc0VxdWFsKGNvZGVDZWxsQ29udGVudE1hdGNoT2Jqc1sxXS5yYW5nZSgpLCBbbmV3IFJhbmdlKDEsIDE0LCAxLCAxOCldKTtcblx0XHRcdGFzc2VydFJhbmdlc0VxdWFsKGNvZGVDZWxsQ29udGVudE1hdGNoT2Jqc1syXS5yYW5nZSgpLCBbbmV3IFJhbmdlKDIsIDE4LCAyLCAyMildKTtcblxuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNvZGVXZWJ2aWV3Q29udGVudE1hdGNoT2Jqc1swXS5jZWxsPy5pZCwgY29kZUNlbGxNYXRjaC5pZCk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY29kZVdlYnZpZXdDb250ZW50TWF0Y2hPYmpzWzFdLmNlbGw/LmlkLCBjb2RlQ2VsbE1hdGNoLmlkKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChjb2RlV2Vidmlld0NvbnRlbnRNYXRjaE9ianNbMl0uY2VsbD8uaWQsIGNvZGVDZWxsTWF0Y2guaWQpO1xuXHRcdFx0YXNzZXJ0UmFuZ2VzRXF1YWwoY29kZVdlYnZpZXdDb250ZW50TWF0Y2hPYmpzWzBdLnJhbmdlKCksIFtuZXcgUmFuZ2UoMSwgMiwgMSwgNildKTtcblx0XHRcdGFzc2VydFJhbmdlc0VxdWFsKGNvZGVXZWJ2aWV3Q29udGVudE1hdGNoT2Jqc1sxXS5yYW5nZSgpLCBbbmV3IFJhbmdlKDEsIDgsIDEsIDEyKV0pO1xuXHRcdFx0YXNzZXJ0UmFuZ2VzRXF1YWwoY29kZVdlYnZpZXdDb250ZW50TWF0Y2hPYmpzWzJdLnJhbmdlKCksIFtuZXcgUmFuZ2UoMSwgMTIsIDEsIDE2KV0pO1xuXG5cdFx0fSk7XG5cblxuXHRcdGZ1bmN0aW9uIGFGaWxlTWF0Y2goKTogSU5vdGVib29rRmlsZUluc3RhbmNlTWF0Y2gge1xuXHRcdFx0Y29uc3QgcmF3TWF0Y2g6IElGaWxlTWF0Y2ggPSB7XG5cdFx0XHRcdHJlc291cmNlOiBVUkkuZmlsZSgnc29tZXBhdGgnICsgKytjb3VudGVyKSxcblx0XHRcdFx0cmVzdWx0czogW11cblx0XHRcdH07XG5cblx0XHRcdGNvbnN0IHNlYXJjaE1vZGVsID0gaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoU2VhcmNoTW9kZWxJbXBsKTtcblx0XHRcdHN0b3JlLmFkZChzZWFyY2hNb2RlbCk7XG5cdFx0XHRjb25zdCBmb2xkZXJNYXRjaCA9IGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKEZvbGRlck1hdGNoSW1wbCwgVVJJLmZpbGUoJ3NvbWVwYXRoJyksICcnLCAwLCB7XG5cdFx0XHRcdHR5cGU6IFF1ZXJ5VHlwZS5UZXh0LCBmb2xkZXJRdWVyaWVzOiBbeyBmb2xkZXI6IGNyZWF0ZUZpbGVVcmlGcm9tUGF0aEZyb21Sb290KCkgfV0sIGNvbnRlbnRQYXR0ZXJuOiB7XG5cdFx0XHRcdFx0cGF0dGVybjogJydcblx0XHRcdFx0fVxuXHRcdFx0fSwgc2VhcmNoTW9kZWwuc2VhcmNoUmVzdWx0LnBsYWluVGV4dFNlYXJjaFJlc3VsdCwgc2VhcmNoTW9kZWwuc2VhcmNoUmVzdWx0LCBudWxsKTtcblx0XHRcdGNvbnN0IGZpbGVNYXRjaCA9IGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKE5vdGVib29rQ29tcGF0aWJsZUZpbGVNYXRjaCwge1xuXHRcdFx0XHRwYXR0ZXJuOiAnJ1xuXHRcdFx0fSwgdW5kZWZpbmVkLCB1bmRlZmluZWQsIGZvbGRlck1hdGNoLCByYXdNYXRjaCwgbnVsbCwgJycpO1xuXHRcdFx0ZmlsZU1hdGNoLmNyZWF0ZU1hdGNoZXMoKTtcblx0XHRcdHN0b3JlLmFkZChmb2xkZXJNYXRjaCk7XG5cdFx0XHRzdG9yZS5hZGQoZmlsZU1hdGNoKTtcblxuXHRcdFx0cmV0dXJuIGZp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
