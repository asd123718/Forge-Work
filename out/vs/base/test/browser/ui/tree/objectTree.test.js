import assert from "assert";
import { CompressibleObjectTree, ObjectTree } from "../../../../browser/ui/tree/objectTree.js";
import { runWithFakedTimers } from "../../../common/timeTravelScheduler.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../common/utils.js";
function getRowsTextContent(container) {
  const rows = [...container.querySelectorAll(".monaco-list-row")];
  rows.sort((a, b) => parseInt(a.getAttribute("data-index")) - parseInt(b.getAttribute("data-index")));
  return rows.map((row) => row.querySelector(".monaco-tl-contents").textContent);
}
function clickElement(element, ctrlKey = false) {
  element.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, ctrlKey, button: 0 }));
  element.dispatchEvent(new MouseEvent("click", { bubbles: true, ctrlKey, button: 0 }));
}
function dispatchKeydown(element, key, code, keyCode) {
  const keyboardEvent = new KeyboardEvent("keydown", { bubbles: true, key, code });
  Object.defineProperty(keyboardEvent, "keyCode", { get: () => keyCode });
  element.dispatchEvent(keyboardEvent);
}
suite("ObjectTree", function() {
  suite("TreeNavigator", function() {
    let tree;
    let filter = (_) => true;
    teardown(() => {
      tree.dispose();
      filter = (_) => true;
    });
    ensureNoDisposablesAreLeakedInTestSuite();
    setup(() => {
      const container = document.createElement("div");
      container.style.width = "200px";
      container.style.height = "200px";
      const delegate = new class {
        getHeight() {
          return 20;
        }
        getTemplateId() {
          return "default";
        }
      }();
      const renderer = new class {
        constructor() {
          this.templateId = "default";
        }
        renderTemplate(container2) {
          return container2;
        }
        renderElement(element, index, templateData) {
          templateData.textContent = `${element.element}`;
        }
        disposeTemplate() {
        }
      }();
      tree = new ObjectTree("test", container, delegate, [renderer], { filter: { filter: (el) => filter(el) } });
      tree.layout(200);
    });
    test("should be able to navigate", () => {
      tree.setChildren(null, [
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
      const navigator = tree.navigate();
      assert.strictEqual(navigator.current(), null);
      assert.strictEqual(navigator.next(), 0);
      assert.strictEqual(navigator.current(), 0);
      assert.strictEqual(navigator.next(), 10);
      assert.strictEqual(navigator.current(), 10);
      assert.strictEqual(navigator.next(), 11);
      assert.strictEqual(navigator.current(), 11);
      assert.strictEqual(navigator.next(), 12);
      assert.strictEqual(navigator.current(), 12);
      assert.strictEqual(navigator.next(), 1);
      assert.strictEqual(navigator.current(), 1);
      assert.strictEqual(navigator.next(), 2);
      assert.strictEqual(navigator.current(), 2);
      assert.strictEqual(navigator.previous(), 1);
      assert.strictEqual(navigator.current(), 1);
      assert.strictEqual(navigator.previous(), 12);
      assert.strictEqual(navigator.previous(), 11);
      assert.strictEqual(navigator.previous(), 10);
      assert.strictEqual(navigator.previous(), 0);
      assert.strictEqual(navigator.previous(), null);
      assert.strictEqual(navigator.next(), 0);
      assert.strictEqual(navigator.next(), 10);
      assert.strictEqual(navigator.first(), 0);
      assert.strictEqual(navigator.last(), 2);
    });
    test("should skip collapsed nodes", () => {
      tree.setChildren(null, [
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
      ]);
      const navigator = tree.navigate();
      assert.strictEqual(navigator.current(), null);
      assert.strictEqual(navigator.next(), 0);
      assert.strictEqual(navigator.next(), 1);
      assert.strictEqual(navigator.next(), 2);
      assert.strictEqual(navigator.next(), null);
      assert.strictEqual(navigator.previous(), 2);
      assert.strictEqual(navigator.previous(), 1);
      assert.strictEqual(navigator.previous(), 0);
      assert.strictEqual(navigator.previous(), null);
      assert.strictEqual(navigator.next(), 0);
      assert.strictEqual(navigator.first(), 0);
      assert.strictEqual(navigator.last(), 2);
    });
    test("should skip filtered elements", () => {
      filter = (el) => el % 2 === 0;
      tree.setChildren(null, [
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
      const navigator = tree.navigate();
      assert.strictEqual(navigator.current(), null);
      assert.strictEqual(navigator.next(), 0);
      assert.strictEqual(navigator.next(), 10);
      assert.strictEqual(navigator.next(), 12);
      assert.strictEqual(navigator.next(), 2);
      assert.strictEqual(navigator.next(), null);
      assert.strictEqual(navigator.previous(), 2);
      assert.strictEqual(navigator.previous(), 12);
      assert.strictEqual(navigator.previous(), 10);
      assert.strictEqual(navigator.previous(), 0);
      assert.strictEqual(navigator.previous(), null);
      assert.strictEqual(navigator.next(), 0);
      assert.strictEqual(navigator.next(), 10);
      assert.strictEqual(navigator.first(), 0);
      assert.strictEqual(navigator.last(), 2);
    });
    test("should be able to start from node", () => {
      tree.setChildren(null, [
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
      const navigator = tree.navigate(1);
      assert.strictEqual(navigator.current(), 1);
      assert.strictEqual(navigator.next(), 2);
      assert.strictEqual(navigator.current(), 2);
      assert.strictEqual(navigator.previous(), 1);
      assert.strictEqual(navigator.current(), 1);
      assert.strictEqual(navigator.previous(), 12);
      assert.strictEqual(navigator.previous(), 11);
      assert.strictEqual(navigator.previous(), 10);
      assert.strictEqual(navigator.previous(), 0);
      assert.strictEqual(navigator.previous(), null);
      assert.strictEqual(navigator.next(), 0);
      assert.strictEqual(navigator.next(), 10);
      assert.strictEqual(navigator.first(), 0);
      assert.strictEqual(navigator.last(), 2);
    });
  });
  class Delegate {
    getHeight() {
      return 20;
    }
    getTemplateId() {
      return "default";
    }
  }
  class Renderer {
    constructor() {
      this.templateId = "default";
    }
    renderTemplate(container) {
      return container;
    }
    renderElement(element, index, templateData) {
      templateData.textContent = `${element.element}`;
    }
    disposeTemplate() {
    }
  }
  test("applies renderer row class names", function() {
    const container = document.createElement("div");
    container.style.width = "200px";
    container.style.height = "200px";
    const renderer = new class extends Renderer {
      constructor() {
        super(...arguments);
        this.rowClassName = "test-tree-row";
      }
    }();
    const tree = new ObjectTree("test", container, new Delegate(), [renderer]);
    try {
      tree.layout(200);
      tree.setChildren(null, [{ element: 0 }, { element: 1 }]);
      assert.strictEqual(container.querySelectorAll(".monaco-list-row.test-tree-row").length, 2);
    } finally {
      tree.dispose();
    }
  });
  class IdentityProvider {
    getId(element) {
      return `${element % 100}`;
    }
  }
  test("traits are preserved according to string identity", function() {
    const container = document.createElement("div");
    container.style.width = "200px";
    container.style.height = "200px";
    const delegate = new Delegate();
    const renderer = new Renderer();
    const identityProvider = new IdentityProvider();
    const tree = new ObjectTree("test", container, delegate, [renderer], { identityProvider });
    tree.layout(200);
    tree.setChildren(null, [{ element: 0 }, { element: 1 }, { element: 2 }, { element: 3 }]);
    tree.setFocus([1]);
    assert.deepStrictEqual(tree.getFocus(), [1]);
    tree.setChildren(null, [{ element: 100 }, { element: 101 }, { element: 102 }, { element: 103 }]);
    assert.deepStrictEqual(tree.getFocus(), [101]);
  });
  test("updateOptions preserves wrapped identity provider in view options", function() {
    const container = document.createElement("div");
    container.style.width = "200px";
    container.style.height = "200px";
    const delegate = new Delegate();
    const renderer = new Renderer();
    const identityProvider = {
      getId(element) {
        return `${element}`;
      },
      getGroupId(element) {
        return element % 2;
      }
    };
    const tree = new ObjectTree("test", container, delegate, [renderer], { identityProvider });
    try {
      tree.layout(200);
      tree.setChildren(null, [{ element: 0 }, { element: 1 }, { element: 2 }, { element: 3 }]);
      const firstRow = container.querySelector('.monaco-list-row[data-index="0"]');
      const secondRow = container.querySelector('.monaco-list-row[data-index="1"]');
      clickElement(firstRow);
      assert.deepStrictEqual(tree.getSelection(), [0]);
      tree.updateOptions({ indent: 12 });
      clickElement(secondRow, true);
      assert.deepStrictEqual(tree.getSelection(), [1]);
    } finally {
      tree.dispose();
    }
  });
  test("updateOptions preserves wrapped accessibility provider for type navigation re-announce", async function() {
    const container = document.createElement("div");
    container.style.width = "200px";
    container.style.height = "200px";
    const delegate = new Delegate();
    const renderer = new Renderer();
    const accessibilityProvider = {
      getAriaLabel(element) {
        assert.strictEqual(typeof element, "number");
        return `aria ${element}`;
      },
      getWidgetAriaLabel() {
        return "tree";
      }
    };
    const tree = new ObjectTree("test", container, delegate, [renderer], {
      accessibilityProvider,
      keyboardNavigationLabelProvider: {
        getKeyboardNavigationLabel: () => "a"
      }
    });
    try {
      await runWithFakedTimers({ useFakeTimers: true }, async () => {
        tree.layout(200);
        tree.setChildren(null, [{ element: 0 }]);
        tree.setFocus([0]);
        tree.domFocus();
        tree.updateOptions({ indent: 12 });
        dispatchKeydown(tree.getHTMLElement(), "a", "KeyA", 65);
        await Promise.resolve();
      });
    } finally {
      tree.dispose();
    }
  });
});
suite("CompressibleObjectTree", function() {
  class Delegate {
    getHeight() {
      return 20;
    }
    getTemplateId() {
      return "default";
    }
  }
  class Renderer {
    constructor() {
      this.templateId = "default";
    }
    renderTemplate(container) {
      return container;
    }
    renderElement(node, _, templateData) {
      templateData.textContent = `${node.element}`;
    }
    renderCompressedElements(node, _, templateData) {
      templateData.textContent = `${node.element.elements.join("/")}`;
    }
    disposeTemplate() {
    }
  }
  const ds = ensureNoDisposablesAreLeakedInTestSuite();
  test("empty", function() {
    const container = document.createElement("div");
    container.style.width = "200px";
    container.style.height = "200px";
    const tree = ds.add(new CompressibleObjectTree("test", container, new Delegate(), [new Renderer()]));
    tree.layout(200);
    assert.strictEqual(getRowsTextContent(container).length, 0);
  });
  test("simple", function() {
    const container = document.createElement("div");
    container.style.width = "200px";
    container.style.height = "200px";
    const tree = ds.add(new CompressibleObjectTree("test", container, new Delegate(), [new Renderer()]));
    tree.layout(200);
    tree.setChildren(null, [
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
    assert.deepStrictEqual(getRowsTextContent(container), ["0", "10", "11", "12", "1", "2"]);
  });
  test("compressed", () => {
    const container = document.createElement("div");
    container.style.width = "200px";
    container.style.height = "200px";
    const tree = ds.add(new CompressibleObjectTree("test", container, new Delegate(), [new Renderer()]));
    tree.layout(200);
    tree.setChildren(null, [
      {
        element: 1,
        children: [{
          element: 11,
          children: [{
            element: 111,
            children: [
              { element: 1111 },
              { element: 1112 },
              { element: 1113 }
            ]
          }]
        }]
      }
    ]);
    assert.deepStrictEqual(getRowsTextContent(container), ["1/11/111", "1111", "1112", "1113"]);
    tree.setChildren(11, [
      { element: 111 },
      { element: 112 },
      { element: 113 }
    ]);
    assert.deepStrictEqual(getRowsTextContent(container), ["1/11", "111", "112", "113"]);
    tree.setChildren(113, [
      { element: 1131 }
    ]);
    assert.deepStrictEqual(getRowsTextContent(container), ["1/11", "111", "112", "113/1131"]);
    tree.setChildren(1131, [
      { element: 1132 }
    ]);
    assert.deepStrictEqual(getRowsTextContent(container), ["1/11", "111", "112", "113/1131/1132"]);
    tree.setChildren(1131, [
      { element: 1132 },
      { element: 1133 }
    ]);
    assert.deepStrictEqual(getRowsTextContent(container), ["1/11", "111", "112", "113/1131", "1132", "1133"]);
  });
  test("enableCompression", () => {
    const container = document.createElement("div");
    container.style.width = "200px";
    container.style.height = "200px";
    const tree = ds.add(new CompressibleObjectTree("test", container, new Delegate(), [new Renderer()]));
    tree.layout(200);
    tree.setChildren(null, [
      {
        element: 1,
        children: [{
          element: 11,
          children: [{
            element: 111,
            children: [
              { element: 1111 },
              { element: 1112 },
              { element: 1113 }
            ]
          }]
        }]
      }
    ]);
    assert.deepStrictEqual(getRowsTextContent(container), ["1/11/111", "1111", "1112", "1113"]);
    tree.updateOptions({ compressionEnabled: false });
    assert.deepStrictEqual(getRowsTextContent(container), ["1", "11", "111", "1111", "1112", "1113"]);
    tree.updateOptions({ compressionEnabled: true });
    assert.deepStrictEqual(getRowsTextContent(container), ["1/11/111", "1111", "1112", "1113"]);
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxiYXNlXFx0ZXN0XFxicm93c2VyXFx1aVxcdHJlZVxcb2JqZWN0VHJlZS50ZXN0LnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IGFzc2VydCBmcm9tICdhc3NlcnQnO1xuaW1wb3J0IHsgSUlkZW50aXR5UHJvdmlkZXIsIElMaXN0VmlydHVhbERlbGVnYXRlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYnJvd3Nlci91aS9saXN0L2xpc3QuanMnO1xuaW1wb3J0IHsgSUNvbXByZXNzZWRUcmVlTm9kZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jyb3dzZXIvdWkvdHJlZS9jb21wcmVzc2VkT2JqZWN0VHJlZU1vZGVsLmpzJztcbmltcG9ydCB7IENvbXByZXNzaWJsZU9iamVjdFRyZWUsIElDb21wcmVzc2libGVUcmVlUmVuZGVyZXIsIE9iamVjdFRyZWUgfSBmcm9tICcuLi8uLi8uLi8uLi9icm93c2VyL3VpL3RyZWUvb2JqZWN0VHJlZS5qcyc7XG5pbXBvcnQgeyBJVHJlZU5vZGUsIElUcmVlUmVuZGVyZXIgfSBmcm9tICcuLi8uLi8uLi8uLi9icm93c2VyL3VpL3RyZWUvdHJlZS5qcyc7XG5pbXBvcnQgeyBydW5XaXRoRmFrZWRUaW1lcnMgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vdGltZVRyYXZlbFNjaGVkdWxlci5qcyc7XG5pbXBvcnQgeyBlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vdXRpbHMuanMnO1xuXG5mdW5jdGlvbiBnZXRSb3dzVGV4dENvbnRlbnQoY29udGFpbmVyOiBIVE1MRWxlbWVudCk6IHN0cmluZ1tdIHtcblx0Y29uc3Qgcm93cyA9IFsuLi5jb250YWluZXIucXVlcnlTZWxlY3RvckFsbCgnLm1vbmFjby1saXN0LXJvdycpXTtcblx0cm93cy5zb3J0KChhLCBiKSA9PiBwYXJzZUludChhLmdldEF0dHJpYnV0ZSgnZGF0YS1pbmRleCcpISkgLSBwYXJzZUludChiLmdldEF0dHJpYnV0ZSgnZGF0YS1pbmRleCcpISkpO1xuXHRyZXR1cm4gcm93cy5tYXAocm93ID0+IHJvdy5xdWVyeVNlbGVjdG9yKCcubW9uYWNvLXRsLWNvbnRlbnRzJykhLnRleHRDb250ZW50ISk7XG59XG5cbmZ1bmN0aW9uIGNsaWNrRWxlbWVudChlbGVtZW50OiBIVE1MRWxlbWVudCwgY3RybEtleSA9IGZhbHNlKTogdm9pZCB7XG5cdGVsZW1lbnQuZGlzcGF0Y2hFdmVudChuZXcgTW91c2VFdmVudCgnbW91c2Vkb3duJywgeyBidWJibGVzOiB0cnVlLCBjdHJsS2V5LCBidXR0b246IDAgfSkpO1xuXHRlbGVtZW50LmRpc3BhdGNoRXZlbnQobmV3IE1vdXNlRXZlbnQoJ2NsaWNrJywgeyBidWJibGVzOiB0cnVlLCBjdHJsS2V5LCBidXR0b246IDAgfSkpO1xufVxuXG5mdW5jdGlvbiBkaXNwYXRjaEtleWRvd24oZWxlbWVudDogSFRNTEVsZW1lbnQsIGtleTogc3RyaW5nLCBjb2RlOiBzdHJpbmcsIGtleUNvZGU6IG51bWJlcik6IHZvaWQge1xuXHRjb25zdCBrZXlib2FyZEV2ZW50ID0gbmV3IEtleWJvYXJkRXZlbnQoJ2tleWRvd24nLCB7IGJ1YmJsZXM6IHRydWUsIGtleSwgY29kZSB9KTtcblx0T2JqZWN0LmRlZmluZVByb3BlcnR5KGtleWJvYXJkRXZlbnQsICdrZXlDb2RlJywgeyBnZXQ6ICgpID0+IGtleUNvZGUgfSk7XG5cdGVsZW1lbnQuZGlzcGF0Y2hFdmVudChrZXlib2FyZEV2ZW50KTtcbn1cblxuc3VpdGUoJ09iamVjdFRyZWUnLCBmdW5jdGlvbiAoKSB7XG5cblx0c3VpdGUoJ1RyZWVOYXZpZ2F0b3InLCBmdW5jdGlvbiAoKSB7XG5cdFx0bGV0IHRyZWU6IE9iamVjdFRyZWU8bnVtYmVyPjtcblx0XHRsZXQgZmlsdGVyID0gKF86IG51bWJlcikgPT4gdHJ1ZTtcblxuXHRcdHRlYXJkb3duKCgpID0+IHtcblx0XHRcdHRyZWUuZGlzcG9zZSgpO1xuXHRcdFx0ZmlsdGVyID0gKF86IG51bWJlcikgPT4gdHJ1ZTtcblx0XHR9KTtcblxuXHRcdGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSgpO1xuXG5cdFx0c2V0dXAoKCkgPT4ge1xuXHRcdFx0Y29uc3QgY29udGFpbmVyID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnZGl2Jyk7XG5cdFx0XHRjb250YWluZXIuc3R5bGUud2lkdGggPSAnMjAwcHgnO1xuXHRcdFx0Y29udGFpbmVyLnN0eWxlLmhlaWdodCA9ICcyMDBweCc7XG5cblx0XHRcdGNvbnN0IGRlbGVnYXRlID0gbmV3IGNsYXNzIGltcGxlbWVudHMgSUxpc3RWaXJ0dWFsRGVsZWdhdGU8bnVtYmVyPiB7XG5cdFx0XHRcdGdldEhlaWdodCgpIHsgcmV0dXJuIDIwOyB9XG5cdFx0XHRcdGdldFRlbXBsYXRlSWQoKTogc3RyaW5nIHsgcmV0dXJuICdkZWZhdWx0JzsgfVxuXHRcdFx0fTtcblxuXHRcdFx0Y29uc3QgcmVuZGVyZXIgPSBuZXcgY2xhc3MgaW1wbGVtZW50cyBJVHJlZVJlbmRlcmVyPG51bWJlciwgdm9pZCwgSFRNTEVsZW1lbnQ+IHtcblx0XHRcdFx0cmVhZG9ubHkgdGVtcGxhdGVJZCA9ICdkZWZhdWx0Jztcblx0XHRcdFx0cmVuZGVyVGVtcGxhdGUoY29udGFpbmVyOiBIVE1MRWxlbWVudCk6IEhUTUxFbGVtZW50IHtcblx0XHRcdFx0XHRyZXR1cm4gY29udGFpbmVyO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHJlbmRlckVsZW1lbnQoZWxlbWVudDogSVRyZWVOb2RlPG51bWJlciwgdm9pZD4sIGluZGV4OiBudW1iZXIsIHRlbXBsYXRlRGF0YTogSFRNTEVsZW1lbnQpOiB2b2lkIHtcblx0XHRcdFx0XHR0ZW1wbGF0ZURhdGEudGV4dENvbnRlbnQgPSBgJHtlbGVtZW50LmVsZW1lbnR9YDtcblx0XHRcdFx0fVxuXHRcdFx0XHRkaXNwb3NlVGVtcGxhdGUoKTogdm9pZCB7IH1cblx0XHRcdH07XG5cblx0XHRcdHRyZWUgPSBuZXcgT2JqZWN0VHJlZTxudW1iZXI+KCd0ZXN0JywgY29udGFpbmVyLCBkZWxlZ2F0ZSwgW3JlbmRlcmVyXSwgeyBmaWx0ZXI6IHsgZmlsdGVyOiAoZWwpID0+IGZpbHRlcihlbCkgfSB9KTtcblx0XHRcdHRyZWUubGF5b3V0KDIwMCk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdzaG91bGQgYmUgYWJsZSB0byBuYXZpZ2F0ZScsICgpID0+IHtcblx0XHRcdHRyZWUuc2V0Q2hpbGRyZW4obnVsbCwgW1xuXHRcdFx0XHR7XG5cdFx0XHRcdFx0ZWxlbWVudDogMCwgY2hpbGRyZW46IFtcblx0XHRcdFx0XHRcdHsgZWxlbWVudDogMTAgfSxcblx0XHRcdFx0XHRcdHsgZWxlbWVudDogMTEgfSxcblx0XHRcdFx0XHRcdHsgZWxlbWVudDogMTIgfSxcblx0XHRcdFx0XHRdXG5cdFx0XHRcdH0sXG5cdFx0XHRcdHsgZWxlbWVudDogMSB9LFxuXHRcdFx0XHR7IGVsZW1lbnQ6IDIgfVxuXHRcdFx0XSk7XG5cblx0XHRcdGNvbnN0IG5hdmlnYXRvciA9IHRyZWUubmF2aWdhdGUoKTtcblxuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG5hdmlnYXRvci5jdXJyZW50KCksIG51bGwpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG5hdmlnYXRvci5uZXh0KCksIDApO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG5hdmlnYXRvci5jdXJyZW50KCksIDApO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG5hdmlnYXRvci5uZXh0KCksIDEwKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChuYXZpZ2F0b3IuY3VycmVudCgpLCAxMCk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobmF2aWdhdG9yLm5leHQoKSwgMTEpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG5hdmlnYXRvci5jdXJyZW50KCksIDExKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChuYXZpZ2F0b3IubmV4dCgpLCAxMik7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobmF2aWdhdG9yLmN1cnJlbnQoKSwgMTIpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG5hdmlnYXRvci5uZXh0KCksIDEpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG5hdmlnYXRvci5jdXJyZW50KCksIDEpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG5hdmlnYXRvci5uZXh0KCksIDIpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG5hdmlnYXRvci5jdXJyZW50KCksIDIpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG5hdmlnYXRvci5wcmV2aW91cygpLCAxKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChuYXZpZ2F0b3IuY3VycmVudCgpLCAxKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChuYXZpZ2F0b3IucHJldmlvdXMoKSwgMTIpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG5hdmlnYXRvci5wcmV2aW91cygpLCAxMSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobmF2aWdhdG9yLnByZXZpb3VzKCksIDEwKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChuYXZpZ2F0b3IucHJldmlvdXMoKSwgMCk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobmF2aWdhdG9yLnByZXZpb3VzKCksIG51bGwpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG5hdmlnYXRvci5uZXh0KCksIDApO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG5hdmlnYXRvci5uZXh0KCksIDEwKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChuYXZpZ2F0b3IuZmlyc3QoKSwgMCk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobmF2aWdhdG9yLmxhc3QoKSwgMik7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdzaG91bGQgc2tpcCBjb2xsYXBzZWQgbm9kZXMnLCAoKSA9PiB7XG5cdFx0XHR0cmVlLnNldENoaWxkcmVuKG51bGwsIFtcblx0XHRcdFx0e1xuXHRcdFx0XHRcdGVsZW1lbnQ6IDAsIGNvbGxhcHNlZDogdHJ1ZSwgY2hpbGRyZW46IFtcblx0XHRcdFx0XHRcdHsgZWxlbWVudDogMTAgfSxcblx0XHRcdFx0XHRcdHsgZWxlbWVudDogMTEgfSxcblx0XHRcdFx0XHRcdHsgZWxlbWVudDogMTIgfSxcblx0XHRcdFx0XHRdXG5cdFx0XHRcdH0sXG5cdFx0XHRcdHsgZWxlbWVudDogMSB9LFxuXHRcdFx0XHR7IGVsZW1lbnQ6IDIgfVxuXHRcdFx0XSk7XG5cblx0XHRcdGNvbnN0IG5hdmlnYXRvciA9IHRyZWUubmF2aWdhdGUoKTtcblxuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG5hdmlnYXRvci5jdXJyZW50KCksIG51bGwpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG5hdmlnYXRvci5uZXh0KCksIDApO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG5hdmlnYXRvci5uZXh0KCksIDEpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG5hdmlnYXRvci5uZXh0KCksIDIpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG5hdmlnYXRvci5uZXh0KCksIG51bGwpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG5hdmlnYXRvci5wcmV2aW91cygpLCAyKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChuYXZpZ2F0b3IucHJldmlvdXMoKSwgMSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobmF2aWdhdG9yLnByZXZpb3VzKCksIDApO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG5hdmlnYXRvci5wcmV2aW91cygpLCBudWxsKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChuYXZpZ2F0b3IubmV4dCgpLCAwKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChuYXZpZ2F0b3IuZmlyc3QoKSwgMCk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobmF2aWdhdG9yLmxhc3QoKSwgMik7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdzaG91bGQgc2tpcCBmaWx0ZXJlZCBlbGVtZW50cycsICgpID0+IHtcblx0XHRcdGZpbHRlciA9IGVsID0+IGVsICUgMiA9PT0gMDtcblxuXHRcdFx0dHJlZS5zZXRDaGlsZHJlbihudWxsLCBbXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRlbGVtZW50OiAwLCBjaGlsZHJlbjogW1xuXHRcdFx0XHRcdFx0eyBlbGVtZW50OiAxMCB9LFxuXHRcdFx0XHRcdFx0eyBlbGVtZW50OiAxMSB9LFxuXHRcdFx0XHRcdFx0eyBlbGVtZW50OiAxMiB9LFxuXHRcdFx0XHRcdF1cblx0XHRcdFx0fSxcblx0XHRcdFx0eyBlbGVtZW50OiAxIH0sXG5cdFx0XHRcdHsgZWxlbWVudDogMiB9XG5cdFx0XHRdKTtcblxuXHRcdFx0Y29uc3QgbmF2aWdhdG9yID0gdHJlZS5uYXZpZ2F0ZSgpO1xuXG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobmF2aWdhdG9yLmN1cnJlbnQoKSwgbnVsbCk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobmF2aWdhdG9yLm5leHQoKSwgMCk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobmF2aWdhdG9yLm5leHQoKSwgMTApO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG5hdmlnYXRvci5uZXh0KCksIDEyKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChuYXZpZ2F0b3IubmV4dCgpLCAyKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChuYXZpZ2F0b3IubmV4dCgpLCBudWxsKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChuYXZpZ2F0b3IucHJldmlvdXMoKSwgMik7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobmF2aWdhdG9yLnByZXZpb3VzKCksIDEyKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChuYXZpZ2F0b3IucHJldmlvdXMoKSwgMTApO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG5hdmlnYXRvci5wcmV2aW91cygpLCAwKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChuYXZpZ2F0b3IucHJldmlvdXMoKSwgbnVsbCk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobmF2aWdhdG9yLm5leHQoKSwgMCk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobmF2aWdhdG9yLm5leHQoKSwgMTApO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG5hdmlnYXRvci5maXJzdCgpLCAwKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChuYXZpZ2F0b3IubGFzdCgpLCAyKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3Nob3VsZCBiZSBhYmxlIHRvIHN0YXJ0IGZyb20gbm9kZScsICgpID0+IHtcblx0XHRcdHRyZWUuc2V0Q2hpbGRyZW4obnVsbCwgW1xuXHRcdFx0XHR7XG5cdFx0XHRcdFx0ZWxlbWVudDogMCwgY2hpbGRyZW46IFtcblx0XHRcdFx0XHRcdHsgZWxlbWVudDogMTAgfSxcblx0XHRcdFx0XHRcdHsgZWxlbWVudDogMTEgfSxcblx0XHRcdFx0XHRcdHsgZWxlbWVudDogMTIgfSxcblx0XHRcdFx0XHRdXG5cdFx0XHRcdH0sXG5cdFx0XHRcdHsgZWxlbWVudDogMSB9LFxuXHRcdFx0XHR7IGVsZW1lbnQ6IDIgfVxuXHRcdFx0XSk7XG5cblx0XHRcdGNvbnN0IG5hdmlnYXRvciA9IHRyZWUubmF2aWdhdGUoMSk7XG5cblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChuYXZpZ2F0b3IuY3VycmVudCgpLCAxKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChuYXZpZ2F0b3IubmV4dCgpLCAyKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChuYXZpZ2F0b3IuY3VycmVudCgpLCAyKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChuYXZpZ2F0b3IucHJldmlvdXMoKSwgMSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobmF2aWdhdG9yLmN1cnJlbnQoKSwgMSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobmF2aWdhdG9yLnByZXZpb3VzKCksIDEyKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChuYXZpZ2F0b3IucHJldmlvdXMoKSwgMTEpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG5hdmlnYXRvci5wcmV2aW91cygpLCAxMCk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobmF2aWdhdG9yLnByZXZpb3VzKCksIDApO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG5hdmlnYXRvci5wcmV2aW91cygpLCBudWxsKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChuYXZpZ2F0b3IubmV4dCgpLCAwKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChuYXZpZ2F0b3IubmV4dCgpLCAxMCk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobmF2aWdhdG9yLmZpcnN0KCksIDApO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG5hdmlnYXRvci5sYXN0KCksIDIpO1xuXHRcdH0pO1xuXHR9KTtcblxuXHRjbGFzcyBEZWxlZ2F0ZSBpbXBsZW1lbnRzIElMaXN0VmlydHVhbERlbGVnYXRlPG51bWJlcj4ge1xuXHRcdGdldEhlaWdodCgpIHsgcmV0dXJuIDIwOyB9XG5cdFx0Z2V0VGVtcGxhdGVJZCgpOiBzdHJpbmcgeyByZXR1cm4gJ2RlZmF1bHQnOyB9XG5cdH1cblxuXHRjbGFzcyBSZW5kZXJlciBpbXBsZW1lbnRzIElUcmVlUmVuZGVyZXI8bnVtYmVyLCB2b2lkLCBIVE1MRWxlbWVudD4ge1xuXHRcdHJlYWRvbmx5IHRlbXBsYXRlSWQgPSAnZGVmYXVsdCc7XG5cdFx0cmVuZGVyVGVtcGxhdGUoY29udGFpbmVyOiBIVE1MRWxlbWVudCk6IEhUTUxFbGVtZW50IHtcblx0XHRcdHJldHVybiBjb250YWluZXI7XG5cdFx0fVxuXHRcdHJlbmRlckVsZW1lbnQoZWxlbWVudDogSVRyZWVOb2RlPG51bWJlciwgdm9pZD4sIGluZGV4OiBudW1iZXIsIHRlbXBsYXRlRGF0YTogSFRNTEVsZW1lbnQpOiB2b2lkIHtcblx0XHRcdHRlbXBsYXRlRGF0YS50ZXh0Q29udGVudCA9IGAke2VsZW1lbnQuZWxlbWVudH1gO1xuXHRcdH1cblx0XHRkaXNwb3NlVGVtcGxhdGUoKTogdm9pZCB7IH1cblx0fVxuXG5cdHRlc3QoJ2FwcGxpZXMgcmVuZGVyZXIgcm93IGNsYXNzIG5hbWVzJywgZnVuY3Rpb24gKCkge1xuXHRcdGNvbnN0IGNvbnRhaW5lciA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2RpdicpO1xuXHRcdGNvbnRhaW5lci5zdHlsZS53aWR0aCA9ICcyMDBweCc7XG5cdFx0Y29udGFpbmVyLnN0eWxlLmhlaWdodCA9ICcyMDBweCc7XG5cblx0XHRjb25zdCByZW5kZXJlciA9IG5ldyBjbGFzcyBleHRlbmRzIFJlbmRlcmVyIHtcblx0XHRcdHJlYWRvbmx5IHJvd0NsYXNzTmFtZSA9ICd0ZXN0LXRyZWUtcm93Jztcblx0XHR9O1xuXHRcdGNvbnN0IHRyZWUgPSBuZXcgT2JqZWN0VHJlZTxudW1iZXI+KCd0ZXN0JywgY29udGFpbmVyLCBuZXcgRGVsZWdhdGUoKSwgW3JlbmRlcmVyXSk7XG5cdFx0dHJ5IHtcblx0XHRcdHRyZWUubGF5b3V0KDIwMCk7XG5cdFx0XHR0cmVlLnNldENoaWxkcmVuKG51bGwsIFt7IGVsZW1lbnQ6IDAgfSwgeyBlbGVtZW50OiAxIH1dKTtcblxuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNvbnRhaW5lci5xdWVyeVNlbGVjdG9yQWxsKCcubW9uYWNvLWxpc3Qtcm93LnRlc3QtdHJlZS1yb3cnKS5sZW5ndGgsIDIpO1xuXHRcdH0gZmluYWxseSB7XG5cdFx0XHR0cmVlLmRpc3Bvc2UoKTtcblx0XHR9XG5cdH0pO1xuXG5cdGNsYXNzIElkZW50aXR5UHJvdmlkZXIgaW1wbGVtZW50cyBJSWRlbnRpdHlQcm92aWRlcjxudW1iZXI+IHtcblx0XHRnZXRJZChlbGVtZW50OiBudW1iZXIpOiB7IHRvU3RyaW5nKCk6IHN0cmluZyB9IHtcblx0XHRcdHJldHVybiBgJHtlbGVtZW50ICUgMTAwfWA7XG5cdFx0fVxuXHR9XG5cblx0dGVzdCgndHJhaXRzIGFyZSBwcmVzZXJ2ZWQgYWNjb3JkaW5nIHRvIHN0cmluZyBpZGVudGl0eScsIGZ1bmN0aW9uICgpIHtcblx0XHRjb25zdCBjb250YWluZXIgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdkaXYnKTtcblx0XHRjb250YWluZXIuc3R5bGUud2lkdGggPSAnMjAwcHgnO1xuXHRcdGNvbnRhaW5lci5zdHlsZS5oZWlnaHQgPSAnMjAwcHgnO1xuXG5cdFx0Y29uc3QgZGVsZWdhdGUgPSBuZXcgRGVsZWdhdGUoKTtcblx0XHRjb25zdCByZW5kZXJlciA9IG5ldyBSZW5kZXJlcigpO1xuXHRcdGNvbnN0IGlkZW50aXR5UHJvdmlkZXIgPSBuZXcgSWRlbnRpdHlQcm92aWRlcigpO1xuXG5cdFx0Y29uc3QgdHJlZSA9IG5ldyBPYmplY3RUcmVlPG51bWJlcj4oJ3Rlc3QnLCBjb250YWluZXIsIGRlbGVnYXRlLCBbcmVuZGVyZXJdLCB7IGlkZW50aXR5UHJvdmlkZXIgfSk7XG5cdFx0dHJlZS5sYXlvdXQoMjAwKTtcblxuXHRcdHRyZWUuc2V0Q2hpbGRyZW4obnVsbCwgW3sgZWxlbWVudDogMCB9LCB7IGVsZW1lbnQ6IDEgfSwgeyBlbGVtZW50OiAyIH0sIHsgZWxlbWVudDogMyB9XSk7XG5cdFx0dHJlZS5zZXRGb2N1cyhbMV0pO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwodHJlZS5nZXRGb2N1cygpLCBbMV0pO1xuXG5cdFx0dHJlZS5zZXRDaGlsZHJlbihudWxsLCBbeyBlbGVtZW50OiAxMDAgfSwgeyBlbGVtZW50OiAxMDEgfSwgeyBlbGVtZW50OiAxMDIgfSwgeyBlbGVtZW50OiAxMDMgfV0pO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwodHJlZS5nZXRGb2N1cygpLCBbMTAxXSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3VwZGF0ZU9wdGlvbnMgcHJlc2VydmVzIHdyYXBwZWQgaWRlbnRpdHkgcHJvdmlkZXIgaW4gdmlldyBvcHRpb25zJywgZnVuY3Rpb24gKCkge1xuXHRcdGNvbnN0IGNvbnRhaW5lciA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2RpdicpO1xuXHRcdGNvbnRhaW5lci5zdHlsZS53aWR0aCA9ICcyMDBweCc7XG5cdFx0Y29udGFpbmVyLnN0eWxlLmhlaWdodCA9ICcyMDBweCc7XG5cblx0XHRjb25zdCBkZWxlZ2F0ZSA9IG5ldyBEZWxlZ2F0ZSgpO1xuXHRcdGNvbnN0IHJlbmRlcmVyID0gbmV3IFJlbmRlcmVyKCk7XG5cdFx0Y29uc3QgaWRlbnRpdHlQcm92aWRlciA9IHtcblx0XHRcdGdldElkKGVsZW1lbnQ6IG51bWJlcik6IHsgdG9TdHJpbmcoKTogc3RyaW5nIH0ge1xuXHRcdFx0XHRyZXR1cm4gYCR7ZWxlbWVudH1gO1xuXHRcdFx0fSxcblx0XHRcdGdldEdyb3VwSWQoZWxlbWVudDogbnVtYmVyKTogbnVtYmVyIHtcblx0XHRcdFx0cmV0dXJuIGVsZW1lbnQgJSAyO1xuXHRcdFx0fVxuXHRcdH07XG5cblx0XHRjb25zdCB0cmVlID0gbmV3IE9iamVjdFRyZWU8bnVtYmVyPigndGVzdCcsIGNvbnRhaW5lciwgZGVsZWdhdGUsIFtyZW5kZXJlcl0sIHsgaWRlbnRpdHlQcm92aWRlciB9KTtcblxuXHRcdHRyeSB7XG5cdFx0XHR0cmVlLmxheW91dCgyMDApO1xuXHRcdFx0dHJlZS5zZXRDaGlsZHJlbihudWxsLCBbeyBlbGVtZW50OiAwIH0sIHsgZWxlbWVudDogMSB9LCB7IGVsZW1lbnQ6IDIgfSwgeyBlbGVtZW50OiAzIH1dKTtcblxuXHRcdFx0Y29uc3QgZmlyc3RSb3cgPSBjb250YWluZXIucXVlcnlTZWxlY3RvcignLm1vbmFjby1saXN0LXJvd1tkYXRhLWluZGV4PVwiMFwiXScpIGFzIEhUTUxFbGVtZW50O1xuXHRcdFx0Y29uc3Qgc2Vjb25kUm93ID0gY29udGFpbmVyLnF1ZXJ5U2VsZWN0b3IoJy5tb25hY28tbGlzdC1yb3dbZGF0YS1pbmRleD1cIjFcIl0nKSBhcyBIVE1MRWxlbWVudDtcblx0XHRcdGNsaWNrRWxlbWVudChmaXJzdFJvdyk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHRyZWUuZ2V0U2VsZWN0aW9uKCksIFswXSk7XG5cblx0XHRcdHRyZWUudXBkYXRlT3B0aW9ucyh7IGluZGVudDogMTIgfSk7XG5cblx0XHRcdGNsaWNrRWxlbWVudChzZWNvbmRSb3csIHRydWUpO1xuXG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHRyZWUuZ2V0U2VsZWN0aW9uKCksIFsxXSk7XG5cdFx0fSBmaW5hbGx5IHtcblx0XHRcdHRyZWUuZGlzcG9zZSgpO1xuXHRcdH1cblx0fSk7XG5cblx0dGVzdCgndXBkYXRlT3B0aW9ucyBwcmVzZXJ2ZXMgd3JhcHBlZCBhY2Nlc3NpYmlsaXR5IHByb3ZpZGVyIGZvciB0eXBlIG5hdmlnYXRpb24gcmUtYW5ub3VuY2UnLCBhc3luYyBmdW5jdGlvbiAoKSB7XG5cdFx0Y29uc3QgY29udGFpbmVyID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnZGl2Jyk7XG5cdFx0Y29udGFpbmVyLnN0eWxlLndpZHRoID0gJzIwMHB4Jztcblx0XHRjb250YWluZXIuc3R5bGUuaGVpZ2h0ID0gJzIwMHB4JztcblxuXHRcdGNvbnN0IGRlbGVnYXRlID0gbmV3IERlbGVnYXRlKCk7XG5cdFx0Y29uc3QgcmVuZGVyZXIgPSBuZXcgUmVuZGVyZXIoKTtcblx0XHRjb25zdCBhY2Nlc3NpYmlsaXR5UHJvdmlkZXIgPSB7XG5cdFx0XHRnZXRBcmlhTGFiZWwoZWxlbWVudDogbnVtYmVyKTogc3RyaW5nIHtcblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHR5cGVvZiBlbGVtZW50LCAnbnVtYmVyJyk7XG5cdFx0XHRcdHJldHVybiBgYXJpYSAke2VsZW1lbnR9YDtcblx0XHRcdH0sXG5cdFx0XHRnZXRXaWRnZXRBcmlhTGFiZWwoKTogc3RyaW5nIHtcblx0XHRcdFx0cmV0dXJuICd0cmVlJztcblx0XHRcdH1cblx0XHR9O1xuXG5cdFx0Y29uc3QgdHJlZSA9IG5ldyBPYmplY3RUcmVlPG51bWJlcj4oJ3Rlc3QnLCBjb250YWluZXIsIGRlbGVnYXRlLCBbcmVuZGVyZXJdLCB7XG5cdFx0XHRhY2Nlc3NpYmlsaXR5UHJvdmlkZXIsXG5cdFx0XHRrZXlib2FyZE5hdmlnYXRpb25MYWJlbFByb3ZpZGVyOiB7XG5cdFx0XHRcdGdldEtleWJvYXJkTmF2aWdhdGlvbkxhYmVsOiAoKSA9PiAnYSdcblx0XHRcdH1cblx0XHR9KTtcblxuXHRcdHRyeSB7XG5cdFx0XHRhd2FpdCBydW5XaXRoRmFrZWRUaW1lcnMoeyB1c2VGYWtlVGltZXJzOiB0cnVlIH0sIGFzeW5jICgpID0+IHtcblx0XHRcdFx0dHJlZS5sYXlvdXQoMjAwKTtcblx0XHRcdFx0dHJlZS5zZXRDaGlsZHJlbihudWxsLCBbeyBlbGVtZW50OiAwIH1dKTtcblx0XHRcdFx0dHJlZS5zZXRGb2N1cyhbMF0pO1xuXHRcdFx0XHR0cmVlLmRvbUZvY3VzKCk7XG5cblx0XHRcdFx0dHJlZS51cGRhdGVPcHRpb25zKHsgaW5kZW50OiAxMiB9KTtcblxuXHRcdFx0XHRkaXNwYXRjaEtleWRvd24odHJlZS5nZXRIVE1MRWxlbWVudCgpLCAnYScsICdLZXlBJywgNjUpO1xuXHRcdFx0XHRhd2FpdCBQcm9taXNlLnJlc29sdmUoKTtcblx0XHRcdH0pO1xuXHRcdH0gZmluYWxseSB7XG5cdFx0XHR0cmVlLmRpc3Bvc2UoKTtcblx0XHR9XG5cdH0pO1xufSk7XG5cbnN1aXRlKCdDb21wcmVzc2libGVPYmplY3RUcmVlJywgZnVuY3Rpb24gKCkge1xuXG5cdGNsYXNzIERlbGVnYXRlIGltcGxlbWVudHMgSUxpc3RWaXJ0dWFsRGVsZWdhdGU8bnVtYmVyPiB7XG5cdFx0Z2V0SGVpZ2h0KCkgeyByZXR1cm4gMjA7IH1cblx0XHRnZXRUZW1wbGF0ZUlkKCk6IHN0cmluZyB7IHJldHVybiAnZGVmYXVsdCc7IH1cblx0fVxuXG5cdGNsYXNzIFJlbmRlcmVyIGltcGxlbWVudHMgSUNvbXByZXNzaWJsZVRyZWVSZW5kZXJlcjxudW1iZXIsIHZvaWQsIEhUTUxFbGVtZW50PiB7XG5cdFx0cmVhZG9ubHkgdGVtcGxhdGVJZCA9ICdkZWZhdWx0Jztcblx0XHRyZW5kZXJUZW1wbGF0ZShjb250YWluZXI6IEhUTUxFbGVtZW50KTogSFRNTEVsZW1lbnQge1xuXHRcdFx0cmV0dXJuIGNvbnRhaW5lcjtcblx0XHR9XG5cdFx0cmVuZGVyRWxlbWVudChub2RlOiBJVHJlZU5vZGU8bnVtYmVyLCB2b2lkPiwgXzogbnVtYmVyLCB0ZW1wbGF0ZURhdGE6IEhUTUxFbGVtZW50KTogdm9pZCB7XG5cdFx0XHR0ZW1wbGF0ZURhdGEudGV4dENvbnRlbnQgPSBgJHtub2RlLmVsZW1lbnR9YDtcblx0XHR9XG5cdFx0cmVuZGVyQ29tcHJlc3NlZEVsZW1lbnRzKG5vZGU6IElUcmVlTm9kZTxJQ29tcHJlc3NlZFRyZWVOb2RlPG51bWJlcj4sIHZvaWQ+LCBfOiBudW1iZXIsIHRlbXBsYXRlRGF0YTogSFRNTEVsZW1lbnQpOiB2b2lkIHtcblx0XHRcdHRlbXBsYXRlRGF0YS50ZXh0Q29udGVudCA9IGAke25vZGUuZWxlbWVudC5lbGVtZW50cy5qb2luKCcvJyl9YDtcblx0XHR9XG5cdFx0ZGlzcG9zZVRlbXBsYXRlKCk6IHZvaWQgeyB9XG5cdH1cblxuXHRjb25zdCBkcyA9IGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSgpO1xuXG5cdHRlc3QoJ2VtcHR5JywgZnVuY3Rpb24gKCkge1xuXHRcdGNvbnN0IGNvbnRhaW5lciA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2RpdicpO1xuXHRcdGNvbnRhaW5lci5zdHlsZS53aWR0aCA9ICcyMDBweCc7XG5cdFx0Y29udGFpbmVyLnN0eWxlLmhlaWdodCA9ICcyMDBweCc7XG5cblx0XHRjb25zdCB0cmVlID0gZHMuYWRkKG5ldyBDb21wcmVzc2libGVPYmplY3RUcmVlPG51bWJlcj4oJ3Rlc3QnLCBjb250YWluZXIsIG5ldyBEZWxlZ2F0ZSgpLCBbbmV3IFJlbmRlcmVyKCldKSk7XG5cdFx0dHJlZS5sYXlvdXQoMjAwKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChnZXRSb3dzVGV4dENvbnRlbnQoY29udGFpbmVyKS5sZW5ndGgsIDApO1xuXHR9KTtcblxuXHR0ZXN0KCdzaW1wbGUnLCBmdW5jdGlvbiAoKSB7XG5cdFx0Y29uc3QgY29udGFpbmVyID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnZGl2Jyk7XG5cdFx0Y29udGFpbmVyLnN0eWxlLndpZHRoID0gJzIwMHB4Jztcblx0XHRjb250YWluZXIuc3R5bGUuaGVpZ2h0ID0gJzIwMHB4JztcblxuXHRcdGNvbnN0IHRyZWUgPSBkcy5hZGQobmV3IENvbXByZXNzaWJsZU9iamVjdFRyZWU8bnVtYmVyPigndGVzdCcsIGNvbnRhaW5lciwgbmV3IERlbGVnYXRlKCksIFtuZXcgUmVuZGVyZXIoKV0pKTtcblx0XHR0cmVlLmxheW91dCgyMDApO1xuXG5cdFx0dHJlZS5zZXRDaGlsZHJlbihudWxsLCBbXG5cdFx0XHR7XG5cdFx0XHRcdGVsZW1lbnQ6IDAsIGNoaWxkcmVuOiBbXG5cdFx0XHRcdFx0eyBlbGVtZW50OiAxMCB9LFxuXHRcdFx0XHRcdHsgZWxlbWVudDogMTEgfSxcblx0XHRcdFx0XHR7IGVsZW1lbnQ6IDEyIH0sXG5cdFx0XHRcdF1cblx0XHRcdH0sXG5cdFx0XHR7IGVsZW1lbnQ6IDEgfSxcblx0XHRcdHsgZWxlbWVudDogMiB9XG5cdFx0XSk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGdldFJvd3NUZXh0Q29udGVudChjb250YWluZXIpLCBbJzAnLCAnMTAnLCAnMTEnLCAnMTInLCAnMScsICcyJ10pO1xuXHR9KTtcblxuXHR0ZXN0KCdjb21wcmVzc2VkJywgKCkgPT4ge1xuXHRcdGNvbnN0IGNvbnRhaW5lciA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2RpdicpO1xuXHRcdGNvbnRhaW5lci5zdHlsZS53aWR0aCA9ICcyMDBweCc7XG5cdFx0Y29udGFpbmVyLnN0eWxlLmhlaWdodCA9ICcyMDBweCc7XG5cblx0XHRjb25zdCB0cmVlID0gZHMuYWRkKG5ldyBDb21wcmVzc2libGVPYmplY3RUcmVlPG51bWJlcj4oJ3Rlc3QnLCBjb250YWluZXIsIG5ldyBEZWxlZ2F0ZSgpLCBbbmV3IFJlbmRlcmVyKCldKSk7XG5cdFx0dHJlZS5sYXlvdXQoMjAwKTtcblxuXHRcdHRyZWUuc2V0Q2hpbGRyZW4obnVsbCwgW1xuXHRcdFx0e1xuXHRcdFx0XHRlbGVtZW50OiAxLCBjaGlsZHJlbjogW3tcblx0XHRcdFx0XHRlbGVtZW50OiAxMSwgY2hpbGRyZW46IFt7XG5cdFx0XHRcdFx0XHRlbGVtZW50OiAxMTEsIGNoaWxkcmVuOiBbXG5cdFx0XHRcdFx0XHRcdHsgZWxlbWVudDogMTExMSB9LFxuXHRcdFx0XHRcdFx0XHR7IGVsZW1lbnQ6IDExMTIgfSxcblx0XHRcdFx0XHRcdFx0eyBlbGVtZW50OiAxMTEzIH0sXG5cdFx0XHRcdFx0XHRdXG5cdFx0XHRcdFx0fV1cblx0XHRcdFx0fV1cblx0XHRcdH1cblx0XHRdKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoZ2V0Um93c1RleHRDb250ZW50KGNvbnRhaW5lciksIFsnMS8xMS8xMTEnLCAnMTExMScsICcxMTEyJywgJzExMTMnXSk7XG5cblx0XHR0cmVlLnNldENoaWxkcmVuKDExLCBbXG5cdFx0XHR7IGVsZW1lbnQ6IDExMSB9LFxuXHRcdFx0eyBlbGVtZW50OiAxMTIgfSxcblx0XHRcdHsgZWxlbWVudDogMTEzIH0sXG5cdFx0XSk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGdldFJvd3NUZXh0Q29udGVudChjb250YWluZXIpLCBbJzEvMTEnLCAnMTExJywgJzExMicsICcxMTMnXSk7XG5cblx0XHR0cmVlLnNldENoaWxkcmVuKDExMywgW1xuXHRcdFx0eyBlbGVtZW50OiAxMTMxIH1cblx0XHRdKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoZ2V0Um93c1RleHRDb250ZW50KGNvbnRhaW5lciksIFsnMS8xMScsICcxMTEnLCAnMTEyJywgJzExMy8xMTMxJ10pO1xuXG5cdFx0dHJlZS5zZXRDaGlsZHJlbigxMTMxLCBbXG5cdFx0XHR7IGVsZW1lbnQ6IDExMzIgfVxuXHRcdF0pO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChnZXRSb3dzVGV4dENvbnRlbnQoY29udGFpbmVyKSwgWycxLzExJywgJzExMScsICcxMTInLCAnMTEzLzExMzEvMTEzMiddKTtcblxuXHRcdHRyZWUuc2V0Q2hpbGRyZW4oMTEzMSwgW1xuXHRcdFx0eyBlbGVtZW50OiAxMTMyIH0sXG5cdFx0XHR7IGVsZW1lbnQ6IDExMzMgfSxcblx0XHRdKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoZ2V0Um93c1RleHRDb250ZW50KGNvbnRhaW5lciksIFsnMS8xMScsICcxMTEnLCAnMTEyJywgJzExMy8xMTMxJywgJzExMzInLCAnMTEzMyddKTtcblx0fSk7XG5cblx0dGVzdCgnZW5hYmxlQ29tcHJlc3Npb24nLCAoKSA9PiB7XG5cdFx0Y29uc3QgY29udGFpbmVyID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnZGl2Jyk7XG5cdFx0Y29udGFpbmVyLnN0eWxlLndpZHRoID0gJzIwMHB4Jztcblx0XHRjb250YWluZXIuc3R5bGUuaGVpZ2h0ID0gJzIwMHB4JztcblxuXHRcdGNvbnN0IHRyZWUgPSBkcy5hZGQobmV3IENvbXByZXNzaWJsZU9iamVjdFRyZWU8bnVtYmVyPigndGVzdCcsIGNvbnRhaW5lciwgbmV3IERlbGVnYXRlKCksIFtuZXcgUmVuZGVyZXIoKV0pKTtcblx0XHR0cmVlLmxheW91dCgyMDApO1xuXG5cdFx0dHJlZS5zZXRDaGlsZHJlbihudWxsLCBbXG5cdFx0XHR7XG5cdFx0XHRcdGVsZW1lbnQ6IDEsIGNoaWxkcmVuOiBbe1xuXHRcdFx0XHRcdGVsZW1lbnQ6IDExLCBjaGlsZHJlbjogW3tcblx0XHRcdFx0XHRcdGVsZW1lbnQ6IDExMSwgY2hpbGRyZW46IFtcblx0XHRcdFx0XHRcdFx0eyBlbGVtZW50OiAxMTExIH0sXG5cdFx0XHRcdFx0XHRcdHsgZWxlbWVudDogMTExMiB9LFxuXHRcdFx0XHRcdFx0XHR7IGVsZW1lbnQ6IDExMTMgfSxcblx0XHRcdFx0XHRcdF1cblx0XHRcdFx0XHR9XVxuXHRcdFx0XHR9XVxuXHRcdFx0fVxuXHRcdF0pO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChnZXRSb3dzVGV4dENvbnRlbnQoY29udGFpbmVyKSwgWycxLzExLzExMScsICcxMTExJywgJzExMTInLCAnMTExMyddKTtcblxuXHRcdHRyZWUudXBkYXRlT3B0aW9ucyh7IGNvbXByZXNzaW9uRW5hYmxlZDogZmFsc2UgfSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChnZXRSb3dzVGV4dENvbnRlbnQoY29udGFpbmVyKSwgWycxJywgJzExJywgJzExMScsICcxMTExJywgJzExMTInLCAnMTExMyddKTtcblxuXHRcdHRyZWUudXBkYXRlT3B0aW9ucyh7IGNvbXByZXNzaW9uRW5hYmxlZDogdHJ1ZSB9KTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGdldFJvd3NUZXh0Q29udGVudChjb250YWluZXIpLCBbJzEv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LFlBQVksVUFBVSxRQUFRLEdBQUcsQ0FBQztBQUN6QyxhQUFPLFlBQVksVUFBVSxLQUFLLEdBQUcsRUFBRTtBQUN2QyxhQUFPLFlBQVksVUFBVSxRQUFRLEdBQUcsRUFBRTtBQUMxQyxhQUFPLFlBQVksVUFBVSxLQUFLLEdBQUcsRUFBRTtBQUN2QyxhQUFPLFlBQVksVUFBVSxRQUFRLEdBQUcsRUFBRTtBQUMxQyxhQUFPLFlBQVksVUFBVSxLQUFLLEdBQUcsRUFBRTtBQUN2QyxhQUFPLFlBQVksVUFBVSxRQUFRLEdBQUcsRUFBRTtBQUMxQyxhQUFPLFlBQVksVUFBVSxLQUFLLEdBQUcsQ0FBQztBQUN0QyxhQUFPLFlBQVksVUFBVSxRQUFRLEdBQUcsQ0FBQztBQUN6QyxhQUFPLFlBQVksVUFBVSxLQUFLLEdBQUcsQ0FBQztBQUN0QyxhQUFPLFlBQVksVUFBVSxRQUFRLEdBQUcsQ0FBQztBQUN6QyxhQUFPLFlBQVksVUFBVSxTQUFTLEdBQUcsQ0FBQztBQUMxQyxhQUFPLFlBQVksVUFBVSxRQUFRLEdBQUcsQ0FBQztBQUN6QyxhQUFPLFlBQVksVUFBVSxTQUFTLEdBQUcsRUFBRTtBQUMzQyxhQUFPLFlBQVksVUFBVSxTQUFTLEdBQUcsRUFBRTtBQUMzQyxhQUFPLFlBQVksVUFBVSxTQUFTLEdBQUcsRUFBRTtBQUMzQyxhQUFPLFlBQVksVUFBVSxTQUFTLEdBQUcsQ0FBQztBQUMxQyxhQUFPLFlBQVksVUFBVSxTQUFTLEdBQUcsSUFBSTtBQUM3QyxhQUFPLFlBQVksVUFBVSxLQUFLLEdBQUcsQ0FBQztBQUN0QyxhQUFPLFlBQVksVUFBVSxLQUFLLEdBQUcsRUFBRTtBQUN2QyxhQUFPLFlBQVksVUFBVSxNQUFNLEdBQUcsQ0FBQztBQUN2QyxhQUFPLFlBQVksVUFBVSxLQUFLLEdBQUcsQ0FBQztBQUFBLElBQ3ZDLENBQUM7QUFFRCxTQUFLLCtCQUErQixNQUFNO0FBQ3pDLFdBQUssWUFBWSxNQUFNO0FBQUEsUUFDdEI7QUFBQSxVQUNDLFNBQVM7QUFBQSxVQUFHLFdBQVc7QUFBQSxVQUFNLFVBQVU7QUFBQSxZQUN0QyxFQUFFLFNBQVMsR0FBRztBQUFBLFlBQ2QsRUFBRSxTQUFTLEdBQUc7QUFBQSxZQUNkLEVBQUUsU0FBUyxHQUFHO0FBQUEsVUFDZjtBQUFBLFFBQ0Q7QUFBQSxRQUNBLEVBQUUsU0FBUyxFQUFFO0FBQUEsUUFDYixFQUFFLFNBQVMsRUFBRTtBQUFBLE1BQ2QsQ0FBQztBQUVELFlBQU0sWUFBWSxLQUFLLFNBQVM7QUFFaEMsYUFBTyxZQUFZLFVBQVUsUUFBUSxHQUFHLElBQUk7QUFDNUMsYUFBTyxZQUFZLFVBQVUsS0FBSyxHQUFHLENBQUM7QUFDdEMsYUFBTyxZQUFZLFVBQVUsS0FBSyxHQUFHLENBQUM7QUFDdEMsYUFBTyxZQUFZLFVBQVUsS0FBSyxHQUFHLENBQUM7QUFDdEMsYUFBTyxZQUFZLFVBQVUsS0FBSyxHQUFHLElBQUk7QUFDekMsYUFBTyxZQUFZLFVBQVUsU0FBUyxHQUFHLENBQUM7QUFDMUMsYUFBTyxZQUFZLFVBQVUsU0FBUyxHQUFHLENBQUM7QUFDMUMsYUFBTyxZQUFZLFVBQVUsU0FBUyxHQUFHLENBQUM7QUFDMUMsYUFBTyxZQUFZLFVBQVUsU0FBUyxHQUFHLElBQUk7QUFDN0MsYUFBTyxZQUFZLFVBQVUsS0FBSyxHQUFHLENBQUM7QUFDdEMsYUFBTyxZQUFZLFVBQVUsTUFBTSxHQUFHLENBQUM7QUFDdkMsYUFBTyxZQUFZLFVBQVUsS0FBSyxHQUFHLENBQUM7QUFBQSxJQUN2QyxDQUFDO0FBRUQsU0FBSyxpQ0FBaUMsTUFBTTtBQUMzQyxlQUFTLFFBQU0sS0FBSyxNQUFNO0FBRTFCLFdBQUssWUFBWSxNQUFNO0FBQUEsUUFDdEI7QUFBQSxVQUNDLFNBQVM7QUFBQSxVQUFHLFVBQVU7QUFBQSxZQUNyQixFQUFFLFNBQVMsR0FBRztBQUFBLFlBQ2QsRUFBRSxTQUFTLEdBQUc7QUFBQSxZQUNkLEVBQUUsU0FBUyxHQUFHO0FBQUEsVUFDZjtBQUFBLFFBQ0Q7QUFBQSxRQUNBLEVBQUUsU0FBUyxFQUFFO0FBQUEsUUFDYixFQUFFLFNBQVMsRUFBRTtBQUFBLE1BQ2QsQ0FBQztBQUVELFlBQU0sWUFBWSxLQUFLLFNBQVM7QUFFaEMsYUFBTyxZQUFZLFVBQVUsUUFBUSxHQUFHLElBQUk7QUFDNUMsYUFBTyxZQUFZLFVBQVUsS0FBSyxHQUFHLENBQUM7QUFDdEMsYUFBTyxZQUFZLFVBQVUsS0FBSyxHQUFHLEVBQUU7QUFDdkMsYUFBTyxZQUFZLFVBQVUsS0FBSyxHQUFHLEVBQUU7QUFDdkMsYUFBTyxZQUFZLFVBQVUsS0FBSyxHQUFHLENBQUM7QUFDdEMsYUFBTyxZQUFZLFVBQVUsS0FBSyxHQUFHLElBQUk7QUFDekMsYUFBTyxZQUFZLFVBQVUsU0FBUyxHQUFHLENBQUM7QUFDMUMsYUFBTyxZQUFZLFVBQVUsU0FBUyxHQUFHLEVBQUU7QUFDM0MsYUFBTyxZQUFZLFVBQVUsU0FBUyxHQUFHLEVBQUU7QUFDM0MsYUFBTyxZQUFZLFVBQVUsU0FBUyxHQUFHLENBQUM7QUFDMUMsYUFBTyxZQUFZLFVBQVUsU0FBUyxHQUFHLElBQUk7QUFDN0MsYUFBTyxZQUFZLFVBQVUsS0FBSyxHQUFHLENBQUM7QUFDdEMsYUFBTyxZQUFZLFVBQVUsS0FBSyxHQUFHLEVBQUU7QUFDdkMsYUFBTyxZQUFZLFVBQVUsTUFBTSxHQUFHLENBQUM7QUFDdkMsYUFBTyxZQUFZLFVBQVUsS0FBSyxHQUFHLENBQUM7QUFBQSxJQUN2QyxDQUFDO0FBRUQsU0FBSyxxQ0FBcUMsTUFBTTtBQUMvQyxXQUFLLFlBQVksTUFBTTtBQUFBLFFBQ3RCO0FBQUEsVUFDQyxTQUFTO0FBQUEsVUFBRyxVQUFVO0FBQUEsWUFDckIsRUFBRSxTQUFTLEdBQUc7QUFBQSxZQUNkLEVBQUUsU0FBUyxHQUFHO0FBQUEsWUFDZCxFQUFFLFNBQVMsR0FBRztBQUFBLFVBQ2Y7QUFBQSxRQUNEO0FBQUEsUUFDQSxFQUFFLFNBQVMsRUFBRTtBQUFBLFFBQ2IsRUFBRSxTQUFTLEVBQUU7QUFBQSxNQUNkLENBQUM7QUFFRCxZQUFNLFlBQVksS0FBSyxTQUFTLENBQUM7QUFFakMsYUFBTyxZQUFZLFVBQVUsUUFBUSxHQUFHLENBQUM7QUFDekMs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
