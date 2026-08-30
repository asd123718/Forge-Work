import assert from "assert";
import { mapArrayOrNot } from "../../../../base/common/arrays.js";
import { timeout } from "../../../../base/common/async.js";
import { CancellationTokenSource } from "../../../../base/common/cancellation.js";
import { isCancellationError } from "../../../../base/common/errors.js";
import { revive } from "../../../../base/common/marshalling.js";
import { joinPath } from "../../../../base/common/resources.js";
import { URI } from "../../../../base/common/uri.js";
import { mock } from "../../../../base/test/common/mock.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../base/test/common/utils.js";
import { NullLogService } from "../../../../platform/log/common/log.js";
import { MainContext } from "../../common/extHost.protocol.js";
import { Range } from "../../common/extHostTypes.js";
import { URITransformerService } from "../../common/extHostUriTransformerService.js";
import { NativeExtHostSearch } from "../../node/extHostSearch.js";
import { TestRPCProtocol } from "../common/testRPCProtocol.js";
import { QueryType, resultIsMatch } from "../../../services/search/common/search.js";
import { NativeTextSearchManager } from "../../../services/search/node/textSearchManager.js";
let rpcProtocol;
let extHostSearch;
let mockMainThreadSearch;
class MockMainThreadSearch {
  constructor() {
    this.results = [];
    this.keywords = [];
  }
  $registerFileSearchProvider(handle, scheme) {
    this.lastHandle = handle;
  }
  $registerTextSearchProvider(handle, scheme) {
    this.lastHandle = handle;
  }
  $registerAITextSearchProvider(handle, scheme) {
    this.lastHandle = handle;
  }
  $unregisterProvider(handle) {
  }
  $handleFileMatch(handle, session, data) {
    this.results.push(...data);
  }
  $handleTextMatch(handle, session, data) {
    this.results.push(...data);
  }
  $handleKeywordResult(handle, session, data) {
    this.keywords.push(data);
  }
  $handleTelemetry(eventName, data) {
  }
  dispose() {
  }
}
let mockPFS;
function extensionResultIsMatch(data) {
  return !!data.preview;
}
suite("ExtHostSearch", () => {
  const disposables = ensureNoDisposablesAreLeakedInTestSuite();
  async function registerTestTextSearchProvider(provider, scheme = "file") {
    disposables.add(extHostSearch.registerTextSearchProviderOld(scheme, provider));
    await rpcProtocol.sync();
  }
  async function registerTestFileSearchProvider(provider, scheme = "file") {
    disposables.add(extHostSearch.registerFileSearchProviderOld(scheme, provider));
    await rpcProtocol.sync();
  }
  async function runFileSearch(query, cancel = false) {
    let stats;
    try {
      const cancellation = new CancellationTokenSource();
      const p = extHostSearch.$provideFileSearchResults(mockMainThreadSearch.lastHandle, 0, query, cancellation.token);
      if (cancel) {
        await timeout(0);
        cancellation.cancel();
      }
      stats = await p;
    } catch (err) {
      if (!isCancellationError(err)) {
        await rpcProtocol.sync();
        throw err;
      }
    }
    await rpcProtocol.sync();
    return {
      results: mockMainThreadSearch.results.map((r) => URI.revive(r)),
      stats
    };
  }
  async function runTextSearch(query) {
    let stats;
    try {
      const cancellation = new CancellationTokenSource();
      const p = extHostSearch.$provideTextSearchResults(mockMainThreadSearch.lastHandle, 0, query, cancellation.token);
      stats = await p;
    } catch (err) {
      if (!isCancellationError(err)) {
        await rpcProtocol.sync();
        throw err;
      }
    }
    await rpcProtocol.sync();
    const results = revive(mockMainThreadSearch.results);
    return { results, stats };
  }
  setup(() => {
    rpcProtocol = new TestRPCProtocol();
    mockMainThreadSearch = new MockMainThreadSearch();
    const logService = new NullLogService();
    rpcProtocol.set(MainContext.MainThreadSearch, mockMainThreadSearch);
    mockPFS = {};
    extHostSearch = disposables.add(new class extends NativeExtHostSearch {
      constructor() {
        super(
          rpcProtocol,
          new class extends mock() {
            constructor() {
              super(...arguments);
              this.remote = { isRemote: false, authority: void 0, connectionData: null };
            }
          }(),
          new URITransformerService(null),
          new class extends mock() {
            async getConfigProvider() {
              return {
                onDidChangeConfiguration(_listener) {
                },
                getConfiguration() {
                  return {
                    get() {
                    },
                    has() {
                      return false;
                    },
                    inspect() {
                      return void 0;
                    },
                    async update() {
                    }
                  };
                }
              };
            }
          }(),
          logService
        );
        this._pfs = mockPFS;
      }
      createTextSearchManager(query, provider) {
        return new NativeTextSearchManager(query, provider, this._pfs);
      }
    }());
  });
  teardown(() => {
    return rpcProtocol.sync();
  });
  const rootFolderA = URI.file("/foo/bar1");
  const rootFolderB = URI.file("/foo/bar2");
  const fancyScheme = "fancy";
  const fancySchemeFolderA = URI.from({ scheme: fancyScheme, path: "/project/folder1" });
  suite("File:", () => {
    function getSimpleQuery(filePattern = "") {
      return {
        type: QueryType.File,
        filePattern,
        folderQueries: [
          { folder: rootFolderA }
        ]
      };
    }
    function compareURIs(actual, expected) {
      const sortAndStringify = (arr) => arr.sort().map((u) => u.toString());
      assert.deepStrictEqual(
        sortAndStringify(actual),
        sortAndStringify(expected)
      );
    }
    test("no results", async () => {
      await registerTestFileSearchProvider({
        provideFileSearchResults(query, options, token) {
          return Promise.resolve(null);
        }
      });
      const { results, stats } = await runFileSearch(getSimpleQuery());
      assert(!stats.limitHit);
      assert(!results.length);
    });
    test("simple results", async () => {
      const reportedResults = [
        joinPath(rootFolderA, "file1.ts"),
        joinPath(rootFolderA, "file2.ts"),
        joinPath(rootFolderA, "subfolder/file3.ts")
      ];
      await registerTestFileSearchProvider({
        provideFileSearchResults(query, options, token) {
          return Promise.resolve(reportedResults);
        }
      });
      const { results, stats } = await runFileSearch(getSimpleQuery());
      assert(!stats.limitHit);
      assert.strictEqual(results.length, 3);
      compareURIs(results, reportedResults);
    });
    test("Search canceled", async () => {
      let cancelRequested = false;
      await registerTestFileSearchProvider({
        provideFileSearchResults(query, options, token) {
          return new Promise((resolve, reject) => {
            function onCancel() {
              cancelRequested = true;
              resolve([joinPath(options.folder, "file1.ts")]);
            }
            if (token.isCancellationRequested) {
              onCancel();
            } else {
              disposables.add(token.onCancellationRequested(() => onCancel()));
            }
          });
        }
      });
      const { results } = await runFileSearch(getSimpleQuery(), true);
      assert(cancelRequested);
      assert(!results.length);
    });
    test("session cancellation should work", async () => {
      let numSessionCancelled = 0;
      const disposables2 = [];
      await registerTestFileSearchProvider({
        provideFileSearchResults(query, options, token) {
          disposables2.push(options.session?.onCancellationRequested(() => {
            numSessionCancelled++;
          }));
          return Promise.resolve([]);
        }
      });
      await runFileSearch({ ...getSimpleQuery(), cacheKey: "1" }, true);
      await runFileSearch({ ...getSimpleQuery(), cacheKey: "2" }, true);
      extHostSearch.$clearCache("1");
      assert.strictEqual(numSessionCancelled, 1);
      disposables2.forEach((d) => d?.dispose());
    });
    test("provider returns null", async () => {
      await registerTestFileSearchProvider({
        provideFileSearchResults(query, options, token) {
          return null;
        }
      });
      try {
        await runFileSearch(getSimpleQuery());
        assert(false, "Expected to fail");
      } catch {
      }
    });
    test("all provider calls get global include/excludes", async () => {
      await registerTestFileSearchProvider({
        provideFileSearchResults(query2, options, token) {
          assert(options.excludes.length === 2 && options.includes.length === 2, "Missing global include/excludes");
          return Promise.resolve(null);
        }
      });
      const query = {
        type: QueryType.File,
        filePattern: "",
        includePattern: {
          "foo": true,
          "bar": true
        },
        excludePattern: {
          "something": true,
          "else": true
        },
        folderQueries: [
          { folder: rootFolderA },
          { folder: rootFolderB }
        ]
      };
      await runFileSearch(query);
    });
    test("global/local include/excludes combined", async () => {
      await registerTestFileSearchProvider({
        provideFileSearchResults(query2, options, token) {
          if (options.folder.toString() === rootFolderA.toString()) {
            assert.deepStrictEqual(options.includes.sort(), ["*.ts", "foo"]);
            assert.deepStrictEqual(options.excludes.sort(), ["*.js", "bar"]);
          } else {
            assert.deepStrictEqual(options.includes.sort(), ["*.ts"]);
            assert.deepStrictEqual(options.excludes.sort(), ["*.js"]);
          }
          return Promise.resolve(null);
        }
      });
      const query = {
        type: QueryType.File,
        filePattern: "",
        includePattern: {
          "*.ts": true
        },
        excludePattern: {
          "*.js": true
        },
        folderQueries: [
          {
            folder: rootFolderA,
            includePattern: {
              "foo": true
            },
            excludePattern: [{
              pattern: {
                "bar": true
              }
            }]
          },
          { folder: rootFolderB }
        ]
      };
      await runFileSearch(query);
    });
    test("include/excludes resolved correctly", async () => {
      await registerTestFileSearchProvider({
        provideFileSearchResults(query2, options, token) {
          assert.deepStrictEqual(options.includes.sort(), ["*.jsx", "*.ts"]);
          assert.deepStrictEqual(options.excludes.sort(), []);
          return Promise.resolve(null);
        }
      });
      const query = {
        type: QueryType.File,
        filePattern: "",
        includePattern: {
          "*.ts": true,
          "*.jsx": false
        },
        excludePattern: {
          "*.js": true,
          "*.tsx": false
        },
        folderQueries: [
          {
            folder: rootFolderA,
            includePattern: {
              "*.jsx": true
            },
            excludePattern: [{
              pattern: {
                "*.js": false
              }
            }]
          }
        ]
      };
      await runFileSearch(query);
    });
    test("basic sibling exclude clause", async () => {
      const reportedResults = [
        "file1.ts",
        "file1.js"
      ];
      await registerTestFileSearchProvider({
        provideFileSearchResults(query2, options, token) {
          return Promise.resolve(reportedResults.map((relativePath) => joinPath(options.folder, relativePath)));
        }
      });
      const query = {
        type: QueryType.File,
        filePattern: "",
        excludePattern: {
          "*.js": {
            when: "$(basename).ts"
          }
        },
        folderQueries: [
          { folder: rootFolderA }
        ]
      };
      const { results } = await runFileSearch(query);
      compareURIs(
        results,
        [
          joinPath(rootFolderA, "file1.ts")
        ]
      );
    });
    test("include, sibling exclude, and subfolder", async () => {
      const reportedResults = [
        "foo/file1.ts",
        "foo/file1.js"
      ];
      await registerTestFileSearchProvider({
        provideFileSearchResults(query2, options, token) {
          return Promise.resolve(reportedResults.map((relativePath) => joinPath(options.folder, relativePath)));
        }
      });
      const query = {
        type: QueryType.File,
        filePattern: "",
        includePattern: { "**/*.ts": true },
        excludePattern: {
          "*.js": {
            when: "$(basename).ts"
          }
        },
        folderQueries: [
          { folder: rootFolderA }
        ]
      };
      const { results } = await runFileSearch(query);
      compareURIs(
        results,
        [
          joinPath(rootFolderA, "foo/file1.ts")
        ]
      );
    });
    test("multiroot sibling exclude clause", async () => {
      await registerTestFileSearchProvider({
        provideFileSearchResults(query2, options, token) {
          let reportedResults;
          if (options.folder.fsPath === rootFolderA.fsPath) {
            reportedResults = [
              "folder/fileA.scss",
              "folder/fileA.css",
              "folder/file2.css"
            ].map((relativePath) => joinPath(rootFolderA, relativePath));
          } else {
            reportedResults = [
              "fileB.ts",
              "fileB.js",
              "file3.js"
            ].map((relativePath) => joinPath(rootFolderB, relativePath));
          }
          return Promise.resolve(reportedResults);
        }
      });
      const query = {
        type: QueryType.File,
        filePattern: "",
        excludePattern: {
          "*.js": {
            when: "$(basename).ts"
          },
          "*.css": true
        },
        folderQueries: [
          {
            folder: rootFolderA,
            excludePattern: [{
              pattern: {
                "folder/*.css": {
                  when: "$(basename).scss"
                }
              }
            }]
          },
          {
            folder: rootFolderB,
            excludePattern: [{
              pattern: {
                "*.js": false
              }
            }]
          }
        ]
      };
      const { results } = await runFileSearch(query);
      compareURIs(
        results,
        [
          joinPath(rootFolderA, "folder/fileA.scss"),
          joinPath(rootFolderA, "folder/file2.css"),
          joinPath(rootFolderB, "fileB.ts"),
          joinPath(rootFolderB, "fileB.js"),
          joinPath(rootFolderB, "file3.js")
        ]
      );
    });
    test("max results = 1", async () => {
      const reportedResults = [
        joinPath(rootFolderA, "file1.ts"),
        joinPath(rootFolderA, "file2.ts"),
        joinPath(rootFolderA, "file3.ts")
      ];
      let wasCanceled = false;
      await registerTestFileSearchProvider({
        provideFileSearchResults(query2, options, token) {
          disposables.add(token.onCancellationRequested(() => wasCanceled = true));
          return Promise.resolve(reportedResults);
        }
      });
      const query = {
        type: QueryType.File,
        filePattern: "",
        maxResults: 1,
        folderQueries: [
          {
            folder: rootFolderA
          }
        ]
      };
      const { results, stats } = await runFileSearch(query);
      assert(stats.limitHit, "Expected to return limitHit");
      assert.strictEqual(results.length, 1);
      compareURIs(results, reportedResults.slice(0, 1));
      assert(wasCanceled, "Expected to be canceled when hitting limit");
    });
    test("max results = 2", async () => {
      const reportedResults = [
        joinPath(rootFolderA, "file1.ts"),
        joinPath(rootFolderA, "file2.ts"),
        joinPath(rootFolderA, "file3.ts")
      ];
      let wasCanceled = false;
      await registerTestFileSearchProvider({
        provideFileSearchResults(query2, options, token) {
          disposables.add(token.onCancellationRequested(() => wasCanceled = true));
          return Promise.resolve(reportedResults);
        }
      });
      const query = {
        type: QueryType.File,
        filePattern: "",
        maxResults: 2,
        folderQueries: [
          {
            folder: rootFolderA
          }
        ]
      };
      const { results, stats } = await runFileSearch(query);
      assert(stats.limitHit, "Expected to return limitHit");
      assert.strictEqual(results.length, 2);
      compareURIs(results, reportedResults.slice(0, 2));
      assert(wasCanceled, "Expected to be canceled when hitting limit");
    });
    test("provider returns maxResults exactly", async () => {
      const reportedResults = [
        joinPath(rootFolderA, "file1.ts"),
        joinPath(rootFolderA, "file2.ts")
      ];
      let wasCanceled = false;
      await registerTestFileSearchProvider({
        provideFileSearchResults(query2, options, token) {
          disposables.add(token.onCancellationRequested(() => wasCanceled = true));
          return Promise.resolve(reportedResults);
        }
      });
      const query = {
        type: QueryType.File,
        filePattern: "",
        maxResults: 2,
        folderQueries: [
          {
            folder: rootFolderA
          }
        ]
      };
      const { results, stats } = await runFileSearch(query);
      assert(!stats.limitHit, "Expected not to return limitHit");
      assert.strictEqual(results.length, 2);
      compareURIs(results, reportedResults);
      assert(!wasCanceled, "Expected not to be canceled when just reaching limit");
    });
    test("multiroot max results", async () => {
      let cancels = 0;
      await registerTestFileSearchProvider({
        async provideFileSearchResults(query2, options, token) {
          disposables.add(token.onCancellationRequested(() => cancels++));
          await new Promise((r) => process.nextTick(r));
          return [
            "file1.ts",
            "file2.ts",
            "file3.ts"
          ].map((relativePath) => joinPath(options.folder, relativePath));
        }
      });
      const query = {
        type: QueryType.File,
        filePattern: "",
        maxResults: 2,
        folderQueries: [
          {
            folder: rootFolderA
          },
          {
            folder: rootFolderB
          }
        ]
      };
      const { results } = await runFileSearch(query);
      assert.strictEqual(results.length, 2);
      assert.strictEqual(cancels, 2, "Expected all invocations to be canceled when hitting limit");
    });
    test("works with non-file schemes", async () => {
      const reportedResults = [
        joinPath(fancySchemeFolderA, "file1.ts"),
        joinPath(fancySchemeFolderA, "file2.ts"),
        joinPath(fancySchemeFolderA, "subfolder/file3.ts")
      ];
      await registerTestFileSearchProvider({
        provideFileSearchResults(query2, options, token) {
          return Promise.resolve(reportedResults);
        }
      }, fancyScheme);
      const query = {
        type: QueryType.File,
        filePattern: "",
        folderQueries: [
          {
            folder: fancySchemeFolderA
          }
        ]
      };
      const { results } = await runFileSearch(query);
      compareURIs(results, reportedResults);
    });
    test("if onlyFileScheme is set, do not call custom schemes", async () => {
      let fancySchemeCalled = false;
      await registerTestFileSearchProvider({
        provideFileSearchResults(query2, options, token) {
          fancySchemeCalled = true;
          return Promise.resolve([]);
        }
      }, fancyScheme);
      const query = {
        type: QueryType.File,
        filePattern: "",
        folderQueries: []
      };
      await runFileSearch(query);
      assert(!fancySchemeCalled);
    });
  });
  suite("Text:", () => {
    function makePreview(text) {
      return {
        matches: [new Range(0, 0, 0, text.length)],
        text
      };
    }
    function makeTextResult(baseFolder, relativePath) {
      return {
        preview: makePreview("foo"),
        ranges: [new Range(0, 0, 0, 3)],
        uri: joinPath(baseFolder, relativePath)
      };
    }
    function getSimpleQuery(queryText) {
      return {
        type: QueryType.Text,
        contentPattern: getPattern(queryText),
        folderQueries: [
          { folder: rootFolderA }
        ]
      };
    }
    function getPattern(queryText) {
      return {
        pattern: queryText
      };
    }
    function assertResults(actual, expected) {
      const actualTextSearchResults = [];
      for (const fileMatch of actual) {
        for (const lineResult of fileMatch.results) {
          if (resultIsMatch(lineResult)) {
            actualTextSearchResults.push({
              preview: {
                text: lineResult.previewText,
                matches: mapArrayOrNot(
                  lineResult.rangeLocations.map((r) => r.preview),
                  (m) => new Range(m.startLineNumber, m.startColumn, m.endLineNumber, m.endColumn)
                )
              },
              ranges: mapArrayOrNot(
                lineResult.rangeLocations.map((r) => r.source),
                (r) => new Range(r.startLineNumber, r.startColumn, r.endLineNumber, r.endColumn)
              ),
              uri: fileMatch.resource
            });
          } else {
            actualTextSearchResults.push({
              text: lineResult.text,
              lineNumber: lineResult.lineNumber,
              uri: fileMatch.resource
            });
          }
        }
      }
      const rangeToString = (r) => `(${r.start.line}, ${r.start.character}), (${r.end.line}, ${r.end.character})`;
      const makeComparable = (results) => results.sort((a, b) => {
        const compareKeyA = a.uri.toString() + ": " + (extensionResultIsMatch(a) ? a.preview.text : a.text);
        const compareKeyB = b.uri.toString() + ": " + (extensionResultIsMatch(b) ? b.preview.text : b.text);
        return compareKeyB.localeCompare(compareKeyA);
      }).map((r) => extensionResultIsMatch(r) ? {
        uri: r.uri.toString(),
        range: mapArrayOrNot(r.ranges, rangeToString),
        preview: {
          text: r.preview.text,
          match: null
          // Don't care about this right now
        }
      } : {
        uri: r.uri.toString(),
        text: r.text,
        lineNumber: r.lineNumber
      });
      return assert.deepStrictEqual(
        makeComparable(actualTextSearchResults),
        makeComparable(expected)
      );
    }
    test("no results", async () => {
      await registerTestTextSearchProvider({
        provideTextSearchResults(query, options, progress, token) {
          return Promise.resolve(null);
        }
      });
      const { results, stats } = await runTextSearch(getSimpleQuery("foo"));
      assert(!stats.limitHit);
      assert(!results.length);
    });
    test("basic results", async () => {
      const providedResults = [
        makeTextResult(rootFolderA, "file1.ts"),
        makeTextResult(rootFolderA, "file2.ts")
      ];
      await registerTestTextSearchProvider({
        provideTextSearchResults(query, options, progress, token) {
          providedResults.forEach((r) => progress.report(r));
          return Promise.resolve(null);
        }
      });
      const { results, stats } = await runTextSearch(getSimpleQuery("foo"));
      assert(!stats.limitHit);
      assertResults(results, providedResults);
    });
    test("all provider calls get global include/excludes", async () => {
      await registerTestTextSearchProvider({
        provideTextSearchResults(query2, options, progress, token) {
          assert.strictEqual(options.includes.length, 1);
          assert.strictEqual(options.excludes.length, 1);
          return Promise.resolve(null);
        }
      });
      const query = {
        type: QueryType.Text,
        contentPattern: getPattern("foo"),
        includePattern: {
          "*.ts": true
        },
        excludePattern: {
          "*.js": true
        },
        folderQueries: [
          { folder: rootFolderA },
          { folder: rootFolderB }
        ]
      };
      await runTextSearch(query);
    });
    test("global/local include/excludes combined", async () => {
      await registerTestTextSearchProvider({
        provideTextSearchResults(query2, options, progress, token) {
          if (options.folder.toString() === rootFolderA.toString()) {
            assert.deepStrictEqual(options.includes.sort(), ["*.ts", "foo"]);
            assert.deepStrictEqual(options.excludes.sort(), ["*.js", "bar"]);
          } else {
            assert.deepStrictEqual(options.includes.sort(), ["*.ts"]);
            assert.deepStrictEqual(options.excludes.sort(), ["*.js"]);
          }
          return Promise.resolve(null);
        }
      });
      const query = {
        type: QueryType.Text,
        contentPattern: getPattern("foo"),
        includePattern: {
          "*.ts": true
        },
        excludePattern: {
          "*.js": true
        },
        folderQueries: [
          {
            folder: rootFolderA,
            includePattern: {
              "foo": true
            },
            excludePattern: [{
              pattern: {
                "bar": true
              }
            }]
          },
          { folder: rootFolderB }
        ]
      };
      await runTextSearch(query);
    });
    test("include/excludes resolved correctly", async () => {
      await registerTestTextSearchProvider({
        provideTextSearchResults(query2, options, progress, token) {
          assert.deepStrictEqual(options.includes.sort(), ["*.jsx", "*.ts"]);
          assert.deepStrictEqual(options.excludes.sort(), []);
          return Promise.resolve(null);
        }
      });
      const query = {
        type: QueryType.Text,
        contentPattern: getPattern("foo"),
        includePattern: {
          "*.ts": true,
          "*.jsx": false
        },
        excludePattern: {
          "*.js": true,
          "*.tsx": false
        },
        folderQueries: [
          {
            folder: rootFolderA,
            includePattern: {
              "*.jsx": true
            },
            excludePattern: [{
              pattern: {
                "*.js": false
              }
            }]
          }
        ]
      };
      await runTextSearch(query);
    });
    test("provider fail", async () => {
      await registerTestTextSearchProvider({
        provideTextSearchResults(query, options, progress, token) {
          throw new Error("Provider fail");
        }
      });
      try {
        await runTextSearch(getSimpleQuery("foo"));
        assert(false, "Expected to fail");
      } catch {
      }
    });
    test("basic sibling clause", async () => {
      mockPFS.Promises = {
        readdir: (_path) => {
          if (_path === rootFolderA.fsPath) {
            return Promise.resolve([
              "file1.js",
              "file1.ts"
            ]);
          } else {
            return Promise.reject(new Error("Wrong path"));
          }
        }
      };
      const providedResults = [
        makeTextResult(rootFolderA, "file1.js"),
        makeTextResult(rootFolderA, "file1.ts")
      ];
      await registerTestTextSearchProvider({
        provideTextSearchResults(query2, options, progress, token) {
          providedResults.forEach((r) => progress.report(r));
          return Promise.resolve(null);
        }
      });
      const query = {
        type: QueryType.Text,
        contentPattern: getPattern("foo"),
        excludePattern: {
          "*.js": {
            when: "$(basename).ts"
          }
        },
        folderQueries: [
          { folder: rootFolderA }
        ]
      };
      const { results } = await runTextSearch(query);
      assertResults(results, providedResults.slice(1));
    });
    test("multiroot sibling clause", async () => {
      mockPFS.Promises = {
        readdir: (_path) => {
          if (_path === joinPath(rootFolderA, "folder").fsPath) {
            return Promise.resolve([
              "fileA.scss",
              "fileA.css",
              "file2.css"
            ]);
          } else if (_path === rootFolderB.fsPath) {
            return Promise.resolve([
              "fileB.ts",
              "fileB.js",
              "file3.js"
            ]);
          } else {
            return Promise.reject(new Error("Wrong path"));
          }
        }
      };
      await registerTestTextSearchProvider({
        provideTextSearchResults(query2, options, progress, token) {
          let reportedResults;
          if (options.folder.fsPath === rootFolderA.fsPath) {
            reportedResults = [
              makeTextResult(rootFolderA, "folder/fileA.scss"),
              makeTextResult(rootFolderA, "folder/fileA.css"),
              makeTextResult(rootFolderA, "folder/file2.css")
            ];
          } else {
            reportedResults = [
              makeTextResult(rootFolderB, "fileB.ts"),
              makeTextResult(rootFolderB, "fileB.js"),
              makeTextResult(rootFolderB, "file3.js")
            ];
          }
          reportedResults.forEach((r) => progress.report(r));
          return Promise.resolve(null);
        }
      });
      const query = {
        type: QueryType.Text,
        contentPattern: getPattern("foo"),
        excludePattern: {
          "*.js": {
            when: "$(basename).ts"
          },
          "*.css": true
        },
        folderQueries: [
          {
            folder: rootFolderA,
            excludePattern: [{
              pattern: {
                "folder/*.css": {
                  when: "$(basename).scss"
                }
              }
            }]
          },
          {
            folder: rootFolderB,
            excludePattern: [{
              pattern: {
                "*.js": false
              }
            }]
          }
        ]
      };
      const { results } = await runTextSearch(query);
      assertResults(results, [
        makeTextResult(rootFolderA, "folder/fileA.scss"),
        makeTextResult(rootFolderA, "folder/file2.css"),
        makeTextResult(rootFolderB, "fileB.ts"),
        makeTextResult(rootFolderB, "fileB.js"),
        makeTextResult(rootFolderB, "file3.js")
      ]);
    });
    test("include pattern applied", async () => {
      const providedResults = [
        makeTextResult(rootFolderA, "file1.js"),
        makeTextResult(rootFolderA, "file1.ts")
      ];
      await registerTestTextSearchProvider({
        provideTextSearchResults(query2, options, progress, token) {
          providedResults.forEach((r) => progress.report(r));
          return Promise.resolve(null);
        }
      });
      const query = {
        type: QueryType.Text,
        contentPattern: getPattern("foo"),
        includePattern: {
          "*.ts": true
        },
        folderQueries: [
          { folder: rootFolderA }
        ]
      };
      const { results } = await runTextSearch(query);
      assertResults(results, providedResults.slice(1));
    });
    test("max results = 1", async () => {
      const providedResults = [
        makeTextResult(rootFolderA, "file1.ts"),
        makeTextResult(rootFolderA, "file2.ts")
      ];
      let wasCanceled = false;
      await registerTestTextSearchProvider({
        provideTextSearchResults(query2, options, progress, token) {
          disposables.add(token.onCancellationRequested(() => wasCanceled = true));
          providedResults.forEach((r) => progress.report(r));
          return Promise.resolve(null);
        }
      });
      const query = {
        type: QueryType.Text,
        contentPattern: getPattern("foo"),
        maxResults: 1,
        folderQueries: [
          { folder: rootFolderA }
        ]
      };
      const { results, stats } = await runTextSearch(query);
      assert(stats.limitHit, "Expected to return limitHit");
      assertResults(results, providedResults.slice(0, 1));
      assert(wasCanceled, "Expected to be canceled");
    });
    test("max results = 2", async () => {
      const providedResults = [
        makeTextResult(rootFolderA, "file1.ts"),
        makeTextResult(rootFolderA, "file2.ts"),
        makeTextResult(rootFolderA, "file3.ts")
      ];
      let wasCanceled = false;
      await registerTestTextSearchProvider({
        provideTextSearchResults(query2, options, progress, token) {
          disposables.add(token.onCancellationRequested(() => wasCanceled = true));
          providedResults.forEach((r) => progress.report(r));
          return Promise.resolve(null);
        }
      });
      const query = {
        type: QueryType.Text,
        contentPattern: getPattern("foo"),
        maxResults: 2,
        folderQueries: [
          { folder: rootFolderA }
        ]
      };
      const { results, stats } = await runTextSearch(query);
      assert(stats.limitHit, "Expected to return limitHit");
      assertResults(results, providedResults.slice(0, 2));
      assert(wasCanceled, "Expected to be canceled");
    });
    test("provider returns maxResults exactly", async () => {
      const providedResults = [
        makeTextResult(rootFolderA, "file1.ts"),
        makeTextResult(rootFolderA, "file2.ts")
      ];
      let wasCanceled = false;
      await registerTestTextSearchProvider({
        provideTextSearchResults(query2, options, progress, token) {
          disposables.add(token.onCancellationRequested(() => wasCanceled = true));
          providedResults.forEach((r) => progress.report(r));
          return Promise.resolve(null);
        }
      });
      const query = {
        type: QueryType.Text,
        contentPattern: getPattern("foo"),
        maxResults: 2,
        folderQueries: [
          { folder: rootFolderA }
        ]
      };
      const { results, stats } = await runTextSearch(query);
      assert(!stats.limitHit, "Expected not to return limitHit");
      assertResults(results, providedResults);
      assert(!wasCanceled, "Expected not to be canceled");
    });
    test("provider returns early with limitHit", async () => {
      const providedResults = [
        makeTextResult(rootFolderA, "file1.ts"),
        makeTextResult(rootFolderA, "file2.ts"),
        makeTextResult(rootFolderA, "file3.ts")
      ];
      await registerTestTextSearchProvider({
        provideTextSearchResults(query2, options, progress, token) {
          providedResults.forEach((r) => progress.report(r));
          return Promise.resolve({ limitHit: true });
        }
      });
      const query = {
        type: QueryType.Text,
        contentPattern: getPattern("foo"),
        maxResults: 1e3,
        folderQueries: [
          { folder: rootFolderA }
        ]
      };
      const { results, stats } = await runTextSearch(query);
      assert(stats.limitHit, "Expected to return limitHit");
      assertResults(results, providedResults);
    });
    test("multiroot max results", async () => {
      let cancels = 0;
      await registerTestTextSearchProvider({
        async provideTextSearchResults(query2, options, progress, token) {
          disposables.add(token.onCancellationRequested(() => cancels++));
          await new Promise((r) => process.nextTick(r));
          [
            "file1.ts",
            "file2.ts",
            "file3.ts"
          ].forEach((f) => progress.report(makeTextResult(options.folder, f)));
          return null;
        }
      });
      const query = {
        type: QueryType.Text,
        contentPattern: getPattern("foo"),
        maxResults: 2,
        folderQueries: [
          { folder: rootFolderA },
          { folder: rootFolderB }
        ]
      };
      const { results } = await runTextSearch(query);
      assert.strictEqual(results.length, 2);
      assert.strictEqual(cancels, 2);
    });
    test("works with non-file schemes", async () => {
      const providedResults = [
        makeTextResult(fancySchemeFolderA, "file1.ts"),
        makeTextResult(fancySchemeFolderA, "file2.ts"),
        makeTextResult(fancySchemeFolderA, "file3.ts")
      ];
      await registerTestTextSearchProvider({
        provideTextSearchResults(query2, options, progress, token) {
          providedResults.forEach((r) => progress.report(r));
          return Promise.resolve(null);
        }
      }, fancyScheme);
      const query = {
        type: QueryType.Text,
        contentPattern: getPattern("foo"),
        folderQueries: [
          { folder: fancySchemeFolderA }
        ]
      };
      const { results } = await runTextSearch(query);
      assertResults(results, providedResults);
    });
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGFwaVxcdGVzdFxcbm9kZVxcZXh0SG9zdFNlYXJjaC50ZXN0LnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IGFzc2VydCBmcm9tICdhc3NlcnQnO1xuaW1wb3J0IHsgbWFwQXJyYXlPck5vdCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2FycmF5cy5qcyc7XG5pbXBvcnQgeyB0aW1lb3V0IH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vYXN5bmMuanMnO1xuaW1wb3J0IHsgQ2FuY2VsbGF0aW9uVG9rZW5Tb3VyY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9jYW5jZWxsYXRpb24uanMnO1xuaW1wb3J0IHsgaXNDYW5jZWxsYXRpb25FcnJvciB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2Vycm9ycy5qcyc7XG5pbXBvcnQgeyByZXZpdmUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9tYXJzaGFsbGluZy5qcyc7XG5pbXBvcnQgeyBqb2luUGF0aCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3Jlc291cmNlcy5qcyc7XG5pbXBvcnQgeyBVUkksIFVyaUNvbXBvbmVudHMgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi91cmkuanMnO1xuaW1wb3J0ICogYXMgcGZzIGZyb20gJy4uLy4uLy4uLy4uL2Jhc2Uvbm9kZS9wZnMuanMnO1xuaW1wb3J0IHsgbW9jayB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvdGVzdC9jb21tb24vbW9jay5qcyc7XG5pbXBvcnQgeyBlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL3Rlc3QvY29tbW9uL3V0aWxzLmpzJztcbmltcG9ydCB7IE51bGxMb2dTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vbG9nL2NvbW1vbi9sb2cuanMnO1xuaW1wb3J0IHsgTWFpbkNvbnRleHQsIE1haW5UaHJlYWRTZWFyY2hTaGFwZSB9IGZyb20gJy4uLy4uL2NvbW1vbi9leHRIb3N0LnByb3RvY29sLmpzJztcbmltcG9ydCB7IEV4dEhvc3RDb25maWdQcm92aWRlciwgSUV4dEhvc3RDb25maWd1cmF0aW9uIH0gZnJvbSAnLi4vLi4vY29tbW9uL2V4dEhvc3RDb25maWd1cmF0aW9uLmpzJztcbmltcG9ydCB7IElFeHRIb3N0SW5pdERhdGFTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vY29tbW9uL2V4dEhvc3RJbml0RGF0YVNlcnZpY2UuanMnO1xuaW1wb3J0IHsgUmFuZ2UgfSBmcm9tICcuLi8uLi9jb21tb24vZXh0SG9zdFR5cGVzLmpzJztcbmltcG9ydCB7IFVSSVRyYW5zZm9ybWVyU2VydmljZSB9IGZyb20gJy4uLy4uL2NvbW1vbi9leHRIb3N0VXJpVHJhbnNmb3JtZXJTZXJ2aWNlLmpzJztcbmltcG9ydCB7IE5hdGl2ZUV4dEhvc3RTZWFyY2ggfSBmcm9tICcuLi8uLi9ub2RlL2V4dEhvc3RTZWFyY2guanMnO1xuaW1wb3J0IHsgVGVzdFJQQ1Byb3RvY29sIH0gZnJvbSAnLi4vY29tbW9uL3Rlc3RSUENQcm90b2NvbC5qcyc7XG5pbXBvcnQgeyBJRmlsZU1hdGNoLCBJRmlsZVF1ZXJ5LCBJUGF0dGVybkluZm8sIElSYXdGaWxlTWF0Y2gyLCBJU2VhcmNoQ29tcGxldGVTdGF0cywgSVNlYXJjaFF1ZXJ5LCBJVGV4dFF1ZXJ5LCBRdWVyeVR5cGUsIHJlc3VsdElzTWF0Y2ggfSBmcm9tICcuLi8uLi8uLi9zZXJ2aWNlcy9zZWFyY2gvY29tbW9uL3NlYXJjaC5qcyc7XG5pbXBvcnQgeyBUZXh0U2VhcmNoTWFuYWdlciB9IGZyb20gJy4uLy4uLy4uL3NlcnZpY2VzL3NlYXJjaC9jb21tb24vdGV4dFNlYXJjaE1hbmFnZXIuanMnO1xuaW1wb3J0IHsgTmF0aXZlVGV4dFNlYXJjaE1hbmFnZXIgfSBmcm9tICcuLi8uLi8uLi9zZXJ2aWNlcy9zZWFyY2gvbm9kZS90ZXh0U2VhcmNoTWFuYWdlci5qcyc7XG5pbXBvcnQgdHlwZSAqIGFzIHZzY29kZSBmcm9tICd2c2NvZGUnO1xuaW1wb3J0IHsgQUlTZWFyY2hLZXl3b3JkIH0gZnJvbSAnLi4vLi4vLi4vc2VydmljZXMvc2VhcmNoL2NvbW1vbi9zZWFyY2hFeHRUeXBlcy5qcyc7XG5cbmxldCBycGNQcm90b2NvbDogVGVzdFJQQ1Byb3RvY29sO1xubGV0IGV4dEhvc3RTZWFyY2g6IE5hdGl2ZUV4dEhvc3RTZWFyY2g7XG5cbmxldCBtb2NrTWFpblRocmVhZFNlYXJjaDogTW9ja01haW5UaHJlYWRTZWFyY2g7XG5jbGFzcyBNb2NrTWFpblRocmVhZFNlYXJjaCBpbXBsZW1lbnRzIE1haW5UaHJlYWRTZWFyY2hTaGFwZSB7XG5cdGxhc3RIYW5kbGUhOiBudW1iZXI7XG5cblx0cmVzdWx0czogQXJyYXk8VXJpQ29tcG9uZW50cyB8IElSYXdGaWxlTWF0Y2gyPiA9IFtdO1xuXG5cdGtleXdvcmRzOiBBcnJheTxBSVNlYXJjaEtleXdvcmQ+ID0gW107XG5cblx0JHJlZ2lzdGVyRmlsZVNlYXJjaFByb3ZpZGVyKGhhbmRsZTogbnVtYmVyLCBzY2hlbWU6IHN0cmluZyk6IHZvaWQge1xuXHRcdHRoaXMubGFzdEhhbmRsZSA9IGhhbmRsZTtcblx0fVxuXG5cdCRyZWdpc3RlclRleHRTZWFyY2hQcm92aWRlcihoYW5kbGU6IG51bWJlciwgc2NoZW1lOiBzdHJpbmcpOiB2b2lkIHtcblx0XHR0aGlzLmxhc3RIYW5kbGUgPSBoYW5kbGU7XG5cdH1cblxuXHQkcmVnaXN0ZXJBSVRleHRTZWFyY2hQcm92aWRlcihoYW5kbGU6IG51bWJlciwgc2NoZW1lOiBzdHJpbmcpOiB2b2lkIHtcblx0XHR0aGlzLmxhc3RIYW5kbGUgPSBoYW5kbGU7XG5cdH1cblxuXHQkdW5yZWdpc3RlclByb3ZpZGVyKGhhbmRsZTogbnVtYmVyKTogdm9pZCB7XG5cdH1cblxuXHQkaGFuZGxlRmlsZU1hdGNoKGhhbmRsZTogbnVtYmVyLCBzZXNzaW9uOiBudW1iZXIsIGRhdGE6IFVyaUNvbXBvbmVudHNbXSk6IHZvaWQge1xuXHRcdHRoaXMucmVzdWx0cy5wdXNoKC4uLmRhdGEpO1xuXHR9XG5cblx0JGhhbmRsZVRleHRNYXRjaChoYW5kbGU6IG51bWJlciwgc2Vzc2lvbjogbnVtYmVyLCBkYXRhOiBJUmF3RmlsZU1hdGNoMltdKTogdm9pZCB7XG5cdFx0dGhpcy5yZXN1bHRzLnB1c2goLi4uZGF0YSk7XG5cdH1cblxuXHQkaGFuZGxlS2V5d29yZFJlc3VsdChoYW5kbGU6IG51bWJlciwgc2Vzc2lvbjogbnVtYmVyLCBkYXRhOiBBSVNlYXJjaEtleXdvcmQpOiB2b2lkIHtcblx0XHR0aGlzLmtleXdvcmRzLnB1c2goZGF0YSk7XG5cdH1cblxuXHQkaGFuZGxlVGVsZW1ldHJ5KGV2ZW50TmFtZTogc3RyaW5nLCBkYXRhOiBhbnkpOiB2b2lkIHtcblx0fVxuXG5cdGRpc3Bvc2UoKSB7XG5cdH1cbn1cblxubGV0IG1vY2tQRlM6IFBhcnRpYWw8dHlwZW9mIHBmcz47XG5cbmZ1bmN0aW9uIGV4dGVuc2lvblJlc3VsdElzTWF0Y2goZGF0YTogdnNjb2RlLlRleHRTZWFyY2hSZXN1bHQpOiBkYXRhIGlzIHZzY29kZS5UZXh0U2VhcmNoTWF0Y2gge1xuXHRyZXR1cm4gISEoPHZzY29kZS5UZXh0U2VhcmNoTWF0Y2g+ZGF0YSkucHJldmlldztcbn1cblxuc3VpdGUoJ0V4dEhvc3RTZWFyY2gnLCAoKSA9PiB7XG5cdGNvbnN0IGRpc3Bvc2FibGVzID0gZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlKCk7XG5cblx0YXN5bmMgZnVuY3Rpb24gcmVnaXN0ZXJUZXN0VGV4dFNlYXJjaFByb3ZpZGVyKHByb3ZpZGVyOiB2c2NvZGUuVGV4dFNlYXJjaFByb3ZpZGVyLCBzY2hlbWUgPSAnZmlsZScpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRkaXNwb3NhYmxlcy5hZGQoZXh0SG9zdFNlYXJjaC5yZWdpc3RlclRleHRTZWFyY2hQcm92aWRlck9sZChzY2hlbWUsIHByb3ZpZGVyKSk7XG5cdFx0YXdhaXQgcnBjUHJvdG9jb2wuc3luYygpO1xuXHR9XG5cblx0YXN5bmMgZnVuY3Rpb24gcmVnaXN0ZXJUZXN0RmlsZVNlYXJjaFByb3ZpZGVyKHByb3ZpZGVyOiB2c2NvZGUuRmlsZVNlYXJjaFByb3ZpZGVyLCBzY2hlbWUgPSAnZmlsZScpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRkaXNwb3NhYmxlcy5hZGQoZXh0SG9zdFNlYXJjaC5yZWdpc3RlckZpbGVTZWFyY2hQcm92aWRlck9sZChzY2hlbWUsIHByb3ZpZGVyKSk7XG5cdFx0YXdhaXQgcnBjUHJvdG9jb2wuc3luYygpO1xuXHR9XG5cblx0YXN5bmMgZnVuY3Rpb24gcnVuRmlsZVNlYXJjaChxdWVyeTogSUZpbGVRdWVyeSwgY2FuY2VsID0gZmFsc2UpOiBQcm9taXNlPHsgcmVzdWx0czogVVJJW107IHN0YXRzOiBJU2VhcmNoQ29tcGxldGVTdGF0cyB9PiB7XG5cdFx0bGV0IHN0YXRzOiBJU2VhcmNoQ29tcGxldGVTdGF0cztcblx0XHR0cnkge1xuXHRcdFx0Y29uc3QgY2FuY2VsbGF0aW9uID0gbmV3IENhbmNlbGxhdGlvblRva2VuU291cmNlKCk7XG5cdFx0XHRjb25zdCBwID0gZXh0SG9zdFNlYXJjaC4kcHJvdmlkZUZpbGVTZWFyY2hSZXN1bHRzKG1vY2tNYWluVGhyZWFkU2VhcmNoLmxhc3RIYW5kbGUsIDAsIHF1ZXJ5LCBjYW5jZWxsYXRpb24udG9rZW4pO1xuXHRcdFx0aWYgKGNhbmNlbCkge1xuXHRcdFx0XHRhd2FpdCB0aW1lb3V0KDApO1xuXHRcdFx0XHRjYW5jZWxsYXRpb24uY2FuY2VsKCk7XG5cdFx0XHR9XG5cblx0XHRcdHN0YXRzID0gYXdhaXQgcDtcblx0XHR9IGNhdGNoIChlcnIpIHtcblx0XHRcdGlmICghaXNDYW5jZWxsYXRpb25FcnJvcihlcnIpKSB7XG5cdFx0XHRcdGF3YWl0IHJwY1Byb3RvY29sLnN5bmMoKTtcblx0XHRcdFx0dGhyb3cgZXJyO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdGF3YWl0IHJwY1Byb3RvY29sLnN5bmMoKTtcblx0XHRyZXR1cm4ge1xuXHRcdFx0cmVzdWx0czogKDxVcmlDb21wb25lbnRzW10+bW9ja01haW5UaHJlYWRTZWFyY2gucmVzdWx0cykubWFwKHIgPT4gVVJJLnJldml2ZShyKSksXG5cdFx0XHRzdGF0czogc3RhdHMhXG5cdFx0fTtcblx0fVxuXG5cdGFzeW5jIGZ1bmN0aW9uIHJ1blRleHRTZWFyY2gocXVlcnk6IElUZXh0UXVlcnkpOiBQcm9taXNlPHsgcmVzdWx0czogSUZpbGVNYXRjaFtdOyBzdGF0czogSVNlYXJjaENvbXBsZXRlU3RhdHMgfT4ge1xuXHRcdGxldCBzdGF0czogSVNlYXJjaENvbXBsZXRlU3RhdHM7XG5cdFx0dHJ5IHtcblx0XHRcdGNvbnN0IGNhbmNlbGxhdGlvbiA9IG5ldyBDYW5jZWxsYXRpb25Ub2tlblNvdXJjZSgpO1xuXHRcdFx0Y29uc3QgcCA9IGV4dEhvc3RTZWFyY2guJHByb3ZpZGVUZXh0U2VhcmNoUmVzdWx0cyhtb2NrTWFpblRocmVhZFNlYXJjaC5sYXN0SGFuZGxlLCAwLCBxdWVyeSwgY2FuY2VsbGF0aW9uLnRva2VuKTtcblxuXHRcdFx0c3RhdHMgPSBhd2FpdCBwO1xuXHRcdH0gY2F0Y2ggKGVycikge1xuXHRcdFx0aWYgKCFpc0NhbmNlbGxhdGlvbkVycm9yKGVycikpIHtcblx0XHRcdFx0YXdhaXQgcnBjUHJvdG9jb2wuc3luYygpO1xuXHRcdFx0XHR0aHJvdyBlcnI7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0YXdhaXQgcnBjUHJvdG9jb2wuc3luYygpO1xuXHRcdGNvbnN0IHJlc3VsdHM6IElGaWxlTWF0Y2hbXSA9IHJldml2ZSg8SVJhd0ZpbGVNYXRjaDJbXT5tb2NrTWFpblRocmVhZFNlYXJjaC5yZXN1bHRzKTtcblxuXHRcdHJldHVybiB7IHJlc3VsdHMsIHN0YXRzOiBzdGF0cyEgfTtcblx0fVxuXG5cdHNldHVwKCgpID0+IHtcblx0XHRycGNQcm90b2NvbCA9IG5ldyBUZXN0UlBDUHJvdG9jb2woKTtcblxuXHRcdG1vY2tNYWluVGhyZWFkU2VhcmNoID0gbmV3IE1vY2tNYWluVGhyZWFkU2VhcmNoKCk7XG5cdFx0Y29uc3QgbG9nU2VydmljZSA9IG5ldyBOdWxsTG9nU2VydmljZSgpO1xuXG5cdFx0cnBjUHJvdG9jb2wuc2V0KE1haW5Db250ZXh0Lk1haW5UaHJlYWRTZWFyY2gsIG1vY2tNYWluVGhyZWFkU2VhcmNoKTtcblxuXHRcdG1vY2tQRlMgPSB7fTtcblx0XHRleHRIb3N0U2VhcmNoID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBjbGFzcyBleHRlbmRzIE5hdGl2ZUV4dEhvc3RTZWFyY2gge1xuXHRcdFx0Y29uc3RydWN0b3IoKSB7XG5cdFx0XHRcdHN1cGVyKFxuXHRcdFx0XHRcdHJwY1Byb3RvY29sLFxuXHRcdFx0XHRcdG5ldyBjbGFzcyBleHRlbmRzIG1vY2s8SUV4dEhvc3RJbml0RGF0YVNlcnZpY2U+KCkgeyBvdmVycmlkZSByZW1vdGUgPSB7IGlzUmVtb3RlOiBmYWxzZSwgYXV0aG9yaXR5OiB1bmRlZmluZWQsIGNvbm5lY3Rpb25EYXRhOiBudWxsIH07IH0sXG5cdFx0XHRcdFx0bmV3IFVSSVRyYW5zZm9ybWVyU2VydmljZShudWxsKSxcblx0XHRcdFx0XHRuZXcgY2xhc3MgZXh0ZW5kcyBtb2NrPElFeHRIb3N0Q29uZmlndXJhdGlvbj4oKSB7XG5cdFx0XHRcdFx0XHRvdmVycmlkZSBhc3luYyBnZXRDb25maWdQcm92aWRlcigpOiBQcm9taXNlPEV4dEhvc3RDb25maWdQcm92aWRlcj4ge1xuXHRcdFx0XHRcdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRcdFx0XHRcdG9uRGlkQ2hhbmdlQ29uZmlndXJhdGlvbihfbGlzdGVuZXI6IChldmVudDogdnNjb2RlLkNvbmZpZ3VyYXRpb25DaGFuZ2VFdmVudCkgPT4gdm9pZCkgeyB9LFxuXHRcdFx0XHRcdFx0XHRcdGdldENvbmZpZ3VyYXRpb24oKTogdnNjb2RlLldvcmtzcGFjZUNvbmZpZ3VyYXRpb24ge1xuXHRcdFx0XHRcdFx0XHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0XHRcdFx0XHRcdFx0Z2V0KCkgeyB9LFxuXHRcdFx0XHRcdFx0XHRcdFx0XHRoYXMoKSB7XG5cdFx0XHRcdFx0XHRcdFx0XHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdFx0XHRcdFx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdFx0XHRcdFx0XHRpbnNwZWN0KCkge1xuXHRcdFx0XHRcdFx0XHRcdFx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0XHRcdFx0XHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0XHRcdFx0XHRcdGFzeW5jIHVwZGF0ZSgpIHsgfVxuXHRcdFx0XHRcdFx0XHRcdFx0fTtcblx0XHRcdFx0XHRcdFx0XHR9LFxuXG5cdFx0XHRcdFx0XHRcdH0gYXMgRXh0SG9zdENvbmZpZ1Byb3ZpZGVyO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0bG9nU2VydmljZVxuXHRcdFx0XHQpO1xuXHRcdFx0XHQvLyBlc2xpbnQtZGlzYWJsZS1uZXh0LWxpbmUgbG9jYWwvY29kZS1uby1hbnktY2FzdHNcblx0XHRcdFx0dGhpcy5fcGZzID0gbW9ja1BGUyBhcyBhbnk7XG5cdFx0XHR9XG5cblx0XHRcdHByb3RlY3RlZCBvdmVycmlkZSBjcmVhdGVUZXh0U2VhcmNoTWFuYWdlcihxdWVyeTogSVRleHRRdWVyeSwgcHJvdmlkZXI6IHZzY29kZS5UZXh0U2VhcmNoUHJvdmlkZXIyKTogVGV4dFNlYXJjaE1hbmFnZXIge1xuXHRcdFx0XHRyZXR1cm4gbmV3IE5hdGl2ZVRleHRTZWFyY2hNYW5hZ2VyKHF1ZXJ5LCBwcm92aWRlciwgdGhpcy5fcGZzKTtcblx0XHRcdH1cblx0XHR9KTtcblx0fSk7XG5cblx0dGVhcmRvd24oKCkgPT4ge1xuXHRcdHJldHVybiBycGNQcm90b2NvbC5zeW5jKCk7XG5cdH0pO1xuXG5cdGNvbnN0IHJvb3RGb2xkZXJBID0gVVJJLmZpbGUoJy9mb28vYmFyMScpO1xuXHRjb25zdCByb290Rm9sZGVyQiA9IFVSSS5maWxlKCcvZm9vL2JhcjInKTtcblx0Y29uc3QgZmFuY3lTY2hlbWUgPSAnZmFuY3knO1xuXHRjb25zdCBmYW5jeVNjaGVtZUZvbGRlckEgPSBVUkkuZnJvbSh7IHNjaGVtZTogZmFuY3lTY2hlbWUsIHBhdGg6ICcvcHJvamVjdC9mb2xkZXIxJyB9KTtcblxuXHRzdWl0ZSgnRmlsZTonLCAoKSA9PiB7XG5cblx0XHRmdW5jdGlvbiBnZXRTaW1wbGVRdWVyeShmaWxlUGF0dGVybiA9ICcnKTogSUZpbGVRdWVyeSB7XG5cdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHR0eXBlOiBRdWVyeVR5cGUuRmlsZSxcblxuXHRcdFx0XHRmaWxlUGF0dGVybixcblx0XHRcdFx0Zm9sZGVyUXVlcmllczogW1xuXHRcdFx0XHRcdHsgZm9sZGVyOiByb290Rm9sZGVyQSB9XG5cdFx0XHRcdF1cblx0XHRcdH07XG5cdFx0fVxuXG5cdFx0ZnVuY3Rpb24gY29tcGFyZVVSSXMoYWN0dWFsOiBVUklbXSwgZXhwZWN0ZWQ6IFVSSVtdKSB7XG5cdFx0XHRjb25zdCBzb3J0QW5kU3RyaW5naWZ5ID0gKGFycjogVVJJW10pID0+IGFyci5zb3J0KCkubWFwKHUgPT4gdS50b1N0cmluZygpKTtcblxuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChcblx0XHRcdFx0c29ydEFuZFN0cmluZ2lmeShhY3R1YWwpLFxuXHRcdFx0XHRzb3J0QW5kU3RyaW5naWZ5KGV4cGVjdGVkKSk7XG5cdFx0fVxuXG5cdFx0dGVzdCgnbm8gcmVzdWx0cycsIGFzeW5jICgpID0+IHtcblx0XHRcdGF3YWl0IHJlZ2lzdGVyVGVzdEZpbGVTZWFyY2hQcm92aWRlcih7XG5cdFx0XHRcdHByb3ZpZGVGaWxlU2VhcmNoUmVzdWx0cyhxdWVyeTogdnNjb2RlLkZpbGVTZWFyY2hRdWVyeSwgb3B0aW9uczogdnNjb2RlLkZpbGVTZWFyY2hPcHRpb25zLCB0b2tlbjogdnNjb2RlLkNhbmNlbGxhdGlvblRva2VuKTogUHJvbWlzZTxVUklbXT4ge1xuXHRcdFx0XHRcdHJldHVybiBQcm9taXNlLnJlc29sdmUobnVsbCEpO1xuXHRcdFx0XHR9XG5cdFx0XHR9KTtcblxuXHRcdFx0Y29uc3QgeyByZXN1bHRzLCBzdGF0cyB9ID0gYXdhaXQgcnVuRmlsZVNlYXJjaChnZXRTaW1wbGVRdWVyeSgpKTtcblx0XHRcdGFzc2VydCghc3RhdHMubGltaXRIaXQpO1xuXHRcdFx0YXNzZXJ0KCFyZXN1bHRzLmxlbmd0aCk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdzaW1wbGUgcmVzdWx0cycsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IHJlcG9ydGVkUmVzdWx0cyA9IFtcblx0XHRcdFx0am9pblBhdGgocm9vdEZvbGRlckEsICdmaWxlMS50cycpLFxuXHRcdFx0XHRqb2luUGF0aChyb290Rm9sZGVyQSwgJ2ZpbGUyLnRzJyksXG5cdFx0XHRcdGpvaW5QYXRoKHJvb3RGb2xkZXJBLCAnc3ViZm9sZGVyL2ZpbGUzLnRzJylcblx0XHRcdF07XG5cblx0XHRcdGF3YWl0IHJlZ2lzdGVyVGVzdEZpbGVTZWFyY2hQcm92aWRlcih7XG5cdFx0XHRcdHByb3ZpZGVGaWxlU2VhcmNoUmVzdWx0cyhxdWVyeTogdnNjb2RlLkZpbGVTZWFyY2hRdWVyeSwgb3B0aW9uczogdnNjb2RlLkZpbGVTZWFyY2hPcHRpb25zLCB0b2tlbjogdnNjb2RlLkNhbmNlbGxhdGlvblRva2VuKTogUHJvbWlzZTxVUklbXT4ge1xuXHRcdFx0XHRcdHJldHVybiBQcm9taXNlLnJlc29sdmUocmVwb3J0ZWRSZXN1bHRzKTtcblx0XHRcdFx0fVxuXHRcdFx0fSk7XG5cblx0XHRcdGNvbnN0IHsgcmVzdWx0cywgc3RhdHMgfSA9IGF3YWl0IHJ1bkZpbGVTZWFyY2goZ2V0U2ltcGxlUXVlcnkoKSk7XG5cdFx0XHRhc3NlcnQoIXN0YXRzLmxpbWl0SGl0KTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHRzLmxlbmd0aCwgMyk7XG5cdFx0XHRjb21wYXJlVVJJcyhyZXN1bHRzLCByZXBvcnRlZFJlc3VsdHMpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnU2VhcmNoIGNhbmNlbGVkJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0bGV0IGNhbmNlbFJlcXVlc3RlZCA9IGZhbHNlO1xuXHRcdFx0YXdhaXQgcmVnaXN0ZXJUZXN0RmlsZVNlYXJjaFByb3ZpZGVyKHtcblx0XHRcdFx0cHJvdmlkZUZpbGVTZWFyY2hSZXN1bHRzKHF1ZXJ5OiB2c2NvZGUuRmlsZVNlYXJjaFF1ZXJ5LCBvcHRpb25zOiB2c2NvZGUuRmlsZVNlYXJjaE9wdGlvbnMsIHRva2VuOiB2c2NvZGUuQ2FuY2VsbGF0aW9uVG9rZW4pOiBQcm9taXNlPFVSSVtdPiB7XG5cblx0XHRcdFx0XHRyZXR1cm4gbmV3IFByb21pc2UoKHJlc29sdmUsIHJlamVjdCkgPT4ge1xuXHRcdFx0XHRcdFx0ZnVuY3Rpb24gb25DYW5jZWwoKSB7XG5cdFx0XHRcdFx0XHRcdGNhbmNlbFJlcXVlc3RlZCA9IHRydWU7XG5cblx0XHRcdFx0XHRcdFx0cmVzb2x2ZShbam9pblBhdGgob3B0aW9ucy5mb2xkZXIsICdmaWxlMS50cycpXSk7IC8vIG9yIHJlamVjdCBvciBub3RoaW5nP1xuXHRcdFx0XHRcdFx0fVxuXG5cdFx0XHRcdFx0XHRpZiAodG9rZW4uaXNDYW5jZWxsYXRpb25SZXF1ZXN0ZWQpIHtcblx0XHRcdFx0XHRcdFx0b25DYW5jZWwoKTtcblx0XHRcdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0XHRcdGRpc3Bvc2FibGVzLmFkZCh0b2tlbi5vbkNhbmNlbGxhdGlvblJlcXVlc3RlZCgoKSA9PiBvbkNhbmNlbCgpKSk7XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0fSk7XG5cdFx0XHRcdH1cblx0XHRcdH0pO1xuXG5cdFx0XHRjb25zdCB7IHJlc3VsdHMgfSA9IGF3YWl0IHJ1bkZpbGVTZWFyY2goZ2V0U2ltcGxlUXVlcnkoKSwgdHJ1ZSk7XG5cdFx0XHRhc3NlcnQoY2FuY2VsUmVxdWVzdGVkKTtcblx0XHRcdGFzc2VydCghcmVzdWx0cy5sZW5ndGgpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnc2Vzc2lvbiBjYW5jZWxsYXRpb24gc2hvdWxkIHdvcmsnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRsZXQgbnVtU2Vzc2lvbkNhbmNlbGxlZCA9IDA7XG5cdFx0XHRjb25zdCBkaXNwb3NhYmxlczogKHZzY29kZS5EaXNwb3NhYmxlIHwgdW5kZWZpbmVkKVtdID0gW107XG5cdFx0XHRhd2FpdCByZWdpc3RlclRlc3RGaWxlU2VhcmNoUHJvdmlkZXIoe1xuXHRcdFx0XHRwcm92aWRlRmlsZVNlYXJjaFJlc3VsdHMocXVlcnk6IHZzY29kZS5GaWxlU2VhcmNoUXVlcnksIG9wdGlvbnM6IHZzY29kZS5GaWxlU2VhcmNoT3B0aW9ucywgdG9rZW46IHZzY29kZS5DYW5jZWxsYXRpb25Ub2tlbik6IFByb21pc2U8VVJJW10+IHtcblxuXHRcdFx0XHRcdGRpc3Bvc2FibGVzLnB1c2gob3B0aW9ucy5zZXNzaW9uPy5vbkNhbmNlbGxhdGlvblJlcXVlc3RlZCgoKSA9PiB7XG5cdFx0XHRcdFx0XHRudW1TZXNzaW9uQ2FuY2VsbGVkKys7XG5cdFx0XHRcdFx0fSkpO1xuXG5cdFx0XHRcdFx0cmV0dXJuIFByb21pc2UucmVzb2x2ZShbXSk7XG5cdFx0XHRcdH1cblx0XHRcdH0pO1xuXG5cblx0XHRcdGF3YWl0IHJ1bkZpbGVTZWFyY2goeyAuLi5nZXRTaW1wbGVRdWVyeSgpLCBjYWNoZUtleTogJzEnIH0sIHRydWUpO1xuXHRcdFx0YXdhaXQgcnVuRmlsZVNlYXJjaCh7IC4uLmdldFNpbXBsZVF1ZXJ5KCksIGNhY2hlS2V5OiAnMicgfSwgdHJ1ZSk7XG5cdFx0XHRleHRIb3N0U2VhcmNoLiRjbGVhckNhY2hlKCcxJyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobnVtU2Vzc2lvbkNhbmNlbGxlZCwgMSk7XG5cdFx0XHRkaXNwb3NhYmxlcy5mb3JFYWNoKGQgPT4gZD8uZGlzcG9zZSgpKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3Byb3ZpZGVyIHJldHVybnMgbnVsbCcsIGFzeW5jICgpID0+IHtcblx0XHRcdGF3YWl0IHJlZ2lzdGVyVGVzdEZpbGVTZWFyY2hQcm92aWRlcih7XG5cdFx0XHRcdHByb3ZpZGVGaWxlU2VhcmNoUmVzdWx0cyhxdWVyeTogdnNjb2RlLkZpbGVTZWFyY2hRdWVyeSwgb3B0aW9uczogdnNjb2RlLkZpbGVTZWFyY2hPcHRpb25zLCB0b2tlbjogdnNjb2RlLkNhbmNlbGxhdGlvblRva2VuKTogUHJvbWlzZTxVUklbXT4ge1xuXHRcdFx0XHRcdHJldHVybiBudWxsITtcblx0XHRcdFx0fVxuXHRcdFx0fSk7XG5cblx0XHRcdHRyeSB7XG5cdFx0XHRcdGF3YWl0IHJ1bkZpbGVTZWFyY2goZ2V0U2ltcGxlUXVlcnkoKSk7XG5cdFx0XHRcdGFzc2VydChmYWxzZSwgJ0V4cGVjdGVkIHRvIGZhaWwnKTtcblx0XHRcdH0gY2F0Y2gge1xuXHRcdFx0XHQvLyBFeHBlY3RlZCB0byB0aHJvd1xuXHRcdFx0fVxuXHRcdH0pO1xuXG5cdFx0dGVzdCgnYWxsIHByb3ZpZGVyIGNhbGxzIGdldCBnbG9iYWwgaW5jbHVkZS9leGNsdWRlcycsIGFzeW5jICgpID0+IHtcblx0XHRcdGF3YWl0IHJlZ2lzdGVyVGVzdEZpbGVTZWFyY2hQcm92aWRlcih7XG5cdFx0XHRcdHByb3ZpZGVGaWxlU2VhcmNoUmVzdWx0cyhxdWVyeTogdnNjb2RlLkZpbGVTZWFyY2hRdWVyeSwgb3B0aW9uczogdnNjb2RlLkZpbGVTZWFyY2hPcHRpb25zLCB0b2tlbjogdnNjb2RlLkNhbmNlbGxhdGlvblRva2VuKTogUHJvbWlzZTxVUklbXT4ge1xuXHRcdFx0XHRcdGFzc2VydChvcHRpb25zLmV4Y2x1ZGVzLmxlbmd0aCA9PT0gMiAmJiBvcHRpb25zLmluY2x1ZGVzLmxlbmd0aCA9PT0gMiwgJ01pc3NpbmcgZ2xvYmFsIGluY2x1ZGUvZXhjbHVkZXMnKTtcblx0XHRcdFx0XHRyZXR1cm4gUHJvbWlzZS5yZXNvbHZlKG51bGwhKTtcblx0XHRcdFx0fVxuXHRcdFx0fSk7XG5cblx0XHRcdGNvbnN0IHF1ZXJ5OiBJU2VhcmNoUXVlcnkgPSB7XG5cdFx0XHRcdHR5cGU6IFF1ZXJ5VHlwZS5GaWxlLFxuXG5cdFx0XHRcdGZpbGVQYXR0ZXJuOiAnJyxcblx0XHRcdFx0aW5jbHVkZVBhdHRlcm46IHtcblx0XHRcdFx0XHQnZm9vJzogdHJ1ZSxcblx0XHRcdFx0XHQnYmFyJzogdHJ1ZVxuXHRcdFx0XHR9LFxuXHRcdFx0XHRleGNsdWRlUGF0dGVybjoge1xuXHRcdFx0XHRcdCdzb21ldGhpbmcnOiB0cnVlLFxuXHRcdFx0XHRcdCdlbHNlJzogdHJ1ZVxuXHRcdFx0XHR9LFxuXHRcdFx0XHRmb2xkZXJRdWVyaWVzOiBbXG5cdFx0XHRcdFx0eyBmb2xkZXI6IHJvb3RGb2xkZXJBIH0sXG5cdFx0XHRcdFx0eyBmb2xkZXI6IHJvb3RGb2xkZXJCIH1cblx0XHRcdFx0XVxuXHRcdFx0fTtcblxuXHRcdFx0YXdhaXQgcnVuRmlsZVNlYXJjaChxdWVyeSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdnbG9iYWwvbG9jYWwgaW5jbHVkZS9leGNsdWRlcyBjb21iaW5lZCcsIGFzeW5jICgpID0+IHtcblx0XHRcdGF3YWl0IHJlZ2lzdGVyVGVzdEZpbGVTZWFyY2hQcm92aWRlcih7XG5cdFx0XHRcdHByb3ZpZGVGaWxlU2VhcmNoUmVzdWx0cyhxdWVyeTogdnNjb2RlLkZpbGVTZWFyY2hRdWVyeSwgb3B0aW9uczogdnNjb2RlLkZpbGVTZWFyY2hPcHRpb25zLCB0b2tlbjogdnNjb2RlLkNhbmNlbGxhdGlvblRva2VuKTogUHJvbWlzZTxVUklbXT4ge1xuXHRcdFx0XHRcdGlmIChvcHRpb25zLmZvbGRlci50b1N0cmluZygpID09PSByb290Rm9sZGVyQS50b1N0cmluZygpKSB7XG5cdFx0XHRcdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKG9wdGlvbnMuaW5jbHVkZXMuc29ydCgpLCBbJyoudHMnLCAnZm9vJ10pO1xuXHRcdFx0XHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChvcHRpb25zLmV4Y2x1ZGVzLnNvcnQoKSwgWycqLmpzJywgJ2JhciddKTtcblx0XHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChvcHRpb25zLmluY2x1ZGVzLnNvcnQoKSwgWycqLnRzJ10pO1xuXHRcdFx0XHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChvcHRpb25zLmV4Y2x1ZGVzLnNvcnQoKSwgWycqLmpzJ10pO1xuXHRcdFx0XHRcdH1cblxuXHRcdFx0XHRcdHJldHVybiBQcm9taXNlLnJlc29sdmUobnVsbCEpO1xuXHRcdFx0XHR9XG5cdFx0XHR9KTtcblxuXHRcdFx0Y29uc3QgcXVlcnk6IElTZWFyY2hRdWVyeSA9IHtcblx0XHRcdFx0dHlwZTogUXVlcnlUeXBlLkZpbGUsXG5cblx0XHRcdFx0ZmlsZVBhdHRlcm46ICcnLFxuXHRcdFx0XHRpbmNsdWRlUGF0dGVybjoge1xuXHRcdFx0XHRcdCcqLnRzJzogdHJ1ZVxuXHRcdFx0XHR9LFxuXHRcdFx0XHRleGNsdWRlUGF0dGVybjoge1xuXHRcdFx0XHRcdCcqLmpzJzogdHJ1ZVxuXHRcdFx0XHR9LFxuXHRcdFx0XHRmb2xkZXJRdWVyaWVzOiBbXG5cdFx0XHRcdFx0e1xuXHRcdFx0XHRcdFx0Zm9sZGVyOiByb290Rm9sZGVyQSxcblx0XHRcdFx0XHRcdGluY2x1ZGVQYXR0ZXJuOiB7XG5cdFx0XHRcdFx0XHRcdCdmb28nOiB0cnVlXG5cdFx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdFx0ZXhjbHVkZVBhdHRlcm46IFt7XG5cdFx0XHRcdFx0XHRcdHBhdHRlcm46IHtcblx0XHRcdFx0XHRcdFx0XHQnYmFyJzogdHJ1ZVxuXHRcdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHR9XVxuXHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0eyBmb2xkZXI6IHJvb3RGb2xkZXJCIH1cblx0XHRcdFx0XVxuXHRcdFx0fTtcblxuXHRcdFx0YXdhaXQgcnVuRmlsZVNlYXJjaChxdWVyeSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdpbmNsdWRlL2V4Y2x1ZGVzIHJlc29sdmVkIGNvcnJlY3RseScsIGFzeW5jICgpID0+IHtcblx0XHRcdGF3YWl0IHJlZ2lzdGVyVGVzdEZpbGVTZWFyY2hQcm92aWRlcih7XG5cdFx0XHRcdHByb3ZpZGVGaWxlU2VhcmNoUmVzdWx0cyhxdWVyeTogdnNjb2RlLkZpbGVTZWFyY2hRdWVyeSwgb3B0aW9uczogdnNjb2RlLkZpbGVTZWFyY2hPcHRpb25zLCB0b2tlbjogdnNjb2RlLkNhbmNlbGxhdGlvblRva2VuKTogUHJvbWlzZTxVUklbXT4ge1xuXHRcdFx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwob3B0aW9ucy5pbmNsdWRlcy5zb3J0KCksIFsnKi5qc3gnLCAnKi50cyddKTtcblx0XHRcdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKG9wdGlvbnMuZXhjbHVkZXMuc29ydCgpLCBbXSk7XG5cblx0XHRcdFx0XHRyZXR1cm4gUHJvbWlzZS5yZXNvbHZlKG51bGwhKTtcblx0XHRcdFx0fVxuXHRcdFx0fSk7XG5cblx0XHRcdGNvbnN0IHF1ZXJ5OiBJU2VhcmNoUXVlcnkgPSB7XG5cdFx0XHRcdHR5cGU6IFF1ZXJ5VHlwZS5GaWxlLFxuXG5cdFx0XHRcdGZpbGVQYXR0ZXJuOiAnJyxcblx0XHRcdFx0aW5jbHVkZVBhdHRlcm46IHtcblx0XHRcdFx0XHQnKi50cyc6IHRydWUsXG5cdFx0XHRcdFx0JyouanN4JzogZmFsc2Vcblx0XHRcdFx0fSxcblx0XHRcdFx0ZXhjbHVkZVBhdHRlcm46IHtcblx0XHRcdFx0XHQnKi5qcyc6IHRydWUsXG5cdFx0XHRcdFx0JyoudHN4JzogZmFsc2Vcblx0XHRcdFx0fSxcblx0XHRcdFx0Zm9sZGVyUXVlcmllczogW1xuXHRcdFx0XHRcdHtcblx0XHRcdFx0XHRcdGZvbGRlcjogcm9vdEZvbGRlckEsXG5cdFx0XHRcdFx0XHRpbmNsdWRlUGF0dGVybjoge1xuXHRcdFx0XHRcdFx0XHQnKi5qc3gnOiB0cnVlXG5cdFx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdFx0ZXhjbHVkZVBhdHRlcm46IFt7XG5cdFx0XHRcdFx0XHRcdHBhdHRlcm46IHtcblx0XHRcdFx0XHRcdFx0XHQnKi5qcyc6IGZhbHNlXG5cdFx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdH1dXG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRdXG5cdFx0XHR9O1xuXG5cdFx0XHRhd2FpdCBydW5GaWxlU2VhcmNoKHF1ZXJ5KTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2Jhc2ljIHNpYmxpbmcgZXhjbHVkZSBjbGF1c2UnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCByZXBvcnRlZFJlc3VsdHMgPSBbXG5cdFx0XHRcdCdmaWxlMS50cycsXG5cdFx0XHRcdCdmaWxlMS5qcycsXG5cdFx0XHRdO1xuXG5cdFx0XHRhd2FpdCByZWdpc3RlclRlc3RGaWxlU2VhcmNoUHJvdmlkZXIoe1xuXHRcdFx0XHRwcm92aWRlRmlsZVNlYXJjaFJlc3VsdHMocXVlcnk6IHZzY29kZS5GaWxlU2VhcmNoUXVlcnksIG9wdGlvbnM6IHZzY29kZS5GaWxlU2VhcmNoT3B0aW9ucywgdG9rZW46IHZzY29kZS5DYW5jZWxsYXRpb25Ub2tlbik6IFByb21pc2U8VVJJW10+IHtcblx0XHRcdFx0XHRyZXR1cm4gUHJvbWlzZS5yZXNvbHZlKHJlcG9ydGVkUmVzdWx0c1xuXHRcdFx0XHRcdFx0Lm1hcChyZWxhdGl2ZVBhdGggPT4gam9pblBhdGgob3B0aW9ucy5mb2xkZXIsIHJlbGF0aXZlUGF0aCkpKTtcblx0XHRcdFx0fVxuXHRcdFx0fSk7XG5cblx0XHRcdGNvbnN0IHF1ZXJ5OiBJU2VhcmNoUXVlcnkgPSB7XG5cdFx0XHRcdHR5cGU6IFF1ZXJ5VHlwZS5GaWxlLFxuXG5cdFx0XHRcdGZpbGVQYXR0ZXJuOiAnJyxcblx0XHRcdFx0ZXhjbHVkZVBhdHRlcm46IHtcblx0XHRcdFx0XHQnKi5qcyc6IHtcblx0XHRcdFx0XHRcdHdoZW46ICckKGJhc2VuYW1lKS50cydcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH0sXG5cdFx0XHRcdGZvbGRlclF1ZXJpZXM6IFtcblx0XHRcdFx0XHR7IGZvbGRlcjogcm9vdEZvbGRlckEgfVxuXHRcdFx0XHRdXG5cdFx0XHR9O1xuXG5cdFx0XHRjb25zdCB7IHJlc3VsdHMgfSA9IGF3YWl0IHJ1bkZpbGVTZWFyY2gocXVlcnkpO1xuXHRcdFx0Y29tcGFyZVVSSXMoXG5cdFx0XHRcdHJlc3VsdHMsXG5cdFx0XHRcdFtcblx0XHRcdFx0XHRqb2luUGF0aChyb290Rm9sZGVyQSwgJ2ZpbGUxLnRzJylcblx0XHRcdFx0XSk7XG5cdFx0fSk7XG5cblx0XHQvLyBodHRwczovL2dpdGh1Yi5jb20vbWljcm9zb2Z0L3ZzY29kZS1yZW1vdGVodWIvaXNzdWVzLzI1NVxuXHRcdHRlc3QoJ2luY2x1ZGUsIHNpYmxpbmcgZXhjbHVkZSwgYW5kIHN1YmZvbGRlcicsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IHJlcG9ydGVkUmVzdWx0cyA9IFtcblx0XHRcdFx0J2Zvby9maWxlMS50cycsXG5cdFx0XHRcdCdmb28vZmlsZTEuanMnLFxuXHRcdFx0XTtcblxuXHRcdFx0YXdhaXQgcmVnaXN0ZXJUZXN0RmlsZVNlYXJjaFByb3ZpZGVyKHtcblx0XHRcdFx0cHJvdmlkZUZpbGVTZWFyY2hSZXN1bHRzKHF1ZXJ5OiB2c2NvZGUuRmlsZVNlYXJjaFF1ZXJ5LCBvcHRpb25zOiB2c2NvZGUuRmlsZVNlYXJjaE9wdGlvbnMsIHRva2VuOiB2c2NvZGUuQ2FuY2VsbGF0aW9uVG9rZW4pOiBQcm9taXNlPFVSSVtdPiB7XG5cdFx0XHRcdFx0cmV0dXJuIFByb21pc2UucmVzb2x2ZShyZXBvcnRlZFJlc3VsdHNcblx0XHRcdFx0XHRcdC5tYXAocmVsYXRpdmVQYXRoID0+IGpvaW5QYXRoKG9wdGlvbnMuZm9sZGVyLCByZWxhdGl2ZVBhdGgpKSk7XG5cdFx0XHRcdH1cblx0XHRcdH0pO1xuXG5cdFx0XHRjb25zdCBxdWVyeTogSVNlYXJjaFF1ZXJ5ID0ge1xuXHRcdFx0XHR0eXBlOiBRdWVyeVR5cGUuRmlsZSxcblxuXHRcdFx0XHRmaWxlUGF0dGVybjogJycsXG5cdFx0XHRcdGluY2x1ZGVQYXR0ZXJuOiB7ICcqKi8qLnRzJzogdHJ1ZSB9LFxuXHRcdFx0XHRleGNsdWRlUGF0dGVybjoge1xuXHRcdFx0XHRcdCcqLmpzJzoge1xuXHRcdFx0XHRcdFx0d2hlbjogJyQoYmFzZW5hbWUpLnRzJ1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fSxcblx0XHRcdFx0Zm9sZGVyUXVlcmllczogW1xuXHRcdFx0XHRcdHsgZm9sZGVyOiByb290Rm9sZGVyQSB9XG5cdFx0XHRcdF1cblx0XHRcdH07XG5cblx0XHRcdGNvbnN0IHsgcmVzdWx0cyB9ID0gYXdhaXQgcnVuRmlsZVNlYXJjaChxdWVyeSk7XG5cdFx0XHRjb21wYXJlVVJJcyhcblx0XHRcdFx0cmVzdWx0cyxcblx0XHRcdFx0W1xuXHRcdFx0XHRcdGpvaW5QYXRoKHJvb3RGb2xkZXJBLCAnZm9vL2ZpbGUxLnRzJylcblx0XHRcdFx0XSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdtdWx0aXJvb3Qgc2libGluZyBleGNsdWRlIGNsYXVzZScsIGFzeW5jICgpID0+IHtcblxuXHRcdFx0YXdhaXQgcmVnaXN0ZXJUZXN0RmlsZVNlYXJjaFByb3ZpZGVyKHtcblx0XHRcdFx0cHJvdmlkZUZpbGVTZWFyY2hSZXN1bHRzKHF1ZXJ5OiB2c2NvZGUuRmlsZVNlYXJjaFF1ZXJ5LCBvcHRpb25zOiB2c2NvZGUuRmlsZVNlYXJjaE9wdGlvbnMsIHRva2VuOiB2c2NvZGUuQ2FuY2VsbGF0aW9uVG9rZW4pOiBQcm9taXNlPFVSSVtdPiB7XG5cdFx0XHRcdFx0bGV0IHJlcG9ydGVkUmVzdWx0czogVVJJW107XG5cdFx0XHRcdFx0aWYgKG9wdGlvbnMuZm9sZGVyLmZzUGF0aCA9PT0gcm9vdEZvbGRlckEuZnNQYXRoKSB7XG5cdFx0XHRcdFx0XHRyZXBvcnRlZFJlc3VsdHMgPSBbXG5cdFx0XHRcdFx0XHRcdCdmb2xkZXIvZmlsZUEuc2NzcycsXG5cdFx0XHRcdFx0XHRcdCdmb2xkZXIvZmlsZUEuY3NzJyxcblx0XHRcdFx0XHRcdFx0J2ZvbGRlci9maWxlMi5jc3MnXG5cdFx0XHRcdFx0XHRdLm1hcChyZWxhdGl2ZVBhdGggPT4gam9pblBhdGgocm9vdEZvbGRlckEsIHJlbGF0aXZlUGF0aCkpO1xuXHRcdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0XHRyZXBvcnRlZFJlc3VsdHMgPSBbXG5cdFx0XHRcdFx0XHRcdCdmaWxlQi50cycsXG5cdFx0XHRcdFx0XHRcdCdmaWxlQi5qcycsXG5cdFx0XHRcdFx0XHRcdCdmaWxlMy5qcydcblx0XHRcdFx0XHRcdF0ubWFwKHJlbGF0aXZlUGF0aCA9PiBqb2luUGF0aChyb290Rm9sZGVyQiwgcmVsYXRpdmVQYXRoKSk7XG5cdFx0XHRcdFx0fVxuXG5cdFx0XHRcdFx0cmV0dXJuIFByb21pc2UucmVzb2x2ZShyZXBvcnRlZFJlc3VsdHMpO1xuXHRcdFx0XHR9XG5cdFx0XHR9KTtcblxuXHRcdFx0Y29uc3QgcXVlcnk6IElTZWFyY2hRdWVyeSA9IHtcblx0XHRcdFx0dHlwZTogUXVlcnlUeXBlLkZpbGUsXG5cblx0XHRcdFx0ZmlsZVBhdHRlcm46ICcnLFxuXHRcdFx0XHRleGNsdWRlUGF0dGVybjoge1xuXHRcdFx0XHRcdCcqLmpzJzoge1xuXHRcdFx0XHRcdFx0d2hlbjogJyQoYmFzZW5hbWUpLnRzJ1xuXHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0JyouY3NzJzogdHJ1ZVxuXHRcdFx0XHR9LFxuXHRcdFx0XHRmb2xkZXJRdWVyaWVzOiBbXG5cdFx0XHRcdFx0e1xuXHRcdFx0XHRcdFx0Zm9sZGVyOiByb290Rm9sZGVyQSxcblx0XHRcdFx0XHRcdGV4Y2x1ZGVQYXR0ZXJuOiBbe1xuXHRcdFx0XHRcdFx0XHRwYXR0ZXJuOiB7XG5cdFx0XHRcdFx0XHRcdFx0J2ZvbGRlci8qLmNzcyc6IHtcblx0XHRcdFx0XHRcdFx0XHRcdHdoZW46ICckKGJhc2VuYW1lKS5zY3NzJ1xuXHRcdFx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0fV1cblx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdHtcblx0XHRcdFx0XHRcdGZvbGRlcjogcm9vdEZvbGRlckIsXG5cdFx0XHRcdFx0XHRleGNsdWRlUGF0dGVybjogW3tcblx0XHRcdFx0XHRcdFx0cGF0dGVybjoge1xuXHRcdFx0XHRcdFx0XHRcdCcqLmpzJzogZmFsc2Vcblx0XHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0fV1cblx0XHRcdFx0XHR9XG5cdFx0XHRcdF1cblx0XHRcdH07XG5cblx0XHRcdGNvbnN0IHsgcmVzdWx0cyB9ID0gYXdhaXQgcnVuRmlsZVNlYXJjaChxdWVyeSk7XG5cdFx0XHRjb21wYXJlVVJJcyhcblx0XHRcdFx0cmVzdWx0cyxcblx0XHRcdFx0W1xuXHRcdFx0XHRcdGpvaW5QYXRoKHJvb3RGb2xkZXJBLCAnZm9sZGVyL2ZpbGVBLnNjc3MnKSxcblx0XHRcdFx0XHRqb2luUGF0aChyb290Rm9sZGVyQSwgJ2ZvbGRlci9maWxlMi5jc3MnKSxcblxuXHRcdFx0XHRcdGpvaW5QYXRoKHJvb3RGb2xkZXJCLCAnZmlsZUIudHMnKSxcblx0XHRcdFx0XHRqb2luUGF0aChyb290Rm9sZGVyQiwgJ2ZpbGVCLmpzJyksXG5cdFx0XHRcdFx0am9pblBhdGgocm9vdEZvbGRlckIsICdmaWxlMy5qcycpLFxuXHRcdFx0XHRdKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ21heCByZXN1bHRzID0gMScsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IHJlcG9ydGVkUmVzdWx0cyA9IFtcblx0XHRcdFx0am9pblBhdGgocm9vdEZvbGRlckEsICdmaWxlMS50cycpLFxuXHRcdFx0XHRqb2luUGF0aChyb290Rm9sZGVyQSwgJ2ZpbGUyLnRzJyksXG5cdFx0XHRcdGpvaW5QYXRoKHJvb3RGb2xkZXJBLCAnZmlsZTMudHMnKSxcblx0XHRcdF07XG5cblx0XHRcdGxldCB3YXNDYW5jZWxlZCA9IGZhbHNlO1xuXHRcdFx0YXdhaXQgcmVnaXN0ZXJUZXN0RmlsZVNlYXJjaFByb3ZpZGVyKHtcblx0XHRcdFx0cHJvdmlkZUZpbGVTZWFyY2hSZXN1bHRzKHF1ZXJ5OiB2c2NvZGUuRmlsZVNlYXJjaFF1ZXJ5LCBvcHRpb25zOiB2c2NvZGUuRmlsZVNlYXJjaE9wdGlvbnMsIHRva2VuOiB2c2NvZGUuQ2FuY2VsbGF0aW9uVG9rZW4pOiBQcm9taXNlPFVSSVtdPiB7XG5cdFx0XHRcdFx0ZGlzcG9zYWJsZXMuYWRkKHRva2VuLm9uQ2FuY2VsbGF0aW9uUmVxdWVzdGVkKCgpID0+IHdhc0NhbmNlbGVkID0gdHJ1ZSkpO1xuXG5cdFx0XHRcdFx0cmV0dXJuIFByb21pc2UucmVzb2x2ZShyZXBvcnRlZFJlc3VsdHMpO1xuXHRcdFx0XHR9XG5cdFx0XHR9KTtcblxuXHRcdFx0Y29uc3QgcXVlcnk6IElTZWFyY2hRdWVyeSA9IHtcblx0XHRcdFx0dHlwZTogUXVlcnlUeXBlLkZpbGUsXG5cblx0XHRcdFx0ZmlsZVBhdHRlcm46ICcnLFxuXHRcdFx0XHRtYXhSZXN1bHRzOiAxLFxuXG5cdFx0XHRcdGZvbGRlclF1ZXJpZXM6IFtcblx0XHRcdFx0XHR7XG5cdFx0XHRcdFx0XHRmb2xkZXI6IHJvb3RGb2xkZXJBXG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRdXG5cdFx0XHR9O1xuXG5cdFx0XHRjb25zdCB7IHJlc3VsdHMsIHN0YXRzIH0gPSBhd2FpdCBydW5GaWxlU2VhcmNoKHF1ZXJ5KTtcblx0XHRcdGFzc2VydChzdGF0cy5saW1pdEhpdCwgJ0V4cGVjdGVkIHRvIHJldHVybiBsaW1pdEhpdCcpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdHMubGVuZ3RoLCAxKTtcblx0XHRcdGNvbXBhcmVVUklzKHJlc3VsdHMsIHJlcG9ydGVkUmVzdWx0cy5zbGljZSgwLCAxKSk7XG5cdFx0XHRhc3NlcnQod2FzQ2FuY2VsZWQsICdFeHBlY3RlZCB0byBiZSBjYW5jZWxlZCB3aGVuIGhpdHRpbmcgbGltaXQnKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ21heCByZXN1bHRzID0gMicsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IHJlcG9ydGVkUmVzdWx0cyA9IFtcblx0XHRcdFx0am9pblBhdGgocm9vdEZvbGRlckEsICdmaWxlMS50cycpLFxuXHRcdFx0XHRqb2luUGF0aChyb290Rm9sZGVyQSwgJ2ZpbGUyLnRzJyksXG5cdFx0XHRcdGpvaW5QYXRoKHJvb3RGb2xkZXJBLCAnZmlsZTMudHMnKSxcblx0XHRcdF07XG5cblx0XHRcdGxldCB3YXNDYW5jZWxlZCA9IGZhbHNlO1xuXHRcdFx0YXdhaXQgcmVnaXN0ZXJUZXN0RmlsZVNlYXJjaFByb3ZpZGVyKHtcblx0XHRcdFx0cHJvdmlkZUZpbGVTZWFyY2hSZXN1bHRzKHF1ZXJ5OiB2c2NvZGUuRmlsZVNlYXJjaFF1ZXJ5LCBvcHRpb25zOiB2c2NvZGUuRmlsZVNlYXJjaE9wdGlvbnMsIHRva2VuOiB2c2NvZGUuQ2FuY2VsbGF0aW9uVG9rZW4pOiBQcm9taXNlPFVSSVtdPiB7XG5cdFx0XHRcdFx0ZGlzcG9zYWJsZXMuYWRkKHRva2VuLm9uQ2FuY2VsbGF0aW9uUmVxdWVzdGVkKCgpID0+IHdhc0NhbmNlbGVkID0gdHJ1ZSkpO1xuXG5cdFx0XHRcdFx0cmV0dXJuIFByb21pc2UucmVzb2x2ZShyZXBvcnRlZFJlc3VsdHMpO1xuXHRcdFx0XHR9XG5cdFx0XHR9KTtcblxuXHRcdFx0Y29uc3QgcXVlcnk6IElTZWFyY2hRdWVyeSA9IHtcblx0XHRcdFx0dHlwZTogUXVlcnlUeXBlLkZpbGUsXG5cblx0XHRcdFx0ZmlsZVBhdHRlcm46ICcnLFxuXHRcdFx0XHRtYXhSZXN1bHRzOiAyLFxuXG5cdFx0XHRcdGZvbGRlclF1ZXJpZXM6IFtcblx0XHRcdFx0XHR7XG5cdFx0XHRcdFx0XHRmb2xkZXI6IHJvb3RGb2xkZXJBXG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRdXG5cdFx0XHR9O1xuXG5cdFx0XHRjb25zdCB7IHJlc3VsdHMsIHN0YXRzIH0gPSBhd2FpdCBydW5GaWxlU2VhcmNoKHF1ZXJ5KTtcblx0XHRcdGFzc2VydChzdGF0cy5saW1pdEhpdCwgJ0V4cGVjdGVkIHRvIHJldHVybiBsaW1pdEhpdCcpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdHMubGVuZ3RoLCAyKTtcblx0XHRcdGNvbXBhcmVVUklzKHJlc3VsdHMsIHJlcG9ydGVkUmVzdWx0cy5zbGljZSgwLCAyKSk7XG5cdFx0XHRhc3NlcnQod2FzQ2FuY2VsZWQsICdFeHBlY3RlZCB0byBiZSBjYW5jZWxlZCB3aGVuIGhpdHRpbmcgbGltaXQnKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3Byb3ZpZGVyIHJldHVybnMgbWF4UmVzdWx0cyBleGFjdGx5JywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgcmVwb3J0ZWRSZXN1bHRzID0gW1xuXHRcdFx0XHRqb2luUGF0aChyb290Rm9sZGVyQSwgJ2ZpbGUxLnRzJyksXG5cdFx0XHRcdGpvaW5QYXRoKHJvb3RGb2xkZXJBLCAnZmlsZTIudHMnKSxcblx0XHRcdF07XG5cblx0XHRcdGxldCB3YXNDYW5jZWxlZCA9IGZhbHNlO1xuXHRcdFx0YXdhaXQgcmVnaXN0ZXJUZXN0RmlsZVNlYXJjaFByb3ZpZGVyKHtcblx0XHRcdFx0cHJvdmlkZUZpbGVTZWFyY2hSZXN1bHRzKHF1ZXJ5OiB2c2NvZGUuRmlsZVNlYXJjaFF1ZXJ5LCBvcHRpb25zOiB2c2NvZGUuRmlsZVNlYXJjaE9wdGlvbnMsIHRva2VuOiB2c2NvZGUuQ2FuY2VsbGF0aW9uVG9rZW4pOiBQcm9taXNlPFVSSVtdPiB7XG5cdFx0XHRcdFx0ZGlzcG9zYWJsZXMuYWRkKHRva2VuLm9uQ2FuY2VsbGF0aW9uUmVxdWVzdGVkKCgpID0+IHdhc0NhbmNlbGVkID0gdHJ1ZSkpO1xuXG5cdFx0XHRcdFx0cmV0dXJuIFByb21pc2UucmVzb2x2ZShyZXBvcnRlZFJlc3VsdHMpO1xuXHRcdFx0XHR9XG5cdFx0XHR9KTtcblxuXHRcdFx0Y29uc3QgcXVlcnk6IElTZWFyY2hRdWVyeSA9IHtcblx0XHRcdFx0dHlwZTogUXVlcnlUeXBlLkZpbGUsXG5cblx0XHRcdFx0ZmlsZVBhdHRlcm46ICcnLFxuXHRcdFx0XHRtYXhSZXN1bHRzOiAyLFxuXG5cdFx0XHRcdGZvbGRlclF1ZXJpZXM6IFtcblx0XHRcdFx0XHR7XG5cdFx0XHRcdFx0XHRmb2xkZXI6IHJvb3RGb2xkZXJBXG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRdXG5cdFx0XHR9O1xuXG5cdFx0XHRjb25zdCB7IHJlc3VsdHMsIHN0YXRzIH0gPSBhd2FpdCBydW5GaWxlU2VhcmNoKHF1ZXJ5KTtcblx0XHRcdGFzc2VydCghc3RhdHMubGltaXRIaXQsICdFeHBlY3RlZCBub3QgdG8gcmV0dXJuIGxpbWl0SGl0Jyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0cy5sZW5ndGgsIDIpO1xuXHRcdFx0Y29tcGFyZVVSSXMocmVzdWx0cywgcmVwb3J0ZWRSZXN1bHRzKTtcblx0XHRcdGFzc2VydCghd2FzQ2FuY2VsZWQsICdFeHBlY3RlZCBub3QgdG8gYmUgY2FuY2VsZWQgd2hlbiBqdXN0IHJlYWNoaW5nIGxpbWl0Jyk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdtdWx0aXJvb3QgbWF4IHJlc3VsdHMnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRsZXQgY2FuY2VscyA9IDA7XG5cdFx0XHRhd2FpdCByZWdpc3RlclRlc3RGaWxlU2VhcmNoUHJvdmlkZXIoe1xuXHRcdFx0XHRhc3luYyBwcm92aWRlRmlsZVNlYXJjaFJlc3VsdHMocXVlcnk6IHZzY29kZS5GaWxlU2VhcmNoUXVlcnksIG9wdGlvbnM6IHZzY29kZS5GaWxlU2VhcmNoT3B0aW9ucywgdG9rZW46IHZzY29kZS5DYW5jZWxsYXRpb25Ub2tlbik6IFByb21pc2U8VVJJW10+IHtcblx0XHRcdFx0XHRkaXNwb3NhYmxlcy5hZGQodG9rZW4ub25DYW5jZWxsYXRpb25SZXF1ZXN0ZWQoKCkgPT4gY2FuY2VscysrKSk7XG5cblx0XHRcdFx0XHQvLyBQcm92aWNlIHJlc3VsdHMgYXN5bmMgc28gaXQgaGFzIGEgY2hhbmNlIHRvIGludm9rZSBldmVyeSBwcm92aWRlclxuXHRcdFx0XHRcdGF3YWl0IG5ldyBQcm9taXNlKHIgPT4gcHJvY2Vzcy5uZXh0VGljayhyKSk7XG5cdFx0XHRcdFx0cmV0dXJuIFtcblx0XHRcdFx0XHRcdCdmaWxlMS50cycsXG5cdFx0XHRcdFx0XHQnZmlsZTIudHMnLFxuXHRcdFx0XHRcdFx0J2ZpbGUzLnRzJyxcblx0XHRcdFx0XHRdLm1hcChyZWxhdGl2ZVBhdGggPT4gam9pblBhdGgob3B0aW9ucy5mb2xkZXIsIHJlbGF0aXZlUGF0aCkpO1xuXHRcdFx0XHR9XG5cdFx0XHR9KTtcblxuXHRcdFx0Y29uc3QgcXVlcnk6IElTZWFyY2hRdWVyeSA9IHtcblx0XHRcdFx0dHlwZTogUXVlcnlUeXBlLkZpbGUsXG5cblx0XHRcdFx0ZmlsZVBhdHRlcm46ICcnLFxuXHRcdFx0XHRtYXhSZXN1bHRzOiAyLFxuXG5cdFx0XHRcdGZvbGRlclF1ZXJpZXM6IFtcblx0XHRcdFx0XHR7XG5cdFx0XHRcdFx0XHRmb2xkZXI6IHJvb3RGb2xkZXJBXG5cdFx0XHRcdFx0fSxcblx0XHRcdFx0XHR7XG5cdFx0XHRcdFx0XHRmb2xkZXI6IHJvb3RGb2xkZXJCXG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRdXG5cdFx0XHR9O1xuXG5cdFx0XHRjb25zdCB7IHJlc3VsdHMgfSA9IGF3YWl0IHJ1bkZpbGVTZWFyY2gocXVlcnkpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdHMubGVuZ3RoLCAyKTsgLy8gRG9uJ3QgY2FyZSB3aGljaCAyIHdlIGdvdFxuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNhbmNlbHMsIDIsICdFeHBlY3RlZCBhbGwgaW52b2NhdGlvbnMgdG8gYmUgY2FuY2VsZWQgd2hlbiBoaXR0aW5nIGxpbWl0Jyk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCd3b3JrcyB3aXRoIG5vbi1maWxlIHNjaGVtZXMnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCByZXBvcnRlZFJlc3VsdHMgPSBbXG5cdFx0XHRcdGpvaW5QYXRoKGZhbmN5U2NoZW1lRm9sZGVyQSwgJ2ZpbGUxLnRzJyksXG5cdFx0XHRcdGpvaW5QYXRoKGZhbmN5U2NoZW1lRm9sZGVyQSwgJ2ZpbGUyLnRzJyksXG5cdFx0XHRcdGpvaW5QYXRoKGZhbmN5U2NoZW1lRm9sZGVyQSwgJ3N1YmZvbGRlci9maWxlMy50cycpLFxuXG5cdFx0XHRdO1xuXG5cdFx0XHRhd2FpdCByZWdpc3RlclRlc3RGaWxlU2VhcmNoUHJvdmlkZXIoe1xuXHRcdFx0XHRwcm92aWRlRmlsZVNlYXJjaFJlc3VsdHMocXVlcnk6IHZzY29kZS5GaWxlU2VhcmNoUXVlcnksIG9wdGlvbnM6IHZzY29kZS5GaWxlU2VhcmNoT3B0aW9ucywgdG9rZW46IHZzY29kZS5DYW5jZWxsYXRpb25Ub2tlbik6IFByb21pc2U8VVJJW10+IHtcblx0XHRcdFx0XHRyZXR1cm4gUHJvbWlzZS5yZXNvbHZlKHJlcG9ydGVkUmVzdWx0cyk7XG5cdFx0XHRcdH1cblx0XHRcdH0sIGZhbmN5U2NoZW1lKTtcblxuXHRcdFx0Y29uc3QgcXVlcnk6IElTZWFyY2hRdWVyeSA9IHtcblx0XHRcdFx0dHlwZTogUXVlcnlUeXBlLkZpbGUsXG5cdFx0XHRcdGZpbGVQYXR0ZXJuOiAnJyxcblx0XHRcdFx0Zm9sZGVyUXVlcmllczogW1xuXHRcdFx0XHRcdHtcblx0XHRcdFx0XHRcdGZvbGRlcjogZmFuY3lTY2hlbWVGb2xkZXJBXG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRdXG5cdFx0XHR9O1xuXG5cdFx0XHRjb25zdCB7IHJlc3VsdHMgfSA9IGF3YWl0IHJ1bkZpbGVTZWFyY2gocXVlcnkpO1xuXHRcdFx0Y29tcGFyZVVSSXMocmVzdWx0cywgcmVwb3J0ZWRSZXN1bHRzKTtcblx0XHR9KTtcblx0XHR0ZXN0KCdpZiBvbmx5RmlsZVNjaGVtZSBpcyBzZXQsIGRvIG5vdCBjYWxsIGN1c3RvbSBzY2hlbWVzJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0bGV0IGZhbmN5U2NoZW1lQ2FsbGVkID0gZmFsc2U7XG5cdFx0XHRhd2FpdCByZWdpc3RlclRlc3RGaWxlU2VhcmNoUHJvdmlkZXIoe1xuXHRcdFx0XHRwcm92aWRlRmlsZVNlYXJjaFJlc3VsdHMocXVlcnk6IHZzY29kZS5GaWxlU2VhcmNoUXVlcnksIG9wdGlvbnM6IHZzY29kZS5GaWxlU2VhcmNoT3B0aW9ucywgdG9rZW46IHZzY29kZS5DYW5jZWxsYXRpb25Ub2tlbik6IFByb21pc2U8VVJJW10+IHtcblx0XHRcdFx0XHRmYW5jeVNjaGVtZUNhbGxlZCA9IHRydWU7XG5cdFx0XHRcdFx0cmV0dXJuIFByb21pc2UucmVzb2x2ZShbXSk7XG5cdFx0XHRcdH1cblx0XHRcdH0sIGZhbmN5U2NoZW1lKTtcblxuXHRcdFx0Y29uc3QgcXVlcnk6IElTZWFyY2hRdWVyeSA9IHtcblx0XHRcdFx0dHlwZTogUXVlcnlUeXBlLkZpbGUsXG5cdFx0XHRcdGZpbGVQYXR0ZXJuOiAnJyxcblx0XHRcdFx0Zm9sZGVyUXVlcmllczogW11cblx0XHRcdH07XG5cblx0XHRcdGF3YWl0IHJ1bkZpbGVTZWFyY2gocXVlcnkpO1xuXHRcdFx0YXNzZXJ0KCFmYW5jeVNjaGVtZUNhbGxlZCk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHN1aXRlKCdUZXh0OicsICgpID0+IHtcblxuXHRcdGZ1bmN0aW9uIG1ha2VQcmV2aWV3KHRleHQ6IHN0cmluZyk6IHZzY29kZS5UZXh0U2VhcmNoTWF0Y2hbJ3ByZXZpZXcnXSB7XG5cdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRtYXRjaGVzOiBbbmV3IFJhbmdlKDAsIDAsIDAsIHRleHQubGVuZ3RoKV0sXG5cdFx0XHRcdHRleHRcblx0XHRcdH07XG5cdFx0fVxuXG5cdFx0ZnVuY3Rpb24gbWFrZVRleHRSZXN1bHQoYmFzZUZvbGRlcjogVVJJLCByZWxhdGl2ZVBhdGg6IHN0cmluZyk6IHZzY29kZS5UZXh0U2VhcmNoTWF0Y2gge1xuXHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0cHJldmlldzogbWFrZVByZXZpZXcoJ2ZvbycpLFxuXHRcdFx0XHRyYW5nZXM6IFtuZXcgUmFuZ2UoMCwgMCwgMCwgMyldLFxuXHRcdFx0XHR1cmk6IGpvaW5QYXRoKGJhc2VGb2xkZXIsIHJlbGF0aXZlUGF0aClcblx0XHRcdH07XG5cdFx0fVxuXG5cdFx0ZnVuY3Rpb24gZ2V0U2ltcGxlUXVlcnkocXVlcnlUZXh0OiBzdHJpbmcpOiBJVGV4dFF1ZXJ5IHtcblx0XHRcdHJldHVybiB7XG5cdFx0XHRcdHR5cGU6IFF1ZXJ5VHlwZS5UZXh0LFxuXHRcdFx0XHRjb250ZW50UGF0dGVybjogZ2V0UGF0dGVybihxdWVyeVRleHQpLFxuXG5cdFx0XHRcdGZvbGRlclF1ZXJpZXM6IFtcblx0XHRcdFx0XHR7IGZvbGRlcjogcm9vdEZvbGRlckEgfVxuXHRcdFx0XHRdXG5cdFx0XHR9O1xuXHRcdH1cblxuXHRcdGZ1bmN0aW9uIGdldFBhdHRlcm4ocXVlcnlUZXh0OiBzdHJpbmcpOiBJUGF0dGVybkluZm8ge1xuXHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0cGF0dGVybjogcXVlcnlUZXh0XG5cdFx0XHR9O1xuXHRcdH1cblxuXHRcdGZ1bmN0aW9uIGFzc2VydFJlc3VsdHMoYWN0dWFsOiBJRmlsZU1hdGNoW10sIGV4cGVjdGVkOiB2c2NvZGUuVGV4dFNlYXJjaFJlc3VsdFtdKSB7XG5cdFx0XHRjb25zdCBhY3R1YWxUZXh0U2VhcmNoUmVzdWx0czogdnNjb2RlLlRleHRTZWFyY2hSZXN1bHRbXSA9IFtdO1xuXHRcdFx0Zm9yIChjb25zdCBmaWxlTWF0Y2ggb2YgYWN0dWFsKSB7XG5cdFx0XHRcdC8vIE1ha2UgcmVsYXRpdmVcblx0XHRcdFx0Zm9yIChjb25zdCBsaW5lUmVzdWx0IG9mIGZpbGVNYXRjaC5yZXN1bHRzISkge1xuXHRcdFx0XHRcdGlmIChyZXN1bHRJc01hdGNoKGxpbmVSZXN1bHQpKSB7XG5cdFx0XHRcdFx0XHRhY3R1YWxUZXh0U2VhcmNoUmVzdWx0cy5wdXNoKHtcblx0XHRcdFx0XHRcdFx0cHJldmlldzoge1xuXHRcdFx0XHRcdFx0XHRcdHRleHQ6IGxpbmVSZXN1bHQucHJldmlld1RleHQsXG5cdFx0XHRcdFx0XHRcdFx0bWF0Y2hlczogbWFwQXJyYXlPck5vdChcblx0XHRcdFx0XHRcdFx0XHRcdGxpbmVSZXN1bHQucmFuZ2VMb2NhdGlvbnMubWFwKHIgPT4gci5wcmV2aWV3KSxcblx0XHRcdFx0XHRcdFx0XHRcdG0gPT4gbmV3IFJhbmdlKG0uc3RhcnRMaW5lTnVtYmVyLCBtLnN0YXJ0Q29sdW1uLCBtLmVuZExpbmVOdW1iZXIsIG0uZW5kQ29sdW1uKSlcblx0XHRcdFx0XHRcdFx0fSxcblx0XHRcdFx0XHRcdFx0cmFuZ2VzOiBtYXBBcnJheU9yTm90KFxuXHRcdFx0XHRcdFx0XHRcdGxpbmVSZXN1bHQucmFuZ2VMb2NhdGlvbnMubWFwKHIgPT4gci5zb3VyY2UpLFxuXHRcdFx0XHRcdFx0XHRcdHIgPT4gbmV3IFJhbmdlKHIuc3RhcnRMaW5lTnVtYmVyLCByLnN0YXJ0Q29sdW1uLCByLmVuZExpbmVOdW1iZXIsIHIuZW5kQ29sdW1uKSxcblx0XHRcdFx0XHRcdFx0KSxcblx0XHRcdFx0XHRcdFx0dXJpOiBmaWxlTWF0Y2gucmVzb3VyY2Vcblx0XHRcdFx0XHRcdH0pO1xuXHRcdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0XHRhY3R1YWxUZXh0U2VhcmNoUmVzdWx0cy5wdXNoKDx2c2NvZGUuVGV4dFNlYXJjaENvbnRleHQ+e1xuXHRcdFx0XHRcdFx0XHR0ZXh0OiBsaW5lUmVzdWx0LnRleHQsXG5cdFx0XHRcdFx0XHRcdGxpbmVOdW1iZXI6IGxpbmVSZXN1bHQubGluZU51bWJlcixcblx0XHRcdFx0XHRcdFx0dXJpOiBmaWxlTWF0Y2gucmVzb3VyY2Vcblx0XHRcdFx0XHRcdH0pO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0fVxuXG5cdFx0XHRjb25zdCByYW5nZVRvU3RyaW5nID0gKHI6IHZzY29kZS5SYW5nZSkgPT4gYCgke3Iuc3RhcnQubGluZX0sICR7ci5zdGFydC5jaGFyYWN0ZXJ9KSwgKCR7ci5lbmQubGluZX0sICR7ci5lbmQuY2hhcmFjdGVyfSlgO1xuXG5cdFx0XHRjb25zdCBtYWtlQ29tcGFyYWJsZSA9IChyZXN1bHRzOiB2c2NvZGUuVGV4dFNlYXJjaFJlc3VsdFtdKSA9PiByZXN1bHRzXG5cdFx0XHRcdC5zb3J0KChhLCBiKSA9PiB7XG5cdFx0XHRcdFx0Y29uc3QgY29tcGFyZUtleUEgPSBhLnVyaS50b1N0cmluZygpICsgJzogJyArIChleHRlbnNpb25SZXN1bHRJc01hdGNoKGEpID8gYS5wcmV2aWV3LnRleHQgOiBhLnRleHQpO1xuXHRcdFx0XHRcdGNvbnN0IGNvbXBhcmVLZXlCID0gYi51cmkudG9TdHJpbmcoKSArICc6ICcgKyAoZXh0ZW5zaW9uUmVzdWx0SXNNYXRjaChiKSA/IGIucHJldmlldy50ZXh0IDogYi50ZXh0KTtcblx0XHRcdFx0XHRyZXR1cm4gY29tcGFyZUtleUIubG9jYWxlQ29tcGFyZShjb21wYXJlS2V5QSk7XG5cdFx0XHRcdH0pXG5cdFx0XHRcdC5tYXAociA9PiBleHRlbnNpb25SZXN1bHRJc01hdGNoKHIpID8ge1xuXHRcdFx0XHRcdHVyaTogci51cmkudG9TdHJpbmcoKSxcblx0XHRcdFx0XHRyYW5nZTogbWFwQXJyYXlPck5vdChyLnJhbmdlcywgcmFuZ2VUb1N0cmluZyksXG5cdFx0XHRcdFx0cHJldmlldzoge1xuXHRcdFx0XHRcdFx0dGV4dDogci5wcmV2aWV3LnRleHQsXG5cdFx0XHRcdFx0XHRtYXRjaDogbnVsbCAvLyBEb24ndCBjYXJlIGFib3V0IHRoaXMgcmlnaHQgbm93XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9IDoge1xuXHRcdFx0XHRcdHVyaTogci51cmkudG9TdHJpbmcoKSxcblx0XHRcdFx0XHR0ZXh0OiByLnRleHQsXG5cdFx0XHRcdFx0bGluZU51bWJlcjogci5saW5lTnVtYmVyXG5cdFx0XHRcdH0pO1xuXG5cdFx0XHRyZXR1cm4gYXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChcblx0XHRcdFx0bWFrZUNvbXBhcmFibGUoYWN0dWFsVGV4dFNlYXJjaFJlc3VsdHMpLFxuXHRcdFx0XHRtYWtlQ29tcGFyYWJsZShleHBlY3RlZCkpO1xuXHRcdH1cblxuXHRcdHRlc3QoJ25vIHJlc3VsdHMnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRhd2FpdCByZWdpc3RlclRlc3RUZXh0U2VhcmNoUHJvdmlkZXIoe1xuXHRcdFx0XHRwcm92aWRlVGV4dFNlYXJjaFJlc3VsdHMocXVlcnk6IHZzY29kZS5UZXh0U2VhcmNoUXVlcnksIG9wdGlvbnM6IHZzY29kZS5UZXh0U2VhcmNoT3B0aW9ucywgcHJvZ3Jlc3M6IHZzY29kZS5Qcm9ncmVzczx2c2NvZGUuVGV4dFNlYXJjaFJlc3VsdD4sIHRva2VuOiB2c2NvZGUuQ2FuY2VsbGF0aW9uVG9rZW4pOiBQcm9taXNlPHZzY29kZS5UZXh0U2VhcmNoQ29tcGxldGU+IHtcblx0XHRcdFx0XHRyZXR1cm4gUHJvbWlzZS5yZXNvbHZlKG51bGwhKTtcblx0XHRcdFx0fVxuXHRcdFx0fSk7XG5cblx0XHRcdGNvbnN0IHsgcmVzdWx0cywgc3RhdHMgfSA9IGF3YWl0IHJ1blRleHRTZWFyY2goZ2V0U2ltcGxlUXVlcnkoJ2ZvbycpKTtcblx0XHRcdGFzc2VydCghc3RhdHMubGltaXRIaXQpO1xuXHRcdFx0YXNzZXJ0KCFyZXN1bHRzLmxlbmd0aCk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdiYXNpYyByZXN1bHRzJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgcHJvdmlkZWRSZXN1bHRzOiB2c2NvZGUuVGV4dFNlYXJjaFJlc3VsdFtdID0gW1xuXHRcdFx0XHRtYWtlVGV4dFJlc3VsdChyb290Rm9sZGVyQSwgJ2ZpbGUxLnRzJyksXG5cdFx0XHRcdG1ha2VUZXh0UmVzdWx0KHJvb3RGb2xkZXJBLCAnZmlsZTIudHMnKVxuXHRcdFx0XTtcblxuXHRcdFx0YXdhaXQgcmVnaXN0ZXJUZXN0VGV4dFNlYXJjaFByb3ZpZGVyKHtcblx0XHRcdFx0cHJvdmlkZVRleHRTZWFyY2hSZXN1bHRzKHF1ZXJ5OiB2c2NvZGUuVGV4dFNlYXJjaFF1ZXJ5LCBvcHRpb25zOiB2c2NvZGUuVGV4dFNlYXJjaE9wdGlvbnMsIHByb2dyZXNzOiB2c2NvZGUuUHJvZ3Jlc3M8dnNjb2RlLlRleHRTZWFyY2hSZXN1bHQ+LCB0b2tlbjogdnNjb2RlLkNhbmNlbGxhdGlvblRva2VuKTogUHJvbWlzZTx2c2NvZGUuVGV4dFNlYXJjaENvbXBsZXRlPiB7XG5cdFx0XHRcdFx0cHJvdmlkZWRSZXN1bHRzLmZvckVhY2gociA9PiBwcm9ncmVzcy5yZXBvcnQocikpO1xuXHRcdFx0XHRcdHJldHVybiBQcm9taXNlLnJlc29sdmUobnVsbCEpO1xuXHRcdFx0XHR9XG5cdFx0XHR9KTtcblxuXHRcdFx0Y29uc3QgeyByZXN1bHRzLCBzdGF0cyB9ID0gYXdhaXQgcnVuVGV4dFNlYXJjaChnZXRTaW1wbGVRdWVyeSgnZm9vJykpO1xuXHRcdFx0YXNzZXJ0KCFzdGF0cy5saW1pdEhpdCk7XG5cdFx0XHRhc3NlcnRSZXN1bHRzKHJlc3VsdHMsIHByb3ZpZGVkUmVzdWx0cyk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdhbGwgcHJvdmlkZXIgY2FsbHMgZ2V0IGdsb2JhbCBpbmNsdWRlL2V4Y2x1ZGVzJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0YXdhaXQgcmVnaXN0ZXJUZXN0VGV4dFNlYXJjaFByb3ZpZGVyKHtcblx0XHRcdFx0cHJvdmlkZVRleHRTZWFyY2hSZXN1bHRzKHF1ZXJ5OiB2c2NvZGUuVGV4dFNlYXJjaFF1ZXJ5LCBvcHRpb25zOiB2c2NvZGUuVGV4dFNlYXJjaE9wdGlvbnMsIHByb2dyZXNzOiB2c2NvZGUuUHJvZ3Jlc3M8dnNjb2RlLlRleHRTZWFyY2hSZXN1bHQ+LCB0b2tlbjogdnNjb2RlLkNhbmNlbGxhdGlvblRva2VuKTogUHJvbWlzZTx2c2NvZGUuVGV4dFNlYXJjaENvbXBsZXRlPiB7XG5cdFx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG9wdGlvbnMuaW5jbHVkZXMubGVuZ3RoLCAxKTtcblx0XHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwob3B0aW9ucy5leGNsdWRlcy5sZW5ndGgsIDEpO1xuXHRcdFx0XHRcdHJldHVybiBQcm9taXNlLnJlc29sdmUobnVsbCEpO1xuXHRcdFx0XHR9XG5cdFx0XHR9KTtcblxuXHRcdFx0Y29uc3QgcXVlcnk6IElUZXh0UXVlcnkgPSB7XG5cdFx0XHRcdHR5cGU6IFF1ZXJ5VHlwZS5UZXh0LFxuXHRcdFx0XHRjb250ZW50UGF0dGVybjogZ2V0UGF0dGVybignZm9vJyksXG5cblx0XHRcdFx0aW5jbHVkZVBhdHRlcm46IHtcblx0XHRcdFx0XHQnKi50cyc6IHRydWVcblx0XHRcdFx0fSxcblxuXHRcdFx0XHRleGNsdWRlUGF0dGVybjoge1xuXHRcdFx0XHRcdCcqLmpzJzogdHJ1ZVxuXHRcdFx0XHR9LFxuXG5cdFx0XHRcdGZvbGRlclF1ZXJpZXM6IFtcblx0XHRcdFx0XHR7IGZvbGRlcjogcm9vdEZvbGRlckEgfSxcblx0XHRcdFx0XHR7IGZvbGRlcjogcm9vdEZvbGRlckIgfVxuXHRcdFx0XHRdXG5cdFx0XHR9O1xuXG5cdFx0XHRhd2FpdCBydW5UZXh0U2VhcmNoKHF1ZXJ5KTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2dsb2JhbC9sb2NhbCBpbmNsdWRlL2V4Y2x1ZGVzIGNvbWJpbmVkJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0YXdhaXQgcmVnaXN0ZXJUZXN0VGV4dFNlYXJjaFByb3ZpZGVyKHtcblx0XHRcdFx0cHJvdmlkZVRleHRTZWFyY2hSZXN1bHRzKHF1ZXJ5OiB2c2NvZGUuVGV4dFNlYXJjaFF1ZXJ5LCBvcHRpb25zOiB2c2NvZGUuVGV4dFNlYXJjaE9wdGlvbnMsIHByb2dyZXNzOiB2c2NvZGUuUHJvZ3Jlc3M8dnNjb2RlLlRleHRTZWFyY2hSZXN1bHQ+LCB0b2tlbjogdnNjb2RlLkNhbmNlbGxhdGlvblRva2VuKTogUHJvbWlzZTx2c2NvZGUuVGV4dFNlYXJjaENvbXBsZXRlPiB7XG5cdFx0XHRcdFx0aWYgKG9wdGlvbnMuZm9sZGVyLnRvU3RyaW5nKCkgPT09IHJvb3RGb2xkZXJBLnRvU3RyaW5nKCkpIHtcblx0XHRcdFx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwob3B0aW9ucy5pbmNsdWRlcy5zb3J0KCksIFsnKi50cycsICdmb28nXSk7XG5cdFx0XHRcdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKG9wdGlvbnMuZXhjbHVkZXMuc29ydCgpLCBbJyouanMnLCAnYmFyJ10pO1xuXHRcdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKG9wdGlvbnMuaW5jbHVkZXMuc29ydCgpLCBbJyoudHMnXSk7XG5cdFx0XHRcdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKG9wdGlvbnMuZXhjbHVkZXMuc29ydCgpLCBbJyouanMnXSk7XG5cdFx0XHRcdFx0fVxuXG5cdFx0XHRcdFx0cmV0dXJuIFByb21pc2UucmVzb2x2ZShudWxsISk7XG5cdFx0XHRcdH1cblx0XHRcdH0pO1xuXG5cdFx0XHRjb25zdCBxdWVyeTogSVRleHRRdWVyeSA9IHtcblx0XHRcdFx0dHlwZTogUXVlcnlUeXBlLlRleHQsXG5cdFx0XHRcdGNvbnRlbnRQYXR0ZXJuOiBnZXRQYXR0ZXJuKCdmb28nKSxcblxuXHRcdFx0XHRpbmNsdWRlUGF0dGVybjoge1xuXHRcdFx0XHRcdCcqLnRzJzogdHJ1ZVxuXHRcdFx0XHR9LFxuXHRcdFx0XHRleGNsdWRlUGF0dGVybjoge1xuXHRcdFx0XHRcdCcqLmpzJzogdHJ1ZVxuXHRcdFx0XHR9LFxuXHRcdFx0XHRmb2xkZXJRdWVyaWVzOiBbXG5cdFx0XHRcdFx0e1xuXHRcdFx0XHRcdFx0Zm9sZGVyOiByb290Rm9sZGVyQSxcblx0XHRcdFx0XHRcdGluY2x1ZGVQYXR0ZXJuOiB7XG5cdFx0XHRcdFx0XHRcdCdmb28nOiB0cnVlXG5cdFx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdFx0ZXhjbHVkZVBhdHRlcm46IFt7XG5cdFx0XHRcdFx0XHRcdHBhdHRlcm46IHtcblx0XHRcdFx0XHRcdFx0XHQnYmFyJzogdHJ1ZVxuXHRcdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHR9XVxuXHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0eyBmb2xkZXI6IHJvb3RGb2xkZXJCIH1cblx0XHRcdFx0XVxuXHRcdFx0fTtcblxuXHRcdFx0YXdhaXQgcnVuVGV4dFNlYXJjaChxdWVyeSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdpbmNsdWRlL2V4Y2x1ZGVzIHJlc29sdmVkIGNvcnJlY3RseScsIGFzeW5jICgpID0+IHtcblx0XHRcdGF3YWl0IHJlZ2lzdGVyVGVzdFRleHRTZWFyY2hQcm92aWRlcih7XG5cdFx0XHRcdHByb3ZpZGVUZXh0U2VhcmNoUmVzdWx0cyhxdWVyeTogdnNjb2RlLlRleHRTZWFyY2hRdWVyeSwgb3B0aW9uczogdnNjb2RlLlRleHRTZWFyY2hPcHRpb25zLCBwcm9ncmVzczogdnNjb2RlLlByb2dyZXNzPHZzY29kZS5UZXh0U2VhcmNoUmVzdWx0PiwgdG9rZW46IHZzY29kZS5DYW5jZWxsYXRpb25Ub2tlbik6IFByb21pc2U8dnNjb2RlLlRleHRTZWFyY2hDb21wbGV0ZT4ge1xuXHRcdFx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwob3B0aW9ucy5pbmNsdWRlcy5zb3J0KCksIFsnKi5qc3gnLCAnKi50cyddKTtcblx0XHRcdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKG9wdGlvbnMuZXhjbHVkZXMuc29ydCgpLCBbXSk7XG5cblx0XHRcdFx0XHRyZXR1cm4gUHJvbWlzZS5yZXNvbHZlKG51bGwhKTtcblx0XHRcdFx0fVxuXHRcdFx0fSk7XG5cblx0XHRcdGNvbnN0IHF1ZXJ5OiBJU2VhcmNoUXVlcnkgPSB7XG5cdFx0XHRcdHR5cGU6IFF1ZXJ5VHlwZS5UZXh0LFxuXHRcdFx0XHRjb250ZW50UGF0dGVybjogZ2V0UGF0dGVybignZm9vJyksXG5cblx0XHRcdFx0aW5jbHVkZVBhdHRlcm46IHtcblx0XHRcdFx0XHQnKi50cyc6IHRydWUsXG5cdFx0XHRcdFx0JyouanN4JzogZmFsc2Vcblx0XHRcdFx0fSxcblx0XHRcdFx0ZXhjbHVkZVBhdHRlcm46IHtcblx0XHRcdFx0XHQnKi5qcyc6IHRydWUsXG5cdFx0XHRcdFx0JyoudHN4JzogZmFsc2Vcblx0XHRcdFx0fSxcblx0XHRcdFx0Zm9sZGVyUXVlcmllczogW1xuXHRcdFx0XHRcdHtcblx0XHRcdFx0XHRcdGZvbGRlcjogcm9vdEZvbGRlckEsXG5cdFx0XHRcdFx0XHRpbmNsdWRlUGF0dGVybjoge1xuXHRcdFx0XHRcdFx0XHQnKi5qc3gnOiB0cnVlXG5cdFx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdFx0ZXhjbHVkZVBhdHRlcm46IFt7XG5cdFx0XHRcdFx0XHRcdHBhdHRlcm46IHtcblx0XHRcdFx0XHRcdFx0XHQnKi5qcyc6IGZhbHNlXG5cdFx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdH1dXG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRdXG5cdFx0XHR9O1xuXG5cdFx0XHRhd2FpdCBydW5UZXh0U2VhcmNoKHF1ZXJ5KTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3Byb3ZpZGVyIGZhaWwnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRhd2FpdCByZWdpc3RlclRlc3RUZXh0U2VhcmNoUHJvdmlkZXIoe1xuXHRcdFx0XHRwcm92aWRlVGV4dFNlYXJjaFJlc3VsdHMocXVlcnk6IHZzY29kZS5UZXh0U2VhcmNoUXVlcnksIG9wdGlvbnM6IHZzY29kZS5UZXh0U2VhcmNoT3B0aW9ucywgcHJvZ3Jlc3M6IHZzY29kZS5Qcm9ncmVzczx2c2NvZGUuVGV4dFNlYXJjaFJlc3VsdD4sIHRva2VuOiB2c2NvZGUuQ2FuY2VsbGF0aW9uVG9rZW4pOiBQcm9taXNlPHZzY29kZS5UZXh0U2VhcmNoQ29tcGxldGU+IHtcblx0XHRcdFx0XHR0aHJvdyBuZXcgRXJyb3IoJ1Byb3ZpZGVyIGZhaWwnKTtcblx0XHRcdFx0fVxuXHRcdFx0fSk7XG5cblx0XHRcdHRyeSB7XG5cdFx0XHRcdGF3YWl0IHJ1blRleHRTZWFyY2goZ2V0U2ltcGxlUXVlcnkoJ2ZvbycpKTtcblx0XHRcdFx0YXNzZXJ0KGZhbHNlLCAnRXhwZWN0ZWQgdG8gZmFpbCcpO1xuXHRcdFx0fSBjYXRjaCB7XG5cdFx0XHRcdC8vIGV4cGVjdGVkIHRvIGZhaWxcblx0XHRcdH1cblx0XHR9KTtcblxuXHRcdHRlc3QoJ2Jhc2ljIHNpYmxpbmcgY2xhdXNlJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Ly8gZXNsaW50LWRpc2FibGUtbmV4dC1saW5lIGxvY2FsL2NvZGUtbm8tYW55LWNhc3RzXG5cdFx0XHQobW9ja1BGUyBhcyBhbnkpLlByb21pc2VzID0ge1xuXHRcdFx0XHRyZWFkZGlyOiAoX3BhdGg6IHN0cmluZyk6IGFueSA9PiB7XG5cdFx0XHRcdFx0aWYgKF9wYXRoID09PSByb290Rm9sZGVyQS5mc1BhdGgpIHtcblx0XHRcdFx0XHRcdHJldHVybiBQcm9taXNlLnJlc29sdmUoW1xuXHRcdFx0XHRcdFx0XHQnZmlsZTEuanMnLFxuXHRcdFx0XHRcdFx0XHQnZmlsZTEudHMnXG5cdFx0XHRcdFx0XHRdKTtcblx0XHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdFx0cmV0dXJuIFByb21pc2UucmVqZWN0KG5ldyBFcnJvcignV3JvbmcgcGF0aCcpKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdH07XG5cblx0XHRcdGNvbnN0IHByb3ZpZGVkUmVzdWx0czogdnNjb2RlLlRleHRTZWFyY2hSZXN1bHRbXSA9IFtcblx0XHRcdFx0bWFrZVRleHRSZXN1bHQocm9vdEZvbGRlckEsICdmaWxlMS5qcycpLFxuXHRcdFx0XHRtYWtlVGV4dFJlc3VsdChyb290Rm9sZGVyQSwgJ2ZpbGUxLnRzJylcblx0XHRcdF07XG5cblx0XHRcdGF3YWl0IHJlZ2lzdGVyVGVzdFRleHRTZWFyY2hQcm92aWRlcih7XG5cdFx0XHRcdHByb3ZpZGVUZXh0U2VhcmNoUmVzdWx0cyhxdWVyeTogdnNjb2RlLlRleHRTZWFyY2hRdWVyeSwgb3B0aW9uczogdnNjb2RlLlRleHRTZWFyY2hPcHRpb25zLCBwcm9ncmVzczogdnNjb2RlLlByb2dyZXNzPHZzY29kZS5UZXh0U2VhcmNoUmVzdWx0PiwgdG9rZW46IHZzY29kZS5DYW5jZWxsYXRpb25Ub2tlbik6IFByb21pc2U8dnNjb2RlLlRleHRTZWFyY2hDb21wbGV0ZT4ge1xuXHRcdFx0XHRcdHByb3ZpZGVkUmVzdWx0cy5mb3JFYWNoKHIgPT4gcHJvZ3Jlc3MucmVwb3J0KHIpKTtcblx0XHRcdFx0XHRyZXR1cm4gUHJvbWlzZS5yZXNvbHZlKG51bGwhKTtcblx0XHRcdFx0fVxuXHRcdFx0fSk7XG5cblx0XHRcdGNvbnN0IHF1ZXJ5OiBJU2VhcmNoUXVlcnkgPSB7XG5cdFx0XHRcdHR5cGU6IFF1ZXJ5VHlwZS5UZXh0LFxuXHRcdFx0XHRjb250ZW50UGF0dGVybjogZ2V0UGF0dGVybignZm9vJyksXG5cblx0XHRcdFx0ZXhjbHVkZVBhdHRlcm46IHtcblx0XHRcdFx0XHQnKi5qcyc6IHtcblx0XHRcdFx0XHRcdHdoZW46ICckKGJhc2VuYW1lKS50cydcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH0sXG5cblx0XHRcdFx0Zm9sZGVyUXVlcmllczogW1xuXHRcdFx0XHRcdHsgZm9sZGVyOiByb290Rm9sZGVyQSB9XG5cdFx0XHRcdF1cblx0XHRcdH07XG5cblx0XHRcdGNvbnN0IHsgcmVzdWx0cyB9ID0gYXdhaXQgcnVuVGV4dFNlYXJjaChxdWVyeSk7XG5cdFx0XHRhc3NlcnRSZXN1bHRzKHJlc3VsdHMsIHByb3ZpZGVkUmVzdWx0cy5zbGljZSgxKSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdtdWx0aXJvb3Qgc2libGluZyBjbGF1c2UnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHQvLyBlc2xpbnQtZGlzYWJsZS1uZXh0LWxpbmUgbG9jYWwvY29kZS1uby1hbnktY2FzdHNcblx0XHRcdChtb2NrUEZTIGFzIGFueSkuUHJvbWlzZXMgPSB7XG5cdFx0XHRcdHJlYWRkaXI6IChfcGF0aDogc3RyaW5nKTogYW55ID0+IHtcblx0XHRcdFx0XHRpZiAoX3BhdGggPT09IGpvaW5QYXRoKHJvb3RGb2xkZXJBLCAnZm9sZGVyJykuZnNQYXRoKSB7XG5cdFx0XHRcdFx0XHRyZXR1cm4gUHJvbWlzZS5yZXNvbHZlKFtcblx0XHRcdFx0XHRcdFx0J2ZpbGVBLnNjc3MnLFxuXHRcdFx0XHRcdFx0XHQnZmlsZUEuY3NzJyxcblx0XHRcdFx0XHRcdFx0J2ZpbGUyLmNzcydcblx0XHRcdFx0XHRcdF0pO1xuXHRcdFx0XHRcdH0gZWxzZSBpZiAoX3BhdGggPT09IHJvb3RGb2xkZXJCLmZzUGF0aCkge1xuXHRcdFx0XHRcdFx0cmV0dXJuIFByb21pc2UucmVzb2x2ZShbXG5cdFx0XHRcdFx0XHRcdCdmaWxlQi50cycsXG5cdFx0XHRcdFx0XHRcdCdmaWxlQi5qcycsXG5cdFx0XHRcdFx0XHRcdCdmaWxlMy5qcydcblx0XHRcdFx0XHRcdF0pO1xuXHRcdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0XHRyZXR1cm4gUHJvbWlzZS5yZWplY3QobmV3IEVycm9yKCdXcm9uZyBwYXRoJykpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0fTtcblxuXHRcdFx0YXdhaXQgcmVnaXN0ZXJUZXN0VGV4dFNlYXJjaFByb3ZpZGVyKHtcblx0XHRcdFx0cHJvdmlkZVRleHRTZWFyY2hSZXN1bHRzKHF1ZXJ5OiB2c2NvZGUuVGV4dFNlYXJjaFF1ZXJ5LCBvcHRpb25zOiB2c2NvZGUuVGV4dFNlYXJjaE9wdGlvbnMsIHByb2dyZXNzOiB2c2NvZGUuUHJvZ3Jlc3M8dnNjb2RlLlRleHRTZWFyY2hSZXN1bHQ+LCB0b2tlbjogdnNjb2RlLkNhbmNlbGxhdGlvblRva2VuKTogUHJvbWlzZTx2c2NvZGUuVGV4dFNlYXJjaENvbXBsZXRlPiB7XG5cdFx0XHRcdFx0bGV0IHJlcG9ydGVkUmVzdWx0cztcblx0XHRcdFx0XHRpZiAob3B0aW9ucy5mb2xkZXIuZnNQYXRoID09PSByb290Rm9sZGVyQS5mc1BhdGgpIHtcblx0XHRcdFx0XHRcdHJlcG9ydGVkUmVzdWx0cyA9IFtcblx0XHRcdFx0XHRcdFx0bWFrZVRleHRSZXN1bHQocm9vdEZvbGRlckEsICdmb2xkZXIvZmlsZUEuc2NzcycpLFxuXHRcdFx0XHRcdFx0XHRtYWtlVGV4dFJlc3VsdChyb290Rm9sZGVyQSwgJ2ZvbGRlci9maWxlQS5jc3MnKSxcblx0XHRcdFx0XHRcdFx0bWFrZVRleHRSZXN1bHQocm9vdEZvbGRlckEsICdmb2xkZXIvZmlsZTIuY3NzJylcblx0XHRcdFx0XHRcdF07XG5cdFx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRcdHJlcG9ydGVkUmVzdWx0cyA9IFtcblx0XHRcdFx0XHRcdFx0bWFrZVRleHRSZXN1bHQocm9vdEZvbGRlckIsICdmaWxlQi50cycpLFxuXHRcdFx0XHRcdFx0XHRtYWtlVGV4dFJlc3VsdChyb290Rm9sZGVyQiwgJ2ZpbGVCLmpzJyksXG5cdFx0XHRcdFx0XHRcdG1ha2VUZXh0UmVzdWx0KHJvb3RGb2xkZXJCLCAnZmlsZTMuanMnKVxuXHRcdFx0XHRcdFx0XTtcblx0XHRcdFx0XHR9XG5cblx0XHRcdFx0XHRyZXBvcnRlZFJlc3VsdHMuZm9yRWFjaChyID0+IHByb2dyZXNzLnJlcG9ydChyKSk7XG5cdFx0XHRcdFx0cmV0dXJuIFByb21pc2UucmVzb2x2ZShudWxsISk7XG5cdFx0XHRcdH1cblx0XHRcdH0pO1xuXG5cdFx0XHRjb25zdCBxdWVyeTogSVNlYXJjaFF1ZXJ5ID0ge1xuXHRcdFx0XHR0eXBlOiBRdWVyeVR5cGUuVGV4dCxcblx0XHRcdFx0Y29udGVudFBhdHRlcm46IGdldFBhdHRlcm4oJ2ZvbycpLFxuXG5cdFx0XHRcdGV4Y2x1ZGVQYXR0ZXJuOiB7XG5cdFx0XHRcdFx0JyouanMnOiB7XG5cdFx0XHRcdFx0XHR3aGVuOiAnJChiYXNlbmFtZSkudHMnXG5cdFx0XHRcdFx0fSxcblx0XHRcdFx0XHQnKi5jc3MnOiB0cnVlXG5cdFx0XHRcdH0sXG5cdFx0XHRcdGZvbGRlclF1ZXJpZXM6IFtcblx0XHRcdFx0XHR7XG5cdFx0XHRcdFx0XHRmb2xkZXI6IHJvb3RGb2xkZXJBLFxuXHRcdFx0XHRcdFx0ZXhjbHVkZVBhdHRlcm46IFt7XG5cdFx0XHRcdFx0XHRcdHBhdHRlcm46IHtcblx0XHRcdFx0XHRcdFx0XHQnZm9sZGVyLyouY3NzJzoge1xuXHRcdFx0XHRcdFx0XHRcdFx0d2hlbjogJyQoYmFzZW5hbWUpLnNjc3MnXG5cdFx0XHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHR9XVxuXHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0e1xuXHRcdFx0XHRcdFx0Zm9sZGVyOiByb290Rm9sZGVyQixcblx0XHRcdFx0XHRcdGV4Y2x1ZGVQYXR0ZXJuOiBbe1xuXHRcdFx0XHRcdFx0XHRwYXR0ZXJuOiB7XG5cdFx0XHRcdFx0XHRcdFx0JyouanMnOiBmYWxzZVxuXHRcdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHR9XVxuXHRcdFx0XHRcdH1cblx0XHRcdFx0XVxuXHRcdFx0fTtcblxuXHRcdFx0Y29uc3QgeyByZXN1bHRzIH0gPSBhd2FpdCBydW5UZXh0U2VhcmNoKHF1ZXJ5KTtcblx0XHRcdGFzc2VydFJlc3VsdHMocmVzdWx0cywgW1xuXHRcdFx0XHRtYWtlVGV4dFJlc3VsdChyb290Rm9sZGVyQSwgJ2ZvbGRlci9maWxlQS5zY3NzJyksXG5cdFx0XHRcdG1ha2VUZXh0UmVzdWx0KHJvb3RGb2xkZXJBLCAnZm9sZGVyL2ZpbGUyLmNzcycpLFxuXHRcdFx0XHRtYWtlVGV4dFJlc3VsdChyb290Rm9sZGVyQiwgJ2ZpbGVCLnRzJyksXG5cdFx0XHRcdG1ha2VUZXh0UmVzdWx0KHJvb3RGb2xkZXJCLCAnZmlsZUIuanMnKSxcblx0XHRcdFx0bWFrZVRleHRSZXN1bHQocm9vdEZvbGRlckIsICdmaWxlMy5qcycpXSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdpbmNsdWRlIHBhdHRlcm4gYXBwbGllZCcsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IHByb3ZpZGVkUmVzdWx0czogdnNjb2RlLlRleHRTZWFyY2hSZXN1bHRbXSA9IFtcblx0XHRcdFx0bWFrZVRleHRSZXN1bHQocm9vdEZvbGRlckEsICdmaWxlMS5qcycpLFxuXHRcdFx0XHRtYWtlVGV4dFJlc3VsdChyb290Rm9sZGVyQSwgJ2ZpbGUxLnRzJylcblx0XHRcdF07XG5cblx0XHRcdGF3YWl0IHJlZ2lzdGVyVGVzdFRleHRTZWFyY2hQcm92aWRlcih7XG5cdFx0XHRcdHByb3ZpZGVUZXh0U2VhcmNoUmVzdWx0cyhxdWVyeTogdnNjb2RlLlRleHRTZWFyY2hRdWVyeSwgb3B0aW9uczogdnNjb2RlLlRleHRTZWFyY2hPcHRpb25zLCBwcm9ncmVzczogdnNjb2RlLlByb2dyZXNzPHZzY29kZS5UZXh0U2VhcmNoUmVzdWx0PiwgdG9rZW46IHZzY29kZS5DYW5jZWxsYXRpb25Ub2tlbik6IFByb21pc2U8dnNjb2RlLlRleHRTZWFyY2hDb21wbGV0ZT4ge1xuXHRcdFx0XHRcdHByb3ZpZGVkUmVzdWx0cy5mb3JFYWNoKHIgPT4gcHJvZ3Jlc3MucmVwb3J0KHIpKTtcblx0XHRcdFx0XHRyZXR1cm4gUHJvbWlzZS5yZXNvbHZlKG51bGwhKTtcblx0XHRcdFx0fVxuXHRcdFx0fSk7XG5cblx0XHRcdGNvbnN0IHF1ZXJ5OiBJU2VhcmNoUXVlcnkgPSB7XG5cdFx0XHRcdHR5cGU6IFF1ZXJ5VHlwZS5UZXh0LFxuXHRcdFx0XHRjb250ZW50UGF0dGVybjogZ2V0UGF0dGVybignZm9vJyksXG5cblx0XHRcdFx0aW5jbHVkZVBhdHRlcm46IHtcblx0XHRcdFx0XHQnKi50cyc6IHRydWVcblx0XHRcdFx0fSxcblxuXHRcdFx0XHRmb2xkZXJRdWVyaWVzOiBbXG5cdFx0XHRcdFx0eyBmb2xkZXI6IHJvb3RGb2xkZXJBIH1cblx0XHRcdFx0XVxuXHRcdFx0fTtcblxuXHRcdFx0Y29uc3QgeyByZXN1bHRzIH0gPSBhd2FpdCBydW5UZXh0U2VhcmNoKHF1ZXJ5KTtcblx0XHRcdGFzc2VydFJlc3VsdHMocmVzdWx0cywgcHJvdmlkZWRSZXN1bHRzLnNsaWNlKDEpKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ21heCByZXN1bHRzID0gMScsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IHByb3ZpZGVkUmVzdWx0czogdnNjb2RlLlRleHRTZWFyY2hSZXN1bHRbXSA9IFtcblx0XHRcdFx0bWFrZVRleHRSZXN1bHQocm9vdEZvbGRlckEsICdmaWxlMS50cycpLFxuXHRcdFx0XHRtYWtlVGV4dFJlc3VsdChyb290Rm9sZGVyQSwgJ2ZpbGUyLnRzJylcblx0XHRcdF07XG5cblx0XHRcdGxldCB3YXNDYW5jZWxlZCA9IGZhbHNlO1xuXHRcdFx0YXdhaXQgcmVnaXN0ZXJUZXN0VGV4dFNlYXJjaFByb3ZpZGVyKHtcblx0XHRcdFx0cHJvdmlkZVRleHRTZWFyY2hSZXN1bHRzKHF1ZXJ5OiB2c2NvZGUuVGV4dFNlYXJjaFF1ZXJ5LCBvcHRpb25zOiB2c2NvZGUuVGV4dFNlYXJjaE9wdGlvbnMsIHByb2dyZXNzOiB2c2NvZGUuUHJvZ3Jlc3M8dnNjb2RlLlRleHRTZWFyY2hSZXN1bHQ+LCB0b2tlbjogdnNjb2RlLkNhbmNlbGxhdGlvblRva2VuKTogUHJvbWlzZTx2c2NvZGUuVGV4dFNlYXJjaENvbXBsZXRlPiB7XG5cdFx0XHRcdFx0ZGlzcG9zYWJsZXMuYWRkKHRva2VuLm9uQ2FuY2VsbGF0aW9uUmVxdWVzdGVkKCgpID0+IHdhc0NhbmNlbGVkID0gdHJ1ZSkpO1xuXHRcdFx0XHRcdHByb3ZpZGVkUmVzdWx0cy5mb3JFYWNoKHIgPT4gcHJvZ3Jlc3MucmVwb3J0KHIpKTtcblx0XHRcdFx0XHRyZXR1cm4gUHJvbWlzZS5yZXNvbHZlKG51bGwhKTtcblx0XHRcdFx0fVxuXHRcdFx0fSk7XG5cblx0XHRcdGNvbnN0IHF1ZXJ5OiBJU2VhcmNoUXVlcnkgPSB7XG5cdFx0XHRcdHR5cGU6IFF1ZXJ5VHlwZS5UZXh0LFxuXHRcdFx0XHRjb250ZW50UGF0dGVybjogZ2V0UGF0dGVybignZm9vJyksXG5cblx0XHRcdFx0bWF4UmVzdWx0czogMSxcblxuXHRcdFx0XHRmb2xkZXJRdWVyaWVzOiBbXG5cdFx0XHRcdFx0eyBmb2xkZXI6IHJvb3RGb2xkZXJBIH1cblx0XHRcdFx0XVxuXHRcdFx0fTtcblxuXHRcdFx0Y29uc3QgeyByZXN1bHRzLCBzdGF0cyB9ID0gYXdhaXQgcnVuVGV4dFNlYXJjaChxdWVyeSk7XG5cdFx0XHRhc3NlcnQoc3RhdHMubGltaXRIaXQsICdFeHBlY3RlZCB0byByZXR1cm4gbGltaXRIaXQnKTtcblx0XHRcdGFzc2VydFJlc3VsdHMocmVzdWx0cywgcHJvdmlkZWRSZXN1bHRzLnNsaWNlKDAsIDEpKTtcblx0XHRcdGFzc2VydCh3YXNDYW5jZWxlZCwgJ0V4cGVjdGVkIHRvIGJlIGNhbmNlbGVkJyk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdtYXggcmVzdWx0cyA9IDInLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCBwcm92aWRlZFJlc3VsdHM6IHZzY29kZS5UZXh0U2VhcmNoUmVzdWx0W10gPSBbXG5cdFx0XHRcdG1ha2VUZXh0UmVzdWx0KHJvb3RGb2xkZXJBLCAnZmlsZTEudHMnKSxcblx0XHRcdFx0bWFrZVRleHRSZXN1bHQocm9vdEZvbGRlckEsICdmaWxlMi50cycpLFxuXHRcdFx0XHRtYWtlVGV4dFJlc3VsdChyb290Rm9sZGVyQSwgJ2ZpbGUzLnRzJylcblx0XHRcdF07XG5cblx0XHRcdGxldCB3YXNDYW5jZWxlZCA9IGZhbHNlO1xuXHRcdFx0YXdhaXQgcmVnaXN0ZXJUZXN0VGV4dFNlYXJjaFByb3ZpZGVyKHtcblx0XHRcdFx0cHJvdmlkZVRleHRTZWFyY2hSZXN1bHRzKHF1ZXJ5OiB2c2NvZGUuVGV4dFNlYXJjaFF1ZXJ5LCBvcHRpb25zOiB2c2NvZGUuVGV4dFNlYXJjaE9wdGlvbnMsIHByb2dyZXNzOiB2c2NvZGUuUHJvZ3Jlc3M8dnNjb2RlLlRleHRTZWFyY2hSZXN1bHQ+LCB0b2tlbjogdnNjb2RlLkNhbmNlbGxhdGlvblRva2VuKTogUHJvbWlzZTx2c2NvZGUuVGV4dFNlYXJjaENvbXBsZXRlPiB7XG5cdFx0XHRcdFx0ZGlzcG9zYWJsZXMuYWRkKHRva2VuLm9uQ2FuY2VsbGF0aW9uUmVxdWVzdGVkKCgpID0+IHdhc0NhbmNlbGVkID0gdHJ1ZSkpO1xuXHRcdFx0XHRcdHByb3ZpZGVkUmVzdWx0cy5mb3JFYWNoKHIgPT4gcHJvZ3Jlc3MucmVwb3J0KHIpKTtcblx0XHRcdFx0XHRyZXR1cm4gUHJvbWlzZS5yZXNvbHZlKG51bGwhKTtcblx0XHRcdFx0fVxuXHRcdFx0fSk7XG5cblx0XHRcdGNvbnN0IHF1ZXJ5OiBJU2VhcmNoUXVlcnkgPSB7XG5cdFx0XHRcdHR5cGU6IFF1ZXJ5VHlwZS5UZXh0LFxuXHRcdFx0XHRjb250ZW50UGF0dGVybjogZ2V0UGF0dGVybignZm9vJyksXG5cblx0XHRcdFx0bWF4UmVzdWx0czogMixcblxuXHRcdFx0XHRmb2xkZXJRdWVyaWVzOiBbXG5cdFx0XHRcdFx0eyBmb2xkZXI6IHJvb3RGb2xkZXJBIH1cblx0XHRcdFx0XVxuXHRcdFx0fTtcblxuXHRcdFx0Y29uc3QgeyByZXN1bHRzLCBzdGF0cyB9ID0gYXdhaXQgcnVuVGV4dFNlYXJjaChxdWVyeSk7XG5cdFx0XHRhc3NlcnQoc3RhdHMubGltaXRIaXQsICdFeHBlY3RlZCB0byByZXR1cm4gbGltaXRIaXQnKTtcblx0XHRcdGFzc2VydFJlc3VsdHMocmVzdWx0cywgcHJvdmlkZWRSZXN1bHRzLnNsaWNlKDAsIDIpKTtcblx0XHRcdGFzc2VydCh3YXNDYW5jZWxlZCwgJ0V4cGVjdGVkIHRvIGJlIGNhbmNlbGVkJyk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdwcm92aWRlciByZXR1cm5zIG1heFJlc3VsdHMgZXhhY3RseScsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IHByb3ZpZGVkUmVzdWx0czogdnNjb2RlLlRleHRTZWFyY2hSZXN1bHRbXSA9IFtcblx0XHRcdFx0bWFrZVRleHRSZXN1bHQocm9vdEZvbGRlckEsICdmaWxlMS50cycpLFxuXHRcdFx0XHRtYWtlVGV4dFJlc3VsdChyb290Rm9sZGVyQSwgJ2ZpbGUyLnRzJylcblx0XHRcdF07XG5cblx0XHRcdGxldCB3YXNDYW5jZWxlZCA9IGZhbHNlO1xuXHRcdFx0YXdhaXQgcmVnaXN0ZXJUZXN0VGV4dFNlYXJjaFByb3ZpZGVyKHtcblx0XHRcdFx0cHJvdmlkZVRleHRTZWFyY2hSZXN1bHRzKHF1ZXJ5OiB2c2NvZGUuVGV4dFNlYXJjaFF1ZXJ5LCBvcHRpb25zOiB2c2NvZGUuVGV4dFNlYXJjaE9wdGlvbnMsIHByb2dyZXNzOiB2c2NvZGUuUHJvZ3Jlc3M8dnNjb2RlLlRleHRTZWFyY2hSZXN1bHQ+LCB0b2tlbjogdnNjb2RlLkNhbmNlbGxhdGlvblRva2VuKTogUHJvbWlzZTx2c2NvZGUuVGV4dFNlYXJjaENvbXBsZXRlPiB7XG5cdFx0XHRcdFx0ZGlzcG9zYWJsZXMuYWRkKHRva2VuLm9uQ2FuY2VsbGF0aW9uUmVxdWVzdGVkKCgpID0+IHdhc0NhbmNlbGVkID0gdHJ1ZSkpO1xuXHRcdFx0XHRcdHByb3ZpZGVkUmVzdWx0cy5mb3JFYWNoKHIgPT4gcHJvZ3Jlc3MucmVwb3J0KHIpKTtcblx0XHRcdFx0XHRyZXR1cm4gUHJvbWlzZS5yZXNvbHZlKG51bGwhKTtcblx0XHRcdFx0fVxuXHRcdFx0fSk7XG5cblx0XHRcdGNvbnN0IHF1ZXJ5OiBJU2VhcmNoUXVlcnkgPSB7XG5cdFx0XHRcdHR5cGU6IFF1ZXJ5VHlwZS5UZXh0LFxuXHRcdFx0XHRjb250ZW50UGF0dGVybjogZ2V0UGF0dGVybignZm9vJyksXG5cblx0XHRcdFx0bWF4UmVzdWx0czogMixcblxuXHRcdFx0XHRmb2xkZXJRdWVyaWVzOiBbXG5cdFx0XHRcdFx0eyBmb2xkZXI6IHJvb3RGb2xkZXJBIH1cblx0XHRcdFx0XVxuXHRcdFx0fTtcblxuXHRcdFx0Y29uc3QgeyByZXN1bHRzLCBzdGF0cyB9ID0gYXdhaXQgcnVuVGV4dFNlYXJjaChxdWVyeSk7XG5cdFx0XHRhc3NlcnQoIXN0YXRzLmxpbWl0SGl0LCAnRXhwZWN0ZWQgbm90IHRvIHJldHVybiBsaW1pdEhpdCcpO1xuXHRcdFx0YXNzZXJ0UmVzdWx0cyhyZXN1bHRzLCBwcm92aWRlZFJlc3VsdHMpO1xuXHRcdFx0YXNzZXJ0KCF3YXNDYW5jZWxlZCwgJ0V4cGVjdGVkIG5vdCB0byBiZSBjYW5jZWxlZCcpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgncHJvdmlkZXIgcmV0dXJucyBlYXJseSB3aXRoIGxpbWl0SGl0JywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgcHJvdmlkZWRSZXN1bHRzOiB2c2NvZGUuVGV4dFNlYXJjaFJlc3VsdFtdID0gW1xuXHRcdFx0XHRtYWtlVGV4dFJlc3VsdChyb290Rm9sZGVyQSwgJ2ZpbGUxLnRzJyksXG5cdFx0XHRcdG1ha2VUZXh0UmVzdWx0KHJvb3RGb2xkZXJBLCAnZmlsZTIudHMnKSxcblx0XHRcdFx0bWFrZVRleHRSZXN1bHQocm9vdEZvbGRlckEsICdmaWxlMy50cycpXG5cdFx0XHRdO1xuXG5cdFx0XHRhd2FpdCByZWdpc3RlclRlc3RUZXh0U2VhcmNoUHJvdmlkZXIoe1xuXHRcdFx0XHRwcm92aWRlVGV4dFNlYXJjaFJlc3VsdHMocXVlcnk6IHZzY29kZS5UZXh0U2VhcmNoUXVlcnksIG9wdGlvbnM6IHZzY29kZS5UZXh0U2VhcmNoT3B0aW9ucywgcHJvZ3Jlc3M6IHZzY29kZS5Qcm9ncmVzczx2c2NvZGUuVGV4dFNlYXJjaFJlc3VsdD4sIHRva2VuOiB2c2NvZGUuQ2FuY2VsbGF0aW9uVG9rZW4pOiBQcm9taXNlPHZzY29kZS5UZXh0U2VhcmNoQ29tcGxldGU+IHtcblx0XHRcdFx0XHRwcm92aWRlZFJlc3VsdHMuZm9yRWFjaChyID0+IHByb2dyZXNzLnJlcG9ydChyKSk7XG5cdFx0XHRcdFx0cmV0dXJuIFByb21pc2UucmVzb2x2ZSh7IGxpbWl0SGl0OiB0cnVlIH0pO1xuXHRcdFx0XHR9XG5cdFx0XHR9KTtcblxuXHRcdFx0Y29uc3QgcXVlcnk6IElTZWFyY2hRdWVyeSA9IHtcblx0XHRcdFx0dHlwZTogUXVlcnlUeXBlLlRleHQsXG5cdFx0XHRcdGNvbnRlbnRQYXR0ZXJuOiBnZXRQYXR0ZXJuKCdmb28nKSxcblxuXHRcdFx0XHRtYXhSZXN1bHRzOiAxMDAwLFxuXG5cdFx0XHRcdGZvbGRlclF1ZXJpZXM6IFtcblx0XHRcdFx0XHR7IGZvbGRlcjogcm9vdEZvbGRlckEgfVxuXHRcdFx0XHRdXG5cdFx0XHR9O1xuXG5cdFx0XHRjb25zdCB7IHJlc3VsdHMsIHN0YXRzIH0gPSBhd2FpdCBydW5UZXh0U2VhcmNoKHF1ZXJ5KTtcblx0XHRcdGFzc2VydChzdGF0cy5saW1pdEhpdCwgJ0V4cGVjdGVkIHRvIHJldHVybiBsaW1pdEhpdCcpO1xuXHRcdFx0YXNzZXJ0UmVzdWx0cyhyZXN1bHRzLCBwcm92aWRlZFJlc3VsdHMpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnbXVsdGlyb290IG1heCByZXN1bHRzJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0bGV0IGNhbmNlbHMgPSAwO1xuXHRcdFx0YXdhaXQgcmVnaXN0ZXJUZXN0VGV4dFNlYXJjaFByb3ZpZGVyKHtcblx0XHRcdFx0YXN5bmMgcHJvdmlkZVRleHRTZWFyY2hSZXN1bHRzKHF1ZXJ5OiB2c2NvZGUuVGV4dFNlYXJjaFF1ZXJ5LCBvcHRpb25zOiB2c2NvZGUuVGV4dFNlYXJjaE9wdGlvbnMsIHByb2dyZXNzOiB2c2NvZGUuUHJvZ3Jlc3M8dnNjb2RlLlRleHRTZWFyY2hSZXN1bHQ+LCB0b2tlbjogdnNjb2RlLkNhbmNlbGxhdGlvblRva2VuKTogUHJvbWlzZTx2c2NvZGUuVGV4dFNlYXJjaENvbXBsZXRlPiB7XG5cdFx0XHRcdFx0ZGlzcG9zYWJsZXMuYWRkKHRva2VuLm9uQ2FuY2VsbGF0aW9uUmVxdWVzdGVkKCgpID0+IGNhbmNlbHMrKykpO1xuXHRcdFx0XHRcdGF3YWl0IG5ldyBQcm9taXNlKHIgPT4gcHJvY2Vzcy5uZXh0VGljayhyKSk7XG5cdFx0XHRcdFx0W1xuXHRcdFx0XHRcdFx0J2ZpbGUxLnRzJyxcblx0XHRcdFx0XHRcdCdmaWxlMi50cycsXG5cdFx0XHRcdFx0XHQnZmlsZTMudHMnLFxuXHRcdFx0XHRcdF0uZm9yRWFjaChmID0+IHByb2dyZXNzLnJlcG9ydChtYWtlVGV4dFJlc3VsdChvcHRpb25zLmZvbGRlciwgZikpKTtcblx0XHRcdFx0XHRyZXR1cm4gbnVsbCE7XG5cdFx0XHRcdH1cblx0XHRcdH0pO1xuXG5cdFx0XHRjb25zdCBxdWVyeTogSVNlYXJjaFF1ZXJ5ID0ge1xuXHRcdFx0XHR0eXBlOiBRdWVyeVR5cGUuVGV4dCxcblx0XHRcdFx0Y29udGVudFBhdHRlcm46IGdldFBhdHRlcm4oJ2ZvbycpLFxuXG5cdFx0XHRcdG1heFJlc3VsdHM6IDIsXG5cblx0XHRcdFx0Zm9sZGVyUXVlcmllczogW1xuXHRcdFx0XHRcdHsgZm9sZGVyOiByb290Rm9sZGVyQSB9LFxuXHRcdFx0XHRcdHsgZm9sZGVyOiByb290Rm9sZGVyQiB9XG5cdFx0XHRcdF1cblx0XHRcdH07XG5cblx0XHRcdGNvbnN0IHsgcmVzdWx0cyB9ID0gYXdhaXQgcnVuVGV4dFNlYXJjaChxdWVyeSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0cy5sZW5ndGgsIDIpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNhbmNlbHMsIDIpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnd29ya3Mgd2l0aCBub24tZmlsZSBzY2hlbWVzJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgcHJvdmlkZWRSZXN1bHRzOiB2c2NvZGUuVGV4dFNlYXJjaFJlc3VsdFtdID0gW1xuXHRcdFx0XHRtYWtlVGV4dFJlc3VsdChmYW5jeVNjaGVtZUZvbGRlckEsICdmaWxlMS50cycpLFxuXHRcdFx0XHRtYWtlVGV4dFJlc3VsdChmYW5jeVNjaGVtZUZvbGRlckEsICdmaWxlMi50cycpLFxuXHRcdFx0XHRtYWtlVGV4dFJlc3VsdChmYW5jeVNjaGVtZUZvbGRlckEsICdmaWxlMy50cycpXG5cdFx0XHRdO1xuXG5cdFx0XHRhd2FpdCByZWdpc3RlclRlc3RUZXh0U2VhcmNoUHJvdmlkZXIoe1xuXHRcdFx0XHRwcm92aWRlVGV4dFNlYXJjaFJlc3VsdHMocXVlcnk6IHZzY29kZS5UZXh0U2VhcmNoUXVlcnksIG9wdGlvbnM6IHZzY29kZS5UZXh0U2VhcmNoT3B0aW9ucywgcHJvZ3Jlc3M6IHZzY29kZS5Qcm9ncmVzczx2c2NvZGUuVGV4dFNlYXJjaFJlc3VsdD4sIHRva2VuOiB2c2NvZGUuQ2FuY2VsbGF0aW9uVG9rZW4pOiBQcm9taXNlPHZzY29kZS5UZXh0U2VhcmNoQ29tcGxldGU+IHtcblx0XHRcdFx0XHRwcm92aWRlZFJlc3VsdHMuZm9yRWFjaChyID0+IHByb2dyZXNzLnJlcG9ydChyKSk7XG5cdFx0XHRcdFx0cmV0dXJuIFByb21pc2UucmVzb2x2ZShudWxsISk7XG5cdFx0XHRcdH1cblx0XHRcdH0sIGZhbmN5U2NoZW1lKTtcblxuXHRcdFx0Y29uc3QgcXVlcnk6IElTZWFyY2hRdWVyeSA9IHtcblx0XHRcdFx0dHlwZTogUXVlcnlUeXBlLlRleHQsXG5cdFx0XHRcdGNvbnRlbnRQYXR0ZXJuOiBnZXRQYXR0ZXJuKCdmb28nKSxcblxuXHRcdFx0XHRmb2xkZXJRdWVyaWVzOiBbXG5cdFx0XHRcdFx0eyBmb2xkZXI6IGZhbmN5U2NoZW1lRm9sZGVyQSB9XG5cdFx0XHRcdF1cblx0XHRcdH07XG5cblx0XHRcdGNvbnN0IHsgcmVzdWx0cyB9ID0gYXdhaXQgcnVuVGV4dFNlYXJjaChxdWVyeSk7XG5cdFx0XHRhc3NlcnRSZXN1bHRzKHJlc3VsdHMsIHByb3ZpZGVkUmVzdWx0cyk7XG5cdFx0fSk7XG5cdH0pO1xufSk7XG4iXSwKICAibWFwcGluZ3MiOiAiQUFLQSxPQUFPLFlBQVk7QUFDbkIsU0FBUyxxQkFBcUI7QUFDOUIsU0FB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
