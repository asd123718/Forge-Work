import assert, { notStrictEqual, strictEqual } from "assert";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../../../base/test/common/utils.js";
import { TerminalCompletionModel } from "../../browser/terminalCompletionModel.js";
import { LineContext } from "../../../../../services/suggest/browser/simpleCompletionModel.js";
import { TerminalCompletionItem, TerminalCompletionItemKind } from "../../browser/terminalCompletionItem.js";
function createItem(options) {
  return new TerminalCompletionItem({
    ...options,
    kind: options.kind ?? TerminalCompletionItemKind.Method,
    label: options.label || "defaultLabel",
    provider: options.provider || "defaultProvider",
    replacementRange: options.replacementRange || [0, 1]
  });
}
function createFileItems(...labels) {
  return labels.map((label) => createItem({ label, kind: TerminalCompletionItemKind.File }));
}
function createFileItemsModel(...labels) {
  return new TerminalCompletionModel(
    createFileItems(...labels),
    new LineContext("", 0)
  );
}
function createFolderItems(...labels) {
  return labels.map((label) => createItem({ label, kind: TerminalCompletionItemKind.Folder }));
}
function createFolderItemsModel(...labels) {
  return new TerminalCompletionModel(
    createFolderItems(...labels),
    new LineContext("", 0)
  );
}
function assertItems(model, labels) {
  assert.deepStrictEqual(model.items.map((i) => i.completion.label), labels);
  assert.strictEqual(model.items.length, labels.length);
}
suite("TerminalCompletionModel", function() {
  ensureNoDisposablesAreLeakedInTestSuite();
  let model;
  test("should handle an empty list", function() {
    model = new TerminalCompletionModel([], new LineContext("", 0));
    assert.strictEqual(model.items.length, 0);
  });
  test("should handle a list with one item", function() {
    model = new TerminalCompletionModel([
      createItem({ label: "a" })
    ], new LineContext("", 0));
    assert.strictEqual(model.items.length, 1);
    assert.strictEqual(model.items[0].completion.label, "a");
  });
  test("should sort alphabetically", function() {
    model = new TerminalCompletionModel([
      createItem({ label: "b" }),
      createItem({ label: "z" }),
      createItem({ label: "a" })
    ], new LineContext("", 0));
    assert.strictEqual(model.items.length, 3);
    assert.strictEqual(model.items[0].completion.label, "a");
    assert.strictEqual(model.items[1].completion.label, "b");
    assert.strictEqual(model.items[2].completion.label, "z");
  });
  test("fuzzy matching", () => {
    const initial = [
      ".\\.eslintrc",
      ".\\resources\\",
      ".\\scripts\\",
      ".\\src\\"
    ];
    const expected = [
      ".\\scripts\\",
      ".\\src\\",
      ".\\.eslintrc",
      ".\\resources\\"
    ];
    model = new TerminalCompletionModel(initial.map((e) => createItem({ label: e })), new LineContext("s", 0));
    assertItems(model, expected);
  });
  suite("files and folders", () => {
    test("should deprioritize files that start with underscore", function() {
      const initial = ["_a", "a", "z"];
      const expected = ["a", "z", "_a"];
      assertItems(createFileItemsModel(...initial), expected);
      assertItems(createFolderItemsModel(...initial), expected);
    });
    test("should ignore the dot in dotfiles when sorting", function() {
      const initial = ["b", ".a", "a", ".b"];
      const expected = [".a", "a", "b", ".b"];
      assertItems(createFileItemsModel(...initial), expected);
      assertItems(createFolderItemsModel(...initial), expected);
    });
    test("should handle many files and folders correctly", function() {
      const items = [
        ...createFolderItems(
          "__pycache",
          ".build",
          ".configurations",
          ".devcontainer",
          ".eslint-plugin-local",
          ".github",
          ".profile-oss",
          ".vscode",
          ".vscode-test",
          "build",
          "cli",
          "extensions",
          "node_modules",
          "out",
          "remote",
          "resources",
          "scripts",
          "src",
          "test"
        ),
        ...createFileItems(
          "__init__.py",
          ".editorconfig",
          ".eslint-ignore",
          ".git-blame-ignore-revs",
          ".gitattributes",
          ".gitignore",
          ".lsifrc.json",
          ".mailmap",
          ".mention-bot",
          ".npmrc",
          ".nvmrc",
          ".vscode-test.js",
          "cglicenses.json",
          "cgmanifest.json",
          "CodeQL.yml",
          "CONTRIBUTING.md",
          "eslint.config.js",
          "gulpfile.js",
          "LICENSE.txt",
          "package-lock.json",
          "package.json",
          "product.json",
          "README.md",
          "SECURITY.md",
          "ThirdPartyNotices.txt",
          "tsfmt.json"
        )
      ];
      const model2 = new TerminalCompletionModel(items, new LineContext("", 0));
      assertItems(model2, [
        ".build",
        "build",
        "cglicenses.json",
        "cgmanifest.json",
        "cli",
        "CodeQL.yml",
        ".configurations",
        "CONTRIBUTING.md",
        ".devcontainer",
        ".editorconfig",
        "eslint.config.js",
        ".eslint-ignore",
        ".eslint-plugin-local",
        "extensions",
        ".gitattributes",
        ".git-blame-ignore-revs",
        ".github",
        ".gitignore",
        "gulpfile.js",
        "LICENSE.txt",
        ".lsifrc.json",
        ".mailmap",
        ".mention-bot",
        "node_modules",
        ".npmrc",
        ".nvmrc",
        "out",
        "package.json",
        "package-lock.json",
        "product.json",
        ".profile-oss",
        "README.md",
        "remote",
        "resources",
        "scripts",
        "SECURITY.md",
        "src",
        "test",
        "ThirdPartyNotices.txt",
        "tsfmt.json",
        ".vscode",
        ".vscode-test",
        ".vscode-test.js",
        "__init__.py",
        "__pycache"
      ]);
    });
  });
  suite("Punctuation", () => {
    test("punctuation chars should be below other methods", function() {
      const items = [
        createItem({ label: "a" }),
        createItem({ label: "b" }),
        createItem({ label: "," }),
        createItem({ label: ";" }),
        createItem({ label: ":" }),
        createItem({ label: "c" }),
        createItem({ label: "[" }),
        createItem({ label: "..." })
      ];
      model = new TerminalCompletionModel(items, new LineContext("", 0));
      assertItems(model, ["a", "b", "c", ",", ";", ":", "[", "..."]);
    });
    test("punctuation chars should be below other files", function() {
      const items = [
        createItem({ label: ".." }),
        createItem({ label: "..." }),
        createItem({ label: "../" }),
        createItem({ label: "./a/" }),
        createItem({ label: "./b/" })
      ];
      model = new TerminalCompletionModel(items, new LineContext("", 0));
      assertItems(model, ["./a/", "./b/", "..", "...", "../"]);
    });
  });
  suite("inline completions", () => {
    function createItems(kind) {
      return [
        ...createFolderItems("a", "c"),
        ...createFileItems("b", "d"),
        new TerminalCompletionItem({
          label: "ab",
          provider: "core",
          replacementRange: [0, 0],
          kind
        })
      ];
    }
    suite("InlineSuggestion", () => {
      test("should put on top generally", function() {
        const model2 = new TerminalCompletionModel(createItems(TerminalCompletionItemKind.InlineSuggestion), new LineContext("", 0));
        strictEqual(model2.items[0].completion.label, "ab");
      });
      test("should NOT put on top when there's an exact match of another item", function() {
        const model2 = new TerminalCompletionModel(createItems(TerminalCompletionItemKind.InlineSuggestion), new LineContext("a", 0));
        notStrictEqual(model2.items[0].completion.label, "ab");
        strictEqual(model2.items[1].completion.label, "ab");
      });
    });
    suite("InlineSuggestionAlwaysOnTop", () => {
      test("should put on top generally", function() {
        const model2 = new TerminalCompletionModel(createItems(TerminalCompletionItemKind.InlineSuggestionAlwaysOnTop), new LineContext("", 0));
        strictEqual(model2.items[0].completion.label, "ab");
      });
      test("should put on top even if there's an exact match of another item", function() {
        const model2 = new TerminalCompletionModel(createItems(TerminalCompletionItemKind.InlineSuggestionAlwaysOnTop), new LineContext("a", 0));
        strictEqual(model2.items[0].completion.label, "ab");
      });
    });
  });
  suite("git branch priority sorting", () => {
    test("should prioritize main and master branches for git commands", () => {
      const items = [
        createItem({ kind: TerminalCompletionItemKind.Argument, label: "feature-branch" }),
        createItem({ kind: TerminalCompletionItemKind.Argument, label: "master" }),
        createItem({ kind: TerminalCompletionItemKind.Argument, label: "development" }),
        createItem({ kind: TerminalCompletionItemKind.Argument, label: "main" })
      ];
      const model2 = new TerminalCompletionModel(items, new LineContext("git checkout ", 0));
      assertItems(model2, ["main", "master", "development", "feature-branch"]);
    });
    test("should prioritize main and master branches for git switch command", () => {
      const items = [
        createItem({ kind: TerminalCompletionItemKind.Argument, label: "feature-branch" }),
        createItem({ kind: TerminalCompletionItemKind.Argument, label: "main" }),
        createItem({ kind: TerminalCompletionItemKind.Argument, label: "another-feature" }),
        createItem({ kind: TerminalCompletionItemKind.Argument, label: "master" })
      ];
      const model2 = new TerminalCompletionModel(items, new LineContext("git switch ", 0));
      assertItems(model2, ["main", "master", "another-feature", "feature-branch"]);
    });
    test("should not prioritize main and master for non-git commands", () => {
      const items = [
        createItem({ kind: TerminalCompletionItemKind.Argument, label: "feature-branch" }),
        createItem({ kind: TerminalCompletionItemKind.Argument, label: "master" }),
        createItem({ kind: TerminalCompletionItemKind.Argument, label: "main" })
      ];
      const model2 = new TerminalCompletionModel(items, new LineContext("ls ", 0));
      assertItems(model2, ["feature-branch", "main", "master"]);
    });
    test("should handle git commands with leading whitespace", () => {
      const items = [
        createItem({ kind: TerminalCompletionItemKind.Argument, label: "feature-branch" }),
        createItem({ kind: TerminalCompletionItemKind.Argument, label: "master" }),
        createItem({ kind: TerminalCompletionItemKind.Argument, label: "main" })
      ];
      const model2 = new TerminalCompletionModel(items, new LineContext("  git checkout ", 0));
      assertItems(model2, ["main", "master", "feature-branch"]);
    });
    test("should work with complex label objects", () => {
      const items = [
        createItem({ kind: TerminalCompletionItemKind.Argument, label: { label: "feature-branch", description: "Feature branch" } }),
        createItem({ kind: TerminalCompletionItemKind.Argument, label: { label: "master", description: "Master branch" } }),
        createItem({ kind: TerminalCompletionItemKind.Argument, label: { label: "main", description: "Main branch" } })
      ];
      const model2 = new TerminalCompletionModel(items, new LineContext("git checkout ", 0));
      assertItems(model2, [
        { label: "main", description: "Main branch" },
        { label: "master", description: "Master branch" },
        { label: "feature-branch", description: "Feature branch" }
      ]);
    });
    test("should not prioritize branches with similar names", () => {
      const items = [
        createItem({ kind: TerminalCompletionItemKind.Argument, label: "mainline" }),
        createItem({ kind: TerminalCompletionItemKind.Argument, label: "masterpiece" }),
        createItem({ kind: TerminalCompletionItemKind.Argument, label: "main" }),
        createItem({ kind: TerminalCompletionItemKind.Argument, label: "master" })
      ];
      const model2 = new TerminalCompletionModel(items, new LineContext("git checkout ", 0));
      assertItems(model2, ["main", "master", "mainline", "masterpiece"]);
    });
    test("should prioritize for git branch -d", () => {
      const items = [
        createItem({ kind: TerminalCompletionItemKind.Argument, label: "main" }),
        createItem({ kind: TerminalCompletionItemKind.Argument, label: "master" }),
        createItem({ kind: TerminalCompletionItemKind.Argument, label: "dev" })
      ];
      const model2 = new TerminalCompletionModel(items, new LineContext("git branch -d ", 0));
      assertItems(model2, ["main", "master", "dev"]);
    });
  });
  suite("mixed kind sorting", () => {
    test("should sort arguments before flags and options", () => {
      const items = [
        createItem({ kind: TerminalCompletionItemKind.Flag, label: "--verbose" }),
        createItem({ kind: TerminalCompletionItemKind.Option, label: "--config" }),
        createItem({ kind: TerminalCompletionItemKind.Argument, label: "value2" }),
        createItem({ kind: TerminalCompletionItemKind.Argument, label: "value1" }),
        createItem({ kind: TerminalCompletionItemKind.Flag, label: "--all" })
      ];
      const model2 = new TerminalCompletionModel(items, new LineContext("cmd ", 0));
      assertItems(model2, ["value1", "value2", "--all", "--config", "--verbose"]);
    });
    test("should sort by kind hierarchy: methods/aliases, arguments, others, files/folders", () => {
      const items = [
        createItem({ kind: TerminalCompletionItemKind.File, label: "file.txt" }),
        createItem({ kind: TerminalCompletionItemKind.Flag, label: "--flag" }),
        createItem({ kind: TerminalCompletionItemKind.Argument, label: "arg" }),
        createItem({ kind: TerminalCompletionItemKind.Method, label: "method" }),
        createItem({ kind: TerminalCompletionItemKind.Folder, label: "folder/" }),
        createItem({ kind: TerminalCompletionItemKind.Option, label: "--option" }),
        createItem({ kind: TerminalCompletionItemKind.Alias, label: "alias" }),
        createItem({ kind: TerminalCompletionItemKind.SymbolicLinkFile, label: "file2.txt" }),
        createItem({ kind: TerminalCompletionItemKind.SymbolicLinkFolder, label: "folder2/" })
      ];
      const model2 = new TerminalCompletionModel(items, new LineContext("", 0));
      assertItems(model2, ["alias", "method", "arg", "--flag", "--option", "file2.txt", "file.txt", "folder/", "folder2/"]);
    });
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXHRlcm1pbmFsQ29udHJpYlxcc3VnZ2VzdFxcdGVzdFxcYnJvd3NlclxcdGVybWluYWxDb21wbGV0aW9uTW9kZWwudGVzdC50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5pbXBvcnQgYXNzZXJ0LCB7IG5vdFN0cmljdEVxdWFsLCBzdHJpY3RFcXVhbCB9IGZyb20gJ2Fzc2VydCc7XG5pbXBvcnQgeyBlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL3Rlc3QvY29tbW9uL3V0aWxzLmpzJztcbmltcG9ydCB7IFRlcm1pbmFsQ29tcGxldGlvbk1vZGVsIH0gZnJvbSAnLi4vLi4vYnJvd3Nlci90ZXJtaW5hbENvbXBsZXRpb25Nb2RlbC5qcyc7XG5pbXBvcnQgeyBMaW5lQ29udGV4dCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3NlcnZpY2VzL3N1Z2dlc3QvYnJvd3Nlci9zaW1wbGVDb21wbGV0aW9uTW9kZWwuanMnO1xuaW1wb3J0IHsgVGVybWluYWxDb21wbGV0aW9uSXRlbSwgVGVybWluYWxDb21wbGV0aW9uSXRlbUtpbmQsIHR5cGUgSVRlcm1pbmFsQ29tcGxldGlvbiB9IGZyb20gJy4uLy4uL2Jyb3dzZXIvdGVybWluYWxDb21wbGV0aW9uSXRlbS5qcyc7XG5pbXBvcnQgdHlwZSB7IENvbXBsZXRpb25JdGVtTGFiZWwgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9zZXJ2aWNlcy9zdWdnZXN0L2Jyb3dzZXIvc2ltcGxlQ29tcGxldGlvbkl0ZW0uanMnO1xuXG5mdW5jdGlvbiBjcmVhdGVJdGVtKG9wdGlvbnM6IFBhcnRpYWw8SVRlcm1pbmFsQ29tcGxldGlvbj4pOiBUZXJtaW5hbENvbXBsZXRpb25JdGVtIHtcblx0cmV0dXJuIG5ldyBUZXJtaW5hbENvbXBsZXRpb25JdGVtKHtcblx0XHQuLi5vcHRpb25zLFxuXHRcdGtpbmQ6IG9wdGlvbnMua2luZCA/PyBUZXJtaW5hbENvbXBsZXRpb25JdGVtS2luZC5NZXRob2QsXG5cdFx0bGFiZWw6IG9wdGlvbnMubGFiZWwgfHwgJ2RlZmF1bHRMYWJlbCcsXG5cdFx0cHJvdmlkZXI6IG9wdGlvbnMucHJvdmlkZXIgfHwgJ2RlZmF1bHRQcm92aWRlcicsXG5cdFx0cmVwbGFjZW1lbnRSYW5nZTogb3B0aW9ucy5yZXBsYWNlbWVudFJhbmdlIHx8IFswLCAxXSxcblx0fSk7XG59XG5cbmZ1bmN0aW9uIGNyZWF0ZUZpbGVJdGVtcyguLi5sYWJlbHM6IHN0cmluZ1tdKTogVGVybWluYWxDb21wbGV0aW9uSXRlbVtdIHtcblx0cmV0dXJuIGxhYmVscy5tYXAobGFiZWwgPT4gY3JlYXRlSXRlbSh7IGxhYmVsLCBraW5kOiBUZXJtaW5hbENvbXBsZXRpb25JdGVtS2luZC5GaWxlIH0pKTtcbn1cblxuZnVuY3Rpb24gY3JlYXRlRmlsZUl0ZW1zTW9kZWwoLi4ubGFiZWxzOiBzdHJpbmdbXSk6IFRlcm1pbmFsQ29tcGxldGlvbk1vZGVsIHtcblx0cmV0dXJuIG5ldyBUZXJtaW5hbENvbXBsZXRpb25Nb2RlbChcblx0XHRjcmVhdGVGaWxlSXRlbXMoLi4ubGFiZWxzKSxcblx0XHRuZXcgTGluZUNvbnRleHQoJycsIDApXG5cdCk7XG59XG5cbmZ1bmN0aW9uIGNyZWF0ZUZvbGRlckl0ZW1zKC4uLmxhYmVsczogc3RyaW5nW10pOiBUZXJtaW5hbENvbXBsZXRpb25JdGVtW10ge1xuXHRyZXR1cm4gbGFiZWxzLm1hcChsYWJlbCA9PiBjcmVhdGVJdGVtKHsgbGFiZWwsIGtpbmQ6IFRlcm1pbmFsQ29tcGxldGlvbkl0ZW1LaW5kLkZvbGRlciB9KSk7XG59XG5cbmZ1bmN0aW9uIGNyZWF0ZUZvbGRlckl0ZW1zTW9kZWwoLi4ubGFiZWxzOiBzdHJpbmdbXSk6IFRlcm1pbmFsQ29tcGxldGlvbk1vZGVsIHtcblx0cmV0dXJuIG5ldyBUZXJtaW5hbENvbXBsZXRpb25Nb2RlbChcblx0XHRjcmVhdGVGb2xkZXJJdGVtcyguLi5sYWJlbHMpLFxuXHRcdG5ldyBMaW5lQ29udGV4dCgnJywgMClcblx0KTtcbn1cblxuZnVuY3Rpb24gYXNzZXJ0SXRlbXMobW9kZWw6IFRlcm1pbmFsQ29tcGxldGlvbk1vZGVsLCBsYWJlbHM6IChzdHJpbmcgfCBDb21wbGV0aW9uSXRlbUxhYmVsKVtdKTogdm9pZCB7XG5cdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwobW9kZWwuaXRlbXMubWFwKGkgPT4gaS5jb21wbGV0aW9uLmxhYmVsKSwgbGFiZWxzKTtcblx0YXNzZXJ0LnN0cmljdEVxdWFsKG1vZGVsLml0ZW1zLmxlbmd0aCwgbGFiZWxzLmxlbmd0aCk7IC8vIHNhbml0eSBjaGVja1xufVxuXG5zdWl0ZSgnVGVybWluYWxDb21wbGV0aW9uTW9kZWwnLCBmdW5jdGlvbiAoKSB7XG5cdGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSgpO1xuXG5cdGxldCBtb2RlbDogVGVybWluYWxDb21wbGV0aW9uTW9kZWw7XG5cblx0dGVzdCgnc2hvdWxkIGhhbmRsZSBhbiBlbXB0eSBsaXN0JywgZnVuY3Rpb24gKCkge1xuXHRcdG1vZGVsID0gbmV3IFRlcm1pbmFsQ29tcGxldGlvbk1vZGVsKFtdLCBuZXcgTGluZUNvbnRleHQoJycsIDApKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChtb2RlbC5pdGVtcy5sZW5ndGgsIDApO1xuXHR9KTtcblxuXHR0ZXN0KCdzaG91bGQgaGFuZGxlIGEgbGlzdCB3aXRoIG9uZSBpdGVtJywgZnVuY3Rpb24gKCkge1xuXHRcdG1vZGVsID0gbmV3IFRlcm1pbmFsQ29tcGxldGlvbk1vZGVsKFtcblx0XHRcdGNyZWF0ZUl0ZW0oeyBsYWJlbDogJ2EnIH0pLFxuXHRcdF0sIG5ldyBMaW5lQ29udGV4dCgnJywgMCkpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1vZGVsLml0ZW1zLmxlbmd0aCwgMSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1vZGVsLml0ZW1zWzBdLmNvbXBsZXRpb24ubGFiZWwsICdhJyk7XG5cdH0pO1xuXG5cdHRlc3QoJ3Nob3VsZCBzb3J0IGFscGhhYmV0aWNhbGx5JywgZnVuY3Rpb24gKCkge1xuXHRcdG1vZGVsID0gbmV3IFRlcm1pbmFsQ29tcGxldGlvbk1vZGVsKFtcblx0XHRcdGNyZWF0ZUl0ZW0oeyBsYWJlbDogJ2InIH0pLFxuXHRcdFx0Y3JlYXRlSXRlbSh7IGxhYmVsOiAneicgfSksXG5cdFx0XHRjcmVhdGVJdGVtKHsgbGFiZWw6ICdhJyB9KSxcblx0XHRdLCBuZXcgTGluZUNvbnRleHQoJycsIDApKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChtb2RlbC5pdGVtcy5sZW5ndGgsIDMpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChtb2RlbC5pdGVtc1swXS5jb21wbGV0aW9uLmxhYmVsLCAnYScpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChtb2RlbC5pdGVtc1sxXS5jb21wbGV0aW9uLmxhYmVsLCAnYicpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChtb2RlbC5pdGVtc1syXS5jb21wbGV0aW9uLmxhYmVsLCAneicpO1xuXHR9KTtcblxuXHR0ZXN0KCdmdXp6eSBtYXRjaGluZycsICgpID0+IHtcblx0XHRjb25zdCBpbml0aWFsID0gW1xuXHRcdFx0Jy5cXFxcLmVzbGludHJjJyxcblx0XHRcdCcuXFxcXHJlc291cmNlc1xcXFwnLFxuXHRcdFx0Jy5cXFxcc2NyaXB0c1xcXFwnLFxuXHRcdFx0Jy5cXFxcc3JjXFxcXCcsXG5cdFx0XTtcblx0XHRjb25zdCBleHBlY3RlZCA9IFtcblx0XHRcdCcuXFxcXHNjcmlwdHNcXFxcJyxcblx0XHRcdCcuXFxcXHNyY1xcXFwnLFxuXHRcdFx0Jy5cXFxcLmVzbGludHJjJyxcblx0XHRcdCcuXFxcXHJlc291cmNlc1xcXFwnLFxuXHRcdF07XG5cdFx0bW9kZWwgPSBuZXcgVGVybWluYWxDb21wbGV0aW9uTW9kZWwoaW5pdGlhbC5tYXAoZSA9PiAoY3JlYXRlSXRlbSh7IGxhYmVsOiBlIH0pKSksIG5ldyBMaW5lQ29udGV4dCgncycsIDApKTtcblxuXHRcdGFzc2VydEl0ZW1zKG1vZGVsLCBleHBlY3RlZCk7XG5cdH0pO1xuXG5cdHN1aXRlKCdmaWxlcyBhbmQgZm9sZGVycycsICgpID0+IHtcblx0XHR0ZXN0KCdzaG91bGQgZGVwcmlvcml0aXplIGZpbGVzIHRoYXQgc3RhcnQgd2l0aCB1bmRlcnNjb3JlJywgZnVuY3Rpb24gKCkge1xuXHRcdFx0Y29uc3QgaW5pdGlhbCA9IFsnX2EnLCAnYScsICd6J107XG5cdFx0XHRjb25zdCBleHBlY3RlZCA9IFsnYScsICd6JywgJ19hJ107XG5cdFx0XHRhc3NlcnRJdGVtcyhjcmVhdGVGaWxlSXRlbXNNb2RlbCguLi5pbml0aWFsKSwgZXhwZWN0ZWQpO1xuXHRcdFx0YXNzZXJ0SXRlbXMoY3JlYXRlRm9sZGVySXRlbXNNb2RlbCguLi5pbml0aWFsKSwgZXhwZWN0ZWQpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnc2hvdWxkIGlnbm9yZSB0aGUgZG90IGluIGRvdGZpbGVzIHdoZW4gc29ydGluZycsIGZ1bmN0aW9uICgpIHtcblx0XHRcdGNvbnN0IGluaXRpYWwgPSBbJ2InLCAnLmEnLCAnYScsICcuYiddO1xuXHRcdFx0Y29uc3QgZXhwZWN0ZWQgPSBbJy5hJywgJ2EnLCAnYicsICcuYiddO1xuXHRcdFx0YXNzZXJ0SXRlbXMoY3JlYXRlRmlsZUl0ZW1zTW9kZWwoLi4uaW5pdGlhbCksIGV4cGVjdGVkKTtcblx0XHRcdGFzc2VydEl0ZW1zKGNyZWF0ZUZvbGRlckl0ZW1zTW9kZWwoLi4uaW5pdGlhbCksIGV4cGVjdGVkKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3Nob3VsZCBoYW5kbGUgbWFueSBmaWxlcyBhbmQgZm9sZGVycyBjb3JyZWN0bHknLCBmdW5jdGlvbiAoKSB7XG5cdFx0XHQvLyBUaGlzIGlzIFZTIENvZGUncyByb290IGRpcmVjdG9yeSB3aXRoIHNvbWUgcHl0aG9uIGl0ZW1zIGFkZGVkIHRoYXQgaGF2ZSBzcGVjaWFsXG5cdFx0XHQvLyBzb3J0aW5nXG5cdFx0XHRjb25zdCBpdGVtcyA9IFtcblx0XHRcdFx0Li4uY3JlYXRlRm9sZGVySXRlbXMoXG5cdFx0XHRcdFx0J19fcHljYWNoZScsXG5cdFx0XHRcdFx0Jy5idWlsZCcsXG5cdFx0XHRcdFx0Jy5jb25maWd1cmF0aW9ucycsXG5cdFx0XHRcdFx0Jy5kZXZjb250YWluZXInLFxuXHRcdFx0XHRcdCcuZXNsaW50LXBsdWdpbi1sb2NhbCcsXG5cdFx0XHRcdFx0Jy5naXRodWInLFxuXHRcdFx0XHRcdCcucHJvZmlsZS1vc3MnLFxuXHRcdFx0XHRcdCcudnNjb2RlJyxcblx0XHRcdFx0XHQnLnZzY29kZS10ZXN0Jyxcblx0XHRcdFx0XHQnYnVpbGQnLFxuXHRcdFx0XHRcdCdjbGknLFxuXHRcdFx0XHRcdCdleHRlbnNpb25zJyxcblx0XHRcdFx0XHQnbm9kZV9tb2R1bGVzJyxcblx0XHRcdFx0XHQnb3V0Jyxcblx0XHRcdFx0XHQncmVtb3RlJyxcblx0XHRcdFx0XHQncmVzb3VyY2VzJyxcblx0XHRcdFx0XHQnc2NyaXB0cycsXG5cdFx0XHRcdFx0J3NyYycsXG5cdFx0XHRcdFx0J3Rlc3QnLFxuXHRcdFx0XHQpLFxuXHRcdFx0XHQuLi5jcmVhdGVGaWxlSXRlbXMoXG5cdFx0XHRcdFx0J19faW5pdF9fLnB5Jyxcblx0XHRcdFx0XHQnLmVkaXRvcmNvbmZpZycsXG5cdFx0XHRcdFx0Jy5lc2xpbnQtaWdub3JlJyxcblx0XHRcdFx0XHQnLmdpdC1ibGFtZS1pZ25vcmUtcmV2cycsXG5cdFx0XHRcdFx0Jy5naXRhdHRyaWJ1dGVzJyxcblx0XHRcdFx0XHQnLmdpdGlnbm9yZScsXG5cdFx0XHRcdFx0Jy5sc2lmcmMuanNvbicsXG5cdFx0XHRcdFx0Jy5tYWlsbWFwJyxcblx0XHRcdFx0XHQnLm1lbnRpb24tYm90Jyxcblx0XHRcdFx0XHQnLm5wbXJjJyxcblx0XHRcdFx0XHQnLm52bXJjJyxcblx0XHRcdFx0XHQnLnZzY29kZS10ZXN0LmpzJyxcblx0XHRcdFx0XHQnY2dsaWNlbnNlcy5qc29uJyxcblx0XHRcdFx0XHQnY2dtYW5pZmVzdC5qc29uJyxcblx0XHRcdFx0XHQnQ29kZVFMLnltbCcsXG5cdFx0XHRcdFx0J0NPTlRSSUJVVElORy5tZCcsXG5cdFx0XHRcdFx0J2VzbGludC5jb25maWcuanMnLFxuXHRcdFx0XHRcdCdndWxwZmlsZS5qcycsXG5cdFx0XHRcdFx0J0xJQ0VOU0UudHh0Jyxcblx0XHRcdFx0XHQncGFja2FnZS1sb2NrLmpzb24nLFxuXHRcdFx0XHRcdCdwYWNrYWdlLmpzb24nLFxuXHRcdFx0XHRcdCdwcm9kdWN0Lmpzb24nLFxuXHRcdFx0XHRcdCdSRUFETUUubWQnLFxuXHRcdFx0XHRcdCdTRUNVUklUWS5tZCcsXG5cdFx0XHRcdFx0J1RoaXJkUGFydHlOb3RpY2VzLnR4dCcsXG5cdFx0XHRcdFx0J3RzZm10Lmpzb24nLFxuXHRcdFx0XHQpXG5cdFx0XHRdO1xuXHRcdFx0Y29uc3QgbW9kZWwgPSBuZXcgVGVybWluYWxDb21wbGV0aW9uTW9kZWwoaXRlbXMsIG5ldyBMaW5lQ29udGV4dCgnJywgMCkpO1xuXHRcdFx0YXNzZXJ0SXRlbXMobW9kZWwsIFtcblx0XHRcdFx0Jy5idWlsZCcsXG5cdFx0XHRcdCdidWlsZCcsXG5cdFx0XHRcdCdjZ2xpY2Vuc2VzLmpzb24nLFxuXHRcdFx0XHQnY2dtYW5pZmVzdC5qc29uJyxcblx0XHRcdFx0J2NsaScsXG5cdFx0XHRcdCdDb2RlUUwueW1sJyxcblx0XHRcdFx0Jy5jb25maWd1cmF0aW9ucycsXG5cdFx0XHRcdCdDT05UUklCVVRJTkcubWQnLFxuXHRcdFx0XHQnLmRldmNvbnRhaW5lcicsXG5cdFx0XHRcdCcuZWRpdG9yY29uZmlnJyxcblx0XHRcdFx0J2VzbGludC5jb25maWcuanMnLFxuXHRcdFx0XHQnLmVzbGludC1pZ25vcmUnLFxuXHRcdFx0XHQnLmVzbGludC1wbHVnaW4tbG9jYWwnLFxuXHRcdFx0XHQnZXh0ZW5zaW9ucycsXG5cdFx0XHRcdCcuZ2l0YXR0cmlidXRlcycsXG5cdFx0XHRcdCcuZ2l0LWJsYW1lLWlnbm9yZS1yZXZzJyxcblx0XHRcdFx0Jy5naXRodWInLFxuXHRcdFx0XHQnLmdpdGlnbm9yZScsXG5cdFx0XHRcdCdndWxwZmlsZS5qcycsXG5cdFx0XHRcdCdMSUNFTlNFLnR4dCcsXG5cdFx0XHRcdCcubHNpZnJjLmpzb24nLFxuXHRcdFx0XHQnLm1haWxtYXAnLFxuXHRcdFx0XHQnLm1lbnRpb24tYm90Jyxcblx0XHRcdFx0J25vZGVfbW9kdWxlcycsXG5cdFx0XHRcdCcubnBtcmMnLFxuXHRcdFx0XHQnLm52bXJjJyxcblx0XHRcdFx0J291dCcsXG5cdFx0XHRcdCdwYWNrYWdlLmpzb24nLFxuXHRcdFx0XHQncGFja2FnZS1sb2NrLmpzb24nLFxuXHRcdFx0XHQncHJvZHVjdC5qc29uJyxcblx0XHRcdFx0Jy5wcm9maWxlLW9zcycsXG5cdFx0XHRcdCdSRUFETUUubWQnLFxuXHRcdFx0XHQncmVtb3RlJyxcblx0XHRcdFx0J3Jlc291cmNlcycsXG5cdFx0XHRcdCdzY3JpcHRzJyxcblx0XHRcdFx0J1NFQ1VSSVRZLm1kJyxcblx0XHRcdFx0J3NyYycsXG5cdFx0XHRcdCd0ZXN0Jyxcblx0XHRcdFx0J1RoaXJkUGFydHlOb3RpY2VzLnR4dCcsXG5cdFx0XHRcdCd0c2ZtdC5qc29uJyxcblx0XHRcdFx0Jy52c2NvZGUnLFxuXHRcdFx0XHQnLnZzY29kZS10ZXN0Jyxcblx0XHRcdFx0Jy52c2NvZGUtdGVzdC5qcycsXG5cdFx0XHRcdCdfX2luaXRfXy5weScsXG5cdFx0XHRcdCdfX3B5Y2FjaGUnLFxuXHRcdFx0XSk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHN1aXRlKCdQdW5jdHVhdGlvbicsICgpID0+IHtcblx0XHR0ZXN0KCdwdW5jdHVhdGlvbiBjaGFycyBzaG91bGQgYmUgYmVsb3cgb3RoZXIgbWV0aG9kcycsIGZ1bmN0aW9uICgpIHtcblx0XHRcdGNvbnN0IGl0ZW1zID0gW1xuXHRcdFx0XHRjcmVhdGVJdGVtKHsgbGFiZWw6ICdhJyB9KSxcblx0XHRcdFx0Y3JlYXRlSXRlbSh7IGxhYmVsOiAnYicgfSksXG5cdFx0XHRcdGNyZWF0ZUl0ZW0oeyBsYWJlbDogJywnIH0pLFxuXHRcdFx0XHRjcmVhdGVJdGVtKHsgbGFiZWw6ICc7JyB9KSxcblx0XHRcdFx0Y3JlYXRlSXRlbSh7IGxhYmVsOiAnOicgfSksXG5cdFx0XHRcdGNyZWF0ZUl0ZW0oeyBsYWJlbDogJ2MnIH0pLFxuXHRcdFx0XHRjcmVhdGVJdGVtKHsgbGFiZWw6ICdbJyB9KSxcblx0XHRcdFx0Y3JlYXRlSXRlbSh7IGxhYmVsOiAnLi4uJyB9KSxcblx0XHRcdF07XG5cdFx0XHRtb2RlbCA9IG5ldyBUZXJtaW5hbENvbXBsZXRpb25Nb2RlbChpdGVtcywgbmV3IExpbmVDb250ZXh0KCcnLCAwKSk7XG5cdFx0XHRhc3NlcnRJdGVtcyhtb2RlbCwgWydhJywgJ2InLCAnYycsICcsJywgJzsnLCAnOicsICdbJywgJy4uLiddKTtcblx0XHR9KTtcblx0XHR0ZXN0KCdwdW5jdHVhdGlvbiBjaGFycyBzaG91bGQgYmUgYmVsb3cgb3RoZXIgZmlsZXMnLCBmdW5jdGlvbiAoKSB7XG5cdFx0XHRjb25zdCBpdGVtcyA9IFtcblx0XHRcdFx0Y3JlYXRlSXRlbSh7IGxhYmVsOiAnLi4nIH0pLFxuXHRcdFx0XHRjcmVhdGVJdGVtKHsgbGFiZWw6ICcuLi4nIH0pLFxuXHRcdFx0XHRjcmVhdGVJdGVtKHsgbGFiZWw6ICcuLi8nIH0pLFxuXHRcdFx0XHRjcmVhdGVJdGVtKHsgbGFiZWw6ICcuL2EvJyB9KSxcblx0XHRcdFx0Y3JlYXRlSXRlbSh7IGxhYmVsOiAnLi9iLycgfSksXG5cdFx0XHRdO1xuXHRcdFx0bW9kZWwgPSBuZXcgVGVybWluYWxDb21wbGV0aW9uTW9kZWwoaXRlbXMsIG5ldyBMaW5lQ29udGV4dCgnJywgMCkpO1xuXHRcdFx0YXNzZXJ0SXRlbXMobW9kZWwsIFsnLi9hLycsICcuL2IvJywgJy4uJywgJy4uLicsICcuLi8nXSk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHN1aXRlKCdpbmxpbmUgY29tcGxldGlvbnMnLCAoKSA9PiB7XG5cdFx0ZnVuY3Rpb24gY3JlYXRlSXRlbXMoa2luZDogVGVybWluYWxDb21wbGV0aW9uSXRlbUtpbmQuSW5saW5lU3VnZ2VzdGlvbiB8IFRlcm1pbmFsQ29tcGxldGlvbkl0ZW1LaW5kLklubGluZVN1Z2dlc3Rpb25BbHdheXNPblRvcCkge1xuXHRcdFx0cmV0dXJuIFtcblx0XHRcdFx0Li4uY3JlYXRlRm9sZGVySXRlbXMoJ2EnLCAnYycpLFxuXHRcdFx0XHQuLi5jcmVhdGVGaWxlSXRlbXMoJ2InLCAnZCcpLFxuXHRcdFx0XHRuZXcgVGVybWluYWxDb21wbGV0aW9uSXRlbSh7XG5cdFx0XHRcdFx0bGFiZWw6ICdhYicsXG5cdFx0XHRcdFx0cHJvdmlkZXI6ICdjb3JlJyxcblx0XHRcdFx0XHRyZXBsYWNlbWVudFJhbmdlOiBbMCwgMF0sXG5cdFx0XHRcdFx0a2luZFxuXHRcdFx0XHR9KVxuXHRcdFx0XTtcblx0XHR9XG5cdFx0c3VpdGUoJ0lubGluZVN1Z2dlc3Rpb24nLCAoKSA9PiB7XG5cdFx0XHR0ZXN0KCdzaG91bGQgcHV0IG9uIHRvcCBnZW5lcmFsbHknLCBmdW5jdGlvbiAoKSB7XG5cdFx0XHRcdGNvbnN0IG1vZGVsID0gbmV3IFRlcm1pbmFsQ29tcGxldGlvbk1vZGVsKGNyZWF0ZUl0ZW1zKFRlcm1pbmFsQ29tcGxldGlvbkl0ZW1LaW5kLklubGluZVN1Z2dlc3Rpb24pLCBuZXcgTGluZUNvbnRleHQoJycsIDApKTtcblx0XHRcdFx0c3RyaWN0RXF1YWwobW9kZWwuaXRlbXNbMF0uY29tcGxldGlvbi5sYWJlbCwgJ2FiJyk7XG5cdFx0XHR9KTtcblx0XHRcdHRlc3QoJ3Nob3VsZCBOT1QgcHV0IG9uIHRvcCB3aGVuIHRoZXJlXFwncyBhbiBleGFjdCBtYXRjaCBvZiBhbm90aGVyIGl0ZW0nLCBmdW5jdGlvbiAoKSB7XG5cdFx0XHRcdGNvbnN0IG1vZGVsID0gbmV3IFRlcm1pbmFsQ29tcGxldGlvbk1vZGVsKGNyZWF0ZUl0ZW1zKFRlcm1pbmFsQ29tcGxldGlvbkl0ZW1LaW5kLklubGluZVN1Z2dlc3Rpb24pLCBuZXcgTGluZUNvbnRleHQoJ2EnLCAwKSk7XG5cdFx0XHRcdG5vdFN0cmljdEVxdWFsKG1vZGVsLml0ZW1zWzBdLmNvbXBsZXRpb24ubGFiZWwsICdhYicpO1xuXHRcdFx0XHRzdHJpY3RFcXVhbChtb2RlbC5pdGVtc1sxXS5jb21wbGV0aW9uLmxhYmVsLCAnYWInKTtcblx0XHRcdH0pO1xuXHRcdH0pO1xuXHRcdHN1aXRlKCdJbmxpbmVTdWdnZXN0aW9uQWx3YXlzT25Ub3AnLCAoKSA9PiB7XG5cdFx0XHR0ZXN0KCdzaG91bGQgcHV0IG9uIHRvcCBnZW5lcmFsbHknLCBmdW5jdGlvbiAoKSB7XG5cdFx0XHRcdGNvbnN0IG1vZGVsID0gbmV3IFRlcm1pbmFsQ29tcGxldGlvbk1vZGVsKGNyZWF0ZUl0ZW1zKFRlcm1pbmFsQ29tcGxldGlvbkl0ZW1LaW5kLklubGluZVN1Z2dlc3Rpb25BbHdheXNPblRvcCksIG5ldyBMaW5lQ29udGV4dCgnJywgMCkpO1xuXHRcdFx0XHRzdHJpY3RFcXVhbChtb2RlbC5pdGVtc1swXS5jb21wbGV0aW9uLmxhYmVsLCAnYWInKTtcblx0XHRcdH0pO1xuXHRcdFx0dGVzdCgnc2hvdWxkIHB1dCBvbiB0b3AgZXZlbiBpZiB0aGVyZVxcJ3MgYW4gZXhhY3QgbWF0Y2ggb2YgYW5vdGhlciBpdGVtJywgZnVuY3Rpb24gKCkge1xuXHRcdFx0XHRjb25zdCBtb2RlbCA9IG5ldyBUZXJtaW5hbENvbXBsZXRpb25Nb2RlbChjcmVhdGVJdGVtcyhUZXJtaW5hbENvbXBsZXRpb25JdGVtS2luZC5JbmxpbmVTdWdnZXN0aW9uQWx3YXlzT25Ub3ApLCBuZXcgTGluZUNvbnRleHQoJ2EnLCAwKSk7XG5cdFx0XHRcdHN0cmljdEVxdWFsKG1vZGVsLml0ZW1zWzBdLmNvbXBsZXRpb24ubGFiZWwsICdhYicpO1xuXHRcdFx0fSk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cblx0c3VpdGUoJ2dpdCBicmFuY2ggcHJpb3JpdHkgc29ydGluZycsICgpID0+IHtcblx0XHR0ZXN0KCdzaG91bGQgcHJpb3JpdGl6ZSBtYWluIGFuZCBtYXN0ZXIgYnJhbmNoZXMgZm9yIGdpdCBjb21tYW5kcycsICgpID0+IHtcblx0XHRcdGNvbnN0IGl0ZW1zID0gW1xuXHRcdFx0XHRjcmVhdGVJdGVtKHsga2luZDogVGVybWluYWxDb21wbGV0aW9uSXRlbUtpbmQuQXJndW1lbnQsIGxhYmVsOiAnZmVhdHVyZS1icmFuY2gnIH0pLFxuXHRcdFx0XHRjcmVhdGVJdGVtKHsga2luZDogVGVybWluYWxDb21wbGV0aW9uSXRlbUtpbmQuQXJndW1lbnQsIGxhYmVsOiAnbWFzdGVyJyB9KSxcblx0XHRcdFx0Y3JlYXRlSXRlbSh7IGtpbmQ6IFRlcm1pbmFsQ29tcGxldGlvbkl0ZW1LaW5kLkFyZ3VtZW50LCBsYWJlbDogJ2RldmVsb3BtZW50JyB9KSxcblx0XHRcdFx0Y3JlYXRlSXRlbSh7IGtpbmQ6IFRlcm1pbmFsQ29tcGxldGlvbkl0ZW1LaW5kLkFyZ3VtZW50LCBsYWJlbDogJ21haW4nIH0pXG5cdFx0XHRdO1xuXHRcdFx0Y29uc3QgbW9kZWwgPSBuZXcgVGVybWluYWxDb21wbGV0aW9uTW9kZWwoaXRlbXMsIG5ldyBMaW5lQ29udGV4dCgnZ2l0IGNoZWNrb3V0ICcsIDApKTtcblx0XHRcdGFzc2VydEl0ZW1zKG1vZGVsLCBbJ21haW4nLCAnbWFzdGVyJywgJ2RldmVsb3BtZW50JywgJ2ZlYXR1cmUtYnJhbmNoJ10pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnc2hvdWxkIHByaW9yaXRpemUgbWFpbiBhbmQgbWFzdGVyIGJyYW5jaGVzIGZvciBnaXQgc3dpdGNoIGNvbW1hbmQnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBpdGVtcyA9IFtcblx0XHRcdFx0Y3JlYXRlSXRlbSh7IGtpbmQ6IFRlcm1pbmFsQ29tcGxldGlvbkl0ZW1LaW5kLkFyZ3VtZW50LCBsYWJlbDogJ2ZlYXR1cmUtYnJhbmNoJyB9KSxcblx0XHRcdFx0Y3JlYXRlSXRlbSh7IGtpbmQ6IFRlcm1pbmFsQ29tcGxldGlvbkl0ZW1LaW5kLkFyZ3VtZW50LCBsYWJlbDogJ21haW4nIH0pLFxuXHRcdFx0XHRjcmVhdGVJdGVtKHsga2luZDogVGVybWluYWxDb21wbGV0aW9uSXRlbUtpbmQuQXJndW1lbnQsIGxhYmVsOiAnYW5vdGhlci1mZWF0dXJlJyB9KSxcblx0XHRcdFx0Y3JlYXRlSXRlbSh7IGtpbmQ6IFRlcm1pbmFsQ29tcGxldGlvbkl0ZW1LaW5kLkFyZ3VtZW50LCBsYWJlbDogJ21hc3RlcicgfSlcblx0XHRcdF07XG5cdFx0XHRjb25zdCBtb2RlbCA9IG5ldyBUZXJtaW5hbENvbXBsZXRpb25Nb2RlbChpdGVtcywgbmV3IExpbmVDb250ZXh0KCdnaXQgc3dpdGNoICcsIDApKTtcblx0XHRcdGFzc2VydEl0ZW1zKG1vZGVsLCBbJ21haW4nLCAnbWFzdGVyJywgJ2Fub3RoZXItZmVhdHVyZScsICdmZWF0dXJlLWJyYW5jaCddKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3Nob3VsZCBub3QgcHJpb3JpdGl6ZSBtYWluIGFuZCBtYXN0ZXIgZm9yIG5vbi1naXQgY29tbWFuZHMnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBpdGVtcyA9IFtcblx0XHRcdFx0Y3JlYXRlSXRlbSh7IGtpbmQ6IFRlcm1pbmFsQ29tcGxldGlvbkl0ZW1LaW5kLkFyZ3VtZW50LCBsYWJlbDogJ2ZlYXR1cmUtYnJhbmNoJyB9KSxcblx0XHRcdFx0Y3JlYXRlSXRlbSh7IGtpbmQ6IFRlcm1pbmFsQ29tcGxldGlvbkl0ZW1LaW5kLkFyZ3VtZW50LCBsYWJlbDogJ21hc3RlcicgfSksXG5cdFx0XHRcdGNyZWF0ZUl0ZW0oeyBraW5kOiBUZXJtaW5hbENvbXBsZXRpb25JdGVtS2luZC5Bcmd1bWVudCwgbGFiZWw6ICdtYWluJyB9KVxuXHRcdFx0XTtcblx0XHRcdGNvbnN0IG1vZGVsID0gbmV3IFRlcm1pbmFsQ29tcGxldGlvbk1vZGVsKGl0ZW1zLCBuZXcgTGluZUNvbnRleHQoJ2xzICcsIDApKTtcblx0XHRcdGFzc2VydEl0ZW1zKG1vZGVsLCBbJ2ZlYXR1cmUtYnJhbmNoJywgJ21haW4nLCAnbWFzdGVyJ10pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnc2hvdWxkIGhhbmRsZSBnaXQgY29tbWFuZHMgd2l0aCBsZWFkaW5nIHdoaXRlc3BhY2UnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBpdGVtcyA9IFtcblx0XHRcdFx0Y3JlYXRlSXRlbSh7IGtpbmQ6IFRlcm1pbmFsQ29tcGxldGlvbkl0ZW1LaW5kLkFyZ3VtZW50LCBsYWJlbDogJ2ZlYXR1cmUtYnJhbmNoJyB9KSxcblx0XHRcdFx0Y3JlYXRlSXRlbSh7IGtpbmQ6IFRlcm1pbmFsQ29tcGxldGlvbkl0ZW1LaW5kLkFyZ3VtZW50LCBsYWJlbDogJ21hc3RlcicgfSksXG5cdFx0XHRcdGNyZWF0ZUl0ZW0oeyBraW5kOiBUZXJtaW5hbENvbXBsZXRpb25JdGVtS2luZC5Bcmd1bWVudCwgbGFiZWw6ICdtYWluJyB9KVxuXHRcdFx0XTtcblx0XHRcdGNvbnN0IG1vZGVsID0gbmV3IFRlcm1pbmFsQ29tcGxldGlvbk1vZGVsKGl0ZW1zLCBuZXcgTGluZUNvbnRleHQoJyAgZ2l0IGNoZWNrb3V0ICcsIDApKTtcblx0XHRcdGFzc2VydEl0ZW1zKG1vZGVsLCBbJ21haW4nLCAnbWFzdGVyJywgJ2ZlYXR1cmUtYnJhbmNoJ10pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnc2hvdWxkIHdvcmsgd2l0aCBjb21wbGV4IGxhYmVsIG9iamVjdHMnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBpdGVtcyA9IFtcblx0XHRcdFx0Y3JlYXRlSXRlbSh7IGtpbmQ6IFRlcm1pbmFsQ29tcGxldGlvbkl0ZW1LaW5kLkFyZ3VtZW50LCBsYWJlbDogeyBsYWJlbDogJ2ZlYXR1cmUtYnJhbmNoJywgZGVzY3JpcHRpb246ICdGZWF0dXJlIGJyYW5jaCcgfSB9KSxcblx0XHRcdFx0Y3JlYXRlSXRlbSh7IGtpbmQ6IFRlcm1pbmFsQ29tcGxldGlvbkl0ZW1LaW5kLkFyZ3VtZW50LCBsYWJlbDogeyBsYWJlbDogJ21hc3RlcicsIGRlc2NyaXB0aW9uOiAnTWFzdGVyIGJyYW5jaCcgfSB9KSxcblx0XHRcdFx0Y3JlYXRlSXRlbSh7IGtpbmQ6IFRlcm1pbmFsQ29tcGxldGlvbkl0ZW1LaW5kLkFyZ3VtZW50LCBsYWJlbDogeyBsYWJlbDogJ21haW4nLCBkZXNjcmlwdGlvbjogJ01haW4gYnJhbmNoJyB9IH0pXG5cdFx0XHRdO1xuXHRcdFx0Y29uc3QgbW9kZWwgPSBuZXcgVGVybWluYWxDb21wbGV0aW9uTW9kZWwoaXRlbXMsIG5ldyBMaW5lQ29udGV4dCgnZ2l0IGNoZWNrb3V0ICcsIDApKTtcblx0XHRcdGFzc2VydEl0ZW1zKG1vZGVsLCBbXG5cdFx0XHRcdHsgbGFiZWw6ICdtYWluJywgZGVzY3JpcHRpb246ICdNYWluIGJyYW5jaCcgfSxcblx0XHRcdFx0eyBsYWJlbDogJ21hc3RlcicsIGRlc2NyaXB0aW9uOiAnTWFzdGVyIGJyYW5jaCcgfSxcblx0XHRcdFx0eyBsYWJlbDogJ2ZlYXR1cmUtYnJhbmNoJywgZGVzY3JpcHRpb246ICdGZWF0dXJlIGJyYW5jaCcgfSxcblx0XHRcdF0pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnc2hvdWxkIG5vdCBwcmlvcml0aXplIGJyYW5jaGVzIHdpdGggc2ltaWxhciBuYW1lcycsICgpID0+IHtcblx0XHRcdGNvbnN0IGl0ZW1zID0gW1xuXHRcdFx0XHRjcmVhdGVJdGVtKHsga2luZDogVGVybWluYWxDb21wbGV0aW9uSXRlbUtpbmQuQXJndW1lbnQsIGxhYmVsOiAnbWFpbmxpbmUnIH0pLFxuXHRcdFx0XHRjcmVhdGVJdGVtKHsga2luZDogVGVybWluYWxDb21wbGV0aW9uSXRlbUtpbmQuQXJndW1lbnQsIGxhYmVsOiAnbWFzdGVycGllY2UnIH0pLFxuXHRcdFx0XHRjcmVhdGVJdGVtKHsga2luZDogVGVybWluYWxDb21wbGV0aW9uSXRlbUtpbmQuQXJndW1lbnQsIGxhYmVsOiAnbWFpbicgfSksXG5cdFx0XHRcdGNyZWF0ZUl0ZW0oeyBraW5kOiBUZXJtaW5hbENvbXBsZXRpb25JdGVtS2luZC5Bcmd1bWVudCwgbGFiZWw6ICdtYXN0ZXInIH0pXG5cdFx0XHRdO1xuXHRcdFx0Y29uc3QgbW9kZWwgPSBuZXcgVGVybWluYWxDb21wbGV0aW9uTW9kZWwoaXRlbXMsIG5ldyBMaW5lQ29udGV4dCgnZ2l0IGNoZWNrb3V0ICcsIDApKTtcblx0XHRcdGFzc2VydEl0ZW1zKG1vZGVsLCBbJ21haW4nLCAnbWFzdGVyJywgJ21haW5saW5lJywgJ21hc3RlcnBpZWNlJ10pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnc2hvdWxkIHByaW9yaXRpemUgZm9yIGdpdCBicmFuY2ggLWQnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBpdGVtcyA9IFtcblx0XHRcdFx0Y3JlYXRlSXRlbSh7IGtpbmQ6IFRlcm1pbmFsQ29tcGxldGlvbkl0ZW1LaW5kLkFyZ3VtZW50LCBsYWJlbDogJ21haW4nIH0pLFxuXHRcdFx0XHRjcmVhdGVJdGVtKHsga2luZDogVGVybWluYWxDb21wbGV0aW9uSXRlbUtpbmQuQXJndW1lbnQsIGxhYmVsOiAnbWFzdGVyJyB9KSxcblx0XHRcdFx0Y3JlYXRlSXRlbSh7IGtpbmQ6IFRlcm1pbmFsQ29tcGxldGlvbkl0ZW1LaW5kLkFyZ3VtZW50LCBsYWJlbDogJ2RldicgfSlcblx0XHRcdF07XG5cdFx0XHRjb25zdCBtb2RlbCA9IG5ldyBUZXJtaW5hbENvbXBsZXRpb25Nb2RlbChpdGVtcywgbmV3IExpbmVDb250ZXh0KCdnaXQgYnJhbmNoIC1kICcsIDApKTtcblx0XHRcdGFzc2VydEl0ZW1zKG1vZGVsLCBbJ21haW4nLCAnbWFzdGVyJywgJ2RldiddKTtcblx0XHR9KTtcblx0fSk7XG5cblx0c3VpdGUoJ21peGVkIGtpbmQgc29ydGluZycsICgpID0+IHtcblx0XHR0ZXN0KCdzaG91bGQgc29ydCBhcmd1bWVudHMgYmVmb3JlIGZsYWdzIGFuZCBvcHRpb25zJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgaXRlbXMgPSBbXG5cdFx0XHRcdGNyZWF0ZUl0ZW0oeyBraW5kOiBUZXJtaW5hbENvbXBsZXRpb25JdGVtS2luZC5GbGFnLCBsYWJlbDogJy0tdmVyYm9zZScgfSksXG5cdFx0XHRcdGNyZWF0ZUl0ZW0oeyBraW5kOiBUZXJtaW5hbENvbXBsZXRpb25JdGVtS2luZC5PcHRpb24sIGxhYmVsOiAnLS1jb25maWcnIH0pLFxuXHRcdFx0XHRjcmVhdGVJdGVtKHsga2luZDogVGVybWluYWxDb21wbGV0aW9uSXRlbUtpbmQuQXJndW1lbnQsIGxhYmVsOiAndmFsdWUyJyB9KSxcblx0XHRcdFx0Y3JlYXRlSXRlbSh7IGtpbmQ6IFRlcm1pbmFsQ29tcGxldGlvbkl0ZW1LaW5kLkFyZ3VtZW50LCBsYWJlbDogJ3ZhbHVlMScgfSksXG5cdFx0XHRcdGNyZWF0ZUl0ZW0oeyBraW5kOiBUZXJtaW5hbENvbXBsZXRpb25JdGVtS2luZC5GbGFnLCBsYWJlbDogJy0tYWxsJyB9KSxcblx0XHRcdF07XG5cdFx0XHRjb25zdCBtb2RlbCA9IG5ldyBUZXJtaW5hbENvbXBsZXRpb25Nb2RlbChpdGVtcywgbmV3IExpbmVDb250ZXh0KCdjbWQgJywgMCkpO1xuXHRcdFx0YXNzZXJ0SXRlbXMobW9kZWwsIFsndmFsdWUxJywgJ3ZhbHVlMicsICctLWFsbCcsICctLWNvbmZpZycsICctLXZlcmJvc2UnXSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdzaG91bGQgc29ydCBieSBraW5kIGhpZXJhcmNoeTogbWV0aG9kcy9hbGlhc2VzLCBhcmd1bWVudHMsIG90aGVycywgZmlsZXMvZm9sZGVycycsICgpID0+IHtcblx0XHRcdGNvbnN0IGl0ZW1zID0gW1xuXHRcdFx0XHRjcmVhdGVJdGVtKHsga2luZDogVGVybWluYWxDb21wbGV0aW9uSXRlbUtpbmQuRmlsZSwgbGFiZWw6ICdmaWxlLnR4dCcgfSksXG5cdFx0XHRcdGNyZWF0ZUl0ZW0oeyBraW5kOiBUZXJtaW5hbENvbXBsZXRpb25JdGVtS2luZC5GbGFnLCBsYWJlbDogJy0tZmxhZycgfSksXG5cdFx0XHRcdGNyZWF0ZUl0ZW0oeyBraW5kOiBUZXJtaW5hbENvbXBsZXRpb25JdGVtS2luZC5Bcmd1bWVudCwgbGFiZWw6ICdhcmcnIH0pLFxuXHRcdFx0XHRjcmVhdGVJdGVtKHsga2luZDogVGVybWluYWxDb21wbGV0aW9uSXRlbUtpbmQuTWV0aG9kLCBsYWJlbDogJ21ldGhvZCcgfSksXG5cdFx0XHRcdGNyZWF0ZUl0ZW0oeyBraW5kOiBUZXJtaW5hbENvbXBsZXRpb25JdGVtS2luZC5Gb2xkZXIsIGxhYmVsOiAnZm9sZGVyLycgfSksXG5cdFx0XHRcdGNyZWF0ZUl0ZW0oeyBraW5kOiBUZXJtaW5hbENvbXBsZXRpb25JdGVtS2luZC5PcHRpb24sIGxhYmVsOiAnLS1vcHRpb24nIH0pLFxuXHRcdFx0XHRjcmVhdGVJdGVtKHsga2luZDogVGVybWluYWxDb21wbGV0aW9uSXRlbUtpbmQuQWxpYXMsIGxhYmVsOiAnYWxpYXMnIH0pLFxuXHRcdFx0XHRjcmVhdGVJdGVtKHsga2luZDogVGVybWluYWxDb21wbGV0aW9uSXRlbUtpbmQuU3ltYm9saWNMaW5rRmlsZSwgbGFiZWw6ICdmaWxlMi50eHQnIH0pLFxuXHRcdFx0XHRjcmVhdGVJdGVtKHsga2luZDogVGVybWluYWxDb21wbGV0aW9uSXRlbUtpbmQuU3ltYm9saWNMaW5rRm9sZGVyLCBsYWJlbDogJ2ZvbGRlcjIvJyB9KSxcblx0XHRcdF07XG5cdFx0XHRjb25zdCBtb2RlbCA9IG5ldyBUZXJtaW5hbENvbXBsZXRpb25Nb2RlbChpdGVtcywgbmV3IExpbmVDb250ZXh0KCcnLCAwKSk7XG5cdFx0XHRhc3NlcnRJdGVtcyhtb2RlbCwgWydhbGlhcycsICdtZXRob2QnLCAnYXJnJywgJy0tZmxhZycsICctLW9wdGlvbicsICdmaWxlMi50eHQnLCAnZmlsZS50eHQnLCAnZm9sZGVyLycsICdmb2xkZXIyLyddKTtcblx0XHR9KTtcblx0fSk7XG59KTtcblxuIl0sCiAgIm1hcHBpbmdzIjogIkFBSUEsT0FBTyxVQUFVLGdCQUFnQixtQkFBbUI7QUFDcEQsU0FBUywrQ0FBK0M7QUFDeEQsU0FBUywrQkFBK0I7QUFDeEMsU0FBUyxtQkFBbUI7QUFDNUIsU0FBUyx3QkFBd0Isa0NBQTREO0FBRzdGLFNBQVMsV0FBVyxTQUErRDtBQUNsRixTQUFPLElBQUksdUJBQXVCO0FBQUEsSUFDakMsR0FBRztBQUFBLElBQ0gsTUFBTSxRQUFRLFFBQVEsMkJBQTJCO0FBQUEsSUFDakQsT0FBTyxRQUFRLFNBQVM7QUFBQSxJQUN4QixVQUFVLFFBQVEsWUFBWTtBQUFBLElBQzlCLGtCQUFrQixRQUFRLG9CQUFvQixDQUFDLEdBQUcsQ0FBQztBQUFBLEVBQ3BELENBQUM7QUFDRjtBQUVBLFNBQVMsbUJBQW1CLFFBQTRDO0FBQ3ZFLFNBQU8sT0FBTyxJQUFJLFdBQVMsV0FBVyxFQUFFLE9BQU8sTUFBTSwyQkFBMkIsS0FBSyxDQUFDLENBQUM7QUFDeEY7QUFFQSxTQUFTLHdCQUF3QixRQUEyQztBQUMzRSxTQUFPLElBQUk7QUFBQSxJQUNWLGdCQUFnQixHQUFHLE1BQU07QUFBQSxJQUN6QixJQUFJLFlBQVksSUFBSSxDQUFDO0FBQUEsRUFDdEI7QUFDRDtBQUVBLFNBQVMscUJBQXFCLFFBQTRDO0FBQ3pFLFNBQU8sT0FBTyxJQUFJLFdBQVMsV0FBVyxFQUFFLE9BQU8sTUFBTSwyQkFBMkIsT0FBTyxDQUFDLENBQUM7QUFDMUY7QUFFQSxTQUFTLDBCQUEwQixRQUEyQztBQUM3RSxTQUFPLElBQUk7QUFBQSxJQUNWLGtCQUFrQixHQUFHLE1BQU07QUFBQSxJQUMzQixJQUFJLFlBQVksSUFBSSxDQUFDO0FBQUEsRUFDdEI7QUFDRDtBQUVBLFNBQVMsWUFBWSxPQUFnQyxRQUFnRDtBQUNwRyxTQUFPLGdCQUFnQixNQUFNLE1BQU0sSUFBSSxPQUFLLEVBQUUsV0FBVyxLQUFLLEdBQUcsTUFBTTtBQUN2RSxTQUFPLFlBQVksTUFBTSxNQUFNLFFBQVEsT0FBTyxNQUFNO0FBQ3JEO0FBRUEsTUFBTSwyQkFBMkIsV0FBWTtBQUM1QywwQ0FBd0M7QUFFeEMsTUFBSTtBQUVKLE9BQUssK0JBQStCLFdBQVk7QUFDL0MsWUFBUSxJQUFJLHdCQUF3QixDQUFDLEdBQUcsSUFBSSxZQUFZLElBQUksQ0FBQyxDQUFDO0FBRTlELFdBQU8sWUFBWSxNQUFNLE1BQU0sUUFBUSxDQUFDO0FBQUEsRUFDekMsQ0FBQztBQUVELE9BQUssc0NBQXNDLFdBQVk7QUFDdEQsWUFBUSxJQUFJLHdCQUF3QjtBQUFBLE1BQ25DLFdBQVcsRUFBRSxPQUFPLElBQUksQ0FBQztBQUFBLElBQzFCLEdBQUcsSUFBSSxZQUFZLElBQUksQ0FBQyxDQUFDO0FBRXpCLFdBQU8sWUFBWSxNQUFNLE1BQU0sUUFBUSxDQUFDO0FBQ3hDLFdBQU8sWUFBWSxNQUFNLE1BQU0sQ0FBQyxFQUFFLFdBQVcsT0FBTyxHQUFHO0FBQUEsRUFDeEQsQ0FBQztBQUVELE9BQUssOEJBQThCLFdBQVk7QUFDOUMsWUFBUSxJQUFJLHdCQUF3QjtBQUFBLE1BQ25DLFdBQVcsRUFBRSxPQUFPLElBQUksQ0FBQztBQUFBLE1BQ3pCLFdBQVcsRUFBRSxPQUFPLElBQUksQ0FBQztBQUFBLE1BQ3pCLFdBQVcsRUFBRSxPQUFPLElBQUksQ0FBQztBQUFBLElBQzFCLEdBQUcsSUFBSSxZQUFZLElBQUksQ0FBQyxDQUFDO0FBRXpCLFdBQU8sWUFBWSxNQUFNLE1BQU0sUUFBUSxDQUFDO0FBQ3hDLFdBQU8sWUFBWSxNQUFNLE1BQU0sQ0FBQyxFQUFFLFdBQVcsT0FBTyxHQUFHO0FBQ3ZELFdBQU8sWUFBWSxNQUFNLE1BQU0sQ0FBQyxFQUFFLFdBQVcsT0FBTyxHQUFHO0FBQ3ZELFdBQU8sWUFBWSxNQUFNLE1BQU0sQ0FBQyxFQUFFLFdBQVcsT0FBTyxHQUFHO0FBQUEsRUFDeEQsQ0FBQztBQUVELE9BQUssa0JBQWtCLE1BQU07QUFDNUIsVUFBTSxVQUFVO0FBQUEsTUFDZjtBQUFBLE1BQ0E7QUFBQSxNQUNBO0FBQUEsTUFDQTtBQUFBLElBQ0Q7QUFDQSxVQUFNLFdBQVc7QUFBQSxNQUNoQjtBQUFBLE1BQ0E7QUFBQSxNQUNBO0FBQUEsTUFDQTtBQUFBLElBQ0Q7QUFDQSxZQUFRLElBQUksd0JBQXdCLFFBQVEsSUFBSSxPQUFNLFdBQVcsRUFBRSxPQUFPLEVBQUUsQ0FBQyxDQUFFLEdBQUcsSUFBSSxZQUFZLEtBQUssQ0FBQyxDQUFDO0FBRXpHLGdCQUFZLE9BQU8sUUFBUTtBQUFBLEVBQzVCLENBQUM7QUFFRCxRQUFNLHFCQUFxQixNQUFNO0FBQ2hDLFNBQUssd0RBQXdELFdBQVk7QUFDeEUsWUFBTSxVQUFVLENBQUMsTUFBTSxLQUFLLEdBQUc7QUFDL0IsWUFBTSxXQUFXLENBQUMsS0FBSyxLQUFLLElBQUk7QUFDaEMsa0JBQVkscUJBQXFCLEdBQUcsT0FBTyxHQUFHLFFBQVE7QUFDdEQsa0JBQVksdUJBQXVCLEdBQUcsT0FBTyxHQUFHLFFBQVE7QUFBQSxJQUN6RCxDQUFDO0FBRUQsU0FBSyxrREFBa0QsV0FBWTtBQUNsRSxZQUFNLFVBQVUsQ0FBQyxLQUFLLE1BQU0sS0FBSyxJQUFJO0FBQ3JDLFlBQU0sV0FBVyxDQUFDLE1BQU0sS0FBSyxLQUFLLElBQUk7QUFDdEMsa0JBQVkscUJBQXFCLEdBQUcsT0FBTyxHQUFHLFFBQVE7QUFDdEQsa0JBQVksdUJBQXVCLEdBQUcsT0FBTyxHQUFHLFFBQVE7QUFBQSxJQUN6RCxDQUFDO0FBRUQsU0FBSyxrREFBa0QsV0FBWTtBQUdsRSxZQUFNLFFBQVE7QUFBQSxRQUNiLEdBQUc7QUFBQSxVQUNGO0FBQUEsVUFDQTtBQUFBLFVBQ0E7QUFBQSxVQUNBO0FBQUEsVUFDQTtBQUFBLFVBQ0E7QUFBQSxVQUNBO0FBQUEsVUFDQTtBQUFBLFVBQ0E7QUFBQSxVQUNBO0FBQUEsVUFDQTtBQUFBLFVBQ0E7QUFBQSxVQUNBO0FBQUEsVUFDQTtBQUFBLFVBQ0E7QUFBQSxVQUNBO0FBQUEsVUFDQTtBQUFBLFVBQ0E7QUFBQSxVQUNBO0FBQUEsUUFDRDtBQUFBLFFBQ0EsR0FBRztBQUFBLFVBQ0Y7QUFBQSxVQUNBO0FBQUEsVUFDQTtBQUFBLFVBQ0E7QUFBQSxVQUNBO0FBQUEsVUFDQTtBQUFBLFVBQ0E7QUFBQSxVQUNBO0FBQUEsVUFDQTtBQUFBLFVBQ0E7QUFBQSxVQUNBO0FBQUEsVUFDQTtBQUFBLFVBQ0E7QUFBQSxVQUNBO0FBQUEsVUFDQTtBQUFBLFVBQ0E7QUFBQSxVQUNBO0FBQUEsVUFDQTtBQUFBLFVBQ0E7QUFBQSxVQUNBO0FBQUEsVUFDQTtBQUFBLFVBQ0E7QUFBQSxVQUNBO0FBQUEsVUFDQTtBQUFBLFVBQ0E7QUFBQSxVQUNBO0FBQUEsUUFDRDtBQUFBLE1BQ0Q7QUFDQSxZQUFNQSxTQUFRLElBQUksd0JBQXdCLE9BQU8sSUFBSSxZQUFZLElBQUksQ0FBQyxDQUFDO0FBQ3ZFLGtCQUFZQSxRQUFPO0FBQUEsUUFDbEI7QUFBQSxRQUNBO0FBQUEsUUFDQTtBQUFBLFFBQ0E7QUFBQSxRQUNBO0FBQUEsUUFDQTtBQUFBLFFBQ0E7QUFBQSxRQUNBO0FBQUEsUUFDQTtBQUFBLFFBQ0E7QUFBQSxRQUNBO0FBQUEsUUFDQTtBQUFBLFFBQ0E7QUFBQSxRQUNBO0FBQUEsUUFDQTtBQUFBLFFBQ0E7QUFBQSxRQUNBO0FBQUEsUUFDQTtBQUFBLFFBQ0E7QUFBQSxRQUNBO0FBQUEsUUFDQTtBQUFBLFFBQ0E7QUFBQSxRQUNBO0FBQUEsUUFDQTtBQUFBLFFBQ0E7QUFBQSxRQUNBO0FBQUEsUUFDQTtBQUFBLFFBQ0E7QUFBQSxRQUNBO0FBQUEsUUFDQTtB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
