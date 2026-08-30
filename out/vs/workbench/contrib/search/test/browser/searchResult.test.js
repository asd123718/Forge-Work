import assert from "assert";
import * as sinon from "sinon";
import { TestInstantiationService } from "../../../../../platform/instantiation/test/common/instantiationServiceMock.js";
import { SearchModelImpl } from "../../browser/searchTreeModel/searchModel.js";
import { URI } from "../../../../../base/common/uri.js";
import { TextSearchMatch, OneLineRange, QueryType } from "../../../../services/search/common/search.js";
import { ITelemetryService } from "../../../../../platform/telemetry/common/telemetry.js";
import { NullTelemetryService } from "../../../../../platform/telemetry/common/telemetryUtils.js";
import { Range } from "../../../../../editor/common/core/range.js";
import { IConfigurationService } from "../../../../../platform/configuration/common/configuration.js";
import { TestConfigurationService } from "../../../../../platform/configuration/test/common/testConfigurationService.js";
import { ModelService } from "../../../../../editor/common/services/modelService.js";
import { IModelService } from "../../../../../editor/common/services/model.js";
import { IReplaceService } from "../../browser/replace.js";
import { IThemeService } from "../../../../../platform/theme/common/themeService.js";
import { TestThemeService } from "../../../../../platform/theme/test/common/testThemeService.js";
import { IUriIdentityService } from "../../../../../platform/uriIdentity/common/uriIdentity.js";
import { UriIdentityService } from "../../../../../platform/uriIdentity/common/uriIdentityService.js";
import { FileService } from "../../../../../platform/files/common/fileService.js";
import { ILogService, NullLogService } from "../../../../../platform/log/common/log.js";
import { ILabelService } from "../../../../../platform/label/common/label.js";
import { MockLabelService } from "../../../../services/label/test/common/mockLabelService.js";
import { INotebookEditorService } from "../../../notebook/browser/services/notebookEditorService.js";
import { IEditorGroupsService } from "../../../../services/editor/common/editorGroupsService.js";
import { TestEditorGroupsService, TestEditorService } from "../../../../test/browser/workbenchTestServices.js";
import { NotebookEditorWidgetService } from "../../../notebook/browser/services/notebookEditorServiceImpl.js";
import { CellKind } from "../../../notebook/common/notebookCommon.js";
import { addToSearchResult, createFileUriFromPathFromRoot, getRootName } from "./searchTestCommon.js";
import { IContextKeyService } from "../../../../../platform/contextkey/common/contextkey.js";
import { MockContextKeyService } from "../../../../../platform/keybinding/test/common/mockKeybindingService.js";
import { IEditorService } from "../../../../services/editor/common/editorService.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../../base/test/common/utils.js";
import { CellMatch, NotebookCompatibleFileMatch } from "../../browser/notebookSearch/notebookSearchModel.js";
import { isSearchTreeFolderMatchNoRoot, MATCH_PREFIX } from "../../browser/searchTreeModel/searchTreeCommon.js";
import { FolderMatchImpl } from "../../browser/searchTreeModel/folderMatch.js";
import { SearchResultImpl } from "../../browser/searchTreeModel/searchResult.js";
import { MatchImpl } from "../../browser/searchTreeModel/match.js";
const lineOneRange = new OneLineRange(1, 0, 1);
suite("SearchResult", () => {
  let instantiationService;
  const store = ensureNoDisposablesAreLeakedInTestSuite();
  setup(() => {
    instantiationService = new TestInstantiationService();
    instantiationService.stub(ITelemetryService, NullTelemetryService);
    instantiationService.stub(IModelService, stubModelService(instantiationService));
    instantiationService.stub(INotebookEditorService, stubNotebookEditorService(instantiationService));
    const fileService = new FileService(new NullLogService());
    store.add(fileService);
    const uriIdentityService = new UriIdentityService(fileService);
    store.add(uriIdentityService);
    instantiationService.stub(IUriIdentityService, uriIdentityService);
    instantiationService.stubPromise(IReplaceService, {});
    instantiationService.stub(IReplaceService, "replace", () => Promise.resolve(null));
    instantiationService.stub(ILabelService, new MockLabelService());
    instantiationService.stub(ILogService, new NullLogService());
  });
  teardown(() => {
    instantiationService.dispose();
  });
  test("Line Match", function() {
    const fileMatch = aFileMatch("folder/file.txt", null);
    const lineMatch = new MatchImpl(fileMatch, ["0 foo bar"], new OneLineRange(0, 2, 5), new OneLineRange(1, 0, 5), false);
    assert.strictEqual(lineMatch.text(), "0 foo bar");
    assert.strictEqual(lineMatch.range().startLineNumber, 2);
    assert.strictEqual(lineMatch.range().endLineNumber, 2);
    assert.strictEqual(lineMatch.range().startColumn, 1);
    assert.strictEqual(lineMatch.range().endColumn, 6);
    assert.strictEqual(lineMatch.id(), MATCH_PREFIX + "file:///folder/file.txt>[2,1 -> 2,6]foo");
    assert.strictEqual(lineMatch.fullMatchText(), "foo");
    assert.strictEqual(lineMatch.fullMatchText(true), "0 foo bar");
  });
  test("Line Match - Remove", function() {
    const fileMatch = aFileMatch("folder/file.txt", aSearchResult(), new TextSearchMatch("foo bar", new OneLineRange(1, 0, 3)));
    const lineMatch = fileMatch.matches()[0];
    fileMatch.remove(lineMatch);
    assert.strictEqual(fileMatch.matches().length, 0);
  });
  test("File Match", function() {
    let fileMatch = aFileMatch("folder/file.txt", aSearchResult());
    assert.strictEqual(fileMatch.matches().length, 0);
    assert.strictEqual(fileMatch.resource.toString(), "file:///folder/file.txt");
    assert.strictEqual(fileMatch.name(), "file.txt");
    fileMatch = aFileMatch("file.txt", aSearchResult());
    assert.strictEqual(fileMatch.matches().length, 0);
    assert.strictEqual(fileMatch.resource.toString(), "file:///file.txt");
    assert.strictEqual(fileMatch.name(), "file.txt");
  });
  test("File Match: Select an existing match", function() {
    const testObject = aFileMatch(
      "folder/file.txt",
      aSearchResult(),
      new TextSearchMatch("foo", new OneLineRange(1, 0, 3)),
      new TextSearchMatch("bar", new OneLineRange(1, 5, 3))
    );
    testObject.setSelectedMatch(testObject.matches()[0]);
    assert.strictEqual(testObject.matches()[0], testObject.getSelectedMatch());
  });
  test("File Match: Select non existing match", function() {
    const testObject = aFileMatch(
      "folder/file.txt",
      aSearchResult(),
      new TextSearchMatch("foo", new OneLineRange(1, 0, 3)),
      new TextSearchMatch("bar", new OneLineRange(1, 5, 3))
    );
    const target = testObject.matches()[0];
    testObject.remove(target);
    testObject.setSelectedMatch(target);
    assert.strictEqual(testObject.getSelectedMatch(), null);
  });
  test("File Match: isSelected return true for selected match", function() {
    const testObject = aFileMatch(
      "folder/file.txt",
      aSearchResult(),
      new TextSearchMatch("foo", new OneLineRange(1, 0, 3)),
      new TextSearchMatch("bar", new OneLineRange(1, 5, 3))
    );
    const target = testObject.matches()[0];
    testObject.setSelectedMatch(target);
    assert.ok(testObject.isMatchSelected(target));
  });
  test("File Match: isSelected return false for un-selected match", function() {
    const testObject = aFileMatch(
      "folder/file.txt",
      aSearchResult(),
      new TextSearchMatch("foo", new OneLineRange(1, 0, 3)),
      new TextSearchMatch("bar", new OneLineRange(1, 5, 3))
    );
    testObject.setSelectedMatch(testObject.matches()[0]);
    assert.ok(!testObject.isMatchSelected(testObject.matches()[1]));
  });
  test("File Match: unselect", function() {
    const testObject = aFileMatch(
      "folder/file.txt",
      aSearchResult(),
      new TextSearchMatch("foo", new OneLineRange(1, 0, 3)),
      new TextSearchMatch("bar", new OneLineRange(1, 5, 3))
    );
    testObject.setSelectedMatch(testObject.matches()[0]);
    testObject.setSelectedMatch(null);
    assert.strictEqual(null, testObject.getSelectedMatch());
  });
  test("File Match: unselect when not selected", function() {
    const testObject = aFileMatch(
      "folder/file.txt",
      aSearchResult(),
      new TextSearchMatch("foo", new OneLineRange(1, 0, 3)),
      new TextSearchMatch("bar", new OneLineRange(1, 5, 3))
    );
    testObject.setSelectedMatch(null);
    assert.strictEqual(null, testObject.getSelectedMatch());
  });
  test("Match -> FileMatch -> SearchResult hierarchy exists", function() {
    const searchModel = instantiationService.createInstance(SearchModelImpl);
    store.add(searchModel);
    const searchResult = instantiationService.createInstance(SearchResultImpl, searchModel);
    store.add(searchResult);
    const fileMatch = aFileMatch("far/boo", searchResult);
    const lineMatch = new MatchImpl(fileMatch, ["foo bar"], new OneLineRange(0, 0, 3), new OneLineRange(1, 0, 3), false);
    assert(lineMatch.parent() === fileMatch);
    assert(fileMatch.parent() === searchResult.folderMatches()[0]);
  });
  test("Adding a raw match will add a file match with line matches", function() {
    const testObject = aSearchResult();
    const target = [aRawMatch(
      "/1",
      new TextSearchMatch("preview 1", new OneLineRange(1, 1, 4)),
      new TextSearchMatch("preview 1", new OneLineRange(1, 4, 11)),
      new TextSearchMatch("preview 2", lineOneRange)
    )];
    addToSearchResult(testObject, target);
    assert.strictEqual(3, testObject.count());
    const actual = testObject.matches();
    assert.strictEqual(1, actual.length);
    assert.strictEqual(URI.file(`${getRootName()}/1`).toString(), actual[0].resource.toString());
    const actuaMatches = actual[0].matches();
    assert.strictEqual(3, actuaMatches.length);
    assert.strictEqual("preview 1", actuaMatches[0].text());
    assert.ok(new Range(2, 2, 2, 5).equalsRange(actuaMatches[0].range()));
    assert.strictEqual("preview 1", actuaMatches[1].text());
    assert.ok(new Range(2, 5, 2, 12).equalsRange(actuaMatches[1].range()));
    assert.strictEqual("preview 2", actuaMatches[2].text());
    assert.ok(new Range(2, 1, 2, 2).equalsRange(actuaMatches[2].range()));
  });
  test("Adding multiple raw matches", function() {
    const testObject = aSearchResult();
    const target = [
      aRawMatch(
        "/1",
        new TextSearchMatch("preview 1", new OneLineRange(1, 1, 4)),
        new TextSearchMatch("preview 1", new OneLineRange(1, 4, 11))
      ),
      aRawMatch(
        "/2",
        new TextSearchMatch("preview 2", lineOneRange)
      )
    ];
    addToSearchResult(testObject, target);
    assert.strictEqual(3, testObject.count());
    const actual = testObject.matches();
    assert.strictEqual(2, actual.length);
    assert.strictEqual(URI.file(`${getRootName()}/1`).toString(), actual[0].resource.toString());
    let actuaMatches = actual[0].matches();
    assert.strictEqual(2, actuaMatches.length);
    assert.strictEqual("preview 1", actuaMatches[0].text());
    assert.ok(new Range(2, 2, 2, 5).equalsRange(actuaMatches[0].range()));
    assert.strictEqual("preview 1", actuaMatches[1].text());
    assert.ok(new Range(2, 5, 2, 12).equalsRange(actuaMatches[1].range()));
    actuaMatches = actual[1].matches();
    assert.strictEqual(1, actuaMatches.length);
    assert.strictEqual("preview 2", actuaMatches[0].text());
    assert.ok(new Range(2, 1, 2, 2).equalsRange(actuaMatches[0].range()));
  });
  test("Test that notebook matches get added correctly", function() {
    const testObject = aSearchResult();
    const cell1 = { cellKind: CellKind.Code };
    const cell2 = { cellKind: CellKind.Code };
    sinon.stub(CellMatch.prototype, "addContext");
    const addFileMatch = sinon.spy(FolderMatchImpl.prototype, "addFileMatch");
    const fileMatch1 = aRawFileMatchWithCells(
      "/1",
      {
        cell: cell1,
        index: 0,
        contentResults: [
          new TextSearchMatch("preview 1", new OneLineRange(1, 1, 4))
        ],
        webviewResults: [
          new TextSearchMatch("preview 1", new OneLineRange(1, 4, 11)),
          new TextSearchMatch("preview 2", lineOneRange)
        ]
      }
    );
    const fileMatch2 = aRawFileMatchWithCells(
      "/2",
      {
        cell: cell2,
        index: 0,
        contentResults: [
          new TextSearchMatch("preview 1", new OneLineRange(1, 1, 4))
        ],
        webviewResults: [
          new TextSearchMatch("preview 1", new OneLineRange(1, 4, 11)),
          new TextSearchMatch("preview 2", lineOneRange)
        ]
      }
    );
    const target = [fileMatch1, fileMatch2];
    addToSearchResult(testObject, target);
    assert.strictEqual(6, testObject.count());
    assert.deepStrictEqual(fileMatch1.cellResults[0].contentResults, addFileMatch.getCall(0).args[0][0].cellResults[0].contentResults);
    assert.deepStrictEqual(fileMatch1.cellResults[0].webviewResults, addFileMatch.getCall(0).args[0][0].cellResults[0].webviewResults);
    assert.deepStrictEqual(fileMatch2.cellResults[0].contentResults, addFileMatch.getCall(0).args[0][1].cellResults[0].contentResults);
    assert.deepStrictEqual(fileMatch2.cellResults[0].webviewResults, addFileMatch.getCall(0).args[0][1].cellResults[0].webviewResults);
  });
  test("Dispose disposes matches", function() {
    const target1 = sinon.spy();
    const target2 = sinon.spy();
    const testObject = aSearchResult();
    addToSearchResult(testObject, [
      aRawMatch(
        "/1",
        new TextSearchMatch("preview 1", lineOneRange)
      ),
      aRawMatch(
        "/2",
        new TextSearchMatch("preview 2", lineOneRange)
      )
    ]);
    store.add(testObject.matches()[0].onDispose(target1));
    store.add(testObject.matches()[1].onDispose(target2));
    testObject.dispose();
    assert.ok(testObject.isEmpty());
    assert.ok(target1.calledOnce);
    assert.ok(target2.calledOnce);
  });
  test("remove triggers change event", function() {
    const target = sinon.spy();
    const testObject = aSearchResult();
    addToSearchResult(testObject, [
      aRawMatch(
        "/1",
        new TextSearchMatch("preview 1", lineOneRange)
      )
    ]);
    const objectToRemove = testObject.matches()[0];
    store.add(testObject.onChange(target));
    testObject.remove(objectToRemove);
    assert.ok(target.calledOnce);
    assert.deepStrictEqual([{ elements: [objectToRemove], removed: true }], target.args[0]);
  });
  test("remove array triggers change event", function() {
    const target = sinon.spy();
    const testObject = aSearchResult();
    addToSearchResult(testObject, [
      aRawMatch(
        "/1",
        new TextSearchMatch("preview 1", lineOneRange)
      ),
      aRawMatch(
        "/2",
        new TextSearchMatch("preview 2", lineOneRange)
      )
    ]);
    const arrayToRemove = testObject.matches();
    store.add(testObject.onChange(target));
    testObject.remove(arrayToRemove);
    assert.ok(target.calledOnce);
    assert.deepStrictEqual([{ elements: arrayToRemove, removed: true }], target.args[0]);
  });
  test("Removing all line matches and adding back will add file back to result", function() {
    const testObject = aSearchResult();
    addToSearchResult(testObject, [
      aRawMatch(
        "/1",
        new TextSearchMatch("preview 1", lineOneRange)
      )
    ]);
    const target = testObject.matches()[0];
    const matchToRemove = target.matches()[0];
    target.remove(matchToRemove);
    assert.ok(testObject.isEmpty());
    target.add(matchToRemove, true);
    assert.strictEqual(1, testObject.fileCount());
    assert.strictEqual(target, testObject.matches()[0]);
  });
  test("replace should remove the file match", function() {
    const voidPromise = Promise.resolve(null);
    instantiationService.stub(IReplaceService, "replace", voidPromise);
    const testObject = aSearchResult();
    addToSearchResult(testObject, [
      aRawMatch(
        "/1",
        new TextSearchMatch("preview 1", lineOneRange)
      )
    ]);
    testObject.replace(testObject.matches()[0]);
    return voidPromise.then(() => assert.ok(testObject.isEmpty()));
  });
  test("replace should trigger the change event", function() {
    const target = sinon.spy();
    const voidPromise = Promise.resolve(null);
    instantiationService.stub(IReplaceService, "replace", voidPromise);
    const testObject = aSearchResult();
    addToSearchResult(testObject, [
      aRawMatch(
        "/1",
        new TextSearchMatch("preview 1", lineOneRange)
      )
    ]);
    store.add(testObject.onChange(target));
    const objectToRemove = testObject.matches()[0];
    testObject.replace(objectToRemove);
    return voidPromise.then(() => {
      assert.ok(target.calledOnce);
      assert.deepStrictEqual([{ elements: [objectToRemove], removed: true }], target.args[0]);
    });
  });
  test("replaceAll should remove all file matches", function() {
    const voidPromise = Promise.resolve(null);
    instantiationService.stubPromise(IReplaceService, "replace", voidPromise);
    const testObject = aSearchResult();
    addToSearchResult(testObject, [
      aRawMatch(
        "/1",
        new TextSearchMatch("preview 1", lineOneRange)
      ),
      aRawMatch(
        "/2",
        new TextSearchMatch("preview 2", lineOneRange)
      )
    ]);
    testObject.replaceAll(null);
    return voidPromise.then(() => assert.ok(testObject.isEmpty()));
  });
  test("batchRemove should trigger the onChange event correctly", function() {
    const target = sinon.spy();
    const testObject = getPopulatedSearchResult();
    const folderMatch = testObject.folderMatches()[0];
    const fileMatch = testObject.folderMatches()[1].allDownstreamFileMatches()[0];
    const match = testObject.folderMatches()[1].allDownstreamFileMatches()[1].matches()[0];
    const arrayToRemove = [folderMatch, fileMatch, match];
    const expectedArrayResult = folderMatch.allDownstreamFileMatches().concat([fileMatch, match.parent()]);
    store.add(testObject.onChange(target));
    testObject.batchRemove(arrayToRemove);
    assert.ok(target.calledOnce);
    assert.deepStrictEqual([{ elements: expectedArrayResult, removed: true, added: false }], target.args[0]);
  });
  test("batchRemove should remove FolderMatchNoRoot (Other files) correctly", function() {
    const target = sinon.spy();
    const testObject = aSearchResult();
    testObject.query = {
      type: QueryType.Text,
      contentPattern: { pattern: "foo" },
      folderQueries: [{
        folder: createFileUriFromPathFromRoot("/workspace")
      }]
    };
    addToSearchResult(testObject, [
      aRawMatch(
        "/workspace/file.txt",
        new TextSearchMatch("preview 1", lineOneRange)
      )
    ]);
    addToSearchResult(testObject, [
      aRawMatch(
        "/other/outside.txt",
        new TextSearchMatch("preview 2", lineOneRange)
      )
    ]);
    const folderMatches = testObject.folderMatches();
    assert.strictEqual(folderMatches.length, 2);
    const otherFilesMatch = folderMatches.find((fm) => isSearchTreeFolderMatchNoRoot(fm));
    assert.ok(otherFilesMatch, "Should have an Other files folder match");
    assert.strictEqual(otherFilesMatch.allDownstreamFileMatches().length, 1);
    store.add(testObject.onChange(target));
    testObject.batchRemove([otherFilesMatch]);
    assert.ok(target.calledOnce);
    assert.strictEqual(otherFilesMatch.allDownstreamFileMatches().length, 0);
  });
  test("batchReplace should trigger the onChange event correctly", async function() {
    const replaceSpy = sinon.spy();
    instantiationService.stub(IReplaceService, "replace", (arg) => {
      if (Array.isArray(arg)) {
        replaceSpy(arg[0]);
      } else {
        replaceSpy(arg);
      }
      return Promise.resolve();
    });
    const target = sinon.spy();
    const testObject = getPopulatedSearchResult();
    const folderMatch = testObject.folderMatches()[0];
    const fileMatch = testObject.folderMatches()[1].allDownstreamFileMatches()[0];
    const match = testObject.folderMatches()[1].allDownstreamFileMatches()[1].matches()[0];
    const firstExpectedMatch = folderMatch.allDownstreamFileMatches()[0];
    const arrayToRemove = [folderMatch, fileMatch, match];
    store.add(testObject.onChange(target));
    await testObject.batchReplace(arrayToRemove);
    assert.ok(target.calledOnce);
    sinon.assert.calledThrice(replaceSpy);
    sinon.assert.calledWith(replaceSpy.firstCall, firstExpectedMatch);
    sinon.assert.calledWith(replaceSpy.secondCall, fileMatch);
    sinon.assert.calledWith(replaceSpy.thirdCall, match);
  });
  test("Creating a model with nested folders should create the correct structure", function() {
    const testObject = getPopulatedSearchResultForTreeTesting();
    const root0 = testObject.folderMatches()[0];
    const root1 = testObject.folderMatches()[1];
    const root2 = testObject.folderMatches()[2];
    const root3 = testObject.folderMatches()[3];
    const root0DownstreamFiles = root0.allDownstreamFileMatches();
    assert.deepStrictEqual(root0DownstreamFiles, [...root0.fileMatchesIterator(), ...getFolderMatchAtIndex(root0, 0).fileMatchesIterator()]);
    assert.deepStrictEqual(getFolderMatchAtIndex(root0, 0).allDownstreamFileMatches(), Array.from(getFolderMatchAtIndex(root0, 0).fileMatchesIterator()));
    assert.deepStrictEqual(getFileMatchAtIndex(getFolderMatchAtIndex(root0, 0), 0).parent(), getFolderMatchAtIndex(root0, 0));
    assert.deepStrictEqual(getFolderMatchAtIndex(root0, 0).parent(), root0);
    assert.deepStrictEqual(getFolderMatchAtIndex(root0, 0).closestRoot, root0);
    root0DownstreamFiles.forEach((e) => {
      assert.deepStrictEqual(e.closestRoot, root0);
    });
    const root1DownstreamFiles = root1.allDownstreamFileMatches();
    assert.deepStrictEqual(root1.allDownstreamFileMatches(), [...root1.fileMatchesIterator(), ...getFolderMatchAtIndex(root1, 0).fileMatchesIterator()]);
    assert.deepStrictEqual(getFileMatchAtIndex(getFolderMatchAtIndex(root1, 0), 0).parent(), getFolderMatchAtIndex(root1, 0));
    root1DownstreamFiles.forEach((e) => {
      assert.deepStrictEqual(e.closestRoot, root1);
    });
    const root2DownstreamFiles = root2.allDownstreamFileMatches();
    assert.deepStrictEqual(root2DownstreamFiles, Array.from(root2.fileMatchesIterator()));
    assert.deepStrictEqual(getFileMatchAtIndex(root2, 0).parent(), root2);
    assert.deepStrictEqual(getFileMatchAtIndex(root2, 0).closestRoot, root2);
    const root3DownstreamFiles = root3.allDownstreamFileMatches();
    const root3Level3Folder = getFolderMatchAtIndex(getFolderMatchAtIndex(root3, 0), 0);
    assert.deepStrictEqual(root3DownstreamFiles, [...root3.fileMatchesIterator(), ...getFolderMatchAtIndex(root3Level3Folder, 0).fileMatchesIterator(), ...getFolderMatchAtIndex(root3Level3Folder, 1).fileMatchesIterator()].flat());
    assert.deepStrictEqual(root3Level3Folder.allDownstreamFileMatches(), getFolderMatchAtIndex(root3, 0).allDownstreamFileMatches());
    assert.deepStrictEqual(getFileMatchAtIndex(getFolderMatchAtIndex(root3Level3Folder, 1), 0).parent(), getFolderMatchAtIndex(root3Level3Folder, 1));
    assert.deepStrictEqual(getFolderMatchAtIndex(root3Level3Folder, 1).parent(), root3Level3Folder);
    assert.deepStrictEqual(root3Level3Folder.parent(), getFolderMatchAtIndex(root3, 0));
    root3DownstreamFiles.forEach((e) => {
      assert.deepStrictEqual(e.closestRoot, root3);
    });
  });
  test("Removing an intermediate folder should call OnChange() on all downstream file matches", function() {
    const target = sinon.spy();
    const testObject = getPopulatedSearchResultForTreeTesting();
    const folderMatch = getFolderMatchAtIndex(getFolderMatchAtIndex(getFolderMatchAtIndex(testObject.folderMatches()[3], 0), 0), 0);
    const expectedArrayResult = folderMatch.allDownstreamFileMatches();
    store.add(testObject.onChange(target));
    testObject.remove(folderMatch);
    assert.ok(target.calledOnce);
    assert.deepStrictEqual([{ elements: expectedArrayResult, removed: true, added: false, clearingAll: false }], target.args[0]);
  });
  test("Replacing an intermediate folder should remove all downstream folders and file matches", async function() {
    const target = sinon.spy();
    const testObject = getPopulatedSearchResultForTreeTesting();
    const folderMatch = getFolderMatchAtIndex(testObject.folderMatches()[3], 0);
    const expectedArrayResult = folderMatch.allDownstreamFileMatches();
    store.add(testObject.onChange(target));
    await testObject.batchReplace([folderMatch]);
    assert.deepStrictEqual([{ elements: expectedArrayResult, removed: true, added: false }], target.args[0]);
  });
  function aFileMatch(path, searchResult, ...lineMatches) {
    if (!searchResult) {
      searchResult = aSearchResult();
    }
    const rawMatch = {
      resource: URI.file("/" + path),
      results: lineMatches
    };
    const root = searchResult?.folderMatches()[0];
    const fileMatch = instantiationService.createInstance(NotebookCompatibleFileMatch, {
      pattern: ""
    }, void 0, void 0, root, rawMatch, null, "");
    fileMatch.createMatches();
    store.add(fileMatch);
    return fileMatch;
  }
  function aSearchResult() {
    const searchModel = instantiationService.createInstance(SearchModelImpl);
    store.add(searchModel);
    searchModel.searchResult.query = {
      type: QueryType.Text,
      folderQueries: [{ folder: createFileUriFromPathFromRoot() }],
      contentPattern: {
        pattern: ""
      }
    };
    return searchModel.searchResult;
  }
  function aRawMatch(resource, ...results) {
    return { resource: createFileUriFromPathFromRoot(resource), results };
  }
  function aRawFileMatchWithCells(resource, ...cellMatches) {
    return {
      resource: createFileUriFromPathFromRoot(resource),
      cellResults: cellMatches
    };
  }
  function stubModelService(instantiationService2) {
    instantiationService2.stub(IThemeService, new TestThemeService());
    const config = new TestConfigurationService();
    config.setUserConfiguration("search", { searchOnType: true });
    instantiationService2.stub(IConfigurationService, config);
    const modelService = instantiationService2.createInstance(ModelService);
    store.add(modelService);
    return modelService;
  }
  function stubNotebookEditorService(instantiationService2) {
    instantiationService2.stub(IEditorGroupsService, new TestEditorGroupsService());
    instantiationService2.stub(IContextKeyService, new MockContextKeyService());
    instantiationService2.stub(IEditorService, store.add(new TestEditorService()));
    const notebookEditorWidgetService = instantiationService2.createInstance(NotebookEditorWidgetService);
    store.add(notebookEditorWidgetService);
    return notebookEditorWidgetService;
  }
  function getPopulatedSearchResult() {
    const testObject = aSearchResult();
    testObject.query = {
      type: QueryType.Text,
      contentPattern: { pattern: "foo" },
      folderQueries: [
        {
          folder: createFileUriFromPathFromRoot("/voo")
        },
        { folder: createFileUriFromPathFromRoot("/with") }
      ]
    };
    addToSearchResult(testObject, [
      aRawMatch(
        "/voo/foo.a",
        new TextSearchMatch("preview 1", lineOneRange),
        new TextSearchMatch("preview 2", lineOneRange)
      ),
      aRawMatch(
        "/with/path/bar.b",
        new TextSearchMatch("preview 3", lineOneRange)
      ),
      aRawMatch(
        "/with/path.c",
        new TextSearchMatch("preview 4", lineOneRange),
        new TextSearchMatch("preview 5", lineOneRange)
      )
    ]);
    return testObject;
  }
  function getPopulatedSearchResultForTreeTesting() {
    const testObject = aSearchResult();
    testObject.query = {
      type: QueryType.Text,
      contentPattern: { pattern: "foo" },
      folderQueries: [
        {
          folder: createFileUriFromPathFromRoot("/voo")
        },
        {
          folder: createFileUriFromPathFromRoot("/with")
        },
        {
          folder: createFileUriFromPathFromRoot("/with/test")
        },
        {
          folder: createFileUriFromPathFromRoot("/eep")
        }
      ]
    };
    addToSearchResult(testObject, [
      aRawMatch(
        "/voo/foo.a",
        new TextSearchMatch("preview 1", lineOneRange),
        new TextSearchMatch("preview 2", lineOneRange)
      ),
      aRawMatch(
        "/voo/beep/foo.c",
        new TextSearchMatch("preview 1", lineOneRange),
        new TextSearchMatch("preview 2", lineOneRange)
      ),
      aRawMatch(
        "/voo/beep/boop.c",
        new TextSearchMatch("preview 3", lineOneRange)
      ),
      aRawMatch(
        "/with/path.c",
        new TextSearchMatch("preview 4", lineOneRange),
        new TextSearchMatch("preview 5", lineOneRange)
      ),
      aRawMatch(
        "/with/path/bar.b",
        new TextSearchMatch("preview 3", lineOneRange)
      ),
      aRawMatch(
        "/with/test/woo.c",
        new TextSearchMatch("preview 3", lineOneRange)
      ),
      aRawMatch(
        "/eep/bar/goo/foo/here.txt",
        new TextSearchMatch("preview 6", lineOneRange),
        new TextSearchMatch("preview 7", lineOneRange)
      ),
      aRawMatch(
        "/eep/bar/goo/ooo/there.txt",
        new TextSearchMatch("preview 6", lineOneRange),
        new TextSearchMatch("preview 7", lineOneRange)
      ),
      aRawMatch(
        "/eep/eyy.y",
        new TextSearchMatch("preview 6", lineOneRange),
        new TextSearchMatch("preview 7", lineOneRange)
      )
    ]);
    return testObject;
  }
  function getFolderMatchAtIndex(parent, index) {
    return Array.from(parent.folderMatchesIterator())[index];
  }
  function getFileMatchAtIndex(parent, index) {
    return Array.from(parent.fileMatchesIterator())[index];
  }
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXHNlYXJjaFxcdGVzdFxcYnJvd3Nlclxcc2VhcmNoUmVzdWx0LnRlc3QudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuaW1wb3J0IGFzc2VydCBmcm9tICdhc3NlcnQnO1xuaW1wb3J0ICogYXMgc2lub24gZnJvbSAnc2lub24nO1xuaW1wb3J0IHsgVGVzdEluc3RhbnRpYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vaW5zdGFudGlhdGlvbi90ZXN0L2NvbW1vbi9pbnN0YW50aWF0aW9uU2VydmljZU1vY2suanMnO1xuaW1wb3J0IHsgU2VhcmNoTW9kZWxJbXBsIH0gZnJvbSAnLi4vLi4vYnJvd3Nlci9zZWFyY2hUcmVlTW9kZWwvc2VhcmNoTW9kZWwuanMnO1xuaW1wb3J0IHsgVVJJIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdXJpLmpzJztcbmltcG9ydCB7IElGaWxlTWF0Y2gsIFRleHRTZWFyY2hNYXRjaCwgT25lTGluZVJhbmdlLCBJVGV4dFNlYXJjaE1hdGNoLCBRdWVyeVR5cGUgfSBmcm9tICcuLi8uLi8uLi8uLi9zZXJ2aWNlcy9zZWFyY2gvY29tbW9uL3NlYXJjaC5qcyc7XG5pbXBvcnQgeyBJVGVsZW1ldHJ5U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL3RlbGVtZXRyeS9jb21tb24vdGVsZW1ldHJ5LmpzJztcbmltcG9ydCB7IE51bGxUZWxlbWV0cnlTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vdGVsZW1ldHJ5L2NvbW1vbi90ZWxlbWV0cnlVdGlscy5qcyc7XG5pbXBvcnQgeyBSYW5nZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vY29yZS9yYW5nZS5qcyc7XG5pbXBvcnQgeyBJQ29uZmlndXJhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb25maWd1cmF0aW9uL2NvbW1vbi9jb25maWd1cmF0aW9uLmpzJztcbmltcG9ydCB7IFRlc3RDb25maWd1cmF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbmZpZ3VyYXRpb24vdGVzdC9jb21tb24vdGVzdENvbmZpZ3VyYXRpb25TZXJ2aWNlLmpzJztcbmltcG9ydCB7IE1vZGVsU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vc2VydmljZXMvbW9kZWxTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElNb2RlbFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL3NlcnZpY2VzL21vZGVsLmpzJztcbmltcG9ydCB7IElSZXBsYWNlU2VydmljZSB9IGZyb20gJy4uLy4uL2Jyb3dzZXIvcmVwbGFjZS5qcyc7XG5pbXBvcnQgeyBJVGhlbWVTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vdGhlbWUvY29tbW9uL3RoZW1lU2VydmljZS5qcyc7XG5pbXBvcnQgeyBUZXN0VGhlbWVTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vdGhlbWUvdGVzdC9jb21tb24vdGVzdFRoZW1lU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJVXJpSWRlbnRpdHlTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vdXJpSWRlbnRpdHkvY29tbW9uL3VyaUlkZW50aXR5LmpzJztcbmltcG9ydCB7IFVyaUlkZW50aXR5U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL3VyaUlkZW50aXR5L2NvbW1vbi91cmlJZGVudGl0eVNlcnZpY2UuanMnO1xuaW1wb3J0IHsgRmlsZVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9maWxlcy9jb21tb24vZmlsZVNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSUxvZ1NlcnZpY2UsIE51bGxMb2dTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vbG9nL2NvbW1vbi9sb2cuanMnO1xuaW1wb3J0IHsgSUxhYmVsU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2xhYmVsL2NvbW1vbi9sYWJlbC5qcyc7XG5pbXBvcnQgeyBNb2NrTGFiZWxTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vc2VydmljZXMvbGFiZWwvdGVzdC9jb21tb24vbW9ja0xhYmVsU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJTm90ZWJvb2tFZGl0b3JTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vbm90ZWJvb2svYnJvd3Nlci9zZXJ2aWNlcy9ub3RlYm9va0VkaXRvclNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSUVkaXRvckdyb3Vwc1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9zZXJ2aWNlcy9lZGl0b3IvY29tbW9uL2VkaXRvckdyb3Vwc1NlcnZpY2UuanMnO1xuaW1wb3J0IHsgVGVzdEVkaXRvckdyb3Vwc1NlcnZpY2UsIFRlc3RFZGl0b3JTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vdGVzdC9icm93c2VyL3dvcmtiZW5jaFRlc3RTZXJ2aWNlcy5qcyc7XG5pbXBvcnQgeyBOb3RlYm9va0VkaXRvcldpZGdldFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9ub3RlYm9vay9icm93c2VyL3NlcnZpY2VzL25vdGVib29rRWRpdG9yU2VydmljZUltcGwuanMnO1xuaW1wb3J0IHsgSUNlbGxWaWV3TW9kZWwgfSBmcm9tICcuLi8uLi8uLi9ub3RlYm9vay9icm93c2VyL25vdGVib29rQnJvd3Nlci5qcyc7XG5pbXBvcnQgeyBDZWxsS2luZCB9IGZyb20gJy4uLy4uLy4uL25vdGVib29rL2NvbW1vbi9ub3RlYm9va0NvbW1vbi5qcyc7XG5pbXBvcnQgeyBhZGRUb1NlYXJjaFJlc3VsdCwgY3JlYXRlRmlsZVVyaUZyb21QYXRoRnJvbVJvb3QsIGdldFJvb3ROYW1lIH0gZnJvbSAnLi9zZWFyY2hUZXN0Q29tbW9uLmpzJztcbmltcG9ydCB7IElOb3RlYm9va0NlbGxNYXRjaFdpdGhNb2RlbCwgSU5vdGVib29rRmlsZU1hdGNoV2l0aE1vZGVsIH0gZnJvbSAnLi4vLi4vYnJvd3Nlci9ub3RlYm9va1NlYXJjaC9zZWFyY2hOb3RlYm9va0hlbHBlcnMuanMnO1xuaW1wb3J0IHsgSUNvbnRleHRLZXlTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29udGV4dGtleS9jb21tb24vY29udGV4dGtleS5qcyc7XG5pbXBvcnQgeyBNb2NrQ29udGV4dEtleVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9rZXliaW5kaW5nL3Rlc3QvY29tbW9uL21vY2tLZXliaW5kaW5nU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJRWRpdG9yU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3NlcnZpY2VzL2VkaXRvci9jb21tb24vZWRpdG9yU2VydmljZS5qcyc7XG5pbXBvcnQgeyBlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL3Rlc3QvY29tbW9uL3V0aWxzLmpzJztcbmltcG9ydCB7IENlbGxNYXRjaCwgTm90ZWJvb2tDb21wYXRpYmxlRmlsZU1hdGNoIH0gZnJvbSAnLi4vLi4vYnJvd3Nlci9ub3RlYm9va1NlYXJjaC9ub3RlYm9va1NlYXJjaE1vZGVsLmpzJztcbmltcG9ydCB7IElOb3RlYm9va0ZpbGVJbnN0YW5jZU1hdGNoIH0gZnJvbSAnLi4vLi4vYnJvd3Nlci9ub3RlYm9va1NlYXJjaC9ub3RlYm9va1NlYXJjaE1vZGVsQmFzZS5qcyc7XG5pbXBvcnQgeyBJU2VhcmNoUmVzdWx0LCBJU2VhcmNoVHJlZUZvbGRlck1hdGNoLCBpc1NlYXJjaFRyZWVGb2xkZXJNYXRjaE5vUm9vdCwgTUFUQ0hfUFJFRklYIH0gZnJvbSAnLi4vLi4vYnJvd3Nlci9zZWFyY2hUcmVlTW9kZWwvc2VhcmNoVHJlZUNvbW1vbi5qcyc7XG5pbXBvcnQgeyBGb2xkZXJNYXRjaEltcGwgfSBmcm9tICcuLi8uLi9icm93c2VyL3NlYXJjaFRyZWVNb2RlbC9mb2xkZXJNYXRjaC5qcyc7XG5pbXBvcnQgeyBTZWFyY2hSZXN1bHRJbXBsIH0gZnJvbSAnLi4vLi4vYnJvd3Nlci9zZWFyY2hUcmVlTW9kZWwvc2VhcmNoUmVzdWx0LmpzJztcbmltcG9ydCB7IE1hdGNoSW1wbCB9IGZyb20gJy4uLy4uL2Jyb3dzZXIvc2VhcmNoVHJlZU1vZGVsL21hdGNoLmpzJztcblxuY29uc3QgbGluZU9uZVJhbmdlID0gbmV3IE9uZUxpbmVSYW5nZSgxLCAwLCAxKTtcblxuc3VpdGUoJ1NlYXJjaFJlc3VsdCcsICgpID0+IHtcblxuXHRsZXQgaW5zdGFudGlhdGlvblNlcnZpY2U6IFRlc3RJbnN0YW50aWF0aW9uU2VydmljZTtcblx0Y29uc3Qgc3RvcmUgPSBlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUoKTtcblxuXHRzZXR1cCgoKSA9PiB7XG5cdFx0aW5zdGFudGlhdGlvblNlcnZpY2UgPSBuZXcgVGVzdEluc3RhbnRpYXRpb25TZXJ2aWNlKCk7XG5cdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJVGVsZW1ldHJ5U2VydmljZSwgTnVsbFRlbGVtZXRyeVNlcnZpY2UpO1xuXHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSU1vZGVsU2VydmljZSwgc3R1Yk1vZGVsU2VydmljZShpbnN0YW50aWF0aW9uU2VydmljZSkpO1xuXHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSU5vdGVib29rRWRpdG9yU2VydmljZSwgc3R1Yk5vdGVib29rRWRpdG9yU2VydmljZShpbnN0YW50aWF0aW9uU2VydmljZSkpO1xuXHRcdGNvbnN0IGZpbGVTZXJ2aWNlID0gbmV3IEZpbGVTZXJ2aWNlKG5ldyBOdWxsTG9nU2VydmljZSgpKTtcblx0XHRzdG9yZS5hZGQoZmlsZVNlcnZpY2UpO1xuXHRcdGNvbnN0IHVyaUlkZW50aXR5U2VydmljZSA9IG5ldyBVcmlJZGVudGl0eVNlcnZpY2UoZmlsZVNlcnZpY2UpO1xuXHRcdHN0b3JlLmFkZCh1cmlJZGVudGl0eVNlcnZpY2UpO1xuXHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSVVyaUlkZW50aXR5U2VydmljZSwgdXJpSWRlbnRpdHlTZXJ2aWNlKTtcblx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViUHJvbWlzZShJUmVwbGFjZVNlcnZpY2UsIHt9KTtcblx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElSZXBsYWNlU2VydmljZSwgJ3JlcGxhY2UnLCAoKSA9PiBQcm9taXNlLnJlc29sdmUobnVsbCkpO1xuXHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSUxhYmVsU2VydmljZSwgbmV3IE1vY2tMYWJlbFNlcnZpY2UoKSk7XG5cdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJTG9nU2VydmljZSwgbmV3IE51bGxMb2dTZXJ2aWNlKCkpO1xuXHR9KTtcblxuXHR0ZWFyZG93bigoKSA9PiB7XG5cdFx0aW5zdGFudGlhdGlvblNlcnZpY2UuZGlzcG9zZSgpO1xuXHR9KTtcblxuXHR0ZXN0KCdMaW5lIE1hdGNoJywgZnVuY3Rpb24gKCkge1xuXHRcdGNvbnN0IGZpbGVNYXRjaCA9IGFGaWxlTWF0Y2goJ2ZvbGRlci9maWxlLnR4dCcsIG51bGwhKTtcblx0XHRjb25zdCBsaW5lTWF0Y2ggPSBuZXcgTWF0Y2hJbXBsKGZpbGVNYXRjaCwgWycwIGZvbyBiYXInXSwgbmV3IE9uZUxpbmVSYW5nZSgwLCAyLCA1KSwgbmV3IE9uZUxpbmVSYW5nZSgxLCAwLCA1KSwgZmFsc2UpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChsaW5lTWF0Y2gudGV4dCgpLCAnMCBmb28gYmFyJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGxpbmVNYXRjaC5yYW5nZSgpLnN0YXJ0TGluZU51bWJlciwgMik7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGxpbmVNYXRjaC5yYW5nZSgpLmVuZExpbmVOdW1iZXIsIDIpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChsaW5lTWF0Y2gucmFuZ2UoKS5zdGFydENvbHVtbiwgMSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGxpbmVNYXRjaC5yYW5nZSgpLmVuZENvbHVtbiwgNik7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGxpbmVNYXRjaC5pZCgpLCBNQVRDSF9QUkVGSVggKyAnZmlsZTovLy9mb2xkZXIvZmlsZS50eHQ+WzIsMSAtPiAyLDZdZm9vJyk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobGluZU1hdGNoLmZ1bGxNYXRjaFRleHQoKSwgJ2ZvbycpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChsaW5lTWF0Y2guZnVsbE1hdGNoVGV4dCh0cnVlKSwgJzAgZm9vIGJhcicpO1xuXHR9KTtcblxuXHR0ZXN0KCdMaW5lIE1hdGNoIC0gUmVtb3ZlJywgZnVuY3Rpb24gKCkge1xuXHRcdGNvbnN0IGZpbGVNYXRjaCA9IGFGaWxlTWF0Y2goJ2ZvbGRlci9maWxlLnR4dCcsIGFTZWFyY2hSZXN1bHQoKSwgbmV3IFRleHRTZWFyY2hNYXRjaCgnZm9vIGJhcicsIG5ldyBPbmVMaW5lUmFuZ2UoMSwgMCwgMykpKTtcblx0XHRjb25zdCBsaW5lTWF0Y2ggPSBmaWxlTWF0Y2gubWF0Y2hlcygpWzBdO1xuXHRcdGZpbGVNYXRjaC5yZW1vdmUobGluZU1hdGNoKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZmlsZU1hdGNoLm1hdGNoZXMoKS5sZW5ndGgsIDApO1xuXHR9KTtcblxuXHR0ZXN0KCdGaWxlIE1hdGNoJywgZnVuY3Rpb24gKCkge1xuXHRcdGxldCBmaWxlTWF0Y2ggPSBhRmlsZU1hdGNoKCdmb2xkZXIvZmlsZS50eHQnLCBhU2VhcmNoUmVzdWx0KCkpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChmaWxlTWF0Y2gubWF0Y2hlcygpLmxlbmd0aCwgMCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGZpbGVNYXRjaC5yZXNvdXJjZS50b1N0cmluZygpLCAnZmlsZTovLy9mb2xkZXIvZmlsZS50eHQnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZmlsZU1hdGNoLm5hbWUoKSwgJ2ZpbGUudHh0Jyk7XG5cblx0XHRmaWxlTWF0Y2ggPSBhRmlsZU1hdGNoKCdmaWxlLnR4dCcsIGFTZWFyY2hSZXN1bHQoKSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGZpbGVNYXRjaC5tYXRjaGVzKCkubGVuZ3RoLCAwKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZmlsZU1hdGNoLnJlc291cmNlLnRvU3RyaW5nKCksICdmaWxlOi8vL2ZpbGUudHh0Jyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGZpbGVNYXRjaC5uYW1lKCksICdmaWxlLnR4dCcpO1xuXHR9KTtcblxuXHR0ZXN0KCdGaWxlIE1hdGNoOiBTZWxlY3QgYW4gZXhpc3RpbmcgbWF0Y2gnLCBmdW5jdGlvbiAoKSB7XG5cdFx0Y29uc3QgdGVzdE9iamVjdCA9IGFGaWxlTWF0Y2goXG5cdFx0XHQnZm9sZGVyL2ZpbGUudHh0Jyxcblx0XHRcdGFTZWFyY2hSZXN1bHQoKSxcblx0XHRcdG5ldyBUZXh0U2VhcmNoTWF0Y2goJ2ZvbycsIG5ldyBPbmVMaW5lUmFuZ2UoMSwgMCwgMykpLFxuXHRcdFx0bmV3IFRleHRTZWFyY2hNYXRjaCgnYmFyJywgbmV3IE9uZUxpbmVSYW5nZSgxLCA1LCAzKSkpO1xuXG5cdFx0dGVzdE9iamVjdC5zZXRTZWxlY3RlZE1hdGNoKHRlc3RPYmplY3QubWF0Y2hlcygpWzBdKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh0ZXN0T2JqZWN0Lm1hdGNoZXMoKVswXSwgdGVzdE9iamVjdC5nZXRTZWxlY3RlZE1hdGNoKCkpO1xuXHR9KTtcblxuXHR0ZXN0KCdGaWxlIE1hdGNoOiBTZWxlY3Qgbm9uIGV4aXN0aW5nIG1hdGNoJywgZnVuY3Rpb24gKCkge1xuXHRcdGNvbnN0IHRlc3RPYmplY3QgPSBhRmlsZU1hdGNoKFxuXHRcdFx0J2ZvbGRlci9maWxlLnR4dCcsXG5cdFx0XHRhU2VhcmNoUmVzdWx0KCksXG5cdFx0XHRuZXcgVGV4dFNlYXJjaE1hdGNoKCdmb28nLCBuZXcgT25lTGluZVJhbmdlKDEsIDAsIDMpKSxcblx0XHRcdG5ldyBUZXh0U2VhcmNoTWF0Y2goJ2JhcicsIG5ldyBPbmVMaW5lUmFuZ2UoMSwgNSwgMykpKTtcblx0XHRjb25zdCB0YXJnZXQgPSB0ZXN0T2JqZWN0Lm1hdGNoZXMoKVswXTtcblx0XHR0ZXN0T2JqZWN0LnJlbW92ZSh0YXJnZXQpO1xuXG5cdFx0dGVzdE9iamVjdC5zZXRTZWxlY3RlZE1hdGNoKHRhcmdldCk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodGVzdE9iamVjdC5nZXRTZWxlY3RlZE1hdGNoKCksIG51bGwpO1xuXHR9KTtcblxuXHR0ZXN0KCdGaWxlIE1hdGNoOiBpc1NlbGVjdGVkIHJldHVybiB0cnVlIGZvciBzZWxlY3RlZCBtYXRjaCcsIGZ1bmN0aW9uICgpIHtcblx0XHRjb25zdCB0ZXN0T2JqZWN0ID0gYUZpbGVNYXRjaChcblx0XHRcdCdmb2xkZXIvZmlsZS50eHQnLFxuXHRcdFx0YVNlYXJjaFJlc3VsdCgpLFxuXHRcdFx0bmV3IFRleHRTZWFyY2hNYXRjaCgnZm9vJywgbmV3IE9uZUxpbmVSYW5nZSgxLCAwLCAzKSksXG5cdFx0XHRuZXcgVGV4dFNlYXJjaE1hdGNoKCdiYXInLCBuZXcgT25lTGluZVJhbmdlKDEsIDUsIDMpKSk7XG5cdFx0Y29uc3QgdGFyZ2V0ID0gdGVzdE9iamVjdC5tYXRjaGVzKClbMF07XG5cdFx0dGVzdE9iamVjdC5zZXRTZWxlY3RlZE1hdGNoKHRhcmdldCk7XG5cblx0XHRhc3NlcnQub2sodGVzdE9iamVjdC5pc01hdGNoU2VsZWN0ZWQodGFyZ2V0KSk7XG5cdH0pO1xuXG5cdHRlc3QoJ0ZpbGUgTWF0Y2g6IGlzU2VsZWN0ZWQgcmV0dXJuIGZhbHNlIGZvciB1bi1zZWxlY3RlZCBtYXRjaCcsIGZ1bmN0aW9uICgpIHtcblx0XHRjb25zdCB0ZXN0T2JqZWN0ID0gYUZpbGVNYXRjaCgnZm9sZGVyL2ZpbGUudHh0Jyxcblx0XHRcdGFTZWFyY2hSZXN1bHQoKSxcblx0XHRcdG5ldyBUZXh0U2VhcmNoTWF0Y2goJ2ZvbycsIG5ldyBPbmVMaW5lUmFuZ2UoMSwgMCwgMykpLFxuXHRcdFx0bmV3IFRleHRTZWFyY2hNYXRjaCgnYmFyJywgbmV3IE9uZUxpbmVSYW5nZSgxLCA1LCAzKSkpO1xuXHRcdHRlc3RPYmplY3Quc2V0U2VsZWN0ZWRNYXRjaCh0ZXN0T2JqZWN0Lm1hdGNoZXMoKVswXSk7XG5cdFx0YXNzZXJ0Lm9rKCF0ZXN0T2JqZWN0LmlzTWF0Y2hTZWxlY3RlZCh0ZXN0T2JqZWN0Lm1hdGNoZXMoKVsxXSkpO1xuXHR9KTtcblxuXHR0ZXN0KCdGaWxlIE1hdGNoOiB1bnNlbGVjdCcsIGZ1bmN0aW9uICgpIHtcblx0XHRjb25zdCB0ZXN0T2JqZWN0ID0gYUZpbGVNYXRjaChcblx0XHRcdCdmb2xkZXIvZmlsZS50eHQnLFxuXHRcdFx0YVNlYXJjaFJlc3VsdCgpLFxuXHRcdFx0bmV3IFRleHRTZWFyY2hNYXRjaCgnZm9vJywgbmV3IE9uZUxpbmVSYW5nZSgxLCAwLCAzKSksXG5cdFx0XHRuZXcgVGV4dFNlYXJjaE1hdGNoKCdiYXInLCBuZXcgT25lTGluZVJhbmdlKDEsIDUsIDMpKSk7XG5cdFx0dGVzdE9iamVjdC5zZXRTZWxlY3RlZE1hdGNoKHRlc3RPYmplY3QubWF0Y2hlcygpWzBdKTtcblx0XHR0ZXN0T2JqZWN0LnNldFNlbGVjdGVkTWF0Y2gobnVsbCk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobnVsbCwgdGVzdE9iamVjdC5nZXRTZWxlY3RlZE1hdGNoKCkpO1xuXHR9KTtcblxuXHR0ZXN0KCdGaWxlIE1hdGNoOiB1bnNlbGVjdCB3aGVuIG5vdCBzZWxlY3RlZCcsIGZ1bmN0aW9uICgpIHtcblx0XHRjb25zdCB0ZXN0T2JqZWN0ID0gYUZpbGVNYXRjaChcblx0XHRcdCdmb2xkZXIvZmlsZS50eHQnLFxuXHRcdFx0YVNlYXJjaFJlc3VsdCgpLFxuXHRcdFx0bmV3IFRleHRTZWFyY2hNYXRjaCgnZm9vJywgbmV3IE9uZUxpbmVSYW5nZSgxLCAwLCAzKSksXG5cdFx0XHRuZXcgVGV4dFNlYXJjaE1hdGNoKCdiYXInLCBuZXcgT25lTGluZVJhbmdlKDEsIDUsIDMpKSk7XG5cdFx0dGVzdE9iamVjdC5zZXRTZWxlY3RlZE1hdGNoKG51bGwpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG51bGwsIHRlc3RPYmplY3QuZ2V0U2VsZWN0ZWRNYXRjaCgpKTtcblx0fSk7XG5cblx0dGVzdCgnTWF0Y2ggLT4gRmlsZU1hdGNoIC0+IFNlYXJjaFJlc3VsdCBoaWVyYXJjaHkgZXhpc3RzJywgZnVuY3Rpb24gKCkge1xuXG5cdFx0Y29uc3Qgc2VhcmNoTW9kZWwgPSBpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShTZWFyY2hNb2RlbEltcGwpO1xuXHRcdHN0b3JlLmFkZChzZWFyY2hNb2RlbCk7XG5cdFx0Y29uc3Qgc2VhcmNoUmVzdWx0ID0gaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoU2VhcmNoUmVzdWx0SW1wbCwgc2VhcmNoTW9kZWwpO1xuXHRcdHN0b3JlLmFkZChzZWFyY2hSZXN1bHQpO1xuXHRcdGNvbnN0IGZpbGVNYXRjaCA9IGFGaWxlTWF0Y2goJ2Zhci9ib28nLCBzZWFyY2hSZXN1bHQpO1xuXHRcdGNvbnN0IGxpbmVNYXRjaCA9IG5ldyBNYXRjaEltcGwoZmlsZU1hdGNoLCBbJ2ZvbyBiYXInXSwgbmV3IE9uZUxpbmVSYW5nZSgwLCAwLCAzKSwgbmV3IE9uZUxpbmVSYW5nZSgxLCAwLCAzKSwgZmFsc2UpO1xuXG5cdFx0YXNzZXJ0KGxpbmVNYXRjaC5wYXJlbnQoKSA9PT0gZmlsZU1hdGNoKTtcblx0XHRhc3NlcnQoZmlsZU1hdGNoLnBhcmVudCgpID09PSBzZWFyY2hSZXN1bHQuZm9sZGVyTWF0Y2hlcygpWzBdKTtcblx0fSk7XG5cblx0dGVzdCgnQWRkaW5nIGEgcmF3IG1hdGNoIHdpbGwgYWRkIGEgZmlsZSBtYXRjaCB3aXRoIGxpbmUgbWF0Y2hlcycsIGZ1bmN0aW9uICgpIHtcblx0XHRjb25zdCB0ZXN0T2JqZWN0ID0gYVNlYXJjaFJlc3VsdCgpO1xuXHRcdGNvbnN0IHRhcmdldCA9IFthUmF3TWF0Y2goJy8xJyxcblx0XHRcdG5ldyBUZXh0U2VhcmNoTWF0Y2goJ3ByZXZpZXcgMScsIG5ldyBPbmVMaW5lUmFuZ2UoMSwgMSwgNCkpLFxuXHRcdFx0bmV3IFRleHRTZWFyY2hNYXRjaCgncHJldmlldyAxJywgbmV3IE9uZUxpbmVSYW5nZSgxLCA0LCAxMSkpLFxuXHRcdFx0bmV3IFRleHRTZWFyY2hNYXRjaCgncHJldmlldyAyJywgbGluZU9uZVJhbmdlKSldO1xuXG5cdFx0YWRkVG9TZWFyY2hSZXN1bHQodGVzdE9iamVjdCwgdGFyZ2V0KTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCgzLCB0ZXN0T2JqZWN0LmNvdW50KCkpO1xuXG5cdFx0Y29uc3QgYWN0dWFsID0gdGVzdE9iamVjdC5tYXRjaGVzKCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKDEsIGFjdHVhbC5sZW5ndGgpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChVUkkuZmlsZShgJHtnZXRSb290TmFtZSgpfS8xYCkudG9TdHJpbmcoKSwgYWN0dWFsWzBdLnJlc291cmNlLnRvU3RyaW5nKCkpO1xuXG5cdFx0Y29uc3QgYWN0dWFNYXRjaGVzID0gYWN0dWFsWzBdLm1hdGNoZXMoKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoMywgYWN0dWFNYXRjaGVzLmxlbmd0aCk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoJ3ByZXZpZXcgMScsIGFjdHVhTWF0Y2hlc1swXS50ZXh0KCkpO1xuXHRcdGFzc2VydC5vayhuZXcgUmFuZ2UoMiwgMiwgMiwgNSkuZXF1YWxzUmFuZ2UoYWN0dWFNYXRjaGVzWzBdLnJhbmdlKCkpKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCgncHJldmlldyAxJywgYWN0dWFNYXRjaGVzWzFdLnRleHQoKSk7XG5cdFx0YXNzZXJ0Lm9rKG5ldyBSYW5nZSgyLCA1LCAyLCAxMikuZXF1YWxzUmFuZ2UoYWN0dWFNYXRjaGVzWzFdLnJhbmdlKCkpKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCgncHJldmlldyAyJywgYWN0dWFNYXRjaGVzWzJdLnRleHQoKSk7XG5cdFx0YXNzZXJ0Lm9rKG5ldyBSYW5nZSgyLCAxLCAyLCAyKS5lcXVhbHNSYW5nZShhY3R1YU1hdGNoZXNbMl0ucmFuZ2UoKSkpO1xuXHR9KTtcblxuXHR0ZXN0KCdBZGRpbmcgbXVsdGlwbGUgcmF3IG1hdGNoZXMnLCBmdW5jdGlvbiAoKSB7XG5cdFx0Y29uc3QgdGVzdE9iamVjdCA9IGFTZWFyY2hSZXN1bHQoKTtcblx0XHRjb25zdCB0YXJnZXQgPSBbXG5cdFx0XHRhUmF3TWF0Y2goJy8xJyxcblx0XHRcdFx0bmV3IFRleHRTZWFyY2hNYXRjaCgncHJldmlldyAxJywgbmV3IE9uZUxpbmVSYW5nZSgxLCAxLCA0KSksXG5cdFx0XHRcdG5ldyBUZXh0U2VhcmNoTWF0Y2goJ3ByZXZpZXcgMScsIG5ldyBPbmVMaW5lUmFuZ2UoMSwgNCwgMTEpKSksXG5cdFx0XHRhUmF3TWF0Y2goJy8yJyxcblx0XHRcdFx0bmV3IFRleHRTZWFyY2hNYXRjaCgncHJldmlldyAyJywgbGluZU9uZVJhbmdlKSldO1xuXG5cdFx0YWRkVG9TZWFyY2hSZXN1bHQodGVzdE9iamVjdCwgdGFyZ2V0KTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCgzLCB0ZXN0T2JqZWN0LmNvdW50KCkpO1xuXG5cdFx0Y29uc3QgYWN0dWFsID0gdGVzdE9iamVjdC5tYXRjaGVzKCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKDIsIGFjdHVhbC5sZW5ndGgpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChVUkkuZmlsZShgJHtnZXRSb290TmFtZSgpfS8xYCkudG9TdHJpbmcoKSwgYWN0dWFsWzBdLnJlc291cmNlLnRvU3RyaW5nKCkpO1xuXG5cdFx0bGV0IGFjdHVhTWF0Y2hlcyA9IGFjdHVhbFswXS5tYXRjaGVzKCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKDIsIGFjdHVhTWF0Y2hlcy5sZW5ndGgpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCgncHJldmlldyAxJywgYWN0dWFNYXRjaGVzWzBdLnRleHQoKSk7XG5cdFx0YXNzZXJ0Lm9rKG5ldyBSYW5nZSgyLCAyLCAyLCA1KS5lcXVhbHNSYW5nZShhY3R1YU1hdGNoZXNbMF0ucmFuZ2UoKSkpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCgncHJldmlldyAxJywgYWN0dWFNYXRjaGVzWzFdLnRleHQoKSk7XG5cdFx0YXNzZXJ0Lm9rKG5ldyBSYW5nZSgyLCA1LCAyLCAxMikuZXF1YWxzUmFuZ2UoYWN0dWFNYXRjaGVzWzFdLnJhbmdlKCkpKTtcblxuXHRcdGFjdHVhTWF0Y2hlcyA9IGFjdHVhbFsxXS5tYXRjaGVzKCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKDEsIGFjdHVhTWF0Y2hlcy5sZW5ndGgpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCgncHJldmlldyAyJywgYWN0dWFNYXRjaGVzWzBdLnRleHQoKSk7XG5cdFx0YXNzZXJ0Lm9rKG5ldyBSYW5nZSgyLCAxLCAyLCAyKS5lcXVhbHNSYW5nZShhY3R1YU1hdGNoZXNbMF0ucmFuZ2UoKSkpO1xuXHR9KTtcblxuXHR0ZXN0KCdUZXN0IHRoYXQgbm90ZWJvb2sgbWF0Y2hlcyBnZXQgYWRkZWQgY29ycmVjdGx5JywgZnVuY3Rpb24gKCkge1xuXHRcdGNvbnN0IHRlc3RPYmplY3QgPSBhU2VhcmNoUmVzdWx0KCk7XG5cdFx0Y29uc3QgY2VsbDEgPSB7IGNlbGxLaW5kOiBDZWxsS2luZC5Db2RlIH0gYXMgSUNlbGxWaWV3TW9kZWw7XG5cdFx0Y29uc3QgY2VsbDIgPSB7IGNlbGxLaW5kOiBDZWxsS2luZC5Db2RlIH0gYXMgSUNlbGxWaWV3TW9kZWw7XG5cblx0XHRzaW5vbi5zdHViKENlbGxNYXRjaC5wcm90b3R5cGUsICdhZGRDb250ZXh0Jyk7XG5cblx0XHRjb25zdCBhZGRGaWxlTWF0Y2ggPSBzaW5vbi5zcHkoRm9sZGVyTWF0Y2hJbXBsLnByb3RvdHlwZSwgJ2FkZEZpbGVNYXRjaCcpO1xuXHRcdGNvbnN0IGZpbGVNYXRjaDEgPSBhUmF3RmlsZU1hdGNoV2l0aENlbGxzKCcvMScsXG5cdFx0XHR7XG5cdFx0XHRcdGNlbGw6IGNlbGwxLFxuXHRcdFx0XHRpbmRleDogMCxcblx0XHRcdFx0Y29udGVudFJlc3VsdHM6IFtcblx0XHRcdFx0XHRuZXcgVGV4dFNlYXJjaE1hdGNoKCdwcmV2aWV3IDEnLCBuZXcgT25lTGluZVJhbmdlKDEsIDEsIDQpKSxcblx0XHRcdFx0XSxcblx0XHRcdFx0d2Vidmlld1Jlc3VsdHM6IFtcblx0XHRcdFx0XHRuZXcgVGV4dFNlYXJjaE1hdGNoKCdwcmV2aWV3IDEnLCBuZXcgT25lTGluZVJhbmdlKDEsIDQsIDExKSksXG5cdFx0XHRcdFx0bmV3IFRleHRTZWFyY2hNYXRjaCgncHJldmlldyAyJywgbGluZU9uZVJhbmdlKVxuXHRcdFx0XHRdXG5cdFx0XHR9LCk7XG5cdFx0Y29uc3QgZmlsZU1hdGNoMiA9IGFSYXdGaWxlTWF0Y2hXaXRoQ2VsbHMoJy8yJyxcblx0XHRcdHtcblx0XHRcdFx0Y2VsbDogY2VsbDIsXG5cdFx0XHRcdGluZGV4OiAwLFxuXHRcdFx0XHRjb250ZW50UmVzdWx0czogW1xuXHRcdFx0XHRcdG5ldyBUZXh0U2VhcmNoTWF0Y2goJ3ByZXZpZXcgMScsIG5ldyBPbmVMaW5lUmFuZ2UoMSwgMSwgNCkpLFxuXHRcdFx0XHRdLFxuXHRcdFx0XHR3ZWJ2aWV3UmVzdWx0czogW1xuXHRcdFx0XHRcdG5ldyBUZXh0U2VhcmNoTWF0Y2goJ3ByZXZpZXcgMScsIG5ldyBPbmVMaW5lUmFuZ2UoMSwgNCwgMTEpKSxcblx0XHRcdFx0XHRuZXcgVGV4dFNlYXJjaE1hdGNoKCdwcmV2aWV3IDInLCBsaW5lT25lUmFuZ2UpXG5cdFx0XHRcdF1cblx0XHRcdH0pO1xuXHRcdGNvbnN0IHRhcmdldCA9IFtmaWxlTWF0Y2gxLCBmaWxlTWF0Y2gyXTtcblxuXHRcdGFkZFRvU2VhcmNoUmVzdWx0KHRlc3RPYmplY3QsIHRhcmdldCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKDYsIHRlc3RPYmplY3QuY291bnQoKSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChmaWxlTWF0Y2gxLmNlbGxSZXN1bHRzWzBdLmNvbnRlbnRSZXN1bHRzLCAoYWRkRmlsZU1hdGNoLmdldENhbGwoMCkuYXJnc1swXVswXSBhcyBJTm90ZWJvb2tGaWxlTWF0Y2hXaXRoTW9kZWwpLmNlbGxSZXN1bHRzWzBdLmNvbnRlbnRSZXN1bHRzKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGZpbGVNYXRjaDEuY2VsbFJlc3VsdHNbMF0ud2Vidmlld1Jlc3VsdHMsIChhZGRGaWxlTWF0Y2guZ2V0Q2FsbCgwKS5hcmdzWzBdWzBdIGFzIElOb3RlYm9va0ZpbGVNYXRjaFdpdGhNb2RlbCkuY2VsbFJlc3VsdHNbMF0ud2Vidmlld1Jlc3VsdHMpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoZmlsZU1hdGNoMi5jZWxsUmVzdWx0c1swXS5jb250ZW50UmVzdWx0cywgKGFkZEZpbGVNYXRjaC5nZXRDYWxsKDApLmFyZ3NbMF1bMV0gYXMgSU5vdGVib29rRmlsZU1hdGNoV2l0aE1vZGVsKS5jZWxsUmVzdWx0c1swXS5jb250ZW50UmVzdWx0cyk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChmaWxlTWF0Y2gyLmNlbGxSZXN1bHRzWzBdLndlYnZpZXdSZXN1bHRzLCAoYWRkRmlsZU1hdGNoLmdldENhbGwoMCkuYXJnc1swXVsxXSBhcyBJTm90ZWJvb2tGaWxlTWF0Y2hXaXRoTW9kZWwpLmNlbGxSZXN1bHRzWzBdLndlYnZpZXdSZXN1bHRzKTtcblx0fSk7XG5cblx0dGVzdCgnRGlzcG9zZSBkaXNwb3NlcyBtYXRjaGVzJywgZnVuY3Rpb24gKCkge1xuXHRcdGNvbnN0IHRhcmdldDEgPSBzaW5vbi5zcHkoKTtcblx0XHRjb25zdCB0YXJnZXQyID0gc2lub24uc3B5KCk7XG5cblx0XHRjb25zdCB0ZXN0T2JqZWN0ID0gYVNlYXJjaFJlc3VsdCgpO1xuXHRcdGFkZFRvU2VhcmNoUmVzdWx0KHRlc3RPYmplY3QsIFtcblx0XHRcdGFSYXdNYXRjaCgnLzEnLFxuXHRcdFx0XHRuZXcgVGV4dFNlYXJjaE1hdGNoKCdwcmV2aWV3IDEnLCBsaW5lT25lUmFuZ2UpKSxcblx0XHRcdGFSYXdNYXRjaCgnLzInLFxuXHRcdFx0XHRuZXcgVGV4dFNlYXJjaE1hdGNoKCdwcmV2aWV3IDInLCBsaW5lT25lUmFuZ2UpKV0pO1xuXG5cdFx0c3RvcmUuYWRkKHRlc3RPYmplY3QubWF0Y2hlcygpWzBdLm9uRGlzcG9zZSh0YXJnZXQxKSk7XG5cdFx0c3RvcmUuYWRkKHRlc3RPYmplY3QubWF0Y2hlcygpWzFdLm9uRGlzcG9zZSh0YXJnZXQyKSk7XG5cblx0XHR0ZXN0T2JqZWN0LmRpc3Bvc2UoKTtcblxuXHRcdGFzc2VydC5vayh0ZXN0T2JqZWN0LmlzRW1wdHkoKSk7XG5cdFx0YXNzZXJ0Lm9rKHRhcmdldDEuY2FsbGVkT25jZSk7XG5cdFx0YXNzZXJ0Lm9rKHRhcmdldDIuY2FsbGVkT25jZSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3JlbW92ZSB0cmlnZ2VycyBjaGFuZ2UgZXZlbnQnLCBmdW5jdGlvbiAoKSB7XG5cdFx0Y29uc3QgdGFyZ2V0ID0gc2lub24uc3B5KCk7XG5cdFx0Y29uc3QgdGVzdE9iamVjdCA9IGFTZWFyY2hSZXN1bHQoKTtcblx0XHRhZGRUb1NlYXJjaFJlc3VsdCh0ZXN0T2JqZWN0LCBbXG5cdFx0XHRhUmF3TWF0Y2goJy8xJyxcblx0XHRcdFx0bmV3IFRleHRTZWFyY2hNYXRjaCgncHJldmlldyAxJywgbGluZU9uZVJhbmdlKSldKTtcblx0XHRjb25zdCBvYmplY3RUb1JlbW92ZSA9IHRlc3RPYmplY3QubWF0Y2hlcygpWzBdO1xuXHRcdHN0b3JlLmFkZCh0ZXN0T2JqZWN0Lm9uQ2hhbmdlKHRhcmdldCkpO1xuXG5cdFx0dGVzdE9iamVjdC5yZW1vdmUob2JqZWN0VG9SZW1vdmUpO1xuXG5cdFx0YXNzZXJ0Lm9rKHRhcmdldC5jYWxsZWRPbmNlKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKFt7IGVsZW1lbnRzOiBbb2JqZWN0VG9SZW1vdmVdLCByZW1vdmVkOiB0cnVlIH1dLCB0YXJnZXQuYXJnc1swXSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3JlbW92ZSBhcnJheSB0cmlnZ2VycyBjaGFuZ2UgZXZlbnQnLCBmdW5jdGlvbiAoKSB7XG5cdFx0Y29uc3QgdGFyZ2V0ID0gc2lub24uc3B5KCk7XG5cdFx0Y29uc3QgdGVzdE9iamVjdCA9IGFTZWFyY2hSZXN1bHQoKTtcblx0XHRhZGRUb1NlYXJjaFJlc3VsdCh0ZXN0T2JqZWN0LCBbXG5cdFx0XHRhUmF3TWF0Y2goJy8xJyxcblx0XHRcdFx0bmV3IFRleHRTZWFyY2hNYXRjaCgncHJldmlldyAxJywgbGluZU9uZVJhbmdlKSksXG5cdFx0XHRhUmF3TWF0Y2goJy8yJyxcblx0XHRcdFx0bmV3IFRleHRTZWFyY2hNYXRjaCgncHJldmlldyAyJywgbGluZU9uZVJhbmdlKSldKTtcblx0XHRjb25zdCBhcnJheVRvUmVtb3ZlID0gdGVzdE9iamVjdC5tYXRjaGVzKCk7XG5cdFx0c3RvcmUuYWRkKHRlc3RPYmplY3Qub25DaGFuZ2UodGFyZ2V0KSk7XG5cblx0XHR0ZXN0T2JqZWN0LnJlbW92ZShhcnJheVRvUmVtb3ZlKTtcblxuXHRcdGFzc2VydC5vayh0YXJnZXQuY2FsbGVkT25jZSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChbeyBlbGVtZW50czogYXJyYXlUb1JlbW92ZSwgcmVtb3ZlZDogdHJ1ZSB9XSwgdGFyZ2V0LmFyZ3NbMF0pO1xuXHR9KTtcblxuXHR0ZXN0KCdSZW1vdmluZyBhbGwgbGluZSBtYXRjaGVzIGFuZCBhZGRpbmcgYmFjayB3aWxsIGFkZCBmaWxlIGJhY2sgdG8gcmVzdWx0JywgZnVuY3Rpb24gKCkge1xuXHRcdGNvbnN0IHRlc3RPYmplY3QgPSBhU2VhcmNoUmVzdWx0KCk7XG5cdFx0YWRkVG9TZWFyY2hSZXN1bHQodGVzdE9iamVjdCwgW1xuXHRcdFx0YVJhd01hdGNoKCcvMScsXG5cdFx0XHRcdG5ldyBUZXh0U2VhcmNoTWF0Y2goJ3ByZXZpZXcgMScsIGxpbmVPbmVSYW5nZSkpXSk7XG5cdFx0Y29uc3QgdGFyZ2V0ID0gdGVzdE9iamVjdC5tYXRjaGVzKClbMF07XG5cdFx0Y29uc3QgbWF0Y2hUb1JlbW92ZSA9IHRhcmdldC5tYXRjaGVzKClbMF07XG5cdFx0dGFyZ2V0LnJlbW92ZShtYXRjaFRvUmVtb3ZlKTtcblxuXHRcdGFzc2VydC5vayh0ZXN0T2JqZWN0LmlzRW1wdHkoKSk7XG5cdFx0dGFyZ2V0LmFkZChtYXRjaFRvUmVtb3ZlLCB0cnVlKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCgxLCB0ZXN0T2JqZWN0LmZpbGVDb3VudCgpKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodGFyZ2V0LCB0ZXN0T2JqZWN0Lm1hdGNoZXMoKVswXSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3JlcGxhY2Ugc2hvdWxkIHJlbW92ZSB0aGUgZmlsZSBtYXRjaCcsIGZ1bmN0aW9uICgpIHtcblx0XHRjb25zdCB2b2lkUHJvbWlzZSA9IFByb21pc2UucmVzb2x2ZShudWxsKTtcblx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElSZXBsYWNlU2VydmljZSwgJ3JlcGxhY2UnLCB2b2lkUHJvbWlzZSk7XG5cdFx0Y29uc3QgdGVzdE9iamVjdCA9IGFTZWFyY2hSZXN1bHQoKTtcblx0XHRhZGRUb1NlYXJjaFJlc3VsdCh0ZXN0T2JqZWN0LCBbXG5cdFx0XHRhUmF3TWF0Y2goJy8xJyxcblx0XHRcdFx0bmV3IFRleHRTZWFyY2hNYXRjaCgncHJldmlldyAxJywgbGluZU9uZVJhbmdlKSldKTtcblxuXHRcdHRlc3RPYmplY3QucmVwbGFjZSh0ZXN0T2JqZWN0Lm1hdGNoZXMoKVswXSk7XG5cblx0XHRyZXR1cm4gdm9pZFByb21pc2UudGhlbigoKSA9PiBhc3NlcnQub2sodGVzdE9iamVjdC5pc0VtcHR5KCkpKTtcblx0fSk7XG5cblx0dGVzdCgncmVwbGFjZSBzaG91bGQgdHJpZ2dlciB0aGUgY2hhbmdlIGV2ZW50JywgZnVuY3Rpb24gKCkge1xuXHRcdGNvbnN0IHRhcmdldCA9IHNpbm9uLnNweSgpO1xuXHRcdGNvbnN0IHZvaWRQcm9taXNlID0gUHJvbWlzZS5yZXNvbHZlKG51bGwpO1xuXHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSVJlcGxhY2VTZXJ2aWNlLCAncmVwbGFjZScsIHZvaWRQcm9taXNlKTtcblx0XHRjb25zdCB0ZXN0T2JqZWN0ID0gYVNlYXJjaFJlc3VsdCgpO1xuXHRcdGFkZFRvU2VhcmNoUmVzdWx0KHRlc3RPYmplY3QsIFtcblx0XHRcdGFSYXdNYXRjaCgnLzEnLFxuXHRcdFx0XHRuZXcgVGV4dFNlYXJjaE1hdGNoKCdwcmV2aWV3IDEnLCBsaW5lT25lUmFuZ2UpKV0pO1xuXG5cdFx0c3RvcmUuYWRkKHRlc3RPYmplY3Qub25DaGFuZ2UodGFyZ2V0KSk7XG5cdFx0Y29uc3Qgb2JqZWN0VG9SZW1vdmUgPSB0ZXN0T2JqZWN0Lm1hdGNoZXMoKVswXTtcblxuXHRcdHRlc3RPYmplY3QucmVwbGFjZShvYmplY3RUb1JlbW92ZSk7XG5cblx0XHRyZXR1cm4gdm9pZFByb21pc2UudGhlbigoKSA9PiB7XG5cdFx0XHRhc3NlcnQub2sodGFyZ2V0LmNhbGxlZE9uY2UpO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChbeyBlbGVtZW50czogW29iamVjdFRvUmVtb3ZlXSwgcmVtb3ZlZDogdHJ1ZSB9XSwgdGFyZ2V0LmFyZ3NbMF0pO1xuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdyZXBsYWNlQWxsIHNob3VsZCByZW1vdmUgYWxsIGZpbGUgbWF0Y2hlcycsIGZ1bmN0aW9uICgpIHtcblx0XHRjb25zdCB2b2lkUHJvbWlzZSA9IFByb21pc2UucmVzb2x2ZShudWxsKTtcblx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViUHJvbWlzZShJUmVwbGFjZVNlcnZpY2UsICdyZXBsYWNlJywgdm9pZFByb21pc2UpO1xuXHRcdGNvbnN0IHRlc3RPYmplY3QgPSBhU2VhcmNoUmVzdWx0KCk7XG5cdFx0YWRkVG9TZWFyY2hSZXN1bHQodGVzdE9iamVjdCwgW1xuXHRcdFx0YVJhd01hdGNoKCcvMScsXG5cdFx0XHRcdG5ldyBUZXh0U2VhcmNoTWF0Y2goJ3ByZXZpZXcgMScsIGxpbmVPbmVSYW5nZSkpLFxuXHRcdFx0YVJhd01hdGNoKCcvMicsXG5cdFx0XHRcdG5ldyBUZXh0U2VhcmNoTWF0Y2goJ3ByZXZpZXcgMicsIGxpbmVPbmVSYW5nZSkpXSk7XG5cblx0XHR0ZXN0T2JqZWN0LnJlcGxhY2VBbGwobnVsbCEpO1xuXG5cdFx0cmV0dXJuIHZvaWRQcm9taXNlLnRoZW4oKCkgPT4gYXNzZXJ0Lm9rKHRlc3RPYmplY3QuaXNFbXB0eSgpKSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2JhdGNoUmVtb3ZlIHNob3VsZCB0cmlnZ2VyIHRoZSBvbkNoYW5nZSBldmVudCBjb3JyZWN0bHknLCBmdW5jdGlvbiAoKSB7XG5cdFx0Y29uc3QgdGFyZ2V0ID0gc2lub24uc3B5KCk7XG5cdFx0Y29uc3QgdGVzdE9iamVjdCA9IGdldFBvcHVsYXRlZFNlYXJjaFJlc3VsdCgpO1xuXG5cdFx0Y29uc3QgZm9sZGVyTWF0Y2ggPSB0ZXN0T2JqZWN0LmZvbGRlck1hdGNoZXMoKVswXTtcblx0XHRjb25zdCBmaWxlTWF0Y2ggPSB0ZXN0T2JqZWN0LmZvbGRlck1hdGNoZXMoKVsxXS5hbGxEb3duc3RyZWFtRmlsZU1hdGNoZXMoKVswXTtcblx0XHRjb25zdCBtYXRjaCA9IHRlc3RPYmplY3QuZm9sZGVyTWF0Y2hlcygpWzFdLmFsbERvd25zdHJlYW1GaWxlTWF0Y2hlcygpWzFdLm1hdGNoZXMoKVswXTtcblxuXHRcdGNvbnN0IGFycmF5VG9SZW1vdmUgPSBbZm9sZGVyTWF0Y2gsIGZpbGVNYXRjaCwgbWF0Y2hdO1xuXHRcdGNvbnN0IGV4cGVjdGVkQXJyYXlSZXN1bHQgPSBmb2xkZXJNYXRjaC5hbGxEb3duc3RyZWFtRmlsZU1hdGNoZXMoKS5jb25jYXQoW2ZpbGVNYXRjaCwgbWF0Y2gucGFyZW50KCldKTtcblxuXHRcdHN0b3JlLmFkZCh0ZXN0T2JqZWN0Lm9uQ2hhbmdlKHRhcmdldCkpO1xuXHRcdHRlc3RPYmplY3QuYmF0Y2hSZW1vdmUoYXJyYXlUb1JlbW92ZSk7XG5cblx0XHRhc3NlcnQub2sodGFyZ2V0LmNhbGxlZE9uY2UpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoW3sgZWxlbWVudHM6IGV4cGVjdGVkQXJyYXlSZXN1bHQsIHJlbW92ZWQ6IHRydWUsIGFkZGVkOiBmYWxzZSB9XSwgdGFyZ2V0LmFyZ3NbMF0pO1xuXHR9KTtcblxuXHR0ZXN0KCdiYXRjaFJlbW92ZSBzaG91bGQgcmVtb3ZlIEZvbGRlck1hdGNoTm9Sb290IChPdGhlciBmaWxlcykgY29ycmVjdGx5JywgZnVuY3Rpb24gKCkge1xuXHRcdGNvbnN0IHRhcmdldCA9IHNpbm9uLnNweSgpO1xuXHRcdGNvbnN0IHRlc3RPYmplY3QgPSBhU2VhcmNoUmVzdWx0KCk7XG5cblx0XHR0ZXN0T2JqZWN0LnF1ZXJ5ID0ge1xuXHRcdFx0dHlwZTogUXVlcnlUeXBlLlRleHQsXG5cdFx0XHRjb250ZW50UGF0dGVybjogeyBwYXR0ZXJuOiAnZm9vJyB9LFxuXHRcdFx0Zm9sZGVyUXVlcmllczogW3tcblx0XHRcdFx0Zm9sZGVyOiBjcmVhdGVGaWxlVXJpRnJvbVBhdGhGcm9tUm9vdCgnL3dvcmtzcGFjZScpXG5cdFx0XHR9XVxuXHRcdH07XG5cblx0XHQvLyBBZGQgYSBmaWxlIGluc2lkZSB0aGUgd29ya3NwYWNlIGZvbGRlclxuXHRcdGFkZFRvU2VhcmNoUmVzdWx0KHRlc3RPYmplY3QsIFtcblx0XHRcdGFSYXdNYXRjaCgnL3dvcmtzcGFjZS9maWxlLnR4dCcsXG5cdFx0XHRcdG5ldyBUZXh0U2VhcmNoTWF0Y2goJ3ByZXZpZXcgMScsIGxpbmVPbmVSYW5nZSkpLFxuXHRcdF0pO1xuXG5cdFx0Ly8gQWRkIGEgZmlsZSBvdXRzaWRlIG9mIHRoZSB3b3Jrc3BhY2UgZm9sZGVyIChnb2VzIHRvIFwiT3RoZXIgZmlsZXNcIilcblx0XHRhZGRUb1NlYXJjaFJlc3VsdCh0ZXN0T2JqZWN0LCBbXG5cdFx0XHRhUmF3TWF0Y2goJy9vdGhlci9vdXRzaWRlLnR4dCcsXG5cdFx0XHRcdG5ldyBUZXh0U2VhcmNoTWF0Y2goJ3ByZXZpZXcgMicsIGxpbmVPbmVSYW5nZSkpLFxuXHRcdF0pO1xuXG5cdFx0Ly8gU2hvdWxkIGhhdmUgMiBmb2xkZXIgbWF0Y2hlczogd29ya3NwYWNlIHJvb3QgYW5kIFwiT3RoZXIgZmlsZXNcIlxuXHRcdGNvbnN0IGZvbGRlck1hdGNoZXMgPSB0ZXN0T2JqZWN0LmZvbGRlck1hdGNoZXMoKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZm9sZGVyTWF0Y2hlcy5sZW5ndGgsIDIpO1xuXG5cdFx0Ly8gRmluZCB0aGUgXCJPdGhlciBmaWxlc1wiIGZvbGRlciBtYXRjaCAoRm9sZGVyTWF0Y2hOb1Jvb3QpXG5cdFx0Y29uc3Qgb3RoZXJGaWxlc01hdGNoID0gZm9sZGVyTWF0Y2hlcy5maW5kKGZtID0+IGlzU2VhcmNoVHJlZUZvbGRlck1hdGNoTm9Sb290KGZtKSk7XG5cdFx0YXNzZXJ0Lm9rKG90aGVyRmlsZXNNYXRjaCwgJ1Nob3VsZCBoYXZlIGFuIE90aGVyIGZpbGVzIGZvbGRlciBtYXRjaCcpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChvdGhlckZpbGVzTWF0Y2guYWxsRG93bnN0cmVhbUZpbGVNYXRjaGVzKCkubGVuZ3RoLCAxKTtcblxuXHRcdHN0b3JlLmFkZCh0ZXN0T2JqZWN0Lm9uQ2hhbmdlKHRhcmdldCkpO1xuXHRcdHRlc3RPYmplY3QuYmF0Y2hSZW1vdmUoW290aGVyRmlsZXNNYXRjaF0pO1xuXG5cdFx0YXNzZXJ0Lm9rKHRhcmdldC5jYWxsZWRPbmNlKTtcblx0XHQvLyBBZnRlciByZW1vdmFsLCB0aGUgT3RoZXIgZmlsZXMgZm9sZGVyIHNob3VsZCBiZSBjbGVhcmVkXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG90aGVyRmlsZXNNYXRjaC5hbGxEb3duc3RyZWFtRmlsZU1hdGNoZXMoKS5sZW5ndGgsIDApO1xuXHR9KTtcblxuXHR0ZXN0KCdiYXRjaFJlcGxhY2Ugc2hvdWxkIHRyaWdnZXIgdGhlIG9uQ2hhbmdlIGV2ZW50IGNvcnJlY3RseScsIGFzeW5jIGZ1bmN0aW9uICgpIHtcblx0XHRjb25zdCByZXBsYWNlU3B5ID0gc2lub24uc3B5KCk7XG5cdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJUmVwbGFjZVNlcnZpY2UsICdyZXBsYWNlJywgKGFyZzogYW55KSA9PiB7XG5cdFx0XHRpZiAoQXJyYXkuaXNBcnJheShhcmcpKSB7XG5cdFx0XHRcdHJlcGxhY2VTcHkoYXJnWzBdKTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdHJlcGxhY2VTcHkoYXJnKTtcblx0XHRcdH1cblx0XHRcdHJldHVybiBQcm9taXNlLnJlc29sdmUoKTtcblx0XHR9KTtcblxuXHRcdGNvbnN0IHRhcmdldCA9IHNpbm9uLnNweSgpO1xuXHRcdGNvbnN0IHRlc3RPYmplY3QgPSBnZXRQb3B1bGF0ZWRTZWFyY2hSZXN1bHQoKTtcblxuXHRcdGNvbnN0IGZvbGRlck1hdGNoID0gdGVzdE9iamVjdC5mb2xkZXJNYXRjaGVzKClbMF07XG5cdFx0Y29uc3QgZmlsZU1hdGNoID0gdGVzdE9iamVjdC5mb2xkZXJNYXRjaGVzKClbMV0uYWxsRG93bnN0cmVhbUZpbGVNYXRjaGVzKClbMF07XG5cdFx0Y29uc3QgbWF0Y2ggPSB0ZXN0T2JqZWN0LmZvbGRlck1hdGNoZXMoKVsxXS5hbGxEb3duc3RyZWFtRmlsZU1hdGNoZXMoKVsxXS5tYXRjaGVzKClbMF07XG5cblx0XHRjb25zdCBmaXJzdEV4cGVjdGVkTWF0Y2ggPSBmb2xkZXJNYXRjaC5hbGxEb3duc3RyZWFtRmlsZU1hdGNoZXMoKVswXTtcblxuXHRcdGNvbnN0IGFycmF5VG9SZW1vdmUgPSBbZm9sZGVyTWF0Y2gsIGZpbGVNYXRjaCwgbWF0Y2hdO1xuXG5cdFx0c3RvcmUuYWRkKHRlc3RPYmplY3Qub25DaGFuZ2UodGFyZ2V0KSk7XG5cdFx0YXdhaXQgdGVzdE9iamVjdC5iYXRjaFJlcGxhY2UoYXJyYXlUb1JlbW92ZSk7XG5cblx0XHRhc3NlcnQub2sodGFyZ2V0LmNhbGxlZE9uY2UpO1xuXHRcdHNpbm9uLmFzc2VydC5jYWxsZWRUaHJpY2UocmVwbGFjZVNweSk7XG5cdFx0c2lub24uYXNzZXJ0LmNhbGxlZFdpdGgocmVwbGFjZVNweS5maXJzdENhbGwsIGZpcnN0RXhwZWN0ZWRNYXRjaCk7XG5cdFx0c2lub24uYXNzZXJ0LmNhbGxlZFdpdGgocmVwbGFjZVNweS5zZWNvbmRDYWxsLCBmaWxlTWF0Y2gpO1xuXHRcdHNpbm9uLmFzc2VydC5jYWxsZWRXaXRoKHJlcGxhY2VTcHkudGhpcmRDYWxsLCBtYXRjaCk7XG5cdH0pO1xuXG5cdHRlc3QoJ0NyZWF0aW5nIGEgbW9kZWwgd2l0aCBuZXN0ZWQgZm9sZGVycyBzaG91bGQgY3JlYXRlIHRoZSBjb3JyZWN0IHN0cnVjdHVyZScsIGZ1bmN0aW9uICgpIHtcblx0XHRjb25zdCB0ZXN0T2JqZWN0ID0gZ2V0UG9wdWxhdGVkU2VhcmNoUmVzdWx0Rm9yVHJlZVRlc3RpbmcoKTtcblxuXHRcdGNvbnN0IHJvb3QwID0gdGVzdE9iamVjdC5mb2xkZXJNYXRjaGVzKClbMF07XG5cdFx0Y29uc3Qgcm9vdDEgPSB0ZXN0T2JqZWN0LmZvbGRlck1hdGNoZXMoKVsxXTtcblx0XHRjb25zdCByb290MiA9IHRlc3RPYmplY3QuZm9sZGVyTWF0Y2hlcygpWzJdO1xuXHRcdGNvbnN0IHJvb3QzID0gdGVzdE9iamVjdC5mb2xkZXJNYXRjaGVzKClbM107XG5cblx0XHRjb25zdCByb290MERvd25zdHJlYW1GaWxlcyA9IHJvb3QwLmFsbERvd25zdHJlYW1GaWxlTWF0Y2hlcygpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocm9vdDBEb3duc3RyZWFtRmlsZXMsIFsuLi5yb290MC5maWxlTWF0Y2hlc0l0ZXJhdG9yKCksIC4uLmdldEZvbGRlck1hdGNoQXRJbmRleChyb290MCwgMCkuZmlsZU1hdGNoZXNJdGVyYXRvcigpXSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChnZXRGb2xkZXJNYXRjaEF0SW5kZXgocm9vdDAsIDApLmFsbERvd25zdHJlYW1GaWxlTWF0Y2hlcygpLCBBcnJheS5mcm9tKGdldEZvbGRlck1hdGNoQXRJbmRleChyb290MCwgMCkuZmlsZU1hdGNoZXNJdGVyYXRvcigpKSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChnZXRGaWxlTWF0Y2hBdEluZGV4KGdldEZvbGRlck1hdGNoQXRJbmRleChyb290MCwgMCksIDApLnBhcmVudCgpLCBnZXRGb2xkZXJNYXRjaEF0SW5kZXgocm9vdDAsIDApKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGdldEZvbGRlck1hdGNoQXRJbmRleChyb290MCwgMCkucGFyZW50KCksIHJvb3QwKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKChnZXRGb2xkZXJNYXRjaEF0SW5kZXgocm9vdDAsIDApIGFzIEZvbGRlck1hdGNoSW1wbCkuY2xvc2VzdFJvb3QsIHJvb3QwKTtcblx0XHRyb290MERvd25zdHJlYW1GaWxlcy5mb3JFYWNoKChlKSA9PiB7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGUuY2xvc2VzdFJvb3QsIHJvb3QwKTtcblx0XHR9KTtcblxuXHRcdGNvbnN0IHJvb3QxRG93bnN0cmVhbUZpbGVzID0gcm9vdDEuYWxsRG93bnN0cmVhbUZpbGVNYXRjaGVzKCk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChyb290MS5hbGxEb3duc3RyZWFtRmlsZU1hdGNoZXMoKSwgWy4uLnJvb3QxLmZpbGVNYXRjaGVzSXRlcmF0b3IoKSwgLi4uZ2V0Rm9sZGVyTWF0Y2hBdEluZGV4KHJvb3QxLCAwKS5maWxlTWF0Y2hlc0l0ZXJhdG9yKCldKTsgLy8gZXhjbHVkZXMgdGhlIG1hdGNoZXMgZnJvbSBuZXN0ZWQgcm9vdFxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoZ2V0RmlsZU1hdGNoQXRJbmRleChnZXRGb2xkZXJNYXRjaEF0SW5kZXgocm9vdDEsIDApLCAwKS5wYXJlbnQoKSwgZ2V0Rm9sZGVyTWF0Y2hBdEluZGV4KHJvb3QxLCAwKSk7XG5cdFx0cm9vdDFEb3duc3RyZWFtRmlsZXMuZm9yRWFjaCgoZSkgPT4ge1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChlLmNsb3Nlc3RSb290LCByb290MSk7XG5cdFx0fSk7XG5cblx0XHRjb25zdCByb290MkRvd25zdHJlYW1GaWxlcyA9IHJvb3QyLmFsbERvd25zdHJlYW1GaWxlTWF0Y2hlcygpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocm9vdDJEb3duc3RyZWFtRmlsZXMsIEFycmF5LmZyb20ocm9vdDIuZmlsZU1hdGNoZXNJdGVyYXRvcigpKSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChnZXRGaWxlTWF0Y2hBdEluZGV4KHJvb3QyLCAwKS5wYXJlbnQoKSwgcm9vdDIpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoZ2V0RmlsZU1hdGNoQXRJbmRleChyb290MiwgMCkuY2xvc2VzdFJvb3QsIHJvb3QyKTtcblxuXG5cdFx0Y29uc3Qgcm9vdDNEb3duc3RyZWFtRmlsZXMgPSByb290My5hbGxEb3duc3RyZWFtRmlsZU1hdGNoZXMoKTtcblx0XHRjb25zdCByb290M0xldmVsM0ZvbGRlciA9IGdldEZvbGRlck1hdGNoQXRJbmRleChnZXRGb2xkZXJNYXRjaEF0SW5kZXgocm9vdDMsIDApLCAwKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHJvb3QzRG93bnN0cmVhbUZpbGVzLCBbLi4ucm9vdDMuZmlsZU1hdGNoZXNJdGVyYXRvcigpLCAuLi5nZXRGb2xkZXJNYXRjaEF0SW5kZXgocm9vdDNMZXZlbDNGb2xkZXIsIDApLmZpbGVNYXRjaGVzSXRlcmF0b3IoKSwgLi4uZ2V0Rm9sZGVyTWF0Y2hBdEluZGV4KHJvb3QzTGV2ZWwzRm9sZGVyLCAxKS5maWxlTWF0Y2hlc0l0ZXJhdG9yKCldLmZsYXQoKSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChyb290M0xldmVsM0ZvbGRlci5hbGxEb3duc3RyZWFtRmlsZU1hdGNoZXMoKSwgZ2V0Rm9sZGVyTWF0Y2hBdEluZGV4KHJvb3QzLCAwKS5hbGxEb3duc3RyZWFtRmlsZU1hdGNoZXMoKSk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGdldEZpbGVNYXRjaEF0SW5kZXgoZ2V0Rm9sZGVyTWF0Y2hBdEluZGV4KHJvb3QzTGV2ZWwzRm9sZGVyLCAxKSwgMCkucGFyZW50KCksIGdldEZvbGRlck1hdGNoQXRJbmRleChyb290M0xldmVsM0ZvbGRlciwgMSkpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoZ2V0Rm9sZGVyTWF0Y2hBdEluZGV4KHJvb3QzTGV2ZWwzRm9sZGVyLCAxKS5wYXJlbnQoKSwgcm9vdDNMZXZlbDNGb2xkZXIpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocm9vdDNMZXZlbDNGb2xkZXIucGFyZW50KCksIGdldEZvbGRlck1hdGNoQXRJbmRleChyb290MywgMCkpO1xuXG5cdFx0cm9vdDNEb3duc3RyZWFtRmlsZXMuZm9yRWFjaCgoZSkgPT4ge1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChlLmNsb3Nlc3RSb290LCByb290Myk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ1JlbW92aW5nIGFuIGludGVybWVkaWF0ZSBmb2xkZXIgc2hvdWxkIGNhbGwgT25DaGFuZ2UoKSBvbiBhbGwgZG93bnN0cmVhbSBmaWxlIG1hdGNoZXMnLCBmdW5jdGlvbiAoKSB7XG5cdFx0Y29uc3QgdGFyZ2V0ID0gc2lub24uc3B5KCk7XG5cdFx0Y29uc3QgdGVzdE9iamVjdCA9IGdldFBvcHVsYXRlZFNlYXJjaFJlc3VsdEZvclRyZWVUZXN0aW5nKCk7XG5cblx0XHRjb25zdCBmb2xkZXJNYXRjaCA9IGdldEZvbGRlck1hdGNoQXRJbmRleChnZXRGb2xkZXJNYXRjaEF0SW5kZXgoZ2V0Rm9sZGVyTWF0Y2hBdEluZGV4KHRlc3RPYmplY3QuZm9sZGVyTWF0Y2hlcygpWzNdLCAwKSwgMCksIDApO1xuXG5cdFx0Y29uc3QgZXhwZWN0ZWRBcnJheVJlc3VsdCA9IGZvbGRlck1hdGNoLmFsbERvd25zdHJlYW1GaWxlTWF0Y2hlcygpO1xuXG5cdFx0c3RvcmUuYWRkKHRlc3RPYmplY3Qub25DaGFuZ2UodGFyZ2V0KSk7XG5cdFx0dGVzdE9iamVjdC5yZW1vdmUoZm9sZGVyTWF0Y2gpO1xuXHRcdGFzc2VydC5vayh0YXJnZXQuY2FsbGVkT25jZSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChbeyBlbGVtZW50czogZXhwZWN0ZWRBcnJheVJlc3VsdCwgcmVtb3ZlZDogdHJ1ZSwgYWRkZWQ6IGZhbHNlLCBjbGVhcmluZ0FsbDogZmFsc2UgfV0sIHRhcmdldC5hcmdzWzBdKTtcblx0fSk7XG5cblx0dGVzdCgnUmVwbGFjaW5nIGFuIGludGVybWVkaWF0ZSBmb2xkZXIgc2hvdWxkIHJlbW92ZSBhbGwgZG93bnN0cmVhbSBmb2xkZXJzIGFuZCBmaWxlIG1hdGNoZXMnLCBhc3luYyBmdW5jdGlvbiAoKSB7XG5cdFx0Y29uc3QgdGFyZ2V0ID0gc2lub24uc3B5KCk7XG5cdFx0Y29uc3QgdGVzdE9iamVjdCA9IGdldFBvcHVsYXRlZFNlYXJjaFJlc3VsdEZvclRyZWVUZXN0aW5nKCk7XG5cblx0XHRjb25zdCBmb2xkZXJNYXRjaCA9IGdldEZvbGRlck1hdGNoQXRJbmRleCh0ZXN0T2JqZWN0LmZvbGRlck1hdGNoZXMoKVszXSwgMCk7XG5cblx0XHRjb25zdCBleHBlY3RlZEFycmF5UmVzdWx0ID0gZm9sZGVyTWF0Y2guYWxsRG93bnN0cmVhbUZpbGVNYXRjaGVzKCk7XG5cblx0XHRzdG9yZS5hZGQodGVzdE9iamVjdC5vbkNoYW5nZSh0YXJnZXQpKTtcblx0XHRhd2FpdCB0ZXN0T2JqZWN0LmJhdGNoUmVwbGFjZShbZm9sZGVyTWF0Y2hdKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKFt7IGVsZW1lbnRzOiBleHBlY3RlZEFycmF5UmVzdWx0LCByZW1vdmVkOiB0cnVlLCBhZGRlZDogZmFsc2UgfV0sIHRhcmdldC5hcmdzWzBdKTtcblxuXHR9KTtcblxuXHRmdW5jdGlvbiBhRmlsZU1hdGNoKHBhdGg6IHN0cmluZywgc2VhcmNoUmVzdWx0OiBJU2VhcmNoUmVzdWx0IHwgdW5kZWZpbmVkLCAuLi5saW5lTWF0Y2hlczogSVRleHRTZWFyY2hNYXRjaFtdKTogSU5vdGVib29rRmlsZUluc3RhbmNlTWF0Y2gge1xuXHRcdGlmICghc2VhcmNoUmVzdWx0KSB7XG5cdFx0XHRzZWFyY2hSZXN1bHQgPSBhU2VhcmNoUmVzdWx0KCk7XG5cdFx0fVxuXHRcdGNvbnN0IHJhd01hdGNoOiBJRmlsZU1hdGNoID0ge1xuXHRcdFx0cmVzb3VyY2U6IFVSSS5maWxlKCcvJyArIHBhdGgpLFxuXHRcdFx0cmVzdWx0czogbGluZU1hdGNoZXNcblx0XHR9O1xuXHRcdGNvbnN0IHJvb3QgPSBzZWFyY2hSZXN1bHQ/LmZvbGRlck1hdGNoZXMoKVswXTtcblx0XHRjb25zdCBmaWxlTWF0Y2ggPSBpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShOb3RlYm9va0NvbXBhdGlibGVGaWxlTWF0Y2gsIHtcblx0XHRcdHBhdHRlcm46ICcnXG5cdFx0fSwgdW5kZWZpbmVkLCB1bmRlZmluZWQsIHJvb3QsIHJhd01hdGNoLCBudWxsLCAnJyk7XG5cdFx0ZmlsZU1hdGNoLmNyZWF0ZU1hdGNoZXMoKTtcblxuXHRcdHN0b3JlLmFkZChmaWxlTWF0Y2gpO1xuXHRcdHJldHVybiBmaWxlTWF0Y2g7XG5cdH1cblxuXHRmdW5jdGlvbiBhU2VhcmNoUmVzdWx0KCk6IElTZWFyY2hSZXN1bHQge1xuXHRcdGNvbnN0IHNlYXJjaE1vZGVsID0gaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoU2VhcmNoTW9kZWxJbXBsKTtcblx0XHRzdG9yZS5hZGQoc2VhcmNoTW9kZWwpO1xuXHRcdHNlYXJjaE1vZGVsLnNlYXJjaFJlc3VsdC5xdWVyeSA9IHtcblx0XHRcdHR5cGU6IFF1ZXJ5VHlwZS5UZXh0LCBmb2xkZXJRdWVyaWVzOiBbeyBmb2xkZXI6IGNyZWF0ZUZpbGVVcmlGcm9tUGF0aEZyb21Sb290KCkgfV0sIGNvbnRlbnRQYXR0ZXJuOiB7XG5cdFx0XHRcdHBhdHRlcm46ICcnXG5cdFx0XHR9XG5cdFx0fTtcblx0XHRyZXR1cm4gc2VhcmNoTW9kZWwuc2VhcmNoUmVzdWx0O1xuXHR9XG5cblx0ZnVuY3Rpb24gYVJhd01hdGNoKHJlc291cmNlOiBzdHJpbmcsIC4uLnJlc3VsdHM6IElUZXh0U2VhcmNoTWF0Y2hbXSk6IElGaWxlTWF0Y2gge1xuXHRcdHJldHVybiB7IHJlc291cmNlOiBjcmVhdGVGaWxlVXJpRnJvbVBhdGhGcm9tUm9vdChyZXNvdXJjZSksIHJlc3VsdHMgfTtcblx0fVxuXG5cdGZ1bmN0aW9uIGFSYXdGaWxlTWF0Y2hXaXRoQ2VsbHMocmVzb3VyY2U6IHN0cmluZywgLi4uY2VsbE1hdGNoZXM6IElOb3RlYm9va0NlbGxNYXRjaFdpdGhNb2RlbFtdKTogSU5vdGVib29rRmlsZU1hdGNoV2l0aE1vZGVsIHtcblx0XHRyZXR1cm4ge1xuXHRcdFx0cmVzb3VyY2U6IGNyZWF0ZUZpbGVVcmlGcm9tUGF0aEZyb21Sb290KHJlc291cmNlKSxcblx0XHRcdGNlbGxSZXN1bHRzOiBjZWxsTWF0Y2hlc1xuXHRcdH07XG5cdH1cblxuXHRmdW5jdGlvbiBzdHViTW9kZWxTZXJ2aWNlKGluc3RhbnRpYXRpb25TZXJ2aWNlOiBUZXN0SW5zdGFudGlhdGlvblNlcnZpY2UpOiBJTW9kZWxTZXJ2aWNlIHtcblx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElUaGVtZVNlcnZpY2UsIG5ldyBUZXN0VGhlbWVTZXJ2aWNlKCkpO1xuXHRcdGNvbnN0IGNvbmZpZyA9IG5ldyBUZXN0Q29uZmlndXJhdGlvblNlcnZpY2UoKTtcblx0XHRjb25maWcuc2V0VXNlckNvbmZpZ3VyYXRpb24oJ3NlYXJjaCcsIHsgc2VhcmNoT25UeXBlOiB0cnVlIH0pO1xuXHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSUNvbmZpZ3VyYXRpb25TZXJ2aWNlLCBjb25maWcpO1xuXHRcdGNvbnN0IG1vZGVsU2VydmljZSA9IGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKE1vZGVsU2VydmljZSk7XG5cdFx0c3RvcmUuYWRkKG1vZGVsU2VydmljZSk7XG5cdFx0cmV0dXJuIG1vZGVsU2VydmljZTtcblx0fVxuXG5cdGZ1bmN0aW9uIHN0dWJOb3RlYm9va0VkaXRvclNlcnZpY2UoaW5zdGFudGlhdGlvblNlcnZpY2U6IFRlc3RJbnN0YW50aWF0aW9uU2VydmljZSk6IElOb3RlYm9va0VkaXRvclNlcnZpY2Uge1xuXHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSUVkaXRvckdyb3Vwc1NlcnZpY2UsIG5ldyBUZXN0RWRpdG9yR3JvdXBzU2VydmljZSgpKTtcblx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElDb250ZXh0S2V5U2VydmljZSwgbmV3IE1vY2tDb250ZXh0S2V5U2VydmljZSgpKTtcblx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElFZGl0b3JTZXJ2aWNlLCBzdG9yZS5hZGQobmV3IFRlc3RFZGl0b3JTZXJ2aWNlKCkpKTtcblx0XHRjb25zdCBub3RlYm9va0VkaXRvcldpZGdldFNlcnZpY2UgPSBpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShOb3RlYm9va0VkaXRvcldpZGdldFNlcnZpY2UpO1xuXHRcdHN0b3JlLmFkZChub3RlYm9va0VkaXRvcldpZGdldFNlcnZpY2UpO1xuXHRcdHJldHVybiBub3RlYm9va0VkaXRvcldpZGdldFNlcnZpY2U7XG5cdH1cblxuXHRmdW5jdGlvbiBnZXRQb3B1bGF0ZWRTZWFyY2hSZXN1bHQoKSB7XG5cdFx0Y29uc3QgdGVzdE9iamVjdCA9IGFTZWFyY2hSZXN1bHQoKTtcblxuXHRcdHRlc3RPYmplY3QucXVlcnkgPSB7XG5cdFx0XHR0eXBlOiBRdWVyeVR5cGUuVGV4dCxcblx0XHRcdGNvbnRlbnRQYXR0ZXJuOiB7IHBhdHRlcm46ICdmb28nIH0sXG5cdFx0XHRmb2xkZXJRdWVyaWVzOiBbe1xuXHRcdFx0XHRmb2xkZXI6IGNyZWF0ZUZpbGVVcmlGcm9tUGF0aEZyb21Sb290KCcvdm9vJylcblx0XHRcdH0sXG5cdFx0XHR7IGZvbGRlcjogY3JlYXRlRmlsZVVyaUZyb21QYXRoRnJvbVJvb3QoJy93aXRoJykgfSxcblx0XHRcdF1cblx0XHR9O1xuXG5cdFx0YWRkVG9TZWFyY2hSZXN1bHQodGVzdE9iamVjdCwgW1xuXHRcdFx0YVJhd01hdGNoKCcvdm9vL2Zvby5hJyxcblx0XHRcdFx0bmV3IFRleHRTZWFyY2hNYXRjaCgncHJldmlldyAxJywgbGluZU9uZVJhbmdlKSwgbmV3IFRleHRTZWFyY2hNYXRjaCgncHJldmlldyAyJywgbGluZU9uZVJhbmdlKSksXG5cdFx0XHRhUmF3TWF0Y2goJy93aXRoL3BhdGgvYmFyLmInLFxuXHRcdFx0XHRuZXcgVGV4dFNlYXJjaE1hdGNoKCdwcmV2aWV3IDMnLCBsaW5lT25lUmFuZ2UpKSxcblx0XHRcdGFSYXdNYXRjaCgnL3dpdGgvcGF0aC5jJyxcblx0XHRcdFx0bmV3IFRleHRTZWFyY2hNYXRjaCgncHJldmlldyA0JywgbGluZU9uZVJhbmdlKSwgbmV3IFRleHRTZWFyY2hNYXRjaCgncHJldmlldyA1JywgbGluZU9uZVJhbmdlKSksXG5cdFx0XSk7XG5cdFx0cmV0dXJuIHRlc3RPYmplY3Q7XG5cdH1cblxuXHRmdW5jdGlvbiBnZXRQb3B1bGF0ZWRTZWFyY2hSZXN1bHRGb3JUcmVlVGVzdGluZygpIHtcblx0XHRjb25zdCB0ZXN0T2JqZWN0ID0gYVNlYXJjaFJlc3VsdCgpO1xuXG5cdFx0dGVzdE9iamVjdC5xdWVyeSA9IHtcblx0XHRcdHR5cGU6IFF1ZXJ5VHlwZS5UZXh0LFxuXHRcdFx0Y29udGVudFBhdHRlcm46IHsgcGF0dGVybjogJ2ZvbycgfSxcblx0XHRcdGZvbGRlclF1ZXJpZXM6IFt7XG5cdFx0XHRcdGZvbGRlcjogY3JlYXRlRmlsZVVyaUZyb21QYXRoRnJvbVJvb3QoJy92b28nKVxuXHRcdFx0fSxcblx0XHRcdHtcblx0XHRcdFx0Zm9sZGVyOiBjcmVhdGVGaWxlVXJpRnJvbVBhdGhGcm9tUm9vdCgnL3dpdGgnKVxuXHRcdFx0fSxcblx0XHRcdHtcblx0XHRcdFx0Zm9sZGVyOiBjcmVhdGVGaWxlVXJpRnJvbVBhdGhGcm9tUm9vdCgnL3dpdGgvdGVzdCcpXG5cdFx0XHR9LFxuXHRcdFx0e1xuXHRcdFx0XHRmb2xkZXI6IGNyZWF0ZUZpbGVVcmlGcm9tUGF0aEZyb21Sb290KCcvZWVwJylcblx0XHRcdH0sXG5cdFx0XHRdXG5cdFx0fTtcblx0XHQvKioqXG5cdFx0ICogZmlsZSBzdHJ1Y3R1cmUgbG9va3MgbGlrZTpcblx0XHQgKiAqdm9vL1xuXHRcdCAqIHwtIGZvby5hXG5cdFx0ICogfC0gYmVlcFxuXHRcdCAqICAgIHwtIGZvby5jXG5cdFx0ICogXHQgIHwtIGJvb3AuY1xuXHRcdCAqICp3aXRoL1xuXHRcdCAqIHwtIHBhdGhcblx0XHQgKiAgICB8LSBiYXIuYlxuXHRcdCAqIHwtIHBhdGguY1xuXHRcdCAqIHwtICp0ZXN0L1xuXHRcdCAqICAgIHwtIHdvby5jXG5cdFx0ICogZWVwL1xuXHRcdCAqICAgIHwtIGJhclxuXHRcdCAqICAgICAgIHwtIGdvb1xuXHRcdCAqICAgICAgICAgICB8LSBmb29cblx0XHQgKiAgICAgICAgICAgICAgfC0gaGVyZS50eHRcblx0XHQgKiBcdFx0XHQgfC0gb29vXG5cdFx0ICogICAgICAgICAgICAgIHwtIHRoZXJlLnR4dFxuXHRcdCAqICAgIHwtIGV5eS55XG5cdFx0ICovXG5cblx0XHRhZGRUb1NlYXJjaFJlc3VsdCh0ZXN0T2JqZWN0LCBbXG5cdFx0XHRhUmF3TWF0Y2goJy92b28vZm9vLmEnLFxuXHRcdFx0XHRuZXcgVGV4dFNlYXJjaE1hdGNoKCdwcmV2aWV3IDEnLCBsaW5lT25lUmFuZ2UpLCBuZXcgVGV4dFNlYXJjaE1hdGNoKCdwcmV2aWV3IDInLCBsaW5lT25lUmFuZ2UpKSxcblx0XHRcdGFSYXdNYXRjaCgnL3Zvby9iZWVwL2Zvby5jJyxcblx0XHRcdFx0bmV3IFRleHRTZWFyY2hNYXRjaCgncHJldmlldyAxJywgbGluZU9uZVJhbmdlKSwgbmV3IFRleHRTZWFyY2hNYXRjaCgncHJldmlldyAyJywgbGluZU9uZVJhbmdlKSksXG5cdFx0XHRhUmF3TWF0Y2goJy92b28vYmVlcC9ib29wLmMnLFxuXHRcdFx0XHRuZXcgVGV4dFNlYXJjaE1hdGNoKCdwcmV2aWV3IDMnLCBsaW5lT25lUmFuZ2UpKSxcblx0XHRcdGFSYXdNYXRjaCgnL3dpdGgvcGF0aC5jJyxcblx0XHRcdFx0bmV3IFRleHRTZWFyY2hNYXRjaCgncHJldmlldyA0JywgbGluZU9uZVJhbmdlKSwgbmV3IFRleHRTZWFyY2hNYXRjaCgncHJldmlldyA1JywgbGluZU9uZVJhbmdlKSksXG5cdFx0XHRhUmF3TWF0Y2goJy93aXRoL3BhdGgvYmFyLmInLFxuXHRcdFx0XHRuZXcgVGV4dFNlYXJjaE1hdGNoKCdwcmV2aWV3IDMnLCBsaW5lT25lUmFuZ2UpKSxcblx0XHRcdGFSYXdNYXRjaCgnL3dpdGgvdGVzdC93b28uYycsXG5cdFx0XHRcdG5ldyBUZXh0U2VhcmNoTWF0Y2goJ3ByZXZpZXcgMycsIGxpbmVPbmVSYW5nZSkpLFxuXHRcdFx0YVJhd01hdGNoKCcvZWVwL2Jhci9nb28vZm9vL2hlcmUudHh0Jyxcblx0XHRcdFx0bmV3IFRleHRTZWFyY2hNYXRjaCgncHJldmlldyA2JywgbGluZU9uZVJhbmdlKSwgbmV3IFRleHRTZWFyY2hNYXRjaCgncHJldmlldyA3JywgbGluZU9uZVJhbmdlKSksXG5cdFx0XHRhUmF3TWF0Y2goJy9lZXAvYmFyL2dvby9vb28vdGhlcmUudHh0Jyxcblx0XHRcdFx0bmV3IFRleHRTZWFyY2hNYXRjaCgncHJldmlldyA2JywgbGluZU9uZVJhbmdlKSwgbmV3IFRleHRTZWFyY2hNYXRjaCgncHJldmlldyA3JywgbGluZU9uZVJhbmdlKSksXG5cdFx0XHRhUmF3TWF0Y2goJy9lZXAvZXl5LnknLFxuXHRcdFx0XHRuZXcgVGV4dFNlYXJjaE1hdGNoKCdwcmV2aWV3IDYnLCBsaW5lT25lUmFuZ2UpLCBuZXcgVGV4dFNlYXJjaE1hdGNoKCdwcmV2aWV3IDcnLCBsaW5lT25lUmFuZ2UpKVxuXHRcdF0pO1xuXHRcdHJldHVybiB0ZXN0T2JqZWN0O1xuXHR9XG5cblx0ZnVuY3Rpb24gZ2V0Rm9sZGVyTWF0Y2hBdEluZGV4KHBhcmVudDogSVNlYXJjaFRyZWVGb2xkZXJNYXRjaCwgaW5kZXg6IG51bWJlcikge1xuXHRcdHJldHVybiBBcnJheS5mcm9tKHBhcmVudC5mb2xkZXJNYXRjaGVzSXRlcmF0b3IoKSlbaW5kZXhdO1xuXHR9XG5cblx0ZnVuY3Rpb24gZ2V0RmlsZU1hdGNoQXRJbmRleChwYXJlbnQ6IElTZWFyY2hUcmVlRm9sZGVyTWF0Y2gsIGluZGV4OiBudW1iZXIpIHtcblx0XHRyZXR1cm4gQXJyYXkuZnJvbShwYXJlbnQuZmlsZU1hdGNoZXNJdGVyYXRvcigpKVtpbmRleF07XG5cdH1cbn0pO1xuIl0sCiAgIm1hcHBpbmdzIjogIkFBSUEsT0FB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
