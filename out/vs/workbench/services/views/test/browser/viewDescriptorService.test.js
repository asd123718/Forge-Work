import * as nls from "../../../../../nls.js";
import assert from "assert";
import { Extensions as ViewContainerExtensions, ViewContainerLocation, ViewContainerLocationToString } from "../../../../common/views.js";
import { Registry } from "../../../../../platform/registry/common/platform.js";
import { workbenchInstantiationService } from "../../../../test/browser/workbenchTestServices.js";
import { SyncDescriptor } from "../../../../../platform/instantiation/common/descriptors.js";
import { ViewDescriptorService } from "../../browser/viewDescriptorService.js";
import { assertReturnsDefined } from "../../../../../base/common/types.js";
import { ContextKeyService } from "../../../../../platform/contextkey/browser/contextKeyService.js";
import { IContextKeyService } from "../../../../../platform/contextkey/common/contextkey.js";
import { IStorageService, StorageScope, StorageTarget } from "../../../../../platform/storage/common/storage.js";
import { generateUuid } from "../../../../../base/common/uuid.js";
import { compare } from "../../../../../base/common/strings.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../../base/test/common/utils.js";
const ViewsRegistry = Registry.as(ViewContainerExtensions.ViewsRegistry);
const ViewContainersRegistry = Registry.as(ViewContainerExtensions.ViewContainersRegistry);
const viewContainerIdPrefix = "testViewContainer";
const sidebarContainer = ViewContainersRegistry.registerViewContainer({ id: `${viewContainerIdPrefix}-${generateUuid()}`, title: nls.localize2("test", "test"), ctorDescriptor: new SyncDescriptor({}) }, ViewContainerLocation.Sidebar);
const panelContainer = ViewContainersRegistry.registerViewContainer({ id: `${viewContainerIdPrefix}-${generateUuid()}`, title: nls.localize2("test", "test"), ctorDescriptor: new SyncDescriptor({}) }, ViewContainerLocation.Panel);
suite("ViewDescriptorService", () => {
  const disposables = ensureNoDisposablesAreLeakedInTestSuite();
  let instantiationService;
  setup(() => {
    disposables.add(instantiationService = workbenchInstantiationService(void 0, disposables));
    instantiationService.stub(IContextKeyService, disposables.add(instantiationService.createInstance(ContextKeyService)));
  });
  teardown(() => {
    for (const viewContainer of ViewContainersRegistry.all) {
      if (viewContainer.id.startsWith(viewContainerIdPrefix)) {
        ViewsRegistry.deregisterViews(ViewsRegistry.getViews(viewContainer), viewContainer);
      }
    }
  });
  function aViewDescriptorService() {
    return disposables.add(instantiationService.createInstance(ViewDescriptorService));
  }
  test("Empty Containers", function() {
    const testObject = aViewDescriptorService();
    const sidebarViews = testObject.getViewContainerModel(sidebarContainer);
    const panelViews = testObject.getViewContainerModel(panelContainer);
    assert.strictEqual(sidebarViews.allViewDescriptors.length, 0, "The sidebar container should have no views yet.");
    assert.strictEqual(panelViews.allViewDescriptors.length, 0, "The panel container should have no views yet.");
  });
  test("Register/Deregister", () => {
    const testObject = aViewDescriptorService();
    const viewDescriptors = [
      {
        id: "view1",
        ctorDescriptor: null,
        name: nls.localize2("Test View 1", "Test View 1"),
        canMoveView: true
      },
      {
        id: "view2",
        ctorDescriptor: null,
        name: nls.localize2("Test View 2", "Test View 2"),
        canMoveView: true
      },
      {
        id: "view3",
        ctorDescriptor: null,
        name: nls.localize2("Test View 3", "Test View 3"),
        canMoveView: true
      }
    ];
    ViewsRegistry.registerViews(viewDescriptors.slice(0, 2), sidebarContainer);
    ViewsRegistry.registerViews(viewDescriptors.slice(2), panelContainer);
    let sidebarViews = testObject.getViewContainerModel(sidebarContainer);
    let panelViews = testObject.getViewContainerModel(panelContainer);
    assert.strictEqual(sidebarViews.activeViewDescriptors.length, 2, "Sidebar should have 2 views");
    assert.strictEqual(panelViews.activeViewDescriptors.length, 1, "Panel should have 1 view");
    ViewsRegistry.deregisterViews(viewDescriptors.slice(0, 2), sidebarContainer);
    ViewsRegistry.deregisterViews(viewDescriptors.slice(2), panelContainer);
    sidebarViews = testObject.getViewContainerModel(sidebarContainer);
    panelViews = testObject.getViewContainerModel(panelContainer);
    assert.strictEqual(sidebarViews.activeViewDescriptors.length, 0, "Sidebar should have no views");
    assert.strictEqual(panelViews.activeViewDescriptors.length, 0, "Panel should have no views");
  });
  test("move views to existing containers", async function() {
    const testObject = aViewDescriptorService();
    const viewDescriptors = [
      {
        id: "view1",
        ctorDescriptor: null,
        name: nls.localize2("Test View 1", "Test View 1"),
        canMoveView: true
      },
      {
        id: "view2",
        ctorDescriptor: null,
        name: nls.localize2("Test View 2", "Test View 2"),
        canMoveView: true
      },
      {
        id: "view3",
        ctorDescriptor: null,
        name: nls.localize2("Test View 3", "Test View 3"),
        canMoveView: true
      }
    ];
    ViewsRegistry.registerViews(viewDescriptors.slice(0, 2), sidebarContainer);
    ViewsRegistry.registerViews(viewDescriptors.slice(2), panelContainer);
    testObject.moveViewsToContainer(viewDescriptors.slice(2), sidebarContainer);
    testObject.moveViewsToContainer(viewDescriptors.slice(0, 2), panelContainer);
    const sidebarViews = testObject.getViewContainerModel(sidebarContainer);
    const panelViews = testObject.getViewContainerModel(panelContainer);
    assert.strictEqual(sidebarViews.activeViewDescriptors.length, 1, "Sidebar should have 2 views");
    assert.strictEqual(panelViews.activeViewDescriptors.length, 2, "Panel should have 1 view");
    assert.notStrictEqual(sidebarViews.activeViewDescriptors.indexOf(viewDescriptors[2]), -1, `Sidebar should have ${viewDescriptors[2].name.value}`);
    assert.notStrictEqual(panelViews.activeViewDescriptors.indexOf(viewDescriptors[0]), -1, `Panel should have ${viewDescriptors[0].name.value}`);
    assert.notStrictEqual(panelViews.activeViewDescriptors.indexOf(viewDescriptors[1]), -1, `Panel should have ${viewDescriptors[1].name.value}`);
  });
  test("move views to generated containers", async function() {
    const testObject = aViewDescriptorService();
    const viewDescriptors = [
      {
        id: "view1",
        ctorDescriptor: null,
        name: nls.localize2("Test View 1", "Test View 1"),
        canMoveView: true
      },
      {
        id: "view2",
        ctorDescriptor: null,
        name: nls.localize2("Test View 2", "Test View 2"),
        canMoveView: true
      },
      {
        id: "view3",
        ctorDescriptor: null,
        name: nls.localize2("Test View 3", "Test View 3"),
        canMoveView: true
      }
    ];
    ViewsRegistry.registerViews(viewDescriptors.slice(0, 2), sidebarContainer);
    ViewsRegistry.registerViews(viewDescriptors.slice(2), panelContainer);
    testObject.moveViewToLocation(viewDescriptors[0], ViewContainerLocation.Panel);
    testObject.moveViewToLocation(viewDescriptors[2], ViewContainerLocation.Sidebar);
    let sidebarViews = testObject.getViewContainerModel(sidebarContainer);
    let panelViews = testObject.getViewContainerModel(panelContainer);
    assert.strictEqual(sidebarViews.activeViewDescriptors.length, 1, "Sidebar container should have 1 view");
    assert.strictEqual(panelViews.activeViewDescriptors.length, 0, "Panel container should have no views");
    const generatedPanel = assertReturnsDefined(testObject.getViewContainerByViewId(viewDescriptors[0].id));
    const generatedSidebar = assertReturnsDefined(testObject.getViewContainerByViewId(viewDescriptors[2].id));
    assert.strictEqual(testObject.getViewContainerLocation(generatedPanel), ViewContainerLocation.Panel, "Generated Panel should be in located in the panel");
    assert.strictEqual(testObject.getViewContainerLocation(generatedSidebar), ViewContainerLocation.Sidebar, "Generated Sidebar should be in located in the sidebar");
    assert.strictEqual(testObject.getViewContainerLocation(generatedPanel), testObject.getViewLocationById(viewDescriptors[0].id), "Panel view location and container location should match");
    assert.strictEqual(testObject.getViewContainerLocation(generatedSidebar), testObject.getViewLocationById(viewDescriptors[2].id), "Sidebar view location and container location should match");
    assert.strictEqual(testObject.getDefaultContainerById(viewDescriptors[2].id), panelContainer, `${viewDescriptors[2].name.value} has wrong default container`);
    assert.strictEqual(testObject.getDefaultContainerById(viewDescriptors[0].id), sidebarContainer, `${viewDescriptors[0].name.value} has wrong default container`);
    testObject.moveViewToLocation(viewDescriptors[0], ViewContainerLocation.Sidebar);
    testObject.moveViewToLocation(viewDescriptors[2], ViewContainerLocation.Panel);
    sidebarViews = testObject.getViewContainerModel(sidebarContainer);
    panelViews = testObject.getViewContainerModel(panelContainer);
    assert.strictEqual(sidebarViews.activeViewDescriptors.length, 1, "Sidebar should have 2 views");
    assert.strictEqual(panelViews.activeViewDescriptors.length, 0, "Panel should have 1 view");
    assert.strictEqual(testObject.getViewLocationById(viewDescriptors[0].id), ViewContainerLocation.Sidebar, "View should be located in the sidebar");
    assert.strictEqual(testObject.getViewLocationById(viewDescriptors[2].id), ViewContainerLocation.Panel, "View should be located in the panel");
  });
  test("move view events", async function() {
    const testObject = aViewDescriptorService();
    const viewDescriptors = [
      {
        id: "view1",
        ctorDescriptor: null,
        name: nls.localize2("Test View 1", "Test View 1"),
        canMoveView: true
      },
      {
        id: "view2",
        ctorDescriptor: null,
        name: nls.localize2("Test View 2", "Test View 2"),
        canMoveView: true
      },
      {
        id: "view3",
        ctorDescriptor: null,
        name: nls.localize2("Test View 3", "Test View 3"),
        canMoveView: true
      }
    ];
    let expectedSequence = "";
    let actualSequence = "";
    const containerMoveString = (view, from, to) => {
      return `Moved ${view.id} from ${from.id} to ${to.id}
`;
    };
    const locationMoveString = (view, from, to) => {
      return `Moved ${view.id} from ${from === ViewContainerLocation.Sidebar ? "Sidebar" : "Panel"} to ${to === ViewContainerLocation.Sidebar ? "Sidebar" : "Panel"}
`;
    };
    disposables.add(testObject.onDidChangeContainer(({ views, from, to }) => {
      views.forEach((view) => {
        actualSequence += containerMoveString(view, from, to);
      });
    }));
    disposables.add(testObject.onDidChangeLocation(({ views, from, to }) => {
      views.forEach((view) => {
        actualSequence += locationMoveString(view, from, to);
      });
    }));
    ViewsRegistry.registerViews(viewDescriptors.slice(0, 2), sidebarContainer);
    ViewsRegistry.registerViews(viewDescriptors.slice(2), panelContainer);
    expectedSequence += locationMoveString(viewDescriptors[0], ViewContainerLocation.Sidebar, ViewContainerLocation.Panel);
    testObject.moveViewToLocation(viewDescriptors[0], ViewContainerLocation.Panel);
    expectedSequence += containerMoveString(viewDescriptors[0], sidebarContainer, testObject.getViewContainerByViewId(viewDescriptors[0].id));
    expectedSequence += locationMoveString(viewDescriptors[2], ViewContainerLocation.Panel, ViewContainerLocation.Sidebar);
    testObject.moveViewToLocation(viewDescriptors[2], ViewContainerLocation.Sidebar);
    expectedSequence += containerMoveString(viewDescriptors[2], panelContainer, testObject.getViewContainerByViewId(viewDescriptors[2].id));
    expectedSequence += locationMoveString(viewDescriptors[0], ViewContainerLocation.Panel, ViewContainerLocation.Sidebar);
    expectedSequence += containerMoveString(viewDescriptors[0], testObject.getViewContainerByViewId(viewDescriptors[0].id), sidebarContainer);
    testObject.moveViewsToContainer([viewDescriptors[0]], sidebarContainer);
    expectedSequence += locationMoveString(viewDescriptors[2], ViewContainerLocation.Sidebar, ViewContainerLocation.Panel);
    expectedSequence += containerMoveString(viewDescriptors[2], testObject.getViewContainerByViewId(viewDescriptors[2].id), panelContainer);
    testObject.moveViewsToContainer([viewDescriptors[2]], panelContainer);
    expectedSequence += locationMoveString(viewDescriptors[0], ViewContainerLocation.Sidebar, ViewContainerLocation.Panel);
    expectedSequence += containerMoveString(viewDescriptors[0], sidebarContainer, panelContainer);
    testObject.moveViewsToContainer([viewDescriptors[0]], panelContainer);
    expectedSequence += locationMoveString(viewDescriptors[2], ViewContainerLocation.Panel, ViewContainerLocation.Sidebar);
    expectedSequence += containerMoveString(viewDescriptors[2], panelContainer, sidebarContainer);
    testObject.moveViewsToContainer([viewDescriptors[2]], sidebarContainer);
    expectedSequence += locationMoveString(viewDescriptors[1], ViewContainerLocation.Sidebar, ViewContainerLocation.Panel);
    expectedSequence += locationMoveString(viewDescriptors[2], ViewContainerLocation.Sidebar, ViewContainerLocation.Panel);
    expectedSequence += containerMoveString(viewDescriptors[1], sidebarContainer, panelContainer);
    expectedSequence += containerMoveString(viewDescriptors[2], sidebarContainer, panelContainer);
    testObject.moveViewsToContainer([viewDescriptors[1], viewDescriptors[2]], panelContainer);
    assert.strictEqual(actualSequence, expectedSequence, "Event sequence not matching expected sequence");
  });
  test("reset", async function() {
    const testObject = aViewDescriptorService();
    const viewDescriptors = [
      {
        id: "view1",
        ctorDescriptor: null,
        name: nls.localize2("Test View 1", "Test View 1"),
        canMoveView: true,
        order: 1
      },
      {
        id: "view2",
        ctorDescriptor: null,
        name: nls.localize2("Test View 2", "Test View 2"),
        canMoveView: true,
        order: 2
      },
      {
        id: "view3",
        ctorDescriptor: null,
        name: nls.localize2("Test View 3", "Test View 3"),
        canMoveView: true,
        order: 3
      }
    ];
    ViewsRegistry.registerViews(viewDescriptors.slice(0, 2), sidebarContainer);
    ViewsRegistry.registerViews(viewDescriptors.slice(2), panelContainer);
    testObject.moveViewToLocation(viewDescriptors[0], ViewContainerLocation.Panel);
    testObject.moveViewsToContainer([viewDescriptors[1]], panelContainer);
    testObject.moveViewToLocation(viewDescriptors[2], ViewContainerLocation.Sidebar);
    const generatedPanel = assertReturnsDefined(testObject.getViewContainerByViewId(viewDescriptors[0].id));
    const generatedSidebar = assertReturnsDefined(testObject.getViewContainerByViewId(viewDescriptors[2].id));
    testObject.reset();
    const sidebarViews = testObject.getViewContainerModel(sidebarContainer);
    assert.deepStrictEqual(sidebarViews.allViewDescriptors.map((v) => v.id), ["view1", "view2"]);
    const panelViews = testObject.getViewContainerModel(panelContainer);
    assert.deepStrictEqual(panelViews.allViewDescriptors.map((v) => v.id), ["view3"]);
    const actual = JSON.parse(instantiationService.get(IStorageService).get("views.customizations", StorageScope.PROFILE));
    assert.deepStrictEqual(actual, { viewContainerLocations: {}, viewLocations: {}, viewContainerBadgeEnablementStates: {} });
    assert.deepStrictEqual(testObject.getViewContainerById(generatedPanel.id), null);
    assert.deepStrictEqual(testObject.getViewContainerById(generatedSidebar.id), null);
  });
  test("initialize with custom locations", async function() {
    const storageService = instantiationService.get(IStorageService);
    const viewContainer1 = ViewContainersRegistry.registerViewContainer({ id: `${viewContainerIdPrefix}-${generateUuid()}`, title: nls.localize2("test", "test"), ctorDescriptor: new SyncDescriptor({}) }, ViewContainerLocation.Sidebar);
    const generateViewContainer1 = `workbench.views.service.${ViewContainerLocationToString(ViewContainerLocation.Sidebar)}.${generateUuid()}`;
    const viewsCustomizations = {
      viewContainerLocations: {
        [generateViewContainer1]: ViewContainerLocation.Sidebar,
        [viewContainer1.id]: ViewContainerLocation.AuxiliaryBar
      },
      viewLocations: {
        "view1": generateViewContainer1
      }
    };
    storageService.store("views.customizations", JSON.stringify(viewsCustomizations), StorageScope.PROFILE, StorageTarget.USER);
    const viewDescriptors = [
      {
        id: "view1",
        ctorDescriptor: null,
        name: nls.localize2("Test View 1", "Test View 1"),
        canMoveView: true
      },
      {
        id: "view2",
        ctorDescriptor: null,
        name: nls.localize2("Test View 2", "Test View 2"),
        canMoveView: true
      },
      {
        id: "view3",
        ctorDescriptor: null,
        name: nls.localize2("Test View 3", "Test View 3"),
        canMoveView: true
      },
      {
        id: "view4",
        ctorDescriptor: null,
        name: nls.localize2("Test View 4", "Test View 4"),
        canMoveView: true
      }
    ];
    ViewsRegistry.registerViews(viewDescriptors.slice(0, 3), sidebarContainer);
    ViewsRegistry.registerViews(viewDescriptors.slice(3), viewContainer1);
    const testObject = aViewDescriptorService();
    const sidebarViews = testObject.getViewContainerModel(sidebarContainer);
    assert.deepStrictEqual(sidebarViews.allViewDescriptors.map((v) => v.id), ["view2", "view3"]);
    const generatedViewContainerViews = testObject.getViewContainerModel(testObject.getViewContainerById(generateViewContainer1));
    assert.deepStrictEqual(generatedViewContainerViews.allViewDescriptors.map((v) => v.id), ["view1"]);
    const viewContainer1Views = testObject.getViewContainerModel(viewContainer1);
    assert.deepStrictEqual(testObject.getViewContainerLocation(viewContainer1), ViewContainerLocation.AuxiliaryBar);
    assert.deepStrictEqual(viewContainer1Views.allViewDescriptors.map((v) => v.id), ["view4"]);
  });
  test("storage change", async function() {
    const testObject = aViewDescriptorService();
    const viewContainer1 = ViewContainersRegistry.registerViewContainer({ id: `${viewContainerIdPrefix}-${generateUuid()}`, title: nls.localize2("test", "test"), ctorDescriptor: new SyncDescriptor({}) }, ViewContainerLocation.Sidebar);
    const generateViewContainer1 = `workbench.views.service.${ViewContainerLocationToString(ViewContainerLocation.Sidebar)}.${generateUuid()}`;
    const viewDescriptors = [
      {
        id: "view1",
        ctorDescriptor: null,
        name: nls.localize2("Test View 1", "Test View 1"),
        canMoveView: true
      },
      {
        id: "view2",
        ctorDescriptor: null,
        name: nls.localize2("Test View 2", "Test View 2"),
        canMoveView: true
      },
      {
        id: "view3",
        ctorDescriptor: null,
        name: nls.localize2("Test View 3", "Test View 3"),
        canMoveView: true
      },
      {
        id: "view4",
        ctorDescriptor: null,
        name: nls.localize2("Test View 4", "Test View 4"),
        canMoveView: true
      }
    ];
    ViewsRegistry.registerViews(viewDescriptors.slice(0, 3), sidebarContainer);
    ViewsRegistry.registerViews(viewDescriptors.slice(3), viewContainer1);
    const viewsCustomizations = {
      viewContainerLocations: {
        [generateViewContainer1]: ViewContainerLocation.Sidebar,
        [viewContainer1.id]: ViewContainerLocation.AuxiliaryBar
      },
      viewLocations: {
        "view1": generateViewContainer1
      }
    };
    instantiationService.get(IStorageService).store("views.customizations", JSON.stringify(viewsCustomizations), StorageScope.PROFILE, StorageTarget.USER);
    const sidebarViews = testObject.getViewContainerModel(sidebarContainer);
    assert.deepStrictEqual(sidebarViews.allViewDescriptors.map((v) => v.id), ["view2", "view3"]);
    const generatedViewContainerViews = testObject.getViewContainerModel(testObject.getViewContainerById(generateViewContainer1));
    assert.deepStrictEqual(generatedViewContainerViews.allViewDescriptors.map((v) => v.id), ["view1"]);
    const viewContainer1Views = testObject.getViewContainerModel(viewContainer1);
    assert.deepStrictEqual(testObject.getViewContainerLocation(viewContainer1), ViewContainerLocation.AuxiliaryBar);
    assert.deepStrictEqual(viewContainer1Views.allViewDescriptors.map((v) => v.id), ["view4"]);
  });
  test("orphan views", async function() {
    const storageService = instantiationService.get(IStorageService);
    const viewsCustomizations = {
      viewContainerLocations: {},
      viewLocations: {
        "view1": `${viewContainerIdPrefix}-${generateUuid()}`
      }
    };
    storageService.store("views.customizations", JSON.stringify(viewsCustomizations), StorageScope.PROFILE, StorageTarget.USER);
    const viewDescriptors = [
      {
        id: "view1",
        ctorDescriptor: null,
        name: nls.localize2("Test View 1", "Test View 1"),
        canMoveView: true,
        order: 1
      },
      {
        id: "view2",
        ctorDescriptor: null,
        name: nls.localize2("Test View 2", "Test View 2"),
        canMoveView: true,
        order: 2
      },
      {
        id: "view3",
        ctorDescriptor: null,
        name: nls.localize2("Test View 3", "Test View 3"),
        canMoveView: true,
        order: 3
      }
    ];
    ViewsRegistry.registerViews(viewDescriptors, sidebarContainer);
    const testObject = aViewDescriptorService();
    const sidebarViews = testObject.getViewContainerModel(sidebarContainer);
    assert.deepStrictEqual(sidebarViews.allViewDescriptors.map((v) => v.id), ["view2", "view3"]);
    testObject.whenExtensionsRegistered();
    assert.deepStrictEqual(sidebarViews.allViewDescriptors.map((v) => v.id), ["view1", "view2", "view3"]);
  });
  test("orphan view containers", async function() {
    const storageService = instantiationService.get(IStorageService);
    const generatedViewContainerId = `workbench.views.service.${ViewContainerLocationToString(ViewContainerLocation.Sidebar)}.${generateUuid()}`;
    const viewsCustomizations = {
      viewContainerLocations: {
        [generatedViewContainerId]: ViewContainerLocation.Sidebar
      },
      viewLocations: {}
    };
    storageService.store("views.customizations", JSON.stringify(viewsCustomizations), StorageScope.PROFILE, StorageTarget.USER);
    const viewDescriptors = [
      {
        id: "view1",
        ctorDescriptor: null,
        name: nls.localize2("Test View 1", "Test View 1"),
        canMoveView: true,
        order: 1
      }
    ];
    ViewsRegistry.registerViews(viewDescriptors, sidebarContainer);
    const testObject = aViewDescriptorService();
    testObject.whenExtensionsRegistered();
    assert.deepStrictEqual(testObject.getViewContainerById(generatedViewContainerId), null);
    assert.deepStrictEqual(testObject.isViewContainerRemovedPermanently(generatedViewContainerId), true);
    const actual = JSON.parse(storageService.get("views.customizations", StorageScope.PROFILE));
    assert.deepStrictEqual(actual, { viewContainerLocations: {}, viewLocations: {}, viewContainerBadgeEnablementStates: {} });
  });
  test("custom locations take precedence when default view container of views change", async function() {
    const storageService = instantiationService.get(IStorageService);
    const viewContainer1 = ViewContainersRegistry.registerViewContainer({ id: `${viewContainerIdPrefix}-${generateUuid()}`, title: nls.localize2("test", "test"), ctorDescriptor: new SyncDescriptor({}) }, ViewContainerLocation.Sidebar);
    const generateViewContainer1 = `workbench.views.service.${ViewContainerLocationToString(ViewContainerLocation.Sidebar)}.${generateUuid()}`;
    const viewsCustomizations = {
      viewContainerLocations: {
        [generateViewContainer1]: ViewContainerLocation.Sidebar,
        [viewContainer1.id]: ViewContainerLocation.AuxiliaryBar
      },
      viewLocations: {
        "view1": generateViewContainer1
      }
    };
    storageService.store("views.customizations", JSON.stringify(viewsCustomizations), StorageScope.PROFILE, StorageTarget.USER);
    const viewDescriptors = [
      {
        id: "view1",
        ctorDescriptor: null,
        name: nls.localize2("Test View 1", "Test View 1"),
        canMoveView: true
      },
      {
        id: "view2",
        ctorDescriptor: null,
        name: nls.localize2("Test View 2", "Test View 2"),
        canMoveView: true
      },
      {
        id: "view3",
        ctorDescriptor: null,
        name: nls.localize2("Test View 3", "Test View 3"),
        canMoveView: true
      },
      {
        id: "view4",
        ctorDescriptor: null,
        name: nls.localize2("Test View 4", "Test View 4"),
        canMoveView: true
      }
    ];
    ViewsRegistry.registerViews(viewDescriptors.slice(0, 3), sidebarContainer);
    ViewsRegistry.registerViews(viewDescriptors.slice(3), viewContainer1);
    const testObject = aViewDescriptorService();
    ViewsRegistry.moveViews([viewDescriptors[0], viewDescriptors[1]], panelContainer);
    const sidebarViews = testObject.getViewContainerModel(sidebarContainer);
    assert.deepStrictEqual(sidebarViews.allViewDescriptors.map((v) => v.id), ["view3"]);
    const panelViews = testObject.getViewContainerModel(panelContainer);
    assert.deepStrictEqual(panelViews.allViewDescriptors.map((v) => v.id), ["view2"]);
    const generatedViewContainerViews = testObject.getViewContainerModel(testObject.getViewContainerById(generateViewContainer1));
    assert.deepStrictEqual(generatedViewContainerViews.allViewDescriptors.map((v) => v.id), ["view1"]);
    const viewContainer1Views = testObject.getViewContainerModel(viewContainer1);
    assert.deepStrictEqual(testObject.getViewContainerLocation(viewContainer1), ViewContainerLocation.AuxiliaryBar);
    assert.deepStrictEqual(viewContainer1Views.allViewDescriptors.map((v) => v.id), ["view4"]);
  });
  test("view containers with not existing views are not removed from customizations", async function() {
    const storageService = instantiationService.get(IStorageService);
    const viewContainer1 = ViewContainersRegistry.registerViewContainer({ id: `${viewContainerIdPrefix}-${generateUuid()}`, title: nls.localize2("test", "test"), ctorDescriptor: new SyncDescriptor({}) }, ViewContainerLocation.Sidebar);
    const generateViewContainer1 = `workbench.views.service.${ViewContainerLocationToString(ViewContainerLocation.Sidebar)}.${generateUuid()}`;
    const viewsCustomizations = {
      viewContainerLocations: {
        [generateViewContainer1]: ViewContainerLocation.Sidebar,
        [viewContainer1.id]: ViewContainerLocation.AuxiliaryBar
      },
      viewLocations: {
        "view5": generateViewContainer1
      }
    };
    storageService.store("views.customizations", JSON.stringify(viewsCustomizations), StorageScope.PROFILE, StorageTarget.USER);
    const viewDescriptors = [
      {
        id: "view1",
        ctorDescriptor: null,
        name: nls.localize2("Test View 1", "Test View 1"),
        canMoveView: true
      }
    ];
    ViewsRegistry.registerViews(viewDescriptors, viewContainer1);
    const testObject = aViewDescriptorService();
    testObject.whenExtensionsRegistered();
    const viewContainer1Views = testObject.getViewContainerModel(viewContainer1);
    assert.deepStrictEqual(testObject.getViewContainerLocation(viewContainer1), ViewContainerLocation.AuxiliaryBar);
    assert.deepStrictEqual(viewContainer1Views.allViewDescriptors.map((v) => v.id), ["view1"]);
    const actual = JSON.parse(storageService.get("views.customizations", StorageScope.PROFILE));
    assert.deepStrictEqual(actual, viewsCustomizations);
  });
  test("storage change also updates locations even if views do not exists and views are registered later", async function() {
    const storageService = instantiationService.get(IStorageService);
    const testObject = aViewDescriptorService();
    const generateViewContainerId = `workbench.views.service.${ViewContainerLocationToString(ViewContainerLocation.AuxiliaryBar)}.${generateUuid()}`;
    const viewsCustomizations = {
      viewContainerLocations: {
        [generateViewContainerId]: ViewContainerLocation.AuxiliaryBar
      },
      viewLocations: {
        "view1": generateViewContainerId
      }
    };
    storageService.store("views.customizations", JSON.stringify(viewsCustomizations), StorageScope.PROFILE, StorageTarget.USER);
    const viewContainer = ViewContainersRegistry.registerViewContainer({ id: `${viewContainerIdPrefix}-${generateUuid()}`, title: nls.localize2("test", "test"), ctorDescriptor: new SyncDescriptor({}) }, ViewContainerLocation.Sidebar);
    const viewDescriptors = [
      {
        id: "view1",
        ctorDescriptor: null,
        name: nls.localize2("Test View 1", "Test View 1"),
        canMoveView: true
      },
      {
        id: "view2",
        ctorDescriptor: null,
        name: nls.localize2("Test View 2", "Test View 2"),
        canMoveView: true
      }
    ];
    ViewsRegistry.registerViews(viewDescriptors, viewContainer);
    testObject.whenExtensionsRegistered();
    const viewContainer1Views = testObject.getViewContainerModel(viewContainer);
    assert.deepStrictEqual(viewContainer1Views.allViewDescriptors.map((v) => v.id), ["view2"]);
    const generateViewContainer = testObject.getViewContainerById(generateViewContainerId);
    assert.deepStrictEqual(testObject.getViewContainerLocation(generateViewContainer), ViewContainerLocation.AuxiliaryBar);
    const generatedViewContainerModel = testObject.getViewContainerModel(generateViewContainer);
    assert.deepStrictEqual(generatedViewContainerModel.allViewDescriptors.map((v) => v.id), ["view1"]);
  });
  test("storage change move views and retain visibility state", async function() {
    const storageService = instantiationService.get(IStorageService);
    const testObject = aViewDescriptorService();
    const viewContainer = ViewContainersRegistry.registerViewContainer({ id: `${viewContainerIdPrefix}-${generateUuid()}`, title: nls.localize2("test", "test"), ctorDescriptor: new SyncDescriptor({}) }, ViewContainerLocation.Sidebar);
    const viewDescriptors = [
      {
        id: "view1",
        ctorDescriptor: null,
        name: nls.localize2("Test View 1", "Test View 1"),
        canMoveView: true,
        canToggleVisibility: true
      },
      {
        id: "view2",
        ctorDescriptor: null,
        name: nls.localize2("Test View 2", "Test View 2"),
        canMoveView: true
      }
    ];
    ViewsRegistry.registerViews(viewDescriptors, viewContainer);
    testObject.whenExtensionsRegistered();
    const viewContainer1Views = testObject.getViewContainerModel(viewContainer);
    viewContainer1Views.setVisible("view1", false);
    const generateViewContainerId = `workbench.views.service.${ViewContainerLocationToString(ViewContainerLocation.AuxiliaryBar)}.${generateUuid()}`;
    const viewsCustomizations = {
      viewContainerLocations: {
        [generateViewContainerId]: ViewContainerLocation.AuxiliaryBar
      },
      viewLocations: {
        "view1": generateViewContainerId
      }
    };
    storageService.store("views.customizations", JSON.stringify(viewsCustomizations), StorageScope.PROFILE, StorageTarget.USER);
    const generateViewContainer = testObject.getViewContainerById(generateViewContainerId);
    const generatedViewContainerModel = testObject.getViewContainerModel(generateViewContainer);
    assert.deepStrictEqual(viewContainer1Views.allViewDescriptors.map((v) => v.id), ["view2"]);
    assert.deepStrictEqual(testObject.getViewContainerLocation(generateViewContainer), ViewContainerLocation.AuxiliaryBar);
    assert.deepStrictEqual(generatedViewContainerModel.allViewDescriptors.map((v) => v.id), ["view1"]);
    storageService.store("views.customizations", JSON.stringify({}), StorageScope.PROFILE, StorageTarget.USER);
    assert.deepStrictEqual(viewContainer1Views.allViewDescriptors.map((v) => v.id).sort((a, b) => compare(a, b)), ["view1", "view2"]);
    assert.deepStrictEqual(viewContainer1Views.visibleViewDescriptors.map((v) => v.id), ["view2"]);
    assert.deepStrictEqual(generatedViewContainerModel.allViewDescriptors.map((v) => v.id), []);
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXHNlcnZpY2VzXFx2aWV3c1xcdGVzdFxcYnJvd3Nlclxcdmlld0Rlc2NyaXB0b3JTZXJ2aWNlLnRlc3QudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgKiBhcyBubHMgZnJvbSAnLi4vLi4vLi4vLi4vLi4vbmxzLmpzJztcbmltcG9ydCBhc3NlcnQgZnJvbSAnYXNzZXJ0JztcbmltcG9ydCB7IElWaWV3c1JlZ2lzdHJ5LCBJVmlld0Rlc2NyaXB0b3IsIElWaWV3Q29udGFpbmVyc1JlZ2lzdHJ5LCBFeHRlbnNpb25zIGFzIFZpZXdDb250YWluZXJFeHRlbnNpb25zLCBWaWV3Q29udGFpbmVyTG9jYXRpb24sIFZpZXdDb250YWluZXIsIFZpZXdDb250YWluZXJMb2NhdGlvblRvU3RyaW5nIH0gZnJvbSAnLi4vLi4vLi4vLi4vY29tbW9uL3ZpZXdzLmpzJztcbmltcG9ydCB7IFJlZ2lzdHJ5IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vcmVnaXN0cnkvY29tbW9uL3BsYXRmb3JtLmpzJztcbmltcG9ydCB7IHdvcmtiZW5jaEluc3RhbnRpYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vdGVzdC9icm93c2VyL3dvcmtiZW5jaFRlc3RTZXJ2aWNlcy5qcyc7XG5pbXBvcnQgeyBUZXN0SW5zdGFudGlhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9pbnN0YW50aWF0aW9uL3Rlc3QvY29tbW9uL2luc3RhbnRpYXRpb25TZXJ2aWNlTW9jay5qcyc7XG5pbXBvcnQgeyBTeW5jRGVzY3JpcHRvciB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2luc3RhbnRpYXRpb24vY29tbW9uL2Rlc2NyaXB0b3JzLmpzJztcbmltcG9ydCB7IFZpZXdEZXNjcmlwdG9yU2VydmljZSB9IGZyb20gJy4uLy4uL2Jyb3dzZXIvdmlld0Rlc2NyaXB0b3JTZXJ2aWNlLmpzJztcbmltcG9ydCB7IGFzc2VydFJldHVybnNEZWZpbmVkIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdHlwZXMuanMnO1xuaW1wb3J0IHsgQ29udGV4dEtleVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb250ZXh0a2V5L2Jyb3dzZXIvY29udGV4dEtleVNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSUNvbnRleHRLZXlTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29udGV4dGtleS9jb21tb24vY29udGV4dGtleS5qcyc7XG5pbXBvcnQgeyBJU3RvcmFnZVNlcnZpY2UsIFN0b3JhZ2VTY29wZSwgU3RvcmFnZVRhcmdldCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL3N0b3JhZ2UvY29tbW9uL3N0b3JhZ2UuanMnO1xuaW1wb3J0IHsgZ2VuZXJhdGVVdWlkIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdXVpZC5qcyc7XG5pbXBvcnQgeyBjb21wYXJlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vc3RyaW5ncy5qcyc7XG5pbXBvcnQgeyBlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL3Rlc3QvY29tbW9uL3V0aWxzLmpzJztcblxuY29uc3QgVmlld3NSZWdpc3RyeSA9IFJlZ2lzdHJ5LmFzPElWaWV3c1JlZ2lzdHJ5PihWaWV3Q29udGFpbmVyRXh0ZW5zaW9ucy5WaWV3c1JlZ2lzdHJ5KTtcbmNvbnN0IFZpZXdDb250YWluZXJzUmVnaXN0cnkgPSBSZWdpc3RyeS5hczxJVmlld0NvbnRhaW5lcnNSZWdpc3RyeT4oVmlld0NvbnRhaW5lckV4dGVuc2lvbnMuVmlld0NvbnRhaW5lcnNSZWdpc3RyeSk7XG5jb25zdCB2aWV3Q29udGFpbmVySWRQcmVmaXggPSAndGVzdFZpZXdDb250YWluZXInO1xuLy8gZXNsaW50LWRpc2FibGUtbmV4dC1saW5lIGxvY2FsL2NvZGUtbm8tYW55LWNhc3RzXG5jb25zdCBzaWRlYmFyQ29udGFpbmVyID0gVmlld0NvbnRhaW5lcnNSZWdpc3RyeS5yZWdpc3RlclZpZXdDb250YWluZXIoeyBpZDogYCR7dmlld0NvbnRhaW5lcklkUHJlZml4fS0ke2dlbmVyYXRlVXVpZCgpfWAsIHRpdGxlOiBubHMubG9jYWxpemUyKCd0ZXN0JywgJ3Rlc3QnKSwgY3RvckRlc2NyaXB0b3I6IG5ldyBTeW5jRGVzY3JpcHRvcig8YW55Pnt9KSB9LCBWaWV3Q29udGFpbmVyTG9jYXRpb24uU2lkZWJhcik7XG4vLyBlc2xpbnQtZGlzYWJsZS1uZXh0LWxpbmUgbG9jYWwvY29kZS1uby1hbnktY2FzdHNcbmNvbnN0IHBhbmVsQ29udGFpbmVyID0gVmlld0NvbnRhaW5lcnNSZWdpc3RyeS5yZWdpc3RlclZpZXdDb250YWluZXIoeyBpZDogYCR7dmlld0NvbnRhaW5lcklkUHJlZml4fS0ke2dlbmVyYXRlVXVpZCgpfWAsIHRpdGxlOiBubHMubG9jYWxpemUyKCd0ZXN0JywgJ3Rlc3QnKSwgY3RvckRlc2NyaXB0b3I6IG5ldyBTeW5jRGVzY3JpcHRvcig8YW55Pnt9KSB9LCBWaWV3Q29udGFpbmVyTG9jYXRpb24uUGFuZWwpO1xuXG5zdWl0ZSgnVmlld0Rlc2NyaXB0b3JTZXJ2aWNlJywgKCkgPT4ge1xuXG5cdGNvbnN0IGRpc3Bvc2FibGVzID0gZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlKCk7XG5cdGxldCBpbnN0YW50aWF0aW9uU2VydmljZTogVGVzdEluc3RhbnRpYXRpb25TZXJ2aWNlO1xuXG5cdHNldHVwKCgpID0+IHtcblx0XHRkaXNwb3NhYmxlcy5hZGQoaW5zdGFudGlhdGlvblNlcnZpY2UgPSB3b3JrYmVuY2hJbnN0YW50aWF0aW9uU2VydmljZSh1bmRlZmluZWQsIGRpc3Bvc2FibGVzKSk7XG5cdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJQ29udGV4dEtleVNlcnZpY2UsIGRpc3Bvc2FibGVzLmFkZChpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShDb250ZXh0S2V5U2VydmljZSkpKTtcblx0fSk7XG5cblx0dGVhcmRvd24oKCkgPT4ge1xuXHRcdGZvciAoY29uc3Qgdmlld0NvbnRhaW5lciBvZiBWaWV3Q29udGFpbmVyc1JlZ2lzdHJ5LmFsbCkge1xuXHRcdFx0aWYgKHZpZXdDb250YWluZXIuaWQuc3RhcnRzV2l0aCh2aWV3Q29udGFpbmVySWRQcmVmaXgpKSB7XG5cdFx0XHRcdFZpZXdzUmVnaXN0cnkuZGVyZWdpc3RlclZpZXdzKFZpZXdzUmVnaXN0cnkuZ2V0Vmlld3Modmlld0NvbnRhaW5lciksIHZpZXdDb250YWluZXIpO1xuXHRcdFx0fVxuXHRcdH1cblx0fSk7XG5cblx0ZnVuY3Rpb24gYVZpZXdEZXNjcmlwdG9yU2VydmljZSgpOiBWaWV3RGVzY3JpcHRvclNlcnZpY2Uge1xuXHRcdHJldHVybiBkaXNwb3NhYmxlcy5hZGQoaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoVmlld0Rlc2NyaXB0b3JTZXJ2aWNlKSk7XG5cdH1cblxuXHR0ZXN0KCdFbXB0eSBDb250YWluZXJzJywgZnVuY3Rpb24gKCkge1xuXHRcdGNvbnN0IHRlc3RPYmplY3QgPSBhVmlld0Rlc2NyaXB0b3JTZXJ2aWNlKCk7XG5cdFx0Y29uc3Qgc2lkZWJhclZpZXdzID0gdGVzdE9iamVjdC5nZXRWaWV3Q29udGFpbmVyTW9kZWwoc2lkZWJhckNvbnRhaW5lcik7XG5cdFx0Y29uc3QgcGFuZWxWaWV3cyA9IHRlc3RPYmplY3QuZ2V0Vmlld0NvbnRhaW5lck1vZGVsKHBhbmVsQ29udGFpbmVyKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2lkZWJhclZpZXdzLmFsbFZpZXdEZXNjcmlwdG9ycy5sZW5ndGgsIDAsICdUaGUgc2lkZWJhciBjb250YWluZXIgc2hvdWxkIGhhdmUgbm8gdmlld3MgeWV0LicpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChwYW5lbFZpZXdzLmFsbFZpZXdEZXNjcmlwdG9ycy5sZW5ndGgsIDAsICdUaGUgcGFuZWwgY29udGFpbmVyIHNob3VsZCBoYXZlIG5vIHZpZXdzIHlldC4nKTtcblx0fSk7XG5cblx0dGVzdCgnUmVnaXN0ZXIvRGVyZWdpc3RlcicsICgpID0+IHtcblx0XHRjb25zdCB0ZXN0T2JqZWN0ID0gYVZpZXdEZXNjcmlwdG9yU2VydmljZSgpO1xuXHRcdGNvbnN0IHZpZXdEZXNjcmlwdG9yczogSVZpZXdEZXNjcmlwdG9yW10gPSBbXG5cdFx0XHR7XG5cdFx0XHRcdGlkOiAndmlldzEnLFxuXHRcdFx0XHRjdG9yRGVzY3JpcHRvcjogbnVsbCEsXG5cdFx0XHRcdG5hbWU6IG5scy5sb2NhbGl6ZTIoJ1Rlc3QgVmlldyAxJywgJ1Rlc3QgVmlldyAxJyksXG5cdFx0XHRcdGNhbk1vdmVWaWV3OiB0cnVlXG5cdFx0XHR9LFxuXHRcdFx0e1xuXHRcdFx0XHRpZDogJ3ZpZXcyJyxcblx0XHRcdFx0Y3RvckRlc2NyaXB0b3I6IG51bGwhLFxuXHRcdFx0XHRuYW1lOiBubHMubG9jYWxpemUyKCdUZXN0IFZpZXcgMicsICdUZXN0IFZpZXcgMicpLFxuXHRcdFx0XHRjYW5Nb3ZlVmlldzogdHJ1ZVxuXHRcdFx0fSxcblx0XHRcdHtcblx0XHRcdFx0aWQ6ICd2aWV3MycsXG5cdFx0XHRcdGN0b3JEZXNjcmlwdG9yOiBudWxsISxcblx0XHRcdFx0bmFtZTogbmxzLmxvY2FsaXplMignVGVzdCBWaWV3IDMnLCAnVGVzdCBWaWV3IDMnKSxcblx0XHRcdFx0Y2FuTW92ZVZpZXc6IHRydWVcblx0XHRcdH1cblx0XHRdO1xuXG5cdFx0Vmlld3NSZWdpc3RyeS5yZWdpc3RlclZpZXdzKHZpZXdEZXNjcmlwdG9ycy5zbGljZSgwLCAyKSwgc2lkZWJhckNvbnRhaW5lcik7XG5cdFx0Vmlld3NSZWdpc3RyeS5yZWdpc3RlclZpZXdzKHZpZXdEZXNjcmlwdG9ycy5zbGljZSgyKSwgcGFuZWxDb250YWluZXIpO1xuXG5cdFx0bGV0IHNpZGViYXJWaWV3cyA9IHRlc3RPYmplY3QuZ2V0Vmlld0NvbnRhaW5lck1vZGVsKHNpZGViYXJDb250YWluZXIpO1xuXHRcdGxldCBwYW5lbFZpZXdzID0gdGVzdE9iamVjdC5nZXRWaWV3Q29udGFpbmVyTW9kZWwocGFuZWxDb250YWluZXIpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNpZGViYXJWaWV3cy5hY3RpdmVWaWV3RGVzY3JpcHRvcnMubGVuZ3RoLCAyLCAnU2lkZWJhciBzaG91bGQgaGF2ZSAyIHZpZXdzJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHBhbmVsVmlld3MuYWN0aXZlVmlld0Rlc2NyaXB0b3JzLmxlbmd0aCwgMSwgJ1BhbmVsIHNob3VsZCBoYXZlIDEgdmlldycpO1xuXG5cdFx0Vmlld3NSZWdpc3RyeS5kZXJlZ2lzdGVyVmlld3Modmlld0Rlc2NyaXB0b3JzLnNsaWNlKDAsIDIpLCBzaWRlYmFyQ29udGFpbmVyKTtcblx0XHRWaWV3c1JlZ2lzdHJ5LmRlcmVnaXN0ZXJWaWV3cyh2aWV3RGVzY3JpcHRvcnMuc2xpY2UoMiksIHBhbmVsQ29udGFpbmVyKTtcblxuXHRcdHNpZGViYXJWaWV3cyA9IHRlc3RPYmplY3QuZ2V0Vmlld0NvbnRhaW5lck1vZGVsKHNpZGViYXJDb250YWluZXIpO1xuXHRcdHBhbmVsVmlld3MgPSB0ZXN0T2JqZWN0LmdldFZpZXdDb250YWluZXJNb2RlbChwYW5lbENvbnRhaW5lcik7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2lkZWJhclZpZXdzLmFjdGl2ZVZpZXdEZXNjcmlwdG9ycy5sZW5ndGgsIDAsICdTaWRlYmFyIHNob3VsZCBoYXZlIG5vIHZpZXdzJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHBhbmVsVmlld3MuYWN0aXZlVmlld0Rlc2NyaXB0b3JzLmxlbmd0aCwgMCwgJ1BhbmVsIHNob3VsZCBoYXZlIG5vIHZpZXdzJyk7XG5cdH0pO1xuXG5cdHRlc3QoJ21vdmUgdmlld3MgdG8gZXhpc3RpbmcgY29udGFpbmVycycsIGFzeW5jIGZ1bmN0aW9uICgpIHtcblx0XHRjb25zdCB0ZXN0T2JqZWN0ID0gYVZpZXdEZXNjcmlwdG9yU2VydmljZSgpO1xuXHRcdGNvbnN0IHZpZXdEZXNjcmlwdG9yczogSVZpZXdEZXNjcmlwdG9yW10gPSBbXG5cdFx0XHR7XG5cdFx0XHRcdGlkOiAndmlldzEnLFxuXHRcdFx0XHRjdG9yRGVzY3JpcHRvcjogbnVsbCEsXG5cdFx0XHRcdG5hbWU6IG5scy5sb2NhbGl6ZTIoJ1Rlc3QgVmlldyAxJywgJ1Rlc3QgVmlldyAxJyksXG5cdFx0XHRcdGNhbk1vdmVWaWV3OiB0cnVlXG5cdFx0XHR9LFxuXHRcdFx0e1xuXHRcdFx0XHRpZDogJ3ZpZXcyJyxcblx0XHRcdFx0Y3RvckRlc2NyaXB0b3I6IG51bGwhLFxuXHRcdFx0XHRuYW1lOiBubHMubG9jYWxpemUyKCdUZXN0IFZpZXcgMicsICdUZXN0IFZpZXcgMicpLFxuXHRcdFx0XHRjYW5Nb3ZlVmlldzogdHJ1ZVxuXHRcdFx0fSxcblx0XHRcdHtcblx0XHRcdFx0aWQ6ICd2aWV3MycsXG5cdFx0XHRcdGN0b3JEZXNjcmlwdG9yOiBudWxsISxcblx0XHRcdFx0bmFtZTogbmxzLmxvY2FsaXplMignVGVzdCBWaWV3IDMnLCAnVGVzdCBWaWV3IDMnKSxcblx0XHRcdFx0Y2FuTW92ZVZpZXc6IHRydWVcblx0XHRcdH1cblx0XHRdO1xuXG5cdFx0Vmlld3NSZWdpc3RyeS5yZWdpc3RlclZpZXdzKHZpZXdEZXNjcmlwdG9ycy5zbGljZSgwLCAyKSwgc2lkZWJhckNvbnRhaW5lcik7XG5cdFx0Vmlld3NSZWdpc3RyeS5yZWdpc3RlclZpZXdzKHZpZXdEZXNjcmlwdG9ycy5zbGljZSgyKSwgcGFuZWxDb250YWluZXIpO1xuXG5cdFx0dGVzdE9iamVjdC5tb3ZlVmlld3NUb0NvbnRhaW5lcih2aWV3RGVzY3JpcHRvcnMuc2xpY2UoMiksIHNpZGViYXJDb250YWluZXIpO1xuXHRcdHRlc3RPYmplY3QubW92ZVZpZXdzVG9Db250YWluZXIodmlld0Rlc2NyaXB0b3JzLnNsaWNlKDAsIDIpLCBwYW5lbENvbnRhaW5lcik7XG5cblx0XHRjb25zdCBzaWRlYmFyVmlld3MgPSB0ZXN0T2JqZWN0LmdldFZpZXdDb250YWluZXJNb2RlbChzaWRlYmFyQ29udGFpbmVyKTtcblx0XHRjb25zdCBwYW5lbFZpZXdzID0gdGVzdE9iamVjdC5nZXRWaWV3Q29udGFpbmVyTW9kZWwocGFuZWxDb250YWluZXIpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNpZGViYXJWaWV3cy5hY3RpdmVWaWV3RGVzY3JpcHRvcnMubGVuZ3RoLCAxLCAnU2lkZWJhciBzaG91bGQgaGF2ZSAyIHZpZXdzJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHBhbmVsVmlld3MuYWN0aXZlVmlld0Rlc2NyaXB0b3JzLmxlbmd0aCwgMiwgJ1BhbmVsIHNob3VsZCBoYXZlIDEgdmlldycpO1xuXG5cdFx0YXNzZXJ0Lm5vdFN0cmljdEVxdWFsKHNpZGViYXJWaWV3cy5hY3RpdmVWaWV3RGVzY3JpcHRvcnMuaW5kZXhPZih2aWV3RGVzY3JpcHRvcnNbMl0pLCAtMSwgYFNpZGViYXIgc2hvdWxkIGhhdmUgJHt2aWV3RGVzY3JpcHRvcnNbMl0ubmFtZS52YWx1ZX1gKTtcblx0XHRhc3NlcnQubm90U3RyaWN0RXF1YWwocGFuZWxWaWV3cy5hY3RpdmVWaWV3RGVzY3JpcHRvcnMuaW5kZXhPZih2aWV3RGVzY3JpcHRvcnNbMF0pLCAtMSwgYFBhbmVsIHNob3VsZCBoYXZlICR7dmlld0Rlc2NyaXB0b3JzWzBdLm5hbWUudmFsdWV9YCk7XG5cdFx0YXNzZXJ0Lm5vdFN0cmljdEVxdWFsKHBhbmVsVmlld3MuYWN0aXZlVmlld0Rlc2NyaXB0b3JzLmluZGV4T2Yodmlld0Rlc2NyaXB0b3JzWzFdKSwgLTEsIGBQYW5lbCBzaG91bGQgaGF2ZSAke3ZpZXdEZXNjcmlwdG9yc1sxXS5uYW1lLnZhbHVlfWApO1xuXHR9KTtcblxuXHR0ZXN0KCdtb3ZlIHZpZXdzIHRvIGdlbmVyYXRlZCBjb250YWluZXJzJywgYXN5bmMgZnVuY3Rpb24gKCkge1xuXHRcdGNvbnN0IHRlc3RPYmplY3QgPSBhVmlld0Rlc2NyaXB0b3JTZXJ2aWNlKCk7XG5cdFx0Y29uc3Qgdmlld0Rlc2NyaXB0b3JzOiBJVmlld0Rlc2NyaXB0b3JbXSA9IFtcblx0XHRcdHtcblx0XHRcdFx0aWQ6ICd2aWV3MScsXG5cdFx0XHRcdGN0b3JEZXNjcmlwdG9yOiBudWxsISxcblx0XHRcdFx0bmFtZTogbmxzLmxvY2FsaXplMignVGVzdCBWaWV3IDEnLCAnVGVzdCBWaWV3IDEnKSxcblx0XHRcdFx0Y2FuTW92ZVZpZXc6IHRydWVcblx0XHRcdH0sXG5cdFx0XHR7XG5cdFx0XHRcdGlkOiAndmlldzInLFxuXHRcdFx0XHRjdG9yRGVzY3JpcHRvcjogbnVsbCEsXG5cdFx0XHRcdG5hbWU6IG5scy5sb2NhbGl6ZTIoJ1Rlc3QgVmlldyAyJywgJ1Rlc3QgVmlldyAyJyksXG5cdFx0XHRcdGNhbk1vdmVWaWV3OiB0cnVlXG5cdFx0XHR9LFxuXHRcdFx0e1xuXHRcdFx0XHRpZDogJ3ZpZXczJyxcblx0XHRcdFx0Y3RvckRlc2NyaXB0b3I6IG51bGwhLFxuXHRcdFx0XHRuYW1lOiBubHMubG9jYWxpemUyKCdUZXN0IFZpZXcgMycsICdUZXN0IFZpZXcgMycpLFxuXHRcdFx0XHRjYW5Nb3ZlVmlldzogdHJ1ZVxuXHRcdFx0fVxuXHRcdF07XG5cblx0XHRWaWV3c1JlZ2lzdHJ5LnJlZ2lzdGVyVmlld3Modmlld0Rlc2NyaXB0b3JzLnNsaWNlKDAsIDIpLCBzaWRlYmFyQ29udGFpbmVyKTtcblx0XHRWaWV3c1JlZ2lzdHJ5LnJlZ2lzdGVyVmlld3Modmlld0Rlc2NyaXB0b3JzLnNsaWNlKDIpLCBwYW5lbENvbnRhaW5lcik7XG5cblx0XHR0ZXN0T2JqZWN0Lm1vdmVWaWV3VG9Mb2NhdGlvbih2aWV3RGVzY3JpcHRvcnNbMF0sIFZpZXdDb250YWluZXJMb2NhdGlvbi5QYW5lbCk7XG5cdFx0dGVzdE9iamVjdC5tb3ZlVmlld1RvTG9jYXRpb24odmlld0Rlc2NyaXB0b3JzWzJdLCBWaWV3Q29udGFpbmVyTG9jYXRpb24uU2lkZWJhcik7XG5cblx0XHRsZXQgc2lkZWJhclZpZXdzID0gdGVzdE9iamVjdC5nZXRWaWV3Q29udGFpbmVyTW9kZWwoc2lkZWJhckNvbnRhaW5lcik7XG5cdFx0bGV0IHBhbmVsVmlld3MgPSB0ZXN0T2JqZWN0LmdldFZpZXdDb250YWluZXJNb2RlbChwYW5lbENvbnRhaW5lcik7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2lkZWJhclZpZXdzLmFjdGl2ZVZpZXdEZXNjcmlwdG9ycy5sZW5ndGgsIDEsICdTaWRlYmFyIGNvbnRhaW5lciBzaG91bGQgaGF2ZSAxIHZpZXcnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocGFuZWxWaWV3cy5hY3RpdmVWaWV3RGVzY3JpcHRvcnMubGVuZ3RoLCAwLCAnUGFuZWwgY29udGFpbmVyIHNob3VsZCBoYXZlIG5vIHZpZXdzJyk7XG5cblx0XHRjb25zdCBnZW5lcmF0ZWRQYW5lbCA9IGFzc2VydFJldHVybnNEZWZpbmVkKHRlc3RPYmplY3QuZ2V0Vmlld0NvbnRhaW5lckJ5Vmlld0lkKHZpZXdEZXNjcmlwdG9yc1swXS5pZCkpO1xuXHRcdGNvbnN0IGdlbmVyYXRlZFNpZGViYXIgPSBhc3NlcnRSZXR1cm5zRGVmaW5lZCh0ZXN0T2JqZWN0LmdldFZpZXdDb250YWluZXJCeVZpZXdJZCh2aWV3RGVzY3JpcHRvcnNbMl0uaWQpKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh0ZXN0T2JqZWN0LmdldFZpZXdDb250YWluZXJMb2NhdGlvbihnZW5lcmF0ZWRQYW5lbCksIFZpZXdDb250YWluZXJMb2NhdGlvbi5QYW5lbCwgJ0dlbmVyYXRlZCBQYW5lbCBzaG91bGQgYmUgaW4gbG9jYXRlZCBpbiB0aGUgcGFuZWwnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodGVzdE9iamVjdC5nZXRWaWV3Q29udGFpbmVyTG9jYXRpb24oZ2VuZXJhdGVkU2lkZWJhciksIFZpZXdDb250YWluZXJMb2NhdGlvbi5TaWRlYmFyLCAnR2VuZXJhdGVkIFNpZGViYXIgc2hvdWxkIGJlIGluIGxvY2F0ZWQgaW4gdGhlIHNpZGViYXInKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh0ZXN0T2JqZWN0LmdldFZpZXdDb250YWluZXJMb2NhdGlvbihnZW5lcmF0ZWRQYW5lbCksIHRlc3RPYmplY3QuZ2V0Vmlld0xvY2F0aW9uQnlJZCh2aWV3RGVzY3JpcHRvcnNbMF0uaWQpLCAnUGFuZWwgdmlldyBsb2NhdGlvbiBhbmQgY29udGFpbmVyIGxvY2F0aW9uIHNob3VsZCBtYXRjaCcpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh0ZXN0T2JqZWN0LmdldFZpZXdDb250YWluZXJMb2NhdGlvbihnZW5lcmF0ZWRTaWRlYmFyKSwgdGVzdE9iamVjdC5nZXRWaWV3TG9jYXRpb25CeUlkKHZpZXdEZXNjcmlwdG9yc1syXS5pZCksICdTaWRlYmFyIHZpZXcgbG9jYXRpb24gYW5kIGNvbnRhaW5lciBsb2NhdGlvbiBzaG91bGQgbWF0Y2gnKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh0ZXN0T2JqZWN0LmdldERlZmF1bHRDb250YWluZXJCeUlkKHZpZXdEZXNjcmlwdG9yc1syXS5pZCksIHBhbmVsQ29udGFpbmVyLCBgJHt2aWV3RGVzY3JpcHRvcnNbMl0ubmFtZS52YWx1ZX0gaGFzIHdyb25nIGRlZmF1bHQgY29udGFpbmVyYCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHRlc3RPYmplY3QuZ2V0RGVmYXVsdENvbnRhaW5lckJ5SWQodmlld0Rlc2NyaXB0b3JzWzBdLmlkKSwgc2lkZWJhckNvbnRhaW5lciwgYCR7dmlld0Rlc2NyaXB0b3JzWzBdLm5hbWUudmFsdWV9IGhhcyB3cm9uZyBkZWZhdWx0IGNvbnRhaW5lcmApO1xuXG5cdFx0dGVzdE9iamVjdC5tb3ZlVmlld1RvTG9jYXRpb24odmlld0Rlc2NyaXB0b3JzWzBdLCBWaWV3Q29udGFpbmVyTG9jYXRpb24uU2lkZWJhcik7XG5cdFx0dGVzdE9iamVjdC5tb3ZlVmlld1RvTG9jYXRpb24odmlld0Rlc2NyaXB0b3JzWzJdLCBWaWV3Q29udGFpbmVyTG9jYXRpb24uUGFuZWwpO1xuXG5cdFx0c2lkZWJhclZpZXdzID0gdGVzdE9iamVjdC5nZXRWaWV3Q29udGFpbmVyTW9kZWwoc2lkZWJhckNvbnRhaW5lcik7XG5cdFx0cGFuZWxWaWV3cyA9IHRlc3RPYmplY3QuZ2V0Vmlld0NvbnRhaW5lck1vZGVsKHBhbmVsQ29udGFpbmVyKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzaWRlYmFyVmlld3MuYWN0aXZlVmlld0Rlc2NyaXB0b3JzLmxlbmd0aCwgMSwgJ1NpZGViYXIgc2hvdWxkIGhhdmUgMiB2aWV3cycpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChwYW5lbFZpZXdzLmFjdGl2ZVZpZXdEZXNjcmlwdG9ycy5sZW5ndGgsIDAsICdQYW5lbCBzaG91bGQgaGF2ZSAxIHZpZXcnKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh0ZXN0T2JqZWN0LmdldFZpZXdMb2NhdGlvbkJ5SWQodmlld0Rlc2NyaXB0b3JzWzBdLmlkKSwgVmlld0NvbnRhaW5lckxvY2F0aW9uLlNpZGViYXIsICdWaWV3IHNob3VsZCBiZSBsb2NhdGVkIGluIHRoZSBzaWRlYmFyJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHRlc3RPYmplY3QuZ2V0Vmlld0xvY2F0aW9uQnlJZCh2aWV3RGVzY3JpcHRvcnNbMl0uaWQpLCBWaWV3Q29udGFpbmVyTG9jYXRpb24uUGFuZWwsICdWaWV3IHNob3VsZCBiZSBsb2NhdGVkIGluIHRoZSBwYW5lbCcpO1xuXHR9KTtcblxuXHR0ZXN0KCdtb3ZlIHZpZXcgZXZlbnRzJywgYXN5bmMgZnVuY3Rpb24gKCkge1xuXHRcdGNvbnN0IHRlc3RPYmplY3QgPSBhVmlld0Rlc2NyaXB0b3JTZXJ2aWNlKCk7XG5cdFx0Y29uc3Qgdmlld0Rlc2NyaXB0b3JzOiBJVmlld0Rlc2NyaXB0b3JbXSA9IFtcblx0XHRcdHtcblx0XHRcdFx0aWQ6ICd2aWV3MScsXG5cdFx0XHRcdGN0b3JEZXNjcmlwdG9yOiBudWxsISxcblx0XHRcdFx0bmFtZTogbmxzLmxvY2FsaXplMignVGVzdCBWaWV3IDEnLCAnVGVzdCBWaWV3IDEnKSxcblx0XHRcdFx0Y2FuTW92ZVZpZXc6IHRydWVcblx0XHRcdH0sXG5cdFx0XHR7XG5cdFx0XHRcdGlkOiAndmlldzInLFxuXHRcdFx0XHRjdG9yRGVzY3JpcHRvcjogbnVsbCEsXG5cdFx0XHRcdG5hbWU6IG5scy5sb2NhbGl6ZTIoJ1Rlc3QgVmlldyAyJywgJ1Rlc3QgVmlldyAyJyksXG5cdFx0XHRcdGNhbk1vdmVWaWV3OiB0cnVlXG5cdFx0XHR9LFxuXHRcdFx0e1xuXHRcdFx0XHRpZDogJ3ZpZXczJyxcblx0XHRcdFx0Y3RvckRlc2NyaXB0b3I6IG51bGwhLFxuXHRcdFx0XHRuYW1lOiBubHMubG9jYWxpemUyKCdUZXN0IFZpZXcgMycsICdUZXN0IFZpZXcgMycpLFxuXHRcdFx0XHRjYW5Nb3ZlVmlldzogdHJ1ZVxuXHRcdFx0fVxuXHRcdF07XG5cblx0XHRsZXQgZXhwZWN0ZWRTZXF1ZW5jZSA9ICcnO1xuXHRcdGxldCBhY3R1YWxTZXF1ZW5jZSA9ICcnO1xuXG5cdFx0Y29uc3QgY29udGFpbmVyTW92ZVN0cmluZyA9ICh2aWV3OiBJVmlld0Rlc2NyaXB0b3IsIGZyb206IFZpZXdDb250YWluZXIsIHRvOiBWaWV3Q29udGFpbmVyKSA9PiB7XG5cdFx0XHRyZXR1cm4gYE1vdmVkICR7dmlldy5pZH0gZnJvbSAke2Zyb20uaWR9IHRvICR7dG8uaWR9XFxuYDtcblx0XHR9O1xuXG5cdFx0Y29uc3QgbG9jYXRpb25Nb3ZlU3RyaW5nID0gKHZpZXc6IElWaWV3RGVzY3JpcHRvciwgZnJvbTogVmlld0NvbnRhaW5lckxvY2F0aW9uLCB0bzogVmlld0NvbnRhaW5lckxvY2F0aW9uKSA9PiB7XG5cdFx0XHRyZXR1cm4gYE1vdmVkICR7dmlldy5pZH0gZnJvbSAke2Zyb20gPT09IFZpZXdDb250YWluZXJMb2NhdGlvbi5TaWRlYmFyID8gJ1NpZGViYXInIDogJ1BhbmVsJ30gdG8gJHt0byA9PT0gVmlld0NvbnRhaW5lckxvY2F0aW9uLlNpZGViYXIgPyAnU2lkZWJhcicgOiAnUGFuZWwnfVxcbmA7XG5cdFx0fTtcblx0XHRkaXNwb3NhYmxlcy5hZGQodGVzdE9iamVjdC5vbkRpZENoYW5nZUNvbnRhaW5lcigoeyB2aWV3cywgZnJvbSwgdG8gfSkgPT4ge1xuXHRcdFx0dmlld3MuZm9yRWFjaCh2aWV3ID0+IHtcblx0XHRcdFx0YWN0dWFsU2VxdWVuY2UgKz0gY29udGFpbmVyTW92ZVN0cmluZyh2aWV3LCBmcm9tLCB0byk7XG5cdFx0XHR9KTtcblx0XHR9KSk7XG5cblx0XHRkaXNwb3NhYmxlcy5hZGQodGVzdE9iamVjdC5vbkRpZENoYW5nZUxvY2F0aW9uKCh7IHZpZXdzLCBmcm9tLCB0byB9KSA9PiB7XG5cdFx0XHR2aWV3cy5mb3JFYWNoKHZpZXcgPT4ge1xuXHRcdFx0XHRhY3R1YWxTZXF1ZW5jZSArPSBsb2NhdGlvbk1vdmVTdHJpbmcodmlldywgZnJvbSwgdG8pO1xuXHRcdFx0fSk7XG5cdFx0fSkpO1xuXG5cdFx0Vmlld3NSZWdpc3RyeS5yZWdpc3RlclZpZXdzKHZpZXdEZXNjcmlwdG9ycy5zbGljZSgwLCAyKSwgc2lkZWJhckNvbnRhaW5lcik7XG5cdFx0Vmlld3NSZWdpc3RyeS5yZWdpc3RlclZpZXdzKHZpZXdEZXNjcmlwdG9ycy5zbGljZSgyKSwgcGFuZWxDb250YWluZXIpO1xuXG5cdFx0ZXhwZWN0ZWRTZXF1ZW5jZSArPSBsb2NhdGlvbk1vdmVTdHJpbmcodmlld0Rlc2NyaXB0b3JzWzBdLCBWaWV3Q29udGFpbmVyTG9jYXRpb24uU2lkZWJhciwgVmlld0NvbnRhaW5lckxvY2F0aW9uLlBhbmVsKTtcblx0XHR0ZXN0T2JqZWN0Lm1vdmVWaWV3VG9Mb2NhdGlvbih2aWV3RGVzY3JpcHRvcnNbMF0sIFZpZXdDb250YWluZXJMb2NhdGlvbi5QYW5lbCk7XG5cdFx0ZXhwZWN0ZWRTZXF1ZW5jZSArPSBjb250YWluZXJNb3ZlU3RyaW5nKHZpZXdEZXNjcmlwdG9yc1swXSwgc2lkZWJhckNvbnRhaW5lciwgdGVzdE9iamVjdC5nZXRWaWV3Q29udGFpbmVyQnlWaWV3SWQodmlld0Rlc2NyaXB0b3JzWzBdLmlkKSEpO1xuXG5cdFx0ZXhwZWN0ZWRTZXF1ZW5jZSArPSBsb2NhdGlvbk1vdmVTdHJpbmcodmlld0Rlc2NyaXB0b3JzWzJdLCBWaWV3Q29udGFpbmVyTG9jYXRpb24uUGFuZWwsIFZpZXdDb250YWluZXJMb2NhdGlvbi5TaWRlYmFyKTtcblx0XHR0ZXN0T2JqZWN0Lm1vdmVWaWV3VG9Mb2NhdGlvbih2aWV3RGVzY3JpcHRvcnNbMl0sIFZpZXdDb250YWluZXJMb2NhdGlvbi5TaWRlYmFyKTtcblx0XHRleHBlY3RlZFNlcXVlbmNlICs9IGNvbnRhaW5lck1vdmVTdHJpbmcodmlld0Rlc2NyaXB0b3JzWzJdLCBwYW5lbENvbnRhaW5lciwgdGVzdE9iamVjdC5nZXRWaWV3Q29udGFpbmVyQnlWaWV3SWQodmlld0Rlc2NyaXB0b3JzWzJdLmlkKSEpO1xuXG5cdFx0ZXhwZWN0ZWRTZXF1ZW5jZSArPSBsb2NhdGlvbk1vdmVTdHJpbmcodmlld0Rlc2NyaXB0b3JzWzBdLCBWaWV3Q29udGFpbmVyTG9jYXRpb24uUGFuZWwsIFZpZXdDb250YWluZXJMb2NhdGlvbi5TaWRlYmFyKTtcblx0XHRleHBlY3RlZFNlcXVlbmNlICs9IGNvbnRhaW5lck1vdmVTdHJpbmcodmlld0Rlc2NyaXB0b3JzWzBdLCB0ZXN0T2JqZWN0LmdldFZpZXdDb250YWluZXJCeVZpZXdJZCh2aWV3RGVzY3JpcHRvcnNbMF0uaWQpISwgc2lkZWJhckNvbnRhaW5lcik7XG5cdFx0dGVzdE9iamVjdC5tb3ZlVmlld3NUb0NvbnRhaW5lcihbdmlld0Rlc2NyaXB0b3JzWzBdXSwgc2lkZWJhckNvbnRhaW5lcik7XG5cblx0XHRleHBlY3RlZFNlcXVlbmNlICs9IGxvY2F0aW9uTW92ZVN0cmluZyh2aWV3RGVzY3JpcHRvcnNbMl0sIFZpZXdDb250YWluZXJMb2NhdGlvbi5TaWRlYmFyLCBWaWV3Q29udGFpbmVyTG9jYXRpb24uUGFuZWwpO1xuXHRcdGV4cGVjdGVkU2VxdWVuY2UgKz0gY29udGFpbmVyTW92ZVN0cmluZyh2aWV3RGVzY3JpcHRvcnNbMl0sIHRlc3RPYmplY3QuZ2V0Vmlld0NvbnRhaW5lckJ5Vmlld0lkKHZpZXdEZXNjcmlwdG9yc1syXS5pZCkhLCBwYW5lbENvbnRhaW5lcik7XG5cdFx0dGVzdE9iamVjdC5tb3ZlVmlld3NUb0NvbnRhaW5lcihbdmlld0Rlc2NyaXB0b3JzWzJdXSwgcGFuZWxDb250YWluZXIpO1xuXG5cdFx0ZXhwZWN0ZWRTZXF1ZW5jZSArPSBsb2NhdGlvbk1vdmVTdHJpbmcodmlld0Rlc2NyaXB0b3JzWzBdLCBWaWV3Q29udGFpbmVyTG9jYXRpb24uU2lkZWJhciwgVmlld0NvbnRhaW5lckxvY2F0aW9uLlBhbmVsKTtcblx0XHRleHBlY3RlZFNlcXVlbmNlICs9IGNvbnRhaW5lck1vdmVTdHJpbmcodmlld0Rlc2NyaXB0b3JzWzBdLCBzaWRlYmFyQ29udGFpbmVyLCBwYW5lbENvbnRhaW5lcik7XG5cdFx0dGVzdE9iamVjdC5tb3ZlVmlld3NUb0NvbnRhaW5lcihbdmlld0Rlc2NyaXB0b3JzWzBdXSwgcGFuZWxDb250YWluZXIpO1xuXG5cdFx0ZXhwZWN0ZWRTZXF1ZW5jZSArPSBsb2NhdGlvbk1vdmVTdHJpbmcodmlld0Rlc2NyaXB0b3JzWzJdLCBWaWV3Q29udGFpbmVyTG9jYXRpb24uUGFuZWwsIFZpZXdDb250YWluZXJMb2NhdGlvbi5TaWRlYmFyKTtcblx0XHRleHBlY3RlZFNlcXVlbmNlICs9IGNvbnRhaW5lck1vdmVTdHJpbmcodmlld0Rlc2NyaXB0b3JzWzJdLCBwYW5lbENvbnRhaW5lciwgc2lkZWJhckNvbnRhaW5lcik7XG5cdFx0dGVzdE9iamVjdC5tb3ZlVmlld3NUb0NvbnRhaW5lcihbdmlld0Rlc2NyaXB0b3JzWzJdXSwgc2lkZWJhckNvbnRhaW5lcik7XG5cblx0XHRleHBlY3RlZFNlcXVlbmNlICs9IGxvY2F0aW9uTW92ZVN0cmluZyh2aWV3RGVzY3JpcHRvcnNbMV0sIFZpZXdDb250YWluZXJMb2NhdGlvbi5TaWRlYmFyLCBWaWV3Q29udGFpbmVyTG9jYXRpb24uUGFuZWwpO1xuXHRcdGV4cGVjdGVkU2VxdWVuY2UgKz0gbG9jYXRpb25Nb3ZlU3RyaW5nKHZpZXdEZXNjcmlwdG9yc1syXSwgVmlld0NvbnRhaW5lckxvY2F0aW9uLlNpZGViYXIsIFZpZXdDb250YWluZXJMb2NhdGlvbi5QYW5lbCk7XG5cdFx0ZXhwZWN0ZWRTZXF1ZW5jZSArPSBjb250YWluZXJNb3ZlU3RyaW5nKHZpZXdEZXNjcmlwdG9yc1sxXSwgc2lkZWJhckNvbnRhaW5lciwgcGFuZWxDb250YWluZXIpO1xuXHRcdGV4cGVjdGVkU2VxdWVuY2UgKz0gY29udGFpbmVyTW92ZVN0cmluZyh2aWV3RGVzY3JpcHRvcnNbMl0sIHNpZGViYXJDb250YWluZXIsIHBhbmVsQ29udGFpbmVyKTtcblx0XHR0ZXN0T2JqZWN0Lm1vdmVWaWV3c1RvQ29udGFpbmVyKFt2aWV3RGVzY3JpcHRvcnNbMV0sIHZpZXdEZXNjcmlwdG9yc1syXV0sIHBhbmVsQ29udGFpbmVyKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChhY3R1YWxTZXF1ZW5jZSwgZXhwZWN0ZWRTZXF1ZW5jZSwgJ0V2ZW50IHNlcXVlbmNlIG5vdCBtYXRjaGluZyBleHBlY3RlZCBzZXF1ZW5jZScpO1xuXHR9KTtcblxuXHR0ZXN0KCdyZXNldCcsIGFzeW5jIGZ1bmN0aW9uICgpIHtcblx0XHRjb25zdCB0ZXN0T2JqZWN0ID0gYVZpZXdEZXNjcmlwdG9yU2VydmljZSgpO1xuXHRcdGNvbnN0IHZpZXdEZXNjcmlwdG9yczogSVZpZXdEZXNjcmlwdG9yW10gPSBbXG5cdFx0XHR7XG5cdFx0XHRcdGlkOiAndmlldzEnLFxuXHRcdFx0XHRjdG9yRGVzY3JpcHRvcjogbnVsbCEsXG5cdFx0XHRcdG5hbWU6IG5scy5sb2NhbGl6ZTIoJ1Rlc3QgVmlldyAxJywgJ1Rlc3QgVmlldyAxJyksXG5cdFx0XHRcdGNhbk1vdmVWaWV3OiB0cnVlLFxuXHRcdFx0XHRvcmRlcjogMVxuXHRcdFx0fSxcblx0XHRcdHtcblx0XHRcdFx0aWQ6ICd2aWV3MicsXG5cdFx0XHRcdGN0b3JEZXNjcmlwdG9yOiBudWxsISxcblx0XHRcdFx0bmFtZTogbmxzLmxvY2FsaXplMignVGVzdCBWaWV3IDInLCAnVGVzdCBWaWV3IDInKSxcblx0XHRcdFx0Y2FuTW92ZVZpZXc6IHRydWUsXG5cdFx0XHRcdG9yZGVyOiAyXG5cdFx0XHR9LFxuXHRcdFx0e1xuXHRcdFx0XHRpZDogJ3ZpZXczJyxcblx0XHRcdFx0Y3RvckRlc2NyaXB0b3I6IG51bGwhLFxuXHRcdFx0XHRuYW1lOiBubHMubG9jYWxpemUyKCdUZXN0IFZpZXcgMycsICdUZXN0IFZpZXcgMycpLFxuXHRcdFx0XHRjYW5Nb3ZlVmlldzogdHJ1ZSxcblx0XHRcdFx0b3JkZXI6IDNcblx0XHRcdH1cblx0XHRdO1xuXG5cdFx0Vmlld3NSZWdpc3RyeS5yZWdpc3RlclZpZXdzKHZpZXdEZXNjcmlwdG9ycy5zbGljZSgwLCAyKSwgc2lkZWJhckNvbnRhaW5lcik7XG5cdFx0Vmlld3NSZWdpc3RyeS5yZWdpc3RlclZpZXdzKHZpZXdEZXNjcmlwdG9ycy5zbGljZSgyKSwgcGFuZWxDb250YWluZXIpO1xuXG5cdFx0dGVzdE9iamVjdC5tb3ZlVmlld1RvTG9jYXRpb24odmlld0Rlc2NyaXB0b3JzWzBdLCBWaWV3Q29udGFpbmVyTG9jYXRpb24uUGFuZWwpO1xuXHRcdHRlc3RPYmplY3QubW92ZVZpZXdzVG9Db250YWluZXIoW3ZpZXdEZXNjcmlwdG9yc1sxXV0sIHBhbmVsQ29udGFpbmVyKTtcblx0XHR0ZXN0T2JqZWN0Lm1vdmVWaWV3VG9Mb2NhdGlvbih2aWV3RGVzY3JpcHRvcnNbMl0sIFZpZXdDb250YWluZXJMb2NhdGlvbi5TaWRlYmFyKTtcblxuXHRcdGNvbnN0IGdlbmVyYXRlZFBhbmVsID0gYXNzZXJ0UmV0dXJuc0RlZmluZWQodGVzdE9iamVjdC5nZXRWaWV3Q29udGFpbmVyQnlWaWV3SWQodmlld0Rlc2NyaXB0b3JzWzBdLmlkKSk7XG5cdFx0Y29uc3QgZ2VuZXJhdGVkU2lkZWJhciA9IGFzc2VydFJldHVybnNEZWZpbmVkKHRlc3RPYmplY3QuZ2V0Vmlld0NvbnRhaW5lckJ5Vmlld0lkKHZpZXdEZXNjcmlwdG9yc1syXS5pZCkpO1xuXG5cdFx0dGVzdE9iamVjdC5yZXNldCgpO1xuXG5cdFx0Y29uc3Qgc2lkZWJhclZpZXdzID0gdGVzdE9iamVjdC5nZXRWaWV3Q29udGFpbmVyTW9kZWwoc2lkZWJhckNvbnRhaW5lcik7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChzaWRlYmFyVmlld3MuYWxsVmlld0Rlc2NyaXB0b3JzLm1hcCh2ID0+IHYuaWQpLCBbJ3ZpZXcxJywgJ3ZpZXcyJ10pO1xuXHRcdGNvbnN0IHBhbmVsVmlld3MgPSB0ZXN0T2JqZWN0LmdldFZpZXdDb250YWluZXJNb2RlbChwYW5lbENvbnRhaW5lcik7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChwYW5lbFZpZXdzLmFsbFZpZXdEZXNjcmlwdG9ycy5tYXAodiA9PiB2LmlkKSwgWyd2aWV3MyddKTtcblxuXHRcdGNvbnN0IGFjdHVhbCA9IEpTT04ucGFyc2UoaW5zdGFudGlhdGlvblNlcnZpY2UuZ2V0KElTdG9yYWdlU2VydmljZSkuZ2V0KCd2aWV3cy5jdXN0b21pemF0aW9ucycsIFN0b3JhZ2VTY29wZS5QUk9GSUxFKSEpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoYWN0dWFsLCB7IHZpZXdDb250YWluZXJMb2NhdGlvbnM6IHt9LCB2aWV3TG9jYXRpb25zOiB7fSwgdmlld0NvbnRhaW5lckJhZGdlRW5hYmxlbWVudFN0YXRlczoge30gfSk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHRlc3RPYmplY3QuZ2V0Vmlld0NvbnRhaW5lckJ5SWQoZ2VuZXJhdGVkUGFuZWwuaWQpLCBudWxsKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHRlc3RPYmplY3QuZ2V0Vmlld0NvbnRhaW5lckJ5SWQoZ2VuZXJhdGVkU2lkZWJhci5pZCksIG51bGwpO1xuXHR9KTtcblxuXHR0ZXN0KCdpbml0aWFsaXplIHdpdGggY3VzdG9tIGxvY2F0aW9ucycsIGFzeW5jIGZ1bmN0aW9uICgpIHtcblx0XHRjb25zdCBzdG9yYWdlU2VydmljZSA9IGluc3RhbnRpYXRpb25TZXJ2aWNlLmdldChJU3RvcmFnZVNlcnZpY2UpO1xuXHRcdC8vIGVzbGludC1kaXNhYmxlLW5leHQtbGluZSBsb2NhbC9jb2RlLW5vLWFueS1jYXN0c1xuXHRcdGNvbnN0IHZpZXdDb250YWluZXIxID0gVmlld0NvbnRhaW5lcnNSZWdpc3RyeS5yZWdpc3RlclZpZXdDb250YWluZXIoeyBpZDogYCR7dmlld0NvbnRhaW5lcklkUHJlZml4fS0ke2dlbmVyYXRlVXVpZCgpfWAsIHRpdGxlOiBubHMubG9jYWxpemUyKCd0ZXN0JywgJ3Rlc3QnKSwgY3RvckRlc2NyaXB0b3I6IG5ldyBTeW5jRGVzY3JpcHRvcig8YW55Pnt9KSB9LCBWaWV3Q29udGFpbmVyTG9jYXRpb24uU2lkZWJhcik7XG5cdFx0Y29uc3QgZ2VuZXJhdGVWaWV3Q29udGFpbmVyMSA9IGB3b3JrYmVuY2gudmlld3Muc2VydmljZS4ke1ZpZXdDb250YWluZXJMb2NhdGlvblRvU3RyaW5nKFZpZXdDb250YWluZXJMb2NhdGlvbi5TaWRlYmFyKX0uJHtnZW5lcmF0ZVV1aWQoKX1gO1xuXHRcdGNvbnN0IHZpZXdzQ3VzdG9taXphdGlvbnMgPSB7XG5cdFx0XHR2aWV3Q29udGFpbmVyTG9jYXRpb25zOiB7XG5cdFx0XHRcdFtnZW5lcmF0ZVZpZXdDb250YWluZXIxXTogVmlld0NvbnRhaW5lckxvY2F0aW9uLlNpZGViYXIsXG5cdFx0XHRcdFt2aWV3Q29udGFpbmVyMS5pZF06IFZpZXdDb250YWluZXJMb2NhdGlvbi5BdXhpbGlhcnlCYXJcblx0XHRcdH0sXG5cdFx0XHR2aWV3TG9jYXRpb25zOiB7XG5cdFx0XHRcdCd2aWV3MSc6IGdlbmVyYXRlVmlld0NvbnRhaW5lcjFcblx0XHRcdH1cblx0XHR9O1xuXHRcdHN0b3JhZ2VTZXJ2aWNlLnN0b3JlKCd2aWV3cy5jdXN0b21pemF0aW9ucycsIEpTT04uc3RyaW5naWZ5KHZpZXdzQ3VzdG9taXphdGlvbnMpLCBTdG9yYWdlU2NvcGUuUFJPRklMRSwgU3RvcmFnZVRhcmdldC5VU0VSKTtcblxuXHRcdGNvbnN0IHZpZXdEZXNjcmlwdG9yczogSVZpZXdEZXNjcmlwdG9yW10gPSBbXG5cdFx0XHR7XG5cdFx0XHRcdGlkOiAndmlldzEnLFxuXHRcdFx0XHRjdG9yRGVzY3JpcHRvcjogbnVsbCEsXG5cdFx0XHRcdG5hbWU6IG5scy5sb2NhbGl6ZTIoJ1Rlc3QgVmlldyAxJywgJ1Rlc3QgVmlldyAxJyksXG5cdFx0XHRcdGNhbk1vdmVWaWV3OiB0cnVlXG5cdFx0XHR9LFxuXHRcdFx0e1xuXHRcdFx0XHRpZDogJ3ZpZXcyJyxcblx0XHRcdFx0Y3RvckRlc2NyaXB0b3I6IG51bGwhLFxuXHRcdFx0XHRuYW1lOiBubHMubG9jYWxpemUyKCdUZXN0IFZpZXcgMicsICdUZXN0IFZpZXcgMicpLFxuXHRcdFx0XHRjYW5Nb3ZlVmlldzogdHJ1ZVxuXHRcdFx0fSxcblx0XHRcdHtcblx0XHRcdFx0aWQ6ICd2aWV3MycsXG5cdFx0XHRcdGN0b3JEZXNjcmlwdG9yOiBudWxsISxcblx0XHRcdFx0bmFtZTogbmxzLmxvY2FsaXplMignVGVzdCBWaWV3IDMnLCAnVGVzdCBWaWV3IDMnKSxcblx0XHRcdFx0Y2FuTW92ZVZpZXc6IHRydWVcblx0XHRcdH0sXG5cdFx0XHR7XG5cdFx0XHRcdGlkOiAndmlldzQnLFxuXHRcdFx0XHRjdG9yRGVzY3JpcHRvcjogbnVsbCEsXG5cdFx0XHRcdG5hbWU6IG5scy5sb2NhbGl6ZTIoJ1Rlc3QgVmlldyA0JywgJ1Rlc3QgVmlldyA0JyksXG5cdFx0XHRcdGNhbk1vdmVWaWV3OiB0cnVlXG5cdFx0XHR9XG5cdFx0XTtcblxuXHRcdFZpZXdzUmVnaXN0cnkucmVnaXN0ZXJWaWV3cyh2aWV3RGVzY3JpcHRvcnMuc2xpY2UoMCwgMyksIHNpZGViYXJDb250YWluZXIpO1xuXHRcdFZpZXdzUmVnaXN0cnkucmVnaXN0ZXJWaWV3cyh2aWV3RGVzY3JpcHRvcnMuc2xpY2UoMyksIHZpZXdDb250YWluZXIxKTtcblxuXHRcdGNvbnN0IHRlc3RPYmplY3QgPSBhVmlld0Rlc2NyaXB0b3JTZXJ2aWNlKCk7XG5cblx0XHRjb25zdCBzaWRlYmFyVmlld3MgPSB0ZXN0T2JqZWN0LmdldFZpZXdDb250YWluZXJNb2RlbChzaWRlYmFyQ29udGFpbmVyKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHNpZGViYXJWaWV3cy5hbGxWaWV3RGVzY3JpcHRvcnMubWFwKHYgPT4gdi5pZCksIFsndmlldzInLCAndmlldzMnXSk7XG5cblx0XHRjb25zdCBnZW5lcmF0ZWRWaWV3Q29udGFpbmVyVmlld3MgPSB0ZXN0T2JqZWN0LmdldFZpZXdDb250YWluZXJNb2RlbCh0ZXN0T2JqZWN0LmdldFZpZXdDb250YWluZXJCeUlkKGdlbmVyYXRlVmlld0NvbnRhaW5lcjEpISk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChnZW5lcmF0ZWRWaWV3Q29udGFpbmVyVmlld3MuYWxsVmlld0Rlc2NyaXB0b3JzLm1hcCh2ID0+IHYuaWQpLCBbJ3ZpZXcxJ10pO1xuXG5cdFx0Y29uc3Qgdmlld0NvbnRhaW5lcjFWaWV3cyA9IHRlc3RPYmplY3QuZ2V0Vmlld0NvbnRhaW5lck1vZGVsKHZpZXdDb250YWluZXIxKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHRlc3RPYmplY3QuZ2V0Vmlld0NvbnRhaW5lckxvY2F0aW9uKHZpZXdDb250YWluZXIxKSwgVmlld0NvbnRhaW5lckxvY2F0aW9uLkF1eGlsaWFyeUJhcik7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh2aWV3Q29udGFpbmVyMVZpZXdzLmFsbFZpZXdEZXNjcmlwdG9ycy5tYXAodiA9PiB2LmlkKSwgWyd2aWV3NCddKTtcblx0fSk7XG5cblx0dGVzdCgnc3RvcmFnZSBjaGFuZ2UnLCBhc3luYyBmdW5jdGlvbiAoKSB7XG5cdFx0Y29uc3QgdGVzdE9iamVjdCA9IGFWaWV3RGVzY3JpcHRvclNlcnZpY2UoKTtcblxuXHRcdC8vIGVzbGludC1kaXNhYmxlLW5leHQtbGluZSBsb2NhbC9jb2RlLW5vLWFueS1jYXN0c1xuXHRcdGNvbnN0IHZpZXdDb250YWluZXIxID0gVmlld0NvbnRhaW5lcnNSZWdpc3RyeS5yZWdpc3RlclZpZXdDb250YWluZXIoeyBpZDogYCR7dmlld0NvbnRhaW5lcklkUHJlZml4fS0ke2dlbmVyYXRlVXVpZCgpfWAsIHRpdGxlOiBubHMubG9jYWxpemUyKCd0ZXN0JywgJ3Rlc3QnKSwgY3RvckRlc2NyaXB0b3I6IG5ldyBTeW5jRGVzY3JpcHRvcig8YW55Pnt9KSB9LCBWaWV3Q29udGFpbmVyTG9jYXRpb24uU2lkZWJhcik7XG5cdFx0Y29uc3QgZ2VuZXJhdGVWaWV3Q29udGFpbmVyMSA9IGB3b3JrYmVuY2gudmlld3Muc2VydmljZS4ke1ZpZXdDb250YWluZXJMb2NhdGlvblRvU3RyaW5nKFZpZXdDb250YWluZXJMb2NhdGlvbi5TaWRlYmFyKX0uJHtnZW5lcmF0ZVV1aWQoKX1gO1xuXG5cdFx0Y29uc3Qgdmlld0Rlc2NyaXB0b3JzOiBJVmlld0Rlc2NyaXB0b3JbXSA9IFtcblx0XHRcdHtcblx0XHRcdFx0aWQ6ICd2aWV3MScsXG5cdFx0XHRcdGN0b3JEZXNjcmlwdG9yOiBudWxsISxcblx0XHRcdFx0bmFtZTogbmxzLmxvY2FsaXplMignVGVzdCBWaWV3IDEnLCAnVGVzdCBWaWV3IDEnKSxcblx0XHRcdFx0Y2FuTW92ZVZpZXc6IHRydWVcblx0XHRcdH0sXG5cdFx0XHR7XG5cdFx0XHRcdGlkOiAndmlldzInLFxuXHRcdFx0XHRjdG9yRGVzY3JpcHRvcjogbnVsbCEsXG5cdFx0XHRcdG5hbWU6IG5scy5sb2NhbGl6ZTIoJ1Rlc3QgVmlldyAyJywgJ1Rlc3QgVmlldyAyJyksXG5cdFx0XHRcdGNhbk1vdmVWaWV3OiB0cnVlXG5cdFx0XHR9LFxuXHRcdFx0e1xuXHRcdFx0XHRpZDogJ3ZpZXczJyxcblx0XHRcdFx0Y3RvckRlc2NyaXB0b3I6IG51bGwhLFxuXHRcdFx0XHRuYW1lOiBubHMubG9jYWxpemUyKCdUZXN0IFZpZXcgMycsICdUZXN0IFZpZXcgMycpLFxuXHRcdFx0XHRjYW5Nb3ZlVmlldzogdHJ1ZVxuXHRcdFx0fSxcblx0XHRcdHtcblx0XHRcdFx0aWQ6ICd2aWV3NCcsXG5cdFx0XHRcdGN0b3JEZXNjcmlwdG9yOiBudWxsISxcblx0XHRcdFx0bmFtZTogbmxzLmxvY2FsaXplMignVGVzdCBWaWV3IDQnLCAnVGVzdCBWaWV3IDQnKSxcblx0XHRcdFx0Y2FuTW92ZVZpZXc6IHRydWVcblx0XHRcdH1cblx0XHRdO1xuXG5cdFx0Vmlld3NSZWdpc3RyeS5yZWdpc3RlclZpZXdzKHZpZXdEZXNjcmlwdG9ycy5zbGljZSgwLCAzKSwgc2lkZWJhckNvbnRhaW5lcik7XG5cdFx0Vmlld3NSZWdpc3RyeS5yZWdpc3RlclZpZXdzKHZpZXdEZXNjcmlwdG9ycy5zbGljZSgzKSwgdmlld0NvbnRhaW5lcjEpO1xuXG5cdFx0Y29uc3Qgdmlld3NDdXN0b21pemF0aW9ucyA9IHtcblx0XHRcdHZpZXdDb250YWluZXJMb2NhdGlvbnM6IHtcblx0XHRcdFx0W2dlbmVyYXRlVmlld0NvbnRhaW5lcjFdOiBWaWV3Q29udGFpbmVyTG9jYXRpb24uU2lkZWJhcixcblx0XHRcdFx0W3ZpZXdDb250YWluZXIxLmlkXTogVmlld0NvbnRhaW5lckxvY2F0aW9uLkF1eGlsaWFyeUJhclxuXHRcdFx0fSxcblx0XHRcdHZpZXdMb2NhdGlvbnM6IHtcblx0XHRcdFx0J3ZpZXcxJzogZ2VuZXJhdGVWaWV3Q29udGFpbmVyMVxuXHRcdFx0fVxuXHRcdH07XG5cdFx0aW5zdGFudGlhdGlvblNlcnZpY2UuZ2V0KElTdG9yYWdlU2VydmljZSkuc3RvcmUoJ3ZpZXdzLmN1c3RvbWl6YXRpb25zJywgSlNPTi5zdHJpbmdpZnkodmlld3NDdXN0b21pemF0aW9ucyksIFN0b3JhZ2VTY29wZS5QUk9GSUxFLCBTdG9yYWdlVGFyZ2V0LlVTRVIpO1xuXG5cdFx0Y29uc3Qgc2lkZWJhclZpZXdzID0gdGVzdE9iamVjdC5nZXRWaWV3Q29udGFpbmVyTW9kZWwoc2lkZWJhckNvbnRhaW5lcik7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChzaWRlYmFyVmlld3MuYWxsVmlld0Rlc2NyaXB0b3JzLm1hcCh2ID0+IHYuaWQpLCBbJ3ZpZXcyJywgJ3ZpZXczJ10pO1xuXG5cdFx0Y29uc3QgZ2VuZXJhdGVkVmlld0NvbnRhaW5lclZpZXdzID0gdGVzdE9iamVjdC5nZXRWaWV3Q29udGFpbmVyTW9kZWwodGVzdE9iamVjdC5nZXRWaWV3Q29udGFpbmVyQnlJZChnZW5lcmF0ZVZpZXdDb250YWluZXIxKSEpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoZ2VuZXJhdGVkVmlld0NvbnRhaW5lclZpZXdzLmFsbFZpZXdEZXNjcmlwdG9ycy5tYXAodiA9PiB2LmlkKSwgWyd2aWV3MSddKTtcblxuXHRcdGNvbnN0IHZpZXdDb250YWluZXIxVmlld3MgPSB0ZXN0T2JqZWN0LmdldFZpZXdDb250YWluZXJNb2RlbCh2aWV3Q29udGFpbmVyMSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh0ZXN0T2JqZWN0LmdldFZpZXdDb250YWluZXJMb2NhdGlvbih2aWV3Q29udGFpbmVyMSksIFZpZXdDb250YWluZXJMb2NhdGlvbi5BdXhpbGlhcnlCYXIpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwodmlld0NvbnRhaW5lcjFWaWV3cy5hbGxWaWV3RGVzY3JpcHRvcnMubWFwKHYgPT4gdi5pZCksIFsndmlldzQnXSk7XG5cdH0pO1xuXG5cdHRlc3QoJ29ycGhhbiB2aWV3cycsIGFzeW5jIGZ1bmN0aW9uICgpIHtcblx0XHRjb25zdCBzdG9yYWdlU2VydmljZSA9IGluc3RhbnRpYXRpb25TZXJ2aWNlLmdldChJU3RvcmFnZVNlcnZpY2UpO1xuXHRcdGNvbnN0IHZpZXdzQ3VzdG9taXphdGlvbnMgPSB7XG5cdFx0XHR2aWV3Q29udGFpbmVyTG9jYXRpb25zOiB7fSxcblx0XHRcdHZpZXdMb2NhdGlvbnM6IHtcblx0XHRcdFx0J3ZpZXcxJzogYCR7dmlld0NvbnRhaW5lcklkUHJlZml4fS0ke2dlbmVyYXRlVXVpZCgpfWBcblx0XHRcdH1cblx0XHR9O1xuXHRcdHN0b3JhZ2VTZXJ2aWNlLnN0b3JlKCd2aWV3cy5jdXN0b21pemF0aW9ucycsIEpTT04uc3RyaW5naWZ5KHZpZXdzQ3VzdG9taXphdGlvbnMpLCBTdG9yYWdlU2NvcGUuUFJPRklMRSwgU3RvcmFnZVRhcmdldC5VU0VSKTtcblxuXHRcdGNvbnN0IHZpZXdEZXNjcmlwdG9yczogSVZpZXdEZXNjcmlwdG9yW10gPSBbXG5cdFx0XHR7XG5cdFx0XHRcdGlkOiAndmlldzEnLFxuXHRcdFx0XHRjdG9yRGVzY3JpcHRvcjogbnVsbCEsXG5cdFx0XHRcdG5hbWU6IG5scy5sb2NhbGl6ZTIoJ1Rlc3QgVmlldyAxJywgJ1Rlc3QgVmlldyAxJyksXG5cdFx0XHRcdGNhbk1vdmVWaWV3OiB0cnVlLFxuXHRcdFx0XHRvcmRlcjogMVxuXHRcdFx0fSxcblx0XHRcdHtcblx0XHRcdFx0aWQ6ICd2aWV3MicsXG5cdFx0XHRcdGN0b3JEZXNjcmlwdG9yOiBudWxsISxcblx0XHRcdFx0bmFtZTogbmxzLmxvY2FsaXplMignVGVzdCBWaWV3IDInLCAnVGVzdCBWaWV3IDInKSxcblx0XHRcdFx0Y2FuTW92ZVZpZXc6IHRydWUsXG5cdFx0XHRcdG9yZGVyOiAyXG5cdFx0XHR9LFxuXHRcdFx0e1xuXHRcdFx0XHRpZDogJ3ZpZXczJyxcblx0XHRcdFx0Y3RvckRlc2NyaXB0b3I6IG51bGwhLFxuXHRcdFx0XHRuYW1lOiBubHMubG9jYWxpemUyKCdUZXN0IFZpZXcgMycsICdUZXN0IFZpZXcgMycpLFxuXHRcdFx0XHRjYW5Nb3ZlVmlldzogdHJ1ZSxcblx0XHRcdFx0b3JkZXI6IDNcblx0XHRcdH1cblx0XHRdO1xuXG5cdFx0Vmlld3NSZWdpc3RyeS5yZWdpc3RlclZpZXdzKHZpZXdEZXNjcmlwdG9ycywgc2lkZWJhckNvbnRhaW5lcik7XG5cblx0XHRjb25zdCB0ZXN0T2JqZWN0ID0gYVZpZXdEZXNjcmlwdG9yU2VydmljZSgpO1xuXG5cdFx0Y29uc3Qgc2lkZWJhclZpZXdzID0gdGVzdE9iamVjdC5nZXRWaWV3Q29udGFpbmVyTW9kZWwoc2lkZWJhckNvbnRhaW5lcik7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChzaWRlYmFyVmlld3MuYWxsVmlld0Rlc2NyaXB0b3JzLm1hcCh2ID0+IHYuaWQpLCBbJ3ZpZXcyJywgJ3ZpZXczJ10pO1xuXG5cdFx0dGVzdE9iamVjdC53aGVuRXh0ZW5zaW9uc1JlZ2lzdGVyZWQoKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHNpZGViYXJWaWV3cy5hbGxWaWV3RGVzY3JpcHRvcnMubWFwKHYgPT4gdi5pZCksIFsndmlldzEnLCAndmlldzInLCAndmlldzMnXSk7XG5cdH0pO1xuXG5cdHRlc3QoJ29ycGhhbiB2aWV3IGNvbnRhaW5lcnMnLCBhc3luYyBmdW5jdGlvbiAoKSB7XG5cdFx0Y29uc3Qgc3RvcmFnZVNlcnZpY2UgPSBpbnN0YW50aWF0aW9uU2VydmljZS5nZXQoSVN0b3JhZ2VTZXJ2aWNlKTtcblx0XHRjb25zdCBnZW5lcmF0ZWRWaWV3Q29udGFpbmVySWQgPSBgd29ya2JlbmNoLnZpZXdzLnNlcnZpY2UuJHtWaWV3Q29udGFpbmVyTG9jYXRpb25Ub1N0cmluZyhWaWV3Q29udGFpbmVyTG9jYXRpb24uU2lkZWJhcil9LiR7Z2VuZXJhdGVVdWlkKCl9YDtcblx0XHRjb25zdCB2aWV3c0N1c3RvbWl6YXRpb25zID0ge1xuXHRcdFx0dmlld0NvbnRhaW5lckxvY2F0aW9uczoge1xuXHRcdFx0XHRbZ2VuZXJhdGVkVmlld0NvbnRhaW5lcklkXTogVmlld0NvbnRhaW5lckxvY2F0aW9uLlNpZGViYXJcblx0XHRcdH0sXG5cdFx0XHR2aWV3TG9jYXRpb25zOiB7fVxuXHRcdH07XG5cdFx0c3RvcmFnZVNlcnZpY2Uuc3RvcmUoJ3ZpZXdzLmN1c3RvbWl6YXRpb25zJywgSlNPTi5zdHJpbmdpZnkodmlld3NDdXN0b21pemF0aW9ucyksIFN0b3JhZ2VTY29wZS5QUk9GSUxFLCBTdG9yYWdlVGFyZ2V0LlVTRVIpO1xuXG5cdFx0Y29uc3Qgdmlld0Rlc2NyaXB0b3JzOiBJVmlld0Rlc2NyaXB0b3JbXSA9IFtcblx0XHRcdHtcblx0XHRcdFx0aWQ6ICd2aWV3MScsXG5cdFx0XHRcdGN0b3JEZXNjcmlwdG9yOiBudWxsISxcblx0XHRcdFx0bmFtZTogbmxzLmxvY2FsaXplMignVGVzdCBWaWV3IDEnLCAnVGVzdCBWaWV3IDEnKSxcblx0XHRcdFx0Y2FuTW92ZVZpZXc6IHRydWUsXG5cdFx0XHRcdG9yZGVyOiAxXG5cdFx0XHR9XG5cdFx0XTtcblxuXHRcdFZpZXdzUmVnaXN0cnkucmVnaXN0ZXJWaWV3cyh2aWV3RGVzY3JpcHRvcnMsIHNpZGViYXJDb250YWluZXIpO1xuXG5cdFx0Y29uc3QgdGVzdE9iamVjdCA9IGFWaWV3RGVzY3JpcHRvclNlcnZpY2UoKTtcblx0XHR0ZXN0T2JqZWN0LndoZW5FeHRlbnNpb25zUmVnaXN0ZXJlZCgpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh0ZXN0T2JqZWN0LmdldFZpZXdDb250YWluZXJCeUlkKGdlbmVyYXRlZFZpZXdDb250YWluZXJJZCksIG51bGwpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwodGVzdE9iamVjdC5pc1ZpZXdDb250YWluZXJSZW1vdmVkUGVybWFuZW50bHkoZ2VuZXJhdGVkVmlld0NvbnRhaW5lcklkKSwgdHJ1ZSk7XG5cblx0XHRjb25zdCBhY3R1YWwgPSBKU09OLnBhcnNlKHN0b3JhZ2VTZXJ2aWNlLmdldCgndmlld3MuY3VzdG9taXphdGlvbnMnLCBTdG9yYWdlU2NvcGUuUFJPRklMRSkhKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGFjdHVhbCwgeyB2aWV3Q29udGFpbmVyTG9jYXRpb25zOiB7fSwgdmlld0xvY2F0aW9uczoge30sIHZpZXdDb250YWluZXJCYWRnZUVuYWJsZW1lbnRTdGF0ZXM6IHt9IH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdjdXN0b20gbG9jYXRpb25zIHRha2UgcHJlY2VkZW5jZSB3aGVuIGRlZmF1bHQgdmlldyBjb250YWluZXIgb2Ygdmlld3MgY2hhbmdlJywgYXN5bmMgZnVuY3Rpb24gKCkge1xuXHRcdGNvbnN0IHN0b3JhZ2VTZXJ2aWNlID0gaW5zdGFudGlhdGlvblNlcnZpY2UuZ2V0KElTdG9yYWdlU2VydmljZSk7XG5cdFx0Ly8gZXNsaW50LWRpc2FibGUtbmV4dC1saW5lIGxvY2FsL2NvZGUtbm8tYW55LWNhc3RzXG5cdFx0Y29uc3Qgdmlld0NvbnRhaW5lcjEgPSBWaWV3Q29udGFpbmVyc1JlZ2lzdHJ5LnJlZ2lzdGVyVmlld0NvbnRhaW5lcih7IGlkOiBgJHt2aWV3Q29udGFpbmVySWRQcmVmaXh9LSR7Z2VuZXJhdGVVdWlkKCl9YCwgdGl0bGU6IG5scy5sb2NhbGl6ZTIoJ3Rlc3QnLCAndGVzdCcpLCBjdG9yRGVzY3JpcHRvcjogbmV3IFN5bmNEZXNjcmlwdG9yKDxhbnk+e30pIH0sIFZpZXdDb250YWluZXJMb2NhdGlvbi5TaWRlYmFyKTtcblx0XHRjb25zdCBnZW5lcmF0ZVZpZXdDb250YWluZXIxID0gYHdvcmtiZW5jaC52aWV3cy5zZXJ2aWNlLiR7Vmlld0NvbnRhaW5lckxvY2F0aW9uVG9TdHJpbmcoVmlld0NvbnRhaW5lckxvY2F0aW9uLlNpZGViYXIpfS4ke2dlbmVyYXRlVXVpZCgpfWA7XG5cdFx0Y29uc3Qgdmlld3NDdXN0b21pemF0aW9ucyA9IHtcblx0XHRcdHZpZXdDb250YWluZXJMb2NhdGlvbnM6IHtcblx0XHRcdFx0W2dlbmVyYXRlVmlld0NvbnRhaW5lcjFdOiBWaWV3Q29udGFpbmVyTG9jYXRpb24uU2lkZWJhcixcblx0XHRcdFx0W3ZpZXdDb250YWluZXIxLmlkXTogVmlld0NvbnRhaW5lckxvY2F0aW9uLkF1eGlsaWFyeUJhclxuXHRcdFx0fSxcblx0XHRcdHZpZXdMb2NhdGlvbnM6IHtcblx0XHRcdFx0J3ZpZXcxJzogZ2VuZXJhdGVWaWV3Q29udGFpbmVyMVxuXHRcdFx0fVxuXHRcdH07XG5cdFx0c3RvcmFnZVNlcnZpY2Uuc3RvcmUoJ3ZpZXdzLmN1c3RvbWl6YXRpb25zJywgSlNPTi5zdHJpbmdpZnkodmlld3NDdXN0b21pemF0aW9ucyksIFN0b3JhZ2VTY29wZS5QUk9GSUxFLCBTdG9yYWdlVGFyZ2V0LlVTRVIpO1xuXG5cdFx0Y29uc3Qgdmlld0Rlc2NyaXB0b3JzOiBJVmlld0Rlc2NyaXB0b3JbXSA9IFtcblx0XHRcdHtcblx0XHRcdFx0aWQ6ICd2aWV3MScsXG5cdFx0XHRcdGN0b3JEZXNjcmlwdG9yOiBudWxsISxcblx0XHRcdFx0bmFtZTogbmxzLmxvY2FsaXplMignVGVzdCBWaWV3IDEnLCAnVGVzdCBWaWV3IDEnKSxcblx0XHRcdFx0Y2FuTW92ZVZpZXc6IHRydWVcblx0XHRcdH0sXG5cdFx0XHR7XG5cdFx0XHRcdGlkOiAndmlldzInLFxuXHRcdFx0XHRjdG9yRGVzY3JpcHRvcjogbnVsbCEsXG5cdFx0XHRcdG5hbWU6IG5scy5sb2NhbGl6ZTIoJ1Rlc3QgVmlldyAyJywgJ1Rlc3QgVmlldyAyJyksXG5cdFx0XHRcdGNhbk1vdmVWaWV3OiB0cnVlXG5cdFx0XHR9LFxuXHRcdFx0e1xuXHRcdFx0XHRpZDogJ3ZpZXczJyxcblx0XHRcdFx0Y3RvckRlc2NyaXB0b3I6IG51bGwhLFxuXHRcdFx0XHRuYW1lOiBubHMubG9jYWxpemUyKCdUZXN0IFZpZXcgMycsICdUZXN0IFZpZXcgMycpLFxuXHRcdFx0XHRjYW5Nb3ZlVmlldzogdHJ1ZVxuXHRcdFx0fSxcblx0XHRcdHtcblx0XHRcdFx0aWQ6ICd2aWV3NCcsXG5cdFx0XHRcdGN0b3JEZXNjcmlwdG9yOiBudWxsISxcblx0XHRcdFx0bmFtZTogbmxzLmxvY2FsaXplMignVGVzdCBWaWV3IDQnLCAnVGVzdCBWaWV3IDQnKSxcblx0XHRcdFx0Y2FuTW92ZVZpZXc6IHRydWVcblx0XHRcdH1cblx0XHRdO1xuXG5cdFx0Vmlld3NSZWdpc3RyeS5yZWdpc3RlclZpZXdzKHZpZXdEZXNjcmlwdG9ycy5zbGljZSgwLCAzKSwgc2lkZWJhckNvbnRhaW5lcik7XG5cdFx0Vmlld3NSZWdpc3RyeS5yZWdpc3RlclZpZXdzKHZpZXdEZXNjcmlwdG9ycy5zbGljZSgzKSwgdmlld0NvbnRhaW5lcjEpO1xuXG5cdFx0Y29uc3QgdGVzdE9iamVjdCA9IGFWaWV3RGVzY3JpcHRvclNlcnZpY2UoKTtcblx0XHRWaWV3c1JlZ2lzdHJ5Lm1vdmVWaWV3cyhbdmlld0Rlc2NyaXB0b3JzWzBdLCB2aWV3RGVzY3JpcHRvcnNbMV1dLCBwYW5lbENvbnRhaW5lcik7XG5cblx0XHRjb25zdCBzaWRlYmFyVmlld3MgPSB0ZXN0T2JqZWN0LmdldFZpZXdDb250YWluZXJNb2RlbChzaWRlYmFyQ29udGFpbmVyKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHNpZGViYXJWaWV3cy5hbGxWaWV3RGVzY3JpcHRvcnMubWFwKHYgPT4gdi5pZCksIFsndmlldzMnXSk7XG5cblx0XHRjb25zdCBwYW5lbFZpZXdzID0gdGVzdE9iamVjdC5nZXRWaWV3Q29udGFpbmVyTW9kZWwocGFuZWxDb250YWluZXIpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocGFuZWxWaWV3cy5hbGxWaWV3RGVzY3JpcHRvcnMubWFwKHYgPT4gdi5pZCksIFsndmlldzInXSk7XG5cblx0XHRjb25zdCBnZW5lcmF0ZWRWaWV3Q29udGFpbmVyVmlld3MgPSB0ZXN0T2JqZWN0LmdldFZpZXdDb250YWluZXJNb2RlbCh0ZXN0T2JqZWN0LmdldFZpZXdDb250YWluZXJCeUlkKGdlbmVyYXRlVmlld0NvbnRhaW5lcjEpISk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChnZW5lcmF0ZWRWaWV3Q29udGFpbmVyVmlld3MuYWxsVmlld0Rlc2NyaXB0b3JzLm1hcCh2ID0+IHYuaWQpLCBbJ3ZpZXcxJ10pO1xuXG5cdFx0Y29uc3Qgdmlld0NvbnRhaW5lcjFWaWV3cyA9IHRlc3RPYmplY3QuZ2V0Vmlld0NvbnRhaW5lck1vZGVsKHZpZXdDb250YWluZXIxKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHRlc3RPYmplY3QuZ2V0Vmlld0NvbnRhaW5lckxvY2F0aW9uKHZpZXdDb250YWluZXIxKSwgVmlld0NvbnRhaW5lckxvY2F0aW9uLkF1eGlsaWFyeUJhcik7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh2aWV3Q29udGFpbmVyMVZpZXdzLmFsbFZpZXdEZXNjcmlwdG9ycy5tYXAodiA9PiB2LmlkKSwgWyd2aWV3NCddKTtcblx0fSk7XG5cblx0dGVzdCgndmlldyBjb250YWluZXJzIHdpdGggbm90IGV4aXN0aW5nIHZpZXdzIGFyZSBub3QgcmVtb3ZlZCBmcm9tIGN1c3RvbWl6YXRpb25zJywgYXN5bmMgZnVuY3Rpb24gKCkge1xuXHRcdGNvbnN0IHN0b3JhZ2VTZXJ2aWNlID0gaW5zdGFudGlhdGlvblNlcnZpY2UuZ2V0KElTdG9yYWdlU2VydmljZSk7XG5cdFx0Ly8gZXNsaW50LWRpc2FibGUtbmV4dC1saW5lIGxvY2FsL2NvZGUtbm8tYW55LWNhc3RzXG5cdFx0Y29uc3Qgdmlld0NvbnRhaW5lcjEgPSBWaWV3Q29udGFpbmVyc1JlZ2lzdHJ5LnJlZ2lzdGVyVmlld0NvbnRhaW5lcih7IGlkOiBgJHt2aWV3Q29udGFpbmVySWRQcmVmaXh9LSR7Z2VuZXJhdGVVdWlkKCl9YCwgdGl0bGU6IG5scy5sb2NhbGl6ZTIoJ3Rlc3QnLCAndGVzdCcpLCBjdG9yRGVzY3JpcHRvcjogbmV3IFN5bmNEZXNjcmlwdG9yKDxhbnk+e30pIH0sIFZpZXdDb250YWluZXJMb2NhdGlvbi5TaWRlYmFyKTtcblx0XHRjb25zdCBnZW5lcmF0ZVZpZXdDb250YWluZXIxID0gYHdvcmtiZW5jaC52aWV3cy5zZXJ2aWNlLiR7Vmlld0NvbnRhaW5lckxvY2F0aW9uVG9TdHJpbmcoVmlld0NvbnRhaW5lckxvY2F0aW9uLlNpZGViYXIpfS4ke2dlbmVyYXRlVXVpZCgpfWA7XG5cdFx0Y29uc3Qgdmlld3NDdXN0b21pemF0aW9ucyA9IHtcblx0XHRcdHZpZXdDb250YWluZXJMb2NhdGlvbnM6IHtcblx0XHRcdFx0W2dlbmVyYXRlVmlld0NvbnRhaW5lcjFdOiBWaWV3Q29udGFpbmVyTG9jYXRpb24uU2lkZWJhcixcblx0XHRcdFx0W3ZpZXdDb250YWluZXIxLmlkXTogVmlld0NvbnRhaW5lckxvY2F0aW9uLkF1eGlsaWFyeUJhclxuXHRcdFx0fSxcblx0XHRcdHZpZXdMb2NhdGlvbnM6IHtcblx0XHRcdFx0J3ZpZXc1JzogZ2VuZXJhdGVWaWV3Q29udGFpbmVyMVxuXHRcdFx0fVxuXHRcdH07XG5cdFx0c3RvcmFnZVNlcnZpY2Uuc3RvcmUoJ3ZpZXdzLmN1c3RvbWl6YXRpb25zJywgSlNPTi5zdHJpbmdpZnkodmlld3NDdXN0b21pemF0aW9ucyksIFN0b3JhZ2VTY29wZS5QUk9GSUxFLCBTdG9yYWdlVGFyZ2V0LlVTRVIpO1xuXG5cdFx0Y29uc3Qgdmlld0Rlc2NyaXB0b3JzOiBJVmlld0Rlc2NyaXB0b3JbXSA9IFtcblx0XHRcdHtcblx0XHRcdFx0aWQ6ICd2aWV3MScsXG5cdFx0XHRcdGN0b3JEZXNjcmlwdG9yOiBudWxsISxcblx0XHRcdFx0bmFtZTogbmxzLmxvY2FsaXplMignVGVzdCBWaWV3IDEnLCAnVGVzdCBWaWV3IDEnKSxcblx0XHRcdFx0Y2FuTW92ZVZpZXc6IHRydWVcblx0XHRcdH1cblx0XHRdO1xuXG5cdFx0Vmlld3NSZWdpc3RyeS5yZWdpc3RlclZpZXdzKHZpZXdEZXNjcmlwdG9ycywgdmlld0NvbnRhaW5lcjEpO1xuXG5cdFx0Y29uc3QgdGVzdE9iamVjdCA9IGFWaWV3RGVzY3JpcHRvclNlcnZpY2UoKTtcblx0XHR0ZXN0T2JqZWN0LndoZW5FeHRlbnNpb25zUmVnaXN0ZXJlZCgpO1xuXG5cdFx0Y29uc3Qgdmlld0NvbnRhaW5lcjFWaWV3cyA9IHRlc3RPYmplY3QuZ2V0Vmlld0NvbnRhaW5lck1vZGVsKHZpZXdDb250YWluZXIxKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHRlc3RPYmplY3QuZ2V0Vmlld0NvbnRhaW5lckxvY2F0aW9uKHZpZXdDb250YWluZXIxKSwgVmlld0NvbnRhaW5lckxvY2F0aW9uLkF1eGlsaWFyeUJhcik7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh2aWV3Q29udGFpbmVyMVZpZXdzLmFsbFZpZXdEZXNjcmlwdG9ycy5tYXAodiA9PiB2LmlkKSwgWyd2aWV3MSddKTtcblxuXHRcdGNvbnN0IGFjdHVhbCA9IEpTT04ucGFyc2Uoc3RvcmFnZVNlcnZpY2UuZ2V0KCd2aWV3cy5jdXN0b21pemF0aW9ucycsIFN0b3JhZ2VTY29wZS5QUk9GSUxFKSEpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoYWN0dWFsLCB2aWV3c0N1c3RvbWl6YXRpb25zKTtcblx0fSk7XG5cblx0dGVzdCgnc3RvcmFnZSBjaGFuZ2UgYWxzbyB1cGRhdGVzIGxvY2F0aW9ucyBldmVuIGlmIHZpZXdzIGRvIG5vdCBleGlzdHMgYW5kIHZpZXdzIGFyZSByZWdpc3RlcmVkIGxhdGVyJywgYXN5bmMgZnVuY3Rpb24gKCkge1xuXHRcdGNvbnN0IHN0b3JhZ2VTZXJ2aWNlID0gaW5zdGFudGlhdGlvblNlcnZpY2UuZ2V0KElTdG9yYWdlU2VydmljZSk7XG5cdFx0Y29uc3QgdGVzdE9iamVjdCA9IGFWaWV3RGVzY3JpcHRvclNlcnZpY2UoKTtcblxuXHRcdGNvbnN0IGdlbmVyYXRlVmlld0NvbnRhaW5lcklkID0gYHdvcmtiZW5jaC52aWV3cy5zZXJ2aWNlLiR7Vmlld0NvbnRhaW5lckxvY2F0aW9uVG9TdHJpbmcoVmlld0NvbnRhaW5lckxvY2F0aW9uLkF1eGlsaWFyeUJhcil9LiR7Z2VuZXJhdGVVdWlkKCl9YDtcblx0XHRjb25zdCB2aWV3c0N1c3RvbWl6YXRpb25zID0ge1xuXHRcdFx0dmlld0NvbnRhaW5lckxvY2F0aW9uczoge1xuXHRcdFx0XHRbZ2VuZXJhdGVWaWV3Q29udGFpbmVySWRdOiBWaWV3Q29udGFpbmVyTG9jYXRpb24uQXV4aWxpYXJ5QmFyLFxuXHRcdFx0fSxcblx0XHRcdHZpZXdMb2NhdGlvbnM6IHtcblx0XHRcdFx0J3ZpZXcxJzogZ2VuZXJhdGVWaWV3Q29udGFpbmVySWRcblx0XHRcdH1cblx0XHR9O1xuXHRcdHN0b3JhZ2VTZXJ2aWNlLnN0b3JlKCd2aWV3cy5jdXN0b21pemF0aW9ucycsIEpTT04uc3RyaW5naWZ5KHZpZXdzQ3VzdG9taXphdGlvbnMpLCBTdG9yYWdlU2NvcGUuUFJPRklMRSwgU3RvcmFnZVRhcmdldC5VU0VSKTtcblxuXHRcdC8vIGVzbGludC1kaXNhYmxlLW5leHQtbGluZSBsb2NhbC9jb2RlLW5vLWFueS1jYXN0c1xuXHRcdGNvbnN0IHZpZXdDb250YWluZXIgPSBWaWV3Q29udGFpbmVyc1JlZ2lzdHJ5LnJlZ2lzdGVyVmlld0NvbnRhaW5lcih7IGlkOiBgJHt2aWV3Q29udGFpbmVySWRQcmVmaXh9LSR7Z2VuZXJhdGVVdWlkKCl9YCwgdGl0bGU6IG5scy5sb2NhbGl6ZTIoJ3Rlc3QnLCAndGVzdCcpLCBjdG9yRGVzY3JpcHRvcjogbmV3IFN5bmNEZXNjcmlwdG9yKDxhbnk+e30pIH0sIFZpZXdDb250YWluZXJMb2NhdGlvbi5TaWRlYmFyKTtcblx0XHRjb25zdCB2aWV3RGVzY3JpcHRvcnM6IElWaWV3RGVzY3JpcHRvcltdID0gW1xuXHRcdFx0e1xuXHRcdFx0XHRpZDogJ3ZpZXcxJyxcblx0XHRcdFx0Y3RvckRlc2NyaXB0b3I6IG51bGwhLFxuXHRcdFx0XHRuYW1lOiBubHMubG9jYWxpemUyKCdUZXN0IFZpZXcgMScsICdUZXN0IFZpZXcgMScpLFxuXHRcdFx0XHRjYW5Nb3ZlVmlldzogdHJ1ZVxuXHRcdFx0fSxcblx0XHRcdHtcblx0XHRcdFx0aWQ6ICd2aWV3MicsXG5cdFx0XHRcdGN0b3JEZXNjcmlwdG9yOiBudWxsISxcblx0XHRcdFx0bmFtZTogbmxzLmxvY2FsaXplMignVGVzdCBWaWV3IDInLCAnVGVzdCBWaWV3IDInKSxcblx0XHRcdFx0Y2FuTW92ZVZpZXc6IHRydWVcblx0XHRcdH1cblx0XHRdO1xuXHRcdFZpZXdzUmVnaXN0cnkucmVnaXN0ZXJWaWV3cyh2aWV3RGVzY3JpcHRvcnMsIHZpZXdDb250YWluZXIpO1xuXG5cdFx0dGVzdE9iamVjdC53aGVuRXh0ZW5zaW9uc1JlZ2lzdGVyZWQoKTtcblxuXHRcdGNvbnN0IHZpZXdDb250YWluZXIxVmlld3MgPSB0ZXN0T2JqZWN0LmdldFZpZXdDb250YWluZXJNb2RlbCh2aWV3Q29udGFpbmVyKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHZpZXdDb250YWluZXIxVmlld3MuYWxsVmlld0Rlc2NyaXB0b3JzLm1hcCh2ID0+IHYuaWQpLCBbJ3ZpZXcyJ10pO1xuXG5cdFx0Y29uc3QgZ2VuZXJhdGVWaWV3Q29udGFpbmVyID0gdGVzdE9iamVjdC5nZXRWaWV3Q29udGFpbmVyQnlJZChnZW5lcmF0ZVZpZXdDb250YWluZXJJZCkhO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwodGVzdE9iamVjdC5nZXRWaWV3Q29udGFpbmVyTG9jYXRpb24oZ2VuZXJhdGVWaWV3Q29udGFpbmVyKSwgVmlld0NvbnRhaW5lckxvY2F0aW9uLkF1eGlsaWFyeUJhcik7XG5cdFx0Y29uc3QgZ2VuZXJhdGVkVmlld0NvbnRhaW5lck1vZGVsID0gdGVzdE9iamVjdC5nZXRWaWV3Q29udGFpbmVyTW9kZWwoZ2VuZXJhdGVWaWV3Q29udGFpbmVyKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGdlbmVyYXRlZFZpZXdDb250YWluZXJNb2RlbC5hbGxWaWV3RGVzY3JpcHRvcnMubWFwKHYgPT4gdi5pZCksIFsndmlldzEnXSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3N0b3JhZ2UgY2hhbmdlIG1vdmUgdmlld3MgYW5kIHJldGFpbiB2aXNpYmlsaXR5IHN0YXRlJywgYXN5bmMgZnVuY3Rpb24gKCkge1xuXHRcdGNvbnN0IHN0b3JhZ2VTZXJ2aWNlID0gaW5zdGFudGlhdGlvblNlcnZpY2UuZ2V0KElTdG9yYWdlU2VydmljZSk7XG5cdFx0Y29uc3QgdGVzdE9iamVjdCA9IGFWaWV3RGVzY3JpcHRvclNlcnZpY2UoKTtcblxuXHRcdC8vIGVzbGludC1kaXNhYmxlLW5leHQtbGluZSBsb2NhbC9jb2RlLW5vLWFueS1jYXN0c1xuXHRcdGNvbnN0IHZpZXdDb250YWluZXIgPSBWaWV3Q29udGFpbmVyc1JlZ2lzdHJ5LnJlZ2lzdGVyVmlld0NvbnRhaW5lcih7IGlkOiBgJHt2aWV3Q29udGFpbmVySWRQcmVmaXh9LSR7Z2VuZXJhdGVVdWlkKCl9YCwgdGl0bGU6IG5scy5sb2NhbGl6ZTIoJ3Rlc3QnLCAndGVzdCcpLCBjdG9yRGVzY3JpcHRvcjogbmV3IFN5bmNEZXNjcmlwdG9yKDxhbnk+e30pIH0sIFZpZXdDb250YWluZXJMb2NhdGlvbi5TaWRlYmFyKTtcblx0XHRjb25zdCB2aWV3RGVzY3JpcHRvcnM6IElWaWV3RGVzY3JpcHRvcltdID0gW1xuXHRcdFx0e1xuXHRcdFx0XHRpZDogJ3ZpZXcxJyxcblx0XHRcdFx0Y3RvckRlc2NyaXB0b3I6IG51bGwhLFxuXHRcdFx0XHRuYW1lOiBubHMubG9jYWxpemUyKCdUZXN0IFZpZXcgMScsICdUZXN0IFZpZXcgMScpLFxuXHRcdFx0XHRjYW5Nb3ZlVmlldzogdHJ1ZSxcblx0XHRcdFx0Y2FuVG9nZ2xlVmlzaWJpbGl0eTogdHJ1ZVxuXHRcdFx0fSxcblx0XHRcdHtcblx0XHRcdFx0aWQ6ICd2aWV3MicsXG5cdFx0XHRcdGN0b3JEZXNjcmlwdG9yOiBudWxsISxcblx0XHRcdFx0bmFtZTogbmxzLmxvY2FsaXplMignVGVzdCBWaWV3IDInLCAnVGVzdCBWaWV3IDInKSxcblx0XHRcdFx0Y2FuTW92ZVZpZXc6IHRydWVcblx0XHRcdH1cblx0XHRdO1xuXHRcdFZpZXdzUmVnaXN0cnkucmVnaXN0ZXJWaWV3cyh2aWV3RGVzY3JpcHRvcnMsIHZpZXdDb250YWluZXIpO1xuXG5cdFx0dGVzdE9iamVjdC53aGVuRXh0ZW5zaW9uc1JlZ2lzdGVyZWQoKTtcblxuXHRcdGNvbnN0IHZpZXdDb250YWluZXIxVmlld3MgPSB0ZXN0T2JqZWN0LmdldFZpZXdDb250YWluZXJNb2RlbCh2aWV3Q29udGFpbmVyKTtcblx0XHR2aWV3Q29udGFpbmVyMVZpZXdzLnNldFZpc2libGUoJ3ZpZXcxJywgZmFsc2UpO1xuXG5cdFx0Y29uc3QgZ2VuZXJhdGVWaWV3Q29udGFpbmVySWQgPSBgd29ya2JlbmNoLnZpZXdzLnNlcnZpY2UuJHtWaWV3Q29udGFpbmVyTG9jYXRpb25Ub1N0cmluZyhWaWV3Q29udGFpbmVyTG9jYXRpb24uQXV4aWxpYXJ5QmFyKX0uJHtnZW5lcmF0ZVV1aWQoKX1gO1xuXHRcdGNvbnN0IHZpZXdzQ3VzdG9taXphdGlvbnMgPSB7XG5cdFx0XHR2aWV3Q29udGFpbmVyTG9jYXRpb25zOiB7XG5cdFx0XHRcdFtnZW5lcmF0ZVZpZXdDb250YWluZXJJZF06IFZpZXdDb250YWluZXJMb2NhdGlvbi5BdXhpbGlhcnlCYXIsXG5cdFx0XHR9LFxuXHRcdFx0dmlld0xvY2F0aW9uczoge1xuXHRcdFx0XHQndmlldzEnOiBnZW5lcmF0ZVZpZXdDb250YWluZXJJZFxuXHRcdFx0fVxuXHRcdH07XG5cdFx0c3RvcmFnZVNlcnZpY2Uuc3RvcmUoJ3ZpZXdzLmN1c3RvbWl6YXRpb25zJywgSlNPTi5zdHJpbmdpZnkodmlld3NDdXN0b21pemF0aW9ucyksIFN0b3JhZ2VTY29wZS5QUk9GSUxFLCBTdG9yYWdlVGFyZ2V0LlVTRVIpO1xuXG5cdFx0Y29uc3QgZ2VuZXJhdGVWaWV3Q29udGFpbmVyID0gdGVzdE9iamVjdC5nZXRWaWV3Q29udGFpbmVyQnlJZChnZW5lcmF0ZVZpZXdDb250YWluZXJJZCkhO1xuXHRcdGNvbnN0IGdlbmVyYXRlZFZpZXdDb250YWluZXJNb2RlbCA9IHRlc3RPYmplY3QuZ2V0Vmlld0NvbnRhaW5lck1vZGVsKGdlbmVyYXRlVmlld0NvbnRhaW5lcik7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHZpZXdDb250YWluZXIxVmlld3MuYWxsVmlld0Rlc2NyaXB0b3JzLm1hcCh2ID0+IHYuaWQpLCBbJ3ZpZXcyJ10pO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwodGVzdE9iamVjdC5nZXRWaWV3Q29udGFpbmVyTG9jYXRpb24oZ2VuZXJhdGVWaWV3Q29udGFpbmVyKSwgVmlld0NvbnRhaW5lckxvY2F0aW9uLkF1eGlsaWFyeUJhcik7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChnZW5lcmF0ZWRWaWV3Q29udGFpbmVyTW9kZWwuYWxsVmlld0Rlc2NyaXB0b3JzLm1hcCh2ID0+IHYuaWQpLCBbJ3ZpZXcxJ10pO1xuXG5cdFx0c3RvcmFnZVNlcnZpY2Uuc3RvcmUoJ3ZpZXdzLmN1c3RvbWl6YXRpb25zJywgSlNPTi5zdHJpbmdpZnkoe30pLCBTdG9yYWdlU2NvcGUuUFJPRklMRSwgU3RvcmFnZVRhcmdldC5VU0VSKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwodmlld0NvbnRhaW5lcjFWaWV3cy5hbGxWaWV3RGVzY3JpcHRvcnMubWFwKHYgPT4gdi5pZCkuc29ydCgoYSwgYikgPT4gY29tcGFyZShhLCBiKSksIFsndmlldzEnLCAndmlldzInXSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh2aWV3Q29udGFpbmVyMVZpZXdzLnZpc2libGVWaWV3RGVzY3JpcHRvcnMubWFwKHYgPT4gdi5pZCksIFsndmlldzInXSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChnZW5lcmF0ZWRWaWV3Q29udGFpbmVyTW9kZWwuYWxsVmlld0Rlc2NyaXB0b3JzLm1hcCh2ID0+IHYuaWQpLCBbXSk7XG5cdH0pO1xuXG59KTtcbiJdLAogICJtYXBwaW5ncyI6ICJBQUtBLFlBQVksU0FBUztBQUNyQixPQUFPLFlBQVk7QUFDbkIsU0FBbUUsY0FBYyx5QkFBeUIsdUJBQXNDLHFDQUFxQztBQUNyTCxTQUFTLGdCQUFnQjtBQUN6QixTQUFTLHFDQUFxQztBQUU5QyxTQUFTLHNCQUFzQjtBQUMvQixTQUFTLDZCQUE2QjtBQUN0QyxTQUFTLDRCQUE0QjtBQUNyQyxTQUFTLHlCQUF5QjtBQUNsQyxTQUFTLDBCQUEwQjtBQUNuQyxTQUFTLGlCQUFpQixjQUFjLHFCQUFxQjtBQUM3RCxTQUFTLG9CQUFvQjtBQUM3QixTQUFTLGVBQWU7QUFDeEIsU0FBUywrQ0FBK0M7QUFFeEQsTUFBTSxnQkFBZ0IsU0FBUyxHQUFtQix3QkFBd0IsYUFBYTtBQUN2RixNQUFNLHlCQUF5QixTQUFTLEdBQTRCLHdCQUF3QixzQkFBc0I7QUFDbEgsTUFBTSx3QkFBd0I7QUFFOUIsTUFBTSxtQkFBbUIsdUJBQXVCLHNCQUFzQixFQUFFLElBQUksR0FBRyxxQkFBcUIsSUFBSSxhQUFhLENBQUMsSUFBSSxPQUFPLElBQUksVUFBVSxRQUFRLE1BQU0sR0FBRyxnQkFBZ0IsSUFBSSxlQUFvQixDQUFDLENBQUMsRUFBRSxHQUFHLHNCQUFzQixPQUFPO0FBRTVPLE1BQU0saUJBQWlCLHVCQUF1QixzQkFBc0IsRUFBRSxJQUFJLEdBQUcscUJBQXFCLElBQUksYUFBYSxDQUFDLElBQUksT0FBTyxJQUFJLFVBQVUsUUFBUSxNQUFNLEdBQUcsZ0JBQWdCLElBQUksZUFBb0IsQ0FBQyxDQUFDLEVBQUUsR0FBRyxzQkFBc0IsS0FBSztBQUV4TyxN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
