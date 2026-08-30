var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __decorateClass = (decorators, target, key, kind) => {
  var result = kind > 1 ? void 0 : kind ? __getOwnPropDesc(target, key) : target;
  for (var i = decorators.length - 1, decorator; i >= 0; i--)
    if (decorator = decorators[i])
      result = (kind ? decorator(target, key, result) : decorator(result)) || result;
  if (kind && result) __defProp(target, key, result);
  return result;
};
var __decorateParam = (index, decorator) => (target, key) => decorator(target, key, index);
import * as dom from "../../../../base/browser/dom.js";
import { ActionBar } from "../../../../base/browser/ui/actionbar/actionbar.js";
import { findLast } from "../../../../base/common/arraysFind.js";
import { assertNever } from "../../../../base/common/assert.js";
import { Codicon } from "../../../../base/common/codicons.js";
import { memoize } from "../../../../base/common/decorators.js";
import { createMatches } from "../../../../base/common/filters.js";
import { Iterable } from "../../../../base/common/iterator.js";
import { Disposable, DisposableStore, MutableDisposable } from "../../../../base/common/lifecycle.js";
import { autorun, observableValue } from "../../../../base/common/observable.js";
import { basenameOrAuthority } from "../../../../base/common/resources.js";
import { ThemeIcon } from "../../../../base/common/themables.js";
import { Position } from "../../../../editor/common/core/position.js";
import { Range } from "../../../../editor/common/core/range.js";
import { localize, localize2 } from "../../../../nls.js";
import { Categories } from "../../../../platform/action/common/actionCommonCategories.js";
import { getActionBarActions } from "../../../../platform/actions/browser/menuEntryActionViewItem.js";
import { Action2, IMenuService, MenuId, registerAction2 } from "../../../../platform/actions/common/actions.js";
import { ICommandService } from "../../../../platform/commands/common/commands.js";
import { IConfigurationService } from "../../../../platform/configuration/common/configuration.js";
import { ContextKeyExpr, IContextKeyService } from "../../../../platform/contextkey/common/contextkey.js";
import { IContextMenuService } from "../../../../platform/contextview/browser/contextView.js";
import { EditorOpenSource, TextEditorSelectionRevealType } from "../../../../platform/editor/common/editor.js";
import { FileKind } from "../../../../platform/files/common/files.js";
import { IHoverService } from "../../../../platform/hover/browser/hover.js";
import { IInstantiationService } from "../../../../platform/instantiation/common/instantiation.js";
import { IKeybindingService } from "../../../../platform/keybinding/common/keybinding.js";
import { ILabelService } from "../../../../platform/label/common/label.js";
import { WorkbenchCompressibleObjectTree } from "../../../../platform/list/browser/listService.js";
import { IOpenerService } from "../../../../platform/opener/common/opener.js";
import { IStorageService, StorageScope, StorageTarget } from "../../../../platform/storage/common/storage.js";
import { IQuickInputService } from "../../../../platform/quickinput/common/quickInput.js";
import { IThemeService } from "../../../../platform/theme/common/themeService.js";
import { ResourceLabels } from "../../../browser/labels.js";
import { ViewAction, ViewPane } from "../../../browser/parts/views/viewPane.js";
import { IViewDescriptorService } from "../../../common/views.js";
import { ACTIVE_GROUP, IEditorService, SIDE_GROUP } from "../../../services/editor/common/editorService.js";
import { TestCommandId, Testing } from "../common/constants.js";
import { onObservableChange } from "../common/observableUtils.js";
import { BypassedFileCoverage, FileCoverage, getTotalCoveragePercent } from "../common/testCoverage.js";
import { ITestCoverageService } from "../common/testCoverageService.js";
import { TestId } from "../common/testId.js";
import { TestingContextKeys } from "../common/testingContextKeys.js";
import { DetailType, TestResultState } from "../common/testTypes.js";
import * as coverUtils from "./codeCoverageDisplayUtils.js";
import { testingStatesToIcons, testingWasCovered } from "./icons.js";
import { ManagedTestCoverageBars } from "./testCoverageBars.js";
var CoverageSortOrder = /* @__PURE__ */ ((CoverageSortOrder2) => {
  CoverageSortOrder2[CoverageSortOrder2["Coverage"] = 0] = "Coverage";
  CoverageSortOrder2[CoverageSortOrder2["Location"] = 1] = "Location";
  CoverageSortOrder2[CoverageSortOrder2["Name"] = 2] = "Name";
  return CoverageSortOrder2;
})(CoverageSortOrder || {});
let TestCoverageView = class extends ViewPane {
  constructor(options, keybindingService, contextMenuService, configurationService, contextKeyService, viewDescriptorService, instantiationService, openerService, themeService, hoverService, coverageService, storageService) {
    super(options, keybindingService, contextMenuService, configurationService, contextKeyService, viewDescriptorService, instantiationService, openerService, themeService, hoverService);
    this.coverageService = coverageService;
    this.storageService = storageService;
    this.tree = this._register(new MutableDisposable());
    this.sortOrder = observableValue("sortOrder", 1 /* Location */);
    const storedOrder = this.storageService.getNumber("testing.coverageSortOrder", StorageScope.WORKSPACE);
    if (storedOrder !== void 0 && storedOrder >= 0 /* Coverage */ && storedOrder <= 2 /* Name */) {
      this.sortOrder.set(storedOrder, void 0);
    }
  }
  renderBody(container) {
    super.renderBody(container);
    this._register(autorun((reader) => {
      const order = this.sortOrder.read(reader);
      this.storageService.store("testing.coverageSortOrder", order, StorageScope.WORKSPACE, StorageTarget.MACHINE);
    }));
    const labels = this._register(this.instantiationService.createInstance(ResourceLabels, { onDidChangeVisibility: this.onDidChangeBodyVisibility }));
    this._register(autorun((reader) => {
      const coverage = this.coverageService.selected.read(reader);
      if (coverage) {
        const t = this.tree.value ??= this.instantiationService.createInstance(TestCoverageTree, container, labels, this.sortOrder);
        t.setInput(coverage, this.coverageService.filterToTest.read(reader));
      } else {
        this.tree.clear();
      }
    }));
  }
  layoutBody(height, width) {
    super.layoutBody(height, width);
    this.tree.value?.layout(height, width);
  }
  collapseAll() {
    this.tree.value?.collapseAll();
  }
};
TestCoverageView = __decorateClass([
  __decorateParam(1, IKeybindingService),
  __decorateParam(2, IContextMenuService),
  __decorateParam(3, IConfigurationService),
  __decorateParam(4, IContextKeyService),
  __decorateParam(5, IViewDescriptorService),
  __decorateParam(6, IInstantiationService),
  __decorateParam(7, IOpenerService),
  __decorateParam(8, IThemeService),
  __decorateParam(9, IHoverService),
  __decorateParam(10, ITestCoverageService),
  __decorateParam(11, IStorageService)
], TestCoverageView);
let fnNodeId = 0;
class DeclarationCoverageNode {
  constructor(uri, data, details) {
    this.uri = uri;
    this.data = data;
    this.id = String(fnNodeId++);
    this.containedDetails = /* @__PURE__ */ new Set();
    this.children = [];
    if (data.location instanceof Range) {
      for (const detail of details) {
        if (this.contains(detail.location)) {
          this.containedDetails.add(detail);
        }
      }
    }
  }
  get hits() {
    return this.data.count;
  }
  get label() {
    return this.data.name;
  }
  get location() {
    return this.data.location;
  }
  get tpc() {
    const attr = this.attributableCoverage();
    return attr && getTotalCoveragePercent(attr.statement, attr.branch, void 0);
  }
  /** Gets whether this function has a defined range and contains the given range. */
  contains(location) {
    const own = this.data.location;
    return own instanceof Range && (location instanceof Range ? own.containsRange(location) : own.containsPosition(location));
  }
  attributableCoverage() {
    const { location, count } = this.data;
    if (!(location instanceof Range) || !count) {
      return;
    }
    const statement = { covered: 0, total: 0 };
    const branch = { covered: 0, total: 0 };
    for (const detail of this.containedDetails) {
      if (detail.type !== DetailType.Statement) {
        continue;
      }
      statement.covered += detail.count ? 1 : 0;
      statement.total++;
      if (detail.branches) {
        for (const { count: count2 } of detail.branches) {
          branch.covered += count2 ? 1 : 0;
          branch.total++;
        }
      }
    }
    return { statement, branch };
  }
}
__decorateClass([
  memoize
], DeclarationCoverageNode.prototype, "attributableCoverage", 1);
class RevealUncoveredDeclarations {
  constructor(n) {
    this.n = n;
    this.id = String(fnNodeId++);
  }
  get label() {
    return localize("functionsWithoutCoverage", "{0} declarations without coverage...", this.n);
  }
}
class CurrentlyFilteredTo {
  constructor(testItem) {
    this.testItem = testItem;
    this.id = String(fnNodeId++);
  }
  get label() {
    return localize("filteredToTest", 'Showing coverage for "{0}"', this.testItem.label);
  }
}
class LoadingDetails {
  constructor() {
    this.id = String(fnNodeId++);
    this.label = localize("loadingCoverageDetails", "Loading Coverage Details...");
  }
}
const isFileCoverage = (c) => typeof c === "object" && "value" in c;
const isDeclarationCoverage = (c) => c instanceof DeclarationCoverageNode;
const shouldShowDeclDetailsOnExpand = (c) => isFileCoverage(c) && c.value instanceof FileCoverage && !!c.value.declaration?.total;
let TestCoverageTree = class extends Disposable {
  constructor(container, labels, sortOrder, instantiationService, editorService, commandService) {
    super();
    this.inputDisposables = this._register(new DisposableStore());
    container.classList.add("testing-stdtree");
    this.tree = instantiationService.createInstance(
      WorkbenchCompressibleObjectTree,
      "TestCoverageView",
      container,
      new TestCoverageTreeListDelegate(),
      [
        instantiationService.createInstance(FileCoverageRenderer, labels),
        instantiationService.createInstance(DeclarationCoverageRenderer),
        instantiationService.createInstance(BasicRenderer),
        instantiationService.createInstance(CurrentlyFilteredToRenderer)
      ],
      {
        expandOnlyOnTwistieClick: true,
        sorter: new Sorter(sortOrder),
        keyboardNavigationLabelProvider: {
          getCompressedNodeKeyboardNavigationLabel(elements) {
            return elements.map((e) => this.getKeyboardNavigationLabel(e)).join("/");
          },
          getKeyboardNavigationLabel(e) {
            return isFileCoverage(e) ? basenameOrAuthority(e.value.uri) : e.label;
          }
        },
        accessibilityProvider: {
          getAriaLabel(element) {
            if (isFileCoverage(element)) {
              const name = basenameOrAuthority(element.value.uri);
              return localize("testCoverageItemLabel", "{0} coverage: {0}%", name, (element.value.tpc * 100).toFixed(2));
            } else {
              return element.label;
            }
          },
          getWidgetAriaLabel() {
            return localize("testCoverageTreeLabel", "Test Coverage Explorer");
          }
        },
        identityProvider: new TestCoverageIdentityProvider()
      }
    );
    this._register(autorun((reader) => {
      sortOrder.read(reader);
      this.tree.resort(null, true);
    }));
    this._register(this.tree);
    this._register(this.tree.onDidChangeCollapseState((e) => {
      const el = e.node.element;
      if (!e.node.collapsed && !e.node.children.length && el && shouldShowDeclDetailsOnExpand(el)) {
        if (el.value.hasSynchronousDetails) {
          this.tree.setChildren(el, [{ element: new LoadingDetails(), incompressible: true }]);
        }
        el.value.details().then((details) => this.updateWithDetails(el, details));
      }
    }));
    this._register(this.tree.onDidOpen((e) => {
      let resource;
      let selection;
      if (e.element) {
        if (isFileCoverage(e.element) && !e.element.children?.size) {
          resource = e.element.value.uri;
        } else if (isDeclarationCoverage(e.element)) {
          resource = e.element.uri;
          selection = e.element.location;
        } else if (e.element instanceof CurrentlyFilteredTo) {
          commandService.executeCommand(TestCommandId.CoverageFilterToTest);
          return;
        }
      }
      if (!resource) {
        return;
      }
      editorService.openEditor({
        resource,
        options: {
          selection: selection instanceof Position ? Range.fromPositions(selection, selection) : selection,
          revealIfOpened: true,
          selectionRevealType: TextEditorSelectionRevealType.NearTopIfOutsideViewport,
          preserveFocus: e.editorOptions.preserveFocus,
          pinned: e.editorOptions.pinned,
          source: EditorOpenSource.USER
        }
      }, e.sideBySide ? SIDE_GROUP : ACTIVE_GROUP);
    }));
  }
  setInput(coverage, showOnlyTest) {
    this.inputDisposables.clear();
    let tree = coverage.tree;
    if (showOnlyTest) {
      tree = coverage.filterTreeForTest(showOnlyTest);
    }
    const files = [];
    for (let node of tree.nodes) {
      while (!(node.value instanceof FileCoverage) && node.children?.size === 1) {
        node = Iterable.first(node.children.values());
      }
      files.push(node);
    }
    const toChild = (value) => {
      const isFile = !value.children?.size;
      return {
        element: value,
        incompressible: isFile,
        collapsed: isFile,
        // directories can be expanded, and items with function info can be expanded
        collapsible: !isFile || !!value.value?.declaration?.total,
        children: value.children && Iterable.map(value.children?.values(), toChild)
      };
    };
    this.inputDisposables.add(onObservableChange(coverage.didAddCoverage, (nodes) => {
      const toRender = findLast(nodes, (n) => this.tree.hasElement(n));
      if (toRender) {
        this.tree.setChildren(
          toRender,
          Iterable.map(toRender.children?.values() || [], toChild),
          { diffIdentityProvider: { getId: (el) => el.value.id } }
        );
      }
    }));
    let children = Iterable.map(files, toChild);
    const filteredTo = showOnlyTest && coverage.result.getTestById(showOnlyTest.toString());
    if (filteredTo) {
      children = Iterable.concat(
        Iterable.single({
          element: new CurrentlyFilteredTo(filteredTo),
          incompressible: true
        }),
        children
      );
    }
    this.tree.setChildren(null, children);
  }
  layout(height, width) {
    this.tree.layout(height, width);
  }
  collapseAll() {
    this.tree.collapseAll();
  }
  updateWithDetails(el, details) {
    if (!this.tree.hasElement(el)) {
      return;
    }
    const decl = [];
    for (const fn of details) {
      if (fn.type !== DetailType.Declaration) {
        continue;
      }
      let arr = decl;
      while (true) {
        const parent = arr.find((p) => p.containedDetails.has(fn));
        if (parent) {
          arr = parent.children;
        } else {
          break;
        }
      }
      arr.push(new DeclarationCoverageNode(el.value.uri, fn, details));
    }
    const makeChild = (fn) => ({
      element: fn,
      incompressible: true,
      collapsed: true,
      collapsible: fn.children.length > 0,
      children: fn.children.map(makeChild)
    });
    this.tree.setChildren(el, decl.map(makeChild));
  }
};
TestCoverageTree = __decorateClass([
  __decorateParam(3, IInstantiationService),
  __decorateParam(4, IEditorService),
  __decorateParam(5, ICommandService)
], TestCoverageTree);
class TestCoverageTreeListDelegate {
  getHeight(element) {
    return 22;
  }
  getTemplateId(element) {
    if (isFileCoverage(element)) {
      return FileCoverageRenderer.ID;
    }
    if (isDeclarationCoverage(element)) {
      return DeclarationCoverageRenderer.ID;
    }
    if (element instanceof LoadingDetails || element instanceof RevealUncoveredDeclarations) {
      return BasicRenderer.ID;
    }
    if (element instanceof CurrentlyFilteredTo) {
      return CurrentlyFilteredToRenderer.ID;
    }
    assertNever(element);
  }
}
class Sorter {
  constructor(order) {
    this.order = order;
  }
  compare(a, b) {
    const order = this.order.get();
    if (isFileCoverage(a) && isFileCoverage(b)) {
      switch (order) {
        case 1 /* Location */:
        case 2 /* Name */:
          return a.value.uri.toString().localeCompare(b.value.uri.toString());
        case 0 /* Coverage */:
          return b.value.tpc - a.value.tpc;
      }
    } else if (isDeclarationCoverage(a) && isDeclarationCoverage(b)) {
      switch (order) {
        case 1 /* Location */:
          return Position.compare(
            a.location instanceof Range ? a.location.getStartPosition() : a.location,
            b.location instanceof Range ? b.location.getStartPosition() : b.location
          );
        case 2 /* Name */:
          return a.label.localeCompare(b.label);
        case 0 /* Coverage */: {
          const attrA = a.tpc;
          const attrB = b.tpc;
          return attrA !== void 0 && attrB !== void 0 && attrB - attrA || +b.hits - +a.hits || a.label.localeCompare(b.label);
        }
      }
    } else {
      return 0;
    }
  }
}
let CurrentlyFilteredToRenderer = class {
  constructor(menuService, contextKeyService) {
    this.menuService = menuService;
    this.contextKeyService = contextKeyService;
    this.templateId = CurrentlyFilteredToRenderer.ID;
  }
  renderCompressedElements(node, index, templateData) {
    this.renderInner(node.element.elements[node.element.elements.length - 1], templateData);
  }
  renderTemplate(container) {
    container.classList.add("testing-stdtree-container");
    const label = dom.append(container, dom.$(".label"));
    const menu = this.menuService.getMenuActions(MenuId.TestCoverageFilterItem, this.contextKeyService, {
      shouldForwardArgs: true
    });
    const actions = new ActionBar(container);
    actions.push(getActionBarActions(menu, "inline").primary, { icon: true, label: false });
    actions.domNode.style.display = "block";
    return { label, actions };
  }
  renderElement(element, index, templateData) {
    this.renderInner(element.element, templateData);
  }
  disposeTemplate(templateData) {
    templateData.actions.dispose();
  }
  renderInner(element, container) {
    container.label.innerText = element.label;
  }
};
CurrentlyFilteredToRenderer.ID = "C";
CurrentlyFilteredToRenderer = __decorateClass([
  __decorateParam(0, IMenuService),
  __decorateParam(1, IContextKeyService)
], CurrentlyFilteredToRenderer);
let FileCoverageRenderer = class {
  constructor(labels, labelService, instantiationService) {
    this.labels = labels;
    this.labelService = labelService;
    this.instantiationService = instantiationService;
    this.templateId = FileCoverageRenderer.ID;
  }
  /** @inheritdoc */
  renderTemplate(container) {
    const templateDisposables = new DisposableStore();
    container.classList.add("testing-stdtree-container", "test-coverage-list-item");
    return {
      container,
      bars: templateDisposables.add(this.instantiationService.createInstance(ManagedTestCoverageBars, { compact: false, container })),
      label: templateDisposables.add(this.labels.create(container, {
        supportHighlights: true
      })),
      elementsDisposables: templateDisposables.add(new DisposableStore()),
      templateDisposables
    };
  }
  /** @inheritdoc */
  renderElement(node, _index, templateData) {
    this.doRender(node.element, templateData, node.filterData);
  }
  /** @inheritdoc */
  renderCompressedElements(node, _index, templateData) {
    this.doRender(node.element.elements, templateData, node.filterData);
  }
  disposeTemplate(templateData) {
    templateData.templateDisposables.dispose();
  }
  /** @inheritdoc */
  doRender(element, templateData, filterData) {
    templateData.elementsDisposables.clear();
    const stat = element instanceof Array ? element[element.length - 1] : element;
    const file = stat.value;
    const name = element instanceof Array ? element.map((e) => basenameOrAuthority(e.value.uri)) : basenameOrAuthority(file.uri);
    if (file instanceof BypassedFileCoverage) {
      templateData.bars.setCoverageInfo(void 0);
    } else {
      templateData.elementsDisposables.add(autorun((reader) => {
        stat.value?.didChange.read(reader);
        templateData.bars.setCoverageInfo(file);
      }));
      templateData.bars.setCoverageInfo(file);
    }
    templateData.label.setResource({ resource: file.uri, name }, {
      fileKind: stat.children?.size ? FileKind.FOLDER : FileKind.FILE,
      matches: createMatches(filterData),
      separator: this.labelService.getSeparator(file.uri.scheme, file.uri.authority),
      extraClasses: ["label"]
    });
  }
};
FileCoverageRenderer.ID = "F";
FileCoverageRenderer = __decorateClass([
  __decorateParam(1, ILabelService),
  __decorateParam(2, IInstantiationService)
], FileCoverageRenderer);
let DeclarationCoverageRenderer = class {
  constructor(instantiationService) {
    this.instantiationService = instantiationService;
    this.templateId = DeclarationCoverageRenderer.ID;
  }
  /** @inheritdoc */
  renderTemplate(container) {
    const templateDisposables = new DisposableStore();
    container.classList.add("test-coverage-list-item", "testing-stdtree-container");
    const icon = dom.append(container, dom.$(".state"));
    const label = dom.append(container, dom.$(".label"));
    return {
      container,
      bars: templateDisposables.add(this.instantiationService.createInstance(ManagedTestCoverageBars, { compact: false, container })),
      templateDisposables,
      icon,
      label
    };
  }
  /** @inheritdoc */
  renderElement(node, _index, templateData) {
    this.doRender(node.element, templateData, node.filterData);
  }
  /** @inheritdoc */
  renderCompressedElements(node, _index, templateData) {
    this.doRender(node.element.elements[node.element.elements.length - 1], templateData, node.filterData);
  }
  disposeTemplate(templateData) {
    templateData.templateDisposables.dispose();
  }
  /** @inheritdoc */
  doRender(element, templateData, _filterData) {
    const covered = !!element.hits;
    const icon = covered ? testingWasCovered : testingStatesToIcons.get(TestResultState.Unset);
    templateData.container.classList.toggle("not-covered", !covered);
    templateData.icon.className = `computed-state ${ThemeIcon.asClassName(icon)}`;
    templateData.label.innerText = element.label;
    templateData.bars.setCoverageInfo(element.attributableCoverage());
  }
};
DeclarationCoverageRenderer.ID = "N";
DeclarationCoverageRenderer = __decorateClass([
  __decorateParam(0, IInstantiationService)
], DeclarationCoverageRenderer);
const _BasicRenderer = class _BasicRenderer {
  constructor() {
    this.templateId = _BasicRenderer.ID;
  }
  renderCompressedElements(node, _index, container) {
    this.renderInner(node.element.elements[node.element.elements.length - 1], container);
  }
  renderTemplate(container) {
    return container;
  }
  renderElement(node, index, container) {
    this.renderInner(node.element, container);
  }
  disposeTemplate() {
  }
  renderInner(element, container) {
    container.innerText = element.label;
  }
};
_BasicRenderer.ID = "B";
let BasicRenderer = _BasicRenderer;
class TestCoverageIdentityProvider {
  getId(element) {
    return isFileCoverage(element) ? element.value.uri.toString() : element.id;
  }
}
registerAction2(class TestCoverageChangePerTestFilterAction extends Action2 {
  constructor() {
    super({
      id: TestCommandId.CoverageFilterToTest,
      category: Categories.Test,
      title: localize2("testing.changeCoverageFilter", "Filter Coverage by Test"),
      icon: Codicon.filter,
      toggled: {
        icon: Codicon.filterFilled,
        condition: TestingContextKeys.isCoverageFilteredToTest
      },
      menu: [
        { id: MenuId.CommandPalette, when: TestingContextKeys.hasPerTestCoverage },
        { id: MenuId.TestCoverageFilterItem, group: "inline" },
        {
          id: MenuId.ViewTitle,
          when: ContextKeyExpr.and(TestingContextKeys.hasPerTestCoverage, ContextKeyExpr.equals("view", Testing.CoverageViewId)),
          group: "navigation"
        }
      ]
    });
  }
  run(accessor) {
    const coverageService = accessor.get(ITestCoverageService);
    const quickInputService = accessor.get(IQuickInputService);
    const coverage = coverageService.selected.get();
    if (!coverage) {
      return;
    }
    const tests = [...coverage.allPerTestIDs()].map(TestId.fromString);
    const commonPrefix = TestId.getLengthOfCommonPrefix(tests.length, (i) => tests[i]);
    const result = coverage.result;
    const previousSelection = coverageService.filterToTest.get();
    const previousSelectionStr = previousSelection?.toString();
    const items = [
      { label: coverUtils.labels.allTests, id: void 0 },
      { type: "separator" },
      ...tests.map((testId) => ({ ...coverUtils.getLabelForItem(result, testId, commonPrefix), testId }))
    ];
    quickInputService.pick(items, {
      activeItem: items.find((item) => "testId" in item && item.testId?.toString() === previousSelectionStr),
      placeHolder: coverUtils.labels.pickShowCoverage,
      onDidFocus: (entry) => {
        coverageService.filterToTest.set(entry.testId, void 0);
      }
    }).then((selected) => {
      coverageService.filterToTest.set(selected ? selected.testId : previousSelection, void 0);
    });
  }
});
registerAction2(class TestCoverageChangeSortingAction extends ViewAction {
  constructor() {
    super({
      id: TestCommandId.CoverageViewChangeSorting,
      viewId: Testing.CoverageViewId,
      title: localize2("testing.changeCoverageSort", "Change Sort Order"),
      icon: Codicon.sortPrecedence,
      menu: {
        id: MenuId.ViewTitle,
        when: ContextKeyExpr.equals("view", Testing.CoverageViewId),
        group: "navigation",
        order: 1
      }
    });
  }
  runInView(accessor, view) {
    const disposables = new DisposableStore();
    const quickInput = disposables.add(accessor.get(IQuickInputService).createQuickPick());
    const items = [
      { label: localize("testing.coverageSortByLocation", "Sort by Location"), value: 1 /* Location */, description: localize("testing.coverageSortByLocationDescription", "Files are sorted alphabetically, declarations are sorted by position") },
      { label: localize("testing.coverageSortByCoverage", "Sort by Coverage"), value: 0 /* Coverage */, description: localize("testing.coverageSortByCoverageDescription", "Files and declarations are sorted by total coverage") },
      { label: localize("testing.coverageSortByName", "Sort by Name"), value: 2 /* Name */, description: localize("testing.coverageSortByNameDescription", "Files and declarations are sorted alphabetically") }
    ];
    quickInput.placeholder = localize("testing.coverageSortPlaceholder", "Sort the Test Coverage view...");
    quickInput.items = items;
    quickInput.show();
    disposables.add(quickInput.onDidHide(() => disposables.dispose()));
    disposables.add(quickInput.onDidAccept(() => {
      const picked = quickInput.selectedItems[0]?.value;
      if (picked !== void 0) {
        view.sortOrder.set(picked, void 0);
        quickInput.dispose();
      }
    }));
  }
});
registerAction2(class TestCoverageCollapseAllAction extends ViewAction {
  constructor() {
    super({
      id: TestCommandId.CoverageViewCollapseAll,
      viewId: Testing.CoverageViewId,
      title: localize2("testing.coverageCollapseAll", "Collapse All Coverage"),
      icon: Codicon.collapseAll,
      menu: {
        id: MenuId.ViewTitle,
        when: ContextKeyExpr.equals("view", Testing.CoverageViewId),
        group: "navigation",
        order: 2
      }
    });
  }
  runInView(_accessor, view) {
    view.collapseAll();
  }
});
export {
  TestCoverageView
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXHRlc3RpbmdcXGJyb3dzZXJcXHRlc3RDb3ZlcmFnZVZpZXcudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgKiBhcyBkb20gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL2RvbS5qcyc7XG5pbXBvcnQgeyBBY3Rpb25CYXIgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvdWkvYWN0aW9uYmFyL2FjdGlvbmJhci5qcyc7XG5pbXBvcnQgeyBJSWRlbnRpdHlQcm92aWRlciwgSUxpc3RWaXJ0dWFsRGVsZWdhdGUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvdWkvbGlzdC9saXN0LmpzJztcbmltcG9ydCB7IElDb21wcmVzc2VkVHJlZUVsZW1lbnQsIElDb21wcmVzc2VkVHJlZU5vZGUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvdWkvdHJlZS9jb21wcmVzc2VkT2JqZWN0VHJlZU1vZGVsLmpzJztcbmltcG9ydCB7IElDb21wcmVzc2libGVUcmVlUmVuZGVyZXIgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvdWkvdHJlZS9vYmplY3RUcmVlLmpzJztcbmltcG9ydCB7IElUcmVlTm9kZSwgSVRyZWVTb3J0ZXIgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvdWkvdHJlZS90cmVlLmpzJztcbmltcG9ydCB7IGZpbmRMYXN0IH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vYXJyYXlzRmluZC5qcyc7XG5pbXBvcnQgeyBhc3NlcnROZXZlciB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2Fzc2VydC5qcyc7XG5pbXBvcnQgeyBDb2RpY29uIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vY29kaWNvbnMuanMnO1xuaW1wb3J0IHsgbWVtb2l6ZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2RlY29yYXRvcnMuanMnO1xuaW1wb3J0IHsgRnV6enlTY29yZSwgY3JlYXRlTWF0Y2hlcyB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2ZpbHRlcnMuanMnO1xuaW1wb3J0IHsgSXRlcmFibGUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9pdGVyYXRvci5qcyc7XG5pbXBvcnQgeyBEaXNwb3NhYmxlLCBEaXNwb3NhYmxlU3RvcmUsIE11dGFibGVEaXNwb3NhYmxlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IElPYnNlcnZhYmxlLCBhdXRvcnVuLCBvYnNlcnZhYmxlVmFsdWUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9vYnNlcnZhYmxlLmpzJztcbmltcG9ydCB7IElQcmVmaXhUcmVlTm9kZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3ByZWZpeFRyZWUuanMnO1xuaW1wb3J0IHsgYmFzZW5hbWVPckF1dGhvcml0eSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3Jlc291cmNlcy5qcyc7XG5pbXBvcnQgeyBUaGVtZUljb24gfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi90aGVtYWJsZXMuanMnO1xuaW1wb3J0IHsgVVJJIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdXJpLmpzJztcbmltcG9ydCB7IFBvc2l0aW9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9jb3JlL3Bvc2l0aW9uLmpzJztcbmltcG9ydCB7IFJhbmdlIH0gZnJvbSAnLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9jb3JlL3JhbmdlLmpzJztcbmltcG9ydCB7IGxvY2FsaXplLCBsb2NhbGl6ZTIgfSBmcm9tICcuLi8uLi8uLi8uLi9ubHMuanMnO1xuaW1wb3J0IHsgQ2F0ZWdvcmllcyB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2FjdGlvbi9jb21tb24vYWN0aW9uQ29tbW9uQ2F0ZWdvcmllcy5qcyc7XG5pbXBvcnQgeyBnZXRBY3Rpb25CYXJBY3Rpb25zIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vYWN0aW9ucy9icm93c2VyL21lbnVFbnRyeUFjdGlvblZpZXdJdGVtLmpzJztcbmltcG9ydCB7IEFjdGlvbjIsIElNZW51U2VydmljZSwgTWVudUlkLCByZWdpc3RlckFjdGlvbjIgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9hY3Rpb25zL2NvbW1vbi9hY3Rpb25zLmpzJztcbmltcG9ydCB7IElDb21tYW5kU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbW1hbmRzL2NvbW1vbi9jb21tYW5kcy5qcyc7XG5pbXBvcnQgeyBJQ29uZmlndXJhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb25maWd1cmF0aW9uL2NvbW1vbi9jb25maWd1cmF0aW9uLmpzJztcbmltcG9ydCB7IENvbnRleHRLZXlFeHByLCBJQ29udGV4dEtleVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb250ZXh0a2V5L2NvbW1vbi9jb250ZXh0a2V5LmpzJztcbmltcG9ydCB7IElDb250ZXh0TWVudVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb250ZXh0dmlldy9icm93c2VyL2NvbnRleHRWaWV3LmpzJztcbmltcG9ydCB7IEVkaXRvck9wZW5Tb3VyY2UsIFRleHRFZGl0b3JTZWxlY3Rpb25SZXZlYWxUeXBlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vZWRpdG9yL2NvbW1vbi9lZGl0b3IuanMnO1xuaW1wb3J0IHsgRmlsZUtpbmQgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9maWxlcy9jb21tb24vZmlsZXMuanMnO1xuaW1wb3J0IHsgSUhvdmVyU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2hvdmVyL2Jyb3dzZXIvaG92ZXIuanMnO1xuaW1wb3J0IHsgSUluc3RhbnRpYXRpb25TZXJ2aWNlLCBTZXJ2aWNlc0FjY2Vzc29yIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vaW5zdGFudGlhdGlvbi9jb21tb24vaW5zdGFudGlhdGlvbi5qcyc7XG5pbXBvcnQgeyBJS2V5YmluZGluZ1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9rZXliaW5kaW5nL2NvbW1vbi9rZXliaW5kaW5nLmpzJztcbmltcG9ydCB7IElMYWJlbFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9sYWJlbC9jb21tb24vbGFiZWwuanMnO1xuaW1wb3J0IHsgV29ya2JlbmNoQ29tcHJlc3NpYmxlT2JqZWN0VHJlZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2xpc3QvYnJvd3Nlci9saXN0U2VydmljZS5qcyc7XG5pbXBvcnQgeyBJT3BlbmVyU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL29wZW5lci9jb21tb24vb3BlbmVyLmpzJztcbmltcG9ydCB7IElTdG9yYWdlU2VydmljZSwgU3RvcmFnZVNjb3BlLCBTdG9yYWdlVGFyZ2V0IH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vc3RvcmFnZS9jb21tb24vc3RvcmFnZS5qcyc7XG5pbXBvcnQgeyBJUXVpY2tJbnB1dFNlcnZpY2UsIElRdWlja1BpY2tJdGVtLCBRdWlja1BpY2tJbnB1dCB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3F1aWNraW5wdXQvY29tbW9uL3F1aWNrSW5wdXQuanMnO1xuaW1wb3J0IHsgSVRoZW1lU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3RoZW1lL2NvbW1vbi90aGVtZVNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSVJlc291cmNlTGFiZWwsIFJlc291cmNlTGFiZWxzIH0gZnJvbSAnLi4vLi4vLi4vYnJvd3Nlci9sYWJlbHMuanMnO1xuaW1wb3J0IHsgSVZpZXdQYW5lT3B0aW9ucywgVmlld0FjdGlvbiwgVmlld1BhbmUgfSBmcm9tICcuLi8uLi8uLi9icm93c2VyL3BhcnRzL3ZpZXdzL3ZpZXdQYW5lLmpzJztcbmltcG9ydCB7IElWaWV3RGVzY3JpcHRvclNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vdmlld3MuanMnO1xuaW1wb3J0IHsgQUNUSVZFX0dST1VQLCBJRWRpdG9yU2VydmljZSwgU0lERV9HUk9VUCB9IGZyb20gJy4uLy4uLy4uL3NlcnZpY2VzL2VkaXRvci9jb21tb24vZWRpdG9yU2VydmljZS5qcyc7XG5pbXBvcnQgeyBUZXN0Q29tbWFuZElkLCBUZXN0aW5nIH0gZnJvbSAnLi4vY29tbW9uL2NvbnN0YW50cy5qcyc7XG5pbXBvcnQgeyBvbk9ic2VydmFibGVDaGFuZ2UgfSBmcm9tICcuLi9jb21tb24vb2JzZXJ2YWJsZVV0aWxzLmpzJztcbmltcG9ydCB7IEJ5cGFzc2VkRmlsZUNvdmVyYWdlLCBDb21wdXRlZEZpbGVDb3ZlcmFnZSwgRmlsZUNvdmVyYWdlLCBUZXN0Q292ZXJhZ2UsIGdldFRvdGFsQ292ZXJhZ2VQZXJjZW50IH0gZnJvbSAnLi4vY29tbW9uL3Rlc3RDb3ZlcmFnZS5qcyc7XG5pbXBvcnQgeyBJVGVzdENvdmVyYWdlU2VydmljZSB9IGZyb20gJy4uL2NvbW1vbi90ZXN0Q292ZXJhZ2VTZXJ2aWNlLmpzJztcbmltcG9ydCB7IFRlc3RJZCB9IGZyb20gJy4uL2NvbW1vbi90ZXN0SWQuanMnO1xuaW1wb3J0IHsgVGVzdGluZ0NvbnRleHRLZXlzIH0gZnJvbSAnLi4vY29tbW9uL3Rlc3RpbmdDb250ZXh0S2V5cy5qcyc7XG5pbXBvcnQgeyBDb3ZlcmFnZURldGFpbHMsIERldGFpbFR5cGUsIElDb3ZlcmFnZUNvdW50LCBJRGVjbGFyYXRpb25Db3ZlcmFnZSwgSVRlc3RJdGVtLCBUZXN0UmVzdWx0U3RhdGUgfSBmcm9tICcuLi9jb21tb24vdGVzdFR5cGVzLmpzJztcbmltcG9ydCAqIGFzIGNvdmVyVXRpbHMgZnJvbSAnLi9jb2RlQ292ZXJhZ2VEaXNwbGF5VXRpbHMuanMnO1xuaW1wb3J0IHsgdGVzdGluZ1N0YXRlc1RvSWNvbnMsIHRlc3RpbmdXYXNDb3ZlcmVkIH0gZnJvbSAnLi9pY29ucy5qcyc7XG5pbXBvcnQgeyBDb3ZlcmFnZUJhclNvdXJjZSwgTWFuYWdlZFRlc3RDb3ZlcmFnZUJhcnMgfSBmcm9tICcuL3Rlc3RDb3ZlcmFnZUJhcnMuanMnO1xuXG5jb25zdCBlbnVtIENvdmVyYWdlU29ydE9yZGVyIHtcblx0Q292ZXJhZ2UsXG5cdExvY2F0aW9uLFxuXHROYW1lLFxufVxuXG5leHBvcnQgY2xhc3MgVGVzdENvdmVyYWdlVmlldyBleHRlbmRzIFZpZXdQYW5lIHtcblx0cHJpdmF0ZSByZWFkb25seSB0cmVlID0gdGhpcy5fcmVnaXN0ZXIobmV3IE11dGFibGVEaXNwb3NhYmxlPFRlc3RDb3ZlcmFnZVRyZWU+KCkpO1xuXHRwdWJsaWMgcmVhZG9ubHkgc29ydE9yZGVyID0gb2JzZXJ2YWJsZVZhbHVlKCdzb3J0T3JkZXInLCBDb3ZlcmFnZVNvcnRPcmRlci5Mb2NhdGlvbik7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0b3B0aW9uczogSVZpZXdQYW5lT3B0aW9ucyxcblx0XHRASUtleWJpbmRpbmdTZXJ2aWNlIGtleWJpbmRpbmdTZXJ2aWNlOiBJS2V5YmluZGluZ1NlcnZpY2UsXG5cdFx0QElDb250ZXh0TWVudVNlcnZpY2UgY29udGV4dE1lbnVTZXJ2aWNlOiBJQ29udGV4dE1lbnVTZXJ2aWNlLFxuXHRcdEBJQ29uZmlndXJhdGlvblNlcnZpY2UgY29uZmlndXJhdGlvblNlcnZpY2U6IElDb25maWd1cmF0aW9uU2VydmljZSxcblx0XHRASUNvbnRleHRLZXlTZXJ2aWNlIGNvbnRleHRLZXlTZXJ2aWNlOiBJQ29udGV4dEtleVNlcnZpY2UsXG5cdFx0QElWaWV3RGVzY3JpcHRvclNlcnZpY2Ugdmlld0Rlc2NyaXB0b3JTZXJ2aWNlOiBJVmlld0Rlc2NyaXB0b3JTZXJ2aWNlLFxuXHRcdEBJSW5zdGFudGlhdGlvblNlcnZpY2UgaW5zdGFudGlhdGlvblNlcnZpY2U6IElJbnN0YW50aWF0aW9uU2VydmljZSxcblx0XHRASU9wZW5lclNlcnZpY2Ugb3BlbmVyU2VydmljZTogSU9wZW5lclNlcnZpY2UsXG5cdFx0QElUaGVtZVNlcnZpY2UgdGhlbWVTZXJ2aWNlOiBJVGhlbWVTZXJ2aWNlLFxuXHRcdEBJSG92ZXJTZXJ2aWNlIGhvdmVyU2VydmljZTogSUhvdmVyU2VydmljZSxcblx0XHRASVRlc3RDb3ZlcmFnZVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBjb3ZlcmFnZVNlcnZpY2U6IElUZXN0Q292ZXJhZ2VTZXJ2aWNlLFxuXHRcdEBJU3RvcmFnZVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBzdG9yYWdlU2VydmljZTogSVN0b3JhZ2VTZXJ2aWNlLFxuXHQpIHtcblx0XHRzdXBlcihvcHRpb25zLCBrZXliaW5kaW5nU2VydmljZSwgY29udGV4dE1lbnVTZXJ2aWNlLCBjb25maWd1cmF0aW9uU2VydmljZSwgY29udGV4dEtleVNlcnZpY2UsIHZpZXdEZXNjcmlwdG9yU2VydmljZSwgaW5zdGFudGlhdGlvblNlcnZpY2UsIG9wZW5lclNlcnZpY2UsIHRoZW1lU2VydmljZSwgaG92ZXJTZXJ2aWNlKTtcblx0XHRjb25zdCBzdG9yZWRPcmRlciA9IHRoaXMuc3RvcmFnZVNlcnZpY2UuZ2V0TnVtYmVyKCd0ZXN0aW5nLmNvdmVyYWdlU29ydE9yZGVyJywgU3RvcmFnZVNjb3BlLldPUktTUEFDRSk7XG5cdFx0aWYgKHN0b3JlZE9yZGVyICE9PSB1bmRlZmluZWQgJiYgc3RvcmVkT3JkZXIgPj0gQ292ZXJhZ2VTb3J0T3JkZXIuQ292ZXJhZ2UgJiYgc3RvcmVkT3JkZXIgPD0gQ292ZXJhZ2VTb3J0T3JkZXIuTmFtZSkge1xuXHRcdFx0dGhpcy5zb3J0T3JkZXIuc2V0KHN0b3JlZE9yZGVyLCB1bmRlZmluZWQpO1xuXHRcdH1cblx0fVxuXG5cdHByb3RlY3RlZCBvdmVycmlkZSByZW5kZXJCb2R5KGNvbnRhaW5lcjogSFRNTEVsZW1lbnQpOiB2b2lkIHtcblx0XHRzdXBlci5yZW5kZXJCb2R5KGNvbnRhaW5lcik7XG5cblx0XHR0aGlzLl9yZWdpc3RlcihhdXRvcnVuKHJlYWRlciA9PiB7XG5cdFx0XHRjb25zdCBvcmRlciA9IHRoaXMuc29ydE9yZGVyLnJlYWQocmVhZGVyKTtcblx0XHRcdHRoaXMuc3RvcmFnZVNlcnZpY2Uuc3RvcmUoJ3Rlc3RpbmcuY292ZXJhZ2VTb3J0T3JkZXInLCBvcmRlciwgU3RvcmFnZVNjb3BlLldPUktTUEFDRSwgU3RvcmFnZVRhcmdldC5NQUNISU5FKTtcblx0XHR9KSk7XG5cblx0XHRjb25zdCBsYWJlbHMgPSB0aGlzLl9yZWdpc3Rlcih0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFJlc291cmNlTGFiZWxzLCB7IG9uRGlkQ2hhbmdlVmlzaWJpbGl0eTogdGhpcy5vbkRpZENoYW5nZUJvZHlWaXNpYmlsaXR5IH0pKTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKGF1dG9ydW4ocmVhZGVyID0+IHtcblx0XHRcdGNvbnN0IGNvdmVyYWdlID0gdGhpcy5jb3ZlcmFnZVNlcnZpY2Uuc2VsZWN0ZWQucmVhZChyZWFkZXIpO1xuXHRcdFx0aWYgKGNvdmVyYWdlKSB7XG5cdFx0XHRcdGNvbnN0IHQgPSAodGhpcy50cmVlLnZhbHVlID8/PSB0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFRlc3RDb3ZlcmFnZVRyZWUsIGNvbnRhaW5lciwgbGFiZWxzLCB0aGlzLnNvcnRPcmRlcikpO1xuXHRcdFx0XHR0LnNldElucHV0KGNvdmVyYWdlLCB0aGlzLmNvdmVyYWdlU2VydmljZS5maWx0ZXJUb1Rlc3QucmVhZChyZWFkZXIpKTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdHRoaXMudHJlZS5jbGVhcigpO1xuXHRcdFx0fVxuXHRcdH0pKTtcblx0fVxuXG5cdHByb3RlY3RlZCBvdmVycmlkZSBsYXlvdXRCb2R5KGhlaWdodDogbnVtYmVyLCB3aWR0aDogbnVtYmVyKTogdm9pZCB7XG5cdFx0c3VwZXIubGF5b3V0Qm9keShoZWlnaHQsIHdpZHRoKTtcblx0XHR0aGlzLnRyZWUudmFsdWU/LmxheW91dChoZWlnaHQsIHdpZHRoKTtcblx0fVxuXG5cdHB1YmxpYyBjb2xsYXBzZUFsbCgpOiB2b2lkIHtcblx0XHR0aGlzLnRyZWUudmFsdWU/LmNvbGxhcHNlQWxsKCk7XG5cdH1cbn1cblxubGV0IGZuTm9kZUlkID0gMDtcblxuY2xhc3MgRGVjbGFyYXRpb25Db3ZlcmFnZU5vZGUge1xuXHRwdWJsaWMgcmVhZG9ubHkgaWQgPSBTdHJpbmcoZm5Ob2RlSWQrKyk7XG5cdHB1YmxpYyByZWFkb25seSBjb250YWluZWREZXRhaWxzID0gbmV3IFNldDxDb3ZlcmFnZURldGFpbHM+KCk7XG5cdHB1YmxpYyByZWFkb25seSBjaGlsZHJlbjogRGVjbGFyYXRpb25Db3ZlcmFnZU5vZGVbXSA9IFtdO1xuXG5cdHB1YmxpYyBnZXQgaGl0cygpIHtcblx0XHRyZXR1cm4gdGhpcy5kYXRhLmNvdW50O1xuXHR9XG5cblx0cHVibGljIGdldCBsYWJlbCgpIHtcblx0XHRyZXR1cm4gdGhpcy5kYXRhLm5hbWU7XG5cdH1cblxuXHRwdWJsaWMgZ2V0IGxvY2F0aW9uKCkge1xuXHRcdHJldHVybiB0aGlzLmRhdGEubG9jYXRpb247XG5cdH1cblxuXHRwdWJsaWMgZ2V0IHRwYygpIHtcblx0XHRjb25zdCBhdHRyID0gdGhpcy5hdHRyaWJ1dGFibGVDb3ZlcmFnZSgpO1xuXHRcdHJldHVybiBhdHRyICYmIGdldFRvdGFsQ292ZXJhZ2VQZXJjZW50KGF0dHIuc3RhdGVtZW50LCBhdHRyLmJyYW5jaCwgdW5kZWZpbmVkKTtcblx0fVxuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdHB1YmxpYyByZWFkb25seSB1cmk6IFVSSSxcblx0XHRwcml2YXRlIHJlYWRvbmx5IGRhdGE6IElEZWNsYXJhdGlvbkNvdmVyYWdlLFxuXHRcdGRldGFpbHM6IHJlYWRvbmx5IENvdmVyYWdlRGV0YWlsc1tdLFxuXHQpIHtcblx0XHRpZiAoZGF0YS5sb2NhdGlvbiBpbnN0YW5jZW9mIFJhbmdlKSB7XG5cdFx0XHRmb3IgKGNvbnN0IGRldGFpbCBvZiBkZXRhaWxzKSB7XG5cdFx0XHRcdGlmICh0aGlzLmNvbnRhaW5zKGRldGFpbC5sb2NhdGlvbikpIHtcblx0XHRcdFx0XHR0aGlzLmNvbnRhaW5lZERldGFpbHMuYWRkKGRldGFpbCk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cdH1cblxuXHQvKiogR2V0cyB3aGV0aGVyIHRoaXMgZnVuY3Rpb24gaGFzIGEgZGVmaW5lZCByYW5nZSBhbmQgY29udGFpbnMgdGhlIGdpdmVuIHJhbmdlLiAqL1xuXHRwdWJsaWMgY29udGFpbnMobG9jYXRpb246IFJhbmdlIHwgUG9zaXRpb24pIHtcblx0XHRjb25zdCBvd24gPSB0aGlzLmRhdGEubG9jYXRpb247XG5cdFx0cmV0dXJuIG93biBpbnN0YW5jZW9mIFJhbmdlICYmIChsb2NhdGlvbiBpbnN0YW5jZW9mIFJhbmdlID8gb3duLmNvbnRhaW5zUmFuZ2UobG9jYXRpb24pIDogb3duLmNvbnRhaW5zUG9zaXRpb24obG9jYXRpb24pKTtcblx0fVxuXG5cdC8qKlxuXHQgKiBJZiB0aGUgZnVuY3Rpb24gZGVmaW5lcyBhIHJhbmdlLCB3ZSBjYW4gbG9vayBhdCBzdGF0ZW1lbnRzIHdpdGhpbiB0aGVcblx0ICogZnVuY3Rpb24gdG8gZ2V0IHRvdGFsIGNvdmVyYWdlIGZvciB0aGUgZnVuY3Rpb24sIHJhdGhlciB0aGFuIGEgYm9vbGVhblxuXHQgKiB5ZXMvbm8uXG5cdCAqL1xuXHRAbWVtb2l6ZVxuXHRwdWJsaWMgYXR0cmlidXRhYmxlQ292ZXJhZ2UoKSB7XG5cdFx0Y29uc3QgeyBsb2NhdGlvbiwgY291bnQgfSA9IHRoaXMuZGF0YTtcblx0XHRpZiAoIShsb2NhdGlvbiBpbnN0YW5jZW9mIFJhbmdlKSB8fCAhY291bnQpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCBzdGF0ZW1lbnQ6IElDb3ZlcmFnZUNvdW50ID0geyBjb3ZlcmVkOiAwLCB0b3RhbDogMCB9O1xuXHRcdGNvbnN0IGJyYW5jaDogSUNvdmVyYWdlQ291bnQgPSB7IGNvdmVyZWQ6IDAsIHRvdGFsOiAwIH07XG5cdFx0Zm9yIChjb25zdCBkZXRhaWwgb2YgdGhpcy5jb250YWluZWREZXRhaWxzKSB7XG5cdFx0XHRpZiAoZGV0YWlsLnR5cGUgIT09IERldGFpbFR5cGUuU3RhdGVtZW50KSB7XG5cdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0fVxuXG5cdFx0XHRzdGF0ZW1lbnQuY292ZXJlZCArPSBkZXRhaWwuY291bnQgPyAxIDogMDtcblx0XHRcdHN0YXRlbWVudC50b3RhbCsrO1xuXHRcdFx0aWYgKGRldGFpbC5icmFuY2hlcykge1xuXHRcdFx0XHRmb3IgKGNvbnN0IHsgY291bnQgfSBvZiBkZXRhaWwuYnJhbmNoZXMpIHtcblx0XHRcdFx0XHRicmFuY2guY292ZXJlZCArPSBjb3VudCA/IDEgOiAwO1xuXHRcdFx0XHRcdGJyYW5jaC50b3RhbCsrO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHsgc3RhdGVtZW50LCBicmFuY2ggfSBzYXRpc2ZpZXMgQ292ZXJhZ2VCYXJTb3VyY2U7XG5cdH1cbn1cblxuY2xhc3MgUmV2ZWFsVW5jb3ZlcmVkRGVjbGFyYXRpb25zIHtcblx0cHVibGljIHJlYWRvbmx5IGlkID0gU3RyaW5nKGZuTm9kZUlkKyspO1xuXG5cdHB1YmxpYyBnZXQgbGFiZWwoKSB7XG5cdFx0cmV0dXJuIGxvY2FsaXplKCdmdW5jdGlvbnNXaXRob3V0Q292ZXJhZ2UnLCBcInswfSBkZWNsYXJhdGlvbnMgd2l0aG91dCBjb3ZlcmFnZS4uLlwiLCB0aGlzLm4pO1xuXHR9XG5cblx0Y29uc3RydWN0b3IocHVibGljIHJlYWRvbmx5IG46IG51bWJlcikgeyB9XG59XG5cbmNsYXNzIEN1cnJlbnRseUZpbHRlcmVkVG8ge1xuXHRwdWJsaWMgcmVhZG9ubHkgaWQgPSBTdHJpbmcoZm5Ob2RlSWQrKyk7XG5cblx0cHVibGljIGdldCBsYWJlbCgpIHtcblx0XHRyZXR1cm4gbG9jYWxpemUoJ2ZpbHRlcmVkVG9UZXN0JywgXCJTaG93aW5nIGNvdmVyYWdlIGZvciBcXFwiezB9XFxcIlwiLCB0aGlzLnRlc3RJdGVtLmxhYmVsKTtcblx0fVxuXG5cdGNvbnN0cnVjdG9yKHB1YmxpYyByZWFkb25seSB0ZXN0SXRlbTogSVRlc3RJdGVtKSB7IH1cbn1cblxuY2xhc3MgTG9hZGluZ0RldGFpbHMge1xuXHRwdWJsaWMgcmVhZG9ubHkgaWQgPSBTdHJpbmcoZm5Ob2RlSWQrKyk7XG5cdHB1YmxpYyByZWFkb25seSBsYWJlbCA9IGxvY2FsaXplKCdsb2FkaW5nQ292ZXJhZ2VEZXRhaWxzJywgXCJMb2FkaW5nIENvdmVyYWdlIERldGFpbHMuLi5cIik7XG59XG5cbi8qKiBUeXBlIG9mIG5vZGVzIHJldHVybmVkIGZyb20ge0BsaW5rIFRlc3RDb3ZlcmFnZX0uIE5vdGU6IHZhbHVlIGlzICphbHdheXMqIGRlZmluZWQuICovXG50eXBlIFRlc3RDb3ZlcmFnZUZpbGVOb2RlID0gSVByZWZpeFRyZWVOb2RlPENvbXB1dGVkRmlsZUNvdmVyYWdlIHwgRmlsZUNvdmVyYWdlPjtcbnR5cGUgQ292ZXJhZ2VUcmVlRWxlbWVudCA9IFRlc3RDb3ZlcmFnZUZpbGVOb2RlIHwgRGVjbGFyYXRpb25Db3ZlcmFnZU5vZGUgfCBMb2FkaW5nRGV0YWlscyB8IFJldmVhbFVuY292ZXJlZERlY2xhcmF0aW9ucyB8IEN1cnJlbnRseUZpbHRlcmVkVG87XG5cbmNvbnN0IGlzRmlsZUNvdmVyYWdlID0gKGM6IENvdmVyYWdlVHJlZUVsZW1lbnQpOiBjIGlzIFRlc3RDb3ZlcmFnZUZpbGVOb2RlID0+IHR5cGVvZiBjID09PSAnb2JqZWN0JyAmJiAndmFsdWUnIGluIGM7XG5jb25zdCBpc0RlY2xhcmF0aW9uQ292ZXJhZ2UgPSAoYzogQ292ZXJhZ2VUcmVlRWxlbWVudCk6IGMgaXMgRGVjbGFyYXRpb25Db3ZlcmFnZU5vZGUgPT4gYyBpbnN0YW5jZW9mIERlY2xhcmF0aW9uQ292ZXJhZ2VOb2RlO1xuY29uc3Qgc2hvdWxkU2hvd0RlY2xEZXRhaWxzT25FeHBhbmQgPSAoYzogQ292ZXJhZ2VUcmVlRWxlbWVudCk6IGMgaXMgSVByZWZpeFRyZWVOb2RlPEZpbGVDb3ZlcmFnZT4gPT5cblx0aXNGaWxlQ292ZXJhZ2UoYykgJiYgYy52YWx1ZSBpbnN0YW5jZW9mIEZpbGVDb3ZlcmFnZSAmJiAhIWMudmFsdWUuZGVjbGFyYXRpb24/LnRvdGFsO1xuXG5jbGFzcyBUZXN0Q292ZXJhZ2VUcmVlIGV4dGVuZHMgRGlzcG9zYWJsZSB7XG5cdHByaXZhdGUgcmVhZG9ubHkgdHJlZTogV29ya2JlbmNoQ29tcHJlc3NpYmxlT2JqZWN0VHJlZTxDb3ZlcmFnZVRyZWVFbGVtZW50LCB2b2lkPjtcblx0cHJpdmF0ZSByZWFkb25seSBpbnB1dERpc3Bvc2FibGVzID0gdGhpcy5fcmVnaXN0ZXIobmV3IERpc3Bvc2FibGVTdG9yZSgpKTtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRjb250YWluZXI6IEhUTUxFbGVtZW50LFxuXHRcdGxhYmVsczogUmVzb3VyY2VMYWJlbHMsXG5cdFx0c29ydE9yZGVyOiBJT2JzZXJ2YWJsZTxDb3ZlcmFnZVNvcnRPcmRlcj4sXG5cdFx0QElJbnN0YW50aWF0aW9uU2VydmljZSBpbnN0YW50aWF0aW9uU2VydmljZTogSUluc3RhbnRpYXRpb25TZXJ2aWNlLFxuXHRcdEBJRWRpdG9yU2VydmljZSBlZGl0b3JTZXJ2aWNlOiBJRWRpdG9yU2VydmljZSxcblx0XHRASUNvbW1hbmRTZXJ2aWNlIGNvbW1hbmRTZXJ2aWNlOiBJQ29tbWFuZFNlcnZpY2UsXG5cdCkge1xuXHRcdHN1cGVyKCk7XG5cblx0XHRjb250YWluZXIuY2xhc3NMaXN0LmFkZCgndGVzdGluZy1zdGR0cmVlJyk7XG5cblx0XHR0aGlzLnRyZWUgPSBpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShcblx0XHRcdFdvcmtiZW5jaENvbXByZXNzaWJsZU9iamVjdFRyZWU8Q292ZXJhZ2VUcmVlRWxlbWVudCwgdm9pZD4sXG5cdFx0XHQnVGVzdENvdmVyYWdlVmlldycsXG5cdFx0XHRjb250YWluZXIsXG5cdFx0XHRuZXcgVGVzdENvdmVyYWdlVHJlZUxpc3REZWxlZ2F0ZSgpLFxuXHRcdFx0W1xuXHRcdFx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShGaWxlQ292ZXJhZ2VSZW5kZXJlciwgbGFiZWxzKSxcblx0XHRcdFx0aW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoRGVjbGFyYXRpb25Db3ZlcmFnZVJlbmRlcmVyKSxcblx0XHRcdFx0aW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoQmFzaWNSZW5kZXJlciksXG5cdFx0XHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKEN1cnJlbnRseUZpbHRlcmVkVG9SZW5kZXJlciksXG5cdFx0XHRdLFxuXHRcdFx0e1xuXHRcdFx0XHRleHBhbmRPbmx5T25Ud2lzdGllQ2xpY2s6IHRydWUsXG5cdFx0XHRcdHNvcnRlcjogbmV3IFNvcnRlcihzb3J0T3JkZXIpLFxuXHRcdFx0XHRrZXlib2FyZE5hdmlnYXRpb25MYWJlbFByb3ZpZGVyOiB7XG5cdFx0XHRcdFx0Z2V0Q29tcHJlc3NlZE5vZGVLZXlib2FyZE5hdmlnYXRpb25MYWJlbChlbGVtZW50czogQ292ZXJhZ2VUcmVlRWxlbWVudFtdKSB7XG5cdFx0XHRcdFx0XHRyZXR1cm4gZWxlbWVudHMubWFwKGUgPT4gdGhpcy5nZXRLZXlib2FyZE5hdmlnYXRpb25MYWJlbChlKSkuam9pbignLycpO1xuXHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0Z2V0S2V5Ym9hcmROYXZpZ2F0aW9uTGFiZWwoZTogQ292ZXJhZ2VUcmVlRWxlbWVudCkge1xuXHRcdFx0XHRcdFx0cmV0dXJuIGlzRmlsZUNvdmVyYWdlKGUpXG5cdFx0XHRcdFx0XHRcdD8gYmFzZW5hbWVPckF1dGhvcml0eShlLnZhbHVlIS51cmkpXG5cdFx0XHRcdFx0XHRcdDogZS5sYWJlbDtcblx0XHRcdFx0XHR9LFxuXHRcdFx0XHR9LFxuXHRcdFx0XHRhY2Nlc3NpYmlsaXR5UHJvdmlkZXI6IHtcblx0XHRcdFx0XHRnZXRBcmlhTGFiZWwoZWxlbWVudDogQ292ZXJhZ2VUcmVlRWxlbWVudCkge1xuXHRcdFx0XHRcdFx0aWYgKGlzRmlsZUNvdmVyYWdlKGVsZW1lbnQpKSB7XG5cdFx0XHRcdFx0XHRcdGNvbnN0IG5hbWUgPSBiYXNlbmFtZU9yQXV0aG9yaXR5KGVsZW1lbnQudmFsdWUhLnVyaSk7XG5cdFx0XHRcdFx0XHRcdHJldHVybiBsb2NhbGl6ZSgndGVzdENvdmVyYWdlSXRlbUxhYmVsJywgXCJ7MH0gY292ZXJhZ2U6IHswfSVcIiwgbmFtZSwgKGVsZW1lbnQudmFsdWUhLnRwYyAqIDEwMCkudG9GaXhlZCgyKSk7XG5cdFx0XHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdFx0XHRyZXR1cm4gZWxlbWVudC5sYWJlbDtcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdGdldFdpZGdldEFyaWFMYWJlbCgpIHtcblx0XHRcdFx0XHRcdHJldHVybiBsb2NhbGl6ZSgndGVzdENvdmVyYWdlVHJlZUxhYmVsJywgXCJUZXN0IENvdmVyYWdlIEV4cGxvcmVyXCIpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fSxcblx0XHRcdFx0aWRlbnRpdHlQcm92aWRlcjogbmV3IFRlc3RDb3ZlcmFnZUlkZW50aXR5UHJvdmlkZXIoKSxcblx0XHRcdH1cblx0XHQpO1xuXG5cdFx0dGhpcy5fcmVnaXN0ZXIoYXV0b3J1bihyZWFkZXIgPT4ge1xuXHRcdFx0c29ydE9yZGVyLnJlYWQocmVhZGVyKTtcblx0XHRcdHRoaXMudHJlZS5yZXNvcnQobnVsbCwgdHJ1ZSk7XG5cdFx0fSkpO1xuXG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy50cmVlKTtcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLnRyZWUub25EaWRDaGFuZ2VDb2xsYXBzZVN0YXRlKGUgPT4ge1xuXHRcdFx0Y29uc3QgZWwgPSBlLm5vZGUuZWxlbWVudDtcblx0XHRcdGlmICghZS5ub2RlLmNvbGxhcHNlZCAmJiAhZS5ub2RlLmNoaWxkcmVuLmxlbmd0aCAmJiBlbCAmJiBzaG91bGRTaG93RGVjbERldGFpbHNPbkV4cGFuZChlbCkpIHtcblx0XHRcdFx0aWYgKGVsLnZhbHVlIS5oYXNTeW5jaHJvbm91c0RldGFpbHMpIHtcblx0XHRcdFx0XHR0aGlzLnRyZWUuc2V0Q2hpbGRyZW4oZWwsIFt7IGVsZW1lbnQ6IG5ldyBMb2FkaW5nRGV0YWlscygpLCBpbmNvbXByZXNzaWJsZTogdHJ1ZSB9XSk7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRlbC52YWx1ZSEuZGV0YWlscygpLnRoZW4oZGV0YWlscyA9PiB0aGlzLnVwZGF0ZVdpdGhEZXRhaWxzKGVsLCBkZXRhaWxzKSk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMudHJlZS5vbkRpZE9wZW4oZSA9PiB7XG5cdFx0XHRsZXQgcmVzb3VyY2U6IFVSSSB8IHVuZGVmaW5lZDtcblx0XHRcdGxldCBzZWxlY3Rpb246IFJhbmdlIHwgUG9zaXRpb24gfCB1bmRlZmluZWQ7XG5cdFx0XHRpZiAoZS5lbGVtZW50KSB7XG5cdFx0XHRcdGlmIChpc0ZpbGVDb3ZlcmFnZShlLmVsZW1lbnQpICYmICFlLmVsZW1lbnQuY2hpbGRyZW4/LnNpemUpIHtcblx0XHRcdFx0XHRyZXNvdXJjZSA9IGUuZWxlbWVudC52YWx1ZSEudXJpO1xuXHRcdFx0XHR9IGVsc2UgaWYgKGlzRGVjbGFyYXRpb25Db3ZlcmFnZShlLmVsZW1lbnQpKSB7XG5cdFx0XHRcdFx0cmVzb3VyY2UgPSBlLmVsZW1lbnQudXJpO1xuXHRcdFx0XHRcdHNlbGVjdGlvbiA9IGUuZWxlbWVudC5sb2NhdGlvbjtcblx0XHRcdFx0fSBlbHNlIGlmIChlLmVsZW1lbnQgaW5zdGFuY2VvZiBDdXJyZW50bHlGaWx0ZXJlZFRvKSB7XG5cdFx0XHRcdFx0Y29tbWFuZFNlcnZpY2UuZXhlY3V0ZUNvbW1hbmQoVGVzdENvbW1hbmRJZC5Db3ZlcmFnZUZpbHRlclRvVGVzdCk7XG5cdFx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0XHRpZiAoIXJlc291cmNlKSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblxuXHRcdFx0ZWRpdG9yU2VydmljZS5vcGVuRWRpdG9yKHtcblx0XHRcdFx0cmVzb3VyY2UsXG5cdFx0XHRcdG9wdGlvbnM6IHtcblx0XHRcdFx0XHRzZWxlY3Rpb246IHNlbGVjdGlvbiBpbnN0YW5jZW9mIFBvc2l0aW9uID8gUmFuZ2UuZnJvbVBvc2l0aW9ucyhzZWxlY3Rpb24sIHNlbGVjdGlvbikgOiBzZWxlY3Rpb24sXG5cdFx0XHRcdFx0cmV2ZWFsSWZPcGVuZWQ6IHRydWUsXG5cdFx0XHRcdFx0c2VsZWN0aW9uUmV2ZWFsVHlwZTogVGV4dEVkaXRvclNlbGVjdGlvblJldmVhbFR5cGUuTmVhclRvcElmT3V0c2lkZVZpZXdwb3J0LFxuXHRcdFx0XHRcdHByZXNlcnZlRm9jdXM6IGUuZWRpdG9yT3B0aW9ucy5wcmVzZXJ2ZUZvY3VzLFxuXHRcdFx0XHRcdHBpbm5lZDogZS5lZGl0b3JPcHRpb25zLnBpbm5lZCxcblx0XHRcdFx0XHRzb3VyY2U6IEVkaXRvck9wZW5Tb3VyY2UuVVNFUixcblx0XHRcdFx0fSxcblx0XHRcdH0sIGUuc2lkZUJ5U2lkZSA/IFNJREVfR1JPVVAgOiBBQ1RJVkVfR1JPVVApO1xuXHRcdH0pKTtcblx0fVxuXG5cdHB1YmxpYyBzZXRJbnB1dChjb3ZlcmFnZTogVGVzdENvdmVyYWdlLCBzaG93T25seVRlc3Q/OiBUZXN0SWQpIHtcblx0XHR0aGlzLmlucHV0RGlzcG9zYWJsZXMuY2xlYXIoKTtcblxuXHRcdGxldCB0cmVlID0gY292ZXJhZ2UudHJlZTtcblxuXHRcdC8vIEZpbHRlciB0byBvbmx5IGEgdGVzdCwgZ2VuZXJhdGUgYSBuZXcgdHJlZSB3aXRoIG9ubHkgdGhvc2UgaXRlbXMgc2VsZWN0ZWRcblx0XHRpZiAoc2hvd09ubHlUZXN0KSB7XG5cdFx0XHR0cmVlID0gY292ZXJhZ2UuZmlsdGVyVHJlZUZvclRlc3Qoc2hvd09ubHlUZXN0KTtcblx0XHR9XG5cblx0XHRjb25zdCBmaWxlczogVGVzdENvdmVyYWdlRmlsZU5vZGVbXSA9IFtdO1xuXHRcdGZvciAobGV0IG5vZGUgb2YgdHJlZS5ub2Rlcykge1xuXHRcdFx0Ly8gd2hlbiBzaG93aW5nIGluaXRpYWwgY2hpbGRyZW4sIG9ubHkgc2hvdyBmcm9tIHRoZSBmaXJzdCBmaWxlIG9yIHRlZVxuXHRcdFx0d2hpbGUgKCEobm9kZS52YWx1ZSBpbnN0YW5jZW9mIEZpbGVDb3ZlcmFnZSkgJiYgbm9kZS5jaGlsZHJlbj8uc2l6ZSA9PT0gMSkge1xuXHRcdFx0XHRub2RlID0gSXRlcmFibGUuZmlyc3Qobm9kZS5jaGlsZHJlbi52YWx1ZXMoKSkhO1xuXHRcdFx0fVxuXHRcdFx0ZmlsZXMucHVzaChub2RlKTtcblx0XHR9XG5cblx0XHRjb25zdCB0b0NoaWxkID0gKHZhbHVlOiBUZXN0Q292ZXJhZ2VGaWxlTm9kZSk6IElDb21wcmVzc2VkVHJlZUVsZW1lbnQ8Q292ZXJhZ2VUcmVlRWxlbWVudD4gPT4ge1xuXHRcdFx0Y29uc3QgaXNGaWxlID0gIXZhbHVlLmNoaWxkcmVuPy5zaXplO1xuXHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0ZWxlbWVudDogdmFsdWUsXG5cdFx0XHRcdGluY29tcHJlc3NpYmxlOiBpc0ZpbGUsXG5cdFx0XHRcdGNvbGxhcHNlZDogaXNGaWxlLFxuXHRcdFx0XHQvLyBkaXJlY3RvcmllcyBjYW4gYmUgZXhwYW5kZWQsIGFuZCBpdGVtcyB3aXRoIGZ1bmN0aW9uIGluZm8gY2FuIGJlIGV4cGFuZGVkXG5cdFx0XHRcdGNvbGxhcHNpYmxlOiAhaXNGaWxlIHx8ICEhdmFsdWUudmFsdWU/LmRlY2xhcmF0aW9uPy50b3RhbCxcblx0XHRcdFx0Y2hpbGRyZW46IHZhbHVlLmNoaWxkcmVuICYmIEl0ZXJhYmxlLm1hcCh2YWx1ZS5jaGlsZHJlbj8udmFsdWVzKCksIHRvQ2hpbGQpXG5cdFx0XHR9O1xuXHRcdH07XG5cblx0XHR0aGlzLmlucHV0RGlzcG9zYWJsZXMuYWRkKG9uT2JzZXJ2YWJsZUNoYW5nZShjb3ZlcmFnZS5kaWRBZGRDb3ZlcmFnZSwgbm9kZXMgPT4ge1xuXHRcdFx0Y29uc3QgdG9SZW5kZXIgPSBmaW5kTGFzdChub2RlcywgbiA9PiB0aGlzLnRyZWUuaGFzRWxlbWVudChuKSk7XG5cdFx0XHRpZiAodG9SZW5kZXIpIHtcblx0XHRcdFx0dGhpcy50cmVlLnNldENoaWxkcmVuKFxuXHRcdFx0XHRcdHRvUmVuZGVyLFxuXHRcdFx0XHRcdEl0ZXJhYmxlLm1hcCh0b1JlbmRlci5jaGlsZHJlbj8udmFsdWVzKCkgfHwgW10sIHRvQ2hpbGQpLFxuXHRcdFx0XHRcdHsgZGlmZklkZW50aXR5UHJvdmlkZXI6IHsgZ2V0SWQ6IGVsID0+IChlbCBhcyBUZXN0Q292ZXJhZ2VGaWxlTm9kZSkudmFsdWUhLmlkIH0gfVxuXHRcdFx0XHQpO1xuXHRcdFx0fVxuXHRcdH0pKTtcblxuXHRcdGxldCBjaGlsZHJlbiA9IEl0ZXJhYmxlLm1hcChmaWxlcywgdG9DaGlsZCk7XG5cdFx0Y29uc3QgZmlsdGVyZWRUbyA9IHNob3dPbmx5VGVzdCAmJiBjb3ZlcmFnZS5yZXN1bHQuZ2V0VGVzdEJ5SWQoc2hvd09ubHlUZXN0LnRvU3RyaW5nKCkpO1xuXHRcdGlmIChmaWx0ZXJlZFRvKSB7XG5cdFx0XHRjaGlsZHJlbiA9IEl0ZXJhYmxlLmNvbmNhdChcblx0XHRcdFx0SXRlcmFibGUuc2luZ2xlPElDb21wcmVzc2VkVHJlZUVsZW1lbnQ8Q292ZXJhZ2VUcmVlRWxlbWVudD4+KHtcblx0XHRcdFx0XHRlbGVtZW50OiBuZXcgQ3VycmVudGx5RmlsdGVyZWRUbyhmaWx0ZXJlZFRvKSxcblx0XHRcdFx0XHRpbmNvbXByZXNzaWJsZTogdHJ1ZSxcblx0XHRcdFx0fSksXG5cdFx0XHRcdGNoaWxkcmVuLFxuXHRcdFx0KTtcblx0XHR9XG5cblx0XHR0aGlzLnRyZWUuc2V0Q2hpbGRyZW4obnVsbCwgY2hpbGRyZW4pO1xuXHR9XG5cblx0cHVibGljIGxheW91dChoZWlnaHQ6IG51bWJlciwgd2lkdGg6IG51bWJlcikge1xuXHRcdHRoaXMudHJlZS5sYXlvdXQoaGVpZ2h0LCB3aWR0aCk7XG5cdH1cblxuXHRwdWJsaWMgY29sbGFwc2VBbGwoKSB7XG5cdFx0dGhpcy50cmVlLmNvbGxhcHNlQWxsKCk7XG5cdH1cblxuXHRwcml2YXRlIHVwZGF0ZVdpdGhEZXRhaWxzKGVsOiBJUHJlZml4VHJlZU5vZGU8RmlsZUNvdmVyYWdlPiwgZGV0YWlsczogcmVhZG9ubHkgQ292ZXJhZ2VEZXRhaWxzW10pIHtcblx0XHRpZiAoIXRoaXMudHJlZS5oYXNFbGVtZW50KGVsKSkge1xuXHRcdFx0cmV0dXJuOyAvLyBhdm9pZCBhbnkgaXNzdWVzIGlmIHRoZSB0cmVlIGNoYW5nZXMgaW4gdGhlIG1lYW53aGlsZVxuXHRcdH1cblxuXHRcdGNvbnN0IGRlY2w6IERlY2xhcmF0aW9uQ292ZXJhZ2VOb2RlW10gPSBbXTtcblx0XHRmb3IgKGNvbnN0IGZuIG9mIGRldGFpbHMpIHtcblx0XHRcdGlmIChmbi50eXBlICE9PSBEZXRhaWxUeXBlLkRlY2xhcmF0aW9uKSB7XG5cdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0fVxuXG5cdFx0XHRsZXQgYXJyID0gZGVjbDtcblx0XHRcdHdoaWxlICh0cnVlKSB7XG5cdFx0XHRcdGNvbnN0IHBhcmVudCA9IGFyci5maW5kKHAgPT4gcC5jb250YWluZWREZXRhaWxzLmhhcyhmbikpO1xuXHRcdFx0XHRpZiAocGFyZW50KSB7XG5cdFx0XHRcdFx0YXJyID0gcGFyZW50LmNoaWxkcmVuO1xuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cblx0XHRcdGFyci5wdXNoKG5ldyBEZWNsYXJhdGlvbkNvdmVyYWdlTm9kZShlbC52YWx1ZSEudXJpLCBmbiwgZGV0YWlscykpO1xuXHRcdH1cblxuXHRcdGNvbnN0IG1ha2VDaGlsZCA9IChmbjogRGVjbGFyYXRpb25Db3ZlcmFnZU5vZGUpOiBJQ29tcHJlc3NlZFRyZWVFbGVtZW50PENvdmVyYWdlVHJlZUVsZW1lbnQ+ID0+ICh7XG5cdFx0XHRlbGVtZW50OiBmbixcblx0XHRcdGluY29tcHJlc3NpYmxlOiB0cnVlLFxuXHRcdFx0Y29sbGFwc2VkOiB0cnVlLFxuXHRcdFx0Y29sbGFwc2libGU6IGZuLmNoaWxkcmVuLmxlbmd0aCA+IDAsXG5cdFx0XHRjaGlsZHJlbjogZm4uY2hpbGRyZW4ubWFwKG1ha2VDaGlsZClcblx0XHR9KTtcblxuXHRcdHRoaXMudHJlZS5zZXRDaGlsZHJlbihlbCwgZGVjbC5tYXAobWFrZUNoaWxkKSk7XG5cdH1cbn1cblxuY2xhc3MgVGVzdENvdmVyYWdlVHJlZUxpc3REZWxlZ2F0ZSBpbXBsZW1lbnRzIElMaXN0VmlydHVhbERlbGVnYXRlPENvdmVyYWdlVHJlZUVsZW1lbnQ+IHtcblx0Z2V0SGVpZ2h0KGVsZW1lbnQ6IENvdmVyYWdlVHJlZUVsZW1lbnQpOiBudW1iZXIge1xuXHRcdHJldHVybiAyMjtcblx0fVxuXG5cdGdldFRlbXBsYXRlSWQoZWxlbWVudDogQ292ZXJhZ2VUcmVlRWxlbWVudCk6IHN0cmluZyB7XG5cdFx0aWYgKGlzRmlsZUNvdmVyYWdlKGVsZW1lbnQpKSB7XG5cdFx0XHRyZXR1cm4gRmlsZUNvdmVyYWdlUmVuZGVyZXIuSUQ7XG5cdFx0fVxuXHRcdGlmIChpc0RlY2xhcmF0aW9uQ292ZXJhZ2UoZWxlbWVudCkpIHtcblx0XHRcdHJldHVybiBEZWNsYXJhdGlvbkNvdmVyYWdlUmVuZGVyZXIuSUQ7XG5cdFx0fVxuXHRcdGlmIChlbGVtZW50IGluc3RhbmNlb2YgTG9hZGluZ0RldGFpbHMgfHwgZWxlbWVudCBpbnN0YW5jZW9mIFJldmVhbFVuY292ZXJlZERlY2xhcmF0aW9ucykge1xuXHRcdFx0cmV0dXJuIEJhc2ljUmVuZGVyZXIuSUQ7XG5cdFx0fVxuXHRcdGlmIChlbGVtZW50IGluc3RhbmNlb2YgQ3VycmVudGx5RmlsdGVyZWRUbykge1xuXHRcdFx0cmV0dXJuIEN1cnJlbnRseUZpbHRlcmVkVG9SZW5kZXJlci5JRDtcblx0XHR9XG5cdFx0YXNzZXJ0TmV2ZXIoZWxlbWVudCk7XG5cdH1cbn1cblxuY2xhc3MgU29ydGVyIGltcGxlbWVudHMgSVRyZWVTb3J0ZXI8Q292ZXJhZ2VUcmVlRWxlbWVudD4ge1xuXHRjb25zdHJ1Y3Rvcihwcml2YXRlIHJlYWRvbmx5IG9yZGVyOiBJT2JzZXJ2YWJsZTxDb3ZlcmFnZVNvcnRPcmRlcj4pIHsgfVxuXHRjb21wYXJlKGE6IENvdmVyYWdlVHJlZUVsZW1lbnQsIGI6IENvdmVyYWdlVHJlZUVsZW1lbnQpOiBudW1iZXIge1xuXHRcdGNvbnN0IG9yZGVyID0gdGhpcy5vcmRlci5nZXQoKTtcblx0XHRpZiAoaXNGaWxlQ292ZXJhZ2UoYSkgJiYgaXNGaWxlQ292ZXJhZ2UoYikpIHtcblx0XHRcdHN3aXRjaCAob3JkZXIpIHtcblx0XHRcdFx0Y2FzZSBDb3ZlcmFnZVNvcnRPcmRlci5Mb2NhdGlvbjpcblx0XHRcdFx0Y2FzZSBDb3ZlcmFnZVNvcnRPcmRlci5OYW1lOlxuXHRcdFx0XHRcdHJldHVybiBhLnZhbHVlIS51cmkudG9TdHJpbmcoKS5sb2NhbGVDb21wYXJlKGIudmFsdWUhLnVyaS50b1N0cmluZygpKTtcblx0XHRcdFx0Y2FzZSBDb3ZlcmFnZVNvcnRPcmRlci5Db3ZlcmFnZTpcblx0XHRcdFx0XHRyZXR1cm4gYi52YWx1ZSEudHBjIC0gYS52YWx1ZSEudHBjO1xuXHRcdFx0fVxuXHRcdH0gZWxzZSBpZiAoaXNEZWNsYXJhdGlvbkNvdmVyYWdlKGEpICYmIGlzRGVjbGFyYXRpb25Db3ZlcmFnZShiKSkge1xuXHRcdFx0c3dpdGNoIChvcmRlcikge1xuXHRcdFx0XHRjYXNlIENvdmVyYWdlU29ydE9yZGVyLkxvY2F0aW9uOlxuXHRcdFx0XHRcdHJldHVybiBQb3NpdGlvbi5jb21wYXJlKFxuXHRcdFx0XHRcdFx0YS5sb2NhdGlvbiBpbnN0YW5jZW9mIFJhbmdlID8gYS5sb2NhdGlvbi5nZXRTdGFydFBvc2l0aW9uKCkgOiBhLmxvY2F0aW9uLFxuXHRcdFx0XHRcdFx0Yi5sb2NhdGlvbiBpbnN0YW5jZW9mIFJhbmdlID8gYi5sb2NhdGlvbi5nZXRTdGFydFBvc2l0aW9uKCkgOiBiLmxvY2F0aW9uLFxuXHRcdFx0XHRcdCk7XG5cdFx0XHRcdGNhc2UgQ292ZXJhZ2VTb3J0T3JkZXIuTmFtZTpcblx0XHRcdFx0XHRyZXR1cm4gYS5sYWJlbC5sb2NhbGVDb21wYXJlKGIubGFiZWwpO1xuXHRcdFx0XHRjYXNlIENvdmVyYWdlU29ydE9yZGVyLkNvdmVyYWdlOiB7XG5cdFx0XHRcdFx0Y29uc3QgYXR0ckEgPSBhLnRwYztcblx0XHRcdFx0XHRjb25zdCBhdHRyQiA9IGIudHBjO1xuXHRcdFx0XHRcdHJldHVybiAoYXR0ckEgIT09IHVuZGVmaW5lZCAmJiBhdHRyQiAhPT0gdW5kZWZpbmVkICYmIGF0dHJCIC0gYXR0ckEpXG5cdFx0XHRcdFx0XHR8fCAoK2IuaGl0cyAtICthLmhpdHMpXG5cdFx0XHRcdFx0XHR8fCBhLmxhYmVsLmxvY2FsZUNvbXBhcmUoYi5sYWJlbCk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9IGVsc2Uge1xuXHRcdFx0cmV0dXJuIDA7XG5cdFx0fVxuXHR9XG59XG5cbmludGVyZmFjZSBJRmlsdGVyZWRUb1RlbXBsYXRlIHtcblx0bGFiZWw6IEhUTUxFbGVtZW50O1xuXHRhY3Rpb25zOiBBY3Rpb25CYXI7XG59XG5cbmNsYXNzIEN1cnJlbnRseUZpbHRlcmVkVG9SZW5kZXJlciBpbXBsZW1lbnRzIElDb21wcmVzc2libGVUcmVlUmVuZGVyZXI8Q292ZXJhZ2VUcmVlRWxlbWVudCwgRnV6enlTY29yZSwgSUZpbHRlcmVkVG9UZW1wbGF0ZT4ge1xuXHRwdWJsaWMgc3RhdGljIHJlYWRvbmx5IElEID0gJ0MnO1xuXHRwdWJsaWMgcmVhZG9ubHkgdGVtcGxhdGVJZCA9IEN1cnJlbnRseUZpbHRlcmVkVG9SZW5kZXJlci5JRDtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRASU1lbnVTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgbWVudVNlcnZpY2U6IElNZW51U2VydmljZSxcblx0XHRASUNvbnRleHRLZXlTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgY29udGV4dEtleVNlcnZpY2U6IElDb250ZXh0S2V5U2VydmljZSxcblx0KSB7IH1cblxuXHRyZW5kZXJDb21wcmVzc2VkRWxlbWVudHMobm9kZTogSVRyZWVOb2RlPElDb21wcmVzc2VkVHJlZU5vZGU8Q292ZXJhZ2VUcmVlRWxlbWVudD4sIEZ1enp5U2NvcmU+LCBpbmRleDogbnVtYmVyLCB0ZW1wbGF0ZURhdGE6IElGaWx0ZXJlZFRvVGVtcGxhdGUpOiB2b2lkIHtcblx0XHR0aGlzLnJlbmRlcklubmVyKG5vZGUuZWxlbWVudC5lbGVtZW50c1tub2RlLmVsZW1lbnQuZWxlbWVudHMubGVuZ3RoIC0gMV0gYXMgQ3VycmVudGx5RmlsdGVyZWRUbywgdGVtcGxhdGVEYXRhKTtcblx0fVxuXG5cdHJlbmRlclRlbXBsYXRlKGNvbnRhaW5lcjogSFRNTEVsZW1lbnQpOiBJRmlsdGVyZWRUb1RlbXBsYXRlIHtcblx0XHRjb250YWluZXIuY2xhc3NMaXN0LmFkZCgndGVzdGluZy1zdGR0cmVlLWNvbnRhaW5lcicpO1xuXHRcdGNvbnN0IGxhYmVsID0gZG9tLmFwcGVuZChjb250YWluZXIsIGRvbS4kKCcubGFiZWwnKSk7XG5cdFx0Y29uc3QgbWVudSA9IHRoaXMubWVudVNlcnZpY2UuZ2V0TWVudUFjdGlvbnMoTWVudUlkLlRlc3RDb3ZlcmFnZUZpbHRlckl0ZW0sIHRoaXMuY29udGV4dEtleVNlcnZpY2UsIHtcblx0XHRcdHNob3VsZEZvcndhcmRBcmdzOiB0cnVlLFxuXHRcdH0pO1xuXG5cdFx0Y29uc3QgYWN0aW9ucyA9IG5ldyBBY3Rpb25CYXIoY29udGFpbmVyKTtcblx0XHRhY3Rpb25zLnB1c2goZ2V0QWN0aW9uQmFyQWN0aW9ucyhtZW51LCAnaW5saW5lJykucHJpbWFyeSwgeyBpY29uOiB0cnVlLCBsYWJlbDogZmFsc2UgfSk7XG5cdFx0YWN0aW9ucy5kb21Ob2RlLnN0eWxlLmRpc3BsYXkgPSAnYmxvY2snO1xuXG5cdFx0cmV0dXJuIHsgbGFiZWwsIGFjdGlvbnMgfTtcblx0fVxuXG5cdHJlbmRlckVsZW1lbnQoZWxlbWVudDogSVRyZWVOb2RlPENvdmVyYWdlVHJlZUVsZW1lbnQsIEZ1enp5U2NvcmU+LCBpbmRleDogbnVtYmVyLCB0ZW1wbGF0ZURhdGE6IElGaWx0ZXJlZFRvVGVtcGxhdGUpOiB2b2lkIHtcblx0XHR0aGlzLnJlbmRlcklubmVyKGVsZW1lbnQuZWxlbWVudCBhcyBDdXJyZW50bHlGaWx0ZXJlZFRvLCB0ZW1wbGF0ZURhdGEpO1xuXHR9XG5cblx0ZGlzcG9zZVRlbXBsYXRlKHRlbXBsYXRlRGF0YTogSUZpbHRlcmVkVG9UZW1wbGF0ZSk6IHZvaWQge1xuXHRcdHRlbXBsYXRlRGF0YS5hY3Rpb25zLmRpc3Bvc2UoKTtcblx0fVxuXG5cdHByaXZhdGUgcmVuZGVySW5uZXIoZWxlbWVudDogQ3VycmVudGx5RmlsdGVyZWRUbywgY29udGFpbmVyOiBJRmlsdGVyZWRUb1RlbXBsYXRlKSB7XG5cdFx0Y29udGFpbmVyLmxhYmVsLmlubmVyVGV4dCA9IGVsZW1lbnQubGFiZWw7XG5cdH1cbn1cblxuaW50ZXJmYWNlIEZpbGVUZW1wbGF0ZURhdGEge1xuXHRjb250YWluZXI6IEhUTUxFbGVtZW50O1xuXHRiYXJzOiBNYW5hZ2VkVGVzdENvdmVyYWdlQmFycztcblx0dGVtcGxhdGVEaXNwb3NhYmxlczogRGlzcG9zYWJsZVN0b3JlO1xuXHRlbGVtZW50c0Rpc3Bvc2FibGVzOiBEaXNwb3NhYmxlU3RvcmU7XG5cdGxhYmVsOiBJUmVzb3VyY2VMYWJlbDtcbn1cblxuY2xhc3MgRmlsZUNvdmVyYWdlUmVuZGVyZXIgaW1wbGVtZW50cyBJQ29tcHJlc3NpYmxlVHJlZVJlbmRlcmVyPENvdmVyYWdlVHJlZUVsZW1lbnQsIEZ1enp5U2NvcmUsIEZpbGVUZW1wbGF0ZURhdGE+IHtcblx0cHVibGljIHN0YXRpYyByZWFkb25seSBJRCA9ICdGJztcblx0cHVibGljIHJlYWRvbmx5IHRlbXBsYXRlSWQgPSBGaWxlQ292ZXJhZ2VSZW5kZXJlci5JRDtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRwcml2YXRlIHJlYWRvbmx5IGxhYmVsczogUmVzb3VyY2VMYWJlbHMsXG5cdFx0QElMYWJlbFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBsYWJlbFNlcnZpY2U6IElMYWJlbFNlcnZpY2UsXG5cdFx0QElJbnN0YW50aWF0aW9uU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGluc3RhbnRpYXRpb25TZXJ2aWNlOiBJSW5zdGFudGlhdGlvblNlcnZpY2UsXG5cdCkgeyB9XG5cblx0LyoqIEBpbmhlcml0ZG9jICovXG5cdHB1YmxpYyByZW5kZXJUZW1wbGF0ZShjb250YWluZXI6IEhUTUxFbGVtZW50KTogRmlsZVRlbXBsYXRlRGF0YSB7XG5cdFx0Y29uc3QgdGVtcGxhdGVEaXNwb3NhYmxlcyA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblx0XHRjb250YWluZXIuY2xhc3NMaXN0LmFkZCgndGVzdGluZy1zdGR0cmVlLWNvbnRhaW5lcicsICd0ZXN0LWNvdmVyYWdlLWxpc3QtaXRlbScpO1xuXG5cdFx0cmV0dXJuIHtcblx0XHRcdGNvbnRhaW5lcixcblx0XHRcdGJhcnM6IHRlbXBsYXRlRGlzcG9zYWJsZXMuYWRkKHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoTWFuYWdlZFRlc3RDb3ZlcmFnZUJhcnMsIHsgY29tcGFjdDogZmFsc2UsIGNvbnRhaW5lciB9KSksXG5cdFx0XHRsYWJlbDogdGVtcGxhdGVEaXNwb3NhYmxlcy5hZGQodGhpcy5sYWJlbHMuY3JlYXRlKGNvbnRhaW5lciwge1xuXHRcdFx0XHRzdXBwb3J0SGlnaGxpZ2h0czogdHJ1ZSxcblx0XHRcdH0pKSxcblx0XHRcdGVsZW1lbnRzRGlzcG9zYWJsZXM6IHRlbXBsYXRlRGlzcG9zYWJsZXMuYWRkKG5ldyBEaXNwb3NhYmxlU3RvcmUoKSksXG5cdFx0XHR0ZW1wbGF0ZURpc3Bvc2FibGVzLFxuXHRcdH07XG5cdH1cblxuXHQvKiogQGluaGVyaXRkb2MgKi9cblx0cHVibGljIHJlbmRlckVsZW1lbnQobm9kZTogSVRyZWVOb2RlPENvdmVyYWdlVHJlZUVsZW1lbnQsIEZ1enp5U2NvcmU+LCBfaW5kZXg6IG51bWJlciwgdGVtcGxhdGVEYXRhOiBGaWxlVGVtcGxhdGVEYXRhKTogdm9pZCB7XG5cdFx0dGhpcy5kb1JlbmRlcihub2RlLmVsZW1lbnQgYXMgVGVzdENvdmVyYWdlRmlsZU5vZGUsIHRlbXBsYXRlRGF0YSwgbm9kZS5maWx0ZXJEYXRhKTtcblx0fVxuXG5cdC8qKiBAaW5oZXJpdGRvYyAqL1xuXHRwdWJsaWMgcmVuZGVyQ29tcHJlc3NlZEVsZW1lbnRzKG5vZGU6IElUcmVlTm9kZTxJQ29tcHJlc3NlZFRyZWVOb2RlPENvdmVyYWdlVHJlZUVsZW1lbnQ+LCBGdXp6eVNjb3JlPiwgX2luZGV4OiBudW1iZXIsIHRlbXBsYXRlRGF0YTogRmlsZVRlbXBsYXRlRGF0YSk6IHZvaWQge1xuXHRcdHRoaXMuZG9SZW5kZXIobm9kZS5lbGVtZW50LmVsZW1lbnRzLCB0ZW1wbGF0ZURhdGEsIG5vZGUuZmlsdGVyRGF0YSk7XG5cdH1cblxuXHRwdWJsaWMgZGlzcG9zZVRlbXBsYXRlKHRlbXBsYXRlRGF0YTogRmlsZVRlbXBsYXRlRGF0YSkge1xuXHRcdHRlbXBsYXRlRGF0YS50ZW1wbGF0ZURpc3Bvc2FibGVzLmRpc3Bvc2UoKTtcblx0fVxuXG5cdC8qKiBAaW5oZXJpdGRvYyAqL1xuXHRwcml2YXRlIGRvUmVuZGVyKGVsZW1lbnQ6IENvdmVyYWdlVHJlZUVsZW1lbnQgfCBDb3ZlcmFnZVRyZWVFbGVtZW50W10sIHRlbXBsYXRlRGF0YTogRmlsZVRlbXBsYXRlRGF0YSwgZmlsdGVyRGF0YTogRnV6enlTY29yZSB8IHVuZGVmaW5lZCkge1xuXHRcdHRlbXBsYXRlRGF0YS5lbGVtZW50c0Rpc3Bvc2FibGVzLmNsZWFyKCk7XG5cblx0XHRjb25zdCBzdGF0ID0gKGVsZW1lbnQgaW5zdGFuY2VvZiBBcnJheSA/IGVsZW1lbnRbZWxlbWVudC5sZW5ndGggLSAxXSA6IGVsZW1lbnQpIGFzIFRlc3RDb3ZlcmFnZUZpbGVOb2RlO1xuXHRcdGNvbnN0IGZpbGUgPSBzdGF0LnZhbHVlITtcblx0XHRjb25zdCBuYW1lID0gZWxlbWVudCBpbnN0YW5jZW9mIEFycmF5ID8gZWxlbWVudC5tYXAoZSA9PiBiYXNlbmFtZU9yQXV0aG9yaXR5KChlIGFzIFRlc3RDb3ZlcmFnZUZpbGVOb2RlKS52YWx1ZSEudXJpKSkgOiBiYXNlbmFtZU9yQXV0aG9yaXR5KGZpbGUudXJpKTtcblx0XHRpZiAoZmlsZSBpbnN0YW5jZW9mIEJ5cGFzc2VkRmlsZUNvdmVyYWdlKSB7XG5cdFx0XHR0ZW1wbGF0ZURhdGEuYmFycy5zZXRDb3ZlcmFnZUluZm8odW5kZWZpbmVkKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0dGVtcGxhdGVEYXRhLmVsZW1lbnRzRGlzcG9zYWJsZXMuYWRkKGF1dG9ydW4ocmVhZGVyID0+IHtcblx0XHRcdFx0c3RhdC52YWx1ZT8uZGlkQ2hhbmdlLnJlYWQocmVhZGVyKTtcblx0XHRcdFx0dGVtcGxhdGVEYXRhLmJhcnMuc2V0Q292ZXJhZ2VJbmZvKGZpbGUpO1xuXHRcdFx0fSkpO1xuXG5cdFx0XHR0ZW1wbGF0ZURhdGEuYmFycy5zZXRDb3ZlcmFnZUluZm8oZmlsZSk7XG5cdFx0fVxuXG5cdFx0dGVtcGxhdGVEYXRhLmxhYmVsLnNldFJlc291cmNlKHsgcmVzb3VyY2U6IGZpbGUudXJpLCBuYW1lIH0sIHtcblx0XHRcdGZpbGVLaW5kOiBzdGF0LmNoaWxkcmVuPy5zaXplID8gRmlsZUtpbmQuRk9MREVSIDogRmlsZUtpbmQuRklMRSxcblx0XHRcdG1hdGNoZXM6IGNyZWF0ZU1hdGNoZXMoZmlsdGVyRGF0YSksXG5cdFx0XHRzZXBhcmF0b3I6IHRoaXMubGFiZWxTZXJ2aWNlLmdldFNlcGFyYXRvcihmaWxlLnVyaS5zY2hlbWUsIGZpbGUudXJpLmF1dGhvcml0eSksXG5cdFx0XHRleHRyYUNsYXNzZXM6IFsnbGFiZWwnXSxcblx0XHR9KTtcblx0fVxufVxuXG5pbnRlcmZhY2UgRGVjbGFyYXRpb25UZW1wbGF0ZURhdGEge1xuXHRjb250YWluZXI6IEhUTUxFbGVtZW50O1xuXHRiYXJzOiBNYW5hZ2VkVGVzdENvdmVyYWdlQmFycztcblx0dGVtcGxhdGVEaXNwb3NhYmxlczogRGlzcG9zYWJsZVN0b3JlO1xuXHRpY29uOiBIVE1MRWxlbWVudDtcblx0bGFiZWw6IEhUTUxFbGVtZW50O1xufVxuXG5jbGFzcyBEZWNsYXJhdGlvbkNvdmVyYWdlUmVuZGVyZXIgaW1wbGVtZW50cyBJQ29tcHJlc3NpYmxlVHJlZVJlbmRlcmVyPENvdmVyYWdlVHJlZUVsZW1lbnQsIEZ1enp5U2NvcmUsIERlY2xhcmF0aW9uVGVtcGxhdGVEYXRhPiB7XG5cdHB1YmxpYyBzdGF0aWMgcmVhZG9ubHkgSUQgPSAnTic7XG5cdHB1YmxpYyByZWFkb25seSB0ZW1wbGF0ZUlkID0gRGVjbGFyYXRpb25Db3ZlcmFnZVJlbmRlcmVyLklEO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdEBJSW5zdGFudGlhdGlvblNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBpbnN0YW50aWF0aW9uU2VydmljZTogSUluc3RhbnRpYXRpb25TZXJ2aWNlLFxuXHQpIHsgfVxuXG5cdC8qKiBAaW5oZXJpdGRvYyAqL1xuXHRwdWJsaWMgcmVuZGVyVGVtcGxhdGUoY29udGFpbmVyOiBIVE1MRWxlbWVudCk6IERlY2xhcmF0aW9uVGVtcGxhdGVEYXRhIHtcblx0XHRjb25zdCB0ZW1wbGF0ZURpc3Bvc2FibGVzID0gbmV3IERpc3Bvc2FibGVTdG9yZSgpO1xuXHRcdGNvbnRhaW5lci5jbGFzc0xpc3QuYWRkKCd0ZXN0LWNvdmVyYWdlLWxpc3QtaXRlbScsICd0ZXN0aW5nLXN0ZHRyZWUtY29udGFpbmVyJyk7XG5cblx0XHRjb25zdCBpY29uID0gZG9tLmFwcGVuZChjb250YWluZXIsIGRvbS4kKCcuc3RhdGUnKSk7XG5cdFx0Y29uc3QgbGFiZWwgPSBkb20uYXBwZW5kKGNvbnRhaW5lciwgZG9tLiQoJy5sYWJlbCcpKTtcblxuXHRcdHJldHVybiB7XG5cdFx0XHRjb250YWluZXIsXG5cdFx0XHRiYXJzOiB0ZW1wbGF0ZURpc3Bvc2FibGVzLmFkZCh0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKE1hbmFnZWRUZXN0Q292ZXJhZ2VCYXJzLCB7IGNvbXBhY3Q6IGZhbHNlLCBjb250YWluZXIgfSkpLFxuXHRcdFx0dGVtcGxhdGVEaXNwb3NhYmxlcyxcblx0XHRcdGljb24sXG5cdFx0XHRsYWJlbCxcblx0XHR9O1xuXHR9XG5cblx0LyoqIEBpbmhlcml0ZG9jICovXG5cdHB1YmxpYyByZW5kZXJFbGVtZW50KG5vZGU6IElUcmVlTm9kZTxDb3ZlcmFnZVRyZWVFbGVtZW50LCBGdXp6eVNjb3JlPiwgX2luZGV4OiBudW1iZXIsIHRlbXBsYXRlRGF0YTogRGVjbGFyYXRpb25UZW1wbGF0ZURhdGEpOiB2b2lkIHtcblx0XHR0aGlzLmRvUmVuZGVyKG5vZGUuZWxlbWVudCBhcyBEZWNsYXJhdGlvbkNvdmVyYWdlTm9kZSwgdGVtcGxhdGVEYXRhLCBub2RlLmZpbHRlckRhdGEpO1xuXHR9XG5cblx0LyoqIEBpbmhlcml0ZG9jICovXG5cdHB1YmxpYyByZW5kZXJDb21wcmVzc2VkRWxlbWVudHMobm9kZTogSVRyZWVOb2RlPElDb21wcmVzc2VkVHJlZU5vZGU8Q292ZXJhZ2VUcmVlRWxlbWVudD4sIEZ1enp5U2NvcmU+LCBfaW5kZXg6IG51bWJlciwgdGVtcGxhdGVEYXRhOiBEZWNsYXJhdGlvblRlbXBsYXRlRGF0YSk6IHZvaWQge1xuXHRcdHRoaXMuZG9SZW5kZXIobm9kZS5lbGVtZW50LmVsZW1lbnRzW25vZGUuZWxlbWVudC5lbGVtZW50cy5sZW5ndGggLSAxXSBhcyBEZWNsYXJhdGlvbkNvdmVyYWdlTm9kZSwgdGVtcGxhdGVEYXRhLCBub2RlLmZpbHRlckRhdGEpO1xuXHR9XG5cblx0cHVibGljIGRpc3Bvc2VUZW1wbGF0ZSh0ZW1wbGF0ZURhdGE6IERlY2xhcmF0aW9uVGVtcGxhdGVEYXRhKSB7XG5cdFx0dGVtcGxhdGVEYXRhLnRlbXBsYXRlRGlzcG9zYWJsZXMuZGlzcG9zZSgpO1xuXHR9XG5cblx0LyoqIEBpbmhlcml0ZG9jICovXG5cdHByaXZhdGUgZG9SZW5kZXIoZWxlbWVudDogRGVjbGFyYXRpb25Db3ZlcmFnZU5vZGUsIHRlbXBsYXRlRGF0YTogRGVjbGFyYXRpb25UZW1wbGF0ZURhdGEsIF9maWx0ZXJEYXRhOiBGdXp6eVNjb3JlIHwgdW5kZWZpbmVkKSB7XG5cdFx0Y29uc3QgY292ZXJlZCA9ICEhZWxlbWVudC5oaXRzO1xuXHRcdGNvbnN0IGljb24gPSBjb3ZlcmVkID8gdGVzdGluZ1dhc0NvdmVyZWQgOiB0ZXN0aW5nU3RhdGVzVG9JY29ucy5nZXQoVGVzdFJlc3VsdFN0YXRlLlVuc2V0KTtcblx0XHR0ZW1wbGF0ZURhdGEuY29udGFpbmVyLmNsYXNzTGlzdC50b2dnbGUoJ25vdC1jb3ZlcmVkJywgIWNvdmVyZWQpO1xuXHRcdHRlbXBsYXRlRGF0YS5pY29uLmNsYXNzTmFtZSA9IGBjb21wdXRlZC1zdGF0ZSAke1RoZW1lSWNvbi5hc0NsYXNzTmFtZShpY29uISl9YDtcblx0XHR0ZW1wbGF0ZURhdGEubGFiZWwuaW5uZXJUZXh0ID0gZWxlbWVudC5sYWJlbDtcblx0XHR0ZW1wbGF0ZURhdGEuYmFycy5zZXRDb3ZlcmFnZUluZm8oZWxlbWVudC5hdHRyaWJ1dGFibGVDb3ZlcmFnZSgpKTtcblx0fVxufVxuXG5jbGFzcyBCYXNpY1JlbmRlcmVyIGltcGxlbWVudHMgSUNvbXByZXNzaWJsZVRyZWVSZW5kZXJlcjxDb3ZlcmFnZVRyZWVFbGVtZW50LCBGdXp6eVNjb3JlLCBIVE1MRWxlbWVudD4ge1xuXHRwdWJsaWMgc3RhdGljIHJlYWRvbmx5IElEID0gJ0InO1xuXHRwdWJsaWMgcmVhZG9ubHkgdGVtcGxhdGVJZCA9IEJhc2ljUmVuZGVyZXIuSUQ7XG5cblx0cmVuZGVyQ29tcHJlc3NlZEVsZW1lbnRzKG5vZGU6IElUcmVlTm9kZTxJQ29tcHJlc3NlZFRyZWVOb2RlPENvdmVyYWdlVHJlZUVsZW1lbnQ+LCBGdXp6eVNjb3JlPiwgX2luZGV4OiBudW1iZXIsIGNvbnRhaW5lcjogSFRNTEVsZW1lbnQpOiB2b2lkIHtcblx0XHR0aGlzLnJlbmRlcklubmVyKG5vZGUuZWxlbWVudC5lbGVtZW50c1tub2RlLmVsZW1lbnQuZWxlbWVudHMubGVuZ3RoIC0gMV0sIGNvbnRhaW5lcik7XG5cdH1cblxuXHRyZW5kZXJUZW1wbGF0ZShjb250YWluZXI6IEhUTUxFbGVtZW50KTogSFRNTEVsZW1lbnQge1xuXHRcdHJldHVybiBjb250YWluZXI7XG5cdH1cblxuXHRyZW5kZXJFbGVtZW50KG5vZGU6IElUcmVlTm9kZTxDb3ZlcmFnZVRyZWVFbGVtZW50LCBGdXp6eVNjb3JlPiwgaW5kZXg6IG51bWJlciwgY29udGFpbmVyOiBIVE1MRWxlbWVudCk6IHZvaWQge1xuXHRcdHRoaXMucmVuZGVySW5uZXIobm9kZS5lbGVtZW50LCBjb250YWluZXIpO1xuXHR9XG5cblx0ZGlzcG9zZVRlbXBsYXRlKCk6IHZvaWQge1xuXHRcdC8vIG5vLW9wXG5cdH1cblxuXHRwcml2YXRlIHJlbmRlcklubmVyKGVsZW1lbnQ6IENvdmVyYWdlVHJlZUVsZW1lbnQsIGNvbnRhaW5lcjogSFRNTEVsZW1lbnQpIHtcblx0XHRjb250YWluZXIuaW5uZXJUZXh0ID0gKGVsZW1lbnQgYXMgUmV2ZWFsVW5jb3ZlcmVkRGVjbGFyYXRpb25zIHwgTG9hZGluZ0RldGFpbHMpLmxhYmVsO1xuXHR9XG59XG5cbmNsYXNzIFRlc3RDb3ZlcmFnZUlkZW50aXR5UHJvdmlkZXIgaW1wbGVtZW50cyBJSWRlbnRpdHlQcm92aWRlcjxDb3ZlcmFnZVRyZWVFbGVtZW50PiB7XG5cdHB1YmxpYyBnZXRJZChlbGVtZW50OiBDb3ZlcmFnZVRyZWVFbGVtZW50KSB7XG5cdFx0cmV0dXJuIGlzRmlsZUNvdmVyYWdlKGVsZW1lbnQpXG5cdFx0XHQ/IGVsZW1lbnQudmFsdWUhLnVyaS50b1N0cmluZygpXG5cdFx0XHQ6IGVsZW1lbnQuaWQ7XG5cdH1cbn1cblxucmVnaXN0ZXJBY3Rpb24yKGNsYXNzIFRlc3RDb3ZlcmFnZUNoYW5nZVBlclRlc3RGaWx0ZXJBY3Rpb24gZXh0ZW5kcyBBY3Rpb24yIHtcblx0Y29uc3RydWN0b3IoKSB7XG5cdFx0c3VwZXIoe1xuXHRcdFx0aWQ6IFRlc3RDb21tYW5kSWQuQ292ZXJhZ2VGaWx0ZXJUb1Rlc3QsXG5cdFx0XHRjYXRlZ29yeTogQ2F0ZWdvcmllcy5UZXN0LFxuXHRcdFx0dGl0bGU6IGxvY2FsaXplMigndGVzdGluZy5jaGFuZ2VDb3ZlcmFnZUZpbHRlcicsICdGaWx0ZXIgQ292ZXJhZ2UgYnkgVGVzdCcpLFxuXHRcdFx0aWNvbjogQ29kaWNvbi5maWx0ZXIsXG5cdFx0XHR0b2dnbGVkOiB7XG5cdFx0XHRcdGljb246IENvZGljb24uZmlsdGVyRmlsbGVkLFxuXHRcdFx0XHRjb25kaXRpb246IFRlc3RpbmdDb250ZXh0S2V5cy5pc0NvdmVyYWdlRmlsdGVyZWRUb1Rlc3QsXG5cdFx0XHR9LFxuXHRcdFx0bWVudTogW1xuXHRcdFx0XHR7IGlkOiBNZW51SWQuQ29tbWFuZFBhbGV0dGUsIHdoZW46IFRlc3RpbmdDb250ZXh0S2V5cy5oYXNQZXJUZXN0Q292ZXJhZ2UgfSxcblx0XHRcdFx0eyBpZDogTWVudUlkLlRlc3RDb3ZlcmFnZUZpbHRlckl0ZW0sIGdyb3VwOiAnaW5saW5lJyB9LFxuXHRcdFx0XHR7XG5cdFx0XHRcdFx0aWQ6IE1lbnVJZC5WaWV3VGl0bGUsXG5cdFx0XHRcdFx0d2hlbjogQ29udGV4dEtleUV4cHIuYW5kKFRlc3RpbmdDb250ZXh0S2V5cy5oYXNQZXJUZXN0Q292ZXJhZ2UsIENvbnRleHRLZXlFeHByLmVxdWFscygndmlldycsIFRlc3RpbmcuQ292ZXJhZ2VWaWV3SWQpKSxcblx0XHRcdFx0XHRncm91cDogJ25hdmlnYXRpb24nLFxuXHRcdFx0XHR9LFxuXHRcdFx0XVxuXHRcdH0pO1xuXHR9XG5cblx0b3ZlcnJpZGUgcnVuKGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yKTogdm9pZCB7XG5cdFx0Y29uc3QgY292ZXJhZ2VTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElUZXN0Q292ZXJhZ2VTZXJ2aWNlKTtcblx0XHRjb25zdCBxdWlja0lucHV0U2VydmljZSA9IGFjY2Vzc29yLmdldChJUXVpY2tJbnB1dFNlcnZpY2UpO1xuXHRcdGNvbnN0IGNvdmVyYWdlID0gY292ZXJhZ2VTZXJ2aWNlLnNlbGVjdGVkLmdldCgpO1xuXHRcdGlmICghY292ZXJhZ2UpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCB0ZXN0cyA9IFsuLi5jb3ZlcmFnZS5hbGxQZXJUZXN0SURzKCldLm1hcChUZXN0SWQuZnJvbVN0cmluZyk7XG5cdFx0Y29uc3QgY29tbW9uUHJlZml4ID0gVGVzdElkLmdldExlbmd0aE9mQ29tbW9uUHJlZml4KHRlc3RzLmxlbmd0aCwgaSA9PiB0ZXN0c1tpXSk7XG5cdFx0Y29uc3QgcmVzdWx0ID0gY292ZXJhZ2UucmVzdWx0O1xuXHRcdGNvbnN0IHByZXZpb3VzU2VsZWN0aW9uID0gY292ZXJhZ2VTZXJ2aWNlLmZpbHRlclRvVGVzdC5nZXQoKTtcblx0XHRjb25zdCBwcmV2aW91c1NlbGVjdGlvblN0ciA9IHByZXZpb3VzU2VsZWN0aW9uPy50b1N0cmluZygpO1xuXG5cdFx0dHlwZSBUSXRlbSA9IHsgbGFiZWw6IHN0cmluZzsgZGVzY3JpcHRpb24/OiBzdHJpbmc7IHRlc3RJZD86IFRlc3RJZCB9O1xuXG5cdFx0Y29uc3QgaXRlbXM6IFF1aWNrUGlja0lucHV0PFRJdGVtPltdID0gW1xuXHRcdFx0eyBsYWJlbDogY292ZXJVdGlscy5sYWJlbHMuYWxsVGVzdHMsIGlkOiB1bmRlZmluZWQgfSxcblx0XHRcdHsgdHlwZTogJ3NlcGFyYXRvcicgfSxcblx0XHRcdC4uLnRlc3RzLm1hcCh0ZXN0SWQgPT4gKHsgLi4uY292ZXJVdGlscy5nZXRMYWJlbEZvckl0ZW0ocmVzdWx0LCB0ZXN0SWQsIGNvbW1vblByZWZpeCksIHRlc3RJZCB9KSksXG5cdFx0XTtcblxuXHRcdHF1aWNrSW5wdXRTZXJ2aWNlLnBpY2soaXRlbXMsIHtcblx0XHRcdGFjdGl2ZUl0ZW06IGl0ZW1zLmZpbmQoKGl0ZW0pOiBpdGVtIGlzIFRJdGVtID0+ICd0ZXN0SWQnIGluIGl0ZW0gJiYgaXRlbS50ZXN0SWQ/LnRvU3RyaW5nKCkgPT09IHByZXZpb3VzU2VsZWN0aW9uU3RyKSxcblx0XHRcdHBsYWNlSG9sZGVyOiBjb3ZlclV0aWxzLmxhYmVscy5waWNrU2hvd0NvdmVyYWdlLFxuXHRcdFx0b25EaWRGb2N1czogKGVudHJ5KSA9PiB7XG5cdFx0XHRcdGNvdmVyYWdlU2VydmljZS5maWx0ZXJUb1Rlc3Quc2V0KGVudHJ5LnRlc3RJZCwgdW5kZWZpbmVkKTtcblx0XHRcdH0sXG5cdFx0fSkudGhlbihzZWxlY3RlZCA9PiB7XG5cdFx0XHRjb3ZlcmFnZVNlcnZpY2UuZmlsdGVyVG9UZXN0LnNldChzZWxlY3RlZCA/IHNlbGVjdGVkLnRlc3RJZCA6IHByZXZpb3VzU2VsZWN0aW9uLCB1bmRlZmluZWQpO1xuXHRcdH0pO1xuXHR9XG59KTtcblxucmVnaXN0ZXJBY3Rpb24yKGNsYXNzIFRlc3RDb3ZlcmFnZUNoYW5nZVNvcnRpbmdBY3Rpb24gZXh0ZW5kcyBWaWV3QWN0aW9uPFRlc3RDb3ZlcmFnZVZpZXc+IHtcblx0Y29uc3RydWN0b3IoKSB7XG5cdFx0c3VwZXIoe1xuXHRcdFx0aWQ6IFRlc3RDb21tYW5kSWQuQ292ZXJhZ2VWaWV3Q2hhbmdlU29ydGluZyxcblx0XHRcdHZpZXdJZDogVGVzdGluZy5Db3ZlcmFnZVZpZXdJZCxcblx0XHRcdHRpdGxlOiBsb2NhbGl6ZTIoJ3Rlc3RpbmcuY2hhbmdlQ292ZXJhZ2VTb3J0JywgJ0NoYW5nZSBTb3J0IE9yZGVyJyksXG5cdFx0XHRpY29uOiBDb2RpY29uLnNvcnRQcmVjZWRlbmNlLFxuXHRcdFx0bWVudToge1xuXHRcdFx0XHRpZDogTWVudUlkLlZpZXdUaXRsZSxcblx0XHRcdFx0d2hlbjogQ29udGV4dEtleUV4cHIuZXF1YWxzKCd2aWV3JywgVGVzdGluZy5Db3ZlcmFnZVZpZXdJZCksXG5cdFx0XHRcdGdyb3VwOiAnbmF2aWdhdGlvbicsXG5cdFx0XHRcdG9yZGVyOiAxLFxuXHRcdFx0fVxuXHRcdH0pO1xuXHR9XG5cblx0b3ZlcnJpZGUgcnVuSW5WaWV3KGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yLCB2aWV3OiBUZXN0Q292ZXJhZ2VWaWV3KSB7XG5cdFx0dHlwZSBJdGVtID0gSVF1aWNrUGlja0l0ZW0gJiB7IHZhbHVlOiBDb3ZlcmFnZVNvcnRPcmRlciB9O1xuXG5cdFx0Y29uc3QgZGlzcG9zYWJsZXMgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cdFx0Y29uc3QgcXVpY2tJbnB1dCA9IGRpc3Bvc2FibGVzLmFkZChhY2Nlc3Nvci5nZXQoSVF1aWNrSW5wdXRTZXJ2aWNlKS5jcmVhdGVRdWlja1BpY2s8SXRlbT4oKSk7XG5cdFx0Y29uc3QgaXRlbXM6IEl0ZW1bXSA9IFtcblx0XHRcdHsgbGFiZWw6IGxvY2FsaXplKCd0ZXN0aW5nLmNvdmVyYWdlU29ydEJ5TG9jYXRpb24nLCAnU29ydCBieSBMb2NhdGlvbicpLCB2YWx1ZTogQ292ZXJhZ2VTb3J0T3JkZXIuTG9jYXRpb24sIGRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgndGVzdGluZy5jb3ZlcmFnZVNvcnRCeUxvY2F0aW9uRGVzY3JpcHRpb24nLCAnRmlsZXMgYXJlIHNvcnRlZCBhbHBoYWJldGljYWxseSwgZGVjbGFyYXRpb25zIGFyZSBzb3J0ZWQgYnkgcG9zaXRpb24nKSB9LFxuXHRcdFx0eyBsYWJlbDogbG9jYWxpemUoJ3Rlc3RpbmcuY292ZXJhZ2VTb3J0QnlDb3ZlcmFnZScsICdTb3J0IGJ5IENvdmVyYWdlJyksIHZhbHVlOiBDb3ZlcmFnZVNvcnRPcmRlci5Db3ZlcmFnZSwgZGVzY3JpcHRpb246IGxvY2FsaXplKCd0ZXN0aW5nLmNvdmVyYWdlU29ydEJ5Q292ZXJhZ2VEZXNjcmlwdGlvbicsICdGaWxlcyBhbmQgZGVjbGFyYXRpb25zIGFyZSBzb3J0ZWQgYnkgdG90YWwgY292ZXJhZ2UnKSB9LFxuXHRcdFx0eyBsYWJlbDogbG9jYWxpemUoJ3Rlc3RpbmcuY292ZXJhZ2VTb3J0QnlOYW1lJywgJ1NvcnQgYnkgTmFtZScpLCB2YWx1ZTogQ292ZXJhZ2VTb3J0T3JkZXIuTmFtZSwgZGVzY3JpcHRpb246IGxvY2FsaXplKCd0ZXN0aW5nLmNvdmVyYWdlU29ydEJ5TmFtZURlc2NyaXB0aW9uJywgJ0ZpbGVzIGFuZCBkZWNsYXJhdGlvbnMgYXJlIHNvcnRlZCBhbHBoYWJldGljYWxseScpIH0sXG5cdFx0XTtcblxuXHRcdHF1aWNrSW5wdXQucGxhY2Vob2xkZXIgPSBsb2NhbGl6ZSgndGVzdGluZy5jb3ZlcmFnZVNvcnRQbGFjZWhvbGRlcicsICdTb3J0IHRoZSBUZXN0IENvdmVyYWdlIHZpZXcuLi4nKTtcblx0XHRxdWlja0lucHV0Lml0ZW1zID0gaXRlbXM7XG5cdFx0cXVpY2tJbnB1dC5zaG93KCk7XG5cdFx0ZGlzcG9zYWJsZXMuYWRkKHF1aWNrSW5wdXQub25EaWRIaWRlKCgpID0+IGRpc3Bvc2FibGVzLmRpc3Bvc2UoKSkpO1xuXHRcdGRpc3Bvc2FibGVzLmFkZChxdWlja0lucHV0Lm9uRGlkQWNjZXB0KCgpID0+IHtcblx0XHRcdGNvbnN0IHBpY2tlZCA9IHF1aWNrSW5wdXQuc2VsZWN0ZWRJdGVtc1swXT8udmFsdWU7XG5cdFx0XHRpZiAocGlja2VkICE9PSB1bmRlZmluZWQpIHtcblx0XHRcdFx0dmlldy5zb3J0T3JkZXIuc2V0KHBpY2tlZCwgdW5kZWZpbmVkKTtcblx0XHRcdFx0cXVpY2tJbnB1dC5kaXNwb3NlKCk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXHR9XG59KTtcblxucmVnaXN0ZXJBY3Rpb24yKGNsYXNzIFRlc3RDb3ZlcmFnZUNvbGxhcHNlQWxsQWN0aW9uIGV4dGVuZHMgVmlld0FjdGlvbjxUZXN0Q292ZXJhZ2VWaWV3PiB7XG5cdGNvbnN0cnVjdG9yKCkge1xuXHRcdHN1cGVyKHtcblx0XHRcdGlkOiBUZXN0Q29tbWFuZElkLkNvdmVyYWdlVmlld0NvbGxhcHNlQWxsLFxuXHRcdFx0dmlld0lkOiBUZXN0aW5nLkNvdmVyYWdlVmlld0lkLFxuXHRcdFx0dGl0bGU6IGxvY2FsaXplMigndGVzdGluZy5jb3ZlcmFnZUNvbGxhcHNlQWxsJywgJ0NvbGxhcHNlIEFsbCBDb3ZlcmFnZScpLFxuXHRcdFx0aWNvbjogQ29kaWNvbi5jb2xsYXBzZUFsbCxcblx0XHRcdG1lbnU6IHtcblx0XHRcdFx0aWQ6IE1lbnVJZC5WaWV3VGl0bGUsXG5cdFx0XHRcdHdoZW46IENvbnRleHRLZXlFeHByLmVxdWFscygndmlldycsIFRlc3RpbmcuQ292ZXJhZ2VWaWV3SWQpLFxuXHRcdFx0XHRncm91cDogJ25hdmlnYXRpb24nLFxuXHRcdFx0XHRvcmRlcjogMixcblx0XHRcdH1cblx0XHR9KTtcblx0fVxuXG5cdG92ZXJyaWRlIHJ1bkluVmlldyhfYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IsIHZpZXc6IFRlc3RDb3ZlcmFnZVZpZXcpIHtcblx0XHR2aWV3LmNvbGxhcHNlQWxsKCk7XG5cdH1cbn0pO1xuIl0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7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
