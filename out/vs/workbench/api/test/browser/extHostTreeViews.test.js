import assert from "assert";
import * as sinon from "sinon";
import { Emitter } from "../../../../base/common/event.js";
import { ExtHostTreeViews } from "../../common/extHostTreeViews.js";
import { ExtHostCommands } from "../../common/extHostCommands.js";
import { MainContext } from "../../common/extHost.protocol.js";
import { TestRPCProtocol } from "../common/testRPCProtocol.js";
import { mock } from "../../../../base/test/common/mock.js";
import { TreeItemCollapsibleState } from "../../../common/views.js";
import { NullLogService } from "../../../../platform/log/common/log.js";
import { nullExtensionDescription as extensionsDescription } from "../../../services/extensions/common/extensions.js";
import { runWithFakedTimers } from "../../../../base/test/common/timeTravelScheduler.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../base/test/common/utils.js";
function unBatchChildren(result) {
  if (!result || result.length === 0) {
    return void 0;
  }
  if (result.length > 1) {
    throw new Error("Unexpected result length, all tests are unbatched.");
  }
  return result[0].slice(1);
}
suite("ExtHostTreeView", function() {
  const store = ensureNoDisposablesAreLeakedInTestSuite();
  class RecordingShape extends mock() {
    constructor() {
      super(...arguments);
      this.onRefresh = new Emitter();
    }
    async $registerTreeViewDataProvider(treeViewId) {
    }
    $refresh(viewId, itemsToRefresh) {
      return Promise.resolve(null).then(() => {
        this.onRefresh.fire(itemsToRefresh);
      });
    }
    $reveal(treeViewId, itemInfo, options) {
      return Promise.resolve();
    }
    $disposeTree(treeViewId) {
      return Promise.resolve();
    }
  }
  let testObject;
  let target;
  let onDidChangeTreeNode;
  let onDidChangeTreeNodeWithId;
  let tree;
  let labels;
  let nodes;
  setup(() => {
    tree = {
      "a": {
        "aa": {},
        "ab": {}
      },
      "b": {
        "ba": {},
        "bb": {}
      }
    };
    labels = {};
    nodes = {};
    const rpcProtocol = new TestRPCProtocol();
    rpcProtocol.set(MainContext.MainThreadCommands, new class extends mock() {
      $registerCommand() {
      }
    }());
    target = new RecordingShape();
    testObject = store.add(new ExtHostTreeViews(target, new ExtHostCommands(
      rpcProtocol,
      new NullLogService(),
      new class extends mock() {
        onExtensionError() {
          return true;
        }
      }()
    ), new NullLogService()));
    onDidChangeTreeNode = new Emitter();
    onDidChangeTreeNodeWithId = new Emitter();
    testObject.createTreeView("testNodeTreeProvider", { treeDataProvider: aNodeTreeDataProvider() }, extensionsDescription);
    testObject.createTreeView("testNodeWithIdTreeProvider", { treeDataProvider: aNodeWithIdTreeDataProvider() }, extensionsDescription);
    testObject.createTreeView("testNodeWithHighlightsTreeProvider", { treeDataProvider: aNodeWithHighlightedLabelTreeDataProvider() }, extensionsDescription);
    return loadCompleteTree("testNodeTreeProvider");
  });
  test("construct node tree", () => {
    return testObject.$getChildren("testNodeTreeProvider").then((elements) => {
      const actuals = unBatchChildren(elements)?.map((e) => e.handle);
      assert.deepStrictEqual(actuals, ["0/0:a", "0/0:b"]);
      return Promise.all([
        testObject.$getChildren("testNodeTreeProvider", ["0/0:a"]).then((children) => {
          const actuals2 = unBatchChildren(children)?.map((e) => e.handle);
          assert.deepStrictEqual(actuals2, ["0/0:a/0:aa", "0/0:a/0:ab"]);
          return Promise.all([
            testObject.$getChildren("testNodeTreeProvider", ["0/0:a/0:aa"]).then((children2) => assert.strictEqual(unBatchChildren(children2)?.length, 0)),
            testObject.$getChildren("testNodeTreeProvider", ["0/0:a/0:ab"]).then((children2) => assert.strictEqual(unBatchChildren(children2)?.length, 0))
          ]);
        }),
        testObject.$getChildren("testNodeTreeProvider", ["0/0:b"]).then((children) => {
          const actuals2 = unBatchChildren(children)?.map((e) => e.handle);
          assert.deepStrictEqual(actuals2, ["0/0:b/0:ba", "0/0:b/0:bb"]);
          return Promise.all([
            testObject.$getChildren("testNodeTreeProvider", ["0/0:b/0:ba"]).then((children2) => assert.strictEqual(unBatchChildren(children2)?.length, 0)),
            testObject.$getChildren("testNodeTreeProvider", ["0/0:b/0:bb"]).then((children2) => assert.strictEqual(unBatchChildren(children2)?.length, 0))
          ]);
        })
      ]);
    });
  });
  test("construct id tree", () => {
    return testObject.$getChildren("testNodeWithIdTreeProvider").then((elements) => {
      const actuals = unBatchChildren(elements)?.map((e) => e.handle);
      assert.deepStrictEqual(actuals, ["1/a", "1/b"]);
      return Promise.all([
        testObject.$getChildren("testNodeWithIdTreeProvider", ["1/a"]).then((children) => {
          const actuals2 = unBatchChildren(children)?.map((e) => e.handle);
          assert.deepStrictEqual(actuals2, ["1/aa", "1/ab"]);
          return Promise.all([
            testObject.$getChildren("testNodeWithIdTreeProvider", ["1/aa"]).then((children2) => assert.strictEqual(unBatchChildren(children2)?.length, 0)),
            testObject.$getChildren("testNodeWithIdTreeProvider", ["1/ab"]).then((children2) => assert.strictEqual(unBatchChildren(children2)?.length, 0))
          ]);
        }),
        testObject.$getChildren("testNodeWithIdTreeProvider", ["1/b"]).then((children) => {
          const actuals2 = unBatchChildren(children)?.map((e) => e.handle);
          assert.deepStrictEqual(actuals2, ["1/ba", "1/bb"]);
          return Promise.all([
            testObject.$getChildren("testNodeWithIdTreeProvider", ["1/ba"]).then((children2) => assert.strictEqual(unBatchChildren(children2)?.length, 0)),
            testObject.$getChildren("testNodeWithIdTreeProvider", ["1/bb"]).then((children2) => assert.strictEqual(unBatchChildren(children2)?.length, 0))
          ]);
        })
      ]);
    });
  });
  test("construct highlights tree", () => {
    return testObject.$getChildren("testNodeWithHighlightsTreeProvider").then((elements) => {
      assert.deepStrictEqual(removeUnsetKeys(unBatchChildren(elements)), [{
        handle: "1/a",
        label: { label: "a", highlights: [[0, 2], [3, 5]] },
        collapsibleState: TreeItemCollapsibleState.Collapsed
      }, {
        handle: "1/b",
        label: { label: "b", highlights: [[0, 2], [3, 5]] },
        collapsibleState: TreeItemCollapsibleState.Collapsed
      }]);
      return Promise.all([
        testObject.$getChildren("testNodeWithHighlightsTreeProvider", ["1/a"]).then((children) => {
          assert.deepStrictEqual(removeUnsetKeys(unBatchChildren(children)), [{
            handle: "1/aa",
            parentHandle: "1/a",
            label: { label: "aa", highlights: [[0, 2], [3, 5]] },
            collapsibleState: TreeItemCollapsibleState.None
          }, {
            handle: "1/ab",
            parentHandle: "1/a",
            label: { label: "ab", highlights: [[0, 2], [3, 5]] },
            collapsibleState: TreeItemCollapsibleState.None
          }]);
        }),
        testObject.$getChildren("testNodeWithHighlightsTreeProvider", ["1/b"]).then((children) => {
          assert.deepStrictEqual(removeUnsetKeys(unBatchChildren(children)), [{
            handle: "1/ba",
            parentHandle: "1/b",
            label: { label: "ba", highlights: [[0, 2], [3, 5]] },
            collapsibleState: TreeItemCollapsibleState.None
          }, {
            handle: "1/bb",
            parentHandle: "1/b",
            label: { label: "bb", highlights: [[0, 2], [3, 5]] },
            collapsibleState: TreeItemCollapsibleState.None
          }]);
        })
      ]);
    });
  });
  test("duplicate id across siblings is handled gracefully", (done) => {
    tree["a"] = {
      "aa": {}
    };
    tree["b"] = {
      "aa": {},
      "ba": {}
    };
    store.add(target.onRefresh.event(() => {
      testObject.$getChildren("testNodeWithIdTreeProvider").then((elements) => {
        const actuals = unBatchChildren(elements)?.map((e) => e.handle);
        assert.deepStrictEqual(actuals, ["1/a", "1/b"]);
        return testObject.$getChildren("testNodeWithIdTreeProvider", ["1/a"]).then(() => testObject.$getChildren("testNodeWithIdTreeProvider", ["1/b"])).then((elements2) => {
          const children = unBatchChildren(elements2)?.map((e) => e.handle);
          assert.deepStrictEqual(children, ["1/aa", "1/ba"]);
          done();
        });
      }).catch(done);
    }));
    onDidChangeTreeNode.fire(void 0);
  });
  test("different element instances with same id are replaced gracefully", async () => {
    let callCount = 0;
    const element1 = { key: "x" };
    const element2 = { key: "x" };
    const treeView = testObject.createTreeView("testRaceProvider", {
      treeDataProvider: {
        getChildren: () => {
          callCount++;
          return callCount === 1 ? [element1] : [element2];
        },
        getTreeItem: (element) => {
          return { label: { label: element.key }, id: "same-id", collapsibleState: TreeItemCollapsibleState.None };
        },
        onDidChangeTreeData: onDidChangeTreeNode.event
      }
    }, extensionsDescription);
    store.add(treeView);
    const first = await testObject.$getChildren("testRaceProvider");
    const firstChildren = unBatchChildren(first);
    assert.strictEqual(firstChildren?.length, 1);
    assert.strictEqual(firstChildren[0].handle, "1/same-id");
    const second = await testObject.$getChildren("testRaceProvider");
    const secondChildren = unBatchChildren(second);
    assert.strictEqual(secondChildren?.length, 1);
    assert.strictEqual(secondChildren[0].handle, "1/same-id");
  });
  test("refresh root", function(done) {
    store.add(target.onRefresh.event((actuals) => {
      assert.strictEqual(void 0, actuals);
      done();
    }));
    onDidChangeTreeNode.fire(void 0);
  });
  test("refresh a parent node", () => {
    return new Promise((c, e) => {
      store.add(target.onRefresh.event((actuals) => {
        assert.deepStrictEqual(["0/0:b"], Object.keys(actuals));
        assert.deepStrictEqual(removeUnsetKeys(actuals["0/0:b"]), {
          handle: "0/0:b",
          label: { label: "b" },
          collapsibleState: TreeItemCollapsibleState.Collapsed
        });
        c(void 0);
      }));
      onDidChangeTreeNode.fire(getNode("b"));
    });
  });
  test("refresh a leaf node", function(done) {
    store.add(target.onRefresh.event((actuals) => {
      assert.deepStrictEqual(["0/0:b/0:bb"], Object.keys(actuals));
      assert.deepStrictEqual(removeUnsetKeys(actuals["0/0:b/0:bb"]), {
        handle: "0/0:b/0:bb",
        parentHandle: "0/0:b",
        label: { label: "bb" },
        collapsibleState: TreeItemCollapsibleState.None
      });
      done();
    }));
    onDidChangeTreeNode.fire(getNode("bb"));
  });
  async function runWithEventMerging(action) {
    await runWithFakedTimers({}, async () => {
      await new Promise((resolve) => {
        let subscription = void 0;
        subscription = target.onRefresh.event(() => {
          subscription.dispose();
          resolve();
        });
        onDidChangeTreeNode.fire(getNode("b"));
      });
      await new Promise(action);
    });
  }
  test("refresh parent and child node trigger refresh only on parent - scenario 1", async () => {
    return runWithEventMerging((resolve) => {
      store.add(target.onRefresh.event((actuals) => {
        assert.deepStrictEqual(["0/0:b", "0/0:a/0:aa"], Object.keys(actuals));
        assert.deepStrictEqual(removeUnsetKeys(actuals["0/0:b"]), {
          handle: "0/0:b",
          label: { label: "b" },
          collapsibleState: TreeItemCollapsibleState.Collapsed
        });
        assert.deepStrictEqual(removeUnsetKeys(actuals["0/0:a/0:aa"]), {
          handle: "0/0:a/0:aa",
          parentHandle: "0/0:a",
          label: { label: "aa" },
          collapsibleState: TreeItemCollapsibleState.None
        });
        resolve();
      }));
      onDidChangeTreeNode.fire(getNode("b"));
      onDidChangeTreeNode.fire(getNode("aa"));
      onDidChangeTreeNode.fire(getNode("bb"));
    });
  });
  test("refresh parent and child node trigger refresh only on parent - scenario 2", async () => {
    return runWithEventMerging((resolve) => {
      store.add(target.onRefresh.event((actuals) => {
        assert.deepStrictEqual(["0/0:a/0:aa", "0/0:b"], Object.keys(actuals));
        assert.deepStrictEqual(removeUnsetKeys(actuals["0/0:b"]), {
          handle: "0/0:b",
          label: { label: "b" },
          collapsibleState: TreeItemCollapsibleState.Collapsed
        });
        assert.deepStrictEqual(removeUnsetKeys(actuals["0/0:a/0:aa"]), {
          handle: "0/0:a/0:aa",
          parentHandle: "0/0:a",
          label: { label: "aa" },
          collapsibleState: TreeItemCollapsibleState.None
        });
        resolve();
      }));
      onDidChangeTreeNode.fire(getNode("bb"));
      onDidChangeTreeNode.fire(getNode("aa"));
      onDidChangeTreeNode.fire(getNode("b"));
    });
  });
  test("refresh an element for label change", function(done) {
    labels["a"] = "aa";
    store.add(target.onRefresh.event((actuals) => {
      assert.deepStrictEqual(["0/0:a"], Object.keys(actuals));
      assert.deepStrictEqual(removeUnsetKeys(actuals["0/0:a"]), {
        handle: "0/0:aa",
        label: { label: "aa" },
        collapsibleState: TreeItemCollapsibleState.Collapsed
      });
      done();
    }));
    onDidChangeTreeNode.fire(getNode("a"));
  });
  test("refresh calls are throttled on roots", () => {
    return runWithEventMerging((resolve) => {
      store.add(target.onRefresh.event((actuals) => {
        assert.strictEqual(void 0, actuals);
        resolve();
      }));
      onDidChangeTreeNode.fire(void 0);
      onDidChangeTreeNode.fire(void 0);
      onDidChangeTreeNode.fire(void 0);
      onDidChangeTreeNode.fire(void 0);
    });
  });
  test("refresh calls are throttled on elements", () => {
    return runWithEventMerging((resolve) => {
      store.add(target.onRefresh.event((actuals) => {
        assert.deepStrictEqual(["0/0:a", "0/0:b"], Object.keys(actuals));
        resolve();
      }));
      onDidChangeTreeNode.fire(getNode("a"));
      onDidChangeTreeNode.fire(getNode("b"));
      onDidChangeTreeNode.fire(getNode("b"));
      onDidChangeTreeNode.fire(getNode("a"));
    });
  });
  test("refresh calls are throttled on unknown elements", () => {
    return runWithEventMerging((resolve) => {
      store.add(target.onRefresh.event((actuals) => {
        assert.deepStrictEqual(["0/0:a", "0/0:b"], Object.keys(actuals));
        resolve();
      }));
      onDidChangeTreeNode.fire(getNode("a"));
      onDidChangeTreeNode.fire(getNode("b"));
      onDidChangeTreeNode.fire(getNode("g"));
      onDidChangeTreeNode.fire(getNode("a"));
    });
  });
  test("refresh calls are throttled on unknown elements and root", () => {
    return runWithEventMerging((resolve) => {
      store.add(target.onRefresh.event((actuals) => {
        assert.strictEqual(void 0, actuals);
        resolve();
      }));
      onDidChangeTreeNode.fire(getNode("a"));
      onDidChangeTreeNode.fire(getNode("b"));
      onDidChangeTreeNode.fire(getNode("g"));
      onDidChangeTreeNode.fire(void 0);
    });
  });
  test("refresh calls are throttled on elements and root", () => {
    return runWithEventMerging((resolve) => {
      store.add(target.onRefresh.event((actuals) => {
        assert.strictEqual(void 0, actuals);
        resolve();
      }));
      onDidChangeTreeNode.fire(getNode("a"));
      onDidChangeTreeNode.fire(getNode("b"));
      onDidChangeTreeNode.fire(void 0);
      onDidChangeTreeNode.fire(getNode("a"));
    });
  });
  test("generate unique handles from labels by escaping them", (done) => {
    tree = {
      "a/0:b": {}
    };
    store.add(target.onRefresh.event(() => {
      testObject.$getChildren("testNodeTreeProvider").then((elements) => {
        assert.deepStrictEqual(unBatchChildren(elements)?.map((e) => e.handle), ["0/0:a//0:b"]);
        done();
      });
    }));
    onDidChangeTreeNode.fire(void 0);
  });
  test("tree with duplicate labels", (done) => {
    const dupItems = {
      "adup1": "c",
      "adup2": "g",
      "bdup1": "e",
      "hdup1": "i",
      "hdup2": "l",
      "jdup1": "k"
    };
    labels["c"] = "a";
    labels["e"] = "b";
    labels["g"] = "a";
    labels["i"] = "h";
    labels["l"] = "h";
    labels["k"] = "j";
    tree[dupItems["adup1"]] = {};
    tree["d"] = {};
    const bdup1Tree = {};
    bdup1Tree["h"] = {};
    bdup1Tree[dupItems["hdup1"]] = {};
    bdup1Tree["j"] = {};
    bdup1Tree[dupItems["jdup1"]] = {};
    bdup1Tree[dupItems["hdup2"]] = {};
    tree[dupItems["bdup1"]] = bdup1Tree;
    tree["f"] = {};
    tree[dupItems["adup2"]] = {};
    store.add(target.onRefresh.event(() => {
      testObject.$getChildren("testNodeTreeProvider").then((elements) => {
        const actuals = unBatchChildren(elements)?.map((e) => e.handle);
        assert.deepStrictEqual(actuals, ["0/0:a", "0/0:b", "0/1:a", "0/0:d", "0/1:b", "0/0:f", "0/2:a"]);
        return testObject.$getChildren("testNodeTreeProvider", ["0/1:b"]).then((elements2) => {
          const actuals2 = unBatchChildren(elements2)?.map((e) => e.handle);
          assert.deepStrictEqual(actuals2, ["0/1:b/0:h", "0/1:b/1:h", "0/1:b/0:j", "0/1:b/1:j", "0/1:b/2:h"]);
          done();
        });
      });
    }));
    onDidChangeTreeNode.fire(void 0);
  });
  test("getChildren is not returned from cache if refreshed", (done) => {
    tree = {
      "c": {}
    };
    store.add(target.onRefresh.event(() => {
      testObject.$getChildren("testNodeTreeProvider").then((elements) => {
        assert.deepStrictEqual(unBatchChildren(elements)?.map((e) => e.handle), ["0/0:c"]);
        done();
      });
    }));
    onDidChangeTreeNode.fire(void 0);
  });
  test("getChildren is returned from cache if not refreshed", () => {
    tree = {
      "c": {}
    };
    return testObject.$getChildren("testNodeTreeProvider").then((elements) => {
      assert.deepStrictEqual(unBatchChildren(elements)?.map((e) => e.handle), ["0/0:a", "0/0:b"]);
    });
  });
  test("dispose and re-register tree view", async () => {
    const disposeTreeSpy = sinon.spy(target, "$disposeTree");
    const registerSpy = sinon.spy(target, "$registerTreeViewDataProvider");
    const treeView1 = testObject.createTreeView("reRegisterTreeProvider", { treeDataProvider: aNodeTreeDataProvider() }, extensionsDescription);
    treeView1.dispose();
    const treeView2 = testObject.createTreeView("reRegisterTreeProvider", { treeDataProvider: aNodeTreeDataProvider() }, extensionsDescription);
    await new Promise((r) => setTimeout(r, 0));
    const elements = await testObject.$getChildren("reRegisterTreeProvider");
    assert.deepStrictEqual(unBatchChildren(elements)?.map((e) => e.handle), ["0/0:a", "0/0:b"]);
    assert.strictEqual(registerSpy.callCount, 2);
    assert.strictEqual(disposeTreeSpy.callCount, 0);
    treeView2.dispose();
  });
  test("reveal will throw an error if getParent is not implemented", () => {
    const treeView = testObject.createTreeView("treeDataProvider", { treeDataProvider: aNodeTreeDataProvider() }, extensionsDescription);
    return treeView.reveal({ key: "a" }).then(() => assert.fail("Reveal should throw an error as getParent is not implemented"), () => null);
  });
  test("reveal will return empty array for root element", () => {
    const revealTarget = sinon.spy(target, "$reveal");
    const treeView = testObject.createTreeView("treeDataProvider", { treeDataProvider: aCompleteNodeTreeDataProvider() }, extensionsDescription);
    const expected = {
      item: { handle: "0/0:a", label: { label: "a" }, collapsibleState: TreeItemCollapsibleState.Collapsed },
      parentChain: []
    };
    return treeView.reveal({ key: "a" }).then(() => {
      assert.ok(revealTarget.calledOnce);
      assert.deepStrictEqual("treeDataProvider", revealTarget.args[0][0]);
      assert.deepStrictEqual(expected, removeUnsetKeys(revealTarget.args[0][1]));
      assert.deepStrictEqual({ select: true, focus: false, expand: false }, revealTarget.args[0][2]);
    });
  });
  test("reveal will return parents array for an element when hierarchy is not loaded", () => {
    const revealTarget = sinon.spy(target, "$reveal");
    const treeView = testObject.createTreeView("treeDataProvider", { treeDataProvider: aCompleteNodeTreeDataProvider() }, extensionsDescription);
    const expected = {
      item: { handle: "0/0:a/0:aa", label: { label: "aa" }, collapsibleState: TreeItemCollapsibleState.None, parentHandle: "0/0:a" },
      parentChain: [{ handle: "0/0:a", label: { label: "a" }, collapsibleState: TreeItemCollapsibleState.Collapsed }]
    };
    return treeView.reveal({ key: "aa" }).then(() => {
      assert.ok(revealTarget.calledOnce);
      assert.deepStrictEqual("treeDataProvider", revealTarget.args[0][0]);
      assert.deepStrictEqual(expected.item, removeUnsetKeys(revealTarget.args[0][1].item));
      assert.deepStrictEqual(expected.parentChain, revealTarget.args[0][1].parentChain.map((arg) => removeUnsetKeys(arg)));
      assert.deepStrictEqual({ select: true, focus: false, expand: false }, revealTarget.args[0][2]);
    });
  });
  test("reveal will return parents array for an element when hierarchy is loaded", () => {
    const revealTarget = sinon.spy(target, "$reveal");
    const treeView = testObject.createTreeView("treeDataProvider", { treeDataProvider: aCompleteNodeTreeDataProvider() }, extensionsDescription);
    const expected = {
      item: { handle: "0/0:a/0:aa", label: { label: "aa" }, collapsibleState: TreeItemCollapsibleState.None, parentHandle: "0/0:a" },
      parentChain: [{ handle: "0/0:a", label: { label: "a" }, collapsibleState: TreeItemCollapsibleState.Collapsed }]
    };
    return testObject.$getChildren("treeDataProvider").then(() => testObject.$getChildren("treeDataProvider", ["0/0:a"])).then(() => treeView.reveal({ key: "aa" }).then(() => {
      assert.ok(revealTarget.calledOnce);
      assert.deepStrictEqual("treeDataProvider", revealTarget.args[0][0]);
      assert.deepStrictEqual(expected.item, removeUnsetKeys(revealTarget.args[0][1].item));
      assert.deepStrictEqual(expected.parentChain, revealTarget.args[0][1].parentChain.map((arg) => removeUnsetKeys(arg)));
      assert.deepStrictEqual({ select: true, focus: false, expand: false }, revealTarget.args[0][2]);
    }));
  });
  test("reveal will return parents array for deeper element with no selection", () => {
    tree = {
      "b": {
        "ba": {
          "bac": {}
        }
      }
    };
    const revealTarget = sinon.spy(target, "$reveal");
    const treeView = testObject.createTreeView("treeDataProvider", { treeDataProvider: aCompleteNodeTreeDataProvider() }, extensionsDescription);
    const expected = {
      item: { handle: "0/0:b/0:ba/0:bac", label: { label: "bac" }, collapsibleState: TreeItemCollapsibleState.None, parentHandle: "0/0:b/0:ba" },
      parentChain: [
        { handle: "0/0:b", label: { label: "b" }, collapsibleState: TreeItemCollapsibleState.Collapsed },
        { handle: "0/0:b/0:ba", label: { label: "ba" }, collapsibleState: TreeItemCollapsibleState.Collapsed, parentHandle: "0/0:b" }
      ]
    };
    return treeView.reveal({ key: "bac" }, { select: false, focus: false, expand: false }).then(() => {
      assert.ok(revealTarget.calledOnce);
      assert.deepStrictEqual("treeDataProvider", revealTarget.args[0][0]);
      assert.deepStrictEqual(expected.item, removeUnsetKeys(revealTarget.args[0][1].item));
      assert.deepStrictEqual(expected.parentChain, revealTarget.args[0][1].parentChain.map((arg) => removeUnsetKeys(arg)));
      assert.deepStrictEqual({ select: false, focus: false, expand: false }, revealTarget.args[0][2]);
    });
  });
  test("reveal after first udpate", () => {
    const revealTarget = sinon.spy(target, "$reveal");
    const treeView = testObject.createTreeView("treeDataProvider", { treeDataProvider: aCompleteNodeTreeDataProvider() }, extensionsDescription);
    const expected = {
      item: { handle: "0/0:a/0:ac", label: { label: "ac" }, collapsibleState: TreeItemCollapsibleState.None, parentHandle: "0/0:a" },
      parentChain: [{ handle: "0/0:a", label: { label: "a" }, collapsibleState: TreeItemCollapsibleState.Collapsed }]
    };
    return loadCompleteTree("treeDataProvider").then(() => {
      tree = {
        "a": {
          "aa": {},
          "ac": {}
        },
        "b": {
          "ba": {},
          "bb": {}
        }
      };
      onDidChangeTreeNode.fire(getNode("a"));
      return treeView.reveal({ key: "ac" }).then(() => {
        assert.ok(revealTarget.calledOnce);
        assert.deepStrictEqual("treeDataProvider", revealTarget.args[0][0]);
        assert.deepStrictEqual(expected.item, removeUnsetKeys(revealTarget.args[0][1].item));
        assert.deepStrictEqual(expected.parentChain, revealTarget.args[0][1].parentChain.map((arg) => removeUnsetKeys(arg)));
        assert.deepStrictEqual({ select: true, focus: false, expand: false }, revealTarget.args[0][2]);
      });
    });
  });
  test("reveal after second udpate", () => {
    const revealTarget = sinon.spy(target, "$reveal");
    const treeView = testObject.createTreeView("treeDataProvider", { treeDataProvider: aCompleteNodeTreeDataProvider() }, extensionsDescription);
    return loadCompleteTree("treeDataProvider").then(() => {
      return runWithEventMerging((resolve) => {
        tree = {
          "a": {
            "aa": {},
            "ac": {}
          },
          "b": {
            "ba": {},
            "bb": {}
          }
        };
        onDidChangeTreeNode.fire(getNode("a"));
        tree = {
          "a": {
            "aa": {},
            "ac": {}
          },
          "b": {
            "ba": {},
            "bc": {}
          }
        };
        onDidChangeTreeNode.fire(getNode("b"));
        resolve();
      }).then(() => {
        return treeView.reveal({ key: "bc" }).then(() => {
          assert.ok(revealTarget.calledOnce);
          assert.deepStrictEqual("treeDataProvider", revealTarget.args[0][0]);
          assert.deepStrictEqual({ handle: "0/0:b/0:bc", label: { label: "bc" }, collapsibleState: TreeItemCollapsibleState.None, parentHandle: "0/0:b" }, removeUnsetKeys(revealTarget.args[0][1].item));
          assert.deepStrictEqual([{ handle: "0/0:b", label: { label: "b" }, collapsibleState: TreeItemCollapsibleState.Collapsed }], revealTarget.args[0][1].parentChain.map((arg) => removeUnsetKeys(arg)));
          assert.deepStrictEqual({ select: true, focus: false, expand: false }, revealTarget.args[0][2]);
        });
      });
    });
  });
  function loadCompleteTree(treeId, element) {
    return testObject.$getChildren(treeId, element ? [element] : void 0).then((elements) => {
      if (!elements || elements?.length === 0) {
        return null;
      }
      return elements[0].slice(1).map((e) => loadCompleteTree(treeId, e.handle));
    }).then(() => null);
  }
  function removeUnsetKeys(obj) {
    if (Array.isArray(obj)) {
      return obj.map((o) => removeUnsetKeys(o));
    }
    if (typeof obj === "object") {
      const result = {};
      for (const key of Object.keys(obj)) {
        if (obj[key] !== void 0) {
          result[key] = removeUnsetKeys(obj[key]);
        }
      }
      return result;
    }
    return obj;
  }
  function aNodeTreeDataProvider() {
    return {
      getChildren: (element) => {
        return getChildren(element ? element.key : void 0).map((key) => getNode(key));
      },
      getTreeItem: (element) => {
        return getTreeItem(element.key);
      },
      onDidChangeTreeData: onDidChangeTreeNode.event
    };
  }
  function aCompleteNodeTreeDataProvider() {
    return {
      getChildren: (element) => {
        return getChildren(element ? element.key : void 0).map((key) => getNode(key));
      },
      getTreeItem: (element) => {
        return getTreeItem(element.key);
      },
      getParent: ({ key }) => {
        const parentKey = key.substring(0, key.length - 1);
        return parentKey ? new Key(parentKey) : void 0;
      },
      onDidChangeTreeData: onDidChangeTreeNode.event
    };
  }
  function aNodeWithIdTreeDataProvider() {
    return {
      getChildren: (element) => {
        return getChildren(element ? element.key : void 0).map((key) => getNode(key));
      },
      getTreeItem: (element) => {
        const treeItem = getTreeItem(element.key);
        treeItem.id = element.key;
        return treeItem;
      },
      onDidChangeTreeData: onDidChangeTreeNodeWithId.event
    };
  }
  function aNodeWithHighlightedLabelTreeDataProvider() {
    return {
      getChildren: (element) => {
        return getChildren(element ? element.key : void 0).map((key) => getNode(key));
      },
      getTreeItem: (element) => {
        const treeItem = getTreeItem(element.key, [[0, 2], [3, 5]]);
        treeItem.id = element.key;
        return treeItem;
      },
      onDidChangeTreeData: onDidChangeTreeNodeWithId.event
    };
  }
  function getTreeElement(element) {
    let parent = tree;
    for (let i = 0; i < element.length; i++) {
      parent = parent[element.substring(0, i + 1)];
      if (!parent) {
        return null;
      }
    }
    return parent;
  }
  function getChildren(key) {
    if (!key) {
      return Object.keys(tree);
    }
    const treeElement = getTreeElement(key);
    if (treeElement) {
      return Object.keys(treeElement);
    }
    return [];
  }
  function getTreeItem(key, highlights) {
    const treeElement = getTreeElement(key);
    return {
      label: { label: labels[key] || key, highlights },
      collapsibleState: treeElement && Object.keys(treeElement).length ? TreeItemCollapsibleState.Collapsed : TreeItemCollapsibleState.None
    };
  }
  function getNode(key) {
    if (!nodes[key]) {
      nodes[key] = new Key(key);
    }
    return nodes[key];
  }
  class Key {
    constructor(key) {
      this.key = key;
    }
  }
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGFwaVxcdGVzdFxcYnJvd3NlclxcZXh0SG9zdFRyZWVWaWV3cy50ZXN0LnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IGFzc2VydCBmcm9tICdhc3NlcnQnO1xuaW1wb3J0ICogYXMgc2lub24gZnJvbSAnc2lub24nO1xuaW1wb3J0IHsgRW1pdHRlciB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2V2ZW50LmpzJztcbmltcG9ydCB7IEV4dEhvc3RUcmVlVmlld3MgfSBmcm9tICcuLi8uLi9jb21tb24vZXh0SG9zdFRyZWVWaWV3cy5qcyc7XG5pbXBvcnQgeyBFeHRIb3N0Q29tbWFuZHMgfSBmcm9tICcuLi8uLi9jb21tb24vZXh0SG9zdENvbW1hbmRzLmpzJztcbmltcG9ydCB7IE1haW5UaHJlYWRUcmVlVmlld3NTaGFwZSwgTWFpbkNvbnRleHQsIE1haW5UaHJlYWRDb21tYW5kc1NoYXBlIH0gZnJvbSAnLi4vLi4vY29tbW9uL2V4dEhvc3QucHJvdG9jb2wuanMnO1xuaW1wb3J0IHsgVHJlZURhdGFQcm92aWRlciwgVHJlZUl0ZW0gfSBmcm9tICd2c2NvZGUnO1xuaW1wb3J0IHsgVGVzdFJQQ1Byb3RvY29sIH0gZnJvbSAnLi4vY29tbW9uL3Rlc3RSUENQcm90b2NvbC5qcyc7XG5pbXBvcnQgeyBtb2NrIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS90ZXN0L2NvbW1vbi9tb2NrLmpzJztcbmltcG9ydCB7IFRyZWVJdGVtQ29sbGFwc2libGVTdGF0ZSwgSVRyZWVJdGVtLCBJUmV2ZWFsT3B0aW9ucyB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi92aWV3cy5qcyc7XG5pbXBvcnQgeyBOdWxsTG9nU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2xvZy9jb21tb24vbG9nLmpzJztcbmltcG9ydCB0eXBlIHsgSURpc3Bvc2FibGUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgbnVsbEV4dGVuc2lvbkRlc2NyaXB0aW9uIGFzIGV4dGVuc2lvbnNEZXNjcmlwdGlvbiB9IGZyb20gJy4uLy4uLy4uL3NlcnZpY2VzL2V4dGVuc2lvbnMvY29tbW9uL2V4dGVuc2lvbnMuanMnO1xuaW1wb3J0IHsgcnVuV2l0aEZha2VkVGltZXJzIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS90ZXN0L2NvbW1vbi90aW1lVHJhdmVsU2NoZWR1bGVyLmpzJztcbmltcG9ydCB7IElFeHRIb3N0VGVsZW1ldHJ5IH0gZnJvbSAnLi4vLi4vY29tbW9uL2V4dEhvc3RUZWxlbWV0cnkuanMnO1xuaW1wb3J0IHsgZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS90ZXN0L2NvbW1vbi91dGlscy5qcyc7XG5cbmZ1bmN0aW9uIHVuQmF0Y2hDaGlsZHJlbihyZXN1bHQ6IChyZWFkb25seSAobnVtYmVyIHwgSVRyZWVJdGVtKVtdKVtdIHwgdW5kZWZpbmVkKTogcmVhZG9ubHkgSVRyZWVJdGVtW10gfCB1bmRlZmluZWQge1xuXHRpZiAoIXJlc3VsdCB8fCByZXN1bHQubGVuZ3RoID09PSAwKSB7XG5cdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0fVxuXHRpZiAocmVzdWx0Lmxlbmd0aCA+IDEpIHtcblx0XHR0aHJvdyBuZXcgRXJyb3IoJ1VuZXhwZWN0ZWQgcmVzdWx0IGxlbmd0aCwgYWxsIHRlc3RzIGFyZSB1bmJhdGNoZWQuJyk7XG5cdH1cblx0cmV0dXJuIHJlc3VsdFswXS5zbGljZSgxKSBhcyByZWFkb25seSBJVHJlZUl0ZW1bXTtcbn1cblxuc3VpdGUoJ0V4dEhvc3RUcmVlVmlldycsIGZ1bmN0aW9uICgpIHtcblx0Y29uc3Qgc3RvcmUgPSBlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUoKTtcblxuXHRjbGFzcyBSZWNvcmRpbmdTaGFwZSBleHRlbmRzIG1vY2s8TWFpblRocmVhZFRyZWVWaWV3c1NoYXBlPigpIHtcblxuXHRcdG9uUmVmcmVzaCA9IG5ldyBFbWl0dGVyPHsgW3RyZWVJdGVtSGFuZGxlOiBzdHJpbmddOiBJVHJlZUl0ZW0gfT4oKTtcblxuXHRcdG92ZXJyaWRlIGFzeW5jICRyZWdpc3RlclRyZWVWaWV3RGF0YVByb3ZpZGVyKHRyZWVWaWV3SWQ6IHN0cmluZyk6IFByb21pc2U8dm9pZD4ge1xuXHRcdH1cblxuXHRcdG92ZXJyaWRlICRyZWZyZXNoKHZpZXdJZDogc3RyaW5nLCBpdGVtc1RvUmVmcmVzaDogeyBbdHJlZUl0ZW1IYW5kbGU6IHN0cmluZ106IElUcmVlSXRlbSB9KTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0XHRyZXR1cm4gUHJvbWlzZS5yZXNvbHZlKG51bGwpLnRoZW4oKCkgPT4ge1xuXHRcdFx0XHR0aGlzLm9uUmVmcmVzaC5maXJlKGl0ZW1zVG9SZWZyZXNoKTtcblx0XHRcdH0pO1xuXHRcdH1cblxuXHRcdG92ZXJyaWRlICRyZXZlYWwodHJlZVZpZXdJZDogc3RyaW5nLCBpdGVtSW5mbzogeyBpdGVtOiBJVHJlZUl0ZW07IHBhcmVudENoYWluOiBJVHJlZUl0ZW1bXSB9IHwgdW5kZWZpbmVkLCBvcHRpb25zOiBJUmV2ZWFsT3B0aW9ucyk6IFByb21pc2U8dm9pZD4ge1xuXHRcdFx0cmV0dXJuIFByb21pc2UucmVzb2x2ZSgpO1xuXHRcdH1cblxuXHRcdG92ZXJyaWRlICRkaXNwb3NlVHJlZSh0cmVlVmlld0lkOiBzdHJpbmcpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRcdHJldHVybiBQcm9taXNlLnJlc29sdmUoKTtcblx0XHR9XG5cblx0fVxuXG5cdGxldCB0ZXN0T2JqZWN0OiBFeHRIb3N0VHJlZVZpZXdzO1xuXHRsZXQgdGFyZ2V0OiBSZWNvcmRpbmdTaGFwZTtcblx0bGV0IG9uRGlkQ2hhbmdlVHJlZU5vZGU6IEVtaXR0ZXI8eyBrZXk6IHN0cmluZyB9IHwgdW5kZWZpbmVkPjtcblx0bGV0IG9uRGlkQ2hhbmdlVHJlZU5vZGVXaXRoSWQ6IEVtaXR0ZXI8eyBrZXk6IHN0cmluZyB9Pjtcblx0bGV0IHRyZWU6IHsgW2tleTogc3RyaW5nXTogYW55IH07XG5cdGxldCBsYWJlbHM6IHsgW2tleTogc3RyaW5nXTogc3RyaW5nIH07XG5cdGxldCBub2RlczogeyBba2V5OiBzdHJpbmddOiB7IGtleTogc3RyaW5nIH0gfTtcblxuXHRzZXR1cCgoKSA9PiB7XG5cdFx0dHJlZSA9IHtcblx0XHRcdCdhJzoge1xuXHRcdFx0XHQnYWEnOiB7fSxcblx0XHRcdFx0J2FiJzoge31cblx0XHRcdH0sXG5cdFx0XHQnYic6IHtcblx0XHRcdFx0J2JhJzoge30sXG5cdFx0XHRcdCdiYic6IHt9XG5cdFx0XHR9XG5cdFx0fTtcblxuXHRcdGxhYmVscyA9IHt9O1xuXHRcdG5vZGVzID0ge307XG5cblx0XHRjb25zdCBycGNQcm90b2NvbCA9IG5ldyBUZXN0UlBDUHJvdG9jb2woKTtcblxuXHRcdHJwY1Byb3RvY29sLnNldChNYWluQ29udGV4dC5NYWluVGhyZWFkQ29tbWFuZHMsIG5ldyBjbGFzcyBleHRlbmRzIG1vY2s8TWFpblRocmVhZENvbW1hbmRzU2hhcGU+KCkge1xuXHRcdFx0b3ZlcnJpZGUgJHJlZ2lzdGVyQ29tbWFuZCgpIHsgfVxuXHRcdH0pO1xuXHRcdHRhcmdldCA9IG5ldyBSZWNvcmRpbmdTaGFwZSgpO1xuXHRcdHRlc3RPYmplY3QgPSBzdG9yZS5hZGQobmV3IEV4dEhvc3RUcmVlVmlld3ModGFyZ2V0LCBuZXcgRXh0SG9zdENvbW1hbmRzKFxuXHRcdFx0cnBjUHJvdG9jb2wsXG5cdFx0XHRuZXcgTnVsbExvZ1NlcnZpY2UoKSxcblx0XHRcdG5ldyBjbGFzcyBleHRlbmRzIG1vY2s8SUV4dEhvc3RUZWxlbWV0cnk+KCkge1xuXHRcdFx0XHRvdmVycmlkZSBvbkV4dGVuc2lvbkVycm9yKCk6IGJvb2xlYW4ge1xuXHRcdFx0XHRcdHJldHVybiB0cnVlO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0KSwgbmV3IE51bGxMb2dTZXJ2aWNlKCkpKTtcblx0XHRvbkRpZENoYW5nZVRyZWVOb2RlID0gbmV3IEVtaXR0ZXI8eyBrZXk6IHN0cmluZyB9IHwgdW5kZWZpbmVkPigpO1xuXHRcdG9uRGlkQ2hhbmdlVHJlZU5vZGVXaXRoSWQgPSBuZXcgRW1pdHRlcjx7IGtleTogc3RyaW5nIH0+KCk7XG5cdFx0dGVzdE9iamVjdC5jcmVhdGVUcmVlVmlldygndGVzdE5vZGVUcmVlUHJvdmlkZXInLCB7IHRyZWVEYXRhUHJvdmlkZXI6IGFOb2RlVHJlZURhdGFQcm92aWRlcigpIH0sIGV4dGVuc2lvbnNEZXNjcmlwdGlvbik7XG5cdFx0dGVzdE9iamVjdC5jcmVhdGVUcmVlVmlldygndGVzdE5vZGVXaXRoSWRUcmVlUHJvdmlkZXInLCB7IHRyZWVEYXRhUHJvdmlkZXI6IGFOb2RlV2l0aElkVHJlZURhdGFQcm92aWRlcigpIH0sIGV4dGVuc2lvbnNEZXNjcmlwdGlvbik7XG5cdFx0dGVzdE9iamVjdC5jcmVhdGVUcmVlVmlldygndGVzdE5vZGVXaXRoSGlnaGxpZ2h0c1RyZWVQcm92aWRlcicsIHsgdHJlZURhdGFQcm92aWRlcjogYU5vZGVXaXRoSGlnaGxpZ2h0ZWRMYWJlbFRyZWVEYXRhUHJvdmlkZXIoKSB9LCBleHRlbnNpb25zRGVzY3JpcHRpb24pO1xuXG5cdFx0cmV0dXJuIGxvYWRDb21wbGV0ZVRyZWUoJ3Rlc3ROb2RlVHJlZVByb3ZpZGVyJyk7XG5cdH0pO1xuXG5cdHRlc3QoJ2NvbnN0cnVjdCBub2RlIHRyZWUnLCAoKSA9PiB7XG5cdFx0cmV0dXJuIHRlc3RPYmplY3QuJGdldENoaWxkcmVuKCd0ZXN0Tm9kZVRyZWVQcm92aWRlcicpXG5cdFx0XHQudGhlbihlbGVtZW50cyA9PiB7XG5cdFx0XHRcdGNvbnN0IGFjdHVhbHMgPSB1bkJhdGNoQ2hpbGRyZW4oZWxlbWVudHMpPy5tYXAoZSA9PiBlLmhhbmRsZSk7XG5cdFx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoYWN0dWFscywgWycwLzA6YScsICcwLzA6YiddKTtcblx0XHRcdFx0cmV0dXJuIFByb21pc2UuYWxsKFtcblx0XHRcdFx0XHR0ZXN0T2JqZWN0LiRnZXRDaGlsZHJlbigndGVzdE5vZGVUcmVlUHJvdmlkZXInLCBbJzAvMDphJ10pXG5cdFx0XHRcdFx0XHQudGhlbihjaGlsZHJlbiA9PiB7XG5cdFx0XHRcdFx0XHRcdGNvbnN0IGFjdHVhbHMgPSB1bkJhdGNoQ2hpbGRyZW4oY2hpbGRyZW4pPy5tYXAoZSA9PiBlLmhhbmRsZSk7XG5cdFx0XHRcdFx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoYWN0dWFscywgWycwLzA6YS8wOmFhJywgJzAvMDphLzA6YWInXSk7XG5cdFx0XHRcdFx0XHRcdHJldHVybiBQcm9taXNlLmFsbChbXG5cdFx0XHRcdFx0XHRcdFx0dGVzdE9iamVjdC4kZ2V0Q2hpbGRyZW4oJ3Rlc3ROb2RlVHJlZVByb3ZpZGVyJywgWycwLzA6YS8wOmFhJ10pLnRoZW4oY2hpbGRyZW4gPT4gYXNzZXJ0LnN0cmljdEVxdWFsKHVuQmF0Y2hDaGlsZHJlbihjaGlsZHJlbik/Lmxlbmd0aCwgMCkpLFxuXHRcdFx0XHRcdFx0XHRcdHRlc3RPYmplY3QuJGdldENoaWxkcmVuKCd0ZXN0Tm9kZVRyZWVQcm92aWRlcicsIFsnMC8wOmEvMDphYiddKS50aGVuKGNoaWxkcmVuID0+IGFzc2VydC5zdHJpY3RFcXVhbCh1bkJhdGNoQ2hpbGRyZW4oY2hpbGRyZW4pPy5sZW5ndGgsIDApKVxuXHRcdFx0XHRcdFx0XHRdKTtcblx0XHRcdFx0XHRcdH0pLFxuXHRcdFx0XHRcdHRlc3RPYmplY3QuJGdldENoaWxkcmVuKCd0ZXN0Tm9kZVRyZWVQcm92aWRlcicsIFsnMC8wOmInXSlcblx0XHRcdFx0XHRcdC50aGVuKGNoaWxkcmVuID0+IHtcblx0XHRcdFx0XHRcdFx0Y29uc3QgYWN0dWFscyA9IHVuQmF0Y2hDaGlsZHJlbihjaGlsZHJlbik/Lm1hcChlID0+IGUuaGFuZGxlKTtcblx0XHRcdFx0XHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChhY3R1YWxzLCBbJzAvMDpiLzA6YmEnLCAnMC8wOmIvMDpiYiddKTtcblx0XHRcdFx0XHRcdFx0cmV0dXJuIFByb21pc2UuYWxsKFtcblx0XHRcdFx0XHRcdFx0XHR0ZXN0T2JqZWN0LiRnZXRDaGlsZHJlbigndGVzdE5vZGVUcmVlUHJvdmlkZXInLCBbJzAvMDpiLzA6YmEnXSkudGhlbihjaGlsZHJlbiA9PiBhc3NlcnQuc3RyaWN0RXF1YWwodW5CYXRjaENoaWxkcmVuKGNoaWxkcmVuKT8ubGVuZ3RoLCAwKSksXG5cdFx0XHRcdFx0XHRcdFx0dGVzdE9iamVjdC4kZ2V0Q2hpbGRyZW4oJ3Rlc3ROb2RlVHJlZVByb3ZpZGVyJywgWycwLzA6Yi8wOmJiJ10pLnRoZW4oY2hpbGRyZW4gPT4gYXNzZXJ0LnN0cmljdEVxdWFsKHVuQmF0Y2hDaGlsZHJlbihjaGlsZHJlbik/Lmxlbmd0aCwgMCkpXG5cdFx0XHRcdFx0XHRcdF0pO1xuXHRcdFx0XHRcdFx0fSlcblx0XHRcdFx0XSk7XG5cdFx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnY29uc3RydWN0IGlkIHRyZWUnLCAoKSA9PiB7XG5cdFx0cmV0dXJuIHRlc3RPYmplY3QuJGdldENoaWxkcmVuKCd0ZXN0Tm9kZVdpdGhJZFRyZWVQcm92aWRlcicpXG5cdFx0XHQudGhlbihlbGVtZW50cyA9PiB7XG5cdFx0XHRcdGNvbnN0IGFjdHVhbHMgPSB1bkJhdGNoQ2hpbGRyZW4oZWxlbWVudHMpPy5tYXAoZSA9PiBlLmhhbmRsZSk7XG5cdFx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoYWN0dWFscywgWycxL2EnLCAnMS9iJ10pO1xuXHRcdFx0XHRyZXR1cm4gUHJvbWlzZS5hbGwoW1xuXHRcdFx0XHRcdHRlc3RPYmplY3QuJGdldENoaWxkcmVuKCd0ZXN0Tm9kZVdpdGhJZFRyZWVQcm92aWRlcicsIFsnMS9hJ10pXG5cdFx0XHRcdFx0XHQudGhlbihjaGlsZHJlbiA9PiB7XG5cdFx0XHRcdFx0XHRcdGNvbnN0IGFjdHVhbHMgPSB1bkJhdGNoQ2hpbGRyZW4oY2hpbGRyZW4pPy5tYXAoZSA9PiBlLmhhbmRsZSk7XG5cdFx0XHRcdFx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoYWN0dWFscywgWycxL2FhJywgJzEvYWInXSk7XG5cdFx0XHRcdFx0XHRcdHJldHVybiBQcm9taXNlLmFsbChbXG5cdFx0XHRcdFx0XHRcdFx0dGVzdE9iamVjdC4kZ2V0Q2hpbGRyZW4oJ3Rlc3ROb2RlV2l0aElkVHJlZVByb3ZpZGVyJywgWycxL2FhJ10pLnRoZW4oY2hpbGRyZW4gPT4gYXNzZXJ0LnN0cmljdEVxdWFsKHVuQmF0Y2hDaGlsZHJlbihjaGlsZHJlbik/Lmxlbmd0aCwgMCkpLFxuXHRcdFx0XHRcdFx0XHRcdHRlc3RPYmplY3QuJGdldENoaWxkcmVuKCd0ZXN0Tm9kZVdpdGhJZFRyZWVQcm92aWRlcicsIFsnMS9hYiddKS50aGVuKGNoaWxkcmVuID0+IGFzc2VydC5zdHJpY3RFcXVhbCh1bkJhdGNoQ2hpbGRyZW4oY2hpbGRyZW4pPy5sZW5ndGgsIDApKVxuXHRcdFx0XHRcdFx0XHRdKTtcblx0XHRcdFx0XHRcdH0pLFxuXHRcdFx0XHRcdHRlc3RPYmplY3QuJGdldENoaWxkcmVuKCd0ZXN0Tm9kZVdpdGhJZFRyZWVQcm92aWRlcicsIFsnMS9iJ10pXG5cdFx0XHRcdFx0XHQudGhlbihjaGlsZHJlbiA9PiB7XG5cdFx0XHRcdFx0XHRcdGNvbnN0IGFjdHVhbHMgPSB1bkJhdGNoQ2hpbGRyZW4oY2hpbGRyZW4pPy5tYXAoZSA9PiBlLmhhbmRsZSk7XG5cdFx0XHRcdFx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoYWN0dWFscywgWycxL2JhJywgJzEvYmInXSk7XG5cdFx0XHRcdFx0XHRcdHJldHVybiBQcm9taXNlLmFsbChbXG5cdFx0XHRcdFx0XHRcdFx0dGVzdE9iamVjdC4kZ2V0Q2hpbGRyZW4oJ3Rlc3ROb2RlV2l0aElkVHJlZVByb3ZpZGVyJywgWycxL2JhJ10pLnRoZW4oY2hpbGRyZW4gPT4gYXNzZXJ0LnN0cmljdEVxdWFsKHVuQmF0Y2hDaGlsZHJlbihjaGlsZHJlbik/Lmxlbmd0aCwgMCkpLFxuXHRcdFx0XHRcdFx0XHRcdHRlc3RPYmplY3QuJGdldENoaWxkcmVuKCd0ZXN0Tm9kZVdpdGhJZFRyZWVQcm92aWRlcicsIFsnMS9iYiddKS50aGVuKGNoaWxkcmVuID0+IGFzc2VydC5zdHJpY3RFcXVhbCh1bkJhdGNoQ2hpbGRyZW4oY2hpbGRyZW4pPy5sZW5ndGgsIDApKVxuXHRcdFx0XHRcdFx0XHRdKTtcblx0XHRcdFx0XHRcdH0pXG5cdFx0XHRcdF0pO1xuXHRcdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2NvbnN0cnVjdCBoaWdobGlnaHRzIHRyZWUnLCAoKSA9PiB7XG5cdFx0cmV0dXJuIHRlc3RPYmplY3QuJGdldENoaWxkcmVuKCd0ZXN0Tm9kZVdpdGhIaWdobGlnaHRzVHJlZVByb3ZpZGVyJylcblx0XHRcdC50aGVuKGVsZW1lbnRzID0+IHtcblx0XHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChyZW1vdmVVbnNldEtleXModW5CYXRjaENoaWxkcmVuKGVsZW1lbnRzKSksIFt7XG5cdFx0XHRcdFx0aGFuZGxlOiAnMS9hJyxcblx0XHRcdFx0XHRsYWJlbDogeyBsYWJlbDogJ2EnLCBoaWdobGlnaHRzOiBbWzAsIDJdLCBbMywgNV1dIH0sXG5cdFx0XHRcdFx0Y29sbGFwc2libGVTdGF0ZTogVHJlZUl0ZW1Db2xsYXBzaWJsZVN0YXRlLkNvbGxhcHNlZFxuXHRcdFx0XHR9LCB7XG5cdFx0XHRcdFx0aGFuZGxlOiAnMS9iJyxcblx0XHRcdFx0XHRsYWJlbDogeyBsYWJlbDogJ2InLCBoaWdobGlnaHRzOiBbWzAsIDJdLCBbMywgNV1dIH0sXG5cdFx0XHRcdFx0Y29sbGFwc2libGVTdGF0ZTogVHJlZUl0ZW1Db2xsYXBzaWJsZVN0YXRlLkNvbGxhcHNlZFxuXHRcdFx0XHR9XSk7XG5cdFx0XHRcdHJldHVybiBQcm9taXNlLmFsbChbXG5cdFx0XHRcdFx0dGVzdE9iamVjdC4kZ2V0Q2hpbGRyZW4oJ3Rlc3ROb2RlV2l0aEhpZ2hsaWdodHNUcmVlUHJvdmlkZXInLCBbJzEvYSddKVxuXHRcdFx0XHRcdFx0LnRoZW4oY2hpbGRyZW4gPT4ge1xuXHRcdFx0XHRcdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHJlbW92ZVVuc2V0S2V5cyh1bkJhdGNoQ2hpbGRyZW4oY2hpbGRyZW4pKSwgW3tcblx0XHRcdFx0XHRcdFx0XHRoYW5kbGU6ICcxL2FhJyxcblx0XHRcdFx0XHRcdFx0XHRwYXJlbnRIYW5kbGU6ICcxL2EnLFxuXHRcdFx0XHRcdFx0XHRcdGxhYmVsOiB7IGxhYmVsOiAnYWEnLCBoaWdobGlnaHRzOiBbWzAsIDJdLCBbMywgNV1dIH0sXG5cdFx0XHRcdFx0XHRcdFx0Y29sbGFwc2libGVTdGF0ZTogVHJlZUl0ZW1Db2xsYXBzaWJsZVN0YXRlLk5vbmVcblx0XHRcdFx0XHRcdFx0fSwge1xuXHRcdFx0XHRcdFx0XHRcdGhhbmRsZTogJzEvYWInLFxuXHRcdFx0XHRcdFx0XHRcdHBhcmVudEhhbmRsZTogJzEvYScsXG5cdFx0XHRcdFx0XHRcdFx0bGFiZWw6IHsgbGFiZWw6ICdhYicsIGhpZ2hsaWdodHM6IFtbMCwgMl0sIFszLCA1XV0gfSxcblx0XHRcdFx0XHRcdFx0XHRjb2xsYXBzaWJsZVN0YXRlOiBUcmVlSXRlbUNvbGxhcHNpYmxlU3RhdGUuTm9uZVxuXHRcdFx0XHRcdFx0XHR9XSk7XG5cdFx0XHRcdFx0XHR9KSxcblx0XHRcdFx0XHR0ZXN0T2JqZWN0LiRnZXRDaGlsZHJlbigndGVzdE5vZGVXaXRoSGlnaGxpZ2h0c1RyZWVQcm92aWRlcicsIFsnMS9iJ10pXG5cdFx0XHRcdFx0XHQudGhlbihjaGlsZHJlbiA9PiB7XG5cdFx0XHRcdFx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocmVtb3ZlVW5zZXRLZXlzKHVuQmF0Y2hDaGlsZHJlbihjaGlsZHJlbikpLCBbe1xuXHRcdFx0XHRcdFx0XHRcdGhhbmRsZTogJzEvYmEnLFxuXHRcdFx0XHRcdFx0XHRcdHBhcmVudEhhbmRsZTogJzEvYicsXG5cdFx0XHRcdFx0XHRcdFx0bGFiZWw6IHsgbGFiZWw6ICdiYScsIGhpZ2hsaWdodHM6IFtbMCwgMl0sIFszLCA1XV0gfSxcblx0XHRcdFx0XHRcdFx0XHRjb2xsYXBzaWJsZVN0YXRlOiBUcmVlSXRlbUNvbGxhcHNpYmxlU3RhdGUuTm9uZVxuXHRcdFx0XHRcdFx0XHR9LCB7XG5cdFx0XHRcdFx0XHRcdFx0aGFuZGxlOiAnMS9iYicsXG5cdFx0XHRcdFx0XHRcdFx0cGFyZW50SGFuZGxlOiAnMS9iJyxcblx0XHRcdFx0XHRcdFx0XHRsYWJlbDogeyBsYWJlbDogJ2JiJywgaGlnaGxpZ2h0czogW1swLCAyXSwgWzMsIDVdXSB9LFxuXHRcdFx0XHRcdFx0XHRcdGNvbGxhcHNpYmxlU3RhdGU6IFRyZWVJdGVtQ29sbGFwc2libGVTdGF0ZS5Ob25lXG5cdFx0XHRcdFx0XHRcdH1dKTtcblx0XHRcdFx0XHRcdH0pXG5cdFx0XHRcdF0pO1xuXHRcdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2R1cGxpY2F0ZSBpZCBhY3Jvc3Mgc2libGluZ3MgaXMgaGFuZGxlZCBncmFjZWZ1bGx5JywgKGRvbmUpID0+IHtcblx0XHR0cmVlWydhJ10gPSB7XG5cdFx0XHQnYWEnOiB7fSxcblx0XHR9O1xuXHRcdHRyZWVbJ2InXSA9IHtcblx0XHRcdCdhYSc6IHt9LFxuXHRcdFx0J2JhJzoge31cblx0XHR9O1xuXHRcdHN0b3JlLmFkZCh0YXJnZXQub25SZWZyZXNoLmV2ZW50KCgpID0+IHtcblx0XHRcdHRlc3RPYmplY3QuJGdldENoaWxkcmVuKCd0ZXN0Tm9kZVdpdGhJZFRyZWVQcm92aWRlcicpXG5cdFx0XHRcdC50aGVuKGVsZW1lbnRzID0+IHtcblx0XHRcdFx0XHRjb25zdCBhY3R1YWxzID0gdW5CYXRjaENoaWxkcmVuKGVsZW1lbnRzKT8ubWFwKGUgPT4gZS5oYW5kbGUpO1xuXHRcdFx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoYWN0dWFscywgWycxL2EnLCAnMS9iJ10pO1xuXHRcdFx0XHRcdHJldHVybiB0ZXN0T2JqZWN0LiRnZXRDaGlsZHJlbigndGVzdE5vZGVXaXRoSWRUcmVlUHJvdmlkZXInLCBbJzEvYSddKVxuXHRcdFx0XHRcdFx0LnRoZW4oKCkgPT4gdGVzdE9iamVjdC4kZ2V0Q2hpbGRyZW4oJ3Rlc3ROb2RlV2l0aElkVHJlZVByb3ZpZGVyJywgWycxL2InXSkpXG5cdFx0XHRcdFx0XHQudGhlbihlbGVtZW50cyA9PiB7XG5cdFx0XHRcdFx0XHRcdC8vIENoaWxkcmVuIG9mICdiJyBzaG91bGQgaW5jbHVkZSBib3RoICdhYScgYW5kICdiYSdcblx0XHRcdFx0XHRcdFx0Y29uc3QgY2hpbGRyZW4gPSB1bkJhdGNoQ2hpbGRyZW4oZWxlbWVudHMpPy5tYXAoZSA9PiBlLmhhbmRsZSk7XG5cdFx0XHRcdFx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoY2hpbGRyZW4sIFsnMS9hYScsICcxL2JhJ10pO1xuXHRcdFx0XHRcdFx0XHRkb25lKCk7XG5cdFx0XHRcdFx0XHR9KTtcblx0XHRcdFx0fSkuY2F0Y2goZG9uZSk7XG5cdFx0fSkpO1xuXHRcdG9uRGlkQ2hhbmdlVHJlZU5vZGUuZmlyZSh1bmRlZmluZWQpO1xuXHR9KTtcblxuXHR0ZXN0KCdkaWZmZXJlbnQgZWxlbWVudCBpbnN0YW5jZXMgd2l0aCBzYW1lIGlkIGFyZSByZXBsYWNlZCBncmFjZWZ1bGx5JywgYXN5bmMgKCkgPT4ge1xuXHRcdC8vIFNpbXVsYXRlcyB0aGUgcmFjZSBjb25kaXRpb246IHR3byBjb25jdXJyZW50IGdldENoaWxkcmVuIGNhbGxzIHJldHVyblxuXHRcdC8vIGRpZmZlcmVudCBlbGVtZW50IG9iamVjdHMgdGhhdCBtYXAgdG8gdGhlIHNhbWUgdHJlZSBpdGVtIElELiBUaGUgc2Vjb25kXG5cdFx0Ly8gY2FsbCBzaG91bGQgcmVwbGFjZSB0aGUgZmlyc3QncyByZWdpc3RyYXRpb24gd2l0aG91dCBlcnJvci5cblx0XHRsZXQgY2FsbENvdW50ID0gMDtcblx0XHRjb25zdCBlbGVtZW50MSA9IHsga2V5OiAneCcgfTtcblx0XHRjb25zdCBlbGVtZW50MiA9IHsga2V5OiAneCcgfTtcblxuXHRcdGNvbnN0IHRyZWVWaWV3ID0gdGVzdE9iamVjdC5jcmVhdGVUcmVlVmlldygndGVzdFJhY2VQcm92aWRlcicsIHtcblx0XHRcdHRyZWVEYXRhUHJvdmlkZXI6IHtcblx0XHRcdFx0Z2V0Q2hpbGRyZW46ICgpOiB7IGtleTogc3RyaW5nIH1bXSA9PiB7XG5cdFx0XHRcdFx0Y2FsbENvdW50Kys7XG5cdFx0XHRcdFx0Ly8gUmV0dXJuIGEgZGlmZmVyZW50IG9iamVjdCBpbnN0YW5jZSBlYWNoIHRpbWVcblx0XHRcdFx0XHRyZXR1cm4gY2FsbENvdW50ID09PSAxID8gW2VsZW1lbnQxXSA6IFtlbGVtZW50Ml07XG5cdFx0XHRcdH0sXG5cdFx0XHRcdGdldFRyZWVJdGVtOiAoZWxlbWVudDogeyBrZXk6IHN0cmluZyB9KTogVHJlZUl0ZW0gPT4ge1xuXHRcdFx0XHRcdHJldHVybiB7IGxhYmVsOiB7IGxhYmVsOiBlbGVtZW50LmtleSB9LCBpZDogJ3NhbWUtaWQnLCBjb2xsYXBzaWJsZVN0YXRlOiBUcmVlSXRlbUNvbGxhcHNpYmxlU3RhdGUuTm9uZSB9O1xuXHRcdFx0XHR9LFxuXHRcdFx0XHRvbkRpZENoYW5nZVRyZWVEYXRhOiBvbkRpZENoYW5nZVRyZWVOb2RlLmV2ZW50LFxuXHRcdFx0fVxuXHRcdH0sIGV4dGVuc2lvbnNEZXNjcmlwdGlvbik7XG5cblx0XHRzdG9yZS5hZGQodHJlZVZpZXcpO1xuXG5cdFx0Ly8gRmlyc3QgZmV0Y2ggXHUyMDE0IHJlZ2lzdGVycyBlbGVtZW50MSB3aXRoIGlkICdzYW1lLWlkJ1xuXHRcdGNvbnN0IGZpcnN0ID0gYXdhaXQgdGVzdE9iamVjdC4kZ2V0Q2hpbGRyZW4oJ3Rlc3RSYWNlUHJvdmlkZXInKTtcblx0XHRjb25zdCBmaXJzdENoaWxkcmVuID0gdW5CYXRjaENoaWxkcmVuKGZpcnN0KTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZmlyc3RDaGlsZHJlbj8ubGVuZ3RoLCAxKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZmlyc3RDaGlsZHJlbiFbMF0uaGFuZGxlLCAnMS9zYW1lLWlkJyk7XG5cblx0XHQvLyBTZWNvbmQgZmV0Y2ggXHUyMDE0IGRpZmZlcmVudCBlbGVtZW50IGluc3RhbmNlLCBzYW1lIGlkLiBTaG91bGQgbm90IHRocm93LlxuXHRcdGNvbnN0IHNlY29uZCA9IGF3YWl0IHRlc3RPYmplY3QuJGdldENoaWxkcmVuKCd0ZXN0UmFjZVByb3ZpZGVyJyk7XG5cdFx0Y29uc3Qgc2Vjb25kQ2hpbGRyZW4gPSB1bkJhdGNoQ2hpbGRyZW4oc2Vjb25kKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2Vjb25kQ2hpbGRyZW4/Lmxlbmd0aCwgMSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNlY29uZENoaWxkcmVuIVswXS5oYW5kbGUsICcxL3NhbWUtaWQnKTtcblx0fSk7XG5cblx0dGVzdCgncmVmcmVzaCByb290JywgZnVuY3Rpb24gKGRvbmUpIHtcblx0XHRzdG9yZS5hZGQodGFyZ2V0Lm9uUmVmcmVzaC5ldmVudChhY3R1YWxzID0+IHtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbCh1bmRlZmluZWQsIGFjdHVhbHMpO1xuXHRcdFx0ZG9uZSgpO1xuXHRcdH0pKTtcblx0XHRvbkRpZENoYW5nZVRyZWVOb2RlLmZpcmUodW5kZWZpbmVkKTtcblx0fSk7XG5cblx0dGVzdCgncmVmcmVzaCBhIHBhcmVudCBub2RlJywgKCkgPT4ge1xuXHRcdHJldHVybiBuZXcgUHJvbWlzZSgoYywgZSkgPT4ge1xuXHRcdFx0c3RvcmUuYWRkKHRhcmdldC5vblJlZnJlc2guZXZlbnQoYWN0dWFscyA9PiB7XG5cdFx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoWycwLzA6YiddLCBPYmplY3Qua2V5cyhhY3R1YWxzKSk7XG5cdFx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocmVtb3ZlVW5zZXRLZXlzKGFjdHVhbHNbJzAvMDpiJ10pLCB7XG5cdFx0XHRcdFx0aGFuZGxlOiAnMC8wOmInLFxuXHRcdFx0XHRcdGxhYmVsOiB7IGxhYmVsOiAnYicgfSxcblx0XHRcdFx0XHRjb2xsYXBzaWJsZVN0YXRlOiBUcmVlSXRlbUNvbGxhcHNpYmxlU3RhdGUuQ29sbGFwc2VkXG5cdFx0XHRcdH0pO1xuXHRcdFx0XHRjKHVuZGVmaW5lZCk7XG5cdFx0XHR9KSk7XG5cdFx0XHRvbkRpZENoYW5nZVRyZWVOb2RlLmZpcmUoZ2V0Tm9kZSgnYicpKTtcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgncmVmcmVzaCBhIGxlYWYgbm9kZScsIGZ1bmN0aW9uIChkb25lKSB7XG5cdFx0c3RvcmUuYWRkKHRhcmdldC5vblJlZnJlc2guZXZlbnQoYWN0dWFscyA9PiB7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKFsnMC8wOmIvMDpiYiddLCBPYmplY3Qua2V5cyhhY3R1YWxzKSk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHJlbW92ZVVuc2V0S2V5cyhhY3R1YWxzWycwLzA6Yi8wOmJiJ10pLCB7XG5cdFx0XHRcdGhhbmRsZTogJzAvMDpiLzA6YmInLFxuXHRcdFx0XHRwYXJlbnRIYW5kbGU6ICcwLzA6YicsXG5cdFx0XHRcdGxhYmVsOiB7IGxhYmVsOiAnYmInIH0sXG5cdFx0XHRcdGNvbGxhcHNpYmxlU3RhdGU6IFRyZWVJdGVtQ29sbGFwc2libGVTdGF0ZS5Ob25lXG5cdFx0XHR9KTtcblx0XHRcdGRvbmUoKTtcblx0XHR9KSk7XG5cdFx0b25EaWRDaGFuZ2VUcmVlTm9kZS5maXJlKGdldE5vZGUoJ2JiJykpO1xuXHR9KTtcblxuXHRhc3luYyBmdW5jdGlvbiBydW5XaXRoRXZlbnRNZXJnaW5nKGFjdGlvbjogKHJlc29sdmU6ICgpID0+IHZvaWQpID0+IHZvaWQpIHtcblx0XHRhd2FpdCBydW5XaXRoRmFrZWRUaW1lcnMoe30sIGFzeW5jICgpID0+IHtcblx0XHRcdGF3YWl0IG5ldyBQcm9taXNlPHZvaWQ+KChyZXNvbHZlKSA9PiB7XG5cdFx0XHRcdGxldCBzdWJzY3JpcHRpb246IElEaXNwb3NhYmxlIHwgdW5kZWZpbmVkID0gdW5kZWZpbmVkO1xuXHRcdFx0XHRzdWJzY3JpcHRpb24gPSB0YXJnZXQub25SZWZyZXNoLmV2ZW50KCgpID0+IHtcblx0XHRcdFx0XHRzdWJzY3JpcHRpb24hLmRpc3Bvc2UoKTtcblx0XHRcdFx0XHRyZXNvbHZlKCk7XG5cdFx0XHRcdH0pO1xuXHRcdFx0XHRvbkRpZENoYW5nZVRyZWVOb2RlLmZpcmUoZ2V0Tm9kZSgnYicpKTtcblx0XHRcdH0pO1xuXHRcdFx0YXdhaXQgbmV3IFByb21pc2U8dm9pZD4oYWN0aW9uKTtcblx0XHR9KTtcblx0fVxuXG5cdHRlc3QoJ3JlZnJlc2ggcGFyZW50IGFuZCBjaGlsZCBub2RlIHRyaWdnZXIgcmVmcmVzaCBvbmx5IG9uIHBhcmVudCAtIHNjZW5hcmlvIDEnLCBhc3luYyAoKSA9PiB7XG5cdFx0cmV0dXJuIHJ1bldpdGhFdmVudE1lcmdpbmcoKHJlc29sdmUpID0+IHtcblx0XHRcdHN0b3JlLmFkZCh0YXJnZXQub25SZWZyZXNoLmV2ZW50KGFjdHVhbHMgPT4ge1xuXHRcdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKFsnMC8wOmInLCAnMC8wOmEvMDphYSddLCBPYmplY3Qua2V5cyhhY3R1YWxzKSk7XG5cdFx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocmVtb3ZlVW5zZXRLZXlzKGFjdHVhbHNbJzAvMDpiJ10pLCB7XG5cdFx0XHRcdFx0aGFuZGxlOiAnMC8wOmInLFxuXHRcdFx0XHRcdGxhYmVsOiB7IGxhYmVsOiAnYicgfSxcblx0XHRcdFx0XHRjb2xsYXBzaWJsZVN0YXRlOiBUcmVlSXRlbUNvbGxhcHNpYmxlU3RhdGUuQ29sbGFwc2VkXG5cdFx0XHRcdH0pO1xuXHRcdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHJlbW92ZVVuc2V0S2V5cyhhY3R1YWxzWycwLzA6YS8wOmFhJ10pLCB7XG5cdFx0XHRcdFx0aGFuZGxlOiAnMC8wOmEvMDphYScsXG5cdFx0XHRcdFx0cGFyZW50SGFuZGxlOiAnMC8wOmEnLFxuXHRcdFx0XHRcdGxhYmVsOiB7IGxhYmVsOiAnYWEnIH0sXG5cdFx0XHRcdFx0Y29sbGFwc2libGVTdGF0ZTogVHJlZUl0ZW1Db2xsYXBzaWJsZVN0YXRlLk5vbmVcblx0XHRcdFx0fSk7XG5cdFx0XHRcdHJlc29sdmUoKTtcblx0XHRcdH0pKTtcblx0XHRcdG9uRGlkQ2hhbmdlVHJlZU5vZGUuZmlyZShnZXROb2RlKCdiJykpO1xuXHRcdFx0b25EaWRDaGFuZ2VUcmVlTm9kZS5maXJlKGdldE5vZGUoJ2FhJykpO1xuXHRcdFx0b25EaWRDaGFuZ2VUcmVlTm9kZS5maXJlKGdldE5vZGUoJ2JiJykpO1xuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdyZWZyZXNoIHBhcmVudCBhbmQgY2hpbGQgbm9kZSB0cmlnZ2VyIHJlZnJlc2ggb25seSBvbiBwYXJlbnQgLSBzY2VuYXJpbyAyJywgYXN5bmMgKCkgPT4ge1xuXHRcdHJldHVybiBydW5XaXRoRXZlbnRNZXJnaW5nKChyZXNvbHZlKSA9PiB7XG5cdFx0XHRzdG9yZS5hZGQodGFyZ2V0Lm9uUmVmcmVzaC5ldmVudChhY3R1YWxzID0+IHtcblx0XHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChbJzAvMDphLzA6YWEnLCAnMC8wOmInXSwgT2JqZWN0LmtleXMoYWN0dWFscykpO1xuXHRcdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHJlbW92ZVVuc2V0S2V5cyhhY3R1YWxzWycwLzA6YiddKSwge1xuXHRcdFx0XHRcdGhhbmRsZTogJzAvMDpiJyxcblx0XHRcdFx0XHRsYWJlbDogeyBsYWJlbDogJ2InIH0sXG5cdFx0XHRcdFx0Y29sbGFwc2libGVTdGF0ZTogVHJlZUl0ZW1Db2xsYXBzaWJsZVN0YXRlLkNvbGxhcHNlZFxuXHRcdFx0XHR9KTtcblx0XHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChyZW1vdmVVbnNldEtleXMoYWN0dWFsc1snMC8wOmEvMDphYSddKSwge1xuXHRcdFx0XHRcdGhhbmRsZTogJzAvMDphLzA6YWEnLFxuXHRcdFx0XHRcdHBhcmVudEhhbmRsZTogJzAvMDphJyxcblx0XHRcdFx0XHRsYWJlbDogeyBsYWJlbDogJ2FhJyB9LFxuXHRcdFx0XHRcdGNvbGxhcHNpYmxlU3RhdGU6IFRyZWVJdGVtQ29sbGFwc2libGVTdGF0ZS5Ob25lXG5cdFx0XHRcdH0pO1xuXHRcdFx0XHRyZXNvbHZlKCk7XG5cdFx0XHR9KSk7XG5cdFx0XHRvbkRpZENoYW5nZVRyZWVOb2RlLmZpcmUoZ2V0Tm9kZSgnYmInKSk7XG5cdFx0XHRvbkRpZENoYW5nZVRyZWVOb2RlLmZpcmUoZ2V0Tm9kZSgnYWEnKSk7XG5cdFx0XHRvbkRpZENoYW5nZVRyZWVOb2RlLmZpcmUoZ2V0Tm9kZSgnYicpKTtcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgncmVmcmVzaCBhbiBlbGVtZW50IGZvciBsYWJlbCBjaGFuZ2UnLCBmdW5jdGlvbiAoZG9uZSkge1xuXHRcdGxhYmVsc1snYSddID0gJ2FhJztcblx0XHRzdG9yZS5hZGQodGFyZ2V0Lm9uUmVmcmVzaC5ldmVudChhY3R1YWxzID0+IHtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoWycwLzA6YSddLCBPYmplY3Qua2V5cyhhY3R1YWxzKSk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHJlbW92ZVVuc2V0S2V5cyhhY3R1YWxzWycwLzA6YSddKSwge1xuXHRcdFx0XHRoYW5kbGU6ICcwLzA6YWEnLFxuXHRcdFx0XHRsYWJlbDogeyBsYWJlbDogJ2FhJyB9LFxuXHRcdFx0XHRjb2xsYXBzaWJsZVN0YXRlOiBUcmVlSXRlbUNvbGxhcHNpYmxlU3RhdGUuQ29sbGFwc2VkXG5cdFx0XHR9KTtcblx0XHRcdGRvbmUoKTtcblx0XHR9KSk7XG5cdFx0b25EaWRDaGFuZ2VUcmVlTm9kZS5maXJlKGdldE5vZGUoJ2EnKSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3JlZnJlc2ggY2FsbHMgYXJlIHRocm90dGxlZCBvbiByb290cycsICgpID0+IHtcblx0XHRyZXR1cm4gcnVuV2l0aEV2ZW50TWVyZ2luZygocmVzb2x2ZSkgPT4ge1xuXHRcdFx0c3RvcmUuYWRkKHRhcmdldC5vblJlZnJlc2guZXZlbnQoYWN0dWFscyA9PiB7XG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbCh1bmRlZmluZWQsIGFjdHVhbHMpO1xuXHRcdFx0XHRyZXNvbHZlKCk7XG5cdFx0XHR9KSk7XG5cdFx0XHRvbkRpZENoYW5nZVRyZWVOb2RlLmZpcmUodW5kZWZpbmVkKTtcblx0XHRcdG9uRGlkQ2hhbmdlVHJlZU5vZGUuZmlyZSh1bmRlZmluZWQpO1xuXHRcdFx0b25EaWRDaGFuZ2VUcmVlTm9kZS5maXJlKHVuZGVmaW5lZCk7XG5cdFx0XHRvbkRpZENoYW5nZVRyZWVOb2RlLmZpcmUodW5kZWZpbmVkKTtcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgncmVmcmVzaCBjYWxscyBhcmUgdGhyb3R0bGVkIG9uIGVsZW1lbnRzJywgKCkgPT4ge1xuXHRcdHJldHVybiBydW5XaXRoRXZlbnRNZXJnaW5nKChyZXNvbHZlKSA9PiB7XG5cdFx0XHRzdG9yZS5hZGQodGFyZ2V0Lm9uUmVmcmVzaC5ldmVudChhY3R1YWxzID0+IHtcblx0XHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChbJzAvMDphJywgJzAvMDpiJ10sIE9iamVjdC5rZXlzKGFjdHVhbHMpKTtcblx0XHRcdFx0cmVzb2x2ZSgpO1xuXHRcdFx0fSkpO1xuXG5cdFx0XHRvbkRpZENoYW5nZVRyZWVOb2RlLmZpcmUoZ2V0Tm9kZSgnYScpKTtcblx0XHRcdG9uRGlkQ2hhbmdlVHJlZU5vZGUuZmlyZShnZXROb2RlKCdiJykpO1xuXHRcdFx0b25EaWRDaGFuZ2VUcmVlTm9kZS5maXJlKGdldE5vZGUoJ2InKSk7XG5cdFx0XHRvbkRpZENoYW5nZVRyZWVOb2RlLmZpcmUoZ2V0Tm9kZSgnYScpKTtcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgncmVmcmVzaCBjYWxscyBhcmUgdGhyb3R0bGVkIG9uIHVua25vd24gZWxlbWVudHMnLCAoKSA9PiB7XG5cdFx0cmV0dXJuIHJ1bldpdGhFdmVudE1lcmdpbmcoKHJlc29sdmUpID0+IHtcblx0XHRcdHN0b3JlLmFkZCh0YXJnZXQub25SZWZyZXNoLmV2ZW50KGFjdHVhbHMgPT4ge1xuXHRcdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKFsnMC8wOmEnLCAnMC8wOmInXSwgT2JqZWN0LmtleXMoYWN0dWFscykpO1xuXHRcdFx0XHRyZXNvbHZlKCk7XG5cdFx0XHR9KSk7XG5cblx0XHRcdG9uRGlkQ2hhbmdlVHJlZU5vZGUuZmlyZShnZXROb2RlKCdhJykpO1xuXHRcdFx0b25EaWRDaGFuZ2VUcmVlTm9kZS5maXJlKGdldE5vZGUoJ2InKSk7XG5cdFx0XHRvbkRpZENoYW5nZVRyZWVOb2RlLmZpcmUoZ2V0Tm9kZSgnZycpKTtcblx0XHRcdG9uRGlkQ2hhbmdlVHJlZU5vZGUuZmlyZShnZXROb2RlKCdhJykpO1xuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdyZWZyZXNoIGNhbGxzIGFyZSB0aHJvdHRsZWQgb24gdW5rbm93biBlbGVtZW50cyBhbmQgcm9vdCcsICgpID0+IHtcblx0XHRyZXR1cm4gcnVuV2l0aEV2ZW50TWVyZ2luZygocmVzb2x2ZSkgPT4ge1xuXHRcdFx0c3RvcmUuYWRkKHRhcmdldC5vblJlZnJlc2guZXZlbnQoYWN0dWFscyA9PiB7XG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbCh1bmRlZmluZWQsIGFjdHVhbHMpO1xuXHRcdFx0XHRyZXNvbHZlKCk7XG5cdFx0XHR9KSk7XG5cblx0XHRcdG9uRGlkQ2hhbmdlVHJlZU5vZGUuZmlyZShnZXROb2RlKCdhJykpO1xuXHRcdFx0b25EaWRDaGFuZ2VUcmVlTm9kZS5maXJlKGdldE5vZGUoJ2InKSk7XG5cdFx0XHRvbkRpZENoYW5nZVRyZWVOb2RlLmZpcmUoZ2V0Tm9kZSgnZycpKTtcblx0XHRcdG9uRGlkQ2hhbmdlVHJlZU5vZGUuZmlyZSh1bmRlZmluZWQpO1xuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdyZWZyZXNoIGNhbGxzIGFyZSB0aHJvdHRsZWQgb24gZWxlbWVudHMgYW5kIHJvb3QnLCAoKSA9PiB7XG5cdFx0cmV0dXJuIHJ1bldpdGhFdmVudE1lcmdpbmcoKHJlc29sdmUpID0+IHtcblx0XHRcdHN0b3JlLmFkZCh0YXJnZXQub25SZWZyZXNoLmV2ZW50KGFjdHVhbHMgPT4ge1xuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodW5kZWZpbmVkLCBhY3R1YWxzKTtcblx0XHRcdFx0cmVzb2x2ZSgpO1xuXHRcdFx0fSkpO1xuXG5cdFx0XHRvbkRpZENoYW5nZVRyZWVOb2RlLmZpcmUoZ2V0Tm9kZSgnYScpKTtcblx0XHRcdG9uRGlkQ2hhbmdlVHJlZU5vZGUuZmlyZShnZXROb2RlKCdiJykpO1xuXHRcdFx0b25EaWRDaGFuZ2VUcmVlTm9kZS5maXJlKHVuZGVmaW5lZCk7XG5cdFx0XHRvbkRpZENoYW5nZVRyZWVOb2RlLmZpcmUoZ2V0Tm9kZSgnYScpKTtcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnZ2VuZXJhdGUgdW5pcXVlIGhhbmRsZXMgZnJvbSBsYWJlbHMgYnkgZXNjYXBpbmcgdGhlbScsIChkb25lKSA9PiB7XG5cdFx0dHJlZSA9IHtcblx0XHRcdCdhLzA6Yic6IHt9XG5cdFx0fTtcblxuXHRcdHN0b3JlLmFkZCh0YXJnZXQub25SZWZyZXNoLmV2ZW50KCgpID0+IHtcblx0XHRcdHRlc3RPYmplY3QuJGdldENoaWxkcmVuKCd0ZXN0Tm9kZVRyZWVQcm92aWRlcicpXG5cdFx0XHRcdC50aGVuKGVsZW1lbnRzID0+IHtcblx0XHRcdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHVuQmF0Y2hDaGlsZHJlbihlbGVtZW50cyk/Lm1hcChlID0+IGUuaGFuZGxlKSwgWycwLzA6YS8vMDpiJ10pO1xuXHRcdFx0XHRcdGRvbmUoKTtcblx0XHRcdFx0fSk7XG5cdFx0fSkpO1xuXHRcdG9uRGlkQ2hhbmdlVHJlZU5vZGUuZmlyZSh1bmRlZmluZWQpO1xuXHR9KTtcblxuXHR0ZXN0KCd0cmVlIHdpdGggZHVwbGljYXRlIGxhYmVscycsIChkb25lKSA9PiB7XG5cblx0XHRjb25zdCBkdXBJdGVtcyA9IHtcblx0XHRcdCdhZHVwMSc6ICdjJyxcblx0XHRcdCdhZHVwMic6ICdnJyxcblx0XHRcdCdiZHVwMSc6ICdlJyxcblx0XHRcdCdoZHVwMSc6ICdpJyxcblx0XHRcdCdoZHVwMic6ICdsJyxcblx0XHRcdCdqZHVwMSc6ICdrJ1xuXHRcdH07XG5cblx0XHRsYWJlbHNbJ2MnXSA9ICdhJztcblx0XHRsYWJlbHNbJ2UnXSA9ICdiJztcblx0XHRsYWJlbHNbJ2cnXSA9ICdhJztcblx0XHRsYWJlbHNbJ2knXSA9ICdoJztcblx0XHRsYWJlbHNbJ2wnXSA9ICdoJztcblx0XHRsYWJlbHNbJ2snXSA9ICdqJztcblxuXHRcdHRyZWVbZHVwSXRlbXNbJ2FkdXAxJ11dID0ge307XG5cdFx0dHJlZVsnZCddID0ge307XG5cblx0XHRjb25zdCBiZHVwMVRyZWU6IHsgW2tleTogc3RyaW5nXTogYW55IH0gPSB7fTtcblx0XHRiZHVwMVRyZWVbJ2gnXSA9IHt9O1xuXHRcdGJkdXAxVHJlZVtkdXBJdGVtc1snaGR1cDEnXV0gPSB7fTtcblx0XHRiZHVwMVRyZWVbJ2onXSA9IHt9O1xuXHRcdGJkdXAxVHJlZVtkdXBJdGVtc1snamR1cDEnXV0gPSB7fTtcblx0XHRiZHVwMVRyZWVbZHVwSXRlbXNbJ2hkdXAyJ11dID0ge307XG5cblx0XHR0cmVlW2R1cEl0ZW1zWydiZHVwMSddXSA9IGJkdXAxVHJlZTtcblx0XHR0cmVlWydmJ10gPSB7fTtcblx0XHR0cmVlW2R1cEl0ZW1zWydhZHVwMiddXSA9IHt9O1xuXG5cdFx0c3RvcmUuYWRkKHRhcmdldC5vblJlZnJlc2guZXZlbnQoKCkgPT4ge1xuXHRcdFx0dGVzdE9iamVjdC4kZ2V0Q2hpbGRyZW4oJ3Rlc3ROb2RlVHJlZVByb3ZpZGVyJylcblx0XHRcdFx0LnRoZW4oZWxlbWVudHMgPT4ge1xuXHRcdFx0XHRcdGNvbnN0IGFjdHVhbHMgPSB1bkJhdGNoQ2hpbGRyZW4oZWxlbWVudHMpPy5tYXAoZSA9PiBlLmhhbmRsZSk7XG5cdFx0XHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChhY3R1YWxzLCBbJzAvMDphJywgJzAvMDpiJywgJzAvMTphJywgJzAvMDpkJywgJzAvMTpiJywgJzAvMDpmJywgJzAvMjphJ10pO1xuXHRcdFx0XHRcdHJldHVybiB0ZXN0T2JqZWN0LiRnZXRDaGlsZHJlbigndGVzdE5vZGVUcmVlUHJvdmlkZXInLCBbJzAvMTpiJ10pXG5cdFx0XHRcdFx0XHQudGhlbihlbGVtZW50cyA9PiB7XG5cdFx0XHRcdFx0XHRcdGNvbnN0IGFjdHVhbHMgPSB1bkJhdGNoQ2hpbGRyZW4oZWxlbWVudHMpPy5tYXAoZSA9PiBlLmhhbmRsZSk7XG5cdFx0XHRcdFx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoYWN0dWFscywgWycwLzE6Yi8wOmgnLCAnMC8xOmIvMTpoJywgJzAvMTpiLzA6aicsICcwLzE6Yi8xOmonLCAnMC8xOmIvMjpoJ10pO1xuXHRcdFx0XHRcdFx0XHRkb25lKCk7XG5cdFx0XHRcdFx0XHR9KTtcblx0XHRcdFx0fSk7XG5cdFx0fSkpO1xuXG5cdFx0b25EaWRDaGFuZ2VUcmVlTm9kZS5maXJlKHVuZGVmaW5lZCk7XG5cdH0pO1xuXG5cdHRlc3QoJ2dldENoaWxkcmVuIGlzIG5vdCByZXR1cm5lZCBmcm9tIGNhY2hlIGlmIHJlZnJlc2hlZCcsIChkb25lKSA9PiB7XG5cdFx0dHJlZSA9IHtcblx0XHRcdCdjJzoge31cblx0XHR9O1xuXG5cdFx0c3RvcmUuYWRkKHRhcmdldC5vblJlZnJlc2guZXZlbnQoKCkgPT4ge1xuXHRcdFx0dGVzdE9iamVjdC4kZ2V0Q2hpbGRyZW4oJ3Rlc3ROb2RlVHJlZVByb3ZpZGVyJylcblx0XHRcdFx0LnRoZW4oZWxlbWVudHMgPT4ge1xuXHRcdFx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwodW5CYXRjaENoaWxkcmVuKGVsZW1lbnRzKT8ubWFwKGUgPT4gZS5oYW5kbGUpLCBbJzAvMDpjJ10pO1xuXHRcdFx0XHRcdGRvbmUoKTtcblx0XHRcdFx0fSk7XG5cdFx0fSkpO1xuXG5cdFx0b25EaWRDaGFuZ2VUcmVlTm9kZS5maXJlKHVuZGVmaW5lZCk7XG5cdH0pO1xuXG5cdHRlc3QoJ2dldENoaWxkcmVuIGlzIHJldHVybmVkIGZyb20gY2FjaGUgaWYgbm90IHJlZnJlc2hlZCcsICgpID0+IHtcblx0XHR0cmVlID0ge1xuXHRcdFx0J2MnOiB7fVxuXHRcdH07XG5cblx0XHRyZXR1cm4gdGVzdE9iamVjdC4kZ2V0Q2hpbGRyZW4oJ3Rlc3ROb2RlVHJlZVByb3ZpZGVyJylcblx0XHRcdC50aGVuKGVsZW1lbnRzID0+IHtcblx0XHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh1bkJhdGNoQ2hpbGRyZW4oZWxlbWVudHMpPy5tYXAoZSA9PiBlLmhhbmRsZSksIFsnMC8wOmEnLCAnMC8wOmInXSk7XG5cdFx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnZGlzcG9zZSBhbmQgcmUtcmVnaXN0ZXIgdHJlZSB2aWV3JywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IGRpc3Bvc2VUcmVlU3B5ID0gc2lub24uc3B5KHRhcmdldCwgJyRkaXNwb3NlVHJlZScpO1xuXHRcdGNvbnN0IHJlZ2lzdGVyU3B5ID0gc2lub24uc3B5KHRhcmdldCwgJyRyZWdpc3RlclRyZWVWaWV3RGF0YVByb3ZpZGVyJyk7XG5cblx0XHQvLyBDcmVhdGUsIGRpc3Bvc2UsIGFuZCByZS1yZWdpc3RlciBhIHRyZWUgdmlldyB3aXRoIHRoZSBzYW1lIGlkXG5cdFx0Y29uc3QgdHJlZVZpZXcxID0gdGVzdE9iamVjdC5jcmVhdGVUcmVlVmlldygncmVSZWdpc3RlclRyZWVQcm92aWRlcicsIHsgdHJlZURhdGFQcm92aWRlcjogYU5vZGVUcmVlRGF0YVByb3ZpZGVyKCkgfSwgZXh0ZW5zaW9uc0Rlc2NyaXB0aW9uKTtcblx0XHR0cmVlVmlldzEuZGlzcG9zZSgpO1xuXHRcdGNvbnN0IHRyZWVWaWV3MiA9IHRlc3RPYmplY3QuY3JlYXRlVHJlZVZpZXcoJ3JlUmVnaXN0ZXJUcmVlUHJvdmlkZXInLCB7IHRyZWVEYXRhUHJvdmlkZXI6IGFOb2RlVHJlZURhdGFQcm92aWRlcigpIH0sIGV4dGVuc2lvbnNEZXNjcmlwdGlvbik7XG5cblx0XHQvLyBMZXQgYWxsIHBlbmRpbmcgbWljcm90YXNrcyAodGhlIGFzeW5jIGRpc3Bvc2UpIHNldHRsZVxuXHRcdGF3YWl0IG5ldyBQcm9taXNlPHZvaWQ+KHIgPT4gc2V0VGltZW91dChyLCAwKSk7XG5cblx0XHQvLyBUaGUgbmV3IHZpZXcgc2hvdWxkIHdvcmsgXHUyMDE0ICRnZXRDaGlsZHJlbiBzaG91bGQgcmV0dXJuIHJlc3VsdHMsIG5vdCByZWplY3Rcblx0XHRjb25zdCBlbGVtZW50cyA9IGF3YWl0IHRlc3RPYmplY3QuJGdldENoaWxkcmVuKCdyZVJlZ2lzdGVyVHJlZVByb3ZpZGVyJyk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh1bkJhdGNoQ2hpbGRyZW4oZWxlbWVudHMpPy5tYXAoZSA9PiBlLmhhbmRsZSksIFsnMC8wOmEnLCAnMC8wOmInXSk7XG5cblx0XHQvLyAkcmVnaXN0ZXJUcmVlVmlld0RhdGFQcm92aWRlciBzaG91bGQgaGF2ZSBiZWVuIGNhbGxlZCB0d2ljZSAob25jZSBwZXIgY3JlYXRlVHJlZVZpZXcpXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlZ2lzdGVyU3B5LmNhbGxDb3VudCwgMik7XG5cdFx0Ly8gJGRpc3Bvc2VUcmVlIHNob3VsZCBOT1QgaGF2ZSBiZWVuIGNhbGxlZCBcdTIwMTQgdGhlIG9sZCBhc3luYyBkaXNwb3NlIHNob3VsZCBkZXRlY3QgaXQgd2FzIHJlcGxhY2VkXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGRpc3Bvc2VUcmVlU3B5LmNhbGxDb3VudCwgMCk7XG5cblx0XHR0cmVlVmlldzIuZGlzcG9zZSgpO1xuXHR9KTtcblxuXHR0ZXN0KCdyZXZlYWwgd2lsbCB0aHJvdyBhbiBlcnJvciBpZiBnZXRQYXJlbnQgaXMgbm90IGltcGxlbWVudGVkJywgKCkgPT4ge1xuXHRcdGNvbnN0IHRyZWVWaWV3ID0gdGVzdE9iamVjdC5jcmVhdGVUcmVlVmlldygndHJlZURhdGFQcm92aWRlcicsIHsgdHJlZURhdGFQcm92aWRlcjogYU5vZGVUcmVlRGF0YVByb3ZpZGVyKCkgfSwgZXh0ZW5zaW9uc0Rlc2NyaXB0aW9uKTtcblx0XHRyZXR1cm4gdHJlZVZpZXcucmV2ZWFsKHsga2V5OiAnYScgfSlcblx0XHRcdC50aGVuKCgpID0+IGFzc2VydC5mYWlsKCdSZXZlYWwgc2hvdWxkIHRocm93IGFuIGVycm9yIGFzIGdldFBhcmVudCBpcyBub3QgaW1wbGVtZW50ZWQnKSwgKCkgPT4gbnVsbCk7XG5cdH0pO1xuXG5cdHRlc3QoJ3JldmVhbCB3aWxsIHJldHVybiBlbXB0eSBhcnJheSBmb3Igcm9vdCBlbGVtZW50JywgKCkgPT4ge1xuXHRcdGNvbnN0IHJldmVhbFRhcmdldCA9IHNpbm9uLnNweSh0YXJnZXQsICckcmV2ZWFsJyk7XG5cdFx0Y29uc3QgdHJlZVZpZXcgPSB0ZXN0T2JqZWN0LmNyZWF0ZVRyZWVWaWV3KCd0cmVlRGF0YVByb3ZpZGVyJywgeyB0cmVlRGF0YVByb3ZpZGVyOiBhQ29tcGxldGVOb2RlVHJlZURhdGFQcm92aWRlcigpIH0sIGV4dGVuc2lvbnNEZXNjcmlwdGlvbik7XG5cdFx0Y29uc3QgZXhwZWN0ZWQgPSB7XG5cdFx0XHRpdGVtOlxuXHRcdFx0XHR7IGhhbmRsZTogJzAvMDphJywgbGFiZWw6IHsgbGFiZWw6ICdhJyB9LCBjb2xsYXBzaWJsZVN0YXRlOiBUcmVlSXRlbUNvbGxhcHNpYmxlU3RhdGUuQ29sbGFwc2VkIH0sXG5cdFx0XHRwYXJlbnRDaGFpbjogW11cblx0XHR9O1xuXHRcdHJldHVybiB0cmVlVmlldy5yZXZlYWwoeyBrZXk6ICdhJyB9KVxuXHRcdFx0LnRoZW4oKCkgPT4ge1xuXHRcdFx0XHRhc3NlcnQub2socmV2ZWFsVGFyZ2V0LmNhbGxlZE9uY2UpO1xuXHRcdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKCd0cmVlRGF0YVByb3ZpZGVyJywgcmV2ZWFsVGFyZ2V0LmFyZ3NbMF1bMF0pO1xuXHRcdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGV4cGVjdGVkLCByZW1vdmVVbnNldEtleXMocmV2ZWFsVGFyZ2V0LmFyZ3NbMF1bMV0pKTtcblx0XHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7IHNlbGVjdDogdHJ1ZSwgZm9jdXM6IGZhbHNlLCBleHBhbmQ6IGZhbHNlIH0sIHJldmVhbFRhcmdldC5hcmdzWzBdWzJdKTtcblx0XHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdyZXZlYWwgd2lsbCByZXR1cm4gcGFyZW50cyBhcnJheSBmb3IgYW4gZWxlbWVudCB3aGVuIGhpZXJhcmNoeSBpcyBub3QgbG9hZGVkJywgKCkgPT4ge1xuXHRcdGNvbnN0IHJldmVhbFRhcmdldCA9IHNpbm9uLnNweSh0YXJnZXQsICckcmV2ZWFsJyk7XG5cdFx0Y29uc3QgdHJlZVZpZXcgPSB0ZXN0T2JqZWN0LmNyZWF0ZVRyZWVWaWV3KCd0cmVlRGF0YVByb3ZpZGVyJywgeyB0cmVlRGF0YVByb3ZpZGVyOiBhQ29tcGxldGVOb2RlVHJlZURhdGFQcm92aWRlcigpIH0sIGV4dGVuc2lvbnNEZXNjcmlwdGlvbik7XG5cdFx0Y29uc3QgZXhwZWN0ZWQgPSB7XG5cdFx0XHRpdGVtOiB7IGhhbmRsZTogJzAvMDphLzA6YWEnLCBsYWJlbDogeyBsYWJlbDogJ2FhJyB9LCBjb2xsYXBzaWJsZVN0YXRlOiBUcmVlSXRlbUNvbGxhcHNpYmxlU3RhdGUuTm9uZSwgcGFyZW50SGFuZGxlOiAnMC8wOmEnIH0sXG5cdFx0XHRwYXJlbnRDaGFpbjogW3sgaGFuZGxlOiAnMC8wOmEnLCBsYWJlbDogeyBsYWJlbDogJ2EnIH0sIGNvbGxhcHNpYmxlU3RhdGU6IFRyZWVJdGVtQ29sbGFwc2libGVTdGF0ZS5Db2xsYXBzZWQgfV1cblx0XHR9O1xuXHRcdHJldHVybiB0cmVlVmlldy5yZXZlYWwoeyBrZXk6ICdhYScgfSlcblx0XHRcdC50aGVuKCgpID0+IHtcblx0XHRcdFx0YXNzZXJ0Lm9rKHJldmVhbFRhcmdldC5jYWxsZWRPbmNlKTtcblx0XHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCgndHJlZURhdGFQcm92aWRlcicsIHJldmVhbFRhcmdldC5hcmdzWzBdWzBdKTtcblx0XHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChleHBlY3RlZC5pdGVtLCByZW1vdmVVbnNldEtleXMocmV2ZWFsVGFyZ2V0LmFyZ3NbMF1bMV0hLml0ZW0pKTtcblx0XHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChleHBlY3RlZC5wYXJlbnRDaGFpbiwgKDxBcnJheTxhbnk+PihyZXZlYWxUYXJnZXQuYXJnc1swXVsxXSEucGFyZW50Q2hhaW4pKS5tYXAoYXJnID0+IHJlbW92ZVVuc2V0S2V5cyhhcmcpKSk7XG5cdFx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoeyBzZWxlY3Q6IHRydWUsIGZvY3VzOiBmYWxzZSwgZXhwYW5kOiBmYWxzZSB9LCByZXZlYWxUYXJnZXQuYXJnc1swXVsyXSk7XG5cdFx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgncmV2ZWFsIHdpbGwgcmV0dXJuIHBhcmVudHMgYXJyYXkgZm9yIGFuIGVsZW1lbnQgd2hlbiBoaWVyYXJjaHkgaXMgbG9hZGVkJywgKCkgPT4ge1xuXHRcdGNvbnN0IHJldmVhbFRhcmdldCA9IHNpbm9uLnNweSh0YXJnZXQsICckcmV2ZWFsJyk7XG5cdFx0Y29uc3QgdHJlZVZpZXcgPSB0ZXN0T2JqZWN0LmNyZWF0ZVRyZWVWaWV3KCd0cmVlRGF0YVByb3ZpZGVyJywgeyB0cmVlRGF0YVByb3ZpZGVyOiBhQ29tcGxldGVOb2RlVHJlZURhdGFQcm92aWRlcigpIH0sIGV4dGVuc2lvbnNEZXNjcmlwdGlvbik7XG5cdFx0Y29uc3QgZXhwZWN0ZWQgPSB7XG5cdFx0XHRpdGVtOiB7IGhhbmRsZTogJzAvMDphLzA6YWEnLCBsYWJlbDogeyBsYWJlbDogJ2FhJyB9LCBjb2xsYXBzaWJsZVN0YXRlOiBUcmVlSXRlbUNvbGxhcHNpYmxlU3RhdGUuTm9uZSwgcGFyZW50SGFuZGxlOiAnMC8wOmEnIH0sXG5cdFx0XHRwYXJlbnRDaGFpbjogW3sgaGFuZGxlOiAnMC8wOmEnLCBsYWJlbDogeyBsYWJlbDogJ2EnIH0sIGNvbGxhcHNpYmxlU3RhdGU6IFRyZWVJdGVtQ29sbGFwc2libGVTdGF0ZS5Db2xsYXBzZWQgfV1cblx0XHR9O1xuXHRcdHJldHVybiB0ZXN0T2JqZWN0LiRnZXRDaGlsZHJlbigndHJlZURhdGFQcm92aWRlcicpXG5cdFx0XHQudGhlbigoKSA9PiB0ZXN0T2JqZWN0LiRnZXRDaGlsZHJlbigndHJlZURhdGFQcm92aWRlcicsIFsnMC8wOmEnXSkpXG5cdFx0XHQudGhlbigoKSA9PiB0cmVlVmlldy5yZXZlYWwoeyBrZXk6ICdhYScgfSlcblx0XHRcdFx0LnRoZW4oKCkgPT4ge1xuXHRcdFx0XHRcdGFzc2VydC5vayhyZXZlYWxUYXJnZXQuY2FsbGVkT25jZSk7XG5cdFx0XHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCgndHJlZURhdGFQcm92aWRlcicsIHJldmVhbFRhcmdldC5hcmdzWzBdWzBdKTtcblx0XHRcdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGV4cGVjdGVkLml0ZW0sIHJlbW92ZVVuc2V0S2V5cyhyZXZlYWxUYXJnZXQuYXJnc1swXVsxXSEuaXRlbSkpO1xuXHRcdFx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoZXhwZWN0ZWQucGFyZW50Q2hhaW4sICg8QXJyYXk8YW55Pj4ocmV2ZWFsVGFyZ2V0LmFyZ3NbMF1bMV0hLnBhcmVudENoYWluKSkubWFwKGFyZyA9PiByZW1vdmVVbnNldEtleXMoYXJnKSkpO1xuXHRcdFx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoeyBzZWxlY3Q6IHRydWUsIGZvY3VzOiBmYWxzZSwgZXhwYW5kOiBmYWxzZSB9LCByZXZlYWxUYXJnZXQuYXJnc1swXVsyXSk7XG5cdFx0XHRcdH0pKTtcblx0fSk7XG5cblx0dGVzdCgncmV2ZWFsIHdpbGwgcmV0dXJuIHBhcmVudHMgYXJyYXkgZm9yIGRlZXBlciBlbGVtZW50IHdpdGggbm8gc2VsZWN0aW9uJywgKCkgPT4ge1xuXHRcdHRyZWUgPSB7XG5cdFx0XHQnYic6IHtcblx0XHRcdFx0J2JhJzoge1xuXHRcdFx0XHRcdCdiYWMnOiB7fVxuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fTtcblx0XHRjb25zdCByZXZlYWxUYXJnZXQgPSBzaW5vbi5zcHkodGFyZ2V0LCAnJHJldmVhbCcpO1xuXHRcdGNvbnN0IHRyZWVWaWV3ID0gdGVzdE9iamVjdC5jcmVhdGVUcmVlVmlldygndHJlZURhdGFQcm92aWRlcicsIHsgdHJlZURhdGFQcm92aWRlcjogYUNvbXBsZXRlTm9kZVRyZWVEYXRhUHJvdmlkZXIoKSB9LCBleHRlbnNpb25zRGVzY3JpcHRpb24pO1xuXHRcdGNvbnN0IGV4cGVjdGVkID0ge1xuXHRcdFx0aXRlbTogeyBoYW5kbGU6ICcwLzA6Yi8wOmJhLzA6YmFjJywgbGFiZWw6IHsgbGFiZWw6ICdiYWMnIH0sIGNvbGxhcHNpYmxlU3RhdGU6IFRyZWVJdGVtQ29sbGFwc2libGVTdGF0ZS5Ob25lLCBwYXJlbnRIYW5kbGU6ICcwLzA6Yi8wOmJhJyB9LFxuXHRcdFx0cGFyZW50Q2hhaW46IFtcblx0XHRcdFx0eyBoYW5kbGU6ICcwLzA6YicsIGxhYmVsOiB7IGxhYmVsOiAnYicgfSwgY29sbGFwc2libGVTdGF0ZTogVHJlZUl0ZW1Db2xsYXBzaWJsZVN0YXRlLkNvbGxhcHNlZCB9LFxuXHRcdFx0XHR7IGhhbmRsZTogJzAvMDpiLzA6YmEnLCBsYWJlbDogeyBsYWJlbDogJ2JhJyB9LCBjb2xsYXBzaWJsZVN0YXRlOiBUcmVlSXRlbUNvbGxhcHNpYmxlU3RhdGUuQ29sbGFwc2VkLCBwYXJlbnRIYW5kbGU6ICcwLzA6YicgfVxuXHRcdFx0XVxuXHRcdH07XG5cdFx0cmV0dXJuIHRyZWVWaWV3LnJldmVhbCh7IGtleTogJ2JhYycgfSwgeyBzZWxlY3Q6IGZhbHNlLCBmb2N1czogZmFsc2UsIGV4cGFuZDogZmFsc2UgfSlcblx0XHRcdC50aGVuKCgpID0+IHtcblx0XHRcdFx0YXNzZXJ0Lm9rKHJldmVhbFRhcmdldC5jYWxsZWRPbmNlKTtcblx0XHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCgndHJlZURhdGFQcm92aWRlcicsIHJldmVhbFRhcmdldC5hcmdzWzBdWzBdKTtcblx0XHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChleHBlY3RlZC5pdGVtLCByZW1vdmVVbnNldEtleXMocmV2ZWFsVGFyZ2V0LmFyZ3NbMF1bMV0hLml0ZW0pKTtcblx0XHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChleHBlY3RlZC5wYXJlbnRDaGFpbiwgKDxBcnJheTxhbnk+PihyZXZlYWxUYXJnZXQuYXJnc1swXVsxXSEucGFyZW50Q2hhaW4pKS5tYXAoYXJnID0+IHJlbW92ZVVuc2V0S2V5cyhhcmcpKSk7XG5cdFx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoeyBzZWxlY3Q6IGZhbHNlLCBmb2N1czogZmFsc2UsIGV4cGFuZDogZmFsc2UgfSwgcmV2ZWFsVGFyZ2V0LmFyZ3NbMF1bMl0pO1xuXHRcdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3JldmVhbCBhZnRlciBmaXJzdCB1ZHBhdGUnLCAoKSA9PiB7XG5cdFx0Y29uc3QgcmV2ZWFsVGFyZ2V0ID0gc2lub24uc3B5KHRhcmdldCwgJyRyZXZlYWwnKTtcblx0XHRjb25zdCB0cmVlVmlldyA9IHRlc3RPYmplY3QuY3JlYXRlVHJlZVZpZXcoJ3RyZWVEYXRhUHJvdmlkZXInLCB7IHRyZWVEYXRhUHJvdmlkZXI6IGFDb21wbGV0ZU5vZGVUcmVlRGF0YVByb3ZpZGVyKCkgfSwgZXh0ZW5zaW9uc0Rlc2NyaXB0aW9uKTtcblx0XHRjb25zdCBleHBlY3RlZCA9IHtcblx0XHRcdGl0ZW06IHsgaGFuZGxlOiAnMC8wOmEvMDphYycsIGxhYmVsOiB7IGxhYmVsOiAnYWMnIH0sIGNvbGxhcHNpYmxlU3RhdGU6IFRyZWVJdGVtQ29sbGFwc2libGVTdGF0ZS5Ob25lLCBwYXJlbnRIYW5kbGU6ICcwLzA6YScgfSxcblx0XHRcdHBhcmVudENoYWluOiBbeyBoYW5kbGU6ICcwLzA6YScsIGxhYmVsOiB7IGxhYmVsOiAnYScgfSwgY29sbGFwc2libGVTdGF0ZTogVHJlZUl0ZW1Db2xsYXBzaWJsZVN0YXRlLkNvbGxhcHNlZCB9XVxuXHRcdH07XG5cdFx0cmV0dXJuIGxvYWRDb21wbGV0ZVRyZWUoJ3RyZWVEYXRhUHJvdmlkZXInKVxuXHRcdFx0LnRoZW4oKCkgPT4ge1xuXHRcdFx0XHR0cmVlID0ge1xuXHRcdFx0XHRcdCdhJzoge1xuXHRcdFx0XHRcdFx0J2FhJzoge30sXG5cdFx0XHRcdFx0XHQnYWMnOiB7fVxuXHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0J2InOiB7XG5cdFx0XHRcdFx0XHQnYmEnOiB7fSxcblx0XHRcdFx0XHRcdCdiYic6IHt9XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9O1xuXHRcdFx0XHRvbkRpZENoYW5nZVRyZWVOb2RlLmZpcmUoZ2V0Tm9kZSgnYScpKTtcblxuXHRcdFx0XHRyZXR1cm4gdHJlZVZpZXcucmV2ZWFsKHsga2V5OiAnYWMnIH0pXG5cdFx0XHRcdFx0LnRoZW4oKCkgPT4ge1xuXHRcdFx0XHRcdFx0YXNzZXJ0Lm9rKHJldmVhbFRhcmdldC5jYWxsZWRPbmNlKTtcblx0XHRcdFx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoJ3RyZWVEYXRhUHJvdmlkZXInLCByZXZlYWxUYXJnZXQuYXJnc1swXVswXSk7XG5cdFx0XHRcdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGV4cGVjdGVkLml0ZW0sIHJlbW92ZVVuc2V0S2V5cyhyZXZlYWxUYXJnZXQuYXJnc1swXVsxXSEuaXRlbSkpO1xuXHRcdFx0XHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChleHBlY3RlZC5wYXJlbnRDaGFpbiwgKDxBcnJheTxhbnk+PihyZXZlYWxUYXJnZXQuYXJnc1swXVsxXSEucGFyZW50Q2hhaW4pKS5tYXAoYXJnID0+IHJlbW92ZVVuc2V0S2V5cyhhcmcpKSk7XG5cdFx0XHRcdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHsgc2VsZWN0OiB0cnVlLCBmb2N1czogZmFsc2UsIGV4cGFuZDogZmFsc2UgfSwgcmV2ZWFsVGFyZ2V0LmFyZ3NbMF1bMl0pO1xuXHRcdFx0XHRcdH0pO1xuXHRcdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3JldmVhbCBhZnRlciBzZWNvbmQgdWRwYXRlJywgKCkgPT4ge1xuXHRcdGNvbnN0IHJldmVhbFRhcmdldCA9IHNpbm9uLnNweSh0YXJnZXQsICckcmV2ZWFsJyk7XG5cdFx0Y29uc3QgdHJlZVZpZXcgPSB0ZXN0T2JqZWN0LmNyZWF0ZVRyZWVWaWV3KCd0cmVlRGF0YVByb3ZpZGVyJywgeyB0cmVlRGF0YVByb3ZpZGVyOiBhQ29tcGxldGVOb2RlVHJlZURhdGFQcm92aWRlcigpIH0sIGV4dGVuc2lvbnNEZXNjcmlwdGlvbik7XG5cdFx0cmV0dXJuIGxvYWRDb21wbGV0ZVRyZWUoJ3RyZWVEYXRhUHJvdmlkZXInKVxuXHRcdFx0LnRoZW4oKCkgPT4ge1xuXHRcdFx0XHRyZXR1cm4gcnVuV2l0aEV2ZW50TWVyZ2luZygocmVzb2x2ZSkgPT4ge1xuXHRcdFx0XHRcdHRyZWUgPSB7XG5cdFx0XHRcdFx0XHQnYSc6IHtcblx0XHRcdFx0XHRcdFx0J2FhJzoge30sXG5cdFx0XHRcdFx0XHRcdCdhYyc6IHt9XG5cdFx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdFx0J2InOiB7XG5cdFx0XHRcdFx0XHRcdCdiYSc6IHt9LFxuXHRcdFx0XHRcdFx0XHQnYmInOiB7fVxuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH07XG5cdFx0XHRcdFx0b25EaWRDaGFuZ2VUcmVlTm9kZS5maXJlKGdldE5vZGUoJ2EnKSk7XG5cdFx0XHRcdFx0dHJlZSA9IHtcblx0XHRcdFx0XHRcdCdhJzoge1xuXHRcdFx0XHRcdFx0XHQnYWEnOiB7fSxcblx0XHRcdFx0XHRcdFx0J2FjJzoge31cblx0XHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0XHQnYic6IHtcblx0XHRcdFx0XHRcdFx0J2JhJzoge30sXG5cdFx0XHRcdFx0XHRcdCdiYyc6IHt9XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0fTtcblx0XHRcdFx0XHRvbkRpZENoYW5nZVRyZWVOb2RlLmZpcmUoZ2V0Tm9kZSgnYicpKTtcblx0XHRcdFx0XHRyZXNvbHZlKCk7XG5cdFx0XHRcdH0pLnRoZW4oKCkgPT4ge1xuXHRcdFx0XHRcdHJldHVybiB0cmVlVmlldy5yZXZlYWwoeyBrZXk6ICdiYycgfSlcblx0XHRcdFx0XHRcdC50aGVuKCgpID0+IHtcblx0XHRcdFx0XHRcdFx0YXNzZXJ0Lm9rKHJldmVhbFRhcmdldC5jYWxsZWRPbmNlKTtcblx0XHRcdFx0XHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCgndHJlZURhdGFQcm92aWRlcicsIHJldmVhbFRhcmdldC5hcmdzWzBdWzBdKTtcblx0XHRcdFx0XHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7IGhhbmRsZTogJzAvMDpiLzA6YmMnLCBsYWJlbDogeyBsYWJlbDogJ2JjJyB9LCBjb2xsYXBzaWJsZVN0YXRlOiBUcmVlSXRlbUNvbGxhcHNpYmxlU3RhdGUuTm9uZSwgcGFyZW50SGFuZGxlOiAnMC8wOmInIH0sIHJlbW92ZVVuc2V0S2V5cyhyZXZlYWxUYXJnZXQuYXJnc1swXVsxXSEuaXRlbSkpO1xuXHRcdFx0XHRcdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKFt7IGhhbmRsZTogJzAvMDpiJywgbGFiZWw6IHsgbGFiZWw6ICdiJyB9LCBjb2xsYXBzaWJsZVN0YXRlOiBUcmVlSXRlbUNvbGxhcHNpYmxlU3RhdGUuQ29sbGFwc2VkIH1dLCAoPEFycmF5PGFueT4+cmV2ZWFsVGFyZ2V0LmFyZ3NbMF1bMV0hLnBhcmVudENoYWluKS5tYXAoYXJnID0+IHJlbW92ZVVuc2V0S2V5cyhhcmcpKSk7XG5cdFx0XHRcdFx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoeyBzZWxlY3Q6IHRydWUsIGZvY3VzOiBmYWxzZSwgZXhwYW5kOiBmYWxzZSB9LCByZXZlYWxUYXJnZXQuYXJnc1swXVsyXSk7XG5cdFx0XHRcdFx0XHR9KTtcblx0XHRcdFx0fSk7XG5cdFx0XHR9KTtcblx0fSk7XG5cblx0ZnVuY3Rpb24gbG9hZENvbXBsZXRlVHJlZSh0cmVlSWQ6IHN0cmluZywgZWxlbWVudD86IHN0cmluZyk6IFByb21pc2U8bnVsbD4ge1xuXHRcdHJldHVybiB0ZXN0T2JqZWN0LiRnZXRDaGlsZHJlbih0cmVlSWQsIGVsZW1lbnQgPyBbZWxlbWVudF0gOiB1bmRlZmluZWQpXG5cdFx0XHQudGhlbihlbGVtZW50cyA9PiB7XG5cdFx0XHRcdGlmICghZWxlbWVudHMgfHwgZWxlbWVudHM/Lmxlbmd0aCA9PT0gMCkge1xuXHRcdFx0XHRcdHJldHVybiBudWxsO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHJldHVybiBlbGVtZW50c1swXS5zbGljZSgxKS5tYXAoZSA9PiBsb2FkQ29tcGxldGVUcmVlKHRyZWVJZCwgKGUgYXMgSVRyZWVJdGVtKS5oYW5kbGUpKTtcblx0XHRcdH0pXG5cdFx0XHQudGhlbigoKSA9PiBudWxsKTtcblx0fVxuXG5cdGZ1bmN0aW9uIHJlbW92ZVVuc2V0S2V5cyhvYmo6IGFueSk6IGFueSB7XG5cdFx0aWYgKEFycmF5LmlzQXJyYXkob2JqKSkge1xuXHRcdFx0cmV0dXJuIG9iai5tYXAobyA9PiByZW1vdmVVbnNldEtleXMobykpO1xuXHRcdH1cblxuXHRcdGlmICh0eXBlb2Ygb2JqID09PSAnb2JqZWN0Jykge1xuXHRcdFx0Y29uc3QgcmVzdWx0OiB7IFtrZXk6IHN0cmluZ106IGFueSB9ID0ge307XG5cdFx0XHRmb3IgKGNvbnN0IGtleSBvZiBPYmplY3Qua2V5cyhvYmopKSB7XG5cdFx0XHRcdGlmIChvYmpba2V5XSAhPT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRcdFx0cmVzdWx0W2tleV0gPSByZW1vdmVVbnNldEtleXMob2JqW2tleV0pO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm4gcmVzdWx0O1xuXHRcdH1cblx0XHRyZXR1cm4gb2JqO1xuXHR9XG5cblx0ZnVuY3Rpb24gYU5vZGVUcmVlRGF0YVByb3ZpZGVyKCk6IFRyZWVEYXRhUHJvdmlkZXI8eyBrZXk6IHN0cmluZyB9PiB7XG5cdFx0cmV0dXJuIHtcblx0XHRcdGdldENoaWxkcmVuOiAoZWxlbWVudDogeyBrZXk6IHN0cmluZyB9KTogeyBrZXk6IHN0cmluZyB9W10gPT4ge1xuXHRcdFx0XHRyZXR1cm4gZ2V0Q2hpbGRyZW4oZWxlbWVudCA/IGVsZW1lbnQua2V5IDogdW5kZWZpbmVkKS5tYXAoa2V5ID0+IGdldE5vZGUoa2V5KSk7XG5cdFx0XHR9LFxuXHRcdFx0Z2V0VHJlZUl0ZW06IChlbGVtZW50OiB7IGtleTogc3RyaW5nIH0pOiBUcmVlSXRlbSA9PiB7XG5cdFx0XHRcdHJldHVybiBnZXRUcmVlSXRlbShlbGVtZW50LmtleSk7XG5cdFx0XHR9LFxuXHRcdFx0b25EaWRDaGFuZ2VUcmVlRGF0YTogb25EaWRDaGFuZ2VUcmVlTm9kZS5ldmVudFxuXHRcdH07XG5cdH1cblxuXHRmdW5jdGlvbiBhQ29tcGxldGVOb2RlVHJlZURhdGFQcm92aWRlcigpOiBUcmVlRGF0YVByb3ZpZGVyPHsga2V5OiBzdHJpbmcgfT4ge1xuXHRcdHJldHVybiB7XG5cdFx0XHRnZXRDaGlsZHJlbjogKGVsZW1lbnQ6IHsga2V5OiBzdHJpbmcgfSk6IHsga2V5OiBzdHJpbmcgfVtdID0+IHtcblx0XHRcdFx0cmV0dXJuIGdldENoaWxkcmVuKGVsZW1lbnQgPyBlbGVtZW50LmtleSA6IHVuZGVmaW5lZCkubWFwKGtleSA9PiBnZXROb2RlKGtleSkpO1xuXHRcdFx0fSxcblx0XHRcdGdldFRyZWVJdGVtOiAoZWxlbWVudDogeyBrZXk6IHN0cmluZyB9KTogVHJlZUl0ZW0gPT4ge1xuXHRcdFx0XHRyZXR1cm4gZ2V0VHJlZUl0ZW0oZWxlbWVudC5rZXkpO1xuXHRcdFx0fSxcblx0XHRcdGdldFBhcmVudDogKHsga2V5IH06IHsga2V5OiBzdHJpbmcgfSk6IHsga2V5OiBzdHJpbmcgfSB8IHVuZGVmaW5lZCA9PiB7XG5cdFx0XHRcdGNvbnN0IHBhcmVudEtleSA9IGtleS5zdWJzdHJpbmcoMCwga2V5Lmxlbmd0aCAtIDEpO1xuXHRcdFx0XHRyZXR1cm4gcGFyZW50S2V5ID8gbmV3IEtleShwYXJlbnRLZXkpIDogdW5kZWZpbmVkO1xuXHRcdFx0fSxcblx0XHRcdG9uRGlkQ2hhbmdlVHJlZURhdGE6IG9uRGlkQ2hhbmdlVHJlZU5vZGUuZXZlbnRcblx0XHR9O1xuXHR9XG5cblx0ZnVuY3Rpb24gYU5vZGVXaXRoSWRUcmVlRGF0YVByb3ZpZGVyKCk6IFRyZWVEYXRhUHJvdmlkZXI8eyBrZXk6IHN0cmluZyB9PiB7XG5cdFx0cmV0dXJuIHtcblx0XHRcdGdldENoaWxkcmVuOiAoZWxlbWVudDogeyBrZXk6IHN0cmluZyB9KTogeyBrZXk6IHN0cmluZyB9W10gPT4ge1xuXHRcdFx0XHRyZXR1cm4gZ2V0Q2hpbGRyZW4oZWxlbWVudCA/IGVsZW1lbnQua2V5IDogdW5kZWZpbmVkKS5tYXAoa2V5ID0+IGdldE5vZGUoa2V5KSk7XG5cdFx0XHR9LFxuXHRcdFx0Z2V0VHJlZUl0ZW06IChlbGVtZW50OiB7IGtleTogc3RyaW5nIH0pOiBUcmVlSXRlbSA9PiB7XG5cdFx0XHRcdGNvbnN0IHRyZWVJdGVtID0gZ2V0VHJlZUl0ZW0oZWxlbWVudC5rZXkpO1xuXHRcdFx0XHR0cmVlSXRlbS5pZCA9IGVsZW1lbnQua2V5O1xuXHRcdFx0XHRyZXR1cm4gdHJlZUl0ZW07XG5cdFx0XHR9LFxuXHRcdFx0b25EaWRDaGFuZ2VUcmVlRGF0YTogb25EaWRDaGFuZ2VUcmVlTm9kZVdpdGhJZC5ldmVudFxuXHRcdH07XG5cdH1cblxuXHRmdW5jdGlvbiBhTm9kZVdpdGhIaWdobGlnaHRlZExhYmVsVHJlZURhdGFQcm92aWRlcigpOiBUcmVlRGF0YVByb3ZpZGVyPHsga2V5OiBzdHJpbmcgfT4ge1xuXHRcdHJldHVybiB7XG5cdFx0XHRnZXRDaGlsZHJlbjogKGVsZW1lbnQ6IHsga2V5OiBzdHJpbmcgfSk6IHsga2V5OiBzdHJpbmcgfVtdID0+IHtcblx0XHRcdFx0cmV0dXJuIGdldENoaWxkcmVuKGVsZW1lbnQgPyBlbGVtZW50LmtleSA6IHVuZGVmaW5lZCkubWFwKGtleSA9PiBnZXROb2RlKGtleSkpO1xuXHRcdFx0fSxcblx0XHRcdGdldFRyZWVJdGVtOiAoZWxlbWVudDogeyBrZXk6IHN0cmluZyB9KTogVHJlZUl0ZW0gPT4ge1xuXHRcdFx0XHRjb25zdCB0cmVlSXRlbSA9IGdldFRyZWVJdGVtKGVsZW1lbnQua2V5LCBbWzAsIDJdLCBbMywgNV1dKTtcblx0XHRcdFx0dHJlZUl0ZW0uaWQgPSBlbGVtZW50LmtleTtcblx0XHRcdFx0cmV0dXJuIHRyZWVJdGVtO1xuXHRcdFx0fSxcblx0XHRcdG9uRGlkQ2hhbmdlVHJlZURhdGE6IG9uRGlkQ2hhbmdlVHJlZU5vZGVXaXRoSWQuZXZlbnRcblx0XHR9O1xuXHR9XG5cblx0ZnVuY3Rpb24gZ2V0VHJlZUVsZW1lbnQoZWxlbWVudDogc3RyaW5nKTogYW55IHtcblx0XHRsZXQgcGFyZW50ID0gdHJlZTtcblx0XHRmb3IgKGxldCBpID0gMDsgaSA8IGVsZW1lbnQubGVuZ3RoOyBpKyspIHtcblx0XHRcdHBhcmVudCA9IHBhcmVudFtlbGVtZW50LnN1YnN0cmluZygwLCBpICsgMSldO1xuXHRcdFx0aWYgKCFwYXJlbnQpIHtcblx0XHRcdFx0cmV0dXJuIG51bGw7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdHJldHVybiBwYXJlbnQ7XG5cdH1cblxuXHRmdW5jdGlvbiBnZXRDaGlsZHJlbihrZXk6IHN0cmluZyB8IHVuZGVmaW5lZCk6IHN0cmluZ1tdIHtcblx0XHRpZiAoIWtleSkge1xuXHRcdFx0cmV0dXJuIE9iamVjdC5rZXlzKHRyZWUpO1xuXHRcdH1cblx0XHRjb25zdCB0cmVlRWxlbWVudCA9IGdldFRyZWVFbGVtZW50KGtleSk7XG5cdFx0aWYgKHRyZWVFbGVtZW50KSB7XG5cdFx0XHRyZXR1cm4gT2JqZWN0LmtleXModHJlZUVsZW1lbnQpO1xuXHRcdH1cblx0XHRyZXR1cm4gW107XG5cdH1cblxuXHRmdW5jdGlvbiBnZXRUcmVlSXRlbShrZXk6IHN0cmluZywgaGlnaGxpZ2h0cz86IFtudW1iZXIsIG51bWJlcl1bXSk6IFRyZWVJdGVtIHtcblx0XHRjb25zdCB0cmVlRWxlbWVudCA9IGdldFRyZWVFbGVtZW50KGtleSk7XG5cdFx0cmV0dXJuIHtcblx0XHRcdGxhYmVsOiB7IGxhYmVsOiBsYWJlbHNba2V5XSB8fCBrZXksIGhpZ2hsaWdodHMgfSxcblx0XHRcdGNvbGxhcHNpYmxlU3RhdGU6IHRyZWVFbGVtZW50ICYmIE9iamVjdC5rZXlzKHRyZWVFbGVtZW50KS5sZW5ndGggPyBUcmVlSXRlbUNvbGxhcHNpYmxlU3RhdGUuQ29sbGFwc2VkIDogVHJlZUl0ZW1Db2xsYXBzaWJsZVN0YXRlLk5vbmVcblx0XHR9O1xuXHR9XG5cblx0ZnVuY3Rpb24gZ2V0Tm9kZShrZXk6IHN0cmluZyk6IHsga2V5OiBzdHJpbmcgfSB7XG5cdFx0aWYgKCFub2Rlc1trZXldKSB7XG5cdFx0XHRub2Rlc1trZXldID0gbmV3IEtleShrZXkpO1xuXHRcdH1cblx0XHRyZXR1cm4gbm9kZXNba2V5XTtcblx0fVxuXG5cdGNsYXNzIEtleSB7XG5cdFx0Y29uc3RydWN0b3IocmVhZG9ubHkga2V5OiBzdHJpbmcpIHsg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
