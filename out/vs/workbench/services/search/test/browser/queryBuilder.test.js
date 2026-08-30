import assert from "assert";
import { join } from "../../../../../base/common/path.js";
import { isWindows } from "../../../../../base/common/platform.js";
import { URI, URI as uri } from "../../../../../base/common/uri.js";
import { IConfigurationService } from "../../../../../platform/configuration/common/configuration.js";
import { TestConfigurationService } from "../../../../../platform/configuration/test/common/testConfigurationService.js";
import { TestInstantiationService } from "../../../../../platform/instantiation/test/common/instantiationServiceMock.js";
import { IWorkspaceContextService, toWorkspaceFolder } from "../../../../../platform/workspace/common/workspace.js";
import { toWorkspaceFolders } from "../../../../../platform/workspaces/common/workspaces.js";
import { QueryBuilder } from "../../common/queryBuilder.js";
import { IPathService } from "../../../path/common/pathService.js";
import { QueryType } from "../../common/search.js";
import { TestPathService, TestEnvironmentService } from "../../../../test/browser/workbenchTestServices.js";
import { TestContextService } from "../../../../test/common/workbenchTestServices.js";
import { IEnvironmentService } from "../../../../../platform/environment/common/environment.js";
import { Workspace } from "../../../../../platform/workspace/test/common/testWorkspace.js";
import { extUriBiasedIgnorePathCase } from "../../../../../base/common/resources.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../../base/test/common/utils.js";
const DEFAULT_EDITOR_CONFIG = {};
const DEFAULT_USER_CONFIG = { useIgnoreFiles: true, useGlobalIgnoreFiles: true, useParentIgnoreFiles: true };
const DEFAULT_QUERY_PROPS = {};
suite("QueryBuilder", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  const PATTERN_INFO = { pattern: "a" };
  const ROOT_1 = fixPath("/foo/root1");
  const ROOT_1_URI = getUri(ROOT_1);
  const ROOT_1_NAMED_FOLDER = toWorkspaceFolder(ROOT_1_URI);
  const WS_CONFIG_PATH = getUri("/bar/test.code-workspace");
  let instantiationService;
  let queryBuilder;
  let mockConfigService;
  let mockContextService;
  let mockWorkspace;
  setup(() => {
    instantiationService = new TestInstantiationService();
    mockConfigService = new TestConfigurationService();
    mockConfigService.setUserConfiguration("search", DEFAULT_USER_CONFIG);
    mockConfigService.setUserConfiguration("editor", DEFAULT_EDITOR_CONFIG);
    instantiationService.stub(IConfigurationService, mockConfigService);
    mockContextService = new TestContextService();
    mockWorkspace = new Workspace("workspace", [toWorkspaceFolder(ROOT_1_URI)]);
    mockContextService.setWorkspace(mockWorkspace);
    instantiationService.stub(IWorkspaceContextService, mockContextService);
    instantiationService.stub(IEnvironmentService, TestEnvironmentService);
    instantiationService.stub(IPathService, new TestPathService());
    queryBuilder = instantiationService.createInstance(QueryBuilder);
  });
  teardown(() => {
    instantiationService.dispose();
  });
  test("simple text pattern", () => {
    assertEqualTextQueries(
      queryBuilder.text(PATTERN_INFO),
      {
        folderQueries: [],
        contentPattern: PATTERN_INFO,
        type: QueryType.Text
      }
    );
  });
  test("normalize literal newlines", () => {
    assertEqualTextQueries(
      queryBuilder.text({ pattern: "foo\nbar", isRegExp: true }),
      {
        folderQueries: [],
        contentPattern: {
          pattern: "foo\\nbar",
          isRegExp: true,
          isMultiline: true
        },
        type: QueryType.Text
      }
    );
    assertEqualTextQueries(
      queryBuilder.text({ pattern: "foo\nbar", isRegExp: false }),
      {
        folderQueries: [],
        contentPattern: {
          pattern: "foo\nbar",
          isRegExp: false,
          isMultiline: true
        },
        type: QueryType.Text
      }
    );
  });
  test("splits include pattern when expandPatterns enabled", () => {
    assertEqualQueries(
      queryBuilder.file(
        [ROOT_1_NAMED_FOLDER],
        { includePattern: "**/foo, **/bar", expandPatterns: true }
      ),
      {
        folderQueries: [{
          folder: ROOT_1_URI
        }],
        type: QueryType.File,
        includePattern: {
          "**/foo": true,
          "**/foo/**": true,
          "**/bar": true,
          "**/bar/**": true
        }
      }
    );
  });
  test("does not split include pattern when expandPatterns disabled", () => {
    assertEqualQueries(
      queryBuilder.file(
        [ROOT_1_NAMED_FOLDER],
        { includePattern: "**/foo, **/bar" }
      ),
      {
        folderQueries: [{
          folder: ROOT_1_URI
        }],
        type: QueryType.File,
        includePattern: {
          "**/foo, **/bar": true
        }
      }
    );
  });
  test("includePattern array", () => {
    assertEqualQueries(
      queryBuilder.file(
        [ROOT_1_NAMED_FOLDER],
        { includePattern: ["**/foo", "**/bar"] }
      ),
      {
        folderQueries: [{
          folder: ROOT_1_URI
        }],
        type: QueryType.File,
        includePattern: {
          "**/foo": true,
          "**/bar": true
        }
      }
    );
  });
  test("includePattern array with expandPatterns", () => {
    assertEqualQueries(
      queryBuilder.file(
        [ROOT_1_NAMED_FOLDER],
        { includePattern: ["**/foo", "**/bar"], expandPatterns: true }
      ),
      {
        folderQueries: [{
          folder: ROOT_1_URI
        }],
        type: QueryType.File,
        includePattern: {
          "**/foo": true,
          "**/foo/**": true,
          "**/bar": true,
          "**/bar/**": true
        }
      }
    );
  });
  test("folderResources", () => {
    assertEqualTextQueries(
      queryBuilder.text(
        PATTERN_INFO,
        [ROOT_1_URI]
      ),
      {
        contentPattern: PATTERN_INFO,
        folderQueries: [{ folder: ROOT_1_URI }],
        type: QueryType.Text
      }
    );
  });
  test("simple exclude setting", () => {
    mockConfigService.setUserConfiguration("search", {
      ...DEFAULT_USER_CONFIG,
      exclude: {
        "bar/**": true,
        "foo/**": {
          "when": "$(basename).ts"
        }
      }
    });
    assertEqualTextQueries(
      queryBuilder.text(
        PATTERN_INFO,
        [ROOT_1_URI],
        {
          expandPatterns: true
          // verify that this doesn't affect patterns from configuration
        }
      ),
      {
        contentPattern: PATTERN_INFO,
        folderQueries: [{
          folder: ROOT_1_URI,
          excludePattern: [{
            pattern: {
              "bar/**": true,
              "foo/**": {
                "when": "$(basename).ts"
              }
            }
          }]
        }],
        type: QueryType.Text
      }
    );
  });
  test("simple include", () => {
    assertEqualTextQueries(
      queryBuilder.text(
        PATTERN_INFO,
        [ROOT_1_URI],
        {
          includePattern: "bar",
          expandPatterns: true
        }
      ),
      {
        contentPattern: PATTERN_INFO,
        folderQueries: [{
          folder: ROOT_1_URI
        }],
        includePattern: {
          "**/bar": true,
          "**/bar/**": true
        },
        type: QueryType.Text
      }
    );
    assertEqualTextQueries(
      queryBuilder.text(
        PATTERN_INFO,
        [ROOT_1_URI],
        {
          includePattern: "bar"
        }
      ),
      {
        contentPattern: PATTERN_INFO,
        folderQueries: [{
          folder: ROOT_1_URI
        }],
        includePattern: {
          "bar": true
        },
        type: QueryType.Text
      }
    );
  });
  test("simple include with ./ syntax", () => {
    assertEqualTextQueries(
      queryBuilder.text(
        PATTERN_INFO,
        [ROOT_1_URI],
        {
          includePattern: "./bar",
          expandPatterns: true
        }
      ),
      {
        contentPattern: PATTERN_INFO,
        folderQueries: [{
          folder: ROOT_1_URI,
          includePattern: {
            "bar": true,
            "bar/**": true
          }
        }],
        type: QueryType.Text
      }
    );
    assertEqualTextQueries(
      queryBuilder.text(
        PATTERN_INFO,
        [ROOT_1_URI],
        {
          includePattern: ".\\bar",
          expandPatterns: true
        }
      ),
      {
        contentPattern: PATTERN_INFO,
        folderQueries: [{
          folder: ROOT_1_URI,
          includePattern: {
            "bar": true,
            "bar/**": true
          }
        }],
        type: QueryType.Text
      }
    );
  });
  test("exclude setting and searchPath", () => {
    mockConfigService.setUserConfiguration("search", {
      ...DEFAULT_USER_CONFIG,
      exclude: {
        "foo/**/*.js": true,
        "bar/**": {
          "when": "$(basename).ts"
        }
      }
    });
    assertEqualTextQueries(
      queryBuilder.text(
        PATTERN_INFO,
        [ROOT_1_URI],
        {
          includePattern: "./foo",
          expandPatterns: true
        }
      ),
      {
        contentPattern: PATTERN_INFO,
        folderQueries: [{
          folder: ROOT_1_URI,
          includePattern: {
            "foo": true,
            "foo/**": true
          },
          excludePattern: [{
            pattern: {
              "foo/**/*.js": true,
              "bar/**": {
                "when": "$(basename).ts"
              }
            }
          }]
        }],
        type: QueryType.Text
      }
    );
  });
  test("multiroot exclude settings", () => {
    const ROOT_2 = fixPath("/project/root2");
    const ROOT_2_URI = getUri(ROOT_2);
    const ROOT_3 = fixPath("/project/root3");
    const ROOT_3_URI = getUri(ROOT_3);
    mockWorkspace.folders = toWorkspaceFolders([{ path: ROOT_1_URI.fsPath }, { path: ROOT_2_URI.fsPath }, { path: ROOT_3_URI.fsPath }], WS_CONFIG_PATH, extUriBiasedIgnorePathCase);
    mockWorkspace.configuration = uri.file(fixPath("/config"));
    mockConfigService.setUserConfiguration("search", {
      ...DEFAULT_USER_CONFIG,
      exclude: { "foo/**/*.js": true }
    }, ROOT_1_URI);
    mockConfigService.setUserConfiguration("search", {
      ...DEFAULT_USER_CONFIG,
      exclude: { "bar": true }
    }, ROOT_2_URI);
    assertEqualTextQueries(
      queryBuilder.text(
        PATTERN_INFO,
        [ROOT_1_URI, ROOT_2_URI, ROOT_3_URI]
      ),
      {
        contentPattern: PATTERN_INFO,
        folderQueries: [
          { folder: ROOT_1_URI, excludePattern: makeExcludePatternFromPatterns("foo/**/*.js") },
          { folder: ROOT_2_URI, excludePattern: makeExcludePatternFromPatterns("bar") },
          { folder: ROOT_3_URI }
        ],
        type: QueryType.Text
      }
    );
    assertEqualTextQueries(
      queryBuilder.text(
        PATTERN_INFO,
        [ROOT_1_URI, ROOT_2_URI, ROOT_3_URI],
        {
          includePattern: "./root2/src",
          expandPatterns: true
        }
      ),
      {
        contentPattern: PATTERN_INFO,
        folderQueries: [
          {
            folder: ROOT_2_URI,
            includePattern: {
              "src": true,
              "src/**": true
            },
            excludePattern: [{
              pattern: { "bar": true }
            }]
          }
        ],
        type: QueryType.Text
      }
    );
  });
  test("simple exclude input pattern", () => {
    assertEqualTextQueries(
      queryBuilder.text(
        PATTERN_INFO,
        [ROOT_1_URI],
        {
          excludePattern: [{ pattern: "foo" }],
          expandPatterns: true
        }
      ),
      {
        contentPattern: PATTERN_INFO,
        folderQueries: [{
          folder: ROOT_1_URI
        }],
        type: QueryType.Text,
        excludePattern: patternsToIExpression(...globalGlob("foo"))
      }
    );
  });
  test("file pattern trimming", () => {
    const content = "content";
    assertEqualQueries(
      queryBuilder.file(
        [],
        { filePattern: ` ${content} ` }
      ),
      {
        folderQueries: [],
        filePattern: content,
        type: QueryType.File
      }
    );
  });
  test("exclude ./ syntax", () => {
    assertEqualTextQueries(
      queryBuilder.text(
        PATTERN_INFO,
        [ROOT_1_URI],
        {
          excludePattern: [{ pattern: "./bar" }],
          expandPatterns: true
        }
      ),
      {
        contentPattern: PATTERN_INFO,
        folderQueries: [{
          folder: ROOT_1_URI,
          excludePattern: makeExcludePatternFromPatterns("bar", "bar/**")
        }],
        type: QueryType.Text
      }
    );
    assertEqualTextQueries(
      queryBuilder.text(
        PATTERN_INFO,
        [ROOT_1_URI],
        {
          excludePattern: [{ pattern: "./bar/**/*.ts" }],
          expandPatterns: true
        }
      ),
      {
        contentPattern: PATTERN_INFO,
        folderQueries: [{
          folder: ROOT_1_URI,
          excludePattern: makeExcludePatternFromPatterns("bar/**/*.ts", "bar/**/*.ts/**")
        }],
        type: QueryType.Text
      }
    );
    assertEqualTextQueries(
      queryBuilder.text(
        PATTERN_INFO,
        [ROOT_1_URI],
        {
          excludePattern: [{ pattern: ".\\bar\\**\\*.ts" }],
          expandPatterns: true
        }
      ),
      {
        contentPattern: PATTERN_INFO,
        folderQueries: [{
          folder: ROOT_1_URI,
          excludePattern: makeExcludePatternFromPatterns("bar/**/*.ts", "bar/**/*.ts/**")
        }],
        type: QueryType.Text
      }
    );
  });
  test("extraFileResources", () => {
    assertEqualTextQueries(
      queryBuilder.text(
        PATTERN_INFO,
        [ROOT_1_URI],
        { extraFileResources: [getUri("/foo/bar.js")] }
      ),
      {
        contentPattern: PATTERN_INFO,
        folderQueries: [{
          folder: ROOT_1_URI
        }],
        extraFileResources: [getUri("/foo/bar.js")],
        type: QueryType.Text
      }
    );
    assertEqualTextQueries(
      queryBuilder.text(
        PATTERN_INFO,
        [ROOT_1_URI],
        {
          extraFileResources: [getUri("/foo/bar.js")],
          excludePattern: [{ pattern: "*.js" }],
          expandPatterns: true
        }
      ),
      {
        contentPattern: PATTERN_INFO,
        folderQueries: [{
          folder: ROOT_1_URI
        }],
        excludePattern: patternsToIExpression(...globalGlob("*.js")),
        type: QueryType.Text
      }
    );
    assertEqualTextQueries(
      queryBuilder.text(
        PATTERN_INFO,
        [ROOT_1_URI],
        {
          extraFileResources: [getUri("/foo/bar.js")],
          includePattern: "*.txt",
          expandPatterns: true
        }
      ),
      {
        contentPattern: PATTERN_INFO,
        folderQueries: [{
          folder: ROOT_1_URI
        }],
        includePattern: patternsToIExpression(...globalGlob("*.txt")),
        type: QueryType.Text
      }
    );
  });
  suite("parseSearchPaths 1", () => {
    test("simple includes", () => {
      function testSimpleIncludes(includePattern, expectedPatterns) {
        const result = queryBuilder.parseSearchPaths(includePattern);
        assert.deepStrictEqual(
          { ...result.pattern },
          patternsToIExpression(...expectedPatterns),
          includePattern
        );
        assert.strictEqual(result.searchPaths, void 0);
      }
      [
        ["a", ["**/a/**", "**/a"]],
        ["a/b", ["**/a/b", "**/a/b/**"]],
        ["a/b,  c", ["**/a/b", "**/c", "**/a/b/**", "**/c/**"]],
        ["a,.txt", ["**/a", "**/a/**", "**/*.txt", "**/*.txt/**"]],
        ["a,,,b", ["**/a", "**/a/**", "**/b", "**/b/**"]],
        ["**/a,b/**", ["**/a", "**/a/**", "**/b/**"]]
      ].forEach(([includePattern, expectedPatterns]) => testSimpleIncludes(includePattern, expectedPatterns));
    });
    function testIncludes(includePattern, expectedResult) {
      let actual;
      try {
        actual = queryBuilder.parseSearchPaths(includePattern);
      } catch (_) {
        actual = { searchPaths: [] };
      }
      assertEqualSearchPathResults(
        actual,
        expectedResult,
        includePattern
      );
    }
    function testIncludesDataItem([includePattern, expectedResult]) {
      testIncludes(includePattern, expectedResult);
    }
    test("absolute includes", () => {
      const cases = [
        [
          fixPath("/foo/bar"),
          {
            searchPaths: [{ searchPath: getUri("/foo/bar") }]
          }
        ],
        [
          fixPath("/foo/bar") + ",a",
          {
            searchPaths: [{ searchPath: getUri("/foo/bar") }],
            pattern: patternsToIExpression(...globalGlob("a"))
          }
        ],
        [
          fixPath("/foo/bar") + "," + fixPath("/1/2"),
          {
            searchPaths: [{ searchPath: getUri("/foo/bar") }, { searchPath: getUri("/1/2") }]
          }
        ],
        [
          fixPath("/foo/bar") + "," + fixPath("/foo/../foo/bar/fooar/.."),
          {
            searchPaths: [{
              searchPath: getUri("/foo/bar")
            }]
          }
        ],
        [
          fixPath("/foo/bar/**/*.ts"),
          {
            searchPaths: [{
              searchPath: getUri("/foo/bar"),
              pattern: patternsToIExpression("**/*.ts", "**/*.ts/**")
            }]
          }
        ],
        [
          fixPath("/foo/bar/*a/b/c"),
          {
            searchPaths: [{
              searchPath: getUri("/foo/bar"),
              pattern: patternsToIExpression("*a/b/c", "*a/b/c/**")
            }]
          }
        ],
        [
          fixPath("/*a/b/c"),
          {
            searchPaths: [{
              searchPath: getUri("/"),
              pattern: patternsToIExpression("*a/b/c", "*a/b/c/**")
            }]
          }
        ],
        [
          fixPath("/foo/{b,c}ar"),
          {
            searchPaths: [{
              searchPath: getUri("/foo"),
              pattern: patternsToIExpression("{b,c}ar", "{b,c}ar/**")
            }]
          }
        ]
      ];
      cases.forEach(testIncludesDataItem);
    });
    test("relative includes w/single root folder", () => {
      const cases = [
        [
          "./a",
          {
            searchPaths: [{
              searchPath: ROOT_1_URI,
              pattern: patternsToIExpression("a", "a/**")
            }]
          }
        ],
        [
          "./a/",
          {
            searchPaths: [{
              searchPath: ROOT_1_URI,
              pattern: patternsToIExpression("a", "a/**")
            }]
          }
        ],
        [
          "./a/*b/c",
          {
            searchPaths: [{
              searchPath: ROOT_1_URI,
              pattern: patternsToIExpression("a/*b/c", "a/*b/c/**")
            }]
          }
        ],
        [
          "./a/*b/c, " + fixPath("/project/foo"),
          {
            searchPaths: [
              {
                searchPath: ROOT_1_URI,
                pattern: patternsToIExpression("a/*b/c", "a/*b/c/**")
              },
              {
                searchPath: getUri("/project/foo")
              }
            ]
          }
        ],
        [
          "./a/b/,./c/d",
          {
            searchPaths: [{
              searchPath: ROOT_1_URI,
              pattern: patternsToIExpression("a/b", "a/b/**", "c/d", "c/d/**")
            }]
          }
        ],
        [
          "../",
          {
            searchPaths: [{
              searchPath: getUri("/foo")
            }]
          }
        ],
        [
          "..",
          {
            searchPaths: [{
              searchPath: getUri("/foo")
            }]
          }
        ],
        [
          "..\\bar",
          {
            searchPaths: [{
              searchPath: getUri("/foo/bar")
            }]
          }
        ]
      ];
      cases.forEach(testIncludesDataItem);
    });
    test("relative includes w/two root folders", () => {
      const ROOT_2 = "/project/root2";
      mockWorkspace.folders = toWorkspaceFolders([{ path: ROOT_1_URI.fsPath }, { path: getUri(ROOT_2).fsPath }], WS_CONFIG_PATH, extUriBiasedIgnorePathCase);
      mockWorkspace.configuration = uri.file(fixPath("config"));
      const cases = [
        [
          "./root1",
          {
            searchPaths: [{
              searchPath: getUri(ROOT_1)
            }]
          }
        ],
        [
          "./root2",
          {
            searchPaths: [{
              searchPath: getUri(ROOT_2)
            }]
          }
        ],
        [
          "./root1/a/**/b, ./root2/**/*.txt",
          {
            searchPaths: [
              {
                searchPath: ROOT_1_URI,
                pattern: patternsToIExpression("a/**/b", "a/**/b/**")
              },
              {
                searchPath: getUri(ROOT_2),
                pattern: patternsToIExpression("**/*.txt", "**/*.txt/**")
              }
            ]
          }
        ]
      ];
      cases.forEach(testIncludesDataItem);
    });
    test("include ./foldername", () => {
      const ROOT_2 = "/project/root2";
      const ROOT_1_FOLDERNAME = "foldername";
      mockWorkspace.folders = toWorkspaceFolders([{ path: ROOT_1_URI.fsPath, name: ROOT_1_FOLDERNAME }, { path: getUri(ROOT_2).fsPath }], WS_CONFIG_PATH, extUriBiasedIgnorePathCase);
      mockWorkspace.configuration = uri.file(fixPath("config"));
      const cases = [
        [
          "./foldername",
          {
            searchPaths: [{
              searchPath: ROOT_1_URI
            }]
          }
        ],
        [
          "./foldername/foo",
          {
            searchPaths: [{
              searchPath: ROOT_1_URI,
              pattern: patternsToIExpression("foo", "foo/**")
            }]
          }
        ]
      ];
      cases.forEach(testIncludesDataItem);
    });
    test("folder with slash in the name", () => {
      const ROOT_2 = "/project/root2";
      const ROOT_2_URI = getUri(ROOT_2);
      const ROOT_1_FOLDERNAME = "folder/one";
      const ROOT_2_FOLDERNAME = "folder/two+";
      mockWorkspace.folders = toWorkspaceFolders([{ path: ROOT_1_URI.fsPath, name: ROOT_1_FOLDERNAME }, { path: ROOT_2_URI.fsPath, name: ROOT_2_FOLDERNAME }], WS_CONFIG_PATH, extUriBiasedIgnorePathCase);
      mockWorkspace.configuration = uri.file(fixPath("config"));
      const cases = [
        [
          "./folder/one",
          {
            searchPaths: [{
              searchPath: ROOT_1_URI
            }]
          }
        ],
        [
          "./folder/two+/foo/",
          {
            searchPaths: [{
              searchPath: ROOT_2_URI,
              pattern: patternsToIExpression("foo", "foo/**")
            }]
          }
        ],
        [
          "./folder/onesomethingelse",
          { searchPaths: [] }
        ],
        [
          "./folder/onesomethingelse/foo",
          { searchPaths: [] }
        ],
        [
          "./folder",
          { searchPaths: [] }
        ]
      ];
      cases.forEach(testIncludesDataItem);
    });
    test("relative includes w/multiple ambiguous root folders", () => {
      const ROOT_2 = "/project/rootB";
      const ROOT_3 = "/otherproject/rootB";
      mockWorkspace.folders = toWorkspaceFolders([{ path: ROOT_1_URI.fsPath }, { path: getUri(ROOT_2).fsPath }, { path: getUri(ROOT_3).fsPath }], WS_CONFIG_PATH, extUriBiasedIgnorePathCase);
      mockWorkspace.configuration = uri.file(fixPath("/config"));
      const cases = [
        [
          "",
          {
            searchPaths: void 0
          }
        ],
        [
          "./",
          {
            searchPaths: void 0
          }
        ],
        [
          "./root1",
          {
            searchPaths: [{
              searchPath: getUri(ROOT_1)
            }]
          }
        ],
        [
          "./root1,./",
          {
            searchPaths: [{
              searchPath: getUri(ROOT_1)
            }]
          }
        ],
        [
          "./rootB",
          {
            searchPaths: [
              {
                searchPath: getUri(ROOT_2)
              },
              {
                searchPath: getUri(ROOT_3)
              }
            ]
          }
        ],
        [
          "./rootB/a/**/b, ./rootB/b/**/*.txt",
          {
            searchPaths: [
              {
                searchPath: getUri(ROOT_2),
                pattern: patternsToIExpression("a/**/b", "a/**/b/**", "b/**/*.txt", "b/**/*.txt/**")
              },
              {
                searchPath: getUri(ROOT_3),
                pattern: patternsToIExpression("a/**/b", "a/**/b/**", "b/**/*.txt", "b/**/*.txt/**")
              }
            ]
          }
        ],
        [
          "./root1/**/foo/, bar/",
          {
            pattern: patternsToIExpression("**/bar", "**/bar/**"),
            searchPaths: [
              {
                searchPath: ROOT_1_URI,
                pattern: patternsToIExpression("**/foo", "**/foo/**")
              }
            ]
          }
        ]
      ];
      cases.forEach(testIncludesDataItem);
    });
  });
  suite("parseSearchPaths 2", () => {
    function testIncludes(includePattern, expectedResult) {
      assertEqualSearchPathResults(
        queryBuilder.parseSearchPaths(includePattern),
        expectedResult,
        includePattern
      );
    }
    function testIncludesDataItem([includePattern, expectedResult]) {
      testIncludes(includePattern, expectedResult);
    }
    (isWindows ? test.skip : test)("includes with tilde", () => {
      const userHome = URI.file("/");
      const cases = [
        [
          "~/foo/bar",
          {
            searchPaths: [{ searchPath: getUri(userHome.fsPath, "/foo/bar") }]
          }
        ],
        [
          "~/foo/bar, a",
          {
            searchPaths: [{ searchPath: getUri(userHome.fsPath, "/foo/bar") }],
            pattern: patternsToIExpression(...globalGlob("a"))
          }
        ],
        [
          fixPath("/foo/~/bar"),
          {
            searchPaths: [{ searchPath: getUri("/foo/~/bar") }]
          }
        ]
      ];
      cases.forEach(testIncludesDataItem);
    });
  });
  suite("smartCase", () => {
    test("no flags -> no change", () => {
      const query = queryBuilder.text(
        {
          pattern: "a"
        },
        []
      );
      assert(!query.contentPattern.isCaseSensitive);
    });
    test("maintains isCaseSensitive when smartCase not set", () => {
      const query = queryBuilder.text(
        {
          pattern: "a",
          isCaseSensitive: true
        },
        []
      );
      assert(query.contentPattern.isCaseSensitive);
    });
    test("maintains isCaseSensitive when smartCase set", () => {
      const query = queryBuilder.text(
        {
          pattern: "a",
          isCaseSensitive: true
        },
        [],
        {
          isSmartCase: true
        }
      );
      assert(query.contentPattern.isCaseSensitive);
    });
    test("smartCase determines not case sensitive", () => {
      const query = queryBuilder.text(
        {
          pattern: "abcd"
        },
        [],
        {
          isSmartCase: true
        }
      );
      assert(!query.contentPattern.isCaseSensitive);
    });
    test("smartCase determines case sensitive", () => {
      const query = queryBuilder.text(
        {
          pattern: "abCd"
        },
        [],
        {
          isSmartCase: true
        }
      );
      assert(query.contentPattern.isCaseSensitive);
    });
    test("smartCase determines not case sensitive (regex)", () => {
      const query = queryBuilder.text(
        {
          pattern: "ab\\Sd",
          isRegExp: true
        },
        [],
        {
          isSmartCase: true
        }
      );
      assert(!query.contentPattern.isCaseSensitive);
    });
    test("smartCase determines case sensitive (regex)", () => {
      const query = queryBuilder.text(
        {
          pattern: "ab[A-Z]d",
          isRegExp: true
        },
        [],
        {
          isSmartCase: true
        }
      );
      assert(query.contentPattern.isCaseSensitive);
    });
  });
  suite("file", () => {
    test("simple file query", () => {
      const cacheKey = "asdf";
      const query = queryBuilder.file(
        [ROOT_1_NAMED_FOLDER],
        {
          cacheKey,
          sortByScore: true
        }
      );
      assert.strictEqual(query.folderQueries.length, 1);
      assert.strictEqual(query.cacheKey, cacheKey);
      assert(query.sortByScore);
    });
  });
  suite("pattern processing", () => {
    test("text query with comma-separated includes with no workspace", () => {
      const query = queryBuilder.text(
        { pattern: `` },
        [],
        {
          includePattern: "*.js,*.ts",
          expandPatterns: true
        }
      );
      assert.deepEqual(query.includePattern, {
        "**/*.js/**": true,
        "**/*.js": true,
        "**/*.ts/**": true,
        "**/*.ts": true
      });
      assert.strictEqual(query.folderQueries.length, 0);
    });
    test("text query with comma-separated includes with workspace", () => {
      const query = queryBuilder.text(
        { pattern: `` },
        [ROOT_1_URI],
        {
          includePattern: "*.js,*.ts",
          expandPatterns: true
        }
      );
      assert.deepEqual(query.includePattern, {
        "**/*.js/**": true,
        "**/*.js": true,
        "**/*.ts/**": true,
        "**/*.ts": true
      });
      assert.strictEqual(query.folderQueries.length, 1);
    });
    test("text query with comma-separated excludes globally", () => {
      const query = queryBuilder.text(
        { pattern: `` },
        [],
        {
          excludePattern: [{ pattern: "*.js,*.ts" }],
          expandPatterns: true
        }
      );
      assert.deepEqual(query.excludePattern, {
        "**/*.js/**": true,
        "**/*.js": true,
        "**/*.ts/**": true,
        "**/*.ts": true
      });
      assert.strictEqual(query.folderQueries.length, 0);
    });
    test("text query with comma-separated excludes globally in a workspace", () => {
      const query = queryBuilder.text(
        { pattern: `` },
        [ROOT_1_NAMED_FOLDER.uri],
        {
          excludePattern: [{ pattern: "*.js,*.ts" }],
          expandPatterns: true
        }
      );
      assert.deepEqual(query.excludePattern, {
        "**/*.js/**": true,
        "**/*.js": true,
        "**/*.ts/**": true,
        "**/*.ts": true
      });
      assert.strictEqual(query.folderQueries.length, 1);
    });
    test.skip("text query with multiple comma-separated excludes", () => {
      const query = queryBuilder.text(
        { pattern: `` },
        [ROOT_1_NAMED_FOLDER.uri],
        {
          excludePattern: [{ pattern: "*.js,*.ts" }, { pattern: "foo/*,bar/*" }],
          expandPatterns: true
        }
      );
      assert.deepEqual(query.excludePattern, [
        {
          "**/*.js/**": true,
          "**/*.js": true,
          "**/*.ts/**": true,
          "**/*.ts": true
        },
        {
          "**/foo/*/**": true,
          "**/foo/*": true,
          "**/bar/*/**": true,
          "**/bar/*": true
        }
      ]);
      assert.strictEqual(query.folderQueries.length, 1);
    });
    test.skip("text query with base URI on exclud", () => {
      const query = queryBuilder.text(
        { pattern: `` },
        [ROOT_1_NAMED_FOLDER.uri],
        {
          excludePattern: [{ uri: ROOT_1_URI, pattern: "*.js,*.ts" }],
          expandPatterns: true
        }
      );
      assert.deepEqual(query.excludePattern, {
        uri: ROOT_1_URI,
        pattern: {
          "**/*.js/**": true,
          "**/*.js": true,
          "**/*.ts/**": true,
          "**/*.ts": true
        }
      });
      assert.strictEqual(query.folderQueries.length, 1);
    });
  });
});
function makeExcludePatternFromPatterns(...patterns) {
  const pattern = patternsToIExpression(...patterns);
  return pattern ? [{ pattern }] : void 0;
}
function assertEqualTextQueries(actual, expected) {
  return assertEqualQueries(actual, expected);
}
function assertEqualQueries(actual, expected) {
  expected = {
    ...DEFAULT_QUERY_PROPS,
    ...expected
  };
  const folderQueryToCompareObject = (fq) => {
    const excludePattern = fq.excludePattern?.map((e) => normalizeExpression(e.pattern));
    return {
      path: fq.folder.fsPath,
      excludePattern: excludePattern?.length ? excludePattern : void 0,
      includePattern: normalizeExpression(fq.includePattern),
      fileEncoding: fq.fileEncoding
    };
  };
  if (expected.folderQueries) {
    assert.deepStrictEqual(actual.folderQueries.map(folderQueryToCompareObject), expected.folderQueries.map(folderQueryToCompareObject));
    actual.folderQueries = [];
    expected.folderQueries = [];
  }
  if (expected.extraFileResources) {
    assert.deepStrictEqual(actual.extraFileResources.map((extraFile) => extraFile.fsPath), expected.extraFileResources.map((extraFile) => extraFile.fsPath));
    delete expected.extraFileResources;
    delete actual.extraFileResources;
  }
  delete actual.usingSearchPaths;
  actual.includePattern = normalizeExpression(actual.includePattern);
  actual.excludePattern = normalizeExpression(actual.excludePattern);
  cleanUndefinedQueryValues(actual);
  assert.deepStrictEqual(actual, expected);
}
function assertEqualSearchPathResults(actual, expected, message) {
  cleanUndefinedQueryValues(actual);
  assert.deepStrictEqual({ ...actual.pattern }, { ...expected.pattern }, message);
  assert.strictEqual(actual.searchPaths && actual.searchPaths.length, expected.searchPaths && expected.searchPaths.length);
  if (actual.searchPaths) {
    actual.searchPaths.forEach((searchPath, i) => {
      const expectedSearchPath = expected.searchPaths[i];
      assert.deepStrictEqual(searchPath.pattern && { ...searchPath.pattern }, expectedSearchPath.pattern);
      assert.strictEqual(searchPath.searchPath.toString(), expectedSearchPath.searchPath.toString());
    });
  }
}
function cleanUndefinedQueryValues(q) {
  for (const key in q) {
    if (q[key] === void 0) {
      delete q[key];
    } else if (typeof q[key] === "object") {
      cleanUndefinedQueryValues(q[key]);
    }
  }
  return q;
}
function globalGlob(pattern) {
  return [
    `**/${pattern}/**`,
    `**/${pattern}`
  ];
}
function patternsToIExpression(...patterns) {
  return patterns.length ? patterns.reduce((glob, cur) => {
    glob[cur] = true;
    return glob;
  }, {}) : void 0;
}
function getUri(...slashPathParts) {
  return uri.file(fixPath(...slashPathParts));
}
function fixPath(...slashPathParts) {
  if (isWindows && slashPathParts.length && !slashPathParts[0].match(/^c:/i)) {
    slashPathParts.unshift("c:");
  }
  return join(...slashPathParts);
}
function normalizeExpression(expression) {
  if (!expression) {
    return expression;
  }
  const normalized = {};
  Object.keys(expression).forEach((key) => {
    normalized[key.replace(/\\/g, "/")] = expression[key];
  });
  return normalized;
}
export {
  assertEqualQueries,
  assertEqualSearchPathResults,
  cleanUndefinedQueryValues,
  fixPath,
  getUri,
  globalGlob,
  normalizeExpression,
  patternsToIExpression
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXHNlcnZpY2VzXFxzZWFyY2hcXHRlc3RcXGJyb3dzZXJcXHF1ZXJ5QnVpbGRlci50ZXN0LnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cbmltcG9ydCBhc3NlcnQgZnJvbSAnYXNzZXJ0JztcbmltcG9ydCB7IElFeHByZXNzaW9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vZ2xvYi5qcyc7XG5pbXBvcnQgeyBqb2luIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vcGF0aC5qcyc7XG5pbXBvcnQgeyBpc1dpbmRvd3MgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9wbGF0Zm9ybS5qcyc7XG5pbXBvcnQgeyBVUkksIFVSSSBhcyB1cmkgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi91cmkuanMnO1xuaW1wb3J0IHsgSUNvbmZpZ3VyYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29uZmlndXJhdGlvbi9jb21tb24vY29uZmlndXJhdGlvbi5qcyc7XG5pbXBvcnQgeyBUZXN0Q29uZmlndXJhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb25maWd1cmF0aW9uL3Rlc3QvY29tbW9uL3Rlc3RDb25maWd1cmF0aW9uU2VydmljZS5qcyc7XG5pbXBvcnQgeyBUZXN0SW5zdGFudGlhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9pbnN0YW50aWF0aW9uL3Rlc3QvY29tbW9uL2luc3RhbnRpYXRpb25TZXJ2aWNlTW9jay5qcyc7XG5pbXBvcnQgeyBJV29ya3NwYWNlQ29udGV4dFNlcnZpY2UsIHRvV29ya3NwYWNlRm9sZGVyIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vd29ya3NwYWNlL2NvbW1vbi93b3Jrc3BhY2UuanMnO1xuaW1wb3J0IHsgdG9Xb3Jrc3BhY2VGb2xkZXJzIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vd29ya3NwYWNlcy9jb21tb24vd29ya3NwYWNlcy5qcyc7XG5pbXBvcnQgeyBJU2VhcmNoUGF0aHNJbmZvLCBRdWVyeUJ1aWxkZXIgfSBmcm9tICcuLi8uLi9jb21tb24vcXVlcnlCdWlsZGVyLmpzJztcbmltcG9ydCB7IElQYXRoU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL3BhdGgvY29tbW9uL3BhdGhTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElGaWxlUXVlcnksIElGb2xkZXJRdWVyeSwgSVBhdHRlcm5JbmZvLCBJVGV4dFF1ZXJ5LCBRdWVyeVR5cGUgfSBmcm9tICcuLi8uLi9jb21tb24vc2VhcmNoLmpzJztcbmltcG9ydCB7IFRlc3RQYXRoU2VydmljZSwgVGVzdEVudmlyb25tZW50U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3Rlc3QvYnJvd3Nlci93b3JrYmVuY2hUZXN0U2VydmljZXMuanMnO1xuaW1wb3J0IHsgVGVzdENvbnRleHRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vdGVzdC9jb21tb24vd29ya2JlbmNoVGVzdFNlcnZpY2VzLmpzJztcbmltcG9ydCB7IElFbnZpcm9ubWVudFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9lbnZpcm9ubWVudC9jb21tb24vZW52aXJvbm1lbnQuanMnO1xuaW1wb3J0IHsgV29ya3NwYWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vd29ya3NwYWNlL3Rlc3QvY29tbW9uL3Rlc3RXb3Jrc3BhY2UuanMnO1xuaW1wb3J0IHsgZXh0VXJpQmlhc2VkSWdub3JlUGF0aENhc2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9yZXNvdXJjZXMuanMnO1xuaW1wb3J0IHsgZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS90ZXN0L2NvbW1vbi91dGlscy5qcyc7XG5cbmNvbnN0IERFRkFVTFRfRURJVE9SX0NPTkZJRyA9IHt9O1xuY29uc3QgREVGQVVMVF9VU0VSX0NPTkZJRyA9IHsgdXNlSWdub3JlRmlsZXM6IHRydWUsIHVzZUdsb2JhbElnbm9yZUZpbGVzOiB0cnVlLCB1c2VQYXJlbnRJZ25vcmVGaWxlczogdHJ1ZSB9O1xuY29uc3QgREVGQVVMVF9RVUVSWV9QUk9QUyA9IHt9O1xuXG5zdWl0ZSgnUXVlcnlCdWlsZGVyJywgKCkgPT4ge1xuXHRlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUoKTtcblx0Y29uc3QgUEFUVEVSTl9JTkZPOiBJUGF0dGVybkluZm8gPSB7IHBhdHRlcm46ICdhJyB9O1xuXHRjb25zdCBST09UXzEgPSBmaXhQYXRoKCcvZm9vL3Jvb3QxJyk7XG5cdGNvbnN0IFJPT1RfMV9VUkkgPSBnZXRVcmkoUk9PVF8xKTtcblx0Y29uc3QgUk9PVF8xX05BTUVEX0ZPTERFUiA9IHRvV29ya3NwYWNlRm9sZGVyKFJPT1RfMV9VUkkpO1xuXHRjb25zdCBXU19DT05GSUdfUEFUSCA9IGdldFVyaSgnL2Jhci90ZXN0LmNvZGUtd29ya3NwYWNlJyk7IC8vIGxvY2F0aW9uIG9mIHRoZSB3b3Jrc3BhY2UgZmlsZSAobm90IGltcG9ydGFudCBleGNlcHQgdGhhdCBpdCBpcyBhIGZpbGUgVVJJKVxuXG5cdGxldCBpbnN0YW50aWF0aW9uU2VydmljZTogVGVzdEluc3RhbnRpYXRpb25TZXJ2aWNlO1xuXHRsZXQgcXVlcnlCdWlsZGVyOiBRdWVyeUJ1aWxkZXI7XG5cdGxldCBtb2NrQ29uZmlnU2VydmljZTogVGVzdENvbmZpZ3VyYXRpb25TZXJ2aWNlO1xuXHRsZXQgbW9ja0NvbnRleHRTZXJ2aWNlOiBUZXN0Q29udGV4dFNlcnZpY2U7XG5cdGxldCBtb2NrV29ya3NwYWNlOiBXb3Jrc3BhY2U7XG5cblx0c2V0dXAoKCkgPT4ge1xuXHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlID0gbmV3IFRlc3RJbnN0YW50aWF0aW9uU2VydmljZSgpO1xuXG5cdFx0bW9ja0NvbmZpZ1NlcnZpY2UgPSBuZXcgVGVzdENvbmZpZ3VyYXRpb25TZXJ2aWNlKCk7XG5cdFx0bW9ja0NvbmZpZ1NlcnZpY2Uuc2V0VXNlckNvbmZpZ3VyYXRpb24oJ3NlYXJjaCcsIERFRkFVTFRfVVNFUl9DT05GSUcpO1xuXHRcdG1vY2tDb25maWdTZXJ2aWNlLnNldFVzZXJDb25maWd1cmF0aW9uKCdlZGl0b3InLCBERUZBVUxUX0VESVRPUl9DT05GSUcpO1xuXHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSUNvbmZpZ3VyYXRpb25TZXJ2aWNlLCBtb2NrQ29uZmlnU2VydmljZSk7XG5cblx0XHRtb2NrQ29udGV4dFNlcnZpY2UgPSBuZXcgVGVzdENvbnRleHRTZXJ2aWNlKCk7XG5cdFx0bW9ja1dvcmtzcGFjZSA9IG5ldyBXb3Jrc3BhY2UoJ3dvcmtzcGFjZScsIFt0b1dvcmtzcGFjZUZvbGRlcihST09UXzFfVVJJKV0pO1xuXHRcdG1vY2tDb250ZXh0U2VydmljZS5zZXRXb3Jrc3BhY2UobW9ja1dvcmtzcGFjZSk7XG5cblx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElXb3Jrc3BhY2VDb250ZXh0U2VydmljZSwgbW9ja0NvbnRleHRTZXJ2aWNlKTtcblx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElFbnZpcm9ubWVudFNlcnZpY2UsIFRlc3RFbnZpcm9ubWVudFNlcnZpY2UpO1xuXHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSVBhdGhTZXJ2aWNlLCBuZXcgVGVzdFBhdGhTZXJ2aWNlKCkpO1xuXG5cdFx0cXVlcnlCdWlsZGVyID0gaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoUXVlcnlCdWlsZGVyKTtcblx0fSk7XG5cblx0dGVhcmRvd24oKCkgPT4ge1xuXHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLmRpc3Bvc2UoKTtcblx0fSk7XG5cblx0dGVzdCgnc2ltcGxlIHRleHQgcGF0dGVybicsICgpID0+IHtcblx0XHRhc3NlcnRFcXVhbFRleHRRdWVyaWVzKFxuXHRcdFx0cXVlcnlCdWlsZGVyLnRleHQoUEFUVEVSTl9JTkZPKSxcblx0XHRcdHtcblx0XHRcdFx0Zm9sZGVyUXVlcmllczogW10sXG5cdFx0XHRcdGNvbnRlbnRQYXR0ZXJuOiBQQVRURVJOX0lORk8sXG5cdFx0XHRcdHR5cGU6IFF1ZXJ5VHlwZS5UZXh0XG5cdFx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnbm9ybWFsaXplIGxpdGVyYWwgbmV3bGluZXMnLCAoKSA9PiB7XG5cdFx0YXNzZXJ0RXF1YWxUZXh0UXVlcmllcyhcblx0XHRcdHF1ZXJ5QnVpbGRlci50ZXh0KHsgcGF0dGVybjogJ2Zvb1xcbmJhcicsIGlzUmVnRXhwOiB0cnVlIH0pLFxuXHRcdFx0e1xuXHRcdFx0XHRmb2xkZXJRdWVyaWVzOiBbXSxcblx0XHRcdFx0Y29udGVudFBhdHRlcm46IHtcblx0XHRcdFx0XHRwYXR0ZXJuOiAnZm9vXFxcXG5iYXInLFxuXHRcdFx0XHRcdGlzUmVnRXhwOiB0cnVlLFxuXHRcdFx0XHRcdGlzTXVsdGlsaW5lOiB0cnVlXG5cdFx0XHRcdH0sXG5cdFx0XHRcdHR5cGU6IFF1ZXJ5VHlwZS5UZXh0XG5cdFx0XHR9KTtcblxuXHRcdGFzc2VydEVxdWFsVGV4dFF1ZXJpZXMoXG5cdFx0XHRxdWVyeUJ1aWxkZXIudGV4dCh7IHBhdHRlcm46ICdmb29cXG5iYXInLCBpc1JlZ0V4cDogZmFsc2UgfSksXG5cdFx0XHR7XG5cdFx0XHRcdGZvbGRlclF1ZXJpZXM6IFtdLFxuXHRcdFx0XHRjb250ZW50UGF0dGVybjoge1xuXHRcdFx0XHRcdHBhdHRlcm46ICdmb29cXG5iYXInLFxuXHRcdFx0XHRcdGlzUmVnRXhwOiBmYWxzZSxcblx0XHRcdFx0XHRpc011bHRpbGluZTogdHJ1ZVxuXHRcdFx0XHR9LFxuXHRcdFx0XHR0eXBlOiBRdWVyeVR5cGUuVGV4dFxuXHRcdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3NwbGl0cyBpbmNsdWRlIHBhdHRlcm4gd2hlbiBleHBhbmRQYXR0ZXJucyBlbmFibGVkJywgKCkgPT4ge1xuXHRcdGFzc2VydEVxdWFsUXVlcmllcyhcblx0XHRcdHF1ZXJ5QnVpbGRlci5maWxlKFxuXHRcdFx0XHRbUk9PVF8xX05BTUVEX0ZPTERFUl0sXG5cdFx0XHRcdHsgaW5jbHVkZVBhdHRlcm46ICcqKi9mb28sICoqL2JhcicsIGV4cGFuZFBhdHRlcm5zOiB0cnVlIH0sXG5cdFx0XHQpLFxuXHRcdFx0e1xuXHRcdFx0XHRmb2xkZXJRdWVyaWVzOiBbe1xuXHRcdFx0XHRcdGZvbGRlcjogUk9PVF8xX1VSSVxuXHRcdFx0XHR9XSxcblx0XHRcdFx0dHlwZTogUXVlcnlUeXBlLkZpbGUsXG5cdFx0XHRcdGluY2x1ZGVQYXR0ZXJuOiB7XG5cdFx0XHRcdFx0JyoqL2Zvbyc6IHRydWUsXG5cdFx0XHRcdFx0JyoqL2Zvby8qKic6IHRydWUsXG5cdFx0XHRcdFx0JyoqL2Jhcic6IHRydWUsXG5cdFx0XHRcdFx0JyoqL2Jhci8qKic6IHRydWUsXG5cdFx0XHRcdH1cblx0XHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdkb2VzIG5vdCBzcGxpdCBpbmNsdWRlIHBhdHRlcm4gd2hlbiBleHBhbmRQYXR0ZXJucyBkaXNhYmxlZCcsICgpID0+IHtcblx0XHRhc3NlcnRFcXVhbFF1ZXJpZXMoXG5cdFx0XHRxdWVyeUJ1aWxkZXIuZmlsZShcblx0XHRcdFx0W1JPT1RfMV9OQU1FRF9GT0xERVJdLFxuXHRcdFx0XHR7IGluY2x1ZGVQYXR0ZXJuOiAnKiovZm9vLCAqKi9iYXInIH0sXG5cdFx0XHQpLFxuXHRcdFx0e1xuXHRcdFx0XHRmb2xkZXJRdWVyaWVzOiBbe1xuXHRcdFx0XHRcdGZvbGRlcjogUk9PVF8xX1VSSVxuXHRcdFx0XHR9XSxcblx0XHRcdFx0dHlwZTogUXVlcnlUeXBlLkZpbGUsXG5cdFx0XHRcdGluY2x1ZGVQYXR0ZXJuOiB7XG5cdFx0XHRcdFx0JyoqL2ZvbywgKiovYmFyJzogdHJ1ZVxuXHRcdFx0XHR9XG5cdFx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnaW5jbHVkZVBhdHRlcm4gYXJyYXknLCAoKSA9PiB7XG5cdFx0YXNzZXJ0RXF1YWxRdWVyaWVzKFxuXHRcdFx0cXVlcnlCdWlsZGVyLmZpbGUoXG5cdFx0XHRcdFtST09UXzFfTkFNRURfRk9MREVSXSxcblx0XHRcdFx0eyBpbmNsdWRlUGF0dGVybjogWycqKi9mb28nLCAnKiovYmFyJ10gfSxcblx0XHRcdCksXG5cdFx0XHR7XG5cdFx0XHRcdGZvbGRlclF1ZXJpZXM6IFt7XG5cdFx0XHRcdFx0Zm9sZGVyOiBST09UXzFfVVJJXG5cdFx0XHRcdH1dLFxuXHRcdFx0XHR0eXBlOiBRdWVyeVR5cGUuRmlsZSxcblx0XHRcdFx0aW5jbHVkZVBhdHRlcm46IHtcblx0XHRcdFx0XHQnKiovZm9vJzogdHJ1ZSxcblx0XHRcdFx0XHQnKiovYmFyJzogdHJ1ZVxuXHRcdFx0XHR9XG5cdFx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnaW5jbHVkZVBhdHRlcm4gYXJyYXkgd2l0aCBleHBhbmRQYXR0ZXJucycsICgpID0+IHtcblx0XHRhc3NlcnRFcXVhbFF1ZXJpZXMoXG5cdFx0XHRxdWVyeUJ1aWxkZXIuZmlsZShcblx0XHRcdFx0W1JPT1RfMV9OQU1FRF9GT0xERVJdLFxuXHRcdFx0XHR7IGluY2x1ZGVQYXR0ZXJuOiBbJyoqL2ZvbycsICcqKi9iYXInXSwgZXhwYW5kUGF0dGVybnM6IHRydWUgfSxcblx0XHRcdCksXG5cdFx0XHR7XG5cdFx0XHRcdGZvbGRlclF1ZXJpZXM6IFt7XG5cdFx0XHRcdFx0Zm9sZGVyOiBST09UXzFfVVJJXG5cdFx0XHRcdH1dLFxuXHRcdFx0XHR0eXBlOiBRdWVyeVR5cGUuRmlsZSxcblx0XHRcdFx0aW5jbHVkZVBhdHRlcm46IHtcblx0XHRcdFx0XHQnKiovZm9vJzogdHJ1ZSxcblx0XHRcdFx0XHQnKiovZm9vLyoqJzogdHJ1ZSxcblx0XHRcdFx0XHQnKiovYmFyJzogdHJ1ZSxcblx0XHRcdFx0XHQnKiovYmFyLyoqJzogdHJ1ZSxcblx0XHRcdFx0fVxuXHRcdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2ZvbGRlclJlc291cmNlcycsICgpID0+IHtcblx0XHRhc3NlcnRFcXVhbFRleHRRdWVyaWVzKFxuXHRcdFx0cXVlcnlCdWlsZGVyLnRleHQoXG5cdFx0XHRcdFBBVFRFUk5fSU5GTyxcblx0XHRcdFx0W1JPT1RfMV9VUkldXG5cdFx0XHQpLFxuXHRcdFx0e1xuXHRcdFx0XHRjb250ZW50UGF0dGVybjogUEFUVEVSTl9JTkZPLFxuXHRcdFx0XHRmb2xkZXJRdWVyaWVzOiBbeyBmb2xkZXI6IFJPT1RfMV9VUkkgfV0sXG5cdFx0XHRcdHR5cGU6IFF1ZXJ5VHlwZS5UZXh0XG5cdFx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnc2ltcGxlIGV4Y2x1ZGUgc2V0dGluZycsICgpID0+IHtcblx0XHRtb2NrQ29uZmlnU2VydmljZS5zZXRVc2VyQ29uZmlndXJhdGlvbignc2VhcmNoJywge1xuXHRcdFx0Li4uREVGQVVMVF9VU0VSX0NPTkZJRyxcblx0XHRcdGV4Y2x1ZGU6IHtcblx0XHRcdFx0J2Jhci8qKic6IHRydWUsXG5cdFx0XHRcdCdmb28vKionOiB7XG5cdFx0XHRcdFx0J3doZW4nOiAnJChiYXNlbmFtZSkudHMnXG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9KTtcblxuXHRcdGFzc2VydEVxdWFsVGV4dFF1ZXJpZXMoXG5cdFx0XHRxdWVyeUJ1aWxkZXIudGV4dChcblx0XHRcdFx0UEFUVEVSTl9JTkZPLFxuXHRcdFx0XHRbUk9PVF8xX1VSSV0sXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRleHBhbmRQYXR0ZXJuczogdHJ1ZSAvLyB2ZXJpZnkgdGhhdCB0aGlzIGRvZXNuJ3QgYWZmZWN0IHBhdHRlcm5zIGZyb20gY29uZmlndXJhdGlvblxuXHRcdFx0XHR9XG5cdFx0XHQpLFxuXHRcdFx0e1xuXHRcdFx0XHRjb250ZW50UGF0dGVybjogUEFUVEVSTl9JTkZPLFxuXHRcdFx0XHRmb2xkZXJRdWVyaWVzOiBbe1xuXHRcdFx0XHRcdGZvbGRlcjogUk9PVF8xX1VSSSxcblx0XHRcdFx0XHRleGNsdWRlUGF0dGVybjogW3tcblx0XHRcdFx0XHRcdHBhdHRlcm46IHtcblx0XHRcdFx0XHRcdFx0J2Jhci8qKic6IHRydWUsXG5cdFx0XHRcdFx0XHRcdCdmb28vKionOiB7XG5cdFx0XHRcdFx0XHRcdFx0J3doZW4nOiAnJChiYXNlbmFtZSkudHMnXG5cdFx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHR9XVxuXHRcdFx0XHR9XSxcblx0XHRcdFx0dHlwZTogUXVlcnlUeXBlLlRleHRcblx0XHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdzaW1wbGUgaW5jbHVkZScsICgpID0+IHtcblx0XHRhc3NlcnRFcXVhbFRleHRRdWVyaWVzKFxuXHRcdFx0cXVlcnlCdWlsZGVyLnRleHQoXG5cdFx0XHRcdFBBVFRFUk5fSU5GTyxcblx0XHRcdFx0W1JPT1RfMV9VUkldLFxuXHRcdFx0XHR7XG5cdFx0XHRcdFx0aW5jbHVkZVBhdHRlcm46ICdiYXInLFxuXHRcdFx0XHRcdGV4cGFuZFBhdHRlcm5zOiB0cnVlXG5cdFx0XHRcdH1cblx0XHRcdCksXG5cdFx0XHR7XG5cdFx0XHRcdGNvbnRlbnRQYXR0ZXJuOiBQQVRURVJOX0lORk8sXG5cdFx0XHRcdGZvbGRlclF1ZXJpZXM6IFt7XG5cdFx0XHRcdFx0Zm9sZGVyOiBST09UXzFfVVJJXG5cdFx0XHRcdH1dLFxuXHRcdFx0XHRpbmNsdWRlUGF0dGVybjoge1xuXHRcdFx0XHRcdCcqKi9iYXInOiB0cnVlLFxuXHRcdFx0XHRcdCcqKi9iYXIvKionOiB0cnVlXG5cdFx0XHRcdH0sXG5cdFx0XHRcdHR5cGU6IFF1ZXJ5VHlwZS5UZXh0XG5cdFx0XHR9KTtcblxuXHRcdGFzc2VydEVxdWFsVGV4dFF1ZXJpZXMoXG5cdFx0XHRxdWVyeUJ1aWxkZXIudGV4dChcblx0XHRcdFx0UEFUVEVSTl9JTkZPLFxuXHRcdFx0XHRbUk9PVF8xX1VSSV0sXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRpbmNsdWRlUGF0dGVybjogJ2Jhcidcblx0XHRcdFx0fVxuXHRcdFx0KSxcblx0XHRcdHtcblx0XHRcdFx0Y29udGVudFBhdHRlcm46IFBBVFRFUk5fSU5GTyxcblx0XHRcdFx0Zm9sZGVyUXVlcmllczogW3tcblx0XHRcdFx0XHRmb2xkZXI6IFJPT1RfMV9VUklcblx0XHRcdFx0fV0sXG5cdFx0XHRcdGluY2x1ZGVQYXR0ZXJuOiB7XG5cdFx0XHRcdFx0J2Jhcic6IHRydWVcblx0XHRcdFx0fSxcblx0XHRcdFx0dHlwZTogUXVlcnlUeXBlLlRleHRcblx0XHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdzaW1wbGUgaW5jbHVkZSB3aXRoIC4vIHN5bnRheCcsICgpID0+IHtcblxuXHRcdGFzc2VydEVxdWFsVGV4dFF1ZXJpZXMoXG5cdFx0XHRxdWVyeUJ1aWxkZXIudGV4dChcblx0XHRcdFx0UEFUVEVSTl9JTkZPLFxuXHRcdFx0XHRbUk9PVF8xX1VSSV0sXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRpbmNsdWRlUGF0dGVybjogJy4vYmFyJyxcblx0XHRcdFx0XHRleHBhbmRQYXR0ZXJuczogdHJ1ZVxuXHRcdFx0XHR9XG5cdFx0XHQpLFxuXHRcdFx0e1xuXHRcdFx0XHRjb250ZW50UGF0dGVybjogUEFUVEVSTl9JTkZPLFxuXHRcdFx0XHRmb2xkZXJRdWVyaWVzOiBbe1xuXHRcdFx0XHRcdGZvbGRlcjogUk9PVF8xX1VSSSxcblx0XHRcdFx0XHRpbmNsdWRlUGF0dGVybjoge1xuXHRcdFx0XHRcdFx0J2Jhcic6IHRydWUsXG5cdFx0XHRcdFx0XHQnYmFyLyoqJzogdHJ1ZVxuXHRcdFx0XHRcdH1cblx0XHRcdFx0fV0sXG5cdFx0XHRcdHR5cGU6IFF1ZXJ5VHlwZS5UZXh0XG5cdFx0XHR9KTtcblxuXHRcdGFzc2VydEVxdWFsVGV4dFF1ZXJpZXMoXG5cdFx0XHRxdWVyeUJ1aWxkZXIudGV4dChcblx0XHRcdFx0UEFUVEVSTl9JTkZPLFxuXHRcdFx0XHRbUk9PVF8xX1VSSV0sXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRpbmNsdWRlUGF0dGVybjogJy5cXFxcYmFyJyxcblx0XHRcdFx0XHRleHBhbmRQYXR0ZXJuczogdHJ1ZVxuXHRcdFx0XHR9XG5cdFx0XHQpLFxuXHRcdFx0e1xuXHRcdFx0XHRjb250ZW50UGF0dGVybjogUEFUVEVSTl9JTkZPLFxuXHRcdFx0XHRmb2xkZXJRdWVyaWVzOiBbe1xuXHRcdFx0XHRcdGZvbGRlcjogUk9PVF8xX1VSSSxcblx0XHRcdFx0XHRpbmNsdWRlUGF0dGVybjoge1xuXHRcdFx0XHRcdFx0J2Jhcic6IHRydWUsXG5cdFx0XHRcdFx0XHQnYmFyLyoqJzogdHJ1ZVxuXHRcdFx0XHRcdH1cblx0XHRcdFx0fV0sXG5cdFx0XHRcdHR5cGU6IFF1ZXJ5VHlwZS5UZXh0XG5cdFx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnZXhjbHVkZSBzZXR0aW5nIGFuZCBzZWFyY2hQYXRoJywgKCkgPT4ge1xuXHRcdG1vY2tDb25maWdTZXJ2aWNlLnNldFVzZXJDb25maWd1cmF0aW9uKCdzZWFyY2gnLCB7XG5cdFx0XHQuLi5ERUZBVUxUX1VTRVJfQ09ORklHLFxuXHRcdFx0ZXhjbHVkZToge1xuXHRcdFx0XHQnZm9vLyoqLyouanMnOiB0cnVlLFxuXHRcdFx0XHQnYmFyLyoqJzoge1xuXHRcdFx0XHRcdCd3aGVuJzogJyQoYmFzZW5hbWUpLnRzJ1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fSk7XG5cblx0XHRhc3NlcnRFcXVhbFRleHRRdWVyaWVzKFxuXHRcdFx0cXVlcnlCdWlsZGVyLnRleHQoXG5cdFx0XHRcdFBBVFRFUk5fSU5GTyxcblx0XHRcdFx0W1JPT1RfMV9VUkldLFxuXHRcdFx0XHR7XG5cdFx0XHRcdFx0aW5jbHVkZVBhdHRlcm46ICcuL2ZvbycsXG5cdFx0XHRcdFx0ZXhwYW5kUGF0dGVybnM6IHRydWVcblx0XHRcdFx0fVxuXHRcdFx0KSxcblx0XHRcdHtcblx0XHRcdFx0Y29udGVudFBhdHRlcm46IFBBVFRFUk5fSU5GTyxcblx0XHRcdFx0Zm9sZGVyUXVlcmllczogW3tcblx0XHRcdFx0XHRmb2xkZXI6IFJPT1RfMV9VUkksXG5cdFx0XHRcdFx0aW5jbHVkZVBhdHRlcm46IHtcblx0XHRcdFx0XHRcdCdmb28nOiB0cnVlLFxuXHRcdFx0XHRcdFx0J2Zvby8qKic6IHRydWVcblx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdGV4Y2x1ZGVQYXR0ZXJuOiBbe1xuXHRcdFx0XHRcdFx0cGF0dGVybjoge1xuXHRcdFx0XHRcdFx0XHQnZm9vLyoqLyouanMnOiB0cnVlLFxuXHRcdFx0XHRcdFx0XHQnYmFyLyoqJzoge1xuXHRcdFx0XHRcdFx0XHRcdCd3aGVuJzogJyQoYmFzZW5hbWUpLnRzJ1xuXHRcdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0fV1cblx0XHRcdFx0fV0sXG5cdFx0XHRcdHR5cGU6IFF1ZXJ5VHlwZS5UZXh0XG5cdFx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnbXVsdGlyb290IGV4Y2x1ZGUgc2V0dGluZ3MnLCAoKSA9PiB7XG5cdFx0Y29uc3QgUk9PVF8yID0gZml4UGF0aCgnL3Byb2plY3Qvcm9vdDInKTtcblx0XHRjb25zdCBST09UXzJfVVJJID0gZ2V0VXJpKFJPT1RfMik7XG5cdFx0Y29uc3QgUk9PVF8zID0gZml4UGF0aCgnL3Byb2plY3Qvcm9vdDMnKTtcblx0XHRjb25zdCBST09UXzNfVVJJID0gZ2V0VXJpKFJPT1RfMyk7XG5cdFx0bW9ja1dvcmtzcGFjZS5mb2xkZXJzID0gdG9Xb3Jrc3BhY2VGb2xkZXJzKFt7IHBhdGg6IFJPT1RfMV9VUkkuZnNQYXRoIH0sIHsgcGF0aDogUk9PVF8yX1VSSS5mc1BhdGggfSwgeyBwYXRoOiBST09UXzNfVVJJLmZzUGF0aCB9XSwgV1NfQ09ORklHX1BBVEgsIGV4dFVyaUJpYXNlZElnbm9yZVBhdGhDYXNlKTtcblx0XHRtb2NrV29ya3NwYWNlLmNvbmZpZ3VyYXRpb24gPSB1cmkuZmlsZShmaXhQYXRoKCcvY29uZmlnJykpO1xuXG5cdFx0bW9ja0NvbmZpZ1NlcnZpY2Uuc2V0VXNlckNvbmZpZ3VyYXRpb24oJ3NlYXJjaCcsIHtcblx0XHRcdC4uLkRFRkFVTFRfVVNFUl9DT05GSUcsXG5cdFx0XHRleGNsdWRlOiB7ICdmb28vKiovKi5qcyc6IHRydWUgfVxuXHRcdH0sIFJPT1RfMV9VUkkpO1xuXG5cdFx0bW9ja0NvbmZpZ1NlcnZpY2Uuc2V0VXNlckNvbmZpZ3VyYXRpb24oJ3NlYXJjaCcsIHtcblx0XHRcdC4uLkRFRkFVTFRfVVNFUl9DT05GSUcsXG5cdFx0XHRleGNsdWRlOiB7ICdiYXInOiB0cnVlIH1cblx0XHR9LCBST09UXzJfVVJJKTtcblxuXHRcdC8vIFRoZXJlIGFyZSAzIHJvb3RzLCB0aGUgZmlyc3QgdHdvIGhhdmUgc2VhcmNoLmV4Y2x1ZGUgc2V0dGluZ3MsIHRlc3QgdGhhdCB0aGUgY29ycmVjdCBiYXNpYyBxdWVyeSBpcyByZXR1cm5lZFxuXHRcdGFzc2VydEVxdWFsVGV4dFF1ZXJpZXMoXG5cdFx0XHRxdWVyeUJ1aWxkZXIudGV4dChcblx0XHRcdFx0UEFUVEVSTl9JTkZPLFxuXHRcdFx0XHRbUk9PVF8xX1VSSSwgUk9PVF8yX1VSSSwgUk9PVF8zX1VSSV1cblx0XHRcdCksXG5cdFx0XHR7XG5cdFx0XHRcdGNvbnRlbnRQYXR0ZXJuOiBQQVRURVJOX0lORk8sXG5cdFx0XHRcdGZvbGRlclF1ZXJpZXM6IFtcblx0XHRcdFx0XHR7IGZvbGRlcjogUk9PVF8xX1VSSSwgZXhjbHVkZVBhdHRlcm46IG1ha2VFeGNsdWRlUGF0dGVybkZyb21QYXR0ZXJucygnZm9vLyoqLyouanMnKSB9LFxuXHRcdFx0XHRcdHsgZm9sZGVyOiBST09UXzJfVVJJLCBleGNsdWRlUGF0dGVybjogbWFrZUV4Y2x1ZGVQYXR0ZXJuRnJvbVBhdHRlcm5zKCdiYXInKSB9LFxuXHRcdFx0XHRcdHsgZm9sZGVyOiBST09UXzNfVVJJIH1cblx0XHRcdFx0XSxcblx0XHRcdFx0dHlwZTogUXVlcnlUeXBlLlRleHRcblx0XHRcdH1cblx0XHQpO1xuXG5cdFx0Ly8gTm93IHRlc3QgdGhhdCBpdCBtZXJnZXMgdGhlIHJvb3QgZXhjbHVkZXMgd2hlbiBhbiAnaW5jbHVkZScgaXMgdXNlZFxuXHRcdGFzc2VydEVxdWFsVGV4dFF1ZXJpZXMoXG5cdFx0XHRxdWVyeUJ1aWxkZXIudGV4dChcblx0XHRcdFx0UEFUVEVSTl9JTkZPLFxuXHRcdFx0XHRbUk9PVF8xX1VSSSwgUk9PVF8yX1VSSSwgUk9PVF8zX1VSSV0sXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRpbmNsdWRlUGF0dGVybjogJy4vcm9vdDIvc3JjJyxcblx0XHRcdFx0XHRleHBhbmRQYXR0ZXJuczogdHJ1ZVxuXHRcdFx0XHR9XG5cdFx0XHQpLFxuXHRcdFx0e1xuXHRcdFx0XHRjb250ZW50UGF0dGVybjogUEFUVEVSTl9JTkZPLFxuXHRcdFx0XHRmb2xkZXJRdWVyaWVzOiBbXG5cdFx0XHRcdFx0e1xuXHRcdFx0XHRcdFx0Zm9sZGVyOiBST09UXzJfVVJJLFxuXHRcdFx0XHRcdFx0aW5jbHVkZVBhdHRlcm46IHtcblx0XHRcdFx0XHRcdFx0J3NyYyc6IHRydWUsXG5cdFx0XHRcdFx0XHRcdCdzcmMvKionOiB0cnVlXG5cdFx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdFx0ZXhjbHVkZVBhdHRlcm46IFt7XG5cdFx0XHRcdFx0XHRcdHBhdHRlcm46IHsgJ2Jhcic6IHRydWUgfVxuXHRcdFx0XHRcdFx0fV0sXG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRdLFxuXHRcdFx0XHR0eXBlOiBRdWVyeVR5cGUuVGV4dFxuXHRcdFx0fVxuXHRcdCk7XG5cdH0pO1xuXG5cdHRlc3QoJ3NpbXBsZSBleGNsdWRlIGlucHV0IHBhdHRlcm4nLCAoKSA9PiB7XG5cdFx0YXNzZXJ0RXF1YWxUZXh0UXVlcmllcyhcblx0XHRcdHF1ZXJ5QnVpbGRlci50ZXh0KFxuXHRcdFx0XHRQQVRURVJOX0lORk8sXG5cdFx0XHRcdFtST09UXzFfVVJJXSxcblx0XHRcdFx0e1xuXHRcdFx0XHRcdGV4Y2x1ZGVQYXR0ZXJuOiBbeyBwYXR0ZXJuOiAnZm9vJyB9XSxcblx0XHRcdFx0XHRleHBhbmRQYXR0ZXJuczogdHJ1ZVxuXHRcdFx0XHR9XG5cdFx0XHQpLFxuXHRcdFx0e1xuXHRcdFx0XHRjb250ZW50UGF0dGVybjogUEFUVEVSTl9JTkZPLFxuXHRcdFx0XHRmb2xkZXJRdWVyaWVzOiBbe1xuXHRcdFx0XHRcdGZvbGRlcjogUk9PVF8xX1VSSVxuXHRcdFx0XHR9XSxcblx0XHRcdFx0dHlwZTogUXVlcnlUeXBlLlRleHQsXG5cdFx0XHRcdGV4Y2x1ZGVQYXR0ZXJuOiBwYXR0ZXJuc1RvSUV4cHJlc3Npb24oLi4uZ2xvYmFsR2xvYignZm9vJykpXG5cdFx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnZmlsZSBwYXR0ZXJuIHRyaW1taW5nJywgKCkgPT4ge1xuXHRcdGNvbnN0IGNvbnRlbnQgPSAnY29udGVudCc7XG5cdFx0YXNzZXJ0RXF1YWxRdWVyaWVzKFxuXHRcdFx0cXVlcnlCdWlsZGVyLmZpbGUoXG5cdFx0XHRcdFtdLFxuXHRcdFx0XHR7IGZpbGVQYXR0ZXJuOiBgICR7Y29udGVudH0gYCB9XG5cdFx0XHQpLFxuXHRcdFx0e1xuXHRcdFx0XHRmb2xkZXJRdWVyaWVzOiBbXSxcblx0XHRcdFx0ZmlsZVBhdHRlcm46IGNvbnRlbnQsXG5cdFx0XHRcdHR5cGU6IFF1ZXJ5VHlwZS5GaWxlXG5cdFx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnZXhjbHVkZSAuLyBzeW50YXgnLCAoKSA9PiB7XG5cdFx0YXNzZXJ0RXF1YWxUZXh0UXVlcmllcyhcblx0XHRcdHF1ZXJ5QnVpbGRlci50ZXh0KFxuXHRcdFx0XHRQQVRURVJOX0lORk8sXG5cdFx0XHRcdFtST09UXzFfVVJJXSxcblx0XHRcdFx0e1xuXHRcdFx0XHRcdGV4Y2x1ZGVQYXR0ZXJuOiBbeyBwYXR0ZXJuOiAnLi9iYXInIH1dLFxuXHRcdFx0XHRcdGV4cGFuZFBhdHRlcm5zOiB0cnVlXG5cdFx0XHRcdH1cblx0XHRcdCksXG5cdFx0XHR7XG5cdFx0XHRcdGNvbnRlbnRQYXR0ZXJuOiBQQVRURVJOX0lORk8sXG5cdFx0XHRcdGZvbGRlclF1ZXJpZXM6IFt7XG5cdFx0XHRcdFx0Zm9sZGVyOiBST09UXzFfVVJJLFxuXHRcdFx0XHRcdGV4Y2x1ZGVQYXR0ZXJuOiBtYWtlRXhjbHVkZVBhdHRlcm5Gcm9tUGF0dGVybnMoJ2JhcicsICdiYXIvKionKSxcblx0XHRcdFx0fV0sXG5cdFx0XHRcdHR5cGU6IFF1ZXJ5VHlwZS5UZXh0XG5cdFx0XHR9KTtcblxuXHRcdGFzc2VydEVxdWFsVGV4dFF1ZXJpZXMoXG5cdFx0XHRxdWVyeUJ1aWxkZXIudGV4dChcblx0XHRcdFx0UEFUVEVSTl9JTkZPLFxuXHRcdFx0XHRbUk9PVF8xX1VSSV0sXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRleGNsdWRlUGF0dGVybjogW3sgcGF0dGVybjogJy4vYmFyLyoqLyoudHMnIH1dLFxuXHRcdFx0XHRcdGV4cGFuZFBhdHRlcm5zOiB0cnVlXG5cdFx0XHRcdH1cblx0XHRcdCksXG5cdFx0XHR7XG5cdFx0XHRcdGNvbnRlbnRQYXR0ZXJuOiBQQVRURVJOX0lORk8sXG5cdFx0XHRcdGZvbGRlclF1ZXJpZXM6IFt7XG5cdFx0XHRcdFx0Zm9sZGVyOiBST09UXzFfVVJJLFxuXHRcdFx0XHRcdGV4Y2x1ZGVQYXR0ZXJuOiBtYWtlRXhjbHVkZVBhdHRlcm5Gcm9tUGF0dGVybnMoJ2Jhci8qKi8qLnRzJywgJ2Jhci8qKi8qLnRzLyoqJyksXG5cdFx0XHRcdH1dLFxuXHRcdFx0XHR0eXBlOiBRdWVyeVR5cGUuVGV4dFxuXHRcdFx0fSk7XG5cblx0XHRhc3NlcnRFcXVhbFRleHRRdWVyaWVzKFxuXHRcdFx0cXVlcnlCdWlsZGVyLnRleHQoXG5cdFx0XHRcdFBBVFRFUk5fSU5GTyxcblx0XHRcdFx0W1JPT1RfMV9VUkldLFxuXHRcdFx0XHR7XG5cdFx0XHRcdFx0ZXhjbHVkZVBhdHRlcm46IFt7IHBhdHRlcm46ICcuXFxcXGJhclxcXFwqKlxcXFwqLnRzJyB9XSxcblx0XHRcdFx0XHRleHBhbmRQYXR0ZXJuczogdHJ1ZVxuXHRcdFx0XHR9XG5cdFx0XHQpLFxuXHRcdFx0e1xuXHRcdFx0XHRjb250ZW50UGF0dGVybjogUEFUVEVSTl9JTkZPLFxuXHRcdFx0XHRmb2xkZXJRdWVyaWVzOiBbe1xuXHRcdFx0XHRcdGZvbGRlcjogUk9PVF8xX1VSSSxcblx0XHRcdFx0XHRleGNsdWRlUGF0dGVybjogbWFrZUV4Y2x1ZGVQYXR0ZXJuRnJvbVBhdHRlcm5zKCdiYXIvKiovKi50cycsICdiYXIvKiovKi50cy8qKicpLFxuXHRcdFx0XHR9XSxcblx0XHRcdFx0dHlwZTogUXVlcnlUeXBlLlRleHRcblx0XHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdleHRyYUZpbGVSZXNvdXJjZXMnLCAoKSA9PiB7XG5cdFx0YXNzZXJ0RXF1YWxUZXh0UXVlcmllcyhcblx0XHRcdHF1ZXJ5QnVpbGRlci50ZXh0KFxuXHRcdFx0XHRQQVRURVJOX0lORk8sXG5cdFx0XHRcdFtST09UXzFfVVJJXSxcblx0XHRcdFx0eyBleHRyYUZpbGVSZXNvdXJjZXM6IFtnZXRVcmkoJy9mb28vYmFyLmpzJyldIH1cblx0XHRcdCksXG5cdFx0XHR7XG5cdFx0XHRcdGNvbnRlbnRQYXR0ZXJuOiBQQVRURVJOX0lORk8sXG5cdFx0XHRcdGZvbGRlclF1ZXJpZXM6IFt7XG5cdFx0XHRcdFx0Zm9sZGVyOiBST09UXzFfVVJJXG5cdFx0XHRcdH1dLFxuXHRcdFx0XHRleHRyYUZpbGVSZXNvdXJjZXM6IFtnZXRVcmkoJy9mb28vYmFyLmpzJyldLFxuXHRcdFx0XHR0eXBlOiBRdWVyeVR5cGUuVGV4dFxuXHRcdFx0fSk7XG5cblx0XHRhc3NlcnRFcXVhbFRleHRRdWVyaWVzKFxuXHRcdFx0cXVlcnlCdWlsZGVyLnRleHQoXG5cdFx0XHRcdFBBVFRFUk5fSU5GTyxcblx0XHRcdFx0W1JPT1RfMV9VUkldLFxuXHRcdFx0XHR7XG5cdFx0XHRcdFx0ZXh0cmFGaWxlUmVzb3VyY2VzOiBbZ2V0VXJpKCcvZm9vL2Jhci5qcycpXSxcblx0XHRcdFx0XHRleGNsdWRlUGF0dGVybjogW3sgcGF0dGVybjogJyouanMnIH1dLFxuXHRcdFx0XHRcdGV4cGFuZFBhdHRlcm5zOiB0cnVlXG5cdFx0XHRcdH1cblx0XHRcdCksXG5cdFx0XHR7XG5cdFx0XHRcdGNvbnRlbnRQYXR0ZXJuOiBQQVRURVJOX0lORk8sXG5cdFx0XHRcdGZvbGRlclF1ZXJpZXM6IFt7XG5cdFx0XHRcdFx0Zm9sZGVyOiBST09UXzFfVVJJXG5cdFx0XHRcdH1dLFxuXHRcdFx0XHRleGNsdWRlUGF0dGVybjogcGF0dGVybnNUb0lFeHByZXNzaW9uKC4uLmdsb2JhbEdsb2IoJyouanMnKSksXG5cdFx0XHRcdHR5cGU6IFF1ZXJ5VHlwZS5UZXh0XG5cdFx0XHR9KTtcblxuXHRcdGFzc2VydEVxdWFsVGV4dFF1ZXJpZXMoXG5cdFx0XHRxdWVyeUJ1aWxkZXIudGV4dChcblx0XHRcdFx0UEFUVEVSTl9JTkZPLFxuXHRcdFx0XHRbUk9PVF8xX1VSSV0sXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRleHRyYUZpbGVSZXNvdXJjZXM6IFtnZXRVcmkoJy9mb28vYmFyLmpzJyldLFxuXHRcdFx0XHRcdGluY2x1ZGVQYXR0ZXJuOiAnKi50eHQnLFxuXHRcdFx0XHRcdGV4cGFuZFBhdHRlcm5zOiB0cnVlXG5cdFx0XHRcdH1cblx0XHRcdCksXG5cdFx0XHR7XG5cdFx0XHRcdGNvbnRlbnRQYXR0ZXJuOiBQQVRURVJOX0lORk8sXG5cdFx0XHRcdGZvbGRlclF1ZXJpZXM6IFt7XG5cdFx0XHRcdFx0Zm9sZGVyOiBST09UXzFfVVJJXG5cdFx0XHRcdH1dLFxuXHRcdFx0XHRpbmNsdWRlUGF0dGVybjogcGF0dGVybnNUb0lFeHByZXNzaW9uKC4uLmdsb2JhbEdsb2IoJyoudHh0JykpLFxuXHRcdFx0XHR0eXBlOiBRdWVyeVR5cGUuVGV4dFxuXHRcdFx0fSk7XG5cdH0pO1xuXG5cdHN1aXRlKCdwYXJzZVNlYXJjaFBhdGhzIDEnLCAoKSA9PiB7XG5cdFx0dGVzdCgnc2ltcGxlIGluY2x1ZGVzJywgKCkgPT4ge1xuXHRcdFx0ZnVuY3Rpb24gdGVzdFNpbXBsZUluY2x1ZGVzKGluY2x1ZGVQYXR0ZXJuOiBzdHJpbmcsIGV4cGVjdGVkUGF0dGVybnM6IHN0cmluZ1tdKTogdm9pZCB7XG5cdFx0XHRcdGNvbnN0IHJlc3VsdCA9IHF1ZXJ5QnVpbGRlci5wYXJzZVNlYXJjaFBhdGhzKGluY2x1ZGVQYXR0ZXJuKTtcblx0XHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChcblx0XHRcdFx0XHR7IC4uLnJlc3VsdC5wYXR0ZXJuIH0sXG5cdFx0XHRcdFx0cGF0dGVybnNUb0lFeHByZXNzaW9uKC4uLmV4cGVjdGVkUGF0dGVybnMpLFxuXHRcdFx0XHRcdGluY2x1ZGVQYXR0ZXJuKTtcblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdC5zZWFyY2hQYXRocywgdW5kZWZpbmVkKTtcblx0XHRcdH1cblxuXHRcdFx0W1xuXHRcdFx0XHRbJ2EnLCBbJyoqL2EvKionLCAnKiovYSddXSxcblx0XHRcdFx0WydhL2InLCBbJyoqL2EvYicsICcqKi9hL2IvKionXV0sXG5cdFx0XHRcdFsnYS9iLCAgYycsIFsnKiovYS9iJywgJyoqL2MnLCAnKiovYS9iLyoqJywgJyoqL2MvKionXV0sXG5cdFx0XHRcdFsnYSwudHh0JywgWycqKi9hJywgJyoqL2EvKionLCAnKiovKi50eHQnLCAnKiovKi50eHQvKionXV0sXG5cdFx0XHRcdFsnYSwsLGInLCBbJyoqL2EnLCAnKiovYS8qKicsICcqKi9iJywgJyoqL2IvKionXV0sXG5cdFx0XHRcdFsnKiovYSxiLyoqJywgWycqKi9hJywgJyoqL2EvKionLCAnKiovYi8qKiddXVxuXHRcdFx0XS5mb3JFYWNoKChbaW5jbHVkZVBhdHRlcm4sIGV4cGVjdGVkUGF0dGVybnNdKSA9PiB0ZXN0U2ltcGxlSW5jbHVkZXMoPHN0cmluZz5pbmNsdWRlUGF0dGVybiwgPHN0cmluZ1tdPmV4cGVjdGVkUGF0dGVybnMpKTtcblx0XHR9KTtcblxuXHRcdGZ1bmN0aW9uIHRlc3RJbmNsdWRlcyhpbmNsdWRlUGF0dGVybjogc3RyaW5nLCBleHBlY3RlZFJlc3VsdDogSVNlYXJjaFBhdGhzSW5mbyk6IHZvaWQge1xuXHRcdFx0bGV0IGFjdHVhbDogSVNlYXJjaFBhdGhzSW5mbztcblx0XHRcdHRyeSB7XG5cdFx0XHRcdGFjdHVhbCA9IHF1ZXJ5QnVpbGRlci5wYXJzZVNlYXJjaFBhdGhzKGluY2x1ZGVQYXR0ZXJuKTtcblx0XHRcdH0gY2F0Y2ggKF8pIHtcblx0XHRcdFx0YWN0dWFsID0geyBzZWFyY2hQYXRoczogW10gfTtcblx0XHRcdH1cblxuXHRcdFx0YXNzZXJ0RXF1YWxTZWFyY2hQYXRoUmVzdWx0cyhcblx0XHRcdFx0YWN0dWFsLFxuXHRcdFx0XHRleHBlY3RlZFJlc3VsdCxcblx0XHRcdFx0aW5jbHVkZVBhdHRlcm4pO1xuXHRcdH1cblxuXHRcdGZ1bmN0aW9uIHRlc3RJbmNsdWRlc0RhdGFJdGVtKFtpbmNsdWRlUGF0dGVybiwgZXhwZWN0ZWRSZXN1bHRdOiBbc3RyaW5nLCBJU2VhcmNoUGF0aHNJbmZvXSk6IHZvaWQge1xuXHRcdFx0dGVzdEluY2x1ZGVzKGluY2x1ZGVQYXR0ZXJuLCBleHBlY3RlZFJlc3VsdCk7XG5cdFx0fVxuXG5cdFx0dGVzdCgnYWJzb2x1dGUgaW5jbHVkZXMnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBjYXNlczogW3N0cmluZywgSVNlYXJjaFBhdGhzSW5mb11bXSA9IFtcblx0XHRcdFx0W1xuXHRcdFx0XHRcdGZpeFBhdGgoJy9mb28vYmFyJyksXG5cdFx0XHRcdFx0e1xuXHRcdFx0XHRcdFx0c2VhcmNoUGF0aHM6IFt7IHNlYXJjaFBhdGg6IGdldFVyaSgnL2Zvby9iYXInKSB9XVxuXHRcdFx0XHRcdH1cblx0XHRcdFx0XSxcblx0XHRcdFx0W1xuXHRcdFx0XHRcdGZpeFBhdGgoJy9mb28vYmFyJykgKyAnLCcgKyAnYScsXG5cdFx0XHRcdFx0e1xuXHRcdFx0XHRcdFx0c2VhcmNoUGF0aHM6IFt7IHNlYXJjaFBhdGg6IGdldFVyaSgnL2Zvby9iYXInKSB9XSxcblx0XHRcdFx0XHRcdHBhdHRlcm46IHBhdHRlcm5zVG9JRXhwcmVzc2lvbiguLi5nbG9iYWxHbG9iKCdhJykpXG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRdLFxuXHRcdFx0XHRbXG5cdFx0XHRcdFx0Zml4UGF0aCgnL2Zvby9iYXInKSArICcsJyArIGZpeFBhdGgoJy8xLzInKSxcblx0XHRcdFx0XHR7XG5cdFx0XHRcdFx0XHRzZWFyY2hQYXRoczogW3sgc2VhcmNoUGF0aDogZ2V0VXJpKCcvZm9vL2JhcicpIH0sIHsgc2VhcmNoUGF0aDogZ2V0VXJpKCcvMS8yJykgfV1cblx0XHRcdFx0XHR9XG5cdFx0XHRcdF0sXG5cdFx0XHRcdFtcblx0XHRcdFx0XHRmaXhQYXRoKCcvZm9vL2JhcicpICsgJywnICsgZml4UGF0aCgnL2Zvby8uLi9mb28vYmFyL2Zvb2FyLy4uJyksXG5cdFx0XHRcdFx0e1xuXHRcdFx0XHRcdFx0c2VhcmNoUGF0aHM6IFt7XG5cdFx0XHRcdFx0XHRcdHNlYXJjaFBhdGg6IGdldFVyaSgnL2Zvby9iYXInKVxuXHRcdFx0XHRcdFx0fV1cblx0XHRcdFx0XHR9XG5cdFx0XHRcdF0sXG5cdFx0XHRcdFtcblx0XHRcdFx0XHRmaXhQYXRoKCcvZm9vL2Jhci8qKi8qLnRzJyksXG5cdFx0XHRcdFx0e1xuXHRcdFx0XHRcdFx0c2VhcmNoUGF0aHM6IFt7XG5cdFx0XHRcdFx0XHRcdHNlYXJjaFBhdGg6IGdldFVyaSgnL2Zvby9iYXInKSxcblx0XHRcdFx0XHRcdFx0cGF0dGVybjogcGF0dGVybnNUb0lFeHByZXNzaW9uKCcqKi8qLnRzJywgJyoqLyoudHMvKionKVxuXHRcdFx0XHRcdFx0fV1cblx0XHRcdFx0XHR9XG5cdFx0XHRcdF0sXG5cdFx0XHRcdFtcblx0XHRcdFx0XHRmaXhQYXRoKCcvZm9vL2Jhci8qYS9iL2MnKSxcblx0XHRcdFx0XHR7XG5cdFx0XHRcdFx0XHRzZWFyY2hQYXRoczogW3tcblx0XHRcdFx0XHRcdFx0c2VhcmNoUGF0aDogZ2V0VXJpKCcvZm9vL2JhcicpLFxuXHRcdFx0XHRcdFx0XHRwYXR0ZXJuOiBwYXR0ZXJuc1RvSUV4cHJlc3Npb24oJyphL2IvYycsICcqYS9iL2MvKionKVxuXHRcdFx0XHRcdFx0fV1cblx0XHRcdFx0XHR9XG5cdFx0XHRcdF0sXG5cdFx0XHRcdFtcblx0XHRcdFx0XHRmaXhQYXRoKCcvKmEvYi9jJyksXG5cdFx0XHRcdFx0e1xuXHRcdFx0XHRcdFx0c2VhcmNoUGF0aHM6IFt7XG5cdFx0XHRcdFx0XHRcdHNlYXJjaFBhdGg6IGdldFVyaSgnLycpLFxuXHRcdFx0XHRcdFx0XHRwYXR0ZXJuOiBwYXR0ZXJuc1RvSUV4cHJlc3Npb24oJyphL2IvYycsICcqYS9iL2MvKionKVxuXHRcdFx0XHRcdFx0fV1cblx0XHRcdFx0XHR9XG5cdFx0XHRcdF0sXG5cdFx0XHRcdFtcblx0XHRcdFx0XHRmaXhQYXRoKCcvZm9vL3tiLGN9YXInKSxcblx0XHRcdFx0XHR7XG5cdFx0XHRcdFx0XHRzZWFyY2hQYXRoczogW3tcblx0XHRcdFx0XHRcdFx0c2VhcmNoUGF0aDogZ2V0VXJpKCcvZm9vJyksXG5cdFx0XHRcdFx0XHRcdHBhdHRlcm46IHBhdHRlcm5zVG9JRXhwcmVzc2lvbigne2IsY31hcicsICd7YixjfWFyLyoqJylcblx0XHRcdFx0XHRcdH1dXG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRdXG5cdFx0XHRdO1xuXHRcdFx0Y2FzZXMuZm9yRWFjaCh0ZXN0SW5jbHVkZXNEYXRhSXRlbSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdyZWxhdGl2ZSBpbmNsdWRlcyB3L3NpbmdsZSByb290IGZvbGRlcicsICgpID0+IHtcblx0XHRcdGNvbnN0IGNhc2VzOiBbc3RyaW5nLCBJU2VhcmNoUGF0aHNJbmZvXVtdID0gW1xuXHRcdFx0XHRbXG5cdFx0XHRcdFx0Jy4vYScsXG5cdFx0XHRcdFx0e1xuXHRcdFx0XHRcdFx0c2VhcmNoUGF0aHM6IFt7XG5cdFx0XHRcdFx0XHRcdHNlYXJjaFBhdGg6IFJPT1RfMV9VUkksXG5cdFx0XHRcdFx0XHRcdHBhdHRlcm46IHBhdHRlcm5zVG9JRXhwcmVzc2lvbignYScsICdhLyoqJylcblx0XHRcdFx0XHRcdH1dXG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRdLFxuXHRcdFx0XHRbXG5cdFx0XHRcdFx0Jy4vYS8nLFxuXHRcdFx0XHRcdHtcblx0XHRcdFx0XHRcdHNlYXJjaFBhdGhzOiBbe1xuXHRcdFx0XHRcdFx0XHRzZWFyY2hQYXRoOiBST09UXzFfVVJJLFxuXHRcdFx0XHRcdFx0XHRwYXR0ZXJuOiBwYXR0ZXJuc1RvSUV4cHJlc3Npb24oJ2EnLCAnYS8qKicpXG5cdFx0XHRcdFx0XHR9XVxuXHRcdFx0XHRcdH1cblx0XHRcdFx0XSxcblx0XHRcdFx0W1xuXHRcdFx0XHRcdCcuL2EvKmIvYycsXG5cdFx0XHRcdFx0e1xuXHRcdFx0XHRcdFx0c2VhcmNoUGF0aHM6IFt7XG5cdFx0XHRcdFx0XHRcdHNlYXJjaFBhdGg6IFJPT1RfMV9VUkksXG5cdFx0XHRcdFx0XHRcdHBhdHRlcm46IHBhdHRlcm5zVG9JRXhwcmVzc2lvbignYS8qYi9jJywgJ2EvKmIvYy8qKicpXG5cdFx0XHRcdFx0XHR9XVxuXHRcdFx0XHRcdH1cblx0XHRcdFx0XSxcblx0XHRcdFx0W1xuXHRcdFx0XHRcdCcuL2EvKmIvYywgJyArIGZpeFBhdGgoJy9wcm9qZWN0L2ZvbycpLFxuXHRcdFx0XHRcdHtcblx0XHRcdFx0XHRcdHNlYXJjaFBhdGhzOiBbXG5cdFx0XHRcdFx0XHRcdHtcblx0XHRcdFx0XHRcdFx0XHRzZWFyY2hQYXRoOiBST09UXzFfVVJJLFxuXHRcdFx0XHRcdFx0XHRcdHBhdHRlcm46IHBhdHRlcm5zVG9JRXhwcmVzc2lvbignYS8qYi9jJywgJ2EvKmIvYy8qKicpXG5cdFx0XHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0XHRcdHtcblx0XHRcdFx0XHRcdFx0XHRzZWFyY2hQYXRoOiBnZXRVcmkoJy9wcm9qZWN0L2ZvbycpXG5cdFx0XHRcdFx0XHRcdH1dXG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRdLFxuXHRcdFx0XHRbXG5cdFx0XHRcdFx0Jy4vYS9iLywuL2MvZCcsXG5cdFx0XHRcdFx0e1xuXHRcdFx0XHRcdFx0c2VhcmNoUGF0aHM6IFt7XG5cdFx0XHRcdFx0XHRcdHNlYXJjaFBhdGg6IFJPT1RfMV9VUkksXG5cdFx0XHRcdFx0XHRcdHBhdHRlcm46IHBhdHRlcm5zVG9JRXhwcmVzc2lvbignYS9iJywgJ2EvYi8qKicsICdjL2QnLCAnYy9kLyoqJylcblx0XHRcdFx0XHRcdH1dXG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRdLFxuXHRcdFx0XHRbXG5cdFx0XHRcdFx0Jy4uLycsXG5cdFx0XHRcdFx0e1xuXHRcdFx0XHRcdFx0c2VhcmNoUGF0aHM6IFt7XG5cdFx0XHRcdFx0XHRcdHNlYXJjaFBhdGg6IGdldFVyaSgnL2ZvbycpXG5cdFx0XHRcdFx0XHR9XVxuXHRcdFx0XHRcdH1cblx0XHRcdFx0XSxcblx0XHRcdFx0W1xuXHRcdFx0XHRcdCcuLicsXG5cdFx0XHRcdFx0e1xuXHRcdFx0XHRcdFx0c2VhcmNoUGF0aHM6IFt7XG5cdFx0XHRcdFx0XHRcdHNlYXJjaFBhdGg6IGdldFVyaSgnL2ZvbycpXG5cdFx0XHRcdFx0XHR9XVxuXHRcdFx0XHRcdH1cblx0XHRcdFx0XSxcblx0XHRcdFx0W1xuXHRcdFx0XHRcdCcuLlxcXFxiYXInLFxuXHRcdFx0XHRcdHtcblx0XHRcdFx0XHRcdHNlYXJjaFBhdGhzOiBbe1xuXHRcdFx0XHRcdFx0XHRzZWFyY2hQYXRoOiBnZXRVcmkoJy9mb28vYmFyJylcblx0XHRcdFx0XHRcdH1dXG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRdXG5cdFx0XHRdO1xuXHRcdFx0Y2FzZXMuZm9yRWFjaCh0ZXN0SW5jbHVkZXNEYXRhSXRlbSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdyZWxhdGl2ZSBpbmNsdWRlcyB3L3R3byByb290IGZvbGRlcnMnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBST09UXzIgPSAnL3Byb2plY3Qvcm9vdDInO1xuXHRcdFx0bW9ja1dvcmtzcGFjZS5mb2xkZXJzID0gdG9Xb3Jrc3BhY2VGb2xkZXJzKFt7IHBhdGg6IFJPT1RfMV9VUkkuZnNQYXRoIH0sIHsgcGF0aDogZ2V0VXJpKFJPT1RfMikuZnNQYXRoIH1dLCBXU19DT05GSUdfUEFUSCwgZXh0VXJpQmlhc2VkSWdub3JlUGF0aENhc2UpO1xuXHRcdFx0bW9ja1dvcmtzcGFjZS5jb25maWd1cmF0aW9uID0gdXJpLmZpbGUoZml4UGF0aCgnY29uZmlnJykpO1xuXG5cdFx0XHRjb25zdCBjYXNlczogW3N0cmluZywgSVNlYXJjaFBhdGhzSW5mb11bXSA9IFtcblx0XHRcdFx0W1xuXHRcdFx0XHRcdCcuL3Jvb3QxJyxcblx0XHRcdFx0XHR7XG5cdFx0XHRcdFx0XHRzZWFyY2hQYXRoczogW3tcblx0XHRcdFx0XHRcdFx0c2VhcmNoUGF0aDogZ2V0VXJpKFJPT1RfMSlcblx0XHRcdFx0XHRcdH1dXG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRdLFxuXHRcdFx0XHRbXG5cdFx0XHRcdFx0Jy4vcm9vdDInLFxuXHRcdFx0XHRcdHtcblx0XHRcdFx0XHRcdHNlYXJjaFBhdGhzOiBbe1xuXHRcdFx0XHRcdFx0XHRzZWFyY2hQYXRoOiBnZXRVcmkoUk9PVF8yKSxcblx0XHRcdFx0XHRcdH1dXG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRdLFxuXHRcdFx0XHRbXG5cdFx0XHRcdFx0Jy4vcm9vdDEvYS8qKi9iLCAuL3Jvb3QyLyoqLyoudHh0Jyxcblx0XHRcdFx0XHR7XG5cdFx0XHRcdFx0XHRzZWFyY2hQYXRoczogW1xuXHRcdFx0XHRcdFx0XHR7XG5cdFx0XHRcdFx0XHRcdFx0c2VhcmNoUGF0aDogUk9PVF8xX1VSSSxcblx0XHRcdFx0XHRcdFx0XHRwYXR0ZXJuOiBwYXR0ZXJuc1RvSUV4cHJlc3Npb24oJ2EvKiovYicsICdhLyoqL2IvKionKVxuXHRcdFx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdFx0XHR7XG5cdFx0XHRcdFx0XHRcdFx0c2VhcmNoUGF0aDogZ2V0VXJpKFJPT1RfMiksXG5cdFx0XHRcdFx0XHRcdFx0cGF0dGVybjogcGF0dGVybnNUb0lFeHByZXNzaW9uKCcqKi8qLnR4dCcsICcqKi8qLnR4dC8qKicpXG5cdFx0XHRcdFx0XHRcdH1dXG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRdXG5cdFx0XHRdO1xuXHRcdFx0Y2FzZXMuZm9yRWFjaCh0ZXN0SW5jbHVkZXNEYXRhSXRlbSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdpbmNsdWRlIC4vZm9sZGVybmFtZScsICgpID0+IHtcblx0XHRcdGNvbnN0IFJPT1RfMiA9ICcvcHJvamVjdC9yb290Mic7XG5cdFx0XHRjb25zdCBST09UXzFfRk9MREVSTkFNRSA9ICdmb2xkZXJuYW1lJztcblx0XHRcdG1vY2tXb3Jrc3BhY2UuZm9sZGVycyA9IHRvV29ya3NwYWNlRm9sZGVycyhbeyBwYXRoOiBST09UXzFfVVJJLmZzUGF0aCwgbmFtZTogUk9PVF8xX0ZPTERFUk5BTUUgfSwgeyBwYXRoOiBnZXRVcmkoUk9PVF8yKS5mc1BhdGggfV0sIFdTX0NPTkZJR19QQVRILCBleHRVcmlCaWFzZWRJZ25vcmVQYXRoQ2FzZSk7XG5cdFx0XHRtb2NrV29ya3NwYWNlLmNvbmZpZ3VyYXRpb24gPSB1cmkuZmlsZShmaXhQYXRoKCdjb25maWcnKSk7XG5cblx0XHRcdGNvbnN0IGNhc2VzOiBbc3RyaW5nLCBJU2VhcmNoUGF0aHNJbmZvXVtdID0gW1xuXHRcdFx0XHRbXG5cdFx0XHRcdFx0Jy4vZm9sZGVybmFtZScsXG5cdFx0XHRcdFx0e1xuXHRcdFx0XHRcdFx0c2VhcmNoUGF0aHM6IFt7XG5cdFx0XHRcdFx0XHRcdHNlYXJjaFBhdGg6IFJPT1RfMV9VUklcblx0XHRcdFx0XHRcdH1dXG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRdLFxuXHRcdFx0XHRbXG5cdFx0XHRcdFx0Jy4vZm9sZGVybmFtZS9mb28nLFxuXHRcdFx0XHRcdHtcblx0XHRcdFx0XHRcdHNlYXJjaFBhdGhzOiBbe1xuXHRcdFx0XHRcdFx0XHRzZWFyY2hQYXRoOiBST09UXzFfVVJJLFxuXHRcdFx0XHRcdFx0XHRwYXR0ZXJuOiBwYXR0ZXJuc1RvSUV4cHJlc3Npb24oJ2ZvbycsICdmb28vKionKVxuXHRcdFx0XHRcdFx0fV1cblx0XHRcdFx0XHR9XG5cdFx0XHRcdF1cblx0XHRcdF07XG5cdFx0XHRjYXNlcy5mb3JFYWNoKHRlc3RJbmNsdWRlc0RhdGFJdGVtKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2ZvbGRlciB3aXRoIHNsYXNoIGluIHRoZSBuYW1lJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgUk9PVF8yID0gJy9wcm9qZWN0L3Jvb3QyJztcblx0XHRcdGNvbnN0IFJPT1RfMl9VUkkgPSBnZXRVcmkoUk9PVF8yKTtcblx0XHRcdGNvbnN0IFJPT1RfMV9GT0xERVJOQU1FID0gJ2ZvbGRlci9vbmUnO1xuXHRcdFx0Y29uc3QgUk9PVF8yX0ZPTERFUk5BTUUgPSAnZm9sZGVyL3R3bysnOyAvLyBBbmQgYW5vdGhlciByZWdleCBjaGFyYWN0ZXIsICMxMjYwMDNcblx0XHRcdG1vY2tXb3Jrc3BhY2UuZm9sZGVycyA9IHRvV29ya3NwYWNlRm9sZGVycyhbeyBwYXRoOiBST09UXzFfVVJJLmZzUGF0aCwgbmFtZTogUk9PVF8xX0ZPTERFUk5BTUUgfSwgeyBwYXRoOiBST09UXzJfVVJJLmZzUGF0aCwgbmFtZTogUk9PVF8yX0ZPTERFUk5BTUUgfV0sIFdTX0NPTkZJR19QQVRILCBleHRVcmlCaWFzZWRJZ25vcmVQYXRoQ2FzZSk7XG5cdFx0XHRtb2NrV29ya3NwYWNlLmNvbmZpZ3VyYXRpb24gPSB1cmkuZmlsZShmaXhQYXRoKCdjb25maWcnKSk7XG5cblx0XHRcdGNvbnN0IGNhc2VzOiBbc3RyaW5nLCBJU2VhcmNoUGF0aHNJbmZvXVtdID0gW1xuXHRcdFx0XHRbXG5cdFx0XHRcdFx0Jy4vZm9sZGVyL29uZScsXG5cdFx0XHRcdFx0e1xuXHRcdFx0XHRcdFx0c2VhcmNoUGF0aHM6IFt7XG5cdFx0XHRcdFx0XHRcdHNlYXJjaFBhdGg6IFJPT1RfMV9VUklcblx0XHRcdFx0XHRcdH1dXG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRdLFxuXHRcdFx0XHRbXG5cdFx0XHRcdFx0Jy4vZm9sZGVyL3R3bysvZm9vLycsXG5cdFx0XHRcdFx0e1xuXHRcdFx0XHRcdFx0c2VhcmNoUGF0aHM6IFt7XG5cdFx0XHRcdFx0XHRcdHNlYXJjaFBhdGg6IFJPT1RfMl9VUkksXG5cdFx0XHRcdFx0XHRcdHBhdHRlcm46IHBhdHRlcm5zVG9JRXhwcmVzc2lvbignZm9vJywgJ2Zvby8qKicpXG5cdFx0XHRcdFx0XHR9XVxuXHRcdFx0XHRcdH1cblx0XHRcdFx0XSxcblx0XHRcdFx0W1xuXHRcdFx0XHRcdCcuL2ZvbGRlci9vbmVzb21ldGhpbmdlbHNlJyxcblx0XHRcdFx0XHR7IHNlYXJjaFBhdGhzOiBbXSB9XG5cdFx0XHRcdF0sXG5cdFx0XHRcdFtcblx0XHRcdFx0XHQnLi9mb2xkZXIvb25lc29tZXRoaW5nZWxzZS9mb28nLFxuXHRcdFx0XHRcdHsgc2VhcmNoUGF0aHM6IFtdIH1cblx0XHRcdFx0XSxcblx0XHRcdFx0W1xuXHRcdFx0XHRcdCcuL2ZvbGRlcicsXG5cdFx0XHRcdFx0eyBzZWFyY2hQYXRoczogW10gfVxuXHRcdFx0XHRdXG5cdFx0XHRdO1xuXHRcdFx0Y2FzZXMuZm9yRWFjaCh0ZXN0SW5jbHVkZXNEYXRhSXRlbSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdyZWxhdGl2ZSBpbmNsdWRlcyB3L211bHRpcGxlIGFtYmlndW91cyByb290IGZvbGRlcnMnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBST09UXzIgPSAnL3Byb2plY3Qvcm9vdEInO1xuXHRcdFx0Y29uc3QgUk9PVF8zID0gJy9vdGhlcnByb2plY3Qvcm9vdEInO1xuXHRcdFx0bW9ja1dvcmtzcGFjZS5mb2xkZXJzID0gdG9Xb3Jrc3BhY2VGb2xkZXJzKFt7IHBhdGg6IFJPT1RfMV9VUkkuZnNQYXRoIH0sIHsgcGF0aDogZ2V0VXJpKFJPT1RfMikuZnNQYXRoIH0sIHsgcGF0aDogZ2V0VXJpKFJPT1RfMykuZnNQYXRoIH1dLCBXU19DT05GSUdfUEFUSCwgZXh0VXJpQmlhc2VkSWdub3JlUGF0aENhc2UpO1xuXHRcdFx0bW9ja1dvcmtzcGFjZS5jb25maWd1cmF0aW9uID0gdXJpLmZpbGUoZml4UGF0aCgnL2NvbmZpZycpKTtcblxuXHRcdFx0Y29uc3QgY2FzZXM6IFtzdHJpbmcsIElTZWFyY2hQYXRoc0luZm9dW10gPSBbXG5cdFx0XHRcdFtcblx0XHRcdFx0XHQnJyxcblx0XHRcdFx0XHR7XG5cdFx0XHRcdFx0XHRzZWFyY2hQYXRoczogdW5kZWZpbmVkXG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRdLFxuXHRcdFx0XHRbXG5cdFx0XHRcdFx0Jy4vJyxcblx0XHRcdFx0XHR7XG5cdFx0XHRcdFx0XHRzZWFyY2hQYXRoczogdW5kZWZpbmVkXG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRdLFxuXHRcdFx0XHRbXG5cdFx0XHRcdFx0Jy4vcm9vdDEnLFxuXHRcdFx0XHRcdHtcblx0XHRcdFx0XHRcdHNlYXJjaFBhdGhzOiBbe1xuXHRcdFx0XHRcdFx0XHRzZWFyY2hQYXRoOiBnZXRVcmkoUk9PVF8xKVxuXHRcdFx0XHRcdFx0fV1cblx0XHRcdFx0XHR9XG5cdFx0XHRcdF0sXG5cdFx0XHRcdFtcblx0XHRcdFx0XHQnLi9yb290MSwuLycsXG5cdFx0XHRcdFx0e1xuXHRcdFx0XHRcdFx0c2VhcmNoUGF0aHM6IFt7XG5cdFx0XHRcdFx0XHRcdHNlYXJjaFBhdGg6IGdldFVyaShST09UXzEpXG5cdFx0XHRcdFx0XHR9XVxuXHRcdFx0XHRcdH1cblx0XHRcdFx0XSxcblx0XHRcdFx0W1xuXHRcdFx0XHRcdCcuL3Jvb3RCJyxcblx0XHRcdFx0XHR7XG5cdFx0XHRcdFx0XHRzZWFyY2hQYXRoczogW1xuXHRcdFx0XHRcdFx0XHR7XG5cdFx0XHRcdFx0XHRcdFx0c2VhcmNoUGF0aDogZ2V0VXJpKFJPT1RfMiksXG5cdFx0XHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0XHRcdHtcblx0XHRcdFx0XHRcdFx0XHRzZWFyY2hQYXRoOiBnZXRVcmkoUk9PVF8zKSxcblx0XHRcdFx0XHRcdFx0fV1cblx0XHRcdFx0XHR9XG5cdFx0XHRcdF0sXG5cdFx0XHRcdFtcblx0XHRcdFx0XHQnLi9yb290Qi9hLyoqL2IsIC4vcm9vdEIvYi8qKi8qLnR4dCcsXG5cdFx0XHRcdFx0e1xuXHRcdFx0XHRcdFx0c2VhcmNoUGF0aHM6IFtcblx0XHRcdFx0XHRcdFx0e1xuXHRcdFx0XHRcdFx0XHRcdHNlYXJjaFBhdGg6IGdldFVyaShST09UXzIpLFxuXHRcdFx0XHRcdFx0XHRcdHBhdHRlcm46IHBhdHRlcm5zVG9JRXhwcmVzc2lvbignYS8qKi9iJywgJ2EvKiovYi8qKicsICdiLyoqLyoudHh0JywgJ2IvKiovKi50eHQvKionKVxuXHRcdFx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdFx0XHR7XG5cdFx0XHRcdFx0XHRcdFx0c2VhcmNoUGF0aDogZ2V0VXJpKFJPT1RfMyksXG5cdFx0XHRcdFx0XHRcdFx0cGF0dGVybjogcGF0dGVybnNUb0lFeHByZXNzaW9uKCdhLyoqL2InLCAnYS8qKi9iLyoqJywgJ2IvKiovKi50eHQnLCAnYi8qKi8qLnR4dC8qKicpXG5cdFx0XHRcdFx0XHRcdH1dXG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRdLFxuXHRcdFx0XHRbXG5cdFx0XHRcdFx0Jy4vcm9vdDEvKiovZm9vLywgYmFyLycsXG5cdFx0XHRcdFx0e1xuXHRcdFx0XHRcdFx0cGF0dGVybjogcGF0dGVybnNUb0lFeHByZXNzaW9uKCcqKi9iYXInLCAnKiovYmFyLyoqJyksXG5cdFx0XHRcdFx0XHRzZWFyY2hQYXRoczogW1xuXHRcdFx0XHRcdFx0XHR7XG5cdFx0XHRcdFx0XHRcdFx0c2VhcmNoUGF0aDogUk9PVF8xX1VSSSxcblx0XHRcdFx0XHRcdFx0XHRwYXR0ZXJuOiBwYXR0ZXJuc1RvSUV4cHJlc3Npb24oJyoqL2ZvbycsICcqKi9mb28vKionKVxuXHRcdFx0XHRcdFx0XHR9XVxuXHRcdFx0XHRcdH1cblx0XHRcdFx0XVxuXHRcdFx0XTtcblx0XHRcdGNhc2VzLmZvckVhY2godGVzdEluY2x1ZGVzRGF0YUl0ZW0pO1xuXHRcdH0pO1xuXHR9KTtcblxuXHRzdWl0ZSgncGFyc2VTZWFyY2hQYXRocyAyJywgKCkgPT4ge1xuXG5cdFx0ZnVuY3Rpb24gdGVzdEluY2x1ZGVzKGluY2x1ZGVQYXR0ZXJuOiBzdHJpbmcsIGV4cGVjdGVkUmVzdWx0OiBJU2VhcmNoUGF0aHNJbmZvKTogdm9pZCB7XG5cdFx0XHRhc3NlcnRFcXVhbFNlYXJjaFBhdGhSZXN1bHRzKFxuXHRcdFx0XHRxdWVyeUJ1aWxkZXIucGFyc2VTZWFyY2hQYXRocyhpbmNsdWRlUGF0dGVybiksXG5cdFx0XHRcdGV4cGVjdGVkUmVzdWx0LFxuXHRcdFx0XHRpbmNsdWRlUGF0dGVybik7XG5cdFx0fVxuXG5cdFx0ZnVuY3Rpb24gdGVzdEluY2x1ZGVzRGF0YUl0ZW0oW2luY2x1ZGVQYXR0ZXJuLCBleHBlY3RlZFJlc3VsdF06IFtzdHJpbmcsIElTZWFyY2hQYXRoc0luZm9dKTogdm9pZCB7XG5cdFx0XHR0ZXN0SW5jbHVkZXMoaW5jbHVkZVBhdHRlcm4sIGV4cGVjdGVkUmVzdWx0KTtcblx0XHR9XG5cblx0XHQoaXNXaW5kb3dzID8gdGVzdC5za2lwIDogdGVzdCkoJ2luY2x1ZGVzIHdpdGggdGlsZGUnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCB1c2VySG9tZSA9IFVSSS5maWxlKCcvJyk7XG5cdFx0XHRjb25zdCBjYXNlczogW3N0cmluZywgSVNlYXJjaFBhdGhzSW5mb11bXSA9IFtcblx0XHRcdFx0W1xuXHRcdFx0XHRcdCd+L2Zvby9iYXInLFxuXHRcdFx0XHRcdHtcblx0XHRcdFx0XHRcdHNlYXJjaFBhdGhzOiBbeyBzZWFyY2hQYXRoOiBnZXRVcmkodXNlckhvbWUuZnNQYXRoLCAnL2Zvby9iYXInKSB9XVxuXHRcdFx0XHRcdH1cblx0XHRcdFx0XSxcblx0XHRcdFx0W1xuXHRcdFx0XHRcdCd+L2Zvby9iYXIsIGEnLFxuXHRcdFx0XHRcdHtcblx0XHRcdFx0XHRcdHNlYXJjaFBhdGhzOiBbeyBzZWFyY2hQYXRoOiBnZXRVcmkodXNlckhvbWUuZnNQYXRoLCAnL2Zvby9iYXInKSB9XSxcblx0XHRcdFx0XHRcdHBhdHRlcm46IHBhdHRlcm5zVG9JRXhwcmVzc2lvbiguLi5nbG9iYWxHbG9iKCdhJykpXG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRdLFxuXHRcdFx0XHRbXG5cdFx0XHRcdFx0Zml4UGF0aCgnL2Zvby9+L2JhcicpLFxuXHRcdFx0XHRcdHtcblx0XHRcdFx0XHRcdHNlYXJjaFBhdGhzOiBbeyBzZWFyY2hQYXRoOiBnZXRVcmkoJy9mb28vfi9iYXInKSB9XVxuXHRcdFx0XHRcdH1cblx0XHRcdFx0XSxcblx0XHRcdF07XG5cdFx0XHRjYXNlcy5mb3JFYWNoKHRlc3RJbmNsdWRlc0RhdGFJdGVtKTtcblx0XHR9KTtcblx0fSk7XG5cblx0c3VpdGUoJ3NtYXJ0Q2FzZScsICgpID0+IHtcblx0XHR0ZXN0KCdubyBmbGFncyAtPiBubyBjaGFuZ2UnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBxdWVyeSA9IHF1ZXJ5QnVpbGRlci50ZXh0KFxuXHRcdFx0XHR7XG5cdFx0XHRcdFx0cGF0dGVybjogJ2EnXG5cdFx0XHRcdH0sXG5cdFx0XHRcdFtdKTtcblxuXHRcdFx0YXNzZXJ0KCFxdWVyeS5jb250ZW50UGF0dGVybi5pc0Nhc2VTZW5zaXRpdmUpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnbWFpbnRhaW5zIGlzQ2FzZVNlbnNpdGl2ZSB3aGVuIHNtYXJ0Q2FzZSBub3Qgc2V0JywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgcXVlcnkgPSBxdWVyeUJ1aWxkZXIudGV4dChcblx0XHRcdFx0e1xuXHRcdFx0XHRcdHBhdHRlcm46ICdhJyxcblx0XHRcdFx0XHRpc0Nhc2VTZW5zaXRpdmU6IHRydWVcblx0XHRcdFx0fSxcblx0XHRcdFx0W10pO1xuXG5cdFx0XHRhc3NlcnQocXVlcnkuY29udGVudFBhdHRlcm4uaXNDYXNlU2Vuc2l0aXZlKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ21haW50YWlucyBpc0Nhc2VTZW5zaXRpdmUgd2hlbiBzbWFydENhc2Ugc2V0JywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgcXVlcnkgPSBxdWVyeUJ1aWxkZXIudGV4dChcblx0XHRcdFx0e1xuXHRcdFx0XHRcdHBhdHRlcm46ICdhJyxcblx0XHRcdFx0XHRpc0Nhc2VTZW5zaXRpdmU6IHRydWVcblx0XHRcdFx0fSxcblx0XHRcdFx0W10sXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRpc1NtYXJ0Q2FzZTogdHJ1ZVxuXHRcdFx0XHR9KTtcblxuXHRcdFx0YXNzZXJ0KHF1ZXJ5LmNvbnRlbnRQYXR0ZXJuLmlzQ2FzZVNlbnNpdGl2ZSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdzbWFydENhc2UgZGV0ZXJtaW5lcyBub3QgY2FzZSBzZW5zaXRpdmUnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBxdWVyeSA9IHF1ZXJ5QnVpbGRlci50ZXh0KFxuXHRcdFx0XHR7XG5cdFx0XHRcdFx0cGF0dGVybjogJ2FiY2QnXG5cdFx0XHRcdH0sXG5cdFx0XHRcdFtdLFxuXHRcdFx0XHR7XG5cdFx0XHRcdFx0aXNTbWFydENhc2U6IHRydWVcblx0XHRcdFx0fSk7XG5cblx0XHRcdGFzc2VydCghcXVlcnkuY29udGVudFBhdHRlcm4uaXNDYXNlU2Vuc2l0aXZlKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3NtYXJ0Q2FzZSBkZXRlcm1pbmVzIGNhc2Ugc2Vuc2l0aXZlJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgcXVlcnkgPSBxdWVyeUJ1aWxkZXIudGV4dChcblx0XHRcdFx0e1xuXHRcdFx0XHRcdHBhdHRlcm46ICdhYkNkJ1xuXHRcdFx0XHR9LFxuXHRcdFx0XHRbXSxcblx0XHRcdFx0e1xuXHRcdFx0XHRcdGlzU21hcnRDYXNlOiB0cnVlXG5cdFx0XHRcdH0pO1xuXG5cdFx0XHRhc3NlcnQocXVlcnkuY29udGVudFBhdHRlcm4uaXNDYXNlU2Vuc2l0aXZlKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3NtYXJ0Q2FzZSBkZXRlcm1pbmVzIG5vdCBjYXNlIHNlbnNpdGl2ZSAocmVnZXgpJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgcXVlcnkgPSBxdWVyeUJ1aWxkZXIudGV4dChcblx0XHRcdFx0e1xuXHRcdFx0XHRcdHBhdHRlcm46ICdhYlxcXFxTZCcsXG5cdFx0XHRcdFx0aXNSZWdFeHA6IHRydWVcblx0XHRcdFx0fSxcblx0XHRcdFx0W10sXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRpc1NtYXJ0Q2FzZTogdHJ1ZVxuXHRcdFx0XHR9KTtcblxuXHRcdFx0YXNzZXJ0KCFxdWVyeS5jb250ZW50UGF0dGVybi5pc0Nhc2VTZW5zaXRpdmUpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnc21hcnRDYXNlIGRldGVybWluZXMgY2FzZSBzZW5zaXRpdmUgKHJlZ2V4KScsICgpID0+IHtcblx0XHRcdGNvbnN0IHF1ZXJ5ID0gcXVlcnlCdWlsZGVyLnRleHQoXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRwYXR0ZXJuOiAnYWJbQS1aXWQnLFxuXHRcdFx0XHRcdGlzUmVnRXhwOiB0cnVlXG5cdFx0XHRcdH0sXG5cdFx0XHRcdFtdLFxuXHRcdFx0XHR7XG5cdFx0XHRcdFx0aXNTbWFydENhc2U6IHRydWVcblx0XHRcdFx0fSk7XG5cblx0XHRcdGFzc2VydChxdWVyeS5jb250ZW50UGF0dGVybi5pc0Nhc2VTZW5zaXRpdmUpO1xuXHRcdH0pO1xuXHR9KTtcblxuXHRzdWl0ZSgnZmlsZScsICgpID0+IHtcblx0XHR0ZXN0KCdzaW1wbGUgZmlsZSBxdWVyeScsICgpID0+IHtcblx0XHRcdGNvbnN0IGNhY2hlS2V5ID0gJ2FzZGYnO1xuXHRcdFx0Y29uc3QgcXVlcnkgPSBxdWVyeUJ1aWxkZXIuZmlsZShcblx0XHRcdFx0W1JPT1RfMV9OQU1FRF9GT0xERVJdLFxuXHRcdFx0XHR7XG5cdFx0XHRcdFx0Y2FjaGVLZXksXG5cdFx0XHRcdFx0c29ydEJ5U2NvcmU6IHRydWVcblx0XHRcdFx0fSxcblx0XHRcdCk7XG5cblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChxdWVyeS5mb2xkZXJRdWVyaWVzLmxlbmd0aCwgMSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocXVlcnkuY2FjaGVLZXksIGNhY2hlS2V5KTtcblx0XHRcdGFzc2VydChxdWVyeS5zb3J0QnlTY29yZSk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHN1aXRlKCdwYXR0ZXJuIHByb2Nlc3NpbmcnLCAoKSA9PiB7XG5cdFx0dGVzdCgndGV4dCBxdWVyeSB3aXRoIGNvbW1hLXNlcGFyYXRlZCBpbmNsdWRlcyB3aXRoIG5vIHdvcmtzcGFjZScsICgpID0+IHtcblx0XHRcdGNvbnN0IHF1ZXJ5ID0gcXVlcnlCdWlsZGVyLnRleHQoXG5cdFx0XHRcdHsgcGF0dGVybjogYGAgfSxcblx0XHRcdFx0W10sXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRpbmNsdWRlUGF0dGVybjogJyouanMsKi50cycsXG5cdFx0XHRcdFx0ZXhwYW5kUGF0dGVybnM6IHRydWVcblx0XHRcdFx0fVxuXHRcdFx0KTtcblx0XHRcdGFzc2VydC5kZWVwRXF1YWwocXVlcnkuaW5jbHVkZVBhdHRlcm4sIHtcblx0XHRcdFx0JyoqLyouanMvKionOiB0cnVlLFxuXHRcdFx0XHQnKiovKi5qcyc6IHRydWUsXG5cdFx0XHRcdCcqKi8qLnRzLyoqJzogdHJ1ZSxcblx0XHRcdFx0JyoqLyoudHMnOiB0cnVlLFxuXHRcdFx0fSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocXVlcnkuZm9sZGVyUXVlcmllcy5sZW5ndGgsIDApO1xuXHRcdH0pO1xuXHRcdHRlc3QoJ3RleHQgcXVlcnkgd2l0aCBjb21tYS1zZXBhcmF0ZWQgaW5jbHVkZXMgd2l0aCB3b3Jrc3BhY2UnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBxdWVyeSA9IHF1ZXJ5QnVpbGRlci50ZXh0KFxuXHRcdFx0XHR7IHBhdHRlcm46IGBgIH0sXG5cdFx0XHRcdFtST09UXzFfVVJJXSxcblx0XHRcdFx0e1xuXHRcdFx0XHRcdGluY2x1ZGVQYXR0ZXJuOiAnKi5qcywqLnRzJyxcblx0XHRcdFx0XHRleHBhbmRQYXR0ZXJuczogdHJ1ZVxuXHRcdFx0XHR9XG5cdFx0XHQpO1xuXHRcdFx0YXNzZXJ0LmRlZXBFcXVhbChxdWVyeS5pbmNsdWRlUGF0dGVybiwge1xuXHRcdFx0XHQnKiovKi5qcy8qKic6IHRydWUsXG5cdFx0XHRcdCcqKi8qLmpzJzogdHJ1ZSxcblx0XHRcdFx0JyoqLyoudHMvKionOiB0cnVlLFxuXHRcdFx0XHQnKiovKi50cyc6IHRydWUsXG5cdFx0XHR9KTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChxdWVyeS5mb2xkZXJRdWVyaWVzLmxlbmd0aCwgMSk7XG5cdFx0fSk7XG5cdFx0dGVzdCgndGV4dCBxdWVyeSB3aXRoIGNvbW1hLXNlcGFyYXRlZCBleGNsdWRlcyBnbG9iYWxseScsICgpID0+IHtcblx0XHRcdGNvbnN0IHF1ZXJ5ID0gcXVlcnlCdWlsZGVyLnRleHQoXG5cdFx0XHRcdHsgcGF0dGVybjogYGAgfSxcblx0XHRcdFx0W10sXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRleGNsdWRlUGF0dGVybjogW3sgcGF0dGVybjogJyouanMsKi50cycgfV0sXG5cdFx0XHRcdFx0ZXhwYW5kUGF0dGVybnM6IHRydWVcblx0XHRcdFx0fVxuXHRcdFx0KTtcblx0XHRcdGFzc2VydC5kZWVwRXF1YWwocXVlcnkuZXhjbHVkZVBhdHRlcm4sIHtcblx0XHRcdFx0JyoqLyouanMvKionOiB0cnVlLFxuXHRcdFx0XHQnKiovKi5qcyc6IHRydWUsXG5cdFx0XHRcdCcqKi8qLnRzLyoqJzogdHJ1ZSxcblx0XHRcdFx0JyoqLyoudHMnOiB0cnVlLFxuXHRcdFx0fSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocXVlcnkuZm9sZGVyUXVlcmllcy5sZW5ndGgsIDApO1xuXHRcdH0pO1xuXHRcdHRlc3QoJ3RleHQgcXVlcnkgd2l0aCBjb21tYS1zZXBhcmF0ZWQgZXhjbHVkZXMgZ2xvYmFsbHkgaW4gYSB3b3Jrc3BhY2UnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBxdWVyeSA9IHF1ZXJ5QnVpbGRlci50ZXh0KFxuXHRcdFx0XHR7IHBhdHRlcm46IGBgIH0sXG5cdFx0XHRcdFtST09UXzFfTkFNRURfRk9MREVSLnVyaV0sXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRleGNsdWRlUGF0dGVybjogW3sgcGF0dGVybjogJyouanMsKi50cycgfV0sXG5cdFx0XHRcdFx0ZXhwYW5kUGF0dGVybnM6IHRydWVcblx0XHRcdFx0fVxuXHRcdFx0KTtcblx0XHRcdGFzc2VydC5kZWVwRXF1YWwocXVlcnkuZXhjbHVkZVBhdHRlcm4sIHtcblx0XHRcdFx0JyoqLyouanMvKionOiB0cnVlLFxuXHRcdFx0XHQnKiovKi5qcyc6IHRydWUsXG5cdFx0XHRcdCcqKi8qLnRzLyoqJzogdHJ1ZSxcblx0XHRcdFx0JyoqLyoudHMnOiB0cnVlLFxuXHRcdFx0fSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocXVlcnkuZm9sZGVyUXVlcmllcy5sZW5ndGgsIDEpO1xuXHRcdH0pO1xuXHRcdHRlc3Quc2tpcCgndGV4dCBxdWVyeSB3aXRoIG11bHRpcGxlIGNvbW1hLXNlcGFyYXRlZCBleGNsdWRlcycsICgpID0+IHtcblx0XHRcdC8vIFRPRE86IEZpeC4gV2lsbCByZXF1aXJlIGBJQ29tbW9uUXVlcnlQcm9wcy5leGNsdWRlUGF0dGVybmAgdG8gc3VwcG9ydCBhbiBhcnJheS5cblx0XHRcdGNvbnN0IHF1ZXJ5ID0gcXVlcnlCdWlsZGVyLnRleHQoXG5cdFx0XHRcdHsgcGF0dGVybjogYGAgfSxcblx0XHRcdFx0W1JPT1RfMV9OQU1FRF9GT0xERVIudXJpXSxcblx0XHRcdFx0e1xuXHRcdFx0XHRcdGV4Y2x1ZGVQYXR0ZXJuOiBbeyBwYXR0ZXJuOiAnKi5qcywqLnRzJyB9LCB7IHBhdHRlcm46ICdmb28vKixiYXIvKicgfV0sXG5cdFx0XHRcdFx0ZXhwYW5kUGF0dGVybnM6IHRydWVcblx0XHRcdFx0fVxuXHRcdFx0KTtcblx0XHRcdGFzc2VydC5kZWVwRXF1YWwocXVlcnkuZXhjbHVkZVBhdHRlcm4sIFtcblx0XHRcdFx0e1xuXG5cdFx0XHRcdFx0JyoqLyouanMvKionOiB0cnVlLFxuXHRcdFx0XHRcdCcqKi8qLmpzJzogdHJ1ZSxcblx0XHRcdFx0XHQnKiovKi50cy8qKic6IHRydWUsXG5cdFx0XHRcdFx0JyoqLyoudHMnOiB0cnVlLFxuXHRcdFx0XHR9LFxuXHRcdFx0XHR7XG5cdFx0XHRcdFx0JyoqL2Zvby8qLyoqJzogdHJ1ZSxcblx0XHRcdFx0XHQnKiovZm9vLyonOiB0cnVlLFxuXHRcdFx0XHRcdCcqKi9iYXIvKi8qKic6IHRydWUsXG5cdFx0XHRcdFx0JyoqL2Jhci8qJzogdHJ1ZSxcblx0XHRcdFx0fVxuXHRcdFx0XSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocXVlcnkuZm9sZGVyUXVlcmllcy5sZW5ndGgsIDEpO1xuXHRcdH0pO1xuXHRcdHRlc3Quc2tpcCgndGV4dCBxdWVyeSB3aXRoIGJhc2UgVVJJIG9uIGV4Y2x1ZCcsICgpID0+IHtcblx0XHRcdC8vIFRPRE86IEZpeC4gV2lsbCByZXF1aXJlIGBJQ29tbW9uUXVlcnlQcm9wcy5leGNsdWRlUGF0dGVybmAgdG8gc3VwcG9ydCBhbiBiYXNlVVJJLlxuXHRcdFx0Y29uc3QgcXVlcnkgPSBxdWVyeUJ1aWxkZXIudGV4dChcblx0XHRcdFx0eyBwYXR0ZXJuOiBgYCB9LFxuXHRcdFx0XHRbUk9PVF8xX05BTUVEX0ZPTERFUi51cmldLFxuXHRcdFx0XHR7XG5cdFx0XHRcdFx0ZXhjbHVkZVBhdHRlcm46IFt7IHVyaTogUk9PVF8xX1VSSSwgcGF0dGVybjogJyouanMsKi50cycgfV0sXG5cdFx0XHRcdFx0ZXhwYW5kUGF0dGVybnM6IHRydWVcblx0XHRcdFx0fVxuXHRcdFx0KTtcblx0XHRcdC8vIHRvZG86IGluY29ycG9yYXRlIHRoZSBiYXNlIFVSSSBpbnRvIHRoZSBwYXR0ZXJuXG5cdFx0XHRhc3NlcnQuZGVlcEVxdWFsKHF1ZXJ5LmV4Y2x1ZGVQYXR0ZXJuLCB7XG5cdFx0XHRcdHVyaTogUk9PVF8xX1VSSSxcblx0XHRcdFx0cGF0dGVybjoge1xuXHRcdFx0XHRcdCcqKi8qLmpzLyoqJzogdHJ1ZSxcblx0XHRcdFx0XHQnKiovKi5qcyc6IHRydWUsXG5cdFx0XHRcdFx0JyoqLyoudHMvKionOiB0cnVlLFxuXHRcdFx0XHRcdCcqKi8qLnRzJzogdHJ1ZSxcblx0XHRcdFx0fVxuXHRcdFx0fSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocXVlcnkuZm9sZGVyUXVlcmllcy5sZW5ndGgsIDEpO1xuXHRcdH0pO1xuXHR9KTtcbn0pO1xuZnVuY3Rpb24gbWFrZUV4Y2x1ZGVQYXR0ZXJuRnJvbVBhdHRlcm5zKC4uLnBhdHRlcm5zOiBzdHJpbmdbXSk6IHtcblx0cGF0dGVybjogSUV4cHJlc3Npb247XG59W10gfCB1bmRlZmluZWQge1xuXHRjb25zdCBwYXR0ZXJuID0gcGF0dGVybnNUb0lFeHByZXNzaW9uKC4uLnBhdHRlcm5zKTtcblx0cmV0dXJuIHBhdHRlcm4gPyBbeyBwYXR0ZXJuIH1dIDogdW5kZWZpbmVkO1xufVxuXG5mdW5jdGlvbiBhc3NlcnRFcXVhbFRleHRRdWVyaWVzKGFjdHVhbDogSVRleHRRdWVyeSwgZXhwZWN0ZWQ6IElUZXh0UXVlcnkpOiB2b2lkIHtcblx0cmV0dXJuIGFzc2VydEVxdWFsUXVlcmllcyhhY3R1YWwsIGV4cGVjdGVkKTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGFzc2VydEVxdWFsUXVlcmllcyhhY3R1YWw6IElUZXh0UXVlcnkgfCBJRmlsZVF1ZXJ5LCBleHBlY3RlZDogSVRleHRRdWVyeSB8IElGaWxlUXVlcnkpOiB2b2lkIHtcblx0ZXhwZWN0ZWQgPSB7XG5cdFx0Li4uREVGQVVMVF9RVUVSWV9QUk9QUyxcblx0XHQuLi5leHBlY3RlZFxuXHR9O1xuXG5cdGNvbnN0IGZvbGRlclF1ZXJ5VG9Db21wYXJlT2JqZWN0ID0gKGZxOiBJRm9sZGVyUXVlcnkpID0+IHtcblx0XHRjb25zdCBleGNsdWRlUGF0dGVybiA9IGZxLmV4Y2x1ZGVQYXR0ZXJuPy5tYXAoZSA9PiBub3JtYWxpemVFeHByZXNzaW9uKGUucGF0dGVybikpO1xuXHRcdHJldHVybiB7XG5cdFx0XHRwYXRoOiBmcS5mb2xkZXIuZnNQYXRoLFxuXHRcdFx0ZXhjbHVkZVBhdHRlcm46IGV4Y2x1ZGVQYXR0ZXJuPy5sZW5ndGggPyBleGNsdWRlUGF0dGVybiA6IHVuZGVmaW5lZCxcblx0XHRcdGluY2x1ZGVQYXR0ZXJuOiBub3JtYWxpemVFeHByZXNzaW9uKGZxLmluY2x1ZGVQYXR0ZXJuKSxcblx0XHRcdGZpbGVFbmNvZGluZzogZnEuZmlsZUVuY29kaW5nXG5cdFx0fTtcblx0fTtcblxuXHQvLyBBdm9pZCBjb21wYXJpbmcgVVJJIG9iamVjdHMsIG5vdCBhIGdvb2QgaWRlYVxuXHRpZiAoZXhwZWN0ZWQuZm9sZGVyUXVlcmllcykge1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoYWN0dWFsLmZvbGRlclF1ZXJpZXMubWFwKGZvbGRlclF1ZXJ5VG9Db21wYXJlT2JqZWN0KSwgZXhwZWN0ZWQuZm9sZGVyUXVlcmllcy5tYXAoZm9sZGVyUXVlcnlUb0NvbXBhcmVPYmplY3QpKTtcblx0XHRhY3R1YWwuZm9sZGVyUXVlcmllcyA9IFtdO1xuXHRcdGV4cGVjdGVkLmZvbGRlclF1ZXJpZXMgPSBbXTtcblx0fVxuXG5cdGlmIChleHBlY3RlZC5leHRyYUZpbGVSZXNvdXJjZXMpIHtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGFjdHVhbC5leHRyYUZpbGVSZXNvdXJjZXMhLm1hcChleHRyYUZpbGUgPT4gZXh0cmFGaWxlLmZzUGF0aCksIGV4cGVjdGVkLmV4dHJhRmlsZVJlc291cmNlcy5tYXAoZXh0cmFGaWxlID0+IGV4dHJhRmlsZS5mc1BhdGgpKTtcblx0XHRkZWxldGUgZXhwZWN0ZWQuZXh0cmFGaWxlUmVzb3VyY2VzO1xuXHRcdGRlbGV0ZSBhY3R1YWwuZXh0cmFGaWxlUmVzb3VyY2VzO1xuXHR9XG5cblx0ZGVsZXRlIGFjdHVhbC51c2luZ1NlYXJjaFBhdGhzO1xuXHRhY3R1YWwuaW5jbHVkZVBhdHRlcm4gPSBub3JtYWxpemVFeHByZXNzaW9uKGFjdHVhbC5pbmNsdWRlUGF0dGVybik7XG5cdGFjdHVhbC5leGNsdWRlUGF0dGVybiA9IG5vcm1hbGl6ZUV4cHJlc3Npb24oYWN0dWFsLmV4Y2x1ZGVQYXR0ZXJuKTtcblx0Y2xlYW5VbmRlZmluZWRRdWVyeVZhbHVlcyhhY3R1YWwpO1xuXG5cdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoYWN0dWFsLCBleHBlY3RlZCk7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBhc3NlcnRFcXVhbFNlYXJjaFBhdGhSZXN1bHRzKGFjdHVhbDogSVNlYXJjaFBhdGhzSW5mbywgZXhwZWN0ZWQ6IElTZWFyY2hQYXRoc0luZm8sIG1lc3NhZ2U/OiBzdHJpbmcpOiB2b2lkIHtcblx0Y2xlYW5VbmRlZmluZWRRdWVyeVZhbHVlcyhhY3R1YWwpO1xuXHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHsgLi4uYWN0dWFsLnBhdHRlcm4gfSwgeyAuLi5leHBlY3RlZC5wYXR0ZXJuIH0sIG1lc3NhZ2UpO1xuXG5cdGFzc2VydC5zdHJpY3RFcXVhbChhY3R1YWwuc2VhcmNoUGF0aHMgJiYgYWN0dWFsLnNlYXJjaFBhdGhzLmxlbmd0aCwgZXhwZWN0ZWQuc2VhcmNoUGF0aHMgJiYgZXhwZWN0ZWQuc2VhcmNoUGF0aHMubGVuZ3RoKTtcblx0aWYgKGFjdHVhbC5zZWFyY2hQYXRocykge1xuXHRcdGFjdHVhbC5zZWFyY2hQYXRocy5mb3JFYWNoKChzZWFyY2hQYXRoLCBpKSA9PiB7XG5cdFx0XHRjb25zdCBleHBlY3RlZFNlYXJjaFBhdGggPSBleHBlY3RlZC5zZWFyY2hQYXRocyFbaV07XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHNlYXJjaFBhdGgucGF0dGVybiAmJiB7IC4uLnNlYXJjaFBhdGgucGF0dGVybiB9LCBleHBlY3RlZFNlYXJjaFBhdGgucGF0dGVybik7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2VhcmNoUGF0aC5zZWFyY2hQYXRoLnRvU3RyaW5nKCksIGV4cGVjdGVkU2VhcmNoUGF0aC5zZWFyY2hQYXRoLnRvU3RyaW5nKCkpO1xuXHRcdH0pO1xuXHR9XG59XG5cbi8qKlxuICogUmVjdXJzaXZlbHkgZGVsZXRlIGFsbCB1bmRlZmluZWQgcHJvcGVydHkgdmFsdWVzIGZyb20gdGhlIHNlYXJjaCBxdWVyeSwgdG8gbWFrZSBpdCBlYXNpZXIgdG9cbiAqIGFzc2VydC5kZWVwU3RyaWN0RXF1YWwgd2l0aCBzb21lIGV4cGVjdGVkIG9iamVjdC5cbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIGNsZWFuVW5kZWZpbmVkUXVlcnlWYWx1ZXMocTogYW55KTogdm9pZCB7XG5cdGZvciAoY29uc3Qga2V5IGluIHEpIHtcblx0XHRpZiAocVtrZXldID09PSB1bmRlZmluZWQpIHtcblx0XHRcdGRlbGV0ZSBxW2tleV07XG5cdFx0fSBlbHNlIGlmICh0eXBlb2YgcVtrZXldID09PSAnb2JqZWN0Jykge1xuXHRcdFx0Y2xlYW5VbmRlZmluZWRRdWVyeVZhbHVlcyhxW2tleV0pO1xuXHRcdH1cblx0fVxuXG5cdHJldHVybiBxO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gZ2xvYmFsR2xvYihwYXR0ZXJuOiBzdHJpbmcpOiBzdHJpbmdbXSB7XG5cdHJldHVybiBbXG5cdFx0YCoqLyR7cGF0dGVybn0vKipgLFxuXHRcdGAqKi8ke3BhdHRlcm59YFxuXHRdO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gcGF0dGVybnNUb0lFeHByZXNzaW9uKC4uLnBhdHRlcm5zOiBzdHJpbmdbXSk6IElFeHByZXNzaW9uIHwgdW5kZWZpbmVkIHtcblx0cmV0dXJuIHBhdHRlcm5zLmxlbmd0aCA/XG5cdFx0cGF0dGVybnMucmVkdWNlKChnbG9iLCBjdXIpID0+IHsgZ2xvYltjdXJdID0gdHJ1ZTsgcmV0dXJuIGdsb2I7IH0sIHt9IGFzIElFeHByZXNzaW9uKSA6XG5cdFx0dW5kZWZpbmVkO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gZ2V0VXJpKC4uLnNsYXNoUGF0aFBhcnRzOiBzdHJpbmdbXSk6IHVyaSB7XG5cdHJldHVybiB1cmkuZmlsZShmaXhQYXRoKC4uLnNsYXNoUGF0aFBhcnRzKSk7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBmaXhQYXRoKC4uLnNsYXNoUGF0aFBhcnRzOiBzdHJpbmdbXSk6IHN0cmluZyB7XG5cdGlmIChpc1dpbmRvd3MgJiYgc2xhc2hQYXRoUGFydHMubGVuZ3RoICYmICFzbGFzaFBhdGhQYXJ0c1swXS5tYXRjaCgvXmM6L2kpKSB7XG5cdFx0c2xhc2hQYXRoUGFydHMudW5zaGlmdCgnYzonKTtcblx0fVxuXG5cdHJldHVybiBqb2luKC4uLnNsYXNoUGF0aFBhcnRzKTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIG5vcm1hbGl6ZUV4cHJlc3Npb24oZXhwcmVzc2lvbjogSUV4cHJlc3Npb24gfCB1bmRlZmluZWQpOiBJRXhwcmVzc2lvbiB8IHVuZGVmaW5lZCB7XG5cdGlmICghZXhwcmVzc2lvbikge1xuXHRcdHJldHVybiBleHByZXNzaW9uO1xuXHR9XG5cblx0Y29uc3Qgbm9ybWFsaXplZDogSUV4cHJlc3Npb24gPSB7fTtcblx0T2JqZWN0LmtleXMoZXhwcmVzc2lvbikuZm9yRWFjaChrZXkgPT4ge1xuXHRcdG5vcm1hbGl6ZWRba2V5LnJlcGxhY2UoL1xcXFwvZywgJy8nKV0gPSBleHByZXNzaW9uW2tleV07XG5cdH0pO1xuXG5cdHJldHVybiBub3JtYWxpemVkO1xufVxuIl0sCiAgIm1hcHBpbmdzIjogIkFBSUEsT0FBTyxZQUFZO0FBRW5CLFNBQVMsWUFBWTtBQUNyQixTQUFTLGlCQUFpQjtBQUMxQixTQUFTLEtBQUssT0FBTyxXQUFXO0FBQ2hDLFNBQVMsNkJBQTZC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
