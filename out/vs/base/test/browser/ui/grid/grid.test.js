import assert from "assert";
import { createSerializedGrid, Direction, getRelativeLocation, Grid, isGridBranchNode, Orientation, sanitizeGridNodeDescriptor, SerializableGrid, Sizing } from "../../../../browser/ui/grid/grid.js";
import { Event } from "../../../../common/event.js";
import { deepClone } from "../../../../common/objects.js";
import { nodesToArrays, TestView } from "./util.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../common/utils.js";
suite("Grid", function() {
  const store = ensureNoDisposablesAreLeakedInTestSuite();
  let container;
  setup(function() {
    container = document.createElement("div");
    container.style.position = "absolute";
    container.style.width = `${800}px`;
    container.style.height = `${600}px`;
  });
  test("getRelativeLocation", () => {
    assert.deepStrictEqual(getRelativeLocation(Orientation.VERTICAL, [0], Direction.Up), [0]);
    assert.deepStrictEqual(getRelativeLocation(Orientation.VERTICAL, [0], Direction.Down), [1]);
    assert.deepStrictEqual(getRelativeLocation(Orientation.VERTICAL, [0], Direction.Left), [0, 0]);
    assert.deepStrictEqual(getRelativeLocation(Orientation.VERTICAL, [0], Direction.Right), [0, 1]);
    assert.deepStrictEqual(getRelativeLocation(Orientation.HORIZONTAL, [0], Direction.Up), [0, 0]);
    assert.deepStrictEqual(getRelativeLocation(Orientation.HORIZONTAL, [0], Direction.Down), [0, 1]);
    assert.deepStrictEqual(getRelativeLocation(Orientation.HORIZONTAL, [0], Direction.Left), [0]);
    assert.deepStrictEqual(getRelativeLocation(Orientation.HORIZONTAL, [0], Direction.Right), [1]);
    assert.deepStrictEqual(getRelativeLocation(Orientation.VERTICAL, [4], Direction.Up), [4]);
    assert.deepStrictEqual(getRelativeLocation(Orientation.VERTICAL, [4], Direction.Down), [5]);
    assert.deepStrictEqual(getRelativeLocation(Orientation.VERTICAL, [4], Direction.Left), [4, 0]);
    assert.deepStrictEqual(getRelativeLocation(Orientation.VERTICAL, [4], Direction.Right), [4, 1]);
    assert.deepStrictEqual(getRelativeLocation(Orientation.VERTICAL, [0, 0], Direction.Up), [0, 0, 0]);
    assert.deepStrictEqual(getRelativeLocation(Orientation.VERTICAL, [0, 0], Direction.Down), [0, 0, 1]);
    assert.deepStrictEqual(getRelativeLocation(Orientation.VERTICAL, [0, 0], Direction.Left), [0, 0]);
    assert.deepStrictEqual(getRelativeLocation(Orientation.VERTICAL, [0, 0], Direction.Right), [0, 1]);
    assert.deepStrictEqual(getRelativeLocation(Orientation.VERTICAL, [1, 2], Direction.Up), [1, 2, 0]);
    assert.deepStrictEqual(getRelativeLocation(Orientation.VERTICAL, [1, 2], Direction.Down), [1, 2, 1]);
    assert.deepStrictEqual(getRelativeLocation(Orientation.VERTICAL, [1, 2], Direction.Left), [1, 2]);
    assert.deepStrictEqual(getRelativeLocation(Orientation.VERTICAL, [1, 2], Direction.Right), [1, 3]);
    assert.deepStrictEqual(getRelativeLocation(Orientation.VERTICAL, [1, 2, 3], Direction.Up), [1, 2, 3]);
    assert.deepStrictEqual(getRelativeLocation(Orientation.VERTICAL, [1, 2, 3], Direction.Down), [1, 2, 4]);
    assert.deepStrictEqual(getRelativeLocation(Orientation.VERTICAL, [1, 2, 3], Direction.Left), [1, 2, 3, 0]);
    assert.deepStrictEqual(getRelativeLocation(Orientation.VERTICAL, [1, 2, 3], Direction.Right), [1, 2, 3, 1]);
  });
  test("empty", () => {
    const view1 = store.add(new TestView(100, Number.MAX_VALUE, 100, Number.MAX_VALUE));
    const gridview = store.add(new Grid(view1));
    container.appendChild(gridview.element);
    gridview.layout(800, 600);
    assert.deepStrictEqual(view1.size, [800, 600]);
  });
  test("two views vertically", function() {
    const view1 = store.add(new TestView(50, Number.MAX_VALUE, 50, Number.MAX_VALUE));
    const grid = store.add(new Grid(view1));
    container.appendChild(grid.element);
    grid.layout(800, 600);
    assert.deepStrictEqual(view1.size, [800, 600]);
    const view2 = store.add(new TestView(50, Number.MAX_VALUE, 50, Number.MAX_VALUE));
    grid.addView(view2, 200, view1, Direction.Up);
    assert.deepStrictEqual(view1.size, [800, 400]);
    assert.deepStrictEqual(view2.size, [800, 200]);
  });
  test("two views horizontally", function() {
    const view1 = store.add(new TestView(50, Number.MAX_VALUE, 50, Number.MAX_VALUE));
    const grid = store.add(new Grid(view1));
    container.appendChild(grid.element);
    grid.layout(800, 600);
    assert.deepStrictEqual(view1.size, [800, 600]);
    const view2 = store.add(new TestView(50, Number.MAX_VALUE, 50, Number.MAX_VALUE));
    grid.addView(view2, 300, view1, Direction.Right);
    assert.deepStrictEqual(view1.size, [500, 600]);
    assert.deepStrictEqual(view2.size, [300, 600]);
  });
  test("simple layout", function() {
    const view1 = store.add(new TestView(50, Number.MAX_VALUE, 50, Number.MAX_VALUE));
    const grid = store.add(new Grid(view1));
    container.appendChild(grid.element);
    grid.layout(800, 600);
    assert.deepStrictEqual(view1.size, [800, 600]);
    const view2 = store.add(new TestView(50, Number.MAX_VALUE, 50, Number.MAX_VALUE));
    grid.addView(view2, 200, view1, Direction.Up);
    assert.deepStrictEqual(view1.size, [800, 400]);
    assert.deepStrictEqual(view2.size, [800, 200]);
    const view3 = store.add(new TestView(50, Number.MAX_VALUE, 50, Number.MAX_VALUE));
    grid.addView(view3, 200, view1, Direction.Right);
    assert.deepStrictEqual(view1.size, [600, 400]);
    assert.deepStrictEqual(view2.size, [800, 200]);
    assert.deepStrictEqual(view3.size, [200, 400]);
    const view4 = store.add(new TestView(50, Number.MAX_VALUE, 50, Number.MAX_VALUE));
    grid.addView(view4, 200, view2, Direction.Left);
    assert.deepStrictEqual(view1.size, [600, 400]);
    assert.deepStrictEqual(view2.size, [600, 200]);
    assert.deepStrictEqual(view3.size, [200, 400]);
    assert.deepStrictEqual(view4.size, [200, 200]);
    const view5 = store.add(new TestView(50, Number.MAX_VALUE, 50, Number.MAX_VALUE));
    grid.addView(view5, 100, view1, Direction.Down);
    assert.deepStrictEqual(view1.size, [600, 300]);
    assert.deepStrictEqual(view2.size, [600, 200]);
    assert.deepStrictEqual(view3.size, [200, 400]);
    assert.deepStrictEqual(view4.size, [200, 200]);
    assert.deepStrictEqual(view5.size, [600, 100]);
  });
  test("another simple layout with automatic size distribution", function() {
    const view1 = store.add(new TestView(50, Number.MAX_VALUE, 50, Number.MAX_VALUE));
    const grid = store.add(new Grid(view1));
    container.appendChild(grid.element);
    grid.layout(800, 600);
    assert.deepStrictEqual(view1.size, [800, 600]);
    const view2 = store.add(new TestView(50, Number.MAX_VALUE, 50, Number.MAX_VALUE));
    grid.addView(view2, Sizing.Distribute, view1, Direction.Left);
    assert.deepStrictEqual(view1.size, [400, 600]);
    assert.deepStrictEqual(view2.size, [400, 600]);
    const view3 = store.add(new TestView(50, Number.MAX_VALUE, 50, Number.MAX_VALUE));
    grid.addView(view3, Sizing.Distribute, view1, Direction.Right);
    assert.deepStrictEqual(view1.size, [266, 600]);
    assert.deepStrictEqual(view2.size, [266, 600]);
    assert.deepStrictEqual(view3.size, [268, 600]);
    const view4 = store.add(new TestView(50, Number.MAX_VALUE, 50, Number.MAX_VALUE));
    grid.addView(view4, Sizing.Distribute, view2, Direction.Down);
    assert.deepStrictEqual(view1.size, [266, 600]);
    assert.deepStrictEqual(view2.size, [266, 300]);
    assert.deepStrictEqual(view3.size, [268, 600]);
    assert.deepStrictEqual(view4.size, [266, 300]);
    const view5 = store.add(new TestView(50, Number.MAX_VALUE, 50, Number.MAX_VALUE));
    grid.addView(view5, Sizing.Distribute, view3, Direction.Up);
    assert.deepStrictEqual(view1.size, [266, 600]);
    assert.deepStrictEqual(view2.size, [266, 300]);
    assert.deepStrictEqual(view3.size, [268, 300]);
    assert.deepStrictEqual(view4.size, [266, 300]);
    assert.deepStrictEqual(view5.size, [268, 300]);
    const view6 = store.add(new TestView(50, Number.MAX_VALUE, 50, Number.MAX_VALUE));
    grid.addView(view6, Sizing.Distribute, view3, Direction.Down);
    assert.deepStrictEqual(view1.size, [266, 600]);
    assert.deepStrictEqual(view2.size, [266, 300]);
    assert.deepStrictEqual(view3.size, [268, 200]);
    assert.deepStrictEqual(view4.size, [266, 300]);
    assert.deepStrictEqual(view5.size, [268, 200]);
    assert.deepStrictEqual(view6.size, [268, 200]);
  });
  test("another simple layout with split size distribution", function() {
    const view1 = store.add(new TestView(50, Number.MAX_VALUE, 50, Number.MAX_VALUE));
    const grid = store.add(new Grid(view1));
    container.appendChild(grid.element);
    grid.layout(800, 600);
    assert.deepStrictEqual(view1.size, [800, 600]);
    const view2 = store.add(new TestView(50, Number.MAX_VALUE, 50, Number.MAX_VALUE));
    grid.addView(view2, Sizing.Split, view1, Direction.Left);
    assert.deepStrictEqual(view1.size, [400, 600]);
    assert.deepStrictEqual(view2.size, [400, 600]);
    const view3 = store.add(new TestView(50, Number.MAX_VALUE, 50, Number.MAX_VALUE));
    grid.addView(view3, Sizing.Split, view1, Direction.Right);
    assert.deepStrictEqual(view1.size, [200, 600]);
    assert.deepStrictEqual(view2.size, [400, 600]);
    assert.deepStrictEqual(view3.size, [200, 600]);
    const view4 = store.add(new TestView(50, Number.MAX_VALUE, 50, Number.MAX_VALUE));
    grid.addView(view4, Sizing.Split, view2, Direction.Down);
    assert.deepStrictEqual(view1.size, [200, 600]);
    assert.deepStrictEqual(view2.size, [400, 300]);
    assert.deepStrictEqual(view3.size, [200, 600]);
    assert.deepStrictEqual(view4.size, [400, 300]);
    const view5 = store.add(new TestView(50, Number.MAX_VALUE, 50, Number.MAX_VALUE));
    grid.addView(view5, Sizing.Split, view3, Direction.Up);
    assert.deepStrictEqual(view1.size, [200, 600]);
    assert.deepStrictEqual(view2.size, [400, 300]);
    assert.deepStrictEqual(view3.size, [200, 300]);
    assert.deepStrictEqual(view4.size, [400, 300]);
    assert.deepStrictEqual(view5.size, [200, 300]);
    const view6 = store.add(new TestView(50, Number.MAX_VALUE, 50, Number.MAX_VALUE));
    grid.addView(view6, Sizing.Split, view3, Direction.Down);
    assert.deepStrictEqual(view1.size, [200, 600]);
    assert.deepStrictEqual(view2.size, [400, 300]);
    assert.deepStrictEqual(view3.size, [200, 150]);
    assert.deepStrictEqual(view4.size, [400, 300]);
    assert.deepStrictEqual(view5.size, [200, 300]);
    assert.deepStrictEqual(view6.size, [200, 150]);
  });
  test("3/2 layout with split", function() {
    const view1 = store.add(new TestView(50, Number.MAX_VALUE, 50, Number.MAX_VALUE));
    const grid = store.add(new Grid(view1));
    container.appendChild(grid.element);
    grid.layout(800, 600);
    assert.deepStrictEqual(view1.size, [800, 600]);
    const view2 = store.add(new TestView(50, Number.MAX_VALUE, 50, Number.MAX_VALUE));
    grid.addView(view2, Sizing.Split, view1, Direction.Down);
    assert.deepStrictEqual(view1.size, [800, 300]);
    assert.deepStrictEqual(view2.size, [800, 300]);
    const view3 = store.add(new TestView(50, Number.MAX_VALUE, 50, Number.MAX_VALUE));
    grid.addView(view3, Sizing.Split, view2, Direction.Right);
    assert.deepStrictEqual(view1.size, [800, 300]);
    assert.deepStrictEqual(view2.size, [400, 300]);
    assert.deepStrictEqual(view3.size, [400, 300]);
    const view4 = store.add(new TestView(50, Number.MAX_VALUE, 50, Number.MAX_VALUE));
    grid.addView(view4, Sizing.Split, view1, Direction.Right);
    assert.deepStrictEqual(view1.size, [400, 300]);
    assert.deepStrictEqual(view2.size, [400, 300]);
    assert.deepStrictEqual(view3.size, [400, 300]);
    assert.deepStrictEqual(view4.size, [400, 300]);
    const view5 = store.add(new TestView(50, Number.MAX_VALUE, 50, Number.MAX_VALUE));
    grid.addView(view5, Sizing.Split, view1, Direction.Right);
    assert.deepStrictEqual(view1.size, [200, 300]);
    assert.deepStrictEqual(view2.size, [400, 300]);
    assert.deepStrictEqual(view3.size, [400, 300]);
    assert.deepStrictEqual(view4.size, [400, 300]);
    assert.deepStrictEqual(view5.size, [200, 300]);
  });
  test("sizing should be correct after branch demotion #50564", function() {
    const view1 = store.add(new TestView(50, Number.MAX_VALUE, 50, Number.MAX_VALUE));
    const grid = store.add(new Grid(view1));
    container.appendChild(grid.element);
    grid.layout(800, 600);
    const view2 = store.add(new TestView(50, Number.MAX_VALUE, 50, Number.MAX_VALUE));
    grid.addView(view2, Sizing.Split, view1, Direction.Right);
    const view3 = store.add(new TestView(50, Number.MAX_VALUE, 50, Number.MAX_VALUE));
    grid.addView(view3, Sizing.Split, view2, Direction.Down);
    const view4 = store.add(new TestView(50, Number.MAX_VALUE, 50, Number.MAX_VALUE));
    grid.addView(view4, Sizing.Split, view2, Direction.Right);
    assert.deepStrictEqual(view1.size, [400, 600]);
    assert.deepStrictEqual(view2.size, [200, 300]);
    assert.deepStrictEqual(view3.size, [400, 300]);
    assert.deepStrictEqual(view4.size, [200, 300]);
    grid.removeView(view3);
    assert.deepStrictEqual(view1.size, [400, 600]);
    assert.deepStrictEqual(view2.size, [200, 600]);
    assert.deepStrictEqual(view4.size, [200, 600]);
  });
  test("sizing should be correct after branch demotion #50675", function() {
    const view1 = store.add(new TestView(50, Number.MAX_VALUE, 50, Number.MAX_VALUE));
    const grid = store.add(new Grid(view1));
    container.appendChild(grid.element);
    grid.layout(800, 600);
    const view2 = store.add(new TestView(50, Number.MAX_VALUE, 50, Number.MAX_VALUE));
    grid.addView(view2, Sizing.Distribute, view1, Direction.Down);
    const view3 = store.add(new TestView(50, Number.MAX_VALUE, 50, Number.MAX_VALUE));
    grid.addView(view3, Sizing.Distribute, view2, Direction.Down);
    const view4 = store.add(new TestView(50, Number.MAX_VALUE, 50, Number.MAX_VALUE));
    grid.addView(view4, Sizing.Distribute, view3, Direction.Right);
    assert.deepStrictEqual(view1.size, [800, 200]);
    assert.deepStrictEqual(view2.size, [800, 200]);
    assert.deepStrictEqual(view3.size, [400, 200]);
    assert.deepStrictEqual(view4.size, [400, 200]);
    grid.removeView(view3, Sizing.Distribute);
    assert.deepStrictEqual(view1.size, [800, 200]);
    assert.deepStrictEqual(view2.size, [800, 200]);
    assert.deepStrictEqual(view4.size, [800, 200]);
  });
  test("getNeighborViews should work on single view layout", function() {
    const view1 = store.add(new TestView(50, Number.MAX_VALUE, 50, Number.MAX_VALUE));
    const grid = store.add(new Grid(view1));
    container.appendChild(grid.element);
    grid.layout(800, 600);
    assert.deepStrictEqual(grid.getNeighborViews(view1, Direction.Up), []);
    assert.deepStrictEqual(grid.getNeighborViews(view1, Direction.Right), []);
    assert.deepStrictEqual(grid.getNeighborViews(view1, Direction.Down), []);
    assert.deepStrictEqual(grid.getNeighborViews(view1, Direction.Left), []);
    assert.deepStrictEqual(grid.getNeighborViews(view1, Direction.Up, true), [view1]);
    assert.deepStrictEqual(grid.getNeighborViews(view1, Direction.Right, true), [view1]);
    assert.deepStrictEqual(grid.getNeighborViews(view1, Direction.Down, true), [view1]);
    assert.deepStrictEqual(grid.getNeighborViews(view1, Direction.Left, true), [view1]);
  });
  test("getNeighborViews should work on simple layout", function() {
    const view1 = store.add(new TestView(50, Number.MAX_VALUE, 50, Number.MAX_VALUE));
    const grid = store.add(new Grid(view1));
    container.appendChild(grid.element);
    grid.layout(800, 600);
    const view2 = store.add(new TestView(50, Number.MAX_VALUE, 50, Number.MAX_VALUE));
    grid.addView(view2, Sizing.Distribute, view1, Direction.Down);
    const view3 = store.add(new TestView(50, Number.MAX_VALUE, 50, Number.MAX_VALUE));
    grid.addView(view3, Sizing.Distribute, view2, Direction.Down);
    assert.deepStrictEqual(grid.getNeighborViews(view1, Direction.Up), []);
    assert.deepStrictEqual(grid.getNeighborViews(view1, Direction.Right), []);
    assert.deepStrictEqual(grid.getNeighborViews(view1, Direction.Down), [view2]);
    assert.deepStrictEqual(grid.getNeighborViews(view1, Direction.Left), []);
    assert.deepStrictEqual(grid.getNeighborViews(view1, Direction.Up, true), [view3]);
    assert.deepStrictEqual(grid.getNeighborViews(view1, Direction.Right, true), [view1]);
    assert.deepStrictEqual(grid.getNeighborViews(view1, Direction.Down, true), [view2]);
    assert.deepStrictEqual(grid.getNeighborViews(view1, Direction.Left, true), [view1]);
    assert.deepStrictEqual(grid.getNeighborViews(view2, Direction.Up), [view1]);
    assert.deepStrictEqual(grid.getNeighborViews(view2, Direction.Right), []);
    assert.deepStrictEqual(grid.getNeighborViews(view2, Direction.Down), [view3]);
    assert.deepStrictEqual(grid.getNeighborViews(view2, Direction.Left), []);
    assert.deepStrictEqual(grid.getNeighborViews(view2, Direction.Up, true), [view1]);
    assert.deepStrictEqual(grid.getNeighborViews(view2, Direction.Right, true), [view2]);
    assert.deepStrictEqual(grid.getNeighborViews(view2, Direction.Down, true), [view3]);
    assert.deepStrictEqual(grid.getNeighborViews(view2, Direction.Left, true), [view2]);
    assert.deepStrictEqual(grid.getNeighborViews(view3, Direction.Up), [view2]);
    assert.deepStrictEqual(grid.getNeighborViews(view3, Direction.Right), []);
    assert.deepStrictEqual(grid.getNeighborViews(view3, Direction.Down), []);
    assert.deepStrictEqual(grid.getNeighborViews(view3, Direction.Left), []);
    assert.deepStrictEqual(grid.getNeighborViews(view3, Direction.Up, true), [view2]);
    assert.deepStrictEqual(grid.getNeighborViews(view3, Direction.Right, true), [view3]);
    assert.deepStrictEqual(grid.getNeighborViews(view3, Direction.Down, true), [view1]);
    assert.deepStrictEqual(grid.getNeighborViews(view3, Direction.Left, true), [view3]);
  });
  test("getNeighborViews should work on a complex layout", function() {
    const view1 = store.add(new TestView(50, Number.MAX_VALUE, 50, Number.MAX_VALUE));
    const grid = store.add(new Grid(view1));
    container.appendChild(grid.element);
    grid.layout(800, 600);
    const view2 = store.add(new TestView(50, Number.MAX_VALUE, 50, Number.MAX_VALUE));
    grid.addView(view2, Sizing.Distribute, view1, Direction.Down);
    const view3 = store.add(new TestView(50, Number.MAX_VALUE, 50, Number.MAX_VALUE));
    grid.addView(view3, Sizing.Distribute, view2, Direction.Down);
    const view4 = store.add(new TestView(50, Number.MAX_VALUE, 50, Number.MAX_VALUE));
    grid.addView(view4, Sizing.Distribute, view2, Direction.Right);
    const view5 = store.add(new TestView(50, Number.MAX_VALUE, 50, Number.MAX_VALUE));
    grid.addView(view5, Sizing.Distribute, view4, Direction.Down);
    assert.deepStrictEqual(grid.getNeighborViews(view1, Direction.Up), []);
    assert.deepStrictEqual(grid.getNeighborViews(view1, Direction.Right), []);
    assert.deepStrictEqual(grid.getNeighborViews(view1, Direction.Down), [view2, view4]);
    assert.deepStrictEqual(grid.getNeighborViews(view1, Direction.Left), []);
    assert.deepStrictEqual(grid.getNeighborViews(view2, Direction.Up), [view1]);
    assert.deepStrictEqual(grid.getNeighborViews(view2, Direction.Right), [view4, view5]);
    assert.deepStrictEqual(grid.getNeighborViews(view2, Direction.Down), [view3]);
    assert.deepStrictEqual(grid.getNeighborViews(view2, Direction.Left), []);
    assert.deepStrictEqual(grid.getNeighborViews(view4, Direction.Up), [view1]);
    assert.deepStrictEqual(grid.getNeighborViews(view4, Direction.Right), []);
    assert.deepStrictEqual(grid.getNeighborViews(view4, Direction.Down), [view5]);
    assert.deepStrictEqual(grid.getNeighborViews(view4, Direction.Left), [view2]);
    assert.deepStrictEqual(grid.getNeighborViews(view5, Direction.Up), [view4]);
    assert.deepStrictEqual(grid.getNeighborViews(view5, Direction.Right), []);
    assert.deepStrictEqual(grid.getNeighborViews(view5, Direction.Down), [view3]);
    assert.deepStrictEqual(grid.getNeighborViews(view5, Direction.Left), [view2]);
    assert.deepStrictEqual(grid.getNeighborViews(view3, Direction.Up), [view2, view5]);
    assert.deepStrictEqual(grid.getNeighborViews(view3, Direction.Right), []);
    assert.deepStrictEqual(grid.getNeighborViews(view3, Direction.Down), []);
    assert.deepStrictEqual(grid.getNeighborViews(view3, Direction.Left), []);
  });
  test("getNeighborViews should work on another simple layout", function() {
    const view1 = store.add(new TestView(50, Number.MAX_VALUE, 50, Number.MAX_VALUE));
    const grid = store.add(new Grid(view1));
    container.appendChild(grid.element);
    grid.layout(800, 600);
    const view2 = store.add(new TestView(50, Number.MAX_VALUE, 50, Number.MAX_VALUE));
    grid.addView(view2, Sizing.Distribute, view1, Direction.Right);
    const view3 = store.add(new TestView(50, Number.MAX_VALUE, 50, Number.MAX_VALUE));
    grid.addView(view3, Sizing.Distribute, view2, Direction.Down);
    const view4 = store.add(new TestView(50, Number.MAX_VALUE, 50, Number.MAX_VALUE));
    grid.addView(view4, Sizing.Distribute, view2, Direction.Right);
    assert.deepStrictEqual(grid.getNeighborViews(view4, Direction.Up), []);
    assert.deepStrictEqual(grid.getNeighborViews(view4, Direction.Right), []);
    assert.deepStrictEqual(grid.getNeighborViews(view4, Direction.Down), [view3]);
    assert.deepStrictEqual(grid.getNeighborViews(view4, Direction.Left), [view2]);
  });
  test("getNeighborViews should only return immediate neighbors", function() {
    const view1 = store.add(new TestView(50, Number.MAX_VALUE, 50, Number.MAX_VALUE));
    const grid = store.add(new Grid(view1));
    container.appendChild(grid.element);
    grid.layout(800, 600);
    const view2 = store.add(new TestView(50, Number.MAX_VALUE, 50, Number.MAX_VALUE));
    grid.addView(view2, Sizing.Distribute, view1, Direction.Right);
    const view3 = store.add(new TestView(50, Number.MAX_VALUE, 50, Number.MAX_VALUE));
    grid.addView(view3, Sizing.Distribute, view2, Direction.Down);
    const view4 = store.add(new TestView(50, Number.MAX_VALUE, 50, Number.MAX_VALUE));
    grid.addView(view4, Sizing.Distribute, view2, Direction.Right);
    assert.deepStrictEqual(grid.getNeighborViews(view1, Direction.Right), [view2, view3]);
  });
  test("hiding splitviews and restoring sizes", function() {
    const view1 = store.add(new TestView(50, Number.MAX_VALUE, 50, Number.MAX_VALUE));
    const grid = store.add(new Grid(view1));
    container.appendChild(grid.element);
    grid.layout(800, 600);
    const view2 = store.add(new TestView(50, Number.MAX_VALUE, 50, Number.MAX_VALUE));
    grid.addView(view2, Sizing.Distribute, view1, Direction.Right);
    const view3 = store.add(new TestView(50, Number.MAX_VALUE, 50, Number.MAX_VALUE));
    grid.addView(view3, Sizing.Distribute, view2, Direction.Down);
    const view4 = store.add(new TestView(50, Number.MAX_VALUE, 50, Number.MAX_VALUE));
    grid.addView(view4, Sizing.Distribute, view2, Direction.Right);
    const size1 = view1.size;
    const size2 = view2.size;
    const size3 = view3.size;
    const size4 = view4.size;
    grid.maximizeView(view1);
    assert.deepStrictEqual(view1.size, [800, 600]);
    assert.deepStrictEqual(view2.size, [0, 0]);
    assert.deepStrictEqual(view3.size, [0, 0]);
    assert.deepStrictEqual(view4.size, [0, 0]);
    grid.exitMaximizedView();
    assert.deepStrictEqual(view1.size, size1);
    assert.deepStrictEqual(view2.size, size2);
    assert.deepStrictEqual(view3.size, size3);
    assert.deepStrictEqual(view4.size, size4);
    grid.maximizeView(view2);
    assert.deepStrictEqual(view1.size, [0, 600]);
    assert.deepStrictEqual(view2.size, [800, 600]);
    assert.deepStrictEqual(view3.size, [800, 0]);
    assert.deepStrictEqual(view4.size, [0, 600]);
    grid.exitMaximizedView();
    assert.deepStrictEqual(view1.size, size1);
    assert.deepStrictEqual(view2.size, size2);
    assert.deepStrictEqual(view3.size, size3);
    assert.deepStrictEqual(view4.size, size4);
  });
  test("hasMaximizedView", function() {
    const view1 = store.add(new TestView(50, Number.MAX_VALUE, 50, Number.MAX_VALUE));
    const grid = store.add(new Grid(view1));
    container.appendChild(grid.element);
    grid.layout(800, 600);
    const view2 = store.add(new TestView(50, Number.MAX_VALUE, 50, Number.MAX_VALUE));
    grid.addView(view2, Sizing.Distribute, view1, Direction.Right);
    const view3 = store.add(new TestView(50, Number.MAX_VALUE, 50, Number.MAX_VALUE));
    grid.addView(view3, Sizing.Distribute, view2, Direction.Down);
    const view4 = store.add(new TestView(50, Number.MAX_VALUE, 50, Number.MAX_VALUE));
    grid.addView(view4, Sizing.Distribute, view2, Direction.Right);
    function checkIsMaximized(view) {
      grid.maximizeView(view);
      assert.deepStrictEqual(grid.hasMaximizedView(), true);
      assert.deepStrictEqual(grid.isViewExpanded(view1), false);
      assert.deepStrictEqual(grid.isViewExpanded(view2), false);
      assert.deepStrictEqual(grid.isViewExpanded(view3), false);
      assert.deepStrictEqual(grid.isViewExpanded(view4), false);
      grid.exitMaximizedView();
      assert.deepStrictEqual(grid.hasMaximizedView(), false);
    }
    checkIsMaximized(view1);
    checkIsMaximized(view2);
    checkIsMaximized(view3);
    checkIsMaximized(view4);
  });
  test("Changes to the grid unmaximize the view", function() {
    const view1 = store.add(new TestView(50, Number.MAX_VALUE, 50, Number.MAX_VALUE));
    const grid = store.add(new Grid(view1));
    container.appendChild(grid.element);
    grid.layout(800, 600);
    const view2 = store.add(new TestView(50, Number.MAX_VALUE, 50, Number.MAX_VALUE));
    grid.addView(view2, Sizing.Distribute, view1, Direction.Right);
    const view3 = store.add(new TestView(50, Number.MAX_VALUE, 50, Number.MAX_VALUE));
    grid.addView(view3, Sizing.Distribute, view2, Direction.Down);
    const view4 = store.add(new TestView(50, Number.MAX_VALUE, 50, Number.MAX_VALUE));
    grid.maximizeView(view1);
    assert.deepStrictEqual(grid.hasMaximizedView(), true);
    grid.addView(view4, Sizing.Distribute, view2, Direction.Right);
    assert.deepStrictEqual(grid.hasMaximizedView(), false);
    assert.deepStrictEqual(grid.isViewVisible(view1), true);
    assert.deepStrictEqual(grid.isViewVisible(view2), true);
    assert.deepStrictEqual(grid.isViewVisible(view3), true);
    assert.deepStrictEqual(grid.isViewVisible(view4), true);
    grid.maximizeView(view1);
    assert.deepStrictEqual(grid.hasMaximizedView(), true);
    grid.removeView(view4);
    assert.deepStrictEqual(grid.hasMaximizedView(), false);
    assert.deepStrictEqual(grid.isViewVisible(view1), true);
    assert.deepStrictEqual(grid.isViewVisible(view2), true);
    assert.deepStrictEqual(grid.isViewVisible(view3), true);
    grid.maximizeView(view1);
    assert.deepStrictEqual(grid.hasMaximizedView(), true);
    grid.setViewVisible(view3, true);
    assert.deepStrictEqual(grid.hasMaximizedView(), false);
    assert.deepStrictEqual(grid.isViewVisible(view1), true);
    assert.deepStrictEqual(grid.isViewVisible(view2), true);
    assert.deepStrictEqual(grid.isViewVisible(view3), true);
  });
  test("Changes to the grid sizing unmaximize the view", function() {
    const view1 = store.add(new TestView(50, Number.MAX_VALUE, 50, Number.MAX_VALUE));
    const grid = store.add(new Grid(view1));
    container.appendChild(grid.element);
    grid.layout(800, 600);
    const view2 = store.add(new TestView(50, Number.MAX_VALUE, 50, Number.MAX_VALUE));
    grid.addView(view2, Sizing.Distribute, view1, Direction.Right);
    const view3 = store.add(new TestView(50, Number.MAX_VALUE, 50, Number.MAX_VALUE));
    grid.addView(view3, Sizing.Distribute, view2, Direction.Down);
    const view4 = store.add(new TestView(50, Number.MAX_VALUE, 50, Number.MAX_VALUE));
    grid.addView(view4, Sizing.Distribute, view2, Direction.Right);
    grid.maximizeView(view1);
    assert.deepStrictEqual(grid.hasMaximizedView(), true);
    grid.maximizeView(view2);
    assert.deepStrictEqual(grid.hasMaximizedView(), true);
    assert.deepStrictEqual(grid.isViewVisible(view1), false);
    assert.deepStrictEqual(grid.isViewVisible(view2), true);
    assert.deepStrictEqual(grid.isViewVisible(view3), false);
    assert.deepStrictEqual(grid.isViewVisible(view4), false);
    grid.maximizeView(view1);
    assert.deepStrictEqual(grid.hasMaximizedView(), true);
    grid.distributeViewSizes();
    assert.deepStrictEqual(grid.hasMaximizedView(), false);
    assert.deepStrictEqual(grid.isViewVisible(view1), true);
    assert.deepStrictEqual(grid.isViewVisible(view2), true);
    assert.deepStrictEqual(grid.isViewVisible(view3), true);
    assert.deepStrictEqual(grid.isViewVisible(view4), true);
    grid.maximizeView(view1);
    assert.deepStrictEqual(grid.hasMaximizedView(), true);
    grid.expandView(view2);
    assert.deepStrictEqual(grid.hasMaximizedView(), false);
    assert.deepStrictEqual(grid.isViewVisible(view1), true);
    assert.deepStrictEqual(grid.isViewVisible(view2), true);
    assert.deepStrictEqual(grid.isViewVisible(view3), true);
    assert.deepStrictEqual(grid.isViewVisible(view4), true);
    grid.maximizeView(view1);
    assert.deepStrictEqual(grid.hasMaximizedView(), true);
    grid.expandView(view1);
    assert.deepStrictEqual(grid.hasMaximizedView(), false);
    assert.deepStrictEqual(grid.isViewVisible(view1), true);
    assert.deepStrictEqual(grid.isViewVisible(view2), true);
    assert.deepStrictEqual(grid.isViewVisible(view3), true);
    assert.deepStrictEqual(grid.isViewVisible(view4), true);
  });
  test("Distribute sibling sizes when revealing a view", function() {
    const view1 = store.add(new TestView(50, Number.MAX_VALUE, 50, Number.MAX_VALUE));
    const grid = store.add(new Grid(view1));
    container.appendChild(grid.element);
    grid.layout(800, 600);
    const view2 = store.add(new TestView(50, Number.MAX_VALUE, 50, Number.MAX_VALUE));
    grid.addView(view2, Sizing.Distribute, view1, Direction.Right);
    const view3 = store.add(new TestView(50, Number.MAX_VALUE, 50, Number.MAX_VALUE));
    grid.addView(view3, Sizing.Distribute, view2, Direction.Down);
    grid.setViewVisible(view1, false);
    grid.resizeView(view2, { width: 200, height: 450 });
    grid.setViewVisible(view1, true, Sizing.Distribute);
    assert.deepStrictEqual({
      view1: grid.getViewSize(view1),
      view2: grid.getViewSize(view2),
      view3: grid.getViewSize(view3)
    }, {
      view1: { width: 400, height: 600 },
      view2: { width: 400, height: 450 },
      view3: { width: 400, height: 150 }
    });
  });
});
class TestSerializableView extends TestView {
  constructor(name, minimumWidth, maximumWidth, minimumHeight, maximumHeight) {
    super(minimumWidth, maximumWidth, minimumHeight, maximumHeight);
    this.name = name;
  }
  toJSON() {
    return { name: this.name };
  }
}
class TestViewDeserializer {
  constructor(store) {
    this.store = store;
    this.views = /* @__PURE__ */ new Map();
  }
  fromJSON(json) {
    const view = this.store.add(new TestSerializableView(json.name, 50, Number.MAX_VALUE, 50, Number.MAX_VALUE));
    this.views.set(json.name, view);
    return view;
  }
  getView(id) {
    const view = this.views.get(id);
    if (!view) {
      throw new Error("Unknown view");
    }
    return view;
  }
}
function nodesToNames(node) {
  if (isGridBranchNode(node)) {
    return node.children.map(nodesToNames);
  } else {
    return node.view.name;
  }
}
suite("SerializableGrid", function() {
  const store = ensureNoDisposablesAreLeakedInTestSuite();
  let container;
  setup(function() {
    container = document.createElement("div");
    container.style.position = "absolute";
    container.style.width = `${800}px`;
    container.style.height = `${600}px`;
  });
  test("serialize empty", function() {
    const view1 = store.add(new TestSerializableView("view1", 50, Number.MAX_VALUE, 50, Number.MAX_VALUE));
    const grid = store.add(new SerializableGrid(view1));
    container.appendChild(grid.element);
    grid.layout(800, 600);
    const actual = grid.serialize();
    assert.deepStrictEqual(actual, {
      orientation: 0,
      width: 800,
      height: 600,
      root: {
        type: "branch",
        data: [
          {
            type: "leaf",
            data: {
              name: "view1"
            },
            size: 600
          }
        ],
        size: 800
      }
    });
  });
  test("serialize simple layout", function() {
    const view1 = store.add(new TestSerializableView("view1", 50, Number.MAX_VALUE, 50, Number.MAX_VALUE));
    const grid = store.add(new SerializableGrid(view1));
    container.appendChild(grid.element);
    grid.layout(800, 600);
    const view2 = store.add(new TestSerializableView("view2", 50, Number.MAX_VALUE, 50, Number.MAX_VALUE));
    grid.addView(view2, 200, view1, Direction.Up);
    const view3 = store.add(new TestSerializableView("view3", 50, Number.MAX_VALUE, 50, Number.MAX_VALUE));
    grid.addView(view3, 200, view1, Direction.Right);
    const view4 = store.add(new TestSerializableView("view4", 50, Number.MAX_VALUE, 50, Number.MAX_VALUE));
    grid.addView(view4, 200, view2, Direction.Left);
    const view5 = store.add(new TestSerializableView("view5", 50, Number.MAX_VALUE, 50, Number.MAX_VALUE));
    grid.addView(view5, 100, view1, Direction.Down);
    assert.deepStrictEqual(grid.serialize(), {
      orientation: 0,
      width: 800,
      height: 600,
      root: {
        type: "branch",
        data: [
          {
            type: "branch",
            data: [
              { type: "leaf", data: { name: "view4" }, size: 200 },
              { type: "leaf", data: { name: "view2" }, size: 600 }
            ],
            size: 200
          },
          {
            type: "branch",
            data: [
              {
                type: "branch",
                data: [
                  { type: "leaf", data: { name: "view1" }, size: 300 },
                  { type: "leaf", data: { name: "view5" }, size: 100 }
                ],
                size: 600
              },
              { type: "leaf", data: { name: "view3" }, size: 200 }
            ],
            size: 400
          }
        ],
        size: 800
      }
    });
  });
  test("deserialize empty", function() {
    const view1 = store.add(new TestSerializableView("view1", 50, Number.MAX_VALUE, 50, Number.MAX_VALUE));
    const grid = store.add(new SerializableGrid(view1));
    container.appendChild(grid.element);
    grid.layout(800, 600);
    const json = grid.serialize();
    grid.dispose();
    const deserializer = new TestViewDeserializer(store);
    const grid2 = store.add(SerializableGrid.deserialize(json, deserializer));
    grid2.layout(800, 600);
    assert.deepStrictEqual(nodesToNames(grid2.getViews()), ["view1"]);
  });
  test("deserialize simple layout", function() {
    const view1 = store.add(new TestSerializableView("view1", 50, Number.MAX_VALUE, 50, Number.MAX_VALUE));
    const grid = store.add(new SerializableGrid(view1));
    container.appendChild(grid.element);
    grid.layout(800, 600);
    const view2 = store.add(new TestSerializableView("view2", 50, Number.MAX_VALUE, 50, Number.MAX_VALUE));
    grid.addView(view2, 200, view1, Direction.Up);
    const view3 = store.add(new TestSerializableView("view3", 50, Number.MAX_VALUE, 50, Number.MAX_VALUE));
    grid.addView(view3, 200, view1, Direction.Right);
    const view4 = store.add(new TestSerializableView("view4", 50, Number.MAX_VALUE, 50, Number.MAX_VALUE));
    grid.addView(view4, 200, view2, Direction.Left);
    const view5 = store.add(new TestSerializableView("view5", 50, Number.MAX_VALUE, 50, Number.MAX_VALUE));
    grid.addView(view5, 100, view1, Direction.Down);
    const json = grid.serialize();
    grid.dispose();
    const deserializer = new TestViewDeserializer(store);
    const grid2 = store.add(SerializableGrid.deserialize(json, deserializer));
    const view1Copy = deserializer.getView("view1");
    const view2Copy = deserializer.getView("view2");
    const view3Copy = deserializer.getView("view3");
    const view4Copy = deserializer.getView("view4");
    const view5Copy = deserializer.getView("view5");
    assert.deepStrictEqual(nodesToArrays(grid2.getViews()), [[view4Copy, view2Copy], [[view1Copy, view5Copy], view3Copy]]);
    grid2.layout(800, 600);
    assert.deepStrictEqual(view1Copy.size, [600, 300]);
    assert.deepStrictEqual(view2Copy.size, [600, 200]);
    assert.deepStrictEqual(view3Copy.size, [200, 400]);
    assert.deepStrictEqual(view4Copy.size, [200, 200]);
    assert.deepStrictEqual(view5Copy.size, [600, 100]);
  });
  test("deserialize simple layout with scaling", function() {
    const view1 = store.add(new TestSerializableView("view1", 50, Number.MAX_VALUE, 50, Number.MAX_VALUE));
    const grid = store.add(new SerializableGrid(view1));
    container.appendChild(grid.element);
    grid.layout(800, 600);
    const view2 = store.add(new TestSerializableView("view2", 50, Number.MAX_VALUE, 50, Number.MAX_VALUE));
    grid.addView(view2, 200, view1, Direction.Up);
    const view3 = store.add(new TestSerializableView("view3", 50, Number.MAX_VALUE, 50, Number.MAX_VALUE));
    grid.addView(view3, 200, view1, Direction.Right);
    const view4 = store.add(new TestSerializableView("view4", 50, Number.MAX_VALUE, 50, Number.MAX_VALUE));
    grid.addView(view4, 200, view2, Direction.Left);
    const view5 = store.add(new TestSerializableView("view5", 50, Number.MAX_VALUE, 50, Number.MAX_VALUE));
    grid.addView(view5, 100, view1, Direction.Down);
    const json = grid.serialize();
    grid.dispose();
    const deserializer = new TestViewDeserializer(store);
    const grid2 = store.add(SerializableGrid.deserialize(json, deserializer));
    const view1Copy = deserializer.getView("view1");
    const view2Copy = deserializer.getView("view2");
    const view3Copy = deserializer.getView("view3");
    const view4Copy = deserializer.getView("view4");
    const view5Copy = deserializer.getView("view5");
    grid2.layout(400, 800);
    assert.deepStrictEqual(view1Copy.size, [300, 400]);
    assert.deepStrictEqual(view2Copy.size, [300, 267]);
    assert.deepStrictEqual(view3Copy.size, [100, 533]);
    assert.deepStrictEqual(view4Copy.size, [100, 267]);
    assert.deepStrictEqual(view5Copy.size, [300, 133]);
  });
  test("deserialize 4 view layout (ben issue #2)", function() {
    const view1 = store.add(new TestSerializableView("view1", 50, Number.MAX_VALUE, 50, Number.MAX_VALUE));
    const grid = store.add(new SerializableGrid(view1));
    container.appendChild(grid.element);
    grid.layout(800, 600);
    const view2 = store.add(new TestSerializableView("view2", 50, Number.MAX_VALUE, 50, Number.MAX_VALUE));
    grid.addView(view2, Sizing.Split, view1, Direction.Down);
    const view3 = store.add(new TestSerializableView("view3", 50, Number.MAX_VALUE, 50, Number.MAX_VALUE));
    grid.addView(view3, Sizing.Split, view2, Direction.Down);
    const view4 = store.add(new TestSerializableView("view4", 50, Number.MAX_VALUE, 50, Number.MAX_VALUE));
    grid.addView(view4, Sizing.Split, view3, Direction.Right);
    const json = grid.serialize();
    grid.dispose();
    const deserializer = new TestViewDeserializer(store);
    const grid2 = store.add(SerializableGrid.deserialize(json, deserializer));
    const view1Copy = deserializer.getView("view1");
    const view2Copy = deserializer.getView("view2");
    const view3Copy = deserializer.getView("view3");
    const view4Copy = deserializer.getView("view4");
    grid2.layout(800, 600);
    assert.deepStrictEqual(view1Copy.size, [800, 300]);
    assert.deepStrictEqual(view2Copy.size, [800, 150]);
    assert.deepStrictEqual(view3Copy.size, [400, 150]);
    assert.deepStrictEqual(view4Copy.size, [400, 150]);
  });
  test("deserialize 2 view layout (ben issue #3)", function() {
    const view1 = store.add(new TestSerializableView("view1", 50, Number.MAX_VALUE, 50, Number.MAX_VALUE));
    const grid = store.add(new SerializableGrid(view1));
    container.appendChild(grid.element);
    grid.layout(800, 600);
    const view2 = store.add(new TestSerializableView("view2", 50, Number.MAX_VALUE, 50, Number.MAX_VALUE));
    grid.addView(view2, Sizing.Split, view1, Direction.Right);
    const json = grid.serialize();
    grid.dispose();
    const deserializer = new TestViewDeserializer(store);
    const grid2 = store.add(SerializableGrid.deserialize(json, deserializer));
    const view1Copy = deserializer.getView("view1");
    const view2Copy = deserializer.getView("view2");
    grid2.layout(800, 600);
    assert.deepStrictEqual(view1Copy.size, [400, 600]);
    assert.deepStrictEqual(view2Copy.size, [400, 600]);
  });
  test("deserialize simple view layout #50609", function() {
    const view1 = store.add(new TestSerializableView("view1", 50, Number.MAX_VALUE, 50, Number.MAX_VALUE));
    const grid = store.add(new SerializableGrid(view1));
    container.appendChild(grid.element);
    grid.layout(800, 600);
    const view2 = store.add(new TestSerializableView("view2", 50, Number.MAX_VALUE, 50, Number.MAX_VALUE));
    grid.addView(view2, Sizing.Split, view1, Direction.Right);
    const view3 = store.add(new TestSerializableView("view3", 50, Number.MAX_VALUE, 50, Number.MAX_VALUE));
    grid.addView(view3, Sizing.Split, view2, Direction.Down);
    grid.removeView(view1, Sizing.Split);
    const json = grid.serialize();
    grid.dispose();
    const deserializer = new TestViewDeserializer(store);
    const grid2 = store.add(SerializableGrid.deserialize(json, deserializer));
    const view2Copy = deserializer.getView("view2");
    const view3Copy = deserializer.getView("view3");
    grid2.layout(800, 600);
    assert.deepStrictEqual(view2Copy.size, [800, 300]);
    assert.deepStrictEqual(view3Copy.size, [800, 300]);
  });
  test("sanitizeGridNodeDescriptor", () => {
    const nodeDescriptor = { groups: [{ size: 0.2 }, { size: 0.2 }, { size: 0.6, groups: [{}, {}] }] };
    const nodeDescriptorCopy = deepClone(nodeDescriptor);
    sanitizeGridNodeDescriptor(nodeDescriptorCopy, true);
    assert.deepStrictEqual(nodeDescriptorCopy, { groups: [{ size: 0.2 }, { size: 0.2 }, { size: 0.6, groups: [{ size: 0.5 }, { size: 0.5 }] }] });
  });
  test("createSerializedGrid", () => {
    const gridDescriptor = { orientation: Orientation.VERTICAL, groups: [{ size: 0.2, data: "a" }, { size: 0.2, data: "b" }, { size: 0.6, groups: [{ data: "c" }, { data: "d" }] }] };
    const serializedGrid = createSerializedGrid(gridDescriptor);
    assert.deepStrictEqual(serializedGrid, {
      root: {
        type: "branch",
        size: void 0,
        data: [
          { type: "leaf", size: 0.2, data: "a" },
          { type: "leaf", size: 0.2, data: "b" },
          {
            type: "branch",
            size: 0.6,
            data: [
              { type: "leaf", size: 0.5, data: "c" },
              { type: "leaf", size: 0.5, data: "d" }
            ]
          }
        ]
      },
      orientation: Orientation.VERTICAL,
      width: 1,
      height: 1
    });
  });
  test("createSerializedGrid - issue #85601, should not allow single children groups", () => {
    const serializedGrid = createSerializedGrid({ orientation: Orientation.HORIZONTAL, groups: [{ groups: [{}, {}], size: 0.5 }, { groups: [{}], size: 0.5 }] });
    const views = [];
    const deserializer = new class {
      fromJSON() {
        const view = {
          element: document.createElement("div"),
          layout: () => null,
          minimumWidth: 0,
          maximumWidth: Number.POSITIVE_INFINITY,
          minimumHeight: 0,
          maximumHeight: Number.POSITIVE_INFINITY,
          onDidChange: Event.None,
          toJSON: () => ({})
        };
        views.push(view);
        return view;
      }
    }();
    const grid = store.add(SerializableGrid.deserialize(serializedGrid, deserializer));
    assert.strictEqual(views.length, 3);
    grid.removeView(views[2]);
  });
  test("from", () => {
    const createView = () => ({
      element: document.createElement("div"),
      layout: () => null,
      minimumWidth: 0,
      maximumWidth: Number.POSITIVE_INFINITY,
      minimumHeight: 0,
      maximumHeight: Number.POSITIVE_INFINITY,
      onDidChange: Event.None,
      toJSON: () => ({})
    });
    const a = createView();
    const b = createView();
    const c = createView();
    const d = createView();
    const gridDescriptor = { orientation: Orientation.VERTICAL, groups: [{ size: 0.2, data: a }, { size: 0.2, data: b }, { size: 0.6, groups: [{ data: c }, { data: d }] }] };
    const grid = SerializableGrid.from(gridDescriptor);
    assert.deepStrictEqual(nodesToArrays(grid.getViews()), [a, b, [c, d]]);
    grid.dispose();
  });
  test("serialize should store visibility and previous size", function() {
    const view1 = store.add(new TestSerializableView("view1", 50, Number.MAX_VALUE, 50, Number.MAX_VALUE));
    const grid = store.add(new SerializableGrid(view1));
    container.appendChild(grid.element);
    grid.layout(800, 600);
    const view2 = store.add(new TestSerializableView("view2", 50, Number.MAX_VALUE, 50, Number.MAX_VALUE));
    grid.addView(view2, 200, view1, Direction.Up);
    const view3 = store.add(new TestSerializableView("view3", 50, Number.MAX_VALUE, 50, Number.MAX_VALUE));
    grid.addView(view3, 200, view1, Direction.Right);
    const view4 = store.add(new TestSerializableView("view4", 50, Number.MAX_VALUE, 50, Number.MAX_VALUE));
    grid.addView(view4, 200, view2, Direction.Left);
    const view5 = store.add(new TestSerializableView("view5", 50, Number.MAX_VALUE, 50, Number.MAX_VALUE));
    grid.addView(view5, 100, view1, Direction.Down);
    assert.deepStrictEqual(view1.size, [600, 300]);
    assert.deepStrictEqual(view2.size, [600, 200]);
    assert.deepStrictEqual(view3.size, [200, 400]);
    assert.deepStrictEqual(view4.size, [200, 200]);
    assert.deepStrictEqual(view5.size, [600, 100]);
    grid.setViewVisible(view5, false);
    assert.deepStrictEqual(view1.size, [600, 400]);
    assert.deepStrictEqual(view2.size, [600, 200]);
    assert.deepStrictEqual(view3.size, [200, 400]);
    assert.deepStrictEqual(view4.size, [200, 200]);
    assert.deepStrictEqual(view5.size, [600, 0]);
    grid.setViewVisible(view5, true);
    assert.deepStrictEqual(view1.size, [600, 300]);
    assert.deepStrictEqual(view2.size, [600, 200]);
    assert.deepStrictEqual(view3.size, [200, 400]);
    assert.deepStrictEqual(view4.size, [200, 200]);
    assert.deepStrictEqual(view5.size, [600, 100]);
    grid.setViewVisible(view5, false);
    assert.deepStrictEqual(view1.size, [600, 400]);
    assert.deepStrictEqual(view2.size, [600, 200]);
    assert.deepStrictEqual(view3.size, [200, 400]);
    assert.deepStrictEqual(view4.size, [200, 200]);
    assert.deepStrictEqual(view5.size, [600, 0]);
    grid.setViewVisible(view5, false);
    const json = grid.serialize();
    assert.deepStrictEqual(json, {
      orientation: 0,
      width: 800,
      height: 600,
      root: {
        type: "branch",
        data: [
          {
            type: "branch",
            data: [
              { type: "leaf", data: { name: "view4" }, size: 200 },
              { type: "leaf", data: { name: "view2" }, size: 600 }
            ],
            size: 200
          },
          {
            type: "branch",
            data: [
              {
                type: "branch",
                data: [
                  { type: "leaf", data: { name: "view1" }, size: 400 },
                  { type: "leaf", data: { name: "view5" }, size: 100, visible: false }
                ],
                size: 600
              },
              { type: "leaf", data: { name: "view3" }, size: 200 }
            ],
            size: 400
          }
        ],
        size: 800
      }
    });
    grid.dispose();
    const deserializer = new TestViewDeserializer(store);
    const grid2 = store.add(SerializableGrid.deserialize(json, deserializer));
    const view1Copy = deserializer.getView("view1");
    const view2Copy = deserializer.getView("view2");
    const view3Copy = deserializer.getView("view3");
    const view4Copy = deserializer.getView("view4");
    const view5Copy = deserializer.getView("view5");
    assert.deepStrictEqual(nodesToArrays(grid2.getViews()), [[view4Copy, view2Copy], [[view1Copy, view5Copy], view3Copy]]);
    grid2.layout(800, 600);
    assert.deepStrictEqual(view1Copy.size, [600, 400]);
    assert.deepStrictEqual(view2Copy.size, [600, 200]);
    assert.deepStrictEqual(view3Copy.size, [200, 400]);
    assert.deepStrictEqual(view4Copy.size, [200, 200]);
    assert.deepStrictEqual(view5Copy.size, [600, 0]);
    assert.deepStrictEqual(grid2.isViewVisible(view1Copy), true);
    assert.deepStrictEqual(grid2.isViewVisible(view2Copy), true);
    assert.deepStrictEqual(grid2.isViewVisible(view3Copy), true);
    assert.deepStrictEqual(grid2.isViewVisible(view4Copy), true);
    assert.deepStrictEqual(grid2.isViewVisible(view5Copy), false);
    grid2.setViewVisible(view5Copy, true);
    assert.deepStrictEqual(view1Copy.size, [600, 300]);
    assert.deepStrictEqual(view2Copy.size, [600, 200]);
    assert.deepStrictEqual(view3Copy.size, [200, 400]);
    assert.deepStrictEqual(view4Copy.size, [200, 200]);
    assert.deepStrictEqual(view5Copy.size, [600, 100]);
    assert.deepStrictEqual(grid2.isViewVisible(view1Copy), true);
    assert.deepStrictEqual(grid2.isViewVisible(view2Copy), true);
    assert.deepStrictEqual(grid2.isViewVisible(view3Copy), true);
    assert.deepStrictEqual(grid2.isViewVisible(view4Copy), true);
    assert.deepStrictEqual(grid2.isViewVisible(view5Copy), true);
  });
  test("serialize should store visibility and previous size even for first leaf", function() {
    const view1 = store.add(new TestSerializableView("view1", 50, Number.MAX_VALUE, 50, Number.MAX_VALUE));
    const grid = store.add(new SerializableGrid(view1));
    container.appendChild(grid.element);
    grid.layout(800, 600);
    const view2 = store.add(new TestSerializableView("view2", 50, Number.MAX_VALUE, 50, Number.MAX_VALUE));
    grid.addView(view2, 200, view1, Direction.Up);
    const view3 = store.add(new TestSerializableView("view3", 50, Number.MAX_VALUE, 50, Number.MAX_VALUE));
    grid.addView(view3, 200, view1, Direction.Right);
    const view4 = store.add(new TestSerializableView("view4", 50, Number.MAX_VALUE, 50, Number.MAX_VALUE));
    grid.addView(view4, 200, view2, Direction.Left);
    const view5 = store.add(new TestSerializableView("view5", 50, Number.MAX_VALUE, 50, Number.MAX_VALUE));
    grid.addView(view5, 100, view1, Direction.Down);
    assert.deepStrictEqual(view1.size, [600, 300]);
    assert.deepStrictEqual(view2.size, [600, 200]);
    assert.deepStrictEqual(view3.size, [200, 400]);
    assert.deepStrictEqual(view4.size, [200, 200]);
    assert.deepStrictEqual(view5.size, [600, 100]);
    grid.setViewVisible(view4, false);
    assert.deepStrictEqual(view1.size, [600, 300]);
    assert.deepStrictEqual(view2.size, [800, 200]);
    assert.deepStrictEqual(view3.size, [200, 400]);
    assert.deepStrictEqual(view4.size, [0, 200]);
    assert.deepStrictEqual(view5.size, [600, 100]);
    const json = grid.serialize();
    assert.deepStrictEqual(json, {
      orientation: 0,
      width: 800,
      height: 600,
      root: {
        type: "branch",
        data: [
          {
            type: "branch",
            data: [
              { type: "leaf", data: { name: "view4" }, size: 200, visible: false },
              { type: "leaf", data: { name: "view2" }, size: 800 }
            ],
            size: 200
          },
          {
            type: "branch",
            data: [
              {
                type: "branch",
                data: [
                  { type: "leaf", data: { name: "view1" }, size: 300 },
                  { type: "leaf", data: { name: "view5" }, size: 100 }
                ],
                size: 600
              },
              { type: "leaf", data: { name: "view3" }, size: 200 }
            ],
            size: 400
          }
        ],
        size: 800
      }
    });
    grid.dispose();
    const deserializer = new TestViewDeserializer(store);
    const grid2 = store.add(SerializableGrid.deserialize(json, deserializer));
    const view1Copy = deserializer.getView("view1");
    const view2Copy = deserializer.getView("view2");
    const view3Copy = deserializer.getView("view3");
    const view4Copy = deserializer.getView("view4");
    const view5Copy = deserializer.getView("view5");
    assert.deepStrictEqual(nodesToArrays(grid2.getViews()), [[view4Copy, view2Copy], [[view1Copy, view5Copy], view3Copy]]);
    grid2.layout(800, 600);
    assert.deepStrictEqual(view1Copy.size, [600, 300]);
    assert.deepStrictEqual(view2Copy.size, [800, 200]);
    assert.deepStrictEqual(view3Copy.size, [200, 400]);
    assert.deepStrictEqual(view4Copy.size, [0, 200]);
    assert.deepStrictEqual(view5Copy.size, [600, 100]);
    assert.deepStrictEqual(grid2.isViewVisible(view1Copy), true);
    assert.deepStrictEqual(grid2.isViewVisible(view2Copy), true);
    assert.deepStrictEqual(grid2.isViewVisible(view3Copy), true);
    assert.deepStrictEqual(grid2.isViewVisible(view4Copy), false);
    assert.deepStrictEqual(grid2.isViewVisible(view5Copy), true);
    grid2.setViewVisible(view4Copy, true);
    assert.deepStrictEqual(view1Copy.size, [600, 300]);
    assert.deepStrictEqual(view2Copy.size, [600, 200]);
    assert.deepStrictEqual(view3Copy.size, [200, 400]);
    assert.deepStrictEqual(view4Copy.size, [200, 200]);
    assert.deepStrictEqual(view5Copy.size, [600, 100]);
    assert.deepStrictEqual(grid2.isViewVisible(view1Copy), true);
    assert.deepStrictEqual(grid2.isViewVisible(view2Copy), true);
    assert.deepStrictEqual(grid2.isViewVisible(view3Copy), true);
    assert.deepStrictEqual(grid2.isViewVisible(view4Copy), true);
    assert.deepStrictEqual(grid2.isViewVisible(view5Copy), true);
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxiYXNlXFx0ZXN0XFxicm93c2VyXFx1aVxcZ3JpZFxcZ3JpZC50ZXN0LnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IGFzc2VydCBmcm9tICdhc3NlcnQnO1xuaW1wb3J0IHsgY3JlYXRlU2VyaWFsaXplZEdyaWQsIERpcmVjdGlvbiwgZ2V0UmVsYXRpdmVMb2NhdGlvbiwgR3JpZCwgR3JpZE5vZGUsIEdyaWROb2RlRGVzY3JpcHRvciwgSVNlcmlhbGl6YWJsZVZpZXcsIGlzR3JpZEJyYW5jaE5vZGUsIElWaWV3RGVzZXJpYWxpemVyLCBPcmllbnRhdGlvbiwgc2FuaXRpemVHcmlkTm9kZURlc2NyaXB0b3IsIFNlcmlhbGl6YWJsZUdyaWQsIFNpemluZyB9IGZyb20gJy4uLy4uLy4uLy4uL2Jyb3dzZXIvdWkvZ3JpZC9ncmlkLmpzJztcbmltcG9ydCB7IEV2ZW50IH0gZnJvbSAnLi4vLi4vLi4vLi4vY29tbW9uL2V2ZW50LmpzJztcbmltcG9ydCB7IGRlZXBDbG9uZSB9IGZyb20gJy4uLy4uLy4uLy4uL2NvbW1vbi9vYmplY3RzLmpzJztcbmltcG9ydCB7IG5vZGVzVG9BcnJheXMsIFRlc3RWaWV3IH0gZnJvbSAnLi91dGlsLmpzJztcbmltcG9ydCB7IGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi91dGlscy5qcyc7XG5pbXBvcnQgeyBEaXNwb3NhYmxlU3RvcmUgfSBmcm9tICcuLi8uLi8uLi8uLi9jb21tb24vbGlmZWN5Y2xlLmpzJztcblxuLy8gU2ltcGxlIGV4YW1wbGU6XG4vL1xuLy8gICstLS0tLSstLS0tLS0tLS0tLS0tLS0rXG4vLyAgfCAgNCAgfCAgICAgIDIgICAgICAgIHxcbi8vICArLS0tLS0rLS0tLS0tLS0tKy0tLS0tK1xuLy8gIHwgICAgICAgIDEgICAgICB8ICAgICB8XG4vLyAgKy0tLS0tLS0tLS0tLS0tLSsgIDMgIHxcbi8vICB8ICAgICAgICA1ICAgICAgfCAgICAgfFxuLy8gICstLS0tLS0tLS0tLS0tLS0rLS0tLS0rXG4vL1xuLy8gIFZcbi8vICArLUhcbi8vICB8ICstNFxuLy8gIHwgKy0yXG4vLyAgKy1IXG4vLyAgICArLVZcbi8vICAgIHwgKy0xXG4vLyAgICB8ICstNVxuLy8gICAgKy0zXG5cbnN1aXRlKCdHcmlkJywgZnVuY3Rpb24gKCkge1xuXG5cdGNvbnN0IHN0b3JlID0gZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlKCk7XG5cdGxldCBjb250YWluZXI6IEhUTUxFbGVtZW50O1xuXG5cdHNldHVwKGZ1bmN0aW9uICgpIHtcblx0XHRjb250YWluZXIgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdkaXYnKTtcblx0XHRjb250YWluZXIuc3R5bGUucG9zaXRpb24gPSAnYWJzb2x1dGUnO1xuXHRcdGNvbnRhaW5lci5zdHlsZS53aWR0aCA9IGAkezgwMH1weGA7XG5cdFx0Y29udGFpbmVyLnN0eWxlLmhlaWdodCA9IGAkezYwMH1weGA7XG5cdH0pO1xuXG5cdHRlc3QoJ2dldFJlbGF0aXZlTG9jYXRpb24nLCAoKSA9PiB7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChnZXRSZWxhdGl2ZUxvY2F0aW9uKE9yaWVudGF0aW9uLlZFUlRJQ0FMLCBbMF0sIERpcmVjdGlvbi5VcCksIFswXSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChnZXRSZWxhdGl2ZUxvY2F0aW9uKE9yaWVudGF0aW9uLlZFUlRJQ0FMLCBbMF0sIERpcmVjdGlvbi5Eb3duKSwgWzFdKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGdldFJlbGF0aXZlTG9jYXRpb24oT3JpZW50YXRpb24uVkVSVElDQUwsIFswXSwgRGlyZWN0aW9uLkxlZnQpLCBbMCwgMF0pO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoZ2V0UmVsYXRpdmVMb2NhdGlvbihPcmllbnRhdGlvbi5WRVJUSUNBTCwgWzBdLCBEaXJlY3Rpb24uUmlnaHQpLCBbMCwgMV0pO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChnZXRSZWxhdGl2ZUxvY2F0aW9uKE9yaWVudGF0aW9uLkhPUklaT05UQUwsIFswXSwgRGlyZWN0aW9uLlVwKSwgWzAsIDBdKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGdldFJlbGF0aXZlTG9jYXRpb24oT3JpZW50YXRpb24uSE9SSVpPTlRBTCwgWzBdLCBEaXJlY3Rpb24uRG93biksIFswLCAxXSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChnZXRSZWxhdGl2ZUxvY2F0aW9uKE9yaWVudGF0aW9uLkhPUklaT05UQUwsIFswXSwgRGlyZWN0aW9uLkxlZnQpLCBbMF0pO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoZ2V0UmVsYXRpdmVMb2NhdGlvbihPcmllbnRhdGlvbi5IT1JJWk9OVEFMLCBbMF0sIERpcmVjdGlvbi5SaWdodCksIFsxXSk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGdldFJlbGF0aXZlTG9jYXRpb24oT3JpZW50YXRpb24uVkVSVElDQUwsIFs0XSwgRGlyZWN0aW9uLlVwKSwgWzRdKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGdldFJlbGF0aXZlTG9jYXRpb24oT3JpZW50YXRpb24uVkVSVElDQUwsIFs0XSwgRGlyZWN0aW9uLkRvd24pLCBbNV0pO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoZ2V0UmVsYXRpdmVMb2NhdGlvbihPcmllbnRhdGlvbi5WRVJUSUNBTCwgWzRdLCBEaXJlY3Rpb24uTGVmdCksIFs0LCAwXSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChnZXRSZWxhdGl2ZUxvY2F0aW9uKE9yaWVudGF0aW9uLlZFUlRJQ0FMLCBbNF0sIERpcmVjdGlvbi5SaWdodCksIFs0LCAxXSk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGdldFJlbGF0aXZlTG9jYXRpb24oT3JpZW50YXRpb24uVkVSVElDQUwsIFswLCAwXSwgRGlyZWN0aW9uLlVwKSwgWzAsIDAsIDBdKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGdldFJlbGF0aXZlTG9jYXRpb24oT3JpZW50YXRpb24uVkVSVElDQUwsIFswLCAwXSwgRGlyZWN0aW9uLkRvd24pLCBbMCwgMCwgMV0pO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoZ2V0UmVsYXRpdmVMb2NhdGlvbihPcmllbnRhdGlvbi5WRVJUSUNBTCwgWzAsIDBdLCBEaXJlY3Rpb24uTGVmdCksIFswLCAwXSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChnZXRSZWxhdGl2ZUxvY2F0aW9uKE9yaWVudGF0aW9uLlZFUlRJQ0FMLCBbMCwgMF0sIERpcmVjdGlvbi5SaWdodCksIFswLCAxXSk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGdldFJlbGF0aXZlTG9jYXRpb24oT3JpZW50YXRpb24uVkVSVElDQUwsIFsxLCAyXSwgRGlyZWN0aW9uLlVwKSwgWzEsIDIsIDBdKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGdldFJlbGF0aXZlTG9jYXRpb24oT3JpZW50YXRpb24uVkVSVElDQUwsIFsxLCAyXSwgRGlyZWN0aW9uLkRvd24pLCBbMSwgMiwgMV0pO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoZ2V0UmVsYXRpdmVMb2NhdGlvbihPcmllbnRhdGlvbi5WRVJUSUNBTCwgWzEsIDJdLCBEaXJlY3Rpb24uTGVmdCksIFsxLCAyXSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChnZXRSZWxhdGl2ZUxvY2F0aW9uKE9yaWVudGF0aW9uLlZFUlRJQ0FMLCBbMSwgMl0sIERpcmVjdGlvbi5SaWdodCksIFsxLCAzXSk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGdldFJlbGF0aXZlTG9jYXRpb24oT3JpZW50YXRpb24uVkVSVElDQUwsIFsxLCAyLCAzXSwgRGlyZWN0aW9uLlVwKSwgWzEsIDIsIDNdKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGdldFJlbGF0aXZlTG9jYXRpb24oT3JpZW50YXRpb24uVkVSVElDQUwsIFsxLCAyLCAzXSwgRGlyZWN0aW9uLkRvd24pLCBbMSwgMiwgNF0pO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoZ2V0UmVsYXRpdmVMb2NhdGlvbihPcmllbnRhdGlvbi5WRVJUSUNBTCwgWzEsIDIsIDNdLCBEaXJlY3Rpb24uTGVmdCksIFsxLCAyLCAzLCAwXSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChnZXRSZWxhdGl2ZUxvY2F0aW9uKE9yaWVudGF0aW9uLlZFUlRJQ0FMLCBbMSwgMiwgM10sIERpcmVjdGlvbi5SaWdodCksIFsxLCAyLCAzLCAxXSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2VtcHR5JywgKCkgPT4ge1xuXHRcdGNvbnN0IHZpZXcxID0gc3RvcmUuYWRkKG5ldyBUZXN0VmlldygxMDAsIE51bWJlci5NQVhfVkFMVUUsIDEwMCwgTnVtYmVyLk1BWF9WQUxVRSkpO1xuXHRcdGNvbnN0IGdyaWR2aWV3ID0gc3RvcmUuYWRkKG5ldyBHcmlkKHZpZXcxKSk7XG5cdFx0Y29udGFpbmVyLmFwcGVuZENoaWxkKGdyaWR2aWV3LmVsZW1lbnQpO1xuXHRcdGdyaWR2aWV3LmxheW91dCg4MDAsIDYwMCk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHZpZXcxLnNpemUsIFs4MDAsIDYwMF0pO1xuXHR9KTtcblxuXHR0ZXN0KCd0d28gdmlld3MgdmVydGljYWxseScsIGZ1bmN0aW9uICgpIHtcblx0XHRjb25zdCB2aWV3MSA9IHN0b3JlLmFkZChuZXcgVGVzdFZpZXcoNTAsIE51bWJlci5NQVhfVkFMVUUsIDUwLCBOdW1iZXIuTUFYX1ZBTFVFKSk7XG5cdFx0Y29uc3QgZ3JpZCA9IHN0b3JlLmFkZChuZXcgR3JpZCh2aWV3MSkpO1xuXHRcdGNvbnRhaW5lci5hcHBlbmRDaGlsZChncmlkLmVsZW1lbnQpO1xuXHRcdGdyaWQubGF5b3V0KDgwMCwgNjAwKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHZpZXcxLnNpemUsIFs4MDAsIDYwMF0pO1xuXG5cdFx0Y29uc3QgdmlldzIgPSBzdG9yZS5hZGQobmV3IFRlc3RWaWV3KDUwLCBOdW1iZXIuTUFYX1ZBTFVFLCA1MCwgTnVtYmVyLk1BWF9WQUxVRSkpO1xuXHRcdGdyaWQuYWRkVmlldyh2aWV3MiwgMjAwLCB2aWV3MSwgRGlyZWN0aW9uLlVwKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHZpZXcxLnNpemUsIFs4MDAsIDQwMF0pO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwodmlldzIuc2l6ZSwgWzgwMCwgMjAwXSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3R3byB2aWV3cyBob3Jpem9udGFsbHknLCBmdW5jdGlvbiAoKSB7XG5cdFx0Y29uc3QgdmlldzEgPSBzdG9yZS5hZGQobmV3IFRlc3RWaWV3KDUwLCBOdW1iZXIuTUFYX1ZBTFVFLCA1MCwgTnVtYmVyLk1BWF9WQUxVRSkpO1xuXHRcdGNvbnN0IGdyaWQgPSBzdG9yZS5hZGQobmV3IEdyaWQodmlldzEpKTtcblx0XHRjb250YWluZXIuYXBwZW5kQ2hpbGQoZ3JpZC5lbGVtZW50KTtcblxuXHRcdGdyaWQubGF5b3V0KDgwMCwgNjAwKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHZpZXcxLnNpemUsIFs4MDAsIDYwMF0pO1xuXG5cdFx0Y29uc3QgdmlldzIgPSBzdG9yZS5hZGQobmV3IFRlc3RWaWV3KDUwLCBOdW1iZXIuTUFYX1ZBTFVFLCA1MCwgTnVtYmVyLk1BWF9WQUxVRSkpO1xuXHRcdGdyaWQuYWRkVmlldyh2aWV3MiwgMzAwLCB2aWV3MSwgRGlyZWN0aW9uLlJpZ2h0KTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHZpZXcxLnNpemUsIFs1MDAsIDYwMF0pO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwodmlldzIuc2l6ZSwgWzMwMCwgNjAwXSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3NpbXBsZSBsYXlvdXQnLCBmdW5jdGlvbiAoKSB7XG5cdFx0Y29uc3QgdmlldzEgPSBzdG9yZS5hZGQobmV3IFRlc3RWaWV3KDUwLCBOdW1iZXIuTUFYX1ZBTFVFLCA1MCwgTnVtYmVyLk1BWF9WQUxVRSkpO1xuXHRcdGNvbnN0IGdyaWQgPSBzdG9yZS5hZGQobmV3IEdyaWQodmlldzEpKTtcblx0XHRjb250YWluZXIuYXBwZW5kQ2hpbGQoZ3JpZC5lbGVtZW50KTtcblxuXHRcdGdyaWQubGF5b3V0KDgwMCwgNjAwKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHZpZXcxLnNpemUsIFs4MDAsIDYwMF0pO1xuXG5cdFx0Y29uc3QgdmlldzIgPSBzdG9yZS5hZGQobmV3IFRlc3RWaWV3KDUwLCBOdW1iZXIuTUFYX1ZBTFVFLCA1MCwgTnVtYmVyLk1BWF9WQUxVRSkpO1xuXHRcdGdyaWQuYWRkVmlldyh2aWV3MiwgMjAwLCB2aWV3MSwgRGlyZWN0aW9uLlVwKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHZpZXcxLnNpemUsIFs4MDAsIDQwMF0pO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwodmlldzIuc2l6ZSwgWzgwMCwgMjAwXSk7XG5cblx0XHRjb25zdCB2aWV3MyA9IHN0b3JlLmFkZChuZXcgVGVzdFZpZXcoNTAsIE51bWJlci5NQVhfVkFMVUUsIDUwLCBOdW1iZXIuTUFYX1ZBTFVFKSk7XG5cdFx0Z3JpZC5hZGRWaWV3KHZpZXczLCAyMDAsIHZpZXcxLCBEaXJlY3Rpb24uUmlnaHQpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwodmlldzEuc2l6ZSwgWzYwMCwgNDAwXSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh2aWV3Mi5zaXplLCBbODAwLCAyMDBdKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHZpZXczLnNpemUsIFsyMDAsIDQwMF0pO1xuXG5cdFx0Y29uc3QgdmlldzQgPSBzdG9yZS5hZGQobmV3IFRlc3RWaWV3KDUwLCBOdW1iZXIuTUFYX1ZBTFVFLCA1MCwgTnVtYmVyLk1BWF9WQUxVRSkpO1xuXHRcdGdyaWQuYWRkVmlldyh2aWV3NCwgMjAwLCB2aWV3MiwgRGlyZWN0aW9uLkxlZnQpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwodmlldzEuc2l6ZSwgWzYwMCwgNDAwXSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh2aWV3Mi5zaXplLCBbNjAwLCAyMDBdKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHZpZXczLnNpemUsIFsyMDAsIDQwMF0pO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwodmlldzQuc2l6ZSwgWzIwMCwgMjAwXSk7XG5cblx0XHRjb25zdCB2aWV3NSA9IHN0b3JlLmFkZChuZXcgVGVzdFZpZXcoNTAsIE51bWJlci5NQVhfVkFMVUUsIDUwLCBOdW1iZXIuTUFYX1ZBTFVFKSk7XG5cdFx0Z3JpZC5hZGRWaWV3KHZpZXc1LCAxMDAsIHZpZXcxLCBEaXJlY3Rpb24uRG93bik7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh2aWV3MS5zaXplLCBbNjAwLCAzMDBdKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHZpZXcyLnNpemUsIFs2MDAsIDIwMF0pO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwodmlldzMuc2l6ZSwgWzIwMCwgNDAwXSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh2aWV3NC5zaXplLCBbMjAwLCAyMDBdKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHZpZXc1LnNpemUsIFs2MDAsIDEwMF0pO1xuXHR9KTtcblxuXHR0ZXN0KCdhbm90aGVyIHNpbXBsZSBsYXlvdXQgd2l0aCBhdXRvbWF0aWMgc2l6ZSBkaXN0cmlidXRpb24nLCBmdW5jdGlvbiAoKSB7XG5cdFx0Y29uc3QgdmlldzEgPSBzdG9yZS5hZGQobmV3IFRlc3RWaWV3KDUwLCBOdW1iZXIuTUFYX1ZBTFVFLCA1MCwgTnVtYmVyLk1BWF9WQUxVRSkpO1xuXHRcdGNvbnN0IGdyaWQgPSBzdG9yZS5hZGQobmV3IEdyaWQodmlldzEpKTtcblx0XHRjb250YWluZXIuYXBwZW5kQ2hpbGQoZ3JpZC5lbGVtZW50KTtcblxuXHRcdGdyaWQubGF5b3V0KDgwMCwgNjAwKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHZpZXcxLnNpemUsIFs4MDAsIDYwMF0pO1xuXG5cdFx0Y29uc3QgdmlldzIgPSBzdG9yZS5hZGQobmV3IFRlc3RWaWV3KDUwLCBOdW1iZXIuTUFYX1ZBTFVFLCA1MCwgTnVtYmVyLk1BWF9WQUxVRSkpO1xuXHRcdGdyaWQuYWRkVmlldyh2aWV3MiwgU2l6aW5nLkRpc3RyaWJ1dGUsIHZpZXcxLCBEaXJlY3Rpb24uTGVmdCk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh2aWV3MS5zaXplLCBbNDAwLCA2MDBdKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHZpZXcyLnNpemUsIFs0MDAsIDYwMF0pO1xuXG5cdFx0Y29uc3QgdmlldzMgPSBzdG9yZS5hZGQobmV3IFRlc3RWaWV3KDUwLCBOdW1iZXIuTUFYX1ZBTFVFLCA1MCwgTnVtYmVyLk1BWF9WQUxVRSkpO1xuXHRcdGdyaWQuYWRkVmlldyh2aWV3MywgU2l6aW5nLkRpc3RyaWJ1dGUsIHZpZXcxLCBEaXJlY3Rpb24uUmlnaHQpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwodmlldzEuc2l6ZSwgWzI2NiwgNjAwXSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh2aWV3Mi5zaXplLCBbMjY2LCA2MDBdKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHZpZXczLnNpemUsIFsyNjgsIDYwMF0pO1xuXG5cdFx0Y29uc3QgdmlldzQgPSBzdG9yZS5hZGQobmV3IFRlc3RWaWV3KDUwLCBOdW1iZXIuTUFYX1ZBTFVFLCA1MCwgTnVtYmVyLk1BWF9WQUxVRSkpO1xuXHRcdGdyaWQuYWRkVmlldyh2aWV3NCwgU2l6aW5nLkRpc3RyaWJ1dGUsIHZpZXcyLCBEaXJlY3Rpb24uRG93bik7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh2aWV3MS5zaXplLCBbMjY2LCA2MDBdKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHZpZXcyLnNpemUsIFsyNjYsIDMwMF0pO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwodmlldzMuc2l6ZSwgWzI2OCwgNjAwXSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh2aWV3NC5zaXplLCBbMjY2LCAzMDBdKTtcblxuXHRcdGNvbnN0IHZpZXc1ID0gc3RvcmUuYWRkKG5ldyBUZXN0Vmlldyg1MCwgTnVtYmVyLk1BWF9WQUxVRSwgNTAsIE51bWJlci5NQVhfVkFMVUUpKTtcblx0XHRncmlkLmFkZFZpZXcodmlldzUsIFNpemluZy5EaXN0cmlidXRlLCB2aWV3MywgRGlyZWN0aW9uLlVwKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHZpZXcxLnNpemUsIFsyNjYsIDYwMF0pO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwodmlldzIuc2l6ZSwgWzI2NiwgMzAwXSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh2aWV3My5zaXplLCBbMjY4LCAzMDBdKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHZpZXc0LnNpemUsIFsyNjYsIDMwMF0pO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwodmlldzUuc2l6ZSwgWzI2OCwgMzAwXSk7XG5cblx0XHRjb25zdCB2aWV3NiA9IHN0b3JlLmFkZChuZXcgVGVzdFZpZXcoNTAsIE51bWJlci5NQVhfVkFMVUUsIDUwLCBOdW1iZXIuTUFYX1ZBTFVFKSk7XG5cdFx0Z3JpZC5hZGRWaWV3KHZpZXc2LCBTaXppbmcuRGlzdHJpYnV0ZSwgdmlldzMsIERpcmVjdGlvbi5Eb3duKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHZpZXcxLnNpemUsIFsyNjYsIDYwMF0pO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwodmlldzIuc2l6ZSwgWzI2NiwgMzAwXSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh2aWV3My5zaXplLCBbMjY4LCAyMDBdKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHZpZXc0LnNpemUsIFsyNjYsIDMwMF0pO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwodmlldzUuc2l6ZSwgWzI2OCwgMjAwXSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh2aWV3Ni5zaXplLCBbMjY4LCAyMDBdKTtcblx0fSk7XG5cblx0dGVzdCgnYW5vdGhlciBzaW1wbGUgbGF5b3V0IHdpdGggc3BsaXQgc2l6ZSBkaXN0cmlidXRpb24nLCBmdW5jdGlvbiAoKSB7XG5cdFx0Y29uc3QgdmlldzEgPSBzdG9yZS5hZGQobmV3IFRlc3RWaWV3KDUwLCBOdW1iZXIuTUFYX1ZBTFVFLCA1MCwgTnVtYmVyLk1BWF9WQUxVRSkpO1xuXHRcdGNvbnN0IGdyaWQgPSBzdG9yZS5hZGQobmV3IEdyaWQodmlldzEpKTtcblx0XHRjb250YWluZXIuYXBwZW5kQ2hpbGQoZ3JpZC5lbGVtZW50KTtcblxuXHRcdGdyaWQubGF5b3V0KDgwMCwgNjAwKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHZpZXcxLnNpemUsIFs4MDAsIDYwMF0pO1xuXG5cdFx0Y29uc3QgdmlldzIgPSBzdG9yZS5hZGQobmV3IFRlc3RWaWV3KDUwLCBOdW1iZXIuTUFYX1ZBTFVFLCA1MCwgTnVtYmVyLk1BWF9WQUxVRSkpO1xuXHRcdGdyaWQuYWRkVmlldyh2aWV3MiwgU2l6aW5nLlNwbGl0LCB2aWV3MSwgRGlyZWN0aW9uLkxlZnQpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwodmlldzEuc2l6ZSwgWzQwMCwgNjAwXSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh2aWV3Mi5zaXplLCBbNDAwLCA2MDBdKTtcblxuXHRcdGNvbnN0IHZpZXczID0gc3RvcmUuYWRkKG5ldyBUZXN0Vmlldyg1MCwgTnVtYmVyLk1BWF9WQUxVRSwgNTAsIE51bWJlci5NQVhfVkFMVUUpKTtcblx0XHRncmlkLmFkZFZpZXcodmlldzMsIFNpemluZy5TcGxpdCwgdmlldzEsIERpcmVjdGlvbi5SaWdodCk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh2aWV3MS5zaXplLCBbMjAwLCA2MDBdKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHZpZXcyLnNpemUsIFs0MDAsIDYwMF0pO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwodmlldzMuc2l6ZSwgWzIwMCwgNjAwXSk7XG5cblx0XHRjb25zdCB2aWV3NCA9IHN0b3JlLmFkZChuZXcgVGVzdFZpZXcoNTAsIE51bWJlci5NQVhfVkFMVUUsIDUwLCBOdW1iZXIuTUFYX1ZBTFVFKSk7XG5cdFx0Z3JpZC5hZGRWaWV3KHZpZXc0LCBTaXppbmcuU3BsaXQsIHZpZXcyLCBEaXJlY3Rpb24uRG93bik7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh2aWV3MS5zaXplLCBbMjAwLCA2MDBdKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHZpZXcyLnNpemUsIFs0MDAsIDMwMF0pO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwodmlldzMuc2l6ZSwgWzIwMCwgNjAwXSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh2aWV3NC5zaXplLCBbNDAwLCAzMDBdKTtcblxuXHRcdGNvbnN0IHZpZXc1ID0gc3RvcmUuYWRkKG5ldyBUZXN0Vmlldyg1MCwgTnVtYmVyLk1BWF9WQUxVRSwgNTAsIE51bWJlci5NQVhfVkFMVUUpKTtcblx0XHRncmlkLmFkZFZpZXcodmlldzUsIFNpemluZy5TcGxpdCwgdmlldzMsIERpcmVjdGlvbi5VcCk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh2aWV3MS5zaXplLCBbMjAwLCA2MDBdKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHZpZXcyLnNpemUsIFs0MDAsIDMwMF0pO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwodmlldzMuc2l6ZSwgWzIwMCwgMzAwXSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh2aWV3NC5zaXplLCBbNDAwLCAzMDBdKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHZpZXc1LnNpemUsIFsyMDAsIDMwMF0pO1xuXG5cdFx0Y29uc3QgdmlldzYgPSBzdG9yZS5hZGQobmV3IFRlc3RWaWV3KDUwLCBOdW1iZXIuTUFYX1ZBTFVFLCA1MCwgTnVtYmVyLk1BWF9WQUxVRSkpO1xuXHRcdGdyaWQuYWRkVmlldyh2aWV3NiwgU2l6aW5nLlNwbGl0LCB2aWV3MywgRGlyZWN0aW9uLkRvd24pO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwodmlldzEuc2l6ZSwgWzIwMCwgNjAwXSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh2aWV3Mi5zaXplLCBbNDAwLCAzMDBdKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHZpZXczLnNpemUsIFsyMDAsIDE1MF0pO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwodmlldzQuc2l6ZSwgWzQwMCwgMzAwXSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh2aWV3NS5zaXplLCBbMjAwLCAzMDBdKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHZpZXc2LnNpemUsIFsyMDAsIDE1MF0pO1xuXHR9KTtcblxuXHR0ZXN0KCczLzIgbGF5b3V0IHdpdGggc3BsaXQnLCBmdW5jdGlvbiAoKSB7XG5cdFx0Y29uc3QgdmlldzEgPSBzdG9yZS5hZGQobmV3IFRlc3RWaWV3KDUwLCBOdW1iZXIuTUFYX1ZBTFVFLCA1MCwgTnVtYmVyLk1BWF9WQUxVRSkpO1xuXHRcdGNvbnN0IGdyaWQgPSBzdG9yZS5hZGQobmV3IEdyaWQodmlldzEpKTtcblx0XHRjb250YWluZXIuYXBwZW5kQ2hpbGQoZ3JpZC5lbGVtZW50KTtcblxuXHRcdGdyaWQubGF5b3V0KDgwMCwgNjAwKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHZpZXcxLnNpemUsIFs4MDAsIDYwMF0pO1xuXG5cdFx0Y29uc3QgdmlldzIgPSBzdG9yZS5hZGQobmV3IFRlc3RWaWV3KDUwLCBOdW1iZXIuTUFYX1ZBTFVFLCA1MCwgTnVtYmVyLk1BWF9WQUxVRSkpO1xuXHRcdGdyaWQuYWRkVmlldyh2aWV3MiwgU2l6aW5nLlNwbGl0LCB2aWV3MSwgRGlyZWN0aW9uLkRvd24pO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwodmlldzEuc2l6ZSwgWzgwMCwgMzAwXSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh2aWV3Mi5zaXplLCBbODAwLCAzMDBdKTtcblxuXHRcdGNvbnN0IHZpZXczID0gc3RvcmUuYWRkKG5ldyBUZXN0Vmlldyg1MCwgTnVtYmVyLk1BWF9WQUxVRSwgNTAsIE51bWJlci5NQVhfVkFMVUUpKTtcblx0XHRncmlkLmFkZFZpZXcodmlldzMsIFNpemluZy5TcGxpdCwgdmlldzIsIERpcmVjdGlvbi5SaWdodCk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh2aWV3MS5zaXplLCBbODAwLCAzMDBdKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHZpZXcyLnNpemUsIFs0MDAsIDMwMF0pO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwodmlldzMuc2l6ZSwgWzQwMCwgMzAwXSk7XG5cblx0XHRjb25zdCB2aWV3NCA9IHN0b3JlLmFkZChuZXcgVGVzdFZpZXcoNTAsIE51bWJlci5NQVhfVkFMVUUsIDUwLCBOdW1iZXIuTUFYX1ZBTFVFKSk7XG5cdFx0Z3JpZC5hZGRWaWV3KHZpZXc0LCBTaXppbmcuU3BsaXQsIHZpZXcxLCBEaXJlY3Rpb24uUmlnaHQpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwodmlldzEuc2l6ZSwgWzQwMCwgMzAwXSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh2aWV3Mi5zaXplLCBbNDAwLCAzMDBdKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHZpZXczLnNpemUsIFs0MDAsIDMwMF0pO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwodmlldzQuc2l6ZSwgWzQwMCwgMzAwXSk7XG5cblx0XHRjb25zdCB2aWV3NSA9IHN0b3JlLmFkZChuZXcgVGVzdFZpZXcoNTAsIE51bWJlci5NQVhfVkFMVUUsIDUwLCBOdW1iZXIuTUFYX1ZBTFVFKSk7XG5cdFx0Z3JpZC5hZGRWaWV3KHZpZXc1LCBTaXppbmcuU3BsaXQsIHZpZXcxLCBEaXJlY3Rpb24uUmlnaHQpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwodmlldzEuc2l6ZSwgWzIwMCwgMzAwXSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh2aWV3Mi5zaXplLCBbNDAwLCAzMDBdKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHZpZXczLnNpemUsIFs0MDAsIDMwMF0pO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwodmlldzQuc2l6ZSwgWzQwMCwgMzAwXSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh2aWV3NS5zaXplLCBbMjAwLCAzMDBdKTtcblx0fSk7XG5cblx0dGVzdCgnc2l6aW5nIHNob3VsZCBiZSBjb3JyZWN0IGFmdGVyIGJyYW5jaCBkZW1vdGlvbiAjNTA1NjQnLCBmdW5jdGlvbiAoKSB7XG5cdFx0Y29uc3QgdmlldzEgPSBzdG9yZS5hZGQobmV3IFRlc3RWaWV3KDUwLCBOdW1iZXIuTUFYX1ZBTFVFLCA1MCwgTnVtYmVyLk1BWF9WQUxVRSkpO1xuXHRcdGNvbnN0IGdyaWQgPSBzdG9yZS5hZGQobmV3IEdyaWQodmlldzEpKTtcblx0XHRjb250YWluZXIuYXBwZW5kQ2hpbGQoZ3JpZC5lbGVtZW50KTtcblxuXHRcdGdyaWQubGF5b3V0KDgwMCwgNjAwKTtcblxuXHRcdGNvbnN0IHZpZXcyID0gc3RvcmUuYWRkKG5ldyBUZXN0Vmlldyg1MCwgTnVtYmVyLk1BWF9WQUxVRSwgNTAsIE51bWJlci5NQVhfVkFMVUUpKTtcblx0XHRncmlkLmFkZFZpZXcodmlldzIsIFNpemluZy5TcGxpdCwgdmlldzEsIERpcmVjdGlvbi5SaWdodCk7XG5cblx0XHRjb25zdCB2aWV3MyA9IHN0b3JlLmFkZChuZXcgVGVzdFZpZXcoNTAsIE51bWJlci5NQVhfVkFMVUUsIDUwLCBOdW1iZXIuTUFYX1ZBTFVFKSk7XG5cdFx0Z3JpZC5hZGRWaWV3KHZpZXczLCBTaXppbmcuU3BsaXQsIHZpZXcyLCBEaXJlY3Rpb24uRG93bik7XG5cblx0XHRjb25zdCB2aWV3NCA9IHN0b3JlLmFkZChuZXcgVGVzdFZpZXcoNTAsIE51bWJlci5NQVhfVkFMVUUsIDUwLCBOdW1iZXIuTUFYX1ZBTFVFKSk7XG5cdFx0Z3JpZC5hZGRWaWV3KHZpZXc0LCBTaXppbmcuU3BsaXQsIHZpZXcyLCBEaXJlY3Rpb24uUmlnaHQpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwodmlldzEuc2l6ZSwgWzQwMCwgNjAwXSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh2aWV3Mi5zaXplLCBbMjAwLCAzMDBdKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHZpZXczLnNpemUsIFs0MDAsIDMwMF0pO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwodmlldzQuc2l6ZSwgWzIwMCwgMzAwXSk7XG5cblx0XHRncmlkLnJlbW92ZVZpZXcodmlldzMpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwodmlldzEuc2l6ZSwgWzQwMCwgNjAwXSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh2aWV3Mi5zaXplLCBbMjAwLCA2MDBdKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHZpZXc0LnNpemUsIFsyMDAsIDYwMF0pO1xuXHR9KTtcblxuXHR0ZXN0KCdzaXppbmcgc2hvdWxkIGJlIGNvcnJlY3QgYWZ0ZXIgYnJhbmNoIGRlbW90aW9uICM1MDY3NScsIGZ1bmN0aW9uICgpIHtcblx0XHRjb25zdCB2aWV3MSA9IHN0b3JlLmFkZChuZXcgVGVzdFZpZXcoNTAsIE51bWJlci5NQVhfVkFMVUUsIDUwLCBOdW1iZXIuTUFYX1ZBTFVFKSk7XG5cdFx0Y29uc3QgZ3JpZCA9IHN0b3JlLmFkZChuZXcgR3JpZCh2aWV3MSkpO1xuXHRcdGNvbnRhaW5lci5hcHBlbmRDaGlsZChncmlkLmVsZW1lbnQpO1xuXG5cdFx0Z3JpZC5sYXlvdXQoODAwLCA2MDApO1xuXG5cdFx0Y29uc3QgdmlldzIgPSBzdG9yZS5hZGQobmV3IFRlc3RWaWV3KDUwLCBOdW1iZXIuTUFYX1ZBTFVFLCA1MCwgTnVtYmVyLk1BWF9WQUxVRSkpO1xuXHRcdGdyaWQuYWRkVmlldyh2aWV3MiwgU2l6aW5nLkRpc3RyaWJ1dGUsIHZpZXcxLCBEaXJlY3Rpb24uRG93bik7XG5cblx0XHRjb25zdCB2aWV3MyA9IHN0b3JlLmFkZChuZXcgVGVzdFZpZXcoNTAsIE51bWJlci5NQVhfVkFMVUUsIDUwLCBOdW1iZXIuTUFYX1ZBTFVFKSk7XG5cdFx0Z3JpZC5hZGRWaWV3KHZpZXczLCBTaXppbmcuRGlzdHJpYnV0ZSwgdmlldzIsIERpcmVjdGlvbi5Eb3duKTtcblxuXHRcdGNvbnN0IHZpZXc0ID0gc3RvcmUuYWRkKG5ldyBUZXN0Vmlldyg1MCwgTnVtYmVyLk1BWF9WQUxVRSwgNTAsIE51bWJlci5NQVhfVkFMVUUpKTtcblx0XHRncmlkLmFkZFZpZXcodmlldzQsIFNpemluZy5EaXN0cmlidXRlLCB2aWV3MywgRGlyZWN0aW9uLlJpZ2h0KTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHZpZXcxLnNpemUsIFs4MDAsIDIwMF0pO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwodmlldzIuc2l6ZSwgWzgwMCwgMjAwXSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh2aWV3My5zaXplLCBbNDAwLCAyMDBdKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHZpZXc0LnNpemUsIFs0MDAsIDIwMF0pO1xuXG5cdFx0Z3JpZC5yZW1vdmVWaWV3KHZpZXczLCBTaXppbmcuRGlzdHJpYnV0ZSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh2aWV3MS5zaXplLCBbODAwLCAyMDBdKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHZpZXcyLnNpemUsIFs4MDAsIDIwMF0pO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwodmlldzQuc2l6ZSwgWzgwMCwgMjAwXSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2dldE5laWdoYm9yVmlld3Mgc2hvdWxkIHdvcmsgb24gc2luZ2xlIHZpZXcgbGF5b3V0JywgZnVuY3Rpb24gKCkge1xuXHRcdGNvbnN0IHZpZXcxID0gc3RvcmUuYWRkKG5ldyBUZXN0Vmlldyg1MCwgTnVtYmVyLk1BWF9WQUxVRSwgNTAsIE51bWJlci5NQVhfVkFMVUUpKTtcblx0XHRjb25zdCBncmlkID0gc3RvcmUuYWRkKG5ldyBHcmlkKHZpZXcxKSk7XG5cdFx0Y29udGFpbmVyLmFwcGVuZENoaWxkKGdyaWQuZWxlbWVudCk7XG5cblx0XHRncmlkLmxheW91dCg4MDAsIDYwMCk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGdyaWQuZ2V0TmVpZ2hib3JWaWV3cyh2aWV3MSwgRGlyZWN0aW9uLlVwKSwgW10pO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoZ3JpZC5nZXROZWlnaGJvclZpZXdzKHZpZXcxLCBEaXJlY3Rpb24uUmlnaHQpLCBbXSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChncmlkLmdldE5laWdoYm9yVmlld3ModmlldzEsIERpcmVjdGlvbi5Eb3duKSwgW10pO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoZ3JpZC5nZXROZWlnaGJvclZpZXdzKHZpZXcxLCBEaXJlY3Rpb24uTGVmdCksIFtdKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoZ3JpZC5nZXROZWlnaGJvclZpZXdzKHZpZXcxLCBEaXJlY3Rpb24uVXAsIHRydWUpLCBbdmlldzFdKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGdyaWQuZ2V0TmVpZ2hib3JWaWV3cyh2aWV3MSwgRGlyZWN0aW9uLlJpZ2h0LCB0cnVlKSwgW3ZpZXcxXSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChncmlkLmdldE5laWdoYm9yVmlld3ModmlldzEsIERpcmVjdGlvbi5Eb3duLCB0cnVlKSwgW3ZpZXcxXSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChncmlkLmdldE5laWdoYm9yVmlld3ModmlldzEsIERpcmVjdGlvbi5MZWZ0LCB0cnVlKSwgW3ZpZXcxXSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2dldE5laWdoYm9yVmlld3Mgc2hvdWxkIHdvcmsgb24gc2ltcGxlIGxheW91dCcsIGZ1bmN0aW9uICgpIHtcblx0XHRjb25zdCB2aWV3MSA9IHN0b3JlLmFkZChuZXcgVGVzdFZpZXcoNTAsIE51bWJlci5NQVhfVkFMVUUsIDUwLCBOdW1iZXIuTUFYX1ZBTFVFKSk7XG5cdFx0Y29uc3QgZ3JpZCA9IHN0b3JlLmFkZChuZXcgR3JpZCh2aWV3MSkpO1xuXHRcdGNvbnRhaW5lci5hcHBlbmRDaGlsZChncmlkLmVsZW1lbnQpO1xuXG5cdFx0Z3JpZC5sYXlvdXQoODAwLCA2MDApO1xuXG5cdFx0Y29uc3QgdmlldzIgPSBzdG9yZS5hZGQobmV3IFRlc3RWaWV3KDUwLCBOdW1iZXIuTUFYX1ZBTFVFLCA1MCwgTnVtYmVyLk1BWF9WQUxVRSkpO1xuXHRcdGdyaWQuYWRkVmlldyh2aWV3MiwgU2l6aW5nLkRpc3RyaWJ1dGUsIHZpZXcxLCBEaXJlY3Rpb24uRG93bik7XG5cblx0XHRjb25zdCB2aWV3MyA9IHN0b3JlLmFkZChuZXcgVGVzdFZpZXcoNTAsIE51bWJlci5NQVhfVkFMVUUsIDUwLCBOdW1iZXIuTUFYX1ZBTFVFKSk7XG5cdFx0Z3JpZC5hZGRWaWV3KHZpZXczLCBTaXppbmcuRGlzdHJpYnV0ZSwgdmlldzIsIERpcmVjdGlvbi5Eb3duKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoZ3JpZC5nZXROZWlnaGJvclZpZXdzKHZpZXcxLCBEaXJlY3Rpb24uVXApLCBbXSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChncmlkLmdldE5laWdoYm9yVmlld3ModmlldzEsIERpcmVjdGlvbi5SaWdodCksIFtdKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGdyaWQuZ2V0TmVpZ2hib3JWaWV3cyh2aWV3MSwgRGlyZWN0aW9uLkRvd24pLCBbdmlldzJdKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGdyaWQuZ2V0TmVpZ2hib3JWaWV3cyh2aWV3MSwgRGlyZWN0aW9uLkxlZnQpLCBbXSk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGdyaWQuZ2V0TmVpZ2hib3JWaWV3cyh2aWV3MSwgRGlyZWN0aW9uLlVwLCB0cnVlKSwgW3ZpZXczXSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChncmlkLmdldE5laWdoYm9yVmlld3ModmlldzEsIERpcmVjdGlvbi5SaWdodCwgdHJ1ZSksIFt2aWV3MV0pO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoZ3JpZC5nZXROZWlnaGJvclZpZXdzKHZpZXcxLCBEaXJlY3Rpb24uRG93biwgdHJ1ZSksIFt2aWV3Ml0pO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoZ3JpZC5nZXROZWlnaGJvclZpZXdzKHZpZXcxLCBEaXJlY3Rpb24uTGVmdCwgdHJ1ZSksIFt2aWV3MV0pO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChncmlkLmdldE5laWdoYm9yVmlld3ModmlldzIsIERpcmVjdGlvbi5VcCksIFt2aWV3MV0pO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoZ3JpZC5nZXROZWlnaGJvclZpZXdzKHZpZXcyLCBEaXJlY3Rpb24uUmlnaHQpLCBbXSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChncmlkLmdldE5laWdoYm9yVmlld3ModmlldzIsIERpcmVjdGlvbi5Eb3duKSwgW3ZpZXczXSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChncmlkLmdldE5laWdoYm9yVmlld3ModmlldzIsIERpcmVjdGlvbi5MZWZ0KSwgW10pO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChncmlkLmdldE5laWdoYm9yVmlld3ModmlldzIsIERpcmVjdGlvbi5VcCwgdHJ1ZSksIFt2aWV3MV0pO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoZ3JpZC5nZXROZWlnaGJvclZpZXdzKHZpZXcyLCBEaXJlY3Rpb24uUmlnaHQsIHRydWUpLCBbdmlldzJdKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGdyaWQuZ2V0TmVpZ2hib3JWaWV3cyh2aWV3MiwgRGlyZWN0aW9uLkRvd24sIHRydWUpLCBbdmlldzNdKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGdyaWQuZ2V0TmVpZ2hib3JWaWV3cyh2aWV3MiwgRGlyZWN0aW9uLkxlZnQsIHRydWUpLCBbdmlldzJdKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoZ3JpZC5nZXROZWlnaGJvclZpZXdzKHZpZXczLCBEaXJlY3Rpb24uVXApLCBbdmlldzJdKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGdyaWQuZ2V0TmVpZ2hib3JWaWV3cyh2aWV3MywgRGlyZWN0aW9uLlJpZ2h0KSwgW10pO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoZ3JpZC5nZXROZWlnaGJvclZpZXdzKHZpZXczLCBEaXJlY3Rpb24uRG93biksIFtdKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGdyaWQuZ2V0TmVpZ2hib3JWaWV3cyh2aWV3MywgRGlyZWN0aW9uLkxlZnQpLCBbXSk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGdyaWQuZ2V0TmVpZ2hib3JWaWV3cyh2aWV3MywgRGlyZWN0aW9uLlVwLCB0cnVlKSwgW3ZpZXcyXSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChncmlkLmdldE5laWdoYm9yVmlld3ModmlldzMsIERpcmVjdGlvbi5SaWdodCwgdHJ1ZSksIFt2aWV3M10pO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoZ3JpZC5nZXROZWlnaGJvclZpZXdzKHZpZXczLCBEaXJlY3Rpb24uRG93biwgdHJ1ZSksIFt2aWV3MV0pO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoZ3JpZC5nZXROZWlnaGJvclZpZXdzKHZpZXczLCBEaXJlY3Rpb24uTGVmdCwgdHJ1ZSksIFt2aWV3M10pO1xuXHR9KTtcblxuXHR0ZXN0KCdnZXROZWlnaGJvclZpZXdzIHNob3VsZCB3b3JrIG9uIGEgY29tcGxleCBsYXlvdXQnLCBmdW5jdGlvbiAoKSB7XG5cdFx0Y29uc3QgdmlldzEgPSBzdG9yZS5hZGQobmV3IFRlc3RWaWV3KDUwLCBOdW1iZXIuTUFYX1ZBTFVFLCA1MCwgTnVtYmVyLk1BWF9WQUxVRSkpO1xuXHRcdGNvbnN0IGdyaWQgPSBzdG9yZS5hZGQobmV3IEdyaWQodmlldzEpKTtcblx0XHRjb250YWluZXIuYXBwZW5kQ2hpbGQoZ3JpZC5lbGVtZW50KTtcblxuXHRcdGdyaWQubGF5b3V0KDgwMCwgNjAwKTtcblxuXHRcdGNvbnN0IHZpZXcyID0gc3RvcmUuYWRkKG5ldyBUZXN0Vmlldyg1MCwgTnVtYmVyLk1BWF9WQUxVRSwgNTAsIE51bWJlci5NQVhfVkFMVUUpKTtcblx0XHRncmlkLmFkZFZpZXcodmlldzIsIFNpemluZy5EaXN0cmlidXRlLCB2aWV3MSwgRGlyZWN0aW9uLkRvd24pO1xuXG5cdFx0Y29uc3QgdmlldzMgPSBzdG9yZS5hZGQobmV3IFRlc3RWaWV3KDUwLCBOdW1iZXIuTUFYX1ZBTFVFLCA1MCwgTnVtYmVyLk1BWF9WQUxVRSkpO1xuXHRcdGdyaWQuYWRkVmlldyh2aWV3MywgU2l6aW5nLkRpc3RyaWJ1dGUsIHZpZXcyLCBEaXJlY3Rpb24uRG93bik7XG5cblx0XHRjb25zdCB2aWV3NCA9IHN0b3JlLmFkZChuZXcgVGVzdFZpZXcoNTAsIE51bWJlci5NQVhfVkFMVUUsIDUwLCBOdW1iZXIuTUFYX1ZBTFVFKSk7XG5cdFx0Z3JpZC5hZGRWaWV3KHZpZXc0LCBTaXppbmcuRGlzdHJpYnV0ZSwgdmlldzIsIERpcmVjdGlvbi5SaWdodCk7XG5cblx0XHRjb25zdCB2aWV3NSA9IHN0b3JlLmFkZChuZXcgVGVzdFZpZXcoNTAsIE51bWJlci5NQVhfVkFMVUUsIDUwLCBOdW1iZXIuTUFYX1ZBTFVFKSk7XG5cdFx0Z3JpZC5hZGRWaWV3KHZpZXc1LCBTaXppbmcuRGlzdHJpYnV0ZSwgdmlldzQsIERpcmVjdGlvbi5Eb3duKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoZ3JpZC5nZXROZWlnaGJvclZpZXdzKHZpZXcxLCBEaXJlY3Rpb24uVXApLCBbXSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChncmlkLmdldE5laWdoYm9yVmlld3ModmlldzEsIERpcmVjdGlvbi5SaWdodCksIFtdKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGdyaWQuZ2V0TmVpZ2hib3JWaWV3cyh2aWV3MSwgRGlyZWN0aW9uLkRvd24pLCBbdmlldzIsIHZpZXc0XSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChncmlkLmdldE5laWdoYm9yVmlld3ModmlldzEsIERpcmVjdGlvbi5MZWZ0KSwgW10pO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoZ3JpZC5nZXROZWlnaGJvclZpZXdzKHZpZXcyLCBEaXJlY3Rpb24uVXApLCBbdmlldzFdKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGdyaWQuZ2V0TmVpZ2hib3JWaWV3cyh2aWV3MiwgRGlyZWN0aW9uLlJpZ2h0KSwgW3ZpZXc0LCB2aWV3NV0pO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoZ3JpZC5nZXROZWlnaGJvclZpZXdzKHZpZXcyLCBEaXJlY3Rpb24uRG93biksIFt2aWV3M10pO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoZ3JpZC5nZXROZWlnaGJvclZpZXdzKHZpZXcyLCBEaXJlY3Rpb24uTGVmdCksIFtdKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGdyaWQuZ2V0TmVpZ2hib3JWaWV3cyh2aWV3NCwgRGlyZWN0aW9uLlVwKSwgW3ZpZXcxXSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChncmlkLmdldE5laWdoYm9yVmlld3ModmlldzQsIERpcmVjdGlvbi5SaWdodCksIFtdKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGdyaWQuZ2V0TmVpZ2hib3JWaWV3cyh2aWV3NCwgRGlyZWN0aW9uLkRvd24pLCBbdmlldzVdKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGdyaWQuZ2V0TmVpZ2hib3JWaWV3cyh2aWV3NCwgRGlyZWN0aW9uLkxlZnQpLCBbdmlldzJdKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGdyaWQuZ2V0TmVpZ2hib3JWaWV3cyh2aWV3NSwgRGlyZWN0aW9uLlVwKSwgW3ZpZXc0XSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChncmlkLmdldE5laWdoYm9yVmlld3ModmlldzUsIERpcmVjdGlvbi5SaWdodCksIFtdKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGdyaWQuZ2V0TmVpZ2hib3JWaWV3cyh2aWV3NSwgRGlyZWN0aW9uLkRvd24pLCBbdmlldzNdKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGdyaWQuZ2V0TmVpZ2hib3JWaWV3cyh2aWV3NSwgRGlyZWN0aW9uLkxlZnQpLCBbdmlldzJdKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGdyaWQuZ2V0TmVpZ2hib3JWaWV3cyh2aWV3MywgRGlyZWN0aW9uLlVwKSwgW3ZpZXcyLCB2aWV3NV0pO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoZ3JpZC5nZXROZWlnaGJvclZpZXdzKHZpZXczLCBEaXJlY3Rpb24uUmlnaHQpLCBbXSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChncmlkLmdldE5laWdoYm9yVmlld3ModmlldzMsIERpcmVjdGlvbi5Eb3duKSwgW10pO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoZ3JpZC5nZXROZWlnaGJvclZpZXdzKHZpZXczLCBEaXJlY3Rpb24uTGVmdCksIFtdKTtcblx0fSk7XG5cblx0dGVzdCgnZ2V0TmVpZ2hib3JWaWV3cyBzaG91bGQgd29yayBvbiBhbm90aGVyIHNpbXBsZSBsYXlvdXQnLCBmdW5jdGlvbiAoKSB7XG5cdFx0Y29uc3QgdmlldzEgPSBzdG9yZS5hZGQobmV3IFRlc3RWaWV3KDUwLCBOdW1iZXIuTUFYX1ZBTFVFLCA1MCwgTnVtYmVyLk1BWF9WQUxVRSkpO1xuXHRcdGNvbnN0IGdyaWQgPSBzdG9yZS5hZGQobmV3IEdyaWQodmlldzEpKTtcblx0XHRjb250YWluZXIuYXBwZW5kQ2hpbGQoZ3JpZC5lbGVtZW50KTtcblxuXHRcdGdyaWQubGF5b3V0KDgwMCwgNjAwKTtcblxuXHRcdGNvbnN0IHZpZXcyID0gc3RvcmUuYWRkKG5ldyBUZXN0Vmlldyg1MCwgTnVtYmVyLk1BWF9WQUxVRSwgNTAsIE51bWJlci5NQVhfVkFMVUUpKTtcblx0XHRncmlkLmFkZFZpZXcodmlldzIsIFNpemluZy5EaXN0cmlidXRlLCB2aWV3MSwgRGlyZWN0aW9uLlJpZ2h0KTtcblxuXHRcdGNvbnN0IHZpZXczID0gc3RvcmUuYWRkKG5ldyBUZXN0Vmlldyg1MCwgTnVtYmVyLk1BWF9WQUxVRSwgNTAsIE51bWJlci5NQVhfVkFMVUUpKTtcblx0XHRncmlkLmFkZFZpZXcodmlldzMsIFNpemluZy5EaXN0cmlidXRlLCB2aWV3MiwgRGlyZWN0aW9uLkRvd24pO1xuXG5cdFx0Y29uc3QgdmlldzQgPSBzdG9yZS5hZGQobmV3IFRlc3RWaWV3KDUwLCBOdW1iZXIuTUFYX1ZBTFVFLCA1MCwgTnVtYmVyLk1BWF9WQUxVRSkpO1xuXHRcdGdyaWQuYWRkVmlldyh2aWV3NCwgU2l6aW5nLkRpc3RyaWJ1dGUsIHZpZXcyLCBEaXJlY3Rpb24uUmlnaHQpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChncmlkLmdldE5laWdoYm9yVmlld3ModmlldzQsIERpcmVjdGlvbi5VcCksIFtdKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGdyaWQuZ2V0TmVpZ2hib3JWaWV3cyh2aWV3NCwgRGlyZWN0aW9uLlJpZ2h0KSwgW10pO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoZ3JpZC5nZXROZWlnaGJvclZpZXdzKHZpZXc0LCBEaXJlY3Rpb24uRG93biksIFt2aWV3M10pO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoZ3JpZC5nZXROZWlnaGJvclZpZXdzKHZpZXc0LCBEaXJlY3Rpb24uTGVmdCksIFt2aWV3Ml0pO1xuXHR9KTtcblxuXHR0ZXN0KCdnZXROZWlnaGJvclZpZXdzIHNob3VsZCBvbmx5IHJldHVybiBpbW1lZGlhdGUgbmVpZ2hib3JzJywgZnVuY3Rpb24gKCkge1xuXHRcdGNvbnN0IHZpZXcxID0gc3RvcmUuYWRkKG5ldyBUZXN0Vmlldyg1MCwgTnVtYmVyLk1BWF9WQUxVRSwgNTAsIE51bWJlci5NQVhfVkFMVUUpKTtcblx0XHRjb25zdCBncmlkID0gc3RvcmUuYWRkKG5ldyBHcmlkKHZpZXcxKSk7XG5cdFx0Y29udGFpbmVyLmFwcGVuZENoaWxkKGdyaWQuZWxlbWVudCk7XG5cblx0XHRncmlkLmxheW91dCg4MDAsIDYwMCk7XG5cblx0XHRjb25zdCB2aWV3MiA9IHN0b3JlLmFkZChuZXcgVGVzdFZpZXcoNTAsIE51bWJlci5NQVhfVkFMVUUsIDUwLCBOdW1iZXIuTUFYX1ZBTFVFKSk7XG5cdFx0Z3JpZC5hZGRWaWV3KHZpZXcyLCBTaXppbmcuRGlzdHJpYnV0ZSwgdmlldzEsIERpcmVjdGlvbi5SaWdodCk7XG5cblx0XHRjb25zdCB2aWV3MyA9IHN0b3JlLmFkZChuZXcgVGVzdFZpZXcoNTAsIE51bWJlci5NQVhfVkFMVUUsIDUwLCBOdW1iZXIuTUFYX1ZBTFVFKSk7XG5cdFx0Z3JpZC5hZGRWaWV3KHZpZXczLCBTaXppbmcuRGlzdHJpYnV0ZSwgdmlldzIsIERpcmVjdGlvbi5Eb3duKTtcblxuXHRcdGNvbnN0IHZpZXc0ID0gc3RvcmUuYWRkKG5ldyBUZXN0Vmlldyg1MCwgTnVtYmVyLk1BWF9WQUxVRSwgNTAsIE51bWJlci5NQVhfVkFMVUUpKTtcblx0XHRncmlkLmFkZFZpZXcodmlldzQsIFNpemluZy5EaXN0cmlidXRlLCB2aWV3MiwgRGlyZWN0aW9uLlJpZ2h0KTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoZ3JpZC5nZXROZWlnaGJvclZpZXdzKHZpZXcxLCBEaXJlY3Rpb24uUmlnaHQpLCBbdmlldzIsIHZpZXczXSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2hpZGluZyBzcGxpdHZpZXdzIGFuZCByZXN0b3Jpbmcgc2l6ZXMnLCBmdW5jdGlvbiAoKSB7XG5cdFx0Y29uc3QgdmlldzEgPSBzdG9yZS5hZGQobmV3IFRlc3RWaWV3KDUwLCBOdW1iZXIuTUFYX1ZBTFVFLCA1MCwgTnVtYmVyLk1BWF9WQUxVRSkpO1xuXHRcdGNvbnN0IGdyaWQgPSBzdG9yZS5hZGQobmV3IEdyaWQodmlldzEpKTtcblx0XHRjb250YWluZXIuYXBwZW5kQ2hpbGQoZ3JpZC5lbGVtZW50KTtcblxuXHRcdGdyaWQubGF5b3V0KDgwMCwgNjAwKTtcblxuXHRcdGNvbnN0IHZpZXcyID0gc3RvcmUuYWRkKG5ldyBUZXN0Vmlldyg1MCwgTnVtYmVyLk1BWF9WQUxVRSwgNTAsIE51bWJlci5NQVhfVkFMVUUpKTtcblx0XHRncmlkLmFkZFZpZXcodmlldzIsIFNpemluZy5EaXN0cmlidXRlLCB2aWV3MSwgRGlyZWN0aW9uLlJpZ2h0KTtcblxuXHRcdGNvbnN0IHZpZXczID0gc3RvcmUuYWRkKG5ldyBUZXN0Vmlldyg1MCwgTnVtYmVyLk1BWF9WQUxVRSwgNTAsIE51bWJlci5NQVhfVkFMVUUpKTtcblx0XHRncmlkLmFkZFZpZXcodmlldzMsIFNpemluZy5EaXN0cmlidXRlLCB2aWV3MiwgRGlyZWN0aW9uLkRvd24pO1xuXG5cdFx0Y29uc3QgdmlldzQgPSBzdG9yZS5hZGQobmV3IFRlc3RWaWV3KDUwLCBOdW1iZXIuTUFYX1ZBTFVFLCA1MCwgTnVtYmVyLk1BWF9WQUxVRSkpO1xuXHRcdGdyaWQuYWRkVmlldyh2aWV3NCwgU2l6aW5nLkRpc3RyaWJ1dGUsIHZpZXcyLCBEaXJlY3Rpb24uUmlnaHQpO1xuXG5cdFx0Y29uc3Qgc2l6ZTEgPSB2aWV3MS5zaXplO1xuXHRcdGNvbnN0IHNpemUyID0gdmlldzIuc2l6ZTtcblx0XHRjb25zdCBzaXplMyA9IHZpZXczLnNpemU7XG5cdFx0Y29uc3Qgc2l6ZTQgPSB2aWV3NC5zaXplO1xuXG5cdFx0Z3JpZC5tYXhpbWl6ZVZpZXcodmlldzEpO1xuXG5cdFx0Ly8gVmlld3MgMiwgMywgNCBhcmUgaGlkZGVuXG5cdFx0Ly8gU3BsaXR2aWV3ICgyLDQpIGFuZCAoKDIsNCksMykgYXJlIGhpZGRlblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwodmlldzEuc2l6ZSwgWzgwMCwgNjAwXSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh2aWV3Mi5zaXplLCBbMCwgMF0pO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwodmlldzMuc2l6ZSwgWzAsIDBdKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHZpZXc0LnNpemUsIFswLCAwXSk7XG5cblx0XHRncmlkLmV4aXRNYXhpbWl6ZWRWaWV3KCk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHZpZXcxLnNpemUsIHNpemUxKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHZpZXcyLnNpemUsIHNpemUyKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHZpZXczLnNpemUsIHNpemUzKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHZpZXc0LnNpemUsIHNpemU0KTtcblxuXHRcdC8vIFZpZXdzIDEsIDMsIDQgYXJlIGhpZGRlblxuXHRcdC8vIEFsbCBzcGxpdHZpZXdzIGFyZSBzdGlsbCB2aXNpYmxlID0+IG9ubHkgb3J0aG9nb25hbHNpemUgaXMgMFxuXHRcdGdyaWQubWF4aW1pemVWaWV3KHZpZXcyKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwodmlldzEuc2l6ZSwgWzAsIDYwMF0pO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwodmlldzIuc2l6ZSwgWzgwMCwgNjAwXSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh2aWV3My5zaXplLCBbODAwLCAwXSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh2aWV3NC5zaXplLCBbMCwgNjAwXSk7XG5cblx0XHRncmlkLmV4aXRNYXhpbWl6ZWRWaWV3KCk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHZpZXcxLnNpemUsIHNpemUxKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHZpZXcyLnNpemUsIHNpemUyKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHZpZXczLnNpemUsIHNpemUzKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHZpZXc0LnNpemUsIHNpemU0KTtcblx0fSk7XG5cblx0dGVzdCgnaGFzTWF4aW1pemVkVmlldycsIGZ1bmN0aW9uICgpIHtcblx0XHRjb25zdCB2aWV3MSA9IHN0b3JlLmFkZChuZXcgVGVzdFZpZXcoNTAsIE51bWJlci5NQVhfVkFMVUUsIDUwLCBOdW1iZXIuTUFYX1ZBTFVFKSk7XG5cdFx0Y29uc3QgZ3JpZCA9IHN0b3JlLmFkZChuZXcgR3JpZCh2aWV3MSkpO1xuXHRcdGNvbnRhaW5lci5hcHBlbmRDaGlsZChncmlkLmVsZW1lbnQpO1xuXG5cdFx0Z3JpZC5sYXlvdXQoODAwLCA2MDApO1xuXG5cdFx0Y29uc3QgdmlldzIgPSBzdG9yZS5hZGQobmV3IFRlc3RWaWV3KDUwLCBOdW1iZXIuTUFYX1ZBTFVFLCA1MCwgTnVtYmVyLk1BWF9WQUxVRSkpO1xuXHRcdGdyaWQuYWRkVmlldyh2aWV3MiwgU2l6aW5nLkRpc3RyaWJ1dGUsIHZpZXcxLCBEaXJlY3Rpb24uUmlnaHQpO1xuXG5cdFx0Y29uc3QgdmlldzMgPSBzdG9yZS5hZGQobmV3IFRlc3RWaWV3KDUwLCBOdW1iZXIuTUFYX1ZBTFVFLCA1MCwgTnVtYmVyLk1BWF9WQUxVRSkpO1xuXHRcdGdyaWQuYWRkVmlldyh2aWV3MywgU2l6aW5nLkRpc3RyaWJ1dGUsIHZpZXcyLCBEaXJlY3Rpb24uRG93bik7XG5cblx0XHRjb25zdCB2aWV3NCA9IHN0b3JlLmFkZChuZXcgVGVzdFZpZXcoNTAsIE51bWJlci5NQVhfVkFMVUUsIDUwLCBOdW1iZXIuTUFYX1ZBTFVFKSk7XG5cdFx0Z3JpZC5hZGRWaWV3KHZpZXc0LCBTaXppbmcuRGlzdHJpYnV0ZSwgdmlldzIsIERpcmVjdGlvbi5SaWdodCk7XG5cblx0XHRmdW5jdGlvbiBjaGVja0lzTWF4aW1pemVkKHZpZXc6IFRlc3RWaWV3KSB7XG5cdFx0XHRncmlkLm1heGltaXplVmlldyh2aWV3KTtcblxuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChncmlkLmhhc01heGltaXplZFZpZXcoKSwgdHJ1ZSk7XG5cblx0XHRcdC8vIFdoZW4gYSB2aWV3IGlzIG1heGltaXplZCwgbm8gdmlldyBjYW4gYmUgZXhwYW5kZWQgZXZlbiBpZiBpdCBpcyBtYXhpbWl6ZWRcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoZ3JpZC5pc1ZpZXdFeHBhbmRlZCh2aWV3MSksIGZhbHNlKTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoZ3JpZC5pc1ZpZXdFeHBhbmRlZCh2aWV3MiksIGZhbHNlKTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoZ3JpZC5pc1ZpZXdFeHBhbmRlZCh2aWV3MyksIGZhbHNlKTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoZ3JpZC5pc1ZpZXdFeHBhbmRlZCh2aWV3NCksIGZhbHNlKTtcblxuXHRcdFx0Z3JpZC5leGl0TWF4aW1pemVkVmlldygpO1xuXG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGdyaWQuaGFzTWF4aW1pemVkVmlldygpLCBmYWxzZSk7XG5cdFx0fVxuXG5cdFx0Y2hlY2tJc01heGltaXplZCh2aWV3MSk7XG5cdFx0Y2hlY2tJc01heGltaXplZCh2aWV3Mik7XG5cdFx0Y2hlY2tJc01heGltaXplZCh2aWV3Myk7XG5cdFx0Y2hlY2tJc01heGltaXplZCh2aWV3NCk7XG5cdH0pO1xuXG5cdHRlc3QoJ0NoYW5nZXMgdG8gdGhlIGdyaWQgdW5tYXhpbWl6ZSB0aGUgdmlldycsIGZ1bmN0aW9uICgpIHtcblx0XHRjb25zdCB2aWV3MSA9IHN0b3JlLmFkZChuZXcgVGVzdFZpZXcoNTAsIE51bWJlci5NQVhfVkFMVUUsIDUwLCBOdW1iZXIuTUFYX1ZBTFVFKSk7XG5cdFx0Y29uc3QgZ3JpZCA9IHN0b3JlLmFkZChuZXcgR3JpZCh2aWV3MSkpO1xuXHRcdGNvbnRhaW5lci5hcHBlbmRDaGlsZChncmlkLmVsZW1lbnQpO1xuXG5cdFx0Z3JpZC5sYXlvdXQoODAwLCA2MDApO1xuXG5cdFx0Y29uc3QgdmlldzIgPSBzdG9yZS5hZGQobmV3IFRlc3RWaWV3KDUwLCBOdW1iZXIuTUFYX1ZBTFVFLCA1MCwgTnVtYmVyLk1BWF9WQUxVRSkpO1xuXHRcdGdyaWQuYWRkVmlldyh2aWV3MiwgU2l6aW5nLkRpc3RyaWJ1dGUsIHZpZXcxLCBEaXJlY3Rpb24uUmlnaHQpO1xuXG5cdFx0Y29uc3QgdmlldzMgPSBzdG9yZS5hZGQobmV3IFRlc3RWaWV3KDUwLCBOdW1iZXIuTUFYX1ZBTFVFLCA1MCwgTnVtYmVyLk1BWF9WQUxVRSkpO1xuXHRcdGdyaWQuYWRkVmlldyh2aWV3MywgU2l6aW5nLkRpc3RyaWJ1dGUsIHZpZXcyLCBEaXJlY3Rpb24uRG93bik7XG5cblx0XHRjb25zdCB2aWV3NCA9IHN0b3JlLmFkZChuZXcgVGVzdFZpZXcoNTAsIE51bWJlci5NQVhfVkFMVUUsIDUwLCBOdW1iZXIuTUFYX1ZBTFVFKSk7XG5cblx0XHQvLyBBZGRpbmcgYSB2aWV3IHVubWF4aW1pemVzIHRoZSB2aWV3XG5cdFx0Z3JpZC5tYXhpbWl6ZVZpZXcodmlldzEpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoZ3JpZC5oYXNNYXhpbWl6ZWRWaWV3KCksIHRydWUpO1xuXHRcdGdyaWQuYWRkVmlldyh2aWV3NCwgU2l6aW5nLkRpc3RyaWJ1dGUsIHZpZXcyLCBEaXJlY3Rpb24uUmlnaHQpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChncmlkLmhhc01heGltaXplZFZpZXcoKSwgZmFsc2UpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoZ3JpZC5pc1ZpZXdWaXNpYmxlKHZpZXcxKSwgdHJ1ZSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChncmlkLmlzVmlld1Zpc2libGUodmlldzIpLCB0cnVlKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGdyaWQuaXNWaWV3VmlzaWJsZSh2aWV3MyksIHRydWUpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoZ3JpZC5pc1ZpZXdWaXNpYmxlKHZpZXc0KSwgdHJ1ZSk7XG5cblx0XHQvLyBSZW1vdmluZyBhIHZpZXcgdW5tYXhpbWl6ZXMgdGhlIHZpZXdcblx0XHRncmlkLm1heGltaXplVmlldyh2aWV3MSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChncmlkLmhhc01heGltaXplZFZpZXcoKSwgdHJ1ZSk7XG5cdFx0Z3JpZC5yZW1vdmVWaWV3KHZpZXc0KTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoZ3JpZC5oYXNNYXhpbWl6ZWRWaWV3KCksIGZhbHNlKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGdyaWQuaXNWaWV3VmlzaWJsZSh2aWV3MSksIHRydWUpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoZ3JpZC5pc1ZpZXdWaXNpYmxlKHZpZXcyKSwgdHJ1ZSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChncmlkLmlzVmlld1Zpc2libGUodmlldzMpLCB0cnVlKTtcblxuXHRcdC8vIENoYW5naW5nIHRoZSB2aXNpYmlsaXR5IG9mIGFueSB2aWV3IHdoaWxlIGEgdmlldyBpcyBtYXhpbWl6ZWQsIHVubWF4aW1pemVzIHRoZSB2aWV3XG5cdFx0Z3JpZC5tYXhpbWl6ZVZpZXcodmlldzEpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoZ3JpZC5oYXNNYXhpbWl6ZWRWaWV3KCksIHRydWUpO1xuXHRcdGdyaWQuc2V0Vmlld1Zpc2libGUodmlldzMsIHRydWUpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChncmlkLmhhc01heGltaXplZFZpZXcoKSwgZmFsc2UpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoZ3JpZC5pc1ZpZXdWaXNpYmxlKHZpZXcxKSwgdHJ1ZSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChncmlkLmlzVmlld1Zpc2libGUodmlldzIpLCB0cnVlKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGdyaWQuaXNWaWV3VmlzaWJsZSh2aWV3MyksIHRydWUpO1xuXHR9KTtcblxuXHR0ZXN0KCdDaGFuZ2VzIHRvIHRoZSBncmlkIHNpemluZyB1bm1heGltaXplIHRoZSB2aWV3JywgZnVuY3Rpb24gKCkge1xuXHRcdGNvbnN0IHZpZXcxID0gc3RvcmUuYWRkKG5ldyBUZXN0Vmlldyg1MCwgTnVtYmVyLk1BWF9WQUxVRSwgNTAsIE51bWJlci5NQVhfVkFMVUUpKTtcblx0XHRjb25zdCBncmlkID0gc3RvcmUuYWRkKG5ldyBHcmlkKHZpZXcxKSk7XG5cdFx0Y29udGFpbmVyLmFwcGVuZENoaWxkKGdyaWQuZWxlbWVudCk7XG5cblx0XHRncmlkLmxheW91dCg4MDAsIDYwMCk7XG5cblx0XHRjb25zdCB2aWV3MiA9IHN0b3JlLmFkZChuZXcgVGVzdFZpZXcoNTAsIE51bWJlci5NQVhfVkFMVUUsIDUwLCBOdW1iZXIuTUFYX1ZBTFVFKSk7XG5cdFx0Z3JpZC5hZGRWaWV3KHZpZXcyLCBTaXppbmcuRGlzdHJpYnV0ZSwgdmlldzEsIERpcmVjdGlvbi5SaWdodCk7XG5cblx0XHRjb25zdCB2aWV3MyA9IHN0b3JlLmFkZChuZXcgVGVzdFZpZXcoNTAsIE51bWJlci5NQVhfVkFMVUUsIDUwLCBOdW1iZXIuTUFYX1ZBTFVFKSk7XG5cdFx0Z3JpZC5hZGRWaWV3KHZpZXczLCBTaXppbmcuRGlzdHJpYnV0ZSwgdmlldzIsIERpcmVjdGlvbi5Eb3duKTtcblxuXHRcdGNvbnN0IHZpZXc0ID0gc3RvcmUuYWRkKG5ldyBUZXN0Vmlldyg1MCwgTnVtYmVyLk1BWF9WQUxVRSwgNTAsIE51bWJlci5NQVhfVkFMVUUpKTtcblx0XHRncmlkLmFkZFZpZXcodmlldzQsIFNpemluZy5EaXN0cmlidXRlLCB2aWV3MiwgRGlyZWN0aW9uLlJpZ2h0KTtcblxuXHRcdC8vIE1heGltaXppbmcgYSBkaWZmZXJlbnQgdmlldyB1bm1heGltaXplcyB0aGUgY3VycmVudCBvbmUgYW5kIG1heGltaXplcyB0aGUgbmV3IG9uZVxuXHRcdGdyaWQubWF4aW1pemVWaWV3KHZpZXcxKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGdyaWQuaGFzTWF4aW1pemVkVmlldygpLCB0cnVlKTtcblx0XHRncmlkLm1heGltaXplVmlldyh2aWV3Mik7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGdyaWQuaGFzTWF4aW1pemVkVmlldygpLCB0cnVlKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGdyaWQuaXNWaWV3VmlzaWJsZSh2aWV3MSksIGZhbHNlKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGdyaWQuaXNWaWV3VmlzaWJsZSh2aWV3MiksIHRydWUpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoZ3JpZC5pc1ZpZXdWaXNpYmxlKHZpZXczKSwgZmFsc2UpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoZ3JpZC5pc1ZpZXdWaXNpYmxlKHZpZXc0KSwgZmFsc2UpO1xuXG5cdFx0Ly8gRGlzdHJpYnV0aW5nIHRoZSBzaXplIHVubWF4aW1pemVzIHRoZSB2aWV3XG5cdFx0Z3JpZC5tYXhpbWl6ZVZpZXcodmlldzEpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoZ3JpZC5oYXNNYXhpbWl6ZWRWaWV3KCksIHRydWUpO1xuXHRcdGdyaWQuZGlzdHJpYnV0ZVZpZXdTaXplcygpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChncmlkLmhhc01heGltaXplZFZpZXcoKSwgZmFsc2UpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoZ3JpZC5pc1ZpZXdWaXNpYmxlKHZpZXcxKSwgdHJ1ZSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChncmlkLmlzVmlld1Zpc2libGUodmlldzIpLCB0cnVlKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGdyaWQuaXNWaWV3VmlzaWJsZSh2aWV3MyksIHRydWUpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoZ3JpZC5pc1ZpZXdWaXNpYmxlKHZpZXc0KSwgdHJ1ZSk7XG5cblx0XHQvLyBFeHBhbmRpbmcgYSBkaWZmZXJlbnQgdmlldyB1bm1heGltaXplcyB0aGUgdmlld1xuXHRcdGdyaWQubWF4aW1pemVWaWV3KHZpZXcxKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGdyaWQuaGFzTWF4aW1pemVkVmlldygpLCB0cnVlKTtcblx0XHRncmlkLmV4cGFuZFZpZXcodmlldzIpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChncmlkLmhhc01heGltaXplZFZpZXcoKSwgZmFsc2UpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoZ3JpZC5pc1ZpZXdWaXNpYmxlKHZpZXcxKSwgdHJ1ZSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChncmlkLmlzVmlld1Zpc2libGUodmlldzIpLCB0cnVlKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGdyaWQuaXNWaWV3VmlzaWJsZSh2aWV3MyksIHRydWUpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoZ3JpZC5pc1ZpZXdWaXNpYmxlKHZpZXc0KSwgdHJ1ZSk7XG5cblx0XHQvLyBFeHBhbmRpbmcgdGhlIG1heGltaXplZCB2aWV3IHVubWF4aW1pemVzIHRoZSB2aWV3XG5cdFx0Z3JpZC5tYXhpbWl6ZVZpZXcodmlldzEpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoZ3JpZC5oYXNNYXhpbWl6ZWRWaWV3KCksIHRydWUpO1xuXHRcdGdyaWQuZXhwYW5kVmlldyh2aWV3MSk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGdyaWQuaGFzTWF4aW1pemVkVmlldygpLCBmYWxzZSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChncmlkLmlzVmlld1Zpc2libGUodmlldzEpLCB0cnVlKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGdyaWQuaXNWaWV3VmlzaWJsZSh2aWV3MiksIHRydWUpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoZ3JpZC5pc1ZpZXdWaXNpYmxlKHZpZXczKSwgdHJ1ZSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChncmlkLmlzVmlld1Zpc2libGUodmlldzQpLCB0cnVlKTtcblx0fSk7XG5cblx0dGVzdCgnRGlzdHJpYnV0ZSBzaWJsaW5nIHNpemVzIHdoZW4gcmV2ZWFsaW5nIGEgdmlldycsIGZ1bmN0aW9uICgpIHtcblx0XHRjb25zdCB2aWV3MSA9IHN0b3JlLmFkZChuZXcgVGVzdFZpZXcoNTAsIE51bWJlci5NQVhfVkFMVUUsIDUwLCBOdW1iZXIuTUFYX1ZBTFVFKSk7XG5cdFx0Y29uc3QgZ3JpZCA9IHN0b3JlLmFkZChuZXcgR3JpZCh2aWV3MSkpO1xuXHRcdGNvbnRhaW5lci5hcHBlbmRDaGlsZChncmlkLmVsZW1lbnQpO1xuXHRcdGdyaWQubGF5b3V0KDgwMCwgNjAwKTtcblxuXHRcdGNvbnN0IHZpZXcyID0gc3RvcmUuYWRkKG5ldyBUZXN0Vmlldyg1MCwgTnVtYmVyLk1BWF9WQUxVRSwgNTAsIE51bWJlci5NQVhfVkFMVUUpKTtcblx0XHRncmlkLmFkZFZpZXcodmlldzIsIFNpemluZy5EaXN0cmlidXRlLCB2aWV3MSwgRGlyZWN0aW9uLlJpZ2h0KTtcblx0XHRjb25zdCB2aWV3MyA9IHN0b3JlLmFkZChuZXcgVGVzdFZpZXcoNTAsIE51bWJlci5NQVhfVkFMVUUsIDUwLCBOdW1iZXIuTUFYX1ZBTFVFKSk7XG5cdFx0Z3JpZC5hZGRWaWV3KHZpZXczLCBTaXppbmcuRGlzdHJpYnV0ZSwgdmlldzIsIERpcmVjdGlvbi5Eb3duKTtcblxuXHRcdGdyaWQuc2V0Vmlld1Zpc2libGUodmlldzEsIGZhbHNlKTtcblx0XHRncmlkLnJlc2l6ZVZpZXcodmlldzIsIHsgd2lkdGg6IDIwMCwgaGVpZ2h0OiA0NTAgfSk7XG5cdFx0Z3JpZC5zZXRWaWV3VmlzaWJsZSh2aWV3MSwgdHJ1ZSwgU2l6aW5nLkRpc3RyaWJ1dGUpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHR2aWV3MTogZ3JpZC5nZXRWaWV3U2l6ZSh2aWV3MSksXG5cdFx0XHR2aWV3MjogZ3JpZC5nZXRWaWV3U2l6ZSh2aWV3MiksXG5cdFx0XHR2aWV3MzogZ3JpZC5nZXRWaWV3U2l6ZSh2aWV3MyksXG5cdFx0fSwge1xuXHRcdFx0dmlldzE6IHsgd2lkdGg6IDQwMCwgaGVpZ2h0OiA2MDAgfSxcblx0XHRcdHZpZXcyOiB7IHdpZHRoOiA0MDAsIGhlaWdodDogNDUwIH0sXG5cdFx0XHR2aWV3MzogeyB3aWR0aDogNDAwLCBoZWlnaHQ6IDE1MCB9LFxuXHRcdH0pO1xuXHR9KTtcbn0pO1xuXG5jbGFzcyBUZXN0U2VyaWFsaXphYmxlVmlldyBleHRlbmRzIFRlc3RWaWV3IGltcGxlbWVudHMgSVNlcmlhbGl6YWJsZVZpZXcge1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdHJlYWRvbmx5IG5hbWU6IHN0cmluZyxcblx0XHRtaW5pbXVtV2lkdGg6IG51bWJlcixcblx0XHRtYXhpbXVtV2lkdGg6IG51bWJlcixcblx0XHRtaW5pbXVtSGVpZ2h0OiBudW1iZXIsXG5cdFx0bWF4aW11bUhlaWdodDogbnVtYmVyXG5cdCkge1xuXHRcdHN1cGVyKG1pbmltdW1XaWR0aCwgbWF4aW11bVdpZHRoLCBtaW5pbXVtSGVpZ2h0LCBtYXhpbXVtSGVpZ2h0KTtcblx0fVxuXG5cdHRvSlNPTigpIHtcblx0XHRyZXR1cm4geyBuYW1lOiB0aGlzLm5hbWUgfTtcblx0fVxufVxuXG5jbGFzcyBUZXN0Vmlld0Rlc2VyaWFsaXplciBpbXBsZW1lbnRzIElWaWV3RGVzZXJpYWxpemVyPFRlc3RTZXJpYWxpemFibGVWaWV3PiB7XG5cblx0cHJpdmF0ZSB2aWV3cyA9IG5ldyBNYXA8c3RyaW5nLCBUZXN0U2VyaWFsaXphYmxlVmlldz4oKTtcblxuXHRjb25zdHJ1Y3Rvcihwcml2YXRlIHJlYWRvbmx5IHN0b3JlOiBQaWNrPERpc3Bvc2FibGVTdG9yZSwgJ2FkZCc+KSB7IH1cblxuXHRmcm9tSlNPTihqc29uOiBhbnkpOiBUZXN0U2VyaWFsaXphYmxlVmlldyB7XG5cdFx0Y29uc3QgdmlldyA9IHRoaXMuc3RvcmUuYWRkKG5ldyBUZXN0U2VyaWFsaXphYmxlVmlldyhqc29uLm5hbWUsIDUwLCBOdW1iZXIuTUFYX1ZBTFVFLCA1MCwgTnVtYmVyLk1BWF9WQUxVRSkpO1xuXHRcdHRoaXMudmlld3Muc2V0KGpzb24ubmFtZSwgdmlldyk7XG5cdFx0cmV0dXJuIHZpZXc7XG5cdH1cblxuXHRnZXRWaWV3KGlkOiBzdHJpbmcpOiBUZXN0U2VyaWFsaXphYmxlVmlldyB7XG5cdFx0Y29uc3QgdmlldyA9IHRoaXMudmlld3MuZ2V0KGlkKTtcblx0XHRpZiAoIXZpZXcpIHtcblx0XHRcdHRocm93IG5ldyBFcnJvcignVW5rbm93biB2aWV3Jyk7XG5cdFx0fVxuXHRcdHJldHVybiB2aWV3O1xuXHR9XG59XG5cbmZ1bmN0aW9uIG5vZGVzVG9OYW1lcyhub2RlOiBHcmlkTm9kZTxUZXN0U2VyaWFsaXphYmxlVmlldz4pOiBhbnkge1xuXHRpZiAoaXNHcmlkQnJhbmNoTm9kZShub2RlKSkge1xuXHRcdHJldHVybiBub2RlLmNoaWxkcmVuLm1hcChub2Rlc1RvTmFtZXMpO1xuXHR9IGVsc2Uge1xuXHRcdHJldHVybiBub2RlLnZpZXcubmFtZTtcblx0fVxufVxuXG5zdWl0ZSgnU2VyaWFsaXphYmxlR3JpZCcsIGZ1bmN0aW9uICgpIHtcblxuXHRjb25zdCBzdG9yZSA9IGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSgpO1xuXHRsZXQgY29udGFpbmVyOiBIVE1MRWxlbWVudDtcblxuXHRzZXR1cChmdW5jdGlvbiAoKSB7XG5cdFx0Y29udGFpbmVyID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnZGl2Jyk7XG5cdFx0Y29udGFpbmVyLnN0eWxlLnBvc2l0aW9uID0gJ2Fic29sdXRlJztcblx0XHRjb250YWluZXIuc3R5bGUud2lkdGggPSBgJHs4MDB9cHhgO1xuXHRcdGNvbnRhaW5lci5zdHlsZS5oZWlnaHQgPSBgJHs2MDB9cHhgO1xuXHR9KTtcblxuXHR0ZXN0KCdzZXJpYWxpemUgZW1wdHknLCBmdW5jdGlvbiAoKSB7XG5cdFx0Y29uc3QgdmlldzEgPSBzdG9yZS5hZGQobmV3IFRlc3RTZXJpYWxpemFibGVWaWV3KCd2aWV3MScsIDUwLCBOdW1iZXIuTUFYX1ZBTFVFLCA1MCwgTnVtYmVyLk1BWF9WQUxVRSkpO1xuXHRcdGNvbnN0IGdyaWQgPSBzdG9yZS5hZGQobmV3IFNlcmlhbGl6YWJsZUdyaWQodmlldzEpKTtcblx0XHRjb250YWluZXIuYXBwZW5kQ2hpbGQoZ3JpZC5lbGVtZW50KTtcblx0XHRncmlkLmxheW91dCg4MDAsIDYwMCk7XG5cblx0XHRjb25zdCBhY3R1YWwgPSBncmlkLnNlcmlhbGl6ZSgpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoYWN0dWFsLCB7XG5cdFx0XHRvcmllbnRhdGlvbjogMCxcblx0XHRcdHdpZHRoOiA4MDAsXG5cdFx0XHRoZWlnaHQ6IDYwMCxcblx0XHRcdHJvb3Q6IHtcblx0XHRcdFx0dHlwZTogJ2JyYW5jaCcsXG5cdFx0XHRcdGRhdGE6IFtcblx0XHRcdFx0XHR7XG5cdFx0XHRcdFx0XHR0eXBlOiAnbGVhZicsXG5cdFx0XHRcdFx0XHRkYXRhOiB7XG5cdFx0XHRcdFx0XHRcdG5hbWU6ICd2aWV3MScsXG5cdFx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdFx0c2l6ZTogNjAwXG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRdLFxuXHRcdFx0XHRzaXplOiA4MDBcblx0XHRcdH1cblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnc2VyaWFsaXplIHNpbXBsZSBsYXlvdXQnLCBmdW5jdGlvbiAoKSB7XG5cdFx0Y29uc3QgdmlldzEgPSBzdG9yZS5hZGQobmV3IFRlc3RTZXJpYWxpemFibGVWaWV3KCd2aWV3MScsIDUwLCBOdW1iZXIuTUFYX1ZBTFVFLCA1MCwgTnVtYmVyLk1BWF9WQUxVRSkpO1xuXHRcdGNvbnN0IGdyaWQgPSBzdG9yZS5hZGQobmV3IFNlcmlhbGl6YWJsZUdyaWQodmlldzEpKTtcblx0XHRjb250YWluZXIuYXBwZW5kQ2hpbGQoZ3JpZC5lbGVtZW50KTtcblx0XHRncmlkLmxheW91dCg4MDAsIDYwMCk7XG5cblx0XHRjb25zdCB2aWV3MiA9IHN0b3JlLmFkZChuZXcgVGVzdFNlcmlhbGl6YWJsZVZpZXcoJ3ZpZXcyJywgNTAsIE51bWJlci5NQVhfVkFMVUUsIDUwLCBOdW1iZXIuTUFYX1ZBTFVFKSk7XG5cdFx0Z3JpZC5hZGRWaWV3KHZpZXcyLCAyMDAsIHZpZXcxLCBEaXJlY3Rpb24uVXApO1xuXG5cdFx0Y29uc3QgdmlldzMgPSBzdG9yZS5hZGQobmV3IFRlc3RTZXJpYWxpemFibGVWaWV3KCd2aWV3MycsIDUwLCBOdW1iZXIuTUFYX1ZBTFVFLCA1MCwgTnVtYmVyLk1BWF9WQUxVRSkpO1xuXHRcdGdyaWQuYWRkVmlldyh2aWV3MywgMjAwLCB2aWV3MSwgRGlyZWN0aW9uLlJpZ2h0KTtcblxuXHRcdGNvbnN0IHZpZXc0ID0gc3RvcmUuYWRkKG5ldyBUZXN0U2VyaWFsaXphYmxlVmlldygndmlldzQnLCA1MCwgTnVtYmVyLk1BWF9WQUxVRSwgNTAsIE51bWJlci5NQVhfVkFMVUUpKTtcblx0XHRncmlkLmFkZFZpZXcodmlldzQsIDIwMCwgdmlldzIsIERpcmVjdGlvbi5MZWZ0KTtcblxuXHRcdGNvbnN0IHZpZXc1ID0gc3RvcmUuYWRkKG5ldyBUZXN0U2VyaWFsaXphYmxlVmlldygndmlldzUnLCA1MCwgTnVtYmVyLk1BWF9WQUxVRSwgNTAsIE51bWJlci5NQVhfVkFMVUUpKTtcblx0XHRncmlkLmFkZFZpZXcodmlldzUsIDEwMCwgdmlldzEsIERpcmVjdGlvbi5Eb3duKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoZ3JpZC5zZXJpYWxpemUoKSwge1xuXHRcdFx0b3JpZW50YXRpb246IDAsXG5cdFx0XHR3aWR0aDogODAwLFxuXHRcdFx0aGVpZ2h0OiA2MDAsXG5cdFx0XHRyb290OiB7XG5cdFx0XHRcdHR5cGU6ICdicmFuY2gnLFxuXHRcdFx0XHRkYXRhOiBbXG5cdFx0XHRcdFx0e1xuXHRcdFx0XHRcdFx0dHlwZTogJ2JyYW5jaCcsXG5cdFx0XHRcdFx0XHRkYXRhOiBbXG5cdFx0XHRcdFx0XHRcdHsgdHlwZTogJ2xlYWYnLCBkYXRhOiB7IG5hbWU6ICd2aWV3NCcgfSwgc2l6ZTogMjAwIH0sXG5cdFx0XHRcdFx0XHRcdHsgdHlwZTogJ2xlYWYnLCBkYXRhOiB7IG5hbWU6ICd2aWV3MicgfSwgc2l6ZTogNjAwIH1cblx0XHRcdFx0XHRcdF0sXG5cdFx0XHRcdFx0XHRzaXplOiAyMDBcblx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdHtcblx0XHRcdFx0XHRcdHR5cGU6ICdicmFuY2gnLFxuXHRcdFx0XHRcdFx0ZGF0YTogW1xuXHRcdFx0XHRcdFx0XHR7XG5cdFx0XHRcdFx0XHRcdFx0dHlwZTogJ2JyYW5jaCcsXG5cdFx0XHRcdFx0XHRcdFx0ZGF0YTogW1xuXHRcdFx0XHRcdFx0XHRcdFx0eyB0eXBlOiAnbGVhZicsIGRhdGE6IHsgbmFtZTogJ3ZpZXcxJyB9LCBzaXplOiAzMDAgfSxcblx0XHRcdFx0XHRcdFx0XHRcdHsgdHlwZTogJ2xlYWYnLCBkYXRhOiB7IG5hbWU6ICd2aWV3NScgfSwgc2l6ZTogMTAwIH1cblx0XHRcdFx0XHRcdFx0XHRdLFxuXHRcdFx0XHRcdFx0XHRcdHNpemU6IDYwMFxuXHRcdFx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdFx0XHR7IHR5cGU6ICdsZWFmJywgZGF0YTogeyBuYW1lOiAndmlldzMnIH0sIHNpemU6IDIwMCB9XG5cdFx0XHRcdFx0XHRdLFxuXHRcdFx0XHRcdFx0c2l6ZTogNDAwXG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRdLFxuXHRcdFx0XHRzaXplOiA4MDBcblx0XHRcdH1cblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnZGVzZXJpYWxpemUgZW1wdHknLCBmdW5jdGlvbiAoKSB7XG5cdFx0Y29uc3QgdmlldzEgPSBzdG9yZS5hZGQobmV3IFRlc3RTZXJpYWxpemFibGVWaWV3KCd2aWV3MScsIDUwLCBOdW1iZXIuTUFYX1ZBTFVFLCA1MCwgTnVtYmVyLk1BWF9WQUxVRSkpO1xuXHRcdGNvbnN0IGdyaWQgPSBzdG9yZS5hZGQobmV3IFNlcmlhbGl6YWJsZUdyaWQodmlldzEpKTtcblx0XHRjb250YWluZXIuYXBwZW5kQ2hpbGQoZ3JpZC5lbGVtZW50KTtcblx0XHRncmlkLmxheW91dCg4MDAsIDYwMCk7XG5cblx0XHRjb25zdCBqc29uID0gZ3JpZC5zZXJpYWxpemUoKTtcblx0XHRncmlkLmRpc3Bvc2UoKTtcblxuXHRcdGNvbnN0IGRlc2VyaWFsaXplciA9IG5ldyBUZXN0Vmlld0Rlc2VyaWFsaXplcihzdG9yZSk7XG5cdFx0Y29uc3QgZ3JpZDIgPSBzdG9yZS5hZGQoU2VyaWFsaXphYmxlR3JpZC5kZXNlcmlhbGl6ZShqc29uLCBkZXNlcmlhbGl6ZXIpKTtcblx0XHRncmlkMi5sYXlvdXQoODAwLCA2MDApO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChub2Rlc1RvTmFtZXMoZ3JpZDIuZ2V0Vmlld3MoKSksIFsndmlldzEnXSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2Rlc2VyaWFsaXplIHNpbXBsZSBsYXlvdXQnLCBmdW5jdGlvbiAoKSB7XG5cdFx0Y29uc3QgdmlldzEgPSBzdG9yZS5hZGQobmV3IFRlc3RTZXJpYWxpemFibGVWaWV3KCd2aWV3MScsIDUwLCBOdW1iZXIuTUFYX1ZBTFVFLCA1MCwgTnVtYmVyLk1BWF9WQUxVRSkpO1xuXHRcdGNvbnN0IGdyaWQgPSBzdG9yZS5hZGQobmV3IFNlcmlhbGl6YWJsZUdyaWQodmlldzEpKTtcblx0XHRjb250YWluZXIuYXBwZW5kQ2hpbGQoZ3JpZC5lbGVtZW50KTtcblxuXHRcdGdyaWQubGF5b3V0KDgwMCwgNjAwKTtcblxuXHRcdGNvbnN0IHZpZXcyID0gc3RvcmUuYWRkKG5ldyBUZXN0U2VyaWFsaXphYmxlVmlldygndmlldzInLCA1MCwgTnVtYmVyLk1BWF9WQUxVRSwgNTAsIE51bWJlci5NQVhfVkFMVUUpKTtcblx0XHRncmlkLmFkZFZpZXcodmlldzIsIDIwMCwgdmlldzEsIERpcmVjdGlvbi5VcCk7XG5cblx0XHRjb25zdCB2aWV3MyA9IHN0b3JlLmFkZChuZXcgVGVzdFNlcmlhbGl6YWJsZVZpZXcoJ3ZpZXczJywgNTAsIE51bWJlci5NQVhfVkFMVUUsIDUwLCBOdW1iZXIuTUFYX1ZBTFVFKSk7XG5cdFx0Z3JpZC5hZGRWaWV3KHZpZXczLCAyMDAsIHZpZXcxLCBEaXJlY3Rpb24uUmlnaHQpO1xuXG5cdFx0Y29uc3QgdmlldzQgPSBzdG9yZS5hZGQobmV3IFRlc3RTZXJpYWxpemFibGVWaWV3KCd2aWV3NCcsIDUwLCBOdW1iZXIuTUFYX1ZBTFVFLCA1MCwgTnVtYmVyLk1BWF9WQUxVRSkpO1xuXHRcdGdyaWQuYWRkVmlldyh2aWV3NCwgMjAwLCB2aWV3MiwgRGlyZWN0aW9uLkxlZnQpO1xuXG5cdFx0Y29uc3QgdmlldzUgPSBzdG9yZS5hZGQobmV3IFRlc3RTZXJpYWxpemFibGVWaWV3KCd2aWV3NScsIDUwLCBOdW1iZXIuTUFYX1ZBTFVFLCA1MCwgTnVtYmVyLk1BWF9WQUxVRSkpO1xuXHRcdGdyaWQuYWRkVmlldyh2aWV3NSwgMTAwLCB2aWV3MSwgRGlyZWN0aW9uLkRvd24pO1xuXG5cdFx0Y29uc3QganNvbiA9IGdyaWQuc2VyaWFsaXplKCk7XG5cdFx0Z3JpZC5kaXNwb3NlKCk7XG5cblx0XHRjb25zdCBkZXNlcmlhbGl6ZXIgPSBuZXcgVGVzdFZpZXdEZXNlcmlhbGl6ZXIoc3RvcmUpO1xuXHRcdGNvbnN0IGdyaWQyID0gc3RvcmUuYWRkKFNlcmlhbGl6YWJsZUdyaWQuZGVzZXJpYWxpemUoanNvbiwgZGVzZXJpYWxpemVyKSk7XG5cblx0XHRjb25zdCB2aWV3MUNvcHkgPSBkZXNlcmlhbGl6ZXIuZ2V0VmlldygndmlldzEnKTtcblx0XHRjb25zdCB2aWV3MkNvcHkgPSBkZXNlcmlhbGl6ZXIuZ2V0VmlldygndmlldzInKTtcblx0XHRjb25zdCB2aWV3M0NvcHkgPSBkZXNlcmlhbGl6ZXIuZ2V0VmlldygndmlldzMnKTtcblx0XHRjb25zdCB2aWV3NENvcHkgPSBkZXNlcmlhbGl6ZXIuZ2V0VmlldygndmlldzQnKTtcblx0XHRjb25zdCB2aWV3NUNvcHkgPSBkZXNlcmlhbGl6ZXIuZ2V0VmlldygndmlldzUnKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwobm9kZXNUb0FycmF5cyhncmlkMi5nZXRWaWV3cygpKSwgW1t2aWV3NENvcHksIHZpZXcyQ29weV0sIFtbdmlldzFDb3B5LCB2aWV3NUNvcHldLCB2aWV3M0NvcHldXSk7XG5cblx0XHRncmlkMi5sYXlvdXQoODAwLCA2MDApO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh2aWV3MUNvcHkuc2l6ZSwgWzYwMCwgMzAwXSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh2aWV3MkNvcHkuc2l6ZSwgWzYwMCwgMjAwXSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh2aWV3M0NvcHkuc2l6ZSwgWzIwMCwgNDAwXSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh2aWV3NENvcHkuc2l6ZSwgWzIwMCwgMjAwXSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh2aWV3NUNvcHkuc2l6ZSwgWzYwMCwgMTAwXSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2Rlc2VyaWFsaXplIHNpbXBsZSBsYXlvdXQgd2l0aCBzY2FsaW5nJywgZnVuY3Rpb24gKCkge1xuXHRcdGNvbnN0IHZpZXcxID0gc3RvcmUuYWRkKG5ldyBUZXN0U2VyaWFsaXphYmxlVmlldygndmlldzEnLCA1MCwgTnVtYmVyLk1BWF9WQUxVRSwgNTAsIE51bWJlci5NQVhfVkFMVUUpKTtcblx0XHRjb25zdCBncmlkID0gc3RvcmUuYWRkKG5ldyBTZXJpYWxpemFibGVHcmlkKHZpZXcxKSk7XG5cdFx0Y29udGFpbmVyLmFwcGVuZENoaWxkKGdyaWQuZWxlbWVudCk7XG5cblx0XHRncmlkLmxheW91dCg4MDAsIDYwMCk7XG5cblx0XHRjb25zdCB2aWV3MiA9IHN0b3JlLmFkZChuZXcgVGVzdFNlcmlhbGl6YWJsZVZpZXcoJ3ZpZXcyJywgNTAsIE51bWJlci5NQVhfVkFMVUUsIDUwLCBOdW1iZXIuTUFYX1ZBTFVFKSk7XG5cdFx0Z3JpZC5hZGRWaWV3KHZpZXcyLCAyMDAsIHZpZXcxLCBEaXJlY3Rpb24uVXApO1xuXG5cdFx0Y29uc3QgdmlldzMgPSBzdG9yZS5hZGQobmV3IFRlc3RTZXJpYWxpemFibGVWaWV3KCd2aWV3MycsIDUwLCBOdW1iZXIuTUFYX1ZBTFVFLCA1MCwgTnVtYmVyLk1BWF9WQUxVRSkpO1xuXHRcdGdyaWQuYWRkVmlldyh2aWV3MywgMjAwLCB2aWV3MSwgRGlyZWN0aW9uLlJpZ2h0KTtcblxuXHRcdGNvbnN0IHZpZXc0ID0gc3RvcmUuYWRkKG5ldyBUZXN0U2VyaWFsaXphYmxlVmlldygndmlldzQnLCA1MCwgTnVtYmVyLk1BWF9WQUxVRSwgNTAsIE51bWJlci5NQVhfVkFMVUUpKTtcblx0XHRncmlkLmFkZFZpZXcodmlldzQsIDIwMCwgdmlldzIsIERpcmVjdGlvbi5MZWZ0KTtcblxuXHRcdGNvbnN0IHZpZXc1ID0gc3RvcmUuYWRkKG5ldyBUZXN0U2VyaWFsaXphYmxlVmlldygndmlldzUnLCA1MCwgTnVtYmVyLk1BWF9WQUxVRSwgNTAsIE51bWJlci5NQVhfVkFMVUUpKTtcblx0XHRncmlkLmFkZFZpZXcodmlldzUsIDEwMCwgdmlldzEsIERpcmVjdGlvbi5Eb3duKTtcblxuXHRcdGNvbnN0IGpzb24gPSBncmlkLnNlcmlhbGl6ZSgpO1xuXHRcdGdyaWQuZGlzcG9zZSgpO1xuXG5cdFx0Y29uc3QgZGVzZXJpYWxpemVyID0gbmV3IFRlc3RWaWV3RGVzZXJpYWxpemVyKHN0b3JlKTtcblx0XHRjb25zdCBncmlkMiA9IHN0b3JlLmFkZChTZXJpYWxpemFibGVHcmlkLmRlc2VyaWFsaXplKGpzb24sIGRlc2VyaWFsaXplcikpO1xuXG5cdFx0Y29uc3QgdmlldzFDb3B5ID0gZGVzZXJpYWxpemVyLmdldFZpZXcoJ3ZpZXcxJyk7XG5cdFx0Y29uc3QgdmlldzJDb3B5ID0gZGVzZXJpYWxpemVyLmdldFZpZXcoJ3ZpZXcyJyk7XG5cdFx0Y29uc3QgdmlldzNDb3B5ID0gZGVzZXJpYWxpemVyLmdldFZpZXcoJ3ZpZXczJyk7XG5cdFx0Y29uc3QgdmlldzRDb3B5ID0gZGVzZXJpYWxpemVyLmdldFZpZXcoJ3ZpZXc0Jyk7XG5cdFx0Y29uc3QgdmlldzVDb3B5ID0gZGVzZXJpYWxpemVyLmdldFZpZXcoJ3ZpZXc1Jyk7XG5cblx0XHRncmlkMi5sYXlvdXQoNDAwLCA4MDApOyAvLyBbLzIsICo0LzNdXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh2aWV3MUNvcHkuc2l6ZSwgWzMwMCwgNDAwXSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh2aWV3MkNvcHkuc2l6ZSwgWzMwMCwgMjY3XSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh2aWV3M0NvcHkuc2l6ZSwgWzEwMCwgNTMzXSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh2aWV3NENvcHkuc2l6ZSwgWzEwMCwgMjY3XSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh2aWV3NUNvcHkuc2l6ZSwgWzMwMCwgMTMzXSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2Rlc2VyaWFsaXplIDQgdmlldyBsYXlvdXQgKGJlbiBpc3N1ZSAjMiknLCBmdW5jdGlvbiAoKSB7XG5cdFx0Y29uc3QgdmlldzEgPSBzdG9yZS5hZGQobmV3IFRlc3RTZXJpYWxpemFibGVWaWV3KCd2aWV3MScsIDUwLCBOdW1iZXIuTUFYX1ZBTFVFLCA1MCwgTnVtYmVyLk1BWF9WQUxVRSkpO1xuXHRcdGNvbnN0IGdyaWQgPSBzdG9yZS5hZGQobmV3IFNlcmlhbGl6YWJsZUdyaWQodmlldzEpKTtcblx0XHRjb250YWluZXIuYXBwZW5kQ2hpbGQoZ3JpZC5lbGVtZW50KTtcblx0XHRncmlkLmxheW91dCg4MDAsIDYwMCk7XG5cblx0XHRjb25zdCB2aWV3MiA9IHN0b3JlLmFkZChuZXcgVGVzdFNlcmlhbGl6YWJsZVZpZXcoJ3ZpZXcyJywgNTAsIE51bWJlci5NQVhfVkFMVUUsIDUwLCBOdW1iZXIuTUFYX1ZBTFVFKSk7XG5cdFx0Z3JpZC5hZGRWaWV3KHZpZXcyLCBTaXppbmcuU3BsaXQsIHZpZXcxLCBEaXJlY3Rpb24uRG93bik7XG5cblx0XHRjb25zdCB2aWV3MyA9IHN0b3JlLmFkZChuZXcgVGVzdFNlcmlhbGl6YWJsZVZpZXcoJ3ZpZXczJywgNTAsIE51bWJlci5NQVhfVkFMVUUsIDUwLCBOdW1iZXIuTUFYX1ZBTFVFKSk7XG5cdFx0Z3JpZC5hZGRWaWV3KHZpZXczLCBTaXppbmcuU3BsaXQsIHZpZXcyLCBEaXJlY3Rpb24uRG93bik7XG5cblx0XHRjb25zdCB2aWV3NCA9IHN0b3JlLmFkZChuZXcgVGVzdFNlcmlhbGl6YWJsZVZpZXcoJ3ZpZXc0JywgNTAsIE51bWJlci5NQVhfVkFMVUUsIDUwLCBOdW1iZXIuTUFYX1ZBTFVFKSk7XG5cdFx0Z3JpZC5hZGRWaWV3KHZpZXc0LCBTaXppbmcuU3BsaXQsIHZpZXczLCBEaXJlY3Rpb24uUmlnaHQpO1xuXG5cdFx0Y29uc3QganNvbiA9IGdyaWQuc2VyaWFsaXplKCk7XG5cdFx0Z3JpZC5kaXNwb3NlKCk7XG5cblx0XHRjb25zdCBkZXNlcmlhbGl6ZXIgPSBuZXcgVGVzdFZpZXdEZXNlcmlhbGl6ZXIoc3RvcmUpO1xuXHRcdGNvbnN0IGdyaWQyID0gc3RvcmUuYWRkKFNlcmlhbGl6YWJsZUdyaWQuZGVzZXJpYWxpemUoanNvbiwgZGVzZXJpYWxpemVyKSk7XG5cblx0XHRjb25zdCB2aWV3MUNvcHkgPSBkZXNlcmlhbGl6ZXIuZ2V0VmlldygndmlldzEnKTtcblx0XHRjb25zdCB2aWV3MkNvcHkgPSBkZXNlcmlhbGl6ZXIuZ2V0VmlldygndmlldzInKTtcblx0XHRjb25zdCB2aWV3M0NvcHkgPSBkZXNlcmlhbGl6ZXIuZ2V0VmlldygndmlldzMnKTtcblx0XHRjb25zdCB2aWV3NENvcHkgPSBkZXNlcmlhbGl6ZXIuZ2V0VmlldygndmlldzQnKTtcblxuXHRcdGdyaWQyLmxheW91dCg4MDAsIDYwMCk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHZpZXcxQ29weS5zaXplLCBbODAwLCAzMDBdKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHZpZXcyQ29weS5zaXplLCBbODAwLCAxNTBdKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHZpZXczQ29weS5zaXplLCBbNDAwLCAxNTBdKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHZpZXc0Q29weS5zaXplLCBbNDAwLCAxNTBdKTtcblx0fSk7XG5cblx0dGVzdCgnZGVzZXJpYWxpemUgMiB2aWV3IGxheW91dCAoYmVuIGlzc3VlICMzKScsIGZ1bmN0aW9uICgpIHtcblx0XHRjb25zdCB2aWV3MSA9IHN0b3JlLmFkZChuZXcgVGVzdFNlcmlhbGl6YWJsZVZpZXcoJ3ZpZXcxJywgNTAsIE51bWJlci5NQVhfVkFMVUUsIDUwLCBOdW1iZXIuTUFYX1ZBTFVFKSk7XG5cdFx0Y29uc3QgZ3JpZCA9IHN0b3JlLmFkZChuZXcgU2VyaWFsaXphYmxlR3JpZCh2aWV3MSkpO1xuXHRcdGNvbnRhaW5lci5hcHBlbmRDaGlsZChncmlkLmVsZW1lbnQpO1xuXG5cdFx0Z3JpZC5sYXlvdXQoODAwLCA2MDApO1xuXG5cdFx0Y29uc3QgdmlldzIgPSBzdG9yZS5hZGQobmV3IFRlc3RTZXJpYWxpemFibGVWaWV3KCd2aWV3MicsIDUwLCBOdW1iZXIuTUFYX1ZBTFVFLCA1MCwgTnVtYmVyLk1BWF9WQUxVRSkpO1xuXHRcdGdyaWQuYWRkVmlldyh2aWV3MiwgU2l6aW5nLlNwbGl0LCB2aWV3MSwgRGlyZWN0aW9uLlJpZ2h0KTtcblxuXHRcdGNvbnN0IGpzb24gPSBncmlkLnNlcmlhbGl6ZSgpO1xuXHRcdGdyaWQuZGlzcG9zZSgpO1xuXG5cdFx0Y29uc3QgZGVzZXJpYWxpemVyID0gbmV3IFRlc3RWaWV3RGVzZXJpYWxpemVyKHN0b3JlKTtcblx0XHRjb25zdCBncmlkMiA9IHN0b3JlLmFkZChTZXJpYWxpemFibGVHcmlkLmRlc2VyaWFsaXplKGpzb24sIGRlc2VyaWFsaXplcikpO1xuXG5cdFx0Y29uc3QgdmlldzFDb3B5ID0gZGVzZXJpYWxpemVyLmdldFZpZXcoJ3ZpZXcxJyk7XG5cdFx0Y29uc3QgdmlldzJDb3B5ID0gZGVzZXJpYWxpemVyLmdldFZpZXcoJ3ZpZXcyJyk7XG5cblx0XHRncmlkMi5sYXlvdXQoODAwLCA2MDApO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh2aWV3MUNvcHkuc2l6ZSwgWzQwMCwgNjAwXSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh2aWV3MkNvcHkuc2l6ZSwgWzQwMCwgNjAwXSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2Rlc2VyaWFsaXplIHNpbXBsZSB2aWV3IGxheW91dCAjNTA2MDknLCBmdW5jdGlvbiAoKSB7XG5cdFx0Y29uc3QgdmlldzEgPSBzdG9yZS5hZGQobmV3IFRlc3RTZXJpYWxpemFibGVWaWV3KCd2aWV3MScsIDUwLCBOdW1iZXIuTUFYX1ZBTFVFLCA1MCwgTnVtYmVyLk1BWF9WQUxVRSkpO1xuXHRcdGNvbnN0IGdyaWQgPSBzdG9yZS5hZGQobmV3IFNlcmlhbGl6YWJsZUdyaWQodmlldzEpKTtcblx0XHRjb250YWluZXIuYXBwZW5kQ2hpbGQoZ3JpZC5lbGVtZW50KTtcblxuXHRcdGdyaWQubGF5b3V0KDgwMCwgNjAwKTtcblxuXHRcdGNvbnN0IHZpZXcyID0gc3RvcmUuYWRkKG5ldyBUZXN0U2VyaWFsaXphYmxlVmlldygndmlldzInLCA1MCwgTnVtYmVyLk1BWF9WQUxVRSwgNTAsIE51bWJlci5NQVhfVkFMVUUpKTtcblx0XHRncmlkLmFkZFZpZXcodmlldzIsIFNpemluZy5TcGxpdCwgdmlldzEsIERpcmVjdGlvbi5SaWdodCk7XG5cblx0XHRjb25zdCB2aWV3MyA9IHN0b3JlLmFkZChuZXcgVGVzdFNlcmlhbGl6YWJsZVZpZXcoJ3ZpZXczJywgNTAsIE51bWJlci5NQVhfVkFMVUUsIDUwLCBOdW1iZXIuTUFYX1ZBTFVFKSk7XG5cdFx0Z3JpZC5hZGRWaWV3KHZpZXczLCBTaXppbmcuU3BsaXQsIHZpZXcyLCBEaXJlY3Rpb24uRG93bik7XG5cblx0XHRncmlkLnJlbW92ZVZpZXcodmlldzEsIFNpemluZy5TcGxpdCk7XG5cblx0XHRjb25zdCBqc29uID0gZ3JpZC5zZXJpYWxpemUoKTtcblx0XHRncmlkLmRpc3Bvc2UoKTtcblxuXHRcdGNvbnN0IGRlc2VyaWFsaXplciA9IG5ldyBUZXN0Vmlld0Rlc2VyaWFsaXplcihzdG9yZSk7XG5cdFx0Y29uc3QgZ3JpZDIgPSBzdG9yZS5hZGQoU2VyaWFsaXphYmxlR3JpZC5kZXNlcmlhbGl6ZShqc29uLCBkZXNlcmlhbGl6ZXIpKTtcblxuXHRcdGNvbnN0IHZpZXcyQ29weSA9IGRlc2VyaWFsaXplci5nZXRWaWV3KCd2aWV3MicpO1xuXHRcdGNvbnN0IHZpZXczQ29weSA9IGRlc2VyaWFsaXplci5nZXRWaWV3KCd2aWV3MycpO1xuXG5cdFx0Z3JpZDIubGF5b3V0KDgwMCwgNjAwKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwodmlldzJDb3B5LnNpemUsIFs4MDAsIDMwMF0pO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwodmlldzNDb3B5LnNpemUsIFs4MDAsIDMwMF0pO1xuXHR9KTtcblxuXHR0ZXN0KCdzYW5pdGl6ZUdyaWROb2RlRGVzY3JpcHRvcicsICgpID0+IHtcblx0XHRjb25zdCBub2RlRGVzY3JpcHRvcjogR3JpZE5vZGVEZXNjcmlwdG9yPGFueT4gPSB7IGdyb3VwczogW3sgc2l6ZTogMC4yIH0sIHsgc2l6ZTogMC4yIH0sIHsgc2l6ZTogMC42LCBncm91cHM6IFt7fSwge31dIH1dIH07XG5cdFx0Y29uc3Qgbm9kZURlc2NyaXB0b3JDb3B5ID0gZGVlcENsb25lKG5vZGVEZXNjcmlwdG9yKTtcblx0XHRzYW5pdGl6ZUdyaWROb2RlRGVzY3JpcHRvcihub2RlRGVzY3JpcHRvckNvcHksIHRydWUpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwobm9kZURlc2NyaXB0b3JDb3B5LCB7IGdyb3VwczogW3sgc2l6ZTogMC4yIH0sIHsgc2l6ZTogMC4yIH0sIHsgc2l6ZTogMC42LCBncm91cHM6IFt7IHNpemU6IDAuNSB9LCB7IHNpemU6IDAuNSB9XSB9XSB9KTtcblx0fSk7XG5cblx0dGVzdCgnY3JlYXRlU2VyaWFsaXplZEdyaWQnLCAoKSA9PiB7XG5cdFx0Y29uc3QgZ3JpZERlc2NyaXB0b3IgPSB7IG9yaWVudGF0aW9uOiBPcmllbnRhdGlvbi5WRVJUSUNBTCwgZ3JvdXBzOiBbeyBzaXplOiAwLjIsIGRhdGE6ICdhJyB9LCB7IHNpemU6IDAuMiwgZGF0YTogJ2InIH0sIHsgc2l6ZTogMC42LCBncm91cHM6IFt7IGRhdGE6ICdjJyB9LCB7IGRhdGE6ICdkJyB9XSB9XSB9O1xuXHRcdGNvbnN0IHNlcmlhbGl6ZWRHcmlkID0gY3JlYXRlU2VyaWFsaXplZEdyaWQoZ3JpZERlc2NyaXB0b3IpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoc2VyaWFsaXplZEdyaWQsIHtcblx0XHRcdHJvb3Q6IHtcblx0XHRcdFx0dHlwZTogJ2JyYW5jaCcsXG5cdFx0XHRcdHNpemU6IHVuZGVmaW5lZCxcblx0XHRcdFx0ZGF0YTogW1xuXHRcdFx0XHRcdHsgdHlwZTogJ2xlYWYnLCBzaXplOiAwLjIsIGRhdGE6ICdhJyB9LFxuXHRcdFx0XHRcdHsgdHlwZTogJ2xlYWYnLCBzaXplOiAwLjIsIGRhdGE6ICdiJyB9LFxuXHRcdFx0XHRcdHtcblx0XHRcdFx0XHRcdHR5cGU6ICdicmFuY2gnLCBzaXplOiAwLjYsIGRhdGE6IFtcblx0XHRcdFx0XHRcdFx0eyB0eXBlOiAnbGVhZicsIHNpemU6IDAuNSwgZGF0YTogJ2MnIH0sXG5cdFx0XHRcdFx0XHRcdHsgdHlwZTogJ2xlYWYnLCBzaXplOiAwLjUsIGRhdGE6ICdkJyB9XG5cdFx0XHRcdFx0XHRdXG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRdXG5cdFx0XHR9LFxuXHRcdFx0b3JpZW50YXRpb246IE9yaWVudGF0aW9uLlZFUlRJQ0FMLFxuXHRcdFx0d2lkdGg6IDEsXG5cdFx0XHRoZWlnaHQ6IDFcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnY3JlYXRlU2VyaWFsaXplZEdyaWQgLSBpc3N1ZSAjODU2MDEsIHNob3VsZCBub3QgYWxsb3cgc2luZ2xlIGNoaWxkcmVuIGdyb3VwcycsICgpID0+IHtcblx0XHRjb25zdCBzZXJpYWxpemVkR3JpZCA9IGNyZWF0ZVNlcmlhbGl6ZWRHcmlkKHsgb3JpZW50YXRpb246IE9yaWVudGF0aW9uLkhPUklaT05UQUwsIGdyb3VwczogW3sgZ3JvdXBzOiBbe30sIHt9XSwgc2l6ZTogMC41IH0sIHsgZ3JvdXBzOiBbe31dLCBzaXplOiAwLjUgfV0gfSk7XG5cdFx0Y29uc3Qgdmlld3M6IElTZXJpYWxpemFibGVWaWV3W10gPSBbXTtcblx0XHRjb25zdCBkZXNlcmlhbGl6ZXIgPSBuZXcgY2xhc3MgaW1wbGVtZW50cyBJVmlld0Rlc2VyaWFsaXplcjxJU2VyaWFsaXphYmxlVmlldz4ge1xuXHRcdFx0ZnJvbUpTT04oKTogSVNlcmlhbGl6YWJsZVZpZXcge1xuXHRcdFx0XHRjb25zdCB2aWV3OiBJU2VyaWFsaXphYmxlVmlldyA9IHtcblx0XHRcdFx0XHRlbGVtZW50OiBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdkaXYnKSxcblx0XHRcdFx0XHRsYXlvdXQ6ICgpID0+IG51bGwsXG5cdFx0XHRcdFx0bWluaW11bVdpZHRoOiAwLFxuXHRcdFx0XHRcdG1heGltdW1XaWR0aDogTnVtYmVyLlBPU0lUSVZFX0lORklOSVRZLFxuXHRcdFx0XHRcdG1pbmltdW1IZWlnaHQ6IDAsXG5cdFx0XHRcdFx0bWF4aW11bUhlaWdodDogTnVtYmVyLlBPU0lUSVZFX0lORklOSVRZLFxuXHRcdFx0XHRcdG9uRGlkQ2hhbmdlOiBFdmVudC5Ob25lLFxuXHRcdFx0XHRcdHRvSlNPTjogKCkgPT4gKHt9KVxuXHRcdFx0XHR9O1xuXHRcdFx0XHR2aWV3cy5wdXNoKHZpZXcpO1xuXHRcdFx0XHRyZXR1cm4gdmlldztcblx0XHRcdH1cblx0XHR9O1xuXG5cdFx0Y29uc3QgZ3JpZCA9IHN0b3JlLmFkZChTZXJpYWxpemFibGVHcmlkLmRlc2VyaWFsaXplKHNlcmlhbGl6ZWRHcmlkLCBkZXNlcmlhbGl6ZXIpKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodmlld3MubGVuZ3RoLCAzKTtcblxuXHRcdC8vIHNob3VsZCBub3QgdGhyb3dcblx0XHRncmlkLnJlbW92ZVZpZXcodmlld3NbMl0pO1xuXHR9KTtcblxuXHR0ZXN0KCdmcm9tJywgKCkgPT4ge1xuXHRcdGNvbnN0IGNyZWF0ZVZpZXcgPSAoKTogSVNlcmlhbGl6YWJsZVZpZXcgPT4gKHtcblx0XHRcdGVsZW1lbnQ6IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2RpdicpLFxuXHRcdFx0bGF5b3V0OiAoKSA9PiBudWxsLFxuXHRcdFx0bWluaW11bVdpZHRoOiAwLFxuXHRcdFx0bWF4aW11bVdpZHRoOiBOdW1iZXIuUE9TSVRJVkVfSU5GSU5JVFksXG5cdFx0XHRtaW5pbXVtSGVpZ2h0OiAwLFxuXHRcdFx0bWF4aW11bUhlaWdodDogTnVtYmVyLlBPU0lUSVZFX0lORklOSVRZLFxuXHRcdFx0b25EaWRDaGFuZ2U6IEV2ZW50Lk5vbmUsXG5cdFx0XHR0b0pTT046ICgpID0+ICh7fSlcblx0XHR9KTtcblxuXHRcdGNvbnN0IGEgPSBjcmVhdGVWaWV3KCk7XG5cdFx0Y29uc3QgYiA9IGNyZWF0ZVZpZXcoKTtcblx0XHRjb25zdCBjID0gY3JlYXRlVmlldygpO1xuXHRcdGNvbnN0IGQgPSBjcmVhdGVWaWV3KCk7XG5cblx0XHRjb25zdCBncmlkRGVzY3JpcHRvciA9IHsgb3JpZW50YXRpb246IE9yaWVudGF0aW9uLlZFUlRJQ0FMLCBncm91cHM6IFt7IHNpemU6IDAuMiwgZGF0YTogYSB9LCB7IHNpemU6IDAuMiwgZGF0YTogYiB9LCB7IHNpemU6IDAuNiwgZ3JvdXBzOiBbeyBkYXRhOiBjIH0sIHsgZGF0YTogZCB9XSB9XSB9O1xuXHRcdGNvbnN0IGdyaWQgPSBTZXJpYWxpemFibGVHcmlkLmZyb20oZ3JpZERlc2NyaXB0b3IpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChub2Rlc1RvQXJyYXlzKGdyaWQuZ2V0Vmlld3MoKSksIFthLCBiLCBbYywgZF1dKTtcblx0XHRncmlkLmRpc3Bvc2UoKTtcblx0fSk7XG5cblx0dGVzdCgnc2VyaWFsaXplIHNob3VsZCBzdG9yZSB2aXNpYmlsaXR5IGFuZCBwcmV2aW91cyBzaXplJywgZnVuY3Rpb24gKCkge1xuXHRcdGNvbnN0IHZpZXcxID0gc3RvcmUuYWRkKG5ldyBUZXN0U2VyaWFsaXphYmxlVmlldygndmlldzEnLCA1MCwgTnVtYmVyLk1BWF9WQUxVRSwgNTAsIE51bWJlci5NQVhfVkFMVUUpKTtcblx0XHRjb25zdCBncmlkID0gc3RvcmUuYWRkKG5ldyBTZXJpYWxpemFibGVHcmlkKHZpZXcxKSk7XG5cdFx0Y29udGFpbmVyLmFwcGVuZENoaWxkKGdyaWQuZWxlbWVudCk7XG5cdFx0Z3JpZC5sYXlvdXQoODAwLCA2MDApO1xuXG5cdFx0Y29uc3QgdmlldzIgPSBzdG9yZS5hZGQobmV3IFRlc3RTZXJpYWxpemFibGVWaWV3KCd2aWV3MicsIDUwLCBOdW1iZXIuTUFYX1ZBTFVFLCA1MCwgTnVtYmVyLk1BWF9WQUxVRSkpO1xuXHRcdGdyaWQuYWRkVmlldyh2aWV3MiwgMjAwLCB2aWV3MSwgRGlyZWN0aW9uLlVwKTtcblxuXHRcdGNvbnN0IHZpZXczID0gc3RvcmUuYWRkKG5ldyBUZXN0U2VyaWFsaXphYmxlVmlldygndmlldzMnLCA1MCwgTnVtYmVyLk1BWF9WQUxVRSwgNTAsIE51bWJlci5NQVhfVkFMVUUpKTtcblx0XHRncmlkLmFkZFZpZXcodmlldzMsIDIwMCwgdmlldzEsIERpcmVjdGlvbi5SaWdodCk7XG5cblx0XHRjb25zdCB2aWV3NCA9IHN0b3JlLmFkZChuZXcgVGVzdFNlcmlhbGl6YWJsZVZpZXcoJ3ZpZXc0JywgNTAsIE51bWJlci5NQVhfVkFMVUUsIDUwLCBOdW1iZXIuTUFYX1ZBTFVFKSk7XG5cdFx0Z3JpZC5hZGRWaWV3KHZpZXc0LCAyMDAsIHZpZXcyLCBEaXJlY3Rpb24uTGVmdCk7XG5cblx0XHRjb25zdCB2aWV3NSA9IHN0b3JlLmFkZChuZXcgVGVzdFNlcmlhbGl6YWJsZVZpZXcoJ3ZpZXc1JywgNTAsIE51bWJlci5NQVhfVkFMVUUsIDUwLCBOdW1iZXIuTUFYX1ZBTFVFKSk7XG5cdFx0Z3JpZC5hZGRWaWV3KHZpZXc1LCAxMDAsIHZpZXcxLCBEaXJlY3Rpb24uRG93bik7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHZpZXcxLnNpemUsIFs2MDAsIDMwMF0pO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwodmlldzIuc2l6ZSwgWzYwMCwgMjAwXSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh2aWV3My5zaXplLCBbMjAwLCA0MDBdKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHZpZXc0LnNpemUsIFsyMDAsIDIwMF0pO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwodmlldzUuc2l6ZSwgWzYwMCwgMTAwXSk7XG5cblx0XHRncmlkLnNldFZpZXdWaXNpYmxlKHZpZXc1LCBmYWxzZSk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHZpZXcxLnNpemUsIFs2MDAsIDQwMF0pO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwodmlldzIuc2l6ZSwgWzYwMCwgMjAwXSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh2aWV3My5zaXplLCBbMjAwLCA0MDBdKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHZpZXc0LnNpemUsIFsyMDAsIDIwMF0pO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwodmlldzUuc2l6ZSwgWzYwMCwgMF0pO1xuXG5cdFx0Z3JpZC5zZXRWaWV3VmlzaWJsZSh2aWV3NSwgdHJ1ZSk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHZpZXcxLnNpemUsIFs2MDAsIDMwMF0pO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwodmlldzIuc2l6ZSwgWzYwMCwgMjAwXSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh2aWV3My5zaXplLCBbMjAwLCA0MDBdKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHZpZXc0LnNpemUsIFsyMDAsIDIwMF0pO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwodmlldzUuc2l6ZSwgWzYwMCwgMTAwXSk7XG5cblx0XHRncmlkLnNldFZpZXdWaXNpYmxlKHZpZXc1LCBmYWxzZSk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHZpZXcxLnNpemUsIFs2MDAsIDQwMF0pO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwodmlldzIuc2l6ZSwgWzYwMCwgMjAwXSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh2aWV3My5zaXplLCBbMjAwLCA0MDBdKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHZpZXc0LnNpemUsIFsyMDAsIDIwMF0pO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwodmlldzUuc2l6ZSwgWzYwMCwgMF0pO1xuXG5cdFx0Z3JpZC5zZXRWaWV3VmlzaWJsZSh2aWV3NSwgZmFsc2UpO1xuXG5cdFx0Y29uc3QganNvbiA9IGdyaWQuc2VyaWFsaXplKCk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChqc29uLCB7XG5cdFx0XHRvcmllbnRhdGlvbjogMCxcblx0XHRcdHdpZHRoOiA4MDAsXG5cdFx0XHRoZWlnaHQ6IDYwMCxcblx0XHRcdHJvb3Q6IHtcblx0XHRcdFx0dHlwZTogJ2JyYW5jaCcsXG5cdFx0XHRcdGRhdGE6IFtcblx0XHRcdFx0XHR7XG5cdFx0XHRcdFx0XHR0eXBlOiAnYnJhbmNoJyxcblx0XHRcdFx0XHRcdGRhdGE6IFtcblx0XHRcdFx0XHRcdFx0eyB0eXBlOiAnbGVhZicsIGRhdGE6IHsgbmFtZTogJ3ZpZXc0JyB9LCBzaXplOiAyMDAgfSxcblx0XHRcdFx0XHRcdFx0eyB0eXBlOiAnbGVhZicsIGRhdGE6IHsgbmFtZTogJ3ZpZXcyJyB9LCBzaXplOiA2MDAgfVxuXHRcdFx0XHRcdFx0XSxcblx0XHRcdFx0XHRcdHNpemU6IDIwMFxuXHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0e1xuXHRcdFx0XHRcdFx0dHlwZTogJ2JyYW5jaCcsXG5cdFx0XHRcdFx0XHRkYXRhOiBbXG5cdFx0XHRcdFx0XHRcdHtcblx0XHRcdFx0XHRcdFx0XHR0eXBlOiAnYnJhbmNoJyxcblx0XHRcdFx0XHRcdFx0XHRkYXRhOiBbXG5cdFx0XHRcdFx0XHRcdFx0XHR7IHR5cGU6ICdsZWFmJywgZGF0YTogeyBuYW1lOiAndmlldzEnIH0sIHNpemU6IDQwMCB9LFxuXHRcdFx0XHRcdFx0XHRcdFx0eyB0eXBlOiAnbGVhZicsIGRhdGE6IHsgbmFtZTogJ3ZpZXc1JyB9LCBzaXplOiAxMDAsIHZpc2libGU6IGZhbHNlIH1cblx0XHRcdFx0XHRcdFx0XHRdLFxuXHRcdFx0XHRcdFx0XHRcdHNpemU6IDYwMFxuXHRcdFx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdFx0XHR7IHR5cGU6ICdsZWFmJywgZGF0YTogeyBuYW1lOiAndmlldzMnIH0sIHNpemU6IDIwMCB9XG5cdFx0XHRcdFx0XHRdLFxuXHRcdFx0XHRcdFx0c2l6ZTogNDAwXG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRdLFxuXHRcdFx0XHRzaXplOiA4MDBcblx0XHRcdH1cblx0XHR9KTtcblxuXHRcdGdyaWQuZGlzcG9zZSgpO1xuXG5cdFx0Y29uc3QgZGVzZXJpYWxpemVyID0gbmV3IFRlc3RWaWV3RGVzZXJpYWxpemVyKHN0b3JlKTtcblx0XHRjb25zdCBncmlkMiA9IHN0b3JlLmFkZChTZXJpYWxpemFibGVHcmlkLmRlc2VyaWFsaXplKGpzb24sIGRlc2VyaWFsaXplcikpO1xuXG5cdFx0Y29uc3QgdmlldzFDb3B5ID0gZGVzZXJpYWxpemVyLmdldFZpZXcoJ3ZpZXcxJyk7XG5cdFx0Y29uc3QgdmlldzJDb3B5ID0gZGVzZXJpYWxpemVyLmdldFZpZXcoJ3ZpZXcyJyk7XG5cdFx0Y29uc3QgdmlldzNDb3B5ID0gZGVzZXJpYWxpemVyLmdldFZpZXcoJ3ZpZXczJyk7XG5cdFx0Y29uc3QgdmlldzRDb3B5ID0gZGVzZXJpYWxpemVyLmdldFZpZXcoJ3ZpZXc0Jyk7XG5cdFx0Y29uc3QgdmlldzVDb3B5ID0gZGVzZXJpYWxpemVyLmdldFZpZXcoJ3ZpZXc1Jyk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKG5vZGVzVG9BcnJheXMoZ3JpZDIuZ2V0Vmlld3MoKSksIFtbdmlldzRDb3B5LCB2aWV3MkNvcHldLCBbW3ZpZXcxQ29weSwgdmlldzVDb3B5XSwgdmlldzNDb3B5XV0pO1xuXG5cdFx0Z3JpZDIubGF5b3V0KDgwMCwgNjAwKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHZpZXcxQ29weS5zaXplLCBbNjAwLCA0MDBdKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHZpZXcyQ29weS5zaXplLCBbNjAwLCAyMDBdKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHZpZXczQ29weS5zaXplLCBbMjAwLCA0MDBdKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHZpZXc0Q29weS5zaXplLCBbMjAwLCAyMDBdKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHZpZXc1Q29weS5zaXplLCBbNjAwLCAwXSk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGdyaWQyLmlzVmlld1Zpc2libGUodmlldzFDb3B5KSwgdHJ1ZSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChncmlkMi5pc1ZpZXdWaXNpYmxlKHZpZXcyQ29weSksIHRydWUpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoZ3JpZDIuaXNWaWV3VmlzaWJsZSh2aWV3M0NvcHkpLCB0cnVlKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGdyaWQyLmlzVmlld1Zpc2libGUodmlldzRDb3B5KSwgdHJ1ZSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChncmlkMi5pc1ZpZXdWaXNpYmxlKHZpZXc1Q29weSksIGZhbHNlKTtcblxuXHRcdGdyaWQyLnNldFZpZXdWaXNpYmxlKHZpZXc1Q29weSwgdHJ1ZSk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHZpZXcxQ29weS5zaXplLCBbNjAwLCAzMDBdKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHZpZXcyQ29weS5zaXplLCBbNjAwLCAyMDBdKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHZpZXczQ29weS5zaXplLCBbMjAwLCA0MDBdKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHZpZXc0Q29weS5zaXplLCBbMjAwLCAyMDBdKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHZpZXc1Q29weS5zaXplLCBbNjAwLCAxMDBdKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoZ3JpZDIuaXNWaWV3VmlzaWJsZSh2aWV3MUNvcHkpLCB0cnVlKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGdyaWQyLmlzVmlld1Zpc2libGUodmlldzJDb3B5KSwgdHJ1ZSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChncmlkMi5pc1ZpZXdWaXNpYmxlKHZpZXczQ29weSksIHRydWUpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoZ3JpZDIuaXNWaWV3VmlzaWJsZSh2aWV3NENvcHkpLCB0cnVlKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGdyaWQyLmlzVmlld1Zpc2libGUodmlldzVDb3B5KSwgdHJ1ZSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3NlcmlhbGl6ZSBzaG91bGQgc3RvcmUgdmlzaWJpbGl0eSBhbmQgcHJldmlvdXMgc2l6ZSBldmVuIGZvciBmaXJzdCBsZWFmJywgZnVuY3Rpb24gKCkge1xuXHRcdGNvbnN0IHZpZXcxID0gc3RvcmUuYWRkKG5ldyBUZXN0U2VyaWFsaXphYmxlVmlldygndmlldzEnLCA1MCwgTnVtYmVyLk1BWF9WQUxVRSwgNTAsIE51bWJlci5NQVhfVkFMVUUpKTtcblx0XHRjb25zdCBncmlkID0gc3RvcmUuYWRkKG5ldyBTZXJpYWxpemFibGVHcmlkKHZpZXcxKSk7XG5cdFx0Y29udGFpbmVyLmFwcGVuZENoaWxkKGdyaWQuZWxlbWVudCk7XG5cdFx0Z3JpZC5sYXlvdXQoODAwLCA2MDApO1xuXG5cdFx0Y29uc3QgdmlldzIgPSBzdG9yZS5hZGQobmV3IFRlc3RTZXJpYWxpemFibGVWaWV3KCd2aWV3MicsIDUwLCBOdW1iZXIuTUFYX1ZBTFVFLCA1MCwgTnVtYmVyLk1BWF9WQUxVRSkpO1xuXHRcdGdyaWQuYWRkVmlldyh2aWV3MiwgMjAwLCB2aWV3MSwgRGlyZWN0aW9uLlVwKTtcblxuXHRcdGNvbnN0IHZpZXczID0gc3RvcmUuYWRkKG5ldyBUZXN0U2VyaWFsaXphYmxlVmlldygndmlldzMnLCA1MCwgTnVtYmVyLk1BWF9WQUxVRSwgNTAsIE51bWJlci5NQVhfVkFMVUUpKTtcblx0XHRncmlkLmFkZFZpZXcodmlldzMsIDIwMCwgdmlldzEsIERpcmVjdGlvbi5SaWdodCk7XG5cblx0XHRjb25zdCB2aWV3NCA9IHN0b3JlLmFkZChuZXcgVGVzdFNlcmlhbGl6YWJsZVZpZXcoJ3ZpZXc0JywgNTAsIE51bWJlci5NQVhfVkFMVUUsIDUwLCBOdW1iZXIuTUFYX1ZBTFVFKSk7XG5cdFx0Z3JpZC5hZGRWaWV3KHZpZXc0LCAyMDAsIHZpZXcyLCBEaXJlY3Rpb24uTGVmdCk7XG5cblx0XHRjb25zdCB2aWV3NSA9IHN0b3JlLmFkZChuZXcgVGVzdFNlcmlhbGl6YWJsZVZpZXcoJ3ZpZXc1JywgNTAsIE51bWJlci5NQVhfVkFMVUUsIDUwLCBOdW1iZXIuTUFYX1ZBTFVFKSk7XG5cdFx0Z3JpZC5hZGRWaWV3KHZpZXc1LCAxMDAsIHZpZXcxLCBEaXJlY3Rpb24uRG93bik7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHZpZXcxLnNpemUsIFs2MDAsIDMwMF0pO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwodmlldzIuc2l6ZSwgWzYwMCwgMjAwXSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh2aWV3My5zaXplLCBbMjAwLCA0MDBdKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHZpZXc0LnNpemUsIFsyMDAsIDIwMF0pO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwodmlldzUuc2l6ZSwgWzYwMCwgMTAwXSk7XG5cblx0XHRncmlkLnNldFZpZXdWaXNpYmxlKHZpZXc0LCBmYWxzZSk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHZpZXcxLnNpemUsIFs2MDAsIDMwMF0pO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwodmlldzIuc2l6ZSwgWzgwMCwgMjAwXSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh2aWV3My5zaXplLCBbMjAwLCA0MDBdKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHZpZXc0LnNpemUsIFswLCAyMDBdKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHZpZXc1LnNpemUsIFs2MDAsIDEwMF0pO1xuXG5cdFx0Y29uc3QganNvbiA9IGdyaWQuc2VyaWFsaXplKCk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChqc29uLCB7XG5cdFx0XHRvcmllbnRhdGlvbjogMCxcblx0XHRcdHdpZHRoOiA4MDAsXG5cdFx0XHRoZWlnaHQ6IDYwMCxcblx0XHRcdHJvb3Q6IHtcblx0XHRcdFx0dHlwZTogJ2JyYW5jaCcsXG5cdFx0XHRcdGRhdGE6IFtcblx0XHRcdFx0XHR7XG5cdFx0XHRcdFx0XHR0eXBlOiAnYnJhbmNoJyxcblx0XHRcdFx0XHRcdGRhdGE6IFtcblx0XHRcdFx0XHRcdFx0eyB0eXBlOiAnbGVhZicsIGRhdGE6IHsgbmFtZTogJ3ZpZXc0JyB9LCBzaXplOiAyMDAsIHZpc2libGU6IGZhbHNlIH0sXG5cdFx0XHRcdFx0XHRcdHsgdHlwZTogJ2xlYWYnLCBkYXRhOiB7IG5hbWU6ICd2aWV3MicgfSwgc2l6ZTogODAwIH1cblx0XHRcdFx0XHRcdF0sXG5cdFx0XHRcdFx0XHRzaXplOiAyMDBcblx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdHtcblx0XHRcdFx0XHRcdHR5cGU6ICdicmFuY2gnLFxuXHRcdFx0XHRcdFx0ZGF0YTogW1xuXHRcdFx0XHRcdFx0XHR7XG5cdFx0XHRcdFx0XHRcdFx0dHlwZTogJ2JyYW5jaCcsXG5cdFx0XHRcdFx0XHRcdFx0ZGF0YTogW1xuXHRcdFx0XHRcdFx0XHRcdFx0eyB0eXBlOiAnbGVhZicsIGRhdGE6IHsgbmFtZTogJ3ZpZXcxJyB9LCBzaXplOiAzMDAgfSxcblx0XHRcdFx0XHRcdFx0XHRcdHsgdHlwZTogJ2xlYWYnLCBkYXRhOiB7IG5hbWU6ICd2aWV3NScgfSwgc2l6ZTogMTAwIH1cblx0XHRcdFx0XHRcdFx0XHRdLFxuXHRcdFx0XHRcdFx0XHRcdHNpemU6IDYwMFxuXHRcdFx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdFx0XHR7IHR5cGU6ICdsZWFmJywgZGF0YTogeyBuYW1lOiAndmlldzMnIH0sIHNpemU6IDIwMCB9XG5cdFx0XHRcdFx0XHRdLFxuXHRcdFx0XHRcdFx0c2l6ZTogNDAwXG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRdLFxuXHRcdFx0XHRzaXplOiA4MDBcblx0XHRcdH1cblx0XHR9KTtcblxuXHRcdGdyaWQuZGlzcG9zZSgpO1xuXG5cdFx0Y29uc3QgZGVzZXJpYWxpemVyID0gbmV3IFRlc3RWaWV3RGVzZXJpYWxpemVyKHN0b3JlKTtcblx0XHRjb25zdCBncmlkMiA9IHN0b3JlLmFkZChTZXJpYWxpemFibGVHcmlkLmRlc2VyaWFsaXplKGpzb24sIGRlc2VyaWFsaXplcikpO1xuXG5cdFx0Y29uc3QgdmlldzFDb3B5ID0gZGVzZXJpYWxpemVyLmdldFZpZXcoJ3ZpZXcxJyk7XG5cdFx0Y29uc3QgdmlldzJDb3B5ID0gZGVzZXJpYWxpemVyLmdldFZpZXcoJ3ZpZXcyJyk7XG5cdFx0Y29uc3QgdmlldzNDb3B5ID0gZGVzZXJpYWxpemVyLmdldFZpZXcoJ3ZpZXczJyk7XG5cdFx0Y29uc3QgdmlldzRDb3B5ID0gZGVzZXJpYWxpemVyLmdldFZpZXcoJ3ZpZXc0Jyk7XG5cdFx0Y29uc3QgdmlldzVDb3B5ID0gZGVzZXJpYWxpemVyLmdldFZpZXcoJ3ZpZXc1Jyk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKG5vZGVzVG9BcnJheXMoZ3JpZDIuZ2V0Vmlld3MoKSksIFtbdmlldzRDb3B5LCB2aWV3MkNvcHldLCBbW3ZpZXcxQ29weSwgdmlldzVDb3B5XSwgdmlldzNDb3B5XV0pO1xuXG5cdFx0Z3JpZDIubGF5b3V0KDgwMCwgNjAwKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHZpZXcxQ29weS5zaXplLCBbNjAwLCAzMDBdKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHZpZXcyQ29weS5zaXplLCBbODAwLCAyMDBdKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHZpZXczQ29weS5zaXplLCBbMjAwLCA0MDBdKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHZpZXc0Q29weS5zaXplLCBbMCwgMjAwXSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh2aWV3NUNvcHkuc2l6ZSwgWzYwMCwgMTAwXSk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGdyaWQyLmlzVmlld1Zpc2libGUodmlldzFDb3B5KSwgdHJ1ZSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChncmlkMi5pc1ZpZXdWaXNpYmxlKHZpZXcyQ29weSksIHRydWUpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoZ3JpZDIuaXNWaWV3VmlzaWJsZSh2aWV3M0NvcHkpLCB0cnVlKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGdyaWQyLmlzVmlld1Zpc2libGUodmlldzRDb3B5KSwgZmFsc2UpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoZ3JpZDIuaXNWaWV3VmlzaWJsZSh2aWV3NUNvcHkpLCB0cnVlKTtcblxuXHRcdGdyaWQyLnNldFZpZXdWaXNpYmxlKHZpZXc0Q29weSwgdHJ1ZSk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHZpZXcxQ29weS5zaXplLCBbNjAwLCAzMDBdKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHZpZXcyQ29weS5zaXplLCBbNjAwLCAyMDBdKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHZpZXczQ29weS5zaXplLCBbMjAwLCA0MDBdKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHZpZXc0Q29weS5zaXplLCBbMjAwLCAyMDBdKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHZpZXc1Q29weS5zaXplLCBbNjAwLCAxMDBdKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoZ3JpZDIuaXNWaWV3VmlzaWJsZSh2aWV3MUNvcHkpLCB0cnVlKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGdyaWQyLmlzVmlld1Zpc2libGUodmlldzJDb3B5KSwgdHJ1ZSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChncmlkMi5pc1ZpZXdWaXNpYmxlKHZpZXczQ29weSksIHRydWUpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoZ3JpZDIuaXNWaWV3VmlzaWJsZSh2aWV3NENvcHkpLCB0cnVlKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGdyaWQyLmlzVmlld1Zpc2libGUodmlldzVDb3B5KSwgdHJ1ZSk7XG5cdH0pO1xufSk7XG4iXSwKICAibWFwcGluZ3MiOiAiQUFLQSxPQUFPLFlBQVk7QUFDbkIsU0FBUyxzQkFBc0IsV0FBVyxxQkFBcUIsTUFBdUQsa0JBQXFDLGFBQWEsNEJBQTRCLGtCQUFrQixjQUFjO0FBQ3BPLFNBQVMsYUFBYTtBQUN0QixTQUFTLGlCQUFpQjtBQUMxQixTQUFTLGVBQWUsZ0JBQWdCO0FBQ3hDLFNBQVMsK0NBQStDO0FBdUJ4RCxNQUFNLFFBQVEsV0FBWTtBQUV6QixRQUFNLFFBQVEsd0NBQXdDO0FBQ3RELE1BQUk7QUFFSixRQUFNLFdBQVk7QUFDakIsZ0JBQVksU0FBUyxjQUFjLEtBQUs7QUFDeEMsY0FBVSxNQUFNLFdBQVc7QUFDM0IsY0FBVSxNQUFNLFFBQVEsR0FBRyxHQUFHO0FBQzlCLGNBQVUsTUFBTSxTQUFTLEdBQUcsR0FBRztBQUFBLEVBQ2hDLENBQUM7QUFFRCxPQUFLLHVCQUF1QixNQUFNO0FBQ2pDLFdBQU8sZ0JBQWdCLG9CQUFvQixZQUFZLFVBQVUsQ0FBQyxDQUFDLEdBQUcsVUFBVSxFQUFFLEdBQUcsQ0FBQyxDQUFDLENBQUM7QUFDeEYsV0FBTyxnQkFBZ0Isb0JBQW9CLFlBQVksVUFBVSxDQUFDLENBQUMsR0FBRyxVQUFVLElBQUksR0FBRyxDQUFDLENBQUMs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Z0IsTUFBTSxNQUFNLENBQUMsS0FBSyxHQUFHLENBQUM7QUFDN0MsV0FBTyxnQkFBZ0IsTUFBTSxNQUFNLENBQUMsS0FBSyxHQUFHLENBQUM7QUFDN0MsV0FBTyxnQkFBZ0IsTUFBTSxNQUFNLENBQUMsS0FBSyxHQUFHLENBQUM7QUFDN0MsV0FBTyxnQkFBZ0IsTUFBTSxNQUFNLENBQUMsS0FBSyxHQUFHLENBQUM7QUFFN0MsVUFBTSxRQUFRLE1BQU0sSUFBSSxJQUFJLFNBQVMsSUFBSSxPQUFPLFdBQVcsSUFBSSxPQUFPLFNBQVMsQ0FBQztBQUNoRixTQUFLLFFBQVEsT0FBTyxPQUFPLFlBQVksT0FBTyxVQUFVLEVBQUU7QUFDMUQsV0FBTyxnQkFBZ0IsTUFBTSxNQUFNLENBQUMsS0FBSyxHQUFHLENBQUM7QUFDN0MsV0FBTyxnQkFBZ0IsTUFBTSxNQUFNLENBQUMsS0FBSyxHQUFHLENBQUM7QUFDN0MsV0FBTyxnQkFBZ0IsTUFBTSxNQUFNLENBQUMsS0FBSyxHQUFHLENBQUM7QUFDN0MsV0FBTyxnQkFBZ0IsTUFBTSxNQUFNLENBQUMsS0FBSyxHQUFHLENBQUM7QUFDN0MsV0FBTyxnQkFBZ0IsTUFBTSxNQUFNLENBQUMsS0FBSyxHQUFHLENBQUM7QUFFN0MsVUFBTSxRQUFRLE1BQU0sSUFBSSxJQUFJLFNBQVMsSUFBSSxPQUFPLFdBQVcsSUFBSSxPQUFPLFNBQVMsQ0FBQztBQUNoRixTQUFLLFFBQVEsT0FBTyxPQUFPLFlBQVksT0FBTyxVQUFVLElBQUk7QUFDNUQsV0FBTyxnQkFBZ0IsTUFBTSxNQUFNLENBQUMsS0FBSyxHQUFHLENBQUM7QUFDN0MsV0FBTyxnQkFBZ0IsTUFBTSxNQUFNLENBQUMsS0FBSyxHQUFHLENBQUM7QUFDN0MsV0FBTyxnQkFBZ0IsTUFBTSxNQUFNLENBQUMsS0FBSyxHQUFHLENBQUM7QUFDN0MsV0FBTyxnQkFBZ0IsTUFBTSxNQUFNLENBQUMsS0FBSyxHQUFHLENBQUM7QUFDN0MsV0FBTyxnQkFBZ0IsTUFBTSxNQUFNLENBQUMsS0FBSyxHQUFHLENBQUM7QUFDN0MsV0FBTyxnQkFBZ0IsTUFBTSxNQUFNLENBQUMsS0FBSyxHQUFHLENBQUM7QUFBQSxFQUM5QyxDQUFDO0FBRUQsT0FBSyxzREFBc0QsV0FBWTtBQUN0RSxVQUFNLFFBQVEsTUFBTSxJQUFJLElBQUksU0FBUyxJQUFJLE9BQU8sV0FBVyxJQUFJLE9BQU8sU0FBUyxDQUFDO0FBQ2hGLFVBQU0sT0FBTyxNQUFNLElBQUksSUFBSSxLQUFLLEtBQUssQ0FBQztBQUN0QyxjQUFVLFlBQVksS0FBSyxPQUFPO0FBRWxDLFNBQUssT0FBTyxLQUFLLEdBQUc7QUFDcEIsV0FBTyxnQkFBZ0IsTUFBTSxNQUFNLENBQUMsS0FBSyxHQUFHLENBQUM7QUFFN0MsVUFBTSxRQUFRLE1BQU0sSUFBSSxJQUFJLFNBQVMsSUFBSSxPQUFPLFdBQVcsSUFBSSxPQUFPLFNBQVMsQ0FBQztBQUNoRixTQUFLLFFBQVEsT0FBTyxPQUFPLE9BQU8sT0FBTyxVQUFVLElBQUk7QUFDdkQsV0FBTyxnQkFBZ0IsTUFBTSxNQUFNLENBQUMsS0FBSyxHQUFHLENBQUM7QUFDN0MsV0FBTyxnQkFBZ0IsTUFBTSxNQUFNLENBQUMsS0FBSyxHQUFHLENBQUM7QUFFN0MsVUFBTSxRQUFRLE1BQU0sSUFBSSxJQUFJLFNBQVMsSUFBSSxPQUFPLFdBQVcsSUFBSSxPQUFPLFNBQVMsQ0FBQztBQUNoRixTQUFLLFFBQVEsT0FBTyxPQUFPLE9BQU8sT0FBTyxVQUFVLEtBQUs7QUFDeEQsV0FBTyxnQkFBZ0IsTUFBTSxNQUFNLENBQUMsS0FBSyxHQUFHLENBQUM7QUFDN0MsV0FBTyxnQkFBZ0IsTUFBTSxNQUFNLENBQUMsS0FBSyxHQUFHLENBQUM7QUFDN0MsV0FBTyxnQkFBZ0IsTUFBTSxNQUFNLENBQUMsS0FBSyxHQUFHLENBQUM7QUFFN0MsVUFBTSxRQUFRLE1BQU0sSUFBSSxJQUFJLFNBQVMsSUFBSSxPQUFPLFdBQVcsSUFBSSxPQUFPLFNBQVMsQ0FBQztBQUNoRixTQUFLLFFBQVEsT0FBTyxPQUFPLE9BQU8sT0FBTyxVQUFVLElBQUk7QUFDdkQsV0FBTyxnQkFBZ0IsTUFBTSxNQUFNLENBQUMsS0FBSyxHQUFHLENBQUM7QUFDN0MsV0FBTyxnQkFBZ0IsTUFBTSxNQUFNLENBQUMsS0FBSyxHQUFHLENBQUM7QUFDN0MsV0FBTyxnQkFBZ0IsTUFBTSxNQUFNLENBQUMsS0FBSyxHQUFHLENBQUM7QUFDN0MsV0FBTyxnQkFBZ0IsTUFBTSxNQUFNLENBQUMsS0FBSyxHQUFHLENBQUM7QUFFN0MsVUFBTSxRQUFRLE1BQU0sSUFBSSxJQUFJLFNBQVMsSUFBSSxPQUFPLFdBQVcsSUFBSSxPQUFPLFNBQVMsQ0FBQztBQUNoRixTQUFLLFFBQVEsT0FBTyxPQUFPLE9BQU8sT0FBTyxVQUFVLEVBQUU7QUFDckQsV0FBTyxnQkFBZ0IsTUFBTSxNQUFNLENBQUMsS0FBSyxHQUFHLENBQUM7QUFDN0MsV0FBTyxnQkFBZ0IsTUFBTSxNQUFNLENBQUMsS0FBSyxHQUFHLENBQUM7QUFDN0MsV0FBTyxnQkFBZ0IsTUFBTSxNQUFNLENBQUMsS0FBSyxHQUFHLENBQUM7QUFDN0MsV0FBTyxnQkFBZ0IsTUFBTSxNQUFNLENBQUMsS0FBSyxHQUFHLENBQUM7QUFDN0MsV0FBTyxnQkFBZ0IsTUFBTSxNQUFNLENBQUMsS0FBSyxHQUFHLENBQUM7QUFFN0MsVUFBTSxRQUFRLE1BQU0sSUFBSSxJQUFJLFNBQVMsSUFBSSxPQUFPLFdBQVcsSUFBSSxPQUFPLFNBQVMsQ0FBQztBQUNoRixTQUFLLFFBQVEsT0FBTyxPQUFPLE9BQU8sT0FBTyxVQUFVLElBQUk7QUFDdkQsV0FBTyxnQkFBZ0IsTUFBTSxNQUFNLENBQUMsS0FBSyxHQUFHLENBQUM7QUFDN0MsV0FBTyxnQkFBZ0IsTUFBTSxNQUFNLENBQUMsS0FBSyxHQUFHLENBQUM7QUFDN0MsV0FBTyxnQkFBZ0IsTUFBTSxNQUFNLENBQUMsS0FBSyxHQUFHLENBQUM7QUFDN0MsV0FBTyxnQkFBZ0IsTUFBTSxNQUFNLENBQUMsS0FBSyxHQUFHLENBQUM7QUFDN0MsV0FBTyxnQkFBZ0IsTUFBTSxNQUFNLENBQUMsS0FBSyxHQUFHLENBQUM7QUFDN0MsV0FB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T0FBTyxTQUFTLENBQUM7QUFDaEYsU0FBSyxRQUFRLE9BQU8sT0FBTyxZQUFZLE9BQU8sVUFBVSxLQUFLO0FBRTdELFVBQU0sUUFBUSxNQUFNO0FBQ3BCLFVBQU0sUUFBUSxNQUFNO0FBQ3BCLFVBQU0sUUFBUSxNQUFNO0FBQ3BCLFVBQU0sUUFBUSxNQUFNO0FBRXBCLFNBQUssYUFBYSxLQUFLO0FBSXZCLFdBQU8sZ0JBQWdCLE1BQU0sTUFBTSxDQUFDLEtBQUssR0FBRyxDQUFDO0FBQzdDLFdBQU8sZ0JBQWdCLE1BQU0sTUFBTSxDQUFDLEdBQUcsQ0FBQyxDQUFDO0FBQ3pDLFdBQU8sZ0JBQWdCLE1BQU0sTUFBTSxDQUFDLEdBQUcsQ0FBQyxDQUFDO0FBQ3pDLFdBQU8sZ0JBQWdCLE1BQU0sTUFBTSxDQUFDLEdBQUcsQ0FBQyxDQUFDO0FBRXpDLFNBQUssa0JBQWtCO0FBRXZCLFdBQU8sZ0JBQWdCLE1BQU0sTUFBTSxLQUFLO0FBQ3hDLFdBQU8sZ0JBQWdCLE1BQU0sTUFBTSxLQUFLO0FBQ3hDLFdBQU8sZ0JBQWdCLE1BQU0sTUFBTSxLQUFLO0FBQ3hDLFdBQU8sZ0JBQWdCLE1BQU0sTUFBTSxLQUFLO0FBSXhDLFNBQUssYUFBYSxLQUFLO0FBRXZCLFdBQU8sZ0JBQWdCLE1BQU0sTUFBTSxDQUFDLEdBQUcsR0FBRyxDQUFDO0FBQzNDLFdBQU8sZ0JBQWdCLE1BQU0sTUFBTSxDQUFDLEtBQUssR0FBRyxDQUFDO0FBQzdDLFdBQU8sZ0JBQWdCLE1BQU0sTUFBTSxDQUFDLEtBQUssQ0FBQyxDQUFDO0FBQzNDLFdBQU8sZ0JBQWdCLE1BQU0sTUFBTSxDQUFDLEdBQUcsR0FBRyxDQUFDO0FBRTNDLFNBQUssa0JBQWtCO0FBRXZCLFdBQU8sZ0JBQWdCLE1BQU0sTUFBTSxLQUFLO0FBQ3hDLFdBQU8sZ0JBQWdCLE1BQU0sTUFBTSxLQUFLO0FBQ3hDLFdBQU8sZ0JBQWdCLE1BQU0sTUFBTSxLQUFLO0FBQ3hDLFdBQU8sZ0JBQWdCLE1BQU0sTUFBTSxLQUFLO0FBQUEsRUFDekMsQ0FBQztBQUVELE9BQUssb0JB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
