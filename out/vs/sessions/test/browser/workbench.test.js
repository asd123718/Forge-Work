import assert from "assert";
import { SashState } from "../../../base/browser/ui/sash/sash.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../base/test/common/utils.js";
import { Parts } from "../../../workbench/services/layout/browser/layoutService.js";
import { DockedAuxiliaryBarController } from "../../browser/dockedAuxiliaryBarController.js";
import { Workbench } from "../../browser/workbench.js";
import { DockedEditorSizeMemento, SinglePaneWorkbench } from "../../browser/singlePaneWorkbench.js";
import { SinglePaneMainEditorPart } from "../../browser/parts/singlePaneEditorPart.js";
import { DockedEditorInput } from "../../common/dockedEditorInput.js";
import { EditorInputCapabilities } from "../../../workbench/common/editor.js";
import { SESSIONS_LIST_MINIMUM_WIDTH } from "../../browser/parts/sidebarPart.js";
import { Menus } from "../../browser/menus.js";
class TestDockedEditorInput extends DockedEditorInput {
  get typeId() {
    return "test.dockedEditor";
  }
  get resource() {
    return void 0;
  }
}
suite("Sessions - Workbench", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  const setEditorHidden = Reflect.get(Workbench.prototype, "setEditorHidden");
  const setAuxiliaryBarHidden = Reflect.get(Workbench.prototype, "setAuxiliaryBarHidden");
  const setSideBarHidden = Reflect.get(Workbench.prototype, "setSideBarHidden");
  const handleDidCloseEditor = Reflect.get(Workbench.prototype, "handleDidCloseEditor");
  const setEditorMaximized = Reflect.get(Workbench.prototype, "setEditorMaximized");
  const onEditorNodeResized = Reflect.get(SinglePaneWorkbench.prototype, "_onEditorNodeResized");
  const onGridDidChange = Reflect.get(SinglePaneWorkbench.prototype, "_onGridDidChange");
  const onEditorPartGridVisibilityChange = Reflect.get(SinglePaneWorkbench.prototype, "_onEditorPartGridVisibilityChange");
  const persistedEditorWidth = Reflect.get(SinglePaneWorkbench.prototype, "_persistedEditorWidth");
  const rememberAttachedEditorMaximizedState = Reflect.get(Workbench.prototype, "rememberAttachedEditorMaximizedState");
  const restoreAttachedEditorMaximizedState = Reflect.get(Workbench.prototype, "restoreAttachedEditorMaximizedState");
  const loadPartVisibility = Reflect.get(Workbench.prototype, "_loadPartVisibility");
  const savePartVisibility = Reflect.get(Workbench.prototype, "_savePartVisibility");
  const revealEditorOnOpen = Reflect.get(Workbench.prototype, "revealEditorOnOpen");
  const revealEditorOnOpenSinglePane = Reflect.get(SinglePaneWorkbench.prototype, "revealEditorOnOpen");
  const createDesktopGridDescriptor = Reflect.get(Workbench.prototype, "createDesktopGridDescriptor");
  const savePartSizes = Reflect.get(Workbench.prototype, "_savePartSizes");
  const isEditorPaneVisible = Workbench.prototype.isEditorPaneVisible;
  const isSinglePaneEditorPaneVisible = SinglePaneWorkbench.prototype.isEditorPaneVisible;
  const toggleSecondarySideBarSinglePane = SinglePaneWorkbench.prototype.toggleSecondarySideBar;
  const isSecondarySideBarVisibleSinglePane = SinglePaneWorkbench.prototype.isSecondarySideBarVisible;
  const toggleSidePane = SinglePaneWorkbench.prototype.toggleSidePane;
  const hideSidePane = Workbench.prototype.hideSidePane;
  const applyCustomViewGridVisibility = Reflect.get(Workbench.prototype, "_applyCustomViewGridVisibility");
  const setSessionsHidden = Reflect.get(Workbench.prototype, "setSessionsHidden");
  const setPanelHidden = Reflect.get(Workbench.prototype, "setPanelHidden");
  const updateMobileCustomViewNavigation = Reflect.get(Workbench.prototype, "_updateMobileCustomViewNavigation");
  const isVisible = Workbench.prototype.isVisible;
  const toggleSecondarySideBar = Workbench.prototype.toggleSecondarySideBar;
  const restoreSessionsPartOnActivation = Reflect.get(Workbench.prototype, "_restoreSessionsPartOnActivation");
  const restoreEditorPartOnActivation = Reflect.get(Workbench.prototype, "_restoreEditorPartOnActivation");
  const layoutSinglePaneGrid = Reflect.get(SinglePaneWorkbench.prototype, "_layoutGrid");
  const preserveSessionsEditorRatio = Reflect.get(SinglePaneWorkbench.prototype, "_preserveSessionsEditorRatio");
  function createHost(options = {}) {
    const editorPartView = { minimumWidth: 300 };
    const sessionsPartView = { minimumWidth: 300 };
    const sideBarPartView = {};
    const auxiliaryBarPartView = {};
    const panelPartView = {};
    const customViewGridPartView = {};
    const resizes = [];
    const distributions = [];
    const visibilityChanges = [];
    const events = [];
    const classToggles = [];
    const counts = { save: 0, layout: 0 };
    const sidePaneReveals = [];
    const focusedParts = [];
    const renderedCustomViews = [];
    const gridVisibility = /* @__PURE__ */ new Map();
    const mobileNavLayers = [];
    let focusedSessions = 0;
    const sidePaneToggleEvents = [];
    const notifyPartVisibility = (view, visible) => notifyPartVisibilityOn(host, view, visible);
    let editorNodeVisible = (options.partVisibility?.editor ?? false) || (options.partVisibility?.auxiliaryBar ?? true);
    let sideBarNodeVisible = options.partVisibility?.sidebar ?? true;
    const viewSizes = /* @__PURE__ */ new Map([
      [editorPartView, { width: options.editorWidth ?? 0, height: 800 }],
      [sessionsPartView, { width: options.sessionsWidth ?? 1e3, height: 800 }],
      [sideBarPartView, { width: options.sideBarWidth ?? 280, height: 800 }],
      [auxiliaryBarPartView, { width: 300, height: 800 }],
      [panelPartView, { width: 1e3, height: options.panelHeight ?? 300 }]
    ]);
    const partVisibility = { sidebar: true, auxiliaryBar: true, editor: false, panel: false, sessions: true, customViewGrid: false, ...options.partVisibility };
    const host = {
      editorPartView,
      sessionsPartView,
      sideBarPartView,
      auxiliaryBarPartView,
      panelPartView,
      customViewGridPartView,
      _editorPartContainer: void 0,
      mainContainer: { classList: { toggle: (name, force) => {
        classToggles.push({ name, force });
      } } },
      partVisibility,
      workbenchGrid: {
        width: options.windowWidth ?? 1e3,
        layout: () => {
        },
        getViewSize: (view) => viewSizes.get(view) ?? { width: 0, height: 0 },
        isViewVisible: (view) => view === editorPartView ? editorNodeVisible : true,
        hasMaximizedView: () => false,
        exitMaximizedView: () => {
        },
        setViewVisible: (view, visible, sizing) => {
          if (view === editorPartView) {
            editorNodeVisible = visible;
            if (visible && partVisibility.editor && options.panelHeightOnEditorShow !== void 0) {
              viewSizes.set(panelPartView, { width: 1e3, height: options.panelHeightOnEditorShow });
            }
          } else if (view === sideBarPartView && sideBarNodeVisible !== visible) {
            const sideBarWidth = viewSizes.get(sideBarPartView).width;
            const sessionsSize = viewSizes.get(sessionsPartView);
            viewSizes.set(sessionsPartView, {
              width: sessionsSize.width + (visible ? -sideBarWidth : sideBarWidth),
              height: sessionsSize.height
            });
            sideBarNodeVisible = visible;
          }
          gridVisibility.set(view, visible);
          visibilityChanges.push(visible);
          if (visible && sizing?.type === "distribute") {
            distributions.push(view);
          }
          notifyPartVisibility(view, visible);
        },
        resizeView: (view, size) => {
          resizes.push(size);
          viewSizes.set(view, size);
          if (view === editorPartView && partVisibility.editor && options.panelHeightOnEditorShow !== void 0) {
            viewSizes.set(panelPartView, { width: 1e3, height: options.panelHeightOnEditorShow });
          }
        }
      },
      _mainContainerDimension: { width: options.windowWidth ?? 1e3, height: 800 },
      layoutPolicy: { viewportClass: { get: () => "desktop" } },
      _hasAppliedInitialEditorSplit: options.hasAppliedInitialEditorSplit ?? false,
      _savedPartSizes: {},
      _editorRevealedExplicitly: false,
      _editorMaximized: false,
      _editorPartAutoVisibilitySuppressionCount: options.suppressionCount ?? 0,
      _restoreAttachedEditorMaximizedOnShow: false,
      _restoreSidePaneEditorMaximizedOnShow: false,
      editorGroupService: options.editorGroupService,
      paneCompositeService: {
        getActivePaneComposite: () => void 0,
        hideActivePaneComposite: () => {
        },
        getLastActivePaneCompositeId: () => void 0,
        openPaneComposite: () => {
        }
      },
      viewDescriptorService: options.viewDescriptorService ?? { getDefaultViewContainer: () => void 0 },
      // docked bookkeeping
      _dockedAuxiliaryBarWidth: options.dockedWidth ?? DockedAuxiliaryBarController.DEFAULT_WIDTH,
      _syncingEditorVisibility: false,
      _detailHiddenForEditorResize: false,
      _memento: new DockedEditorSizeMemento(),
      // stubs for the heavy base helpers the hooks call
      _savePartVisibility: () => {
        counts.save++;
      },
      _fireDidChangePartVisibility: (partId, visible, source) => {
        events.push({ partId, visible, ...source ? { source } : {} });
      },
      _onDidRevealSidePane: { fire: () => {
        sidePaneReveals.push(true);
      } },
      _onDidChangeEditorMaximized: { fire: () => {
      } },
      _onWillToggleSidePane: { fire: () => {
        sidePaneToggleEvents.push("will");
      } },
      _onDidToggleSidePane: { fire: (event) => {
        sidePaneToggleEvents.push({ did: event });
      } },
      _notifyContainerDidLayout: () => {
      },
      _layoutDockedAuxBar: () => {
        counts.layout++;
      },
      layoutMobileSidebar: () => {
      },
      ...options.editorMaximize ? {} : { setEditorMaximized: () => {
      } },
      hasFocus: (part) => options.focusedPart === part,
      focusPart: (part) => {
        focusedParts.push(part);
      },
      layout: () => {
      },
      mobileNavStack: {
        has: (layer) => mobileNavLayers.includes(layer),
        push: (layer) => {
          mobileNavLayers.push(layer);
        },
        popSilently: (layer) => {
          mobileNavLayers.splice(mobileNavLayers.indexOf(layer), 1);
        }
      },
      customViewGridPartService: { setView: (descriptor) => {
        renderedCustomViews.push(descriptor);
      }, focusActiveView: () => {
      } },
      _customViewVisibleKey: { set: () => {
      } },
      sessionsPartService: { focusSession: () => {
        focusedSessions++;
      } },
      sessionsService: { activeSession: { get: () => void 0 } },
      // captures
      resizes,
      distributions,
      visibilityChanges,
      events,
      classToggles,
      counts,
      sidePaneReveals,
      focusedParts,
      renderedCustomViews,
      gridVisibility,
      mobileNavLayers,
      sidePaneToggleEvents,
      get focusedSessions() {
        return focusedSessions;
      }
    };
    Object.setPrototypeOf(host, options.single ? SinglePaneWorkbench.prototype : Workbench.prototype);
    return host;
  }
  function notifyPartVisibilityOn(host, view, visible) {
    if (host._applyingCustomViewGridVisibility) {
      return;
    }
    if (view === host.sessionsPartView) {
      setSessionsHidden.call(host, !visible);
    } else if (view === host.panelPartView) {
      setPanelHidden.call(host, !visible);
    } else if (view === host.auxiliaryBarPartView) {
      host.setAuxiliaryBarHidden(!visible);
    }
  }
  test("activating a minimized Sessions or Editor Part resizes its sibling to minimum width", () => {
    const sessionsMinimized = createHost({ sessionsWidth: 300, editorWidth: 700, partVisibility: { editor: true } });
    const editorMinimized = createHost({ sessionsWidth: 700, editorWidth: 300, partVisibility: { editor: true } });
    const singlePaneSessionsMinimized = createHost({ single: true, sessionsWidth: 300, editorWidth: 800, dockedWidth: 250, partVisibility: { editor: true, auxiliaryBar: true } });
    const singlePaneEditorMinimized = createHost({ single: true, sessionsWidth: 700, editorWidth: 550, dockedWidth: 250, partVisibility: { editor: true, auxiliaryBar: true } });
    const neitherMinimized = createHost({ sessionsWidth: 301, editorWidth: 301, partVisibility: { editor: true } });
    const editorHidden = createHost({ sessionsWidth: 300, editorWidth: 700, partVisibility: { editor: false } });
    restoreSessionsPartOnActivation.call(sessionsMinimized);
    restoreEditorPartOnActivation.call(editorMinimized);
    restoreSessionsPartOnActivation.call(singlePaneSessionsMinimized);
    restoreEditorPartOnActivation.call(singlePaneEditorMinimized);
    restoreSessionsPartOnActivation.call(neitherMinimized);
    restoreEditorPartOnActivation.call(neitherMinimized);
    restoreSessionsPartOnActivation.call(editorHidden);
    assert.deepStrictEqual([
      sessionsMinimized.resizes,
      editorMinimized.resizes,
      singlePaneSessionsMinimized.resizes,
      singlePaneEditorMinimized.resizes,
      neitherMinimized.resizes,
      editorHidden.resizes
    ], [
      [{ width: 300, height: 800 }],
      [{ width: 300, height: 800 }],
      [{ width: 550, height: 800 }],
      [{ width: 300, height: 800 }],
      [],
      []
    ]);
  });
  test("tracks editor pane visibility across editor and auxiliary bar changes", () => {
    const host = createHost({ partVisibility: { editor: false, auxiliaryBar: true } });
    setAuxiliaryBarHidden.call(host, true);
    const hidden = isEditorPaneVisible.call(host);
    setEditorHidden.call(host, false);
    const editorVisible = isEditorPaneVisible.call(host);
    setEditorHidden.call(host, true);
    const closed = isEditorPaneVisible.call(host);
    assert.deepStrictEqual({
      hidden,
      editorVisible,
      closed,
      noEditorPaneClasses: host.classToggles.filter((toggle) => toggle.name === "noeditorpane")
    }, {
      hidden: false,
      editorVisible: true,
      closed: false,
      noEditorPaneClasses: [
        { name: "noeditorpane", force: true },
        { name: "noeditorpane", force: false },
        { name: "noeditorpane", force: true }
      ]
    });
  });
  test("reads the single-pane editor grid node visibility", () => {
    const host = createHost({ single: true, partVisibility: { editor: false, auxiliaryBar: true } });
    host.workbenchGrid.isViewVisible = () => false;
    assert.strictEqual(isSinglePaneEditorPaneVisible.call(host), false);
  });
  test("single-pane secondary sidebar toggle controls the whole side pane", () => {
    const host = createHost({ single: true, partVisibility: { editor: true, auxiliaryBar: true }, focusedPart: Parts.EDITOR_PART });
    toggleSecondarySideBarSinglePane.call(host);
    assert.deepStrictEqual({
      editorVisible: host.partVisibility.editor,
      auxiliaryBarVisible: host.partVisibility.auxiliaryBar,
      secondarySideBarVisible: isSecondarySideBarVisibleSinglePane.call(host),
      focusedParts: host.focusedParts,
      toggleEvents: host.sidePaneToggleEvents
    }, {
      editorVisible: false,
      auxiliaryBarVisible: false,
      secondarySideBarVisible: false,
      focusedParts: [Parts.SESSIONS_PART],
      toggleEvents: [
        "will",
        { did: { before: { editor: true, auxiliaryBar: true }, after: { editor: false, auxiliaryBar: false } } }
      ]
    });
  });
  test("side pane toggle restores the editor and auxiliary bar visibility from before hide", () => {
    const host = createHost({ single: true, partVisibility: { editor: true, auxiliaryBar: false } });
    toggleSidePane.call(host);
    toggleSidePane.call(host);
    assert.deepStrictEqual({
      editorVisible: host.partVisibility.editor,
      auxiliaryBarVisible: host.partVisibility.auxiliaryBar,
      revealCount: host.sidePaneReveals.length
    }, {
      editorVisible: true,
      auxiliaryBarVisible: false,
      revealCount: 1
    });
  });
  test("single-pane side pane toggle closes the whole side pane and restores maximization when reopened", () => {
    const host = createHost({ single: true, partVisibility: { editor: true, auxiliaryBar: true } });
    const maximizedStates = [];
    host._editorMaximized = true;
    host.setEditorMaximized = (maximized) => {
      maximizedStates.push(maximized);
      host._editorMaximized = maximized;
    };
    const visibleAfterHide = toggleSidePane.call(host);
    const hiddenState = {
      visible: visibleAfterHide,
      editorVisible: host.partVisibility.editor,
      auxiliaryBarVisible: host.partVisibility.auxiliaryBar,
      editorMaximized: host._editorMaximized
    };
    const visibleAfterShow = toggleSidePane.call(host);
    assert.deepStrictEqual({
      hiddenState,
      visibleAfterShow,
      restoredEditorVisible: host.partVisibility.editor,
      restoredAuxiliaryBarVisible: host.partVisibility.auxiliaryBar,
      editorMaximized: host._editorMaximized,
      maximizedStates
    }, {
      hiddenState: {
        visible: false,
        editorVisible: false,
        auxiliaryBarVisible: false,
        editorMaximized: false
      },
      visibleAfterShow: true,
      restoredEditorVisible: true,
      restoredAuxiliaryBarVisible: true,
      editorMaximized: true,
      maximizedStates: [false, true]
    });
  });
  test("updates the single-pane editor pane class after the grid node visibility changes", () => {
    const host = createHost({ single: true, partVisibility: { editor: true, auxiliaryBar: false } });
    setEditorHidden.call(host, true);
    assert.deepStrictEqual(
      host.classToggles.filter((toggle) => toggle.name === "noeditorpane"),
      [{ name: "noeditorpane", force: true }]
    );
  });
  test("applies an even editor split the first time the editor is revealed", () => {
    const host = createHost({ sessionsWidth: 1e3, windowWidth: 1e3 });
    setEditorHidden.call(host, false);
    assert.deepStrictEqual({
      editorVisible: host.partVisibility.editor,
      appliedSplit: host._hasAppliedInitialEditorSplit,
      visibilityChanges: host.visibilityChanges,
      resizes: host.resizes
    }, {
      editorVisible: true,
      appliedSplit: true,
      visibilityChanges: [true],
      resizes: [{ width: 500, height: 800 }]
    });
  });
  test("single-pane sidebar visibility leaves the editor width unchanged", () => {
    const host = createHost({ single: true, sideBarWidth: 280, editorWidth: 620, partVisibility: { sidebar: true, editor: true, auxiliaryBar: true } });
    setSideBarHidden.call(host, true);
    const widthsAfterHide = {
      sessions: host.workbenchGrid.getViewSize(host.sessionsPartView).width,
      editor: host.workbenchGrid.getViewSize(host.editorPartView).width
    };
    setSideBarHidden.call(host, false);
    assert.deepStrictEqual({
      sidebarVisible: host.partVisibility.sidebar,
      visibilityChanges: host.visibilityChanges,
      widthsAfterHide,
      sessionsWidth: host.workbenchGrid.getViewSize(host.sessionsPartView).width,
      editorWidth: host.workbenchGrid.getViewSize(host.editorPartView).width,
      resizes: host.resizes,
      layoutCount: host.counts.layout
    }, {
      sidebarVisible: true,
      visibilityChanges: [false, true],
      widthsAfterHide: { sessions: 1280, editor: 620 },
      sessionsWidth: 1e3,
      editorWidth: 620,
      resizes: [],
      layoutCount: 0
    });
  });
  test("standard layout sidebar hide does not grow the editor", () => {
    const host = createHost({ sideBarWidth: 280, editorWidth: 620, partVisibility: { sidebar: true, editor: true, auxiliaryBar: true } });
    setSideBarHidden.call(host, true);
    assert.deepStrictEqual({
      sidebarVisible: host.partVisibility.sidebar,
      visibilityChanges: host.visibilityChanges,
      resizes: host.resizes
    }, {
      sidebarVisible: false,
      visibilityChanges: [false],
      resizes: []
    });
  });
  test("single-pane sidebar visibility leaves a detail-only pane width unchanged", () => {
    const host = createHost({ single: true, sideBarWidth: 280, editorWidth: 620, dockedWidth: 300, partVisibility: { sidebar: true, editor: false, auxiliaryBar: true } });
    setSideBarHidden.call(host, true);
    setSideBarHidden.call(host, false);
    assert.deepStrictEqual({
      editorVisible: host.partVisibility.editor,
      detailWidth: host._dockedAuxiliaryBarWidth,
      resizes: host.resizes,
      layoutCount: host.counts.layout
    }, {
      editorVisible: false,
      detailWidth: 300,
      resizes: [],
      layoutCount: 0
    });
  });
  test("single-pane descriptor uses the docked detail width for a detail-only first open", () => {
    const host = createHost({ single: true, dockedWidth: 300, partVisibility: { editor: false, auxiliaryBar: true } });
    host.layoutPolicy = {
      getPartSizes: () => ({ sideBarSize: 280, auxiliaryBarSize: 340, panelSize: 300 }),
      viewportClass: { get: () => "desktop" }
    };
    host.titleBarPartView = { minimumHeight: 30 };
    const descriptor = createDesktopGridDescriptor.call(host, 1200, 800);
    const contentSection = descriptor.root.data[1];
    const rightSection = contentSection.data[1];
    const topRightSection = rightSection.data[0];
    const editorNode = topRightSection.data[1];
    assert.deepStrictEqual({ size: editorNode.size, visible: editorNode.visible }, { size: 300, visible: true });
  });
  test("single-pane container resize preserves the sessions/editor ratio", () => {
    const sessionsPartView = { minimumWidth: 300 };
    const editorPartView = { minimumWidth: 300 };
    const sizes = /* @__PURE__ */ new Map([
      [sessionsPartView, { width: 900, height: 700 }],
      [editorPartView, { width: 600, height: 700 }]
    ]);
    const resizes = [];
    const host = {
      partVisibility: { auxiliaryBar: false },
      sessionsPartView,
      editorPartView,
      workbenchGrid: {
        getViewSize: (view) => sizes.get(view),
        resizeView: (view, size) => {
          const previousEditorWidth = sizes.get(view).width;
          resizes.push(size);
          sizes.set(view, size);
          sizes.set(sessionsPartView, {
            width: sizes.get(sessionsPartView).width - (size.width - previousEditorWidth),
            height: size.height
          });
        }
      },
      _runWithEditorResizeSyncSuspended: (fn) => fn()
    };
    Object.setPrototypeOf(host, SinglePaneWorkbench.prototype);
    preserveSessionsEditorRatio.call(host, 600, 600);
    assert.deepStrictEqual({
      sessions: sizes.get(sessionsPartView),
      editor: sizes.get(editorPartView),
      resizes
    }, {
      sessions: { width: 750, height: 700 },
      editor: { width: 750, height: 700 },
      resizes: [{ width: 750, height: 700 }]
    });
  });
  test("single-pane detail-only container resize preserves the detail width", () => {
    const sessionsPartView = { minimumWidth: 300 };
    const editorPartView = { minimumWidth: 300 };
    const sizes = /* @__PURE__ */ new Map([
      [sessionsPartView, { width: 900, height: 700 }],
      [editorPartView, { width: 300, height: 700 }]
    ]);
    const resizes = [];
    const host = {
      partVisibility: { sidebar: true, editor: false, auxiliaryBar: true },
      mobileTopBarElement: void 0,
      layoutPolicy: { viewportClass: { get: () => "desktop" } },
      _mainContainerDimension: { width: 1800, height: 800 },
      sessionsPartView,
      editorPartView,
      workbenchGrid: {
        getViewSize: (view) => sizes.get(view),
        isViewVisible: () => true,
        layout: () => sizes.set(sessionsPartView, { width: 1200, height: 700 }),
        resizeView: (_view, size) => resizes.push(size)
      },
      _runWithEditorResizeSyncSuspended: (fn) => fn()
    };
    Object.setPrototypeOf(host, SinglePaneWorkbench.prototype);
    layoutSinglePaneGrid.call(host);
    assert.deepStrictEqual({
      sessions: sizes.get(sessionsPartView),
      detail: sizes.get(editorPartView),
      resizes
    }, {
      sessions: { width: 1200, height: 700 },
      detail: { width: 300, height: 700 },
      resizes: []
    });
  });
  test("single-pane descriptor retains a persisted detail-only width below the default", () => {
    const host = createHost({ single: true, dockedWidth: 220, partVisibility: { editor: false, auxiliaryBar: true } });
    host.layoutPolicy = {
      getPartSizes: () => ({ sideBarSize: 280, auxiliaryBarSize: 340, panelSize: 300 }),
      viewportClass: { get: () => "desktop" }
    };
    host.titleBarPartView = { minimumHeight: 30 };
    const descriptor = createDesktopGridDescriptor.call(host, 1200, 800);
    const contentSection = descriptor.root.data[1];
    const rightSection = contentSection.data[1];
    const topRightSection = rightSection.data[0];
    const editorNode = topRightSection.data[1];
    assert.deepStrictEqual({ size: editorNode.size, visible: editorNode.visible }, { size: 220, visible: true });
  });
  test("single-pane descriptor restores an editor-only side pane at its saved width (no detail subtraction)", () => {
    const host = createHost({ single: true, dockedWidth: 300, partVisibility: { editor: true, auxiliaryBar: false } });
    host._savedPartSizes = { editor: 900 };
    host.layoutPolicy = {
      getPartSizes: () => ({ sideBarSize: 280, auxiliaryBarSize: 340, panelSize: 300 }),
      viewportClass: { get: () => "desktop" }
    };
    host.titleBarPartView = { minimumHeight: 30 };
    const descriptor = createDesktopGridDescriptor.call(host, 1600, 800);
    const contentSection = descriptor.root.data[1];
    const rightSection = contentSection.data[1];
    const topRightSection = rightSection.data[0];
    const editorNode = topRightSection.data[1];
    assert.deepStrictEqual({ size: editorNode.size, visible: editorNode.visible }, { size: 900, visible: true });
  });
  test("single-pane descriptor falls back to the default when the saved editor width is corrupt (0 / sub-minimum)", () => {
    const build = (savedEditor) => {
      const host = createHost({ single: true, dockedWidth: 300, partVisibility: { editor: true, auxiliaryBar: false } });
      host._savedPartSizes = savedEditor === void 0 ? {} : { editor: savedEditor };
      host.layoutPolicy = {
        getPartSizes: () => ({ sideBarSize: 280, auxiliaryBarSize: 340, panelSize: 300 }),
        viewportClass: { get: () => "desktop" }
      };
      host.titleBarPartView = { minimumHeight: 30 };
      const descriptor = createDesktopGridDescriptor.call(host, 1600, 800);
      const contentSection = descriptor.root.data[1];
      const rightSection = contentSection.data[1];
      const topRightSection = rightSection.data[0];
      return topRightSection.data[1].size;
    };
    assert.deepStrictEqual({
      corruptZero: build(0),
      subMinimum: build(120),
      missing: build(void 0),
      validSaved: build(750)
    }, {
      corruptZero: 600,
      subMinimum: 600,
      missing: 600,
      validSaved: 750
    });
  });
  test("_savePartSizes persists the editor width without reading the docked aux bar from the grid (single-pane)", () => {
    const stored = {};
    const editorView = {}, sessionsView = {}, sideBarView = {}, auxView = {}, panelView = {};
    const viewSizes = /* @__PURE__ */ new Map([
      [editorView, { width: 864, height: 700 }],
      [sessionsView, { width: 618, height: 700 }],
      [sideBarView, { width: 300, height: 700 }],
      [panelView, { width: 1e3, height: 200 }]
    ]);
    const host = {
      editorPartView: editorView,
      sessionsPartView: sessionsView,
      sideBarPartView: sideBarView,
      auxiliaryBarPartView: auxView,
      panelPartView: panelView,
      partVisibility: { sidebar: true, auxiliaryBar: false, editor: true, panel: false, sessions: true },
      _savedPartSizes: { editor: 500 },
      _dockedAuxiliaryBarWidth: 300,
      _memento: new DockedEditorSizeMemento(),
      logService: void 0,
      workbenchGrid: {
        getViewSize: (view) => {
          const size = viewSizes.get(view);
          if (!size) {
            throw new Error("View not found");
          }
          return size;
        },
        getViewCachedVisibleSize: (view) => {
          if (view === auxView) {
            throw new Error("View not found");
          }
          return viewSizes.get(view)?.width;
        }
      },
      storageService: { store: (key, value) => {
        stored[key] = value;
      } }
    };
    Object.setPrototypeOf(host, SinglePaneWorkbench.prototype);
    savePartSizes.call(host);
    const sizes = JSON.parse(stored["workbench.sessions.partSizes"]);
    assert.deepStrictEqual({ editor: sizes.editor, sessions: sizes.sessions, auxiliaryBar: sizes.auxiliaryBar }, { editor: 864, sessions: 618, auxiliaryBar: 300 });
  });
  test("_savePartSizes preserves the last valid editor width when the editor is hidden with the detail visible (single-pane)", () => {
    const stored = {};
    const editorView = {}, sessionsView = {}, sideBarView = {}, auxView = {}, panelView = {};
    const viewSizes = /* @__PURE__ */ new Map([
      [editorView, { width: 300, height: 700 }],
      [sessionsView, { width: 1182, height: 700 }],
      [sideBarView, { width: 300, height: 700 }],
      [panelView, { width: 1e3, height: 200 }]
    ]);
    const host = {
      editorPartView: editorView,
      sessionsPartView: sessionsView,
      sideBarPartView: sideBarView,
      auxiliaryBarPartView: auxView,
      panelPartView: panelView,
      partVisibility: { sidebar: true, auxiliaryBar: true, editor: false, panel: false, sessions: true },
      _savedPartSizes: { editor: 520 },
      _dockedAuxiliaryBarWidth: 300,
      _memento: new DockedEditorSizeMemento(),
      logService: void 0,
      workbenchGrid: {
        getViewSize: (view) => {
          const size = viewSizes.get(view);
          if (!size) {
            throw new Error("View not found");
          }
          return size;
        },
        getViewCachedVisibleSize: (view) => {
          if (view === auxView) {
            throw new Error("View not found");
          }
          return viewSizes.get(view)?.width;
        }
      },
      storageService: { store: (key, value) => {
        stored[key] = value;
      } }
    };
    Object.setPrototypeOf(host, SinglePaneWorkbench.prototype);
    savePartSizes.call(host);
    const sizes = JSON.parse(stored["workbench.sessions.partSizes"]);
    assert.strictEqual(sizes.editor, 520);
  });
  test("showing docked detail with hidden editor restores the preferred detail width instead of cached node width", () => {
    const host = createHost({ single: true, editorWidth: 640, dockedWidth: 300, partVisibility: { editor: false, auxiliaryBar: false } });
    setAuxiliaryBarHidden.call(host, false);
    assert.deepStrictEqual({
      auxiliaryBarVisible: host.partVisibility.auxiliaryBar,
      editorVisible: host.partVisibility.editor,
      resizes: host.resizes,
      visibilityChanges: host.visibilityChanges,
      events: host.events,
      layoutCount: host.counts.layout
    }, {
      auxiliaryBarVisible: true,
      editorVisible: false,
      resizes: [{ width: 300, height: 800 }],
      visibilityChanges: [true],
      events: [{ partId: Parts.AUXILIARYBAR_PART, visible: true }],
      layoutCount: 1
    });
  });
  test("reapplying a docked width retains the exact user width in a detail-only node", () => {
    const host = createHost({ single: true, dockedWidth: 220, editorWidth: 220, partVisibility: { editor: false, auxiliaryBar: true } });
    const setDockedAuxiliaryBarWidth = SinglePaneWorkbench.prototype.setDockedAuxiliaryBarWidth;
    setDockedAuxiliaryBarWidth.call(host, 220);
    assert.deepStrictEqual({
      dockedWidth: host._dockedAuxiliaryBarWidth,
      resizes: host.resizes,
      layoutCount: host.counts.layout
    }, {
      dockedWidth: 220,
      resizes: [{ width: 220, height: 800 }],
      layoutCount: 1
    });
  });
  test("persisted editor width excludes the detail only when the detail is visible", () => {
    const withDetail = createHost({ single: true, dockedWidth: 300, partVisibility: { editor: true, auxiliaryBar: true } });
    const editorOnly = createHost({ single: true, dockedWidth: 300, partVisibility: { editor: true, auxiliaryBar: false } });
    assert.deepStrictEqual({
      withDetail: persistedEditorWidth.call(withDetail, 900),
      editorOnly: persistedEditorWidth.call(editorOnly, 900)
    }, {
      withDetail: 600,
      editorOnly: 900
    });
  });
  test("does not re-apply the even split on later editor reveals", () => {
    const host = createHost({ sessionsWidth: 1e3, hasAppliedInitialEditorSplit: true });
    setEditorHidden.call(host, false);
    assert.deepStrictEqual({
      editorVisible: host.partVisibility.editor,
      visibilityChanges: host.visibilityChanges,
      resizes: host.resizes
    }, {
      editorVisible: true,
      visibilityChanges: [true],
      resizes: []
    });
  });
  test("clamps the even editor split to a minimum width", () => {
    const host = createHost({ sessionsWidth: 400, windowWidth: 400 });
    setEditorHidden.call(host, false);
    assert.deepStrictEqual(host.resizes, [{ width: 300, height: 800 }]);
  });
  test("relayouts the docked detail panel when the editor visibility changes", () => {
    const host = createHost({ single: true, sessionsWidth: 1e3, hasAppliedInitialEditorSplit: true });
    setEditorHidden.call(host, false);
    setEditorHidden.call(host, true);
    assert.deepStrictEqual({
      layoutCount: host.counts.layout,
      visibilityChanges: host.visibilityChanges
    }, {
      layoutCount: 2,
      visibilityChanges: [true, true]
    });
  });
  test("fires editor visibility changes when docked editor content is hidden or shown", () => {
    const host = createHost({ single: true, sessionsWidth: 1e3, hasAppliedInitialEditorSplit: true, partVisibility: { editor: true, auxiliaryBar: true } });
    setEditorHidden.call(host, true);
    setEditorHidden.call(host, false);
    assert.deepStrictEqual(host.events, [
      { partId: Parts.EDITOR_PART, visible: false },
      { partId: Parts.EDITOR_PART, visible: true }
    ]);
  });
  test("maps a native sash-drag collapse of the detail-only node onto hiding the auxiliary bar, like the sessions list", () => {
    const host = createHost({ single: true, partVisibility: { editor: false, auxiliaryBar: true } });
    onEditorPartGridVisibilityChange.call(host, false);
    assert.deepStrictEqual({
      auxiliaryBarVisible: host.partVisibility.auxiliaryBar,
      events: host.events
    }, {
      auxiliaryBarVisible: false,
      events: [{ partId: Parts.AUXILIARYBAR_PART, visible: false, source: "resize" }]
    });
  });
  test("reveals the detail-only panel again when the collapsed node is dragged back open", () => {
    const host = createHost({ single: true, partVisibility: { editor: false, auxiliaryBar: true } });
    onEditorPartGridVisibilityChange.call(host, false);
    onEditorPartGridVisibilityChange.call(host, true);
    assert.deepStrictEqual({
      auxiliaryBarVisible: host.partVisibility.auxiliaryBar,
      events: host.events
    }, {
      auxiliaryBarVisible: true,
      events: [
        { partId: Parts.AUXILIARYBAR_PART, visible: false, source: "resize" },
        { partId: Parts.AUXILIARYBAR_PART, visible: true, source: "resize" }
      ]
    });
  });
  test("ignores the shared node grid visibility while editor content is visible", () => {
    const host = createHost({ single: true, partVisibility: { editor: true, auxiliaryBar: true } });
    onEditorPartGridVisibilityChange.call(host, false);
    assert.deepStrictEqual({ auxiliaryBarVisible: host.partVisibility.auxiliaryBar, events: host.events }, { auxiliaryBarVisible: true, events: [] });
  });
  test("fires onDidRevealSidePane only when the side pane transitions from fully hidden to visible", () => {
    const host = createHost({ single: true, sessionsWidth: 1e3, partVisibility: { editor: false, auxiliaryBar: false } });
    const counts = [];
    setEditorHidden.call(host, false);
    counts.push(host.sidePaneReveals.length);
    setAuxiliaryBarHidden.call(host, false);
    counts.push(host.sidePaneReveals.length);
    setAuxiliaryBarHidden.call(host, true);
    setEditorHidden.call(host, true);
    counts.push(host.sidePaneReveals.length);
    setEditorHidden.call(host, false);
    counts.push(host.sidePaneReveals.length);
    assert.deepStrictEqual(counts, [1, 1, 1, 2]);
  });
  test("fires onDidRevealSidePane once in the base layout when the side pane becomes visible", () => {
    const host = createHost({ sessionsWidth: 1e3, partVisibility: { editor: false, auxiliaryBar: false } });
    setAuxiliaryBarHidden.call(host, false);
    setEditorHidden.call(host, false);
    assert.strictEqual(host.sidePaneReveals.length, 1);
  });
  test("shrinks the docked editor node to the detail width when hiding the editor", () => {
    const host = createHost({ single: true, sessionsWidth: 1e3, hasAppliedInitialEditorSplit: true, dockedWidth: 320, editorWidth: 900, partVisibility: { editor: true, auxiliaryBar: true } });
    setEditorHidden.call(host, true);
    assert.deepStrictEqual({
      editorVisible: host.partVisibility.editor,
      visibilityChanges: host.visibilityChanges,
      resizes: host.resizes
    }, {
      editorVisible: false,
      visibilityChanges: [true],
      resizes: [{ width: 320, height: 800 }]
    });
  });
  test("retains the exact dragged detail width when hiding Editor", () => {
    const host = createHost({ single: true, sessionsWidth: 1e3, hasAppliedInitialEditorSplit: true, dockedWidth: 220, editorWidth: 900, partVisibility: { editor: true, auxiliaryBar: true } });
    setEditorHidden.call(host, true);
    assert.deepStrictEqual(host.resizes, [{ width: 220, height: 800 }]);
  });
  function createWillOpenHarness(overrides) {
    const setEditorHiddenCalls = [];
    const harness = {
      _editorPartAutoVisibilitySuppressionCount: 0,
      partVisibility: { editor: false, auxiliaryBar: false },
      editorGroupService: { mainPart: { groups: [{ id: 1 }] } },
      isRestored: () => true,
      setEditorHidden: (hidden, explicit) => setEditorHiddenCalls.push({ hidden, explicit }),
      restoreAttachedEditorMaximizedState: () => {
      },
      ...overrides
    };
    return { harness, setEditorHiddenCalls };
  }
  test("[Scenario 5] base revealEditorOnOpen reveals a hidden editor on open", () => {
    const { harness, setEditorHiddenCalls } = createWillOpenHarness({ partVisibility: { editor: false, auxiliaryBar: true } });
    revealEditorOnOpen.call(harness, { groupId: 1, editor: { typeId: "workbench.editors.files.fileEditorInput" } });
    assert.deepStrictEqual(setEditorHiddenCalls, [{ hidden: false, explicit: true }]);
  });
  test("[Scenario 5] base revealEditorOnOpen does not reveal when the open targets a non-main-part group", () => {
    const { harness, setEditorHiddenCalls } = createWillOpenHarness();
    revealEditorOnOpen.call(harness, { groupId: 99, editor: { typeId: "workbench.editors.files.fileEditorInput" } });
    assert.deepStrictEqual(setEditorHiddenCalls, []);
  });
  test("[Scenario 5] base revealEditorOnOpen does not reveal while editor-part auto-visibility is suppressed", () => {
    const { harness, setEditorHiddenCalls } = createWillOpenHarness({ _editorPartAutoVisibilitySuppressionCount: 1 });
    revealEditorOnOpen.call(harness, { groupId: 1, editor: { typeId: "workbench.editors.files.fileEditorInput" } });
    assert.deepStrictEqual(setEditorHiddenCalls, []);
  });
  test("docked editors are excluded from the editor limit (prevents managed-tab open/close loop)", () => {
    const dockedEditor = new TestDockedEditorInput();
    try {
      assert.strictEqual(dockedEditor.hasCapability(EditorInputCapabilities.ExcludeFromEditorLimit), true);
    } finally {
      dockedEditor.dispose();
    }
  });
  test("[Scenario 5] single-pane does not reveal a docked editor while the detail panel is open and the editor is closed", () => {
    const dockedEditor = new TestDockedEditorInput();
    const { harness, setEditorHiddenCalls } = createWillOpenHarness({ partVisibility: { editor: false, auxiliaryBar: true } });
    try {
      revealEditorOnOpenSinglePane.call(harness, { groupId: 1, editor: dockedEditor });
      assert.deepStrictEqual(setEditorHiddenCalls, []);
    } finally {
      dockedEditor.dispose();
    }
  });
  test("[Scenario 5] single-pane reveals a docked editor when the detail panel is closed", () => {
    const dockedEditor = new TestDockedEditorInput();
    const { harness, setEditorHiddenCalls } = createWillOpenHarness({ partVisibility: { editor: false, auxiliaryBar: false } });
    try {
      revealEditorOnOpenSinglePane.call(harness, { groupId: 1, editor: dockedEditor });
      assert.deepStrictEqual(setEditorHiddenCalls, [{ hidden: false, explicit: true }]);
    } finally {
      dockedEditor.dispose();
    }
  });
  test("[Scenario 5] single-pane reveals a non-docked editor even while the detail panel is open", () => {
    const { harness, setEditorHiddenCalls } = createWillOpenHarness({ partVisibility: { editor: false, auxiliaryBar: true } });
    revealEditorOnOpenSinglePane.call(harness, { groupId: 1, editor: { typeId: "workbench.editors.files.fileEditorInput" } });
    assert.deepStrictEqual(setEditorHiddenCalls, [{ hidden: false, explicit: true }]);
  });
  test("[reload] single-pane does not reveal Editor for restored tabs before workbench restore completes", () => {
    const { harness, setEditorHiddenCalls } = createWillOpenHarness({
      partVisibility: { editor: false, auxiliaryBar: true },
      isRestored: () => false
    });
    revealEditorOnOpenSinglePane.call(harness, { groupId: 1, editor: { typeId: "workbench.editors.files.fileEditorInput" } });
    assert.deepStrictEqual(setEditorHiddenCalls, []);
  });
  test("restores the docked editor node size when showing after hide", () => {
    const host = createHost({ single: true, sessionsWidth: 1e3, hasAppliedInitialEditorSplit: true, dockedWidth: 320, editorWidth: 900, partVisibility: { editor: true, auxiliaryBar: true } });
    setEditorHidden.call(host, true);
    setEditorHidden.call(host, false);
    assert.deepStrictEqual({
      editorVisible: host.partVisibility.editor,
      visibilityChanges: host.visibilityChanges,
      resizes: host.resizes,
      snapshot: host._memento.dockedEditorSizeBeforeHide
    }, {
      editorVisible: true,
      visibilityChanges: [true, true],
      resizes: [
        { width: 320, height: 800 },
        { width: 900, height: 800 }
      ],
      snapshot: void 0
    });
  });
  test("preserves side pane width when hiding editor before details and restoring both", () => {
    const host = createHost({ single: true, sessionsWidth: 1e3, hasAppliedInitialEditorSplit: true, dockedWidth: 300, editorWidth: 900, partVisibility: { editor: true, auxiliaryBar: true } });
    host._editorPartAutoVisibilitySuppressionCount++;
    setEditorHidden.call(host, true);
    setAuxiliaryBarHidden.call(host, true);
    setAuxiliaryBarHidden.call(host, false);
    setEditorHidden.call(host, false);
    assert.deepStrictEqual({
      persistedEditorWidth: host._savedPartSizes.editor,
      resizes: host.resizes,
      snapshot: host._memento.dockedEditorSizeBeforeHide
    }, {
      persistedEditorWidth: 600,
      resizes: [
        { width: 300, height: 800 },
        { width: 300, height: 800 },
        { width: 900, height: 800 }
      ],
      snapshot: void 0
    });
  });
  test("hideSidePane hides Editor before Details and preserves the editor width", () => {
    const host = createHost({ single: true, dockedWidth: 300, editorWidth: 900, partVisibility: { editor: true, auxiliaryBar: true } });
    hideSidePane.call(host);
    assert.deepStrictEqual({
      visibility: {
        editor: host.partVisibility.editor,
        auxiliaryBar: host.partVisibility.auxiliaryBar
      },
      hideOrder: host.events.filter((event) => !event.visible).map((event) => event.partId),
      persistedEditorWidth: host._savedPartSizes.editor
    }, {
      visibility: {
        editor: false,
        auxiliaryBar: false
      },
      hideOrder: [Parts.EDITOR_PART, Parts.AUXILIARYBAR_PART],
      persistedEditorWidth: 600
    });
  });
  test("suppresses docked editor reveal sync while hiding the editor", () => {
    const host = createHost({ single: true, sessionsWidth: 1e3, hasAppliedInitialEditorSplit: true, dockedWidth: 320, editorWidth: 900, partVisibility: { editor: true, auxiliaryBar: true } });
    const grid = host.workbenchGrid;
    const setViewVisible = grid.setViewVisible;
    grid.setViewVisible = (view, visible) => {
      setViewVisible(view, visible);
      onEditorNodeResized.call(host, 900);
    };
    setEditorHidden.call(host, true);
    assert.deepStrictEqual({
      editorVisible: host.partVisibility.editor,
      events: host.events,
      resizes: host.resizes,
      snapshot: host._memento.dockedEditorSizeBeforeHide
    }, {
      editorVisible: false,
      events: [{ partId: Parts.EDITOR_PART, visible: false }],
      resizes: [{ width: 320, height: 800 }],
      snapshot: { width: 900, height: 800 }
    });
  });
  test("restores the remembered global editor width on reveal instead of the default split (cross-session)", () => {
    const host = createHost({ single: true, sessionsWidth: 1e3, windowWidth: 1e3, hasAppliedInitialEditorSplit: true, dockedWidth: 300, editorWidth: 520, partVisibility: { editor: true, auxiliaryBar: false } });
    setEditorHidden.call(host, true);
    const rememberedWidth = host._savedPartSizes.editor;
    const resizesBeforeReveal = host.resizes.length;
    setEditorHidden.call(host, false);
    const revealResizes = host.resizes.slice(resizesBeforeReveal);
    assert.deepStrictEqual({
      rememberedWidth,
      editorVisible: host.partVisibility.editor,
      revealResizes
    }, {
      rememberedWidth: 520,
      editorVisible: true,
      revealResizes: [{ width: 520, height: 800 }]
    });
  });
  test("single-pane editor part leaves sash reset distribution to the grid while editor content is visible", () => {
    const preferredWidthGetter = Object.getOwnPropertyDescriptor(SinglePaneMainEditorPart.prototype, "preferredWidth").get;
    const preferredWidth = preferredWidthGetter.call({ layoutService: { isVisible: () => true } });
    assert.strictEqual(preferredWidth, void 0);
  });
  test("single-pane editor part preferredWidth resets to the docked detail default width instead of an equal split when editor content is hidden", () => {
    const preferredWidthGetter = Object.getOwnPropertyDescriptor(SinglePaneMainEditorPart.prototype, "preferredWidth").get;
    const preferredWidth = preferredWidthGetter.call({ layoutService: { mainContainerDimension: { width: 2e3, height: 800 }, isVisible: () => false } });
    assert.strictEqual(preferredWidth, DockedAuxiliaryBarController.DEFAULT_WIDTH);
  });
  test("single-pane editor part is a snap view only while editor content is hidden (docked detail-only)", () => {
    const snapGetter = Object.getOwnPropertyDescriptor(SinglePaneMainEditorPart.prototype, "snap").get;
    const call = (editorVisible) => snapGetter.call({ layoutService: { isVisible: () => editorVisible } });
    assert.deepStrictEqual({ editorHidden: call(false), editorVisible: call(true) }, { editorHidden: true, editorVisible: false });
  });
  test("single-pane editor part minimumWidth matches the sessions-list minimum while editor content is hidden (docked detail-only)", () => {
    const minimumWidthGetter = Object.getOwnPropertyDescriptor(SinglePaneMainEditorPart.prototype, "minimumWidth").get;
    const minimumWidth = minimumWidthGetter.call({ layoutService: { isVisible: () => false } });
    assert.strictEqual(minimumWidth, SESSIONS_LIST_MINIMUM_WIDTH);
  });
  test("single-pane editor part hosts breadcrumbs in the group header (scoped to the Agents Window)", () => {
    const getOptions = Reflect.get(SinglePaneMainEditorPart.prototype, "getGroupViewOptions");
    const options = getOptions.call({});
    assert.deepStrictEqual({
      showHeader: options.showHeader,
      headerPrimary: options.menuIds?.headerPrimary,
      headerSecondary: options.menuIds?.headerSecondary,
      headerLayout: options.menuIds?.headerLayout
    }, {
      showHeader: true,
      headerPrimary: Menus.SessionsEditorHeaderPrimary,
      headerSecondary: Menus.SessionsEditorHeaderSecondary,
      headerLayout: Menus.SessionsEditorHeaderLayout
    });
  });
  test("single-pane editor part chooses the tab override from the visible composition", () => {
    const getOverride = Reflect.get(SinglePaneMainEditorPart.prototype, "_getShowTabsOverride");
    assert.deepStrictEqual({
      auxiliaryBarOnlyMultiple: getOverride("multiple", false, true),
      auxiliaryBarOnlySingle: getOverride("single", false, true),
      auxiliaryBarOnlyNone: getOverride("none", false, true),
      editorAndAuxiliaryBarSingle: getOverride("single", true, true),
      editorOnlyNone: getOverride("none", true, false),
      fullyHiddenMultiple: getOverride("multiple", false, false)
    }, {
      auxiliaryBarOnlyMultiple: "multiple",
      auxiliaryBarOnlySingle: "multiple",
      auxiliaryBarOnlyNone: "multiple",
      editorAndAuxiliaryBarSingle: void 0,
      editorOnlyNone: "single",
      fullyHiddenMultiple: void 0
    });
  });
  test("applies an even split when revealing the docked editor with no captured width even after the initial split", () => {
    const host = createHost({ single: true, sessionsWidth: 1e3, windowWidth: 1300, hasAppliedInitialEditorSplit: true, dockedWidth: 300, editorWidth: 300, partVisibility: { editor: false, auxiliaryBar: true } });
    setEditorHidden.call(host, false);
    assert.deepStrictEqual({
      editorVisible: host.partVisibility.editor,
      visibilityChanges: host.visibilityChanges,
      distributions: host.distributions
    }, {
      editorVisible: true,
      visibilityChanges: [true],
      distributions: [host.editorPartView]
    });
  });
  test("restores a captured docked editor width instead of applying an even split", () => {
    const host = createHost({ single: true, sessionsWidth: 1e3, hasAppliedInitialEditorSplit: true, dockedWidth: 300, partVisibility: { editor: false, auxiliaryBar: true } });
    host._memento.dockedEditorSizeBeforeHide = { width: 720, height: 800 };
    setEditorHidden.call(host, false);
    assert.deepStrictEqual({
      editorVisible: host.partVisibility.editor,
      visibilityChanges: host.visibilityChanges,
      resizes: host.resizes,
      snapshot: host._memento.dockedEditorSizeBeforeHide
    }, {
      editorVisible: true,
      visibilityChanges: [true],
      resizes: [{ width: 720, height: 800 }],
      snapshot: void 0
    });
  });
  test("reopening the whole side pane even-splits instead of restoring a cramped width", () => {
    const host = createHost({ single: true, sessionsWidth: 1360, windowWidth: 1360, hasAppliedInitialEditorSplit: true, dockedWidth: 300, editorWidth: 40, partVisibility: { editor: true, auxiliaryBar: false } });
    setEditorHidden.call(host, true);
    const afterClose = {
      snapshot: host._memento.dockedEditorSizeBeforeHide,
      resizes: [...host.resizes]
    };
    setEditorHidden.call(host, false);
    assert.deepStrictEqual({
      afterClose,
      editorVisible: host.partVisibility.editor,
      distributions: host.distributions,
      snapshot: host._memento.dockedEditorSizeBeforeHide
    }, {
      afterClose: {
        snapshot: void 0,
        resizes: []
      },
      editorVisible: true,
      distributions: [host.editorPartView],
      snapshot: void 0
    });
  });
  test("does not reveal the docked editor when the grid sash widens the node while only the detail is shown", () => {
    const host = createHost({ single: true, sessionsWidth: 1e3, dockedWidth: 300, editorWidth: 305 });
    host._memento.dockedEditorSizeBeforeHide = { width: 900, height: 800 };
    onGridDidChange.call(host);
    assert.deepStrictEqual({
      editorVisible: host.partVisibility.editor,
      events: host.events,
      layoutCount: host.counts.layout,
      saveCount: host.counts.save,
      classToggles: host.classToggles,
      resizes: host.resizes,
      snapshot: host._memento.dockedEditorSizeBeforeHide
    }, {
      editorVisible: false,
      events: [],
      layoutCount: 0,
      saveCount: 0,
      classToggles: [],
      resizes: [],
      snapshot: { width: 900, height: 800 }
    });
  });
  test("does not reveal the docked editor from editor part layout width while only the detail is shown", () => {
    const host = createHost({ single: true, sessionsWidth: 1e3, dockedWidth: 300, editorWidth: 300 });
    host._memento.dockedEditorSizeBeforeHide = { width: 900, height: 800 };
    onEditorNodeResized.call(host, 305);
    assert.deepStrictEqual({
      editorVisible: host.partVisibility.editor,
      events: host.events,
      layoutCount: host.counts.layout,
      saveCount: host.counts.save,
      snapshot: host._memento.dockedEditorSizeBeforeHide
    }, {
      editorVisible: false,
      events: [],
      layoutCount: 0,
      saveCount: 0,
      snapshot: { width: 900, height: 800 }
    });
  });
  test("does not reveal the docked editor when the sash widens the node enough to fit the editor beside the detail", () => {
    const host = createHost({ single: true, sessionsWidth: 1e3, dockedWidth: 300, editorWidth: 500, partVisibility: { editor: false, auxiliaryBar: true } });
    onEditorNodeResized.call(host, 500);
    assert.deepStrictEqual({
      editorVisible: host.partVisibility.editor,
      events: host.events,
      layoutCount: host.counts.layout,
      saveCount: host.counts.save,
      classToggles: host.classToggles
    }, {
      editorVisible: false,
      events: [],
      layoutCount: 0,
      saveCount: 0,
      classToggles: []
    });
  });
  test("does not reveal the docked editor while widening the node from a grid layout change", () => {
    const host = createHost({ single: true, sessionsWidth: 1e3, dockedWidth: 300, editorWidth: 499, partVisibility: { editor: false, auxiliaryBar: true } });
    onGridDidChange.call(host);
    assert.deepStrictEqual({
      editorVisible: host.partVisibility.editor,
      events: host.events,
      layoutCount: host.counts.layout,
      saveCount: host.counts.save
    }, {
      editorVisible: false,
      events: [],
      layoutCount: 0,
      saveCount: 0
    });
  });
  test("does not reveal the docked editor from a widen while the detail is also hidden", () => {
    const host = createHost({ single: true, sessionsWidth: 1e3, dockedWidth: 300, editorWidth: 650, partVisibility: { editor: false, auxiliaryBar: false } });
    onEditorNodeResized.call(host, 650);
    assert.deepStrictEqual({
      editorVisible: host.partVisibility.editor,
      events: host.events,
      layoutCount: host.counts.layout,
      saveCount: host.counts.save
    }, {
      editorVisible: false,
      events: [],
      layoutCount: 0,
      saveCount: 0
    });
  });
  test("keeps docked editor hidden when editor part layout width leaves only detail width", () => {
    const host = createHost({ single: true, sessionsWidth: 1e3, dockedWidth: 300, editorWidth: 300 });
    onEditorNodeResized.call(host, 304);
    assert.deepStrictEqual({
      editorVisible: host.partVisibility.editor,
      events: host.events,
      layoutCount: host.counts.layout,
      saveCount: host.counts.save
    }, {
      editorVisible: false,
      events: [],
      layoutCount: 0,
      saveCount: 0
    });
  });
  test("keeps docked editor hidden when grid sash leaves only detail width", () => {
    const host = createHost({ single: true, sessionsWidth: 1e3, dockedWidth: 300, editorWidth: 300 });
    onGridDidChange.call(host);
    assert.deepStrictEqual({
      editorVisible: host.partVisibility.editor,
      events: host.events,
      layoutCount: host.counts.layout,
      saveCount: host.counts.save
    }, {
      editorVisible: false,
      events: [],
      layoutCount: 0,
      saveCount: 0
    });
  });
  test("hides details when the editor sash leaves too little room for both panes", () => {
    const host = createHost({ single: true, sessionsWidth: 1e3, dockedWidth: 300, editorWidth: 600, partVisibility: { editor: true, auxiliaryBar: true } });
    onEditorNodeResized.call(host, 599);
    assert.deepStrictEqual({
      editorVisible: host.partVisibility.editor,
      detailVisible: host.partVisibility.auxiliaryBar,
      detailHiddenForEditorResize: host._detailHiddenForEditorResize,
      events: host.events,
      layoutCount: host.counts.layout,
      saveCount: host.counts.save
    }, {
      editorVisible: true,
      detailVisible: false,
      detailHiddenForEditorResize: true,
      events: [{ partId: Parts.AUXILIARYBAR_PART, visible: false, source: "resize" }],
      layoutCount: 1,
      saveCount: 0
    });
  });
  test("shows details when the editor sash restores room after an automatic hide", () => {
    const host = createHost({ single: true, sessionsWidth: 1e3, dockedWidth: 300, editorWidth: 600, partVisibility: { editor: true, auxiliaryBar: true } });
    onEditorNodeResized.call(host, 599);
    onEditorNodeResized.call(host, 700);
    assert.deepStrictEqual({
      editorVisible: host.partVisibility.editor,
      detailVisible: host.partVisibility.auxiliaryBar,
      detailHiddenForEditorResize: host._detailHiddenForEditorResize,
      events: host.events,
      layoutCount: host.counts.layout,
      saveCount: host.counts.save
    }, {
      editorVisible: true,
      detailVisible: true,
      detailHiddenForEditorResize: false,
      events: [
        { partId: Parts.AUXILIARYBAR_PART, visible: false, source: "resize" },
        { partId: Parts.AUXILIARYBAR_PART, visible: true, source: "resize" }
      ],
      layoutCount: 2,
      saveCount: 0
    });
  });
  test("does not hide docked editor when node is squeezed but detail is also hidden", () => {
    const host = createHost({ single: true, sessionsWidth: 1e3, dockedWidth: 300, editorWidth: 600, partVisibility: { editor: true, auxiliaryBar: false } });
    onEditorNodeResized.call(host, 304);
    assert.deepStrictEqual({
      editorVisible: host.partVisibility.editor,
      events: host.events,
      layoutCount: host.counts.layout,
      saveCount: host.counts.save
    }, {
      editorVisible: true,
      events: [],
      layoutCount: 0,
      saveCount: 0
    });
  });
  test("keeps editor resize state when the outer sash hides details before collapsing the editor", () => {
    const host = createHost({ single: true, sessionsWidth: 1e3, dockedWidth: 300, editorWidth: 600, partVisibility: { editor: true, auxiliaryBar: true } });
    host._editorRevealedExplicitly = true;
    onEditorNodeResized.call(host, 300);
    assert.deepStrictEqual({
      editorVisible: host.partVisibility.editor,
      detailVisible: host.partVisibility.auxiliaryBar,
      editorRevealedExplicitly: host._editorRevealedExplicitly
    }, {
      editorVisible: true,
      detailVisible: false,
      editorRevealedExplicitly: true
    });
  });
  test("fills the narrowed docked detail node and disables its overlay sash when editor content is hidden", () => {
    const editorContainer = document.createElement("div");
    const auxiliaryBarContainer = document.createElement("div");
    const layouts = [];
    const insets = [];
    const persistedWidths = [];
    let editorVisible = true;
    let editorWidth = 800;
    Object.defineProperty(editorContainer, "clientWidth", { get: () => editorWidth });
    Object.defineProperty(editorContainer, "clientHeight", { value: 600 });
    editorContainer.getBoundingClientRect = () => ({
      width: editorWidth,
      height: 600,
      top: 0,
      right: editorWidth,
      bottom: 600,
      left: 0,
      x: 0,
      y: 0,
      toJSON: () => void 0
    });
    const auxiliaryBarPart = {
      getContainer: () => auxiliaryBarContainer,
      layout: (width, height, top, left) => {
        layouts.push({ width, height, top, left });
      }
    };
    const host = {
      getWidth: () => 260,
      setWidth: (width) => persistedWidths.push(width),
      isEditorAreaVisible: () => true,
      isEditorVisible: () => editorVisible,
      isAuxiliaryBarVisible: () => true,
      hideAuxiliaryBar: () => {
      },
      setEditorContentRightInset: (px) => insets.push(px),
      getHeaderHeight: () => 0
    };
    const controller = new DockedAuxiliaryBarController(editorContainer, auxiliaryBarPart, host);
    controller.layout();
    editorWidth = 260;
    editorVisible = false;
    controller.layout();
    const sash = Reflect.get(controller, "_sash");
    const sashLayoutProvider = Reflect.get(sash, "layoutProvider");
    assert.deepStrictEqual({
      insets,
      persistedWidths,
      layouts,
      style: {
        top: auxiliaryBarContainer.style.top,
        right: auxiliaryBarContainer.style.right,
        width: auxiliaryBarContainer.style.width,
        height: auxiliaryBarContainer.style.height
      },
      sashState: sash?.state,
      sashLeft: sashLayoutProvider.getVerticalSashLeft()
    }, {
      insets: [260, 260],
      persistedWidths: [],
      layouts: [
        { width: 260, height: 565, top: 35, left: 540 },
        { width: 260, height: 565, top: 35, left: 0 }
      ],
      style: {
        top: "35px",
        right: "0px",
        width: "260px",
        height: "565px"
      },
      // The grid sash owns resizing/collapsing here; the overlay sash must be disabled.
      sashState: SashState.Disabled,
      sashLeft: 0
    });
    controller.dispose();
  });
  test("uses persisted docked detail width when editor content is visible", () => {
    const editorContainer = document.createElement("div");
    const auxiliaryBarContainer = document.createElement("div");
    const layouts = [];
    const insets = [];
    Object.defineProperty(editorContainer, "clientWidth", { value: 800 });
    Object.defineProperty(editorContainer, "clientHeight", { value: 600 });
    editorContainer.getBoundingClientRect = () => ({
      width: 800,
      height: 600,
      top: 0,
      right: 800,
      bottom: 600,
      left: 0,
      x: 0,
      y: 0,
      toJSON: () => void 0
    });
    const auxiliaryBarPart = {
      getContainer: () => auxiliaryBarContainer,
      layout: (width, height, top, left) => {
        layouts.push({ width, height, top, left });
      }
    };
    const host = {
      getWidth: () => 260,
      setWidth: () => {
      },
      isEditorAreaVisible: () => true,
      isEditorVisible: () => true,
      isAuxiliaryBarVisible: () => true,
      hideAuxiliaryBar: () => {
      },
      setEditorContentRightInset: (px) => insets.push(px),
      getHeaderHeight: () => 0
    };
    const controller = new DockedAuxiliaryBarController(editorContainer, auxiliaryBarPart, host);
    controller.layout();
    const sash = Reflect.get(controller, "_sash");
    assert.deepStrictEqual({
      insets,
      layouts,
      style: {
        width: auxiliaryBarContainer.style.width,
        height: auxiliaryBarContainer.style.height
      },
      sashState: sash?.state
    }, {
      insets: [260],
      layouts: [{ width: 260, height: 565, top: 35, left: 540 }],
      style: {
        width: "260px",
        height: "565px"
      },
      sashState: SashState.Enabled
    });
    controller.dispose();
  });
  test("hides the docked detail panel when its sash collapses to zero width", () => {
    const editorContainer = document.createElement("div");
    const auxiliaryBarContainer = document.createElement("div");
    let hideCount = 0;
    const persistedWidths = [];
    Object.defineProperty(editorContainer, "clientWidth", { value: 800 });
    Object.defineProperty(editorContainer, "clientHeight", { value: 600 });
    editorContainer.getBoundingClientRect = () => ({
      width: 800,
      height: 600,
      top: 0,
      right: 800,
      bottom: 600,
      left: 0,
      x: 0,
      y: 0,
      toJSON: () => void 0
    });
    const auxiliaryBarPart = {
      getContainer: () => auxiliaryBarContainer,
      layout: () => {
      }
    };
    const host = {
      getWidth: () => 260,
      setWidth: (width) => persistedWidths.push(width),
      isEditorAreaVisible: () => true,
      isEditorVisible: () => true,
      isAuxiliaryBarVisible: () => true,
      hideAuxiliaryBar: () => hideCount++,
      setEditorContentRightInset: () => {
      },
      getHeaderHeight: () => 0
    };
    const controller = new DockedAuxiliaryBarController(editorContainer, auxiliaryBarPart, host);
    controller.layout();
    const sash = Reflect.get(controller, "_sash");
    const start = Reflect.get(sash, "_onDidStart");
    const change = Reflect.get(sash, "_onDidChange");
    start.fire({ startX: 0, currentX: 0, startY: 0, currentY: 0, altKey: false });
    change.fire({ startX: 0, currentX: 270, startY: 0, currentY: 0, altKey: false });
    assert.deepStrictEqual({ hideCount, persistedWidths }, { hideCount: 1, persistedWidths: [] });
    controller.dispose();
  });
  test("docked last editor close is delegated to the lifecycle strategy", () => {
    const editorHiddenCalls = [];
    const auxHiddenCalls = [];
    const host = createHost({ single: true, partVisibility: { editor: true, auxiliaryBar: true }, editorGroupService: { mainPart: { groups: [{ isEmpty: true }] } } });
    host.setEditorHidden = (hidden) => {
      editorHiddenCalls.push({ hidden, suppression: host._editorPartAutoVisibilitySuppressionCount });
      host.partVisibility.editor = !hidden;
    };
    host.setAuxiliaryBarHidden = (hidden) => {
      auxHiddenCalls.push({ hidden, suppression: host._editorPartAutoVisibilitySuppressionCount });
      host.partVisibility.auxiliaryBar = !hidden;
    };
    handleDidCloseEditor.call(host);
    assert.deepStrictEqual({
      editorHiddenCalls,
      auxHiddenCalls,
      visibility: host.partVisibility,
      suppression: host._editorPartAutoVisibilitySuppressionCount
    }, {
      editorHiddenCalls: [],
      auxHiddenCalls: [],
      visibility: {
        sidebar: true,
        auxiliaryBar: true,
        editor: true,
        panel: false,
        sessions: true,
        customViewGrid: false
      },
      suppression: 0
    });
  });
  test("docked last editor close leaves a detail-only composition to the lifecycle strategy", () => {
    const editorHiddenCalls = [];
    const auxHiddenCalls = [];
    const host = createHost({ single: true, partVisibility: { editor: false, auxiliaryBar: true }, editorGroupService: { mainPart: { groups: [{ isEmpty: true }] } } });
    host.setEditorHidden = (hidden) => {
      editorHiddenCalls.push(hidden);
      host.partVisibility.editor = !hidden;
    };
    host.setAuxiliaryBarHidden = (hidden) => {
      auxHiddenCalls.push({ hidden, suppression: host._editorPartAutoVisibilitySuppressionCount });
      host.partVisibility.auxiliaryBar = !hidden;
    };
    handleDidCloseEditor.call(host);
    assert.deepStrictEqual({
      editorHiddenCalls,
      auxHiddenCalls,
      editorVisible: host.partVisibility.editor,
      auxiliaryBarVisible: host.partVisibility.auxiliaryBar
    }, {
      editorHiddenCalls: [],
      auxHiddenCalls: [],
      editorVisible: false,
      auxiliaryBarVisible: true
    });
  });
  function createWorkbenchHarness() {
    return {
      partVisibility: { sidebar: true, auxiliaryBar: true, editor: true, panel: false, sessions: true },
      layoutPolicy: { viewportClass: { get: () => "desktop" } },
      storageService: { store: () => {
      } },
      _editorPartAutoVisibilitySuppressionCount: 0,
      _editorMaximized: false,
      _restoreAttachedEditorMaximizedOnShow: false,
      setEditorMaximized: () => {
      },
      _savePartVisibility: () => {
      }
    };
  }
  test("restores attached editor maximized state when the auxiliary bar stays visible", () => {
    const maximizedStates = [];
    const workbench = createWorkbenchHarness();
    workbench._editorMaximized = true;
    workbench.setEditorMaximized = (maximized) => maximizedStates.push(maximized);
    rememberAttachedEditorMaximizedState.call(workbench);
    workbench._editorMaximized = false;
    restoreAttachedEditorMaximizedState.call(workbench);
    assert.deepStrictEqual(maximizedStates, [true]);
    assert.strictEqual(workbench._restoreAttachedEditorMaximizedOnShow, false);
  });
  test("does not restore attached editor maximized state once the auxiliary bar is hidden", () => {
    const maximizedStates = [];
    const workbench = createWorkbenchHarness();
    workbench._editorMaximized = true;
    workbench.setEditorMaximized = (maximized) => maximizedStates.push(maximized);
    rememberAttachedEditorMaximizedState.call(workbench);
    workbench._editorMaximized = false;
    workbench.partVisibility.auxiliaryBar = false;
    restoreAttachedEditorMaximizedState.call(workbench);
    assert.deepStrictEqual(maximizedStates, []);
    assert.strictEqual(workbench._restoreAttachedEditorMaximizedOnShow, false);
  });
  test("does not restore after the auxiliary bar is hidden and shown again before reopen", () => {
    const maximizedStates = [];
    const host = createHost({ single: true, partVisibility: { editor: true, auxiliaryBar: true } });
    host._editorMaximized = true;
    host.setEditorMaximized = (maximized) => maximizedStates.push(maximized);
    rememberAttachedEditorMaximizedState.call(host);
    setAuxiliaryBarHidden.call(host, true);
    setAuxiliaryBarHidden.call(host, false);
    host._editorMaximized = false;
    restoreAttachedEditorMaximizedState.call(host);
    assert.deepStrictEqual(maximizedStates, []);
    assert.strictEqual(host._restoreAttachedEditorMaximizedOnShow, false);
  });
  test("docked auxiliary bar hide reveals hidden editor content", () => {
    const editorHiddenCalls = [];
    const host = createHost({ single: true, partVisibility: { editor: false, auxiliaryBar: true } });
    host.setEditorHidden = (hidden) => {
      editorHiddenCalls.push(hidden);
      host.partVisibility.editor = !hidden;
    };
    setAuxiliaryBarHidden.call(host, true);
    assert.deepStrictEqual({
      editorHiddenCalls,
      editorVisible: host.partVisibility.editor,
      auxiliaryBarVisible: host.partVisibility.auxiliaryBar,
      gridVisible: host.visibilityChanges
    }, {
      editorHiddenCalls: [false],
      editorVisible: true,
      auxiliaryBarVisible: false,
      gridVisible: [true]
    });
  });
  test("docked auxiliary bar hide does not reveal editor while side pane toggle is suppressed", () => {
    const editorHiddenCalls = [];
    const host = createHost({ single: true, suppressionCount: 1, partVisibility: { editor: false, auxiliaryBar: true } });
    host.setEditorHidden = (hidden) => {
      editorHiddenCalls.push(hidden);
      host.partVisibility.editor = !hidden;
    };
    setAuxiliaryBarHidden.call(host, true);
    assert.deepStrictEqual({
      editorHiddenCalls,
      editorVisible: host.partVisibility.editor,
      auxiliaryBarVisible: host.partVisibility.auxiliaryBar,
      gridVisible: host.visibilityChanges
    }, {
      editorHiddenCalls: [],
      editorVisible: false,
      auxiliaryBarVisible: false,
      gridVisible: [false]
    });
  });
  test("docked auxiliary bar show does not force-open an empty (gated-off) container", () => {
    const openedContainers = [];
    const host = createHost({
      single: true,
      partVisibility: { editor: true, auxiliaryBar: false },
      viewDescriptorService: {
        getDefaultViewContainer: () => ({ id: "empty.container" }),
        getViewContainerById: () => ({ hideIfEmpty: true }),
        getViewContainerModel: () => ({ activeViewDescriptors: [] })
      }
    });
    host.paneCompositeService.openPaneComposite = (id) => {
      openedContainers.push(id);
    };
    setAuxiliaryBarHidden.call(host, false);
    assert.deepStrictEqual(openedContainers, [], "must not force-open an empty container in docked mode");
  });
  test("docked auxiliary bar show opens a container that has active views", () => {
    const openedContainers = [];
    const host = createHost({
      single: true,
      partVisibility: { editor: true, auxiliaryBar: false },
      viewDescriptorService: {
        getDefaultViewContainer: () => ({ id: "active.container" }),
        getViewContainerById: () => ({ hideIfEmpty: true }),
        getViewContainerModel: () => ({ activeViewDescriptors: [{}] })
      }
    });
    host.paneCompositeService.openPaneComposite = (id) => {
      openedContainers.push(id);
    };
    setAuxiliaryBarHidden.call(host, false);
    assert.deepStrictEqual(openedContainers, ["active.container"], "must open a container that has active views");
  });
  test("restores editor size and auxiliary bar visibility when un-maximizing", () => {
    const editorPartView = {};
    const resizes = [];
    const auxiliaryBarHiddenCalls = [];
    let editorSize = { width: 700, height: 800 };
    const harness = {
      partVisibility: { sidebar: true, auxiliaryBar: false, editor: true, panel: false, sessions: true },
      editorPartView,
      workbenchGrid: {
        getViewSize: () => editorSize,
        resizeView: (_view, size) => {
          resizes.push(size);
          editorSize = size;
        }
      },
      _editorMaximized: false,
      _onDidChangeEditorMaximized: { fire: () => {
      } },
      _layoutSidePane: () => {
      },
      setEditorHidden: () => {
      },
      setSideBarHidden: (hidden) => {
        harness.partVisibility.sidebar = !hidden;
      },
      setSessionsHidden: (hidden) => {
        harness.partVisibility.sessions = !hidden;
      },
      setAuxiliaryBarHidden: (hidden) => {
        auxiliaryBarHiddenCalls.push(hidden);
        harness.partVisibility.auxiliaryBar = !hidden;
      }
    };
    setEditorMaximized.call(harness, true);
    harness.partVisibility.auxiliaryBar = true;
    editorSize = { width: 500, height: 800 };
    setEditorMaximized.call(harness, false);
    assert.deepStrictEqual({
      auxiliaryBarHiddenCalls,
      resizes,
      auxiliaryBarVisible: harness.partVisibility.auxiliaryBar,
      sidebarVisible: harness.partVisibility.sidebar,
      sessionsVisible: harness.partVisibility.sessions
    }, {
      auxiliaryBarHiddenCalls: [true],
      resizes: [{ width: 700, height: 800 }],
      auxiliaryBarVisible: false,
      sidebarVisible: true,
      sessionsVisible: true
    });
  });
  test("single-pane restores the bottom panel height after navigating through Quick Chat", () => {
    const singlePane = createHost({ single: true, panelHeight: 520, panelHeightOnEditorShow: 77, partVisibility: { panel: true, editor: true, auxiliaryBar: true } });
    singlePane._editorPartAutoVisibilitySuppressionCount = 1;
    setPanelHidden.call(singlePane, true);
    setEditorHidden.call(singlePane, true);
    singlePane.setAuxiliaryBarHidden(true);
    singlePane._editorPartAutoVisibilitySuppressionCount = 0;
    setPanelHidden.call(singlePane, false);
    singlePane.setAuxiliaryBarHidden(false);
    setEditorHidden.call(singlePane, false);
    assert.strictEqual(singlePane.workbenchGrid.getViewSize(singlePane.panelPartView).height, 520);
  });
  test("showing a custom view hides the sessions grid, editor, side panel and panel", () => {
    const host = createHost({ partVisibility: { editor: true, auxiliaryBar: true, panel: true, sessions: true } });
    const descriptor = {};
    applyCustomViewGridVisibility.call(host, descriptor);
    assert.deepStrictEqual({
      renderedCustomViews: host.renderedCustomViews,
      customViewGridVisible: isVisible.call(host, Parts.CUSTOM_VIEW_GRID_PART),
      sessions: isVisible.call(host, Parts.SESSIONS_PART),
      editor: isVisible.call(host, Parts.EDITOR_PART),
      auxiliaryBar: isVisible.call(host, Parts.AUXILIARYBAR_PART),
      panel: isVisible.call(host, Parts.PANEL_PART),
      sideBar: isVisible.call(host, Parts.SIDEBAR_PART),
      gridNodes: {
        customViewGrid: host.gridVisibility.get(host.customViewGridPartView),
        sessions: host.gridVisibility.get(host.sessionsPartView),
        editor: host.gridVisibility.get(host.editorPartView),
        panel: host.gridVisibility.get(host.panelPartView)
      },
      events: host.events,
      focusedParts: host.focusedParts
    }, {
      renderedCustomViews: [descriptor],
      customViewGridVisible: true,
      sessions: false,
      editor: false,
      auxiliaryBar: false,
      panel: false,
      sideBar: true,
      gridNodes: {
        customViewGrid: true,
        sessions: false,
        editor: false,
        panel: false
      },
      events: [
        { partId: Parts.CUSTOM_VIEW_GRID_PART, visible: true },
        { partId: Parts.SESSIONS_PART, visible: false },
        { partId: Parts.EDITOR_PART, visible: false },
        { partId: Parts.AUXILIARYBAR_PART, visible: false },
        { partId: Parts.PANEL_PART, visible: false }
      ],
      focusedParts: [Parts.CUSTOM_VIEW_GRID_PART]
    });
  });
  test("hiding the custom view restores the desired part visibility, including changes made while it was shown", () => {
    const host = createHost({ partVisibility: { editor: true, auxiliaryBar: true, panel: false, sessions: true } });
    applyCustomViewGridVisibility.call(host, {});
    setEditorHidden.call(host, true);
    const whileShown = {
      editor: isVisible.call(host, Parts.EDITOR_PART),
      editorNode: host.gridVisibility.get(host.editorPartView)
    };
    applyCustomViewGridVisibility.call(host, void 0);
    assert.deepStrictEqual({
      whileShown,
      customViewGridVisible: isVisible.call(host, Parts.CUSTOM_VIEW_GRID_PART),
      renderedCustomViewCount: host.renderedCustomViews.length,
      lastRenderedCustomView: host.renderedCustomViews[host.renderedCustomViews.length - 1],
      sessions: isVisible.call(host, Parts.SESSIONS_PART),
      editor: isVisible.call(host, Parts.EDITOR_PART),
      auxiliaryBar: isVisible.call(host, Parts.AUXILIARYBAR_PART),
      panel: isVisible.call(host, Parts.PANEL_PART),
      focusedSessions: host.focusedSessions
    }, {
      whileShown: { editor: false, editorNode: false },
      customViewGridVisible: false,
      renderedCustomViewCount: 2,
      lastRenderedCustomView: void 0,
      sessions: true,
      editor: false,
      auxiliaryBar: true,
      panel: false,
      focusedSessions: 1
    });
  });
  test("swapping to another custom view re-renders it without touching the layout", () => {
    const host = createHost({ partVisibility: { editor: true, auxiliaryBar: true, sessions: true } });
    const first = {};
    const second = {};
    applyCustomViewGridVisibility.call(host, first);
    const eventsAfterShow = host.events.length;
    applyCustomViewGridVisibility.call(host, second);
    assert.deepStrictEqual({
      renderedCustomViews: host.renderedCustomViews,
      customViewGridVisible: isVisible.call(host, Parts.CUSTOM_VIEW_GRID_PART),
      sessions: isVisible.call(host, Parts.SESSIONS_PART),
      eventsAfterSwap: host.events.length - eventsAfterShow
    }, {
      renderedCustomViews: [first, second],
      customViewGridVisible: true,
      sessions: false,
      eventsAfterSwap: 0
    });
  });
  test("tracks the custom view in the phone navigation stack and drops it when leaving phone layout", () => {
    const host = createHost();
    host.layoutPolicy.viewportClass.get = () => "phone";
    applyCustomViewGridVisibility.call(host, {});
    const onPhone = [...host.mobileNavLayers];
    host.layoutPolicy.viewportClass.get = () => "desktop";
    updateMobileCustomViewNavigation.call(host);
    assert.deepStrictEqual({ onPhone, afterLeavingPhone: host.mobileNavLayers }, {
      onPhone: ["customView"],
      afterLeavingPhone: []
    });
  });
  test("the secondary side bar toggle is inert while a custom view is shown", () => {
    const host = createHost({ partVisibility: { auxiliaryBar: true } });
    applyCustomViewGridVisibility.call(host, {});
    toggleSecondarySideBar.call(host);
    assert.strictEqual(host.partVisibility.auxiliaryBar, true);
  });
  test("showing a custom view un-maximizes the editor so the sessions grid owns the row again on hide", () => {
    const host = createHost({ editorMaximize: true, partVisibility: { editor: true, auxiliaryBar: true, sessions: true } });
    setEditorMaximized.call(host, true);
    applyCustomViewGridVisibility.call(host, {});
    const whileShown = {
      editorMaximized: host._editorMaximized,
      sessions: isVisible.call(host, Parts.SESSIONS_PART),
      customViewGrid: isVisible.call(host, Parts.CUSTOM_VIEW_GRID_PART)
    };
    applyCustomViewGridVisibility.call(host, void 0);
    assert.deepStrictEqual({
      whileShown,
      sessions: isVisible.call(host, Parts.SESSIONS_PART),
      customViewGrid: isVisible.call(host, Parts.CUSTOM_VIEW_GRID_PART)
    }, {
      whileShown: { editorMaximized: false, sessions: false, customViewGrid: true },
      sessions: true,
      customViewGrid: false
    });
  });
  test("does not restore saved desktop part visibility on phone layout", () => {
    let getCalled = false;
    const workbench = createWorkbenchHarness();
    workbench.layoutPolicy.viewportClass.get = () => "phone";
    const storageService = {
      get: () => {
        getCalled = true;
        return JSON.stringify({ editor: true, auxiliaryBar: true, sidebar: true });
      },
      remove: () => {
      }
    };
    const restored = loadPartVisibility.call(workbench, storageService);
    assert.deepStrictEqual(restored, {});
    assert.strictEqual(getCalled, false);
  });
  test("restores saved desktop part visibility outside phone layout", () => {
    const workbench = createWorkbenchHarness();
    workbench.layoutPolicy.viewportClass.get = () => "desktop";
    const storageService = {
      get: () => JSON.stringify({ editor: true, auxiliaryBar: false, sidebar: false }),
      remove: () => {
      }
    };
    const restored = loadPartVisibility.call(workbench, storageService);
    assert.deepStrictEqual(restored, { editor: true, auxiliaryBar: false, sidebar: false });
  });
  test("does not persist part visibility on phone layout", () => {
    let storeCalled = false;
    const workbench = createWorkbenchHarness();
    workbench.layoutPolicy.viewportClass.get = () => "phone";
    workbench.storageService.store = () => {
      storeCalled = true;
    };
    savePartVisibility.call(workbench);
    assert.strictEqual(storeCalled, false);
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxzZXNzaW9uc1xcdGVzdFxcYnJvd3Nlclxcd29ya2JlbmNoLnRlc3QudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgYXNzZXJ0IGZyb20gJ2Fzc2VydCc7XG5pbXBvcnQgeyBTYXNoU3RhdGUgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2Jyb3dzZXIvdWkvc2FzaC9zYXNoLmpzJztcbmltcG9ydCB7IGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvdGVzdC9jb21tb24vdXRpbHMuanMnO1xuaW1wb3J0IHsgUGFydCB9IGZyb20gJy4uLy4uLy4uL3dvcmtiZW5jaC9icm93c2VyL3BhcnQuanMnO1xuaW1wb3J0IHsgSVBhcnRWaXNpYmlsaXR5Q2hhbmdlRXZlbnQsIFBhcnRzIH0gZnJvbSAnLi4vLi4vLi4vd29ya2JlbmNoL3NlcnZpY2VzL2xheW91dC9icm93c2VyL2xheW91dFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgRG9ja2VkQXV4aWxpYXJ5QmFyQ29udHJvbGxlciwgSURvY2tlZEF1eGlsaWFyeUJhckhvc3QgfSBmcm9tICcuLi8uLi9icm93c2VyL2RvY2tlZEF1eGlsaWFyeUJhckNvbnRyb2xsZXIuanMnO1xuaW1wb3J0IHsgSVNpZGVQYW5lVG9nZ2xlRXZlbnQsIFdvcmtiZW5jaCB9IGZyb20gJy4uLy4uL2Jyb3dzZXIvd29ya2JlbmNoLmpzJztcbmltcG9ydCB7IERvY2tlZEVkaXRvclNpemVNZW1lbnRvLCBTaW5nbGVQYW5lV29ya2JlbmNoIH0gZnJvbSAnLi4vLi4vYnJvd3Nlci9zaW5nbGVQYW5lV29ya2JlbmNoLmpzJztcbmltcG9ydCB7IFNpbmdsZVBhbmVNYWluRWRpdG9yUGFydCB9IGZyb20gJy4uLy4uL2Jyb3dzZXIvcGFydHMvc2luZ2xlUGFuZUVkaXRvclBhcnQuanMnO1xuaW1wb3J0IHsgRG9ja2VkRWRpdG9ySW5wdXQgfSBmcm9tICcuLi8uLi9jb21tb24vZG9ja2VkRWRpdG9ySW5wdXQuanMnO1xuaW1wb3J0IHsgRWRpdG9ySW5wdXRDYXBhYmlsaXRpZXMgfSBmcm9tICcuLi8uLi8uLi93b3JrYmVuY2gvY29tbW9uL2VkaXRvci5qcyc7XG5pbXBvcnQgeyBTRVNTSU9OU19MSVNUX01JTklNVU1fV0lEVEggfSBmcm9tICcuLi8uLi9icm93c2VyL3BhcnRzL3NpZGViYXJQYXJ0LmpzJztcbmltcG9ydCB7IE1lbnVzIH0gZnJvbSAnLi4vLi4vYnJvd3Nlci9tZW51cy5qcyc7XG5cbmludGVyZmFjZSBJVmlld1NpemUgeyB3aWR0aDogbnVtYmVyOyBoZWlnaHQ6IG51bWJlciB9XG5cbi8qKiBNaW5pbWFsIGRvY2tlZCBlZGl0b3IgaW5wdXQgZm9yIHRlc3RpbmcgdGhlIHNpbmdsZS1wYW5lIHJldmVhbCBwb2xpY3kuICovXG5jbGFzcyBUZXN0RG9ja2VkRWRpdG9ySW5wdXQgZXh0ZW5kcyBEb2NrZWRFZGl0b3JJbnB1dCB7XG5cdG92ZXJyaWRlIGdldCB0eXBlSWQoKTogc3RyaW5nIHsgcmV0dXJuICd0ZXN0LmRvY2tlZEVkaXRvcic7IH1cblx0b3ZlcnJpZGUgZ2V0IHJlc291cmNlKCk6IHVuZGVmaW5lZCB7IHJldHVybiB1bmRlZmluZWQ7IH1cbn1cblxuc3VpdGUoJ1Nlc3Npb25zIC0gV29ya2JlbmNoJywgKCkgPT4ge1xuXHRlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUoKTtcblxuXHQvLyBSZWFsIFdvcmtiZW5jaCBtZXRob2RzIGludm9rZWQgYWdhaW5zdCBhIHByb3RvdHlwZS1jaGFpbmVkIGZha2UgaGFybmVzcyBzb1xuXHQvLyB0aGUgcHJvdGVjdGVkIGxheW91dCBob29rcyBkaXNwYXRjaCB0byB0aGUgYmFzZSAoZ3JpZCkgb3IgU2luZ2xlUGFuZVdvcmtiZW5jaFxuXHQvLyAoZG9ja2VkKSBvdmVycmlkZSwgZXhhY3RseSBhcyBhdCBydW50aW1lLlxuXHRjb25zdCBzZXRFZGl0b3JIaWRkZW4gPSBSZWZsZWN0LmdldChXb3JrYmVuY2gucHJvdG90eXBlLCAnc2V0RWRpdG9ySGlkZGVuJykgYXMgKHRoaXM6IElUZXN0V29ya2JlbmNoLCBoaWRkZW46IGJvb2xlYW4sIGV4cGxpY2l0PzogYm9vbGVhbikgPT4gdm9pZDtcblx0Y29uc3Qgc2V0QXV4aWxpYXJ5QmFySGlkZGVuID0gUmVmbGVjdC5nZXQoV29ya2JlbmNoLnByb3RvdHlwZSwgJ3NldEF1eGlsaWFyeUJhckhpZGRlbicpIGFzICh0aGlzOiBJVGVzdFdvcmtiZW5jaCwgaGlkZGVuOiBib29sZWFuKSA9PiB2b2lkO1xuXHRjb25zdCBzZXRTaWRlQmFySGlkZGVuID0gUmVmbGVjdC5nZXQoV29ya2JlbmNoLnByb3RvdHlwZSwgJ3NldFNpZGVCYXJIaWRkZW4nKSBhcyAodGhpczogSVRlc3RXb3JrYmVuY2gsIGhpZGRlbjogYm9vbGVhbikgPT4gdm9pZDtcblx0Y29uc3QgaGFuZGxlRGlkQ2xvc2VFZGl0b3IgPSBSZWZsZWN0LmdldChXb3JrYmVuY2gucHJvdG90eXBlLCAnaGFuZGxlRGlkQ2xvc2VFZGl0b3InKSBhcyAodGhpczogSVRlc3RXb3JrYmVuY2gpID0+IHZvaWQ7XG5cdGNvbnN0IHNldEVkaXRvck1heGltaXplZCA9IFJlZmxlY3QuZ2V0KFdvcmtiZW5jaC5wcm90b3R5cGUsICdzZXRFZGl0b3JNYXhpbWl6ZWQnKSBhcyAodGhpczogSU1heGltaXplVGVzdEhhcm5lc3MsIG1heGltaXplZDogYm9vbGVhbikgPT4gdm9pZDtcblx0Y29uc3Qgb25FZGl0b3JOb2RlUmVzaXplZCA9IFJlZmxlY3QuZ2V0KFNpbmdsZVBhbmVXb3JrYmVuY2gucHJvdG90eXBlLCAnX29uRWRpdG9yTm9kZVJlc2l6ZWQnKSBhcyAodGhpczogSVRlc3RXb3JrYmVuY2gsIG5vZGVXaWR0aDogbnVtYmVyKSA9PiB2b2lkO1xuXHRjb25zdCBvbkdyaWREaWRDaGFuZ2UgPSBSZWZsZWN0LmdldChTaW5nbGVQYW5lV29ya2JlbmNoLnByb3RvdHlwZSwgJ19vbkdyaWREaWRDaGFuZ2UnKSBhcyAodGhpczogSVRlc3RXb3JrYmVuY2gpID0+IHZvaWQ7XG5cdGNvbnN0IG9uRWRpdG9yUGFydEdyaWRWaXNpYmlsaXR5Q2hhbmdlID0gUmVmbGVjdC5nZXQoU2luZ2xlUGFuZVdvcmtiZW5jaC5wcm90b3R5cGUsICdfb25FZGl0b3JQYXJ0R3JpZFZpc2liaWxpdHlDaGFuZ2UnKSBhcyAodGhpczogSVRlc3RXb3JrYmVuY2gsIHZpc2libGU6IGJvb2xlYW4pID0+IHZvaWQ7XG5cdGNvbnN0IHBlcnNpc3RlZEVkaXRvcldpZHRoID0gUmVmbGVjdC5nZXQoU2luZ2xlUGFuZVdvcmtiZW5jaC5wcm90b3R5cGUsICdfcGVyc2lzdGVkRWRpdG9yV2lkdGgnKSBhcyAodGhpczogSVRlc3RXb3JrYmVuY2gsIGVkaXRvckdyaWRXaWR0aDogbnVtYmVyIHwgdW5kZWZpbmVkKSA9PiBudW1iZXIgfCB1bmRlZmluZWQ7XG5cdGNvbnN0IHJlbWVtYmVyQXR0YWNoZWRFZGl0b3JNYXhpbWl6ZWRTdGF0ZSA9IFJlZmxlY3QuZ2V0KFdvcmtiZW5jaC5wcm90b3R5cGUsICdyZW1lbWJlckF0dGFjaGVkRWRpdG9yTWF4aW1pemVkU3RhdGUnKSBhcyAodGhpczogSVdvcmtiZW5jaFRlc3RIYXJuZXNzKSA9PiB2b2lkO1xuXHRjb25zdCByZXN0b3JlQXR0YWNoZWRFZGl0b3JNYXhpbWl6ZWRTdGF0ZSA9IFJlZmxlY3QuZ2V0KFdvcmtiZW5jaC5wcm90b3R5cGUsICdyZXN0b3JlQXR0YWNoZWRFZGl0b3JNYXhpbWl6ZWRTdGF0ZScpIGFzICh0aGlzOiBJV29ya2JlbmNoVGVzdEhhcm5lc3MpID0+IHZvaWQ7XG5cdGNvbnN0IGxvYWRQYXJ0VmlzaWJpbGl0eSA9IFJlZmxlY3QuZ2V0KFdvcmtiZW5jaC5wcm90b3R5cGUsICdfbG9hZFBhcnRWaXNpYmlsaXR5JykgYXMgKHRoaXM6IElXb3JrYmVuY2hUZXN0SGFybmVzcywgc3RvcmFnZVNlcnZpY2U6IHsgZ2V0KCk6IHN0cmluZyB8IHVuZGVmaW5lZDsgcmVtb3ZlKCk6IHZvaWQgfSkgPT4geyBlZGl0b3I/OiBib29sZWFuOyBhdXhpbGlhcnlCYXI/OiBib29sZWFuOyBzaWRlYmFyPzogYm9vbGVhbiB9O1xuXHRjb25zdCBzYXZlUGFydFZpc2liaWxpdHkgPSBSZWZsZWN0LmdldChXb3JrYmVuY2gucHJvdG90eXBlLCAnX3NhdmVQYXJ0VmlzaWJpbGl0eScpIGFzICh0aGlzOiBJV29ya2JlbmNoVGVzdEhhcm5lc3MpID0+IHZvaWQ7XG5cdGNvbnN0IHJldmVhbEVkaXRvck9uT3BlbiA9IFJlZmxlY3QuZ2V0KFdvcmtiZW5jaC5wcm90b3R5cGUsICdyZXZlYWxFZGl0b3JPbk9wZW4nKSBhcyAodGhpczogSVdpbGxPcGVuVGVzdEhhcm5lc3MsIGU6IHsgZ3JvdXBJZDogbnVtYmVyOyBlZGl0b3I6IHVua25vd24gfSkgPT4gdm9pZDtcblx0Y29uc3QgcmV2ZWFsRWRpdG9yT25PcGVuU2luZ2xlUGFuZSA9IFJlZmxlY3QuZ2V0KFNpbmdsZVBhbmVXb3JrYmVuY2gucHJvdG90eXBlLCAncmV2ZWFsRWRpdG9yT25PcGVuJykgYXMgKHRoaXM6IElXaWxsT3BlblRlc3RIYXJuZXNzLCBlOiB7IGdyb3VwSWQ6IG51bWJlcjsgZWRpdG9yOiB1bmtub3duIH0pID0+IHZvaWQ7XG5cdGNvbnN0IGNyZWF0ZURlc2t0b3BHcmlkRGVzY3JpcHRvciA9IFJlZmxlY3QuZ2V0KFdvcmtiZW5jaC5wcm90b3R5cGUsICdjcmVhdGVEZXNrdG9wR3JpZERlc2NyaXB0b3InKSBhcyAodGhpczogSUdyaWREZXNjcmlwdG9yVGVzdEhhcm5lc3MsIHdpZHRoOiBudW1iZXIsIGhlaWdodDogbnVtYmVyKSA9PiB7IHJvb3Q6IHsgZGF0YTogcmVhZG9ubHkgdW5rbm93bltdIH0gfTtcblx0Y29uc3Qgc2F2ZVBhcnRTaXplcyA9IFJlZmxlY3QuZ2V0KFdvcmtiZW5jaC5wcm90b3R5cGUsICdfc2F2ZVBhcnRTaXplcycpIGFzICh0aGlzOiBJU2F2ZVBhcnRTaXplc1Rlc3RIYXJuZXNzKSA9PiB2b2lkO1xuXHRjb25zdCBpc0VkaXRvclBhbmVWaXNpYmxlID0gV29ya2JlbmNoLnByb3RvdHlwZS5pc0VkaXRvclBhbmVWaXNpYmxlIGFzICh0aGlzOiBJVGVzdFdvcmtiZW5jaCkgPT4gYm9vbGVhbjtcblx0Y29uc3QgaXNTaW5nbGVQYW5lRWRpdG9yUGFuZVZpc2libGUgPSBTaW5nbGVQYW5lV29ya2JlbmNoLnByb3RvdHlwZS5pc0VkaXRvclBhbmVWaXNpYmxlIGFzICh0aGlzOiBJVGVzdFdvcmtiZW5jaCkgPT4gYm9vbGVhbjtcblx0Y29uc3QgdG9nZ2xlU2Vjb25kYXJ5U2lkZUJhclNpbmdsZVBhbmUgPSBTaW5nbGVQYW5lV29ya2JlbmNoLnByb3RvdHlwZS50b2dnbGVTZWNvbmRhcnlTaWRlQmFyIGFzICh0aGlzOiBJVGVzdFdvcmtiZW5jaCkgPT4gdm9pZDtcblx0Y29uc3QgaXNTZWNvbmRhcnlTaWRlQmFyVmlzaWJsZVNpbmdsZVBhbmUgPSBTaW5nbGVQYW5lV29ya2JlbmNoLnByb3RvdHlwZS5pc1NlY29uZGFyeVNpZGVCYXJWaXNpYmxlIGFzICh0aGlzOiBJVGVzdFdvcmtiZW5jaCkgPT4gYm9vbGVhbjtcblx0Y29uc3QgdG9nZ2xlU2lkZVBhbmUgPSBTaW5nbGVQYW5lV29ya2JlbmNoLnByb3RvdHlwZS50b2dnbGVTaWRlUGFuZSBhcyAodGhpczogSVRlc3RXb3JrYmVuY2gpID0+IGJvb2xlYW47XG5cdGNvbnN0IGhpZGVTaWRlUGFuZSA9IFdvcmtiZW5jaC5wcm90b3R5cGUuaGlkZVNpZGVQYW5lIGFzICh0aGlzOiBJVGVzdFdvcmtiZW5jaCkgPT4gdm9pZDtcblx0Y29uc3QgYXBwbHlDdXN0b21WaWV3R3JpZFZpc2liaWxpdHkgPSBSZWZsZWN0LmdldChXb3JrYmVuY2gucHJvdG90eXBlLCAnX2FwcGx5Q3VzdG9tVmlld0dyaWRWaXNpYmlsaXR5JykgYXMgKHRoaXM6IElUZXN0V29ya2JlbmNoLCBkZXNjcmlwdG9yOiBvYmplY3QgfCB1bmRlZmluZWQpID0+IHZvaWQ7XG5cdGNvbnN0IHNldFNlc3Npb25zSGlkZGVuID0gUmVmbGVjdC5nZXQoV29ya2JlbmNoLnByb3RvdHlwZSwgJ3NldFNlc3Npb25zSGlkZGVuJykgYXMgKHRoaXM6IElUZXN0V29ya2JlbmNoLCBoaWRkZW46IGJvb2xlYW4pID0+IHZvaWQ7XG5cdGNvbnN0IHNldFBhbmVsSGlkZGVuID0gUmVmbGVjdC5nZXQoV29ya2JlbmNoLnByb3RvdHlwZSwgJ3NldFBhbmVsSGlkZGVuJykgYXMgKHRoaXM6IElUZXN0V29ya2JlbmNoLCBoaWRkZW46IGJvb2xlYW4pID0+IHZvaWQ7XG5cdGNvbnN0IHVwZGF0ZU1vYmlsZUN1c3RvbVZpZXdOYXZpZ2F0aW9uID0gUmVmbGVjdC5nZXQoV29ya2JlbmNoLnByb3RvdHlwZSwgJ191cGRhdGVNb2JpbGVDdXN0b21WaWV3TmF2aWdhdGlvbicpIGFzICh0aGlzOiBJVGVzdFdvcmtiZW5jaCkgPT4gdm9pZDtcblx0Y29uc3QgaXNWaXNpYmxlID0gV29ya2JlbmNoLnByb3RvdHlwZS5pc1Zpc2libGUgYXMgKHRoaXM6IElUZXN0V29ya2JlbmNoLCBwYXJ0OiBQYXJ0cykgPT4gYm9vbGVhbjtcblx0Y29uc3QgdG9nZ2xlU2Vjb25kYXJ5U2lkZUJhciA9IFdvcmtiZW5jaC5wcm90b3R5cGUudG9nZ2xlU2Vjb25kYXJ5U2lkZUJhciBhcyAodGhpczogSVRlc3RXb3JrYmVuY2gpID0+IHZvaWQ7XG5cdGNvbnN0IHJlc3RvcmVTZXNzaW9uc1BhcnRPbkFjdGl2YXRpb24gPSBSZWZsZWN0LmdldChXb3JrYmVuY2gucHJvdG90eXBlLCAnX3Jlc3RvcmVTZXNzaW9uc1BhcnRPbkFjdGl2YXRpb24nKSBhcyAodGhpczogSVRlc3RXb3JrYmVuY2gpID0+IHZvaWQ7XG5cdGNvbnN0IHJlc3RvcmVFZGl0b3JQYXJ0T25BY3RpdmF0aW9uID0gUmVmbGVjdC5nZXQoV29ya2JlbmNoLnByb3RvdHlwZSwgJ19yZXN0b3JlRWRpdG9yUGFydE9uQWN0aXZhdGlvbicpIGFzICh0aGlzOiBJVGVzdFdvcmtiZW5jaCkgPT4gdm9pZDtcblx0Y29uc3QgbGF5b3V0U2luZ2xlUGFuZUdyaWQgPSBSZWZsZWN0LmdldChTaW5nbGVQYW5lV29ya2JlbmNoLnByb3RvdHlwZSwgJ19sYXlvdXRHcmlkJykgYXMgKHRoaXM6IElDb250YWluZXJSZXNpemVUZXN0SGFybmVzcykgPT4gdm9pZDtcblx0Y29uc3QgcHJlc2VydmVTZXNzaW9uc0VkaXRvclJhdGlvID0gUmVmbGVjdC5nZXQoU2luZ2xlUGFuZVdvcmtiZW5jaC5wcm90b3R5cGUsICdfcHJlc2VydmVTZXNzaW9uc0VkaXRvclJhdGlvJykgYXMgKHRoaXM6IElQcm9wb3J0aW9uYWxSZXNpemVUZXN0SGFybmVzcywgcHJldmlvdXNTZXNzaW9uc1dpZHRoOiBudW1iZXIsIHByZXZpb3VzRWRpdG9yV2lkdGg6IG51bWJlcikgPT4gdm9pZDtcblxuXHQvLyAtLS0gSGFybmVzcyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cblxuXHRpbnRlcmZhY2UgSVRlc3RXb3JrYmVuY2gge1xuXHRcdHBhcnRWaXNpYmlsaXR5OiB7IHNpZGViYXI6IGJvb2xlYW47IGF1eGlsaWFyeUJhcjogYm9vbGVhbjsgZWRpdG9yOiBib29sZWFuOyBwYW5lbDogYm9vbGVhbjsgc2Vzc2lvbnM6IGJvb2xlYW47IGN1c3RvbVZpZXdHcmlkOiBib29sZWFuIH07XG5cdFx0YXV4aWxpYXJ5QmFyUGFydFZpZXc6IG9iamVjdDtcblx0XHRfc2F2ZWRQYXJ0U2l6ZXM6IHsgc2lkZWJhcj86IG51bWJlcjsgYXV4aWxpYXJ5QmFyPzogbnVtYmVyOyBlZGl0b3I/OiBudW1iZXI7IHNlc3Npb25zPzogbnVtYmVyOyBwYW5lbD86IG51bWJlciB9O1xuXHRcdF9lZGl0b3JNYXhpbWl6ZWQ6IGJvb2xlYW47XG5cdFx0X2VkaXRvclJldmVhbGVkRXhwbGljaXRseTogYm9vbGVhbjtcblx0XHRfZWRpdG9yUGFydEF1dG9WaXNpYmlsaXR5U3VwcHJlc3Npb25Db3VudDogbnVtYmVyO1xuXHRcdF9yZXN0b3JlQXR0YWNoZWRFZGl0b3JNYXhpbWl6ZWRPblNob3c6IGJvb2xlYW47XG5cdFx0X3Jlc3RvcmVTaWRlUGFuZUVkaXRvck1heGltaXplZE9uU2hvdzogYm9vbGVhbjtcblx0XHRfaGFzQXBwbGllZEluaXRpYWxFZGl0b3JTcGxpdDogYm9vbGVhbjtcblx0XHRfZG9ja2VkQXV4aWxpYXJ5QmFyV2lkdGg6IG51bWJlcjtcblx0XHRfZGV0YWlsSGlkZGVuRm9yRWRpdG9yUmVzaXplOiBib29sZWFuO1xuXHRcdF9tZW1lbnRvOiBEb2NrZWRFZGl0b3JTaXplTWVtZW50bztcblx0XHRyZWFkb25seSByZXNpemVzOiBJVmlld1NpemVbXTtcblx0XHRyZWFkb25seSBkaXN0cmlidXRpb25zOiBvYmplY3RbXTtcblx0XHRyZWFkb25seSB2aXNpYmlsaXR5Q2hhbmdlczogYm9vbGVhbltdO1xuXHRcdHJlYWRvbmx5IGV2ZW50czogSVBhcnRWaXNpYmlsaXR5Q2hhbmdlRXZlbnRbXTtcblx0XHRyZWFkb25seSBjbGFzc1RvZ2dsZXM6IHsgbmFtZTogc3RyaW5nOyBmb3JjZTogYm9vbGVhbiB9W107XG5cdFx0cmVhZG9ubHkgY291bnRzOiB7IHNhdmU6IG51bWJlcjsgbGF5b3V0OiBudW1iZXIgfTtcblx0XHRyZWFkb25seSBzaWRlUGFuZVJldmVhbHM6IGJvb2xlYW5bXTtcblx0XHRyZWFkb25seSBmb2N1c2VkUGFydHM6IFBhcnRzW107XG5cdFx0cmVhZG9ubHkgcmVuZGVyZWRDdXN0b21WaWV3czogKG9iamVjdCB8IHVuZGVmaW5lZClbXTtcblx0XHRyZWFkb25seSBncmlkVmlzaWJpbGl0eTogTWFwPG9iamVjdCwgYm9vbGVhbj47XG5cdFx0cmVhZG9ubHkgbW9iaWxlTmF2TGF5ZXJzOiBzdHJpbmdbXTtcblx0XHRyZWFkb25seSBmb2N1c2VkU2Vzc2lvbnM6IG51bWJlcjtcblx0XHRyZWFkb25seSBzaWRlUGFuZVRvZ2dsZUV2ZW50czogKCd3aWxsJyB8IHsgcmVhZG9ubHkgZGlkOiBJU2lkZVBhbmVUb2dnbGVFdmVudCB9KVtdO1xuXHRcdGxheW91dFBvbGljeTogeyB2aWV3cG9ydENsYXNzOiB7IGdldCgpOiBzdHJpbmcgfSB9O1xuXHRcdHNlc3Npb25zUGFydFZpZXc6IG9iamVjdDtcblx0XHRwYW5lbFBhcnRWaWV3OiBvYmplY3Q7XG5cdFx0Y3VzdG9tVmlld0dyaWRQYXJ0Vmlldzogb2JqZWN0O1xuXHRcdGVkaXRvclBhcnRWaWV3OiBvYmplY3Q7XG5cdFx0d29ya2JlbmNoR3JpZDoge1xuXHRcdFx0Z2V0Vmlld1NpemUodmlldzogb2JqZWN0KTogSVZpZXdTaXplO1xuXHRcdFx0aXNWaWV3VmlzaWJsZSh2aWV3OiBvYmplY3QpOiBib29sZWFuO1xuXHRcdFx0cmVzaXplVmlldyh2aWV3OiBvYmplY3QsIHNpemU6IElWaWV3U2l6ZSk6IHZvaWQ7XG5cdFx0fTtcblx0XHRzZXRFZGl0b3JIaWRkZW4oaGlkZGVuOiBib29sZWFuLCBleHBsaWNpdD86IGJvb2xlYW4pOiB2b2lkO1xuXHRcdHNldEF1eGlsaWFyeUJhckhpZGRlbihoaWRkZW46IGJvb2xlYW4pOiB2b2lkO1xuXHRcdHNldEVkaXRvck1heGltaXplZChtYXhpbWl6ZWQ6IGJvb2xlYW4pOiB2b2lkO1xuXHR9XG5cblx0aW50ZXJmYWNlIElHcmlkRGVzY3JpcHRvclRlc3RIYXJuZXNzIGV4dGVuZHMgSVRlc3RXb3JrYmVuY2gge1xuXHRcdF9zYXZlZFBhcnRTaXplczogeyBzaWRlYmFyPzogbnVtYmVyOyBhdXhpbGlhcnlCYXI/OiBudW1iZXI7IGVkaXRvcj86IG51bWJlcjsgc2Vzc2lvbnM/OiBudW1iZXI7IHBhbmVsPzogbnVtYmVyIH07XG5cdFx0bGF5b3V0UG9saWN5OiB7XG5cdFx0XHRnZXRQYXJ0U2l6ZXMod2lkdGg6IG51bWJlciwgaGVpZ2h0OiBudW1iZXIpOiB7IHNpZGVCYXJTaXplOiBudW1iZXI7IGF1eGlsaWFyeUJhclNpemU6IG51bWJlcjsgcGFuZWxTaXplOiBudW1iZXIgfTtcblx0XHRcdHZpZXdwb3J0Q2xhc3M6IHsgZ2V0KCk6IHN0cmluZyB9O1xuXHRcdH07XG5cdFx0dGl0bGVCYXJQYXJ0VmlldzogeyBtaW5pbXVtSGVpZ2h0OiBudW1iZXIgfTtcblx0fVxuXG5cdGludGVyZmFjZSBJUHJvcG9ydGlvbmFsUmVzaXplVGVzdEhhcm5lc3Mge1xuXHRcdHBhcnRWaXNpYmlsaXR5OiB7IGF1eGlsaWFyeUJhcjogYm9vbGVhbiB9O1xuXHRcdHNlc3Npb25zUGFydFZpZXc6IHsgbWluaW11bVdpZHRoOiBudW1iZXIgfTtcblx0XHRlZGl0b3JQYXJ0VmlldzogeyBtaW5pbXVtV2lkdGg6IG51bWJlciB9O1xuXHRcdHdvcmtiZW5jaEdyaWQ6IHtcblx0XHRcdGdldFZpZXdTaXplKHZpZXc6IG9iamVjdCk6IElWaWV3U2l6ZTtcblx0XHRcdHJlc2l6ZVZpZXcodmlldzogb2JqZWN0LCBzaXplOiBJVmlld1NpemUpOiB2b2lkO1xuXHRcdH07XG5cdFx0X3J1bldpdGhFZGl0b3JSZXNpemVTeW5jU3VzcGVuZGVkKGZuOiAoKSA9PiB2b2lkKTogdm9pZDtcblx0fVxuXG5cdGludGVyZmFjZSBJQ29udGFpbmVyUmVzaXplVGVzdEhhcm5lc3MgZXh0ZW5kcyBJUHJvcG9ydGlvbmFsUmVzaXplVGVzdEhhcm5lc3Mge1xuXHRcdHBhcnRWaXNpYmlsaXR5OiB7IHNpZGViYXI6IGJvb2xlYW47IGVkaXRvcjogYm9vbGVhbjsgYXV4aWxpYXJ5QmFyOiBib29sZWFuIH07XG5cdFx0bW9iaWxlVG9wQmFyRWxlbWVudDogdW5kZWZpbmVkO1xuXHRcdGxheW91dFBvbGljeTogeyB2aWV3cG9ydENsYXNzOiB7IGdldCgpOiBzdHJpbmcgfSB9O1xuXHRcdF9tYWluQ29udGFpbmVyRGltZW5zaW9uOiBJVmlld1NpemU7XG5cdFx0d29ya2JlbmNoR3JpZDogSVByb3BvcnRpb25hbFJlc2l6ZVRlc3RIYXJuZXNzWyd3b3JrYmVuY2hHcmlkJ10gJiB7XG5cdFx0XHRpc1ZpZXdWaXNpYmxlKHZpZXc6IG9iamVjdCk6IGJvb2xlYW47XG5cdFx0XHRsYXlvdXQod2lkdGg6IG51bWJlciwgaGVpZ2h0OiBudW1iZXIpOiB2b2lkO1xuXHRcdH07XG5cdH1cblxuXHRpbnRlcmZhY2UgSVNhdmVQYXJ0U2l6ZXNUZXN0SGFybmVzcyB7XG5cdFx0ZWRpdG9yUGFydFZpZXc6IG9iamVjdDtcblx0XHRzZXNzaW9uc1BhcnRWaWV3OiBvYmplY3Q7XG5cdFx0c2lkZUJhclBhcnRWaWV3OiBvYmplY3Q7XG5cdFx0YXV4aWxpYXJ5QmFyUGFydFZpZXc6IG9iamVjdDtcblx0XHRwYW5lbFBhcnRWaWV3OiBvYmplY3Q7XG5cdFx0cGFydFZpc2liaWxpdHk6IHsgc2lkZWJhcjogYm9vbGVhbjsgYXV4aWxpYXJ5QmFyOiBib29sZWFuOyBlZGl0b3I6IGJvb2xlYW47IHBhbmVsOiBib29sZWFuOyBzZXNzaW9uczogYm9vbGVhbiB9O1xuXHRcdF9zYXZlZFBhcnRTaXplczogeyBlZGl0b3I/OiBudW1iZXIgfTtcblx0XHRfZG9ja2VkQXV4aWxpYXJ5QmFyV2lkdGg6IG51bWJlcjtcblx0XHRfbWVtZW50bzogRG9ja2VkRWRpdG9yU2l6ZU1lbWVudG87XG5cdFx0bG9nU2VydmljZTogdW5kZWZpbmVkO1xuXHRcdHdvcmtiZW5jaEdyaWQ6IHtcblx0XHRcdGdldFZpZXdTaXplKHZpZXc6IG9iamVjdCk6IElWaWV3U2l6ZTtcblx0XHRcdGdldFZpZXdDYWNoZWRWaXNpYmxlU2l6ZSh2aWV3OiBvYmplY3QpOiBudW1iZXIgfCB1bmRlZmluZWQ7XG5cdFx0fTtcblx0XHRzdG9yYWdlU2VydmljZTogeyBzdG9yZShrZXk6IHN0cmluZywgdmFsdWU6IHN0cmluZywgLi4ucmVzdDogdW5rbm93bltdKTogdm9pZCB9O1xuXHR9XG5cblx0aW50ZXJmYWNlIElIb3N0T3B0aW9ucyB7XG5cdFx0c2luZ2xlPzogYm9vbGVhbjtcblx0XHRwYXJ0VmlzaWJpbGl0eT86IFBhcnRpYWw8SVRlc3RXb3JrYmVuY2hbJ3BhcnRWaXNpYmlsaXR5J10+O1xuXHRcdHNlc3Npb25zV2lkdGg/OiBudW1iZXI7XG5cdFx0d2luZG93V2lkdGg/OiBudW1iZXI7XG5cdFx0ZWRpdG9yV2lkdGg/OiBudW1iZXI7XG5cdFx0c2lkZUJhcldpZHRoPzogbnVtYmVyO1xuXHRcdHBhbmVsSGVpZ2h0PzogbnVtYmVyO1xuXHRcdHBhbmVsSGVpZ2h0T25FZGl0b3JTaG93PzogbnVtYmVyO1xuXHRcdGRvY2tlZFdpZHRoPzogbnVtYmVyO1xuXHRcdGhhc0FwcGxpZWRJbml0aWFsRWRpdG9yU3BsaXQ/OiBib29sZWFuO1xuXHRcdC8qKiBVc2UgdGhlIHJlYWwgYHNldEVkaXRvck1heGltaXplZGAgaW5zdGVhZCBvZiB0aGUgbm8tb3Agc3R1Yi4gKi9cblx0XHRlZGl0b3JNYXhpbWl6ZT86IGJvb2xlYW47XG5cdFx0c3VwcHJlc3Npb25Db3VudD86IG51bWJlcjtcblx0XHRmb2N1c2VkUGFydD86IFBhcnRzO1xuXHRcdGVkaXRvckdyb3VwU2VydmljZT86IHsgbWFpblBhcnQ6IHsgZ3JvdXBzOiByZWFkb25seSB7IGlzRW1wdHk6IGJvb2xlYW4gfVtdIH0gfTtcblx0XHR2aWV3RGVzY3JpcHRvclNlcnZpY2U/OiB7XG5cdFx0XHRnZXREZWZhdWx0Vmlld0NvbnRhaW5lciguLi5hcmdzOiB1bmtub3duW10pOiB7IGlkOiBzdHJpbmcgfSB8IHVuZGVmaW5lZDtcblx0XHRcdGdldFZpZXdDb250YWluZXJCeUlkPyhpZDogc3RyaW5nKTogeyBoaWRlSWZFbXB0eTogYm9vbGVhbiB9IHwgbnVsbDtcblx0XHRcdGdldFZpZXdDb250YWluZXJNb2RlbD8oY29udGFpbmVyOiBvYmplY3QpOiB7IGFjdGl2ZVZpZXdEZXNjcmlwdG9yczogcmVhZG9ubHkgb2JqZWN0W10gfTtcblx0XHR9O1xuXHR9XG5cblx0ZnVuY3Rpb24gY3JlYXRlSG9zdChvcHRpb25zOiBJSG9zdE9wdGlvbnMgPSB7fSk6IElUZXN0V29ya2JlbmNoIHtcblx0XHRjb25zdCBlZGl0b3JQYXJ0VmlldyA9IHsgbWluaW11bVdpZHRoOiAzMDAgfTtcblx0XHRjb25zdCBzZXNzaW9uc1BhcnRWaWV3ID0geyBtaW5pbXVtV2lkdGg6IDMwMCB9O1xuXHRcdGNvbnN0IHNpZGVCYXJQYXJ0VmlldyA9IHt9O1xuXHRcdGNvbnN0IGF1eGlsaWFyeUJhclBhcnRWaWV3ID0ge307XG5cdFx0Y29uc3QgcGFuZWxQYXJ0VmlldyA9IHt9O1xuXHRcdGNvbnN0IGN1c3RvbVZpZXdHcmlkUGFydFZpZXcgPSB7fTtcblx0XHRjb25zdCByZXNpemVzOiBJVmlld1NpemVbXSA9IFtdO1xuXHRcdGNvbnN0IGRpc3RyaWJ1dGlvbnM6IG9iamVjdFtdID0gW107XG5cdFx0Y29uc3QgdmlzaWJpbGl0eUNoYW5nZXM6IGJvb2xlYW5bXSA9IFtdO1xuXHRcdGNvbnN0IGV2ZW50czogSVBhcnRWaXNpYmlsaXR5Q2hhbmdlRXZlbnRbXSA9IFtdO1xuXHRcdGNvbnN0IGNsYXNzVG9nZ2xlczogeyBuYW1lOiBzdHJpbmc7IGZvcmNlOiBib29sZWFuIH1bXSA9IFtdO1xuXHRcdGNvbnN0IGNvdW50cyA9IHsgc2F2ZTogMCwgbGF5b3V0OiAwIH07XG5cdFx0Y29uc3Qgc2lkZVBhbmVSZXZlYWxzOiBib29sZWFuW10gPSBbXTtcblx0XHRjb25zdCBmb2N1c2VkUGFydHM6IFBhcnRzW10gPSBbXTtcblx0XHRjb25zdCByZW5kZXJlZEN1c3RvbVZpZXdzOiAob2JqZWN0IHwgdW5kZWZpbmVkKVtdID0gW107XG5cdFx0Y29uc3QgZ3JpZFZpc2liaWxpdHkgPSBuZXcgTWFwPG9iamVjdCwgYm9vbGVhbj4oKTtcblx0XHRjb25zdCBtb2JpbGVOYXZMYXllcnM6IHN0cmluZ1tdID0gW107XG5cdFx0bGV0IGZvY3VzZWRTZXNzaW9ucyA9IDA7XG5cdFx0Y29uc3Qgc2lkZVBhbmVUb2dnbGVFdmVudHM6ICgnd2lsbCcgfCB7IGRpZDogSVNpZGVQYW5lVG9nZ2xlRXZlbnQgfSlbXSA9IFtdO1xuXHRcdGNvbnN0IG5vdGlmeVBhcnRWaXNpYmlsaXR5ID0gKHZpZXc6IG9iamVjdCwgdmlzaWJsZTogYm9vbGVhbikgPT4gbm90aWZ5UGFydFZpc2liaWxpdHlPbihob3N0IGFzIHVua25vd24gYXMgSVRlc3RXb3JrYmVuY2gsIHZpZXcsIHZpc2libGUpO1xuXHRcdGxldCBlZGl0b3JOb2RlVmlzaWJsZSA9IChvcHRpb25zLnBhcnRWaXNpYmlsaXR5Py5lZGl0b3IgPz8gZmFsc2UpIHx8IChvcHRpb25zLnBhcnRWaXNpYmlsaXR5Py5hdXhpbGlhcnlCYXIgPz8gdHJ1ZSk7XG5cdFx0bGV0IHNpZGVCYXJOb2RlVmlzaWJsZSA9IG9wdGlvbnMucGFydFZpc2liaWxpdHk/LnNpZGViYXIgPz8gdHJ1ZTtcblx0XHRjb25zdCB2aWV3U2l6ZXMgPSBuZXcgTWFwPG9iamVjdCwgSVZpZXdTaXplPihbXG5cdFx0XHRbZWRpdG9yUGFydFZpZXcsIHsgd2lkdGg6IG9wdGlvbnMuZWRpdG9yV2lkdGggPz8gMCwgaGVpZ2h0OiA4MDAgfV0sXG5cdFx0XHRbc2Vzc2lvbnNQYXJ0VmlldywgeyB3aWR0aDogb3B0aW9ucy5zZXNzaW9uc1dpZHRoID8/IDEwMDAsIGhlaWdodDogODAwIH1dLFxuXHRcdFx0W3NpZGVCYXJQYXJ0VmlldywgeyB3aWR0aDogb3B0aW9ucy5zaWRlQmFyV2lkdGggPz8gMjgwLCBoZWlnaHQ6IDgwMCB9XSxcblx0XHRcdFthdXhpbGlhcnlCYXJQYXJ0VmlldywgeyB3aWR0aDogMzAwLCBoZWlnaHQ6IDgwMCB9XSxcblx0XHRcdFtwYW5lbFBhcnRWaWV3LCB7IHdpZHRoOiAxMDAwLCBoZWlnaHQ6IG9wdGlvbnMucGFuZWxIZWlnaHQgPz8gMzAwIH1dLFxuXHRcdF0pO1xuXG5cdFx0Y29uc3QgcGFydFZpc2liaWxpdHkgPSB7IHNpZGViYXI6IHRydWUsIGF1eGlsaWFyeUJhcjogdHJ1ZSwgZWRpdG9yOiBmYWxzZSwgcGFuZWw6IGZhbHNlLCBzZXNzaW9uczogdHJ1ZSwgY3VzdG9tVmlld0dyaWQ6IGZhbHNlLCAuLi5vcHRpb25zLnBhcnRWaXNpYmlsaXR5IH07XG5cdFx0Y29uc3QgaG9zdCA9IHtcblx0XHRcdGVkaXRvclBhcnRWaWV3LFxuXHRcdFx0c2Vzc2lvbnNQYXJ0Vmlldyxcblx0XHRcdHNpZGVCYXJQYXJ0Vmlldyxcblx0XHRcdGF1eGlsaWFyeUJhclBhcnRWaWV3LFxuXHRcdFx0cGFuZWxQYXJ0Vmlldyxcblx0XHRcdGN1c3RvbVZpZXdHcmlkUGFydFZpZXcsXG5cdFx0XHRfZWRpdG9yUGFydENvbnRhaW5lcjogdW5kZWZpbmVkLFxuXHRcdFx0bWFpbkNvbnRhaW5lcjogeyBjbGFzc0xpc3Q6IHsgdG9nZ2xlOiAobmFtZTogc3RyaW5nLCBmb3JjZTogYm9vbGVhbikgPT4geyBjbGFzc1RvZ2dsZXMucHVzaCh7IG5hbWUsIGZvcmNlIH0pOyB9IH0gfSxcblx0XHRcdHBhcnRWaXNpYmlsaXR5LFxuXHRcdFx0d29ya2JlbmNoR3JpZDoge1xuXHRcdFx0XHR3aWR0aDogb3B0aW9ucy53aW5kb3dXaWR0aCA/PyAxMDAwLFxuXHRcdFx0XHRsYXlvdXQ6ICgpID0+IHsgfSxcblx0XHRcdFx0Z2V0Vmlld1NpemU6ICh2aWV3OiBvYmplY3QpID0+IHZpZXdTaXplcy5nZXQodmlldykgPz8geyB3aWR0aDogMCwgaGVpZ2h0OiAwIH0sXG5cdFx0XHRcdGlzVmlld1Zpc2libGU6ICh2aWV3OiBvYmplY3QpID0+IHZpZXcgPT09IGVkaXRvclBhcnRWaWV3ID8gZWRpdG9yTm9kZVZpc2libGUgOiB0cnVlLFxuXHRcdFx0XHRoYXNNYXhpbWl6ZWRWaWV3OiAoKSA9PiBmYWxzZSxcblx0XHRcdFx0ZXhpdE1heGltaXplZFZpZXc6ICgpID0+IHsgfSxcblx0XHRcdFx0c2V0Vmlld1Zpc2libGU6ICh2aWV3OiBvYmplY3QsIHZpc2libGU6IGJvb2xlYW4sIHNpemluZz86IHsgdHlwZTogc3RyaW5nIH0pID0+IHtcblx0XHRcdFx0XHRpZiAodmlldyA9PT0gZWRpdG9yUGFydFZpZXcpIHtcblx0XHRcdFx0XHRcdGVkaXRvck5vZGVWaXNpYmxlID0gdmlzaWJsZTtcblx0XHRcdFx0XHRcdGlmICh2aXNpYmxlICYmIHBhcnRWaXNpYmlsaXR5LmVkaXRvciAmJiBvcHRpb25zLnBhbmVsSGVpZ2h0T25FZGl0b3JTaG93ICE9PSB1bmRlZmluZWQpIHtcblx0XHRcdFx0XHRcdFx0dmlld1NpemVzLnNldChwYW5lbFBhcnRWaWV3LCB7IHdpZHRoOiAxMDAwLCBoZWlnaHQ6IG9wdGlvbnMucGFuZWxIZWlnaHRPbkVkaXRvclNob3cgfSk7XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0fSBlbHNlIGlmICh2aWV3ID09PSBzaWRlQmFyUGFydFZpZXcgJiYgc2lkZUJhck5vZGVWaXNpYmxlICE9PSB2aXNpYmxlKSB7XG5cdFx0XHRcdFx0XHRjb25zdCBzaWRlQmFyV2lkdGggPSB2aWV3U2l6ZXMuZ2V0KHNpZGVCYXJQYXJ0VmlldykhLndpZHRoO1xuXHRcdFx0XHRcdFx0Y29uc3Qgc2Vzc2lvbnNTaXplID0gdmlld1NpemVzLmdldChzZXNzaW9uc1BhcnRWaWV3KSE7XG5cdFx0XHRcdFx0XHR2aWV3U2l6ZXMuc2V0KHNlc3Npb25zUGFydFZpZXcsIHtcblx0XHRcdFx0XHRcdFx0d2lkdGg6IHNlc3Npb25zU2l6ZS53aWR0aCArICh2aXNpYmxlID8gLXNpZGVCYXJXaWR0aCA6IHNpZGVCYXJXaWR0aCksXG5cdFx0XHRcdFx0XHRcdGhlaWdodDogc2Vzc2lvbnNTaXplLmhlaWdodCxcblx0XHRcdFx0XHRcdH0pO1xuXHRcdFx0XHRcdFx0c2lkZUJhck5vZGVWaXNpYmxlID0gdmlzaWJsZTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0Z3JpZFZpc2liaWxpdHkuc2V0KHZpZXcsIHZpc2libGUpO1xuXHRcdFx0XHRcdHZpc2liaWxpdHlDaGFuZ2VzLnB1c2godmlzaWJsZSk7XG5cdFx0XHRcdFx0aWYgKHZpc2libGUgJiYgc2l6aW5nPy50eXBlID09PSAnZGlzdHJpYnV0ZScpIHtcblx0XHRcdFx0XHRcdGRpc3RyaWJ1dGlvbnMucHVzaCh2aWV3KTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0bm90aWZ5UGFydFZpc2liaWxpdHkodmlldywgdmlzaWJsZSk7XG5cdFx0XHRcdH0sXG5cdFx0XHRcdHJlc2l6ZVZpZXc6ICh2aWV3OiBvYmplY3QsIHNpemU6IElWaWV3U2l6ZSkgPT4ge1xuXHRcdFx0XHRcdHJlc2l6ZXMucHVzaChzaXplKTtcblx0XHRcdFx0XHR2aWV3U2l6ZXMuc2V0KHZpZXcsIHNpemUpO1xuXHRcdFx0XHRcdGlmICh2aWV3ID09PSBlZGl0b3JQYXJ0VmlldyAmJiBwYXJ0VmlzaWJpbGl0eS5lZGl0b3IgJiYgb3B0aW9ucy5wYW5lbEhlaWdodE9uRWRpdG9yU2hvdyAhPT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRcdFx0XHR2aWV3U2l6ZXMuc2V0KHBhbmVsUGFydFZpZXcsIHsgd2lkdGg6IDEwMDAsIGhlaWdodDogb3B0aW9ucy5wYW5lbEhlaWdodE9uRWRpdG9yU2hvdyB9KTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH0sXG5cdFx0XHR9LFxuXHRcdFx0X21haW5Db250YWluZXJEaW1lbnNpb246IHsgd2lkdGg6IG9wdGlvbnMud2luZG93V2lkdGggPz8gMTAwMCwgaGVpZ2h0OiA4MDAgfSxcblx0XHRcdGxheW91dFBvbGljeTogeyB2aWV3cG9ydENsYXNzOiB7IGdldDogKCkgPT4gJ2Rlc2t0b3AnIH0gfSxcblx0XHRcdF9oYXNBcHBsaWVkSW5pdGlhbEVkaXRvclNwbGl0OiBvcHRpb25zLmhhc0FwcGxpZWRJbml0aWFsRWRpdG9yU3BsaXQgPz8gZmFsc2UsXG5cdFx0XHRfc2F2ZWRQYXJ0U2l6ZXM6IHt9LFxuXHRcdFx0X2VkaXRvclJldmVhbGVkRXhwbGljaXRseTogZmFsc2UsXG5cdFx0XHRfZWRpdG9yTWF4aW1pemVkOiBmYWxzZSxcblx0XHRcdF9lZGl0b3JQYXJ0QXV0b1Zpc2liaWxpdHlTdXBwcmVzc2lvbkNvdW50OiBvcHRpb25zLnN1cHByZXNzaW9uQ291bnQgPz8gMCxcblx0XHRcdF9yZXN0b3JlQXR0YWNoZWRFZGl0b3JNYXhpbWl6ZWRPblNob3c6IGZhbHNlLFxuXHRcdFx0X3Jlc3RvcmVTaWRlUGFuZUVkaXRvck1heGltaXplZE9uU2hvdzogZmFsc2UsXG5cdFx0XHRlZGl0b3JHcm91cFNlcnZpY2U6IG9wdGlvbnMuZWRpdG9yR3JvdXBTZXJ2aWNlLFxuXHRcdFx0cGFuZUNvbXBvc2l0ZVNlcnZpY2U6IHtcblx0XHRcdFx0Z2V0QWN0aXZlUGFuZUNvbXBvc2l0ZTogKCkgPT4gdW5kZWZpbmVkLFxuXHRcdFx0XHRoaWRlQWN0aXZlUGFuZUNvbXBvc2l0ZTogKCkgPT4geyB9LFxuXHRcdFx0XHRnZXRMYXN0QWN0aXZlUGFuZUNvbXBvc2l0ZUlkOiAoKSA9PiB1bmRlZmluZWQsXG5cdFx0XHRcdG9wZW5QYW5lQ29tcG9zaXRlOiAoKSA9PiB7IH0sXG5cdFx0XHR9LFxuXHRcdFx0dmlld0Rlc2NyaXB0b3JTZXJ2aWNlOiBvcHRpb25zLnZpZXdEZXNjcmlwdG9yU2VydmljZSA/PyB7IGdldERlZmF1bHRWaWV3Q29udGFpbmVyOiAoKSA9PiB1bmRlZmluZWQgfSxcblx0XHRcdC8vIGRvY2tlZCBib29ra2VlcGluZ1xuXHRcdFx0X2RvY2tlZEF1eGlsaWFyeUJhcldpZHRoOiBvcHRpb25zLmRvY2tlZFdpZHRoID8/IERvY2tlZEF1eGlsaWFyeUJhckNvbnRyb2xsZXIuREVGQVVMVF9XSURUSCxcblx0XHRcdF9zeW5jaW5nRWRpdG9yVmlzaWJpbGl0eTogZmFsc2UsXG5cdFx0XHRfZGV0YWlsSGlkZGVuRm9yRWRpdG9yUmVzaXplOiBmYWxzZSxcblx0XHRcdF9tZW1lbnRvOiBuZXcgRG9ja2VkRWRpdG9yU2l6ZU1lbWVudG8oKSxcblx0XHRcdC8vIHN0dWJzIGZvciB0aGUgaGVhdnkgYmFzZSBoZWxwZXJzIHRoZSBob29rcyBjYWxsXG5cdFx0XHRfc2F2ZVBhcnRWaXNpYmlsaXR5OiAoKSA9PiB7IGNvdW50cy5zYXZlKys7IH0sXG5cdFx0XHRfZmlyZURpZENoYW5nZVBhcnRWaXNpYmlsaXR5OiAocGFydElkOiBQYXJ0cywgdmlzaWJsZTogYm9vbGVhbiwgc291cmNlPzogJ3Jlc2l6ZScpID0+IHsgZXZlbnRzLnB1c2goeyBwYXJ0SWQsIHZpc2libGUsIC4uLihzb3VyY2UgPyB7IHNvdXJjZSB9IDoge30pIH0pOyB9LFxuXHRcdFx0X29uRGlkUmV2ZWFsU2lkZVBhbmU6IHsgZmlyZTogKCkgPT4geyBzaWRlUGFuZVJldmVhbHMucHVzaCh0cnVlKTsgfSB9LFxuXHRcdFx0X29uRGlkQ2hhbmdlRWRpdG9yTWF4aW1pemVkOiB7IGZpcmU6ICgpID0+IHsgfSB9LFxuXHRcdFx0X29uV2lsbFRvZ2dsZVNpZGVQYW5lOiB7IGZpcmU6ICgpID0+IHsgc2lkZVBhbmVUb2dnbGVFdmVudHMucHVzaCgnd2lsbCcpOyB9IH0sXG5cdFx0XHRfb25EaWRUb2dnbGVTaWRlUGFuZTogeyBmaXJlOiAoZXZlbnQ6IElTaWRlUGFuZVRvZ2dsZUV2ZW50KSA9PiB7IHNpZGVQYW5lVG9nZ2xlRXZlbnRzLnB1c2goeyBkaWQ6IGV2ZW50IH0pOyB9IH0sXG5cdFx0XHRfbm90aWZ5Q29udGFpbmVyRGlkTGF5b3V0OiAoKSA9PiB7IH0sXG5cdFx0XHRfbGF5b3V0RG9ja2VkQXV4QmFyOiAoKSA9PiB7IGNvdW50cy5sYXlvdXQrKzsgfSxcblx0XHRcdGxheW91dE1vYmlsZVNpZGViYXI6ICgpID0+IHsgfSxcblx0XHRcdC4uLihvcHRpb25zLmVkaXRvck1heGltaXplID8ge30gOiB7IHNldEVkaXRvck1heGltaXplZDogKCkgPT4geyB9IH0pLFxuXHRcdFx0aGFzRm9jdXM6IChwYXJ0OiBQYXJ0cykgPT4gb3B0aW9ucy5mb2N1c2VkUGFydCA9PT0gcGFydCxcblx0XHRcdGZvY3VzUGFydDogKHBhcnQ6IFBhcnRzKSA9PiB7IGZvY3VzZWRQYXJ0cy5wdXNoKHBhcnQpOyB9LFxuXHRcdFx0bGF5b3V0OiAoKSA9PiB7IH0sXG5cdFx0XHRtb2JpbGVOYXZTdGFjazoge1xuXHRcdFx0XHRoYXM6IChsYXllcjogc3RyaW5nKSA9PiBtb2JpbGVOYXZMYXllcnMuaW5jbHVkZXMobGF5ZXIpLFxuXHRcdFx0XHRwdXNoOiAobGF5ZXI6IHN0cmluZykgPT4geyBtb2JpbGVOYXZMYXllcnMucHVzaChsYXllcik7IH0sXG5cdFx0XHRcdHBvcFNpbGVudGx5OiAobGF5ZXI6IHN0cmluZykgPT4geyBtb2JpbGVOYXZMYXllcnMuc3BsaWNlKG1vYmlsZU5hdkxheWVycy5pbmRleE9mKGxheWVyKSwgMSk7IH0sXG5cdFx0XHR9LFxuXHRcdFx0Y3VzdG9tVmlld0dyaWRQYXJ0U2VydmljZTogeyBzZXRWaWV3OiAoZGVzY3JpcHRvcjogb2JqZWN0IHwgdW5kZWZpbmVkKSA9PiB7IHJlbmRlcmVkQ3VzdG9tVmlld3MucHVzaChkZXNjcmlwdG9yKTsgfSwgZm9jdXNBY3RpdmVWaWV3OiAoKSA9PiB7IH0gfSxcblx0XHRcdF9jdXN0b21WaWV3VmlzaWJsZUtleTogeyBzZXQ6ICgpID0+IHsgfSB9LFxuXHRcdFx0c2Vzc2lvbnNQYXJ0U2VydmljZTogeyBmb2N1c1Nlc3Npb246ICgpID0+IHsgZm9jdXNlZFNlc3Npb25zKys7IH0gfSxcblx0XHRcdHNlc3Npb25zU2VydmljZTogeyBhY3RpdmVTZXNzaW9uOiB7IGdldDogKCkgPT4gdW5kZWZpbmVkIH0gfSxcblx0XHRcdC8vIGNhcHR1cmVzXG5cdFx0XHRyZXNpemVzLFxuXHRcdFx0ZGlzdHJpYnV0aW9ucyxcblx0XHRcdHZpc2liaWxpdHlDaGFuZ2VzLFxuXHRcdFx0ZXZlbnRzLFxuXHRcdFx0Y2xhc3NUb2dnbGVzLFxuXHRcdFx0Y291bnRzLFxuXHRcdFx0c2lkZVBhbmVSZXZlYWxzLFxuXHRcdFx0Zm9jdXNlZFBhcnRzLFxuXHRcdFx0cmVuZGVyZWRDdXN0b21WaWV3cyxcblx0XHRcdGdyaWRWaXNpYmlsaXR5LFxuXHRcdFx0bW9iaWxlTmF2TGF5ZXJzLFxuXHRcdFx0c2lkZVBhbmVUb2dnbGVFdmVudHMsXG5cdFx0XHRnZXQgZm9jdXNlZFNlc3Npb25zKCkgeyByZXR1cm4gZm9jdXNlZFNlc3Npb25zOyB9LFxuXHRcdH07XG5cblx0XHRPYmplY3Quc2V0UHJvdG90eXBlT2YoaG9zdCwgb3B0aW9ucy5zaW5nbGUgPyBTaW5nbGVQYW5lV29ya2JlbmNoLnByb3RvdHlwZSA6IFdvcmtiZW5jaC5wcm90b3R5cGUpO1xuXHRcdHJldHVybiBob3N0IGFzIHVua25vd24gYXMgSVRlc3RXb3JrYmVuY2g7XG5cdH1cblxuXHQvLyBUaGUgcmVhbCBTcGxpdFZpZXcgY2FsbHMgYFBhcnQuc2V0VmlzaWJsZWAgd2hlbiBhIHZpZXcncyBncmlkIHZpc2liaWxpdHlcblx0Ly8gY2hhbmdlcywgd2hpY2ggdGhlIHdvcmtiZW5jaCBtYXBzIGJhY2sgb250byB0aGUgZGVzaXJlZCBwYXJ0IHZpc2liaWxpdHkuXG5cdC8vIFJlcHJvZHVjZSB0aGF0IGZlZWRiYWNrIHNvIHRlc3RzIGNhdGNoIHN0YXRlIGJlaW5nIG92ZXJ3cml0dGVuIGJ5IGl0LlxuXHRmdW5jdGlvbiBub3RpZnlQYXJ0VmlzaWJpbGl0eU9uKGhvc3Q6IElUZXN0V29ya2JlbmNoLCB2aWV3OiBvYmplY3QsIHZpc2libGU6IGJvb2xlYW4pOiB2b2lkIHtcblx0XHRpZiAoKGhvc3QgYXMgdW5rbm93biBhcyB7IF9hcHBseWluZ0N1c3RvbVZpZXdHcmlkVmlzaWJpbGl0eTogYm9vbGVhbiB9KS5fYXBwbHlpbmdDdXN0b21WaWV3R3JpZFZpc2liaWxpdHkpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0aWYgKHZpZXcgPT09IGhvc3Quc2Vzc2lvbnNQYXJ0Vmlldykge1xuXHRcdFx0c2V0U2Vzc2lvbnNIaWRkZW4uY2FsbChob3N0LCAhdmlzaWJsZSk7XG5cdFx0fSBlbHNlIGlmICh2aWV3ID09PSBob3N0LnBhbmVsUGFydFZpZXcpIHtcblx0XHRcdHNldFBhbmVsSGlkZGVuLmNhbGwoaG9zdCwgIXZpc2libGUpO1xuXHRcdH0gZWxzZSBpZiAodmlldyA9PT0gaG9zdC5hdXhpbGlhcnlCYXJQYXJ0Vmlldykge1xuXHRcdFx0aG9zdC5zZXRBdXhpbGlhcnlCYXJIaWRkZW4oIXZpc2libGUpO1xuXHRcdH1cblx0fVxuXG5cdC8vIC0tLSBFZGl0b3Igc3BsaXQgLyByZXZlYWwgLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG5cblx0dGVzdCgnYWN0aXZhdGluZyBhIG1pbmltaXplZCBTZXNzaW9ucyBvciBFZGl0b3IgUGFydCByZXNpemVzIGl0cyBzaWJsaW5nIHRvIG1pbmltdW0gd2lkdGgnLCAoKSA9PiB7XG5cdFx0Y29uc3Qgc2Vzc2lvbnNNaW5pbWl6ZWQgPSBjcmVhdGVIb3N0KHsgc2Vzc2lvbnNXaWR0aDogMzAwLCBlZGl0b3JXaWR0aDogNzAwLCBwYXJ0VmlzaWJpbGl0eTogeyBlZGl0b3I6IHRydWUgfSB9KTtcblx0XHRjb25zdCBlZGl0b3JNaW5pbWl6ZWQgPSBjcmVhdGVIb3N0KHsgc2Vzc2lvbnNXaWR0aDogNzAwLCBlZGl0b3JXaWR0aDogMzAwLCBwYXJ0VmlzaWJpbGl0eTogeyBlZGl0b3I6IHRydWUgfSB9KTtcblx0XHRjb25zdCBzaW5nbGVQYW5lU2Vzc2lvbnNNaW5pbWl6ZWQgPSBjcmVhdGVIb3N0KHsgc2luZ2xlOiB0cnVlLCBzZXNzaW9uc1dpZHRoOiAzMDAsIGVkaXRvcldpZHRoOiA4MDAsIGRvY2tlZFdpZHRoOiAyNTAsIHBhcnRWaXNpYmlsaXR5OiB7IGVkaXRvcjogdHJ1ZSwgYXV4aWxpYXJ5QmFyOiB0cnVlIH0gfSk7XG5cdFx0Y29uc3Qgc2luZ2xlUGFuZUVkaXRvck1pbmltaXplZCA9IGNyZWF0ZUhvc3QoeyBzaW5nbGU6IHRydWUsIHNlc3Npb25zV2lkdGg6IDcwMCwgZWRpdG9yV2lkdGg6IDU1MCwgZG9ja2VkV2lkdGg6IDI1MCwgcGFydFZpc2liaWxpdHk6IHsgZWRpdG9yOiB0cnVlLCBhdXhpbGlhcnlCYXI6IHRydWUgfSB9KTtcblx0XHRjb25zdCBuZWl0aGVyTWluaW1pemVkID0gY3JlYXRlSG9zdCh7IHNlc3Npb25zV2lkdGg6IDMwMSwgZWRpdG9yV2lkdGg6IDMwMSwgcGFydFZpc2liaWxpdHk6IHsgZWRpdG9yOiB0cnVlIH0gfSk7XG5cdFx0Y29uc3QgZWRpdG9ySGlkZGVuID0gY3JlYXRlSG9zdCh7IHNlc3Npb25zV2lkdGg6IDMwMCwgZWRpdG9yV2lkdGg6IDcwMCwgcGFydFZpc2liaWxpdHk6IHsgZWRpdG9yOiBmYWxzZSB9IH0pO1xuXG5cdFx0cmVzdG9yZVNlc3Npb25zUGFydE9uQWN0aXZhdGlvbi5jYWxsKHNlc3Npb25zTWluaW1pemVkKTtcblx0XHRyZXN0b3JlRWRpdG9yUGFydE9uQWN0aXZhdGlvbi5jYWxsKGVkaXRvck1pbmltaXplZCk7XG5cdFx0cmVzdG9yZVNlc3Npb25zUGFydE9uQWN0aXZhdGlvbi5jYWxsKHNpbmdsZVBhbmVTZXNzaW9uc01pbmltaXplZCk7XG5cdFx0cmVzdG9yZUVkaXRvclBhcnRPbkFjdGl2YXRpb24uY2FsbChzaW5nbGVQYW5lRWRpdG9yTWluaW1pemVkKTtcblx0XHRyZXN0b3JlU2Vzc2lvbnNQYXJ0T25BY3RpdmF0aW9uLmNhbGwobmVpdGhlck1pbmltaXplZCk7XG5cdFx0cmVzdG9yZUVkaXRvclBhcnRPbkFjdGl2YXRpb24uY2FsbChuZWl0aGVyTWluaW1pemVkKTtcblx0XHRyZXN0b3JlU2Vzc2lvbnNQYXJ0T25BY3RpdmF0aW9uLmNhbGwoZWRpdG9ySGlkZGVuKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoW1xuXHRcdFx0c2Vzc2lvbnNNaW5pbWl6ZWQucmVzaXplcyxcblx0XHRcdGVkaXRvck1pbmltaXplZC5yZXNpemVzLFxuXHRcdFx0c2luZ2xlUGFuZVNlc3Npb25zTWluaW1pemVkLnJlc2l6ZXMsXG5cdFx0XHRzaW5nbGVQYW5lRWRpdG9yTWluaW1pemVkLnJlc2l6ZXMsXG5cdFx0XHRuZWl0aGVyTWluaW1pemVkLnJlc2l6ZXMsXG5cdFx0XHRlZGl0b3JIaWRkZW4ucmVzaXplcyxcblx0XHRdLCBbXG5cdFx0XHRbeyB3aWR0aDogMzAwLCBoZWlnaHQ6IDgwMCB9XSxcblx0XHRcdFt7IHdpZHRoOiAzMDAsIGhlaWdodDogODAwIH1dLFxuXHRcdFx0W3sgd2lkdGg6IDU1MCwgaGVpZ2h0OiA4MDAgfV0sXG5cdFx0XHRbeyB3aWR0aDogMzAwLCBoZWlnaHQ6IDgwMCB9XSxcblx0XHRcdFtdLFxuXHRcdFx0W10sXG5cdFx0XSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3RyYWNrcyBlZGl0b3IgcGFuZSB2aXNpYmlsaXR5IGFjcm9zcyBlZGl0b3IgYW5kIGF1eGlsaWFyeSBiYXIgY2hhbmdlcycsICgpID0+IHtcblx0XHRjb25zdCBob3N0ID0gY3JlYXRlSG9zdCh7IHBhcnRWaXNpYmlsaXR5OiB7IGVkaXRvcjogZmFsc2UsIGF1eGlsaWFyeUJhcjogdHJ1ZSB9IH0pO1xuXG5cdFx0c2V0QXV4aWxpYXJ5QmFySGlkZGVuLmNhbGwoaG9zdCwgdHJ1ZSk7XG5cdFx0Y29uc3QgaGlkZGVuID0gaXNFZGl0b3JQYW5lVmlzaWJsZS5jYWxsKGhvc3QpO1xuXHRcdHNldEVkaXRvckhpZGRlbi5jYWxsKGhvc3QsIGZhbHNlKTtcblx0XHRjb25zdCBlZGl0b3JWaXNpYmxlID0gaXNFZGl0b3JQYW5lVmlzaWJsZS5jYWxsKGhvc3QpO1xuXHRcdHNldEVkaXRvckhpZGRlbi5jYWxsKGhvc3QsIHRydWUpO1xuXHRcdGNvbnN0IGNsb3NlZCA9IGlzRWRpdG9yUGFuZVZpc2libGUuY2FsbChob3N0KTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0aGlkZGVuLFxuXHRcdFx0ZWRpdG9yVmlzaWJsZSxcblx0XHRcdGNsb3NlZCxcblx0XHRcdG5vRWRpdG9yUGFuZUNsYXNzZXM6IGhvc3QuY2xhc3NUb2dnbGVzLmZpbHRlcih0b2dnbGUgPT4gdG9nZ2xlLm5hbWUgPT09ICdub2VkaXRvcnBhbmUnKSxcblx0XHR9LCB7XG5cdFx0XHRoaWRkZW46IGZhbHNlLFxuXHRcdFx0ZWRpdG9yVmlzaWJsZTogdHJ1ZSxcblx0XHRcdGNsb3NlZDogZmFsc2UsXG5cdFx0XHRub0VkaXRvclBhbmVDbGFzc2VzOiBbXG5cdFx0XHRcdHsgbmFtZTogJ25vZWRpdG9ycGFuZScsIGZvcmNlOiB0cnVlIH0sXG5cdFx0XHRcdHsgbmFtZTogJ25vZWRpdG9ycGFuZScsIGZvcmNlOiBmYWxzZSB9LFxuXHRcdFx0XHR7IG5hbWU6ICdub2VkaXRvcnBhbmUnLCBmb3JjZTogdHJ1ZSB9LFxuXHRcdFx0XSxcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgncmVhZHMgdGhlIHNpbmdsZS1wYW5lIGVkaXRvciBncmlkIG5vZGUgdmlzaWJpbGl0eScsICgpID0+IHtcblx0XHRjb25zdCBob3N0ID0gY3JlYXRlSG9zdCh7IHNpbmdsZTogdHJ1ZSwgcGFydFZpc2liaWxpdHk6IHsgZWRpdG9yOiBmYWxzZSwgYXV4aWxpYXJ5QmFyOiB0cnVlIH0gfSkgYXMgSVRlc3RXb3JrYmVuY2ggJiB7XG5cdFx0XHR3b3JrYmVuY2hHcmlkOiB7IGlzVmlld1Zpc2libGUodmlldzogb2JqZWN0KTogYm9vbGVhbiB9O1xuXHRcdH07XG5cdFx0aG9zdC53b3JrYmVuY2hHcmlkLmlzVmlld1Zpc2libGUgPSAoKSA9PiBmYWxzZTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChpc1NpbmdsZVBhbmVFZGl0b3JQYW5lVmlzaWJsZS5jYWxsKGhvc3QpLCBmYWxzZSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3NpbmdsZS1wYW5lIHNlY29uZGFyeSBzaWRlYmFyIHRvZ2dsZSBjb250cm9scyB0aGUgd2hvbGUgc2lkZSBwYW5lJywgKCkgPT4ge1xuXHRcdGNvbnN0IGhvc3QgPSBjcmVhdGVIb3N0KHsgc2luZ2xlOiB0cnVlLCBwYXJ0VmlzaWJpbGl0eTogeyBlZGl0b3I6IHRydWUsIGF1eGlsaWFyeUJhcjogdHJ1ZSB9LCBmb2N1c2VkUGFydDogUGFydHMuRURJVE9SX1BBUlQgfSk7XG5cblx0XHR0b2dnbGVTZWNvbmRhcnlTaWRlQmFyU2luZ2xlUGFuZS5jYWxsKGhvc3QpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRlZGl0b3JWaXNpYmxlOiBob3N0LnBhcnRWaXNpYmlsaXR5LmVkaXRvcixcblx0XHRcdGF1eGlsaWFyeUJhclZpc2libGU6IGhvc3QucGFydFZpc2liaWxpdHkuYXV4aWxpYXJ5QmFyLFxuXHRcdFx0c2Vjb25kYXJ5U2lkZUJhclZpc2libGU6IGlzU2Vjb25kYXJ5U2lkZUJhclZpc2libGVTaW5nbGVQYW5lLmNhbGwoaG9zdCksXG5cdFx0XHRmb2N1c2VkUGFydHM6IGhvc3QuZm9jdXNlZFBhcnRzLFxuXHRcdFx0dG9nZ2xlRXZlbnRzOiBob3N0LnNpZGVQYW5lVG9nZ2xlRXZlbnRzLFxuXHRcdH0sIHtcblx0XHRcdGVkaXRvclZpc2libGU6IGZhbHNlLFxuXHRcdFx0YXV4aWxpYXJ5QmFyVmlzaWJsZTogZmFsc2UsXG5cdFx0XHRzZWNvbmRhcnlTaWRlQmFyVmlzaWJsZTogZmFsc2UsXG5cdFx0XHRmb2N1c2VkUGFydHM6IFtQYXJ0cy5TRVNTSU9OU19QQVJUXSxcblx0XHRcdHRvZ2dsZUV2ZW50czogW1xuXHRcdFx0XHQnd2lsbCcsXG5cdFx0XHRcdHsgZGlkOiB7IGJlZm9yZTogeyBlZGl0b3I6IHRydWUsIGF1eGlsaWFyeUJhcjogdHJ1ZSB9LCBhZnRlcjogeyBlZGl0b3I6IGZhbHNlLCBhdXhpbGlhcnlCYXI6IGZhbHNlIH0gfSB9LFxuXHRcdFx0XSxcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnc2lkZSBwYW5lIHRvZ2dsZSByZXN0b3JlcyB0aGUgZWRpdG9yIGFuZCBhdXhpbGlhcnkgYmFyIHZpc2liaWxpdHkgZnJvbSBiZWZvcmUgaGlkZScsICgpID0+IHtcblx0XHRjb25zdCBob3N0ID0gY3JlYXRlSG9zdCh7IHNpbmdsZTogdHJ1ZSwgcGFydFZpc2liaWxpdHk6IHsgZWRpdG9yOiB0cnVlLCBhdXhpbGlhcnlCYXI6IGZhbHNlIH0gfSk7XG5cblx0XHR0b2dnbGVTaWRlUGFuZS5jYWxsKGhvc3QpO1xuXHRcdHRvZ2dsZVNpZGVQYW5lLmNhbGwoaG9zdCk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdGVkaXRvclZpc2libGU6IGhvc3QucGFydFZpc2liaWxpdHkuZWRpdG9yLFxuXHRcdFx0YXV4aWxpYXJ5QmFyVmlzaWJsZTogaG9zdC5wYXJ0VmlzaWJpbGl0eS5hdXhpbGlhcnlCYXIsXG5cdFx0XHRyZXZlYWxDb3VudDogaG9zdC5zaWRlUGFuZVJldmVhbHMubGVuZ3RoLFxuXHRcdH0sIHtcblx0XHRcdGVkaXRvclZpc2libGU6IHRydWUsXG5cdFx0XHRhdXhpbGlhcnlCYXJWaXNpYmxlOiBmYWxzZSxcblx0XHRcdHJldmVhbENvdW50OiAxLFxuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdzaW5nbGUtcGFuZSBzaWRlIHBhbmUgdG9nZ2xlIGNsb3NlcyB0aGUgd2hvbGUgc2lkZSBwYW5lIGFuZCByZXN0b3JlcyBtYXhpbWl6YXRpb24gd2hlbiByZW9wZW5lZCcsICgpID0+IHtcblx0XHRjb25zdCBob3N0ID0gY3JlYXRlSG9zdCh7IHNpbmdsZTogdHJ1ZSwgcGFydFZpc2liaWxpdHk6IHsgZWRpdG9yOiB0cnVlLCBhdXhpbGlhcnlCYXI6IHRydWUgfSB9KTtcblx0XHRjb25zdCBtYXhpbWl6ZWRTdGF0ZXM6IGJvb2xlYW5bXSA9IFtdO1xuXHRcdGhvc3QuX2VkaXRvck1heGltaXplZCA9IHRydWU7XG5cdFx0aG9zdC5zZXRFZGl0b3JNYXhpbWl6ZWQgPSBtYXhpbWl6ZWQgPT4ge1xuXHRcdFx0bWF4aW1pemVkU3RhdGVzLnB1c2gobWF4aW1pemVkKTtcblx0XHRcdGhvc3QuX2VkaXRvck1heGltaXplZCA9IG1heGltaXplZDtcblx0XHR9O1xuXG5cdFx0Y29uc3QgdmlzaWJsZUFmdGVySGlkZSA9IHRvZ2dsZVNpZGVQYW5lLmNhbGwoaG9zdCk7XG5cdFx0Y29uc3QgaGlkZGVuU3RhdGUgPSB7XG5cdFx0XHR2aXNpYmxlOiB2aXNpYmxlQWZ0ZXJIaWRlLFxuXHRcdFx0ZWRpdG9yVmlzaWJsZTogaG9zdC5wYXJ0VmlzaWJpbGl0eS5lZGl0b3IsXG5cdFx0XHRhdXhpbGlhcnlCYXJWaXNpYmxlOiBob3N0LnBhcnRWaXNpYmlsaXR5LmF1eGlsaWFyeUJhcixcblx0XHRcdGVkaXRvck1heGltaXplZDogaG9zdC5fZWRpdG9yTWF4aW1pemVkLFxuXHRcdH07XG5cdFx0Y29uc3QgdmlzaWJsZUFmdGVyU2hvdyA9IHRvZ2dsZVNpZGVQYW5lLmNhbGwoaG9zdCk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdGhpZGRlblN0YXRlLFxuXHRcdFx0dmlzaWJsZUFmdGVyU2hvdyxcblx0XHRcdHJlc3RvcmVkRWRpdG9yVmlzaWJsZTogaG9zdC5wYXJ0VmlzaWJpbGl0eS5lZGl0b3IsXG5cdFx0XHRyZXN0b3JlZEF1eGlsaWFyeUJhclZpc2libGU6IGhvc3QucGFydFZpc2liaWxpdHkuYXV4aWxpYXJ5QmFyLFxuXHRcdFx0ZWRpdG9yTWF4aW1pemVkOiBob3N0Ll9lZGl0b3JNYXhpbWl6ZWQsXG5cdFx0XHRtYXhpbWl6ZWRTdGF0ZXMsXG5cdFx0fSwge1xuXHRcdFx0aGlkZGVuU3RhdGU6IHtcblx0XHRcdFx0dmlzaWJsZTogZmFsc2UsXG5cdFx0XHRcdGVkaXRvclZpc2libGU6IGZhbHNlLFxuXHRcdFx0XHRhdXhpbGlhcnlCYXJWaXNpYmxlOiBmYWxzZSxcblx0XHRcdFx0ZWRpdG9yTWF4aW1pemVkOiBmYWxzZSxcblx0XHRcdH0sXG5cdFx0XHR2aXNpYmxlQWZ0ZXJTaG93OiB0cnVlLFxuXHRcdFx0cmVzdG9yZWRFZGl0b3JWaXNpYmxlOiB0cnVlLFxuXHRcdFx0cmVzdG9yZWRBdXhpbGlhcnlCYXJWaXNpYmxlOiB0cnVlLFxuXHRcdFx0ZWRpdG9yTWF4aW1pemVkOiB0cnVlLFxuXHRcdFx0bWF4aW1pemVkU3RhdGVzOiBbZmFsc2UsIHRydWVdLFxuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCd1cGRhdGVzIHRoZSBzaW5nbGUtcGFuZSBlZGl0b3IgcGFuZSBjbGFzcyBhZnRlciB0aGUgZ3JpZCBub2RlIHZpc2liaWxpdHkgY2hhbmdlcycsICgpID0+IHtcblx0XHRjb25zdCBob3N0ID0gY3JlYXRlSG9zdCh7IHNpbmdsZTogdHJ1ZSwgcGFydFZpc2liaWxpdHk6IHsgZWRpdG9yOiB0cnVlLCBhdXhpbGlhcnlCYXI6IGZhbHNlIH0gfSk7XG5cblx0XHRzZXRFZGl0b3JIaWRkZW4uY2FsbChob3N0LCB0cnVlKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoXG5cdFx0XHRob3N0LmNsYXNzVG9nZ2xlcy5maWx0ZXIodG9nZ2xlID0+IHRvZ2dsZS5uYW1lID09PSAnbm9lZGl0b3JwYW5lJyksXG5cdFx0XHRbeyBuYW1lOiAnbm9lZGl0b3JwYW5lJywgZm9yY2U6IHRydWUgfV1cblx0XHQpO1xuXHR9KTtcblxuXHR0ZXN0KCdhcHBsaWVzIGFuIGV2ZW4gZWRpdG9yIHNwbGl0IHRoZSBmaXJzdCB0aW1lIHRoZSBlZGl0b3IgaXMgcmV2ZWFsZWQnLCAoKSA9PiB7XG5cdFx0Y29uc3QgaG9zdCA9IGNyZWF0ZUhvc3QoeyBzZXNzaW9uc1dpZHRoOiAxMDAwLCB3aW5kb3dXaWR0aDogMTAwMCB9KTtcblxuXHRcdHNldEVkaXRvckhpZGRlbi5jYWxsKGhvc3QsIGZhbHNlKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0ZWRpdG9yVmlzaWJsZTogaG9zdC5wYXJ0VmlzaWJpbGl0eS5lZGl0b3IsXG5cdFx0XHRhcHBsaWVkU3BsaXQ6IGhvc3QuX2hhc0FwcGxpZWRJbml0aWFsRWRpdG9yU3BsaXQsXG5cdFx0XHR2aXNpYmlsaXR5Q2hhbmdlczogaG9zdC52aXNpYmlsaXR5Q2hhbmdlcyxcblx0XHRcdHJlc2l6ZXM6IGhvc3QucmVzaXplcyxcblx0XHR9LCB7XG5cdFx0XHRlZGl0b3JWaXNpYmxlOiB0cnVlLFxuXHRcdFx0YXBwbGllZFNwbGl0OiB0cnVlLFxuXHRcdFx0dmlzaWJpbGl0eUNoYW5nZXM6IFt0cnVlXSxcblx0XHRcdHJlc2l6ZXM6IFt7IHdpZHRoOiA1MDAsIGhlaWdodDogODAwIH1dLFxuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdzaW5nbGUtcGFuZSBzaWRlYmFyIHZpc2liaWxpdHkgbGVhdmVzIHRoZSBlZGl0b3Igd2lkdGggdW5jaGFuZ2VkJywgKCkgPT4ge1xuXHRcdGNvbnN0IGhvc3QgPSBjcmVhdGVIb3N0KHsgc2luZ2xlOiB0cnVlLCBzaWRlQmFyV2lkdGg6IDI4MCwgZWRpdG9yV2lkdGg6IDYyMCwgcGFydFZpc2liaWxpdHk6IHsgc2lkZWJhcjogdHJ1ZSwgZWRpdG9yOiB0cnVlLCBhdXhpbGlhcnlCYXI6IHRydWUgfSB9KTtcblxuXHRcdHNldFNpZGVCYXJIaWRkZW4uY2FsbChob3N0LCB0cnVlKTtcblx0XHRjb25zdCB3aWR0aHNBZnRlckhpZGUgPSB7XG5cdFx0XHRzZXNzaW9uczogaG9zdC53b3JrYmVuY2hHcmlkLmdldFZpZXdTaXplKGhvc3Quc2Vzc2lvbnNQYXJ0Vmlldykud2lkdGgsXG5cdFx0XHRlZGl0b3I6IGhvc3Qud29ya2JlbmNoR3JpZC5nZXRWaWV3U2l6ZShob3N0LmVkaXRvclBhcnRWaWV3KS53aWR0aCxcblx0XHR9O1xuXHRcdHNldFNpZGVCYXJIaWRkZW4uY2FsbChob3N0LCBmYWxzZSk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdHNpZGViYXJWaXNpYmxlOiBob3N0LnBhcnRWaXNpYmlsaXR5LnNpZGViYXIsXG5cdFx0XHR2aXNpYmlsaXR5Q2hhbmdlczogaG9zdC52aXNpYmlsaXR5Q2hhbmdlcyxcblx0XHRcdHdpZHRoc0FmdGVySGlkZSxcblx0XHRcdHNlc3Npb25zV2lkdGg6IGhvc3Qud29ya2JlbmNoR3JpZC5nZXRWaWV3U2l6ZShob3N0LnNlc3Npb25zUGFydFZpZXcpLndpZHRoLFxuXHRcdFx0ZWRpdG9yV2lkdGg6IGhvc3Qud29ya2JlbmNoR3JpZC5nZXRWaWV3U2l6ZShob3N0LmVkaXRvclBhcnRWaWV3KS53aWR0aCxcblx0XHRcdHJlc2l6ZXM6IGhvc3QucmVzaXplcyxcblx0XHRcdGxheW91dENvdW50OiBob3N0LmNvdW50cy5sYXlvdXQsXG5cdFx0fSwge1xuXHRcdFx0c2lkZWJhclZpc2libGU6IHRydWUsXG5cdFx0XHR2aXNpYmlsaXR5Q2hhbmdlczogW2ZhbHNlLCB0cnVlXSxcblx0XHRcdHdpZHRoc0FmdGVySGlkZTogeyBzZXNzaW9uczogMTI4MCwgZWRpdG9yOiA2MjAgfSxcblx0XHRcdHNlc3Npb25zV2lkdGg6IDEwMDAsXG5cdFx0XHRlZGl0b3JXaWR0aDogNjIwLFxuXHRcdFx0cmVzaXplczogW10sXG5cdFx0XHRsYXlvdXRDb3VudDogMCxcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnc3RhbmRhcmQgbGF5b3V0IHNpZGViYXIgaGlkZSBkb2VzIG5vdCBncm93IHRoZSBlZGl0b3InLCAoKSA9PiB7XG5cdFx0Y29uc3QgaG9zdCA9IGNyZWF0ZUhvc3QoeyBzaWRlQmFyV2lkdGg6IDI4MCwgZWRpdG9yV2lkdGg6IDYyMCwgcGFydFZpc2liaWxpdHk6IHsgc2lkZWJhcjogdHJ1ZSwgZWRpdG9yOiB0cnVlLCBhdXhpbGlhcnlCYXI6IHRydWUgfSB9KTtcblxuXHRcdHNldFNpZGVCYXJIaWRkZW4uY2FsbChob3N0LCB0cnVlKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0c2lkZWJhclZpc2libGU6IGhvc3QucGFydFZpc2liaWxpdHkuc2lkZWJhcixcblx0XHRcdHZpc2liaWxpdHlDaGFuZ2VzOiBob3N0LnZpc2liaWxpdHlDaGFuZ2VzLFxuXHRcdFx0cmVzaXplczogaG9zdC5yZXNpemVzLFxuXHRcdH0sIHtcblx0XHRcdHNpZGViYXJWaXNpYmxlOiBmYWxzZSxcblx0XHRcdHZpc2liaWxpdHlDaGFuZ2VzOiBbZmFsc2VdLFxuXHRcdFx0cmVzaXplczogW10sXG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3NpbmdsZS1wYW5lIHNpZGViYXIgdmlzaWJpbGl0eSBsZWF2ZXMgYSBkZXRhaWwtb25seSBwYW5lIHdpZHRoIHVuY2hhbmdlZCcsICgpID0+IHtcblx0XHRjb25zdCBob3N0ID0gY3JlYXRlSG9zdCh7IHNpbmdsZTogdHJ1ZSwgc2lkZUJhcldpZHRoOiAyODAsIGVkaXRvcldpZHRoOiA2MjAsIGRvY2tlZFdpZHRoOiAzMDAsIHBhcnRWaXNpYmlsaXR5OiB7IHNpZGViYXI6IHRydWUsIGVkaXRvcjogZmFsc2UsIGF1eGlsaWFyeUJhcjogdHJ1ZSB9IH0pO1xuXG5cdFx0c2V0U2lkZUJhckhpZGRlbi5jYWxsKGhvc3QsIHRydWUpO1xuXHRcdHNldFNpZGVCYXJIaWRkZW4uY2FsbChob3N0LCBmYWxzZSk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdGVkaXRvclZpc2libGU6IGhvc3QucGFydFZpc2liaWxpdHkuZWRpdG9yLFxuXHRcdFx0ZGV0YWlsV2lkdGg6IGhvc3QuX2RvY2tlZEF1eGlsaWFyeUJhcldpZHRoLFxuXHRcdFx0cmVzaXplczogaG9zdC5yZXNpemVzLFxuXHRcdFx0bGF5b3V0Q291bnQ6IGhvc3QuY291bnRzLmxheW91dCxcblx0XHR9LCB7XG5cdFx0XHRlZGl0b3JWaXNpYmxlOiBmYWxzZSxcblx0XHRcdGRldGFpbFdpZHRoOiAzMDAsXG5cdFx0XHRyZXNpemVzOiBbXSxcblx0XHRcdGxheW91dENvdW50OiAwLFxuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdzaW5nbGUtcGFuZSBkZXNjcmlwdG9yIHVzZXMgdGhlIGRvY2tlZCBkZXRhaWwgd2lkdGggZm9yIGEgZGV0YWlsLW9ubHkgZmlyc3Qgb3BlbicsICgpID0+IHtcblx0XHRjb25zdCBob3N0ID0gY3JlYXRlSG9zdCh7IHNpbmdsZTogdHJ1ZSwgZG9ja2VkV2lkdGg6IDMwMCwgcGFydFZpc2liaWxpdHk6IHsgZWRpdG9yOiBmYWxzZSwgYXV4aWxpYXJ5QmFyOiB0cnVlIH0gfSkgYXMgSUdyaWREZXNjcmlwdG9yVGVzdEhhcm5lc3M7XG5cdFx0aG9zdC5sYXlvdXRQb2xpY3kgPSB7XG5cdFx0XHRnZXRQYXJ0U2l6ZXM6ICgpID0+ICh7IHNpZGVCYXJTaXplOiAyODAsIGF1eGlsaWFyeUJhclNpemU6IDM0MCwgcGFuZWxTaXplOiAzMDAgfSksXG5cdFx0XHR2aWV3cG9ydENsYXNzOiB7IGdldDogKCkgPT4gJ2Rlc2t0b3AnIH0sXG5cdFx0fTtcblx0XHRob3N0LnRpdGxlQmFyUGFydFZpZXcgPSB7IG1pbmltdW1IZWlnaHQ6IDMwIH07XG5cblx0XHRjb25zdCBkZXNjcmlwdG9yID0gY3JlYXRlRGVza3RvcEdyaWREZXNjcmlwdG9yLmNhbGwoaG9zdCwgMTIwMCwgODAwKTtcblx0XHRjb25zdCBjb250ZW50U2VjdGlvbiA9IGRlc2NyaXB0b3Iucm9vdC5kYXRhWzFdIGFzIHsgZGF0YTogcmVhZG9ubHkgdW5rbm93bltdIH07XG5cdFx0Y29uc3QgcmlnaHRTZWN0aW9uID0gY29udGVudFNlY3Rpb24uZGF0YVsxXSBhcyB7IGRhdGE6IHJlYWRvbmx5IHVua25vd25bXSB9O1xuXHRcdGNvbnN0IHRvcFJpZ2h0U2VjdGlvbiA9IHJpZ2h0U2VjdGlvbi5kYXRhWzBdIGFzIHsgZGF0YTogcmVhZG9ubHkgdW5rbm93bltdIH07XG5cdFx0Y29uc3QgZWRpdG9yTm9kZSA9IHRvcFJpZ2h0U2VjdGlvbi5kYXRhWzFdIGFzIHsgc2l6ZTogbnVtYmVyOyB2aXNpYmxlOiBib29sZWFuIH07XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHsgc2l6ZTogZWRpdG9yTm9kZS5zaXplLCB2aXNpYmxlOiBlZGl0b3JOb2RlLnZpc2libGUgfSwgeyBzaXplOiAzMDAsIHZpc2libGU6IHRydWUgfSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3NpbmdsZS1wYW5lIGNvbnRhaW5lciByZXNpemUgcHJlc2VydmVzIHRoZSBzZXNzaW9ucy9lZGl0b3IgcmF0aW8nLCAoKSA9PiB7XG5cdFx0Y29uc3Qgc2Vzc2lvbnNQYXJ0VmlldyA9IHsgbWluaW11bVdpZHRoOiAzMDAgfTtcblx0XHRjb25zdCBlZGl0b3JQYXJ0VmlldyA9IHsgbWluaW11bVdpZHRoOiAzMDAgfTtcblx0XHRjb25zdCBzaXplcyA9IG5ldyBNYXA8b2JqZWN0LCBJVmlld1NpemU+KFtcblx0XHRcdFtzZXNzaW9uc1BhcnRWaWV3LCB7IHdpZHRoOiA5MDAsIGhlaWdodDogNzAwIH1dLFxuXHRcdFx0W2VkaXRvclBhcnRWaWV3LCB7IHdpZHRoOiA2MDAsIGhlaWdodDogNzAwIH1dLFxuXHRcdF0pO1xuXHRcdGNvbnN0IHJlc2l6ZXM6IElWaWV3U2l6ZVtdID0gW107XG5cdFx0Y29uc3QgaG9zdDogSVByb3BvcnRpb25hbFJlc2l6ZVRlc3RIYXJuZXNzID0ge1xuXHRcdFx0cGFydFZpc2liaWxpdHk6IHsgYXV4aWxpYXJ5QmFyOiBmYWxzZSB9LFxuXHRcdFx0c2Vzc2lvbnNQYXJ0Vmlldyxcblx0XHRcdGVkaXRvclBhcnRWaWV3LFxuXHRcdFx0d29ya2JlbmNoR3JpZDoge1xuXHRcdFx0XHRnZXRWaWV3U2l6ZTogdmlldyA9PiBzaXplcy5nZXQodmlldykhLFxuXHRcdFx0XHRyZXNpemVWaWV3OiAodmlldywgc2l6ZSkgPT4ge1xuXHRcdFx0XHRcdGNvbnN0IHByZXZpb3VzRWRpdG9yV2lkdGggPSBzaXplcy5nZXQodmlldykhLndpZHRoO1xuXHRcdFx0XHRcdHJlc2l6ZXMucHVzaChzaXplKTtcblx0XHRcdFx0XHRzaXplcy5zZXQodmlldywgc2l6ZSk7XG5cdFx0XHRcdFx0c2l6ZXMuc2V0KHNlc3Npb25zUGFydFZpZXcsIHtcblx0XHRcdFx0XHRcdHdpZHRoOiBzaXplcy5nZXQoc2Vzc2lvbnNQYXJ0VmlldykhLndpZHRoIC0gKHNpemUud2lkdGggLSBwcmV2aW91c0VkaXRvcldpZHRoKSxcblx0XHRcdFx0XHRcdGhlaWdodDogc2l6ZS5oZWlnaHQsXG5cdFx0XHRcdFx0fSk7XG5cdFx0XHRcdH0sXG5cdFx0XHR9LFxuXHRcdFx0X3J1bldpdGhFZGl0b3JSZXNpemVTeW5jU3VzcGVuZGVkOiBmbiA9PiBmbigpLFxuXHRcdH07XG5cdFx0T2JqZWN0LnNldFByb3RvdHlwZU9mKGhvc3QsIFNpbmdsZVBhbmVXb3JrYmVuY2gucHJvdG90eXBlKTtcblxuXHRcdHByZXNlcnZlU2Vzc2lvbnNFZGl0b3JSYXRpby5jYWxsKGhvc3QsIDYwMCwgNjAwKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0c2Vzc2lvbnM6IHNpemVzLmdldChzZXNzaW9uc1BhcnRWaWV3KSxcblx0XHRcdGVkaXRvcjogc2l6ZXMuZ2V0KGVkaXRvclBhcnRWaWV3KSxcblx0XHRcdHJlc2l6ZXMsXG5cdFx0fSwge1xuXHRcdFx0c2Vzc2lvbnM6IHsgd2lkdGg6IDc1MCwgaGVpZ2h0OiA3MDAgfSxcblx0XHRcdGVkaXRvcjogeyB3aWR0aDogNzUwLCBoZWlnaHQ6IDcwMCB9LFxuXHRcdFx0cmVzaXplczogW3sgd2lkdGg6IDc1MCwgaGVpZ2h0OiA3MDAgfV0sXG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3NpbmdsZS1wYW5lIGRldGFpbC1vbmx5IGNvbnRhaW5lciByZXNpemUgcHJlc2VydmVzIHRoZSBkZXRhaWwgd2lkdGgnLCAoKSA9PiB7XG5cdFx0Y29uc3Qgc2Vzc2lvbnNQYXJ0VmlldyA9IHsgbWluaW11bVdpZHRoOiAzMDAgfTtcblx0XHRjb25zdCBlZGl0b3JQYXJ0VmlldyA9IHsgbWluaW11bVdpZHRoOiAzMDAgfTtcblx0XHRjb25zdCBzaXplcyA9IG5ldyBNYXA8b2JqZWN0LCBJVmlld1NpemU+KFtcblx0XHRcdFtzZXNzaW9uc1BhcnRWaWV3LCB7IHdpZHRoOiA5MDAsIGhlaWdodDogNzAwIH1dLFxuXHRcdFx0W2VkaXRvclBhcnRWaWV3LCB7IHdpZHRoOiAzMDAsIGhlaWdodDogNzAwIH1dLFxuXHRcdF0pO1xuXHRcdGNvbnN0IHJlc2l6ZXM6IElWaWV3U2l6ZVtdID0gW107XG5cdFx0Y29uc3QgaG9zdDogSUNvbnRhaW5lclJlc2l6ZVRlc3RIYXJuZXNzID0ge1xuXHRcdFx0cGFydFZpc2liaWxpdHk6IHsgc2lkZWJhcjogdHJ1ZSwgZWRpdG9yOiBmYWxzZSwgYXV4aWxpYXJ5QmFyOiB0cnVlIH0sXG5cdFx0XHRtb2JpbGVUb3BCYXJFbGVtZW50OiB1bmRlZmluZWQsXG5cdFx0XHRsYXlvdXRQb2xpY3k6IHsgdmlld3BvcnRDbGFzczogeyBnZXQ6ICgpID0+ICdkZXNrdG9wJyB9IH0sXG5cdFx0XHRfbWFpbkNvbnRhaW5lckRpbWVuc2lvbjogeyB3aWR0aDogMTgwMCwgaGVpZ2h0OiA4MDAgfSxcblx0XHRcdHNlc3Npb25zUGFydFZpZXcsXG5cdFx0XHRlZGl0b3JQYXJ0Vmlldyxcblx0XHRcdHdvcmtiZW5jaEdyaWQ6IHtcblx0XHRcdFx0Z2V0Vmlld1NpemU6IHZpZXcgPT4gc2l6ZXMuZ2V0KHZpZXcpISxcblx0XHRcdFx0aXNWaWV3VmlzaWJsZTogKCkgPT4gdHJ1ZSxcblx0XHRcdFx0bGF5b3V0OiAoKSA9PiBzaXplcy5zZXQoc2Vzc2lvbnNQYXJ0VmlldywgeyB3aWR0aDogMTIwMCwgaGVpZ2h0OiA3MDAgfSksXG5cdFx0XHRcdHJlc2l6ZVZpZXc6IChfdmlldywgc2l6ZSkgPT4gcmVzaXplcy5wdXNoKHNpemUpLFxuXHRcdFx0fSxcblx0XHRcdF9ydW5XaXRoRWRpdG9yUmVzaXplU3luY1N1c3BlbmRlZDogZm4gPT4gZm4oKSxcblx0XHR9O1xuXHRcdE9iamVjdC5zZXRQcm90b3R5cGVPZihob3N0LCBTaW5nbGVQYW5lV29ya2JlbmNoLnByb3RvdHlwZSk7XG5cblx0XHRsYXlvdXRTaW5nbGVQYW5lR3JpZC5jYWxsKGhvc3QpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRzZXNzaW9uczogc2l6ZXMuZ2V0KHNlc3Npb25zUGFydFZpZXcpLFxuXHRcdFx0ZGV0YWlsOiBzaXplcy5nZXQoZWRpdG9yUGFydFZpZXcpLFxuXHRcdFx0cmVzaXplcyxcblx0XHR9LCB7XG5cdFx0XHRzZXNzaW9uczogeyB3aWR0aDogMTIwMCwgaGVpZ2h0OiA3MDAgfSxcblx0XHRcdGRldGFpbDogeyB3aWR0aDogMzAwLCBoZWlnaHQ6IDcwMCB9LFxuXHRcdFx0cmVzaXplczogW10sXG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3NpbmdsZS1wYW5lIGRlc2NyaXB0b3IgcmV0YWlucyBhIHBlcnNpc3RlZCBkZXRhaWwtb25seSB3aWR0aCBiZWxvdyB0aGUgZGVmYXVsdCcsICgpID0+IHtcblx0XHRjb25zdCBob3N0ID0gY3JlYXRlSG9zdCh7IHNpbmdsZTogdHJ1ZSwgZG9ja2VkV2lkdGg6IDIyMCwgcGFydFZpc2liaWxpdHk6IHsgZWRpdG9yOiBmYWxzZSwgYXV4aWxpYXJ5QmFyOiB0cnVlIH0gfSkgYXMgSUdyaWREZXNjcmlwdG9yVGVzdEhhcm5lc3M7XG5cdFx0aG9zdC5sYXlvdXRQb2xpY3kgPSB7XG5cdFx0XHRnZXRQYXJ0U2l6ZXM6ICgpID0+ICh7IHNpZGVCYXJTaXplOiAyODAsIGF1eGlsaWFyeUJhclNpemU6IDM0MCwgcGFuZWxTaXplOiAzMDAgfSksXG5cdFx0XHR2aWV3cG9ydENsYXNzOiB7IGdldDogKCkgPT4gJ2Rlc2t0b3AnIH0sXG5cdFx0fTtcblx0XHRob3N0LnRpdGxlQmFyUGFydFZpZXcgPSB7IG1pbmltdW1IZWlnaHQ6IDMwIH07XG5cblx0XHRjb25zdCBkZXNjcmlwdG9yID0gY3JlYXRlRGVza3RvcEdyaWREZXNjcmlwdG9yLmNhbGwoaG9zdCwgMTIwMCwgODAwKTtcblx0XHRjb25zdCBjb250ZW50U2VjdGlvbiA9IGRlc2NyaXB0b3Iucm9vdC5kYXRhWzFdIGFzIHsgZGF0YTogcmVhZG9ubHkgdW5rbm93bltdIH07XG5cdFx0Y29uc3QgcmlnaHRTZWN0aW9uID0gY29udGVudFNlY3Rpb24uZGF0YVsxXSBhcyB7IGRhdGE6IHJlYWRvbmx5IHVua25vd25bXSB9O1xuXHRcdGNvbnN0IHRvcFJpZ2h0U2VjdGlvbiA9IHJpZ2h0U2VjdGlvbi5kYXRhWzBdIGFzIHsgZGF0YTogcmVhZG9ubHkgdW5rbm93bltdIH07XG5cdFx0Y29uc3QgZWRpdG9yTm9kZSA9IHRvcFJpZ2h0U2VjdGlvbi5kYXRhWzFdIGFzIHsgc2l6ZTogbnVtYmVyOyB2aXNpYmxlOiBib29sZWFuIH07XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHsgc2l6ZTogZWRpdG9yTm9kZS5zaXplLCB2aXNpYmxlOiBlZGl0b3JOb2RlLnZpc2libGUgfSwgeyBzaXplOiAyMjAsIHZpc2libGU6IHRydWUgfSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3NpbmdsZS1wYW5lIGRlc2NyaXB0b3IgcmVzdG9yZXMgYW4gZWRpdG9yLW9ubHkgc2lkZSBwYW5lIGF0IGl0cyBzYXZlZCB3aWR0aCAobm8gZGV0YWlsIHN1YnRyYWN0aW9uKScsICgpID0+IHtcblx0XHQvLyBSb3VuZC10cmlwIGd1YXJkIGZvciB0aGUgY29tcG91bmRpbmctc2hyaW5rIGJ1ZzogYW4gRWRpdG9yLW9ubHkgc2Vzc2lvblxuXHRcdC8vIChkZXRhaWwgY2xvc2VkKSBwZXJzaXN0cyBpdHMgcHVyZSBlZGl0b3ItY29udGVudCB3aWR0aCwgYW5kIHRoZSBkZXNjcmlwdG9yXG5cdFx0Ly8gbXVzdCByZWNvbnN0cnVjdCB0aGUgbm9kZSBhdCBleGFjdGx5IHRoYXQgd2lkdGggKG5vIGRldGFpbCBhZGRlZCwgbm9uZSBsb3N0KS5cblx0XHRjb25zdCBob3N0ID0gY3JlYXRlSG9zdCh7IHNpbmdsZTogdHJ1ZSwgZG9ja2VkV2lkdGg6IDMwMCwgcGFydFZpc2liaWxpdHk6IHsgZWRpdG9yOiB0cnVlLCBhdXhpbGlhcnlCYXI6IGZhbHNlIH0gfSkgYXMgSUdyaWREZXNjcmlwdG9yVGVzdEhhcm5lc3M7XG5cdFx0aG9zdC5fc2F2ZWRQYXJ0U2l6ZXMgPSB7IGVkaXRvcjogOTAwIH07XG5cdFx0aG9zdC5sYXlvdXRQb2xpY3kgPSB7XG5cdFx0XHRnZXRQYXJ0U2l6ZXM6ICgpID0+ICh7IHNpZGVCYXJTaXplOiAyODAsIGF1eGlsaWFyeUJhclNpemU6IDM0MCwgcGFuZWxTaXplOiAzMDAgfSksXG5cdFx0XHR2aWV3cG9ydENsYXNzOiB7IGdldDogKCkgPT4gJ2Rlc2t0b3AnIH0sXG5cdFx0fTtcblx0XHRob3N0LnRpdGxlQmFyUGFydFZpZXcgPSB7IG1pbmltdW1IZWlnaHQ6IDMwIH07XG5cblx0XHRjb25zdCBkZXNjcmlwdG9yID0gY3JlYXRlRGVza3RvcEdyaWREZXNjcmlwdG9yLmNhbGwoaG9zdCwgMTYwMCwgODAwKTtcblx0XHRjb25zdCBjb250ZW50U2VjdGlvbiA9IGRlc2NyaXB0b3Iucm9vdC5kYXRhWzFdIGFzIHsgZGF0YTogcmVhZG9ubHkgdW5rbm93bltdIH07XG5cdFx0Y29uc3QgcmlnaHRTZWN0aW9uID0gY29udGVudFNlY3Rpb24uZGF0YVsxXSBhcyB7IGRhdGE6IHJlYWRvbmx5IHVua25vd25bXSB9O1xuXHRcdGNvbnN0IHRvcFJpZ2h0U2VjdGlvbiA9IHJpZ2h0U2VjdGlvbi5kYXRhWzBdIGFzIHsgZGF0YTogcmVhZG9ubHkgdW5rbm93bltdIH07XG5cdFx0Y29uc3QgZWRpdG9yTm9kZSA9IHRvcFJpZ2h0U2VjdGlvbi5kYXRhWzFdIGFzIHsgc2l6ZTogbnVtYmVyOyB2aXNpYmxlOiBib29sZWFuIH07XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHsgc2l6ZTogZWRpdG9yTm9kZS5zaXplLCB2aXNpYmxlOiBlZGl0b3JOb2RlLnZpc2libGUgfSwgeyBzaXplOiA5MDAsIHZpc2libGU6IHRydWUgfSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3NpbmdsZS1wYW5lIGRlc2NyaXB0b3IgZmFsbHMgYmFjayB0byB0aGUgZGVmYXVsdCB3aGVuIHRoZSBzYXZlZCBlZGl0b3Igd2lkdGggaXMgY29ycnVwdCAoMCAvIHN1Yi1taW5pbXVtKScsICgpID0+IHtcblx0XHQvLyBSZWdyZXNzaW9uIGZvciB0aGUgcmVsb2FkLTMwMCBidWc6IGEgYDBgIChvciBzdWItbWluaW11bSkgZWRpdG9yIHdpZHRoIGNvdWxkIGJlXG5cdFx0Ly8gcGVyc2lzdGVkIHdoZW4gdGhlIGhpZ2gtcHJpb3JpdHkgc2Vzc2lvbnMgcGFydCBzcXVlZXplZCB0aGUgZWRpdG9yIG5vZGUuIFRoZVxuXHRcdC8vIGRlc2NyaXB0b3IgbXVzdCB0cmVhdCBpdCBhcyBtaXNzaW5nIGFuZCB1c2UgdGhlIGRlZmF1bHQsIG5vdCBidWlsZCBhIDAtd2lkdGhcblx0XHQvLyBub2RlIHRoYXQgdGhlIGdyaWQgdGhlbiBjbGFtcHMgdG8gaXRzIDMwMHB4IG1pbmltdW0uXG5cdFx0Y29uc3QgYnVpbGQgPSAoc2F2ZWRFZGl0b3I6IG51bWJlciB8IHVuZGVmaW5lZCkgPT4ge1xuXHRcdFx0Y29uc3QgaG9zdCA9IGNyZWF0ZUhvc3QoeyBzaW5nbGU6IHRydWUsIGRvY2tlZFdpZHRoOiAzMDAsIHBhcnRWaXNpYmlsaXR5OiB7IGVkaXRvcjogdHJ1ZSwgYXV4aWxpYXJ5QmFyOiBmYWxzZSB9IH0pIGFzIElHcmlkRGVzY3JpcHRvclRlc3RIYXJuZXNzO1xuXHRcdFx0aG9zdC5fc2F2ZWRQYXJ0U2l6ZXMgPSBzYXZlZEVkaXRvciA9PT0gdW5kZWZpbmVkID8ge30gOiB7IGVkaXRvcjogc2F2ZWRFZGl0b3IgfTtcblx0XHRcdGhvc3QubGF5b3V0UG9saWN5ID0ge1xuXHRcdFx0XHRnZXRQYXJ0U2l6ZXM6ICgpID0+ICh7IHNpZGVCYXJTaXplOiAyODAsIGF1eGlsaWFyeUJhclNpemU6IDM0MCwgcGFuZWxTaXplOiAzMDAgfSksXG5cdFx0XHRcdHZpZXdwb3J0Q2xhc3M6IHsgZ2V0OiAoKSA9PiAnZGVza3RvcCcgfSxcblx0XHRcdH07XG5cdFx0XHRob3N0LnRpdGxlQmFyUGFydFZpZXcgPSB7IG1pbmltdW1IZWlnaHQ6IDMwIH07XG5cdFx0XHRjb25zdCBkZXNjcmlwdG9yID0gY3JlYXRlRGVza3RvcEdyaWREZXNjcmlwdG9yLmNhbGwoaG9zdCwgMTYwMCwgODAwKTtcblx0XHRcdGNvbnN0IGNvbnRlbnRTZWN0aW9uID0gZGVzY3JpcHRvci5yb290LmRhdGFbMV0gYXMgeyBkYXRhOiByZWFkb25seSB1bmtub3duW10gfTtcblx0XHRcdGNvbnN0IHJpZ2h0U2VjdGlvbiA9IGNvbnRlbnRTZWN0aW9uLmRhdGFbMV0gYXMgeyBkYXRhOiByZWFkb25seSB1bmtub3duW10gfTtcblx0XHRcdGNvbnN0IHRvcFJpZ2h0U2VjdGlvbiA9IHJpZ2h0U2VjdGlvbi5kYXRhWzBdIGFzIHsgZGF0YTogcmVhZG9ubHkgdW5rbm93bltdIH07XG5cdFx0XHRyZXR1cm4gKHRvcFJpZ2h0U2VjdGlvbi5kYXRhWzFdIGFzIHsgc2l6ZTogbnVtYmVyIH0pLnNpemU7XG5cdFx0fTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0Y29ycnVwdFplcm86IGJ1aWxkKDApLFxuXHRcdFx0c3ViTWluaW11bTogYnVpbGQoMTIwKSxcblx0XHRcdG1pc3Npbmc6IGJ1aWxkKHVuZGVmaW5lZCksXG5cdFx0XHR2YWxpZFNhdmVkOiBidWlsZCg3NTApLFxuXHRcdH0sIHtcblx0XHRcdGNvcnJ1cHRaZXJvOiA2MDAsXG5cdFx0XHRzdWJNaW5pbXVtOiA2MDAsXG5cdFx0XHRtaXNzaW5nOiA2MDAsXG5cdFx0XHR2YWxpZFNhdmVkOiA3NTAsXG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ19zYXZlUGFydFNpemVzIHBlcnNpc3RzIHRoZSBlZGl0b3Igd2lkdGggd2l0aG91dCByZWFkaW5nIHRoZSBkb2NrZWQgYXV4IGJhciBmcm9tIHRoZSBncmlkIChzaW5nbGUtcGFuZSknLCAoKSA9PiB7XG5cdFx0Ly8gUmVncmVzc2lvbiBmb3IgdGhlIHJlbG9hZC1sb3NpbmctcmVzaXplIGJ1ZzogaW4gc2luZ2xlLXBhbmUgdGhlIGRvY2tlZFxuXHRcdC8vIGF1eGlsaWFyeSBiYXIgaXMgTk9UIGEgZ3JpZCB2aWV3IChpdCBsaXZlcyBpbnNpZGUgdGhlIGVkaXRvciBub2RlKSwgc28gaXRzXG5cdFx0Ly8gd2lkdGggbXVzdCBjb21lIGZyb20gdGhlIGRvY2tlZCBsYXlvdXQgc3RhdGUsIG5ldmVyIHRoZSBncmlkLiBUaGUgZ3JpZCBoZXJlXG5cdFx0Ly8gdGhyb3dzIFwiVmlldyBub3QgZm91bmRcIiBmb3IgdGhlIGF1eCB2aWV3IHRvIHByb3ZlIGBfc2F2ZVBhcnRTaXplc2AgbmV2ZXJcblx0XHQvLyByZWFkcyBpdCBcdTIwMTQgb3RoZXJ3aXNlIHRoZSBzYXZlIHdvdWxkIGFib3J0IGFuZCB0aGUgZWRpdG9yIHdpZHRoIHdvdWxkIGJlIGxvc3QuXG5cdFx0Y29uc3Qgc3RvcmVkOiBSZWNvcmQ8c3RyaW5nLCBzdHJpbmc+ID0ge307XG5cdFx0Y29uc3QgZWRpdG9yVmlldyA9IHt9LCBzZXNzaW9uc1ZpZXcgPSB7fSwgc2lkZUJhclZpZXcgPSB7fSwgYXV4VmlldyA9IHt9LCBwYW5lbFZpZXcgPSB7fTtcblx0XHRjb25zdCB2aWV3U2l6ZXMgPSBuZXcgTWFwPG9iamVjdCwgSVZpZXdTaXplPihbXG5cdFx0XHRbZWRpdG9yVmlldywgeyB3aWR0aDogODY0LCBoZWlnaHQ6IDcwMCB9XSxcblx0XHRcdFtzZXNzaW9uc1ZpZXcsIHsgd2lkdGg6IDYxOCwgaGVpZ2h0OiA3MDAgfV0sXG5cdFx0XHRbc2lkZUJhclZpZXcsIHsgd2lkdGg6IDMwMCwgaGVpZ2h0OiA3MDAgfV0sXG5cdFx0XHRbcGFuZWxWaWV3LCB7IHdpZHRoOiAxMDAwLCBoZWlnaHQ6IDIwMCB9XSxcblx0XHRdKTtcblx0XHRjb25zdCBob3N0ID0ge1xuXHRcdFx0ZWRpdG9yUGFydFZpZXc6IGVkaXRvclZpZXcsXG5cdFx0XHRzZXNzaW9uc1BhcnRWaWV3OiBzZXNzaW9uc1ZpZXcsXG5cdFx0XHRzaWRlQmFyUGFydFZpZXc6IHNpZGVCYXJWaWV3LFxuXHRcdFx0YXV4aWxpYXJ5QmFyUGFydFZpZXc6IGF1eFZpZXcsXG5cdFx0XHRwYW5lbFBhcnRWaWV3OiBwYW5lbFZpZXcsXG5cdFx0XHRwYXJ0VmlzaWJpbGl0eTogeyBzaWRlYmFyOiB0cnVlLCBhdXhpbGlhcnlCYXI6IGZhbHNlLCBlZGl0b3I6IHRydWUsIHBhbmVsOiBmYWxzZSwgc2Vzc2lvbnM6IHRydWUgfSxcblx0XHRcdF9zYXZlZFBhcnRTaXplczogeyBlZGl0b3I6IDUwMCB9LFxuXHRcdFx0X2RvY2tlZEF1eGlsaWFyeUJhcldpZHRoOiAzMDAsXG5cdFx0XHRfbWVtZW50bzogbmV3IERvY2tlZEVkaXRvclNpemVNZW1lbnRvKCksXG5cdFx0XHRsb2dTZXJ2aWNlOiB1bmRlZmluZWQsXG5cdFx0XHR3b3JrYmVuY2hHcmlkOiB7XG5cdFx0XHRcdGdldFZpZXdTaXplOiAodmlldzogb2JqZWN0KSA9PiB7XG5cdFx0XHRcdFx0Y29uc3Qgc2l6ZSA9IHZpZXdTaXplcy5nZXQodmlldyk7XG5cdFx0XHRcdFx0aWYgKCFzaXplKSB7IHRocm93IG5ldyBFcnJvcignVmlldyBub3QgZm91bmQnKTsgfVxuXHRcdFx0XHRcdHJldHVybiBzaXplO1xuXHRcdFx0XHR9LFxuXHRcdFx0XHRnZXRWaWV3Q2FjaGVkVmlzaWJsZVNpemU6ICh2aWV3OiBvYmplY3QpID0+IHtcblx0XHRcdFx0XHRpZiAodmlldyA9PT0gYXV4VmlldykgeyB0aHJvdyBuZXcgRXJyb3IoJ1ZpZXcgbm90IGZvdW5kJyk7IH1cblx0XHRcdFx0XHRyZXR1cm4gdmlld1NpemVzLmdldCh2aWV3KT8ud2lkdGg7XG5cdFx0XHRcdH0sXG5cdFx0XHR9LFxuXHRcdFx0c3RvcmFnZVNlcnZpY2U6IHsgc3RvcmU6IChrZXk6IHN0cmluZywgdmFsdWU6IHN0cmluZykgPT4geyBzdG9yZWRba2V5XSA9IHZhbHVlOyB9IH0sXG5cdFx0fTtcblx0XHRPYmplY3Quc2V0UHJvdG90eXBlT2YoaG9zdCwgU2luZ2xlUGFuZVdvcmtiZW5jaC5wcm90b3R5cGUpO1xuXG5cdFx0c2F2ZVBhcnRTaXplcy5jYWxsKGhvc3QgYXMgdW5rbm93biBhcyBJU2F2ZVBhcnRTaXplc1Rlc3RIYXJuZXNzKTtcblxuXHRcdGNvbnN0IHNpemVzID0gSlNPTi5wYXJzZShzdG9yZWRbJ3dvcmtiZW5jaC5zZXNzaW9ucy5wYXJ0U2l6ZXMnXSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7IGVkaXRvcjogc2l6ZXMuZWRpdG9yLCBzZXNzaW9uczogc2l6ZXMuc2Vzc2lvbnMsIGF1eGlsaWFyeUJhcjogc2l6ZXMuYXV4aWxpYXJ5QmFyIH0sIHsgZWRpdG9yOiA4NjQsIHNlc3Npb25zOiA2MTgsIGF1eGlsaWFyeUJhcjogMzAwIH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdfc2F2ZVBhcnRTaXplcyBwcmVzZXJ2ZXMgdGhlIGxhc3QgdmFsaWQgZWRpdG9yIHdpZHRoIHdoZW4gdGhlIGVkaXRvciBpcyBoaWRkZW4gd2l0aCB0aGUgZGV0YWlsIHZpc2libGUgKHNpbmdsZS1wYW5lKScsICgpID0+IHtcblx0XHQvLyBSZWdyZXNzaW9uOiB3aXRoIHRoZSBlZGl0b3IgaGlkZGVuIGFuZCBvbmx5IHRoZSBkZXRhaWwgc2hvd2luZywgdGhlIGVkaXRvclxuXHRcdC8vIGdyaWQgbm9kZSBpcyB0aGUgZGV0YWlsLW9ubHkgbm9kZSwgc28gdGhlIHB1cmUgZWRpdG9yLWNvbnRlbnQgd2lkdGggbWVhc3VyZXNcblx0XHQvLyBhcyB+MCAoYmVsb3cgdGhlIG1pbmltdW0pLiBUaGF0IHN1Yi1taW5pbXVtIHZhbHVlIG11c3QgTk9UIGJlIHBlcnNpc3RlZCAoaXRcblx0XHQvLyB3b3VsZCByZWJ1aWxkIHRoZSBzaWRlIHBhbmUgYXQgaXRzIDMwMHB4IG1pbmltdW0gb24gcmVsb2FkKTsgdGhlIGxhc3QgdmFsaWRcblx0XHQvLyBnbG9iYWwgd2lkdGggaXMga2VwdCBpbnN0ZWFkLlxuXHRcdGNvbnN0IHN0b3JlZDogUmVjb3JkPHN0cmluZywgc3RyaW5nPiA9IHt9O1xuXHRcdGNvbnN0IGVkaXRvclZpZXcgPSB7fSwgc2Vzc2lvbnNWaWV3ID0ge30sIHNpZGVCYXJWaWV3ID0ge30sIGF1eFZpZXcgPSB7fSwgcGFuZWxWaWV3ID0ge307XG5cdFx0Y29uc3Qgdmlld1NpemVzID0gbmV3IE1hcDxvYmplY3QsIElWaWV3U2l6ZT4oW1xuXHRcdFx0W2VkaXRvclZpZXcsIHsgd2lkdGg6IDMwMCwgaGVpZ2h0OiA3MDAgfV0sXG5cdFx0XHRbc2Vzc2lvbnNWaWV3LCB7IHdpZHRoOiAxMTgyLCBoZWlnaHQ6IDcwMCB9XSxcblx0XHRcdFtzaWRlQmFyVmlldywgeyB3aWR0aDogMzAwLCBoZWlnaHQ6IDcwMCB9XSxcblx0XHRcdFtwYW5lbFZpZXcsIHsgd2lkdGg6IDEwMDAsIGhlaWdodDogMjAwIH1dLFxuXHRcdF0pO1xuXHRcdGNvbnN0IGhvc3QgPSB7XG5cdFx0XHRlZGl0b3JQYXJ0VmlldzogZWRpdG9yVmlldyxcblx0XHRcdHNlc3Npb25zUGFydFZpZXc6IHNlc3Npb25zVmlldyxcblx0XHRcdHNpZGVCYXJQYXJ0Vmlldzogc2lkZUJhclZpZXcsXG5cdFx0XHRhdXhpbGlhcnlCYXJQYXJ0VmlldzogYXV4Vmlldyxcblx0XHRcdHBhbmVsUGFydFZpZXc6IHBhbmVsVmlldyxcblx0XHRcdHBhcnRWaXNpYmlsaXR5OiB7IHNpZGViYXI6IHRydWUsIGF1eGlsaWFyeUJhcjogdHJ1ZSwgZWRpdG9yOiBmYWxzZSwgcGFuZWw6IGZhbHNlLCBzZXNzaW9uczogdHJ1ZSB9LFxuXHRcdFx0X3NhdmVkUGFydFNpemVzOiB7IGVkaXRvcjogNTIwIH0sXG5cdFx0XHRfZG9ja2VkQXV4aWxpYXJ5QmFyV2lkdGg6IDMwMCxcblx0XHRcdF9tZW1lbnRvOiBuZXcgRG9ja2VkRWRpdG9yU2l6ZU1lbWVudG8oKSxcblx0XHRcdGxvZ1NlcnZpY2U6IHVuZGVmaW5lZCxcblx0XHRcdHdvcmtiZW5jaEdyaWQ6IHtcblx0XHRcdFx0Z2V0Vmlld1NpemU6ICh2aWV3OiBvYmplY3QpID0+IHtcblx0XHRcdFx0XHRjb25zdCBzaXplID0gdmlld1NpemVzLmdldCh2aWV3KTtcblx0XHRcdFx0XHRpZiAoIXNpemUpIHsgdGhyb3cgbmV3IEVycm9yKCdWaWV3IG5vdCBmb3VuZCcpOyB9XG5cdFx0XHRcdFx0cmV0dXJuIHNpemU7XG5cdFx0XHRcdH0sXG5cdFx0XHRcdGdldFZpZXdDYWNoZWRWaXNpYmxlU2l6ZTogKHZpZXc6IG9iamVjdCkgPT4ge1xuXHRcdFx0XHRcdGlmICh2aWV3ID09PSBhdXhWaWV3KSB7IHRocm93IG5ldyBFcnJvcignVmlldyBub3QgZm91bmQnKTsgfVxuXHRcdFx0XHRcdHJldHVybiB2aWV3U2l6ZXMuZ2V0KHZpZXcpPy53aWR0aDtcblx0XHRcdFx0fSxcblx0XHRcdH0sXG5cdFx0XHRzdG9yYWdlU2VydmljZTogeyBzdG9yZTogKGtleTogc3RyaW5nLCB2YWx1ZTogc3RyaW5nKSA9PiB7IHN0b3JlZFtrZXldID0gdmFsdWU7IH0gfSxcblx0XHR9O1xuXHRcdE9iamVjdC5zZXRQcm90b3R5cGVPZihob3N0LCBTaW5nbGVQYW5lV29ya2JlbmNoLnByb3RvdHlwZSk7XG5cblx0XHRzYXZlUGFydFNpemVzLmNhbGwoaG9zdCBhcyB1bmtub3duIGFzIElTYXZlUGFydFNpemVzVGVzdEhhcm5lc3MpO1xuXG5cdFx0Y29uc3Qgc2l6ZXMgPSBKU09OLnBhcnNlKHN0b3JlZFsnd29ya2JlbmNoLnNlc3Npb25zLnBhcnRTaXplcyddKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2l6ZXMuZWRpdG9yLCA1MjApO1xuXHR9KTtcblxuXG5cdHRlc3QoJ3Nob3dpbmcgZG9ja2VkIGRldGFpbCB3aXRoIGhpZGRlbiBlZGl0b3IgcmVzdG9yZXMgdGhlIHByZWZlcnJlZCBkZXRhaWwgd2lkdGggaW5zdGVhZCBvZiBjYWNoZWQgbm9kZSB3aWR0aCcsICgpID0+IHtcblx0XHRjb25zdCBob3N0ID0gY3JlYXRlSG9zdCh7IHNpbmdsZTogdHJ1ZSwgZWRpdG9yV2lkdGg6IDY0MCwgZG9ja2VkV2lkdGg6IDMwMCwgcGFydFZpc2liaWxpdHk6IHsgZWRpdG9yOiBmYWxzZSwgYXV4aWxpYXJ5QmFyOiBmYWxzZSB9IH0pO1xuXG5cdFx0c2V0QXV4aWxpYXJ5QmFySGlkZGVuLmNhbGwoaG9zdCwgZmFsc2UpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRhdXhpbGlhcnlCYXJWaXNpYmxlOiBob3N0LnBhcnRWaXNpYmlsaXR5LmF1eGlsaWFyeUJhcixcblx0XHRcdGVkaXRvclZpc2libGU6IGhvc3QucGFydFZpc2liaWxpdHkuZWRpdG9yLFxuXHRcdFx0cmVzaXplczogaG9zdC5yZXNpemVzLFxuXHRcdFx0dmlzaWJpbGl0eUNoYW5nZXM6IGhvc3QudmlzaWJpbGl0eUNoYW5nZXMsXG5cdFx0XHRldmVudHM6IGhvc3QuZXZlbnRzLFxuXHRcdFx0bGF5b3V0Q291bnQ6IGhvc3QuY291bnRzLmxheW91dCxcblx0XHR9LCB7XG5cdFx0XHRhdXhpbGlhcnlCYXJWaXNpYmxlOiB0cnVlLFxuXHRcdFx0ZWRpdG9yVmlzaWJsZTogZmFsc2UsXG5cdFx0XHRyZXNpemVzOiBbeyB3aWR0aDogMzAwLCBoZWlnaHQ6IDgwMCB9XSxcblx0XHRcdHZpc2liaWxpdHlDaGFuZ2VzOiBbdHJ1ZV0sXG5cdFx0XHRldmVudHM6IFt7IHBhcnRJZDogUGFydHMuQVVYSUxJQVJZQkFSX1BBUlQsIHZpc2libGU6IHRydWUgfV0sXG5cdFx0XHRsYXlvdXRDb3VudDogMSxcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgncmVhcHBseWluZyBhIGRvY2tlZCB3aWR0aCByZXRhaW5zIHRoZSBleGFjdCB1c2VyIHdpZHRoIGluIGEgZGV0YWlsLW9ubHkgbm9kZScsICgpID0+IHtcblx0XHRjb25zdCBob3N0ID0gY3JlYXRlSG9zdCh7IHNpbmdsZTogdHJ1ZSwgZG9ja2VkV2lkdGg6IDIyMCwgZWRpdG9yV2lkdGg6IDIyMCwgcGFydFZpc2liaWxpdHk6IHsgZWRpdG9yOiBmYWxzZSwgYXV4aWxpYXJ5QmFyOiB0cnVlIH0gfSk7XG5cdFx0Y29uc3Qgc2V0RG9ja2VkQXV4aWxpYXJ5QmFyV2lkdGggPSBTaW5nbGVQYW5lV29ya2JlbmNoLnByb3RvdHlwZS5zZXREb2NrZWRBdXhpbGlhcnlCYXJXaWR0aCBhcyAodGhpczogSVRlc3RXb3JrYmVuY2gsIHdpZHRoOiBudW1iZXIpID0+IHZvaWQ7XG5cblx0XHRzZXREb2NrZWRBdXhpbGlhcnlCYXJXaWR0aC5jYWxsKGhvc3QsIDIyMCk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdGRvY2tlZFdpZHRoOiBob3N0Ll9kb2NrZWRBdXhpbGlhcnlCYXJXaWR0aCxcblx0XHRcdHJlc2l6ZXM6IGhvc3QucmVzaXplcyxcblx0XHRcdGxheW91dENvdW50OiBob3N0LmNvdW50cy5sYXlvdXQsXG5cdFx0fSwge1xuXHRcdFx0ZG9ja2VkV2lkdGg6IDIyMCxcblx0XHRcdHJlc2l6ZXM6IFt7IHdpZHRoOiAyMjAsIGhlaWdodDogODAwIH1dLFxuXHRcdFx0bGF5b3V0Q291bnQ6IDEsXG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3BlcnNpc3RlZCBlZGl0b3Igd2lkdGggZXhjbHVkZXMgdGhlIGRldGFpbCBvbmx5IHdoZW4gdGhlIGRldGFpbCBpcyB2aXNpYmxlJywgKCkgPT4ge1xuXHRcdC8vIEVkaXRvciArIGRldGFpbCB2aXNpYmxlOiB0aGUgbm9kZSBpbmNsdWRlcyB0aGUgZGV0YWlsLCBzbyBpdCBpcyBleGNsdWRlZFxuXHRcdC8vIHRvIHN0b3JlIHRoZSBwdXJlIGVkaXRvci1jb250ZW50IHdpZHRoIChyZWNvbnN0cnVjdGVkIGJ5IGFkZGluZyBpdCBiYWNrKS5cblx0XHRjb25zdCB3aXRoRGV0YWlsID0gY3JlYXRlSG9zdCh7IHNpbmdsZTogdHJ1ZSwgZG9ja2VkV2lkdGg6IDMwMCwgcGFydFZpc2liaWxpdHk6IHsgZWRpdG9yOiB0cnVlLCBhdXhpbGlhcnlCYXI6IHRydWUgfSB9KTtcblx0XHQvLyBFZGl0b3Itb25seSAoZGV0YWlsIGNsb3NlZCk6IHRoZSBub2RlIGlzIHB1cmUgZWRpdG9yIGNvbnRlbnQsIHNvIG5vdGhpbmdcblx0XHQvLyBpcyBzdWJ0cmFjdGVkIFx1MjAxNCBvdGhlcndpc2UgdGhlIHNpZGUgcGFuZSB3b3VsZCBzaHJpbmsgYnkgdGhlIGRldGFpbCB3aWR0aFxuXHRcdC8vIG9uIGV2ZXJ5IHJlbG9hZCAoY29tcG91bmRpbmcgdG93YXJkIHplcm8pLlxuXHRcdGNvbnN0IGVkaXRvck9ubHkgPSBjcmVhdGVIb3N0KHsgc2luZ2xlOiB0cnVlLCBkb2NrZWRXaWR0aDogMzAwLCBwYXJ0VmlzaWJpbGl0eTogeyBlZGl0b3I6IHRydWUsIGF1eGlsaWFyeUJhcjogZmFsc2UgfSB9KTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0d2l0aERldGFpbDogcGVyc2lzdGVkRWRpdG9yV2lkdGguY2FsbCh3aXRoRGV0YWlsLCA5MDApLFxuXHRcdFx0ZWRpdG9yT25seTogcGVyc2lzdGVkRWRpdG9yV2lkdGguY2FsbChlZGl0b3JPbmx5LCA5MDApLFxuXHRcdH0sIHtcblx0XHRcdHdpdGhEZXRhaWw6IDYwMCxcblx0XHRcdGVkaXRvck9ubHk6IDkwMCxcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnZG9lcyBub3QgcmUtYXBwbHkgdGhlIGV2ZW4gc3BsaXQgb24gbGF0ZXIgZWRpdG9yIHJldmVhbHMnLCAoKSA9PiB7XG5cdFx0Y29uc3QgaG9zdCA9IGNyZWF0ZUhvc3QoeyBzZXNzaW9uc1dpZHRoOiAxMDAwLCBoYXNBcHBsaWVkSW5pdGlhbEVkaXRvclNwbGl0OiB0cnVlIH0pO1xuXG5cdFx0c2V0RWRpdG9ySGlkZGVuLmNhbGwoaG9zdCwgZmFsc2UpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRlZGl0b3JWaXNpYmxlOiBob3N0LnBhcnRWaXNpYmlsaXR5LmVkaXRvcixcblx0XHRcdHZpc2liaWxpdHlDaGFuZ2VzOiBob3N0LnZpc2liaWxpdHlDaGFuZ2VzLFxuXHRcdFx0cmVzaXplczogaG9zdC5yZXNpemVzLFxuXHRcdH0sIHtcblx0XHRcdGVkaXRvclZpc2libGU6IHRydWUsXG5cdFx0XHR2aXNpYmlsaXR5Q2hhbmdlczogW3RydWVdLFxuXHRcdFx0cmVzaXplczogW10sXG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2NsYW1wcyB0aGUgZXZlbiBlZGl0b3Igc3BsaXQgdG8gYSBtaW5pbXVtIHdpZHRoJywgKCkgPT4ge1xuXHRcdGNvbnN0IGhvc3QgPSBjcmVhdGVIb3N0KHsgc2Vzc2lvbnNXaWR0aDogNDAwLCB3aW5kb3dXaWR0aDogNDAwIH0pO1xuXG5cdFx0c2V0RWRpdG9ySGlkZGVuLmNhbGwoaG9zdCwgZmFsc2UpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChob3N0LnJlc2l6ZXMsIFt7IHdpZHRoOiAzMDAsIGhlaWdodDogODAwIH1dKTtcblx0fSk7XG5cblx0dGVzdCgncmVsYXlvdXRzIHRoZSBkb2NrZWQgZGV0YWlsIHBhbmVsIHdoZW4gdGhlIGVkaXRvciB2aXNpYmlsaXR5IGNoYW5nZXMnLCAoKSA9PiB7XG5cdFx0Y29uc3QgaG9zdCA9IGNyZWF0ZUhvc3QoeyBzaW5nbGU6IHRydWUsIHNlc3Npb25zV2lkdGg6IDEwMDAsIGhhc0FwcGxpZWRJbml0aWFsRWRpdG9yU3BsaXQ6IHRydWUgfSk7XG5cblx0XHRzZXRFZGl0b3JIaWRkZW4uY2FsbChob3N0LCBmYWxzZSk7XG5cdFx0c2V0RWRpdG9ySGlkZGVuLmNhbGwoaG9zdCwgdHJ1ZSk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdGxheW91dENvdW50OiBob3N0LmNvdW50cy5sYXlvdXQsXG5cdFx0XHR2aXNpYmlsaXR5Q2hhbmdlczogaG9zdC52aXNpYmlsaXR5Q2hhbmdlcyxcblx0XHR9LCB7XG5cdFx0XHRsYXlvdXRDb3VudDogMixcblx0XHRcdHZpc2liaWxpdHlDaGFuZ2VzOiBbdHJ1ZSwgdHJ1ZV0sXG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2ZpcmVzIGVkaXRvciB2aXNpYmlsaXR5IGNoYW5nZXMgd2hlbiBkb2NrZWQgZWRpdG9yIGNvbnRlbnQgaXMgaGlkZGVuIG9yIHNob3duJywgKCkgPT4ge1xuXHRcdGNvbnN0IGhvc3QgPSBjcmVhdGVIb3N0KHsgc2luZ2xlOiB0cnVlLCBzZXNzaW9uc1dpZHRoOiAxMDAwLCBoYXNBcHBsaWVkSW5pdGlhbEVkaXRvclNwbGl0OiB0cnVlLCBwYXJ0VmlzaWJpbGl0eTogeyBlZGl0b3I6IHRydWUsIGF1eGlsaWFyeUJhcjogdHJ1ZSB9IH0pO1xuXG5cdFx0c2V0RWRpdG9ySGlkZGVuLmNhbGwoaG9zdCwgdHJ1ZSk7XG5cdFx0c2V0RWRpdG9ySGlkZGVuLmNhbGwoaG9zdCwgZmFsc2UpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChob3N0LmV2ZW50cywgW1xuXHRcdFx0eyBwYXJ0SWQ6IFBhcnRzLkVESVRPUl9QQVJULCB2aXNpYmxlOiBmYWxzZSB9LFxuXHRcdFx0eyBwYXJ0SWQ6IFBhcnRzLkVESVRPUl9QQVJULCB2aXNpYmxlOiB0cnVlIH0sXG5cdFx0XSk7XG5cdH0pO1xuXG5cdHRlc3QoJ21hcHMgYSBuYXRpdmUgc2FzaC1kcmFnIGNvbGxhcHNlIG9mIHRoZSBkZXRhaWwtb25seSBub2RlIG9udG8gaGlkaW5nIHRoZSBhdXhpbGlhcnkgYmFyLCBsaWtlIHRoZSBzZXNzaW9ucyBsaXN0JywgKCkgPT4ge1xuXHRcdGNvbnN0IGhvc3QgPSBjcmVhdGVIb3N0KHsgc2luZ2xlOiB0cnVlLCBwYXJ0VmlzaWJpbGl0eTogeyBlZGl0b3I6IGZhbHNlLCBhdXhpbGlhcnlCYXI6IHRydWUgfSB9KTtcblxuXHRcdG9uRWRpdG9yUGFydEdyaWRWaXNpYmlsaXR5Q2hhbmdlLmNhbGwoaG9zdCwgZmFsc2UpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRhdXhpbGlhcnlCYXJWaXNpYmxlOiBob3N0LnBhcnRWaXNpYmlsaXR5LmF1eGlsaWFyeUJhcixcblx0XHRcdGV2ZW50czogaG9zdC5ldmVudHMsXG5cdFx0fSwge1xuXHRcdFx0YXV4aWxpYXJ5QmFyVmlzaWJsZTogZmFsc2UsXG5cdFx0XHRldmVudHM6IFt7IHBhcnRJZDogUGFydHMuQVVYSUxJQVJZQkFSX1BBUlQsIHZpc2libGU6IGZhbHNlLCBzb3VyY2U6ICdyZXNpemUnIH1dLFxuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdyZXZlYWxzIHRoZSBkZXRhaWwtb25seSBwYW5lbCBhZ2FpbiB3aGVuIHRoZSBjb2xsYXBzZWQgbm9kZSBpcyBkcmFnZ2VkIGJhY2sgb3BlbicsICgpID0+IHtcblx0XHRjb25zdCBob3N0ID0gY3JlYXRlSG9zdCh7IHNpbmdsZTogdHJ1ZSwgcGFydFZpc2liaWxpdHk6IHsgZWRpdG9yOiBmYWxzZSwgYXV4aWxpYXJ5QmFyOiB0cnVlIH0gfSk7XG5cblx0XHRvbkVkaXRvclBhcnRHcmlkVmlzaWJpbGl0eUNoYW5nZS5jYWxsKGhvc3QsIGZhbHNlKTtcblx0XHRvbkVkaXRvclBhcnRHcmlkVmlzaWJpbGl0eUNoYW5nZS5jYWxsKGhvc3QsIHRydWUpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRhdXhpbGlhcnlCYXJWaXNpYmxlOiBob3N0LnBhcnRWaXNpYmlsaXR5LmF1eGlsaWFyeUJhcixcblx0XHRcdGV2ZW50czogaG9zdC5ldmVudHMsXG5cdFx0fSwge1xuXHRcdFx0YXV4aWxpYXJ5QmFyVmlzaWJsZTogdHJ1ZSxcblx0XHRcdGV2ZW50czogW1xuXHRcdFx0XHR7IHBhcnRJZDogUGFydHMuQVVYSUxJQVJZQkFSX1BBUlQsIHZpc2libGU6IGZhbHNlLCBzb3VyY2U6ICdyZXNpemUnIH0sXG5cdFx0XHRcdHsgcGFydElkOiBQYXJ0cy5BVVhJTElBUllCQVJfUEFSVCwgdmlzaWJsZTogdHJ1ZSwgc291cmNlOiAncmVzaXplJyB9LFxuXHRcdFx0XSxcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnaWdub3JlcyB0aGUgc2hhcmVkIG5vZGUgZ3JpZCB2aXNpYmlsaXR5IHdoaWxlIGVkaXRvciBjb250ZW50IGlzIHZpc2libGUnLCAoKSA9PiB7XG5cdFx0Y29uc3QgaG9zdCA9IGNyZWF0ZUhvc3QoeyBzaW5nbGU6IHRydWUsIHBhcnRWaXNpYmlsaXR5OiB7IGVkaXRvcjogdHJ1ZSwgYXV4aWxpYXJ5QmFyOiB0cnVlIH0gfSk7XG5cblx0XHRvbkVkaXRvclBhcnRHcmlkVmlzaWJpbGl0eUNoYW5nZS5jYWxsKGhvc3QsIGZhbHNlKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoeyBhdXhpbGlhcnlCYXJWaXNpYmxlOiBob3N0LnBhcnRWaXNpYmlsaXR5LmF1eGlsaWFyeUJhciwgZXZlbnRzOiBob3N0LmV2ZW50cyB9LCB7IGF1eGlsaWFyeUJhclZpc2libGU6IHRydWUsIGV2ZW50czogW10gfSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2ZpcmVzIG9uRGlkUmV2ZWFsU2lkZVBhbmUgb25seSB3aGVuIHRoZSBzaWRlIHBhbmUgdHJhbnNpdGlvbnMgZnJvbSBmdWxseSBoaWRkZW4gdG8gdmlzaWJsZScsICgpID0+IHtcblx0XHRjb25zdCBob3N0ID0gY3JlYXRlSG9zdCh7IHNpbmdsZTogdHJ1ZSwgc2Vzc2lvbnNXaWR0aDogMTAwMCwgcGFydFZpc2liaWxpdHk6IHsgZWRpdG9yOiBmYWxzZSwgYXV4aWxpYXJ5QmFyOiBmYWxzZSB9IH0pO1xuXHRcdGNvbnN0IGNvdW50czogbnVtYmVyW10gPSBbXTtcblxuXHRcdC8vIEZyb20gZnVsbHkgY2xvc2VkLCByZXZlYWxpbmcgdGhlIGVkaXRvciBmaXJlcyB0aGUgcmV2ZWFsLlxuXHRcdHNldEVkaXRvckhpZGRlbi5jYWxsKGhvc3QsIGZhbHNlKTtcblx0XHRjb3VudHMucHVzaChob3N0LnNpZGVQYW5lUmV2ZWFscy5sZW5ndGgpO1xuXHRcdC8vIFRoZSBhdXggYmFyIHRoZW4gYWxzbyBzaG93aW5nIGRvZXMgTk9UIGZpcmUgYWdhaW4gXHUyMDE0IHRoZSBwYW5lIGlzIGFscmVhZHkgdmlzaWJsZS5cblx0XHRzZXRBdXhpbGlhcnlCYXJIaWRkZW4uY2FsbChob3N0LCBmYWxzZSk7XG5cdFx0Y291bnRzLnB1c2goaG9zdC5zaWRlUGFuZVJldmVhbHMubGVuZ3RoKTtcblx0XHQvLyBGdWxseSBjbG9zZSB0aGUgcGFuZSAoaGlkZSB0aGUgYXV4IGZpcnN0IHdoaWxlIHRoZSBlZGl0b3IgaXMgc3RpbGwgdmlzaWJsZSwgdGhlblxuXHRcdC8vIHRoZSBlZGl0b3IpIHNvIGl0IHJlYWNoZXMgdGhlIGZ1bGx5LWhpZGRlbiBzdGF0ZSB3aXRob3V0IGFuIGF1dG8tcmV2ZWFsLlxuXHRcdHNldEF1eGlsaWFyeUJhckhpZGRlbi5jYWxsKGhvc3QsIHRydWUpO1xuXHRcdHNldEVkaXRvckhpZGRlbi5jYWxsKGhvc3QsIHRydWUpO1xuXHRcdGNvdW50cy5wdXNoKGhvc3Quc2lkZVBhbmVSZXZlYWxzLmxlbmd0aCk7XG5cdFx0Ly8gUmV2ZWFsaW5nIGFnYWluIGZyb20gZnVsbHkgaGlkZGVuIGZpcmVzIGEgc2Vjb25kIHRpbWUuXG5cdFx0c2V0RWRpdG9ySGlkZGVuLmNhbGwoaG9zdCwgZmFsc2UpO1xuXHRcdGNvdW50cy5wdXNoKGhvc3Quc2lkZVBhbmVSZXZlYWxzLmxlbmd0aCk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGNvdW50cywgWzEsIDEsIDEsIDJdKTtcblx0fSk7XG5cblx0dGVzdCgnZmlyZXMgb25EaWRSZXZlYWxTaWRlUGFuZSBvbmNlIGluIHRoZSBiYXNlIGxheW91dCB3aGVuIHRoZSBzaWRlIHBhbmUgYmVjb21lcyB2aXNpYmxlJywgKCkgPT4ge1xuXHRcdGNvbnN0IGhvc3QgPSBjcmVhdGVIb3N0KHsgc2Vzc2lvbnNXaWR0aDogMTAwMCwgcGFydFZpc2liaWxpdHk6IHsgZWRpdG9yOiBmYWxzZSwgYXV4aWxpYXJ5QmFyOiBmYWxzZSB9IH0pO1xuXG5cdFx0c2V0QXV4aWxpYXJ5QmFySGlkZGVuLmNhbGwoaG9zdCwgZmFsc2UpO1xuXHRcdHNldEVkaXRvckhpZGRlbi5jYWxsKGhvc3QsIGZhbHNlKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChob3N0LnNpZGVQYW5lUmV2ZWFscy5sZW5ndGgsIDEpO1xuXHR9KTtcblxuXHR0ZXN0KCdzaHJpbmtzIHRoZSBkb2NrZWQgZWRpdG9yIG5vZGUgdG8gdGhlIGRldGFpbCB3aWR0aCB3aGVuIGhpZGluZyB0aGUgZWRpdG9yJywgKCkgPT4ge1xuXHRcdGNvbnN0IGhvc3QgPSBjcmVhdGVIb3N0KHsgc2luZ2xlOiB0cnVlLCBzZXNzaW9uc1dpZHRoOiAxMDAwLCBoYXNBcHBsaWVkSW5pdGlhbEVkaXRvclNwbGl0OiB0cnVlLCBkb2NrZWRXaWR0aDogMzIwLCBlZGl0b3JXaWR0aDogOTAwLCBwYXJ0VmlzaWJpbGl0eTogeyBlZGl0b3I6IHRydWUsIGF1eGlsaWFyeUJhcjogdHJ1ZSB9IH0pO1xuXG5cdFx0c2V0RWRpdG9ySGlkZGVuLmNhbGwoaG9zdCwgdHJ1ZSk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdGVkaXRvclZpc2libGU6IGhvc3QucGFydFZpc2liaWxpdHkuZWRpdG9yLFxuXHRcdFx0dmlzaWJpbGl0eUNoYW5nZXM6IGhvc3QudmlzaWJpbGl0eUNoYW5nZXMsXG5cdFx0XHRyZXNpemVzOiBob3N0LnJlc2l6ZXMsXG5cdFx0fSwge1xuXHRcdFx0ZWRpdG9yVmlzaWJsZTogZmFsc2UsXG5cdFx0XHR2aXNpYmlsaXR5Q2hhbmdlczogW3RydWVdLFxuXHRcdFx0cmVzaXplczogW3sgd2lkdGg6IDMyMCwgaGVpZ2h0OiA4MDAgfV0sXG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3JldGFpbnMgdGhlIGV4YWN0IGRyYWdnZWQgZGV0YWlsIHdpZHRoIHdoZW4gaGlkaW5nIEVkaXRvcicsICgpID0+IHtcblx0XHRjb25zdCBob3N0ID0gY3JlYXRlSG9zdCh7IHNpbmdsZTogdHJ1ZSwgc2Vzc2lvbnNXaWR0aDogMTAwMCwgaGFzQXBwbGllZEluaXRpYWxFZGl0b3JTcGxpdDogdHJ1ZSwgZG9ja2VkV2lkdGg6IDIyMCwgZWRpdG9yV2lkdGg6IDkwMCwgcGFydFZpc2liaWxpdHk6IHsgZWRpdG9yOiB0cnVlLCBhdXhpbGlhcnlCYXI6IHRydWUgfSB9KTtcblxuXHRcdHNldEVkaXRvckhpZGRlbi5jYWxsKGhvc3QsIHRydWUpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChob3N0LnJlc2l6ZXMsIFt7IHdpZHRoOiAyMjAsIGhlaWdodDogODAwIH1dKTtcblx0fSk7XG5cblx0Ly8gLS0tIFtTY2VuYXJpbyA1XSBlZGl0b3IgYXV0by1yZXZlYWwgb24gb3BlbiAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cblxuXHRpbnRlcmZhY2UgSVdpbGxPcGVuVGVzdEhhcm5lc3Mge1xuXHRcdF9lZGl0b3JQYXJ0QXV0b1Zpc2liaWxpdHlTdXBwcmVzc2lvbkNvdW50OiBudW1iZXI7XG5cdFx0cGFydFZpc2liaWxpdHk6IHsgZWRpdG9yOiBib29sZWFuOyBhdXhpbGlhcnlCYXI6IGJvb2xlYW4gfTtcblx0XHRlZGl0b3JHcm91cFNlcnZpY2U6IHsgbWFpblBhcnQ6IHsgZ3JvdXBzOiB7IGlkOiBudW1iZXIgfVtdIH0gfTtcblx0XHRpc1Jlc3RvcmVkKCk6IGJvb2xlYW47XG5cdFx0c2V0RWRpdG9ySGlkZGVuKGhpZGRlbjogYm9vbGVhbiwgZXhwbGljaXQ/OiBib29sZWFuKTogdm9pZDtcblx0XHRyZXN0b3JlQXR0YWNoZWRFZGl0b3JNYXhpbWl6ZWRTdGF0ZSgpOiB2b2lkO1xuXHR9XG5cblx0ZnVuY3Rpb24gY3JlYXRlV2lsbE9wZW5IYXJuZXNzKG92ZXJyaWRlcz86IFBhcnRpYWw8SVdpbGxPcGVuVGVzdEhhcm5lc3M+KTogeyBoYXJuZXNzOiBJV2lsbE9wZW5UZXN0SGFybmVzczsgc2V0RWRpdG9ySGlkZGVuQ2FsbHM6IHsgaGlkZGVuOiBib29sZWFuOyBleHBsaWNpdD86IGJvb2xlYW4gfVtdIH0ge1xuXHRcdGNvbnN0IHNldEVkaXRvckhpZGRlbkNhbGxzOiB7IGhpZGRlbjogYm9vbGVhbjsgZXhwbGljaXQ/OiBib29sZWFuIH1bXSA9IFtdO1xuXHRcdGNvbnN0IGhhcm5lc3M6IElXaWxsT3BlblRlc3RIYXJuZXNzID0ge1xuXHRcdFx0X2VkaXRvclBhcnRBdXRvVmlzaWJpbGl0eVN1cHByZXNzaW9uQ291bnQ6IDAsXG5cdFx0XHRwYXJ0VmlzaWJpbGl0eTogeyBlZGl0b3I6IGZhbHNlLCBhdXhpbGlhcnlCYXI6IGZhbHNlIH0sXG5cdFx0XHRlZGl0b3JHcm91cFNlcnZpY2U6IHsgbWFpblBhcnQ6IHsgZ3JvdXBzOiBbeyBpZDogMSB9XSB9IH0sXG5cdFx0XHRpc1Jlc3RvcmVkOiAoKSA9PiB0cnVlLFxuXHRcdFx0c2V0RWRpdG9ySGlkZGVuOiAoaGlkZGVuLCBleHBsaWNpdCkgPT4gc2V0RWRpdG9ySGlkZGVuQ2FsbHMucHVzaCh7IGhpZGRlbiwgZXhwbGljaXQgfSksXG5cdFx0XHRyZXN0b3JlQXR0YWNoZWRFZGl0b3JNYXhpbWl6ZWRTdGF0ZTogKCkgPT4geyB9LFxuXHRcdFx0Li4ub3ZlcnJpZGVzLFxuXHRcdH07XG5cdFx0cmV0dXJuIHsgaGFybmVzcywgc2V0RWRpdG9ySGlkZGVuQ2FsbHMgfTtcblx0fVxuXG5cdHRlc3QoJ1tTY2VuYXJpbyA1XSBiYXNlIHJldmVhbEVkaXRvck9uT3BlbiByZXZlYWxzIGEgaGlkZGVuIGVkaXRvciBvbiBvcGVuJywgKCkgPT4ge1xuXHRcdGNvbnN0IHsgaGFybmVzcywgc2V0RWRpdG9ySGlkZGVuQ2FsbHMgfSA9IGNyZWF0ZVdpbGxPcGVuSGFybmVzcyh7IHBhcnRWaXNpYmlsaXR5OiB7IGVkaXRvcjogZmFsc2UsIGF1eGlsaWFyeUJhcjogdHJ1ZSB9IH0pO1xuXG5cdFx0cmV2ZWFsRWRpdG9yT25PcGVuLmNhbGwoaGFybmVzcywgeyBncm91cElkOiAxLCBlZGl0b3I6IHsgdHlwZUlkOiAnd29ya2JlbmNoLmVkaXRvcnMuZmlsZXMuZmlsZUVkaXRvcklucHV0JyB9IH0pO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChzZXRFZGl0b3JIaWRkZW5DYWxscywgW3sgaGlkZGVuOiBmYWxzZSwgZXhwbGljaXQ6IHRydWUgfV0pO1xuXHR9KTtcblxuXHR0ZXN0KCdbU2NlbmFyaW8gNV0gYmFzZSByZXZlYWxFZGl0b3JPbk9wZW4gZG9lcyBub3QgcmV2ZWFsIHdoZW4gdGhlIG9wZW4gdGFyZ2V0cyBhIG5vbi1tYWluLXBhcnQgZ3JvdXAnLCAoKSA9PiB7XG5cdFx0Y29uc3QgeyBoYXJuZXNzLCBzZXRFZGl0b3JIaWRkZW5DYWxscyB9ID0gY3JlYXRlV2lsbE9wZW5IYXJuZXNzKCk7XG5cblx0XHRyZXZlYWxFZGl0b3JPbk9wZW4uY2FsbChoYXJuZXNzLCB7IGdyb3VwSWQ6IDk5LCBlZGl0b3I6IHsgdHlwZUlkOiAnd29ya2JlbmNoLmVkaXRvcnMuZmlsZXMuZmlsZUVkaXRvcklucHV0JyB9IH0pO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChzZXRFZGl0b3JIaWRkZW5DYWxscywgW10pO1xuXHR9KTtcblxuXHR0ZXN0KCdbU2NlbmFyaW8gNV0gYmFzZSByZXZlYWxFZGl0b3JPbk9wZW4gZG9lcyBub3QgcmV2ZWFsIHdoaWxlIGVkaXRvci1wYXJ0IGF1dG8tdmlzaWJpbGl0eSBpcyBzdXBwcmVzc2VkJywgKCkgPT4ge1xuXHRcdGNvbnN0IHsgaGFybmVzcywgc2V0RWRpdG9ySGlkZGVuQ2FsbHMgfSA9IGNyZWF0ZVdpbGxPcGVuSGFybmVzcyh7IF9lZGl0b3JQYXJ0QXV0b1Zpc2liaWxpdHlTdXBwcmVzc2lvbkNvdW50OiAxIH0pO1xuXG5cdFx0cmV2ZWFsRWRpdG9yT25PcGVuLmNhbGwoaGFybmVzcywgeyBncm91cElkOiAxLCBlZGl0b3I6IHsgdHlwZUlkOiAnd29ya2JlbmNoLmVkaXRvcnMuZmlsZXMuZmlsZUVkaXRvcklucHV0JyB9IH0pO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChzZXRFZGl0b3JIaWRkZW5DYWxscywgW10pO1xuXHR9KTtcblxuXHR0ZXN0KCdkb2NrZWQgZWRpdG9ycyBhcmUgZXhjbHVkZWQgZnJvbSB0aGUgZWRpdG9yIGxpbWl0IChwcmV2ZW50cyBtYW5hZ2VkLXRhYiBvcGVuL2Nsb3NlIGxvb3ApJywgKCkgPT4ge1xuXHRcdC8vIFRoZSBtYW5hZ2VkIENoYW5nZXMvRmlsZXMgdGFicyBhcmUgcGlubmVkIGJ1dCBub3Qgc3RpY2t5LCBzbyBhIHBlci1ncm91cFxuXHRcdC8vIGVkaXRvciBsaW1pdCBvZiAxIHdvdWxkIG90aGVyd2lzZSBldmljdCB0aGVtIGFuZCB0aGUgbWFuYWdlZC10YWJcblx0XHQvLyByZWNvbmNpbGlhdGlvbiB3b3VsZCByZW9wZW4gdGhlbSwgaGFuZ2luZyB0aGUgcmVuZGVyZXIuIERvY2tlZCBpbnB1dHMgb3B0XG5cdFx0Ly8gb3V0IG9mIHRoZSBsaW1pdCBzbyB0aGV5IGFyZSBuZXZlciBhdXRvLWNsb3NlZC5cblx0XHRjb25zdCBkb2NrZWRFZGl0b3IgPSBuZXcgVGVzdERvY2tlZEVkaXRvcklucHV0KCk7XG5cblx0XHR0cnkge1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGRvY2tlZEVkaXRvci5oYXNDYXBhYmlsaXR5KEVkaXRvcklucHV0Q2FwYWJpbGl0aWVzLkV4Y2x1ZGVGcm9tRWRpdG9yTGltaXQpLCB0cnVlKTtcblx0XHR9IGZpbmFsbHkge1xuXHRcdFx0ZG9ja2VkRWRpdG9yLmRpc3Bvc2UoKTtcblx0XHR9XG5cdH0pO1xuXG5cdHRlc3QoJ1tTY2VuYXJpbyA1XSBzaW5nbGUtcGFuZSBkb2VzIG5vdCByZXZlYWwgYSBkb2NrZWQgZWRpdG9yIHdoaWxlIHRoZSBkZXRhaWwgcGFuZWwgaXMgb3BlbiBhbmQgdGhlIGVkaXRvciBpcyBjbG9zZWQnLCAoKSA9PiB7XG5cdFx0Ly8gUmUtYWN0aXZhdGluZyBhIGRvY2tlZC1kZXRhaWwgZWRpdG9yIChjbG9zaW5nIGEgbmVpZ2hib3VyaW5nIHRhYiwgb3Jcblx0XHQvLyBjbGlja2luZyB0aGUgdGFiKSB3aGlsZSB0aGUgZGV0YWlsIHBhbmVsIGFscmVhZHkgc2hvd3MgaXRzIGNvbnRlbnQgbXVzdFxuXHRcdC8vIG5vdCByZXZlYWwgdGhlIGNsb3NlZCBlZGl0b3IgYXJlYS5cblx0XHRjb25zdCBkb2NrZWRFZGl0b3IgPSBuZXcgVGVzdERvY2tlZEVkaXRvcklucHV0KCk7XG5cdFx0Y29uc3QgeyBoYXJuZXNzLCBzZXRFZGl0b3JIaWRkZW5DYWxscyB9ID0gY3JlYXRlV2lsbE9wZW5IYXJuZXNzKHsgcGFydFZpc2liaWxpdHk6IHsgZWRpdG9yOiBmYWxzZSwgYXV4aWxpYXJ5QmFyOiB0cnVlIH0gfSk7XG5cblx0XHR0cnkge1xuXHRcdFx0cmV2ZWFsRWRpdG9yT25PcGVuU2luZ2xlUGFuZS5jYWxsKGhhcm5lc3MsIHsgZ3JvdXBJZDogMSwgZWRpdG9yOiBkb2NrZWRFZGl0b3IgfSk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHNldEVkaXRvckhpZGRlbkNhbGxzLCBbXSk7XG5cdFx0fSBmaW5hbGx5IHtcblx0XHRcdGRvY2tlZEVkaXRvci5kaXNwb3NlKCk7XG5cdFx0fVxuXHR9KTtcblxuXHR0ZXN0KCdbU2NlbmFyaW8gNV0gc2luZ2xlLXBhbmUgcmV2ZWFscyBhIGRvY2tlZCBlZGl0b3Igd2hlbiB0aGUgZGV0YWlsIHBhbmVsIGlzIGNsb3NlZCcsICgpID0+IHtcblx0XHQvLyBXaXRoIHRoZSB3aG9sZSBzaWRlIHBhbmUgY2xvc2VkIChkZXRhaWwgcGFuZWwgaGlkZGVuKSwgb3BlbmluZyBhIGRvY2tlZFxuXHRcdC8vIGVkaXRvciBtdXN0IHJldmVhbCB0aGUgZWRpdG9yIGFyZWEgc28gaXRzIGNvbnRlbnQgYmVjb21lcyB2aXNpYmxlLlxuXHRcdGNvbnN0IGRvY2tlZEVkaXRvciA9IG5ldyBUZXN0RG9ja2VkRWRpdG9ySW5wdXQoKTtcblx0XHRjb25zdCB7IGhhcm5lc3MsIHNldEVkaXRvckhpZGRlbkNhbGxzIH0gPSBjcmVhdGVXaWxsT3Blbkhhcm5lc3MoeyBwYXJ0VmlzaWJpbGl0eTogeyBlZGl0b3I6IGZhbHNlLCBhdXhpbGlhcnlCYXI6IGZhbHNlIH0gfSk7XG5cblx0XHR0cnkge1xuXHRcdFx0cmV2ZWFsRWRpdG9yT25PcGVuU2luZ2xlUGFuZS5jYWxsKGhhcm5lc3MsIHsgZ3JvdXBJZDogMSwgZWRpdG9yOiBkb2NrZWRFZGl0b3IgfSk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHNldEVkaXRvckhpZGRlbkNhbGxzLCBbeyBoaWRkZW46IGZhbHNlLCBleHBsaWNpdDogdHJ1ZSB9XSk7XG5cdFx0fSBmaW5hbGx5IHtcblx0XHRcdGRvY2tlZEVkaXRvci5kaXNwb3NlKCk7XG5cdFx0fVxuXHR9KTtcblxuXHR0ZXN0KCdbU2NlbmFyaW8gNV0gc2luZ2xlLXBhbmUgcmV2ZWFscyBhIG5vbi1kb2NrZWQgZWRpdG9yIGV2ZW4gd2hpbGUgdGhlIGRldGFpbCBwYW5lbCBpcyBvcGVuJywgKCkgPT4ge1xuXHRcdGNvbnN0IHsgaGFybmVzcywgc2V0RWRpdG9ySGlkZGVuQ2FsbHMgfSA9IGNyZWF0ZVdpbGxPcGVuSGFybmVzcyh7IHBhcnRWaXNpYmlsaXR5OiB7IGVkaXRvcjogZmFsc2UsIGF1eGlsaWFyeUJhcjogdHJ1ZSB9IH0pO1xuXG5cdFx0cmV2ZWFsRWRpdG9yT25PcGVuU2luZ2xlUGFuZS5jYWxsKGhhcm5lc3MsIHsgZ3JvdXBJZDogMSwgZWRpdG9yOiB7IHR5cGVJZDogJ3dvcmtiZW5jaC5lZGl0b3JzLmZpbGVzLmZpbGVFZGl0b3JJbnB1dCcgfSB9KTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoc2V0RWRpdG9ySGlkZGVuQ2FsbHMsIFt7IGhpZGRlbjogZmFsc2UsIGV4cGxpY2l0OiB0cnVlIH1dKTtcblx0fSk7XG5cblx0dGVzdCgnW3JlbG9hZF0gc2luZ2xlLXBhbmUgZG9lcyBub3QgcmV2ZWFsIEVkaXRvciBmb3IgcmVzdG9yZWQgdGFicyBiZWZvcmUgd29ya2JlbmNoIHJlc3RvcmUgY29tcGxldGVzJywgKCkgPT4ge1xuXHRcdGNvbnN0IHsgaGFybmVzcywgc2V0RWRpdG9ySGlkZGVuQ2FsbHMgfSA9IGNyZWF0ZVdpbGxPcGVuSGFybmVzcyh7XG5cdFx0XHRwYXJ0VmlzaWJpbGl0eTogeyBlZGl0b3I6IGZhbHNlLCBhdXhpbGlhcnlCYXI6IHRydWUgfSxcblx0XHRcdGlzUmVzdG9yZWQ6ICgpID0+IGZhbHNlLFxuXHRcdH0pO1xuXG5cdFx0cmV2ZWFsRWRpdG9yT25PcGVuU2luZ2xlUGFuZS5jYWxsKGhhcm5lc3MsIHsgZ3JvdXBJZDogMSwgZWRpdG9yOiB7IHR5cGVJZDogJ3dvcmtiZW5jaC5lZGl0b3JzLmZpbGVzLmZpbGVFZGl0b3JJbnB1dCcgfSB9KTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoc2V0RWRpdG9ySGlkZGVuQ2FsbHMsIFtdKTtcblx0fSk7XG5cblx0dGVzdCgncmVzdG9yZXMgdGhlIGRvY2tlZCBlZGl0b3Igbm9kZSBzaXplIHdoZW4gc2hvd2luZyBhZnRlciBoaWRlJywgKCkgPT4ge1xuXHRcdGNvbnN0IGhvc3QgPSBjcmVhdGVIb3N0KHsgc2luZ2xlOiB0cnVlLCBzZXNzaW9uc1dpZHRoOiAxMDAwLCBoYXNBcHBsaWVkSW5pdGlhbEVkaXRvclNwbGl0OiB0cnVlLCBkb2NrZWRXaWR0aDogMzIwLCBlZGl0b3JXaWR0aDogOTAwLCBwYXJ0VmlzaWJpbGl0eTogeyBlZGl0b3I6IHRydWUsIGF1eGlsaWFyeUJhcjogdHJ1ZSB9IH0pO1xuXG5cdFx0c2V0RWRpdG9ySGlkZGVuLmNhbGwoaG9zdCwgdHJ1ZSk7XG5cdFx0c2V0RWRpdG9ySGlkZGVuLmNhbGwoaG9zdCwgZmFsc2UpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRlZGl0b3JWaXNpYmxlOiBob3N0LnBhcnRWaXNpYmlsaXR5LmVkaXRvcixcblx0XHRcdHZpc2liaWxpdHlDaGFuZ2VzOiBob3N0LnZpc2liaWxpdHlDaGFuZ2VzLFxuXHRcdFx0cmVzaXplczogaG9zdC5yZXNpemVzLFxuXHRcdFx0c25hcHNob3Q6IGhvc3QuX21lbWVudG8uZG9ja2VkRWRpdG9yU2l6ZUJlZm9yZUhpZGUsXG5cdFx0fSwge1xuXHRcdFx0ZWRpdG9yVmlzaWJsZTogdHJ1ZSxcblx0XHRcdHZpc2liaWxpdHlDaGFuZ2VzOiBbdHJ1ZSwgdHJ1ZV0sXG5cdFx0XHRyZXNpemVzOiBbXG5cdFx0XHRcdHsgd2lkdGg6IDMyMCwgaGVpZ2h0OiA4MDAgfSxcblx0XHRcdFx0eyB3aWR0aDogOTAwLCBoZWlnaHQ6IDgwMCB9LFxuXHRcdFx0XSxcblx0XHRcdHNuYXBzaG90OiB1bmRlZmluZWQsXG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3ByZXNlcnZlcyBzaWRlIHBhbmUgd2lkdGggd2hlbiBoaWRpbmcgZWRpdG9yIGJlZm9yZSBkZXRhaWxzIGFuZCByZXN0b3JpbmcgYm90aCcsICgpID0+IHtcblx0XHRjb25zdCBob3N0ID0gY3JlYXRlSG9zdCh7IHNpbmdsZTogdHJ1ZSwgc2Vzc2lvbnNXaWR0aDogMTAwMCwgaGFzQXBwbGllZEluaXRpYWxFZGl0b3JTcGxpdDogdHJ1ZSwgZG9ja2VkV2lkdGg6IDMwMCwgZWRpdG9yV2lkdGg6IDkwMCwgcGFydFZpc2liaWxpdHk6IHsgZWRpdG9yOiB0cnVlLCBhdXhpbGlhcnlCYXI6IHRydWUgfSB9KTtcblx0XHRob3N0Ll9lZGl0b3JQYXJ0QXV0b1Zpc2liaWxpdHlTdXBwcmVzc2lvbkNvdW50Kys7XG5cblx0XHRzZXRFZGl0b3JIaWRkZW4uY2FsbChob3N0LCB0cnVlKTtcblx0XHRzZXRBdXhpbGlhcnlCYXJIaWRkZW4uY2FsbChob3N0LCB0cnVlKTtcblx0XHRzZXRBdXhpbGlhcnlCYXJIaWRkZW4uY2FsbChob3N0LCBmYWxzZSk7XG5cdFx0c2V0RWRpdG9ySGlkZGVuLmNhbGwoaG9zdCwgZmFsc2UpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRwZXJzaXN0ZWRFZGl0b3JXaWR0aDogaG9zdC5fc2F2ZWRQYXJ0U2l6ZXMuZWRpdG9yLFxuXHRcdFx0cmVzaXplczogaG9zdC5yZXNpemVzLFxuXHRcdFx0c25hcHNob3Q6IGhvc3QuX21lbWVudG8uZG9ja2VkRWRpdG9yU2l6ZUJlZm9yZUhpZGUsXG5cdFx0fSwge1xuXHRcdFx0cGVyc2lzdGVkRWRpdG9yV2lkdGg6IDYwMCxcblx0XHRcdHJlc2l6ZXM6IFtcblx0XHRcdFx0eyB3aWR0aDogMzAwLCBoZWlnaHQ6IDgwMCB9LFxuXHRcdFx0XHR7IHdpZHRoOiAzMDAsIGhlaWdodDogODAwIH0sXG5cdFx0XHRcdHsgd2lkdGg6IDkwMCwgaGVpZ2h0OiA4MDAgfSxcblx0XHRcdF0sXG5cdFx0XHRzbmFwc2hvdDogdW5kZWZpbmVkLFxuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdoaWRlU2lkZVBhbmUgaGlkZXMgRWRpdG9yIGJlZm9yZSBEZXRhaWxzIGFuZCBwcmVzZXJ2ZXMgdGhlIGVkaXRvciB3aWR0aCcsICgpID0+IHtcblx0XHRjb25zdCBob3N0ID0gY3JlYXRlSG9zdCh7IHNpbmdsZTogdHJ1ZSwgZG9ja2VkV2lkdGg6IDMwMCwgZWRpdG9yV2lkdGg6IDkwMCwgcGFydFZpc2liaWxpdHk6IHsgZWRpdG9yOiB0cnVlLCBhdXhpbGlhcnlCYXI6IHRydWUgfSB9KTtcblxuXHRcdGhpZGVTaWRlUGFuZS5jYWxsKGhvc3QpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHR2aXNpYmlsaXR5OiB7XG5cdFx0XHRcdGVkaXRvcjogaG9zdC5wYXJ0VmlzaWJpbGl0eS5lZGl0b3IsXG5cdFx0XHRcdGF1eGlsaWFyeUJhcjogaG9zdC5wYXJ0VmlzaWJpbGl0eS5hdXhpbGlhcnlCYXIsXG5cdFx0XHR9LFxuXHRcdFx0aGlkZU9yZGVyOiBob3N0LmV2ZW50cy5maWx0ZXIoZXZlbnQgPT4gIWV2ZW50LnZpc2libGUpLm1hcChldmVudCA9PiBldmVudC5wYXJ0SWQpLFxuXHRcdFx0cGVyc2lzdGVkRWRpdG9yV2lkdGg6IGhvc3QuX3NhdmVkUGFydFNpemVzLmVkaXRvcixcblx0XHR9LCB7XG5cdFx0XHR2aXNpYmlsaXR5OiB7XG5cdFx0XHRcdGVkaXRvcjogZmFsc2UsXG5cdFx0XHRcdGF1eGlsaWFyeUJhcjogZmFsc2UsXG5cdFx0XHR9LFxuXHRcdFx0aGlkZU9yZGVyOiBbUGFydHMuRURJVE9SX1BBUlQsIFBhcnRzLkFVWElMSUFSWUJBUl9QQVJUXSxcblx0XHRcdHBlcnNpc3RlZEVkaXRvcldpZHRoOiA2MDAsXG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3N1cHByZXNzZXMgZG9ja2VkIGVkaXRvciByZXZlYWwgc3luYyB3aGlsZSBoaWRpbmcgdGhlIGVkaXRvcicsICgpID0+IHtcblx0XHRjb25zdCBob3N0ID0gY3JlYXRlSG9zdCh7IHNpbmdsZTogdHJ1ZSwgc2Vzc2lvbnNXaWR0aDogMTAwMCwgaGFzQXBwbGllZEluaXRpYWxFZGl0b3JTcGxpdDogdHJ1ZSwgZG9ja2VkV2lkdGg6IDMyMCwgZWRpdG9yV2lkdGg6IDkwMCwgcGFydFZpc2liaWxpdHk6IHsgZWRpdG9yOiB0cnVlLCBhdXhpbGlhcnlCYXI6IHRydWUgfSB9KTtcblx0XHQvLyBBbnkgZ3JpZCBtdXRhdGlvbiByZS1lbnRlcnMgcmV2ZWFsLXN5bmM7IGl0IG11c3QgYmUgYSBuby1vcCB3aGlsZSBzdXNwZW5kZWQuXG5cdFx0Y29uc3QgZ3JpZCA9IChob3N0IGFzIHVua25vd24gYXMgeyB3b3JrYmVuY2hHcmlkOiB7IHNldFZpZXdWaXNpYmxlKHZpZXc6IG9iamVjdCwgdmlzaWJsZTogYm9vbGVhbik6IHZvaWQgfSB9KS53b3JrYmVuY2hHcmlkO1xuXHRcdGNvbnN0IHNldFZpZXdWaXNpYmxlID0gZ3JpZC5zZXRWaWV3VmlzaWJsZTtcblx0XHRncmlkLnNldFZpZXdWaXNpYmxlID0gKHZpZXcsIHZpc2libGUpID0+IHtcblx0XHRcdHNldFZpZXdWaXNpYmxlKHZpZXcsIHZpc2libGUpO1xuXHRcdFx0b25FZGl0b3JOb2RlUmVzaXplZC5jYWxsKGhvc3QsIDkwMCk7XG5cdFx0fTtcblxuXHRcdHNldEVkaXRvckhpZGRlbi5jYWxsKGhvc3QsIHRydWUpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRlZGl0b3JWaXNpYmxlOiBob3N0LnBhcnRWaXNpYmlsaXR5LmVkaXRvcixcblx0XHRcdGV2ZW50czogaG9zdC5ldmVudHMsXG5cdFx0XHRyZXNpemVzOiBob3N0LnJlc2l6ZXMsXG5cdFx0XHRzbmFwc2hvdDogaG9zdC5fbWVtZW50by5kb2NrZWRFZGl0b3JTaXplQmVmb3JlSGlkZSxcblx0XHR9LCB7XG5cdFx0XHRlZGl0b3JWaXNpYmxlOiBmYWxzZSxcblx0XHRcdGV2ZW50czogW3sgcGFydElkOiBQYXJ0cy5FRElUT1JfUEFSVCwgdmlzaWJsZTogZmFsc2UgfV0sXG5cdFx0XHRyZXNpemVzOiBbeyB3aWR0aDogMzIwLCBoZWlnaHQ6IDgwMCB9XSxcblx0XHRcdHNuYXBzaG90OiB7IHdpZHRoOiA5MDAsIGhlaWdodDogODAwIH0sXG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3Jlc3RvcmVzIHRoZSByZW1lbWJlcmVkIGdsb2JhbCBlZGl0b3Igd2lkdGggb24gcmV2ZWFsIGluc3RlYWQgb2YgdGhlIGRlZmF1bHQgc3BsaXQgKGNyb3NzLXNlc3Npb24pJywgKCkgPT4ge1xuXHRcdC8vIFNlc3Npb24gQSBoYWQgdGhlIHNpZGUgcGFuZSBhdCBhIHVzZXItY2hvc2VuIHdpZHRoOyBhbm90aGVyIHNlc3Npb24gY2xvc2VkIHRoZVxuXHRcdC8vIHdob2xlIHBhbmUuIFBhcnQgc2l6ZXMgYXJlIHdvcmtiZW5jaC1nbG9iYWwsIHNvIHN3aXRjaGluZyBiYWNrIG11c3QgcmVzdG9yZSB0aGF0XG5cdFx0Ly8gd2lkdGgsIG5vdCByZXNldCB0byB0aGUgZXF1YWwgc3BsaXQuIFRoZSB3aWR0aCBpcyByZW1lbWJlcmVkIGluIGBfc2F2ZWRQYXJ0U2l6ZXNgLlxuXHRcdGNvbnN0IGhvc3QgPSBjcmVhdGVIb3N0KHsgc2luZ2xlOiB0cnVlLCBzZXNzaW9uc1dpZHRoOiAxMDAwLCB3aW5kb3dXaWR0aDogMTAwMCwgaGFzQXBwbGllZEluaXRpYWxFZGl0b3JTcGxpdDogdHJ1ZSwgZG9ja2VkV2lkdGg6IDMwMCwgZWRpdG9yV2lkdGg6IDUyMCwgcGFydFZpc2liaWxpdHk6IHsgZWRpdG9yOiB0cnVlLCBhdXhpbGlhcnlCYXI6IGZhbHNlIH0gfSk7XG5cblx0XHQvLyBDbG9zZSB0aGUgd2hvbGUgc2lkZSBwYW5lIChhdXggYWxyZWFkeSBoaWRkZW4pIFx1MjAxNCB0aGlzIGNhcHR1cmVzIDUyMCBhcyB0aGVcblx0XHQvLyByZW1lbWJlcmVkIGdsb2JhbCB3aWR0aCBhbmQgY29sbGFwc2VzIHRoZSBub2RlLlxuXHRcdHNldEVkaXRvckhpZGRlbi5jYWxsKGhvc3QsIHRydWUpO1xuXHRcdGNvbnN0IHJlbWVtYmVyZWRXaWR0aCA9IGhvc3QuX3NhdmVkUGFydFNpemVzLmVkaXRvcjtcblx0XHRjb25zdCByZXNpemVzQmVmb3JlUmV2ZWFsID0gaG9zdC5yZXNpemVzLmxlbmd0aDtcblxuXHRcdC8vIFJldmVhbCAoc3dpdGNoIGJhY2spOiByZXN0b3JlcyB0aGUgcmVtZW1iZXJlZCA1MjAsIG5vdCB0aGUgZXF1YWwgc3BsaXQgKDUwMCkuXG5cdFx0c2V0RWRpdG9ySGlkZGVuLmNhbGwoaG9zdCwgZmFsc2UpO1xuXHRcdGNvbnN0IHJldmVhbFJlc2l6ZXMgPSBob3N0LnJlc2l6ZXMuc2xpY2UocmVzaXplc0JlZm9yZVJldmVhbCk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdHJlbWVtYmVyZWRXaWR0aCxcblx0XHRcdGVkaXRvclZpc2libGU6IGhvc3QucGFydFZpc2liaWxpdHkuZWRpdG9yLFxuXHRcdFx0cmV2ZWFsUmVzaXplcyxcblx0XHR9LCB7XG5cdFx0XHRyZW1lbWJlcmVkV2lkdGg6IDUyMCxcblx0XHRcdGVkaXRvclZpc2libGU6IHRydWUsXG5cdFx0XHRyZXZlYWxSZXNpemVzOiBbeyB3aWR0aDogNTIwLCBoZWlnaHQ6IDgwMCB9XSxcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnc2luZ2xlLXBhbmUgZWRpdG9yIHBhcnQgbGVhdmVzIHNhc2ggcmVzZXQgZGlzdHJpYnV0aW9uIHRvIHRoZSBncmlkIHdoaWxlIGVkaXRvciBjb250ZW50IGlzIHZpc2libGUnLCAoKSA9PiB7XG5cdFx0Y29uc3QgcHJlZmVycmVkV2lkdGhHZXR0ZXIgPSBPYmplY3QuZ2V0T3duUHJvcGVydHlEZXNjcmlwdG9yKFNpbmdsZVBhbmVNYWluRWRpdG9yUGFydC5wcm90b3R5cGUsICdwcmVmZXJyZWRXaWR0aCcpIS5nZXQhO1xuXHRcdGNvbnN0IHByZWZlcnJlZFdpZHRoID0gcHJlZmVycmVkV2lkdGhHZXR0ZXIuY2FsbCh7IGxheW91dFNlcnZpY2U6IHsgaXNWaXNpYmxlOiAoKSA9PiB0cnVlIH0gfSk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocHJlZmVycmVkV2lkdGgsIHVuZGVmaW5lZCk7XG5cdH0pO1xuXG5cdHRlc3QoJ3NpbmdsZS1wYW5lIGVkaXRvciBwYXJ0IHByZWZlcnJlZFdpZHRoIHJlc2V0cyB0byB0aGUgZG9ja2VkIGRldGFpbCBkZWZhdWx0IHdpZHRoIGluc3RlYWQgb2YgYW4gZXF1YWwgc3BsaXQgd2hlbiBlZGl0b3IgY29udGVudCBpcyBoaWRkZW4nLCAoKSA9PiB7XG5cdFx0Ly8gVGhlIGRvY2tlZCBkZXRhaWwgcGFuZWwncyBvd24gcmVzaXplIHNhc2ggc2l0cyBhdCB0aGUgc2FtZSBzcG90IGFzIHRoaXNcblx0XHQvLyBncmlkIHNhc2ggd2hpbGUgdGhlIGVkaXRvciBpcyBoaWRkZW4sIHNvIGRvdWJsZS1jbGlja2luZyB0aGVyZSBtdXN0IHJlc2V0XG5cdFx0Ly8gdG8gdGhlIGRldGFpbCBwYW5lbCdzIG93biBkZWZhdWx0IHdpZHRoLCBub3QgYSB3aW5kb3ctcmVsYXRpdmUgc3BsaXQuXG5cdFx0Y29uc3QgcHJlZmVycmVkV2lkdGhHZXR0ZXIgPSBPYmplY3QuZ2V0T3duUHJvcGVydHlEZXNjcmlwdG9yKFNpbmdsZVBhbmVNYWluRWRpdG9yUGFydC5wcm90b3R5cGUsICdwcmVmZXJyZWRXaWR0aCcpIS5nZXQhO1xuXHRcdGNvbnN0IHByZWZlcnJlZFdpZHRoID0gcHJlZmVycmVkV2lkdGhHZXR0ZXIuY2FsbCh7IGxheW91dFNlcnZpY2U6IHsgbWFpbkNvbnRhaW5lckRpbWVuc2lvbjogeyB3aWR0aDogMjAwMCwgaGVpZ2h0OiA4MDAgfSwgaXNWaXNpYmxlOiAoKSA9PiBmYWxzZSB9IH0pO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHByZWZlcnJlZFdpZHRoLCBEb2NrZWRBdXhpbGlhcnlCYXJDb250cm9sbGVyLkRFRkFVTFRfV0lEVEgpO1xuXHR9KTtcblxuXHR0ZXN0KCdzaW5nbGUtcGFuZSBlZGl0b3IgcGFydCBpcyBhIHNuYXAgdmlldyBvbmx5IHdoaWxlIGVkaXRvciBjb250ZW50IGlzIGhpZGRlbiAoZG9ja2VkIGRldGFpbC1vbmx5KScsICgpID0+IHtcblx0XHRjb25zdCBzbmFwR2V0dGVyID0gT2JqZWN0LmdldE93blByb3BlcnR5RGVzY3JpcHRvcihTaW5nbGVQYW5lTWFpbkVkaXRvclBhcnQucHJvdG90eXBlLCAnc25hcCcpIS5nZXQhO1xuXHRcdGNvbnN0IGNhbGwgPSAoZWRpdG9yVmlzaWJsZTogYm9vbGVhbikgPT4gc25hcEdldHRlci5jYWxsKHsgbGF5b3V0U2VydmljZTogeyBpc1Zpc2libGU6ICgpID0+IGVkaXRvclZpc2libGUgfSB9KTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoeyBlZGl0b3JIaWRkZW46IGNhbGwoZmFsc2UpLCBlZGl0b3JWaXNpYmxlOiBjYWxsKHRydWUpIH0sIHsgZWRpdG9ySGlkZGVuOiB0cnVlLCBlZGl0b3JWaXNpYmxlOiBmYWxzZSB9KTtcblx0fSk7XG5cblx0dGVzdCgnc2luZ2xlLXBhbmUgZWRpdG9yIHBhcnQgbWluaW11bVdpZHRoIG1hdGNoZXMgdGhlIHNlc3Npb25zLWxpc3QgbWluaW11bSB3aGlsZSBlZGl0b3IgY29udGVudCBpcyBoaWRkZW4gKGRvY2tlZCBkZXRhaWwtb25seSknLCAoKSA9PiB7XG5cdFx0Y29uc3QgbWluaW11bVdpZHRoR2V0dGVyID0gT2JqZWN0LmdldE93blByb3BlcnR5RGVzY3JpcHRvcihTaW5nbGVQYW5lTWFpbkVkaXRvclBhcnQucHJvdG90eXBlLCAnbWluaW11bVdpZHRoJykhLmdldCE7XG5cdFx0Y29uc3QgbWluaW11bVdpZHRoID0gbWluaW11bVdpZHRoR2V0dGVyLmNhbGwoeyBsYXlvdXRTZXJ2aWNlOiB7IGlzVmlzaWJsZTogKCkgPT4gZmFsc2UgfSB9KTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChtaW5pbXVtV2lkdGgsIFNFU1NJT05TX0xJU1RfTUlOSU1VTV9XSURUSCk7XG5cdH0pO1xuXG5cdHRlc3QoJ3NpbmdsZS1wYW5lIGVkaXRvciBwYXJ0IGhvc3RzIGJyZWFkY3J1bWJzIGluIHRoZSBncm91cCBoZWFkZXIgKHNjb3BlZCB0byB0aGUgQWdlbnRzIFdpbmRvdyknLCAoKSA9PiB7XG5cdFx0Ly8gQnJlYWRjcnVtYnMgcmVuZGVyIGluc2lkZSB0aGUgZnVsbC13aWR0aCBoZWFkZXIgcm93IGJldHdlZW4gdGhlIHRhYiBiYXJcblx0XHQvLyBhbmQgdGhlIGVkaXRvciBjb250ZW50IG9ubHkgaW4gdGhlIHNpbmdsZS1wYW5lIEFnZW50cyBXaW5kb3cuIFRoZSBjbGFzc2ljXG5cdFx0Ly8gZWRpdG9yIHBhcnQgbXVzdCBrZWVwIGl0cyBkZWZhdWx0IChiZWxvdy10YWJzKSBwbGFjZW1lbnQuXG5cdFx0Y29uc3QgZ2V0T3B0aW9ucyA9IFJlZmxlY3QuZ2V0KFNpbmdsZVBhbmVNYWluRWRpdG9yUGFydC5wcm90b3R5cGUsICdnZXRHcm91cFZpZXdPcHRpb25zJykgYXMgKCkgPT4ge1xuXHRcdFx0c2hvd0hlYWRlcj86IGJvb2xlYW47XG5cdFx0XHRtZW51SWRzPzogeyBoZWFkZXJQcmltYXJ5Pzogb2JqZWN0OyBoZWFkZXJTZWNvbmRhcnk/OiBvYmplY3Q7IGhlYWRlckxheW91dD86IG9iamVjdCB9O1xuXHRcdH07XG5cdFx0Y29uc3Qgb3B0aW9ucyA9IGdldE9wdGlvbnMuY2FsbCh7fSk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdHNob3dIZWFkZXI6IG9wdGlvbnMuc2hvd0hlYWRlcixcblx0XHRcdGhlYWRlclByaW1hcnk6IG9wdGlvbnMubWVudUlkcz8uaGVhZGVyUHJpbWFyeSxcblx0XHRcdGhlYWRlclNlY29uZGFyeTogb3B0aW9ucy5tZW51SWRzPy5oZWFkZXJTZWNvbmRhcnksXG5cdFx0XHRoZWFkZXJMYXlvdXQ6IG9wdGlvbnMubWVudUlkcz8uaGVhZGVyTGF5b3V0LFxuXHRcdH0sIHtcblx0XHRcdHNob3dIZWFkZXI6IHRydWUsXG5cdFx0XHRoZWFkZXJQcmltYXJ5OiBNZW51cy5TZXNzaW9uc0VkaXRvckhlYWRlclByaW1hcnksXG5cdFx0XHRoZWFkZXJTZWNvbmRhcnk6IE1lbnVzLlNlc3Npb25zRWRpdG9ySGVhZGVyU2Vjb25kYXJ5LFxuXHRcdFx0aGVhZGVyTGF5b3V0OiBNZW51cy5TZXNzaW9uc0VkaXRvckhlYWRlckxheW91dCxcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnc2luZ2xlLXBhbmUgZWRpdG9yIHBhcnQgY2hvb3NlcyB0aGUgdGFiIG92ZXJyaWRlIGZyb20gdGhlIHZpc2libGUgY29tcG9zaXRpb24nLCAoKSA9PiB7XG5cdFx0Y29uc3QgZ2V0T3ZlcnJpZGUgPSBSZWZsZWN0LmdldChTaW5nbGVQYW5lTWFpbkVkaXRvclBhcnQucHJvdG90eXBlLCAnX2dldFNob3dUYWJzT3ZlcnJpZGUnKSBhcyAoXG5cdFx0XHRjb25maWd1cmVkU2hvd1RhYnM6ICdtdWx0aXBsZScgfCAnc2luZ2xlJyB8ICdub25lJyxcblx0XHRcdGVkaXRvclZpc2libGU6IGJvb2xlYW4sXG5cdFx0XHRhdXhpbGlhcnlCYXJWaXNpYmxlOiBib29sZWFuXG5cdFx0KSA9PiAnbXVsdGlwbGUnIHwgJ3NpbmdsZScgfCB1bmRlZmluZWQ7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdGF1eGlsaWFyeUJhck9ubHlNdWx0aXBsZTogZ2V0T3ZlcnJpZGUoJ211bHRpcGxlJywgZmFsc2UsIHRydWUpLFxuXHRcdFx0YXV4aWxpYXJ5QmFyT25seVNpbmdsZTogZ2V0T3ZlcnJpZGUoJ3NpbmdsZScsIGZhbHNlLCB0cnVlKSxcblx0XHRcdGF1eGlsaWFyeUJhck9ubHlOb25lOiBnZXRPdmVycmlkZSgnbm9uZScsIGZhbHNlLCB0cnVlKSxcblx0XHRcdGVkaXRvckFuZEF1eGlsaWFyeUJhclNpbmdsZTogZ2V0T3ZlcnJpZGUoJ3NpbmdsZScsIHRydWUsIHRydWUpLFxuXHRcdFx0ZWRpdG9yT25seU5vbmU6IGdldE92ZXJyaWRlKCdub25lJywgdHJ1ZSwgZmFsc2UpLFxuXHRcdFx0ZnVsbHlIaWRkZW5NdWx0aXBsZTogZ2V0T3ZlcnJpZGUoJ211bHRpcGxlJywgZmFsc2UsIGZhbHNlKSxcblx0XHR9LCB7XG5cdFx0XHRhdXhpbGlhcnlCYXJPbmx5TXVsdGlwbGU6ICdtdWx0aXBsZScsXG5cdFx0XHRhdXhpbGlhcnlCYXJPbmx5U2luZ2xlOiAnbXVsdGlwbGUnLFxuXHRcdFx0YXV4aWxpYXJ5QmFyT25seU5vbmU6ICdtdWx0aXBsZScsXG5cdFx0XHRlZGl0b3JBbmRBdXhpbGlhcnlCYXJTaW5nbGU6IHVuZGVmaW5lZCxcblx0XHRcdGVkaXRvck9ubHlOb25lOiAnc2luZ2xlJyxcblx0XHRcdGZ1bGx5SGlkZGVuTXVsdGlwbGU6IHVuZGVmaW5lZCxcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnYXBwbGllcyBhbiBldmVuIHNwbGl0IHdoZW4gcmV2ZWFsaW5nIHRoZSBkb2NrZWQgZWRpdG9yIHdpdGggbm8gY2FwdHVyZWQgd2lkdGggZXZlbiBhZnRlciB0aGUgaW5pdGlhbCBzcGxpdCcsICgpID0+IHtcblx0XHRjb25zdCBob3N0ID0gY3JlYXRlSG9zdCh7IHNpbmdsZTogdHJ1ZSwgc2Vzc2lvbnNXaWR0aDogMTAwMCwgd2luZG93V2lkdGg6IDEzMDAsIGhhc0FwcGxpZWRJbml0aWFsRWRpdG9yU3BsaXQ6IHRydWUsIGRvY2tlZFdpZHRoOiAzMDAsIGVkaXRvcldpZHRoOiAzMDAsIHBhcnRWaXNpYmlsaXR5OiB7IGVkaXRvcjogZmFsc2UsIGF1eGlsaWFyeUJhcjogdHJ1ZSB9IH0pO1xuXG5cdFx0c2V0RWRpdG9ySGlkZGVuLmNhbGwoaG9zdCwgZmFsc2UpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRlZGl0b3JWaXNpYmxlOiBob3N0LnBhcnRWaXNpYmlsaXR5LmVkaXRvcixcblx0XHRcdHZpc2liaWxpdHlDaGFuZ2VzOiBob3N0LnZpc2liaWxpdHlDaGFuZ2VzLFxuXHRcdFx0ZGlzdHJpYnV0aW9uczogaG9zdC5kaXN0cmlidXRpb25zLFxuXHRcdH0sIHtcblx0XHRcdGVkaXRvclZpc2libGU6IHRydWUsXG5cdFx0XHR2aXNpYmlsaXR5Q2hhbmdlczogW3RydWVdLFxuXHRcdFx0ZGlzdHJpYnV0aW9uczogW2hvc3QuZWRpdG9yUGFydFZpZXddLFxuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdyZXN0b3JlcyBhIGNhcHR1cmVkIGRvY2tlZCBlZGl0b3Igd2lkdGggaW5zdGVhZCBvZiBhcHBseWluZyBhbiBldmVuIHNwbGl0JywgKCkgPT4ge1xuXHRcdGNvbnN0IGhvc3QgPSBjcmVhdGVIb3N0KHsgc2luZ2xlOiB0cnVlLCBzZXNzaW9uc1dpZHRoOiAxMDAwLCBoYXNBcHBsaWVkSW5pdGlhbEVkaXRvclNwbGl0OiB0cnVlLCBkb2NrZWRXaWR0aDogMzAwLCBwYXJ0VmlzaWJpbGl0eTogeyBlZGl0b3I6IGZhbHNlLCBhdXhpbGlhcnlCYXI6IHRydWUgfSB9KTtcblx0XHRob3N0Ll9tZW1lbnRvLmRvY2tlZEVkaXRvclNpemVCZWZvcmVIaWRlID0geyB3aWR0aDogNzIwLCBoZWlnaHQ6IDgwMCB9O1xuXG5cdFx0c2V0RWRpdG9ySGlkZGVuLmNhbGwoaG9zdCwgZmFsc2UpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRlZGl0b3JWaXNpYmxlOiBob3N0LnBhcnRWaXNpYmlsaXR5LmVkaXRvcixcblx0XHRcdHZpc2liaWxpdHlDaGFuZ2VzOiBob3N0LnZpc2liaWxpdHlDaGFuZ2VzLFxuXHRcdFx0cmVzaXplczogaG9zdC5yZXNpemVzLFxuXHRcdFx0c25hcHNob3Q6IGhvc3QuX21lbWVudG8uZG9ja2VkRWRpdG9yU2l6ZUJlZm9yZUhpZGUsXG5cdFx0fSwge1xuXHRcdFx0ZWRpdG9yVmlzaWJsZTogdHJ1ZSxcblx0XHRcdHZpc2liaWxpdHlDaGFuZ2VzOiBbdHJ1ZV0sXG5cdFx0XHRyZXNpemVzOiBbeyB3aWR0aDogNzIwLCBoZWlnaHQ6IDgwMCB9XSxcblx0XHRcdHNuYXBzaG90OiB1bmRlZmluZWQsXG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3Jlb3BlbmluZyB0aGUgd2hvbGUgc2lkZSBwYW5lIGV2ZW4tc3BsaXRzIGluc3RlYWQgb2YgcmVzdG9yaW5nIGEgY3JhbXBlZCB3aWR0aCcsICgpID0+IHtcblx0XHRjb25zdCBob3N0ID0gY3JlYXRlSG9zdCh7IHNpbmdsZTogdHJ1ZSwgc2Vzc2lvbnNXaWR0aDogMTM2MCwgd2luZG93V2lkdGg6IDEzNjAsIGhhc0FwcGxpZWRJbml0aWFsRWRpdG9yU3BsaXQ6IHRydWUsIGRvY2tlZFdpZHRoOiAzMDAsIGVkaXRvcldpZHRoOiA0MCwgcGFydFZpc2liaWxpdHk6IHsgZWRpdG9yOiB0cnVlLCBhdXhpbGlhcnlCYXI6IGZhbHNlIH0gfSk7XG5cblx0XHRzZXRFZGl0b3JIaWRkZW4uY2FsbChob3N0LCB0cnVlKTtcblx0XHRjb25zdCBhZnRlckNsb3NlID0ge1xuXHRcdFx0c25hcHNob3Q6IGhvc3QuX21lbWVudG8uZG9ja2VkRWRpdG9yU2l6ZUJlZm9yZUhpZGUsXG5cdFx0XHRyZXNpemVzOiBbLi4uaG9zdC5yZXNpemVzXSxcblx0XHR9O1xuXG5cdFx0c2V0RWRpdG9ySGlkZGVuLmNhbGwoaG9zdCwgZmFsc2UpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRhZnRlckNsb3NlLFxuXHRcdFx0ZWRpdG9yVmlzaWJsZTogaG9zdC5wYXJ0VmlzaWJpbGl0eS5lZGl0b3IsXG5cdFx0XHRkaXN0cmlidXRpb25zOiBob3N0LmRpc3RyaWJ1dGlvbnMsXG5cdFx0XHRzbmFwc2hvdDogaG9zdC5fbWVtZW50by5kb2NrZWRFZGl0b3JTaXplQmVmb3JlSGlkZSxcblx0XHR9LCB7XG5cdFx0XHRhZnRlckNsb3NlOiB7XG5cdFx0XHRcdHNuYXBzaG90OiB1bmRlZmluZWQsXG5cdFx0XHRcdHJlc2l6ZXM6IFtdLFxuXHRcdFx0fSxcblx0XHRcdGVkaXRvclZpc2libGU6IHRydWUsXG5cdFx0XHRkaXN0cmlidXRpb25zOiBbaG9zdC5lZGl0b3JQYXJ0Vmlld10sXG5cdFx0XHRzbmFwc2hvdDogdW5kZWZpbmVkLFxuXHRcdH0pO1xuXHR9KTtcblxuXHQvLyAtLS0gRG9ja2VkIGVkaXRvciBoaWRlLXN5bmMgKGdyaWQgc2FzaCAvIGVkaXRvciBwYXJ0IGxheW91dCkgLS0tLS0tLS0tLS1cblxuXHR0ZXN0KCdkb2VzIG5vdCByZXZlYWwgdGhlIGRvY2tlZCBlZGl0b3Igd2hlbiB0aGUgZ3JpZCBzYXNoIHdpZGVucyB0aGUgbm9kZSB3aGlsZSBvbmx5IHRoZSBkZXRhaWwgaXMgc2hvd24nLCAoKSA9PiB7XG5cdFx0Y29uc3QgaG9zdCA9IGNyZWF0ZUhvc3QoeyBzaW5nbGU6IHRydWUsIHNlc3Npb25zV2lkdGg6IDEwMDAsIGRvY2tlZFdpZHRoOiAzMDAsIGVkaXRvcldpZHRoOiAzMDUgfSk7XG5cdFx0aG9zdC5fbWVtZW50by5kb2NrZWRFZGl0b3JTaXplQmVmb3JlSGlkZSA9IHsgd2lkdGg6IDkwMCwgaGVpZ2h0OiA4MDAgfTtcblxuXHRcdG9uR3JpZERpZENoYW5nZS5jYWxsKGhvc3QpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRlZGl0b3JWaXNpYmxlOiBob3N0LnBhcnRWaXNpYmlsaXR5LmVkaXRvcixcblx0XHRcdGV2ZW50czogaG9zdC5ldmVudHMsXG5cdFx0XHRsYXlvdXRDb3VudDogaG9zdC5jb3VudHMubGF5b3V0LFxuXHRcdFx0c2F2ZUNvdW50OiBob3N0LmNvdW50cy5zYXZlLFxuXHRcdFx0Y2xhc3NUb2dnbGVzOiBob3N0LmNsYXNzVG9nZ2xlcyxcblx0XHRcdHJlc2l6ZXM6IGhvc3QucmVzaXplcyxcblx0XHRcdHNuYXBzaG90OiBob3N0Ll9tZW1lbnRvLmRvY2tlZEVkaXRvclNpemVCZWZvcmVIaWRlLFxuXHRcdH0sIHtcblx0XHRcdGVkaXRvclZpc2libGU6IGZhbHNlLFxuXHRcdFx0ZXZlbnRzOiBbXSxcblx0XHRcdGxheW91dENvdW50OiAwLFxuXHRcdFx0c2F2ZUNvdW50OiAwLFxuXHRcdFx0Y2xhc3NUb2dnbGVzOiBbXSxcblx0XHRcdHJlc2l6ZXM6IFtdLFxuXHRcdFx0c25hcHNob3Q6IHsgd2lkdGg6IDkwMCwgaGVpZ2h0OiA4MDAgfSxcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnZG9lcyBub3QgcmV2ZWFsIHRoZSBkb2NrZWQgZWRpdG9yIGZyb20gZWRpdG9yIHBhcnQgbGF5b3V0IHdpZHRoIHdoaWxlIG9ubHkgdGhlIGRldGFpbCBpcyBzaG93bicsICgpID0+IHtcblx0XHRjb25zdCBob3N0ID0gY3JlYXRlSG9zdCh7IHNpbmdsZTogdHJ1ZSwgc2Vzc2lvbnNXaWR0aDogMTAwMCwgZG9ja2VkV2lkdGg6IDMwMCwgZWRpdG9yV2lkdGg6IDMwMCB9KTtcblx0XHRob3N0Ll9tZW1lbnRvLmRvY2tlZEVkaXRvclNpemVCZWZvcmVIaWRlID0geyB3aWR0aDogOTAwLCBoZWlnaHQ6IDgwMCB9O1xuXG5cdFx0b25FZGl0b3JOb2RlUmVzaXplZC5jYWxsKGhvc3QsIDMwNSk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdGVkaXRvclZpc2libGU6IGhvc3QucGFydFZpc2liaWxpdHkuZWRpdG9yLFxuXHRcdFx0ZXZlbnRzOiBob3N0LmV2ZW50cyxcblx0XHRcdGxheW91dENvdW50OiBob3N0LmNvdW50cy5sYXlvdXQsXG5cdFx0XHRzYXZlQ291bnQ6IGhvc3QuY291bnRzLnNhdmUsXG5cdFx0XHRzbmFwc2hvdDogaG9zdC5fbWVtZW50by5kb2NrZWRFZGl0b3JTaXplQmVmb3JlSGlkZSxcblx0XHR9LCB7XG5cdFx0XHRlZGl0b3JWaXNpYmxlOiBmYWxzZSxcblx0XHRcdGV2ZW50czogW10sXG5cdFx0XHRsYXlvdXRDb3VudDogMCxcblx0XHRcdHNhdmVDb3VudDogMCxcblx0XHRcdHNuYXBzaG90OiB7IHdpZHRoOiA5MDAsIGhlaWdodDogODAwIH0sXG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2RvZXMgbm90IHJldmVhbCB0aGUgZG9ja2VkIGVkaXRvciB3aGVuIHRoZSBzYXNoIHdpZGVucyB0aGUgbm9kZSBlbm91Z2ggdG8gZml0IHRoZSBlZGl0b3IgYmVzaWRlIHRoZSBkZXRhaWwnLCAoKSA9PiB7XG5cdFx0Y29uc3QgaG9zdCA9IGNyZWF0ZUhvc3QoeyBzaW5nbGU6IHRydWUsIHNlc3Npb25zV2lkdGg6IDEwMDAsIGRvY2tlZFdpZHRoOiAzMDAsIGVkaXRvcldpZHRoOiA1MDAsIHBhcnRWaXNpYmlsaXR5OiB7IGVkaXRvcjogZmFsc2UsIGF1eGlsaWFyeUJhcjogdHJ1ZSB9IH0pO1xuXG5cdFx0b25FZGl0b3JOb2RlUmVzaXplZC5jYWxsKGhvc3QsIDUwMCk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdGVkaXRvclZpc2libGU6IGhvc3QucGFydFZpc2liaWxpdHkuZWRpdG9yLFxuXHRcdFx0ZXZlbnRzOiBob3N0LmV2ZW50cyxcblx0XHRcdGxheW91dENvdW50OiBob3N0LmNvdW50cy5sYXlvdXQsXG5cdFx0XHRzYXZlQ291bnQ6IGhvc3QuY291bnRzLnNhdmUsXG5cdFx0XHRjbGFzc1RvZ2dsZXM6IGhvc3QuY2xhc3NUb2dnbGVzLFxuXHRcdH0sIHtcblx0XHRcdGVkaXRvclZpc2libGU6IGZhbHNlLFxuXHRcdFx0ZXZlbnRzOiBbXSxcblx0XHRcdGxheW91dENvdW50OiAwLFxuXHRcdFx0c2F2ZUNvdW50OiAwLFxuXHRcdFx0Y2xhc3NUb2dnbGVzOiBbXSxcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnZG9lcyBub3QgcmV2ZWFsIHRoZSBkb2NrZWQgZWRpdG9yIHdoaWxlIHdpZGVuaW5nIHRoZSBub2RlIGZyb20gYSBncmlkIGxheW91dCBjaGFuZ2UnLCAoKSA9PiB7XG5cdFx0Y29uc3QgaG9zdCA9IGNyZWF0ZUhvc3QoeyBzaW5nbGU6IHRydWUsIHNlc3Npb25zV2lkdGg6IDEwMDAsIGRvY2tlZFdpZHRoOiAzMDAsIGVkaXRvcldpZHRoOiA0OTksIHBhcnRWaXNpYmlsaXR5OiB7IGVkaXRvcjogZmFsc2UsIGF1eGlsaWFyeUJhcjogdHJ1ZSB9IH0pO1xuXG5cdFx0b25HcmlkRGlkQ2hhbmdlLmNhbGwoaG9zdCk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdGVkaXRvclZpc2libGU6IGhvc3QucGFydFZpc2liaWxpdHkuZWRpdG9yLFxuXHRcdFx0ZXZlbnRzOiBob3N0LmV2ZW50cyxcblx0XHRcdGxheW91dENvdW50OiBob3N0LmNvdW50cy5sYXlvdXQsXG5cdFx0XHRzYXZlQ291bnQ6IGhvc3QuY291bnRzLnNhdmUsXG5cdFx0fSwge1xuXHRcdFx0ZWRpdG9yVmlzaWJsZTogZmFsc2UsXG5cdFx0XHRldmVudHM6IFtdLFxuXHRcdFx0bGF5b3V0Q291bnQ6IDAsXG5cdFx0XHRzYXZlQ291bnQ6IDAsXG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2RvZXMgbm90IHJldmVhbCB0aGUgZG9ja2VkIGVkaXRvciBmcm9tIGEgd2lkZW4gd2hpbGUgdGhlIGRldGFpbCBpcyBhbHNvIGhpZGRlbicsICgpID0+IHtcblx0XHRjb25zdCBob3N0ID0gY3JlYXRlSG9zdCh7IHNpbmdsZTogdHJ1ZSwgc2Vzc2lvbnNXaWR0aDogMTAwMCwgZG9ja2VkV2lkdGg6IDMwMCwgZWRpdG9yV2lkdGg6IDY1MCwgcGFydFZpc2liaWxpdHk6IHsgZWRpdG9yOiBmYWxzZSwgYXV4aWxpYXJ5QmFyOiBmYWxzZSB9IH0pO1xuXG5cdFx0b25FZGl0b3JOb2RlUmVzaXplZC5jYWxsKGhvc3QsIDY1MCk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdGVkaXRvclZpc2libGU6IGhvc3QucGFydFZpc2liaWxpdHkuZWRpdG9yLFxuXHRcdFx0ZXZlbnRzOiBob3N0LmV2ZW50cyxcblx0XHRcdGxheW91dENvdW50OiBob3N0LmNvdW50cy5sYXlvdXQsXG5cdFx0XHRzYXZlQ291bnQ6IGhvc3QuY291bnRzLnNhdmUsXG5cdFx0fSwge1xuXHRcdFx0ZWRpdG9yVmlzaWJsZTogZmFsc2UsXG5cdFx0XHRldmVudHM6IFtdLFxuXHRcdFx0bGF5b3V0Q291bnQ6IDAsXG5cdFx0XHRzYXZlQ291bnQ6IDAsXG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2tlZXBzIGRvY2tlZCBlZGl0b3IgaGlkZGVuIHdoZW4gZWRpdG9yIHBhcnQgbGF5b3V0IHdpZHRoIGxlYXZlcyBvbmx5IGRldGFpbCB3aWR0aCcsICgpID0+IHtcblx0XHRjb25zdCBob3N0ID0gY3JlYXRlSG9zdCh7IHNpbmdsZTogdHJ1ZSwgc2Vzc2lvbnNXaWR0aDogMTAwMCwgZG9ja2VkV2lkdGg6IDMwMCwgZWRpdG9yV2lkdGg6IDMwMCB9KTtcblxuXHRcdG9uRWRpdG9yTm9kZVJlc2l6ZWQuY2FsbChob3N0LCAzMDQpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRlZGl0b3JWaXNpYmxlOiBob3N0LnBhcnRWaXNpYmlsaXR5LmVkaXRvcixcblx0XHRcdGV2ZW50czogaG9zdC5ldmVudHMsXG5cdFx0XHRsYXlvdXRDb3VudDogaG9zdC5jb3VudHMubGF5b3V0LFxuXHRcdFx0c2F2ZUNvdW50OiBob3N0LmNvdW50cy5zYXZlLFxuXHRcdH0sIHtcblx0XHRcdGVkaXRvclZpc2libGU6IGZhbHNlLFxuXHRcdFx0ZXZlbnRzOiBbXSxcblx0XHRcdGxheW91dENvdW50OiAwLFxuXHRcdFx0c2F2ZUNvdW50OiAwLFxuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdrZWVwcyBkb2NrZWQgZWRpdG9yIGhpZGRlbiB3aGVuIGdyaWQgc2FzaCBsZWF2ZXMgb25seSBkZXRhaWwgd2lkdGgnLCAoKSA9PiB7XG5cdFx0Y29uc3QgaG9zdCA9IGNyZWF0ZUhvc3QoeyBzaW5nbGU6IHRydWUsIHNlc3Npb25zV2lkdGg6IDEwMDAsIGRvY2tlZFdpZHRoOiAzMDAsIGVkaXRvcldpZHRoOiAzMDAgfSk7XG5cblx0XHRvbkdyaWREaWRDaGFuZ2UuY2FsbChob3N0KTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0ZWRpdG9yVmlzaWJsZTogaG9zdC5wYXJ0VmlzaWJpbGl0eS5lZGl0b3IsXG5cdFx0XHRldmVudHM6IGhvc3QuZXZlbnRzLFxuXHRcdFx0bGF5b3V0Q291bnQ6IGhvc3QuY291bnRzLmxheW91dCxcblx0XHRcdHNhdmVDb3VudDogaG9zdC5jb3VudHMuc2F2ZSxcblx0XHR9LCB7XG5cdFx0XHRlZGl0b3JWaXNpYmxlOiBmYWxzZSxcblx0XHRcdGV2ZW50czogW10sXG5cdFx0XHRsYXlvdXRDb3VudDogMCxcblx0XHRcdHNhdmVDb3VudDogMCxcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnaGlkZXMgZGV0YWlscyB3aGVuIHRoZSBlZGl0b3Igc2FzaCBsZWF2ZXMgdG9vIGxpdHRsZSByb29tIGZvciBib3RoIHBhbmVzJywgKCkgPT4ge1xuXHRcdGNvbnN0IGhvc3QgPSBjcmVhdGVIb3N0KHsgc2luZ2xlOiB0cnVlLCBzZXNzaW9uc1dpZHRoOiAxMDAwLCBkb2NrZWRXaWR0aDogMzAwLCBlZGl0b3JXaWR0aDogNjAwLCBwYXJ0VmlzaWJpbGl0eTogeyBlZGl0b3I6IHRydWUsIGF1eGlsaWFyeUJhcjogdHJ1ZSB9IH0pO1xuXG5cdFx0b25FZGl0b3JOb2RlUmVzaXplZC5jYWxsKGhvc3QsIDU5OSk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdGVkaXRvclZpc2libGU6IGhvc3QucGFydFZpc2liaWxpdHkuZWRpdG9yLFxuXHRcdFx0ZGV0YWlsVmlzaWJsZTogaG9zdC5wYXJ0VmlzaWJpbGl0eS5hdXhpbGlhcnlCYXIsXG5cdFx0XHRkZXRhaWxIaWRkZW5Gb3JFZGl0b3JSZXNpemU6IGhvc3QuX2RldGFpbEhpZGRlbkZvckVkaXRvclJlc2l6ZSxcblx0XHRcdGV2ZW50czogaG9zdC5ldmVudHMsXG5cdFx0XHRsYXlvdXRDb3VudDogaG9zdC5jb3VudHMubGF5b3V0LFxuXHRcdFx0c2F2ZUNvdW50OiBob3N0LmNvdW50cy5zYXZlLFxuXHRcdH0sIHtcblx0XHRcdGVkaXRvclZpc2libGU6IHRydWUsXG5cdFx0XHRkZXRhaWxWaXNpYmxlOiBmYWxzZSxcblx0XHRcdGRldGFpbEhpZGRlbkZvckVkaXRvclJlc2l6ZTogdHJ1ZSxcblx0XHRcdGV2ZW50czogW3sgcGFydElkOiBQYXJ0cy5BVVhJTElBUllCQVJfUEFSVCwgdmlzaWJsZTogZmFsc2UsIHNvdXJjZTogJ3Jlc2l6ZScgfV0sXG5cdFx0XHRsYXlvdXRDb3VudDogMSxcblx0XHRcdHNhdmVDb3VudDogMCxcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnc2hvd3MgZGV0YWlscyB3aGVuIHRoZSBlZGl0b3Igc2FzaCByZXN0b3JlcyByb29tIGFmdGVyIGFuIGF1dG9tYXRpYyBoaWRlJywgKCkgPT4ge1xuXHRcdGNvbnN0IGhvc3QgPSBjcmVhdGVIb3N0KHsgc2luZ2xlOiB0cnVlLCBzZXNzaW9uc1dpZHRoOiAxMDAwLCBkb2NrZWRXaWR0aDogMzAwLCBlZGl0b3JXaWR0aDogNjAwLCBwYXJ0VmlzaWJpbGl0eTogeyBlZGl0b3I6IHRydWUsIGF1eGlsaWFyeUJhcjogdHJ1ZSB9IH0pO1xuXG5cdFx0b25FZGl0b3JOb2RlUmVzaXplZC5jYWxsKGhvc3QsIDU5OSk7XG5cdFx0b25FZGl0b3JOb2RlUmVzaXplZC5jYWxsKGhvc3QsIDcwMCk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdGVkaXRvclZpc2libGU6IGhvc3QucGFydFZpc2liaWxpdHkuZWRpdG9yLFxuXHRcdFx0ZGV0YWlsVmlzaWJsZTogaG9zdC5wYXJ0VmlzaWJpbGl0eS5hdXhpbGlhcnlCYXIsXG5cdFx0XHRkZXRhaWxIaWRkZW5Gb3JFZGl0b3JSZXNpemU6IGhvc3QuX2RldGFpbEhpZGRlbkZvckVkaXRvclJlc2l6ZSxcblx0XHRcdGV2ZW50czogaG9zdC5ldmVudHMsXG5cdFx0XHRsYXlvdXRDb3VudDogaG9zdC5jb3VudHMubGF5b3V0LFxuXHRcdFx0c2F2ZUNvdW50OiBob3N0LmNvdW50cy5zYXZlLFxuXHRcdH0sIHtcblx0XHRcdGVkaXRvclZpc2libGU6IHRydWUsXG5cdFx0XHRkZXRhaWxWaXNpYmxlOiB0cnVlLFxuXHRcdFx0ZGV0YWlsSGlkZGVuRm9yRWRpdG9yUmVzaXplOiBmYWxzZSxcblx0XHRcdGV2ZW50czogW1xuXHRcdFx0XHR7IHBhcnRJZDogUGFydHMuQVVYSUxJQVJZQkFSX1BBUlQsIHZpc2libGU6IGZhbHNlLCBzb3VyY2U6ICdyZXNpemUnIH0sXG5cdFx0XHRcdHsgcGFydElkOiBQYXJ0cy5BVVhJTElBUllCQVJfUEFSVCwgdmlzaWJsZTogdHJ1ZSwgc291cmNlOiAncmVzaXplJyB9LFxuXHRcdFx0XSxcblx0XHRcdGxheW91dENvdW50OiAyLFxuXHRcdFx0c2F2ZUNvdW50OiAwLFxuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdkb2VzIG5vdCBoaWRlIGRvY2tlZCBlZGl0b3Igd2hlbiBub2RlIGlzIHNxdWVlemVkIGJ1dCBkZXRhaWwgaXMgYWxzbyBoaWRkZW4nLCAoKSA9PiB7XG5cdFx0Y29uc3QgaG9zdCA9IGNyZWF0ZUhvc3QoeyBzaW5nbGU6IHRydWUsIHNlc3Npb25zV2lkdGg6IDEwMDAsIGRvY2tlZFdpZHRoOiAzMDAsIGVkaXRvcldpZHRoOiA2MDAsIHBhcnRWaXNpYmlsaXR5OiB7IGVkaXRvcjogdHJ1ZSwgYXV4aWxpYXJ5QmFyOiBmYWxzZSB9IH0pO1xuXG5cdFx0b25FZGl0b3JOb2RlUmVzaXplZC5jYWxsKGhvc3QsIDMwNCk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdGVkaXRvclZpc2libGU6IGhvc3QucGFydFZpc2liaWxpdHkuZWRpdG9yLFxuXHRcdFx0ZXZlbnRzOiBob3N0LmV2ZW50cyxcblx0XHRcdGxheW91dENvdW50OiBob3N0LmNvdW50cy5sYXlvdXQsXG5cdFx0XHRzYXZlQ291bnQ6IGhvc3QuY291bnRzLnNhdmUsXG5cdFx0fSwge1xuXHRcdFx0ZWRpdG9yVmlzaWJsZTogdHJ1ZSxcblx0XHRcdGV2ZW50czogW10sXG5cdFx0XHRsYXlvdXRDb3VudDogMCxcblx0XHRcdHNhdmVDb3VudDogMCxcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgna2VlcHMgZWRpdG9yIHJlc2l6ZSBzdGF0ZSB3aGVuIHRoZSBvdXRlciBzYXNoIGhpZGVzIGRldGFpbHMgYmVmb3JlIGNvbGxhcHNpbmcgdGhlIGVkaXRvcicsICgpID0+IHtcblx0XHRjb25zdCBob3N0ID0gY3JlYXRlSG9zdCh7IHNpbmdsZTogdHJ1ZSwgc2Vzc2lvbnNXaWR0aDogMTAwMCwgZG9ja2VkV2lkdGg6IDMwMCwgZWRpdG9yV2lkdGg6IDYwMCwgcGFydFZpc2liaWxpdHk6IHsgZWRpdG9yOiB0cnVlLCBhdXhpbGlhcnlCYXI6IHRydWUgfSB9KTtcblx0XHRob3N0Ll9lZGl0b3JSZXZlYWxlZEV4cGxpY2l0bHkgPSB0cnVlO1xuXG5cdFx0b25FZGl0b3JOb2RlUmVzaXplZC5jYWxsKGhvc3QsIDMwMCk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdGVkaXRvclZpc2libGU6IGhvc3QucGFydFZpc2liaWxpdHkuZWRpdG9yLFxuXHRcdFx0ZGV0YWlsVmlzaWJsZTogaG9zdC5wYXJ0VmlzaWJpbGl0eS5hdXhpbGlhcnlCYXIsXG5cdFx0XHRlZGl0b3JSZXZlYWxlZEV4cGxpY2l0bHk6IGhvc3QuX2VkaXRvclJldmVhbGVkRXhwbGljaXRseSxcblx0XHR9LCB7XG5cdFx0XHRlZGl0b3JWaXNpYmxlOiB0cnVlLFxuXHRcdFx0ZGV0YWlsVmlzaWJsZTogZmFsc2UsXG5cdFx0XHRlZGl0b3JSZXZlYWxlZEV4cGxpY2l0bHk6IHRydWUsXG5cdFx0fSk7XG5cdH0pO1xuXG5cdC8vIC0tLSBEb2NrZWRBdXhpbGlhcnlCYXJDb250cm9sbGVyIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG5cblx0dGVzdCgnZmlsbHMgdGhlIG5hcnJvd2VkIGRvY2tlZCBkZXRhaWwgbm9kZSBhbmQgZGlzYWJsZXMgaXRzIG92ZXJsYXkgc2FzaCB3aGVuIGVkaXRvciBjb250ZW50IGlzIGhpZGRlbicsICgpID0+IHtcblxuXHRcdGNvbnN0IGVkaXRvckNvbnRhaW5lciA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2RpdicpO1xuXHRcdGNvbnN0IGF1eGlsaWFyeUJhckNvbnRhaW5lciA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2RpdicpO1xuXHRcdGNvbnN0IGxheW91dHM6IHsgd2lkdGg6IG51bWJlcjsgaGVpZ2h0OiBudW1iZXI7IHRvcDogbnVtYmVyOyBsZWZ0OiBudW1iZXIgfVtdID0gW107XG5cdFx0Y29uc3QgaW5zZXRzOiBudW1iZXJbXSA9IFtdO1xuXHRcdGNvbnN0IHBlcnNpc3RlZFdpZHRoczogbnVtYmVyW10gPSBbXTtcblx0XHRsZXQgZWRpdG9yVmlzaWJsZSA9IHRydWU7XG5cdFx0bGV0IGVkaXRvcldpZHRoID0gODAwO1xuXG5cdFx0T2JqZWN0LmRlZmluZVByb3BlcnR5KGVkaXRvckNvbnRhaW5lciwgJ2NsaWVudFdpZHRoJywgeyBnZXQ6ICgpID0+IGVkaXRvcldpZHRoIH0pO1xuXHRcdE9iamVjdC5kZWZpbmVQcm9wZXJ0eShlZGl0b3JDb250YWluZXIsICdjbGllbnRIZWlnaHQnLCB7IHZhbHVlOiA2MDAgfSk7XG5cdFx0ZWRpdG9yQ29udGFpbmVyLmdldEJvdW5kaW5nQ2xpZW50UmVjdCA9ICgpID0+ICh7XG5cdFx0XHR3aWR0aDogZWRpdG9yV2lkdGgsXG5cdFx0XHRoZWlnaHQ6IDYwMCxcblx0XHRcdHRvcDogMCxcblx0XHRcdHJpZ2h0OiBlZGl0b3JXaWR0aCxcblx0XHRcdGJvdHRvbTogNjAwLFxuXHRcdFx0bGVmdDogMCxcblx0XHRcdHg6IDAsXG5cdFx0XHR5OiAwLFxuXHRcdFx0dG9KU09OOiAoKSA9PiB1bmRlZmluZWQsXG5cdFx0fSk7XG5cblx0XHRjb25zdCBhdXhpbGlhcnlCYXJQYXJ0ID0ge1xuXHRcdFx0Z2V0Q29udGFpbmVyOiAoKSA9PiBhdXhpbGlhcnlCYXJDb250YWluZXIsXG5cdFx0XHRsYXlvdXQ6ICh3aWR0aDogbnVtYmVyLCBoZWlnaHQ6IG51bWJlciwgdG9wOiBudW1iZXIsIGxlZnQ6IG51bWJlcikgPT4ge1xuXHRcdFx0XHRsYXlvdXRzLnB1c2goeyB3aWR0aCwgaGVpZ2h0LCB0b3AsIGxlZnQgfSk7XG5cdFx0XHR9LFxuXHRcdH0gYXMgdW5rbm93biBhcyBQYXJ0O1xuXHRcdGNvbnN0IGhvc3Q6IElEb2NrZWRBdXhpbGlhcnlCYXJIb3N0ID0ge1xuXHRcdFx0Z2V0V2lkdGg6ICgpID0+IDI2MCxcblx0XHRcdHNldFdpZHRoOiB3aWR0aCA9PiBwZXJzaXN0ZWRXaWR0aHMucHVzaCh3aWR0aCksXG5cdFx0XHRpc0VkaXRvckFyZWFWaXNpYmxlOiAoKSA9PiB0cnVlLFxuXHRcdFx0aXNFZGl0b3JWaXNpYmxlOiAoKSA9PiBlZGl0b3JWaXNpYmxlLFxuXHRcdFx0aXNBdXhpbGlhcnlCYXJWaXNpYmxlOiAoKSA9PiB0cnVlLFxuXHRcdFx0aGlkZUF1eGlsaWFyeUJhcjogKCkgPT4geyB9LFxuXHRcdFx0c2V0RWRpdG9yQ29udGVudFJpZ2h0SW5zZXQ6IHB4ID0+IGluc2V0cy5wdXNoKHB4KSxcblx0XHRcdGdldEhlYWRlckhlaWdodDogKCkgPT4gMCxcblx0XHR9O1xuXHRcdGNvbnN0IGNvbnRyb2xsZXIgPSBuZXcgRG9ja2VkQXV4aWxpYXJ5QmFyQ29udHJvbGxlcihlZGl0b3JDb250YWluZXIsIGF1eGlsaWFyeUJhclBhcnQsIGhvc3QpO1xuXG5cdFx0Y29udHJvbGxlci5sYXlvdXQoKTtcblx0XHRlZGl0b3JXaWR0aCA9IDI2MDtcblx0XHRlZGl0b3JWaXNpYmxlID0gZmFsc2U7XG5cdFx0Y29udHJvbGxlci5sYXlvdXQoKTtcblxuXHRcdGNvbnN0IHNhc2ggPSBSZWZsZWN0LmdldChjb250cm9sbGVyLCAnX3Nhc2gnKSBhcyB7IHN0YXRlOiBTYXNoU3RhdGUgfTtcblx0XHRjb25zdCBzYXNoTGF5b3V0UHJvdmlkZXIgPSBSZWZsZWN0LmdldChzYXNoLCAnbGF5b3V0UHJvdmlkZXInKSBhcyB7IGdldFZlcnRpY2FsU2FzaExlZnQoKTogbnVtYmVyIH07XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRpbnNldHMsXG5cdFx0XHRwZXJzaXN0ZWRXaWR0aHMsXG5cdFx0XHRsYXlvdXRzLFxuXHRcdFx0c3R5bGU6IHtcblx0XHRcdFx0dG9wOiBhdXhpbGlhcnlCYXJDb250YWluZXIuc3R5bGUudG9wLFxuXHRcdFx0XHRyaWdodDogYXV4aWxpYXJ5QmFyQ29udGFpbmVyLnN0eWxlLnJpZ2h0LFxuXHRcdFx0XHR3aWR0aDogYXV4aWxpYXJ5QmFyQ29udGFpbmVyLnN0eWxlLndpZHRoLFxuXHRcdFx0XHRoZWlnaHQ6IGF1eGlsaWFyeUJhckNvbnRhaW5lci5zdHlsZS5oZWlnaHQsXG5cdFx0XHR9LFxuXHRcdFx0c2FzaFN0YXRlOiBzYXNoPy5zdGF0ZSxcblx0XHRcdHNhc2hMZWZ0OiBzYXNoTGF5b3V0UHJvdmlkZXIuZ2V0VmVydGljYWxTYXNoTGVmdCgpLFxuXHRcdH0sIHtcblx0XHRcdGluc2V0czogWzI2MCwgMjYwXSxcblx0XHRcdHBlcnNpc3RlZFdpZHRoczogW10sXG5cdFx0XHRsYXlvdXRzOiBbXG5cdFx0XHRcdHsgd2lkdGg6IDI2MCwgaGVpZ2h0OiA1NjUsIHRvcDogMzUsIGxlZnQ6IDU0MCB9LFxuXHRcdFx0XHR7IHdpZHRoOiAyNjAsIGhlaWdodDogNTY1LCB0b3A6IDM1LCBsZWZ0OiAwIH0sXG5cdFx0XHRdLFxuXHRcdFx0c3R5bGU6IHtcblx0XHRcdFx0dG9wOiAnMzVweCcsXG5cdFx0XHRcdHJpZ2h0OiAnMHB4Jyxcblx0XHRcdFx0d2lkdGg6ICcyNjBweCcsXG5cdFx0XHRcdGhlaWdodDogJzU2NXB4Jyxcblx0XHRcdH0sXG5cdFx0XHQvLyBUaGUgZ3JpZCBzYXNoIG93bnMgcmVzaXppbmcvY29sbGFwc2luZyBoZXJlOyB0aGUgb3ZlcmxheSBzYXNoIG11c3QgYmUgZGlzYWJsZWQuXG5cdFx0XHRzYXNoU3RhdGU6IFNhc2hTdGF0ZS5EaXNhYmxlZCxcblx0XHRcdHNhc2hMZWZ0OiAwLFxuXHRcdH0pO1xuXG5cdFx0Y29udHJvbGxlci5kaXNwb3NlKCk7XG5cdH0pO1xuXG5cdHRlc3QoJ3VzZXMgcGVyc2lzdGVkIGRvY2tlZCBkZXRhaWwgd2lkdGggd2hlbiBlZGl0b3IgY29udGVudCBpcyB2aXNpYmxlJywgKCkgPT4ge1xuXHRcdGNvbnN0IGVkaXRvckNvbnRhaW5lciA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2RpdicpO1xuXHRcdGNvbnN0IGF1eGlsaWFyeUJhckNvbnRhaW5lciA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2RpdicpO1xuXHRcdGNvbnN0IGxheW91dHM6IHsgd2lkdGg6IG51bWJlcjsgaGVpZ2h0OiBudW1iZXI7IHRvcDogbnVtYmVyOyBsZWZ0OiBudW1iZXIgfVtdID0gW107XG5cdFx0Y29uc3QgaW5zZXRzOiBudW1iZXJbXSA9IFtdO1xuXG5cdFx0T2JqZWN0LmRlZmluZVByb3BlcnR5KGVkaXRvckNvbnRhaW5lciwgJ2NsaWVudFdpZHRoJywgeyB2YWx1ZTogODAwIH0pO1xuXHRcdE9iamVjdC5kZWZpbmVQcm9wZXJ0eShlZGl0b3JDb250YWluZXIsICdjbGllbnRIZWlnaHQnLCB7IHZhbHVlOiA2MDAgfSk7XG5cdFx0ZWRpdG9yQ29udGFpbmVyLmdldEJvdW5kaW5nQ2xpZW50UmVjdCA9ICgpID0+ICh7XG5cdFx0XHR3aWR0aDogODAwLFxuXHRcdFx0aGVpZ2h0OiA2MDAsXG5cdFx0XHR0b3A6IDAsXG5cdFx0XHRyaWdodDogODAwLFxuXHRcdFx0Ym90dG9tOiA2MDAsXG5cdFx0XHRsZWZ0OiAwLFxuXHRcdFx0eDogMCxcblx0XHRcdHk6IDAsXG5cdFx0XHR0b0pTT046ICgpID0+IHVuZGVmaW5lZCxcblx0XHR9KTtcblxuXHRcdGNvbnN0IGF1eGlsaWFyeUJhclBhcnQgPSB7XG5cdFx0XHRnZXRDb250YWluZXI6ICgpID0+IGF1eGlsaWFyeUJhckNvbnRhaW5lcixcblx0XHRcdGxheW91dDogKHdpZHRoOiBudW1iZXIsIGhlaWdodDogbnVtYmVyLCB0b3A6IG51bWJlciwgbGVmdDogbnVtYmVyKSA9PiB7XG5cdFx0XHRcdGxheW91dHMucHVzaCh7IHdpZHRoLCBoZWlnaHQsIHRvcCwgbGVmdCB9KTtcblx0XHRcdH0sXG5cdFx0fSBhcyB1bmtub3duIGFzIFBhcnQ7XG5cdFx0Y29uc3QgaG9zdDogSURvY2tlZEF1eGlsaWFyeUJhckhvc3QgPSB7XG5cdFx0XHRnZXRXaWR0aDogKCkgPT4gMjYwLFxuXHRcdFx0c2V0V2lkdGg6ICgpID0+IHsgfSxcblx0XHRcdGlzRWRpdG9yQXJlYVZpc2libGU6ICgpID0+IHRydWUsXG5cdFx0XHRpc0VkaXRvclZpc2libGU6ICgpID0+IHRydWUsXG5cdFx0XHRpc0F1eGlsaWFyeUJhclZpc2libGU6ICgpID0+IHRydWUsXG5cdFx0XHRoaWRlQXV4aWxpYXJ5QmFyOiAoKSA9PiB7IH0sXG5cdFx0XHRzZXRFZGl0b3JDb250ZW50UmlnaHRJbnNldDogcHggPT4gaW5zZXRzLnB1c2gocHgpLFxuXHRcdFx0Z2V0SGVhZGVySGVpZ2h0OiAoKSA9PiAwLFxuXHRcdH07XG5cdFx0Y29uc3QgY29udHJvbGxlciA9IG5ldyBEb2NrZWRBdXhpbGlhcnlCYXJDb250cm9sbGVyKGVkaXRvckNvbnRhaW5lciwgYXV4aWxpYXJ5QmFyUGFydCwgaG9zdCk7XG5cblx0XHRjb250cm9sbGVyLmxheW91dCgpO1xuXG5cdFx0Y29uc3Qgc2FzaCA9IFJlZmxlY3QuZ2V0KGNvbnRyb2xsZXIsICdfc2FzaCcpIGFzIHsgc3RhdGU6IFNhc2hTdGF0ZSB9IHwgdW5kZWZpbmVkO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0aW5zZXRzLFxuXHRcdFx0bGF5b3V0cyxcblx0XHRcdHN0eWxlOiB7XG5cdFx0XHRcdHdpZHRoOiBhdXhpbGlhcnlCYXJDb250YWluZXIuc3R5bGUud2lkdGgsXG5cdFx0XHRcdGhlaWdodDogYXV4aWxpYXJ5QmFyQ29udGFpbmVyLnN0eWxlLmhlaWdodCxcblx0XHRcdH0sXG5cdFx0XHRzYXNoU3RhdGU6IHNhc2g/LnN0YXRlLFxuXHRcdH0sIHtcblx0XHRcdGluc2V0czogWzI2MF0sXG5cdFx0XHRsYXlvdXRzOiBbeyB3aWR0aDogMjYwLCBoZWlnaHQ6IDU2NSwgdG9wOiAzNSwgbGVmdDogNTQwIH1dLFxuXHRcdFx0c3R5bGU6IHtcblx0XHRcdFx0d2lkdGg6ICcyNjBweCcsXG5cdFx0XHRcdGhlaWdodDogJzU2NXB4Jyxcblx0XHRcdH0sXG5cdFx0XHRzYXNoU3RhdGU6IFNhc2hTdGF0ZS5FbmFibGVkLFxuXHRcdH0pO1xuXG5cdFx0Y29udHJvbGxlci5kaXNwb3NlKCk7XG5cdH0pO1xuXG5cdHRlc3QoJ2hpZGVzIHRoZSBkb2NrZWQgZGV0YWlsIHBhbmVsIHdoZW4gaXRzIHNhc2ggY29sbGFwc2VzIHRvIHplcm8gd2lkdGgnLCAoKSA9PiB7XG5cdFx0Y29uc3QgZWRpdG9yQ29udGFpbmVyID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnZGl2Jyk7XG5cdFx0Y29uc3QgYXV4aWxpYXJ5QmFyQ29udGFpbmVyID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnZGl2Jyk7XG5cdFx0bGV0IGhpZGVDb3VudCA9IDA7XG5cdFx0Y29uc3QgcGVyc2lzdGVkV2lkdGhzOiBudW1iZXJbXSA9IFtdO1xuXG5cdFx0T2JqZWN0LmRlZmluZVByb3BlcnR5KGVkaXRvckNvbnRhaW5lciwgJ2NsaWVudFdpZHRoJywgeyB2YWx1ZTogODAwIH0pO1xuXHRcdE9iamVjdC5kZWZpbmVQcm9wZXJ0eShlZGl0b3JDb250YWluZXIsICdjbGllbnRIZWlnaHQnLCB7IHZhbHVlOiA2MDAgfSk7XG5cdFx0ZWRpdG9yQ29udGFpbmVyLmdldEJvdW5kaW5nQ2xpZW50UmVjdCA9ICgpID0+ICh7XG5cdFx0XHR3aWR0aDogODAwLFxuXHRcdFx0aGVpZ2h0OiA2MDAsXG5cdFx0XHR0b3A6IDAsXG5cdFx0XHRyaWdodDogODAwLFxuXHRcdFx0Ym90dG9tOiA2MDAsXG5cdFx0XHRsZWZ0OiAwLFxuXHRcdFx0eDogMCxcblx0XHRcdHk6IDAsXG5cdFx0XHR0b0pTT046ICgpID0+IHVuZGVmaW5lZCxcblx0XHR9KTtcblxuXHRcdGNvbnN0IGF1eGlsaWFyeUJhclBhcnQgPSB7XG5cdFx0XHRnZXRDb250YWluZXI6ICgpID0+IGF1eGlsaWFyeUJhckNvbnRhaW5lcixcblx0XHRcdGxheW91dDogKCkgPT4geyB9LFxuXHRcdH0gYXMgdW5rbm93biBhcyBQYXJ0O1xuXHRcdGNvbnN0IGhvc3Q6IElEb2NrZWRBdXhpbGlhcnlCYXJIb3N0ID0ge1xuXHRcdFx0Z2V0V2lkdGg6ICgpID0+IDI2MCxcblx0XHRcdHNldFdpZHRoOiB3aWR0aCA9PiBwZXJzaXN0ZWRXaWR0aHMucHVzaCh3aWR0aCksXG5cdFx0XHRpc0VkaXRvckFyZWFWaXNpYmxlOiAoKSA9PiB0cnVlLFxuXHRcdFx0aXNFZGl0b3JWaXNpYmxlOiAoKSA9PiB0cnVlLFxuXHRcdFx0aXNBdXhpbGlhcnlCYXJWaXNpYmxlOiAoKSA9PiB0cnVlLFxuXHRcdFx0aGlkZUF1eGlsaWFyeUJhcjogKCkgPT4gaGlkZUNvdW50KyssXG5cdFx0XHRzZXRFZGl0b3JDb250ZW50UmlnaHRJbnNldDogKCkgPT4geyB9LFxuXHRcdFx0Z2V0SGVhZGVySGVpZ2h0OiAoKSA9PiAwLFxuXHRcdH07XG5cdFx0Y29uc3QgY29udHJvbGxlciA9IG5ldyBEb2NrZWRBdXhpbGlhcnlCYXJDb250cm9sbGVyKGVkaXRvckNvbnRhaW5lciwgYXV4aWxpYXJ5QmFyUGFydCwgaG9zdCk7XG5cblx0XHRjb250cm9sbGVyLmxheW91dCgpO1xuXHRcdGNvbnN0IHNhc2ggPSBSZWZsZWN0LmdldChjb250cm9sbGVyLCAnX3Nhc2gnKTtcblx0XHRjb25zdCBzdGFydCA9IFJlZmxlY3QuZ2V0KHNhc2gsICdfb25EaWRTdGFydCcpIGFzIHsgZmlyZShlOiB1bmtub3duKTogdm9pZCB9O1xuXHRcdGNvbnN0IGNoYW5nZSA9IFJlZmxlY3QuZ2V0KHNhc2gsICdfb25EaWRDaGFuZ2UnKSBhcyB7IGZpcmUoZTogdW5rbm93bik6IHZvaWQgfTtcblx0XHRzdGFydC5maXJlKHsgc3RhcnRYOiAwLCBjdXJyZW50WDogMCwgc3RhcnRZOiAwLCBjdXJyZW50WTogMCwgYWx0S2V5OiBmYWxzZSB9KTtcblx0XHRjaGFuZ2UuZmlyZSh7IHN0YXJ0WDogMCwgY3VycmVudFg6IDI3MCwgc3RhcnRZOiAwLCBjdXJyZW50WTogMCwgYWx0S2V5OiBmYWxzZSB9KTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoeyBoaWRlQ291bnQsIHBlcnNpc3RlZFdpZHRocyB9LCB7IGhpZGVDb3VudDogMSwgcGVyc2lzdGVkV2lkdGhzOiBbXSB9KTtcblxuXHRcdGNvbnRyb2xsZXIuZGlzcG9zZSgpO1xuXHR9KTtcblxuXHQvLyAtLS0gTGFzdC1lZGl0b3IgY2xvc2UgLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG5cblx0dGVzdCgnZG9ja2VkIGxhc3QgZWRpdG9yIGNsb3NlIGlzIGRlbGVnYXRlZCB0byB0aGUgbGlmZWN5Y2xlIHN0cmF0ZWd5JywgKCkgPT4ge1xuXHRcdGNvbnN0IGVkaXRvckhpZGRlbkNhbGxzOiB7IGhpZGRlbjogYm9vbGVhbjsgc3VwcHJlc3Npb246IG51bWJlciB9W10gPSBbXTtcblx0XHRjb25zdCBhdXhIaWRkZW5DYWxsczogeyBoaWRkZW46IGJvb2xlYW47IHN1cHByZXNzaW9uOiBudW1iZXIgfVtdID0gW107XG5cdFx0Y29uc3QgaG9zdCA9IGNyZWF0ZUhvc3QoeyBzaW5nbGU6IHRydWUsIHBhcnRWaXNpYmlsaXR5OiB7IGVkaXRvcjogdHJ1ZSwgYXV4aWxpYXJ5QmFyOiB0cnVlIH0sIGVkaXRvckdyb3VwU2VydmljZTogeyBtYWluUGFydDogeyBncm91cHM6IFt7IGlzRW1wdHk6IHRydWUgfV0gfSB9IH0pO1xuXHRcdGhvc3Quc2V0RWRpdG9ySGlkZGVuID0gaGlkZGVuID0+IHtcblx0XHRcdGVkaXRvckhpZGRlbkNhbGxzLnB1c2goeyBoaWRkZW4sIHN1cHByZXNzaW9uOiBob3N0Ll9lZGl0b3JQYXJ0QXV0b1Zpc2liaWxpdHlTdXBwcmVzc2lvbkNvdW50IH0pO1xuXHRcdFx0aG9zdC5wYXJ0VmlzaWJpbGl0eS5lZGl0b3IgPSAhaGlkZGVuO1xuXHRcdH07XG5cdFx0aG9zdC5zZXRBdXhpbGlhcnlCYXJIaWRkZW4gPSBoaWRkZW4gPT4ge1xuXHRcdFx0YXV4SGlkZGVuQ2FsbHMucHVzaCh7IGhpZGRlbiwgc3VwcHJlc3Npb246IGhvc3QuX2VkaXRvclBhcnRBdXRvVmlzaWJpbGl0eVN1cHByZXNzaW9uQ291bnQgfSk7XG5cdFx0XHRob3N0LnBhcnRWaXNpYmlsaXR5LmF1eGlsaWFyeUJhciA9ICFoaWRkZW47XG5cdFx0fTtcblxuXHRcdGhhbmRsZURpZENsb3NlRWRpdG9yLmNhbGwoaG9zdCk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdGVkaXRvckhpZGRlbkNhbGxzLFxuXHRcdFx0YXV4SGlkZGVuQ2FsbHMsXG5cdFx0XHR2aXNpYmlsaXR5OiBob3N0LnBhcnRWaXNpYmlsaXR5LFxuXHRcdFx0c3VwcHJlc3Npb246IGhvc3QuX2VkaXRvclBhcnRBdXRvVmlzaWJpbGl0eVN1cHByZXNzaW9uQ291bnQsXG5cdFx0fSwge1xuXHRcdFx0ZWRpdG9ySGlkZGVuQ2FsbHM6IFtdLFxuXHRcdFx0YXV4SGlkZGVuQ2FsbHM6IFtdLFxuXHRcdFx0dmlzaWJpbGl0eToge1xuXHRcdFx0XHRzaWRlYmFyOiB0cnVlLFxuXHRcdFx0XHRhdXhpbGlhcnlCYXI6IHRydWUsXG5cdFx0XHRcdGVkaXRvcjogdHJ1ZSxcblx0XHRcdFx0cGFuZWw6IGZhbHNlLFxuXHRcdFx0XHRzZXNzaW9uczogdHJ1ZSxcblx0XHRcdFx0Y3VzdG9tVmlld0dyaWQ6IGZhbHNlLFxuXHRcdFx0fSxcblx0XHRcdHN1cHByZXNzaW9uOiAwLFxuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdkb2NrZWQgbGFzdCBlZGl0b3IgY2xvc2UgbGVhdmVzIGEgZGV0YWlsLW9ubHkgY29tcG9zaXRpb24gdG8gdGhlIGxpZmVjeWNsZSBzdHJhdGVneScsICgpID0+IHtcblx0XHRjb25zdCBlZGl0b3JIaWRkZW5DYWxsczogYm9vbGVhbltdID0gW107XG5cdFx0Y29uc3QgYXV4SGlkZGVuQ2FsbHM6IHsgaGlkZGVuOiBib29sZWFuOyBzdXBwcmVzc2lvbjogbnVtYmVyIH1bXSA9IFtdO1xuXHRcdGNvbnN0IGhvc3QgPSBjcmVhdGVIb3N0KHsgc2luZ2xlOiB0cnVlLCBwYXJ0VmlzaWJpbGl0eTogeyBlZGl0b3I6IGZhbHNlLCBhdXhpbGlhcnlCYXI6IHRydWUgfSwgZWRpdG9yR3JvdXBTZXJ2aWNlOiB7IG1haW5QYXJ0OiB7IGdyb3VwczogW3sgaXNFbXB0eTogdHJ1ZSB9XSB9IH0gfSk7XG5cdFx0aG9zdC5zZXRFZGl0b3JIaWRkZW4gPSBoaWRkZW4gPT4ge1xuXHRcdFx0ZWRpdG9ySGlkZGVuQ2FsbHMucHVzaChoaWRkZW4pO1xuXHRcdFx0aG9zdC5wYXJ0VmlzaWJpbGl0eS5lZGl0b3IgPSAhaGlkZGVuO1xuXHRcdH07XG5cdFx0aG9zdC5zZXRBdXhpbGlhcnlCYXJIaWRkZW4gPSBoaWRkZW4gPT4ge1xuXHRcdFx0YXV4SGlkZGVuQ2FsbHMucHVzaCh7IGhpZGRlbiwgc3VwcHJlc3Npb246IGhvc3QuX2VkaXRvclBhcnRBdXRvVmlzaWJpbGl0eVN1cHByZXNzaW9uQ291bnQgfSk7XG5cdFx0XHRob3N0LnBhcnRWaXNpYmlsaXR5LmF1eGlsaWFyeUJhciA9ICFoaWRkZW47XG5cdFx0fTtcblxuXHRcdGhhbmRsZURpZENsb3NlRWRpdG9yLmNhbGwoaG9zdCk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdGVkaXRvckhpZGRlbkNhbGxzLFxuXHRcdFx0YXV4SGlkZGVuQ2FsbHMsXG5cdFx0XHRlZGl0b3JWaXNpYmxlOiBob3N0LnBhcnRWaXNpYmlsaXR5LmVkaXRvcixcblx0XHRcdGF1eGlsaWFyeUJhclZpc2libGU6IGhvc3QucGFydFZpc2liaWxpdHkuYXV4aWxpYXJ5QmFyLFxuXHRcdH0sIHtcblx0XHRcdGVkaXRvckhpZGRlbkNhbGxzOiBbXSxcblx0XHRcdGF1eEhpZGRlbkNhbGxzOiBbXSxcblx0XHRcdGVkaXRvclZpc2libGU6IGZhbHNlLFxuXHRcdFx0YXV4aWxpYXJ5QmFyVmlzaWJsZTogdHJ1ZSxcblx0XHR9KTtcblx0fSk7XG5cblx0Ly8gLS0tIEF0dGFjaGVkIGVkaXRvciBtYXhpbWl6ZWQgc3RhdGUgLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cblxuXHRpbnRlcmZhY2UgSVdvcmtiZW5jaFRlc3RIYXJuZXNzIHtcblx0XHRwYXJ0VmlzaWJpbGl0eTogeyBzaWRlYmFyOiBib29sZWFuOyBhdXhpbGlhcnlCYXI6IGJvb2xlYW47IGVkaXRvcjogYm9vbGVhbjsgcGFuZWw6IGJvb2xlYW47IHNlc3Npb25zOiBib29sZWFuIH07XG5cdFx0bGF5b3V0UG9saWN5OiB7IHZpZXdwb3J0Q2xhc3M6IHsgZ2V0KCk6ICdwaG9uZScgfCAndGFibGV0JyB8ICdkZXNrdG9wJyB9IH07XG5cdFx0c3RvcmFnZVNlcnZpY2U6IHsgc3RvcmUoLi4uYXJnczogdW5rbm93bltdKTogdm9pZCB9O1xuXHRcdF9lZGl0b3JQYXJ0QXV0b1Zpc2liaWxpdHlTdXBwcmVzc2lvbkNvdW50OiBudW1iZXI7XG5cdFx0X2VkaXRvck1heGltaXplZDogYm9vbGVhbjtcblx0XHRfcmVzdG9yZUF0dGFjaGVkRWRpdG9yTWF4aW1pemVkT25TaG93OiBib29sZWFuO1xuXHRcdHNldEVkaXRvck1heGltaXplZChtYXhpbWl6ZWQ6IGJvb2xlYW4pOiB2b2lkO1xuXHRcdF9zYXZlUGFydFZpc2liaWxpdHkoKTogdm9pZDtcblx0fVxuXG5cdGZ1bmN0aW9uIGNyZWF0ZVdvcmtiZW5jaEhhcm5lc3MoKTogSVdvcmtiZW5jaFRlc3RIYXJuZXNzIHtcblx0XHRyZXR1cm4ge1xuXHRcdFx0cGFydFZpc2liaWxpdHk6IHsgc2lkZWJhcjogdHJ1ZSwgYXV4aWxpYXJ5QmFyOiB0cnVlLCBlZGl0b3I6IHRydWUsIHBhbmVsOiBmYWxzZSwgc2Vzc2lvbnM6IHRydWUgfSxcblx0XHRcdGxheW91dFBvbGljeTogeyB2aWV3cG9ydENsYXNzOiB7IGdldDogKCkgPT4gJ2Rlc2t0b3AnIH0gfSxcblx0XHRcdHN0b3JhZ2VTZXJ2aWNlOiB7IHN0b3JlOiAoKSA9PiB7IH0gfSxcblx0XHRcdF9lZGl0b3JQYXJ0QXV0b1Zpc2liaWxpdHlTdXBwcmVzc2lvbkNvdW50OiAwLFxuXHRcdFx0X2VkaXRvck1heGltaXplZDogZmFsc2UsXG5cdFx0XHRfcmVzdG9yZUF0dGFjaGVkRWRpdG9yTWF4aW1pemVkT25TaG93OiBmYWxzZSxcblx0XHRcdHNldEVkaXRvck1heGltaXplZDogKCkgPT4geyB9LFxuXHRcdFx0X3NhdmVQYXJ0VmlzaWJpbGl0eTogKCkgPT4geyB9LFxuXHRcdH07XG5cdH1cblxuXHR0ZXN0KCdyZXN0b3JlcyBhdHRhY2hlZCBlZGl0b3IgbWF4aW1pemVkIHN0YXRlIHdoZW4gdGhlIGF1eGlsaWFyeSBiYXIgc3RheXMgdmlzaWJsZScsICgpID0+IHtcblx0XHRjb25zdCBtYXhpbWl6ZWRTdGF0ZXM6IGJvb2xlYW5bXSA9IFtdO1xuXHRcdGNvbnN0IHdvcmtiZW5jaCA9IGNyZWF0ZVdvcmtiZW5jaEhhcm5lc3MoKTtcblx0XHR3b3JrYmVuY2guX2VkaXRvck1heGltaXplZCA9IHRydWU7XG5cdFx0d29ya2JlbmNoLnNldEVkaXRvck1heGltaXplZCA9IG1heGltaXplZCA9PiBtYXhpbWl6ZWRTdGF0ZXMucHVzaChtYXhpbWl6ZWQpO1xuXG5cdFx0cmVtZW1iZXJBdHRhY2hlZEVkaXRvck1heGltaXplZFN0YXRlLmNhbGwod29ya2JlbmNoKTtcblxuXHRcdHdvcmtiZW5jaC5fZWRpdG9yTWF4aW1pemVkID0gZmFsc2U7XG5cdFx0cmVzdG9yZUF0dGFjaGVkRWRpdG9yTWF4aW1pemVkU3RhdGUuY2FsbCh3b3JrYmVuY2gpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChtYXhpbWl6ZWRTdGF0ZXMsIFt0cnVlXSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHdvcmtiZW5jaC5fcmVzdG9yZUF0dGFjaGVkRWRpdG9yTWF4aW1pemVkT25TaG93LCBmYWxzZSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2RvZXMgbm90IHJlc3RvcmUgYXR0YWNoZWQgZWRpdG9yIG1heGltaXplZCBzdGF0ZSBvbmNlIHRoZSBhdXhpbGlhcnkgYmFyIGlzIGhpZGRlbicsICgpID0+IHtcblx0XHRjb25zdCBtYXhpbWl6ZWRTdGF0ZXM6IGJvb2xlYW5bXSA9IFtdO1xuXHRcdGNvbnN0IHdvcmtiZW5jaCA9IGNyZWF0ZVdvcmtiZW5jaEhhcm5lc3MoKTtcblx0XHR3b3JrYmVuY2guX2VkaXRvck1heGltaXplZCA9IHRydWU7XG5cdFx0d29ya2JlbmNoLnNldEVkaXRvck1heGltaXplZCA9IG1heGltaXplZCA9PiBtYXhpbWl6ZWRTdGF0ZXMucHVzaChtYXhpbWl6ZWQpO1xuXG5cdFx0cmVtZW1iZXJBdHRhY2hlZEVkaXRvck1heGltaXplZFN0YXRlLmNhbGwod29ya2JlbmNoKTtcblxuXHRcdHdvcmtiZW5jaC5fZWRpdG9yTWF4aW1pemVkID0gZmFsc2U7XG5cdFx0d29ya2JlbmNoLnBhcnRWaXNpYmlsaXR5LmF1eGlsaWFyeUJhciA9IGZhbHNlO1xuXHRcdHJlc3RvcmVBdHRhY2hlZEVkaXRvck1heGltaXplZFN0YXRlLmNhbGwod29ya2JlbmNoKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwobWF4aW1pemVkU3RhdGVzLCBbXSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHdvcmtiZW5jaC5fcmVzdG9yZUF0dGFjaGVkRWRpdG9yTWF4aW1pemVkT25TaG93LCBmYWxzZSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2RvZXMgbm90IHJlc3RvcmUgYWZ0ZXIgdGhlIGF1eGlsaWFyeSBiYXIgaXMgaGlkZGVuIGFuZCBzaG93biBhZ2FpbiBiZWZvcmUgcmVvcGVuJywgKCkgPT4ge1xuXHRcdGNvbnN0IG1heGltaXplZFN0YXRlczogYm9vbGVhbltdID0gW107XG5cdFx0Y29uc3QgaG9zdCA9IGNyZWF0ZUhvc3QoeyBzaW5nbGU6IHRydWUsIHBhcnRWaXNpYmlsaXR5OiB7IGVkaXRvcjogdHJ1ZSwgYXV4aWxpYXJ5QmFyOiB0cnVlIH0gfSk7XG5cdFx0aG9zdC5fZWRpdG9yTWF4aW1pemVkID0gdHJ1ZTtcblx0XHQoaG9zdCBhcyB1bmtub3duIGFzIElXb3JrYmVuY2hUZXN0SGFybmVzcykuc2V0RWRpdG9yTWF4aW1pemVkID0gbWF4aW1pemVkID0+IG1heGltaXplZFN0YXRlcy5wdXNoKG1heGltaXplZCk7XG5cblx0XHRyZW1lbWJlckF0dGFjaGVkRWRpdG9yTWF4aW1pemVkU3RhdGUuY2FsbChob3N0IGFzIHVua25vd24gYXMgSVdvcmtiZW5jaFRlc3RIYXJuZXNzKTtcblx0XHRzZXRBdXhpbGlhcnlCYXJIaWRkZW4uY2FsbChob3N0LCB0cnVlKTtcblx0XHRzZXRBdXhpbGlhcnlCYXJIaWRkZW4uY2FsbChob3N0LCBmYWxzZSk7XG5cblx0XHRob3N0Ll9lZGl0b3JNYXhpbWl6ZWQgPSBmYWxzZTtcblx0XHRyZXN0b3JlQXR0YWNoZWRFZGl0b3JNYXhpbWl6ZWRTdGF0ZS5jYWxsKGhvc3QgYXMgdW5rbm93biBhcyBJV29ya2JlbmNoVGVzdEhhcm5lc3MpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChtYXhpbWl6ZWRTdGF0ZXMsIFtdKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoaG9zdC5fcmVzdG9yZUF0dGFjaGVkRWRpdG9yTWF4aW1pemVkT25TaG93LCBmYWxzZSk7XG5cdH0pO1xuXG5cdC8vIC0tLSBEb2NrZWQgYXV4aWxpYXJ5IGJhciB2aXNpYmlsaXR5IC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG5cblx0dGVzdCgnZG9ja2VkIGF1eGlsaWFyeSBiYXIgaGlkZSByZXZlYWxzIGhpZGRlbiBlZGl0b3IgY29udGVudCcsICgpID0+IHtcblx0XHRjb25zdCBlZGl0b3JIaWRkZW5DYWxsczogYm9vbGVhbltdID0gW107XG5cdFx0Y29uc3QgaG9zdCA9IGNyZWF0ZUhvc3QoeyBzaW5nbGU6IHRydWUsIHBhcnRWaXNpYmlsaXR5OiB7IGVkaXRvcjogZmFsc2UsIGF1eGlsaWFyeUJhcjogdHJ1ZSB9IH0pO1xuXHRcdGhvc3Quc2V0RWRpdG9ySGlkZGVuID0gaGlkZGVuID0+IHtcblx0XHRcdGVkaXRvckhpZGRlbkNhbGxzLnB1c2goaGlkZGVuKTtcblx0XHRcdGhvc3QucGFydFZpc2liaWxpdHkuZWRpdG9yID0gIWhpZGRlbjtcblx0XHR9O1xuXG5cdFx0c2V0QXV4aWxpYXJ5QmFySGlkZGVuLmNhbGwoaG9zdCwgdHJ1ZSk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdGVkaXRvckhpZGRlbkNhbGxzLFxuXHRcdFx0ZWRpdG9yVmlzaWJsZTogaG9zdC5wYXJ0VmlzaWJpbGl0eS5lZGl0b3IsXG5cdFx0XHRhdXhpbGlhcnlCYXJWaXNpYmxlOiBob3N0LnBhcnRWaXNpYmlsaXR5LmF1eGlsaWFyeUJhcixcblx0XHRcdGdyaWRWaXNpYmxlOiBob3N0LnZpc2liaWxpdHlDaGFuZ2VzLFxuXHRcdH0sIHtcblx0XHRcdGVkaXRvckhpZGRlbkNhbGxzOiBbZmFsc2VdLFxuXHRcdFx0ZWRpdG9yVmlzaWJsZTogdHJ1ZSxcblx0XHRcdGF1eGlsaWFyeUJhclZpc2libGU6IGZhbHNlLFxuXHRcdFx0Z3JpZFZpc2libGU6IFt0cnVlXSxcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnZG9ja2VkIGF1eGlsaWFyeSBiYXIgaGlkZSBkb2VzIG5vdCByZXZlYWwgZWRpdG9yIHdoaWxlIHNpZGUgcGFuZSB0b2dnbGUgaXMgc3VwcHJlc3NlZCcsICgpID0+IHtcblx0XHRjb25zdCBlZGl0b3JIaWRkZW5DYWxsczogYm9vbGVhbltdID0gW107XG5cdFx0Y29uc3QgaG9zdCA9IGNyZWF0ZUhvc3QoeyBzaW5nbGU6IHRydWUsIHN1cHByZXNzaW9uQ291bnQ6IDEsIHBhcnRWaXNpYmlsaXR5OiB7IGVkaXRvcjogZmFsc2UsIGF1eGlsaWFyeUJhcjogdHJ1ZSB9IH0pO1xuXHRcdGhvc3Quc2V0RWRpdG9ySGlkZGVuID0gaGlkZGVuID0+IHtcblx0XHRcdGVkaXRvckhpZGRlbkNhbGxzLnB1c2goaGlkZGVuKTtcblx0XHRcdGhvc3QucGFydFZpc2liaWxpdHkuZWRpdG9yID0gIWhpZGRlbjtcblx0XHR9O1xuXG5cdFx0c2V0QXV4aWxpYXJ5QmFySGlkZGVuLmNhbGwoaG9zdCwgdHJ1ZSk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdGVkaXRvckhpZGRlbkNhbGxzLFxuXHRcdFx0ZWRpdG9yVmlzaWJsZTogaG9zdC5wYXJ0VmlzaWJpbGl0eS5lZGl0b3IsXG5cdFx0XHRhdXhpbGlhcnlCYXJWaXNpYmxlOiBob3N0LnBhcnRWaXNpYmlsaXR5LmF1eGlsaWFyeUJhcixcblx0XHRcdGdyaWRWaXNpYmxlOiBob3N0LnZpc2liaWxpdHlDaGFuZ2VzLFxuXHRcdH0sIHtcblx0XHRcdGVkaXRvckhpZGRlbkNhbGxzOiBbXSxcblx0XHRcdGVkaXRvclZpc2libGU6IGZhbHNlLFxuXHRcdFx0YXV4aWxpYXJ5QmFyVmlzaWJsZTogZmFsc2UsXG5cdFx0XHRncmlkVmlzaWJsZTogW2ZhbHNlXSxcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnZG9ja2VkIGF1eGlsaWFyeSBiYXIgc2hvdyBkb2VzIG5vdCBmb3JjZS1vcGVuIGFuIGVtcHR5IChnYXRlZC1vZmYpIGNvbnRhaW5lcicsICgpID0+IHtcblx0XHRjb25zdCBvcGVuZWRDb250YWluZXJzOiBzdHJpbmdbXSA9IFtdO1xuXHRcdC8vIFRoZSByZXNvbHZlZCBkZWZhdWx0IGNvbnRhaW5lciBpcyBgaGlkZUlmRW1wdHlgIHdpdGggbm8gYWN0aXZlIHZpZXdzXG5cdFx0Ly8gKGUuZy4gQ2hhbmdlcy9GaWxlcyBnYXRlZCBvZmYgZm9yIGEgd29ya3NwYWNlLWxlc3MgcXVpY2sgY2hhdCkuXG5cdFx0Y29uc3QgaG9zdCA9IGNyZWF0ZUhvc3Qoe1xuXHRcdFx0c2luZ2xlOiB0cnVlLFxuXHRcdFx0cGFydFZpc2liaWxpdHk6IHsgZWRpdG9yOiB0cnVlLCBhdXhpbGlhcnlCYXI6IGZhbHNlIH0sXG5cdFx0XHR2aWV3RGVzY3JpcHRvclNlcnZpY2U6IHtcblx0XHRcdFx0Z2V0RGVmYXVsdFZpZXdDb250YWluZXI6ICgpID0+ICh7IGlkOiAnZW1wdHkuY29udGFpbmVyJyB9KSxcblx0XHRcdFx0Z2V0Vmlld0NvbnRhaW5lckJ5SWQ6ICgpID0+ICh7IGhpZGVJZkVtcHR5OiB0cnVlIH0pLFxuXHRcdFx0XHRnZXRWaWV3Q29udGFpbmVyTW9kZWw6ICgpID0+ICh7IGFjdGl2ZVZpZXdEZXNjcmlwdG9yczogW10gfSksXG5cdFx0XHR9LFxuXHRcdH0pO1xuXHRcdChob3N0IGFzIHVua25vd24gYXMgeyBwYW5lQ29tcG9zaXRlU2VydmljZTogeyBvcGVuUGFuZUNvbXBvc2l0ZShpZDogc3RyaW5nKTogdm9pZCB9IH0pLnBhbmVDb21wb3NpdGVTZXJ2aWNlLm9wZW5QYW5lQ29tcG9zaXRlID0gKGlkOiBzdHJpbmcpID0+IHsgb3BlbmVkQ29udGFpbmVycy5wdXNoKGlkKTsgfTtcblxuXHRcdHNldEF1eGlsaWFyeUJhckhpZGRlbi5jYWxsKGhvc3QsIGZhbHNlKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwob3BlbmVkQ29udGFpbmVycywgW10sICdtdXN0IG5vdCBmb3JjZS1vcGVuIGFuIGVtcHR5IGNvbnRhaW5lciBpbiBkb2NrZWQgbW9kZScpO1xuXHR9KTtcblxuXHR0ZXN0KCdkb2NrZWQgYXV4aWxpYXJ5IGJhciBzaG93IG9wZW5zIGEgY29udGFpbmVyIHRoYXQgaGFzIGFjdGl2ZSB2aWV3cycsICgpID0+IHtcblx0XHRjb25zdCBvcGVuZWRDb250YWluZXJzOiBzdHJpbmdbXSA9IFtdO1xuXHRcdC8vIFRoZSByZXNvbHZlZCBkZWZhdWx0IGNvbnRhaW5lciBoYXMgYW4gYWN0aXZlIHZpZXcgZGVzY3JpcHRvciwgc28gaXQgaGFzXG5cdFx0Ly8gY29udGVudCB0byByZW5kZXIgYW5kIG11c3QgYmUgb3BlbmVkIG5vcm1hbGx5LlxuXHRcdGNvbnN0IGhvc3QgPSBjcmVhdGVIb3N0KHtcblx0XHRcdHNpbmdsZTogdHJ1ZSxcblx0XHRcdHBhcnRWaXNpYmlsaXR5OiB7IGVkaXRvcjogdHJ1ZSwgYXV4aWxpYXJ5QmFyOiBmYWxzZSB9LFxuXHRcdFx0dmlld0Rlc2NyaXB0b3JTZXJ2aWNlOiB7XG5cdFx0XHRcdGdldERlZmF1bHRWaWV3Q29udGFpbmVyOiAoKSA9PiAoeyBpZDogJ2FjdGl2ZS5jb250YWluZXInIH0pLFxuXHRcdFx0XHRnZXRWaWV3Q29udGFpbmVyQnlJZDogKCkgPT4gKHsgaGlkZUlmRW1wdHk6IHRydWUgfSksXG5cdFx0XHRcdGdldFZpZXdDb250YWluZXJNb2RlbDogKCkgPT4gKHsgYWN0aXZlVmlld0Rlc2NyaXB0b3JzOiBbe31dIH0pLFxuXHRcdFx0fSxcblx0XHR9KTtcblx0XHQoaG9zdCBhcyB1bmtub3duIGFzIHsgcGFuZUNvbXBvc2l0ZVNlcnZpY2U6IHsgb3BlblBhbmVDb21wb3NpdGUoaWQ6IHN0cmluZyk6IHZvaWQgfSB9KS5wYW5lQ29tcG9zaXRlU2VydmljZS5vcGVuUGFuZUNvbXBvc2l0ZSA9IChpZDogc3RyaW5nKSA9PiB7IG9wZW5lZENvbnRhaW5lcnMucHVzaChpZCk7IH07XG5cblx0XHRzZXRBdXhpbGlhcnlCYXJIaWRkZW4uY2FsbChob3N0LCBmYWxzZSk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKG9wZW5lZENvbnRhaW5lcnMsIFsnYWN0aXZlLmNvbnRhaW5lciddLCAnbXVzdCBvcGVuIGEgY29udGFpbmVyIHRoYXQgaGFzIGFjdGl2ZSB2aWV3cycpO1xuXHR9KTtcblxuXHQvLyAtLS0gRWRpdG9yIG1heGltaXplL3VuLW1heGltaXplIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuXG5cdGludGVyZmFjZSBJTWF4aW1pemVUZXN0SGFybmVzcyB7XG5cdFx0cGFydFZpc2liaWxpdHk6IHsgc2lkZWJhcjogYm9vbGVhbjsgYXV4aWxpYXJ5QmFyOiBib29sZWFuOyBlZGl0b3I6IGJvb2xlYW47IHBhbmVsOiBib29sZWFuOyBzZXNzaW9uczogYm9vbGVhbiB9O1xuXHRcdHJlYWRvbmx5IGVkaXRvclBhcnRWaWV3OiBvYmplY3Q7XG5cdFx0cmVhZG9ubHkgd29ya2JlbmNoR3JpZDoge1xuXHRcdFx0Z2V0Vmlld1NpemUodmlldzogb2JqZWN0KTogSVZpZXdTaXplO1xuXHRcdFx0cmVzaXplVmlldyh2aWV3OiBvYmplY3QsIHNpemU6IElWaWV3U2l6ZSk6IHZvaWQ7XG5cdFx0fTtcblx0XHRfZWRpdG9yTWF4aW1pemVkOiBib29sZWFuO1xuXHRcdF9lZGl0b3JMYXN0Tm9uTWF4aW1pemVkVmlzaWJpbGl0eT86IG9iamVjdDtcblx0XHRfZWRpdG9yTGFzdE5vbk1heGltaXplZFNpemU/OiBJVmlld1NpemU7XG5cdFx0cmVhZG9ubHkgX29uRGlkQ2hhbmdlRWRpdG9yTWF4aW1pemVkOiB7IGZpcmUoKTogdm9pZCB9O1xuXHRcdF9sYXlvdXRTaWRlUGFuZSgpOiB2b2lkO1xuXHRcdHNldEVkaXRvckhpZGRlbihoaWRkZW46IGJvb2xlYW4pOiB2b2lkO1xuXHRcdHNldFNpZGVCYXJIaWRkZW4oaGlkZGVuOiBib29sZWFuKTogdm9pZDtcblx0XHRzZXRTZXNzaW9uc0hpZGRlbihoaWRkZW46IGJvb2xlYW4pOiB2b2lkO1xuXHRcdHNldEF1eGlsaWFyeUJhckhpZGRlbihoaWRkZW46IGJvb2xlYW4pOiB2b2lkO1xuXHR9XG5cblx0dGVzdCgncmVzdG9yZXMgZWRpdG9yIHNpemUgYW5kIGF1eGlsaWFyeSBiYXIgdmlzaWJpbGl0eSB3aGVuIHVuLW1heGltaXppbmcnLCAoKSA9PiB7XG5cdFx0Y29uc3QgZWRpdG9yUGFydFZpZXcgPSB7fTtcblx0XHRjb25zdCByZXNpemVzOiBJVmlld1NpemVbXSA9IFtdO1xuXHRcdGNvbnN0IGF1eGlsaWFyeUJhckhpZGRlbkNhbGxzOiBib29sZWFuW10gPSBbXTtcblx0XHRsZXQgZWRpdG9yU2l6ZSA9IHsgd2lkdGg6IDcwMCwgaGVpZ2h0OiA4MDAgfTtcblx0XHRjb25zdCBoYXJuZXNzOiBJTWF4aW1pemVUZXN0SGFybmVzcyA9IHtcblx0XHRcdHBhcnRWaXNpYmlsaXR5OiB7IHNpZGViYXI6IHRydWUsIGF1eGlsaWFyeUJhcjogZmFsc2UsIGVkaXRvcjogdHJ1ZSwgcGFuZWw6IGZhbHNlLCBzZXNzaW9uczogdHJ1ZSB9LFxuXHRcdFx0ZWRpdG9yUGFydFZpZXcsXG5cdFx0XHR3b3JrYmVuY2hHcmlkOiB7XG5cdFx0XHRcdGdldFZpZXdTaXplOiAoKSA9PiBlZGl0b3JTaXplLFxuXHRcdFx0XHRyZXNpemVWaWV3OiAoX3ZpZXcsIHNpemUpID0+IHsgcmVzaXplcy5wdXNoKHNpemUpOyBlZGl0b3JTaXplID0gc2l6ZTsgfSxcblx0XHRcdH0sXG5cdFx0XHRfZWRpdG9yTWF4aW1pemVkOiBmYWxzZSxcblx0XHRcdF9vbkRpZENoYW5nZUVkaXRvck1heGltaXplZDogeyBmaXJlOiAoKSA9PiB7IH0gfSxcblx0XHRcdF9sYXlvdXRTaWRlUGFuZTogKCkgPT4geyB9LFxuXHRcdFx0c2V0RWRpdG9ySGlkZGVuOiAoKSA9PiB7IH0sXG5cdFx0XHRzZXRTaWRlQmFySGlkZGVuOiBoaWRkZW4gPT4geyBoYXJuZXNzLnBhcnRWaXNpYmlsaXR5LnNpZGViYXIgPSAhaGlkZGVuOyB9LFxuXHRcdFx0c2V0U2Vzc2lvbnNIaWRkZW46IGhpZGRlbiA9PiB7IGhhcm5lc3MucGFydFZpc2liaWxpdHkuc2Vzc2lvbnMgPSAhaGlkZGVuOyB9LFxuXHRcdFx0c2V0QXV4aWxpYXJ5QmFySGlkZGVuOiBoaWRkZW4gPT4geyBhdXhpbGlhcnlCYXJIaWRkZW5DYWxscy5wdXNoKGhpZGRlbik7IGhhcm5lc3MucGFydFZpc2liaWxpdHkuYXV4aWxpYXJ5QmFyID0gIWhpZGRlbjsgfSxcblx0XHR9O1xuXG5cdFx0c2V0RWRpdG9yTWF4aW1pemVkLmNhbGwoaGFybmVzcywgdHJ1ZSk7XG5cblx0XHQvLyBXaGlsZSBtYXhpbWl6ZWQgdGhlIGxheW91dCBjb250cm9sbGVyIGZvcmNlcyB0aGUgQ2hhbmdlcyB2aWV3IChhdXhpbGlhcnlcblx0XHQvLyBiYXIpIHZpc2libGUsIHdoaWNoIHNocmlua3MgdGhlIGVkaXRvci5cblx0XHRoYXJuZXNzLnBhcnRWaXNpYmlsaXR5LmF1eGlsaWFyeUJhciA9IHRydWU7XG5cdFx0ZWRpdG9yU2l6ZSA9IHsgd2lkdGg6IDUwMCwgaGVpZ2h0OiA4MDAgfTtcblxuXHRcdHNldEVkaXRvck1heGltaXplZC5jYWxsKGhhcm5lc3MsIGZhbHNlKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0YXV4aWxpYXJ5QmFySGlkZGVuQ2FsbHMsXG5cdFx0XHRyZXNpemVzLFxuXHRcdFx0YXV4aWxpYXJ5QmFyVmlzaWJsZTogaGFybmVzcy5wYXJ0VmlzaWJpbGl0eS5hdXhpbGlhcnlCYXIsXG5cdFx0XHRzaWRlYmFyVmlzaWJsZTogaGFybmVzcy5wYXJ0VmlzaWJpbGl0eS5zaWRlYmFyLFxuXHRcdFx0c2Vzc2lvbnNWaXNpYmxlOiBoYXJuZXNzLnBhcnRWaXNpYmlsaXR5LnNlc3Npb25zLFxuXHRcdH0sIHtcblx0XHRcdGF1eGlsaWFyeUJhckhpZGRlbkNhbGxzOiBbdHJ1ZV0sXG5cdFx0XHRyZXNpemVzOiBbeyB3aWR0aDogNzAwLCBoZWlnaHQ6IDgwMCB9XSxcblx0XHRcdGF1eGlsaWFyeUJhclZpc2libGU6IGZhbHNlLFxuXHRcdFx0c2lkZWJhclZpc2libGU6IHRydWUsXG5cdFx0XHRzZXNzaW9uc1Zpc2libGU6IHRydWUsXG5cdFx0fSk7XG5cdH0pO1xuXG5cdC8vIC0tLSBQYW5lbCB2aXNpYmlsaXR5IC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuXG5cdHRlc3QoJ3NpbmdsZS1wYW5lIHJlc3RvcmVzIHRoZSBib3R0b20gcGFuZWwgaGVpZ2h0IGFmdGVyIG5hdmlnYXRpbmcgdGhyb3VnaCBRdWljayBDaGF0JywgKCkgPT4ge1xuXHRcdGNvbnN0IHNpbmdsZVBhbmUgPSBjcmVhdGVIb3N0KHsgc2luZ2xlOiB0cnVlLCBwYW5lbEhlaWdodDogNTIwLCBwYW5lbEhlaWdodE9uRWRpdG9yU2hvdzogNzcsIHBhcnRWaXNpYmlsaXR5OiB7IHBhbmVsOiB0cnVlLCBlZGl0b3I6IHRydWUsIGF1eGlsaWFyeUJhcjogdHJ1ZSB9IH0pO1xuXG5cdFx0c2luZ2xlUGFuZS5fZWRpdG9yUGFydEF1dG9WaXNpYmlsaXR5U3VwcHJlc3Npb25Db3VudCA9IDE7XG5cdFx0c2V0UGFuZWxIaWRkZW4uY2FsbChzaW5nbGVQYW5lLCB0cnVlKTtcblx0XHRzZXRFZGl0b3JIaWRkZW4uY2FsbChzaW5nbGVQYW5lLCB0cnVlKTtcblx0XHRzaW5nbGVQYW5lLnNldEF1eGlsaWFyeUJhckhpZGRlbih0cnVlKTtcblx0XHRzaW5nbGVQYW5lLl9lZGl0b3JQYXJ0QXV0b1Zpc2liaWxpdHlTdXBwcmVzc2lvbkNvdW50ID0gMDtcblx0XHRzZXRQYW5lbEhpZGRlbi5jYWxsKHNpbmdsZVBhbmUsIGZhbHNlKTtcblx0XHRzaW5nbGVQYW5lLnNldEF1eGlsaWFyeUJhckhpZGRlbihmYWxzZSk7XG5cdFx0c2V0RWRpdG9ySGlkZGVuLmNhbGwoc2luZ2xlUGFuZSwgZmFsc2UpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNpbmdsZVBhbmUud29ya2JlbmNoR3JpZC5nZXRWaWV3U2l6ZShzaW5nbGVQYW5lLnBhbmVsUGFydFZpZXcpLmhlaWdodCwgNTIwKTtcblx0fSk7XG5cblx0Ly8gLS0tIEN1c3RvbSB2aWV3IGdyaWQgLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG5cblx0dGVzdCgnc2hvd2luZyBhIGN1c3RvbSB2aWV3IGhpZGVzIHRoZSBzZXNzaW9ucyBncmlkLCBlZGl0b3IsIHNpZGUgcGFuZWwgYW5kIHBhbmVsJywgKCkgPT4ge1xuXHRcdGNvbnN0IGhvc3QgPSBjcmVhdGVIb3N0KHsgcGFydFZpc2liaWxpdHk6IHsgZWRpdG9yOiB0cnVlLCBhdXhpbGlhcnlCYXI6IHRydWUsIHBhbmVsOiB0cnVlLCBzZXNzaW9uczogdHJ1ZSB9IH0pO1xuXHRcdGNvbnN0IGRlc2NyaXB0b3IgPSB7fTtcblxuXHRcdGFwcGx5Q3VzdG9tVmlld0dyaWRWaXNpYmlsaXR5LmNhbGwoaG9zdCwgZGVzY3JpcHRvcik7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdHJlbmRlcmVkQ3VzdG9tVmlld3M6IGhvc3QucmVuZGVyZWRDdXN0b21WaWV3cyxcblx0XHRcdGN1c3RvbVZpZXdHcmlkVmlzaWJsZTogaXNWaXNpYmxlLmNhbGwoaG9zdCwgUGFydHMuQ1VTVE9NX1ZJRVdfR1JJRF9QQVJUKSxcblx0XHRcdHNlc3Npb25zOiBpc1Zpc2libGUuY2FsbChob3N0LCBQYXJ0cy5TRVNTSU9OU19QQVJUKSxcblx0XHRcdGVkaXRvcjogaXNWaXNpYmxlLmNhbGwoaG9zdCwgUGFydHMuRURJVE9SX1BBUlQpLFxuXHRcdFx0YXV4aWxpYXJ5QmFyOiBpc1Zpc2libGUuY2FsbChob3N0LCBQYXJ0cy5BVVhJTElBUllCQVJfUEFSVCksXG5cdFx0XHRwYW5lbDogaXNWaXNpYmxlLmNhbGwoaG9zdCwgUGFydHMuUEFORUxfUEFSVCksXG5cdFx0XHRzaWRlQmFyOiBpc1Zpc2libGUuY2FsbChob3N0LCBQYXJ0cy5TSURFQkFSX1BBUlQpLFxuXHRcdFx0Z3JpZE5vZGVzOiB7XG5cdFx0XHRcdGN1c3RvbVZpZXdHcmlkOiBob3N0LmdyaWRWaXNpYmlsaXR5LmdldChob3N0LmN1c3RvbVZpZXdHcmlkUGFydFZpZXcpLFxuXHRcdFx0XHRzZXNzaW9uczogaG9zdC5ncmlkVmlzaWJpbGl0eS5nZXQoaG9zdC5zZXNzaW9uc1BhcnRWaWV3KSxcblx0XHRcdFx0ZWRpdG9yOiBob3N0LmdyaWRWaXNpYmlsaXR5LmdldChob3N0LmVkaXRvclBhcnRWaWV3KSxcblx0XHRcdFx0cGFuZWw6IGhvc3QuZ3JpZFZpc2liaWxpdHkuZ2V0KGhvc3QucGFuZWxQYXJ0VmlldyksXG5cdFx0XHR9LFxuXHRcdFx0ZXZlbnRzOiBob3N0LmV2ZW50cyxcblx0XHRcdGZvY3VzZWRQYXJ0czogaG9zdC5mb2N1c2VkUGFydHMsXG5cdFx0fSwge1xuXHRcdFx0cmVuZGVyZWRDdXN0b21WaWV3czogW2Rlc2NyaXB0b3JdLFxuXHRcdFx0Y3VzdG9tVmlld0dyaWRWaXNpYmxlOiB0cnVlLFxuXHRcdFx0c2Vzc2lvbnM6IGZhbHNlLFxuXHRcdFx0ZWRpdG9yOiBmYWxzZSxcblx0XHRcdGF1eGlsaWFyeUJhcjogZmFsc2UsXG5cdFx0XHRwYW5lbDogZmFsc2UsXG5cdFx0XHRzaWRlQmFyOiB0cnVlLFxuXHRcdFx0Z3JpZE5vZGVzOiB7XG5cdFx0XHRcdGN1c3RvbVZpZXdHcmlkOiB0cnVlLFxuXHRcdFx0XHRzZXNzaW9uczogZmFsc2UsXG5cdFx0XHRcdGVkaXRvcjogZmFsc2UsXG5cdFx0XHRcdHBhbmVsOiBmYWxzZSxcblx0XHRcdH0sXG5cdFx0XHRldmVudHM6IFtcblx0XHRcdFx0eyBwYXJ0SWQ6IFBhcnRzLkNVU1RPTV9WSUVXX0dSSURfUEFSVCwgdmlzaWJsZTogdHJ1ZSB9LFxuXHRcdFx0XHR7IHBhcnRJZDogUGFydHMuU0VTU0lPTlNfUEFSVCwgdmlzaWJsZTogZmFsc2UgfSxcblx0XHRcdFx0eyBwYXJ0SWQ6IFBhcnRzLkVESVRPUl9QQVJULCB2aXNpYmxlOiBmYWxzZSB9LFxuXHRcdFx0XHR7IHBhcnRJZDogUGFydHMuQVVYSUxJQVJZQkFSX1BBUlQsIHZpc2libGU6IGZhbHNlIH0sXG5cdFx0XHRcdHsgcGFydElkOiBQYXJ0cy5QQU5FTF9QQVJULCB2aXNpYmxlOiBmYWxzZSB9LFxuXHRcdFx0XSxcblx0XHRcdGZvY3VzZWRQYXJ0czogW1BhcnRzLkNVU1RPTV9WSUVXX0dSSURfUEFSVF0sXG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2hpZGluZyB0aGUgY3VzdG9tIHZpZXcgcmVzdG9yZXMgdGhlIGRlc2lyZWQgcGFydCB2aXNpYmlsaXR5LCBpbmNsdWRpbmcgY2hhbmdlcyBtYWRlIHdoaWxlIGl0IHdhcyBzaG93bicsICgpID0+IHtcblx0XHRjb25zdCBob3N0ID0gY3JlYXRlSG9zdCh7IHBhcnRWaXNpYmlsaXR5OiB7IGVkaXRvcjogdHJ1ZSwgYXV4aWxpYXJ5QmFyOiB0cnVlLCBwYW5lbDogZmFsc2UsIHNlc3Npb25zOiB0cnVlIH0gfSk7XG5cblx0XHRhcHBseUN1c3RvbVZpZXdHcmlkVmlzaWJpbGl0eS5jYWxsKGhvc3QsIHt9KTtcblxuXHRcdC8vIFRoZSBsYXlvdXQgY29udHJvbGxlciByZWFjdHMgdG8gYSBzZXNzaW9uIHN3aXRjaCB3aGlsZSB0aGUgY3VzdG9tIHZpZXcgaXNcblx0XHQvLyB1cDogdGhlIGRlc2lyZWQgc3RhdGUgY2hhbmdlcyBidXQgbm90aGluZyBpcyByZW5kZXJlZC5cblx0XHRzZXRFZGl0b3JIaWRkZW4uY2FsbChob3N0LCB0cnVlKTtcblx0XHRjb25zdCB3aGlsZVNob3duID0ge1xuXHRcdFx0ZWRpdG9yOiBpc1Zpc2libGUuY2FsbChob3N0LCBQYXJ0cy5FRElUT1JfUEFSVCksXG5cdFx0XHRlZGl0b3JOb2RlOiBob3N0LmdyaWRWaXNpYmlsaXR5LmdldChob3N0LmVkaXRvclBhcnRWaWV3KSxcblx0XHR9O1xuXG5cdFx0YXBwbHlDdXN0b21WaWV3R3JpZFZpc2liaWxpdHkuY2FsbChob3N0LCB1bmRlZmluZWQpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHR3aGlsZVNob3duLFxuXHRcdFx0Y3VzdG9tVmlld0dyaWRWaXNpYmxlOiBpc1Zpc2libGUuY2FsbChob3N0LCBQYXJ0cy5DVVNUT01fVklFV19HUklEX1BBUlQpLFxuXHRcdFx0cmVuZGVyZWRDdXN0b21WaWV3Q291bnQ6IGhvc3QucmVuZGVyZWRDdXN0b21WaWV3cy5sZW5ndGgsXG5cdFx0XHRsYXN0UmVuZGVyZWRDdXN0b21WaWV3OiBob3N0LnJlbmRlcmVkQ3VzdG9tVmlld3NbaG9zdC5yZW5kZXJlZEN1c3RvbVZpZXdzLmxlbmd0aCAtIDFdLFxuXHRcdFx0c2Vzc2lvbnM6IGlzVmlzaWJsZS5jYWxsKGhvc3QsIFBhcnRzLlNFU1NJT05TX1BBUlQpLFxuXHRcdFx0ZWRpdG9yOiBpc1Zpc2libGUuY2FsbChob3N0LCBQYXJ0cy5FRElUT1JfUEFSVCksXG5cdFx0XHRhdXhpbGlhcnlCYXI6IGlzVmlzaWJsZS5jYWxsKGhvc3QsIFBhcnRzLkFVWElMSUFSWUJBUl9QQVJUKSxcblx0XHRcdHBhbmVsOiBpc1Zpc2libGUuY2FsbChob3N0LCBQYXJ0cy5QQU5FTF9QQVJUKSxcblx0XHRcdGZvY3VzZWRTZXNzaW9uczogaG9zdC5mb2N1c2VkU2Vzc2lvbnMsXG5cdFx0fSwge1xuXHRcdFx0d2hpbGVTaG93bjogeyBlZGl0b3I6IGZhbHNlLCBlZGl0b3JOb2RlOiBmYWxzZSB9LFxuXHRcdFx0Y3VzdG9tVmlld0dyaWRWaXNpYmxlOiBmYWxzZSxcblx0XHRcdHJlbmRlcmVkQ3VzdG9tVmlld0NvdW50OiAyLFxuXHRcdFx0bGFzdFJlbmRlcmVkQ3VzdG9tVmlldzogdW5kZWZpbmVkLFxuXHRcdFx0c2Vzc2lvbnM6IHRydWUsXG5cdFx0XHRlZGl0b3I6IGZhbHNlLFxuXHRcdFx0YXV4aWxpYXJ5QmFyOiB0cnVlLFxuXHRcdFx0cGFuZWw6IGZhbHNlLFxuXHRcdFx0Zm9jdXNlZFNlc3Npb25zOiAxLFxuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdzd2FwcGluZyB0byBhbm90aGVyIGN1c3RvbSB2aWV3IHJlLXJlbmRlcnMgaXQgd2l0aG91dCB0b3VjaGluZyB0aGUgbGF5b3V0JywgKCkgPT4ge1xuXHRcdGNvbnN0IGhvc3QgPSBjcmVhdGVIb3N0KHsgcGFydFZpc2liaWxpdHk6IHsgZWRpdG9yOiB0cnVlLCBhdXhpbGlhcnlCYXI6IHRydWUsIHNlc3Npb25zOiB0cnVlIH0gfSk7XG5cdFx0Y29uc3QgZmlyc3QgPSB7fTtcblx0XHRjb25zdCBzZWNvbmQgPSB7fTtcblxuXHRcdGFwcGx5Q3VzdG9tVmlld0dyaWRWaXNpYmlsaXR5LmNhbGwoaG9zdCwgZmlyc3QpO1xuXHRcdGNvbnN0IGV2ZW50c0FmdGVyU2hvdyA9IGhvc3QuZXZlbnRzLmxlbmd0aDtcblx0XHRhcHBseUN1c3RvbVZpZXdHcmlkVmlzaWJpbGl0eS5jYWxsKGhvc3QsIHNlY29uZCk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdHJlbmRlcmVkQ3VzdG9tVmlld3M6IGhvc3QucmVuZGVyZWRDdXN0b21WaWV3cyxcblx0XHRcdGN1c3RvbVZpZXdHcmlkVmlzaWJsZTogaXNWaXNpYmxlLmNhbGwoaG9zdCwgUGFydHMuQ1VTVE9NX1ZJRVdfR1JJRF9QQVJUKSxcblx0XHRcdHNlc3Npb25zOiBpc1Zpc2libGUuY2FsbChob3N0LCBQYXJ0cy5TRVNTSU9OU19QQVJUKSxcblx0XHRcdGV2ZW50c0FmdGVyU3dhcDogaG9zdC5ldmVudHMubGVuZ3RoIC0gZXZlbnRzQWZ0ZXJTaG93LFxuXHRcdH0sIHtcblx0XHRcdHJlbmRlcmVkQ3VzdG9tVmlld3M6IFtmaXJzdCwgc2Vjb25kXSxcblx0XHRcdGN1c3RvbVZpZXdHcmlkVmlzaWJsZTogdHJ1ZSxcblx0XHRcdHNlc3Npb25zOiBmYWxzZSxcblx0XHRcdGV2ZW50c0FmdGVyU3dhcDogMCxcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgndHJhY2tzIHRoZSBjdXN0b20gdmlldyBpbiB0aGUgcGhvbmUgbmF2aWdhdGlvbiBzdGFjayBhbmQgZHJvcHMgaXQgd2hlbiBsZWF2aW5nIHBob25lIGxheW91dCcsICgpID0+IHtcblx0XHRjb25zdCBob3N0ID0gY3JlYXRlSG9zdCgpO1xuXHRcdGhvc3QubGF5b3V0UG9saWN5LnZpZXdwb3J0Q2xhc3MuZ2V0ID0gKCkgPT4gJ3Bob25lJztcblxuXHRcdGFwcGx5Q3VzdG9tVmlld0dyaWRWaXNpYmlsaXR5LmNhbGwoaG9zdCwge30pO1xuXHRcdGNvbnN0IG9uUGhvbmUgPSBbLi4uaG9zdC5tb2JpbGVOYXZMYXllcnNdO1xuXG5cdFx0Ly8gUm90YXRpbmcgYmFjayB0byBhIGRlc2t0b3AtY2xhc3Mgdmlld3BvcnQgbXVzdCBub3QgbGVhdmUgYSBzdGFsZSBlbnRyeSBiZWhpbmQuXG5cdFx0aG9zdC5sYXlvdXRQb2xpY3kudmlld3BvcnRDbGFzcy5nZXQgPSAoKSA9PiAnZGVza3RvcCc7XG5cdFx0dXBkYXRlTW9iaWxlQ3VzdG9tVmlld05hdmlnYXRpb24uY2FsbChob3N0KTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoeyBvblBob25lLCBhZnRlckxlYXZpbmdQaG9uZTogaG9zdC5tb2JpbGVOYXZMYXllcnMgfSwge1xuXHRcdFx0b25QaG9uZTogWydjdXN0b21WaWV3J10sXG5cdFx0XHRhZnRlckxlYXZpbmdQaG9uZTogW10sXG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3RoZSBzZWNvbmRhcnkgc2lkZSBiYXIgdG9nZ2xlIGlzIGluZXJ0IHdoaWxlIGEgY3VzdG9tIHZpZXcgaXMgc2hvd24nLCAoKSA9PiB7XG5cdFx0Y29uc3QgaG9zdCA9IGNyZWF0ZUhvc3QoeyBwYXJ0VmlzaWJpbGl0eTogeyBhdXhpbGlhcnlCYXI6IHRydWUgfSB9KTtcblxuXHRcdGFwcGx5Q3VzdG9tVmlld0dyaWRWaXNpYmlsaXR5LmNhbGwoaG9zdCwge30pO1xuXHRcdHRvZ2dsZVNlY29uZGFyeVNpZGVCYXIuY2FsbChob3N0KTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChob3N0LnBhcnRWaXNpYmlsaXR5LmF1eGlsaWFyeUJhciwgdHJ1ZSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3Nob3dpbmcgYSBjdXN0b20gdmlldyB1bi1tYXhpbWl6ZXMgdGhlIGVkaXRvciBzbyB0aGUgc2Vzc2lvbnMgZ3JpZCBvd25zIHRoZSByb3cgYWdhaW4gb24gaGlkZScsICgpID0+IHtcblx0XHRjb25zdCBob3N0ID0gY3JlYXRlSG9zdCh7IGVkaXRvck1heGltaXplOiB0cnVlLCBwYXJ0VmlzaWJpbGl0eTogeyBlZGl0b3I6IHRydWUsIGF1eGlsaWFyeUJhcjogdHJ1ZSwgc2Vzc2lvbnM6IHRydWUgfSB9KTtcblx0XHRzZXRFZGl0b3JNYXhpbWl6ZWQuY2FsbChob3N0IGFzIHVua25vd24gYXMgSU1heGltaXplVGVzdEhhcm5lc3MsIHRydWUpO1xuXG5cdFx0YXBwbHlDdXN0b21WaWV3R3JpZFZpc2liaWxpdHkuY2FsbChob3N0LCB7fSk7XG5cdFx0Y29uc3Qgd2hpbGVTaG93biA9IHtcblx0XHRcdGVkaXRvck1heGltaXplZDogaG9zdC5fZWRpdG9yTWF4aW1pemVkLFxuXHRcdFx0c2Vzc2lvbnM6IGlzVmlzaWJsZS5jYWxsKGhvc3QsIFBhcnRzLlNFU1NJT05TX1BBUlQpLFxuXHRcdFx0Y3VzdG9tVmlld0dyaWQ6IGlzVmlzaWJsZS5jYWxsKGhvc3QsIFBhcnRzLkNVU1RPTV9WSUVXX0dSSURfUEFSVCksXG5cdFx0fTtcblxuXHRcdGFwcGx5Q3VzdG9tVmlld0dyaWRWaXNpYmlsaXR5LmNhbGwoaG9zdCwgdW5kZWZpbmVkKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0d2hpbGVTaG93bixcblx0XHRcdHNlc3Npb25zOiBpc1Zpc2libGUuY2FsbChob3N0LCBQYXJ0cy5TRVNTSU9OU19QQVJUKSxcblx0XHRcdGN1c3RvbVZpZXdHcmlkOiBpc1Zpc2libGUuY2FsbChob3N0LCBQYXJ0cy5DVVNUT01fVklFV19HUklEX1BBUlQpLFxuXHRcdH0sIHtcblx0XHRcdHdoaWxlU2hvd246IHsgZWRpdG9yTWF4aW1pemVkOiBmYWxzZSwgc2Vzc2lvbnM6IGZhbHNlLCBjdXN0b21WaWV3R3JpZDogdHJ1ZSB9LFxuXHRcdFx0c2Vzc2lvbnM6IHRydWUsXG5cdFx0XHRjdXN0b21WaWV3R3JpZDogZmFsc2UsXG5cdFx0fSk7XG5cdH0pO1xuXG5cdC8vIC0tLSBQZXJzaXN0ZW5jZSBnYXRpbmcgLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuXG5cdHRlc3QoJ2RvZXMgbm90IHJlc3RvcmUgc2F2ZWQgZGVza3RvcCBwYXJ0IHZpc2liaWxpdHkgb24gcGhvbmUgbGF5b3V0JywgKCkgPT4ge1xuXHRcdGxldCBnZXRDYWxsZWQgPSBmYWxzZTtcblx0XHRjb25zdCB3b3JrYmVuY2ggPSBjcmVhdGVXb3JrYmVuY2hIYXJuZXNzKCk7XG5cdFx0d29ya2JlbmNoLmxheW91dFBvbGljeS52aWV3cG9ydENsYXNzLmdldCA9ICgpID0+ICdwaG9uZSc7XG5cdFx0Y29uc3Qgc3RvcmFnZVNlcnZpY2UgPSB7XG5cdFx0XHRnZXQ6ICgpID0+IHtcblx0XHRcdFx0Z2V0Q2FsbGVkID0gdHJ1ZTtcblx0XHRcdFx0cmV0dXJuIEpTT04uc3RyaW5naWZ5KHsgZWRpdG9yOiB0cnVlLCBhdXhpbGlhcnlCYXI6IHRydWUsIHNpZGViYXI6IHRydWUgfSk7XG5cdFx0XHR9LFxuXHRcdFx0cmVtb3ZlOiAoKSA9PiB7IH0sXG5cdFx0fTtcblxuXHRcdGNvbnN0IHJlc3RvcmVkID0gbG9hZFBhcnRWaXNpYmlsaXR5LmNhbGwod29ya2JlbmNoLCBzdG9yYWdlU2VydmljZSk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHJlc3RvcmVkLCB7fSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGdldENhbGxlZCwgZmFsc2UpO1xuXHR9KTtcblxuXHR0ZXN0KCdyZXN0b3JlcyBzYXZlZCBkZXNrdG9wIHBhcnQgdmlzaWJpbGl0eSBvdXRzaWRlIHBob25lIGxheW91dCcsICgpID0+IHtcblx0XHRjb25zdCB3b3JrYmVuY2ggPSBjcmVhdGVXb3JrYmVuY2hIYXJuZXNzKCk7XG5cdFx0d29ya2JlbmNoLmxheW91dFBvbGljeS52aWV3cG9ydENsYXNzLmdldCA9ICgpID0+ICdkZXNrdG9wJztcblx0XHRjb25zdCBzdG9yYWdlU2VydmljZSA9IHtcblx0XHRcdGdldDogKCkgPT4gSlNPTi5zdHJpbmdpZnkoeyBlZGl0b3I6IHRydWUsIGF1eGlsaWFyeUJhcjogZmFsc2UsIHNpZGViYXI6IGZhbHNlIH0pLFxuXHRcdFx0cmVtb3ZlOiAoKSA9PiB7IH0sXG5cdFx0fTtcblxuXHRcdGNvbnN0IHJlc3RvcmVkID0gbG9hZFBhcnRWaXNpYmlsaXR5LmNhbGwod29ya2JlbmNoLCBzdG9yYWdlU2VydmljZSk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHJlc3RvcmVkLCB7IGVkaXRvcjogdHJ1ZSwgYXV4aWxpYXJ5QmFyOiBmYWxzZSwgc2lkZWJhcjogZmFsc2UgfSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2RvZXMgbm90IHBlcnNpc3QgcGFydCB2aXNpYmlsaXR5IG9uIHBob25lIGxheW91dCcsICgpID0+IHtcblx0XHRsZXQgc3RvcmVDYWxsZWQgPSBmYWxzZTtcblx0XHRjb25zdCB3b3JrYmVuY2ggPSBjcmVhdGVXb3JrYmVuY2hIYXJuZXNzKCk7XG5cdFx0d29ya2JlbmNoLmxheW91dFBvbGljeS52aWV3cG9ydENsYXNzLmdldCA9ICgpID0+ICdwaG9uZSc7XG5cdFx0d29ya2JlbmNoLnN0b3JhZ2VTZXJ2aWNlLnN0b3JlID0gKCkgPT4ge1xuXHRcdFx0c3RvcmVDYWxsZWQgPSB0cnVlO1xuXHRcdH07XG5cblx0XHRzYXZlUGFydFZpc2liaWxpdHkuY2FsbCh3b3JrYmVuY2gpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHN0b3JlQ2FsbGVkLCBmYWxzZSk7XG5cdH0pO1xufSk7XG4iXSwKICAibWFwcGluZ3MiOiAiQUFLQSxPQUFPLFlBQVk7QUFDbkIsU0FBUyxpQkFBaUI7QUFDMUIsU0FBUywrQ0FBK0M7QUFFeEQsU0FBcUMsYUFBYTtBQUNsRCxTQUFTLG9DQUE2RDtBQUN0RSxTQUErQixpQkFBaUI7QUFDaEQsU0FBUyx5QkFBeUIsMkJBQTJCO0FBQzdELFNBQVMsZ0NBQWdDO0FBQ3pDLFNBQVMseUJBQXlCO0FBQ2xDLFNBQVMsK0JBQStCO0FBQ3hDLFNB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
