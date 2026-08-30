import assert from "assert";
import { AsyncDataTree, CompressibleAsyncDataTree } from "../../../../browser/ui/tree/asyncDataTree.js";
import { timeout } from "../../../../common/async.js";
import { Iterable } from "../../../../common/iterator.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../common/utils.js";
import { runWithFakedTimers } from "../../../common/timeTravelScheduler.js";
function find(element, id) {
  if (element.id === id) {
    return element;
  }
  if (!element.children) {
    return void 0;
  }
  for (const child of element.children) {
    const result = find(child, id);
    if (result) {
      return result;
    }
  }
  return void 0;
}
class Renderer {
  constructor() {
    this.templateId = "default";
  }
  renderTemplate(container) {
    return container;
  }
  renderElement(element, index, templateData) {
    templateData.textContent = element.element.id + (element.element.suffix || "");
  }
  disposeTemplate(templateData) {
  }
  renderCompressedElements(node, index, templateData) {
    const result = [];
    for (const element of node.element.elements) {
      result.push(element.id + (element.suffix || ""));
    }
    templateData.textContent = result.join("/");
  }
}
class IdentityProvider {
  getId(element) {
    return element.id;
  }
}
class VirtualDelegate {
  getHeight() {
    return 20;
  }
  getTemplateId(element) {
    return "default";
  }
}
class DataSource {
  hasChildren(element) {
    return !!element.children && element.children.length > 0;
  }
  getChildren(element) {
    return Promise.resolve(element.children || []);
  }
}
class Model {
  constructor(root) {
    this.root = root;
  }
  get(id) {
    const result = find(this.root, id);
    if (!result) {
      throw new Error("element not found");
    }
    return result;
  }
}
suite("AsyncDataTree", function() {
  const store = ensureNoDisposablesAreLeakedInTestSuite();
  test("Collapse state should be preserved across refresh calls", async () => {
    const container = document.createElement("div");
    const model = new Model({
      id: "root",
      children: [{
        id: "a"
      }]
    });
    const tree = store.add(new AsyncDataTree("test", container, new VirtualDelegate(), [new Renderer()], new DataSource(), { identityProvider: new IdentityProvider() }));
    tree.layout(200);
    assert.strictEqual(container.querySelectorAll(".monaco-list-row").length, 0);
    await tree.setInput(model.root);
    assert.strictEqual(container.querySelectorAll(".monaco-list-row").length, 1);
    const twistie = container.querySelector(".monaco-list-row:first-child .monaco-tl-twistie");
    assert(!twistie.classList.contains("collapsible"));
    assert(!twistie.classList.contains("collapsed"));
    model.get("a").children = [
      { id: "aa" },
      { id: "ab" },
      { id: "ac" }
    ];
    await tree.updateChildren(model.root);
    assert.strictEqual(container.querySelectorAll(".monaco-list-row").length, 1);
    await tree.expand(model.get("a"));
    assert.strictEqual(container.querySelectorAll(".monaco-list-row").length, 4);
    model.get("a").children = [];
    await tree.updateChildren(model.root);
    assert.strictEqual(container.querySelectorAll(".monaco-list-row").length, 1);
  });
  test("issue #68648", async () => {
    const container = document.createElement("div");
    const getChildrenCalls = [];
    const dataSource = new class {
      hasChildren(element) {
        return !!element.children && element.children.length > 0;
      }
      getChildren(element) {
        getChildrenCalls.push(element.id);
        return Promise.resolve(element.children || []);
      }
    }();
    const model = new Model({
      id: "root",
      children: [{
        id: "a"
      }]
    });
    const tree = store.add(new AsyncDataTree("test", container, new VirtualDelegate(), [new Renderer()], dataSource, { identityProvider: new IdentityProvider() }));
    tree.layout(200);
    await tree.setInput(model.root);
    assert.deepStrictEqual(getChildrenCalls, ["root"]);
    let twistie = container.querySelector(".monaco-list-row:first-child .monaco-tl-twistie");
    assert(!twistie.classList.contains("collapsible"));
    assert(!twistie.classList.contains("collapsed"));
    assert(tree.getNode().children[0].collapsed);
    model.get("a").children = [{ id: "aa" }, { id: "ab" }, { id: "ac" }];
    await tree.updateChildren(model.root);
    assert.deepStrictEqual(getChildrenCalls, ["root", "root"]);
    twistie = container.querySelector(".monaco-list-row:first-child .monaco-tl-twistie");
    assert(twistie.classList.contains("collapsible"));
    assert(twistie.classList.contains("collapsed"));
    assert(tree.getNode().children[0].collapsed);
    model.get("a").children = [];
    await tree.updateChildren(model.root);
    assert.deepStrictEqual(getChildrenCalls, ["root", "root", "root"]);
    twistie = container.querySelector(".monaco-list-row:first-child .monaco-tl-twistie");
    assert(!twistie.classList.contains("collapsible"));
    assert(!twistie.classList.contains("collapsed"));
    assert(tree.getNode().children[0].collapsed);
    model.get("a").children = [{ id: "aa" }, { id: "ab" }, { id: "ac" }];
    await tree.updateChildren(model.root);
    assert.deepStrictEqual(getChildrenCalls, ["root", "root", "root", "root"]);
    twistie = container.querySelector(".monaco-list-row:first-child .monaco-tl-twistie");
    assert(twistie.classList.contains("collapsible"));
    assert(twistie.classList.contains("collapsed"));
    assert(tree.getNode().children[0].collapsed);
  });
  test("issue #67722 - once resolved, refreshed collapsed nodes should only get children when expanded", async () => {
    const container = document.createElement("div");
    const getChildrenCalls = [];
    const dataSource = new class {
      hasChildren(element) {
        return !!element.children && element.children.length > 0;
      }
      getChildren(element) {
        getChildrenCalls.push(element.id);
        return Promise.resolve(element.children || []);
      }
    }();
    const model = new Model({
      id: "root",
      children: [{
        id: "a",
        children: [{ id: "aa" }, { id: "ab" }, { id: "ac" }]
      }]
    });
    const tree = store.add(new AsyncDataTree("test", container, new VirtualDelegate(), [new Renderer()], dataSource, { identityProvider: new IdentityProvider() }));
    tree.layout(200);
    await tree.setInput(model.root);
    assert(tree.getNode(model.get("a")).collapsed);
    assert.deepStrictEqual(getChildrenCalls, ["root"]);
    await tree.expand(model.get("a"));
    assert(!tree.getNode(model.get("a")).collapsed);
    assert.deepStrictEqual(getChildrenCalls, ["root", "a"]);
    tree.collapse(model.get("a"));
    assert(tree.getNode(model.get("a")).collapsed);
    assert.deepStrictEqual(getChildrenCalls, ["root", "a"]);
    await tree.updateChildren();
    assert(tree.getNode(model.get("a")).collapsed);
    assert.deepStrictEqual(getChildrenCalls, ["root", "a", "root"], "a should not be refreshed, since it' collapsed");
  });
  test("resolved collapsed nodes which lose children should lose twistie as well", async () => {
    const container = document.createElement("div");
    const model = new Model({
      id: "root",
      children: [{
        id: "a",
        children: [{ id: "aa" }, { id: "ab" }, { id: "ac" }]
      }]
    });
    const tree = store.add(new AsyncDataTree("test", container, new VirtualDelegate(), [new Renderer()], new DataSource(), { identityProvider: new IdentityProvider() }));
    tree.layout(200);
    await tree.setInput(model.root);
    await tree.expand(model.get("a"));
    let twistie = container.querySelector(".monaco-list-row:first-child .monaco-tl-twistie");
    assert(twistie.classList.contains("collapsible"));
    assert(!twistie.classList.contains("collapsed"));
    assert(!tree.getNode(model.get("a")).collapsed);
    tree.collapse(model.get("a"));
    model.get("a").children = [];
    await tree.updateChildren(model.root);
    twistie = container.querySelector(".monaco-list-row:first-child .monaco-tl-twistie");
    assert(!twistie.classList.contains("collapsible"));
    assert(!twistie.classList.contains("collapsed"));
    assert(tree.getNode(model.get("a")).collapsed);
  });
  test("issue #192422 - resolved collapsed nodes with changed children don't show old children", async () => {
    const container = document.createElement("div");
    let hasGottenAChildren = false;
    const dataSource = new class {
      hasChildren(element) {
        return !!element.children && element.children.length > 0;
      }
      async getChildren(element) {
        if (element.id === "a") {
          if (!hasGottenAChildren) {
            hasGottenAChildren = true;
          } else {
            return [{ id: "c" }];
          }
        }
        return element.children || [];
      }
    }();
    const model = new Model({
      id: "root",
      children: [{
        id: "a",
        children: [{ id: "b" }]
      }]
    });
    const tree = store.add(new AsyncDataTree("test", container, new VirtualDelegate(), [new Renderer()], dataSource, { identityProvider: new IdentityProvider() }));
    tree.layout(200);
    await tree.setInput(model.root);
    const a = model.get("a");
    const aNode = tree.getNode(a);
    assert(aNode.collapsed);
    await tree.expand(a);
    assert(!aNode.collapsed);
    assert.equal(aNode.children.length, 1);
    assert.equal(aNode.children[0].element.id, "b");
    const bChild = container.querySelector(".monaco-list-row:nth-child(2)");
    assert.equal(bChild?.textContent, "b");
    tree.collapse(a);
    assert(aNode.collapsed);
    await tree.updateChildren(a);
    const aUpdated1 = model.get("a");
    const aNodeUpdated1 = tree.getNode(a);
    assert(aNodeUpdated1.collapsed);
    assert.equal(aNodeUpdated1.children.length, 0);
    let didCheckNoChildren = false;
    const event = tree.onDidChangeCollapseState((e) => {
      const child2 = container.querySelector(".monaco-list-row:nth-child(2)");
      assert.equal(child2, null);
      didCheckNoChildren = true;
    });
    await tree.expand(aUpdated1);
    event.dispose();
    assert(didCheckNoChildren);
    const aNodeUpdated2 = tree.getNode(a);
    assert(!aNodeUpdated2.collapsed);
    assert.equal(aNodeUpdated2.children.length, 1);
    assert.equal(aNodeUpdated2.children[0].element.id, "c");
    const child = container.querySelector(".monaco-list-row:nth-child(2)");
    assert.equal(child?.textContent, "c");
  });
  test("issue #192422 - resolved collapsed nodes with unchanged children immediately show children", async () => {
    const container = document.createElement("div");
    const dataSource = new class {
      hasChildren(element) {
        return !!element.children && element.children.length > 0;
      }
      async getChildren(element) {
        return element.children || [];
      }
    }();
    const model = new Model({
      id: "root",
      children: [{
        id: "a",
        children: [{ id: "b" }]
      }]
    });
    const tree = store.add(new AsyncDataTree("test", container, new VirtualDelegate(), [new Renderer()], dataSource, { identityProvider: new IdentityProvider() }));
    tree.layout(200);
    await tree.setInput(model.root);
    const a = model.get("a");
    const aNode = tree.getNode(a);
    assert(aNode.collapsed);
    await tree.expand(a);
    assert(!aNode.collapsed);
    assert.equal(aNode.children.length, 1);
    assert.equal(aNode.children[0].element.id, "b");
    const bChild = container.querySelector(".monaco-list-row:nth-child(2)");
    assert.equal(bChild?.textContent, "b");
    tree.collapse(a);
    assert(aNode.collapsed);
    const aUpdated1 = model.get("a");
    const aNodeUpdated1 = tree.getNode(a);
    assert(aNodeUpdated1.collapsed);
    assert.equal(aNodeUpdated1.children.length, 1);
    let didCheckSameChildren = false;
    const event = tree.onDidChangeCollapseState((e) => {
      const child2 = container.querySelector(".monaco-list-row:nth-child(2)");
      assert.equal(child2?.textContent, "b");
      didCheckSameChildren = true;
    });
    await tree.expand(aUpdated1);
    event.dispose();
    assert(didCheckSameChildren);
    const aNodeUpdated2 = tree.getNode(a);
    assert(!aNodeUpdated2.collapsed);
    assert.equal(aNodeUpdated2.children.length, 1);
    assert.equal(aNodeUpdated2.children[0].element.id, "b");
    const child = container.querySelector(".monaco-list-row:nth-child(2)");
    assert.equal(child?.textContent, "b");
  });
  test("support default collapse state per element", async () => {
    const container = document.createElement("div");
    const getChildrenCalls = [];
    const dataSource = new class {
      hasChildren(element) {
        return !!element.children && element.children.length > 0;
      }
      getChildren(element) {
        getChildrenCalls.push(element.id);
        return Promise.resolve(element.children || []);
      }
    }();
    const model = new Model({
      id: "root",
      children: [{
        id: "a",
        children: [{ id: "aa" }, { id: "ab" }, { id: "ac" }]
      }]
    });
    const tree = store.add(new AsyncDataTree("test", container, new VirtualDelegate(), [new Renderer()], dataSource, {
      collapseByDefault: (el) => el.id !== "a"
    }));
    tree.layout(200);
    await tree.setInput(model.root);
    assert(!tree.getNode(model.get("a")).collapsed);
    assert.deepStrictEqual(getChildrenCalls, ["root", "a"]);
  });
  test("issue #80098 - concurrent refresh and expand", async () => {
    const container = document.createElement("div");
    const calls = [];
    const dataSource = new class {
      hasChildren(element) {
        return !!element.children && element.children.length > 0;
      }
      getChildren(element) {
        return new Promise((c) => calls.push(() => c(element.children || [])));
      }
    }();
    const model = new Model({
      id: "root",
      children: [{
        id: "a",
        children: [{
          id: "aa"
        }]
      }]
    });
    const tree = store.add(new AsyncDataTree("test", container, new VirtualDelegate(), [new Renderer()], dataSource, { identityProvider: new IdentityProvider() }));
    tree.layout(200);
    const pSetInput = tree.setInput(model.root);
    calls.pop()();
    await pSetInput;
    const pUpdateChildrenA = tree.updateChildren(model.get("a"));
    const pExpandA = tree.expand(model.get("a"));
    assert.strictEqual(calls.length, 1, "expand(a) still hasn't called getChildren(a)");
    calls.pop()();
    assert.strictEqual(calls.length, 0, "no pending getChildren calls");
    await pUpdateChildrenA;
    assert.strictEqual(calls.length, 0, "expand(a) should not have forced a second refresh");
    const result = await pExpandA;
    assert.strictEqual(result, true, "expand(a) should be done");
  });
  test("issue #80098 - first expand should call getChildren", async () => {
    return runWithFakedTimers({ useFakeTimers: true }, async () => {
      const container = document.createElement("div");
      const calls = [];
      const dataSource = new class {
        hasChildren(element) {
          return !!element.children && element.children.length > 0;
        }
        getChildren(element) {
          return new Promise((c) => calls.push(() => c(element.children || [])));
        }
      }();
      const model = new Model({
        id: "root",
        children: [{
          id: "a",
          children: [{
            id: "aa"
          }]
        }]
      });
      const tree = store.add(new AsyncDataTree("test", container, new VirtualDelegate(), [new Renderer()], dataSource, { identityProvider: new IdentityProvider() }));
      tree.layout(200);
      const pSetInput = tree.setInput(model.root);
      calls.pop()();
      await pSetInput;
      const pExpandA = tree.expand(model.get("a"));
      assert.strictEqual(calls.length, 1, "expand(a) should've called getChildren(a)");
      let race = await Promise.race([pExpandA.then(() => "expand"), timeout(1).then(() => "timeout")]);
      assert.strictEqual(race, "timeout", "expand(a) should not be yet done");
      calls.pop()();
      assert.strictEqual(calls.length, 0, "no pending getChildren calls");
      race = await Promise.race([pExpandA.then(() => "expand"), timeout(1).then(() => "timeout")]);
      assert.strictEqual(race, "expand", "expand(a) should now be done");
    });
  });
  test("issue #78388 - tree should react to hasChildren toggles", async () => {
    const container = document.createElement("div");
    const model = new Model({
      id: "root",
      children: [{
        id: "a"
      }]
    });
    const tree = store.add(new AsyncDataTree("test", container, new VirtualDelegate(), [new Renderer()], new DataSource(), { identityProvider: new IdentityProvider() }));
    tree.layout(200);
    await tree.setInput(model.root);
    assert.strictEqual(container.querySelectorAll(".monaco-list-row").length, 1);
    let twistie = container.querySelector(".monaco-list-row:first-child .monaco-tl-twistie");
    assert(!twistie.classList.contains("collapsible"));
    assert(!twistie.classList.contains("collapsed"));
    model.get("a").children = [{ id: "aa" }];
    await tree.updateChildren(model.get("a"), false);
    assert.strictEqual(container.querySelectorAll(".monaco-list-row").length, 1);
    twistie = container.querySelector(".monaco-list-row:first-child .monaco-tl-twistie");
    assert(twistie.classList.contains("collapsible"));
    assert(twistie.classList.contains("collapsed"));
    model.get("a").children = [];
    await tree.updateChildren(model.get("a"), false);
    assert.strictEqual(container.querySelectorAll(".monaco-list-row").length, 1);
    twistie = container.querySelector(".monaco-list-row:first-child .monaco-tl-twistie");
    assert(!twistie.classList.contains("collapsible"));
    assert(!twistie.classList.contains("collapsed"));
  });
  test("issues #84569, #82629 - rerender", async () => {
    const container = document.createElement("div");
    const model = new Model({
      id: "root",
      children: [{
        id: "a",
        children: [{
          id: "b",
          suffix: "1"
        }]
      }]
    });
    const tree = store.add(new AsyncDataTree("test", container, new VirtualDelegate(), [new Renderer()], new DataSource(), { identityProvider: new IdentityProvider() }));
    tree.layout(200);
    await tree.setInput(model.root);
    await tree.expand(model.get("a"));
    assert.deepStrictEqual(Array.from(container.querySelectorAll(".monaco-list-row")).map((e) => e.textContent), ["a", "b1"]);
    const a = model.get("a");
    const b = model.get("b");
    a.children?.splice(0, 1, { id: "b", suffix: "2" });
    await Promise.all([
      tree.updateChildren(a, true, true),
      tree.updateChildren(b, true, true)
    ]);
    assert.deepStrictEqual(Array.from(container.querySelectorAll(".monaco-list-row")).map((e) => e.textContent), ["a", "b2"]);
  });
  test("issue #199264 - dispose during render", async () => {
    const container = document.createElement("div");
    const model1 = new Model({
      id: "root",
      children: [{
        id: "a",
        children: [{ id: "aa" }, { id: "ab" }, { id: "ac" }]
      }]
    });
    const model2 = new Model({
      id: "root",
      children: [{
        id: "a",
        children: [{ id: "aa" }, { id: "ab" }, { id: "ac" }]
      }]
    });
    const tree = store.add(new AsyncDataTree("test", container, new VirtualDelegate(), [new Renderer()], new DataSource(), { identityProvider: new IdentityProvider() }));
    tree.layout(200);
    await tree.setInput(model1.root);
    const input = tree.setInput(model2.root);
    tree.dispose();
    await input;
    assert.strictEqual(container.innerHTML, "");
  });
  test("issue #121567", async () => {
    const container = document.createElement("div");
    const calls = [];
    const dataSource = new class {
      hasChildren(element) {
        return !!element.children && element.children.length > 0;
      }
      async getChildren(element) {
        calls.push(element);
        return element.children ?? Iterable.empty();
      }
    }();
    const model = new Model({
      id: "root",
      children: [{
        id: "a",
        children: [{
          id: "aa"
        }]
      }]
    });
    const a = model.get("a");
    const tree = store.add(new AsyncDataTree("test", container, new VirtualDelegate(), [new Renderer()], dataSource, { identityProvider: new IdentityProvider() }));
    tree.layout(200);
    await tree.setInput(model.root);
    assert.strictEqual(calls.length, 1, "There should be a single getChildren call for the root");
    assert(tree.isCollapsible(a), "a is collapsible");
    assert(tree.isCollapsed(a), "a is collapsed");
    await tree.updateChildren(a, false);
    assert.strictEqual(calls.length, 1, "There should be no changes to the calls list, since a was collapsed");
    assert(tree.isCollapsible(a), "a is collapsible");
    assert(tree.isCollapsed(a), "a is collapsed");
    const children = a.children;
    a.children = [];
    await tree.updateChildren(a, false);
    assert.strictEqual(calls.length, 1, "There should still be no changes to the calls list, since a was collapsed");
    assert(!tree.isCollapsible(a), "a is no longer collapsible");
    assert(tree.isCollapsed(a), "a is collapsed");
    a.children = children;
    await tree.updateChildren(a, false);
    assert.strictEqual(calls.length, 1, "There should still be no changes to the calls list, since a was collapsed");
    assert(tree.isCollapsible(a), "a is collapsible again");
    assert(tree.isCollapsed(a), "a is collapsed");
    await tree.expand(a);
    assert.strictEqual(calls.length, 2, "Finally, there should be a getChildren call for a");
    assert(tree.isCollapsible(a), "a is still collapsible");
    assert(!tree.isCollapsed(a), "a is expanded");
  });
  test("issue #199441", async () => {
    const container = document.createElement("div");
    const dataSource = new class {
      hasChildren(element) {
        return !!element.children && element.children.length > 0;
      }
      async getChildren(element) {
        return element.children ?? Iterable.empty();
      }
    }();
    const compressionDelegate = new class {
      isIncompressible(element) {
        return !dataSource.hasChildren(element);
      }
    }();
    const model = new Model({
      id: "root",
      children: [{
        id: "a",
        children: [{
          id: "b",
          children: [{ id: "b.txt" }]
        }]
      }]
    });
    const collapseByDefault = (element) => false;
    const tree = store.add(new CompressibleAsyncDataTree("test", container, new VirtualDelegate(), compressionDelegate, [new Renderer()], dataSource, { identityProvider: new IdentityProvider(), collapseByDefault }));
    tree.layout(200);
    await tree.setInput(model.root);
    assert.deepStrictEqual(Array.from(container.querySelectorAll(".monaco-list-row")).map((e) => e.textContent), ["a/b", "b.txt"]);
    model.get("a").children.push({
      id: "c",
      children: [{ id: "c.txt" }]
    });
    await tree.updateChildren(model.root, true);
    assert.deepStrictEqual(Array.from(container.querySelectorAll(".monaco-list-row")).map((e) => e.textContent), ["a", "b", "b.txt", "c", "c.txt"]);
  });
  test("Tree Navigation: AsyncDataTree", async () => {
    const container = document.createElement("div");
    const model = new Model({
      id: "root",
      children: [{
        id: "a",
        children: [{
          id: "aa",
          children: [{ id: "aa.txt" }]
        }, {
          id: "ab",
          children: [{ id: "ab.txt" }]
        }]
      }, {
        id: "b",
        children: [{
          id: "ba",
          children: [{ id: "ba.txt" }]
        }, {
          id: "bb",
          children: [{ id: "bb.txt" }]
        }]
      }, {
        id: "c",
        children: [{
          id: "ca",
          children: [{ id: "ca.txt" }]
        }, {
          id: "cb",
          children: [{ id: "cb.txt" }]
        }]
      }]
    });
    const tree = store.add(new AsyncDataTree("test", container, new VirtualDelegate(), [new Renderer()], new DataSource(), { identityProvider: new IdentityProvider() }));
    tree.layout(200);
    await tree.setInput(model.root);
    assert.deepStrictEqual(Array.from(container.querySelectorAll(".monaco-list-row")).map((e) => e.textContent), ["a", "b", "c"]);
    assert.strictEqual(tree.navigate().current(), null);
    assert.strictEqual(tree.navigate().first()?.id, "a");
    assert.strictEqual(tree.navigate().last()?.id, "c");
    assert.strictEqual(tree.navigate(model.get("b")).previous()?.id, "a");
    assert.strictEqual(tree.navigate(model.get("b")).next()?.id, "c");
    await tree.expand(model.get("a"));
    await tree.expand(model.get("aa"));
    await tree.expand(model.get("ab"));
    await tree.expand(model.get("b"));
    await tree.expand(model.get("ba"));
    await tree.expand(model.get("bb"));
    await tree.expand(model.get("c"));
    await tree.expand(model.get("ca"));
    await tree.expand(model.get("cb"));
    assert.deepStrictEqual(Array.from(container.querySelectorAll(".monaco-list-row")).map((e) => e.textContent), ["a", "aa", "aa.txt", "ab", "ab.txt", "b", "ba", "ba.txt", "bb", "bb.txt"]);
    assert.strictEqual(tree.navigate().first()?.id, "a");
    assert.strictEqual(tree.navigate().last()?.id, "cb.txt");
    assert.strictEqual(tree.navigate(model.get("b")).previous()?.id, "ab.txt");
    assert.strictEqual(tree.navigate(model.get("b")).next()?.id, "ba");
    assert.strictEqual(tree.navigate(model.get("ab.txt")).previous()?.id, "ab");
    assert.strictEqual(tree.navigate(model.get("ab.txt")).next()?.id, "b");
    assert.strictEqual(tree.navigate(model.get("bb.txt")).next()?.id, "c");
    tree.collapse(model.get("b"), false);
    assert.deepStrictEqual(Array.from(container.querySelectorAll(".monaco-list-row")).map((e) => e.textContent), ["a", "aa", "aa.txt", "ab", "ab.txt", "b", "c", "ca", "ca.txt", "cb"]);
    assert.strictEqual(tree.navigate(model.get("b")).next()?.id, "c");
  });
  test("Test Navigation: CompressibleAsyncDataTree", async () => {
    const container = document.createElement("div");
    const dataSource = new class {
      hasChildren(element) {
        return !!element.children && element.children.length > 0;
      }
      async getChildren(element) {
        return element.children ?? Iterable.empty();
      }
    }();
    const compressionDelegate = new class {
      isIncompressible(element) {
        return !dataSource.hasChildren(element);
      }
    }();
    const model = new Model({
      id: "root",
      children: [
        {
          id: "a",
          children: [{ id: "aa", children: [{ id: "aa.txt" }] }]
        },
        {
          id: "b",
          children: [{ id: "ba", children: [{ id: "ba.txt" }] }]
        },
        {
          id: "c",
          children: [{
            id: "ca",
            children: [{ id: "ca.txt" }]
          }, {
            id: "cb",
            children: [{ id: "cb.txt" }]
          }]
        }
      ]
    });
    const tree = store.add(new CompressibleAsyncDataTree("test", container, new VirtualDelegate(), compressionDelegate, [new Renderer()], dataSource, { identityProvider: new IdentityProvider() }));
    tree.layout(200);
    await tree.setInput(model.root);
    assert.deepStrictEqual(Array.from(container.querySelectorAll(".monaco-list-row")).map((e) => e.textContent), ["a", "b", "c"]);
    assert.strictEqual(tree.navigate().current(), null);
    assert.strictEqual(tree.navigate().first()?.id, "a");
    assert.strictEqual(tree.navigate().last()?.id, "c");
    assert.strictEqual(tree.navigate(model.get("b")).previous()?.id, "a");
    assert.strictEqual(tree.navigate(model.get("b")).next()?.id, "c");
    await tree.expand(model.get("a"));
    await tree.expand(model.get("aa"));
    await tree.expand(model.get("b"));
    await tree.expand(model.get("ba"));
    await tree.expand(model.get("c"));
    await tree.expand(model.get("ca"));
    await tree.expand(model.get("cb"));
    assert.deepStrictEqual(Array.from(container.querySelectorAll(".monaco-list-row")).map((e) => e.textContent), ["a/aa", "aa.txt", "b/ba", "ba.txt", "c", "ca", "ca.txt", "cb", "cb.txt"]);
    assert.strictEqual(tree.navigate().first()?.id, "aa");
    assert.strictEqual(tree.navigate().last()?.id, "cb.txt");
    assert.strictEqual(tree.navigate(model.get("b")).previous()?.id, "aa.txt");
    assert.strictEqual(tree.navigate(model.get("ba")).previous()?.id, "aa.txt");
    assert.strictEqual(tree.navigate(model.get("b")).next()?.id, "ba.txt");
    assert.strictEqual(tree.navigate(model.get("ba")).next()?.id, "ba.txt");
    assert.strictEqual(tree.navigate(model.get("aa.txt")).previous()?.id, "aa");
    assert.strictEqual(tree.navigate(model.get("aa.txt")).next()?.id, "ba");
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxiYXNlXFx0ZXN0XFxicm93c2VyXFx1aVxcdHJlZVxcYXN5bmNEYXRhVHJlZS50ZXN0LnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IGFzc2VydCBmcm9tICdhc3NlcnQnO1xuaW1wb3J0IHsgSUlkZW50aXR5UHJvdmlkZXIsIElMaXN0VmlydHVhbERlbGVnYXRlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYnJvd3Nlci91aS9saXN0L2xpc3QuanMnO1xuaW1wb3J0IHsgQXN5bmNEYXRhVHJlZSwgQ29tcHJlc3NpYmxlQXN5bmNEYXRhVHJlZSwgSVRyZWVDb21wcmVzc2lvbkRlbGVnYXRlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYnJvd3Nlci91aS90cmVlL2FzeW5jRGF0YVRyZWUuanMnO1xuaW1wb3J0IHsgSUNvbXByZXNzZWRUcmVlTm9kZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jyb3dzZXIvdWkvdHJlZS9jb21wcmVzc2VkT2JqZWN0VHJlZU1vZGVsLmpzJztcbmltcG9ydCB7IElDb21wcmVzc2libGVUcmVlUmVuZGVyZXIgfSBmcm9tICcuLi8uLi8uLi8uLi9icm93c2VyL3VpL3RyZWUvb2JqZWN0VHJlZS5qcyc7XG5pbXBvcnQgeyBJQXN5bmNEYXRhU291cmNlLCBJVHJlZU5vZGUgfSBmcm9tICcuLi8uLi8uLi8uLi9icm93c2VyL3VpL3RyZWUvdHJlZS5qcyc7XG5pbXBvcnQgeyB0aW1lb3V0IH0gZnJvbSAnLi4vLi4vLi4vLi4vY29tbW9uL2FzeW5jLmpzJztcbmltcG9ydCB7IEl0ZXJhYmxlIH0gZnJvbSAnLi4vLi4vLi4vLi4vY29tbW9uL2l0ZXJhdG9yLmpzJztcbmltcG9ydCB7IGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi91dGlscy5qcyc7XG5pbXBvcnQgeyBydW5XaXRoRmFrZWRUaW1lcnMgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vdGltZVRyYXZlbFNjaGVkdWxlci5qcyc7XG5cbmludGVyZmFjZSBFbGVtZW50IHtcblx0aWQ6IHN0cmluZztcblx0c3VmZml4Pzogc3RyaW5nO1xuXHRjaGlsZHJlbj86IEVsZW1lbnRbXTtcbn1cblxuZnVuY3Rpb24gZmluZChlbGVtZW50OiBFbGVtZW50LCBpZDogc3RyaW5nKTogRWxlbWVudCB8IHVuZGVmaW5lZCB7XG5cdGlmIChlbGVtZW50LmlkID09PSBpZCkge1xuXHRcdHJldHVybiBlbGVtZW50O1xuXHR9XG5cblx0aWYgKCFlbGVtZW50LmNoaWxkcmVuKSB7XG5cdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0fVxuXG5cdGZvciAoY29uc3QgY2hpbGQgb2YgZWxlbWVudC5jaGlsZHJlbikge1xuXHRcdGNvbnN0IHJlc3VsdCA9IGZpbmQoY2hpbGQsIGlkKTtcblxuXHRcdGlmIChyZXN1bHQpIHtcblx0XHRcdHJldHVybiByZXN1bHQ7XG5cdFx0fVxuXHR9XG5cblx0cmV0dXJuIHVuZGVmaW5lZDtcbn1cblxuY2xhc3MgUmVuZGVyZXIgaW1wbGVtZW50cyBJQ29tcHJlc3NpYmxlVHJlZVJlbmRlcmVyPEVsZW1lbnQsIHZvaWQsIEhUTUxFbGVtZW50PiB7XG5cdHJlYWRvbmx5IHRlbXBsYXRlSWQgPSAnZGVmYXVsdCc7XG5cdHJlbmRlclRlbXBsYXRlKGNvbnRhaW5lcjogSFRNTEVsZW1lbnQpOiBIVE1MRWxlbWVudCB7XG5cdFx0cmV0dXJuIGNvbnRhaW5lcjtcblx0fVxuXHRyZW5kZXJFbGVtZW50KGVsZW1lbnQ6IElUcmVlTm9kZTxFbGVtZW50LCB2b2lkPiwgaW5kZXg6IG51bWJlciwgdGVtcGxhdGVEYXRhOiBIVE1MRWxlbWVudCk6IHZvaWQge1xuXHRcdHRlbXBsYXRlRGF0YS50ZXh0Q29udGVudCA9IGVsZW1lbnQuZWxlbWVudC5pZCArIChlbGVtZW50LmVsZW1lbnQuc3VmZml4IHx8ICcnKTtcblx0fVxuXHRkaXNwb3NlVGVtcGxhdGUodGVtcGxhdGVEYXRhOiBIVE1MRWxlbWVudCk6IHZvaWQge1xuXHRcdC8vIG5vb3Bcblx0fVxuXHRyZW5kZXJDb21wcmVzc2VkRWxlbWVudHMobm9kZTogSVRyZWVOb2RlPElDb21wcmVzc2VkVHJlZU5vZGU8RWxlbWVudD4sIHZvaWQ+LCBpbmRleDogbnVtYmVyLCB0ZW1wbGF0ZURhdGE6IEhUTUxFbGVtZW50KTogdm9pZCB7XG5cdFx0Y29uc3QgcmVzdWx0OiBzdHJpbmdbXSA9IFtdO1xuXG5cdFx0Zm9yIChjb25zdCBlbGVtZW50IG9mIG5vZGUuZWxlbWVudC5lbGVtZW50cykge1xuXHRcdFx0cmVzdWx0LnB1c2goZWxlbWVudC5pZCArIChlbGVtZW50LnN1ZmZpeCB8fCAnJykpO1xuXHRcdH1cblxuXHRcdHRlbXBsYXRlRGF0YS50ZXh0Q29udGVudCA9IHJlc3VsdC5qb2luKCcvJyk7XG5cdH1cbn1cblxuY2xhc3MgSWRlbnRpdHlQcm92aWRlciBpbXBsZW1lbnRzIElJZGVudGl0eVByb3ZpZGVyPEVsZW1lbnQ+IHtcblx0Z2V0SWQoZWxlbWVudDogRWxlbWVudCkge1xuXHRcdHJldHVybiBlbGVtZW50LmlkO1xuXHR9XG59XG5cbmNsYXNzIFZpcnR1YWxEZWxlZ2F0ZSBpbXBsZW1lbnRzIElMaXN0VmlydHVhbERlbGVnYXRlPEVsZW1lbnQ+IHtcblx0Z2V0SGVpZ2h0KCkgeyByZXR1cm4gMjA7IH1cblx0Z2V0VGVtcGxhdGVJZChlbGVtZW50OiBFbGVtZW50KTogc3RyaW5nIHsgcmV0dXJuICdkZWZhdWx0JzsgfVxufVxuXG5jbGFzcyBEYXRhU291cmNlIGltcGxlbWVudHMgSUFzeW5jRGF0YVNvdXJjZTxFbGVtZW50LCBFbGVtZW50PiB7XG5cdGhhc0NoaWxkcmVuKGVsZW1lbnQ6IEVsZW1lbnQpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gISFlbGVtZW50LmNoaWxkcmVuICYmIGVsZW1lbnQuY2hpbGRyZW4ubGVuZ3RoID4gMDtcblx0fVxuXHRnZXRDaGlsZHJlbihlbGVtZW50OiBFbGVtZW50KTogUHJvbWlzZTxFbGVtZW50W10+IHtcblx0XHRyZXR1cm4gUHJvbWlzZS5yZXNvbHZlKGVsZW1lbnQuY2hpbGRyZW4gfHwgW10pO1xuXHR9XG59XG5cbmNsYXNzIE1vZGVsIHtcblxuXHRjb25zdHJ1Y3RvcihyZWFkb25seSByb290OiBFbGVtZW50KSB7IH1cblxuXHRnZXQoaWQ6IHN0cmluZyk6IEVsZW1lbnQge1xuXHRcdGNvbnN0IHJlc3VsdCA9IGZpbmQodGhpcy5yb290LCBpZCk7XG5cblx0XHRpZiAoIXJlc3VsdCkge1xuXHRcdFx0dGhyb3cgbmV3IEVycm9yKCdlbGVtZW50IG5vdCBmb3VuZCcpO1xuXHRcdH1cblxuXHRcdHJldHVybiByZXN1bHQ7XG5cdH1cbn1cblxuc3VpdGUoJ0FzeW5jRGF0YVRyZWUnLCBmdW5jdGlvbiAoKSB7XG5cblx0Y29uc3Qgc3RvcmUgPSBlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUoKTtcblxuXHR0ZXN0KCdDb2xsYXBzZSBzdGF0ZSBzaG91bGQgYmUgcHJlc2VydmVkIGFjcm9zcyByZWZyZXNoIGNhbGxzJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IGNvbnRhaW5lciA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2RpdicpO1xuXG5cdFx0Y29uc3QgbW9kZWwgPSBuZXcgTW9kZWwoe1xuXHRcdFx0aWQ6ICdyb290Jyxcblx0XHRcdGNoaWxkcmVuOiBbe1xuXHRcdFx0XHRpZDogJ2EnXG5cdFx0XHR9XVxuXHRcdH0pO1xuXG5cdFx0Y29uc3QgdHJlZSA9IHN0b3JlLmFkZChuZXcgQXN5bmNEYXRhVHJlZTxFbGVtZW50LCBFbGVtZW50PigndGVzdCcsIGNvbnRhaW5lciwgbmV3IFZpcnR1YWxEZWxlZ2F0ZSgpLCBbbmV3IFJlbmRlcmVyKCldLCBuZXcgRGF0YVNvdXJjZSgpLCB7IGlkZW50aXR5UHJvdmlkZXI6IG5ldyBJZGVudGl0eVByb3ZpZGVyKCkgfSkpO1xuXHRcdHRyZWUubGF5b3V0KDIwMCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNvbnRhaW5lci5xdWVyeVNlbGVjdG9yQWxsKCcubW9uYWNvLWxpc3Qtcm93JykubGVuZ3RoLCAwKTtcblxuXHRcdGF3YWl0IHRyZWUuc2V0SW5wdXQobW9kZWwucm9vdCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNvbnRhaW5lci5xdWVyeVNlbGVjdG9yQWxsKCcubW9uYWNvLWxpc3Qtcm93JykubGVuZ3RoLCAxKTtcblx0XHRjb25zdCB0d2lzdGllID0gY29udGFpbmVyLnF1ZXJ5U2VsZWN0b3IoJy5tb25hY28tbGlzdC1yb3c6Zmlyc3QtY2hpbGQgLm1vbmFjby10bC10d2lzdGllJykgYXMgSFRNTEVsZW1lbnQ7XG5cdFx0YXNzZXJ0KCF0d2lzdGllLmNsYXNzTGlzdC5jb250YWlucygnY29sbGFwc2libGUnKSk7XG5cdFx0YXNzZXJ0KCF0d2lzdGllLmNsYXNzTGlzdC5jb250YWlucygnY29sbGFwc2VkJykpO1xuXG5cdFx0bW9kZWwuZ2V0KCdhJykuY2hpbGRyZW4gPSBbXG5cdFx0XHR7IGlkOiAnYWEnIH0sXG5cdFx0XHR7IGlkOiAnYWInIH0sXG5cdFx0XHR7IGlkOiAnYWMnIH1cblx0XHRdO1xuXG5cdFx0YXdhaXQgdHJlZS51cGRhdGVDaGlsZHJlbihtb2RlbC5yb290KTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY29udGFpbmVyLnF1ZXJ5U2VsZWN0b3JBbGwoJy5tb25hY28tbGlzdC1yb3cnKS5sZW5ndGgsIDEpO1xuXG5cdFx0YXdhaXQgdHJlZS5leHBhbmQobW9kZWwuZ2V0KCdhJykpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChjb250YWluZXIucXVlcnlTZWxlY3RvckFsbCgnLm1vbmFjby1saXN0LXJvdycpLmxlbmd0aCwgNCk7XG5cblx0XHRtb2RlbC5nZXQoJ2EnKS5jaGlsZHJlbiA9IFtdO1xuXHRcdGF3YWl0IHRyZWUudXBkYXRlQ2hpbGRyZW4obW9kZWwucm9vdCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNvbnRhaW5lci5xdWVyeVNlbGVjdG9yQWxsKCcubW9uYWNvLWxpc3Qtcm93JykubGVuZ3RoLCAxKTtcblx0fSk7XG5cblx0dGVzdCgnaXNzdWUgIzY4NjQ4JywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IGNvbnRhaW5lciA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2RpdicpO1xuXG5cdFx0Y29uc3QgZ2V0Q2hpbGRyZW5DYWxsczogc3RyaW5nW10gPSBbXTtcblx0XHRjb25zdCBkYXRhU291cmNlID0gbmV3IGNsYXNzIGltcGxlbWVudHMgSUFzeW5jRGF0YVNvdXJjZTxFbGVtZW50LCBFbGVtZW50PiB7XG5cdFx0XHRoYXNDaGlsZHJlbihlbGVtZW50OiBFbGVtZW50KTogYm9vbGVhbiB7XG5cdFx0XHRcdHJldHVybiAhIWVsZW1lbnQuY2hpbGRyZW4gJiYgZWxlbWVudC5jaGlsZHJlbi5sZW5ndGggPiAwO1xuXHRcdFx0fVxuXHRcdFx0Z2V0Q2hpbGRyZW4oZWxlbWVudDogRWxlbWVudCk6IFByb21pc2U8RWxlbWVudFtdPiB7XG5cdFx0XHRcdGdldENoaWxkcmVuQ2FsbHMucHVzaChlbGVtZW50LmlkKTtcblx0XHRcdFx0cmV0dXJuIFByb21pc2UucmVzb2x2ZShlbGVtZW50LmNoaWxkcmVuIHx8IFtdKTtcblx0XHRcdH1cblx0XHR9O1xuXG5cdFx0Y29uc3QgbW9kZWwgPSBuZXcgTW9kZWwoe1xuXHRcdFx0aWQ6ICdyb290Jyxcblx0XHRcdGNoaWxkcmVuOiBbe1xuXHRcdFx0XHRpZDogJ2EnXG5cdFx0XHR9XVxuXHRcdH0pO1xuXG5cdFx0Y29uc3QgdHJlZSA9IHN0b3JlLmFkZChuZXcgQXN5bmNEYXRhVHJlZTxFbGVtZW50LCBFbGVtZW50PigndGVzdCcsIGNvbnRhaW5lciwgbmV3IFZpcnR1YWxEZWxlZ2F0ZSgpLCBbbmV3IFJlbmRlcmVyKCldLCBkYXRhU291cmNlLCB7IGlkZW50aXR5UHJvdmlkZXI6IG5ldyBJZGVudGl0eVByb3ZpZGVyKCkgfSkpO1xuXHRcdHRyZWUubGF5b3V0KDIwMCk7XG5cblx0XHRhd2FpdCB0cmVlLnNldElucHV0KG1vZGVsLnJvb3QpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoZ2V0Q2hpbGRyZW5DYWxscywgWydyb290J10pO1xuXG5cdFx0bGV0IHR3aXN0aWUgPSBjb250YWluZXIucXVlcnlTZWxlY3RvcignLm1vbmFjby1saXN0LXJvdzpmaXJzdC1jaGlsZCAubW9uYWNvLXRsLXR3aXN0aWUnKSBhcyBIVE1MRWxlbWVudDtcblx0XHRhc3NlcnQoIXR3aXN0aWUuY2xhc3NMaXN0LmNvbnRhaW5zKCdjb2xsYXBzaWJsZScpKTtcblx0XHRhc3NlcnQoIXR3aXN0aWUuY2xhc3NMaXN0LmNvbnRhaW5zKCdjb2xsYXBzZWQnKSk7XG5cdFx0YXNzZXJ0KHRyZWUuZ2V0Tm9kZSgpLmNoaWxkcmVuWzBdLmNvbGxhcHNlZCk7XG5cblx0XHRtb2RlbC5nZXQoJ2EnKS5jaGlsZHJlbiA9IFt7IGlkOiAnYWEnIH0sIHsgaWQ6ICdhYicgfSwgeyBpZDogJ2FjJyB9XTtcblx0XHRhd2FpdCB0cmVlLnVwZGF0ZUNoaWxkcmVuKG1vZGVsLnJvb3QpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChnZXRDaGlsZHJlbkNhbGxzLCBbJ3Jvb3QnLCAncm9vdCddKTtcblx0XHR0d2lzdGllID0gY29udGFpbmVyLnF1ZXJ5U2VsZWN0b3IoJy5tb25hY28tbGlzdC1yb3c6Zmlyc3QtY2hpbGQgLm1vbmFjby10bC10d2lzdGllJykgYXMgSFRNTEVsZW1lbnQ7XG5cdFx0YXNzZXJ0KHR3aXN0aWUuY2xhc3NMaXN0LmNvbnRhaW5zKCdjb2xsYXBzaWJsZScpKTtcblx0XHRhc3NlcnQodHdpc3RpZS5jbGFzc0xpc3QuY29udGFpbnMoJ2NvbGxhcHNlZCcpKTtcblx0XHRhc3NlcnQodHJlZS5nZXROb2RlKCkuY2hpbGRyZW5bMF0uY29sbGFwc2VkKTtcblxuXHRcdG1vZGVsLmdldCgnYScpLmNoaWxkcmVuID0gW107XG5cdFx0YXdhaXQgdHJlZS51cGRhdGVDaGlsZHJlbihtb2RlbC5yb290KTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoZ2V0Q2hpbGRyZW5DYWxscywgWydyb290JywgJ3Jvb3QnLCAncm9vdCddKTtcblx0XHR0d2lzdGllID0gY29udGFpbmVyLnF1ZXJ5U2VsZWN0b3IoJy5tb25hY28tbGlzdC1yb3c6Zmlyc3QtY2hpbGQgLm1vbmFjby10bC10d2lzdGllJykgYXMgSFRNTEVsZW1lbnQ7XG5cdFx0YXNzZXJ0KCF0d2lzdGllLmNsYXNzTGlzdC5jb250YWlucygnY29sbGFwc2libGUnKSk7XG5cdFx0YXNzZXJ0KCF0d2lzdGllLmNsYXNzTGlzdC5jb250YWlucygnY29sbGFwc2VkJykpO1xuXHRcdGFzc2VydCh0cmVlLmdldE5vZGUoKS5jaGlsZHJlblswXS5jb2xsYXBzZWQpO1xuXG5cdFx0bW9kZWwuZ2V0KCdhJykuY2hpbGRyZW4gPSBbeyBpZDogJ2FhJyB9LCB7IGlkOiAnYWInIH0sIHsgaWQ6ICdhYycgfV07XG5cdFx0YXdhaXQgdHJlZS51cGRhdGVDaGlsZHJlbihtb2RlbC5yb290KTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoZ2V0Q2hpbGRyZW5DYWxscywgWydyb290JywgJ3Jvb3QnLCAncm9vdCcsICdyb290J10pO1xuXHRcdHR3aXN0aWUgPSBjb250YWluZXIucXVlcnlTZWxlY3RvcignLm1vbmFjby1saXN0LXJvdzpmaXJzdC1jaGlsZCAubW9uYWNvLXRsLXR3aXN0aWUnKSBhcyBIVE1MRWxlbWVudDtcblx0XHRhc3NlcnQodHdpc3RpZS5jbGFzc0xpc3QuY29udGFpbnMoJ2NvbGxhcHNpYmxlJykpO1xuXHRcdGFzc2VydCh0d2lzdGllLmNsYXNzTGlzdC5jb250YWlucygnY29sbGFwc2VkJykpO1xuXHRcdGFzc2VydCh0cmVlLmdldE5vZGUoKS5jaGlsZHJlblswXS5jb2xsYXBzZWQpO1xuXHR9KTtcblxuXHR0ZXN0KCdpc3N1ZSAjNjc3MjIgLSBvbmNlIHJlc29sdmVkLCByZWZyZXNoZWQgY29sbGFwc2VkIG5vZGVzIHNob3VsZCBvbmx5IGdldCBjaGlsZHJlbiB3aGVuIGV4cGFuZGVkJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IGNvbnRhaW5lciA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2RpdicpO1xuXG5cdFx0Y29uc3QgZ2V0Q2hpbGRyZW5DYWxsczogc3RyaW5nW10gPSBbXTtcblx0XHRjb25zdCBkYXRhU291cmNlID0gbmV3IGNsYXNzIGltcGxlbWVudHMgSUFzeW5jRGF0YVNvdXJjZTxFbGVtZW50LCBFbGVtZW50PiB7XG5cdFx0XHRoYXNDaGlsZHJlbihlbGVtZW50OiBFbGVtZW50KTogYm9vbGVhbiB7XG5cdFx0XHRcdHJldHVybiAhIWVsZW1lbnQuY2hpbGRyZW4gJiYgZWxlbWVudC5jaGlsZHJlbi5sZW5ndGggPiAwO1xuXHRcdFx0fVxuXHRcdFx0Z2V0Q2hpbGRyZW4oZWxlbWVudDogRWxlbWVudCk6IFByb21pc2U8RWxlbWVudFtdPiB7XG5cdFx0XHRcdGdldENoaWxkcmVuQ2FsbHMucHVzaChlbGVtZW50LmlkKTtcblx0XHRcdFx0cmV0dXJuIFByb21pc2UucmVzb2x2ZShlbGVtZW50LmNoaWxkcmVuIHx8IFtdKTtcblx0XHRcdH1cblx0XHR9O1xuXG5cdFx0Y29uc3QgbW9kZWwgPSBuZXcgTW9kZWwoe1xuXHRcdFx0aWQ6ICdyb290Jyxcblx0XHRcdGNoaWxkcmVuOiBbe1xuXHRcdFx0XHRpZDogJ2EnLCBjaGlsZHJlbjogW3sgaWQ6ICdhYScgfSwgeyBpZDogJ2FiJyB9LCB7IGlkOiAnYWMnIH1dXG5cdFx0XHR9XVxuXHRcdH0pO1xuXG5cdFx0Y29uc3QgdHJlZSA9IHN0b3JlLmFkZChuZXcgQXN5bmNEYXRhVHJlZTxFbGVtZW50LCBFbGVtZW50PigndGVzdCcsIGNvbnRhaW5lciwgbmV3IFZpcnR1YWxEZWxlZ2F0ZSgpLCBbbmV3IFJlbmRlcmVyKCldLCBkYXRhU291cmNlLCB7IGlkZW50aXR5UHJvdmlkZXI6IG5ldyBJZGVudGl0eVByb3ZpZGVyKCkgfSkpO1xuXHRcdHRyZWUubGF5b3V0KDIwMCk7XG5cblx0XHRhd2FpdCB0cmVlLnNldElucHV0KG1vZGVsLnJvb3QpO1xuXHRcdGFzc2VydCh0cmVlLmdldE5vZGUobW9kZWwuZ2V0KCdhJykpLmNvbGxhcHNlZCk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChnZXRDaGlsZHJlbkNhbGxzLCBbJ3Jvb3QnXSk7XG5cblx0XHRhd2FpdCB0cmVlLmV4cGFuZChtb2RlbC5nZXQoJ2EnKSk7XG5cdFx0YXNzZXJ0KCF0cmVlLmdldE5vZGUobW9kZWwuZ2V0KCdhJykpLmNvbGxhcHNlZCk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChnZXRDaGlsZHJlbkNhbGxzLCBbJ3Jvb3QnLCAnYSddKTtcblxuXHRcdHRyZWUuY29sbGFwc2UobW9kZWwuZ2V0KCdhJykpO1xuXHRcdGFzc2VydCh0cmVlLmdldE5vZGUobW9kZWwuZ2V0KCdhJykpLmNvbGxhcHNlZCk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChnZXRDaGlsZHJlbkNhbGxzLCBbJ3Jvb3QnLCAnYSddKTtcblxuXHRcdGF3YWl0IHRyZWUudXBkYXRlQ2hpbGRyZW4oKTtcblx0XHRhc3NlcnQodHJlZS5nZXROb2RlKG1vZGVsLmdldCgnYScpKS5jb2xsYXBzZWQpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoZ2V0Q2hpbGRyZW5DYWxscywgWydyb290JywgJ2EnLCAncm9vdCddLCAnYSBzaG91bGQgbm90IGJlIHJlZnJlc2hlZCwgc2luY2UgaXRcXCcgY29sbGFwc2VkJyk7XG5cdH0pO1xuXG5cdHRlc3QoJ3Jlc29sdmVkIGNvbGxhcHNlZCBub2RlcyB3aGljaCBsb3NlIGNoaWxkcmVuIHNob3VsZCBsb3NlIHR3aXN0aWUgYXMgd2VsbCcsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBjb250YWluZXIgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdkaXYnKTtcblxuXHRcdGNvbnN0IG1vZGVsID0gbmV3IE1vZGVsKHtcblx0XHRcdGlkOiAncm9vdCcsXG5cdFx0XHRjaGlsZHJlbjogW3tcblx0XHRcdFx0aWQ6ICdhJywgY2hpbGRyZW46IFt7IGlkOiAnYWEnIH0sIHsgaWQ6ICdhYicgfSwgeyBpZDogJ2FjJyB9XVxuXHRcdFx0fV1cblx0XHR9KTtcblxuXHRcdGNvbnN0IHRyZWUgPSBzdG9yZS5hZGQobmV3IEFzeW5jRGF0YVRyZWU8RWxlbWVudCwgRWxlbWVudD4oJ3Rlc3QnLCBjb250YWluZXIsIG5ldyBWaXJ0dWFsRGVsZWdhdGUoKSwgW25ldyBSZW5kZXJlcigpXSwgbmV3IERhdGFTb3VyY2UoKSwgeyBpZGVudGl0eVByb3ZpZGVyOiBuZXcgSWRlbnRpdHlQcm92aWRlcigpIH0pKTtcblx0XHR0cmVlLmxheW91dCgyMDApO1xuXG5cdFx0YXdhaXQgdHJlZS5zZXRJbnB1dChtb2RlbC5yb290KTtcblx0XHRhd2FpdCB0cmVlLmV4cGFuZChtb2RlbC5nZXQoJ2EnKSk7XG5cblx0XHRsZXQgdHdpc3RpZSA9IGNvbnRhaW5lci5xdWVyeVNlbGVjdG9yKCcubW9uYWNvLWxpc3Qtcm93OmZpcnN0LWNoaWxkIC5tb25hY28tdGwtdHdpc3RpZScpIGFzIEhUTUxFbGVtZW50O1xuXHRcdGFzc2VydCh0d2lzdGllLmNsYXNzTGlzdC5jb250YWlucygnY29sbGFwc2libGUnKSk7XG5cdFx0YXNzZXJ0KCF0d2lzdGllLmNsYXNzTGlzdC5jb250YWlucygnY29sbGFwc2VkJykpO1xuXHRcdGFzc2VydCghdHJlZS5nZXROb2RlKG1vZGVsLmdldCgnYScpKS5jb2xsYXBzZWQpO1xuXG5cdFx0dHJlZS5jb2xsYXBzZShtb2RlbC5nZXQoJ2EnKSk7XG5cdFx0bW9kZWwuZ2V0KCdhJykuY2hpbGRyZW4gPSBbXTtcblx0XHRhd2FpdCB0cmVlLnVwZGF0ZUNoaWxkcmVuKG1vZGVsLnJvb3QpO1xuXG5cdFx0dHdpc3RpZSA9IGNvbnRhaW5lci5xdWVyeVNlbGVjdG9yKCcubW9uYWNvLWxpc3Qtcm93OmZpcnN0LWNoaWxkIC5tb25hY28tdGwtdHdpc3RpZScpIGFzIEhUTUxFbGVtZW50O1xuXHRcdGFzc2VydCghdHdpc3RpZS5jbGFzc0xpc3QuY29udGFpbnMoJ2NvbGxhcHNpYmxlJykpO1xuXHRcdGFzc2VydCghdHdpc3RpZS5jbGFzc0xpc3QuY29udGFpbnMoJ2NvbGxhcHNlZCcpKTtcblx0XHRhc3NlcnQodHJlZS5nZXROb2RlKG1vZGVsLmdldCgnYScpKS5jb2xsYXBzZWQpO1xuXHR9KTtcblxuXHR0ZXN0KCdpc3N1ZSAjMTkyNDIyIC0gcmVzb2x2ZWQgY29sbGFwc2VkIG5vZGVzIHdpdGggY2hhbmdlZCBjaGlsZHJlbiBkb25cXCd0IHNob3cgb2xkIGNoaWxkcmVuJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IGNvbnRhaW5lciA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2RpdicpO1xuXHRcdGxldCBoYXNHb3R0ZW5BQ2hpbGRyZW4gPSBmYWxzZTtcblx0XHRjb25zdCBkYXRhU291cmNlID0gbmV3IGNsYXNzIGltcGxlbWVudHMgSUFzeW5jRGF0YVNvdXJjZTxFbGVtZW50LCBFbGVtZW50PiB7XG5cdFx0XHRoYXNDaGlsZHJlbihlbGVtZW50OiBFbGVtZW50KTogYm9vbGVhbiB7XG5cdFx0XHRcdHJldHVybiAhIWVsZW1lbnQuY2hpbGRyZW4gJiYgZWxlbWVudC5jaGlsZHJlbi5sZW5ndGggPiAwO1xuXHRcdFx0fVxuXHRcdFx0YXN5bmMgZ2V0Q2hpbGRyZW4oZWxlbWVudDogRWxlbWVudCk6IFByb21pc2U8RWxlbWVudFtdPiB7XG5cdFx0XHRcdGlmIChlbGVtZW50LmlkID09PSAnYScpIHtcblx0XHRcdFx0XHRpZiAoIWhhc0dvdHRlbkFDaGlsZHJlbikge1xuXHRcdFx0XHRcdFx0aGFzR290dGVuQUNoaWxkcmVuID0gdHJ1ZTtcblx0XHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdFx0cmV0dXJuIFt7IGlkOiAnYycgfV07XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHRcdHJldHVybiBlbGVtZW50LmNoaWxkcmVuIHx8IFtdO1xuXHRcdFx0fVxuXHRcdH07XG5cblx0XHRjb25zdCBtb2RlbCA9IG5ldyBNb2RlbCh7XG5cdFx0XHRpZDogJ3Jvb3QnLFxuXHRcdFx0Y2hpbGRyZW46IFt7XG5cdFx0XHRcdGlkOiAnYScsIGNoaWxkcmVuOiBbeyBpZDogJ2InIH1dXG5cdFx0XHR9XVxuXHRcdH0pO1xuXG5cdFx0Y29uc3QgdHJlZSA9IHN0b3JlLmFkZChuZXcgQXN5bmNEYXRhVHJlZTxFbGVtZW50LCBFbGVtZW50PigndGVzdCcsIGNvbnRhaW5lciwgbmV3IFZpcnR1YWxEZWxlZ2F0ZSgpLCBbbmV3IFJlbmRlcmVyKCldLCBkYXRhU291cmNlLCB7IGlkZW50aXR5UHJvdmlkZXI6IG5ldyBJZGVudGl0eVByb3ZpZGVyKCkgfSkpO1xuXHRcdHRyZWUubGF5b3V0KDIwMCk7XG5cblx0XHRhd2FpdCB0cmVlLnNldElucHV0KG1vZGVsLnJvb3QpO1xuXHRcdGNvbnN0IGEgPSBtb2RlbC5nZXQoJ2EnKTtcblx0XHRjb25zdCBhTm9kZSA9IHRyZWUuZ2V0Tm9kZShhKTtcblx0XHRhc3NlcnQoYU5vZGUuY29sbGFwc2VkKTtcblx0XHRhd2FpdCB0cmVlLmV4cGFuZChhKTtcblx0XHRhc3NlcnQoIWFOb2RlLmNvbGxhcHNlZCk7XG5cdFx0YXNzZXJ0LmVxdWFsKGFOb2RlLmNoaWxkcmVuLmxlbmd0aCwgMSk7XG5cdFx0YXNzZXJ0LmVxdWFsKGFOb2RlLmNoaWxkcmVuWzBdLmVsZW1lbnQuaWQsICdiJyk7XG5cdFx0Y29uc3QgYkNoaWxkID0gY29udGFpbmVyLnF1ZXJ5U2VsZWN0b3IoJy5tb25hY28tbGlzdC1yb3c6bnRoLWNoaWxkKDIpJyk7XG5cdFx0YXNzZXJ0LmVxdWFsKGJDaGlsZD8udGV4dENvbnRlbnQsICdiJyk7XG5cdFx0dHJlZS5jb2xsYXBzZShhKTtcblx0XHRhc3NlcnQoYU5vZGUuY29sbGFwc2VkKTtcblxuXHRcdGF3YWl0IHRyZWUudXBkYXRlQ2hpbGRyZW4oYSk7XG5cdFx0Y29uc3QgYVVwZGF0ZWQxID0gbW9kZWwuZ2V0KCdhJyk7XG5cdFx0Y29uc3QgYU5vZGVVcGRhdGVkMSA9IHRyZWUuZ2V0Tm9kZShhKTtcblx0XHRhc3NlcnQoYU5vZGVVcGRhdGVkMS5jb2xsYXBzZWQpO1xuXHRcdGFzc2VydC5lcXVhbChhTm9kZVVwZGF0ZWQxLmNoaWxkcmVuLmxlbmd0aCwgMCk7XG5cdFx0bGV0IGRpZENoZWNrTm9DaGlsZHJlbiA9IGZhbHNlO1xuXHRcdGNvbnN0IGV2ZW50ID0gdHJlZS5vbkRpZENoYW5nZUNvbGxhcHNlU3RhdGUoZSA9PiB7XG5cdFx0XHRjb25zdCBjaGlsZCA9IGNvbnRhaW5lci5xdWVyeVNlbGVjdG9yKCcubW9uYWNvLWxpc3Qtcm93Om50aC1jaGlsZCgyKScpO1xuXHRcdFx0YXNzZXJ0LmVxdWFsKGNoaWxkLCBudWxsKTtcblx0XHRcdGRpZENoZWNrTm9DaGlsZHJlbiA9IHRydWU7XG5cdFx0fSk7XG5cdFx0YXdhaXQgdHJlZS5leHBhbmQoYVVwZGF0ZWQxKTtcblx0XHRldmVudC5kaXNwb3NlKCk7XG5cdFx0YXNzZXJ0KGRpZENoZWNrTm9DaGlsZHJlbik7XG5cblx0XHRjb25zdCBhTm9kZVVwZGF0ZWQyID0gdHJlZS5nZXROb2RlKGEpO1xuXHRcdGFzc2VydCghYU5vZGVVcGRhdGVkMi5jb2xsYXBzZWQpO1xuXHRcdGFzc2VydC5lcXVhbChhTm9kZVVwZGF0ZWQyLmNoaWxkcmVuLmxlbmd0aCwgMSk7XG5cdFx0YXNzZXJ0LmVxdWFsKGFOb2RlVXBkYXRlZDIuY2hpbGRyZW5bMF0uZWxlbWVudC5pZCwgJ2MnKTtcblx0XHRjb25zdCBjaGlsZCA9IGNvbnRhaW5lci5xdWVyeVNlbGVjdG9yKCcubW9uYWNvLWxpc3Qtcm93Om50aC1jaGlsZCgyKScpO1xuXHRcdGFzc2VydC5lcXVhbChjaGlsZD8udGV4dENvbnRlbnQsICdjJyk7XG5cdH0pO1xuXG5cdHRlc3QoJ2lzc3VlICMxOTI0MjIgLSByZXNvbHZlZCBjb2xsYXBzZWQgbm9kZXMgd2l0aCB1bmNoYW5nZWQgY2hpbGRyZW4gaW1tZWRpYXRlbHkgc2hvdyBjaGlsZHJlbicsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBjb250YWluZXIgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdkaXYnKTtcblx0XHRjb25zdCBkYXRhU291cmNlID0gbmV3IGNsYXNzIGltcGxlbWVudHMgSUFzeW5jRGF0YVNvdXJjZTxFbGVtZW50LCBFbGVtZW50PiB7XG5cdFx0XHRoYXNDaGlsZHJlbihlbGVtZW50OiBFbGVtZW50KTogYm9vbGVhbiB7XG5cdFx0XHRcdHJldHVybiAhIWVsZW1lbnQuY2hpbGRyZW4gJiYgZWxlbWVudC5jaGlsZHJlbi5sZW5ndGggPiAwO1xuXHRcdFx0fVxuXHRcdFx0YXN5bmMgZ2V0Q2hpbGRyZW4oZWxlbWVudDogRWxlbWVudCk6IFByb21pc2U8RWxlbWVudFtdPiB7XG5cdFx0XHRcdHJldHVybiBlbGVtZW50LmNoaWxkcmVuIHx8IFtdO1xuXHRcdFx0fVxuXHRcdH07XG5cblx0XHRjb25zdCBtb2RlbCA9IG5ldyBNb2RlbCh7XG5cdFx0XHRpZDogJ3Jvb3QnLFxuXHRcdFx0Y2hpbGRyZW46IFt7XG5cdFx0XHRcdGlkOiAnYScsIGNoaWxkcmVuOiBbeyBpZDogJ2InIH1dXG5cdFx0XHR9XVxuXHRcdH0pO1xuXG5cdFx0Y29uc3QgdHJlZSA9IHN0b3JlLmFkZChuZXcgQXN5bmNEYXRhVHJlZTxFbGVtZW50LCBFbGVtZW50PigndGVzdCcsIGNvbnRhaW5lciwgbmV3IFZpcnR1YWxEZWxlZ2F0ZSgpLCBbbmV3IFJlbmRlcmVyKCldLCBkYXRhU291cmNlLCB7IGlkZW50aXR5UHJvdmlkZXI6IG5ldyBJZGVudGl0eVByb3ZpZGVyKCkgfSkpO1xuXHRcdHRyZWUubGF5b3V0KDIwMCk7XG5cblx0XHRhd2FpdCB0cmVlLnNldElucHV0KG1vZGVsLnJvb3QpO1xuXHRcdGNvbnN0IGEgPSBtb2RlbC5nZXQoJ2EnKTtcblx0XHRjb25zdCBhTm9kZSA9IHRyZWUuZ2V0Tm9kZShhKTtcblx0XHRhc3NlcnQoYU5vZGUuY29sbGFwc2VkKTtcblx0XHRhd2FpdCB0cmVlLmV4cGFuZChhKTtcblx0XHRhc3NlcnQoIWFOb2RlLmNvbGxhcHNlZCk7XG5cdFx0YXNzZXJ0LmVxdWFsKGFOb2RlLmNoaWxkcmVuLmxlbmd0aCwgMSk7XG5cdFx0YXNzZXJ0LmVxdWFsKGFOb2RlLmNoaWxkcmVuWzBdLmVsZW1lbnQuaWQsICdiJyk7XG5cdFx0Y29uc3QgYkNoaWxkID0gY29udGFpbmVyLnF1ZXJ5U2VsZWN0b3IoJy5tb25hY28tbGlzdC1yb3c6bnRoLWNoaWxkKDIpJyk7XG5cdFx0YXNzZXJ0LmVxdWFsKGJDaGlsZD8udGV4dENvbnRlbnQsICdiJyk7XG5cdFx0dHJlZS5jb2xsYXBzZShhKTtcblx0XHRhc3NlcnQoYU5vZGUuY29sbGFwc2VkKTtcblxuXHRcdGNvbnN0IGFVcGRhdGVkMSA9IG1vZGVsLmdldCgnYScpO1xuXHRcdGNvbnN0IGFOb2RlVXBkYXRlZDEgPSB0cmVlLmdldE5vZGUoYSk7XG5cdFx0YXNzZXJ0KGFOb2RlVXBkYXRlZDEuY29sbGFwc2VkKTtcblx0XHRhc3NlcnQuZXF1YWwoYU5vZGVVcGRhdGVkMS5jaGlsZHJlbi5sZW5ndGgsIDEpO1xuXHRcdGxldCBkaWRDaGVja1NhbWVDaGlsZHJlbiA9IGZhbHNlO1xuXHRcdGNvbnN0IGV2ZW50ID0gdHJlZS5vbkRpZENoYW5nZUNvbGxhcHNlU3RhdGUoZSA9PiB7XG5cdFx0XHRjb25zdCBjaGlsZCA9IGNvbnRhaW5lci5xdWVyeVNlbGVjdG9yKCcubW9uYWNvLWxpc3Qtcm93Om50aC1jaGlsZCgyKScpO1xuXHRcdFx0YXNzZXJ0LmVxdWFsKGNoaWxkPy50ZXh0Q29udGVudCwgJ2InKTtcblx0XHRcdGRpZENoZWNrU2FtZUNoaWxkcmVuID0gdHJ1ZTtcblx0XHR9KTtcblx0XHRhd2FpdCB0cmVlLmV4cGFuZChhVXBkYXRlZDEpO1xuXHRcdGV2ZW50LmRpc3Bvc2UoKTtcblx0XHRhc3NlcnQoZGlkQ2hlY2tTYW1lQ2hpbGRyZW4pO1xuXG5cdFx0Y29uc3QgYU5vZGVVcGRhdGVkMiA9IHRyZWUuZ2V0Tm9kZShhKTtcblx0XHRhc3NlcnQoIWFOb2RlVXBkYXRlZDIuY29sbGFwc2VkKTtcblx0XHRhc3NlcnQuZXF1YWwoYU5vZGVVcGRhdGVkMi5jaGlsZHJlbi5sZW5ndGgsIDEpO1xuXHRcdGFzc2VydC5lcXVhbChhTm9kZVVwZGF0ZWQyLmNoaWxkcmVuWzBdLmVsZW1lbnQuaWQsICdiJyk7XG5cdFx0Y29uc3QgY2hpbGQgPSBjb250YWluZXIucXVlcnlTZWxlY3RvcignLm1vbmFjby1saXN0LXJvdzpudGgtY2hpbGQoMiknKTtcblx0XHRhc3NlcnQuZXF1YWwoY2hpbGQ/LnRleHRDb250ZW50LCAnYicpO1xuXHR9KTtcblxuXHR0ZXN0KCdzdXBwb3J0IGRlZmF1bHQgY29sbGFwc2Ugc3RhdGUgcGVyIGVsZW1lbnQnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgY29udGFpbmVyID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnZGl2Jyk7XG5cblx0XHRjb25zdCBnZXRDaGlsZHJlbkNhbGxzOiBzdHJpbmdbXSA9IFtdO1xuXHRcdGNvbnN0IGRhdGFTb3VyY2UgPSBuZXcgY2xhc3MgaW1wbGVtZW50cyBJQXN5bmNEYXRhU291cmNlPEVsZW1lbnQsIEVsZW1lbnQ+IHtcblx0XHRcdGhhc0NoaWxkcmVuKGVsZW1lbnQ6IEVsZW1lbnQpOiBib29sZWFuIHtcblx0XHRcdFx0cmV0dXJuICEhZWxlbWVudC5jaGlsZHJlbiAmJiBlbGVtZW50LmNoaWxkcmVuLmxlbmd0aCA+IDA7XG5cdFx0XHR9XG5cdFx0XHRnZXRDaGlsZHJlbihlbGVtZW50OiBFbGVtZW50KTogUHJvbWlzZTxFbGVtZW50W10+IHtcblx0XHRcdFx0Z2V0Q2hpbGRyZW5DYWxscy5wdXNoKGVsZW1lbnQuaWQpO1xuXHRcdFx0XHRyZXR1cm4gUHJvbWlzZS5yZXNvbHZlKGVsZW1lbnQuY2hpbGRyZW4gfHwgW10pO1xuXHRcdFx0fVxuXHRcdH07XG5cblx0XHRjb25zdCBtb2RlbCA9IG5ldyBNb2RlbCh7XG5cdFx0XHRpZDogJ3Jvb3QnLFxuXHRcdFx0Y2hpbGRyZW46IFt7XG5cdFx0XHRcdGlkOiAnYScsIGNoaWxkcmVuOiBbeyBpZDogJ2FhJyB9LCB7IGlkOiAnYWInIH0sIHsgaWQ6ICdhYycgfV1cblx0XHRcdH1dXG5cdFx0fSk7XG5cblx0XHRjb25zdCB0cmVlID0gc3RvcmUuYWRkKG5ldyBBc3luY0RhdGFUcmVlPEVsZW1lbnQsIEVsZW1lbnQ+KCd0ZXN0JywgY29udGFpbmVyLCBuZXcgVmlydHVhbERlbGVnYXRlKCksIFtuZXcgUmVuZGVyZXIoKV0sIGRhdGFTb3VyY2UsIHtcblx0XHRcdGNvbGxhcHNlQnlEZWZhdWx0OiBlbCA9PiBlbC5pZCAhPT0gJ2EnXG5cdFx0fSkpO1xuXHRcdHRyZWUubGF5b3V0KDIwMCk7XG5cblx0XHRhd2FpdCB0cmVlLnNldElucHV0KG1vZGVsLnJvb3QpO1xuXHRcdGFzc2VydCghdHJlZS5nZXROb2RlKG1vZGVsLmdldCgnYScpKS5jb2xsYXBzZWQpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoZ2V0Q2hpbGRyZW5DYWxscywgWydyb290JywgJ2EnXSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2lzc3VlICM4MDA5OCAtIGNvbmN1cnJlbnQgcmVmcmVzaCBhbmQgZXhwYW5kJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IGNvbnRhaW5lciA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2RpdicpO1xuXG5cdFx0Y29uc3QgY2FsbHM6IEZ1bmN0aW9uW10gPSBbXTtcblx0XHRjb25zdCBkYXRhU291cmNlID0gbmV3IGNsYXNzIGltcGxlbWVudHMgSUFzeW5jRGF0YVNvdXJjZTxFbGVtZW50LCBFbGVtZW50PiB7XG5cdFx0XHRoYXNDaGlsZHJlbihlbGVtZW50OiBFbGVtZW50KTogYm9vbGVhbiB7XG5cdFx0XHRcdHJldHVybiAhIWVsZW1lbnQuY2hpbGRyZW4gJiYgZWxlbWVudC5jaGlsZHJlbi5sZW5ndGggPiAwO1xuXHRcdFx0fVxuXHRcdFx0Z2V0Q2hpbGRyZW4oZWxlbWVudDogRWxlbWVudCk6IFByb21pc2U8RWxlbWVudFtdPiB7XG5cdFx0XHRcdHJldHVybiBuZXcgUHJvbWlzZShjID0+IGNhbGxzLnB1c2goKCkgPT4gYyhlbGVtZW50LmNoaWxkcmVuIHx8IFtdKSkpO1xuXHRcdFx0fVxuXHRcdH07XG5cblx0XHRjb25zdCBtb2RlbCA9IG5ldyBNb2RlbCh7XG5cdFx0XHRpZDogJ3Jvb3QnLFxuXHRcdFx0Y2hpbGRyZW46IFt7XG5cdFx0XHRcdGlkOiAnYScsIGNoaWxkcmVuOiBbe1xuXHRcdFx0XHRcdGlkOiAnYWEnXG5cdFx0XHRcdH1dXG5cdFx0XHR9XVxuXHRcdH0pO1xuXG5cdFx0Y29uc3QgdHJlZSA9IHN0b3JlLmFkZChuZXcgQXN5bmNEYXRhVHJlZTxFbGVtZW50LCBFbGVtZW50PigndGVzdCcsIGNvbnRhaW5lciwgbmV3IFZpcnR1YWxEZWxlZ2F0ZSgpLCBbbmV3IFJlbmRlcmVyKCldLCBkYXRhU291cmNlLCB7IGlkZW50aXR5UHJvdmlkZXI6IG5ldyBJZGVudGl0eVByb3ZpZGVyKCkgfSkpO1xuXHRcdHRyZWUubGF5b3V0KDIwMCk7XG5cblx0XHRjb25zdCBwU2V0SW5wdXQgPSB0cmVlLnNldElucHV0KG1vZGVsLnJvb3QpO1xuXHRcdGNhbGxzLnBvcCgpISgpOyAvLyByZXNvbHZlIGdldENoaWxkcmVuKHJvb3QpXG5cdFx0YXdhaXQgcFNldElucHV0O1xuXG5cdFx0Y29uc3QgcFVwZGF0ZUNoaWxkcmVuQSA9IHRyZWUudXBkYXRlQ2hpbGRyZW4obW9kZWwuZ2V0KCdhJykpO1xuXHRcdGNvbnN0IHBFeHBhbmRBID0gdHJlZS5leHBhbmQobW9kZWwuZ2V0KCdhJykpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChjYWxscy5sZW5ndGgsIDEsICdleHBhbmQoYSkgc3RpbGwgaGFzblxcJ3QgY2FsbGVkIGdldENoaWxkcmVuKGEpJyk7XG5cblx0XHRjYWxscy5wb3AoKSEoKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY2FsbHMubGVuZ3RoLCAwLCAnbm8gcGVuZGluZyBnZXRDaGlsZHJlbiBjYWxscycpO1xuXG5cdFx0YXdhaXQgcFVwZGF0ZUNoaWxkcmVuQTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY2FsbHMubGVuZ3RoLCAwLCAnZXhwYW5kKGEpIHNob3VsZCBub3QgaGF2ZSBmb3JjZWQgYSBzZWNvbmQgcmVmcmVzaCcpO1xuXG5cdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgcEV4cGFuZEE7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdCwgdHJ1ZSwgJ2V4cGFuZChhKSBzaG91bGQgYmUgZG9uZScpO1xuXHR9KTtcblxuXHR0ZXN0KCdpc3N1ZSAjODAwOTggLSBmaXJzdCBleHBhbmQgc2hvdWxkIGNhbGwgZ2V0Q2hpbGRyZW4nLCBhc3luYyAoKSA9PiB7XG5cdFx0cmV0dXJuIHJ1bldpdGhGYWtlZFRpbWVycyh7IHVzZUZha2VUaW1lcnM6IHRydWUgfSwgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgY29udGFpbmVyID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnZGl2Jyk7XG5cblx0XHRcdGNvbnN0IGNhbGxzOiBGdW5jdGlvbltdID0gW107XG5cdFx0XHRjb25zdCBkYXRhU291cmNlID0gbmV3IGNsYXNzIGltcGxlbWVudHMgSUFzeW5jRGF0YVNvdXJjZTxFbGVtZW50LCBFbGVtZW50PiB7XG5cdFx0XHRcdGhhc0NoaWxkcmVuKGVsZW1lbnQ6IEVsZW1lbnQpOiBib29sZWFuIHtcblx0XHRcdFx0XHRyZXR1cm4gISFlbGVtZW50LmNoaWxkcmVuICYmIGVsZW1lbnQuY2hpbGRyZW4ubGVuZ3RoID4gMDtcblx0XHRcdFx0fVxuXHRcdFx0XHRnZXRDaGlsZHJlbihlbGVtZW50OiBFbGVtZW50KTogUHJvbWlzZTxFbGVtZW50W10+IHtcblx0XHRcdFx0XHRyZXR1cm4gbmV3IFByb21pc2UoYyA9PiBjYWxscy5wdXNoKCgpID0+IGMoZWxlbWVudC5jaGlsZHJlbiB8fCBbXSkpKTtcblx0XHRcdFx0fVxuXHRcdFx0fTtcblxuXHRcdFx0Y29uc3QgbW9kZWwgPSBuZXcgTW9kZWwoe1xuXHRcdFx0XHRpZDogJ3Jvb3QnLFxuXHRcdFx0XHRjaGlsZHJlbjogW3tcblx0XHRcdFx0XHRpZDogJ2EnLCBjaGlsZHJlbjogW3tcblx0XHRcdFx0XHRcdGlkOiAnYWEnXG5cdFx0XHRcdFx0fV1cblx0XHRcdFx0fV1cblx0XHRcdH0pO1xuXG5cdFx0XHRjb25zdCB0cmVlID0gc3RvcmUuYWRkKG5ldyBBc3luY0RhdGFUcmVlPEVsZW1lbnQsIEVsZW1lbnQ+KCd0ZXN0JywgY29udGFpbmVyLCBuZXcgVmlydHVhbERlbGVnYXRlKCksIFtuZXcgUmVuZGVyZXIoKV0sIGRhdGFTb3VyY2UsIHsgaWRlbnRpdHlQcm92aWRlcjogbmV3IElkZW50aXR5UHJvdmlkZXIoKSB9KSk7XG5cdFx0XHR0cmVlLmxheW91dCgyMDApO1xuXG5cdFx0XHRjb25zdCBwU2V0SW5wdXQgPSB0cmVlLnNldElucHV0KG1vZGVsLnJvb3QpO1xuXHRcdFx0Y2FsbHMucG9wKCkhKCk7IC8vIHJlc29sdmUgZ2V0Q2hpbGRyZW4ocm9vdClcblx0XHRcdGF3YWl0IHBTZXRJbnB1dDtcblxuXHRcdFx0Y29uc3QgcEV4cGFuZEEgPSB0cmVlLmV4cGFuZChtb2RlbC5nZXQoJ2EnKSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY2FsbHMubGVuZ3RoLCAxLCAnZXhwYW5kKGEpIHNob3VsZFxcJ3ZlIGNhbGxlZCBnZXRDaGlsZHJlbihhKScpO1xuXG5cdFx0XHRsZXQgcmFjZSA9IGF3YWl0IFByb21pc2UucmFjZShbcEV4cGFuZEEudGhlbigoKSA9PiAnZXhwYW5kJyksIHRpbWVvdXQoMSkudGhlbigoKSA9PiAndGltZW91dCcpXSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmFjZSwgJ3RpbWVvdXQnLCAnZXhwYW5kKGEpIHNob3VsZCBub3QgYmUgeWV0IGRvbmUnKTtcblxuXHRcdFx0Y2FsbHMucG9wKCkhKCk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY2FsbHMubGVuZ3RoLCAwLCAnbm8gcGVuZGluZyBnZXRDaGlsZHJlbiBjYWxscycpO1xuXG5cdFx0XHRyYWNlID0gYXdhaXQgUHJvbWlzZS5yYWNlKFtwRXhwYW5kQS50aGVuKCgpID0+ICdleHBhbmQnKSwgdGltZW91dCgxKS50aGVuKCgpID0+ICd0aW1lb3V0JyldKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyYWNlLCAnZXhwYW5kJywgJ2V4cGFuZChhKSBzaG91bGQgbm93IGJlIGRvbmUnKTtcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnaXNzdWUgIzc4Mzg4IC0gdHJlZSBzaG91bGQgcmVhY3QgdG8gaGFzQ2hpbGRyZW4gdG9nZ2xlcycsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBjb250YWluZXIgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdkaXYnKTtcblx0XHRjb25zdCBtb2RlbCA9IG5ldyBNb2RlbCh7XG5cdFx0XHRpZDogJ3Jvb3QnLFxuXHRcdFx0Y2hpbGRyZW46IFt7XG5cdFx0XHRcdGlkOiAnYSdcblx0XHRcdH1dXG5cdFx0fSk7XG5cblx0XHRjb25zdCB0cmVlID0gc3RvcmUuYWRkKG5ldyBBc3luY0RhdGFUcmVlPEVsZW1lbnQsIEVsZW1lbnQ+KCd0ZXN0JywgY29udGFpbmVyLCBuZXcgVmlydHVhbERlbGVnYXRlKCksIFtuZXcgUmVuZGVyZXIoKV0sIG5ldyBEYXRhU291cmNlKCksIHsgaWRlbnRpdHlQcm92aWRlcjogbmV3IElkZW50aXR5UHJvdmlkZXIoKSB9KSk7XG5cdFx0dHJlZS5sYXlvdXQoMjAwKTtcblxuXHRcdGF3YWl0IHRyZWUuc2V0SW5wdXQobW9kZWwucm9vdCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNvbnRhaW5lci5xdWVyeVNlbGVjdG9yQWxsKCcubW9uYWNvLWxpc3Qtcm93JykubGVuZ3RoLCAxKTtcblxuXHRcdGxldCB0d2lzdGllID0gY29udGFpbmVyLnF1ZXJ5U2VsZWN0b3IoJy5tb25hY28tbGlzdC1yb3c6Zmlyc3QtY2hpbGQgLm1vbmFjby10bC10d2lzdGllJykgYXMgSFRNTEVsZW1lbnQ7XG5cdFx0YXNzZXJ0KCF0d2lzdGllLmNsYXNzTGlzdC5jb250YWlucygnY29sbGFwc2libGUnKSk7XG5cdFx0YXNzZXJ0KCF0d2lzdGllLmNsYXNzTGlzdC5jb250YWlucygnY29sbGFwc2VkJykpO1xuXG5cdFx0bW9kZWwuZ2V0KCdhJykuY2hpbGRyZW4gPSBbeyBpZDogJ2FhJyB9XTtcblx0XHRhd2FpdCB0cmVlLnVwZGF0ZUNoaWxkcmVuKG1vZGVsLmdldCgnYScpLCBmYWxzZSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNvbnRhaW5lci5xdWVyeVNlbGVjdG9yQWxsKCcubW9uYWNvLWxpc3Qtcm93JykubGVuZ3RoLCAxKTtcblx0XHR0d2lzdGllID0gY29udGFpbmVyLnF1ZXJ5U2VsZWN0b3IoJy5tb25hY28tbGlzdC1yb3c6Zmlyc3QtY2hpbGQgLm1vbmFjby10bC10d2lzdGllJykgYXMgSFRNTEVsZW1lbnQ7XG5cdFx0YXNzZXJ0KHR3aXN0aWUuY2xhc3NMaXN0LmNvbnRhaW5zKCdjb2xsYXBzaWJsZScpKTtcblx0XHRhc3NlcnQodHdpc3RpZS5jbGFzc0xpc3QuY29udGFpbnMoJ2NvbGxhcHNlZCcpKTtcblxuXHRcdG1vZGVsLmdldCgnYScpLmNoaWxkcmVuID0gW107XG5cdFx0YXdhaXQgdHJlZS51cGRhdGVDaGlsZHJlbihtb2RlbC5nZXQoJ2EnKSwgZmFsc2UpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChjb250YWluZXIucXVlcnlTZWxlY3RvckFsbCgnLm1vbmFjby1saXN0LXJvdycpLmxlbmd0aCwgMSk7XG5cdFx0dHdpc3RpZSA9IGNvbnRhaW5lci5xdWVyeVNlbGVjdG9yKCcubW9uYWNvLWxpc3Qtcm93OmZpcnN0LWNoaWxkIC5tb25hY28tdGwtdHdpc3RpZScpIGFzIEhUTUxFbGVtZW50O1xuXHRcdGFzc2VydCghdHdpc3RpZS5jbGFzc0xpc3QuY29udGFpbnMoJ2NvbGxhcHNpYmxlJykpO1xuXHRcdGFzc2VydCghdHdpc3RpZS5jbGFzc0xpc3QuY29udGFpbnMoJ2NvbGxhcHNlZCcpKTtcblx0fSk7XG5cblx0dGVzdCgnaXNzdWVzICM4NDU2OSwgIzgyNjI5IC0gcmVyZW5kZXInLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgY29udGFpbmVyID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnZGl2Jyk7XG5cdFx0Y29uc3QgbW9kZWwgPSBuZXcgTW9kZWwoe1xuXHRcdFx0aWQ6ICdyb290Jyxcblx0XHRcdGNoaWxkcmVuOiBbe1xuXHRcdFx0XHRpZDogJ2EnLFxuXHRcdFx0XHRjaGlsZHJlbjogW3tcblx0XHRcdFx0XHRpZDogJ2InLFxuXHRcdFx0XHRcdHN1ZmZpeDogJzEnXG5cdFx0XHRcdH1dXG5cdFx0XHR9XVxuXHRcdH0pO1xuXG5cdFx0Y29uc3QgdHJlZSA9IHN0b3JlLmFkZChuZXcgQXN5bmNEYXRhVHJlZTxFbGVtZW50LCBFbGVtZW50PigndGVzdCcsIGNvbnRhaW5lciwgbmV3IFZpcnR1YWxEZWxlZ2F0ZSgpLCBbbmV3IFJlbmRlcmVyKCldLCBuZXcgRGF0YVNvdXJjZSgpLCB7IGlkZW50aXR5UHJvdmlkZXI6IG5ldyBJZGVudGl0eVByb3ZpZGVyKCkgfSkpO1xuXHRcdHRyZWUubGF5b3V0KDIwMCk7XG5cblx0XHRhd2FpdCB0cmVlLnNldElucHV0KG1vZGVsLnJvb3QpO1xuXHRcdGF3YWl0IHRyZWUuZXhwYW5kKG1vZGVsLmdldCgnYScpKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKEFycmF5LmZyb20oY29udGFpbmVyLnF1ZXJ5U2VsZWN0b3JBbGwoJy5tb25hY28tbGlzdC1yb3cnKSkubWFwKGUgPT4gZS50ZXh0Q29udGVudCksIFsnYScsICdiMSddKTtcblxuXHRcdGNvbnN0IGEgPSBtb2RlbC5nZXQoJ2EnKTtcblx0XHRjb25zdCBiID0gbW9kZWwuZ2V0KCdiJyk7XG5cdFx0YS5jaGlsZHJlbj8uc3BsaWNlKDAsIDEsIHsgaWQ6ICdiJywgc3VmZml4OiAnMicgfSk7XG5cblx0XHRhd2FpdCBQcm9taXNlLmFsbChbXG5cdFx0XHR0cmVlLnVwZGF0ZUNoaWxkcmVuKGEsIHRydWUsIHRydWUpLFxuXHRcdFx0dHJlZS51cGRhdGVDaGlsZHJlbihiLCB0cnVlLCB0cnVlKVxuXHRcdF0pO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChBcnJheS5mcm9tKGNvbnRhaW5lci5xdWVyeVNlbGVjdG9yQWxsKCcubW9uYWNvLWxpc3Qtcm93JykpLm1hcChlID0+IGUudGV4dENvbnRlbnQpLCBbJ2EnLCAnYjInXSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2lzc3VlICMxOTkyNjQgLSBkaXNwb3NlIGR1cmluZyByZW5kZXInLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgY29udGFpbmVyID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnZGl2Jyk7XG5cdFx0Y29uc3QgbW9kZWwxID0gbmV3IE1vZGVsKHtcblx0XHRcdGlkOiAncm9vdCcsXG5cdFx0XHRjaGlsZHJlbjogW3tcblx0XHRcdFx0aWQ6ICdhJywgY2hpbGRyZW46IFt7IGlkOiAnYWEnIH0sIHsgaWQ6ICdhYicgfSwgeyBpZDogJ2FjJyB9XVxuXHRcdFx0fV1cblx0XHR9KTtcblx0XHRjb25zdCBtb2RlbDIgPSBuZXcgTW9kZWwoe1xuXHRcdFx0aWQ6ICdyb290Jyxcblx0XHRcdGNoaWxkcmVuOiBbe1xuXHRcdFx0XHRpZDogJ2EnLCBjaGlsZHJlbjogW3sgaWQ6ICdhYScgfSwgeyBpZDogJ2FiJyB9LCB7IGlkOiAnYWMnIH1dXG5cdFx0XHR9XVxuXHRcdH0pO1xuXG5cdFx0Y29uc3QgdHJlZSA9IHN0b3JlLmFkZChuZXcgQXN5bmNEYXRhVHJlZTxFbGVtZW50LCBFbGVtZW50PigndGVzdCcsIGNvbnRhaW5lciwgbmV3IFZpcnR1YWxEZWxlZ2F0ZSgpLCBbbmV3IFJlbmRlcmVyKCldLCBuZXcgRGF0YVNvdXJjZSgpLCB7IGlkZW50aXR5UHJvdmlkZXI6IG5ldyBJZGVudGl0eVByb3ZpZGVyKCkgfSkpO1xuXHRcdHRyZWUubGF5b3V0KDIwMCk7XG5cblx0XHRhd2FpdCB0cmVlLnNldElucHV0KG1vZGVsMS5yb290KTtcblx0XHRjb25zdCBpbnB1dCA9IHRyZWUuc2V0SW5wdXQobW9kZWwyLnJvb3QpO1xuXHRcdHRyZWUuZGlzcG9zZSgpO1xuXHRcdGF3YWl0IGlucHV0O1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChjb250YWluZXIuaW5uZXJIVE1MLCAnJyk7XG5cdH0pO1xuXG5cdHRlc3QoJ2lzc3VlICMxMjE1NjcnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgY29udGFpbmVyID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnZGl2Jyk7XG5cblx0XHRjb25zdCBjYWxsczogRWxlbWVudFtdID0gW107XG5cdFx0Y29uc3QgZGF0YVNvdXJjZSA9IG5ldyBjbGFzcyBpbXBsZW1lbnRzIElBc3luY0RhdGFTb3VyY2U8RWxlbWVudCwgRWxlbWVudD4ge1xuXHRcdFx0aGFzQ2hpbGRyZW4oZWxlbWVudDogRWxlbWVudCk6IGJvb2xlYW4ge1xuXHRcdFx0XHRyZXR1cm4gISFlbGVtZW50LmNoaWxkcmVuICYmIGVsZW1lbnQuY2hpbGRyZW4ubGVuZ3RoID4gMDtcblx0XHRcdH1cblx0XHRcdGFzeW5jIGdldENoaWxkcmVuKGVsZW1lbnQ6IEVsZW1lbnQpIHtcblx0XHRcdFx0Y2FsbHMucHVzaChlbGVtZW50KTtcblx0XHRcdFx0cmV0dXJuIGVsZW1lbnQuY2hpbGRyZW4gPz8gSXRlcmFibGUuZW1wdHkoKTtcblx0XHRcdH1cblx0XHR9O1xuXG5cdFx0Y29uc3QgbW9kZWwgPSBuZXcgTW9kZWwoe1xuXHRcdFx0aWQ6ICdyb290Jyxcblx0XHRcdGNoaWxkcmVuOiBbe1xuXHRcdFx0XHRpZDogJ2EnLCBjaGlsZHJlbjogW3tcblx0XHRcdFx0XHRpZDogJ2FhJ1xuXHRcdFx0XHR9XVxuXHRcdFx0fV1cblx0XHR9KTtcblx0XHRjb25zdCBhID0gbW9kZWwuZ2V0KCdhJyk7XG5cblx0XHRjb25zdCB0cmVlID0gc3RvcmUuYWRkKG5ldyBBc3luY0RhdGFUcmVlPEVsZW1lbnQsIEVsZW1lbnQ+KCd0ZXN0JywgY29udGFpbmVyLCBuZXcgVmlydHVhbERlbGVnYXRlKCksIFtuZXcgUmVuZGVyZXIoKV0sIGRhdGFTb3VyY2UsIHsgaWRlbnRpdHlQcm92aWRlcjogbmV3IElkZW50aXR5UHJvdmlkZXIoKSB9KSk7XG5cdFx0dHJlZS5sYXlvdXQoMjAwKTtcblxuXHRcdGF3YWl0IHRyZWUuc2V0SW5wdXQobW9kZWwucm9vdCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNhbGxzLmxlbmd0aCwgMSwgJ1RoZXJlIHNob3VsZCBiZSBhIHNpbmdsZSBnZXRDaGlsZHJlbiBjYWxsIGZvciB0aGUgcm9vdCcpO1xuXHRcdGFzc2VydCh0cmVlLmlzQ29sbGFwc2libGUoYSksICdhIGlzIGNvbGxhcHNpYmxlJyk7XG5cdFx0YXNzZXJ0KHRyZWUuaXNDb2xsYXBzZWQoYSksICdhIGlzIGNvbGxhcHNlZCcpO1xuXG5cdFx0YXdhaXQgdHJlZS51cGRhdGVDaGlsZHJlbihhLCBmYWxzZSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNhbGxzLmxlbmd0aCwgMSwgJ1RoZXJlIHNob3VsZCBiZSBubyBjaGFuZ2VzIHRvIHRoZSBjYWxscyBsaXN0LCBzaW5jZSBhIHdhcyBjb2xsYXBzZWQnKTtcblx0XHRhc3NlcnQodHJlZS5pc0NvbGxhcHNpYmxlKGEpLCAnYSBpcyBjb2xsYXBzaWJsZScpO1xuXHRcdGFzc2VydCh0cmVlLmlzQ29sbGFwc2VkKGEpLCAnYSBpcyBjb2xsYXBzZWQnKTtcblxuXHRcdGNvbnN0IGNoaWxkcmVuID0gYS5jaGlsZHJlbjtcblx0XHRhLmNoaWxkcmVuID0gW107XG5cdFx0YXdhaXQgdHJlZS51cGRhdGVDaGlsZHJlbihhLCBmYWxzZSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNhbGxzLmxlbmd0aCwgMSwgJ1RoZXJlIHNob3VsZCBzdGlsbCBiZSBubyBjaGFuZ2VzIHRvIHRoZSBjYWxscyBsaXN0LCBzaW5jZSBhIHdhcyBjb2xsYXBzZWQnKTtcblx0XHRhc3NlcnQoIXRyZWUuaXNDb2xsYXBzaWJsZShhKSwgJ2EgaXMgbm8gbG9uZ2VyIGNvbGxhcHNpYmxlJyk7XG5cdFx0YXNzZXJ0KHRyZWUuaXNDb2xsYXBzZWQoYSksICdhIGlzIGNvbGxhcHNlZCcpO1xuXG5cdFx0YS5jaGlsZHJlbiA9IGNoaWxkcmVuO1xuXHRcdGF3YWl0IHRyZWUudXBkYXRlQ2hpbGRyZW4oYSwgZmFsc2UpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChjYWxscy5sZW5ndGgsIDEsICdUaGVyZSBzaG91bGQgc3RpbGwgYmUgbm8gY2hhbmdlcyB0byB0aGUgY2FsbHMgbGlzdCwgc2luY2UgYSB3YXMgY29sbGFwc2VkJyk7XG5cdFx0YXNzZXJ0KHRyZWUuaXNDb2xsYXBzaWJsZShhKSwgJ2EgaXMgY29sbGFwc2libGUgYWdhaW4nKTtcblx0XHRhc3NlcnQodHJlZS5pc0NvbGxhcHNlZChhKSwgJ2EgaXMgY29sbGFwc2VkJyk7XG5cblx0XHRhd2FpdCB0cmVlLmV4cGFuZChhKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY2FsbHMubGVuZ3RoLCAyLCAnRmluYWxseSwgdGhlcmUgc2hvdWxkIGJlIGEgZ2V0Q2hpbGRyZW4gY2FsbCBmb3IgYScpO1xuXHRcdGFzc2VydCh0cmVlLmlzQ29sbGFwc2libGUoYSksICdhIGlzIHN0aWxsIGNvbGxhcHNpYmxlJyk7XG5cdFx0YXNzZXJ0KCF0cmVlLmlzQ29sbGFwc2VkKGEpLCAnYSBpcyBleHBhbmRlZCcpO1xuXHR9KTtcblxuXHR0ZXN0KCdpc3N1ZSAjMTk5NDQxJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IGNvbnRhaW5lciA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2RpdicpO1xuXG5cdFx0Y29uc3QgZGF0YVNvdXJjZSA9IG5ldyBjbGFzcyBpbXBsZW1lbnRzIElBc3luY0RhdGFTb3VyY2U8RWxlbWVudCwgRWxlbWVudD4ge1xuXHRcdFx0aGFzQ2hpbGRyZW4oZWxlbWVudDogRWxlbWVudCk6IGJvb2xlYW4ge1xuXHRcdFx0XHRyZXR1cm4gISFlbGVtZW50LmNoaWxkcmVuICYmIGVsZW1lbnQuY2hpbGRyZW4ubGVuZ3RoID4gMDtcblx0XHRcdH1cblx0XHRcdGFzeW5jIGdldENoaWxkcmVuKGVsZW1lbnQ6IEVsZW1lbnQpIHtcblx0XHRcdFx0cmV0dXJuIGVsZW1lbnQuY2hpbGRyZW4gPz8gSXRlcmFibGUuZW1wdHkoKTtcblx0XHRcdH1cblx0XHR9O1xuXG5cdFx0Y29uc3QgY29tcHJlc3Npb25EZWxlZ2F0ZSA9IG5ldyBjbGFzcyBpbXBsZW1lbnRzIElUcmVlQ29tcHJlc3Npb25EZWxlZ2F0ZTxFbGVtZW50PiB7XG5cdFx0XHRpc0luY29tcHJlc3NpYmxlKGVsZW1lbnQ6IEVsZW1lbnQpOiBib29sZWFuIHtcblx0XHRcdFx0cmV0dXJuICFkYXRhU291cmNlLmhhc0NoaWxkcmVuKGVsZW1lbnQpO1xuXHRcdFx0fVxuXHRcdH07XG5cblx0XHRjb25zdCBtb2RlbCA9IG5ldyBNb2RlbCh7XG5cdFx0XHRpZDogJ3Jvb3QnLFxuXHRcdFx0Y2hpbGRyZW46IFt7XG5cdFx0XHRcdGlkOiAnYScsIGNoaWxkcmVuOiBbe1xuXHRcdFx0XHRcdGlkOiAnYicsXG5cdFx0XHRcdFx0Y2hpbGRyZW46IFt7IGlkOiAnYi50eHQnIH1dXG5cdFx0XHRcdH1dXG5cdFx0XHR9XVxuXHRcdH0pO1xuXG5cdFx0Y29uc3QgY29sbGFwc2VCeURlZmF1bHQgPSAoZWxlbWVudDogRWxlbWVudCkgPT4gZmFsc2U7XG5cblx0XHRjb25zdCB0cmVlID0gc3RvcmUuYWRkKG5ldyBDb21wcmVzc2libGVBc3luY0RhdGFUcmVlPEVsZW1lbnQsIEVsZW1lbnQ+KCd0ZXN0JywgY29udGFpbmVyLCBuZXcgVmlydHVhbERlbGVnYXRlKCksIGNvbXByZXNzaW9uRGVsZWdhdGUsIFtuZXcgUmVuZGVyZXIoKV0sIGRhdGFTb3VyY2UsIHsgaWRlbnRpdHlQcm92aWRlcjogbmV3IElkZW50aXR5UHJvdmlkZXIoKSwgY29sbGFwc2VCeURlZmF1bHQgfSkpO1xuXHRcdHRyZWUubGF5b3V0KDIwMCk7XG5cblx0XHRhd2FpdCB0cmVlLnNldElucHV0KG1vZGVsLnJvb3QpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoQXJyYXkuZnJvbShjb250YWluZXIucXVlcnlTZWxlY3RvckFsbCgnLm1vbmFjby1saXN0LXJvdycpKS5tYXAoZSA9PiBlLnRleHRDb250ZW50KSwgWydhL2InLCAnYi50eHQnXSk7XG5cblx0XHRtb2RlbC5nZXQoJ2EnKS5jaGlsZHJlbiEucHVzaCh7XG5cdFx0XHRpZDogJ2MnLFxuXHRcdFx0Y2hpbGRyZW46IFt7IGlkOiAnYy50eHQnIH1dXG5cdFx0fSk7XG5cblx0XHRhd2FpdCB0cmVlLnVwZGF0ZUNoaWxkcmVuKG1vZGVsLnJvb3QsIHRydWUpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoQXJyYXkuZnJvbShjb250YWluZXIucXVlcnlTZWxlY3RvckFsbCgnLm1vbmFjby1saXN0LXJvdycpKS5tYXAoZSA9PiBlLnRleHRDb250ZW50KSwgWydhJywgJ2InLCAnYi50eHQnLCAnYycsICdjLnR4dCddKTtcblx0fSk7XG5cblx0dGVzdCgnVHJlZSBOYXZpZ2F0aW9uOiBBc3luY0RhdGFUcmVlJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IGNvbnRhaW5lciA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2RpdicpO1xuXG5cdFx0Y29uc3QgbW9kZWwgPSBuZXcgTW9kZWwoe1xuXHRcdFx0aWQ6ICdyb290Jyxcblx0XHRcdGNoaWxkcmVuOiBbe1xuXHRcdFx0XHRpZDogJ2EnLCBjaGlsZHJlbjogW3tcblx0XHRcdFx0XHRpZDogJ2FhJywgY2hpbGRyZW46IFt7IGlkOiAnYWEudHh0JyB9XVxuXHRcdFx0XHR9LCB7XG5cdFx0XHRcdFx0aWQ6ICdhYicsIGNoaWxkcmVuOiBbeyBpZDogJ2FiLnR4dCcgfV1cblx0XHRcdFx0fV1cblx0XHRcdH0sIHtcblx0XHRcdFx0aWQ6ICdiJywgY2hpbGRyZW46IFt7XG5cdFx0XHRcdFx0aWQ6ICdiYScsIGNoaWxkcmVuOiBbeyBpZDogJ2JhLnR4dCcgfV1cblx0XHRcdFx0fSwge1xuXHRcdFx0XHRcdGlkOiAnYmInLCBjaGlsZHJlbjogW3sgaWQ6ICdiYi50eHQnIH1dXG5cdFx0XHRcdH1dXG5cdFx0XHR9LCB7XG5cdFx0XHRcdGlkOiAnYycsIGNoaWxkcmVuOiBbe1xuXHRcdFx0XHRcdGlkOiAnY2EnLCBjaGlsZHJlbjogW3sgaWQ6ICdjYS50eHQnIH1dXG5cdFx0XHRcdH0sIHtcblx0XHRcdFx0XHRpZDogJ2NiJywgY2hpbGRyZW46IFt7IGlkOiAnY2IudHh0JyB9XVxuXHRcdFx0XHR9XVxuXHRcdFx0fV1cblx0XHR9KTtcblxuXHRcdGNvbnN0IHRyZWUgPSBzdG9yZS5hZGQobmV3IEFzeW5jRGF0YVRyZWU8RWxlbWVudCwgRWxlbWVudD4oJ3Rlc3QnLCBjb250YWluZXIsIG5ldyBWaXJ0dWFsRGVsZWdhdGUoKSwgW25ldyBSZW5kZXJlcigpXSwgbmV3IERhdGFTb3VyY2UoKSwgeyBpZGVudGl0eVByb3ZpZGVyOiBuZXcgSWRlbnRpdHlQcm92aWRlcigpIH0pKTtcblx0XHR0cmVlLmxheW91dCgyMDApO1xuXG5cdFx0YXdhaXQgdHJlZS5zZXRJbnB1dChtb2RlbC5yb290KTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKEFycmF5LmZyb20oY29udGFpbmVyLnF1ZXJ5U2VsZWN0b3JBbGwoJy5tb25hY28tbGlzdC1yb3cnKSkubWFwKGUgPT4gZS50ZXh0Q29udGVudCksIFsnYScsICdiJywgJ2MnXSk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodHJlZS5uYXZpZ2F0ZSgpLmN1cnJlbnQoKSwgbnVsbCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHRyZWUubmF2aWdhdGUoKS5maXJzdCgpPy5pZCwgJ2EnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodHJlZS5uYXZpZ2F0ZSgpLmxhc3QoKT8uaWQsICdjJyk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodHJlZS5uYXZpZ2F0ZShtb2RlbC5nZXQoJ2InKSkucHJldmlvdXMoKT8uaWQsICdhJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHRyZWUubmF2aWdhdGUobW9kZWwuZ2V0KCdiJykpLm5leHQoKT8uaWQsICdjJyk7XG5cblx0XHRhd2FpdCB0cmVlLmV4cGFuZChtb2RlbC5nZXQoJ2EnKSk7XG5cdFx0YXdhaXQgdHJlZS5leHBhbmQobW9kZWwuZ2V0KCdhYScpKTtcblx0XHRhd2FpdCB0cmVlLmV4cGFuZChtb2RlbC5nZXQoJ2FiJykpO1xuXG5cdFx0YXdhaXQgdHJlZS5leHBhbmQobW9kZWwuZ2V0KCdiJykpO1xuXHRcdGF3YWl0IHRyZWUuZXhwYW5kKG1vZGVsLmdldCgnYmEnKSk7XG5cdFx0YXdhaXQgdHJlZS5leHBhbmQobW9kZWwuZ2V0KCdiYicpKTtcblxuXHRcdGF3YWl0IHRyZWUuZXhwYW5kKG1vZGVsLmdldCgnYycpKTtcblx0XHRhd2FpdCB0cmVlLmV4cGFuZChtb2RlbC5nZXQoJ2NhJykpO1xuXHRcdGF3YWl0IHRyZWUuZXhwYW5kKG1vZGVsLmdldCgnY2InKSk7XG5cblx0XHQvLyBPbmx5IHRoZSBmaXJzdCAxMCBlbGVtZW50cyBhcmUgcmVuZGVyZWQgKHRvdGFsIGhlaWdodCBpcyAyMDBweCwgZWFjaCBlbGVtZW50IGlzIDIwcHgpXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChBcnJheS5mcm9tKGNvbnRhaW5lci5xdWVyeVNlbGVjdG9yQWxsKCcubW9uYWNvLWxpc3Qtcm93JykpLm1hcChlID0+IGUudGV4dENvbnRlbnQpLCBbJ2EnLCAnYWEnLCAnYWEudHh0JywgJ2FiJywgJ2FiLnR4dCcsICdiJywgJ2JhJywgJ2JhLnR4dCcsICdiYicsICdiYi50eHQnXSk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodHJlZS5uYXZpZ2F0ZSgpLmZpcnN0KCk/LmlkLCAnYScpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh0cmVlLm5hdmlnYXRlKCkubGFzdCgpPy5pZCwgJ2NiLnR4dCcpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHRyZWUubmF2aWdhdGUobW9kZWwuZ2V0KCdiJykpLnByZXZpb3VzKCk/LmlkLCAnYWIudHh0Jyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHRyZWUubmF2aWdhdGUobW9kZWwuZ2V0KCdiJykpLm5leHQoKT8uaWQsICdiYScpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHRyZWUubmF2aWdhdGUobW9kZWwuZ2V0KCdhYi50eHQnKSkucHJldmlvdXMoKT8uaWQsICdhYicpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh0cmVlLm5hdmlnYXRlKG1vZGVsLmdldCgnYWIudHh0JykpLm5leHQoKT8uaWQsICdiJyk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodHJlZS5uYXZpZ2F0ZShtb2RlbC5nZXQoJ2JiLnR4dCcpKS5uZXh0KCk/LmlkLCAnYycpO1xuXG5cdFx0dHJlZS5jb2xsYXBzZShtb2RlbC5nZXQoJ2InKSwgZmFsc2UpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoQXJyYXkuZnJvbShjb250YWluZXIucXVlcnlTZWxlY3RvckFsbCgnLm1vbmFjby1saXN0LXJvdycpKS5tYXAoZSA9PiBlLnRleHRDb250ZW50KSwgWydhJywgJ2FhJywgJ2FhLnR4dCcsICdhYicsICdhYi50eHQnLCAnYicsICdjJywgJ2NhJywgJ2NhLnR4dCcsICdjYiddKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh0cmVlLm5hdmlnYXRlKG1vZGVsLmdldCgnYicpKS5uZXh0KCk/LmlkLCAnYycpO1xuXHR9KTtcblxuXHR0ZXN0KCdUZXN0IE5hdmlnYXRpb246IENvbXByZXNzaWJsZUFzeW5jRGF0YVRyZWUnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgY29udGFpbmVyID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnZGl2Jyk7XG5cblx0XHRjb25zdCBkYXRhU291cmNlID0gbmV3IGNsYXNzIGltcGxlbWVudHMgSUFzeW5jRGF0YVNvdXJjZTxFbGVtZW50LCBFbGVtZW50PiB7XG5cdFx0XHRoYXNDaGlsZHJlbihlbGVtZW50OiBFbGVtZW50KTogYm9vbGVhbiB7XG5cdFx0XHRcdHJldHVybiAhIWVsZW1lbnQuY2hpbGRyZW4gJiYgZWxlbWVudC5jaGlsZHJlbi5sZW5ndGggPiAwO1xuXHRcdFx0fVxuXHRcdFx0YXN5bmMgZ2V0Q2hpbGRyZW4oZWxlbWVudDogRWxlbWVudCkge1xuXHRcdFx0XHRyZXR1cm4gZWxlbWVudC5jaGlsZHJlbiA/PyBJdGVyYWJsZS5lbXB0eSgpO1xuXHRcdFx0fVxuXHRcdH07XG5cblx0XHRjb25zdCBjb21wcmVzc2lvbkRlbGVnYXRlID0gbmV3IGNsYXNzIGltcGxlbWVudHMgSVRyZWVDb21wcmVzc2lvbkRlbGVnYXRlPEVsZW1lbnQ+IHtcblx0XHRcdGlzSW5jb21wcmVzc2libGUoZWxlbWVudDogRWxlbWVudCk6IGJvb2xlYW4ge1xuXHRcdFx0XHRyZXR1cm4gIWRhdGFTb3VyY2UuaGFzQ2hpbGRyZW4oZWxlbWVudCk7XG5cdFx0XHR9XG5cdFx0fTtcblxuXHRcdGNvbnN0IG1vZGVsID0gbmV3IE1vZGVsKHtcblx0XHRcdGlkOiAncm9vdCcsXG5cdFx0XHRjaGlsZHJlbjogW1xuXHRcdFx0XHR7XG5cdFx0XHRcdFx0aWQ6ICdhJywgY2hpbGRyZW46IFt7IGlkOiAnYWEnLCBjaGlsZHJlbjogW3sgaWQ6ICdhYS50eHQnIH1dIH1dXG5cdFx0XHRcdH0sIHtcblx0XHRcdFx0XHRpZDogJ2InLCBjaGlsZHJlbjogW3sgaWQ6ICdiYScsIGNoaWxkcmVuOiBbeyBpZDogJ2JhLnR4dCcgfV0gfV1cblx0XHRcdFx0fSwge1xuXHRcdFx0XHRcdGlkOiAnYycsIGNoaWxkcmVuOiBbe1xuXHRcdFx0XHRcdFx0aWQ6ICdjYScsIGNoaWxkcmVuOiBbeyBpZDogJ2NhLnR4dCcgfV1cblx0XHRcdFx0XHR9LCB7XG5cdFx0XHRcdFx0XHRpZDogJ2NiJywgY2hpbGRyZW46IFt7IGlkOiAnY2IudHh0JyB9XVxuXHRcdFx0XHRcdH1dXG5cdFx0XHRcdH1cblx0XHRcdF1cblx0XHR9KTtcblxuXHRcdGNvbnN0IHRyZWUgPSBzdG9yZS5hZGQobmV3IENvbXByZXNzaWJsZUFzeW5jRGF0YVRyZWU8RWxlbWVudCwgRWxlbWVudD4oJ3Rlc3QnLCBjb250YWluZXIsIG5ldyBWaXJ0dWFsRGVsZWdhdGUoKSwgY29tcHJlc3Npb25EZWxlZ2F0ZSwgW25ldyBSZW5kZXJlcigpXSwgZGF0YVNvdXJjZSwgeyBpZGVudGl0eVByb3ZpZGVyOiBuZXcgSWRlbnRpdHlQcm92aWRlcigpIH0pKTtcblx0XHR0cmVlLmxheW91dCgyMDApO1xuXG5cdFx0YXdhaXQgdHJlZS5zZXRJbnB1dChtb2RlbC5yb290KTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKEFycmF5LmZyb20oY29udGFpbmVyLnF1ZXJ5U2VsZWN0b3JBbGwoJy5tb25hY28tbGlzdC1yb3cnKSkubWFwKGUgPT4gZS50ZXh0Q29udGVudCksIFsnYScsICdiJywgJ2MnXSk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodHJlZS5uYXZpZ2F0ZSgpLmN1cnJlbnQoKSwgbnVsbCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHRyZWUubmF2aWdhdGUoKS5maXJzdCgpPy5pZCwgJ2EnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodHJlZS5uYXZpZ2F0ZSgpLmxhc3QoKT8uaWQsICdjJyk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodHJlZS5uYXZpZ2F0ZShtb2RlbC5nZXQoJ2InKSkucHJldmlvdXMoKT8uaWQsICdhJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHRyZWUubmF2aWdhdGUobW9kZWwuZ2V0KCdiJykpLm5leHQoKT8uaWQsICdjJyk7XG5cblx0XHRhd2FpdCB0cmVlLmV4cGFuZChtb2RlbC5nZXQoJ2EnKSk7XG5cdFx0YXdhaXQgdHJlZS5leHBhbmQobW9kZWwuZ2V0KCdhYScpKTtcblxuXHRcdGF3YWl0IHRyZWUuZXhwYW5kKG1vZGVsLmdldCgnYicpKTtcblx0XHRhd2FpdCB0cmVlLmV4cGFuZChtb2RlbC5nZXQoJ2JhJykpO1xuXG5cdFx0YXdhaXQgdHJlZS5leHBhbmQobW9kZWwuZ2V0KCdjJykpO1xuXHRcdGF3YWl0IHRyZWUuZXhwYW5kKG1vZGVsLmdldCgnY2EnKSk7XG5cdFx0YXdhaXQgdHJlZS5leHBhbmQobW9kZWwuZ2V0KCdjYicpKTtcblxuXHRcdC8vIE9ubHkgdGhlIGZpcnN0IDEwIGVsZW1lbnRzIGFyZSByZW5kZXJlZCAodG90YWwgaGVpZ2h0IGlzIDIwMHB4LCBlYWNoIGVsZW1lbnQgaXMgMjBweClcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKEFycmF5LmZyb20oY29udGFpbmVyLnF1ZXJ5U2VsZWN0b3JBbGwoJy5tb25hY28tbGlzdC1yb3cnKSkubWFwKGUgPT4gZS50ZXh0Q29udGVudCksIFsnYS9hYScsICdhYS50eHQnLCAnYi9iYScsICdiYS50eHQnLCAnYycsICdjYScsICdjYS50eHQnLCAnY2InLCAnY2IudHh0J10pO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHRyZWUubmF2aWdhdGUoKS5maXJzdCgpPy5pZCwgJ2FhJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHRyZWUubmF2aWdhdGUoKS5sYXN0KCk/LmlkLCAnY2IudHh0Jyk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodHJlZS5uYXZpZ2F0ZShtb2RlbC5nZXQoJ2InKSkucHJldmlvdXMoKT8uaWQsICdhYS50eHQnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodHJlZS5uYXZpZ2F0ZShtb2RlbC5nZXQoJ2JhJykpLnByZXZpb3VzKCk/LmlkLCAnYWEudHh0Jyk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodHJlZS5uYXZpZ2F0ZShtb2RlbC5nZXQoJ2InKSkubmV4dCgpPy5pZCwgJ2JhLnR4dCcpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh0cmVlLm5hdmlnYXRlKG1vZGVsLmdldCgnYmEnKSkubmV4dCgpPy5pZCwgJ2JhLnR4dCcpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHRyZWUubmF2aWdhdGUobW9kZWwuZ2V0KCdhYS50eHQnKSkucHJldmlvdXMoKT8uaWQsICdhYScpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh0cmVlLm5hdmlnYXRlKG1vZGVsLmdldCgnYWEudHh0JykpLm5leHQoKT8uaWQsICdiYScpO1xuXHR9KTtcbn0pO1xuIl0sCiAgIm1hcHBpbmdzIjogIkFBS0EsT0FBTyxZQUFZO0FBRW5CLFNBQVMsZUFBZSxpQ0FBMkQ7QUFJbkYsU0FBUyxlQUFlO0FBQ3hCLFNBQVMsZ0JBQWdCO0FBQ3pCLFNBQVMsK0NBQStDO0FBQ3hELFNBQVMsMEJBQTBCO0FBUW5DLFNBQVMsS0FBSyxTQUFrQixJQUFpQztBQUNoRSxNQUFJLFFBQVEsT0FBTyxJQUFJO0FBQ3RCLFdBQU87QUFBQSxFQUNSO0FBRUEsTUFBSSxDQUFDLFFBQVEsVUFBVTtBQUN0QixXQUFPO0FBQUEsRUFDUjtBQUVBLGFBQVcsU0FBUyxRQUFRLFVBQVU7QUFDckMsVUFBTSxTQUFTLEtBQUssT0FBTyxFQUFFO0FBRTdCLFFBQUksUUFBUTtBQUNYLGFBQU87QUFBQSxJQUNSO0FBQUEsRUFDRDtBQUVBLFNBQU87QUFDUjtBQUVBLE1BQU0sU0FBMEU7QUFBQSxFQUFoRjtBQUNDLFNBQVMsYUFBYTtBQUFBO0FBQUEsRUFDdEIsZUFBZSxXQUFxQztBQUNuRCxXQUFPO0FBQUEsRUFDUjtBQUFBLEVBQ0EsY0FBYyxTQUFt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SyxHQUFHLElBQUksR0FBRztBQUVsRCxXQUFPLFlBQVksS0FBSyxTQUFTLE1BQU0sSUFBSSxHQUFHLENBQUMsRUFBRSxTQUFTLEdBQUcsSUFBSSxHQUFHO0FBQ3BFLFdBQU8sWUFBWSxLQUFLLFNBQVMsTUFBTSxJQUFJLEdBQUcsQ0FBQyxFQUFFLEtBQUssR0FBRyxJQUFJLEdBQUc7QUFFaEUsVUFBTSxLQUFLLE9BQU8sTUFBTSxJQUFJLEdBQUcsQ0FBQztBQUNoQyxVQUFNLEtBQUssT0FBTyxNQUFNLElBQUksSUFBSSxDQUFDO0FBRWpDLFVBQU0sS0FBSyxPQUFPLE1BQU0sSUFBSSxHQUFHLENBQUM7QUFDaEMsVUFBTSxLQUFLLE9BQU8sTUFBTSxJQUFJLElBQUksQ0FBQztBQUVqQyxVQUFNLEtBQUssT0FBTyxNQUFNLElBQUksR0FBRyxDQUFDO0FBQ2hDLFVBQU0sS0FBSyxPQUFPLE1BQU0sSUFBSSxJQUFJLENBQUM7QUFDakMsVUFBTSxLQUFLLE9BQU8sTUFBTSxJQUFJLElBQUksQ0FBQztBQUdqQyxXQUFPLGdCQUFnQixNQUFNLEtBQUssVUFBVSxpQkFBaUIsa0JBQWtCLENBQUMsRUFBRSxJQUFJLE9BQUssRUFBRSxXQUFXLEdBQUcsQ0FBQyxRQUFRLFVBQVUsUUFBUSxVQUFVLEtBQUssTUFBTSxVQUFVLE1BQU0sUUFBUSxDQUFDO0FBRXBMLFdBQU8sWUFBWSxLQUFLLFNBQVMsRUFBRSxNQUFNLEdBQUcsSUFBSSxJQUFJO0FBQ3BELFdBQU8sWUFBWSxLQUFLLFNBQVMsRUFBRSxLQUFLLEdBQUcsSUFBSSxRQUFRO0FBRXZELFdBQU8sWUFBWSxLQUFLLFNBQVMsTUFBTSxJQUFJLEdBQUcsQ0FBQyxFQUFFLFNBQVMsR0FBRyxJQUFJLFFBQVE7QUFDekUsV0FBTyxZQUFZLEtBQUssU0FBUyxNQUFNLElBQUksSUFBSSxDQUFDLEVBQUUsU0FBUyxHQUFHLElBQUksUUFBUTtBQUUxRSxXQUFPLFlBQVksS0FBSyxTQUFTLE1BQU0sSUFBSSxHQUFHLENBQUMsRUFBRSxLQUFLLEdBQUcsSUFBSSxRQUFRO0FBQ3JFLFdBQU8sWUFBWSxLQUFLLFNBQVMsTUFBTSxJQUFJLElBQUksQ0FBQyxFQUFFLEtBQUssR0FBRyxJQUFJLFFBQVE7QUFFdEUsV0FBTyxZQUFZLEtBQUssU0FBUyxNQUFNLElBQUksUUFBUSxDQUFDLEVBQUUsU0FBUyxHQUFHLElBQUksSUFBSTtBQUMxRSxXQUFPLFlBQVksS0FBSyxTQUFTLE1BQU0sSUFBSSxRQUFRLENBQUMsRUFBRSxLQUFLLEdBQUcsSUFBSSxJQUFJO0FBQUEsRUFDdkUsQ0FBQztBQUNGLENBQUM7IiwKICAibmFtZXMiOiBbImNoaWxkIl0KfQo=
