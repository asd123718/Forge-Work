import { $, Dimension } from "../../../../../base/browser/dom.js";
import { Action } from "../../../../../base/common/actions.js";
import { Event } from "../../../../../base/common/event.js";
import { Schemas } from "../../../../../base/common/network.js";
import { basename, dirname } from "../../../../../base/common/resources.js";
import { URI } from "../../../../../base/common/uri.js";
import { ThemeIcon } from "../../../../../base/common/themables.js";
import { Codicon } from "../../../../../base/common/codicons.js";
import { mock } from "../../../../../base/test/common/mock.js";
import { localize } from "../../../../../nls.js";
import { IMenuService, MenuId } from "../../../../../platform/actions/common/actions.js";
import { MenuService } from "../../../../../platform/actions/common/menuService.js";
import { TestConfigurationService } from "../../../../../platform/configuration/test/common/testConfigurationService.js";
import { IContextKeyService } from "../../../../../platform/contextkey/common/contextkey.js";
import { ContextKeyService } from "../../../../../platform/contextkey/browser/contextKeyService.js";
import { listErrorForeground, listWarningForeground } from "../../../../../platform/theme/common/colors/listColors.js";
import { isDark } from "../../../../../platform/theme/common/theme.js";
import { asCssVariableName } from "../../../../../platform/theme/common/colorUtils.js";
import { IThemeService } from "../../../../../platform/theme/common/themeService.js";
import { IWorkspaceContextService } from "../../../../../platform/workspace/common/workspace.js";
import { testWorkspace } from "../../../../../platform/workspace/test/common/testWorkspace.js";
import { ITreeViewsDnDService } from "../../../../../editor/common/services/treeViewsDndService.js";
import { TreeViewsDnDService } from "../../../../../editor/common/services/treeViewsDnd.js";
import { EditorInput } from "../../../../common/editor/editorInput.js";
import { EditorInputCapabilities, EditorsOrder, Verbosity } from "../../../../common/editor.js";
import { EditorGroupModel } from "../../../../common/editor/editorGroupModel.js";
import {
  EDITOR_GROUP_HEADER_NO_TABS_BACKGROUND,
  EDITOR_GROUP_HEADER_TABS_BACKGROUND,
  MODERN_EDITOR_TAB_ACTIVE_ACTION_BACKGROUND,
  MODERN_EDITOR_TAB_ACTIVE_BACKGROUND,
  MODERN_EDITOR_TAB_ACTIVE_FOREGROUND,
  MODERN_EDITOR_TAB_ACTIVE_HOVER_ACTION_BACKGROUND,
  MODERN_EDITOR_TAB_ACTIVE_HOVER_BACKGROUND,
  MODERN_EDITOR_TAB_HOVER_ACTION_BACKGROUND,
  MODERN_EDITOR_TAB_HOVER_BACKGROUND,
  MODERN_EDITOR_TAB_HOVER_FOREGROUND,
  MODERN_EDITOR_TAB_INACTIVE_BACKGROUND,
  MODERN_EDITOR_TAB_SELECTED_ACTION_BACKGROUND
} from "../../../../common/theme.js";
import { DEFAULT_EDITOR_PART_OPTIONS } from "../../../../browser/parts/editor/editor.js";
import { BreadcrumbsService, IBreadcrumbsService } from "../../../../browser/parts/editor/breadcrumbs.js";
import { EditorTitleControl } from "../../../../browser/parts/editor/editorTitleControl.js";
import { IDecorationsService } from "../../../../services/decorations/common/decorations.js";
import { DecorationsService } from "../../../../services/decorations/browser/decorationsService.js";
import { INotebookDocumentService, NotebookDocumentWorkbenchService } from "../../../../services/notebook/common/notebookDocumentService.js";
import { IOutlineService } from "../../../../services/outline/browser/outline.js";
import { LayoutSettings } from "../../../../services/layout/browser/layoutService.js";
import { TestContextService } from "../../../common/workbenchTestServices.js";
import { workbenchInstantiationService } from "../../workbenchTestServices.js";
import { defineComponentFixture, defineThemedFixtureGroup } from "../fixtureUtils.js";
import "../../../../contrib/styleOverrides/browser/media/tabs.css";
import "./editorTabBar.fixture.css";
class FixtureEditorInput extends EditorInput {
  constructor(resource, _options = {}) {
    super();
    this.resource = resource;
    this._options = _options;
  }
  get typeId() {
    return this._options.typeId ?? "workbench.editors.fixtureEditorInput";
  }
  get editorId() {
    return this.typeId;
  }
  get capabilities() {
    return this._options.capabilities ?? EditorInputCapabilities.None;
  }
  getName() {
    return basename(this.resource);
  }
  /**
   * Returns a distinct parent-folder label per {@link Verbosity}, matching how
   * real resource editor inputs vary their description. `MultiEditorTabsControl`
   * maps `labelFormat` (short/medium/long) to a verbosity, so distinct values
   * here are what make the label-format fixtures differ.
   */
  getDescription(verbosity = Verbosity.MEDIUM) {
    const parent = dirname(this.resource);
    if (parent.path === "/" || parent.path === "." || parent.path === "") {
      return void 0;
    }
    switch (verbosity) {
      case Verbosity.SHORT:
        return basename(parent);
      // containing folder name
      case Verbosity.LONG:
        return parent.path;
      // full absolute path
      case Verbosity.MEDIUM:
      default:
        return parent.path.replace(/^\//, "");
    }
  }
  getIcon() {
    return this._options.icon;
  }
  isDirty() {
    return !!this._options.dirty;
  }
}
function file(path) {
  return URI.file(path);
}
function defaultEditorSpecs() {
  return [
    { resource: file("/project/src/app/main.ts"), icon: ThemeIcon.fromId(Codicon.symbolFile.id), sticky: true, pinned: true },
    { resource: file("/project/src/app/index.ts"), pinned: true },
    { resource: file("/project/README.md"), icon: ThemeIcon.fromId(Codicon.markdown.id), pinned: true },
    { resource: file("/project/package.json"), icon: ThemeIcon.fromId(Codicon.json.id), pinned: true, dirty: true, active: true },
    {
      resource: URI.from({ scheme: Schemas.untitled, path: "Untitled-1" }),
      typeId: "workbench.editors.untitledFixture",
      icon: ThemeIcon.fromId(Codicon.file.id),
      pinned: false
      /* preview */
    },
    { resource: file("/project/.vscode/settings.json"), icon: ThemeIcon.fromId(Codicon.settingsGear.id), pinned: true },
    { resource: file("/project/src/app/components/button.tsx"), pinned: true },
    { resource: file("/project/tests/app/main.test.ts"), pinned: true }
  ];
}
function nestedActiveEditorSpecs() {
  return defaultEditorSpecs().map((spec, index) => ({ ...spec, active: index === 0 }));
}
function duplicateNameEditorSpecs() {
  return [
    { resource: file("/project/src/app/index.ts"), pinned: true, active: true },
    { resource: file("/project/src/lib/index.ts"), pinned: true },
    { resource: file("/project/src/lib/util/index.ts"), pinned: true },
    { resource: file("/project/tests/index.ts"), pinned: true }
  ];
}
function manyEditorSpecs() {
  const names = [
    "main.ts",
    "index.ts",
    "button.tsx",
    "input.tsx",
    "list.tsx",
    "tree.tsx",
    "model.ts",
    "service.ts",
    "view.ts",
    "controller.ts",
    "utils.ts",
    "types.ts",
    "app.css",
    "theme.css",
    "README.md",
    "package.json"
  ];
  return names.map((name, index) => ({
    resource: file(`/project/src/module${index % 4}/${name}`),
    pinned: true,
    active: index === 0,
    dirty: index % 5 === 0
  }));
}
function dirtyEditorSpecs() {
  return [
    { resource: file("/project/src/app/main.ts"), pinned: true, dirty: true, active: true },
    { resource: file("/project/src/app/index.ts"), pinned: true, dirty: true },
    { resource: file("/project/README.md"), pinned: true },
    { resource: file("/project/package.json"), pinned: true, dirty: true }
  ];
}
function reserveSpaceEditorSpecs() {
  return [
    { resource: file("/project/src/app/main.ts"), icon: ThemeIcon.fromId(Codicon.symbolFile.id), sticky: true, pinned: true },
    { resource: file("/project/src/app/index.ts"), pinned: true },
    { resource: file("/project/README.md"), icon: ThemeIcon.fromId(Codicon.markdown.id), pinned: true },
    { resource: file("/project/package.json"), icon: ThemeIcon.fromId(Codicon.json.id), pinned: true, dirty: true, active: true },
    { resource: file("/project/src/app/components/button.tsx"), pinned: true }
  ];
}
function stickyEditorSpecs() {
  return [
    { resource: file("/project/src/app/main.ts"), icon: ThemeIcon.fromId(Codicon.symbolFile.id), sticky: true, pinned: true },
    { resource: file("/project/README.md"), icon: ThemeIcon.fromId(Codicon.markdown.id), sticky: true, pinned: true },
    { resource: file("/project/package.json"), icon: ThemeIcon.fromId(Codicon.json.id), sticky: true, pinned: true },
    { resource: file("/project/src/app/index.ts"), pinned: true, active: true },
    { resource: file("/project/src/app/components/button.tsx"), pinned: true }
  ];
}
function allStickyEditorSpecs() {
  return stickyEditorSpecs().map((spec, index) => ({ ...spec, sticky: true, active: index === 0 }));
}
function allUnstickyEditorSpecs() {
  return stickyEditorSpecs().map((spec, index) => ({ ...spec, sticky: false, active: index === 0 }));
}
function multiSelectEditorSpecs() {
  return [
    { resource: file("/project/src/app/main.ts"), icon: ThemeIcon.fromId(Codicon.symbolFile.id), pinned: true, selected: true },
    { resource: file("/project/src/app/index.ts"), pinned: true },
    { resource: file("/project/README.md"), icon: ThemeIcon.fromId(Codicon.markdown.id), pinned: true, selected: true },
    { resource: file("/project/package.json"), icon: ThemeIcon.fromId(Codicon.json.id), pinned: true, dirty: true, active: true, selected: true },
    { resource: file("/project/src/app/components/button.tsx"), pinned: true },
    { resource: file("/project/tests/app/main.test.ts"), pinned: true, selected: true }
  ];
}
function longLabelEditorSpecs() {
  return [
    { resource: file("/project/src/features/authentication/providers/veryLongAuthenticationProviderImplementation.ts"), pinned: true, active: true },
    { resource: file("/project/src/features/authentication/providers/anotherExtremelyLongProviderFactoryModule.ts"), pinned: true },
    { resource: file("/project/documentation/architecture/decisions/0001-use-a-really-long-descriptive-file-name.md"), icon: ThemeIcon.fromId(Codicon.markdown.id), pinned: true }
  ];
}
function singleDirtyEditorSpecs() {
  return [
    { resource: file("/project/src/app/main.ts"), icon: ThemeIcon.fromId(Codicon.symbolFile.id), pinned: true, dirty: true, active: true }
  ];
}
function cannotCloseEditorSpecs() {
  return [
    { resource: file("/project/Changes"), capabilities: EditorInputCapabilities.CannotClose, pinned: true, active: true },
    { resource: file("/project/src/app/main.ts"), pinned: true },
    { resource: file("/project/README.md"), icon: ThemeIcon.fromId(Codicon.markdown.id), pinned: true }
  ];
}
function cannotCloseDirtyEditorSpecs() {
  return [
    { resource: file("/project/Changes"), capabilities: EditorInputCapabilities.CannotClose, pinned: true, dirty: true, active: true },
    { resource: file("/project/src/app/main.ts"), pinned: true }
  ];
}
function cannotCloseStickyEditorSpecs() {
  return [
    { resource: file("/project/Changes"), capabilities: EditorInputCapabilities.CannotClose, pinned: true, sticky: true, active: true },
    { resource: file("/project/src/app/main.ts"), pinned: true }
  ];
}
const FIXTURE_DECORATIONS = /* @__PURE__ */ new Map([
  ["/project/package.json", { weight: 10, letter: "M", color: listWarningForeground, tooltip: "Modified", bubble: false }],
  ["/project/src/app/main.ts", { weight: 20, letter: "2", color: listErrorForeground, tooltip: "2 problems", bubble: false }],
  ["/project/src/app/index.ts", { weight: 20, letter: "U", color: listWarningForeground, tooltip: "Untracked", bubble: false }]
]);
function registerFixtureDecorations(decorationsService, store) {
  const provider = {
    label: "Fixture Decorations",
    onDidChange: Event.None,
    provideDecorations(uri, _token) {
      return FIXTURE_DECORATIONS.get(uri.path);
    }
  };
  store.add(decorationsService.registerDecorationsProvider(provider));
}
function createFixtureEditorTitleActions(store, menuId) {
  if (menuId !== MenuId.EditorTitle) {
    return { primary: [], secondary: [] };
  }
  return {
    primary: [
      store.add(new Action(
        "fixture.splitEditorRight",
        localize("fixtureSplitEditorRight", "Split Editor Right"),
        ThemeIcon.asClassName(Codicon.splitHorizontal)
      ))
    ],
    secondary: [
      store.add(new Action(
        "fixture.openEditor",
        localize("fixtureOpenEditor", "Open Editor..."),
        ThemeIcon.asClassName(Codicon.goToFile)
      ))
    ]
  };
}
function createPartOptions(overrides) {
  return {
    ...DEFAULT_EDITOR_PART_OPTIONS,
    hasIcons: true,
    ...overrides
  };
}
function populateModel(model, specs, disposableStore) {
  const ordered = [...specs].sort((a, b) => a.sticky === b.sticky ? 0 : a.sticky ? -1 : 1);
  const inputBySpec = /* @__PURE__ */ new Map();
  for (const spec of ordered) {
    const input = disposableStore.add(new FixtureEditorInput(spec.resource, {
      typeId: spec.typeId,
      dirty: spec.dirty,
      icon: spec.icon,
      capabilities: spec.capabilities
    }));
    inputBySpec.set(spec, input);
    model.openEditor(input, {
      pinned: spec.pinned ?? true,
      sticky: spec.sticky,
      active: spec.active
    });
  }
  const inactiveSelected = ordered.filter((spec) => spec.selected && !spec.active).map((spec) => inputBySpec.get(spec));
  if (inactiveSelected.length && model.activeEditor) {
    model.setSelection(model.activeEditor, inactiveSelected);
  }
}
function renderEditorTabBarFixture(ctx, options) {
  const { container, disposableStore, theme } = ctx;
  const width = options.width ?? 820;
  const isGroupActive = options.active ?? true;
  const partOptions = createPartOptions(options.partOptions);
  for (const [colorId, color] of Object.entries(options.colorCustomizations ?? {})) {
    container.style.setProperty(asCssVariableName(colorId), color);
  }
  const configurationService = new TestConfigurationService();
  configurationService.setUserConfiguration("breadcrumbs", {
    enabled: Boolean(options.breadcrumbs),
    filePath: options.breadcrumbs?.filePath ?? "on",
    symbolPath: "off",
    icons: options.breadcrumbs?.icons ?? true
  });
  configurationService.setUserConfiguration(LayoutSettings.MODERN_UI, options.modernUI);
  const instantiationService = workbenchInstantiationService({
    configurationService: () => configurationService
  }, disposableStore);
  instantiationService.get(IThemeService).setTheme(theme);
  instantiationService.stub(ITreeViewsDnDService, new TreeViewsDnDService());
  instantiationService.stub(INotebookDocumentService, new NotebookDocumentWorkbenchService());
  const contextKeyService = disposableStore.add(instantiationService.createInstance(ContextKeyService));
  instantiationService.stub(IContextKeyService, contextKeyService);
  if (options.headerMenuIds) {
    instantiationService.stub(IMenuService, disposableStore.add(instantiationService.createInstance(MenuService)));
  }
  if (options.breadcrumbs) {
    instantiationService.stub(IBreadcrumbsService, new BreadcrumbsService());
    instantiationService.stub(IOutlineService, new class extends mock() {
    }());
    instantiationService.stub(IWorkspaceContextService, new TestContextService(testWorkspace(file("/project"))));
  }
  const decorationsService = disposableStore.add(instantiationService.createInstance(DecorationsService));
  instantiationService.stub(IDecorationsService, decorationsService);
  registerFixtureDecorations(decorationsService, disposableStore);
  const model = disposableStore.add(instantiationService.createInstance(EditorGroupModel, void 0));
  populateModel(model, options.editors ?? defaultEditorSpecs(), disposableStore);
  const createEditorActions = (disposables, menuId) => {
    return { actions: createFixtureEditorTitleActions(disposables, menuId), onDidChange: Event.None };
  };
  const groupView = new class extends mock() {
    constructor() {
      super(...arguments);
      this.relayoutFn = () => {
      };
      this.onDidActiveEditorChange = Event.None;
    }
    get id() {
      return model.id;
    }
    get count() {
      return model.count;
    }
    get stickyCount() {
      return model.stickyCount;
    }
    get activeEditor() {
      return model.activeEditor;
    }
    get activeEditorPane() {
      return void 0;
    }
    get selectedEditors() {
      return model.selectedEditors;
    }
    get ariaLabel() {
      return "Editor Group 1";
    }
    get groupsView() {
      return groupsView;
    }
    getEditorByIndex(index) {
      return model.getEditorByIndex(index);
    }
    getIndexOfEditor(editor) {
      return model.indexOf(editor);
    }
    getEditors(order, opts) {
      return model.getEditors(order, opts);
    }
    isActive(editor) {
      return model.isActive(editor);
    }
    isPinned(editorOrIndex) {
      return model.isPinned(editorOrIndex);
    }
    isSticky(editorOrIndex) {
      return model.isSticky(editorOrIndex);
    }
    isSelected(editorOrIndex) {
      return model.isSelected(editorOrIndex);
    }
    createEditorActions(disposables, menuId = MenuId.EditorTitle) {
      return createEditorActions(disposables, menuId);
    }
    relayout() {
      this.relayoutFn();
    }
  }();
  const otherActiveGroup = new class extends mock() {
    focus() {
    }
  }();
  const groupsView = new class extends mock() {
    constructor() {
      super(...arguments);
      this.onDidChangeEditorPartOptions = Event.None;
      this.onDidVisibilityChange = Event.None;
    }
    get partOptions() {
      return partOptions;
    }
    get activeGroup() {
      return isGroupActive ? groupView : otherActiveGroup;
    }
    get groups() {
      return [groupView];
    }
  }();
  const editorPartsView = new class extends mock() {
    get count() {
      return 1;
    }
    getGroup() {
      return groupView;
    }
  }();
  const editorPart = $(".part.editor");
  const content = $(".content");
  const groupContainer = $(isGroupActive ? ".editor-group-container.active" : ".editor-group-container");
  const titleContainer = $(".title");
  container.classList.toggle("modern-ui-tabs", options.modernUI);
  titleContainer.classList.toggle("tabs", partOptions.showTabs === "multiple");
  titleContainer.classList.toggle("show-file-icons", partOptions.showIcons);
  const headerBackground = theme.getColor(partOptions.showTabs === "multiple" ? EDITOR_GROUP_HEADER_TABS_BACKGROUND : EDITOR_GROUP_HEADER_NO_TABS_BACKGROUND);
  if (headerBackground) {
    titleContainer.style.backgroundColor = headerBackground.toString();
  }
  const editorContainer = $(".editor-container");
  editorContainer.style.height = "96px";
  editorContainer.style.opacity = "0.6";
  editorPart.appendChild(content);
  content.appendChild(groupContainer);
  groupContainer.appendChild(titleContainer);
  groupContainer.appendChild(editorContainer);
  container.appendChild(editorPart);
  container.style.width = `${width}px`;
  groupContainer.style.width = `${width}px`;
  const titleControl = disposableStore.add(instantiationService.createInstance(
    EditorTitleControl,
    titleContainer,
    editorPartsView,
    groupsView,
    groupView,
    model,
    options.headerMenuIds,
    options.showHeader ?? false
  ));
  const layout = () => {
    titleControl.layout({
      container: new Dimension(width, titleControl.getHeight().total),
      available: new Dimension(width, 200)
    });
  };
  groupView.relayoutFn = layout;
  titleControl.openEditors(model.getEditors(EditorsOrder.SEQUENTIAL));
  titleControl.setActive(isGroupActive);
  const tabs = titleContainer.querySelectorAll(".tabs-container > .tab");
  if (options.dropTargetBetweenTabs) {
    tabs[1]?.classList.add("drop-target-left");
    tabs[2]?.classList.add("drop-target-right");
  }
  if (options.forcedHoverTab !== void 0) {
    tabs[options.forcedHoverTab]?.classList.add("fixture-hover");
  }
  if (options.focusedTabAction !== void 0) {
    tabs[options.focusedTabAction]?.querySelector(".tab-actions .action-label")?.focus();
  }
  layout();
}
function render(modernUI, options) {
  return (ctx) => renderEditorTabBarFixture(ctx, { ...options, modernUI });
}
function createFixtures(modernUI, additionalThemes = []) {
  return {
    // Baseline: multiple tabs with mixed sticky / pinned / preview / dirty state.
    Default: defineComponentFixture({ render: render(modernUI, {}), additionalThemes }),
    // showTabs
    ShowTabsSingle: defineComponentFixture({ render: render(modernUI, { partOptions: { showTabs: "single" }, breadcrumbs: {} }) }),
    ShowTabsNone: defineComponentFixture({ render: render(modernUI, { partOptions: { showTabs: "none" } }) }),
    // pinnedTabsOnSeparateRow
    PinnedTabsOnSeparateRowAllPinned: defineComponentFixture({ render: render(modernUI, { partOptions: { pinnedTabsOnSeparateRow: true }, editors: allStickyEditorSpecs() }) }),
    PinnedTabsOnSeparateRowAllUnpinned: defineComponentFixture({ render: render(modernUI, { partOptions: { pinnedTabsOnSeparateRow: true }, editors: allUnstickyEditorSpecs() }) }),
    PinnedTabsOnSeparateRowMixed: defineComponentFixture({ render: render(modernUI, { partOptions: { pinnedTabsOnSeparateRow: true }, editors: stickyEditorSpecs() }), additionalThemes }),
    // breadcrumbs
    BreadcrumbsFilePathLast: defineComponentFixture({ render: render(modernUI, { breadcrumbs: { filePath: "last" }, editors: nestedActiveEditorSpecs() }) }),
    BreadcrumbsIconsOff: defineComponentFixture({ render: render(modernUI, { breadcrumbs: { icons: false } }) }),
    // tabSizing
    TabSizingShrink: defineComponentFixture({ render: render(modernUI, { partOptions: { tabSizing: "shrink" }, editors: manyEditorSpecs() }) }),
    TabSizingFixed: defineComponentFixture({ render: render(modernUI, { partOptions: { tabSizing: "fixed", tabSizingFixedMinWidth: 60, tabSizingFixedMaxWidth: 120 }, editors: manyEditorSpecs() }) }),
    // tabHeight
    TabHeightCompact: defineComponentFixture({ render: render(modernUI, { partOptions: { tabHeight: "compact" } }) }),
    // wrapTabs
    WrapTabs: defineComponentFixture({ render: render(modernUI, { partOptions: { wrapTabs: true }, editors: manyEditorSpecs(), width: 520 }) }),
    // tabActionLocation
    TabActionLocationLeft: defineComponentFixture({ render: render(modernUI, { partOptions: { tabActionLocation: "left" } }) }),
    // tabActionCloseVisibility
    TabActionCloseHidden: defineComponentFixture({ render: render(modernUI, { partOptions: { tabActionCloseVisibility: false } }) }),
    // tabActionUnpinVisibility (with sticky/compact tabs where the unpin action shows)
    TabActionUnpinHidden: defineComponentFixture({ render: render(modernUI, { partOptions: { tabActionUnpinVisibility: false, pinnedTabSizing: "normal" }, editors: stickyEditorSpecs() }) }),
    // tabActionReserveSpace (Modern UI: reserved by default; when disabled clean tabs go compact while dirty/sticky still reserve their indicator column)
    TabActionReserveSpaceOn: defineComponentFixture({ render: render(modernUI, { partOptions: { tabActionReserveSpace: true }, editors: reserveSpaceEditorSpecs() }) }),
    TabActionReserveSpaceOff: defineComponentFixture({ render: render(modernUI, { partOptions: { tabActionReserveSpace: false }, editors: reserveSpaceEditorSpecs() }) }),
    // showTabIndex
    ShowTabIndex: defineComponentFixture({ render: render(modernUI, { partOptions: { showTabIndex: true } }) }),
    // highlightModifiedTabs
    HighlightModifiedTabs: defineComponentFixture({ render: render(modernUI, { partOptions: { highlightModifiedTabs: true }, editors: dirtyEditorSpecs() }) }),
    // labelFormat
    LabelFormatShort: defineComponentFixture({ render: render(modernUI, { partOptions: { labelFormat: "short" }, editors: duplicateNameEditorSpecs() }) }),
    LabelFormatMedium: defineComponentFixture({ render: render(modernUI, { partOptions: { labelFormat: "medium" }, editors: duplicateNameEditorSpecs() }) }),
    LabelFormatLong: defineComponentFixture({ render: render(modernUI, { partOptions: { labelFormat: "long" }, editors: duplicateNameEditorSpecs() }) }),
    // showIcons
    ShowIconsOff: defineComponentFixture({ render: render(modernUI, { partOptions: { showIcons: false } }) }),
    // decorations (file-decoration badges + colors)
    DecorationsOff: defineComponentFixture({ render: render(modernUI, { partOptions: { decorations: { badges: false, colors: false } } }) }),
    // pinnedTabSizing
    PinnedTabSizingCompact: defineComponentFixture({ render: render(modernUI, { partOptions: { pinnedTabSizing: "compact" }, editors: stickyEditorSpecs() }) }),
    PinnedTabSizingShrink: defineComponentFixture({ render: render(modernUI, { partOptions: { pinnedTabSizing: "shrink" }, editors: stickyEditorSpecs() }) }),
    // titleScrollbarSizing
    TitleScrollbarLarge: defineComponentFixture({ render: render(modernUI, { partOptions: { titleScrollbarSizing: "large" }, editors: manyEditorSpecs(), width: 520 }) }),
    // titleScrollbarVisibility (always-visible scrollbar with overflowing tabs)
    TitleScrollbarVisible: defineComponentFixture({ render: render(modernUI, { partOptions: { titleScrollbarVisibility: "visible" }, editors: manyEditorSpecs(), width: 520 }) }),
    // editorActionsLocation
    EditorActionsDefault: defineComponentFixture({ render: render(modernUI, { partOptions: { editorActionsLocation: "default" } }) }),
    EditorActionsTitleBar: defineComponentFixture({ render: render(modernUI, { partOptions: { editorActionsLocation: "titleBar" } }) }),
    EditorActionsHidden: defineComponentFixture({ render: render(modernUI, { partOptions: { editorActionsLocation: "hidden" } }) }),
    // alwaysShowEditorActions
    AlwaysShowEditorActionsActiveGroup: defineComponentFixture({ render: render(modernUI, { partOptions: { alwaysShowEditorActions: true }, active: true }) }),
    AlwaysShowEditorActionsInactiveGroup: defineComponentFixture({ render: render(modernUI, { partOptions: { alwaysShowEditorActions: true }, active: false }) }),
    // --- UI states / edge cases (not tied to a single setting) ---
    // Active and inactive group styling.
    ActiveGroup: defineComponentFixture({ render: render(modernUI, { active: true }) }),
    InactiveGroup: defineComponentFixture({ render: render(modernUI, { active: false }), additionalThemes }),
    // Multi-selection: several tabs in the selected state at once.
    MultiSelect: defineComponentFixture({ render: render(modernUI, { editors: multiSelectEditorSpecs() }), additionalThemes }),
    // Inactive group with dirty editors: exercises the unfocused modified-border color path.
    InactiveGroupDirty: defineComponentFixture({ render: render(modernUI, { editors: dirtyEditorSpecs(), active: false }) }),
    // Very long labels: tab-label truncation / ellipsis with shrinking tabs.
    LongLabelsShrink: defineComponentFixture({ render: render(modernUI, { partOptions: { tabSizing: "shrink" }, editors: longLabelEditorSpecs(), width: 520 }) }),
    // Drag-and-drop insertion indicator between two tabs.
    DropTargetBetweenTabs: defineComponentFixture({ render: render(modernUI, { dropTargetBetweenTabs: true }), additionalThemes }),
    // --- Notable setting combinations ---
    // Sticky compact tabs with icons disabled: the sticky tab falls back to the
    // first letter of the name instead of an icon.
    StickyCompactNoIcons: defineComponentFixture({ render: render(modernUI, { partOptions: { pinnedTabSizing: "compact", showIcons: false }, editors: stickyEditorSpecs() }) }),
    // Single-tab mode with a dirty editor: the single tab control renders the dirty dot.
    SingleTabDirty: defineComponentFixture({ render: render(modernUI, { partOptions: { showTabs: "single" }, editors: singleDirtyEditorSpecs() }) }),
    // Protected editors hide close affordances while ordinary neighboring tabs remain closeable.
    CannotCloseActive: defineComponentFixture({ render: render(modernUI, { editors: cannotCloseEditorSpecs() }), additionalThemes }),
    // Protected dirty editors retain the modified indicator without exposing a close action.
    CannotCloseDirty: defineComponentFixture({ render: render(modernUI, { editors: cannotCloseDirtyEditorSpecs() }), additionalThemes }),
    // Sticky protected editors retain the Unpin affordance because unpinning does not close them.
    CannotCloseSticky: defineComponentFixture({ render: render(modernUI, { partOptions: { pinnedTabSizing: "normal", tabActionUnpinVisibility: true }, editors: cannotCloseStickyEditorSpecs() }), additionalThemes }),
    // Pinned tabs on a separate row combined with compact pinned sizing.
    PinnedSeparateRowCompact: defineComponentFixture({ render: render(modernUI, { partOptions: { pinnedTabsOnSeparateRow: true, pinnedTabSizing: "compact" }, editors: stickyEditorSpecs() }) })
  };
}
function getModernEditorTabColorCustomizations(theme) {
  const dark = isDark(theme.type);
  return {
    [MODERN_EDITOR_TAB_ACTIVE_BACKGROUND]: dark ? "#164E63" : "#BAE6FD",
    [MODERN_EDITOR_TAB_ACTIVE_ACTION_BACKGROUND]: dark ? "#0E3747" : "#7DD3FC",
    [MODERN_EDITOR_TAB_ACTIVE_FOREGROUND]: dark ? "#CFFAFE" : "#0C4A6E",
    [MODERN_EDITOR_TAB_INACTIVE_BACKGROUND]: dark ? "#1E293B" : "#E2E8F0",
    [MODERN_EDITOR_TAB_HOVER_BACKGROUND]: dark ? "#7C2D12" : "#FED7AA",
    [MODERN_EDITOR_TAB_HOVER_ACTION_BACKGROUND]: dark ? "#5A1F0C" : "#FDBA74",
    [MODERN_EDITOR_TAB_HOVER_FOREGROUND]: dark ? "#FFEDD5" : "#7C2D12",
    [MODERN_EDITOR_TAB_ACTIVE_HOVER_BACKGROUND]: dark ? "#6B21A8" : "#E9D5FF",
    [MODERN_EDITOR_TAB_ACTIVE_HOVER_ACTION_BACKGROUND]: dark ? "#4C1678" : "#D8B4FE",
    [MODERN_EDITOR_TAB_SELECTED_ACTION_BACKGROUND]: dark ? "#166534" : "#BBF7D0"
  };
}
function renderThemeColors(options) {
  return (ctx) => renderEditorTabBarFixture(ctx, {
    ...options,
    modernUI: true,
    colorCustomizations: getModernEditorTabColorCustomizations(ctx.theme)
  });
}
function createThemeColorFixtures() {
  return {
    TabStates: defineComponentFixture({ render: renderThemeColors({ forcedHoverTab: 2, focusedTabAction: 2 }) }),
    ActiveAction: defineComponentFixture({ render: renderThemeColors({ focusedTabAction: 3 }) }),
    ActiveHover: defineComponentFixture({ render: renderThemeColors({ forcedHoverTab: 3, focusedTabAction: 3 }) }),
    SelectedAction: defineComponentFixture({ render: renderThemeColors({ editors: multiSelectEditorSpecs(), focusedTabAction: 0 }) })
  };
}
var editorTabBar_fixture_default = defineThemedFixtureGroup({ path: "editor/editorTabBar/" }, {
  ModernUIOff: defineThemedFixtureGroup(createFixtures(false, ["darkHighContrast"])),
  ModernUIOn: defineThemedFixtureGroup({
    ...createFixtures(true, ["darkHighContrast"]),
    ThemeColors: defineThemedFixtureGroup(createThemeColorFixtures())
  })
});
export {
  editorTabBar_fixture_default as default,
  renderEditorTabBarFixture
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXHRlc3RcXGJyb3dzZXJcXGNvbXBvbmVudEZpeHR1cmVzXFxlZGl0b3JcXGVkaXRvclRhYkJhci5maXh0dXJlLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IHsgJCwgRGltZW5zaW9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL2RvbS5qcyc7XG5pbXBvcnQgeyBBY3Rpb24gfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9hY3Rpb25zLmpzJztcbmltcG9ydCB7IENhbmNlbGxhdGlvblRva2VuIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vY2FuY2VsbGF0aW9uLmpzJztcbmltcG9ydCB7IEV2ZW50IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vZXZlbnQuanMnO1xuaW1wb3J0IHsgRGlzcG9zYWJsZVN0b3JlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IFNjaGVtYXMgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9uZXR3b3JrLmpzJztcbmltcG9ydCB7IGJhc2VuYW1lLCBkaXJuYW1lIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vcmVzb3VyY2VzLmpzJztcbmltcG9ydCB7IFVSSSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3VyaS5qcyc7XG5pbXBvcnQgeyBUaGVtZUljb24gfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi90aGVtYWJsZXMuanMnO1xuaW1wb3J0IHsgQ29kaWNvbiB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2NvZGljb25zLmpzJztcbmltcG9ydCB7IG1vY2sgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL3Rlc3QvY29tbW9uL21vY2suanMnO1xuaW1wb3J0IHsgbG9jYWxpemUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9ubHMuanMnO1xuaW1wb3J0IHsgSU1lbnVTZXJ2aWNlLCBNZW51SWQgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9hY3Rpb25zL2NvbW1vbi9hY3Rpb25zLmpzJztcbmltcG9ydCB7IE1lbnVTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vYWN0aW9ucy9jb21tb24vbWVudVNlcnZpY2UuanMnO1xuaW1wb3J0IHsgVGVzdENvbmZpZ3VyYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29uZmlndXJhdGlvbi90ZXN0L2NvbW1vbi90ZXN0Q29uZmlndXJhdGlvblNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSUNvbnRleHRLZXlTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29udGV4dGtleS9jb21tb24vY29udGV4dGtleS5qcyc7XG5pbXBvcnQgeyBDb250ZXh0S2V5U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbnRleHRrZXkvYnJvd3Nlci9jb250ZXh0S2V5U2VydmljZS5qcyc7XG5pbXBvcnQgeyBsaXN0RXJyb3JGb3JlZ3JvdW5kLCBsaXN0V2FybmluZ0ZvcmVncm91bmQgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS90aGVtZS9jb21tb24vY29sb3JzL2xpc3RDb2xvcnMuanMnO1xuaW1wb3J0IHsgaXNEYXJrIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vdGhlbWUvY29tbW9uL3RoZW1lLmpzJztcbmltcG9ydCB7IGFzQ3NzVmFyaWFibGVOYW1lIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vdGhlbWUvY29tbW9uL2NvbG9yVXRpbHMuanMnO1xuaW1wb3J0IHsgSVRoZW1lU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL3RoZW1lL2NvbW1vbi90aGVtZVNlcnZpY2UuanMnO1xuaW1wb3J0IHsgVGVzdFRoZW1lU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL3RoZW1lL3Rlc3QvY29tbW9uL3Rlc3RUaGVtZVNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSVdvcmtzcGFjZUNvbnRleHRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vd29ya3NwYWNlL2NvbW1vbi93b3Jrc3BhY2UuanMnO1xuaW1wb3J0IHsgdGVzdFdvcmtzcGFjZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL3dvcmtzcGFjZS90ZXN0L2NvbW1vbi90ZXN0V29ya3NwYWNlLmpzJztcbmltcG9ydCB7IElUcmVlVmlld3NEbkRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9zZXJ2aWNlcy90cmVlVmlld3NEbmRTZXJ2aWNlLmpzJztcbmltcG9ydCB7IFRyZWVWaWV3c0RuRFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL3NlcnZpY2VzL3RyZWVWaWV3c0RuZC5qcyc7XG5pbXBvcnQgeyBFZGl0b3JJbnB1dCB9IGZyb20gJy4uLy4uLy4uLy4uL2NvbW1vbi9lZGl0b3IvZWRpdG9ySW5wdXQuanMnO1xuaW1wb3J0IHsgRWRpdG9ySW5wdXRDYXBhYmlsaXRpZXMsIEVkaXRvcnNPcmRlciwgSUVkaXRvclBhcnRPcHRpb25zLCBJVG9vbGJhckFjdGlvbnMsIFZlcmJvc2l0eSB9IGZyb20gJy4uLy4uLy4uLy4uL2NvbW1vbi9lZGl0b3IuanMnO1xuaW1wb3J0IHsgRWRpdG9yR3JvdXBNb2RlbCB9IGZyb20gJy4uLy4uLy4uLy4uL2NvbW1vbi9lZGl0b3IvZWRpdG9yR3JvdXBNb2RlbC5qcyc7XG5pbXBvcnQge1xuXHRFRElUT1JfR1JPVVBfSEVBREVSX05PX1RBQlNfQkFDS0dST1VORCxcblx0RURJVE9SX0dST1VQX0hFQURFUl9UQUJTX0JBQ0tHUk9VTkQsXG5cdE1PREVSTl9FRElUT1JfVEFCX0FDVElWRV9BQ1RJT05fQkFDS0dST1VORCxcblx0TU9ERVJOX0VESVRPUl9UQUJfQUNUSVZFX0JBQ0tHUk9VTkQsXG5cdE1PREVSTl9FRElUT1JfVEFCX0FDVElWRV9GT1JFR1JPVU5ELFxuXHRNT0RFUk5fRURJVE9SX1RBQl9BQ1RJVkVfSE9WRVJfQUNUSU9OX0JBQ0tHUk9VTkQsXG5cdE1PREVSTl9FRElUT1JfVEFCX0FDVElWRV9IT1ZFUl9CQUNLR1JPVU5ELFxuXHRNT0RFUk5fRURJVE9SX1RBQl9IT1ZFUl9BQ1RJT05fQkFDS0dST1VORCxcblx0TU9ERVJOX0VESVRPUl9UQUJfSE9WRVJfQkFDS0dST1VORCxcblx0TU9ERVJOX0VESVRPUl9UQUJfSE9WRVJfRk9SRUdST1VORCxcblx0TU9ERVJOX0VESVRPUl9UQUJfSU5BQ1RJVkVfQkFDS0dST1VORCxcblx0TU9ERVJOX0VESVRPUl9UQUJfU0VMRUNURURfQUNUSU9OX0JBQ0tHUk9VTkQsXG59IGZyb20gJy4uLy4uLy4uLy4uL2NvbW1vbi90aGVtZS5qcyc7XG5pbXBvcnQgeyBERUZBVUxUX0VESVRPUl9QQVJUX09QVElPTlMsIElFZGl0b3JHcm91cE1lbnVJZHMsIElFZGl0b3JHcm91cHNWaWV3LCBJRWRpdG9yR3JvdXBWaWV3LCBJRWRpdG9yUGFydHNWaWV3IH0gZnJvbSAnLi4vLi4vLi4vLi4vYnJvd3Nlci9wYXJ0cy9lZGl0b3IvZWRpdG9yLmpzJztcbmltcG9ydCB7IEJyZWFkY3J1bWJzU2VydmljZSwgSUJyZWFkY3J1bWJzU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jyb3dzZXIvcGFydHMvZWRpdG9yL2JyZWFkY3J1bWJzLmpzJztcbmltcG9ydCB7IEVkaXRvclRpdGxlQ29udHJvbCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jyb3dzZXIvcGFydHMvZWRpdG9yL2VkaXRvclRpdGxlQ29udHJvbC5qcyc7XG5pbXBvcnQgeyBJRGVjb3JhdGlvbkRhdGEsIElEZWNvcmF0aW9uc1Byb3ZpZGVyLCBJRGVjb3JhdGlvbnNTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vc2VydmljZXMvZGVjb3JhdGlvbnMvY29tbW9uL2RlY29yYXRpb25zLmpzJztcbmltcG9ydCB7IERlY29yYXRpb25zU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3NlcnZpY2VzL2RlY29yYXRpb25zL2Jyb3dzZXIvZGVjb3JhdGlvbnNTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElOb3RlYm9va0RvY3VtZW50U2VydmljZSwgTm90ZWJvb2tEb2N1bWVudFdvcmtiZW5jaFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9zZXJ2aWNlcy9ub3RlYm9vay9jb21tb24vbm90ZWJvb2tEb2N1bWVudFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSU91dGxpbmVTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vc2VydmljZXMvb3V0bGluZS9icm93c2VyL291dGxpbmUuanMnO1xuaW1wb3J0IHsgTGF5b3V0U2V0dGluZ3MgfSBmcm9tICcuLi8uLi8uLi8uLi9zZXJ2aWNlcy9sYXlvdXQvYnJvd3Nlci9sYXlvdXRTZXJ2aWNlLmpzJztcbmltcG9ydCB7IFRlc3RDb250ZXh0U2VydmljZSB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi93b3JrYmVuY2hUZXN0U2VydmljZXMuanMnO1xuaW1wb3J0IHsgd29ya2JlbmNoSW5zdGFudGlhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi93b3JrYmVuY2hUZXN0U2VydmljZXMuanMnO1xuaW1wb3J0IHsgQ29tcG9uZW50Rml4dHVyZUFkZGl0aW9uYWxUaGVtZSwgQ29tcG9uZW50Rml4dHVyZUNvbnRleHQsIGRlZmluZUNvbXBvbmVudEZpeHR1cmUsIGRlZmluZVRoZW1lZEZpeHR1cmVHcm91cCB9IGZyb20gJy4uL2ZpeHR1cmVVdGlscy5qcyc7XG5pbXBvcnQgJy4uLy4uLy4uLy4uL2NvbnRyaWIvc3R5bGVPdmVycmlkZXMvYnJvd3Nlci9tZWRpYS90YWJzLmNzcyc7XG5pbXBvcnQgJy4vZWRpdG9yVGFiQmFyLmZpeHR1cmUuY3NzJztcblxuLy8gPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxuLy8gRml4dHVyZSBlZGl0b3IgaW5wdXRcbi8vID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT1cblxuaW50ZXJmYWNlIElGaXh0dXJlRWRpdG9ySW5wdXRPcHRpb25zIHtcblx0cmVhZG9ubHkgdHlwZUlkPzogc3RyaW5nO1xuXHRyZWFkb25seSBkaXJ0eT86IGJvb2xlYW47XG5cdHJlYWRvbmx5IGNhcGFiaWxpdGllcz86IEVkaXRvcklucHV0Q2FwYWJpbGl0aWVzO1xuXHRyZWFkb25seSBpY29uPzogVGhlbWVJY29uIHwgVVJJO1xufVxuXG4vKipcbiAqIEEgbGlnaHR3ZWlnaHQge0BsaW5rIEVkaXRvcklucHV0fSB1c2VkIHB1cmVseSB0byBwb3B1bGF0ZSB0aGUgdGFiIGJhciBmb3JcbiAqIHNjcmVlbnNob3QgZml4dHVyZXMuIEl0IG5ldmVyIHJlc29sdmVzIGEgcmVhbCBlZGl0b3IgcGFuZTsgaXQgb25seSBwcm92aWRlc1xuICogdGhlIGxhYmVsLCBkZXNjcmlwdGlvbiAoZm9sZGVyIHBhdGgpLCBpY29uIGFuZCBkaXJ0eSBzdGF0ZSB0aGF0IHRoZSB0YWIgYmFyXG4gKiByZW5kZXJzLlxuICovXG5jbGFzcyBGaXh0dXJlRWRpdG9ySW5wdXQgZXh0ZW5kcyBFZGl0b3JJbnB1dCB7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0cmVhZG9ubHkgcmVzb3VyY2U6IFVSSSxcblx0XHRwcml2YXRlIHJlYWRvbmx5IF9vcHRpb25zOiBJRml4dHVyZUVkaXRvcklucHV0T3B0aW9ucyA9IHt9XG5cdCkge1xuXHRcdHN1cGVyKCk7XG5cdH1cblxuXHRvdmVycmlkZSBnZXQgdHlwZUlkKCk6IHN0cmluZyB7IHJldHVybiB0aGlzLl9vcHRpb25zLnR5cGVJZCA/PyAnd29ya2JlbmNoLmVkaXRvcnMuZml4dHVyZUVkaXRvcklucHV0JzsgfVxuXHRvdmVycmlkZSBnZXQgZWRpdG9ySWQoKTogc3RyaW5nIHwgdW5kZWZpbmVkIHsgcmV0dXJuIHRoaXMudHlwZUlkOyB9XG5cblx0b3ZlcnJpZGUgZ2V0IGNhcGFiaWxpdGllcygpOiBFZGl0b3JJbnB1dENhcGFiaWxpdGllcyB7XG5cdFx0cmV0dXJuIHRoaXMuX29wdGlvbnMuY2FwYWJpbGl0aWVzID8/IEVkaXRvcklucHV0Q2FwYWJpbGl0aWVzLk5vbmU7XG5cdH1cblxuXHRvdmVycmlkZSBnZXROYW1lKCk6IHN0cmluZyB7XG5cdFx0cmV0dXJuIGJhc2VuYW1lKHRoaXMucmVzb3VyY2UpO1xuXHR9XG5cblx0LyoqXG5cdCAqIFJldHVybnMgYSBkaXN0aW5jdCBwYXJlbnQtZm9sZGVyIGxhYmVsIHBlciB7QGxpbmsgVmVyYm9zaXR5fSwgbWF0Y2hpbmcgaG93XG5cdCAqIHJlYWwgcmVzb3VyY2UgZWRpdG9yIGlucHV0cyB2YXJ5IHRoZWlyIGRlc2NyaXB0aW9uLiBgTXVsdGlFZGl0b3JUYWJzQ29udHJvbGBcblx0ICogbWFwcyBgbGFiZWxGb3JtYXRgIChzaG9ydC9tZWRpdW0vbG9uZykgdG8gYSB2ZXJib3NpdHksIHNvIGRpc3RpbmN0IHZhbHVlc1xuXHQgKiBoZXJlIGFyZSB3aGF0IG1ha2UgdGhlIGxhYmVsLWZvcm1hdCBmaXh0dXJlcyBkaWZmZXIuXG5cdCAqL1xuXHRvdmVycmlkZSBnZXREZXNjcmlwdGlvbih2ZXJib3NpdHk6IFZlcmJvc2l0eSA9IFZlcmJvc2l0eS5NRURJVU0pOiBzdHJpbmcgfCB1bmRlZmluZWQge1xuXHRcdGNvbnN0IHBhcmVudCA9IGRpcm5hbWUodGhpcy5yZXNvdXJjZSk7XG5cdFx0aWYgKHBhcmVudC5wYXRoID09PSAnLycgfHwgcGFyZW50LnBhdGggPT09ICcuJyB8fCBwYXJlbnQucGF0aCA9PT0gJycpIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXHRcdHN3aXRjaCAodmVyYm9zaXR5KSB7XG5cdFx0XHRjYXNlIFZlcmJvc2l0eS5TSE9SVDpcblx0XHRcdFx0cmV0dXJuIGJhc2VuYW1lKHBhcmVudCk7IC8vIGNvbnRhaW5pbmcgZm9sZGVyIG5hbWVcblx0XHRcdGNhc2UgVmVyYm9zaXR5LkxPTkc6XG5cdFx0XHRcdHJldHVybiBwYXJlbnQucGF0aDsgLy8gZnVsbCBhYnNvbHV0ZSBwYXRoXG5cdFx0XHRjYXNlIFZlcmJvc2l0eS5NRURJVU06XG5cdFx0XHRkZWZhdWx0OlxuXHRcdFx0XHRyZXR1cm4gcGFyZW50LnBhdGgucmVwbGFjZSgvXlxcLy8sICcnKTsgLy8gcGF0aCByZWxhdGl2ZSB0byByb290XG5cdFx0fVxuXHR9XG5cblx0b3ZlcnJpZGUgZ2V0SWNvbigpOiBUaGVtZUljb24gfCBVUkkgfCB1bmRlZmluZWQge1xuXHRcdHJldHVybiB0aGlzLl9vcHRpb25zLmljb247XG5cdH1cblxuXHRvdmVycmlkZSBpc0RpcnR5KCk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiAhIXRoaXMuX29wdGlvbnMuZGlydHk7XG5cdH1cbn1cblxuLy8gPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxuLy8gRWRpdG9yIHNwZWNzIHVzZWQgdG8gcG9wdWxhdGUgdGhlIGdyb3VwIG1vZGVsXG4vLyA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XG5cbmludGVyZmFjZSBJRWRpdG9yU3BlYyB7XG5cdHJlYWRvbmx5IHJlc291cmNlOiBVUkk7XG5cdHJlYWRvbmx5IHR5cGVJZD86IHN0cmluZztcblx0cmVhZG9ubHkgZGlydHk/OiBib29sZWFuO1xuXHRyZWFkb25seSBpY29uPzogVGhlbWVJY29uIHwgVVJJO1xuXHRyZWFkb25seSBjYXBhYmlsaXRpZXM/OiBFZGl0b3JJbnB1dENhcGFiaWxpdGllcztcblx0cmVhZG9ubHkgcGlubmVkPzogYm9vbGVhbjtcblx0cmVhZG9ubHkgc3RpY2t5PzogYm9vbGVhbjtcblx0cmVhZG9ubHkgYWN0aXZlPzogYm9vbGVhbjtcblx0LyoqIEluY2x1ZGUgdGhpcyBlZGl0b3IgaW4gdGhlIG11bHRpLXNlbGVjdGlvbiAodGhlIGFjdGl2ZSBlZGl0b3IgaXMgYWx3YXlzIHNlbGVjdGVkKS4gKi9cblx0cmVhZG9ubHkgc2VsZWN0ZWQ/OiBib29sZWFuO1xufVxuXG5mdW5jdGlvbiBmaWxlKHBhdGg6IHN0cmluZyk6IFVSSSB7XG5cdHJldHVybiBVUkkuZmlsZShwYXRoKTtcbn1cblxuLyoqIEEgdmFyaWVkIHNldCBvZiBlZGl0b3JzOiBkaWZmZXJlbnQgaW5wdXQga2luZHMsIGZpbGUgbmFtZXMgYW5kIGZvbGRlciBwYXRocy4gKi9cbmZ1bmN0aW9uIGRlZmF1bHRFZGl0b3JTcGVjcygpOiBJRWRpdG9yU3BlY1tdIHtcblx0cmV0dXJuIFtcblx0XHR7IHJlc291cmNlOiBmaWxlKCcvcHJvamVjdC9zcmMvYXBwL21haW4udHMnKSwgaWNvbjogVGhlbWVJY29uLmZyb21JZChDb2RpY29uLnN5bWJvbEZpbGUuaWQpLCBzdGlja3k6IHRydWUsIHBpbm5lZDogdHJ1ZSB9LFxuXHRcdHsgcmVzb3VyY2U6IGZpbGUoJy9wcm9qZWN0L3NyYy9hcHAvaW5kZXgudHMnKSwgcGlubmVkOiB0cnVlIH0sXG5cdFx0eyByZXNvdXJjZTogZmlsZSgnL3Byb2plY3QvUkVBRE1FLm1kJyksIGljb246IFRoZW1lSWNvbi5mcm9tSWQoQ29kaWNvbi5tYXJrZG93bi5pZCksIHBpbm5lZDogdHJ1ZSB9LFxuXHRcdHsgcmVzb3VyY2U6IGZpbGUoJy9wcm9qZWN0L3BhY2thZ2UuanNvbicpLCBpY29uOiBUaGVtZUljb24uZnJvbUlkKENvZGljb24uanNvbi5pZCksIHBpbm5lZDogdHJ1ZSwgZGlydHk6IHRydWUsIGFjdGl2ZTogdHJ1ZSB9LFxuXHRcdHsgcmVzb3VyY2U6IFVSSS5mcm9tKHsgc2NoZW1lOiBTY2hlbWFzLnVudGl0bGVkLCBwYXRoOiAnVW50aXRsZWQtMScgfSksIHR5cGVJZDogJ3dvcmtiZW5jaC5lZGl0b3JzLnVudGl0bGVkRml4dHVyZScsIGljb246IFRoZW1lSWNvbi5mcm9tSWQoQ29kaWNvbi5maWxlLmlkKSwgcGlubmVkOiBmYWxzZSAvKiBwcmV2aWV3ICovIH0sXG5cdFx0eyByZXNvdXJjZTogZmlsZSgnL3Byb2plY3QvLnZzY29kZS9zZXR0aW5ncy5qc29uJyksIGljb246IFRoZW1lSWNvbi5mcm9tSWQoQ29kaWNvbi5zZXR0aW5nc0dlYXIuaWQpLCBwaW5uZWQ6IHRydWUgfSxcblx0XHR7IHJlc291cmNlOiBmaWxlKCcvcHJvamVjdC9zcmMvYXBwL2NvbXBvbmVudHMvYnV0dG9uLnRzeCcpLCBwaW5uZWQ6IHRydWUgfSxcblx0XHR7IHJlc291cmNlOiBmaWxlKCcvcHJvamVjdC90ZXN0cy9hcHAvbWFpbi50ZXN0LnRzJyksIHBpbm5lZDogdHJ1ZSB9LFxuXHRdO1xufVxuXG5mdW5jdGlvbiBuZXN0ZWRBY3RpdmVFZGl0b3JTcGVjcygpOiBJRWRpdG9yU3BlY1tdIHtcblx0cmV0dXJuIGRlZmF1bHRFZGl0b3JTcGVjcygpLm1hcCgoc3BlYywgaW5kZXgpID0+ICh7IC4uLnNwZWMsIGFjdGl2ZTogaW5kZXggPT09IDAgfSkpO1xufVxuXG4vKiogVHdvIGVkaXRvcnMgc2hhcmluZyBhIG5hbWUgYnV0IGxpdmluZyBpbiBkaWZmZXJlbnQgZm9sZGVycyAodG8gc2hvdyBkZXNjcmlwdGlvbnMpLiAqL1xuZnVuY3Rpb24gZHVwbGljYXRlTmFtZUVkaXRvclNwZWNzKCk6IElFZGl0b3JTcGVjW10ge1xuXHRyZXR1cm4gW1xuXHRcdHsgcmVzb3VyY2U6IGZpbGUoJy9wcm9qZWN0L3NyYy9hcHAvaW5kZXgudHMnKSwgcGlubmVkOiB0cnVlLCBhY3RpdmU6IHRydWUgfSxcblx0XHR7IHJlc291cmNlOiBmaWxlKCcvcHJvamVjdC9zcmMvbGliL2luZGV4LnRzJyksIHBpbm5lZDogdHJ1ZSB9LFxuXHRcdHsgcmVzb3VyY2U6IGZpbGUoJy9wcm9qZWN0L3NyYy9saWIvdXRpbC9pbmRleC50cycpLCBwaW5uZWQ6IHRydWUgfSxcblx0XHR7IHJlc291cmNlOiBmaWxlKCcvcHJvamVjdC90ZXN0cy9pbmRleC50cycpLCBwaW5uZWQ6IHRydWUgfSxcblx0XTtcbn1cblxuLyoqIEEgbGFyZ2VyIHNldCBvZiBlZGl0b3JzLCB1c2VmdWwgZm9yIHdyYXBwaW5nIC8gc2Nyb2xsYmFyIC8gbGFiZWwgdmFyaWFudHMuICovXG5mdW5jdGlvbiBtYW55RWRpdG9yU3BlY3MoKTogSUVkaXRvclNwZWNbXSB7XG5cdGNvbnN0IG5hbWVzID0gW1xuXHRcdCdtYWluLnRzJywgJ2luZGV4LnRzJywgJ2J1dHRvbi50c3gnLCAnaW5wdXQudHN4JywgJ2xpc3QudHN4JywgJ3RyZWUudHN4Jyxcblx0XHQnbW9kZWwudHMnLCAnc2VydmljZS50cycsICd2aWV3LnRzJywgJ2NvbnRyb2xsZXIudHMnLCAndXRpbHMudHMnLCAndHlwZXMudHMnLFxuXHRcdCdhcHAuY3NzJywgJ3RoZW1lLmNzcycsICdSRUFETUUubWQnLCAncGFja2FnZS5qc29uJyxcblx0XTtcblx0cmV0dXJuIG5hbWVzLm1hcCgobmFtZSwgaW5kZXgpID0+ICh7XG5cdFx0cmVzb3VyY2U6IGZpbGUoYC9wcm9qZWN0L3NyYy9tb2R1bGUke2luZGV4ICUgNH0vJHtuYW1lfWApLFxuXHRcdHBpbm5lZDogdHJ1ZSxcblx0XHRhY3RpdmU6IGluZGV4ID09PSAwLFxuXHRcdGRpcnR5OiBpbmRleCAlIDUgPT09IDAsXG5cdH0pKTtcbn1cblxuLyoqIEVkaXRvcnMgd2l0aCBkaXJ0eSBzdGF0ZSB0byBzaG93IG1vZGlmaWVkIGluZGljYXRvcnMuICovXG5mdW5jdGlvbiBkaXJ0eUVkaXRvclNwZWNzKCk6IElFZGl0b3JTcGVjW10ge1xuXHRyZXR1cm4gW1xuXHRcdHsgcmVzb3VyY2U6IGZpbGUoJy9wcm9qZWN0L3NyYy9hcHAvbWFpbi50cycpLCBwaW5uZWQ6IHRydWUsIGRpcnR5OiB0cnVlLCBhY3RpdmU6IHRydWUgfSxcblx0XHR7IHJlc291cmNlOiBmaWxlKCcvcHJvamVjdC9zcmMvYXBwL2luZGV4LnRzJyksIHBpbm5lZDogdHJ1ZSwgZGlydHk6IHRydWUgfSxcblx0XHR7IHJlc291cmNlOiBmaWxlKCcvcHJvamVjdC9SRUFETUUubWQnKSwgcGlubmVkOiB0cnVlIH0sXG5cdFx0eyByZXNvdXJjZTogZmlsZSgnL3Byb2plY3QvcGFja2FnZS5qc29uJyksIHBpbm5lZDogdHJ1ZSwgZGlydHk6IHRydWUgfSxcblx0XTtcbn1cblxuLyoqXG4gKiBBIG1peCBvZiBjbGVhbiwgZGlydHkgYW5kIHN0aWNreSB0YWJzIHVzZWQgdG8gc2hvdyBgdGFiQWN0aW9uUmVzZXJ2ZVNwYWNlYDpcbiAqIGNsZWFuIHRhYnMgY29sbGFwc2UgdG8gdGhlIGNvbXBhY3Qgd2lkdGggd2hlbiB0aGUgY29sdW1uIGlzIG5vdCByZXNlcnZlZCxcbiAqIHdoaWxlIHRoZSBkaXJ0eSBhbmQgc3RpY2t5IHRhYnMga2VlcCB0aGVpciBwZXJzaXN0ZW50LWluZGljYXRvciBjb2x1bW4uXG4gKi9cbmZ1bmN0aW9uIHJlc2VydmVTcGFjZUVkaXRvclNwZWNzKCk6IElFZGl0b3JTcGVjW10ge1xuXHRyZXR1cm4gW1xuXHRcdHsgcmVzb3VyY2U6IGZpbGUoJy9wcm9qZWN0L3NyYy9hcHAvbWFpbi50cycpLCBpY29uOiBUaGVtZUljb24uZnJvbUlkKENvZGljb24uc3ltYm9sRmlsZS5pZCksIHN0aWNreTogdHJ1ZSwgcGlubmVkOiB0cnVlIH0sXG5cdFx0eyByZXNvdXJjZTogZmlsZSgnL3Byb2plY3Qvc3JjL2FwcC9pbmRleC50cycpLCBwaW5uZWQ6IHRydWUgfSxcblx0XHR7IHJlc291cmNlOiBmaWxlKCcvcHJvamVjdC9SRUFETUUubWQnKSwgaWNvbjogVGhlbWVJY29uLmZyb21JZChDb2RpY29uLm1hcmtkb3duLmlkKSwgcGlubmVkOiB0cnVlIH0sXG5cdFx0eyByZXNvdXJjZTogZmlsZSgnL3Byb2plY3QvcGFja2FnZS5qc29uJyksIGljb246IFRoZW1lSWNvbi5mcm9tSWQoQ29kaWNvbi5qc29uLmlkKSwgcGlubmVkOiB0cnVlLCBkaXJ0eTogdHJ1ZSwgYWN0aXZlOiB0cnVlIH0sXG5cdFx0eyByZXNvdXJjZTogZmlsZSgnL3Byb2plY3Qvc3JjL2FwcC9jb21wb25lbnRzL2J1dHRvbi50c3gnKSwgcGlubmVkOiB0cnVlIH0sXG5cdF07XG59XG5cbi8qKiBTdGlja3kgKHBpbm5lZCkgZWRpdG9ycyB0byBzaG93IHRoZSBzdGlja3kgdGFiIHN0eWxpbmcuICovXG5mdW5jdGlvbiBzdGlja3lFZGl0b3JTcGVjcygpOiBJRWRpdG9yU3BlY1tdIHtcblx0cmV0dXJuIFtcblx0XHR7IHJlc291cmNlOiBmaWxlKCcvcHJvamVjdC9zcmMvYXBwL21haW4udHMnKSwgaWNvbjogVGhlbWVJY29uLmZyb21JZChDb2RpY29uLnN5bWJvbEZpbGUuaWQpLCBzdGlja3k6IHRydWUsIHBpbm5lZDogdHJ1ZSB9LFxuXHRcdHsgcmVzb3VyY2U6IGZpbGUoJy9wcm9qZWN0L1JFQURNRS5tZCcpLCBpY29uOiBUaGVtZUljb24uZnJvbUlkKENvZGljb24ubWFya2Rvd24uaWQpLCBzdGlja3k6IHRydWUsIHBpbm5lZDogdHJ1ZSB9LFxuXHRcdHsgcmVzb3VyY2U6IGZpbGUoJy9wcm9qZWN0L3BhY2thZ2UuanNvbicpLCBpY29uOiBUaGVtZUljb24uZnJvbUlkKENvZGljb24uanNvbi5pZCksIHN0aWNreTogdHJ1ZSwgcGlubmVkOiB0cnVlIH0sXG5cdFx0eyByZXNvdXJjZTogZmlsZSgnL3Byb2plY3Qvc3JjL2FwcC9pbmRleC50cycpLCBwaW5uZWQ6IHRydWUsIGFjdGl2ZTogdHJ1ZSB9LFxuXHRcdHsgcmVzb3VyY2U6IGZpbGUoJy9wcm9qZWN0L3NyYy9hcHAvY29tcG9uZW50cy9idXR0b24udHN4JyksIHBpbm5lZDogdHJ1ZSB9LFxuXHRdO1xufVxuXG5mdW5jdGlvbiBhbGxTdGlja3lFZGl0b3JTcGVjcygpOiBJRWRpdG9yU3BlY1tdIHtcblx0cmV0dXJuIHN0aWNreUVkaXRvclNwZWNzKCkubWFwKChzcGVjLCBpbmRleCkgPT4gKHsgLi4uc3BlYywgc3RpY2t5OiB0cnVlLCBhY3RpdmU6IGluZGV4ID09PSAwIH0pKTtcbn1cblxuZnVuY3Rpb24gYWxsVW5zdGlja3lFZGl0b3JTcGVjcygpOiBJRWRpdG9yU3BlY1tdIHtcblx0cmV0dXJuIHN0aWNreUVkaXRvclNwZWNzKCkubWFwKChzcGVjLCBpbmRleCkgPT4gKHsgLi4uc3BlYywgc3RpY2t5OiBmYWxzZSwgYWN0aXZlOiBpbmRleCA9PT0gMCB9KSk7XG59XG5cbi8qKiBFZGl0b3JzIHdpdGggc2V2ZXJhbCB0YWJzIGluIHRoZSBtdWx0aS1zZWxlY3Rpb24gKGFjdGl2ZSArIGFkZGl0aW9uYWwgc2VsZWN0ZWQpLiAqL1xuZnVuY3Rpb24gbXVsdGlTZWxlY3RFZGl0b3JTcGVjcygpOiBJRWRpdG9yU3BlY1tdIHtcblx0cmV0dXJuIFtcblx0XHR7IHJlc291cmNlOiBmaWxlKCcvcHJvamVjdC9zcmMvYXBwL21haW4udHMnKSwgaWNvbjogVGhlbWVJY29uLmZyb21JZChDb2RpY29uLnN5bWJvbEZpbGUuaWQpLCBwaW5uZWQ6IHRydWUsIHNlbGVjdGVkOiB0cnVlIH0sXG5cdFx0eyByZXNvdXJjZTogZmlsZSgnL3Byb2plY3Qvc3JjL2FwcC9pbmRleC50cycpLCBwaW5uZWQ6IHRydWUgfSxcblx0XHR7IHJlc291cmNlOiBmaWxlKCcvcHJvamVjdC9SRUFETUUubWQnKSwgaWNvbjogVGhlbWVJY29uLmZyb21JZChDb2RpY29uLm1hcmtkb3duLmlkKSwgcGlubmVkOiB0cnVlLCBzZWxlY3RlZDogdHJ1ZSB9LFxuXHRcdHsgcmVzb3VyY2U6IGZpbGUoJy9wcm9qZWN0L3BhY2thZ2UuanNvbicpLCBpY29uOiBUaGVtZUljb24uZnJvbUlkKENvZGljb24uanNvbi5pZCksIHBpbm5lZDogdHJ1ZSwgZGlydHk6IHRydWUsIGFjdGl2ZTogdHJ1ZSwgc2VsZWN0ZWQ6IHRydWUgfSxcblx0XHR7IHJlc291cmNlOiBmaWxlKCcvcHJvamVjdC9zcmMvYXBwL2NvbXBvbmVudHMvYnV0dG9uLnRzeCcpLCBwaW5uZWQ6IHRydWUgfSxcblx0XHR7IHJlc291cmNlOiBmaWxlKCcvcHJvamVjdC90ZXN0cy9hcHAvbWFpbi50ZXN0LnRzJyksIHBpbm5lZDogdHJ1ZSwgc2VsZWN0ZWQ6IHRydWUgfSxcblx0XTtcbn1cblxuLyoqIEVkaXRvcnMgd2l0aCB2ZXJ5IGxvbmcgbmFtZXMvcGF0aHMgdG8gZXhlcmNpc2UgdGFiLWxhYmVsIHRydW5jYXRpb24gYW5kIGVsbGlwc2lzLiAqL1xuZnVuY3Rpb24gbG9uZ0xhYmVsRWRpdG9yU3BlY3MoKTogSUVkaXRvclNwZWNbXSB7XG5cdHJldHVybiBbXG5cdFx0eyByZXNvdXJjZTogZmlsZSgnL3Byb2plY3Qvc3JjL2ZlYXR1cmVzL2F1dGhlbnRpY2F0aW9uL3Byb3ZpZGVycy92ZXJ5TG9uZ0F1dGhlbnRpY2F0aW9uUHJvdmlkZXJJbXBsZW1lbnRhdGlvbi50cycpLCBwaW5uZWQ6IHRydWUsIGFjdGl2ZTogdHJ1ZSB9LFxuXHRcdHsgcmVzb3VyY2U6IGZpbGUoJy9wcm9qZWN0L3NyYy9mZWF0dXJlcy9hdXRoZW50aWNhdGlvbi9wcm92aWRlcnMvYW5vdGhlckV4dHJlbWVseUxvbmdQcm92aWRlckZhY3RvcnlNb2R1bGUudHMnKSwgcGlubmVkOiB0cnVlIH0sXG5cdFx0eyByZXNvdXJjZTogZmlsZSgnL3Byb2plY3QvZG9jdW1lbnRhdGlvbi9hcmNoaXRlY3R1cmUvZGVjaXNpb25zLzAwMDEtdXNlLWEtcmVhbGx5LWxvbmctZGVzY3JpcHRpdmUtZmlsZS1uYW1lLm1kJyksIGljb246IFRoZW1lSWNvbi5mcm9tSWQoQ29kaWNvbi5tYXJrZG93bi5pZCksIHBpbm5lZDogdHJ1ZSB9LFxuXHRdO1xufVxuXG4vKiogQSBzaW5nbGUgZGlydHksIHBpbm5lZCBlZGl0b3IgZm9yIHRoZSBzaW5nbGUtdGFiIGNvbnRyb2wuICovXG5mdW5jdGlvbiBzaW5nbGVEaXJ0eUVkaXRvclNwZWNzKCk6IElFZGl0b3JTcGVjW10ge1xuXHRyZXR1cm4gW1xuXHRcdHsgcmVzb3VyY2U6IGZpbGUoJy9wcm9qZWN0L3NyYy9hcHAvbWFpbi50cycpLCBpY29uOiBUaGVtZUljb24uZnJvbUlkKENvZGljb24uc3ltYm9sRmlsZS5pZCksIHBpbm5lZDogdHJ1ZSwgZGlydHk6IHRydWUsIGFjdGl2ZTogdHJ1ZSB9LFxuXHRdO1xufVxuXG5mdW5jdGlvbiBjYW5ub3RDbG9zZUVkaXRvclNwZWNzKCk6IElFZGl0b3JTcGVjW10ge1xuXHRyZXR1cm4gW1xuXHRcdHsgcmVzb3VyY2U6IGZpbGUoJy9wcm9qZWN0L0NoYW5nZXMnKSwgY2FwYWJpbGl0aWVzOiBFZGl0b3JJbnB1dENhcGFiaWxpdGllcy5DYW5ub3RDbG9zZSwgcGlubmVkOiB0cnVlLCBhY3RpdmU6IHRydWUgfSxcblx0XHR7IHJlc291cmNlOiBmaWxlKCcvcHJvamVjdC9zcmMvYXBwL21haW4udHMnKSwgcGlubmVkOiB0cnVlIH0sXG5cdFx0eyByZXNvdXJjZTogZmlsZSgnL3Byb2plY3QvUkVBRE1FLm1kJyksIGljb246IFRoZW1lSWNvbi5mcm9tSWQoQ29kaWNvbi5tYXJrZG93bi5pZCksIHBpbm5lZDogdHJ1ZSB9LFxuXHRdO1xufVxuXG5mdW5jdGlvbiBjYW5ub3RDbG9zZURpcnR5RWRpdG9yU3BlY3MoKTogSUVkaXRvclNwZWNbXSB7XG5cdHJldHVybiBbXG5cdFx0eyByZXNvdXJjZTogZmlsZSgnL3Byb2plY3QvQ2hhbmdlcycpLCBjYXBhYmlsaXRpZXM6IEVkaXRvcklucHV0Q2FwYWJpbGl0aWVzLkNhbm5vdENsb3NlLCBwaW5uZWQ6IHRydWUsIGRpcnR5OiB0cnVlLCBhY3RpdmU6IHRydWUgfSxcblx0XHR7IHJlc291cmNlOiBmaWxlKCcvcHJvamVjdC9zcmMvYXBwL21haW4udHMnKSwgcGlubmVkOiB0cnVlIH0sXG5cdF07XG59XG5cbmZ1bmN0aW9uIGNhbm5vdENsb3NlU3RpY2t5RWRpdG9yU3BlY3MoKTogSUVkaXRvclNwZWNbXSB7XG5cdHJldHVybiBbXG5cdFx0eyByZXNvdXJjZTogZmlsZSgnL3Byb2plY3QvQ2hhbmdlcycpLCBjYXBhYmlsaXRpZXM6IEVkaXRvcklucHV0Q2FwYWJpbGl0aWVzLkNhbm5vdENsb3NlLCBwaW5uZWQ6IHRydWUsIHN0aWNreTogdHJ1ZSwgYWN0aXZlOiB0cnVlIH0sXG5cdFx0eyByZXNvdXJjZTogZmlsZSgnL3Byb2plY3Qvc3JjL2FwcC9tYWluLnRzJyksIHBpbm5lZDogdHJ1ZSB9LFxuXHRdO1xufVxuXG4vLyA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XG4vLyBGaWxlIGRlY29yYXRpb25zXG4vLyA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XG5cbi8qKlxuICogRGV0ZXJtaW5pc3RpYyBmaWxlIGRlY29yYXRpb25zIChiYWRnZSBsZXR0ZXIgKyBjb2xvcikga2V5ZWQgYnkgcmVzb3VyY2UgcGF0aC5cbiAqIFRoZXNlIGRyaXZlIHRoZSByZXNvdXJjZS1sYWJlbCBiYWRnZXMvY29sb3JzIHRoYXQgdGhlIGBkZWNvcmF0aW9uc2Agc2V0dGluZ1xuICogdG9nZ2xlcyBcdTIwMTQgZGlydHkgc3RhdGUgYWxvbmUgb25seSBhZmZlY3RzIHRoZSBzZXBhcmF0ZSBtb2RpZmllZC10YWIgaW5kaWNhdG9yLlxuICovXG5jb25zdCBGSVhUVVJFX0RFQ09SQVRJT05TID0gbmV3IE1hcDxzdHJpbmcsIElEZWNvcmF0aW9uRGF0YT4oW1xuXHRbJy9wcm9qZWN0L3BhY2thZ2UuanNvbicsIHsgd2VpZ2h0OiAxMCwgbGV0dGVyOiAnTScsIGNvbG9yOiBsaXN0V2FybmluZ0ZvcmVncm91bmQsIHRvb2x0aXA6ICdNb2RpZmllZCcsIGJ1YmJsZTogZmFsc2UgfV0sXG5cdFsnL3Byb2plY3Qvc3JjL2FwcC9tYWluLnRzJywgeyB3ZWlnaHQ6IDIwLCBsZXR0ZXI6ICcyJywgY29sb3I6IGxpc3RFcnJvckZvcmVncm91bmQsIHRvb2x0aXA6ICcyIHByb2JsZW1zJywgYnViYmxlOiBmYWxzZSB9XSxcblx0WycvcHJvamVjdC9zcmMvYXBwL2luZGV4LnRzJywgeyB3ZWlnaHQ6IDIwLCBsZXR0ZXI6ICdVJywgY29sb3I6IGxpc3RXYXJuaW5nRm9yZWdyb3VuZCwgdG9vbHRpcDogJ1VudHJhY2tlZCcsIGJ1YmJsZTogZmFsc2UgfV0sXG5dKTtcblxuZnVuY3Rpb24gcmVnaXN0ZXJGaXh0dXJlRGVjb3JhdGlvbnMoZGVjb3JhdGlvbnNTZXJ2aWNlOiBJRGVjb3JhdGlvbnNTZXJ2aWNlLCBzdG9yZTogRGlzcG9zYWJsZVN0b3JlKTogdm9pZCB7XG5cdGNvbnN0IHByb3ZpZGVyOiBJRGVjb3JhdGlvbnNQcm92aWRlciA9IHtcblx0XHRsYWJlbDogJ0ZpeHR1cmUgRGVjb3JhdGlvbnMnLFxuXHRcdG9uRGlkQ2hhbmdlOiBFdmVudC5Ob25lLFxuXHRcdHByb3ZpZGVEZWNvcmF0aW9ucyh1cmk6IFVSSSwgX3Rva2VuOiBDYW5jZWxsYXRpb25Ub2tlbik6IElEZWNvcmF0aW9uRGF0YSB8IHVuZGVmaW5lZCB7XG5cdFx0XHRyZXR1cm4gRklYVFVSRV9ERUNPUkFUSU9OUy5nZXQodXJpLnBhdGgpO1xuXHRcdH0sXG5cdH07XG5cdHN0b3JlLmFkZChkZWNvcmF0aW9uc1NlcnZpY2UucmVnaXN0ZXJEZWNvcmF0aW9uc1Byb3ZpZGVyKHByb3ZpZGVyKSk7XG59XG5cbi8vID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT1cbi8vIEVkaXRvci10aXRsZSB0b29sYmFyIGFjdGlvbnNcbi8vID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT1cblxuZnVuY3Rpb24gY3JlYXRlRml4dHVyZUVkaXRvclRpdGxlQWN0aW9ucyhzdG9yZTogRGlzcG9zYWJsZVN0b3JlLCBtZW51SWQ6IE1lbnVJZCk6IElUb29sYmFyQWN0aW9ucyB7XG5cdGlmIChtZW51SWQgIT09IE1lbnVJZC5FZGl0b3JUaXRsZSkge1xuXHRcdHJldHVybiB7IHByaW1hcnk6IFtdLCBzZWNvbmRhcnk6IFtdIH07XG5cdH1cblxuXHRyZXR1cm4ge1xuXHRcdHByaW1hcnk6IFtcblx0XHRcdHN0b3JlLmFkZChuZXcgQWN0aW9uKFxuXHRcdFx0XHQnZml4dHVyZS5zcGxpdEVkaXRvclJpZ2h0Jyxcblx0XHRcdFx0bG9jYWxpemUoJ2ZpeHR1cmVTcGxpdEVkaXRvclJpZ2h0JywgXCJTcGxpdCBFZGl0b3IgUmlnaHRcIiksXG5cdFx0XHRcdFRoZW1lSWNvbi5hc0NsYXNzTmFtZShDb2RpY29uLnNwbGl0SG9yaXpvbnRhbClcblx0XHRcdCkpXG5cdFx0XSxcblx0XHRzZWNvbmRhcnk6IFtcblx0XHRcdHN0b3JlLmFkZChuZXcgQWN0aW9uKFxuXHRcdFx0XHQnZml4dHVyZS5vcGVuRWRpdG9yJyxcblx0XHRcdFx0bG9jYWxpemUoJ2ZpeHR1cmVPcGVuRWRpdG9yJywgXCJPcGVuIEVkaXRvci4uLlwiKSxcblx0XHRcdFx0VGhlbWVJY29uLmFzQ2xhc3NOYW1lKENvZGljb24uZ29Ub0ZpbGUpXG5cdFx0XHQpKVxuXHRcdF1cblx0fTtcbn1cblxuLy8gPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxuLy8gUmVuZGVyaW5nXG4vLyA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XG5cbmV4cG9ydCBpbnRlcmZhY2UgSUVkaXRvclRhYkJhckZpeHR1cmVPcHRpb25zIHtcblx0cmVhZG9ubHkgbW9kZXJuVUk6IGJvb2xlYW47XG5cdHJlYWRvbmx5IHBhcnRPcHRpb25zPzogUGFydGlhbDxJRWRpdG9yUGFydE9wdGlvbnM+O1xuXHRyZWFkb25seSBlZGl0b3JzPzogSUVkaXRvclNwZWNbXTtcblx0cmVhZG9ubHkgYnJlYWRjcnVtYnM/OiB7XG5cdFx0cmVhZG9ubHkgZmlsZVBhdGg/OiAnb24nIHwgJ29mZicgfCAnbGFzdCc7XG5cdFx0cmVhZG9ubHkgaWNvbnM/OiBib29sZWFuO1xuXHR9O1xuXHRyZWFkb25seSB3aWR0aD86IG51bWJlcjtcblx0LyoqIFdoZXRoZXIgdGhpcyBncm91cCBpcyB0aGUgYWN0aXZlIGdyb3VwLiBJbmFjdGl2ZSBncm91cHMgZXhlcmNpc2UgdGhlXG5cdCAqICBgYWx3YXlzU2hvd0VkaXRvckFjdGlvbnNgIGZpbHRlcmluZyBhbmQgdW5mb2N1c2VkIHRhYiBzdHlsaW5nLiAqL1xuXHRyZWFkb25seSBhY3RpdmU/OiBib29sZWFuO1xuXHRyZWFkb25seSBkcm9wVGFyZ2V0QmV0d2VlblRhYnM/OiBib29sZWFuO1xuXHRyZWFkb25seSBzaG93SGVhZGVyPzogYm9vbGVhbjtcblx0cmVhZG9ubHkgaGVhZGVyTWVudUlkcz86IElFZGl0b3JHcm91cE1lbnVJZHM7XG5cdHJlYWRvbmx5IGNvbG9yQ3VzdG9taXphdGlvbnM/OiBSZWFkb25seTxSZWNvcmQ8c3RyaW5nLCBzdHJpbmc+Pjtcblx0cmVhZG9ubHkgZm9yY2VkSG92ZXJUYWI/OiBudW1iZXI7XG5cdHJlYWRvbmx5IGZvY3VzZWRUYWJBY3Rpb24/OiBudW1iZXI7XG59XG5cbmZ1bmN0aW9uIGNyZWF0ZVBhcnRPcHRpb25zKG92ZXJyaWRlcz86IFBhcnRpYWw8SUVkaXRvclBhcnRPcHRpb25zPik6IElFZGl0b3JQYXJ0T3B0aW9ucyB7XG5cdHJldHVybiB7XG5cdFx0Li4uREVGQVVMVF9FRElUT1JfUEFSVF9PUFRJT05TLFxuXHRcdGhhc0ljb25zOiB0cnVlLFxuXHRcdC4uLm92ZXJyaWRlcyxcblx0fTtcbn1cblxuZnVuY3Rpb24gcG9wdWxhdGVNb2RlbChtb2RlbDogRWRpdG9yR3JvdXBNb2RlbCwgc3BlY3M6IElFZGl0b3JTcGVjW10sIGRpc3Bvc2FibGVTdG9yZTogRGlzcG9zYWJsZVN0b3JlKTogdm9pZCB7XG5cdC8vIE9wZW4gc3RpY2t5IGVkaXRvcnMgZmlyc3Qgc28gdGhlaXIgaW5kaWNlcyBzdGF5IGF0IHRoZSBmcm9udC5cblx0Y29uc3Qgb3JkZXJlZCA9IFsuLi5zcGVjc10uc29ydCgoYSwgYikgPT4gKGEuc3RpY2t5ID09PSBiLnN0aWNreSkgPyAwIDogYS5zdGlja3kgPyAtMSA6IDEpO1xuXHRjb25zdCBpbnB1dEJ5U3BlYyA9IG5ldyBNYXA8SUVkaXRvclNwZWMsIEZpeHR1cmVFZGl0b3JJbnB1dD4oKTtcblx0Zm9yIChjb25zdCBzcGVjIG9mIG9yZGVyZWQpIHtcblx0XHRjb25zdCBpbnB1dCA9IGRpc3Bvc2FibGVTdG9yZS5hZGQobmV3IEZpeHR1cmVFZGl0b3JJbnB1dChzcGVjLnJlc291cmNlLCB7XG5cdFx0XHR0eXBlSWQ6IHNwZWMudHlwZUlkLFxuXHRcdFx0ZGlydHk6IHNwZWMuZGlydHksXG5cdFx0XHRpY29uOiBzcGVjLmljb24sXG5cdFx0XHRjYXBhYmlsaXRpZXM6IHNwZWMuY2FwYWJpbGl0aWVzLFxuXHRcdH0pKTtcblx0XHRpbnB1dEJ5U3BlYy5zZXQoc3BlYywgaW5wdXQpO1xuXHRcdG1vZGVsLm9wZW5FZGl0b3IoaW5wdXQsIHtcblx0XHRcdHBpbm5lZDogc3BlYy5waW5uZWQgPz8gdHJ1ZSxcblx0XHRcdHN0aWNreTogc3BlYy5zdGlja3ksXG5cdFx0XHRhY3RpdmU6IHNwZWMuYWN0aXZlLFxuXHRcdH0pO1xuXHR9XG5cblx0Ly8gQXBwbHkgbXVsdGktc2VsZWN0aW9uOiB0aGUgYWN0aXZlIGVkaXRvciBwbHVzIGFueSBhZGRpdGlvbmFsbHkgc2VsZWN0ZWQgb25lcy5cblx0Y29uc3QgaW5hY3RpdmVTZWxlY3RlZCA9IG9yZGVyZWQuZmlsdGVyKHNwZWMgPT4gc3BlYy5zZWxlY3RlZCAmJiAhc3BlYy5hY3RpdmUpLm1hcChzcGVjID0+IGlucHV0QnlTcGVjLmdldChzcGVjKSEpO1xuXHRpZiAoaW5hY3RpdmVTZWxlY3RlZC5sZW5ndGggJiYgbW9kZWwuYWN0aXZlRWRpdG9yKSB7XG5cdFx0bW9kZWwuc2V0U2VsZWN0aW9uKG1vZGVsLmFjdGl2ZUVkaXRvciwgaW5hY3RpdmVTZWxlY3RlZCk7XG5cdH1cbn1cblxuZXhwb3J0IGZ1bmN0aW9uIHJlbmRlckVkaXRvclRhYkJhckZpeHR1cmUoY3R4OiBDb21wb25lbnRGaXh0dXJlQ29udGV4dCwgb3B0aW9uczogSUVkaXRvclRhYkJhckZpeHR1cmVPcHRpb25zKTogdm9pZCB7XG5cdGNvbnN0IHsgY29udGFpbmVyLCBkaXNwb3NhYmxlU3RvcmUsIHRoZW1lIH0gPSBjdHg7XG5cblx0Y29uc3Qgd2lkdGggPSBvcHRpb25zLndpZHRoID8/IDgyMDtcblx0Y29uc3QgaXNHcm91cEFjdGl2ZSA9IG9wdGlvbnMuYWN0aXZlID8/IHRydWU7XG5cdGNvbnN0IHBhcnRPcHRpb25zID0gY3JlYXRlUGFydE9wdGlvbnMob3B0aW9ucy5wYXJ0T3B0aW9ucyk7XG5cblx0Zm9yIChjb25zdCBbY29sb3JJZCwgY29sb3JdIG9mIE9iamVjdC5lbnRyaWVzKG9wdGlvbnMuY29sb3JDdXN0b21pemF0aW9ucyA/PyB7fSkpIHtcblx0XHRjb250YWluZXIuc3R5bGUuc2V0UHJvcGVydHkoYXNDc3NWYXJpYWJsZU5hbWUoY29sb3JJZCksIGNvbG9yKTtcblx0fVxuXG5cdGNvbnN0IGNvbmZpZ3VyYXRpb25TZXJ2aWNlID0gbmV3IFRlc3RDb25maWd1cmF0aW9uU2VydmljZSgpO1xuXHRjb25maWd1cmF0aW9uU2VydmljZS5zZXRVc2VyQ29uZmlndXJhdGlvbignYnJlYWRjcnVtYnMnLCB7XG5cdFx0ZW5hYmxlZDogQm9vbGVhbihvcHRpb25zLmJyZWFkY3J1bWJzKSxcblx0XHRmaWxlUGF0aDogb3B0aW9ucy5icmVhZGNydW1icz8uZmlsZVBhdGggPz8gJ29uJyxcblx0XHRzeW1ib2xQYXRoOiAnb2ZmJyxcblx0XHRpY29uczogb3B0aW9ucy5icmVhZGNydW1icz8uaWNvbnMgPz8gdHJ1ZSxcblx0fSk7XG5cdGNvbmZpZ3VyYXRpb25TZXJ2aWNlLnNldFVzZXJDb25maWd1cmF0aW9uKExheW91dFNldHRpbmdzLk1PREVSTl9VSSwgb3B0aW9ucy5tb2Rlcm5VSSk7XG5cblx0Y29uc3QgaW5zdGFudGlhdGlvblNlcnZpY2UgPSB3b3JrYmVuY2hJbnN0YW50aWF0aW9uU2VydmljZSh7XG5cdFx0Y29uZmlndXJhdGlvblNlcnZpY2U6ICgpID0+IGNvbmZpZ3VyYXRpb25TZXJ2aWNlLFxuXHR9LCBkaXNwb3NhYmxlU3RvcmUpO1xuXG5cdC8vIEZlZWQgdGhlIGZpeHR1cmUncyB0aGVtZWQgY29sb3JzIHRvIHRoZSBzaGFyZWQgdGhlbWUgc2VydmljZSBzbyB0YWItYmFyIGBnZXRDb2xvciguLi4pYCByZXNvbHZlcy5cblx0KGluc3RhbnRpYXRpb25TZXJ2aWNlLmdldChJVGhlbWVTZXJ2aWNlKSBhcyBUZXN0VGhlbWVTZXJ2aWNlKS5zZXRUaGVtZSh0aGVtZSk7XG5cblx0Ly8gU2VydmljZXMgdGhlIGJhc2Ugd29ya2JlbmNoIGhhcm5lc3MgZG9lcyBub3Qgc3R1YiBidXQgdGhlIHRhYiBiYXIgbmVlZHMuXG5cdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSVRyZWVWaWV3c0RuRFNlcnZpY2UsIG5ldyBUcmVlVmlld3NEbkRTZXJ2aWNlKCkpO1xuXHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElOb3RlYm9va0RvY3VtZW50U2VydmljZSwgbmV3IE5vdGVib29rRG9jdW1lbnRXb3JrYmVuY2hTZXJ2aWNlKCkpO1xuXG5cdGNvbnN0IGNvbnRleHRLZXlTZXJ2aWNlID0gZGlzcG9zYWJsZVN0b3JlLmFkZChpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShDb250ZXh0S2V5U2VydmljZSkpO1xuXHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElDb250ZXh0S2V5U2VydmljZSwgY29udGV4dEtleVNlcnZpY2UpO1xuXG5cdGlmIChvcHRpb25zLmhlYWRlck1lbnVJZHMpIHtcblx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElNZW51U2VydmljZSwgZGlzcG9zYWJsZVN0b3JlLmFkZChpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShNZW51U2VydmljZSkpKTtcblx0fVxuXG5cdGlmIChvcHRpb25zLmJyZWFkY3J1bWJzKSB7XG5cdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJQnJlYWRjcnVtYnNTZXJ2aWNlLCBuZXcgQnJlYWRjcnVtYnNTZXJ2aWNlKCkpO1xuXHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSU91dGxpbmVTZXJ2aWNlLCBuZXcgY2xhc3MgZXh0ZW5kcyBtb2NrPElPdXRsaW5lU2VydmljZT4oKSB7IH0oKSk7XG5cdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJV29ya3NwYWNlQ29udGV4dFNlcnZpY2UsIG5ldyBUZXN0Q29udGV4dFNlcnZpY2UodGVzdFdvcmtzcGFjZShmaWxlKCcvcHJvamVjdCcpKSkpO1xuXHR9XG5cblx0Ly8gUmVhbCBkZWNvcmF0aW9ucyBzZXJ2aWNlICsgcHJvdmlkZXIgc28gcmVzb3VyY2UgbGFiZWxzIGdldCBkZXRlcm1pbmlzdGljIGJhZGdlcy9jb2xvcnNcblx0Ly8gKHRoZSBgZGVjb3JhdGlvbnNgIHNldHRpbmcgdGhlbiBoYXMgc29tZXRoaW5nIHRvIHRvZ2dsZSkuXG5cdGNvbnN0IGRlY29yYXRpb25zU2VydmljZSA9IGRpc3Bvc2FibGVTdG9yZS5hZGQoaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoRGVjb3JhdGlvbnNTZXJ2aWNlKSk7XG5cdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSURlY29yYXRpb25zU2VydmljZSwgZGVjb3JhdGlvbnNTZXJ2aWNlKTtcblx0cmVnaXN0ZXJGaXh0dXJlRGVjb3JhdGlvbnMoZGVjb3JhdGlvbnNTZXJ2aWNlLCBkaXNwb3NhYmxlU3RvcmUpO1xuXG5cdC8vIFJlYWwgZWRpdG9yIGdyb3VwIG1vZGVsIHBvcHVsYXRlZCB3aXRoIHRoZSBmaXh0dXJlIGVkaXRvcnMuXG5cdGNvbnN0IG1vZGVsID0gZGlzcG9zYWJsZVN0b3JlLmFkZChpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShFZGl0b3JHcm91cE1vZGVsLCB1bmRlZmluZWQpKTtcblx0cG9wdWxhdGVNb2RlbChtb2RlbCwgb3B0aW9ucy5lZGl0b3JzID8/IGRlZmF1bHRFZGl0b3JTcGVjcygpLCBkaXNwb3NhYmxlU3RvcmUpO1xuXG5cdGNvbnN0IGNyZWF0ZUVkaXRvckFjdGlvbnMgPSAoZGlzcG9zYWJsZXM6IERpc3Bvc2FibGVTdG9yZSwgbWVudUlkOiBNZW51SWQpID0+IHtcblx0XHRyZXR1cm4geyBhY3Rpb25zOiBjcmVhdGVGaXh0dXJlRWRpdG9yVGl0bGVBY3Rpb25zKGRpc3Bvc2FibGVzLCBtZW51SWQpLCBvbkRpZENoYW5nZTogRXZlbnQuTm9uZSB9O1xuXHR9O1xuXG5cdC8vIExpZ2h0d2VpZ2h0IHN0YW5kLWlucyBmb3IgdGhlIHByb2R1Y3Rpb24gYEVkaXRvckdyb3VwVmlld2AgLyBgRWRpdG9yUGFydGAgdmlld3MuXG5cdGNvbnN0IGdyb3VwVmlldyA9IG5ldyBjbGFzcyBleHRlbmRzIG1vY2s8SUVkaXRvckdyb3VwVmlldz4oKSB7XG5cdFx0cmVsYXlvdXRGbjogKCkgPT4gdm9pZCA9ICgpID0+IHsgfTtcblx0XHRvdmVycmlkZSBnZXQgaWQoKSB7IHJldHVybiBtb2RlbC5pZDsgfVxuXHRcdG92ZXJyaWRlIGdldCBjb3VudCgpIHsgcmV0dXJuIG1vZGVsLmNvdW50OyB9XG5cdFx0b3ZlcnJpZGUgZ2V0IHN0aWNreUNvdW50KCkgeyByZXR1cm4gbW9kZWwuc3RpY2t5Q291bnQ7IH1cblx0XHRvdmVycmlkZSBnZXQgYWN0aXZlRWRpdG9yKCkgeyByZXR1cm4gbW9kZWwuYWN0aXZlRWRpdG9yOyB9XG5cdFx0b3ZlcnJpZGUgZ2V0IGFjdGl2ZUVkaXRvclBhbmUoKSB7IHJldHVybiB1bmRlZmluZWQ7IH1cblx0XHRvdmVycmlkZSBnZXQgc2VsZWN0ZWRFZGl0b3JzKCkgeyByZXR1cm4gbW9kZWwuc2VsZWN0ZWRFZGl0b3JzOyB9XG5cdFx0b3ZlcnJpZGUgZ2V0IGFyaWFMYWJlbCgpIHsgcmV0dXJuICdFZGl0b3IgR3JvdXAgMSc7IH1cblx0XHRvdmVycmlkZSBnZXQgZ3JvdXBzVmlldygpOiBJRWRpdG9yR3JvdXBzVmlldyB7IHJldHVybiBncm91cHNWaWV3OyB9XG5cdFx0b3ZlcnJpZGUgZ2V0RWRpdG9yQnlJbmRleChpbmRleDogbnVtYmVyKSB7IHJldHVybiBtb2RlbC5nZXRFZGl0b3JCeUluZGV4KGluZGV4KTsgfVxuXHRcdG92ZXJyaWRlIGdldEluZGV4T2ZFZGl0b3IoZWRpdG9yOiBFZGl0b3JJbnB1dCkgeyByZXR1cm4gbW9kZWwuaW5kZXhPZihlZGl0b3IpOyB9XG5cdFx0b3ZlcnJpZGUgZ2V0RWRpdG9ycyhvcmRlcjogRWRpdG9yc09yZGVyLCBvcHRzPzogeyBleGNsdWRlU3RpY2t5PzogYm9vbGVhbiB9KSB7IHJldHVybiBtb2RlbC5nZXRFZGl0b3JzKG9yZGVyLCBvcHRzKTsgfVxuXHRcdG92ZXJyaWRlIGlzQWN0aXZlKGVkaXRvcjogRWRpdG9ySW5wdXQpIHsgcmV0dXJuIG1vZGVsLmlzQWN0aXZlKGVkaXRvcik7IH1cblx0XHRvdmVycmlkZSBpc1Bpbm5lZChlZGl0b3JPckluZGV4OiBFZGl0b3JJbnB1dCB8IG51bWJlcikgeyByZXR1cm4gbW9kZWwuaXNQaW5uZWQoZWRpdG9yT3JJbmRleCk7IH1cblx0XHRvdmVycmlkZSBpc1N0aWNreShlZGl0b3JPckluZGV4OiBFZGl0b3JJbnB1dCB8IG51bWJlcikgeyByZXR1cm4gbW9kZWwuaXNTdGlja3koZWRpdG9yT3JJbmRleCk7IH1cblx0XHRvdmVycmlkZSBpc1NlbGVjdGVkKGVkaXRvck9ySW5kZXg6IEVkaXRvcklucHV0IHwgbnVtYmVyKSB7IHJldHVybiBtb2RlbC5pc1NlbGVjdGVkKGVkaXRvck9ySW5kZXgpOyB9XG5cdFx0b3ZlcnJpZGUgY3JlYXRlRWRpdG9yQWN0aW9ucyhkaXNwb3NhYmxlczogRGlzcG9zYWJsZVN0b3JlLCBtZW51SWQgPSBNZW51SWQuRWRpdG9yVGl0bGUpIHsgcmV0dXJuIGNyZWF0ZUVkaXRvckFjdGlvbnMoZGlzcG9zYWJsZXMsIG1lbnVJZCk7IH1cblx0XHRvdmVycmlkZSByZWxheW91dCgpIHsgdGhpcy5yZWxheW91dEZuKCk7IH1cblx0XHRvdmVycmlkZSByZWFkb25seSBvbkRpZEFjdGl2ZUVkaXRvckNoYW5nZSA9IEV2ZW50Lk5vbmU7XG5cdH07XG5cblx0Ly8gU2VwYXJhdGUgcmVmZXJlbmNlIHJldHVybmVkIGFzIHRoZSBhY3RpdmUgZ3JvdXAgd2hlbiB0aGlzIGdyb3VwIGlzIGluYWN0aXZlLCBzbyB0aGF0XG5cdC8vIGBncm91cHNWaWV3LmFjdGl2ZUdyb3VwID09PSBncm91cFZpZXdgIGlzIGZhbHNlIGFuZCBpbmFjdGl2ZS1ncm91cCBiZWhhdmlvciBpcyBleGVyY2lzZWQuXG5cdGNvbnN0IG90aGVyQWN0aXZlR3JvdXAgPSBuZXcgY2xhc3MgZXh0ZW5kcyBtb2NrPElFZGl0b3JHcm91cFZpZXc+KCkge1xuXHRcdG92ZXJyaWRlIGZvY3VzKCkgeyB9XG5cdH07XG5cblx0Y29uc3QgZ3JvdXBzVmlldyA9IG5ldyBjbGFzcyBleHRlbmRzIG1vY2s8SUVkaXRvckdyb3Vwc1ZpZXc+KCkge1xuXHRcdG92ZXJyaWRlIGdldCBwYXJ0T3B0aW9ucygpIHsgcmV0dXJuIHBhcnRPcHRpb25zOyB9XG5cdFx0b3ZlcnJpZGUgZ2V0IGFjdGl2ZUdyb3VwKCk6IElFZGl0b3JHcm91cFZpZXcgeyByZXR1cm4gaXNHcm91cEFjdGl2ZSA/IGdyb3VwVmlldyA6IG90aGVyQWN0aXZlR3JvdXA7IH1cblx0XHRvdmVycmlkZSBnZXQgZ3JvdXBzKCk6IElFZGl0b3JHcm91cFZpZXdbXSB7IHJldHVybiBbZ3JvdXBWaWV3XTsgfVxuXHRcdG92ZXJyaWRlIHJlYWRvbmx5IG9uRGlkQ2hhbmdlRWRpdG9yUGFydE9wdGlvbnMgPSBFdmVudC5Ob25lO1xuXHRcdG92ZXJyaWRlIHJlYWRvbmx5IG9uRGlkVmlzaWJpbGl0eUNoYW5nZSA9IEV2ZW50Lk5vbmU7XG5cdH07XG5cblx0Y29uc3QgZWRpdG9yUGFydHNWaWV3ID0gbmV3IGNsYXNzIGV4dGVuZHMgbW9jazxJRWRpdG9yUGFydHNWaWV3PigpIHtcblx0XHRvdmVycmlkZSBnZXQgY291bnQoKSB7IHJldHVybiAxOyB9XG5cdFx0b3ZlcnJpZGUgZ2V0R3JvdXAoKSB7IHJldHVybiBncm91cFZpZXc7IH1cblx0fTtcblxuXHQvLyBSZWNyZWF0ZSB0aGUgYW5jZXN0b3IgY2hhaW4gdGhlIHRhYi1iYXIgQ1NTIGlzIHNjb3BlZCB0bzsgdGhlIGZpeHR1cmUgY29udGFpbmVyIGFscmVhZHlcblx0Ly8gY2FycmllcyBgLm1vbmFjby13b3JrYmVuY2hgICsgdGhlbWUgY2xhc3Nlcy5cblx0Y29uc3QgZWRpdG9yUGFydCA9ICQoJy5wYXJ0LmVkaXRvcicpO1xuXHRjb25zdCBjb250ZW50ID0gJCgnLmNvbnRlbnQnKTtcblx0Y29uc3QgZ3JvdXBDb250YWluZXIgPSAkKGlzR3JvdXBBY3RpdmUgPyAnLmVkaXRvci1ncm91cC1jb250YWluZXIuYWN0aXZlJyA6ICcuZWRpdG9yLWdyb3VwLWNvbnRhaW5lcicpO1xuXHRjb25zdCB0aXRsZUNvbnRhaW5lciA9ICQoJy50aXRsZScpO1xuXHRjb250YWluZXIuY2xhc3NMaXN0LnRvZ2dsZSgnbW9kZXJuLXVpLXRhYnMnLCBvcHRpb25zLm1vZGVyblVJKTtcblx0dGl0bGVDb250YWluZXIuY2xhc3NMaXN0LnRvZ2dsZSgndGFicycsIHBhcnRPcHRpb25zLnNob3dUYWJzID09PSAnbXVsdGlwbGUnKTtcblx0dGl0bGVDb250YWluZXIuY2xhc3NMaXN0LnRvZ2dsZSgnc2hvdy1maWxlLWljb25zJywgcGFydE9wdGlvbnMuc2hvd0ljb25zKTtcblxuXHRjb25zdCBoZWFkZXJCYWNrZ3JvdW5kID0gdGhlbWUuZ2V0Q29sb3IocGFydE9wdGlvbnMuc2hvd1RhYnMgPT09ICdtdWx0aXBsZScgPyBFRElUT1JfR1JPVVBfSEVBREVSX1RBQlNfQkFDS0dST1VORCA6IEVESVRPUl9HUk9VUF9IRUFERVJfTk9fVEFCU19CQUNLR1JPVU5EKTtcblx0aWYgKGhlYWRlckJhY2tncm91bmQpIHtcblx0XHR0aXRsZUNvbnRhaW5lci5zdHlsZS5iYWNrZ3JvdW5kQ29sb3IgPSBoZWFkZXJCYWNrZ3JvdW5kLnRvU3RyaW5nKCk7XG5cdH1cblxuXHRjb25zdCBlZGl0b3JDb250YWluZXIgPSAkKCcuZWRpdG9yLWNvbnRhaW5lcicpO1xuXHRlZGl0b3JDb250YWluZXIuc3R5bGUuaGVpZ2h0ID0gJzk2cHgnO1xuXHRlZGl0b3JDb250YWluZXIuc3R5bGUub3BhY2l0eSA9ICcwLjYnO1xuXG5cdGVkaXRvclBhcnQuYXBwZW5kQ2hpbGQoY29udGVudCk7XG5cdGNvbnRlbnQuYXBwZW5kQ2hpbGQoZ3JvdXBDb250YWluZXIpO1xuXHRncm91cENvbnRhaW5lci5hcHBlbmRDaGlsZCh0aXRsZUNvbnRhaW5lcik7XG5cdGdyb3VwQ29udGFpbmVyLmFwcGVuZENoaWxkKGVkaXRvckNvbnRhaW5lcik7XG5cdGNvbnRhaW5lci5hcHBlbmRDaGlsZChlZGl0b3JQYXJ0KTtcblxuXHRjb250YWluZXIuc3R5bGUud2lkdGggPSBgJHt3aWR0aH1weGA7XG5cdGdyb3VwQ29udGFpbmVyLnN0eWxlLndpZHRoID0gYCR7d2lkdGh9cHhgO1xuXG5cdGNvbnN0IHRpdGxlQ29udHJvbCA9IGRpc3Bvc2FibGVTdG9yZS5hZGQoaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoXG5cdFx0RWRpdG9yVGl0bGVDb250cm9sLFxuXHRcdHRpdGxlQ29udGFpbmVyLFxuXHRcdGVkaXRvclBhcnRzVmlldyxcblx0XHRncm91cHNWaWV3LFxuXHRcdGdyb3VwVmlldyxcblx0XHRtb2RlbCxcblx0XHRvcHRpb25zLmhlYWRlck1lbnVJZHMsXG5cdFx0b3B0aW9ucy5zaG93SGVhZGVyID8/IGZhbHNlLFxuXHQpKTtcblxuXHRjb25zdCBsYXlvdXQgPSAoKSA9PiB7XG5cdFx0dGl0bGVDb250cm9sLmxheW91dCh7XG5cdFx0XHRjb250YWluZXI6IG5ldyBEaW1lbnNpb24od2lkdGgsIHRpdGxlQ29udHJvbC5nZXRIZWlnaHQoKS50b3RhbCksXG5cdFx0XHRhdmFpbGFibGU6IG5ldyBEaW1lbnNpb24od2lkdGgsIDIwMCksXG5cdFx0fSk7XG5cdH07XG5cdGdyb3VwVmlldy5yZWxheW91dEZuID0gbGF5b3V0O1xuXG5cdHRpdGxlQ29udHJvbC5vcGVuRWRpdG9ycyhtb2RlbC5nZXRFZGl0b3JzKEVkaXRvcnNPcmRlci5TRVFVRU5USUFMKSk7XG5cdHRpdGxlQ29udHJvbC5zZXRBY3RpdmUoaXNHcm91cEFjdGl2ZSk7XG5cdGNvbnN0IHRhYnMgPSB0aXRsZUNvbnRhaW5lci5xdWVyeVNlbGVjdG9yQWxsPEhUTUxFbGVtZW50PignLnRhYnMtY29udGFpbmVyID4gLnRhYicpO1xuXHRpZiAob3B0aW9ucy5kcm9wVGFyZ2V0QmV0d2VlblRhYnMpIHtcblx0XHR0YWJzWzFdPy5jbGFzc0xpc3QuYWRkKCdkcm9wLXRhcmdldC1sZWZ0Jyk7XG5cdFx0dGFic1syXT8uY2xhc3NMaXN0LmFkZCgnZHJvcC10YXJnZXQtcmlnaHQnKTtcblx0fVxuXHRpZiAob3B0aW9ucy5mb3JjZWRIb3ZlclRhYiAhPT0gdW5kZWZpbmVkKSB7XG5cdFx0dGFic1tvcHRpb25zLmZvcmNlZEhvdmVyVGFiXT8uY2xhc3NMaXN0LmFkZCgnZml4dHVyZS1ob3ZlcicpO1xuXHR9XG5cdGlmIChvcHRpb25zLmZvY3VzZWRUYWJBY3Rpb24gIT09IHVuZGVmaW5lZCkge1xuXHRcdHRhYnNbb3B0aW9ucy5mb2N1c2VkVGFiQWN0aW9uXT8ucXVlcnlTZWxlY3RvcjxIVE1MRWxlbWVudD4oJy50YWItYWN0aW9ucyAuYWN0aW9uLWxhYmVsJyk/LmZvY3VzKCk7XG5cdH1cblx0bGF5b3V0KCk7XG59XG5cbmZ1bmN0aW9uIHJlbmRlcihtb2Rlcm5VSTogYm9vbGVhbiwgb3B0aW9uczogT21pdDxJRWRpdG9yVGFiQmFyRml4dHVyZU9wdGlvbnMsICdtb2Rlcm5VSSc+KTogKGN0eDogQ29tcG9uZW50Rml4dHVyZUNvbnRleHQpID0+IHZvaWQge1xuXHRyZXR1cm4gKGN0eDogQ29tcG9uZW50Rml4dHVyZUNvbnRleHQpID0+IHJlbmRlckVkaXRvclRhYkJhckZpeHR1cmUoY3R4LCB7IC4uLm9wdGlvbnMsIG1vZGVyblVJIH0pO1xufVxuXG5mdW5jdGlvbiBjcmVhdGVGaXh0dXJlcyhtb2Rlcm5VSTogYm9vbGVhbiwgYWRkaXRpb25hbFRoZW1lczogcmVhZG9ubHkgQ29tcG9uZW50Rml4dHVyZUFkZGl0aW9uYWxUaGVtZVtdID0gW10pIHtcblx0cmV0dXJuIHtcblx0XHQvLyBCYXNlbGluZTogbXVsdGlwbGUgdGFicyB3aXRoIG1peGVkIHN0aWNreSAvIHBpbm5lZCAvIHByZXZpZXcgLyBkaXJ0eSBzdGF0ZS5cblx0XHREZWZhdWx0OiBkZWZpbmVDb21wb25lbnRGaXh0dXJlKHsgcmVuZGVyOiByZW5kZXIobW9kZXJuVUksIHt9KSwgYWRkaXRpb25hbFRoZW1lcyB9KSxcblxuXHRcdC8vIHNob3dUYWJzXG5cdFx0U2hvd1RhYnNTaW5nbGU6IGRlZmluZUNvbXBvbmVudEZpeHR1cmUoeyByZW5kZXI6IHJlbmRlcihtb2Rlcm5VSSwgeyBwYXJ0T3B0aW9uczogeyBzaG93VGFiczogJ3NpbmdsZScgfSwgYnJlYWRjcnVtYnM6IHt9IH0pIH0pLFxuXHRcdFNob3dUYWJzTm9uZTogZGVmaW5lQ29tcG9uZW50Rml4dHVyZSh7IHJlbmRlcjogcmVuZGVyKG1vZGVyblVJLCB7IHBhcnRPcHRpb25zOiB7IHNob3dUYWJzOiAnbm9uZScgfSB9KSB9KSxcblxuXHRcdC8vIHBpbm5lZFRhYnNPblNlcGFyYXRlUm93XG5cdFx0UGlubmVkVGFic09uU2VwYXJhdGVSb3dBbGxQaW5uZWQ6IGRlZmluZUNvbXBvbmVudEZpeHR1cmUoeyByZW5kZXI6IHJlbmRlcihtb2Rlcm5VSSwgeyBwYXJ0T3B0aW9uczogeyBwaW5uZWRUYWJzT25TZXBhcmF0ZVJvdzogdHJ1ZSB9LCBlZGl0b3JzOiBhbGxTdGlja3lFZGl0b3JTcGVjcygpIH0pIH0pLFxuXHRcdFBpbm5lZFRhYnNPblNlcGFyYXRlUm93QWxsVW5waW5uZWQ6IGRlZmluZUNvbXBvbmVudEZpeHR1cmUoeyByZW5kZXI6IHJlbmRlcihtb2Rlcm5VSSwgeyBwYXJ0T3B0aW9uczogeyBwaW5uZWRUYWJzT25TZXBhcmF0ZVJvdzogdHJ1ZSB9LCBlZGl0b3JzOiBhbGxVbnN0aWNreUVkaXRvclNwZWNzKCkgfSkgfSksXG5cdFx0UGlubmVkVGFic09uU2VwYXJhdGVSb3dNaXhlZDogZGVmaW5lQ29tcG9uZW50Rml4dHVyZSh7IHJlbmRlcjogcmVuZGVyKG1vZGVyblVJLCB7IHBhcnRPcHRpb25zOiB7IHBpbm5lZFRhYnNPblNlcGFyYXRlUm93OiB0cnVlIH0sIGVkaXRvcnM6IHN0aWNreUVkaXRvclNwZWNzKCkgfSksIGFkZGl0aW9uYWxUaGVtZXMgfSksXG5cblx0XHQvLyBicmVhZGNydW1ic1xuXHRcdEJyZWFkY3J1bWJzRmlsZVBhdGhMYXN0OiBkZWZpbmVDb21wb25lbnRGaXh0dXJlKHsgcmVuZGVyOiByZW5kZXIobW9kZXJuVUksIHsgYnJlYWRjcnVtYnM6IHsgZmlsZVBhdGg6ICdsYXN0JyB9LCBlZGl0b3JzOiBuZXN0ZWRBY3RpdmVFZGl0b3JTcGVjcygpIH0pIH0pLFxuXHRcdEJyZWFkY3J1bWJzSWNvbnNPZmY6IGRlZmluZUNvbXBvbmVudEZpeHR1cmUoeyByZW5kZXI6IHJlbmRlcihtb2Rlcm5VSSwgeyBicmVhZGNydW1iczogeyBpY29uczogZmFsc2UgfSB9KSB9KSxcblxuXHRcdC8vIHRhYlNpemluZ1xuXHRcdFRhYlNpemluZ1NocmluazogZGVmaW5lQ29tcG9uZW50Rml4dHVyZSh7IHJlbmRlcjogcmVuZGVyKG1vZGVyblVJLCB7IHBhcnRPcHRpb25zOiB7IHRhYlNpemluZzogJ3NocmluaycgfSwgZWRpdG9yczogbWFueUVkaXRvclNwZWNzKCkgfSkgfSksXG5cdFx0VGFiU2l6aW5nRml4ZWQ6IGRlZmluZUNvbXBvbmVudEZpeHR1cmUoeyByZW5kZXI6IHJlbmRlcihtb2Rlcm5VSSwgeyBwYXJ0T3B0aW9uczogeyB0YWJTaXppbmc6ICdmaXhlZCcsIHRhYlNpemluZ0ZpeGVkTWluV2lkdGg6IDYwLCB0YWJTaXppbmdGaXhlZE1heFdpZHRoOiAxMjAgfSwgZWRpdG9yczogbWFueUVkaXRvclNwZWNzKCkgfSkgfSksXG5cblx0XHQvLyB0YWJIZWlnaHRcblx0XHRUYWJIZWlnaHRDb21wYWN0OiBkZWZpbmVDb21wb25lbnRGaXh0dXJlKHsgcmVuZGVyOiByZW5kZXIobW9kZXJuVUksIHsgcGFydE9wdGlvbnM6IHsgdGFiSGVpZ2h0OiAnY29tcGFjdCcgfSB9KSB9KSxcblxuXHRcdC8vIHdyYXBUYWJzXG5cdFx0V3JhcFRhYnM6IGRlZmluZUNvbXBvbmVudEZpeHR1cmUoeyByZW5kZXI6IHJlbmRlcihtb2Rlcm5VSSwgeyBwYXJ0T3B0aW9uczogeyB3cmFwVGFiczogdHJ1ZSB9LCBlZGl0b3JzOiBtYW55RWRpdG9yU3BlY3MoKSwgd2lkdGg6IDUyMCB9KSB9KSxcblxuXHRcdC8vIHRhYkFjdGlvbkxvY2F0aW9uXG5cdFx0VGFiQWN0aW9uTG9jYXRpb25MZWZ0OiBkZWZpbmVDb21wb25lbnRGaXh0dXJlKHsgcmVuZGVyOiByZW5kZXIobW9kZXJuVUksIHsgcGFydE9wdGlvbnM6IHsgdGFiQWN0aW9uTG9jYXRpb246ICdsZWZ0JyB9IH0pIH0pLFxuXG5cdFx0Ly8gdGFiQWN0aW9uQ2xvc2VWaXNpYmlsaXR5XG5cdFx0VGFiQWN0aW9uQ2xvc2VIaWRkZW46IGRlZmluZUNvbXBvbmVudEZpeHR1cmUoeyByZW5kZXI6IHJlbmRlcihtb2Rlcm5VSSwgeyBwYXJ0T3B0aW9uczogeyB0YWJBY3Rpb25DbG9zZVZpc2liaWxpdHk6IGZhbHNlIH0gfSkgfSksXG5cblx0XHQvLyB0YWJBY3Rpb25VbnBpblZpc2liaWxpdHkgKHdpdGggc3RpY2t5L2NvbXBhY3QgdGFicyB3aGVyZSB0aGUgdW5waW4gYWN0aW9uIHNob3dzKVxuXHRcdFRhYkFjdGlvblVucGluSGlkZGVuOiBkZWZpbmVDb21wb25lbnRGaXh0dXJlKHsgcmVuZGVyOiByZW5kZXIobW9kZXJuVUksIHsgcGFydE9wdGlvbnM6IHsgdGFiQWN0aW9uVW5waW5WaXNpYmlsaXR5OiBmYWxzZSwgcGlubmVkVGFiU2l6aW5nOiAnbm9ybWFsJyB9LCBlZGl0b3JzOiBzdGlja3lFZGl0b3JTcGVjcygpIH0pIH0pLFxuXG5cdFx0Ly8gdGFiQWN0aW9uUmVzZXJ2ZVNwYWNlIChNb2Rlcm4gVUk6IHJlc2VydmVkIGJ5IGRlZmF1bHQ7IHdoZW4gZGlzYWJsZWQgY2xlYW4gdGFicyBnbyBjb21wYWN0IHdoaWxlIGRpcnR5L3N0aWNreSBzdGlsbCByZXNlcnZlIHRoZWlyIGluZGljYXRvciBjb2x1bW4pXG5cdFx0VGFiQWN0aW9uUmVzZXJ2ZVNwYWNlT246IGRlZmluZUNvbXBvbmVudEZpeHR1cmUoeyByZW5kZXI6IHJlbmRlcihtb2Rlcm5VSSwgeyBwYXJ0T3B0aW9uczogeyB0YWJBY3Rpb25SZXNlcnZlU3BhY2U6IHRydWUgfSwgZWRpdG9yczogcmVzZXJ2ZVNwYWNlRWRpdG9yU3BlY3MoKSB9KSB9KSxcblx0XHRUYWJBY3Rpb25SZXNlcnZlU3BhY2VPZmY6IGRlZmluZUNvbXBvbmVudEZpeHR1cmUoeyByZW5kZXI6IHJlbmRlcihtb2Rlcm5VSSwgeyBwYXJ0T3B0aW9uczogeyB0YWJBY3Rpb25SZXNlcnZlU3BhY2U6IGZhbHNlIH0sIGVkaXRvcnM6IHJlc2VydmVTcGFjZUVkaXRvclNwZWNzKCkgfSkgfSksXG5cblx0XHQvLyBzaG93VGFiSW5kZXhcblx0XHRTaG93VGFiSW5kZXg6IGRlZmluZUNvbXBvbmVudEZpeHR1cmUoeyByZW5kZXI6IHJlbmRlcihtb2Rlcm5VSSwgeyBwYXJ0T3B0aW9uczogeyBzaG93VGFiSW5kZXg6IHRydWUgfSB9KSB9KSxcblxuXHRcdC8vIGhpZ2hsaWdodE1vZGlmaWVkVGFic1xuXHRcdEhpZ2hsaWdodE1vZGlmaWVkVGFiczogZGVmaW5lQ29tcG9uZW50Rml4dHVyZSh7IHJlbmRlcjogcmVuZGVyKG1vZGVyblVJLCB7IHBhcnRPcHRpb25zOiB7IGhpZ2hsaWdodE1vZGlmaWVkVGFiczogdHJ1ZSB9LCBlZGl0b3JzOiBkaXJ0eUVkaXRvclNwZWNzKCkgfSkgfSksXG5cblx0XHQvLyBsYWJlbEZvcm1hdFxuXHRcdExhYmVsRm9ybWF0U2hvcnQ6IGRlZmluZUNvbXBvbmVudEZpeHR1cmUoeyByZW5kZXI6IHJlbmRlcihtb2Rlcm5VSSwgeyBwYXJ0T3B0aW9uczogeyBsYWJlbEZvcm1hdDogJ3Nob3J0JyB9LCBlZGl0b3JzOiBkdXBsaWNhdGVOYW1lRWRpdG9yU3BlY3MoKSB9KSB9KSxcblx0XHRMYWJlbEZvcm1hdE1lZGl1bTogZGVmaW5lQ29tcG9uZW50Rml4dHVyZSh7IHJlbmRlcjogcmVuZGVyKG1vZGVyblVJLCB7IHBhcnRPcHRpb25zOiB7IGxhYmVsRm9ybWF0OiAnbWVkaXVtJyB9LCBlZGl0b3JzOiBkdXBsaWNhdGVOYW1lRWRpdG9yU3BlY3MoKSB9KSB9KSxcblx0XHRMYWJlbEZvcm1hdExvbmc6IGRlZmluZUNvbXBvbmVudEZpeHR1cmUoeyByZW5kZXI6IHJlbmRlcihtb2Rlcm5VSSwgeyBwYXJ0T3B0aW9uczogeyBsYWJlbEZvcm1hdDogJ2xvbmcnIH0sIGVkaXRvcnM6IGR1cGxpY2F0ZU5hbWVFZGl0b3JTcGVjcygpIH0pIH0pLFxuXG5cdFx0Ly8gc2hvd0ljb25zXG5cdFx0U2hvd0ljb25zT2ZmOiBkZWZpbmVDb21wb25lbnRGaXh0dXJlKHsgcmVuZGVyOiByZW5kZXIobW9kZXJuVUksIHsgcGFydE9wdGlvbnM6IHsgc2hvd0ljb25zOiBmYWxzZSB9IH0pIH0pLFxuXG5cdFx0Ly8gZGVjb3JhdGlvbnMgKGZpbGUtZGVjb3JhdGlvbiBiYWRnZXMgKyBjb2xvcnMpXG5cdFx0RGVjb3JhdGlvbnNPZmY6IGRlZmluZUNvbXBvbmVudEZpeHR1cmUoeyByZW5kZXI6IHJlbmRlcihtb2Rlcm5VSSwgeyBwYXJ0T3B0aW9uczogeyBkZWNvcmF0aW9uczogeyBiYWRnZXM6IGZhbHNlLCBjb2xvcnM6IGZhbHNlIH0gfSB9KSB9KSxcblxuXHRcdC8vIHBpbm5lZFRhYlNpemluZ1xuXHRcdFBpbm5lZFRhYlNpemluZ0NvbXBhY3Q6IGRlZmluZUNvbXBvbmVudEZpeHR1cmUoeyByZW5kZXI6IHJlbmRlcihtb2Rlcm5VSSwgeyBwYXJ0T3B0aW9uczogeyBwaW5uZWRUYWJTaXppbmc6ICdjb21wYWN0JyB9LCBlZGl0b3JzOiBzdGlja3lFZGl0b3JTcGVjcygpIH0pIH0pLFxuXHRcdFBpbm5lZFRhYlNpemluZ1NocmluazogZGVmaW5lQ29tcG9uZW50Rml4dHVyZSh7IHJlbmRlcjogcmVuZGVyKG1vZGVyblVJLCB7IHBhcnRPcHRpb25zOiB7IHBpbm5lZFRhYlNpemluZzogJ3NocmluaycgfSwgZWRpdG9yczogc3RpY2t5RWRpdG9yU3BlY3MoKSB9KSB9KSxcblxuXHRcdC8vIHRpdGxlU2Nyb2xsYmFyU2l6aW5nXG5cdFx0VGl0bGVTY3JvbGxiYXJMYXJnZTogZGVmaW5lQ29tcG9uZW50Rml4dHVyZSh7IHJlbmRlcjogcmVuZGVyKG1vZGVyblVJLCB7IHBhcnRPcHRpb25zOiB7IHRpdGxlU2Nyb2xsYmFyU2l6aW5nOiAnbGFyZ2UnIH0sIGVkaXRvcnM6IG1hbnlFZGl0b3JTcGVjcygpLCB3aWR0aDogNTIwIH0pIH0pLFxuXG5cdFx0Ly8gdGl0bGVTY3JvbGxiYXJWaXNpYmlsaXR5IChhbHdheXMtdmlzaWJsZSBzY3JvbGxiYXIgd2l0aCBvdmVyZmxvd2luZyB0YWJzKVxuXHRcdFRpdGxlU2Nyb2xsYmFyVmlzaWJsZTogZGVmaW5lQ29tcG9uZW50Rml4dHVyZSh7IHJlbmRlcjogcmVuZGVyKG1vZGVyblVJLCB7IHBhcnRPcHRpb25zOiB7IHRpdGxlU2Nyb2xsYmFyVmlzaWJpbGl0eTogJ3Zpc2libGUnIH0sIGVkaXRvcnM6IG1hbnlFZGl0b3JTcGVjcygpLCB3aWR0aDogNTIwIH0pIH0pLFxuXG5cdFx0Ly8gZWRpdG9yQWN0aW9uc0xvY2F0aW9uXG5cdFx0RWRpdG9yQWN0aW9uc0RlZmF1bHQ6IGRlZmluZUNvbXBvbmVudEZpeHR1cmUoeyByZW5kZXI6IHJlbmRlcihtb2Rlcm5VSSwgeyBwYXJ0T3B0aW9uczogeyBlZGl0b3JBY3Rpb25zTG9jYXRpb246ICdkZWZhdWx0JyB9IH0pIH0pLFxuXHRcdEVkaXRvckFjdGlvbnNUaXRsZUJhcjogZGVmaW5lQ29tcG9uZW50Rml4dHVyZSh7IHJlbmRlcjogcmVuZGVyKG1vZGVyblVJLCB7IHBhcnRPcHRpb25zOiB7IGVkaXRvckFjdGlvbnNMb2NhdGlvbjogJ3RpdGxlQmFyJyB9IH0pIH0pLFxuXHRcdEVkaXRvckFjdGlvbnNIaWRkZW46IGRlZmluZUNvbXBvbmVudEZpeHR1cmUoeyByZW5kZXI6IHJlbmRlcihtb2Rlcm5VSSwgeyBwYXJ0T3B0aW9uczogeyBlZGl0b3JBY3Rpb25zTG9jYXRpb246ICdoaWRkZW4nIH0gfSkgfSksXG5cblx0XHQvLyBhbHdheXNTaG93RWRpdG9yQWN0aW9uc1xuXHRcdEFsd2F5c1Nob3dFZGl0b3JBY3Rpb25zQWN0aXZlR3JvdXA6IGRlZmluZUNvbXBvbmVudEZpeHR1cmUoeyByZW5kZXI6IHJlbmRlcihtb2Rlcm5VSSwgeyBwYXJ0T3B0aW9uczogeyBhbHdheXNTaG93RWRpdG9yQWN0aW9uczogdHJ1ZSB9LCBhY3RpdmU6IHRydWUgfSkgfSksXG5cdFx0QWx3YXlzU2hvd0VkaXRvckFjdGlvbnNJbmFjdGl2ZUdyb3VwOiBkZWZpbmVDb21wb25lbnRGaXh0dXJlKHsgcmVuZGVyOiByZW5kZXIobW9kZXJuVUksIHsgcGFydE9wdGlvbnM6IHsgYWx3YXlzU2hvd0VkaXRvckFjdGlvbnM6IHRydWUgfSwgYWN0aXZlOiBmYWxzZSB9KSB9KSxcblxuXHRcdC8vIC0tLSBVSSBzdGF0ZXMgLyBlZGdlIGNhc2VzIChub3QgdGllZCB0byBhIHNpbmdsZSBzZXR0aW5nKSAtLS1cblxuXHRcdC8vIEFjdGl2ZSBhbmQgaW5hY3RpdmUgZ3JvdXAgc3R5bGluZy5cblx0XHRBY3RpdmVHcm91cDogZGVmaW5lQ29tcG9uZW50Rml4dHVyZSh7IHJlbmRlcjogcmVuZGVyKG1vZGVyblVJLCB7IGFjdGl2ZTogdHJ1ZSB9KSB9KSxcblx0XHRJbmFjdGl2ZUdyb3VwOiBkZWZpbmVDb21wb25lbnRGaXh0dXJlKHsgcmVuZGVyOiByZW5kZXIobW9kZXJuVUksIHsgYWN0aXZlOiBmYWxzZSB9KSwgYWRkaXRpb25hbFRoZW1lcyB9KSxcblxuXHRcdC8vIE11bHRpLXNlbGVjdGlvbjogc2V2ZXJhbCB0YWJzIGluIHRoZSBzZWxlY3RlZCBzdGF0ZSBhdCBvbmNlLlxuXHRcdE11bHRpU2VsZWN0OiBkZWZpbmVDb21wb25lbnRGaXh0dXJlKHsgcmVuZGVyOiByZW5kZXIobW9kZXJuVUksIHsgZWRpdG9yczogbXVsdGlTZWxlY3RFZGl0b3JTcGVjcygpIH0pLCBhZGRpdGlvbmFsVGhlbWVzIH0pLFxuXG5cdFx0Ly8gSW5hY3RpdmUgZ3JvdXAgd2l0aCBkaXJ0eSBlZGl0b3JzOiBleGVyY2lzZXMgdGhlIHVuZm9jdXNlZCBtb2RpZmllZC1ib3JkZXIgY29sb3IgcGF0aC5cblx0XHRJbmFjdGl2ZUdyb3VwRGlydHk6IGRlZmluZUNvbXBvbmVudEZpeHR1cmUoeyByZW5kZXI6IHJlbmRlcihtb2Rlcm5VSSwgeyBlZGl0b3JzOiBkaXJ0eUVkaXRvclNwZWNzKCksIGFjdGl2ZTogZmFsc2UgfSkgfSksXG5cblx0XHQvLyBWZXJ5IGxvbmcgbGFiZWxzOiB0YWItbGFiZWwgdHJ1bmNhdGlvbiAvIGVsbGlwc2lzIHdpdGggc2hyaW5raW5nIHRhYnMuXG5cdFx0TG9uZ0xhYmVsc1NocmluazogZGVmaW5lQ29tcG9uZW50Rml4dHVyZSh7IHJlbmRlcjogcmVuZGVyKG1vZGVyblVJLCB7IHBhcnRPcHRpb25zOiB7IHRhYlNpemluZzogJ3NocmluaycgfSwgZWRpdG9yczogbG9uZ0xhYmVsRWRpdG9yU3BlY3MoKSwgd2lkdGg6IDUyMCB9KSB9KSxcblxuXHRcdC8vIERyYWctYW5kLWRyb3AgaW5zZXJ0aW9uIGluZGljYXRvciBiZXR3ZWVuIHR3byB0YWJzLlxuXHRcdERyb3BUYXJnZXRCZXR3ZWVuVGFiczogZGVmaW5lQ29tcG9uZW50Rml4dHVyZSh7IHJlbmRlcjogcmVuZGVyKG1vZGVyblVJLCB7IGRyb3BUYXJnZXRCZXR3ZWVuVGFiczogdHJ1ZSB9KSwgYWRkaXRpb25hbFRoZW1lcyB9KSxcblxuXHRcdC8vIC0tLSBOb3RhYmxlIHNldHRpbmcgY29tYmluYXRpb25zIC0tLVxuXG5cdFx0Ly8gU3RpY2t5IGNvbXBhY3QgdGFicyB3aXRoIGljb25zIGRpc2FibGVkOiB0aGUgc3RpY2t5IHRhYiBmYWxscyBiYWNrIHRvIHRoZVxuXHRcdC8vIGZpcnN0IGxldHRlciBvZiB0aGUgbmFtZSBpbnN0ZWFkIG9mIGFuIGljb24uXG5cdFx0U3RpY2t5Q29tcGFjdE5vSWNvbnM6IGRlZmluZUNvbXBvbmVudEZpeHR1cmUoeyByZW5kZXI6IHJlbmRlcihtb2Rlcm5VSSwgeyBwYXJ0T3B0aW9uczogeyBwaW5uZWRUYWJTaXppbmc6ICdjb21wYWN0Jywgc2hvd0ljb25zOiBmYWxzZSB9LCBlZGl0b3JzOiBzdGlja3lFZGl0b3JTcGVjcygpIH0pIH0pLFxuXG5cdFx0Ly8gU2luZ2xlLXRhYiBtb2RlIHdpdGggYSBkaXJ0eSBlZGl0b3I6IHRoZSBzaW5nbGUgdGFiIGNvbnRyb2wgcmVuZGVycyB0aGUgZGlydHkgZG90LlxuXHRcdFNpbmdsZVRhYkRpcnR5OiBkZWZpbmVDb21wb25lbnRGaXh0dXJlKHsgcmVuZGVyOiByZW5kZXIobW9kZXJuVUksIHsgcGFydE9wdGlvbnM6IHsgc2hvd1RhYnM6ICdzaW5nbGUnIH0sIGVkaXRvcnM6IHNpbmdsZURpcnR5RWRpdG9yU3BlY3MoKSB9KSB9KSxcblxuXHRcdC8vIFByb3RlY3RlZCBlZGl0b3JzIGhpZGUgY2xvc2UgYWZmb3JkYW5jZXMgd2hpbGUgb3JkaW5hcnkgbmVpZ2hib3JpbmcgdGFicyByZW1haW4gY2xvc2VhYmxlLlxuXHRcdENhbm5vdENsb3NlQWN0aXZlOiBkZWZpbmVDb21wb25lbnRGaXh0dXJlKHsgcmVuZGVyOiByZW5kZXIobW9kZXJuVUksIHsgZWRpdG9yczogY2Fubm90Q2xvc2VFZGl0b3JTcGVjcygpIH0pLCBhZGRpdGlvbmFsVGhlbWVzIH0pLFxuXG5cdFx0Ly8gUHJvdGVjdGVkIGRpcnR5IGVkaXRvcnMgcmV0YWluIHRoZSBtb2RpZmllZCBpbmRpY2F0b3Igd2l0aG91dCBleHBvc2luZyBhIGNsb3NlIGFjdGlvbi5cblx0XHRDYW5ub3RDbG9zZURpcnR5OiBkZWZpbmVDb21wb25lbnRGaXh0dXJlKHsgcmVuZGVyOiByZW5kZXIobW9kZXJuVUksIHsgZWRpdG9yczogY2Fubm90Q2xvc2VEaXJ0eUVkaXRvclNwZWNzKCkgfSksIGFkZGl0aW9uYWxUaGVtZXMgfSksXG5cblx0XHQvLyBTdGlja3kgcHJvdGVjdGVkIGVkaXRvcnMgcmV0YWluIHRoZSBVbnBpbiBhZmZvcmRhbmNlIGJlY2F1c2UgdW5waW5uaW5nIGRvZXMgbm90IGNsb3NlIHRoZW0uXG5cdFx0Q2Fubm90Q2xvc2VTdGlja3k6IGRlZmluZUNvbXBvbmVudEZpeHR1cmUoeyByZW5kZXI6IHJlbmRlcihtb2Rlcm5VSSwgeyBwYXJ0T3B0aW9uczogeyBwaW5uZWRUYWJTaXppbmc6ICdub3JtYWwnLCB0YWJBY3Rpb25VbnBpblZpc2liaWxpdHk6IHRydWUgfSwgZWRpdG9yczogY2Fubm90Q2xvc2VTdGlja3lFZGl0b3JTcGVjcygpIH0pLCBhZGRpdGlvbmFsVGhlbWVzIH0pLFxuXG5cdFx0Ly8gUGlubmVkIHRhYnMgb24gYSBzZXBhcmF0ZSByb3cgY29tYmluZWQgd2l0aCBjb21wYWN0IHBpbm5lZCBzaXppbmcuXG5cdFx0UGlubmVkU2VwYXJhdGVSb3dDb21wYWN0OiBkZWZpbmVDb21wb25lbnRGaXh0dXJlKHsgcmVuZGVyOiByZW5kZXIobW9kZXJuVUksIHsgcGFydE9wdGlvbnM6IHsgcGlubmVkVGFic09uU2VwYXJhdGVSb3c6IHRydWUsIHBpbm5lZFRhYlNpemluZzogJ2NvbXBhY3QnIH0sIGVkaXRvcnM6IHN0aWNreUVkaXRvclNwZWNzKCkgfSkgfSksXG5cdH07XG59XG5cbmZ1bmN0aW9uIGdldE1vZGVybkVkaXRvclRhYkNvbG9yQ3VzdG9taXphdGlvbnModGhlbWU6IENvbXBvbmVudEZpeHR1cmVDb250ZXh0Wyd0aGVtZSddKTogUmVhZG9ubHk8UmVjb3JkPHN0cmluZywgc3RyaW5nPj4ge1xuXHRjb25zdCBkYXJrID0gaXNEYXJrKHRoZW1lLnR5cGUpO1xuXHRyZXR1cm4ge1xuXHRcdFtNT0RFUk5fRURJVE9SX1RBQl9BQ1RJVkVfQkFDS0dST1VORF06IGRhcmsgPyAnIzE2NEU2MycgOiAnI0JBRTZGRCcsXG5cdFx0W01PREVSTl9FRElUT1JfVEFCX0FDVElWRV9BQ1RJT05fQkFDS0dST1VORF06IGRhcmsgPyAnIzBFMzc0NycgOiAnIzdERDNGQycsXG5cdFx0W01PREVSTl9FRElUT1JfVEFCX0FDVElWRV9GT1JFR1JPVU5EXTogZGFyayA/ICcjQ0ZGQUZFJyA6ICcjMEM0QTZFJyxcblx0XHRbTU9ERVJOX0VESVRPUl9UQUJfSU5BQ1RJVkVfQkFDS0dST1VORF06IGRhcmsgPyAnIzFFMjkzQicgOiAnI0UyRThGMCcsXG5cdFx0W01PREVSTl9FRElUT1JfVEFCX0hPVkVSX0JBQ0tHUk9VTkRdOiBkYXJrID8gJyM3QzJEMTInIDogJyNGRUQ3QUEnLFxuXHRcdFtNT0RFUk5fRURJVE9SX1RBQl9IT1ZFUl9BQ1RJT05fQkFDS0dST1VORF06IGRhcmsgPyAnIzVBMUYwQycgOiAnI0ZEQkE3NCcsXG5cdFx0W01PREVSTl9FRElUT1JfVEFCX0hPVkVSX0ZPUkVHUk9VTkRdOiBkYXJrID8gJyNGRkVERDUnIDogJyM3QzJEMTInLFxuXHRcdFtNT0RFUk5fRURJVE9SX1RBQl9BQ1RJVkVfSE9WRVJfQkFDS0dST1VORF06IGRhcmsgPyAnIzZCMjFBOCcgOiAnI0U5RDVGRicsXG5cdFx0W01PREVSTl9FRElUT1JfVEFCX0FDVElWRV9IT1ZFUl9BQ1RJT05fQkFDS0dST1VORF06IGRhcmsgPyAnIzRDMTY3OCcgOiAnI0Q4QjRGRScsXG5cdFx0W01PREVSTl9FRElUT1JfVEFCX1NFTEVDVEVEX0FDVElPTl9CQUNLR1JPVU5EXTogZGFyayA/ICcjMTY2NTM0JyA6ICcjQkJGN0QwJyxcblx0fTtcbn1cblxuZnVuY3Rpb24gcmVuZGVyVGhlbWVDb2xvcnMob3B0aW9uczogT21pdDxJRWRpdG9yVGFiQmFyRml4dHVyZU9wdGlvbnMsICdtb2Rlcm5VSScgfCAnY29sb3JDdXN0b21pemF0aW9ucyc+KTogKGN0eDogQ29tcG9uZW50Rml4dHVyZUNvbnRleHQpID0+IHZvaWQge1xuXHRyZXR1cm4gY3R4ID0+IHJlbmRlckVkaXRvclRhYkJhckZpeHR1cmUoY3R4LCB7XG5cdFx0Li4ub3B0aW9ucyxcblx0XHRtb2Rlcm5VSTogdHJ1ZSxcblx0XHRjb2xvckN1c3RvbWl6YXRpb25zOiBnZXRNb2Rlcm5FZGl0b3JUYWJDb2xvckN1c3RvbWl6YXRpb25zKGN0eC50aGVtZSksXG5cdH0pO1xufVxuXG5mdW5jdGlvbiBjcmVhdGVUaGVtZUNvbG9yRml4dHVyZXMoKSB7XG5cdHJldHVybiB7XG5cdFx0VGFiU3RhdGVzOiBkZWZpbmVDb21wb25lbnRGaXh0dXJlKHsgcmVuZGVyOiByZW5kZXJUaGVtZUNvbG9ycyh7IGZvcmNlZEhvdmVyVGFiOiAyLCBmb2N1c2VkVGFiQWN0aW9uOiAyIH0pIH0pLFxuXHRcdEFjdGl2ZUFjdGlvbjogZGVmaW5lQ29tcG9uZW50Rml4dHVyZSh7IHJlbmRlcjogcmVuZGVyVGhlbWVDb2xvcnMoeyBmb2N1c2VkVGFiQWN0aW9uOiAzIH0pIH0pLFxuXHRcdEFjdGl2ZUhvdmVyOiBkZWZpbmVDb21wb25lbnRGaXh0dXJlKHsgcmVuZGVyOiByZW5kZXJUaGVtZUNvbG9ycyh7IGZvcmNlZEhvdmVyVGFiOiAzLCBmb2N1c2VkVGFiQWN0aW9uOiAzIH0pIH0pLFxuXHRcdFNlbGVjdGVkQWN0aW9uOiBkZWZpbmVDb21wb25lbnRGaXh0dXJlKHsgcmVuZGVyOiByZW5kZXJUaGVtZUNvbG9ycyh7IGVkaXRvcnM6IG11bHRpU2VsZWN0RWRpdG9yU3BlY3MoKSwgZm9jdXNlZFRhYkFjdGlvbjogMCB9KSB9KSxcblx0fTtcbn1cblxuZXhwb3J0IGRlZmF1bHQgZGVmaW5lVGhlbWVkRml4dHVyZUdyb3VwKHsgcGF0aDogJ2VkaXRvci9lZGl0b3JUYWJCYXIvJyB9LCB7XG5cdE1vZGVyblVJT2ZmOiBkZWZpbmVUaGVtZWRGaXh0dXJlR3JvdXAoY3JlYXRlRml4dHVyZXMoZmFsc2UsIFsnZGFya0hpZ2hDb250cmFzdCddKSksXG5cdE1vZGVyblVJT246IGRlZmluZVRoZW1lZEZpeHR1cmVHcm91cCh7XG5cdFx0Li4uY3JlYXRlRml4dHVyZXModHJ1ZSwgWydkYXJrSGlnaENvbnRyYXN0J10pLFxuXHRcdFRoZW1lQ29sb3JzOiBkZWZpbmVUaGVtZWRGaXh0dXJlR3JvdXAoY3JlYXRlVGhlbWVDb2xvckZpeHR1cmVzKCkpLFxuXHR9KSxcbn0pO1xuIl0sCiAgIm1hcHBpbmdzIjogIkFBS0EsU0FBUyxHQUFHLGlCQUFpQjtBQUM3QixTQUFTLGNBQWM7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
