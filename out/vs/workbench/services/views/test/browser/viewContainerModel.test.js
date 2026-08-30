import * as nls from "../../../../../nls.js";
import assert from "assert";
import * as sinon from "sinon";
import { Extensions as ViewContainerExtensions, ViewContainerLocation } from "../../../../common/views.js";
import { dispose } from "../../../../../base/common/lifecycle.js";
import { move } from "../../../../../base/common/arrays.js";
import { workbenchInstantiationService } from "../../../../test/browser/workbenchTestServices.js";
import { ContextKeyExpr, IContextKeyService } from "../../../../../platform/contextkey/common/contextkey.js";
import { ContextKeyService } from "../../../../../platform/contextkey/browser/contextKeyService.js";
import { ViewDescriptorService } from "../../browser/viewDescriptorService.js";
import { Registry } from "../../../../../platform/registry/common/platform.js";
import { SyncDescriptor } from "../../../../../platform/instantiation/common/descriptors.js";
import { IStorageService, StorageScope, StorageTarget } from "../../../../../platform/storage/common/storage.js";
import { Event } from "../../../../../base/common/event.js";
import { getViewsStateStorageId } from "../../common/viewContainerModel.js";
import { runWithFakedTimers } from "../../../../../base/test/common/timeTravelScheduler.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../../base/test/common/utils.js";
const ViewContainerRegistry = Registry.as(ViewContainerExtensions.ViewContainersRegistry);
const ViewsRegistry = Registry.as(ViewContainerExtensions.ViewsRegistry);
class ViewDescriptorSequence {
  constructor(model) {
    this.disposables = [];
    this.elements = [...model.visibleViewDescriptors];
    model.onDidAddVisibleViewDescriptors((added) => added.forEach(({ viewDescriptor, index }) => this.elements.splice(index, 0, viewDescriptor)), null, this.disposables);
    model.onDidRemoveVisibleViewDescriptors((removed) => removed.sort((a, b) => b.index - a.index).forEach(({ index }) => this.elements.splice(index, 1)), null, this.disposables);
    model.onDidMoveVisibleViewDescriptors(({ from, to }) => move(this.elements, from.index, to.index), null, this.disposables);
  }
  dispose() {
    this.disposables = dispose(this.disposables);
  }
}
suite("ViewContainerModel", () => {
  let container;
  const disposableStore = ensureNoDisposablesAreLeakedInTestSuite();
  let contextKeyService;
  let viewDescriptorService;
  let storageService;
  setup(() => {
    const instantiationService = workbenchInstantiationService(void 0, disposableStore);
    contextKeyService = disposableStore.add(instantiationService.createInstance(ContextKeyService));
    instantiationService.stub(IContextKeyService, contextKeyService);
    storageService = instantiationService.get(IStorageService);
    viewDescriptorService = disposableStore.add(instantiationService.createInstance(ViewDescriptorService));
  });
  teardown(() => {
    ViewsRegistry.deregisterViews(ViewsRegistry.getViews(container), container);
    ViewContainerRegistry.deregisterViewContainer(container);
  });
  test("empty model", function() {
    container = ViewContainerRegistry.registerViewContainer({ id: "test", title: nls.localize2("test", "test"), ctorDescriptor: new SyncDescriptor({}) }, ViewContainerLocation.Sidebar);
    const testObject = viewDescriptorService.getViewContainerModel(container);
    assert.strictEqual(testObject.visibleViewDescriptors.length, 0);
  });
  test("register/unregister", () => {
    container = ViewContainerRegistry.registerViewContainer({ id: "test", title: nls.localize2("test", "test"), ctorDescriptor: new SyncDescriptor({}) }, ViewContainerLocation.Sidebar);
    const testObject = viewDescriptorService.getViewContainerModel(container);
    const target = disposableStore.add(new ViewDescriptorSequence(testObject));
    assert.strictEqual(testObject.visibleViewDescriptors.length, 0);
    assert.strictEqual(target.elements.length, 0);
    const viewDescriptor = {
      id: "view1",
      ctorDescriptor: null,
      name: nls.localize2("Test View 1", "Test View 1")
    };
    ViewsRegistry.registerViews([viewDescriptor], container);
    assert.strictEqual(testObject.visibleViewDescriptors.length, 1);
    assert.strictEqual(target.elements.length, 1);
    assert.deepStrictEqual(testObject.visibleViewDescriptors[0], viewDescriptor);
    assert.deepStrictEqual(target.elements[0], viewDescriptor);
    ViewsRegistry.deregisterViews([viewDescriptor], container);
    assert.strictEqual(testObject.visibleViewDescriptors.length, 0);
    assert.strictEqual(target.elements.length, 0);
  });
  test("when contexts", () => runWithFakedTimers({ useFakeTimers: true }, async () => {
    container = ViewContainerRegistry.registerViewContainer({ id: "test", title: nls.localize2("test", "test"), ctorDescriptor: new SyncDescriptor({}) }, ViewContainerLocation.Sidebar);
    const testObject = viewDescriptorService.getViewContainerModel(container);
    const target = disposableStore.add(new ViewDescriptorSequence(testObject));
    assert.strictEqual(testObject.visibleViewDescriptors.length, 0);
    assert.strictEqual(target.elements.length, 0);
    const viewDescriptor = {
      id: "view1",
      ctorDescriptor: null,
      name: nls.localize2("Test View 1", "Test View 1"),
      when: ContextKeyExpr.equals("showview1", true)
    };
    ViewsRegistry.registerViews([viewDescriptor], container);
    assert.strictEqual(testObject.visibleViewDescriptors.length, 0, "view should not appear since context isnt in");
    assert.strictEqual(target.elements.length, 0);
    const key = contextKeyService.createKey("showview1", false);
    assert.strictEqual(testObject.visibleViewDescriptors.length, 0, "view should still not appear since showview1 isnt true");
    assert.strictEqual(target.elements.length, 0);
    key.set(true);
    await new Promise((c) => setTimeout(c, 30));
    assert.strictEqual(testObject.visibleViewDescriptors.length, 1, "view should appear");
    assert.strictEqual(target.elements.length, 1);
    assert.deepStrictEqual(testObject.visibleViewDescriptors[0], viewDescriptor);
    assert.strictEqual(target.elements[0], viewDescriptor);
    key.set(false);
    await new Promise((c) => setTimeout(c, 30));
    assert.strictEqual(testObject.visibleViewDescriptors.length, 0, "view should disappear");
    assert.strictEqual(target.elements.length, 0);
    ViewsRegistry.deregisterViews([viewDescriptor], container);
    assert.strictEqual(testObject.visibleViewDescriptors.length, 0, "view should not be there anymore");
    assert.strictEqual(target.elements.length, 0);
    key.set(true);
    await new Promise((c) => setTimeout(c, 30));
    assert.strictEqual(testObject.visibleViewDescriptors.length, 0, "view should not be there anymore");
    assert.strictEqual(target.elements.length, 0);
  }));
  test("when contexts - multiple", () => runWithFakedTimers({ useFakeTimers: true }, async () => {
    container = ViewContainerRegistry.registerViewContainer({ id: "test", title: nls.localize2("test", "test"), ctorDescriptor: new SyncDescriptor({}) }, ViewContainerLocation.Sidebar);
    const testObject = viewDescriptorService.getViewContainerModel(container);
    const target = disposableStore.add(new ViewDescriptorSequence(testObject));
    const view1 = { id: "view1", ctorDescriptor: null, name: nls.localize2("Test View 1", "Test View 1") };
    const view2 = { id: "view2", ctorDescriptor: null, name: nls.localize2("Test View 2", "Test View 2"), when: ContextKeyExpr.equals("showview2", true) };
    ViewsRegistry.registerViews([view1, view2], container);
    assert.deepStrictEqual(testObject.visibleViewDescriptors, [view1], "only view1 should be visible");
    assert.deepStrictEqual(target.elements, [view1], "only view1 should be visible");
    const key = contextKeyService.createKey("showview2", false);
    assert.deepStrictEqual(testObject.visibleViewDescriptors, [view1], "still only view1 should be visible");
    assert.deepStrictEqual(target.elements, [view1], "still only view1 should be visible");
    key.set(true);
    await new Promise((c) => setTimeout(c, 30));
    assert.deepStrictEqual(testObject.visibleViewDescriptors, [view1, view2], "both views should be visible");
    assert.deepStrictEqual(target.elements, [view1, view2], "both views should be visible");
    ViewsRegistry.deregisterViews([view1, view2], container);
  }));
  test("when contexts - multiple 2", () => runWithFakedTimers({ useFakeTimers: true }, async () => {
    container = ViewContainerRegistry.registerViewContainer({ id: "test", title: nls.localize2("test", "test"), ctorDescriptor: new SyncDescriptor({}) }, ViewContainerLocation.Sidebar);
    const testObject = viewDescriptorService.getViewContainerModel(container);
    const target = disposableStore.add(new ViewDescriptorSequence(testObject));
    const view1 = { id: "view1", ctorDescriptor: null, name: nls.localize2("Test View 1", "Test View 1"), when: ContextKeyExpr.equals("showview1", true) };
    const view2 = { id: "view2", ctorDescriptor: null, name: nls.localize2("Test View 2", "Test View 2") };
    ViewsRegistry.registerViews([view1, view2], container);
    assert.deepStrictEqual(testObject.visibleViewDescriptors, [view2], "only view2 should be visible");
    assert.deepStrictEqual(target.elements, [view2], "only view2 should be visible");
    const key = contextKeyService.createKey("showview1", false);
    assert.deepStrictEqual(testObject.visibleViewDescriptors, [view2], "still only view2 should be visible");
    assert.deepStrictEqual(target.elements, [view2], "still only view2 should be visible");
    key.set(true);
    await new Promise((c) => setTimeout(c, 30));
    assert.deepStrictEqual(testObject.visibleViewDescriptors, [view1, view2], "both views should be visible");
    assert.deepStrictEqual(target.elements, [view1, view2], "both views should be visible");
    ViewsRegistry.deregisterViews([view1, view2], container);
  }));
  test("setVisible", () => {
    container = ViewContainerRegistry.registerViewContainer({ id: "test", title: nls.localize2("test", "test"), ctorDescriptor: new SyncDescriptor({}) }, ViewContainerLocation.Sidebar);
    const testObject = viewDescriptorService.getViewContainerModel(container);
    const target = disposableStore.add(new ViewDescriptorSequence(testObject));
    const view1 = { id: "view1", ctorDescriptor: null, name: nls.localize2("Test View 1", "Test View 1"), canToggleVisibility: true };
    const view2 = { id: "view2", ctorDescriptor: null, name: nls.localize2("Test View 2", "Test View 2"), canToggleVisibility: true };
    const view3 = { id: "view3", ctorDescriptor: null, name: nls.localize2("Test View 3", "Test View 3"), canToggleVisibility: true };
    ViewsRegistry.registerViews([view1, view2, view3], container);
    assert.deepStrictEqual(testObject.visibleViewDescriptors, [view1, view2, view3]);
    assert.deepStrictEqual(target.elements, [view1, view2, view3]);
    testObject.setVisible("view2", true);
    assert.deepStrictEqual(testObject.visibleViewDescriptors, [view1, view2, view3], "nothing should happen");
    assert.deepStrictEqual(target.elements, [view1, view2, view3]);
    testObject.setVisible("view2", false);
    assert.deepStrictEqual(testObject.visibleViewDescriptors, [view1, view3], "view2 should hide");
    assert.deepStrictEqual(target.elements, [view1, view3]);
    testObject.setVisible("view1", false);
    assert.deepStrictEqual(testObject.visibleViewDescriptors, [view3], "view1 should hide");
    assert.deepStrictEqual(target.elements, [view3]);
    testObject.setVisible("view3", false);
    assert.deepStrictEqual(testObject.visibleViewDescriptors, [], "view3 shoud hide");
    assert.deepStrictEqual(target.elements, []);
    testObject.setVisible("view1", true);
    assert.deepStrictEqual(testObject.visibleViewDescriptors, [view1], "view1 should show");
    assert.deepStrictEqual(target.elements, [view1]);
    testObject.setVisible("view3", true);
    assert.deepStrictEqual(testObject.visibleViewDescriptors, [view1, view3], "view3 should show");
    assert.deepStrictEqual(target.elements, [view1, view3]);
    testObject.setVisible("view2", true);
    assert.deepStrictEqual(testObject.visibleViewDescriptors, [view1, view2, view3], "view2 should show");
    assert.deepStrictEqual(target.elements, [view1, view2, view3]);
    ViewsRegistry.deregisterViews([view1, view2, view3], container);
    assert.deepStrictEqual(testObject.visibleViewDescriptors, []);
    assert.deepStrictEqual(target.elements, []);
  });
  test("move", () => {
    container = ViewContainerRegistry.registerViewContainer({ id: "test", title: nls.localize2("test", "test"), ctorDescriptor: new SyncDescriptor({}) }, ViewContainerLocation.Sidebar);
    const testObject = viewDescriptorService.getViewContainerModel(container);
    const target = disposableStore.add(new ViewDescriptorSequence(testObject));
    const view1 = { id: "view1", ctorDescriptor: null, name: nls.localize2("Test View 1", "Test View 1") };
    const view2 = { id: "view2", ctorDescriptor: null, name: nls.localize2("Test View 2", "Test View 2") };
    const view3 = { id: "view3", ctorDescriptor: null, name: nls.localize2("Test View 3", "Test View 3") };
    ViewsRegistry.registerViews([view1, view2, view3], container);
    assert.deepStrictEqual(testObject.visibleViewDescriptors, [view1, view2, view3], "model views should be OK");
    assert.deepStrictEqual(target.elements, [view1, view2, view3], "sql views should be OK");
    testObject.move("view3", "view1");
    assert.deepStrictEqual(testObject.visibleViewDescriptors, [view3, view1, view2], "view3 should go to the front");
    assert.deepStrictEqual(target.elements, [view3, view1, view2]);
    testObject.move("view1", "view2");
    assert.deepStrictEqual(testObject.visibleViewDescriptors, [view3, view2, view1], "view1 should go to the end");
    assert.deepStrictEqual(target.elements, [view3, view2, view1]);
    testObject.move("view1", "view3");
    assert.deepStrictEqual(testObject.visibleViewDescriptors, [view1, view3, view2], "view1 should go to the front");
    assert.deepStrictEqual(target.elements, [view1, view3, view2]);
    testObject.move("view2", "view3");
    assert.deepStrictEqual(testObject.visibleViewDescriptors, [view1, view2, view3], "view2 should go to the middle");
    assert.deepStrictEqual(target.elements, [view1, view2, view3]);
  });
  test("view states", () => runWithFakedTimers({ useFakeTimers: true }, async () => {
    storageService.store(`${container.id}.state.hidden`, JSON.stringify([{ id: "view1", isHidden: true }]), StorageScope.PROFILE, StorageTarget.MACHINE);
    container = ViewContainerRegistry.registerViewContainer({ id: "test", title: nls.localize2("test", "test"), ctorDescriptor: new SyncDescriptor({}) }, ViewContainerLocation.Sidebar);
    const testObject = viewDescriptorService.getViewContainerModel(container);
    const target = disposableStore.add(new ViewDescriptorSequence(testObject));
    assert.strictEqual(testObject.visibleViewDescriptors.length, 0);
    assert.strictEqual(target.elements.length, 0);
    const viewDescriptor = {
      id: "view1",
      ctorDescriptor: null,
      name: nls.localize2("Test View 1", "Test View 1")
    };
    ViewsRegistry.registerViews([viewDescriptor], container);
    assert.strictEqual(testObject.visibleViewDescriptors.length, 0, "view should not appear since it was set not visible in view state");
    assert.strictEqual(target.elements.length, 0);
  }));
  test("view states and when contexts", () => runWithFakedTimers({ useFakeTimers: true }, async () => {
    storageService.store(`${container.id}.state.hidden`, JSON.stringify([{ id: "view1", isHidden: true }]), StorageScope.PROFILE, StorageTarget.MACHINE);
    container = ViewContainerRegistry.registerViewContainer({ id: "test", title: nls.localize2("test", "test"), ctorDescriptor: new SyncDescriptor({}) }, ViewContainerLocation.Sidebar);
    const testObject = viewDescriptorService.getViewContainerModel(container);
    const target = disposableStore.add(new ViewDescriptorSequence(testObject));
    assert.strictEqual(testObject.visibleViewDescriptors.length, 0);
    assert.strictEqual(target.elements.length, 0);
    const viewDescriptor = {
      id: "view1",
      ctorDescriptor: null,
      name: nls.localize2("Test View 1", "Test View 1"),
      when: ContextKeyExpr.equals("showview1", true)
    };
    ViewsRegistry.registerViews([viewDescriptor], container);
    assert.strictEqual(testObject.visibleViewDescriptors.length, 0, "view should not appear since context isnt in");
    assert.strictEqual(target.elements.length, 0);
    const key = contextKeyService.createKey("showview1", false);
    assert.strictEqual(testObject.visibleViewDescriptors.length, 0, "view should still not appear since showview1 isnt true");
    assert.strictEqual(target.elements.length, 0);
    key.set(true);
    await new Promise((c) => setTimeout(c, 30));
    assert.strictEqual(testObject.visibleViewDescriptors.length, 0, "view should still not appear since it was set not visible in view state");
    assert.strictEqual(target.elements.length, 0);
  }));
  test("view states and when contexts multiple views", () => runWithFakedTimers({ useFakeTimers: true }, async () => {
    storageService.store(`${container.id}.state.hidden`, JSON.stringify([{ id: "view1", isHidden: true }]), StorageScope.PROFILE, StorageTarget.MACHINE);
    container = ViewContainerRegistry.registerViewContainer({ id: "test", title: nls.localize2("test", "test"), ctorDescriptor: new SyncDescriptor({}) }, ViewContainerLocation.Sidebar);
    const testObject = viewDescriptorService.getViewContainerModel(container);
    const target = disposableStore.add(new ViewDescriptorSequence(testObject));
    assert.strictEqual(testObject.visibleViewDescriptors.length, 0);
    assert.strictEqual(target.elements.length, 0);
    const view1 = {
      id: "view1",
      ctorDescriptor: null,
      name: nls.localize2("Test View 1", "Test View 1"),
      when: ContextKeyExpr.equals("showview", true)
    };
    const view2 = {
      id: "view2",
      ctorDescriptor: null,
      name: nls.localize2("Test View 2", "Test View 2")
    };
    const view3 = {
      id: "view3",
      ctorDescriptor: null,
      name: nls.localize2("Test View 3", "Test View 3"),
      when: ContextKeyExpr.equals("showview", true)
    };
    ViewsRegistry.registerViews([view1, view2, view3], container);
    assert.deepStrictEqual(testObject.visibleViewDescriptors, [view2], "Only view2 should be visible");
    assert.deepStrictEqual(target.elements, [view2]);
    const key = contextKeyService.createKey("showview", false);
    assert.deepStrictEqual(testObject.visibleViewDescriptors, [view2], "Only view2 should be visible");
    assert.deepStrictEqual(target.elements, [view2]);
    key.set(true);
    await new Promise((c) => setTimeout(c, 30));
    assert.deepStrictEqual(testObject.visibleViewDescriptors, [view2, view3], "view3 should be visible");
    assert.deepStrictEqual(target.elements, [view2, view3]);
    key.set(false);
    await new Promise((c) => setTimeout(c, 30));
    assert.deepStrictEqual(testObject.visibleViewDescriptors, [view2], "Only view2 should be visible");
    assert.deepStrictEqual(target.elements, [view2]);
  }));
  test("remove event is not triggered if view was hidden and removed", () => runWithFakedTimers({ useFakeTimers: true }, async () => {
    container = ViewContainerRegistry.registerViewContainer({ id: "test", title: nls.localize2("test", "test"), ctorDescriptor: new SyncDescriptor({}) }, ViewContainerLocation.Sidebar);
    const testObject = viewDescriptorService.getViewContainerModel(container);
    const target = disposableStore.add(new ViewDescriptorSequence(testObject));
    const viewDescriptor = {
      id: "view1",
      ctorDescriptor: null,
      name: nls.localize2("Test View 1", "Test View 1"),
      when: ContextKeyExpr.equals("showview1", true),
      canToggleVisibility: true
    };
    ViewsRegistry.registerViews([viewDescriptor], container);
    const key = contextKeyService.createKey("showview1", true);
    await new Promise((c) => setTimeout(c, 30));
    assert.strictEqual(testObject.visibleViewDescriptors.length, 1, "view should appear after context is set");
    assert.strictEqual(target.elements.length, 1);
    testObject.setVisible("view1", false);
    assert.strictEqual(testObject.visibleViewDescriptors.length, 0, "view should disappear after setting visibility to false");
    assert.strictEqual(target.elements.length, 0);
    const targetEvent = sinon.spy();
    disposableStore.add(testObject.onDidRemoveVisibleViewDescriptors(targetEvent));
    key.set(false);
    await new Promise((c) => setTimeout(c, 30));
    assert.ok(!targetEvent.called, "remove event should not be called since it is already hidden");
  }));
  test("add event is not triggered if view was set visible (when visible) and not active", () => runWithFakedTimers({ useFakeTimers: true }, async () => {
    container = ViewContainerRegistry.registerViewContainer({ id: "test", title: nls.localize2("test", "test"), ctorDescriptor: new SyncDescriptor({}) }, ViewContainerLocation.Sidebar);
    const testObject = viewDescriptorService.getViewContainerModel(container);
    const target = disposableStore.add(new ViewDescriptorSequence(testObject));
    const viewDescriptor = {
      id: "view1",
      ctorDescriptor: null,
      name: nls.localize2("Test View 1", "Test View 1"),
      when: ContextKeyExpr.equals("showview1", true),
      canToggleVisibility: true
    };
    const key = contextKeyService.createKey("showview1", true);
    key.set(false);
    ViewsRegistry.registerViews([viewDescriptor], container);
    assert.strictEqual(testObject.visibleViewDescriptors.length, 0);
    assert.strictEqual(target.elements.length, 0);
    const targetEvent = sinon.spy();
    disposableStore.add(testObject.onDidAddVisibleViewDescriptors(targetEvent));
    testObject.setVisible("view1", true);
    assert.ok(!targetEvent.called, "add event should not be called since it is already visible");
    assert.strictEqual(testObject.visibleViewDescriptors.length, 0);
    assert.strictEqual(target.elements.length, 0);
  }));
  test("remove event is not triggered if view was hidden and not active", () => runWithFakedTimers({ useFakeTimers: true }, async () => {
    container = ViewContainerRegistry.registerViewContainer({ id: "test", title: nls.localize2("test", "test"), ctorDescriptor: new SyncDescriptor({}) }, ViewContainerLocation.Sidebar);
    const testObject = viewDescriptorService.getViewContainerModel(container);
    const target = disposableStore.add(new ViewDescriptorSequence(testObject));
    const viewDescriptor = {
      id: "view1",
      ctorDescriptor: null,
      name: nls.localize2("Test View 1", "Test View 1"),
      when: ContextKeyExpr.equals("showview1", true),
      canToggleVisibility: true
    };
    const key = contextKeyService.createKey("showview1", true);
    key.set(false);
    ViewsRegistry.registerViews([viewDescriptor], container);
    assert.strictEqual(testObject.visibleViewDescriptors.length, 0);
    assert.strictEqual(target.elements.length, 0);
    const targetEvent = sinon.spy();
    disposableStore.add(testObject.onDidAddVisibleViewDescriptors(targetEvent));
    testObject.setVisible("view1", false);
    assert.ok(!targetEvent.called, "add event should not be called since it is disabled");
    assert.strictEqual(testObject.visibleViewDescriptors.length, 0);
    assert.strictEqual(target.elements.length, 0);
  }));
  test("add event is not triggered if view was set visible (when not visible) and not active", () => runWithFakedTimers({ useFakeTimers: true }, async () => {
    container = ViewContainerRegistry.registerViewContainer({ id: "test", title: nls.localize2("test", "test"), ctorDescriptor: new SyncDescriptor({}) }, ViewContainerLocation.Sidebar);
    const testObject = viewDescriptorService.getViewContainerModel(container);
    const target = disposableStore.add(new ViewDescriptorSequence(testObject));
    const viewDescriptor = {
      id: "view1",
      ctorDescriptor: null,
      name: nls.localize2("Test View 1", "Test View 1"),
      when: ContextKeyExpr.equals("showview1", true),
      canToggleVisibility: true
    };
    const key = contextKeyService.createKey("showview1", true);
    key.set(false);
    ViewsRegistry.registerViews([viewDescriptor], container);
    assert.strictEqual(testObject.visibleViewDescriptors.length, 0);
    assert.strictEqual(target.elements.length, 0);
    testObject.setVisible("view1", false);
    assert.strictEqual(testObject.visibleViewDescriptors.length, 0);
    assert.strictEqual(target.elements.length, 0);
    const targetEvent = sinon.spy();
    disposableStore.add(testObject.onDidAddVisibleViewDescriptors(targetEvent));
    testObject.setVisible("view1", true);
    assert.ok(!targetEvent.called, "add event should not be called since it is disabled");
    assert.strictEqual(testObject.visibleViewDescriptors.length, 0);
    assert.strictEqual(target.elements.length, 0);
  }));
  test("added view descriptors are in ascending order in the event", () => runWithFakedTimers({ useFakeTimers: true }, async () => {
    container = ViewContainerRegistry.registerViewContainer({ id: "test", title: nls.localize2("test", "test"), ctorDescriptor: new SyncDescriptor({}) }, ViewContainerLocation.Sidebar);
    const testObject = viewDescriptorService.getViewContainerModel(container);
    const target = disposableStore.add(new ViewDescriptorSequence(testObject));
    ViewsRegistry.registerViews([{
      id: "view5",
      ctorDescriptor: null,
      name: nls.localize2("Test View 5", "Test View 5"),
      canToggleVisibility: true,
      order: 5
    }, {
      id: "view2",
      ctorDescriptor: null,
      name: nls.localize2("Test View 2", "Test View 2"),
      canToggleVisibility: true,
      order: 2
    }], container);
    assert.strictEqual(target.elements.length, 2);
    assert.strictEqual(target.elements[0].id, "view2");
    assert.strictEqual(target.elements[1].id, "view5");
    ViewsRegistry.registerViews([{
      id: "view4",
      ctorDescriptor: null,
      name: nls.localize2("Test View 4", "Test View 4"),
      canToggleVisibility: true,
      order: 4
    }, {
      id: "view3",
      ctorDescriptor: null,
      name: nls.localize2("Test View 3", "Test View 3"),
      canToggleVisibility: true,
      order: 3
    }, {
      id: "view1",
      ctorDescriptor: null,
      name: nls.localize2("Test View 1", "Test View 1"),
      canToggleVisibility: true,
      order: 1
    }], container);
    assert.strictEqual(target.elements.length, 5);
    assert.strictEqual(target.elements[0].id, "view1");
    assert.strictEqual(target.elements[1].id, "view2");
    assert.strictEqual(target.elements[2].id, "view3");
    assert.strictEqual(target.elements[3].id, "view4");
    assert.strictEqual(target.elements[4].id, "view5");
  }));
  test("add event is triggered only once when view is set visible while it is set active", () => runWithFakedTimers({ useFakeTimers: true }, async () => {
    container = ViewContainerRegistry.registerViewContainer({ id: "test", title: nls.localize2("test", "test"), ctorDescriptor: new SyncDescriptor({}) }, ViewContainerLocation.Sidebar);
    const testObject = viewDescriptorService.getViewContainerModel(container);
    const target = disposableStore.add(new ViewDescriptorSequence(testObject));
    const viewDescriptor = {
      id: "view1",
      ctorDescriptor: null,
      name: nls.localize2("Test View 1", "Test View 1"),
      when: ContextKeyExpr.equals("showview1", true),
      canToggleVisibility: true
    };
    const key = contextKeyService.createKey("showview1", true);
    key.set(false);
    ViewsRegistry.registerViews([viewDescriptor], container);
    testObject.setVisible("view1", false);
    assert.strictEqual(testObject.visibleViewDescriptors.length, 0);
    assert.strictEqual(target.elements.length, 0);
    const targetEvent = sinon.spy();
    disposableStore.add(testObject.onDidAddVisibleViewDescriptors(targetEvent));
    disposableStore.add(Event.once(testObject.onDidChangeActiveViewDescriptors)(() => testObject.setVisible("view1", true)));
    key.set(true);
    await new Promise((c) => setTimeout(c, 30));
    assert.strictEqual(targetEvent.callCount, 1);
    assert.strictEqual(testObject.visibleViewDescriptors.length, 1);
    assert.strictEqual(target.elements.length, 1);
    assert.strictEqual(target.elements[0].id, "view1");
  }));
  test("add event is not triggered only when view is set hidden while it is set active", () => runWithFakedTimers({ useFakeTimers: true }, async () => {
    container = ViewContainerRegistry.registerViewContainer({ id: "test", title: nls.localize2("test", "test"), ctorDescriptor: new SyncDescriptor({}) }, ViewContainerLocation.Sidebar);
    const testObject = viewDescriptorService.getViewContainerModel(container);
    const target = disposableStore.add(new ViewDescriptorSequence(testObject));
    const viewDescriptor = {
      id: "view1",
      ctorDescriptor: null,
      name: nls.localize2("Test View 1", "Test View 1"),
      when: ContextKeyExpr.equals("showview1", true),
      canToggleVisibility: true
    };
    const key = contextKeyService.createKey("showview1", true);
    key.set(false);
    ViewsRegistry.registerViews([viewDescriptor], container);
    assert.strictEqual(testObject.visibleViewDescriptors.length, 0);
    assert.strictEqual(target.elements.length, 0);
    const targetEvent = sinon.spy();
    disposableStore.add(testObject.onDidAddVisibleViewDescriptors(targetEvent));
    disposableStore.add(Event.once(testObject.onDidChangeActiveViewDescriptors)(() => testObject.setVisible("view1", false)));
    key.set(true);
    await new Promise((c) => setTimeout(c, 30));
    assert.strictEqual(targetEvent.callCount, 0);
    assert.strictEqual(testObject.visibleViewDescriptors.length, 0);
    assert.strictEqual(target.elements.length, 0);
  }));
  test("#142087: view descriptor visibility is not reset", () => runWithFakedTimers({ useFakeTimers: true }, async () => {
    container = ViewContainerRegistry.registerViewContainer({ id: "test", title: nls.localize2("test", "test"), ctorDescriptor: new SyncDescriptor({}) }, ViewContainerLocation.Sidebar);
    const testObject = viewDescriptorService.getViewContainerModel(container);
    const viewDescriptor = {
      id: "view1",
      ctorDescriptor: null,
      name: nls.localize2("Test View 1", "Test View 1"),
      canToggleVisibility: true
    };
    storageService.store(getViewsStateStorageId("test.state"), JSON.stringify([{
      id: viewDescriptor.id,
      isHidden: true,
      order: void 0
    }]), StorageScope.PROFILE, StorageTarget.USER);
    ViewsRegistry.registerViews([viewDescriptor], container);
    assert.strictEqual(testObject.isVisible(viewDescriptor.id), false);
    assert.strictEqual(testObject.activeViewDescriptors[0].id, viewDescriptor.id);
    assert.strictEqual(testObject.visibleViewDescriptors.length, 0);
  }));
  test("remove event is triggered properly if multiple views are hidden at the same time", () => runWithFakedTimers({ useFakeTimers: true }, async () => {
    container = ViewContainerRegistry.registerViewContainer({ id: "test", title: nls.localize2("test", "test"), ctorDescriptor: new SyncDescriptor({}) }, ViewContainerLocation.Sidebar);
    const testObject = viewDescriptorService.getViewContainerModel(container);
    const target = disposableStore.add(new ViewDescriptorSequence(testObject));
    const viewDescriptor1 = {
      id: "view1",
      ctorDescriptor: null,
      name: nls.localize2("Test View 1", "Test View 1"),
      canToggleVisibility: true
    };
    const viewDescriptor2 = {
      id: "view2",
      ctorDescriptor: null,
      name: nls.localize2("Test View 2", "Test View 2"),
      canToggleVisibility: true
    };
    const viewDescriptor3 = {
      id: "view3",
      ctorDescriptor: null,
      name: nls.localize2("Test View 3", "Test View 3"),
      canToggleVisibility: true
    };
    ViewsRegistry.registerViews([viewDescriptor1, viewDescriptor2, viewDescriptor3], container);
    const remomveEvent = sinon.spy();
    disposableStore.add(testObject.onDidRemoveVisibleViewDescriptors(remomveEvent));
    const addEvent = sinon.spy();
    disposableStore.add(testObject.onDidAddVisibleViewDescriptors(addEvent));
    storageService.store(getViewsStateStorageId("test.state"), JSON.stringify([{
      id: viewDescriptor1.id,
      isHidden: false,
      order: void 0
    }, {
      id: viewDescriptor2.id,
      isHidden: true,
      order: void 0
    }, {
      id: viewDescriptor3.id,
      isHidden: true,
      order: void 0
    }]), StorageScope.PROFILE, StorageTarget.USER);
    assert.ok(!addEvent.called, "add event should not be called");
    assert.ok(remomveEvent.calledOnce, "remove event should be called");
    assert.deepStrictEqual(remomveEvent.args[0][0], [{
      viewDescriptor: viewDescriptor3,
      index: 2
    }, {
      viewDescriptor: viewDescriptor2,
      index: 1
    }]);
    assert.strictEqual(target.elements.length, 1);
    assert.strictEqual(target.elements[0].id, viewDescriptor1.id);
  }));
  test("add event is triggered properly if multiple views are hidden at the same time", () => runWithFakedTimers({ useFakeTimers: true }, async () => {
    container = ViewContainerRegistry.registerViewContainer({ id: "test", title: nls.localize2("test", "test"), ctorDescriptor: new SyncDescriptor({}) }, ViewContainerLocation.Sidebar);
    const testObject = viewDescriptorService.getViewContainerModel(container);
    const target = disposableStore.add(new ViewDescriptorSequence(testObject));
    const viewDescriptor1 = {
      id: "view1",
      ctorDescriptor: null,
      name: nls.localize2("Test View 1", "Test View 1"),
      canToggleVisibility: true
    };
    const viewDescriptor2 = {
      id: "view2",
      ctorDescriptor: null,
      name: nls.localize2("Test View 2", "Test View 2"),
      canToggleVisibility: true
    };
    const viewDescriptor3 = {
      id: "view3",
      ctorDescriptor: null,
      name: nls.localize2("Test View 3", "Test View 3"),
      canToggleVisibility: true
    };
    ViewsRegistry.registerViews([viewDescriptor1, viewDescriptor2, viewDescriptor3], container);
    testObject.setVisible(viewDescriptor1.id, false);
    testObject.setVisible(viewDescriptor3.id, false);
    const removeEvent = sinon.spy();
    disposableStore.add(testObject.onDidRemoveVisibleViewDescriptors(removeEvent));
    const addEvent = sinon.spy();
    disposableStore.add(testObject.onDidAddVisibleViewDescriptors(addEvent));
    storageService.store(getViewsStateStorageId("test.state"), JSON.stringify([{
      id: viewDescriptor1.id,
      isHidden: false,
      order: void 0
    }, {
      id: viewDescriptor2.id,
      isHidden: false,
      order: void 0
    }, {
      id: viewDescriptor3.id,
      isHidden: false,
      order: void 0
    }]), StorageScope.PROFILE, StorageTarget.USER);
    assert.ok(!removeEvent.called, "remove event should not be called");
    assert.ok(addEvent.calledOnce, "add event should be called once");
    assert.deepStrictEqual(addEvent.args[0][0], [{
      viewDescriptor: viewDescriptor1,
      index: 0,
      collapsed: false,
      size: void 0
    }, {
      viewDescriptor: viewDescriptor3,
      index: 2,
      collapsed: false,
      size: void 0
    }]);
    assert.strictEqual(target.elements.length, 3);
    assert.strictEqual(target.elements[0].id, viewDescriptor1.id);
    assert.strictEqual(target.elements[1].id, viewDescriptor2.id);
    assert.strictEqual(target.elements[2].id, viewDescriptor3.id);
  }));
  test("add and remove events are triggered properly if multiple views are hidden and added at the same time", () => runWithFakedTimers({ useFakeTimers: true }, async () => {
    container = ViewContainerRegistry.registerViewContainer({ id: "test", title: nls.localize2("test", "test"), ctorDescriptor: new SyncDescriptor({}) }, ViewContainerLocation.Sidebar);
    const testObject = viewDescriptorService.getViewContainerModel(container);
    const target = disposableStore.add(new ViewDescriptorSequence(testObject));
    const viewDescriptor1 = {
      id: "view1",
      ctorDescriptor: null,
      name: nls.localize2("Test View 1", "Test View 1"),
      canToggleVisibility: true
    };
    const viewDescriptor2 = {
      id: "view2",
      ctorDescriptor: null,
      name: nls.localize2("Test View 2", "Test View 2"),
      canToggleVisibility: true
    };
    const viewDescriptor3 = {
      id: "view3",
      ctorDescriptor: null,
      name: nls.localize2("Test View 3", "Test View 3"),
      canToggleVisibility: true
    };
    const viewDescriptor4 = {
      id: "view4",
      ctorDescriptor: null,
      name: nls.localize2("Test View 4", "Test View 4"),
      canToggleVisibility: true
    };
    ViewsRegistry.registerViews([viewDescriptor1, viewDescriptor2, viewDescriptor3, viewDescriptor4], container);
    testObject.setVisible(viewDescriptor1.id, false);
    const removeEvent = sinon.spy();
    disposableStore.add(testObject.onDidRemoveVisibleViewDescriptors(removeEvent));
    const addEvent = sinon.spy();
    disposableStore.add(testObject.onDidAddVisibleViewDescriptors(addEvent));
    storageService.store(getViewsStateStorageId("test.state"), JSON.stringify([{
      id: viewDescriptor1.id,
      isHidden: false,
      order: void 0
    }, {
      id: viewDescriptor2.id,
      isHidden: true,
      order: void 0
    }, {
      id: viewDescriptor3.id,
      isHidden: false,
      order: void 0
    }, {
      id: viewDescriptor4.id,
      isHidden: true,
      order: void 0
    }]), StorageScope.PROFILE, StorageTarget.USER);
    assert.ok(removeEvent.calledOnce, "remove event should be called once");
    assert.deepStrictEqual(removeEvent.args[0][0], [{
      viewDescriptor: viewDescriptor4,
      index: 2
    }, {
      viewDescriptor: viewDescriptor2,
      index: 0
    }]);
    assert.ok(addEvent.calledOnce, "add event should be called once");
    assert.deepStrictEqual(addEvent.args[0][0], [{
      viewDescriptor: viewDescriptor1,
      index: 0,
      collapsed: false,
      size: void 0
    }]);
    assert.strictEqual(target.elements.length, 2);
    assert.strictEqual(target.elements[0].id, viewDescriptor1.id);
    assert.strictEqual(target.elements[1].id, viewDescriptor3.id);
  }));
  test("newly added view descriptor is hidden if it was toggled hidden in storage before adding", () => runWithFakedTimers({ useFakeTimers: true }, async () => {
    container = ViewContainerRegistry.registerViewContainer({ id: "test", title: nls.localize2("test", "test"), ctorDescriptor: new SyncDescriptor({}) }, ViewContainerLocation.Sidebar);
    const viewDescriptor = {
      id: "view1",
      ctorDescriptor: null,
      name: nls.localize2("Test View 1", "Test View 1"),
      canToggleVisibility: true
    };
    storageService.store(getViewsStateStorageId("test.state"), JSON.stringify([{
      id: viewDescriptor.id,
      isHidden: false,
      order: void 0
    }]), StorageScope.PROFILE, StorageTarget.USER);
    const testObject = viewDescriptorService.getViewContainerModel(container);
    storageService.store(getViewsStateStorageId("test.state"), JSON.stringify([{
      id: viewDescriptor.id,
      isHidden: true,
      order: void 0
    }]), StorageScope.PROFILE, StorageTarget.USER);
    ViewsRegistry.registerViews([viewDescriptor], container);
    assert.strictEqual(testObject.isVisible(viewDescriptor.id), false);
    assert.strictEqual(testObject.activeViewDescriptors[0].id, viewDescriptor.id);
    assert.strictEqual(testObject.visibleViewDescriptors.length, 0);
  }));
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXHNlcnZpY2VzXFx2aWV3c1xcdGVzdFxcYnJvd3Nlclxcdmlld0NvbnRhaW5lck1vZGVsLnRlc3QudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgKiBhcyBubHMgZnJvbSAnLi4vLi4vLi4vLi4vLi4vbmxzLmpzJztcbmltcG9ydCBhc3NlcnQgZnJvbSAnYXNzZXJ0JztcbmltcG9ydCAqIGFzIHNpbm9uIGZyb20gJ3Npbm9uJztcbmltcG9ydCB7IElWaWV3c1JlZ2lzdHJ5LCBJVmlld0Rlc2NyaXB0b3IsIElWaWV3Q29udGFpbmVyc1JlZ2lzdHJ5LCBFeHRlbnNpb25zIGFzIFZpZXdDb250YWluZXJFeHRlbnNpb25zLCBWaWV3Q29udGFpbmVyTG9jYXRpb24sIElWaWV3Q29udGFpbmVyTW9kZWwsIElWaWV3RGVzY3JpcHRvclNlcnZpY2UsIFZpZXdDb250YWluZXIgfSBmcm9tICcuLi8uLi8uLi8uLi9jb21tb24vdmlld3MuanMnO1xuaW1wb3J0IHsgSURpc3Bvc2FibGUsIGRpc3Bvc2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgbW92ZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2FycmF5cy5qcyc7XG5pbXBvcnQgeyB3b3JrYmVuY2hJbnN0YW50aWF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3Rlc3QvYnJvd3Nlci93b3JrYmVuY2hUZXN0U2VydmljZXMuanMnO1xuaW1wb3J0IHsgQ29udGV4dEtleUV4cHIsIElDb250ZXh0S2V5U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbnRleHRrZXkvY29tbW9uL2NvbnRleHRrZXkuanMnO1xuaW1wb3J0IHsgVGVzdEluc3RhbnRpYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vaW5zdGFudGlhdGlvbi90ZXN0L2NvbW1vbi9pbnN0YW50aWF0aW9uU2VydmljZU1vY2suanMnO1xuaW1wb3J0IHsgQ29udGV4dEtleVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb250ZXh0a2V5L2Jyb3dzZXIvY29udGV4dEtleVNlcnZpY2UuanMnO1xuaW1wb3J0IHsgVmlld0Rlc2NyaXB0b3JTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vYnJvd3Nlci92aWV3RGVzY3JpcHRvclNlcnZpY2UuanMnO1xuaW1wb3J0IHsgUmVnaXN0cnkgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9yZWdpc3RyeS9jb21tb24vcGxhdGZvcm0uanMnO1xuaW1wb3J0IHsgU3luY0Rlc2NyaXB0b3IgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9pbnN0YW50aWF0aW9uL2NvbW1vbi9kZXNjcmlwdG9ycy5qcyc7XG5pbXBvcnQgeyBJU3RvcmFnZVNlcnZpY2UsIFN0b3JhZ2VTY29wZSwgU3RvcmFnZVRhcmdldCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL3N0b3JhZ2UvY29tbW9uL3N0b3JhZ2UuanMnO1xuaW1wb3J0IHsgRXZlbnQgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9ldmVudC5qcyc7XG5pbXBvcnQgeyBnZXRWaWV3c1N0YXRlU3RvcmFnZUlkIH0gZnJvbSAnLi4vLi4vY29tbW9uL3ZpZXdDb250YWluZXJNb2RlbC5qcyc7XG5pbXBvcnQgeyBydW5XaXRoRmFrZWRUaW1lcnMgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL3Rlc3QvY29tbW9uL3RpbWVUcmF2ZWxTY2hlZHVsZXIuanMnO1xuaW1wb3J0IHsgZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS90ZXN0L2NvbW1vbi91dGlscy5qcyc7XG5cbmNvbnN0IFZpZXdDb250YWluZXJSZWdpc3RyeSA9IFJlZ2lzdHJ5LmFzPElWaWV3Q29udGFpbmVyc1JlZ2lzdHJ5PihWaWV3Q29udGFpbmVyRXh0ZW5zaW9ucy5WaWV3Q29udGFpbmVyc1JlZ2lzdHJ5KTtcbmNvbnN0IFZpZXdzUmVnaXN0cnkgPSBSZWdpc3RyeS5hczxJVmlld3NSZWdpc3RyeT4oVmlld0NvbnRhaW5lckV4dGVuc2lvbnMuVmlld3NSZWdpc3RyeSk7XG5cbmNsYXNzIFZpZXdEZXNjcmlwdG9yU2VxdWVuY2Uge1xuXG5cdHJlYWRvbmx5IGVsZW1lbnRzOiBJVmlld0Rlc2NyaXB0b3JbXTtcblx0cHJpdmF0ZSBkaXNwb3NhYmxlczogSURpc3Bvc2FibGVbXSA9IFtdO1xuXG5cdGNvbnN0cnVjdG9yKG1vZGVsOiBJVmlld0NvbnRhaW5lck1vZGVsKSB7XG5cdFx0dGhpcy5lbGVtZW50cyA9IFsuLi5tb2RlbC52aXNpYmxlVmlld0Rlc2NyaXB0b3JzXTtcblx0XHRtb2RlbC5vbkRpZEFkZFZpc2libGVWaWV3RGVzY3JpcHRvcnMoYWRkZWQgPT4gYWRkZWQuZm9yRWFjaCgoeyB2aWV3RGVzY3JpcHRvciwgaW5kZXggfSkgPT4gdGhpcy5lbGVtZW50cy5zcGxpY2UoaW5kZXgsIDAsIHZpZXdEZXNjcmlwdG9yKSksIG51bGwsIHRoaXMuZGlzcG9zYWJsZXMpO1xuXHRcdG1vZGVsLm9uRGlkUmVtb3ZlVmlzaWJsZVZpZXdEZXNjcmlwdG9ycyhyZW1vdmVkID0+IHJlbW92ZWQuc29ydCgoYSwgYikgPT4gYi5pbmRleCAtIGEuaW5kZXgpLmZvckVhY2goKHsgaW5kZXggfSkgPT4gdGhpcy5lbGVtZW50cy5zcGxpY2UoaW5kZXgsIDEpKSwgbnVsbCwgdGhpcy5kaXNwb3NhYmxlcyk7XG5cdFx0bW9kZWwub25EaWRNb3ZlVmlzaWJsZVZpZXdEZXNjcmlwdG9ycygoeyBmcm9tLCB0byB9KSA9PiBtb3ZlKHRoaXMuZWxlbWVudHMsIGZyb20uaW5kZXgsIHRvLmluZGV4KSwgbnVsbCwgdGhpcy5kaXNwb3NhYmxlcyk7XG5cdH1cblxuXHRkaXNwb3NlKCkge1xuXHRcdHRoaXMuZGlzcG9zYWJsZXMgPSBkaXNwb3NlKHRoaXMuZGlzcG9zYWJsZXMpO1xuXHR9XG59XG5cbnN1aXRlKCdWaWV3Q29udGFpbmVyTW9kZWwnLCAoKSA9PiB7XG5cblx0bGV0IGNvbnRhaW5lcjogVmlld0NvbnRhaW5lcjtcblx0Y29uc3QgZGlzcG9zYWJsZVN0b3JlID0gZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlKCk7XG5cdGxldCBjb250ZXh0S2V5U2VydmljZTogSUNvbnRleHRLZXlTZXJ2aWNlO1xuXHRsZXQgdmlld0Rlc2NyaXB0b3JTZXJ2aWNlOiBJVmlld0Rlc2NyaXB0b3JTZXJ2aWNlO1xuXHRsZXQgc3RvcmFnZVNlcnZpY2U6IElTdG9yYWdlU2VydmljZTtcblxuXHRzZXR1cCgoKSA9PiB7XG5cdFx0Y29uc3QgaW5zdGFudGlhdGlvblNlcnZpY2U6IFRlc3RJbnN0YW50aWF0aW9uU2VydmljZSA9IHdvcmtiZW5jaEluc3RhbnRpYXRpb25TZXJ2aWNlKHVuZGVmaW5lZCwgZGlzcG9zYWJsZVN0b3JlKTtcblx0XHRjb250ZXh0S2V5U2VydmljZSA9IGRpc3Bvc2FibGVTdG9yZS5hZGQoaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoQ29udGV4dEtleVNlcnZpY2UpKTtcblx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElDb250ZXh0S2V5U2VydmljZSwgY29udGV4dEtleVNlcnZpY2UpO1xuXHRcdHN0b3JhZ2VTZXJ2aWNlID0gaW5zdGFudGlhdGlvblNlcnZpY2UuZ2V0KElTdG9yYWdlU2VydmljZSk7XG5cdFx0dmlld0Rlc2NyaXB0b3JTZXJ2aWNlID0gZGlzcG9zYWJsZVN0b3JlLmFkZChpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShWaWV3RGVzY3JpcHRvclNlcnZpY2UpKTtcblx0fSk7XG5cblx0dGVhcmRvd24oKCkgPT4ge1xuXHRcdFZpZXdzUmVnaXN0cnkuZGVyZWdpc3RlclZpZXdzKFZpZXdzUmVnaXN0cnkuZ2V0Vmlld3MoY29udGFpbmVyKSwgY29udGFpbmVyKTtcblx0XHRWaWV3Q29udGFpbmVyUmVnaXN0cnkuZGVyZWdpc3RlclZpZXdDb250YWluZXIoY29udGFpbmVyKTtcblx0fSk7XG5cblx0dGVzdCgnZW1wdHkgbW9kZWwnLCBmdW5jdGlvbiAoKSB7XG5cdFx0Ly8gZXNsaW50LWRpc2FibGUtbmV4dC1saW5lIGxvY2FsL2NvZGUtbm8tYW55LWNhc3RzXG5cdFx0Y29udGFpbmVyID0gVmlld0NvbnRhaW5lclJlZ2lzdHJ5LnJlZ2lzdGVyVmlld0NvbnRhaW5lcih7IGlkOiAndGVzdCcsIHRpdGxlOiBubHMubG9jYWxpemUyKCd0ZXN0JywgJ3Rlc3QnKSwgY3RvckRlc2NyaXB0b3I6IG5ldyBTeW5jRGVzY3JpcHRvcig8YW55Pnt9KSB9LCBWaWV3Q29udGFpbmVyTG9jYXRpb24uU2lkZWJhcik7XG5cdFx0Y29uc3QgdGVzdE9iamVjdCA9IHZpZXdEZXNjcmlwdG9yU2VydmljZS5nZXRWaWV3Q29udGFpbmVyTW9kZWwoY29udGFpbmVyKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodGVzdE9iamVjdC52aXNpYmxlVmlld0Rlc2NyaXB0b3JzLmxlbmd0aCwgMCk7XG5cdH0pO1xuXG5cdHRlc3QoJ3JlZ2lzdGVyL3VucmVnaXN0ZXInLCAoKSA9PiB7XG5cdFx0Ly8gZXNsaW50LWRpc2FibGUtbmV4dC1saW5lIGxvY2FsL2NvZGUtbm8tYW55LWNhc3RzXG5cdFx0Y29udGFpbmVyID0gVmlld0NvbnRhaW5lclJlZ2lzdHJ5LnJlZ2lzdGVyVmlld0NvbnRhaW5lcih7IGlkOiAndGVzdCcsIHRpdGxlOiBubHMubG9jYWxpemUyKCd0ZXN0JywgJ3Rlc3QnKSwgY3RvckRlc2NyaXB0b3I6IG5ldyBTeW5jRGVzY3JpcHRvcig8YW55Pnt9KSB9LCBWaWV3Q29udGFpbmVyTG9jYXRpb24uU2lkZWJhcik7XG5cdFx0Y29uc3QgdGVzdE9iamVjdCA9IHZpZXdEZXNjcmlwdG9yU2VydmljZS5nZXRWaWV3Q29udGFpbmVyTW9kZWwoY29udGFpbmVyKTtcblx0XHRjb25zdCB0YXJnZXQgPSBkaXNwb3NhYmxlU3RvcmUuYWRkKG5ldyBWaWV3RGVzY3JpcHRvclNlcXVlbmNlKHRlc3RPYmplY3QpKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh0ZXN0T2JqZWN0LnZpc2libGVWaWV3RGVzY3JpcHRvcnMubGVuZ3RoLCAwKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodGFyZ2V0LmVsZW1lbnRzLmxlbmd0aCwgMCk7XG5cblx0XHRjb25zdCB2aWV3RGVzY3JpcHRvcjogSVZpZXdEZXNjcmlwdG9yID0ge1xuXHRcdFx0aWQ6ICd2aWV3MScsXG5cdFx0XHRjdG9yRGVzY3JpcHRvcjogbnVsbCEsXG5cdFx0XHRuYW1lOiBubHMubG9jYWxpemUyKCdUZXN0IFZpZXcgMScsICdUZXN0IFZpZXcgMScpXG5cdFx0fTtcblxuXHRcdFZpZXdzUmVnaXN0cnkucmVnaXN0ZXJWaWV3cyhbdmlld0Rlc2NyaXB0b3JdLCBjb250YWluZXIpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHRlc3RPYmplY3QudmlzaWJsZVZpZXdEZXNjcmlwdG9ycy5sZW5ndGgsIDEpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh0YXJnZXQuZWxlbWVudHMubGVuZ3RoLCAxKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHRlc3RPYmplY3QudmlzaWJsZVZpZXdEZXNjcmlwdG9yc1swXSwgdmlld0Rlc2NyaXB0b3IpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwodGFyZ2V0LmVsZW1lbnRzWzBdLCB2aWV3RGVzY3JpcHRvcik7XG5cblx0XHRWaWV3c1JlZ2lzdHJ5LmRlcmVnaXN0ZXJWaWV3cyhbdmlld0Rlc2NyaXB0b3JdLCBjb250YWluZXIpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHRlc3RPYmplY3QudmlzaWJsZVZpZXdEZXNjcmlwdG9ycy5sZW5ndGgsIDApO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh0YXJnZXQuZWxlbWVudHMubGVuZ3RoLCAwKTtcblx0fSk7XG5cblx0dGVzdCgnd2hlbiBjb250ZXh0cycsICgpID0+IHJ1bldpdGhGYWtlZFRpbWVyczx2b2lkPih7IHVzZUZha2VUaW1lcnM6IHRydWUgfSwgYXN5bmMgKCkgPT4ge1xuXHRcdC8vIGVzbGludC1kaXNhYmxlLW5leHQtbGluZSBsb2NhbC9jb2RlLW5vLWFueS1jYXN0c1xuXHRcdGNvbnRhaW5lciA9IFZpZXdDb250YWluZXJSZWdpc3RyeS5yZWdpc3RlclZpZXdDb250YWluZXIoeyBpZDogJ3Rlc3QnLCB0aXRsZTogbmxzLmxvY2FsaXplMigndGVzdCcsICd0ZXN0JyksIGN0b3JEZXNjcmlwdG9yOiBuZXcgU3luY0Rlc2NyaXB0b3IoPGFueT57fSkgfSwgVmlld0NvbnRhaW5lckxvY2F0aW9uLlNpZGViYXIpO1xuXHRcdGNvbnN0IHRlc3RPYmplY3QgPSB2aWV3RGVzY3JpcHRvclNlcnZpY2UuZ2V0Vmlld0NvbnRhaW5lck1vZGVsKGNvbnRhaW5lcik7XG5cdFx0Y29uc3QgdGFyZ2V0ID0gZGlzcG9zYWJsZVN0b3JlLmFkZChuZXcgVmlld0Rlc2NyaXB0b3JTZXF1ZW5jZSh0ZXN0T2JqZWN0KSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHRlc3RPYmplY3QudmlzaWJsZVZpZXdEZXNjcmlwdG9ycy5sZW5ndGgsIDApO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh0YXJnZXQuZWxlbWVudHMubGVuZ3RoLCAwKTtcblxuXHRcdGNvbnN0IHZpZXdEZXNjcmlwdG9yOiBJVmlld0Rlc2NyaXB0b3IgPSB7XG5cdFx0XHRpZDogJ3ZpZXcxJyxcblx0XHRcdGN0b3JEZXNjcmlwdG9yOiBudWxsISxcblx0XHRcdG5hbWU6IG5scy5sb2NhbGl6ZTIoJ1Rlc3QgVmlldyAxJywgJ1Rlc3QgVmlldyAxJyksXG5cdFx0XHR3aGVuOiBDb250ZXh0S2V5RXhwci5lcXVhbHMoJ3Nob3d2aWV3MScsIHRydWUpXG5cdFx0fTtcblxuXHRcdFZpZXdzUmVnaXN0cnkucmVnaXN0ZXJWaWV3cyhbdmlld0Rlc2NyaXB0b3JdLCBjb250YWluZXIpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh0ZXN0T2JqZWN0LnZpc2libGVWaWV3RGVzY3JpcHRvcnMubGVuZ3RoLCAwLCAndmlldyBzaG91bGQgbm90IGFwcGVhciBzaW5jZSBjb250ZXh0IGlzbnQgaW4nKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodGFyZ2V0LmVsZW1lbnRzLmxlbmd0aCwgMCk7XG5cblx0XHRjb25zdCBrZXkgPSBjb250ZXh0S2V5U2VydmljZS5jcmVhdGVLZXk8Ym9vbGVhbj4oJ3Nob3d2aWV3MScsIGZhbHNlKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodGVzdE9iamVjdC52aXNpYmxlVmlld0Rlc2NyaXB0b3JzLmxlbmd0aCwgMCwgJ3ZpZXcgc2hvdWxkIHN0aWxsIG5vdCBhcHBlYXIgc2luY2Ugc2hvd3ZpZXcxIGlzbnQgdHJ1ZScpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh0YXJnZXQuZWxlbWVudHMubGVuZ3RoLCAwKTtcblxuXHRcdGtleS5zZXQodHJ1ZSk7XG5cdFx0YXdhaXQgbmV3IFByb21pc2UoYyA9PiBzZXRUaW1lb3V0KGMsIDMwKSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHRlc3RPYmplY3QudmlzaWJsZVZpZXdEZXNjcmlwdG9ycy5sZW5ndGgsIDEsICd2aWV3IHNob3VsZCBhcHBlYXInKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodGFyZ2V0LmVsZW1lbnRzLmxlbmd0aCwgMSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh0ZXN0T2JqZWN0LnZpc2libGVWaWV3RGVzY3JpcHRvcnNbMF0sIHZpZXdEZXNjcmlwdG9yKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodGFyZ2V0LmVsZW1lbnRzWzBdLCB2aWV3RGVzY3JpcHRvcik7XG5cblx0XHRrZXkuc2V0KGZhbHNlKTtcblx0XHRhd2FpdCBuZXcgUHJvbWlzZShjID0+IHNldFRpbWVvdXQoYywgMzApKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodGVzdE9iamVjdC52aXNpYmxlVmlld0Rlc2NyaXB0b3JzLmxlbmd0aCwgMCwgJ3ZpZXcgc2hvdWxkIGRpc2FwcGVhcicpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh0YXJnZXQuZWxlbWVudHMubGVuZ3RoLCAwKTtcblxuXHRcdFZpZXdzUmVnaXN0cnkuZGVyZWdpc3RlclZpZXdzKFt2aWV3RGVzY3JpcHRvcl0sIGNvbnRhaW5lcik7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHRlc3RPYmplY3QudmlzaWJsZVZpZXdEZXNjcmlwdG9ycy5sZW5ndGgsIDAsICd2aWV3IHNob3VsZCBub3QgYmUgdGhlcmUgYW55bW9yZScpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh0YXJnZXQuZWxlbWVudHMubGVuZ3RoLCAwKTtcblxuXHRcdGtleS5zZXQodHJ1ZSk7XG5cdFx0YXdhaXQgbmV3IFByb21pc2UoYyA9PiBzZXRUaW1lb3V0KGMsIDMwKSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHRlc3RPYmplY3QudmlzaWJsZVZpZXdEZXNjcmlwdG9ycy5sZW5ndGgsIDAsICd2aWV3IHNob3VsZCBub3QgYmUgdGhlcmUgYW55bW9yZScpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh0YXJnZXQuZWxlbWVudHMubGVuZ3RoLCAwKTtcblx0fSkpO1xuXG5cdHRlc3QoJ3doZW4gY29udGV4dHMgLSBtdWx0aXBsZScsICgpID0+IHJ1bldpdGhGYWtlZFRpbWVyczx2b2lkPih7IHVzZUZha2VUaW1lcnM6IHRydWUgfSwgYXN5bmMgKCkgPT4ge1xuXHRcdC8vIGVzbGludC1kaXNhYmxlLW5leHQtbGluZSBsb2NhbC9jb2RlLW5vLWFueS1jYXN0c1xuXHRcdGNvbnRhaW5lciA9IFZpZXdDb250YWluZXJSZWdpc3RyeS5yZWdpc3RlclZpZXdDb250YWluZXIoeyBpZDogJ3Rlc3QnLCB0aXRsZTogbmxzLmxvY2FsaXplMigndGVzdCcsICd0ZXN0JyksIGN0b3JEZXNjcmlwdG9yOiBuZXcgU3luY0Rlc2NyaXB0b3IoPGFueT57fSkgfSwgVmlld0NvbnRhaW5lckxvY2F0aW9uLlNpZGViYXIpO1xuXHRcdGNvbnN0IHRlc3RPYmplY3QgPSB2aWV3RGVzY3JpcHRvclNlcnZpY2UuZ2V0Vmlld0NvbnRhaW5lck1vZGVsKGNvbnRhaW5lcik7XG5cdFx0Y29uc3QgdGFyZ2V0ID0gZGlzcG9zYWJsZVN0b3JlLmFkZChuZXcgVmlld0Rlc2NyaXB0b3JTZXF1ZW5jZSh0ZXN0T2JqZWN0KSk7XG5cdFx0Y29uc3QgdmlldzE6IElWaWV3RGVzY3JpcHRvciA9IHsgaWQ6ICd2aWV3MScsIGN0b3JEZXNjcmlwdG9yOiBudWxsISwgbmFtZTogbmxzLmxvY2FsaXplMignVGVzdCBWaWV3IDEnLCAnVGVzdCBWaWV3IDEnKSB9O1xuXHRcdGNvbnN0IHZpZXcyOiBJVmlld0Rlc2NyaXB0b3IgPSB7IGlkOiAndmlldzInLCBjdG9yRGVzY3JpcHRvcjogbnVsbCEsIG5hbWU6IG5scy5sb2NhbGl6ZTIoJ1Rlc3QgVmlldyAyJywgJ1Rlc3QgVmlldyAyJyksIHdoZW46IENvbnRleHRLZXlFeHByLmVxdWFscygnc2hvd3ZpZXcyJywgdHJ1ZSkgfTtcblxuXHRcdFZpZXdzUmVnaXN0cnkucmVnaXN0ZXJWaWV3cyhbdmlldzEsIHZpZXcyXSwgY29udGFpbmVyKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHRlc3RPYmplY3QudmlzaWJsZVZpZXdEZXNjcmlwdG9ycywgW3ZpZXcxXSwgJ29ubHkgdmlldzEgc2hvdWxkIGJlIHZpc2libGUnKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHRhcmdldC5lbGVtZW50cywgW3ZpZXcxXSwgJ29ubHkgdmlldzEgc2hvdWxkIGJlIHZpc2libGUnKTtcblxuXHRcdGNvbnN0IGtleSA9IGNvbnRleHRLZXlTZXJ2aWNlLmNyZWF0ZUtleTxib29sZWFuPignc2hvd3ZpZXcyJywgZmFsc2UpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwodGVzdE9iamVjdC52aXNpYmxlVmlld0Rlc2NyaXB0b3JzLCBbdmlldzFdLCAnc3RpbGwgb25seSB2aWV3MSBzaG91bGQgYmUgdmlzaWJsZScpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwodGFyZ2V0LmVsZW1lbnRzLCBbdmlldzFdLCAnc3RpbGwgb25seSB2aWV3MSBzaG91bGQgYmUgdmlzaWJsZScpO1xuXG5cdFx0a2V5LnNldCh0cnVlKTtcblx0XHRhd2FpdCBuZXcgUHJvbWlzZShjID0+IHNldFRpbWVvdXQoYywgMzApKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHRlc3RPYmplY3QudmlzaWJsZVZpZXdEZXNjcmlwdG9ycywgW3ZpZXcxLCB2aWV3Ml0sICdib3RoIHZpZXdzIHNob3VsZCBiZSB2aXNpYmxlJyk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh0YXJnZXQuZWxlbWVudHMsIFt2aWV3MSwgdmlldzJdLCAnYm90aCB2aWV3cyBzaG91bGQgYmUgdmlzaWJsZScpO1xuXG5cdFx0Vmlld3NSZWdpc3RyeS5kZXJlZ2lzdGVyVmlld3MoW3ZpZXcxLCB2aWV3Ml0sIGNvbnRhaW5lcik7XG5cdH0pKTtcblxuXHR0ZXN0KCd3aGVuIGNvbnRleHRzIC0gbXVsdGlwbGUgMicsICgpID0+IHJ1bldpdGhGYWtlZFRpbWVyczx2b2lkPih7IHVzZUZha2VUaW1lcnM6IHRydWUgfSwgYXN5bmMgKCkgPT4ge1xuXHRcdC8vIGVzbGludC1kaXNhYmxlLW5leHQtbGluZSBsb2NhbC9jb2RlLW5vLWFueS1jYXN0c1xuXHRcdGNvbnRhaW5lciA9IFZpZXdDb250YWluZXJSZWdpc3RyeS5yZWdpc3RlclZpZXdDb250YWluZXIoeyBpZDogJ3Rlc3QnLCB0aXRsZTogbmxzLmxvY2FsaXplMigndGVzdCcsICd0ZXN0JyksIGN0b3JEZXNjcmlwdG9yOiBuZXcgU3luY0Rlc2NyaXB0b3IoPGFueT57fSkgfSwgVmlld0NvbnRhaW5lckxvY2F0aW9uLlNpZGViYXIpO1xuXHRcdGNvbnN0IHRlc3RPYmplY3QgPSB2aWV3RGVzY3JpcHRvclNlcnZpY2UuZ2V0Vmlld0NvbnRhaW5lck1vZGVsKGNvbnRhaW5lcik7XG5cdFx0Y29uc3QgdGFyZ2V0ID0gZGlzcG9zYWJsZVN0b3JlLmFkZChuZXcgVmlld0Rlc2NyaXB0b3JTZXF1ZW5jZSh0ZXN0T2JqZWN0KSk7XG5cdFx0Y29uc3QgdmlldzE6IElWaWV3RGVzY3JpcHRvciA9IHsgaWQ6ICd2aWV3MScsIGN0b3JEZXNjcmlwdG9yOiBudWxsISwgbmFtZTogbmxzLmxvY2FsaXplMignVGVzdCBWaWV3IDEnLCAnVGVzdCBWaWV3IDEnKSwgd2hlbjogQ29udGV4dEtleUV4cHIuZXF1YWxzKCdzaG93dmlldzEnLCB0cnVlKSB9O1xuXHRcdGNvbnN0IHZpZXcyOiBJVmlld0Rlc2NyaXB0b3IgPSB7IGlkOiAndmlldzInLCBjdG9yRGVzY3JpcHRvcjogbnVsbCEsIG5hbWU6IG5scy5sb2NhbGl6ZTIoJ1Rlc3QgVmlldyAyJywgJ1Rlc3QgVmlldyAyJykgfTtcblxuXHRcdFZpZXdzUmVnaXN0cnkucmVnaXN0ZXJWaWV3cyhbdmlldzEsIHZpZXcyXSwgY29udGFpbmVyKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHRlc3RPYmplY3QudmlzaWJsZVZpZXdEZXNjcmlwdG9ycywgW3ZpZXcyXSwgJ29ubHkgdmlldzIgc2hvdWxkIGJlIHZpc2libGUnKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHRhcmdldC5lbGVtZW50cywgW3ZpZXcyXSwgJ29ubHkgdmlldzIgc2hvdWxkIGJlIHZpc2libGUnKTtcblxuXHRcdGNvbnN0IGtleSA9IGNvbnRleHRLZXlTZXJ2aWNlLmNyZWF0ZUtleTxib29sZWFuPignc2hvd3ZpZXcxJywgZmFsc2UpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwodGVzdE9iamVjdC52aXNpYmxlVmlld0Rlc2NyaXB0b3JzLCBbdmlldzJdLCAnc3RpbGwgb25seSB2aWV3MiBzaG91bGQgYmUgdmlzaWJsZScpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwodGFyZ2V0LmVsZW1lbnRzLCBbdmlldzJdLCAnc3RpbGwgb25seSB2aWV3MiBzaG91bGQgYmUgdmlzaWJsZScpO1xuXG5cdFx0a2V5LnNldCh0cnVlKTtcblx0XHRhd2FpdCBuZXcgUHJvbWlzZShjID0+IHNldFRpbWVvdXQoYywgMzApKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHRlc3RPYmplY3QudmlzaWJsZVZpZXdEZXNjcmlwdG9ycywgW3ZpZXcxLCB2aWV3Ml0sICdib3RoIHZpZXdzIHNob3VsZCBiZSB2aXNpYmxlJyk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh0YXJnZXQuZWxlbWVudHMsIFt2aWV3MSwgdmlldzJdLCAnYm90aCB2aWV3cyBzaG91bGQgYmUgdmlzaWJsZScpO1xuXG5cdFx0Vmlld3NSZWdpc3RyeS5kZXJlZ2lzdGVyVmlld3MoW3ZpZXcxLCB2aWV3Ml0sIGNvbnRhaW5lcik7XG5cdH0pKTtcblxuXHR0ZXN0KCdzZXRWaXNpYmxlJywgKCkgPT4ge1xuXHRcdC8vIGVzbGludC1kaXNhYmxlLW5leHQtbGluZSBsb2NhbC9jb2RlLW5vLWFueS1jYXN0c1xuXHRcdGNvbnRhaW5lciA9IFZpZXdDb250YWluZXJSZWdpc3RyeS5yZWdpc3RlclZpZXdDb250YWluZXIoeyBpZDogJ3Rlc3QnLCB0aXRsZTogbmxzLmxvY2FsaXplMigndGVzdCcsICd0ZXN0JyksIGN0b3JEZXNjcmlwdG9yOiBuZXcgU3luY0Rlc2NyaXB0b3IoPGFueT57fSkgfSwgVmlld0NvbnRhaW5lckxvY2F0aW9uLlNpZGViYXIpO1xuXHRcdGNvbnN0IHRlc3RPYmplY3QgPSB2aWV3RGVzY3JpcHRvclNlcnZpY2UuZ2V0Vmlld0NvbnRhaW5lck1vZGVsKGNvbnRhaW5lcik7XG5cdFx0Y29uc3QgdGFyZ2V0ID0gZGlzcG9zYWJsZVN0b3JlLmFkZChuZXcgVmlld0Rlc2NyaXB0b3JTZXF1ZW5jZSh0ZXN0T2JqZWN0KSk7XG5cdFx0Y29uc3QgdmlldzE6IElWaWV3RGVzY3JpcHRvciA9IHsgaWQ6ICd2aWV3MScsIGN0b3JEZXNjcmlwdG9yOiBudWxsISwgbmFtZTogbmxzLmxvY2FsaXplMignVGVzdCBWaWV3IDEnLCAnVGVzdCBWaWV3IDEnKSwgY2FuVG9nZ2xlVmlzaWJpbGl0eTogdHJ1ZSB9O1xuXHRcdGNvbnN0IHZpZXcyOiBJVmlld0Rlc2NyaXB0b3IgPSB7IGlkOiAndmlldzInLCBjdG9yRGVzY3JpcHRvcjogbnVsbCEsIG5hbWU6IG5scy5sb2NhbGl6ZTIoJ1Rlc3QgVmlldyAyJywgJ1Rlc3QgVmlldyAyJyksIGNhblRvZ2dsZVZpc2liaWxpdHk6IHRydWUgfTtcblx0XHRjb25zdCB2aWV3MzogSVZpZXdEZXNjcmlwdG9yID0geyBpZDogJ3ZpZXczJywgY3RvckRlc2NyaXB0b3I6IG51bGwhLCBuYW1lOiBubHMubG9jYWxpemUyKCdUZXN0IFZpZXcgMycsICdUZXN0IFZpZXcgMycpLCBjYW5Ub2dnbGVWaXNpYmlsaXR5OiB0cnVlIH07XG5cblx0XHRWaWV3c1JlZ2lzdHJ5LnJlZ2lzdGVyVmlld3MoW3ZpZXcxLCB2aWV3MiwgdmlldzNdLCBjb250YWluZXIpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwodGVzdE9iamVjdC52aXNpYmxlVmlld0Rlc2NyaXB0b3JzLCBbdmlldzEsIHZpZXcyLCB2aWV3M10pO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwodGFyZ2V0LmVsZW1lbnRzLCBbdmlldzEsIHZpZXcyLCB2aWV3M10pO1xuXG5cdFx0dGVzdE9iamVjdC5zZXRWaXNpYmxlKCd2aWV3MicsIHRydWUpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwodGVzdE9iamVjdC52aXNpYmxlVmlld0Rlc2NyaXB0b3JzLCBbdmlldzEsIHZpZXcyLCB2aWV3M10sICdub3RoaW5nIHNob3VsZCBoYXBwZW4nKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHRhcmdldC5lbGVtZW50cywgW3ZpZXcxLCB2aWV3MiwgdmlldzNdKTtcblxuXHRcdHRlc3RPYmplY3Quc2V0VmlzaWJsZSgndmlldzInLCBmYWxzZSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh0ZXN0T2JqZWN0LnZpc2libGVWaWV3RGVzY3JpcHRvcnMsIFt2aWV3MSwgdmlldzNdLCAndmlldzIgc2hvdWxkIGhpZGUnKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHRhcmdldC5lbGVtZW50cywgW3ZpZXcxLCB2aWV3M10pO1xuXG5cdFx0dGVzdE9iamVjdC5zZXRWaXNpYmxlKCd2aWV3MScsIGZhbHNlKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHRlc3RPYmplY3QudmlzaWJsZVZpZXdEZXNjcmlwdG9ycywgW3ZpZXczXSwgJ3ZpZXcxIHNob3VsZCBoaWRlJyk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh0YXJnZXQuZWxlbWVudHMsIFt2aWV3M10pO1xuXG5cdFx0dGVzdE9iamVjdC5zZXRWaXNpYmxlKCd2aWV3MycsIGZhbHNlKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHRlc3RPYmplY3QudmlzaWJsZVZpZXdEZXNjcmlwdG9ycywgW10sICd2aWV3MyBzaG91ZCBoaWRlJyk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh0YXJnZXQuZWxlbWVudHMsIFtdKTtcblxuXHRcdHRlc3RPYmplY3Quc2V0VmlzaWJsZSgndmlldzEnLCB0cnVlKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHRlc3RPYmplY3QudmlzaWJsZVZpZXdEZXNjcmlwdG9ycywgW3ZpZXcxXSwgJ3ZpZXcxIHNob3VsZCBzaG93Jyk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh0YXJnZXQuZWxlbWVudHMsIFt2aWV3MV0pO1xuXG5cdFx0dGVzdE9iamVjdC5zZXRWaXNpYmxlKCd2aWV3MycsIHRydWUpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwodGVzdE9iamVjdC52aXNpYmxlVmlld0Rlc2NyaXB0b3JzLCBbdmlldzEsIHZpZXczXSwgJ3ZpZXczIHNob3VsZCBzaG93Jyk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh0YXJnZXQuZWxlbWVudHMsIFt2aWV3MSwgdmlldzNdKTtcblxuXHRcdHRlc3RPYmplY3Quc2V0VmlzaWJsZSgndmlldzInLCB0cnVlKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHRlc3RPYmplY3QudmlzaWJsZVZpZXdEZXNjcmlwdG9ycywgW3ZpZXcxLCB2aWV3MiwgdmlldzNdLCAndmlldzIgc2hvdWxkIHNob3cnKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHRhcmdldC5lbGVtZW50cywgW3ZpZXcxLCB2aWV3MiwgdmlldzNdKTtcblxuXHRcdFZpZXdzUmVnaXN0cnkuZGVyZWdpc3RlclZpZXdzKFt2aWV3MSwgdmlldzIsIHZpZXczXSwgY29udGFpbmVyKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHRlc3RPYmplY3QudmlzaWJsZVZpZXdEZXNjcmlwdG9ycywgW10pO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwodGFyZ2V0LmVsZW1lbnRzLCBbXSk7XG5cdH0pO1xuXG5cdHRlc3QoJ21vdmUnLCAoKSA9PiB7XG5cdFx0Ly8gZXNsaW50LWRpc2FibGUtbmV4dC1saW5lIGxvY2FsL2NvZGUtbm8tYW55LWNhc3RzXG5cdFx0Y29udGFpbmVyID0gVmlld0NvbnRhaW5lclJlZ2lzdHJ5LnJlZ2lzdGVyVmlld0NvbnRhaW5lcih7IGlkOiAndGVzdCcsIHRpdGxlOiBubHMubG9jYWxpemUyKCd0ZXN0JywgJ3Rlc3QnKSwgY3RvckRlc2NyaXB0b3I6IG5ldyBTeW5jRGVzY3JpcHRvcig8YW55Pnt9KSB9LCBWaWV3Q29udGFpbmVyTG9jYXRpb24uU2lkZWJhcik7XG5cdFx0Y29uc3QgdGVzdE9iamVjdCA9IHZpZXdEZXNjcmlwdG9yU2VydmljZS5nZXRWaWV3Q29udGFpbmVyTW9kZWwoY29udGFpbmVyKTtcblx0XHRjb25zdCB0YXJnZXQgPSBkaXNwb3NhYmxlU3RvcmUuYWRkKG5ldyBWaWV3RGVzY3JpcHRvclNlcXVlbmNlKHRlc3RPYmplY3QpKTtcblx0XHRjb25zdCB2aWV3MTogSVZpZXdEZXNjcmlwdG9yID0geyBpZDogJ3ZpZXcxJywgY3RvckRlc2NyaXB0b3I6IG51bGwhLCBuYW1lOiBubHMubG9jYWxpemUyKCdUZXN0IFZpZXcgMScsICdUZXN0IFZpZXcgMScpIH07XG5cdFx0Y29uc3QgdmlldzI6IElWaWV3RGVzY3JpcHRvciA9IHsgaWQ6ICd2aWV3MicsIGN0b3JEZXNjcmlwdG9yOiBudWxsISwgbmFtZTogbmxzLmxvY2FsaXplMignVGVzdCBWaWV3IDInLCAnVGVzdCBWaWV3IDInKSB9O1xuXHRcdGNvbnN0IHZpZXczOiBJVmlld0Rlc2NyaXB0b3IgPSB7IGlkOiAndmlldzMnLCBjdG9yRGVzY3JpcHRvcjogbnVsbCEsIG5hbWU6IG5scy5sb2NhbGl6ZTIoJ1Rlc3QgVmlldyAzJywgJ1Rlc3QgVmlldyAzJykgfTtcblxuXHRcdFZpZXdzUmVnaXN0cnkucmVnaXN0ZXJWaWV3cyhbdmlldzEsIHZpZXcyLCB2aWV3M10sIGNvbnRhaW5lcik7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh0ZXN0T2JqZWN0LnZpc2libGVWaWV3RGVzY3JpcHRvcnMsIFt2aWV3MSwgdmlldzIsIHZpZXczXSwgJ21vZGVsIHZpZXdzIHNob3VsZCBiZSBPSycpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwodGFyZ2V0LmVsZW1lbnRzLCBbdmlldzEsIHZpZXcyLCB2aWV3M10sICdzcWwgdmlld3Mgc2hvdWxkIGJlIE9LJyk7XG5cblx0XHR0ZXN0T2JqZWN0Lm1vdmUoJ3ZpZXczJywgJ3ZpZXcxJyk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh0ZXN0T2JqZWN0LnZpc2libGVWaWV3RGVzY3JpcHRvcnMsIFt2aWV3MywgdmlldzEsIHZpZXcyXSwgJ3ZpZXczIHNob3VsZCBnbyB0byB0aGUgZnJvbnQnKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHRhcmdldC5lbGVtZW50cywgW3ZpZXczLCB2aWV3MSwgdmlldzJdKTtcblxuXHRcdHRlc3RPYmplY3QubW92ZSgndmlldzEnLCAndmlldzInKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHRlc3RPYmplY3QudmlzaWJsZVZpZXdEZXNjcmlwdG9ycywgW3ZpZXczLCB2aWV3MiwgdmlldzFdLCAndmlldzEgc2hvdWxkIGdvIHRvIHRoZSBlbmQnKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHRhcmdldC5lbGVtZW50cywgW3ZpZXczLCB2aWV3MiwgdmlldzFdKTtcblxuXHRcdHRlc3RPYmplY3QubW92ZSgndmlldzEnLCAndmlldzMnKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHRlc3RPYmplY3QudmlzaWJsZVZpZXdEZXNjcmlwdG9ycywgW3ZpZXcxLCB2aWV3MywgdmlldzJdLCAndmlldzEgc2hvdWxkIGdvIHRvIHRoZSBmcm9udCcpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwodGFyZ2V0LmVsZW1lbnRzLCBbdmlldzEsIHZpZXczLCB2aWV3Ml0pO1xuXG5cdFx0dGVzdE9iamVjdC5tb3ZlKCd2aWV3MicsICd2aWV3MycpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwodGVzdE9iamVjdC52aXNpYmxlVmlld0Rlc2NyaXB0b3JzLCBbdmlldzEsIHZpZXcyLCB2aWV3M10sICd2aWV3MiBzaG91bGQgZ28gdG8gdGhlIG1pZGRsZScpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwodGFyZ2V0LmVsZW1lbnRzLCBbdmlldzEsIHZpZXcyLCB2aWV3M10pO1xuXHR9KTtcblxuXHR0ZXN0KCd2aWV3IHN0YXRlcycsICgpID0+IHJ1bldpdGhGYWtlZFRpbWVyczx2b2lkPih7IHVzZUZha2VUaW1lcnM6IHRydWUgfSwgYXN5bmMgKCkgPT4ge1xuXHRcdHN0b3JhZ2VTZXJ2aWNlLnN0b3JlKGAke2NvbnRhaW5lci5pZH0uc3RhdGUuaGlkZGVuYCwgSlNPTi5zdHJpbmdpZnkoW3sgaWQ6ICd2aWV3MScsIGlzSGlkZGVuOiB0cnVlIH1dKSwgU3RvcmFnZVNjb3BlLlBST0ZJTEUsIFN0b3JhZ2VUYXJnZXQuTUFDSElORSk7XG5cdFx0Ly8gZXNsaW50LWRpc2FibGUtbmV4dC1saW5lIGxvY2FsL2NvZGUtbm8tYW55LWNhc3RzXG5cdFx0Y29udGFpbmVyID0gVmlld0NvbnRhaW5lclJlZ2lzdHJ5LnJlZ2lzdGVyVmlld0NvbnRhaW5lcih7IGlkOiAndGVzdCcsIHRpdGxlOiBubHMubG9jYWxpemUyKCd0ZXN0JywgJ3Rlc3QnKSwgY3RvckRlc2NyaXB0b3I6IG5ldyBTeW5jRGVzY3JpcHRvcig8YW55Pnt9KSB9LCBWaWV3Q29udGFpbmVyTG9jYXRpb24uU2lkZWJhcik7XG5cdFx0Y29uc3QgdGVzdE9iamVjdCA9IHZpZXdEZXNjcmlwdG9yU2VydmljZS5nZXRWaWV3Q29udGFpbmVyTW9kZWwoY29udGFpbmVyKTtcblx0XHRjb25zdCB0YXJnZXQgPSBkaXNwb3NhYmxlU3RvcmUuYWRkKG5ldyBWaWV3RGVzY3JpcHRvclNlcXVlbmNlKHRlc3RPYmplY3QpKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh0ZXN0T2JqZWN0LnZpc2libGVWaWV3RGVzY3JpcHRvcnMubGVuZ3RoLCAwKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodGFyZ2V0LmVsZW1lbnRzLmxlbmd0aCwgMCk7XG5cblx0XHRjb25zdCB2aWV3RGVzY3JpcHRvcjogSVZpZXdEZXNjcmlwdG9yID0ge1xuXHRcdFx0aWQ6ICd2aWV3MScsXG5cdFx0XHRjdG9yRGVzY3JpcHRvcjogbnVsbCEsXG5cdFx0XHRuYW1lOiBubHMubG9jYWxpemUyKCdUZXN0IFZpZXcgMScsICdUZXN0IFZpZXcgMScpXG5cdFx0fTtcblxuXHRcdFZpZXdzUmVnaXN0cnkucmVnaXN0ZXJWaWV3cyhbdmlld0Rlc2NyaXB0b3JdLCBjb250YWluZXIpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh0ZXN0T2JqZWN0LnZpc2libGVWaWV3RGVzY3JpcHRvcnMubGVuZ3RoLCAwLCAndmlldyBzaG91bGQgbm90IGFwcGVhciBzaW5jZSBpdCB3YXMgc2V0IG5vdCB2aXNpYmxlIGluIHZpZXcgc3RhdGUnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodGFyZ2V0LmVsZW1lbnRzLmxlbmd0aCwgMCk7XG5cdH0pKTtcblxuXHR0ZXN0KCd2aWV3IHN0YXRlcyBhbmQgd2hlbiBjb250ZXh0cycsICgpID0+IHJ1bldpdGhGYWtlZFRpbWVyczx2b2lkPih7IHVzZUZha2VUaW1lcnM6IHRydWUgfSwgYXN5bmMgKCkgPT4ge1xuXHRcdHN0b3JhZ2VTZXJ2aWNlLnN0b3JlKGAke2NvbnRhaW5lci5pZH0uc3RhdGUuaGlkZGVuYCwgSlNPTi5zdHJpbmdpZnkoW3sgaWQ6ICd2aWV3MScsIGlzSGlkZGVuOiB0cnVlIH1dKSwgU3RvcmFnZVNjb3BlLlBST0ZJTEUsIFN0b3JhZ2VUYXJnZXQuTUFDSElORSk7XG5cdFx0Ly8gZXNsaW50LWRpc2FibGUtbmV4dC1saW5lIGxvY2FsL2NvZGUtbm8tYW55LWNhc3RzXG5cdFx0Y29udGFpbmVyID0gVmlld0NvbnRhaW5lclJlZ2lzdHJ5LnJlZ2lzdGVyVmlld0NvbnRhaW5lcih7IGlkOiAndGVzdCcsIHRpdGxlOiBubHMubG9jYWxpemUyKCd0ZXN0JywgJ3Rlc3QnKSwgY3RvckRlc2NyaXB0b3I6IG5ldyBTeW5jRGVzY3JpcHRvcig8YW55Pnt9KSB9LCBWaWV3Q29udGFpbmVyTG9jYXRpb24uU2lkZWJhcik7XG5cdFx0Y29uc3QgdGVzdE9iamVjdCA9IHZpZXdEZXNjcmlwdG9yU2VydmljZS5nZXRWaWV3Q29udGFpbmVyTW9kZWwoY29udGFpbmVyKTtcblx0XHRjb25zdCB0YXJnZXQgPSBkaXNwb3NhYmxlU3RvcmUuYWRkKG5ldyBWaWV3RGVzY3JpcHRvclNlcXVlbmNlKHRlc3RPYmplY3QpKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh0ZXN0T2JqZWN0LnZpc2libGVWaWV3RGVzY3JpcHRvcnMubGVuZ3RoLCAwKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodGFyZ2V0LmVsZW1lbnRzLmxlbmd0aCwgMCk7XG5cblx0XHRjb25zdCB2aWV3RGVzY3JpcHRvcjogSVZpZXdEZXNjcmlwdG9yID0ge1xuXHRcdFx0aWQ6ICd2aWV3MScsXG5cdFx0XHRjdG9yRGVzY3JpcHRvcjogbnVsbCEsXG5cdFx0XHRuYW1lOiBubHMubG9jYWxpemUyKCdUZXN0IFZpZXcgMScsICdUZXN0IFZpZXcgMScpLFxuXHRcdFx0d2hlbjogQ29udGV4dEtleUV4cHIuZXF1YWxzKCdzaG93dmlldzEnLCB0cnVlKVxuXHRcdH07XG5cblx0XHRWaWV3c1JlZ2lzdHJ5LnJlZ2lzdGVyVmlld3MoW3ZpZXdEZXNjcmlwdG9yXSwgY29udGFpbmVyKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodGVzdE9iamVjdC52aXNpYmxlVmlld0Rlc2NyaXB0b3JzLmxlbmd0aCwgMCwgJ3ZpZXcgc2hvdWxkIG5vdCBhcHBlYXIgc2luY2UgY29udGV4dCBpc250IGluJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHRhcmdldC5lbGVtZW50cy5sZW5ndGgsIDApO1xuXG5cdFx0Y29uc3Qga2V5ID0gY29udGV4dEtleVNlcnZpY2UuY3JlYXRlS2V5PGJvb2xlYW4+KCdzaG93dmlldzEnLCBmYWxzZSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHRlc3RPYmplY3QudmlzaWJsZVZpZXdEZXNjcmlwdG9ycy5sZW5ndGgsIDAsICd2aWV3IHNob3VsZCBzdGlsbCBub3QgYXBwZWFyIHNpbmNlIHNob3d2aWV3MSBpc250IHRydWUnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodGFyZ2V0LmVsZW1lbnRzLmxlbmd0aCwgMCk7XG5cblx0XHRrZXkuc2V0KHRydWUpO1xuXHRcdGF3YWl0IG5ldyBQcm9taXNlKGMgPT4gc2V0VGltZW91dChjLCAzMCkpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh0ZXN0T2JqZWN0LnZpc2libGVWaWV3RGVzY3JpcHRvcnMubGVuZ3RoLCAwLCAndmlldyBzaG91bGQgc3RpbGwgbm90IGFwcGVhciBzaW5jZSBpdCB3YXMgc2V0IG5vdCB2aXNpYmxlIGluIHZpZXcgc3RhdGUnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodGFyZ2V0LmVsZW1lbnRzLmxlbmd0aCwgMCk7XG5cdH0pKTtcblxuXHR0ZXN0KCd2aWV3IHN0YXRlcyBhbmQgd2hlbiBjb250ZXh0cyBtdWx0aXBsZSB2aWV3cycsICgpID0+IHJ1bldpdGhGYWtlZFRpbWVyczx2b2lkPih7IHVzZUZha2VUaW1lcnM6IHRydWUgfSwgYXN5bmMgKCkgPT4ge1xuXHRcdHN0b3JhZ2VTZXJ2aWNlLnN0b3JlKGAke2NvbnRhaW5lci5pZH0uc3RhdGUuaGlkZGVuYCwgSlNPTi5zdHJpbmdpZnkoW3sgaWQ6ICd2aWV3MScsIGlzSGlkZGVuOiB0cnVlIH1dKSwgU3RvcmFnZVNjb3BlLlBST0ZJTEUsIFN0b3JhZ2VUYXJnZXQuTUFDSElORSk7XG5cdFx0Ly8gZXNsaW50LWRpc2FibGUtbmV4dC1saW5lIGxvY2FsL2NvZGUtbm8tYW55LWNhc3RzXG5cdFx0Y29udGFpbmVyID0gVmlld0NvbnRhaW5lclJlZ2lzdHJ5LnJlZ2lzdGVyVmlld0NvbnRhaW5lcih7IGlkOiAndGVzdCcsIHRpdGxlOiBubHMubG9jYWxpemUyKCd0ZXN0JywgJ3Rlc3QnKSwgY3RvckRlc2NyaXB0b3I6IG5ldyBTeW5jRGVzY3JpcHRvcig8YW55Pnt9KSB9LCBWaWV3Q29udGFpbmVyTG9jYXRpb24uU2lkZWJhcik7XG5cdFx0Y29uc3QgdGVzdE9iamVjdCA9IHZpZXdEZXNjcmlwdG9yU2VydmljZS5nZXRWaWV3Q29udGFpbmVyTW9kZWwoY29udGFpbmVyKTtcblx0XHRjb25zdCB0YXJnZXQgPSBkaXNwb3NhYmxlU3RvcmUuYWRkKG5ldyBWaWV3RGVzY3JpcHRvclNlcXVlbmNlKHRlc3RPYmplY3QpKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh0ZXN0T2JqZWN0LnZpc2libGVWaWV3RGVzY3JpcHRvcnMubGVuZ3RoLCAwKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodGFyZ2V0LmVsZW1lbnRzLmxlbmd0aCwgMCk7XG5cblx0XHRjb25zdCB2aWV3MTogSVZpZXdEZXNjcmlwdG9yID0ge1xuXHRcdFx0aWQ6ICd2aWV3MScsXG5cdFx0XHRjdG9yRGVzY3JpcHRvcjogbnVsbCEsXG5cdFx0XHRuYW1lOiBubHMubG9jYWxpemUyKCdUZXN0IFZpZXcgMScsICdUZXN0IFZpZXcgMScpLFxuXHRcdFx0d2hlbjogQ29udGV4dEtleUV4cHIuZXF1YWxzKCdzaG93dmlldycsIHRydWUpXG5cdFx0fTtcblx0XHRjb25zdCB2aWV3MjogSVZpZXdEZXNjcmlwdG9yID0ge1xuXHRcdFx0aWQ6ICd2aWV3MicsXG5cdFx0XHRjdG9yRGVzY3JpcHRvcjogbnVsbCEsXG5cdFx0XHRuYW1lOiBubHMubG9jYWxpemUyKCdUZXN0IFZpZXcgMicsICdUZXN0IFZpZXcgMicpLFxuXHRcdH07XG5cdFx0Y29uc3QgdmlldzM6IElWaWV3RGVzY3JpcHRvciA9IHtcblx0XHRcdGlkOiAndmlldzMnLFxuXHRcdFx0Y3RvckRlc2NyaXB0b3I6IG51bGwhLFxuXHRcdFx0bmFtZTogbmxzLmxvY2FsaXplMignVGVzdCBWaWV3IDMnLCAnVGVzdCBWaWV3IDMnKSxcblx0XHRcdHdoZW46IENvbnRleHRLZXlFeHByLmVxdWFscygnc2hvd3ZpZXcnLCB0cnVlKVxuXHRcdH07XG5cblx0XHRWaWV3c1JlZ2lzdHJ5LnJlZ2lzdGVyVmlld3MoW3ZpZXcxLCB2aWV3MiwgdmlldzNdLCBjb250YWluZXIpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwodGVzdE9iamVjdC52aXNpYmxlVmlld0Rlc2NyaXB0b3JzLCBbdmlldzJdLCAnT25seSB2aWV3MiBzaG91bGQgYmUgdmlzaWJsZScpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwodGFyZ2V0LmVsZW1lbnRzLCBbdmlldzJdKTtcblxuXHRcdGNvbnN0IGtleSA9IGNvbnRleHRLZXlTZXJ2aWNlLmNyZWF0ZUtleTxib29sZWFuPignc2hvd3ZpZXcnLCBmYWxzZSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh0ZXN0T2JqZWN0LnZpc2libGVWaWV3RGVzY3JpcHRvcnMsIFt2aWV3Ml0sICdPbmx5IHZpZXcyIHNob3VsZCBiZSB2aXNpYmxlJyk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh0YXJnZXQuZWxlbWVudHMsIFt2aWV3Ml0pO1xuXG5cdFx0a2V5LnNldCh0cnVlKTtcblx0XHRhd2FpdCBuZXcgUHJvbWlzZShjID0+IHNldFRpbWVvdXQoYywgMzApKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHRlc3RPYmplY3QudmlzaWJsZVZpZXdEZXNjcmlwdG9ycywgW3ZpZXcyLCB2aWV3M10sICd2aWV3MyBzaG91bGQgYmUgdmlzaWJsZScpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwodGFyZ2V0LmVsZW1lbnRzLCBbdmlldzIsIHZpZXczXSk7XG5cblx0XHRrZXkuc2V0KGZhbHNlKTtcblx0XHRhd2FpdCBuZXcgUHJvbWlzZShjID0+IHNldFRpbWVvdXQoYywgMzApKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHRlc3RPYmplY3QudmlzaWJsZVZpZXdEZXNjcmlwdG9ycywgW3ZpZXcyXSwgJ09ubHkgdmlldzIgc2hvdWxkIGJlIHZpc2libGUnKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHRhcmdldC5lbGVtZW50cywgW3ZpZXcyXSk7XG5cdH0pKTtcblxuXHR0ZXN0KCdyZW1vdmUgZXZlbnQgaXMgbm90IHRyaWdnZXJlZCBpZiB2aWV3IHdhcyBoaWRkZW4gYW5kIHJlbW92ZWQnLCAoKSA9PiBydW5XaXRoRmFrZWRUaW1lcnM8dm9pZD4oeyB1c2VGYWtlVGltZXJzOiB0cnVlIH0sIGFzeW5jICgpID0+IHtcblx0XHQvLyBlc2xpbnQtZGlzYWJsZS1uZXh0LWxpbmUgbG9jYWwvY29kZS1uby1hbnktY2FzdHNcblx0XHRjb250YWluZXIgPSBWaWV3Q29udGFpbmVyUmVnaXN0cnkucmVnaXN0ZXJWaWV3Q29udGFpbmVyKHsgaWQ6ICd0ZXN0JywgdGl0bGU6IG5scy5sb2NhbGl6ZTIoJ3Rlc3QnLCAndGVzdCcpLCBjdG9yRGVzY3JpcHRvcjogbmV3IFN5bmNEZXNjcmlwdG9yKDxhbnk+e30pIH0sIFZpZXdDb250YWluZXJMb2NhdGlvbi5TaWRlYmFyKTtcblx0XHRjb25zdCB0ZXN0T2JqZWN0ID0gdmlld0Rlc2NyaXB0b3JTZXJ2aWNlLmdldFZpZXdDb250YWluZXJNb2RlbChjb250YWluZXIpO1xuXHRcdGNvbnN0IHRhcmdldCA9IGRpc3Bvc2FibGVTdG9yZS5hZGQobmV3IFZpZXdEZXNjcmlwdG9yU2VxdWVuY2UodGVzdE9iamVjdCkpO1xuXHRcdGNvbnN0IHZpZXdEZXNjcmlwdG9yOiBJVmlld0Rlc2NyaXB0b3IgPSB7XG5cdFx0XHRpZDogJ3ZpZXcxJyxcblx0XHRcdGN0b3JEZXNjcmlwdG9yOiBudWxsISxcblx0XHRcdG5hbWU6IG5scy5sb2NhbGl6ZTIoJ1Rlc3QgVmlldyAxJywgJ1Rlc3QgVmlldyAxJyksXG5cdFx0XHR3aGVuOiBDb250ZXh0S2V5RXhwci5lcXVhbHMoJ3Nob3d2aWV3MScsIHRydWUpLFxuXHRcdFx0Y2FuVG9nZ2xlVmlzaWJpbGl0eTogdHJ1ZVxuXHRcdH07XG5cblx0XHRWaWV3c1JlZ2lzdHJ5LnJlZ2lzdGVyVmlld3MoW3ZpZXdEZXNjcmlwdG9yXSwgY29udGFpbmVyKTtcblxuXHRcdGNvbnN0IGtleSA9IGNvbnRleHRLZXlTZXJ2aWNlLmNyZWF0ZUtleTxib29sZWFuPignc2hvd3ZpZXcxJywgdHJ1ZSk7XG5cdFx0YXdhaXQgbmV3IFByb21pc2UoYyA9PiBzZXRUaW1lb3V0KGMsIDMwKSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHRlc3RPYmplY3QudmlzaWJsZVZpZXdEZXNjcmlwdG9ycy5sZW5ndGgsIDEsICd2aWV3IHNob3VsZCBhcHBlYXIgYWZ0ZXIgY29udGV4dCBpcyBzZXQnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodGFyZ2V0LmVsZW1lbnRzLmxlbmd0aCwgMSk7XG5cblx0XHR0ZXN0T2JqZWN0LnNldFZpc2libGUoJ3ZpZXcxJywgZmFsc2UpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh0ZXN0T2JqZWN0LnZpc2libGVWaWV3RGVzY3JpcHRvcnMubGVuZ3RoLCAwLCAndmlldyBzaG91bGQgZGlzYXBwZWFyIGFmdGVyIHNldHRpbmcgdmlzaWJpbGl0eSB0byBmYWxzZScpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh0YXJnZXQuZWxlbWVudHMubGVuZ3RoLCAwKTtcblxuXHRcdGNvbnN0IHRhcmdldEV2ZW50ID0gc2lub24uc3B5KCk7XG5cdFx0ZGlzcG9zYWJsZVN0b3JlLmFkZCh0ZXN0T2JqZWN0Lm9uRGlkUmVtb3ZlVmlzaWJsZVZpZXdEZXNjcmlwdG9ycyh0YXJnZXRFdmVudCkpO1xuXHRcdGtleS5zZXQoZmFsc2UpO1xuXHRcdGF3YWl0IG5ldyBQcm9taXNlKGMgPT4gc2V0VGltZW91dChjLCAzMCkpO1xuXHRcdGFzc2VydC5vayghdGFyZ2V0RXZlbnQuY2FsbGVkLCAncmVtb3ZlIGV2ZW50IHNob3VsZCBub3QgYmUgY2FsbGVkIHNpbmNlIGl0IGlzIGFscmVhZHkgaGlkZGVuJyk7XG5cdH0pKTtcblxuXHR0ZXN0KCdhZGQgZXZlbnQgaXMgbm90IHRyaWdnZXJlZCBpZiB2aWV3IHdhcyBzZXQgdmlzaWJsZSAod2hlbiB2aXNpYmxlKSBhbmQgbm90IGFjdGl2ZScsICgpID0+IHJ1bldpdGhGYWtlZFRpbWVyczx2b2lkPih7IHVzZUZha2VUaW1lcnM6IHRydWUgfSwgYXN5bmMgKCkgPT4ge1xuXHRcdC8vIGVzbGludC1kaXNhYmxlLW5leHQtbGluZSBsb2NhbC9jb2RlLW5vLWFueS1jYXN0c1xuXHRcdGNvbnRhaW5lciA9IFZpZXdDb250YWluZXJSZWdpc3RyeS5yZWdpc3RlclZpZXdDb250YWluZXIoeyBpZDogJ3Rlc3QnLCB0aXRsZTogbmxzLmxvY2FsaXplMigndGVzdCcsICd0ZXN0JyksIGN0b3JEZXNjcmlwdG9yOiBuZXcgU3luY0Rlc2NyaXB0b3IoPGFueT57fSkgfSwgVmlld0NvbnRhaW5lckxvY2F0aW9uLlNpZGViYXIpO1xuXHRcdGNvbnN0IHRlc3RPYmplY3QgPSB2aWV3RGVzY3JpcHRvclNlcnZpY2UuZ2V0Vmlld0NvbnRhaW5lck1vZGVsKGNvbnRhaW5lcik7XG5cdFx0Y29uc3QgdGFyZ2V0ID0gZGlzcG9zYWJsZVN0b3JlLmFkZChuZXcgVmlld0Rlc2NyaXB0b3JTZXF1ZW5jZSh0ZXN0T2JqZWN0KSk7XG5cdFx0Y29uc3Qgdmlld0Rlc2NyaXB0b3I6IElWaWV3RGVzY3JpcHRvciA9IHtcblx0XHRcdGlkOiAndmlldzEnLFxuXHRcdFx0Y3RvckRlc2NyaXB0b3I6IG51bGwhLFxuXHRcdFx0bmFtZTogbmxzLmxvY2FsaXplMignVGVzdCBWaWV3IDEnLCAnVGVzdCBWaWV3IDEnKSxcblx0XHRcdHdoZW46IENvbnRleHRLZXlFeHByLmVxdWFscygnc2hvd3ZpZXcxJywgdHJ1ZSksXG5cdFx0XHRjYW5Ub2dnbGVWaXNpYmlsaXR5OiB0cnVlXG5cdFx0fTtcblxuXHRcdGNvbnN0IGtleSA9IGNvbnRleHRLZXlTZXJ2aWNlLmNyZWF0ZUtleTxib29sZWFuPignc2hvd3ZpZXcxJywgdHJ1ZSk7XG5cdFx0a2V5LnNldChmYWxzZSk7XG5cdFx0Vmlld3NSZWdpc3RyeS5yZWdpc3RlclZpZXdzKFt2aWV3RGVzY3JpcHRvcl0sIGNvbnRhaW5lcik7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodGVzdE9iamVjdC52aXNpYmxlVmlld0Rlc2NyaXB0b3JzLmxlbmd0aCwgMCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHRhcmdldC5lbGVtZW50cy5sZW5ndGgsIDApO1xuXG5cdFx0Y29uc3QgdGFyZ2V0RXZlbnQgPSBzaW5vbi5zcHkoKTtcblx0XHRkaXNwb3NhYmxlU3RvcmUuYWRkKHRlc3RPYmplY3Qub25EaWRBZGRWaXNpYmxlVmlld0Rlc2NyaXB0b3JzKHRhcmdldEV2ZW50KSk7XG5cdFx0dGVzdE9iamVjdC5zZXRWaXNpYmxlKCd2aWV3MScsIHRydWUpO1xuXHRcdGFzc2VydC5vayghdGFyZ2V0RXZlbnQuY2FsbGVkLCAnYWRkIGV2ZW50IHNob3VsZCBub3QgYmUgY2FsbGVkIHNpbmNlIGl0IGlzIGFscmVhZHkgdmlzaWJsZScpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh0ZXN0T2JqZWN0LnZpc2libGVWaWV3RGVzY3JpcHRvcnMubGVuZ3RoLCAwKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodGFyZ2V0LmVsZW1lbnRzLmxlbmd0aCwgMCk7XG5cdH0pKTtcblxuXHR0ZXN0KCdyZW1vdmUgZXZlbnQgaXMgbm90IHRyaWdnZXJlZCBpZiB2aWV3IHdhcyBoaWRkZW4gYW5kIG5vdCBhY3RpdmUnLCAoKSA9PiBydW5XaXRoRmFrZWRUaW1lcnM8dm9pZD4oeyB1c2VGYWtlVGltZXJzOiB0cnVlIH0sIGFzeW5jICgpID0+IHtcblx0XHQvLyBlc2xpbnQtZGlzYWJsZS1uZXh0LWxpbmUgbG9jYWwvY29kZS1uby1hbnktY2FzdHNcblx0XHRjb250YWluZXIgPSBWaWV3Q29udGFpbmVyUmVnaXN0cnkucmVnaXN0ZXJWaWV3Q29udGFpbmVyKHsgaWQ6ICd0ZXN0JywgdGl0bGU6IG5scy5sb2NhbGl6ZTIoJ3Rlc3QnLCAndGVzdCcpLCBjdG9yRGVzY3JpcHRvcjogbmV3IFN5bmNEZXNjcmlwdG9yKDxhbnk+e30pIH0sIFZpZXdDb250YWluZXJMb2NhdGlvbi5TaWRlYmFyKTtcblx0XHRjb25zdCB0ZXN0T2JqZWN0ID0gdmlld0Rlc2NyaXB0b3JTZXJ2aWNlLmdldFZpZXdDb250YWluZXJNb2RlbChjb250YWluZXIpO1xuXHRcdGNvbnN0IHRhcmdldCA9IGRpc3Bvc2FibGVTdG9yZS5hZGQobmV3IFZpZXdEZXNjcmlwdG9yU2VxdWVuY2UodGVzdE9iamVjdCkpO1xuXHRcdGNvbnN0IHZpZXdEZXNjcmlwdG9yOiBJVmlld0Rlc2NyaXB0b3IgPSB7XG5cdFx0XHRpZDogJ3ZpZXcxJyxcblx0XHRcdGN0b3JEZXNjcmlwdG9yOiBudWxsISxcblx0XHRcdG5hbWU6IG5scy5sb2NhbGl6ZTIoJ1Rlc3QgVmlldyAxJywgJ1Rlc3QgVmlldyAxJyksXG5cdFx0XHR3aGVuOiBDb250ZXh0S2V5RXhwci5lcXVhbHMoJ3Nob3d2aWV3MScsIHRydWUpLFxuXHRcdFx0Y2FuVG9nZ2xlVmlzaWJpbGl0eTogdHJ1ZVxuXHRcdH07XG5cblx0XHRjb25zdCBrZXkgPSBjb250ZXh0S2V5U2VydmljZS5jcmVhdGVLZXk8Ym9vbGVhbj4oJ3Nob3d2aWV3MScsIHRydWUpO1xuXHRcdGtleS5zZXQoZmFsc2UpO1xuXHRcdFZpZXdzUmVnaXN0cnkucmVnaXN0ZXJWaWV3cyhbdmlld0Rlc2NyaXB0b3JdLCBjb250YWluZXIpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHRlc3RPYmplY3QudmlzaWJsZVZpZXdEZXNjcmlwdG9ycy5sZW5ndGgsIDApO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh0YXJnZXQuZWxlbWVudHMubGVuZ3RoLCAwKTtcblxuXHRcdGNvbnN0IHRhcmdldEV2ZW50ID0gc2lub24uc3B5KCk7XG5cdFx0ZGlzcG9zYWJsZVN0b3JlLmFkZCh0ZXN0T2JqZWN0Lm9uRGlkQWRkVmlzaWJsZVZpZXdEZXNjcmlwdG9ycyh0YXJnZXRFdmVudCkpO1xuXHRcdHRlc3RPYmplY3Quc2V0VmlzaWJsZSgndmlldzEnLCBmYWxzZSk7XG5cdFx0YXNzZXJ0Lm9rKCF0YXJnZXRFdmVudC5jYWxsZWQsICdhZGQgZXZlbnQgc2hvdWxkIG5vdCBiZSBjYWxsZWQgc2luY2UgaXQgaXMgZGlzYWJsZWQnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodGVzdE9iamVjdC52aXNpYmxlVmlld0Rlc2NyaXB0b3JzLmxlbmd0aCwgMCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHRhcmdldC5lbGVtZW50cy5sZW5ndGgsIDApO1xuXHR9KSk7XG5cblx0dGVzdCgnYWRkIGV2ZW50IGlzIG5vdCB0cmlnZ2VyZWQgaWYgdmlldyB3YXMgc2V0IHZpc2libGUgKHdoZW4gbm90IHZpc2libGUpIGFuZCBub3QgYWN0aXZlJywgKCkgPT4gcnVuV2l0aEZha2VkVGltZXJzPHZvaWQ+KHsgdXNlRmFrZVRpbWVyczogdHJ1ZSB9LCBhc3luYyAoKSA9PiB7XG5cdFx0Ly8gZXNsaW50LWRpc2FibGUtbmV4dC1saW5lIGxvY2FsL2NvZGUtbm8tYW55LWNhc3RzXG5cdFx0Y29udGFpbmVyID0gVmlld0NvbnRhaW5lclJlZ2lzdHJ5LnJlZ2lzdGVyVmlld0NvbnRhaW5lcih7IGlkOiAndGVzdCcsIHRpdGxlOiBubHMubG9jYWxpemUyKCd0ZXN0JywgJ3Rlc3QnKSwgY3RvckRlc2NyaXB0b3I6IG5ldyBTeW5jRGVzY3JpcHRvcig8YW55Pnt9KSB9LCBWaWV3Q29udGFpbmVyTG9jYXRpb24uU2lkZWJhcik7XG5cdFx0Y29uc3QgdGVzdE9iamVjdCA9IHZpZXdEZXNjcmlwdG9yU2VydmljZS5nZXRWaWV3Q29udGFpbmVyTW9kZWwoY29udGFpbmVyKTtcblx0XHRjb25zdCB0YXJnZXQgPSBkaXNwb3NhYmxlU3RvcmUuYWRkKG5ldyBWaWV3RGVzY3JpcHRvclNlcXVlbmNlKHRlc3RPYmplY3QpKTtcblx0XHRjb25zdCB2aWV3RGVzY3JpcHRvcjogSVZpZXdEZXNjcmlwdG9yID0ge1xuXHRcdFx0aWQ6ICd2aWV3MScsXG5cdFx0XHRjdG9yRGVzY3JpcHRvcjogbnVsbCEsXG5cdFx0XHRuYW1lOiBubHMubG9jYWxpemUyKCdUZXN0IFZpZXcgMScsICdUZXN0IFZpZXcgMScpLFxuXHRcdFx0d2hlbjogQ29udGV4dEtleUV4cHIuZXF1YWxzKCdzaG93dmlldzEnLCB0cnVlKSxcblx0XHRcdGNhblRvZ2dsZVZpc2liaWxpdHk6IHRydWVcblx0XHR9O1xuXG5cdFx0Y29uc3Qga2V5ID0gY29udGV4dEtleVNlcnZpY2UuY3JlYXRlS2V5PGJvb2xlYW4+KCdzaG93dmlldzEnLCB0cnVlKTtcblx0XHRrZXkuc2V0KGZhbHNlKTtcblx0XHRWaWV3c1JlZ2lzdHJ5LnJlZ2lzdGVyVmlld3MoW3ZpZXdEZXNjcmlwdG9yXSwgY29udGFpbmVyKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh0ZXN0T2JqZWN0LnZpc2libGVWaWV3RGVzY3JpcHRvcnMubGVuZ3RoLCAwKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodGFyZ2V0LmVsZW1lbnRzLmxlbmd0aCwgMCk7XG5cblx0XHR0ZXN0T2JqZWN0LnNldFZpc2libGUoJ3ZpZXcxJywgZmFsc2UpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh0ZXN0T2JqZWN0LnZpc2libGVWaWV3RGVzY3JpcHRvcnMubGVuZ3RoLCAwKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodGFyZ2V0LmVsZW1lbnRzLmxlbmd0aCwgMCk7XG5cblx0XHRjb25zdCB0YXJnZXRFdmVudCA9IHNpbm9uLnNweSgpO1xuXHRcdGRpc3Bvc2FibGVTdG9yZS5hZGQodGVzdE9iamVjdC5vbkRpZEFkZFZpc2libGVWaWV3RGVzY3JpcHRvcnModGFyZ2V0RXZlbnQpKTtcblx0XHR0ZXN0T2JqZWN0LnNldFZpc2libGUoJ3ZpZXcxJywgdHJ1ZSk7XG5cdFx0YXNzZXJ0Lm9rKCF0YXJnZXRFdmVudC5jYWxsZWQsICdhZGQgZXZlbnQgc2hvdWxkIG5vdCBiZSBjYWxsZWQgc2luY2UgaXQgaXMgZGlzYWJsZWQnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodGVzdE9iamVjdC52aXNpYmxlVmlld0Rlc2NyaXB0b3JzLmxlbmd0aCwgMCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHRhcmdldC5lbGVtZW50cy5sZW5ndGgsIDApO1xuXHR9KSk7XG5cblx0dGVzdCgnYWRkZWQgdmlldyBkZXNjcmlwdG9ycyBhcmUgaW4gYXNjZW5kaW5nIG9yZGVyIGluIHRoZSBldmVudCcsICgpID0+IHJ1bldpdGhGYWtlZFRpbWVyczx2b2lkPih7IHVzZUZha2VUaW1lcnM6IHRydWUgfSwgYXN5bmMgKCkgPT4ge1xuXHRcdC8vIGVzbGludC1kaXNhYmxlLW5leHQtbGluZSBsb2NhbC9jb2RlLW5vLWFueS1jYXN0c1xuXHRcdGNvbnRhaW5lciA9IFZpZXdDb250YWluZXJSZWdpc3RyeS5yZWdpc3RlclZpZXdDb250YWluZXIoeyBpZDogJ3Rlc3QnLCB0aXRsZTogbmxzLmxvY2FsaXplMigndGVzdCcsICd0ZXN0JyksIGN0b3JEZXNjcmlwdG9yOiBuZXcgU3luY0Rlc2NyaXB0b3IoPGFueT57fSkgfSwgVmlld0NvbnRhaW5lckxvY2F0aW9uLlNpZGViYXIpO1xuXHRcdGNvbnN0IHRlc3RPYmplY3QgPSB2aWV3RGVzY3JpcHRvclNlcnZpY2UuZ2V0Vmlld0NvbnRhaW5lck1vZGVsKGNvbnRhaW5lcik7XG5cdFx0Y29uc3QgdGFyZ2V0ID0gZGlzcG9zYWJsZVN0b3JlLmFkZChuZXcgVmlld0Rlc2NyaXB0b3JTZXF1ZW5jZSh0ZXN0T2JqZWN0KSk7XG5cblx0XHRWaWV3c1JlZ2lzdHJ5LnJlZ2lzdGVyVmlld3MoW3tcblx0XHRcdGlkOiAndmlldzUnLFxuXHRcdFx0Y3RvckRlc2NyaXB0b3I6IG51bGwhLFxuXHRcdFx0bmFtZTogbmxzLmxvY2FsaXplMignVGVzdCBWaWV3IDUnLCAnVGVzdCBWaWV3IDUnKSxcblx0XHRcdGNhblRvZ2dsZVZpc2liaWxpdHk6IHRydWUsXG5cdFx0XHRvcmRlcjogNVxuXHRcdH0sIHtcblx0XHRcdGlkOiAndmlldzInLFxuXHRcdFx0Y3RvckRlc2NyaXB0b3I6IG51bGwhLFxuXHRcdFx0bmFtZTogbmxzLmxvY2FsaXplMignVGVzdCBWaWV3IDInLCAnVGVzdCBWaWV3IDInKSxcblx0XHRcdGNhblRvZ2dsZVZpc2liaWxpdHk6IHRydWUsXG5cdFx0XHRvcmRlcjogMlxuXHRcdH1dLCBjb250YWluZXIpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHRhcmdldC5lbGVtZW50cy5sZW5ndGgsIDIpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh0YXJnZXQuZWxlbWVudHNbMF0uaWQsICd2aWV3MicpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh0YXJnZXQuZWxlbWVudHNbMV0uaWQsICd2aWV3NScpO1xuXG5cdFx0Vmlld3NSZWdpc3RyeS5yZWdpc3RlclZpZXdzKFt7XG5cdFx0XHRpZDogJ3ZpZXc0Jyxcblx0XHRcdGN0b3JEZXNjcmlwdG9yOiBudWxsISxcblx0XHRcdG5hbWU6IG5scy5sb2NhbGl6ZTIoJ1Rlc3QgVmlldyA0JywgJ1Rlc3QgVmlldyA0JyksXG5cdFx0XHRjYW5Ub2dnbGVWaXNpYmlsaXR5OiB0cnVlLFxuXHRcdFx0b3JkZXI6IDRcblx0XHR9LCB7XG5cdFx0XHRpZDogJ3ZpZXczJyxcblx0XHRcdGN0b3JEZXNjcmlwdG9yOiBudWxsISxcblx0XHRcdG5hbWU6IG5scy5sb2NhbGl6ZTIoJ1Rlc3QgVmlldyAzJywgJ1Rlc3QgVmlldyAzJyksXG5cdFx0XHRjYW5Ub2dnbGVWaXNpYmlsaXR5OiB0cnVlLFxuXHRcdFx0b3JkZXI6IDNcblx0XHR9LCB7XG5cdFx0XHRpZDogJ3ZpZXcxJyxcblx0XHRcdGN0b3JEZXNjcmlwdG9yOiBudWxsISxcblx0XHRcdG5hbWU6IG5scy5sb2NhbGl6ZTIoJ1Rlc3QgVmlldyAxJywgJ1Rlc3QgVmlldyAxJyksXG5cdFx0XHRjYW5Ub2dnbGVWaXNpYmlsaXR5OiB0cnVlLFxuXHRcdFx0b3JkZXI6IDFcblx0XHR9XSwgY29udGFpbmVyKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh0YXJnZXQuZWxlbWVudHMubGVuZ3RoLCA1KTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodGFyZ2V0LmVsZW1lbnRzWzBdLmlkLCAndmlldzEnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodGFyZ2V0LmVsZW1lbnRzWzFdLmlkLCAndmlldzInKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodGFyZ2V0LmVsZW1lbnRzWzJdLmlkLCAndmlldzMnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodGFyZ2V0LmVsZW1lbnRzWzNdLmlkLCAndmlldzQnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodGFyZ2V0LmVsZW1lbnRzWzRdLmlkLCAndmlldzUnKTtcblx0fSkpO1xuXG5cdHRlc3QoJ2FkZCBldmVudCBpcyB0cmlnZ2VyZWQgb25seSBvbmNlIHdoZW4gdmlldyBpcyBzZXQgdmlzaWJsZSB3aGlsZSBpdCBpcyBzZXQgYWN0aXZlJywgKCkgPT4gcnVuV2l0aEZha2VkVGltZXJzPHZvaWQ+KHsgdXNlRmFrZVRpbWVyczogdHJ1ZSB9LCBhc3luYyAoKSA9PiB7XG5cdFx0Ly8gZXNsaW50LWRpc2FibGUtbmV4dC1saW5lIGxvY2FsL2NvZGUtbm8tYW55LWNhc3RzXG5cdFx0Y29udGFpbmVyID0gVmlld0NvbnRhaW5lclJlZ2lzdHJ5LnJlZ2lzdGVyVmlld0NvbnRhaW5lcih7IGlkOiAndGVzdCcsIHRpdGxlOiBubHMubG9jYWxpemUyKCd0ZXN0JywgJ3Rlc3QnKSwgY3RvckRlc2NyaXB0b3I6IG5ldyBTeW5jRGVzY3JpcHRvcig8YW55Pnt9KSB9LCBWaWV3Q29udGFpbmVyTG9jYXRpb24uU2lkZWJhcik7XG5cdFx0Y29uc3QgdGVzdE9iamVjdCA9IHZpZXdEZXNjcmlwdG9yU2VydmljZS5nZXRWaWV3Q29udGFpbmVyTW9kZWwoY29udGFpbmVyKTtcblx0XHRjb25zdCB0YXJnZXQgPSBkaXNwb3NhYmxlU3RvcmUuYWRkKG5ldyBWaWV3RGVzY3JpcHRvclNlcXVlbmNlKHRlc3RPYmplY3QpKTtcblx0XHRjb25zdCB2aWV3RGVzY3JpcHRvcjogSVZpZXdEZXNjcmlwdG9yID0ge1xuXHRcdFx0aWQ6ICd2aWV3MScsXG5cdFx0XHRjdG9yRGVzY3JpcHRvcjogbnVsbCEsXG5cdFx0XHRuYW1lOiBubHMubG9jYWxpemUyKCdUZXN0IFZpZXcgMScsICdUZXN0IFZpZXcgMScpLFxuXHRcdFx0d2hlbjogQ29udGV4dEtleUV4cHIuZXF1YWxzKCdzaG93dmlldzEnLCB0cnVlKSxcblx0XHRcdGNhblRvZ2dsZVZpc2liaWxpdHk6IHRydWVcblx0XHR9O1xuXG5cdFx0Y29uc3Qga2V5ID0gY29udGV4dEtleVNlcnZpY2UuY3JlYXRlS2V5PGJvb2xlYW4+KCdzaG93dmlldzEnLCB0cnVlKTtcblx0XHRrZXkuc2V0KGZhbHNlKTtcblx0XHRWaWV3c1JlZ2lzdHJ5LnJlZ2lzdGVyVmlld3MoW3ZpZXdEZXNjcmlwdG9yXSwgY29udGFpbmVyKTtcblx0XHR0ZXN0T2JqZWN0LnNldFZpc2libGUoJ3ZpZXcxJywgZmFsc2UpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHRlc3RPYmplY3QudmlzaWJsZVZpZXdEZXNjcmlwdG9ycy5sZW5ndGgsIDApO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh0YXJnZXQuZWxlbWVudHMubGVuZ3RoLCAwKTtcblxuXHRcdGNvbnN0IHRhcmdldEV2ZW50ID0gc2lub24uc3B5KCk7XG5cdFx0ZGlzcG9zYWJsZVN0b3JlLmFkZCh0ZXN0T2JqZWN0Lm9uRGlkQWRkVmlzaWJsZVZpZXdEZXNjcmlwdG9ycyh0YXJnZXRFdmVudCkpO1xuXHRcdGRpc3Bvc2FibGVTdG9yZS5hZGQoRXZlbnQub25jZSh0ZXN0T2JqZWN0Lm9uRGlkQ2hhbmdlQWN0aXZlVmlld0Rlc2NyaXB0b3JzKSgoKSA9PiB0ZXN0T2JqZWN0LnNldFZpc2libGUoJ3ZpZXcxJywgdHJ1ZSkpKTtcblx0XHRrZXkuc2V0KHRydWUpO1xuXHRcdGF3YWl0IG5ldyBQcm9taXNlKGMgPT4gc2V0VGltZW91dChjLCAzMCkpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh0YXJnZXRFdmVudC5jYWxsQ291bnQsIDEpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh0ZXN0T2JqZWN0LnZpc2libGVWaWV3RGVzY3JpcHRvcnMubGVuZ3RoLCAxKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodGFyZ2V0LmVsZW1lbnRzLmxlbmd0aCwgMSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHRhcmdldC5lbGVtZW50c1swXS5pZCwgJ3ZpZXcxJyk7XG5cdH0pKTtcblxuXHR0ZXN0KCdhZGQgZXZlbnQgaXMgbm90IHRyaWdnZXJlZCBvbmx5IHdoZW4gdmlldyBpcyBzZXQgaGlkZGVuIHdoaWxlIGl0IGlzIHNldCBhY3RpdmUnLCAoKSA9PiBydW5XaXRoRmFrZWRUaW1lcnM8dm9pZD4oeyB1c2VGYWtlVGltZXJzOiB0cnVlIH0sIGFzeW5jICgpID0+IHtcblx0XHQvLyBlc2xpbnQtZGlzYWJsZS1uZXh0LWxpbmUgbG9jYWwvY29kZS1uby1hbnktY2FzdHNcblx0XHRjb250YWluZXIgPSBWaWV3Q29udGFpbmVyUmVnaXN0cnkucmVnaXN0ZXJWaWV3Q29udGFpbmVyKHsgaWQ6ICd0ZXN0JywgdGl0bGU6IG5scy5sb2NhbGl6ZTIoJ3Rlc3QnLCAndGVzdCcpLCBjdG9yRGVzY3JpcHRvcjogbmV3IFN5bmNEZXNjcmlwdG9yKDxhbnk+e30pIH0sIFZpZXdDb250YWluZXJMb2NhdGlvbi5TaWRlYmFyKTtcblx0XHRjb25zdCB0ZXN0T2JqZWN0ID0gdmlld0Rlc2NyaXB0b3JTZXJ2aWNlLmdldFZpZXdDb250YWluZXJNb2RlbChjb250YWluZXIpO1xuXHRcdGNvbnN0IHRhcmdldCA9IGRpc3Bvc2FibGVTdG9yZS5hZGQobmV3IFZpZXdEZXNjcmlwdG9yU2VxdWVuY2UodGVzdE9iamVjdCkpO1xuXHRcdGNvbnN0IHZpZXdEZXNjcmlwdG9yOiBJVmlld0Rlc2NyaXB0b3IgPSB7XG5cdFx0XHRpZDogJ3ZpZXcxJyxcblx0XHRcdGN0b3JEZXNjcmlwdG9yOiBudWxsISxcblx0XHRcdG5hbWU6IG5scy5sb2NhbGl6ZTIoJ1Rlc3QgVmlldyAxJywgJ1Rlc3QgVmlldyAxJyksXG5cdFx0XHR3aGVuOiBDb250ZXh0S2V5RXhwci5lcXVhbHMoJ3Nob3d2aWV3MScsIHRydWUpLFxuXHRcdFx0Y2FuVG9nZ2xlVmlzaWJpbGl0eTogdHJ1ZVxuXHRcdH07XG5cblx0XHRjb25zdCBrZXkgPSBjb250ZXh0S2V5U2VydmljZS5jcmVhdGVLZXk8Ym9vbGVhbj4oJ3Nob3d2aWV3MScsIHRydWUpO1xuXHRcdGtleS5zZXQoZmFsc2UpO1xuXHRcdFZpZXdzUmVnaXN0cnkucmVnaXN0ZXJWaWV3cyhbdmlld0Rlc2NyaXB0b3JdLCBjb250YWluZXIpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHRlc3RPYmplY3QudmlzaWJsZVZpZXdEZXNjcmlwdG9ycy5sZW5ndGgsIDApO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh0YXJnZXQuZWxlbWVudHMubGVuZ3RoLCAwKTtcblxuXHRcdGNvbnN0IHRhcmdldEV2ZW50ID0gc2lub24uc3B5KCk7XG5cdFx0ZGlzcG9zYWJsZVN0b3JlLmFkZCh0ZXN0T2JqZWN0Lm9uRGlkQWRkVmlzaWJsZVZpZXdEZXNjcmlwdG9ycyh0YXJnZXRFdmVudCkpO1xuXHRcdGRpc3Bvc2FibGVTdG9yZS5hZGQoRXZlbnQub25jZSh0ZXN0T2JqZWN0Lm9uRGlkQ2hhbmdlQWN0aXZlVmlld0Rlc2NyaXB0b3JzKSgoKSA9PiB0ZXN0T2JqZWN0LnNldFZpc2libGUoJ3ZpZXcxJywgZmFsc2UpKSk7XG5cdFx0a2V5LnNldCh0cnVlKTtcblx0XHRhd2FpdCBuZXcgUHJvbWlzZShjID0+IHNldFRpbWVvdXQoYywgMzApKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodGFyZ2V0RXZlbnQuY2FsbENvdW50LCAwKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodGVzdE9iamVjdC52aXNpYmxlVmlld0Rlc2NyaXB0b3JzLmxlbmd0aCwgMCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHRhcmdldC5lbGVtZW50cy5sZW5ndGgsIDApO1xuXHR9KSk7XG5cblx0dGVzdCgnIzE0MjA4NzogdmlldyBkZXNjcmlwdG9yIHZpc2liaWxpdHkgaXMgbm90IHJlc2V0JywgKCkgPT4gcnVuV2l0aEZha2VkVGltZXJzPHZvaWQ+KHsgdXNlRmFrZVRpbWVyczogdHJ1ZSB9LCBhc3luYyAoKSA9PiB7XG5cdFx0Ly8gZXNsaW50LWRpc2FibGUtbmV4dC1saW5lIGxvY2FsL2NvZGUtbm8tYW55LWNhc3RzXG5cdFx0Y29udGFpbmVyID0gVmlld0NvbnRhaW5lclJlZ2lzdHJ5LnJlZ2lzdGVyVmlld0NvbnRhaW5lcih7IGlkOiAndGVzdCcsIHRpdGxlOiBubHMubG9jYWxpemUyKCd0ZXN0JywgJ3Rlc3QnKSwgY3RvckRlc2NyaXB0b3I6IG5ldyBTeW5jRGVzY3JpcHRvcig8YW55Pnt9KSB9LCBWaWV3Q29udGFpbmVyTG9jYXRpb24uU2lkZWJhcik7XG5cdFx0Y29uc3QgdGVzdE9iamVjdCA9IHZpZXdEZXNjcmlwdG9yU2VydmljZS5nZXRWaWV3Q29udGFpbmVyTW9kZWwoY29udGFpbmVyKTtcblx0XHRjb25zdCB2aWV3RGVzY3JpcHRvcjogSVZpZXdEZXNjcmlwdG9yID0ge1xuXHRcdFx0aWQ6ICd2aWV3MScsXG5cdFx0XHRjdG9yRGVzY3JpcHRvcjogbnVsbCEsXG5cdFx0XHRuYW1lOiBubHMubG9jYWxpemUyKCdUZXN0IFZpZXcgMScsICdUZXN0IFZpZXcgMScpLFxuXHRcdFx0Y2FuVG9nZ2xlVmlzaWJpbGl0eTogdHJ1ZVxuXHRcdH07XG5cblx0XHRzdG9yYWdlU2VydmljZS5zdG9yZShnZXRWaWV3c1N0YXRlU3RvcmFnZUlkKCd0ZXN0LnN0YXRlJyksIEpTT04uc3RyaW5naWZ5KFt7XG5cdFx0XHRpZDogdmlld0Rlc2NyaXB0b3IuaWQsXG5cdFx0XHRpc0hpZGRlbjogdHJ1ZSxcblx0XHRcdG9yZGVyOiB1bmRlZmluZWRcblx0XHR9XSksIFN0b3JhZ2VTY29wZS5QUk9GSUxFLCBTdG9yYWdlVGFyZ2V0LlVTRVIpO1xuXG5cdFx0Vmlld3NSZWdpc3RyeS5yZWdpc3RlclZpZXdzKFt2aWV3RGVzY3JpcHRvcl0sIGNvbnRhaW5lcik7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodGVzdE9iamVjdC5pc1Zpc2libGUodmlld0Rlc2NyaXB0b3IuaWQpLCBmYWxzZSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHRlc3RPYmplY3QuYWN0aXZlVmlld0Rlc2NyaXB0b3JzWzBdLmlkLCB2aWV3RGVzY3JpcHRvci5pZCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHRlc3RPYmplY3QudmlzaWJsZVZpZXdEZXNjcmlwdG9ycy5sZW5ndGgsIDApO1xuXHR9KSk7XG5cblx0dGVzdCgncmVtb3ZlIGV2ZW50IGlzIHRyaWdnZXJlZCBwcm9wZXJseSBpZiBtdWx0aXBsZSB2aWV3cyBhcmUgaGlkZGVuIGF0IHRoZSBzYW1lIHRpbWUnLCAoKSA9PiBydW5XaXRoRmFrZWRUaW1lcnM8dm9pZD4oeyB1c2VGYWtlVGltZXJzOiB0cnVlIH0sIGFzeW5jICgpID0+IHtcblx0XHQvLyBlc2xpbnQtZGlzYWJsZS1uZXh0LWxpbmUgbG9jYWwvY29kZS1uby1hbnktY2FzdHNcblx0XHRjb250YWluZXIgPSBWaWV3Q29udGFpbmVyUmVnaXN0cnkucmVnaXN0ZXJWaWV3Q29udGFpbmVyKHsgaWQ6ICd0ZXN0JywgdGl0bGU6IG5scy5sb2NhbGl6ZTIoJ3Rlc3QnLCAndGVzdCcpLCBjdG9yRGVzY3JpcHRvcjogbmV3IFN5bmNEZXNjcmlwdG9yKDxhbnk+e30pIH0sIFZpZXdDb250YWluZXJMb2NhdGlvbi5TaWRlYmFyKTtcblx0XHRjb25zdCB0ZXN0T2JqZWN0ID0gdmlld0Rlc2NyaXB0b3JTZXJ2aWNlLmdldFZpZXdDb250YWluZXJNb2RlbChjb250YWluZXIpO1xuXHRcdGNvbnN0IHRhcmdldCA9IGRpc3Bvc2FibGVTdG9yZS5hZGQobmV3IFZpZXdEZXNjcmlwdG9yU2VxdWVuY2UodGVzdE9iamVjdCkpO1xuXHRcdGNvbnN0IHZpZXdEZXNjcmlwdG9yMTogSVZpZXdEZXNjcmlwdG9yID0ge1xuXHRcdFx0aWQ6ICd2aWV3MScsXG5cdFx0XHRjdG9yRGVzY3JpcHRvcjogbnVsbCEsXG5cdFx0XHRuYW1lOiBubHMubG9jYWxpemUyKCdUZXN0IFZpZXcgMScsICdUZXN0IFZpZXcgMScpLFxuXHRcdFx0Y2FuVG9nZ2xlVmlzaWJpbGl0eTogdHJ1ZVxuXHRcdH07XG5cdFx0Y29uc3Qgdmlld0Rlc2NyaXB0b3IyOiBJVmlld0Rlc2NyaXB0b3IgPSB7XG5cdFx0XHRpZDogJ3ZpZXcyJyxcblx0XHRcdGN0b3JEZXNjcmlwdG9yOiBudWxsISxcblx0XHRcdG5hbWU6IG5scy5sb2NhbGl6ZTIoJ1Rlc3QgVmlldyAyJywgJ1Rlc3QgVmlldyAyJyksXG5cdFx0XHRjYW5Ub2dnbGVWaXNpYmlsaXR5OiB0cnVlXG5cdFx0fTtcblx0XHRjb25zdCB2aWV3RGVzY3JpcHRvcjM6IElWaWV3RGVzY3JpcHRvciA9IHtcblx0XHRcdGlkOiAndmlldzMnLFxuXHRcdFx0Y3RvckRlc2NyaXB0b3I6IG51bGwhLFxuXHRcdFx0bmFtZTogbmxzLmxvY2FsaXplMignVGVzdCBWaWV3IDMnLCAnVGVzdCBWaWV3IDMnKSxcblx0XHRcdGNhblRvZ2dsZVZpc2liaWxpdHk6IHRydWVcblx0XHR9O1xuXG5cdFx0Vmlld3NSZWdpc3RyeS5yZWdpc3RlclZpZXdzKFt2aWV3RGVzY3JpcHRvcjEsIHZpZXdEZXNjcmlwdG9yMiwgdmlld0Rlc2NyaXB0b3IzXSwgY29udGFpbmVyKTtcblxuXHRcdGNvbnN0IHJlbW9tdmVFdmVudCA9IHNpbm9uLnNweSgpO1xuXHRcdGRpc3Bvc2FibGVTdG9yZS5hZGQodGVzdE9iamVjdC5vbkRpZFJlbW92ZVZpc2libGVWaWV3RGVzY3JpcHRvcnMocmVtb212ZUV2ZW50KSk7XG5cblx0XHRjb25zdCBhZGRFdmVudCA9IHNpbm9uLnNweSgpO1xuXHRcdGRpc3Bvc2FibGVTdG9yZS5hZGQodGVzdE9iamVjdC5vbkRpZEFkZFZpc2libGVWaWV3RGVzY3JpcHRvcnMoYWRkRXZlbnQpKTtcblxuXHRcdHN0b3JhZ2VTZXJ2aWNlLnN0b3JlKGdldFZpZXdzU3RhdGVTdG9yYWdlSWQoJ3Rlc3Quc3RhdGUnKSwgSlNPTi5zdHJpbmdpZnkoW3tcblx0XHRcdGlkOiB2aWV3RGVzY3JpcHRvcjEuaWQsXG5cdFx0XHRpc0hpZGRlbjogZmFsc2UsXG5cdFx0XHRvcmRlcjogdW5kZWZpbmVkXG5cdFx0fSwge1xuXHRcdFx0aWQ6IHZpZXdEZXNjcmlwdG9yMi5pZCxcblx0XHRcdGlzSGlkZGVuOiB0cnVlLFxuXHRcdFx0b3JkZXI6IHVuZGVmaW5lZFxuXHRcdH0sIHtcblx0XHRcdGlkOiB2aWV3RGVzY3JpcHRvcjMuaWQsXG5cdFx0XHRpc0hpZGRlbjogdHJ1ZSxcblx0XHRcdG9yZGVyOiB1bmRlZmluZWRcblx0XHR9XSksIFN0b3JhZ2VTY29wZS5QUk9GSUxFLCBTdG9yYWdlVGFyZ2V0LlVTRVIpO1xuXG5cdFx0YXNzZXJ0Lm9rKCFhZGRFdmVudC5jYWxsZWQsICdhZGQgZXZlbnQgc2hvdWxkIG5vdCBiZSBjYWxsZWQnKTtcblx0XHRhc3NlcnQub2socmVtb212ZUV2ZW50LmNhbGxlZE9uY2UsICdyZW1vdmUgZXZlbnQgc2hvdWxkIGJlIGNhbGxlZCcpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocmVtb212ZUV2ZW50LmFyZ3NbMF1bMF0sIFt7XG5cdFx0XHR2aWV3RGVzY3JpcHRvcjogdmlld0Rlc2NyaXB0b3IzLFxuXHRcdFx0aW5kZXg6IDJcblx0XHR9LCB7XG5cdFx0XHR2aWV3RGVzY3JpcHRvcjogdmlld0Rlc2NyaXB0b3IyLFxuXHRcdFx0aW5kZXg6IDFcblx0XHR9XSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHRhcmdldC5lbGVtZW50cy5sZW5ndGgsIDEpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh0YXJnZXQuZWxlbWVudHNbMF0uaWQsIHZpZXdEZXNjcmlwdG9yMS5pZCk7XG5cdH0pKTtcblxuXHR0ZXN0KCdhZGQgZXZlbnQgaXMgdHJpZ2dlcmVkIHByb3Blcmx5IGlmIG11bHRpcGxlIHZpZXdzIGFyZSBoaWRkZW4gYXQgdGhlIHNhbWUgdGltZScsICgpID0+IHJ1bldpdGhGYWtlZFRpbWVyczx2b2lkPih7IHVzZUZha2VUaW1lcnM6IHRydWUgfSwgYXN5bmMgKCkgPT4ge1xuXHRcdC8vIGVzbGludC1kaXNhYmxlLW5leHQtbGluZSBsb2NhbC9jb2RlLW5vLWFueS1jYXN0c1xuXHRcdGNvbnRhaW5lciA9IFZpZXdDb250YWluZXJSZWdpc3RyeS5yZWdpc3RlclZpZXdDb250YWluZXIoeyBpZDogJ3Rlc3QnLCB0aXRsZTogbmxzLmxvY2FsaXplMigndGVzdCcsICd0ZXN0JyksIGN0b3JEZXNjcmlwdG9yOiBuZXcgU3luY0Rlc2NyaXB0b3IoPGFueT57fSkgfSwgVmlld0NvbnRhaW5lckxvY2F0aW9uLlNpZGViYXIpO1xuXHRcdGNvbnN0IHRlc3RPYmplY3QgPSB2aWV3RGVzY3JpcHRvclNlcnZpY2UuZ2V0Vmlld0NvbnRhaW5lck1vZGVsKGNvbnRhaW5lcik7XG5cdFx0Y29uc3QgdGFyZ2V0ID0gZGlzcG9zYWJsZVN0b3JlLmFkZChuZXcgVmlld0Rlc2NyaXB0b3JTZXF1ZW5jZSh0ZXN0T2JqZWN0KSk7XG5cdFx0Y29uc3Qgdmlld0Rlc2NyaXB0b3IxOiBJVmlld0Rlc2NyaXB0b3IgPSB7XG5cdFx0XHRpZDogJ3ZpZXcxJyxcblx0XHRcdGN0b3JEZXNjcmlwdG9yOiBudWxsISxcblx0XHRcdG5hbWU6IG5scy5sb2NhbGl6ZTIoJ1Rlc3QgVmlldyAxJywgJ1Rlc3QgVmlldyAxJyksXG5cdFx0XHRjYW5Ub2dnbGVWaXNpYmlsaXR5OiB0cnVlXG5cdFx0fTtcblx0XHRjb25zdCB2aWV3RGVzY3JpcHRvcjI6IElWaWV3RGVzY3JpcHRvciA9IHtcblx0XHRcdGlkOiAndmlldzInLFxuXHRcdFx0Y3RvckRlc2NyaXB0b3I6IG51bGwhLFxuXHRcdFx0bmFtZTogbmxzLmxvY2FsaXplMignVGVzdCBWaWV3IDInLCAnVGVzdCBWaWV3IDInKSxcblx0XHRcdGNhblRvZ2dsZVZpc2liaWxpdHk6IHRydWVcblx0XHR9O1xuXHRcdGNvbnN0IHZpZXdEZXNjcmlwdG9yMzogSVZpZXdEZXNjcmlwdG9yID0ge1xuXHRcdFx0aWQ6ICd2aWV3MycsXG5cdFx0XHRjdG9yRGVzY3JpcHRvcjogbnVsbCEsXG5cdFx0XHRuYW1lOiBubHMubG9jYWxpemUyKCdUZXN0IFZpZXcgMycsICdUZXN0IFZpZXcgMycpLFxuXHRcdFx0Y2FuVG9nZ2xlVmlzaWJpbGl0eTogdHJ1ZVxuXHRcdH07XG5cblx0XHRWaWV3c1JlZ2lzdHJ5LnJlZ2lzdGVyVmlld3MoW3ZpZXdEZXNjcmlwdG9yMSwgdmlld0Rlc2NyaXB0b3IyLCB2aWV3RGVzY3JpcHRvcjNdLCBjb250YWluZXIpO1xuXHRcdHRlc3RPYmplY3Quc2V0VmlzaWJsZSh2aWV3RGVzY3JpcHRvcjEuaWQsIGZhbHNlKTtcblx0XHR0ZXN0T2JqZWN0LnNldFZpc2libGUodmlld0Rlc2NyaXB0b3IzLmlkLCBmYWxzZSk7XG5cblx0XHRjb25zdCByZW1vdmVFdmVudCA9IHNpbm9uLnNweSgpO1xuXHRcdGRpc3Bvc2FibGVTdG9yZS5hZGQodGVzdE9iamVjdC5vbkRpZFJlbW92ZVZpc2libGVWaWV3RGVzY3JpcHRvcnMocmVtb3ZlRXZlbnQpKTtcblxuXHRcdGNvbnN0IGFkZEV2ZW50ID0gc2lub24uc3B5KCk7XG5cdFx0ZGlzcG9zYWJsZVN0b3JlLmFkZCh0ZXN0T2JqZWN0Lm9uRGlkQWRkVmlzaWJsZVZpZXdEZXNjcmlwdG9ycyhhZGRFdmVudCkpO1xuXG5cdFx0c3RvcmFnZVNlcnZpY2Uuc3RvcmUoZ2V0Vmlld3NTdGF0ZVN0b3JhZ2VJZCgndGVzdC5zdGF0ZScpLCBKU09OLnN0cmluZ2lmeShbe1xuXHRcdFx0aWQ6IHZpZXdEZXNjcmlwdG9yMS5pZCxcblx0XHRcdGlzSGlkZGVuOiBmYWxzZSxcblx0XHRcdG9yZGVyOiB1bmRlZmluZWRcblx0XHR9LCB7XG5cdFx0XHRpZDogdmlld0Rlc2NyaXB0b3IyLmlkLFxuXHRcdFx0aXNIaWRkZW46IGZhbHNlLFxuXHRcdFx0b3JkZXI6IHVuZGVmaW5lZFxuXHRcdH0sIHtcblx0XHRcdGlkOiB2aWV3RGVzY3JpcHRvcjMuaWQsXG5cdFx0XHRpc0hpZGRlbjogZmFsc2UsXG5cdFx0XHRvcmRlcjogdW5kZWZpbmVkXG5cdFx0fV0pLCBTdG9yYWdlU2NvcGUuUFJPRklMRSwgU3RvcmFnZVRhcmdldC5VU0VSKTtcblxuXHRcdGFzc2VydC5vayghcmVtb3ZlRXZlbnQuY2FsbGVkLCAncmVtb3ZlIGV2ZW50IHNob3VsZCBub3QgYmUgY2FsbGVkJyk7XG5cblx0XHRhc3NlcnQub2soYWRkRXZlbnQuY2FsbGVkT25jZSwgJ2FkZCBldmVudCBzaG91bGQgYmUgY2FsbGVkIG9uY2UnKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGFkZEV2ZW50LmFyZ3NbMF1bMF0sIFt7XG5cdFx0XHR2aWV3RGVzY3JpcHRvcjogdmlld0Rlc2NyaXB0b3IxLFxuXHRcdFx0aW5kZXg6IDAsXG5cdFx0XHRjb2xsYXBzZWQ6IGZhbHNlLFxuXHRcdFx0c2l6ZTogdW5kZWZpbmVkXG5cdFx0fSwge1xuXHRcdFx0dmlld0Rlc2NyaXB0b3I6IHZpZXdEZXNjcmlwdG9yMyxcblx0XHRcdGluZGV4OiAyLFxuXHRcdFx0Y29sbGFwc2VkOiBmYWxzZSxcblx0XHRcdHNpemU6IHVuZGVmaW5lZFxuXHRcdH1dKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh0YXJnZXQuZWxlbWVudHMubGVuZ3RoLCAzKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodGFyZ2V0LmVsZW1lbnRzWzBdLmlkLCB2aWV3RGVzY3JpcHRvcjEuaWQpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh0YXJnZXQuZWxlbWVudHNbMV0uaWQsIHZpZXdEZXNjcmlwdG9yMi5pZCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHRhcmdldC5lbGVtZW50c1syXS5pZCwgdmlld0Rlc2NyaXB0b3IzLmlkKTtcblx0fSkpO1xuXG5cdHRlc3QoJ2FkZCBhbmQgcmVtb3ZlIGV2ZW50cyBhcmUgdHJpZ2dlcmVkIHByb3Blcmx5IGlmIG11bHRpcGxlIHZpZXdzIGFyZSBoaWRkZW4gYW5kIGFkZGVkIGF0IHRoZSBzYW1lIHRpbWUnLCAoKSA9PiBydW5XaXRoRmFrZWRUaW1lcnM8dm9pZD4oeyB1c2VGYWtlVGltZXJzOiB0cnVlIH0sIGFzeW5jICgpID0+IHtcblx0XHQvLyBlc2xpbnQtZGlzYWJsZS1uZXh0LWxpbmUgbG9jYWwvY29kZS1uby1hbnktY2FzdHNcblx0XHRjb250YWluZXIgPSBWaWV3Q29udGFpbmVyUmVnaXN0cnkucmVnaXN0ZXJWaWV3Q29udGFpbmVyKHsgaWQ6ICd0ZXN0JywgdGl0bGU6IG5scy5sb2NhbGl6ZTIoJ3Rlc3QnLCAndGVzdCcpLCBjdG9yRGVzY3JpcHRvcjogbmV3IFN5bmNEZXNjcmlwdG9yKDxhbnk+e30pIH0sIFZpZXdDb250YWluZXJMb2NhdGlvbi5TaWRlYmFyKTtcblx0XHRjb25zdCB0ZXN0T2JqZWN0ID0gdmlld0Rlc2NyaXB0b3JTZXJ2aWNlLmdldFZpZXdDb250YWluZXJNb2RlbChjb250YWluZXIpO1xuXHRcdGNvbnN0IHRhcmdldCA9IGRpc3Bvc2FibGVTdG9yZS5hZGQobmV3IFZpZXdEZXNjcmlwdG9yU2VxdWVuY2UodGVzdE9iamVjdCkpO1xuXHRcdGNvbnN0IHZpZXdEZXNjcmlwdG9yMTogSVZpZXdEZXNjcmlwdG9yID0ge1xuXHRcdFx0aWQ6ICd2aWV3MScsXG5cdFx0XHRjdG9yRGVzY3JpcHRvcjogbnVsbCEsXG5cdFx0XHRuYW1lOiBubHMubG9jYWxpemUyKCdUZXN0IFZpZXcgMScsICdUZXN0IFZpZXcgMScpLFxuXHRcdFx0Y2FuVG9nZ2xlVmlzaWJpbGl0eTogdHJ1ZVxuXHRcdH07XG5cdFx0Y29uc3Qgdmlld0Rlc2NyaXB0b3IyOiBJVmlld0Rlc2NyaXB0b3IgPSB7XG5cdFx0XHRpZDogJ3ZpZXcyJyxcblx0XHRcdGN0b3JEZXNjcmlwdG9yOiBudWxsISxcblx0XHRcdG5hbWU6IG5scy5sb2NhbGl6ZTIoJ1Rlc3QgVmlldyAyJywgJ1Rlc3QgVmlldyAyJyksXG5cdFx0XHRjYW5Ub2dnbGVWaXNpYmlsaXR5OiB0cnVlXG5cdFx0fTtcblx0XHRjb25zdCB2aWV3RGVzY3JpcHRvcjM6IElWaWV3RGVzY3JpcHRvciA9IHtcblx0XHRcdGlkOiAndmlldzMnLFxuXHRcdFx0Y3RvckRlc2NyaXB0b3I6IG51bGwhLFxuXHRcdFx0bmFtZTogbmxzLmxvY2FsaXplMignVGVzdCBWaWV3IDMnLCAnVGVzdCBWaWV3IDMnKSxcblx0XHRcdGNhblRvZ2dsZVZpc2liaWxpdHk6IHRydWVcblx0XHR9O1xuXHRcdGNvbnN0IHZpZXdEZXNjcmlwdG9yNDogSVZpZXdEZXNjcmlwdG9yID0ge1xuXHRcdFx0aWQ6ICd2aWV3NCcsXG5cdFx0XHRjdG9yRGVzY3JpcHRvcjogbnVsbCEsXG5cdFx0XHRuYW1lOiBubHMubG9jYWxpemUyKCdUZXN0IFZpZXcgNCcsICdUZXN0IFZpZXcgNCcpLFxuXHRcdFx0Y2FuVG9nZ2xlVmlzaWJpbGl0eTogdHJ1ZVxuXHRcdH07XG5cblx0XHRWaWV3c1JlZ2lzdHJ5LnJlZ2lzdGVyVmlld3MoW3ZpZXdEZXNjcmlwdG9yMSwgdmlld0Rlc2NyaXB0b3IyLCB2aWV3RGVzY3JpcHRvcjMsIHZpZXdEZXNjcmlwdG9yNF0sIGNvbnRhaW5lcik7XG5cdFx0dGVzdE9iamVjdC5zZXRWaXNpYmxlKHZpZXdEZXNjcmlwdG9yMS5pZCwgZmFsc2UpO1xuXG5cdFx0Y29uc3QgcmVtb3ZlRXZlbnQgPSBzaW5vbi5zcHkoKTtcblx0XHRkaXNwb3NhYmxlU3RvcmUuYWRkKHRlc3RPYmplY3Qub25EaWRSZW1vdmVWaXNpYmxlVmlld0Rlc2NyaXB0b3JzKHJlbW92ZUV2ZW50KSk7XG5cblx0XHRjb25zdCBhZGRFdmVudCA9IHNpbm9uLnNweSgpO1xuXHRcdGRpc3Bvc2FibGVTdG9yZS5hZGQodGVzdE9iamVjdC5vbkRpZEFkZFZpc2libGVWaWV3RGVzY3JpcHRvcnMoYWRkRXZlbnQpKTtcblxuXHRcdHN0b3JhZ2VTZXJ2aWNlLnN0b3JlKGdldFZpZXdzU3RhdGVTdG9yYWdlSWQoJ3Rlc3Quc3RhdGUnKSwgSlNPTi5zdHJpbmdpZnkoW3tcblx0XHRcdGlkOiB2aWV3RGVzY3JpcHRvcjEuaWQsXG5cdFx0XHRpc0hpZGRlbjogZmFsc2UsXG5cdFx0XHRvcmRlcjogdW5kZWZpbmVkXG5cdFx0fSwge1xuXHRcdFx0aWQ6IHZpZXdEZXNjcmlwdG9yMi5pZCxcblx0XHRcdGlzSGlkZGVuOiB0cnVlLFxuXHRcdFx0b3JkZXI6IHVuZGVmaW5lZFxuXHRcdH0sIHtcblx0XHRcdGlkOiB2aWV3RGVzY3JpcHRvcjMuaWQsXG5cdFx0XHRpc0hpZGRlbjogZmFsc2UsXG5cdFx0XHRvcmRlcjogdW5kZWZpbmVkXG5cdFx0fSwge1xuXHRcdFx0aWQ6IHZpZXdEZXNjcmlwdG9yNC5pZCxcblx0XHRcdGlzSGlkZGVuOiB0cnVlLFxuXHRcdFx0b3JkZXI6IHVuZGVmaW5lZFxuXHRcdH1dKSwgU3RvcmFnZVNjb3BlLlBST0ZJTEUsIFN0b3JhZ2VUYXJnZXQuVVNFUik7XG5cblx0XHRhc3NlcnQub2socmVtb3ZlRXZlbnQuY2FsbGVkT25jZSwgJ3JlbW92ZSBldmVudCBzaG91bGQgYmUgY2FsbGVkIG9uY2UnKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHJlbW92ZUV2ZW50LmFyZ3NbMF1bMF0sIFt7XG5cdFx0XHR2aWV3RGVzY3JpcHRvcjogdmlld0Rlc2NyaXB0b3I0LFxuXHRcdFx0aW5kZXg6IDJcblx0XHR9LCB7XG5cdFx0XHR2aWV3RGVzY3JpcHRvcjogdmlld0Rlc2NyaXB0b3IyLFxuXHRcdFx0aW5kZXg6IDBcblx0XHR9XSk7XG5cblx0XHRhc3NlcnQub2soYWRkRXZlbnQuY2FsbGVkT25jZSwgJ2FkZCBldmVudCBzaG91bGQgYmUgY2FsbGVkIG9uY2UnKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGFkZEV2ZW50LmFyZ3NbMF1bMF0sIFt7XG5cdFx0XHR2aWV3RGVzY3JpcHRvcjogdmlld0Rlc2NyaXB0b3IxLFxuXHRcdFx0aW5kZXg6IDAsXG5cdFx0XHRjb2xsYXBzZWQ6IGZhbHNlLFxuXHRcdFx0c2l6ZTogdW5kZWZpbmVkXG5cdFx0fV0pO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh0YXJnZXQuZWxlbWVudHMubGVuZ3RoLCAyKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodGFyZ2V0LmVsZW1lbnRzWzBdLmlkLCB2aWV3RGVzY3JpcHRvcjEuaWQpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh0YXJnZXQuZWxlbWVudHNbMV0uaWQsIHZpZXdEZXNjcmlwdG9yMy5pZCk7XG5cdH0pKTtcblxuXHR0ZXN0KCduZXdseSBhZGRlZCB2aWV3IGRlc2NyaXB0b3IgaXMgaGlkZGVuIGlmIGl0IHdhcyB0b2dnbGVkIGhpZGRlbiBpbiBzdG9yYWdlIGJlZm9yZSBhZGRpbmcnLCAoKSA9PiBydW5XaXRoRmFrZWRUaW1lcnM8dm9pZD4oeyB1c2VGYWtlVGltZXJzOiB0cnVlIH0sIGFzeW5jICgpID0+IHtcblx0XHQvLyBlc2xpbnQtZGlzYWJsZS1uZXh0LWxpbmUgbG9jYWwvY29kZS1uby1hbnktY2FzdHNcblx0XHRjb250YWluZXIgPSBWaWV3Q29udGFpbmVyUmVnaXN0cnkucmVnaXN0ZXJWaWV3Q29udGFpbmVyKHsgaWQ6ICd0ZXN0JywgdGl0bGU6IG5scy5sb2NhbGl6ZTIoJ3Rlc3QnLCAndGVzdCcpLCBjdG9yRGVzY3JpcHRvcjogbmV3IFN5bmNEZXNjcmlwdG9yKDxhbnk+e30pIH0sIFZpZXdDb250YWluZXJMb2NhdGlvbi5TaWRlYmFyKTtcblx0XHRjb25zdCB2aWV3RGVzY3JpcHRvcjogSVZpZXdEZXNjcmlwdG9yID0ge1xuXHRcdFx0aWQ6ICd2aWV3MScsXG5cdFx0XHRjdG9yRGVzY3JpcHRvcjogbnVsbCEsXG5cdFx0XHRuYW1lOiBubHMubG9jYWxpemUyKCdUZXN0IFZpZXcgMScsICdUZXN0IFZpZXcgMScpLFxuXHRcdFx0Y2FuVG9nZ2xlVmlzaWJpbGl0eTogdHJ1ZVxuXHRcdH07XG5cdFx0c3RvcmFnZVNlcnZpY2Uuc3RvcmUoZ2V0Vmlld3NTdGF0ZVN0b3JhZ2VJZCgndGVzdC5zdGF0ZScpLCBKU09OLnN0cmluZ2lmeShbe1xuXHRcdFx0aWQ6IHZpZXdEZXNjcmlwdG9yLmlkLFxuXHRcdFx0aXNIaWRkZW46IGZhbHNlLFxuXHRcdFx0b3JkZXI6IHVuZGVmaW5lZFxuXHRcdH1dKSwgU3RvcmFnZVNjb3BlLlBST0ZJTEUsIFN0b3JhZ2VUYXJnZXQuVVNFUik7XG5cblx0XHRjb25zdCB0ZXN0T2JqZWN0ID0gdmlld0Rlc2NyaXB0b3JTZXJ2aWNlLmdldFZpZXdDb250YWluZXJNb2RlbChjb250YWluZXIpO1xuXG5cdFx0c3RvcmFnZVNlcnZpY2Uuc3RvcmUoZ2V0Vmlld3NTdGF0ZVN0b3JhZ2VJZCgndGVzdC5zdGF0ZScpLCBKU09OLnN0cmluZ2lmeShbe1xuXHRcdFx0aWQ6IHZpZXdEZXNjcmlwdG9yLmlkLFxuXHRcdFx0aXNIaWRkZW46IHRydWUsXG5cdFx0XHRvcmRlcjogdW5kZWZpbmVkXG5cdFx0fV0pLCBTdG9yYWdlU2NvcGUuUFJPRklMRSwgU3RvcmFnZVRhcmdldC5VU0VSKTtcblxuXHRcdFZpZXdzUmVnaXN0cnkucmVnaXN0ZXJWaWV3cyhbdmlld0Rlc2NyaXB0b3JdLCBjb250YWluZXIpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHRlc3RPYmplY3QuaXNWaXNpYmxlKHZpZXdEZXNjcmlwdG9yLmlkKSwgZmFsc2UpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh0ZXN0T2JqZWN0LmFjdGl2ZVZpZXdEZXNjcmlwdG9yc1swXS5pZCwgdmlld0Rlc2NyaXB0b3IuaWQpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh0ZXN0T2JqZWN0LnZpc2libGVWaWV3RGVzY3JpcHRvcnMubGVuZ3RoLCAwKTtcblx0fSkpO1xuXG59KTtcbiJdLAogICJtYXBwaW5ncyI6ICJBQUtBLFlBQVksU0FBUztBQUNyQixPQUFPLFlBQVk7QUFDbkIsWUFBWSxX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
