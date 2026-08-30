import { deepStrictEqual, strictEqual } from "assert";
import { EnvironmentVariableMutatorType } from "../../../../../platform/terminal/common/environmentVariable.js";
import { isWindows } from "../../../../../base/common/platform.js";
import { MergedEnvironmentVariableCollection } from "../../../../../platform/terminal/common/environmentVariableCollection.js";
import { deserializeEnvironmentDescriptionMap, deserializeEnvironmentVariableCollection } from "../../../../../platform/terminal/common/environmentVariableShared.js";
import { URI } from "../../../../../base/common/uri.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../../base/test/common/utils.js";
suite("EnvironmentVariable - MergedEnvironmentVariableCollection", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  suite("ctor", () => {
    test("Should keep entries that come after a Prepend or Append type mutators", () => {
      const merged = new MergedEnvironmentVariableCollection(/* @__PURE__ */ new Map([
        ["ext1", {
          map: deserializeEnvironmentVariableCollection([
            ["A-key", { value: "a1", type: EnvironmentVariableMutatorType.Prepend, variable: "A" }]
          ])
        }],
        ["ext2", {
          map: deserializeEnvironmentVariableCollection([
            ["A-key", { value: "a2", type: EnvironmentVariableMutatorType.Append, variable: "A" }]
          ])
        }],
        ["ext3", {
          map: deserializeEnvironmentVariableCollection([
            ["A-key", { value: "a3", type: EnvironmentVariableMutatorType.Prepend, variable: "A" }]
          ])
        }],
        ["ext4", {
          map: deserializeEnvironmentVariableCollection([
            ["A-key", { value: "a4", type: EnvironmentVariableMutatorType.Append, variable: "A", options: { applyAtProcessCreation: true, applyAtShellIntegration: true } }]
          ])
        }]
      ]));
      deepStrictEqual([...merged.getVariableMap(void 0).entries()], [
        ["A", [
          { extensionIdentifier: "ext4", type: EnvironmentVariableMutatorType.Append, value: "a4", variable: "A", options: { applyAtProcessCreation: true, applyAtShellIntegration: true } },
          { extensionIdentifier: "ext3", type: EnvironmentVariableMutatorType.Prepend, value: "a3", variable: "A", options: void 0 },
          { extensionIdentifier: "ext2", type: EnvironmentVariableMutatorType.Append, value: "a2", variable: "A", options: void 0 },
          { extensionIdentifier: "ext1", type: EnvironmentVariableMutatorType.Prepend, value: "a1", variable: "A", options: void 0 }
        ]]
      ]);
    });
    test("Should remove entries that come after a Replace type mutator", () => {
      const merged = new MergedEnvironmentVariableCollection(/* @__PURE__ */ new Map([
        ["ext1", {
          map: deserializeEnvironmentVariableCollection([
            ["A-key", { value: "a1", type: EnvironmentVariableMutatorType.Prepend, variable: "A" }]
          ])
        }],
        ["ext2", {
          map: deserializeEnvironmentVariableCollection([
            ["A-key", { value: "a2", type: EnvironmentVariableMutatorType.Append, variable: "A" }]
          ])
        }],
        ["ext3", {
          map: deserializeEnvironmentVariableCollection([
            ["A-key", { value: "a3", type: EnvironmentVariableMutatorType.Replace, variable: "A" }]
          ])
        }],
        ["ext4", {
          map: deserializeEnvironmentVariableCollection([
            ["A-key", { value: "a4", type: EnvironmentVariableMutatorType.Append, variable: "A" }]
          ])
        }]
      ]));
      deepStrictEqual([...merged.getVariableMap(void 0).entries()], [
        ["A", [
          { extensionIdentifier: "ext3", type: EnvironmentVariableMutatorType.Replace, value: "a3", variable: "A", options: void 0 },
          { extensionIdentifier: "ext2", type: EnvironmentVariableMutatorType.Append, value: "a2", variable: "A", options: void 0 },
          { extensionIdentifier: "ext1", type: EnvironmentVariableMutatorType.Prepend, value: "a1", variable: "A", options: void 0 }
        ]]
      ], "The ext4 entry should be removed as it comes after a Replace");
    });
    test("Appropriate workspace scoped entries are returned when querying for a particular workspace folder", () => {
      const scope1 = { workspaceFolder: { uri: URI.file("workspace1"), name: "workspace1", index: 0 } };
      const scope2 = { workspaceFolder: { uri: URI.file("workspace2"), name: "workspace2", index: 3 } };
      const merged = new MergedEnvironmentVariableCollection(/* @__PURE__ */ new Map([
        ["ext1", {
          map: deserializeEnvironmentVariableCollection([
            ["A-key", { value: "a1", type: EnvironmentVariableMutatorType.Prepend, scope: scope1, variable: "A" }]
          ])
        }],
        ["ext2", {
          map: deserializeEnvironmentVariableCollection([
            ["A-key", { value: "a2", type: EnvironmentVariableMutatorType.Append, variable: "A" }]
          ])
        }],
        ["ext3", {
          map: deserializeEnvironmentVariableCollection([
            ["A-key", { value: "a3", type: EnvironmentVariableMutatorType.Prepend, scope: scope2, variable: "A" }]
          ])
        }],
        ["ext4", {
          map: deserializeEnvironmentVariableCollection([
            ["A-key", { value: "a4", type: EnvironmentVariableMutatorType.Append, variable: "A" }]
          ])
        }]
      ]));
      deepStrictEqual([...merged.getVariableMap(scope2).entries()], [
        ["A", [
          { extensionIdentifier: "ext4", type: EnvironmentVariableMutatorType.Append, value: "a4", variable: "A", options: void 0 },
          { extensionIdentifier: "ext3", type: EnvironmentVariableMutatorType.Prepend, value: "a3", scope: scope2, variable: "A", options: void 0 },
          { extensionIdentifier: "ext2", type: EnvironmentVariableMutatorType.Append, value: "a2", variable: "A", options: void 0 }
        ]]
      ]);
    });
    test("Workspace scoped entries are not included when looking for global entries", () => {
      const scope1 = { workspaceFolder: { uri: URI.file("workspace1"), name: "workspace1", index: 0 } };
      const scope2 = { workspaceFolder: { uri: URI.file("workspace2"), name: "workspace2", index: 3 } };
      const merged = new MergedEnvironmentVariableCollection(/* @__PURE__ */ new Map([
        ["ext1", {
          map: deserializeEnvironmentVariableCollection([
            ["A-key", { value: "a1", type: EnvironmentVariableMutatorType.Prepend, scope: scope1, variable: "A" }]
          ])
        }],
        ["ext2", {
          map: deserializeEnvironmentVariableCollection([
            ["A-key", { value: "a2", type: EnvironmentVariableMutatorType.Append, variable: "A" }]
          ])
        }],
        ["ext3", {
          map: deserializeEnvironmentVariableCollection([
            ["A-key", { value: "a3", type: EnvironmentVariableMutatorType.Prepend, scope: scope2, variable: "A" }]
          ])
        }],
        ["ext4", {
          map: deserializeEnvironmentVariableCollection([
            ["A-key", { value: "a4", type: EnvironmentVariableMutatorType.Append, variable: "A" }]
          ])
        }]
      ]));
      deepStrictEqual([...merged.getVariableMap(void 0).entries()], [
        ["A", [
          { extensionIdentifier: "ext4", type: EnvironmentVariableMutatorType.Append, value: "a4", variable: "A", options: void 0 },
          { extensionIdentifier: "ext2", type: EnvironmentVariableMutatorType.Append, value: "a2", variable: "A", options: void 0 }
        ]]
      ]);
    });
    test("Workspace scoped description entries are properly filtered for each extension", () => {
      const scope1 = { workspaceFolder: { uri: URI.file("workspace1"), name: "workspace1", index: 0 } };
      const scope2 = { workspaceFolder: { uri: URI.file("workspace2"), name: "workspace2", index: 3 } };
      const merged = new MergedEnvironmentVariableCollection(/* @__PURE__ */ new Map([
        ["ext1", {
          map: deserializeEnvironmentVariableCollection([
            ["A-key", { value: "a1", type: EnvironmentVariableMutatorType.Prepend, scope: scope1, variable: "A" }]
          ]),
          descriptionMap: deserializeEnvironmentDescriptionMap([
            ["A-key-scope1", { description: "ext1 scope1 description", scope: scope1 }],
            ["A-key-scope2", { description: "ext1 scope2 description", scope: scope2 }]
          ])
        }],
        ["ext2", {
          map: deserializeEnvironmentVariableCollection([
            ["A-key", { value: "a2", type: EnvironmentVariableMutatorType.Append, variable: "A" }]
          ]),
          descriptionMap: deserializeEnvironmentDescriptionMap([
            ["A-key", { description: "ext2 global description" }]
          ])
        }],
        ["ext3", {
          map: deserializeEnvironmentVariableCollection([
            ["A-key", { value: "a3", type: EnvironmentVariableMutatorType.Prepend, scope: scope2, variable: "A" }]
          ]),
          descriptionMap: deserializeEnvironmentDescriptionMap([
            ["A-key", { description: "ext3 scope2 description", scope: scope2 }]
          ])
        }],
        ["ext4", {
          map: deserializeEnvironmentVariableCollection([
            ["A-key", { value: "a4", type: EnvironmentVariableMutatorType.Append, variable: "A" }]
          ])
        }]
      ]));
      deepStrictEqual([...merged.getDescriptionMap(scope1).entries()], [
        ["ext1", "ext1 scope1 description"]
      ]);
      deepStrictEqual([...merged.getDescriptionMap(void 0).entries()], [
        ["ext2", "ext2 global description"]
      ]);
    });
  });
  suite("applyToProcessEnvironment", () => {
    test("should apply the collection to an environment", async () => {
      const merged = new MergedEnvironmentVariableCollection(/* @__PURE__ */ new Map([
        ["ext", {
          map: deserializeEnvironmentVariableCollection([
            ["A-key", { value: "a", type: EnvironmentVariableMutatorType.Replace, variable: "A" }],
            ["B", { value: "b", type: EnvironmentVariableMutatorType.Append, variable: "B" }],
            ["C", { value: "c", type: EnvironmentVariableMutatorType.Prepend, variable: "C" }]
          ])
        }]
      ]));
      const env = {
        A: "foo",
        B: "bar",
        C: "baz"
      };
      await merged.applyToProcessEnvironment(env, void 0);
      deepStrictEqual(env, {
        A: "a",
        B: "barb",
        C: "cbaz"
      });
    });
    test("should apply the appropriate workspace scoped entries to an environment", async () => {
      const scope1 = { workspaceFolder: { uri: URI.file("workspace1"), name: "workspace1", index: 0 } };
      const scope2 = { workspaceFolder: { uri: URI.file("workspace2"), name: "workspace2", index: 3 } };
      const merged = new MergedEnvironmentVariableCollection(/* @__PURE__ */ new Map([
        ["ext", {
          map: deserializeEnvironmentVariableCollection([
            ["A-key", { value: "a", type: EnvironmentVariableMutatorType.Replace, scope: scope1, variable: "A" }],
            ["B", { value: "b", type: EnvironmentVariableMutatorType.Append, scope: scope2, variable: "B" }],
            ["C", { value: "c", type: EnvironmentVariableMutatorType.Prepend, variable: "C" }]
          ])
        }]
      ]));
      const env = {
        A: "foo",
        B: "bar",
        C: "baz"
      };
      await merged.applyToProcessEnvironment(env, scope1);
      deepStrictEqual(env, {
        A: "a",
        B: "bar",
        // This is not changed because the scope does not match
        C: "cbaz"
      });
    });
    test("should apply the collection to environment entries with no values", async () => {
      const merged = new MergedEnvironmentVariableCollection(/* @__PURE__ */ new Map([
        ["ext", {
          map: deserializeEnvironmentVariableCollection([
            ["A-key", { value: "a", type: EnvironmentVariableMutatorType.Replace, variable: "A" }],
            ["B", { value: "b", type: EnvironmentVariableMutatorType.Append, variable: "B" }],
            ["C", { value: "c", type: EnvironmentVariableMutatorType.Prepend, variable: "C" }]
          ])
        }]
      ]));
      const env = {};
      await merged.applyToProcessEnvironment(env, void 0);
      deepStrictEqual(env, {
        A: "a",
        B: "b",
        C: "c"
      });
    });
    test("should apply to variable case insensitively on Windows only", async () => {
      const merged = new MergedEnvironmentVariableCollection(/* @__PURE__ */ new Map([
        ["ext", {
          map: deserializeEnvironmentVariableCollection([
            ["A-key", { value: "a", type: EnvironmentVariableMutatorType.Replace, variable: "a" }],
            ["b", { value: "b", type: EnvironmentVariableMutatorType.Append, variable: "b" }],
            ["c", { value: "c", type: EnvironmentVariableMutatorType.Prepend, variable: "c" }]
          ])
        }]
      ]));
      const env = {
        A: "A",
        B: "B",
        C: "C"
      };
      await merged.applyToProcessEnvironment(env, void 0);
      if (isWindows) {
        deepStrictEqual(env, {
          A: "a",
          B: "Bb",
          C: "cC"
        });
      } else {
        deepStrictEqual(env, {
          a: "a",
          A: "A",
          b: "b",
          B: "B",
          c: "c",
          C: "C"
        });
      }
    });
  });
  suite("diff", () => {
    test("should return undefined when collectinos are the same", () => {
      const merged1 = new MergedEnvironmentVariableCollection(/* @__PURE__ */ new Map([
        ["ext1", {
          map: deserializeEnvironmentVariableCollection([
            ["A-key", { value: "a", type: EnvironmentVariableMutatorType.Replace, variable: "A" }]
          ])
        }]
      ]));
      const merged2 = new MergedEnvironmentVariableCollection(/* @__PURE__ */ new Map([
        ["ext1", {
          map: deserializeEnvironmentVariableCollection([
            ["A-key", { value: "a", type: EnvironmentVariableMutatorType.Replace, variable: "A" }]
          ])
        }]
      ]));
      const diff = merged1.diff(merged2, void 0);
      strictEqual(diff, void 0);
    });
    test("should generate added diffs from when the first entry is added", () => {
      const merged1 = new MergedEnvironmentVariableCollection(/* @__PURE__ */ new Map([]));
      const merged2 = new MergedEnvironmentVariableCollection(/* @__PURE__ */ new Map([
        ["ext1", {
          map: deserializeEnvironmentVariableCollection([
            ["A-key", { value: "a", type: EnvironmentVariableMutatorType.Replace, variable: "A" }]
          ])
        }]
      ]));
      const diff = merged1.diff(merged2, void 0);
      strictEqual(diff.changed.size, 0);
      strictEqual(diff.removed.size, 0);
      const entries = [...diff.added.entries()];
      deepStrictEqual(entries, [
        ["A", [{ extensionIdentifier: "ext1", value: "a", type: EnvironmentVariableMutatorType.Replace, variable: "A", options: void 0 }]]
      ]);
    });
    test("should generate added diffs from the same extension", () => {
      const merged1 = new MergedEnvironmentVariableCollection(/* @__PURE__ */ new Map([
        ["ext1", {
          map: deserializeEnvironmentVariableCollection([
            ["A-key", { value: "a", type: EnvironmentVariableMutatorType.Replace, variable: "A" }]
          ])
        }]
      ]));
      const merged2 = new MergedEnvironmentVariableCollection(/* @__PURE__ */ new Map([
        ["ext1", {
          map: deserializeEnvironmentVariableCollection([
            ["A-key", { value: "a", type: EnvironmentVariableMutatorType.Replace, variable: "A" }],
            ["B", { value: "b", type: EnvironmentVariableMutatorType.Append, variable: "B" }]
          ])
        }]
      ]));
      const diff = merged1.diff(merged2, void 0);
      strictEqual(diff.changed.size, 0);
      strictEqual(diff.removed.size, 0);
      const entries = [...diff.added.entries()];
      deepStrictEqual(entries, [
        ["B", [{ extensionIdentifier: "ext1", value: "b", type: EnvironmentVariableMutatorType.Append, variable: "B", options: void 0 }]]
      ]);
    });
    test("should generate added diffs from a different extension", () => {
      const merged1 = new MergedEnvironmentVariableCollection(/* @__PURE__ */ new Map([
        ["ext1", {
          map: deserializeEnvironmentVariableCollection([
            ["A-key", { value: "a1", type: EnvironmentVariableMutatorType.Prepend, variable: "A" }]
          ])
        }]
      ]));
      const merged2 = new MergedEnvironmentVariableCollection(/* @__PURE__ */ new Map([
        ["ext2", {
          map: deserializeEnvironmentVariableCollection([
            ["A-key", { value: "a2", type: EnvironmentVariableMutatorType.Append, variable: "A" }]
          ])
        }],
        ["ext1", {
          map: deserializeEnvironmentVariableCollection([
            ["A-key", { value: "a1", type: EnvironmentVariableMutatorType.Prepend, variable: "A" }]
          ])
        }]
      ]));
      const diff = merged1.diff(merged2, void 0);
      strictEqual(diff.changed.size, 0);
      strictEqual(diff.removed.size, 0);
      deepStrictEqual([...diff.added.entries()], [
        ["A", [{ extensionIdentifier: "ext2", value: "a2", type: EnvironmentVariableMutatorType.Append, variable: "A", options: void 0 }]]
      ]);
      const merged3 = new MergedEnvironmentVariableCollection(/* @__PURE__ */ new Map([
        ["ext1", {
          map: deserializeEnvironmentVariableCollection([
            ["A-key", { value: "a1", type: EnvironmentVariableMutatorType.Prepend, variable: "A" }]
          ])
        }],
        // This entry should get removed
        ["ext2", {
          map: deserializeEnvironmentVariableCollection([
            ["A-key", { value: "a2", type: EnvironmentVariableMutatorType.Append, variable: "A" }]
          ])
        }]
      ]));
      const diff2 = merged1.diff(merged3, void 0);
      strictEqual(diff2.changed.size, 0);
      strictEqual(diff2.removed.size, 0);
      deepStrictEqual([...diff.added.entries()], [...diff2.added.entries()], "Swapping the order of the entries in the other collection should yield the same result");
    });
    test("should remove entries in the diff that come after a Replace", () => {
      const merged1 = new MergedEnvironmentVariableCollection(/* @__PURE__ */ new Map([
        ["ext1", {
          map: deserializeEnvironmentVariableCollection([
            ["A-key", { value: "a1", type: EnvironmentVariableMutatorType.Replace, variable: "A" }]
          ])
        }]
      ]));
      const merged4 = new MergedEnvironmentVariableCollection(/* @__PURE__ */ new Map([
        ["ext1", {
          map: deserializeEnvironmentVariableCollection([
            ["A-key", { value: "a1", type: EnvironmentVariableMutatorType.Replace, variable: "A" }]
          ])
        }],
        // This entry should get removed as it comes after a replace
        ["ext2", {
          map: deserializeEnvironmentVariableCollection([
            ["A-key", { value: "a2", type: EnvironmentVariableMutatorType.Append, variable: "A" }]
          ])
        }]
      ]));
      const diff = merged1.diff(merged4, void 0);
      strictEqual(diff, void 0, "Replace should ignore any entries after it");
    });
    test("should generate removed diffs", () => {
      const merged1 = new MergedEnvironmentVariableCollection(/* @__PURE__ */ new Map([
        ["ext1", {
          map: deserializeEnvironmentVariableCollection([
            ["A-key", { value: "a", type: EnvironmentVariableMutatorType.Replace, variable: "A" }],
            ["B", { value: "b", type: EnvironmentVariableMutatorType.Replace, variable: "B" }]
          ])
        }]
      ]));
      const merged2 = new MergedEnvironmentVariableCollection(/* @__PURE__ */ new Map([
        ["ext1", {
          map: deserializeEnvironmentVariableCollection([
            ["A-key", { value: "a", type: EnvironmentVariableMutatorType.Replace, variable: "A" }]
          ])
        }]
      ]));
      const diff = merged1.diff(merged2, void 0);
      strictEqual(diff.changed.size, 0);
      strictEqual(diff.added.size, 0);
      deepStrictEqual([...diff.removed.entries()], [
        ["B", [{ extensionIdentifier: "ext1", value: "b", type: EnvironmentVariableMutatorType.Replace, variable: "B", options: void 0 }]]
      ]);
    });
    test("should generate changed diffs", () => {
      const merged1 = new MergedEnvironmentVariableCollection(/* @__PURE__ */ new Map([
        ["ext1", {
          map: deserializeEnvironmentVariableCollection([
            ["A-key", { value: "a1", type: EnvironmentVariableMutatorType.Replace, variable: "A" }],
            ["B", { value: "b", type: EnvironmentVariableMutatorType.Replace, variable: "B" }]
          ])
        }]
      ]));
      const merged2 = new MergedEnvironmentVariableCollection(/* @__PURE__ */ new Map([
        ["ext1", {
          map: deserializeEnvironmentVariableCollection([
            ["A-key", { value: "a2", type: EnvironmentVariableMutatorType.Replace, variable: "A" }],
            ["B", { value: "b", type: EnvironmentVariableMutatorType.Append, variable: "B" }]
          ])
        }]
      ]));
      const diff = merged1.diff(merged2, void 0);
      strictEqual(diff.added.size, 0);
      strictEqual(diff.removed.size, 0);
      deepStrictEqual([...diff.changed.entries()], [
        ["A", [{ extensionIdentifier: "ext1", value: "a2", type: EnvironmentVariableMutatorType.Replace, variable: "A", options: void 0 }]],
        ["B", [{ extensionIdentifier: "ext1", value: "b", type: EnvironmentVariableMutatorType.Append, variable: "B", options: void 0 }]]
      ]);
    });
    test("should generate diffs with added, changed and removed", () => {
      const merged1 = new MergedEnvironmentVariableCollection(/* @__PURE__ */ new Map([
        ["ext1", {
          map: deserializeEnvironmentVariableCollection([
            ["A-key", { value: "a1", type: EnvironmentVariableMutatorType.Replace, variable: "A" }],
            ["B", { value: "b", type: EnvironmentVariableMutatorType.Prepend, variable: "B" }]
          ])
        }]
      ]));
      const merged2 = new MergedEnvironmentVariableCollection(/* @__PURE__ */ new Map([
        ["ext1", {
          map: deserializeEnvironmentVariableCollection([
            ["A-key", { value: "a2", type: EnvironmentVariableMutatorType.Replace, variable: "A" }],
            ["C", { value: "c", type: EnvironmentVariableMutatorType.Append, variable: "C" }]
          ])
        }]
      ]));
      const diff = merged1.diff(merged2, void 0);
      deepStrictEqual([...diff.added.entries()], [
        ["C", [{ extensionIdentifier: "ext1", value: "c", type: EnvironmentVariableMutatorType.Append, variable: "C", options: void 0 }]]
      ]);
      deepStrictEqual([...diff.removed.entries()], [
        ["B", [{ extensionIdentifier: "ext1", value: "b", type: EnvironmentVariableMutatorType.Prepend, variable: "B", options: void 0 }]]
      ]);
      deepStrictEqual([...diff.changed.entries()], [
        ["A", [{ extensionIdentifier: "ext1", value: "a2", type: EnvironmentVariableMutatorType.Replace, variable: "A", options: void 0 }]]
      ]);
    });
    test("should only generate workspace specific diffs", () => {
      const scope1 = { workspaceFolder: { uri: URI.file("workspace1"), name: "workspace1", index: 0 } };
      const scope2 = { workspaceFolder: { uri: URI.file("workspace2"), name: "workspace2", index: 3 } };
      const merged1 = new MergedEnvironmentVariableCollection(/* @__PURE__ */ new Map([
        ["ext1", {
          map: deserializeEnvironmentVariableCollection([
            ["A-key", { value: "a1", type: EnvironmentVariableMutatorType.Replace, scope: scope1, variable: "A" }],
            ["B", { value: "b", type: EnvironmentVariableMutatorType.Prepend, variable: "B" }]
          ])
        }]
      ]));
      const merged2 = new MergedEnvironmentVariableCollection(/* @__PURE__ */ new Map([
        ["ext1", {
          map: deserializeEnvironmentVariableCollection([
            ["A-key", { value: "a2", type: EnvironmentVariableMutatorType.Replace, scope: scope1, variable: "A" }],
            ["C", { value: "c", type: EnvironmentVariableMutatorType.Append, scope: scope2, variable: "C" }]
          ])
        }]
      ]));
      const diff = merged1.diff(merged2, scope1);
      strictEqual(diff.added.size, 0);
      deepStrictEqual([...diff.removed.entries()], [
        ["B", [{ extensionIdentifier: "ext1", value: "b", type: EnvironmentVariableMutatorType.Prepend, variable: "B", options: void 0 }]]
      ]);
      deepStrictEqual([...diff.changed.entries()], [
        ["A", [{ extensionIdentifier: "ext1", value: "a2", type: EnvironmentVariableMutatorType.Replace, scope: scope1, variable: "A", options: void 0 }]]
      ]);
    });
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXHRlcm1pbmFsXFx0ZXN0XFxjb21tb25cXGVudmlyb25tZW50VmFyaWFibGVDb2xsZWN0aW9uLnRlc3QudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgeyBkZWVwU3RyaWN0RXF1YWwsIHN0cmljdEVxdWFsIH0gZnJvbSAnYXNzZXJ0JztcbmltcG9ydCB7IEVudmlyb25tZW50VmFyaWFibGVNdXRhdG9yVHlwZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL3Rlcm1pbmFsL2NvbW1vbi9lbnZpcm9ubWVudFZhcmlhYmxlLmpzJztcbmltcG9ydCB7IElQcm9jZXNzRW52aXJvbm1lbnQsIGlzV2luZG93cyB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3BsYXRmb3JtLmpzJztcbmltcG9ydCB7IE1lcmdlZEVudmlyb25tZW50VmFyaWFibGVDb2xsZWN0aW9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vdGVybWluYWwvY29tbW9uL2Vudmlyb25tZW50VmFyaWFibGVDb2xsZWN0aW9uLmpzJztcbmltcG9ydCB7IGRlc2VyaWFsaXplRW52aXJvbm1lbnREZXNjcmlwdGlvbk1hcCwgZGVzZXJpYWxpemVFbnZpcm9ubWVudFZhcmlhYmxlQ29sbGVjdGlvbiB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL3Rlcm1pbmFsL2NvbW1vbi9lbnZpcm9ubWVudFZhcmlhYmxlU2hhcmVkLmpzJztcbmltcG9ydCB7IFVSSSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3VyaS5qcyc7XG5pbXBvcnQgeyBlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL3Rlc3QvY29tbW9uL3V0aWxzLmpzJztcblxuc3VpdGUoJ0Vudmlyb25tZW50VmFyaWFibGUgLSBNZXJnZWRFbnZpcm9ubWVudFZhcmlhYmxlQ29sbGVjdGlvbicsICgpID0+IHtcblx0ZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlKCk7XG5cblx0c3VpdGUoJ2N0b3InLCAoKSA9PiB7XG5cdFx0dGVzdCgnU2hvdWxkIGtlZXAgZW50cmllcyB0aGF0IGNvbWUgYWZ0ZXIgYSBQcmVwZW5kIG9yIEFwcGVuZCB0eXBlIG11dGF0b3JzJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgbWVyZ2VkID0gbmV3IE1lcmdlZEVudmlyb25tZW50VmFyaWFibGVDb2xsZWN0aW9uKG5ldyBNYXAoW1xuXHRcdFx0XHRbJ2V4dDEnLCB7XG5cdFx0XHRcdFx0bWFwOiBkZXNlcmlhbGl6ZUVudmlyb25tZW50VmFyaWFibGVDb2xsZWN0aW9uKFtcblx0XHRcdFx0XHRcdFsnQS1rZXknLCB7IHZhbHVlOiAnYTEnLCB0eXBlOiBFbnZpcm9ubWVudFZhcmlhYmxlTXV0YXRvclR5cGUuUHJlcGVuZCwgdmFyaWFibGU6ICdBJyB9XVxuXHRcdFx0XHRcdF0pXG5cdFx0XHRcdH1dLFxuXHRcdFx0XHRbJ2V4dDInLCB7XG5cdFx0XHRcdFx0bWFwOiBkZXNlcmlhbGl6ZUVudmlyb25tZW50VmFyaWFibGVDb2xsZWN0aW9uKFtcblx0XHRcdFx0XHRcdFsnQS1rZXknLCB7IHZhbHVlOiAnYTInLCB0eXBlOiBFbnZpcm9ubWVudFZhcmlhYmxlTXV0YXRvclR5cGUuQXBwZW5kLCB2YXJpYWJsZTogJ0EnIH1dXG5cdFx0XHRcdFx0XSlcblx0XHRcdFx0fV0sXG5cdFx0XHRcdFsnZXh0MycsIHtcblx0XHRcdFx0XHRtYXA6IGRlc2VyaWFsaXplRW52aXJvbm1lbnRWYXJpYWJsZUNvbGxlY3Rpb24oW1xuXHRcdFx0XHRcdFx0WydBLWtleScsIHsgdmFsdWU6ICdhMycsIHR5cGU6IEVudmlyb25tZW50VmFyaWFibGVNdXRhdG9yVHlwZS5QcmVwZW5kLCB2YXJpYWJsZTogJ0EnIH1dXG5cdFx0XHRcdFx0XSlcblx0XHRcdFx0fV0sXG5cdFx0XHRcdFsnZXh0NCcsIHtcblx0XHRcdFx0XHRtYXA6IGRlc2VyaWFsaXplRW52aXJvbm1lbnRWYXJpYWJsZUNvbGxlY3Rpb24oW1xuXHRcdFx0XHRcdFx0WydBLWtleScsIHsgdmFsdWU6ICdhNCcsIHR5cGU6IEVudmlyb25tZW50VmFyaWFibGVNdXRhdG9yVHlwZS5BcHBlbmQsIHZhcmlhYmxlOiAnQScsIG9wdGlvbnM6IHsgYXBwbHlBdFByb2Nlc3NDcmVhdGlvbjogdHJ1ZSwgYXBwbHlBdFNoZWxsSW50ZWdyYXRpb246IHRydWUgfSB9XVxuXHRcdFx0XHRcdF0pXG5cdFx0XHRcdH1dXG5cdFx0XHRdKSk7XG5cdFx0XHRkZWVwU3RyaWN0RXF1YWwoWy4uLm1lcmdlZC5nZXRWYXJpYWJsZU1hcCh1bmRlZmluZWQpLmVudHJpZXMoKV0sIFtcblx0XHRcdFx0WydBJywgW1xuXHRcdFx0XHRcdHsgZXh0ZW5zaW9uSWRlbnRpZmllcjogJ2V4dDQnLCB0eXBlOiBFbnZpcm9ubWVudFZhcmlhYmxlTXV0YXRvclR5cGUuQXBwZW5kLCB2YWx1ZTogJ2E0JywgdmFyaWFibGU6ICdBJywgb3B0aW9uczogeyBhcHBseUF0UHJvY2Vzc0NyZWF0aW9uOiB0cnVlLCBhcHBseUF0U2hlbGxJbnRlZ3JhdGlvbjogdHJ1ZSB9IH0sXG5cdFx0XHRcdFx0eyBleHRlbnNpb25JZGVudGlmaWVyOiAnZXh0MycsIHR5cGU6IEVudmlyb25tZW50VmFyaWFibGVNdXRhdG9yVHlwZS5QcmVwZW5kLCB2YWx1ZTogJ2EzJywgdmFyaWFibGU6ICdBJywgb3B0aW9uczogdW5kZWZpbmVkIH0sXG5cdFx0XHRcdFx0eyBleHRlbnNpb25JZGVudGlmaWVyOiAnZXh0MicsIHR5cGU6IEVudmlyb25tZW50VmFyaWFibGVNdXRhdG9yVHlwZS5BcHBlbmQsIHZhbHVlOiAnYTInLCB2YXJpYWJsZTogJ0EnLCBvcHRpb25zOiB1bmRlZmluZWQgfSxcblx0XHRcdFx0XHR7IGV4dGVuc2lvbklkZW50aWZpZXI6ICdleHQxJywgdHlwZTogRW52aXJvbm1lbnRWYXJpYWJsZU11dGF0b3JUeXBlLlByZXBlbmQsIHZhbHVlOiAnYTEnLCB2YXJpYWJsZTogJ0EnLCBvcHRpb25zOiB1bmRlZmluZWQgfVxuXHRcdFx0XHRdXVxuXHRcdFx0XSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdTaG91bGQgcmVtb3ZlIGVudHJpZXMgdGhhdCBjb21lIGFmdGVyIGEgUmVwbGFjZSB0eXBlIG11dGF0b3InLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBtZXJnZWQgPSBuZXcgTWVyZ2VkRW52aXJvbm1lbnRWYXJpYWJsZUNvbGxlY3Rpb24obmV3IE1hcChbXG5cdFx0XHRcdFsnZXh0MScsIHtcblx0XHRcdFx0XHRtYXA6IGRlc2VyaWFsaXplRW52aXJvbm1lbnRWYXJpYWJsZUNvbGxlY3Rpb24oW1xuXHRcdFx0XHRcdFx0WydBLWtleScsIHsgdmFsdWU6ICdhMScsIHR5cGU6IEVudmlyb25tZW50VmFyaWFibGVNdXRhdG9yVHlwZS5QcmVwZW5kLCB2YXJpYWJsZTogJ0EnIH1dXG5cdFx0XHRcdFx0XSlcblx0XHRcdFx0fV0sXG5cdFx0XHRcdFsnZXh0MicsIHtcblx0XHRcdFx0XHRtYXA6IGRlc2VyaWFsaXplRW52aXJvbm1lbnRWYXJpYWJsZUNvbGxlY3Rpb24oW1xuXHRcdFx0XHRcdFx0WydBLWtleScsIHsgdmFsdWU6ICdhMicsIHR5cGU6IEVudmlyb25tZW50VmFyaWFibGVNdXRhdG9yVHlwZS5BcHBlbmQsIHZhcmlhYmxlOiAnQScgfV1cblx0XHRcdFx0XHRdKVxuXHRcdFx0XHR9XSxcblx0XHRcdFx0WydleHQzJywge1xuXHRcdFx0XHRcdG1hcDogZGVzZXJpYWxpemVFbnZpcm9ubWVudFZhcmlhYmxlQ29sbGVjdGlvbihbXG5cdFx0XHRcdFx0XHRbJ0Eta2V5JywgeyB2YWx1ZTogJ2EzJywgdHlwZTogRW52aXJvbm1lbnRWYXJpYWJsZU11dGF0b3JUeXBlLlJlcGxhY2UsIHZhcmlhYmxlOiAnQScgfV1cblx0XHRcdFx0XHRdKVxuXHRcdFx0XHR9XSxcblx0XHRcdFx0WydleHQ0Jywge1xuXHRcdFx0XHRcdG1hcDogZGVzZXJpYWxpemVFbnZpcm9ubWVudFZhcmlhYmxlQ29sbGVjdGlvbihbXG5cdFx0XHRcdFx0XHRbJ0Eta2V5JywgeyB2YWx1ZTogJ2E0JywgdHlwZTogRW52aXJvbm1lbnRWYXJpYWJsZU11dGF0b3JUeXBlLkFwcGVuZCwgdmFyaWFibGU6ICdBJyB9XVxuXHRcdFx0XHRcdF0pXG5cdFx0XHRcdH1dXG5cdFx0XHRdKSk7XG5cdFx0XHRkZWVwU3RyaWN0RXF1YWwoWy4uLm1lcmdlZC5nZXRWYXJpYWJsZU1hcCh1bmRlZmluZWQpLmVudHJpZXMoKV0sIFtcblx0XHRcdFx0WydBJywgW1xuXHRcdFx0XHRcdHsgZXh0ZW5zaW9uSWRlbnRpZmllcjogJ2V4dDMnLCB0eXBlOiBFbnZpcm9ubWVudFZhcmlhYmxlTXV0YXRvclR5cGUuUmVwbGFjZSwgdmFsdWU6ICdhMycsIHZhcmlhYmxlOiAnQScsIG9wdGlvbnM6IHVuZGVmaW5lZCB9LFxuXHRcdFx0XHRcdHsgZXh0ZW5zaW9uSWRlbnRpZmllcjogJ2V4dDInLCB0eXBlOiBFbnZpcm9ubWVudFZhcmlhYmxlTXV0YXRvclR5cGUuQXBwZW5kLCB2YWx1ZTogJ2EyJywgdmFyaWFibGU6ICdBJywgb3B0aW9uczogdW5kZWZpbmVkIH0sXG5cdFx0XHRcdFx0eyBleHRlbnNpb25JZGVudGlmaWVyOiAnZXh0MScsIHR5cGU6IEVudmlyb25tZW50VmFyaWFibGVNdXRhdG9yVHlwZS5QcmVwZW5kLCB2YWx1ZTogJ2ExJywgdmFyaWFibGU6ICdBJywgb3B0aW9uczogdW5kZWZpbmVkIH1cblx0XHRcdFx0XV1cblx0XHRcdF0sICdUaGUgZXh0NCBlbnRyeSBzaG91bGQgYmUgcmVtb3ZlZCBhcyBpdCBjb21lcyBhZnRlciBhIFJlcGxhY2UnKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ0FwcHJvcHJpYXRlIHdvcmtzcGFjZSBzY29wZWQgZW50cmllcyBhcmUgcmV0dXJuZWQgd2hlbiBxdWVyeWluZyBmb3IgYSBwYXJ0aWN1bGFyIHdvcmtzcGFjZSBmb2xkZXInLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBzY29wZTEgPSB7IHdvcmtzcGFjZUZvbGRlcjogeyB1cmk6IFVSSS5maWxlKCd3b3Jrc3BhY2UxJyksIG5hbWU6ICd3b3Jrc3BhY2UxJywgaW5kZXg6IDAgfSB9O1xuXHRcdFx0Y29uc3Qgc2NvcGUyID0geyB3b3Jrc3BhY2VGb2xkZXI6IHsgdXJpOiBVUkkuZmlsZSgnd29ya3NwYWNlMicpLCBuYW1lOiAnd29ya3NwYWNlMicsIGluZGV4OiAzIH0gfTtcblx0XHRcdGNvbnN0IG1lcmdlZCA9IG5ldyBNZXJnZWRFbnZpcm9ubWVudFZhcmlhYmxlQ29sbGVjdGlvbihuZXcgTWFwKFtcblx0XHRcdFx0WydleHQxJywge1xuXHRcdFx0XHRcdG1hcDogZGVzZXJpYWxpemVFbnZpcm9ubWVudFZhcmlhYmxlQ29sbGVjdGlvbihbXG5cdFx0XHRcdFx0XHRbJ0Eta2V5JywgeyB2YWx1ZTogJ2ExJywgdHlwZTogRW52aXJvbm1lbnRWYXJpYWJsZU11dGF0b3JUeXBlLlByZXBlbmQsIHNjb3BlOiBzY29wZTEsIHZhcmlhYmxlOiAnQScgfV1cblx0XHRcdFx0XHRdKVxuXHRcdFx0XHR9XSxcblx0XHRcdFx0WydleHQyJywge1xuXHRcdFx0XHRcdG1hcDogZGVzZXJpYWxpemVFbnZpcm9ubWVudFZhcmlhYmxlQ29sbGVjdGlvbihbXG5cdFx0XHRcdFx0XHRbJ0Eta2V5JywgeyB2YWx1ZTogJ2EyJywgdHlwZTogRW52aXJvbm1lbnRWYXJpYWJsZU11dGF0b3JUeXBlLkFwcGVuZCwgdmFyaWFibGU6ICdBJyB9XVxuXHRcdFx0XHRcdF0pXG5cdFx0XHRcdH1dLFxuXHRcdFx0XHRbJ2V4dDMnLCB7XG5cdFx0XHRcdFx0bWFwOiBkZXNlcmlhbGl6ZUVudmlyb25tZW50VmFyaWFibGVDb2xsZWN0aW9uKFtcblx0XHRcdFx0XHRcdFsnQS1rZXknLCB7IHZhbHVlOiAnYTMnLCB0eXBlOiBFbnZpcm9ubWVudFZhcmlhYmxlTXV0YXRvclR5cGUuUHJlcGVuZCwgc2NvcGU6IHNjb3BlMiwgdmFyaWFibGU6ICdBJyB9XVxuXHRcdFx0XHRcdF0pXG5cdFx0XHRcdH1dLFxuXHRcdFx0XHRbJ2V4dDQnLCB7XG5cdFx0XHRcdFx0bWFwOiBkZXNlcmlhbGl6ZUVudmlyb25tZW50VmFyaWFibGVDb2xsZWN0aW9uKFtcblx0XHRcdFx0XHRcdFsnQS1rZXknLCB7IHZhbHVlOiAnYTQnLCB0eXBlOiBFbnZpcm9ubWVudFZhcmlhYmxlTXV0YXRvclR5cGUuQXBwZW5kLCB2YXJpYWJsZTogJ0EnIH1dXG5cdFx0XHRcdFx0XSlcblx0XHRcdFx0fV1cblx0XHRcdF0pKTtcblx0XHRcdGRlZXBTdHJpY3RFcXVhbChbLi4ubWVyZ2VkLmdldFZhcmlhYmxlTWFwKHNjb3BlMikuZW50cmllcygpXSwgW1xuXHRcdFx0XHRbJ0EnLCBbXG5cdFx0XHRcdFx0eyBleHRlbnNpb25JZGVudGlmaWVyOiAnZXh0NCcsIHR5cGU6IEVudmlyb25tZW50VmFyaWFibGVNdXRhdG9yVHlwZS5BcHBlbmQsIHZhbHVlOiAnYTQnLCB2YXJpYWJsZTogJ0EnLCBvcHRpb25zOiB1bmRlZmluZWQgfSxcblx0XHRcdFx0XHR7IGV4dGVuc2lvbklkZW50aWZpZXI6ICdleHQzJywgdHlwZTogRW52aXJvbm1lbnRWYXJpYWJsZU11dGF0b3JUeXBlLlByZXBlbmQsIHZhbHVlOiAnYTMnLCBzY29wZTogc2NvcGUyLCB2YXJpYWJsZTogJ0EnLCBvcHRpb25zOiB1bmRlZmluZWQgfSxcblx0XHRcdFx0XHR7IGV4dGVuc2lvbklkZW50aWZpZXI6ICdleHQyJywgdHlwZTogRW52aXJvbm1lbnRWYXJpYWJsZU11dGF0b3JUeXBlLkFwcGVuZCwgdmFsdWU6ICdhMicsIHZhcmlhYmxlOiAnQScsIG9wdGlvbnM6IHVuZGVmaW5lZCB9LFxuXHRcdFx0XHRdXVxuXHRcdFx0XSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdXb3Jrc3BhY2Ugc2NvcGVkIGVudHJpZXMgYXJlIG5vdCBpbmNsdWRlZCB3aGVuIGxvb2tpbmcgZm9yIGdsb2JhbCBlbnRyaWVzJywgKCkgPT4ge1xuXHRcdFx0Y29uc3Qgc2NvcGUxID0geyB3b3Jrc3BhY2VGb2xkZXI6IHsgdXJpOiBVUkkuZmlsZSgnd29ya3NwYWNlMScpLCBuYW1lOiAnd29ya3NwYWNlMScsIGluZGV4OiAwIH0gfTtcblx0XHRcdGNvbnN0IHNjb3BlMiA9IHsgd29ya3NwYWNlRm9sZGVyOiB7IHVyaTogVVJJLmZpbGUoJ3dvcmtzcGFjZTInKSwgbmFtZTogJ3dvcmtzcGFjZTInLCBpbmRleDogMyB9IH07XG5cdFx0XHRjb25zdCBtZXJnZWQgPSBuZXcgTWVyZ2VkRW52aXJvbm1lbnRWYXJpYWJsZUNvbGxlY3Rpb24obmV3IE1hcChbXG5cdFx0XHRcdFsnZXh0MScsIHtcblx0XHRcdFx0XHRtYXA6IGRlc2VyaWFsaXplRW52aXJvbm1lbnRWYXJpYWJsZUNvbGxlY3Rpb24oW1xuXHRcdFx0XHRcdFx0WydBLWtleScsIHsgdmFsdWU6ICdhMScsIHR5cGU6IEVudmlyb25tZW50VmFyaWFibGVNdXRhdG9yVHlwZS5QcmVwZW5kLCBzY29wZTogc2NvcGUxLCB2YXJpYWJsZTogJ0EnIH1dXG5cdFx0XHRcdFx0XSlcblx0XHRcdFx0fV0sXG5cdFx0XHRcdFsnZXh0MicsIHtcblx0XHRcdFx0XHRtYXA6IGRlc2VyaWFsaXplRW52aXJvbm1lbnRWYXJpYWJsZUNvbGxlY3Rpb24oW1xuXHRcdFx0XHRcdFx0WydBLWtleScsIHsgdmFsdWU6ICdhMicsIHR5cGU6IEVudmlyb25tZW50VmFyaWFibGVNdXRhdG9yVHlwZS5BcHBlbmQsIHZhcmlhYmxlOiAnQScgfV1cblx0XHRcdFx0XHRdKVxuXHRcdFx0XHR9XSxcblx0XHRcdFx0WydleHQzJywge1xuXHRcdFx0XHRcdG1hcDogZGVzZXJpYWxpemVFbnZpcm9ubWVudFZhcmlhYmxlQ29sbGVjdGlvbihbXG5cdFx0XHRcdFx0XHRbJ0Eta2V5JywgeyB2YWx1ZTogJ2EzJywgdHlwZTogRW52aXJvbm1lbnRWYXJpYWJsZU11dGF0b3JUeXBlLlByZXBlbmQsIHNjb3BlOiBzY29wZTIsIHZhcmlhYmxlOiAnQScgfV1cblx0XHRcdFx0XHRdKVxuXHRcdFx0XHR9XSxcblx0XHRcdFx0WydleHQ0Jywge1xuXHRcdFx0XHRcdG1hcDogZGVzZXJpYWxpemVFbnZpcm9ubWVudFZhcmlhYmxlQ29sbGVjdGlvbihbXG5cdFx0XHRcdFx0XHRbJ0Eta2V5JywgeyB2YWx1ZTogJ2E0JywgdHlwZTogRW52aXJvbm1lbnRWYXJpYWJsZU11dGF0b3JUeXBlLkFwcGVuZCwgdmFyaWFibGU6ICdBJyB9XVxuXHRcdFx0XHRcdF0pXG5cdFx0XHRcdH1dXG5cdFx0XHRdKSk7XG5cdFx0XHRkZWVwU3RyaWN0RXF1YWwoWy4uLm1lcmdlZC5nZXRWYXJpYWJsZU1hcCh1bmRlZmluZWQpLmVudHJpZXMoKV0sIFtcblx0XHRcdFx0WydBJywgW1xuXHRcdFx0XHRcdHsgZXh0ZW5zaW9uSWRlbnRpZmllcjogJ2V4dDQnLCB0eXBlOiBFbnZpcm9ubWVudFZhcmlhYmxlTXV0YXRvclR5cGUuQXBwZW5kLCB2YWx1ZTogJ2E0JywgdmFyaWFibGU6ICdBJywgb3B0aW9uczogdW5kZWZpbmVkIH0sXG5cdFx0XHRcdFx0eyBleHRlbnNpb25JZGVudGlmaWVyOiAnZXh0MicsIHR5cGU6IEVudmlyb25tZW50VmFyaWFibGVNdXRhdG9yVHlwZS5BcHBlbmQsIHZhbHVlOiAnYTInLCB2YXJpYWJsZTogJ0EnLCBvcHRpb25zOiB1bmRlZmluZWQgfSxcblx0XHRcdFx0XV1cblx0XHRcdF0pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnV29ya3NwYWNlIHNjb3BlZCBkZXNjcmlwdGlvbiBlbnRyaWVzIGFyZSBwcm9wZXJseSBmaWx0ZXJlZCBmb3IgZWFjaCBleHRlbnNpb24nLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBzY29wZTEgPSB7IHdvcmtzcGFjZUZvbGRlcjogeyB1cmk6IFVSSS5maWxlKCd3b3Jrc3BhY2UxJyksIG5hbWU6ICd3b3Jrc3BhY2UxJywgaW5kZXg6IDAgfSB9O1xuXHRcdFx0Y29uc3Qgc2NvcGUyID0geyB3b3Jrc3BhY2VGb2xkZXI6IHsgdXJpOiBVUkkuZmlsZSgnd29ya3NwYWNlMicpLCBuYW1lOiAnd29ya3NwYWNlMicsIGluZGV4OiAzIH0gfTtcblx0XHRcdGNvbnN0IG1lcmdlZCA9IG5ldyBNZXJnZWRFbnZpcm9ubWVudFZhcmlhYmxlQ29sbGVjdGlvbihuZXcgTWFwKFtcblx0XHRcdFx0WydleHQxJywge1xuXHRcdFx0XHRcdG1hcDogZGVzZXJpYWxpemVFbnZpcm9ubWVudFZhcmlhYmxlQ29sbGVjdGlvbihbXG5cdFx0XHRcdFx0XHRbJ0Eta2V5JywgeyB2YWx1ZTogJ2ExJywgdHlwZTogRW52aXJvbm1lbnRWYXJpYWJsZU11dGF0b3JUeXBlLlByZXBlbmQsIHNjb3BlOiBzY29wZTEsIHZhcmlhYmxlOiAnQScgfV1cblx0XHRcdFx0XHRdKSxcblx0XHRcdFx0XHRkZXNjcmlwdGlvbk1hcDogZGVzZXJpYWxpemVFbnZpcm9ubWVudERlc2NyaXB0aW9uTWFwKFtcblx0XHRcdFx0XHRcdFsnQS1rZXktc2NvcGUxJywgeyBkZXNjcmlwdGlvbjogJ2V4dDEgc2NvcGUxIGRlc2NyaXB0aW9uJywgc2NvcGU6IHNjb3BlMSB9XSxcblx0XHRcdFx0XHRcdFsnQS1rZXktc2NvcGUyJywgeyBkZXNjcmlwdGlvbjogJ2V4dDEgc2NvcGUyIGRlc2NyaXB0aW9uJywgc2NvcGU6IHNjb3BlMiB9XSxcblx0XHRcdFx0XHRdKVxuXHRcdFx0XHR9XSxcblx0XHRcdFx0WydleHQyJywge1xuXHRcdFx0XHRcdG1hcDogZGVzZXJpYWxpemVFbnZpcm9ubWVudFZhcmlhYmxlQ29sbGVjdGlvbihbXG5cdFx0XHRcdFx0XHRbJ0Eta2V5JywgeyB2YWx1ZTogJ2EyJywgdHlwZTogRW52aXJvbm1lbnRWYXJpYWJsZU11dGF0b3JUeXBlLkFwcGVuZCwgdmFyaWFibGU6ICdBJyB9XVxuXHRcdFx0XHRcdF0pLFxuXHRcdFx0XHRcdGRlc2NyaXB0aW9uTWFwOiBkZXNlcmlhbGl6ZUVudmlyb25tZW50RGVzY3JpcHRpb25NYXAoW1xuXHRcdFx0XHRcdFx0WydBLWtleScsIHsgZGVzY3JpcHRpb246ICdleHQyIGdsb2JhbCBkZXNjcmlwdGlvbicgfV0sXG5cdFx0XHRcdFx0XSlcblx0XHRcdFx0fV0sXG5cdFx0XHRcdFsnZXh0MycsIHtcblx0XHRcdFx0XHRtYXA6IGRlc2VyaWFsaXplRW52aXJvbm1lbnRWYXJpYWJsZUNvbGxlY3Rpb24oW1xuXHRcdFx0XHRcdFx0WydBLWtleScsIHsgdmFsdWU6ICdhMycsIHR5cGU6IEVudmlyb25tZW50VmFyaWFibGVNdXRhdG9yVHlwZS5QcmVwZW5kLCBzY29wZTogc2NvcGUyLCB2YXJpYWJsZTogJ0EnIH1dXG5cdFx0XHRcdFx0XSksXG5cdFx0XHRcdFx0ZGVzY3JpcHRpb25NYXA6IGRlc2VyaWFsaXplRW52aXJvbm1lbnREZXNjcmlwdGlvbk1hcChbXG5cdFx0XHRcdFx0XHRbJ0Eta2V5JywgeyBkZXNjcmlwdGlvbjogJ2V4dDMgc2NvcGUyIGRlc2NyaXB0aW9uJywgc2NvcGU6IHNjb3BlMiB9XSxcblx0XHRcdFx0XHRdKVxuXHRcdFx0XHR9XSxcblx0XHRcdFx0WydleHQ0Jywge1xuXHRcdFx0XHRcdG1hcDogZGVzZXJpYWxpemVFbnZpcm9ubWVudFZhcmlhYmxlQ29sbGVjdGlvbihbXG5cdFx0XHRcdFx0XHRbJ0Eta2V5JywgeyB2YWx1ZTogJ2E0JywgdHlwZTogRW52aXJvbm1lbnRWYXJpYWJsZU11dGF0b3JUeXBlLkFwcGVuZCwgdmFyaWFibGU6ICdBJyB9XVxuXHRcdFx0XHRcdF0pXG5cdFx0XHRcdH1dXG5cdFx0XHRdKSk7XG5cdFx0XHRkZWVwU3RyaWN0RXF1YWwoWy4uLm1lcmdlZC5nZXREZXNjcmlwdGlvbk1hcChzY29wZTEpLmVudHJpZXMoKV0sIFtcblx0XHRcdFx0WydleHQxJywgJ2V4dDEgc2NvcGUxIGRlc2NyaXB0aW9uJ10sXG5cdFx0XHRdKTtcblx0XHRcdGRlZXBTdHJpY3RFcXVhbChbLi4ubWVyZ2VkLmdldERlc2NyaXB0aW9uTWFwKHVuZGVmaW5lZCkuZW50cmllcygpXSwgW1xuXHRcdFx0XHRbJ2V4dDInLCAnZXh0MiBnbG9iYWwgZGVzY3JpcHRpb24nXSxcblx0XHRcdF0pO1xuXHRcdH0pO1xuXHR9KTtcblxuXHRzdWl0ZSgnYXBwbHlUb1Byb2Nlc3NFbnZpcm9ubWVudCcsICgpID0+IHtcblx0XHR0ZXN0KCdzaG91bGQgYXBwbHkgdGhlIGNvbGxlY3Rpb24gdG8gYW4gZW52aXJvbm1lbnQnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCBtZXJnZWQgPSBuZXcgTWVyZ2VkRW52aXJvbm1lbnRWYXJpYWJsZUNvbGxlY3Rpb24obmV3IE1hcChbXG5cdFx0XHRcdFsnZXh0Jywge1xuXHRcdFx0XHRcdG1hcDogZGVzZXJpYWxpemVFbnZpcm9ubWVudFZhcmlhYmxlQ29sbGVjdGlvbihbXG5cdFx0XHRcdFx0XHRbJ0Eta2V5JywgeyB2YWx1ZTogJ2EnLCB0eXBlOiBFbnZpcm9ubWVudFZhcmlhYmxlTXV0YXRvclR5cGUuUmVwbGFjZSwgdmFyaWFibGU6ICdBJyB9XSxcblx0XHRcdFx0XHRcdFsnQicsIHsgdmFsdWU6ICdiJywgdHlwZTogRW52aXJvbm1lbnRWYXJpYWJsZU11dGF0b3JUeXBlLkFwcGVuZCwgdmFyaWFibGU6ICdCJyB9XSxcblx0XHRcdFx0XHRcdFsnQycsIHsgdmFsdWU6ICdjJywgdHlwZTogRW52aXJvbm1lbnRWYXJpYWJsZU11dGF0b3JUeXBlLlByZXBlbmQsIHZhcmlhYmxlOiAnQycgfV1cblx0XHRcdFx0XHRdKVxuXHRcdFx0XHR9XVxuXHRcdFx0XSkpO1xuXHRcdFx0Y29uc3QgZW52OiBJUHJvY2Vzc0Vudmlyb25tZW50ID0ge1xuXHRcdFx0XHRBOiAnZm9vJyxcblx0XHRcdFx0QjogJ2JhcicsXG5cdFx0XHRcdEM6ICdiYXonXG5cdFx0XHR9O1xuXHRcdFx0YXdhaXQgbWVyZ2VkLmFwcGx5VG9Qcm9jZXNzRW52aXJvbm1lbnQoZW52LCB1bmRlZmluZWQpO1xuXHRcdFx0ZGVlcFN0cmljdEVxdWFsKGVudiwge1xuXHRcdFx0XHRBOiAnYScsXG5cdFx0XHRcdEI6ICdiYXJiJyxcblx0XHRcdFx0QzogJ2NiYXonXG5cdFx0XHR9KTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3Nob3VsZCBhcHBseSB0aGUgYXBwcm9wcmlhdGUgd29ya3NwYWNlIHNjb3BlZCBlbnRyaWVzIHRvIGFuIGVudmlyb25tZW50JywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3Qgc2NvcGUxID0geyB3b3Jrc3BhY2VGb2xkZXI6IHsgdXJpOiBVUkkuZmlsZSgnd29ya3NwYWNlMScpLCBuYW1lOiAnd29ya3NwYWNlMScsIGluZGV4OiAwIH0gfTtcblx0XHRcdGNvbnN0IHNjb3BlMiA9IHsgd29ya3NwYWNlRm9sZGVyOiB7IHVyaTogVVJJLmZpbGUoJ3dvcmtzcGFjZTInKSwgbmFtZTogJ3dvcmtzcGFjZTInLCBpbmRleDogMyB9IH07XG5cdFx0XHRjb25zdCBtZXJnZWQgPSBuZXcgTWVyZ2VkRW52aXJvbm1lbnRWYXJpYWJsZUNvbGxlY3Rpb24obmV3IE1hcChbXG5cdFx0XHRcdFsnZXh0Jywge1xuXHRcdFx0XHRcdG1hcDogZGVzZXJpYWxpemVFbnZpcm9ubWVudFZhcmlhYmxlQ29sbGVjdGlvbihbXG5cdFx0XHRcdFx0XHRbJ0Eta2V5JywgeyB2YWx1ZTogJ2EnLCB0eXBlOiBFbnZpcm9ubWVudFZhcmlhYmxlTXV0YXRvclR5cGUuUmVwbGFjZSwgc2NvcGU6IHNjb3BlMSwgdmFyaWFibGU6ICdBJyB9XSxcblx0XHRcdFx0XHRcdFsnQicsIHsgdmFsdWU6ICdiJywgdHlwZTogRW52aXJvbm1lbnRWYXJpYWJsZU11dGF0b3JUeXBlLkFwcGVuZCwgc2NvcGU6IHNjb3BlMiwgdmFyaWFibGU6ICdCJyB9XSxcblx0XHRcdFx0XHRcdFsnQycsIHsgdmFsdWU6ICdjJywgdHlwZTogRW52aXJvbm1lbnRWYXJpYWJsZU11dGF0b3JUeXBlLlByZXBlbmQsIHZhcmlhYmxlOiAnQycgfV1cblx0XHRcdFx0XHRdKVxuXHRcdFx0XHR9XVxuXHRcdFx0XSkpO1xuXHRcdFx0Y29uc3QgZW52OiBJUHJvY2Vzc0Vudmlyb25tZW50ID0ge1xuXHRcdFx0XHRBOiAnZm9vJyxcblx0XHRcdFx0QjogJ2JhcicsXG5cdFx0XHRcdEM6ICdiYXonXG5cdFx0XHR9O1xuXHRcdFx0YXdhaXQgbWVyZ2VkLmFwcGx5VG9Qcm9jZXNzRW52aXJvbm1lbnQoZW52LCBzY29wZTEpO1xuXHRcdFx0ZGVlcFN0cmljdEVxdWFsKGVudiwge1xuXHRcdFx0XHRBOiAnYScsXG5cdFx0XHRcdEI6ICdiYXInLCAvLyBUaGlzIGlzIG5vdCBjaGFuZ2VkIGJlY2F1c2UgdGhlIHNjb3BlIGRvZXMgbm90IG1hdGNoXG5cdFx0XHRcdEM6ICdjYmF6J1xuXHRcdFx0fSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdzaG91bGQgYXBwbHkgdGhlIGNvbGxlY3Rpb24gdG8gZW52aXJvbm1lbnQgZW50cmllcyB3aXRoIG5vIHZhbHVlcycsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IG1lcmdlZCA9IG5ldyBNZXJnZWRFbnZpcm9ubWVudFZhcmlhYmxlQ29sbGVjdGlvbihuZXcgTWFwKFtcblx0XHRcdFx0WydleHQnLCB7XG5cdFx0XHRcdFx0bWFwOiBkZXNlcmlhbGl6ZUVudmlyb25tZW50VmFyaWFibGVDb2xsZWN0aW9uKFtcblx0XHRcdFx0XHRcdFsnQS1rZXknLCB7IHZhbHVlOiAnYScsIHR5cGU6IEVudmlyb25tZW50VmFyaWFibGVNdXRhdG9yVHlwZS5SZXBsYWNlLCB2YXJpYWJsZTogJ0EnIH1dLFxuXHRcdFx0XHRcdFx0WydCJywgeyB2YWx1ZTogJ2InLCB0eXBlOiBFbnZpcm9ubWVudFZhcmlhYmxlTXV0YXRvclR5cGUuQXBwZW5kLCB2YXJpYWJsZTogJ0InIH1dLFxuXHRcdFx0XHRcdFx0WydDJywgeyB2YWx1ZTogJ2MnLCB0eXBlOiBFbnZpcm9ubWVudFZhcmlhYmxlTXV0YXRvclR5cGUuUHJlcGVuZCwgdmFyaWFibGU6ICdDJyB9XVxuXHRcdFx0XHRcdF0pXG5cdFx0XHRcdH1dXG5cdFx0XHRdKSk7XG5cdFx0XHRjb25zdCBlbnY6IElQcm9jZXNzRW52aXJvbm1lbnQgPSB7fTtcblx0XHRcdGF3YWl0IG1lcmdlZC5hcHBseVRvUHJvY2Vzc0Vudmlyb25tZW50KGVudiwgdW5kZWZpbmVkKTtcblx0XHRcdGRlZXBTdHJpY3RFcXVhbChlbnYsIHtcblx0XHRcdFx0QTogJ2EnLFxuXHRcdFx0XHRCOiAnYicsXG5cdFx0XHRcdEM6ICdjJ1xuXHRcdFx0fSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdzaG91bGQgYXBwbHkgdG8gdmFyaWFibGUgY2FzZSBpbnNlbnNpdGl2ZWx5IG9uIFdpbmRvd3Mgb25seScsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IG1lcmdlZCA9IG5ldyBNZXJnZWRFbnZpcm9ubWVudFZhcmlhYmxlQ29sbGVjdGlvbihuZXcgTWFwKFtcblx0XHRcdFx0WydleHQnLCB7XG5cdFx0XHRcdFx0bWFwOiBkZXNlcmlhbGl6ZUVudmlyb25tZW50VmFyaWFibGVDb2xsZWN0aW9uKFtcblx0XHRcdFx0XHRcdFsnQS1rZXknLCB7IHZhbHVlOiAnYScsIHR5cGU6IEVudmlyb25tZW50VmFyaWFibGVNdXRhdG9yVHlwZS5SZXBsYWNlLCB2YXJpYWJsZTogJ2EnIH1dLFxuXHRcdFx0XHRcdFx0WydiJywgeyB2YWx1ZTogJ2InLCB0eXBlOiBFbnZpcm9ubWVudFZhcmlhYmxlTXV0YXRvclR5cGUuQXBwZW5kLCB2YXJpYWJsZTogJ2InIH1dLFxuXHRcdFx0XHRcdFx0WydjJywgeyB2YWx1ZTogJ2MnLCB0eXBlOiBFbnZpcm9ubWVudFZhcmlhYmxlTXV0YXRvclR5cGUuUHJlcGVuZCwgdmFyaWFibGU6ICdjJyB9XVxuXHRcdFx0XHRcdF0pXG5cdFx0XHRcdH1dXG5cdFx0XHRdKSk7XG5cdFx0XHRjb25zdCBlbnY6IElQcm9jZXNzRW52aXJvbm1lbnQgPSB7XG5cdFx0XHRcdEE6ICdBJyxcblx0XHRcdFx0QjogJ0InLFxuXHRcdFx0XHRDOiAnQydcblx0XHRcdH07XG5cdFx0XHRhd2FpdCBtZXJnZWQuYXBwbHlUb1Byb2Nlc3NFbnZpcm9ubWVudChlbnYsIHVuZGVmaW5lZCk7XG5cdFx0XHRpZiAoaXNXaW5kb3dzKSB7XG5cdFx0XHRcdGRlZXBTdHJpY3RFcXVhbChlbnYsIHtcblx0XHRcdFx0XHRBOiAnYScsXG5cdFx0XHRcdFx0QjogJ0JiJyxcblx0XHRcdFx0XHRDOiAnY0MnXG5cdFx0XHRcdH0pO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0ZGVlcFN0cmljdEVxdWFsKGVudiwge1xuXHRcdFx0XHRcdGE6ICdhJyxcblx0XHRcdFx0XHRBOiAnQScsXG5cdFx0XHRcdFx0YjogJ2InLFxuXHRcdFx0XHRcdEI6ICdCJyxcblx0XHRcdFx0XHRjOiAnYycsXG5cdFx0XHRcdFx0QzogJ0MnXG5cdFx0XHRcdH0pO1xuXHRcdFx0fVxuXHRcdH0pO1xuXHR9KTtcblxuXHRzdWl0ZSgnZGlmZicsICgpID0+IHtcblx0XHR0ZXN0KCdzaG91bGQgcmV0dXJuIHVuZGVmaW5lZCB3aGVuIGNvbGxlY3Rpbm9zIGFyZSB0aGUgc2FtZScsICgpID0+IHtcblx0XHRcdGNvbnN0IG1lcmdlZDEgPSBuZXcgTWVyZ2VkRW52aXJvbm1lbnRWYXJpYWJsZUNvbGxlY3Rpb24obmV3IE1hcChbXG5cdFx0XHRcdFsnZXh0MScsIHtcblx0XHRcdFx0XHRtYXA6IGRlc2VyaWFsaXplRW52aXJvbm1lbnRWYXJpYWJsZUNvbGxlY3Rpb24oW1xuXHRcdFx0XHRcdFx0WydBLWtleScsIHsgdmFsdWU6ICdhJywgdHlwZTogRW52aXJvbm1lbnRWYXJpYWJsZU11dGF0b3JUeXBlLlJlcGxhY2UsIHZhcmlhYmxlOiAnQScgfV1cblx0XHRcdFx0XHRdKVxuXHRcdFx0XHR9XVxuXHRcdFx0XSkpO1xuXHRcdFx0Y29uc3QgbWVyZ2VkMiA9IG5ldyBNZXJnZWRFbnZpcm9ubWVudFZhcmlhYmxlQ29sbGVjdGlvbihuZXcgTWFwKFtcblx0XHRcdFx0WydleHQxJywge1xuXHRcdFx0XHRcdG1hcDogZGVzZXJpYWxpemVFbnZpcm9ubWVudFZhcmlhYmxlQ29sbGVjdGlvbihbXG5cdFx0XHRcdFx0XHRbJ0Eta2V5JywgeyB2YWx1ZTogJ2EnLCB0eXBlOiBFbnZpcm9ubWVudFZhcmlhYmxlTXV0YXRvclR5cGUuUmVwbGFjZSwgdmFyaWFibGU6ICdBJyB9XVxuXHRcdFx0XHRcdF0pXG5cdFx0XHRcdH1dXG5cdFx0XHRdKSk7XG5cdFx0XHRjb25zdCBkaWZmID0gbWVyZ2VkMS5kaWZmKG1lcmdlZDIsIHVuZGVmaW5lZCk7XG5cdFx0XHRzdHJpY3RFcXVhbChkaWZmLCB1bmRlZmluZWQpO1xuXHRcdH0pO1xuXHRcdHRlc3QoJ3Nob3VsZCBnZW5lcmF0ZSBhZGRlZCBkaWZmcyBmcm9tIHdoZW4gdGhlIGZpcnN0IGVudHJ5IGlzIGFkZGVkJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgbWVyZ2VkMSA9IG5ldyBNZXJnZWRFbnZpcm9ubWVudFZhcmlhYmxlQ29sbGVjdGlvbihuZXcgTWFwKFtdKSk7XG5cdFx0XHRjb25zdCBtZXJnZWQyID0gbmV3IE1lcmdlZEVudmlyb25tZW50VmFyaWFibGVDb2xsZWN0aW9uKG5ldyBNYXAoW1xuXHRcdFx0XHRbJ2V4dDEnLCB7XG5cdFx0XHRcdFx0bWFwOiBkZXNlcmlhbGl6ZUVudmlyb25tZW50VmFyaWFibGVDb2xsZWN0aW9uKFtcblx0XHRcdFx0XHRcdFsnQS1rZXknLCB7IHZhbHVlOiAnYScsIHR5cGU6IEVudmlyb25tZW50VmFyaWFibGVNdXRhdG9yVHlwZS5SZXBsYWNlLCB2YXJpYWJsZTogJ0EnIH1dXG5cdFx0XHRcdFx0XSlcblx0XHRcdFx0fV1cblx0XHRcdF0pKTtcblx0XHRcdGNvbnN0IGRpZmYgPSBtZXJnZWQxLmRpZmYobWVyZ2VkMiwgdW5kZWZpbmVkKSE7XG5cdFx0XHRzdHJpY3RFcXVhbChkaWZmLmNoYW5nZWQuc2l6ZSwgMCk7XG5cdFx0XHRzdHJpY3RFcXVhbChkaWZmLnJlbW92ZWQuc2l6ZSwgMCk7XG5cdFx0XHRjb25zdCBlbnRyaWVzID0gWy4uLmRpZmYuYWRkZWQuZW50cmllcygpXTtcblx0XHRcdGRlZXBTdHJpY3RFcXVhbChlbnRyaWVzLCBbXG5cdFx0XHRcdFsnQScsIFt7IGV4dGVuc2lvbklkZW50aWZpZXI6ICdleHQxJywgdmFsdWU6ICdhJywgdHlwZTogRW52aXJvbm1lbnRWYXJpYWJsZU11dGF0b3JUeXBlLlJlcGxhY2UsIHZhcmlhYmxlOiAnQScsIG9wdGlvbnM6IHVuZGVmaW5lZCB9XV1cblx0XHRcdF0pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnc2hvdWxkIGdlbmVyYXRlIGFkZGVkIGRpZmZzIGZyb20gdGhlIHNhbWUgZXh0ZW5zaW9uJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgbWVyZ2VkMSA9IG5ldyBNZXJnZWRFbnZpcm9ubWVudFZhcmlhYmxlQ29sbGVjdGlvbihuZXcgTWFwKFtcblx0XHRcdFx0WydleHQxJywge1xuXHRcdFx0XHRcdG1hcDogZGVzZXJpYWxpemVFbnZpcm9ubWVudFZhcmlhYmxlQ29sbGVjdGlvbihbXG5cdFx0XHRcdFx0XHRbJ0Eta2V5JywgeyB2YWx1ZTogJ2EnLCB0eXBlOiBFbnZpcm9ubWVudFZhcmlhYmxlTXV0YXRvclR5cGUuUmVwbGFjZSwgdmFyaWFibGU6ICdBJyB9XVxuXHRcdFx0XHRcdF0pXG5cdFx0XHRcdH1dXG5cdFx0XHRdKSk7XG5cdFx0XHRjb25zdCBtZXJnZWQyID0gbmV3IE1lcmdlZEVudmlyb25tZW50VmFyaWFibGVDb2xsZWN0aW9uKG5ldyBNYXAoW1xuXHRcdFx0XHRbJ2V4dDEnLCB7XG5cdFx0XHRcdFx0bWFwOiBkZXNlcmlhbGl6ZUVudmlyb25tZW50VmFyaWFibGVDb2xsZWN0aW9uKFtcblx0XHRcdFx0XHRcdFsnQS1rZXknLCB7IHZhbHVlOiAnYScsIHR5cGU6IEVudmlyb25tZW50VmFyaWFibGVNdXRhdG9yVHlwZS5SZXBsYWNlLCB2YXJpYWJsZTogJ0EnIH1dLFxuXHRcdFx0XHRcdFx0WydCJywgeyB2YWx1ZTogJ2InLCB0eXBlOiBFbnZpcm9ubWVudFZhcmlhYmxlTXV0YXRvclR5cGUuQXBwZW5kLCB2YXJpYWJsZTogJ0InIH1dXG5cdFx0XHRcdFx0XSlcblx0XHRcdFx0fV1cblx0XHRcdF0pKTtcblx0XHRcdGNvbnN0IGRpZmYgPSBtZXJnZWQxLmRpZmYobWVyZ2VkMiwgdW5kZWZpbmVkKSE7XG5cdFx0XHRzdHJpY3RFcXVhbChkaWZmLmNoYW5nZWQuc2l6ZSwgMCk7XG5cdFx0XHRzdHJpY3RFcXVhbChkaWZmLnJlbW92ZWQuc2l6ZSwgMCk7XG5cdFx0XHRjb25zdCBlbnRyaWVzID0gWy4uLmRpZmYuYWRkZWQuZW50cmllcygpXTtcblx0XHRcdGRlZXBTdHJpY3RFcXVhbChlbnRyaWVzLCBbXG5cdFx0XHRcdFsnQicsIFt7IGV4dGVuc2lvbklkZW50aWZpZXI6ICdleHQxJywgdmFsdWU6ICdiJywgdHlwZTogRW52aXJvbm1lbnRWYXJpYWJsZU11dGF0b3JUeXBlLkFwcGVuZCwgdmFyaWFibGU6ICdCJywgb3B0aW9uczogdW5kZWZpbmVkIH1dXVxuXHRcdFx0XSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdzaG91bGQgZ2VuZXJhdGUgYWRkZWQgZGlmZnMgZnJvbSBhIGRpZmZlcmVudCBleHRlbnNpb24nLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBtZXJnZWQxID0gbmV3IE1lcmdlZEVudmlyb25tZW50VmFyaWFibGVDb2xsZWN0aW9uKG5ldyBNYXAoW1xuXHRcdFx0XHRbJ2V4dDEnLCB7XG5cdFx0XHRcdFx0bWFwOiBkZXNlcmlhbGl6ZUVudmlyb25tZW50VmFyaWFibGVDb2xsZWN0aW9uKFtcblx0XHRcdFx0XHRcdFsnQS1rZXknLCB7IHZhbHVlOiAnYTEnLCB0eXBlOiBFbnZpcm9ubWVudFZhcmlhYmxlTXV0YXRvclR5cGUuUHJlcGVuZCwgdmFyaWFibGU6ICdBJyB9XVxuXHRcdFx0XHRcdF0pXG5cdFx0XHRcdH1dXG5cdFx0XHRdKSk7XG5cblx0XHRcdGNvbnN0IG1lcmdlZDIgPSBuZXcgTWVyZ2VkRW52aXJvbm1lbnRWYXJpYWJsZUNvbGxlY3Rpb24obmV3IE1hcChbXG5cdFx0XHRcdFsnZXh0MicsIHtcblx0XHRcdFx0XHRtYXA6IGRlc2VyaWFsaXplRW52aXJvbm1lbnRWYXJpYWJsZUNvbGxlY3Rpb24oW1xuXHRcdFx0XHRcdFx0WydBLWtleScsIHsgdmFsdWU6ICdhMicsIHR5cGU6IEVudmlyb25tZW50VmFyaWFibGVNdXRhdG9yVHlwZS5BcHBlbmQsIHZhcmlhYmxlOiAnQScgfV1cblx0XHRcdFx0XHRdKVxuXHRcdFx0XHR9XSxcblx0XHRcdFx0WydleHQxJywge1xuXHRcdFx0XHRcdG1hcDogZGVzZXJpYWxpemVFbnZpcm9ubWVudFZhcmlhYmxlQ29sbGVjdGlvbihbXG5cdFx0XHRcdFx0XHRbJ0Eta2V5JywgeyB2YWx1ZTogJ2ExJywgdHlwZTogRW52aXJvbm1lbnRWYXJpYWJsZU11dGF0b3JUeXBlLlByZXBlbmQsIHZhcmlhYmxlOiAnQScgfV1cblx0XHRcdFx0XHRdKVxuXHRcdFx0XHR9XVxuXHRcdFx0XSkpO1xuXHRcdFx0Y29uc3QgZGlmZiA9IG1lcmdlZDEuZGlmZihtZXJnZWQyLCB1bmRlZmluZWQpITtcblx0XHRcdHN0cmljdEVxdWFsKGRpZmYuY2hhbmdlZC5zaXplLCAwKTtcblx0XHRcdHN0cmljdEVxdWFsKGRpZmYucmVtb3ZlZC5zaXplLCAwKTtcblx0XHRcdGRlZXBTdHJpY3RFcXVhbChbLi4uZGlmZi5hZGRlZC5lbnRyaWVzKCldLCBbXG5cdFx0XHRcdFsnQScsIFt7IGV4dGVuc2lvbklkZW50aWZpZXI6ICdleHQyJywgdmFsdWU6ICdhMicsIHR5cGU6IEVudmlyb25tZW50VmFyaWFibGVNdXRhdG9yVHlwZS5BcHBlbmQsIHZhcmlhYmxlOiAnQScsIG9wdGlvbnM6IHVuZGVmaW5lZCB9XV1cblx0XHRcdF0pO1xuXG5cdFx0XHRjb25zdCBtZXJnZWQzID0gbmV3IE1lcmdlZEVudmlyb25tZW50VmFyaWFibGVDb2xsZWN0aW9uKG5ldyBNYXAoW1xuXHRcdFx0XHRbJ2V4dDEnLCB7XG5cdFx0XHRcdFx0bWFwOiBkZXNlcmlhbGl6ZUVudmlyb25tZW50VmFyaWFibGVDb2xsZWN0aW9uKFtcblx0XHRcdFx0XHRcdFsnQS1rZXknLCB7IHZhbHVlOiAnYTEnLCB0eXBlOiBFbnZpcm9ubWVudFZhcmlhYmxlTXV0YXRvclR5cGUuUHJlcGVuZCwgdmFyaWFibGU6ICdBJyB9XVxuXHRcdFx0XHRcdF0pXG5cdFx0XHRcdH1dLFxuXHRcdFx0XHQvLyBUaGlzIGVudHJ5IHNob3VsZCBnZXQgcmVtb3ZlZFxuXHRcdFx0XHRbJ2V4dDInLCB7XG5cdFx0XHRcdFx0bWFwOiBkZXNlcmlhbGl6ZUVudmlyb25tZW50VmFyaWFibGVDb2xsZWN0aW9uKFtcblx0XHRcdFx0XHRcdFsnQS1rZXknLCB7IHZhbHVlOiAnYTInLCB0eXBlOiBFbnZpcm9ubWVudFZhcmlhYmxlTXV0YXRvclR5cGUuQXBwZW5kLCB2YXJpYWJsZTogJ0EnIH1dXG5cdFx0XHRcdFx0XSlcblx0XHRcdFx0fV1cblx0XHRcdF0pKTtcblx0XHRcdGNvbnN0IGRpZmYyID0gbWVyZ2VkMS5kaWZmKG1lcmdlZDMsIHVuZGVmaW5lZCkhO1xuXHRcdFx0c3RyaWN0RXF1YWwoZGlmZjIuY2hhbmdlZC5zaXplLCAwKTtcblx0XHRcdHN0cmljdEVxdWFsKGRpZmYyLnJlbW92ZWQuc2l6ZSwgMCk7XG5cdFx0XHRkZWVwU3RyaWN0RXF1YWwoWy4uLmRpZmYuYWRkZWQuZW50cmllcygpXSwgWy4uLmRpZmYyLmFkZGVkLmVudHJpZXMoKV0sICdTd2FwcGluZyB0aGUgb3JkZXIgb2YgdGhlIGVudHJpZXMgaW4gdGhlIG90aGVyIGNvbGxlY3Rpb24gc2hvdWxkIHlpZWxkIHRoZSBzYW1lIHJlc3VsdCcpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnc2hvdWxkIHJlbW92ZSBlbnRyaWVzIGluIHRoZSBkaWZmIHRoYXQgY29tZSBhZnRlciBhIFJlcGxhY2UnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBtZXJnZWQxID0gbmV3IE1lcmdlZEVudmlyb25tZW50VmFyaWFibGVDb2xsZWN0aW9uKG5ldyBNYXAoW1xuXHRcdFx0XHRbJ2V4dDEnLCB7XG5cdFx0XHRcdFx0bWFwOiBkZXNlcmlhbGl6ZUVudmlyb25tZW50VmFyaWFibGVDb2xsZWN0aW9uKFtcblx0XHRcdFx0XHRcdFsnQS1rZXknLCB7IHZhbHVlOiAnYTEnLCB0eXBlOiBFbnZpcm9ubWVudFZhcmlhYmxlTXV0YXRvclR5cGUuUmVwbGFjZSwgdmFyaWFibGU6ICdBJyB9XVxuXHRcdFx0XHRcdF0pXG5cdFx0XHRcdH1dXG5cdFx0XHRdKSk7XG5cdFx0XHRjb25zdCBtZXJnZWQ0ID0gbmV3IE1lcmdlZEVudmlyb25tZW50VmFyaWFibGVDb2xsZWN0aW9uKG5ldyBNYXAoW1xuXHRcdFx0XHRbJ2V4dDEnLCB7XG5cdFx0XHRcdFx0bWFwOiBkZXNlcmlhbGl6ZUVudmlyb25tZW50VmFyaWFibGVDb2xsZWN0aW9uKFtcblx0XHRcdFx0XHRcdFsnQS1rZXknLCB7IHZhbHVlOiAnYTEnLCB0eXBlOiBFbnZpcm9ubWVudFZhcmlhYmxlTXV0YXRvclR5cGUuUmVwbGFjZSwgdmFyaWFibGU6ICdBJyB9XVxuXHRcdFx0XHRcdF0pXG5cdFx0XHRcdH1dLFxuXHRcdFx0XHQvLyBUaGlzIGVudHJ5IHNob3VsZCBnZXQgcmVtb3ZlZCBhcyBpdCBjb21lcyBhZnRlciBhIHJlcGxhY2Vcblx0XHRcdFx0WydleHQyJywge1xuXHRcdFx0XHRcdG1hcDogZGVzZXJpYWxpemVFbnZpcm9ubWVudFZhcmlhYmxlQ29sbGVjdGlvbihbXG5cdFx0XHRcdFx0XHRbJ0Eta2V5JywgeyB2YWx1ZTogJ2EyJywgdHlwZTogRW52aXJvbm1lbnRWYXJpYWJsZU11dGF0b3JUeXBlLkFwcGVuZCwgdmFyaWFibGU6ICdBJyB9XVxuXHRcdFx0XHRcdF0pXG5cdFx0XHRcdH1dXG5cdFx0XHRdKSk7XG5cdFx0XHRjb25zdCBkaWZmID0gbWVyZ2VkMS5kaWZmKG1lcmdlZDQsIHVuZGVmaW5lZCk7XG5cdFx0XHRzdHJpY3RFcXVhbChkaWZmLCB1bmRlZmluZWQsICdSZXBsYWNlIHNob3VsZCBpZ25vcmUgYW55IGVudHJpZXMgYWZ0ZXIgaXQnKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3Nob3VsZCBnZW5lcmF0ZSByZW1vdmVkIGRpZmZzJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgbWVyZ2VkMSA9IG5ldyBNZXJnZWRFbnZpcm9ubWVudFZhcmlhYmxlQ29sbGVjdGlvbihuZXcgTWFwKFtcblx0XHRcdFx0WydleHQxJywge1xuXHRcdFx0XHRcdG1hcDogZGVzZXJpYWxpemVFbnZpcm9ubWVudFZhcmlhYmxlQ29sbGVjdGlvbihbXG5cdFx0XHRcdFx0XHRbJ0Eta2V5JywgeyB2YWx1ZTogJ2EnLCB0eXBlOiBFbnZpcm9ubWVudFZhcmlhYmxlTXV0YXRvclR5cGUuUmVwbGFjZSwgdmFyaWFibGU6ICdBJyB9XSxcblx0XHRcdFx0XHRcdFsnQicsIHsgdmFsdWU6ICdiJywgdHlwZTogRW52aXJvbm1lbnRWYXJpYWJsZU11dGF0b3JUeXBlLlJlcGxhY2UsIHZhcmlhYmxlOiAnQicgfV1cblx0XHRcdFx0XHRdKVxuXHRcdFx0XHR9XVxuXHRcdFx0XSkpO1xuXHRcdFx0Y29uc3QgbWVyZ2VkMiA9IG5ldyBNZXJnZWRFbnZpcm9ubWVudFZhcmlhYmxlQ29sbGVjdGlvbihuZXcgTWFwKFtcblx0XHRcdFx0WydleHQxJywge1xuXHRcdFx0XHRcdG1hcDogZGVzZXJpYWxpemVFbnZpcm9ubWVudFZhcmlhYmxlQ29sbGVjdGlvbihbXG5cdFx0XHRcdFx0XHRbJ0Eta2V5JywgeyB2YWx1ZTogJ2EnLCB0eXBlOiBFbnZpcm9ubWVudFZhcmlhYmxlTXV0YXRvclR5cGUuUmVwbGFjZSwgdmFyaWFibGU6ICdBJyB9XVxuXHRcdFx0XHRcdF0pXG5cdFx0XHRcdH1dXG5cdFx0XHRdKSk7XG5cdFx0XHRjb25zdCBkaWZmID0gbWVyZ2VkMS5kaWZmKG1lcmdlZDIsIHVuZGVmaW5lZCkhO1xuXHRcdFx0c3RyaWN0RXF1YWwoZGlmZi5jaGFuZ2VkLnNpemUsIDApO1xuXHRcdFx0c3RyaWN0RXF1YWwoZGlmZi5hZGRlZC5zaXplLCAwKTtcblx0XHRcdGRlZXBTdHJpY3RFcXVhbChbLi4uZGlmZi5yZW1vdmVkLmVudHJpZXMoKV0sIFtcblx0XHRcdFx0WydCJywgW3sgZXh0ZW5zaW9uSWRlbnRpZmllcjogJ2V4dDEnLCB2YWx1ZTogJ2InLCB0eXBlOiBFbnZpcm9ubWVudFZhcmlhYmxlTXV0YXRvclR5cGUuUmVwbGFjZSwgdmFyaWFibGU6ICdCJywgb3B0aW9uczogdW5kZWZpbmVkIH1dXVxuXHRcdFx0XSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdzaG91bGQgZ2VuZXJhdGUgY2hhbmdlZCBkaWZmcycsICgpID0+IHtcblx0XHRcdGNvbnN0IG1lcmdlZDEgPSBuZXcgTWVyZ2VkRW52aXJvbm1lbnRWYXJpYWJsZUNvbGxlY3Rpb24obmV3IE1hcChbXG5cdFx0XHRcdFsnZXh0MScsIHtcblx0XHRcdFx0XHRtYXA6IGRlc2VyaWFsaXplRW52aXJvbm1lbnRWYXJpYWJsZUNvbGxlY3Rpb24oW1xuXHRcdFx0XHRcdFx0WydBLWtleScsIHsgdmFsdWU6ICdhMScsIHR5cGU6IEVudmlyb25tZW50VmFyaWFibGVNdXRhdG9yVHlwZS5SZXBsYWNlLCB2YXJpYWJsZTogJ0EnIH1dLFxuXHRcdFx0XHRcdFx0WydCJywgeyB2YWx1ZTogJ2InLCB0eXBlOiBFbnZpcm9ubWVudFZhcmlhYmxlTXV0YXRvclR5cGUuUmVwbGFjZSwgdmFyaWFibGU6ICdCJyB9XVxuXHRcdFx0XHRcdF0pXG5cdFx0XHRcdH1dXG5cdFx0XHRdKSk7XG5cdFx0XHRjb25zdCBtZXJnZWQyID0gbmV3IE1lcmdlZEVudmlyb25tZW50VmFyaWFibGVDb2xsZWN0aW9uKG5ldyBNYXAoW1xuXHRcdFx0XHRbJ2V4dDEnLCB7XG5cdFx0XHRcdFx0bWFwOiBkZXNlcmlhbGl6ZUVudmlyb25tZW50VmFyaWFibGVDb2xsZWN0aW9uKFtcblx0XHRcdFx0XHRcdFsnQS1rZXknLCB7IHZhbHVlOiAnYTInLCB0eXBlOiBFbnZpcm9ubWVudFZhcmlhYmxlTXV0YXRvclR5cGUuUmVwbGFjZSwgdmFyaWFibGU6ICdBJyB9XSxcblx0XHRcdFx0XHRcdFsnQicsIHsgdmFsdWU6ICdiJywgdHlwZTogRW52aXJvbm1lbnRWYXJpYWJsZU11dGF0b3JUeXBlLkFwcGVuZCwgdmFyaWFibGU6ICdCJyB9XVxuXHRcdFx0XHRcdF0pXG5cdFx0XHRcdH1dXG5cdFx0XHRdKSk7XG5cdFx0XHRjb25zdCBkaWZmID0gbWVyZ2VkMS5kaWZmKG1lcmdlZDIsIHVuZGVmaW5lZCkhO1xuXHRcdFx0c3RyaWN0RXF1YWwoZGlmZi5hZGRlZC5zaXplLCAwKTtcblx0XHRcdHN0cmljdEVxdWFsKGRpZmYucmVtb3ZlZC5zaXplLCAwKTtcblx0XHRcdGRlZXBTdHJpY3RFcXVhbChbLi4uZGlmZi5jaGFuZ2VkLmVudHJpZXMoKV0sIFtcblx0XHRcdFx0WydBJywgW3sgZXh0ZW5zaW9uSWRlbnRpZmllcjogJ2V4dDEnLCB2YWx1ZTogJ2EyJywgdHlwZTogRW52aXJvbm1lbnRWYXJpYWJsZU11dGF0b3JUeXBlLlJlcGxhY2UsIHZhcmlhYmxlOiAnQScsIG9wdGlvbnM6IHVuZGVmaW5lZCB9XV0sXG5cdFx0XHRcdFsnQicsIFt7IGV4dGVuc2lvbklkZW50aWZpZXI6ICdleHQxJywgdmFsdWU6ICdiJywgdHlwZTogRW52aXJvbm1lbnRWYXJpYWJsZU11dGF0b3JUeXBlLkFwcGVuZCwgdmFyaWFibGU6ICdCJywgb3B0aW9uczogdW5kZWZpbmVkIH1dXVxuXHRcdFx0XSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdzaG91bGQgZ2VuZXJhdGUgZGlmZnMgd2l0aCBhZGRlZCwgY2hhbmdlZCBhbmQgcmVtb3ZlZCcsICgpID0+IHtcblx0XHRcdGNvbnN0IG1lcmdlZDEgPSBuZXcgTWVyZ2VkRW52aXJvbm1lbnRWYXJpYWJsZUNvbGxlY3Rpb24obmV3IE1hcChbXG5cdFx0XHRcdFsnZXh0MScsIHtcblx0XHRcdFx0XHRtYXA6IGRlc2VyaWFsaXplRW52aXJvbm1lbnRWYXJpYWJsZUNvbGxlY3Rpb24oW1xuXHRcdFx0XHRcdFx0WydBLWtleScsIHsgdmFsdWU6ICdhMScsIHR5cGU6IEVudmlyb25tZW50VmFyaWFibGVNdXRhdG9yVHlwZS5SZXBsYWNlLCB2YXJpYWJsZTogJ0EnIH1dLFxuXHRcdFx0XHRcdFx0WydCJywgeyB2YWx1ZTogJ2InLCB0eXBlOiBFbnZpcm9ubWVudFZhcmlhYmxlTXV0YXRvclR5cGUuUHJlcGVuZCwgdmFyaWFibGU6ICdCJyB9XVxuXHRcdFx0XHRcdF0pXG5cdFx0XHRcdH1dXG5cdFx0XHRdKSk7XG5cdFx0XHRjb25zdCBtZXJnZWQyID0gbmV3IE1lcmdlZEVudmlyb25tZW50VmFyaWFibGVDb2xsZWN0aW9uKG5ldyBNYXAoW1xuXHRcdFx0XHRbJ2V4dDEnLCB7XG5cdFx0XHRcdFx0bWFwOiBkZXNlcmlhbGl6ZUVudmlyb25tZW50VmFyaWFibGVDb2xsZWN0aW9uKFtcblx0XHRcdFx0XHRcdFsnQS1rZXknLCB7IHZhbHVlOiAnYTInLCB0eXBlOiBFbnZpcm9ubWVudFZhcmlhYmxlTXV0YXRvclR5cGUuUmVwbGFjZSwgdmFyaWFibGU6ICdBJyB9XSxcblx0XHRcdFx0XHRcdFsnQycsIHsgdmFsdWU6ICdjJywgdHlwZTogRW52aXJvbm1lbnRWYXJpYWJsZU11dGF0b3JUeXBlLkFwcGVuZCwgdmFyaWFibGU6ICdDJyB9XVxuXHRcdFx0XHRcdF0pXG5cdFx0XHRcdH1dXG5cdFx0XHRdKSk7XG5cdFx0XHRjb25zdCBkaWZmID0gbWVyZ2VkMS5kaWZmKG1lcmdlZDIsIHVuZGVmaW5lZCkhO1xuXHRcdFx0ZGVlcFN0cmljdEVxdWFsKFsuLi5kaWZmLmFkZGVkLmVudHJpZXMoKV0sIFtcblx0XHRcdFx0WydDJywgW3sgZXh0ZW5zaW9uSWRlbnRpZmllcjogJ2V4dDEnLCB2YWx1ZTogJ2MnLCB0eXBlOiBFbnZpcm9ubWVudFZhcmlhYmxlTXV0YXRvclR5cGUuQXBwZW5kLCB2YXJpYWJsZTogJ0MnLCBvcHRpb25zOiB1bmRlZmluZWQgfV1dLFxuXHRcdFx0XSk7XG5cdFx0XHRkZWVwU3RyaWN0RXF1YWwoWy4uLmRpZmYucmVtb3ZlZC5lbnRyaWVzKCldLCBbXG5cdFx0XHRcdFsnQicsIFt7IGV4dGVuc2lvbklkZW50aWZpZXI6ICdleHQxJywgdmFsdWU6ICdiJywgdHlwZTogRW52aXJvbm1lbnRWYXJpYWJsZU11dGF0b3JUeXBlLlByZXBlbmQsIHZhcmlhYmxlOiAnQicsIG9wdGlvbnM6IHVuZGVmaW5lZCB9XV1cblx0XHRcdF0pO1xuXHRcdFx0ZGVlcFN0cmljdEVxdWFsKFsuLi5kaWZmLmNoYW5nZWQuZW50cmllcygpXSwgW1xuXHRcdFx0XHRbJ0EnLCBbeyBleHRlbnNpb25JZGVudGlmaWVyOiAnZXh0MScsIHZhbHVlOiAnYTInLCB0eXBlOiBFbnZpcm9ubWVudFZhcmlhYmxlTXV0YXRvclR5cGUuUmVwbGFjZSwgdmFyaWFibGU6ICdBJywgb3B0aW9uczogdW5kZWZpbmVkIH1dXVxuXHRcdFx0XSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdzaG91bGQgb25seSBnZW5lcmF0ZSB3b3Jrc3BhY2Ugc3BlY2lmaWMgZGlmZnMnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBzY29wZTEgPSB7IHdvcmtzcGFjZUZvbGRlcjogeyB1cmk6IFVSSS5maWxlKCd3b3Jrc3BhY2UxJyksIG5hbWU6ICd3b3Jrc3BhY2UxJywgaW5kZXg6IDAgfSB9O1xuXHRcdFx0Y29uc3Qgc2NvcGUyID0geyB3b3Jrc3BhY2VGb2xkZXI6IHsgdXJpOiBVUkkuZmlsZSgnd29ya3NwYWNlMicpLCBuYW1lOiAnd29ya3NwYWNlMicsIGluZGV4OiAzIH0gfTtcblx0XHRcdGNvbnN0IG1lcmdlZDEgPSBuZXcgTWVyZ2VkRW52aXJvbm1lbnRWYXJpYWJsZUNvbGxlY3Rpb24obmV3IE1hcChbXG5cdFx0XHRcdFsnZXh0MScsIHtcblx0XHRcdFx0XHRtYXA6IGRlc2VyaWFsaXplRW52aXJvbm1lbnRWYXJpYWJsZUNvbGxlY3Rpb24oW1xuXHRcdFx0XHRcdFx0WydBLWtleScsIHsgdmFsdWU6ICdhMScsIHR5cGU6IEVudmlyb25tZW50VmFyaWFibGVNdXRhdG9yVHlwZS5SZXBsYWNlLCBzY29wZTogc2NvcGUxLCB2YXJpYWJsZTogJ0EnIH1dLFxuXHRcdFx0XHRcdFx0WydCJywgeyB2YWx1ZTogJ2InLCB0eXBlOiBFbnZpcm9ubWVudFZhcmlhYmxlTXV0YXRvclR5cGUuUHJlcGVuZCwgdmFyaWFibGU6ICdCJyB9XVxuXHRcdFx0XHRcdF0pXG5cdFx0XHRcdH1dXG5cdFx0XHRdKSk7XG5cdFx0XHRjb25zdCBtZXJnZWQyID0gbmV3IE1lcmdlZEVudmlyb25tZW50VmFyaWFibGVDb2xsZWN0aW9uKG5ldyBNYXAoW1xuXHRcdFx0XHRbJ2V4dDEnLCB7XG5cdFx0XHRcdFx0bWFwOiBkZXNlcmlhbGl6ZUVudmlyb25tZW50VmFyaWFibGVDb2xsZWN0aW9uKFtcblx0XHRcdFx0XHRcdFsnQS1rZXknLCB7IHZhbHVlOiAnYTInLCB0eXBlOiBFbnZpcm9ubWVudFZhcmlhYmxlTXV0YXRvclR5cGUuUmVwbGFjZSwgc2NvcGU6IHNjb3BlMSwgdmFyaWFibGU6ICdBJyB9XSxcblx0XHRcdFx0XHRcdFsnQycsIHsgdmFsdWU6ICdjJywgdHlwZTogRW52aXJvbm1lbnRWYXJpYWJsZU11dGF0b3JUeXBlLkFwcGVuZCwgc2NvcGU6IHNjb3BlMiwgdmFyaWFibGU6ICdDJyB9XVxuXHRcdFx0XHRcdF0pXG5cdFx0XHRcdH1dXG5cdFx0XHRdKSk7XG5cdFx0XHRjb25zdCBkaWZmID0gbWVyZ2VkMS5kaWZmKG1lcmdlZDIsIHNjb3BlMSkhO1xuXHRcdFx0c3RyaWN0RXF1YWwoZGlmZi5hZGRlZC5zaXplLCAwKTtcblx0XHRcdGRlZXBTdHJpY3RFcXVhbChbLi4uZGlmZi5yZW1vdmVkLmVudHJpZXMoKV0sIFtcblx0XHRcdFx0WydCJywgW3sgZXh0ZW5zaW9uSWRlbnRpZmllcjogJ2V4dDEnLCB2YWx1ZTogJ2InLCB0eXBlOiBFbnZpcm9ubWVudFZhcmlhYmxlTXV0YXRvclR5cGUuUHJlcGVuZCwgdmFyaWFibGU6ICdCJywgb3B0aW9uczogdW5kZWZpbmVkIH1dXVxuXHRcdFx0XSk7XG5cdFx0XHRkZWVwU3RyaWN0RXF1YWwoWy4uLmRpZmYuY2hhbmdlZC5lbnRyaWVzKCldLCBbXG5cdFx0XHRcdFsnQScsIFt7IGV4dGVuc2lvbklkZW50aWZpZXI6ICdleHQxJywgdmFsdWU6ICdhMicsIHR5cGU6IEVudmlyb25tZW50VmFyaWFibGVNdXRhdG9yVHlwZS5SZXBsYWNlLCBzY29wZTogc2NvcGUxLCB2YXJpYWJsZTogJ0EnLCBvcHRpb25zOiB1bmRlZmluZWQgfV1dXG5cdFx0XHRdKTtcblx0XHR9KTtcblx0fSk7XG59KTtcbiJdLAogICJtYXBwaW5ncyI6ICJBQUtBLFNBQVMsaUJBQWlCLG1CQUFtQjtBQUM3QyxTQUFTLHNDQUFzQztBQUMvQyxTQUE4QixpQkFBaUI7QUFDL0MsU0FBUywyQ0FBMkM7QUFDcEQsU0FBUyxzQ0FBc0MsZ0RBQWdEO0FBQy9GLFNBQVMsV0FBVztBQUNwQixTQUFTLCtDQUErQztBQUV4RCxNQUFNLDZEQUE2RCxNQUFNO0FBQ3hFLDBDQUF3QztBQUV4QyxRQUFNLFFBQVEsTUFBTTtBQUNuQixTQUFLLHlFQUF5RSxNQUFNO0FBQ25GLFlBQU0sU0FBUyxJQUFJLG9DQUFvQyxvQkFBSSxJQUFJO0FBQUEsUUFDOUQsQ0FBQyxRQUFRO0FBQUEsVUFDUixLQUFLLHlDQUF5QztBQUFBLFlBQzdDLENBQUMsU0FB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
