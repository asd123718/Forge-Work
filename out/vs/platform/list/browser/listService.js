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
import { isActiveElement, isKeyboardEvent } from "../../../base/browser/dom.js";
import { PagedList } from "../../../base/browser/ui/list/listPaging.js";
import { isSelectionRangeChangeEvent, isSelectionSingleChangeEvent, List, TypeNavigationMode } from "../../../base/browser/ui/list/listWidget.js";
import { Table } from "../../../base/browser/ui/table/tableWidget.js";
import { TreeFindMatchType, TreeFindMode } from "../../../base/browser/ui/tree/abstractTree.js";
import { AsyncDataTree, CompressibleAsyncDataTree } from "../../../base/browser/ui/tree/asyncDataTree.js";
import { DataTree } from "../../../base/browser/ui/tree/dataTree.js";
import { CompressibleObjectTree, ObjectTree } from "../../../base/browser/ui/tree/objectTree.js";
import { Emitter, Event } from "../../../base/common/event.js";
import { combinedDisposable, Disposable, DisposableStore, dispose, toDisposable } from "../../../base/common/lifecycle.js";
import { localize } from "../../../nls.js";
import { IConfigurationService } from "../../configuration/common/configuration.js";
import { Extensions as ConfigurationExtensions } from "../../configuration/common/configurationRegistry.js";
import { ContextKeyExpr, IContextKeyService, RawContextKey } from "../../contextkey/common/contextkey.js";
import { InputFocusedContextKey } from "../../contextkey/common/contextkeys.js";
import { IContextViewService } from "../../contextview/browser/contextView.js";
import { createDecorator, IInstantiationService } from "../../instantiation/common/instantiation.js";
import { IKeybindingService } from "../../keybinding/common/keybinding.js";
import { ResultKind } from "../../keybinding/common/keybindingResolver.js";
import { Registry } from "../../registry/common/platform.js";
import { defaultFindWidgetStyles, defaultListStyles, getListStyles } from "../../theme/browser/defaultStyles.js";
const IListService = createDecorator("listService");
class ListService {
  constructor() {
    this.disposables = new DisposableStore();
    this.lists = [];
    this._lastFocusedWidget = void 0;
  }
  get lastFocusedList() {
    return this._lastFocusedWidget;
  }
  setLastFocusedList(widget) {
    if (widget === this._lastFocusedWidget) {
      return;
    }
    this._lastFocusedWidget?.getHTMLElement().classList.remove("last-focused");
    this._lastFocusedWidget = widget;
    this._lastFocusedWidget?.getHTMLElement().classList.add("last-focused");
  }
  register(widget, extraContextKeys) {
    if (this.lists.some((l) => l.widget === widget)) {
      throw new Error("Cannot register the same widget multiple times");
    }
    const registeredList = { widget, extraContextKeys };
    this.lists.push(registeredList);
    if (isActiveElement(widget.getHTMLElement())) {
      this.setLastFocusedList(widget);
    }
    return combinedDisposable(
      widget.onDidFocus(() => this.setLastFocusedList(widget)),
      toDisposable(() => this.lists.splice(this.lists.indexOf(registeredList), 1)),
      widget.onDidDispose(() => {
        this.lists = this.lists.filter((l) => l !== registeredList);
        if (this._lastFocusedWidget === widget) {
          this.setLastFocusedList(void 0);
        }
      })
    );
  }
  dispose() {
    this.disposables.dispose();
  }
}
const RawWorkbenchListScrollAtBoundaryContextKey = new RawContextKey("listScrollAtBoundary", "none");
const WorkbenchListScrollAtTopContextKey = ContextKeyExpr.or(
  RawWorkbenchListScrollAtBoundaryContextKey.isEqualTo("top"),
  RawWorkbenchListScrollAtBoundaryContextKey.isEqualTo("both")
);
const WorkbenchListScrollAtBottomContextKey = ContextKeyExpr.or(
  RawWorkbenchListScrollAtBoundaryContextKey.isEqualTo("bottom"),
  RawWorkbenchListScrollAtBoundaryContextKey.isEqualTo("both")
);
const RawWorkbenchListFocusContextKey = new RawContextKey("listFocus", true);
const WorkbenchTreeStickyScrollFocused = new RawContextKey("treestickyScrollFocused", false);
const WorkbenchListSupportsMultiSelectContextKey = new RawContextKey("listSupportsMultiselect", true);
const WorkbenchListFocusContextKey = ContextKeyExpr.and(RawWorkbenchListFocusContextKey, ContextKeyExpr.not(InputFocusedContextKey), WorkbenchTreeStickyScrollFocused.negate());
const WorkbenchListHasSelectionOrFocus = new RawContextKey("listHasSelectionOrFocus", false);
const WorkbenchListDoubleSelection = new RawContextKey("listDoubleSelection", false);
const WorkbenchListMultiSelection = new RawContextKey("listMultiSelection", false);
const WorkbenchListSelectionNavigation = new RawContextKey("listSelectionNavigation", false);
const WorkbenchListSupportsFind = new RawContextKey("listSupportsFind", true);
const WorkbenchTreeElementCanCollapse = new RawContextKey("treeElementCanCollapse", false);
const WorkbenchTreeElementHasParent = new RawContextKey("treeElementHasParent", false);
const WorkbenchTreeElementCanExpand = new RawContextKey("treeElementCanExpand", false);
const WorkbenchTreeElementHasChild = new RawContextKey("treeElementHasChild", false);
const WorkbenchTreeFindOpen = new RawContextKey("treeFindOpen", false);
const WorkbenchListTypeNavigationModeKey = "listTypeNavigationMode";
const WorkbenchListAutomaticKeyboardNavigationLegacyKey = "listAutomaticKeyboardNavigation";
function createScopedContextKeyService(contextKeyService, widget) {
  const result = contextKeyService.createScoped(widget.getHTMLElement());
  RawWorkbenchListFocusContextKey.bindTo(result);
  return result;
}
function createScrollObserver(contextKeyService, widget) {
  const listScrollAt = RawWorkbenchListScrollAtBoundaryContextKey.bindTo(contextKeyService);
  const update = () => {
    const atTop = widget.scrollTop === 0;
    const atBottom = widget.scrollHeight - widget.renderHeight - widget.scrollTop < 1;
    if (atTop && atBottom) {
      listScrollAt.set("both");
    } else if (atTop) {
      listScrollAt.set("top");
    } else if (atBottom) {
      listScrollAt.set("bottom");
    } else {
      listScrollAt.set("none");
    }
  };
  update();
  return widget.onDidScroll(update);
}
const multiSelectModifierSettingKey = "workbench.list.multiSelectModifier";
const openModeSettingKey = "workbench.list.openMode";
const horizontalScrollingKey = "workbench.list.horizontalScrolling";
const defaultFindModeSettingKey = "workbench.list.defaultFindMode";
const typeNavigationModeSettingKey = "workbench.list.typeNavigationMode";
const keyboardNavigationSettingKey = "workbench.list.keyboardNavigation";
const scrollByPageKey = "workbench.list.scrollByPage";
const defaultFindMatchTypeSettingKey = "workbench.list.defaultFindMatchType";
const treeIndentKey = "workbench.tree.indent";
const treeRenderIndentGuidesKey = "workbench.tree.renderIndentGuides";
const listSmoothScrolling = "workbench.list.smoothScrolling";
const mouseWheelScrollSensitivityKey = "workbench.list.mouseWheelScrollSensitivity";
const fastScrollSensitivityKey = "workbench.list.fastScrollSensitivity";
const treeExpandMode = "workbench.tree.expandMode";
const treeStickyScroll = "workbench.tree.enableStickyScroll";
const treeStickyScrollMaxElements = "workbench.tree.stickyScrollMaxItemCount";
function useAltAsMultipleSelectionModifier(configurationService) {
  return configurationService.getValue(multiSelectModifierSettingKey) === "alt";
}
class MultipleSelectionController extends Disposable {
  constructor(configurationService) {
    super();
    this.configurationService = configurationService;
    this.useAltAsMultipleSelectionModifier = useAltAsMultipleSelectionModifier(configurationService);
    this.registerListeners();
  }
  registerListeners() {
    this._register(this.configurationService.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration(multiSelectModifierSettingKey)) {
        this.useAltAsMultipleSelectionModifier = useAltAsMultipleSelectionModifier(this.configurationService);
      }
    }));
  }
  isSelectionSingleChangeEvent(event) {
    if (this.useAltAsMultipleSelectionModifier) {
      return event.browserEvent.altKey;
    }
    return isSelectionSingleChangeEvent(event);
  }
  isSelectionRangeChangeEvent(event) {
    return isSelectionRangeChangeEvent(event);
  }
}
function toWorkbenchListOptions(accessor, options) {
  const configurationService = accessor.get(IConfigurationService);
  const keybindingService = accessor.get(IKeybindingService);
  const disposables = new DisposableStore();
  const result = {
    ...options,
    keyboardNavigationDelegate: { mightProducePrintableCharacter(e) {
      return keybindingService.mightProducePrintableCharacter(e);
    } },
    smoothScrolling: Boolean(configurationService.getValue(listSmoothScrolling)),
    mouseWheelScrollSensitivity: configurationService.getValue(mouseWheelScrollSensitivityKey),
    fastScrollSensitivity: configurationService.getValue(fastScrollSensitivityKey),
    multipleSelectionController: options.multipleSelectionController ?? disposables.add(new MultipleSelectionController(configurationService)),
    keyboardNavigationEventFilter: createKeyboardNavigationEventFilter(keybindingService),
    scrollByPage: Boolean(configurationService.getValue(scrollByPageKey))
  };
  return [result, disposables];
}
let WorkbenchList = class extends List {
  get onDidOpen() {
    return this.navigator.onDidOpen;
  }
  constructor(user, container, delegate, renderers, options, contextKeyService, listService, configurationService, instantiationService) {
    const horizontalScrolling = typeof options.horizontalScrolling !== "undefined" ? options.horizontalScrolling : Boolean(configurationService.getValue(horizontalScrollingKey));
    const [workbenchListOptions, workbenchListOptionsDisposable] = instantiationService.invokeFunction(toWorkbenchListOptions, options);
    super(
      user,
      container,
      delegate,
      renderers,
      {
        keyboardSupport: false,
        ...workbenchListOptions,
        horizontalScrolling
      }
    );
    this.disposables.add(workbenchListOptionsDisposable);
    this.contextKeyService = createScopedContextKeyService(contextKeyService, this);
    this.disposables.add(createScrollObserver(this.contextKeyService, this));
    this.listSupportsMultiSelect = WorkbenchListSupportsMultiSelectContextKey.bindTo(this.contextKeyService);
    this.listSupportsMultiSelect.set(options.multipleSelectionSupport !== false);
    const listSelectionNavigation = WorkbenchListSelectionNavigation.bindTo(this.contextKeyService);
    listSelectionNavigation.set(Boolean(options.selectionNavigation));
    this.listHasSelectionOrFocus = WorkbenchListHasSelectionOrFocus.bindTo(this.contextKeyService);
    this.listDoubleSelection = WorkbenchListDoubleSelection.bindTo(this.contextKeyService);
    this.listMultiSelection = WorkbenchListMultiSelection.bindTo(this.contextKeyService);
    this.horizontalScrolling = options.horizontalScrolling;
    this._useAltAsMultipleSelectionModifier = useAltAsMultipleSelectionModifier(configurationService);
    this.disposables.add(this.contextKeyService);
    this.disposables.add(listService.register(this));
    this.updateStyles(options.overrideStyles);
    this.disposables.add(this.onDidChangeSelection(() => {
      const selection = this.getSelection();
      const focus = this.getFocus();
      this.contextKeyService.bufferChangeEvents(() => {
        this.listHasSelectionOrFocus.set(selection.length > 0 || focus.length > 0);
        this.listMultiSelection.set(selection.length > 1);
        this.listDoubleSelection.set(selection.length === 2);
      });
    }));
    this.disposables.add(this.onDidChangeFocus(() => {
      const selection = this.getSelection();
      const focus = this.getFocus();
      this.listHasSelectionOrFocus.set(selection.length > 0 || focus.length > 0);
    }));
    this.disposables.add(configurationService.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration(multiSelectModifierSettingKey)) {
        this._useAltAsMultipleSelectionModifier = useAltAsMultipleSelectionModifier(configurationService);
      }
      let options2 = {};
      if (e.affectsConfiguration(horizontalScrollingKey) && this.horizontalScrolling === void 0) {
        const horizontalScrolling2 = Boolean(configurationService.getValue(horizontalScrollingKey));
        options2 = { ...options2, horizontalScrolling: horizontalScrolling2 };
      }
      if (e.affectsConfiguration(scrollByPageKey)) {
        const scrollByPage = Boolean(configurationService.getValue(scrollByPageKey));
        options2 = { ...options2, scrollByPage };
      }
      if (e.affectsConfiguration(listSmoothScrolling)) {
        const smoothScrolling = Boolean(configurationService.getValue(listSmoothScrolling));
        options2 = { ...options2, smoothScrolling };
      }
      if (e.affectsConfiguration(mouseWheelScrollSensitivityKey)) {
        const mouseWheelScrollSensitivity = configurationService.getValue(mouseWheelScrollSensitivityKey);
        options2 = { ...options2, mouseWheelScrollSensitivity };
      }
      if (e.affectsConfiguration(fastScrollSensitivityKey)) {
        const fastScrollSensitivity = configurationService.getValue(fastScrollSensitivityKey);
        options2 = { ...options2, fastScrollSensitivity };
      }
      if (Object.keys(options2).length > 0) {
        this.updateOptions(options2);
      }
    }));
    this.navigator = new ListResourceNavigator(this, { configurationService, ...options });
    this.disposables.add(this.navigator);
  }
  updateOptions(options) {
    super.updateOptions(options);
    if (options.overrideStyles !== void 0) {
      this.updateStyles(options.overrideStyles);
    }
    if (options.multipleSelectionSupport !== void 0) {
      this.listSupportsMultiSelect.set(!!options.multipleSelectionSupport);
    }
  }
  updateStyles(styles) {
    this.style(styles ? getListStyles(styles) : defaultListStyles);
  }
  get useAltAsMultipleSelectionModifier() {
    return this._useAltAsMultipleSelectionModifier;
  }
};
WorkbenchList = __decorateClass([
  __decorateParam(5, IContextKeyService),
  __decorateParam(6, IListService),
  __decorateParam(7, IConfigurationService),
  __decorateParam(8, IInstantiationService)
], WorkbenchList);
let WorkbenchPagedList = class extends PagedList {
  get onDidOpen() {
    return this.navigator.onDidOpen;
  }
  constructor(user, container, delegate, renderers, options, contextKeyService, listService, configurationService, instantiationService) {
    const horizontalScrolling = typeof options.horizontalScrolling !== "undefined" ? options.horizontalScrolling : Boolean(configurationService.getValue(horizontalScrollingKey));
    const [workbenchListOptions, workbenchListOptionsDisposable] = instantiationService.invokeFunction(toWorkbenchListOptions, options);
    super(
      user,
      container,
      delegate,
      renderers,
      {
        keyboardSupport: false,
        ...workbenchListOptions,
        horizontalScrolling
      }
    );
    this.disposables = new DisposableStore();
    this.disposables.add(workbenchListOptionsDisposable);
    this.contextKeyService = createScopedContextKeyService(contextKeyService, this);
    this.disposables.add(createScrollObserver(this.contextKeyService, this.widget));
    this.horizontalScrolling = options.horizontalScrolling;
    this.listSupportsMultiSelect = WorkbenchListSupportsMultiSelectContextKey.bindTo(this.contextKeyService);
    this.listSupportsMultiSelect.set(options.multipleSelectionSupport !== false);
    const listSelectionNavigation = WorkbenchListSelectionNavigation.bindTo(this.contextKeyService);
    listSelectionNavigation.set(Boolean(options.selectionNavigation));
    this._useAltAsMultipleSelectionModifier = useAltAsMultipleSelectionModifier(configurationService);
    this.disposables.add(this.contextKeyService);
    this.disposables.add(listService.register(this));
    this.updateStyles(options.overrideStyles);
    this.disposables.add(configurationService.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration(multiSelectModifierSettingKey)) {
        this._useAltAsMultipleSelectionModifier = useAltAsMultipleSelectionModifier(configurationService);
      }
      let options2 = {};
      if (e.affectsConfiguration(horizontalScrollingKey) && this.horizontalScrolling === void 0) {
        const horizontalScrolling2 = Boolean(configurationService.getValue(horizontalScrollingKey));
        options2 = { ...options2, horizontalScrolling: horizontalScrolling2 };
      }
      if (e.affectsConfiguration(scrollByPageKey)) {
        const scrollByPage = Boolean(configurationService.getValue(scrollByPageKey));
        options2 = { ...options2, scrollByPage };
      }
      if (e.affectsConfiguration(listSmoothScrolling)) {
        const smoothScrolling = Boolean(configurationService.getValue(listSmoothScrolling));
        options2 = { ...options2, smoothScrolling };
      }
      if (e.affectsConfiguration(mouseWheelScrollSensitivityKey)) {
        const mouseWheelScrollSensitivity = configurationService.getValue(mouseWheelScrollSensitivityKey);
        options2 = { ...options2, mouseWheelScrollSensitivity };
      }
      if (e.affectsConfiguration(fastScrollSensitivityKey)) {
        const fastScrollSensitivity = configurationService.getValue(fastScrollSensitivityKey);
        options2 = { ...options2, fastScrollSensitivity };
      }
      if (Object.keys(options2).length > 0) {
        this.updateOptions(options2);
      }
    }));
    this.navigator = new ListResourceNavigator(this, { configurationService, ...options });
    this.disposables.add(this.navigator);
  }
  updateOptions(options) {
    super.updateOptions(options);
    if (options.overrideStyles !== void 0) {
      this.updateStyles(options.overrideStyles);
    }
    if (options.multipleSelectionSupport !== void 0) {
      this.listSupportsMultiSelect.set(!!options.multipleSelectionSupport);
    }
  }
  updateStyles(styles) {
    this.style(styles ? getListStyles(styles) : defaultListStyles);
  }
  get useAltAsMultipleSelectionModifier() {
    return this._useAltAsMultipleSelectionModifier;
  }
  dispose() {
    this.disposables.dispose();
    super.dispose();
  }
};
WorkbenchPagedList = __decorateClass([
  __decorateParam(5, IContextKeyService),
  __decorateParam(6, IListService),
  __decorateParam(7, IConfigurationService),
  __decorateParam(8, IInstantiationService)
], WorkbenchPagedList);
let WorkbenchTable = class extends Table {
  get onDidOpen() {
    return this.navigator.onDidOpen;
  }
  constructor(user, container, delegate, columns, renderers, options, contextKeyService, listService, configurationService, instantiationService) {
    const horizontalScrolling = typeof options.horizontalScrolling !== "undefined" ? options.horizontalScrolling : Boolean(configurationService.getValue(horizontalScrollingKey));
    const [workbenchListOptions, workbenchListOptionsDisposable] = instantiationService.invokeFunction(toWorkbenchListOptions, options);
    super(
      user,
      container,
      delegate,
      columns,
      renderers,
      {
        keyboardSupport: false,
        ...workbenchListOptions,
        horizontalScrolling
      }
    );
    this.disposables.add(workbenchListOptionsDisposable);
    this.contextKeyService = createScopedContextKeyService(contextKeyService, this);
    this.disposables.add(createScrollObserver(this.contextKeyService, this));
    this.listSupportsMultiSelect = WorkbenchListSupportsMultiSelectContextKey.bindTo(this.contextKeyService);
    this.listSupportsMultiSelect.set(options.multipleSelectionSupport !== false);
    const listSelectionNavigation = WorkbenchListSelectionNavigation.bindTo(this.contextKeyService);
    listSelectionNavigation.set(Boolean(options.selectionNavigation));
    this.listHasSelectionOrFocus = WorkbenchListHasSelectionOrFocus.bindTo(this.contextKeyService);
    this.listDoubleSelection = WorkbenchListDoubleSelection.bindTo(this.contextKeyService);
    this.listMultiSelection = WorkbenchListMultiSelection.bindTo(this.contextKeyService);
    this.horizontalScrolling = options.horizontalScrolling;
    this._useAltAsMultipleSelectionModifier = useAltAsMultipleSelectionModifier(configurationService);
    this.disposables.add(this.contextKeyService);
    this.disposables.add(listService.register(this));
    this.updateStyles(options.overrideStyles);
    this.disposables.add(this.onDidChangeSelection(() => {
      const selection = this.getSelection();
      const focus = this.getFocus();
      this.contextKeyService.bufferChangeEvents(() => {
        this.listHasSelectionOrFocus.set(selection.length > 0 || focus.length > 0);
        this.listMultiSelection.set(selection.length > 1);
        this.listDoubleSelection.set(selection.length === 2);
      });
    }));
    this.disposables.add(this.onDidChangeFocus(() => {
      const selection = this.getSelection();
      const focus = this.getFocus();
      this.listHasSelectionOrFocus.set(selection.length > 0 || focus.length > 0);
    }));
    this.disposables.add(configurationService.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration(multiSelectModifierSettingKey)) {
        this._useAltAsMultipleSelectionModifier = useAltAsMultipleSelectionModifier(configurationService);
      }
      let options2 = {};
      if (e.affectsConfiguration(horizontalScrollingKey) && this.horizontalScrolling === void 0) {
        const horizontalScrolling2 = Boolean(configurationService.getValue(horizontalScrollingKey));
        options2 = { ...options2, horizontalScrolling: horizontalScrolling2 };
      }
      if (e.affectsConfiguration(scrollByPageKey)) {
        const scrollByPage = Boolean(configurationService.getValue(scrollByPageKey));
        options2 = { ...options2, scrollByPage };
      }
      if (e.affectsConfiguration(listSmoothScrolling)) {
        const smoothScrolling = Boolean(configurationService.getValue(listSmoothScrolling));
        options2 = { ...options2, smoothScrolling };
      }
      if (e.affectsConfiguration(mouseWheelScrollSensitivityKey)) {
        const mouseWheelScrollSensitivity = configurationService.getValue(mouseWheelScrollSensitivityKey);
        options2 = { ...options2, mouseWheelScrollSensitivity };
      }
      if (e.affectsConfiguration(fastScrollSensitivityKey)) {
        const fastScrollSensitivity = configurationService.getValue(fastScrollSensitivityKey);
        options2 = { ...options2, fastScrollSensitivity };
      }
      if (Object.keys(options2).length > 0) {
        this.updateOptions(options2);
      }
    }));
    this.navigator = new TableResourceNavigator(this, { configurationService, ...options });
    this.disposables.add(this.navigator);
  }
  updateOptions(options) {
    super.updateOptions(options);
    if (options.overrideStyles !== void 0) {
      this.updateStyles(options.overrideStyles);
    }
    if (options.multipleSelectionSupport !== void 0) {
      this.listSupportsMultiSelect.set(!!options.multipleSelectionSupport);
    }
  }
  updateStyles(styles) {
    this.style(styles ? getListStyles(styles) : defaultListStyles);
  }
  get useAltAsMultipleSelectionModifier() {
    return this._useAltAsMultipleSelectionModifier;
  }
  dispose() {
    this.disposables.dispose();
    super.dispose();
  }
};
WorkbenchTable = __decorateClass([
  __decorateParam(6, IContextKeyService),
  __decorateParam(7, IListService),
  __decorateParam(8, IConfigurationService),
  __decorateParam(9, IInstantiationService)
], WorkbenchTable);
function getSelectionKeyboardEvent(typeArg = "keydown", preserveFocus, pinned) {
  const e = new KeyboardEvent(typeArg);
  e.preserveFocus = preserveFocus;
  e.pinned = pinned;
  e.__forceEvent = true;
  return e;
}
class ResourceNavigator extends Disposable {
  constructor(widget, options) {
    super();
    this.widget = widget;
    this._onDidOpen = this._register(new Emitter());
    this.onDidOpen = this._onDidOpen.event;
    this._register(Event.filter(this.widget.onDidChangeSelection, (e) => isKeyboardEvent(e.browserEvent))((e) => this.onSelectionFromKeyboard(e)));
    this._register(this.widget.onPointer((e) => this.onPointer(e.element, e.browserEvent)));
    this._register(this.widget.onMouseDblClick((e) => this.onMouseDblClick(e.element, e.browserEvent)));
    if (typeof options?.openOnSingleClick !== "boolean" && options?.configurationService) {
      this.openOnSingleClick = options?.configurationService.getValue(openModeSettingKey) !== "doubleClick";
      this._register(options?.configurationService.onDidChangeConfiguration((e) => {
        if (e.affectsConfiguration(openModeSettingKey)) {
          this.openOnSingleClick = options?.configurationService.getValue(openModeSettingKey) !== "doubleClick";
        }
      }));
    } else {
      this.openOnSingleClick = options?.openOnSingleClick ?? true;
    }
  }
  onSelectionFromKeyboard(event) {
    if (event.elements.length !== 1) {
      return;
    }
    const selectionKeyboardEvent = event.browserEvent;
    const preserveFocus = typeof selectionKeyboardEvent.preserveFocus === "boolean" ? selectionKeyboardEvent.preserveFocus : true;
    const pinned = typeof selectionKeyboardEvent.pinned === "boolean" ? selectionKeyboardEvent.pinned : !preserveFocus;
    const sideBySide = false;
    this._open(this.getSelectedElement(), preserveFocus, pinned, sideBySide, event.browserEvent);
  }
  onPointer(element, browserEvent) {
    if (!this.openOnSingleClick) {
      return;
    }
    const isDoubleClick = browserEvent.detail === 2;
    if (isDoubleClick) {
      return;
    }
    const isMiddleClick = browserEvent.button === 1;
    const preserveFocus = true;
    const pinned = isMiddleClick;
    const sideBySide = browserEvent.ctrlKey || browserEvent.metaKey || browserEvent.altKey;
    this._open(element, preserveFocus, pinned, sideBySide, browserEvent);
  }
  onMouseDblClick(element, browserEvent) {
    if (!browserEvent) {
      return;
    }
    const target = browserEvent.target;
    const onTwistie = target.classList.contains("monaco-tl-twistie") || target.classList.contains("monaco-icon-label") && target.classList.contains("folder-icon") && browserEvent.offsetX < 16;
    if (onTwistie) {
      return;
    }
    const preserveFocus = false;
    const pinned = true;
    const sideBySide = browserEvent.ctrlKey || browserEvent.metaKey || browserEvent.altKey;
    this._open(element, preserveFocus, pinned, sideBySide, browserEvent);
  }
  _open(element, preserveFocus, pinned, sideBySide, browserEvent) {
    if (!element) {
      return;
    }
    this._onDidOpen.fire({
      editorOptions: {
        preserveFocus,
        pinned,
        revealIfVisible: true
      },
      sideBySide,
      element,
      browserEvent
    });
  }
}
class ListResourceNavigator extends ResourceNavigator {
  constructor(widget, options) {
    super(widget, options);
    this.widget = widget;
  }
  getSelectedElement() {
    return this.widget.getSelectedElements()[0];
  }
}
class TableResourceNavigator extends ResourceNavigator {
  constructor(widget, options) {
    super(widget, options);
  }
  getSelectedElement() {
    return this.widget.getSelectedElements()[0];
  }
}
class TreeResourceNavigator extends ResourceNavigator {
  constructor(widget, options) {
    super(widget, options);
  }
  getSelectedElement() {
    return this.widget.getSelection()[0] ?? void 0;
  }
}
function createKeyboardNavigationEventFilter(keybindingService) {
  let inMultiChord = false;
  return (event) => {
    if (event.toKeyCodeChord().isModifierKey()) {
      return false;
    }
    if (inMultiChord) {
      inMultiChord = false;
      return false;
    }
    const result = keybindingService.softDispatch(event, event.target);
    if (result.kind === ResultKind.MoreChordsNeeded) {
      inMultiChord = true;
      return false;
    }
    inMultiChord = false;
    return result.kind === ResultKind.NoMatchingKb;
  };
}
let WorkbenchObjectTree = class extends ObjectTree {
  get contextKeyService() {
    return this.internals.contextKeyService;
  }
  get useAltAsMultipleSelectionModifier() {
    return this.internals.useAltAsMultipleSelectionModifier;
  }
  get onDidOpen() {
    return this.internals.onDidOpen;
  }
  constructor(user, container, delegate, renderers, options, instantiationService, contextKeyService, listService, configurationService) {
    const { options: treeOptions, getTypeNavigationMode, disposable } = instantiationService.invokeFunction(workbenchTreeDataPreamble, options);
    super(user, container, delegate, renderers, treeOptions);
    this.disposables.add(disposable);
    this.internals = new WorkbenchTreeInternals(this, options, getTypeNavigationMode, options.overrideStyles, contextKeyService, listService, configurationService);
    this.disposables.add(this.internals);
  }
  updateOptions(options = {}) {
    super.updateOptions(options);
    if (options.overrideStyles) {
      this.internals.updateStyleOverrides(options.overrideStyles);
    }
    this.internals.updateOptions(options);
  }
};
WorkbenchObjectTree = __decorateClass([
  __decorateParam(5, IInstantiationService),
  __decorateParam(6, IContextKeyService),
  __decorateParam(7, IListService),
  __decorateParam(8, IConfigurationService)
], WorkbenchObjectTree);
let WorkbenchCompressibleObjectTree = class extends CompressibleObjectTree {
  get contextKeyService() {
    return this.internals.contextKeyService;
  }
  get useAltAsMultipleSelectionModifier() {
    return this.internals.useAltAsMultipleSelectionModifier;
  }
  get onDidOpen() {
    return this.internals.onDidOpen;
  }
  constructor(user, container, delegate, renderers, options, instantiationService, contextKeyService, listService, configurationService) {
    const { options: treeOptions, getTypeNavigationMode, disposable } = instantiationService.invokeFunction(workbenchTreeDataPreamble, options);
    super(user, container, delegate, renderers, treeOptions);
    this.disposables.add(disposable);
    this.internals = new WorkbenchTreeInternals(this, options, getTypeNavigationMode, options.overrideStyles, contextKeyService, listService, configurationService);
    this.disposables.add(this.internals);
  }
  updateOptions(options = {}) {
    super.updateOptions(options);
    if (options.overrideStyles) {
      this.internals.updateStyleOverrides(options.overrideStyles);
    }
    this.internals.updateOptions(options);
  }
};
WorkbenchCompressibleObjectTree = __decorateClass([
  __decorateParam(5, IInstantiationService),
  __decorateParam(6, IContextKeyService),
  __decorateParam(7, IListService),
  __decorateParam(8, IConfigurationService)
], WorkbenchCompressibleObjectTree);
let WorkbenchDataTree = class extends DataTree {
  get contextKeyService() {
    return this.internals.contextKeyService;
  }
  get useAltAsMultipleSelectionModifier() {
    return this.internals.useAltAsMultipleSelectionModifier;
  }
  get onDidOpen() {
    return this.internals.onDidOpen;
  }
  constructor(user, container, delegate, renderers, dataSource, options, instantiationService, contextKeyService, listService, configurationService) {
    const { options: treeOptions, getTypeNavigationMode, disposable } = instantiationService.invokeFunction(workbenchTreeDataPreamble, options);
    super(user, container, delegate, renderers, dataSource, treeOptions);
    this.disposables.add(disposable);
    this.internals = new WorkbenchTreeInternals(this, options, getTypeNavigationMode, options.overrideStyles, contextKeyService, listService, configurationService);
    this.disposables.add(this.internals);
  }
  updateOptions(options = {}) {
    super.updateOptions(options);
    if (options.overrideStyles !== void 0) {
      this.internals.updateStyleOverrides(options.overrideStyles);
    }
    this.internals.updateOptions(options);
  }
};
WorkbenchDataTree = __decorateClass([
  __decorateParam(6, IInstantiationService),
  __decorateParam(7, IContextKeyService),
  __decorateParam(8, IListService),
  __decorateParam(9, IConfigurationService)
], WorkbenchDataTree);
let WorkbenchAsyncDataTree = class extends AsyncDataTree {
  get contextKeyService() {
    return this.internals.contextKeyService;
  }
  get useAltAsMultipleSelectionModifier() {
    return this.internals.useAltAsMultipleSelectionModifier;
  }
  get onDidOpen() {
    return this.internals.onDidOpen;
  }
  constructor(user, container, delegate, renderers, dataSource, options, instantiationService, contextKeyService, listService, configurationService) {
    const { options: treeOptions, getTypeNavigationMode, disposable } = instantiationService.invokeFunction(workbenchTreeDataPreamble, options);
    super(user, container, delegate, renderers, dataSource, treeOptions);
    this.disposables.add(disposable);
    this.internals = new WorkbenchTreeInternals(this, options, getTypeNavigationMode, options.overrideStyles, contextKeyService, listService, configurationService);
    this.disposables.add(this.internals);
  }
  updateOptions(options = {}) {
    super.updateOptions(options);
    if (options.overrideStyles) {
      this.internals.updateStyleOverrides(options.overrideStyles);
    }
    this.internals.updateOptions(options);
  }
};
WorkbenchAsyncDataTree = __decorateClass([
  __decorateParam(6, IInstantiationService),
  __decorateParam(7, IContextKeyService),
  __decorateParam(8, IListService),
  __decorateParam(9, IConfigurationService)
], WorkbenchAsyncDataTree);
let WorkbenchCompressibleAsyncDataTree = class extends CompressibleAsyncDataTree {
  get contextKeyService() {
    return this.internals.contextKeyService;
  }
  get useAltAsMultipleSelectionModifier() {
    return this.internals.useAltAsMultipleSelectionModifier;
  }
  get onDidOpen() {
    return this.internals.onDidOpen;
  }
  constructor(user, container, virtualDelegate, compressionDelegate, renderers, dataSource, options, instantiationService, contextKeyService, listService, configurationService) {
    const { options: treeOptions, getTypeNavigationMode, disposable } = instantiationService.invokeFunction(workbenchTreeDataPreamble, options);
    super(user, container, virtualDelegate, compressionDelegate, renderers, dataSource, treeOptions);
    this.disposables.add(disposable);
    this.internals = new WorkbenchTreeInternals(this, options, getTypeNavigationMode, options.overrideStyles, contextKeyService, listService, configurationService);
    this.disposables.add(this.internals);
  }
  updateOptions(options) {
    super.updateOptions(options);
    this.internals.updateOptions(options);
  }
};
WorkbenchCompressibleAsyncDataTree = __decorateClass([
  __decorateParam(7, IInstantiationService),
  __decorateParam(8, IContextKeyService),
  __decorateParam(9, IListService),
  __decorateParam(10, IConfigurationService)
], WorkbenchCompressibleAsyncDataTree);
function getDefaultTreeFindMode(configurationService) {
  const value = configurationService.getValue(defaultFindModeSettingKey);
  if (value === "highlight") {
    return TreeFindMode.Highlight;
  } else if (value === "filter") {
    return TreeFindMode.Filter;
  }
  const deprecatedValue = configurationService.getValue(keyboardNavigationSettingKey);
  if (deprecatedValue === "simple" || deprecatedValue === "highlight") {
    return TreeFindMode.Highlight;
  } else if (deprecatedValue === "filter") {
    return TreeFindMode.Filter;
  }
  return void 0;
}
function getDefaultTreeFindMatchType(configurationService) {
  const value = configurationService.getValue(defaultFindMatchTypeSettingKey);
  if (value === "fuzzy") {
    return TreeFindMatchType.Fuzzy;
  } else if (value === "contiguous") {
    return TreeFindMatchType.Contiguous;
  }
  return void 0;
}
function workbenchTreeDataPreamble(accessor, options) {
  const configurationService = accessor.get(IConfigurationService);
  const contextViewService = accessor.get(IContextViewService);
  const contextKeyService = accessor.get(IContextKeyService);
  const instantiationService = accessor.get(IInstantiationService);
  const getTypeNavigationMode = () => {
    const modeString = contextKeyService.getContextKeyValue(WorkbenchListTypeNavigationModeKey);
    if (modeString === "automatic") {
      return TypeNavigationMode.Automatic;
    } else if (modeString === "trigger") {
      return TypeNavigationMode.Trigger;
    }
    const modeBoolean = contextKeyService.getContextKeyValue(WorkbenchListAutomaticKeyboardNavigationLegacyKey);
    if (modeBoolean === false) {
      return TypeNavigationMode.Trigger;
    }
    const configString = configurationService.getValue(typeNavigationModeSettingKey);
    if (configString === "automatic") {
      return TypeNavigationMode.Automatic;
    } else if (configString === "trigger") {
      return TypeNavigationMode.Trigger;
    }
    return void 0;
  };
  const horizontalScrolling = options.horizontalScrolling !== void 0 ? options.horizontalScrolling : Boolean(configurationService.getValue(horizontalScrollingKey));
  const [workbenchListOptions, disposable] = instantiationService.invokeFunction(toWorkbenchListOptions, options);
  const paddingBottom = options.paddingBottom;
  const renderIndentGuides = options.renderIndentGuides !== void 0 ? options.renderIndentGuides : configurationService.getValue(treeRenderIndentGuidesKey);
  return {
    getTypeNavigationMode,
    disposable,
    // eslint-disable-next-line local/code-no-dangerous-type-assertions
    options: {
      // ...options, // TODO@Joao why is this not splatted here?
      keyboardSupport: false,
      ...workbenchListOptions,
      indent: typeof configurationService.getValue(treeIndentKey) === "number" ? configurationService.getValue(treeIndentKey) : void 0,
      renderIndentGuides,
      smoothScrolling: Boolean(configurationService.getValue(listSmoothScrolling)),
      defaultFindMode: options.defaultFindMode ?? getDefaultTreeFindMode(configurationService),
      defaultFindMatchType: options.defaultFindMatchType ?? getDefaultTreeFindMatchType(configurationService),
      horizontalScrolling,
      scrollByPage: Boolean(configurationService.getValue(scrollByPageKey)),
      paddingBottom,
      hideTwistiesOfChildlessElements: options.hideTwistiesOfChildlessElements,
      expandOnlyOnTwistieClick: options.expandOnlyOnTwistieClick ?? configurationService.getValue(treeExpandMode) === "doubleClick",
      contextViewProvider: contextViewService,
      findWidgetStyles: defaultFindWidgetStyles,
      enableStickyScroll: Boolean(configurationService.getValue(treeStickyScroll)),
      stickyScrollMaxItemCount: Number(configurationService.getValue(treeStickyScrollMaxElements))
    }
  };
}
let WorkbenchTreeInternals = class {
  constructor(tree, options, getTypeNavigationMode, overrideStyles, contextKeyService, listService, configurationService) {
    this.tree = tree;
    this.disposables = [];
    this.contextKeyService = createScopedContextKeyService(contextKeyService, tree);
    this.disposables.push(createScrollObserver(this.contextKeyService, tree));
    this.listSupportsMultiSelect = WorkbenchListSupportsMultiSelectContextKey.bindTo(this.contextKeyService);
    this.listSupportsMultiSelect.set(options.multipleSelectionSupport !== false);
    const listSelectionNavigation = WorkbenchListSelectionNavigation.bindTo(this.contextKeyService);
    listSelectionNavigation.set(Boolean(options.selectionNavigation));
    this.listSupportFindWidget = WorkbenchListSupportsFind.bindTo(this.contextKeyService);
    this.listSupportFindWidget.set(options.findWidgetEnabled ?? true);
    this.hasSelectionOrFocus = WorkbenchListHasSelectionOrFocus.bindTo(this.contextKeyService);
    this.hasDoubleSelection = WorkbenchListDoubleSelection.bindTo(this.contextKeyService);
    this.hasMultiSelection = WorkbenchListMultiSelection.bindTo(this.contextKeyService);
    this.treeElementCanCollapse = WorkbenchTreeElementCanCollapse.bindTo(this.contextKeyService);
    this.treeElementHasParent = WorkbenchTreeElementHasParent.bindTo(this.contextKeyService);
    this.treeElementCanExpand = WorkbenchTreeElementCanExpand.bindTo(this.contextKeyService);
    this.treeElementHasChild = WorkbenchTreeElementHasChild.bindTo(this.contextKeyService);
    this.treeFindOpen = WorkbenchTreeFindOpen.bindTo(this.contextKeyService);
    this.treeStickyScrollFocused = WorkbenchTreeStickyScrollFocused.bindTo(this.contextKeyService);
    this._useAltAsMultipleSelectionModifier = useAltAsMultipleSelectionModifier(configurationService);
    this.updateStyleOverrides(overrideStyles);
    const updateCollapseContextKeys = () => {
      const focus = tree.getFocus()[0];
      if (!focus) {
        return;
      }
      const node = tree.getNode(focus);
      this.treeElementCanCollapse.set(node.collapsible && !node.collapsed);
      this.treeElementHasParent.set(!!tree.getParentElement(focus));
      this.treeElementCanExpand.set(node.collapsible && node.collapsed);
      this.treeElementHasChild.set(!!tree.getFirstElementChild(focus));
    };
    const interestingContextKeys = /* @__PURE__ */ new Set();
    interestingContextKeys.add(WorkbenchListTypeNavigationModeKey);
    interestingContextKeys.add(WorkbenchListAutomaticKeyboardNavigationLegacyKey);
    this.disposables.push(
      this.contextKeyService,
      listService.register(tree),
      tree.onDidChangeSelection(() => {
        const selection = tree.getSelection();
        const focus = tree.getFocus();
        this.contextKeyService.bufferChangeEvents(() => {
          this.hasSelectionOrFocus.set(selection.length > 0 || focus.length > 0);
          this.hasMultiSelection.set(selection.length > 1);
          this.hasDoubleSelection.set(selection.length === 2);
        });
      }),
      tree.onDidChangeFocus(() => {
        const selection = tree.getSelection();
        const focus = tree.getFocus();
        this.hasSelectionOrFocus.set(selection.length > 0 || focus.length > 0);
        updateCollapseContextKeys();
      }),
      tree.onDidChangeCollapseState(updateCollapseContextKeys),
      tree.onDidChangeModel(updateCollapseContextKeys),
      tree.onDidChangeFindOpenState((enabled) => this.treeFindOpen.set(enabled)),
      tree.onDidChangeStickyScrollFocused((focused) => this.treeStickyScrollFocused.set(focused)),
      configurationService.onDidChangeConfiguration((e) => {
        let newOptions = {};
        if (e.affectsConfiguration(multiSelectModifierSettingKey)) {
          this._useAltAsMultipleSelectionModifier = useAltAsMultipleSelectionModifier(configurationService);
        }
        if (e.affectsConfiguration(treeIndentKey)) {
          const indent = configurationService.getValue(treeIndentKey);
          newOptions = { ...newOptions, indent };
        }
        if (e.affectsConfiguration(treeRenderIndentGuidesKey) && options.renderIndentGuides === void 0) {
          const renderIndentGuides = configurationService.getValue(treeRenderIndentGuidesKey);
          newOptions = { ...newOptions, renderIndentGuides };
        }
        if (e.affectsConfiguration(listSmoothScrolling)) {
          const smoothScrolling = Boolean(configurationService.getValue(listSmoothScrolling));
          newOptions = { ...newOptions, smoothScrolling };
        }
        if (e.affectsConfiguration(defaultFindModeSettingKey) || e.affectsConfiguration(keyboardNavigationSettingKey)) {
          const defaultFindMode = getDefaultTreeFindMode(configurationService);
          newOptions = { ...newOptions, defaultFindMode };
        }
        if (e.affectsConfiguration(typeNavigationModeSettingKey) || e.affectsConfiguration(keyboardNavigationSettingKey)) {
          const typeNavigationMode = getTypeNavigationMode();
          newOptions = { ...newOptions, typeNavigationMode };
        }
        if (e.affectsConfiguration(defaultFindMatchTypeSettingKey)) {
          const defaultFindMatchType = getDefaultTreeFindMatchType(configurationService);
          newOptions = { ...newOptions, defaultFindMatchType };
        }
        if (e.affectsConfiguration(horizontalScrollingKey) && options.horizontalScrolling === void 0) {
          const horizontalScrolling = Boolean(configurationService.getValue(horizontalScrollingKey));
          newOptions = { ...newOptions, horizontalScrolling };
        }
        if (e.affectsConfiguration(scrollByPageKey)) {
          const scrollByPage = Boolean(configurationService.getValue(scrollByPageKey));
          newOptions = { ...newOptions, scrollByPage };
        }
        if (e.affectsConfiguration(treeExpandMode) && options.expandOnlyOnTwistieClick === void 0) {
          newOptions = { ...newOptions, expandOnlyOnTwistieClick: configurationService.getValue(treeExpandMode) === "doubleClick" };
        }
        if (e.affectsConfiguration(treeStickyScroll)) {
          const enableStickyScroll = configurationService.getValue(treeStickyScroll);
          newOptions = { ...newOptions, enableStickyScroll };
        }
        if (e.affectsConfiguration(treeStickyScrollMaxElements)) {
          const stickyScrollMaxItemCount = Math.max(1, configurationService.getValue(treeStickyScrollMaxElements));
          newOptions = { ...newOptions, stickyScrollMaxItemCount };
        }
        if (e.affectsConfiguration(mouseWheelScrollSensitivityKey)) {
          const mouseWheelScrollSensitivity = configurationService.getValue(mouseWheelScrollSensitivityKey);
          newOptions = { ...newOptions, mouseWheelScrollSensitivity };
        }
        if (e.affectsConfiguration(fastScrollSensitivityKey)) {
          const fastScrollSensitivity = configurationService.getValue(fastScrollSensitivityKey);
          newOptions = { ...newOptions, fastScrollSensitivity };
        }
        if (Object.keys(newOptions).length > 0) {
          tree.updateOptions(newOptions);
        }
      }),
      this.contextKeyService.onDidChangeContext((e) => {
        if (e.affectsSome(interestingContextKeys)) {
          tree.updateOptions({ typeNavigationMode: getTypeNavigationMode() });
        }
      })
    );
    this.navigator = new TreeResourceNavigator(tree, { configurationService, ...options });
    this.disposables.push(this.navigator);
  }
  get onDidOpen() {
    return this.navigator.onDidOpen;
  }
  get useAltAsMultipleSelectionModifier() {
    return this._useAltAsMultipleSelectionModifier;
  }
  updateOptions(options) {
    if (options.multipleSelectionSupport !== void 0) {
      this.listSupportsMultiSelect.set(!!options.multipleSelectionSupport);
    }
  }
  updateStyleOverrides(overrideStyles) {
    this.tree.style(overrideStyles ? getListStyles(overrideStyles) : defaultListStyles);
  }
  dispose() {
    this.disposables = dispose(this.disposables);
  }
};
WorkbenchTreeInternals = __decorateClass([
  __decorateParam(4, IContextKeyService),
  __decorateParam(5, IListService),
  __decorateParam(6, IConfigurationService)
], WorkbenchTreeInternals);
const configurationRegistry = Registry.as(ConfigurationExtensions.Configuration);
configurationRegistry.registerConfiguration({
  id: "workbench",
  order: 7,
  title: localize("workbenchConfigurationTitle", "Workbench"),
  type: "object",
  properties: {
    [multiSelectModifierSettingKey]: {
      type: "string",
      enum: ["ctrlCmd", "alt"],
      markdownEnumDescriptions: [
        localize("multiSelectModifier.ctrlCmd", "Maps to `Control` on Windows and Linux and to `Command` on macOS."),
        localize("multiSelectModifier.alt", "Maps to `Alt` on Windows and Linux and to `Option` on macOS.")
      ],
      default: "ctrlCmd",
      description: localize({
        key: "multiSelectModifier",
        comment: [
          "- `ctrlCmd` refers to a value the setting can take and should not be localized.",
          "- `Control` and `Command` refer to the modifier keys Ctrl or Cmd on the keyboard and can be localized."
        ]
      }, "The modifier to be used to add an item in trees and lists to a multi-selection with the mouse (for example in the explorer, open editors and scm view). The 'Open to Side' mouse gestures - if supported - will adapt such that they do not conflict with the multiselect modifier.")
    },
    [openModeSettingKey]: {
      type: "string",
      enum: ["singleClick", "doubleClick"],
      default: "singleClick",
      description: localize({
        key: "openModeModifier",
        comment: ["`singleClick` and `doubleClick` refers to a value the setting can take and should not be localized."]
      }, "Controls how to open items in trees and lists using the mouse (if supported). Note that some trees and lists might choose to ignore this setting if it is not applicable.")
    },
    [horizontalScrollingKey]: {
      type: "boolean",
      default: false,
      description: localize("horizontalScrolling setting", "Controls whether lists and trees support horizontal scrolling in the workbench. Warning: turning on this setting has a performance implication.")
    },
    [scrollByPageKey]: {
      type: "boolean",
      default: false,
      description: localize("list.scrollByPage", "Controls whether clicks in the scrollbar scroll page by page.")
    },
    [treeIndentKey]: {
      type: "number",
      default: 8,
      minimum: 4,
      maximum: 40,
      description: localize("tree indent setting", "Controls tree indentation in pixels.")
    },
    [treeRenderIndentGuidesKey]: {
      type: "string",
      enum: ["none", "onHover", "always"],
      default: "onHover",
      description: localize("render tree indent guides", "Controls whether the tree should render indent guides.")
    },
    [listSmoothScrolling]: {
      type: "boolean",
      default: false,
      description: localize("list smoothScrolling setting", "Controls whether lists and trees have smooth scrolling.")
    },
    [mouseWheelScrollSensitivityKey]: {
      type: "number",
      default: 1,
      markdownDescription: localize("Mouse Wheel Scroll Sensitivity", "A multiplier to be used on the `deltaX` and `deltaY` of mouse wheel scroll events.")
    },
    [fastScrollSensitivityKey]: {
      type: "number",
      default: 5,
      markdownDescription: localize("Fast Scroll Sensitivity", "Scrolling speed multiplier when pressing `Alt`.")
    },
    [defaultFindModeSettingKey]: {
      type: "string",
      enum: ["highlight", "filter"],
      enumDescriptions: [
        localize("defaultFindModeSettingKey.highlight", "Highlight elements when searching. Further up and down navigation will traverse only the highlighted elements."),
        localize("defaultFindModeSettingKey.filter", "Filter elements when searching.")
      ],
      default: "highlight",
      description: localize("defaultFindModeSettingKey", "Controls the default find mode for lists and trees in the workbench.")
    },
    [keyboardNavigationSettingKey]: {
      type: "string",
      enum: ["simple", "highlight", "filter"],
      enumDescriptions: [
        localize("keyboardNavigationSettingKey.simple", "Simple keyboard navigation focuses elements which match the keyboard input. Matching is done only on prefixes."),
        localize("keyboardNavigationSettingKey.highlight", "Highlight keyboard navigation highlights elements which match the keyboard input. Further up and down navigation will traverse only the highlighted elements."),
        localize("keyboardNavigationSettingKey.filter", "Filter keyboard navigation will filter out and hide all the elements which do not match the keyboard input.")
      ],
      default: "highlight",
      description: localize("keyboardNavigationSettingKey", "Controls the keyboard navigation style for lists and trees in the workbench. Can be simple, highlight and filter."),
      deprecated: true,
      deprecationMessage: localize("keyboardNavigationSettingKeyDeprecated", "Please use 'workbench.list.defaultFindMode' and	'workbench.list.typeNavigationMode' instead.")
    },
    [defaultFindMatchTypeSettingKey]: {
      type: "string",
      enum: ["fuzzy", "contiguous"],
      enumDescriptions: [
        localize("defaultFindMatchTypeSettingKey.fuzzy", "Use fuzzy matching when searching."),
        localize("defaultFindMatchTypeSettingKey.contiguous", "Use contiguous matching when searching.")
      ],
      default: "fuzzy",
      description: localize("defaultFindMatchTypeSettingKey", "Controls the type of matching used when searching lists and trees in the workbench.")
    },
    [treeExpandMode]: {
      type: "string",
      enum: ["singleClick", "doubleClick"],
      default: "singleClick",
      description: localize("expand mode", "Controls how tree folders are expanded when clicking the folder names. Note that some trees and lists might choose to ignore this setting if it is not applicable.")
    },
    [treeStickyScroll]: {
      type: "boolean",
      default: true,
      description: localize("sticky scroll", "Controls whether sticky scrolling is enabled in trees.")
    },
    [treeStickyScrollMaxElements]: {
      type: "number",
      minimum: 1,
      default: 7,
      markdownDescription: localize("sticky scroll maximum items", "Controls the number of sticky elements displayed in the tree when {0} is enabled.", "`#workbench.tree.enableStickyScroll#`")
    },
    [typeNavigationModeSettingKey]: {
      type: "string",
      enum: ["automatic", "trigger"],
      default: "automatic",
      markdownDescription: localize("typeNavigationMode2", "Controls how type navigation works in lists and trees in the workbench. When set to `trigger`, type navigation begins once the `list.triggerTypeNavigation` command is run.")
    }
  }
});
export {
  IListService,
  ListService,
  RawWorkbenchListFocusContextKey,
  RawWorkbenchListScrollAtBoundaryContextKey,
  WorkbenchAsyncDataTree,
  WorkbenchCompressibleAsyncDataTree,
  WorkbenchCompressibleObjectTree,
  WorkbenchDataTree,
  WorkbenchList,
  WorkbenchListDoubleSelection,
  WorkbenchListFocusContextKey,
  WorkbenchListHasSelectionOrFocus,
  WorkbenchListMultiSelection,
  WorkbenchListScrollAtBottomContextKey,
  WorkbenchListScrollAtTopContextKey,
  WorkbenchListSelectionNavigation,
  WorkbenchListSupportsFind,
  WorkbenchListSupportsMultiSelectContextKey,
  WorkbenchObjectTree,
  WorkbenchPagedList,
  WorkbenchTable,
  WorkbenchTreeElementCanCollapse,
  WorkbenchTreeElementCanExpand,
  WorkbenchTreeElementHasChild,
  WorkbenchTreeElementHasParent,
  WorkbenchTreeFindOpen,
  WorkbenchTreeStickyScrollFocused,
  getSelectionKeyboardEvent
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxwbGF0Zm9ybVxcbGlzdFxcYnJvd3NlclxcbGlzdFNlcnZpY2UudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgeyBpc0FjdGl2ZUVsZW1lbnQsIGlzS2V5Ym9hcmRFdmVudCB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci9kb20uanMnO1xuaW1wb3J0IHsgSUNvbnRleHRWaWV3UHJvdmlkZXIgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2Jyb3dzZXIvdWkvY29udGV4dHZpZXcvY29udGV4dHZpZXcuanMnO1xuaW1wb3J0IHsgSUxpc3RNb3VzZUV2ZW50LCBJTGlzdFJlbmRlcmVyLCBJTGlzdFRvdWNoRXZlbnQsIElMaXN0VmlydHVhbERlbGVnYXRlIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9icm93c2VyL3VpL2xpc3QvbGlzdC5qcyc7XG5pbXBvcnQgeyBJUGFnZWRMaXN0T3B0aW9ucywgSVBhZ2VkUmVuZGVyZXIsIFBhZ2VkTGlzdCB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci91aS9saXN0L2xpc3RQYWdpbmcuanMnO1xuaW1wb3J0IHsgSUtleWJvYXJkTmF2aWdhdGlvbkV2ZW50RmlsdGVyLCBJTGlzdEFjY2Vzc2liaWxpdHlQcm92aWRlciwgSUxpc3RPcHRpb25zLCBJTGlzdE9wdGlvbnNVcGRhdGUsIElMaXN0U3R5bGVzLCBJTXVsdGlwbGVTZWxlY3Rpb25Db250cm9sbGVyLCBpc1NlbGVjdGlvblJhbmdlQ2hhbmdlRXZlbnQsIGlzU2VsZWN0aW9uU2luZ2xlQ2hhbmdlRXZlbnQsIExpc3QsIFR5cGVOYXZpZ2F0aW9uTW9kZSB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci91aS9saXN0L2xpc3RXaWRnZXQuanMnO1xuaW1wb3J0IHsgSVRhYmxlQ29sdW1uLCBJVGFibGVSZW5kZXJlciwgSVRhYmxlVmlydHVhbERlbGVnYXRlIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9icm93c2VyL3VpL3RhYmxlL3RhYmxlLmpzJztcbmltcG9ydCB7IElUYWJsZU9wdGlvbnMsIElUYWJsZU9wdGlvbnNVcGRhdGUsIElUYWJsZVN0eWxlcywgVGFibGUgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2Jyb3dzZXIvdWkvdGFibGUvdGFibGVXaWRnZXQuanMnO1xuaW1wb3J0IHsgSUFic3RyYWN0VHJlZU9wdGlvbnMsIElBYnN0cmFjdFRyZWVPcHRpb25zVXBkYXRlLCBSZW5kZXJJbmRlbnRHdWlkZXMsIFRyZWVGaW5kTWF0Y2hUeXBlLCBUcmVlRmluZE1vZGUgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2Jyb3dzZXIvdWkvdHJlZS9hYnN0cmFjdFRyZWUuanMnO1xuaW1wb3J0IHsgQXN5bmNEYXRhVHJlZSwgQ29tcHJlc3NpYmxlQXN5bmNEYXRhVHJlZSwgSUFzeW5jRGF0YVRyZWVOb2RlLCBJQXN5bmNEYXRhVHJlZU9wdGlvbnMsIElBc3luY0RhdGFUcmVlT3B0aW9uc1VwZGF0ZSwgSUNvbXByZXNzaWJsZUFzeW5jRGF0YVRyZWVPcHRpb25zLCBJQ29tcHJlc3NpYmxlQXN5bmNEYXRhVHJlZU9wdGlvbnNVcGRhdGUsIElUcmVlQ29tcHJlc3Npb25EZWxlZ2F0ZSB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci91aS90cmVlL2FzeW5jRGF0YVRyZWUuanMnO1xuaW1wb3J0IHsgRGF0YVRyZWUsIElEYXRhVHJlZU9wdGlvbnMgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2Jyb3dzZXIvdWkvdHJlZS9kYXRhVHJlZS5qcyc7XG5pbXBvcnQgeyBDb21wcmVzc2libGVPYmplY3RUcmVlLCBJQ29tcHJlc3NpYmxlT2JqZWN0VHJlZU9wdGlvbnMsIElDb21wcmVzc2libGVPYmplY3RUcmVlT3B0aW9uc1VwZGF0ZSwgSUNvbXByZXNzaWJsZVRyZWVSZW5kZXJlciwgSU9iamVjdFRyZWVPcHRpb25zLCBPYmplY3RUcmVlIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9icm93c2VyL3VpL3RyZWUvb2JqZWN0VHJlZS5qcyc7XG5pbXBvcnQgeyBJQXN5bmNEYXRhU291cmNlLCBJRGF0YVNvdXJjZSwgSVRyZWVFdmVudCwgSVRyZWVSZW5kZXJlciB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci91aS90cmVlL3RyZWUuanMnO1xuaW1wb3J0IHsgRW1pdHRlciwgRXZlbnQgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9ldmVudC5qcyc7XG5pbXBvcnQgeyBjb21iaW5lZERpc3Bvc2FibGUsIERpc3Bvc2FibGUsIERpc3Bvc2FibGVTdG9yZSwgZGlzcG9zZSwgSURpc3Bvc2FibGUsIHRvRGlzcG9zYWJsZSB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBsb2NhbGl6ZSB9IGZyb20gJy4uLy4uLy4uL25scy5qcyc7XG5pbXBvcnQgeyBJQ29uZmlndXJhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi9jb25maWd1cmF0aW9uL2NvbW1vbi9jb25maWd1cmF0aW9uLmpzJztcbmltcG9ydCB7IEV4dGVuc2lvbnMgYXMgQ29uZmlndXJhdGlvbkV4dGVuc2lvbnMsIElDb25maWd1cmF0aW9uUmVnaXN0cnkgfSBmcm9tICcuLi8uLi9jb25maWd1cmF0aW9uL2NvbW1vbi9jb25maWd1cmF0aW9uUmVnaXN0cnkuanMnO1xuaW1wb3J0IHsgQ29udGV4dEtleUV4cHIsIElDb250ZXh0S2V5LCBJQ29udGV4dEtleVNlcnZpY2UsIElTY29wZWRDb250ZXh0S2V5U2VydmljZSwgUmF3Q29udGV4dEtleSB9IGZyb20gJy4uLy4uL2NvbnRleHRrZXkvY29tbW9uL2NvbnRleHRrZXkuanMnO1xuaW1wb3J0IHsgSW5wdXRGb2N1c2VkQ29udGV4dEtleSB9IGZyb20gJy4uLy4uL2NvbnRleHRrZXkvY29tbW9uL2NvbnRleHRrZXlzLmpzJztcbmltcG9ydCB7IElDb250ZXh0Vmlld1NlcnZpY2UgfSBmcm9tICcuLi8uLi9jb250ZXh0dmlldy9icm93c2VyL2NvbnRleHRWaWV3LmpzJztcbmltcG9ydCB7IElFZGl0b3JPcHRpb25zIH0gZnJvbSAnLi4vLi4vZWRpdG9yL2NvbW1vbi9lZGl0b3IuanMnO1xuaW1wb3J0IHsgY3JlYXRlRGVjb3JhdG9yLCBJSW5zdGFudGlhdGlvblNlcnZpY2UsIFNlcnZpY2VzQWNjZXNzb3IgfSBmcm9tICcuLi8uLi9pbnN0YW50aWF0aW9uL2NvbW1vbi9pbnN0YW50aWF0aW9uLmpzJztcbmltcG9ydCB7IElLZXliaW5kaW5nU2VydmljZSB9IGZyb20gJy4uLy4uL2tleWJpbmRpbmcvY29tbW9uL2tleWJpbmRpbmcuanMnO1xuaW1wb3J0IHsgUmVzdWx0S2luZCB9IGZyb20gJy4uLy4uL2tleWJpbmRpbmcvY29tbW9uL2tleWJpbmRpbmdSZXNvbHZlci5qcyc7XG5pbXBvcnQgeyBSZWdpc3RyeSB9IGZyb20gJy4uLy4uL3JlZ2lzdHJ5L2NvbW1vbi9wbGF0Zm9ybS5qcyc7XG5pbXBvcnQgeyBkZWZhdWx0RmluZFdpZGdldFN0eWxlcywgZGVmYXVsdExpc3RTdHlsZXMsIGdldExpc3RTdHlsZXMsIElTdHlsZU92ZXJyaWRlIH0gZnJvbSAnLi4vLi4vdGhlbWUvYnJvd3Nlci9kZWZhdWx0U3R5bGVzLmpzJztcblxuZXhwb3J0IHR5cGUgTGlzdFdpZGdldCA9IExpc3Q8YW55PiB8IFBhZ2VkTGlzdDxhbnk+IHwgT2JqZWN0VHJlZTxhbnksIGFueT4gfCBEYXRhVHJlZTxhbnksIGFueSwgYW55PiB8IEFzeW5jRGF0YVRyZWU8YW55LCBhbnksIGFueT4gfCBUYWJsZTxhbnk+O1xuZXhwb3J0IHR5cGUgV29ya2JlbmNoTGlzdFdpZGdldCA9IFdvcmtiZW5jaExpc3Q8YW55PiB8IFdvcmtiZW5jaFBhZ2VkTGlzdDxhbnk+IHwgV29ya2JlbmNoT2JqZWN0VHJlZTxhbnksIGFueT4gfCBXb3JrYmVuY2hDb21wcmVzc2libGVPYmplY3RUcmVlPGFueSwgYW55PiB8IFdvcmtiZW5jaERhdGFUcmVlPGFueSwgYW55LCBhbnk+IHwgV29ya2JlbmNoQXN5bmNEYXRhVHJlZTxhbnksIGFueSwgYW55PiB8IFdvcmtiZW5jaENvbXByZXNzaWJsZUFzeW5jRGF0YVRyZWU8YW55LCBhbnksIGFueT4gfCBXb3JrYmVuY2hUYWJsZTxhbnk+O1xuXG5leHBvcnQgY29uc3QgSUxpc3RTZXJ2aWNlID0gY3JlYXRlRGVjb3JhdG9yPElMaXN0U2VydmljZT4oJ2xpc3RTZXJ2aWNlJyk7XG5cbmV4cG9ydCBpbnRlcmZhY2UgSUxpc3RTZXJ2aWNlIHtcblxuXHRyZWFkb25seSBfc2VydmljZUJyYW5kOiB1bmRlZmluZWQ7XG5cblx0LyoqXG5cdCAqIFJldHVybnMgdGhlIGN1cnJlbnRseSBmb2N1c2VkIGxpc3Qgd2lkZ2V0IGlmIGFueS5cblx0ICovXG5cdHJlYWRvbmx5IGxhc3RGb2N1c2VkTGlzdDogV29ya2JlbmNoTGlzdFdpZGdldCB8IHVuZGVmaW5lZDtcbn1cblxuaW50ZXJmYWNlIElSZWdpc3RlcmVkTGlzdCB7XG5cdHdpZGdldDogV29ya2JlbmNoTGlzdFdpZGdldDtcblx0ZXh0cmFDb250ZXh0S2V5cz86IChJQ29udGV4dEtleTxib29sZWFuPilbXTtcbn1cblxuZXhwb3J0IGNsYXNzIExpc3RTZXJ2aWNlIGltcGxlbWVudHMgSUxpc3RTZXJ2aWNlIHtcblxuXHRkZWNsYXJlIHJlYWRvbmx5IF9zZXJ2aWNlQnJhbmQ6IHVuZGVmaW5lZDtcblxuXHRwcml2YXRlIHJlYWRvbmx5IGRpc3Bvc2FibGVzID0gbmV3IERpc3Bvc2FibGVTdG9yZSgpO1xuXHRwcml2YXRlIGxpc3RzOiBJUmVnaXN0ZXJlZExpc3RbXSA9IFtdO1xuXHRwcml2YXRlIF9sYXN0Rm9jdXNlZFdpZGdldDogV29ya2JlbmNoTGlzdFdpZGdldCB8IHVuZGVmaW5lZCA9IHVuZGVmaW5lZDtcblxuXHRnZXQgbGFzdEZvY3VzZWRMaXN0KCk6IFdvcmtiZW5jaExpc3RXaWRnZXQgfCB1bmRlZmluZWQge1xuXHRcdHJldHVybiB0aGlzLl9sYXN0Rm9jdXNlZFdpZGdldDtcblx0fVxuXG5cdGNvbnN0cnVjdG9yKCkgeyB9XG5cblx0cHJpdmF0ZSBzZXRMYXN0Rm9jdXNlZExpc3Qod2lkZ2V0OiBXb3JrYmVuY2hMaXN0V2lkZ2V0IHwgdW5kZWZpbmVkKTogdm9pZCB7XG5cdFx0aWYgKHdpZGdldCA9PT0gdGhpcy5fbGFzdEZvY3VzZWRXaWRnZXQpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHR0aGlzLl9sYXN0Rm9jdXNlZFdpZGdldD8uZ2V0SFRNTEVsZW1lbnQoKS5jbGFzc0xpc3QucmVtb3ZlKCdsYXN0LWZvY3VzZWQnKTtcblx0XHR0aGlzLl9sYXN0Rm9jdXNlZFdpZGdldCA9IHdpZGdldDtcblx0XHR0aGlzLl9sYXN0Rm9jdXNlZFdpZGdldD8uZ2V0SFRNTEVsZW1lbnQoKS5jbGFzc0xpc3QuYWRkKCdsYXN0LWZvY3VzZWQnKTtcblx0fVxuXG5cdHJlZ2lzdGVyKHdpZGdldDogV29ya2JlbmNoTGlzdFdpZGdldCwgZXh0cmFDb250ZXh0S2V5cz86IChJQ29udGV4dEtleTxib29sZWFuPilbXSk6IElEaXNwb3NhYmxlIHtcblx0XHRpZiAodGhpcy5saXN0cy5zb21lKGwgPT4gbC53aWRnZXQgPT09IHdpZGdldCkpIHtcblx0XHRcdHRocm93IG5ldyBFcnJvcignQ2Fubm90IHJlZ2lzdGVyIHRoZSBzYW1lIHdpZGdldCBtdWx0aXBsZSB0aW1lcycpO1xuXHRcdH1cblxuXHRcdC8vIEtlZXAgaW4gb3VyIGxpc3RzIGxpc3Rcblx0XHRjb25zdCByZWdpc3RlcmVkTGlzdDogSVJlZ2lzdGVyZWRMaXN0ID0geyB3aWRnZXQsIGV4dHJhQ29udGV4dEtleXMgfTtcblx0XHR0aGlzLmxpc3RzLnB1c2gocmVnaXN0ZXJlZExpc3QpO1xuXG5cdFx0Ly8gQ2hlY2sgZm9yIGN1cnJlbnRseSBiZWluZyBmb2N1c2VkXG5cdFx0aWYgKGlzQWN0aXZlRWxlbWVudCh3aWRnZXQuZ2V0SFRNTEVsZW1lbnQoKSkpIHtcblx0XHRcdHRoaXMuc2V0TGFzdEZvY3VzZWRMaXN0KHdpZGdldCk7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIGNvbWJpbmVkRGlzcG9zYWJsZShcblx0XHRcdHdpZGdldC5vbkRpZEZvY3VzKCgpID0+IHRoaXMuc2V0TGFzdEZvY3VzZWRMaXN0KHdpZGdldCkpLFxuXHRcdFx0dG9EaXNwb3NhYmxlKCgpID0+IHRoaXMubGlzdHMuc3BsaWNlKHRoaXMubGlzdHMuaW5kZXhPZihyZWdpc3RlcmVkTGlzdCksIDEpKSxcblx0XHRcdHdpZGdldC5vbkRpZERpc3Bvc2UoKCkgPT4ge1xuXHRcdFx0XHR0aGlzLmxpc3RzID0gdGhpcy5saXN0cy5maWx0ZXIobCA9PiBsICE9PSByZWdpc3RlcmVkTGlzdCk7XG5cdFx0XHRcdGlmICh0aGlzLl9sYXN0Rm9jdXNlZFdpZGdldCA9PT0gd2lkZ2V0KSB7XG5cdFx0XHRcdFx0dGhpcy5zZXRMYXN0Rm9jdXNlZExpc3QodW5kZWZpbmVkKTtcblx0XHRcdFx0fVxuXHRcdFx0fSlcblx0XHQpO1xuXHR9XG5cblx0ZGlzcG9zZSgpOiB2b2lkIHtcblx0XHR0aGlzLmRpc3Bvc2FibGVzLmRpc3Bvc2UoKTtcblx0fVxufVxuXG5leHBvcnQgY29uc3QgUmF3V29ya2JlbmNoTGlzdFNjcm9sbEF0Qm91bmRhcnlDb250ZXh0S2V5ID0gbmV3IFJhd0NvbnRleHRLZXk8J25vbmUnIHwgJ3RvcCcgfCAnYm90dG9tJyB8ICdib3RoJz4oJ2xpc3RTY3JvbGxBdEJvdW5kYXJ5JywgJ25vbmUnKTtcbmV4cG9ydCBjb25zdCBXb3JrYmVuY2hMaXN0U2Nyb2xsQXRUb3BDb250ZXh0S2V5ID0gQ29udGV4dEtleUV4cHIub3IoXG5cdFJhd1dvcmtiZW5jaExpc3RTY3JvbGxBdEJvdW5kYXJ5Q29udGV4dEtleS5pc0VxdWFsVG8oJ3RvcCcpLFxuXHRSYXdXb3JrYmVuY2hMaXN0U2Nyb2xsQXRCb3VuZGFyeUNvbnRleHRLZXkuaXNFcXVhbFRvKCdib3RoJykpO1xuZXhwb3J0IGNvbnN0IFdvcmtiZW5jaExpc3RTY3JvbGxBdEJvdHRvbUNvbnRleHRLZXkgPSBDb250ZXh0S2V5RXhwci5vcihcblx0UmF3V29ya2JlbmNoTGlzdFNjcm9sbEF0Qm91bmRhcnlDb250ZXh0S2V5LmlzRXF1YWxUbygnYm90dG9tJyksXG5cdFJhd1dvcmtiZW5jaExpc3RTY3JvbGxBdEJvdW5kYXJ5Q29udGV4dEtleS5pc0VxdWFsVG8oJ2JvdGgnKSk7XG5cbmV4cG9ydCBjb25zdCBSYXdXb3JrYmVuY2hMaXN0Rm9jdXNDb250ZXh0S2V5ID0gbmV3IFJhd0NvbnRleHRLZXk8Ym9vbGVhbj4oJ2xpc3RGb2N1cycsIHRydWUpO1xuZXhwb3J0IGNvbnN0IFdvcmtiZW5jaFRyZWVTdGlja3lTY3JvbGxGb2N1c2VkID0gbmV3IFJhd0NvbnRleHRLZXk8Ym9vbGVhbj4oJ3RyZWVzdGlja3lTY3JvbGxGb2N1c2VkJywgZmFsc2UpO1xuZXhwb3J0IGNvbnN0IFdvcmtiZW5jaExpc3RTdXBwb3J0c011bHRpU2VsZWN0Q29udGV4dEtleSA9IG5ldyBSYXdDb250ZXh0S2V5PGJvb2xlYW4+KCdsaXN0U3VwcG9ydHNNdWx0aXNlbGVjdCcsIHRydWUpO1xuZXhwb3J0IGNvbnN0IFdvcmtiZW5jaExpc3RGb2N1c0NvbnRleHRLZXkgPSBDb250ZXh0S2V5RXhwci5hbmQoUmF3V29ya2JlbmNoTGlzdEZvY3VzQ29udGV4dEtleSwgQ29udGV4dEtleUV4cHIubm90KElucHV0Rm9jdXNlZENvbnRleHRLZXkpLCBXb3JrYmVuY2hUcmVlU3RpY2t5U2Nyb2xsRm9jdXNlZC5uZWdhdGUoKSk7XG5leHBvcnQgY29uc3QgV29ya2JlbmNoTGlzdEhhc1NlbGVjdGlvbk9yRm9jdXMgPSBuZXcgUmF3Q29udGV4dEtleTxib29sZWFuPignbGlzdEhhc1NlbGVjdGlvbk9yRm9jdXMnLCBmYWxzZSk7XG5leHBvcnQgY29uc3QgV29ya2JlbmNoTGlzdERvdWJsZVNlbGVjdGlvbiA9IG5ldyBSYXdDb250ZXh0S2V5PGJvb2xlYW4+KCdsaXN0RG91YmxlU2VsZWN0aW9uJywgZmFsc2UpO1xuZXhwb3J0IGNvbnN0IFdvcmtiZW5jaExpc3RNdWx0aVNlbGVjdGlvbiA9IG5ldyBSYXdDb250ZXh0S2V5PGJvb2xlYW4+KCdsaXN0TXVsdGlTZWxlY3Rpb24nLCBmYWxzZSk7XG5leHBvcnQgY29uc3QgV29ya2JlbmNoTGlzdFNlbGVjdGlvbk5hdmlnYXRpb24gPSBuZXcgUmF3Q29udGV4dEtleTxib29sZWFuPignbGlzdFNlbGVjdGlvbk5hdmlnYXRpb24nLCBmYWxzZSk7XG5leHBvcnQgY29uc3QgV29ya2JlbmNoTGlzdFN1cHBvcnRzRmluZCA9IG5ldyBSYXdDb250ZXh0S2V5PGJvb2xlYW4+KCdsaXN0U3VwcG9ydHNGaW5kJywgdHJ1ZSk7XG5leHBvcnQgY29uc3QgV29ya2JlbmNoVHJlZUVsZW1lbnRDYW5Db2xsYXBzZSA9IG5ldyBSYXdDb250ZXh0S2V5PGJvb2xlYW4+KCd0cmVlRWxlbWVudENhbkNvbGxhcHNlJywgZmFsc2UpO1xuZXhwb3J0IGNvbnN0IFdvcmtiZW5jaFRyZWVFbGVtZW50SGFzUGFyZW50ID0gbmV3IFJhd0NvbnRleHRLZXk8Ym9vbGVhbj4oJ3RyZWVFbGVtZW50SGFzUGFyZW50JywgZmFsc2UpO1xuZXhwb3J0IGNvbnN0IFdvcmtiZW5jaFRyZWVFbGVtZW50Q2FuRXhwYW5kID0gbmV3IFJhd0NvbnRleHRLZXk8Ym9vbGVhbj4oJ3RyZWVFbGVtZW50Q2FuRXhwYW5kJywgZmFsc2UpO1xuZXhwb3J0IGNvbnN0IFdvcmtiZW5jaFRyZWVFbGVtZW50SGFzQ2hpbGQgPSBuZXcgUmF3Q29udGV4dEtleTxib29sZWFuPigndHJlZUVsZW1lbnRIYXNDaGlsZCcsIGZhbHNlKTtcbmV4cG9ydCBjb25zdCBXb3JrYmVuY2hUcmVlRmluZE9wZW4gPSBuZXcgUmF3Q29udGV4dEtleTxib29sZWFuPigndHJlZUZpbmRPcGVuJywgZmFsc2UpO1xuY29uc3QgV29ya2JlbmNoTGlzdFR5cGVOYXZpZ2F0aW9uTW9kZUtleSA9ICdsaXN0VHlwZU5hdmlnYXRpb25Nb2RlJztcblxuLyoqXG4gKiBAZGVwcmVjYXRlZCBpbiBmYXZvciBvZiBXb3JrYmVuY2hMaXN0VHlwZU5hdmlnYXRpb25Nb2RlS2V5XG4gKi9cbmNvbnN0IFdvcmtiZW5jaExpc3RBdXRvbWF0aWNLZXlib2FyZE5hdmlnYXRpb25MZWdhY3lLZXkgPSAnbGlzdEF1dG9tYXRpY0tleWJvYXJkTmF2aWdhdGlvbic7XG5cbmZ1bmN0aW9uIGNyZWF0ZVNjb3BlZENvbnRleHRLZXlTZXJ2aWNlKGNvbnRleHRLZXlTZXJ2aWNlOiBJQ29udGV4dEtleVNlcnZpY2UsIHdpZGdldDogTGlzdFdpZGdldCk6IElTY29wZWRDb250ZXh0S2V5U2VydmljZSB7XG5cdGNvbnN0IHJlc3VsdCA9IGNvbnRleHRLZXlTZXJ2aWNlLmNyZWF0ZVNjb3BlZCh3aWRnZXQuZ2V0SFRNTEVsZW1lbnQoKSk7XG5cdFJhd1dvcmtiZW5jaExpc3RGb2N1c0NvbnRleHRLZXkuYmluZFRvKHJlc3VsdCk7XG5cdHJldHVybiByZXN1bHQ7XG59XG5cbi8vIE5vdGU6IFdlIG11c3QgZGVjbGFyZSBJU2Nyb2xsT2JzZXJ2YXJhYmxlIGFzIHRoZSBhcml0aG1ldGljIG9mIGNvbmNyZXRlIGNsYXNzZXMsXG4vLyBpbnN0ZWFkIG9mIG9iamVjdCB0eXBlIGxpa2UgeyBvbkRpZFNjcm9sbDogRXZlbnQ8YW55PjsgLi4uIH0uIFRoZSBsYXR0ZXIgd2lsbCBub3QgbWFya1xuLy8gdGhvc2UgcHJvcGVydGllcyBhcyByZWZlcmVuY2VkIGR1cmluZyB0cmVlLXNoYWtpbmcsIGNhdXNpbmcgdGhlbSB0byBiZSBzaGFrZWQgYXdheS5cbnR5cGUgSVNjcm9sbE9ic2VydmFyYWJsZSA9IEV4Y2x1ZGU8V29ya2JlbmNoTGlzdFdpZGdldCwgV29ya2JlbmNoUGFnZWRMaXN0PGFueT4+IHwgTGlzdDxhbnk+O1xuXG5mdW5jdGlvbiBjcmVhdGVTY3JvbGxPYnNlcnZlcihjb250ZXh0S2V5U2VydmljZTogSUNvbnRleHRLZXlTZXJ2aWNlLCB3aWRnZXQ6IElTY3JvbGxPYnNlcnZhcmFibGUpOiBJRGlzcG9zYWJsZSB7XG5cdGNvbnN0IGxpc3RTY3JvbGxBdCA9IFJhd1dvcmtiZW5jaExpc3RTY3JvbGxBdEJvdW5kYXJ5Q29udGV4dEtleS5iaW5kVG8oY29udGV4dEtleVNlcnZpY2UpO1xuXHRjb25zdCB1cGRhdGUgPSAoKSA9PiB7XG5cdFx0Y29uc3QgYXRUb3AgPSB3aWRnZXQuc2Nyb2xsVG9wID09PSAwO1xuXG5cdFx0Ly8gV2UgbmVlZCBhIHRocmVzaG9sZCBgMWAgc2luY2Ugc2Nyb2xsSGVpZ2h0IGlzIHJvdW5kZWQuXG5cdFx0Ly8gaHR0cHM6Ly9kZXZlbG9wZXIubW96aWxsYS5vcmcvZW4tVVMvZG9jcy9XZWIvQVBJL0VsZW1lbnQvc2Nyb2xsSGVpZ2h0I2RldGVybWluZV9pZl9hbl9lbGVtZW50X2hhc19iZWVuX3RvdGFsbHlfc2Nyb2xsZWRcblx0XHRjb25zdCBhdEJvdHRvbSA9IHdpZGdldC5zY3JvbGxIZWlnaHQgLSB3aWRnZXQucmVuZGVySGVpZ2h0IC0gd2lkZ2V0LnNjcm9sbFRvcCA8IDE7XG5cdFx0aWYgKGF0VG9wICYmIGF0Qm90dG9tKSB7XG5cdFx0XHRsaXN0U2Nyb2xsQXQuc2V0KCdib3RoJyk7XG5cdFx0fSBlbHNlIGlmIChhdFRvcCkge1xuXHRcdFx0bGlzdFNjcm9sbEF0LnNldCgndG9wJyk7XG5cdFx0fSBlbHNlIGlmIChhdEJvdHRvbSkge1xuXHRcdFx0bGlzdFNjcm9sbEF0LnNldCgnYm90dG9tJyk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdGxpc3RTY3JvbGxBdC5zZXQoJ25vbmUnKTtcblx0XHR9XG5cdH07XG5cdHVwZGF0ZSgpO1xuXHRyZXR1cm4gd2lkZ2V0Lm9uRGlkU2Nyb2xsKHVwZGF0ZSk7XG59XG5cbmNvbnN0IG11bHRpU2VsZWN0TW9kaWZpZXJTZXR0aW5nS2V5ID0gJ3dvcmtiZW5jaC5saXN0Lm11bHRpU2VsZWN0TW9kaWZpZXInO1xuY29uc3Qgb3Blbk1vZGVTZXR0aW5nS2V5ID0gJ3dvcmtiZW5jaC5saXN0Lm9wZW5Nb2RlJztcbmNvbnN0IGhvcml6b250YWxTY3JvbGxpbmdLZXkgPSAnd29ya2JlbmNoLmxpc3QuaG9yaXpvbnRhbFNjcm9sbGluZyc7XG5jb25zdCBkZWZhdWx0RmluZE1vZGVTZXR0aW5nS2V5ID0gJ3dvcmtiZW5jaC5saXN0LmRlZmF1bHRGaW5kTW9kZSc7XG5jb25zdCB0eXBlTmF2aWdhdGlvbk1vZGVTZXR0aW5nS2V5ID0gJ3dvcmtiZW5jaC5saXN0LnR5cGVOYXZpZ2F0aW9uTW9kZSc7XG4vKiogQGRlcHJlY2F0ZWQgaW4gZmF2b3Igb2YgYHdvcmtiZW5jaC5saXN0LmRlZmF1bHRGaW5kTW9kZWAgYW5kIGB3b3JrYmVuY2gubGlzdC50eXBlTmF2aWdhdGlvbk1vZGVgICovXG5jb25zdCBrZXlib2FyZE5hdmlnYXRpb25TZXR0aW5nS2V5ID0gJ3dvcmtiZW5jaC5saXN0LmtleWJvYXJkTmF2aWdhdGlvbic7XG5jb25zdCBzY3JvbGxCeVBhZ2VLZXkgPSAnd29ya2JlbmNoLmxpc3Quc2Nyb2xsQnlQYWdlJztcbmNvbnN0IGRlZmF1bHRGaW5kTWF0Y2hUeXBlU2V0dGluZ0tleSA9ICd3b3JrYmVuY2gubGlzdC5kZWZhdWx0RmluZE1hdGNoVHlwZSc7XG5jb25zdCB0cmVlSW5kZW50S2V5ID0gJ3dvcmtiZW5jaC50cmVlLmluZGVudCc7XG5jb25zdCB0cmVlUmVuZGVySW5kZW50R3VpZGVzS2V5ID0gJ3dvcmtiZW5jaC50cmVlLnJlbmRlckluZGVudEd1aWRlcyc7XG5jb25zdCBsaXN0U21vb3RoU2Nyb2xsaW5nID0gJ3dvcmtiZW5jaC5saXN0LnNtb290aFNjcm9sbGluZyc7XG5jb25zdCBtb3VzZVdoZWVsU2Nyb2xsU2Vuc2l0aXZpdHlLZXkgPSAnd29ya2JlbmNoLmxpc3QubW91c2VXaGVlbFNjcm9sbFNlbnNpdGl2aXR5JztcbmNvbnN0IGZhc3RTY3JvbGxTZW5zaXRpdml0eUtleSA9ICd3b3JrYmVuY2gubGlzdC5mYXN0U2Nyb2xsU2Vuc2l0aXZpdHknO1xuY29uc3QgdHJlZUV4cGFuZE1vZGUgPSAnd29ya2JlbmNoLnRyZWUuZXhwYW5kTW9kZSc7XG5jb25zdCB0cmVlU3RpY2t5U2Nyb2xsID0gJ3dvcmtiZW5jaC50cmVlLmVuYWJsZVN0aWNreVNjcm9sbCc7XG5jb25zdCB0cmVlU3RpY2t5U2Nyb2xsTWF4RWxlbWVudHMgPSAnd29ya2JlbmNoLnRyZWUuc3RpY2t5U2Nyb2xsTWF4SXRlbUNvdW50JztcblxuZnVuY3Rpb24gdXNlQWx0QXNNdWx0aXBsZVNlbGVjdGlvbk1vZGlmaWVyKGNvbmZpZ3VyYXRpb25TZXJ2aWNlOiBJQ29uZmlndXJhdGlvblNlcnZpY2UpOiBib29sZWFuIHtcblx0cmV0dXJuIGNvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldFZhbHVlKG11bHRpU2VsZWN0TW9kaWZpZXJTZXR0aW5nS2V5KSA9PT0gJ2FsdCc7XG59XG5cbmNsYXNzIE11bHRpcGxlU2VsZWN0aW9uQ29udHJvbGxlcjxUPiBleHRlbmRzIERpc3Bvc2FibGUgaW1wbGVtZW50cyBJTXVsdGlwbGVTZWxlY3Rpb25Db250cm9sbGVyPFQ+IHtcblx0cHJpdmF0ZSB1c2VBbHRBc011bHRpcGxlU2VsZWN0aW9uTW9kaWZpZXI6IGJvb2xlYW47XG5cblx0Y29uc3RydWN0b3IocHJpdmF0ZSBjb25maWd1cmF0aW9uU2VydmljZTogSUNvbmZpZ3VyYXRpb25TZXJ2aWNlKSB7XG5cdFx0c3VwZXIoKTtcblxuXHRcdHRoaXMudXNlQWx0QXNNdWx0aXBsZVNlbGVjdGlvbk1vZGlmaWVyID0gdXNlQWx0QXNNdWx0aXBsZVNlbGVjdGlvbk1vZGlmaWVyKGNvbmZpZ3VyYXRpb25TZXJ2aWNlKTtcblxuXHRcdHRoaXMucmVnaXN0ZXJMaXN0ZW5lcnMoKTtcblx0fVxuXG5cdHByaXZhdGUgcmVnaXN0ZXJMaXN0ZW5lcnMoKTogdm9pZCB7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5jb25maWd1cmF0aW9uU2VydmljZS5vbkRpZENoYW5nZUNvbmZpZ3VyYXRpb24oZSA9PiB7XG5cdFx0XHRpZiAoZS5hZmZlY3RzQ29uZmlndXJhdGlvbihtdWx0aVNlbGVjdE1vZGlmaWVyU2V0dGluZ0tleSkpIHtcblx0XHRcdFx0dGhpcy51c2VBbHRBc011bHRpcGxlU2VsZWN0aW9uTW9kaWZpZXIgPSB1c2VBbHRBc011bHRpcGxlU2VsZWN0aW9uTW9kaWZpZXIodGhpcy5jb25maWd1cmF0aW9uU2VydmljZSk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXHR9XG5cblx0aXNTZWxlY3Rpb25TaW5nbGVDaGFuZ2VFdmVudChldmVudDogSUxpc3RNb3VzZUV2ZW50PFQ+IHwgSUxpc3RUb3VjaEV2ZW50PFQ+KTogYm9vbGVhbiB7XG5cdFx0aWYgKHRoaXMudXNlQWx0QXNNdWx0aXBsZVNlbGVjdGlvbk1vZGlmaWVyKSB7XG5cdFx0XHRyZXR1cm4gZXZlbnQuYnJvd3NlckV2ZW50LmFsdEtleTtcblx0XHR9XG5cblx0XHRyZXR1cm4gaXNTZWxlY3Rpb25TaW5nbGVDaGFuZ2VFdmVudChldmVudCk7XG5cdH1cblxuXHRpc1NlbGVjdGlvblJhbmdlQ2hhbmdlRXZlbnQoZXZlbnQ6IElMaXN0TW91c2VFdmVudDxUPiB8IElMaXN0VG91Y2hFdmVudDxUPik6IGJvb2xlYW4ge1xuXHRcdHJldHVybiBpc1NlbGVjdGlvblJhbmdlQ2hhbmdlRXZlbnQoZXZlbnQpO1xuXHR9XG59XG5cbmZ1bmN0aW9uIHRvV29ya2JlbmNoTGlzdE9wdGlvbnM8VD4oXG5cdGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yLFxuXHRvcHRpb25zOiBJTGlzdE9wdGlvbnM8VD4sXG4pOiBbSUxpc3RPcHRpb25zPFQ+LCBJRGlzcG9zYWJsZV0ge1xuXHRjb25zdCBjb25maWd1cmF0aW9uU2VydmljZSA9IGFjY2Vzc29yLmdldChJQ29uZmlndXJhdGlvblNlcnZpY2UpO1xuXHRjb25zdCBrZXliaW5kaW5nU2VydmljZSA9IGFjY2Vzc29yLmdldChJS2V5YmluZGluZ1NlcnZpY2UpO1xuXG5cdGNvbnN0IGRpc3Bvc2FibGVzID0gbmV3IERpc3Bvc2FibGVTdG9yZSgpO1xuXHRjb25zdCByZXN1bHQ6IElMaXN0T3B0aW9uczxUPiA9IHtcblx0XHQuLi5vcHRpb25zLFxuXHRcdGtleWJvYXJkTmF2aWdhdGlvbkRlbGVnYXRlOiB7IG1pZ2h0UHJvZHVjZVByaW50YWJsZUNoYXJhY3RlcihlKSB7IHJldHVybiBrZXliaW5kaW5nU2VydmljZS5taWdodFByb2R1Y2VQcmludGFibGVDaGFyYWN0ZXIoZSk7IH0gfSxcblx0XHRzbW9vdGhTY3JvbGxpbmc6IEJvb2xlYW4oY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0VmFsdWUobGlzdFNtb290aFNjcm9sbGluZykpLFxuXHRcdG1vdXNlV2hlZWxTY3JvbGxTZW5zaXRpdml0eTogY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0VmFsdWU8bnVtYmVyPihtb3VzZVdoZWVsU2Nyb2xsU2Vuc2l0aXZpdHlLZXkpLFxuXHRcdGZhc3RTY3JvbGxTZW5zaXRpdml0eTogY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0VmFsdWU8bnVtYmVyPihmYXN0U2Nyb2xsU2Vuc2l0aXZpdHlLZXkpLFxuXHRcdG11bHRpcGxlU2VsZWN0aW9uQ29udHJvbGxlcjogb3B0aW9ucy5tdWx0aXBsZVNlbGVjdGlvbkNvbnRyb2xsZXIgPz8gZGlzcG9zYWJsZXMuYWRkKG5ldyBNdWx0aXBsZVNlbGVjdGlvbkNvbnRyb2xsZXIoY29uZmlndXJhdGlvblNlcnZpY2UpKSxcblx0XHRrZXlib2FyZE5hdmlnYXRpb25FdmVudEZpbHRlcjogY3JlYXRlS2V5Ym9hcmROYXZpZ2F0aW9uRXZlbnRGaWx0ZXIoa2V5YmluZGluZ1NlcnZpY2UpLFxuXHRcdHNjcm9sbEJ5UGFnZTogQm9vbGVhbihjb25maWd1cmF0aW9uU2VydmljZS5nZXRWYWx1ZShzY3JvbGxCeVBhZ2VLZXkpKVxuXHR9O1xuXG5cdHJldHVybiBbcmVzdWx0LCBkaXNwb3NhYmxlc107XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgSVdvcmtiZW5jaExpc3RPcHRpb25zVXBkYXRlIGV4dGVuZHMgSUxpc3RPcHRpb25zVXBkYXRlIHtcblx0cmVhZG9ubHkgb3ZlcnJpZGVTdHlsZXM/OiBJU3R5bGVPdmVycmlkZTxJTGlzdFN0eWxlcz47XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgSVdvcmtiZW5jaExpc3RPcHRpb25zPFQ+IGV4dGVuZHMgSVdvcmtiZW5jaExpc3RPcHRpb25zVXBkYXRlLCBJUmVzb3VyY2VOYXZpZ2F0b3JPcHRpb25zLCBJTGlzdE9wdGlvbnM8VD4ge1xuXHRyZWFkb25seSBzZWxlY3Rpb25OYXZpZ2F0aW9uPzogYm9vbGVhbjtcbn1cblxuZXhwb3J0IGNsYXNzIFdvcmtiZW5jaExpc3Q8VD4gZXh0ZW5kcyBMaXN0PFQ+IHtcblxuXHRyZWFkb25seSBjb250ZXh0S2V5U2VydmljZTogSVNjb3BlZENvbnRleHRLZXlTZXJ2aWNlO1xuXHRwcml2YXRlIGxpc3RTdXBwb3J0c011bHRpU2VsZWN0OiBJQ29udGV4dEtleTxib29sZWFuPjtcblx0cHJpdmF0ZSBsaXN0SGFzU2VsZWN0aW9uT3JGb2N1czogSUNvbnRleHRLZXk8Ym9vbGVhbj47XG5cdHByaXZhdGUgbGlzdERvdWJsZVNlbGVjdGlvbjogSUNvbnRleHRLZXk8Ym9vbGVhbj47XG5cdHByaXZhdGUgbGlzdE11bHRpU2VsZWN0aW9uOiBJQ29udGV4dEtleTxib29sZWFuPjtcblx0cHJpdmF0ZSBob3Jpem9udGFsU2Nyb2xsaW5nOiBib29sZWFuIHwgdW5kZWZpbmVkO1xuXHRwcml2YXRlIF91c2VBbHRBc011bHRpcGxlU2VsZWN0aW9uTW9kaWZpZXI6IGJvb2xlYW47XG5cdHByaXZhdGUgbmF2aWdhdG9yOiBMaXN0UmVzb3VyY2VOYXZpZ2F0b3I8VD47XG5cdGdldCBvbkRpZE9wZW4oKTogRXZlbnQ8SU9wZW5FdmVudDxUIHwgdW5kZWZpbmVkPj4geyByZXR1cm4gdGhpcy5uYXZpZ2F0b3Iub25EaWRPcGVuOyB9XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0dXNlcjogc3RyaW5nLFxuXHRcdGNvbnRhaW5lcjogSFRNTEVsZW1lbnQsXG5cdFx0ZGVsZWdhdGU6IElMaXN0VmlydHVhbERlbGVnYXRlPFQ+LFxuXHRcdHJlbmRlcmVyczogSUxpc3RSZW5kZXJlcjxULCBhbnk+W10sXG5cdFx0b3B0aW9uczogSVdvcmtiZW5jaExpc3RPcHRpb25zPFQ+LFxuXHRcdEBJQ29udGV4dEtleVNlcnZpY2UgY29udGV4dEtleVNlcnZpY2U6IElDb250ZXh0S2V5U2VydmljZSxcblx0XHRASUxpc3RTZXJ2aWNlIGxpc3RTZXJ2aWNlOiBJTGlzdFNlcnZpY2UsXG5cdFx0QElDb25maWd1cmF0aW9uU2VydmljZSBjb25maWd1cmF0aW9uU2VydmljZTogSUNvbmZpZ3VyYXRpb25TZXJ2aWNlLFxuXHRcdEBJSW5zdGFudGlhdGlvblNlcnZpY2UgaW5zdGFudGlhdGlvblNlcnZpY2U6IElJbnN0YW50aWF0aW9uU2VydmljZVxuXHQpIHtcblx0XHRjb25zdCBob3Jpem9udGFsU2Nyb2xsaW5nID0gdHlwZW9mIG9wdGlvbnMuaG9yaXpvbnRhbFNjcm9sbGluZyAhPT0gJ3VuZGVmaW5lZCcgPyBvcHRpb25zLmhvcml6b250YWxTY3JvbGxpbmcgOiBCb29sZWFuKGNvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldFZhbHVlKGhvcml6b250YWxTY3JvbGxpbmdLZXkpKTtcblx0XHRjb25zdCBbd29ya2JlbmNoTGlzdE9wdGlvbnMsIHdvcmtiZW5jaExpc3RPcHRpb25zRGlzcG9zYWJsZV0gPSBpbnN0YW50aWF0aW9uU2VydmljZS5pbnZva2VGdW5jdGlvbih0b1dvcmtiZW5jaExpc3RPcHRpb25zLCBvcHRpb25zKTtcblxuXHRcdHN1cGVyKHVzZXIsIGNvbnRhaW5lciwgZGVsZWdhdGUsIHJlbmRlcmVycyxcblx0XHRcdHtcblx0XHRcdFx0a2V5Ym9hcmRTdXBwb3J0OiBmYWxzZSxcblx0XHRcdFx0Li4ud29ya2JlbmNoTGlzdE9wdGlvbnMsXG5cdFx0XHRcdGhvcml6b250YWxTY3JvbGxpbmcsXG5cdFx0XHR9XG5cdFx0KTtcblxuXHRcdHRoaXMuZGlzcG9zYWJsZXMuYWRkKHdvcmtiZW5jaExpc3RPcHRpb25zRGlzcG9zYWJsZSk7XG5cblx0XHR0aGlzLmNvbnRleHRLZXlTZXJ2aWNlID0gY3JlYXRlU2NvcGVkQ29udGV4dEtleVNlcnZpY2UoY29udGV4dEtleVNlcnZpY2UsIHRoaXMpO1xuXG5cdFx0dGhpcy5kaXNwb3NhYmxlcy5hZGQoY3JlYXRlU2Nyb2xsT2JzZXJ2ZXIodGhpcy5jb250ZXh0S2V5U2VydmljZSwgdGhpcykpO1xuXG5cdFx0dGhpcy5saXN0U3VwcG9ydHNNdWx0aVNlbGVjdCA9IFdvcmtiZW5jaExpc3RTdXBwb3J0c011bHRpU2VsZWN0Q29udGV4dEtleS5iaW5kVG8odGhpcy5jb250ZXh0S2V5U2VydmljZSk7XG5cdFx0dGhpcy5saXN0U3VwcG9ydHNNdWx0aVNlbGVjdC5zZXQob3B0aW9ucy5tdWx0aXBsZVNlbGVjdGlvblN1cHBvcnQgIT09IGZhbHNlKTtcblxuXHRcdGNvbnN0IGxpc3RTZWxlY3Rpb25OYXZpZ2F0aW9uID0gV29ya2JlbmNoTGlzdFNlbGVjdGlvbk5hdmlnYXRpb24uYmluZFRvKHRoaXMuY29udGV4dEtleVNlcnZpY2UpO1xuXHRcdGxpc3RTZWxlY3Rpb25OYXZpZ2F0aW9uLnNldChCb29sZWFuKG9wdGlvbnMuc2VsZWN0aW9uTmF2aWdhdGlvbikpO1xuXG5cdFx0dGhpcy5saXN0SGFzU2VsZWN0aW9uT3JGb2N1cyA9IFdvcmtiZW5jaExpc3RIYXNTZWxlY3Rpb25PckZvY3VzLmJpbmRUbyh0aGlzLmNvbnRleHRLZXlTZXJ2aWNlKTtcblx0XHR0aGlzLmxpc3REb3VibGVTZWxlY3Rpb24gPSBXb3JrYmVuY2hMaXN0RG91YmxlU2VsZWN0aW9uLmJpbmRUbyh0aGlzLmNvbnRleHRLZXlTZXJ2aWNlKTtcblx0XHR0aGlzLmxpc3RNdWx0aVNlbGVjdGlvbiA9IFdvcmtiZW5jaExpc3RNdWx0aVNlbGVjdGlvbi5iaW5kVG8odGhpcy5jb250ZXh0S2V5U2VydmljZSk7XG5cdFx0dGhpcy5ob3Jpem9udGFsU2Nyb2xsaW5nID0gb3B0aW9ucy5ob3Jpem9udGFsU2Nyb2xsaW5nO1xuXG5cdFx0dGhpcy5fdXNlQWx0QXNNdWx0aXBsZVNlbGVjdGlvbk1vZGlmaWVyID0gdXNlQWx0QXNNdWx0aXBsZVNlbGVjdGlvbk1vZGlmaWVyKGNvbmZpZ3VyYXRpb25TZXJ2aWNlKTtcblxuXHRcdHRoaXMuZGlzcG9zYWJsZXMuYWRkKHRoaXMuY29udGV4dEtleVNlcnZpY2UpO1xuXHRcdHRoaXMuZGlzcG9zYWJsZXMuYWRkKChsaXN0U2VydmljZSBhcyBMaXN0U2VydmljZSkucmVnaXN0ZXIodGhpcykpO1xuXG5cdFx0dGhpcy51cGRhdGVTdHlsZXMob3B0aW9ucy5vdmVycmlkZVN0eWxlcyk7XG5cblx0XHR0aGlzLmRpc3Bvc2FibGVzLmFkZCh0aGlzLm9uRGlkQ2hhbmdlU2VsZWN0aW9uKCgpID0+IHtcblx0XHRcdGNvbnN0IHNlbGVjdGlvbiA9IHRoaXMuZ2V0U2VsZWN0aW9uKCk7XG5cdFx0XHRjb25zdCBmb2N1cyA9IHRoaXMuZ2V0Rm9jdXMoKTtcblxuXHRcdFx0dGhpcy5jb250ZXh0S2V5U2VydmljZS5idWZmZXJDaGFuZ2VFdmVudHMoKCkgPT4ge1xuXHRcdFx0XHR0aGlzLmxpc3RIYXNTZWxlY3Rpb25PckZvY3VzLnNldChzZWxlY3Rpb24ubGVuZ3RoID4gMCB8fCBmb2N1cy5sZW5ndGggPiAwKTtcblx0XHRcdFx0dGhpcy5saXN0TXVsdGlTZWxlY3Rpb24uc2V0KHNlbGVjdGlvbi5sZW5ndGggPiAxKTtcblx0XHRcdFx0dGhpcy5saXN0RG91YmxlU2VsZWN0aW9uLnNldChzZWxlY3Rpb24ubGVuZ3RoID09PSAyKTtcblx0XHRcdH0pO1xuXHRcdH0pKTtcblx0XHR0aGlzLmRpc3Bvc2FibGVzLmFkZCh0aGlzLm9uRGlkQ2hhbmdlRm9jdXMoKCkgPT4ge1xuXHRcdFx0Y29uc3Qgc2VsZWN0aW9uID0gdGhpcy5nZXRTZWxlY3Rpb24oKTtcblx0XHRcdGNvbnN0IGZvY3VzID0gdGhpcy5nZXRGb2N1cygpO1xuXG5cdFx0XHR0aGlzLmxpc3RIYXNTZWxlY3Rpb25PckZvY3VzLnNldChzZWxlY3Rpb24ubGVuZ3RoID4gMCB8fCBmb2N1cy5sZW5ndGggPiAwKTtcblx0XHR9KSk7XG5cdFx0dGhpcy5kaXNwb3NhYmxlcy5hZGQoY29uZmlndXJhdGlvblNlcnZpY2Uub25EaWRDaGFuZ2VDb25maWd1cmF0aW9uKGUgPT4ge1xuXHRcdFx0aWYgKGUuYWZmZWN0c0NvbmZpZ3VyYXRpb24obXVsdGlTZWxlY3RNb2RpZmllclNldHRpbmdLZXkpKSB7XG5cdFx0XHRcdHRoaXMuX3VzZUFsdEFzTXVsdGlwbGVTZWxlY3Rpb25Nb2RpZmllciA9IHVzZUFsdEFzTXVsdGlwbGVTZWxlY3Rpb25Nb2RpZmllcihjb25maWd1cmF0aW9uU2VydmljZSk7XG5cdFx0XHR9XG5cblx0XHRcdGxldCBvcHRpb25zOiBJTGlzdE9wdGlvbnNVcGRhdGUgPSB7fTtcblxuXHRcdFx0aWYgKGUuYWZmZWN0c0NvbmZpZ3VyYXRpb24oaG9yaXpvbnRhbFNjcm9sbGluZ0tleSkgJiYgdGhpcy5ob3Jpem9udGFsU2Nyb2xsaW5nID09PSB1bmRlZmluZWQpIHtcblx0XHRcdFx0Y29uc3QgaG9yaXpvbnRhbFNjcm9sbGluZyA9IEJvb2xlYW4oY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0VmFsdWUoaG9yaXpvbnRhbFNjcm9sbGluZ0tleSkpO1xuXHRcdFx0XHRvcHRpb25zID0geyAuLi5vcHRpb25zLCBob3Jpem9udGFsU2Nyb2xsaW5nIH07XG5cdFx0XHR9XG5cdFx0XHRpZiAoZS5hZmZlY3RzQ29uZmlndXJhdGlvbihzY3JvbGxCeVBhZ2VLZXkpKSB7XG5cdFx0XHRcdGNvbnN0IHNjcm9sbEJ5UGFnZSA9IEJvb2xlYW4oY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0VmFsdWUoc2Nyb2xsQnlQYWdlS2V5KSk7XG5cdFx0XHRcdG9wdGlvbnMgPSB7IC4uLm9wdGlvbnMsIHNjcm9sbEJ5UGFnZSB9O1xuXHRcdFx0fVxuXHRcdFx0aWYgKGUuYWZmZWN0c0NvbmZpZ3VyYXRpb24obGlzdFNtb290aFNjcm9sbGluZykpIHtcblx0XHRcdFx0Y29uc3Qgc21vb3RoU2Nyb2xsaW5nID0gQm9vbGVhbihjb25maWd1cmF0aW9uU2VydmljZS5nZXRWYWx1ZShsaXN0U21vb3RoU2Nyb2xsaW5nKSk7XG5cdFx0XHRcdG9wdGlvbnMgPSB7IC4uLm9wdGlvbnMsIHNtb290aFNjcm9sbGluZyB9O1xuXHRcdFx0fVxuXHRcdFx0aWYgKGUuYWZmZWN0c0NvbmZpZ3VyYXRpb24obW91c2VXaGVlbFNjcm9sbFNlbnNpdGl2aXR5S2V5KSkge1xuXHRcdFx0XHRjb25zdCBtb3VzZVdoZWVsU2Nyb2xsU2Vuc2l0aXZpdHkgPSBjb25maWd1cmF0aW9uU2VydmljZS5nZXRWYWx1ZTxudW1iZXI+KG1vdXNlV2hlZWxTY3JvbGxTZW5zaXRpdml0eUtleSk7XG5cdFx0XHRcdG9wdGlvbnMgPSB7IC4uLm9wdGlvbnMsIG1vdXNlV2hlZWxTY3JvbGxTZW5zaXRpdml0eSB9O1xuXHRcdFx0fVxuXHRcdFx0aWYgKGUuYWZmZWN0c0NvbmZpZ3VyYXRpb24oZmFzdFNjcm9sbFNlbnNpdGl2aXR5S2V5KSkge1xuXHRcdFx0XHRjb25zdCBmYXN0U2Nyb2xsU2Vuc2l0aXZpdHkgPSBjb25maWd1cmF0aW9uU2VydmljZS5nZXRWYWx1ZTxudW1iZXI+KGZhc3RTY3JvbGxTZW5zaXRpdml0eUtleSk7XG5cdFx0XHRcdG9wdGlvbnMgPSB7IC4uLm9wdGlvbnMsIGZhc3RTY3JvbGxTZW5zaXRpdml0eSB9O1xuXHRcdFx0fVxuXHRcdFx0aWYgKE9iamVjdC5rZXlzKG9wdGlvbnMpLmxlbmd0aCA+IDApIHtcblx0XHRcdFx0dGhpcy51cGRhdGVPcHRpb25zKG9wdGlvbnMpO1xuXHRcdFx0fVxuXHRcdH0pKTtcblxuXHRcdHRoaXMubmF2aWdhdG9yID0gbmV3IExpc3RSZXNvdXJjZU5hdmlnYXRvcih0aGlzLCB7IGNvbmZpZ3VyYXRpb25TZXJ2aWNlLCAuLi5vcHRpb25zIH0pO1xuXHRcdHRoaXMuZGlzcG9zYWJsZXMuYWRkKHRoaXMubmF2aWdhdG9yKTtcblx0fVxuXG5cdG92ZXJyaWRlIHVwZGF0ZU9wdGlvbnMob3B0aW9uczogSVdvcmtiZW5jaExpc3RPcHRpb25zVXBkYXRlKTogdm9pZCB7XG5cdFx0c3VwZXIudXBkYXRlT3B0aW9ucyhvcHRpb25zKTtcblxuXHRcdGlmIChvcHRpb25zLm92ZXJyaWRlU3R5bGVzICE9PSB1bmRlZmluZWQpIHtcblx0XHRcdHRoaXMudXBkYXRlU3R5bGVzKG9wdGlvbnMub3ZlcnJpZGVTdHlsZXMpO1xuXHRcdH1cblxuXHRcdGlmIChvcHRpb25zLm11bHRpcGxlU2VsZWN0aW9uU3VwcG9ydCAhPT0gdW5kZWZpbmVkKSB7XG5cdFx0XHR0aGlzLmxpc3RTdXBwb3J0c011bHRpU2VsZWN0LnNldCghIW9wdGlvbnMubXVsdGlwbGVTZWxlY3Rpb25TdXBwb3J0KTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIHVwZGF0ZVN0eWxlcyhzdHlsZXM6IElTdHlsZU92ZXJyaWRlPElMaXN0U3R5bGVzPiB8IHVuZGVmaW5lZCk6IHZvaWQge1xuXHRcdHRoaXMuc3R5bGUoc3R5bGVzID8gZ2V0TGlzdFN0eWxlcyhzdHlsZXMpIDogZGVmYXVsdExpc3RTdHlsZXMpO1xuXHR9XG5cblx0Z2V0IHVzZUFsdEFzTXVsdGlwbGVTZWxlY3Rpb25Nb2RpZmllcigpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gdGhpcy5fdXNlQWx0QXNNdWx0aXBsZVNlbGVjdGlvbk1vZGlmaWVyO1xuXHR9XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgSVdvcmtiZW5jaFBhZ2VkTGlzdE9wdGlvbnM8VD4gZXh0ZW5kcyBJV29ya2JlbmNoTGlzdE9wdGlvbnNVcGRhdGUsIElSZXNvdXJjZU5hdmlnYXRvck9wdGlvbnMsIElQYWdlZExpc3RPcHRpb25zPFQ+IHtcblx0cmVhZG9ubHkgc2VsZWN0aW9uTmF2aWdhdGlvbj86IGJvb2xlYW47XG59XG5cbmV4cG9ydCBjbGFzcyBXb3JrYmVuY2hQYWdlZExpc3Q8VD4gZXh0ZW5kcyBQYWdlZExpc3Q8VD4ge1xuXG5cdHJlYWRvbmx5IGNvbnRleHRLZXlTZXJ2aWNlOiBJU2NvcGVkQ29udGV4dEtleVNlcnZpY2U7XG5cdHByaXZhdGUgcmVhZG9ubHkgZGlzcG9zYWJsZXM6IERpc3Bvc2FibGVTdG9yZTtcblx0cHJpdmF0ZSBsaXN0U3VwcG9ydHNNdWx0aVNlbGVjdDogSUNvbnRleHRLZXk8Ym9vbGVhbj47XG5cdHByaXZhdGUgX3VzZUFsdEFzTXVsdGlwbGVTZWxlY3Rpb25Nb2RpZmllcjogYm9vbGVhbjtcblx0cHJpdmF0ZSBob3Jpem9udGFsU2Nyb2xsaW5nOiBib29sZWFuIHwgdW5kZWZpbmVkO1xuXHRwcml2YXRlIG5hdmlnYXRvcjogTGlzdFJlc291cmNlTmF2aWdhdG9yPFQ+O1xuXHRnZXQgb25EaWRPcGVuKCk6IEV2ZW50PElPcGVuRXZlbnQ8VCB8IHVuZGVmaW5lZD4+IHsgcmV0dXJuIHRoaXMubmF2aWdhdG9yLm9uRGlkT3BlbjsgfVxuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdHVzZXI6IHN0cmluZyxcblx0XHRjb250YWluZXI6IEhUTUxFbGVtZW50LFxuXHRcdGRlbGVnYXRlOiBJTGlzdFZpcnR1YWxEZWxlZ2F0ZTxudW1iZXI+LFxuXHRcdHJlbmRlcmVyczogSVBhZ2VkUmVuZGVyZXI8VCwgYW55PltdLFxuXHRcdG9wdGlvbnM6IElXb3JrYmVuY2hQYWdlZExpc3RPcHRpb25zPFQ+LFxuXHRcdEBJQ29udGV4dEtleVNlcnZpY2UgY29udGV4dEtleVNlcnZpY2U6IElDb250ZXh0S2V5U2VydmljZSxcblx0XHRASUxpc3RTZXJ2aWNlIGxpc3RTZXJ2aWNlOiBJTGlzdFNlcnZpY2UsXG5cdFx0QElDb25maWd1cmF0aW9uU2VydmljZSBjb25maWd1cmF0aW9uU2VydmljZTogSUNvbmZpZ3VyYXRpb25TZXJ2aWNlLFxuXHRcdEBJSW5zdGFudGlhdGlvblNlcnZpY2UgaW5zdGFudGlhdGlvblNlcnZpY2U6IElJbnN0YW50aWF0aW9uU2VydmljZVxuXHQpIHtcblx0XHRjb25zdCBob3Jpem9udGFsU2Nyb2xsaW5nID0gdHlwZW9mIG9wdGlvbnMuaG9yaXpvbnRhbFNjcm9sbGluZyAhPT0gJ3VuZGVmaW5lZCcgPyBvcHRpb25zLmhvcml6b250YWxTY3JvbGxpbmcgOiBCb29sZWFuKGNvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldFZhbHVlKGhvcml6b250YWxTY3JvbGxpbmdLZXkpKTtcblx0XHRjb25zdCBbd29ya2JlbmNoTGlzdE9wdGlvbnMsIHdvcmtiZW5jaExpc3RPcHRpb25zRGlzcG9zYWJsZV0gPSBpbnN0YW50aWF0aW9uU2VydmljZS5pbnZva2VGdW5jdGlvbih0b1dvcmtiZW5jaExpc3RPcHRpb25zLCBvcHRpb25zKTtcblx0XHRzdXBlcih1c2VyLCBjb250YWluZXIsIGRlbGVnYXRlLCByZW5kZXJlcnMsXG5cdFx0XHR7XG5cdFx0XHRcdGtleWJvYXJkU3VwcG9ydDogZmFsc2UsXG5cdFx0XHRcdC4uLndvcmtiZW5jaExpc3RPcHRpb25zLFxuXHRcdFx0XHRob3Jpem9udGFsU2Nyb2xsaW5nLFxuXHRcdFx0fVxuXHRcdCk7XG5cblx0XHR0aGlzLmRpc3Bvc2FibGVzID0gbmV3IERpc3Bvc2FibGVTdG9yZSgpO1xuXHRcdHRoaXMuZGlzcG9zYWJsZXMuYWRkKHdvcmtiZW5jaExpc3RPcHRpb25zRGlzcG9zYWJsZSk7XG5cblx0XHR0aGlzLmNvbnRleHRLZXlTZXJ2aWNlID0gY3JlYXRlU2NvcGVkQ29udGV4dEtleVNlcnZpY2UoY29udGV4dEtleVNlcnZpY2UsIHRoaXMpO1xuXG5cdFx0dGhpcy5kaXNwb3NhYmxlcy5hZGQoY3JlYXRlU2Nyb2xsT2JzZXJ2ZXIodGhpcy5jb250ZXh0S2V5U2VydmljZSwgdGhpcy53aWRnZXQpKTtcblxuXHRcdHRoaXMuaG9yaXpvbnRhbFNjcm9sbGluZyA9IG9wdGlvbnMuaG9yaXpvbnRhbFNjcm9sbGluZztcblxuXHRcdHRoaXMubGlzdFN1cHBvcnRzTXVsdGlTZWxlY3QgPSBXb3JrYmVuY2hMaXN0U3VwcG9ydHNNdWx0aVNlbGVjdENvbnRleHRLZXkuYmluZFRvKHRoaXMuY29udGV4dEtleVNlcnZpY2UpO1xuXHRcdHRoaXMubGlzdFN1cHBvcnRzTXVsdGlTZWxlY3Quc2V0KG9wdGlvbnMubXVsdGlwbGVTZWxlY3Rpb25TdXBwb3J0ICE9PSBmYWxzZSk7XG5cblx0XHRjb25zdCBsaXN0U2VsZWN0aW9uTmF2aWdhdGlvbiA9IFdvcmtiZW5jaExpc3RTZWxlY3Rpb25OYXZpZ2F0aW9uLmJpbmRUbyh0aGlzLmNvbnRleHRLZXlTZXJ2aWNlKTtcblx0XHRsaXN0U2VsZWN0aW9uTmF2aWdhdGlvbi5zZXQoQm9vbGVhbihvcHRpb25zLnNlbGVjdGlvbk5hdmlnYXRpb24pKTtcblxuXHRcdHRoaXMuX3VzZUFsdEFzTXVsdGlwbGVTZWxlY3Rpb25Nb2RpZmllciA9IHVzZUFsdEFzTXVsdGlwbGVTZWxlY3Rpb25Nb2RpZmllcihjb25maWd1cmF0aW9uU2VydmljZSk7XG5cblx0XHR0aGlzLmRpc3Bvc2FibGVzLmFkZCh0aGlzLmNvbnRleHRLZXlTZXJ2aWNlKTtcblx0XHR0aGlzLmRpc3Bvc2FibGVzLmFkZCgobGlzdFNlcnZpY2UgYXMgTGlzdFNlcnZpY2UpLnJlZ2lzdGVyKHRoaXMpKTtcblxuXHRcdHRoaXMudXBkYXRlU3R5bGVzKG9wdGlvbnMub3ZlcnJpZGVTdHlsZXMpO1xuXG5cdFx0dGhpcy5kaXNwb3NhYmxlcy5hZGQoY29uZmlndXJhdGlvblNlcnZpY2Uub25EaWRDaGFuZ2VDb25maWd1cmF0aW9uKGUgPT4ge1xuXHRcdFx0aWYgKGUuYWZmZWN0c0NvbmZpZ3VyYXRpb24obXVsdGlTZWxlY3RNb2RpZmllclNldHRpbmdLZXkpKSB7XG5cdFx0XHRcdHRoaXMuX3VzZUFsdEFzTXVsdGlwbGVTZWxlY3Rpb25Nb2RpZmllciA9IHVzZUFsdEFzTXVsdGlwbGVTZWxlY3Rpb25Nb2RpZmllcihjb25maWd1cmF0aW9uU2VydmljZSk7XG5cdFx0XHR9XG5cblx0XHRcdGxldCBvcHRpb25zOiBJTGlzdE9wdGlvbnNVcGRhdGUgPSB7fTtcblxuXHRcdFx0aWYgKGUuYWZmZWN0c0NvbmZpZ3VyYXRpb24oaG9yaXpvbnRhbFNjcm9sbGluZ0tleSkgJiYgdGhpcy5ob3Jpem9udGFsU2Nyb2xsaW5nID09PSB1bmRlZmluZWQpIHtcblx0XHRcdFx0Y29uc3QgaG9yaXpvbnRhbFNjcm9sbGluZyA9IEJvb2xlYW4oY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0VmFsdWUoaG9yaXpvbnRhbFNjcm9sbGluZ0tleSkpO1xuXHRcdFx0XHRvcHRpb25zID0geyAuLi5vcHRpb25zLCBob3Jpem9udGFsU2Nyb2xsaW5nIH07XG5cdFx0XHR9XG5cdFx0XHRpZiAoZS5hZmZlY3RzQ29uZmlndXJhdGlvbihzY3JvbGxCeVBhZ2VLZXkpKSB7XG5cdFx0XHRcdGNvbnN0IHNjcm9sbEJ5UGFnZSA9IEJvb2xlYW4oY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0VmFsdWUoc2Nyb2xsQnlQYWdlS2V5KSk7XG5cdFx0XHRcdG9wdGlvbnMgPSB7IC4uLm9wdGlvbnMsIHNjcm9sbEJ5UGFnZSB9O1xuXHRcdFx0fVxuXHRcdFx0aWYgKGUuYWZmZWN0c0NvbmZpZ3VyYXRpb24obGlzdFNtb290aFNjcm9sbGluZykpIHtcblx0XHRcdFx0Y29uc3Qgc21vb3RoU2Nyb2xsaW5nID0gQm9vbGVhbihjb25maWd1cmF0aW9uU2VydmljZS5nZXRWYWx1ZShsaXN0U21vb3RoU2Nyb2xsaW5nKSk7XG5cdFx0XHRcdG9wdGlvbnMgPSB7IC4uLm9wdGlvbnMsIHNtb290aFNjcm9sbGluZyB9O1xuXHRcdFx0fVxuXHRcdFx0aWYgKGUuYWZmZWN0c0NvbmZpZ3VyYXRpb24obW91c2VXaGVlbFNjcm9sbFNlbnNpdGl2aXR5S2V5KSkge1xuXHRcdFx0XHRjb25zdCBtb3VzZVdoZWVsU2Nyb2xsU2Vuc2l0aXZpdHkgPSBjb25maWd1cmF0aW9uU2VydmljZS5nZXRWYWx1ZTxudW1iZXI+KG1vdXNlV2hlZWxTY3JvbGxTZW5zaXRpdml0eUtleSk7XG5cdFx0XHRcdG9wdGlvbnMgPSB7IC4uLm9wdGlvbnMsIG1vdXNlV2hlZWxTY3JvbGxTZW5zaXRpdml0eSB9O1xuXHRcdFx0fVxuXHRcdFx0aWYgKGUuYWZmZWN0c0NvbmZpZ3VyYXRpb24oZmFzdFNjcm9sbFNlbnNpdGl2aXR5S2V5KSkge1xuXHRcdFx0XHRjb25zdCBmYXN0U2Nyb2xsU2Vuc2l0aXZpdHkgPSBjb25maWd1cmF0aW9uU2VydmljZS5nZXRWYWx1ZTxudW1iZXI+KGZhc3RTY3JvbGxTZW5zaXRpdml0eUtleSk7XG5cdFx0XHRcdG9wdGlvbnMgPSB7IC4uLm9wdGlvbnMsIGZhc3RTY3JvbGxTZW5zaXRpdml0eSB9O1xuXHRcdFx0fVxuXHRcdFx0aWYgKE9iamVjdC5rZXlzKG9wdGlvbnMpLmxlbmd0aCA+IDApIHtcblx0XHRcdFx0dGhpcy51cGRhdGVPcHRpb25zKG9wdGlvbnMpO1xuXHRcdFx0fVxuXHRcdH0pKTtcblxuXHRcdHRoaXMubmF2aWdhdG9yID0gbmV3IExpc3RSZXNvdXJjZU5hdmlnYXRvcih0aGlzLCB7IGNvbmZpZ3VyYXRpb25TZXJ2aWNlLCAuLi5vcHRpb25zIH0pO1xuXHRcdHRoaXMuZGlzcG9zYWJsZXMuYWRkKHRoaXMubmF2aWdhdG9yKTtcblx0fVxuXG5cdG92ZXJyaWRlIHVwZGF0ZU9wdGlvbnMob3B0aW9uczogSVdvcmtiZW5jaExpc3RPcHRpb25zVXBkYXRlKTogdm9pZCB7XG5cdFx0c3VwZXIudXBkYXRlT3B0aW9ucyhvcHRpb25zKTtcblxuXHRcdGlmIChvcHRpb25zLm92ZXJyaWRlU3R5bGVzICE9PSB1bmRlZmluZWQpIHtcblx0XHRcdHRoaXMudXBkYXRlU3R5bGVzKG9wdGlvbnMub3ZlcnJpZGVTdHlsZXMpO1xuXHRcdH1cblxuXHRcdGlmIChvcHRpb25zLm11bHRpcGxlU2VsZWN0aW9uU3VwcG9ydCAhPT0gdW5kZWZpbmVkKSB7XG5cdFx0XHR0aGlzLmxpc3RTdXBwb3J0c011bHRpU2VsZWN0LnNldCghIW9wdGlvbnMubXVsdGlwbGVTZWxlY3Rpb25TdXBwb3J0KTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIHVwZGF0ZVN0eWxlcyhzdHlsZXM6IElTdHlsZU92ZXJyaWRlPElMaXN0U3R5bGVzPiB8IHVuZGVmaW5lZCk6IHZvaWQge1xuXHRcdHRoaXMuc3R5bGUoc3R5bGVzID8gZ2V0TGlzdFN0eWxlcyhzdHlsZXMpIDogZGVmYXVsdExpc3RTdHlsZXMpO1xuXHR9XG5cblx0Z2V0IHVzZUFsdEFzTXVsdGlwbGVTZWxlY3Rpb25Nb2RpZmllcigpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gdGhpcy5fdXNlQWx0QXNNdWx0aXBsZVNlbGVjdGlvbk1vZGlmaWVyO1xuXHR9XG5cblx0b3ZlcnJpZGUgZGlzcG9zZSgpOiB2b2lkIHtcblx0XHR0aGlzLmRpc3Bvc2FibGVzLmRpc3Bvc2UoKTtcblx0XHRzdXBlci5kaXNwb3NlKCk7XG5cdH1cbn1cblxuZXhwb3J0IGludGVyZmFjZSBJV29ya2JlbmNoVGFibGVPcHRpb25zVXBkYXRlIGV4dGVuZHMgSVRhYmxlT3B0aW9uc1VwZGF0ZSB7XG5cdHJlYWRvbmx5IG92ZXJyaWRlU3R5bGVzPzogSVN0eWxlT3ZlcnJpZGU8SUxpc3RTdHlsZXM+O1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIElXb3JrYmVuY2hUYWJsZU9wdGlvbnM8VD4gZXh0ZW5kcyBJV29ya2JlbmNoVGFibGVPcHRpb25zVXBkYXRlLCBJUmVzb3VyY2VOYXZpZ2F0b3JPcHRpb25zLCBJVGFibGVPcHRpb25zPFQ+IHtcblx0cmVhZG9ubHkgc2VsZWN0aW9uTmF2aWdhdGlvbj86IGJvb2xlYW47XG59XG5cbmV4cG9ydCBjbGFzcyBXb3JrYmVuY2hUYWJsZTxUUm93PiBleHRlbmRzIFRhYmxlPFRSb3c+IHtcblxuXHRyZWFkb25seSBjb250ZXh0S2V5U2VydmljZTogSVNjb3BlZENvbnRleHRLZXlTZXJ2aWNlO1xuXHRwcml2YXRlIGxpc3RTdXBwb3J0c011bHRpU2VsZWN0OiBJQ29udGV4dEtleTxib29sZWFuPjtcblx0cHJpdmF0ZSBsaXN0SGFzU2VsZWN0aW9uT3JGb2N1czogSUNvbnRleHRLZXk8Ym9vbGVhbj47XG5cdHByaXZhdGUgbGlzdERvdWJsZVNlbGVjdGlvbjogSUNvbnRleHRLZXk8Ym9vbGVhbj47XG5cdHByaXZhdGUgbGlzdE11bHRpU2VsZWN0aW9uOiBJQ29udGV4dEtleTxib29sZWFuPjtcblx0cHJpdmF0ZSBob3Jpem9udGFsU2Nyb2xsaW5nOiBib29sZWFuIHwgdW5kZWZpbmVkO1xuXHRwcml2YXRlIF91c2VBbHRBc011bHRpcGxlU2VsZWN0aW9uTW9kaWZpZXI6IGJvb2xlYW47XG5cdHByaXZhdGUgbmF2aWdhdG9yOiBUYWJsZVJlc291cmNlTmF2aWdhdG9yPFRSb3c+O1xuXHRnZXQgb25EaWRPcGVuKCk6IEV2ZW50PElPcGVuRXZlbnQ8VFJvdyB8IHVuZGVmaW5lZD4+IHsgcmV0dXJuIHRoaXMubmF2aWdhdG9yLm9uRGlkT3BlbjsgfVxuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdHVzZXI6IHN0cmluZyxcblx0XHRjb250YWluZXI6IEhUTUxFbGVtZW50LFxuXHRcdGRlbGVnYXRlOiBJVGFibGVWaXJ0dWFsRGVsZWdhdGU8VFJvdz4sXG5cdFx0Y29sdW1uczogSVRhYmxlQ29sdW1uPFRSb3csIGFueT5bXSxcblx0XHRyZW5kZXJlcnM6IElUYWJsZVJlbmRlcmVyPFRSb3csIGFueT5bXSxcblx0XHRvcHRpb25zOiBJV29ya2JlbmNoVGFibGVPcHRpb25zPFRSb3c+LFxuXHRcdEBJQ29udGV4dEtleVNlcnZpY2UgY29udGV4dEtleVNlcnZpY2U6IElDb250ZXh0S2V5U2VydmljZSxcblx0XHRASUxpc3RTZXJ2aWNlIGxpc3RTZXJ2aWNlOiBJTGlzdFNlcnZpY2UsXG5cdFx0QElDb25maWd1cmF0aW9uU2VydmljZSBjb25maWd1cmF0aW9uU2VydmljZTogSUNvbmZpZ3VyYXRpb25TZXJ2aWNlLFxuXHRcdEBJSW5zdGFudGlhdGlvblNlcnZpY2UgaW5zdGFudGlhdGlvblNlcnZpY2U6IElJbnN0YW50aWF0aW9uU2VydmljZVxuXHQpIHtcblx0XHRjb25zdCBob3Jpem9udGFsU2Nyb2xsaW5nID0gdHlwZW9mIG9wdGlvbnMuaG9yaXpvbnRhbFNjcm9sbGluZyAhPT0gJ3VuZGVmaW5lZCcgPyBvcHRpb25zLmhvcml6b250YWxTY3JvbGxpbmcgOiBCb29sZWFuKGNvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldFZhbHVlKGhvcml6b250YWxTY3JvbGxpbmdLZXkpKTtcblx0XHRjb25zdCBbd29ya2JlbmNoTGlzdE9wdGlvbnMsIHdvcmtiZW5jaExpc3RPcHRpb25zRGlzcG9zYWJsZV0gPSBpbnN0YW50aWF0aW9uU2VydmljZS5pbnZva2VGdW5jdGlvbih0b1dvcmtiZW5jaExpc3RPcHRpb25zLCBvcHRpb25zKTtcblxuXHRcdHN1cGVyKHVzZXIsIGNvbnRhaW5lciwgZGVsZWdhdGUsIGNvbHVtbnMsIHJlbmRlcmVycyxcblx0XHRcdHtcblx0XHRcdFx0a2V5Ym9hcmRTdXBwb3J0OiBmYWxzZSxcblx0XHRcdFx0Li4ud29ya2JlbmNoTGlzdE9wdGlvbnMsXG5cdFx0XHRcdGhvcml6b250YWxTY3JvbGxpbmcsXG5cdFx0XHR9XG5cdFx0KTtcblxuXHRcdHRoaXMuZGlzcG9zYWJsZXMuYWRkKHdvcmtiZW5jaExpc3RPcHRpb25zRGlzcG9zYWJsZSk7XG5cblx0XHR0aGlzLmNvbnRleHRLZXlTZXJ2aWNlID0gY3JlYXRlU2NvcGVkQ29udGV4dEtleVNlcnZpY2UoY29udGV4dEtleVNlcnZpY2UsIHRoaXMpO1xuXG5cdFx0dGhpcy5kaXNwb3NhYmxlcy5hZGQoY3JlYXRlU2Nyb2xsT2JzZXJ2ZXIodGhpcy5jb250ZXh0S2V5U2VydmljZSwgdGhpcykpO1xuXG5cdFx0dGhpcy5saXN0U3VwcG9ydHNNdWx0aVNlbGVjdCA9IFdvcmtiZW5jaExpc3RTdXBwb3J0c011bHRpU2VsZWN0Q29udGV4dEtleS5iaW5kVG8odGhpcy5jb250ZXh0S2V5U2VydmljZSk7XG5cdFx0dGhpcy5saXN0U3VwcG9ydHNNdWx0aVNlbGVjdC5zZXQob3B0aW9ucy5tdWx0aXBsZVNlbGVjdGlvblN1cHBvcnQgIT09IGZhbHNlKTtcblxuXHRcdGNvbnN0IGxpc3RTZWxlY3Rpb25OYXZpZ2F0aW9uID0gV29ya2JlbmNoTGlzdFNlbGVjdGlvbk5hdmlnYXRpb24uYmluZFRvKHRoaXMuY29udGV4dEtleVNlcnZpY2UpO1xuXHRcdGxpc3RTZWxlY3Rpb25OYXZpZ2F0aW9uLnNldChCb29sZWFuKG9wdGlvbnMuc2VsZWN0aW9uTmF2aWdhdGlvbikpO1xuXG5cdFx0dGhpcy5saXN0SGFzU2VsZWN0aW9uT3JGb2N1cyA9IFdvcmtiZW5jaExpc3RIYXNTZWxlY3Rpb25PckZvY3VzLmJpbmRUbyh0aGlzLmNvbnRleHRLZXlTZXJ2aWNlKTtcblx0XHR0aGlzLmxpc3REb3VibGVTZWxlY3Rpb24gPSBXb3JrYmVuY2hMaXN0RG91YmxlU2VsZWN0aW9uLmJpbmRUbyh0aGlzLmNvbnRleHRLZXlTZXJ2aWNlKTtcblx0XHR0aGlzLmxpc3RNdWx0aVNlbGVjdGlvbiA9IFdvcmtiZW5jaExpc3RNdWx0aVNlbGVjdGlvbi5iaW5kVG8odGhpcy5jb250ZXh0S2V5U2VydmljZSk7XG5cdFx0dGhpcy5ob3Jpem9udGFsU2Nyb2xsaW5nID0gb3B0aW9ucy5ob3Jpem9udGFsU2Nyb2xsaW5nO1xuXG5cdFx0dGhpcy5fdXNlQWx0QXNNdWx0aXBsZVNlbGVjdGlvbk1vZGlmaWVyID0gdXNlQWx0QXNNdWx0aXBsZVNlbGVjdGlvbk1vZGlmaWVyKGNvbmZpZ3VyYXRpb25TZXJ2aWNlKTtcblxuXHRcdHRoaXMuZGlzcG9zYWJsZXMuYWRkKHRoaXMuY29udGV4dEtleVNlcnZpY2UpO1xuXHRcdHRoaXMuZGlzcG9zYWJsZXMuYWRkKChsaXN0U2VydmljZSBhcyBMaXN0U2VydmljZSkucmVnaXN0ZXIodGhpcykpO1xuXG5cdFx0dGhpcy51cGRhdGVTdHlsZXMob3B0aW9ucy5vdmVycmlkZVN0eWxlcyk7XG5cblx0XHR0aGlzLmRpc3Bvc2FibGVzLmFkZCh0aGlzLm9uRGlkQ2hhbmdlU2VsZWN0aW9uKCgpID0+IHtcblx0XHRcdGNvbnN0IHNlbGVjdGlvbiA9IHRoaXMuZ2V0U2VsZWN0aW9uKCk7XG5cdFx0XHRjb25zdCBmb2N1cyA9IHRoaXMuZ2V0Rm9jdXMoKTtcblxuXHRcdFx0dGhpcy5jb250ZXh0S2V5U2VydmljZS5idWZmZXJDaGFuZ2VFdmVudHMoKCkgPT4ge1xuXHRcdFx0XHR0aGlzLmxpc3RIYXNTZWxlY3Rpb25PckZvY3VzLnNldChzZWxlY3Rpb24ubGVuZ3RoID4gMCB8fCBmb2N1cy5sZW5ndGggPiAwKTtcblx0XHRcdFx0dGhpcy5saXN0TXVsdGlTZWxlY3Rpb24uc2V0KHNlbGVjdGlvbi5sZW5ndGggPiAxKTtcblx0XHRcdFx0dGhpcy5saXN0RG91YmxlU2VsZWN0aW9uLnNldChzZWxlY3Rpb24ubGVuZ3RoID09PSAyKTtcblx0XHRcdH0pO1xuXHRcdH0pKTtcblx0XHR0aGlzLmRpc3Bvc2FibGVzLmFkZCh0aGlzLm9uRGlkQ2hhbmdlRm9jdXMoKCkgPT4ge1xuXHRcdFx0Y29uc3Qgc2VsZWN0aW9uID0gdGhpcy5nZXRTZWxlY3Rpb24oKTtcblx0XHRcdGNvbnN0IGZvY3VzID0gdGhpcy5nZXRGb2N1cygpO1xuXG5cdFx0XHR0aGlzLmxpc3RIYXNTZWxlY3Rpb25PckZvY3VzLnNldChzZWxlY3Rpb24ubGVuZ3RoID4gMCB8fCBmb2N1cy5sZW5ndGggPiAwKTtcblx0XHR9KSk7XG5cdFx0dGhpcy5kaXNwb3NhYmxlcy5hZGQoY29uZmlndXJhdGlvblNlcnZpY2Uub25EaWRDaGFuZ2VDb25maWd1cmF0aW9uKGUgPT4ge1xuXHRcdFx0aWYgKGUuYWZmZWN0c0NvbmZpZ3VyYXRpb24obXVsdGlTZWxlY3RNb2RpZmllclNldHRpbmdLZXkpKSB7XG5cdFx0XHRcdHRoaXMuX3VzZUFsdEFzTXVsdGlwbGVTZWxlY3Rpb25Nb2RpZmllciA9IHVzZUFsdEFzTXVsdGlwbGVTZWxlY3Rpb25Nb2RpZmllcihjb25maWd1cmF0aW9uU2VydmljZSk7XG5cdFx0XHR9XG5cblx0XHRcdGxldCBvcHRpb25zOiBJTGlzdE9wdGlvbnNVcGRhdGUgPSB7fTtcblxuXHRcdFx0aWYgKGUuYWZmZWN0c0NvbmZpZ3VyYXRpb24oaG9yaXpvbnRhbFNjcm9sbGluZ0tleSkgJiYgdGhpcy5ob3Jpem9udGFsU2Nyb2xsaW5nID09PSB1bmRlZmluZWQpIHtcblx0XHRcdFx0Y29uc3QgaG9yaXpvbnRhbFNjcm9sbGluZyA9IEJvb2xlYW4oY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0VmFsdWUoaG9yaXpvbnRhbFNjcm9sbGluZ0tleSkpO1xuXHRcdFx0XHRvcHRpb25zID0geyAuLi5vcHRpb25zLCBob3Jpem9udGFsU2Nyb2xsaW5nIH07XG5cdFx0XHR9XG5cdFx0XHRpZiAoZS5hZmZlY3RzQ29uZmlndXJhdGlvbihzY3JvbGxCeVBhZ2VLZXkpKSB7XG5cdFx0XHRcdGNvbnN0IHNjcm9sbEJ5UGFnZSA9IEJvb2xlYW4oY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0VmFsdWUoc2Nyb2xsQnlQYWdlS2V5KSk7XG5cdFx0XHRcdG9wdGlvbnMgPSB7IC4uLm9wdGlvbnMsIHNjcm9sbEJ5UGFnZSB9O1xuXHRcdFx0fVxuXHRcdFx0aWYgKGUuYWZmZWN0c0NvbmZpZ3VyYXRpb24obGlzdFNtb290aFNjcm9sbGluZykpIHtcblx0XHRcdFx0Y29uc3Qgc21vb3RoU2Nyb2xsaW5nID0gQm9vbGVhbihjb25maWd1cmF0aW9uU2VydmljZS5nZXRWYWx1ZShsaXN0U21vb3RoU2Nyb2xsaW5nKSk7XG5cdFx0XHRcdG9wdGlvbnMgPSB7IC4uLm9wdGlvbnMsIHNtb290aFNjcm9sbGluZyB9O1xuXHRcdFx0fVxuXHRcdFx0aWYgKGUuYWZmZWN0c0NvbmZpZ3VyYXRpb24obW91c2VXaGVlbFNjcm9sbFNlbnNpdGl2aXR5S2V5KSkge1xuXHRcdFx0XHRjb25zdCBtb3VzZVdoZWVsU2Nyb2xsU2Vuc2l0aXZpdHkgPSBjb25maWd1cmF0aW9uU2VydmljZS5nZXRWYWx1ZTxudW1iZXI+KG1vdXNlV2hlZWxTY3JvbGxTZW5zaXRpdml0eUtleSk7XG5cdFx0XHRcdG9wdGlvbnMgPSB7IC4uLm9wdGlvbnMsIG1vdXNlV2hlZWxTY3JvbGxTZW5zaXRpdml0eSB9O1xuXHRcdFx0fVxuXHRcdFx0aWYgKGUuYWZmZWN0c0NvbmZpZ3VyYXRpb24oZmFzdFNjcm9sbFNlbnNpdGl2aXR5S2V5KSkge1xuXHRcdFx0XHRjb25zdCBmYXN0U2Nyb2xsU2Vuc2l0aXZpdHkgPSBjb25maWd1cmF0aW9uU2VydmljZS5nZXRWYWx1ZTxudW1iZXI+KGZhc3RTY3JvbGxTZW5zaXRpdml0eUtleSk7XG5cdFx0XHRcdG9wdGlvbnMgPSB7IC4uLm9wdGlvbnMsIGZhc3RTY3JvbGxTZW5zaXRpdml0eSB9O1xuXHRcdFx0fVxuXHRcdFx0aWYgKE9iamVjdC5rZXlzKG9wdGlvbnMpLmxlbmd0aCA+IDApIHtcblx0XHRcdFx0dGhpcy51cGRhdGVPcHRpb25zKG9wdGlvbnMpO1xuXHRcdFx0fVxuXHRcdH0pKTtcblxuXHRcdHRoaXMubmF2aWdhdG9yID0gbmV3IFRhYmxlUmVzb3VyY2VOYXZpZ2F0b3IodGhpcywgeyBjb25maWd1cmF0aW9uU2VydmljZSwgLi4ub3B0aW9ucyB9KTtcblx0XHR0aGlzLmRpc3Bvc2FibGVzLmFkZCh0aGlzLm5hdmlnYXRvcik7XG5cdH1cblxuXHRvdmVycmlkZSB1cGRhdGVPcHRpb25zKG9wdGlvbnM6IElXb3JrYmVuY2hUYWJsZU9wdGlvbnNVcGRhdGUpOiB2b2lkIHtcblx0XHRzdXBlci51cGRhdGVPcHRpb25zKG9wdGlvbnMpO1xuXG5cdFx0aWYgKG9wdGlvbnMub3ZlcnJpZGVTdHlsZXMgIT09IHVuZGVmaW5lZCkge1xuXHRcdFx0dGhpcy51cGRhdGVTdHlsZXMob3B0aW9ucy5vdmVycmlkZVN0eWxlcyk7XG5cdFx0fVxuXG5cdFx0aWYgKG9wdGlvbnMubXVsdGlwbGVTZWxlY3Rpb25TdXBwb3J0ICE9PSB1bmRlZmluZWQpIHtcblx0XHRcdHRoaXMubGlzdFN1cHBvcnRzTXVsdGlTZWxlY3Quc2V0KCEhb3B0aW9ucy5tdWx0aXBsZVNlbGVjdGlvblN1cHBvcnQpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgdXBkYXRlU3R5bGVzKHN0eWxlczogSVN0eWxlT3ZlcnJpZGU8SVRhYmxlU3R5bGVzPiB8IHVuZGVmaW5lZCk6IHZvaWQge1xuXHRcdHRoaXMuc3R5bGUoc3R5bGVzID8gZ2V0TGlzdFN0eWxlcyhzdHlsZXMpIDogZGVmYXVsdExpc3RTdHlsZXMpO1xuXHR9XG5cblx0Z2V0IHVzZUFsdEFzTXVsdGlwbGVTZWxlY3Rpb25Nb2RpZmllcigpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gdGhpcy5fdXNlQWx0QXNNdWx0aXBsZVNlbGVjdGlvbk1vZGlmaWVyO1xuXHR9XG5cblx0b3ZlcnJpZGUgZGlzcG9zZSgpOiB2b2lkIHtcblx0XHR0aGlzLmRpc3Bvc2FibGVzLmRpc3Bvc2UoKTtcblx0XHRzdXBlci5kaXNwb3NlKCk7XG5cdH1cbn1cblxuZXhwb3J0IGludGVyZmFjZSBJT3BlbkV2ZW50PFQ+IHtcblx0ZWRpdG9yT3B0aW9uczogSUVkaXRvck9wdGlvbnM7XG5cdHNpZGVCeVNpZGU6IGJvb2xlYW47XG5cdGVsZW1lbnQ6IFQ7XG5cdGJyb3dzZXJFdmVudD86IFVJRXZlbnQ7XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgSVJlc291cmNlTmF2aWdhdG9yT3B0aW9ucyB7XG5cdHJlYWRvbmx5IGNvbmZpZ3VyYXRpb25TZXJ2aWNlPzogSUNvbmZpZ3VyYXRpb25TZXJ2aWNlO1xuXHRyZWFkb25seSBvcGVuT25TaW5nbGVDbGljaz86IGJvb2xlYW47XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgU2VsZWN0aW9uS2V5Ym9hcmRFdmVudCBleHRlbmRzIEtleWJvYXJkRXZlbnQge1xuXHRwcmVzZXJ2ZUZvY3VzPzogYm9vbGVhbjtcblx0cGlubmVkPzogYm9vbGVhbjtcblx0X19mb3JjZUV2ZW50PzogYm9vbGVhbjtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGdldFNlbGVjdGlvbktleWJvYXJkRXZlbnQodHlwZUFyZyA9ICdrZXlkb3duJywgcHJlc2VydmVGb2N1cz86IGJvb2xlYW4sIHBpbm5lZD86IGJvb2xlYW4pOiBTZWxlY3Rpb25LZXlib2FyZEV2ZW50IHtcblx0Y29uc3QgZSA9IG5ldyBLZXlib2FyZEV2ZW50KHR5cGVBcmcpO1xuXHQoPFNlbGVjdGlvbktleWJvYXJkRXZlbnQ+ZSkucHJlc2VydmVGb2N1cyA9IHByZXNlcnZlRm9jdXM7XG5cdCg8U2VsZWN0aW9uS2V5Ym9hcmRFdmVudD5lKS5waW5uZWQgPSBwaW5uZWQ7XG5cdCg8U2VsZWN0aW9uS2V5Ym9hcmRFdmVudD5lKS5fX2ZvcmNlRXZlbnQgPSB0cnVlO1xuXG5cdHJldHVybiBlO1xufVxuXG5hYnN0cmFjdCBjbGFzcyBSZXNvdXJjZU5hdmlnYXRvcjxUPiBleHRlbmRzIERpc3Bvc2FibGUge1xuXG5cdHByaXZhdGUgb3Blbk9uU2luZ2xlQ2xpY2s6IGJvb2xlYW47XG5cblx0cHJpdmF0ZSByZWFkb25seSBfb25EaWRPcGVuID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8SU9wZW5FdmVudDxUIHwgdW5kZWZpbmVkPj4oKSk7XG5cdHJlYWRvbmx5IG9uRGlkT3BlbjogRXZlbnQ8SU9wZW5FdmVudDxUIHwgdW5kZWZpbmVkPj4gPSB0aGlzLl9vbkRpZE9wZW4uZXZlbnQ7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0cHJvdGVjdGVkIHJlYWRvbmx5IHdpZGdldDogTGlzdFdpZGdldCxcblx0XHRvcHRpb25zPzogSVJlc291cmNlTmF2aWdhdG9yT3B0aW9uc1xuXHQpIHtcblx0XHRzdXBlcigpO1xuXG5cdFx0dGhpcy5fcmVnaXN0ZXIoRXZlbnQuZmlsdGVyKHRoaXMud2lkZ2V0Lm9uRGlkQ2hhbmdlU2VsZWN0aW9uLCBlID0+IGlzS2V5Ym9hcmRFdmVudChlLmJyb3dzZXJFdmVudCkpKGUgPT4gdGhpcy5vblNlbGVjdGlvbkZyb21LZXlib2FyZChlKSkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMud2lkZ2V0Lm9uUG9pbnRlcigoZTogeyBicm93c2VyRXZlbnQ6IE1vdXNlRXZlbnQ7IGVsZW1lbnQ6IFQgfCB1bmRlZmluZWQgfSkgPT4gdGhpcy5vblBvaW50ZXIoZS5lbGVtZW50LCBlLmJyb3dzZXJFdmVudCkpKTtcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLndpZGdldC5vbk1vdXNlRGJsQ2xpY2soKGU6IHsgYnJvd3NlckV2ZW50OiBNb3VzZUV2ZW50OyBlbGVtZW50OiBUIHwgdW5kZWZpbmVkIH0pID0+IHRoaXMub25Nb3VzZURibENsaWNrKGUuZWxlbWVudCwgZS5icm93c2VyRXZlbnQpKSk7XG5cblx0XHRpZiAodHlwZW9mIG9wdGlvbnM/Lm9wZW5PblNpbmdsZUNsaWNrICE9PSAnYm9vbGVhbicgJiYgb3B0aW9ucz8uY29uZmlndXJhdGlvblNlcnZpY2UpIHtcblx0XHRcdHRoaXMub3Blbk9uU2luZ2xlQ2xpY2sgPSBvcHRpb25zPy5jb25maWd1cmF0aW9uU2VydmljZS5nZXRWYWx1ZShvcGVuTW9kZVNldHRpbmdLZXkpICE9PSAnZG91YmxlQ2xpY2snO1xuXHRcdFx0dGhpcy5fcmVnaXN0ZXIob3B0aW9ucz8uY29uZmlndXJhdGlvblNlcnZpY2Uub25EaWRDaGFuZ2VDb25maWd1cmF0aW9uKGUgPT4ge1xuXHRcdFx0XHRpZiAoZS5hZmZlY3RzQ29uZmlndXJhdGlvbihvcGVuTW9kZVNldHRpbmdLZXkpKSB7XG5cdFx0XHRcdFx0dGhpcy5vcGVuT25TaW5nbGVDbGljayA9IG9wdGlvbnM/LmNvbmZpZ3VyYXRpb25TZXJ2aWNlIS5nZXRWYWx1ZShvcGVuTW9kZVNldHRpbmdLZXkpICE9PSAnZG91YmxlQ2xpY2snO1xuXHRcdFx0XHR9XG5cdFx0XHR9KSk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHRoaXMub3Blbk9uU2luZ2xlQ2xpY2sgPSBvcHRpb25zPy5vcGVuT25TaW5nbGVDbGljayA/PyB0cnVlO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgb25TZWxlY3Rpb25Gcm9tS2V5Ym9hcmQoZXZlbnQ6IElUcmVlRXZlbnQ8YW55Pik6IHZvaWQge1xuXHRcdGlmIChldmVudC5lbGVtZW50cy5sZW5ndGggIT09IDEpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCBzZWxlY3Rpb25LZXlib2FyZEV2ZW50ID0gZXZlbnQuYnJvd3NlckV2ZW50IGFzIFNlbGVjdGlvbktleWJvYXJkRXZlbnQ7XG5cdFx0Y29uc3QgcHJlc2VydmVGb2N1cyA9IHR5cGVvZiBzZWxlY3Rpb25LZXlib2FyZEV2ZW50LnByZXNlcnZlRm9jdXMgPT09ICdib29sZWFuJyA/IHNlbGVjdGlvbktleWJvYXJkRXZlbnQucHJlc2VydmVGb2N1cyA6IHRydWU7XG5cdFx0Y29uc3QgcGlubmVkID0gdHlwZW9mIHNlbGVjdGlvbktleWJvYXJkRXZlbnQucGlubmVkID09PSAnYm9vbGVhbicgPyBzZWxlY3Rpb25LZXlib2FyZEV2ZW50LnBpbm5lZCA6ICFwcmVzZXJ2ZUZvY3VzO1xuXHRcdGNvbnN0IHNpZGVCeVNpZGUgPSBmYWxzZTtcblxuXHRcdHRoaXMuX29wZW4odGhpcy5nZXRTZWxlY3RlZEVsZW1lbnQoKSwgcHJlc2VydmVGb2N1cywgcGlubmVkLCBzaWRlQnlTaWRlLCBldmVudC5icm93c2VyRXZlbnQpO1xuXHR9XG5cblx0cHJpdmF0ZSBvblBvaW50ZXIoZWxlbWVudDogVCB8IHVuZGVmaW5lZCwgYnJvd3NlckV2ZW50OiBNb3VzZUV2ZW50KTogdm9pZCB7XG5cdFx0aWYgKCF0aGlzLm9wZW5PblNpbmdsZUNsaWNrKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29uc3QgaXNEb3VibGVDbGljayA9IGJyb3dzZXJFdmVudC5kZXRhaWwgPT09IDI7XG5cblx0XHRpZiAoaXNEb3VibGVDbGljaykge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IGlzTWlkZGxlQ2xpY2sgPSBicm93c2VyRXZlbnQuYnV0dG9uID09PSAxO1xuXHRcdGNvbnN0IHByZXNlcnZlRm9jdXMgPSB0cnVlO1xuXHRcdGNvbnN0IHBpbm5lZCA9IGlzTWlkZGxlQ2xpY2s7XG5cdFx0Y29uc3Qgc2lkZUJ5U2lkZSA9IGJyb3dzZXJFdmVudC5jdHJsS2V5IHx8IGJyb3dzZXJFdmVudC5tZXRhS2V5IHx8IGJyb3dzZXJFdmVudC5hbHRLZXk7XG5cblx0XHR0aGlzLl9vcGVuKGVsZW1lbnQsIHByZXNlcnZlRm9jdXMsIHBpbm5lZCwgc2lkZUJ5U2lkZSwgYnJvd3NlckV2ZW50KTtcblx0fVxuXG5cdHByaXZhdGUgb25Nb3VzZURibENsaWNrKGVsZW1lbnQ6IFQgfCB1bmRlZmluZWQsIGJyb3dzZXJFdmVudD86IE1vdXNlRXZlbnQpOiB2b2lkIHtcblx0XHRpZiAoIWJyb3dzZXJFdmVudCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdC8vIGNvcGllZCBmcm9tIEFic3RyYWN0VHJlZVxuXHRcdGNvbnN0IHRhcmdldCA9IGJyb3dzZXJFdmVudC50YXJnZXQgYXMgSFRNTEVsZW1lbnQ7XG5cdFx0Y29uc3Qgb25Ud2lzdGllID0gdGFyZ2V0LmNsYXNzTGlzdC5jb250YWlucygnbW9uYWNvLXRsLXR3aXN0aWUnKVxuXHRcdFx0fHwgKHRhcmdldC5jbGFzc0xpc3QuY29udGFpbnMoJ21vbmFjby1pY29uLWxhYmVsJykgJiYgdGFyZ2V0LmNsYXNzTGlzdC5jb250YWlucygnZm9sZGVyLWljb24nKSAmJiBicm93c2VyRXZlbnQub2Zmc2V0WCA8IDE2KTtcblxuXHRcdGlmIChvblR3aXN0aWUpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCBwcmVzZXJ2ZUZvY3VzID0gZmFsc2U7XG5cdFx0Y29uc3QgcGlubmVkID0gdHJ1ZTtcblx0XHRjb25zdCBzaWRlQnlTaWRlID0gKGJyb3dzZXJFdmVudC5jdHJsS2V5IHx8IGJyb3dzZXJFdmVudC5tZXRhS2V5IHx8IGJyb3dzZXJFdmVudC5hbHRLZXkpO1xuXG5cdFx0dGhpcy5fb3BlbihlbGVtZW50LCBwcmVzZXJ2ZUZvY3VzLCBwaW5uZWQsIHNpZGVCeVNpZGUsIGJyb3dzZXJFdmVudCk7XG5cdH1cblxuXHRwcml2YXRlIF9vcGVuKGVsZW1lbnQ6IFQgfCB1bmRlZmluZWQsIHByZXNlcnZlRm9jdXM6IGJvb2xlYW4sIHBpbm5lZDogYm9vbGVhbiwgc2lkZUJ5U2lkZTogYm9vbGVhbiwgYnJvd3NlckV2ZW50PzogVUlFdmVudCk6IHZvaWQge1xuXHRcdGlmICghZWxlbWVudCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdHRoaXMuX29uRGlkT3Blbi5maXJlKHtcblx0XHRcdGVkaXRvck9wdGlvbnM6IHtcblx0XHRcdFx0cHJlc2VydmVGb2N1cyxcblx0XHRcdFx0cGlubmVkLFxuXHRcdFx0XHRyZXZlYWxJZlZpc2libGU6IHRydWVcblx0XHRcdH0sXG5cdFx0XHRzaWRlQnlTaWRlLFxuXHRcdFx0ZWxlbWVudCxcblx0XHRcdGJyb3dzZXJFdmVudFxuXHRcdH0pO1xuXHR9XG5cblx0YWJzdHJhY3QgZ2V0U2VsZWN0ZWRFbGVtZW50KCk6IFQgfCB1bmRlZmluZWQ7XG59XG5cbmNsYXNzIExpc3RSZXNvdXJjZU5hdmlnYXRvcjxUPiBleHRlbmRzIFJlc291cmNlTmF2aWdhdG9yPFQ+IHtcblxuXHRwcm90ZWN0ZWQgb3ZlcnJpZGUgcmVhZG9ubHkgd2lkZ2V0OiBMaXN0PFQ+IHwgUGFnZWRMaXN0PFQ+O1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdHdpZGdldDogTGlzdDxUPiB8IFBhZ2VkTGlzdDxUPixcblx0XHRvcHRpb25zOiBJUmVzb3VyY2VOYXZpZ2F0b3JPcHRpb25zXG5cdCkge1xuXHRcdHN1cGVyKHdpZGdldCwgb3B0aW9ucyk7XG5cdFx0dGhpcy53aWRnZXQgPSB3aWRnZXQ7XG5cdH1cblxuXHRnZXRTZWxlY3RlZEVsZW1lbnQoKTogVCB8IHVuZGVmaW5lZCB7XG5cdFx0cmV0dXJuIHRoaXMud2lkZ2V0LmdldFNlbGVjdGVkRWxlbWVudHMoKVswXTtcblx0fVxufVxuXG5jbGFzcyBUYWJsZVJlc291cmNlTmF2aWdhdG9yPFRSb3c+IGV4dGVuZHMgUmVzb3VyY2VOYXZpZ2F0b3I8VFJvdz4ge1xuXG5cdHByb3RlY3RlZCBkZWNsYXJlIHJlYWRvbmx5IHdpZGdldDogVGFibGU8VFJvdz47XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0d2lkZ2V0OiBUYWJsZTxUUm93Pixcblx0XHRvcHRpb25zOiBJUmVzb3VyY2VOYXZpZ2F0b3JPcHRpb25zXG5cdCkge1xuXHRcdHN1cGVyKHdpZGdldCwgb3B0aW9ucyk7XG5cdH1cblxuXHRnZXRTZWxlY3RlZEVsZW1lbnQoKTogVFJvdyB8IHVuZGVmaW5lZCB7XG5cdFx0cmV0dXJuIHRoaXMud2lkZ2V0LmdldFNlbGVjdGVkRWxlbWVudHMoKVswXTtcblx0fVxufVxuXG5jbGFzcyBUcmVlUmVzb3VyY2VOYXZpZ2F0b3I8VCwgVEZpbHRlckRhdGE+IGV4dGVuZHMgUmVzb3VyY2VOYXZpZ2F0b3I8VD4ge1xuXG5cdHByb3RlY3RlZCBkZWNsYXJlIHJlYWRvbmx5IHdpZGdldDogT2JqZWN0VHJlZTxULCBURmlsdGVyRGF0YT4gfCBDb21wcmVzc2libGVPYmplY3RUcmVlPFQsIFRGaWx0ZXJEYXRhPiB8IERhdGFUcmVlPGFueSwgVCwgVEZpbHRlckRhdGE+IHwgQXN5bmNEYXRhVHJlZTxhbnksIFQsIFRGaWx0ZXJEYXRhPiB8IENvbXByZXNzaWJsZUFzeW5jRGF0YVRyZWU8YW55LCBULCBURmlsdGVyRGF0YT47XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0d2lkZ2V0OiBPYmplY3RUcmVlPFQsIFRGaWx0ZXJEYXRhPiB8IENvbXByZXNzaWJsZU9iamVjdFRyZWU8VCwgVEZpbHRlckRhdGE+IHwgRGF0YVRyZWU8YW55LCBULCBURmlsdGVyRGF0YT4gfCBBc3luY0RhdGFUcmVlPGFueSwgVCwgVEZpbHRlckRhdGE+IHwgQ29tcHJlc3NpYmxlQXN5bmNEYXRhVHJlZTxhbnksIFQsIFRGaWx0ZXJEYXRhPixcblx0XHRvcHRpb25zOiBJUmVzb3VyY2VOYXZpZ2F0b3JPcHRpb25zXG5cdCkge1xuXHRcdHN1cGVyKHdpZGdldCwgb3B0aW9ucyk7XG5cdH1cblxuXHRnZXRTZWxlY3RlZEVsZW1lbnQoKTogVCB8IHVuZGVmaW5lZCB7XG5cdFx0cmV0dXJuIHRoaXMud2lkZ2V0LmdldFNlbGVjdGlvbigpWzBdID8/IHVuZGVmaW5lZDtcblx0fVxufVxuXG5mdW5jdGlvbiBjcmVhdGVLZXlib2FyZE5hdmlnYXRpb25FdmVudEZpbHRlcihrZXliaW5kaW5nU2VydmljZTogSUtleWJpbmRpbmdTZXJ2aWNlKTogSUtleWJvYXJkTmF2aWdhdGlvbkV2ZW50RmlsdGVyIHtcblx0bGV0IGluTXVsdGlDaG9yZCA9IGZhbHNlO1xuXG5cdHJldHVybiBldmVudCA9PiB7XG5cdFx0aWYgKGV2ZW50LnRvS2V5Q29kZUNob3JkKCkuaXNNb2RpZmllcktleSgpKSB7XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXG5cdFx0aWYgKGluTXVsdGlDaG9yZCkge1xuXHRcdFx0aW5NdWx0aUNob3JkID0gZmFsc2U7XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXG5cdFx0Y29uc3QgcmVzdWx0ID0ga2V5YmluZGluZ1NlcnZpY2Uuc29mdERpc3BhdGNoKGV2ZW50LCBldmVudC50YXJnZXQpO1xuXG5cdFx0aWYgKHJlc3VsdC5raW5kID09PSBSZXN1bHRLaW5kLk1vcmVDaG9yZHNOZWVkZWQpIHtcblx0XHRcdGluTXVsdGlDaG9yZCA9IHRydWU7XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXG5cdFx0aW5NdWx0aUNob3JkID0gZmFsc2U7XG5cdFx0cmV0dXJuIHJlc3VsdC5raW5kID09PSBSZXN1bHRLaW5kLk5vTWF0Y2hpbmdLYjtcblx0fTtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBJV29ya2JlbmNoT2JqZWN0VHJlZU9wdGlvbnNVcGRhdGU8VD4gZXh0ZW5kcyBJQWJzdHJhY3RUcmVlT3B0aW9uc1VwZGF0ZTxUPiB7XG5cdHJlYWRvbmx5IG92ZXJyaWRlU3R5bGVzPzogSVN0eWxlT3ZlcnJpZGU8SUxpc3RTdHlsZXM+O1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIElXb3JrYmVuY2hPYmplY3RUcmVlT3B0aW9uczxULCBURmlsdGVyRGF0YT4gZXh0ZW5kcyBJT2JqZWN0VHJlZU9wdGlvbnM8VCwgVEZpbHRlckRhdGE+LCBJV29ya2JlbmNoT2JqZWN0VHJlZU9wdGlvbnNVcGRhdGU8VD4sIElSZXNvdXJjZU5hdmlnYXRvck9wdGlvbnMge1xuXHRyZWFkb25seSBhY2Nlc3NpYmlsaXR5UHJvdmlkZXI6IElMaXN0QWNjZXNzaWJpbGl0eVByb3ZpZGVyPFQ+O1xuXHRyZWFkb25seSBzZWxlY3Rpb25OYXZpZ2F0aW9uPzogYm9vbGVhbjtcblx0cmVhZG9ubHkgc2Nyb2xsVG9BY3RpdmVFbGVtZW50PzogYm9vbGVhbjtcbn1cblxuZXhwb3J0IGNsYXNzIFdvcmtiZW5jaE9iamVjdFRyZWU8VCBleHRlbmRzIE5vbk51bGxhYmxlPGFueT4sIFRGaWx0ZXJEYXRhID0gdm9pZD4gZXh0ZW5kcyBPYmplY3RUcmVlPFQsIFRGaWx0ZXJEYXRhPiB7XG5cblx0cHJpdmF0ZSBpbnRlcm5hbHM6IFdvcmtiZW5jaFRyZWVJbnRlcm5hbHM8YW55LCBULCBURmlsdGVyRGF0YT47XG5cdGdldCBjb250ZXh0S2V5U2VydmljZSgpOiBJQ29udGV4dEtleVNlcnZpY2UgeyByZXR1cm4gdGhpcy5pbnRlcm5hbHMuY29udGV4dEtleVNlcnZpY2U7IH1cblx0Z2V0IHVzZUFsdEFzTXVsdGlwbGVTZWxlY3Rpb25Nb2RpZmllcigpOiBib29sZWFuIHsgcmV0dXJuIHRoaXMuaW50ZXJuYWxzLnVzZUFsdEFzTXVsdGlwbGVTZWxlY3Rpb25Nb2RpZmllcjsgfVxuXHRnZXQgb25EaWRPcGVuKCk6IEV2ZW50PElPcGVuRXZlbnQ8VCB8IHVuZGVmaW5lZD4+IHsgcmV0dXJuIHRoaXMuaW50ZXJuYWxzLm9uRGlkT3BlbjsgfVxuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdHVzZXI6IHN0cmluZyxcblx0XHRjb250YWluZXI6IEhUTUxFbGVtZW50LFxuXHRcdGRlbGVnYXRlOiBJTGlzdFZpcnR1YWxEZWxlZ2F0ZTxUPixcblx0XHRyZW5kZXJlcnM6IElUcmVlUmVuZGVyZXI8VCwgVEZpbHRlckRhdGEsIGFueT5bXSxcblx0XHRvcHRpb25zOiBJV29ya2JlbmNoT2JqZWN0VHJlZU9wdGlvbnM8VCwgVEZpbHRlckRhdGE+LFxuXHRcdEBJSW5zdGFudGlhdGlvblNlcnZpY2UgaW5zdGFudGlhdGlvblNlcnZpY2U6IElJbnN0YW50aWF0aW9uU2VydmljZSxcblx0XHRASUNvbnRleHRLZXlTZXJ2aWNlIGNvbnRleHRLZXlTZXJ2aWNlOiBJQ29udGV4dEtleVNlcnZpY2UsXG5cdFx0QElMaXN0U2VydmljZSBsaXN0U2VydmljZTogSUxpc3RTZXJ2aWNlLFxuXHRcdEBJQ29uZmlndXJhdGlvblNlcnZpY2UgY29uZmlndXJhdGlvblNlcnZpY2U6IElDb25maWd1cmF0aW9uU2VydmljZVxuXHQpIHtcblx0XHQvLyBlc2xpbnQtZGlzYWJsZS1uZXh0LWxpbmUgbG9jYWwvY29kZS1uby1hbnktY2FzdHNcblx0XHRjb25zdCB7IG9wdGlvbnM6IHRyZWVPcHRpb25zLCBnZXRUeXBlTmF2aWdhdGlvbk1vZGUsIGRpc3Bvc2FibGUgfSA9IGluc3RhbnRpYXRpb25TZXJ2aWNlLmludm9rZUZ1bmN0aW9uKHdvcmtiZW5jaFRyZWVEYXRhUHJlYW1ibGUsIG9wdGlvbnMgYXMgYW55KTtcblx0XHRzdXBlcih1c2VyLCBjb250YWluZXIsIGRlbGVnYXRlLCByZW5kZXJlcnMsIHRyZWVPcHRpb25zKTtcblx0XHR0aGlzLmRpc3Bvc2FibGVzLmFkZChkaXNwb3NhYmxlKTtcblx0XHR0aGlzLmludGVybmFscyA9IG5ldyBXb3JrYmVuY2hUcmVlSW50ZXJuYWxzKHRoaXMsIG9wdGlvbnMsIGdldFR5cGVOYXZpZ2F0aW9uTW9kZSwgb3B0aW9ucy5vdmVycmlkZVN0eWxlcywgY29udGV4dEtleVNlcnZpY2UsIGxpc3RTZXJ2aWNlLCBjb25maWd1cmF0aW9uU2VydmljZSk7XG5cdFx0dGhpcy5kaXNwb3NhYmxlcy5hZGQodGhpcy5pbnRlcm5hbHMpO1xuXHR9XG5cblx0b3ZlcnJpZGUgdXBkYXRlT3B0aW9ucyhvcHRpb25zOiBJV29ya2JlbmNoT2JqZWN0VHJlZU9wdGlvbnNVcGRhdGU8VCB8IG51bGw+ID0ge30pOiB2b2lkIHtcblx0XHRzdXBlci51cGRhdGVPcHRpb25zKG9wdGlvbnMpO1xuXG5cdFx0aWYgKG9wdGlvbnMub3ZlcnJpZGVTdHlsZXMpIHtcblx0XHRcdHRoaXMuaW50ZXJuYWxzLnVwZGF0ZVN0eWxlT3ZlcnJpZGVzKG9wdGlvbnMub3ZlcnJpZGVTdHlsZXMpO1xuXHRcdH1cblxuXHRcdHRoaXMuaW50ZXJuYWxzLnVwZGF0ZU9wdGlvbnMob3B0aW9ucyk7XG5cdH1cbn1cblxuZXhwb3J0IGludGVyZmFjZSBJV29ya2JlbmNoQ29tcHJlc3NpYmxlT2JqZWN0VHJlZU9wdGlvbnNVcGRhdGU8VD4gZXh0ZW5kcyBJQ29tcHJlc3NpYmxlT2JqZWN0VHJlZU9wdGlvbnNVcGRhdGU8VD4ge1xuXHRyZWFkb25seSBvdmVycmlkZVN0eWxlcz86IElTdHlsZU92ZXJyaWRlPElMaXN0U3R5bGVzPjtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBJV29ya2JlbmNoQ29tcHJlc3NpYmxlT2JqZWN0VHJlZU9wdGlvbnM8VCwgVEZpbHRlckRhdGE+IGV4dGVuZHMgSVdvcmtiZW5jaENvbXByZXNzaWJsZU9iamVjdFRyZWVPcHRpb25zVXBkYXRlPFQ+LCBJQ29tcHJlc3NpYmxlT2JqZWN0VHJlZU9wdGlvbnM8VCwgVEZpbHRlckRhdGE+LCBJUmVzb3VyY2VOYXZpZ2F0b3JPcHRpb25zIHtcblx0cmVhZG9ubHkgYWNjZXNzaWJpbGl0eVByb3ZpZGVyOiBJTGlzdEFjY2Vzc2liaWxpdHlQcm92aWRlcjxUPjtcblx0cmVhZG9ubHkgc2VsZWN0aW9uTmF2aWdhdGlvbj86IGJvb2xlYW47XG59XG5cbmV4cG9ydCBjbGFzcyBXb3JrYmVuY2hDb21wcmVzc2libGVPYmplY3RUcmVlPFQgZXh0ZW5kcyBOb25OdWxsYWJsZTxhbnk+LCBURmlsdGVyRGF0YSA9IHZvaWQ+IGV4dGVuZHMgQ29tcHJlc3NpYmxlT2JqZWN0VHJlZTxULCBURmlsdGVyRGF0YT4ge1xuXG5cdHByaXZhdGUgaW50ZXJuYWxzOiBXb3JrYmVuY2hUcmVlSW50ZXJuYWxzPGFueSwgVCwgVEZpbHRlckRhdGE+O1xuXHRnZXQgY29udGV4dEtleVNlcnZpY2UoKTogSUNvbnRleHRLZXlTZXJ2aWNlIHsgcmV0dXJuIHRoaXMuaW50ZXJuYWxzLmNvbnRleHRLZXlTZXJ2aWNlOyB9XG5cdGdldCB1c2VBbHRBc011bHRpcGxlU2VsZWN0aW9uTW9kaWZpZXIoKTogYm9vbGVhbiB7IHJldHVybiB0aGlzLmludGVybmFscy51c2VBbHRBc011bHRpcGxlU2VsZWN0aW9uTW9kaWZpZXI7IH1cblx0Z2V0IG9uRGlkT3BlbigpOiBFdmVudDxJT3BlbkV2ZW50PFQgfCB1bmRlZmluZWQ+PiB7IHJldHVybiB0aGlzLmludGVybmFscy5vbkRpZE9wZW47IH1cblxuXHRjb25zdHJ1Y3Rvcihcblx0XHR1c2VyOiBzdHJpbmcsXG5cdFx0Y29udGFpbmVyOiBIVE1MRWxlbWVudCxcblx0XHRkZWxlZ2F0ZTogSUxpc3RWaXJ0dWFsRGVsZWdhdGU8VD4sXG5cdFx0cmVuZGVyZXJzOiBJQ29tcHJlc3NpYmxlVHJlZVJlbmRlcmVyPFQsIFRGaWx0ZXJEYXRhLCBhbnk+W10sXG5cdFx0b3B0aW9uczogSVdvcmtiZW5jaENvbXByZXNzaWJsZU9iamVjdFRyZWVPcHRpb25zPFQsIFRGaWx0ZXJEYXRhPixcblx0XHRASUluc3RhbnRpYXRpb25TZXJ2aWNlIGluc3RhbnRpYXRpb25TZXJ2aWNlOiBJSW5zdGFudGlhdGlvblNlcnZpY2UsXG5cdFx0QElDb250ZXh0S2V5U2VydmljZSBjb250ZXh0S2V5U2VydmljZTogSUNvbnRleHRLZXlTZXJ2aWNlLFxuXHRcdEBJTGlzdFNlcnZpY2UgbGlzdFNlcnZpY2U6IElMaXN0U2VydmljZSxcblx0XHRASUNvbmZpZ3VyYXRpb25TZXJ2aWNlIGNvbmZpZ3VyYXRpb25TZXJ2aWNlOiBJQ29uZmlndXJhdGlvblNlcnZpY2Vcblx0KSB7XG5cdFx0Ly8gZXNsaW50LWRpc2FibGUtbmV4dC1saW5lIGxvY2FsL2NvZGUtbm8tYW55LWNhc3RzXG5cdFx0Y29uc3QgeyBvcHRpb25zOiB0cmVlT3B0aW9ucywgZ2V0VHlwZU5hdmlnYXRpb25Nb2RlLCBkaXNwb3NhYmxlIH0gPSBpbnN0YW50aWF0aW9uU2VydmljZS5pbnZva2VGdW5jdGlvbih3b3JrYmVuY2hUcmVlRGF0YVByZWFtYmxlLCBvcHRpb25zIGFzIGFueSk7XG5cdFx0c3VwZXIodXNlciwgY29udGFpbmVyLCBkZWxlZ2F0ZSwgcmVuZGVyZXJzLCB0cmVlT3B0aW9ucyk7XG5cdFx0dGhpcy5kaXNwb3NhYmxlcy5hZGQoZGlzcG9zYWJsZSk7XG5cdFx0dGhpcy5pbnRlcm5hbHMgPSBuZXcgV29ya2JlbmNoVHJlZUludGVybmFscyh0aGlzLCBvcHRpb25zLCBnZXRUeXBlTmF2aWdhdGlvbk1vZGUsIG9wdGlvbnMub3ZlcnJpZGVTdHlsZXMsIGNvbnRleHRLZXlTZXJ2aWNlLCBsaXN0U2VydmljZSwgY29uZmlndXJhdGlvblNlcnZpY2UpO1xuXHRcdHRoaXMuZGlzcG9zYWJsZXMuYWRkKHRoaXMuaW50ZXJuYWxzKTtcblx0fVxuXG5cdG92ZXJyaWRlIHVwZGF0ZU9wdGlvbnMob3B0aW9uczogSVdvcmtiZW5jaENvbXByZXNzaWJsZU9iamVjdFRyZWVPcHRpb25zVXBkYXRlPFQgfCBudWxsPiA9IHt9KTogdm9pZCB7XG5cdFx0c3VwZXIudXBkYXRlT3B0aW9ucyhvcHRpb25zKTtcblxuXHRcdGlmIChvcHRpb25zLm92ZXJyaWRlU3R5bGVzKSB7XG5cdFx0XHR0aGlzLmludGVybmFscy51cGRhdGVTdHlsZU92ZXJyaWRlcyhvcHRpb25zLm92ZXJyaWRlU3R5bGVzKTtcblx0XHR9XG5cblx0XHR0aGlzLmludGVybmFscy51cGRhdGVPcHRpb25zKG9wdGlvbnMpO1xuXHR9XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgSVdvcmtiZW5jaERhdGFUcmVlT3B0aW9uc1VwZGF0ZTxUPiBleHRlbmRzIElBYnN0cmFjdFRyZWVPcHRpb25zVXBkYXRlPFQ+IHtcblx0cmVhZG9ubHkgb3ZlcnJpZGVTdHlsZXM/OiBJU3R5bGVPdmVycmlkZTxJTGlzdFN0eWxlcz47XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgSVdvcmtiZW5jaERhdGFUcmVlT3B0aW9uczxULCBURmlsdGVyRGF0YT4gZXh0ZW5kcyBJV29ya2JlbmNoRGF0YVRyZWVPcHRpb25zVXBkYXRlPFQ+LCBJRGF0YVRyZWVPcHRpb25zPFQsIFRGaWx0ZXJEYXRhPiwgSVJlc291cmNlTmF2aWdhdG9yT3B0aW9ucyB7XG5cdHJlYWRvbmx5IGFjY2Vzc2liaWxpdHlQcm92aWRlcjogSUxpc3RBY2Nlc3NpYmlsaXR5UHJvdmlkZXI8VD47XG5cdHJlYWRvbmx5IHNlbGVjdGlvbk5hdmlnYXRpb24/OiBib29sZWFuO1xufVxuXG5leHBvcnQgY2xhc3MgV29ya2JlbmNoRGF0YVRyZWU8VElucHV0LCBULCBURmlsdGVyRGF0YSA9IHZvaWQ+IGV4dGVuZHMgRGF0YVRyZWU8VElucHV0LCBULCBURmlsdGVyRGF0YT4ge1xuXG5cdHByaXZhdGUgaW50ZXJuYWxzOiBXb3JrYmVuY2hUcmVlSW50ZXJuYWxzPFRJbnB1dCwgVCwgVEZpbHRlckRhdGE+O1xuXHRnZXQgY29udGV4dEtleVNlcnZpY2UoKTogSUNvbnRleHRLZXlTZXJ2aWNlIHsgcmV0dXJuIHRoaXMuaW50ZXJuYWxzLmNvbnRleHRLZXlTZXJ2aWNlOyB9XG5cdGdldCB1c2VBbHRBc011bHRpcGxlU2VsZWN0aW9uTW9kaWZpZXIoKTogYm9vbGVhbiB7IHJldHVybiB0aGlzLmludGVybmFscy51c2VBbHRBc011bHRpcGxlU2VsZWN0aW9uTW9kaWZpZXI7IH1cblx0Z2V0IG9uRGlkT3BlbigpOiBFdmVudDxJT3BlbkV2ZW50PFQgfCB1bmRlZmluZWQ+PiB7IHJldHVybiB0aGlzLmludGVybmFscy5vbkRpZE9wZW47IH1cblxuXHRjb25zdHJ1Y3Rvcihcblx0XHR1c2VyOiBzdHJpbmcsXG5cdFx0Y29udGFpbmVyOiBIVE1MRWxlbWVudCxcblx0XHRkZWxlZ2F0ZTogSUxpc3RWaXJ0dWFsRGVsZWdhdGU8VD4sXG5cdFx0cmVuZGVyZXJzOiBJVHJlZVJlbmRlcmVyPFQsIFRGaWx0ZXJEYXRhLCBhbnk+W10sXG5cdFx0ZGF0YVNvdXJjZTogSURhdGFTb3VyY2U8VElucHV0LCBUPixcblx0XHRvcHRpb25zOiBJV29ya2JlbmNoRGF0YVRyZWVPcHRpb25zPFQsIFRGaWx0ZXJEYXRhPixcblx0XHRASUluc3RhbnRpYXRpb25TZXJ2aWNlIGluc3RhbnRpYXRpb25TZXJ2aWNlOiBJSW5zdGFudGlhdGlvblNlcnZpY2UsXG5cdFx0QElDb250ZXh0S2V5U2VydmljZSBjb250ZXh0S2V5U2VydmljZTogSUNvbnRleHRLZXlTZXJ2aWNlLFxuXHRcdEBJTGlzdFNlcnZpY2UgbGlzdFNlcnZpY2U6IElMaXN0U2VydmljZSxcblx0XHRASUNvbmZpZ3VyYXRpb25TZXJ2aWNlIGNvbmZpZ3VyYXRpb25TZXJ2aWNlOiBJQ29uZmlndXJhdGlvblNlcnZpY2Vcblx0KSB7XG5cdFx0Ly8gZXNsaW50LWRpc2FibGUtbmV4dC1saW5lIGxvY2FsL2NvZGUtbm8tYW55LWNhc3RzXG5cdFx0Y29uc3QgeyBvcHRpb25zOiB0cmVlT3B0aW9ucywgZ2V0VHlwZU5hdmlnYXRpb25Nb2RlLCBkaXNwb3NhYmxlIH0gPSBpbnN0YW50aWF0aW9uU2VydmljZS5pbnZva2VGdW5jdGlvbih3b3JrYmVuY2hUcmVlRGF0YVByZWFtYmxlLCBvcHRpb25zIGFzIGFueSk7XG5cdFx0c3VwZXIodXNlciwgY29udGFpbmVyLCBkZWxlZ2F0ZSwgcmVuZGVyZXJzLCBkYXRhU291cmNlLCB0cmVlT3B0aW9ucyk7XG5cdFx0dGhpcy5kaXNwb3NhYmxlcy5hZGQoZGlzcG9zYWJsZSk7XG5cdFx0dGhpcy5pbnRlcm5hbHMgPSBuZXcgV29ya2JlbmNoVHJlZUludGVybmFscyh0aGlzLCBvcHRpb25zLCBnZXRUeXBlTmF2aWdhdGlvbk1vZGUsIG9wdGlvbnMub3ZlcnJpZGVTdHlsZXMsIGNvbnRleHRLZXlTZXJ2aWNlLCBsaXN0U2VydmljZSwgY29uZmlndXJhdGlvblNlcnZpY2UpO1xuXHRcdHRoaXMuZGlzcG9zYWJsZXMuYWRkKHRoaXMuaW50ZXJuYWxzKTtcblx0fVxuXG5cdG92ZXJyaWRlIHVwZGF0ZU9wdGlvbnMob3B0aW9uczogSVdvcmtiZW5jaERhdGFUcmVlT3B0aW9uc1VwZGF0ZTxUIHwgbnVsbD4gPSB7fSk6IHZvaWQge1xuXHRcdHN1cGVyLnVwZGF0ZU9wdGlvbnMob3B0aW9ucyk7XG5cblx0XHRpZiAob3B0aW9ucy5vdmVycmlkZVN0eWxlcyAhPT0gdW5kZWZpbmVkKSB7XG5cdFx0XHR0aGlzLmludGVybmFscy51cGRhdGVTdHlsZU92ZXJyaWRlcyhvcHRpb25zLm92ZXJyaWRlU3R5bGVzKTtcblx0XHR9XG5cblx0XHR0aGlzLmludGVybmFscy51cGRhdGVPcHRpb25zKG9wdGlvbnMpO1xuXHR9XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgSVdvcmtiZW5jaEFzeW5jRGF0YVRyZWVPcHRpb25zVXBkYXRlPFQ+IGV4dGVuZHMgSUFzeW5jRGF0YVRyZWVPcHRpb25zVXBkYXRlPFQ+IHtcblx0cmVhZG9ubHkgb3ZlcnJpZGVTdHlsZXM/OiBJU3R5bGVPdmVycmlkZTxJTGlzdFN0eWxlcz47XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgSVdvcmtiZW5jaEFzeW5jRGF0YVRyZWVPcHRpb25zPFQsIFRGaWx0ZXJEYXRhPiBleHRlbmRzIElXb3JrYmVuY2hBc3luY0RhdGFUcmVlT3B0aW9uc1VwZGF0ZTxUPiwgSUFzeW5jRGF0YVRyZWVPcHRpb25zPFQsIFRGaWx0ZXJEYXRhPiwgSVJlc291cmNlTmF2aWdhdG9yT3B0aW9ucyB7XG5cdHJlYWRvbmx5IGFjY2Vzc2liaWxpdHlQcm92aWRlcjogSUxpc3RBY2Nlc3NpYmlsaXR5UHJvdmlkZXI8VD47XG5cdHJlYWRvbmx5IHNlbGVjdGlvbk5hdmlnYXRpb24/OiBib29sZWFuO1xufVxuXG5leHBvcnQgY2xhc3MgV29ya2JlbmNoQXN5bmNEYXRhVHJlZTxUSW5wdXQsIFQsIFRGaWx0ZXJEYXRhID0gdm9pZD4gZXh0ZW5kcyBBc3luY0RhdGFUcmVlPFRJbnB1dCwgVCwgVEZpbHRlckRhdGE+IHtcblxuXHRwcml2YXRlIGludGVybmFsczogV29ya2JlbmNoVHJlZUludGVybmFsczxUSW5wdXQsIFQsIFRGaWx0ZXJEYXRhPjtcblx0Z2V0IGNvbnRleHRLZXlTZXJ2aWNlKCk6IElDb250ZXh0S2V5U2VydmljZSB7IHJldHVybiB0aGlzLmludGVybmFscy5jb250ZXh0S2V5U2VydmljZTsgfVxuXHRnZXQgdXNlQWx0QXNNdWx0aXBsZVNlbGVjdGlvbk1vZGlmaWVyKCk6IGJvb2xlYW4geyByZXR1cm4gdGhpcy5pbnRlcm5hbHMudXNlQWx0QXNNdWx0aXBsZVNlbGVjdGlvbk1vZGlmaWVyOyB9XG5cdGdldCBvbkRpZE9wZW4oKTogRXZlbnQ8SU9wZW5FdmVudDxUIHwgdW5kZWZpbmVkPj4geyByZXR1cm4gdGhpcy5pbnRlcm5hbHMub25EaWRPcGVuOyB9XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0dXNlcjogc3RyaW5nLFxuXHRcdGNvbnRhaW5lcjogSFRNTEVsZW1lbnQsXG5cdFx0ZGVsZWdhdGU6IElMaXN0VmlydHVhbERlbGVnYXRlPFQ+LFxuXHRcdHJlbmRlcmVyczogSVRyZWVSZW5kZXJlcjxULCBURmlsdGVyRGF0YSwgYW55PltdLFxuXHRcdGRhdGFTb3VyY2U6IElBc3luY0RhdGFTb3VyY2U8VElucHV0LCBUPixcblx0XHRvcHRpb25zOiBJV29ya2JlbmNoQXN5bmNEYXRhVHJlZU9wdGlvbnM8VCwgVEZpbHRlckRhdGE+LFxuXHRcdEBJSW5zdGFudGlhdGlvblNlcnZpY2UgaW5zdGFudGlhdGlvblNlcnZpY2U6IElJbnN0YW50aWF0aW9uU2VydmljZSxcblx0XHRASUNvbnRleHRLZXlTZXJ2aWNlIGNvbnRleHRLZXlTZXJ2aWNlOiBJQ29udGV4dEtleVNlcnZpY2UsXG5cdFx0QElMaXN0U2VydmljZSBsaXN0U2VydmljZTogSUxpc3RTZXJ2aWNlLFxuXHRcdEBJQ29uZmlndXJhdGlvblNlcnZpY2UgY29uZmlndXJhdGlvblNlcnZpY2U6IElDb25maWd1cmF0aW9uU2VydmljZVxuXHQpIHtcblx0XHQvLyBlc2xpbnQtZGlzYWJsZS1uZXh0LWxpbmUgbG9jYWwvY29kZS1uby1hbnktY2FzdHNcblx0XHRjb25zdCB7IG9wdGlvbnM6IHRyZWVPcHRpb25zLCBnZXRUeXBlTmF2aWdhdGlvbk1vZGUsIGRpc3Bvc2FibGUgfSA9IGluc3RhbnRpYXRpb25TZXJ2aWNlLmludm9rZUZ1bmN0aW9uKHdvcmtiZW5jaFRyZWVEYXRhUHJlYW1ibGUsIG9wdGlvbnMgYXMgYW55KTtcblx0XHRzdXBlcih1c2VyLCBjb250YWluZXIsIGRlbGVnYXRlLCByZW5kZXJlcnMsIGRhdGFTb3VyY2UsIHRyZWVPcHRpb25zKTtcblx0XHR0aGlzLmRpc3Bvc2FibGVzLmFkZChkaXNwb3NhYmxlKTtcblx0XHR0aGlzLmludGVybmFscyA9IG5ldyBXb3JrYmVuY2hUcmVlSW50ZXJuYWxzKHRoaXMsIG9wdGlvbnMsIGdldFR5cGVOYXZpZ2F0aW9uTW9kZSwgb3B0aW9ucy5vdmVycmlkZVN0eWxlcywgY29udGV4dEtleVNlcnZpY2UsIGxpc3RTZXJ2aWNlLCBjb25maWd1cmF0aW9uU2VydmljZSk7XG5cdFx0dGhpcy5kaXNwb3NhYmxlcy5hZGQodGhpcy5pbnRlcm5hbHMpO1xuXHR9XG5cblx0b3ZlcnJpZGUgdXBkYXRlT3B0aW9ucyhvcHRpb25zOiBJV29ya2JlbmNoQXN5bmNEYXRhVHJlZU9wdGlvbnNVcGRhdGU8SUFzeW5jRGF0YVRyZWVOb2RlPFRJbnB1dCwgVD4gfCBudWxsPiA9IHt9KTogdm9pZCB7XG5cdFx0c3VwZXIudXBkYXRlT3B0aW9ucyhvcHRpb25zKTtcblxuXHRcdGlmIChvcHRpb25zLm92ZXJyaWRlU3R5bGVzKSB7XG5cdFx0XHR0aGlzLmludGVybmFscy51cGRhdGVTdHlsZU92ZXJyaWRlcyhvcHRpb25zLm92ZXJyaWRlU3R5bGVzKTtcblx0XHR9XG5cblx0XHR0aGlzLmludGVybmFscy51cGRhdGVPcHRpb25zKG9wdGlvbnMpO1xuXHR9XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgSVdvcmtiZW5jaENvbXByZXNzaWJsZUFzeW5jRGF0YVRyZWVPcHRpb25zPFQsIFRGaWx0ZXJEYXRhPiBleHRlbmRzIElDb21wcmVzc2libGVBc3luY0RhdGFUcmVlT3B0aW9uczxULCBURmlsdGVyRGF0YT4sIElSZXNvdXJjZU5hdmlnYXRvck9wdGlvbnMge1xuXHRyZWFkb25seSBhY2Nlc3NpYmlsaXR5UHJvdmlkZXI6IElMaXN0QWNjZXNzaWJpbGl0eVByb3ZpZGVyPFQ+O1xuXHRyZWFkb25seSBvdmVycmlkZVN0eWxlcz86IElTdHlsZU92ZXJyaWRlPElMaXN0U3R5bGVzPjtcblx0cmVhZG9ubHkgc2VsZWN0aW9uTmF2aWdhdGlvbj86IGJvb2xlYW47XG59XG5cbmV4cG9ydCBjbGFzcyBXb3JrYmVuY2hDb21wcmVzc2libGVBc3luY0RhdGFUcmVlPFRJbnB1dCwgVCwgVEZpbHRlckRhdGEgPSB2b2lkPiBleHRlbmRzIENvbXByZXNzaWJsZUFzeW5jRGF0YVRyZWU8VElucHV0LCBULCBURmlsdGVyRGF0YT4ge1xuXG5cdHByaXZhdGUgaW50ZXJuYWxzOiBXb3JrYmVuY2hUcmVlSW50ZXJuYWxzPFRJbnB1dCwgVCwgVEZpbHRlckRhdGE+O1xuXHRnZXQgY29udGV4dEtleVNlcnZpY2UoKTogSUNvbnRleHRLZXlTZXJ2aWNlIHsgcmV0dXJuIHRoaXMuaW50ZXJuYWxzLmNvbnRleHRLZXlTZXJ2aWNlOyB9XG5cdGdldCB1c2VBbHRBc011bHRpcGxlU2VsZWN0aW9uTW9kaWZpZXIoKTogYm9vbGVhbiB7IHJldHVybiB0aGlzLmludGVybmFscy51c2VBbHRBc011bHRpcGxlU2VsZWN0aW9uTW9kaWZpZXI7IH1cblx0Z2V0IG9uRGlkT3BlbigpOiBFdmVudDxJT3BlbkV2ZW50PFQgfCB1bmRlZmluZWQ+PiB7IHJldHVybiB0aGlzLmludGVybmFscy5vbkRpZE9wZW47IH1cblxuXHRjb25zdHJ1Y3Rvcihcblx0XHR1c2VyOiBzdHJpbmcsXG5cdFx0Y29udGFpbmVyOiBIVE1MRWxlbWVudCxcblx0XHR2aXJ0dWFsRGVsZWdhdGU6IElMaXN0VmlydHVhbERlbGVnYXRlPFQ+LFxuXHRcdGNvbXByZXNzaW9uRGVsZWdhdGU6IElUcmVlQ29tcHJlc3Npb25EZWxlZ2F0ZTxUPixcblx0XHRyZW5kZXJlcnM6IElDb21wcmVzc2libGVUcmVlUmVuZGVyZXI8VCwgVEZpbHRlckRhdGEsIGFueT5bXSxcblx0XHRkYXRhU291cmNlOiBJQXN5bmNEYXRhU291cmNlPFRJbnB1dCwgVD4sXG5cdFx0b3B0aW9uczogSVdvcmtiZW5jaENvbXByZXNzaWJsZUFzeW5jRGF0YVRyZWVPcHRpb25zPFQsIFRGaWx0ZXJEYXRhPixcblx0XHRASUluc3RhbnRpYXRpb25TZXJ2aWNlIGluc3RhbnRpYXRpb25TZXJ2aWNlOiBJSW5zdGFudGlhdGlvblNlcnZpY2UsXG5cdFx0QElDb250ZXh0S2V5U2VydmljZSBjb250ZXh0S2V5U2VydmljZTogSUNvbnRleHRLZXlTZXJ2aWNlLFxuXHRcdEBJTGlzdFNlcnZpY2UgbGlzdFNlcnZpY2U6IElMaXN0U2VydmljZSxcblx0XHRASUNvbmZpZ3VyYXRpb25TZXJ2aWNlIGNvbmZpZ3VyYXRpb25TZXJ2aWNlOiBJQ29uZmlndXJhdGlvblNlcnZpY2Vcblx0KSB7XG5cdFx0Ly8gZXNsaW50LWRpc2FibGUtbmV4dC1saW5lIGxvY2FsL2NvZGUtbm8tYW55LWNhc3RzXG5cdFx0Y29uc3QgeyBvcHRpb25zOiB0cmVlT3B0aW9ucywgZ2V0VHlwZU5hdmlnYXRpb25Nb2RlLCBkaXNwb3NhYmxlIH0gPSBpbnN0YW50aWF0aW9uU2VydmljZS5pbnZva2VGdW5jdGlvbih3b3JrYmVuY2hUcmVlRGF0YVByZWFtYmxlLCBvcHRpb25zIGFzIGFueSk7XG5cdFx0c3VwZXIodXNlciwgY29udGFpbmVyLCB2aXJ0dWFsRGVsZWdhdGUsIGNvbXByZXNzaW9uRGVsZWdhdGUsIHJlbmRlcmVycywgZGF0YVNvdXJjZSwgdHJlZU9wdGlvbnMpO1xuXHRcdHRoaXMuZGlzcG9zYWJsZXMuYWRkKGRpc3Bvc2FibGUpO1xuXHRcdHRoaXMuaW50ZXJuYWxzID0gbmV3IFdvcmtiZW5jaFRyZWVJbnRlcm5hbHModGhpcywgb3B0aW9ucywgZ2V0VHlwZU5hdmlnYXRpb25Nb2RlLCBvcHRpb25zLm92ZXJyaWRlU3R5bGVzLCBjb250ZXh0S2V5U2VydmljZSwgbGlzdFNlcnZpY2UsIGNvbmZpZ3VyYXRpb25TZXJ2aWNlKTtcblx0XHR0aGlzLmRpc3Bvc2FibGVzLmFkZCh0aGlzLmludGVybmFscyk7XG5cdH1cblxuXHRvdmVycmlkZSB1cGRhdGVPcHRpb25zKG9wdGlvbnM6IElDb21wcmVzc2libGVBc3luY0RhdGFUcmVlT3B0aW9uc1VwZGF0ZTxJQXN5bmNEYXRhVHJlZU5vZGU8VElucHV0LCBUPiB8IG51bGw+KTogdm9pZCB7XG5cdFx0c3VwZXIudXBkYXRlT3B0aW9ucyhvcHRpb25zKTtcblx0XHR0aGlzLmludGVybmFscy51cGRhdGVPcHRpb25zKG9wdGlvbnMpO1xuXHR9XG59XG5cbmZ1bmN0aW9uIGdldERlZmF1bHRUcmVlRmluZE1vZGUoY29uZmlndXJhdGlvblNlcnZpY2U6IElDb25maWd1cmF0aW9uU2VydmljZSkge1xuXHRjb25zdCB2YWx1ZSA9IGNvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldFZhbHVlPCdoaWdobGlnaHQnIHwgJ2ZpbHRlcic+KGRlZmF1bHRGaW5kTW9kZVNldHRpbmdLZXkpO1xuXG5cdGlmICh2YWx1ZSA9PT0gJ2hpZ2hsaWdodCcpIHtcblx0XHRyZXR1cm4gVHJlZUZpbmRNb2RlLkhpZ2hsaWdodDtcblx0fSBlbHNlIGlmICh2YWx1ZSA9PT0gJ2ZpbHRlcicpIHtcblx0XHRyZXR1cm4gVHJlZUZpbmRNb2RlLkZpbHRlcjtcblx0fVxuXG5cdGNvbnN0IGRlcHJlY2F0ZWRWYWx1ZSA9IGNvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldFZhbHVlPCdzaW1wbGUnIHwgJ2hpZ2hsaWdodCcgfCAnZmlsdGVyJz4oa2V5Ym9hcmROYXZpZ2F0aW9uU2V0dGluZ0tleSk7XG5cblx0aWYgKGRlcHJlY2F0ZWRWYWx1ZSA9PT0gJ3NpbXBsZScgfHwgZGVwcmVjYXRlZFZhbHVlID09PSAnaGlnaGxpZ2h0Jykge1xuXHRcdHJldHVybiBUcmVlRmluZE1vZGUuSGlnaGxpZ2h0O1xuXHR9IGVsc2UgaWYgKGRlcHJlY2F0ZWRWYWx1ZSA9PT0gJ2ZpbHRlcicpIHtcblx0XHRyZXR1cm4gVHJlZUZpbmRNb2RlLkZpbHRlcjtcblx0fVxuXG5cdHJldHVybiB1bmRlZmluZWQ7XG59XG5cbmZ1bmN0aW9uIGdldERlZmF1bHRUcmVlRmluZE1hdGNoVHlwZShjb25maWd1cmF0aW9uU2VydmljZTogSUNvbmZpZ3VyYXRpb25TZXJ2aWNlKSB7XG5cdGNvbnN0IHZhbHVlID0gY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0VmFsdWU8J2Z1enp5JyB8ICdjb250aWd1b3VzJz4oZGVmYXVsdEZpbmRNYXRjaFR5cGVTZXR0aW5nS2V5KTtcblxuXHRpZiAodmFsdWUgPT09ICdmdXp6eScpIHtcblx0XHRyZXR1cm4gVHJlZUZpbmRNYXRjaFR5cGUuRnV6enk7XG5cdH0gZWxzZSBpZiAodmFsdWUgPT09ICdjb250aWd1b3VzJykge1xuXHRcdHJldHVybiBUcmVlRmluZE1hdGNoVHlwZS5Db250aWd1b3VzO1xuXHR9XG5cdHJldHVybiB1bmRlZmluZWQ7XG59XG5cbmZ1bmN0aW9uIHdvcmtiZW5jaFRyZWVEYXRhUHJlYW1ibGU8VCwgVEZpbHRlckRhdGEsIFRPcHRpb25zIGV4dGVuZHMgSUFic3RyYWN0VHJlZU9wdGlvbnM8VCwgVEZpbHRlckRhdGE+IHwgSUFzeW5jRGF0YVRyZWVPcHRpb25zPFQsIFRGaWx0ZXJEYXRhPj4oXG5cdGFjY2Vzc29yOiBTZXJ2aWNlc0FjY2Vzc29yLFxuXHRvcHRpb25zOiBUT3B0aW9ucyxcbik6IHsgb3B0aW9uczogVE9wdGlvbnM7IGdldFR5cGVOYXZpZ2F0aW9uTW9kZTogKCkgPT4gVHlwZU5hdmlnYXRpb25Nb2RlIHwgdW5kZWZpbmVkOyBkaXNwb3NhYmxlOiBJRGlzcG9zYWJsZSB9IHtcblx0Y29uc3QgY29uZmlndXJhdGlvblNlcnZpY2UgPSBhY2Nlc3Nvci5nZXQoSUNvbmZpZ3VyYXRpb25TZXJ2aWNlKTtcblx0Y29uc3QgY29udGV4dFZpZXdTZXJ2aWNlID0gYWNjZXNzb3IuZ2V0KElDb250ZXh0Vmlld1NlcnZpY2UpO1xuXHRjb25zdCBjb250ZXh0S2V5U2VydmljZSA9IGFjY2Vzc29yLmdldChJQ29udGV4dEtleVNlcnZpY2UpO1xuXHRjb25zdCBpbnN0YW50aWF0aW9uU2VydmljZSA9IGFjY2Vzc29yLmdldChJSW5zdGFudGlhdGlvblNlcnZpY2UpO1xuXG5cdGNvbnN0IGdldFR5cGVOYXZpZ2F0aW9uTW9kZSA9ICgpID0+IHtcblx0XHQvLyBnaXZlIHByaW9yaXR5IHRvIHRoZSBjb250ZXh0IGtleSB2YWx1ZSB0byBzcGVjaWZ5IGEgdmFsdWVcblx0XHRjb25zdCBtb2RlU3RyaW5nID0gY29udGV4dEtleVNlcnZpY2UuZ2V0Q29udGV4dEtleVZhbHVlPCdhdXRvbWF0aWMnIHwgJ3RyaWdnZXInPihXb3JrYmVuY2hMaXN0VHlwZU5hdmlnYXRpb25Nb2RlS2V5KTtcblxuXHRcdGlmIChtb2RlU3RyaW5nID09PSAnYXV0b21hdGljJykge1xuXHRcdFx0cmV0dXJuIFR5cGVOYXZpZ2F0aW9uTW9kZS5BdXRvbWF0aWM7XG5cdFx0fSBlbHNlIGlmIChtb2RlU3RyaW5nID09PSAndHJpZ2dlcicpIHtcblx0XHRcdHJldHVybiBUeXBlTmF2aWdhdGlvbk1vZGUuVHJpZ2dlcjtcblx0XHR9XG5cblx0XHQvLyBhbHNvIGNoZWNrIHRoZSBkZXByZWNhdGVkIGNvbnRleHQga2V5IHRvIHNldCB0aGUgbW9kZSB0byAndHJpZ2dlcidcblx0XHRjb25zdCBtb2RlQm9vbGVhbiA9IGNvbnRleHRLZXlTZXJ2aWNlLmdldENvbnRleHRLZXlWYWx1ZTxib29sZWFuPihXb3JrYmVuY2hMaXN0QXV0b21hdGljS2V5Ym9hcmROYXZpZ2F0aW9uTGVnYWN5S2V5KTtcblxuXHRcdGlmIChtb2RlQm9vbGVhbiA9PT0gZmFsc2UpIHtcblx0XHRcdHJldHVybiBUeXBlTmF2aWdhdGlvbk1vZGUuVHJpZ2dlcjtcblx0XHR9XG5cblx0XHQvLyBmaW5hbGx5LCBjaGVjayB0aGUgc2V0dGluZ1xuXHRcdGNvbnN0IGNvbmZpZ1N0cmluZyA9IGNvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldFZhbHVlPCdhdXRvbWF0aWMnIHwgJ3RyaWdnZXInPih0eXBlTmF2aWdhdGlvbk1vZGVTZXR0aW5nS2V5KTtcblxuXHRcdGlmIChjb25maWdTdHJpbmcgPT09ICdhdXRvbWF0aWMnKSB7XG5cdFx0XHRyZXR1cm4gVHlwZU5hdmlnYXRpb25Nb2RlLkF1dG9tYXRpYztcblx0XHR9IGVsc2UgaWYgKGNvbmZpZ1N0cmluZyA9PT0gJ3RyaWdnZXInKSB7XG5cdFx0XHRyZXR1cm4gVHlwZU5hdmlnYXRpb25Nb2RlLlRyaWdnZXI7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0fTtcblxuXHRjb25zdCBob3Jpem9udGFsU2Nyb2xsaW5nID0gb3B0aW9ucy5ob3Jpem9udGFsU2Nyb2xsaW5nICE9PSB1bmRlZmluZWQgPyBvcHRpb25zLmhvcml6b250YWxTY3JvbGxpbmcgOiBCb29sZWFuKGNvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldFZhbHVlKGhvcml6b250YWxTY3JvbGxpbmdLZXkpKTtcblx0Y29uc3QgW3dvcmtiZW5jaExpc3RPcHRpb25zLCBkaXNwb3NhYmxlXSA9IGluc3RhbnRpYXRpb25TZXJ2aWNlLmludm9rZUZ1bmN0aW9uKHRvV29ya2JlbmNoTGlzdE9wdGlvbnMsIG9wdGlvbnMpO1xuXHRjb25zdCBwYWRkaW5nQm90dG9tID0gb3B0aW9ucy5wYWRkaW5nQm90dG9tO1xuXHRjb25zdCByZW5kZXJJbmRlbnRHdWlkZXMgPSBvcHRpb25zLnJlbmRlckluZGVudEd1aWRlcyAhPT0gdW5kZWZpbmVkID8gb3B0aW9ucy5yZW5kZXJJbmRlbnRHdWlkZXMgOiBjb25maWd1cmF0aW9uU2VydmljZS5nZXRWYWx1ZTxSZW5kZXJJbmRlbnRHdWlkZXM+KHRyZWVSZW5kZXJJbmRlbnRHdWlkZXNLZXkpO1xuXG5cdHJldHVybiB7XG5cdFx0Z2V0VHlwZU5hdmlnYXRpb25Nb2RlLFxuXHRcdGRpc3Bvc2FibGUsXG5cdFx0Ly8gZXNsaW50LWRpc2FibGUtbmV4dC1saW5lIGxvY2FsL2NvZGUtbm8tZGFuZ2Vyb3VzLXR5cGUtYXNzZXJ0aW9uc1xuXHRcdG9wdGlvbnM6IHtcblx0XHRcdC8vIC4uLm9wdGlvbnMsIC8vIFRPRE9ASm9hbyB3aHkgaXMgdGhpcyBub3Qgc3BsYXR0ZWQgaGVyZT9cblx0XHRcdGtleWJvYXJkU3VwcG9ydDogZmFsc2UsXG5cdFx0XHQuLi53b3JrYmVuY2hMaXN0T3B0aW9ucyxcblx0XHRcdGluZGVudDogdHlwZW9mIGNvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldFZhbHVlKHRyZWVJbmRlbnRLZXkpID09PSAnbnVtYmVyJyA/IGNvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldFZhbHVlKHRyZWVJbmRlbnRLZXkpIDogdW5kZWZpbmVkLFxuXHRcdFx0cmVuZGVySW5kZW50R3VpZGVzLFxuXHRcdFx0c21vb3RoU2Nyb2xsaW5nOiBCb29sZWFuKGNvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldFZhbHVlKGxpc3RTbW9vdGhTY3JvbGxpbmcpKSxcblx0XHRcdGRlZmF1bHRGaW5kTW9kZTogb3B0aW9ucy5kZWZhdWx0RmluZE1vZGUgPz8gZ2V0RGVmYXVsdFRyZWVGaW5kTW9kZShjb25maWd1cmF0aW9uU2VydmljZSksXG5cdFx0XHRkZWZhdWx0RmluZE1hdGNoVHlwZTogb3B0aW9ucy5kZWZhdWx0RmluZE1hdGNoVHlwZSA/PyBnZXREZWZhdWx0VHJlZUZpbmRNYXRjaFR5cGUoY29uZmlndXJhdGlvblNlcnZpY2UpLFxuXHRcdFx0aG9yaXpvbnRhbFNjcm9sbGluZyxcblx0XHRcdHNjcm9sbEJ5UGFnZTogQm9vbGVhbihjb25maWd1cmF0aW9uU2VydmljZS5nZXRWYWx1ZShzY3JvbGxCeVBhZ2VLZXkpKSxcblx0XHRcdHBhZGRpbmdCb3R0b206IHBhZGRpbmdCb3R0b20sXG5cdFx0XHRoaWRlVHdpc3RpZXNPZkNoaWxkbGVzc0VsZW1lbnRzOiBvcHRpb25zLmhpZGVUd2lzdGllc09mQ2hpbGRsZXNzRWxlbWVudHMsXG5cdFx0XHRleHBhbmRPbmx5T25Ud2lzdGllQ2xpY2s6IG9wdGlvbnMuZXhwYW5kT25seU9uVHdpc3RpZUNsaWNrID8/IChjb25maWd1cmF0aW9uU2VydmljZS5nZXRWYWx1ZTwnc2luZ2xlQ2xpY2snIHwgJ2RvdWJsZUNsaWNrJz4odHJlZUV4cGFuZE1vZGUpID09PSAnZG91YmxlQ2xpY2snKSxcblx0XHRcdGNvbnRleHRWaWV3UHJvdmlkZXI6IGNvbnRleHRWaWV3U2VydmljZSBhcyBJQ29udGV4dFZpZXdQcm92aWRlcixcblx0XHRcdGZpbmRXaWRnZXRTdHlsZXM6IGRlZmF1bHRGaW5kV2lkZ2V0U3R5bGVzLFxuXHRcdFx0ZW5hYmxlU3RpY2t5U2Nyb2xsOiBCb29sZWFuKGNvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldFZhbHVlKHRyZWVTdGlja3lTY3JvbGwpKSxcblx0XHRcdHN0aWNreVNjcm9sbE1heEl0ZW1Db3VudDogTnVtYmVyKGNvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldFZhbHVlKHRyZWVTdGlja3lTY3JvbGxNYXhFbGVtZW50cykpLFxuXHRcdH0gYXMgVE9wdGlvbnNcblx0fTtcbn1cblxuaW50ZXJmYWNlIElXb3JrYmVuY2hUcmVlSW50ZXJuYWxzT3B0aW9uc1VwZGF0ZSB7XG5cdHJlYWRvbmx5IG11bHRpcGxlU2VsZWN0aW9uU3VwcG9ydD86IGJvb2xlYW47XG59XG5cbmNsYXNzIFdvcmtiZW5jaFRyZWVJbnRlcm5hbHM8VElucHV0LCBULCBURmlsdGVyRGF0YT4ge1xuXG5cdHJlYWRvbmx5IGNvbnRleHRLZXlTZXJ2aWNlOiBJU2NvcGVkQ29udGV4dEtleVNlcnZpY2U7XG5cdHByaXZhdGUgbGlzdFN1cHBvcnRzTXVsdGlTZWxlY3Q6IElDb250ZXh0S2V5PGJvb2xlYW4+O1xuXHRwcml2YXRlIGxpc3RTdXBwb3J0RmluZFdpZGdldDogSUNvbnRleHRLZXk8Ym9vbGVhbj47XG5cdHByaXZhdGUgaGFzU2VsZWN0aW9uT3JGb2N1czogSUNvbnRleHRLZXk8Ym9vbGVhbj47XG5cdHByaXZhdGUgaGFzRG91YmxlU2VsZWN0aW9uOiBJQ29udGV4dEtleTxib29sZWFuPjtcblx0cHJpdmF0ZSBoYXNNdWx0aVNlbGVjdGlvbjogSUNvbnRleHRLZXk8Ym9vbGVhbj47XG5cdHByaXZhdGUgdHJlZUVsZW1lbnRDYW5Db2xsYXBzZTogSUNvbnRleHRLZXk8Ym9vbGVhbj47XG5cdHByaXZhdGUgdHJlZUVsZW1lbnRIYXNQYXJlbnQ6IElDb250ZXh0S2V5PGJvb2xlYW4+O1xuXHRwcml2YXRlIHRyZWVFbGVtZW50Q2FuRXhwYW5kOiBJQ29udGV4dEtleTxib29sZWFuPjtcblx0cHJpdmF0ZSB0cmVlRWxlbWVudEhhc0NoaWxkOiBJQ29udGV4dEtleTxib29sZWFuPjtcblx0cHJpdmF0ZSB0cmVlRmluZE9wZW46IElDb250ZXh0S2V5PGJvb2xlYW4+O1xuXHRwcml2YXRlIHRyZWVTdGlja3lTY3JvbGxGb2N1c2VkOiBJQ29udGV4dEtleTxib29sZWFuPjtcblx0cHJpdmF0ZSBfdXNlQWx0QXNNdWx0aXBsZVNlbGVjdGlvbk1vZGlmaWVyOiBib29sZWFuO1xuXHRwcml2YXRlIGRpc3Bvc2FibGVzOiBJRGlzcG9zYWJsZVtdID0gW107XG5cblx0cHJpdmF0ZSBuYXZpZ2F0b3I6IFRyZWVSZXNvdXJjZU5hdmlnYXRvcjxULCBURmlsdGVyRGF0YT47XG5cblx0Z2V0IG9uRGlkT3BlbigpOiBFdmVudDxJT3BlbkV2ZW50PFQgfCB1bmRlZmluZWQ+PiB7IHJldHVybiB0aGlzLm5hdmlnYXRvci5vbkRpZE9wZW47IH1cblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRwcml2YXRlIHRyZWU6IFdvcmtiZW5jaE9iamVjdFRyZWU8VCwgVEZpbHRlckRhdGE+IHwgV29ya2JlbmNoQ29tcHJlc3NpYmxlT2JqZWN0VHJlZTxULCBURmlsdGVyRGF0YT4gfCBXb3JrYmVuY2hEYXRhVHJlZTxUSW5wdXQsIFQsIFRGaWx0ZXJEYXRhPiB8IFdvcmtiZW5jaEFzeW5jRGF0YVRyZWU8VElucHV0LCBULCBURmlsdGVyRGF0YT4gfCBXb3JrYmVuY2hDb21wcmVzc2libGVBc3luY0RhdGFUcmVlPFRJbnB1dCwgVCwgVEZpbHRlckRhdGE+LFxuXHRcdG9wdGlvbnM6IElXb3JrYmVuY2hPYmplY3RUcmVlT3B0aW9uczxULCBURmlsdGVyRGF0YT4gfCBJV29ya2JlbmNoQ29tcHJlc3NpYmxlT2JqZWN0VHJlZU9wdGlvbnM8VCwgVEZpbHRlckRhdGE+IHwgSVdvcmtiZW5jaERhdGFUcmVlT3B0aW9uczxULCBURmlsdGVyRGF0YT4gfCBJV29ya2JlbmNoQXN5bmNEYXRhVHJlZU9wdGlvbnM8VCwgVEZpbHRlckRhdGE+IHwgSVdvcmtiZW5jaENvbXByZXNzaWJsZUFzeW5jRGF0YVRyZWVPcHRpb25zPFQsIFRGaWx0ZXJEYXRhPixcblx0XHRnZXRUeXBlTmF2aWdhdGlvbk1vZGU6ICgpID0+IFR5cGVOYXZpZ2F0aW9uTW9kZSB8IHVuZGVmaW5lZCxcblx0XHRvdmVycmlkZVN0eWxlczogSVN0eWxlT3ZlcnJpZGU8SUxpc3RTdHlsZXM+IHwgdW5kZWZpbmVkLFxuXHRcdEBJQ29udGV4dEtleVNlcnZpY2UgY29udGV4dEtleVNlcnZpY2U6IElDb250ZXh0S2V5U2VydmljZSxcblx0XHRASUxpc3RTZXJ2aWNlIGxpc3RTZXJ2aWNlOiBJTGlzdFNlcnZpY2UsXG5cdFx0QElDb25maWd1cmF0aW9uU2VydmljZSBjb25maWd1cmF0aW9uU2VydmljZTogSUNvbmZpZ3VyYXRpb25TZXJ2aWNlXG5cdCkge1xuXHRcdHRoaXMuY29udGV4dEtleVNlcnZpY2UgPSBjcmVhdGVTY29wZWRDb250ZXh0S2V5U2VydmljZShjb250ZXh0S2V5U2VydmljZSwgdHJlZSk7XG5cblx0XHR0aGlzLmRpc3Bvc2FibGVzLnB1c2goY3JlYXRlU2Nyb2xsT2JzZXJ2ZXIodGhpcy5jb250ZXh0S2V5U2VydmljZSwgdHJlZSkpO1xuXG5cdFx0dGhpcy5saXN0U3VwcG9ydHNNdWx0aVNlbGVjdCA9IFdvcmtiZW5jaExpc3RTdXBwb3J0c011bHRpU2VsZWN0Q29udGV4dEtleS5iaW5kVG8odGhpcy5jb250ZXh0S2V5U2VydmljZSk7XG5cdFx0dGhpcy5saXN0U3VwcG9ydHNNdWx0aVNlbGVjdC5zZXQob3B0aW9ucy5tdWx0aXBsZVNlbGVjdGlvblN1cHBvcnQgIT09IGZhbHNlKTtcblxuXHRcdGNvbnN0IGxpc3RTZWxlY3Rpb25OYXZpZ2F0aW9uID0gV29ya2JlbmNoTGlzdFNlbGVjdGlvbk5hdmlnYXRpb24uYmluZFRvKHRoaXMuY29udGV4dEtleVNlcnZpY2UpO1xuXHRcdGxpc3RTZWxlY3Rpb25OYXZpZ2F0aW9uLnNldChCb29sZWFuKG9wdGlvbnMuc2VsZWN0aW9uTmF2aWdhdGlvbikpO1xuXG5cdFx0dGhpcy5saXN0U3VwcG9ydEZpbmRXaWRnZXQgPSBXb3JrYmVuY2hMaXN0U3VwcG9ydHNGaW5kLmJpbmRUbyh0aGlzLmNvbnRleHRLZXlTZXJ2aWNlKTtcblx0XHR0aGlzLmxpc3RTdXBwb3J0RmluZFdpZGdldC5zZXQob3B0aW9ucy5maW5kV2lkZ2V0RW5hYmxlZCA/PyB0cnVlKTtcblxuXHRcdHRoaXMuaGFzU2VsZWN0aW9uT3JGb2N1cyA9IFdvcmtiZW5jaExpc3RIYXNTZWxlY3Rpb25PckZvY3VzLmJpbmRUbyh0aGlzLmNvbnRleHRLZXlTZXJ2aWNlKTtcblx0XHR0aGlzLmhhc0RvdWJsZVNlbGVjdGlvbiA9IFdvcmtiZW5jaExpc3REb3VibGVTZWxlY3Rpb24uYmluZFRvKHRoaXMuY29udGV4dEtleVNlcnZpY2UpO1xuXHRcdHRoaXMuaGFzTXVsdGlTZWxlY3Rpb24gPSBXb3JrYmVuY2hMaXN0TXVsdGlTZWxlY3Rpb24uYmluZFRvKHRoaXMuY29udGV4dEtleVNlcnZpY2UpO1xuXG5cdFx0dGhpcy50cmVlRWxlbWVudENhbkNvbGxhcHNlID0gV29ya2JlbmNoVHJlZUVsZW1lbnRDYW5Db2xsYXBzZS5iaW5kVG8odGhpcy5jb250ZXh0S2V5U2VydmljZSk7XG5cdFx0dGhpcy50cmVlRWxlbWVudEhhc1BhcmVudCA9IFdvcmtiZW5jaFRyZWVFbGVtZW50SGFzUGFyZW50LmJpbmRUbyh0aGlzLmNvbnRleHRLZXlTZXJ2aWNlKTtcblx0XHR0aGlzLnRyZWVFbGVtZW50Q2FuRXhwYW5kID0gV29ya2JlbmNoVHJlZUVsZW1lbnRDYW5FeHBhbmQuYmluZFRvKHRoaXMuY29udGV4dEtleVNlcnZpY2UpO1xuXHRcdHRoaXMudHJlZUVsZW1lbnRIYXNDaGlsZCA9IFdvcmtiZW5jaFRyZWVFbGVtZW50SGFzQ2hpbGQuYmluZFRvKHRoaXMuY29udGV4dEtleVNlcnZpY2UpO1xuXG5cdFx0dGhpcy50cmVlRmluZE9wZW4gPSBXb3JrYmVuY2hUcmVlRmluZE9wZW4uYmluZFRvKHRoaXMuY29udGV4dEtleVNlcnZpY2UpO1xuXHRcdHRoaXMudHJlZVN0aWNreVNjcm9sbEZvY3VzZWQgPSBXb3JrYmVuY2hUcmVlU3RpY2t5U2Nyb2xsRm9jdXNlZC5iaW5kVG8odGhpcy5jb250ZXh0S2V5U2VydmljZSk7XG5cblx0XHR0aGlzLl91c2VBbHRBc011bHRpcGxlU2VsZWN0aW9uTW9kaWZpZXIgPSB1c2VBbHRBc011bHRpcGxlU2VsZWN0aW9uTW9kaWZpZXIoY29uZmlndXJhdGlvblNlcnZpY2UpO1xuXG5cdFx0dGhpcy51cGRhdGVTdHlsZU92ZXJyaWRlcyhvdmVycmlkZVN0eWxlcyk7XG5cblx0XHRjb25zdCB1cGRhdGVDb2xsYXBzZUNvbnRleHRLZXlzID0gKCkgPT4ge1xuXHRcdFx0Y29uc3QgZm9jdXMgPSB0cmVlLmdldEZvY3VzKClbMF07XG5cblx0XHRcdGlmICghZm9jdXMpIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXG5cdFx0XHRjb25zdCBub2RlID0gdHJlZS5nZXROb2RlKGZvY3VzKTtcblx0XHRcdHRoaXMudHJlZUVsZW1lbnRDYW5Db2xsYXBzZS5zZXQobm9kZS5jb2xsYXBzaWJsZSAmJiAhbm9kZS5jb2xsYXBzZWQpO1xuXHRcdFx0dGhpcy50cmVlRWxlbWVudEhhc1BhcmVudC5zZXQoISF0cmVlLmdldFBhcmVudEVsZW1lbnQoZm9jdXMpKTtcblx0XHRcdHRoaXMudHJlZUVsZW1lbnRDYW5FeHBhbmQuc2V0KG5vZGUuY29sbGFwc2libGUgJiYgbm9kZS5jb2xsYXBzZWQpO1xuXHRcdFx0dGhpcy50cmVlRWxlbWVudEhhc0NoaWxkLnNldCghIXRyZWUuZ2V0Rmlyc3RFbGVtZW50Q2hpbGQoZm9jdXMpKTtcblx0XHR9O1xuXG5cdFx0Y29uc3QgaW50ZXJlc3RpbmdDb250ZXh0S2V5cyA9IG5ldyBTZXQoKTtcblx0XHRpbnRlcmVzdGluZ0NvbnRleHRLZXlzLmFkZChXb3JrYmVuY2hMaXN0VHlwZU5hdmlnYXRpb25Nb2RlS2V5KTtcblx0XHRpbnRlcmVzdGluZ0NvbnRleHRLZXlzLmFkZChXb3JrYmVuY2hMaXN0QXV0b21hdGljS2V5Ym9hcmROYXZpZ2F0aW9uTGVnYWN5S2V5KTtcblxuXHRcdHRoaXMuZGlzcG9zYWJsZXMucHVzaChcblx0XHRcdHRoaXMuY29udGV4dEtleVNlcnZpY2UsXG5cdFx0XHQobGlzdFNlcnZpY2UgYXMgTGlzdFNlcnZpY2UpLnJlZ2lzdGVyKHRyZWUpLFxuXHRcdFx0dHJlZS5vbkRpZENoYW5nZVNlbGVjdGlvbigoKSA9PiB7XG5cdFx0XHRcdGNvbnN0IHNlbGVjdGlvbiA9IHRyZWUuZ2V0U2VsZWN0aW9uKCk7XG5cdFx0XHRcdGNvbnN0IGZvY3VzID0gdHJlZS5nZXRGb2N1cygpO1xuXG5cdFx0XHRcdHRoaXMuY29udGV4dEtleVNlcnZpY2UuYnVmZmVyQ2hhbmdlRXZlbnRzKCgpID0+IHtcblx0XHRcdFx0XHR0aGlzLmhhc1NlbGVjdGlvbk9yRm9jdXMuc2V0KHNlbGVjdGlvbi5sZW5ndGggPiAwIHx8IGZvY3VzLmxlbmd0aCA+IDApO1xuXHRcdFx0XHRcdHRoaXMuaGFzTXVsdGlTZWxlY3Rpb24uc2V0KHNlbGVjdGlvbi5sZW5ndGggPiAxKTtcblx0XHRcdFx0XHR0aGlzLmhhc0RvdWJsZVNlbGVjdGlvbi5zZXQoc2VsZWN0aW9uLmxlbmd0aCA9PT0gMik7XG5cdFx0XHRcdH0pO1xuXHRcdFx0fSksXG5cdFx0XHR0cmVlLm9uRGlkQ2hhbmdlRm9jdXMoKCkgPT4ge1xuXHRcdFx0XHRjb25zdCBzZWxlY3Rpb24gPSB0cmVlLmdldFNlbGVjdGlvbigpO1xuXHRcdFx0XHRjb25zdCBmb2N1cyA9IHRyZWUuZ2V0Rm9jdXMoKTtcblxuXHRcdFx0XHR0aGlzLmhhc1NlbGVjdGlvbk9yRm9jdXMuc2V0KHNlbGVjdGlvbi5sZW5ndGggPiAwIHx8IGZvY3VzLmxlbmd0aCA+IDApO1xuXHRcdFx0XHR1cGRhdGVDb2xsYXBzZUNvbnRleHRLZXlzKCk7XG5cdFx0XHR9KSxcblx0XHRcdHRyZWUub25EaWRDaGFuZ2VDb2xsYXBzZVN0YXRlKHVwZGF0ZUNvbGxhcHNlQ29udGV4dEtleXMpLFxuXHRcdFx0dHJlZS5vbkRpZENoYW5nZU1vZGVsKHVwZGF0ZUNvbGxhcHNlQ29udGV4dEtleXMpLFxuXHRcdFx0dHJlZS5vbkRpZENoYW5nZUZpbmRPcGVuU3RhdGUoZW5hYmxlZCA9PiB0aGlzLnRyZWVGaW5kT3Blbi5zZXQoZW5hYmxlZCkpLFxuXHRcdFx0dHJlZS5vbkRpZENoYW5nZVN0aWNreVNjcm9sbEZvY3VzZWQoZm9jdXNlZCA9PiB0aGlzLnRyZWVTdGlja3lTY3JvbGxGb2N1c2VkLnNldChmb2N1c2VkKSksXG5cdFx0XHRjb25maWd1cmF0aW9uU2VydmljZS5vbkRpZENoYW5nZUNvbmZpZ3VyYXRpb24oZSA9PiB7XG5cdFx0XHRcdGxldCBuZXdPcHRpb25zOiBJQWJzdHJhY3RUcmVlT3B0aW9uc1VwZGF0ZTx1bmtub3duPiA9IHt9O1xuXHRcdFx0XHRpZiAoZS5hZmZlY3RzQ29uZmlndXJhdGlvbihtdWx0aVNlbGVjdE1vZGlmaWVyU2V0dGluZ0tleSkpIHtcblx0XHRcdFx0XHR0aGlzLl91c2VBbHRBc011bHRpcGxlU2VsZWN0aW9uTW9kaWZpZXIgPSB1c2VBbHRBc011bHRpcGxlU2VsZWN0aW9uTW9kaWZpZXIoY29uZmlndXJhdGlvblNlcnZpY2UpO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGlmIChlLmFmZmVjdHNDb25maWd1cmF0aW9uKHRyZWVJbmRlbnRLZXkpKSB7XG5cdFx0XHRcdFx0Y29uc3QgaW5kZW50ID0gY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0VmFsdWU8bnVtYmVyPih0cmVlSW5kZW50S2V5KTtcblx0XHRcdFx0XHRuZXdPcHRpb25zID0geyAuLi5uZXdPcHRpb25zLCBpbmRlbnQgfTtcblx0XHRcdFx0fVxuXHRcdFx0XHRpZiAoZS5hZmZlY3RzQ29uZmlndXJhdGlvbih0cmVlUmVuZGVySW5kZW50R3VpZGVzS2V5KSAmJiBvcHRpb25zLnJlbmRlckluZGVudEd1aWRlcyA9PT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRcdFx0Y29uc3QgcmVuZGVySW5kZW50R3VpZGVzID0gY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0VmFsdWU8UmVuZGVySW5kZW50R3VpZGVzPih0cmVlUmVuZGVySW5kZW50R3VpZGVzS2V5KTtcblx0XHRcdFx0XHRuZXdPcHRpb25zID0geyAuLi5uZXdPcHRpb25zLCByZW5kZXJJbmRlbnRHdWlkZXMgfTtcblx0XHRcdFx0fVxuXHRcdFx0XHRpZiAoZS5hZmZlY3RzQ29uZmlndXJhdGlvbihsaXN0U21vb3RoU2Nyb2xsaW5nKSkge1xuXHRcdFx0XHRcdGNvbnN0IHNtb290aFNjcm9sbGluZyA9IEJvb2xlYW4oY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0VmFsdWUobGlzdFNtb290aFNjcm9sbGluZykpO1xuXHRcdFx0XHRcdG5ld09wdGlvbnMgPSB7IC4uLm5ld09wdGlvbnMsIHNtb290aFNjcm9sbGluZyB9O1xuXHRcdFx0XHR9XG5cdFx0XHRcdGlmIChlLmFmZmVjdHNDb25maWd1cmF0aW9uKGRlZmF1bHRGaW5kTW9kZVNldHRpbmdLZXkpIHx8IGUuYWZmZWN0c0NvbmZpZ3VyYXRpb24oa2V5Ym9hcmROYXZpZ2F0aW9uU2V0dGluZ0tleSkpIHtcblx0XHRcdFx0XHRjb25zdCBkZWZhdWx0RmluZE1vZGUgPSBnZXREZWZhdWx0VHJlZUZpbmRNb2RlKGNvbmZpZ3VyYXRpb25TZXJ2aWNlKTtcblx0XHRcdFx0XHRuZXdPcHRpb25zID0geyAuLi5uZXdPcHRpb25zLCBkZWZhdWx0RmluZE1vZGUgfTtcblx0XHRcdFx0fVxuXHRcdFx0XHRpZiAoZS5hZmZlY3RzQ29uZmlndXJhdGlvbih0eXBlTmF2aWdhdGlvbk1vZGVTZXR0aW5nS2V5KSB8fCBlLmFmZmVjdHNDb25maWd1cmF0aW9uKGtleWJvYXJkTmF2aWdhdGlvblNldHRpbmdLZXkpKSB7XG5cdFx0XHRcdFx0Y29uc3QgdHlwZU5hdmlnYXRpb25Nb2RlID0gZ2V0VHlwZU5hdmlnYXRpb25Nb2RlKCk7XG5cdFx0XHRcdFx0bmV3T3B0aW9ucyA9IHsgLi4ubmV3T3B0aW9ucywgdHlwZU5hdmlnYXRpb25Nb2RlIH07XG5cdFx0XHRcdH1cblx0XHRcdFx0aWYgKGUuYWZmZWN0c0NvbmZpZ3VyYXRpb24oZGVmYXVsdEZpbmRNYXRjaFR5cGVTZXR0aW5nS2V5KSkge1xuXHRcdFx0XHRcdGNvbnN0IGRlZmF1bHRGaW5kTWF0Y2hUeXBlID0gZ2V0RGVmYXVsdFRyZWVGaW5kTWF0Y2hUeXBlKGNvbmZpZ3VyYXRpb25TZXJ2aWNlKTtcblx0XHRcdFx0XHRuZXdPcHRpb25zID0geyAuLi5uZXdPcHRpb25zLCBkZWZhdWx0RmluZE1hdGNoVHlwZSB9O1xuXHRcdFx0XHR9XG5cdFx0XHRcdGlmIChlLmFmZmVjdHNDb25maWd1cmF0aW9uKGhvcml6b250YWxTY3JvbGxpbmdLZXkpICYmIG9wdGlvbnMuaG9yaXpvbnRhbFNjcm9sbGluZyA9PT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRcdFx0Y29uc3QgaG9yaXpvbnRhbFNjcm9sbGluZyA9IEJvb2xlYW4oY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0VmFsdWUoaG9yaXpvbnRhbFNjcm9sbGluZ0tleSkpO1xuXHRcdFx0XHRcdG5ld09wdGlvbnMgPSB7IC4uLm5ld09wdGlvbnMsIGhvcml6b250YWxTY3JvbGxpbmcgfTtcblx0XHRcdFx0fVxuXHRcdFx0XHRpZiAoZS5hZmZlY3RzQ29uZmlndXJhdGlvbihzY3JvbGxCeVBhZ2VLZXkpKSB7XG5cdFx0XHRcdFx0Y29uc3Qgc2Nyb2xsQnlQYWdlID0gQm9vbGVhbihjb25maWd1cmF0aW9uU2VydmljZS5nZXRWYWx1ZShzY3JvbGxCeVBhZ2VLZXkpKTtcblx0XHRcdFx0XHRuZXdPcHRpb25zID0geyAuLi5uZXdPcHRpb25zLCBzY3JvbGxCeVBhZ2UgfTtcblx0XHRcdFx0fVxuXHRcdFx0XHRpZiAoZS5hZmZlY3RzQ29uZmlndXJhdGlvbih0cmVlRXhwYW5kTW9kZSkgJiYgb3B0aW9ucy5leHBhbmRPbmx5T25Ud2lzdGllQ2xpY2sgPT09IHVuZGVmaW5lZCkge1xuXHRcdFx0XHRcdG5ld09wdGlvbnMgPSB7IC4uLm5ld09wdGlvbnMsIGV4cGFuZE9ubHlPblR3aXN0aWVDbGljazogY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0VmFsdWU8J3NpbmdsZUNsaWNrJyB8ICdkb3VibGVDbGljayc+KHRyZWVFeHBhbmRNb2RlKSA9PT0gJ2RvdWJsZUNsaWNrJyB9O1xuXHRcdFx0XHR9XG5cdFx0XHRcdGlmIChlLmFmZmVjdHNDb25maWd1cmF0aW9uKHRyZWVTdGlja3lTY3JvbGwpKSB7XG5cdFx0XHRcdFx0Y29uc3QgZW5hYmxlU3RpY2t5U2Nyb2xsID0gY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0VmFsdWU8Ym9vbGVhbj4odHJlZVN0aWNreVNjcm9sbCk7XG5cdFx0XHRcdFx0bmV3T3B0aW9ucyA9IHsgLi4ubmV3T3B0aW9ucywgZW5hYmxlU3RpY2t5U2Nyb2xsIH07XG5cdFx0XHRcdH1cblx0XHRcdFx0aWYgKGUuYWZmZWN0c0NvbmZpZ3VyYXRpb24odHJlZVN0aWNreVNjcm9sbE1heEVsZW1lbnRzKSkge1xuXHRcdFx0XHRcdGNvbnN0IHN0aWNreVNjcm9sbE1heEl0ZW1Db3VudCA9IE1hdGgubWF4KDEsIGNvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldFZhbHVlPG51bWJlcj4odHJlZVN0aWNreVNjcm9sbE1heEVsZW1lbnRzKSk7XG5cdFx0XHRcdFx0bmV3T3B0aW9ucyA9IHsgLi4ubmV3T3B0aW9ucywgc3RpY2t5U2Nyb2xsTWF4SXRlbUNvdW50IH07XG5cdFx0XHRcdH1cblx0XHRcdFx0aWYgKGUuYWZmZWN0c0NvbmZpZ3VyYXRpb24obW91c2VXaGVlbFNjcm9sbFNlbnNpdGl2aXR5S2V5KSkge1xuXHRcdFx0XHRcdGNvbnN0IG1vdXNlV2hlZWxTY3JvbGxTZW5zaXRpdml0eSA9IGNvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldFZhbHVlPG51bWJlcj4obW91c2VXaGVlbFNjcm9sbFNlbnNpdGl2aXR5S2V5KTtcblx0XHRcdFx0XHRuZXdPcHRpb25zID0geyAuLi5uZXdPcHRpb25zLCBtb3VzZVdoZWVsU2Nyb2xsU2Vuc2l0aXZpdHkgfTtcblx0XHRcdFx0fVxuXHRcdFx0XHRpZiAoZS5hZmZlY3RzQ29uZmlndXJhdGlvbihmYXN0U2Nyb2xsU2Vuc2l0aXZpdHlLZXkpKSB7XG5cdFx0XHRcdFx0Y29uc3QgZmFzdFNjcm9sbFNlbnNpdGl2aXR5ID0gY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0VmFsdWU8bnVtYmVyPihmYXN0U2Nyb2xsU2Vuc2l0aXZpdHlLZXkpO1xuXHRcdFx0XHRcdG5ld09wdGlvbnMgPSB7IC4uLm5ld09wdGlvbnMsIGZhc3RTY3JvbGxTZW5zaXRpdml0eSB9O1xuXHRcdFx0XHR9XG5cdFx0XHRcdGlmIChPYmplY3Qua2V5cyhuZXdPcHRpb25zKS5sZW5ndGggPiAwKSB7XG5cdFx0XHRcdFx0dHJlZS51cGRhdGVPcHRpb25zKG5ld09wdGlvbnMpO1xuXHRcdFx0XHR9XG5cdFx0XHR9KSxcblx0XHRcdHRoaXMuY29udGV4dEtleVNlcnZpY2Uub25EaWRDaGFuZ2VDb250ZXh0KGUgPT4ge1xuXHRcdFx0XHRpZiAoZS5hZmZlY3RzU29tZShpbnRlcmVzdGluZ0NvbnRleHRLZXlzKSkge1xuXHRcdFx0XHRcdHRyZWUudXBkYXRlT3B0aW9ucyh7IHR5cGVOYXZpZ2F0aW9uTW9kZTogZ2V0VHlwZU5hdmlnYXRpb25Nb2RlKCkgfSk7XG5cdFx0XHRcdH1cblx0XHRcdH0pXG5cdFx0KTtcblxuXHRcdHRoaXMubmF2aWdhdG9yID0gbmV3IFRyZWVSZXNvdXJjZU5hdmlnYXRvcih0cmVlLCB7IGNvbmZpZ3VyYXRpb25TZXJ2aWNlLCAuLi5vcHRpb25zIH0pO1xuXHRcdHRoaXMuZGlzcG9zYWJsZXMucHVzaCh0aGlzLm5hdmlnYXRvcik7XG5cdH1cblxuXHRnZXQgdXNlQWx0QXNNdWx0aXBsZVNlbGVjdGlvbk1vZGlmaWVyKCk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiB0aGlzLl91c2VBbHRBc011bHRpcGxlU2VsZWN0aW9uTW9kaWZpZXI7XG5cdH1cblxuXHR1cGRhdGVPcHRpb25zKG9wdGlvbnM6IElXb3JrYmVuY2hUcmVlSW50ZXJuYWxzT3B0aW9uc1VwZGF0ZSk6IHZvaWQge1xuXHRcdGlmIChvcHRpb25zLm11bHRpcGxlU2VsZWN0aW9uU3VwcG9ydCAhPT0gdW5kZWZpbmVkKSB7XG5cdFx0XHR0aGlzLmxpc3RTdXBwb3J0c011bHRpU2VsZWN0LnNldCghIW9wdGlvbnMubXVsdGlwbGVTZWxlY3Rpb25TdXBwb3J0KTtcblx0XHR9XG5cdH1cblxuXHR1cGRhdGVTdHlsZU92ZXJyaWRlcyhvdmVycmlkZVN0eWxlcz86IElTdHlsZU92ZXJyaWRlPElMaXN0U3R5bGVzPik6IHZvaWQge1xuXHRcdHRoaXMudHJlZS5zdHlsZShvdmVycmlkZVN0eWxlcyA/IGdldExpc3RTdHlsZXMob3ZlcnJpZGVTdHlsZXMpIDogZGVmYXVsdExpc3RTdHlsZXMpO1xuXHR9XG5cblx0ZGlzcG9zZSgpOiB2b2lkIHtcblx0XHR0aGlzLmRpc3Bvc2FibGVzID0gZGlzcG9zZSh0aGlzLmRpc3Bvc2FibGVzKTtcblx0fVxufVxuXG5jb25zdCBjb25maWd1cmF0aW9uUmVnaXN0cnkgPSBSZWdpc3RyeS5hczxJQ29uZmlndXJhdGlvblJlZ2lzdHJ5PihDb25maWd1cmF0aW9uRXh0ZW5zaW9ucy5Db25maWd1cmF0aW9uKTtcblxuY29uZmlndXJhdGlvblJlZ2lzdHJ5LnJlZ2lzdGVyQ29uZmlndXJhdGlvbih7XG5cdGlkOiAnd29ya2JlbmNoJyxcblx0b3JkZXI6IDcsXG5cdHRpdGxlOiBsb2NhbGl6ZSgnd29ya2JlbmNoQ29uZmlndXJhdGlvblRpdGxlJywgXCJXb3JrYmVuY2hcIiksXG5cdHR5cGU6ICdvYmplY3QnLFxuXHRwcm9wZXJ0aWVzOiB7XG5cdFx0W211bHRpU2VsZWN0TW9kaWZpZXJTZXR0aW5nS2V5XToge1xuXHRcdFx0dHlwZTogJ3N0cmluZycsXG5cdFx0XHRlbnVtOiBbJ2N0cmxDbWQnLCAnYWx0J10sXG5cdFx0XHRtYXJrZG93bkVudW1EZXNjcmlwdGlvbnM6IFtcblx0XHRcdFx0bG9jYWxpemUoJ211bHRpU2VsZWN0TW9kaWZpZXIuY3RybENtZCcsIFwiTWFwcyB0byBgQ29udHJvbGAgb24gV2luZG93cyBhbmQgTGludXggYW5kIHRvIGBDb21tYW5kYCBvbiBtYWNPUy5cIiksXG5cdFx0XHRcdGxvY2FsaXplKCdtdWx0aVNlbGVjdE1vZGlmaWVyLmFsdCcsIFwiTWFwcyB0byBgQWx0YCBvbiBXaW5kb3dzIGFuZCBMaW51eCBhbmQgdG8gYE9wdGlvbmAgb24gbWFjT1MuXCIpXG5cdFx0XHRdLFxuXHRcdFx0ZGVmYXVsdDogJ2N0cmxDbWQnLFxuXHRcdFx0ZGVzY3JpcHRpb246IGxvY2FsaXplKHtcblx0XHRcdFx0a2V5OiAnbXVsdGlTZWxlY3RNb2RpZmllcicsXG5cdFx0XHRcdGNvbW1lbnQ6IFtcblx0XHRcdFx0XHQnLSBgY3RybENtZGAgcmVmZXJzIHRvIGEgdmFsdWUgdGhlIHNldHRpbmcgY2FuIHRha2UgYW5kIHNob3VsZCBub3QgYmUgbG9jYWxpemVkLicsXG5cdFx0XHRcdFx0Jy0gYENvbnRyb2xgIGFuZCBgQ29tbWFuZGAgcmVmZXIgdG8gdGhlIG1vZGlmaWVyIGtleXMgQ3RybCBvciBDbWQgb24gdGhlIGtleWJvYXJkIGFuZCBjYW4gYmUgbG9jYWxpemVkLidcblx0XHRcdFx0XVxuXHRcdFx0fSwgXCJUaGUgbW9kaWZpZXIgdG8gYmUgdXNlZCB0byBhZGQgYW4gaXRlbSBpbiB0cmVlcyBhbmQgbGlzdHMgdG8gYSBtdWx0aS1zZWxlY3Rpb24gd2l0aCB0aGUgbW91c2UgKGZvciBleGFtcGxlIGluIHRoZSBleHBsb3Jlciwgb3BlbiBlZGl0b3JzIGFuZCBzY20gdmlldykuIFRoZSAnT3BlbiB0byBTaWRlJyBtb3VzZSBnZXN0dXJlcyAtIGlmIHN1cHBvcnRlZCAtIHdpbGwgYWRhcHQgc3VjaCB0aGF0IHRoZXkgZG8gbm90IGNvbmZsaWN0IHdpdGggdGhlIG11bHRpc2VsZWN0IG1vZGlmaWVyLlwiKVxuXHRcdH0sXG5cdFx0W29wZW5Nb2RlU2V0dGluZ0tleV06IHtcblx0XHRcdHR5cGU6ICdzdHJpbmcnLFxuXHRcdFx0ZW51bTogWydzaW5nbGVDbGljaycsICdkb3VibGVDbGljayddLFxuXHRcdFx0ZGVmYXVsdDogJ3NpbmdsZUNsaWNrJyxcblx0XHRcdGRlc2NyaXB0aW9uOiBsb2NhbGl6ZSh7XG5cdFx0XHRcdGtleTogJ29wZW5Nb2RlTW9kaWZpZXInLFxuXHRcdFx0XHRjb21tZW50OiBbJ2BzaW5nbGVDbGlja2AgYW5kIGBkb3VibGVDbGlja2AgcmVmZXJzIHRvIGEgdmFsdWUgdGhlIHNldHRpbmcgY2FuIHRha2UgYW5kIHNob3VsZCBub3QgYmUgbG9jYWxpemVkLiddXG5cdFx0XHR9LCBcIkNvbnRyb2xzIGhvdyB0byBvcGVuIGl0ZW1zIGluIHRyZWVzIGFuZCBsaXN0cyB1c2luZyB0aGUgbW91c2UgKGlmIHN1cHBvcnRlZCkuIE5vdGUgdGhhdCBzb21lIHRyZWVzIGFuZCBsaXN0cyBtaWdodCBjaG9vc2UgdG8gaWdub3JlIHRoaXMgc2V0dGluZyBpZiBpdCBpcyBub3QgYXBwbGljYWJsZS5cIilcblx0XHR9LFxuXHRcdFtob3Jpem9udGFsU2Nyb2xsaW5nS2V5XToge1xuXHRcdFx0dHlwZTogJ2Jvb2xlYW4nLFxuXHRcdFx0ZGVmYXVsdDogZmFsc2UsXG5cdFx0XHRkZXNjcmlwdGlvbjogbG9jYWxpemUoJ2hvcml6b250YWxTY3JvbGxpbmcgc2V0dGluZycsIFwiQ29udHJvbHMgd2hldGhlciBsaXN0cyBhbmQgdHJlZXMgc3VwcG9ydCBob3Jpem9udGFsIHNjcm9sbGluZyBpbiB0aGUgd29ya2JlbmNoLiBXYXJuaW5nOiB0dXJuaW5nIG9uIHRoaXMgc2V0dGluZyBoYXMgYSBwZXJmb3JtYW5jZSBpbXBsaWNhdGlvbi5cIilcblx0XHR9LFxuXHRcdFtzY3JvbGxCeVBhZ2VLZXldOiB7XG5cdFx0XHR0eXBlOiAnYm9vbGVhbicsXG5cdFx0XHRkZWZhdWx0OiBmYWxzZSxcblx0XHRcdGRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgnbGlzdC5zY3JvbGxCeVBhZ2UnLCBcIkNvbnRyb2xzIHdoZXRoZXIgY2xpY2tzIGluIHRoZSBzY3JvbGxiYXIgc2Nyb2xsIHBhZ2UgYnkgcGFnZS5cIilcblx0XHR9LFxuXHRcdFt0cmVlSW5kZW50S2V5XToge1xuXHRcdFx0dHlwZTogJ251bWJlcicsXG5cdFx0XHRkZWZhdWx0OiA4LFxuXHRcdFx0bWluaW11bTogNCxcblx0XHRcdG1heGltdW06IDQwLFxuXHRcdFx0ZGVzY3JpcHRpb246IGxvY2FsaXplKCd0cmVlIGluZGVudCBzZXR0aW5nJywgXCJDb250cm9scyB0cmVlIGluZGVudGF0aW9uIGluIHBpeGVscy5cIilcblx0XHR9LFxuXHRcdFt0cmVlUmVuZGVySW5kZW50R3VpZGVzS2V5XToge1xuXHRcdFx0dHlwZTogJ3N0cmluZycsXG5cdFx0XHRlbnVtOiBbJ25vbmUnLCAnb25Ib3ZlcicsICdhbHdheXMnXSxcblx0XHRcdGRlZmF1bHQ6ICdvbkhvdmVyJyxcblx0XHRcdGRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgncmVuZGVyIHRyZWUgaW5kZW50IGd1aWRlcycsIFwiQ29udHJvbHMgd2hldGhlciB0aGUgdHJlZSBzaG91bGQgcmVuZGVyIGluZGVudCBndWlkZXMuXCIpXG5cdFx0fSxcblx0XHRbbGlzdFNtb290aFNjcm9sbGluZ106IHtcblx0XHRcdHR5cGU6ICdib29sZWFuJyxcblx0XHRcdGRlZmF1bHQ6IGZhbHNlLFxuXHRcdFx0ZGVzY3JpcHRpb246IGxvY2FsaXplKCdsaXN0IHNtb290aFNjcm9sbGluZyBzZXR0aW5nJywgXCJDb250cm9scyB3aGV0aGVyIGxpc3RzIGFuZCB0cmVlcyBoYXZlIHNtb290aCBzY3JvbGxpbmcuXCIpLFxuXHRcdH0sXG5cdFx0W21vdXNlV2hlZWxTY3JvbGxTZW5zaXRpdml0eUtleV06IHtcblx0XHRcdHR5cGU6ICdudW1iZXInLFxuXHRcdFx0ZGVmYXVsdDogMSxcblx0XHRcdG1hcmtkb3duRGVzY3JpcHRpb246IGxvY2FsaXplKCdNb3VzZSBXaGVlbCBTY3JvbGwgU2Vuc2l0aXZpdHknLCBcIkEgbXVsdGlwbGllciB0byBiZSB1c2VkIG9uIHRoZSBgZGVsdGFYYCBhbmQgYGRlbHRhWWAgb2YgbW91c2Ugd2hlZWwgc2Nyb2xsIGV2ZW50cy5cIilcblx0XHR9LFxuXHRcdFtmYXN0U2Nyb2xsU2Vuc2l0aXZpdHlLZXldOiB7XG5cdFx0XHR0eXBlOiAnbnVtYmVyJyxcblx0XHRcdGRlZmF1bHQ6IDUsXG5cdFx0XHRtYXJrZG93bkRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgnRmFzdCBTY3JvbGwgU2Vuc2l0aXZpdHknLCBcIlNjcm9sbGluZyBzcGVlZCBtdWx0aXBsaWVyIHdoZW4gcHJlc3NpbmcgYEFsdGAuXCIpXG5cdFx0fSxcblx0XHRbZGVmYXVsdEZpbmRNb2RlU2V0dGluZ0tleV06IHtcblx0XHRcdHR5cGU6ICdzdHJpbmcnLFxuXHRcdFx0ZW51bTogWydoaWdobGlnaHQnLCAnZmlsdGVyJ10sXG5cdFx0XHRlbnVtRGVzY3JpcHRpb25zOiBbXG5cdFx0XHRcdGxvY2FsaXplKCdkZWZhdWx0RmluZE1vZGVTZXR0aW5nS2V5LmhpZ2hsaWdodCcsIFwiSGlnaGxpZ2h0IGVsZW1lbnRzIHdoZW4gc2VhcmNoaW5nLiBGdXJ0aGVyIHVwIGFuZCBkb3duIG5hdmlnYXRpb24gd2lsbCB0cmF2ZXJzZSBvbmx5IHRoZSBoaWdobGlnaHRlZCBlbGVtZW50cy5cIiksXG5cdFx0XHRcdGxvY2FsaXplKCdkZWZhdWx0RmluZE1vZGVTZXR0aW5nS2V5LmZpbHRlcicsIFwiRmlsdGVyIGVsZW1lbnRzIHdoZW4gc2VhcmNoaW5nLlwiKVxuXHRcdFx0XSxcblx0XHRcdGRlZmF1bHQ6ICdoaWdobGlnaHQnLFxuXHRcdFx0ZGVzY3JpcHRpb246IGxvY2FsaXplKCdkZWZhdWx0RmluZE1vZGVTZXR0aW5nS2V5JywgXCJDb250cm9scyB0aGUgZGVmYXVsdCBmaW5kIG1vZGUgZm9yIGxpc3RzIGFuZCB0cmVlcyBpbiB0aGUgd29ya2JlbmNoLlwiKVxuXHRcdH0sXG5cdFx0W2tleWJvYXJkTmF2aWdhdGlvblNldHRpbmdLZXldOiB7XG5cdFx0XHR0eXBlOiAnc3RyaW5nJyxcblx0XHRcdGVudW06IFsnc2ltcGxlJywgJ2hpZ2hsaWdodCcsICdmaWx0ZXInXSxcblx0XHRcdGVudW1EZXNjcmlwdGlvbnM6IFtcblx0XHRcdFx0bG9jYWxpemUoJ2tleWJvYXJkTmF2aWdhdGlvblNldHRpbmdLZXkuc2ltcGxlJywgXCJTaW1wbGUga2V5Ym9hcmQgbmF2aWdhdGlvbiBmb2N1c2VzIGVsZW1lbnRzIHdoaWNoIG1hdGNoIHRoZSBrZXlib2FyZCBpbnB1dC4gTWF0Y2hpbmcgaXMgZG9uZSBvbmx5IG9uIHByZWZpeGVzLlwiKSxcblx0XHRcdFx0bG9jYWxpemUoJ2tleWJvYXJkTmF2aWdhdGlvblNldHRpbmdLZXkuaGlnaGxpZ2h0JywgXCJIaWdobGlnaHQga2V5Ym9hcmQgbmF2aWdhdGlvbiBoaWdobGlnaHRzIGVsZW1lbnRzIHdoaWNoIG1hdGNoIHRoZSBrZXlib2FyZCBpbnB1dC4gRnVydGhlciB1cCBhbmQgZG93biBuYXZpZ2F0aW9uIHdpbGwgdHJhdmVyc2Ugb25seSB0aGUgaGlnaGxpZ2h0ZWQgZWxlbWVudHMuXCIpLFxuXHRcdFx0XHRsb2NhbGl6ZSgna2V5Ym9hcmROYXZpZ2F0aW9uU2V0dGluZ0tleS5maWx0ZXInLCBcIkZpbHRlciBrZXlib2FyZCBuYXZpZ2F0aW9uIHdpbGwgZmlsdGVyIG91dCBhbmQgaGlkZSBhbGwgdGhlIGVsZW1lbnRzIHdoaWNoIGRvIG5vdCBtYXRjaCB0aGUga2V5Ym9hcmQgaW5wdXQuXCIpXG5cdFx0XHRdLFxuXHRcdFx0ZGVmYXVsdDogJ2hpZ2hsaWdodCcsXG5cdFx0XHRkZXNjcmlwdGlvbjogbG9jYWxpemUoJ2tleWJvYXJkTmF2aWdhdGlvblNldHRpbmdLZXknLCBcIkNvbnRyb2xzIHRoZSBrZXlib2FyZCBuYXZpZ2F0aW9uIHN0eWxlIGZvciBsaXN0cyBhbmQgdHJlZXMgaW4gdGhlIHdvcmtiZW5jaC4gQ2FuIGJlIHNpbXBsZSwgaGlnaGxpZ2h0IGFuZCBmaWx0ZXIuXCIpLFxuXHRcdFx0ZGVwcmVjYXRlZDogdHJ1ZSxcblx0XHRcdGRlcHJlY2F0aW9uTWVzc2FnZTogbG9jYWxpemUoJ2tleWJvYXJkTmF2aWdhdGlvblNldHRpbmdLZXlEZXByZWNhdGVkJywgXCJQbGVhc2UgdXNlICd3b3JrYmVuY2gubGlzdC5kZWZhdWx0RmluZE1vZGUnIGFuZFx0J3dvcmtiZW5jaC5saXN0LnR5cGVOYXZpZ2F0aW9uTW9kZScgaW5zdGVhZC5cIilcblx0XHR9LFxuXHRcdFtkZWZhdWx0RmluZE1hdGNoVHlwZVNldHRpbmdLZXldOiB7XG5cdFx0XHR0eXBlOiAnc3RyaW5nJyxcblx0XHRcdGVudW06IFsnZnV6enknLCAnY29udGlndW91cyddLFxuXHRcdFx0ZW51bURlc2NyaXB0aW9uczogW1xuXHRcdFx0XHRsb2NhbGl6ZSgnZGVmYXVsdEZpbmRNYXRjaFR5cGVTZXR0aW5nS2V5LmZ1enp5JywgXCJVc2UgZnV6enkgbWF0Y2hpbmcgd2hlbiBzZWFyY2hpbmcuXCIpLFxuXHRcdFx0XHRsb2NhbGl6ZSgnZGVmYXVsdEZpbmRNYXRjaFR5cGVTZXR0aW5nS2V5LmNvbnRpZ3VvdXMnLCBcIlVzZSBjb250aWd1b3VzIG1hdGNoaW5nIHdoZW4gc2VhcmNoaW5nLlwiKVxuXHRcdFx0XSxcblx0XHRcdGRlZmF1bHQ6ICdmdXp6eScsXG5cdFx0XHRkZXNjcmlwdGlvbjogbG9jYWxpemUoJ2RlZmF1bHRGaW5kTWF0Y2hUeXBlU2V0dGluZ0tleScsIFwiQ29udHJvbHMgdGhlIHR5cGUgb2YgbWF0Y2hpbmcgdXNlZCB3aGVuIHNlYXJjaGluZyBsaXN0cyBhbmQgdHJlZXMgaW4gdGhlIHdvcmtiZW5jaC5cIilcblx0XHR9LFxuXHRcdFt0cmVlRXhwYW5kTW9kZV06IHtcblx0XHRcdHR5cGU6ICdzdHJpbmcnLFxuXHRcdFx0ZW51bTogWydzaW5nbGVDbGljaycsICdkb3VibGVDbGljayddLFxuXHRcdFx0ZGVmYXVsdDogJ3NpbmdsZUNsaWNrJyxcblx0XHRcdGRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgnZXhwYW5kIG1vZGUnLCBcIkNvbnRyb2xzIGhvdyB0cmVlIGZvbGRlcnMgYXJlIGV4cGFuZGVkIHdoZW4gY2xpY2tpbmcgdGhlIGZvbGRlciBuYW1lcy4gTm90ZSB0aGF0IHNvbWUgdHJlZXMgYW5kIGxpc3RzIG1pZ2h0IGNob29zZSB0byBpZ25vcmUgdGhpcyBzZXR0aW5nIGlmIGl0IGlzIG5vdCBhcHBsaWNhYmxlLlwiKSxcblx0XHR9LFxuXHRcdFt0cmVlU3RpY2t5U2Nyb2xsXToge1xuXHRcdFx0dHlwZTogJ2Jvb2xlYW4nLFxuXHRcdFx0ZGVmYXVsdDogdHJ1ZSxcblx0XHRcdGRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgnc3RpY2t5IHNjcm9sbCcsIFwiQ29udHJvbHMgd2hldGhlciBzdGlja3kgc2Nyb2xsaW5nIGlzIGVuYWJsZWQgaW4gdHJlZXMuXCIpLFxuXHRcdH0sXG5cdFx0W3RyZWVTdGlja3lTY3JvbGxNYXhFbGVtZW50c106IHtcblx0XHRcdHR5cGU6ICdudW1iZXInLFxuXHRcdFx0bWluaW11bTogMSxcblx0XHRcdGRlZmF1bHQ6IDcsXG5cdFx0XHRtYXJrZG93bkRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgnc3RpY2t5IHNjcm9sbCBtYXhpbXVtIGl0ZW1zJywgXCJDb250cm9scyB0aGUgbnVtYmVyIG9mIHN0aWNreSBlbGVtZW50cyBkaXNwbGF5ZWQgaW4gdGhlIHRyZWUgd2hlbiB7MH0gaXMgZW5hYmxlZC5cIiwgJ2Ajd29ya2JlbmNoLnRyZWUuZW5hYmxlU3RpY2t5U2Nyb2xsI2AnKSxcblx0XHR9LFxuXHRcdFt0eXBlTmF2aWdhdGlvbk1vZGVTZXR0aW5nS2V5XToge1xuXHRcdFx0dHlwZTogJ3N0cmluZycsXG5cdFx0XHRlbnVtOiBbJ2F1dG9tYXRpYycsICd0cmlnZ2VyJ10sXG5cdFx0XHRkZWZhdWx0OiAnYXV0b21hdGljJyxcblx0XHRcdG1hcmtkb3duRGVzY3JpcHRpb246IGxvY2FsaXplKCd0eXBlTmF2aWdhdGlvbk1vZGUyJywgXCJDb250cm9scyBob3cgdHlwZSBuYXZpZ2F0aW9uIHdvcmtzIGluIGxpc3RzIGFuZCB0cmVlcyBpbiB0aGUgd29ya2JlbmNoLiBXaGVuIHNldCB0byBgdHJpZ2dlcmAsIHR5cGUgbmF2aWdhdGlvbiBiZWdpbnMgb25jZSB0aGUgYGxpc3QudHJpZ2dlclR5cGVOYXZpZ2F0aW9uYCBjb21tYW5kIGlzIHJ1bi5cIiksXG5cdFx0fVxuXHR9XG59KTtcbiJdLAogICJtYXBwaW5ncyI6ICI7Ozs7Ozs7Ozs7O0FBS0EsU0FBUyxpQkFBaUIsdUJBQXVCO0FBR2pELFNBQTRDLGlCQUFpQjtBQUM3RCxTQUFrSiw2QkFBNkIsOEJBQThCLE1BQU0sMEJBQTBCO0FBRTdPLFNBQTJELGFBQWE7QUFDeEUsU0FBK0UsbUJBQW1CLG9CQUFvQjtBQUN0SCxTQUFTLGVBQWUsaUNBQStNO0FB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TUFDVCxhQUFhLFNBQVMsZUFBZSxvS0FBb0s7QUFBQSxJQUMxTTtBQUFBLElBQ0EsQ0FBQyxnQkFBZ0IsR0FBRztBQUFBLE1BQ25CLE1BQU07QUFBQSxNQUNOLFNBQVM7QUFBQSxNQUNULGFBQWEsU0FBUyxpQkFBaUIsd0RBQXdEO0FBQUEsSUFDaEc7QUFBQSxJQUNBLENBQUMsMkJBQTJCLEdBQUc7QUFBQSxNQUM5QixNQUFNO0FBQUEsTUFDTixTQUFTO0FBQUEsTUFDVCxTQUFTO0FBQUEsTUFDVCxxQkFBcUIsU0FBUywrQkFBK0IscUZBQXFGLHVDQUF1QztBQUFBLElBQzFMO0FBQUEsSUFDQSxDQUFDLDRCQUE0QixHQUFHO0FBQUEsTUFDL0IsTUFBTTtBQUFBLE1BQ04sTUFBTSxDQUFDLGFBQWEsU0FBUztBQUFBLE1BQzdCLFNBQVM7QUFBQSxNQUNULHFCQUFxQixTQUFTLHVCQUF1Qiw2S0FBNks7QUFBQSxJQUNuTztBQUFBLEVBQ0Q7QUFDRCxDQUFDOyIsCiAgIm5hbWVzIjogWyJvcHRpb25zIiwgImhvcml6b250YWxTY3JvbGxpbmciXQp9Cg==
