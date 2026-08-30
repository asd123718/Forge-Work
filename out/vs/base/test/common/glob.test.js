import assert from "assert";
import * as glob from "../../common/glob.js";
import { sep } from "../../common/path.js";
import { isLinux, isMacintosh, isWindows } from "../../common/platform.js";
import { URI } from "../../common/uri.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "./utils.js";
suite("Glob", () => {
  function assertGlobMatch(pattern, input, ignoreCase) {
    assert(glob.match(pattern, input, { ignoreCase }), `${JSON.stringify(pattern)} should match ${input}`);
    assert(glob.match(pattern, nativeSep(input), { ignoreCase }), `${pattern} should match ${nativeSep(input)}`);
  }
  function assertNoGlobMatch(pattern, input, ignoreCase) {
    assert(!glob.match(pattern, input, { ignoreCase }), `${pattern} should not match ${input}`);
    assert(!glob.match(pattern, nativeSep(input), { ignoreCase }), `${pattern} should not match ${nativeSep(input)}`);
  }
  test("simple", () => {
    let p = "node_modules";
    assertGlobMatch(p, "node_modules");
    assertNoGlobMatch(p, "node_module");
    assertNoGlobMatch(p, "/node_modules");
    assertNoGlobMatch(p, "test/node_modules");
    p = "test.txt";
    assertGlobMatch(p, "test.txt");
    assertNoGlobMatch(p, "test?txt");
    assertNoGlobMatch(p, "/text.txt");
    assertNoGlobMatch(p, "test/test.txt");
    p = "test(.txt";
    assertGlobMatch(p, "test(.txt");
    assertNoGlobMatch(p, "test?txt");
    p = "qunit";
    assertGlobMatch(p, "qunit");
    assertNoGlobMatch(p, "qunit.css");
    assertNoGlobMatch(p, "test/qunit");
    p = "/DNXConsoleApp/**/*.cs";
    assertGlobMatch(p, "/DNXConsoleApp/Program.cs");
    assertGlobMatch(p, "/DNXConsoleApp/foo/Program.cs");
    p = "C:/DNXConsoleApp/**/*.cs";
    assertGlobMatch(p, "C:\\DNXConsoleApp\\Program.cs");
    assertGlobMatch(p, "C:\\DNXConsoleApp\\foo\\Program.cs");
    p = "*";
    assertGlobMatch(p, "");
  });
  test("dot hidden", function() {
    let p = ".*";
    assertGlobMatch(p, ".git");
    assertGlobMatch(p, ".hidden.txt");
    assertNoGlobMatch(p, "git");
    assertNoGlobMatch(p, "hidden.txt");
    assertNoGlobMatch(p, "path/.git");
    assertNoGlobMatch(p, "path/.hidden.txt");
    p = "**/.*";
    assertGlobMatch(p, ".git");
    assertGlobMatch(p, "/.git");
    assertGlobMatch(p, ".hidden.txt");
    assertNoGlobMatch(p, "git");
    assertNoGlobMatch(p, "hidden.txt");
    assertGlobMatch(p, "path/.git");
    assertGlobMatch(p, "path/.hidden.txt");
    assertGlobMatch(p, "/path/.git");
    assertGlobMatch(p, "/path/.hidden.txt");
    assertNoGlobMatch(p, "path/git");
    assertNoGlobMatch(p, "pat.h/hidden.txt");
    p = "._*";
    assertGlobMatch(p, "._git");
    assertGlobMatch(p, "._hidden.txt");
    assertNoGlobMatch(p, "git");
    assertNoGlobMatch(p, "hidden.txt");
    assertNoGlobMatch(p, "path/._git");
    assertNoGlobMatch(p, "path/._hidden.txt");
    p = "**/._*";
    assertGlobMatch(p, "._git");
    assertGlobMatch(p, "._hidden.txt");
    assertNoGlobMatch(p, "git");
    assertNoGlobMatch(p, "hidden._txt");
    assertGlobMatch(p, "path/._git");
    assertGlobMatch(p, "path/._hidden.txt");
    assertGlobMatch(p, "/path/._git");
    assertGlobMatch(p, "/path/._hidden.txt");
    assertNoGlobMatch(p, "path/git");
    assertNoGlobMatch(p, "pat.h/hidden._txt");
  });
  test("file pattern", function() {
    let p = "*.js";
    assertGlobMatch(p, "foo.js");
    assertNoGlobMatch(p, "folder/foo.js");
    assertNoGlobMatch(p, "/node_modules/foo.js");
    assertNoGlobMatch(p, "foo.jss");
    assertNoGlobMatch(p, "some.js/test");
    p = "html.*";
    assertGlobMatch(p, "html.js");
    assertGlobMatch(p, "html.txt");
    assertNoGlobMatch(p, "htm.txt");
    p = "*.*";
    assertGlobMatch(p, "html.js");
    assertGlobMatch(p, "html.txt");
    assertGlobMatch(p, "htm.txt");
    assertNoGlobMatch(p, "folder/foo.js");
    assertNoGlobMatch(p, "/node_modules/foo.js");
    p = "node_modules/test/*.js";
    assertGlobMatch(p, "node_modules/test/foo.js");
    assertNoGlobMatch(p, "folder/foo.js");
    assertNoGlobMatch(p, "/node_module/test/foo.js");
    assertNoGlobMatch(p, "foo.jss");
    assertNoGlobMatch(p, "some.js/test");
  });
  test("star", () => {
    let p = "node*modules";
    assertGlobMatch(p, "node_modules");
    assertGlobMatch(p, "node_super_modules");
    assertNoGlobMatch(p, "node_module");
    assertNoGlobMatch(p, "/node_modules");
    assertNoGlobMatch(p, "test/node_modules");
    p = "*";
    assertGlobMatch(p, "html.js");
    assertGlobMatch(p, "html.txt");
    assertGlobMatch(p, "htm.txt");
    assertNoGlobMatch(p, "folder/foo.js");
    assertNoGlobMatch(p, "/node_modules/foo.js");
  });
  test("file / folder match", function() {
    const p = "**/node_modules/**";
    assertGlobMatch(p, "node_modules");
    assertGlobMatch(p, "node_modules/");
    assertGlobMatch(p, "a/node_modules");
    assertGlobMatch(p, "a/node_modules/");
    assertGlobMatch(p, "node_modules/foo");
    assertGlobMatch(p, "foo/node_modules/foo/bar");
    assertGlobMatch(p, "/node_modules");
    assertGlobMatch(p, "/node_modules/");
    assertGlobMatch(p, "/a/node_modules");
    assertGlobMatch(p, "/a/node_modules/");
    assertGlobMatch(p, "/node_modules/foo");
    assertGlobMatch(p, "/foo/node_modules/foo/bar");
  });
  test("questionmark", () => {
    let p = "node?modules";
    assertGlobMatch(p, "node_modules");
    assertNoGlobMatch(p, "node_super_modules");
    assertNoGlobMatch(p, "node_module");
    assertNoGlobMatch(p, "/node_modules");
    assertNoGlobMatch(p, "test/node_modules");
    p = "?";
    assertGlobMatch(p, "h");
    assertNoGlobMatch(p, "html.txt");
    assertNoGlobMatch(p, "htm.txt");
    assertNoGlobMatch(p, "folder/foo.js");
    assertNoGlobMatch(p, "/node_modules/foo.js");
  });
  test("globstar", () => {
    let p = "**/*.js";
    assertGlobMatch(p, "foo.js");
    assertGlobMatch(p, "/foo.js");
    assertGlobMatch(p, "folder/foo.js");
    assertGlobMatch(p, "/node_modules/foo.js");
    assertNoGlobMatch(p, "foo.jss");
    assertNoGlobMatch(p, "some.js/test");
    assertNoGlobMatch(p, "/some.js/test");
    assertNoGlobMatch(p, "\\some.js\\test");
    p = "**/project.json";
    assertGlobMatch(p, "project.json");
    assertGlobMatch(p, "/project.json");
    assertGlobMatch(p, "some/folder/project.json");
    assertGlobMatch(p, "/some/folder/project.json");
    assertNoGlobMatch(p, "some/folder/file_project.json");
    assertNoGlobMatch(p, "some/folder/fileproject.json");
    assertNoGlobMatch(p, "some/rrproject.json");
    assertNoGlobMatch(p, "some\\rrproject.json");
    p = "test/**";
    assertGlobMatch(p, "test");
    assertGlobMatch(p, "test/foo");
    assertGlobMatch(p, "test/foo/");
    assertGlobMatch(p, "test/foo.js");
    assertGlobMatch(p, "test/other/foo.js");
    assertNoGlobMatch(p, "est/other/foo.js");
    p = "**";
    assertGlobMatch(p, "/");
    assertGlobMatch(p, "foo.js");
    assertGlobMatch(p, "folder/foo.js");
    assertGlobMatch(p, "folder/foo/");
    assertGlobMatch(p, "/node_modules/foo.js");
    assertGlobMatch(p, "foo.jss");
    assertGlobMatch(p, "some.js/test");
    p = "test/**/*.js";
    assertGlobMatch(p, "test/foo.js");
    assertGlobMatch(p, "test/other/foo.js");
    assertGlobMatch(p, "test/other/more/foo.js");
    assertNoGlobMatch(p, "test/foo.ts");
    assertNoGlobMatch(p, "test/other/foo.ts");
    assertNoGlobMatch(p, "test/other/more/foo.ts");
    p = "**/**/*.js";
    assertGlobMatch(p, "foo.js");
    assertGlobMatch(p, "/foo.js");
    assertGlobMatch(p, "folder/foo.js");
    assertGlobMatch(p, "/node_modules/foo.js");
    assertNoGlobMatch(p, "foo.jss");
    assertNoGlobMatch(p, "some.js/test");
    p = "**/node_modules/**/*.js";
    assertNoGlobMatch(p, "foo.js");
    assertNoGlobMatch(p, "folder/foo.js");
    assertGlobMatch(p, "node_modules/foo.js");
    assertGlobMatch(p, "/node_modules/foo.js");
    assertGlobMatch(p, "node_modules/some/folder/foo.js");
    assertGlobMatch(p, "/node_modules/some/folder/foo.js");
    assertNoGlobMatch(p, "node_modules/some/folder/foo.ts");
    assertNoGlobMatch(p, "foo.jss");
    assertNoGlobMatch(p, "some.js/test");
    p = "{**/node_modules/**,**/.git/**,**/bower_components/**}";
    assertGlobMatch(p, "node_modules");
    assertGlobMatch(p, "/node_modules");
    assertGlobMatch(p, "/node_modules/more");
    assertGlobMatch(p, "some/test/node_modules");
    assertGlobMatch(p, "some\\test\\node_modules");
    assertGlobMatch(p, "/some/test/node_modules");
    assertGlobMatch(p, "\\some\\test\\node_modules");
    assertGlobMatch(p, "C:\\\\some\\test\\node_modules");
    assertGlobMatch(p, "C:\\\\some\\test\\node_modules\\more");
    assertGlobMatch(p, "bower_components");
    assertGlobMatch(p, "bower_components/more");
    assertGlobMatch(p, "/bower_components");
    assertGlobMatch(p, "some/test/bower_components");
    assertGlobMatch(p, "some\\test\\bower_components");
    assertGlobMatch(p, "/some/test/bower_components");
    assertGlobMatch(p, "\\some\\test\\bower_components");
    assertGlobMatch(p, "C:\\\\some\\test\\bower_components");
    assertGlobMatch(p, "C:\\\\some\\test\\bower_components\\more");
    assertGlobMatch(p, ".git");
    assertGlobMatch(p, "/.git");
    assertGlobMatch(p, "some/test/.git");
    assertGlobMatch(p, "some\\test\\.git");
    assertGlobMatch(p, "/some/test/.git");
    assertGlobMatch(p, "\\some\\test\\.git");
    assertGlobMatch(p, "C:\\\\some\\test\\.git");
    assertNoGlobMatch(p, "tempting");
    assertNoGlobMatch(p, "/tempting");
    assertNoGlobMatch(p, "some/test/tempting");
    assertNoGlobMatch(p, "some\\test\\tempting");
    assertNoGlobMatch(p, "/some/test/tempting");
    assertNoGlobMatch(p, "\\some\\test\\tempting");
    assertNoGlobMatch(p, "C:\\\\some\\test\\tempting");
    p = "{**/package.json,**/project.json}";
    assertGlobMatch(p, "package.json");
    assertGlobMatch(p, "/package.json");
    assertNoGlobMatch(p, "xpackage.json");
    assertNoGlobMatch(p, "/xpackage.json");
  });
  test("issue 41724", function() {
    let p = "some/**/*.js";
    assertGlobMatch(p, "some/foo.js");
    assertGlobMatch(p, "some/folder/foo.js");
    assertNoGlobMatch(p, "something/foo.js");
    assertNoGlobMatch(p, "something/folder/foo.js");
    p = "some/**/*";
    assertGlobMatch(p, "some/foo.js");
    assertGlobMatch(p, "some/folder/foo.js");
    assertNoGlobMatch(p, "something/foo.js");
    assertNoGlobMatch(p, "something/folder/foo.js");
  });
  test("brace expansion", function() {
    let p = "*.{html,js}";
    assertGlobMatch(p, "foo.js");
    assertGlobMatch(p, "foo.html");
    assertNoGlobMatch(p, "folder/foo.js");
    assertNoGlobMatch(p, "/node_modules/foo.js");
    assertNoGlobMatch(p, "foo.jss");
    assertNoGlobMatch(p, "some.js/test");
    p = "*.{html}";
    assertGlobMatch(p, "foo.html");
    assertNoGlobMatch(p, "foo.js");
    assertNoGlobMatch(p, "folder/foo.js");
    assertNoGlobMatch(p, "/node_modules/foo.js");
    assertNoGlobMatch(p, "foo.jss");
    assertNoGlobMatch(p, "some.js/test");
    p = "{node_modules,testing}";
    assertGlobMatch(p, "node_modules");
    assertGlobMatch(p, "testing");
    assertNoGlobMatch(p, "node_module");
    assertNoGlobMatch(p, "dtesting");
    p = "**/{foo,bar}";
    assertGlobMatch(p, "foo");
    assertGlobMatch(p, "bar");
    assertGlobMatch(p, "test/foo");
    assertGlobMatch(p, "test/bar");
    assertGlobMatch(p, "other/more/foo");
    assertGlobMatch(p, "other/more/bar");
    assertGlobMatch(p, "/foo");
    assertGlobMatch(p, "/bar");
    assertGlobMatch(p, "/test/foo");
    assertGlobMatch(p, "/test/bar");
    assertGlobMatch(p, "/other/more/foo");
    assertGlobMatch(p, "/other/more/bar");
    p = "{foo,bar}/**";
    assertGlobMatch(p, "foo");
    assertGlobMatch(p, "bar");
    assertGlobMatch(p, "bar/");
    assertGlobMatch(p, "foo/test");
    assertGlobMatch(p, "bar/test");
    assertGlobMatch(p, "bar/test/");
    assertGlobMatch(p, "foo/other/more");
    assertGlobMatch(p, "bar/other/more");
    assertGlobMatch(p, "bar/other/more/");
    p = "{**/*.d.ts,**/*.js}";
    assertGlobMatch(p, "foo.js");
    assertGlobMatch(p, "testing/foo.js");
    assertGlobMatch(p, "testing\\foo.js");
    assertGlobMatch(p, "/testing/foo.js");
    assertGlobMatch(p, "\\testing\\foo.js");
    assertGlobMatch(p, "C:\\testing\\foo.js");
    assertGlobMatch(p, "foo.d.ts");
    assertGlobMatch(p, "testing/foo.d.ts");
    assertGlobMatch(p, "testing\\foo.d.ts");
    assertGlobMatch(p, "/testing/foo.d.ts");
    assertGlobMatch(p, "\\testing\\foo.d.ts");
    assertGlobMatch(p, "C:\\testing\\foo.d.ts");
    assertNoGlobMatch(p, "foo.d");
    assertNoGlobMatch(p, "testing/foo.d");
    assertNoGlobMatch(p, "testing\\foo.d");
    assertNoGlobMatch(p, "/testing/foo.d");
    assertNoGlobMatch(p, "\\testing\\foo.d");
    assertNoGlobMatch(p, "C:\\testing\\foo.d");
    p = "{**/*.d.ts,**/*.js,path/simple.jgs}";
    assertGlobMatch(p, "foo.js");
    assertGlobMatch(p, "testing/foo.js");
    assertGlobMatch(p, "testing\\foo.js");
    assertGlobMatch(p, "/testing/foo.js");
    assertGlobMatch(p, "path/simple.jgs");
    assertNoGlobMatch(p, "/path/simple.jgs");
    assertGlobMatch(p, "\\testing\\foo.js");
    assertGlobMatch(p, "C:\\testing\\foo.js");
    p = "{**/*.d.ts,**/*.js,foo.[0-9]}";
    assertGlobMatch(p, "foo.5");
    assertGlobMatch(p, "foo.8");
    assertNoGlobMatch(p, "bar.5");
    assertNoGlobMatch(p, "foo.f");
    assertGlobMatch(p, "foo.js");
    p = "prefix/{**/*.d.ts,**/*.js,foo.[0-9]}";
    assertGlobMatch(p, "prefix/foo.5");
    assertGlobMatch(p, "prefix/foo.8");
    assertNoGlobMatch(p, "prefix/bar.5");
    assertNoGlobMatch(p, "prefix/foo.f");
    assertGlobMatch(p, "prefix/foo.js");
  });
  test("expression support (single)", function() {
    const siblings = ["test.html", "test.txt", "test.ts", "test.js"];
    const hasSibling = (name) => siblings.indexOf(name) !== -1;
    let expression = {
      "**/*.js": {
        when: "$(basename).ts"
      }
    };
    assert.strictEqual("**/*.js", glob.parse(expression)("test.js", void 0, hasSibling));
    assert.strictEqual(glob.parse(expression)("test.js", void 0, () => false), null);
    assert.strictEqual(glob.parse(expression)("test.js", void 0, (name) => name === "te.ts"), null);
    assert.strictEqual(glob.parse(expression)("test.js", void 0), null);
    expression = {
      "**/*.js": {
        when: ""
      }
    };
    assert.strictEqual(glob.parse(expression)("test.js", void 0, hasSibling), null);
    expression = {
      // eslint-disable-next-line local/code-no-any-casts
      "**/*.js": {}
    };
    assert.strictEqual("**/*.js", glob.parse(expression)("test.js", void 0, hasSibling));
    expression = {};
    assert.strictEqual(glob.parse(expression)("test.js", void 0, hasSibling), null);
  });
  test("expression support (multiple)", function() {
    const siblings = ["test.html", "test.txt", "test.ts", "test.js"];
    const hasSibling = (name) => siblings.indexOf(name) !== -1;
    const expression = {
      "**/*.js": { when: "$(basename).ts" },
      "**/*.as": true,
      "**/*.foo": false,
      // eslint-disable-next-line local/code-no-any-casts
      "**/*.bananas": { bananas: true }
    };
    assert.strictEqual("**/*.js", glob.parse(expression)("test.js", void 0, hasSibling));
    assert.strictEqual("**/*.as", glob.parse(expression)("test.as", void 0, hasSibling));
    assert.strictEqual("**/*.bananas", glob.parse(expression)("test.bananas", void 0, hasSibling));
    assert.strictEqual("**/*.bananas", glob.parse(expression)("test.bananas", void 0));
    assert.strictEqual(glob.parse(expression)("test.foo", void 0, hasSibling), null);
  });
  test("brackets", () => {
    let p = "foo.[0-9]";
    assertGlobMatch(p, "foo.5");
    assertGlobMatch(p, "foo.8");
    assertNoGlobMatch(p, "bar.5");
    assertNoGlobMatch(p, "foo.f");
    p = "foo.[^0-9]";
    assertNoGlobMatch(p, "foo.5");
    assertNoGlobMatch(p, "foo.8");
    assertNoGlobMatch(p, "bar.5");
    assertGlobMatch(p, "foo.f");
    p = "foo.[!0-9]";
    assertNoGlobMatch(p, "foo.5");
    assertNoGlobMatch(p, "foo.8");
    assertNoGlobMatch(p, "bar.5");
    assertGlobMatch(p, "foo.f");
    p = "foo.[0!^*?]";
    assertNoGlobMatch(p, "foo.5");
    assertNoGlobMatch(p, "foo.8");
    assertGlobMatch(p, "foo.0");
    assertGlobMatch(p, "foo.!");
    assertGlobMatch(p, "foo.^");
    assertGlobMatch(p, "foo.*");
    assertGlobMatch(p, "foo.?");
    p = "foo[/]bar";
    assertNoGlobMatch(p, "foo/bar");
    p = "foo.[[]";
    assertGlobMatch(p, "foo.[");
    p = "foo.[]]";
    assertGlobMatch(p, "foo.]");
    p = "foo.[][!]";
    assertGlobMatch(p, "foo.]");
    assertGlobMatch(p, "foo.[");
    assertGlobMatch(p, "foo.!");
    p = "foo.[]-]";
    assertGlobMatch(p, "foo.]");
    assertGlobMatch(p, "foo.-");
  });
  test("full path", function() {
    assertGlobMatch("testing/this/foo.txt", "testing/this/foo.txt");
  });
  test("ending path", function() {
    assertGlobMatch("**/testing/this/foo.txt", "some/path/testing/this/foo.txt");
  });
  test("prefix agnostic", function() {
    let p = "**/*.js";
    assertGlobMatch(p, "foo.js");
    assertGlobMatch(p, "/foo.js");
    assertGlobMatch(p, "\\foo.js");
    assertGlobMatch(p, "testing/foo.js");
    assertGlobMatch(p, "testing\\foo.js");
    assertGlobMatch(p, "/testing/foo.js");
    assertGlobMatch(p, "\\testing\\foo.js");
    assertGlobMatch(p, "C:\\testing\\foo.js");
    assertNoGlobMatch(p, "foo.ts");
    assertNoGlobMatch(p, "testing/foo.ts");
    assertNoGlobMatch(p, "testing\\foo.ts");
    assertNoGlobMatch(p, "/testing/foo.ts");
    assertNoGlobMatch(p, "\\testing\\foo.ts");
    assertNoGlobMatch(p, "C:\\testing\\foo.ts");
    assertNoGlobMatch(p, "foo.js.txt");
    assertNoGlobMatch(p, "testing/foo.js.txt");
    assertNoGlobMatch(p, "testing\\foo.js.txt");
    assertNoGlobMatch(p, "/testing/foo.js.txt");
    assertNoGlobMatch(p, "\\testing\\foo.js.txt");
    assertNoGlobMatch(p, "C:\\testing\\foo.js.txt");
    assertNoGlobMatch(p, "testing.js/foo");
    assertNoGlobMatch(p, "testing.js\\foo");
    assertNoGlobMatch(p, "/testing.js/foo");
    assertNoGlobMatch(p, "\\testing.js\\foo");
    assertNoGlobMatch(p, "C:\\testing.js\\foo");
    p = "**/foo.js";
    assertGlobMatch(p, "foo.js");
    assertGlobMatch(p, "/foo.js");
    assertGlobMatch(p, "\\foo.js");
    assertGlobMatch(p, "testing/foo.js");
    assertGlobMatch(p, "testing\\foo.js");
    assertGlobMatch(p, "/testing/foo.js");
    assertGlobMatch(p, "\\testing\\foo.js");
    assertGlobMatch(p, "C:\\testing\\foo.js");
  });
  test("cached properly", function() {
    const p = "**/*.js";
    assertGlobMatch(p, "foo.js");
    assertGlobMatch(p, "testing/foo.js");
    assertGlobMatch(p, "testing\\foo.js");
    assertGlobMatch(p, "/testing/foo.js");
    assertGlobMatch(p, "\\testing\\foo.js");
    assertGlobMatch(p, "C:\\testing\\foo.js");
    assertNoGlobMatch(p, "foo.ts");
    assertNoGlobMatch(p, "testing/foo.ts");
    assertNoGlobMatch(p, "testing\\foo.ts");
    assertNoGlobMatch(p, "/testing/foo.ts");
    assertNoGlobMatch(p, "\\testing\\foo.ts");
    assertNoGlobMatch(p, "C:\\testing\\foo.ts");
    assertNoGlobMatch(p, "foo.js.txt");
    assertNoGlobMatch(p, "testing/foo.js.txt");
    assertNoGlobMatch(p, "testing\\foo.js.txt");
    assertNoGlobMatch(p, "/testing/foo.js.txt");
    assertNoGlobMatch(p, "\\testing\\foo.js.txt");
    assertNoGlobMatch(p, "C:\\testing\\foo.js.txt");
    assertNoGlobMatch(p, "testing.js/foo");
    assertNoGlobMatch(p, "testing.js\\foo");
    assertNoGlobMatch(p, "/testing.js/foo");
    assertNoGlobMatch(p, "\\testing.js\\foo");
    assertNoGlobMatch(p, "C:\\testing.js\\foo");
    assertGlobMatch(p, "foo.js");
    assertGlobMatch(p, "testing/foo.js");
    assertGlobMatch(p, "testing\\foo.js");
    assertGlobMatch(p, "/testing/foo.js");
    assertGlobMatch(p, "\\testing\\foo.js");
    assertGlobMatch(p, "C:\\testing\\foo.js");
    assertNoGlobMatch(p, "foo.ts");
    assertNoGlobMatch(p, "testing/foo.ts");
    assertNoGlobMatch(p, "testing\\foo.ts");
    assertNoGlobMatch(p, "/testing/foo.ts");
    assertNoGlobMatch(p, "\\testing\\foo.ts");
    assertNoGlobMatch(p, "C:\\testing\\foo.ts");
    assertNoGlobMatch(p, "foo.js.txt");
    assertNoGlobMatch(p, "testing/foo.js.txt");
    assertNoGlobMatch(p, "testing\\foo.js.txt");
    assertNoGlobMatch(p, "/testing/foo.js.txt");
    assertNoGlobMatch(p, "\\testing\\foo.js.txt");
    assertNoGlobMatch(p, "C:\\testing\\foo.js.txt");
    assertNoGlobMatch(p, "testing.js/foo");
    assertNoGlobMatch(p, "testing.js\\foo");
    assertNoGlobMatch(p, "/testing.js/foo");
    assertNoGlobMatch(p, "\\testing.js\\foo");
    assertNoGlobMatch(p, "C:\\testing.js\\foo");
  });
  test("invalid glob", function() {
    const p = "**/*(.js";
    assertNoGlobMatch(p, "foo.js");
  });
  test("split glob aware", function() {
    assert.deepStrictEqual(glob.splitGlobAware("foo,bar", ","), ["foo", "bar"]);
    assert.deepStrictEqual(glob.splitGlobAware("foo", ","), ["foo"]);
    assert.deepStrictEqual(glob.splitGlobAware("{foo,bar}", ","), ["{foo,bar}"]);
    assert.deepStrictEqual(glob.splitGlobAware("foo,bar,{foo,bar}", ","), ["foo", "bar", "{foo,bar}"]);
    assert.deepStrictEqual(glob.splitGlobAware("{foo,bar},foo,bar,{foo,bar}", ","), ["{foo,bar}", "foo", "bar", "{foo,bar}"]);
    assert.deepStrictEqual(glob.splitGlobAware("[foo,bar]", ","), ["[foo,bar]"]);
    assert.deepStrictEqual(glob.splitGlobAware("foo,bar,[foo,bar]", ","), ["foo", "bar", "[foo,bar]"]);
    assert.deepStrictEqual(glob.splitGlobAware("[foo,bar],foo,bar,[foo,bar]", ","), ["[foo,bar]", "foo", "bar", "[foo,bar]"]);
  });
  test("expression with disabled glob", function() {
    const expr = { "**/*.js": false };
    assert.strictEqual(glob.match(expr, "foo.js"), null);
  });
  test("expression with two non-trivia globs", function() {
    const expr = {
      "**/*.j?": true,
      "**/*.t?": true
    };
    assert.strictEqual(glob.match(expr, "foo.js"), "**/*.j?");
    assert.strictEqual(glob.match(expr, "foo.as"), null);
  });
  test("expression with non-trivia glob (issue 144458)", function() {
    const pattern = "**/p*";
    assert.strictEqual(glob.match(pattern, "foo/barp"), false);
    assert.strictEqual(glob.match(pattern, "foo/bar/ap"), false);
    assert.strictEqual(glob.match(pattern, "ap"), false);
    assert.strictEqual(glob.match(pattern, "foo/barp1"), false);
    assert.strictEqual(glob.match(pattern, "foo/bar/ap1"), false);
    assert.strictEqual(glob.match(pattern, "ap1"), false);
    assert.strictEqual(glob.match(pattern, "/foo/barp"), false);
    assert.strictEqual(glob.match(pattern, "/foo/bar/ap"), false);
    assert.strictEqual(glob.match(pattern, "/ap"), false);
    assert.strictEqual(glob.match(pattern, "/foo/barp1"), false);
    assert.strictEqual(glob.match(pattern, "/foo/bar/ap1"), false);
    assert.strictEqual(glob.match(pattern, "/ap1"), false);
    assert.strictEqual(glob.match(pattern, "foo/pbar"), true);
    assert.strictEqual(glob.match(pattern, "/foo/pbar"), true);
    assert.strictEqual(glob.match(pattern, "foo/bar/pa"), true);
    assert.strictEqual(glob.match(pattern, "/p"), true);
  });
  test("expression with empty glob", function() {
    const expr = { "": true };
    assert.strictEqual(glob.match(expr, "foo.js"), null);
  });
  test("expression with other falsy value", function() {
    const expr = { "**/*.js": 0 };
    assert.strictEqual(glob.match(expr, "foo.js"), "**/*.js");
  });
  test("expression with two basename globs", function() {
    const expr = {
      "**/bar": true,
      "**/baz": true
    };
    assert.strictEqual(glob.match(expr, "bar"), "**/bar");
    assert.strictEqual(glob.match(expr, "foo"), null);
    assert.strictEqual(glob.match(expr, "foo/bar"), "**/bar");
    assert.strictEqual(glob.match(expr, "foo\\bar"), "**/bar");
    assert.strictEqual(glob.match(expr, "foo/foo"), null);
  });
  test("expression with two basename globs and a siblings expression", function() {
    const expr = {
      "**/bar": true,
      "**/baz": true,
      "**/*.js": { when: "$(basename).ts" }
    };
    const siblings = ["foo.ts", "foo.js", "foo", "bar"];
    const hasSibling = (name) => siblings.indexOf(name) !== -1;
    assert.strictEqual(glob.parse(expr)("bar", void 0, hasSibling), "**/bar");
    assert.strictEqual(glob.parse(expr)("foo", void 0, hasSibling), null);
    assert.strictEqual(glob.parse(expr)("foo/bar", void 0, hasSibling), "**/bar");
    if (isWindows) {
      assert.strictEqual(glob.parse(expr)("foo\\bar", void 0, hasSibling), "**/bar");
    }
    assert.strictEqual(glob.parse(expr)("foo/foo", void 0, hasSibling), null);
    assert.strictEqual(glob.parse(expr)("foo.js", void 0, hasSibling), "**/*.js");
    assert.strictEqual(glob.parse(expr)("bar.js", void 0, hasSibling), null);
  });
  test("expression with multipe basename globs", function() {
    const expr = {
      "**/bar": true,
      "{**/baz,**/foo}": true
    };
    assert.strictEqual(glob.match(expr, "bar"), "**/bar");
    assert.strictEqual(glob.match(expr, "foo"), "{**/baz,**/foo}");
    assert.strictEqual(glob.match(expr, "baz"), "{**/baz,**/foo}");
    assert.strictEqual(glob.match(expr, "abc"), null);
  });
  test("falsy expression/pattern", function() {
    assert.strictEqual(glob.match(null, "foo"), false);
    assert.strictEqual(glob.match("", "foo"), false);
    assert.strictEqual(glob.parse(null)("foo"), false);
    assert.strictEqual(glob.parse("")("foo"), false);
  });
  test("falsy path", function() {
    assert.strictEqual(glob.parse("foo")(null), false);
    assert.strictEqual(glob.parse("foo")(""), false);
    assert.strictEqual(glob.parse("**/*.j?")(null), false);
    assert.strictEqual(glob.parse("**/*.j?")(""), false);
    assert.strictEqual(glob.parse("**/*.foo")(null), false);
    assert.strictEqual(glob.parse("**/*.foo")(""), false);
    assert.strictEqual(glob.parse("**/foo")(null), false);
    assert.strictEqual(glob.parse("**/foo")(""), false);
    assert.strictEqual(glob.parse("{**/baz,**/foo}")(null), false);
    assert.strictEqual(glob.parse("{**/baz,**/foo}")(""), false);
    assert.strictEqual(glob.parse("{**/*.baz,**/*.foo}")(null), false);
    assert.strictEqual(glob.parse("{**/*.baz,**/*.foo}")(""), false);
  });
  test("expression/pattern basename", function() {
    assert.strictEqual(glob.parse("**/foo")("bar/baz", "baz"), false);
    assert.strictEqual(glob.parse("**/foo")("bar/foo", "foo"), true);
    assert.strictEqual(glob.parse("{**/baz,**/foo}")("baz/bar", "bar"), false);
    assert.strictEqual(glob.parse("{**/baz,**/foo}")("baz/foo", "foo"), true);
    const expr = { "**/*.js": { when: "$(basename).ts" } };
    const siblings = ["foo.ts", "foo.js"];
    const hasSibling = (name) => siblings.indexOf(name) !== -1;
    assert.strictEqual(glob.parse(expr)("bar/baz.js", "baz.js", hasSibling), null);
    assert.strictEqual(glob.parse(expr)("bar/foo.js", "foo.js", hasSibling), "**/*.js");
  });
  test("expression/pattern basename terms", function() {
    assert.deepStrictEqual(glob.getBasenameTerms(glob.parse("**/*.foo")), []);
    assert.deepStrictEqual(glob.getBasenameTerms(glob.parse("**/foo")), ["foo"]);
    assert.deepStrictEqual(glob.getBasenameTerms(glob.parse("**/foo/")), ["foo"]);
    assert.deepStrictEqual(glob.getBasenameTerms(glob.parse("{**/baz,**/foo}")), ["baz", "foo"]);
    assert.deepStrictEqual(glob.getBasenameTerms(glob.parse("{**/baz/,**/foo/}")), ["baz", "foo"]);
    assert.deepStrictEqual(glob.getBasenameTerms(glob.parse({
      "**/foo": true,
      "{**/bar,**/baz}": true,
      "{**/bar2/,**/baz2/}": true,
      "**/bulb": false
    })), ["foo", "bar", "baz", "bar2", "baz2"]);
    assert.deepStrictEqual(glob.getBasenameTerms(glob.parse({
      "**/foo": { when: "$(basename).zip" },
      "**/bar": true
    })), ["bar"]);
  });
  test("expression/pattern optimization for basenames", function() {
    assert.deepStrictEqual(glob.getBasenameTerms(glob.parse("**/foo/**")), []);
    assert.deepStrictEqual(glob.getBasenameTerms(glob.parse("**/foo/**", { trimForExclusions: true })), ["foo"]);
    testOptimizationForBasenames("**/*.foo/**", [], [["baz/bar.foo/bar/baz", true]]);
    testOptimizationForBasenames("**/foo/**", ["foo"], [["bar/foo", true], ["bar/foo/baz", false]]);
    testOptimizationForBasenames("{**/baz/**,**/foo/**}", ["baz", "foo"], [["bar/baz", true], ["bar/foo", true]]);
    testOptimizationForBasenames({
      "**/foo/**": true,
      "{**/bar/**,**/baz/**}": true,
      "**/bulb/**": false
    }, ["foo", "bar", "baz"], [
      ["bar/foo", "**/foo/**"],
      ["foo/bar", "{**/bar/**,**/baz/**}"],
      ["bar/nope", null]
    ]);
    const siblings = ["baz", "baz.zip", "nope"];
    const hasSibling = (name) => siblings.indexOf(name) !== -1;
    testOptimizationForBasenames({
      "**/foo/**": { when: "$(basename).zip" },
      "**/bar/**": true
    }, ["bar"], [
      ["bar/foo", null],
      ["bar/foo/baz", null],
      ["bar/foo/nope", null],
      ["foo/bar", "**/bar/**"]
    ], [
      null,
      hasSibling,
      hasSibling
    ]);
  });
  function testOptimizationForBasenames(pattern, basenameTerms, matches, siblingsFns = []) {
    const parsed = glob.parse(pattern, { trimForExclusions: true });
    assert.deepStrictEqual(glob.getBasenameTerms(parsed), basenameTerms);
    matches.forEach(([text, result], i) => {
      assert.strictEqual(parsed(text, null, siblingsFns[i]), result);
    });
  }
  test("trailing slash", function() {
    assert.strictEqual(glob.parse("**/foo/")("bar/baz", "baz"), false);
    assert.strictEqual(glob.parse("**/foo/")("bar/foo", "foo"), true);
    assert.strictEqual(glob.parse("**/*.foo/")("bar/file.baz", "file.baz"), false);
    assert.strictEqual(glob.parse("**/*.foo/")("bar/file.foo", "file.foo"), true);
    assert.strictEqual(glob.parse("{**/foo/,**/abc/}")("bar/baz", "baz"), false);
    assert.strictEqual(glob.parse("{**/foo/,**/abc/}")("bar/foo", "foo"), true);
    assert.strictEqual(glob.parse("{**/foo/,**/abc/}")("bar/abc", "abc"), true);
    assert.strictEqual(glob.parse("{**/foo/,**/abc/}", { trimForExclusions: true })("bar/baz", "baz"), false);
    assert.strictEqual(glob.parse("{**/foo/,**/abc/}", { trimForExclusions: true })("bar/foo", "foo"), true);
    assert.strictEqual(glob.parse("{**/foo/,**/abc/}", { trimForExclusions: true })("bar/abc", "abc"), true);
  });
  test("expression/pattern path", function() {
    assert.strictEqual(glob.parse("**/foo/bar")(nativeSep("foo/baz"), "baz"), false);
    assert.strictEqual(glob.parse("**/foo/bar")(nativeSep("foo/bar"), "bar"), true);
    assert.strictEqual(glob.parse("**/foo/bar")(nativeSep("bar/foo/bar"), "bar"), true);
    assert.strictEqual(glob.parse("**/foo/bar/**")(nativeSep("bar/foo/bar"), "bar"), true);
    assert.strictEqual(glob.parse("**/foo/bar/**")(nativeSep("bar/foo/bar/baz"), "baz"), true);
    assert.strictEqual(glob.parse("**/foo/bar/**", { trimForExclusions: true })(nativeSep("bar/foo/bar"), "bar"), true);
    assert.strictEqual(glob.parse("**/foo/bar/**", { trimForExclusions: true })(nativeSep("bar/foo/bar/baz"), "baz"), false);
    assert.strictEqual(glob.parse("foo/bar")(nativeSep("foo/baz"), "baz"), false);
    assert.strictEqual(glob.parse("foo/bar")(nativeSep("foo/bar"), "bar"), true);
    assert.strictEqual(glob.parse("foo/bar/baz")(nativeSep("foo/bar/baz"), "baz"), true);
    assert.strictEqual(glob.parse("foo/bar")(nativeSep("bar/foo/bar"), "bar"), false);
    assert.strictEqual(glob.parse("foo/bar/**")(nativeSep("foo/bar/baz"), "baz"), true);
    assert.strictEqual(glob.parse("foo/bar/**", { trimForExclusions: true })(nativeSep("foo/bar"), "bar"), true);
    assert.strictEqual(glob.parse("foo/bar/**", { trimForExclusions: true })(nativeSep("foo/bar/baz"), "baz"), false);
  });
  test("expression/pattern paths", function() {
    assert.deepStrictEqual(glob.getPathTerms(glob.parse("**/*.foo")), []);
    assert.deepStrictEqual(glob.getPathTerms(glob.parse("**/foo")), []);
    assert.deepStrictEqual(glob.getPathTerms(glob.parse("**/foo/bar")), ["*/foo/bar"]);
    assert.deepStrictEqual(glob.getPathTerms(glob.parse("**/foo/bar/")), ["*/foo/bar"]);
    const parsed = glob.parse({
      "**/foo/bar": true,
      "**/foo2/bar2": true,
      // Not supported
      // '{**/bar/foo,**/baz/foo}': true,
      // '{**/bar2/foo/,**/baz2/foo/}': true,
      "**/bulb": true,
      "**/bulb2": true,
      "**/bulb/foo": false
    });
    assert.deepStrictEqual(glob.getPathTerms(parsed), ["*/foo/bar", "*/foo2/bar2"]);
    assert.deepStrictEqual(glob.getBasenameTerms(parsed), ["bulb", "bulb2"]);
    assert.deepStrictEqual(glob.getPathTerms(glob.parse({
      "**/foo/bar": { when: "$(basename).zip" },
      "**/bar/foo": true,
      "**/bar2/foo2": true
    })), ["*/bar/foo", "*/bar2/foo2"]);
  });
  test("expression/pattern optimization for paths", function() {
    assert.deepStrictEqual(glob.getPathTerms(glob.parse("**/foo/bar/**")), []);
    assert.deepStrictEqual(glob.getPathTerms(glob.parse("**/foo/bar/**", { trimForExclusions: true })), ["*/foo/bar"]);
    testOptimizationForPaths("**/*.foo/bar/**", [], [[nativeSep("baz/bar.foo/bar/baz"), true]]);
    testOptimizationForPaths("**/foo/bar/**", ["*/foo/bar"], [[nativeSep("bar/foo/bar"), true], [nativeSep("bar/foo/bar/baz"), false]]);
    testOptimizationForPaths({
      "**/foo/bar/**": true,
      // Not supported
      // '{**/bar/bar/**,**/baz/bar/**}': true,
      "**/bulb/bar/**": false
    }, ["*/foo/bar"], [
      [nativeSep("bar/foo/bar"), "**/foo/bar/**"],
      // Not supported
      // [nativeSep('foo/bar/bar'), '{**/bar/bar/**,**/baz/bar/**}'],
      [nativeSep("/foo/bar/nope"), null]
    ]);
    const siblings = ["baz", "baz.zip", "nope"];
    const hasSibling = (name) => siblings.indexOf(name) !== -1;
    testOptimizationForPaths({
      "**/foo/123/**": { when: "$(basename).zip" },
      "**/bar/123/**": true
    }, ["*/bar/123"], [
      [nativeSep("bar/foo/123"), null],
      [nativeSep("bar/foo/123/baz"), null],
      [nativeSep("bar/foo/123/nope"), null],
      [nativeSep("foo/bar/123"), "**/bar/123/**"]
    ], [
      null,
      hasSibling,
      hasSibling
    ]);
  });
  function testOptimizationForPaths(pattern, pathTerms, matches, siblingsFns = []) {
    const parsed = glob.parse(pattern, { trimForExclusions: true });
    assert.deepStrictEqual(glob.getPathTerms(parsed), pathTerms);
    matches.forEach(([text, result], i) => {
      assert.strictEqual(parsed(text, null, siblingsFns[i]), result);
    });
  }
  function nativeSep(slashPath) {
    return slashPath.replace(/\//g, sep);
  }
  test("relative pattern - glob star", function() {
    if (isWindows) {
      const p = { base: "C:\\DNXConsoleApp\\foo", pattern: "**/*.cs" };
      assertGlobMatch(p, "C:\\DNXConsoleApp\\foo\\Program.cs");
      assertGlobMatch(p, "C:\\DNXConsoleApp\\foo\\bar\\Program.cs");
      assertNoGlobMatch(p, "C:\\DNXConsoleApp\\foo\\Program.ts");
      assertNoGlobMatch(p, "C:\\DNXConsoleApp\\Program.cs");
      assertNoGlobMatch(p, "C:\\other\\DNXConsoleApp\\foo\\Program.ts");
    } else {
      const p = { base: "/DNXConsoleApp/foo", pattern: "**/*.cs" };
      assertGlobMatch(p, "/DNXConsoleApp/foo/Program.cs");
      assertGlobMatch(p, "/DNXConsoleApp/foo/bar/Program.cs");
      assertNoGlobMatch(p, "/DNXConsoleApp/foo/Program.ts");
      assertNoGlobMatch(p, "/DNXConsoleApp/Program.cs");
      assertNoGlobMatch(p, "/other/DNXConsoleApp/foo/Program.ts");
    }
  });
  test("relative pattern - single star", function() {
    if (isWindows) {
      const p = { base: "C:\\DNXConsoleApp\\foo", pattern: "*.cs" };
      assertGlobMatch(p, "C:\\DNXConsoleApp\\foo\\Program.cs");
      assertNoGlobMatch(p, "C:\\DNXConsoleApp\\foo\\bar\\Program.cs");
      assertNoGlobMatch(p, "C:\\DNXConsoleApp\\foo\\Program.ts");
      assertNoGlobMatch(p, "C:\\DNXConsoleApp\\Program.cs");
      assertNoGlobMatch(p, "C:\\other\\DNXConsoleApp\\foo\\Program.ts");
    } else {
      const p = { base: "/DNXConsoleApp/foo", pattern: "*.cs" };
      assertGlobMatch(p, "/DNXConsoleApp/foo/Program.cs");
      assertNoGlobMatch(p, "/DNXConsoleApp/foo/bar/Program.cs");
      assertNoGlobMatch(p, "/DNXConsoleApp/foo/Program.ts");
      assertNoGlobMatch(p, "/DNXConsoleApp/Program.cs");
      assertNoGlobMatch(p, "/other/DNXConsoleApp/foo/Program.ts");
    }
  });
  test("relative pattern - single star with path", function() {
    if (isWindows) {
      const p = { base: "C:\\DNXConsoleApp\\foo", pattern: "something/*.cs" };
      assertGlobMatch(p, "C:\\DNXConsoleApp\\foo\\something\\Program.cs");
      assertNoGlobMatch(p, "C:\\DNXConsoleApp\\foo\\Program.cs");
    } else {
      const p = { base: "/DNXConsoleApp/foo", pattern: "something/*.cs" };
      assertGlobMatch(p, "/DNXConsoleApp/foo/something/Program.cs");
      assertNoGlobMatch(p, "/DNXConsoleApp/foo/Program.cs");
    }
  });
  test("relative pattern - single star alone", function() {
    if (isWindows) {
      const p = { base: "C:\\DNXConsoleApp\\foo\\something\\Program.cs", pattern: "*" };
      assertGlobMatch(p, "C:\\DNXConsoleApp\\foo\\something\\Program.cs");
      assertNoGlobMatch(p, "C:\\DNXConsoleApp\\foo\\Program.cs");
    } else {
      const p = { base: "/DNXConsoleApp/foo/something/Program.cs", pattern: "*" };
      assertGlobMatch(p, "/DNXConsoleApp/foo/something/Program.cs");
      assertNoGlobMatch(p, "/DNXConsoleApp/foo/Program.cs");
    }
  });
  test("relative pattern - ignores case on macOS/Windows", function() {
    if (isWindows) {
      const p = { base: "C:\\DNXConsoleApp\\foo", pattern: "something/*.cs" };
      assertGlobMatch(p, "C:\\DNXConsoleApp\\foo\\something\\Program.cs".toLowerCase());
    } else if (isMacintosh) {
      const p = { base: "/DNXConsoleApp/foo", pattern: "something/*.cs" };
      assertGlobMatch(p, "/DNXConsoleApp/foo/something/Program.cs".toLowerCase());
    } else if (isLinux) {
      const p = { base: "/DNXConsoleApp/foo", pattern: "something/*.cs" };
      assertNoGlobMatch(p, "/DNXConsoleApp/foo/something/Program.cs".toLowerCase());
    }
  });
  test("relative pattern - trailing slash / backslash (#162498)", function() {
    if (isWindows) {
      let p = { base: "C:\\", pattern: "foo.cs" };
      assertGlobMatch(p, "C:\\foo.cs");
      p = { base: "C:\\bar\\", pattern: "foo.cs" };
      assertGlobMatch(p, "C:\\bar\\foo.cs");
    } else {
      let p = { base: "/", pattern: "foo.cs" };
      assertGlobMatch(p, "/foo.cs");
      p = { base: "/bar/", pattern: "foo.cs" };
      assertGlobMatch(p, "/bar/foo.cs");
    }
  });
  test('pattern with "base" does not explode - #36081', function() {
    assert.ok(glob.match({ "base": true }, "base"));
  });
  test("relative pattern - #57475", function() {
    if (isWindows) {
      const p = { base: "C:\\DNXConsoleApp\\foo", pattern: "styles/style.css" };
      assertGlobMatch(p, "C:\\DNXConsoleApp\\foo\\styles\\style.css");
      assertNoGlobMatch(p, "C:\\DNXConsoleApp\\foo\\Program.cs");
    } else {
      const p = { base: "/DNXConsoleApp/foo", pattern: "styles/style.css" };
      assertGlobMatch(p, "/DNXConsoleApp/foo/styles/style.css");
      assertNoGlobMatch(p, "/DNXConsoleApp/foo/Program.cs");
    }
  });
  test("URI match", () => {
    const p = "scheme:/**/*.md";
    assertGlobMatch(p, URI.file("super/duper/long/some/file.md").with({ scheme: "scheme" }).toString());
  });
  test("expression fails when siblings use promises (https://github.com/microsoft/vscode/issues/146294)", async function() {
    const siblings = ["test.html", "test.txt", "test.ts"];
    const hasSibling = (name) => Promise.resolve(siblings.indexOf(name) !== -1);
    const expression = {
      "**/test.js": { when: "$(basename).js" },
      "**/*.js": { when: "$(basename).ts" }
    };
    const parsedExpression = glob.parse(expression);
    assert.strictEqual("**/*.js", await parsedExpression("test.js", void 0, hasSibling));
  });
  test("patternsEquals", () => {
    assert.ok(glob.patternsEquals(["a"], ["a"]));
    assert.ok(!glob.patternsEquals(["a"], ["b"]));
    assert.ok(glob.patternsEquals(["a", "b", "c"], ["a", "b", "c"]));
    assert.ok(!glob.patternsEquals(["1", "2"], ["1", "3"]));
    assert.ok(glob.patternsEquals([{ base: "a", pattern: "*" }, "b", "c"], [{ base: "a", pattern: "*" }, "b", "c"]));
    assert.ok(glob.patternsEquals(void 0, void 0));
    assert.ok(!glob.patternsEquals(void 0, ["b"]));
    assert.ok(!glob.patternsEquals(["a"], void 0));
  });
  test("isEmptyPattern", () => {
    assert.ok(glob.isEmptyPattern(glob.parse("")));
    assert.ok(glob.isEmptyPattern(glob.parse(void 0)));
    assert.ok(glob.isEmptyPattern(glob.parse(null)));
    assert.ok(glob.isEmptyPattern(glob.parse({})));
    assert.ok(glob.isEmptyPattern(glob.parse({ "": true })));
    assert.ok(glob.isEmptyPattern(glob.parse({ "**/*.js": false })));
  });
  test("caseInsensitiveMatch", () => {
    assertNoGlobMatch("PATH/FOO.js", "path/foo.js");
    assertGlobMatch("PATH/FOO.js", "path/foo.js", true);
    assertNoGlobMatch("**/*.JS", "bar/foo.js");
    assertGlobMatch("**/*.JS", "bar/foo.js", true);
    assertNoGlobMatch("**/package", "bar/Package");
    assertGlobMatch("**/package", "bar/Package", true);
    assertNoGlobMatch("{**/*.JS,**/*.TS}", "bar/foo.ts");
    assertNoGlobMatch("{**/*.JS,**/*.TS}", "bar/foo.js");
    assertGlobMatch("{**/*.JS,**/*.TS}", "bar/foo.ts", true);
    assertGlobMatch("{**/*.JS,**/*.TS}", "bar/foo.js", true);
    assertNoGlobMatch("**/FOO/Bar", "bar/foo/bar");
    assertGlobMatch("**/FOO/Bar", "bar/foo/bar", true);
    assertNoGlobMatch("FOO/Bar", "foo/bar");
    assertGlobMatch("FOO/Bar", "foo/bar", true);
    assertNoGlobMatch("some/*/Random/*/Path.FILE", "some/very/random/unusual/path.file");
    assertGlobMatch("some/*/Random/*/Path.FILE", "some/very/random/unusual/path.file", true);
  });
  ensureNoDisposablesAreLeakedInTestSuite();
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxiYXNlXFx0ZXN0XFxjb21tb25cXGdsb2IudGVzdC50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCBhc3NlcnQgZnJvbSAnYXNzZXJ0JztcbmltcG9ydCAqIGFzIGdsb2IgZnJvbSAnLi4vLi4vY29tbW9uL2dsb2IuanMnO1xuaW1wb3J0IHsgc2VwIH0gZnJvbSAnLi4vLi4vY29tbW9uL3BhdGguanMnO1xuaW1wb3J0IHsgaXNMaW51eCwgaXNNYWNpbnRvc2gsIGlzV2luZG93cyB9IGZyb20gJy4uLy4uL2NvbW1vbi9wbGF0Zm9ybS5qcyc7XG5pbXBvcnQgeyBVUkkgfSBmcm9tICcuLi8uLi9jb21tb24vdXJpLmpzJztcbmltcG9ydCB7IGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSB9IGZyb20gJy4vdXRpbHMuanMnO1xuXG5zdWl0ZSgnR2xvYicsICgpID0+IHtcblxuXHQvLyB0ZXN0KCdwZXJmJywgKCkgPT4ge1xuXG5cdC8vIFx0bGV0IHBhdHRlcm5zID0gW1xuXHQvLyBcdFx0J3sqKi8qLmNzLCoqLyouanNvbiwqKi8qLmNzcHJvaiwqKi8qLnNsbn0nLFxuXHQvLyBcdFx0J3sqKi8qLmNzLCoqLyouY3Nwcm9qLCoqLyouc2xufScsXG5cdC8vIFx0XHQneyoqLyoudHMsKiovKi50c3gsKiovKi5qcywqKi8qLmpzeCwqKi8qLmVzNiwqKi8qLm1qcywqKi8qLmNqc30nLFxuXHQvLyBcdFx0JyoqLyouZ28nLFxuXHQvLyBcdFx0J3sqKi8qLnBzLCoqLyoucHMxfScsXG5cdC8vIFx0XHQneyoqLyouYywqKi8qLmNwcCwqKi8qLmh9Jyxcblx0Ly8gXHRcdCd7KiovKi5mc3gsKiovKi5mc2ksKiovKi5mcywqKi8qLm1sLCoqLyoubWxpfScsXG5cdC8vIFx0XHQneyoqLyouanMsKiovKi5qc3gsKiovKi5lczYsKiovKi5tanMsKiovKi5janN9Jyxcblx0Ly8gXHRcdCd7KiovKi50cywqKi8qLnRzeH0nLFxuXHQvLyBcdFx0J3sqKi8qLnBocH0nLFxuXHQvLyBcdFx0J3sqKi8qLnBocH0nLFxuXHQvLyBcdFx0J3sqKi8qLnBocH0nLFxuXHQvLyBcdFx0J3sqKi8qLnBocH0nLFxuXHQvLyBcdFx0J3sqKi8qLnB5fScsXG5cdC8vIFx0XHQneyoqLyoucHl9Jyxcblx0Ly8gXHRcdCd7KiovKi5weX0nLFxuXHQvLyBcdFx0J3sqKi8qLnJzLCoqLyoucnNsaWJ9Jyxcblx0Ly8gXHRcdCd7KiovKi5jcHAsKiovKi5jYywqKi8qLmh9Jyxcblx0Ly8gXHRcdCd7KiovKi5tZH0nLFxuXHQvLyBcdFx0J3sqKi8qLm1kfScsXG5cdC8vIFx0XHQneyoqLyoubWR9J1xuXHQvLyBcdF07XG5cblx0Ly8gXHRsZXQgcGF0aHMgPSBbXG5cdC8vIFx0XHQnL0ROWENvbnNvbGVBcHAvUHJvZ3JhbS5jcycsXG5cdC8vIFx0XHQnQzpcXFxcRE5YQ29uc29sZUFwcFxcXFxmb29cXFxcUHJvZ3JhbS5jcycsXG5cdC8vIFx0XHQndGVzdC9xdW5pdCcsXG5cdC8vIFx0XHQndGVzdC90ZXN0LnR4dCcsXG5cdC8vIFx0XHQndGVzdC9ub2RlX21vZHVsZXMnLFxuXHQvLyBcdFx0Jy5oaWRkZW4udHh0Jyxcblx0Ly8gXHRcdCcvbm9kZV9tb2R1bGUvdGVzdC9mb28uanMnXG5cdC8vIFx0XTtcblxuXHQvLyBcdGxldCByZXN1bHRzID0gMDtcblx0Ly8gXHRsZXQgYyA9IDEwMDA7XG5cdC8vIFx0Y29uc29sZS5wcm9maWxlKCdnbG9iLm1hdGNoJyk7XG5cdC8vIFx0d2hpbGUgKGMtLSA+IDApIHtcblx0Ly8gXHRcdGZvciAobGV0IHBhdGggb2YgcGF0aHMpIHtcblx0Ly8gXHRcdFx0Zm9yIChsZXQgcGF0dGVybiBvZiBwYXR0ZXJucykge1xuXHQvLyBcdFx0XHRcdGxldCByID0gZ2xvYi5tYXRjaChwYXR0ZXJuLCBwYXRoKTtcblx0Ly8gXHRcdFx0XHRpZiAocikge1xuXHQvLyBcdFx0XHRcdFx0cmVzdWx0cyArPSA0Mjtcblx0Ly8gXHRcdFx0XHR9XG5cdC8vIFx0XHRcdH1cblx0Ly8gXHRcdH1cblx0Ly8gXHR9XG5cdC8vIFx0Y29uc29sZS5wcm9maWxlRW5kKCk7XG5cdC8vIH0pO1xuXG5cdGZ1bmN0aW9uIGFzc2VydEdsb2JNYXRjaChwYXR0ZXJuOiBzdHJpbmcgfCBnbG9iLklSZWxhdGl2ZVBhdHRlcm4sIGlucHV0OiBzdHJpbmcsIGlnbm9yZUNhc2U/OiBib29sZWFuKSB7XG5cdFx0YXNzZXJ0KGdsb2IubWF0Y2gocGF0dGVybiwgaW5wdXQsIHsgaWdub3JlQ2FzZSB9KSwgYCR7SlNPTi5zdHJpbmdpZnkocGF0dGVybil9IHNob3VsZCBtYXRjaCAke2lucHV0fWApO1xuXHRcdGFzc2VydChnbG9iLm1hdGNoKHBhdHRlcm4sIG5hdGl2ZVNlcChpbnB1dCksIHsgaWdub3JlQ2FzZSB9KSwgYCR7cGF0dGVybn0gc2hvdWxkIG1hdGNoICR7bmF0aXZlU2VwKGlucHV0KX1gKTtcblx0fVxuXG5cdGZ1bmN0aW9uIGFzc2VydE5vR2xvYk1hdGNoKHBhdHRlcm46IHN0cmluZyB8IGdsb2IuSVJlbGF0aXZlUGF0dGVybiwgaW5wdXQ6IHN0cmluZywgaWdub3JlQ2FzZT86IGJvb2xlYW4pIHtcblx0XHRhc3NlcnQoIWdsb2IubWF0Y2gocGF0dGVybiwgaW5wdXQsIHsgaWdub3JlQ2FzZSB9KSwgYCR7cGF0dGVybn0gc2hvdWxkIG5vdCBtYXRjaCAke2lucHV0fWApO1xuXHRcdGFzc2VydCghZ2xvYi5tYXRjaChwYXR0ZXJuLCBuYXRpdmVTZXAoaW5wdXQpLCB7IGlnbm9yZUNhc2UgfSksIGAke3BhdHRlcm59IHNob3VsZCBub3QgbWF0Y2ggJHtuYXRpdmVTZXAoaW5wdXQpfWApO1xuXHR9XG5cblx0dGVzdCgnc2ltcGxlJywgKCkgPT4ge1xuXHRcdGxldCBwID0gJ25vZGVfbW9kdWxlcyc7XG5cblx0XHRhc3NlcnRHbG9iTWF0Y2gocCwgJ25vZGVfbW9kdWxlcycpO1xuXHRcdGFzc2VydE5vR2xvYk1hdGNoKHAsICdub2RlX21vZHVsZScpO1xuXHRcdGFzc2VydE5vR2xvYk1hdGNoKHAsICcvbm9kZV9tb2R1bGVzJyk7XG5cdFx0YXNzZXJ0Tm9HbG9iTWF0Y2gocCwgJ3Rlc3Qvbm9kZV9tb2R1bGVzJyk7XG5cblx0XHRwID0gJ3Rlc3QudHh0Jztcblx0XHRhc3NlcnRHbG9iTWF0Y2gocCwgJ3Rlc3QudHh0Jyk7XG5cdFx0YXNzZXJ0Tm9HbG9iTWF0Y2gocCwgJ3Rlc3Q/dHh0Jyk7XG5cdFx0YXNzZXJ0Tm9HbG9iTWF0Y2gocCwgJy90ZXh0LnR4dCcpO1xuXHRcdGFzc2VydE5vR2xvYk1hdGNoKHAsICd0ZXN0L3Rlc3QudHh0Jyk7XG5cblx0XHRwID0gJ3Rlc3QoLnR4dCc7XG5cdFx0YXNzZXJ0R2xvYk1hdGNoKHAsICd0ZXN0KC50eHQnKTtcblx0XHRhc3NlcnROb0dsb2JNYXRjaChwLCAndGVzdD90eHQnKTtcblxuXHRcdHAgPSAncXVuaXQnO1xuXG5cdFx0YXNzZXJ0R2xvYk1hdGNoKHAsICdxdW5pdCcpO1xuXHRcdGFzc2VydE5vR2xvYk1hdGNoKHAsICdxdW5pdC5jc3MnKTtcblx0XHRhc3NlcnROb0dsb2JNYXRjaChwLCAndGVzdC9xdW5pdCcpO1xuXG5cdFx0Ly8gQWJzb2x1dGVcblxuXHRcdHAgPSAnL0ROWENvbnNvbGVBcHAvKiovKi5jcyc7XG5cdFx0YXNzZXJ0R2xvYk1hdGNoKHAsICcvRE5YQ29uc29sZUFwcC9Qcm9ncmFtLmNzJyk7XG5cdFx0YXNzZXJ0R2xvYk1hdGNoKHAsICcvRE5YQ29uc29sZUFwcC9mb28vUHJvZ3JhbS5jcycpO1xuXG5cdFx0cCA9ICdDOi9ETlhDb25zb2xlQXBwLyoqLyouY3MnO1xuXHRcdGFzc2VydEdsb2JNYXRjaChwLCAnQzpcXFxcRE5YQ29uc29sZUFwcFxcXFxQcm9ncmFtLmNzJyk7XG5cdFx0YXNzZXJ0R2xvYk1hdGNoKHAsICdDOlxcXFxETlhDb25zb2xlQXBwXFxcXGZvb1xcXFxQcm9ncmFtLmNzJyk7XG5cblx0XHRwID0gJyonO1xuXHRcdGFzc2VydEdsb2JNYXRjaChwLCAnJyk7XG5cdH0pO1xuXG5cdHRlc3QoJ2RvdCBoaWRkZW4nLCBmdW5jdGlvbiAoKSB7XG5cdFx0bGV0IHAgPSAnLionO1xuXG5cdFx0YXNzZXJ0R2xvYk1hdGNoKHAsICcuZ2l0Jyk7XG5cdFx0YXNzZXJ0R2xvYk1hdGNoKHAsICcuaGlkZGVuLnR4dCcpO1xuXHRcdGFzc2VydE5vR2xvYk1hdGNoKHAsICdnaXQnKTtcblx0XHRhc3NlcnROb0dsb2JNYXRjaChwLCAnaGlkZGVuLnR4dCcpO1xuXHRcdGFzc2VydE5vR2xvYk1hdGNoKHAsICdwYXRoLy5naXQnKTtcblx0XHRhc3NlcnROb0dsb2JNYXRjaChwLCAncGF0aC8uaGlkZGVuLnR4dCcpO1xuXG5cdFx0cCA9ICcqKi8uKic7XG5cdFx0YXNzZXJ0R2xvYk1hdGNoKHAsICcuZ2l0Jyk7XG5cdFx0YXNzZXJ0R2xvYk1hdGNoKHAsICcvLmdpdCcpO1xuXHRcdGFzc2VydEdsb2JNYXRjaChwLCAnLmhpZGRlbi50eHQnKTtcblx0XHRhc3NlcnROb0dsb2JNYXRjaChwLCAnZ2l0Jyk7XG5cdFx0YXNzZXJ0Tm9HbG9iTWF0Y2gocCwgJ2hpZGRlbi50eHQnKTtcblx0XHRhc3NlcnRHbG9iTWF0Y2gocCwgJ3BhdGgvLmdpdCcpO1xuXHRcdGFzc2VydEdsb2JNYXRjaChwLCAncGF0aC8uaGlkZGVuLnR4dCcpO1xuXHRcdGFzc2VydEdsb2JNYXRjaChwLCAnL3BhdGgvLmdpdCcpO1xuXHRcdGFzc2VydEdsb2JNYXRjaChwLCAnL3BhdGgvLmhpZGRlbi50eHQnKTtcblx0XHRhc3NlcnROb0dsb2JNYXRjaChwLCAncGF0aC9naXQnKTtcblx0XHRhc3NlcnROb0dsb2JNYXRjaChwLCAncGF0LmgvaGlkZGVuLnR4dCcpO1xuXG5cdFx0cCA9ICcuXyonO1xuXG5cdFx0YXNzZXJ0R2xvYk1hdGNoKHAsICcuX2dpdCcpO1xuXHRcdGFzc2VydEdsb2JNYXRjaChwLCAnLl9oaWRkZW4udHh0Jyk7XG5cdFx0YXNzZXJ0Tm9HbG9iTWF0Y2gocCwgJ2dpdCcpO1xuXHRcdGFzc2VydE5vR2xvYk1hdGNoKHAsICdoaWRkZW4udHh0Jyk7XG5cdFx0YXNzZXJ0Tm9HbG9iTWF0Y2gocCwgJ3BhdGgvLl9naXQnKTtcblx0XHRhc3NlcnROb0dsb2JNYXRjaChwLCAncGF0aC8uX2hpZGRlbi50eHQnKTtcblxuXHRcdHAgPSAnKiovLl8qJztcblx0XHRhc3NlcnRHbG9iTWF0Y2gocCwgJy5fZ2l0Jyk7XG5cdFx0YXNzZXJ0R2xvYk1hdGNoKHAsICcuX2hpZGRlbi50eHQnKTtcblx0XHRhc3NlcnROb0dsb2JNYXRjaChwLCAnZ2l0Jyk7XG5cdFx0YXNzZXJ0Tm9HbG9iTWF0Y2gocCwgJ2hpZGRlbi5fdHh0Jyk7XG5cdFx0YXNzZXJ0R2xvYk1hdGNoKHAsICdwYXRoLy5fZ2l0Jyk7XG5cdFx0YXNzZXJ0R2xvYk1hdGNoKHAsICdwYXRoLy5faGlkZGVuLnR4dCcpO1xuXHRcdGFzc2VydEdsb2JNYXRjaChwLCAnL3BhdGgvLl9naXQnKTtcblx0XHRhc3NlcnRHbG9iTWF0Y2gocCwgJy9wYXRoLy5faGlkZGVuLnR4dCcpO1xuXHRcdGFzc2VydE5vR2xvYk1hdGNoKHAsICdwYXRoL2dpdCcpO1xuXHRcdGFzc2VydE5vR2xvYk1hdGNoKHAsICdwYXQuaC9oaWRkZW4uX3R4dCcpO1xuXHR9KTtcblxuXHR0ZXN0KCdmaWxlIHBhdHRlcm4nLCBmdW5jdGlvbiAoKSB7XG5cdFx0bGV0IHAgPSAnKi5qcyc7XG5cblx0XHRhc3NlcnRHbG9iTWF0Y2gocCwgJ2Zvby5qcycpO1xuXHRcdGFzc2VydE5vR2xvYk1hdGNoKHAsICdmb2xkZXIvZm9vLmpzJyk7XG5cdFx0YXNzZXJ0Tm9HbG9iTWF0Y2gocCwgJy9ub2RlX21vZHVsZXMvZm9vLmpzJyk7XG5cdFx0YXNzZXJ0Tm9HbG9iTWF0Y2gocCwgJ2Zvby5qc3MnKTtcblx0XHRhc3NlcnROb0dsb2JNYXRjaChwLCAnc29tZS5qcy90ZXN0Jyk7XG5cblx0XHRwID0gJ2h0bWwuKic7XG5cdFx0YXNzZXJ0R2xvYk1hdGNoKHAsICdodG1sLmpzJyk7XG5cdFx0YXNzZXJ0R2xvYk1hdGNoKHAsICdodG1sLnR4dCcpO1xuXHRcdGFzc2VydE5vR2xvYk1hdGNoKHAsICdodG0udHh0Jyk7XG5cblx0XHRwID0gJyouKic7XG5cdFx0YXNzZXJ0R2xvYk1hdGNoKHAsICdodG1sLmpzJyk7XG5cdFx0YXNzZXJ0R2xvYk1hdGNoKHAsICdodG1sLnR4dCcpO1xuXHRcdGFzc2VydEdsb2JNYXRjaChwLCAnaHRtLnR4dCcpO1xuXHRcdGFzc2VydE5vR2xvYk1hdGNoKHAsICdmb2xkZXIvZm9vLmpzJyk7XG5cdFx0YXNzZXJ0Tm9HbG9iTWF0Y2gocCwgJy9ub2RlX21vZHVsZXMvZm9vLmpzJyk7XG5cblx0XHRwID0gJ25vZGVfbW9kdWxlcy90ZXN0LyouanMnO1xuXHRcdGFzc2VydEdsb2JNYXRjaChwLCAnbm9kZV9tb2R1bGVzL3Rlc3QvZm9vLmpzJyk7XG5cdFx0YXNzZXJ0Tm9HbG9iTWF0Y2gocCwgJ2ZvbGRlci9mb28uanMnKTtcblx0XHRhc3NlcnROb0dsb2JNYXRjaChwLCAnL25vZGVfbW9kdWxlL3Rlc3QvZm9vLmpzJyk7XG5cdFx0YXNzZXJ0Tm9HbG9iTWF0Y2gocCwgJ2Zvby5qc3MnKTtcblx0XHRhc3NlcnROb0dsb2JNYXRjaChwLCAnc29tZS5qcy90ZXN0Jyk7XG5cdH0pO1xuXG5cdHRlc3QoJ3N0YXInLCAoKSA9PiB7XG5cdFx0bGV0IHAgPSAnbm9kZSptb2R1bGVzJztcblxuXHRcdGFzc2VydEdsb2JNYXRjaChwLCAnbm9kZV9tb2R1bGVzJyk7XG5cdFx0YXNzZXJ0R2xvYk1hdGNoKHAsICdub2RlX3N1cGVyX21vZHVsZXMnKTtcblx0XHRhc3NlcnROb0dsb2JNYXRjaChwLCAnbm9kZV9tb2R1bGUnKTtcblx0XHRhc3NlcnROb0dsb2JNYXRjaChwLCAnL25vZGVfbW9kdWxlcycpO1xuXHRcdGFzc2VydE5vR2xvYk1hdGNoKHAsICd0ZXN0L25vZGVfbW9kdWxlcycpO1xuXG5cdFx0cCA9ICcqJztcblx0XHRhc3NlcnRHbG9iTWF0Y2gocCwgJ2h0bWwuanMnKTtcblx0XHRhc3NlcnRHbG9iTWF0Y2gocCwgJ2h0bWwudHh0Jyk7XG5cdFx0YXNzZXJ0R2xvYk1hdGNoKHAsICdodG0udHh0Jyk7XG5cdFx0YXNzZXJ0Tm9HbG9iTWF0Y2gocCwgJ2ZvbGRlci9mb28uanMnKTtcblx0XHRhc3NlcnROb0dsb2JNYXRjaChwLCAnL25vZGVfbW9kdWxlcy9mb28uanMnKTtcblx0fSk7XG5cblx0dGVzdCgnZmlsZSAvIGZvbGRlciBtYXRjaCcsIGZ1bmN0aW9uICgpIHtcblx0XHRjb25zdCBwID0gJyoqL25vZGVfbW9kdWxlcy8qKic7XG5cblx0XHRhc3NlcnRHbG9iTWF0Y2gocCwgJ25vZGVfbW9kdWxlcycpO1xuXHRcdGFzc2VydEdsb2JNYXRjaChwLCAnbm9kZV9tb2R1bGVzLycpO1xuXHRcdGFzc2VydEdsb2JNYXRjaChwLCAnYS9ub2RlX21vZHVsZXMnKTtcblx0XHRhc3NlcnRHbG9iTWF0Y2gocCwgJ2Evbm9kZV9tb2R1bGVzLycpO1xuXHRcdGFzc2VydEdsb2JNYXRjaChwLCAnbm9kZV9tb2R1bGVzL2ZvbycpO1xuXHRcdGFzc2VydEdsb2JNYXRjaChwLCAnZm9vL25vZGVfbW9kdWxlcy9mb28vYmFyJyk7XG5cblx0XHRhc3NlcnRHbG9iTWF0Y2gocCwgJy9ub2RlX21vZHVsZXMnKTtcblx0XHRhc3NlcnRHbG9iTWF0Y2gocCwgJy9ub2RlX21vZHVsZXMvJyk7XG5cdFx0YXNzZXJ0R2xvYk1hdGNoKHAsICcvYS9ub2RlX21vZHVsZXMnKTtcblx0XHRhc3NlcnRHbG9iTWF0Y2gocCwgJy9hL25vZGVfbW9kdWxlcy8nKTtcblx0XHRhc3NlcnRHbG9iTWF0Y2gocCwgJy9ub2RlX21vZHVsZXMvZm9vJyk7XG5cdFx0YXNzZXJ0R2xvYk1hdGNoKHAsICcvZm9vL25vZGVfbW9kdWxlcy9mb28vYmFyJyk7XG5cdH0pO1xuXG5cdHRlc3QoJ3F1ZXN0aW9ubWFyaycsICgpID0+IHtcblx0XHRsZXQgcCA9ICdub2RlP21vZHVsZXMnO1xuXG5cdFx0YXNzZXJ0R2xvYk1hdGNoKHAsICdub2RlX21vZHVsZXMnKTtcblx0XHRhc3NlcnROb0dsb2JNYXRjaChwLCAnbm9kZV9zdXBlcl9tb2R1bGVzJyk7XG5cdFx0YXNzZXJ0Tm9HbG9iTWF0Y2gocCwgJ25vZGVfbW9kdWxlJyk7XG5cdFx0YXNzZXJ0Tm9HbG9iTWF0Y2gocCwgJy9ub2RlX21vZHVsZXMnKTtcblx0XHRhc3NlcnROb0dsb2JNYXRjaChwLCAndGVzdC9ub2RlX21vZHVsZXMnKTtcblxuXHRcdHAgPSAnPyc7XG5cdFx0YXNzZXJ0R2xvYk1hdGNoKHAsICdoJyk7XG5cdFx0YXNzZXJ0Tm9HbG9iTWF0Y2gocCwgJ2h0bWwudHh0Jyk7XG5cdFx0YXNzZXJ0Tm9HbG9iTWF0Y2gocCwgJ2h0bS50eHQnKTtcblx0XHRhc3NlcnROb0dsb2JNYXRjaChwLCAnZm9sZGVyL2Zvby5qcycpO1xuXHRcdGFzc2VydE5vR2xvYk1hdGNoKHAsICcvbm9kZV9tb2R1bGVzL2Zvby5qcycpO1xuXHR9KTtcblxuXHR0ZXN0KCdnbG9ic3RhcicsICgpID0+IHtcblx0XHRsZXQgcCA9ICcqKi8qLmpzJztcblxuXHRcdGFzc2VydEdsb2JNYXRjaChwLCAnZm9vLmpzJyk7XG5cdFx0YXNzZXJ0R2xvYk1hdGNoKHAsICcvZm9vLmpzJyk7XG5cdFx0YXNzZXJ0R2xvYk1hdGNoKHAsICdmb2xkZXIvZm9vLmpzJyk7XG5cdFx0YXNzZXJ0R2xvYk1hdGNoKHAsICcvbm9kZV9tb2R1bGVzL2Zvby5qcycpO1xuXHRcdGFzc2VydE5vR2xvYk1hdGNoKHAsICdmb28uanNzJyk7XG5cdFx0YXNzZXJ0Tm9HbG9iTWF0Y2gocCwgJ3NvbWUuanMvdGVzdCcpO1xuXHRcdGFzc2VydE5vR2xvYk1hdGNoKHAsICcvc29tZS5qcy90ZXN0Jyk7XG5cdFx0YXNzZXJ0Tm9HbG9iTWF0Y2gocCwgJ1xcXFxzb21lLmpzXFxcXHRlc3QnKTtcblxuXHRcdHAgPSAnKiovcHJvamVjdC5qc29uJztcblxuXHRcdGFzc2VydEdsb2JNYXRjaChwLCAncHJvamVjdC5qc29uJyk7XG5cdFx0YXNzZXJ0R2xvYk1hdGNoKHAsICcvcHJvamVjdC5qc29uJyk7XG5cdFx0YXNzZXJ0R2xvYk1hdGNoKHAsICdzb21lL2ZvbGRlci9wcm9qZWN0Lmpzb24nKTtcblx0XHRhc3NlcnRHbG9iTWF0Y2gocCwgJy9zb21lL2ZvbGRlci9wcm9qZWN0Lmpzb24nKTtcblx0XHRhc3NlcnROb0dsb2JNYXRjaChwLCAnc29tZS9mb2xkZXIvZmlsZV9wcm9qZWN0Lmpzb24nKTtcblx0XHRhc3NlcnROb0dsb2JNYXRjaChwLCAnc29tZS9mb2xkZXIvZmlsZXByb2plY3QuanNvbicpO1xuXHRcdGFzc2VydE5vR2xvYk1hdGNoKHAsICdzb21lL3JycHJvamVjdC5qc29uJyk7XG5cdFx0YXNzZXJ0Tm9HbG9iTWF0Y2gocCwgJ3NvbWVcXFxccnJwcm9qZWN0Lmpzb24nKTtcblxuXHRcdHAgPSAndGVzdC8qKic7XG5cdFx0YXNzZXJ0R2xvYk1hdGNoKHAsICd0ZXN0Jyk7XG5cdFx0YXNzZXJ0R2xvYk1hdGNoKHAsICd0ZXN0L2ZvbycpO1xuXHRcdGFzc2VydEdsb2JNYXRjaChwLCAndGVzdC9mb28vJyk7XG5cdFx0YXNzZXJ0R2xvYk1hdGNoKHAsICd0ZXN0L2Zvby5qcycpO1xuXHRcdGFzc2VydEdsb2JNYXRjaChwLCAndGVzdC9vdGhlci9mb28uanMnKTtcblx0XHRhc3NlcnROb0dsb2JNYXRjaChwLCAnZXN0L290aGVyL2Zvby5qcycpO1xuXG5cdFx0cCA9ICcqKic7XG5cdFx0YXNzZXJ0R2xvYk1hdGNoKHAsICcvJyk7XG5cdFx0YXNzZXJ0R2xvYk1hdGNoKHAsICdmb28uanMnKTtcblx0XHRhc3NlcnRHbG9iTWF0Y2gocCwgJ2ZvbGRlci9mb28uanMnKTtcblx0XHRhc3NlcnRHbG9iTWF0Y2gocCwgJ2ZvbGRlci9mb28vJyk7XG5cdFx0YXNzZXJ0R2xvYk1hdGNoKHAsICcvbm9kZV9tb2R1bGVzL2Zvby5qcycpO1xuXHRcdGFzc2VydEdsb2JNYXRjaChwLCAnZm9vLmpzcycpO1xuXHRcdGFzc2VydEdsb2JNYXRjaChwLCAnc29tZS5qcy90ZXN0Jyk7XG5cblx0XHRwID0gJ3Rlc3QvKiovKi5qcyc7XG5cdFx0YXNzZXJ0R2xvYk1hdGNoKHAsICd0ZXN0L2Zvby5qcycpO1xuXHRcdGFzc2VydEdsb2JNYXRjaChwLCAndGVzdC9vdGhlci9mb28uanMnKTtcblx0XHRhc3NlcnRHbG9iTWF0Y2gocCwgJ3Rlc3Qvb3RoZXIvbW9yZS9mb28uanMnKTtcblx0XHRhc3NlcnROb0dsb2JNYXRjaChwLCAndGVzdC9mb28udHMnKTtcblx0XHRhc3NlcnROb0dsb2JNYXRjaChwLCAndGVzdC9vdGhlci9mb28udHMnKTtcblx0XHRhc3NlcnROb0dsb2JNYXRjaChwLCAndGVzdC9vdGhlci9tb3JlL2Zvby50cycpO1xuXG5cdFx0cCA9ICcqKi8qKi8qLmpzJztcblxuXHRcdGFzc2VydEdsb2JNYXRjaChwLCAnZm9vLmpzJyk7XG5cdFx0YXNzZXJ0R2xvYk1hdGNoKHAsICcvZm9vLmpzJyk7XG5cdFx0YXNzZXJ0R2xvYk1hdGNoKHAsICdmb2xkZXIvZm9vLmpzJyk7XG5cdFx0YXNzZXJ0R2xvYk1hdGNoKHAsICcvbm9kZV9tb2R1bGVzL2Zvby5qcycpO1xuXHRcdGFzc2VydE5vR2xvYk1hdGNoKHAsICdmb28uanNzJyk7XG5cdFx0YXNzZXJ0Tm9HbG9iTWF0Y2gocCwgJ3NvbWUuanMvdGVzdCcpO1xuXG5cdFx0cCA9ICcqKi9ub2RlX21vZHVsZXMvKiovKi5qcyc7XG5cblx0XHRhc3NlcnROb0dsb2JNYXRjaChwLCAnZm9vLmpzJyk7XG5cdFx0YXNzZXJ0Tm9HbG9iTWF0Y2gocCwgJ2ZvbGRlci9mb28uanMnKTtcblx0XHRhc3NlcnRHbG9iTWF0Y2gocCwgJ25vZGVfbW9kdWxlcy9mb28uanMnKTtcblx0XHRhc3NlcnRHbG9iTWF0Y2gocCwgJy9ub2RlX21vZHVsZXMvZm9vLmpzJyk7XG5cdFx0YXNzZXJ0R2xvYk1hdGNoKHAsICdub2RlX21vZHVsZXMvc29tZS9mb2xkZXIvZm9vLmpzJyk7XG5cdFx0YXNzZXJ0R2xvYk1hdGNoKHAsICcvbm9kZV9tb2R1bGVzL3NvbWUvZm9sZGVyL2Zvby5qcycpO1xuXHRcdGFzc2VydE5vR2xvYk1hdGNoKHAsICdub2RlX21vZHVsZXMvc29tZS9mb2xkZXIvZm9vLnRzJyk7XG5cdFx0YXNzZXJ0Tm9HbG9iTWF0Y2gocCwgJ2Zvby5qc3MnKTtcblx0XHRhc3NlcnROb0dsb2JNYXRjaChwLCAnc29tZS5qcy90ZXN0Jyk7XG5cblx0XHRwID0gJ3sqKi9ub2RlX21vZHVsZXMvKiosKiovLmdpdC8qKiwqKi9ib3dlcl9jb21wb25lbnRzLyoqfSc7XG5cblx0XHRhc3NlcnRHbG9iTWF0Y2gocCwgJ25vZGVfbW9kdWxlcycpO1xuXHRcdGFzc2VydEdsb2JNYXRjaChwLCAnL25vZGVfbW9kdWxlcycpO1xuXHRcdGFzc2VydEdsb2JNYXRjaChwLCAnL25vZGVfbW9kdWxlcy9tb3JlJyk7XG5cdFx0YXNzZXJ0R2xvYk1hdGNoKHAsICdzb21lL3Rlc3Qvbm9kZV9tb2R1bGVzJyk7XG5cdFx0YXNzZXJ0R2xvYk1hdGNoKHAsICdzb21lXFxcXHRlc3RcXFxcbm9kZV9tb2R1bGVzJyk7XG5cdFx0YXNzZXJ0R2xvYk1hdGNoKHAsICcvc29tZS90ZXN0L25vZGVfbW9kdWxlcycpO1xuXHRcdGFzc2VydEdsb2JNYXRjaChwLCAnXFxcXHNvbWVcXFxcdGVzdFxcXFxub2RlX21vZHVsZXMnKTtcblx0XHRhc3NlcnRHbG9iTWF0Y2gocCwgJ0M6XFxcXFxcXFxzb21lXFxcXHRlc3RcXFxcbm9kZV9tb2R1bGVzJyk7XG5cdFx0YXNzZXJ0R2xvYk1hdGNoKHAsICdDOlxcXFxcXFxcc29tZVxcXFx0ZXN0XFxcXG5vZGVfbW9kdWxlc1xcXFxtb3JlJyk7XG5cblx0XHRhc3NlcnRHbG9iTWF0Y2gocCwgJ2Jvd2VyX2NvbXBvbmVudHMnKTtcblx0XHRhc3NlcnRHbG9iTWF0Y2gocCwgJ2Jvd2VyX2NvbXBvbmVudHMvbW9yZScpO1xuXHRcdGFzc2VydEdsb2JNYXRjaChwLCAnL2Jvd2VyX2NvbXBvbmVudHMnKTtcblx0XHRhc3NlcnRHbG9iTWF0Y2gocCwgJ3NvbWUvdGVzdC9ib3dlcl9jb21wb25lbnRzJyk7XG5cdFx0YXNzZXJ0R2xvYk1hdGNoKHAsICdzb21lXFxcXHRlc3RcXFxcYm93ZXJfY29tcG9uZW50cycpO1xuXHRcdGFzc2VydEdsb2JNYXRjaChwLCAnL3NvbWUvdGVzdC9ib3dlcl9jb21wb25lbnRzJyk7XG5cdFx0YXNzZXJ0R2xvYk1hdGNoKHAsICdcXFxcc29tZVxcXFx0ZXN0XFxcXGJvd2VyX2NvbXBvbmVudHMnKTtcblx0XHRhc3NlcnRHbG9iTWF0Y2gocCwgJ0M6XFxcXFxcXFxzb21lXFxcXHRlc3RcXFxcYm93ZXJfY29tcG9uZW50cycpO1xuXHRcdGFzc2VydEdsb2JNYXRjaChwLCAnQzpcXFxcXFxcXHNvbWVcXFxcdGVzdFxcXFxib3dlcl9jb21wb25lbnRzXFxcXG1vcmUnKTtcblxuXHRcdGFzc2VydEdsb2JNYXRjaChwLCAnLmdpdCcpO1xuXHRcdGFzc2VydEdsb2JNYXRjaChwLCAnLy5naXQnKTtcblx0XHRhc3NlcnRHbG9iTWF0Y2gocCwgJ3NvbWUvdGVzdC8uZ2l0Jyk7XG5cdFx0YXNzZXJ0R2xvYk1hdGNoKHAsICdzb21lXFxcXHRlc3RcXFxcLmdpdCcpO1xuXHRcdGFzc2VydEdsb2JNYXRjaChwLCAnL3NvbWUvdGVzdC8uZ2l0Jyk7XG5cdFx0YXNzZXJ0R2xvYk1hdGNoKHAsICdcXFxcc29tZVxcXFx0ZXN0XFxcXC5naXQnKTtcblx0XHRhc3NlcnRHbG9iTWF0Y2gocCwgJ0M6XFxcXFxcXFxzb21lXFxcXHRlc3RcXFxcLmdpdCcpO1xuXG5cdFx0YXNzZXJ0Tm9HbG9iTWF0Y2gocCwgJ3RlbXB0aW5nJyk7XG5cdFx0YXNzZXJ0Tm9HbG9iTWF0Y2gocCwgJy90ZW1wdGluZycpO1xuXHRcdGFzc2VydE5vR2xvYk1hdGNoKHAsICdzb21lL3Rlc3QvdGVtcHRpbmcnKTtcblx0XHRhc3NlcnROb0dsb2JNYXRjaChwLCAnc29tZVxcXFx0ZXN0XFxcXHRlbXB0aW5nJyk7XG5cdFx0YXNzZXJ0Tm9HbG9iTWF0Y2gocCwgJy9zb21lL3Rlc3QvdGVtcHRpbmcnKTtcblx0XHRhc3NlcnROb0dsb2JNYXRjaChwLCAnXFxcXHNvbWVcXFxcdGVzdFxcXFx0ZW1wdGluZycpO1xuXHRcdGFzc2VydE5vR2xvYk1hdGNoKHAsICdDOlxcXFxcXFxcc29tZVxcXFx0ZXN0XFxcXHRlbXB0aW5nJyk7XG5cblx0XHRwID0gJ3sqKi9wYWNrYWdlLmpzb24sKiovcHJvamVjdC5qc29ufSc7XG5cdFx0YXNzZXJ0R2xvYk1hdGNoKHAsICdwYWNrYWdlLmpzb24nKTtcblx0XHRhc3NlcnRHbG9iTWF0Y2gocCwgJy9wYWNrYWdlLmpzb24nKTtcblx0XHRhc3NlcnROb0dsb2JNYXRjaChwLCAneHBhY2thZ2UuanNvbicpO1xuXHRcdGFzc2VydE5vR2xvYk1hdGNoKHAsICcveHBhY2thZ2UuanNvbicpO1xuXHR9KTtcblxuXHR0ZXN0KCdpc3N1ZSA0MTcyNCcsIGZ1bmN0aW9uICgpIHtcblx0XHRsZXQgcCA9ICdzb21lLyoqLyouanMnO1xuXG5cdFx0YXNzZXJ0R2xvYk1hdGNoKHAsICdzb21lL2Zvby5qcycpO1xuXHRcdGFzc2VydEdsb2JNYXRjaChwLCAnc29tZS9mb2xkZXIvZm9vLmpzJyk7XG5cdFx0YXNzZXJ0Tm9HbG9iTWF0Y2gocCwgJ3NvbWV0aGluZy9mb28uanMnKTtcblx0XHRhc3NlcnROb0dsb2JNYXRjaChwLCAnc29tZXRoaW5nL2ZvbGRlci9mb28uanMnKTtcblxuXHRcdHAgPSAnc29tZS8qKi8qJztcblxuXHRcdGFzc2VydEdsb2JNYXRjaChwLCAnc29tZS9mb28uanMnKTtcblx0XHRhc3NlcnRHbG9iTWF0Y2gocCwgJ3NvbWUvZm9sZGVyL2Zvby5qcycpO1xuXHRcdGFzc2VydE5vR2xvYk1hdGNoKHAsICdzb21ldGhpbmcvZm9vLmpzJyk7XG5cdFx0YXNzZXJ0Tm9HbG9iTWF0Y2gocCwgJ3NvbWV0aGluZy9mb2xkZXIvZm9vLmpzJyk7XG5cdH0pO1xuXG5cdHRlc3QoJ2JyYWNlIGV4cGFuc2lvbicsIGZ1bmN0aW9uICgpIHtcblx0XHRsZXQgcCA9ICcqLntodG1sLGpzfSc7XG5cblx0XHRhc3NlcnRHbG9iTWF0Y2gocCwgJ2Zvby5qcycpO1xuXHRcdGFzc2VydEdsb2JNYXRjaChwLCAnZm9vLmh0bWwnKTtcblx0XHRhc3NlcnROb0dsb2JNYXRjaChwLCAnZm9sZGVyL2Zvby5qcycpO1xuXHRcdGFzc2VydE5vR2xvYk1hdGNoKHAsICcvbm9kZV9tb2R1bGVzL2Zvby5qcycpO1xuXHRcdGFzc2VydE5vR2xvYk1hdGNoKHAsICdmb28uanNzJyk7XG5cdFx0YXNzZXJ0Tm9HbG9iTWF0Y2gocCwgJ3NvbWUuanMvdGVzdCcpO1xuXG5cdFx0cCA9ICcqLntodG1sfSc7XG5cblx0XHRhc3NlcnRHbG9iTWF0Y2gocCwgJ2Zvby5odG1sJyk7XG5cdFx0YXNzZXJ0Tm9HbG9iTWF0Y2gocCwgJ2Zvby5qcycpO1xuXHRcdGFzc2VydE5vR2xvYk1hdGNoKHAsICdmb2xkZXIvZm9vLmpzJyk7XG5cdFx0YXNzZXJ0Tm9HbG9iTWF0Y2gocCwgJy9ub2RlX21vZHVsZXMvZm9vLmpzJyk7XG5cdFx0YXNzZXJ0Tm9HbG9iTWF0Y2gocCwgJ2Zvby5qc3MnKTtcblx0XHRhc3NlcnROb0dsb2JNYXRjaChwLCAnc29tZS5qcy90ZXN0Jyk7XG5cblx0XHRwID0gJ3tub2RlX21vZHVsZXMsdGVzdGluZ30nO1xuXHRcdGFzc2VydEdsb2JNYXRjaChwLCAnbm9kZV9tb2R1bGVzJyk7XG5cdFx0YXNzZXJ0R2xvYk1hdGNoKHAsICd0ZXN0aW5nJyk7XG5cdFx0YXNzZXJ0Tm9HbG9iTWF0Y2gocCwgJ25vZGVfbW9kdWxlJyk7XG5cdFx0YXNzZXJ0Tm9HbG9iTWF0Y2gocCwgJ2R0ZXN0aW5nJyk7XG5cblx0XHRwID0gJyoqL3tmb28sYmFyfSc7XG5cdFx0YXNzZXJ0R2xvYk1hdGNoKHAsICdmb28nKTtcblx0XHRhc3NlcnRHbG9iTWF0Y2gocCwgJ2JhcicpO1xuXHRcdGFzc2VydEdsb2JNYXRjaChwLCAndGVzdC9mb28nKTtcblx0XHRhc3NlcnRHbG9iTWF0Y2gocCwgJ3Rlc3QvYmFyJyk7XG5cdFx0YXNzZXJ0R2xvYk1hdGNoKHAsICdvdGhlci9tb3JlL2ZvbycpO1xuXHRcdGFzc2VydEdsb2JNYXRjaChwLCAnb3RoZXIvbW9yZS9iYXInKTtcblx0XHRhc3NlcnRHbG9iTWF0Y2gocCwgJy9mb28nKTtcblx0XHRhc3NlcnRHbG9iTWF0Y2gocCwgJy9iYXInKTtcblx0XHRhc3NlcnRHbG9iTWF0Y2gocCwgJy90ZXN0L2ZvbycpO1xuXHRcdGFzc2VydEdsb2JNYXRjaChwLCAnL3Rlc3QvYmFyJyk7XG5cdFx0YXNzZXJ0R2xvYk1hdGNoKHAsICcvb3RoZXIvbW9yZS9mb28nKTtcblx0XHRhc3NlcnRHbG9iTWF0Y2gocCwgJy9vdGhlci9tb3JlL2JhcicpO1xuXG5cdFx0cCA9ICd7Zm9vLGJhcn0vKionO1xuXHRcdGFzc2VydEdsb2JNYXRjaChwLCAnZm9vJyk7XG5cdFx0YXNzZXJ0R2xvYk1hdGNoKHAsICdiYXInKTtcblx0XHRhc3NlcnRHbG9iTWF0Y2gocCwgJ2Jhci8nKTtcblx0XHRhc3NlcnRHbG9iTWF0Y2gocCwgJ2Zvby90ZXN0Jyk7XG5cdFx0YXNzZXJ0R2xvYk1hdGNoKHAsICdiYXIvdGVzdCcpO1xuXHRcdGFzc2VydEdsb2JNYXRjaChwLCAnYmFyL3Rlc3QvJyk7XG5cdFx0YXNzZXJ0R2xvYk1hdGNoKHAsICdmb28vb3RoZXIvbW9yZScpO1xuXHRcdGFzc2VydEdsb2JNYXRjaChwLCAnYmFyL290aGVyL21vcmUnKTtcblx0XHRhc3NlcnRHbG9iTWF0Y2gocCwgJ2Jhci9vdGhlci9tb3JlLycpO1xuXG5cdFx0cCA9ICd7KiovKi5kLnRzLCoqLyouanN9JztcblxuXHRcdGFzc2VydEdsb2JNYXRjaChwLCAnZm9vLmpzJyk7XG5cdFx0YXNzZXJ0R2xvYk1hdGNoKHAsICd0ZXN0aW5nL2Zvby5qcycpO1xuXHRcdGFzc2VydEdsb2JNYXRjaChwLCAndGVzdGluZ1xcXFxmb28uanMnKTtcblx0XHRhc3NlcnRHbG9iTWF0Y2gocCwgJy90ZXN0aW5nL2Zvby5qcycpO1xuXHRcdGFzc2VydEdsb2JNYXRjaChwLCAnXFxcXHRlc3RpbmdcXFxcZm9vLmpzJyk7XG5cdFx0YXNzZXJ0R2xvYk1hdGNoKHAsICdDOlxcXFx0ZXN0aW5nXFxcXGZvby5qcycpO1xuXG5cdFx0YXNzZXJ0R2xvYk1hdGNoKHAsICdmb28uZC50cycpO1xuXHRcdGFzc2VydEdsb2JNYXRjaChwLCAndGVzdGluZy9mb28uZC50cycpO1xuXHRcdGFzc2VydEdsb2JNYXRjaChwLCAndGVzdGluZ1xcXFxmb28uZC50cycpO1xuXHRcdGFzc2VydEdsb2JNYXRjaChwLCAnL3Rlc3RpbmcvZm9vLmQudHMnKTtcblx0XHRhc3NlcnRHbG9iTWF0Y2gocCwgJ1xcXFx0ZXN0aW5nXFxcXGZvby5kLnRzJyk7XG5cdFx0YXNzZXJ0R2xvYk1hdGNoKHAsICdDOlxcXFx0ZXN0aW5nXFxcXGZvby5kLnRzJyk7XG5cblx0XHRhc3NlcnROb0dsb2JNYXRjaChwLCAnZm9vLmQnKTtcblx0XHRhc3NlcnROb0dsb2JNYXRjaChwLCAndGVzdGluZy9mb28uZCcpO1xuXHRcdGFzc2VydE5vR2xvYk1hdGNoKHAsICd0ZXN0aW5nXFxcXGZvby5kJyk7XG5cdFx0YXNzZXJ0Tm9HbG9iTWF0Y2gocCwgJy90ZXN0aW5nL2Zvby5kJyk7XG5cdFx0YXNzZXJ0Tm9HbG9iTWF0Y2gocCwgJ1xcXFx0ZXN0aW5nXFxcXGZvby5kJyk7XG5cdFx0YXNzZXJ0Tm9HbG9iTWF0Y2gocCwgJ0M6XFxcXHRlc3RpbmdcXFxcZm9vLmQnKTtcblxuXHRcdHAgPSAneyoqLyouZC50cywqKi8qLmpzLHBhdGgvc2ltcGxlLmpnc30nO1xuXG5cdFx0YXNzZXJ0R2xvYk1hdGNoKHAsICdmb28uanMnKTtcblx0XHRhc3NlcnRHbG9iTWF0Y2gocCwgJ3Rlc3RpbmcvZm9vLmpzJyk7XG5cdFx0YXNzZXJ0R2xvYk1hdGNoKHAsICd0ZXN0aW5nXFxcXGZvby5qcycpO1xuXHRcdGFzc2VydEdsb2JNYXRjaChwLCAnL3Rlc3RpbmcvZm9vLmpzJyk7XG5cdFx0YXNzZXJ0R2xvYk1hdGNoKHAsICdwYXRoL3NpbXBsZS5qZ3MnKTtcblx0XHRhc3NlcnROb0dsb2JNYXRjaChwLCAnL3BhdGgvc2ltcGxlLmpncycpO1xuXHRcdGFzc2VydEdsb2JNYXRjaChwLCAnXFxcXHRlc3RpbmdcXFxcZm9vLmpzJyk7XG5cdFx0YXNzZXJ0R2xvYk1hdGNoKHAsICdDOlxcXFx0ZXN0aW5nXFxcXGZvby5qcycpO1xuXG5cdFx0cCA9ICd7KiovKi5kLnRzLCoqLyouanMsZm9vLlswLTldfSc7XG5cblx0XHRhc3NlcnRHbG9iTWF0Y2gocCwgJ2Zvby41Jyk7XG5cdFx0YXNzZXJ0R2xvYk1hdGNoKHAsICdmb28uOCcpO1xuXHRcdGFzc2VydE5vR2xvYk1hdGNoKHAsICdiYXIuNScpO1xuXHRcdGFzc2VydE5vR2xvYk1hdGNoKHAsICdmb28uZicpO1xuXHRcdGFzc2VydEdsb2JNYXRjaChwLCAnZm9vLmpzJyk7XG5cblx0XHRwID0gJ3ByZWZpeC97KiovKi5kLnRzLCoqLyouanMsZm9vLlswLTldfSc7XG5cblx0XHRhc3NlcnRHbG9iTWF0Y2gocCwgJ3ByZWZpeC9mb28uNScpO1xuXHRcdGFzc2VydEdsb2JNYXRjaChwLCAncHJlZml4L2Zvby44Jyk7XG5cdFx0YXNzZXJ0Tm9HbG9iTWF0Y2gocCwgJ3ByZWZpeC9iYXIuNScpO1xuXHRcdGFzc2VydE5vR2xvYk1hdGNoKHAsICdwcmVmaXgvZm9vLmYnKTtcblx0XHRhc3NlcnRHbG9iTWF0Y2gocCwgJ3ByZWZpeC9mb28uanMnKTtcblx0fSk7XG5cblx0dGVzdCgnZXhwcmVzc2lvbiBzdXBwb3J0IChzaW5nbGUpJywgZnVuY3Rpb24gKCkge1xuXHRcdGNvbnN0IHNpYmxpbmdzID0gWyd0ZXN0Lmh0bWwnLCAndGVzdC50eHQnLCAndGVzdC50cycsICd0ZXN0LmpzJ107XG5cdFx0Y29uc3QgaGFzU2libGluZyA9IChuYW1lOiBzdHJpbmcpID0+IHNpYmxpbmdzLmluZGV4T2YobmFtZSkgIT09IC0xO1xuXG5cdFx0Ly8geyBcIioqLyouanNcIjogeyBcIndoZW5cIjogXCIkKGJhc2VuYW1lKS50c1wiIH0gfVxuXHRcdGxldCBleHByZXNzaW9uOiBnbG9iLklFeHByZXNzaW9uID0ge1xuXHRcdFx0JyoqLyouanMnOiB7XG5cdFx0XHRcdHdoZW46ICckKGJhc2VuYW1lKS50cydcblx0XHRcdH1cblx0XHR9O1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKCcqKi8qLmpzJywgZ2xvYi5wYXJzZShleHByZXNzaW9uKSgndGVzdC5qcycsIHVuZGVmaW5lZCwgaGFzU2libGluZykpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChnbG9iLnBhcnNlKGV4cHJlc3Npb24pKCd0ZXN0LmpzJywgdW5kZWZpbmVkLCAoKSA9PiBmYWxzZSksIG51bGwpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChnbG9iLnBhcnNlKGV4cHJlc3Npb24pKCd0ZXN0LmpzJywgdW5kZWZpbmVkLCBuYW1lID0+IG5hbWUgPT09ICd0ZS50cycpLCBudWxsKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZ2xvYi5wYXJzZShleHByZXNzaW9uKSgndGVzdC5qcycsIHVuZGVmaW5lZCksIG51bGwpO1xuXG5cdFx0ZXhwcmVzc2lvbiA9IHtcblx0XHRcdCcqKi8qLmpzJzoge1xuXHRcdFx0XHR3aGVuOiAnJ1xuXHRcdFx0fVxuXHRcdH07XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZ2xvYi5wYXJzZShleHByZXNzaW9uKSgndGVzdC5qcycsIHVuZGVmaW5lZCwgaGFzU2libGluZyksIG51bGwpO1xuXG5cdFx0ZXhwcmVzc2lvbiA9IHtcblx0XHRcdC8vIGVzbGludC1kaXNhYmxlLW5leHQtbGluZSBsb2NhbC9jb2RlLW5vLWFueS1jYXN0c1xuXHRcdFx0JyoqLyouanMnOiB7XG5cdFx0XHR9IGFzIGFueVxuXHRcdH07XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoJyoqLyouanMnLCBnbG9iLnBhcnNlKGV4cHJlc3Npb24pKCd0ZXN0LmpzJywgdW5kZWZpbmVkLCBoYXNTaWJsaW5nKSk7XG5cblx0XHRleHByZXNzaW9uID0ge307XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZ2xvYi5wYXJzZShleHByZXNzaW9uKSgndGVzdC5qcycsIHVuZGVmaW5lZCwgaGFzU2libGluZyksIG51bGwpO1xuXHR9KTtcblxuXHR0ZXN0KCdleHByZXNzaW9uIHN1cHBvcnQgKG11bHRpcGxlKScsIGZ1bmN0aW9uICgpIHtcblx0XHRjb25zdCBzaWJsaW5ncyA9IFsndGVzdC5odG1sJywgJ3Rlc3QudHh0JywgJ3Rlc3QudHMnLCAndGVzdC5qcyddO1xuXHRcdGNvbnN0IGhhc1NpYmxpbmcgPSAobmFtZTogc3RyaW5nKSA9PiBzaWJsaW5ncy5pbmRleE9mKG5hbWUpICE9PSAtMTtcblxuXHRcdC8vIHsgXCIqKi8qLmpzXCI6IHsgXCJ3aGVuXCI6IFwiJChiYXNlbmFtZSkudHNcIiB9IH1cblx0XHRjb25zdCBleHByZXNzaW9uOiBnbG9iLklFeHByZXNzaW9uID0ge1xuXHRcdFx0JyoqLyouanMnOiB7IHdoZW46ICckKGJhc2VuYW1lKS50cycgfSxcblx0XHRcdCcqKi8qLmFzJzogdHJ1ZSxcblx0XHRcdCcqKi8qLmZvbyc6IGZhbHNlLFxuXHRcdFx0Ly8gZXNsaW50LWRpc2FibGUtbmV4dC1saW5lIGxvY2FsL2NvZGUtbm8tYW55LWNhc3RzXG5cdFx0XHQnKiovKi5iYW5hbmFzJzogeyBiYW5hbmFzOiB0cnVlIH0gYXMgYW55XG5cdFx0fTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCgnKiovKi5qcycsIGdsb2IucGFyc2UoZXhwcmVzc2lvbikoJ3Rlc3QuanMnLCB1bmRlZmluZWQsIGhhc1NpYmxpbmcpKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoJyoqLyouYXMnLCBnbG9iLnBhcnNlKGV4cHJlc3Npb24pKCd0ZXN0LmFzJywgdW5kZWZpbmVkLCBoYXNTaWJsaW5nKSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKCcqKi8qLmJhbmFuYXMnLCBnbG9iLnBhcnNlKGV4cHJlc3Npb24pKCd0ZXN0LmJhbmFuYXMnLCB1bmRlZmluZWQsIGhhc1NpYmxpbmcpKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoJyoqLyouYmFuYW5hcycsIGdsb2IucGFyc2UoZXhwcmVzc2lvbikoJ3Rlc3QuYmFuYW5hcycsIHVuZGVmaW5lZCkpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChnbG9iLnBhcnNlKGV4cHJlc3Npb24pKCd0ZXN0LmZvbycsIHVuZGVmaW5lZCwgaGFzU2libGluZyksIG51bGwpO1xuXHR9KTtcblxuXHR0ZXN0KCdicmFja2V0cycsICgpID0+IHtcblx0XHRsZXQgcCA9ICdmb28uWzAtOV0nO1xuXG5cdFx0YXNzZXJ0R2xvYk1hdGNoKHAsICdmb28uNScpO1xuXHRcdGFzc2VydEdsb2JNYXRjaChwLCAnZm9vLjgnKTtcblx0XHRhc3NlcnROb0dsb2JNYXRjaChwLCAnYmFyLjUnKTtcblx0XHRhc3NlcnROb0dsb2JNYXRjaChwLCAnZm9vLmYnKTtcblxuXHRcdHAgPSAnZm9vLlteMC05XSc7XG5cblx0XHRhc3NlcnROb0dsb2JNYXRjaChwLCAnZm9vLjUnKTtcblx0XHRhc3NlcnROb0dsb2JNYXRjaChwLCAnZm9vLjgnKTtcblx0XHRhc3NlcnROb0dsb2JNYXRjaChwLCAnYmFyLjUnKTtcblx0XHRhc3NlcnRHbG9iTWF0Y2gocCwgJ2Zvby5mJyk7XG5cblx0XHRwID0gJ2Zvby5bITAtOV0nO1xuXG5cdFx0YXNzZXJ0Tm9HbG9iTWF0Y2gocCwgJ2Zvby41Jyk7XG5cdFx0YXNzZXJ0Tm9HbG9iTWF0Y2gocCwgJ2Zvby44Jyk7XG5cdFx0YXNzZXJ0Tm9HbG9iTWF0Y2gocCwgJ2Jhci41Jyk7XG5cdFx0YXNzZXJ0R2xvYk1hdGNoKHAsICdmb28uZicpO1xuXG5cdFx0cCA9ICdmb28uWzAhXio/XSc7XG5cblx0XHRhc3NlcnROb0dsb2JNYXRjaChwLCAnZm9vLjUnKTtcblx0XHRhc3NlcnROb0dsb2JNYXRjaChwLCAnZm9vLjgnKTtcblx0XHRhc3NlcnRHbG9iTWF0Y2gocCwgJ2Zvby4wJyk7XG5cdFx0YXNzZXJ0R2xvYk1hdGNoKHAsICdmb28uIScpO1xuXHRcdGFzc2VydEdsb2JNYXRjaChwLCAnZm9vLl4nKTtcblx0XHRhc3NlcnRHbG9iTWF0Y2gocCwgJ2Zvby4qJyk7XG5cdFx0YXNzZXJ0R2xvYk1hdGNoKHAsICdmb28uPycpO1xuXG5cdFx0cCA9ICdmb29bL11iYXInO1xuXG5cdFx0YXNzZXJ0Tm9HbG9iTWF0Y2gocCwgJ2Zvby9iYXInKTtcblxuXHRcdHAgPSAnZm9vLltbXSc7XG5cblx0XHRhc3NlcnRHbG9iTWF0Y2gocCwgJ2Zvby5bJyk7XG5cblx0XHRwID0gJ2Zvby5bXV0nO1xuXG5cdFx0YXNzZXJ0R2xvYk1hdGNoKHAsICdmb28uXScpO1xuXG5cdFx0cCA9ICdmb28uW11bIV0nO1xuXG5cdFx0YXNzZXJ0R2xvYk1hdGNoKHAsICdmb28uXScpO1xuXHRcdGFzc2VydEdsb2JNYXRjaChwLCAnZm9vLlsnKTtcblx0XHRhc3NlcnRHbG9iTWF0Y2gocCwgJ2Zvby4hJyk7XG5cblx0XHRwID0gJ2Zvby5bXS1dJztcblxuXHRcdGFzc2VydEdsb2JNYXRjaChwLCAnZm9vLl0nKTtcblx0XHRhc3NlcnRHbG9iTWF0Y2gocCwgJ2Zvby4tJyk7XG5cdH0pO1xuXG5cdHRlc3QoJ2Z1bGwgcGF0aCcsIGZ1bmN0aW9uICgpIHtcblx0XHRhc3NlcnRHbG9iTWF0Y2goJ3Rlc3RpbmcvdGhpcy9mb28udHh0JywgJ3Rlc3RpbmcvdGhpcy9mb28udHh0Jyk7XG5cdH0pO1xuXG5cdHRlc3QoJ2VuZGluZyBwYXRoJywgZnVuY3Rpb24gKCkge1xuXHRcdGFzc2VydEdsb2JNYXRjaCgnKiovdGVzdGluZy90aGlzL2Zvby50eHQnLCAnc29tZS9wYXRoL3Rlc3RpbmcvdGhpcy9mb28udHh0Jyk7XG5cdH0pO1xuXG5cdHRlc3QoJ3ByZWZpeCBhZ25vc3RpYycsIGZ1bmN0aW9uICgpIHtcblx0XHRsZXQgcCA9ICcqKi8qLmpzJztcblxuXHRcdGFzc2VydEdsb2JNYXRjaChwLCAnZm9vLmpzJyk7XG5cdFx0YXNzZXJ0R2xvYk1hdGNoKHAsICcvZm9vLmpzJyk7XG5cdFx0YXNzZXJ0R2xvYk1hdGNoKHAsICdcXFxcZm9vLmpzJyk7XG5cdFx0YXNzZXJ0R2xvYk1hdGNoKHAsICd0ZXN0aW5nL2Zvby5qcycpO1xuXHRcdGFzc2VydEdsb2JNYXRjaChwLCAndGVzdGluZ1xcXFxmb28uanMnKTtcblx0XHRhc3NlcnRHbG9iTWF0Y2gocCwgJy90ZXN0aW5nL2Zvby5qcycpO1xuXHRcdGFzc2VydEdsb2JNYXRjaChwLCAnXFxcXHRlc3RpbmdcXFxcZm9vLmpzJyk7XG5cdFx0YXNzZXJ0R2xvYk1hdGNoKHAsICdDOlxcXFx0ZXN0aW5nXFxcXGZvby5qcycpO1xuXG5cdFx0YXNzZXJ0Tm9HbG9iTWF0Y2gocCwgJ2Zvby50cycpO1xuXHRcdGFzc2VydE5vR2xvYk1hdGNoKHAsICd0ZXN0aW5nL2Zvby50cycpO1xuXHRcdGFzc2VydE5vR2xvYk1hdGNoKHAsICd0ZXN0aW5nXFxcXGZvby50cycpO1xuXHRcdGFzc2VydE5vR2xvYk1hdGNoKHAsICcvdGVzdGluZy9mb28udHMnKTtcblx0XHRhc3NlcnROb0dsb2JNYXRjaChwLCAnXFxcXHRlc3RpbmdcXFxcZm9vLnRzJyk7XG5cdFx0YXNzZXJ0Tm9HbG9iTWF0Y2gocCwgJ0M6XFxcXHRlc3RpbmdcXFxcZm9vLnRzJyk7XG5cblx0XHRhc3NlcnROb0dsb2JNYXRjaChwLCAnZm9vLmpzLnR4dCcpO1xuXHRcdGFzc2VydE5vR2xvYk1hdGNoKHAsICd0ZXN0aW5nL2Zvby5qcy50eHQnKTtcblx0XHRhc3NlcnROb0dsb2JNYXRjaChwLCAndGVzdGluZ1xcXFxmb28uanMudHh0Jyk7XG5cdFx0YXNzZXJ0Tm9HbG9iTWF0Y2gocCwgJy90ZXN0aW5nL2Zvby5qcy50eHQnKTtcblx0XHRhc3NlcnROb0dsb2JNYXRjaChwLCAnXFxcXHRlc3RpbmdcXFxcZm9vLmpzLnR4dCcpO1xuXHRcdGFzc2VydE5vR2xvYk1hdGNoKHAsICdDOlxcXFx0ZXN0aW5nXFxcXGZvby5qcy50eHQnKTtcblxuXHRcdGFzc2VydE5vR2xvYk1hdGNoKHAsICd0ZXN0aW5nLmpzL2ZvbycpO1xuXHRcdGFzc2VydE5vR2xvYk1hdGNoKHAsICd0ZXN0aW5nLmpzXFxcXGZvbycpO1xuXHRcdGFzc2VydE5vR2xvYk1hdGNoKHAsICcvdGVzdGluZy5qcy9mb28nKTtcblx0XHRhc3NlcnROb0dsb2JNYXRjaChwLCAnXFxcXHRlc3RpbmcuanNcXFxcZm9vJyk7XG5cdFx0YXNzZXJ0Tm9HbG9iTWF0Y2gocCwgJ0M6XFxcXHRlc3RpbmcuanNcXFxcZm9vJyk7XG5cblx0XHRwID0gJyoqL2Zvby5qcyc7XG5cblx0XHRhc3NlcnRHbG9iTWF0Y2gocCwgJ2Zvby5qcycpO1xuXHRcdGFzc2VydEdsb2JNYXRjaChwLCAnL2Zvby5qcycpO1xuXHRcdGFzc2VydEdsb2JNYXRjaChwLCAnXFxcXGZvby5qcycpO1xuXHRcdGFzc2VydEdsb2JNYXRjaChwLCAndGVzdGluZy9mb28uanMnKTtcblx0XHRhc3NlcnRHbG9iTWF0Y2gocCwgJ3Rlc3RpbmdcXFxcZm9vLmpzJyk7XG5cdFx0YXNzZXJ0R2xvYk1hdGNoKHAsICcvdGVzdGluZy9mb28uanMnKTtcblx0XHRhc3NlcnRHbG9iTWF0Y2gocCwgJ1xcXFx0ZXN0aW5nXFxcXGZvby5qcycpO1xuXHRcdGFzc2VydEdsb2JNYXRjaChwLCAnQzpcXFxcdGVzdGluZ1xcXFxmb28uanMnKTtcblx0fSk7XG5cblx0dGVzdCgnY2FjaGVkIHByb3Blcmx5JywgZnVuY3Rpb24gKCkge1xuXHRcdGNvbnN0IHAgPSAnKiovKi5qcyc7XG5cblx0XHRhc3NlcnRHbG9iTWF0Y2gocCwgJ2Zvby5qcycpO1xuXHRcdGFzc2VydEdsb2JNYXRjaChwLCAndGVzdGluZy9mb28uanMnKTtcblx0XHRhc3NlcnRHbG9iTWF0Y2gocCwgJ3Rlc3RpbmdcXFxcZm9vLmpzJyk7XG5cdFx0YXNzZXJ0R2xvYk1hdGNoKHAsICcvdGVzdGluZy9mb28uanMnKTtcblx0XHRhc3NlcnRHbG9iTWF0Y2gocCwgJ1xcXFx0ZXN0aW5nXFxcXGZvby5qcycpO1xuXHRcdGFzc2VydEdsb2JNYXRjaChwLCAnQzpcXFxcdGVzdGluZ1xcXFxmb28uanMnKTtcblxuXHRcdGFzc2VydE5vR2xvYk1hdGNoKHAsICdmb28udHMnKTtcblx0XHRhc3NlcnROb0dsb2JNYXRjaChwLCAndGVzdGluZy9mb28udHMnKTtcblx0XHRhc3NlcnROb0dsb2JNYXRjaChwLCAndGVzdGluZ1xcXFxmb28udHMnKTtcblx0XHRhc3NlcnROb0dsb2JNYXRjaChwLCAnL3Rlc3RpbmcvZm9vLnRzJyk7XG5cdFx0YXNzZXJ0Tm9HbG9iTWF0Y2gocCwgJ1xcXFx0ZXN0aW5nXFxcXGZvby50cycpO1xuXHRcdGFzc2VydE5vR2xvYk1hdGNoKHAsICdDOlxcXFx0ZXN0aW5nXFxcXGZvby50cycpO1xuXG5cdFx0YXNzZXJ0Tm9HbG9iTWF0Y2gocCwgJ2Zvby5qcy50eHQnKTtcblx0XHRhc3NlcnROb0dsb2JNYXRjaChwLCAndGVzdGluZy9mb28uanMudHh0Jyk7XG5cdFx0YXNzZXJ0Tm9HbG9iTWF0Y2gocCwgJ3Rlc3RpbmdcXFxcZm9vLmpzLnR4dCcpO1xuXHRcdGFzc2VydE5vR2xvYk1hdGNoKHAsICcvdGVzdGluZy9mb28uanMudHh0Jyk7XG5cdFx0YXNzZXJ0Tm9HbG9iTWF0Y2gocCwgJ1xcXFx0ZXN0aW5nXFxcXGZvby5qcy50eHQnKTtcblx0XHRhc3NlcnROb0dsb2JNYXRjaChwLCAnQzpcXFxcdGVzdGluZ1xcXFxmb28uanMudHh0Jyk7XG5cblx0XHRhc3NlcnROb0dsb2JNYXRjaChwLCAndGVzdGluZy5qcy9mb28nKTtcblx0XHRhc3NlcnROb0dsb2JNYXRjaChwLCAndGVzdGluZy5qc1xcXFxmb28nKTtcblx0XHRhc3NlcnROb0dsb2JNYXRjaChwLCAnL3Rlc3RpbmcuanMvZm9vJyk7XG5cdFx0YXNzZXJ0Tm9HbG9iTWF0Y2gocCwgJ1xcXFx0ZXN0aW5nLmpzXFxcXGZvbycpO1xuXHRcdGFzc2VydE5vR2xvYk1hdGNoKHAsICdDOlxcXFx0ZXN0aW5nLmpzXFxcXGZvbycpO1xuXG5cdFx0Ly8gUnVuIGFnYWluIGFuZCBtYWtlIHN1cmUgdGhlIHJlZ2V4IGFyZSBwcm9wZXJseSByZXVzZWRcblxuXHRcdGFzc2VydEdsb2JNYXRjaChwLCAnZm9vLmpzJyk7XG5cdFx0YXNzZXJ0R2xvYk1hdGNoKHAsICd0ZXN0aW5nL2Zvby5qcycpO1xuXHRcdGFzc2VydEdsb2JNYXRjaChwLCAndGVzdGluZ1xcXFxmb28uanMnKTtcblx0XHRhc3NlcnRHbG9iTWF0Y2gocCwgJy90ZXN0aW5nL2Zvby5qcycpO1xuXHRcdGFzc2VydEdsb2JNYXRjaChwLCAnXFxcXHRlc3RpbmdcXFxcZm9vLmpzJyk7XG5cdFx0YXNzZXJ0R2xvYk1hdGNoKHAsICdDOlxcXFx0ZXN0aW5nXFxcXGZvby5qcycpO1xuXG5cdFx0YXNzZXJ0Tm9HbG9iTWF0Y2gocCwgJ2Zvby50cycpO1xuXHRcdGFzc2VydE5vR2xvYk1hdGNoKHAsICd0ZXN0aW5nL2Zvby50cycpO1xuXHRcdGFzc2VydE5vR2xvYk1hdGNoKHAsICd0ZXN0aW5nXFxcXGZvby50cycpO1xuXHRcdGFzc2VydE5vR2xvYk1hdGNoKHAsICcvdGVzdGluZy9mb28udHMnKTtcblx0XHRhc3NlcnROb0dsb2JNYXRjaChwLCAnXFxcXHRlc3RpbmdcXFxcZm9vLnRzJyk7XG5cdFx0YXNzZXJ0Tm9HbG9iTWF0Y2gocCwgJ0M6XFxcXHRlc3RpbmdcXFxcZm9vLnRzJyk7XG5cblx0XHRhc3NlcnROb0dsb2JNYXRjaChwLCAnZm9vLmpzLnR4dCcpO1xuXHRcdGFzc2VydE5vR2xvYk1hdGNoKHAsICd0ZXN0aW5nL2Zvby5qcy50eHQnKTtcblx0XHRhc3NlcnROb0dsb2JNYXRjaChwLCAndGVzdGluZ1xcXFxmb28uanMudHh0Jyk7XG5cdFx0YXNzZXJ0Tm9HbG9iTWF0Y2gocCwgJy90ZXN0aW5nL2Zvby5qcy50eHQnKTtcblx0XHRhc3NlcnROb0dsb2JNYXRjaChwLCAnXFxcXHRlc3RpbmdcXFxcZm9vLmpzLnR4dCcpO1xuXHRcdGFzc2VydE5vR2xvYk1hdGNoKHAsICdDOlxcXFx0ZXN0aW5nXFxcXGZvby5qcy50eHQnKTtcblxuXHRcdGFzc2VydE5vR2xvYk1hdGNoKHAsICd0ZXN0aW5nLmpzL2ZvbycpO1xuXHRcdGFzc2VydE5vR2xvYk1hdGNoKHAsICd0ZXN0aW5nLmpzXFxcXGZvbycpO1xuXHRcdGFzc2VydE5vR2xvYk1hdGNoKHAsICcvdGVzdGluZy5qcy9mb28nKTtcblx0XHRhc3NlcnROb0dsb2JNYXRjaChwLCAnXFxcXHRlc3RpbmcuanNcXFxcZm9vJyk7XG5cdFx0YXNzZXJ0Tm9HbG9iTWF0Y2gocCwgJ0M6XFxcXHRlc3RpbmcuanNcXFxcZm9vJyk7XG5cdH0pO1xuXG5cdHRlc3QoJ2ludmFsaWQgZ2xvYicsIGZ1bmN0aW9uICgpIHtcblx0XHRjb25zdCBwID0gJyoqLyooLmpzJztcblxuXHRcdGFzc2VydE5vR2xvYk1hdGNoKHAsICdmb28uanMnKTtcblx0fSk7XG5cblx0dGVzdCgnc3BsaXQgZ2xvYiBhd2FyZScsIGZ1bmN0aW9uICgpIHtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGdsb2Iuc3BsaXRHbG9iQXdhcmUoJ2ZvbyxiYXInLCAnLCcpLCBbJ2ZvbycsICdiYXInXSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChnbG9iLnNwbGl0R2xvYkF3YXJlKCdmb28nLCAnLCcpLCBbJ2ZvbyddKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGdsb2Iuc3BsaXRHbG9iQXdhcmUoJ3tmb28sYmFyfScsICcsJyksIFsne2ZvbyxiYXJ9J10pO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoZ2xvYi5zcGxpdEdsb2JBd2FyZSgnZm9vLGJhcix7Zm9vLGJhcn0nLCAnLCcpLCBbJ2ZvbycsICdiYXInLCAne2ZvbyxiYXJ9J10pO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoZ2xvYi5zcGxpdEdsb2JBd2FyZSgne2ZvbyxiYXJ9LGZvbyxiYXIse2ZvbyxiYXJ9JywgJywnKSwgWyd7Zm9vLGJhcn0nLCAnZm9vJywgJ2JhcicsICd7Zm9vLGJhcn0nXSk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGdsb2Iuc3BsaXRHbG9iQXdhcmUoJ1tmb28sYmFyXScsICcsJyksIFsnW2ZvbyxiYXJdJ10pO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoZ2xvYi5zcGxpdEdsb2JBd2FyZSgnZm9vLGJhcixbZm9vLGJhcl0nLCAnLCcpLCBbJ2ZvbycsICdiYXInLCAnW2ZvbyxiYXJdJ10pO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoZ2xvYi5zcGxpdEdsb2JBd2FyZSgnW2ZvbyxiYXJdLGZvbyxiYXIsW2ZvbyxiYXJdJywgJywnKSwgWydbZm9vLGJhcl0nLCAnZm9vJywgJ2JhcicsICdbZm9vLGJhcl0nXSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2V4cHJlc3Npb24gd2l0aCBkaXNhYmxlZCBnbG9iJywgZnVuY3Rpb24gKCkge1xuXHRcdGNvbnN0IGV4cHIgPSB7ICcqKi8qLmpzJzogZmFsc2UgfTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChnbG9iLm1hdGNoKGV4cHIsICdmb28uanMnKSwgbnVsbCk7XG5cdH0pO1xuXG5cdHRlc3QoJ2V4cHJlc3Npb24gd2l0aCB0d28gbm9uLXRyaXZpYSBnbG9icycsIGZ1bmN0aW9uICgpIHtcblx0XHRjb25zdCBleHByID0ge1xuXHRcdFx0JyoqLyouaj8nOiB0cnVlLFxuXHRcdFx0JyoqLyoudD8nOiB0cnVlXG5cdFx0fTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChnbG9iLm1hdGNoKGV4cHIsICdmb28uanMnKSwgJyoqLyouaj8nKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZ2xvYi5tYXRjaChleHByLCAnZm9vLmFzJyksIG51bGwpO1xuXHR9KTtcblxuXHR0ZXN0KCdleHByZXNzaW9uIHdpdGggbm9uLXRyaXZpYSBnbG9iIChpc3N1ZSAxNDQ0NTgpJywgZnVuY3Rpb24gKCkge1xuXHRcdGNvbnN0IHBhdHRlcm4gPSAnKiovcConO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGdsb2IubWF0Y2gocGF0dGVybiwgJ2Zvby9iYXJwJyksIGZhbHNlKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZ2xvYi5tYXRjaChwYXR0ZXJuLCAnZm9vL2Jhci9hcCcpLCBmYWxzZSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGdsb2IubWF0Y2gocGF0dGVybiwgJ2FwJyksIGZhbHNlKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChnbG9iLm1hdGNoKHBhdHRlcm4sICdmb28vYmFycDEnKSwgZmFsc2UpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChnbG9iLm1hdGNoKHBhdHRlcm4sICdmb28vYmFyL2FwMScpLCBmYWxzZSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGdsb2IubWF0Y2gocGF0dGVybiwgJ2FwMScpLCBmYWxzZSk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZ2xvYi5tYXRjaChwYXR0ZXJuLCAnL2Zvby9iYXJwJyksIGZhbHNlKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZ2xvYi5tYXRjaChwYXR0ZXJuLCAnL2Zvby9iYXIvYXAnKSwgZmFsc2UpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChnbG9iLm1hdGNoKHBhdHRlcm4sICcvYXAnKSwgZmFsc2UpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGdsb2IubWF0Y2gocGF0dGVybiwgJy9mb28vYmFycDEnKSwgZmFsc2UpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChnbG9iLm1hdGNoKHBhdHRlcm4sICcvZm9vL2Jhci9hcDEnKSwgZmFsc2UpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChnbG9iLm1hdGNoKHBhdHRlcm4sICcvYXAxJyksIGZhbHNlKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChnbG9iLm1hdGNoKHBhdHRlcm4sICdmb28vcGJhcicpLCB0cnVlKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZ2xvYi5tYXRjaChwYXR0ZXJuLCAnL2Zvby9wYmFyJyksIHRydWUpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChnbG9iLm1hdGNoKHBhdHRlcm4sICdmb28vYmFyL3BhJyksIHRydWUpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChnbG9iLm1hdGNoKHBhdHRlcm4sICcvcCcpLCB0cnVlKTtcblx0fSk7XG5cblx0dGVzdCgnZXhwcmVzc2lvbiB3aXRoIGVtcHR5IGdsb2InLCBmdW5jdGlvbiAoKSB7XG5cdFx0Y29uc3QgZXhwciA9IHsgJyc6IHRydWUgfTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChnbG9iLm1hdGNoKGV4cHIsICdmb28uanMnKSwgbnVsbCk7XG5cdH0pO1xuXG5cdHRlc3QoJ2V4cHJlc3Npb24gd2l0aCBvdGhlciBmYWxzeSB2YWx1ZScsIGZ1bmN0aW9uICgpIHtcblx0XHQvLyBlc2xpbnQtZGlzYWJsZS1uZXh0LWxpbmUgbG9jYWwvY29kZS1uby1hbnktY2FzdHNcblx0XHRjb25zdCBleHByID0geyAnKiovKi5qcyc6IDAgfSBhcyBhbnk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZ2xvYi5tYXRjaChleHByLCAnZm9vLmpzJyksICcqKi8qLmpzJyk7XG5cdH0pO1xuXG5cdHRlc3QoJ2V4cHJlc3Npb24gd2l0aCB0d28gYmFzZW5hbWUgZ2xvYnMnLCBmdW5jdGlvbiAoKSB7XG5cdFx0Y29uc3QgZXhwciA9IHtcblx0XHRcdCcqKi9iYXInOiB0cnVlLFxuXHRcdFx0JyoqL2Jheic6IHRydWVcblx0XHR9O1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGdsb2IubWF0Y2goZXhwciwgJ2JhcicpLCAnKiovYmFyJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGdsb2IubWF0Y2goZXhwciwgJ2ZvbycpLCBudWxsKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZ2xvYi5tYXRjaChleHByLCAnZm9vL2JhcicpLCAnKiovYmFyJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGdsb2IubWF0Y2goZXhwciwgJ2Zvb1xcXFxiYXInKSwgJyoqL2JhcicpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChnbG9iLm1hdGNoKGV4cHIsICdmb28vZm9vJyksIG51bGwpO1xuXHR9KTtcblxuXHR0ZXN0KCdleHByZXNzaW9uIHdpdGggdHdvIGJhc2VuYW1lIGdsb2JzIGFuZCBhIHNpYmxpbmdzIGV4cHJlc3Npb24nLCBmdW5jdGlvbiAoKSB7XG5cdFx0Y29uc3QgZXhwciA9IHtcblx0XHRcdCcqKi9iYXInOiB0cnVlLFxuXHRcdFx0JyoqL2Jheic6IHRydWUsXG5cdFx0XHQnKiovKi5qcyc6IHsgd2hlbjogJyQoYmFzZW5hbWUpLnRzJyB9XG5cdFx0fTtcblxuXHRcdGNvbnN0IHNpYmxpbmdzID0gWydmb28udHMnLCAnZm9vLmpzJywgJ2ZvbycsICdiYXInXTtcblx0XHRjb25zdCBoYXNTaWJsaW5nID0gKG5hbWU6IHN0cmluZykgPT4gc2libGluZ3MuaW5kZXhPZihuYW1lKSAhPT0gLTE7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZ2xvYi5wYXJzZShleHByKSgnYmFyJywgdW5kZWZpbmVkLCBoYXNTaWJsaW5nKSwgJyoqL2JhcicpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChnbG9iLnBhcnNlKGV4cHIpKCdmb28nLCB1bmRlZmluZWQsIGhhc1NpYmxpbmcpLCBudWxsKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZ2xvYi5wYXJzZShleHByKSgnZm9vL2JhcicsIHVuZGVmaW5lZCwgaGFzU2libGluZyksICcqKi9iYXInKTtcblx0XHRpZiAoaXNXaW5kb3dzKSB7XG5cdFx0XHQvLyBiYWNrc2xhc2ggaXMgYSB2YWxpZCBmaWxlIG5hbWUgY2hhcmFjdGVyIG9uIHBvc2l4XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZ2xvYi5wYXJzZShleHByKSgnZm9vXFxcXGJhcicsIHVuZGVmaW5lZCwgaGFzU2libGluZyksICcqKi9iYXInKTtcblx0XHR9XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGdsb2IucGFyc2UoZXhwcikoJ2Zvby9mb28nLCB1bmRlZmluZWQsIGhhc1NpYmxpbmcpLCBudWxsKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZ2xvYi5wYXJzZShleHByKSgnZm9vLmpzJywgdW5kZWZpbmVkLCBoYXNTaWJsaW5nKSwgJyoqLyouanMnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZ2xvYi5wYXJzZShleHByKSgnYmFyLmpzJywgdW5kZWZpbmVkLCBoYXNTaWJsaW5nKSwgbnVsbCk7XG5cdH0pO1xuXG5cdHRlc3QoJ2V4cHJlc3Npb24gd2l0aCBtdWx0aXBlIGJhc2VuYW1lIGdsb2JzJywgZnVuY3Rpb24gKCkge1xuXHRcdGNvbnN0IGV4cHIgPSB7XG5cdFx0XHQnKiovYmFyJzogdHJ1ZSxcblx0XHRcdCd7KiovYmF6LCoqL2Zvb30nOiB0cnVlXG5cdFx0fTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChnbG9iLm1hdGNoKGV4cHIsICdiYXInKSwgJyoqL2JhcicpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChnbG9iLm1hdGNoKGV4cHIsICdmb28nKSwgJ3sqKi9iYXosKiovZm9vfScpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChnbG9iLm1hdGNoKGV4cHIsICdiYXonKSwgJ3sqKi9iYXosKiovZm9vfScpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChnbG9iLm1hdGNoKGV4cHIsICdhYmMnKSwgbnVsbCk7XG5cdH0pO1xuXG5cdHRlc3QoJ2ZhbHN5IGV4cHJlc3Npb24vcGF0dGVybicsIGZ1bmN0aW9uICgpIHtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZ2xvYi5tYXRjaChudWxsISwgJ2ZvbycpLCBmYWxzZSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGdsb2IubWF0Y2goJycsICdmb28nKSwgZmFsc2UpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChnbG9iLnBhcnNlKG51bGwhKSgnZm9vJyksIGZhbHNlKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZ2xvYi5wYXJzZSgnJykoJ2ZvbycpLCBmYWxzZSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2ZhbHN5IHBhdGgnLCBmdW5jdGlvbiAoKSB7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGdsb2IucGFyc2UoJ2ZvbycpKG51bGwhKSwgZmFsc2UpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChnbG9iLnBhcnNlKCdmb28nKSgnJyksIGZhbHNlKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZ2xvYi5wYXJzZSgnKiovKi5qPycpKG51bGwhKSwgZmFsc2UpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChnbG9iLnBhcnNlKCcqKi8qLmo/JykoJycpLCBmYWxzZSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGdsb2IucGFyc2UoJyoqLyouZm9vJykobnVsbCEpLCBmYWxzZSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGdsb2IucGFyc2UoJyoqLyouZm9vJykoJycpLCBmYWxzZSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGdsb2IucGFyc2UoJyoqL2ZvbycpKG51bGwhKSwgZmFsc2UpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChnbG9iLnBhcnNlKCcqKi9mb28nKSgnJyksIGZhbHNlKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZ2xvYi5wYXJzZSgneyoqL2JheiwqKi9mb299JykobnVsbCEpLCBmYWxzZSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGdsb2IucGFyc2UoJ3sqKi9iYXosKiovZm9vfScpKCcnKSwgZmFsc2UpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChnbG9iLnBhcnNlKCd7KiovKi5iYXosKiovKi5mb299JykobnVsbCEpLCBmYWxzZSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGdsb2IucGFyc2UoJ3sqKi8qLmJheiwqKi8qLmZvb30nKSgnJyksIGZhbHNlKTtcblx0fSk7XG5cblx0dGVzdCgnZXhwcmVzc2lvbi9wYXR0ZXJuIGJhc2VuYW1lJywgZnVuY3Rpb24gKCkge1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChnbG9iLnBhcnNlKCcqKi9mb28nKSgnYmFyL2JheicsICdiYXonKSwgZmFsc2UpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChnbG9iLnBhcnNlKCcqKi9mb28nKSgnYmFyL2ZvbycsICdmb28nKSwgdHJ1ZSk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZ2xvYi5wYXJzZSgneyoqL2JheiwqKi9mb299JykoJ2Jhei9iYXInLCAnYmFyJyksIGZhbHNlKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZ2xvYi5wYXJzZSgneyoqL2JheiwqKi9mb299JykoJ2Jhei9mb28nLCAnZm9vJyksIHRydWUpO1xuXG5cdFx0Y29uc3QgZXhwciA9IHsgJyoqLyouanMnOiB7IHdoZW46ICckKGJhc2VuYW1lKS50cycgfSB9O1xuXHRcdGNvbnN0IHNpYmxpbmdzID0gWydmb28udHMnLCAnZm9vLmpzJ107XG5cdFx0Y29uc3QgaGFzU2libGluZyA9IChuYW1lOiBzdHJpbmcpID0+IHNpYmxpbmdzLmluZGV4T2YobmFtZSkgIT09IC0xO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGdsb2IucGFyc2UoZXhwcikoJ2Jhci9iYXouanMnLCAnYmF6LmpzJywgaGFzU2libGluZyksIG51bGwpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChnbG9iLnBhcnNlKGV4cHIpKCdiYXIvZm9vLmpzJywgJ2Zvby5qcycsIGhhc1NpYmxpbmcpLCAnKiovKi5qcycpO1xuXHR9KTtcblxuXHR0ZXN0KCdleHByZXNzaW9uL3BhdHRlcm4gYmFzZW5hbWUgdGVybXMnLCBmdW5jdGlvbiAoKSB7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChnbG9iLmdldEJhc2VuYW1lVGVybXMoZ2xvYi5wYXJzZSgnKiovKi5mb28nKSksIFtdKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGdsb2IuZ2V0QmFzZW5hbWVUZXJtcyhnbG9iLnBhcnNlKCcqKi9mb28nKSksIFsnZm9vJ10pO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoZ2xvYi5nZXRCYXNlbmFtZVRlcm1zKGdsb2IucGFyc2UoJyoqL2Zvby8nKSksIFsnZm9vJ10pO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoZ2xvYi5nZXRCYXNlbmFtZVRlcm1zKGdsb2IucGFyc2UoJ3sqKi9iYXosKiovZm9vfScpKSwgWydiYXonLCAnZm9vJ10pO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoZ2xvYi5nZXRCYXNlbmFtZVRlcm1zKGdsb2IucGFyc2UoJ3sqKi9iYXovLCoqL2Zvby99JykpLCBbJ2JheicsICdmb28nXSk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGdsb2IuZ2V0QmFzZW5hbWVUZXJtcyhnbG9iLnBhcnNlKHtcblx0XHRcdCcqKi9mb28nOiB0cnVlLFxuXHRcdFx0J3sqKi9iYXIsKiovYmF6fSc6IHRydWUsXG5cdFx0XHQneyoqL2JhcjIvLCoqL2JhejIvfSc6IHRydWUsXG5cdFx0XHQnKiovYnVsYic6IGZhbHNlXG5cdFx0fSkpLCBbJ2ZvbycsICdiYXInLCAnYmF6JywgJ2JhcjInLCAnYmF6MiddKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGdsb2IuZ2V0QmFzZW5hbWVUZXJtcyhnbG9iLnBhcnNlKHtcblx0XHRcdCcqKi9mb28nOiB7IHdoZW46ICckKGJhc2VuYW1lKS56aXAnIH0sXG5cdFx0XHQnKiovYmFyJzogdHJ1ZVxuXHRcdH0pKSwgWydiYXInXSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2V4cHJlc3Npb24vcGF0dGVybiBvcHRpbWl6YXRpb24gZm9yIGJhc2VuYW1lcycsIGZ1bmN0aW9uICgpIHtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGdsb2IuZ2V0QmFzZW5hbWVUZXJtcyhnbG9iLnBhcnNlKCcqKi9mb28vKionKSksIFtdKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGdsb2IuZ2V0QmFzZW5hbWVUZXJtcyhnbG9iLnBhcnNlKCcqKi9mb28vKionLCB7IHRyaW1Gb3JFeGNsdXNpb25zOiB0cnVlIH0pKSwgWydmb28nXSk7XG5cblx0XHR0ZXN0T3B0aW1pemF0aW9uRm9yQmFzZW5hbWVzKCcqKi8qLmZvby8qKicsIFtdLCBbWydiYXovYmFyLmZvby9iYXIvYmF6JywgdHJ1ZV1dKTtcblx0XHR0ZXN0T3B0aW1pemF0aW9uRm9yQmFzZW5hbWVzKCcqKi9mb28vKionLCBbJ2ZvbyddLCBbWydiYXIvZm9vJywgdHJ1ZV0sIFsnYmFyL2Zvby9iYXonLCBmYWxzZV1dKTtcblx0XHR0ZXN0T3B0aW1pemF0aW9uRm9yQmFzZW5hbWVzKCd7KiovYmF6LyoqLCoqL2Zvby8qKn0nLCBbJ2JheicsICdmb28nXSwgW1snYmFyL2JheicsIHRydWVdLCBbJ2Jhci9mb28nLCB0cnVlXV0pO1xuXG5cdFx0dGVzdE9wdGltaXphdGlvbkZvckJhc2VuYW1lcyh7XG5cdFx0XHQnKiovZm9vLyoqJzogdHJ1ZSxcblx0XHRcdCd7KiovYmFyLyoqLCoqL2Jhei8qKn0nOiB0cnVlLFxuXHRcdFx0JyoqL2J1bGIvKionOiBmYWxzZVxuXHRcdH0sIFsnZm9vJywgJ2JhcicsICdiYXonXSwgW1xuXHRcdFx0WydiYXIvZm9vJywgJyoqL2Zvby8qKiddLFxuXHRcdFx0Wydmb28vYmFyJywgJ3sqKi9iYXIvKiosKiovYmF6LyoqfSddLFxuXHRcdFx0WydiYXIvbm9wZScsIG51bGwhXVxuXHRcdF0pO1xuXG5cdFx0Y29uc3Qgc2libGluZ3MgPSBbJ2JheicsICdiYXouemlwJywgJ25vcGUnXTtcblx0XHRjb25zdCBoYXNTaWJsaW5nID0gKG5hbWU6IHN0cmluZykgPT4gc2libGluZ3MuaW5kZXhPZihuYW1lKSAhPT0gLTE7XG5cdFx0dGVzdE9wdGltaXphdGlvbkZvckJhc2VuYW1lcyh7XG5cdFx0XHQnKiovZm9vLyoqJzogeyB3aGVuOiAnJChiYXNlbmFtZSkuemlwJyB9LFxuXHRcdFx0JyoqL2Jhci8qKic6IHRydWVcblx0XHR9LCBbJ2JhciddLCBbXG5cdFx0XHRbJ2Jhci9mb28nLCBudWxsIV0sXG5cdFx0XHRbJ2Jhci9mb28vYmF6JywgbnVsbCFdLFxuXHRcdFx0WydiYXIvZm9vL25vcGUnLCBudWxsIV0sXG5cdFx0XHRbJ2Zvby9iYXInLCAnKiovYmFyLyoqJ10sXG5cdFx0XSwgW1xuXHRcdFx0bnVsbCEsXG5cdFx0XHRoYXNTaWJsaW5nLFxuXHRcdFx0aGFzU2libGluZ1xuXHRcdF0pO1xuXHR9KTtcblxuXHRmdW5jdGlvbiB0ZXN0T3B0aW1pemF0aW9uRm9yQmFzZW5hbWVzKHBhdHRlcm46IHN0cmluZyB8IGdsb2IuSUV4cHJlc3Npb24sIGJhc2VuYW1lVGVybXM6IHN0cmluZ1tdLCBtYXRjaGVzOiBbc3RyaW5nLCBzdHJpbmcgfCBib29sZWFuXVtdLCBzaWJsaW5nc0ZuczogKChuYW1lOiBzdHJpbmcpID0+IGJvb2xlYW4pW10gPSBbXSkge1xuXHRcdGNvbnN0IHBhcnNlZCA9IGdsb2IucGFyc2UoPGdsb2IuSUV4cHJlc3Npb24+cGF0dGVybiwgeyB0cmltRm9yRXhjbHVzaW9uczogdHJ1ZSB9KTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGdsb2IuZ2V0QmFzZW5hbWVUZXJtcyhwYXJzZWQpLCBiYXNlbmFtZVRlcm1zKTtcblx0XHRtYXRjaGVzLmZvckVhY2goKFt0ZXh0LCByZXN1bHRdLCBpKSA9PiB7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocGFyc2VkKHRleHQsIG51bGwhLCBzaWJsaW5nc0Zuc1tpXSksIHJlc3VsdCk7XG5cdFx0fSk7XG5cdH1cblxuXHR0ZXN0KCd0cmFpbGluZyBzbGFzaCcsIGZ1bmN0aW9uICgpIHtcblx0XHQvLyBUZXN0aW5nIGV4aXN0aW5nIChtb3JlIG9yIGxlc3MgaW50dWl0aXZlKSBiZWhhdmlvclxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChnbG9iLnBhcnNlKCcqKi9mb28vJykoJ2Jhci9iYXonLCAnYmF6JyksIGZhbHNlKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZ2xvYi5wYXJzZSgnKiovZm9vLycpKCdiYXIvZm9vJywgJ2ZvbycpLCB0cnVlKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZ2xvYi5wYXJzZSgnKiovKi5mb28vJykoJ2Jhci9maWxlLmJheicsICdmaWxlLmJheicpLCBmYWxzZSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGdsb2IucGFyc2UoJyoqLyouZm9vLycpKCdiYXIvZmlsZS5mb28nLCAnZmlsZS5mb28nKSwgdHJ1ZSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGdsb2IucGFyc2UoJ3sqKi9mb28vLCoqL2FiYy99JykoJ2Jhci9iYXonLCAnYmF6JyksIGZhbHNlKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZ2xvYi5wYXJzZSgneyoqL2Zvby8sKiovYWJjL30nKSgnYmFyL2ZvbycsICdmb28nKSwgdHJ1ZSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGdsb2IucGFyc2UoJ3sqKi9mb28vLCoqL2FiYy99JykoJ2Jhci9hYmMnLCAnYWJjJyksIHRydWUpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChnbG9iLnBhcnNlKCd7KiovZm9vLywqKi9hYmMvfScsIHsgdHJpbUZvckV4Y2x1c2lvbnM6IHRydWUgfSkoJ2Jhci9iYXonLCAnYmF6JyksIGZhbHNlKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZ2xvYi5wYXJzZSgneyoqL2Zvby8sKiovYWJjL30nLCB7IHRyaW1Gb3JFeGNsdXNpb25zOiB0cnVlIH0pKCdiYXIvZm9vJywgJ2ZvbycpLCB0cnVlKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZ2xvYi5wYXJzZSgneyoqL2Zvby8sKiovYWJjL30nLCB7IHRyaW1Gb3JFeGNsdXNpb25zOiB0cnVlIH0pKCdiYXIvYWJjJywgJ2FiYycpLCB0cnVlKTtcblx0fSk7XG5cblx0dGVzdCgnZXhwcmVzc2lvbi9wYXR0ZXJuIHBhdGgnLCBmdW5jdGlvbiAoKSB7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGdsb2IucGFyc2UoJyoqL2Zvby9iYXInKShuYXRpdmVTZXAoJ2Zvby9iYXonKSwgJ2JheicpLCBmYWxzZSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGdsb2IucGFyc2UoJyoqL2Zvby9iYXInKShuYXRpdmVTZXAoJ2Zvby9iYXInKSwgJ2JhcicpLCB0cnVlKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZ2xvYi5wYXJzZSgnKiovZm9vL2JhcicpKG5hdGl2ZVNlcCgnYmFyL2Zvby9iYXInKSwgJ2JhcicpLCB0cnVlKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZ2xvYi5wYXJzZSgnKiovZm9vL2Jhci8qKicpKG5hdGl2ZVNlcCgnYmFyL2Zvby9iYXInKSwgJ2JhcicpLCB0cnVlKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZ2xvYi5wYXJzZSgnKiovZm9vL2Jhci8qKicpKG5hdGl2ZVNlcCgnYmFyL2Zvby9iYXIvYmF6JyksICdiYXonKSwgdHJ1ZSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGdsb2IucGFyc2UoJyoqL2Zvby9iYXIvKionLCB7IHRyaW1Gb3JFeGNsdXNpb25zOiB0cnVlIH0pKG5hdGl2ZVNlcCgnYmFyL2Zvby9iYXInKSwgJ2JhcicpLCB0cnVlKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZ2xvYi5wYXJzZSgnKiovZm9vL2Jhci8qKicsIHsgdHJpbUZvckV4Y2x1c2lvbnM6IHRydWUgfSkobmF0aXZlU2VwKCdiYXIvZm9vL2Jhci9iYXonKSwgJ2JheicpLCBmYWxzZSk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZ2xvYi5wYXJzZSgnZm9vL2JhcicpKG5hdGl2ZVNlcCgnZm9vL2JheicpLCAnYmF6JyksIGZhbHNlKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZ2xvYi5wYXJzZSgnZm9vL2JhcicpKG5hdGl2ZVNlcCgnZm9vL2JhcicpLCAnYmFyJyksIHRydWUpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChnbG9iLnBhcnNlKCdmb28vYmFyL2JheicpKG5hdGl2ZVNlcCgnZm9vL2Jhci9iYXonKSwgJ2JheicpLCB0cnVlKTsgLy8gIzE1NDI0XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGdsb2IucGFyc2UoJ2Zvby9iYXInKShuYXRpdmVTZXAoJ2Jhci9mb28vYmFyJyksICdiYXInKSwgZmFsc2UpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChnbG9iLnBhcnNlKCdmb28vYmFyLyoqJykobmF0aXZlU2VwKCdmb28vYmFyL2JheicpLCAnYmF6JyksIHRydWUpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChnbG9iLnBhcnNlKCdmb28vYmFyLyoqJywgeyB0cmltRm9yRXhjbHVzaW9uczogdHJ1ZSB9KShuYXRpdmVTZXAoJ2Zvby9iYXInKSwgJ2JhcicpLCB0cnVlKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZ2xvYi5wYXJzZSgnZm9vL2Jhci8qKicsIHsgdHJpbUZvckV4Y2x1c2lvbnM6IHRydWUgfSkobmF0aXZlU2VwKCdmb28vYmFyL2JheicpLCAnYmF6JyksIGZhbHNlKTtcblx0fSk7XG5cblx0dGVzdCgnZXhwcmVzc2lvbi9wYXR0ZXJuIHBhdGhzJywgZnVuY3Rpb24gKCkge1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoZ2xvYi5nZXRQYXRoVGVybXMoZ2xvYi5wYXJzZSgnKiovKi5mb28nKSksIFtdKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGdsb2IuZ2V0UGF0aFRlcm1zKGdsb2IucGFyc2UoJyoqL2ZvbycpKSwgW10pO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoZ2xvYi5nZXRQYXRoVGVybXMoZ2xvYi5wYXJzZSgnKiovZm9vL2JhcicpKSwgWycqL2Zvby9iYXInXSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChnbG9iLmdldFBhdGhUZXJtcyhnbG9iLnBhcnNlKCcqKi9mb28vYmFyLycpKSwgWycqL2Zvby9iYXInXSk7XG5cdFx0Ly8gTm90IHN1cHBvcnRlZFxuXHRcdC8vIGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoZ2xvYi5nZXRQYXRoVGVybXMoZ2xvYi5wYXJzZSgneyoqL2Jhei9iYXIsKiovZm9vL2JhciwqKi9iYXJ9JykpLCBbJyovYmF6L2JhcicsICcqL2Zvby9iYXInXSk7XG5cdFx0Ly8gYXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChnbG9iLmdldFBhdGhUZXJtcyhnbG9iLnBhcnNlKCd7KiovYmF6L2Jhci8sKiovZm9vL2Jhci8sKiovYmFyL30nKSksIFsnKi9iYXovYmFyJywgJyovZm9vL2JhciddKTtcblxuXHRcdGNvbnN0IHBhcnNlZCA9IGdsb2IucGFyc2Uoe1xuXHRcdFx0JyoqL2Zvby9iYXInOiB0cnVlLFxuXHRcdFx0JyoqL2ZvbzIvYmFyMic6IHRydWUsXG5cdFx0XHQvLyBOb3Qgc3VwcG9ydGVkXG5cdFx0XHQvLyAneyoqL2Jhci9mb28sKiovYmF6L2Zvb30nOiB0cnVlLFxuXHRcdFx0Ly8gJ3sqKi9iYXIyL2Zvby8sKiovYmF6Mi9mb28vfSc6IHRydWUsXG5cdFx0XHQnKiovYnVsYic6IHRydWUsXG5cdFx0XHQnKiovYnVsYjInOiB0cnVlLFxuXHRcdFx0JyoqL2J1bGIvZm9vJzogZmFsc2Vcblx0XHR9KTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGdsb2IuZ2V0UGF0aFRlcm1zKHBhcnNlZCksIFsnKi9mb28vYmFyJywgJyovZm9vMi9iYXIyJ10pO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoZ2xvYi5nZXRCYXNlbmFtZVRlcm1zKHBhcnNlZCksIFsnYnVsYicsICdidWxiMiddKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGdsb2IuZ2V0UGF0aFRlcm1zKGdsb2IucGFyc2Uoe1xuXHRcdFx0JyoqL2Zvby9iYXInOiB7IHdoZW46ICckKGJhc2VuYW1lKS56aXAnIH0sXG5cdFx0XHQnKiovYmFyL2Zvbyc6IHRydWUsXG5cdFx0XHQnKiovYmFyMi9mb28yJzogdHJ1ZVxuXHRcdH0pKSwgWycqL2Jhci9mb28nLCAnKi9iYXIyL2ZvbzInXSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2V4cHJlc3Npb24vcGF0dGVybiBvcHRpbWl6YXRpb24gZm9yIHBhdGhzJywgZnVuY3Rpb24gKCkge1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoZ2xvYi5nZXRQYXRoVGVybXMoZ2xvYi5wYXJzZSgnKiovZm9vL2Jhci8qKicpKSwgW10pO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoZ2xvYi5nZXRQYXRoVGVybXMoZ2xvYi5wYXJzZSgnKiovZm9vL2Jhci8qKicsIHsgdHJpbUZvckV4Y2x1c2lvbnM6IHRydWUgfSkpLCBbJyovZm9vL2JhciddKTtcblxuXHRcdHRlc3RPcHRpbWl6YXRpb25Gb3JQYXRocygnKiovKi5mb28vYmFyLyoqJywgW10sIFtbbmF0aXZlU2VwKCdiYXovYmFyLmZvby9iYXIvYmF6JyksIHRydWVdXSk7XG5cdFx0dGVzdE9wdGltaXphdGlvbkZvclBhdGhzKCcqKi9mb28vYmFyLyoqJywgWycqL2Zvby9iYXInXSwgW1tuYXRpdmVTZXAoJ2Jhci9mb28vYmFyJyksIHRydWVdLCBbbmF0aXZlU2VwKCdiYXIvZm9vL2Jhci9iYXonKSwgZmFsc2VdXSk7XG5cdFx0Ly8gTm90IHN1cHBvcnRlZFxuXHRcdC8vIHRlc3RPcHRpbWl6YXRpb25Gb3JQYXRocygneyoqL2Jhei9iYXIvKiosKiovZm9vL2Jhci8qKn0nLCBbJyovYmF6L2JhcicsICcqL2Zvby9iYXInXSwgW1tuYXRpdmVTZXAoJ2Jhci9iYXovYmFyJyksIHRydWVdLCBbbmF0aXZlU2VwKCdiYXIvZm9vL2JhcicpLCB0cnVlXV0pO1xuXG5cdFx0dGVzdE9wdGltaXphdGlvbkZvclBhdGhzKHtcblx0XHRcdCcqKi9mb28vYmFyLyoqJzogdHJ1ZSxcblx0XHRcdC8vIE5vdCBzdXBwb3J0ZWRcblx0XHRcdC8vICd7KiovYmFyL2Jhci8qKiwqKi9iYXovYmFyLyoqfSc6IHRydWUsXG5cdFx0XHQnKiovYnVsYi9iYXIvKionOiBmYWxzZVxuXHRcdH0sIFsnKi9mb28vYmFyJ10sIFtcblx0XHRcdFtuYXRpdmVTZXAoJ2Jhci9mb28vYmFyJyksICcqKi9mb28vYmFyLyoqJ10sXG5cdFx0XHQvLyBOb3Qgc3VwcG9ydGVkXG5cdFx0XHQvLyBbbmF0aXZlU2VwKCdmb28vYmFyL2JhcicpLCAneyoqL2Jhci9iYXIvKiosKiovYmF6L2Jhci8qKn0nXSxcblx0XHRcdFtuYXRpdmVTZXAoJy9mb28vYmFyL25vcGUnKSwgbnVsbCFdXG5cdFx0XSk7XG5cblx0XHRjb25zdCBzaWJsaW5ncyA9IFsnYmF6JywgJ2Jhei56aXAnLCAnbm9wZSddO1xuXHRcdGNvbnN0IGhhc1NpYmxpbmcgPSAobmFtZTogc3RyaW5nKSA9PiBzaWJsaW5ncy5pbmRleE9mKG5hbWUpICE9PSAtMTtcblx0XHR0ZXN0T3B0aW1pemF0aW9uRm9yUGF0aHMoe1xuXHRcdFx0JyoqL2Zvby8xMjMvKionOiB7IHdoZW46ICckKGJhc2VuYW1lKS56aXAnIH0sXG5cdFx0XHQnKiovYmFyLzEyMy8qKic6IHRydWVcblx0XHR9LCBbJyovYmFyLzEyMyddLCBbXG5cdFx0XHRbbmF0aXZlU2VwKCdiYXIvZm9vLzEyMycpLCBudWxsIV0sXG5cdFx0XHRbbmF0aXZlU2VwKCdiYXIvZm9vLzEyMy9iYXonKSwgbnVsbCFdLFxuXHRcdFx0W25hdGl2ZVNlcCgnYmFyL2Zvby8xMjMvbm9wZScpLCBudWxsIV0sXG5cdFx0XHRbbmF0aXZlU2VwKCdmb28vYmFyLzEyMycpLCAnKiovYmFyLzEyMy8qKiddLFxuXHRcdF0sIFtcblx0XHRcdG51bGwhLFxuXHRcdFx0aGFzU2libGluZyxcblx0XHRcdGhhc1NpYmxpbmdcblx0XHRdKTtcblx0fSk7XG5cblx0ZnVuY3Rpb24gdGVzdE9wdGltaXphdGlvbkZvclBhdGhzKHBhdHRlcm46IHN0cmluZyB8IGdsb2IuSUV4cHJlc3Npb24sIHBhdGhUZXJtczogc3RyaW5nW10sIG1hdGNoZXM6IFtzdHJpbmcsIHN0cmluZyB8IGJvb2xlYW5dW10sIHNpYmxpbmdzRm5zOiAoKG5hbWU6IHN0cmluZykgPT4gYm9vbGVhbilbXSA9IFtdKSB7XG5cdFx0Y29uc3QgcGFyc2VkID0gZ2xvYi5wYXJzZSg8Z2xvYi5JRXhwcmVzc2lvbj5wYXR0ZXJuLCB7IHRyaW1Gb3JFeGNsdXNpb25zOiB0cnVlIH0pO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoZ2xvYi5nZXRQYXRoVGVybXMocGFyc2VkKSwgcGF0aFRlcm1zKTtcblx0XHRtYXRjaGVzLmZvckVhY2goKFt0ZXh0LCByZXN1bHRdLCBpKSA9PiB7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocGFyc2VkKHRleHQsIG51bGwhLCBzaWJsaW5nc0Zuc1tpXSksIHJlc3VsdCk7XG5cdFx0fSk7XG5cdH1cblxuXHRmdW5jdGlvbiBuYXRpdmVTZXAoc2xhc2hQYXRoOiBzdHJpbmcpOiBzdHJpbmcge1xuXHRcdHJldHVybiBzbGFzaFBhdGgucmVwbGFjZSgvXFwvL2csIHNlcCk7XG5cdH1cblxuXHR0ZXN0KCdyZWxhdGl2ZSBwYXR0ZXJuIC0gZ2xvYiBzdGFyJywgZnVuY3Rpb24gKCkge1xuXHRcdGlmIChpc1dpbmRvd3MpIHtcblx0XHRcdGNvbnN0IHA6IGdsb2IuSVJlbGF0aXZlUGF0dGVybiA9IHsgYmFzZTogJ0M6XFxcXEROWENvbnNvbGVBcHBcXFxcZm9vJywgcGF0dGVybjogJyoqLyouY3MnIH07XG5cdFx0XHRhc3NlcnRHbG9iTWF0Y2gocCwgJ0M6XFxcXEROWENvbnNvbGVBcHBcXFxcZm9vXFxcXFByb2dyYW0uY3MnKTtcblx0XHRcdGFzc2VydEdsb2JNYXRjaChwLCAnQzpcXFxcRE5YQ29uc29sZUFwcFxcXFxmb29cXFxcYmFyXFxcXFByb2dyYW0uY3MnKTtcblx0XHRcdGFzc2VydE5vR2xvYk1hdGNoKHAsICdDOlxcXFxETlhDb25zb2xlQXBwXFxcXGZvb1xcXFxQcm9ncmFtLnRzJyk7XG5cdFx0XHRhc3NlcnROb0dsb2JNYXRjaChwLCAnQzpcXFxcRE5YQ29uc29sZUFwcFxcXFxQcm9ncmFtLmNzJyk7XG5cdFx0XHRhc3NlcnROb0dsb2JNYXRjaChwLCAnQzpcXFxcb3RoZXJcXFxcRE5YQ29uc29sZUFwcFxcXFxmb29cXFxcUHJvZ3JhbS50cycpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRjb25zdCBwOiBnbG9iLklSZWxhdGl2ZVBhdHRlcm4gPSB7IGJhc2U6ICcvRE5YQ29uc29sZUFwcC9mb28nLCBwYXR0ZXJuOiAnKiovKi5jcycgfTtcblx0XHRcdGFzc2VydEdsb2JNYXRjaChwLCAnL0ROWENvbnNvbGVBcHAvZm9vL1Byb2dyYW0uY3MnKTtcblx0XHRcdGFzc2VydEdsb2JNYXRjaChwLCAnL0ROWENvbnNvbGVBcHAvZm9vL2Jhci9Qcm9ncmFtLmNzJyk7XG5cdFx0XHRhc3NlcnROb0dsb2JNYXRjaChwLCAnL0ROWENvbnNvbGVBcHAvZm9vL1Byb2dyYW0udHMnKTtcblx0XHRcdGFzc2VydE5vR2xvYk1hdGNoKHAsICcvRE5YQ29uc29sZUFwcC9Qcm9ncmFtLmNzJyk7XG5cdFx0XHRhc3NlcnROb0dsb2JNYXRjaChwLCAnL290aGVyL0ROWENvbnNvbGVBcHAvZm9vL1Byb2dyYW0udHMnKTtcblx0XHR9XG5cdH0pO1xuXG5cdHRlc3QoJ3JlbGF0aXZlIHBhdHRlcm4gLSBzaW5nbGUgc3RhcicsIGZ1bmN0aW9uICgpIHtcblx0XHRpZiAoaXNXaW5kb3dzKSB7XG5cdFx0XHRjb25zdCBwOiBnbG9iLklSZWxhdGl2ZVBhdHRlcm4gPSB7IGJhc2U6ICdDOlxcXFxETlhDb25zb2xlQXBwXFxcXGZvbycsIHBhdHRlcm46ICcqLmNzJyB9O1xuXHRcdFx0YXNzZXJ0R2xvYk1hdGNoKHAsICdDOlxcXFxETlhDb25zb2xlQXBwXFxcXGZvb1xcXFxQcm9ncmFtLmNzJyk7XG5cdFx0XHRhc3NlcnROb0dsb2JNYXRjaChwLCAnQzpcXFxcRE5YQ29uc29sZUFwcFxcXFxmb29cXFxcYmFyXFxcXFByb2dyYW0uY3MnKTtcblx0XHRcdGFzc2VydE5vR2xvYk1hdGNoKHAsICdDOlxcXFxETlhDb25zb2xlQXBwXFxcXGZvb1xcXFxQcm9ncmFtLnRzJyk7XG5cdFx0XHRhc3NlcnROb0dsb2JNYXRjaChwLCAnQzpcXFxcRE5YQ29uc29sZUFwcFxcXFxQcm9ncmFtLmNzJyk7XG5cdFx0XHRhc3NlcnROb0dsb2JNYXRjaChwLCAnQzpcXFxcb3RoZXJcXFxcRE5YQ29uc29sZUFwcFxcXFxmb29cXFxcUHJvZ3JhbS50cycpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRjb25zdCBwOiBnbG9iLklSZWxhdGl2ZVBhdHRlcm4gPSB7IGJhc2U6ICcvRE5YQ29uc29sZUFwcC9mb28nLCBwYXR0ZXJuOiAnKi5jcycgfTtcblx0XHRcdGFzc2VydEdsb2JNYXRjaChwLCAnL0ROWENvbnNvbGVBcHAvZm9vL1Byb2dyYW0uY3MnKTtcblx0XHRcdGFzc2VydE5vR2xvYk1hdGNoKHAsICcvRE5YQ29uc29sZUFwcC9mb28vYmFyL1Byb2dyYW0uY3MnKTtcblx0XHRcdGFzc2VydE5vR2xvYk1hdGNoKHAsICcvRE5YQ29uc29sZUFwcC9mb28vUHJvZ3JhbS50cycpO1xuXHRcdFx0YXNzZXJ0Tm9HbG9iTWF0Y2gocCwgJy9ETlhDb25zb2xlQXBwL1Byb2dyYW0uY3MnKTtcblx0XHRcdGFzc2VydE5vR2xvYk1hdGNoKHAsICcvb3RoZXIvRE5YQ29uc29sZUFwcC9mb28vUHJvZ3JhbS50cycpO1xuXHRcdH1cblx0fSk7XG5cblx0dGVzdCgncmVsYXRpdmUgcGF0dGVybiAtIHNpbmdsZSBzdGFyIHdpdGggcGF0aCcsIGZ1bmN0aW9uICgpIHtcblx0XHRpZiAoaXNXaW5kb3dzKSB7XG5cdFx0XHRjb25zdCBwOiBnbG9iLklSZWxhdGl2ZVBhdHRlcm4gPSB7IGJhc2U6ICdDOlxcXFxETlhDb25zb2xlQXBwXFxcXGZvbycsIHBhdHRlcm46ICdzb21ldGhpbmcvKi5jcycgfTtcblx0XHRcdGFzc2VydEdsb2JNYXRjaChwLCAnQzpcXFxcRE5YQ29uc29sZUFwcFxcXFxmb29cXFxcc29tZXRoaW5nXFxcXFByb2dyYW0uY3MnKTtcblx0XHRcdGFzc2VydE5vR2xvYk1hdGNoKHAsICdDOlxcXFxETlhDb25zb2xlQXBwXFxcXGZvb1xcXFxQcm9ncmFtLmNzJyk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdGNvbnN0IHA6IGdsb2IuSVJlbGF0aXZlUGF0dGVybiA9IHsgYmFzZTogJy9ETlhDb25zb2xlQXBwL2ZvbycsIHBhdHRlcm46ICdzb21ldGhpbmcvKi5jcycgfTtcblx0XHRcdGFzc2VydEdsb2JNYXRjaChwLCAnL0ROWENvbnNvbGVBcHAvZm9vL3NvbWV0aGluZy9Qcm9ncmFtLmNzJyk7XG5cdFx0XHRhc3NlcnROb0dsb2JNYXRjaChwLCAnL0ROWENvbnNvbGVBcHAvZm9vL1Byb2dyYW0uY3MnKTtcblx0XHR9XG5cdH0pO1xuXG5cdHRlc3QoJ3JlbGF0aXZlIHBhdHRlcm4gLSBzaW5nbGUgc3RhciBhbG9uZScsIGZ1bmN0aW9uICgpIHtcblx0XHRpZiAoaXNXaW5kb3dzKSB7XG5cdFx0XHRjb25zdCBwOiBnbG9iLklSZWxhdGl2ZVBhdHRlcm4gPSB7IGJhc2U6ICdDOlxcXFxETlhDb25zb2xlQXBwXFxcXGZvb1xcXFxzb21ldGhpbmdcXFxcUHJvZ3JhbS5jcycsIHBhdHRlcm46ICcqJyB9O1xuXHRcdFx0YXNzZXJ0R2xvYk1hdGNoKHAsICdDOlxcXFxETlhDb25zb2xlQXBwXFxcXGZvb1xcXFxzb21ldGhpbmdcXFxcUHJvZ3JhbS5jcycpO1xuXHRcdFx0YXNzZXJ0Tm9HbG9iTWF0Y2gocCwgJ0M6XFxcXEROWENvbnNvbGVBcHBcXFxcZm9vXFxcXFByb2dyYW0uY3MnKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0Y29uc3QgcDogZ2xvYi5JUmVsYXRpdmVQYXR0ZXJuID0geyBiYXNlOiAnL0ROWENvbnNvbGVBcHAvZm9vL3NvbWV0aGluZy9Qcm9ncmFtLmNzJywgcGF0dGVybjogJyonIH07XG5cdFx0XHRhc3NlcnRHbG9iTWF0Y2gocCwgJy9ETlhDb25zb2xlQXBwL2Zvby9zb21ldGhpbmcvUHJvZ3JhbS5jcycpO1xuXHRcdFx0YXNzZXJ0Tm9HbG9iTWF0Y2gocCwgJy9ETlhDb25zb2xlQXBwL2Zvby9Qcm9ncmFtLmNzJyk7XG5cdFx0fVxuXHR9KTtcblxuXHR0ZXN0KCdyZWxhdGl2ZSBwYXR0ZXJuIC0gaWdub3JlcyBjYXNlIG9uIG1hY09TL1dpbmRvd3MnLCBmdW5jdGlvbiAoKSB7XG5cdFx0aWYgKGlzV2luZG93cykge1xuXHRcdFx0Y29uc3QgcDogZ2xvYi5JUmVsYXRpdmVQYXR0ZXJuID0geyBiYXNlOiAnQzpcXFxcRE5YQ29uc29sZUFwcFxcXFxmb28nLCBwYXR0ZXJuOiAnc29tZXRoaW5nLyouY3MnIH07XG5cdFx0XHRhc3NlcnRHbG9iTWF0Y2gocCwgJ0M6XFxcXEROWENvbnNvbGVBcHBcXFxcZm9vXFxcXHNvbWV0aGluZ1xcXFxQcm9ncmFtLmNzJy50b0xvd2VyQ2FzZSgpKTtcblx0XHR9IGVsc2UgaWYgKGlzTWFjaW50b3NoKSB7XG5cdFx0XHRjb25zdCBwOiBnbG9iLklSZWxhdGl2ZVBhdHRlcm4gPSB7IGJhc2U6ICcvRE5YQ29uc29sZUFwcC9mb28nLCBwYXR0ZXJuOiAnc29tZXRoaW5nLyouY3MnIH07XG5cdFx0XHRhc3NlcnRHbG9iTWF0Y2gocCwgJy9ETlhDb25zb2xlQXBwL2Zvby9zb21ldGhpbmcvUHJvZ3JhbS5jcycudG9Mb3dlckNhc2UoKSk7XG5cdFx0fSBlbHNlIGlmIChpc0xpbnV4KSB7XG5cdFx0XHRjb25zdCBwOiBnbG9iLklSZWxhdGl2ZVBhdHRlcm4gPSB7IGJhc2U6ICcvRE5YQ29uc29sZUFwcC9mb28nLCBwYXR0ZXJuOiAnc29tZXRoaW5nLyouY3MnIH07XG5cdFx0XHRhc3NlcnROb0dsb2JNYXRjaChwLCAnL0ROWENvbnNvbGVBcHAvZm9vL3NvbWV0aGluZy9Qcm9ncmFtLmNzJy50b0xvd2VyQ2FzZSgpKTtcblx0XHR9XG5cdH0pO1xuXG5cdHRlc3QoJ3JlbGF0aXZlIHBhdHRlcm4gLSB0cmFpbGluZyBzbGFzaCAvIGJhY2tzbGFzaCAoIzE2MjQ5OCknLCBmdW5jdGlvbiAoKSB7XG5cdFx0aWYgKGlzV2luZG93cykge1xuXHRcdFx0bGV0IHA6IGdsb2IuSVJlbGF0aXZlUGF0dGVybiA9IHsgYmFzZTogJ0M6XFxcXCcsIHBhdHRlcm46ICdmb28uY3MnIH07XG5cdFx0XHRhc3NlcnRHbG9iTWF0Y2gocCwgJ0M6XFxcXGZvby5jcycpO1xuXG5cdFx0XHRwID0geyBiYXNlOiAnQzpcXFxcYmFyXFxcXCcsIHBhdHRlcm46ICdmb28uY3MnIH07XG5cdFx0XHRhc3NlcnRHbG9iTWF0Y2gocCwgJ0M6XFxcXGJhclxcXFxmb28uY3MnKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0bGV0IHA6IGdsb2IuSVJlbGF0aXZlUGF0dGVybiA9IHsgYmFzZTogJy8nLCBwYXR0ZXJuOiAnZm9vLmNzJyB9O1xuXHRcdFx0YXNzZXJ0R2xvYk1hdGNoKHAsICcvZm9vLmNzJyk7XG5cblx0XHRcdHAgPSB7IGJhc2U6ICcvYmFyLycsIHBhdHRlcm46ICdmb28uY3MnIH07XG5cdFx0XHRhc3NlcnRHbG9iTWF0Y2gocCwgJy9iYXIvZm9vLmNzJyk7XG5cdFx0fVxuXHR9KTtcblxuXHR0ZXN0KCdwYXR0ZXJuIHdpdGggXCJiYXNlXCIgZG9lcyBub3QgZXhwbG9kZSAtICMzNjA4MScsIGZ1bmN0aW9uICgpIHtcblx0XHRhc3NlcnQub2soZ2xvYi5tYXRjaCh7ICdiYXNlJzogdHJ1ZSB9LCAnYmFzZScpKTtcblx0fSk7XG5cblx0dGVzdCgncmVsYXRpdmUgcGF0dGVybiAtICM1NzQ3NScsIGZ1bmN0aW9uICgpIHtcblx0XHRpZiAoaXNXaW5kb3dzKSB7XG5cdFx0XHRjb25zdCBwOiBnbG9iLklSZWxhdGl2ZVBhdHRlcm4gPSB7IGJhc2U6ICdDOlxcXFxETlhDb25zb2xlQXBwXFxcXGZvbycsIHBhdHRlcm46ICdzdHlsZXMvc3R5bGUuY3NzJyB9O1xuXHRcdFx0YXNzZXJ0R2xvYk1hdGNoKHAsICdDOlxcXFxETlhDb25zb2xlQXBwXFxcXGZvb1xcXFxzdHlsZXNcXFxcc3R5bGUuY3NzJyk7XG5cdFx0XHRhc3NlcnROb0dsb2JNYXRjaChwLCAnQzpcXFxcRE5YQ29uc29sZUFwcFxcXFxmb29cXFxcUHJvZ3JhbS5jcycpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRjb25zdCBwOiBnbG9iLklSZWxhdGl2ZVBhdHRlcm4gPSB7IGJhc2U6ICcvRE5YQ29uc29sZUFwcC9mb28nLCBwYXR0ZXJuOiAnc3R5bGVzL3N0eWxlLmNzcycgfTtcblx0XHRcdGFzc2VydEdsb2JNYXRjaChwLCAnL0ROWENvbnNvbGVBcHAvZm9vL3N0eWxlcy9zdHlsZS5jc3MnKTtcblx0XHRcdGFzc2VydE5vR2xvYk1hdGNoKHAsICcvRE5YQ29uc29sZUFwcC9mb28vUHJvZ3JhbS5jcycpO1xuXHRcdH1cblx0fSk7XG5cblx0dGVzdCgnVVJJIG1hdGNoJywgKCkgPT4ge1xuXHRcdGNvbnN0IHAgPSAnc2NoZW1lOi8qKi8qLm1kJztcblx0XHRhc3NlcnRHbG9iTWF0Y2gocCwgVVJJLmZpbGUoJ3N1cGVyL2R1cGVyL2xvbmcvc29tZS9maWxlLm1kJykud2l0aCh7IHNjaGVtZTogJ3NjaGVtZScgfSkudG9TdHJpbmcoKSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2V4cHJlc3Npb24gZmFpbHMgd2hlbiBzaWJsaW5ncyB1c2UgcHJvbWlzZXMgKGh0dHBzOi8vZ2l0aHViLmNvbS9taWNyb3NvZnQvdnNjb2RlL2lzc3Vlcy8xNDYyOTQpJywgYXN5bmMgZnVuY3Rpb24gKCkge1xuXHRcdGNvbnN0IHNpYmxpbmdzID0gWyd0ZXN0Lmh0bWwnLCAndGVzdC50eHQnLCAndGVzdC50cyddO1xuXHRcdGNvbnN0IGhhc1NpYmxpbmcgPSAobmFtZTogc3RyaW5nKSA9PiBQcm9taXNlLnJlc29sdmUoc2libGluZ3MuaW5kZXhPZihuYW1lKSAhPT0gLTEpO1xuXG5cdFx0Ly8geyBcIioqLyouanNcIjogeyBcIndoZW5cIjogXCIkKGJhc2VuYW1lKS50c1wiIH0gfVxuXHRcdGNvbnN0IGV4cHJlc3Npb246IGdsb2IuSUV4cHJlc3Npb24gPSB7XG5cdFx0XHQnKiovdGVzdC5qcyc6IHsgd2hlbjogJyQoYmFzZW5hbWUpLmpzJyB9LFxuXHRcdFx0JyoqLyouanMnOiB7IHdoZW46ICckKGJhc2VuYW1lKS50cycgfVxuXHRcdH07XG5cblx0XHRjb25zdCBwYXJzZWRFeHByZXNzaW9uID0gZ2xvYi5wYXJzZShleHByZXNzaW9uKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCgnKiovKi5qcycsIGF3YWl0IHBhcnNlZEV4cHJlc3Npb24oJ3Rlc3QuanMnLCB1bmRlZmluZWQsIGhhc1NpYmxpbmcpKTtcblx0fSk7XG5cblx0dGVzdCgncGF0dGVybnNFcXVhbHMnLCAoKSA9PiB7XG5cdFx0YXNzZXJ0Lm9rKGdsb2IucGF0dGVybnNFcXVhbHMoWydhJ10sIFsnYSddKSk7XG5cdFx0YXNzZXJ0Lm9rKCFnbG9iLnBhdHRlcm5zRXF1YWxzKFsnYSddLCBbJ2InXSkpO1xuXG5cdFx0YXNzZXJ0Lm9rKGdsb2IucGF0dGVybnNFcXVhbHMoWydhJywgJ2InLCAnYyddLCBbJ2EnLCAnYicsICdjJ10pKTtcblx0XHRhc3NlcnQub2soIWdsb2IucGF0dGVybnNFcXVhbHMoWycxJywgJzInXSwgWycxJywgJzMnXSkpO1xuXG5cdFx0YXNzZXJ0Lm9rKGdsb2IucGF0dGVybnNFcXVhbHMoW3sgYmFzZTogJ2EnLCBwYXR0ZXJuOiAnKicgfSwgJ2InLCAnYyddLCBbeyBiYXNlOiAnYScsIHBhdHRlcm46ICcqJyB9LCAnYicsICdjJ10pKTtcblxuXHRcdGFzc2VydC5vayhnbG9iLnBhdHRlcm5zRXF1YWxzKHVuZGVmaW5lZCwgdW5kZWZpbmVkKSk7XG5cdFx0YXNzZXJ0Lm9rKCFnbG9iLnBhdHRlcm5zRXF1YWxzKHVuZGVmaW5lZCwgWydiJ10pKTtcblx0XHRhc3NlcnQub2soIWdsb2IucGF0dGVybnNFcXVhbHMoWydhJ10sIHVuZGVmaW5lZCkpO1xuXHR9KTtcblxuXHR0ZXN0KCdpc0VtcHR5UGF0dGVybicsICgpID0+IHtcblx0XHRhc3NlcnQub2soZ2xvYi5pc0VtcHR5UGF0dGVybihnbG9iLnBhcnNlKCcnKSkpO1xuXHRcdGFzc2VydC5vayhnbG9iLmlzRW1wdHlQYXR0ZXJuKGdsb2IucGFyc2UodW5kZWZpbmVkISkpKTtcblx0XHRhc3NlcnQub2soZ2xvYi5pc0VtcHR5UGF0dGVybihnbG9iLnBhcnNlKG51bGwhKSkpO1xuXG5cdFx0YXNzZXJ0Lm9rKGdsb2IuaXNFbXB0eVBhdHRlcm4oZ2xvYi5wYXJzZSh7fSkpKTtcblx0XHRhc3NlcnQub2soZ2xvYi5pc0VtcHR5UGF0dGVybihnbG9iLnBhcnNlKHsgJyc6IHRydWUgfSkpKTtcblx0XHRhc3NlcnQub2soZ2xvYi5pc0VtcHR5UGF0dGVybihnbG9iLnBhcnNlKHsgJyoqLyouanMnOiBmYWxzZSB9KSkpO1xuXHR9KTtcblxuXHR0ZXN0KCdjYXNlSW5zZW5zaXRpdmVNYXRjaCcsICgpID0+IHtcblx0XHRhc3NlcnROb0dsb2JNYXRjaCgnUEFUSC9GT08uanMnLCAncGF0aC9mb28uanMnKTtcblx0XHRhc3NlcnRHbG9iTWF0Y2goJ1BBVEgvRk9PLmpzJywgJ3BhdGgvZm9vLmpzJywgdHJ1ZSk7XG5cdFx0Ly8gVDFcblx0XHRhc3NlcnROb0dsb2JNYXRjaCgnKiovKi5KUycsICdiYXIvZm9vLmpzJyk7XG5cdFx0YXNzZXJ0R2xvYk1hdGNoKCcqKi8qLkpTJywgJ2Jhci9mb28uanMnLCB0cnVlKTtcblx0XHQvLyBUMlxuXHRcdGFzc2VydE5vR2xvYk1hdGNoKCcqKi9wYWNrYWdlJywgJ2Jhci9QYWNrYWdlJyk7XG5cdFx0YXNzZXJ0R2xvYk1hdGNoKCcqKi9wYWNrYWdlJywgJ2Jhci9QYWNrYWdlJywgdHJ1ZSk7XG5cdFx0Ly8gVDNcblx0XHRhc3NlcnROb0dsb2JNYXRjaCgneyoqLyouSlMsKiovKi5UU30nLCAnYmFyL2Zvby50cycpO1xuXHRcdGFzc2VydE5vR2xvYk1hdGNoKCd7KiovKi5KUywqKi8qLlRTfScsICdiYXIvZm9vLmpzJyk7XG5cdFx0YXNzZXJ0R2xvYk1hdGNoKCd7KiovKi5KUywqKi8qLlRTfScsICdiYXIvZm9vLnRzJywgdHJ1ZSk7XG5cdFx0YXNzZXJ0R2xvYk1hdGNoKCd7KiovKi5KUywqKi8qLlRTfScsICdiYXIvZm9vLmpzJywgdHJ1ZSk7XG5cdFx0Ly8gVDRcblx0XHRhc3NlcnROb0dsb2JNYXRjaCgnKiovRk9PL0JhcicsICdiYXIvZm9vL2JhcicpO1xuXHRcdGFzc2VydEdsb2JNYXRjaCgnKiovRk9PL0JhcicsICdiYXIvZm9vL2JhcicsIHRydWUpO1xuXHRcdC8vIFQ1XG5cdFx0YXNzZXJ0Tm9HbG9iTWF0Y2goJ0ZPTy9CYXInLCAnZm9vL2JhcicpO1xuXHRcdGFzc2VydEdsb2JNYXRjaCgnRk9PL0JhcicsICdmb28vYmFyJywgdHJ1ZSk7XG5cdFx0Ly8gT3RoZXJcblx0XHRhc3NlcnROb0dsb2JNYXRjaCgnc29tZS8qL1JhbmRvbS8qL1BhdGguRklMRScsICdzb21lL3ZlcnkvcmFuZG9tL3VudXN1YWwvcGF0aC5maWxlJyk7XG5cdFx0YXNzZXJ0R2xvYk1hdGNoKCdzb21lLyovUmFuZG9tLyovUGF0aC5GSUxFJywgJ3NvbWUvdmVyeS9yYW5kb20vdW51c3VhbC9wYXRoLmZpbGUnLCB0cnVlKTtcblx0fSk7XG5cblx0ZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlKCk7XG59KTtcbiJdLAogICJtYXBwaW5ncyI6ICJBQUtBLE9BQU8sWUFBWTtBQUNuQixZQUFZLFVBQVU7QUFDdEIsU0FBUyxXQUFXO0FBQ3BCLFNBQVMsU0FBUyxhQUFhLGlCQUFpQjtBQUNoRCxTQUFTLFdBQVc7QUFDcEIsU0FBUywrQ0FBK0M7QUFFeEQsTUFBTSxRQUFRLE1BQU07QUFzRG5CLFdBQVMsZ0JBQWdCLFNBQXlDLE9BQWUsWUFBc0I7QUFDdEcsV0FBTyxLQUFLLE1B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
