import { PreTrie, ExplorerFileNestingTrie, SufTrie } from "../../common/explorerFileNestingTrie.js";
import assert from "assert";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../../base/test/common/utils.js";
const fakeFilenameAttributes = { dirname: "mydir", basename: "", extname: "" };
suite("SufTrie", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  test("exactMatches", () => {
    const t = new SufTrie();
    t.add(".npmrc", "MyKey");
    assert.deepStrictEqual(t.get(".npmrc", fakeFilenameAttributes), ["MyKey"]);
    assert.deepStrictEqual(t.get(".npmrcs", fakeFilenameAttributes), []);
    assert.deepStrictEqual(t.get("a.npmrc", fakeFilenameAttributes), []);
  });
  test("starMatches", () => {
    const t = new SufTrie();
    t.add("*.npmrc", "MyKey");
    assert.deepStrictEqual(t.get(".npmrc", fakeFilenameAttributes), ["MyKey"]);
    assert.deepStrictEqual(t.get("npmrc", fakeFilenameAttributes), []);
    assert.deepStrictEqual(t.get(".npmrcs", fakeFilenameAttributes), []);
    assert.deepStrictEqual(t.get("a.npmrc", fakeFilenameAttributes), ["MyKey"]);
    assert.deepStrictEqual(t.get("a.b.c.d.npmrc", fakeFilenameAttributes), ["MyKey"]);
  });
  test("starSubstitutes", () => {
    const t = new SufTrie();
    t.add("*.npmrc", "${capture}.json");
    assert.deepStrictEqual(t.get(".npmrc", fakeFilenameAttributes), [".json"]);
    assert.deepStrictEqual(t.get("npmrc", fakeFilenameAttributes), []);
    assert.deepStrictEqual(t.get(".npmrcs", fakeFilenameAttributes), []);
    assert.deepStrictEqual(t.get("a.npmrc", fakeFilenameAttributes), ["a.json"]);
    assert.deepStrictEqual(t.get("a.b.c.d.npmrc", fakeFilenameAttributes), ["a.b.c.d.json"]);
  });
  test("multiMatches", () => {
    const t = new SufTrie();
    t.add("*.npmrc", "Key1");
    t.add("*.json", "Key2");
    t.add("*d.npmrc", "Key3");
    assert.deepStrictEqual(t.get(".npmrc", fakeFilenameAttributes), ["Key1"]);
    assert.deepStrictEqual(t.get("npmrc", fakeFilenameAttributes), []);
    assert.deepStrictEqual(t.get(".npmrcs", fakeFilenameAttributes), []);
    assert.deepStrictEqual(t.get(".json", fakeFilenameAttributes), ["Key2"]);
    assert.deepStrictEqual(t.get("a.json", fakeFilenameAttributes), ["Key2"]);
    assert.deepStrictEqual(t.get("a.npmrc", fakeFilenameAttributes), ["Key1"]);
    assert.deepStrictEqual(t.get("a.b.c.d.npmrc", fakeFilenameAttributes), ["Key1", "Key3"]);
  });
  test("multiSubstitutes", () => {
    const t = new SufTrie();
    t.add("*.npmrc", "Key1.${capture}.js");
    t.add("*.json", "Key2.${capture}.js");
    t.add("*d.npmrc", "Key3.${capture}.js");
    assert.deepStrictEqual(t.get(".npmrc", fakeFilenameAttributes), ["Key1..js"]);
    assert.deepStrictEqual(t.get("npmrc", fakeFilenameAttributes), []);
    assert.deepStrictEqual(t.get(".npmrcs", fakeFilenameAttributes), []);
    assert.deepStrictEqual(t.get(".json", fakeFilenameAttributes), ["Key2..js"]);
    assert.deepStrictEqual(t.get("a.json", fakeFilenameAttributes), ["Key2.a.js"]);
    assert.deepStrictEqual(t.get("a.npmrc", fakeFilenameAttributes), ["Key1.a.js"]);
    assert.deepStrictEqual(t.get("a.b.cd.npmrc", fakeFilenameAttributes), ["Key1.a.b.cd.js", "Key3.a.b.c.js"]);
    assert.deepStrictEqual(t.get("a.b.c.d.npmrc", fakeFilenameAttributes), ["Key1.a.b.c.d.js", "Key3.a.b.c..js"]);
  });
});
suite("PreTrie", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  test("exactMatches", () => {
    const t = new PreTrie();
    t.add(".npmrc", "MyKey");
    assert.deepStrictEqual(t.get(".npmrc", fakeFilenameAttributes), ["MyKey"]);
    assert.deepStrictEqual(t.get(".npmrcs", fakeFilenameAttributes), []);
    assert.deepStrictEqual(t.get("a.npmrc", fakeFilenameAttributes), []);
  });
  test("starMatches", () => {
    const t = new PreTrie();
    t.add("*.npmrc", "MyKey");
    assert.deepStrictEqual(t.get(".npmrc", fakeFilenameAttributes), ["MyKey"]);
    assert.deepStrictEqual(t.get("npmrc", fakeFilenameAttributes), []);
    assert.deepStrictEqual(t.get(".npmrcs", fakeFilenameAttributes), []);
    assert.deepStrictEqual(t.get("a.npmrc", fakeFilenameAttributes), ["MyKey"]);
    assert.deepStrictEqual(t.get("a.b.c.d.npmrc", fakeFilenameAttributes), ["MyKey"]);
  });
  test("starSubstitutes", () => {
    const t = new PreTrie();
    t.add("*.npmrc", "${capture}.json");
    assert.deepStrictEqual(t.get(".npmrc", fakeFilenameAttributes), [".json"]);
    assert.deepStrictEqual(t.get("npmrc", fakeFilenameAttributes), []);
    assert.deepStrictEqual(t.get(".npmrcs", fakeFilenameAttributes), []);
    assert.deepStrictEqual(t.get("a.npmrc", fakeFilenameAttributes), ["a.json"]);
    assert.deepStrictEqual(t.get("a.b.c.d.npmrc", fakeFilenameAttributes), ["a.b.c.d.json"]);
  });
  test("multiMatches", () => {
    const t = new PreTrie();
    t.add("*.npmrc", "Key1");
    t.add("*.json", "Key2");
    t.add("*d.npmrc", "Key3");
    assert.deepStrictEqual(t.get(".npmrc", fakeFilenameAttributes), ["Key1"]);
    assert.deepStrictEqual(t.get("npmrc", fakeFilenameAttributes), []);
    assert.deepStrictEqual(t.get(".npmrcs", fakeFilenameAttributes), []);
    assert.deepStrictEqual(t.get(".json", fakeFilenameAttributes), ["Key2"]);
    assert.deepStrictEqual(t.get("a.json", fakeFilenameAttributes), ["Key2"]);
    assert.deepStrictEqual(t.get("a.npmrc", fakeFilenameAttributes), ["Key1"]);
    assert.deepStrictEqual(t.get("a.b.c.d.npmrc", fakeFilenameAttributes), ["Key1", "Key3"]);
  });
  test("multiSubstitutes", () => {
    const t = new PreTrie();
    t.add("*.npmrc", "Key1.${capture}.js");
    t.add("*.json", "Key2.${capture}.js");
    t.add("*d.npmrc", "Key3.${capture}.js");
    assert.deepStrictEqual(t.get(".npmrc", fakeFilenameAttributes), ["Key1..js"]);
    assert.deepStrictEqual(t.get("npmrc", fakeFilenameAttributes), []);
    assert.deepStrictEqual(t.get(".npmrcs", fakeFilenameAttributes), []);
    assert.deepStrictEqual(t.get(".json", fakeFilenameAttributes), ["Key2..js"]);
    assert.deepStrictEqual(t.get("a.json", fakeFilenameAttributes), ["Key2.a.js"]);
    assert.deepStrictEqual(t.get("a.npmrc", fakeFilenameAttributes), ["Key1.a.js"]);
    assert.deepStrictEqual(t.get("a.b.cd.npmrc", fakeFilenameAttributes), ["Key1.a.b.cd.js", "Key3.a.b.c.js"]);
    assert.deepStrictEqual(t.get("a.b.c.d.npmrc", fakeFilenameAttributes), ["Key1.a.b.c.d.js", "Key3.a.b.c..js"]);
  });
  test("emptyMatches", () => {
    const t = new PreTrie();
    t.add("package*json", "package");
    assert.deepStrictEqual(t.get("package.json", fakeFilenameAttributes), ["package"]);
    assert.deepStrictEqual(t.get("packagejson", fakeFilenameAttributes), ["package"]);
    assert.deepStrictEqual(t.get("package-lock.json", fakeFilenameAttributes), ["package"]);
  });
});
suite("StarTrie", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  const assertMapEquals = (actual, expected) => {
    const actualStr = [...actual.entries()].map((e) => `${e[0]} => [${[...e[1].keys()].join()}]`);
    const expectedStr = Object.entries(expected).map((e) => `${e[0]}: [${[e[1]].join()}]`);
    const bigMsg = actualStr + "===" + expectedStr;
    assert.strictEqual(actual.size, Object.keys(expected).length, bigMsg);
    for (const parent of actual.keys()) {
      const act = actual.get(parent);
      const exp = expected[parent];
      const str = [...act.keys()].join() + "===" + exp.join();
      const msg = bigMsg + "\n" + str;
      assert(act.size === exp.length, msg);
      for (const child of exp) {
        assert(act.has(child), msg);
      }
    }
  };
  test("does added extension nesting", () => {
    const t = new ExplorerFileNestingTrie([
      ["*", ["${capture}.*"]]
    ]);
    const nesting = t.nest([
      "file",
      "file.json",
      "boop.test",
      "boop.test1",
      "boop.test.1",
      "beep",
      "beep.test1",
      "beep.boop.test1",
      "beep.boop.test2",
      "beep.boop.a"
    ], "mydir");
    assertMapEquals(nesting, {
      "file": ["file.json"],
      "boop.test": ["boop.test.1"],
      "boop.test1": [],
      "beep": ["beep.test1", "beep.boop.test1", "beep.boop.test2", "beep.boop.a"]
    });
  });
  test("does ext specific nesting", () => {
    const t = new ExplorerFileNestingTrie([
      ["*.ts", ["${capture}.js"]],
      ["*.js", ["${capture}.map"]]
    ]);
    const nesting = t.nest([
      "a.ts",
      "a.js",
      "a.jss",
      "ab.js",
      "b.js",
      "b.map",
      "c.ts",
      "c.js",
      "c.map",
      "d.ts",
      "d.map"
    ], "mydir");
    assertMapEquals(nesting, {
      "a.ts": ["a.js"],
      "ab.js": [],
      "a.jss": [],
      "b.js": ["b.map"],
      "c.ts": ["c.js", "c.map"],
      "d.ts": [],
      "d.map": []
    });
  });
  test("handles loops", () => {
    const t = new ExplorerFileNestingTrie([
      ["*.a", ["${capture}.b", "${capture}.c"]],
      ["*.b", ["${capture}.a"]],
      ["*.c", ["${capture}.d"]],
      ["*.aa", ["${capture}.bb"]],
      ["*.bb", ["${capture}.cc", "${capture}.dd"]],
      ["*.cc", ["${capture}.aa"]],
      ["*.dd", ["${capture}.ee"]]
    ]);
    const nesting = t.nest([
      ".a",
      ".b",
      ".c",
      ".d",
      "a.a",
      "a.b",
      "a.d",
      "a.aa",
      "a.bb",
      "a.cc",
      "b.aa",
      "b.bb",
      "c.bb",
      "c.cc",
      "d.aa",
      "d.cc",
      "e.aa",
      "e.bb",
      "e.dd",
      "e.ee",
      "f.aa",
      "f.bb",
      "f.cc",
      "f.dd",
      "f.ee"
    ], "mydir");
    assertMapEquals(nesting, {
      ".a": [],
      ".b": [],
      ".c": [],
      ".d": [],
      "a.a": [],
      "a.b": [],
      "a.d": [],
      "a.aa": [],
      "a.bb": [],
      "a.cc": [],
      "b.aa": ["b.bb"],
      "c.bb": ["c.cc"],
      "d.cc": ["d.aa"],
      "e.aa": ["e.bb", "e.dd", "e.ee"],
      "f.aa": [],
      "f.bb": [],
      "f.cc": [],
      "f.dd": [],
      "f.ee": []
    });
  });
  test("does general bidirectional suffix matching", () => {
    const t = new ExplorerFileNestingTrie([
      ["*-vsdoc.js", ["${capture}.js"]],
      ["*.js", ["${capture}-vscdoc.js"]]
    ]);
    const nesting = t.nest([
      "a-vsdoc.js",
      "a.js",
      "b.js",
      "b-vscdoc.js"
    ], "mydir");
    assertMapEquals(nesting, {
      "a-vsdoc.js": ["a.js"],
      "b.js": ["b-vscdoc.js"]
    });
  });
  test("does general bidirectional prefix matching", () => {
    const t = new ExplorerFileNestingTrie([
      ["vsdoc-*.js", ["${capture}.js"]],
      ["*.js", ["vscdoc-${capture}.js"]]
    ]);
    const nesting = t.nest([
      "vsdoc-a.js",
      "a.js",
      "b.js",
      "vscdoc-b.js"
    ], "mydir");
    assertMapEquals(nesting, {
      "vsdoc-a.js": ["a.js"],
      "b.js": ["vscdoc-b.js"]
    });
  });
  test("does general bidirectional general matching", () => {
    const t = new ExplorerFileNestingTrie([
      ["foo-*-bar.js", ["${capture}.js"]],
      ["*.js", ["bib-${capture}-bap.js"]]
    ]);
    const nesting = t.nest([
      "foo-a-bar.js",
      "a.js",
      "b.js",
      "bib-b-bap.js"
    ], "mydir");
    assertMapEquals(nesting, {
      "foo-a-bar.js": ["a.js"],
      "b.js": ["bib-b-bap.js"]
    });
  });
  test("does extension specific path segment matching", () => {
    const t = new ExplorerFileNestingTrie([
      ["*.js", ["${capture}.*.js"]]
    ]);
    const nesting = t.nest([
      "foo.js",
      "foo.test.js",
      "fooTest.js",
      "bar.js.js"
    ], "mydir");
    assertMapEquals(nesting, {
      "foo.js": ["foo.test.js"],
      "fooTest.js": [],
      "bar.js.js": []
    });
  });
  test("does exact match nesting", () => {
    const t = new ExplorerFileNestingTrie([
      ["package.json", [".npmrc", "npm-shrinkwrap.json", "yarn.lock", ".yarnclean", ".yarnignore", ".yarn-integrity", ".yarnrc"]],
      ["bower.json", [".bowerrc"]]
    ]);
    const nesting = t.nest([
      "package.json",
      ".npmrc",
      "npm-shrinkwrap.json",
      "yarn.lock",
      ".bowerrc"
    ], "mydir");
    assertMapEquals(nesting, {
      "package.json": [
        ".npmrc",
        "npm-shrinkwrap.json",
        "yarn.lock"
      ],
      ".bowerrc": []
    });
  });
  test("eslint test", () => {
    const t = new ExplorerFileNestingTrie([
      [".eslintrc*", [".eslint*"]]
    ]);
    const nesting1 = t.nest([
      ".eslintrc.json",
      ".eslintignore"
    ], "mydir");
    assertMapEquals(nesting1, {
      ".eslintrc.json": [".eslintignore"]
    });
    const nesting2 = t.nest([
      ".eslintrc",
      ".eslintignore"
    ], "mydir");
    assertMapEquals(nesting2, {
      ".eslintrc": [".eslintignore"]
    });
  });
  test("basename expansion", () => {
    const t = new ExplorerFileNestingTrie([
      ["*-vsdoc.js", ["${basename}.doc"]]
    ]);
    const nesting1 = t.nest([
      "boop-vsdoc.js",
      "boop-vsdoc.doc",
      "boop.doc"
    ], "mydir");
    assertMapEquals(nesting1, {
      "boop-vsdoc.js": ["boop-vsdoc.doc"],
      "boop.doc": []
    });
  });
  test("extname expansion", () => {
    const t = new ExplorerFileNestingTrie([
      ["*-vsdoc.js", ["${extname}.doc"]]
    ]);
    const nesting1 = t.nest([
      "boop-vsdoc.js",
      "js.doc",
      "boop.doc"
    ], "mydir");
    assertMapEquals(nesting1, {
      "boop-vsdoc.js": ["js.doc"],
      "boop.doc": []
    });
  });
  test("added segment matcher", () => {
    const t = new ExplorerFileNestingTrie([
      ["*", ["${basename}.*.${extname}"]]
    ]);
    const nesting1 = t.nest([
      "some.file",
      "some.html.file",
      "some.html.nested.file",
      "other.file",
      "some.thing",
      "some.thing.else"
    ], "mydir");
    assertMapEquals(nesting1, {
      "some.file": ["some.html.file", "some.html.nested.file"],
      "other.file": [],
      "some.thing": [],
      "some.thing.else": []
    });
  });
  test("added segment matcher (old format)", () => {
    const t = new ExplorerFileNestingTrie([
      ["*", ["$(basename).*.$(extname)"]]
    ]);
    const nesting1 = t.nest([
      "some.file",
      "some.html.file",
      "some.html.nested.file",
      "other.file",
      "some.thing",
      "some.thing.else"
    ], "mydir");
    assertMapEquals(nesting1, {
      "some.file": ["some.html.file", "some.html.nested.file"],
      "other.file": [],
      "some.thing": [],
      "some.thing.else": []
    });
  });
  test("dirname matching", () => {
    const t = new ExplorerFileNestingTrie([
      ["index.ts", ["${dirname}.ts"]]
    ]);
    const nesting1 = t.nest([
      "otherFile.ts",
      "MyComponent.ts",
      "index.ts"
    ], "MyComponent");
    assertMapEquals(nesting1, {
      "index.ts": ["MyComponent.ts"],
      "otherFile.ts": []
    });
  });
  test.skip("is fast", () => {
    const bigNester = new ExplorerFileNestingTrie([
      ["*", ["${capture}.*"]],
      ["*.js", ["${capture}.*.js", "${capture}.map"]],
      ["*.jsx", ["${capture}.js"]],
      ["*.ts", ["${capture}.js", "${capture}.*.ts"]],
      ["*.tsx", ["${capture}.js"]],
      ["*.css", ["${capture}.*.css", "${capture}.map"]],
      ["*.html", ["${capture}.*.html"]],
      ["*.htm", ["${capture}.*.htm"]],
      ["*.less", ["${capture}.*.less", "${capture}.css"]],
      ["*.scss", ["${capture}.*.scss", "${capture}.css"]],
      ["*.sass", ["${capture}.css"]],
      ["*.styl", ["${capture}.css"]],
      ["*.coffee", ["${capture}.*.coffee", "${capture}.js"]],
      ["*.iced", ["${capture}.*.iced", "${capture}.js"]],
      ["*.config", ["${capture}.*.config"]],
      ["*.cs", ["${capture}.*.cs", "${capture}.cs.d.ts"]],
      ["*.vb", ["${capture}.*.vb"]],
      ["*.json", ["${capture}.*.json"]],
      ["*.md", ["${capture}.html"]],
      ["*.mdown", ["${capture}.html"]],
      ["*.markdown", ["${capture}.html"]],
      ["*.mdwn", ["${capture}.html"]],
      ["*.svg", ["${capture}.svgz"]],
      ["*.a", ["${capture}.b"]],
      ["*.b", ["${capture}.a"]],
      ["*.resx", ["${capture}.designer.cs"]],
      ["package.json", [".npmrc", "npm-shrinkwrap.json", "yarn.lock", ".yarnclean", ".yarnignore", ".yarn-integrity", ".yarnrc"]],
      ["bower.json", [".bowerrc"]],
      ["*-vsdoc.js", ["${capture}.js"]],
      ["*.tt", ["${capture}.*"]]
    ]);
    const bigFiles = Array.from({ length: 5e4 / 6 }).map((_, i) => [
      "file" + i + ".js",
      "file" + i + ".map",
      "file" + i + ".css",
      "file" + i + ".ts",
      "file" + i + ".d.ts",
      "file" + i + ".jsx"
    ]).flat();
    const start = performance.now();
    bigNester.nest(bigFiles, "mydir");
    const end = performance.now();
    assert(end - start < 1e3, "too slow..." + (end - start));
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXGZpbGVzXFx0ZXN0XFxicm93c2VyXFxleHBsb3JlckZpbGVOZXN0aW5nVHJpZS50ZXN0LnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cbmltcG9ydCB7IFByZVRyaWUsIEV4cGxvcmVyRmlsZU5lc3RpbmdUcmllLCBTdWZUcmllIH0gZnJvbSAnLi4vLi4vY29tbW9uL2V4cGxvcmVyRmlsZU5lc3RpbmdUcmllLmpzJztcbmltcG9ydCBhc3NlcnQgZnJvbSAnYXNzZXJ0JztcbmltcG9ydCB7IGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvdGVzdC9jb21tb24vdXRpbHMuanMnO1xuXG5jb25zdCBmYWtlRmlsZW5hbWVBdHRyaWJ1dGVzID0geyBkaXJuYW1lOiAnbXlkaXInLCBiYXNlbmFtZTogJycsIGV4dG5hbWU6ICcnIH07XG5cbnN1aXRlKCdTdWZUcmllJywgKCkgPT4ge1xuXHRlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUoKTtcblxuXHR0ZXN0KCdleGFjdE1hdGNoZXMnLCAoKSA9PiB7XG5cdFx0Y29uc3QgdCA9IG5ldyBTdWZUcmllKCk7XG5cdFx0dC5hZGQoJy5ucG1yYycsICdNeUtleScpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwodC5nZXQoJy5ucG1yYycsIGZha2VGaWxlbmFtZUF0dHJpYnV0ZXMpLCBbJ015S2V5J10pO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwodC5nZXQoJy5ucG1yY3MnLCBmYWtlRmlsZW5hbWVBdHRyaWJ1dGVzKSwgW10pO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwodC5nZXQoJ2EubnBtcmMnLCBmYWtlRmlsZW5hbWVBdHRyaWJ1dGVzKSwgW10pO1xuXHR9KTtcblxuXHR0ZXN0KCdzdGFyTWF0Y2hlcycsICgpID0+IHtcblx0XHRjb25zdCB0ID0gbmV3IFN1ZlRyaWUoKTtcblx0XHR0LmFkZCgnKi5ucG1yYycsICdNeUtleScpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwodC5nZXQoJy5ucG1yYycsIGZha2VGaWxlbmFtZUF0dHJpYnV0ZXMpLCBbJ015S2V5J10pO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwodC5nZXQoJ25wbXJjJywgZmFrZUZpbGVuYW1lQXR0cmlidXRlcyksIFtdKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHQuZ2V0KCcubnBtcmNzJywgZmFrZUZpbGVuYW1lQXR0cmlidXRlcyksIFtdKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHQuZ2V0KCdhLm5wbXJjJywgZmFrZUZpbGVuYW1lQXR0cmlidXRlcyksIFsnTXlLZXknXSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh0LmdldCgnYS5iLmMuZC5ucG1yYycsIGZha2VGaWxlbmFtZUF0dHJpYnV0ZXMpLCBbJ015S2V5J10pO1xuXHR9KTtcblxuXHR0ZXN0KCdzdGFyU3Vic3RpdHV0ZXMnLCAoKSA9PiB7XG5cdFx0Y29uc3QgdCA9IG5ldyBTdWZUcmllKCk7XG5cdFx0dC5hZGQoJyoubnBtcmMnLCAnJHtjYXB0dXJlfS5qc29uJyk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh0LmdldCgnLm5wbXJjJywgZmFrZUZpbGVuYW1lQXR0cmlidXRlcyksIFsnLmpzb24nXSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh0LmdldCgnbnBtcmMnLCBmYWtlRmlsZW5hbWVBdHRyaWJ1dGVzKSwgW10pO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwodC5nZXQoJy5ucG1yY3MnLCBmYWtlRmlsZW5hbWVBdHRyaWJ1dGVzKSwgW10pO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwodC5nZXQoJ2EubnBtcmMnLCBmYWtlRmlsZW5hbWVBdHRyaWJ1dGVzKSwgWydhLmpzb24nXSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh0LmdldCgnYS5iLmMuZC5ucG1yYycsIGZha2VGaWxlbmFtZUF0dHJpYnV0ZXMpLCBbJ2EuYi5jLmQuanNvbiddKTtcblx0fSk7XG5cblx0dGVzdCgnbXVsdGlNYXRjaGVzJywgKCkgPT4ge1xuXHRcdGNvbnN0IHQgPSBuZXcgU3VmVHJpZSgpO1xuXHRcdHQuYWRkKCcqLm5wbXJjJywgJ0tleTEnKTtcblx0XHR0LmFkZCgnKi5qc29uJywgJ0tleTInKTtcblx0XHR0LmFkZCgnKmQubnBtcmMnLCAnS2V5MycpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwodC5nZXQoJy5ucG1yYycsIGZha2VGaWxlbmFtZUF0dHJpYnV0ZXMpLCBbJ0tleTEnXSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh0LmdldCgnbnBtcmMnLCBmYWtlRmlsZW5hbWVBdHRyaWJ1dGVzKSwgW10pO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwodC5nZXQoJy5ucG1yY3MnLCBmYWtlRmlsZW5hbWVBdHRyaWJ1dGVzKSwgW10pO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwodC5nZXQoJy5qc29uJywgZmFrZUZpbGVuYW1lQXR0cmlidXRlcyksIFsnS2V5MiddKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHQuZ2V0KCdhLmpzb24nLCBmYWtlRmlsZW5hbWVBdHRyaWJ1dGVzKSwgWydLZXkyJ10pO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwodC5nZXQoJ2EubnBtcmMnLCBmYWtlRmlsZW5hbWVBdHRyaWJ1dGVzKSwgWydLZXkxJ10pO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwodC5nZXQoJ2EuYi5jLmQubnBtcmMnLCBmYWtlRmlsZW5hbWVBdHRyaWJ1dGVzKSwgWydLZXkxJywgJ0tleTMnXSk7XG5cdH0pO1xuXG5cdHRlc3QoJ211bHRpU3Vic3RpdHV0ZXMnLCAoKSA9PiB7XG5cdFx0Y29uc3QgdCA9IG5ldyBTdWZUcmllKCk7XG5cdFx0dC5hZGQoJyoubnBtcmMnLCAnS2V5MS4ke2NhcHR1cmV9LmpzJyk7XG5cdFx0dC5hZGQoJyouanNvbicsICdLZXkyLiR7Y2FwdHVyZX0uanMnKTtcblx0XHR0LmFkZCgnKmQubnBtcmMnLCAnS2V5My4ke2NhcHR1cmV9LmpzJyk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh0LmdldCgnLm5wbXJjJywgZmFrZUZpbGVuYW1lQXR0cmlidXRlcyksIFsnS2V5MS4uanMnXSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh0LmdldCgnbnBtcmMnLCBmYWtlRmlsZW5hbWVBdHRyaWJ1dGVzKSwgW10pO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwodC5nZXQoJy5ucG1yY3MnLCBmYWtlRmlsZW5hbWVBdHRyaWJ1dGVzKSwgW10pO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwodC5nZXQoJy5qc29uJywgZmFrZUZpbGVuYW1lQXR0cmlidXRlcyksIFsnS2V5Mi4uanMnXSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh0LmdldCgnYS5qc29uJywgZmFrZUZpbGVuYW1lQXR0cmlidXRlcyksIFsnS2V5Mi5hLmpzJ10pO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwodC5nZXQoJ2EubnBtcmMnLCBmYWtlRmlsZW5hbWVBdHRyaWJ1dGVzKSwgWydLZXkxLmEuanMnXSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh0LmdldCgnYS5iLmNkLm5wbXJjJywgZmFrZUZpbGVuYW1lQXR0cmlidXRlcyksIFsnS2V5MS5hLmIuY2QuanMnLCAnS2V5My5hLmIuYy5qcyddKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHQuZ2V0KCdhLmIuYy5kLm5wbXJjJywgZmFrZUZpbGVuYW1lQXR0cmlidXRlcyksIFsnS2V5MS5hLmIuYy5kLmpzJywgJ0tleTMuYS5iLmMuLmpzJ10pO1xuXHR9KTtcbn0pO1xuXG5zdWl0ZSgnUHJlVHJpZScsICgpID0+IHtcblx0ZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlKCk7XG5cblx0dGVzdCgnZXhhY3RNYXRjaGVzJywgKCkgPT4ge1xuXHRcdGNvbnN0IHQgPSBuZXcgUHJlVHJpZSgpO1xuXHRcdHQuYWRkKCcubnBtcmMnLCAnTXlLZXknKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHQuZ2V0KCcubnBtcmMnLCBmYWtlRmlsZW5hbWVBdHRyaWJ1dGVzKSwgWydNeUtleSddKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHQuZ2V0KCcubnBtcmNzJywgZmFrZUZpbGVuYW1lQXR0cmlidXRlcyksIFtdKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHQuZ2V0KCdhLm5wbXJjJywgZmFrZUZpbGVuYW1lQXR0cmlidXRlcyksIFtdKTtcblx0fSk7XG5cblx0dGVzdCgnc3Rhck1hdGNoZXMnLCAoKSA9PiB7XG5cdFx0Y29uc3QgdCA9IG5ldyBQcmVUcmllKCk7XG5cdFx0dC5hZGQoJyoubnBtcmMnLCAnTXlLZXknKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHQuZ2V0KCcubnBtcmMnLCBmYWtlRmlsZW5hbWVBdHRyaWJ1dGVzKSwgWydNeUtleSddKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHQuZ2V0KCducG1yYycsIGZha2VGaWxlbmFtZUF0dHJpYnV0ZXMpLCBbXSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh0LmdldCgnLm5wbXJjcycsIGZha2VGaWxlbmFtZUF0dHJpYnV0ZXMpLCBbXSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh0LmdldCgnYS5ucG1yYycsIGZha2VGaWxlbmFtZUF0dHJpYnV0ZXMpLCBbJ015S2V5J10pO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwodC5nZXQoJ2EuYi5jLmQubnBtcmMnLCBmYWtlRmlsZW5hbWVBdHRyaWJ1dGVzKSwgWydNeUtleSddKTtcblx0fSk7XG5cblx0dGVzdCgnc3RhclN1YnN0aXR1dGVzJywgKCkgPT4ge1xuXHRcdGNvbnN0IHQgPSBuZXcgUHJlVHJpZSgpO1xuXHRcdHQuYWRkKCcqLm5wbXJjJywgJyR7Y2FwdHVyZX0uanNvbicpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwodC5nZXQoJy5ucG1yYycsIGZha2VGaWxlbmFtZUF0dHJpYnV0ZXMpLCBbJy5qc29uJ10pO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwodC5nZXQoJ25wbXJjJywgZmFrZUZpbGVuYW1lQXR0cmlidXRlcyksIFtdKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHQuZ2V0KCcubnBtcmNzJywgZmFrZUZpbGVuYW1lQXR0cmlidXRlcyksIFtdKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHQuZ2V0KCdhLm5wbXJjJywgZmFrZUZpbGVuYW1lQXR0cmlidXRlcyksIFsnYS5qc29uJ10pO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwodC5nZXQoJ2EuYi5jLmQubnBtcmMnLCBmYWtlRmlsZW5hbWVBdHRyaWJ1dGVzKSwgWydhLmIuYy5kLmpzb24nXSk7XG5cdH0pO1xuXG5cdHRlc3QoJ211bHRpTWF0Y2hlcycsICgpID0+IHtcblx0XHRjb25zdCB0ID0gbmV3IFByZVRyaWUoKTtcblx0XHR0LmFkZCgnKi5ucG1yYycsICdLZXkxJyk7XG5cdFx0dC5hZGQoJyouanNvbicsICdLZXkyJyk7XG5cdFx0dC5hZGQoJypkLm5wbXJjJywgJ0tleTMnKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHQuZ2V0KCcubnBtcmMnLCBmYWtlRmlsZW5hbWVBdHRyaWJ1dGVzKSwgWydLZXkxJ10pO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwodC5nZXQoJ25wbXJjJywgZmFrZUZpbGVuYW1lQXR0cmlidXRlcyksIFtdKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHQuZ2V0KCcubnBtcmNzJywgZmFrZUZpbGVuYW1lQXR0cmlidXRlcyksIFtdKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHQuZ2V0KCcuanNvbicsIGZha2VGaWxlbmFtZUF0dHJpYnV0ZXMpLCBbJ0tleTInXSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh0LmdldCgnYS5qc29uJywgZmFrZUZpbGVuYW1lQXR0cmlidXRlcyksIFsnS2V5MiddKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHQuZ2V0KCdhLm5wbXJjJywgZmFrZUZpbGVuYW1lQXR0cmlidXRlcyksIFsnS2V5MSddKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHQuZ2V0KCdhLmIuYy5kLm5wbXJjJywgZmFrZUZpbGVuYW1lQXR0cmlidXRlcyksIFsnS2V5MScsICdLZXkzJ10pO1xuXHR9KTtcblxuXHR0ZXN0KCdtdWx0aVN1YnN0aXR1dGVzJywgKCkgPT4ge1xuXHRcdGNvbnN0IHQgPSBuZXcgUHJlVHJpZSgpO1xuXHRcdHQuYWRkKCcqLm5wbXJjJywgJ0tleTEuJHtjYXB0dXJlfS5qcycpO1xuXHRcdHQuYWRkKCcqLmpzb24nLCAnS2V5Mi4ke2NhcHR1cmV9LmpzJyk7XG5cdFx0dC5hZGQoJypkLm5wbXJjJywgJ0tleTMuJHtjYXB0dXJlfS5qcycpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwodC5nZXQoJy5ucG1yYycsIGZha2VGaWxlbmFtZUF0dHJpYnV0ZXMpLCBbJ0tleTEuLmpzJ10pO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwodC5nZXQoJ25wbXJjJywgZmFrZUZpbGVuYW1lQXR0cmlidXRlcyksIFtdKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHQuZ2V0KCcubnBtcmNzJywgZmFrZUZpbGVuYW1lQXR0cmlidXRlcyksIFtdKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHQuZ2V0KCcuanNvbicsIGZha2VGaWxlbmFtZUF0dHJpYnV0ZXMpLCBbJ0tleTIuLmpzJ10pO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwodC5nZXQoJ2EuanNvbicsIGZha2VGaWxlbmFtZUF0dHJpYnV0ZXMpLCBbJ0tleTIuYS5qcyddKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHQuZ2V0KCdhLm5wbXJjJywgZmFrZUZpbGVuYW1lQXR0cmlidXRlcyksIFsnS2V5MS5hLmpzJ10pO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwodC5nZXQoJ2EuYi5jZC5ucG1yYycsIGZha2VGaWxlbmFtZUF0dHJpYnV0ZXMpLCBbJ0tleTEuYS5iLmNkLmpzJywgJ0tleTMuYS5iLmMuanMnXSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh0LmdldCgnYS5iLmMuZC5ucG1yYycsIGZha2VGaWxlbmFtZUF0dHJpYnV0ZXMpLCBbJ0tleTEuYS5iLmMuZC5qcycsICdLZXkzLmEuYi5jLi5qcyddKTtcblx0fSk7XG5cblxuXHR0ZXN0KCdlbXB0eU1hdGNoZXMnLCAoKSA9PiB7XG5cdFx0Y29uc3QgdCA9IG5ldyBQcmVUcmllKCk7XG5cdFx0dC5hZGQoJ3BhY2thZ2UqanNvbicsICdwYWNrYWdlJyk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh0LmdldCgncGFja2FnZS5qc29uJywgZmFrZUZpbGVuYW1lQXR0cmlidXRlcyksIFsncGFja2FnZSddKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHQuZ2V0KCdwYWNrYWdlanNvbicsIGZha2VGaWxlbmFtZUF0dHJpYnV0ZXMpLCBbJ3BhY2thZ2UnXSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh0LmdldCgncGFja2FnZS1sb2NrLmpzb24nLCBmYWtlRmlsZW5hbWVBdHRyaWJ1dGVzKSwgWydwYWNrYWdlJ10pO1xuXHR9KTtcbn0pO1xuXG5zdWl0ZSgnU3RhclRyaWUnLCAoKSA9PiB7XG5cdGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSgpO1xuXG5cdGNvbnN0IGFzc2VydE1hcEVxdWFscyA9IChhY3R1YWw6IE1hcDxzdHJpbmcsIFNldDxzdHJpbmc+PiwgZXhwZWN0ZWQ6IFJlY29yZDxzdHJpbmcsIHN0cmluZ1tdPikgPT4ge1xuXHRcdGNvbnN0IGFjdHVhbFN0ciA9IFsuLi5hY3R1YWwuZW50cmllcygpXS5tYXAoZSA9PiBgJHtlWzBdfSA9PiBbJHtbLi4uZVsxXS5rZXlzKCldLmpvaW4oKX1dYCk7XG5cdFx0Y29uc3QgZXhwZWN0ZWRTdHIgPSBPYmplY3QuZW50cmllcyhleHBlY3RlZCkubWFwKGUgPT4gYCR7ZVswXX06IFske1tlWzFdXS5qb2luKCl9XWApO1xuXHRcdGNvbnN0IGJpZ01zZyA9IGFjdHVhbFN0ciArICc9PT0nICsgZXhwZWN0ZWRTdHI7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGFjdHVhbC5zaXplLCBPYmplY3Qua2V5cyhleHBlY3RlZCkubGVuZ3RoLCBiaWdNc2cpO1xuXHRcdGZvciAoY29uc3QgcGFyZW50IG9mIGFjdHVhbC5rZXlzKCkpIHtcblx0XHRcdGNvbnN0IGFjdCA9IGFjdHVhbC5nZXQocGFyZW50KSE7XG5cdFx0XHRjb25zdCBleHAgPSBleHBlY3RlZFtwYXJlbnRdO1xuXHRcdFx0Y29uc3Qgc3RyID0gWy4uLmFjdC5rZXlzKCldLmpvaW4oKSArICc9PT0nICsgZXhwLmpvaW4oKTtcblx0XHRcdGNvbnN0IG1zZyA9IGJpZ01zZyArICdcXG4nICsgc3RyO1xuXHRcdFx0YXNzZXJ0KGFjdC5zaXplID09PSBleHAubGVuZ3RoLCBtc2cpO1xuXHRcdFx0Zm9yIChjb25zdCBjaGlsZCBvZiBleHApIHtcblx0XHRcdFx0YXNzZXJ0KGFjdC5oYXMoY2hpbGQpLCBtc2cpO1xuXHRcdFx0fVxuXHRcdH1cblx0fTtcblxuXHR0ZXN0KCdkb2VzIGFkZGVkIGV4dGVuc2lvbiBuZXN0aW5nJywgKCkgPT4ge1xuXHRcdGNvbnN0IHQgPSBuZXcgRXhwbG9yZXJGaWxlTmVzdGluZ1RyaWUoW1xuXHRcdFx0WycqJywgWycke2NhcHR1cmV9LionXV0sXG5cdFx0XSk7XG5cdFx0Y29uc3QgbmVzdGluZyA9IHQubmVzdChbXG5cdFx0XHQnZmlsZScsXG5cdFx0XHQnZmlsZS5qc29uJyxcblx0XHRcdCdib29wLnRlc3QnLFxuXHRcdFx0J2Jvb3AudGVzdDEnLFxuXHRcdFx0J2Jvb3AudGVzdC4xJyxcblx0XHRcdCdiZWVwJyxcblx0XHRcdCdiZWVwLnRlc3QxJyxcblx0XHRcdCdiZWVwLmJvb3AudGVzdDEnLFxuXHRcdFx0J2JlZXAuYm9vcC50ZXN0MicsXG5cdFx0XHQnYmVlcC5ib29wLmEnLFxuXHRcdF0sICdteWRpcicpO1xuXHRcdGFzc2VydE1hcEVxdWFscyhuZXN0aW5nLCB7XG5cdFx0XHQnZmlsZSc6IFsnZmlsZS5qc29uJ10sXG5cdFx0XHQnYm9vcC50ZXN0JzogWydib29wLnRlc3QuMSddLFxuXHRcdFx0J2Jvb3AudGVzdDEnOiBbXSxcblx0XHRcdCdiZWVwJzogWydiZWVwLnRlc3QxJywgJ2JlZXAuYm9vcC50ZXN0MScsICdiZWVwLmJvb3AudGVzdDInLCAnYmVlcC5ib29wLmEnXVxuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdkb2VzIGV4dCBzcGVjaWZpYyBuZXN0aW5nJywgKCkgPT4ge1xuXHRcdGNvbnN0IHQgPSBuZXcgRXhwbG9yZXJGaWxlTmVzdGluZ1RyaWUoW1xuXHRcdFx0WycqLnRzJywgWycke2NhcHR1cmV9LmpzJ11dLFxuXHRcdFx0WycqLmpzJywgWycke2NhcHR1cmV9Lm1hcCddXSxcblx0XHRdKTtcblx0XHRjb25zdCBuZXN0aW5nID0gdC5uZXN0KFtcblx0XHRcdCdhLnRzJyxcblx0XHRcdCdhLmpzJyxcblx0XHRcdCdhLmpzcycsXG5cdFx0XHQnYWIuanMnLFxuXHRcdFx0J2IuanMnLFxuXHRcdFx0J2IubWFwJyxcblx0XHRcdCdjLnRzJyxcblx0XHRcdCdjLmpzJyxcblx0XHRcdCdjLm1hcCcsXG5cdFx0XHQnZC50cycsXG5cdFx0XHQnZC5tYXAnLFxuXHRcdF0sICdteWRpcicpO1xuXHRcdGFzc2VydE1hcEVxdWFscyhuZXN0aW5nLCB7XG5cdFx0XHQnYS50cyc6IFsnYS5qcyddLFxuXHRcdFx0J2FiLmpzJzogW10sXG5cdFx0XHQnYS5qc3MnOiBbXSxcblx0XHRcdCdiLmpzJzogWydiLm1hcCddLFxuXHRcdFx0J2MudHMnOiBbJ2MuanMnLCAnYy5tYXAnXSxcblx0XHRcdCdkLnRzJzogW10sXG5cdFx0XHQnZC5tYXAnOiBbXSxcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnaGFuZGxlcyBsb29wcycsICgpID0+IHtcblx0XHRjb25zdCB0ID0gbmV3IEV4cGxvcmVyRmlsZU5lc3RpbmdUcmllKFtcblx0XHRcdFsnKi5hJywgWycke2NhcHR1cmV9LmInLCAnJHtjYXB0dXJlfS5jJ11dLFxuXHRcdFx0WycqLmInLCBbJyR7Y2FwdHVyZX0uYSddXSxcblx0XHRcdFsnKi5jJywgWycke2NhcHR1cmV9LmQnXV0sXG5cblx0XHRcdFsnKi5hYScsIFsnJHtjYXB0dXJlfS5iYiddXSxcblx0XHRcdFsnKi5iYicsIFsnJHtjYXB0dXJlfS5jYycsICcke2NhcHR1cmV9LmRkJ11dLFxuXHRcdFx0WycqLmNjJywgWycke2NhcHR1cmV9LmFhJ11dLFxuXHRcdFx0WycqLmRkJywgWycke2NhcHR1cmV9LmVlJ11dLFxuXHRcdF0pO1xuXHRcdGNvbnN0IG5lc3RpbmcgPSB0Lm5lc3QoW1xuXHRcdFx0Jy5hJywgJy5iJywgJy5jJywgJy5kJyxcblx0XHRcdCdhLmEnLCAnYS5iJywgJ2EuZCcsXG5cdFx0XHQnYS5hYScsICdhLmJiJywgJ2EuY2MnLFxuXHRcdFx0J2IuYWEnLCAnYi5iYicsXG5cdFx0XHQnYy5iYicsICdjLmNjJyxcblx0XHRcdCdkLmFhJywgJ2QuY2MnLFxuXHRcdFx0J2UuYWEnLCAnZS5iYicsICdlLmRkJywgJ2UuZWUnLFxuXHRcdFx0J2YuYWEnLCAnZi5iYicsICdmLmNjJywgJ2YuZGQnLCAnZi5lZScsXG5cdFx0XSwgJ215ZGlyJyk7XG5cblx0XHRhc3NlcnRNYXBFcXVhbHMobmVzdGluZywge1xuXHRcdFx0Jy5hJzogW10sICcuYic6IFtdLCAnLmMnOiBbXSwgJy5kJzogW10sXG5cdFx0XHQnYS5hJzogW10sICdhLmInOiBbXSwgJ2EuZCc6IFtdLFxuXHRcdFx0J2EuYWEnOiBbXSwgJ2EuYmInOiBbXSwgJ2EuY2MnOiBbXSxcblx0XHRcdCdiLmFhJzogWydiLmJiJ10sXG5cdFx0XHQnYy5iYic6IFsnYy5jYyddLFxuXHRcdFx0J2QuY2MnOiBbJ2QuYWEnXSxcblx0XHRcdCdlLmFhJzogWydlLmJiJywgJ2UuZGQnLCAnZS5lZSddLFxuXHRcdFx0J2YuYWEnOiBbXSwgJ2YuYmInOiBbXSwgJ2YuY2MnOiBbXSwgJ2YuZGQnOiBbXSwgJ2YuZWUnOiBbXVxuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdkb2VzIGdlbmVyYWwgYmlkaXJlY3Rpb25hbCBzdWZmaXggbWF0Y2hpbmcnLCAoKSA9PiB7XG5cdFx0Y29uc3QgdCA9IG5ldyBFeHBsb3JlckZpbGVOZXN0aW5nVHJpZShbXG5cdFx0XHRbJyotdnNkb2MuanMnLCBbJyR7Y2FwdHVyZX0uanMnXV0sXG5cdFx0XHRbJyouanMnLCBbJyR7Y2FwdHVyZX0tdnNjZG9jLmpzJ11dLFxuXHRcdF0pO1xuXG5cdFx0Y29uc3QgbmVzdGluZyA9IHQubmVzdChbXG5cdFx0XHQnYS12c2RvYy5qcycsXG5cdFx0XHQnYS5qcycsXG5cdFx0XHQnYi5qcycsXG5cdFx0XHQnYi12c2Nkb2MuanMnLFxuXHRcdF0sICdteWRpcicpO1xuXG5cdFx0YXNzZXJ0TWFwRXF1YWxzKG5lc3RpbmcsIHtcblx0XHRcdCdhLXZzZG9jLmpzJzogWydhLmpzJ10sXG5cdFx0XHQnYi5qcyc6IFsnYi12c2Nkb2MuanMnXSxcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnZG9lcyBnZW5lcmFsIGJpZGlyZWN0aW9uYWwgcHJlZml4IG1hdGNoaW5nJywgKCkgPT4ge1xuXHRcdGNvbnN0IHQgPSBuZXcgRXhwbG9yZXJGaWxlTmVzdGluZ1RyaWUoW1xuXHRcdFx0Wyd2c2RvYy0qLmpzJywgWycke2NhcHR1cmV9LmpzJ11dLFxuXHRcdFx0WycqLmpzJywgWyd2c2Nkb2MtJHtjYXB0dXJlfS5qcyddXSxcblx0XHRdKTtcblxuXHRcdGNvbnN0IG5lc3RpbmcgPSB0Lm5lc3QoW1xuXHRcdFx0J3ZzZG9jLWEuanMnLFxuXHRcdFx0J2EuanMnLFxuXHRcdFx0J2IuanMnLFxuXHRcdFx0J3ZzY2RvYy1iLmpzJyxcblx0XHRdLCAnbXlkaXInKTtcblxuXHRcdGFzc2VydE1hcEVxdWFscyhuZXN0aW5nLCB7XG5cdFx0XHQndnNkb2MtYS5qcyc6IFsnYS5qcyddLFxuXHRcdFx0J2IuanMnOiBbJ3ZzY2RvYy1iLmpzJ10sXG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2RvZXMgZ2VuZXJhbCBiaWRpcmVjdGlvbmFsIGdlbmVyYWwgbWF0Y2hpbmcnLCAoKSA9PiB7XG5cdFx0Y29uc3QgdCA9IG5ldyBFeHBsb3JlckZpbGVOZXN0aW5nVHJpZShbXG5cdFx0XHRbJ2Zvby0qLWJhci5qcycsIFsnJHtjYXB0dXJlfS5qcyddXSxcblx0XHRcdFsnKi5qcycsIFsnYmliLSR7Y2FwdHVyZX0tYmFwLmpzJ11dLFxuXHRcdF0pO1xuXG5cdFx0Y29uc3QgbmVzdGluZyA9IHQubmVzdChbXG5cdFx0XHQnZm9vLWEtYmFyLmpzJyxcblx0XHRcdCdhLmpzJyxcblx0XHRcdCdiLmpzJyxcblx0XHRcdCdiaWItYi1iYXAuanMnLFxuXHRcdF0sICdteWRpcicpO1xuXG5cdFx0YXNzZXJ0TWFwRXF1YWxzKG5lc3RpbmcsIHtcblx0XHRcdCdmb28tYS1iYXIuanMnOiBbJ2EuanMnXSxcblx0XHRcdCdiLmpzJzogWydiaWItYi1iYXAuanMnXSxcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnZG9lcyBleHRlbnNpb24gc3BlY2lmaWMgcGF0aCBzZWdtZW50IG1hdGNoaW5nJywgKCkgPT4ge1xuXHRcdGNvbnN0IHQgPSBuZXcgRXhwbG9yZXJGaWxlTmVzdGluZ1RyaWUoW1xuXHRcdFx0WycqLmpzJywgWycke2NhcHR1cmV9LiouanMnXV0sXG5cdFx0XSk7XG5cblx0XHRjb25zdCBuZXN0aW5nID0gdC5uZXN0KFtcblx0XHRcdCdmb28uanMnLFxuXHRcdFx0J2Zvby50ZXN0LmpzJyxcblx0XHRcdCdmb29UZXN0LmpzJyxcblx0XHRcdCdiYXIuanMuanMnLFxuXHRcdF0sICdteWRpcicpO1xuXG5cdFx0YXNzZXJ0TWFwRXF1YWxzKG5lc3RpbmcsIHtcblx0XHRcdCdmb28uanMnOiBbJ2Zvby50ZXN0LmpzJ10sXG5cdFx0XHQnZm9vVGVzdC5qcyc6IFtdLFxuXHRcdFx0J2Jhci5qcy5qcyc6IFtdLFxuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdkb2VzIGV4YWN0IG1hdGNoIG5lc3RpbmcnLCAoKSA9PiB7XG5cdFx0Y29uc3QgdCA9IG5ldyBFeHBsb3JlckZpbGVOZXN0aW5nVHJpZShbXG5cdFx0XHRbJ3BhY2thZ2UuanNvbicsIFsnLm5wbXJjJywgJ25wbS1zaHJpbmt3cmFwLmpzb24nLCAneWFybi5sb2NrJywgJy55YXJuY2xlYW4nLCAnLnlhcm5pZ25vcmUnLCAnLnlhcm4taW50ZWdyaXR5JywgJy55YXJucmMnXV0sXG5cdFx0XHRbJ2Jvd2VyLmpzb24nLCBbJy5ib3dlcnJjJ11dLFxuXHRcdF0pO1xuXG5cdFx0Y29uc3QgbmVzdGluZyA9IHQubmVzdChbXG5cdFx0XHQncGFja2FnZS5qc29uJyxcblx0XHRcdCcubnBtcmMnLCAnbnBtLXNocmlua3dyYXAuanNvbicsICd5YXJuLmxvY2snLFxuXHRcdFx0Jy5ib3dlcnJjJyxcblx0XHRdLCAnbXlkaXInKTtcblxuXHRcdGFzc2VydE1hcEVxdWFscyhuZXN0aW5nLCB7XG5cdFx0XHQncGFja2FnZS5qc29uJzogW1xuXHRcdFx0XHQnLm5wbXJjJywgJ25wbS1zaHJpbmt3cmFwLmpzb24nLCAneWFybi5sb2NrJ10sXG5cdFx0XHQnLmJvd2VycmMnOiBbXSxcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnZXNsaW50IHRlc3QnLCAoKSA9PiB7XG5cdFx0Y29uc3QgdCA9IG5ldyBFeHBsb3JlckZpbGVOZXN0aW5nVHJpZShbXG5cdFx0XHRbJy5lc2xpbnRyYyonLCBbJy5lc2xpbnQqJ11dLFxuXHRcdF0pO1xuXG5cdFx0Y29uc3QgbmVzdGluZzEgPSB0Lm5lc3QoW1xuXHRcdFx0Jy5lc2xpbnRyYy5qc29uJyxcblx0XHRcdCcuZXNsaW50aWdub3JlJyxcblx0XHRdLCAnbXlkaXInKTtcblxuXHRcdGFzc2VydE1hcEVxdWFscyhuZXN0aW5nMSwge1xuXHRcdFx0Jy5lc2xpbnRyYy5qc29uJzogWycuZXNsaW50aWdub3JlJ10sXG5cdFx0fSk7XG5cblx0XHRjb25zdCBuZXN0aW5nMiA9IHQubmVzdChbXG5cdFx0XHQnLmVzbGludHJjJyxcblx0XHRcdCcuZXNsaW50aWdub3JlJyxcblx0XHRdLCAnbXlkaXInKTtcblxuXHRcdGFzc2VydE1hcEVxdWFscyhuZXN0aW5nMiwge1xuXHRcdFx0Jy5lc2xpbnRyYyc6IFsnLmVzbGludGlnbm9yZSddLFxuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdiYXNlbmFtZSBleHBhbnNpb24nLCAoKSA9PiB7XG5cdFx0Y29uc3QgdCA9IG5ldyBFeHBsb3JlckZpbGVOZXN0aW5nVHJpZShbXG5cdFx0XHRbJyotdnNkb2MuanMnLCBbJyR7YmFzZW5hbWV9LmRvYyddXSxcblx0XHRdKTtcblxuXHRcdGNvbnN0IG5lc3RpbmcxID0gdC5uZXN0KFtcblx0XHRcdCdib29wLXZzZG9jLmpzJyxcblx0XHRcdCdib29wLXZzZG9jLmRvYycsXG5cdFx0XHQnYm9vcC5kb2MnLFxuXHRcdF0sICdteWRpcicpO1xuXG5cdFx0YXNzZXJ0TWFwRXF1YWxzKG5lc3RpbmcxLCB7XG5cdFx0XHQnYm9vcC12c2RvYy5qcyc6IFsnYm9vcC12c2RvYy5kb2MnXSxcblx0XHRcdCdib29wLmRvYyc6IFtdLFxuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdleHRuYW1lIGV4cGFuc2lvbicsICgpID0+IHtcblx0XHRjb25zdCB0ID0gbmV3IEV4cGxvcmVyRmlsZU5lc3RpbmdUcmllKFtcblx0XHRcdFsnKi12c2RvYy5qcycsIFsnJHtleHRuYW1lfS5kb2MnXV0sXG5cdFx0XSk7XG5cblx0XHRjb25zdCBuZXN0aW5nMSA9IHQubmVzdChbXG5cdFx0XHQnYm9vcC12c2RvYy5qcycsXG5cdFx0XHQnanMuZG9jJyxcblx0XHRcdCdib29wLmRvYycsXG5cdFx0XSwgJ215ZGlyJyk7XG5cblx0XHRhc3NlcnRNYXBFcXVhbHMobmVzdGluZzEsIHtcblx0XHRcdCdib29wLXZzZG9jLmpzJzogWydqcy5kb2MnXSxcblx0XHRcdCdib29wLmRvYyc6IFtdLFxuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdhZGRlZCBzZWdtZW50IG1hdGNoZXInLCAoKSA9PiB7XG5cdFx0Y29uc3QgdCA9IG5ldyBFeHBsb3JlckZpbGVOZXN0aW5nVHJpZShbXG5cdFx0XHRbJyonLCBbJyR7YmFzZW5hbWV9LiouJHtleHRuYW1lfSddXSxcblx0XHRdKTtcblxuXHRcdGNvbnN0IG5lc3RpbmcxID0gdC5uZXN0KFtcblx0XHRcdCdzb21lLmZpbGUnLFxuXHRcdFx0J3NvbWUuaHRtbC5maWxlJyxcblx0XHRcdCdzb21lLmh0bWwubmVzdGVkLmZpbGUnLFxuXHRcdFx0J290aGVyLmZpbGUnLFxuXHRcdFx0J3NvbWUudGhpbmcnLFxuXHRcdFx0J3NvbWUudGhpbmcuZWxzZScsXG5cdFx0XSwgJ215ZGlyJyk7XG5cblx0XHRhc3NlcnRNYXBFcXVhbHMobmVzdGluZzEsIHtcblx0XHRcdCdzb21lLmZpbGUnOiBbJ3NvbWUuaHRtbC5maWxlJywgJ3NvbWUuaHRtbC5uZXN0ZWQuZmlsZSddLFxuXHRcdFx0J290aGVyLmZpbGUnOiBbXSxcblx0XHRcdCdzb21lLnRoaW5nJzogW10sXG5cdFx0XHQnc29tZS50aGluZy5lbHNlJzogW10sXG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2FkZGVkIHNlZ21lbnQgbWF0Y2hlciAob2xkIGZvcm1hdCknLCAoKSA9PiB7XG5cdFx0Y29uc3QgdCA9IG5ldyBFeHBsb3JlckZpbGVOZXN0aW5nVHJpZShbXG5cdFx0XHRbJyonLCBbJyQoYmFzZW5hbWUpLiouJChleHRuYW1lKSddXSxcblx0XHRdKTtcblxuXHRcdGNvbnN0IG5lc3RpbmcxID0gdC5uZXN0KFtcblx0XHRcdCdzb21lLmZpbGUnLFxuXHRcdFx0J3NvbWUuaHRtbC5maWxlJyxcblx0XHRcdCdzb21lLmh0bWwubmVzdGVkLmZpbGUnLFxuXHRcdFx0J290aGVyLmZpbGUnLFxuXHRcdFx0J3NvbWUudGhpbmcnLFxuXHRcdFx0J3NvbWUudGhpbmcuZWxzZScsXG5cdFx0XSwgJ215ZGlyJyk7XG5cblx0XHRhc3NlcnRNYXBFcXVhbHMobmVzdGluZzEsIHtcblx0XHRcdCdzb21lLmZpbGUnOiBbJ3NvbWUuaHRtbC5maWxlJywgJ3NvbWUuaHRtbC5uZXN0ZWQuZmlsZSddLFxuXHRcdFx0J290aGVyLmZpbGUnOiBbXSxcblx0XHRcdCdzb21lLnRoaW5nJzogW10sXG5cdFx0XHQnc29tZS50aGluZy5lbHNlJzogW10sXG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2Rpcm5hbWUgbWF0Y2hpbmcnLCAoKSA9PiB7XG5cdFx0Y29uc3QgdCA9IG5ldyBFeHBsb3JlckZpbGVOZXN0aW5nVHJpZShbXG5cdFx0XHRbJ2luZGV4LnRzJywgWycke2Rpcm5hbWV9LnRzJ11dLFxuXHRcdF0pO1xuXG5cdFx0Y29uc3QgbmVzdGluZzEgPSB0Lm5lc3QoW1xuXHRcdFx0J290aGVyRmlsZS50cycsXG5cdFx0XHQnTXlDb21wb25lbnQudHMnLFxuXHRcdFx0J2luZGV4LnRzJyxcblx0XHRdLCAnTXlDb21wb25lbnQnKTtcblxuXHRcdGFzc2VydE1hcEVxdWFscyhuZXN0aW5nMSwge1xuXHRcdFx0J2luZGV4LnRzJzogWydNeUNvbXBvbmVudC50cyddLFxuXHRcdFx0J290aGVyRmlsZS50cyc6IFtdLFxuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0LnNraXAoJ2lzIGZhc3QnLCAoKSA9PiB7XG5cdFx0Y29uc3QgYmlnTmVzdGVyID0gbmV3IEV4cGxvcmVyRmlsZU5lc3RpbmdUcmllKFtcblx0XHRcdFsnKicsIFsnJHtjYXB0dXJlfS4qJ11dLFxuXHRcdFx0WycqLmpzJywgWycke2NhcHR1cmV9LiouanMnLCAnJHtjYXB0dXJlfS5tYXAnXV0sXG5cdFx0XHRbJyouanN4JywgWycke2NhcHR1cmV9LmpzJ11dLFxuXHRcdFx0WycqLnRzJywgWycke2NhcHR1cmV9LmpzJywgJyR7Y2FwdHVyZX0uKi50cyddXSxcblx0XHRcdFsnKi50c3gnLCBbJyR7Y2FwdHVyZX0uanMnXV0sXG5cdFx0XHRbJyouY3NzJywgWycke2NhcHR1cmV9LiouY3NzJywgJyR7Y2FwdHVyZX0ubWFwJ11dLFxuXHRcdFx0WycqLmh0bWwnLCBbJyR7Y2FwdHVyZX0uKi5odG1sJ11dLFxuXHRcdFx0WycqLmh0bScsIFsnJHtjYXB0dXJlfS4qLmh0bSddXSxcblx0XHRcdFsnKi5sZXNzJywgWycke2NhcHR1cmV9LioubGVzcycsICcke2NhcHR1cmV9LmNzcyddXSxcblx0XHRcdFsnKi5zY3NzJywgWycke2NhcHR1cmV9Liouc2NzcycsICcke2NhcHR1cmV9LmNzcyddXSxcblx0XHRcdFsnKi5zYXNzJywgWycke2NhcHR1cmV9LmNzcyddXSxcblx0XHRcdFsnKi5zdHlsJywgWycke2NhcHR1cmV9LmNzcyddXSxcblx0XHRcdFsnKi5jb2ZmZWUnLCBbJyR7Y2FwdHVyZX0uKi5jb2ZmZWUnLCAnJHtjYXB0dXJlfS5qcyddXSxcblx0XHRcdFsnKi5pY2VkJywgWycke2NhcHR1cmV9LiouaWNlZCcsICcke2NhcHR1cmV9LmpzJ11dLFxuXHRcdFx0WycqLmNvbmZpZycsIFsnJHtjYXB0dXJlfS4qLmNvbmZpZyddXSxcblx0XHRcdFsnKi5jcycsIFsnJHtjYXB0dXJlfS4qLmNzJywgJyR7Y2FwdHVyZX0uY3MuZC50cyddXSxcblx0XHRcdFsnKi52YicsIFsnJHtjYXB0dXJlfS4qLnZiJ11dLFxuXHRcdFx0WycqLmpzb24nLCBbJyR7Y2FwdHVyZX0uKi5qc29uJ11dLFxuXHRcdFx0WycqLm1kJywgWycke2NhcHR1cmV9Lmh0bWwnXV0sXG5cdFx0XHRbJyoubWRvd24nLCBbJyR7Y2FwdHVyZX0uaHRtbCddXSxcblx0XHRcdFsnKi5tYXJrZG93bicsIFsnJHtjYXB0dXJlfS5odG1sJ11dLFxuXHRcdFx0WycqLm1kd24nLCBbJyR7Y2FwdHVyZX0uaHRtbCddXSxcblx0XHRcdFsnKi5zdmcnLCBbJyR7Y2FwdHVyZX0uc3ZneiddXSxcblx0XHRcdFsnKi5hJywgWycke2NhcHR1cmV9LmInXV0sXG5cdFx0XHRbJyouYicsIFsnJHtjYXB0dXJlfS5hJ11dLFxuXHRcdFx0WycqLnJlc3gnLCBbJyR7Y2FwdHVyZX0uZGVzaWduZXIuY3MnXV0sXG5cdFx0XHRbJ3BhY2thZ2UuanNvbicsIFsnLm5wbXJjJywgJ25wbS1zaHJpbmt3cmFwLmpzb24nLCAneWFybi5sb2NrJywgJy55YXJuY2xlYW4nLCAnLnlhcm5pZ25vcmUnLCAnLnlhcm4taW50ZWdyaXR5JywgJy55YXJucmMnXV0sXG5cdFx0XHRbJ2Jvd2VyLmpzb24nLCBbJy5ib3dlcnJjJ11dLFxuXHRcdFx0WycqLXZzZG9jLmpzJywgWycke2NhcHR1cmV9LmpzJ11dLFxuXHRcdFx0WycqLnR0JywgWycke2NhcHR1cmV9LionXV1cblx0XHRdKTtcblxuXHRcdGNvbnN0IGJpZ0ZpbGVzID0gQXJyYXkuZnJvbSh7IGxlbmd0aDogNTAwMDAgLyA2IH0pLm1hcCgoXywgaSkgPT4gW1xuXHRcdFx0J2ZpbGUnICsgaSArICcuanMnLFxuXHRcdFx0J2ZpbGUnICsgaSArICcubWFwJyxcblx0XHRcdCdmaWxlJyArIGkgKyAnLmNzcycsXG5cdFx0XHQnZmlsZScgKyBpICsgJy50cycsXG5cdFx0XHQnZmlsZScgKyBpICsgJy5kLnRzJyxcblx0XHRcdCdmaWxlJyArIGkgKyAnLmpzeCcsXG5cdFx0XSkuZmxhdCgpO1xuXG5cdFx0Y29uc3Qgc3RhcnQgPSBwZXJmb3JtYW5jZS5ub3coKTtcblx0XHQvLyBjb25zdCBfYmlnUmVzdWx0ID1cblx0XHRiaWdOZXN0ZXIubmVzdChiaWdGaWxlcywgJ215ZGlyJyk7XG5cdFx0Y29uc3QgZW5kID0gcGVyZm9ybWFuY2Uubm93KCk7XG5cdFx0YXNzZXJ0KGVuZCAtIHN0YXJ0IDwgMTAwMCwgJ3RvbyBzbG93Li4uJyArIChlbmQgLSBzdGFydCkpO1xuXHRcdC8vIGNvbnNvbGUubG9nKGJpZ1Jlc3VsdClcblx0fSk7XG59KTtcbiJdLAogICJtYXBwaW5ncyI6ICJBQUlBLFNBQVMsU0FBUyx5QkFBeUIsZUFBZTtBQUMxRCxPQUFPLFlBQVk7QUFDbkIsU0FBUywrQ0FBK0M7QUFFeEQsTUFBTSx5QkFBeUIsRUFBRSxTQUFTLFNBQVMsVUFBVSxJQUFJLFNBQVMsR0FBRztBQUU3RSxNQUFNLFdBQVcsTUFBTTtBQUN0QiwwQ0FBd0M7QUFFeEMsT0FBSyxnQkFBZ0IsTUFBTTtBQUMxQixVQUFNLElBQUksSUFBSSxRQUFRO0FBQ3RCLE1BQUUsSUFBSSxVQUFVLE9BQU87QUFDdkIsV0FBTyxnQkFBZ0IsRUFBRSxJQUFJLFVBQVUsc0JBQXNCLEdBQUcsQ0FBQyxPQUFPLENBQUM7QUFDekUsV0FBTyxnQkFBZ0IsRUFBRSxJQUFJLFdBQVcsc0JBQXNCLEdBQUcsQ0FBQyxDQUFDO0FBQ25FLFdBQU8sZ0JBQWdCLEVBQUUsSUFBSSxXQUFXLHNCQUFzQixHQUFHLENBQUMsQ0FBQztBQUFBLEVBQ3BFLENBQUM7QUFFRCxPQUFLLGVBQWUsTUFBTTtBQUN6QixVQUFN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
