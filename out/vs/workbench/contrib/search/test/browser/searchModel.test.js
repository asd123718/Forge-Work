import assert from "assert";
import * as sinon from "sinon";
import * as arrays from "../../../../../base/common/arrays.js";
import { DeferredPromise, timeout } from "../../../../../base/common/async.js";
import { CancellationTokenSource } from "../../../../../base/common/cancellation.js";
import { URI } from "../../../../../base/common/uri.js";
import { Range } from "../../../../../editor/common/core/range.js";
import { IModelService } from "../../../../../editor/common/services/model.js";
import { ModelService } from "../../../../../editor/common/services/modelService.js";
import { IConfigurationService } from "../../../../../platform/configuration/common/configuration.js";
import { TestConfigurationService } from "../../../../../platform/configuration/test/common/testConfigurationService.js";
import { TestInstantiationService } from "../../../../../platform/instantiation/test/common/instantiationServiceMock.js";
import { ISearchService, OneLineRange, QueryType, TextSearchMatch } from "../../../../services/search/common/search.js";
import { ITelemetryService } from "../../../../../platform/telemetry/common/telemetry.js";
import { NullTelemetryService } from "../../../../../platform/telemetry/common/telemetryUtils.js";
import { SearchModelImpl } from "../../browser/searchTreeModel/searchModel.js";
import { IThemeService } from "../../../../../platform/theme/common/themeService.js";
import { TestThemeService } from "../../../../../platform/theme/test/common/testThemeService.js";
import { FileService } from "../../../../../platform/files/common/fileService.js";
import { ILogService, NullLogService } from "../../../../../platform/log/common/log.js";
import { IUriIdentityService } from "../../../../../platform/uriIdentity/common/uriIdentity.js";
import { UriIdentityService } from "../../../../../platform/uriIdentity/common/uriIdentityService.js";
import { ILabelService } from "../../../../../platform/label/common/label.js";
import { INotebookEditorService } from "../../../notebook/browser/services/notebookEditorService.js";
import { IEditorGroupsService } from "../../../../services/editor/common/editorGroupsService.js";
import { TestEditorGroupsService, TestEditorService } from "../../../../test/browser/workbenchTestServices.js";
import { NotebookEditorWidgetService } from "../../../notebook/browser/services/notebookEditorServiceImpl.js";
import { createFileUriFromPathFromRoot, getRootName } from "./searchTestCommon.js";
import { contentMatchesToTextSearchMatches, webviewMatchesToTextSearchMatches } from "../../browser/notebookSearch/searchNotebookHelpers.js";
import { CellKind } from "../../../notebook/common/notebookCommon.js";
import { FindMatch } from "../../../../../editor/common/model.js";
import { ResourceMap, ResourceSet } from "../../../../../base/common/map.js";
import { INotebookService } from "../../../notebook/common/notebookService.js";
import { INotebookSearchService } from "../../common/notebookSearch.js";
import { IContextKeyService } from "../../../../../platform/contextkey/common/contextkey.js";
import { MockContextKeyService } from "../../../../../platform/keybinding/test/common/mockKeybindingService.js";
import { IEditorService } from "../../../../services/editor/common/editorService.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../../base/test/common/utils.js";
import { CellMatch, MatchInNotebook } from "../../browser/notebookSearch/notebookSearchModel.js";
const nullEvent = new class {
  constructor() {
    this.id = -1;
  }
  stop() {
    return;
  }
  timeTaken() {
    return -1;
  }
}();
const lineOneRange = new OneLineRange(1, 0, 1);
suite("SearchModel", () => {
  let instantiationService;
  const store = ensureNoDisposablesAreLeakedInTestSuite();
  const testSearchStats = {
    fromCache: false,
    resultCount: 1,
    type: "searchProcess",
    detailStats: {
      fileWalkTime: 0,
      cmdTime: 0,
      cmdResultCount: 0,
      directoriesWalked: 2,
      filesWalked: 3
    }
  };
  const folderQueries = [
    { folder: createFileUriFromPathFromRoot() }
  ];
  setup(() => {
    instantiationService = new TestInstantiationService();
    instantiationService.stub(ITelemetryService, NullTelemetryService);
    instantiationService.stub(ILabelService, { getUriBasenameLabel: (uri) => "" });
    instantiationService.stub(INotebookService, { getNotebookTextModels: () => [] });
    instantiationService.stub(IModelService, stubModelService(instantiationService));
    instantiationService.stub(INotebookEditorService, stubNotebookEditorService(instantiationService));
    instantiationService.stub(ISearchService, {});
    instantiationService.stub(ISearchService, "textSearch", Promise.resolve({ results: [] }));
    const fileService = new FileService(new NullLogService());
    store.add(fileService);
    const uriIdentityService = new UriIdentityService(fileService);
    store.add(uriIdentityService);
    instantiationService.stub(IUriIdentityService, uriIdentityService);
    instantiationService.stub(ILogService, new NullLogService());
  });
  teardown(() => sinon.restore());
  function searchServiceWithResults(results, complete = null) {
    return {
      textSearch(query, token, onProgress, notebookURIs) {
        return new Promise((resolve) => {
          queueMicrotask(() => {
            results.forEach(onProgress);
            resolve(complete);
          });
        });
      },
      fileSearch(query, token) {
        return new Promise((resolve) => {
          queueMicrotask(() => {
            resolve({ results, messages: [] });
          });
        });
      },
      aiTextSearch(query, token, onProgress, notebookURIs) {
        return new Promise((resolve) => {
          queueMicrotask(() => {
            results.forEach(onProgress);
            resolve(complete);
          });
        });
      },
      textSearchSplitSyncAsync(query, token, onProgress) {
        return {
          syncResults: {
            results: [],
            messages: []
          },
          asyncResults: new Promise((resolve) => {
            queueMicrotask(() => {
              results.forEach(onProgress);
              resolve(complete);
            });
          })
        };
      }
    };
  }
  function searchServiceWithError(error) {
    return {
      textSearch(query, token, onProgress) {
        return new Promise((resolve, reject) => {
          reject(error);
        });
      },
      fileSearch(query, token) {
        return new Promise((resolve, reject) => {
          queueMicrotask(() => {
            reject(error);
          });
        });
      },
      aiTextSearch(query, token, onProgress, notebookURIs) {
        return new Promise((resolve, reject) => {
          reject(error);
        });
      },
      textSearchSplitSyncAsync(query, token, onProgress) {
        return {
          syncResults: {
            results: [],
            messages: []
          },
          asyncResults: new Promise((resolve, reject) => {
            reject(error);
          })
        };
      }
    };
  }
  function canceleableSearchService(tokenSource) {
    return {
      textSearch(query, token, onProgress) {
        const disposable = token?.onCancellationRequested(() => tokenSource.cancel());
        if (disposable) {
          store.add(disposable);
        }
        return this.textSearchSplitSyncAsync(query, token, onProgress).asyncResults;
      },
      fileSearch(query, token) {
        const disposable = token?.onCancellationRequested(() => tokenSource.cancel());
        if (disposable) {
          store.add(disposable);
        }
        return new Promise((resolve) => {
          queueMicrotask(() => {
            resolve({});
          });
        });
      },
      aiTextSearch(query, token, onProgress, notebookURIs) {
        const disposable = token?.onCancellationRequested(() => tokenSource.cancel());
        if (disposable) {
          store.add(disposable);
        }
        return Promise.resolve({
          results: [],
          messages: []
        });
      },
      textSearchSplitSyncAsync(query, token, onProgress) {
        const disposable = token?.onCancellationRequested(() => tokenSource.cancel());
        if (disposable) {
          store.add(disposable);
        }
        return {
          syncResults: {
            results: [],
            messages: []
          },
          asyncResults: new Promise((resolve) => {
            queueMicrotask(() => {
              resolve({
                results: [],
                messages: []
              });
            });
          })
        };
      }
    };
  }
  function searchServiceWithDeferredPromise(p) {
    return {
      textSearchSplitSyncAsync(query, token, onProgress) {
        return {
          syncResults: {
            results: [],
            messages: []
          },
          asyncResults: p
        };
      }
    };
  }
  function notebookSearchServiceWithInfo(results, tokenSource) {
    return {
      _serviceBrand: void 0,
      notebookSearch(query, token, searchInstanceID, onProgress) {
        const disposable = token?.onCancellationRequested(() => tokenSource?.cancel());
        if (disposable) {
          store.add(disposable);
        }
        const localResults = new ResourceMap((uri) => uri.path);
        results.forEach((r) => {
          localResults.set(r.resource, r);
        });
        if (onProgress) {
          arrays.coalesce([...localResults.values()]).forEach(onProgress);
        }
        return {
          openFilesToScan: new ResourceSet([...localResults.keys()]),
          completeData: Promise.resolve({
            messages: [],
            results: arrays.coalesce([...localResults.values()]),
            limitHit: false
          }),
          allScannedFiles: Promise.resolve(new ResourceSet())
        };
      }
    };
  }
  test("Search Model: Search adds to results", async () => {
    const results = [
      aRawMatch(
        "/1",
        new TextSearchMatch("preview 1", new OneLineRange(1, 1, 4)),
        new TextSearchMatch("preview 1", new OneLineRange(1, 4, 11))
      ),
      aRawMatch("/2", new TextSearchMatch("preview 2", lineOneRange))
    ];
    instantiationService.stub(ISearchService, searchServiceWithResults(results, { limitHit: false, messages: [], results }));
    instantiationService.stub(INotebookSearchService, notebookSearchServiceWithInfo([], void 0));
    const testObject = instantiationService.createInstance(SearchModelImpl);
    store.add(testObject);
    await testObject.search({ contentPattern: { pattern: "somestring" }, type: QueryType.Text, folderQueries }).asyncResults;
    const actual = testObject.searchResult.matches();
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
  test("Search Model: Search can return notebook results", async () => {
    const results = [
      aRawMatch(
        "/2",
        new TextSearchMatch("test", new OneLineRange(1, 1, 5)),
        new TextSearchMatch("this is a test", new OneLineRange(1, 11, 15))
      ),
      aRawMatch("/3", new TextSearchMatch("test", lineOneRange))
    ];
    instantiationService.stub(ISearchService, searchServiceWithResults(results, { limitHit: false, messages: [], results }));
    sinon.stub(CellMatch.prototype, "addContext");
    const mdInputCell = {
      cellKind: CellKind.Markup,
      textBuffer: {
        getLineContent(lineNumber) {
          if (lineNumber === 1) {
            return "# Test";
          } else {
            return "";
          }
        }
      },
      id: "mdInputCell"
    };
    const findMatchMds = [new FindMatch(new Range(1, 3, 1, 7), ["Test"])];
    const codeCell = {
      cellKind: CellKind.Code,
      textBuffer: {
        getLineContent(lineNumber) {
          if (lineNumber === 1) {
            return 'print("test! testing!!")';
          } else {
            return "";
          }
        }
      },
      id: "codeCell"
    };
    const findMatchCodeCells = [
      new FindMatch(new Range(1, 8, 1, 12), ["test"]),
      new FindMatch(new Range(1, 14, 1, 18), ["test"])
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
      }
    ];
    const cellMatchMd = {
      cell: mdInputCell,
      index: 0,
      contentResults: contentMatchesToTextSearchMatches(findMatchMds, mdInputCell),
      webviewResults: []
    };
    const cellMatchCode = {
      cell: codeCell,
      index: 1,
      contentResults: contentMatchesToTextSearchMatches(findMatchCodeCells, codeCell),
      webviewResults: webviewMatchesToTextSearchMatches(webviewMatches)
    };
    const notebookSearchService = instantiationService.stub(INotebookSearchService, notebookSearchServiceWithInfo([aRawMatchWithCells("/1", cellMatchMd, cellMatchCode)], void 0));
    const notebookSearch = sinon.spy(notebookSearchService, "notebookSearch");
    const model = instantiationService.createInstance(SearchModelImpl);
    store.add(model);
    await model.search({ contentPattern: { pattern: "test" }, type: QueryType.Text, folderQueries }).asyncResults;
    const actual = model.searchResult.matches();
    assert(notebookSearch.calledOnce);
    assert.strictEqual(3, actual.length);
    assert.strictEqual(URI.file(`${getRootName()}/1`).toString(), actual[0].resource.toString());
    const notebookFileMatches = actual[0].matches();
    assert.ok(notebookFileMatches[0].range().equalsRange(new Range(1, 3, 1, 7)));
    assert.ok(notebookFileMatches[1].range().equalsRange(new Range(1, 8, 1, 12)));
    assert.ok(notebookFileMatches[2].range().equalsRange(new Range(1, 14, 1, 18)));
    assert.ok(notebookFileMatches[3].range().equalsRange(new Range(1, 2, 1, 6)));
    assert.ok(notebookFileMatches[4].range().equalsRange(new Range(1, 8, 1, 12)));
    notebookFileMatches.forEach((match) => match instanceof MatchInNotebook);
    assert(notebookFileMatches[0].cell?.id === "mdInputCell");
    assert(notebookFileMatches[1].cell?.id === "codeCell");
    assert(notebookFileMatches[2].cell?.id === "codeCell");
    assert(notebookFileMatches[3].cell?.id === "codeCell");
    assert(notebookFileMatches[4].cell?.id === "codeCell");
    const mdCellMatchProcessed = notebookFileMatches[0].cellParent;
    const codeCellMatchProcessed = notebookFileMatches[1].cellParent;
    assert(mdCellMatchProcessed.contentMatches.length === 1);
    assert(codeCellMatchProcessed.contentMatches.length === 2);
    assert(codeCellMatchProcessed.webviewMatches.length === 2);
    assert(mdCellMatchProcessed.contentMatches[0] === notebookFileMatches[0]);
    assert(codeCellMatchProcessed.contentMatches[0] === notebookFileMatches[1]);
    assert(codeCellMatchProcessed.contentMatches[1] === notebookFileMatches[2]);
    assert(codeCellMatchProcessed.webviewMatches[0] === notebookFileMatches[3]);
    assert(codeCellMatchProcessed.webviewMatches[1] === notebookFileMatches[4]);
    assert.strictEqual(URI.file(`${getRootName()}/2`).toString(), actual[1].resource.toString());
    assert.strictEqual(URI.file(`${getRootName()}/3`).toString(), actual[2].resource.toString());
  });
  test("Search Model: Search reports telemetry on search completed", async () => {
    const target = instantiationService.spy(ITelemetryService, "publicLog");
    const results = [
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
    instantiationService.stub(ISearchService, searchServiceWithResults(results, { limitHit: false, messages: [], results }));
    instantiationService.stub(INotebookSearchService, notebookSearchServiceWithInfo([], void 0));
    const testObject = instantiationService.createInstance(SearchModelImpl);
    store.add(testObject);
    await testObject.search({ contentPattern: { pattern: "somestring" }, type: QueryType.Text, folderQueries }).asyncResults;
    assert.ok(target.calledThrice);
    assert.ok(target.calledWith("searchResultsFirstRender"));
    assert.ok(target.calledWith("searchResultsFinished"));
  });
  test("Search Model: Search reports timed telemetry on search when progress is not called", () => {
    const target2 = sinon.spy();
    sinon.stub(nullEvent, "stop").callsFake(target2);
    const target1 = sinon.stub().returns(nullEvent);
    instantiationService.stub(ITelemetryService, "publicLog", target1);
    instantiationService.stub(ISearchService, searchServiceWithResults([], { limitHit: false, messages: [], results: [] }));
    instantiationService.stub(INotebookSearchService, notebookSearchServiceWithInfo([], void 0));
    const testObject = instantiationService.createInstance(SearchModelImpl);
    store.add(testObject);
    const result = testObject.search({ contentPattern: { pattern: "somestring" }, type: QueryType.Text, folderQueries }).asyncResults;
    return result.then(() => {
      return timeout(1).then(() => {
        assert.ok(target1.calledWith("searchResultsFirstRender"));
        assert.ok(target1.calledWith("searchResultsFinished"));
      });
    });
  });
  test("Search Model: Search reports timed telemetry on search when progress is called", () => {
    const target2 = sinon.spy();
    sinon.stub(nullEvent, "stop").callsFake(target2);
    const target1 = sinon.stub().returns(nullEvent);
    instantiationService.stub(ITelemetryService, "publicLog", target1);
    instantiationService.stub(ISearchService, searchServiceWithResults(
      [aRawMatch("/1", new TextSearchMatch("some preview", lineOneRange))],
      { results: [], stats: testSearchStats, messages: [] }
    ));
    instantiationService.stub(INotebookSearchService, notebookSearchServiceWithInfo([], void 0));
    const testObject = instantiationService.createInstance(SearchModelImpl);
    store.add(testObject);
    const result = testObject.search({ contentPattern: { pattern: "somestring" }, type: QueryType.Text, folderQueries }).asyncResults;
    return result.then(() => {
      return timeout(1).then(() => {
        assert.ok(target1.calledWith("searchResultsFirstRender"));
        assert.ok(target1.calledWith("searchResultsFinished"));
      });
    });
  });
  test("Search Model: Search reports timed telemetry on search when error is called", () => {
    const target2 = sinon.spy();
    sinon.stub(nullEvent, "stop").callsFake(target2);
    const target1 = sinon.stub().returns(nullEvent);
    instantiationService.stub(ITelemetryService, "publicLog", target1);
    instantiationService.stub(ISearchService, searchServiceWithError(new Error("This error should be thrown by this test.")));
    instantiationService.stub(INotebookSearchService, notebookSearchServiceWithInfo([], void 0));
    const testObject = instantiationService.createInstance(SearchModelImpl);
    store.add(testObject);
    const result = testObject.search({ contentPattern: { pattern: "somestring" }, type: QueryType.Text, folderQueries }).asyncResults;
    return result.then(() => {
    }, () => {
      return timeout(1).then(() => {
        assert.ok(target1.calledWith("searchResultsFirstRender"));
        assert.ok(target1.calledWith("searchResultsFinished"));
      });
    });
  });
  test("Search Model: Search reports timed telemetry on search when error is cancelled error", () => {
    const target2 = sinon.spy();
    sinon.stub(nullEvent, "stop").callsFake(target2);
    const target1 = sinon.stub().returns(nullEvent);
    instantiationService.stub(ITelemetryService, "publicLog", target1);
    const deferredPromise = new DeferredPromise();
    instantiationService.stub(ISearchService, searchServiceWithDeferredPromise(deferredPromise.p));
    instantiationService.stub(INotebookSearchService, notebookSearchServiceWithInfo([], void 0));
    const testObject = instantiationService.createInstance(SearchModelImpl);
    store.add(testObject);
    const result = testObject.search({ contentPattern: { pattern: "somestring" }, type: QueryType.Text, folderQueries }).asyncResults;
    deferredPromise.cancel();
    return result.then(() => {
    }, async () => {
      return timeout(1).then(() => {
        assert.ok(target1.calledWith("searchResultsFirstRender"));
        assert.ok(target1.calledWith("searchResultsFinished"));
      });
    });
  });
  test("Search Model: Search results are cleared during search", async () => {
    const results = [
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
    instantiationService.stub(ISearchService, searchServiceWithResults(results, { limitHit: false, messages: [], results: [] }));
    instantiationService.stub(INotebookSearchService, notebookSearchServiceWithInfo([], void 0));
    const testObject = instantiationService.createInstance(SearchModelImpl);
    store.add(testObject);
    await testObject.search({ contentPattern: { pattern: "somestring" }, type: QueryType.Text, folderQueries }).asyncResults;
    assert.ok(!testObject.searchResult.isEmpty());
    instantiationService.stub(ISearchService, searchServiceWithResults([]));
    testObject.search({ contentPattern: { pattern: "somestring" }, type: QueryType.Text, folderQueries });
    assert.ok(testObject.searchResult.isEmpty());
  });
  test("Search Model: Previous search is cancelled when new search is called", async () => {
    const tokenSource = new CancellationTokenSource();
    store.add(tokenSource);
    instantiationService.stub(ISearchService, canceleableSearchService(tokenSource));
    instantiationService.stub(INotebookSearchService, notebookSearchServiceWithInfo([], tokenSource));
    const testObject = instantiationService.createInstance(SearchModelImpl);
    store.add(testObject);
    testObject.search({ contentPattern: { pattern: "somestring" }, type: QueryType.Text, folderQueries });
    instantiationService.stub(ISearchService, searchServiceWithResults([]));
    instantiationService.stub(INotebookSearchService, notebookSearchServiceWithInfo([], void 0));
    testObject.search({ contentPattern: { pattern: "somestring" }, type: QueryType.Text, folderQueries });
    assert.ok(tokenSource.token.isCancellationRequested);
  });
  test("getReplaceString returns proper replace string for regExpressions", async () => {
    const results = [
      aRawMatch(
        "/1",
        new TextSearchMatch("preview 1", new OneLineRange(1, 1, 4)),
        new TextSearchMatch("preview 1", new OneLineRange(1, 4, 11))
      )
    ];
    instantiationService.stub(ISearchService, searchServiceWithResults(results, { limitHit: false, messages: [], results }));
    instantiationService.stub(INotebookSearchService, notebookSearchServiceWithInfo([], void 0));
    const testObject = instantiationService.createInstance(SearchModelImpl);
    store.add(testObject);
    await testObject.search({ contentPattern: { pattern: "re" }, type: QueryType.Text, folderQueries }).asyncResults;
    testObject.replaceString = "hello";
    let match = testObject.searchResult.matches()[0].matches()[0];
    assert.strictEqual("hello", match.replaceString);
    await testObject.search({ contentPattern: { pattern: "re", isRegExp: true }, type: QueryType.Text, folderQueries }).asyncResults;
    match = testObject.searchResult.matches()[0].matches()[0];
    assert.strictEqual("hello", match.replaceString);
    await testObject.search({ contentPattern: { pattern: "re(?:vi)", isRegExp: true }, type: QueryType.Text, folderQueries }).asyncResults;
    match = testObject.searchResult.matches()[0].matches()[0];
    assert.strictEqual("hello", match.replaceString);
    await testObject.search({ contentPattern: { pattern: "r(e)(?:vi)", isRegExp: true }, type: QueryType.Text, folderQueries }).asyncResults;
    match = testObject.searchResult.matches()[0].matches()[0];
    assert.strictEqual("hello", match.replaceString);
    await testObject.search({ contentPattern: { pattern: "r(e)(?:vi)", isRegExp: true }, type: QueryType.Text, folderQueries }).asyncResults;
    testObject.replaceString = "hello$1";
    match = testObject.searchResult.matches()[0].matches()[0];
    assert.strictEqual("helloe", match.replaceString);
  });
  function aRawMatch(resource, ...results) {
    return { resource: createFileUriFromPathFromRoot(resource), results };
  }
  function aRawMatchWithCells(resource, ...cells) {
    return { resource: createFileUriFromPathFromRoot(resource), cellResults: cells };
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
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXHNlYXJjaFxcdGVzdFxcYnJvd3Nlclxcc2VhcmNoTW9kZWwudGVzdC50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5pbXBvcnQgYXNzZXJ0IGZyb20gJ2Fzc2VydCc7XG5pbXBvcnQgKiBhcyBzaW5vbiBmcm9tICdzaW5vbic7XG5pbXBvcnQgKiBhcyBhcnJheXMgZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vYXJyYXlzLmpzJztcbmltcG9ydCB7IERlZmVycmVkUHJvbWlzZSwgdGltZW91dCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2FzeW5jLmpzJztcbmltcG9ydCB7IENhbmNlbGxhdGlvblRva2VuLCBDYW5jZWxsYXRpb25Ub2tlblNvdXJjZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2NhbmNlbGxhdGlvbi5qcyc7XG5pbXBvcnQgeyBVUkkgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi91cmkuanMnO1xuaW1wb3J0IHsgUmFuZ2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL2NvcmUvcmFuZ2UuanMnO1xuaW1wb3J0IHsgSU1vZGVsU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vc2VydmljZXMvbW9kZWwuanMnO1xuaW1wb3J0IHsgTW9kZWxTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9zZXJ2aWNlcy9tb2RlbFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSUNvbmZpZ3VyYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29uZmlndXJhdGlvbi9jb21tb24vY29uZmlndXJhdGlvbi5qcyc7XG5pbXBvcnQgeyBUZXN0Q29uZmlndXJhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb25maWd1cmF0aW9uL3Rlc3QvY29tbW9uL3Rlc3RDb25maWd1cmF0aW9uU2VydmljZS5qcyc7XG5pbXBvcnQgeyBUZXN0SW5zdGFudGlhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9pbnN0YW50aWF0aW9uL3Rlc3QvY29tbW9uL2luc3RhbnRpYXRpb25TZXJ2aWNlTW9jay5qcyc7XG5pbXBvcnQgeyBJQUlUZXh0UXVlcnksIElGaWxlTWF0Y2gsIElGaWxlUXVlcnksIElGaWxlU2VhcmNoU3RhdHMsIElGb2xkZXJRdWVyeSwgSVNlYXJjaENvbXBsZXRlLCBJU2VhcmNoUHJvZ3Jlc3NJdGVtLCBJU2VhcmNoUXVlcnksIElTZWFyY2hTZXJ2aWNlLCBJVGV4dFF1ZXJ5LCBJVGV4dFNlYXJjaE1hdGNoLCBPbmVMaW5lUmFuZ2UsIFF1ZXJ5VHlwZSwgVGV4dFNlYXJjaE1hdGNoIH0gZnJvbSAnLi4vLi4vLi4vLi4vc2VydmljZXMvc2VhcmNoL2NvbW1vbi9zZWFyY2guanMnO1xuaW1wb3J0IHsgSVRlbGVtZXRyeVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS90ZWxlbWV0cnkvY29tbW9uL3RlbGVtZXRyeS5qcyc7XG5pbXBvcnQgeyBOdWxsVGVsZW1ldHJ5U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL3RlbGVtZXRyeS9jb21tb24vdGVsZW1ldHJ5VXRpbHMuanMnO1xuaW1wb3J0IHsgU2VhcmNoTW9kZWxJbXBsIH0gZnJvbSAnLi4vLi4vYnJvd3Nlci9zZWFyY2hUcmVlTW9kZWwvc2VhcmNoTW9kZWwuanMnO1xuaW1wb3J0IHsgSVRoZW1lU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL3RoZW1lL2NvbW1vbi90aGVtZVNlcnZpY2UuanMnO1xuaW1wb3J0IHsgVGVzdFRoZW1lU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL3RoZW1lL3Rlc3QvY29tbW9uL3Rlc3RUaGVtZVNlcnZpY2UuanMnO1xuaW1wb3J0IHsgRmlsZVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9maWxlcy9jb21tb24vZmlsZVNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSUxvZ1NlcnZpY2UsIE51bGxMb2dTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vbG9nL2NvbW1vbi9sb2cuanMnO1xuaW1wb3J0IHsgSVVyaUlkZW50aXR5U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL3VyaUlkZW50aXR5L2NvbW1vbi91cmlJZGVudGl0eS5qcyc7XG5pbXBvcnQgeyBVcmlJZGVudGl0eVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS91cmlJZGVudGl0eS9jb21tb24vdXJpSWRlbnRpdHlTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElMYWJlbFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9sYWJlbC9jb21tb24vbGFiZWwuanMnO1xuaW1wb3J0IHsgSU5vdGVib29rRWRpdG9yU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL25vdGVib29rL2Jyb3dzZXIvc2VydmljZXMvbm90ZWJvb2tFZGl0b3JTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElFZGl0b3JHcm91cHNTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vc2VydmljZXMvZWRpdG9yL2NvbW1vbi9lZGl0b3JHcm91cHNTZXJ2aWNlLmpzJztcbmltcG9ydCB7IFRlc3RFZGl0b3JHcm91cHNTZXJ2aWNlLCBUZXN0RWRpdG9yU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3Rlc3QvYnJvd3Nlci93b3JrYmVuY2hUZXN0U2VydmljZXMuanMnO1xuaW1wb3J0IHsgTm90ZWJvb2tFZGl0b3JXaWRnZXRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vbm90ZWJvb2svYnJvd3Nlci9zZXJ2aWNlcy9ub3RlYm9va0VkaXRvclNlcnZpY2VJbXBsLmpzJztcbmltcG9ydCB7IGNyZWF0ZUZpbGVVcmlGcm9tUGF0aEZyb21Sb290LCBnZXRSb290TmFtZSB9IGZyb20gJy4vc2VhcmNoVGVzdENvbW1vbi5qcyc7XG5pbXBvcnQgeyBJTm90ZWJvb2tDZWxsTWF0Y2hXaXRoTW9kZWwsIElOb3RlYm9va0ZpbGVNYXRjaFdpdGhNb2RlbCwgY29udGVudE1hdGNoZXNUb1RleHRTZWFyY2hNYXRjaGVzLCB3ZWJ2aWV3TWF0Y2hlc1RvVGV4dFNlYXJjaE1hdGNoZXMgfSBmcm9tICcuLi8uLi9icm93c2VyL25vdGVib29rU2VhcmNoL3NlYXJjaE5vdGVib29rSGVscGVycy5qcyc7XG5pbXBvcnQgeyBDZWxsS2luZCB9IGZyb20gJy4uLy4uLy4uL25vdGVib29rL2NvbW1vbi9ub3RlYm9va0NvbW1vbi5qcyc7XG5pbXBvcnQgeyBJQ2VsbFZpZXdNb2RlbCB9IGZyb20gJy4uLy4uLy4uL25vdGVib29rL2Jyb3dzZXIvbm90ZWJvb2tCcm93c2VyLmpzJztcbmltcG9ydCB7IEZpbmRNYXRjaCwgSVJlYWRvbmx5VGV4dEJ1ZmZlciB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vbW9kZWwuanMnO1xuaW1wb3J0IHsgUmVzb3VyY2VNYXAsIFJlc291cmNlU2V0IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbWFwLmpzJztcbmltcG9ydCB7IElOb3RlYm9va1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9ub3RlYm9vay9jb21tb24vbm90ZWJvb2tTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElOb3RlYm9va1NlYXJjaFNlcnZpY2UgfSBmcm9tICcuLi8uLi9jb21tb24vbm90ZWJvb2tTZWFyY2guanMnO1xuaW1wb3J0IHsgSUNvbnRleHRLZXlTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29udGV4dGtleS9jb21tb24vY29udGV4dGtleS5qcyc7XG5pbXBvcnQgeyBNb2NrQ29udGV4dEtleVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9rZXliaW5kaW5nL3Rlc3QvY29tbW9uL21vY2tLZXliaW5kaW5nU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJRWRpdG9yU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3NlcnZpY2VzL2VkaXRvci9jb21tb24vZWRpdG9yU2VydmljZS5qcyc7XG5pbXBvcnQgeyBlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL3Rlc3QvY29tbW9uL3V0aWxzLmpzJztcbmltcG9ydCB7IENlbGxNYXRjaCwgTWF0Y2hJbk5vdGVib29rIH0gZnJvbSAnLi4vLi4vYnJvd3Nlci9ub3RlYm9va1NlYXJjaC9ub3RlYm9va1NlYXJjaE1vZGVsLmpzJztcblxuY29uc3QgbnVsbEV2ZW50ID0gbmV3IGNsYXNzIHtcblx0aWQ6IG51bWJlciA9IC0xO1xuXHR0b3BpYyE6IHN0cmluZztcblx0bmFtZSE6IHN0cmluZztcblx0ZGVzY3JpcHRpb24hOiBzdHJpbmc7XG5cdGRhdGE6IGFueTtcblxuXHRzdGFydFRpbWUhOiBEYXRlO1xuXHRzdG9wVGltZSE6IERhdGU7XG5cblx0c3RvcCgpOiB2b2lkIHtcblx0XHRyZXR1cm47XG5cdH1cblxuXHR0aW1lVGFrZW4oKTogbnVtYmVyIHtcblx0XHRyZXR1cm4gLTE7XG5cdH1cbn07XG5cbmNvbnN0IGxpbmVPbmVSYW5nZSA9IG5ldyBPbmVMaW5lUmFuZ2UoMSwgMCwgMSk7XG5cbnN1aXRlKCdTZWFyY2hNb2RlbCcsICgpID0+IHtcblxuXHRsZXQgaW5zdGFudGlhdGlvblNlcnZpY2U6IFRlc3RJbnN0YW50aWF0aW9uU2VydmljZTtcblx0Y29uc3Qgc3RvcmUgPSBlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUoKTtcblxuXHRjb25zdCB0ZXN0U2VhcmNoU3RhdHM6IElGaWxlU2VhcmNoU3RhdHMgPSB7XG5cdFx0ZnJvbUNhY2hlOiBmYWxzZSxcblx0XHRyZXN1bHRDb3VudDogMSxcblx0XHR0eXBlOiAnc2VhcmNoUHJvY2VzcycsXG5cdFx0ZGV0YWlsU3RhdHM6IHtcblx0XHRcdGZpbGVXYWxrVGltZTogMCxcblx0XHRcdGNtZFRpbWU6IDAsXG5cdFx0XHRjbWRSZXN1bHRDb3VudDogMCxcblx0XHRcdGRpcmVjdG9yaWVzV2Fsa2VkOiAyLFxuXHRcdFx0ZmlsZXNXYWxrZWQ6IDNcblx0XHR9XG5cdH07XG5cblx0Y29uc3QgZm9sZGVyUXVlcmllczogSUZvbGRlclF1ZXJ5W10gPSBbXG5cdFx0eyBmb2xkZXI6IGNyZWF0ZUZpbGVVcmlGcm9tUGF0aEZyb21Sb290KCkgfVxuXHRdO1xuXG5cdHNldHVwKCgpID0+IHtcblx0XHRpbnN0YW50aWF0aW9uU2VydmljZSA9IG5ldyBUZXN0SW5zdGFudGlhdGlvblNlcnZpY2UoKTtcblx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElUZWxlbWV0cnlTZXJ2aWNlLCBOdWxsVGVsZW1ldHJ5U2VydmljZSk7XG5cdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJTGFiZWxTZXJ2aWNlLCB7IGdldFVyaUJhc2VuYW1lTGFiZWw6ICh1cmk6IFVSSSkgPT4gJycgfSk7XG5cdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJTm90ZWJvb2tTZXJ2aWNlLCB7IGdldE5vdGVib29rVGV4dE1vZGVsczogKCkgPT4gW10gfSk7XG5cdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJTW9kZWxTZXJ2aWNlLCBzdHViTW9kZWxTZXJ2aWNlKGluc3RhbnRpYXRpb25TZXJ2aWNlKSk7XG5cdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJTm90ZWJvb2tFZGl0b3JTZXJ2aWNlLCBzdHViTm90ZWJvb2tFZGl0b3JTZXJ2aWNlKGluc3RhbnRpYXRpb25TZXJ2aWNlKSk7XG5cdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJU2VhcmNoU2VydmljZSwge30pO1xuXHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSVNlYXJjaFNlcnZpY2UsICd0ZXh0U2VhcmNoJywgUHJvbWlzZS5yZXNvbHZlKHsgcmVzdWx0czogW10gfSkpO1xuXHRcdGNvbnN0IGZpbGVTZXJ2aWNlID0gbmV3IEZpbGVTZXJ2aWNlKG5ldyBOdWxsTG9nU2VydmljZSgpKTtcblx0XHRzdG9yZS5hZGQoZmlsZVNlcnZpY2UpO1xuXHRcdGNvbnN0IHVyaUlkZW50aXR5U2VydmljZSA9IG5ldyBVcmlJZGVudGl0eVNlcnZpY2UoZmlsZVNlcnZpY2UpO1xuXHRcdHN0b3JlLmFkZCh1cmlJZGVudGl0eVNlcnZpY2UpO1xuXHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSVVyaUlkZW50aXR5U2VydmljZSwgdXJpSWRlbnRpdHlTZXJ2aWNlKTtcblx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElMb2dTZXJ2aWNlLCBuZXcgTnVsbExvZ1NlcnZpY2UoKSk7XG5cdH0pO1xuXG5cdHRlYXJkb3duKCgpID0+IHNpbm9uLnJlc3RvcmUoKSk7XG5cblx0ZnVuY3Rpb24gc2VhcmNoU2VydmljZVdpdGhSZXN1bHRzKHJlc3VsdHM6IElGaWxlTWF0Y2hbXSwgY29tcGxldGU6IElTZWFyY2hDb21wbGV0ZSB8IG51bGwgPSBudWxsKTogSVNlYXJjaFNlcnZpY2Uge1xuXHRcdHJldHVybiA8SVNlYXJjaFNlcnZpY2U+e1xuXHRcdFx0dGV4dFNlYXJjaChxdWVyeTogSVNlYXJjaFF1ZXJ5LCB0b2tlbj86IENhbmNlbGxhdGlvblRva2VuLCBvblByb2dyZXNzPzogKHJlc3VsdDogSVNlYXJjaFByb2dyZXNzSXRlbSkgPT4gdm9pZCwgbm90ZWJvb2tVUklzPzogUmVzb3VyY2VTZXQpOiBQcm9taXNlPElTZWFyY2hDb21wbGV0ZT4ge1xuXHRcdFx0XHRyZXR1cm4gbmV3IFByb21pc2UocmVzb2x2ZSA9PiB7XG5cdFx0XHRcdFx0cXVldWVNaWNyb3Rhc2soKCkgPT4ge1xuXHRcdFx0XHRcdFx0cmVzdWx0cy5mb3JFYWNoKG9uUHJvZ3Jlc3MhKTtcblx0XHRcdFx0XHRcdHJlc29sdmUoY29tcGxldGUhKTtcblx0XHRcdFx0XHR9KTtcblx0XHRcdFx0fSk7XG5cdFx0XHR9LFxuXHRcdFx0ZmlsZVNlYXJjaChxdWVyeTogSUZpbGVRdWVyeSwgdG9rZW4/OiBDYW5jZWxsYXRpb25Ub2tlbik6IFByb21pc2U8SVNlYXJjaENvbXBsZXRlPiB7XG5cdFx0XHRcdHJldHVybiBuZXcgUHJvbWlzZShyZXNvbHZlID0+IHtcblx0XHRcdFx0XHRxdWV1ZU1pY3JvdGFzaygoKSA9PiB7XG5cdFx0XHRcdFx0XHRyZXNvbHZlKHsgcmVzdWx0czogcmVzdWx0cywgbWVzc2FnZXM6IFtdIH0pO1xuXHRcdFx0XHRcdH0pO1xuXG5cdFx0XHRcdH0pO1xuXHRcdFx0fSxcblx0XHRcdGFpVGV4dFNlYXJjaChxdWVyeTogSVNlYXJjaFF1ZXJ5LCB0b2tlbj86IENhbmNlbGxhdGlvblRva2VuLCBvblByb2dyZXNzPzogKHJlc3VsdDogSVNlYXJjaFByb2dyZXNzSXRlbSkgPT4gdm9pZCwgbm90ZWJvb2tVUklzPzogUmVzb3VyY2VTZXQpOiBQcm9taXNlPElTZWFyY2hDb21wbGV0ZT4ge1xuXHRcdFx0XHRyZXR1cm4gbmV3IFByb21pc2UocmVzb2x2ZSA9PiB7XG5cdFx0XHRcdFx0cXVldWVNaWNyb3Rhc2soKCkgPT4ge1xuXHRcdFx0XHRcdFx0cmVzdWx0cy5mb3JFYWNoKG9uUHJvZ3Jlc3MhKTtcblx0XHRcdFx0XHRcdHJlc29sdmUoY29tcGxldGUhKTtcblx0XHRcdFx0XHR9KTtcblx0XHRcdFx0fSk7XG5cdFx0XHR9LFxuXHRcdFx0dGV4dFNlYXJjaFNwbGl0U3luY0FzeW5jKHF1ZXJ5OiBJVGV4dFF1ZXJ5LCB0b2tlbj86IENhbmNlbGxhdGlvblRva2VuIHwgdW5kZWZpbmVkLCBvblByb2dyZXNzPzogKChyZXN1bHQ6IElTZWFyY2hQcm9ncmVzc0l0ZW0pID0+IHZvaWQpIHwgdW5kZWZpbmVkKTogeyBzeW5jUmVzdWx0czogSVNlYXJjaENvbXBsZXRlOyBhc3luY1Jlc3VsdHM6IFByb21pc2U8SVNlYXJjaENvbXBsZXRlPiB9IHtcblx0XHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0XHRzeW5jUmVzdWx0czoge1xuXHRcdFx0XHRcdFx0cmVzdWx0czogW10sXG5cdFx0XHRcdFx0XHRtZXNzYWdlczogW11cblx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdGFzeW5jUmVzdWx0czogbmV3IFByb21pc2UocmVzb2x2ZSA9PiB7XG5cdFx0XHRcdFx0XHRxdWV1ZU1pY3JvdGFzaygoKSA9PiB7XG5cdFx0XHRcdFx0XHRcdHJlc3VsdHMuZm9yRWFjaChvblByb2dyZXNzISk7XG5cdFx0XHRcdFx0XHRcdHJlc29sdmUoY29tcGxldGUhKTtcblx0XHRcdFx0XHRcdH0pO1xuXHRcdFx0XHRcdH0pXG5cdFx0XHRcdH07XG5cdFx0XHR9XG5cdFx0fTtcblx0fVxuXG5cdGZ1bmN0aW9uIHNlYXJjaFNlcnZpY2VXaXRoRXJyb3IoZXJyb3I6IEVycm9yKTogSVNlYXJjaFNlcnZpY2Uge1xuXHRcdHJldHVybiA8SVNlYXJjaFNlcnZpY2U+e1xuXHRcdFx0dGV4dFNlYXJjaChxdWVyeTogSVNlYXJjaFF1ZXJ5LCB0b2tlbj86IENhbmNlbGxhdGlvblRva2VuLCBvblByb2dyZXNzPzogKHJlc3VsdDogSVNlYXJjaFByb2dyZXNzSXRlbSkgPT4gdm9pZCk6IFByb21pc2U8SVNlYXJjaENvbXBsZXRlPiB7XG5cdFx0XHRcdHJldHVybiBuZXcgUHJvbWlzZSgocmVzb2x2ZSwgcmVqZWN0KSA9PiB7XG5cdFx0XHRcdFx0cmVqZWN0KGVycm9yKTtcblx0XHRcdFx0fSk7XG5cdFx0XHR9LFxuXHRcdFx0ZmlsZVNlYXJjaChxdWVyeTogSUZpbGVRdWVyeSwgdG9rZW4/OiBDYW5jZWxsYXRpb25Ub2tlbik6IFByb21pc2U8SVNlYXJjaENvbXBsZXRlPiB7XG5cdFx0XHRcdHJldHVybiBuZXcgUHJvbWlzZSgocmVzb2x2ZSwgcmVqZWN0KSA9PiB7XG5cdFx0XHRcdFx0cXVldWVNaWNyb3Rhc2soKCkgPT4ge1xuXHRcdFx0XHRcdFx0cmVqZWN0KGVycm9yKTtcblx0XHRcdFx0XHR9KTtcblx0XHRcdFx0fSk7XG5cdFx0XHR9LFxuXHRcdFx0YWlUZXh0U2VhcmNoKHF1ZXJ5OiBJU2VhcmNoUXVlcnksIHRva2VuPzogQ2FuY2VsbGF0aW9uVG9rZW4sIG9uUHJvZ3Jlc3M/OiAocmVzdWx0OiBJU2VhcmNoUHJvZ3Jlc3NJdGVtKSA9PiB2b2lkLCBub3RlYm9va1VSSXM/OiBSZXNvdXJjZVNldCk6IFByb21pc2U8SVNlYXJjaENvbXBsZXRlPiB7XG5cdFx0XHRcdHJldHVybiBuZXcgUHJvbWlzZSgocmVzb2x2ZSwgcmVqZWN0KSA9PiB7XG5cdFx0XHRcdFx0cmVqZWN0KGVycm9yKTtcblx0XHRcdFx0fSk7XG5cdFx0XHR9LFxuXHRcdFx0dGV4dFNlYXJjaFNwbGl0U3luY0FzeW5jKHF1ZXJ5OiBJVGV4dFF1ZXJ5LCB0b2tlbj86IENhbmNlbGxhdGlvblRva2VuIHwgdW5kZWZpbmVkLCBvblByb2dyZXNzPzogKChyZXN1bHQ6IElTZWFyY2hQcm9ncmVzc0l0ZW0pID0+IHZvaWQpIHwgdW5kZWZpbmVkKTogeyBzeW5jUmVzdWx0czogSVNlYXJjaENvbXBsZXRlOyBhc3luY1Jlc3VsdHM6IFByb21pc2U8SVNlYXJjaENvbXBsZXRlPiB9IHtcblx0XHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0XHRzeW5jUmVzdWx0czoge1xuXHRcdFx0XHRcdFx0cmVzdWx0czogW10sXG5cdFx0XHRcdFx0XHRtZXNzYWdlczogW11cblx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdGFzeW5jUmVzdWx0czogbmV3IFByb21pc2UoKHJlc29sdmUsIHJlamVjdCkgPT4ge1xuXHRcdFx0XHRcdFx0cmVqZWN0KGVycm9yKTtcblx0XHRcdFx0XHR9KVxuXHRcdFx0XHR9O1xuXHRcdFx0fVxuXHRcdH07XG5cdH1cblxuXHRmdW5jdGlvbiBjYW5jZWxlYWJsZVNlYXJjaFNlcnZpY2UodG9rZW5Tb3VyY2U6IENhbmNlbGxhdGlvblRva2VuU291cmNlKTogSVNlYXJjaFNlcnZpY2Uge1xuXHRcdHJldHVybiA8SVNlYXJjaFNlcnZpY2U+e1xuXHRcdFx0dGV4dFNlYXJjaChxdWVyeTogSVRleHRRdWVyeSwgdG9rZW4/OiBDYW5jZWxsYXRpb25Ub2tlbiwgb25Qcm9ncmVzcz86IChyZXN1bHQ6IElTZWFyY2hQcm9ncmVzc0l0ZW0pID0+IHZvaWQpOiBQcm9taXNlPElTZWFyY2hDb21wbGV0ZT4ge1xuXHRcdFx0XHRjb25zdCBkaXNwb3NhYmxlID0gdG9rZW4/Lm9uQ2FuY2VsbGF0aW9uUmVxdWVzdGVkKCgpID0+IHRva2VuU291cmNlLmNhbmNlbCgpKTtcblx0XHRcdFx0aWYgKGRpc3Bvc2FibGUpIHtcblx0XHRcdFx0XHRzdG9yZS5hZGQoZGlzcG9zYWJsZSk7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRyZXR1cm4gdGhpcy50ZXh0U2VhcmNoU3BsaXRTeW5jQXN5bmMocXVlcnksIHRva2VuLCBvblByb2dyZXNzKS5hc3luY1Jlc3VsdHM7XG5cdFx0XHR9LFxuXHRcdFx0ZmlsZVNlYXJjaChxdWVyeTogSUZpbGVRdWVyeSwgdG9rZW4/OiBDYW5jZWxsYXRpb25Ub2tlbik6IFByb21pc2U8SVNlYXJjaENvbXBsZXRlPiB7XG5cdFx0XHRcdGNvbnN0IGRpc3Bvc2FibGUgPSB0b2tlbj8ub25DYW5jZWxsYXRpb25SZXF1ZXN0ZWQoKCkgPT4gdG9rZW5Tb3VyY2UuY2FuY2VsKCkpO1xuXHRcdFx0XHRpZiAoZGlzcG9zYWJsZSkge1xuXHRcdFx0XHRcdHN0b3JlLmFkZChkaXNwb3NhYmxlKTtcblx0XHRcdFx0fVxuXHRcdFx0XHRyZXR1cm4gbmV3IFByb21pc2UocmVzb2x2ZSA9PiB7XG5cdFx0XHRcdFx0cXVldWVNaWNyb3Rhc2soKCkgPT4ge1xuXHRcdFx0XHRcdFx0Ly8gZXNsaW50LWRpc2FibGUtbmV4dC1saW5lIGxvY2FsL2NvZGUtbm8tYW55LWNhc3RzXG5cdFx0XHRcdFx0XHRyZXNvbHZlKDxhbnk+e30pO1xuXHRcdFx0XHRcdH0pO1xuXHRcdFx0XHR9KTtcblx0XHRcdH0sXG5cdFx0XHRhaVRleHRTZWFyY2gocXVlcnk6IElBSVRleHRRdWVyeSwgdG9rZW4/OiBDYW5jZWxsYXRpb25Ub2tlbiwgb25Qcm9ncmVzcz86IChyZXN1bHQ6IElTZWFyY2hQcm9ncmVzc0l0ZW0pID0+IHZvaWQsIG5vdGVib29rVVJJcz86IFJlc291cmNlU2V0KTogUHJvbWlzZTxJU2VhcmNoQ29tcGxldGU+IHtcblx0XHRcdFx0Y29uc3QgZGlzcG9zYWJsZSA9IHRva2VuPy5vbkNhbmNlbGxhdGlvblJlcXVlc3RlZCgoKSA9PiB0b2tlblNvdXJjZS5jYW5jZWwoKSk7XG5cdFx0XHRcdGlmIChkaXNwb3NhYmxlKSB7XG5cdFx0XHRcdFx0c3RvcmUuYWRkKGRpc3Bvc2FibGUpO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0cmV0dXJuIFByb21pc2UucmVzb2x2ZSh7XG5cdFx0XHRcdFx0cmVzdWx0czogW10sXG5cdFx0XHRcdFx0bWVzc2FnZXM6IFtdXG5cdFx0XHRcdH0pO1xuXHRcdFx0fSxcblx0XHRcdHRleHRTZWFyY2hTcGxpdFN5bmNBc3luYyhxdWVyeTogSVRleHRRdWVyeSwgdG9rZW4/OiBDYW5jZWxsYXRpb25Ub2tlbiB8IHVuZGVmaW5lZCwgb25Qcm9ncmVzcz86ICgocmVzdWx0OiBJU2VhcmNoUHJvZ3Jlc3NJdGVtKSA9PiB2b2lkKSB8IHVuZGVmaW5lZCk6IHsgc3luY1Jlc3VsdHM6IElTZWFyY2hDb21wbGV0ZTsgYXN5bmNSZXN1bHRzOiBQcm9taXNlPElTZWFyY2hDb21wbGV0ZT4gfSB7XG5cdFx0XHRcdGNvbnN0IGRpc3Bvc2FibGUgPSB0b2tlbj8ub25DYW5jZWxsYXRpb25SZXF1ZXN0ZWQoKCkgPT4gdG9rZW5Tb3VyY2UuY2FuY2VsKCkpO1xuXHRcdFx0XHRpZiAoZGlzcG9zYWJsZSkge1xuXHRcdFx0XHRcdHN0b3JlLmFkZChkaXNwb3NhYmxlKTtcblx0XHRcdFx0fVxuXHRcdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRcdHN5bmNSZXN1bHRzOiB7XG5cdFx0XHRcdFx0XHRyZXN1bHRzOiBbXSxcblx0XHRcdFx0XHRcdG1lc3NhZ2VzOiBbXVxuXHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0YXN5bmNSZXN1bHRzOiBuZXcgUHJvbWlzZShyZXNvbHZlID0+IHtcblx0XHRcdFx0XHRcdHF1ZXVlTWljcm90YXNrKCgpID0+IHtcblx0XHRcdFx0XHRcdFx0Ly8gZXNsaW50LWRpc2FibGUtbmV4dC1saW5lIGxvY2FsL2NvZGUtbm8tYW55LWNhc3RzXG5cdFx0XHRcdFx0XHRcdHJlc29sdmUoPGFueT57XG5cdFx0XHRcdFx0XHRcdFx0cmVzdWx0czogW10sXG5cdFx0XHRcdFx0XHRcdFx0bWVzc2FnZXM6IFtdXG5cdFx0XHRcdFx0XHRcdH0pO1xuXHRcdFx0XHRcdFx0fSk7XG5cdFx0XHRcdFx0fSlcblx0XHRcdFx0fTtcblx0XHRcdH1cblx0XHR9O1xuXHR9XG5cblx0ZnVuY3Rpb24gc2VhcmNoU2VydmljZVdpdGhEZWZlcnJlZFByb21pc2UocDogUHJvbWlzZTxJU2VhcmNoQ29tcGxldGU+KTogSVNlYXJjaFNlcnZpY2Uge1xuXHRcdHJldHVybiA8SVNlYXJjaFNlcnZpY2U+e1xuXHRcdFx0dGV4dFNlYXJjaFNwbGl0U3luY0FzeW5jKHF1ZXJ5OiBJVGV4dFF1ZXJ5LCB0b2tlbj86IENhbmNlbGxhdGlvblRva2VuIHwgdW5kZWZpbmVkLCBvblByb2dyZXNzPzogKChyZXN1bHQ6IElTZWFyY2hQcm9ncmVzc0l0ZW0pID0+IHZvaWQpIHwgdW5kZWZpbmVkKTogeyBzeW5jUmVzdWx0czogSVNlYXJjaENvbXBsZXRlOyBhc3luY1Jlc3VsdHM6IFByb21pc2U8SVNlYXJjaENvbXBsZXRlPiB9IHtcblx0XHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0XHRzeW5jUmVzdWx0czoge1xuXHRcdFx0XHRcdFx0cmVzdWx0czogW10sXG5cdFx0XHRcdFx0XHRtZXNzYWdlczogW11cblx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdGFzeW5jUmVzdWx0czogcCxcblx0XHRcdFx0fTtcblx0XHRcdH1cblx0XHR9O1xuXHR9XG5cblxuXHRmdW5jdGlvbiBub3RlYm9va1NlYXJjaFNlcnZpY2VXaXRoSW5mbyhyZXN1bHRzOiBJTm90ZWJvb2tGaWxlTWF0Y2hXaXRoTW9kZWxbXSwgdG9rZW5Tb3VyY2U6IENhbmNlbGxhdGlvblRva2VuU291cmNlIHwgdW5kZWZpbmVkKTogSU5vdGVib29rU2VhcmNoU2VydmljZSB7XG5cdFx0cmV0dXJuIDxJTm90ZWJvb2tTZWFyY2hTZXJ2aWNlPntcblx0XHRcdF9zZXJ2aWNlQnJhbmQ6IHVuZGVmaW5lZCxcblx0XHRcdG5vdGVib29rU2VhcmNoKHF1ZXJ5OiBJVGV4dFF1ZXJ5LCB0b2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4gfCB1bmRlZmluZWQsIHNlYXJjaEluc3RhbmNlSUQ6IHN0cmluZywgb25Qcm9ncmVzcz86IChyZXN1bHQ6IElTZWFyY2hQcm9ncmVzc0l0ZW0pID0+IHZvaWQpOiB7XG5cdFx0XHRcdG9wZW5GaWxlc1RvU2NhbjogUmVzb3VyY2VTZXQ7XG5cdFx0XHRcdGNvbXBsZXRlRGF0YTogUHJvbWlzZTxJU2VhcmNoQ29tcGxldGU+O1xuXHRcdFx0XHRhbGxTY2FubmVkRmlsZXM6IFByb21pc2U8UmVzb3VyY2VTZXQ+O1xuXHRcdFx0fSB7XG5cdFx0XHRcdGNvbnN0IGRpc3Bvc2FibGUgPSB0b2tlbj8ub25DYW5jZWxsYXRpb25SZXF1ZXN0ZWQoKCkgPT4gdG9rZW5Tb3VyY2U/LmNhbmNlbCgpKTtcblx0XHRcdFx0aWYgKGRpc3Bvc2FibGUpIHtcblx0XHRcdFx0XHRzdG9yZS5hZGQoZGlzcG9zYWJsZSk7XG5cdFx0XHRcdH1cblx0XHRcdFx0Y29uc3QgbG9jYWxSZXN1bHRzID0gbmV3IFJlc291cmNlTWFwPElOb3RlYm9va0ZpbGVNYXRjaFdpdGhNb2RlbCB8IG51bGw+KHVyaSA9PiB1cmkucGF0aCk7XG5cblx0XHRcdFx0cmVzdWx0cy5mb3JFYWNoKHIgPT4ge1xuXHRcdFx0XHRcdGxvY2FsUmVzdWx0cy5zZXQoci5yZXNvdXJjZSwgcik7XG5cdFx0XHRcdH0pO1xuXG5cdFx0XHRcdGlmIChvblByb2dyZXNzKSB7XG5cdFx0XHRcdFx0YXJyYXlzLmNvYWxlc2NlKFsuLi5sb2NhbFJlc3VsdHMudmFsdWVzKCldKS5mb3JFYWNoKG9uUHJvZ3Jlc3MpO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHJldHVybiB7XG5cdFx0XHRcdFx0b3BlbkZpbGVzVG9TY2FuOiBuZXcgUmVzb3VyY2VTZXQoWy4uLmxvY2FsUmVzdWx0cy5rZXlzKCldKSxcblx0XHRcdFx0XHRjb21wbGV0ZURhdGE6IFByb21pc2UucmVzb2x2ZSh7XG5cdFx0XHRcdFx0XHRtZXNzYWdlczogW10sXG5cdFx0XHRcdFx0XHRyZXN1bHRzOiBhcnJheXMuY29hbGVzY2UoWy4uLmxvY2FsUmVzdWx0cy52YWx1ZXMoKV0pLFxuXHRcdFx0XHRcdFx0bGltaXRIaXQ6IGZhbHNlXG5cdFx0XHRcdFx0fSksXG5cdFx0XHRcdFx0YWxsU2Nhbm5lZEZpbGVzOiBQcm9taXNlLnJlc29sdmUobmV3IFJlc291cmNlU2V0KCkpLFxuXHRcdFx0XHR9O1xuXHRcdFx0fVxuXHRcdH07XG5cdH1cblxuXHR0ZXN0KCdTZWFyY2ggTW9kZWw6IFNlYXJjaCBhZGRzIHRvIHJlc3VsdHMnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgcmVzdWx0cyA9IFtcblx0XHRcdGFSYXdNYXRjaCgnLzEnLFxuXHRcdFx0XHRuZXcgVGV4dFNlYXJjaE1hdGNoKCdwcmV2aWV3IDEnLCBuZXcgT25lTGluZVJhbmdlKDEsIDEsIDQpKSxcblx0XHRcdFx0bmV3IFRleHRTZWFyY2hNYXRjaCgncHJldmlldyAxJywgbmV3IE9uZUxpbmVSYW5nZSgxLCA0LCAxMSkpKSxcblx0XHRcdGFSYXdNYXRjaCgnLzInLCBuZXcgVGV4dFNlYXJjaE1hdGNoKCdwcmV2aWV3IDInLCBsaW5lT25lUmFuZ2UpKV07XG5cdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJU2VhcmNoU2VydmljZSwgc2VhcmNoU2VydmljZVdpdGhSZXN1bHRzKHJlc3VsdHMsIHsgbGltaXRIaXQ6IGZhbHNlLCBtZXNzYWdlczogW10sIHJlc3VsdHMgfSkpO1xuXHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSU5vdGVib29rU2VhcmNoU2VydmljZSwgbm90ZWJvb2tTZWFyY2hTZXJ2aWNlV2l0aEluZm8oW10sIHVuZGVmaW5lZCkpO1xuXG5cdFx0Y29uc3QgdGVzdE9iamVjdDogU2VhcmNoTW9kZWxJbXBsID0gaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoU2VhcmNoTW9kZWxJbXBsKTtcblx0XHRzdG9yZS5hZGQodGVzdE9iamVjdCk7XG5cdFx0YXdhaXQgdGVzdE9iamVjdC5zZWFyY2goeyBjb250ZW50UGF0dGVybjogeyBwYXR0ZXJuOiAnc29tZXN0cmluZycgfSwgdHlwZTogUXVlcnlUeXBlLlRleHQsIGZvbGRlclF1ZXJpZXMgfSkuYXN5bmNSZXN1bHRzO1xuXG5cdFx0Y29uc3QgYWN0dWFsID0gdGVzdE9iamVjdC5zZWFyY2hSZXN1bHQubWF0Y2hlcygpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKDIsIGFjdHVhbC5sZW5ndGgpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChVUkkuZmlsZShgJHtnZXRSb290TmFtZSgpfS8xYCkudG9TdHJpbmcoKSwgYWN0dWFsWzBdLnJlc291cmNlLnRvU3RyaW5nKCkpO1xuXG5cdFx0bGV0IGFjdHVhTWF0Y2hlcyA9IGFjdHVhbFswXS5tYXRjaGVzKCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKDIsIGFjdHVhTWF0Y2hlcy5sZW5ndGgpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCgncHJldmlldyAxJywgYWN0dWFNYXRjaGVzWzBdLnRleHQoKSk7XG5cdFx0YXNzZXJ0Lm9rKG5ldyBSYW5nZSgyLCAyLCAyLCA1KS5lcXVhbHNSYW5nZShhY3R1YU1hdGNoZXNbMF0ucmFuZ2UoKSkpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCgncHJldmlldyAxJywgYWN0dWFNYXRjaGVzWzFdLnRleHQoKSk7XG5cdFx0YXNzZXJ0Lm9rKG5ldyBSYW5nZSgyLCA1LCAyLCAxMikuZXF1YWxzUmFuZ2UoYWN0dWFNYXRjaGVzWzFdLnJhbmdlKCkpKTtcblxuXHRcdGFjdHVhTWF0Y2hlcyA9IGFjdHVhbFsxXS5tYXRjaGVzKCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKDEsIGFjdHVhTWF0Y2hlcy5sZW5ndGgpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCgncHJldmlldyAyJywgYWN0dWFNYXRjaGVzWzBdLnRleHQoKSk7XG5cdFx0YXNzZXJ0Lm9rKG5ldyBSYW5nZSgyLCAxLCAyLCAyKS5lcXVhbHNSYW5nZShhY3R1YU1hdGNoZXNbMF0ucmFuZ2UoKSkpO1xuXHR9KTtcblxuXG5cdHRlc3QoJ1NlYXJjaCBNb2RlbDogU2VhcmNoIGNhbiByZXR1cm4gbm90ZWJvb2sgcmVzdWx0cycsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCByZXN1bHRzID0gW1xuXHRcdFx0YVJhd01hdGNoKCcvMicsXG5cdFx0XHRcdG5ldyBUZXh0U2VhcmNoTWF0Y2goJ3Rlc3QnLCBuZXcgT25lTGluZVJhbmdlKDEsIDEsIDUpKSxcblx0XHRcdFx0bmV3IFRleHRTZWFyY2hNYXRjaCgndGhpcyBpcyBhIHRlc3QnLCBuZXcgT25lTGluZVJhbmdlKDEsIDExLCAxNSkpKSxcblx0XHRcdGFSYXdNYXRjaCgnLzMnLCBuZXcgVGV4dFNlYXJjaE1hdGNoKCd0ZXN0JywgbGluZU9uZVJhbmdlKSldO1xuXHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSVNlYXJjaFNlcnZpY2UsIHNlYXJjaFNlcnZpY2VXaXRoUmVzdWx0cyhyZXN1bHRzLCB7IGxpbWl0SGl0OiBmYWxzZSwgbWVzc2FnZXM6IFtdLCByZXN1bHRzIH0pKTtcblx0XHRzaW5vbi5zdHViKENlbGxNYXRjaC5wcm90b3R5cGUsICdhZGRDb250ZXh0Jyk7XG5cblx0XHRjb25zdCBtZElucHV0Q2VsbCA9IHtcblx0XHRcdGNlbGxLaW5kOiBDZWxsS2luZC5NYXJrdXAsIHRleHRCdWZmZXI6IDxJUmVhZG9ubHlUZXh0QnVmZmVyPntcblx0XHRcdFx0Z2V0TGluZUNvbnRlbnQobGluZU51bWJlcjogbnVtYmVyKTogc3RyaW5nIHtcblx0XHRcdFx0XHRpZiAobGluZU51bWJlciA9PT0gMSkge1xuXHRcdFx0XHRcdFx0cmV0dXJuICcjIFRlc3QnO1xuXHRcdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0XHRyZXR1cm4gJyc7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHR9LFxuXHRcdFx0aWQ6ICdtZElucHV0Q2VsbCdcblx0XHR9IGFzIElDZWxsVmlld01vZGVsO1xuXG5cdFx0Y29uc3QgZmluZE1hdGNoTWRzID0gW25ldyBGaW5kTWF0Y2gobmV3IFJhbmdlKDEsIDMsIDEsIDcpLCBbJ1Rlc3QnXSldO1xuXG5cdFx0Y29uc3QgY29kZUNlbGwgPSB7XG5cdFx0XHRjZWxsS2luZDogQ2VsbEtpbmQuQ29kZSwgdGV4dEJ1ZmZlcjogPElSZWFkb25seVRleHRCdWZmZXI+e1xuXHRcdFx0XHRnZXRMaW5lQ29udGVudChsaW5lTnVtYmVyOiBudW1iZXIpOiBzdHJpbmcge1xuXHRcdFx0XHRcdGlmIChsaW5lTnVtYmVyID09PSAxKSB7XG5cdFx0XHRcdFx0XHRyZXR1cm4gJ3ByaW50KFwidGVzdCEgdGVzdGluZyEhXCIpJztcblx0XHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdFx0cmV0dXJuICcnO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0fSxcblx0XHRcdGlkOiAnY29kZUNlbGwnXG5cdFx0fSBhcyBJQ2VsbFZpZXdNb2RlbDtcblxuXHRcdGNvbnN0IGZpbmRNYXRjaENvZGVDZWxscyA9XG5cdFx0XHRbbmV3IEZpbmRNYXRjaChuZXcgUmFuZ2UoMSwgOCwgMSwgMTIpLCBbJ3Rlc3QnXSksXG5cdFx0XHRuZXcgRmluZE1hdGNoKG5ldyBSYW5nZSgxLCAxNCwgMSwgMTgpLCBbJ3Rlc3QnXSksXG5cdFx0XHRdO1xuXHRcdGNvbnN0IHdlYnZpZXdNYXRjaGVzID0gW3tcblx0XHRcdGluZGV4OiAwLFxuXHRcdFx0c2VhcmNoUHJldmlld0luZm86IHtcblx0XHRcdFx0bGluZTogJ3Rlc3QhIHRlc3RpbmchIScsXG5cdFx0XHRcdHJhbmdlOiB7XG5cdFx0XHRcdFx0c3RhcnQ6IDEsXG5cdFx0XHRcdFx0ZW5kOiA1XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9LFxuXHRcdHtcblx0XHRcdGluZGV4OiAxLFxuXHRcdFx0c2VhcmNoUHJldmlld0luZm86IHtcblx0XHRcdFx0bGluZTogJ3Rlc3QhIHRlc3RpbmchIScsXG5cdFx0XHRcdHJhbmdlOiB7XG5cdFx0XHRcdFx0c3RhcnQ6IDcsXG5cdFx0XHRcdFx0ZW5kOiAxMVxuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fVxuXHRcdF07XG5cdFx0Y29uc3QgY2VsbE1hdGNoTWQ6IElOb3RlYm9va0NlbGxNYXRjaFdpdGhNb2RlbCA9IHtcblx0XHRcdGNlbGw6IG1kSW5wdXRDZWxsLFxuXHRcdFx0aW5kZXg6IDAsXG5cdFx0XHRjb250ZW50UmVzdWx0czogY29udGVudE1hdGNoZXNUb1RleHRTZWFyY2hNYXRjaGVzKGZpbmRNYXRjaE1kcywgbWRJbnB1dENlbGwpLFxuXHRcdFx0d2Vidmlld1Jlc3VsdHM6IFtdXG5cdFx0fTtcblxuXHRcdGNvbnN0IGNlbGxNYXRjaENvZGU6IElOb3RlYm9va0NlbGxNYXRjaFdpdGhNb2RlbCA9IHtcblx0XHRcdGNlbGw6IGNvZGVDZWxsLFxuXHRcdFx0aW5kZXg6IDEsXG5cdFx0XHRjb250ZW50UmVzdWx0czogY29udGVudE1hdGNoZXNUb1RleHRTZWFyY2hNYXRjaGVzKGZpbmRNYXRjaENvZGVDZWxscywgY29kZUNlbGwpLFxuXHRcdFx0d2Vidmlld1Jlc3VsdHM6IHdlYnZpZXdNYXRjaGVzVG9UZXh0U2VhcmNoTWF0Y2hlcyh3ZWJ2aWV3TWF0Y2hlcyksXG5cdFx0fTtcblxuXHRcdGNvbnN0IG5vdGVib29rU2VhcmNoU2VydmljZSA9IGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSU5vdGVib29rU2VhcmNoU2VydmljZSwgbm90ZWJvb2tTZWFyY2hTZXJ2aWNlV2l0aEluZm8oW2FSYXdNYXRjaFdpdGhDZWxscygnLzEnLCBjZWxsTWF0Y2hNZCwgY2VsbE1hdGNoQ29kZSldLCB1bmRlZmluZWQpKTtcblx0XHRjb25zdCBub3RlYm9va1NlYXJjaCA9IHNpbm9uLnNweShub3RlYm9va1NlYXJjaFNlcnZpY2UsICdub3RlYm9va1NlYXJjaCcpO1xuXHRcdGNvbnN0IG1vZGVsOiBTZWFyY2hNb2RlbEltcGwgPSBpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShTZWFyY2hNb2RlbEltcGwpO1xuXHRcdHN0b3JlLmFkZChtb2RlbCk7XG5cdFx0YXdhaXQgbW9kZWwuc2VhcmNoKHsgY29udGVudFBhdHRlcm46IHsgcGF0dGVybjogJ3Rlc3QnIH0sIHR5cGU6IFF1ZXJ5VHlwZS5UZXh0LCBmb2xkZXJRdWVyaWVzIH0pLmFzeW5jUmVzdWx0cztcblx0XHRjb25zdCBhY3R1YWwgPSBtb2RlbC5zZWFyY2hSZXN1bHQubWF0Y2hlcygpO1xuXG5cdFx0YXNzZXJ0KG5vdGVib29rU2VhcmNoLmNhbGxlZE9uY2UpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKDMsIGFjdHVhbC5sZW5ndGgpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChVUkkuZmlsZShgJHtnZXRSb290TmFtZSgpfS8xYCkudG9TdHJpbmcoKSwgYWN0dWFsWzBdLnJlc291cmNlLnRvU3RyaW5nKCkpO1xuXHRcdGNvbnN0IG5vdGVib29rRmlsZU1hdGNoZXMgPSBhY3R1YWxbMF0ubWF0Y2hlcygpO1xuXG5cdFx0YXNzZXJ0Lm9rKG5vdGVib29rRmlsZU1hdGNoZXNbMF0ucmFuZ2UoKS5lcXVhbHNSYW5nZShuZXcgUmFuZ2UoMSwgMywgMSwgNykpKTtcblx0XHRhc3NlcnQub2sobm90ZWJvb2tGaWxlTWF0Y2hlc1sxXS5yYW5nZSgpLmVxdWFsc1JhbmdlKG5ldyBSYW5nZSgxLCA4LCAxLCAxMikpKTtcblx0XHRhc3NlcnQub2sobm90ZWJvb2tGaWxlTWF0Y2hlc1syXS5yYW5nZSgpLmVxdWFsc1JhbmdlKG5ldyBSYW5nZSgxLCAxNCwgMSwgMTgpKSk7XG5cdFx0YXNzZXJ0Lm9rKG5vdGVib29rRmlsZU1hdGNoZXNbM10ucmFuZ2UoKS5lcXVhbHNSYW5nZShuZXcgUmFuZ2UoMSwgMiwgMSwgNikpKTtcblx0XHRhc3NlcnQub2sobm90ZWJvb2tGaWxlTWF0Y2hlc1s0XS5yYW5nZSgpLmVxdWFsc1JhbmdlKG5ldyBSYW5nZSgxLCA4LCAxLCAxMikpKTtcblxuXHRcdG5vdGVib29rRmlsZU1hdGNoZXMuZm9yRWFjaChtYXRjaCA9PiBtYXRjaCBpbnN0YW5jZW9mIE1hdGNoSW5Ob3RlYm9vayk7XG5cdFx0YXNzZXJ0KChub3RlYm9va0ZpbGVNYXRjaGVzWzBdIGFzIE1hdGNoSW5Ob3RlYm9vaykuY2VsbD8uaWQgPT09ICdtZElucHV0Q2VsbCcpO1xuXHRcdGFzc2VydCgobm90ZWJvb2tGaWxlTWF0Y2hlc1sxXSBhcyBNYXRjaEluTm90ZWJvb2spLmNlbGw/LmlkID09PSAnY29kZUNlbGwnKTtcblx0XHRhc3NlcnQoKG5vdGVib29rRmlsZU1hdGNoZXNbMl0gYXMgTWF0Y2hJbk5vdGVib29rKS5jZWxsPy5pZCA9PT0gJ2NvZGVDZWxsJyk7XG5cdFx0YXNzZXJ0KChub3RlYm9va0ZpbGVNYXRjaGVzWzNdIGFzIE1hdGNoSW5Ob3RlYm9vaykuY2VsbD8uaWQgPT09ICdjb2RlQ2VsbCcpO1xuXHRcdGFzc2VydCgobm90ZWJvb2tGaWxlTWF0Y2hlc1s0XSBhcyBNYXRjaEluTm90ZWJvb2spLmNlbGw/LmlkID09PSAnY29kZUNlbGwnKTtcblxuXHRcdGNvbnN0IG1kQ2VsbE1hdGNoUHJvY2Vzc2VkID0gKG5vdGVib29rRmlsZU1hdGNoZXNbMF0gYXMgTWF0Y2hJbk5vdGVib29rKS5jZWxsUGFyZW50O1xuXHRcdGNvbnN0IGNvZGVDZWxsTWF0Y2hQcm9jZXNzZWQgPSAobm90ZWJvb2tGaWxlTWF0Y2hlc1sxXSBhcyBNYXRjaEluTm90ZWJvb2spLmNlbGxQYXJlbnQ7XG5cblx0XHRhc3NlcnQobWRDZWxsTWF0Y2hQcm9jZXNzZWQuY29udGVudE1hdGNoZXMubGVuZ3RoID09PSAxKTtcblx0XHRhc3NlcnQoY29kZUNlbGxNYXRjaFByb2Nlc3NlZC5jb250ZW50TWF0Y2hlcy5sZW5ndGggPT09IDIpO1xuXHRcdGFzc2VydChjb2RlQ2VsbE1hdGNoUHJvY2Vzc2VkLndlYnZpZXdNYXRjaGVzLmxlbmd0aCA9PT0gMik7XG5cblx0XHRhc3NlcnQobWRDZWxsTWF0Y2hQcm9jZXNzZWQuY29udGVudE1hdGNoZXNbMF0gPT09IG5vdGVib29rRmlsZU1hdGNoZXNbMF0pO1xuXHRcdGFzc2VydChjb2RlQ2VsbE1hdGNoUHJvY2Vzc2VkLmNvbnRlbnRNYXRjaGVzWzBdID09PSBub3RlYm9va0ZpbGVNYXRjaGVzWzFdKTtcblx0XHRhc3NlcnQoY29kZUNlbGxNYXRjaFByb2Nlc3NlZC5jb250ZW50TWF0Y2hlc1sxXSA9PT0gbm90ZWJvb2tGaWxlTWF0Y2hlc1syXSk7XG5cdFx0YXNzZXJ0KGNvZGVDZWxsTWF0Y2hQcm9jZXNzZWQud2Vidmlld01hdGNoZXNbMF0gPT09IG5vdGVib29rRmlsZU1hdGNoZXNbM10pO1xuXHRcdGFzc2VydChjb2RlQ2VsbE1hdGNoUHJvY2Vzc2VkLndlYnZpZXdNYXRjaGVzWzFdID09PSBub3RlYm9va0ZpbGVNYXRjaGVzWzRdKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChVUkkuZmlsZShgJHtnZXRSb290TmFtZSgpfS8yYCkudG9TdHJpbmcoKSwgYWN0dWFsWzFdLnJlc291cmNlLnRvU3RyaW5nKCkpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChVUkkuZmlsZShgJHtnZXRSb290TmFtZSgpfS8zYCkudG9TdHJpbmcoKSwgYWN0dWFsWzJdLnJlc291cmNlLnRvU3RyaW5nKCkpO1xuXHR9KTtcblxuXHR0ZXN0KCdTZWFyY2ggTW9kZWw6IFNlYXJjaCByZXBvcnRzIHRlbGVtZXRyeSBvbiBzZWFyY2ggY29tcGxldGVkJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHRhcmdldCA9IGluc3RhbnRpYXRpb25TZXJ2aWNlLnNweShJVGVsZW1ldHJ5U2VydmljZSwgJ3B1YmxpY0xvZycpO1xuXHRcdGNvbnN0IHJlc3VsdHMgPSBbXG5cdFx0XHRhUmF3TWF0Y2goJy8xJyxcblx0XHRcdFx0bmV3IFRleHRTZWFyY2hNYXRjaCgncHJldmlldyAxJywgbmV3IE9uZUxpbmVSYW5nZSgxLCAxLCA0KSksXG5cdFx0XHRcdG5ldyBUZXh0U2VhcmNoTWF0Y2goJ3ByZXZpZXcgMScsIG5ldyBPbmVMaW5lUmFuZ2UoMSwgNCwgMTEpKSksXG5cdFx0XHRhUmF3TWF0Y2goJy8yJyxcblx0XHRcdFx0bmV3IFRleHRTZWFyY2hNYXRjaCgncHJldmlldyAyJywgbGluZU9uZVJhbmdlKSldO1xuXHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSVNlYXJjaFNlcnZpY2UsIHNlYXJjaFNlcnZpY2VXaXRoUmVzdWx0cyhyZXN1bHRzLCB7IGxpbWl0SGl0OiBmYWxzZSwgbWVzc2FnZXM6IFtdLCByZXN1bHRzIH0pKTtcblx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElOb3RlYm9va1NlYXJjaFNlcnZpY2UsIG5vdGVib29rU2VhcmNoU2VydmljZVdpdGhJbmZvKFtdLCB1bmRlZmluZWQpKTtcblxuXHRcdGNvbnN0IHRlc3RPYmplY3Q6IFNlYXJjaE1vZGVsSW1wbCA9IGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFNlYXJjaE1vZGVsSW1wbCk7XG5cdFx0c3RvcmUuYWRkKHRlc3RPYmplY3QpO1xuXHRcdGF3YWl0IHRlc3RPYmplY3Quc2VhcmNoKHsgY29udGVudFBhdHRlcm46IHsgcGF0dGVybjogJ3NvbWVzdHJpbmcnIH0sIHR5cGU6IFF1ZXJ5VHlwZS5UZXh0LCBmb2xkZXJRdWVyaWVzIH0pLmFzeW5jUmVzdWx0cztcblxuXHRcdGFzc2VydC5vayh0YXJnZXQuY2FsbGVkVGhyaWNlKTtcblx0XHRhc3NlcnQub2sodGFyZ2V0LmNhbGxlZFdpdGgoJ3NlYXJjaFJlc3VsdHNGaXJzdFJlbmRlcicpKTtcblx0XHRhc3NlcnQub2sodGFyZ2V0LmNhbGxlZFdpdGgoJ3NlYXJjaFJlc3VsdHNGaW5pc2hlZCcpKTtcblx0fSk7XG5cblx0dGVzdCgnU2VhcmNoIE1vZGVsOiBTZWFyY2ggcmVwb3J0cyB0aW1lZCB0ZWxlbWV0cnkgb24gc2VhcmNoIHdoZW4gcHJvZ3Jlc3MgaXMgbm90IGNhbGxlZCcsICgpID0+IHtcblx0XHRjb25zdCB0YXJnZXQyID0gc2lub24uc3B5KCk7XG5cdFx0c2lub24uc3R1YihudWxsRXZlbnQsICdzdG9wJykuY2FsbHNGYWtlKHRhcmdldDIpO1xuXHRcdGNvbnN0IHRhcmdldDEgPSBzaW5vbi5zdHViKCkucmV0dXJucyhudWxsRXZlbnQpO1xuXHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSVRlbGVtZXRyeVNlcnZpY2UsICdwdWJsaWNMb2cnLCB0YXJnZXQxKTtcblxuXHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSVNlYXJjaFNlcnZpY2UsIHNlYXJjaFNlcnZpY2VXaXRoUmVzdWx0cyhbXSwgeyBsaW1pdEhpdDogZmFsc2UsIG1lc3NhZ2VzOiBbXSwgcmVzdWx0czogW10gfSkpO1xuXHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSU5vdGVib29rU2VhcmNoU2VydmljZSwgbm90ZWJvb2tTZWFyY2hTZXJ2aWNlV2l0aEluZm8oW10sIHVuZGVmaW5lZCkpO1xuXG5cdFx0Y29uc3QgdGVzdE9iamVjdCA9IGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFNlYXJjaE1vZGVsSW1wbCk7XG5cdFx0c3RvcmUuYWRkKHRlc3RPYmplY3QpO1xuXHRcdGNvbnN0IHJlc3VsdCA9IHRlc3RPYmplY3Quc2VhcmNoKHsgY29udGVudFBhdHRlcm46IHsgcGF0dGVybjogJ3NvbWVzdHJpbmcnIH0sIHR5cGU6IFF1ZXJ5VHlwZS5UZXh0LCBmb2xkZXJRdWVyaWVzIH0pLmFzeW5jUmVzdWx0cztcblxuXHRcdHJldHVybiByZXN1bHQudGhlbigoKSA9PiB7XG5cdFx0XHRyZXR1cm4gdGltZW91dCgxKS50aGVuKCgpID0+IHtcblx0XHRcdFx0YXNzZXJ0Lm9rKHRhcmdldDEuY2FsbGVkV2l0aCgnc2VhcmNoUmVzdWx0c0ZpcnN0UmVuZGVyJykpO1xuXHRcdFx0XHRhc3NlcnQub2sodGFyZ2V0MS5jYWxsZWRXaXRoKCdzZWFyY2hSZXN1bHRzRmluaXNoZWQnKSk7XG5cdFx0XHR9KTtcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnU2VhcmNoIE1vZGVsOiBTZWFyY2ggcmVwb3J0cyB0aW1lZCB0ZWxlbWV0cnkgb24gc2VhcmNoIHdoZW4gcHJvZ3Jlc3MgaXMgY2FsbGVkJywgKCkgPT4ge1xuXHRcdGNvbnN0IHRhcmdldDIgPSBzaW5vbi5zcHkoKTtcblx0XHRzaW5vbi5zdHViKG51bGxFdmVudCwgJ3N0b3AnKS5jYWxsc0Zha2UodGFyZ2V0Mik7XG5cdFx0Y29uc3QgdGFyZ2V0MSA9IHNpbm9uLnN0dWIoKS5yZXR1cm5zKG51bGxFdmVudCk7XG5cdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJVGVsZW1ldHJ5U2VydmljZSwgJ3B1YmxpY0xvZycsIHRhcmdldDEpO1xuXG5cdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJU2VhcmNoU2VydmljZSwgc2VhcmNoU2VydmljZVdpdGhSZXN1bHRzKFxuXHRcdFx0W2FSYXdNYXRjaCgnLzEnLCBuZXcgVGV4dFNlYXJjaE1hdGNoKCdzb21lIHByZXZpZXcnLCBsaW5lT25lUmFuZ2UpKV0sXG5cdFx0XHR7IHJlc3VsdHM6IFtdLCBzdGF0czogdGVzdFNlYXJjaFN0YXRzLCBtZXNzYWdlczogW10gfSkpO1xuXHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSU5vdGVib29rU2VhcmNoU2VydmljZSwgbm90ZWJvb2tTZWFyY2hTZXJ2aWNlV2l0aEluZm8oW10sIHVuZGVmaW5lZCkpO1xuXG5cdFx0Y29uc3QgdGVzdE9iamVjdCA9IGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFNlYXJjaE1vZGVsSW1wbCk7XG5cdFx0c3RvcmUuYWRkKHRlc3RPYmplY3QpO1xuXHRcdGNvbnN0IHJlc3VsdCA9IHRlc3RPYmplY3Quc2VhcmNoKHsgY29udGVudFBhdHRlcm46IHsgcGF0dGVybjogJ3NvbWVzdHJpbmcnIH0sIHR5cGU6IFF1ZXJ5VHlwZS5UZXh0LCBmb2xkZXJRdWVyaWVzIH0pLmFzeW5jUmVzdWx0cztcblxuXHRcdHJldHVybiByZXN1bHQudGhlbigoKSA9PiB7XG5cdFx0XHRyZXR1cm4gdGltZW91dCgxKS50aGVuKCgpID0+IHtcblx0XHRcdFx0Ly8gdGltZW91dCBiZWNhdXNlIHByb21pc2UgaGFuZGxlcnMgbWF5IHJ1biBpbiBhIGRpZmZlcmVudCBvcmRlci4gV2Ugb25seSBjYXJlIHRoYXQgdGhlc2Vcblx0XHRcdFx0Ly8gYXJlIGZpcmVkIGF0IHNvbWUgcG9pbnQuXG5cdFx0XHRcdGFzc2VydC5vayh0YXJnZXQxLmNhbGxlZFdpdGgoJ3NlYXJjaFJlc3VsdHNGaXJzdFJlbmRlcicpKTtcblx0XHRcdFx0YXNzZXJ0Lm9rKHRhcmdldDEuY2FsbGVkV2l0aCgnc2VhcmNoUmVzdWx0c0ZpbmlzaGVkJykpO1xuXHRcdFx0XHQvLyBhc3NlcnQuc3RyaWN0RXF1YWwoMSwgdGFyZ2V0Mi5jYWxsQ291bnQpO1xuXHRcdFx0fSk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ1NlYXJjaCBNb2RlbDogU2VhcmNoIHJlcG9ydHMgdGltZWQgdGVsZW1ldHJ5IG9uIHNlYXJjaCB3aGVuIGVycm9yIGlzIGNhbGxlZCcsICgpID0+IHtcblx0XHRjb25zdCB0YXJnZXQyID0gc2lub24uc3B5KCk7XG5cdFx0c2lub24uc3R1YihudWxsRXZlbnQsICdzdG9wJykuY2FsbHNGYWtlKHRhcmdldDIpO1xuXHRcdGNvbnN0IHRhcmdldDEgPSBzaW5vbi5zdHViKCkucmV0dXJucyhudWxsRXZlbnQpO1xuXHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSVRlbGVtZXRyeVNlcnZpY2UsICdwdWJsaWNMb2cnLCB0YXJnZXQxKTtcblxuXHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSVNlYXJjaFNlcnZpY2UsIHNlYXJjaFNlcnZpY2VXaXRoRXJyb3IobmV3IEVycm9yKCdUaGlzIGVycm9yIHNob3VsZCBiZSB0aHJvd24gYnkgdGhpcyB0ZXN0LicpKSk7XG5cdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJTm90ZWJvb2tTZWFyY2hTZXJ2aWNlLCBub3RlYm9va1NlYXJjaFNlcnZpY2VXaXRoSW5mbyhbXSwgdW5kZWZpbmVkKSk7XG5cblx0XHRjb25zdCB0ZXN0T2JqZWN0ID0gaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoU2VhcmNoTW9kZWxJbXBsKTtcblx0XHRzdG9yZS5hZGQodGVzdE9iamVjdCk7XG5cdFx0Y29uc3QgcmVzdWx0ID0gdGVzdE9iamVjdC5zZWFyY2goeyBjb250ZW50UGF0dGVybjogeyBwYXR0ZXJuOiAnc29tZXN0cmluZycgfSwgdHlwZTogUXVlcnlUeXBlLlRleHQsIGZvbGRlclF1ZXJpZXMgfSkuYXN5bmNSZXN1bHRzO1xuXG5cdFx0cmV0dXJuIHJlc3VsdC50aGVuKCgpID0+IHsgfSwgKCkgPT4ge1xuXHRcdFx0cmV0dXJuIHRpbWVvdXQoMSkudGhlbigoKSA9PiB7XG5cdFx0XHRcdGFzc2VydC5vayh0YXJnZXQxLmNhbGxlZFdpdGgoJ3NlYXJjaFJlc3VsdHNGaXJzdFJlbmRlcicpKTtcblx0XHRcdFx0YXNzZXJ0Lm9rKHRhcmdldDEuY2FsbGVkV2l0aCgnc2VhcmNoUmVzdWx0c0ZpbmlzaGVkJykpO1xuXHRcdFx0fSk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ1NlYXJjaCBNb2RlbDogU2VhcmNoIHJlcG9ydHMgdGltZWQgdGVsZW1ldHJ5IG9uIHNlYXJjaCB3aGVuIGVycm9yIGlzIGNhbmNlbGxlZCBlcnJvcicsICgpID0+IHtcblx0XHRjb25zdCB0YXJnZXQyID0gc2lub24uc3B5KCk7XG5cdFx0c2lub24uc3R1YihudWxsRXZlbnQsICdzdG9wJykuY2FsbHNGYWtlKHRhcmdldDIpO1xuXHRcdGNvbnN0IHRhcmdldDEgPSBzaW5vbi5zdHViKCkucmV0dXJucyhudWxsRXZlbnQpO1xuXHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSVRlbGVtZXRyeVNlcnZpY2UsICdwdWJsaWNMb2cnLCB0YXJnZXQxKTtcblxuXHRcdGNvbnN0IGRlZmVycmVkUHJvbWlzZSA9IG5ldyBEZWZlcnJlZFByb21pc2U8SVNlYXJjaENvbXBsZXRlPigpO1xuXG5cdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJU2VhcmNoU2VydmljZSwgc2VhcmNoU2VydmljZVdpdGhEZWZlcnJlZFByb21pc2UoZGVmZXJyZWRQcm9taXNlLnApKTtcblx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElOb3RlYm9va1NlYXJjaFNlcnZpY2UsIG5vdGVib29rU2VhcmNoU2VydmljZVdpdGhJbmZvKFtdLCB1bmRlZmluZWQpKTtcblxuXHRcdGNvbnN0IHRlc3RPYmplY3QgPSBpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShTZWFyY2hNb2RlbEltcGwpO1xuXHRcdHN0b3JlLmFkZCh0ZXN0T2JqZWN0KTtcblx0XHRjb25zdCByZXN1bHQgPSB0ZXN0T2JqZWN0LnNlYXJjaCh7IGNvbnRlbnRQYXR0ZXJuOiB7IHBhdHRlcm46ICdzb21lc3RyaW5nJyB9LCB0eXBlOiBRdWVyeVR5cGUuVGV4dCwgZm9sZGVyUXVlcmllcyB9KS5hc3luY1Jlc3VsdHM7XG5cblx0XHRkZWZlcnJlZFByb21pc2UuY2FuY2VsKCk7XG5cblx0XHRyZXR1cm4gcmVzdWx0LnRoZW4oKCkgPT4geyB9LCBhc3luYyAoKSA9PiB7XG5cdFx0XHRyZXR1cm4gdGltZW91dCgxKS50aGVuKCgpID0+IHtcblx0XHRcdFx0YXNzZXJ0Lm9rKHRhcmdldDEuY2FsbGVkV2l0aCgnc2VhcmNoUmVzdWx0c0ZpcnN0UmVuZGVyJykpO1xuXHRcdFx0XHRhc3NlcnQub2sodGFyZ2V0MS5jYWxsZWRXaXRoKCdzZWFyY2hSZXN1bHRzRmluaXNoZWQnKSk7XG5cdFx0XHRcdC8vIGFzc2VydC5vayh0YXJnZXQyLmNhbGxlZE9uY2UpO1xuXHRcdFx0fSk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ1NlYXJjaCBNb2RlbDogU2VhcmNoIHJlc3VsdHMgYXJlIGNsZWFyZWQgZHVyaW5nIHNlYXJjaCcsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCByZXN1bHRzID0gW1xuXHRcdFx0YVJhd01hdGNoKCcvMScsXG5cdFx0XHRcdG5ldyBUZXh0U2VhcmNoTWF0Y2goJ3ByZXZpZXcgMScsIG5ldyBPbmVMaW5lUmFuZ2UoMSwgMSwgNCkpLFxuXHRcdFx0XHRuZXcgVGV4dFNlYXJjaE1hdGNoKCdwcmV2aWV3IDEnLCBuZXcgT25lTGluZVJhbmdlKDEsIDQsIDExKSkpLFxuXHRcdFx0YVJhd01hdGNoKCcvMicsXG5cdFx0XHRcdG5ldyBUZXh0U2VhcmNoTWF0Y2goJ3ByZXZpZXcgMicsIGxpbmVPbmVSYW5nZSkpXTtcblx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElTZWFyY2hTZXJ2aWNlLCBzZWFyY2hTZXJ2aWNlV2l0aFJlc3VsdHMocmVzdWx0cywgeyBsaW1pdEhpdDogZmFsc2UsIG1lc3NhZ2VzOiBbXSwgcmVzdWx0czogW10gfSkpO1xuXHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSU5vdGVib29rU2VhcmNoU2VydmljZSwgbm90ZWJvb2tTZWFyY2hTZXJ2aWNlV2l0aEluZm8oW10sIHVuZGVmaW5lZCkpO1xuXHRcdGNvbnN0IHRlc3RPYmplY3Q6IFNlYXJjaE1vZGVsSW1wbCA9IGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFNlYXJjaE1vZGVsSW1wbCk7XG5cdFx0c3RvcmUuYWRkKHRlc3RPYmplY3QpO1xuXHRcdGF3YWl0IHRlc3RPYmplY3Quc2VhcmNoKHsgY29udGVudFBhdHRlcm46IHsgcGF0dGVybjogJ3NvbWVzdHJpbmcnIH0sIHR5cGU6IFF1ZXJ5VHlwZS5UZXh0LCBmb2xkZXJRdWVyaWVzIH0pLmFzeW5jUmVzdWx0cztcblx0XHRhc3NlcnQub2soIXRlc3RPYmplY3Quc2VhcmNoUmVzdWx0LmlzRW1wdHkoKSk7XG5cblx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElTZWFyY2hTZXJ2aWNlLCBzZWFyY2hTZXJ2aWNlV2l0aFJlc3VsdHMoW10pKTtcblxuXHRcdHRlc3RPYmplY3Quc2VhcmNoKHsgY29udGVudFBhdHRlcm46IHsgcGF0dGVybjogJ3NvbWVzdHJpbmcnIH0sIHR5cGU6IFF1ZXJ5VHlwZS5UZXh0LCBmb2xkZXJRdWVyaWVzIH0pO1xuXHRcdGFzc2VydC5vayh0ZXN0T2JqZWN0LnNlYXJjaFJlc3VsdC5pc0VtcHR5KCkpO1xuXHR9KTtcblxuXHR0ZXN0KCdTZWFyY2ggTW9kZWw6IFByZXZpb3VzIHNlYXJjaCBpcyBjYW5jZWxsZWQgd2hlbiBuZXcgc2VhcmNoIGlzIGNhbGxlZCcsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCB0b2tlblNvdXJjZSA9IG5ldyBDYW5jZWxsYXRpb25Ub2tlblNvdXJjZSgpO1xuXHRcdHN0b3JlLmFkZCh0b2tlblNvdXJjZSk7XG5cdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJU2VhcmNoU2VydmljZSwgY2FuY2VsZWFibGVTZWFyY2hTZXJ2aWNlKHRva2VuU291cmNlKSk7XG5cdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJTm90ZWJvb2tTZWFyY2hTZXJ2aWNlLCBub3RlYm9va1NlYXJjaFNlcnZpY2VXaXRoSW5mbyhbXSwgdG9rZW5Tb3VyY2UpKTtcblx0XHRjb25zdCB0ZXN0T2JqZWN0OiBTZWFyY2hNb2RlbEltcGwgPSBpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShTZWFyY2hNb2RlbEltcGwpO1xuXHRcdHN0b3JlLmFkZCh0ZXN0T2JqZWN0KTtcblx0XHR0ZXN0T2JqZWN0LnNlYXJjaCh7IGNvbnRlbnRQYXR0ZXJuOiB7IHBhdHRlcm46ICdzb21lc3RyaW5nJyB9LCB0eXBlOiBRdWVyeVR5cGUuVGV4dCwgZm9sZGVyUXVlcmllcyB9KTtcblx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElTZWFyY2hTZXJ2aWNlLCBzZWFyY2hTZXJ2aWNlV2l0aFJlc3VsdHMoW10pKTtcblx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElOb3RlYm9va1NlYXJjaFNlcnZpY2UsIG5vdGVib29rU2VhcmNoU2VydmljZVdpdGhJbmZvKFtdLCB1bmRlZmluZWQpKTtcblx0XHR0ZXN0T2JqZWN0LnNlYXJjaCh7IGNvbnRlbnRQYXR0ZXJuOiB7IHBhdHRlcm46ICdzb21lc3RyaW5nJyB9LCB0eXBlOiBRdWVyeVR5cGUuVGV4dCwgZm9sZGVyUXVlcmllcyB9KTtcblxuXHRcdGFzc2VydC5vayh0b2tlblNvdXJjZS50b2tlbi5pc0NhbmNlbGxhdGlvblJlcXVlc3RlZCk7XG5cdH0pO1xuXG5cdHRlc3QoJ2dldFJlcGxhY2VTdHJpbmcgcmV0dXJucyBwcm9wZXIgcmVwbGFjZSBzdHJpbmcgZm9yIHJlZ0V4cHJlc3Npb25zJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHJlc3VsdHMgPSBbXG5cdFx0XHRhUmF3TWF0Y2goJy8xJyxcblx0XHRcdFx0bmV3IFRleHRTZWFyY2hNYXRjaCgncHJldmlldyAxJywgbmV3IE9uZUxpbmVSYW5nZSgxLCAxLCA0KSksXG5cdFx0XHRcdG5ldyBUZXh0U2VhcmNoTWF0Y2goJ3ByZXZpZXcgMScsIG5ldyBPbmVMaW5lUmFuZ2UoMSwgNCwgMTEpKSldO1xuXHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSVNlYXJjaFNlcnZpY2UsIHNlYXJjaFNlcnZpY2VXaXRoUmVzdWx0cyhyZXN1bHRzLCB7IGxpbWl0SGl0OiBmYWxzZSwgbWVzc2FnZXM6IFtdLCByZXN1bHRzIH0pKTtcblx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElOb3RlYm9va1NlYXJjaFNlcnZpY2UsIG5vdGVib29rU2VhcmNoU2VydmljZVdpdGhJbmZvKFtdLCB1bmRlZmluZWQpKTtcblxuXHRcdGNvbnN0IHRlc3RPYmplY3Q6IFNlYXJjaE1vZGVsSW1wbCA9IGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFNlYXJjaE1vZGVsSW1wbCk7XG5cdFx0c3RvcmUuYWRkKHRlc3RPYmplY3QpO1xuXHRcdGF3YWl0IHRlc3RPYmplY3Quc2VhcmNoKHsgY29udGVudFBhdHRlcm46IHsgcGF0dGVybjogJ3JlJyB9LCB0eXBlOiBRdWVyeVR5cGUuVGV4dCwgZm9sZGVyUXVlcmllcyB9KS5hc3luY1Jlc3VsdHM7XG5cdFx0dGVzdE9iamVjdC5yZXBsYWNlU3RyaW5nID0gJ2hlbGxvJztcblx0XHRsZXQgbWF0Y2ggPSB0ZXN0T2JqZWN0LnNlYXJjaFJlc3VsdC5tYXRjaGVzKClbMF0ubWF0Y2hlcygpWzBdO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCgnaGVsbG8nLCBtYXRjaC5yZXBsYWNlU3RyaW5nKTtcblxuXHRcdGF3YWl0IHRlc3RPYmplY3Quc2VhcmNoKHsgY29udGVudFBhdHRlcm46IHsgcGF0dGVybjogJ3JlJywgaXNSZWdFeHA6IHRydWUgfSwgdHlwZTogUXVlcnlUeXBlLlRleHQsIGZvbGRlclF1ZXJpZXMgfSkuYXN5bmNSZXN1bHRzO1xuXHRcdG1hdGNoID0gdGVzdE9iamVjdC5zZWFyY2hSZXN1bHQubWF0Y2hlcygpWzBdLm1hdGNoZXMoKVswXTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoJ2hlbGxvJywgbWF0Y2gucmVwbGFjZVN0cmluZyk7XG5cblx0XHRhd2FpdCB0ZXN0T2JqZWN0LnNlYXJjaCh7IGNvbnRlbnRQYXR0ZXJuOiB7IHBhdHRlcm46ICdyZSg/OnZpKScsIGlzUmVnRXhwOiB0cnVlIH0sIHR5cGU6IFF1ZXJ5VHlwZS5UZXh0LCBmb2xkZXJRdWVyaWVzIH0pLmFzeW5jUmVzdWx0cztcblx0XHRtYXRjaCA9IHRlc3RPYmplY3Quc2VhcmNoUmVzdWx0Lm1hdGNoZXMoKVswXS5tYXRjaGVzKClbMF07XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKCdoZWxsbycsIG1hdGNoLnJlcGxhY2VTdHJpbmcpO1xuXG5cdFx0YXdhaXQgdGVzdE9iamVjdC5zZWFyY2goeyBjb250ZW50UGF0dGVybjogeyBwYXR0ZXJuOiAncihlKSg/OnZpKScsIGlzUmVnRXhwOiB0cnVlIH0sIHR5cGU6IFF1ZXJ5VHlwZS5UZXh0LCBmb2xkZXJRdWVyaWVzIH0pLmFzeW5jUmVzdWx0cztcblx0XHRtYXRjaCA9IHRlc3RPYmplY3Quc2VhcmNoUmVzdWx0Lm1hdGNoZXMoKVswXS5tYXRjaGVzKClbMF07XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKCdoZWxsbycsIG1hdGNoLnJlcGxhY2VTdHJpbmcpO1xuXG5cdFx0YXdhaXQgdGVzdE9iamVjdC5zZWFyY2goeyBjb250ZW50UGF0dGVybjogeyBwYXR0ZXJuOiAncihlKSg/OnZpKScsIGlzUmVnRXhwOiB0cnVlIH0sIHR5cGU6IFF1ZXJ5VHlwZS5UZXh0LCBmb2xkZXJRdWVyaWVzIH0pLmFzeW5jUmVzdWx0cztcblx0XHR0ZXN0T2JqZWN0LnJlcGxhY2VTdHJpbmcgPSAnaGVsbG8kMSc7XG5cdFx0bWF0Y2ggPSB0ZXN0T2JqZWN0LnNlYXJjaFJlc3VsdC5tYXRjaGVzKClbMF0ubWF0Y2hlcygpWzBdO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCgnaGVsbG9lJywgbWF0Y2gucmVwbGFjZVN0cmluZyk7XG5cdH0pO1xuXG5cdGZ1bmN0aW9uIGFSYXdNYXRjaChyZXNvdXJjZTogc3RyaW5nLCAuLi5yZXN1bHRzOiBJVGV4dFNlYXJjaE1hdGNoW10pOiBJRmlsZU1hdGNoIHtcblx0XHRyZXR1cm4geyByZXNvdXJjZTogY3JlYXRlRmlsZVVyaUZyb21QYXRoRnJvbVJvb3QocmVzb3VyY2UpLCByZXN1bHRzIH07XG5cdH1cblxuXHRmdW5jdGlvbiBhUmF3TWF0Y2hXaXRoQ2VsbHMocmVzb3VyY2U6IHN0cmluZywgLi4uY2VsbHM6IElOb3RlYm9va0NlbGxNYXRjaFdpdGhNb2RlbFtdKSB7XG5cdFx0cmV0dXJuIHsgcmVzb3VyY2U6IGNyZWF0ZUZpbGVVcmlGcm9tUGF0aEZyb21Sb290KHJlc291cmNlKSwgY2VsbFJlc3VsdHM6IGNlbGxzIH07XG5cdH1cblxuXHRmdW5jdGlvbiBzdHViTW9kZWxTZXJ2aWNlKGluc3RhbnRpYXRpb25TZXJ2aWNlOiBUZXN0SW5zdGFudGlhdGlvblNlcnZpY2UpOiBJTW9kZWxTZXJ2aWNlIHtcblx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElUaGVtZVNlcnZpY2UsIG5ldyBUZXN0VGhlbWVTZXJ2aWNlKCkpO1xuXHRcdGNvbnN0IGNvbmZpZyA9IG5ldyBUZXN0Q29uZmlndXJhdGlvblNlcnZpY2UoKTtcblx0XHRjb25maWcuc2V0VXNlckNvbmZpZ3VyYXRpb24oJ3NlYXJjaCcsIHsgc2VhcmNoT25UeXBlOiB0cnVlIH0pO1xuXHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSUNvbmZpZ3VyYXRpb25TZXJ2aWNlLCBjb25maWcpO1xuXHRcdGNvbnN0IG1vZGVsU2VydmljZSA9IGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKE1vZGVsU2VydmljZSk7XG5cdFx0c3RvcmUuYWRkKG1vZGVsU2VydmljZSk7XG5cdFx0cmV0dXJuIG1vZGVsU2VydmljZTtcblx0fVxuXG5cdGZ1bmN0aW9uIHN0dWJOb3RlYm9va0VkaXRvclNlcnZpY2UoaW5zdGFudGlhdGlvblNlcnZpY2U6IFRlc3RJbnN0YW50aWF0aW9uU2VydmljZSk6IElOb3RlYm9va0VkaXRvclNlcnZpY2Uge1xuXHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSUVkaXRvckdyb3Vwc1NlcnZpY2UsIG5ldyBUZXN0RWRpdG9yR3JvdXBzU2VydmljZSgpKTtcblx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElDb250ZXh0S2V5U2VydmljZSwgbmV3IE1vY2tDb250ZXh0S2V5U2VydmljZSgpKTtcblx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElFZGl0b3JTZXJ2aWNlLCBzdG9yZS5hZGQobmV3IFRlc3RFZGl0b3JTZXJ2aWNlKCkpKTtcblx0XHRjb25zdCBub3RlYm9va0VkaXRvcldpZGdldFNlcnZpY2UgPSBpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShOb3RlYm9va0VkaXRvcldpZGdldFNlcnZpY2UpO1xuXHRcdHN0b3JlLmFkZChub3RlYm9va0VkaXRvcldpZGdldFNlcnZpY2UpO1xuXHRcdHJldHVybiBub3RlYm9va0VkaXRvcldpZGdldFNlcnZpY2U7XG5cdH1cbn0pO1xuIl0sCiAgIm1hcHBpbmdzIjogIkFBSUEsT0FBTyxZQUFZO0FBQ25CLFlBQVksV0FBVztBQUN2QixZQUFZLFlBQVk7QUFDeEIsU0FBUyxpQkFBaUIsZUFBZTtBQUN6QyxTQUE0QiwrQkFBK0I7QUFDM0QsU0FBUyxXQUFXO0FBQ3BCLFNBQVMsYUFBYTtBQUN0QixTQUFTLHFCQUFxQjtBQUM5QixTQUFTLG9CQUFvQjtBQUM3QixTQUFTLDZCQUE2QjtBQUN0QyxTQUFTLGdDQUFnQztBQUN6QyxTQUFTLGdDQUFnQztBQUN6QyxTQUFtSSxnQkFBOEMsY0FBYyxXQUFXLHVCQUF1QjtBQUNqTyxTQUFT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
