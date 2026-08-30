import assert from "assert";
import * as sinon from "sinon";
import { DisposableStore } from "../../../../../base/common/lifecycle.js";
import { sep } from "../../../../../base/common/path.js";
import { isWindows } from "../../../../../base/common/platform.js";
import { extUriBiasedIgnorePathCase } from "../../../../../base/common/resources.js";
import { URI } from "../../../../../base/common/uri.js";
import { mock } from "../../../../../base/test/common/mock.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../../base/test/common/utils.js";
import { Selection } from "../../../../common/core/selection.js";
import { SnippetParser } from "../../browser/snippetParser.js";
import { ClipboardBasedVariableResolver, CompositeSnippetVariableResolver, ModelBasedVariableResolver, SelectionBasedVariableResolver, TimeBasedVariableResolver, WorkspaceBasedVariableResolver } from "../../browser/snippetVariables.js";
import { createTextModel } from "../../../../test/common/testTextModel.js";
import { toWorkspaceFolder } from "../../../../../platform/workspace/common/workspace.js";
import { Workspace } from "../../../../../platform/workspace/test/common/testWorkspace.js";
import { toWorkspaceFolders } from "../../../../../platform/workspaces/common/workspaces.js";
suite("Snippet Variables Resolver", function() {
  const labelService = new class extends mock() {
    getUriLabel(uri) {
      return uri.fsPath;
    }
  }();
  let model;
  let resolver;
  setup(function() {
    model = createTextModel([
      "this is line one",
      "this is line two",
      "    this is line three"
    ].join("\n"), void 0, void 0, URI.parse("file:///foo/files/text.txt"));
    resolver = new CompositeSnippetVariableResolver([
      new ModelBasedVariableResolver(labelService, model),
      new SelectionBasedVariableResolver(model, new Selection(1, 1, 1, 1), 0, void 0)
    ]);
  });
  teardown(function() {
    model.dispose();
  });
  ensureNoDisposablesAreLeakedInTestSuite();
  function assertVariableResolve(resolver2, varName, expected) {
    const snippet = new SnippetParser().parse(`$${varName}`);
    const variable = snippet.children[0];
    variable.resolve(resolver2);
    if (variable.children.length === 0) {
      assert.strictEqual(void 0, expected);
    } else {
      assert.strictEqual(variable.toString(), expected);
    }
  }
  test("editor variables, basics", function() {
    assertVariableResolve(resolver, "TM_FILENAME", "text.txt");
    assertVariableResolve(resolver, "something", void 0);
  });
  test("editor variables, file/dir", function() {
    const disposables = new DisposableStore();
    assertVariableResolve(resolver, "TM_FILENAME", "text.txt");
    if (!isWindows) {
      assertVariableResolve(resolver, "TM_DIRECTORY", "/foo/files");
      assertVariableResolve(resolver, "TM_DIRECTORY_BASE", "files");
      assertVariableResolve(resolver, "TM_FILEPATH", "/foo/files/text.txt");
    }
    resolver = new ModelBasedVariableResolver(
      labelService,
      disposables.add(createTextModel("", void 0, void 0, URI.parse("http://www.pb.o/abc/def/ghi")))
    );
    assertVariableResolve(resolver, "TM_FILENAME", "ghi");
    if (!isWindows) {
      assertVariableResolve(resolver, "TM_DIRECTORY", "/abc/def");
      assertVariableResolve(resolver, "TM_DIRECTORY_BASE", "def");
      assertVariableResolve(resolver, "TM_FILEPATH", "/abc/def/ghi");
    }
    resolver = new ModelBasedVariableResolver(
      labelService,
      disposables.add(createTextModel("", void 0, void 0, URI.parse("mem:fff.ts")))
    );
    assertVariableResolve(resolver, "TM_DIRECTORY", "");
    assertVariableResolve(resolver, "TM_DIRECTORY_BASE", "");
    assertVariableResolve(resolver, "TM_FILEPATH", "fff.ts");
    disposables.dispose();
  });
  test("Path delimiters in code snippet variables aren't specific to remote OS #76840", function() {
    const labelService2 = new class extends mock() {
      getUriLabel(uri) {
        return uri.fsPath.replace(/\/|\\/g, "|");
      }
    }();
    const model2 = createTextModel([].join("\n"), void 0, void 0, URI.parse("foo:///foo/files/text.txt"));
    const resolver2 = new CompositeSnippetVariableResolver([new ModelBasedVariableResolver(labelService2, model2)]);
    assertVariableResolve(resolver2, "TM_FILEPATH", "|foo|files|text.txt");
    model2.dispose();
  });
  test("editor variables, selection", function() {
    resolver = new SelectionBasedVariableResolver(model, new Selection(1, 2, 2, 3), 0, void 0);
    assertVariableResolve(resolver, "TM_SELECTED_TEXT", "his is line one\nth");
    assertVariableResolve(resolver, "TM_CURRENT_LINE", "this is line two");
    assertVariableResolve(resolver, "TM_LINE_INDEX", "1");
    assertVariableResolve(resolver, "TM_LINE_NUMBER", "2");
    assertVariableResolve(resolver, "CURSOR_INDEX", "0");
    assertVariableResolve(resolver, "CURSOR_NUMBER", "1");
    resolver = new SelectionBasedVariableResolver(model, new Selection(1, 2, 2, 3), 4, void 0);
    assertVariableResolve(resolver, "CURSOR_INDEX", "4");
    assertVariableResolve(resolver, "CURSOR_NUMBER", "5");
    resolver = new SelectionBasedVariableResolver(model, new Selection(2, 3, 1, 2), 0, void 0);
    assertVariableResolve(resolver, "TM_SELECTED_TEXT", "his is line one\nth");
    assertVariableResolve(resolver, "TM_CURRENT_LINE", "this is line one");
    assertVariableResolve(resolver, "TM_LINE_INDEX", "0");
    assertVariableResolve(resolver, "TM_LINE_NUMBER", "1");
    resolver = new SelectionBasedVariableResolver(model, new Selection(1, 2, 1, 2), 0, void 0);
    assertVariableResolve(resolver, "TM_SELECTED_TEXT", void 0);
    assertVariableResolve(resolver, "TM_CURRENT_WORD", "this");
    resolver = new SelectionBasedVariableResolver(model, new Selection(3, 1, 3, 1), 0, void 0);
    assertVariableResolve(resolver, "TM_CURRENT_WORD", void 0);
  });
  test("TextmateSnippet, resolve variable", function() {
    const snippet = new SnippetParser().parse('"$TM_CURRENT_WORD"', true);
    assert.strictEqual(snippet.toString(), '""');
    snippet.resolveVariables(resolver);
    assert.strictEqual(snippet.toString(), '"this"');
  });
  test("TextmateSnippet, resolve variable with default", function() {
    const snippet = new SnippetParser().parse('"${TM_CURRENT_WORD:foo}"', true);
    assert.strictEqual(snippet.toString(), '"foo"');
    snippet.resolveVariables(resolver);
    assert.strictEqual(snippet.toString(), '"this"');
  });
  test("More useful environment variables for snippets, #32737", function() {
    const disposables = new DisposableStore();
    assertVariableResolve(resolver, "TM_FILENAME_BASE", "text");
    resolver = new ModelBasedVariableResolver(
      labelService,
      disposables.add(createTextModel("", void 0, void 0, URI.parse("http://www.pb.o/abc/def/ghi")))
    );
    assertVariableResolve(resolver, "TM_FILENAME_BASE", "ghi");
    resolver = new ModelBasedVariableResolver(
      labelService,
      disposables.add(createTextModel("", void 0, void 0, URI.parse("mem:.git")))
    );
    assertVariableResolve(resolver, "TM_FILENAME_BASE", ".git");
    resolver = new ModelBasedVariableResolver(
      labelService,
      disposables.add(createTextModel("", void 0, void 0, URI.parse("mem:foo.")))
    );
    assertVariableResolve(resolver, "TM_FILENAME_BASE", "foo");
    disposables.dispose();
  });
  function assertVariableResolve2(input, expected, varValue) {
    const snippet = new SnippetParser().parse(input).resolveVariables({ resolve(variable) {
      return varValue || variable.name;
    } });
    const actual = snippet.toString();
    assert.strictEqual(actual, expected);
  }
  test("Variable Snippet Transform", function() {
    const snippet = new SnippetParser().parse("name=${TM_FILENAME/(.*)\\..+$/$1/}", true);
    snippet.resolveVariables(resolver);
    assert.strictEqual(snippet.toString(), "name=text");
    assertVariableResolve2("${ThisIsAVar/([A-Z]).*(Var)/$2/}", "Var");
    assertVariableResolve2("${ThisIsAVar/([A-Z]).*(Var)/$2-${1:/downcase}/}", "Var-t");
    assertVariableResolve2("${Foo/(.*)/${1:+Bar}/img}", "Bar");
    assertVariableResolve2("export default class ${TM_FILENAME/(\\w+)\\.js/$1/g}", "export default class FooFile", "FooFile.js");
    assertVariableResolve2("${foobarfoobar/(foo)/${1:+FAR}/g}", "FARbarFARbar");
    assertVariableResolve2("${foobarfoobar/(foo)/${1:+FAR}/}", "FARbarfoobar");
    assertVariableResolve2("${foobarfoobar/(bazz)/${1:+FAR}/g}", "foobarfoobar");
    assertVariableResolve2("${foobarfoobar/(foo)/${2:+FAR}/g}", "barbar");
  });
  test("Snippet transforms do not handle regex with alternatives or optional matches, #36089", function() {
    assertVariableResolve2(
      "${TM_FILENAME/^(.)|(?:-(.))|(\\.js)/${1:/upcase}${2:/upcase}/g}",
      "MyClass",
      "my-class.js"
    );
    assertVariableResolve2(
      "${TM_FILENAME/^(.)|(?:-(.))|(\\.js)/${1:/upcase}${2:/upcase}/g}",
      "Myclass",
      "myclass.js"
    );
    assertVariableResolve2(
      "${TM_FILENAME/^(.)|(?:-(.))|(\\.js)/${1:/upcase}${2:/upcase}/g}",
      "Myclass.foo",
      "myclass.foo"
    );
    assertVariableResolve2(
      "${TM_FILENAME/^(.)|(?:-(.))|(\\.js)/${1:/upcase}${2:/upcase}/g}",
      "ThisIsAFile",
      "this-is-a-file.js"
    );
    assertVariableResolve2(
      "${TM_FILENAME_BASE/([A-Z][a-z]+)([A-Z][a-z]+$)?/${1:/downcase}-${2:/downcase}/g}",
      "capital-case",
      "CapitalCase"
    );
    assertVariableResolve2(
      "${TM_FILENAME_BASE/([A-Z][a-z]+)([A-Z][a-z]+$)?/${1:/downcase}-${2:/downcase}/g}",
      "capital-case-more",
      "CapitalCaseMore"
    );
  });
  test("Add variable to insert value from clipboard to a snippet #40153", function() {
    assertVariableResolve(new ClipboardBasedVariableResolver(() => void 0, 1, 0, true), "CLIPBOARD", void 0);
    assertVariableResolve(new ClipboardBasedVariableResolver(() => null, 1, 0, true), "CLIPBOARD", void 0);
    assertVariableResolve(new ClipboardBasedVariableResolver(() => "", 1, 0, true), "CLIPBOARD", void 0);
    assertVariableResolve(new ClipboardBasedVariableResolver(() => "foo", 1, 0, true), "CLIPBOARD", "foo");
    assertVariableResolve(new ClipboardBasedVariableResolver(() => "foo", 1, 0, true), "foo", void 0);
    assertVariableResolve(new ClipboardBasedVariableResolver(() => "foo", 1, 0, true), "cLIPBOARD", void 0);
  });
  test("Add variable to insert value from clipboard to a snippet #40153, 2", function() {
    assertVariableResolve(new ClipboardBasedVariableResolver(() => "line1", 1, 2, true), "CLIPBOARD", "line1");
    assertVariableResolve(new ClipboardBasedVariableResolver(() => "line1\nline2\nline3", 1, 2, true), "CLIPBOARD", "line1\nline2\nline3");
    assertVariableResolve(new ClipboardBasedVariableResolver(() => "line1\nline2", 1, 2, true), "CLIPBOARD", "line2");
    resolver = new ClipboardBasedVariableResolver(() => "line1\nline2", 0, 2, true);
    assertVariableResolve(new ClipboardBasedVariableResolver(() => "line1\nline2", 0, 2, true), "CLIPBOARD", "line1");
    assertVariableResolve(new ClipboardBasedVariableResolver(() => "line1\nline2", 0, 2, false), "CLIPBOARD", "line1\nline2");
  });
  function assertVariableResolve3(resolver2, varName) {
    const snippet = new SnippetParser().parse(`$${varName}`);
    const variable = snippet.children[0];
    assert.strictEqual(variable.resolve(resolver2), true, `${varName} failed to resolve`);
  }
  test("Add time variables for snippets #41631, #43140", function() {
    const resolver2 = new TimeBasedVariableResolver();
    assertVariableResolve3(resolver2, "CURRENT_YEAR");
    assertVariableResolve3(resolver2, "CURRENT_YEAR_SHORT");
    assertVariableResolve3(resolver2, "CURRENT_MONTH");
    assertVariableResolve3(resolver2, "CURRENT_DATE");
    assertVariableResolve3(resolver2, "CURRENT_HOUR");
    assertVariableResolve3(resolver2, "CURRENT_MINUTE");
    assertVariableResolve3(resolver2, "CURRENT_SECOND");
    assertVariableResolve3(resolver2, "CURRENT_MILLISECOND");
    assertVariableResolve3(resolver2, "CURRENT_DAY_NAME");
    assertVariableResolve3(resolver2, "CURRENT_DAY_NAME_SHORT");
    assertVariableResolve3(resolver2, "CURRENT_MONTH_NAME");
    assertVariableResolve3(resolver2, "CURRENT_MONTH_NAME_SHORT");
    assertVariableResolve3(resolver2, "CURRENT_SECONDS_UNIX");
    assertVariableResolve3(resolver2, "CURRENT_MILLISECONDS_UNIX");
    assertVariableResolve3(resolver2, "CURRENT_TIMEZONE_OFFSET");
    assertVariableResolve3(resolver2, "CURRENT_TIMEZONE_NAME");
  });
  test("Time-based snippet variables have deterministic millisecond and unix values", function() {
    const now = Date.UTC(2024, 3, 15, 12, 34, 56, 7);
    const clock = sinon.useFakeTimers({ now });
    try {
      const resolver2 = new TimeBasedVariableResolver();
      const expectedDate = new Date(now);
      const pad = (value, length) => String(value).padStart(length, "0");
      assertVariableResolve(resolver2, "CURRENT_YEAR", String(expectedDate.getFullYear()));
      assertVariableResolve(resolver2, "CURRENT_YEAR_SHORT", String(expectedDate.getFullYear()).slice(-2));
      assertVariableResolve(resolver2, "CURRENT_MONTH", pad(expectedDate.getMonth() + 1, 2));
      assertVariableResolve(resolver2, "CURRENT_DATE", pad(expectedDate.getDate(), 2));
      assertVariableResolve(resolver2, "CURRENT_HOUR", pad(expectedDate.getHours(), 2));
      assertVariableResolve(resolver2, "CURRENT_MINUTE", pad(expectedDate.getMinutes(), 2));
      assertVariableResolve(resolver2, "CURRENT_SECOND", pad(expectedDate.getSeconds(), 2));
      assertVariableResolve(resolver2, "CURRENT_MILLISECOND", pad(expectedDate.getMilliseconds(), 3));
      assertVariableResolve(resolver2, "CURRENT_SECONDS_UNIX", String(Math.floor(now / 1e3)));
      assertVariableResolve(resolver2, "CURRENT_MILLISECONDS_UNIX", String(now));
    } finally {
      clock.restore();
    }
  });
  test("Time-based snippet variables resolve to the same values even as time progresses", async function() {
    const snippetText = `
			$CURRENT_YEAR
			$CURRENT_YEAR_SHORT
			$CURRENT_MONTH
			$CURRENT_DATE
			$CURRENT_HOUR
			$CURRENT_MINUTE
			$CURRENT_SECOND
			$CURRENT_MILLISECOND
			$CURRENT_DAY_NAME
			$CURRENT_DAY_NAME_SHORT
			$CURRENT_MONTH_NAME
			$CURRENT_MONTH_NAME_SHORT
			$CURRENT_SECONDS_UNIX
			$CURRENT_MILLISECONDS_UNIX
			$CURRENT_TIMEZONE_OFFSET
			$CURRENT_TIMEZONE_NAME
		`;
    const clock = sinon.useFakeTimers();
    try {
      const resolver2 = new TimeBasedVariableResolver();
      const firstResolve = new SnippetParser().parse(snippetText).resolveVariables(resolver2);
      clock.tick(365 * 24 * 3600 * 1e3 + 24 * 3600 * 1e3 + 3661 * 1e3);
      const secondResolve = new SnippetParser().parse(snippetText).resolveVariables(resolver2);
      assert.strictEqual(firstResolve.toString(), secondResolve.toString(), `Time-based snippet variables resolved differently`);
    } finally {
      clock.restore();
    }
  });
  test("creating snippet - format-condition doesn't work #53617", function() {
    const snippet = new SnippetParser().parse("${TM_LINE_NUMBER/(10)/${1:?It is:It is not}/} line 10", true);
    snippet.resolveVariables({ resolve() {
      return "10";
    } });
    assert.strictEqual(snippet.toString(), "It is line 10");
    snippet.resolveVariables({ resolve() {
      return "11";
    } });
    assert.strictEqual(snippet.toString(), "It is not line 10");
  });
  test("Add workspace name and folder variables for snippets #68261", function() {
    let workspace;
    const workspaceService = new class {
      constructor() {
        this._throw = () => {
          throw new Error();
        };
        this.onDidChangeWorkbenchState = this._throw;
        this.onDidChangeWorkspaceName = this._throw;
        this.onWillChangeWorkspaceFolders = this._throw;
        this.onDidChangeWorkspaceFolders = this._throw;
        this.getCompleteWorkspace = this._throw;
        this.getWorkbenchState = this._throw;
        this.hasWorkspaceData = this._throw;
        this.getWorkspaceFolder = this._throw;
        this.isCurrentWorkspace = this._throw;
        this.isInsideWorkspace = this._throw;
      }
      getWorkspace() {
        return workspace;
      }
    }();
    const resolver2 = new WorkspaceBasedVariableResolver(workspaceService);
    workspace = new Workspace("");
    assertVariableResolve(resolver2, "WORKSPACE_NAME", void 0);
    assertVariableResolve(resolver2, "WORKSPACE_FOLDER", void 0);
    workspace = new Workspace("", [toWorkspaceFolder(URI.file("/folderName"))]);
    assertVariableResolve(resolver2, "WORKSPACE_NAME", "folderName");
    if (!isWindows) {
      assertVariableResolve(resolver2, "WORKSPACE_FOLDER", "/folderName");
    }
    const workspaceConfigPath = URI.file("testWorkspace.code-workspace");
    workspace = new Workspace("", toWorkspaceFolders([{ path: "folderName" }], workspaceConfigPath, extUriBiasedIgnorePathCase), workspaceConfigPath);
    assertVariableResolve(resolver2, "WORKSPACE_NAME", "testWorkspace");
    if (!isWindows) {
      assertVariableResolve(resolver2, "WORKSPACE_FOLDER", "/");
    }
  });
  test("Add RELATIVE_FILEPATH snippet variable #114208", function() {
    let resolver2;
    const workspaceLabelService = ((rootPath) => {
      const labelService2 = new class extends mock() {
        getUriLabel(uri, options = {}) {
          const rootFsPath = URI.file(rootPath).fsPath + sep;
          const fsPath = uri.fsPath;
          if (options.relative && rootPath && fsPath.startsWith(rootFsPath)) {
            return fsPath.substring(rootFsPath.length);
          }
          return fsPath;
        }
      }();
      return labelService2;
    });
    const model2 = createTextModel("", void 0, void 0, URI.parse("file:///foo/files/text.txt"));
    resolver2 = new ModelBasedVariableResolver(
      workspaceLabelService(""),
      model2
    );
    if (!isWindows) {
      assertVariableResolve(resolver2, "RELATIVE_FILEPATH", "/foo/files/text.txt");
    } else {
      assertVariableResolve(resolver2, "RELATIVE_FILEPATH", "\\foo\\files\\text.txt");
    }
    resolver2 = new ModelBasedVariableResolver(
      workspaceLabelService("/foo"),
      model2
    );
    if (!isWindows) {
      assertVariableResolve(resolver2, "RELATIVE_FILEPATH", "files/text.txt");
    } else {
      assertVariableResolve(resolver2, "RELATIVE_FILEPATH", "files\\text.txt");
    }
    model2.dispose();
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxlZGl0b3JcXGNvbnRyaWJcXHNuaXBwZXRcXHRlc3RcXGJyb3dzZXJcXHNuaXBwZXRWYXJpYWJsZXMudGVzdC50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5pbXBvcnQgYXNzZXJ0IGZyb20gJ2Fzc2VydCc7XG5pbXBvcnQgKiBhcyBzaW5vbiBmcm9tICdzaW5vbic7XG5pbXBvcnQgeyBEaXNwb3NhYmxlU3RvcmUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgc2VwIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vcGF0aC5qcyc7XG5pbXBvcnQgeyBpc1dpbmRvd3MgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9wbGF0Zm9ybS5qcyc7XG5pbXBvcnQgeyBleHRVcmlCaWFzZWRJZ25vcmVQYXRoQ2FzZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3Jlc291cmNlcy5qcyc7XG5pbXBvcnQgeyBVUkkgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi91cmkuanMnO1xuaW1wb3J0IHsgbW9jayB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvdGVzdC9jb21tb24vbW9jay5qcyc7XG5pbXBvcnQgeyBlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL3Rlc3QvY29tbW9uL3V0aWxzLmpzJztcbmltcG9ydCB7IFNlbGVjdGlvbiB9IGZyb20gJy4uLy4uLy4uLy4uL2NvbW1vbi9jb3JlL3NlbGVjdGlvbi5qcyc7XG5pbXBvcnQgeyBUZXh0TW9kZWwgfSBmcm9tICcuLi8uLi8uLi8uLi9jb21tb24vbW9kZWwvdGV4dE1vZGVsLmpzJztcbmltcG9ydCB7IFNuaXBwZXRQYXJzZXIsIFZhcmlhYmxlLCBWYXJpYWJsZVJlc29sdmVyIH0gZnJvbSAnLi4vLi4vYnJvd3Nlci9zbmlwcGV0UGFyc2VyLmpzJztcbmltcG9ydCB7IENsaXBib2FyZEJhc2VkVmFyaWFibGVSZXNvbHZlciwgQ29tcG9zaXRlU25pcHBldFZhcmlhYmxlUmVzb2x2ZXIsIE1vZGVsQmFzZWRWYXJpYWJsZVJlc29sdmVyLCBTZWxlY3Rpb25CYXNlZFZhcmlhYmxlUmVzb2x2ZXIsIFRpbWVCYXNlZFZhcmlhYmxlUmVzb2x2ZXIsIFdvcmtzcGFjZUJhc2VkVmFyaWFibGVSZXNvbHZlciB9IGZyb20gJy4uLy4uL2Jyb3dzZXIvc25pcHBldFZhcmlhYmxlcy5qcyc7XG5pbXBvcnQgeyBjcmVhdGVUZXh0TW9kZWwgfSBmcm9tICcuLi8uLi8uLi8uLi90ZXN0L2NvbW1vbi90ZXN0VGV4dE1vZGVsLmpzJztcbmltcG9ydCB7IElMYWJlbFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9sYWJlbC9jb21tb24vbGFiZWwuanMnO1xuaW1wb3J0IHsgSVdvcmtzcGFjZSwgSVdvcmtzcGFjZUNvbnRleHRTZXJ2aWNlLCB0b1dvcmtzcGFjZUZvbGRlciB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL3dvcmtzcGFjZS9jb21tb24vd29ya3NwYWNlLmpzJztcbmltcG9ydCB7IFdvcmtzcGFjZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL3dvcmtzcGFjZS90ZXN0L2NvbW1vbi90ZXN0V29ya3NwYWNlLmpzJztcbmltcG9ydCB7IHRvV29ya3NwYWNlRm9sZGVycyB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL3dvcmtzcGFjZXMvY29tbW9uL3dvcmtzcGFjZXMuanMnO1xuXG5zdWl0ZSgnU25pcHBldCBWYXJpYWJsZXMgUmVzb2x2ZXInLCBmdW5jdGlvbiAoKSB7XG5cblxuXHRjb25zdCBsYWJlbFNlcnZpY2UgPSBuZXcgY2xhc3MgZXh0ZW5kcyBtb2NrPElMYWJlbFNlcnZpY2U+KCkge1xuXHRcdG92ZXJyaWRlIGdldFVyaUxhYmVsKHVyaTogVVJJKSB7XG5cdFx0XHRyZXR1cm4gdXJpLmZzUGF0aDtcblx0XHR9XG5cdH07XG5cblx0bGV0IG1vZGVsOiBUZXh0TW9kZWw7XG5cdGxldCByZXNvbHZlcjogVmFyaWFibGVSZXNvbHZlcjtcblxuXHRzZXR1cChmdW5jdGlvbiAoKSB7XG5cdFx0bW9kZWwgPSBjcmVhdGVUZXh0TW9kZWwoW1xuXHRcdFx0J3RoaXMgaXMgbGluZSBvbmUnLFxuXHRcdFx0J3RoaXMgaXMgbGluZSB0d28nLFxuXHRcdFx0JyAgICB0aGlzIGlzIGxpbmUgdGhyZWUnXG5cdFx0XS5qb2luKCdcXG4nKSwgdW5kZWZpbmVkLCB1bmRlZmluZWQsIFVSSS5wYXJzZSgnZmlsZTovLy9mb28vZmlsZXMvdGV4dC50eHQnKSk7XG5cblx0XHRyZXNvbHZlciA9IG5ldyBDb21wb3NpdGVTbmlwcGV0VmFyaWFibGVSZXNvbHZlcihbXG5cdFx0XHRuZXcgTW9kZWxCYXNlZFZhcmlhYmxlUmVzb2x2ZXIobGFiZWxTZXJ2aWNlLCBtb2RlbCksXG5cdFx0XHRuZXcgU2VsZWN0aW9uQmFzZWRWYXJpYWJsZVJlc29sdmVyKG1vZGVsLCBuZXcgU2VsZWN0aW9uKDEsIDEsIDEsIDEpLCAwLCB1bmRlZmluZWQpLFxuXHRcdF0pO1xuXHR9KTtcblxuXHR0ZWFyZG93bihmdW5jdGlvbiAoKSB7XG5cdFx0bW9kZWwuZGlzcG9zZSgpO1xuXHR9KTtcblxuXHRlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUoKTtcblxuXG5cdGZ1bmN0aW9uIGFzc2VydFZhcmlhYmxlUmVzb2x2ZShyZXNvbHZlcjogVmFyaWFibGVSZXNvbHZlciwgdmFyTmFtZTogc3RyaW5nLCBleHBlY3RlZD86IHN0cmluZykge1xuXHRcdGNvbnN0IHNuaXBwZXQgPSBuZXcgU25pcHBldFBhcnNlcigpLnBhcnNlKGAkJHt2YXJOYW1lfWApO1xuXHRcdGNvbnN0IHZhcmlhYmxlID0gPFZhcmlhYmxlPnNuaXBwZXQuY2hpbGRyZW5bMF07XG5cdFx0dmFyaWFibGUucmVzb2x2ZShyZXNvbHZlcik7XG5cdFx0aWYgKHZhcmlhYmxlLmNoaWxkcmVuLmxlbmd0aCA9PT0gMCkge1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHVuZGVmaW5lZCwgZXhwZWN0ZWQpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodmFyaWFibGUudG9TdHJpbmcoKSwgZXhwZWN0ZWQpO1xuXHRcdH1cblx0fVxuXG5cdHRlc3QoJ2VkaXRvciB2YXJpYWJsZXMsIGJhc2ljcycsIGZ1bmN0aW9uICgpIHtcblx0XHRhc3NlcnRWYXJpYWJsZVJlc29sdmUocmVzb2x2ZXIsICdUTV9GSUxFTkFNRScsICd0ZXh0LnR4dCcpO1xuXHRcdGFzc2VydFZhcmlhYmxlUmVzb2x2ZShyZXNvbHZlciwgJ3NvbWV0aGluZycsIHVuZGVmaW5lZCk7XG5cdH0pO1xuXG5cdHRlc3QoJ2VkaXRvciB2YXJpYWJsZXMsIGZpbGUvZGlyJywgZnVuY3Rpb24gKCkge1xuXG5cdFx0Y29uc3QgZGlzcG9zYWJsZXMgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cblx0XHRhc3NlcnRWYXJpYWJsZVJlc29sdmUocmVzb2x2ZXIsICdUTV9GSUxFTkFNRScsICd0ZXh0LnR4dCcpO1xuXHRcdGlmICghaXNXaW5kb3dzKSB7XG5cdFx0XHRhc3NlcnRWYXJpYWJsZVJlc29sdmUocmVzb2x2ZXIsICdUTV9ESVJFQ1RPUlknLCAnL2Zvby9maWxlcycpO1xuXHRcdFx0YXNzZXJ0VmFyaWFibGVSZXNvbHZlKHJlc29sdmVyLCAnVE1fRElSRUNUT1JZX0JBU0UnLCAnZmlsZXMnKTtcblx0XHRcdGFzc2VydFZhcmlhYmxlUmVzb2x2ZShyZXNvbHZlciwgJ1RNX0ZJTEVQQVRIJywgJy9mb28vZmlsZXMvdGV4dC50eHQnKTtcblx0XHR9XG5cblx0XHRyZXNvbHZlciA9IG5ldyBNb2RlbEJhc2VkVmFyaWFibGVSZXNvbHZlcihcblx0XHRcdGxhYmVsU2VydmljZSxcblx0XHRcdGRpc3Bvc2FibGVzLmFkZChjcmVhdGVUZXh0TW9kZWwoJycsIHVuZGVmaW5lZCwgdW5kZWZpbmVkLCBVUkkucGFyc2UoJ2h0dHA6Ly93d3cucGIuby9hYmMvZGVmL2doaScpKSlcblx0XHQpO1xuXHRcdGFzc2VydFZhcmlhYmxlUmVzb2x2ZShyZXNvbHZlciwgJ1RNX0ZJTEVOQU1FJywgJ2doaScpO1xuXHRcdGlmICghaXNXaW5kb3dzKSB7XG5cdFx0XHRhc3NlcnRWYXJpYWJsZVJlc29sdmUocmVzb2x2ZXIsICdUTV9ESVJFQ1RPUlknLCAnL2FiYy9kZWYnKTtcblx0XHRcdGFzc2VydFZhcmlhYmxlUmVzb2x2ZShyZXNvbHZlciwgJ1RNX0RJUkVDVE9SWV9CQVNFJywgJ2RlZicpO1xuXHRcdFx0YXNzZXJ0VmFyaWFibGVSZXNvbHZlKHJlc29sdmVyLCAnVE1fRklMRVBBVEgnLCAnL2FiYy9kZWYvZ2hpJyk7XG5cdFx0fVxuXG5cdFx0cmVzb2x2ZXIgPSBuZXcgTW9kZWxCYXNlZFZhcmlhYmxlUmVzb2x2ZXIoXG5cdFx0XHRsYWJlbFNlcnZpY2UsXG5cdFx0XHRkaXNwb3NhYmxlcy5hZGQoY3JlYXRlVGV4dE1vZGVsKCcnLCB1bmRlZmluZWQsIHVuZGVmaW5lZCwgVVJJLnBhcnNlKCdtZW06ZmZmLnRzJykpKVxuXHRcdCk7XG5cdFx0YXNzZXJ0VmFyaWFibGVSZXNvbHZlKHJlc29sdmVyLCAnVE1fRElSRUNUT1JZJywgJycpO1xuXHRcdGFzc2VydFZhcmlhYmxlUmVzb2x2ZShyZXNvbHZlciwgJ1RNX0RJUkVDVE9SWV9CQVNFJywgJycpO1xuXHRcdGFzc2VydFZhcmlhYmxlUmVzb2x2ZShyZXNvbHZlciwgJ1RNX0ZJTEVQQVRIJywgJ2ZmZi50cycpO1xuXG5cdFx0ZGlzcG9zYWJsZXMuZGlzcG9zZSgpO1xuXHR9KTtcblxuXHR0ZXN0KCdQYXRoIGRlbGltaXRlcnMgaW4gY29kZSBzbmlwcGV0IHZhcmlhYmxlcyBhcmVuXFwndCBzcGVjaWZpYyB0byByZW1vdGUgT1MgIzc2ODQwJywgZnVuY3Rpb24gKCkge1xuXG5cdFx0Y29uc3QgbGFiZWxTZXJ2aWNlID0gbmV3IGNsYXNzIGV4dGVuZHMgbW9jazxJTGFiZWxTZXJ2aWNlPigpIHtcblx0XHRcdG92ZXJyaWRlIGdldFVyaUxhYmVsKHVyaTogVVJJKSB7XG5cdFx0XHRcdHJldHVybiB1cmkuZnNQYXRoLnJlcGxhY2UoL1xcL3xcXFxcL2csICd8Jyk7XG5cdFx0XHR9XG5cdFx0fTtcblxuXHRcdGNvbnN0IG1vZGVsID0gY3JlYXRlVGV4dE1vZGVsKFtdLmpvaW4oJ1xcbicpLCB1bmRlZmluZWQsIHVuZGVmaW5lZCwgVVJJLnBhcnNlKCdmb286Ly8vZm9vL2ZpbGVzL3RleHQudHh0JykpO1xuXG5cdFx0Y29uc3QgcmVzb2x2ZXIgPSBuZXcgQ29tcG9zaXRlU25pcHBldFZhcmlhYmxlUmVzb2x2ZXIoW25ldyBNb2RlbEJhc2VkVmFyaWFibGVSZXNvbHZlcihsYWJlbFNlcnZpY2UsIG1vZGVsKV0pO1xuXG5cdFx0YXNzZXJ0VmFyaWFibGVSZXNvbHZlKHJlc29sdmVyLCAnVE1fRklMRVBBVEgnLCAnfGZvb3xmaWxlc3x0ZXh0LnR4dCcpO1xuXG5cdFx0bW9kZWwuZGlzcG9zZSgpO1xuXHR9KTtcblxuXHR0ZXN0KCdlZGl0b3IgdmFyaWFibGVzLCBzZWxlY3Rpb24nLCBmdW5jdGlvbiAoKSB7XG5cblx0XHRyZXNvbHZlciA9IG5ldyBTZWxlY3Rpb25CYXNlZFZhcmlhYmxlUmVzb2x2ZXIobW9kZWwsIG5ldyBTZWxlY3Rpb24oMSwgMiwgMiwgMyksIDAsIHVuZGVmaW5lZCk7XG5cdFx0YXNzZXJ0VmFyaWFibGVSZXNvbHZlKHJlc29sdmVyLCAnVE1fU0VMRUNURURfVEVYVCcsICdoaXMgaXMgbGluZSBvbmVcXG50aCcpO1xuXHRcdGFzc2VydFZhcmlhYmxlUmVzb2x2ZShyZXNvbHZlciwgJ1RNX0NVUlJFTlRfTElORScsICd0aGlzIGlzIGxpbmUgdHdvJyk7XG5cdFx0YXNzZXJ0VmFyaWFibGVSZXNvbHZlKHJlc29sdmVyLCAnVE1fTElORV9JTkRFWCcsICcxJyk7XG5cdFx0YXNzZXJ0VmFyaWFibGVSZXNvbHZlKHJlc29sdmVyLCAnVE1fTElORV9OVU1CRVInLCAnMicpO1xuXHRcdGFzc2VydFZhcmlhYmxlUmVzb2x2ZShyZXNvbHZlciwgJ0NVUlNPUl9JTkRFWCcsICcwJyk7XG5cdFx0YXNzZXJ0VmFyaWFibGVSZXNvbHZlKHJlc29sdmVyLCAnQ1VSU09SX05VTUJFUicsICcxJyk7XG5cblx0XHRyZXNvbHZlciA9IG5ldyBTZWxlY3Rpb25CYXNlZFZhcmlhYmxlUmVzb2x2ZXIobW9kZWwsIG5ldyBTZWxlY3Rpb24oMSwgMiwgMiwgMyksIDQsIHVuZGVmaW5lZCk7XG5cdFx0YXNzZXJ0VmFyaWFibGVSZXNvbHZlKHJlc29sdmVyLCAnQ1VSU09SX0lOREVYJywgJzQnKTtcblx0XHRhc3NlcnRWYXJpYWJsZVJlc29sdmUocmVzb2x2ZXIsICdDVVJTT1JfTlVNQkVSJywgJzUnKTtcblxuXHRcdHJlc29sdmVyID0gbmV3IFNlbGVjdGlvbkJhc2VkVmFyaWFibGVSZXNvbHZlcihtb2RlbCwgbmV3IFNlbGVjdGlvbigyLCAzLCAxLCAyKSwgMCwgdW5kZWZpbmVkKTtcblx0XHRhc3NlcnRWYXJpYWJsZVJlc29sdmUocmVzb2x2ZXIsICdUTV9TRUxFQ1RFRF9URVhUJywgJ2hpcyBpcyBsaW5lIG9uZVxcbnRoJyk7XG5cdFx0YXNzZXJ0VmFyaWFibGVSZXNvbHZlKHJlc29sdmVyLCAnVE1fQ1VSUkVOVF9MSU5FJywgJ3RoaXMgaXMgbGluZSBvbmUnKTtcblx0XHRhc3NlcnRWYXJpYWJsZVJlc29sdmUocmVzb2x2ZXIsICdUTV9MSU5FX0lOREVYJywgJzAnKTtcblx0XHRhc3NlcnRWYXJpYWJsZVJlc29sdmUocmVzb2x2ZXIsICdUTV9MSU5FX05VTUJFUicsICcxJyk7XG5cblx0XHRyZXNvbHZlciA9IG5ldyBTZWxlY3Rpb25CYXNlZFZhcmlhYmxlUmVzb2x2ZXIobW9kZWwsIG5ldyBTZWxlY3Rpb24oMSwgMiwgMSwgMiksIDAsIHVuZGVmaW5lZCk7XG5cdFx0YXNzZXJ0VmFyaWFibGVSZXNvbHZlKHJlc29sdmVyLCAnVE1fU0VMRUNURURfVEVYVCcsIHVuZGVmaW5lZCk7XG5cblx0XHRhc3NlcnRWYXJpYWJsZVJlc29sdmUocmVzb2x2ZXIsICdUTV9DVVJSRU5UX1dPUkQnLCAndGhpcycpO1xuXG5cdFx0cmVzb2x2ZXIgPSBuZXcgU2VsZWN0aW9uQmFzZWRWYXJpYWJsZVJlc29sdmVyKG1vZGVsLCBuZXcgU2VsZWN0aW9uKDMsIDEsIDMsIDEpLCAwLCB1bmRlZmluZWQpO1xuXHRcdGFzc2VydFZhcmlhYmxlUmVzb2x2ZShyZXNvbHZlciwgJ1RNX0NVUlJFTlRfV09SRCcsIHVuZGVmaW5lZCk7XG5cblx0fSk7XG5cblx0dGVzdCgnVGV4dG1hdGVTbmlwcGV0LCByZXNvbHZlIHZhcmlhYmxlJywgZnVuY3Rpb24gKCkge1xuXHRcdGNvbnN0IHNuaXBwZXQgPSBuZXcgU25pcHBldFBhcnNlcigpLnBhcnNlKCdcIiRUTV9DVVJSRU5UX1dPUkRcIicsIHRydWUpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzbmlwcGV0LnRvU3RyaW5nKCksICdcIlwiJyk7XG5cdFx0c25pcHBldC5yZXNvbHZlVmFyaWFibGVzKHJlc29sdmVyKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc25pcHBldC50b1N0cmluZygpLCAnXCJ0aGlzXCInKTtcblxuXHR9KTtcblxuXHR0ZXN0KCdUZXh0bWF0ZVNuaXBwZXQsIHJlc29sdmUgdmFyaWFibGUgd2l0aCBkZWZhdWx0JywgZnVuY3Rpb24gKCkge1xuXHRcdGNvbnN0IHNuaXBwZXQgPSBuZXcgU25pcHBldFBhcnNlcigpLnBhcnNlKCdcIiR7VE1fQ1VSUkVOVF9XT1JEOmZvb31cIicsIHRydWUpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzbmlwcGV0LnRvU3RyaW5nKCksICdcImZvb1wiJyk7XG5cdFx0c25pcHBldC5yZXNvbHZlVmFyaWFibGVzKHJlc29sdmVyKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc25pcHBldC50b1N0cmluZygpLCAnXCJ0aGlzXCInKTtcblx0fSk7XG5cblx0dGVzdCgnTW9yZSB1c2VmdWwgZW52aXJvbm1lbnQgdmFyaWFibGVzIGZvciBzbmlwcGV0cywgIzMyNzM3JywgZnVuY3Rpb24gKCkge1xuXG5cdFx0Y29uc3QgZGlzcG9zYWJsZXMgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cblx0XHRhc3NlcnRWYXJpYWJsZVJlc29sdmUocmVzb2x2ZXIsICdUTV9GSUxFTkFNRV9CQVNFJywgJ3RleHQnKTtcblxuXHRcdHJlc29sdmVyID0gbmV3IE1vZGVsQmFzZWRWYXJpYWJsZVJlc29sdmVyKFxuXHRcdFx0bGFiZWxTZXJ2aWNlLFxuXHRcdFx0ZGlzcG9zYWJsZXMuYWRkKGNyZWF0ZVRleHRNb2RlbCgnJywgdW5kZWZpbmVkLCB1bmRlZmluZWQsIFVSSS5wYXJzZSgnaHR0cDovL3d3dy5wYi5vL2FiYy9kZWYvZ2hpJykpKVxuXHRcdCk7XG5cdFx0YXNzZXJ0VmFyaWFibGVSZXNvbHZlKHJlc29sdmVyLCAnVE1fRklMRU5BTUVfQkFTRScsICdnaGknKTtcblxuXHRcdHJlc29sdmVyID0gbmV3IE1vZGVsQmFzZWRWYXJpYWJsZVJlc29sdmVyKFxuXHRcdFx0bGFiZWxTZXJ2aWNlLFxuXHRcdFx0ZGlzcG9zYWJsZXMuYWRkKGNyZWF0ZVRleHRNb2RlbCgnJywgdW5kZWZpbmVkLCB1bmRlZmluZWQsIFVSSS5wYXJzZSgnbWVtOi5naXQnKSkpXG5cdFx0KTtcblx0XHRhc3NlcnRWYXJpYWJsZVJlc29sdmUocmVzb2x2ZXIsICdUTV9GSUxFTkFNRV9CQVNFJywgJy5naXQnKTtcblxuXHRcdHJlc29sdmVyID0gbmV3IE1vZGVsQmFzZWRWYXJpYWJsZVJlc29sdmVyKFxuXHRcdFx0bGFiZWxTZXJ2aWNlLFxuXHRcdFx0ZGlzcG9zYWJsZXMuYWRkKGNyZWF0ZVRleHRNb2RlbCgnJywgdW5kZWZpbmVkLCB1bmRlZmluZWQsIFVSSS5wYXJzZSgnbWVtOmZvby4nKSkpXG5cdFx0KTtcblx0XHRhc3NlcnRWYXJpYWJsZVJlc29sdmUocmVzb2x2ZXIsICdUTV9GSUxFTkFNRV9CQVNFJywgJ2ZvbycpO1xuXG5cdFx0ZGlzcG9zYWJsZXMuZGlzcG9zZSgpO1xuXHR9KTtcblxuXG5cdGZ1bmN0aW9uIGFzc2VydFZhcmlhYmxlUmVzb2x2ZTIoaW5wdXQ6IHN0cmluZywgZXhwZWN0ZWQ6IHN0cmluZywgdmFyVmFsdWU/OiBzdHJpbmcpIHtcblx0XHRjb25zdCBzbmlwcGV0ID0gbmV3IFNuaXBwZXRQYXJzZXIoKS5wYXJzZShpbnB1dClcblx0XHRcdC5yZXNvbHZlVmFyaWFibGVzKHsgcmVzb2x2ZSh2YXJpYWJsZSkgeyByZXR1cm4gdmFyVmFsdWUgfHwgdmFyaWFibGUubmFtZTsgfSB9KTtcblxuXHRcdGNvbnN0IGFjdHVhbCA9IHNuaXBwZXQudG9TdHJpbmcoKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYWN0dWFsLCBleHBlY3RlZCk7XG5cdH1cblxuXHR0ZXN0KCdWYXJpYWJsZSBTbmlwcGV0IFRyYW5zZm9ybScsIGZ1bmN0aW9uICgpIHtcblxuXHRcdGNvbnN0IHNuaXBwZXQgPSBuZXcgU25pcHBldFBhcnNlcigpLnBhcnNlKCduYW1lPSR7VE1fRklMRU5BTUUvKC4qKVxcXFwuLiskLyQxL30nLCB0cnVlKTtcblx0XHRzbmlwcGV0LnJlc29sdmVWYXJpYWJsZXMocmVzb2x2ZXIpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzbmlwcGV0LnRvU3RyaW5nKCksICduYW1lPXRleHQnKTtcblxuXHRcdGFzc2VydFZhcmlhYmxlUmVzb2x2ZTIoJyR7VGhpc0lzQVZhci8oW0EtWl0pLiooVmFyKS8kMi99JywgJ1ZhcicpO1xuXHRcdGFzc2VydFZhcmlhYmxlUmVzb2x2ZTIoJyR7VGhpc0lzQVZhci8oW0EtWl0pLiooVmFyKS8kMi0kezE6L2Rvd25jYXNlfS99JywgJ1Zhci10Jyk7XG5cdFx0YXNzZXJ0VmFyaWFibGVSZXNvbHZlMignJHtGb28vKC4qKS8kezE6K0Jhcn0vaW1nfScsICdCYXInKTtcblxuXHRcdC8vaHR0cHM6Ly9naXRodWIuY29tL21pY3Jvc29mdC92c2NvZGUvaXNzdWVzLzMzMTYyXG5cdFx0YXNzZXJ0VmFyaWFibGVSZXNvbHZlMignZXhwb3J0IGRlZmF1bHQgY2xhc3MgJHtUTV9GSUxFTkFNRS8oXFxcXHcrKVxcXFwuanMvJDEvZ30nLCAnZXhwb3J0IGRlZmF1bHQgY2xhc3MgRm9vRmlsZScsICdGb29GaWxlLmpzJyk7XG5cblx0XHRhc3NlcnRWYXJpYWJsZVJlc29sdmUyKCcke2Zvb2JhcmZvb2Jhci8oZm9vKS8kezE6K0ZBUn0vZ30nLCAnRkFSYmFyRkFSYmFyJyk7IC8vIGdsb2JhbFxuXHRcdGFzc2VydFZhcmlhYmxlUmVzb2x2ZTIoJyR7Zm9vYmFyZm9vYmFyLyhmb28pLyR7MTorRkFSfS99JywgJ0ZBUmJhcmZvb2JhcicpOyAvLyBmaXJzdCBtYXRjaFxuXHRcdGFzc2VydFZhcmlhYmxlUmVzb2x2ZTIoJyR7Zm9vYmFyZm9vYmFyLyhiYXp6KS8kezE6K0ZBUn0vZ30nLCAnZm9vYmFyZm9vYmFyJyk7IC8vIG5vIG1hdGNoLCBubyBlbHNlXG5cdFx0Ly8gYXNzZXJ0VmFyaWFibGVSZXNvbHZlMignJHtmb29iYXJmb29iYXIvKGJhenopLyR7MTorRkFSfS9nfScsICcnKTsgLy8gbm8gbWF0Y2hcblxuXHRcdGFzc2VydFZhcmlhYmxlUmVzb2x2ZTIoJyR7Zm9vYmFyZm9vYmFyLyhmb28pLyR7MjorRkFSfS9nfScsICdiYXJiYXInKTsgLy8gYmFkIGdyb3VwIHJlZmVyZW5jZVxuXHR9KTtcblxuXHR0ZXN0KCdTbmlwcGV0IHRyYW5zZm9ybXMgZG8gbm90IGhhbmRsZSByZWdleCB3aXRoIGFsdGVybmF0aXZlcyBvciBvcHRpb25hbCBtYXRjaGVzLCAjMzYwODknLCBmdW5jdGlvbiAoKSB7XG5cblx0XHRhc3NlcnRWYXJpYWJsZVJlc29sdmUyKFxuXHRcdFx0JyR7VE1fRklMRU5BTUUvXiguKXwoPzotKC4pKXwoXFxcXC5qcykvJHsxOi91cGNhc2V9JHsyOi91cGNhc2V9L2d9Jyxcblx0XHRcdCdNeUNsYXNzJyxcblx0XHRcdCdteS1jbGFzcy5qcydcblx0XHQpO1xuXG5cdFx0Ly8gbm8gaHlwaGVuc1xuXHRcdGFzc2VydFZhcmlhYmxlUmVzb2x2ZTIoXG5cdFx0XHQnJHtUTV9GSUxFTkFNRS9eKC4pfCg/Oi0oLikpfChcXFxcLmpzKS8kezE6L3VwY2FzZX0kezI6L3VwY2FzZX0vZ30nLFxuXHRcdFx0J015Y2xhc3MnLFxuXHRcdFx0J215Y2xhc3MuanMnXG5cdFx0KTtcblxuXHRcdC8vIG5vbmUgbWF0Y2hpbmcgc3VmZml4XG5cdFx0YXNzZXJ0VmFyaWFibGVSZXNvbHZlMihcblx0XHRcdCcke1RNX0ZJTEVOQU1FL14oLil8KD86LSguKSl8KFxcXFwuanMpLyR7MTovdXBjYXNlfSR7MjovdXBjYXNlfS9nfScsXG5cdFx0XHQnTXljbGFzcy5mb28nLFxuXHRcdFx0J215Y2xhc3MuZm9vJ1xuXHRcdCk7XG5cblx0XHQvLyBtb3JlIHRoYW4gb25lIGh5cGhlblxuXHRcdGFzc2VydFZhcmlhYmxlUmVzb2x2ZTIoXG5cdFx0XHQnJHtUTV9GSUxFTkFNRS9eKC4pfCg/Oi0oLikpfChcXFxcLmpzKS8kezE6L3VwY2FzZX0kezI6L3VwY2FzZX0vZ30nLFxuXHRcdFx0J1RoaXNJc0FGaWxlJyxcblx0XHRcdCd0aGlzLWlzLWEtZmlsZS5qcydcblx0XHQpO1xuXG5cdFx0Ly8gS0VCQUIgQ0FTRVxuXHRcdGFzc2VydFZhcmlhYmxlUmVzb2x2ZTIoXG5cdFx0XHQnJHtUTV9GSUxFTkFNRV9CQVNFLyhbQS1aXVthLXpdKykoW0EtWl1bYS16XSskKT8vJHsxOi9kb3duY2FzZX0tJHsyOi9kb3duY2FzZX0vZ30nLFxuXHRcdFx0J2NhcGl0YWwtY2FzZScsXG5cdFx0XHQnQ2FwaXRhbENhc2UnXG5cdFx0KTtcblxuXHRcdGFzc2VydFZhcmlhYmxlUmVzb2x2ZTIoXG5cdFx0XHQnJHtUTV9GSUxFTkFNRV9CQVNFLyhbQS1aXVthLXpdKykoW0EtWl1bYS16XSskKT8vJHsxOi9kb3duY2FzZX0tJHsyOi9kb3duY2FzZX0vZ30nLFxuXHRcdFx0J2NhcGl0YWwtY2FzZS1tb3JlJyxcblx0XHRcdCdDYXBpdGFsQ2FzZU1vcmUnXG5cdFx0KTtcblx0fSk7XG5cblx0dGVzdCgnQWRkIHZhcmlhYmxlIHRvIGluc2VydCB2YWx1ZSBmcm9tIGNsaXBib2FyZCB0byBhIHNuaXBwZXQgIzQwMTUzJywgZnVuY3Rpb24gKCkge1xuXG5cdFx0YXNzZXJ0VmFyaWFibGVSZXNvbHZlKG5ldyBDbGlwYm9hcmRCYXNlZFZhcmlhYmxlUmVzb2x2ZXIoKCkgPT4gdW5kZWZpbmVkLCAxLCAwLCB0cnVlKSwgJ0NMSVBCT0FSRCcsIHVuZGVmaW5lZCk7XG5cblx0XHRhc3NlcnRWYXJpYWJsZVJlc29sdmUobmV3IENsaXBib2FyZEJhc2VkVmFyaWFibGVSZXNvbHZlcigoKSA9PiBudWxsISwgMSwgMCwgdHJ1ZSksICdDTElQQk9BUkQnLCB1bmRlZmluZWQpO1xuXG5cdFx0YXNzZXJ0VmFyaWFibGVSZXNvbHZlKG5ldyBDbGlwYm9hcmRCYXNlZFZhcmlhYmxlUmVzb2x2ZXIoKCkgPT4gJycsIDEsIDAsIHRydWUpLCAnQ0xJUEJPQVJEJywgdW5kZWZpbmVkKTtcblxuXHRcdGFzc2VydFZhcmlhYmxlUmVzb2x2ZShuZXcgQ2xpcGJvYXJkQmFzZWRWYXJpYWJsZVJlc29sdmVyKCgpID0+ICdmb28nLCAxLCAwLCB0cnVlKSwgJ0NMSVBCT0FSRCcsICdmb28nKTtcblxuXHRcdGFzc2VydFZhcmlhYmxlUmVzb2x2ZShuZXcgQ2xpcGJvYXJkQmFzZWRWYXJpYWJsZVJlc29sdmVyKCgpID0+ICdmb28nLCAxLCAwLCB0cnVlKSwgJ2ZvbycsIHVuZGVmaW5lZCk7XG5cdFx0YXNzZXJ0VmFyaWFibGVSZXNvbHZlKG5ldyBDbGlwYm9hcmRCYXNlZFZhcmlhYmxlUmVzb2x2ZXIoKCkgPT4gJ2ZvbycsIDEsIDAsIHRydWUpLCAnY0xJUEJPQVJEJywgdW5kZWZpbmVkKTtcblx0fSk7XG5cblx0dGVzdCgnQWRkIHZhcmlhYmxlIHRvIGluc2VydCB2YWx1ZSBmcm9tIGNsaXBib2FyZCB0byBhIHNuaXBwZXQgIzQwMTUzLCAyJywgZnVuY3Rpb24gKCkge1xuXG5cdFx0YXNzZXJ0VmFyaWFibGVSZXNvbHZlKG5ldyBDbGlwYm9hcmRCYXNlZFZhcmlhYmxlUmVzb2x2ZXIoKCkgPT4gJ2xpbmUxJywgMSwgMiwgdHJ1ZSksICdDTElQQk9BUkQnLCAnbGluZTEnKTtcblx0XHRhc3NlcnRWYXJpYWJsZVJlc29sdmUobmV3IENsaXBib2FyZEJhc2VkVmFyaWFibGVSZXNvbHZlcigoKSA9PiAnbGluZTFcXG5saW5lMlxcbmxpbmUzJywgMSwgMiwgdHJ1ZSksICdDTElQQk9BUkQnLCAnbGluZTFcXG5saW5lMlxcbmxpbmUzJyk7XG5cblx0XHRhc3NlcnRWYXJpYWJsZVJlc29sdmUobmV3IENsaXBib2FyZEJhc2VkVmFyaWFibGVSZXNvbHZlcigoKSA9PiAnbGluZTFcXG5saW5lMicsIDEsIDIsIHRydWUpLCAnQ0xJUEJPQVJEJywgJ2xpbmUyJyk7XG5cdFx0cmVzb2x2ZXIgPSBuZXcgQ2xpcGJvYXJkQmFzZWRWYXJpYWJsZVJlc29sdmVyKCgpID0+ICdsaW5lMVxcbmxpbmUyJywgMCwgMiwgdHJ1ZSk7XG5cdFx0YXNzZXJ0VmFyaWFibGVSZXNvbHZlKG5ldyBDbGlwYm9hcmRCYXNlZFZhcmlhYmxlUmVzb2x2ZXIoKCkgPT4gJ2xpbmUxXFxubGluZTInLCAwLCAyLCB0cnVlKSwgJ0NMSVBCT0FSRCcsICdsaW5lMScpO1xuXG5cdFx0YXNzZXJ0VmFyaWFibGVSZXNvbHZlKG5ldyBDbGlwYm9hcmRCYXNlZFZhcmlhYmxlUmVzb2x2ZXIoKCkgPT4gJ2xpbmUxXFxubGluZTInLCAwLCAyLCBmYWxzZSksICdDTElQQk9BUkQnLCAnbGluZTFcXG5saW5lMicpO1xuXHR9KTtcblxuXG5cdGZ1bmN0aW9uIGFzc2VydFZhcmlhYmxlUmVzb2x2ZTMocmVzb2x2ZXI6IFZhcmlhYmxlUmVzb2x2ZXIsIHZhck5hbWU6IHN0cmluZykge1xuXHRcdGNvbnN0IHNuaXBwZXQgPSBuZXcgU25pcHBldFBhcnNlcigpLnBhcnNlKGAkJHt2YXJOYW1lfWApO1xuXHRcdGNvbnN0IHZhcmlhYmxlID0gPFZhcmlhYmxlPnNuaXBwZXQuY2hpbGRyZW5bMF07XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodmFyaWFibGUucmVzb2x2ZShyZXNvbHZlciksIHRydWUsIGAke3Zhck5hbWV9IGZhaWxlZCB0byByZXNvbHZlYCk7XG5cdH1cblxuXHR0ZXN0KCdBZGQgdGltZSB2YXJpYWJsZXMgZm9yIHNuaXBwZXRzICM0MTYzMSwgIzQzMTQwJywgZnVuY3Rpb24gKCkge1xuXG5cdFx0Y29uc3QgcmVzb2x2ZXIgPSBuZXcgVGltZUJhc2VkVmFyaWFibGVSZXNvbHZlcjtcblxuXHRcdGFzc2VydFZhcmlhYmxlUmVzb2x2ZTMocmVzb2x2ZXIsICdDVVJSRU5UX1lFQVInKTtcblx0XHRhc3NlcnRWYXJpYWJsZVJlc29sdmUzKHJlc29sdmVyLCAnQ1VSUkVOVF9ZRUFSX1NIT1JUJyk7XG5cdFx0YXNzZXJ0VmFyaWFibGVSZXNvbHZlMyhyZXNvbHZlciwgJ0NVUlJFTlRfTU9OVEgnKTtcblx0XHRhc3NlcnRWYXJpYWJsZVJlc29sdmUzKHJlc29sdmVyLCAnQ1VSUkVOVF9EQVRFJyk7XG5cdFx0YXNzZXJ0VmFyaWFibGVSZXNvbHZlMyhyZXNvbHZlciwgJ0NVUlJFTlRfSE9VUicpO1xuXHRcdGFzc2VydFZhcmlhYmxlUmVzb2x2ZTMocmVzb2x2ZXIsICdDVVJSRU5UX01JTlVURScpO1xuXHRcdGFzc2VydFZhcmlhYmxlUmVzb2x2ZTMocmVzb2x2ZXIsICdDVVJSRU5UX1NFQ09ORCcpO1xuXHRcdGFzc2VydFZhcmlhYmxlUmVzb2x2ZTMocmVzb2x2ZXIsICdDVVJSRU5UX01JTExJU0VDT05EJyk7XG5cdFx0YXNzZXJ0VmFyaWFibGVSZXNvbHZlMyhyZXNvbHZlciwgJ0NVUlJFTlRfREFZX05BTUUnKTtcblx0XHRhc3NlcnRWYXJpYWJsZVJlc29sdmUzKHJlc29sdmVyLCAnQ1VSUkVOVF9EQVlfTkFNRV9TSE9SVCcpO1xuXHRcdGFzc2VydFZhcmlhYmxlUmVzb2x2ZTMocmVzb2x2ZXIsICdDVVJSRU5UX01PTlRIX05BTUUnKTtcblx0XHRhc3NlcnRWYXJpYWJsZVJlc29sdmUzKHJlc29sdmVyLCAnQ1VSUkVOVF9NT05USF9OQU1FX1NIT1JUJyk7XG5cdFx0YXNzZXJ0VmFyaWFibGVSZXNvbHZlMyhyZXNvbHZlciwgJ0NVUlJFTlRfU0VDT05EU19VTklYJyk7XG5cdFx0YXNzZXJ0VmFyaWFibGVSZXNvbHZlMyhyZXNvbHZlciwgJ0NVUlJFTlRfTUlMTElTRUNPTkRTX1VOSVgnKTtcblx0XHRhc3NlcnRWYXJpYWJsZVJlc29sdmUzKHJlc29sdmVyLCAnQ1VSUkVOVF9USU1FWk9ORV9PRkZTRVQnKTtcblx0XHRhc3NlcnRWYXJpYWJsZVJlc29sdmUzKHJlc29sdmVyLCAnQ1VSUkVOVF9USU1FWk9ORV9OQU1FJyk7XG5cdH0pO1xuXG5cdHRlc3QoJ1RpbWUtYmFzZWQgc25pcHBldCB2YXJpYWJsZXMgaGF2ZSBkZXRlcm1pbmlzdGljIG1pbGxpc2Vjb25kIGFuZCB1bml4IHZhbHVlcycsIGZ1bmN0aW9uICgpIHtcblx0XHRjb25zdCBub3cgPSBEYXRlLlVUQygyMDI0LCAzLCAxNSwgMTIsIDM0LCA1NiwgNyk7XG5cdFx0Y29uc3QgY2xvY2sgPSBzaW5vbi51c2VGYWtlVGltZXJzKHsgbm93IH0pO1xuXHRcdHRyeSB7XG5cdFx0XHRjb25zdCByZXNvbHZlciA9IG5ldyBUaW1lQmFzZWRWYXJpYWJsZVJlc29sdmVyO1xuXHRcdFx0Y29uc3QgZXhwZWN0ZWREYXRlID0gbmV3IERhdGUobm93KTtcblx0XHRcdGNvbnN0IHBhZCA9ICh2YWx1ZTogbnVtYmVyLCBsZW5ndGg6IG51bWJlcikgPT4gU3RyaW5nKHZhbHVlKS5wYWRTdGFydChsZW5ndGgsICcwJyk7XG5cblx0XHRcdGFzc2VydFZhcmlhYmxlUmVzb2x2ZShyZXNvbHZlciwgJ0NVUlJFTlRfWUVBUicsIFN0cmluZyhleHBlY3RlZERhdGUuZ2V0RnVsbFllYXIoKSkpO1xuXHRcdFx0YXNzZXJ0VmFyaWFibGVSZXNvbHZlKHJlc29sdmVyLCAnQ1VSUkVOVF9ZRUFSX1NIT1JUJywgU3RyaW5nKGV4cGVjdGVkRGF0ZS5nZXRGdWxsWWVhcigpKS5zbGljZSgtMikpO1xuXHRcdFx0YXNzZXJ0VmFyaWFibGVSZXNvbHZlKHJlc29sdmVyLCAnQ1VSUkVOVF9NT05USCcsIHBhZChleHBlY3RlZERhdGUuZ2V0TW9udGgoKSArIDEsIDIpKTtcblx0XHRcdGFzc2VydFZhcmlhYmxlUmVzb2x2ZShyZXNvbHZlciwgJ0NVUlJFTlRfREFURScsIHBhZChleHBlY3RlZERhdGUuZ2V0RGF0ZSgpLCAyKSk7XG5cdFx0XHRhc3NlcnRWYXJpYWJsZVJlc29sdmUocmVzb2x2ZXIsICdDVVJSRU5UX0hPVVInLCBwYWQoZXhwZWN0ZWREYXRlLmdldEhvdXJzKCksIDIpKTtcblx0XHRcdGFzc2VydFZhcmlhYmxlUmVzb2x2ZShyZXNvbHZlciwgJ0NVUlJFTlRfTUlOVVRFJywgcGFkKGV4cGVjdGVkRGF0ZS5nZXRNaW51dGVzKCksIDIpKTtcblx0XHRcdGFzc2VydFZhcmlhYmxlUmVzb2x2ZShyZXNvbHZlciwgJ0NVUlJFTlRfU0VDT05EJywgcGFkKGV4cGVjdGVkRGF0ZS5nZXRTZWNvbmRzKCksIDIpKTtcblx0XHRcdGFzc2VydFZhcmlhYmxlUmVzb2x2ZShyZXNvbHZlciwgJ0NVUlJFTlRfTUlMTElTRUNPTkQnLCBwYWQoZXhwZWN0ZWREYXRlLmdldE1pbGxpc2Vjb25kcygpLCAzKSk7XG5cdFx0XHRhc3NlcnRWYXJpYWJsZVJlc29sdmUocmVzb2x2ZXIsICdDVVJSRU5UX1NFQ09ORFNfVU5JWCcsIFN0cmluZyhNYXRoLmZsb29yKG5vdyAvIDEwMDApKSk7XG5cdFx0XHRhc3NlcnRWYXJpYWJsZVJlc29sdmUocmVzb2x2ZXIsICdDVVJSRU5UX01JTExJU0VDT05EU19VTklYJywgU3RyaW5nKG5vdykpO1xuXHRcdH0gZmluYWxseSB7XG5cdFx0XHRjbG9jay5yZXN0b3JlKCk7XG5cdFx0fVxuXHR9KTtcblxuXHR0ZXN0KCdUaW1lLWJhc2VkIHNuaXBwZXQgdmFyaWFibGVzIHJlc29sdmUgdG8gdGhlIHNhbWUgdmFsdWVzIGV2ZW4gYXMgdGltZSBwcm9ncmVzc2VzJywgYXN5bmMgZnVuY3Rpb24gKCkge1xuXHRcdGNvbnN0IHNuaXBwZXRUZXh0ID0gYFxuXHRcdFx0JENVUlJFTlRfWUVBUlxuXHRcdFx0JENVUlJFTlRfWUVBUl9TSE9SVFxuXHRcdFx0JENVUlJFTlRfTU9OVEhcblx0XHRcdCRDVVJSRU5UX0RBVEVcblx0XHRcdCRDVVJSRU5UX0hPVVJcblx0XHRcdCRDVVJSRU5UX01JTlVURVxuXHRcdFx0JENVUlJFTlRfU0VDT05EXG5cdFx0XHQkQ1VSUkVOVF9NSUxMSVNFQ09ORFxuXHRcdFx0JENVUlJFTlRfREFZX05BTUVcblx0XHRcdCRDVVJSRU5UX0RBWV9OQU1FX1NIT1JUXG5cdFx0XHQkQ1VSUkVOVF9NT05USF9OQU1FXG5cdFx0XHQkQ1VSUkVOVF9NT05USF9OQU1FX1NIT1JUXG5cdFx0XHQkQ1VSUkVOVF9TRUNPTkRTX1VOSVhcblx0XHRcdCRDVVJSRU5UX01JTExJU0VDT05EU19VTklYXG5cdFx0XHQkQ1VSUkVOVF9USU1FWk9ORV9PRkZTRVRcblx0XHRcdCRDVVJSRU5UX1RJTUVaT05FX05BTUVcblx0XHRgO1xuXG5cdFx0Y29uc3QgY2xvY2sgPSBzaW5vbi51c2VGYWtlVGltZXJzKCk7XG5cdFx0dHJ5IHtcblx0XHRcdGNvbnN0IHJlc29sdmVyID0gbmV3IFRpbWVCYXNlZFZhcmlhYmxlUmVzb2x2ZXI7XG5cblx0XHRcdGNvbnN0IGZpcnN0UmVzb2x2ZSA9IG5ldyBTbmlwcGV0UGFyc2VyKCkucGFyc2Uoc25pcHBldFRleHQpLnJlc29sdmVWYXJpYWJsZXMocmVzb2x2ZXIpO1xuXHRcdFx0Y2xvY2sudGljaygoMzY1ICogMjQgKiAzNjAwICogMTAwMCkgKyAoMjQgKiAzNjAwICogMTAwMCkgKyAoMzY2MSAqIDEwMDApKTsgIC8vIDEgeWVhciArIDEgZGF5ICsgMSBob3VyICsgMSBtaW51dGUgKyAxIHNlY29uZFxuXHRcdFx0Y29uc3Qgc2Vjb25kUmVzb2x2ZSA9IG5ldyBTbmlwcGV0UGFyc2VyKCkucGFyc2Uoc25pcHBldFRleHQpLnJlc29sdmVWYXJpYWJsZXMocmVzb2x2ZXIpO1xuXG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZmlyc3RSZXNvbHZlLnRvU3RyaW5nKCksIHNlY29uZFJlc29sdmUudG9TdHJpbmcoKSwgYFRpbWUtYmFzZWQgc25pcHBldCB2YXJpYWJsZXMgcmVzb2x2ZWQgZGlmZmVyZW50bHlgKTtcblx0XHR9IGZpbmFsbHkge1xuXHRcdFx0Y2xvY2sucmVzdG9yZSgpO1xuXHRcdH1cblx0fSk7XG5cblx0dGVzdCgnY3JlYXRpbmcgc25pcHBldCAtIGZvcm1hdC1jb25kaXRpb24gZG9lc25cXCd0IHdvcmsgIzUzNjE3JywgZnVuY3Rpb24gKCkge1xuXG5cdFx0Y29uc3Qgc25pcHBldCA9IG5ldyBTbmlwcGV0UGFyc2VyKCkucGFyc2UoJyR7VE1fTElORV9OVU1CRVIvKDEwKS8kezE6P0l0IGlzOkl0IGlzIG5vdH0vfSBsaW5lIDEwJywgdHJ1ZSk7XG5cdFx0c25pcHBldC5yZXNvbHZlVmFyaWFibGVzKHsgcmVzb2x2ZSgpIHsgcmV0dXJuICcxMCc7IH0gfSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNuaXBwZXQudG9TdHJpbmcoKSwgJ0l0IGlzIGxpbmUgMTAnKTtcblxuXHRcdHNuaXBwZXQucmVzb2x2ZVZhcmlhYmxlcyh7IHJlc29sdmUoKSB7IHJldHVybiAnMTEnOyB9IH0pO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzbmlwcGV0LnRvU3RyaW5nKCksICdJdCBpcyBub3QgbGluZSAxMCcpO1xuXHR9KTtcblxuXHR0ZXN0KCdBZGQgd29ya3NwYWNlIG5hbWUgYW5kIGZvbGRlciB2YXJpYWJsZXMgZm9yIHNuaXBwZXRzICM2ODI2MScsIGZ1bmN0aW9uICgpIHtcblxuXHRcdGxldCB3b3Jrc3BhY2U6IElXb3Jrc3BhY2U7XG5cdFx0Y29uc3Qgd29ya3NwYWNlU2VydmljZSA9IG5ldyBjbGFzcyBpbXBsZW1lbnRzIElXb3Jrc3BhY2VDb250ZXh0U2VydmljZSB7XG5cdFx0XHRkZWNsYXJlIHJlYWRvbmx5IF9zZXJ2aWNlQnJhbmQ6IHVuZGVmaW5lZDtcblx0XHRcdF90aHJvdyA9ICgpID0+IHsgdGhyb3cgbmV3IEVycm9yKCk7IH07XG5cdFx0XHRvbkRpZENoYW5nZVdvcmtiZW5jaFN0YXRlID0gdGhpcy5fdGhyb3c7XG5cdFx0XHRvbkRpZENoYW5nZVdvcmtzcGFjZU5hbWUgPSB0aGlzLl90aHJvdztcblx0XHRcdG9uV2lsbENoYW5nZVdvcmtzcGFjZUZvbGRlcnMgPSB0aGlzLl90aHJvdztcblx0XHRcdG9uRGlkQ2hhbmdlV29ya3NwYWNlRm9sZGVycyA9IHRoaXMuX3Rocm93O1xuXHRcdFx0Z2V0Q29tcGxldGVXb3Jrc3BhY2UgPSB0aGlzLl90aHJvdztcblx0XHRcdGdldFdvcmtzcGFjZSgpOiBJV29ya3NwYWNlIHsgcmV0dXJuIHdvcmtzcGFjZTsgfVxuXHRcdFx0Z2V0V29ya2JlbmNoU3RhdGUgPSB0aGlzLl90aHJvdztcblx0XHRcdGhhc1dvcmtzcGFjZURhdGEgPSB0aGlzLl90aHJvdztcblx0XHRcdGdldFdvcmtzcGFjZUZvbGRlciA9IHRoaXMuX3Rocm93O1xuXHRcdFx0aXNDdXJyZW50V29ya3NwYWNlID0gdGhpcy5fdGhyb3c7XG5cdFx0XHRpc0luc2lkZVdvcmtzcGFjZSA9IHRoaXMuX3Rocm93O1xuXHRcdH07XG5cblx0XHRjb25zdCByZXNvbHZlciA9IG5ldyBXb3Jrc3BhY2VCYXNlZFZhcmlhYmxlUmVzb2x2ZXIod29ya3NwYWNlU2VydmljZSk7XG5cblx0XHQvLyBlbXB0eSB3b3Jrc3BhY2Vcblx0XHR3b3Jrc3BhY2UgPSBuZXcgV29ya3NwYWNlKCcnKTtcblx0XHRhc3NlcnRWYXJpYWJsZVJlc29sdmUocmVzb2x2ZXIsICdXT1JLU1BBQ0VfTkFNRScsIHVuZGVmaW5lZCk7XG5cdFx0YXNzZXJ0VmFyaWFibGVSZXNvbHZlKHJlc29sdmVyLCAnV09SS1NQQUNFX0ZPTERFUicsIHVuZGVmaW5lZCk7XG5cblx0XHQvLyBzaW5nbGUgZm9sZGVyIHdvcmtzcGFjZSB3aXRob3V0IGNvbmZpZ1xuXHRcdHdvcmtzcGFjZSA9IG5ldyBXb3Jrc3BhY2UoJycsIFt0b1dvcmtzcGFjZUZvbGRlcihVUkkuZmlsZSgnL2ZvbGRlck5hbWUnKSldKTtcblx0XHRhc3NlcnRWYXJpYWJsZVJlc29sdmUocmVzb2x2ZXIsICdXT1JLU1BBQ0VfTkFNRScsICdmb2xkZXJOYW1lJyk7XG5cdFx0aWYgKCFpc1dpbmRvd3MpIHtcblx0XHRcdGFzc2VydFZhcmlhYmxlUmVzb2x2ZShyZXNvbHZlciwgJ1dPUktTUEFDRV9GT0xERVInLCAnL2ZvbGRlck5hbWUnKTtcblx0XHR9XG5cblx0XHQvLyB3b3Jrc3BhY2Ugd2l0aCBjb25maWdcblx0XHRjb25zdCB3b3Jrc3BhY2VDb25maWdQYXRoID0gVVJJLmZpbGUoJ3Rlc3RXb3Jrc3BhY2UuY29kZS13b3Jrc3BhY2UnKTtcblx0XHR3b3Jrc3BhY2UgPSBuZXcgV29ya3NwYWNlKCcnLCB0b1dvcmtzcGFjZUZvbGRlcnMoW3sgcGF0aDogJ2ZvbGRlck5hbWUnIH1dLCB3b3Jrc3BhY2VDb25maWdQYXRoLCBleHRVcmlCaWFzZWRJZ25vcmVQYXRoQ2FzZSksIHdvcmtzcGFjZUNvbmZpZ1BhdGgpO1xuXHRcdGFzc2VydFZhcmlhYmxlUmVzb2x2ZShyZXNvbHZlciwgJ1dPUktTUEFDRV9OQU1FJywgJ3Rlc3RXb3Jrc3BhY2UnKTtcblx0XHRpZiAoIWlzV2luZG93cykge1xuXHRcdFx0YXNzZXJ0VmFyaWFibGVSZXNvbHZlKHJlc29sdmVyLCAnV09SS1NQQUNFX0ZPTERFUicsICcvJyk7XG5cdFx0fVxuXHR9KTtcblxuXHR0ZXN0KCdBZGQgUkVMQVRJVkVfRklMRVBBVEggc25pcHBldCB2YXJpYWJsZSAjMTE0MjA4JywgZnVuY3Rpb24gKCkge1xuXG5cdFx0bGV0IHJlc29sdmVyOiBWYXJpYWJsZVJlc29sdmVyO1xuXG5cdFx0Ly8gTW9jayBhIGxhYmVsIHNlcnZpY2UgKG9ubHkgY29kZWQgZm9yIGZpbGUgdXJpcylcblx0XHRjb25zdCB3b3Jrc3BhY2VMYWJlbFNlcnZpY2UgPSAoKHJvb3RQYXRoOiBzdHJpbmcpOiBJTGFiZWxTZXJ2aWNlID0+IHtcblx0XHRcdGNvbnN0IGxhYmVsU2VydmljZSA9IG5ldyBjbGFzcyBleHRlbmRzIG1vY2s8SUxhYmVsU2VydmljZT4oKSB7XG5cdFx0XHRcdG92ZXJyaWRlIGdldFVyaUxhYmVsKHVyaTogVVJJLCBvcHRpb25zOiB7IHJlbGF0aXZlPzogYm9vbGVhbiB9ID0ge30pIHtcblx0XHRcdFx0XHRjb25zdCByb290RnNQYXRoID0gVVJJLmZpbGUocm9vdFBhdGgpLmZzUGF0aCArIHNlcDtcblx0XHRcdFx0XHRjb25zdCBmc1BhdGggPSB1cmkuZnNQYXRoO1xuXHRcdFx0XHRcdGlmIChvcHRpb25zLnJlbGF0aXZlICYmIHJvb3RQYXRoICYmIGZzUGF0aC5zdGFydHNXaXRoKHJvb3RGc1BhdGgpKSB7XG5cdFx0XHRcdFx0XHRyZXR1cm4gZnNQYXRoLnN1YnN0cmluZyhyb290RnNQYXRoLmxlbmd0aCk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdHJldHVybiBmc1BhdGg7XG5cdFx0XHRcdH1cblx0XHRcdH07XG5cdFx0XHRyZXR1cm4gbGFiZWxTZXJ2aWNlO1xuXHRcdH0pO1xuXG5cdFx0Y29uc3QgbW9kZWwgPSBjcmVhdGVUZXh0TW9kZWwoJycsIHVuZGVmaW5lZCwgdW5kZWZpbmVkLCBVUkkucGFyc2UoJ2ZpbGU6Ly8vZm9vL2ZpbGVzL3RleHQudHh0JykpO1xuXG5cdFx0Ly8gZW1wdHkgd29ya3NwYWNlXG5cdFx0cmVzb2x2ZXIgPSBuZXcgTW9kZWxCYXNlZFZhcmlhYmxlUmVzb2x2ZXIoXG5cdFx0XHR3b3Jrc3BhY2VMYWJlbFNlcnZpY2UoJycpLFxuXHRcdFx0bW9kZWxcblx0XHQpO1xuXG5cdFx0aWYgKCFpc1dpbmRvd3MpIHtcblx0XHRcdGFzc2VydFZhcmlhYmxlUmVzb2x2ZShyZXNvbHZlciwgJ1JFTEFUSVZFX0ZJTEVQQVRIJywgJy9mb28vZmlsZXMvdGV4dC50eHQnKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0YXNzZXJ0VmFyaWFibGVSZXNvbHZlKHJlc29sdmVyLCAnUkVMQVRJVkVfRklMRVBBVEgnLCAnXFxcXGZvb1xcXFxmaWxlc1xcXFx0ZXh0LnR4dCcpO1xuXHRcdH1cblxuXHRcdC8vIHNpbmdsZSBmb2xkZXIgd29ya3NwYWNlXG5cdFx0cmVzb2x2ZXIgPSBuZXcgTW9kZWxCYXNlZFZhcmlhYmxlUmVzb2x2ZXIoXG5cdFx0XHR3b3Jrc3BhY2VMYWJlbFNlcnZpY2UoJy9mb28nKSxcblx0XHRcdG1vZGVsXG5cdFx0KTtcblx0XHRpZiAoIWlzV2luZG93cykge1xuXHRcdFx0YXNzZXJ0VmFyaWFibGVSZXNvbHZlKHJlc29sdmVyLCAnUkVMQVRJVkVfRklMRVBBVEgnLCAnZmlsZXMvdGV4dC50eHQnKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0YXNzZXJ0VmFyaWFibGVSZXNvbHZlKHJlc29sdmVyLCAnUkVMQVRJVkVfRklMRVBBVEgnLCAnZmlsZXNcXFxcdGV4dC50eHQnKTtcblx0XHR9XG5cblx0XHRtb2RlbC5kaXNwb3NlKCk7XG5cdH0pO1xufSk7XG4iXSwKICAibWFwcGluZ3MiOiAiQUFJQSxPQUFPLFlBQVk7QUFDbkIsWUFBWSxXQUFXO0FBQ3ZCLFNBQVMsdUJBQXVCO0FBQ2hDLFNBQVMsV0FBVztBQUNwQixTQUFTLGlCQUFpQjtBQUMxQixTQUFTLGtDQUFrQztBQUMzQyxTQUFTLFdBQVc7QUFDcEIsU0FBUyxZQUFZO0FBQ3JCLFNBQVMsK0NBQStDO0FBQ3hELFNBQVMsaUJBQWlCO0FBRTFCLFNBQVMscUJBQWlEO0FBQzFELFNBQVMsZ0NBQWdDLGtDQUFrQyw0QkFBNEIsZ0NBQWdDLDJCQUEyQixzQ0FBc0M7QUFDeE0sU0FBUyx1QkFBdUI7QUFFaEMsU0FBK0MseUJBQXlCO0FBQ3hFLFNBQVMsaUJBQWlCO0FBQzFCLFNBQVMsMEJBQTBCO0FBRW5DLE1BQU0sOEJBQThCLFdBQVk7QUFHL0MsUUFBTSxlQUFlLElBQUksY0FBYyxLQUFvQixFQUFFO0FBQUEsSUFDbkQsWUFBWSxLQUFVO0FBQzlCLGFBQU8sSUFBSTtBQUFBLElBQ1o7QUFBQSxFQUNEO0FBRUEsTUFBSTtBQUNKLE1BQUk7QUFFSixRQUFNLFdBQVk7QUFDakIsWUFBUSxnQkFBZ0I7QUFBQSxNQUN2QjtBQUFBLE1BQ0E7QUFBQSxNQUNBO0FBQUEsSUFDRCxFQUFFLEtBQUssSUFBSSxHQUFHLFFBQVcsUUFBVyxJQUFJLE1BQU0sNEJBQTRCLENBQUM7QUFFM0UsZUFBVyxJQUFJLGlDQUFpQztBQUFBLE1BQy9DLElBQUksMkJBQTJCLGNBQWMsS0FBSztBQUFBLE1BQ2xELElBQUksK0JBQStCLE9BQU8sSUFBSSxVQUFVLEdBQUcsR0FBRyxHQUFHLENBQUMsR0FBRyxHQUFHLE1BQVM7QUFBQSxJQUNsRixDQUFDO0FBQUEsRUFDRixDQUFDO0FBRUQsV0FBUyxXQUFZO0FBQ3BCLFVBQU0sUUFBUTtBQUFBLEVBQ2YsQ0FBQztBQUVELDBDQUF3QztBQUd4QyxXQUFTLHNCQUFzQkEsV0FBNEIsU0FBaUIsVUFBbUI7QUFDOUYsVUFBTSxVQUFVLElBQUksY0FBYyxFQUFFLE1BQU0sSUFBSSxPQUFPLEVBQUU7QUFDdkQsVUFBTSxXQUFxQixRQUFRLFNBQVMsQ0FBQztBQUM3QyxhQUFTLFFBQVFBLFNBQVE7QUFDekIsUUFBSSxTQUFTLFNBQVMsV0FBVyxHQUFHO0FBQ25DLGFBQU8sWUFBWSxRQUFXLFFBQVE7QUFBQSxJQUN2QyxPQUFPO0FBQ04sYUFBTyxZQUFZLFNBQVMsU0FBUyxHQUFHLFFBQVE7QUFBQSxJQUNqRDtBQUFBLEVBQ0Q7QUFFQSxPQUFLLDRCQUE0QixXQUFZO0FBQzVDLDBCQUFzQixVQUFVLGVBQWUsVUFBVTtBQUN6RCwwQkFBc0IsVUFBVSxhQUFhLE1BQVM7QUFBQSxFQUN2RCxDQUFDO0FBRUQsT0FBSyw4QkFBOEIsV0FBWTtBQUU5QyxVQUFNLGNBQWMsSUFBSSxnQkFBZ0I7QUFFeEMsMEJBQXNCLFVBQVUsZUFBZSxVQUFVO0FBQ3pELFFBQUksQ0FBQyxXQUFXO0FBQ2YsNEJBQXNCLFVBQVUsZ0JBQWdCLFlBQVk7QUFDNUQsNEJBQXNCLFVBQVUscUJBQXFCLE9BQU87QUFDNUQsNEJBQXNCLFVBQVUsZUFBZSxxQkFBcUI7QUFBQSxJQUNyRTtBQUVBLGVBQVcsSUFBSTtBQUFBLE1BQ2Q7QUFBQSxNQUNBLFlBQVksSUFBSSxnQkFBZ0IsSUFBSSxRQUFXLFFBQVcsSUFBSSxNQUFNLDZCQUE2QixDQUFDLENBQUM7QUFBQSxJQUNwRztBQUNBLDBCQUFzQixVQUFVLGVBQWUsS0FBSztBQUNwRCxRQUFJLENBQUMsV0FBVztBQUNmLDRCQUFzQixVQUFVLGdCQUFnQixVQUFVO0FBQzFELDRCQUFzQixVQUFVLHFCQUFxQixLQUFLO0FBQzFELDRCQUFzQixVQUFVLGVBQWUsY0FBYztBQUFBLElBQzlEO0FBRUEsZUFBVyxJQUFJO0FBQUEsTUFDZDtBQUFBLE1BQ0EsWUFBWSxJQUFJLGdCQUFnQixJQUFJLFFBQVcsUUFBVyxJQUFJLE1BQU0sWUFBWSxDQUFDLENBQUM7QUFBQSxJQUNuRjtBQUNBLDBCQUFzQixVQUFVLGdCQUFnQixFQUFFO0FBQ2xELDBCQUFzQixVQUFVLHFCQUFxQixFQUFFO0FBQ3ZELDBCQUFzQixVQUFVLGVBQWUsUUFBUTtBQUV2RCxnQkFBWSxRQUFRO0FBQUEsRUFDckIsQ0FBQztBQUVELE9BQUssaUZBQWtGLFdBQVk7QUFFbEcsVUFBTUMsZ0JBQWUsSUFBSSxjQUFjLEtBQW9CLEVBQUU7QUFBQSxNQUNuRCxZQUFZLEtBQVU7QUFDOUIsZUFBTyxJQUFJLE9BQU8sUUFBUSxVQUFVLEdBQUc7QUFBQSxNQUN4QztBQUFBLElBQ0Q7QUFFQSxVQUFNQyxTQUFRLGdCQUFnQixDQUFDLEVBQUUsS0FBSyxJQUFJLEdBQUcsUUFBVyxRQUFXLElBQUksTUFBTSwyQkFBMkIsQ0FBQztBQUV6RyxVQUFNRixZQUFXLElBQUksaUNBQWlDLENBQUMsSUFBSSwyQkFBMkJDLGVBQWNDLE1BQUssQ0FBQyxDQUFDO0FBRTNHLDBCQUFzQkYsV0FBVSxlQUFlLHFCQUFxQjtBQUVwRSxJQUFBRSxPQUFNLFFBQVE7QUFBQSxFQUNmLENBQUM7QUFFRCxPQUFLLCtCQUErQixXQUFZO0FBRS9DLGVBQVcsSUFBSSwrQkFBK0IsT0FBTyxJQUFJLFVBQVUsR0FBRyxHQUFHLEdBQUcsQ0FBQyxHQUFHLEdBQUcsTUFBUztBQUM1RiwwQkFBc0IsVUFBVSxvQkFBb0IscUJBQXFCO0FBQ3pFLDBCQUFzQixVQUFVLG1CQUFtQixrQkFBa0I7QUFDckUsMEJBQXNCLFVBQVUsaUJBQWlCLEdBQUc7QUFDcEQsMEJBQXNCLFVBQVUsa0JBQWtCLEdBQUc7QUFDckQsMEJBQXNCLFVBQVUsZ0JBQWdCLEdBQUc7QUFDbkQsMEJBQXNCLFVBQVUsaUJBQWlCLEdBQUc7QUFFcEQsZUFBVyxJQUFJLCtCQUErQixPQUFPLElBQUksVUFBVSxHQUFHLEdBQUcsR0FBRyxDQUFDLEdBQUcsR0FBRyxNQUFTO0FBQzVGLDBCQUFzQixVQUFVLGdCQUFnQixHQUFHO0FBQ25ELDBCQUFzQixVQUFVLGlCQUFpQixHQUFHO0FBRXBELGVBQVcsSUFBSSwrQkFBK0IsT0FBTyxJQUFJLFVBQVUsR0FBRyxHQUFHLEdBQUcsQ0FBQyxHQUFHLEdBQUcsTUFBUztBQUM1RiwwQkFBc0IsVUFBVSxvQkFBb0IscUJBQXFCO0FBQ3pFLDBCQUFzQixVQUFVLG1CQUFtQixrQkFBa0I7QUFDckUsMEJBQXNCLFVBQVUsaUJBQWlCLEdBQUc7QUFDcEQsMEJBQXNCLFVBQVUsa0JBQWtCLEdBQUc7QUFFckQsZUFBVyxJQUFJLCtCQUErQixPQUFPLElBQUksVUFBVSxHQUFHLEdBQUcsR0FBRyxDQUFDLEdBQUcsR0FBRyxNQUFTO0FBQzVGLDBCQUFzQixVQUFVLG9CQUFvQixNQUFTO0FBRTdELDBCQUFzQixVQUFVLG1CQUFtQixNQUFNO0FBRXpELGVBQVcsSUFBSSwrQkFBK0IsT0FBTyxJQUFJLFVBQVUsR0FBRyxHQUFHLEdBQUcsQ0FBQyxHQUFHLEdBQUcsTUFBUztBQUM1RiwwQkFBc0IsVUFBVSxtQkFBbUIsTUFBUztBQUFBLEVBRTdELENBQUM7QUFFRCxPQUFLLHFDQUFxQyxXQUFZO0FBQ3JELFVBQU0sVUFBVSxJQUFJLGNBQWMsRUFBRSxNQUFNLHNCQUFzQixJQUFJO0FBQ3BFLFdBQU8sWUFBWSxRQUFRLFNBQVMsR0FBRyxJQUFJO0FBQzNDLFlBQVEsaUJBQWlCLFFBQVE7QUFDakMsV0FBTyxZQUFZLFFBQVEsU0FBUyxHQUFHLFFBQVE7QUFBQSxFQUVoRCxDQUFDO0FBRUQsT0FBSyxrREFBa0QsV0FBWTtBQUNsRSxVQUFNLFVBQVUsSUFBSSxjQUFjLEVBQUUsTUFBTSw0QkFBNEIsSUFBSTtBQUMxRSxXQUFPLFlBQVksUUFBUSxTQUFTLEdBQUcsT0FBTztBQUM5QyxZQUFRLGlCQUFpQixRQUFRO0FBQ2pDLFdBQU8sWUFBWSxRQUFRLFNBQVMsR0FBRyxRQUFRO0FBQUEsRUFDaEQsQ0FBQztBQUVELE9BQUssMERBQTBELFdBQVk7QUFFMUUsVUFBTSxjQUFjLElBQUksZ0JBQWdCO0FBRXhDLDBCQUFzQixVQUFVLG9CQUFvQixNQUFNO0FBRTFELGVBQVcsSUFBSTtBQUFBLE1BQ2Q7QUFBQSxNQUNBLFlBQVksSUFBSSxnQkFBZ0IsSUFBSSxRQUFXLFFBQVcsSUFBSSxNQUFNLDZCQUE2QixDQUFDLENBQUM7QUFBQSxJQUNwRztBQUNBLDBCQUFzQixVQUFVLG9CQUFvQixLQUFLO0FBRXpELGVBQVcsSUFBSTtBQUFBLE1BQ2Q7QUFBQSxNQUNBLFlBQVksSUFBSSxnQkFBZ0IsSUFBSSxRQUFXLFFBQVcsSUFBSSxNQUFNLFVBQVUsQ0FBQyxDQUFDO0FBQUEsSUFDakY7QUFDQSwwQkFBc0IsVUFBVSxvQkFBb0IsTUFBTTtBQUUxRCxlQUFXLElBQUk7QUFBQSxNQUNkO0FBQUEsTUFDQSxZQUFZLElBQUksZ0JBQWdCLElBQUksUUFBVyxRQUFXLElBQUksTUFBTSxVQUFVLENBQUMsQ0FBQztBQUFBLElBQ2pGO0FBQ0EsMEJBQXNCLFVBQVUsb0JBQW9CLEtBQUs7QUFFekQsZ0JBQVksUUFBUTtBQUFBLEVBQ3JCLENBQUM7QUFHRCxXQUFTLHVCQUF1QixPQUFlLFVBQWtCLFVBQW1CO0FBQ25GLFVBQU0sVUFBVSxJQUFJLGNBQWMsRUFBRSxNQUFNLEtBQUssRUFDN0MsaUJBQWlCLEVBQUUsUUFBUSxVQUFVO0FBQUUsYUFBTyxZQUFZLFNBQVM7QUFBQSxJQUFNLEVBQUUsQ0FBQztBQUU5RSxVQUFNLFNBQVMsUUFBUSxTQUFTO0FBQ2hDLFdBQU8sWUFBWSxRQUFRLFFBQVE7QUFBQSxFQUNwQztBQUVBLE9BQUssOEJBQThCLFdBQVk7QUFFOUMsVUFBTSxVQUFVLElBQUksY0FBYyxFQUFFLE1BQU0sc0NBQXNDLElBQUk7QUFDcEYsWUFBUSxpQkFBaUIsUUFBUTtBQUNqQyxXQUFPLFlBQVksUUFBUSxTQUFTLEdBQUcsV0FBVztBQUVsRCwyQkFBdUIsb0NBQW9DLEtBQUs7QUFDaEUsMkJBQXVCLG1EQUFtRCxPQUFPO0FBQ2pGLDJCQUF1Qiw2QkFBNkIsS0FBSztBQUd6RCwyQkFBdUIsd0RBQXdELGdDQUFnQyxZQUFZO0FBRTNILDJCQUF1QixxQ0FBcUMsY0FBYztBQUMxRSwyQkFBdUIsb0NBQW9DLGNBQWM7QUFDekUsMkJBQXVCLHNDQUFzQyxjQUFjO0FBRzNFLDJCQUF1QixxQ0FBcUMsUUFBUTtBQUFBLEVBQ3JFLENBQUM7QUFFRCxPQUFLLHdGQUF3RixXQUFZO0FBRXhHO0FBQUEsTUFDQztBQUFBLE1BQ0E7QUFBQSxNQUNBO0FBQUEsSUFDRDtBQUdBO0FBQUEsTUFDQztBQUFBLE1BQ0E7QUFBQSxNQUNBO0FBQUEsSUFDRDtBQUdBO0FBQUEsTUFDQztBQUFBLE1BQ0E7QUFBQSxNQUNBO0FBQUEsSUFDRDtBQUdBO0FBQUEsTUFDQztBQUFBLE1BQ0E7QUFBQSxNQUNBO0FBQUEsSUFDRDtBQUdBO0FBQUEsTUFDQztBQUFBLE1BQ0E7QUFBQSxNQUNBO0FBQUEsSUFDRDtBQUVBO0FBQUEsTUFDQztBQUFBLE1BQ0E7QUFBQSxNQUNBO0FBQUEsSUFDRDtBQUFBLEVBQ0QsQ0FBQztBQUVELE9BQUssbUVBQW1FLFdBQVk7QUFFbkYsMEJBQXNCLElBQUksK0JBQStCLE1BQU0sUUFBVyxHQUFHLEdBQUcsSUFBSSxHQUFHLGFBQWEsTUFBUztBQUU3RywwQkFBc0IsSUFBSSwrQkFBK0IsTUFBTSxNQUFPLEdBQUcsR0FBRyxJQUFJLEdBQUcsYUFBYSxNQUFTO0FBRXpHLDBCQUFzQixJQUFJLCtCQUErQixNQUFNLElBQUksR0FBRyxHQUFHLElBQUksR0FBRyxhQUFhLE1BQVM7QUFFdEcsMEJBQXNCLElBQUksK0JBQStCLE1BQU0sT0FBTyxHQUFHLEdBQUcsSUFBSSxHQUFHLGFBQWEsS0FBSztBQUVyRywwQkFBc0IsSUFBSSwrQkFBK0IsTUFBTSxPQUFPLEdBQUcsR0FBRyxJQUFJLEdBQUcsT0FBTyxNQUFTO0FBQ25HLDBCQUFzQixJQUFJLCtCQUErQixNQUFNLE9BQU8sR0FBRyxHQUFHLElBQUksR0FBRyxhQUFhLE1BQVM7QUFBQSxFQUMxRyxDQUFDO0FBRUQsT0FBSyxzRUFBc0UsV0FBWTtBQUV0RiwwQkFBc0IsSUFBSSwrQkFBK0IsTUFBTSxTQUFTLEdBQUcsR0FBRyxJQUFJLEdBQUcsYUFBYSxPQUFPO0FBQ3pHLDBCQUFzQixJQUFJLCtCQUErQixNQUFNLHVCQUF1QixHQUFHLEdBQUcsSUFBSSxHQUFHLGFBQWEscUJBQXFCO0FBRXJJLDBCQUFzQixJQUFJLCtCQUErQixNQUFNLGdCQUFnQixHQUFHLEdBQUcsSUFBSSxHQUFHLGFBQWEsT0FBTztBQUNoSCxlQUFXLElBQUksK0JBQStCLE1BQU0sZ0JBQWdCLEdBQUcsR0FBRyxJQUFJO0FBQzlFLDBCQUFzQixJQUFJLCtCQUErQixNQUFNLGdCQUFnQixHQUFHLEdBQUcsSUFBSSxHQUFHLGFBQWEsT0FBTztBQUVoSCwwQkFBc0IsSUFBSSwrQkFBK0IsTUFBTSxnQkFBZ0IsR0FBRyxHQUFHLEtBQUssR0FBRyxhQUFhLGNBQWM7QUFBQSxFQUN6SCxDQUFDO0FBR0QsV0FBUyx1QkFBdUJGLFdBQTRCLFNBQWlCO0FBQzVFLFVBQU0sVUFBVSxJQUFJLGNBQWMsRUFBRSxNQUFNLElBQUksT0FBTyxFQUFFO0FBQ3ZELFVBQU0sV0FBcUIsUUFBUSxTQUFTLENBQUM7QUFFN0MsV0FBTyxZQUFZLFNBQVMsUUFBUUEsU0FBUSxHQUFHLE1BQU0sR0FBRyxPQUFPLG9CQUFvQjtBQUFBLEVBQ3BGO0FBRUEsT0FBSyxrREFBa0QsV0FBWTtBQUVsRSxVQUFNQSxZQUFXLElBQUk7QUFFckIsMkJBQXVCQSxXQUFVLGNBQWM7QUFDL0MsMkJBQXVCQSxXQUFVLG9CQUFvQjtBQUNyRCwyQkFBdUJBLFdBQVUsZUFBZTtBQUNoRCwyQkFBdUJBLFdBQVUsY0FBYztBQUMvQywyQkFBdUJBLFdBQVUsY0FBYztBQUMvQywyQkFBdUJBLFdBQVUsZ0JBQWdCO0FBQ2pELDJCQUF1QkEsV0FBVSxnQkFBZ0I7QUFDakQsMkJBQXVCQSxXQUFVLHFCQUFxQjtBQUN0RCwyQkFBdUJBLFdBQVUsa0JBQWtCO0FBQ25ELDJCQUF1QkEsV0FBVSx3QkFBd0I7QUFDekQsMkJBQXVCQSxXQUFVLG9CQUFvQjtBQUNyRCwyQkFBdUJBLFdBQVUsMEJBQTBCO0FBQzNELDJCQUF1QkEsV0FBVSxzQkFBc0I7QUFDdkQsMkJBQXVCQSxXQUFVLDJCQUEyQjtBQUM1RCwyQkFBdUJBLFdBQVUseUJBQXlCO0FBQzFELDJCQUF1QkEsV0FBVSx1QkFBdUI7QUFBQSxFQUN6RCxDQUFDO0FBRUQsT0FBSywrRUFBK0UsV0FBWTtBQUMvRixVQUFNLE1BQU0sS0FBSyxJQUFJLE1BQU0sR0FBRyxJQUFJLElBQUksSUFBSSxJQUFJLENBQUM7QUFDL0MsVUFBTSxRQUFRLE1BQU0sY0FBYyxFQUFFLElBQUksQ0FBQztBQUN6QyxRQUFJO0FBQ0gsWUFBTUEsWUFBVyxJQUFJO0FBQ3JCLFlBQU0sZUFBZSxJQUFJLEtBQUssR0FBRztBQUNqQyxZQUFNLE1BQU0sQ0FBQyxPQUFlLFdBQW1CLE9BQU8sS0FBSyxFQUFFLFNBQVMsUUFBUSxHQUFHO0FBRWpGLDRCQUFzQkEsV0FBVSxnQkFBZ0IsT0FBTyxhQUFhLFlBQVksQ0FBQyxDQUFDO0FBQ2xGLDRCQUFzQkEsV0FBVSxzQkFBc0IsT0FBTyxhQUFhLFlBQVksQ0FBQyxFQUFFLE1BQU0sRUFBRSxDQUFDO0FBQ2xHLDRCQUFzQkEsV0FBVSxpQkFBaUIsSUFBSSxhQUFhLFNBQVMsSUFBSSxHQUFHLENBQUMsQ0FBQztBQUNwRiw0QkFBc0JBLFdBQVUsZ0JBQWdCLElBQUksYUFBYSxRQUFRLEdBQUcsQ0FBQyxDQUFDO0FBQzlFLDRCQUFzQkEsV0FBVSxnQkFBZ0IsSUFBSSxhQUFhLFNBQVMsR0FBRyxDQUFDLENBQUM7QUFDL0UsNEJBQXNCQSxXQUFVLGtCQUFrQixJQUFJLGFBQWEsV0FBVyxHQUFHLENBQUMsQ0FBQztBQUNuRiw0QkFBc0JBLFdBQVUsa0JBQWtCLElBQUksYUFBYSxXQUFXLEdBQUcsQ0FBQyxDQUFDO0FBQ25GLDRCQUFzQkEsV0FBVSx1QkFBdUIsSUFBSSxhQUFhLGdCQUFnQixHQUFHLENBQUMsQ0FBQztBQUM3Riw0QkFBc0JBLFdBQVUsd0JBQXdCLE9BQU8sS0FBSyxNQUFNLE1BQU0sR0FBSSxDQUFDLENBQUM7QUFDdEYsNEJBQXNCQSxXQUFVLDZCQUE2QixPQUFPLEdBQUcsQ0FBQztBQUFBLElBQ3pFLFVBQUU7QUFDRCxZQUFNLFFBQVE7QUFBQSxJQUNmO0FBQUEsRUFDRCxDQUFDO0FBRUQsT0FBSyxtRkFBbUYsaUJBQWtCO0FBQ3pHLFVBQU0sY0FBYztBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFtQnBCLFVBQU0sUUFBUSxNQUFNLGNBQWM7QUFDbEMsUUFBSTtBQUNILFlBQU1BLFlBQVcsSUFBSTtBQUVyQixZQUFNLGVBQWUsSUFBSSxjQUFjLEVBQUUsTUFBTSxXQUFXLEVBQUUsaUJBQWlCQSxTQUFRO0FBQ3JGLFlBQU0sS0FBTSxNQUFNLEtBQUssT0FBTyxNQUFTLEtBQUssT0FBTyxNQUFTLE9BQU8sR0FBSztBQUN4RSxZQUFNLGdCQUFnQixJQUFJLGNBQWMsRUFBRSxNQUFNLFdBQVcsRUFBRSxpQkFBaUJBLFNBQVE7QUFFdEYsYUFBTyxZQUFZLGFBQWEsU0FBUyxHQUFHLGNBQWMsU0FBUyxHQUFHLG1EQUFtRDtBQUFBLElBQzFILFVBQUU7QUFDRCxZQUFNLFFBQVE7QUFBQSxJQUNmO0FBQUEsRUFDRCxDQUFDO0FBRUQsT0FBSywyREFBNEQsV0FBWTtBQUU1RSxVQUFNLFVBQVUsSUFBSSxjQUFjLEVBQUUsTUFBTSx5REFBeUQsSUFBSTtBQUN2RyxZQUFRLGlCQUFpQixFQUFFLFVBQVU7QUFBRSxhQUFPO0FBQUEsSUFBTSxFQUFFLENBQUM7QUFDdkQsV0FBTyxZQUFZLFFBQVEsU0FBUyxHQUFHLGVBQWU7QUFFdEQsWUFBUSxpQkFBaUIsRUFBRSxVQUFVO0FBQUUsYUFBTztBQUFBLElBQU0sRUFBRSxDQUFDO0FBQ3ZELFdBQU8sWUFBWSxRQUFRLFNBQVMsR0FBRyxtQkFBbUI7QUFBQSxFQUMzRCxDQUFDO0FBRUQsT0FBSywrREFBK0QsV0FBWTtBQUUvRSxRQUFJO0FBQ0osVUFBTSxtQkFBbUIsSUFBSSxNQUEwQztBQUFBLE1BQTFDO0FBRTVCLHNCQUFTLE1BQU07QUFBRSxnQkFBTSxJQUFJLE1BQU07QUFBQSxRQUFHO0FBQ3BDLHlDQUE0QixLQUFLO0FBQ2pDLHdDQUEyQixLQUFLO0FBQ2hDLDRDQUErQixLQUFLO0FBQ3BDLDJDQUE4QixLQUFLO0FBQ25DLG9DQUF1QixLQUFLO0FBRTVCLGlDQUFvQixLQUFLO0FBQ3pCLGdDQUFtQixLQUFLO0FBQ3hCLGtDQUFxQixLQUFLO0FBQzFCLGtDQUFxQixLQUFLO0FBQzFCLGlDQUFvQixLQUFLO0FBQUE7QUFBQSxNQUx6QixlQUEyQjtBQUFFLGVBQU87QUFBQSxNQUFXO0FBQUEsSUFNaEQ7QUFFQSxVQUFNQSxZQUFXLElBQUksK0JBQStCLGdCQUFnQjtBQUdwRSxnQkFBWSxJQUFJLFVBQVUsRUFBRTtBQUM1QiwwQkFBc0JBLFdBQVUsa0JBQWtCLE1BQVM7QUFDM0QsMEJBQXNCQSxXQUFVLG9CQUFvQixNQUFTO0FBRzdELGdCQUFZLElBQUksVUFBVSxJQUFJLENBQUMsa0JBQWtCLElBQUksS0FBSyxhQUFhLENBQUMsQ0FBQyxDQUFDO0FBQzFFLDBCQUFzQkEsV0FBVSxrQkFBa0IsWUFBWTtBQUM5RCxRQUFJLENBQUMsV0FBVztBQUNmLDRCQUFzQkEsV0FBVSxvQkFBb0IsYUFBYTtBQUFBLElBQ2xFO0FBR0EsVUFBTSxzQkFBc0IsSUFBSSxLQUFLLDhCQUE4QjtBQUNuRSxnQkFBWSxJQUFJLFVBQVUsSUFBSSxtQkFBbUIsQ0FBQyxFQUFFLE1BQU0sYUFBYSxDQUFDLEdBQUcscUJBQXFCLDBCQUEwQixHQUFHLG1CQUFtQjtBQUNoSiwwQkFBc0JBLFdBQVUsa0JBQWtCLGVBQWU7QUFDakUsUUFBSSxDQUFDLFdBQVc7QUFDZiw0QkFBc0JBLFdBQVUsb0JBQW9CLEdBQUc7QUFBQSxJQUN4RDtBQUFBLEVBQ0QsQ0FBQztBQUVELE9BQUssa0RBQWtELFdBQVk7QUFFbEUsUUFBSUE7QUFHSixVQUFNLHlCQUF5QixDQUFDLGFBQW9DO0FBQ25FLFlBQU1DLGdCQUFlLElBQUksY0FBYyxLQUFvQixFQUFFO0FBQUEsUUFDbkQsWUFBWSxLQUFVLFVBQWtDLENBQUMsR0FBRztBQUNwRSxnQkFBTSxhQUFhLElBQUksS0FBSyxRQUFRLEVBQUUsU0FBUztBQUMvQyxnQkFBTSxTQUFTLElBQUk7QUFDbkIsY0FBSSxRQUFRLFlBQVksWUFBWSxPQUFPLFdBQVcsVUFBVSxHQUFHO0FBQ2xFLG1CQUFPLE9BQU8sVUFBVSxXQUFXLE1BQU07QUFBQSxVQUMxQztBQUNBLGlCQUFPO0FBQUEsUUFDUjtBQUFBLE1BQ0Q7QUFDQSxhQUFPQTtBQUFBLElBQ1I7QUFFQSxVQUFNQyxTQUFRLGdCQUFnQixJQUFJLFFBQVcsUUFBVyxJQUFJLE1BQU0sNEJBQTRCLENBQUM7QUFHL0YsSUFBQUYsWUFBVyxJQUFJO0FBQUEsTUFDZCxzQkFBc0IsRUFBRTtBQUFBLE1BQ3hCRTtBQUFBLElBQ0Q7QUFFQSxRQUFJLENBQUMsV0FBVztBQUNmLDRCQUFzQkYsV0FBVSxxQkFBcUIscUJBQXFCO0FBQUEsSUFDM0UsT0FBTztBQUNOLDRCQUFzQkEsV0FBVSxxQkFBcUIsd0JBQXdCO0FBQUEsSUFDOUU7QUFHQSxJQUFBQSxZQUFXLElBQUk7QUFBQSxNQUNkLHNCQUFzQixNQUFNO0FBQUEsTUFDNUJFO0FBQUEsSUFDRDtBQUNBLFFBQUksQ0FBQyxXQUFXO0FBQ2YsNEJBQXNCRixXQUFVLHFCQUFxQixnQkFBZ0I7QUFBQSxJQUN0RSxPQUFPO0FBQ04sNEJBQXNCQSxXQUFVLHFCQUFxQixpQkFBaUI7QUFBQSxJQUN2RTtBQUVBLElBQUFFLE9BQU0sUUFBUTtBQUFBLEVBQ2YsQ0FBQztBQUNGLENBQUM7IiwKICAibmFtZXMiOiBbInJlc29sdmVyIiwgImxhYmVsU2VydmljZSIsICJtb2RlbCJdCn0K
