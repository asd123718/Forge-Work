import assert from "assert";
import { SashState } from "../../../../browser/ui/sash/sash.js";
import { LayoutPriority, Sizing, SplitView } from "../../../../browser/ui/splitview/splitview.js";
import { Emitter } from "../../../../common/event.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../common/utils.js";
class TestView {
  constructor(_minimumSize, _maximumSize, priority = LayoutPriority.Normal) {
    this._minimumSize = _minimumSize;
    this._maximumSize = _maximumSize;
    this.priority = priority;
    this._onDidChange = new Emitter();
    this.onDidChange = this._onDidChange.event;
    this._element = document.createElement("div");
    this._onDidGetElement = new Emitter();
    this.onDidGetElement = this._onDidGetElement.event;
    this._size = 0;
    this._orthogonalSize = 0;
    this._onDidLayout = new Emitter();
    this.onDidLayout = this._onDidLayout.event;
    this._onDidFocus = new Emitter();
    this.onDidFocus = this._onDidFocus.event;
    assert(_minimumSize <= _maximumSize, "splitview view minimum size must be <= maximum size");
  }
  get minimumSize() {
    return this._minimumSize;
  }
  set minimumSize(size) {
    this._minimumSize = size;
    this._onDidChange.fire(void 0);
  }
  get maximumSize() {
    return this._maximumSize;
  }
  set maximumSize(size) {
    this._maximumSize = size;
    this._onDidChange.fire(void 0);
  }
  get element() {
    this._onDidGetElement.fire();
    return this._element;
  }
  get size() {
    return this._size;
  }
  get orthogonalSize() {
    return this._orthogonalSize;
  }
  layout(size, _offset, orthogonalSize) {
    this._size = size;
    this._orthogonalSize = orthogonalSize;
    this._onDidLayout.fire({ size, orthogonalSize });
  }
  focus() {
    this._onDidFocus.fire();
  }
  dispose() {
    this._onDidChange.dispose();
    this._onDidGetElement.dispose();
    this._onDidLayout.dispose();
    this._onDidFocus.dispose();
  }
}
function getSashes(splitview) {
  return splitview.sashItems.map((i) => i.sash);
}
suite("Splitview", () => {
  const store = ensureNoDisposablesAreLeakedInTestSuite();
  let container;
  setup(() => {
    container = document.createElement("div");
    container.style.position = "absolute";
    container.style.width = `${200}px`;
    container.style.height = `${200}px`;
  });
  test("empty splitview has empty DOM", () => {
    store.add(new SplitView(container));
    assert.strictEqual(container.firstElementChild.firstElementChild.childElementCount, 0, "split view should be empty");
  });
  test("has views and sashes as children", () => {
    const view1 = store.add(new TestView(20, 20));
    const view2 = store.add(new TestView(20, 20));
    const view3 = store.add(new TestView(20, 20));
    const splitview = store.add(new SplitView(container));
    splitview.addView(view1, 20);
    splitview.addView(view2, 20);
    splitview.addView(view3, 20);
    let viewQuery = container.querySelectorAll(".monaco-split-view2 > .monaco-scrollable-element > .split-view-container > .split-view-view");
    assert.strictEqual(viewQuery.length, 3, "split view should have 3 views");
    let sashQuery = container.querySelectorAll(".monaco-split-view2 > .sash-container > .monaco-sash");
    assert.strictEqual(sashQuery.length, 2, "split view should have 2 sashes");
    splitview.removeView(2);
    viewQuery = container.querySelectorAll(".monaco-split-view2 > .monaco-scrollable-element > .split-view-container > .split-view-view");
    assert.strictEqual(viewQuery.length, 2, "split view should have 2 views");
    sashQuery = container.querySelectorAll(".monaco-split-view2 > .sash-container > .monaco-sash");
    assert.strictEqual(sashQuery.length, 1, "split view should have 1 sash");
    splitview.removeView(0);
    viewQuery = container.querySelectorAll(".monaco-split-view2 > .monaco-scrollable-element > .split-view-container > .split-view-view");
    assert.strictEqual(viewQuery.length, 1, "split view should have 1 view");
    sashQuery = container.querySelectorAll(".monaco-split-view2 > .sash-container > .monaco-sash");
    assert.strictEqual(sashQuery.length, 0, "split view should have no sashes");
    splitview.removeView(0);
    viewQuery = container.querySelectorAll(".monaco-split-view2 > .monaco-scrollable-element > .split-view-container > .split-view-view");
    assert.strictEqual(viewQuery.length, 0, "split view should have no views");
    sashQuery = container.querySelectorAll(".monaco-split-view2 > .sash-container > .monaco-sash");
    assert.strictEqual(sashQuery.length, 0, "split view should have no sashes");
  });
  test("calls view methods on addView and removeView", () => {
    const view = store.add(new TestView(20, 20));
    const splitview = store.add(new SplitView(container));
    let didLayout = false;
    store.add(view.onDidLayout(() => didLayout = true));
    store.add(view.onDidGetElement(() => void 0));
    splitview.addView(view, 20);
    assert.strictEqual(view.size, 20, "view has right size");
    assert(didLayout, "layout is called");
    assert(didLayout, "render is called");
  });
  test("stretches view to viewport", () => {
    const view = store.add(new TestView(20, Number.POSITIVE_INFINITY));
    const splitview = store.add(new SplitView(container));
    splitview.layout(200);
    splitview.addView(view, 20);
    assert.strictEqual(view.size, 200, "view is stretched");
    splitview.layout(200);
    assert.strictEqual(view.size, 200, "view stayed the same");
    splitview.layout(100);
    assert.strictEqual(view.size, 100, "view is collapsed");
    splitview.layout(20);
    assert.strictEqual(view.size, 20, "view is collapsed");
    splitview.layout(10);
    assert.strictEqual(view.size, 20, "view is clamped");
    splitview.layout(200);
    assert.strictEqual(view.size, 200, "view is stretched");
  });
  test("can resize views", () => {
    const view1 = store.add(new TestView(20, Number.POSITIVE_INFINITY));
    const view2 = store.add(new TestView(20, Number.POSITIVE_INFINITY));
    const view3 = store.add(new TestView(20, Number.POSITIVE_INFINITY));
    const splitview = store.add(new SplitView(container));
    splitview.layout(200);
    splitview.addView(view1, 20);
    splitview.addView(view2, 20);
    splitview.addView(view3, 20);
    assert.strictEqual(view1.size, 160, "view1 is stretched");
    assert.strictEqual(view2.size, 20, "view2 size is 20");
    assert.strictEqual(view3.size, 20, "view3 size is 20");
    splitview.resizeView(1, 40);
    assert.strictEqual(view1.size, 140, "view1 is collapsed");
    assert.strictEqual(view2.size, 40, "view2 is stretched");
    assert.strictEqual(view3.size, 20, "view3 stays the same");
    splitview.resizeView(0, 70);
    assert.strictEqual(view1.size, 70, "view1 is collapsed");
    assert.strictEqual(view2.size, 40, "view2 stays the same");
    assert.strictEqual(view3.size, 90, "view3 is stretched");
    splitview.resizeView(2, 40);
    assert.strictEqual(view1.size, 70, "view1 stays the same");
    assert.strictEqual(view2.size, 90, "view2 is collapsed");
    assert.strictEqual(view3.size, 40, "view3 is stretched");
  });
  test("reacts to view changes", () => {
    const view1 = store.add(new TestView(20, Number.POSITIVE_INFINITY));
    const view2 = store.add(new TestView(20, Number.POSITIVE_INFINITY));
    const view3 = store.add(new TestView(20, Number.POSITIVE_INFINITY));
    const splitview = store.add(new SplitView(container));
    splitview.layout(200);
    splitview.addView(view1, 20);
    splitview.addView(view2, 20);
    splitview.addView(view3, 20);
    assert.strictEqual(view1.size, 160, "view1 is stretched");
    assert.strictEqual(view2.size, 20, "view2 size is 20");
    assert.strictEqual(view3.size, 20, "view3 size is 20");
    view1.maximumSize = 20;
    assert.strictEqual(view1.size, 20, "view1 is collapsed");
    assert.strictEqual(view2.size, 20, "view2 stays the same");
    assert.strictEqual(view3.size, 160, "view3 is stretched");
    view3.maximumSize = 40;
    assert.strictEqual(view1.size, 20, "view1 stays the same");
    assert.strictEqual(view2.size, 140, "view2 is stretched");
    assert.strictEqual(view3.size, 40, "view3 is collapsed");
    view2.maximumSize = 200;
    assert.strictEqual(view1.size, 20, "view1 stays the same");
    assert.strictEqual(view2.size, 140, "view2 stays the same");
    assert.strictEqual(view3.size, 40, "view3 stays the same");
    view3.maximumSize = Number.POSITIVE_INFINITY;
    view3.minimumSize = 100;
    assert.strictEqual(view1.size, 20, "view1 is collapsed");
    assert.strictEqual(view2.size, 80, "view2 is collapsed");
    assert.strictEqual(view3.size, 100, "view3 is stretched");
  });
  test("sashes are properly enabled/disabled", () => {
    const view1 = store.add(new TestView(20, Number.POSITIVE_INFINITY));
    const view2 = store.add(new TestView(20, Number.POSITIVE_INFINITY));
    const view3 = store.add(new TestView(20, Number.POSITIVE_INFINITY));
    const splitview = store.add(new SplitView(container));
    splitview.layout(200);
    splitview.addView(view1, Sizing.Distribute);
    splitview.addView(view2, Sizing.Distribute);
    splitview.addView(view3, Sizing.Distribute);
    const sashes = getSashes(splitview);
    assert.strictEqual(sashes.length, 2, "there are two sashes");
    assert.strictEqual(sashes[0].state, SashState.Enabled, "first sash is enabled");
    assert.strictEqual(sashes[1].state, SashState.Enabled, "second sash is enabled");
    splitview.layout(60);
    assert.strictEqual(sashes[0].state, SashState.Disabled, "first sash is disabled");
    assert.strictEqual(sashes[1].state, SashState.Disabled, "second sash is disabled");
    splitview.layout(20);
    assert.strictEqual(sashes[0].state, SashState.Disabled, "first sash is disabled");
    assert.strictEqual(sashes[1].state, SashState.Disabled, "second sash is disabled");
    splitview.layout(200);
    assert.strictEqual(sashes[0].state, SashState.Enabled, "first sash is enabled");
    assert.strictEqual(sashes[1].state, SashState.Enabled, "second sash is enabled");
    view1.maximumSize = 20;
    assert.strictEqual(sashes[0].state, SashState.Disabled, "first sash is disabled");
    assert.strictEqual(sashes[1].state, SashState.Enabled, "second sash is enabled");
    view2.maximumSize = 20;
    assert.strictEqual(sashes[0].state, SashState.Disabled, "first sash is disabled");
    assert.strictEqual(sashes[1].state, SashState.Disabled, "second sash is disabled");
    view1.maximumSize = 300;
    assert.strictEqual(sashes[0].state, SashState.AtMinimum, "first sash is enabled");
    assert.strictEqual(sashes[1].state, SashState.AtMinimum, "second sash is enabled");
    view2.maximumSize = 200;
    assert.strictEqual(sashes[0].state, SashState.AtMinimum, "first sash is enabled");
    assert.strictEqual(sashes[1].state, SashState.AtMinimum, "second sash is enabled");
    splitview.resizeView(0, 40);
    assert.strictEqual(sashes[0].state, SashState.Enabled, "first sash is enabled");
    assert.strictEqual(sashes[1].state, SashState.Enabled, "second sash is enabled");
  });
  test("issue #35497", () => {
    const view1 = store.add(new TestView(160, Number.POSITIVE_INFINITY));
    const view2 = store.add(new TestView(66, 66));
    const splitview = store.add(new SplitView(container));
    splitview.layout(986);
    splitview.addView(view1, 142, 0);
    assert.strictEqual(view1.size, 986, "first view is stretched");
    store.add(view2.onDidGetElement(() => {
      assert.throws(() => splitview.resizeView(1, 922));
      assert.throws(() => splitview.resizeView(1, 922));
    }));
    splitview.addView(view2, 66, 0);
    assert.strictEqual(view2.size, 66, "second view is fixed");
    assert.strictEqual(view1.size, 986 - 66, "first view is collapsed");
    const viewContainers = container.querySelectorAll(".split-view-view");
    assert.strictEqual(viewContainers.length, 2, "there are two view containers");
    assert.strictEqual(viewContainers.item(0).style.height, "66px", "second view container is 66px");
    assert.strictEqual(viewContainers.item(1).style.height, `${986 - 66}px`, "first view container is 66px");
  });
  test("automatic size distribution", () => {
    const view1 = store.add(new TestView(20, Number.POSITIVE_INFINITY));
    const view2 = store.add(new TestView(20, Number.POSITIVE_INFINITY));
    const view3 = store.add(new TestView(20, Number.POSITIVE_INFINITY));
    const splitview = store.add(new SplitView(container));
    splitview.layout(200);
    splitview.addView(view1, Sizing.Distribute);
    assert.strictEqual(view1.size, 200);
    splitview.addView(view2, 50);
    assert.deepStrictEqual([view1.size, view2.size], [150, 50]);
    splitview.addView(view3, Sizing.Distribute);
    assert.deepStrictEqual([view1.size, view2.size, view3.size], [66, 66, 68]);
    splitview.removeView(1, Sizing.Distribute);
    assert.deepStrictEqual([view1.size, view3.size], [100, 100]);
  });
  test("add views before layout", () => {
    const view1 = store.add(new TestView(20, Number.POSITIVE_INFINITY));
    const view2 = store.add(new TestView(20, Number.POSITIVE_INFINITY));
    const view3 = store.add(new TestView(20, Number.POSITIVE_INFINITY));
    const splitview = store.add(new SplitView(container));
    splitview.addView(view1, 100);
    splitview.addView(view2, 75);
    splitview.addView(view3, 25);
    splitview.layout(200);
    assert.deepStrictEqual([view1.size, view2.size, view3.size], [67, 67, 66]);
  });
  test("split sizing", () => {
    const view1 = store.add(new TestView(20, Number.POSITIVE_INFINITY));
    const view2 = store.add(new TestView(20, Number.POSITIVE_INFINITY));
    const view3 = store.add(new TestView(20, Number.POSITIVE_INFINITY));
    const splitview = store.add(new SplitView(container));
    splitview.layout(200);
    splitview.addView(view1, Sizing.Distribute);
    assert.strictEqual(view1.size, 200);
    splitview.addView(view2, Sizing.Split(0));
    assert.deepStrictEqual([view1.size, view2.size], [100, 100]);
    splitview.addView(view3, Sizing.Split(1));
    assert.deepStrictEqual([view1.size, view2.size, view3.size], [100, 50, 50]);
  });
  test("split sizing 2", () => {
    const view1 = store.add(new TestView(20, Number.POSITIVE_INFINITY));
    const view2 = store.add(new TestView(20, Number.POSITIVE_INFINITY));
    const view3 = store.add(new TestView(20, Number.POSITIVE_INFINITY));
    const splitview = store.add(new SplitView(container));
    splitview.layout(200);
    splitview.addView(view1, Sizing.Distribute);
    assert.strictEqual(view1.size, 200);
    splitview.addView(view2, Sizing.Split(0));
    assert.deepStrictEqual([view1.size, view2.size], [100, 100]);
    splitview.addView(view3, Sizing.Split(0));
    assert.deepStrictEqual([view1.size, view2.size, view3.size], [50, 100, 50]);
  });
  test("proportional layout", () => {
    const view1 = store.add(new TestView(20, Number.POSITIVE_INFINITY));
    const view2 = store.add(new TestView(20, Number.POSITIVE_INFINITY));
    const splitview = store.add(new SplitView(container));
    splitview.layout(200);
    splitview.addView(view1, Sizing.Distribute);
    splitview.addView(view2, Sizing.Distribute);
    assert.deepStrictEqual([view1.size, view2.size], [100, 100]);
    splitview.layout(100);
    assert.deepStrictEqual([view1.size, view2.size], [50, 50]);
  });
  test("disable proportional layout", () => {
    const view1 = store.add(new TestView(20, Number.POSITIVE_INFINITY));
    const view2 = store.add(new TestView(20, Number.POSITIVE_INFINITY));
    const splitview = store.add(new SplitView(container, { proportionalLayout: false }));
    splitview.layout(200);
    splitview.addView(view1, Sizing.Distribute);
    splitview.addView(view2, Sizing.Distribute);
    assert.deepStrictEqual([view1.size, view2.size], [100, 100]);
    splitview.layout(100);
    assert.deepStrictEqual([view1.size, view2.size], [80, 20]);
  });
  test("high layout priority", () => {
    const view1 = store.add(new TestView(20, Number.POSITIVE_INFINITY));
    const view2 = store.add(new TestView(20, Number.POSITIVE_INFINITY, LayoutPriority.High));
    const view3 = store.add(new TestView(20, Number.POSITIVE_INFINITY));
    const splitview = store.add(new SplitView(container, { proportionalLayout: false }));
    splitview.layout(200);
    splitview.addView(view1, Sizing.Distribute);
    splitview.addView(view2, Sizing.Distribute);
    splitview.addView(view3, Sizing.Distribute);
    assert.deepStrictEqual([view1.size, view2.size, view3.size], [66, 68, 66]);
    splitview.layout(180);
    assert.deepStrictEqual([view1.size, view2.size, view3.size], [66, 48, 66]);
    splitview.layout(124);
    assert.deepStrictEqual([view1.size, view2.size, view3.size], [66, 20, 38]);
    splitview.layout(60);
    assert.deepStrictEqual([view1.size, view2.size, view3.size], [20, 20, 20]);
    splitview.layout(200);
    assert.deepStrictEqual([view1.size, view2.size, view3.size], [20, 160, 20]);
  });
  test("low layout priority", () => {
    const view1 = store.add(new TestView(20, Number.POSITIVE_INFINITY));
    const view2 = store.add(new TestView(20, Number.POSITIVE_INFINITY));
    const view3 = store.add(new TestView(20, Number.POSITIVE_INFINITY, LayoutPriority.Low));
    const splitview = store.add(new SplitView(container, { proportionalLayout: false }));
    splitview.layout(200);
    splitview.addView(view1, Sizing.Distribute);
    splitview.addView(view2, Sizing.Distribute);
    splitview.addView(view3, Sizing.Distribute);
    assert.deepStrictEqual([view1.size, view2.size, view3.size], [66, 68, 66]);
    splitview.layout(180);
    assert.deepStrictEqual([view1.size, view2.size, view3.size], [66, 48, 66]);
    splitview.layout(132);
    assert.deepStrictEqual([view1.size, view2.size, view3.size], [46, 20, 66]);
    splitview.layout(60);
    assert.deepStrictEqual([view1.size, view2.size, view3.size], [20, 20, 20]);
    splitview.layout(200);
    assert.deepStrictEqual([view1.size, view2.size, view3.size], [20, 160, 20]);
  });
  test("context propagates to views", () => {
    const view1 = store.add(new TestView(20, Number.POSITIVE_INFINITY));
    const view2 = store.add(new TestView(20, Number.POSITIVE_INFINITY));
    const view3 = store.add(new TestView(20, Number.POSITIVE_INFINITY, LayoutPriority.Low));
    const splitview = store.add(new SplitView(container, { proportionalLayout: false }));
    splitview.layout(200);
    splitview.addView(view1, Sizing.Distribute);
    splitview.addView(view2, Sizing.Distribute);
    splitview.addView(view3, Sizing.Distribute);
    splitview.layout(200, 100);
    assert.deepStrictEqual([view1.orthogonalSize, view2.orthogonalSize, view3.orthogonalSize], [100, 100, 100]);
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxiYXNlXFx0ZXN0XFxicm93c2VyXFx1aVxcc3BsaXR2aWV3XFxzcGxpdHZpZXcudGVzdC50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCBhc3NlcnQgZnJvbSAnYXNzZXJ0JztcbmltcG9ydCB7IFNhc2gsIFNhc2hTdGF0ZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jyb3dzZXIvdWkvc2FzaC9zYXNoLmpzJztcbmltcG9ydCB7IElWaWV3LCBMYXlvdXRQcmlvcml0eSwgU2l6aW5nLCBTcGxpdFZpZXcgfSBmcm9tICcuLi8uLi8uLi8uLi9icm93c2VyL3VpL3NwbGl0dmlldy9zcGxpdHZpZXcuanMnO1xuaW1wb3J0IHsgRW1pdHRlciB9IGZyb20gJy4uLy4uLy4uLy4uL2NvbW1vbi9ldmVudC5qcyc7XG5pbXBvcnQgeyBlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vdXRpbHMuanMnO1xuXG5jbGFzcyBUZXN0VmlldyBpbXBsZW1lbnRzIElWaWV3PG51bWJlcj4ge1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX29uRGlkQ2hhbmdlID0gbmV3IEVtaXR0ZXI8bnVtYmVyIHwgdW5kZWZpbmVkPigpO1xuXHRyZWFkb25seSBvbkRpZENoYW5nZSA9IHRoaXMuX29uRGlkQ2hhbmdlLmV2ZW50O1xuXG5cdGdldCBtaW5pbXVtU2l6ZSgpOiBudW1iZXIgeyByZXR1cm4gdGhpcy5fbWluaW11bVNpemU7IH1cblx0c2V0IG1pbmltdW1TaXplKHNpemU6IG51bWJlcikgeyB0aGlzLl9taW5pbXVtU2l6ZSA9IHNpemU7IHRoaXMuX29uRGlkQ2hhbmdlLmZpcmUodW5kZWZpbmVkKTsgfVxuXG5cdGdldCBtYXhpbXVtU2l6ZSgpOiBudW1iZXIgeyByZXR1cm4gdGhpcy5fbWF4aW11bVNpemU7IH1cblx0c2V0IG1heGltdW1TaXplKHNpemU6IG51bWJlcikgeyB0aGlzLl9tYXhpbXVtU2l6ZSA9IHNpemU7IHRoaXMuX29uRGlkQ2hhbmdlLmZpcmUodW5kZWZpbmVkKTsgfVxuXG5cdHByaXZhdGUgX2VsZW1lbnQ6IEhUTUxFbGVtZW50ID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnZGl2Jyk7XG5cdGdldCBlbGVtZW50KCk6IEhUTUxFbGVtZW50IHsgdGhpcy5fb25EaWRHZXRFbGVtZW50LmZpcmUoKTsgcmV0dXJuIHRoaXMuX2VsZW1lbnQ7IH1cblxuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkRpZEdldEVsZW1lbnQgPSBuZXcgRW1pdHRlcjx2b2lkPigpO1xuXHRyZWFkb25seSBvbkRpZEdldEVsZW1lbnQgPSB0aGlzLl9vbkRpZEdldEVsZW1lbnQuZXZlbnQ7XG5cblx0cHJpdmF0ZSBfc2l6ZSA9IDA7XG5cdGdldCBzaXplKCk6IG51bWJlciB7IHJldHVybiB0aGlzLl9zaXplOyB9XG5cdHByaXZhdGUgX29ydGhvZ29uYWxTaXplOiBudW1iZXIgfCB1bmRlZmluZWQgPSAwO1xuXHRnZXQgb3J0aG9nb25hbFNpemUoKTogbnVtYmVyIHwgdW5kZWZpbmVkIHsgcmV0dXJuIHRoaXMuX29ydGhvZ29uYWxTaXplOyB9XG5cdHByaXZhdGUgcmVhZG9ubHkgX29uRGlkTGF5b3V0ID0gbmV3IEVtaXR0ZXI8eyBzaXplOiBudW1iZXI7IG9ydGhvZ29uYWxTaXplOiBudW1iZXIgfCB1bmRlZmluZWQgfT4oKTtcblx0cmVhZG9ubHkgb25EaWRMYXlvdXQgPSB0aGlzLl9vbkRpZExheW91dC5ldmVudDtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkRpZEZvY3VzID0gbmV3IEVtaXR0ZXI8dm9pZD4oKTtcblx0cmVhZG9ubHkgb25EaWRGb2N1cyA9IHRoaXMuX29uRGlkRm9jdXMuZXZlbnQ7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0cHJpdmF0ZSBfbWluaW11bVNpemU6IG51bWJlcixcblx0XHRwcml2YXRlIF9tYXhpbXVtU2l6ZTogbnVtYmVyLFxuXHRcdHJlYWRvbmx5IHByaW9yaXR5OiBMYXlvdXRQcmlvcml0eSA9IExheW91dFByaW9yaXR5Lk5vcm1hbFxuXHQpIHtcblx0XHRhc3NlcnQoX21pbmltdW1TaXplIDw9IF9tYXhpbXVtU2l6ZSwgJ3NwbGl0dmlldyB2aWV3IG1pbmltdW0gc2l6ZSBtdXN0IGJlIDw9IG1heGltdW0gc2l6ZScpO1xuXHR9XG5cblx0bGF5b3V0KHNpemU6IG51bWJlciwgX29mZnNldDogbnVtYmVyLCBvcnRob2dvbmFsU2l6ZTogbnVtYmVyIHwgdW5kZWZpbmVkKTogdm9pZCB7XG5cdFx0dGhpcy5fc2l6ZSA9IHNpemU7XG5cdFx0dGhpcy5fb3J0aG9nb25hbFNpemUgPSBvcnRob2dvbmFsU2l6ZTtcblx0XHR0aGlzLl9vbkRpZExheW91dC5maXJlKHsgc2l6ZSwgb3J0aG9nb25hbFNpemUgfSk7XG5cdH1cblxuXHRmb2N1cygpOiB2b2lkIHtcblx0XHR0aGlzLl9vbkRpZEZvY3VzLmZpcmUoKTtcblx0fVxuXG5cdGRpc3Bvc2UoKTogdm9pZCB7XG5cdFx0dGhpcy5fb25EaWRDaGFuZ2UuZGlzcG9zZSgpO1xuXHRcdHRoaXMuX29uRGlkR2V0RWxlbWVudC5kaXNwb3NlKCk7XG5cdFx0dGhpcy5fb25EaWRMYXlvdXQuZGlzcG9zZSgpO1xuXHRcdHRoaXMuX29uRGlkRm9jdXMuZGlzcG9zZSgpO1xuXHR9XG59XG5cbmZ1bmN0aW9uIGdldFNhc2hlcyhzcGxpdHZpZXc6IFNwbGl0Vmlldyk6IFNhc2hbXSB7XG5cdHJldHVybiBzcGxpdHZpZXcuc2FzaEl0ZW1zLm1hcCgoaTogYW55KSA9PiBpLnNhc2gpIGFzIFNhc2hbXTtcbn1cblxuc3VpdGUoJ1NwbGl0dmlldycsICgpID0+IHtcblxuXHRjb25zdCBzdG9yZSA9IGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSgpO1xuXG5cdGxldCBjb250YWluZXI6IEhUTUxFbGVtZW50O1xuXG5cdHNldHVwKCgpID0+IHtcblx0XHRjb250YWluZXIgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdkaXYnKTtcblx0XHRjb250YWluZXIuc3R5bGUucG9zaXRpb24gPSAnYWJzb2x1dGUnO1xuXHRcdGNvbnRhaW5lci5zdHlsZS53aWR0aCA9IGAkezIwMH1weGA7XG5cdFx0Y29udGFpbmVyLnN0eWxlLmhlaWdodCA9IGAkezIwMH1weGA7XG5cdH0pO1xuXG5cdHRlc3QoJ2VtcHR5IHNwbGl0dmlldyBoYXMgZW1wdHkgRE9NJywgKCkgPT4ge1xuXHRcdHN0b3JlLmFkZChuZXcgU3BsaXRWaWV3KGNvbnRhaW5lcikpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChjb250YWluZXIuZmlyc3RFbGVtZW50Q2hpbGQhLmZpcnN0RWxlbWVudENoaWxkIS5jaGlsZEVsZW1lbnRDb3VudCwgMCwgJ3NwbGl0IHZpZXcgc2hvdWxkIGJlIGVtcHR5Jyk7XG5cdH0pO1xuXG5cdHRlc3QoJ2hhcyB2aWV3cyBhbmQgc2FzaGVzIGFzIGNoaWxkcmVuJywgKCkgPT4ge1xuXHRcdGNvbnN0IHZpZXcxID0gc3RvcmUuYWRkKG5ldyBUZXN0VmlldygyMCwgMjApKTtcblx0XHRjb25zdCB2aWV3MiA9IHN0b3JlLmFkZChuZXcgVGVzdFZpZXcoMjAsIDIwKSk7XG5cdFx0Y29uc3QgdmlldzMgPSBzdG9yZS5hZGQobmV3IFRlc3RWaWV3KDIwLCAyMCkpO1xuXHRcdGNvbnN0IHNwbGl0dmlldyA9IHN0b3JlLmFkZChuZXcgU3BsaXRWaWV3KGNvbnRhaW5lcikpO1xuXG5cdFx0c3BsaXR2aWV3LmFkZFZpZXcodmlldzEsIDIwKTtcblx0XHRzcGxpdHZpZXcuYWRkVmlldyh2aWV3MiwgMjApO1xuXHRcdHNwbGl0dmlldy5hZGRWaWV3KHZpZXczLCAyMCk7XG5cblx0XHRsZXQgdmlld1F1ZXJ5ID0gY29udGFpbmVyLnF1ZXJ5U2VsZWN0b3JBbGwoJy5tb25hY28tc3BsaXQtdmlldzIgPiAubW9uYWNvLXNjcm9sbGFibGUtZWxlbWVudCA+IC5zcGxpdC12aWV3LWNvbnRhaW5lciA+IC5zcGxpdC12aWV3LXZpZXcnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodmlld1F1ZXJ5Lmxlbmd0aCwgMywgJ3NwbGl0IHZpZXcgc2hvdWxkIGhhdmUgMyB2aWV3cycpO1xuXG5cdFx0bGV0IHNhc2hRdWVyeSA9IGNvbnRhaW5lci5xdWVyeVNlbGVjdG9yQWxsKCcubW9uYWNvLXNwbGl0LXZpZXcyID4gLnNhc2gtY29udGFpbmVyID4gLm1vbmFjby1zYXNoJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNhc2hRdWVyeS5sZW5ndGgsIDIsICdzcGxpdCB2aWV3IHNob3VsZCBoYXZlIDIgc2FzaGVzJyk7XG5cblx0XHRzcGxpdHZpZXcucmVtb3ZlVmlldygyKTtcblxuXHRcdHZpZXdRdWVyeSA9IGNvbnRhaW5lci5xdWVyeVNlbGVjdG9yQWxsKCcubW9uYWNvLXNwbGl0LXZpZXcyID4gLm1vbmFjby1zY3JvbGxhYmxlLWVsZW1lbnQgPiAuc3BsaXQtdmlldy1jb250YWluZXIgPiAuc3BsaXQtdmlldy12aWV3Jyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHZpZXdRdWVyeS5sZW5ndGgsIDIsICdzcGxpdCB2aWV3IHNob3VsZCBoYXZlIDIgdmlld3MnKTtcblxuXHRcdHNhc2hRdWVyeSA9IGNvbnRhaW5lci5xdWVyeVNlbGVjdG9yQWxsKCcubW9uYWNvLXNwbGl0LXZpZXcyID4gLnNhc2gtY29udGFpbmVyID4gLm1vbmFjby1zYXNoJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNhc2hRdWVyeS5sZW5ndGgsIDEsICdzcGxpdCB2aWV3IHNob3VsZCBoYXZlIDEgc2FzaCcpO1xuXG5cdFx0c3BsaXR2aWV3LnJlbW92ZVZpZXcoMCk7XG5cblx0XHR2aWV3UXVlcnkgPSBjb250YWluZXIucXVlcnlTZWxlY3RvckFsbCgnLm1vbmFjby1zcGxpdC12aWV3MiA+IC5tb25hY28tc2Nyb2xsYWJsZS1lbGVtZW50ID4gLnNwbGl0LXZpZXctY29udGFpbmVyID4gLnNwbGl0LXZpZXctdmlldycpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh2aWV3UXVlcnkubGVuZ3RoLCAxLCAnc3BsaXQgdmlldyBzaG91bGQgaGF2ZSAxIHZpZXcnKTtcblxuXHRcdHNhc2hRdWVyeSA9IGNvbnRhaW5lci5xdWVyeVNlbGVjdG9yQWxsKCcubW9uYWNvLXNwbGl0LXZpZXcyID4gLnNhc2gtY29udGFpbmVyID4gLm1vbmFjby1zYXNoJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNhc2hRdWVyeS5sZW5ndGgsIDAsICdzcGxpdCB2aWV3IHNob3VsZCBoYXZlIG5vIHNhc2hlcycpO1xuXG5cdFx0c3BsaXR2aWV3LnJlbW92ZVZpZXcoMCk7XG5cblx0XHR2aWV3UXVlcnkgPSBjb250YWluZXIucXVlcnlTZWxlY3RvckFsbCgnLm1vbmFjby1zcGxpdC12aWV3MiA+IC5tb25hY28tc2Nyb2xsYWJsZS1lbGVtZW50ID4gLnNwbGl0LXZpZXctY29udGFpbmVyID4gLnNwbGl0LXZpZXctdmlldycpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh2aWV3UXVlcnkubGVuZ3RoLCAwLCAnc3BsaXQgdmlldyBzaG91bGQgaGF2ZSBubyB2aWV3cycpO1xuXG5cdFx0c2FzaFF1ZXJ5ID0gY29udGFpbmVyLnF1ZXJ5U2VsZWN0b3JBbGwoJy5tb25hY28tc3BsaXQtdmlldzIgPiAuc2FzaC1jb250YWluZXIgPiAubW9uYWNvLXNhc2gnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2FzaFF1ZXJ5Lmxlbmd0aCwgMCwgJ3NwbGl0IHZpZXcgc2hvdWxkIGhhdmUgbm8gc2FzaGVzJyk7XG5cdH0pO1xuXG5cdHRlc3QoJ2NhbGxzIHZpZXcgbWV0aG9kcyBvbiBhZGRWaWV3IGFuZCByZW1vdmVWaWV3JywgKCkgPT4ge1xuXHRcdGNvbnN0IHZpZXcgPSBzdG9yZS5hZGQobmV3IFRlc3RWaWV3KDIwLCAyMCkpO1xuXHRcdGNvbnN0IHNwbGl0dmlldyA9IHN0b3JlLmFkZChuZXcgU3BsaXRWaWV3KGNvbnRhaW5lcikpO1xuXG5cdFx0bGV0IGRpZExheW91dCA9IGZhbHNlO1xuXHRcdHN0b3JlLmFkZCh2aWV3Lm9uRGlkTGF5b3V0KCgpID0+IGRpZExheW91dCA9IHRydWUpKTtcblx0XHRzdG9yZS5hZGQodmlldy5vbkRpZEdldEVsZW1lbnQoKCkgPT4gdW5kZWZpbmVkKSk7XG5cblx0XHRzcGxpdHZpZXcuYWRkVmlldyh2aWV3LCAyMCk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodmlldy5zaXplLCAyMCwgJ3ZpZXcgaGFzIHJpZ2h0IHNpemUnKTtcblx0XHRhc3NlcnQoZGlkTGF5b3V0LCAnbGF5b3V0IGlzIGNhbGxlZCcpO1xuXHRcdGFzc2VydChkaWRMYXlvdXQsICdyZW5kZXIgaXMgY2FsbGVkJyk7XG5cdH0pO1xuXG5cdHRlc3QoJ3N0cmV0Y2hlcyB2aWV3IHRvIHZpZXdwb3J0JywgKCkgPT4ge1xuXHRcdGNvbnN0IHZpZXcgPSBzdG9yZS5hZGQobmV3IFRlc3RWaWV3KDIwLCBOdW1iZXIuUE9TSVRJVkVfSU5GSU5JVFkpKTtcblx0XHRjb25zdCBzcGxpdHZpZXcgPSBzdG9yZS5hZGQobmV3IFNwbGl0Vmlldyhjb250YWluZXIpKTtcblx0XHRzcGxpdHZpZXcubGF5b3V0KDIwMCk7XG5cblx0XHRzcGxpdHZpZXcuYWRkVmlldyh2aWV3LCAyMCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHZpZXcuc2l6ZSwgMjAwLCAndmlldyBpcyBzdHJldGNoZWQnKTtcblxuXHRcdHNwbGl0dmlldy5sYXlvdXQoMjAwKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodmlldy5zaXplLCAyMDAsICd2aWV3IHN0YXllZCB0aGUgc2FtZScpO1xuXG5cdFx0c3BsaXR2aWV3LmxheW91dCgxMDApO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh2aWV3LnNpemUsIDEwMCwgJ3ZpZXcgaXMgY29sbGFwc2VkJyk7XG5cblx0XHRzcGxpdHZpZXcubGF5b3V0KDIwKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodmlldy5zaXplLCAyMCwgJ3ZpZXcgaXMgY29sbGFwc2VkJyk7XG5cblx0XHRzcGxpdHZpZXcubGF5b3V0KDEwKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodmlldy5zaXplLCAyMCwgJ3ZpZXcgaXMgY2xhbXBlZCcpO1xuXG5cdFx0c3BsaXR2aWV3LmxheW91dCgyMDApO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh2aWV3LnNpemUsIDIwMCwgJ3ZpZXcgaXMgc3RyZXRjaGVkJyk7XG5cdH0pO1xuXG5cdHRlc3QoJ2NhbiByZXNpemUgdmlld3MnLCAoKSA9PiB7XG5cdFx0Y29uc3QgdmlldzEgPSBzdG9yZS5hZGQobmV3IFRlc3RWaWV3KDIwLCBOdW1iZXIuUE9TSVRJVkVfSU5GSU5JVFkpKTtcblx0XHRjb25zdCB2aWV3MiA9IHN0b3JlLmFkZChuZXcgVGVzdFZpZXcoMjAsIE51bWJlci5QT1NJVElWRV9JTkZJTklUWSkpO1xuXHRcdGNvbnN0IHZpZXczID0gc3RvcmUuYWRkKG5ldyBUZXN0VmlldygyMCwgTnVtYmVyLlBPU0lUSVZFX0lORklOSVRZKSk7XG5cdFx0Y29uc3Qgc3BsaXR2aWV3ID0gc3RvcmUuYWRkKG5ldyBTcGxpdFZpZXcoY29udGFpbmVyKSk7XG5cdFx0c3BsaXR2aWV3LmxheW91dCgyMDApO1xuXG5cdFx0c3BsaXR2aWV3LmFkZFZpZXcodmlldzEsIDIwKTtcblx0XHRzcGxpdHZpZXcuYWRkVmlldyh2aWV3MiwgMjApO1xuXHRcdHNwbGl0dmlldy5hZGRWaWV3KHZpZXczLCAyMCk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodmlldzEuc2l6ZSwgMTYwLCAndmlldzEgaXMgc3RyZXRjaGVkJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHZpZXcyLnNpemUsIDIwLCAndmlldzIgc2l6ZSBpcyAyMCcpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh2aWV3My5zaXplLCAyMCwgJ3ZpZXczIHNpemUgaXMgMjAnKTtcblxuXHRcdHNwbGl0dmlldy5yZXNpemVWaWV3KDEsIDQwKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh2aWV3MS5zaXplLCAxNDAsICd2aWV3MSBpcyBjb2xsYXBzZWQnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodmlldzIuc2l6ZSwgNDAsICd2aWV3MiBpcyBzdHJldGNoZWQnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodmlldzMuc2l6ZSwgMjAsICd2aWV3MyBzdGF5cyB0aGUgc2FtZScpO1xuXG5cdFx0c3BsaXR2aWV3LnJlc2l6ZVZpZXcoMCwgNzApO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHZpZXcxLnNpemUsIDcwLCAndmlldzEgaXMgY29sbGFwc2VkJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHZpZXcyLnNpemUsIDQwLCAndmlldzIgc3RheXMgdGhlIHNhbWUnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodmlldzMuc2l6ZSwgOTAsICd2aWV3MyBpcyBzdHJldGNoZWQnKTtcblxuXHRcdHNwbGl0dmlldy5yZXNpemVWaWV3KDIsIDQwKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh2aWV3MS5zaXplLCA3MCwgJ3ZpZXcxIHN0YXlzIHRoZSBzYW1lJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHZpZXcyLnNpemUsIDkwLCAndmlldzIgaXMgY29sbGFwc2VkJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHZpZXczLnNpemUsIDQwLCAndmlldzMgaXMgc3RyZXRjaGVkJyk7XG5cdH0pO1xuXG5cdHRlc3QoJ3JlYWN0cyB0byB2aWV3IGNoYW5nZXMnLCAoKSA9PiB7XG5cdFx0Y29uc3QgdmlldzEgPSBzdG9yZS5hZGQobmV3IFRlc3RWaWV3KDIwLCBOdW1iZXIuUE9TSVRJVkVfSU5GSU5JVFkpKTtcblx0XHRjb25zdCB2aWV3MiA9IHN0b3JlLmFkZChuZXcgVGVzdFZpZXcoMjAsIE51bWJlci5QT1NJVElWRV9JTkZJTklUWSkpO1xuXHRcdGNvbnN0IHZpZXczID0gc3RvcmUuYWRkKG5ldyBUZXN0VmlldygyMCwgTnVtYmVyLlBPU0lUSVZFX0lORklOSVRZKSk7XG5cdFx0Y29uc3Qgc3BsaXR2aWV3ID0gc3RvcmUuYWRkKG5ldyBTcGxpdFZpZXcoY29udGFpbmVyKSk7XG5cdFx0c3BsaXR2aWV3LmxheW91dCgyMDApO1xuXG5cdFx0c3BsaXR2aWV3LmFkZFZpZXcodmlldzEsIDIwKTtcblx0XHRzcGxpdHZpZXcuYWRkVmlldyh2aWV3MiwgMjApO1xuXHRcdHNwbGl0dmlldy5hZGRWaWV3KHZpZXczLCAyMCk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodmlldzEuc2l6ZSwgMTYwLCAndmlldzEgaXMgc3RyZXRjaGVkJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHZpZXcyLnNpemUsIDIwLCAndmlldzIgc2l6ZSBpcyAyMCcpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh2aWV3My5zaXplLCAyMCwgJ3ZpZXczIHNpemUgaXMgMjAnKTtcblxuXHRcdHZpZXcxLm1heGltdW1TaXplID0gMjA7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodmlldzEuc2l6ZSwgMjAsICd2aWV3MSBpcyBjb2xsYXBzZWQnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodmlldzIuc2l6ZSwgMjAsICd2aWV3MiBzdGF5cyB0aGUgc2FtZScpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh2aWV3My5zaXplLCAxNjAsICd2aWV3MyBpcyBzdHJldGNoZWQnKTtcblxuXHRcdHZpZXczLm1heGltdW1TaXplID0gNDA7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodmlldzEuc2l6ZSwgMjAsICd2aWV3MSBzdGF5cyB0aGUgc2FtZScpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh2aWV3Mi5zaXplLCAxNDAsICd2aWV3MiBpcyBzdHJldGNoZWQnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodmlldzMuc2l6ZSwgNDAsICd2aWV3MyBpcyBjb2xsYXBzZWQnKTtcblxuXHRcdHZpZXcyLm1heGltdW1TaXplID0gMjAwO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHZpZXcxLnNpemUsIDIwLCAndmlldzEgc3RheXMgdGhlIHNhbWUnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodmlldzIuc2l6ZSwgMTQwLCAndmlldzIgc3RheXMgdGhlIHNhbWUnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodmlldzMuc2l6ZSwgNDAsICd2aWV3MyBzdGF5cyB0aGUgc2FtZScpO1xuXG5cdFx0dmlldzMubWF4aW11bVNpemUgPSBOdW1iZXIuUE9TSVRJVkVfSU5GSU5JVFk7XG5cdFx0dmlldzMubWluaW11bVNpemUgPSAxMDA7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodmlldzEuc2l6ZSwgMjAsICd2aWV3MSBpcyBjb2xsYXBzZWQnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodmlldzIuc2l6ZSwgODAsICd2aWV3MiBpcyBjb2xsYXBzZWQnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodmlldzMuc2l6ZSwgMTAwLCAndmlldzMgaXMgc3RyZXRjaGVkJyk7XG5cdH0pO1xuXG5cdHRlc3QoJ3Nhc2hlcyBhcmUgcHJvcGVybHkgZW5hYmxlZC9kaXNhYmxlZCcsICgpID0+IHtcblx0XHRjb25zdCB2aWV3MSA9IHN0b3JlLmFkZChuZXcgVGVzdFZpZXcoMjAsIE51bWJlci5QT1NJVElWRV9JTkZJTklUWSkpO1xuXHRcdGNvbnN0IHZpZXcyID0gc3RvcmUuYWRkKG5ldyBUZXN0VmlldygyMCwgTnVtYmVyLlBPU0lUSVZFX0lORklOSVRZKSk7XG5cdFx0Y29uc3QgdmlldzMgPSBzdG9yZS5hZGQobmV3IFRlc3RWaWV3KDIwLCBOdW1iZXIuUE9TSVRJVkVfSU5GSU5JVFkpKTtcblx0XHRjb25zdCBzcGxpdHZpZXcgPSBzdG9yZS5hZGQobmV3IFNwbGl0Vmlldyhjb250YWluZXIpKTtcblx0XHRzcGxpdHZpZXcubGF5b3V0KDIwMCk7XG5cblx0XHRzcGxpdHZpZXcuYWRkVmlldyh2aWV3MSwgU2l6aW5nLkRpc3RyaWJ1dGUpO1xuXHRcdHNwbGl0dmlldy5hZGRWaWV3KHZpZXcyLCBTaXppbmcuRGlzdHJpYnV0ZSk7XG5cdFx0c3BsaXR2aWV3LmFkZFZpZXcodmlldzMsIFNpemluZy5EaXN0cmlidXRlKTtcblxuXHRcdGNvbnN0IHNhc2hlcyA9IGdldFNhc2hlcyhzcGxpdHZpZXcpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzYXNoZXMubGVuZ3RoLCAyLCAndGhlcmUgYXJlIHR3byBzYXNoZXMnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2FzaGVzWzBdLnN0YXRlLCBTYXNoU3RhdGUuRW5hYmxlZCwgJ2ZpcnN0IHNhc2ggaXMgZW5hYmxlZCcpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzYXNoZXNbMV0uc3RhdGUsIFNhc2hTdGF0ZS5FbmFibGVkLCAnc2Vjb25kIHNhc2ggaXMgZW5hYmxlZCcpO1xuXG5cdFx0c3BsaXR2aWV3LmxheW91dCg2MCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNhc2hlc1swXS5zdGF0ZSwgU2FzaFN0YXRlLkRpc2FibGVkLCAnZmlyc3Qgc2FzaCBpcyBkaXNhYmxlZCcpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzYXNoZXNbMV0uc3RhdGUsIFNhc2hTdGF0ZS5EaXNhYmxlZCwgJ3NlY29uZCBzYXNoIGlzIGRpc2FibGVkJyk7XG5cblx0XHRzcGxpdHZpZXcubGF5b3V0KDIwKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2FzaGVzWzBdLnN0YXRlLCBTYXNoU3RhdGUuRGlzYWJsZWQsICdmaXJzdCBzYXNoIGlzIGRpc2FibGVkJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNhc2hlc1sxXS5zdGF0ZSwgU2FzaFN0YXRlLkRpc2FibGVkLCAnc2Vjb25kIHNhc2ggaXMgZGlzYWJsZWQnKTtcblxuXHRcdHNwbGl0dmlldy5sYXlvdXQoMjAwKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2FzaGVzWzBdLnN0YXRlLCBTYXNoU3RhdGUuRW5hYmxlZCwgJ2ZpcnN0IHNhc2ggaXMgZW5hYmxlZCcpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzYXNoZXNbMV0uc3RhdGUsIFNhc2hTdGF0ZS5FbmFibGVkLCAnc2Vjb25kIHNhc2ggaXMgZW5hYmxlZCcpO1xuXG5cdFx0dmlldzEubWF4aW11bVNpemUgPSAyMDtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2FzaGVzWzBdLnN0YXRlLCBTYXNoU3RhdGUuRGlzYWJsZWQsICdmaXJzdCBzYXNoIGlzIGRpc2FibGVkJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNhc2hlc1sxXS5zdGF0ZSwgU2FzaFN0YXRlLkVuYWJsZWQsICdzZWNvbmQgc2FzaCBpcyBlbmFibGVkJyk7XG5cblx0XHR2aWV3Mi5tYXhpbXVtU2l6ZSA9IDIwO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzYXNoZXNbMF0uc3RhdGUsIFNhc2hTdGF0ZS5EaXNhYmxlZCwgJ2ZpcnN0IHNhc2ggaXMgZGlzYWJsZWQnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2FzaGVzWzFdLnN0YXRlLCBTYXNoU3RhdGUuRGlzYWJsZWQsICdzZWNvbmQgc2FzaCBpcyBkaXNhYmxlZCcpO1xuXG5cdFx0dmlldzEubWF4aW11bVNpemUgPSAzMDA7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNhc2hlc1swXS5zdGF0ZSwgU2FzaFN0YXRlLkF0TWluaW11bSwgJ2ZpcnN0IHNhc2ggaXMgZW5hYmxlZCcpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzYXNoZXNbMV0uc3RhdGUsIFNhc2hTdGF0ZS5BdE1pbmltdW0sICdzZWNvbmQgc2FzaCBpcyBlbmFibGVkJyk7XG5cblx0XHR2aWV3Mi5tYXhpbXVtU2l6ZSA9IDIwMDtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2FzaGVzWzBdLnN0YXRlLCBTYXNoU3RhdGUuQXRNaW5pbXVtLCAnZmlyc3Qgc2FzaCBpcyBlbmFibGVkJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNhc2hlc1sxXS5zdGF0ZSwgU2FzaFN0YXRlLkF0TWluaW11bSwgJ3NlY29uZCBzYXNoIGlzIGVuYWJsZWQnKTtcblxuXHRcdHNwbGl0dmlldy5yZXNpemVWaWV3KDAsIDQwKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2FzaGVzWzBdLnN0YXRlLCBTYXNoU3RhdGUuRW5hYmxlZCwgJ2ZpcnN0IHNhc2ggaXMgZW5hYmxlZCcpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzYXNoZXNbMV0uc3RhdGUsIFNhc2hTdGF0ZS5FbmFibGVkLCAnc2Vjb25kIHNhc2ggaXMgZW5hYmxlZCcpO1xuXHR9KTtcblxuXHR0ZXN0KCdpc3N1ZSAjMzU0OTcnLCAoKSA9PiB7XG5cdFx0Y29uc3QgdmlldzEgPSBzdG9yZS5hZGQobmV3IFRlc3RWaWV3KDE2MCwgTnVtYmVyLlBPU0lUSVZFX0lORklOSVRZKSk7XG5cdFx0Y29uc3QgdmlldzIgPSBzdG9yZS5hZGQobmV3IFRlc3RWaWV3KDY2LCA2NikpO1xuXG5cdFx0Y29uc3Qgc3BsaXR2aWV3ID0gc3RvcmUuYWRkKG5ldyBTcGxpdFZpZXcoY29udGFpbmVyKSk7XG5cdFx0c3BsaXR2aWV3LmxheW91dCg5ODYpO1xuXG5cdFx0c3BsaXR2aWV3LmFkZFZpZXcodmlldzEsIDE0MiwgMCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHZpZXcxLnNpemUsIDk4NiwgJ2ZpcnN0IHZpZXcgaXMgc3RyZXRjaGVkJyk7XG5cblx0XHRzdG9yZS5hZGQodmlldzIub25EaWRHZXRFbGVtZW50KCgpID0+IHtcblx0XHRcdGFzc2VydC50aHJvd3MoKCkgPT4gc3BsaXR2aWV3LnJlc2l6ZVZpZXcoMSwgOTIyKSk7XG5cdFx0XHRhc3NlcnQudGhyb3dzKCgpID0+IHNwbGl0dmlldy5yZXNpemVWaWV3KDEsIDkyMikpO1xuXHRcdH0pKTtcblxuXHRcdHNwbGl0dmlldy5hZGRWaWV3KHZpZXcyLCA2NiwgMCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHZpZXcyLnNpemUsIDY2LCAnc2Vjb25kIHZpZXcgaXMgZml4ZWQnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodmlldzEuc2l6ZSwgOTg2IC0gNjYsICdmaXJzdCB2aWV3IGlzIGNvbGxhcHNlZCcpO1xuXG5cdFx0Y29uc3Qgdmlld0NvbnRhaW5lcnMgPSBjb250YWluZXIucXVlcnlTZWxlY3RvckFsbCgnLnNwbGl0LXZpZXctdmlldycpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh2aWV3Q29udGFpbmVycy5sZW5ndGgsIDIsICd0aGVyZSBhcmUgdHdvIHZpZXcgY29udGFpbmVycycpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCgodmlld0NvbnRhaW5lcnMuaXRlbSgwKSBhcyBIVE1MRWxlbWVudCkuc3R5bGUuaGVpZ2h0LCAnNjZweCcsICdzZWNvbmQgdmlldyBjb250YWluZXIgaXMgNjZweCcpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbDxzdHJpbmc+KCh2aWV3Q29udGFpbmVycy5pdGVtKDEpIGFzIEhUTUxFbGVtZW50KS5zdHlsZS5oZWlnaHQsIGAkezk4NiAtIDY2fXB4YCwgJ2ZpcnN0IHZpZXcgY29udGFpbmVyIGlzIDY2cHgnKTtcblx0fSk7XG5cblx0dGVzdCgnYXV0b21hdGljIHNpemUgZGlzdHJpYnV0aW9uJywgKCkgPT4ge1xuXHRcdGNvbnN0IHZpZXcxID0gc3RvcmUuYWRkKG5ldyBUZXN0VmlldygyMCwgTnVtYmVyLlBPU0lUSVZFX0lORklOSVRZKSk7XG5cdFx0Y29uc3QgdmlldzIgPSBzdG9yZS5hZGQobmV3IFRlc3RWaWV3KDIwLCBOdW1iZXIuUE9TSVRJVkVfSU5GSU5JVFkpKTtcblx0XHRjb25zdCB2aWV3MyA9IHN0b3JlLmFkZChuZXcgVGVzdFZpZXcoMjAsIE51bWJlci5QT1NJVElWRV9JTkZJTklUWSkpO1xuXHRcdGNvbnN0IHNwbGl0dmlldyA9IHN0b3JlLmFkZChuZXcgU3BsaXRWaWV3KGNvbnRhaW5lcikpO1xuXHRcdHNwbGl0dmlldy5sYXlvdXQoMjAwKTtcblxuXHRcdHNwbGl0dmlldy5hZGRWaWV3KHZpZXcxLCBTaXppbmcuRGlzdHJpYnV0ZSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHZpZXcxLnNpemUsIDIwMCk7XG5cblx0XHRzcGxpdHZpZXcuYWRkVmlldyh2aWV3MiwgNTApO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoW3ZpZXcxLnNpemUsIHZpZXcyLnNpemVdLCBbMTUwLCA1MF0pO1xuXG5cdFx0c3BsaXR2aWV3LmFkZFZpZXcodmlldzMsIFNpemluZy5EaXN0cmlidXRlKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKFt2aWV3MS5zaXplLCB2aWV3Mi5zaXplLCB2aWV3My5zaXplXSwgWzY2LCA2NiwgNjhdKTtcblxuXHRcdHNwbGl0dmlldy5yZW1vdmVWaWV3KDEsIFNpemluZy5EaXN0cmlidXRlKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKFt2aWV3MS5zaXplLCB2aWV3My5zaXplXSwgWzEwMCwgMTAwXSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2FkZCB2aWV3cyBiZWZvcmUgbGF5b3V0JywgKCkgPT4ge1xuXHRcdGNvbnN0IHZpZXcxID0gc3RvcmUuYWRkKG5ldyBUZXN0VmlldygyMCwgTnVtYmVyLlBPU0lUSVZFX0lORklOSVRZKSk7XG5cdFx0Y29uc3QgdmlldzIgPSBzdG9yZS5hZGQobmV3IFRlc3RWaWV3KDIwLCBOdW1iZXIuUE9TSVRJVkVfSU5GSU5JVFkpKTtcblx0XHRjb25zdCB2aWV3MyA9IHN0b3JlLmFkZChuZXcgVGVzdFZpZXcoMjAsIE51bWJlci5QT1NJVElWRV9JTkZJTklUWSkpO1xuXHRcdGNvbnN0IHNwbGl0dmlldyA9IHN0b3JlLmFkZChuZXcgU3BsaXRWaWV3KGNvbnRhaW5lcikpO1xuXG5cdFx0c3BsaXR2aWV3LmFkZFZpZXcodmlldzEsIDEwMCk7XG5cdFx0c3BsaXR2aWV3LmFkZFZpZXcodmlldzIsIDc1KTtcblx0XHRzcGxpdHZpZXcuYWRkVmlldyh2aWV3MywgMjUpO1xuXG5cdFx0c3BsaXR2aWV3LmxheW91dCgyMDApO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoW3ZpZXcxLnNpemUsIHZpZXcyLnNpemUsIHZpZXczLnNpemVdLCBbNjcsIDY3LCA2Nl0pO1xuXHR9KTtcblxuXHR0ZXN0KCdzcGxpdCBzaXppbmcnLCAoKSA9PiB7XG5cdFx0Y29uc3QgdmlldzEgPSBzdG9yZS5hZGQobmV3IFRlc3RWaWV3KDIwLCBOdW1iZXIuUE9TSVRJVkVfSU5GSU5JVFkpKTtcblx0XHRjb25zdCB2aWV3MiA9IHN0b3JlLmFkZChuZXcgVGVzdFZpZXcoMjAsIE51bWJlci5QT1NJVElWRV9JTkZJTklUWSkpO1xuXHRcdGNvbnN0IHZpZXczID0gc3RvcmUuYWRkKG5ldyBUZXN0VmlldygyMCwgTnVtYmVyLlBPU0lUSVZFX0lORklOSVRZKSk7XG5cdFx0Y29uc3Qgc3BsaXR2aWV3ID0gc3RvcmUuYWRkKG5ldyBTcGxpdFZpZXcoY29udGFpbmVyKSk7XG5cdFx0c3BsaXR2aWV3LmxheW91dCgyMDApO1xuXG5cdFx0c3BsaXR2aWV3LmFkZFZpZXcodmlldzEsIFNpemluZy5EaXN0cmlidXRlKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodmlldzEuc2l6ZSwgMjAwKTtcblxuXHRcdHNwbGl0dmlldy5hZGRWaWV3KHZpZXcyLCBTaXppbmcuU3BsaXQoMCkpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoW3ZpZXcxLnNpemUsIHZpZXcyLnNpemVdLCBbMTAwLCAxMDBdKTtcblxuXHRcdHNwbGl0dmlldy5hZGRWaWV3KHZpZXczLCBTaXppbmcuU3BsaXQoMSkpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoW3ZpZXcxLnNpemUsIHZpZXcyLnNpemUsIHZpZXczLnNpemVdLCBbMTAwLCA1MCwgNTBdKTtcblx0fSk7XG5cblx0dGVzdCgnc3BsaXQgc2l6aW5nIDInLCAoKSA9PiB7XG5cdFx0Y29uc3QgdmlldzEgPSBzdG9yZS5hZGQobmV3IFRlc3RWaWV3KDIwLCBOdW1iZXIuUE9TSVRJVkVfSU5GSU5JVFkpKTtcblx0XHRjb25zdCB2aWV3MiA9IHN0b3JlLmFkZChuZXcgVGVzdFZpZXcoMjAsIE51bWJlci5QT1NJVElWRV9JTkZJTklUWSkpO1xuXHRcdGNvbnN0IHZpZXczID0gc3RvcmUuYWRkKG5ldyBUZXN0VmlldygyMCwgTnVtYmVyLlBPU0lUSVZFX0lORklOSVRZKSk7XG5cdFx0Y29uc3Qgc3BsaXR2aWV3ID0gc3RvcmUuYWRkKG5ldyBTcGxpdFZpZXcoY29udGFpbmVyKSk7XG5cdFx0c3BsaXR2aWV3LmxheW91dCgyMDApO1xuXG5cdFx0c3BsaXR2aWV3LmFkZFZpZXcodmlldzEsIFNpemluZy5EaXN0cmlidXRlKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodmlldzEuc2l6ZSwgMjAwKTtcblxuXHRcdHNwbGl0dmlldy5hZGRWaWV3KHZpZXcyLCBTaXppbmcuU3BsaXQoMCkpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoW3ZpZXcxLnNpemUsIHZpZXcyLnNpemVdLCBbMTAwLCAxMDBdKTtcblxuXHRcdHNwbGl0dmlldy5hZGRWaWV3KHZpZXczLCBTaXppbmcuU3BsaXQoMCkpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoW3ZpZXcxLnNpemUsIHZpZXcyLnNpemUsIHZpZXczLnNpemVdLCBbNTAsIDEwMCwgNTBdKTtcblx0fSk7XG5cblx0dGVzdCgncHJvcG9ydGlvbmFsIGxheW91dCcsICgpID0+IHtcblx0XHRjb25zdCB2aWV3MSA9IHN0b3JlLmFkZChuZXcgVGVzdFZpZXcoMjAsIE51bWJlci5QT1NJVElWRV9JTkZJTklUWSkpO1xuXHRcdGNvbnN0IHZpZXcyID0gc3RvcmUuYWRkKG5ldyBUZXN0VmlldygyMCwgTnVtYmVyLlBPU0lUSVZFX0lORklOSVRZKSk7XG5cdFx0Y29uc3Qgc3BsaXR2aWV3ID0gc3RvcmUuYWRkKG5ldyBTcGxpdFZpZXcoY29udGFpbmVyKSk7XG5cdFx0c3BsaXR2aWV3LmxheW91dCgyMDApO1xuXG5cdFx0c3BsaXR2aWV3LmFkZFZpZXcodmlldzEsIFNpemluZy5EaXN0cmlidXRlKTtcblx0XHRzcGxpdHZpZXcuYWRkVmlldyh2aWV3MiwgU2l6aW5nLkRpc3RyaWJ1dGUpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoW3ZpZXcxLnNpemUsIHZpZXcyLnNpemVdLCBbMTAwLCAxMDBdKTtcblxuXHRcdHNwbGl0dmlldy5sYXlvdXQoMTAwKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKFt2aWV3MS5zaXplLCB2aWV3Mi5zaXplXSwgWzUwLCA1MF0pO1xuXHR9KTtcblxuXHR0ZXN0KCdkaXNhYmxlIHByb3BvcnRpb25hbCBsYXlvdXQnLCAoKSA9PiB7XG5cdFx0Y29uc3QgdmlldzEgPSBzdG9yZS5hZGQobmV3IFRlc3RWaWV3KDIwLCBOdW1iZXIuUE9TSVRJVkVfSU5GSU5JVFkpKTtcblx0XHRjb25zdCB2aWV3MiA9IHN0b3JlLmFkZChuZXcgVGVzdFZpZXcoMjAsIE51bWJlci5QT1NJVElWRV9JTkZJTklUWSkpO1xuXHRcdGNvbnN0IHNwbGl0dmlldyA9IHN0b3JlLmFkZChuZXcgU3BsaXRWaWV3KGNvbnRhaW5lciwgeyBwcm9wb3J0aW9uYWxMYXlvdXQ6IGZhbHNlIH0pKTtcblx0XHRzcGxpdHZpZXcubGF5b3V0KDIwMCk7XG5cblx0XHRzcGxpdHZpZXcuYWRkVmlldyh2aWV3MSwgU2l6aW5nLkRpc3RyaWJ1dGUpO1xuXHRcdHNwbGl0dmlldy5hZGRWaWV3KHZpZXcyLCBTaXppbmcuRGlzdHJpYnV0ZSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChbdmlldzEuc2l6ZSwgdmlldzIuc2l6ZV0sIFsxMDAsIDEwMF0pO1xuXG5cdFx0c3BsaXR2aWV3LmxheW91dCgxMDApO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoW3ZpZXcxLnNpemUsIHZpZXcyLnNpemVdLCBbODAsIDIwXSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2hpZ2ggbGF5b3V0IHByaW9yaXR5JywgKCkgPT4ge1xuXHRcdGNvbnN0IHZpZXcxID0gc3RvcmUuYWRkKG5ldyBUZXN0VmlldygyMCwgTnVtYmVyLlBPU0lUSVZFX0lORklOSVRZKSk7XG5cdFx0Y29uc3QgdmlldzIgPSBzdG9yZS5hZGQobmV3IFRlc3RWaWV3KDIwLCBOdW1iZXIuUE9TSVRJVkVfSU5GSU5JVFksIExheW91dFByaW9yaXR5LkhpZ2gpKTtcblx0XHRjb25zdCB2aWV3MyA9IHN0b3JlLmFkZChuZXcgVGVzdFZpZXcoMjAsIE51bWJlci5QT1NJVElWRV9JTkZJTklUWSkpO1xuXHRcdGNvbnN0IHNwbGl0dmlldyA9IHN0b3JlLmFkZChuZXcgU3BsaXRWaWV3KGNvbnRhaW5lciwgeyBwcm9wb3J0aW9uYWxMYXlvdXQ6IGZhbHNlIH0pKTtcblx0XHRzcGxpdHZpZXcubGF5b3V0KDIwMCk7XG5cblx0XHRzcGxpdHZpZXcuYWRkVmlldyh2aWV3MSwgU2l6aW5nLkRpc3RyaWJ1dGUpO1xuXHRcdHNwbGl0dmlldy5hZGRWaWV3KHZpZXcyLCBTaXppbmcuRGlzdHJpYnV0ZSk7XG5cdFx0c3BsaXR2aWV3LmFkZFZpZXcodmlldzMsIFNpemluZy5EaXN0cmlidXRlKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKFt2aWV3MS5zaXplLCB2aWV3Mi5zaXplLCB2aWV3My5zaXplXSwgWzY2LCA2OCwgNjZdKTtcblxuXHRcdHNwbGl0dmlldy5sYXlvdXQoMTgwKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKFt2aWV3MS5zaXplLCB2aWV3Mi5zaXplLCB2aWV3My5zaXplXSwgWzY2LCA0OCwgNjZdKTtcblxuXHRcdHNwbGl0dmlldy5sYXlvdXQoMTI0KTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKFt2aWV3MS5zaXplLCB2aWV3Mi5zaXplLCB2aWV3My5zaXplXSwgWzY2LCAyMCwgMzhdKTtcblxuXHRcdHNwbGl0dmlldy5sYXlvdXQoNjApO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoW3ZpZXcxLnNpemUsIHZpZXcyLnNpemUsIHZpZXczLnNpemVdLCBbMjAsIDIwLCAyMF0pO1xuXG5cdFx0c3BsaXR2aWV3LmxheW91dCgyMDApO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoW3ZpZXcxLnNpemUsIHZpZXcyLnNpemUsIHZpZXczLnNpemVdLCBbMjAsIDE2MCwgMjBdKTtcblx0fSk7XG5cblx0dGVzdCgnbG93IGxheW91dCBwcmlvcml0eScsICgpID0+IHtcblx0XHRjb25zdCB2aWV3MSA9IHN0b3JlLmFkZChuZXcgVGVzdFZpZXcoMjAsIE51bWJlci5QT1NJVElWRV9JTkZJTklUWSkpO1xuXHRcdGNvbnN0IHZpZXcyID0gc3RvcmUuYWRkKG5ldyBUZXN0VmlldygyMCwgTnVtYmVyLlBPU0lUSVZFX0lORklOSVRZKSk7XG5cdFx0Y29uc3QgdmlldzMgPSBzdG9yZS5hZGQobmV3IFRlc3RWaWV3KDIwLCBOdW1iZXIuUE9TSVRJVkVfSU5GSU5JVFksIExheW91dFByaW9yaXR5LkxvdykpO1xuXHRcdGNvbnN0IHNwbGl0dmlldyA9IHN0b3JlLmFkZChuZXcgU3BsaXRWaWV3KGNvbnRhaW5lciwgeyBwcm9wb3J0aW9uYWxMYXlvdXQ6IGZhbHNlIH0pKTtcblx0XHRzcGxpdHZpZXcubGF5b3V0KDIwMCk7XG5cblx0XHRzcGxpdHZpZXcuYWRkVmlldyh2aWV3MSwgU2l6aW5nLkRpc3RyaWJ1dGUpO1xuXHRcdHNwbGl0dmlldy5hZGRWaWV3KHZpZXcyLCBTaXppbmcuRGlzdHJpYnV0ZSk7XG5cdFx0c3BsaXR2aWV3LmFkZFZpZXcodmlldzMsIFNpemluZy5EaXN0cmlidXRlKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKFt2aWV3MS5zaXplLCB2aWV3Mi5zaXplLCB2aWV3My5zaXplXSwgWzY2LCA2OCwgNjZdKTtcblxuXHRcdHNwbGl0dmlldy5sYXlvdXQoMTgwKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKFt2aWV3MS5zaXplLCB2aWV3Mi5zaXplLCB2aWV3My5zaXplXSwgWzY2LCA0OCwgNjZdKTtcblxuXHRcdHNwbGl0dmlldy5sYXlvdXQoMTMyKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKFt2aWV3MS5zaXplLCB2aWV3Mi5zaXplLCB2aWV3My5zaXplXSwgWzQ2LCAyMCwgNjZdKTtcblxuXHRcdHNwbGl0dmlldy5sYXlvdXQoNjApO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoW3ZpZXcxLnNpemUsIHZpZXcyLnNpemUsIHZpZXczLnNpemVdLCBbMjAsIDIwLCAyMF0pO1xuXG5cdFx0c3BsaXR2aWV3LmxheW91dCgyMDApO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoW3ZpZXcxLnNpemUsIHZpZXcyLnNpemUsIHZpZXczLnNpemVdLCBbMjAsIDE2MCwgMjBdKTtcblx0fSk7XG5cblx0dGVzdCgnY29udGV4dCBwcm9wYWdhdGVzIHRvIHZpZXdzJywgKCkgPT4ge1xuXHRcdGNvbnN0IHZpZXcxID0gc3RvcmUuYWRkKG5ldyBUZXN0VmlldygyMCwgTnVtYmVyLlBPU0lUSVZFX0lORklOSVRZKSk7XG5cdFx0Y29uc3QgdmlldzIgPSBzdG9yZS5hZGQobmV3IFRlc3RWaWV3KDIwLCBOdW1iZXIuUE9TSVRJVkVfSU5GSU5JVFkpKTtcblx0XHRjb25zdCB2aWV3MyA9IHN0b3JlLmFkZChuZXcgVGVzdFZpZXcoMjAsIE51bWJlci5QT1NJVElWRV9JTkZJTklUWSwgTGF5b3V0UHJpb3JpdHkuTG93KSk7XG5cdFx0Y29uc3Qgc3BsaXR2aWV3ID0gc3RvcmUuYWRkKG5ldyBTcGxpdFZpZXc8bnVtYmVyPihjb250YWluZXIsIHsgcHJvcG9ydGlvbmFsTGF5b3V0OiBmYWxzZSB9KSk7XG5cdFx0c3BsaXR2aWV3LmxheW91dCgyMDApO1xuXG5cdFx0c3BsaXR2aWV3LmFkZFZpZXcodmlldzEsIFNpemluZy5EaXN0cmlidXRlKTtcblx0XHRzcGxpdHZpZXcuYWRkVmlldyh2aWV3MiwgU2l6aW5nLkRpc3RyaWJ1dGUpO1xuXHRcdHNwbGl0dmlldy5hZGRWaWV3KHZpZXczLCBTaXppbmcuRGlzdHJpYnV0ZSk7XG5cblx0XHRzcGxpdHZpZXcubGF5b3V0KDIwMCwgMTAwKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKFt2aWV3MS5vcnRob2dvbmFsU2l6ZSwgdmlldzIub3J0aG9nb25hbFNpemUsIHZpZXczLm9ydGhvZ29uYWxTaXplXSwgWzEwMCwgMTAwLCAxMDBdKTtcblx0fSk7XG59KTtcbiJdLAogICJtYXBwaW5ncyI6ICJBQUtBLE9BQU8sWUFBWTtBQUNuQixTQUFlLGlCQUFpQjtBQUNoQyxTQUFnQixnQkFBZ0IsUUFBUSxpQkFBaUI7QUFDekQsU0FBUyxlQUFlO0FBQ3hCLFNBQVMsK0NBQStDO0FBRXhELE1BQU0sU0FBa0M7QUFBQSxFQTJCdkMsWUFDUyxjQUNBLGNBQ0MsV0FBMkIsZUFBZSxRQUNsRDtBQUhPO0FBQ0E7QUFDQztBQTVCVixTQUFpQixlQUFlLElBQUksUUFBNEI7QUFDaEUsU0FBUyxjQUFjLEtBQUssYUFBYTtBQVF6QyxTQUFRLFdBQXdCLFNBQVMsY0FBYyxLQUFLO0FBRzVELFNBQWlCLG1CQUFtQixJQUFJLFFBQWM7QUFDdEQsU0FBUyxrQkFBa0IsS0FBSyxpQkFBaUI7QUFFakQsU0FBUSxRQUFRO0FBRWhCLFNBQVEsa0JBQXNDO0FBRTlDLFNBQWlCLGVBQWUsSUFBSSxRQUE4RDtBQUNsRyxTQUFTLGNBQWMsS0FBSyxhQUFhO0FBRXpDLFNBQWlCLGNBQWMsSUFBSSxRQUFjO0FBQ2pELFNBQVMsYUFBYSxLQUFLLFlBQVk7QUFPdEMsV0FB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
