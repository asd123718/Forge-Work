import assert from "assert";
import { IndexTreeModel } from "../../../../browser/ui/tree/indexTreeModel.js";
import { TreeVisibility } from "../../../../browser/ui/tree/tree.js";
import { timeout } from "../../../../common/async.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../common/utils.js";
import { DisposableStore } from "../../../../common/lifecycle.js";
function bindListToModel(list, model) {
  return model.onDidSpliceRenderedNodes(({ start, deleteCount, elements }) => {
    list.splice(start, deleteCount, ...elements);
  });
}
function toArray(list) {
  return list.map((i) => i.element);
}
function toElements(node) {
  return node.children?.length ? { e: node.element, children: node.children.map(toElements) } : node.element;
}
const diffIdentityProvider = { getId: (n) => String(n) };
function withSmartSplice(fn) {
  fn({});
  fn({ diffIdentityProvider });
}
suite("IndexTreeModel", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  const disposables = new DisposableStore();
  teardown(() => {
    disposables.clear();
  });
  test("ctor", () => {
    const list = [];
    const model = new IndexTreeModel("test", -1);
    assert(model);
    assert.strictEqual(list.length, 0);
  });
  test("insert", () => withSmartSplice((options) => {
    const list = [];
    const model = new IndexTreeModel("test", -1);
    const disposable = bindListToModel(list, model);
    model.splice([0], 0, [
      { element: 0 },
      { element: 1 },
      { element: 2 }
    ], options);
    assert.deepStrictEqual(list.length, 3);
    assert.deepStrictEqual(list[0].element, 0);
    assert.deepStrictEqual(list[0].collapsed, false);
    assert.deepStrictEqual(list[0].depth, 1);
    assert.deepStrictEqual(list[1].element, 1);
    assert.deepStrictEqual(list[1].collapsed, false);
    assert.deepStrictEqual(list[1].depth, 1);
    assert.deepStrictEqual(list[2].element, 2);
    assert.deepStrictEqual(list[2].collapsed, false);
    assert.deepStrictEqual(list[2].depth, 1);
    disposable.dispose();
  }));
  test("deep insert", () => withSmartSplice((options) => {
    const list = [];
    const model = new IndexTreeModel("test", -1);
    const disposable = bindListToModel(list, model);
    model.splice([0], 0, [
      {
        element: 0,
        children: [
          { element: 10 },
          { element: 11 },
          { element: 12 }
        ]
      },
      { element: 1 },
      { element: 2 }
    ]);
    assert.deepStrictEqual(list.length, 6);
    assert.deepStrictEqual(list[0].element, 0);
    assert.deepStrictEqual(list[0].collapsed, false);
    assert.deepStrictEqual(list[0].depth, 1);
    assert.deepStrictEqual(list[1].element, 10);
    assert.deepStrictEqual(list[1].collapsed, false);
    assert.deepStrictEqual(list[1].depth, 2);
    assert.deepStrictEqual(list[2].element, 11);
    assert.deepStrictEqual(list[2].collapsed, false);
    assert.deepStrictEqual(list[2].depth, 2);
    assert.deepStrictEqual(list[3].element, 12);
    assert.deepStrictEqual(list[3].collapsed, false);
    assert.deepStrictEqual(list[3].depth, 2);
    assert.deepStrictEqual(list[4].element, 1);
    assert.deepStrictEqual(list[4].collapsed, false);
    assert.deepStrictEqual(list[4].depth, 1);
    assert.deepStrictEqual(list[5].element, 2);
    assert.deepStrictEqual(list[5].collapsed, false);
    assert.deepStrictEqual(list[5].depth, 1);
    disposable.dispose();
  }));
  test("deep insert collapsed", () => withSmartSplice((options) => {
    const list = [];
    const model = new IndexTreeModel("test", -1);
    const disposable = bindListToModel(list, model);
    model.splice([0], 0, [
      {
        element: 0,
        collapsed: true,
        children: [
          { element: 10 },
          { element: 11 },
          { element: 12 }
        ]
      },
      { element: 1 },
      { element: 2 }
    ], options);
    assert.deepStrictEqual(list.length, 3);
    assert.deepStrictEqual(list[0].element, 0);
    assert.deepStrictEqual(list[0].collapsed, true);
    assert.deepStrictEqual(list[0].depth, 1);
    assert.deepStrictEqual(list[1].element, 1);
    assert.deepStrictEqual(list[1].collapsed, false);
    assert.deepStrictEqual(list[1].depth, 1);
    assert.deepStrictEqual(list[2].element, 2);
    assert.deepStrictEqual(list[2].collapsed, false);
    assert.deepStrictEqual(list[2].depth, 1);
    disposable.dispose();
  }));
  test("delete", () => withSmartSplice((options) => {
    const list = [];
    const model = new IndexTreeModel("test", -1);
    const disposable = bindListToModel(list, model);
    model.splice([0], 0, [
      { element: 0 },
      { element: 1 },
      { element: 2 }
    ], options);
    assert.deepStrictEqual(list.length, 3);
    model.splice([1], 1, void 0, options);
    assert.deepStrictEqual(list.length, 2);
    assert.deepStrictEqual(list[0].element, 0);
    assert.deepStrictEqual(list[0].collapsed, false);
    assert.deepStrictEqual(list[0].depth, 1);
    assert.deepStrictEqual(list[1].element, 2);
    assert.deepStrictEqual(list[1].collapsed, false);
    assert.deepStrictEqual(list[1].depth, 1);
    model.splice([0], 2, void 0, options);
    assert.deepStrictEqual(list.length, 0);
    disposable.dispose();
  }));
  test("nested delete", () => withSmartSplice((options) => {
    const list = [];
    const model = new IndexTreeModel("test", -1);
    const disposable = bindListToModel(list, model);
    model.splice([0], 0, [
      {
        element: 0,
        children: [
          { element: 10 },
          { element: 11 },
          { element: 12 }
        ]
      },
      { element: 1 },
      { element: 2 }
    ], options);
    assert.deepStrictEqual(list.length, 6);
    model.splice([1], 2, void 0, options);
    assert.deepStrictEqual(list.length, 4);
    assert.deepStrictEqual(list[0].element, 0);
    assert.deepStrictEqual(list[0].collapsed, false);
    assert.deepStrictEqual(list[0].depth, 1);
    assert.deepStrictEqual(list[1].element, 10);
    assert.deepStrictEqual(list[1].collapsed, false);
    assert.deepStrictEqual(list[1].depth, 2);
    assert.deepStrictEqual(list[2].element, 11);
    assert.deepStrictEqual(list[2].collapsed, false);
    assert.deepStrictEqual(list[2].depth, 2);
    assert.deepStrictEqual(list[3].element, 12);
    assert.deepStrictEqual(list[3].collapsed, false);
    assert.deepStrictEqual(list[3].depth, 2);
    disposable.dispose();
  }));
  test("deep delete", () => withSmartSplice((options) => {
    const list = [];
    const model = new IndexTreeModel("test", -1);
    const disposable = bindListToModel(list, model);
    model.splice([0], 0, [
      {
        element: 0,
        children: [
          { element: 10 },
          { element: 11 },
          { element: 12 }
        ]
      },
      { element: 1 },
      { element: 2 }
    ], options);
    assert.deepStrictEqual(list.length, 6);
    model.splice([0], 1, void 0, options);
    assert.deepStrictEqual(list.length, 2);
    assert.deepStrictEqual(list[0].element, 1);
    assert.deepStrictEqual(list[0].collapsed, false);
    assert.deepStrictEqual(list[0].depth, 1);
    assert.deepStrictEqual(list[1].element, 2);
    assert.deepStrictEqual(list[1].collapsed, false);
    assert.deepStrictEqual(list[1].depth, 1);
    disposable.dispose();
  }));
  test("smart splice deep", () => {
    const list = [];
    const model = new IndexTreeModel("test", -1);
    const disposable = bindListToModel(list, model);
    model.splice([0], 0, [
      { element: 0 },
      { element: 1 },
      { element: 2 },
      { element: 3 }
    ], { diffIdentityProvider });
    assert.deepStrictEqual(list.filter((l) => l.depth === 1).map(toElements), [
      0,
      1,
      2,
      3
    ]);
    model.splice([0], 3, [
      { element: -0.5 },
      { element: 0, children: [{ element: 0.1 }] },
      { element: 1 },
      { element: 2, children: [{ element: 2.1 }, { element: 2.2, children: [{ element: 2.21 }] }] }
    ], { diffIdentityProvider, diffDepth: Infinity });
    assert.deepStrictEqual(list.filter((l) => l.depth === 1).map(toElements), [
      -0.5,
      { e: 0, children: [0.1] },
      1,
      { e: 2, children: [2.1, { e: 2.2, children: [2.21] }] },
      3
    ]);
    disposable.dispose();
  });
  test("hidden delete", () => withSmartSplice((options) => {
    const list = [];
    const model = new IndexTreeModel("test", -1);
    const disposable = bindListToModel(list, model);
    model.splice([0], 0, [
      {
        element: 0,
        collapsed: true,
        children: [
          { element: 10 },
          { element: 11 },
          { element: 12 }
        ]
      },
      { element: 1 },
      { element: 2 }
    ], options);
    assert.deepStrictEqual(list.length, 3);
    model.splice([0, 1], 1, void 0, options);
    assert.deepStrictEqual(list.length, 3);
    model.splice([0, 0], 2, void 0, options);
    assert.deepStrictEqual(list.length, 3);
    disposable.dispose();
  }));
  test("collapse", () => withSmartSplice((options) => {
    const list = [];
    const model = new IndexTreeModel("test", -1);
    const disposable = bindListToModel(list, model);
    model.splice([0], 0, [
      {
        element: 0,
        children: [
          { element: 10 },
          { element: 11 },
          { element: 12 }
        ]
      },
      { element: 1 },
      { element: 2 }
    ], options);
    assert.deepStrictEqual(list.length, 6);
    model.setCollapsed([0], true);
    assert.deepStrictEqual(list.length, 3);
    assert.deepStrictEqual(list[0].element, 0);
    assert.deepStrictEqual(list[0].collapsed, true);
    assert.deepStrictEqual(list[0].depth, 1);
    assert.deepStrictEqual(list[1].element, 1);
    assert.deepStrictEqual(list[1].collapsed, false);
    assert.deepStrictEqual(list[1].depth, 1);
    assert.deepStrictEqual(list[2].element, 2);
    assert.deepStrictEqual(list[2].collapsed, false);
    assert.deepStrictEqual(list[2].depth, 1);
    disposable.dispose();
  }));
  test("expand", () => withSmartSplice((options) => {
    const list = [];
    const model = new IndexTreeModel("test", -1);
    const disposable = bindListToModel(list, model);
    model.splice([0], 0, [
      {
        element: 0,
        collapsed: true,
        children: [
          { element: 10 },
          { element: 11 },
          { element: 12 }
        ]
      },
      { element: 1 },
      { element: 2 }
    ], options);
    assert.deepStrictEqual(list.length, 3);
    model.expandTo([0, 1]);
    assert.deepStrictEqual(list.length, 6);
    assert.deepStrictEqual(list[0].element, 0);
    assert.deepStrictEqual(list[0].collapsed, false);
    assert.deepStrictEqual(list[0].depth, 1);
    assert.deepStrictEqual(list[1].element, 10);
    assert.deepStrictEqual(list[1].collapsed, false);
    assert.deepStrictEqual(list[1].depth, 2);
    assert.deepStrictEqual(list[2].element, 11);
    assert.deepStrictEqual(list[2].collapsed, false);
    assert.deepStrictEqual(list[2].depth, 2);
    assert.deepStrictEqual(list[3].element, 12);
    assert.deepStrictEqual(list[3].collapsed, false);
    assert.deepStrictEqual(list[3].depth, 2);
    assert.deepStrictEqual(list[4].element, 1);
    assert.deepStrictEqual(list[4].collapsed, false);
    assert.deepStrictEqual(list[4].depth, 1);
    assert.deepStrictEqual(list[5].element, 2);
    assert.deepStrictEqual(list[5].collapsed, false);
    assert.deepStrictEqual(list[5].depth, 1);
    disposable.dispose();
  }));
  test("smart diff consistency", () => {
    const times = 500;
    const minEdits = 1;
    const maxEdits = 10;
    const maxInserts = 5;
    for (let i = 0; i < times; i++) {
      const list = [];
      const options = { diffIdentityProvider: { getId: (n) => String(n) } };
      const model = new IndexTreeModel("test", -1);
      const disposable = bindListToModel(list, model);
      const changes = [];
      const expected = [];
      let elementCounter = 0;
      for (let edits = Math.random() * (maxEdits - minEdits) + minEdits; edits > 0; edits--) {
        const spliceIndex = Math.floor(Math.random() * list.length);
        const deleteCount = Math.ceil(Math.random() * (list.length - spliceIndex));
        const insertCount = Math.floor(Math.random() * maxInserts + 1);
        const inserts = [];
        for (let i2 = 0; i2 < insertCount; i2++) {
          const element = elementCounter++;
          inserts.push({ element, children: [] });
        }
        if (Math.random() < 0.5) {
          const elements = list.slice(spliceIndex, spliceIndex + Math.floor(deleteCount / 2));
          inserts.push(...elements.map(({ element }) => ({ element, children: [] })));
        }
        model.splice([spliceIndex], deleteCount, inserts, options);
        expected.splice(spliceIndex, deleteCount, ...inserts.map((i2) => i2.element));
        const listElements = list.map((l) => l.element);
        changes.push(`splice(${spliceIndex}, ${deleteCount}, [${inserts.map((e) => e.element).join(", ")}]) -> ${listElements.join(", ")}`);
        assert.deepStrictEqual(expected, listElements, `Expected ${listElements.join(", ")} to equal ${expected.join(", ")}. Steps:

${changes.join("\n")}`);
      }
      disposable.dispose();
    }
  });
  test("collapse should recursively adjust visible count", () => {
    const list = [];
    const model = new IndexTreeModel("test", -1);
    const disposable = bindListToModel(list, model);
    model.splice([0], 0, [
      {
        element: 1,
        children: [
          {
            element: 11,
            children: [
              { element: 111 }
            ]
          }
        ]
      },
      {
        element: 2,
        children: [
          { element: 21 }
        ]
      }
    ]);
    assert.deepStrictEqual(list.length, 5);
    assert.deepStrictEqual(toArray(list), [1, 11, 111, 2, 21]);
    model.setCollapsed([0, 0], true);
    assert.deepStrictEqual(list.length, 4);
    assert.deepStrictEqual(toArray(list), [1, 11, 2, 21]);
    model.setCollapsed([1], true);
    assert.deepStrictEqual(list.length, 3);
    assert.deepStrictEqual(toArray(list), [1, 11, 2]);
    disposable.dispose();
  });
  test("setCollapsible", () => {
    const list = [];
    const model = new IndexTreeModel("test", -1);
    const disposable = bindListToModel(list, model);
    model.splice([0], 0, [
      {
        element: 0,
        children: [
          { element: 10 }
        ]
      }
    ]);
    assert.deepStrictEqual(list.length, 2);
    model.setCollapsible([0], false);
    assert.deepStrictEqual(list.length, 2);
    assert.deepStrictEqual(list[0].element, 0);
    assert.deepStrictEqual(list[0].collapsible, false);
    assert.deepStrictEqual(list[0].collapsed, false);
    assert.deepStrictEqual(list[1].element, 10);
    assert.deepStrictEqual(list[1].collapsible, false);
    assert.deepStrictEqual(list[1].collapsed, false);
    assert.deepStrictEqual(model.setCollapsed([0], true), false);
    assert.deepStrictEqual(list[0].element, 0);
    assert.deepStrictEqual(list[0].collapsible, false);
    assert.deepStrictEqual(list[0].collapsed, false);
    assert.deepStrictEqual(list[1].element, 10);
    assert.deepStrictEqual(list[1].collapsible, false);
    assert.deepStrictEqual(list[1].collapsed, false);
    assert.deepStrictEqual(model.setCollapsed([0], false), false);
    assert.deepStrictEqual(list[0].element, 0);
    assert.deepStrictEqual(list[0].collapsible, false);
    assert.deepStrictEqual(list[0].collapsed, false);
    assert.deepStrictEqual(list[1].element, 10);
    assert.deepStrictEqual(list[1].collapsible, false);
    assert.deepStrictEqual(list[1].collapsed, false);
    model.setCollapsible([0], true);
    assert.deepStrictEqual(list.length, 2);
    assert.deepStrictEqual(list[0].element, 0);
    assert.deepStrictEqual(list[0].collapsible, true);
    assert.deepStrictEqual(list[0].collapsed, false);
    assert.deepStrictEqual(list[1].element, 10);
    assert.deepStrictEqual(list[1].collapsible, false);
    assert.deepStrictEqual(list[1].collapsed, false);
    assert.deepStrictEqual(model.setCollapsed([0], true), true);
    assert.deepStrictEqual(list.length, 1);
    assert.deepStrictEqual(list[0].element, 0);
    assert.deepStrictEqual(list[0].collapsible, true);
    assert.deepStrictEqual(list[0].collapsed, true);
    assert.deepStrictEqual(model.setCollapsed([0], false), true);
    assert.deepStrictEqual(list[0].element, 0);
    assert.deepStrictEqual(list[0].collapsible, true);
    assert.deepStrictEqual(list[0].collapsed, false);
    assert.deepStrictEqual(list[1].element, 10);
    assert.deepStrictEqual(list[1].collapsible, false);
    assert.deepStrictEqual(list[1].collapsed, false);
    disposable.dispose();
  });
  test("simple filter", () => {
    const list = [];
    const filter = new class {
      filter(element) {
        return element % 2 === 0 ? TreeVisibility.Visible : TreeVisibility.Hidden;
      }
    }();
    const model = new IndexTreeModel("test", -1, { filter });
    const disposable = bindListToModel(list, model);
    model.splice([0], 0, [
      {
        element: 0,
        children: [
          { element: 1 },
          { element: 2 },
          { element: 3 },
          { element: 4 },
          { element: 5 },
          { element: 6 },
          { element: 7 }
        ]
      }
    ]);
    assert.deepStrictEqual(list.length, 4);
    assert.deepStrictEqual(toArray(list), [0, 2, 4, 6]);
    model.setCollapsed([0], true);
    assert.deepStrictEqual(toArray(list), [0]);
    model.setCollapsed([0], false);
    assert.deepStrictEqual(toArray(list), [0, 2, 4, 6]);
    disposable.dispose();
  });
  test("recursive filter on initial model", () => {
    const list = [];
    const filter = new class {
      filter(element) {
        return element === 0 ? TreeVisibility.Recurse : TreeVisibility.Hidden;
      }
    }();
    const model = new IndexTreeModel("test", -1, { filter });
    const disposable = bindListToModel(list, model);
    model.splice([0], 0, [
      {
        element: 0,
        children: [
          { element: 1 },
          { element: 2 }
        ]
      }
    ]);
    assert.deepStrictEqual(toArray(list), []);
    disposable.dispose();
  });
  test("refilter", () => {
    const list = [];
    let shouldFilter = false;
    const filter = new class {
      filter(element) {
        return !shouldFilter || element % 2 === 0 ? TreeVisibility.Visible : TreeVisibility.Hidden;
      }
    }();
    const model = new IndexTreeModel("test", -1, { filter });
    const disposable = bindListToModel(list, model);
    model.splice([0], 0, [
      {
        element: 0,
        children: [
          { element: 1 },
          { element: 2 },
          { element: 3 },
          { element: 4 },
          { element: 5 },
          { element: 6 },
          { element: 7 }
        ]
      }
    ]);
    assert.deepStrictEqual(toArray(list), [0, 1, 2, 3, 4, 5, 6, 7]);
    model.refilter();
    assert.deepStrictEqual(toArray(list), [0, 1, 2, 3, 4, 5, 6, 7]);
    shouldFilter = true;
    model.refilter();
    assert.deepStrictEqual(toArray(list), [0, 2, 4, 6]);
    shouldFilter = false;
    model.refilter();
    assert.deepStrictEqual(toArray(list), [0, 1, 2, 3, 4, 5, 6, 7]);
    disposable.dispose();
  });
  test("recursive filter", () => {
    const list = [];
    let query = new RegExp("");
    const filter = new class {
      filter(element) {
        return query.test(element) ? TreeVisibility.Visible : TreeVisibility.Recurse;
      }
    }();
    const model = new IndexTreeModel("test", "root", { filter });
    const disposable = bindListToModel(list, model);
    model.splice([0], 0, [
      {
        element: "vscode",
        children: [
          { element: ".build" },
          { element: "git" },
          {
            element: "github",
            children: [
              { element: "calendar.yml" },
              { element: "endgame" },
              { element: "build.js" }
            ]
          },
          {
            element: "build",
            children: [
              { element: "lib" },
              { element: "gulpfile.js" }
            ]
          }
        ]
      }
    ]);
    assert.deepStrictEqual(list.length, 10);
    query = /build/;
    model.refilter();
    assert.deepStrictEqual(toArray(list), ["vscode", ".build", "github", "build.js", "build"]);
    model.setCollapsed([0], true);
    assert.deepStrictEqual(toArray(list), ["vscode"]);
    model.setCollapsed([0], false);
    assert.deepStrictEqual(toArray(list), ["vscode", ".build", "github", "build.js", "build"]);
    disposable.dispose();
  });
  test("recursive filter updates when children change (#133272)", async () => {
    const list = [];
    let query = "";
    const filter = new class {
      filter(element) {
        return element.includes(query) ? TreeVisibility.Visible : TreeVisibility.Recurse;
      }
    }();
    const model = new IndexTreeModel("test", "root", { filter });
    const disposable = bindListToModel(list, model);
    model.splice([0], 0, [
      {
        element: "a",
        children: [
          { element: "b" }
        ]
      }
    ]);
    assert.deepStrictEqual(toArray(list), ["a", "b"]);
    query = "visible";
    model.refilter();
    assert.deepStrictEqual(toArray(list), []);
    model.splice([0, 0, 0], 0, [
      {
        element: "visible",
        children: []
      }
    ]);
    await timeout(0);
    assert.deepStrictEqual(toArray(list), ["a", "b", "visible"]);
    disposable.dispose();
  });
  test("recursive filter with collapse", () => {
    const list = [];
    let query = new RegExp("");
    const filter = new class {
      filter(element) {
        return query.test(element) ? TreeVisibility.Visible : TreeVisibility.Recurse;
      }
    }();
    const model = new IndexTreeModel("test", "root", { filter });
    const disposable = bindListToModel(list, model);
    model.splice([0], 0, [
      {
        element: "vscode",
        children: [
          { element: ".build" },
          { element: "git" },
          {
            element: "github",
            children: [
              { element: "calendar.yml" },
              { element: "endgame" },
              { element: "build.js" }
            ]
          },
          {
            element: "build",
            children: [
              { element: "lib" },
              { element: "gulpfile.js" }
            ]
          }
        ]
      }
    ]);
    assert.deepStrictEqual(list.length, 10);
    query = /gulp/;
    model.refilter();
    assert.deepStrictEqual(toArray(list), ["vscode", "build", "gulpfile.js"]);
    model.setCollapsed([0, 3], true);
    assert.deepStrictEqual(toArray(list), ["vscode", "build"]);
    model.setCollapsed([0], true);
    assert.deepStrictEqual(toArray(list), ["vscode"]);
    disposable.dispose();
  });
  test("recursive filter while collapsed", () => {
    const list = [];
    let query = new RegExp("");
    const filter = new class {
      filter(element) {
        return query.test(element) ? TreeVisibility.Visible : TreeVisibility.Recurse;
      }
    }();
    const model = new IndexTreeModel("test", "root", { filter });
    const disposable = bindListToModel(list, model);
    model.splice([0], 0, [
      {
        element: "vscode",
        collapsed: true,
        children: [
          { element: ".build" },
          { element: "git" },
          {
            element: "github",
            children: [
              { element: "calendar.yml" },
              { element: "endgame" },
              { element: "build.js" }
            ]
          },
          {
            element: "build",
            children: [
              { element: "lib" },
              { element: "gulpfile.js" }
            ]
          }
        ]
      }
    ]);
    assert.deepStrictEqual(toArray(list), ["vscode"]);
    query = /gulp/;
    model.refilter();
    assert.deepStrictEqual(toArray(list), ["vscode"]);
    model.setCollapsed([0], false);
    assert.deepStrictEqual(toArray(list), ["vscode", "build", "gulpfile.js"]);
    model.setCollapsed([0], true);
    assert.deepStrictEqual(toArray(list), ["vscode"]);
    query = new RegExp("");
    model.refilter();
    assert.deepStrictEqual(toArray(list), ["vscode"]);
    model.setCollapsed([0], false);
    assert.deepStrictEqual(list.length, 10);
    disposable.dispose();
  });
  suite("getNodeLocation", () => {
    test("simple", () => {
      const list = [];
      const model = new IndexTreeModel("test", -1);
      const disposable = bindListToModel(list, model);
      model.splice([0], 0, [
        {
          element: 0,
          children: [
            { element: 10 },
            { element: 11 },
            { element: 12 }
          ]
        },
        { element: 1 },
        { element: 2 }
      ]);
      assert.deepStrictEqual(model.getNodeLocation(list[0]), [0]);
      assert.deepStrictEqual(model.getNodeLocation(list[1]), [0, 0]);
      assert.deepStrictEqual(model.getNodeLocation(list[2]), [0, 1]);
      assert.deepStrictEqual(model.getNodeLocation(list[3]), [0, 2]);
      assert.deepStrictEqual(model.getNodeLocation(list[4]), [1]);
      assert.deepStrictEqual(model.getNodeLocation(list[5]), [2]);
      disposable.dispose();
    });
    test("with filter", () => {
      const list = [];
      const filter = new class {
        filter(element) {
          return element % 2 === 0 ? TreeVisibility.Visible : TreeVisibility.Hidden;
        }
      }();
      const model = new IndexTreeModel("test", -1, { filter });
      const disposable = bindListToModel(list, model);
      model.splice([0], 0, [
        {
          element: 0,
          children: [
            { element: 1 },
            { element: 2 },
            { element: 3 },
            { element: 4 },
            { element: 5 },
            { element: 6 },
            { element: 7 }
          ]
        }
      ]);
      assert.deepStrictEqual(model.getNodeLocation(list[0]), [0]);
      assert.deepStrictEqual(model.getNodeLocation(list[1]), [0, 1]);
      assert.deepStrictEqual(model.getNodeLocation(list[2]), [0, 3]);
      assert.deepStrictEqual(model.getNodeLocation(list[3]), [0, 5]);
      disposable.dispose();
    });
  });
  test("refilter with filtered out nodes", () => {
    const list = [];
    let query = new RegExp("");
    const filter = new class {
      filter(element) {
        return query.test(element);
      }
    }();
    const model = new IndexTreeModel("test", "root", { filter });
    const disposable = bindListToModel(list, model);
    model.splice([0], 0, [
      { element: "silver" },
      { element: "gold" },
      { element: "platinum" }
    ]);
    assert.deepStrictEqual(toArray(list), ["silver", "gold", "platinum"]);
    query = /platinum/;
    model.refilter();
    assert.deepStrictEqual(toArray(list), ["platinum"]);
    model.splice([0], Number.POSITIVE_INFINITY, [
      { element: "silver" },
      { element: "gold" },
      { element: "platinum" }
    ]);
    assert.deepStrictEqual(toArray(list), ["platinum"]);
    model.refilter();
    assert.deepStrictEqual(toArray(list), ["platinum"]);
    disposable.dispose();
  });
  test("explicit hidden nodes should have renderNodeCount == 0, issue #83211", () => {
    const list = [];
    let query = new RegExp("");
    const filter = new class {
      filter(element) {
        return query.test(element);
      }
    }();
    const model = new IndexTreeModel("test", "root", { filter });
    const disposable = bindListToModel(list, model);
    model.splice([0], 0, [
      { element: "a", children: [{ element: "aa" }] },
      { element: "b", children: [{ element: "bb" }] }
    ]);
    assert.deepStrictEqual(toArray(list), ["a", "aa", "b", "bb"]);
    assert.deepStrictEqual(model.getListIndex([0]), 0);
    assert.deepStrictEqual(model.getListIndex([0, 0]), 1);
    assert.deepStrictEqual(model.getListIndex([1]), 2);
    assert.deepStrictEqual(model.getListIndex([1, 0]), 3);
    query = /b/;
    model.refilter();
    assert.deepStrictEqual(toArray(list), ["b", "bb"]);
    assert.deepStrictEqual(model.getListIndex([0]), -1);
    assert.deepStrictEqual(model.getListIndex([0, 0]), -1);
    assert.deepStrictEqual(model.getListIndex([1]), 0);
    assert.deepStrictEqual(model.getListIndex([1, 0]), 1);
    disposable.dispose();
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxiYXNlXFx0ZXN0XFxicm93c2VyXFx1aVxcdHJlZVxcaW5kZXhUcmVlTW9kZWwudGVzdC50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCBhc3NlcnQgZnJvbSAnYXNzZXJ0JztcbmltcG9ydCB7IElJbmRleFRyZWVNb2RlbFNwbGljZU9wdGlvbnMsIElJbmRleFRyZWVOb2RlLCBJbmRleFRyZWVNb2RlbCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jyb3dzZXIvdWkvdHJlZS9pbmRleFRyZWVNb2RlbC5qcyc7XG5pbXBvcnQgeyBJVHJlZUVsZW1lbnQsIElUcmVlRmlsdGVyLCBJVHJlZU5vZGUsIFRyZWVWaXNpYmlsaXR5IH0gZnJvbSAnLi4vLi4vLi4vLi4vYnJvd3Nlci91aS90cmVlL3RyZWUuanMnO1xuaW1wb3J0IHsgdGltZW91dCB9IGZyb20gJy4uLy4uLy4uLy4uL2NvbW1vbi9hc3luYy5qcyc7XG5pbXBvcnQgeyBlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vdXRpbHMuanMnO1xuaW1wb3J0IHsgRGlzcG9zYWJsZVN0b3JlLCBJRGlzcG9zYWJsZSB9IGZyb20gJy4uLy4uLy4uLy4uL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuXG5mdW5jdGlvbiBiaW5kTGlzdFRvTW9kZWw8VD4obGlzdDogSVRyZWVOb2RlPFQ+W10sIG1vZGVsOiBJbmRleFRyZWVNb2RlbDxUPik6IElEaXNwb3NhYmxlIHtcblx0cmV0dXJuIG1vZGVsLm9uRGlkU3BsaWNlUmVuZGVyZWROb2RlcygoeyBzdGFydCwgZGVsZXRlQ291bnQsIGVsZW1lbnRzIH0pID0+IHtcblx0XHRsaXN0LnNwbGljZShzdGFydCwgZGVsZXRlQ291bnQsIC4uLmVsZW1lbnRzKTtcblx0fSk7XG59XG5cbmZ1bmN0aW9uIHRvQXJyYXk8VD4obGlzdDogSVRyZWVOb2RlPFQ+W10pOiBUW10ge1xuXHRyZXR1cm4gbGlzdC5tYXAoaSA9PiBpLmVsZW1lbnQpO1xufVxuXG5cbmZ1bmN0aW9uIHRvRWxlbWVudHM8VD4obm9kZTogSVRyZWVOb2RlPFQ+KTogYW55IHtcblx0cmV0dXJuIG5vZGUuY2hpbGRyZW4/Lmxlbmd0aCA/IHsgZTogbm9kZS5lbGVtZW50LCBjaGlsZHJlbjogbm9kZS5jaGlsZHJlbi5tYXAodG9FbGVtZW50cykgfSA6IG5vZGUuZWxlbWVudDtcbn1cblxuY29uc3QgZGlmZklkZW50aXR5UHJvdmlkZXIgPSB7IGdldElkOiAobjogbnVtYmVyKSA9PiBTdHJpbmcobikgfTtcblxuLyoqXG4gKiBDYWxscyB0aGF0IHRlc3QgZnVuY3Rpb24gdHdpY2UsIG9uY2Ugd2l0aCBhbiBlbXB0eSBvcHRpb25zIGFuZFxuICogb25jZSB3aXRoIGBkaWZmSWRlbnRpdHlQcm92aWRlcmAuXG4gKi9cbmZ1bmN0aW9uIHdpdGhTbWFydFNwbGljZShmbjogKG9wdGlvbnM6IElJbmRleFRyZWVNb2RlbFNwbGljZU9wdGlvbnM8bnVtYmVyLCBhbnk+KSA9PiB2b2lkKSB7XG5cdGZuKHt9KTtcblx0Zm4oeyBkaWZmSWRlbnRpdHlQcm92aWRlciB9KTtcbn1cblxuc3VpdGUoJ0luZGV4VHJlZU1vZGVsJywgKCkgPT4ge1xuXG5cdGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSgpO1xuXG5cdGNvbnN0IGRpc3Bvc2FibGVzID0gbmV3IERpc3Bvc2FibGVTdG9yZSgpO1xuXHR0ZWFyZG93bigoKSA9PiB7XG5cdFx0ZGlzcG9zYWJsZXMuY2xlYXIoKTtcblx0fSk7XG5cblx0dGVzdCgnY3RvcicsICgpID0+IHtcblx0XHRjb25zdCBsaXN0OiBJVHJlZU5vZGU8bnVtYmVyPltdID0gW107XG5cdFx0Y29uc3QgbW9kZWwgPSBuZXcgSW5kZXhUcmVlTW9kZWw8bnVtYmVyPigndGVzdCcsIC0xKTtcblx0XHRhc3NlcnQobW9kZWwpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChsaXN0Lmxlbmd0aCwgMCk7XG5cdH0pO1xuXG5cdHRlc3QoJ2luc2VydCcsICgpID0+IHdpdGhTbWFydFNwbGljZShvcHRpb25zID0+IHtcblx0XHRjb25zdCBsaXN0OiBJVHJlZU5vZGU8bnVtYmVyPltdID0gW107XG5cdFx0Y29uc3QgbW9kZWwgPSBuZXcgSW5kZXhUcmVlTW9kZWw8bnVtYmVyPigndGVzdCcsIC0xKTtcblx0XHRjb25zdCBkaXNwb3NhYmxlID0gYmluZExpc3RUb01vZGVsKGxpc3QsIG1vZGVsKTtcblxuXHRcdG1vZGVsLnNwbGljZShbMF0sIDAsIFtcblx0XHRcdHsgZWxlbWVudDogMCB9LFxuXHRcdFx0eyBlbGVtZW50OiAxIH0sXG5cdFx0XHR7IGVsZW1lbnQ6IDIgfVxuXHRcdF0sIG9wdGlvbnMpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChsaXN0Lmxlbmd0aCwgMyk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChsaXN0WzBdLmVsZW1lbnQsIDApO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwobGlzdFswXS5jb2xsYXBzZWQsIGZhbHNlKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGxpc3RbMF0uZGVwdGgsIDEpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwobGlzdFsxXS5lbGVtZW50LCAxKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGxpc3RbMV0uY29sbGFwc2VkLCBmYWxzZSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChsaXN0WzFdLmRlcHRoLCAxKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGxpc3RbMl0uZWxlbWVudCwgMik7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChsaXN0WzJdLmNvbGxhcHNlZCwgZmFsc2UpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwobGlzdFsyXS5kZXB0aCwgMSk7XG5cblx0XHRkaXNwb3NhYmxlLmRpc3Bvc2UoKTtcblx0fSkpO1xuXG5cdHRlc3QoJ2RlZXAgaW5zZXJ0JywgKCkgPT4gd2l0aFNtYXJ0U3BsaWNlKG9wdGlvbnMgPT4ge1xuXHRcdGNvbnN0IGxpc3Q6IElUcmVlTm9kZTxudW1iZXI+W10gPSBbXTtcblx0XHRjb25zdCBtb2RlbCA9IG5ldyBJbmRleFRyZWVNb2RlbDxudW1iZXI+KCd0ZXN0JywgLTEpO1xuXHRcdGNvbnN0IGRpc3Bvc2FibGUgPSBiaW5kTGlzdFRvTW9kZWwobGlzdCwgbW9kZWwpO1xuXG5cdFx0bW9kZWwuc3BsaWNlKFswXSwgMCwgW1xuXHRcdFx0e1xuXHRcdFx0XHRlbGVtZW50OiAwLCBjaGlsZHJlbjogW1xuXHRcdFx0XHRcdHsgZWxlbWVudDogMTAgfSxcblx0XHRcdFx0XHR7IGVsZW1lbnQ6IDExIH0sXG5cdFx0XHRcdFx0eyBlbGVtZW50OiAxMiB9LFxuXHRcdFx0XHRdXG5cdFx0XHR9LFxuXHRcdFx0eyBlbGVtZW50OiAxIH0sXG5cdFx0XHR7IGVsZW1lbnQ6IDIgfVxuXHRcdF0pO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChsaXN0Lmxlbmd0aCwgNik7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChsaXN0WzBdLmVsZW1lbnQsIDApO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwobGlzdFswXS5jb2xsYXBzZWQsIGZhbHNlKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGxpc3RbMF0uZGVwdGgsIDEpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwobGlzdFsxXS5lbGVtZW50LCAxMCk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChsaXN0WzFdLmNvbGxhcHNlZCwgZmFsc2UpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwobGlzdFsxXS5kZXB0aCwgMik7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChsaXN0WzJdLmVsZW1lbnQsIDExKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGxpc3RbMl0uY29sbGFwc2VkLCBmYWxzZSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChsaXN0WzJdLmRlcHRoLCAyKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGxpc3RbM10uZWxlbWVudCwgMTIpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwobGlzdFszXS5jb2xsYXBzZWQsIGZhbHNlKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGxpc3RbM10uZGVwdGgsIDIpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwobGlzdFs0XS5lbGVtZW50LCAxKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGxpc3RbNF0uY29sbGFwc2VkLCBmYWxzZSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChsaXN0WzRdLmRlcHRoLCAxKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGxpc3RbNV0uZWxlbWVudCwgMik7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChsaXN0WzVdLmNvbGxhcHNlZCwgZmFsc2UpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwobGlzdFs1XS5kZXB0aCwgMSk7XG5cblx0XHRkaXNwb3NhYmxlLmRpc3Bvc2UoKTtcblx0fSkpO1xuXG5cdHRlc3QoJ2RlZXAgaW5zZXJ0IGNvbGxhcHNlZCcsICgpID0+IHdpdGhTbWFydFNwbGljZShvcHRpb25zID0+IHtcblx0XHRjb25zdCBsaXN0OiBJVHJlZU5vZGU8bnVtYmVyPltdID0gW107XG5cdFx0Y29uc3QgbW9kZWwgPSBuZXcgSW5kZXhUcmVlTW9kZWw8bnVtYmVyPigndGVzdCcsIC0xKTtcblx0XHRjb25zdCBkaXNwb3NhYmxlID0gYmluZExpc3RUb01vZGVsKGxpc3QsIG1vZGVsKTtcblxuXHRcdG1vZGVsLnNwbGljZShbMF0sIDAsIFtcblx0XHRcdHtcblx0XHRcdFx0ZWxlbWVudDogMCwgY29sbGFwc2VkOiB0cnVlLCBjaGlsZHJlbjogW1xuXHRcdFx0XHRcdHsgZWxlbWVudDogMTAgfSxcblx0XHRcdFx0XHR7IGVsZW1lbnQ6IDExIH0sXG5cdFx0XHRcdFx0eyBlbGVtZW50OiAxMiB9LFxuXHRcdFx0XHRdXG5cdFx0XHR9LFxuXHRcdFx0eyBlbGVtZW50OiAxIH0sXG5cdFx0XHR7IGVsZW1lbnQ6IDIgfVxuXHRcdF0sIG9wdGlvbnMpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChsaXN0Lmxlbmd0aCwgMyk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChsaXN0WzBdLmVsZW1lbnQsIDApO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwobGlzdFswXS5jb2xsYXBzZWQsIHRydWUpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwobGlzdFswXS5kZXB0aCwgMSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChsaXN0WzFdLmVsZW1lbnQsIDEpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwobGlzdFsxXS5jb2xsYXBzZWQsIGZhbHNlKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGxpc3RbMV0uZGVwdGgsIDEpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwobGlzdFsyXS5lbGVtZW50LCAyKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGxpc3RbMl0uY29sbGFwc2VkLCBmYWxzZSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChsaXN0WzJdLmRlcHRoLCAxKTtcblxuXHRcdGRpc3Bvc2FibGUuZGlzcG9zZSgpO1xuXHR9KSk7XG5cblx0dGVzdCgnZGVsZXRlJywgKCkgPT4gd2l0aFNtYXJ0U3BsaWNlKG9wdGlvbnMgPT4ge1xuXHRcdGNvbnN0IGxpc3Q6IElUcmVlTm9kZTxudW1iZXI+W10gPSBbXTtcblx0XHRjb25zdCBtb2RlbCA9IG5ldyBJbmRleFRyZWVNb2RlbDxudW1iZXI+KCd0ZXN0JywgLTEpO1xuXHRcdGNvbnN0IGRpc3Bvc2FibGUgPSBiaW5kTGlzdFRvTW9kZWwobGlzdCwgbW9kZWwpO1xuXG5cdFx0bW9kZWwuc3BsaWNlKFswXSwgMCwgW1xuXHRcdFx0eyBlbGVtZW50OiAwIH0sXG5cdFx0XHR7IGVsZW1lbnQ6IDEgfSxcblx0XHRcdHsgZWxlbWVudDogMiB9XG5cdFx0XSwgb3B0aW9ucyk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGxpc3QubGVuZ3RoLCAzKTtcblxuXHRcdG1vZGVsLnNwbGljZShbMV0sIDEsIHVuZGVmaW5lZCwgb3B0aW9ucyk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChsaXN0Lmxlbmd0aCwgMik7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChsaXN0WzBdLmVsZW1lbnQsIDApO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwobGlzdFswXS5jb2xsYXBzZWQsIGZhbHNlKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGxpc3RbMF0uZGVwdGgsIDEpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwobGlzdFsxXS5lbGVtZW50LCAyKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGxpc3RbMV0uY29sbGFwc2VkLCBmYWxzZSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChsaXN0WzFdLmRlcHRoLCAxKTtcblxuXHRcdG1vZGVsLnNwbGljZShbMF0sIDIsIHVuZGVmaW5lZCwgb3B0aW9ucyk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChsaXN0Lmxlbmd0aCwgMCk7XG5cblx0XHRkaXNwb3NhYmxlLmRpc3Bvc2UoKTtcblx0fSkpO1xuXG5cdHRlc3QoJ25lc3RlZCBkZWxldGUnLCAoKSA9PiB3aXRoU21hcnRTcGxpY2Uob3B0aW9ucyA9PiB7XG5cdFx0Y29uc3QgbGlzdDogSVRyZWVOb2RlPG51bWJlcj5bXSA9IFtdO1xuXHRcdGNvbnN0IG1vZGVsID0gbmV3IEluZGV4VHJlZU1vZGVsPG51bWJlcj4oJ3Rlc3QnLCAtMSk7XG5cdFx0Y29uc3QgZGlzcG9zYWJsZSA9IGJpbmRMaXN0VG9Nb2RlbChsaXN0LCBtb2RlbCk7XG5cblx0XHRtb2RlbC5zcGxpY2UoWzBdLCAwLCBbXG5cdFx0XHR7XG5cdFx0XHRcdGVsZW1lbnQ6IDAsIGNoaWxkcmVuOiBbXG5cdFx0XHRcdFx0eyBlbGVtZW50OiAxMCB9LFxuXHRcdFx0XHRcdHsgZWxlbWVudDogMTEgfSxcblx0XHRcdFx0XHR7IGVsZW1lbnQ6IDEyIH0sXG5cdFx0XHRcdF1cblx0XHRcdH0sXG5cdFx0XHR7IGVsZW1lbnQ6IDEgfSxcblx0XHRcdHsgZWxlbWVudDogMiB9XG5cdFx0XSwgb3B0aW9ucyk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGxpc3QubGVuZ3RoLCA2KTtcblxuXHRcdG1vZGVsLnNwbGljZShbMV0sIDIsIHVuZGVmaW5lZCwgb3B0aW9ucyk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChsaXN0Lmxlbmd0aCwgNCk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChsaXN0WzBdLmVsZW1lbnQsIDApO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwobGlzdFswXS5jb2xsYXBzZWQsIGZhbHNlKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGxpc3RbMF0uZGVwdGgsIDEpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwobGlzdFsxXS5lbGVtZW50LCAxMCk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChsaXN0WzFdLmNvbGxhcHNlZCwgZmFsc2UpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwobGlzdFsxXS5kZXB0aCwgMik7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChsaXN0WzJdLmVsZW1lbnQsIDExKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGxpc3RbMl0uY29sbGFwc2VkLCBmYWxzZSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChsaXN0WzJdLmRlcHRoLCAyKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGxpc3RbM10uZWxlbWVudCwgMTIpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwobGlzdFszXS5jb2xsYXBzZWQsIGZhbHNlKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGxpc3RbM10uZGVwdGgsIDIpO1xuXG5cdFx0ZGlzcG9zYWJsZS5kaXNwb3NlKCk7XG5cdH0pKTtcblxuXHR0ZXN0KCdkZWVwIGRlbGV0ZScsICgpID0+IHdpdGhTbWFydFNwbGljZShvcHRpb25zID0+IHtcblx0XHRjb25zdCBsaXN0OiBJVHJlZU5vZGU8bnVtYmVyPltdID0gW107XG5cdFx0Y29uc3QgbW9kZWwgPSBuZXcgSW5kZXhUcmVlTW9kZWw8bnVtYmVyPigndGVzdCcsIC0xKTtcblx0XHRjb25zdCBkaXNwb3NhYmxlID0gYmluZExpc3RUb01vZGVsKGxpc3QsIG1vZGVsKTtcblxuXHRcdG1vZGVsLnNwbGljZShbMF0sIDAsIFtcblx0XHRcdHtcblx0XHRcdFx0ZWxlbWVudDogMCwgY2hpbGRyZW46IFtcblx0XHRcdFx0XHR7IGVsZW1lbnQ6IDEwIH0sXG5cdFx0XHRcdFx0eyBlbGVtZW50OiAxMSB9LFxuXHRcdFx0XHRcdHsgZWxlbWVudDogMTIgfSxcblx0XHRcdFx0XVxuXHRcdFx0fSxcblx0XHRcdHsgZWxlbWVudDogMSB9LFxuXHRcdFx0eyBlbGVtZW50OiAyIH1cblx0XHRdLCBvcHRpb25zKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwobGlzdC5sZW5ndGgsIDYpO1xuXG5cdFx0bW9kZWwuc3BsaWNlKFswXSwgMSwgdW5kZWZpbmVkLCBvcHRpb25zKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGxpc3QubGVuZ3RoLCAyKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGxpc3RbMF0uZWxlbWVudCwgMSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChsaXN0WzBdLmNvbGxhcHNlZCwgZmFsc2UpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwobGlzdFswXS5kZXB0aCwgMSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChsaXN0WzFdLmVsZW1lbnQsIDIpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwobGlzdFsxXS5jb2xsYXBzZWQsIGZhbHNlKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGxpc3RbMV0uZGVwdGgsIDEpO1xuXG5cdFx0ZGlzcG9zYWJsZS5kaXNwb3NlKCk7XG5cdH0pKTtcblxuXHR0ZXN0KCdzbWFydCBzcGxpY2UgZGVlcCcsICgpID0+IHtcblx0XHRjb25zdCBsaXN0OiBJVHJlZU5vZGU8bnVtYmVyPltdID0gW107XG5cdFx0Y29uc3QgbW9kZWwgPSBuZXcgSW5kZXhUcmVlTW9kZWw8bnVtYmVyPigndGVzdCcsIC0xKTtcblx0XHRjb25zdCBkaXNwb3NhYmxlID0gYmluZExpc3RUb01vZGVsKGxpc3QsIG1vZGVsKTtcblxuXHRcdG1vZGVsLnNwbGljZShbMF0sIDAsIFtcblx0XHRcdHsgZWxlbWVudDogMCB9LFxuXHRcdFx0eyBlbGVtZW50OiAxIH0sXG5cdFx0XHR7IGVsZW1lbnQ6IDIgfSxcblx0XHRcdHsgZWxlbWVudDogMyB9LFxuXHRcdF0sIHsgZGlmZklkZW50aXR5UHJvdmlkZXIgfSk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGxpc3QuZmlsdGVyKGwgPT4gbC5kZXB0aCA9PT0gMSkubWFwKHRvRWxlbWVudHMpLCBbXG5cdFx0XHQwLFxuXHRcdFx0MSxcblx0XHRcdDIsXG5cdFx0XHQzLFxuXHRcdF0pO1xuXG5cdFx0bW9kZWwuc3BsaWNlKFswXSwgMywgW1xuXHRcdFx0eyBlbGVtZW50OiAtMC41IH0sXG5cdFx0XHR7IGVsZW1lbnQ6IDAsIGNoaWxkcmVuOiBbeyBlbGVtZW50OiAwLjEgfV0gfSxcblx0XHRcdHsgZWxlbWVudDogMSB9LFxuXHRcdFx0eyBlbGVtZW50OiAyLCBjaGlsZHJlbjogW3sgZWxlbWVudDogMi4xIH0sIHsgZWxlbWVudDogMi4yLCBjaGlsZHJlbjogW3sgZWxlbWVudDogMi4yMSB9XSB9XSB9LFxuXHRcdF0sIHsgZGlmZklkZW50aXR5UHJvdmlkZXIsIGRpZmZEZXB0aDogSW5maW5pdHkgfSk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGxpc3QuZmlsdGVyKGwgPT4gbC5kZXB0aCA9PT0gMSkubWFwKHRvRWxlbWVudHMpLCBbXG5cdFx0XHQtMC41LFxuXHRcdFx0eyBlOiAwLCBjaGlsZHJlbjogWzAuMV0gfSxcblx0XHRcdDEsXG5cdFx0XHR7IGU6IDIsIGNoaWxkcmVuOiBbMi4xLCB7IGU6IDIuMiwgY2hpbGRyZW46IFsyLjIxXSB9XSB9LFxuXHRcdFx0Myxcblx0XHRdKTtcblxuXHRcdGRpc3Bvc2FibGUuZGlzcG9zZSgpO1xuXHR9KTtcblxuXHR0ZXN0KCdoaWRkZW4gZGVsZXRlJywgKCkgPT4gd2l0aFNtYXJ0U3BsaWNlKG9wdGlvbnMgPT4ge1xuXHRcdGNvbnN0IGxpc3Q6IElUcmVlTm9kZTxudW1iZXI+W10gPSBbXTtcblx0XHRjb25zdCBtb2RlbCA9IG5ldyBJbmRleFRyZWVNb2RlbDxudW1iZXI+KCd0ZXN0JywgLTEpO1xuXHRcdGNvbnN0IGRpc3Bvc2FibGUgPSBiaW5kTGlzdFRvTW9kZWwobGlzdCwgbW9kZWwpO1xuXG5cdFx0bW9kZWwuc3BsaWNlKFswXSwgMCwgW1xuXHRcdFx0e1xuXHRcdFx0XHRlbGVtZW50OiAwLCBjb2xsYXBzZWQ6IHRydWUsIGNoaWxkcmVuOiBbXG5cdFx0XHRcdFx0eyBlbGVtZW50OiAxMCB9LFxuXHRcdFx0XHRcdHsgZWxlbWVudDogMTEgfSxcblx0XHRcdFx0XHR7IGVsZW1lbnQ6IDEyIH0sXG5cdFx0XHRcdF1cblx0XHRcdH0sXG5cdFx0XHR7IGVsZW1lbnQ6IDEgfSxcblx0XHRcdHsgZWxlbWVudDogMiB9XG5cdFx0XSwgb3B0aW9ucyk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGxpc3QubGVuZ3RoLCAzKTtcblxuXHRcdG1vZGVsLnNwbGljZShbMCwgMV0sIDEsIHVuZGVmaW5lZCwgb3B0aW9ucyk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChsaXN0Lmxlbmd0aCwgMyk7XG5cblx0XHRtb2RlbC5zcGxpY2UoWzAsIDBdLCAyLCB1bmRlZmluZWQsIG9wdGlvbnMpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwobGlzdC5sZW5ndGgsIDMpO1xuXG5cdFx0ZGlzcG9zYWJsZS5kaXNwb3NlKCk7XG5cdH0pKTtcblxuXHR0ZXN0KCdjb2xsYXBzZScsICgpID0+IHdpdGhTbWFydFNwbGljZShvcHRpb25zID0+IHtcblx0XHRjb25zdCBsaXN0OiBJVHJlZU5vZGU8bnVtYmVyPltdID0gW107XG5cdFx0Y29uc3QgbW9kZWwgPSBuZXcgSW5kZXhUcmVlTW9kZWw8bnVtYmVyPigndGVzdCcsIC0xKTtcblx0XHRjb25zdCBkaXNwb3NhYmxlID0gYmluZExpc3RUb01vZGVsKGxpc3QsIG1vZGVsKTtcblxuXHRcdG1vZGVsLnNwbGljZShbMF0sIDAsIFtcblx0XHRcdHtcblx0XHRcdFx0ZWxlbWVudDogMCwgY2hpbGRyZW46IFtcblx0XHRcdFx0XHR7IGVsZW1lbnQ6IDEwIH0sXG5cdFx0XHRcdFx0eyBlbGVtZW50OiAxMSB9LFxuXHRcdFx0XHRcdHsgZWxlbWVudDogMTIgfSxcblx0XHRcdFx0XVxuXHRcdFx0fSxcblx0XHRcdHsgZWxlbWVudDogMSB9LFxuXHRcdFx0eyBlbGVtZW50OiAyIH1cblx0XHRdLCBvcHRpb25zKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwobGlzdC5sZW5ndGgsIDYpO1xuXG5cdFx0bW9kZWwuc2V0Q29sbGFwc2VkKFswXSwgdHJ1ZSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChsaXN0Lmxlbmd0aCwgMyk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChsaXN0WzBdLmVsZW1lbnQsIDApO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwobGlzdFswXS5jb2xsYXBzZWQsIHRydWUpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwobGlzdFswXS5kZXB0aCwgMSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChsaXN0WzFdLmVsZW1lbnQsIDEpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwobGlzdFsxXS5jb2xsYXBzZWQsIGZhbHNlKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGxpc3RbMV0uZGVwdGgsIDEpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwobGlzdFsyXS5lbGVtZW50LCAyKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGxpc3RbMl0uY29sbGFwc2VkLCBmYWxzZSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChsaXN0WzJdLmRlcHRoLCAxKTtcblxuXHRcdGRpc3Bvc2FibGUuZGlzcG9zZSgpO1xuXHR9KSk7XG5cblx0dGVzdCgnZXhwYW5kJywgKCkgPT4gd2l0aFNtYXJ0U3BsaWNlKG9wdGlvbnMgPT4ge1xuXHRcdGNvbnN0IGxpc3Q6IElUcmVlTm9kZTxudW1iZXI+W10gPSBbXTtcblx0XHRjb25zdCBtb2RlbCA9IG5ldyBJbmRleFRyZWVNb2RlbDxudW1iZXI+KCd0ZXN0JywgLTEpO1xuXHRcdGNvbnN0IGRpc3Bvc2FibGUgPSBiaW5kTGlzdFRvTW9kZWwobGlzdCwgbW9kZWwpO1xuXG5cdFx0bW9kZWwuc3BsaWNlKFswXSwgMCwgW1xuXHRcdFx0e1xuXHRcdFx0XHRlbGVtZW50OiAwLCBjb2xsYXBzZWQ6IHRydWUsIGNoaWxkcmVuOiBbXG5cdFx0XHRcdFx0eyBlbGVtZW50OiAxMCB9LFxuXHRcdFx0XHRcdHsgZWxlbWVudDogMTEgfSxcblx0XHRcdFx0XHR7IGVsZW1lbnQ6IDEyIH0sXG5cdFx0XHRcdF1cblx0XHRcdH0sXG5cdFx0XHR7IGVsZW1lbnQ6IDEgfSxcblx0XHRcdHsgZWxlbWVudDogMiB9XG5cdFx0XSwgb3B0aW9ucyk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGxpc3QubGVuZ3RoLCAzKTtcblxuXHRcdG1vZGVsLmV4cGFuZFRvKFswLCAxXSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChsaXN0Lmxlbmd0aCwgNik7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChsaXN0WzBdLmVsZW1lbnQsIDApO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwobGlzdFswXS5jb2xsYXBzZWQsIGZhbHNlKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGxpc3RbMF0uZGVwdGgsIDEpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwobGlzdFsxXS5lbGVtZW50LCAxMCk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChsaXN0WzFdLmNvbGxhcHNlZCwgZmFsc2UpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwobGlzdFsxXS5kZXB0aCwgMik7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChsaXN0WzJdLmVsZW1lbnQsIDExKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGxpc3RbMl0uY29sbGFwc2VkLCBmYWxzZSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChsaXN0WzJdLmRlcHRoLCAyKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGxpc3RbM10uZWxlbWVudCwgMTIpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwobGlzdFszXS5jb2xsYXBzZWQsIGZhbHNlKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGxpc3RbM10uZGVwdGgsIDIpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwobGlzdFs0XS5lbGVtZW50LCAxKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGxpc3RbNF0uY29sbGFwc2VkLCBmYWxzZSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChsaXN0WzRdLmRlcHRoLCAxKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGxpc3RbNV0uZWxlbWVudCwgMik7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChsaXN0WzVdLmNvbGxhcHNlZCwgZmFsc2UpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwobGlzdFs1XS5kZXB0aCwgMSk7XG5cblx0XHRkaXNwb3NhYmxlLmRpc3Bvc2UoKTtcblx0fSkpO1xuXG5cdHRlc3QoJ3NtYXJ0IGRpZmYgY29uc2lzdGVuY3knLCAoKSA9PiB7XG5cdFx0Y29uc3QgdGltZXMgPSA1MDA7XG5cdFx0Y29uc3QgbWluRWRpdHMgPSAxO1xuXHRcdGNvbnN0IG1heEVkaXRzID0gMTA7XG5cdFx0Y29uc3QgbWF4SW5zZXJ0cyA9IDU7XG5cblx0XHRmb3IgKGxldCBpID0gMDsgaSA8IHRpbWVzOyBpKyspIHtcblx0XHRcdGNvbnN0IGxpc3Q6IElUcmVlTm9kZTxudW1iZXI+W10gPSBbXTtcblx0XHRcdGNvbnN0IG9wdGlvbnMgPSB7IGRpZmZJZGVudGl0eVByb3ZpZGVyOiB7IGdldElkOiAobjogbnVtYmVyKSA9PiBTdHJpbmcobikgfSB9O1xuXHRcdFx0Y29uc3QgbW9kZWwgPSBuZXcgSW5kZXhUcmVlTW9kZWw8bnVtYmVyPigndGVzdCcsIC0xKTtcblx0XHRcdGNvbnN0IGRpc3Bvc2FibGUgPSBiaW5kTGlzdFRvTW9kZWwobGlzdCwgbW9kZWwpO1xuXG5cdFx0XHRjb25zdCBjaGFuZ2VzID0gW107XG5cdFx0XHRjb25zdCBleHBlY3RlZDogbnVtYmVyW10gPSBbXTtcblx0XHRcdGxldCBlbGVtZW50Q291bnRlciA9IDA7XG5cblx0XHRcdGZvciAobGV0IGVkaXRzID0gTWF0aC5yYW5kb20oKSAqIChtYXhFZGl0cyAtIG1pbkVkaXRzKSArIG1pbkVkaXRzOyBlZGl0cyA+IDA7IGVkaXRzLS0pIHtcblx0XHRcdFx0Y29uc3Qgc3BsaWNlSW5kZXggPSBNYXRoLmZsb29yKE1hdGgucmFuZG9tKCkgKiBsaXN0Lmxlbmd0aCk7XG5cdFx0XHRcdGNvbnN0IGRlbGV0ZUNvdW50ID0gTWF0aC5jZWlsKE1hdGgucmFuZG9tKCkgKiAobGlzdC5sZW5ndGggLSBzcGxpY2VJbmRleCkpO1xuXHRcdFx0XHRjb25zdCBpbnNlcnRDb3VudCA9IE1hdGguZmxvb3IoTWF0aC5yYW5kb20oKSAqIG1heEluc2VydHMgKyAxKTtcblxuXHRcdFx0XHRjb25zdCBpbnNlcnRzOiBJVHJlZUVsZW1lbnQ8bnVtYmVyPltdID0gW107XG5cdFx0XHRcdGZvciAobGV0IGkgPSAwOyBpIDwgaW5zZXJ0Q291bnQ7IGkrKykge1xuXHRcdFx0XHRcdGNvbnN0IGVsZW1lbnQgPSBlbGVtZW50Q291bnRlcisrO1xuXHRcdFx0XHRcdGluc2VydHMucHVzaCh7IGVsZW1lbnQsIGNoaWxkcmVuOiBbXSB9KTtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdC8vIG1vdmUgZXhpc3RpbmcgaXRlbXNcblx0XHRcdFx0aWYgKE1hdGgucmFuZG9tKCkgPCAwLjUpIHtcblx0XHRcdFx0XHRjb25zdCBlbGVtZW50cyA9IGxpc3Quc2xpY2Uoc3BsaWNlSW5kZXgsIHNwbGljZUluZGV4ICsgTWF0aC5mbG9vcihkZWxldGVDb3VudCAvIDIpKTtcblx0XHRcdFx0XHRpbnNlcnRzLnB1c2goLi4uZWxlbWVudHMubWFwKCh7IGVsZW1lbnQgfSkgPT4gKHsgZWxlbWVudCwgY2hpbGRyZW46IFtdIH0pKSk7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRtb2RlbC5zcGxpY2UoW3NwbGljZUluZGV4XSwgZGVsZXRlQ291bnQsIGluc2VydHMsIG9wdGlvbnMpO1xuXHRcdFx0XHRleHBlY3RlZC5zcGxpY2Uoc3BsaWNlSW5kZXgsIGRlbGV0ZUNvdW50LCAuLi5pbnNlcnRzLm1hcChpID0+IGkuZWxlbWVudCkpO1xuXG5cdFx0XHRcdGNvbnN0IGxpc3RFbGVtZW50cyA9IGxpc3QubWFwKGwgPT4gbC5lbGVtZW50KTtcblx0XHRcdFx0Y2hhbmdlcy5wdXNoKGBzcGxpY2UoJHtzcGxpY2VJbmRleH0sICR7ZGVsZXRlQ291bnR9LCBbJHtpbnNlcnRzLm1hcChlID0+IGUuZWxlbWVudCkuam9pbignLCAnKX1dKSAtPiAke2xpc3RFbGVtZW50cy5qb2luKCcsICcpfWApO1xuXG5cdFx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoZXhwZWN0ZWQsIGxpc3RFbGVtZW50cywgYEV4cGVjdGVkICR7bGlzdEVsZW1lbnRzLmpvaW4oJywgJyl9IHRvIGVxdWFsICR7ZXhwZWN0ZWQuam9pbignLCAnKX0uIFN0ZXBzOlxcblxcbiR7Y2hhbmdlcy5qb2luKCdcXG4nKX1gKTtcblx0XHRcdH1cblxuXHRcdFx0ZGlzcG9zYWJsZS5kaXNwb3NlKCk7XG5cdFx0fVxuXHR9KTtcblxuXHR0ZXN0KCdjb2xsYXBzZSBzaG91bGQgcmVjdXJzaXZlbHkgYWRqdXN0IHZpc2libGUgY291bnQnLCAoKSA9PiB7XG5cdFx0Y29uc3QgbGlzdDogSVRyZWVOb2RlPG51bWJlcj5bXSA9IFtdO1xuXHRcdGNvbnN0IG1vZGVsID0gbmV3IEluZGV4VHJlZU1vZGVsPG51bWJlcj4oJ3Rlc3QnLCAtMSk7XG5cdFx0Y29uc3QgZGlzcG9zYWJsZSA9IGJpbmRMaXN0VG9Nb2RlbChsaXN0LCBtb2RlbCk7XG5cblx0XHRtb2RlbC5zcGxpY2UoWzBdLCAwLCBbXG5cdFx0XHR7XG5cdFx0XHRcdGVsZW1lbnQ6IDEsIGNoaWxkcmVuOiBbXG5cdFx0XHRcdFx0e1xuXHRcdFx0XHRcdFx0ZWxlbWVudDogMTEsIGNoaWxkcmVuOiBbXG5cdFx0XHRcdFx0XHRcdHsgZWxlbWVudDogMTExIH1cblx0XHRcdFx0XHRcdF1cblx0XHRcdFx0XHR9XG5cdFx0XHRcdF1cblx0XHRcdH0sXG5cdFx0XHR7XG5cdFx0XHRcdGVsZW1lbnQ6IDIsIGNoaWxkcmVuOiBbXG5cdFx0XHRcdFx0eyBlbGVtZW50OiAyMSB9XG5cdFx0XHRcdF1cblx0XHRcdH1cblx0XHRdKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwobGlzdC5sZW5ndGgsIDUpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwodG9BcnJheShsaXN0KSwgWzEsIDExLCAxMTEsIDIsIDIxXSk7XG5cblx0XHRtb2RlbC5zZXRDb2xsYXBzZWQoWzAsIDBdLCB0cnVlKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGxpc3QubGVuZ3RoLCA0KTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHRvQXJyYXkobGlzdCksIFsxLCAxMSwgMiwgMjFdKTtcblxuXHRcdG1vZGVsLnNldENvbGxhcHNlZChbMV0sIHRydWUpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwobGlzdC5sZW5ndGgsIDMpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwodG9BcnJheShsaXN0KSwgWzEsIDExLCAyXSk7XG5cblx0XHRkaXNwb3NhYmxlLmRpc3Bvc2UoKTtcblx0fSk7XG5cblx0dGVzdCgnc2V0Q29sbGFwc2libGUnLCAoKSA9PiB7XG5cdFx0Y29uc3QgbGlzdDogSVRyZWVOb2RlPG51bWJlcj5bXSA9IFtdO1xuXHRcdGNvbnN0IG1vZGVsID0gbmV3IEluZGV4VHJlZU1vZGVsPG51bWJlcj4oJ3Rlc3QnLCAtMSk7XG5cdFx0Y29uc3QgZGlzcG9zYWJsZSA9IGJpbmRMaXN0VG9Nb2RlbChsaXN0LCBtb2RlbCk7XG5cblx0XHRtb2RlbC5zcGxpY2UoWzBdLCAwLCBbXG5cdFx0XHR7XG5cdFx0XHRcdGVsZW1lbnQ6IDAsIGNoaWxkcmVuOiBbXG5cdFx0XHRcdFx0eyBlbGVtZW50OiAxMCB9XG5cdFx0XHRcdF1cblx0XHRcdH1cblx0XHRdKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwobGlzdC5sZW5ndGgsIDIpO1xuXG5cdFx0bW9kZWwuc2V0Q29sbGFwc2libGUoWzBdLCBmYWxzZSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChsaXN0Lmxlbmd0aCwgMik7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChsaXN0WzBdLmVsZW1lbnQsIDApO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwobGlzdFswXS5jb2xsYXBzaWJsZSwgZmFsc2UpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwobGlzdFswXS5jb2xsYXBzZWQsIGZhbHNlKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGxpc3RbMV0uZWxlbWVudCwgMTApO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwobGlzdFsxXS5jb2xsYXBzaWJsZSwgZmFsc2UpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwobGlzdFsxXS5jb2xsYXBzZWQsIGZhbHNlKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwobW9kZWwuc2V0Q29sbGFwc2VkKFswXSwgdHJ1ZSksIGZhbHNlKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGxpc3RbMF0uZWxlbWVudCwgMCk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChsaXN0WzBdLmNvbGxhcHNpYmxlLCBmYWxzZSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChsaXN0WzBdLmNvbGxhcHNlZCwgZmFsc2UpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwobGlzdFsxXS5lbGVtZW50LCAxMCk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChsaXN0WzFdLmNvbGxhcHNpYmxlLCBmYWxzZSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChsaXN0WzFdLmNvbGxhcHNlZCwgZmFsc2UpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChtb2RlbC5zZXRDb2xsYXBzZWQoWzBdLCBmYWxzZSksIGZhbHNlKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGxpc3RbMF0uZWxlbWVudCwgMCk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChsaXN0WzBdLmNvbGxhcHNpYmxlLCBmYWxzZSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChsaXN0WzBdLmNvbGxhcHNlZCwgZmFsc2UpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwobGlzdFsxXS5lbGVtZW50LCAxMCk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChsaXN0WzFdLmNvbGxhcHNpYmxlLCBmYWxzZSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChsaXN0WzFdLmNvbGxhcHNlZCwgZmFsc2UpO1xuXG5cdFx0bW9kZWwuc2V0Q29sbGFwc2libGUoWzBdLCB0cnVlKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGxpc3QubGVuZ3RoLCAyKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGxpc3RbMF0uZWxlbWVudCwgMCk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChsaXN0WzBdLmNvbGxhcHNpYmxlLCB0cnVlKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGxpc3RbMF0uY29sbGFwc2VkLCBmYWxzZSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChsaXN0WzFdLmVsZW1lbnQsIDEwKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGxpc3RbMV0uY29sbGFwc2libGUsIGZhbHNlKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGxpc3RbMV0uY29sbGFwc2VkLCBmYWxzZSk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKG1vZGVsLnNldENvbGxhcHNlZChbMF0sIHRydWUpLCB0cnVlKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGxpc3QubGVuZ3RoLCAxKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGxpc3RbMF0uZWxlbWVudCwgMCk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChsaXN0WzBdLmNvbGxhcHNpYmxlLCB0cnVlKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGxpc3RbMF0uY29sbGFwc2VkLCB0cnVlKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwobW9kZWwuc2V0Q29sbGFwc2VkKFswXSwgZmFsc2UpLCB0cnVlKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGxpc3RbMF0uZWxlbWVudCwgMCk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChsaXN0WzBdLmNvbGxhcHNpYmxlLCB0cnVlKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGxpc3RbMF0uY29sbGFwc2VkLCBmYWxzZSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChsaXN0WzFdLmVsZW1lbnQsIDEwKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGxpc3RbMV0uY29sbGFwc2libGUsIGZhbHNlKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGxpc3RbMV0uY29sbGFwc2VkLCBmYWxzZSk7XG5cblx0XHRkaXNwb3NhYmxlLmRpc3Bvc2UoKTtcblx0fSk7XG5cblx0dGVzdCgnc2ltcGxlIGZpbHRlcicsICgpID0+IHtcblx0XHRjb25zdCBsaXN0OiBJVHJlZU5vZGU8bnVtYmVyPltdID0gW107XG5cdFx0Y29uc3QgZmlsdGVyID0gbmV3IGNsYXNzIGltcGxlbWVudHMgSVRyZWVGaWx0ZXI8bnVtYmVyPiB7XG5cdFx0XHRmaWx0ZXIoZWxlbWVudDogbnVtYmVyKTogVHJlZVZpc2liaWxpdHkge1xuXHRcdFx0XHRyZXR1cm4gZWxlbWVudCAlIDIgPT09IDAgPyBUcmVlVmlzaWJpbGl0eS5WaXNpYmxlIDogVHJlZVZpc2liaWxpdHkuSGlkZGVuO1xuXHRcdFx0fVxuXHRcdH07XG5cblx0XHRjb25zdCBtb2RlbCA9IG5ldyBJbmRleFRyZWVNb2RlbDxudW1iZXI+KCd0ZXN0JywgLTEsIHsgZmlsdGVyIH0pO1xuXHRcdGNvbnN0IGRpc3Bvc2FibGUgPSBiaW5kTGlzdFRvTW9kZWwobGlzdCwgbW9kZWwpO1xuXG5cdFx0bW9kZWwuc3BsaWNlKFswXSwgMCwgW1xuXHRcdFx0e1xuXHRcdFx0XHRlbGVtZW50OiAwLCBjaGlsZHJlbjogW1xuXHRcdFx0XHRcdHsgZWxlbWVudDogMSB9LFxuXHRcdFx0XHRcdHsgZWxlbWVudDogMiB9LFxuXHRcdFx0XHRcdHsgZWxlbWVudDogMyB9LFxuXHRcdFx0XHRcdHsgZWxlbWVudDogNCB9LFxuXHRcdFx0XHRcdHsgZWxlbWVudDogNSB9LFxuXHRcdFx0XHRcdHsgZWxlbWVudDogNiB9LFxuXHRcdFx0XHRcdHsgZWxlbWVudDogNyB9XG5cdFx0XHRcdF1cblx0XHRcdH1cblx0XHRdKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwobGlzdC5sZW5ndGgsIDQpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwodG9BcnJheShsaXN0KSwgWzAsIDIsIDQsIDZdKTtcblxuXHRcdG1vZGVsLnNldENvbGxhcHNlZChbMF0sIHRydWUpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwodG9BcnJheShsaXN0KSwgWzBdKTtcblxuXHRcdG1vZGVsLnNldENvbGxhcHNlZChbMF0sIGZhbHNlKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHRvQXJyYXkobGlzdCksIFswLCAyLCA0LCA2XSk7XG5cblx0XHRkaXNwb3NhYmxlLmRpc3Bvc2UoKTtcblx0fSk7XG5cblx0dGVzdCgncmVjdXJzaXZlIGZpbHRlciBvbiBpbml0aWFsIG1vZGVsJywgKCkgPT4ge1xuXHRcdGNvbnN0IGxpc3Q6IElUcmVlTm9kZTxudW1iZXI+W10gPSBbXTtcblx0XHRjb25zdCBmaWx0ZXIgPSBuZXcgY2xhc3MgaW1wbGVtZW50cyBJVHJlZUZpbHRlcjxudW1iZXI+IHtcblx0XHRcdGZpbHRlcihlbGVtZW50OiBudW1iZXIpOiBUcmVlVmlzaWJpbGl0eSB7XG5cdFx0XHRcdHJldHVybiBlbGVtZW50ID09PSAwID8gVHJlZVZpc2liaWxpdHkuUmVjdXJzZSA6IFRyZWVWaXNpYmlsaXR5LkhpZGRlbjtcblx0XHRcdH1cblx0XHR9O1xuXG5cdFx0Y29uc3QgbW9kZWwgPSBuZXcgSW5kZXhUcmVlTW9kZWw8bnVtYmVyPigndGVzdCcsIC0xLCB7IGZpbHRlciB9KTtcblx0XHRjb25zdCBkaXNwb3NhYmxlID0gYmluZExpc3RUb01vZGVsKGxpc3QsIG1vZGVsKTtcblxuXHRcdG1vZGVsLnNwbGljZShbMF0sIDAsIFtcblx0XHRcdHtcblx0XHRcdFx0ZWxlbWVudDogMCwgY2hpbGRyZW46IFtcblx0XHRcdFx0XHR7IGVsZW1lbnQ6IDEgfSxcblx0XHRcdFx0XHR7IGVsZW1lbnQ6IDIgfVxuXHRcdFx0XHRdXG5cdFx0XHR9XG5cdFx0XSk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHRvQXJyYXkobGlzdCksIFtdKTtcblxuXHRcdGRpc3Bvc2FibGUuZGlzcG9zZSgpO1xuXHR9KTtcblxuXHR0ZXN0KCdyZWZpbHRlcicsICgpID0+IHtcblx0XHRjb25zdCBsaXN0OiBJVHJlZU5vZGU8bnVtYmVyPltdID0gW107XG5cdFx0bGV0IHNob3VsZEZpbHRlciA9IGZhbHNlO1xuXHRcdGNvbnN0IGZpbHRlciA9IG5ldyBjbGFzcyBpbXBsZW1lbnRzIElUcmVlRmlsdGVyPG51bWJlcj4ge1xuXHRcdFx0ZmlsdGVyKGVsZW1lbnQ6IG51bWJlcik6IFRyZWVWaXNpYmlsaXR5IHtcblx0XHRcdFx0cmV0dXJuICghc2hvdWxkRmlsdGVyIHx8IGVsZW1lbnQgJSAyID09PSAwKSA/IFRyZWVWaXNpYmlsaXR5LlZpc2libGUgOiBUcmVlVmlzaWJpbGl0eS5IaWRkZW47XG5cdFx0XHR9XG5cdFx0fTtcblxuXHRcdGNvbnN0IG1vZGVsID0gbmV3IEluZGV4VHJlZU1vZGVsPG51bWJlcj4oJ3Rlc3QnLCAtMSwgeyBmaWx0ZXIgfSk7XG5cdFx0Y29uc3QgZGlzcG9zYWJsZSA9IGJpbmRMaXN0VG9Nb2RlbChsaXN0LCBtb2RlbCk7XG5cblx0XHRtb2RlbC5zcGxpY2UoWzBdLCAwLCBbXG5cdFx0XHR7XG5cdFx0XHRcdGVsZW1lbnQ6IDAsIGNoaWxkcmVuOiBbXG5cdFx0XHRcdFx0eyBlbGVtZW50OiAxIH0sXG5cdFx0XHRcdFx0eyBlbGVtZW50OiAyIH0sXG5cdFx0XHRcdFx0eyBlbGVtZW50OiAzIH0sXG5cdFx0XHRcdFx0eyBlbGVtZW50OiA0IH0sXG5cdFx0XHRcdFx0eyBlbGVtZW50OiA1IH0sXG5cdFx0XHRcdFx0eyBlbGVtZW50OiA2IH0sXG5cdFx0XHRcdFx0eyBlbGVtZW50OiA3IH1cblx0XHRcdFx0XVxuXHRcdFx0fSxcblx0XHRdKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwodG9BcnJheShsaXN0KSwgWzAsIDEsIDIsIDMsIDQsIDUsIDYsIDddKTtcblxuXHRcdG1vZGVsLnJlZmlsdGVyKCk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh0b0FycmF5KGxpc3QpLCBbMCwgMSwgMiwgMywgNCwgNSwgNiwgN10pO1xuXG5cdFx0c2hvdWxkRmlsdGVyID0gdHJ1ZTtcblx0XHRtb2RlbC5yZWZpbHRlcigpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwodG9BcnJheShsaXN0KSwgWzAsIDIsIDQsIDZdKTtcblxuXHRcdHNob3VsZEZpbHRlciA9IGZhbHNlO1xuXHRcdG1vZGVsLnJlZmlsdGVyKCk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh0b0FycmF5KGxpc3QpLCBbMCwgMSwgMiwgMywgNCwgNSwgNiwgN10pO1xuXG5cdFx0ZGlzcG9zYWJsZS5kaXNwb3NlKCk7XG5cdH0pO1xuXG5cdHRlc3QoJ3JlY3Vyc2l2ZSBmaWx0ZXInLCAoKSA9PiB7XG5cdFx0Y29uc3QgbGlzdDogSVRyZWVOb2RlPHN0cmluZz5bXSA9IFtdO1xuXHRcdGxldCBxdWVyeSA9IG5ldyBSZWdFeHAoJycpO1xuXHRcdGNvbnN0IGZpbHRlciA9IG5ldyBjbGFzcyBpbXBsZW1lbnRzIElUcmVlRmlsdGVyPHN0cmluZz4ge1xuXHRcdFx0ZmlsdGVyKGVsZW1lbnQ6IHN0cmluZyk6IFRyZWVWaXNpYmlsaXR5IHtcblx0XHRcdFx0cmV0dXJuIHF1ZXJ5LnRlc3QoZWxlbWVudCkgPyBUcmVlVmlzaWJpbGl0eS5WaXNpYmxlIDogVHJlZVZpc2liaWxpdHkuUmVjdXJzZTtcblx0XHRcdH1cblx0XHR9O1xuXG5cdFx0Y29uc3QgbW9kZWwgPSBuZXcgSW5kZXhUcmVlTW9kZWw8c3RyaW5nPigndGVzdCcsICdyb290JywgeyBmaWx0ZXIgfSk7XG5cdFx0Y29uc3QgZGlzcG9zYWJsZSA9IGJpbmRMaXN0VG9Nb2RlbChsaXN0LCBtb2RlbCk7XG5cblx0XHRtb2RlbC5zcGxpY2UoWzBdLCAwLCBbXG5cdFx0XHR7XG5cdFx0XHRcdGVsZW1lbnQ6ICd2c2NvZGUnLCBjaGlsZHJlbjogW1xuXHRcdFx0XHRcdHsgZWxlbWVudDogJy5idWlsZCcgfSxcblx0XHRcdFx0XHR7IGVsZW1lbnQ6ICdnaXQnIH0sXG5cdFx0XHRcdFx0e1xuXHRcdFx0XHRcdFx0ZWxlbWVudDogJ2dpdGh1YicsIGNoaWxkcmVuOiBbXG5cdFx0XHRcdFx0XHRcdHsgZWxlbWVudDogJ2NhbGVuZGFyLnltbCcgfSxcblx0XHRcdFx0XHRcdFx0eyBlbGVtZW50OiAnZW5kZ2FtZScgfSxcblx0XHRcdFx0XHRcdFx0eyBlbGVtZW50OiAnYnVpbGQuanMnIH0sXG5cdFx0XHRcdFx0XHRdXG5cdFx0XHRcdFx0fSxcblx0XHRcdFx0XHR7XG5cdFx0XHRcdFx0XHRlbGVtZW50OiAnYnVpbGQnLCBjaGlsZHJlbjogW1xuXHRcdFx0XHRcdFx0XHR7IGVsZW1lbnQ6ICdsaWInIH0sXG5cdFx0XHRcdFx0XHRcdHsgZWxlbWVudDogJ2d1bHBmaWxlLmpzJyB9XG5cdFx0XHRcdFx0XHRdXG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRdXG5cdFx0XHR9LFxuXHRcdF0pO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChsaXN0Lmxlbmd0aCwgMTApO1xuXG5cdFx0cXVlcnkgPSAvYnVpbGQvO1xuXHRcdG1vZGVsLnJlZmlsdGVyKCk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh0b0FycmF5KGxpc3QpLCBbJ3ZzY29kZScsICcuYnVpbGQnLCAnZ2l0aHViJywgJ2J1aWxkLmpzJywgJ2J1aWxkJ10pO1xuXG5cdFx0bW9kZWwuc2V0Q29sbGFwc2VkKFswXSwgdHJ1ZSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh0b0FycmF5KGxpc3QpLCBbJ3ZzY29kZSddKTtcblxuXHRcdG1vZGVsLnNldENvbGxhcHNlZChbMF0sIGZhbHNlKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHRvQXJyYXkobGlzdCksIFsndnNjb2RlJywgJy5idWlsZCcsICdnaXRodWInLCAnYnVpbGQuanMnLCAnYnVpbGQnXSk7XG5cblx0XHRkaXNwb3NhYmxlLmRpc3Bvc2UoKTtcblx0fSk7XG5cblx0dGVzdCgncmVjdXJzaXZlIGZpbHRlciB1cGRhdGVzIHdoZW4gY2hpbGRyZW4gY2hhbmdlICgjMTMzMjcyKScsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBsaXN0OiBJVHJlZU5vZGU8c3RyaW5nPltdID0gW107XG5cdFx0bGV0IHF1ZXJ5ID0gJyc7XG5cdFx0Y29uc3QgZmlsdGVyID0gbmV3IGNsYXNzIGltcGxlbWVudHMgSVRyZWVGaWx0ZXI8c3RyaW5nPiB7XG5cdFx0XHRmaWx0ZXIoZWxlbWVudDogc3RyaW5nKTogVHJlZVZpc2liaWxpdHkge1xuXHRcdFx0XHRyZXR1cm4gZWxlbWVudC5pbmNsdWRlcyhxdWVyeSkgPyBUcmVlVmlzaWJpbGl0eS5WaXNpYmxlIDogVHJlZVZpc2liaWxpdHkuUmVjdXJzZTtcblx0XHRcdH1cblx0XHR9O1xuXG5cdFx0Y29uc3QgbW9kZWwgPSBuZXcgSW5kZXhUcmVlTW9kZWw8c3RyaW5nPigndGVzdCcsICdyb290JywgeyBmaWx0ZXIgfSk7XG5cdFx0Y29uc3QgZGlzcG9zYWJsZSA9IGJpbmRMaXN0VG9Nb2RlbChsaXN0LCBtb2RlbCk7XG5cblx0XHRtb2RlbC5zcGxpY2UoWzBdLCAwLCBbXG5cdFx0XHR7XG5cdFx0XHRcdGVsZW1lbnQ6ICdhJyxcblx0XHRcdFx0Y2hpbGRyZW46IFtcblx0XHRcdFx0XHR7IGVsZW1lbnQ6ICdiJyB9LFxuXHRcdFx0XHRdLFxuXHRcdFx0fSxcblx0XHRdKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwodG9BcnJheShsaXN0KSwgWydhJywgJ2InXSk7XG5cdFx0cXVlcnkgPSAndmlzaWJsZSc7XG5cdFx0bW9kZWwucmVmaWx0ZXIoKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHRvQXJyYXkobGlzdCksIFtdKTtcblxuXHRcdG1vZGVsLnNwbGljZShbMCwgMCwgMF0sIDAsIFtcblx0XHRcdHtcblx0XHRcdFx0ZWxlbWVudDogJ3Zpc2libGUnLCBjaGlsZHJlbjogW11cblx0XHRcdH0sXG5cdFx0XSk7XG5cblx0XHRhd2FpdCB0aW1lb3V0KDApOyAvLyB3YWl0IGZvciByZWZpbHRlciBtaWNyb3Rhc2tcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwodG9BcnJheShsaXN0KSwgWydhJywgJ2InLCAndmlzaWJsZSddKTtcblxuXHRcdGRpc3Bvc2FibGUuZGlzcG9zZSgpO1xuXHR9KTtcblxuXHR0ZXN0KCdyZWN1cnNpdmUgZmlsdGVyIHdpdGggY29sbGFwc2UnLCAoKSA9PiB7XG5cdFx0Y29uc3QgbGlzdDogSVRyZWVOb2RlPHN0cmluZz5bXSA9IFtdO1xuXHRcdGxldCBxdWVyeSA9IG5ldyBSZWdFeHAoJycpO1xuXHRcdGNvbnN0IGZpbHRlciA9IG5ldyBjbGFzcyBpbXBsZW1lbnRzIElUcmVlRmlsdGVyPHN0cmluZz4ge1xuXHRcdFx0ZmlsdGVyKGVsZW1lbnQ6IHN0cmluZyk6IFRyZWVWaXNpYmlsaXR5IHtcblx0XHRcdFx0cmV0dXJuIHF1ZXJ5LnRlc3QoZWxlbWVudCkgPyBUcmVlVmlzaWJpbGl0eS5WaXNpYmxlIDogVHJlZVZpc2liaWxpdHkuUmVjdXJzZTtcblx0XHRcdH1cblx0XHR9O1xuXG5cdFx0Y29uc3QgbW9kZWwgPSBuZXcgSW5kZXhUcmVlTW9kZWw8c3RyaW5nPigndGVzdCcsICdyb290JywgeyBmaWx0ZXIgfSk7XG5cdFx0Y29uc3QgZGlzcG9zYWJsZSA9IGJpbmRMaXN0VG9Nb2RlbChsaXN0LCBtb2RlbCk7XG5cblx0XHRtb2RlbC5zcGxpY2UoWzBdLCAwLCBbXG5cdFx0XHR7XG5cdFx0XHRcdGVsZW1lbnQ6ICd2c2NvZGUnLCBjaGlsZHJlbjogW1xuXHRcdFx0XHRcdHsgZWxlbWVudDogJy5idWlsZCcgfSxcblx0XHRcdFx0XHR7IGVsZW1lbnQ6ICdnaXQnIH0sXG5cdFx0XHRcdFx0e1xuXHRcdFx0XHRcdFx0ZWxlbWVudDogJ2dpdGh1YicsIGNoaWxkcmVuOiBbXG5cdFx0XHRcdFx0XHRcdHsgZWxlbWVudDogJ2NhbGVuZGFyLnltbCcgfSxcblx0XHRcdFx0XHRcdFx0eyBlbGVtZW50OiAnZW5kZ2FtZScgfSxcblx0XHRcdFx0XHRcdFx0eyBlbGVtZW50OiAnYnVpbGQuanMnIH0sXG5cdFx0XHRcdFx0XHRdXG5cdFx0XHRcdFx0fSxcblx0XHRcdFx0XHR7XG5cdFx0XHRcdFx0XHRlbGVtZW50OiAnYnVpbGQnLCBjaGlsZHJlbjogW1xuXHRcdFx0XHRcdFx0XHR7IGVsZW1lbnQ6ICdsaWInIH0sXG5cdFx0XHRcdFx0XHRcdHsgZWxlbWVudDogJ2d1bHBmaWxlLmpzJyB9XG5cdFx0XHRcdFx0XHRdXG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRdXG5cdFx0XHR9LFxuXHRcdF0pO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChsaXN0Lmxlbmd0aCwgMTApO1xuXG5cdFx0cXVlcnkgPSAvZ3VscC87XG5cdFx0bW9kZWwucmVmaWx0ZXIoKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHRvQXJyYXkobGlzdCksIFsndnNjb2RlJywgJ2J1aWxkJywgJ2d1bHBmaWxlLmpzJ10pO1xuXG5cdFx0bW9kZWwuc2V0Q29sbGFwc2VkKFswLCAzXSwgdHJ1ZSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh0b0FycmF5KGxpc3QpLCBbJ3ZzY29kZScsICdidWlsZCddKTtcblxuXHRcdG1vZGVsLnNldENvbGxhcHNlZChbMF0sIHRydWUpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwodG9BcnJheShsaXN0KSwgWyd2c2NvZGUnXSk7XG5cblx0XHRkaXNwb3NhYmxlLmRpc3Bvc2UoKTtcblx0fSk7XG5cblx0dGVzdCgncmVjdXJzaXZlIGZpbHRlciB3aGlsZSBjb2xsYXBzZWQnLCAoKSA9PiB7XG5cdFx0Y29uc3QgbGlzdDogSVRyZWVOb2RlPHN0cmluZz5bXSA9IFtdO1xuXHRcdGxldCBxdWVyeSA9IG5ldyBSZWdFeHAoJycpO1xuXHRcdGNvbnN0IGZpbHRlciA9IG5ldyBjbGFzcyBpbXBsZW1lbnRzIElUcmVlRmlsdGVyPHN0cmluZz4ge1xuXHRcdFx0ZmlsdGVyKGVsZW1lbnQ6IHN0cmluZyk6IFRyZWVWaXNpYmlsaXR5IHtcblx0XHRcdFx0cmV0dXJuIHF1ZXJ5LnRlc3QoZWxlbWVudCkgPyBUcmVlVmlzaWJpbGl0eS5WaXNpYmxlIDogVHJlZVZpc2liaWxpdHkuUmVjdXJzZTtcblx0XHRcdH1cblx0XHR9O1xuXG5cdFx0Y29uc3QgbW9kZWwgPSBuZXcgSW5kZXhUcmVlTW9kZWw8c3RyaW5nPigndGVzdCcsICdyb290JywgeyBmaWx0ZXIgfSk7XG5cdFx0Y29uc3QgZGlzcG9zYWJsZSA9IGJpbmRMaXN0VG9Nb2RlbChsaXN0LCBtb2RlbCk7XG5cblx0XHRtb2RlbC5zcGxpY2UoWzBdLCAwLCBbXG5cdFx0XHR7XG5cdFx0XHRcdGVsZW1lbnQ6ICd2c2NvZGUnLCBjb2xsYXBzZWQ6IHRydWUsIGNoaWxkcmVuOiBbXG5cdFx0XHRcdFx0eyBlbGVtZW50OiAnLmJ1aWxkJyB9LFxuXHRcdFx0XHRcdHsgZWxlbWVudDogJ2dpdCcgfSxcblx0XHRcdFx0XHR7XG5cdFx0XHRcdFx0XHRlbGVtZW50OiAnZ2l0aHViJywgY2hpbGRyZW46IFtcblx0XHRcdFx0XHRcdFx0eyBlbGVtZW50OiAnY2FsZW5kYXIueW1sJyB9LFxuXHRcdFx0XHRcdFx0XHR7IGVsZW1lbnQ6ICdlbmRnYW1lJyB9LFxuXHRcdFx0XHRcdFx0XHR7IGVsZW1lbnQ6ICdidWlsZC5qcycgfSxcblx0XHRcdFx0XHRcdF1cblx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdHtcblx0XHRcdFx0XHRcdGVsZW1lbnQ6ICdidWlsZCcsIGNoaWxkcmVuOiBbXG5cdFx0XHRcdFx0XHRcdHsgZWxlbWVudDogJ2xpYicgfSxcblx0XHRcdFx0XHRcdFx0eyBlbGVtZW50OiAnZ3VscGZpbGUuanMnIH1cblx0XHRcdFx0XHRcdF1cblx0XHRcdFx0XHR9XG5cdFx0XHRcdF1cblx0XHRcdH0sXG5cdFx0XSk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHRvQXJyYXkobGlzdCksIFsndnNjb2RlJ10pO1xuXG5cdFx0cXVlcnkgPSAvZ3VscC87XG5cdFx0bW9kZWwucmVmaWx0ZXIoKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHRvQXJyYXkobGlzdCksIFsndnNjb2RlJ10pO1xuXG5cdFx0bW9kZWwuc2V0Q29sbGFwc2VkKFswXSwgZmFsc2UpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwodG9BcnJheShsaXN0KSwgWyd2c2NvZGUnLCAnYnVpbGQnLCAnZ3VscGZpbGUuanMnXSk7XG5cblx0XHRtb2RlbC5zZXRDb2xsYXBzZWQoWzBdLCB0cnVlKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHRvQXJyYXkobGlzdCksIFsndnNjb2RlJ10pO1xuXG5cdFx0cXVlcnkgPSBuZXcgUmVnRXhwKCcnKTtcblx0XHRtb2RlbC5yZWZpbHRlcigpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwodG9BcnJheShsaXN0KSwgWyd2c2NvZGUnXSk7XG5cblx0XHRtb2RlbC5zZXRDb2xsYXBzZWQoWzBdLCBmYWxzZSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChsaXN0Lmxlbmd0aCwgMTApO1xuXG5cdFx0ZGlzcG9zYWJsZS5kaXNwb3NlKCk7XG5cdH0pO1xuXG5cdHN1aXRlKCdnZXROb2RlTG9jYXRpb24nLCAoKSA9PiB7XG5cblx0XHR0ZXN0KCdzaW1wbGUnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBsaXN0OiBJSW5kZXhUcmVlTm9kZTxudW1iZXI+W10gPSBbXTtcblx0XHRcdGNvbnN0IG1vZGVsID0gbmV3IEluZGV4VHJlZU1vZGVsPG51bWJlcj4oJ3Rlc3QnLCAtMSk7XG5cdFx0XHRjb25zdCBkaXNwb3NhYmxlID0gYmluZExpc3RUb01vZGVsKGxpc3QsIG1vZGVsKTtcblxuXHRcdFx0bW9kZWwuc3BsaWNlKFswXSwgMCwgW1xuXHRcdFx0XHR7XG5cdFx0XHRcdFx0ZWxlbWVudDogMCwgY2hpbGRyZW46IFtcblx0XHRcdFx0XHRcdHsgZWxlbWVudDogMTAgfSxcblx0XHRcdFx0XHRcdHsgZWxlbWVudDogMTEgfSxcblx0XHRcdFx0XHRcdHsgZWxlbWVudDogMTIgfSxcblx0XHRcdFx0XHRdXG5cdFx0XHRcdH0sXG5cdFx0XHRcdHsgZWxlbWVudDogMSB9LFxuXHRcdFx0XHR7IGVsZW1lbnQ6IDIgfVxuXHRcdFx0XSk7XG5cblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwobW9kZWwuZ2V0Tm9kZUxvY2F0aW9uKGxpc3RbMF0pLCBbMF0pO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChtb2RlbC5nZXROb2RlTG9jYXRpb24obGlzdFsxXSksIFswLCAwXSk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKG1vZGVsLmdldE5vZGVMb2NhdGlvbihsaXN0WzJdKSwgWzAsIDFdKTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwobW9kZWwuZ2V0Tm9kZUxvY2F0aW9uKGxpc3RbM10pLCBbMCwgMl0pO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChtb2RlbC5nZXROb2RlTG9jYXRpb24obGlzdFs0XSksIFsxXSk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKG1vZGVsLmdldE5vZGVMb2NhdGlvbihsaXN0WzVdKSwgWzJdKTtcblxuXHRcdFx0ZGlzcG9zYWJsZS5kaXNwb3NlKCk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCd3aXRoIGZpbHRlcicsICgpID0+IHtcblx0XHRcdGNvbnN0IGxpc3Q6IElJbmRleFRyZWVOb2RlPG51bWJlcj5bXSA9IFtdO1xuXHRcdFx0Y29uc3QgZmlsdGVyID0gbmV3IGNsYXNzIGltcGxlbWVudHMgSVRyZWVGaWx0ZXI8bnVtYmVyPiB7XG5cdFx0XHRcdGZpbHRlcihlbGVtZW50OiBudW1iZXIpOiBUcmVlVmlzaWJpbGl0eSB7XG5cdFx0XHRcdFx0cmV0dXJuIGVsZW1lbnQgJSAyID09PSAwID8gVHJlZVZpc2liaWxpdHkuVmlzaWJsZSA6IFRyZWVWaXNpYmlsaXR5LkhpZGRlbjtcblx0XHRcdFx0fVxuXHRcdFx0fTtcblxuXHRcdFx0Y29uc3QgbW9kZWwgPSBuZXcgSW5kZXhUcmVlTW9kZWw8bnVtYmVyPigndGVzdCcsIC0xLCB7IGZpbHRlciB9KTtcblx0XHRcdGNvbnN0IGRpc3Bvc2FibGUgPSBiaW5kTGlzdFRvTW9kZWwobGlzdCwgbW9kZWwpO1xuXG5cdFx0XHRtb2RlbC5zcGxpY2UoWzBdLCAwLCBbXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRlbGVtZW50OiAwLCBjaGlsZHJlbjogW1xuXHRcdFx0XHRcdFx0eyBlbGVtZW50OiAxIH0sXG5cdFx0XHRcdFx0XHR7IGVsZW1lbnQ6IDIgfSxcblx0XHRcdFx0XHRcdHsgZWxlbWVudDogMyB9LFxuXHRcdFx0XHRcdFx0eyBlbGVtZW50OiA0IH0sXG5cdFx0XHRcdFx0XHR7IGVsZW1lbnQ6IDUgfSxcblx0XHRcdFx0XHRcdHsgZWxlbWVudDogNiB9LFxuXHRcdFx0XHRcdFx0eyBlbGVtZW50OiA3IH1cblx0XHRcdFx0XHRdXG5cdFx0XHRcdH1cblx0XHRcdF0pO1xuXG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKG1vZGVsLmdldE5vZGVMb2NhdGlvbihsaXN0WzBdKSwgWzBdKTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwobW9kZWwuZ2V0Tm9kZUxvY2F0aW9uKGxpc3RbMV0pLCBbMCwgMV0pO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChtb2RlbC5nZXROb2RlTG9jYXRpb24obGlzdFsyXSksIFswLCAzXSk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKG1vZGVsLmdldE5vZGVMb2NhdGlvbihsaXN0WzNdKSwgWzAsIDVdKTtcblxuXHRcdFx0ZGlzcG9zYWJsZS5kaXNwb3NlKCk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3JlZmlsdGVyIHdpdGggZmlsdGVyZWQgb3V0IG5vZGVzJywgKCkgPT4ge1xuXHRcdGNvbnN0IGxpc3Q6IElUcmVlTm9kZTxzdHJpbmc+W10gPSBbXTtcblx0XHRsZXQgcXVlcnkgPSBuZXcgUmVnRXhwKCcnKTtcblx0XHRjb25zdCBmaWx0ZXIgPSBuZXcgY2xhc3MgaW1wbGVtZW50cyBJVHJlZUZpbHRlcjxzdHJpbmc+IHtcblx0XHRcdGZpbHRlcihlbGVtZW50OiBzdHJpbmcpOiBib29sZWFuIHtcblx0XHRcdFx0cmV0dXJuIHF1ZXJ5LnRlc3QoZWxlbWVudCk7XG5cdFx0XHR9XG5cdFx0fTtcblxuXHRcdGNvbnN0IG1vZGVsID0gbmV3IEluZGV4VHJlZU1vZGVsPHN0cmluZz4oJ3Rlc3QnLCAncm9vdCcsIHsgZmlsdGVyIH0pO1xuXHRcdGNvbnN0IGRpc3Bvc2FibGUgPSBiaW5kTGlzdFRvTW9kZWwobGlzdCwgbW9kZWwpO1xuXG5cdFx0bW9kZWwuc3BsaWNlKFswXSwgMCwgW1xuXHRcdFx0eyBlbGVtZW50OiAnc2lsdmVyJyB9LFxuXHRcdFx0eyBlbGVtZW50OiAnZ29sZCcgfSxcblx0XHRcdHsgZWxlbWVudDogJ3BsYXRpbnVtJyB9XG5cdFx0XSk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHRvQXJyYXkobGlzdCksIFsnc2lsdmVyJywgJ2dvbGQnLCAncGxhdGludW0nXSk7XG5cblx0XHRxdWVyeSA9IC9wbGF0aW51bS87XG5cdFx0bW9kZWwucmVmaWx0ZXIoKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHRvQXJyYXkobGlzdCksIFsncGxhdGludW0nXSk7XG5cblx0XHRtb2RlbC5zcGxpY2UoWzBdLCBOdW1iZXIuUE9TSVRJVkVfSU5GSU5JVFksIFtcblx0XHRcdHsgZWxlbWVudDogJ3NpbHZlcicgfSxcblx0XHRcdHsgZWxlbWVudDogJ2dvbGQnIH0sXG5cdFx0XHR7IGVsZW1lbnQ6ICdwbGF0aW51bScgfVxuXHRcdF0pO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwodG9BcnJheShsaXN0KSwgWydwbGF0aW51bSddKTtcblxuXHRcdG1vZGVsLnJlZmlsdGVyKCk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh0b0FycmF5KGxpc3QpLCBbJ3BsYXRpbnVtJ10pO1xuXG5cdFx0ZGlzcG9zYWJsZS5kaXNwb3NlKCk7XG5cdH0pO1xuXG5cdHRlc3QoJ2V4cGxpY2l0IGhpZGRlbiBub2RlcyBzaG91bGQgaGF2ZSByZW5kZXJOb2RlQ291bnQgPT0gMCwgaXNzdWUgIzgzMjExJywgKCkgPT4ge1xuXHRcdGNvbnN0IGxpc3Q6IElUcmVlTm9kZTxzdHJpbmc+W10gPSBbXTtcblx0XHRsZXQgcXVlcnkgPSBuZXcgUmVnRXhwKCcnKTtcblx0XHRjb25zdCBmaWx0ZXIgPSBuZXcgY2xhc3MgaW1wbGVtZW50cyBJVHJlZUZpbHRlcjxzdHJpbmc+IHtcblx0XHRcdGZpbHRlcihlbGVtZW50OiBzdHJpbmcpOiBib29sZWFuIHtcblx0XHRcdFx0cmV0dXJuIHF1ZXJ5LnRlc3QoZWxlbWVudCk7XG5cdFx0XHR9XG5cdFx0fTtcblxuXHRcdGNvbnN0IG1vZGVsID0gbmV3IEluZGV4VHJlZU1vZGVsPHN0cmluZz4oJ3Rlc3QnLCAncm9vdCcsIHsgZmlsdGVyIH0pO1xuXHRcdGNvbnN0IGRpc3Bvc2FibGUgPSBiaW5kTGlzdFRvTW9kZWwobGlzdCwgbW9kZWwpO1xuXG5cdFx0bW9kZWwuc3BsaWNlKFswXSwgMCwgW1xuXHRcdFx0eyBlbGVtZW50OiAnYScsIGNoaWxkcmVuOiBbeyBlbGVtZW50OiAnYWEnIH1dIH0sXG5cdFx0XHR7IGVsZW1lbnQ6ICdiJywgY2hpbGRyZW46IFt7IGVsZW1lbnQ6ICdiYicgfV0gfVxuXHRcdF0pO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh0b0FycmF5KGxpc3QpLCBbJ2EnLCAnYWEnLCAnYicsICdiYiddKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKG1vZGVsLmdldExpc3RJbmRleChbMF0pLCAwKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKG1vZGVsLmdldExpc3RJbmRleChbMCwgMF0pLCAxKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKG1vZGVsLmdldExpc3RJbmRleChbMV0pLCAyKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKG1vZGVsLmdldExpc3RJbmRleChbMSwgMF0pLCAzKTtcblxuXHRcdHF1ZXJ5ID0gL2IvO1xuXHRcdG1vZGVsLnJlZmlsdGVyKCk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh0b0FycmF5KGxpc3QpLCBbJ2InLCAnYmInXSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChtb2RlbC5nZXRMaXN0SW5kZXgoWzBdKSwgLTEpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwobW9kZWwuZ2V0TGlzdEluZGV4KFswLCAwXSksIC0xKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKG1vZGVsLmdldExpc3RJbmRleChbMV0pLCAwKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKG1vZGVsLmdldExpc3RJbmRleChbMSwgMF0pLCAxKTtcblxuXHRcdGRpc3Bvc2FibGUuZGlzcG9zZSgpO1xuXHR9KTtcbn0pO1xuIl0sCiAgIm1hcHBpbmdzIjogIkFBS0EsT0FBTyxZQUFZO0FBQ25CLFNBQXVELHNCQUFzQjtBQUM3RSxTQUErQyxzQkFBc0I7QUFDckUsU0FBUyxlQUFlO0FBQ3hC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
