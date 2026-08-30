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
import { localize } from "../../../../../../nls.js";
import * as DOM from "../../../../../../base/browser/dom.js";
import { ToolBar } from "../../../../../../base/browser/ui/toolbar/toolbar.js";
import { IconLabel } from "../../../../../../base/browser/ui/iconLabel/iconLabel.js";
import { Emitter } from "../../../../../../base/common/event.js";
import { createMatches } from "../../../../../../base/common/filters.js";
import { Disposable, DisposableStore, toDisposable } from "../../../../../../base/common/lifecycle.js";
import { ThemeIcon } from "../../../../../../base/common/themables.js";
import { getIconClassesForLanguageId } from "../../../../../../editor/common/services/getIconClasses.js";
import { IConfigurationService } from "../../../../../../platform/configuration/common/configuration.js";
import { Extensions as ConfigurationExtensions } from "../../../../../../platform/configuration/common/configurationRegistry.js";
import { IInstantiationService } from "../../../../../../platform/instantiation/common/instantiation.js";
import { MarkerSeverity } from "../../../../../../platform/markers/common/markers.js";
import { Registry } from "../../../../../../platform/registry/common/platform.js";
import { listErrorForeground, listWarningForeground } from "../../../../../../platform/theme/common/colorRegistry.js";
import { IThemeService } from "../../../../../../platform/theme/common/themeService.js";
import { Extensions as WorkbenchExtensions } from "../../../../../common/contributions.js";
import { CellFoldingState, CellRevealType } from "../../notebookBrowser.js";
import { NotebookEditor } from "../../notebookEditor.js";
import { CellKind, NotebookCellsChangeType, NotebookSetting } from "../../../common/notebookCommon.js";
import { IEditorService, SIDE_GROUP } from "../../../../../services/editor/common/editorService.js";
import { LifecyclePhase } from "../../../../../services/lifecycle/common/lifecycle.js";
import { IOutlineService, OutlineConfigCollapseItemsValues, OutlineConfigKeys, OutlineTarget } from "../../../../../services/outline/browser/outline.js";
import { CancellationToken } from "../../../../../../base/common/cancellation.js";
import { Range } from "../../../../../../editor/common/core/range.js";
import { IContextMenuService } from "../../../../../../platform/contextview/browser/contextView.js";
import { Action2, IMenuService, MenuId, MenuItemAction, MenuRegistry, registerAction2 } from "../../../../../../platform/actions/common/actions.js";
import { ContextKeyExpr, IContextKeyService, RawContextKey } from "../../../../../../platform/contextkey/common/contextkey.js";
import { MenuEntryActionViewItem, getActionBarActions } from "../../../../../../platform/actions/browser/menuEntryActionViewItem.js";
import { Delayer, disposableTimeout } from "../../../../../../base/common/async.js";
import { IOutlinePane } from "../../../../outline/browser/outline.js";
import { Codicon } from "../../../../../../base/common/codicons.js";
import { NOTEBOOK_IS_ACTIVE_EDITOR } from "../../../common/notebookContextKeys.js";
import { NotebookOutlineConstants } from "../../viewModel/notebookOutlineEntryFactory.js";
import { INotebookCellOutlineDataSourceFactory } from "../../viewModel/notebookOutlineDataSourceFactory.js";
import { INotebookExecutionStateService, NotebookExecutionType } from "../../../common/notebookExecutionStateService.js";
import { ILanguageFeaturesService } from "../../../../../../editor/common/services/languageFeatures.js";
import { safeIntl } from "../../../../../../base/common/date.js";
class NotebookOutlineTemplate {
  constructor(container, iconClass, iconLabel, decoration, actionMenu, elementDisposables) {
    this.container = container;
    this.iconClass = iconClass;
    this.iconLabel = iconLabel;
    this.decoration = decoration;
    this.actionMenu = actionMenu;
    this.elementDisposables = elementDisposables;
  }
}
NotebookOutlineTemplate.templateId = "NotebookOutlineRenderer";
let NotebookOutlineRenderer = class {
  constructor(_editor, _target, _themeService, _configurationService, _contextMenuService, _contextKeyService, _menuService, _instantiationService) {
    this._editor = _editor;
    this._target = _target;
    this._themeService = _themeService;
    this._configurationService = _configurationService;
    this._contextMenuService = _contextMenuService;
    this._contextKeyService = _contextKeyService;
    this._menuService = _menuService;
    this._instantiationService = _instantiationService;
    this.templateId = NotebookOutlineTemplate.templateId;
  }
  renderTemplate(container) {
    const elementDisposables = new DisposableStore();
    container.classList.add("notebook-outline-element", "show-file-icons");
    const iconClass = document.createElement("div");
    container.append(iconClass);
    const iconLabel = new IconLabel(container, { supportHighlights: true });
    const decoration = document.createElement("div");
    decoration.className = "element-decoration";
    container.append(decoration);
    const actionMenu = document.createElement("div");
    actionMenu.className = "action-menu";
    container.append(actionMenu);
    return new NotebookOutlineTemplate(container, iconClass, iconLabel, decoration, actionMenu, elementDisposables);
  }
  renderElement(node, _index, template) {
    const extraClasses = [];
    const options = {
      matches: createMatches(node.filterData),
      labelEscapeNewLines: true,
      extraClasses
    };
    const isCodeCell = node.element.cell.cellKind === CellKind.Code;
    if (node.element.level >= 8) {
      template.iconClass.className = "element-icon " + ThemeIcon.asClassNameArray(node.element.icon).join(" ");
    } else if (isCodeCell && this._themeService.getFileIconTheme().hasFileIcons && !node.element.isExecuting) {
      template.iconClass.className = "";
      extraClasses.push(...getIconClassesForLanguageId(node.element.cell.language ?? ""));
    } else {
      template.iconClass.className = "element-icon " + ThemeIcon.asClassNameArray(node.element.icon).join(" ");
    }
    template.iconLabel.setLabel(" " + node.element.label, void 0, options);
    const { markerInfo } = node.element;
    template.container.style.removeProperty("--outline-element-color");
    template.decoration.innerText = "";
    if (markerInfo) {
      const problem = this._configurationService.getValue("problems.visibility");
      const useBadges = this._configurationService.getValue(OutlineConfigKeys.problemsBadges);
      if (!useBadges || !problem) {
        template.decoration.classList.remove("bubble");
        template.decoration.innerText = "";
      } else if (markerInfo.count === 0) {
        template.decoration.classList.add("bubble");
        template.decoration.innerText = "\uEA71";
      } else {
        template.decoration.classList.remove("bubble");
        template.decoration.innerText = markerInfo.count > 9 ? "9+" : String(markerInfo.count);
      }
      const color = this._themeService.getColorTheme().getColor(markerInfo.topSev === MarkerSeverity.Error ? listErrorForeground : listWarningForeground);
      if (problem === void 0) {
        return;
      }
      const useColors = this._configurationService.getValue(OutlineConfigKeys.problemsColors);
      if (!useColors || !problem) {
        template.container.style.removeProperty("--outline-element-color");
        template.decoration.style.setProperty("--outline-element-color", color?.toString() ?? "inherit");
      } else {
        template.container.style.setProperty("--outline-element-color", color?.toString() ?? "inherit");
      }
    }
    if (this._target === OutlineTarget.OutlinePane) {
      if (!this._editor) {
        return;
      }
      const nbCell = node.element.cell;
      const nbViewModel = this._editor.getViewModel();
      if (!nbViewModel) {
        return;
      }
      const idx = nbViewModel.getCellIndex(nbCell);
      const length = isCodeCell ? 0 : nbViewModel.getFoldedLength(idx);
      const scopedContextKeyService = template.elementDisposables.add(this._contextKeyService.createScoped(template.container));
      NotebookOutlineContext.CellKind.bindTo(scopedContextKeyService).set(isCodeCell ? CellKind.Code : CellKind.Markup);
      NotebookOutlineContext.CellHasChildren.bindTo(scopedContextKeyService).set(length > 0);
      NotebookOutlineContext.CellHasHeader.bindTo(scopedContextKeyService).set(node.element.level !== NotebookOutlineConstants.NonHeaderOutlineLevel);
      NotebookOutlineContext.OutlineElementTarget.bindTo(scopedContextKeyService).set(this._target);
      this.setupFolding(isCodeCell, nbViewModel, scopedContextKeyService, template, nbCell);
      const outlineEntryToolbar = template.elementDisposables.add(new ToolBar(template.actionMenu, this._contextMenuService, {
        actionViewItemProvider: (action) => {
          if (action instanceof MenuItemAction) {
            return this._instantiationService.createInstance(MenuEntryActionViewItem, action, void 0);
          }
          return void 0;
        }
      }));
      const menu = template.elementDisposables.add(this._menuService.createMenu(MenuId.NotebookOutlineActionMenu, scopedContextKeyService));
      const actions = getOutlineToolbarActions(menu, { notebookEditor: this._editor, outlineEntry: node.element });
      outlineEntryToolbar.setActions(actions.primary, actions.secondary);
      this.setupToolbarListeners(this._editor, outlineEntryToolbar, menu, actions, node.element, template);
      template.actionMenu.style.padding = "0 0.8em 0 0.4em";
    }
  }
  disposeTemplate(templateData) {
    templateData.iconLabel.dispose();
    templateData.elementDisposables.dispose();
  }
  disposeElement(element, index, templateData) {
    templateData.elementDisposables.clear();
    DOM.clearNode(templateData.actionMenu);
  }
  setupFolding(isCodeCell, nbViewModel, scopedContextKeyService, template, nbCell) {
    const foldingState = isCodeCell ? CellFoldingState.None : nbCell.foldingState;
    const foldingStateCtx = NotebookOutlineContext.CellFoldingState.bindTo(scopedContextKeyService);
    foldingStateCtx.set(foldingState);
    if (!isCodeCell) {
      template.elementDisposables.add(nbViewModel.onDidFoldingStateChanged(() => {
        const foldingState2 = nbCell.foldingState;
        NotebookOutlineContext.CellFoldingState.bindTo(scopedContextKeyService).set(foldingState2);
        foldingStateCtx.set(foldingState2);
      }));
    }
  }
  setupToolbarListeners(editor, toolbar, menu, initActions, entry, templateData) {
    let dropdownIsVisible = false;
    let deferredUpdate;
    toolbar.setActions(initActions.primary, initActions.secondary);
    templateData.elementDisposables.add(menu.onDidChange(() => {
      if (dropdownIsVisible) {
        const actions2 = getOutlineToolbarActions(menu, { notebookEditor: editor, outlineEntry: entry });
        deferredUpdate = () => toolbar.setActions(actions2.primary, actions2.secondary);
        return;
      }
      const actions = getOutlineToolbarActions(menu, { notebookEditor: editor, outlineEntry: entry });
      toolbar.setActions(actions.primary, actions.secondary);
    }));
    templateData.container.classList.remove("notebook-outline-toolbar-dropdown-active");
    templateData.elementDisposables.add(toolbar.onDidChangeDropdownVisibility((visible) => {
      dropdownIsVisible = visible;
      if (visible) {
        templateData.container.classList.add("notebook-outline-toolbar-dropdown-active");
      } else {
        templateData.container.classList.remove("notebook-outline-toolbar-dropdown-active");
      }
      if (deferredUpdate && !visible) {
        disposableTimeout(() => {
          deferredUpdate?.();
        }, 0, templateData.elementDisposables);
        deferredUpdate = void 0;
      }
    }));
  }
};
NotebookOutlineRenderer = __decorateClass([
  __decorateParam(2, IThemeService),
  __decorateParam(3, IConfigurationService),
  __decorateParam(4, IContextMenuService),
  __decorateParam(5, IContextKeyService),
  __decorateParam(6, IMenuService),
  __decorateParam(7, IInstantiationService)
], NotebookOutlineRenderer);
function getOutlineToolbarActions(menu, args) {
  return getActionBarActions(menu.getActions({ shouldForwardArgs: true, arg: args }), (g) => /^inline/.test(g));
}
class NotebookOutlineAccessibility {
  getAriaLabel(element) {
    return element.label;
  }
  getWidgetAriaLabel() {
    return "";
  }
}
class NotebookNavigationLabelProvider {
  getKeyboardNavigationLabel(element) {
    return element.label;
  }
}
class NotebookOutlineVirtualDelegate {
  getHeight(_element) {
    return 22;
  }
  getTemplateId(_element) {
    return NotebookOutlineTemplate.templateId;
  }
}
let NotebookQuickPickProvider = class {
  constructor(notebookCellOutlineDataSourceRef, _configurationService, _themeService) {
    this.notebookCellOutlineDataSourceRef = notebookCellOutlineDataSourceRef;
    this._configurationService = _configurationService;
    this._themeService = _themeService;
    this._disposables = new DisposableStore();
    this.gotoShowCodeCellSymbols = this._configurationService.getValue(NotebookSetting.gotoSymbolsAllSymbols);
    this._disposables.add(this._configurationService.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration(NotebookSetting.gotoSymbolsAllSymbols)) {
        this.gotoShowCodeCellSymbols = this._configurationService.getValue(NotebookSetting.gotoSymbolsAllSymbols);
      }
    }));
  }
  getQuickPickElements() {
    const bucket = [];
    for (const entry of this.notebookCellOutlineDataSourceRef?.object?.entries ?? []) {
      entry.asFlatList(bucket);
    }
    const result = [];
    const { hasFileIcons } = this._themeService.getFileIconTheme();
    const isSymbol = (element) => !!element.symbolKind;
    const isCodeCell = (element) => element.cell.cellKind === CellKind.Code && element.level === NotebookOutlineConstants.NonHeaderOutlineLevel;
    for (let i = 0; i < bucket.length; i++) {
      const element = bucket[i];
      const nextElement = bucket[i + 1];
      if (!this.gotoShowCodeCellSymbols && isSymbol(element)) {
        continue;
      }
      if (this.gotoShowCodeCellSymbols && isCodeCell(element) && nextElement && isSymbol(nextElement)) {
        continue;
      }
      const useFileIcon = hasFileIcons && !element.symbolKind;
      result.push({
        element,
        label: useFileIcon ? element.label : `$(${element.icon.id}) ${element.label}`,
        ariaLabel: element.label,
        iconClasses: useFileIcon ? getIconClassesForLanguageId(element.cell.language ?? "") : void 0
      });
    }
    return result;
  }
  dispose() {
    this._disposables.dispose();
  }
};
NotebookQuickPickProvider = __decorateClass([
  __decorateParam(1, IConfigurationService),
  __decorateParam(2, IThemeService)
], NotebookQuickPickProvider);
function filterEntry(entry, showMarkdownHeadersOnly, showCodeCells, showCodeCellSymbols) {
  if (showMarkdownHeadersOnly && entry.cell.cellKind === CellKind.Markup && entry.level === NotebookOutlineConstants.NonHeaderOutlineLevel || // show headers only   + cell is mkdn + is level 7 (not header)
  !showCodeCells && entry.cell.cellKind === CellKind.Code || // show code cells off + cell is code
  !showCodeCellSymbols && entry.cell.cellKind === CellKind.Code && entry.level > NotebookOutlineConstants.NonHeaderOutlineLevel) {
    return true;
  }
  return false;
}
let NotebookOutlinePaneProvider = class {
  constructor(outlineDataSourceRef, _configurationService) {
    this.outlineDataSourceRef = outlineDataSourceRef;
    this._configurationService = _configurationService;
    this._disposables = new DisposableStore();
    this.showCodeCells = this._configurationService.getValue(NotebookSetting.outlineShowCodeCells);
    this.showCodeCellSymbols = this._configurationService.getValue(NotebookSetting.outlineShowCodeCellSymbols);
    this.showMarkdownHeadersOnly = this._configurationService.getValue(NotebookSetting.outlineShowMarkdownHeadersOnly);
    this._disposables.add(this._configurationService.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration(NotebookSetting.outlineShowCodeCells)) {
        this.showCodeCells = this._configurationService.getValue(NotebookSetting.outlineShowCodeCells);
      }
      if (e.affectsConfiguration(NotebookSetting.outlineShowCodeCellSymbols)) {
        this.showCodeCellSymbols = this._configurationService.getValue(NotebookSetting.outlineShowCodeCellSymbols);
      }
      if (e.affectsConfiguration(NotebookSetting.outlineShowMarkdownHeadersOnly)) {
        this.showMarkdownHeadersOnly = this._configurationService.getValue(NotebookSetting.outlineShowMarkdownHeadersOnly);
      }
    }));
  }
  getActiveEntry() {
    const newActive = this.outlineDataSourceRef?.object?.activeElement;
    if (!newActive) {
      return void 0;
    }
    if (!filterEntry(newActive, this.showMarkdownHeadersOnly, this.showCodeCells, this.showCodeCellSymbols)) {
      return newActive;
    }
    let parent = newActive.parent;
    while (parent) {
      if (filterEntry(parent, this.showMarkdownHeadersOnly, this.showCodeCells, this.showCodeCellSymbols)) {
        parent = parent.parent;
      } else {
        return parent;
      }
    }
    return void 0;
  }
  *getChildren(element) {
    const isOutline = element instanceof NotebookCellOutline;
    const entries = isOutline ? this.outlineDataSourceRef?.object?.entries ?? [] : element.children;
    for (const entry of entries) {
      if (entry.cell.cellKind === CellKind.Markup) {
        if (!this.showMarkdownHeadersOnly) {
          yield entry;
        } else if (entry.level < NotebookOutlineConstants.NonHeaderOutlineLevel) {
          yield entry;
        }
      } else if (this.showCodeCells && entry.cell.cellKind === CellKind.Code) {
        if (this.showCodeCellSymbols) {
          yield entry;
        } else if (entry.level === NotebookOutlineConstants.NonHeaderOutlineLevel) {
          yield entry;
        }
      }
    }
  }
  dispose() {
    this._disposables.dispose();
  }
};
NotebookOutlinePaneProvider = __decorateClass([
  __decorateParam(1, IConfigurationService)
], NotebookOutlinePaneProvider);
let NotebookBreadcrumbsProvider = class {
  constructor(outlineDataSourceRef, _configurationService) {
    this.outlineDataSourceRef = outlineDataSourceRef;
    this._configurationService = _configurationService;
    this._disposables = new DisposableStore();
    this.showCodeCells = this._configurationService.getValue(NotebookSetting.breadcrumbsShowCodeCells);
    this._disposables.add(this._configurationService.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration(NotebookSetting.breadcrumbsShowCodeCells)) {
        this.showCodeCells = this._configurationService.getValue(NotebookSetting.breadcrumbsShowCodeCells);
      }
    }));
  }
  getBreadcrumbElements() {
    const result = [];
    let candidate = this.outlineDataSourceRef?.object?.activeElement;
    while (candidate) {
      if (this.showCodeCells || candidate.cell.cellKind !== CellKind.Code) {
        result.unshift({ element: candidate, label: candidate.label });
      }
      candidate = candidate.parent;
    }
    return result;
  }
  dispose() {
    this._disposables.dispose();
  }
};
NotebookBreadcrumbsProvider = __decorateClass([
  __decorateParam(1, IConfigurationService)
], NotebookBreadcrumbsProvider);
class NotebookComparator {
  constructor() {
    this._collator = safeIntl.Collator(void 0, { numeric: true });
  }
  compareByPosition(a, b) {
    return a.index - b.index;
  }
  compareByType(a, b) {
    return a.cell.cellKind - b.cell.cellKind || this._collator.value.compare(a.label, b.label);
  }
  compareByName(a, b) {
    return this._collator.value.compare(a.label, b.label);
  }
}
let NotebookCellOutline = class {
  constructor(_editor, _target, _themeService, _editorService, _instantiationService, _configurationService, _languageFeaturesService, _notebookExecutionStateService) {
    this._editor = _editor;
    this._target = _target;
    this._themeService = _themeService;
    this._editorService = _editorService;
    this._instantiationService = _instantiationService;
    this._configurationService = _configurationService;
    this._languageFeaturesService = _languageFeaturesService;
    this._notebookExecutionStateService = _notebookExecutionStateService;
    this.outlineKind = "notebookCells";
    this._disposables = new DisposableStore();
    this._modelDisposables = new DisposableStore();
    this._dataSourceDisposables = new DisposableStore();
    this._onDidChange = new Emitter();
    this.onDidChange = this._onDidChange.event;
    this.delayerRecomputeState = this._disposables.add(new Delayer(300));
    this.delayerRecomputeActive = this._disposables.add(new Delayer(200));
    // this can be long, because it will force a recompute at the end, so ideally we only do this once all nb language features are registered
    this.delayerRecomputeSymbols = this._disposables.add(new Delayer(2e3));
    this.outlineShowCodeCells = this._configurationService.getValue(NotebookSetting.outlineShowCodeCells);
    this.outlineShowCodeCellSymbols = this._configurationService.getValue(NotebookSetting.outlineShowCodeCellSymbols);
    this.outlineShowMarkdownHeadersOnly = this._configurationService.getValue(NotebookSetting.outlineShowMarkdownHeadersOnly);
    this.initializeOutline();
    const delegate = new NotebookOutlineVirtualDelegate();
    const renderers = [this._instantiationService.createInstance(NotebookOutlineRenderer, this._editor.getControl(), this._target)];
    const comparator = new NotebookComparator();
    const options = {
      collapseByDefault: this._target === OutlineTarget.Breadcrumbs || this._target === OutlineTarget.OutlinePane && this._configurationService.getValue(OutlineConfigKeys.collapseItems) === OutlineConfigCollapseItemsValues.Collapsed,
      expandOnlyOnTwistieClick: true,
      multipleSelectionSupport: false,
      accessibilityProvider: new NotebookOutlineAccessibility(),
      identityProvider: { getId: (element) => element.cell.uri.toString() },
      keyboardNavigationLabelProvider: new NotebookNavigationLabelProvider()
    };
    this.config = {
      treeDataSource: this._treeDataSource,
      quickPickDataSource: this._quickPickDataSource,
      breadcrumbsDataSource: this._breadcrumbsDataSource,
      delegate,
      renderers,
      comparator,
      options
    };
  }
  // getters
  get activeElement() {
    this.checkDelayer();
    if (this._target === OutlineTarget.OutlinePane) {
      return this.config.treeDataSource.getActiveEntry();
    } else {
      console.error("activeElement should not be called outside of the OutlinePane");
      return void 0;
    }
  }
  get entries() {
    this.checkDelayer();
    return this._outlineDataSourceReference?.object?.entries ?? [];
  }
  get uri() {
    return this._outlineDataSourceReference?.object?.uri;
  }
  get isEmpty() {
    if (!this._outlineDataSourceReference?.object?.entries) {
      return true;
    }
    return !this._outlineDataSourceReference.object.entries.some((entry) => {
      return !filterEntry(entry, this.outlineShowMarkdownHeadersOnly, this.outlineShowCodeCells, this.outlineShowCodeCellSymbols);
    });
  }
  checkDelayer() {
    if (this.delayerRecomputeState.isTriggered()) {
      this.delayerRecomputeState.cancel();
      this.recomputeState();
    }
  }
  initializeOutline() {
    this.setDataSources();
    this.setModelListeners();
    this._disposables.add(this._editor.onDidChangeModel(() => {
      this.setDataSources();
      this.setModelListeners();
      this.computeSymbols();
    }));
    this._disposables.add(this._languageFeaturesService.documentSymbolProvider.onDidChange(() => {
      this.delayedComputeSymbols();
    }));
    this._disposables.add(this._editor.onDidChangeSelection(() => {
      this.delayedRecomputeActive();
    }));
    this._disposables.add(this._configurationService.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration(NotebookSetting.outlineShowMarkdownHeadersOnly) || e.affectsConfiguration(NotebookSetting.outlineShowCodeCells) || e.affectsConfiguration(NotebookSetting.outlineShowCodeCellSymbols) || e.affectsConfiguration(NotebookSetting.breadcrumbsShowCodeCells)) {
        this.outlineShowCodeCells = this._configurationService.getValue(NotebookSetting.outlineShowCodeCells);
        this.outlineShowCodeCellSymbols = this._configurationService.getValue(NotebookSetting.outlineShowCodeCellSymbols);
        this.outlineShowMarkdownHeadersOnly = this._configurationService.getValue(NotebookSetting.outlineShowMarkdownHeadersOnly);
        this.delayedRecomputeState();
      }
    }));
    this._disposables.add(this._notebookExecutionStateService.onDidChangeExecution((e) => {
      if (e.type === NotebookExecutionType.cell && !!this._editor.textModel && e.affectsNotebook(this._editor.textModel?.uri)) {
        this.delayedRecomputeState();
      }
    }));
    this._disposables.add(this._configurationService.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration(NotebookSetting.outlineShowCodeCellSymbols)) {
        this.outlineShowCodeCellSymbols = this._configurationService.getValue(NotebookSetting.outlineShowCodeCellSymbols);
        this.computeSymbols();
      }
    }));
    this._disposables.add(this._themeService.onDidFileIconThemeChange(() => {
      this._onDidChange.fire({});
    }));
    this.recomputeState();
  }
  /**
   * set up the primary data source + three viewing sources for the various outline views
   */
  setDataSources() {
    const notebookEditor = this._editor.getControl();
    this._outlineDataSourceReference?.dispose();
    this._dataSourceDisposables.clear();
    if (!notebookEditor?.hasModel()) {
      this._outlineDataSourceReference = void 0;
    } else {
      this._outlineDataSourceReference = this._dataSourceDisposables.add(this._instantiationService.invokeFunction((accessor) => accessor.get(INotebookCellOutlineDataSourceFactory).getOrCreate(notebookEditor)));
      this._dataSourceDisposables.add(this._outlineDataSourceReference.object.onDidChange(() => {
        this._onDidChange.fire({});
      }));
    }
    this._treeDataSource = this._dataSourceDisposables.add(this._instantiationService.createInstance(NotebookOutlinePaneProvider, this._outlineDataSourceReference));
    this._quickPickDataSource = this._dataSourceDisposables.add(this._instantiationService.createInstance(NotebookQuickPickProvider, this._outlineDataSourceReference));
    this._breadcrumbsDataSource = this._dataSourceDisposables.add(this._instantiationService.createInstance(NotebookBreadcrumbsProvider, this._outlineDataSourceReference));
  }
  /**
   * set up the listeners for the outline content, these respond to model changes in the notebook
   */
  setModelListeners() {
    this._modelDisposables.clear();
    if (!this._editor.textModel) {
      return;
    }
    if (!this.entries.length) {
      this.computeSymbols();
    }
    this._modelDisposables.add(this._editor.textModel.onDidChangeContent((contentChanges) => {
      if (contentChanges.rawEvents.some((c) => c.kind === NotebookCellsChangeType.ChangeCellContent || c.kind === NotebookCellsChangeType.ChangeCellInternalMetadata || c.kind === NotebookCellsChangeType.Move || c.kind === NotebookCellsChangeType.ModelChange)) {
        this.delayedRecomputeState();
      }
    }));
  }
  async computeSymbols(cancelToken = CancellationToken.None) {
    if (this._target === OutlineTarget.OutlinePane && this.outlineShowCodeCellSymbols) {
      void this.doComputeSymbols(cancelToken);
    }
  }
  async doComputeSymbols(cancelToken) {
    await this._outlineDataSourceReference?.object?.computeFullSymbols(cancelToken);
  }
  async delayedComputeSymbols() {
    this.delayerRecomputeState.cancel();
    this.delayerRecomputeActive.cancel();
    this.delayerRecomputeSymbols.trigger(() => {
      this.computeSymbols();
    });
  }
  recomputeState() {
    this._outlineDataSourceReference?.object?.recomputeState();
  }
  delayedRecomputeState() {
    this.delayerRecomputeActive.cancel();
    this.delayerRecomputeState.trigger(() => {
      this.recomputeState();
    });
  }
  recomputeActive() {
    this._outlineDataSourceReference?.object?.recomputeActive();
  }
  delayedRecomputeActive() {
    this.delayerRecomputeActive.trigger(() => {
      this.recomputeActive();
    });
  }
  async reveal(entry, options, sideBySide) {
    const notebookEditorOptions = {
      ...options,
      override: this._editor.input?.editorId,
      cellRevealType: CellRevealType.Top,
      selection: entry.position,
      viewState: void 0
    };
    await this._editorService.openEditor({
      resource: entry.cell.uri,
      options: notebookEditorOptions
    }, sideBySide ? SIDE_GROUP : void 0);
  }
  preview(entry) {
    const widget = this._editor.getControl();
    if (!widget) {
      return Disposable.None;
    }
    if (entry.range) {
      const range = Range.lift(entry.range);
      widget.revealRangeInCenterIfOutsideViewportAsync(entry.cell, range);
    } else {
      widget.revealInCenterIfOutsideViewport(entry.cell);
    }
    const ids = widget.deltaCellDecorations([], [{
      handle: entry.cell.handle,
      options: { className: "nb-symbolHighlight", outputClassName: "nb-symbolHighlight" }
    }]);
    let editorDecorations;
    widget.changeModelDecorations((accessor) => {
      if (entry.range) {
        const decorations = [
          {
            range: entry.range,
            options: {
              description: "document-symbols-outline-range-highlight",
              className: "rangeHighlight",
              isWholeLine: true
            }
          }
        ];
        const deltaDecoration = {
          ownerId: entry.cell.handle,
          decorations
        };
        editorDecorations = accessor.deltaDecorations([], [deltaDecoration]);
      }
    });
    return toDisposable(() => {
      widget.deltaCellDecorations(ids, []);
      if (editorDecorations?.length) {
        widget.changeModelDecorations((accessor) => {
          accessor.deltaDecorations(editorDecorations, []);
        });
      }
    });
  }
  captureViewState() {
    const widget = this._editor.getControl();
    const viewState = widget?.getEditorViewState();
    return toDisposable(() => {
      if (viewState) {
        widget?.restoreListViewState(viewState);
      }
    });
  }
  dispose() {
    this._onDidChange.dispose();
    this._disposables.dispose();
    this._modelDisposables.dispose();
    this._dataSourceDisposables.dispose();
    this._outlineDataSourceReference?.dispose();
  }
};
NotebookCellOutline = __decorateClass([
  __decorateParam(2, IThemeService),
  __decorateParam(3, IEditorService),
  __decorateParam(4, IInstantiationService),
  __decorateParam(5, IConfigurationService),
  __decorateParam(6, ILanguageFeaturesService),
  __decorateParam(7, INotebookExecutionStateService)
], NotebookCellOutline);
let NotebookOutlineCreator = class {
  constructor(outlineService, _instantiationService) {
    this._instantiationService = _instantiationService;
    const reg = outlineService.registerOutlineCreator(this);
    this.dispose = () => reg.dispose();
  }
  matches(candidate) {
    return candidate.getId() === NotebookEditor.ID;
  }
  async createOutline(editor, target, cancelToken) {
    const outline = this._instantiationService.createInstance(NotebookCellOutline, editor, target);
    if (target === OutlineTarget.QuickPick) {
      await outline.doComputeSymbols(cancelToken);
    }
    return outline;
  }
};
NotebookOutlineCreator = __decorateClass([
  __decorateParam(0, IOutlineService),
  __decorateParam(1, IInstantiationService)
], NotebookOutlineCreator);
const NotebookOutlineContext = {
  CellKind: new RawContextKey("notebookCellKind", void 0),
  CellHasChildren: new RawContextKey("notebookCellHasChildren", false),
  CellHasHeader: new RawContextKey("notebookCellHasHeader", false),
  CellFoldingState: new RawContextKey("notebookCellFoldingState", CellFoldingState.None),
  OutlineElementTarget: new RawContextKey("notebookOutlineElementTarget", void 0)
};
Registry.as(WorkbenchExtensions.Workbench).registerWorkbenchContribution(NotebookOutlineCreator, LifecyclePhase.Eventually);
Registry.as(ConfigurationExtensions.Configuration).registerConfiguration({
  id: "notebook",
  order: 100,
  type: "object",
  "properties": {
    [NotebookSetting.outlineShowMarkdownHeadersOnly]: {
      type: "boolean",
      default: true,
      markdownDescription: localize("outline.showMarkdownHeadersOnly", "When enabled, notebook outline will show only markdown cells containing a header.")
    },
    [NotebookSetting.outlineShowCodeCells]: {
      type: "boolean",
      default: false,
      markdownDescription: localize("outline.showCodeCells", "When enabled, notebook outline shows code cells.")
    },
    [NotebookSetting.outlineShowCodeCellSymbols]: {
      type: "boolean",
      default: true,
      markdownDescription: localize("outline.showCodeCellSymbols", "When enabled, notebook outline shows code cell symbols. Relies on `#notebook.outline.showCodeCells#` being enabled.")
    },
    [NotebookSetting.breadcrumbsShowCodeCells]: {
      type: "boolean",
      default: true,
      markdownDescription: localize("breadcrumbs.showCodeCells", "When enabled, notebook breadcrumbs contain code cells.")
    },
    [NotebookSetting.gotoSymbolsAllSymbols]: {
      type: "boolean",
      default: true,
      markdownDescription: localize("notebook.gotoSymbols.showAllSymbols", "When enabled, the Go to Symbol Quick Pick will display full code symbols from the notebook, as well as Markdown headers.")
    }
  }
});
MenuRegistry.appendMenuItem(MenuId.ViewTitle, {
  submenu: MenuId.NotebookOutlineFilter,
  title: localize("filter", "Filter Entries"),
  icon: Codicon.filter,
  group: "navigation",
  order: -1,
  when: ContextKeyExpr.and(ContextKeyExpr.equals("view", IOutlinePane.Id), NOTEBOOK_IS_ACTIVE_EDITOR)
});
registerAction2(class ToggleShowMarkdownHeadersOnly extends Action2 {
  constructor() {
    super({
      id: "notebook.outline.toggleShowMarkdownHeadersOnly",
      title: localize("toggleShowMarkdownHeadersOnly", "Markdown Headers Only"),
      f1: false,
      toggled: {
        condition: ContextKeyExpr.equals("config.notebook.outline.showMarkdownHeadersOnly", true)
      },
      menu: {
        id: MenuId.NotebookOutlineFilter,
        group: "0_markdown_cells"
      }
    });
  }
  run(accessor, ...args) {
    const configurationService = accessor.get(IConfigurationService);
    const showMarkdownHeadersOnly = configurationService.getValue(NotebookSetting.outlineShowMarkdownHeadersOnly);
    configurationService.updateValue(NotebookSetting.outlineShowMarkdownHeadersOnly, !showMarkdownHeadersOnly);
  }
});
registerAction2(class ToggleCodeCellEntries extends Action2 {
  constructor() {
    super({
      id: "notebook.outline.toggleCodeCells",
      title: localize("toggleCodeCells", "Code Cells"),
      f1: false,
      toggled: {
        condition: ContextKeyExpr.equals("config.notebook.outline.showCodeCells", true)
      },
      menu: {
        id: MenuId.NotebookOutlineFilter,
        order: 1,
        group: "1_code_cells"
      }
    });
  }
  run(accessor, ...args) {
    const configurationService = accessor.get(IConfigurationService);
    const showCodeCells = configurationService.getValue(NotebookSetting.outlineShowCodeCells);
    configurationService.updateValue(NotebookSetting.outlineShowCodeCells, !showCodeCells);
  }
});
registerAction2(class ToggleCodeCellSymbolEntries extends Action2 {
  constructor() {
    super({
      id: "notebook.outline.toggleCodeCellSymbols",
      title: localize("toggleCodeCellSymbols", "Code Cell Symbols"),
      f1: false,
      toggled: {
        condition: ContextKeyExpr.equals("config.notebook.outline.showCodeCellSymbols", true)
      },
      menu: {
        id: MenuId.NotebookOutlineFilter,
        order: 2,
        group: "1_code_cells"
      }
    });
  }
  run(accessor, ...args) {
    const configurationService = accessor.get(IConfigurationService);
    const showCodeCellSymbols = configurationService.getValue(NotebookSetting.outlineShowCodeCellSymbols);
    configurationService.updateValue(NotebookSetting.outlineShowCodeCellSymbols, !showCodeCellSymbols);
  }
});
export {
  NotebookBreadcrumbsProvider,
  NotebookCellOutline,
  NotebookOutlineContext,
  NotebookOutlineCreator,
  NotebookOutlinePaneProvider,
  NotebookQuickPickProvider
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXG5vdGVib29rXFxicm93c2VyXFxjb250cmliXFxvdXRsaW5lXFxub3RlYm9va091dGxpbmUudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgeyBsb2NhbGl6ZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL25scy5qcyc7XG5pbXBvcnQgKiBhcyBET00gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL2RvbS5qcyc7XG5pbXBvcnQgeyBUb29sQmFyIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL3VpL3Rvb2xiYXIvdG9vbGJhci5qcyc7XG5pbXBvcnQgeyBJSWNvbkxhYmVsVmFsdWVPcHRpb25zLCBJY29uTGFiZWwgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvdWkvaWNvbkxhYmVsL2ljb25MYWJlbC5qcyc7XG5pbXBvcnQgeyBJS2V5Ym9hcmROYXZpZ2F0aW9uTGFiZWxQcm92aWRlciwgSUxpc3RWaXJ0dWFsRGVsZWdhdGUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvdWkvbGlzdC9saXN0LmpzJztcbmltcG9ydCB7IElMaXN0QWNjZXNzaWJpbGl0eVByb3ZpZGVyIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL3VpL2xpc3QvbGlzdFdpZGdldC5qcyc7XG5pbXBvcnQgeyBJRGF0YVNvdXJjZSwgSVRyZWVOb2RlLCBJVHJlZVJlbmRlcmVyIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL3VpL3RyZWUvdHJlZS5qcyc7XG5pbXBvcnQgeyBFbWl0dGVyLCBFdmVudCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2V2ZW50LmpzJztcbmltcG9ydCB7IEZ1enp5U2NvcmUsIGNyZWF0ZU1hdGNoZXMgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9maWx0ZXJzLmpzJztcbmltcG9ydCB7IERpc3Bvc2FibGUsIERpc3Bvc2FibGVTdG9yZSwgSURpc3Bvc2FibGUsIHRvRGlzcG9zYWJsZSwgdHlwZSBJUmVmZXJlbmNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IFRoZW1lSWNvbiB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3RoZW1hYmxlcy5qcyc7XG5pbXBvcnQgeyBVUkkgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi91cmkuanMnO1xuaW1wb3J0IHsgZ2V0SWNvbkNsYXNzZXNGb3JMYW5ndWFnZUlkIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9zZXJ2aWNlcy9nZXRJY29uQ2xhc3Nlcy5qcyc7XG5pbXBvcnQgeyBJQ29uZmlndXJhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb25maWd1cmF0aW9uL2NvbW1vbi9jb25maWd1cmF0aW9uLmpzJztcbmltcG9ydCB7IEV4dGVuc2lvbnMgYXMgQ29uZmlndXJhdGlvbkV4dGVuc2lvbnMsIElDb25maWd1cmF0aW9uUmVnaXN0cnkgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb25maWd1cmF0aW9uL2NvbW1vbi9jb25maWd1cmF0aW9uUmVnaXN0cnkuanMnO1xuaW1wb3J0IHsgSUVkaXRvck9wdGlvbnMgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9lZGl0b3IvY29tbW9uL2VkaXRvci5qcyc7XG5pbXBvcnQgeyBJSW5zdGFudGlhdGlvblNlcnZpY2UsIFNlcnZpY2VzQWNjZXNzb3IgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9pbnN0YW50aWF0aW9uL2NvbW1vbi9pbnN0YW50aWF0aW9uLmpzJztcbmltcG9ydCB7IElXb3JrYmVuY2hEYXRhVHJlZU9wdGlvbnMgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9saXN0L2Jyb3dzZXIvbGlzdFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgTWFya2VyU2V2ZXJpdHkgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9tYXJrZXJzL2NvbW1vbi9tYXJrZXJzLmpzJztcbmltcG9ydCB7IFJlZ2lzdHJ5IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vcmVnaXN0cnkvY29tbW9uL3BsYXRmb3JtLmpzJztcbmltcG9ydCB7IGxpc3RFcnJvckZvcmVncm91bmQsIGxpc3RXYXJuaW5nRm9yZWdyb3VuZCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL3RoZW1lL2NvbW1vbi9jb2xvclJlZ2lzdHJ5LmpzJztcbmltcG9ydCB7IElUaGVtZVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS90aGVtZS9jb21tb24vdGhlbWVTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElXb3JrYmVuY2hDb250cmlidXRpb25zUmVnaXN0cnksIEV4dGVuc2lvbnMgYXMgV29ya2JlbmNoRXh0ZW5zaW9ucyB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2NvbW1vbi9jb250cmlidXRpb25zLmpzJztcbmltcG9ydCB7IElFZGl0b3JQYW5lIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vY29tbW9uL2VkaXRvci5qcyc7XG5pbXBvcnQgeyBDZWxsRm9sZGluZ1N0YXRlLCBDZWxsUmV2ZWFsVHlwZSwgSUNlbGxNb2RlbERlY29yYXRpb25zLCBJQ2VsbE1vZGVsRGVsdGFEZWNvcmF0aW9ucywgSUNlbGxWaWV3TW9kZWwsIElOb3RlYm9va0VkaXRvciwgSU5vdGVib29rRWRpdG9yT3B0aW9ucywgSU5vdGVib29rRWRpdG9yUGFuZSwgSU5vdGVib29rVmlld01vZGVsIH0gZnJvbSAnLi4vLi4vbm90ZWJvb2tCcm93c2VyLmpzJztcbmltcG9ydCB7IE5vdGVib29rRWRpdG9yIH0gZnJvbSAnLi4vLi4vbm90ZWJvb2tFZGl0b3IuanMnO1xuaW1wb3J0IHsgSU5vdGVib29rQ2VsbE91dGxpbmVEYXRhU291cmNlLCBOb3RlYm9va0NlbGxPdXRsaW5lRGF0YVNvdXJjZSB9IGZyb20gJy4uLy4uL3ZpZXdNb2RlbC9ub3RlYm9va091dGxpbmVEYXRhU291cmNlLmpzJztcbmltcG9ydCB7IENlbGxLaW5kLCBOb3RlYm9va0NlbGxzQ2hhbmdlVHlwZSwgTm90ZWJvb2tTZXR0aW5nIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL25vdGVib29rQ29tbW9uLmpzJztcbmltcG9ydCB7IElFZGl0b3JTZXJ2aWNlLCBTSURFX0dST1VQIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vc2VydmljZXMvZWRpdG9yL2NvbW1vbi9lZGl0b3JTZXJ2aWNlLmpzJztcbmltcG9ydCB7IExpZmVjeWNsZVBoYXNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vc2VydmljZXMvbGlmZWN5Y2xlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgSUJyZWFkY3J1bWJzRGF0YVNvdXJjZSwgSUJyZWFkY3J1bWJzT3V0bGluZUVsZW1lbnQsIElPdXRsaW5lLCBJT3V0bGluZUNvbXBhcmF0b3IsIElPdXRsaW5lQ3JlYXRvciwgSU91dGxpbmVMaXN0Q29uZmlnLCBJT3V0bGluZVNlcnZpY2UsIElRdWlja1BpY2tEYXRhU291cmNlLCBJUXVpY2tQaWNrT3V0bGluZUVsZW1lbnQsIE91dGxpbmVDaGFuZ2VFdmVudCwgT3V0bGluZUNvbmZpZ0NvbGxhcHNlSXRlbXNWYWx1ZXMsIE91dGxpbmVDb25maWdLZXlzLCBPdXRsaW5lVGFyZ2V0IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vc2VydmljZXMvb3V0bGluZS9icm93c2VyL291dGxpbmUuanMnO1xuaW1wb3J0IHsgT3V0bGluZUVudHJ5IH0gZnJvbSAnLi4vLi4vdmlld01vZGVsL091dGxpbmVFbnRyeS5qcyc7XG5pbXBvcnQgeyBDYW5jZWxsYXRpb25Ub2tlbiB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2NhbmNlbGxhdGlvbi5qcyc7XG5pbXBvcnQgeyBJTW9kZWxEZWx0YURlY29yYXRpb24gfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL21vZGVsLmpzJztcbmltcG9ydCB7IFJhbmdlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9jb3JlL3JhbmdlLmpzJztcbmltcG9ydCB7IElDb250ZXh0TWVudVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb250ZXh0dmlldy9icm93c2VyL2NvbnRleHRWaWV3LmpzJztcbmltcG9ydCB7IEFjdGlvbjIsIElNZW51LCBJTWVudVNlcnZpY2UsIE1lbnVJZCwgTWVudUl0ZW1BY3Rpb24sIE1lbnVSZWdpc3RyeSwgcmVnaXN0ZXJBY3Rpb24yIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vYWN0aW9ucy9jb21tb24vYWN0aW9ucy5qcyc7XG5pbXBvcnQgeyBDb250ZXh0S2V5RXhwciwgSUNvbnRleHRLZXlTZXJ2aWNlLCBSYXdDb250ZXh0S2V5IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29udGV4dGtleS9jb21tb24vY29udGV4dGtleS5qcyc7XG5pbXBvcnQgeyBNZW51RW50cnlBY3Rpb25WaWV3SXRlbSwgZ2V0QWN0aW9uQmFyQWN0aW9ucyB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2FjdGlvbnMvYnJvd3Nlci9tZW51RW50cnlBY3Rpb25WaWV3SXRlbS5qcyc7XG5pbXBvcnQgeyBJQWN0aW9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vYWN0aW9ucy5qcyc7XG5pbXBvcnQgeyBOb3RlYm9va091dGxpbmVFbnRyeUFyZ3MgfSBmcm9tICcuLi8uLi9jb250cm9sbGVyL3NlY3Rpb25BY3Rpb25zLmpzJztcbmltcG9ydCB7IE1hcmt1cENlbGxWaWV3TW9kZWwgfSBmcm9tICcuLi8uLi92aWV3TW9kZWwvbWFya3VwQ2VsbFZpZXdNb2RlbC5qcyc7XG5pbXBvcnQgeyBEZWxheWVyLCBkaXNwb3NhYmxlVGltZW91dCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2FzeW5jLmpzJztcbmltcG9ydCB7IElPdXRsaW5lUGFuZSB9IGZyb20gJy4uLy4uLy4uLy4uL291dGxpbmUvYnJvd3Nlci9vdXRsaW5lLmpzJztcbmltcG9ydCB7IENvZGljb24gfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9jb2RpY29ucy5qcyc7XG5pbXBvcnQgeyBOT1RFQk9PS19JU19BQ1RJVkVfRURJVE9SIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL25vdGVib29rQ29udGV4dEtleXMuanMnO1xuaW1wb3J0IHsgTm90ZWJvb2tPdXRsaW5lQ29uc3RhbnRzIH0gZnJvbSAnLi4vLi4vdmlld01vZGVsL25vdGVib29rT3V0bGluZUVudHJ5RmFjdG9yeS5qcyc7XG5pbXBvcnQgeyBJTm90ZWJvb2tDZWxsT3V0bGluZURhdGFTb3VyY2VGYWN0b3J5IH0gZnJvbSAnLi4vLi4vdmlld01vZGVsL25vdGVib29rT3V0bGluZURhdGFTb3VyY2VGYWN0b3J5LmpzJztcbmltcG9ydCB7IElOb3RlYm9va0V4ZWN1dGlvblN0YXRlU2VydmljZSwgTm90ZWJvb2tFeGVjdXRpb25UeXBlIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL25vdGVib29rRXhlY3V0aW9uU3RhdGVTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElMYW5ndWFnZUZlYXR1cmVzU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vc2VydmljZXMvbGFuZ3VhZ2VGZWF0dXJlcy5qcyc7XG5pbXBvcnQgeyBzYWZlSW50bCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2RhdGUuanMnO1xuXG5jbGFzcyBOb3RlYm9va091dGxpbmVUZW1wbGF0ZSB7XG5cblx0c3RhdGljIHJlYWRvbmx5IHRlbXBsYXRlSWQgPSAnTm90ZWJvb2tPdXRsaW5lUmVuZGVyZXInO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdHJlYWRvbmx5IGNvbnRhaW5lcjogSFRNTEVsZW1lbnQsXG5cdFx0cmVhZG9ubHkgaWNvbkNsYXNzOiBIVE1MRWxlbWVudCxcblx0XHRyZWFkb25seSBpY29uTGFiZWw6IEljb25MYWJlbCxcblx0XHRyZWFkb25seSBkZWNvcmF0aW9uOiBIVE1MRWxlbWVudCxcblx0XHRyZWFkb25seSBhY3Rpb25NZW51OiBIVE1MRWxlbWVudCxcblx0XHRyZWFkb25seSBlbGVtZW50RGlzcG9zYWJsZXM6IERpc3Bvc2FibGVTdG9yZSxcblx0KSB7IH1cbn1cblxuY2xhc3MgTm90ZWJvb2tPdXRsaW5lUmVuZGVyZXIgaW1wbGVtZW50cyBJVHJlZVJlbmRlcmVyPE91dGxpbmVFbnRyeSwgRnV6enlTY29yZSwgTm90ZWJvb2tPdXRsaW5lVGVtcGxhdGU+IHtcblxuXHR0ZW1wbGF0ZUlkOiBzdHJpbmcgPSBOb3RlYm9va091dGxpbmVUZW1wbGF0ZS50ZW1wbGF0ZUlkO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX2VkaXRvcjogSU5vdGVib29rRWRpdG9yIHwgdW5kZWZpbmVkLFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX3RhcmdldDogT3V0bGluZVRhcmdldCxcblx0XHRASVRoZW1lU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF90aGVtZVNlcnZpY2U6IElUaGVtZVNlcnZpY2UsXG5cdFx0QElDb25maWd1cmF0aW9uU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9jb25maWd1cmF0aW9uU2VydmljZTogSUNvbmZpZ3VyYXRpb25TZXJ2aWNlLFxuXHRcdEBJQ29udGV4dE1lbnVTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2NvbnRleHRNZW51U2VydmljZTogSUNvbnRleHRNZW51U2VydmljZSxcblx0XHRASUNvbnRleHRLZXlTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2NvbnRleHRLZXlTZXJ2aWNlOiBJQ29udGV4dEtleVNlcnZpY2UsXG5cdFx0QElNZW51U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9tZW51U2VydmljZTogSU1lbnVTZXJ2aWNlLFxuXHRcdEBJSW5zdGFudGlhdGlvblNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfaW5zdGFudGlhdGlvblNlcnZpY2U6IElJbnN0YW50aWF0aW9uU2VydmljZSxcblx0KSB7IH1cblxuXHRyZW5kZXJUZW1wbGF0ZShjb250YWluZXI6IEhUTUxFbGVtZW50KTogTm90ZWJvb2tPdXRsaW5lVGVtcGxhdGUge1xuXHRcdGNvbnN0IGVsZW1lbnREaXNwb3NhYmxlcyA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblxuXHRcdGNvbnRhaW5lci5jbGFzc0xpc3QuYWRkKCdub3RlYm9vay1vdXRsaW5lLWVsZW1lbnQnLCAnc2hvdy1maWxlLWljb25zJyk7XG5cdFx0Y29uc3QgaWNvbkNsYXNzID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnZGl2Jyk7XG5cdFx0Y29udGFpbmVyLmFwcGVuZChpY29uQ2xhc3MpO1xuXHRcdGNvbnN0IGljb25MYWJlbCA9IG5ldyBJY29uTGFiZWwoY29udGFpbmVyLCB7IHN1cHBvcnRIaWdobGlnaHRzOiB0cnVlIH0pO1xuXHRcdGNvbnN0IGRlY29yYXRpb24gPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdkaXYnKTtcblx0XHRkZWNvcmF0aW9uLmNsYXNzTmFtZSA9ICdlbGVtZW50LWRlY29yYXRpb24nO1xuXHRcdGNvbnRhaW5lci5hcHBlbmQoZGVjb3JhdGlvbik7XG5cdFx0Y29uc3QgYWN0aW9uTWVudSA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2RpdicpO1xuXHRcdGFjdGlvbk1lbnUuY2xhc3NOYW1lID0gJ2FjdGlvbi1tZW51Jztcblx0XHRjb250YWluZXIuYXBwZW5kKGFjdGlvbk1lbnUpO1xuXG5cdFx0cmV0dXJuIG5ldyBOb3RlYm9va091dGxpbmVUZW1wbGF0ZShjb250YWluZXIsIGljb25DbGFzcywgaWNvbkxhYmVsLCBkZWNvcmF0aW9uLCBhY3Rpb25NZW51LCBlbGVtZW50RGlzcG9zYWJsZXMpO1xuXHR9XG5cblx0cmVuZGVyRWxlbWVudChub2RlOiBJVHJlZU5vZGU8T3V0bGluZUVudHJ5LCBGdXp6eVNjb3JlPiwgX2luZGV4OiBudW1iZXIsIHRlbXBsYXRlOiBOb3RlYm9va091dGxpbmVUZW1wbGF0ZSk6IHZvaWQge1xuXHRcdGNvbnN0IGV4dHJhQ2xhc3Nlczogc3RyaW5nW10gPSBbXTtcblx0XHRjb25zdCBvcHRpb25zOiBJSWNvbkxhYmVsVmFsdWVPcHRpb25zID0ge1xuXHRcdFx0bWF0Y2hlczogY3JlYXRlTWF0Y2hlcyhub2RlLmZpbHRlckRhdGEpLFxuXHRcdFx0bGFiZWxFc2NhcGVOZXdMaW5lczogdHJ1ZSxcblx0XHRcdGV4dHJhQ2xhc3Nlcyxcblx0XHR9O1xuXG5cdFx0Y29uc3QgaXNDb2RlQ2VsbCA9IG5vZGUuZWxlbWVudC5jZWxsLmNlbGxLaW5kID09PSBDZWxsS2luZC5Db2RlO1xuXHRcdGlmIChub2RlLmVsZW1lbnQubGV2ZWwgPj0gOCkgeyAvLyBzeW1ib2xcblx0XHRcdHRlbXBsYXRlLmljb25DbGFzcy5jbGFzc05hbWUgPSAnZWxlbWVudC1pY29uICcgKyBUaGVtZUljb24uYXNDbGFzc05hbWVBcnJheShub2RlLmVsZW1lbnQuaWNvbikuam9pbignICcpO1xuXHRcdH0gZWxzZSBpZiAoaXNDb2RlQ2VsbCAmJiB0aGlzLl90aGVtZVNlcnZpY2UuZ2V0RmlsZUljb25UaGVtZSgpLmhhc0ZpbGVJY29ucyAmJiAhbm9kZS5lbGVtZW50LmlzRXhlY3V0aW5nKSB7XG5cdFx0XHR0ZW1wbGF0ZS5pY29uQ2xhc3MuY2xhc3NOYW1lID0gJyc7XG5cdFx0XHRleHRyYUNsYXNzZXMucHVzaCguLi5nZXRJY29uQ2xhc3Nlc0Zvckxhbmd1YWdlSWQobm9kZS5lbGVtZW50LmNlbGwubGFuZ3VhZ2UgPz8gJycpKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0dGVtcGxhdGUuaWNvbkNsYXNzLmNsYXNzTmFtZSA9ICdlbGVtZW50LWljb24gJyArIFRoZW1lSWNvbi5hc0NsYXNzTmFtZUFycmF5KG5vZGUuZWxlbWVudC5pY29uKS5qb2luKCcgJyk7XG5cdFx0fVxuXG5cdFx0dGVtcGxhdGUuaWNvbkxhYmVsLnNldExhYmVsKCcgJyArIG5vZGUuZWxlbWVudC5sYWJlbCwgdW5kZWZpbmVkLCBvcHRpb25zKTtcblxuXHRcdGNvbnN0IHsgbWFya2VySW5mbyB9ID0gbm9kZS5lbGVtZW50O1xuXG5cdFx0dGVtcGxhdGUuY29udGFpbmVyLnN0eWxlLnJlbW92ZVByb3BlcnR5KCctLW91dGxpbmUtZWxlbWVudC1jb2xvcicpO1xuXHRcdHRlbXBsYXRlLmRlY29yYXRpb24uaW5uZXJUZXh0ID0gJyc7XG5cdFx0aWYgKG1hcmtlckluZm8pIHtcblx0XHRcdGNvbnN0IHByb2JsZW0gPSB0aGlzLl9jb25maWd1cmF0aW9uU2VydmljZS5nZXRWYWx1ZSgncHJvYmxlbXMudmlzaWJpbGl0eScpO1xuXHRcdFx0Y29uc3QgdXNlQmFkZ2VzID0gdGhpcy5fY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0VmFsdWUoT3V0bGluZUNvbmZpZ0tleXMucHJvYmxlbXNCYWRnZXMpO1xuXG5cdFx0XHRpZiAoIXVzZUJhZGdlcyB8fCAhcHJvYmxlbSkge1xuXHRcdFx0XHR0ZW1wbGF0ZS5kZWNvcmF0aW9uLmNsYXNzTGlzdC5yZW1vdmUoJ2J1YmJsZScpO1xuXHRcdFx0XHR0ZW1wbGF0ZS5kZWNvcmF0aW9uLmlubmVyVGV4dCA9ICcnO1xuXHRcdFx0fSBlbHNlIGlmIChtYXJrZXJJbmZvLmNvdW50ID09PSAwKSB7XG5cdFx0XHRcdHRlbXBsYXRlLmRlY29yYXRpb24uY2xhc3NMaXN0LmFkZCgnYnViYmxlJyk7XG5cdFx0XHRcdHRlbXBsYXRlLmRlY29yYXRpb24uaW5uZXJUZXh0ID0gJ1xcdWVhNzEnO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0dGVtcGxhdGUuZGVjb3JhdGlvbi5jbGFzc0xpc3QucmVtb3ZlKCdidWJibGUnKTtcblx0XHRcdFx0dGVtcGxhdGUuZGVjb3JhdGlvbi5pbm5lclRleHQgPSBtYXJrZXJJbmZvLmNvdW50ID4gOSA/ICc5KycgOiBTdHJpbmcobWFya2VySW5mby5jb3VudCk7XG5cdFx0XHR9XG5cdFx0XHRjb25zdCBjb2xvciA9IHRoaXMuX3RoZW1lU2VydmljZS5nZXRDb2xvclRoZW1lKCkuZ2V0Q29sb3IobWFya2VySW5mby50b3BTZXYgPT09IE1hcmtlclNldmVyaXR5LkVycm9yID8gbGlzdEVycm9yRm9yZWdyb3VuZCA6IGxpc3RXYXJuaW5nRm9yZWdyb3VuZCk7XG5cdFx0XHRpZiAocHJvYmxlbSA9PT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblx0XHRcdGNvbnN0IHVzZUNvbG9ycyA9IHRoaXMuX2NvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldFZhbHVlKE91dGxpbmVDb25maWdLZXlzLnByb2JsZW1zQ29sb3JzKTtcblx0XHRcdGlmICghdXNlQ29sb3JzIHx8ICFwcm9ibGVtKSB7XG5cdFx0XHRcdHRlbXBsYXRlLmNvbnRhaW5lci5zdHlsZS5yZW1vdmVQcm9wZXJ0eSgnLS1vdXRsaW5lLWVsZW1lbnQtY29sb3InKTtcblx0XHRcdFx0dGVtcGxhdGUuZGVjb3JhdGlvbi5zdHlsZS5zZXRQcm9wZXJ0eSgnLS1vdXRsaW5lLWVsZW1lbnQtY29sb3InLCBjb2xvcj8udG9TdHJpbmcoKSA/PyAnaW5oZXJpdCcpO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0dGVtcGxhdGUuY29udGFpbmVyLnN0eWxlLnNldFByb3BlcnR5KCctLW91dGxpbmUtZWxlbWVudC1jb2xvcicsIGNvbG9yPy50b1N0cmluZygpID8/ICdpbmhlcml0Jyk7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0aWYgKHRoaXMuX3RhcmdldCA9PT0gT3V0bGluZVRhcmdldC5PdXRsaW5lUGFuZSkge1xuXHRcdFx0aWYgKCF0aGlzLl9lZGl0b3IpIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXG5cdFx0XHRjb25zdCBuYkNlbGwgPSBub2RlLmVsZW1lbnQuY2VsbDtcblx0XHRcdGNvbnN0IG5iVmlld01vZGVsID0gdGhpcy5fZWRpdG9yLmdldFZpZXdNb2RlbCgpO1xuXHRcdFx0aWYgKCFuYlZpZXdNb2RlbCkge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cdFx0XHRjb25zdCBpZHggPSBuYlZpZXdNb2RlbC5nZXRDZWxsSW5kZXgobmJDZWxsKTtcblx0XHRcdGNvbnN0IGxlbmd0aCA9IGlzQ29kZUNlbGwgPyAwIDogbmJWaWV3TW9kZWwuZ2V0Rm9sZGVkTGVuZ3RoKGlkeCk7XG5cblx0XHRcdGNvbnN0IHNjb3BlZENvbnRleHRLZXlTZXJ2aWNlID0gdGVtcGxhdGUuZWxlbWVudERpc3Bvc2FibGVzLmFkZCh0aGlzLl9jb250ZXh0S2V5U2VydmljZS5jcmVhdGVTY29wZWQodGVtcGxhdGUuY29udGFpbmVyKSk7XG5cdFx0XHROb3RlYm9va091dGxpbmVDb250ZXh0LkNlbGxLaW5kLmJpbmRUbyhzY29wZWRDb250ZXh0S2V5U2VydmljZSkuc2V0KGlzQ29kZUNlbGwgPyBDZWxsS2luZC5Db2RlIDogQ2VsbEtpbmQuTWFya3VwKTtcblx0XHRcdE5vdGVib29rT3V0bGluZUNvbnRleHQuQ2VsbEhhc0NoaWxkcmVuLmJpbmRUbyhzY29wZWRDb250ZXh0S2V5U2VydmljZSkuc2V0KGxlbmd0aCA+IDApO1xuXHRcdFx0Tm90ZWJvb2tPdXRsaW5lQ29udGV4dC5DZWxsSGFzSGVhZGVyLmJpbmRUbyhzY29wZWRDb250ZXh0S2V5U2VydmljZSkuc2V0KG5vZGUuZWxlbWVudC5sZXZlbCAhPT0gTm90ZWJvb2tPdXRsaW5lQ29uc3RhbnRzLk5vbkhlYWRlck91dGxpbmVMZXZlbCk7XG5cdFx0XHROb3RlYm9va091dGxpbmVDb250ZXh0Lk91dGxpbmVFbGVtZW50VGFyZ2V0LmJpbmRUbyhzY29wZWRDb250ZXh0S2V5U2VydmljZSkuc2V0KHRoaXMuX3RhcmdldCk7XG5cdFx0XHR0aGlzLnNldHVwRm9sZGluZyhpc0NvZGVDZWxsLCBuYlZpZXdNb2RlbCwgc2NvcGVkQ29udGV4dEtleVNlcnZpY2UsIHRlbXBsYXRlLCBuYkNlbGwpO1xuXG5cdFx0XHRjb25zdCBvdXRsaW5lRW50cnlUb29sYmFyID0gdGVtcGxhdGUuZWxlbWVudERpc3Bvc2FibGVzLmFkZChuZXcgVG9vbEJhcih0ZW1wbGF0ZS5hY3Rpb25NZW51LCB0aGlzLl9jb250ZXh0TWVudVNlcnZpY2UsIHtcblx0XHRcdFx0YWN0aW9uVmlld0l0ZW1Qcm92aWRlcjogYWN0aW9uID0+IHtcblx0XHRcdFx0XHRpZiAoYWN0aW9uIGluc3RhbmNlb2YgTWVudUl0ZW1BY3Rpb24pIHtcblx0XHRcdFx0XHRcdHJldHVybiB0aGlzLl9pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShNZW51RW50cnlBY3Rpb25WaWV3SXRlbSwgYWN0aW9uLCB1bmRlZmluZWQpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdFx0XHR9LFxuXHRcdFx0fSkpO1xuXG5cdFx0XHRjb25zdCBtZW51ID0gdGVtcGxhdGUuZWxlbWVudERpc3Bvc2FibGVzLmFkZCh0aGlzLl9tZW51U2VydmljZS5jcmVhdGVNZW51KE1lbnVJZC5Ob3RlYm9va091dGxpbmVBY3Rpb25NZW51LCBzY29wZWRDb250ZXh0S2V5U2VydmljZSkpO1xuXHRcdFx0Y29uc3QgYWN0aW9ucyA9IGdldE91dGxpbmVUb29sYmFyQWN0aW9ucyhtZW51LCB7IG5vdGVib29rRWRpdG9yOiB0aGlzLl9lZGl0b3IsIG91dGxpbmVFbnRyeTogbm9kZS5lbGVtZW50IH0pO1xuXHRcdFx0b3V0bGluZUVudHJ5VG9vbGJhci5zZXRBY3Rpb25zKGFjdGlvbnMucHJpbWFyeSwgYWN0aW9ucy5zZWNvbmRhcnkpO1xuXG5cdFx0XHR0aGlzLnNldHVwVG9vbGJhckxpc3RlbmVycyh0aGlzLl9lZGl0b3IsIG91dGxpbmVFbnRyeVRvb2xiYXIsIG1lbnUsIGFjdGlvbnMsIG5vZGUuZWxlbWVudCwgdGVtcGxhdGUpO1xuXHRcdFx0dGVtcGxhdGUuYWN0aW9uTWVudS5zdHlsZS5wYWRkaW5nID0gJzAgMC44ZW0gMCAwLjRlbSc7XG5cdFx0fVxuXHR9XG5cblx0ZGlzcG9zZVRlbXBsYXRlKHRlbXBsYXRlRGF0YTogTm90ZWJvb2tPdXRsaW5lVGVtcGxhdGUpOiB2b2lkIHtcblx0XHR0ZW1wbGF0ZURhdGEuaWNvbkxhYmVsLmRpc3Bvc2UoKTtcblx0XHR0ZW1wbGF0ZURhdGEuZWxlbWVudERpc3Bvc2FibGVzLmRpc3Bvc2UoKTtcblx0fVxuXG5cdGRpc3Bvc2VFbGVtZW50KGVsZW1lbnQ6IElUcmVlTm9kZTxPdXRsaW5lRW50cnksIEZ1enp5U2NvcmU+LCBpbmRleDogbnVtYmVyLCB0ZW1wbGF0ZURhdGE6IE5vdGVib29rT3V0bGluZVRlbXBsYXRlKTogdm9pZCB7XG5cdFx0dGVtcGxhdGVEYXRhLmVsZW1lbnREaXNwb3NhYmxlcy5jbGVhcigpO1xuXHRcdERPTS5jbGVhck5vZGUodGVtcGxhdGVEYXRhLmFjdGlvbk1lbnUpO1xuXHR9XG5cblx0cHJpdmF0ZSBzZXR1cEZvbGRpbmcoaXNDb2RlQ2VsbDogYm9vbGVhbiwgbmJWaWV3TW9kZWw6IElOb3RlYm9va1ZpZXdNb2RlbCwgc2NvcGVkQ29udGV4dEtleVNlcnZpY2U6IElDb250ZXh0S2V5U2VydmljZSwgdGVtcGxhdGU6IE5vdGVib29rT3V0bGluZVRlbXBsYXRlLCBuYkNlbGw6IElDZWxsVmlld01vZGVsKSB7XG5cdFx0Y29uc3QgZm9sZGluZ1N0YXRlID0gaXNDb2RlQ2VsbCA/IENlbGxGb2xkaW5nU3RhdGUuTm9uZSA6ICgobmJDZWxsIGFzIE1hcmt1cENlbGxWaWV3TW9kZWwpLmZvbGRpbmdTdGF0ZSk7XG5cdFx0Y29uc3QgZm9sZGluZ1N0YXRlQ3R4ID0gTm90ZWJvb2tPdXRsaW5lQ29udGV4dC5DZWxsRm9sZGluZ1N0YXRlLmJpbmRUbyhzY29wZWRDb250ZXh0S2V5U2VydmljZSk7XG5cdFx0Zm9sZGluZ1N0YXRlQ3R4LnNldChmb2xkaW5nU3RhdGUpO1xuXG5cdFx0aWYgKCFpc0NvZGVDZWxsKSB7XG5cdFx0XHR0ZW1wbGF0ZS5lbGVtZW50RGlzcG9zYWJsZXMuYWRkKG5iVmlld01vZGVsLm9uRGlkRm9sZGluZ1N0YXRlQ2hhbmdlZCgoKSA9PiB7XG5cdFx0XHRcdGNvbnN0IGZvbGRpbmdTdGF0ZSA9IChuYkNlbGwgYXMgTWFya3VwQ2VsbFZpZXdNb2RlbCkuZm9sZGluZ1N0YXRlO1xuXHRcdFx0XHROb3RlYm9va091dGxpbmVDb250ZXh0LkNlbGxGb2xkaW5nU3RhdGUuYmluZFRvKHNjb3BlZENvbnRleHRLZXlTZXJ2aWNlKS5zZXQoZm9sZGluZ1N0YXRlKTtcblx0XHRcdFx0Zm9sZGluZ1N0YXRlQ3R4LnNldChmb2xkaW5nU3RhdGUpO1xuXHRcdFx0fSkpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgc2V0dXBUb29sYmFyTGlzdGVuZXJzKGVkaXRvcjogSU5vdGVib29rRWRpdG9yLCB0b29sYmFyOiBUb29sQmFyLCBtZW51OiBJTWVudSwgaW5pdEFjdGlvbnM6IHsgcHJpbWFyeTogSUFjdGlvbltdOyBzZWNvbmRhcnk6IElBY3Rpb25bXSB9LCBlbnRyeTogT3V0bGluZUVudHJ5LCB0ZW1wbGF0ZURhdGE6IE5vdGVib29rT3V0bGluZVRlbXBsYXRlKTogdm9pZCB7XG5cdFx0Ly8gc2FtZSBmaXggYXMgaW4gY2VsbFRvb2xiYXJzIHNldHVwTGlzdGVuZXJzIHJlICMxMDM5MjZcblx0XHRsZXQgZHJvcGRvd25Jc1Zpc2libGUgPSBmYWxzZTtcblx0XHRsZXQgZGVmZXJyZWRVcGRhdGU6ICgoKSA9PiB2b2lkKSB8IHVuZGVmaW5lZDtcblxuXHRcdHRvb2xiYXIuc2V0QWN0aW9ucyhpbml0QWN0aW9ucy5wcmltYXJ5LCBpbml0QWN0aW9ucy5zZWNvbmRhcnkpO1xuXHRcdHRlbXBsYXRlRGF0YS5lbGVtZW50RGlzcG9zYWJsZXMuYWRkKG1lbnUub25EaWRDaGFuZ2UoKCkgPT4ge1xuXHRcdFx0aWYgKGRyb3Bkb3duSXNWaXNpYmxlKSB7XG5cdFx0XHRcdGNvbnN0IGFjdGlvbnMgPSBnZXRPdXRsaW5lVG9vbGJhckFjdGlvbnMobWVudSwgeyBub3RlYm9va0VkaXRvcjogZWRpdG9yLCBvdXRsaW5lRW50cnk6IGVudHJ5IH0pO1xuXHRcdFx0XHRkZWZlcnJlZFVwZGF0ZSA9ICgpID0+IHRvb2xiYXIuc2V0QWN0aW9ucyhhY3Rpb25zLnByaW1hcnksIGFjdGlvbnMuc2Vjb25kYXJ5KTtcblxuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cblx0XHRcdGNvbnN0IGFjdGlvbnMgPSBnZXRPdXRsaW5lVG9vbGJhckFjdGlvbnMobWVudSwgeyBub3RlYm9va0VkaXRvcjogZWRpdG9yLCBvdXRsaW5lRW50cnk6IGVudHJ5IH0pO1xuXHRcdFx0dG9vbGJhci5zZXRBY3Rpb25zKGFjdGlvbnMucHJpbWFyeSwgYWN0aW9ucy5zZWNvbmRhcnkpO1xuXHRcdH0pKTtcblxuXHRcdHRlbXBsYXRlRGF0YS5jb250YWluZXIuY2xhc3NMaXN0LnJlbW92ZSgnbm90ZWJvb2stb3V0bGluZS10b29sYmFyLWRyb3Bkb3duLWFjdGl2ZScpO1xuXHRcdHRlbXBsYXRlRGF0YS5lbGVtZW50RGlzcG9zYWJsZXMuYWRkKHRvb2xiYXIub25EaWRDaGFuZ2VEcm9wZG93blZpc2liaWxpdHkodmlzaWJsZSA9PiB7XG5cdFx0XHRkcm9wZG93bklzVmlzaWJsZSA9IHZpc2libGU7XG5cdFx0XHRpZiAodmlzaWJsZSkge1xuXHRcdFx0XHR0ZW1wbGF0ZURhdGEuY29udGFpbmVyLmNsYXNzTGlzdC5hZGQoJ25vdGVib29rLW91dGxpbmUtdG9vbGJhci1kcm9wZG93bi1hY3RpdmUnKTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdHRlbXBsYXRlRGF0YS5jb250YWluZXIuY2xhc3NMaXN0LnJlbW92ZSgnbm90ZWJvb2stb3V0bGluZS10b29sYmFyLWRyb3Bkb3duLWFjdGl2ZScpO1xuXHRcdFx0fVxuXG5cdFx0XHRpZiAoZGVmZXJyZWRVcGRhdGUgJiYgIXZpc2libGUpIHtcblx0XHRcdFx0ZGlzcG9zYWJsZVRpbWVvdXQoKCkgPT4ge1xuXHRcdFx0XHRcdGRlZmVycmVkVXBkYXRlPy4oKTtcblx0XHRcdFx0fSwgMCwgdGVtcGxhdGVEYXRhLmVsZW1lbnREaXNwb3NhYmxlcyk7XG5cblx0XHRcdFx0ZGVmZXJyZWRVcGRhdGUgPSB1bmRlZmluZWQ7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXG5cdH1cbn1cblxuZnVuY3Rpb24gZ2V0T3V0bGluZVRvb2xiYXJBY3Rpb25zKG1lbnU6IElNZW51LCBhcmdzPzogTm90ZWJvb2tPdXRsaW5lRW50cnlBcmdzKTogeyBwcmltYXJ5OiBJQWN0aW9uW107IHNlY29uZGFyeTogSUFjdGlvbltdIH0ge1xuXHRyZXR1cm4gZ2V0QWN0aW9uQmFyQWN0aW9ucyhtZW51LmdldEFjdGlvbnMoeyBzaG91bGRGb3J3YXJkQXJnczogdHJ1ZSwgYXJnOiBhcmdzIH0pLCBnID0+IC9eaW5saW5lLy50ZXN0KGcpKTtcbn1cblxuY2xhc3MgTm90ZWJvb2tPdXRsaW5lQWNjZXNzaWJpbGl0eSBpbXBsZW1lbnRzIElMaXN0QWNjZXNzaWJpbGl0eVByb3ZpZGVyPE91dGxpbmVFbnRyeT4ge1xuXHRnZXRBcmlhTGFiZWwoZWxlbWVudDogT3V0bGluZUVudHJ5KTogc3RyaW5nIHwgbnVsbCB7XG5cdFx0cmV0dXJuIGVsZW1lbnQubGFiZWw7XG5cdH1cblx0Z2V0V2lkZ2V0QXJpYUxhYmVsKCk6IHN0cmluZyB7XG5cdFx0cmV0dXJuICcnO1xuXHR9XG59XG5cbmNsYXNzIE5vdGVib29rTmF2aWdhdGlvbkxhYmVsUHJvdmlkZXIgaW1wbGVtZW50cyBJS2V5Ym9hcmROYXZpZ2F0aW9uTGFiZWxQcm92aWRlcjxPdXRsaW5lRW50cnk+IHtcblx0Z2V0S2V5Ym9hcmROYXZpZ2F0aW9uTGFiZWwoZWxlbWVudDogT3V0bGluZUVudHJ5KTogeyB0b1N0cmluZygpOiBzdHJpbmcgfCB1bmRlZmluZWQgfSB8IHsgdG9TdHJpbmcoKTogc3RyaW5nIHwgdW5kZWZpbmVkIH1bXSB8IHVuZGVmaW5lZCB7XG5cdFx0cmV0dXJuIGVsZW1lbnQubGFiZWw7XG5cdH1cbn1cblxuY2xhc3MgTm90ZWJvb2tPdXRsaW5lVmlydHVhbERlbGVnYXRlIGltcGxlbWVudHMgSUxpc3RWaXJ0dWFsRGVsZWdhdGU8T3V0bGluZUVudHJ5PiB7XG5cblx0Z2V0SGVpZ2h0KF9lbGVtZW50OiBPdXRsaW5lRW50cnkpOiBudW1iZXIge1xuXHRcdHJldHVybiAyMjtcblx0fVxuXG5cdGdldFRlbXBsYXRlSWQoX2VsZW1lbnQ6IE91dGxpbmVFbnRyeSk6IHN0cmluZyB7XG5cdFx0cmV0dXJuIE5vdGVib29rT3V0bGluZVRlbXBsYXRlLnRlbXBsYXRlSWQ7XG5cdH1cbn1cblxuZXhwb3J0IGNsYXNzIE5vdGVib29rUXVpY2tQaWNrUHJvdmlkZXIgaW1wbGVtZW50cyBJUXVpY2tQaWNrRGF0YVNvdXJjZTxPdXRsaW5lRW50cnk+IHtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9kaXNwb3NhYmxlcyA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblxuXHRwcml2YXRlIGdvdG9TaG93Q29kZUNlbGxTeW1ib2xzOiBib29sZWFuO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgbm90ZWJvb2tDZWxsT3V0bGluZURhdGFTb3VyY2VSZWY6IElSZWZlcmVuY2U8SU5vdGVib29rQ2VsbE91dGxpbmVEYXRhU291cmNlPiB8IHVuZGVmaW5lZCxcblx0XHRASUNvbmZpZ3VyYXRpb25TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2NvbmZpZ3VyYXRpb25TZXJ2aWNlOiBJQ29uZmlndXJhdGlvblNlcnZpY2UsXG5cdFx0QElUaGVtZVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfdGhlbWVTZXJ2aWNlOiBJVGhlbWVTZXJ2aWNlXG5cdCkge1xuXHRcdHRoaXMuZ290b1Nob3dDb2RlQ2VsbFN5bWJvbHMgPSB0aGlzLl9jb25maWd1cmF0aW9uU2VydmljZS5nZXRWYWx1ZTxib29sZWFuPihOb3RlYm9va1NldHRpbmcuZ290b1N5bWJvbHNBbGxTeW1ib2xzKTtcblxuXHRcdHRoaXMuX2Rpc3Bvc2FibGVzLmFkZCh0aGlzLl9jb25maWd1cmF0aW9uU2VydmljZS5vbkRpZENoYW5nZUNvbmZpZ3VyYXRpb24oZSA9PiB7XG5cdFx0XHRpZiAoZS5hZmZlY3RzQ29uZmlndXJhdGlvbihOb3RlYm9va1NldHRpbmcuZ290b1N5bWJvbHNBbGxTeW1ib2xzKSkge1xuXHRcdFx0XHR0aGlzLmdvdG9TaG93Q29kZUNlbGxTeW1ib2xzID0gdGhpcy5fY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0VmFsdWU8Ym9vbGVhbj4oTm90ZWJvb2tTZXR0aW5nLmdvdG9TeW1ib2xzQWxsU3ltYm9scyk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXHR9XG5cblx0Z2V0UXVpY2tQaWNrRWxlbWVudHMoKTogSVF1aWNrUGlja091dGxpbmVFbGVtZW50PE91dGxpbmVFbnRyeT5bXSB7XG5cdFx0Y29uc3QgYnVja2V0OiBPdXRsaW5lRW50cnlbXSA9IFtdO1xuXHRcdGZvciAoY29uc3QgZW50cnkgb2YgdGhpcy5ub3RlYm9va0NlbGxPdXRsaW5lRGF0YVNvdXJjZVJlZj8ub2JqZWN0Py5lbnRyaWVzID8/IFtdKSB7XG5cdFx0XHRlbnRyeS5hc0ZsYXRMaXN0KGJ1Y2tldCk7XG5cdFx0fVxuXHRcdGNvbnN0IHJlc3VsdDogSVF1aWNrUGlja091dGxpbmVFbGVtZW50PE91dGxpbmVFbnRyeT5bXSA9IFtdO1xuXHRcdGNvbnN0IHsgaGFzRmlsZUljb25zIH0gPSB0aGlzLl90aGVtZVNlcnZpY2UuZ2V0RmlsZUljb25UaGVtZSgpO1xuXG5cdFx0Y29uc3QgaXNTeW1ib2wgPSAoZWxlbWVudDogT3V0bGluZUVudHJ5KSA9PiAhIWVsZW1lbnQuc3ltYm9sS2luZDtcblx0XHRjb25zdCBpc0NvZGVDZWxsID0gKGVsZW1lbnQ6IE91dGxpbmVFbnRyeSkgPT4gKGVsZW1lbnQuY2VsbC5jZWxsS2luZCA9PT0gQ2VsbEtpbmQuQ29kZSAmJiBlbGVtZW50LmxldmVsID09PSBOb3RlYm9va091dGxpbmVDb25zdGFudHMuTm9uSGVhZGVyT3V0bGluZUxldmVsKTsgLy8gY29kZSBjZWxsIGVudHJpZXMgYXJlIGV4YWN0bHkgbGV2ZWwgNyBieSB0aGlzIGNvbnN0YW50XG5cdFx0Zm9yIChsZXQgaSA9IDA7IGkgPCBidWNrZXQubGVuZ3RoOyBpKyspIHtcblx0XHRcdGNvbnN0IGVsZW1lbnQgPSBidWNrZXRbaV07XG5cdFx0XHRjb25zdCBuZXh0RWxlbWVudCA9IGJ1Y2tldFtpICsgMV07IC8vIGNhbiBiZSB1bmRlZmluZWRcblxuXHRcdFx0aWYgKCF0aGlzLmdvdG9TaG93Q29kZUNlbGxTeW1ib2xzXG5cdFx0XHRcdCYmIGlzU3ltYm9sKGVsZW1lbnQpKSB7XG5cdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0fVxuXG5cdFx0XHRpZiAodGhpcy5nb3RvU2hvd0NvZGVDZWxsU3ltYm9sc1xuXHRcdFx0XHQmJiBpc0NvZGVDZWxsKGVsZW1lbnQpXG5cdFx0XHRcdCYmIG5leHRFbGVtZW50ICYmIGlzU3ltYm9sKG5leHRFbGVtZW50KSkge1xuXHRcdFx0XHRjb250aW51ZTtcblx0XHRcdH1cblxuXHRcdFx0Y29uc3QgdXNlRmlsZUljb24gPSBoYXNGaWxlSWNvbnMgJiYgIWVsZW1lbnQuc3ltYm9sS2luZDtcblx0XHRcdC8vIHRvZG9AanJpZWtlbiBpdCBpcyBmaXNoeSB0aGF0IGNvZGljb25zIGNhbm5vdCBiZSB1c2VkIHdpdGggaWNvbkNsYXNzZXNcblx0XHRcdC8vIGJ1dCBmaWxlIGljb25zIGNhbi4uLlxuXHRcdFx0cmVzdWx0LnB1c2goe1xuXHRcdFx0XHRlbGVtZW50LFxuXHRcdFx0XHRsYWJlbDogdXNlRmlsZUljb24gPyBlbGVtZW50LmxhYmVsIDogYCQoJHtlbGVtZW50Lmljb24uaWR9KSAke2VsZW1lbnQubGFiZWx9YCxcblx0XHRcdFx0YXJpYUxhYmVsOiBlbGVtZW50LmxhYmVsLFxuXHRcdFx0XHRpY29uQ2xhc3NlczogdXNlRmlsZUljb24gPyBnZXRJY29uQ2xhc3Nlc0Zvckxhbmd1YWdlSWQoZWxlbWVudC5jZWxsLmxhbmd1YWdlID8/ICcnKSA6IHVuZGVmaW5lZCxcblx0XHRcdH0pO1xuXHRcdH1cblx0XHRyZXR1cm4gcmVzdWx0O1xuXHR9XG5cblx0ZGlzcG9zZSgpOiB2b2lkIHtcblx0XHR0aGlzLl9kaXNwb3NhYmxlcy5kaXNwb3NlKCk7XG5cdH1cbn1cblxuLyoqXG4gKiBDaGVja3MgaWYgdGhlIGdpdmVuIG91dGxpbmUgZW50cnkgc2hvdWxkIGJlIGZpbHRlcmVkIG91dCBvZiB0aGUgb3V0bGluZVBhbmVcbiAqXG4gKiBAcGFyYW0gZW50cnkgdGhlIE91dGxpbmVFbnRyeSB0byBjaGVja1xuICogQHBhcmFtIHNob3dNYXJrZG93bkhlYWRlcnNPbmx5IHdoZXRoZXIgdG8gc2hvdyBvbmx5IG1hcmtkb3duIGhlYWRlcnNcbiAqIEBwYXJhbSBzaG93Q29kZUNlbGxzIHdoZXRoZXIgdG8gc2hvdyBjb2RlIGNlbGxzXG4gKiBAcGFyYW0gc2hvd0NvZGVDZWxsU3ltYm9scyB3aGV0aGVyIHRvIHNob3cgY29kZSBjZWxsIHN5bWJvbHNcbiAqIEByZXR1cm5zIHRydWUgaWYgdGhlIGVudHJ5IHNob3VsZCBiZSBmaWx0ZXJlZCBvdXQgb2YgdGhlIG91dGxpbmVQYW5lLCBmYWxzZSBpZiB0aGUgZW50cnkgc2hvdWxkIGJlIHZpc2libGUuXG4gKi9cbmZ1bmN0aW9uIGZpbHRlckVudHJ5KGVudHJ5OiBPdXRsaW5lRW50cnksIHNob3dNYXJrZG93bkhlYWRlcnNPbmx5OiBib29sZWFuLCBzaG93Q29kZUNlbGxzOiBib29sZWFuLCBzaG93Q29kZUNlbGxTeW1ib2xzOiBib29sZWFuKTogYm9vbGVhbiB7XG5cdC8vIGlmIGFueSBhcmUgdHJ1ZSwgcmV0dXJuIHRydWUsIHRoaXMgZW50cnkgc2hvdWxkIE5PVCBiZSBpbmNsdWRlZCBpbiB0aGUgb3V0bGluZVxuXHRpZiAoXG5cdFx0KHNob3dNYXJrZG93bkhlYWRlcnNPbmx5ICYmIGVudHJ5LmNlbGwuY2VsbEtpbmQgPT09IENlbGxLaW5kLk1hcmt1cCAmJiBlbnRyeS5sZXZlbCA9PT0gTm90ZWJvb2tPdXRsaW5lQ29uc3RhbnRzLk5vbkhlYWRlck91dGxpbmVMZXZlbCkgfHxcdC8vIHNob3cgaGVhZGVycyBvbmx5ICAgKyBjZWxsIGlzIG1rZG4gKyBpcyBsZXZlbCA3IChub3QgaGVhZGVyKVxuXHRcdCghc2hvd0NvZGVDZWxscyAmJiBlbnRyeS5jZWxsLmNlbGxLaW5kID09PSBDZWxsS2luZC5Db2RlKSB8fFx0XHRcdFx0XHRcdFx0XHRcdFx0XHRcdFx0XHRcdFx0XHRcdFx0XHQvLyBzaG93IGNvZGUgY2VsbHMgb2ZmICsgY2VsbCBpcyBjb2RlXG5cdFx0KCFzaG93Q29kZUNlbGxTeW1ib2xzICYmIGVudHJ5LmNlbGwuY2VsbEtpbmQgPT09IENlbGxLaW5kLkNvZGUgJiYgZW50cnkubGV2ZWwgPiBOb3RlYm9va091dGxpbmVDb25zdGFudHMuTm9uSGVhZGVyT3V0bGluZUxldmVsKVx0XHRcdFx0Ly8gc2hvdyBzeW1ib2xzIG9mZiAgICArIGNlbGwgaXMgY29kZSArIGlzIGxldmVsID43IChuYiBzeW1ib2wgbGV2ZWxzKVxuXHQpIHtcblx0XHRyZXR1cm4gdHJ1ZTtcblx0fVxuXG5cdHJldHVybiBmYWxzZTtcbn1cblxuZXhwb3J0IGNsYXNzIE5vdGVib29rT3V0bGluZVBhbmVQcm92aWRlciBpbXBsZW1lbnRzIElEYXRhU291cmNlPE5vdGVib29rQ2VsbE91dGxpbmUsIE91dGxpbmVFbnRyeT4ge1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX2Rpc3Bvc2FibGVzID0gbmV3IERpc3Bvc2FibGVTdG9yZSgpO1xuXG5cdHByaXZhdGUgc2hvd0NvZGVDZWxsczogYm9vbGVhbjtcblx0cHJpdmF0ZSBzaG93Q29kZUNlbGxTeW1ib2xzOiBib29sZWFuO1xuXHRwcml2YXRlIHNob3dNYXJrZG93bkhlYWRlcnNPbmx5OiBib29sZWFuO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgb3V0bGluZURhdGFTb3VyY2VSZWY6IElSZWZlcmVuY2U8SU5vdGVib29rQ2VsbE91dGxpbmVEYXRhU291cmNlPiB8IHVuZGVmaW5lZCxcblx0XHRASUNvbmZpZ3VyYXRpb25TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2NvbmZpZ3VyYXRpb25TZXJ2aWNlOiBJQ29uZmlndXJhdGlvblNlcnZpY2UsXG5cdCkge1xuXHRcdHRoaXMuc2hvd0NvZGVDZWxscyA9IHRoaXMuX2NvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldFZhbHVlPGJvb2xlYW4+KE5vdGVib29rU2V0dGluZy5vdXRsaW5lU2hvd0NvZGVDZWxscyk7XG5cdFx0dGhpcy5zaG93Q29kZUNlbGxTeW1ib2xzID0gdGhpcy5fY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0VmFsdWU8Ym9vbGVhbj4oTm90ZWJvb2tTZXR0aW5nLm91dGxpbmVTaG93Q29kZUNlbGxTeW1ib2xzKTtcblx0XHR0aGlzLnNob3dNYXJrZG93bkhlYWRlcnNPbmx5ID0gdGhpcy5fY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0VmFsdWU8Ym9vbGVhbj4oTm90ZWJvb2tTZXR0aW5nLm91dGxpbmVTaG93TWFya2Rvd25IZWFkZXJzT25seSk7XG5cblx0XHR0aGlzLl9kaXNwb3NhYmxlcy5hZGQodGhpcy5fY29uZmlndXJhdGlvblNlcnZpY2Uub25EaWRDaGFuZ2VDb25maWd1cmF0aW9uKGUgPT4ge1xuXHRcdFx0aWYgKGUuYWZmZWN0c0NvbmZpZ3VyYXRpb24oTm90ZWJvb2tTZXR0aW5nLm91dGxpbmVTaG93Q29kZUNlbGxzKSkge1xuXHRcdFx0XHR0aGlzLnNob3dDb2RlQ2VsbHMgPSB0aGlzLl9jb25maWd1cmF0aW9uU2VydmljZS5nZXRWYWx1ZTxib29sZWFuPihOb3RlYm9va1NldHRpbmcub3V0bGluZVNob3dDb2RlQ2VsbHMpO1xuXHRcdFx0fVxuXHRcdFx0aWYgKGUuYWZmZWN0c0NvbmZpZ3VyYXRpb24oTm90ZWJvb2tTZXR0aW5nLm91dGxpbmVTaG93Q29kZUNlbGxTeW1ib2xzKSkge1xuXHRcdFx0XHR0aGlzLnNob3dDb2RlQ2VsbFN5bWJvbHMgPSB0aGlzLl9jb25maWd1cmF0aW9uU2VydmljZS5nZXRWYWx1ZTxib29sZWFuPihOb3RlYm9va1NldHRpbmcub3V0bGluZVNob3dDb2RlQ2VsbFN5bWJvbHMpO1xuXHRcdFx0fVxuXHRcdFx0aWYgKGUuYWZmZWN0c0NvbmZpZ3VyYXRpb24oTm90ZWJvb2tTZXR0aW5nLm91dGxpbmVTaG93TWFya2Rvd25IZWFkZXJzT25seSkpIHtcblx0XHRcdFx0dGhpcy5zaG93TWFya2Rvd25IZWFkZXJzT25seSA9IHRoaXMuX2NvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldFZhbHVlPGJvb2xlYW4+KE5vdGVib29rU2V0dGluZy5vdXRsaW5lU2hvd01hcmtkb3duSGVhZGVyc09ubHkpO1xuXHRcdFx0fVxuXHRcdH0pKTtcblx0fVxuXG5cdHB1YmxpYyBnZXRBY3RpdmVFbnRyeSgpOiBPdXRsaW5lRW50cnkgfCB1bmRlZmluZWQge1xuXHRcdGNvbnN0IG5ld0FjdGl2ZSA9IHRoaXMub3V0bGluZURhdGFTb3VyY2VSZWY/Lm9iamVjdD8uYWN0aXZlRWxlbWVudDtcblx0XHRpZiAoIW5ld0FjdGl2ZSkge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cblx0XHRpZiAoIWZpbHRlckVudHJ5KG5ld0FjdGl2ZSwgdGhpcy5zaG93TWFya2Rvd25IZWFkZXJzT25seSwgdGhpcy5zaG93Q29kZUNlbGxzLCB0aGlzLnNob3dDb2RlQ2VsbFN5bWJvbHMpKSB7XG5cdFx0XHRyZXR1cm4gbmV3QWN0aXZlO1xuXHRcdH1cblxuXHRcdC8vIGZpbmQgYSB2YWxpZCBwYXJlbnRcblx0XHRsZXQgcGFyZW50ID0gbmV3QWN0aXZlLnBhcmVudDtcblx0XHR3aGlsZSAocGFyZW50KSB7XG5cdFx0XHRpZiAoZmlsdGVyRW50cnkocGFyZW50LCB0aGlzLnNob3dNYXJrZG93bkhlYWRlcnNPbmx5LCB0aGlzLnNob3dDb2RlQ2VsbHMsIHRoaXMuc2hvd0NvZGVDZWxsU3ltYm9scykpIHtcblx0XHRcdFx0cGFyZW50ID0gcGFyZW50LnBhcmVudDtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdHJldHVybiBwYXJlbnQ7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0Ly8gbm8gdmFsaWQgcGFyZW50IGZvdW5kLCByZXR1cm4gdW5kZWZpbmVkXG5cdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0fVxuXG5cdCpnZXRDaGlsZHJlbihlbGVtZW50OiBOb3RlYm9va0NlbGxPdXRsaW5lIHwgT3V0bGluZUVudHJ5KTogSXRlcmFibGU8T3V0bGluZUVudHJ5PiB7XG5cdFx0Y29uc3QgaXNPdXRsaW5lID0gZWxlbWVudCBpbnN0YW5jZW9mIE5vdGVib29rQ2VsbE91dGxpbmU7XG5cdFx0Y29uc3QgZW50cmllcyA9IGlzT3V0bGluZSA/IHRoaXMub3V0bGluZURhdGFTb3VyY2VSZWY/Lm9iamVjdD8uZW50cmllcyA/PyBbXSA6IGVsZW1lbnQuY2hpbGRyZW47XG5cblx0XHRmb3IgKGNvbnN0IGVudHJ5IG9mIGVudHJpZXMpIHtcblx0XHRcdGlmIChlbnRyeS5jZWxsLmNlbGxLaW5kID09PSBDZWxsS2luZC5NYXJrdXApIHtcblx0XHRcdFx0aWYgKCF0aGlzLnNob3dNYXJrZG93bkhlYWRlcnNPbmx5KSB7XG5cdFx0XHRcdFx0eWllbGQgZW50cnk7XG5cdFx0XHRcdH0gZWxzZSBpZiAoZW50cnkubGV2ZWwgPCBOb3RlYm9va091dGxpbmVDb25zdGFudHMuTm9uSGVhZGVyT3V0bGluZUxldmVsKSB7XG5cdFx0XHRcdFx0eWllbGQgZW50cnk7XG5cdFx0XHRcdH1cblxuXHRcdFx0fSBlbHNlIGlmICh0aGlzLnNob3dDb2RlQ2VsbHMgJiYgZW50cnkuY2VsbC5jZWxsS2luZCA9PT0gQ2VsbEtpbmQuQ29kZSkge1xuXHRcdFx0XHRpZiAodGhpcy5zaG93Q29kZUNlbGxTeW1ib2xzKSB7XG5cdFx0XHRcdFx0eWllbGQgZW50cnk7XG5cdFx0XHRcdH0gZWxzZSBpZiAoZW50cnkubGV2ZWwgPT09IE5vdGVib29rT3V0bGluZUNvbnN0YW50cy5Ob25IZWFkZXJPdXRsaW5lTGV2ZWwpIHtcblx0XHRcdFx0XHR5aWVsZCBlbnRyeTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblx0fVxuXG5cdGRpc3Bvc2UoKTogdm9pZCB7XG5cdFx0dGhpcy5fZGlzcG9zYWJsZXMuZGlzcG9zZSgpO1xuXHR9XG59XG5cbmV4cG9ydCBjbGFzcyBOb3RlYm9va0JyZWFkY3J1bWJzUHJvdmlkZXIgaW1wbGVtZW50cyBJQnJlYWRjcnVtYnNEYXRhU291cmNlPE91dGxpbmVFbnRyeT4ge1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX2Rpc3Bvc2FibGVzID0gbmV3IERpc3Bvc2FibGVTdG9yZSgpO1xuXG5cdHByaXZhdGUgc2hvd0NvZGVDZWxsczogYm9vbGVhbjtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRwcml2YXRlIHJlYWRvbmx5IG91dGxpbmVEYXRhU291cmNlUmVmOiBJUmVmZXJlbmNlPElOb3RlYm9va0NlbGxPdXRsaW5lRGF0YVNvdXJjZT4gfCB1bmRlZmluZWQsXG5cdFx0QElDb25maWd1cmF0aW9uU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9jb25maWd1cmF0aW9uU2VydmljZTogSUNvbmZpZ3VyYXRpb25TZXJ2aWNlLFxuXHQpIHtcblx0XHR0aGlzLnNob3dDb2RlQ2VsbHMgPSB0aGlzLl9jb25maWd1cmF0aW9uU2VydmljZS5nZXRWYWx1ZTxib29sZWFuPihOb3RlYm9va1NldHRpbmcuYnJlYWRjcnVtYnNTaG93Q29kZUNlbGxzKTtcblx0XHR0aGlzLl9kaXNwb3NhYmxlcy5hZGQodGhpcy5fY29uZmlndXJhdGlvblNlcnZpY2Uub25EaWRDaGFuZ2VDb25maWd1cmF0aW9uKGUgPT4ge1xuXHRcdFx0aWYgKGUuYWZmZWN0c0NvbmZpZ3VyYXRpb24oTm90ZWJvb2tTZXR0aW5nLmJyZWFkY3J1bWJzU2hvd0NvZGVDZWxscykpIHtcblx0XHRcdFx0dGhpcy5zaG93Q29kZUNlbGxzID0gdGhpcy5fY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0VmFsdWU8Ym9vbGVhbj4oTm90ZWJvb2tTZXR0aW5nLmJyZWFkY3J1bWJzU2hvd0NvZGVDZWxscyk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXHR9XG5cblx0Z2V0QnJlYWRjcnVtYkVsZW1lbnRzKCk6IHJlYWRvbmx5IElCcmVhZGNydW1ic091dGxpbmVFbGVtZW50PE91dGxpbmVFbnRyeT5bXSB7XG5cdFx0Y29uc3QgcmVzdWx0OiBJQnJlYWRjcnVtYnNPdXRsaW5lRWxlbWVudDxPdXRsaW5lRW50cnk+W10gPSBbXTtcblx0XHRsZXQgY2FuZGlkYXRlID0gdGhpcy5vdXRsaW5lRGF0YVNvdXJjZVJlZj8ub2JqZWN0Py5hY3RpdmVFbGVtZW50O1xuXHRcdHdoaWxlIChjYW5kaWRhdGUpIHtcblx0XHRcdGlmICh0aGlzLnNob3dDb2RlQ2VsbHMgfHwgY2FuZGlkYXRlLmNlbGwuY2VsbEtpbmQgIT09IENlbGxLaW5kLkNvZGUpIHtcblx0XHRcdFx0cmVzdWx0LnVuc2hpZnQoeyBlbGVtZW50OiBjYW5kaWRhdGUsIGxhYmVsOiBjYW5kaWRhdGUubGFiZWwgfSk7XG5cdFx0XHR9XG5cdFx0XHRjYW5kaWRhdGUgPSBjYW5kaWRhdGUucGFyZW50O1xuXHRcdH1cblx0XHRyZXR1cm4gcmVzdWx0O1xuXHR9XG5cblx0ZGlzcG9zZSgpOiB2b2lkIHtcblx0XHR0aGlzLl9kaXNwb3NhYmxlcy5kaXNwb3NlKCk7XG5cdH1cbn1cblxuY2xhc3MgTm90ZWJvb2tDb21wYXJhdG9yIGltcGxlbWVudHMgSU91dGxpbmVDb21wYXJhdG9yPE91dGxpbmVFbnRyeT4ge1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX2NvbGxhdG9yID0gc2FmZUludGwuQ29sbGF0b3IodW5kZWZpbmVkLCB7IG51bWVyaWM6IHRydWUgfSk7XG5cblx0Y29tcGFyZUJ5UG9zaXRpb24oYTogT3V0bGluZUVudHJ5LCBiOiBPdXRsaW5lRW50cnkpOiBudW1iZXIge1xuXHRcdHJldHVybiBhLmluZGV4IC0gYi5pbmRleDtcblx0fVxuXHRjb21wYXJlQnlUeXBlKGE6IE91dGxpbmVFbnRyeSwgYjogT3V0bGluZUVudHJ5KTogbnVtYmVyIHtcblx0XHRyZXR1cm4gYS5jZWxsLmNlbGxLaW5kIC0gYi5jZWxsLmNlbGxLaW5kIHx8IHRoaXMuX2NvbGxhdG9yLnZhbHVlLmNvbXBhcmUoYS5sYWJlbCwgYi5sYWJlbCk7XG5cdH1cblx0Y29tcGFyZUJ5TmFtZShhOiBPdXRsaW5lRW50cnksIGI6IE91dGxpbmVFbnRyeSk6IG51bWJlciB7XG5cdFx0cmV0dXJuIHRoaXMuX2NvbGxhdG9yLnZhbHVlLmNvbXBhcmUoYS5sYWJlbCwgYi5sYWJlbCk7XG5cdH1cbn1cblxuZXhwb3J0IGNsYXNzIE5vdGVib29rQ2VsbE91dGxpbmUgaW1wbGVtZW50cyBJT3V0bGluZTxPdXRsaW5lRW50cnk+IHtcblx0cmVhZG9ubHkgb3V0bGluZUtpbmQgPSAnbm90ZWJvb2tDZWxscyc7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfZGlzcG9zYWJsZXMgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cdHByaXZhdGUgcmVhZG9ubHkgX21vZGVsRGlzcG9zYWJsZXMgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cdHByaXZhdGUgcmVhZG9ubHkgX2RhdGFTb3VyY2VEaXNwb3NhYmxlcyA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkRpZENoYW5nZSA9IG5ldyBFbWl0dGVyPE91dGxpbmVDaGFuZ2VFdmVudD4oKTtcblx0cmVhZG9ubHkgb25EaWRDaGFuZ2U6IEV2ZW50PE91dGxpbmVDaGFuZ2VFdmVudD4gPSB0aGlzLl9vbkRpZENoYW5nZS5ldmVudDtcblxuXHRwcml2YXRlIHJlYWRvbmx5IGRlbGF5ZXJSZWNvbXB1dGVTdGF0ZTogRGVsYXllcjx2b2lkPiA9IHRoaXMuX2Rpc3Bvc2FibGVzLmFkZChuZXcgRGVsYXllcjx2b2lkPigzMDApKTtcblx0cHJpdmF0ZSByZWFkb25seSBkZWxheWVyUmVjb21wdXRlQWN0aXZlOiBEZWxheWVyPHZvaWQ+ID0gdGhpcy5fZGlzcG9zYWJsZXMuYWRkKG5ldyBEZWxheWVyPHZvaWQ+KDIwMCkpO1xuXHQvLyB0aGlzIGNhbiBiZSBsb25nLCBiZWNhdXNlIGl0IHdpbGwgZm9yY2UgYSByZWNvbXB1dGUgYXQgdGhlIGVuZCwgc28gaWRlYWxseSB3ZSBvbmx5IGRvIHRoaXMgb25jZSBhbGwgbmIgbGFuZ3VhZ2UgZmVhdHVyZXMgYXJlIHJlZ2lzdGVyZWRcblx0cHJpdmF0ZSByZWFkb25seSBkZWxheWVyUmVjb21wdXRlU3ltYm9sczogRGVsYXllcjx2b2lkPiA9IHRoaXMuX2Rpc3Bvc2FibGVzLmFkZChuZXcgRGVsYXllcjx2b2lkPigyMDAwKSk7XG5cblx0cmVhZG9ubHkgY29uZmlnOiBJT3V0bGluZUxpc3RDb25maWc8T3V0bGluZUVudHJ5Pjtcblx0cHJpdmF0ZSBfb3V0bGluZURhdGFTb3VyY2VSZWZlcmVuY2U6IElSZWZlcmVuY2U8Tm90ZWJvb2tDZWxsT3V0bGluZURhdGFTb3VyY2U+IHwgdW5kZWZpbmVkO1xuXHQvLyBUaGVzZSB0aHJlZSBmaWVsZHMgd2lsbCBhbHdheXMgYmUgc2V0IHZpYSBzZXREYXRhU291cmNlcygpIG9uIEw0NzVcblx0cHJpdmF0ZSBfdHJlZURhdGFTb3VyY2UhOiBJRGF0YVNvdXJjZTxOb3RlYm9va0NlbGxPdXRsaW5lLCBPdXRsaW5lRW50cnk+O1xuXHRwcml2YXRlIF9xdWlja1BpY2tEYXRhU291cmNlITogSVF1aWNrUGlja0RhdGFTb3VyY2U8T3V0bGluZUVudHJ5Pjtcblx0cHJpdmF0ZSBfYnJlYWRjcnVtYnNEYXRhU291cmNlITogSUJyZWFkY3J1bWJzRGF0YVNvdXJjZTxPdXRsaW5lRW50cnk+O1xuXG5cdC8vIHZpZXcgc2V0dGluZ3Ncblx0cHJpdmF0ZSBvdXRsaW5lU2hvd0NvZGVDZWxsczogYm9vbGVhbjtcblx0cHJpdmF0ZSBvdXRsaW5lU2hvd0NvZGVDZWxsU3ltYm9sczogYm9vbGVhbjtcblx0cHJpdmF0ZSBvdXRsaW5lU2hvd01hcmtkb3duSGVhZGVyc09ubHk6IGJvb2xlYW47XG5cblx0Ly8gZ2V0dGVyc1xuXHRnZXQgYWN0aXZlRWxlbWVudCgpOiBPdXRsaW5lRW50cnkgfCB1bmRlZmluZWQge1xuXHRcdHRoaXMuY2hlY2tEZWxheWVyKCk7XG5cdFx0aWYgKHRoaXMuX3RhcmdldCA9PT0gT3V0bGluZVRhcmdldC5PdXRsaW5lUGFuZSkge1xuXHRcdFx0cmV0dXJuICh0aGlzLmNvbmZpZy50cmVlRGF0YVNvdXJjZSBhcyBOb3RlYm9va091dGxpbmVQYW5lUHJvdmlkZXIpLmdldEFjdGl2ZUVudHJ5KCk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdGNvbnNvbGUuZXJyb3IoJ2FjdGl2ZUVsZW1lbnQgc2hvdWxkIG5vdCBiZSBjYWxsZWQgb3V0c2lkZSBvZiB0aGUgT3V0bGluZVBhbmUnKTtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXHR9XG5cdGdldCBlbnRyaWVzKCk6IE91dGxpbmVFbnRyeVtdIHtcblx0XHR0aGlzLmNoZWNrRGVsYXllcigpO1xuXHRcdHJldHVybiB0aGlzLl9vdXRsaW5lRGF0YVNvdXJjZVJlZmVyZW5jZT8ub2JqZWN0Py5lbnRyaWVzID8/IFtdO1xuXHR9XG5cdGdldCB1cmkoKTogVVJJIHwgdW5kZWZpbmVkIHtcblx0XHRyZXR1cm4gdGhpcy5fb3V0bGluZURhdGFTb3VyY2VSZWZlcmVuY2U/Lm9iamVjdD8udXJpO1xuXHR9XG5cdGdldCBpc0VtcHR5KCk6IGJvb2xlYW4ge1xuXHRcdGlmICghdGhpcy5fb3V0bGluZURhdGFTb3VyY2VSZWZlcmVuY2U/Lm9iamVjdD8uZW50cmllcykge1xuXHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0fVxuXG5cdFx0cmV0dXJuICF0aGlzLl9vdXRsaW5lRGF0YVNvdXJjZVJlZmVyZW5jZS5vYmplY3QuZW50cmllcy5zb21lKGVudHJ5ID0+IHtcblx0XHRcdHJldHVybiAhZmlsdGVyRW50cnkoZW50cnksIHRoaXMub3V0bGluZVNob3dNYXJrZG93bkhlYWRlcnNPbmx5LCB0aGlzLm91dGxpbmVTaG93Q29kZUNlbGxzLCB0aGlzLm91dGxpbmVTaG93Q29kZUNlbGxTeW1ib2xzKTtcblx0XHR9KTtcblx0fVxuXG5cdHByaXZhdGUgY2hlY2tEZWxheWVyKCkge1xuXHRcdGlmICh0aGlzLmRlbGF5ZXJSZWNvbXB1dGVTdGF0ZS5pc1RyaWdnZXJlZCgpKSB7XG5cdFx0XHR0aGlzLmRlbGF5ZXJSZWNvbXB1dGVTdGF0ZS5jYW5jZWwoKTtcblx0XHRcdHRoaXMucmVjb21wdXRlU3RhdGUoKTtcblx0XHR9XG5cdH1cblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRwcml2YXRlIHJlYWRvbmx5IF9lZGl0b3I6IElOb3RlYm9va0VkaXRvclBhbmUsXG5cdFx0cHJpdmF0ZSByZWFkb25seSBfdGFyZ2V0OiBPdXRsaW5lVGFyZ2V0LFxuXHRcdEBJVGhlbWVTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX3RoZW1lU2VydmljZTogSVRoZW1lU2VydmljZSxcblx0XHRASUVkaXRvclNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfZWRpdG9yU2VydmljZTogSUVkaXRvclNlcnZpY2UsXG5cdFx0QElJbnN0YW50aWF0aW9uU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9pbnN0YW50aWF0aW9uU2VydmljZTogSUluc3RhbnRpYXRpb25TZXJ2aWNlLFxuXHRcdEBJQ29uZmlndXJhdGlvblNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfY29uZmlndXJhdGlvblNlcnZpY2U6IElDb25maWd1cmF0aW9uU2VydmljZSxcblx0XHRASUxhbmd1YWdlRmVhdHVyZXNTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2xhbmd1YWdlRmVhdHVyZXNTZXJ2aWNlOiBJTGFuZ3VhZ2VGZWF0dXJlc1NlcnZpY2UsXG5cdFx0QElOb3RlYm9va0V4ZWN1dGlvblN0YXRlU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9ub3RlYm9va0V4ZWN1dGlvblN0YXRlU2VydmljZTogSU5vdGVib29rRXhlY3V0aW9uU3RhdGVTZXJ2aWNlLFxuXHQpIHtcblx0XHR0aGlzLm91dGxpbmVTaG93Q29kZUNlbGxzID0gdGhpcy5fY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0VmFsdWU8Ym9vbGVhbj4oTm90ZWJvb2tTZXR0aW5nLm91dGxpbmVTaG93Q29kZUNlbGxzKTtcblx0XHR0aGlzLm91dGxpbmVTaG93Q29kZUNlbGxTeW1ib2xzID0gdGhpcy5fY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0VmFsdWU8Ym9vbGVhbj4oTm90ZWJvb2tTZXR0aW5nLm91dGxpbmVTaG93Q29kZUNlbGxTeW1ib2xzKTtcblx0XHR0aGlzLm91dGxpbmVTaG93TWFya2Rvd25IZWFkZXJzT25seSA9IHRoaXMuX2NvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldFZhbHVlPGJvb2xlYW4+KE5vdGVib29rU2V0dGluZy5vdXRsaW5lU2hvd01hcmtkb3duSGVhZGVyc09ubHkpO1xuXG5cdFx0dGhpcy5pbml0aWFsaXplT3V0bGluZSgpO1xuXG5cdFx0Y29uc3QgZGVsZWdhdGUgPSBuZXcgTm90ZWJvb2tPdXRsaW5lVmlydHVhbERlbGVnYXRlKCk7XG5cdFx0Y29uc3QgcmVuZGVyZXJzID0gW3RoaXMuX2luc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKE5vdGVib29rT3V0bGluZVJlbmRlcmVyLCB0aGlzLl9lZGl0b3IuZ2V0Q29udHJvbCgpLCB0aGlzLl90YXJnZXQpXTtcblx0XHRjb25zdCBjb21wYXJhdG9yID0gbmV3IE5vdGVib29rQ29tcGFyYXRvcigpO1xuXG5cdFx0Y29uc3Qgb3B0aW9uczogSVdvcmtiZW5jaERhdGFUcmVlT3B0aW9uczxPdXRsaW5lRW50cnksIEZ1enp5U2NvcmU+ID0ge1xuXHRcdFx0Y29sbGFwc2VCeURlZmF1bHQ6IHRoaXMuX3RhcmdldCA9PT0gT3V0bGluZVRhcmdldC5CcmVhZGNydW1icyB8fCAodGhpcy5fdGFyZ2V0ID09PSBPdXRsaW5lVGFyZ2V0Lk91dGxpbmVQYW5lICYmIHRoaXMuX2NvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldFZhbHVlKE91dGxpbmVDb25maWdLZXlzLmNvbGxhcHNlSXRlbXMpID09PSBPdXRsaW5lQ29uZmlnQ29sbGFwc2VJdGVtc1ZhbHVlcy5Db2xsYXBzZWQpLFxuXHRcdFx0ZXhwYW5kT25seU9uVHdpc3RpZUNsaWNrOiB0cnVlLFxuXHRcdFx0bXVsdGlwbGVTZWxlY3Rpb25TdXBwb3J0OiBmYWxzZSxcblx0XHRcdGFjY2Vzc2liaWxpdHlQcm92aWRlcjogbmV3IE5vdGVib29rT3V0bGluZUFjY2Vzc2liaWxpdHkoKSxcblx0XHRcdGlkZW50aXR5UHJvdmlkZXI6IHsgZ2V0SWQ6IGVsZW1lbnQgPT4gZWxlbWVudC5jZWxsLnVyaS50b1N0cmluZygpIH0sXG5cdFx0XHRrZXlib2FyZE5hdmlnYXRpb25MYWJlbFByb3ZpZGVyOiBuZXcgTm90ZWJvb2tOYXZpZ2F0aW9uTGFiZWxQcm92aWRlcigpXG5cdFx0fTtcblxuXHRcdHRoaXMuY29uZmlnID0ge1xuXHRcdFx0dHJlZURhdGFTb3VyY2U6IHRoaXMuX3RyZWVEYXRhU291cmNlLFxuXHRcdFx0cXVpY2tQaWNrRGF0YVNvdXJjZTogdGhpcy5fcXVpY2tQaWNrRGF0YVNvdXJjZSxcblx0XHRcdGJyZWFkY3J1bWJzRGF0YVNvdXJjZTogdGhpcy5fYnJlYWRjcnVtYnNEYXRhU291cmNlLFxuXHRcdFx0ZGVsZWdhdGUsXG5cdFx0XHRyZW5kZXJlcnMsXG5cdFx0XHRjb21wYXJhdG9yLFxuXHRcdFx0b3B0aW9ucyxcblx0XHR9O1xuXHR9XG5cblx0cHJpdmF0ZSBpbml0aWFsaXplT3V0bGluZSgpIHtcblx0XHQvLyBpbml0aWFsIHNldHVwXG5cdFx0dGhpcy5zZXREYXRhU291cmNlcygpO1xuXHRcdHRoaXMuc2V0TW9kZWxMaXN0ZW5lcnMoKTtcblxuXHRcdC8vIHJlc2V0IHRoZSBkYXRhIHNvdXJjZXMgKyBtb2RlbCBsaXN0ZW5lcnMgd2hlbiB3ZSBnZXQgYSBuZXcgbm90ZWJvb2sgbW9kZWxcblx0XHR0aGlzLl9kaXNwb3NhYmxlcy5hZGQodGhpcy5fZWRpdG9yLm9uRGlkQ2hhbmdlTW9kZWwoKCkgPT4ge1xuXHRcdFx0dGhpcy5zZXREYXRhU291cmNlcygpO1xuXHRcdFx0dGhpcy5zZXRNb2RlbExpc3RlbmVycygpO1xuXHRcdFx0dGhpcy5jb21wdXRlU3ltYm9scygpO1xuXHRcdH0pKTtcblxuXHRcdC8vIHJlY29tcHV0ZSBzeW1ib2xzIGFzIGRvY3VtZW50IHN5bWJvbCBwcm92aWRlcnMgYXJlIHVwZGF0ZWQgaW4gdGhlIGxhbmd1YWdlIGZlYXR1cmVzIHJlZ2lzdHJ5XG5cdFx0dGhpcy5fZGlzcG9zYWJsZXMuYWRkKHRoaXMuX2xhbmd1YWdlRmVhdHVyZXNTZXJ2aWNlLmRvY3VtZW50U3ltYm9sUHJvdmlkZXIub25EaWRDaGFuZ2UoKCkgPT4ge1xuXHRcdFx0dGhpcy5kZWxheWVkQ29tcHV0ZVN5bWJvbHMoKTtcblx0XHR9KSk7XG5cblx0XHQvLyByZWNvbXB1dGUgYWN0aXZlIHdoZW4gdGhlIHNlbGVjdGlvbiBjaGFuZ2VzXG5cdFx0dGhpcy5fZGlzcG9zYWJsZXMuYWRkKHRoaXMuX2VkaXRvci5vbkRpZENoYW5nZVNlbGVjdGlvbigoKSA9PiB7XG5cdFx0XHR0aGlzLmRlbGF5ZWRSZWNvbXB1dGVBY3RpdmUoKTtcblx0XHR9KSk7XG5cblx0XHQvLyByZWNvbXB1dGUgc3RhdGUgd2hlbiBmaWx0ZXIgY29uZmlnIGNoYW5nZXNcblx0XHR0aGlzLl9kaXNwb3NhYmxlcy5hZGQodGhpcy5fY29uZmlndXJhdGlvblNlcnZpY2Uub25EaWRDaGFuZ2VDb25maWd1cmF0aW9uKGUgPT4ge1xuXHRcdFx0aWYgKGUuYWZmZWN0c0NvbmZpZ3VyYXRpb24oTm90ZWJvb2tTZXR0aW5nLm91dGxpbmVTaG93TWFya2Rvd25IZWFkZXJzT25seSkgfHxcblx0XHRcdFx0ZS5hZmZlY3RzQ29uZmlndXJhdGlvbihOb3RlYm9va1NldHRpbmcub3V0bGluZVNob3dDb2RlQ2VsbHMpIHx8XG5cdFx0XHRcdGUuYWZmZWN0c0NvbmZpZ3VyYXRpb24oTm90ZWJvb2tTZXR0aW5nLm91dGxpbmVTaG93Q29kZUNlbGxTeW1ib2xzKSB8fFxuXHRcdFx0XHRlLmFmZmVjdHNDb25maWd1cmF0aW9uKE5vdGVib29rU2V0dGluZy5icmVhZGNydW1ic1Nob3dDb2RlQ2VsbHMpXG5cdFx0XHQpIHtcblx0XHRcdFx0dGhpcy5vdXRsaW5lU2hvd0NvZGVDZWxscyA9IHRoaXMuX2NvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldFZhbHVlPGJvb2xlYW4+KE5vdGVib29rU2V0dGluZy5vdXRsaW5lU2hvd0NvZGVDZWxscyk7XG5cdFx0XHRcdHRoaXMub3V0bGluZVNob3dDb2RlQ2VsbFN5bWJvbHMgPSB0aGlzLl9jb25maWd1cmF0aW9uU2VydmljZS5nZXRWYWx1ZTxib29sZWFuPihOb3RlYm9va1NldHRpbmcub3V0bGluZVNob3dDb2RlQ2VsbFN5bWJvbHMpO1xuXHRcdFx0XHR0aGlzLm91dGxpbmVTaG93TWFya2Rvd25IZWFkZXJzT25seSA9IHRoaXMuX2NvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldFZhbHVlPGJvb2xlYW4+KE5vdGVib29rU2V0dGluZy5vdXRsaW5lU2hvd01hcmtkb3duSGVhZGVyc09ubHkpO1xuXG5cdFx0XHRcdHRoaXMuZGVsYXllZFJlY29tcHV0ZVN0YXRlKCk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXG5cdFx0Ly8gcmVjb21wdXRlIHN0YXRlIHdoZW4gZXhlY3V0aW9uIHN0YXRlcyBjaGFuZ2Vcblx0XHR0aGlzLl9kaXNwb3NhYmxlcy5hZGQodGhpcy5fbm90ZWJvb2tFeGVjdXRpb25TdGF0ZVNlcnZpY2Uub25EaWRDaGFuZ2VFeGVjdXRpb24oZSA9PiB7XG5cdFx0XHRpZiAoZS50eXBlID09PSBOb3RlYm9va0V4ZWN1dGlvblR5cGUuY2VsbCAmJiAhIXRoaXMuX2VkaXRvci50ZXh0TW9kZWwgJiYgZS5hZmZlY3RzTm90ZWJvb2sodGhpcy5fZWRpdG9yLnRleHRNb2RlbD8udXJpKSkge1xuXHRcdFx0XHR0aGlzLmRlbGF5ZWRSZWNvbXB1dGVTdGF0ZSgpO1xuXHRcdFx0fVxuXHRcdH0pKTtcblxuXHRcdC8vIHJlY29tcHV0ZSBzeW1ib2xzIHdoZW4gdGhlIGNvbmZpZ3VyYXRpb24gY2hhbmdlcyAocmVjb21wdXRlIHN0YXRlIC0gYW5kIHRoZXJlZm9yZSByZWNvbXB1dGUgYWN0aXZlIC0gaXMgYWxzbyBjYWxsZWQgd2l0aGluIGNvbXB1dGUgc3ltYm9scylcblx0XHR0aGlzLl9kaXNwb3NhYmxlcy5hZGQodGhpcy5fY29uZmlndXJhdGlvblNlcnZpY2Uub25EaWRDaGFuZ2VDb25maWd1cmF0aW9uKGUgPT4ge1xuXHRcdFx0aWYgKGUuYWZmZWN0c0NvbmZpZ3VyYXRpb24oTm90ZWJvb2tTZXR0aW5nLm91dGxpbmVTaG93Q29kZUNlbGxTeW1ib2xzKSkge1xuXHRcdFx0XHR0aGlzLm91dGxpbmVTaG93Q29kZUNlbGxTeW1ib2xzID0gdGhpcy5fY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0VmFsdWU8Ym9vbGVhbj4oTm90ZWJvb2tTZXR0aW5nLm91dGxpbmVTaG93Q29kZUNlbGxTeW1ib2xzKTtcblx0XHRcdFx0dGhpcy5jb21wdXRlU3ltYm9scygpO1xuXHRcdFx0fVxuXHRcdH0pKTtcblxuXHRcdC8vIGZpcmUgYSBjaGFuZ2UgZXZlbnQgd2hlbiB0aGUgdGhlbWUgY2hhbmdlc1xuXHRcdHRoaXMuX2Rpc3Bvc2FibGVzLmFkZCh0aGlzLl90aGVtZVNlcnZpY2Uub25EaWRGaWxlSWNvblRoZW1lQ2hhbmdlKCgpID0+IHtcblx0XHRcdHRoaXMuX29uRGlkQ2hhbmdlLmZpcmUoe30pO1xuXHRcdH0pKTtcblxuXHRcdC8vIGZpbmlzaCB3aXRoIGEgcmVjb21wdXRlIHN0YXRlXG5cdFx0dGhpcy5yZWNvbXB1dGVTdGF0ZSgpO1xuXHR9XG5cblx0LyoqXG5cdCAqIHNldCB1cCB0aGUgcHJpbWFyeSBkYXRhIHNvdXJjZSArIHRocmVlIHZpZXdpbmcgc291cmNlcyBmb3IgdGhlIHZhcmlvdXMgb3V0bGluZSB2aWV3c1xuXHQgKi9cblx0cHJpdmF0ZSBzZXREYXRhU291cmNlcygpOiB2b2lkIHtcblx0XHRjb25zdCBub3RlYm9va0VkaXRvciA9IHRoaXMuX2VkaXRvci5nZXRDb250cm9sKCk7XG5cdFx0dGhpcy5fb3V0bGluZURhdGFTb3VyY2VSZWZlcmVuY2U/LmRpc3Bvc2UoKTtcblx0XHR0aGlzLl9kYXRhU291cmNlRGlzcG9zYWJsZXMuY2xlYXIoKTtcblxuXHRcdGlmICghbm90ZWJvb2tFZGl0b3I/Lmhhc01vZGVsKCkpIHtcblx0XHRcdHRoaXMuX291dGxpbmVEYXRhU291cmNlUmVmZXJlbmNlID0gdW5kZWZpbmVkO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHR0aGlzLl9vdXRsaW5lRGF0YVNvdXJjZVJlZmVyZW5jZSA9IHRoaXMuX2RhdGFTb3VyY2VEaXNwb3NhYmxlcy5hZGQodGhpcy5faW5zdGFudGlhdGlvblNlcnZpY2UuaW52b2tlRnVuY3Rpb24oKGFjY2Vzc29yKSA9PiBhY2Nlc3Nvci5nZXQoSU5vdGVib29rQ2VsbE91dGxpbmVEYXRhU291cmNlRmFjdG9yeSkuZ2V0T3JDcmVhdGUobm90ZWJvb2tFZGl0b3IpKSk7XG5cdFx0XHQvLyBlc2NhbGF0ZSBvdXRsaW5lIGRhdGEgc291cmNlIGNoYW5nZSBldmVudHNcblx0XHRcdHRoaXMuX2RhdGFTb3VyY2VEaXNwb3NhYmxlcy5hZGQodGhpcy5fb3V0bGluZURhdGFTb3VyY2VSZWZlcmVuY2Uub2JqZWN0Lm9uRGlkQ2hhbmdlKCgpID0+IHtcblx0XHRcdFx0dGhpcy5fb25EaWRDaGFuZ2UuZmlyZSh7fSk7XG5cdFx0XHR9KSk7XG5cdFx0fVxuXG5cdFx0Ly8gdGhlc2UgZmllbGRzIGNhbiBiZSBwYXNzZWQgdW5kZWZpbmVkIG91dGxpbmVEYXRhU291cmNlcy4gVmlldyBQcm92aWRlcnMgYWxsIGhhbmRsZSBpdCBhY2NvcmRpbmdseVxuXHRcdHRoaXMuX3RyZWVEYXRhU291cmNlID0gdGhpcy5fZGF0YVNvdXJjZURpc3Bvc2FibGVzLmFkZCh0aGlzLl9pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShOb3RlYm9va091dGxpbmVQYW5lUHJvdmlkZXIsIHRoaXMuX291dGxpbmVEYXRhU291cmNlUmVmZXJlbmNlKSk7XG5cdFx0dGhpcy5fcXVpY2tQaWNrRGF0YVNvdXJjZSA9IHRoaXMuX2RhdGFTb3VyY2VEaXNwb3NhYmxlcy5hZGQodGhpcy5faW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoTm90ZWJvb2tRdWlja1BpY2tQcm92aWRlciwgdGhpcy5fb3V0bGluZURhdGFTb3VyY2VSZWZlcmVuY2UpKTtcblx0XHR0aGlzLl9icmVhZGNydW1ic0RhdGFTb3VyY2UgPSB0aGlzLl9kYXRhU291cmNlRGlzcG9zYWJsZXMuYWRkKHRoaXMuX2luc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKE5vdGVib29rQnJlYWRjcnVtYnNQcm92aWRlciwgdGhpcy5fb3V0bGluZURhdGFTb3VyY2VSZWZlcmVuY2UpKTtcblx0fVxuXG5cdC8qKlxuXHQgKiBzZXQgdXAgdGhlIGxpc3RlbmVycyBmb3IgdGhlIG91dGxpbmUgY29udGVudCwgdGhlc2UgcmVzcG9uZCB0byBtb2RlbCBjaGFuZ2VzIGluIHRoZSBub3RlYm9va1xuXHQgKi9cblx0cHJpdmF0ZSBzZXRNb2RlbExpc3RlbmVycygpOiB2b2lkIHtcblx0XHR0aGlzLl9tb2RlbERpc3Bvc2FibGVzLmNsZWFyKCk7XG5cdFx0aWYgKCF0aGlzLl9lZGl0b3IudGV4dE1vZGVsKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Ly8gUGVyaGFwcyB0aGlzIGlzIHRoZSBmaXJzdCB0aW1lIHdlJ3JlIGJ1aWxkaW5nIHRoZSBvdXRsaW5lXG5cdFx0aWYgKCF0aGlzLmVudHJpZXMubGVuZ3RoKSB7XG5cdFx0XHR0aGlzLmNvbXB1dGVTeW1ib2xzKCk7XG5cdFx0fVxuXG5cdFx0Ly8gcmVjb21wdXRlIHN0YXRlIHdoZW4gdGhlcmUgYXJlIG5vdGVib29rIGNvbnRlbnQgY2hhbmdlc1xuXHRcdHRoaXMuX21vZGVsRGlzcG9zYWJsZXMuYWRkKHRoaXMuX2VkaXRvci50ZXh0TW9kZWwub25EaWRDaGFuZ2VDb250ZW50KGNvbnRlbnRDaGFuZ2VzID0+IHtcblx0XHRcdGlmIChjb250ZW50Q2hhbmdlcy5yYXdFdmVudHMuc29tZShjID0+XG5cdFx0XHRcdGMua2luZCA9PT0gTm90ZWJvb2tDZWxsc0NoYW5nZVR5cGUuQ2hhbmdlQ2VsbENvbnRlbnQgfHxcblx0XHRcdFx0Yy5raW5kID09PSBOb3RlYm9va0NlbGxzQ2hhbmdlVHlwZS5DaGFuZ2VDZWxsSW50ZXJuYWxNZXRhZGF0YSB8fFxuXHRcdFx0XHRjLmtpbmQgPT09IE5vdGVib29rQ2VsbHNDaGFuZ2VUeXBlLk1vdmUgfHxcblx0XHRcdFx0Yy5raW5kID09PSBOb3RlYm9va0NlbGxzQ2hhbmdlVHlwZS5Nb2RlbENoYW5nZSkpIHtcblx0XHRcdFx0dGhpcy5kZWxheWVkUmVjb21wdXRlU3RhdGUoKTtcblx0XHRcdH1cblx0XHR9KSk7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIGNvbXB1dGVTeW1ib2xzKGNhbmNlbFRva2VuOiBDYW5jZWxsYXRpb25Ub2tlbiA9IENhbmNlbGxhdGlvblRva2VuLk5vbmUpIHtcblx0XHRpZiAodGhpcy5fdGFyZ2V0ID09PSBPdXRsaW5lVGFyZ2V0Lk91dGxpbmVQYW5lICYmIHRoaXMub3V0bGluZVNob3dDb2RlQ2VsbFN5bWJvbHMpIHtcblx0XHRcdC8vIE5vIG5lZWQgdG8gd2FpdCBmb3IgdGhpcywgd2Ugd2FudCB0aGUgb3V0bGluZSB0byBzaG93IHVwIHF1aWNrbHkuXG5cdFx0XHR2b2lkIHRoaXMuZG9Db21wdXRlU3ltYm9scyhjYW5jZWxUb2tlbik7XG5cdFx0fVxuXHR9XG5cdHB1YmxpYyBhc3luYyBkb0NvbXB1dGVTeW1ib2xzKGNhbmNlbFRva2VuOiBDYW5jZWxsYXRpb25Ub2tlbik6IFByb21pc2U8dm9pZD4ge1xuXHRcdGF3YWl0IHRoaXMuX291dGxpbmVEYXRhU291cmNlUmVmZXJlbmNlPy5vYmplY3Q/LmNvbXB1dGVGdWxsU3ltYm9scyhjYW5jZWxUb2tlbik7XG5cdH1cblx0cHJpdmF0ZSBhc3luYyBkZWxheWVkQ29tcHV0ZVN5bWJvbHMoKSB7XG5cdFx0dGhpcy5kZWxheWVyUmVjb21wdXRlU3RhdGUuY2FuY2VsKCk7XG5cdFx0dGhpcy5kZWxheWVyUmVjb21wdXRlQWN0aXZlLmNhbmNlbCgpO1xuXHRcdHRoaXMuZGVsYXllclJlY29tcHV0ZVN5bWJvbHMudHJpZ2dlcigoKSA9PiB7IHRoaXMuY29tcHV0ZVN5bWJvbHMoKTsgfSk7XG5cdH1cblxuXHRwcml2YXRlIHJlY29tcHV0ZVN0YXRlKCkgeyB0aGlzLl9vdXRsaW5lRGF0YVNvdXJjZVJlZmVyZW5jZT8ub2JqZWN0Py5yZWNvbXB1dGVTdGF0ZSgpOyB9XG5cdHByaXZhdGUgZGVsYXllZFJlY29tcHV0ZVN0YXRlKCkge1xuXHRcdHRoaXMuZGVsYXllclJlY29tcHV0ZUFjdGl2ZS5jYW5jZWwoKTsgLy8gQWN0aXZlIGlzIGFsd2F5cyByZWNvbXB1dGVkIGFmdGVyIGEgcmVjb21wdXRpbmcgdGhlIFN0YXRlLlxuXHRcdHRoaXMuZGVsYXllclJlY29tcHV0ZVN0YXRlLnRyaWdnZXIoKCkgPT4geyB0aGlzLnJlY29tcHV0ZVN0YXRlKCk7IH0pO1xuXHR9XG5cblx0cHJpdmF0ZSByZWNvbXB1dGVBY3RpdmUoKSB7IHRoaXMuX291dGxpbmVEYXRhU291cmNlUmVmZXJlbmNlPy5vYmplY3Q/LnJlY29tcHV0ZUFjdGl2ZSgpOyB9XG5cdHByaXZhdGUgZGVsYXllZFJlY29tcHV0ZUFjdGl2ZSgpIHtcblx0XHR0aGlzLmRlbGF5ZXJSZWNvbXB1dGVBY3RpdmUudHJpZ2dlcigoKSA9PiB7IHRoaXMucmVjb21wdXRlQWN0aXZlKCk7IH0pO1xuXHR9XG5cblx0YXN5bmMgcmV2ZWFsKGVudHJ5OiBPdXRsaW5lRW50cnksIG9wdGlvbnM6IElFZGl0b3JPcHRpb25zLCBzaWRlQnlTaWRlOiBib29sZWFuKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3Qgbm90ZWJvb2tFZGl0b3JPcHRpb25zOiBJTm90ZWJvb2tFZGl0b3JPcHRpb25zID0ge1xuXHRcdFx0Li4ub3B0aW9ucyxcblx0XHRcdG92ZXJyaWRlOiB0aGlzLl9lZGl0b3IuaW5wdXQ/LmVkaXRvcklkLFxuXHRcdFx0Y2VsbFJldmVhbFR5cGU6IENlbGxSZXZlYWxUeXBlLlRvcCxcblx0XHRcdHNlbGVjdGlvbjogZW50cnkucG9zaXRpb24sXG5cdFx0XHR2aWV3U3RhdGU6IHVuZGVmaW5lZCxcblx0XHR9O1xuXHRcdGF3YWl0IHRoaXMuX2VkaXRvclNlcnZpY2Uub3BlbkVkaXRvcih7XG5cdFx0XHRyZXNvdXJjZTogZW50cnkuY2VsbC51cmksXG5cdFx0XHRvcHRpb25zOiBub3RlYm9va0VkaXRvck9wdGlvbnMsXG5cdFx0fSwgc2lkZUJ5U2lkZSA/IFNJREVfR1JPVVAgOiB1bmRlZmluZWQpO1xuXHR9XG5cblx0cHJldmlldyhlbnRyeTogT3V0bGluZUVudHJ5KTogSURpc3Bvc2FibGUge1xuXHRcdGNvbnN0IHdpZGdldCA9IHRoaXMuX2VkaXRvci5nZXRDb250cm9sKCk7XG5cdFx0aWYgKCF3aWRnZXQpIHtcblx0XHRcdHJldHVybiBEaXNwb3NhYmxlLk5vbmU7XG5cdFx0fVxuXG5cblx0XHRpZiAoZW50cnkucmFuZ2UpIHtcblx0XHRcdGNvbnN0IHJhbmdlID0gUmFuZ2UubGlmdChlbnRyeS5yYW5nZSk7XG5cdFx0XHR3aWRnZXQucmV2ZWFsUmFuZ2VJbkNlbnRlcklmT3V0c2lkZVZpZXdwb3J0QXN5bmMoZW50cnkuY2VsbCwgcmFuZ2UpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHR3aWRnZXQucmV2ZWFsSW5DZW50ZXJJZk91dHNpZGVWaWV3cG9ydChlbnRyeS5jZWxsKTtcblx0XHR9XG5cblx0XHRjb25zdCBpZHMgPSB3aWRnZXQuZGVsdGFDZWxsRGVjb3JhdGlvbnMoW10sIFt7XG5cdFx0XHRoYW5kbGU6IGVudHJ5LmNlbGwuaGFuZGxlLFxuXHRcdFx0b3B0aW9uczogeyBjbGFzc05hbWU6ICduYi1zeW1ib2xIaWdobGlnaHQnLCBvdXRwdXRDbGFzc05hbWU6ICduYi1zeW1ib2xIaWdobGlnaHQnIH1cblx0XHR9XSk7XG5cblx0XHRsZXQgZWRpdG9yRGVjb3JhdGlvbnM6IElDZWxsTW9kZWxEZWNvcmF0aW9uc1tdO1xuXHRcdHdpZGdldC5jaGFuZ2VNb2RlbERlY29yYXRpb25zKGFjY2Vzc29yID0+IHtcblx0XHRcdGlmIChlbnRyeS5yYW5nZSkge1xuXHRcdFx0XHRjb25zdCBkZWNvcmF0aW9uczogSU1vZGVsRGVsdGFEZWNvcmF0aW9uW10gPSBbXG5cdFx0XHRcdFx0e1xuXHRcdFx0XHRcdFx0cmFuZ2U6IGVudHJ5LnJhbmdlLCBvcHRpb25zOiB7XG5cdFx0XHRcdFx0XHRcdGRlc2NyaXB0aW9uOiAnZG9jdW1lbnQtc3ltYm9scy1vdXRsaW5lLXJhbmdlLWhpZ2hsaWdodCcsXG5cdFx0XHRcdFx0XHRcdGNsYXNzTmFtZTogJ3JhbmdlSGlnaGxpZ2h0Jyxcblx0XHRcdFx0XHRcdFx0aXNXaG9sZUxpbmU6IHRydWVcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHR9XG5cdFx0XHRcdF07XG5cdFx0XHRcdGNvbnN0IGRlbHRhRGVjb3JhdGlvbjogSUNlbGxNb2RlbERlbHRhRGVjb3JhdGlvbnMgPSB7XG5cdFx0XHRcdFx0b3duZXJJZDogZW50cnkuY2VsbC5oYW5kbGUsXG5cdFx0XHRcdFx0ZGVjb3JhdGlvbnM6IGRlY29yYXRpb25zXG5cdFx0XHRcdH07XG5cblx0XHRcdFx0ZWRpdG9yRGVjb3JhdGlvbnMgPSBhY2Nlc3Nvci5kZWx0YURlY29yYXRpb25zKFtdLCBbZGVsdGFEZWNvcmF0aW9uXSk7XG5cdFx0XHR9XG5cdFx0fSk7XG5cblx0XHRyZXR1cm4gdG9EaXNwb3NhYmxlKCgpID0+IHtcblx0XHRcdHdpZGdldC5kZWx0YUNlbGxEZWNvcmF0aW9ucyhpZHMsIFtdKTtcblx0XHRcdGlmIChlZGl0b3JEZWNvcmF0aW9ucz8ubGVuZ3RoKSB7XG5cdFx0XHRcdHdpZGdldC5jaGFuZ2VNb2RlbERlY29yYXRpb25zKGFjY2Vzc29yID0+IHtcblx0XHRcdFx0XHRhY2Nlc3Nvci5kZWx0YURlY29yYXRpb25zKGVkaXRvckRlY29yYXRpb25zLCBbXSk7XG5cdFx0XHRcdH0pO1xuXHRcdFx0fVxuXHRcdH0pO1xuXG5cdH1cblxuXHRjYXB0dXJlVmlld1N0YXRlKCk6IElEaXNwb3NhYmxlIHtcblx0XHRjb25zdCB3aWRnZXQgPSB0aGlzLl9lZGl0b3IuZ2V0Q29udHJvbCgpO1xuXHRcdGNvbnN0IHZpZXdTdGF0ZSA9IHdpZGdldD8uZ2V0RWRpdG9yVmlld1N0YXRlKCk7XG5cdFx0cmV0dXJuIHRvRGlzcG9zYWJsZSgoKSA9PiB7XG5cdFx0XHRpZiAodmlld1N0YXRlKSB7XG5cdFx0XHRcdHdpZGdldD8ucmVzdG9yZUxpc3RWaWV3U3RhdGUodmlld1N0YXRlKTtcblx0XHRcdH1cblx0XHR9KTtcblx0fVxuXG5cdGRpc3Bvc2UoKTogdm9pZCB7XG5cdFx0dGhpcy5fb25EaWRDaGFuZ2UuZGlzcG9zZSgpO1xuXHRcdHRoaXMuX2Rpc3Bvc2FibGVzLmRpc3Bvc2UoKTtcblx0XHR0aGlzLl9tb2RlbERpc3Bvc2FibGVzLmRpc3Bvc2UoKTtcblx0XHR0aGlzLl9kYXRhU291cmNlRGlzcG9zYWJsZXMuZGlzcG9zZSgpO1xuXHRcdHRoaXMuX291dGxpbmVEYXRhU291cmNlUmVmZXJlbmNlPy5kaXNwb3NlKCk7XG5cdH1cbn1cblxuZXhwb3J0IGNsYXNzIE5vdGVib29rT3V0bGluZUNyZWF0b3IgaW1wbGVtZW50cyBJT3V0bGluZUNyZWF0b3I8Tm90ZWJvb2tFZGl0b3IsIE91dGxpbmVFbnRyeT4ge1xuXG5cdHJlYWRvbmx5IGRpc3Bvc2U6ICgpID0+IHZvaWQ7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0QElPdXRsaW5lU2VydmljZSBvdXRsaW5lU2VydmljZTogSU91dGxpbmVTZXJ2aWNlLFxuXHRcdEBJSW5zdGFudGlhdGlvblNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfaW5zdGFudGlhdGlvblNlcnZpY2U6IElJbnN0YW50aWF0aW9uU2VydmljZVxuXHQpIHtcblx0XHRjb25zdCByZWcgPSBvdXRsaW5lU2VydmljZS5yZWdpc3Rlck91dGxpbmVDcmVhdG9yKHRoaXMpO1xuXHRcdHRoaXMuZGlzcG9zZSA9ICgpID0+IHJlZy5kaXNwb3NlKCk7XG5cdH1cblxuXHRtYXRjaGVzKGNhbmRpZGF0ZTogSUVkaXRvclBhbmUpOiBjYW5kaWRhdGUgaXMgTm90ZWJvb2tFZGl0b3Ige1xuXHRcdHJldHVybiBjYW5kaWRhdGUuZ2V0SWQoKSA9PT0gTm90ZWJvb2tFZGl0b3IuSUQ7XG5cdH1cblxuXHRhc3luYyBjcmVhdGVPdXRsaW5lKGVkaXRvcjogSU5vdGVib29rRWRpdG9yUGFuZSwgdGFyZ2V0OiBPdXRsaW5lVGFyZ2V0LCBjYW5jZWxUb2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4pOiBQcm9taXNlPElPdXRsaW5lPE91dGxpbmVFbnRyeT4gfCB1bmRlZmluZWQ+IHtcblx0XHRjb25zdCBvdXRsaW5lID0gdGhpcy5faW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoTm90ZWJvb2tDZWxsT3V0bGluZSwgZWRpdG9yLCB0YXJnZXQpO1xuXHRcdGlmICh0YXJnZXQgPT09IE91dGxpbmVUYXJnZXQuUXVpY2tQaWNrKSB7XG5cdFx0XHQvLyBUaGUgcXVpY2twaWNrIGNyZWF0ZXMgdGhlIG91dGxpbmUgb24gZGVtYW5kXG5cdFx0XHQvLyBzbyB3ZSBuZWVkIHRvIGVuc3VyZSB0aGUgc3ltYm9scyBhcmUgcHJlLWNhY2hlZCBiZWZvcmUgdGhlIGVudHJpZXMgYXJlIHN5bmNyb25vdXNseSByZXF1ZXN0ZWRcblx0XHRcdGF3YWl0IG91dGxpbmUuZG9Db21wdXRlU3ltYm9scyhjYW5jZWxUb2tlbik7XG5cdFx0fVxuXHRcdHJldHVybiBvdXRsaW5lO1xuXHR9XG59XG5cbmV4cG9ydCBjb25zdCBOb3RlYm9va091dGxpbmVDb250ZXh0ID0ge1xuXHRDZWxsS2luZDogbmV3IFJhd0NvbnRleHRLZXk8Q2VsbEtpbmQ+KCdub3RlYm9va0NlbGxLaW5kJywgdW5kZWZpbmVkKSxcblx0Q2VsbEhhc0NoaWxkcmVuOiBuZXcgUmF3Q29udGV4dEtleTxib29sZWFuPignbm90ZWJvb2tDZWxsSGFzQ2hpbGRyZW4nLCBmYWxzZSksXG5cdENlbGxIYXNIZWFkZXI6IG5ldyBSYXdDb250ZXh0S2V5PGJvb2xlYW4+KCdub3RlYm9va0NlbGxIYXNIZWFkZXInLCBmYWxzZSksXG5cdENlbGxGb2xkaW5nU3RhdGU6IG5ldyBSYXdDb250ZXh0S2V5PENlbGxGb2xkaW5nU3RhdGU+KCdub3RlYm9va0NlbGxGb2xkaW5nU3RhdGUnLCBDZWxsRm9sZGluZ1N0YXRlLk5vbmUpLFxuXHRPdXRsaW5lRWxlbWVudFRhcmdldDogbmV3IFJhd0NvbnRleHRLZXk8T3V0bGluZVRhcmdldD4oJ25vdGVib29rT3V0bGluZUVsZW1lbnRUYXJnZXQnLCB1bmRlZmluZWQpLFxufTtcblxuUmVnaXN0cnkuYXM8SVdvcmtiZW5jaENvbnRyaWJ1dGlvbnNSZWdpc3RyeT4oV29ya2JlbmNoRXh0ZW5zaW9ucy5Xb3JrYmVuY2gpLnJlZ2lzdGVyV29ya2JlbmNoQ29udHJpYnV0aW9uKE5vdGVib29rT3V0bGluZUNyZWF0b3IsIExpZmVjeWNsZVBoYXNlLkV2ZW50dWFsbHkpO1xuXG5SZWdpc3RyeS5hczxJQ29uZmlndXJhdGlvblJlZ2lzdHJ5PihDb25maWd1cmF0aW9uRXh0ZW5zaW9ucy5Db25maWd1cmF0aW9uKS5yZWdpc3RlckNvbmZpZ3VyYXRpb24oe1xuXHRpZDogJ25vdGVib29rJyxcblx0b3JkZXI6IDEwMCxcblx0dHlwZTogJ29iamVjdCcsXG5cdCdwcm9wZXJ0aWVzJzoge1xuXHRcdFtOb3RlYm9va1NldHRpbmcub3V0bGluZVNob3dNYXJrZG93bkhlYWRlcnNPbmx5XToge1xuXHRcdFx0dHlwZTogJ2Jvb2xlYW4nLFxuXHRcdFx0ZGVmYXVsdDogdHJ1ZSxcblx0XHRcdG1hcmtkb3duRGVzY3JpcHRpb246IGxvY2FsaXplKCdvdXRsaW5lLnNob3dNYXJrZG93bkhlYWRlcnNPbmx5JywgXCJXaGVuIGVuYWJsZWQsIG5vdGVib29rIG91dGxpbmUgd2lsbCBzaG93IG9ubHkgbWFya2Rvd24gY2VsbHMgY29udGFpbmluZyBhIGhlYWRlci5cIilcblx0XHR9LFxuXHRcdFtOb3RlYm9va1NldHRpbmcub3V0bGluZVNob3dDb2RlQ2VsbHNdOiB7XG5cdFx0XHR0eXBlOiAnYm9vbGVhbicsXG5cdFx0XHRkZWZhdWx0OiBmYWxzZSxcblx0XHRcdG1hcmtkb3duRGVzY3JpcHRpb246IGxvY2FsaXplKCdvdXRsaW5lLnNob3dDb2RlQ2VsbHMnLCBcIldoZW4gZW5hYmxlZCwgbm90ZWJvb2sgb3V0bGluZSBzaG93cyBjb2RlIGNlbGxzLlwiKVxuXHRcdH0sXG5cdFx0W05vdGVib29rU2V0dGluZy5vdXRsaW5lU2hvd0NvZGVDZWxsU3ltYm9sc106IHtcblx0XHRcdHR5cGU6ICdib29sZWFuJyxcblx0XHRcdGRlZmF1bHQ6IHRydWUsXG5cdFx0XHRtYXJrZG93bkRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgnb3V0bGluZS5zaG93Q29kZUNlbGxTeW1ib2xzJywgXCJXaGVuIGVuYWJsZWQsIG5vdGVib29rIG91dGxpbmUgc2hvd3MgY29kZSBjZWxsIHN5bWJvbHMuIFJlbGllcyBvbiBgI25vdGVib29rLm91dGxpbmUuc2hvd0NvZGVDZWxscyNgIGJlaW5nIGVuYWJsZWQuXCIpXG5cdFx0fSxcblx0XHRbTm90ZWJvb2tTZXR0aW5nLmJyZWFkY3J1bWJzU2hvd0NvZGVDZWxsc106IHtcblx0XHRcdHR5cGU6ICdib29sZWFuJyxcblx0XHRcdGRlZmF1bHQ6IHRydWUsXG5cdFx0XHRtYXJrZG93bkRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgnYnJlYWRjcnVtYnMuc2hvd0NvZGVDZWxscycsIFwiV2hlbiBlbmFibGVkLCBub3RlYm9vayBicmVhZGNydW1icyBjb250YWluIGNvZGUgY2VsbHMuXCIpXG5cdFx0fSxcblx0XHRbTm90ZWJvb2tTZXR0aW5nLmdvdG9TeW1ib2xzQWxsU3ltYm9sc106IHtcblx0XHRcdHR5cGU6ICdib29sZWFuJyxcblx0XHRcdGRlZmF1bHQ6IHRydWUsXG5cdFx0XHRtYXJrZG93bkRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgnbm90ZWJvb2suZ290b1N5bWJvbHMuc2hvd0FsbFN5bWJvbHMnLCBcIldoZW4gZW5hYmxlZCwgdGhlIEdvIHRvIFN5bWJvbCBRdWljayBQaWNrIHdpbGwgZGlzcGxheSBmdWxsIGNvZGUgc3ltYm9scyBmcm9tIHRoZSBub3RlYm9vaywgYXMgd2VsbCBhcyBNYXJrZG93biBoZWFkZXJzLlwiKVxuXHRcdH0sXG5cdH1cbn0pO1xuXG5NZW51UmVnaXN0cnkuYXBwZW5kTWVudUl0ZW0oTWVudUlkLlZpZXdUaXRsZSwge1xuXHRzdWJtZW51OiBNZW51SWQuTm90ZWJvb2tPdXRsaW5lRmlsdGVyLFxuXHR0aXRsZTogbG9jYWxpemUoJ2ZpbHRlcicsIFwiRmlsdGVyIEVudHJpZXNcIiksXG5cdGljb246IENvZGljb24uZmlsdGVyLFxuXHRncm91cDogJ25hdmlnYXRpb24nLFxuXHRvcmRlcjogLTEsXG5cdHdoZW46IENvbnRleHRLZXlFeHByLmFuZChDb250ZXh0S2V5RXhwci5lcXVhbHMoJ3ZpZXcnLCBJT3V0bGluZVBhbmUuSWQpLCBOT1RFQk9PS19JU19BQ1RJVkVfRURJVE9SKSxcbn0pO1xuXG5yZWdpc3RlckFjdGlvbjIoY2xhc3MgVG9nZ2xlU2hvd01hcmtkb3duSGVhZGVyc09ubHkgZXh0ZW5kcyBBY3Rpb24yIHtcblx0Y29uc3RydWN0b3IoKSB7XG5cdFx0c3VwZXIoe1xuXHRcdFx0aWQ6ICdub3RlYm9vay5vdXRsaW5lLnRvZ2dsZVNob3dNYXJrZG93bkhlYWRlcnNPbmx5Jyxcblx0XHRcdHRpdGxlOiBsb2NhbGl6ZSgndG9nZ2xlU2hvd01hcmtkb3duSGVhZGVyc09ubHknLCBcIk1hcmtkb3duIEhlYWRlcnMgT25seVwiKSxcblx0XHRcdGYxOiBmYWxzZSxcblx0XHRcdHRvZ2dsZWQ6IHtcblx0XHRcdFx0Y29uZGl0aW9uOiBDb250ZXh0S2V5RXhwci5lcXVhbHMoJ2NvbmZpZy5ub3RlYm9vay5vdXRsaW5lLnNob3dNYXJrZG93bkhlYWRlcnNPbmx5JywgdHJ1ZSlcblx0XHRcdH0sXG5cdFx0XHRtZW51OiB7XG5cdFx0XHRcdGlkOiBNZW51SWQuTm90ZWJvb2tPdXRsaW5lRmlsdGVyLFxuXHRcdFx0XHRncm91cDogJzBfbWFya2Rvd25fY2VsbHMnLFxuXHRcdFx0fVxuXHRcdH0pO1xuXHR9XG5cblx0cnVuKGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yLCAuLi5hcmdzOiB1bmtub3duW10pIHtcblx0XHRjb25zdCBjb25maWd1cmF0aW9uU2VydmljZSA9IGFjY2Vzc29yLmdldChJQ29uZmlndXJhdGlvblNlcnZpY2UpO1xuXHRcdGNvbnN0IHNob3dNYXJrZG93bkhlYWRlcnNPbmx5ID0gY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0VmFsdWU8Ym9vbGVhbj4oTm90ZWJvb2tTZXR0aW5nLm91dGxpbmVTaG93TWFya2Rvd25IZWFkZXJzT25seSk7XG5cdFx0Y29uZmlndXJhdGlvblNlcnZpY2UudXBkYXRlVmFsdWUoTm90ZWJvb2tTZXR0aW5nLm91dGxpbmVTaG93TWFya2Rvd25IZWFkZXJzT25seSwgIXNob3dNYXJrZG93bkhlYWRlcnNPbmx5KTtcblx0fVxufSk7XG5cbnJlZ2lzdGVyQWN0aW9uMihjbGFzcyBUb2dnbGVDb2RlQ2VsbEVudHJpZXMgZXh0ZW5kcyBBY3Rpb24yIHtcblx0Y29uc3RydWN0b3IoKSB7XG5cdFx0c3VwZXIoe1xuXHRcdFx0aWQ6ICdub3RlYm9vay5vdXRsaW5lLnRvZ2dsZUNvZGVDZWxscycsXG5cdFx0XHR0aXRsZTogbG9jYWxpemUoJ3RvZ2dsZUNvZGVDZWxscycsIFwiQ29kZSBDZWxsc1wiKSxcblx0XHRcdGYxOiBmYWxzZSxcblx0XHRcdHRvZ2dsZWQ6IHtcblx0XHRcdFx0Y29uZGl0aW9uOiBDb250ZXh0S2V5RXhwci5lcXVhbHMoJ2NvbmZpZy5ub3RlYm9vay5vdXRsaW5lLnNob3dDb2RlQ2VsbHMnLCB0cnVlKVxuXHRcdFx0fSxcblx0XHRcdG1lbnU6IHtcblx0XHRcdFx0aWQ6IE1lbnVJZC5Ob3RlYm9va091dGxpbmVGaWx0ZXIsXG5cdFx0XHRcdG9yZGVyOiAxLFxuXHRcdFx0XHRncm91cDogJzFfY29kZV9jZWxscycsXG5cdFx0XHR9XG5cdFx0fSk7XG5cdH1cblxuXHRydW4oYWNjZXNzb3I6IFNlcnZpY2VzQWNjZXNzb3IsIC4uLmFyZ3M6IHVua25vd25bXSkge1xuXHRcdGNvbnN0IGNvbmZpZ3VyYXRpb25TZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElDb25maWd1cmF0aW9uU2VydmljZSk7XG5cdFx0Y29uc3Qgc2hvd0NvZGVDZWxscyA9IGNvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldFZhbHVlPGJvb2xlYW4+KE5vdGVib29rU2V0dGluZy5vdXRsaW5lU2hvd0NvZGVDZWxscyk7XG5cdFx0Y29uZmlndXJhdGlvblNlcnZpY2UudXBkYXRlVmFsdWUoTm90ZWJvb2tTZXR0aW5nLm91dGxpbmVTaG93Q29kZUNlbGxzLCAhc2hvd0NvZGVDZWxscyk7XG5cdH1cbn0pO1xuXG5yZWdpc3RlckFjdGlvbjIoY2xhc3MgVG9nZ2xlQ29kZUNlbGxTeW1ib2xFbnRyaWVzIGV4dGVuZHMgQWN0aW9uMiB7XG5cdGNvbnN0cnVjdG9yKCkge1xuXHRcdHN1cGVyKHtcblx0XHRcdGlkOiAnbm90ZWJvb2sub3V0bGluZS50b2dnbGVDb2RlQ2VsbFN5bWJvbHMnLFxuXHRcdFx0dGl0bGU6IGxvY2FsaXplKCd0b2dnbGVDb2RlQ2VsbFN5bWJvbHMnLCBcIkNvZGUgQ2VsbCBTeW1ib2xzXCIpLFxuXHRcdFx0ZjE6IGZhbHNlLFxuXHRcdFx0dG9nZ2xlZDoge1xuXHRcdFx0XHRjb25kaXRpb246IENvbnRleHRLZXlFeHByLmVxdWFscygnY29uZmlnLm5vdGVib29rLm91dGxpbmUuc2hvd0NvZGVDZWxsU3ltYm9scycsIHRydWUpXG5cdFx0XHR9LFxuXHRcdFx0bWVudToge1xuXHRcdFx0XHRpZDogTWVudUlkLk5vdGVib29rT3V0bGluZUZpbHRlcixcblx0XHRcdFx0b3JkZXI6IDIsXG5cdFx0XHRcdGdyb3VwOiAnMV9jb2RlX2NlbGxzJyxcblx0XHRcdH1cblx0XHR9KTtcblx0fVxuXG5cdHJ1bihhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3NvciwgLi4uYXJnczogdW5rbm93bltdKSB7XG5cdFx0Y29uc3QgY29uZmlndXJhdGlvblNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSUNvbmZpZ3VyYXRpb25TZXJ2aWNlKTtcblx0XHRjb25zdCBzaG93Q29kZUNlbGxTeW1ib2xzID0gY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0VmFsdWU8Ym9vbGVhbj4oTm90ZWJvb2tTZXR0aW5nLm91dGxpbmVTaG93Q29kZUNlbGxTeW1ib2xzKTtcblx0XHRjb25maWd1cmF0aW9uU2VydmljZS51cGRhdGVWYWx1ZShOb3RlYm9va1NldHRpbmcub3V0bGluZVNob3dDb2RlQ2VsbFN5bWJvbHMsICFzaG93Q29kZUNlbGxTeW1ib2xzKTtcblx0fVxufSk7XG4iXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7OztBQUtBLFNBQVMsZ0JBQWdCO0FBQ3pCLFlBQVksU0FBUztBQUNyQixTQUFTLGVBQWU7QUFDeEIsU0FBaUMsaUJBQWlCO0FBSWxELFNBQVMs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
