import { $, append, clearNode, h, hasParentWithClass, isActiveElement, isKeyboardEvent, addDisposableListener, isEditableElement } from "../../dom.js";
import { createStyleSheet } from "../../domStylesheets.js";
import { asCssValueWithDefault } from "../../cssValue.js";
import { DomEmitter } from "../../event.js";
import { StandardKeyboardEvent } from "../../keyboardEvent.js";
import { ActionBar } from "../actionbar/actionbar.js";
import { FindInput } from "../findinput/findInput.js";
import { MessageType, unthemedInboxStyles } from "../inputbox/inputBox.js";
import { ElementsDragAndDropData } from "../list/listView.js";
import { isActionItem, isButton, isMonacoCustomToggle, isMonacoEditor, isStickyScrollContainer, isStickyScrollElement, List, MouseController } from "../list/listWidget.js";
import { Toggle, unthemedToggleStyles } from "../toggle/toggle.js";
import { getVisibleState, isFilterResult } from "./indexTreeModel.js";
import { TreeDragOverBubble, TreeError, TreeMouseEventTarget, TreeVisibility } from "./tree.js";
import { Action } from "../../../common/actions.js";
import { distinct, equals, insertInto, range } from "../../../common/arrays.js";
import { Delayer, disposableTimeout, timeout } from "../../../common/async.js";
import { Codicon } from "../../../common/codicons.js";
import { ThemeIcon } from "../../../common/themables.js";
import { SetMap } from "../../../common/map.js";
import { Emitter, Event, EventBufferer, Relay } from "../../../common/event.js";
import { fuzzyScore, FuzzyScore } from "../../../common/filters.js";
import { KeyCode } from "../../../common/keyCodes.js";
import { Disposable, DisposableStore, dispose, toDisposable } from "../../../common/lifecycle.js";
import { isMacintosh } from "../../../common/platform.js";
import { clamp } from "../../../common/numbers.js";
import "./media/tree.css";
import { localize } from "../../../../nls.js";
import { autorun, constObservable } from "../../../common/observable.js";
import { alert } from "../aria/aria.js";
class TreeElementsDragAndDropData extends ElementsDragAndDropData {
  constructor(data) {
    super(data.elements.map((node) => node.element));
    this.data = data;
  }
  set context(context) {
    this.data.context = context;
  }
  get context() {
    return this.data.context;
  }
}
function asTreeDragAndDropData(data) {
  if (data instanceof ElementsDragAndDropData) {
    return new TreeElementsDragAndDropData(data);
  }
  return data;
}
class TreeNodeListDragAndDrop {
  constructor(modelProvider, dnd) {
    this.modelProvider = modelProvider;
    this.dnd = dnd;
    this.autoExpandDisposable = Disposable.None;
    this.disposables = new DisposableStore();
  }
  getDragURI(node) {
    return this.dnd.getDragURI(node.element);
  }
  getDragLabel(nodes, originalEvent) {
    if (this.dnd.getDragLabel) {
      return this.dnd.getDragLabel(nodes.map((node) => node.element), originalEvent);
    }
    return void 0;
  }
  onDragStart(data, originalEvent) {
    this.dnd.onDragStart?.(asTreeDragAndDropData(data), originalEvent);
  }
  onDragOver(data, targetNode, targetIndex, targetSector, originalEvent, raw = true) {
    const result = this.dnd.onDragOver(asTreeDragAndDropData(data), targetNode && targetNode.element, targetIndex, targetSector, originalEvent);
    const didChangeAutoExpandNode = this.autoExpandNode !== targetNode;
    if (didChangeAutoExpandNode) {
      this.autoExpandDisposable.dispose();
      this.autoExpandNode = targetNode;
    }
    if (typeof targetNode === "undefined") {
      return result;
    }
    if (didChangeAutoExpandNode && typeof result !== "boolean" && result.autoExpand) {
      this.autoExpandDisposable = disposableTimeout(() => {
        const model2 = this.modelProvider();
        const ref2 = model2.getNodeLocation(targetNode);
        if (model2.isCollapsed(ref2)) {
          model2.setCollapsed(ref2, false);
        }
        this.autoExpandNode = void 0;
      }, 500, this.disposables);
    }
    if (typeof result === "boolean" || !result.accept || typeof result.bubble === "undefined" || result.feedback) {
      if (!raw) {
        const accept = typeof result === "boolean" ? result : result.accept;
        const effect = typeof result === "boolean" ? void 0 : result.effect;
        return { accept, effect, feedback: [targetIndex] };
      }
      return result;
    }
    if (result.bubble === TreeDragOverBubble.Up) {
      const model2 = this.modelProvider();
      const ref2 = model2.getNodeLocation(targetNode);
      const parentRef = model2.getParentNodeLocation(ref2);
      const parentNode = model2.getNode(parentRef);
      const parentIndex = parentRef && model2.getListIndex(parentRef);
      return this.onDragOver(data, parentNode, parentIndex, targetSector, originalEvent, false);
    }
    const model = this.modelProvider();
    const ref = model.getNodeLocation(targetNode);
    const start = model.getListIndex(ref);
    const length = model.getListRenderCount(ref);
    return { ...result, feedback: range(start, start + length) };
  }
  drop(data, targetNode, targetIndex, targetSector, originalEvent) {
    this.autoExpandDisposable.dispose();
    this.autoExpandNode = void 0;
    this.dnd.drop(asTreeDragAndDropData(data), targetNode && targetNode.element, targetIndex, targetSector, originalEvent);
  }
  onDragEnd(originalEvent) {
    this.dnd.onDragEnd?.(originalEvent);
  }
  dispose() {
    this.disposables.dispose();
    this.dnd.dispose();
  }
}
function asListOptions(modelProvider, disposableStore, options) {
  return options && {
    ...options,
    identityProvider: options.identityProvider && {
      getId(el) {
        return options.identityProvider.getId(el.element);
      },
      getGroupId: options.identityProvider.getGroupId ? (el) => {
        return options.identityProvider.getGroupId(el.element);
      } : void 0
    },
    dnd: options.dnd && disposableStore.add(new TreeNodeListDragAndDrop(modelProvider, options.dnd)),
    multipleSelectionController: options.multipleSelectionController && {
      isSelectionSingleChangeEvent(e) {
        return options.multipleSelectionController.isSelectionSingleChangeEvent({ ...e, element: e.element });
      },
      isSelectionRangeChangeEvent(e) {
        return options.multipleSelectionController.isSelectionRangeChangeEvent({ ...e, element: e.element });
      }
    },
    accessibilityProvider: options.accessibilityProvider && {
      ...options.accessibilityProvider,
      getSetSize(node) {
        const model = modelProvider();
        const ref = model.getNodeLocation(node);
        const parentRef = model.getParentNodeLocation(ref);
        const parentNode = model.getNode(parentRef);
        return parentNode.visibleChildrenCount;
      },
      getPosInSet(node) {
        return node.visibleChildIndex + 1;
      },
      isChecked: options.accessibilityProvider && options.accessibilityProvider.isChecked ? (node) => {
        return options.accessibilityProvider.isChecked(node.element);
      } : void 0,
      getRole: options.accessibilityProvider && options.accessibilityProvider.getRole ? (node) => {
        return options.accessibilityProvider.getRole(node.element);
      } : () => "treeitem",
      getAriaLabel(e) {
        return options.accessibilityProvider.getAriaLabel(e.element);
      },
      getWidgetAriaLabel() {
        return options.accessibilityProvider.getWidgetAriaLabel();
      },
      getWidgetRole: options.accessibilityProvider && options.accessibilityProvider.getWidgetRole ? () => options.accessibilityProvider.getWidgetRole() : () => "tree",
      getAriaLevel: options.accessibilityProvider && options.accessibilityProvider.getAriaLevel ? (node) => options.accessibilityProvider.getAriaLevel(node.element) : (node) => {
        return node.depth;
      },
      getActiveDescendantId: options.accessibilityProvider.getActiveDescendantId && ((node) => {
        return options.accessibilityProvider.getActiveDescendantId(node.element);
      })
    },
    keyboardNavigationLabelProvider: options.keyboardNavigationLabelProvider && {
      ...options.keyboardNavigationLabelProvider,
      getKeyboardNavigationLabel(node) {
        return options.keyboardNavigationLabelProvider.getKeyboardNavigationLabel(node.element);
      }
    }
  };
}
class ComposedTreeDelegate {
  constructor(delegate) {
    this.delegate = delegate;
  }
  getHeight(element) {
    return this.delegate.getHeight(element.element);
  }
  getTemplateId(element) {
    return this.delegate.getTemplateId(element.element);
  }
  hasDynamicHeight(element) {
    return !!this.delegate.hasDynamicHeight && this.delegate.hasDynamicHeight(element.element);
  }
  setDynamicHeight(element, height) {
    this.delegate.setDynamicHeight?.(element.element, height);
  }
}
class AbstractTreeViewState {
  static lift(state) {
    return state instanceof AbstractTreeViewState ? state : new AbstractTreeViewState(state);
  }
  static empty(scrollTop = 0) {
    return new AbstractTreeViewState({
      focus: [],
      selection: [],
      expanded: /* @__PURE__ */ Object.create(null),
      scrollTop
    });
  }
  constructor(state) {
    this.focus = new Set(state.focus);
    this.selection = new Set(state.selection);
    if (state.expanded instanceof Array) {
      this.expanded = /* @__PURE__ */ Object.create(null);
      for (const id of state.expanded) {
        this.expanded[id] = 1;
      }
    } else {
      this.expanded = state.expanded;
    }
    this.expanded = state.expanded;
    this.scrollTop = state.scrollTop;
  }
  toJSON() {
    return {
      focus: Array.from(this.focus),
      selection: Array.from(this.selection),
      expanded: this.expanded,
      scrollTop: this.scrollTop
    };
  }
}
var RenderIndentGuides = /* @__PURE__ */ ((RenderIndentGuides2) => {
  RenderIndentGuides2["None"] = "none";
  RenderIndentGuides2["OnHover"] = "onHover";
  RenderIndentGuides2["Always"] = "always";
  return RenderIndentGuides2;
})(RenderIndentGuides || {});
class EventCollection {
  constructor(onDidChange, _elements = []) {
    this._elements = _elements;
    this.disposables = new DisposableStore();
    this.onDidChange = Event.forEach(onDidChange, (elements) => this._elements = elements, this.disposables);
  }
  get elements() {
    return this._elements;
  }
  dispose() {
    this.disposables.dispose();
  }
}
const _TreeRenderer = class _TreeRenderer {
  constructor(renderer, model, onDidChangeCollapseState, activeNodes, renderedIndentGuides, options = {}) {
    this.renderer = renderer;
    this.model = model;
    this.activeNodes = activeNodes;
    this.renderedIndentGuides = renderedIndentGuides;
    this.renderedElements = /* @__PURE__ */ new Map();
    this.renderedNodes = /* @__PURE__ */ new Map();
    this.indent = _TreeRenderer.DefaultIndent;
    this.defaultIndent = _TreeRenderer.DefaultIndent;
    this.hideTwistiesOfChildlessElements = false;
    this.shouldRenderIndentGuides = false;
    this.activeIndentNodes = /* @__PURE__ */ new Set();
    this.indentGuidesDisposable = Disposable.None;
    this.disposables = new DisposableStore();
    this.templateId = renderer.templateId;
    this.updateOptions(options);
    Event.map(onDidChangeCollapseState, (e) => e.node)(this.onDidChangeNodeTwistieState, this, this.disposables);
    renderer.onDidChangeTwistieState?.(this.onDidChangeTwistieState, this, this.disposables);
  }
  updateOptions(options = {}) {
    if (typeof options.defaultIndent !== "undefined") {
      this.defaultIndent = options.defaultIndent;
    }
    if (typeof options.indent !== "undefined" || typeof options.defaultIndent !== "undefined") {
      const indent = typeof options.indent !== "undefined" ? clamp(options.indent, 0, 40) : this.indent;
      const needsRerender = indent !== this.indent || typeof options.defaultIndent !== "undefined";
      if (needsRerender) {
        this.indent = indent;
        for (const [node, templateData] of this.renderedNodes) {
          templateData.indentSize = this.defaultIndent + (node.depth - 1) * this.indent;
          this.renderTreeElement(node, templateData);
        }
      }
    }
    if (typeof options.renderIndentGuides !== "undefined") {
      const shouldRenderIndentGuides = options.renderIndentGuides !== "none" /* None */;
      if (shouldRenderIndentGuides !== this.shouldRenderIndentGuides) {
        this.shouldRenderIndentGuides = shouldRenderIndentGuides;
        for (const [node, templateData] of this.renderedNodes) {
          this._renderIndentGuides(node, templateData);
        }
        this.indentGuidesDisposable.dispose();
        if (shouldRenderIndentGuides) {
          const disposables = new DisposableStore();
          this.activeNodes.onDidChange(this._onDidChangeActiveNodes, this, disposables);
          this.indentGuidesDisposable = disposables;
          this._onDidChangeActiveNodes(this.activeNodes.elements);
        }
      }
    }
    if (typeof options.hideTwistiesOfChildlessElements !== "undefined") {
      this.hideTwistiesOfChildlessElements = options.hideTwistiesOfChildlessElements;
    }
    if (typeof options.twistieAdditionalCssClass !== "undefined") {
      this.twistieAdditionalCssClass = options.twistieAdditionalCssClass;
    }
  }
  renderTemplate(container) {
    if (this.renderer.rowClassName) {
      container.classList.add(this.renderer.rowClassName);
    }
    const el = append(container, $(".monaco-tl-row"));
    const indent = append(el, $(".monaco-tl-indent"));
    const twistie = append(el, $(".monaco-tl-twistie"));
    const contents = append(el, $(".monaco-tl-contents"));
    const templateData = this.renderer.renderTemplate(contents);
    return { container, indent, twistie, indentGuidesDisposable: Disposable.None, indentSize: 0, templateData };
  }
  renderElement(node, index, templateData, details) {
    templateData.indentSize = this.defaultIndent + (node.depth - 1) * this.indent;
    this.renderedNodes.set(node, templateData);
    this.renderedElements.set(node.element, node);
    this.renderTreeElement(node, templateData);
    this.renderer.renderElement(node, index, templateData.templateData, { ...details, indent: templateData.indentSize });
  }
  disposeElement(node, index, templateData, details) {
    templateData.indentGuidesDisposable.dispose();
    this.renderer.disposeElement?.(node, index, templateData.templateData, { ...details, indent: templateData.indentSize });
    if (typeof details?.height === "number") {
      this.renderedNodes.delete(node);
      this.renderedElements.delete(node.element);
    }
  }
  disposeTemplate(templateData) {
    this.renderer.disposeTemplate(templateData.templateData);
  }
  onDidChangeTwistieState(element) {
    const node = this.renderedElements.get(element);
    if (!node) {
      return;
    }
    this.onDidChangeNodeTwistieState(node);
  }
  onDidChangeNodeTwistieState(node) {
    const templateData = this.renderedNodes.get(node);
    if (!templateData) {
      return;
    }
    this._onDidChangeActiveNodes(this.activeNodes.elements);
    this.renderTreeElement(node, templateData);
  }
  renderTreeElement(node, templateData) {
    templateData.twistie.className = templateData.twistie.classList.item(0);
    templateData.twistie.style.paddingLeft = `${templateData.indentSize}px`;
    templateData.indent.style.width = `${templateData.indentSize + this.indent - 16}px`;
    if (node.collapsible) {
      templateData.container.setAttribute("aria-expanded", String(!node.collapsed));
    } else {
      templateData.container.removeAttribute("aria-expanded");
    }
    templateData.twistie.classList.remove(...ThemeIcon.asClassNameArray(Codicon.treeItemExpanded));
    let twistieRendered = false;
    if (this.renderer.renderTwistie) {
      twistieRendered = this.renderer.renderTwistie(node.element, templateData.twistie);
    }
    if (node.collapsible && (!this.hideTwistiesOfChildlessElements || node.visibleChildrenCount > 0)) {
      if (!twistieRendered) {
        templateData.twistie.classList.add(...ThemeIcon.asClassNameArray(Codicon.treeItemExpanded));
      }
      templateData.twistie.classList.add("collapsible");
      templateData.twistie.classList.toggle("collapsed", node.collapsed);
    } else {
      templateData.twistie.classList.remove("collapsible", "collapsed");
    }
    if (this.twistieAdditionalCssClass) {
      const additionalClass = this.twistieAdditionalCssClass(node.element);
      if (additionalClass) {
        templateData.twistie.classList.add(additionalClass);
      }
    }
    this._renderIndentGuides(node, templateData);
  }
  _renderIndentGuides(node, templateData) {
    clearNode(templateData.indent);
    templateData.indentGuidesDisposable.dispose();
    if (!this.shouldRenderIndentGuides) {
      return;
    }
    const disposableStore = new DisposableStore();
    while (true) {
      const ref = this.model.getNodeLocation(node);
      const parentRef = this.model.getParentNodeLocation(ref);
      if (!parentRef) {
        break;
      }
      const parent = this.model.getNode(parentRef);
      const guide = $(".indent-guide", { style: `width: ${this.indent}px` });
      if (this.activeIndentNodes.has(parent)) {
        guide.classList.add("active");
      }
      if (templateData.indent.childElementCount === 0) {
        templateData.indent.appendChild(guide);
      } else {
        templateData.indent.insertBefore(guide, templateData.indent.firstElementChild);
      }
      this.renderedIndentGuides.add(parent, guide);
      disposableStore.add(toDisposable(() => this.renderedIndentGuides.delete(parent, guide)));
      node = parent;
    }
    templateData.indentGuidesDisposable = disposableStore;
  }
  _onDidChangeActiveNodes(nodes) {
    if (!this.shouldRenderIndentGuides) {
      return;
    }
    const set = /* @__PURE__ */ new Set();
    nodes.forEach((node) => {
      const ref = this.model.getNodeLocation(node);
      try {
        const parentRef = this.model.getParentNodeLocation(ref);
        if (node.collapsible && node.children.length > 0 && !node.collapsed) {
          set.add(node);
        } else if (parentRef) {
          set.add(this.model.getNode(parentRef));
        }
      } catch {
      }
    });
    this.activeIndentNodes.forEach((node) => {
      if (!set.has(node)) {
        this.renderedIndentGuides.forEach(node, (line) => line.classList.remove("active"));
      }
    });
    set.forEach((node) => {
      if (!this.activeIndentNodes.has(node)) {
        this.renderedIndentGuides.forEach(node, (line) => line.classList.add("active"));
      }
    });
    this.activeIndentNodes = set;
  }
  dispose() {
    this.renderedNodes.clear();
    this.renderedElements.clear();
    this.indentGuidesDisposable.dispose();
    dispose(this.disposables);
  }
};
_TreeRenderer.DefaultIndent = 8;
let TreeRenderer = _TreeRenderer;
function contiguousFuzzyScore(patternLower, wordLower) {
  const index = wordLower.toLowerCase().indexOf(patternLower);
  let score;
  if (index > -1) {
    score = [Number.MAX_SAFE_INTEGER, 0];
    for (let i = patternLower.length; i > 0; i--) {
      score.push(index + i - 1);
    }
  }
  return score;
}
class FindFilter {
  constructor(_keyboardNavigationLabelProvider, _filter, _defaultFindVisibility) {
    this._keyboardNavigationLabelProvider = _keyboardNavigationLabelProvider;
    this._filter = _filter;
    this._defaultFindVisibility = _defaultFindVisibility;
    this._totalCount = 0;
    this._matchCount = 0;
    this._findMatchType = 0 /* Fuzzy */;
    this._findMode = 0 /* Highlight */;
    this._pattern = "";
    this._lowercasePattern = "";
    this.disposables = new DisposableStore();
  }
  get totalCount() {
    return this._totalCount;
  }
  get matchCount() {
    return this._matchCount;
  }
  set findMatchType(type) {
    this._findMatchType = type;
  }
  get findMatchType() {
    return this._findMatchType;
  }
  set findMode(mode) {
    this._findMode = mode;
  }
  get findMode() {
    return this._findMode;
  }
  set pattern(pattern) {
    this._pattern = pattern;
    this._lowercasePattern = pattern.toLowerCase();
  }
  filter(element, parentVisibility) {
    let visibility = TreeVisibility.Visible;
    if (this._filter) {
      const result = this._filter.filter(element, parentVisibility);
      if (typeof result === "boolean") {
        visibility = result ? TreeVisibility.Visible : TreeVisibility.Hidden;
      } else if (isFilterResult(result)) {
        visibility = getVisibleState(result.visibility);
      } else {
        visibility = result;
      }
      if (visibility === TreeVisibility.Hidden) {
        return false;
      }
    }
    this._totalCount++;
    if (!this._pattern) {
      this._matchCount++;
      return { data: FuzzyScore.Default, visibility };
    }
    const label = this._keyboardNavigationLabelProvider.getKeyboardNavigationLabel(element);
    const labels = Array.isArray(label) ? label : [label];
    for (const l of labels) {
      const labelStr = l && l.toString();
      if (typeof labelStr === "undefined") {
        return { data: FuzzyScore.Default, visibility };
      }
      let score;
      if (this._findMatchType === 1 /* Contiguous */) {
        score = contiguousFuzzyScore(this._lowercasePattern, labelStr.toLowerCase());
      } else {
        score = fuzzyScore(this._pattern, this._lowercasePattern, 0, labelStr, labelStr.toLowerCase(), 0, { firstMatchCanBeWeak: true, boostFullMatch: true });
      }
      if (score) {
        this._matchCount++;
        return labels.length === 1 ? { data: score, visibility } : { data: { label: labelStr, score }, visibility };
      }
    }
    if (this._findMode === 1 /* Filter */) {
      if (typeof this._defaultFindVisibility === "number") {
        return this._defaultFindVisibility;
      } else if (this._defaultFindVisibility) {
        return this._defaultFindVisibility(element);
      } else {
        return TreeVisibility.Recurse;
      }
    } else {
      return { data: FuzzyScore.Default, visibility };
    }
  }
  reset() {
    this._totalCount = 0;
    this._matchCount = 0;
  }
  dispose() {
    dispose(this.disposables);
  }
}
class TreeFindToggle extends Toggle {
  constructor(contribution, opts, hoverLifecycleOptions) {
    super({
      icon: contribution.icon,
      title: contribution.title,
      isChecked: contribution.isChecked,
      inputActiveOptionBorder: opts.inputActiveOptionBorder,
      inputActiveOptionForeground: opts.inputActiveOptionForeground,
      inputActiveOptionBackground: opts.inputActiveOptionBackground,
      hoverLifecycleOptions
    });
    this.id = contribution.id;
  }
}
class FindToggles {
  constructor(startStates) {
    this.stateMap = new Map(startStates.map((state) => [state.id, { ...state }]));
  }
  states() {
    return Array.from(this.stateMap.values());
  }
  get(id) {
    const state = this.stateMap.get(id);
    if (state === void 0) {
      throw new Error(`No state found for toggle id ${id}`);
    }
    return state.isChecked;
  }
  set(id, value) {
    const state = this.stateMap.get(id);
    if (state === void 0) {
      throw new Error(`No state found for toggle id ${id}`);
    }
    if (state.isChecked === value) {
      return false;
    }
    state.isChecked = value;
    return true;
  }
}
const unthemedFindWidgetStyles = {
  inputBoxStyles: unthemedInboxStyles,
  toggleStyles: unthemedToggleStyles,
  listFilterWidgetBackground: void 0,
  listFilterWidgetNoMatchesOutline: void 0,
  listFilterWidgetOutline: void 0,
  listFilterWidgetShadow: void 0
};
var TreeFindMode = /* @__PURE__ */ ((TreeFindMode2) => {
  TreeFindMode2[TreeFindMode2["Highlight"] = 0] = "Highlight";
  TreeFindMode2[TreeFindMode2["Filter"] = 1] = "Filter";
  return TreeFindMode2;
})(TreeFindMode || {});
var TreeFindMatchType = /* @__PURE__ */ ((TreeFindMatchType2) => {
  TreeFindMatchType2[TreeFindMatchType2["Fuzzy"] = 0] = "Fuzzy";
  TreeFindMatchType2[TreeFindMatchType2["Contiguous"] = 1] = "Contiguous";
  return TreeFindMatchType2;
})(TreeFindMatchType || {});
class FindWidget extends Disposable {
  constructor(container, tree, contextViewProvider, placeholder, toggleContributions = [], options) {
    super();
    this.tree = tree;
    this.elements = h(".monaco-tree-type-filter", [
      h(".monaco-tree-type-filter-input@findInput"),
      h(".monaco-tree-type-filter-actionbar@actionbar")
    ]);
    this.toggles = [];
    this._onDidDisable = this._register(new Emitter());
    this.onDidDisable = this._onDidDisable.event;
    container.appendChild(this.elements.root);
    this._register(toDisposable(() => this.elements.root.remove()));
    const styles = options?.styles ?? unthemedFindWidgetStyles;
    if (styles.listFilterWidgetBackground) {
      this.elements.root.style.backgroundColor = styles.listFilterWidgetBackground;
    }
    if (styles.listFilterWidgetShadow) {
      this.elements.root.style.boxShadow = `0 0 8px 2px ${styles.listFilterWidgetShadow}`;
    }
    const hoverLifecycleOptions = { groupId: "abstract-tree" };
    this.toggles = toggleContributions.map((contribution) => this._register(new TreeFindToggle(contribution, styles.toggleStyles, hoverLifecycleOptions)));
    this.onDidToggleChange = Event.any(...this.toggles.map((toggle) => Event.map(toggle.onChange, () => ({ id: toggle.id, isChecked: toggle.checked }))));
    const history = options?.history || [];
    this.findInput = this._register(new FindInput(this.elements.findInput, contextViewProvider, {
      label: localize("type to search", "Type to search"),
      placeholder,
      additionalToggles: this.toggles,
      showCommonFindToggles: false,
      inputBoxStyles: styles.inputBoxStyles,
      toggleStyles: styles.toggleStyles,
      history: new Set(history),
      hoverLifecycleOptions
    }));
    this.actionbar = this._register(new ActionBar(this.elements.actionbar));
    const emitter = this._register(new DomEmitter(this.findInput.inputBox.inputElement, "keydown"));
    const onKeyDown = Event.chain(emitter.event, ($2) => $2.map((e) => new StandardKeyboardEvent(e)));
    this._register(onKeyDown((e) => {
      if (e.equals(KeyCode.Enter)) {
        e.preventDefault();
        e.stopPropagation();
        this.findInput.inputBox.addToHistory();
        this.tree.domFocus();
        return;
      }
      if (e.equals(KeyCode.DownArrow)) {
        e.preventDefault();
        e.stopPropagation();
        if (this.findInput.inputBox.isAtLastInHistory() || this.findInput.inputBox.isNowhereInHistory()) {
          this.findInput.inputBox.addToHistory();
          this.tree.domFocus();
        } else {
          this.findInput.inputBox.showNextValue();
        }
        return;
      }
      if (e.equals(KeyCode.UpArrow)) {
        e.preventDefault();
        e.stopPropagation();
        this.findInput.inputBox.showPreviousValue();
        return;
      }
    }));
    const closeAction = this._register(new Action("close", localize("close", "Close"), "codicon codicon-close", true, () => this.dispose()));
    this.actionbar.push(closeAction, { icon: true, label: false });
    this.onDidChangeValue = this.findInput.onDidChange;
  }
  get value() {
    return this.findInput.inputBox.value;
  }
  set value(value) {
    this.findInput.inputBox.value = value;
  }
  setToggleState(id, checked) {
    const toggle = this.toggles.find((toggle2) => toggle2.id === id);
    if (toggle) {
      toggle.checked = checked;
    }
  }
  setPlaceHolder(placeHolder) {
    this.findInput.inputBox.setPlaceHolder(placeHolder);
  }
  getHistory() {
    return this.findInput.inputBox.getHistory();
  }
  focus() {
    this.findInput.focus();
  }
  select() {
    this.findInput.select();
    this.findInput.inputBox.addToHistory(true);
  }
  showMessage(message) {
    this.findInput.showMessage(message);
  }
  clearMessage() {
    this.findInput.clearMessage();
  }
  async dispose() {
    this._onDidDisable.fire();
    this.elements.root.classList.add("disabled");
    await timeout(300);
    super.dispose();
  }
}
var DefaultTreeToggles = /* @__PURE__ */ ((DefaultTreeToggles2) => {
  DefaultTreeToggles2["Mode"] = "mode";
  DefaultTreeToggles2["MatchType"] = "matchType";
  return DefaultTreeToggles2;
})(DefaultTreeToggles || {});
class AbstractFindController {
  constructor(tree, filter, contextViewProvider, options = {}) {
    this.tree = tree;
    this.filter = filter;
    this.contextViewProvider = contextViewProvider;
    this.options = options;
    this._pattern = "";
    this.previousPattern = "";
    this._onDidChangePattern = new Emitter();
    this.onDidChangePattern = this._onDidChangePattern.event;
    this._onDidChangeOpenState = new Emitter();
    this.onDidChangeOpenState = this._onDidChangeOpenState.event;
    this.enabledDisposables = new DisposableStore();
    this.disposables = new DisposableStore();
    this.toggles = new FindToggles(options.toggles ?? []);
    this._placeholder = options.placeholder ?? localize("type to search", "Type to search");
  }
  get pattern() {
    return this._pattern;
  }
  get placeholder() {
    return this._placeholder;
  }
  set placeholder(value) {
    this._placeholder = value;
    this.widget?.setPlaceHolder(value);
  }
  isOpened() {
    return !!this.widget;
  }
  open() {
    if (this.widget) {
      this.widget.focus();
      this.widget.select();
      return;
    }
    const widgetContainer = this.options.findWidgetContainer ?? this.tree.getHTMLElement();
    if (!this.options.findWidgetContainer) {
      this.tree.updateOptions({ paddingTop: 30 });
    }
    this.widget = new FindWidget(widgetContainer, this.tree, this.contextViewProvider, this.placeholder, this.toggles.states(), { ...this.options, history: this._history });
    this.enabledDisposables.add(this.widget);
    this.widget.onDidChangeValue(this.onDidChangeValue, this, this.enabledDisposables);
    this.widget.onDidDisable(this.close, this, this.enabledDisposables);
    this.widget.onDidToggleChange(this.onDidToggleChange, this, this.enabledDisposables);
    this.widget.focus();
    this.widget.value = this.previousPattern;
    this.widget.select();
    this._onDidChangeOpenState.fire(true);
  }
  close() {
    if (!this.widget) {
      return;
    }
    if (!this.options.findWidgetContainer) {
      this.tree.updateOptions({ paddingTop: 0 });
    }
    this._history = this.widget.getHistory();
    this.widget = void 0;
    this.enabledDisposables.clear();
    this.previousPattern = this.pattern;
    this.onDidChangeValue("");
    this.tree.domFocus();
    this._onDidChangeOpenState.fire(false);
  }
  onDidChangeValue(pattern) {
    this._pattern = pattern;
    this._onDidChangePattern.fire(pattern);
    this.filter.pattern = pattern;
    this.applyPattern(pattern);
  }
  onDidToggleChange(e) {
    this.toggles.set(e.id, e.isChecked);
  }
  updateToggleState(id, checked) {
    this.toggles.set(id, checked);
    this.widget?.setToggleState(id, checked);
  }
  renderMessage(showNotFound, warningMessage) {
    if (showNotFound) {
      if (this.tree.options.showNotFoundMessage ?? true) {
        this.widget?.showMessage({ type: MessageType.WARNING, content: warningMessage ?? localize("not found", "No results found.") });
      } else {
        this.widget?.showMessage({ type: MessageType.WARNING });
      }
    } else {
      this.widget?.clearMessage();
    }
  }
  alertResults(results) {
    if (!results) {
      alert(localize("replFindNoResults", "No results"));
    } else {
      alert(localize("foundResults", "{0} results", results));
    }
  }
  dispose() {
    this._history = void 0;
    this._onDidChangePattern.dispose();
    this.enabledDisposables.dispose();
    this.disposables.dispose();
  }
}
class FindController extends AbstractFindController {
  constructor(tree, filter, contextViewProvider, options = {}) {
    const defaultFindMode = options.defaultFindMode ?? 0 /* Highlight */;
    const defaultFindMatchType = options.defaultFindMatchType ?? 0 /* Fuzzy */;
    const toggleContributions = [{
      id: "mode" /* Mode */,
      icon: Codicon.listFilter,
      title: localize("filter", "Filter"),
      isChecked: defaultFindMode === 1 /* Filter */
    }, {
      id: "matchType" /* MatchType */,
      icon: Codicon.searchFuzzy,
      title: localize("fuzzySearch", "Fuzzy Match"),
      isChecked: defaultFindMatchType === 0 /* Fuzzy */
    }];
    filter.findMatchType = defaultFindMatchType;
    filter.findMode = defaultFindMode;
    super(tree, filter, contextViewProvider, { ...options, toggles: toggleContributions });
    this.filter = filter;
    this._onDidChangeMode = new Emitter();
    this.onDidChangeMode = this._onDidChangeMode.event;
    this._onDidChangeMatchType = new Emitter();
    this.onDidChangeMatchType = this._onDidChangeMatchType.event;
    this.disposables.add(this.tree.onDidChangeModel(() => {
      if (!this.isOpened()) {
        return;
      }
      if (this.pattern.length !== 0) {
        this.tree.refilter();
      }
      this.render();
    }));
    this.disposables.add(this.tree.onWillRefilter(() => this.filter.reset()));
  }
  get mode() {
    return this.toggles.get("mode" /* Mode */) ? 1 /* Filter */ : 0 /* Highlight */;
  }
  set mode(mode) {
    if (mode === this.mode) {
      return;
    }
    const isFilterMode = mode === 1 /* Filter */;
    this.updateToggleState("mode" /* Mode */, isFilterMode);
    this.placeholder = isFilterMode ? localize("type to filter", "Type to filter") : localize("type to search", "Type to search");
    this.filter.findMode = mode;
    this.tree.refilter();
    this.render();
    this._onDidChangeMode.fire(mode);
  }
  get matchType() {
    return this.toggles.get("matchType" /* MatchType */) ? 0 /* Fuzzy */ : 1 /* Contiguous */;
  }
  set matchType(matchType) {
    if (matchType === this.matchType) {
      return;
    }
    this.updateToggleState("matchType" /* MatchType */, matchType === 0 /* Fuzzy */);
    this.filter.findMatchType = matchType;
    this.tree.refilter();
    this.render();
    this._onDidChangeMatchType.fire(matchType);
  }
  updateOptions(optionsUpdate = {}) {
    if (optionsUpdate.defaultFindMode !== void 0) {
      this.mode = optionsUpdate.defaultFindMode;
    }
    if (optionsUpdate.defaultFindMatchType !== void 0) {
      this.matchType = optionsUpdate.defaultFindMatchType;
    }
  }
  applyPattern(pattern) {
    this.tree.refilter();
    if (pattern) {
      this.tree.focusNext(0, true, void 0, (node) => !FuzzyScore.isDefault(node.filterData));
    }
    const focus = this.tree.getFocus();
    if (focus.length > 0) {
      const element = focus[0];
      if (this.tree.getRelativeTop(element) === null) {
        this.tree.reveal(element, 0.5);
      }
    }
    this.render();
  }
  shouldAllowFocus(node) {
    if (!this.isOpened() || !this.pattern) {
      return true;
    }
    if (this.filter.totalCount > 0 && this.filter.matchCount <= 1) {
      return true;
    }
    return !FuzzyScore.isDefault(node.filterData);
  }
  onDidToggleChange(e) {
    if (e.id === "mode" /* Mode */) {
      this.mode = e.isChecked ? 1 /* Filter */ : 0 /* Highlight */;
    } else if (e.id === "matchType" /* MatchType */) {
      this.matchType = e.isChecked ? 0 /* Fuzzy */ : 1 /* Contiguous */;
    }
  }
  render() {
    const noMatches = this.filter.matchCount === 0 && this.filter.totalCount > 0;
    const showNotFound = noMatches && this.pattern.length > 0;
    this.renderMessage(showNotFound);
    if (this.pattern.length) {
      this.alertResults(this.filter.matchCount);
    }
  }
}
function stickyScrollNodeStateEquals(node1, node2) {
  return node1.position === node2.position && stickyScrollNodeEquals(node1, node2);
}
function stickyScrollNodeEquals(node1, node2) {
  return node1.node.element === node2.node.element && node1.startIndex === node2.startIndex && node1.height === node2.height && node1.endIndex === node2.endIndex;
}
class StickyScrollState {
  constructor(stickyNodes = []) {
    this.stickyNodes = stickyNodes;
  }
  get count() {
    return this.stickyNodes.length;
  }
  equal(state) {
    return equals(this.stickyNodes, state.stickyNodes, stickyScrollNodeStateEquals);
  }
  contains(element) {
    return this.stickyNodes.some((node) => node.node.element === element.element);
  }
  lastNodePartiallyVisible() {
    if (this.count === 0) {
      return false;
    }
    const lastStickyNode = this.stickyNodes[this.count - 1];
    if (this.count === 1) {
      return lastStickyNode.position !== 0;
    }
    const secondLastStickyNode = this.stickyNodes[this.count - 2];
    return secondLastStickyNode.position + secondLastStickyNode.height !== lastStickyNode.position;
  }
  animationStateChanged(previousState) {
    if (!equals(this.stickyNodes, previousState.stickyNodes, stickyScrollNodeEquals)) {
      return false;
    }
    if (this.count === 0) {
      return false;
    }
    const lastStickyNode = this.stickyNodes[this.count - 1];
    const previousLastStickyNode = previousState.stickyNodes[previousState.count - 1];
    return lastStickyNode.position !== previousLastStickyNode.position;
  }
}
class DefaultStickyScrollDelegate {
  constrainStickyScrollNodes(stickyNodes, stickyScrollMaxItemCount, maxWidgetHeight) {
    for (let i = 0; i < stickyNodes.length; i++) {
      const stickyNode = stickyNodes[i];
      const stickyNodeBottom = stickyNode.position + stickyNode.height;
      if (stickyNodeBottom > maxWidgetHeight || i >= stickyScrollMaxItemCount) {
        return stickyNodes.slice(0, i);
      }
    }
    return stickyNodes;
  }
}
class StickyScrollController extends Disposable {
  constructor(tree, model, view, renderers, treeDelegate, options = {}) {
    super();
    this.tree = tree;
    this.model = model;
    this.view = view;
    this.treeDelegate = treeDelegate;
    this.maxWidgetViewRatio = 0.4;
    const stickyScrollOptions = this.validateStickySettings(options);
    this.stickyScrollMaxItemCount = stickyScrollOptions.stickyScrollMaxItemCount;
    this.stickyScrollDelegate = options.stickyScrollDelegate ?? new DefaultStickyScrollDelegate();
    this.paddingTop = options.paddingTop ?? 0;
    this._widget = this._register(new StickyScrollWidget(view.getScrollableElement(), view, tree, renderers, treeDelegate, options.accessibilityProvider));
    this.onDidChangeHasFocus = this._widget.onDidChangeHasFocus;
    this.onContextMenu = this._widget.onContextMenu;
    this._register(view.onDidScroll(() => this.update()));
    this._register(view.onDidChangeContentHeight(() => this.update()));
    this._register(tree.onDidChangeCollapseState(() => this.update()));
    this._register(model.onDidSpliceRenderedNodes((e) => {
      const state = this._widget.state;
      if (!state) {
        return;
      }
      const hasRemovedStickyNode = e.deleteCount > 0 && state.stickyNodes.some((stickyNode) => !this.model.has(this.model.getNodeLocation(stickyNode.node)));
      if (hasRemovedStickyNode) {
        this.update();
        return;
      }
      const shouldRerenderStickyNodes = state.stickyNodes.some((stickyNode) => {
        const listIndex = this.model.getListIndex(this.model.getNodeLocation(stickyNode.node));
        return listIndex >= e.start && listIndex < e.start + e.deleteCount && state.contains(stickyNode.node);
      });
      if (shouldRerenderStickyNodes) {
        this._widget.rerender();
      }
    }));
    this.update();
  }
  get height() {
    return this._widget.height;
  }
  get count() {
    return this._widget.count;
  }
  getNode(node) {
    return this._widget.getNode(node);
  }
  getNodeAtHeight(height) {
    let index;
    if (height === 0) {
      index = this.view.firstVisibleIndex;
    } else {
      index = this.view.indexAt(height + this.view.scrollTop);
    }
    if (index < 0 || index >= this.view.length) {
      return void 0;
    }
    return this.view.element(index);
  }
  update() {
    const firstVisibleNode = this.getNodeAtHeight(this.paddingTop);
    if (!firstVisibleNode || this.tree.scrollTop <= this.paddingTop || this.view.renderHeight === 0) {
      this._widget.setState(void 0);
      return;
    }
    const stickyState = this.findStickyState(firstVisibleNode);
    this._widget.setState(stickyState);
  }
  findStickyState(firstVisibleNode) {
    const stickyNodes = [];
    let firstVisibleNodeUnderWidget = firstVisibleNode;
    let stickyNodesHeight = 0;
    let nextStickyNode = this.getNextStickyNode(firstVisibleNodeUnderWidget, void 0, stickyNodesHeight);
    while (nextStickyNode) {
      stickyNodes.push(nextStickyNode);
      stickyNodesHeight += nextStickyNode.height;
      if (stickyNodes.length <= this.stickyScrollMaxItemCount) {
        firstVisibleNodeUnderWidget = this.getNextVisibleNode(nextStickyNode);
        if (!firstVisibleNodeUnderWidget) {
          break;
        }
      }
      nextStickyNode = this.getNextStickyNode(firstVisibleNodeUnderWidget, nextStickyNode.node, stickyNodesHeight);
    }
    const contrainedStickyNodes = this.constrainStickyNodes(stickyNodes);
    return contrainedStickyNodes.length ? new StickyScrollState(contrainedStickyNodes) : void 0;
  }
  getNextVisibleNode(previousStickyNode) {
    return this.getNodeAtHeight(previousStickyNode.position + previousStickyNode.height);
  }
  getNextStickyNode(firstVisibleNodeUnderWidget, previousStickyNode, stickyNodesHeight) {
    const nextStickyNode = this.getAncestorUnderPrevious(firstVisibleNodeUnderWidget, previousStickyNode);
    if (!nextStickyNode) {
      return void 0;
    }
    if (nextStickyNode === firstVisibleNodeUnderWidget) {
      if (!this.nodeIsUncollapsedParent(firstVisibleNodeUnderWidget)) {
        return void 0;
      }
      if (this.nodeTopAlignsWithStickyNodesBottom(firstVisibleNodeUnderWidget, stickyNodesHeight)) {
        return void 0;
      }
    }
    return this.createStickyScrollNode(nextStickyNode, stickyNodesHeight);
  }
  nodeTopAlignsWithStickyNodesBottom(node, stickyNodesHeight) {
    const nodeIndex = this.getNodeIndex(node);
    const elementTop = this.view.getElementTop(nodeIndex);
    const stickyPosition = stickyNodesHeight;
    return this.view.scrollTop === elementTop - stickyPosition;
  }
  createStickyScrollNode(node, currentStickyNodesHeight) {
    const height = this.treeDelegate.getHeight(node);
    const { startIndex, endIndex } = this.getNodeRange(node);
    const position = this.calculateStickyNodePosition(endIndex, currentStickyNodesHeight, height);
    return { node, position, height, startIndex, endIndex };
  }
  getAncestorUnderPrevious(node, previousAncestor = void 0) {
    let currentAncestor = node;
    let parentOfcurrentAncestor = this.getParentNode(currentAncestor);
    while (parentOfcurrentAncestor) {
      if (parentOfcurrentAncestor === previousAncestor) {
        return currentAncestor;
      }
      currentAncestor = parentOfcurrentAncestor;
      parentOfcurrentAncestor = this.getParentNode(currentAncestor);
    }
    if (previousAncestor === void 0) {
      return currentAncestor;
    }
    return void 0;
  }
  calculateStickyNodePosition(lastDescendantIndex, stickyRowPositionTop, stickyNodeHeight) {
    let lastChildRelativeTop = this.view.getRelativeTop(lastDescendantIndex);
    if (lastChildRelativeTop === null && this.view.firstVisibleIndex === lastDescendantIndex && lastDescendantIndex + 1 < this.view.length) {
      const nodeHeight = this.treeDelegate.getHeight(this.view.element(lastDescendantIndex));
      const nextNodeRelativeTop = this.view.getRelativeTop(lastDescendantIndex + 1);
      lastChildRelativeTop = nextNodeRelativeTop ? nextNodeRelativeTop - nodeHeight / this.view.renderHeight : null;
    }
    if (lastChildRelativeTop === null) {
      return stickyRowPositionTop;
    }
    const lastChildNode = this.view.element(lastDescendantIndex);
    const lastChildHeight = this.treeDelegate.getHeight(lastChildNode);
    const topOfLastChild = lastChildRelativeTop * this.view.renderHeight;
    const bottomOfLastChild = topOfLastChild + lastChildHeight;
    if (stickyRowPositionTop + stickyNodeHeight > bottomOfLastChild && stickyRowPositionTop <= bottomOfLastChild) {
      return bottomOfLastChild - stickyNodeHeight;
    }
    return stickyRowPositionTop;
  }
  constrainStickyNodes(stickyNodes) {
    if (stickyNodes.length === 0) {
      return [];
    }
    const maximumStickyWidgetHeight = this.view.renderHeight * this.maxWidgetViewRatio;
    const lastStickyNode = stickyNodes[stickyNodes.length - 1];
    if (stickyNodes.length <= this.stickyScrollMaxItemCount && lastStickyNode.position + lastStickyNode.height <= maximumStickyWidgetHeight) {
      return stickyNodes;
    }
    const constrainedStickyNodes = this.stickyScrollDelegate.constrainStickyScrollNodes(stickyNodes, this.stickyScrollMaxItemCount, maximumStickyWidgetHeight);
    if (!constrainedStickyNodes.length) {
      return [];
    }
    const lastConstrainedStickyNode = constrainedStickyNodes[constrainedStickyNodes.length - 1];
    if (constrainedStickyNodes.length > this.stickyScrollMaxItemCount || lastConstrainedStickyNode.position + lastConstrainedStickyNode.height > maximumStickyWidgetHeight) {
      throw new Error("stickyScrollDelegate violates constraints");
    }
    return constrainedStickyNodes;
  }
  getParentNode(node) {
    const nodeLocation = this.model.getNodeLocation(node);
    const parentLocation = this.model.getParentNodeLocation(nodeLocation);
    return parentLocation ? this.model.getNode(parentLocation) : void 0;
  }
  nodeIsUncollapsedParent(node) {
    const nodeLocation = this.model.getNodeLocation(node);
    return this.model.getListRenderCount(nodeLocation) > 1;
  }
  getNodeIndex(node) {
    const nodeLocation = this.model.getNodeLocation(node);
    const nodeIndex = this.model.getListIndex(nodeLocation);
    return nodeIndex;
  }
  getNodeRange(node) {
    const nodeLocation = this.model.getNodeLocation(node);
    const startIndex = this.model.getListIndex(nodeLocation);
    if (startIndex < 0) {
      throw new Error("Node not found in tree");
    }
    const renderCount = this.model.getListRenderCount(nodeLocation);
    const endIndex = startIndex + renderCount - 1;
    return { startIndex, endIndex };
  }
  nodePositionTopBelowWidget(node) {
    const ancestors = [];
    let currentAncestor = this.getParentNode(node);
    while (currentAncestor) {
      ancestors.push(currentAncestor);
      currentAncestor = this.getParentNode(currentAncestor);
    }
    let widgetHeight = 0;
    for (let i = 0; i < ancestors.length && i < this.stickyScrollMaxItemCount; i++) {
      widgetHeight += this.treeDelegate.getHeight(ancestors[i]);
    }
    return widgetHeight;
  }
  getFocus() {
    return this._widget.getFocus();
  }
  domFocus() {
    this._widget.domFocus();
  }
  // Whether sticky scroll was the last focused part in the tree or not
  focusedLast() {
    return this._widget.focusedLast();
  }
  updateOptions(optionsUpdate = {}) {
    if (optionsUpdate.paddingTop !== void 0) {
      this.paddingTop = optionsUpdate.paddingTop;
    }
    if (optionsUpdate.stickyScrollMaxItemCount !== void 0) {
      const validatedOptions = this.validateStickySettings(optionsUpdate);
      if (this.stickyScrollMaxItemCount !== validatedOptions.stickyScrollMaxItemCount) {
        this.stickyScrollMaxItemCount = validatedOptions.stickyScrollMaxItemCount;
        this.update();
      }
    }
  }
  validateStickySettings(options) {
    let stickyScrollMaxItemCount = 7;
    if (typeof options.stickyScrollMaxItemCount === "number") {
      stickyScrollMaxItemCount = Math.max(options.stickyScrollMaxItemCount, 1);
    }
    return { stickyScrollMaxItemCount };
  }
}
class StickyScrollWidget {
  constructor(container, view, tree, treeRenderers, treeDelegate, accessibilityProvider) {
    this.view = view;
    this.tree = tree;
    this.treeRenderers = treeRenderers;
    this.treeDelegate = treeDelegate;
    this.accessibilityProvider = accessibilityProvider;
    this._previousElements = [];
    this._previousStateDisposables = new DisposableStore();
    this._rootDomNode = $(".monaco-tree-sticky-container.empty");
    container.appendChild(this._rootDomNode);
    const shadow = $(".monaco-tree-sticky-container-shadow");
    this._rootDomNode.appendChild(shadow);
    this.stickyScrollFocus = new StickyScrollFocus(this._rootDomNode, view);
    this.onDidChangeHasFocus = this.stickyScrollFocus.onDidChangeHasFocus;
    this.onContextMenu = this.stickyScrollFocus.onContextMenu;
  }
  get state() {
    return this._previousState;
  }
  get height() {
    if (!this._previousState) {
      return 0;
    }
    const lastElement = this._previousState.stickyNodes[this._previousState.count - 1];
    return lastElement.position + lastElement.height;
  }
  get count() {
    return this._previousState?.count ?? 0;
  }
  getNode(node) {
    return this._previousState?.stickyNodes.find((stickyNode) => stickyNode.node === node);
  }
  setState(state) {
    const wasVisible = !!this._previousState && this._previousState.count > 0;
    const isVisible = !!state && state.count > 0;
    if (!wasVisible && !isVisible || wasVisible && isVisible && this._previousState.equal(state)) {
      return;
    }
    if (wasVisible !== isVisible) {
      this.setVisible(isVisible);
    }
    if (!isVisible) {
      this._previousState = void 0;
      this._previousElements = [];
      this._previousStateDisposables.clear();
      return;
    }
    const lastStickyNode = state.stickyNodes[state.count - 1];
    if (this._previousState && state.animationStateChanged(this._previousState)) {
      this._previousElements[this._previousState.count - 1].style.top = `${lastStickyNode.position}px`;
    } else {
      this.renderState(state);
    }
    this._previousState = state;
    this._rootDomNode.style.height = `${lastStickyNode.position + lastStickyNode.height}px`;
  }
  renderState(state) {
    this._previousStateDisposables.clear();
    const elements = Array(state.count);
    for (let stickyIndex = state.count - 1; stickyIndex >= 0; stickyIndex--) {
      const stickyNode = state.stickyNodes[stickyIndex];
      const { element, disposable } = this.createElement(stickyNode, stickyIndex, state.count);
      elements[stickyIndex] = element;
      this._rootDomNode.appendChild(element);
      this._previousStateDisposables.add(disposable);
    }
    this.stickyScrollFocus.updateElements(elements, state);
    this._previousElements = elements;
  }
  rerender() {
    if (this._previousState) {
      this.renderState(this._previousState);
    }
  }
  createElement(stickyNode, stickyIndex, stickyNodesTotal) {
    const nodeIndex = stickyNode.startIndex;
    const stickyElement = document.createElement("div");
    stickyElement.style.top = `${stickyNode.position}px`;
    if (this.tree.options.setRowHeight !== false) {
      stickyElement.style.height = `${stickyNode.height}px`;
    }
    if (this.tree.options.setRowLineHeight !== false) {
      stickyElement.style.lineHeight = `${stickyNode.height}px`;
    }
    stickyElement.classList.add("monaco-tree-sticky-row");
    stickyElement.classList.add("monaco-list-row");
    stickyElement.setAttribute("data-index", `${nodeIndex}`);
    stickyElement.setAttribute("data-parity", nodeIndex % 2 === 0 ? "even" : "odd");
    stickyElement.setAttribute("id", this.view.getElementID(nodeIndex));
    const accessibilityDisposable = this.setAccessibilityAttributes(stickyElement, stickyNode.node.element, stickyIndex, stickyNodesTotal);
    const nodeTemplateId = this.treeDelegate.getTemplateId(stickyNode.node);
    const renderer = this.treeRenderers.find((renderer2) => renderer2.templateId === nodeTemplateId);
    if (!renderer) {
      throw new Error(`No renderer found for template id ${nodeTemplateId}`);
    }
    let nodeCopy = stickyNode.node;
    if (nodeCopy === this.tree.getNode(this.tree.getNodeLocation(stickyNode.node))) {
      nodeCopy = new Proxy(stickyNode.node, {});
    }
    const templateData = renderer.renderTemplate(stickyElement);
    renderer.renderElement(nodeCopy, stickyNode.startIndex, templateData, { height: stickyNode.height });
    const disposable = toDisposable(() => {
      accessibilityDisposable.dispose();
      renderer.disposeElement(nodeCopy, stickyNode.startIndex, templateData, { height: stickyNode.height });
      renderer.disposeTemplate(templateData);
      stickyElement.remove();
    });
    return { element: stickyElement, disposable };
  }
  setAccessibilityAttributes(container, element, stickyIndex, stickyNodesTotal) {
    if (!this.accessibilityProvider) {
      return Disposable.None;
    }
    if (this.accessibilityProvider.getSetSize) {
      container.setAttribute("aria-setsize", String(this.accessibilityProvider.getSetSize(element, stickyIndex, stickyNodesTotal)));
    }
    if (this.accessibilityProvider.getPosInSet) {
      container.setAttribute("aria-posinset", String(this.accessibilityProvider.getPosInSet(element, stickyIndex)));
    }
    if (this.accessibilityProvider.getRole) {
      container.setAttribute("role", this.accessibilityProvider.getRole(element) ?? "treeitem");
    }
    const ariaLabel = this.accessibilityProvider.getAriaLabel(element);
    const observable = ariaLabel && typeof ariaLabel !== "string" ? ariaLabel : constObservable(ariaLabel);
    const result = autorun((reader) => {
      const value = reader.readObservable(observable);
      if (value) {
        container.setAttribute("aria-label", value);
      } else {
        container.removeAttribute("aria-label");
      }
    });
    if (typeof ariaLabel === "string") {
    } else if (ariaLabel) {
      container.setAttribute("aria-label", ariaLabel.get());
    }
    const ariaLevel = this.accessibilityProvider.getAriaLevel && this.accessibilityProvider.getAriaLevel(element);
    if (typeof ariaLevel === "number") {
      container.setAttribute("aria-level", `${ariaLevel}`);
    }
    container.setAttribute("aria-selected", String(false));
    return result;
  }
  setVisible(visible) {
    this._rootDomNode.classList.toggle("empty", !visible);
    if (!visible) {
      this.stickyScrollFocus.updateElements([], void 0);
    }
  }
  getFocus() {
    return this.stickyScrollFocus.getFocus();
  }
  domFocus() {
    this.stickyScrollFocus.domFocus();
  }
  focusedLast() {
    return this.stickyScrollFocus.focusedLast();
  }
  dispose() {
    this.stickyScrollFocus.dispose();
    this._previousStateDisposables.dispose();
    this._rootDomNode.remove();
  }
}
class StickyScrollFocus extends Disposable {
  constructor(container, view) {
    super();
    this.container = container;
    this.view = view;
    this.focusedIndex = -1;
    this.elements = [];
    this._onDidChangeHasFocus = this._register(new Emitter());
    this.onDidChangeHasFocus = this._onDidChangeHasFocus.event;
    this._onContextMenu = this._register(new Emitter());
    this.onContextMenu = this._onContextMenu.event;
    this._domHasFocus = false;
    this._register(addDisposableListener(this.container, "focus", () => this.onFocus()));
    this._register(addDisposableListener(this.container, "blur", () => this.onBlur()));
    this._register(this.view.onDidFocus(() => this.toggleStickyScrollFocused(false)));
    this._register(this.view.onKeyDown((e) => this.onKeyDown(e)));
    this._register(this.view.onMouseDown((e) => this.onMouseDown(e)));
    this._register(this.view.onContextMenu((e) => this.handleContextMenu(e)));
  }
  get domHasFocus() {
    return this._domHasFocus;
  }
  set domHasFocus(hasFocus) {
    if (hasFocus !== this._domHasFocus) {
      this._onDidChangeHasFocus.fire(hasFocus);
      this._domHasFocus = hasFocus;
    }
  }
  handleContextMenu(e) {
    const target = e.browserEvent.target;
    if (!isStickyScrollContainer(target) && !isStickyScrollElement(target)) {
      if (this.focusedLast()) {
        this.view.domFocus();
      }
      return;
    }
    if (!isKeyboardEvent(e.browserEvent)) {
      if (!this.state) {
        throw new Error("Context menu should not be triggered when state is undefined");
      }
      const stickyIndex = this.state.stickyNodes.findIndex((stickyNode2) => stickyNode2.node.element === e.element?.element);
      if (stickyIndex === -1) {
        throw new Error("Context menu should not be triggered when element is not in sticky scroll widget");
      }
      this.container.focus();
      this.setFocus(stickyIndex);
      return;
    }
    if (!this.state || this.focusedIndex < 0) {
      throw new Error("Context menu key should not be triggered when focus is not in sticky scroll widget");
    }
    const stickyNode = this.state.stickyNodes[this.focusedIndex];
    const element = stickyNode.node.element;
    const anchor = this.elements[this.focusedIndex];
    this._onContextMenu.fire({ element, anchor, browserEvent: e.browserEvent, isStickyScroll: true });
  }
  onKeyDown(e) {
    if (this.domHasFocus && this.state) {
      if (e.key === "ArrowUp") {
        this.setFocusedElement(Math.max(0, this.focusedIndex - 1));
        e.preventDefault();
        e.stopPropagation();
      } else if (e.key === "ArrowDown" || e.key === "ArrowRight") {
        if (this.focusedIndex >= this.state.count - 1) {
          const nodeIndexToFocus = this.state.stickyNodes[this.state.count - 1].startIndex + 1;
          this.view.domFocus();
          this.view.setFocus([nodeIndexToFocus]);
          this.scrollNodeUnderWidget(nodeIndexToFocus, this.state);
        } else {
          this.setFocusedElement(this.focusedIndex + 1);
        }
        e.preventDefault();
        e.stopPropagation();
      }
    }
  }
  onMouseDown(e) {
    const target = e.browserEvent.target;
    if (!isStickyScrollContainer(target) && !isStickyScrollElement(target)) {
      return;
    }
    e.browserEvent.preventDefault();
    e.browserEvent.stopPropagation();
  }
  updateElements(elements, state) {
    if (state && state.count === 0) {
      throw new Error("Sticky scroll state must be undefined when there are no sticky nodes");
    }
    if (state && state.count !== elements.length) {
      throw new Error("Sticky scroll focus received illigel state");
    }
    const previousIndex = this.focusedIndex;
    this.removeFocus();
    this.elements = elements;
    this.state = state;
    if (state) {
      const newFocusedIndex = clamp(previousIndex, 0, state.count - 1);
      this.setFocus(newFocusedIndex);
    } else {
      if (this.domHasFocus) {
        this.view.domFocus();
      }
    }
    this.container.tabIndex = state ? 0 : -1;
  }
  setFocusedElement(stickyIndex) {
    const state = this.state;
    if (!state) {
      throw new Error("Cannot set focus when state is undefined");
    }
    this.setFocus(stickyIndex);
    if (stickyIndex < state.count - 1) {
      return;
    }
    if (state.lastNodePartiallyVisible()) {
      const lastStickyNode = state.stickyNodes[stickyIndex];
      this.scrollNodeUnderWidget(lastStickyNode.endIndex + 1, state);
    }
  }
  scrollNodeUnderWidget(nodeIndex, state) {
    const lastStickyNode = state.stickyNodes[state.count - 1];
    const secondLastStickyNode = state.count > 1 ? state.stickyNodes[state.count - 2] : void 0;
    const elementScrollTop = this.view.getElementTop(nodeIndex);
    const elementTargetViewTop = secondLastStickyNode ? secondLastStickyNode.position + secondLastStickyNode.height + lastStickyNode.height : lastStickyNode.height;
    this.view.scrollTop = elementScrollTop - elementTargetViewTop;
  }
  getFocus() {
    if (!this.state || this.focusedIndex === -1) {
      return void 0;
    }
    return this.state.stickyNodes[this.focusedIndex].node.element;
  }
  domFocus() {
    if (!this.state) {
      throw new Error("Cannot focus when state is undefined");
    }
    this.container.focus();
  }
  focusedLast() {
    if (!this.state) {
      return false;
    }
    return this.view.getHTMLElement().classList.contains("sticky-scroll-focused");
  }
  removeFocus() {
    if (this.focusedIndex === -1) {
      return;
    }
    this.toggleElementFocus(this.elements[this.focusedIndex], false);
    this.focusedIndex = -1;
  }
  setFocus(newFocusIndex) {
    if (0 > newFocusIndex) {
      throw new Error("addFocus() can not remove focus");
    }
    if (!this.state && newFocusIndex >= 0) {
      throw new Error("Cannot set focus index when state is undefined");
    }
    if (this.state && newFocusIndex >= this.state.count) {
      throw new Error("Cannot set focus index to an index that does not exist");
    }
    const oldIndex = this.focusedIndex;
    if (oldIndex >= 0) {
      this.toggleElementFocus(this.elements[oldIndex], false);
    }
    if (newFocusIndex >= 0) {
      this.toggleElementFocus(this.elements[newFocusIndex], true);
    }
    this.focusedIndex = newFocusIndex;
  }
  toggleElementFocus(element, focused) {
    this.toggleElementActiveFocus(element, focused && this.domHasFocus);
    this.toggleElementPassiveFocus(element, focused);
  }
  toggleCurrentElementActiveFocus(focused) {
    if (this.focusedIndex === -1) {
      return;
    }
    this.toggleElementActiveFocus(this.elements[this.focusedIndex], focused);
  }
  toggleElementActiveFocus(element, focused) {
    element.classList.toggle("focused", focused);
  }
  toggleElementPassiveFocus(element, focused) {
    element.classList.toggle("passive-focused", focused);
  }
  toggleStickyScrollFocused(focused) {
    this.view.getHTMLElement().classList.toggle("sticky-scroll-focused", focused);
  }
  onFocus() {
    if (!this.state || this.elements.length === 0) {
      throw new Error("Cannot focus when state is undefined or elements are empty");
    }
    this.domHasFocus = true;
    this.toggleStickyScrollFocused(true);
    this.toggleCurrentElementActiveFocus(true);
    if (this.focusedIndex === -1) {
      this.setFocus(0);
    }
  }
  onBlur() {
    this.domHasFocus = false;
    this.toggleCurrentElementActiveFocus(false);
  }
  dispose() {
    this.toggleStickyScrollFocused(false);
    this._onDidChangeHasFocus.fire(false);
    super.dispose();
  }
}
function asTreeMouseEvent(event) {
  let target = TreeMouseEventTarget.Unknown;
  if (hasParentWithClass(event.browserEvent.target, "monaco-tl-twistie", "monaco-tl-row")) {
    target = TreeMouseEventTarget.Twistie;
  } else if (hasParentWithClass(event.browserEvent.target, "monaco-tl-contents", "monaco-tl-row")) {
    target = TreeMouseEventTarget.Element;
  } else if (hasParentWithClass(event.browserEvent.target, "monaco-tree-type-filter", "monaco-list")) {
    target = TreeMouseEventTarget.Filter;
  }
  return {
    browserEvent: event.browserEvent,
    element: event.element ? event.element.element : null,
    target
  };
}
function asTreeContextMenuEvent(event) {
  const isStickyScroll = isStickyScrollContainer(event.browserEvent.target);
  return {
    element: event.element ? event.element.element : null,
    browserEvent: event.browserEvent,
    anchor: event.anchor,
    isStickyScroll
  };
}
function dfs(node, fn) {
  fn(node);
  node.children.forEach((child) => dfs(child, fn));
}
class Trait {
  constructor(getFirstViewElementWithTrait, identityProvider) {
    this.getFirstViewElementWithTrait = getFirstViewElementWithTrait;
    this.identityProvider = identityProvider;
    this.nodes = [];
    this._onDidChange = new Emitter();
    this.onDidChange = this._onDidChange.event;
  }
  get nodeSet() {
    if (!this._nodeSet) {
      this._nodeSet = this.createNodeSet();
    }
    return this._nodeSet;
  }
  set(nodes, browserEvent) {
    const event = browserEvent;
    if (!event?.__forceEvent && equals(this.nodes, nodes)) {
      return;
    }
    this._set(nodes, false, browserEvent);
  }
  _set(nodes, silent, browserEvent) {
    this.nodes = [...nodes];
    this.elements = void 0;
    this._nodeSet = void 0;
    if (!silent) {
      const that = this;
      this._onDidChange.fire({ get elements() {
        return that.get();
      }, browserEvent });
    }
  }
  get() {
    if (!this.elements) {
      this.elements = this.nodes.map((node) => node.element);
    }
    return [...this.elements];
  }
  getNodes() {
    return this.nodes;
  }
  has(node) {
    return this.nodeSet.has(node);
  }
  onDidModelSplice({ insertedNodes, deletedNodes }) {
    if (!this.identityProvider) {
      const set = this.createNodeSet();
      const visit = (node) => set.delete(node);
      deletedNodes.forEach((node) => dfs(node, visit));
      this.set([...set.values()]);
      return;
    }
    const deletedNodesIdSet = /* @__PURE__ */ new Set();
    const deletedNodesVisitor = (node) => deletedNodesIdSet.add(this.identityProvider.getId(node.element).toString());
    deletedNodes.forEach((node) => dfs(node, deletedNodesVisitor));
    const insertedNodesMap = /* @__PURE__ */ new Map();
    const insertedNodesVisitor = (node) => insertedNodesMap.set(this.identityProvider.getId(node.element).toString(), node);
    insertedNodes.forEach((node) => dfs(node, insertedNodesVisitor));
    const nodes = [];
    for (const node of this.nodes) {
      const id = this.identityProvider.getId(node.element).toString();
      const wasDeleted = deletedNodesIdSet.has(id);
      if (!wasDeleted) {
        nodes.push(node);
      } else {
        const insertedNode = insertedNodesMap.get(id);
        if (insertedNode && insertedNode.visible) {
          nodes.push(insertedNode);
        }
      }
    }
    if (this.nodes.length > 0 && nodes.length === 0) {
      const node = this.getFirstViewElementWithTrait();
      if (node) {
        nodes.push(node);
      }
    }
    this._set(nodes, true);
  }
  createNodeSet() {
    const set = /* @__PURE__ */ new Set();
    for (const node of this.nodes) {
      set.add(node);
    }
    return set;
  }
}
class TreeNodeListMouseController extends MouseController {
  constructor(list, tree, stickyScrollProvider) {
    super(list);
    this.tree = tree;
    this.stickyScrollProvider = stickyScrollProvider;
  }
  onViewPointer(e) {
    if (isButton(e.browserEvent.target) || isEditableElement(e.browserEvent.target) || isMonacoEditor(e.browserEvent.target)) {
      return;
    }
    if (e.browserEvent.isHandledByList) {
      return;
    }
    const node = e.element;
    if (!node) {
      return super.onViewPointer(e);
    }
    if (this.isSelectionRangeChangeEvent(e) || this.isSelectionSingleChangeEvent(e)) {
      return super.onViewPointer(e);
    }
    const target = e.browserEvent.target;
    const onTwistie = target.classList.contains("monaco-tl-twistie") || target.classList.contains("monaco-icon-label") && target.classList.contains("folder-icon") && e.browserEvent.offsetX < 16;
    const isStickyElement = isStickyScrollElement(e.browserEvent.target);
    let expandOnlyOnTwistieClick = false;
    if (isStickyElement) {
      expandOnlyOnTwistieClick = true;
    } else if (typeof this.tree.expandOnlyOnTwistieClick === "function") {
      expandOnlyOnTwistieClick = this.tree.expandOnlyOnTwistieClick(node.element);
    } else {
      expandOnlyOnTwistieClick = !!this.tree.expandOnlyOnTwistieClick;
    }
    if (!isStickyElement) {
      if (expandOnlyOnTwistieClick && !onTwistie && e.browserEvent.detail !== 2) {
        return super.onViewPointer(e);
      }
      if (!this.tree.expandOnDoubleClick && e.browserEvent.detail === 2) {
        return super.onViewPointer(e);
      }
    } else {
      this.handleStickyScrollMouseEvent(e, node);
    }
    if (node.collapsible && (!isStickyElement || onTwistie)) {
      const location = this.tree.getNodeLocation(node);
      const recursive = e.browserEvent.altKey;
      this.tree.setFocus([location]);
      this.tree.toggleCollapsed(location, recursive);
      if (onTwistie) {
        e.browserEvent.isHandledByList = true;
        return;
      }
    }
    if (!isStickyElement) {
      super.onViewPointer(e);
    }
  }
  handleStickyScrollMouseEvent(e, node) {
    if (isMonacoCustomToggle(e.browserEvent.target) || isActionItem(e.browserEvent.target)) {
      return;
    }
    const stickyScrollController = this.stickyScrollProvider();
    if (!stickyScrollController) {
      throw new Error("Sticky scroll controller not found");
    }
    const nodeIndex = this.list.indexOf(node);
    const elementScrollTop = this.list.getElementTop(nodeIndex);
    const elementTargetViewTop = stickyScrollController.nodePositionTopBelowWidget(node);
    this.tree.scrollTop = elementScrollTop - elementTargetViewTop;
    this.list.domFocus();
    this.list.setFocus([nodeIndex]);
    this.list.setSelection([nodeIndex]);
  }
  onDoubleClick(e) {
    const onTwistie = e.browserEvent.target.classList.contains("monaco-tl-twistie");
    if (onTwistie || !this.tree.expandOnDoubleClick) {
      return;
    }
    if (e.browserEvent.isHandledByList) {
      return;
    }
    super.onDoubleClick(e);
  }
  // to make sure dom focus is not stolen (for example with context menu)
  onMouseDown(e) {
    const target = e.browserEvent.target;
    if (!isStickyScrollContainer(target) && !isStickyScrollElement(target)) {
      super.onMouseDown(e);
      return;
    }
  }
  onContextMenu(e) {
    const target = e.browserEvent.target;
    if (!isStickyScrollContainer(target) && !isStickyScrollElement(target)) {
      super.onContextMenu(e);
      return;
    }
  }
}
class TreeNodeList extends List {
  constructor(user, container, virtualDelegate, renderers, focusTrait, selectionTrait, anchorTrait, options) {
    super(user, container, virtualDelegate, renderers, options);
    this.focusTrait = focusTrait;
    this.selectionTrait = selectionTrait;
    this.anchorTrait = anchorTrait;
  }
  createMouseController(options) {
    return new TreeNodeListMouseController(this, options.tree, options.stickyScrollProvider);
  }
  splice(start, deleteCount, elements = []) {
    super.splice(start, deleteCount, elements);
    if (elements.length === 0) {
      return;
    }
    const additionalFocus = [];
    const additionalSelection = [];
    let anchor;
    elements.forEach((node, index) => {
      if (this.focusTrait.has(node)) {
        additionalFocus.push(start + index);
      }
      if (this.selectionTrait.has(node)) {
        additionalSelection.push(start + index);
      }
      if (this.anchorTrait.has(node)) {
        anchor = start + index;
      }
    });
    if (additionalFocus.length > 0) {
      super.setFocus(distinct([...super.getFocus(), ...additionalFocus]));
    }
    if (additionalSelection.length > 0) {
      super.setSelection(distinct([...super.getSelection(), ...additionalSelection]));
    }
    if (typeof anchor === "number") {
      super.setAnchor(anchor);
    }
  }
  setFocus(indexes, browserEvent, fromAPI = false) {
    super.setFocus(indexes, browserEvent);
    if (!fromAPI) {
      this.focusTrait.set(indexes.map((i) => this.element(i)), browserEvent);
    }
  }
  setSelection(indexes, browserEvent, fromAPI = false) {
    super.setSelection(indexes, browserEvent);
    if (!fromAPI) {
      this.selectionTrait.set(indexes.map((i) => this.element(i)), browserEvent);
    }
  }
  setAnchor(index, fromAPI = false) {
    super.setAnchor(index);
    if (!fromAPI) {
      if (typeof index === "undefined") {
        this.anchorTrait.set([]);
      } else {
        this.anchorTrait.set([this.element(index)]);
      }
    }
  }
}
var AbstractTreePart = /* @__PURE__ */ ((AbstractTreePart2) => {
  AbstractTreePart2[AbstractTreePart2["Tree"] = 0] = "Tree";
  AbstractTreePart2[AbstractTreePart2["StickyScroll"] = 1] = "StickyScroll";
  return AbstractTreePart2;
})(AbstractTreePart || {});
class AbstractTree {
  constructor(_user, container, delegate, renderers, _options = {}) {
    this._user = _user;
    this._options = _options;
    this.eventBufferer = new EventBufferer();
    this.onDidChangeFindOpenState = Event.None;
    this.onDidChangeStickyScrollFocused = Event.None;
    this.disposables = new DisposableStore();
    this.onDidSwapModel = this.disposables.add(new Emitter());
    this.onDidChangeModelRelay = this.disposables.add(new Relay());
    this.onDidSpliceModelRelay = this.disposables.add(new Relay());
    this.onDidChangeCollapseStateRelay = this.disposables.add(new Relay());
    this.onDidChangeRenderNodeCountRelay = this.disposables.add(new Relay());
    this.onDidChangeActiveNodesRelay = this.disposables.add(new Relay());
    this._onWillRefilter = new Emitter();
    this.onWillRefilter = this._onWillRefilter.event;
    this._onDidUpdateOptions = new Emitter();
    this.onDidUpdateOptions = this._onDidUpdateOptions.event;
    this.modelDisposables = new DisposableStore();
    if (_options.keyboardNavigationLabelProvider && (_options.findWidgetEnabled ?? true)) {
      this.findFilter = new FindFilter(_options.keyboardNavigationLabelProvider, _options.filter, _options.defaultFindVisibility);
      _options = { ..._options, filter: this.findFilter };
      this.disposables.add(this.findFilter);
    }
    this.model = this.createModel(_user, _options);
    this.treeDelegate = new ComposedTreeDelegate(delegate);
    const activeNodes = this.disposables.add(new EventCollection(this.onDidChangeActiveNodesRelay.event));
    const renderedIndentGuides = new SetMap();
    this.renderers = renderers.map((r) => new TreeRenderer(r, this.model, this.onDidChangeCollapseStateRelay.event, activeNodes, renderedIndentGuides, _options));
    for (const r of this.renderers) {
      this.disposables.add(r);
    }
    this.focus = new Trait(() => this.view.getFocusedElements()[0], _options.identityProvider);
    this.selection = new Trait(() => this.view.getSelectedElements()[0], _options.identityProvider);
    this.anchor = new Trait(() => this.view.getAnchorElement(), _options.identityProvider);
    this.view = new TreeNodeList(_user, container, this.treeDelegate, this.renderers, this.focus, this.selection, this.anchor, { ...asListOptions(() => this.model, this.disposables, _options), tree: this, stickyScrollProvider: () => this.stickyScrollController });
    this.setupModel(this.model);
    if (_options.keyboardSupport !== false) {
      const onKeyDown = Event.chain(
        this.view.onKeyDown,
        ($2) => $2.filter((e) => !isEditableElement(e.target)).map((e) => new StandardKeyboardEvent(e))
      );
      Event.chain(onKeyDown, ($2) => $2.filter((e) => e.keyCode === KeyCode.LeftArrow))(this.onLeftArrow, this, this.disposables);
      Event.chain(onKeyDown, ($2) => $2.filter((e) => e.keyCode === KeyCode.RightArrow))(this.onRightArrow, this, this.disposables);
      Event.chain(onKeyDown, ($2) => $2.filter((e) => e.keyCode === KeyCode.Space))(this.onSpace, this, this.disposables);
    }
    if ((_options.findWidgetEnabled ?? true) && _options.keyboardNavigationLabelProvider && _options.contextViewProvider) {
      const findOptions = {
        styles: _options.findWidgetStyles,
        defaultFindMode: _options.defaultFindMode,
        defaultFindMatchType: _options.defaultFindMatchType,
        showNotFoundMessage: _options.showNotFoundMessage,
        findWidgetContainer: _options.findWidgetContainer
      };
      this.findController = this.disposables.add(new FindController(this, this.findFilter, _options.contextViewProvider, findOptions));
      this.focusNavigationFilter = (node) => this.findController.shouldAllowFocus(node);
      this.onDidChangeFindOpenState = this.findController.onDidChangeOpenState;
      this.onDidChangeFindMode = this.findController.onDidChangeMode;
      this.onDidChangeFindMatchType = this.findController.onDidChangeMatchType;
    } else {
      this.onDidChangeFindMode = Event.None;
      this.onDidChangeFindMatchType = Event.None;
    }
    if (_options.enableStickyScroll) {
      this.stickyScrollController = new StickyScrollController(this, this.model, this.view, this.renderers, this.treeDelegate, _options);
      this.onDidChangeStickyScrollFocused = this.stickyScrollController.onDidChangeHasFocus;
    }
    this.styleElement = createStyleSheet(this.view.getHTMLElement());
    this.getHTMLElement().classList.toggle("always", this._options.renderIndentGuides === "always" /* Always */);
  }
  get onDidScroll() {
    return this.view.onDidScroll;
  }
  get onDidChangeFocus() {
    return this.eventBufferer.wrapEvent(this.focus.onDidChange);
  }
  get onDidChangeSelection() {
    return this.eventBufferer.wrapEvent(this.selection.onDidChange);
  }
  get onMouseClick() {
    return Event.map(this.view.onMouseClick, asTreeMouseEvent);
  }
  get onMouseDblClick() {
    return Event.filter(Event.map(this.view.onMouseDblClick, asTreeMouseEvent), (e) => e.target !== TreeMouseEventTarget.Filter);
  }
  get onMouseMiddleClick() {
    return Event.filter(Event.map(this.view.onMouseMiddleClick, asTreeMouseEvent), (e) => e.target !== TreeMouseEventTarget.Filter);
  }
  get onMouseOver() {
    return Event.map(this.view.onMouseOver, asTreeMouseEvent);
  }
  get onMouseOut() {
    return Event.map(this.view.onMouseOut, asTreeMouseEvent);
  }
  get onContextMenu() {
    return Event.any(Event.filter(Event.map(this.view.onContextMenu, asTreeContextMenuEvent), (e) => !e.isStickyScroll), this.stickyScrollController?.onContextMenu ?? Event.None);
  }
  get onTap() {
    return Event.map(this.view.onTap, asTreeMouseEvent);
  }
  get onPointer() {
    return Event.map(this.view.onPointer, asTreeMouseEvent);
  }
  get onKeyDown() {
    return this.view.onKeyDown;
  }
  get onKeyUp() {
    return this.view.onKeyUp;
  }
  get onKeyPress() {
    return this.view.onKeyPress;
  }
  get onDidFocus() {
    return this.view.onDidFocus;
  }
  get onDidBlur() {
    return this.view.onDidBlur;
  }
  get onDidChangeModel() {
    return Event.any(this.onDidChangeModelRelay.event, this.onDidSwapModel.event);
  }
  get onDidChangeCollapseState() {
    return this.onDidChangeCollapseStateRelay.event;
  }
  get onDidChangeRenderNodeCount() {
    return this.onDidChangeRenderNodeCountRelay.event;
  }
  get findMode() {
    return this.findController?.mode ?? 0 /* Highlight */;
  }
  set findMode(findMode) {
    if (this.findController) {
      this.findController.mode = findMode;
    }
  }
  get findMatchType() {
    return this.findController?.matchType ?? 0 /* Fuzzy */;
  }
  set findMatchType(findFuzzy) {
    if (this.findController) {
      this.findController.matchType = findFuzzy;
    }
  }
  get onDidChangeFindPattern() {
    return this.findController ? this.findController.onDidChangePattern : Event.None;
  }
  get expandOnDoubleClick() {
    return typeof this._options.expandOnDoubleClick === "undefined" ? true : this._options.expandOnDoubleClick;
  }
  get expandOnlyOnTwistieClick() {
    return typeof this._options.expandOnlyOnTwistieClick === "undefined" ? true : this._options.expandOnlyOnTwistieClick;
  }
  get onDidDispose() {
    return this.view.onDidDispose;
  }
  updateOptions(optionsUpdate = {}) {
    this._options = { ...this._options, ...optionsUpdate };
    for (const renderer of this.renderers) {
      renderer.updateOptions(optionsUpdate);
    }
    this.view.updateOptions(optionsUpdate);
    this.findController?.updateOptions(optionsUpdate);
    this.updateStickyScroll(optionsUpdate);
    this._onDidUpdateOptions.fire(this._options);
    this.getHTMLElement().classList.toggle("always", this._options.renderIndentGuides === "always" /* Always */);
  }
  get options() {
    return this._options;
  }
  updateStickyScroll(optionsUpdate) {
    if (!this.stickyScrollController && this._options.enableStickyScroll) {
      this.stickyScrollController = new StickyScrollController(this, this.model, this.view, this.renderers, this.treeDelegate, this._options);
      this.onDidChangeStickyScrollFocused = this.stickyScrollController.onDidChangeHasFocus;
    } else if (this.stickyScrollController && !this._options.enableStickyScroll) {
      this.onDidChangeStickyScrollFocused = Event.None;
      this.stickyScrollController.dispose();
      this.stickyScrollController = void 0;
    }
    this.stickyScrollController?.updateOptions(optionsUpdate);
  }
  updateWidth(element) {
    const index = this.model.getListIndex(element);
    if (index === -1) {
      return;
    }
    this.view.updateWidth(index);
  }
  // Widget
  getHTMLElement() {
    return this.view.getHTMLElement();
  }
  get contentHeight() {
    return this.view.contentHeight;
  }
  get contentWidth() {
    return this.view.contentWidth;
  }
  get onDidChangeContentHeight() {
    return this.view.onDidChangeContentHeight;
  }
  get onDidChangeContentWidth() {
    return this.view.onDidChangeContentWidth;
  }
  get scrollTop() {
    return this.view.scrollTop;
  }
  set scrollTop(scrollTop) {
    this.view.scrollTop = scrollTop;
  }
  get scrollLeft() {
    return this.view.scrollLeft;
  }
  set scrollLeft(scrollLeft) {
    this.view.scrollLeft = scrollLeft;
  }
  get scrollHeight() {
    return this.view.scrollHeight;
  }
  get renderHeight() {
    return this.view.renderHeight;
  }
  get firstVisibleElement() {
    let index = this.view.firstVisibleIndex;
    if (this.stickyScrollController) {
      index += this.stickyScrollController.count;
    }
    if (index < 0 || index >= this.view.length) {
      return void 0;
    }
    const node = this.view.element(index);
    return node.element;
  }
  get lastVisibleElement() {
    const index = this.view.lastVisibleIndex;
    const node = this.view.element(index);
    return node.element;
  }
  get ariaLabel() {
    return this.view.ariaLabel;
  }
  set ariaLabel(value) {
    this.view.ariaLabel = value;
  }
  get selectionSize() {
    return this.selection.getNodes().length;
  }
  domFocus() {
    if (this.stickyScrollController?.focusedLast()) {
      this.stickyScrollController.domFocus();
    } else {
      this.view.domFocus();
    }
  }
  isDOMFocused() {
    return isActiveElement(this.getHTMLElement());
  }
  layout(height, width) {
    this.view.layout(height, width);
  }
  style(styles) {
    const suffix = `.${this.view.domId}`;
    const content = [];
    if (styles.treeIndentGuidesStroke) {
      content.push(`.monaco-list${suffix}:hover .monaco-tl-indent > .indent-guide, .monaco-list${suffix}.always .monaco-tl-indent > .indent-guide  { opacity: 1; border-color: ${styles.treeInactiveIndentGuidesStroke}; }`);
      content.push(`.monaco-list${suffix} .monaco-tl-indent > .indent-guide.active { opacity: 1; border-color: ${styles.treeIndentGuidesStroke}; }`);
    }
    const stickyScrollBackground = styles.treeStickyScrollBackground ?? styles.listBackground;
    if (stickyScrollBackground) {
      content.push(`.monaco-list${suffix} .monaco-scrollable-element .monaco-tree-sticky-container { background-color: ${stickyScrollBackground}; }`);
      content.push(`.monaco-list${suffix} .monaco-scrollable-element .monaco-tree-sticky-container .monaco-tree-sticky-row { background-color: ${stickyScrollBackground}; }`);
    }
    if (styles.treeStickyScrollBorder) {
      content.push(`.monaco-list${suffix} .monaco-scrollable-element .monaco-tree-sticky-container { border-bottom: 1px solid ${styles.treeStickyScrollBorder}; }`);
    }
    if (styles.treeStickyScrollShadow) {
      content.push(`.monaco-list${suffix} .monaco-scrollable-element .monaco-tree-sticky-container .monaco-tree-sticky-container-shadow { box-shadow: ${styles.treeStickyScrollShadow} 0 6px 6px -6px inset; height: 3px; }`);
    }
    if (styles.listFocusForeground) {
      content.push(`.monaco-list${suffix}.sticky-scroll-focused .monaco-scrollable-element .monaco-tree-sticky-container:focus .monaco-list-row.focused { color: ${styles.listFocusForeground}; }`);
      content.push(`.monaco-list${suffix}:not(.sticky-scroll-focused) .monaco-scrollable-element .monaco-tree-sticky-container .monaco-list-row.focused { color: inherit; }`);
    }
    const focusAndSelectionOutline = asCssValueWithDefault(styles.listFocusAndSelectionOutline, asCssValueWithDefault(styles.listSelectionOutline, styles.listFocusOutline ?? ""));
    if (focusAndSelectionOutline) {
      content.push(`.monaco-list${suffix}.sticky-scroll-focused .monaco-scrollable-element .monaco-tree-sticky-container:focus .monaco-list-row.focused.selected { outline: 1px solid ${focusAndSelectionOutline}; outline-offset: -1px;}`);
      content.push(`.monaco-list${suffix}:not(.sticky-scroll-focused) .monaco-scrollable-element .monaco-tree-sticky-container .monaco-list-row.focused.selected { outline: inherit;}`);
    }
    if (styles.listFocusOutline) {
      content.push(`.monaco-list${suffix}.sticky-scroll-focused .monaco-scrollable-element .monaco-tree-sticky-container:focus .monaco-list-row.focused { outline: 1px solid ${styles.listFocusOutline}; outline-offset: -1px; }`);
      content.push(`.monaco-list${suffix}:not(.sticky-scroll-focused) .monaco-scrollable-element .monaco-tree-sticky-container .monaco-list-row.focused { outline: inherit; }`);
      content.push(`.context-menu-visible .monaco-list${suffix}.last-focused.sticky-scroll-focused .monaco-scrollable-element .monaco-tree-sticky-container .monaco-list-row.passive-focused { outline: 1px solid ${styles.listFocusOutline}; outline-offset: -1px; }`);
      content.push(`.context-menu-visible .monaco-list${suffix}.last-focused.sticky-scroll-focused .monaco-list-rows .monaco-list-row.focused { outline: inherit; }`);
      content.push(`.context-menu-visible .monaco-list${suffix}.last-focused:not(.sticky-scroll-focused) .monaco-tree-sticky-container .monaco-list-rows .monaco-list-row.focused { outline: inherit; }`);
    }
    this.styleElement.textContent = content.join("\n");
    this.view.style(styles);
  }
  // Tree navigation
  getParentElement(location) {
    const parentRef = this.model.getParentNodeLocation(location);
    const parentNode = this.model.getNode(parentRef);
    return parentNode.element;
  }
  getFirstElementChild(location) {
    return this.model.getFirstElementChild(location);
  }
  // Tree
  getNode(location) {
    return this.model.getNode(location);
  }
  getNodeLocation(node) {
    return this.model.getNodeLocation(node);
  }
  collapse(location, recursive = false) {
    return this.model.setCollapsed(location, true, recursive);
  }
  expand(location, recursive = false) {
    return this.model.setCollapsed(location, false, recursive);
  }
  toggleCollapsed(location, recursive = false) {
    return this.model.setCollapsed(location, void 0, recursive);
  }
  expandAll() {
    this.model.setCollapsed(this.model.rootRef, false, true);
  }
  collapseAll() {
    this.model.setCollapsed(this.model.rootRef, true, true);
  }
  isCollapsible(location) {
    return this.model.isCollapsible(location);
  }
  setCollapsible(location, collapsible) {
    return this.model.setCollapsible(location, collapsible);
  }
  isCollapsed(location) {
    return this.model.isCollapsed(location);
  }
  expandTo(location) {
    this.model.expandTo(location);
  }
  triggerTypeNavigation() {
    this.view.triggerTypeNavigation();
  }
  openFind() {
    this.findController?.open();
  }
  closeFind() {
    this.findController?.close();
  }
  refilter() {
    this._onWillRefilter.fire(void 0);
    this.model.refilter();
  }
  setAnchor(element) {
    if (typeof element === "undefined") {
      return this.view.setAnchor(void 0);
    }
    this.eventBufferer.bufferEvents(() => {
      const node = this.model.getNode(element);
      this.anchor.set([node]);
      const index = this.model.getListIndex(element);
      if (index > -1) {
        this.view.setAnchor(index, true);
      }
    });
  }
  getAnchor() {
    return this.anchor.get().at(0);
  }
  setSelection(elements, browserEvent) {
    this.eventBufferer.bufferEvents(() => {
      const nodes = elements.map((e) => this.model.getNode(e));
      this.selection.set(nodes, browserEvent);
      const indexes = elements.map((e) => this.model.getListIndex(e)).filter((i) => i > -1);
      this.view.setSelection(indexes, browserEvent, true);
    });
  }
  getSelection() {
    return this.selection.get();
  }
  setFocus(elements, browserEvent) {
    this.eventBufferer.bufferEvents(() => {
      const nodes = elements.map((e) => this.model.getNode(e));
      this.focus.set(nodes, browserEvent);
      const indexes = elements.map((e) => this.model.getListIndex(e)).filter((i) => i > -1);
      this.view.setFocus(indexes, browserEvent, true);
    });
  }
  focusNext(n = 1, loop = false, browserEvent, filter = isKeyboardEvent(browserEvent) && browserEvent.altKey ? void 0 : this.focusNavigationFilter) {
    this.view.focusNext(n, loop, browserEvent, filter);
  }
  focusPrevious(n = 1, loop = false, browserEvent, filter = isKeyboardEvent(browserEvent) && browserEvent.altKey ? void 0 : this.focusNavigationFilter) {
    this.view.focusPrevious(n, loop, browserEvent, filter);
  }
  focusNextPage(browserEvent, filter = isKeyboardEvent(browserEvent) && browserEvent.altKey ? void 0 : this.focusNavigationFilter) {
    return this.view.focusNextPage(browserEvent, filter);
  }
  focusPreviousPage(browserEvent, filter = isKeyboardEvent(browserEvent) && browserEvent.altKey ? void 0 : this.focusNavigationFilter) {
    return this.view.focusPreviousPage(browserEvent, filter, () => this.stickyScrollController?.height ?? 0);
  }
  focusLast(browserEvent, filter = isKeyboardEvent(browserEvent) && browserEvent.altKey ? void 0 : this.focusNavigationFilter) {
    this.view.focusLast(browserEvent, filter);
  }
  focusFirst(browserEvent, filter = isKeyboardEvent(browserEvent) && browserEvent.altKey ? void 0 : this.focusNavigationFilter) {
    this.view.focusFirst(browserEvent, filter);
  }
  getFocus() {
    return this.focus.get();
  }
  getStickyScrollFocus() {
    const focus = this.stickyScrollController?.getFocus();
    return focus !== void 0 ? [focus] : [];
  }
  getFocusedPart() {
    return this.stickyScrollController?.focusedLast() ? 1 /* StickyScroll */ : 0 /* Tree */;
  }
  reveal(location, relativeTop) {
    this.model.expandTo(location);
    const index = this.model.getListIndex(location);
    if (index === -1) {
      return;
    }
    if (!this.stickyScrollController) {
      this.view.reveal(index, relativeTop);
    } else {
      const paddingTop = this.stickyScrollController.nodePositionTopBelowWidget(this.getNode(location));
      this.view.reveal(index, relativeTop, paddingTop);
    }
  }
  /**
   * Returns the relative position of an element rendered in the list.
   * Returns `null` if the element isn't *entirely* in the visible viewport.
   */
  getRelativeTop(location) {
    const index = this.model.getListIndex(location);
    if (index === -1) {
      return null;
    }
    const stickyScrollNode = this.stickyScrollController?.getNode(this.getNode(location));
    return this.view.getRelativeTop(index, stickyScrollNode?.position ?? this.stickyScrollController?.height);
  }
  /**
   * Returns the absolute top offset of an element in the tree's scroll/content
   * space, or `undefined` when the element is not in the tree. Unlike
   * {@link getRelativeTop}, this reads the layout height model, so it also
   * resolves elements outside the rendered viewport.
   */
  getElementTop(location) {
    const index = this.model.getListIndex(location);
    if (index === -1) {
      return void 0;
    }
    return this.view.getElementTop(index);
  }
  getViewState(identityProvider = this.options.identityProvider) {
    if (!identityProvider) {
      throw new TreeError(this._user, "Can't get tree view state without an identity provider");
    }
    const getId = (element) => identityProvider.getId(element).toString();
    const state = AbstractTreeViewState.empty(this.scrollTop);
    for (const focus of this.getFocus()) {
      state.focus.add(getId(focus));
    }
    for (const selection of this.getSelection()) {
      state.selection.add(getId(selection));
    }
    const root = this.model.getNode();
    const stack = [root];
    while (stack.length > 0) {
      const node = stack.pop();
      if (node !== root && node.collapsible) {
        state.expanded[getId(node.element)] = node.collapsed ? 0 : 1;
      }
      insertInto(stack, stack.length, node.children);
    }
    return state;
  }
  // List
  onLeftArrow(e) {
    e.preventDefault();
    e.stopPropagation();
    const nodes = this.view.getFocusedElements();
    if (nodes.length === 0) {
      return;
    }
    const node = nodes[0];
    const location = this.model.getNodeLocation(node);
    const didChange = this.model.setCollapsed(location, true);
    if (!didChange) {
      const parentLocation = this.model.getParentNodeLocation(location);
      if (!parentLocation) {
        return;
      }
      const parentListIndex = this.model.getListIndex(parentLocation);
      this.view.reveal(parentListIndex);
      this.view.setFocus([parentListIndex]);
    }
  }
  onRightArrow(e) {
    e.preventDefault();
    e.stopPropagation();
    const nodes = this.view.getFocusedElements();
    if (nodes.length === 0) {
      return;
    }
    const node = nodes[0];
    const location = this.model.getNodeLocation(node);
    const didChange = this.model.setCollapsed(location, false);
    if (!didChange) {
      if (!node.children.some((child) => child.visible)) {
        return;
      }
      const [focusedIndex] = this.view.getFocus();
      const firstChildIndex = focusedIndex + 1;
      this.view.reveal(firstChildIndex);
      this.view.setFocus([firstChildIndex]);
    }
  }
  onSpace(e) {
    e.preventDefault();
    e.stopPropagation();
    const nodes = this.view.getFocusedElements();
    if (nodes.length === 0) {
      return;
    }
    const node = nodes[0];
    const location = this.model.getNodeLocation(node);
    const recursive = e.browserEvent.altKey;
    this.model.setCollapsed(location, void 0, recursive);
  }
  setupModel(model) {
    this.modelDisposables.clear();
    this.modelDisposables.add(model.onDidSpliceRenderedNodes(({ start, deleteCount, elements }) => this.view.splice(start, deleteCount, elements)));
    const onDidModelSplice = Event.forEach(model.onDidSpliceModel, (e) => {
      this.eventBufferer.bufferEvents(() => {
        this.focus.onDidModelSplice(e);
        this.selection.onDidModelSplice(e);
      });
    }, this.modelDisposables);
    onDidModelSplice(() => null, null, this.modelDisposables);
    const activeNodesEmitter = this.modelDisposables.add(new Emitter());
    const activeNodesDebounce = this.modelDisposables.add(new Delayer(0));
    this.modelDisposables.add(Event.any(onDidModelSplice, this.focus.onDidChange, this.selection.onDidChange)(() => {
      activeNodesDebounce.trigger(() => {
        const set = /* @__PURE__ */ new Set();
        for (const node of this.focus.getNodes()) {
          set.add(node);
        }
        for (const node of this.selection.getNodes()) {
          set.add(node);
        }
        activeNodesEmitter.fire([...set.values()]);
      });
    }));
    this.onDidChangeActiveNodesRelay.input = activeNodesEmitter.event;
    this.onDidChangeModelRelay.input = Event.signal(model.onDidSpliceModel);
    this.onDidChangeCollapseStateRelay.input = model.onDidChangeCollapseState;
    this.onDidChangeRenderNodeCountRelay.input = model.onDidChangeRenderNodeCount;
    this.onDidSpliceModelRelay.input = model.onDidSpliceModel;
    if (isMacintosh) {
      this.modelDisposables.add(model.onDidChangeCollapseState((e) => {
        const { node, deep } = e;
        if (node.collapsible && !deep && this.isDOMFocused()) {
          alert(node.collapsed ? localize("treeNodeCollapsed", "collapsed") : localize("treeNodeExpanded", "expanded"));
        }
      }));
    }
  }
  navigate(start) {
    return new TreeNavigator(this.view, this.model, start);
  }
  delegateScrollFromMouseWheelEvent(browserEvent) {
    this.view.delegateScrollFromMouseWheelEvent(browserEvent);
  }
  dispose() {
    dispose(this.disposables);
    this.stickyScrollController?.dispose();
    this.view.dispose();
    this.modelDisposables.dispose();
  }
}
class TreeNavigator {
  constructor(view, model, start) {
    this.view = view;
    this.model = model;
    if (start) {
      this.index = this.model.getListIndex(start);
    } else {
      this.index = -1;
    }
  }
  current() {
    if (this.index < 0 || this.index >= this.view.length) {
      return null;
    }
    return this.view.element(this.index).element;
  }
  previous() {
    this.index--;
    return this.current();
  }
  next() {
    this.index++;
    return this.current();
  }
  first() {
    this.index = 0;
    return this.current();
  }
  last() {
    this.index = this.view.length - 1;
    return this.current();
  }
}
export {
  AbstractFindController,
  AbstractTree,
  AbstractTreePart,
  AbstractTreeViewState,
  ComposedTreeDelegate,
  FindController,
  FindFilter,
  FindToggles,
  RenderIndentGuides,
  TreeFindMatchType,
  TreeFindMode,
  TreeRenderer,
  contiguousFuzzyScore
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxiYXNlXFxicm93c2VyXFx1aVxcdHJlZVxcYWJzdHJhY3RUcmVlLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IHsgSURyYWdBbmREcm9wRGF0YSB9IGZyb20gJy4uLy4uL2RuZC5qcyc7XG5pbXBvcnQgeyAkLCBhcHBlbmQsIGNsZWFyTm9kZSwgaCwgaGFzUGFyZW50V2l0aENsYXNzLCBpc0FjdGl2ZUVsZW1lbnQsIGlzS2V5Ym9hcmRFdmVudCwgYWRkRGlzcG9zYWJsZUxpc3RlbmVyLCBpc0VkaXRhYmxlRWxlbWVudCB9IGZyb20gJy4uLy4uL2RvbS5qcyc7XG5pbXBvcnQgeyBjcmVhdGVTdHlsZVNoZWV0IH0gZnJvbSAnLi4vLi4vZG9tU3R5bGVzaGVldHMuanMnO1xuaW1wb3J0IHsgYXNDc3NWYWx1ZVdpdGhEZWZhdWx0IH0gZnJvbSAnLi4vLi4vY3NzVmFsdWUuanMnO1xuaW1wb3J0IHsgRG9tRW1pdHRlciB9IGZyb20gJy4uLy4uL2V2ZW50LmpzJztcbmltcG9ydCB7IFN0YW5kYXJkS2V5Ym9hcmRFdmVudCB9IGZyb20gJy4uLy4uL2tleWJvYXJkRXZlbnQuanMnO1xuaW1wb3J0IHsgQWN0aW9uQmFyIH0gZnJvbSAnLi4vYWN0aW9uYmFyL2FjdGlvbmJhci5qcyc7XG5pbXBvcnQgeyBJQ29udGV4dFZpZXdQcm92aWRlciB9IGZyb20gJy4uL2NvbnRleHR2aWV3L2NvbnRleHR2aWV3LmpzJztcbmltcG9ydCB7IEZpbmRJbnB1dCB9IGZyb20gJy4uL2ZpbmRpbnB1dC9maW5kSW5wdXQuanMnO1xuaW1wb3J0IHsgSUlucHV0Qm94U3R5bGVzLCBJTWVzc2FnZSwgTWVzc2FnZVR5cGUsIHVudGhlbWVkSW5ib3hTdHlsZXMgfSBmcm9tICcuLi9pbnB1dGJveC9pbnB1dEJveC5qcyc7XG5pbXBvcnQgeyBJSWRlbnRpdHlQcm92aWRlciwgSUtleWJvYXJkTmF2aWdhdGlvbkxhYmVsUHJvdmlkZXIsIElMaXN0Q29udGV4dE1lbnVFdmVudCwgSUxpc3REcmFnQW5kRHJvcCwgSUxpc3REcmFnT3ZlclJlYWN0aW9uLCBJTGlzdEVsZW1lbnRSZW5kZXJEZXRhaWxzLCBJTGlzdE1vdXNlRXZlbnQsIElMaXN0UmVuZGVyZXIsIElMaXN0VG91Y2hFdmVudCwgSUxpc3RWaXJ0dWFsRGVsZWdhdGUgfSBmcm9tICcuLi9saXN0L2xpc3QuanMnO1xuaW1wb3J0IHsgRWxlbWVudHNEcmFnQW5kRHJvcERhdGEsIExpc3RWaWV3VGFyZ2V0U2VjdG9yIH0gZnJvbSAnLi4vbGlzdC9saXN0Vmlldy5qcyc7XG5pbXBvcnQgeyBJTGlzdEFjY2Vzc2liaWxpdHlQcm92aWRlciwgSUxpc3RPcHRpb25zLCBJTGlzdFN0eWxlcywgaXNBY3Rpb25JdGVtLCBpc0J1dHRvbiwgaXNNb25hY29DdXN0b21Ub2dnbGUsIGlzTW9uYWNvRWRpdG9yLCBpc1N0aWNreVNjcm9sbENvbnRhaW5lciwgaXNTdGlja3lTY3JvbGxFbGVtZW50LCBMaXN0LCBNb3VzZUNvbnRyb2xsZXIsIFR5cGVOYXZpZ2F0aW9uTW9kZSB9IGZyb20gJy4uL2xpc3QvbGlzdFdpZGdldC5qcyc7XG5pbXBvcnQgeyBJVG9nZ2xlU3R5bGVzLCBUb2dnbGUsIHVudGhlbWVkVG9nZ2xlU3R5bGVzIH0gZnJvbSAnLi4vdG9nZ2xlL3RvZ2dsZS5qcyc7XG5pbXBvcnQgeyBnZXRWaXNpYmxlU3RhdGUsIGlzRmlsdGVyUmVzdWx0IH0gZnJvbSAnLi9pbmRleFRyZWVNb2RlbC5qcyc7XG5pbXBvcnQgeyBJQ29sbGFwc2VTdGF0ZUNoYW5nZUV2ZW50LCBJVHJlZUNvbnRleHRNZW51RXZlbnQsIElUcmVlRHJhZ0FuZERyb3AsIElUcmVlRXZlbnQsIElUcmVlRmlsdGVyLCBJVHJlZU1vZGVsLCBJVHJlZU1vZGVsU3BsaWNlRXZlbnQsIElUcmVlTW91c2VFdmVudCwgSVRyZWVOYXZpZ2F0b3IsIElUcmVlTm9kZSwgSVRyZWVSZW5kZXJlciwgVHJlZURyYWdPdmVyQnViYmxlLCBUcmVlRXJyb3IsIFRyZWVGaWx0ZXJSZXN1bHQsIFRyZWVNb3VzZUV2ZW50VGFyZ2V0LCBUcmVlVmlzaWJpbGl0eSB9IGZyb20gJy4vdHJlZS5qcyc7XG5pbXBvcnQgeyBBY3Rpb24gfSBmcm9tICcuLi8uLi8uLi9jb21tb24vYWN0aW9ucy5qcyc7XG5pbXBvcnQgeyBkaXN0aW5jdCwgZXF1YWxzLCBpbnNlcnRJbnRvLCByYW5nZSB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9hcnJheXMuanMnO1xuaW1wb3J0IHsgRGVsYXllciwgZGlzcG9zYWJsZVRpbWVvdXQsIHRpbWVvdXQgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vYXN5bmMuanMnO1xuaW1wb3J0IHsgQ29kaWNvbiB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9jb2RpY29ucy5qcyc7XG5pbXBvcnQgeyBUaGVtZUljb24gfSBmcm9tICcuLi8uLi8uLi9jb21tb24vdGhlbWFibGVzLmpzJztcbmltcG9ydCB7IFNldE1hcCB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9tYXAuanMnO1xuaW1wb3J0IHsgRW1pdHRlciwgRXZlbnQsIEV2ZW50QnVmZmVyZXIsIFJlbGF5IH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2V2ZW50LmpzJztcbmltcG9ydCB7IGZ1enp5U2NvcmUsIEZ1enp5U2NvcmUgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vZmlsdGVycy5qcyc7XG5pbXBvcnQgeyBLZXlDb2RlIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2tleUNvZGVzLmpzJztcbmltcG9ydCB7IERpc3Bvc2FibGUsIERpc3Bvc2FibGVTdG9yZSwgZGlzcG9zZSwgSURpc3Bvc2FibGUsIHRvRGlzcG9zYWJsZSB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgaXNNYWNpbnRvc2ggfSBmcm9tICcuLi8uLi8uLi9jb21tb24vcGxhdGZvcm0uanMnO1xuaW1wb3J0IHsgY2xhbXAgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vbnVtYmVycy5qcyc7XG5pbXBvcnQgeyBTY3JvbGxFdmVudCB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9zY3JvbGxhYmxlLmpzJztcbmltcG9ydCAnLi9tZWRpYS90cmVlLmNzcyc7XG5pbXBvcnQgeyBsb2NhbGl6ZSB9IGZyb20gJy4uLy4uLy4uLy4uL25scy5qcyc7XG5pbXBvcnQgeyBhdXRvcnVuLCBjb25zdE9ic2VydmFibGUgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vb2JzZXJ2YWJsZS5qcyc7XG5pbXBvcnQgeyBhbGVydCB9IGZyb20gJy4uL2FyaWEvYXJpYS5qcyc7XG5pbXBvcnQgeyBJTW91c2VXaGVlbEV2ZW50IH0gZnJvbSAnLi4vLi4vbW91c2VFdmVudC5qcyc7XG5pbXBvcnQgeyB0eXBlIElIb3ZlckxpZmVjeWNsZU9wdGlvbnMgfSBmcm9tICcuLi9ob3Zlci9ob3Zlci5qcyc7XG5cbmNsYXNzIFRyZWVFbGVtZW50c0RyYWdBbmREcm9wRGF0YTxULCBURmlsdGVyRGF0YSwgVENvbnRleHQ+IGV4dGVuZHMgRWxlbWVudHNEcmFnQW5kRHJvcERhdGE8VCwgVENvbnRleHQ+IHtcblxuXHRvdmVycmlkZSBzZXQgY29udGV4dChjb250ZXh0OiBUQ29udGV4dCB8IHVuZGVmaW5lZCkge1xuXHRcdHRoaXMuZGF0YS5jb250ZXh0ID0gY29udGV4dDtcblx0fVxuXG5cdG92ZXJyaWRlIGdldCBjb250ZXh0KCk6IFRDb250ZXh0IHwgdW5kZWZpbmVkIHtcblx0XHRyZXR1cm4gdGhpcy5kYXRhLmNvbnRleHQ7XG5cdH1cblxuXHRjb25zdHJ1Y3Rvcihwcml2YXRlIGRhdGE6IEVsZW1lbnRzRHJhZ0FuZERyb3BEYXRhPElUcmVlTm9kZTxULCBURmlsdGVyRGF0YT4sIFRDb250ZXh0Pikge1xuXHRcdHN1cGVyKGRhdGEuZWxlbWVudHMubWFwKG5vZGUgPT4gbm9kZS5lbGVtZW50KSk7XG5cdH1cbn1cblxuZnVuY3Rpb24gYXNUcmVlRHJhZ0FuZERyb3BEYXRhPFQsIFRGaWx0ZXJEYXRhPihkYXRhOiBJRHJhZ0FuZERyb3BEYXRhKTogSURyYWdBbmREcm9wRGF0YSB7XG5cdGlmIChkYXRhIGluc3RhbmNlb2YgRWxlbWVudHNEcmFnQW5kRHJvcERhdGEpIHtcblx0XHRyZXR1cm4gbmV3IFRyZWVFbGVtZW50c0RyYWdBbmREcm9wRGF0YShkYXRhKTtcblx0fVxuXG5cdHJldHVybiBkYXRhO1xufVxuXG5jbGFzcyBUcmVlTm9kZUxpc3REcmFnQW5kRHJvcDxULCBURmlsdGVyRGF0YSwgVFJlZj4gaW1wbGVtZW50cyBJTGlzdERyYWdBbmREcm9wPElUcmVlTm9kZTxULCBURmlsdGVyRGF0YT4+IHtcblxuXHRwcml2YXRlIGF1dG9FeHBhbmROb2RlOiBJVHJlZU5vZGU8VCwgVEZpbHRlckRhdGE+IHwgdW5kZWZpbmVkO1xuXHRwcml2YXRlIGF1dG9FeHBhbmREaXNwb3NhYmxlOiBJRGlzcG9zYWJsZSA9IERpc3Bvc2FibGUuTm9uZTtcblx0cHJpdmF0ZSByZWFkb25seSBkaXNwb3NhYmxlcyA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblxuXHRjb25zdHJ1Y3Rvcihwcml2YXRlIG1vZGVsUHJvdmlkZXI6ICgpID0+IElUcmVlTW9kZWw8VCwgVEZpbHRlckRhdGEsIFRSZWY+LCBwcml2YXRlIGRuZDogSVRyZWVEcmFnQW5kRHJvcDxUPikgeyB9XG5cblx0Z2V0RHJhZ1VSSShub2RlOiBJVHJlZU5vZGU8VCwgVEZpbHRlckRhdGE+KTogc3RyaW5nIHwgbnVsbCB7XG5cdFx0cmV0dXJuIHRoaXMuZG5kLmdldERyYWdVUkkobm9kZS5lbGVtZW50KTtcblx0fVxuXG5cdGdldERyYWdMYWJlbChub2RlczogSVRyZWVOb2RlPFQsIFRGaWx0ZXJEYXRhPltdLCBvcmlnaW5hbEV2ZW50OiBEcmFnRXZlbnQpOiBzdHJpbmcgfCB1bmRlZmluZWQge1xuXHRcdGlmICh0aGlzLmRuZC5nZXREcmFnTGFiZWwpIHtcblx0XHRcdHJldHVybiB0aGlzLmRuZC5nZXREcmFnTGFiZWwobm9kZXMubWFwKG5vZGUgPT4gbm9kZS5lbGVtZW50KSwgb3JpZ2luYWxFdmVudCk7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0fVxuXG5cdG9uRHJhZ1N0YXJ0KGRhdGE6IElEcmFnQW5kRHJvcERhdGEsIG9yaWdpbmFsRXZlbnQ6IERyYWdFdmVudCk6IHZvaWQge1xuXHRcdHRoaXMuZG5kLm9uRHJhZ1N0YXJ0Py4oYXNUcmVlRHJhZ0FuZERyb3BEYXRhKGRhdGEpLCBvcmlnaW5hbEV2ZW50KTtcblx0fVxuXG5cdG9uRHJhZ092ZXIoZGF0YTogSURyYWdBbmREcm9wRGF0YSwgdGFyZ2V0Tm9kZTogSVRyZWVOb2RlPFQsIFRGaWx0ZXJEYXRhPiB8IHVuZGVmaW5lZCwgdGFyZ2V0SW5kZXg6IG51bWJlciB8IHVuZGVmaW5lZCwgdGFyZ2V0U2VjdG9yOiBMaXN0Vmlld1RhcmdldFNlY3RvciB8IHVuZGVmaW5lZCwgb3JpZ2luYWxFdmVudDogRHJhZ0V2ZW50LCByYXcgPSB0cnVlKTogYm9vbGVhbiB8IElMaXN0RHJhZ092ZXJSZWFjdGlvbiB7XG5cdFx0Y29uc3QgcmVzdWx0ID0gdGhpcy5kbmQub25EcmFnT3Zlcihhc1RyZWVEcmFnQW5kRHJvcERhdGEoZGF0YSksIHRhcmdldE5vZGUgJiYgdGFyZ2V0Tm9kZS5lbGVtZW50LCB0YXJnZXRJbmRleCwgdGFyZ2V0U2VjdG9yLCBvcmlnaW5hbEV2ZW50KTtcblx0XHRjb25zdCBkaWRDaGFuZ2VBdXRvRXhwYW5kTm9kZSA9IHRoaXMuYXV0b0V4cGFuZE5vZGUgIT09IHRhcmdldE5vZGU7XG5cblx0XHRpZiAoZGlkQ2hhbmdlQXV0b0V4cGFuZE5vZGUpIHtcblx0XHRcdHRoaXMuYXV0b0V4cGFuZERpc3Bvc2FibGUuZGlzcG9zZSgpO1xuXHRcdFx0dGhpcy5hdXRvRXhwYW5kTm9kZSA9IHRhcmdldE5vZGU7XG5cdFx0fVxuXG5cdFx0aWYgKHR5cGVvZiB0YXJnZXROb2RlID09PSAndW5kZWZpbmVkJykge1xuXHRcdFx0cmV0dXJuIHJlc3VsdDtcblx0XHR9XG5cblx0XHRpZiAoZGlkQ2hhbmdlQXV0b0V4cGFuZE5vZGUgJiYgdHlwZW9mIHJlc3VsdCAhPT0gJ2Jvb2xlYW4nICYmIHJlc3VsdC5hdXRvRXhwYW5kKSB7XG5cdFx0XHR0aGlzLmF1dG9FeHBhbmREaXNwb3NhYmxlID0gZGlzcG9zYWJsZVRpbWVvdXQoKCkgPT4ge1xuXHRcdFx0XHRjb25zdCBtb2RlbCA9IHRoaXMubW9kZWxQcm92aWRlcigpO1xuXHRcdFx0XHRjb25zdCByZWYgPSBtb2RlbC5nZXROb2RlTG9jYXRpb24odGFyZ2V0Tm9kZSk7XG5cblx0XHRcdFx0aWYgKG1vZGVsLmlzQ29sbGFwc2VkKHJlZikpIHtcblx0XHRcdFx0XHRtb2RlbC5zZXRDb2xsYXBzZWQocmVmLCBmYWxzZSk7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHR0aGlzLmF1dG9FeHBhbmROb2RlID0gdW5kZWZpbmVkO1xuXHRcdFx0fSwgNTAwLCB0aGlzLmRpc3Bvc2FibGVzKTtcblx0XHR9XG5cblx0XHRpZiAodHlwZW9mIHJlc3VsdCA9PT0gJ2Jvb2xlYW4nIHx8ICFyZXN1bHQuYWNjZXB0IHx8IHR5cGVvZiByZXN1bHQuYnViYmxlID09PSAndW5kZWZpbmVkJyB8fCByZXN1bHQuZmVlZGJhY2spIHtcblx0XHRcdGlmICghcmF3KSB7XG5cdFx0XHRcdGNvbnN0IGFjY2VwdCA9IHR5cGVvZiByZXN1bHQgPT09ICdib29sZWFuJyA/IHJlc3VsdCA6IHJlc3VsdC5hY2NlcHQ7XG5cdFx0XHRcdGNvbnN0IGVmZmVjdCA9IHR5cGVvZiByZXN1bHQgPT09ICdib29sZWFuJyA/IHVuZGVmaW5lZCA6IHJlc3VsdC5lZmZlY3Q7XG5cdFx0XHRcdHJldHVybiB7IGFjY2VwdCwgZWZmZWN0LCBmZWVkYmFjazogW3RhcmdldEluZGV4IV0gfTtcblx0XHRcdH1cblxuXHRcdFx0cmV0dXJuIHJlc3VsdDtcblx0XHR9XG5cblx0XHRpZiAocmVzdWx0LmJ1YmJsZSA9PT0gVHJlZURyYWdPdmVyQnViYmxlLlVwKSB7XG5cdFx0XHRjb25zdCBtb2RlbCA9IHRoaXMubW9kZWxQcm92aWRlcigpO1xuXHRcdFx0Y29uc3QgcmVmID0gbW9kZWwuZ2V0Tm9kZUxvY2F0aW9uKHRhcmdldE5vZGUpO1xuXHRcdFx0Y29uc3QgcGFyZW50UmVmID0gbW9kZWwuZ2V0UGFyZW50Tm9kZUxvY2F0aW9uKHJlZik7XG5cdFx0XHRjb25zdCBwYXJlbnROb2RlID0gbW9kZWwuZ2V0Tm9kZShwYXJlbnRSZWYpO1xuXHRcdFx0Y29uc3QgcGFyZW50SW5kZXggPSBwYXJlbnRSZWYgJiYgbW9kZWwuZ2V0TGlzdEluZGV4KHBhcmVudFJlZik7XG5cblx0XHRcdHJldHVybiB0aGlzLm9uRHJhZ092ZXIoZGF0YSwgcGFyZW50Tm9kZSwgcGFyZW50SW5kZXgsIHRhcmdldFNlY3Rvciwgb3JpZ2luYWxFdmVudCwgZmFsc2UpO1xuXHRcdH1cblxuXHRcdGNvbnN0IG1vZGVsID0gdGhpcy5tb2RlbFByb3ZpZGVyKCk7XG5cdFx0Y29uc3QgcmVmID0gbW9kZWwuZ2V0Tm9kZUxvY2F0aW9uKHRhcmdldE5vZGUpO1xuXHRcdGNvbnN0IHN0YXJ0ID0gbW9kZWwuZ2V0TGlzdEluZGV4KHJlZik7XG5cdFx0Y29uc3QgbGVuZ3RoID0gbW9kZWwuZ2V0TGlzdFJlbmRlckNvdW50KHJlZik7XG5cblx0XHRyZXR1cm4geyAuLi5yZXN1bHQsIGZlZWRiYWNrOiByYW5nZShzdGFydCwgc3RhcnQgKyBsZW5ndGgpIH07XG5cdH1cblxuXHRkcm9wKGRhdGE6IElEcmFnQW5kRHJvcERhdGEsIHRhcmdldE5vZGU6IElUcmVlTm9kZTxULCBURmlsdGVyRGF0YT4gfCB1bmRlZmluZWQsIHRhcmdldEluZGV4OiBudW1iZXIgfCB1bmRlZmluZWQsIHRhcmdldFNlY3RvcjogTGlzdFZpZXdUYXJnZXRTZWN0b3IgfCB1bmRlZmluZWQsIG9yaWdpbmFsRXZlbnQ6IERyYWdFdmVudCk6IHZvaWQge1xuXHRcdHRoaXMuYXV0b0V4cGFuZERpc3Bvc2FibGUuZGlzcG9zZSgpO1xuXHRcdHRoaXMuYXV0b0V4cGFuZE5vZGUgPSB1bmRlZmluZWQ7XG5cblx0XHR0aGlzLmRuZC5kcm9wKGFzVHJlZURyYWdBbmREcm9wRGF0YShkYXRhKSwgdGFyZ2V0Tm9kZSAmJiB0YXJnZXROb2RlLmVsZW1lbnQsIHRhcmdldEluZGV4LCB0YXJnZXRTZWN0b3IsIG9yaWdpbmFsRXZlbnQpO1xuXHR9XG5cblx0b25EcmFnRW5kKG9yaWdpbmFsRXZlbnQ6IERyYWdFdmVudCk6IHZvaWQge1xuXHRcdHRoaXMuZG5kLm9uRHJhZ0VuZD8uKG9yaWdpbmFsRXZlbnQpO1xuXHR9XG5cblx0ZGlzcG9zZSgpOiB2b2lkIHtcblx0XHR0aGlzLmRpc3Bvc2FibGVzLmRpc3Bvc2UoKTtcblx0XHR0aGlzLmRuZC5kaXNwb3NlKCk7XG5cdH1cbn1cblxuZnVuY3Rpb24gYXNMaXN0T3B0aW9uczxULCBURmlsdGVyRGF0YSwgVFJlZj4obW9kZWxQcm92aWRlcjogKCkgPT4gSVRyZWVNb2RlbDxULCBURmlsdGVyRGF0YSwgVFJlZj4sIGRpc3Bvc2FibGVTdG9yZTogRGlzcG9zYWJsZVN0b3JlLCBvcHRpb25zPzogSUFic3RyYWN0VHJlZU9wdGlvbnM8VCwgVEZpbHRlckRhdGE+KTogSUxpc3RPcHRpb25zPElUcmVlTm9kZTxULCBURmlsdGVyRGF0YT4+IHwgdW5kZWZpbmVkIHtcblx0cmV0dXJuIG9wdGlvbnMgJiYge1xuXHRcdC4uLm9wdGlvbnMsXG5cdFx0aWRlbnRpdHlQcm92aWRlcjogb3B0aW9ucy5pZGVudGl0eVByb3ZpZGVyICYmIHtcblx0XHRcdGdldElkKGVsKSB7XG5cdFx0XHRcdHJldHVybiBvcHRpb25zLmlkZW50aXR5UHJvdmlkZXIhLmdldElkKGVsLmVsZW1lbnQpO1xuXHRcdFx0fSxcblx0XHRcdGdldEdyb3VwSWQ6IG9wdGlvbnMuaWRlbnRpdHlQcm92aWRlciEuZ2V0R3JvdXBJZCA/IChlbCkgPT4ge1xuXHRcdFx0XHRyZXR1cm4gb3B0aW9ucy5pZGVudGl0eVByb3ZpZGVyIS5nZXRHcm91cElkIShlbC5lbGVtZW50KTtcblx0XHRcdH0gOiB1bmRlZmluZWRcblx0XHR9LFxuXHRcdGRuZDogb3B0aW9ucy5kbmQgJiYgZGlzcG9zYWJsZVN0b3JlLmFkZChuZXcgVHJlZU5vZGVMaXN0RHJhZ0FuZERyb3AobW9kZWxQcm92aWRlciwgb3B0aW9ucy5kbmQpKSxcblx0XHRtdWx0aXBsZVNlbGVjdGlvbkNvbnRyb2xsZXI6IG9wdGlvbnMubXVsdGlwbGVTZWxlY3Rpb25Db250cm9sbGVyICYmIHtcblx0XHRcdGlzU2VsZWN0aW9uU2luZ2xlQ2hhbmdlRXZlbnQoZSkge1xuXHRcdFx0XHQvLyBlc2xpbnQtZGlzYWJsZS1uZXh0LWxpbmUgbG9jYWwvY29kZS1uby1kYW5nZXJvdXMtdHlwZS1hc3NlcnRpb25zXG5cdFx0XHRcdHJldHVybiBvcHRpb25zLm11bHRpcGxlU2VsZWN0aW9uQ29udHJvbGxlciEuaXNTZWxlY3Rpb25TaW5nbGVDaGFuZ2VFdmVudCh7IC4uLmUsIGVsZW1lbnQ6IGUuZWxlbWVudCB9IGFzIElMaXN0TW91c2VFdmVudDxUPiB8IElMaXN0VG91Y2hFdmVudDxUPik7XG5cdFx0XHR9LFxuXHRcdFx0aXNTZWxlY3Rpb25SYW5nZUNoYW5nZUV2ZW50KGUpIHtcblx0XHRcdFx0Ly8gZXNsaW50LWRpc2FibGUtbmV4dC1saW5lIGxvY2FsL2NvZGUtbm8tZGFuZ2Vyb3VzLXR5cGUtYXNzZXJ0aW9uc1xuXHRcdFx0XHRyZXR1cm4gb3B0aW9ucy5tdWx0aXBsZVNlbGVjdGlvbkNvbnRyb2xsZXIhLmlzU2VsZWN0aW9uUmFuZ2VDaGFuZ2VFdmVudCh7IC4uLmUsIGVsZW1lbnQ6IGUuZWxlbWVudCB9IGFzIElMaXN0TW91c2VFdmVudDxUPiB8IElMaXN0VG91Y2hFdmVudDxUPik7XG5cdFx0XHR9XG5cdFx0fSxcblx0XHRhY2Nlc3NpYmlsaXR5UHJvdmlkZXI6IG9wdGlvbnMuYWNjZXNzaWJpbGl0eVByb3ZpZGVyICYmIHtcblx0XHRcdC4uLm9wdGlvbnMuYWNjZXNzaWJpbGl0eVByb3ZpZGVyLFxuXHRcdFx0Z2V0U2V0U2l6ZShub2RlKSB7XG5cdFx0XHRcdGNvbnN0IG1vZGVsID0gbW9kZWxQcm92aWRlcigpO1xuXHRcdFx0XHRjb25zdCByZWYgPSBtb2RlbC5nZXROb2RlTG9jYXRpb24obm9kZSk7XG5cdFx0XHRcdGNvbnN0IHBhcmVudFJlZiA9IG1vZGVsLmdldFBhcmVudE5vZGVMb2NhdGlvbihyZWYpO1xuXHRcdFx0XHRjb25zdCBwYXJlbnROb2RlID0gbW9kZWwuZ2V0Tm9kZShwYXJlbnRSZWYpO1xuXG5cdFx0XHRcdHJldHVybiBwYXJlbnROb2RlLnZpc2libGVDaGlsZHJlbkNvdW50O1xuXHRcdFx0fSxcblx0XHRcdGdldFBvc0luU2V0KG5vZGUpIHtcblx0XHRcdFx0cmV0dXJuIG5vZGUudmlzaWJsZUNoaWxkSW5kZXggKyAxO1xuXHRcdFx0fSxcblx0XHRcdGlzQ2hlY2tlZDogb3B0aW9ucy5hY2Nlc3NpYmlsaXR5UHJvdmlkZXIgJiYgb3B0aW9ucy5hY2Nlc3NpYmlsaXR5UHJvdmlkZXIuaXNDaGVja2VkID8gKG5vZGUpID0+IHtcblx0XHRcdFx0cmV0dXJuIG9wdGlvbnMuYWNjZXNzaWJpbGl0eVByb3ZpZGVyIS5pc0NoZWNrZWQhKG5vZGUuZWxlbWVudCk7XG5cdFx0XHR9IDogdW5kZWZpbmVkLFxuXHRcdFx0Z2V0Um9sZTogb3B0aW9ucy5hY2Nlc3NpYmlsaXR5UHJvdmlkZXIgJiYgb3B0aW9ucy5hY2Nlc3NpYmlsaXR5UHJvdmlkZXIuZ2V0Um9sZSA/IChub2RlKSA9PiB7XG5cdFx0XHRcdHJldHVybiBvcHRpb25zLmFjY2Vzc2liaWxpdHlQcm92aWRlciEuZ2V0Um9sZSEobm9kZS5lbGVtZW50KTtcblx0XHRcdH0gOiAoKSA9PiAndHJlZWl0ZW0nLFxuXHRcdFx0Z2V0QXJpYUxhYmVsKGUpIHtcblx0XHRcdFx0cmV0dXJuIG9wdGlvbnMuYWNjZXNzaWJpbGl0eVByb3ZpZGVyIS5nZXRBcmlhTGFiZWwoZS5lbGVtZW50KTtcblx0XHRcdH0sXG5cdFx0XHRnZXRXaWRnZXRBcmlhTGFiZWwoKSB7XG5cdFx0XHRcdHJldHVybiBvcHRpb25zLmFjY2Vzc2liaWxpdHlQcm92aWRlciEuZ2V0V2lkZ2V0QXJpYUxhYmVsKCk7XG5cdFx0XHR9LFxuXHRcdFx0Z2V0V2lkZ2V0Um9sZTogb3B0aW9ucy5hY2Nlc3NpYmlsaXR5UHJvdmlkZXIgJiYgb3B0aW9ucy5hY2Nlc3NpYmlsaXR5UHJvdmlkZXIuZ2V0V2lkZ2V0Um9sZSA/ICgpID0+IG9wdGlvbnMuYWNjZXNzaWJpbGl0eVByb3ZpZGVyIS5nZXRXaWRnZXRSb2xlISgpIDogKCkgPT4gJ3RyZWUnLFxuXHRcdFx0Z2V0QXJpYUxldmVsOiBvcHRpb25zLmFjY2Vzc2liaWxpdHlQcm92aWRlciAmJiBvcHRpb25zLmFjY2Vzc2liaWxpdHlQcm92aWRlci5nZXRBcmlhTGV2ZWwgPyAobm9kZSkgPT4gb3B0aW9ucy5hY2Nlc3NpYmlsaXR5UHJvdmlkZXIhLmdldEFyaWFMZXZlbCEobm9kZS5lbGVtZW50KSA6IChub2RlKSA9PiB7XG5cdFx0XHRcdHJldHVybiBub2RlLmRlcHRoO1xuXHRcdFx0fSxcblx0XHRcdGdldEFjdGl2ZURlc2NlbmRhbnRJZDogb3B0aW9ucy5hY2Nlc3NpYmlsaXR5UHJvdmlkZXIuZ2V0QWN0aXZlRGVzY2VuZGFudElkICYmIChub2RlID0+IHtcblx0XHRcdFx0cmV0dXJuIG9wdGlvbnMuYWNjZXNzaWJpbGl0eVByb3ZpZGVyIS5nZXRBY3RpdmVEZXNjZW5kYW50SWQhKG5vZGUuZWxlbWVudCk7XG5cdFx0XHR9KVxuXHRcdH0sXG5cdFx0a2V5Ym9hcmROYXZpZ2F0aW9uTGFiZWxQcm92aWRlcjogb3B0aW9ucy5rZXlib2FyZE5hdmlnYXRpb25MYWJlbFByb3ZpZGVyICYmIHtcblx0XHRcdC4uLm9wdGlvbnMua2V5Ym9hcmROYXZpZ2F0aW9uTGFiZWxQcm92aWRlcixcblx0XHRcdGdldEtleWJvYXJkTmF2aWdhdGlvbkxhYmVsKG5vZGUpIHtcblx0XHRcdFx0cmV0dXJuIG9wdGlvbnMua2V5Ym9hcmROYXZpZ2F0aW9uTGFiZWxQcm92aWRlciEuZ2V0S2V5Ym9hcmROYXZpZ2F0aW9uTGFiZWwobm9kZS5lbGVtZW50KTtcblx0XHRcdH1cblx0XHR9XG5cdH07XG59XG5cbmV4cG9ydCBjbGFzcyBDb21wb3NlZFRyZWVEZWxlZ2F0ZTxULCBOIGV4dGVuZHMgeyBlbGVtZW50OiBUIH0+IGltcGxlbWVudHMgSUxpc3RWaXJ0dWFsRGVsZWdhdGU8Tj4ge1xuXG5cdGNvbnN0cnVjdG9yKHByaXZhdGUgZGVsZWdhdGU6IElMaXN0VmlydHVhbERlbGVnYXRlPFQ+KSB7IH1cblxuXHRnZXRIZWlnaHQoZWxlbWVudDogTik6IG51bWJlciB7XG5cdFx0cmV0dXJuIHRoaXMuZGVsZWdhdGUuZ2V0SGVpZ2h0KGVsZW1lbnQuZWxlbWVudCk7XG5cdH1cblxuXHRnZXRUZW1wbGF0ZUlkKGVsZW1lbnQ6IE4pOiBzdHJpbmcge1xuXHRcdHJldHVybiB0aGlzLmRlbGVnYXRlLmdldFRlbXBsYXRlSWQoZWxlbWVudC5lbGVtZW50KTtcblx0fVxuXG5cdGhhc0R5bmFtaWNIZWlnaHQoZWxlbWVudDogTik6IGJvb2xlYW4ge1xuXHRcdHJldHVybiAhIXRoaXMuZGVsZWdhdGUuaGFzRHluYW1pY0hlaWdodCAmJiB0aGlzLmRlbGVnYXRlLmhhc0R5bmFtaWNIZWlnaHQoZWxlbWVudC5lbGVtZW50KTtcblx0fVxuXG5cdHNldER5bmFtaWNIZWlnaHQoZWxlbWVudDogTiwgaGVpZ2h0OiBudW1iZXIpOiB2b2lkIHtcblx0XHR0aGlzLmRlbGVnYXRlLnNldER5bmFtaWNIZWlnaHQ/LihlbGVtZW50LmVsZW1lbnQsIGhlaWdodCk7XG5cdH1cbn1cblxuaW50ZXJmYWNlIElUcmVlTGlzdFRlbXBsYXRlRGF0YTxUPiB7XG5cdHJlYWRvbmx5IGNvbnRhaW5lcjogSFRNTEVsZW1lbnQ7XG5cdHJlYWRvbmx5IGluZGVudDogSFRNTEVsZW1lbnQ7XG5cdHJlYWRvbmx5IHR3aXN0aWU6IEhUTUxFbGVtZW50O1xuXHRpbmRlbnRHdWlkZXNEaXNwb3NhYmxlOiBJRGlzcG9zYWJsZTtcblx0aW5kZW50U2l6ZTogbnVtYmVyO1xuXHRyZWFkb25seSB0ZW1wbGF0ZURhdGE6IFQ7XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgSUFic3RyYWN0VHJlZVZpZXdTdGF0ZSB7XG5cdHJlYWRvbmx5IGZvY3VzOiBJdGVyYWJsZTxzdHJpbmc+O1xuXHRyZWFkb25seSBzZWxlY3Rpb246IEl0ZXJhYmxlPHN0cmluZz47XG5cdHJlYWRvbmx5IGV4cGFuZGVkOiB7IFtpZDogc3RyaW5nXTogMSB8IDAgfTtcblx0cmVhZG9ubHkgc2Nyb2xsVG9wOiBudW1iZXI7XG59XG5cbmV4cG9ydCBjbGFzcyBBYnN0cmFjdFRyZWVWaWV3U3RhdGUgaW1wbGVtZW50cyBJQWJzdHJhY3RUcmVlVmlld1N0YXRlIHtcblx0cHVibGljIHJlYWRvbmx5IGZvY3VzOiBTZXQ8c3RyaW5nPjtcblx0cHVibGljIHJlYWRvbmx5IHNlbGVjdGlvbjogU2V0PHN0cmluZz47XG5cdHB1YmxpYyByZWFkb25seSBleHBhbmRlZDogeyBbaWQ6IHN0cmluZ106IDEgfCAwIH07XG5cdHB1YmxpYyBzY3JvbGxUb3A6IG51bWJlcjtcblxuXHRwdWJsaWMgc3RhdGljIGxpZnQoc3RhdGU6IElBYnN0cmFjdFRyZWVWaWV3U3RhdGUpIHtcblx0XHRyZXR1cm4gc3RhdGUgaW5zdGFuY2VvZiBBYnN0cmFjdFRyZWVWaWV3U3RhdGUgPyBzdGF0ZSA6IG5ldyBBYnN0cmFjdFRyZWVWaWV3U3RhdGUoc3RhdGUpO1xuXHR9XG5cblx0cHVibGljIHN0YXRpYyBlbXB0eShzY3JvbGxUb3AgPSAwKSB7XG5cdFx0cmV0dXJuIG5ldyBBYnN0cmFjdFRyZWVWaWV3U3RhdGUoe1xuXHRcdFx0Zm9jdXM6IFtdLFxuXHRcdFx0c2VsZWN0aW9uOiBbXSxcblx0XHRcdGV4cGFuZGVkOiBPYmplY3QuY3JlYXRlKG51bGwpLFxuXHRcdFx0c2Nyb2xsVG9wLFxuXHRcdH0pO1xuXHR9XG5cblx0cHJvdGVjdGVkIGNvbnN0cnVjdG9yKHN0YXRlOiBJQWJzdHJhY3RUcmVlVmlld1N0YXRlKSB7XG5cdFx0dGhpcy5mb2N1cyA9IG5ldyBTZXQoc3RhdGUuZm9jdXMpO1xuXHRcdHRoaXMuc2VsZWN0aW9uID0gbmV3IFNldChzdGF0ZS5zZWxlY3Rpb24pO1xuXHRcdGlmIChzdGF0ZS5leHBhbmRlZCBpbnN0YW5jZW9mIEFycmF5KSB7IC8vIG9sZCBmb3JtYXRcblx0XHRcdHRoaXMuZXhwYW5kZWQgPSBPYmplY3QuY3JlYXRlKG51bGwpO1xuXHRcdFx0Zm9yIChjb25zdCBpZCBvZiBzdGF0ZS5leHBhbmRlZCBhcyBzdHJpbmdbXSkge1xuXHRcdFx0XHR0aGlzLmV4cGFuZGVkW2lkXSA9IDE7XG5cdFx0XHR9XG5cdFx0fSBlbHNlIHtcblx0XHRcdHRoaXMuZXhwYW5kZWQgPSBzdGF0ZS5leHBhbmRlZDtcblx0XHR9XG5cdFx0dGhpcy5leHBhbmRlZCA9IHN0YXRlLmV4cGFuZGVkO1xuXHRcdHRoaXMuc2Nyb2xsVG9wID0gc3RhdGUuc2Nyb2xsVG9wO1xuXHR9XG5cblx0cHVibGljIHRvSlNPTigpOiBJQWJzdHJhY3RUcmVlVmlld1N0YXRlIHtcblx0XHRyZXR1cm4ge1xuXHRcdFx0Zm9jdXM6IEFycmF5LmZyb20odGhpcy5mb2N1cyksXG5cdFx0XHRzZWxlY3Rpb246IEFycmF5LmZyb20odGhpcy5zZWxlY3Rpb24pLFxuXHRcdFx0ZXhwYW5kZWQ6IHRoaXMuZXhwYW5kZWQsXG5cdFx0XHRzY3JvbGxUb3A6IHRoaXMuc2Nyb2xsVG9wLFxuXHRcdH07XG5cdH1cbn1cblxuZXhwb3J0IGVudW0gUmVuZGVySW5kZW50R3VpZGVzIHtcblx0Tm9uZSA9ICdub25lJyxcblx0T25Ib3ZlciA9ICdvbkhvdmVyJyxcblx0QWx3YXlzID0gJ2Fsd2F5cydcbn1cblxuaW50ZXJmYWNlIElUcmVlUmVuZGVyZXJPcHRpb25zPFQ+IHtcblx0cmVhZG9ubHkgaW5kZW50PzogbnVtYmVyO1xuXHRyZWFkb25seSBkZWZhdWx0SW5kZW50PzogbnVtYmVyO1xuXHRyZWFkb25seSByZW5kZXJJbmRlbnRHdWlkZXM/OiBSZW5kZXJJbmRlbnRHdWlkZXM7XG5cdC8vIFRPRE9Aam9hbyByZXBsYWNlIHRoaXMgd2l0aCBjb2xsYXBzaWJsZTogYm9vbGVhbiB8ICdvbmRlbWFuZCdcblx0cmVhZG9ubHkgaGlkZVR3aXN0aWVzT2ZDaGlsZGxlc3NFbGVtZW50cz86IGJvb2xlYW47XG5cdHJlYWRvbmx5IHR3aXN0aWVBZGRpdGlvbmFsQ3NzQ2xhc3M/OiAoZWxlbWVudDogVCkgPT4gc3RyaW5nIHwgdW5kZWZpbmVkO1xufVxuXG5pbnRlcmZhY2UgQ29sbGVjdGlvbjxUPiB7XG5cdHJlYWRvbmx5IGVsZW1lbnRzOiBUW107XG5cdHJlYWRvbmx5IG9uRGlkQ2hhbmdlOiBFdmVudDxUW10+O1xufVxuXG5jbGFzcyBFdmVudENvbGxlY3Rpb248VD4gaW1wbGVtZW50cyBDb2xsZWN0aW9uPFQ+LCBJRGlzcG9zYWJsZSB7XG5cblx0cHJpdmF0ZSByZWFkb25seSBkaXNwb3NhYmxlcyA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblx0cmVhZG9ubHkgb25EaWRDaGFuZ2U6IEV2ZW50PFRbXT47XG5cblx0Z2V0IGVsZW1lbnRzKCk6IFRbXSB7XG5cdFx0cmV0dXJuIHRoaXMuX2VsZW1lbnRzO1xuXHR9XG5cblx0Y29uc3RydWN0b3Iob25EaWRDaGFuZ2U6IEV2ZW50PFRbXT4sIHByaXZhdGUgX2VsZW1lbnRzOiBUW10gPSBbXSkge1xuXHRcdHRoaXMub25EaWRDaGFuZ2UgPSBFdmVudC5mb3JFYWNoKG9uRGlkQ2hhbmdlLCBlbGVtZW50cyA9PiB0aGlzLl9lbGVtZW50cyA9IGVsZW1lbnRzLCB0aGlzLmRpc3Bvc2FibGVzKTtcblx0fVxuXG5cdGRpc3Bvc2UoKTogdm9pZCB7XG5cdFx0dGhpcy5kaXNwb3NhYmxlcy5kaXNwb3NlKCk7XG5cdH1cbn1cblxuZXhwb3J0IGNsYXNzIFRyZWVSZW5kZXJlcjxULCBURmlsdGVyRGF0YSwgVFJlZiwgVFRlbXBsYXRlRGF0YT4gaW1wbGVtZW50cyBJTGlzdFJlbmRlcmVyPElUcmVlTm9kZTxULCBURmlsdGVyRGF0YT4sIElUcmVlTGlzdFRlbXBsYXRlRGF0YTxUVGVtcGxhdGVEYXRhPj4ge1xuXG5cdHByaXZhdGUgc3RhdGljIHJlYWRvbmx5IERlZmF1bHRJbmRlbnQgPSA4O1xuXG5cdHJlYWRvbmx5IHRlbXBsYXRlSWQ6IHN0cmluZztcblx0cHJpdmF0ZSByZW5kZXJlZEVsZW1lbnRzID0gbmV3IE1hcDxULCBJVHJlZU5vZGU8VCwgVEZpbHRlckRhdGE+PigpO1xuXHRwcml2YXRlIHJlbmRlcmVkTm9kZXMgPSBuZXcgTWFwPElUcmVlTm9kZTxULCBURmlsdGVyRGF0YT4sIElUcmVlTGlzdFRlbXBsYXRlRGF0YTxUVGVtcGxhdGVEYXRhPj4oKTtcblx0cHJpdmF0ZSBpbmRlbnQ6IG51bWJlciA9IFRyZWVSZW5kZXJlci5EZWZhdWx0SW5kZW50O1xuXHRwcml2YXRlIGRlZmF1bHRJbmRlbnQ6IG51bWJlciA9IFRyZWVSZW5kZXJlci5EZWZhdWx0SW5kZW50O1xuXHRwcml2YXRlIGhpZGVUd2lzdGllc09mQ2hpbGRsZXNzRWxlbWVudHM6IGJvb2xlYW4gPSBmYWxzZTtcblx0cHJpdmF0ZSB0d2lzdGllQWRkaXRpb25hbENzc0NsYXNzPzogKGVsZW1lbnQ6IFQpID0+IHN0cmluZyB8IHVuZGVmaW5lZDtcblxuXHRwcml2YXRlIHNob3VsZFJlbmRlckluZGVudEd1aWRlczogYm9vbGVhbiA9IGZhbHNlO1xuXHRwcml2YXRlIGFjdGl2ZUluZGVudE5vZGVzID0gbmV3IFNldDxJVHJlZU5vZGU8VCwgVEZpbHRlckRhdGE+PigpO1xuXHRwcml2YXRlIGluZGVudEd1aWRlc0Rpc3Bvc2FibGU6IElEaXNwb3NhYmxlID0gRGlzcG9zYWJsZS5Ob25lO1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgZGlzcG9zYWJsZXMgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0cHJpdmF0ZSByZWFkb25seSByZW5kZXJlcjogSVRyZWVSZW5kZXJlcjxULCBURmlsdGVyRGF0YSwgVFRlbXBsYXRlRGF0YT4sXG5cdFx0cHJpdmF0ZSByZWFkb25seSBtb2RlbDogSVRyZWVNb2RlbDxULCBURmlsdGVyRGF0YSwgVFJlZj4sXG5cdFx0b25EaWRDaGFuZ2VDb2xsYXBzZVN0YXRlOiBFdmVudDxJQ29sbGFwc2VTdGF0ZUNoYW5nZUV2ZW50PFQsIFRGaWx0ZXJEYXRhPj4sXG5cdFx0cHJpdmF0ZSByZWFkb25seSBhY3RpdmVOb2RlczogQ29sbGVjdGlvbjxJVHJlZU5vZGU8VCwgVEZpbHRlckRhdGE+Pixcblx0XHRwcml2YXRlIHJlYWRvbmx5IHJlbmRlcmVkSW5kZW50R3VpZGVzOiBTZXRNYXA8SVRyZWVOb2RlPFQsIFRGaWx0ZXJEYXRhPiwgSFRNTERpdkVsZW1lbnQ+LFxuXHRcdG9wdGlvbnM6IElUcmVlUmVuZGVyZXJPcHRpb25zPFQ+ID0ge31cblx0KSB7XG5cdFx0dGhpcy50ZW1wbGF0ZUlkID0gcmVuZGVyZXIudGVtcGxhdGVJZDtcblx0XHR0aGlzLnVwZGF0ZU9wdGlvbnMob3B0aW9ucyk7XG5cblx0XHRFdmVudC5tYXAob25EaWRDaGFuZ2VDb2xsYXBzZVN0YXRlLCBlID0+IGUubm9kZSkodGhpcy5vbkRpZENoYW5nZU5vZGVUd2lzdGllU3RhdGUsIHRoaXMsIHRoaXMuZGlzcG9zYWJsZXMpO1xuXHRcdHJlbmRlcmVyLm9uRGlkQ2hhbmdlVHdpc3RpZVN0YXRlPy4odGhpcy5vbkRpZENoYW5nZVR3aXN0aWVTdGF0ZSwgdGhpcywgdGhpcy5kaXNwb3NhYmxlcyk7XG5cdH1cblxuXHR1cGRhdGVPcHRpb25zKG9wdGlvbnM6IElUcmVlUmVuZGVyZXJPcHRpb25zPFQ+ID0ge30pOiB2b2lkIHtcblx0XHRpZiAodHlwZW9mIG9wdGlvbnMuZGVmYXVsdEluZGVudCAhPT0gJ3VuZGVmaW5lZCcpIHtcblx0XHRcdHRoaXMuZGVmYXVsdEluZGVudCA9IG9wdGlvbnMuZGVmYXVsdEluZGVudDtcblx0XHR9XG5cblx0XHRpZiAodHlwZW9mIG9wdGlvbnMuaW5kZW50ICE9PSAndW5kZWZpbmVkJyB8fCB0eXBlb2Ygb3B0aW9ucy5kZWZhdWx0SW5kZW50ICE9PSAndW5kZWZpbmVkJykge1xuXHRcdFx0Y29uc3QgaW5kZW50ID0gdHlwZW9mIG9wdGlvbnMuaW5kZW50ICE9PSAndW5kZWZpbmVkJyA/IGNsYW1wKG9wdGlvbnMuaW5kZW50LCAwLCA0MCkgOiB0aGlzLmluZGVudDtcblx0XHRcdGNvbnN0IG5lZWRzUmVyZW5kZXIgPSBpbmRlbnQgIT09IHRoaXMuaW5kZW50IHx8IHR5cGVvZiBvcHRpb25zLmRlZmF1bHRJbmRlbnQgIT09ICd1bmRlZmluZWQnO1xuXG5cdFx0XHRpZiAobmVlZHNSZXJlbmRlcikge1xuXHRcdFx0XHR0aGlzLmluZGVudCA9IGluZGVudDtcblxuXHRcdFx0XHRmb3IgKGNvbnN0IFtub2RlLCB0ZW1wbGF0ZURhdGFdIG9mIHRoaXMucmVuZGVyZWROb2Rlcykge1xuXHRcdFx0XHRcdHRlbXBsYXRlRGF0YS5pbmRlbnRTaXplID0gdGhpcy5kZWZhdWx0SW5kZW50ICsgKG5vZGUuZGVwdGggLSAxKSAqIHRoaXMuaW5kZW50O1xuXHRcdFx0XHRcdHRoaXMucmVuZGVyVHJlZUVsZW1lbnQobm9kZSwgdGVtcGxhdGVEYXRhKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblxuXHRcdGlmICh0eXBlb2Ygb3B0aW9ucy5yZW5kZXJJbmRlbnRHdWlkZXMgIT09ICd1bmRlZmluZWQnKSB7XG5cdFx0XHRjb25zdCBzaG91bGRSZW5kZXJJbmRlbnRHdWlkZXMgPSBvcHRpb25zLnJlbmRlckluZGVudEd1aWRlcyAhPT0gUmVuZGVySW5kZW50R3VpZGVzLk5vbmU7XG5cblx0XHRcdGlmIChzaG91bGRSZW5kZXJJbmRlbnRHdWlkZXMgIT09IHRoaXMuc2hvdWxkUmVuZGVySW5kZW50R3VpZGVzKSB7XG5cdFx0XHRcdHRoaXMuc2hvdWxkUmVuZGVySW5kZW50R3VpZGVzID0gc2hvdWxkUmVuZGVySW5kZW50R3VpZGVzO1xuXG5cdFx0XHRcdGZvciAoY29uc3QgW25vZGUsIHRlbXBsYXRlRGF0YV0gb2YgdGhpcy5yZW5kZXJlZE5vZGVzKSB7XG5cdFx0XHRcdFx0dGhpcy5fcmVuZGVySW5kZW50R3VpZGVzKG5vZGUsIHRlbXBsYXRlRGF0YSk7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHR0aGlzLmluZGVudEd1aWRlc0Rpc3Bvc2FibGUuZGlzcG9zZSgpO1xuXG5cdFx0XHRcdGlmIChzaG91bGRSZW5kZXJJbmRlbnRHdWlkZXMpIHtcblx0XHRcdFx0XHRjb25zdCBkaXNwb3NhYmxlcyA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblx0XHRcdFx0XHR0aGlzLmFjdGl2ZU5vZGVzLm9uRGlkQ2hhbmdlKHRoaXMuX29uRGlkQ2hhbmdlQWN0aXZlTm9kZXMsIHRoaXMsIGRpc3Bvc2FibGVzKTtcblx0XHRcdFx0XHR0aGlzLmluZGVudEd1aWRlc0Rpc3Bvc2FibGUgPSBkaXNwb3NhYmxlcztcblxuXHRcdFx0XHRcdHRoaXMuX29uRGlkQ2hhbmdlQWN0aXZlTm9kZXModGhpcy5hY3RpdmVOb2Rlcy5lbGVtZW50cyk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cblx0XHRpZiAodHlwZW9mIG9wdGlvbnMuaGlkZVR3aXN0aWVzT2ZDaGlsZGxlc3NFbGVtZW50cyAhPT0gJ3VuZGVmaW5lZCcpIHtcblx0XHRcdHRoaXMuaGlkZVR3aXN0aWVzT2ZDaGlsZGxlc3NFbGVtZW50cyA9IG9wdGlvbnMuaGlkZVR3aXN0aWVzT2ZDaGlsZGxlc3NFbGVtZW50cztcblx0XHR9XG5cblx0XHRpZiAodHlwZW9mIG9wdGlvbnMudHdpc3RpZUFkZGl0aW9uYWxDc3NDbGFzcyAhPT0gJ3VuZGVmaW5lZCcpIHtcblx0XHRcdHRoaXMudHdpc3RpZUFkZGl0aW9uYWxDc3NDbGFzcyA9IG9wdGlvbnMudHdpc3RpZUFkZGl0aW9uYWxDc3NDbGFzcztcblx0XHR9XG5cdH1cblxuXHRyZW5kZXJUZW1wbGF0ZShjb250YWluZXI6IEhUTUxFbGVtZW50KTogSVRyZWVMaXN0VGVtcGxhdGVEYXRhPFRUZW1wbGF0ZURhdGE+IHtcblx0XHRpZiAodGhpcy5yZW5kZXJlci5yb3dDbGFzc05hbWUpIHtcblx0XHRcdGNvbnRhaW5lci5jbGFzc0xpc3QuYWRkKHRoaXMucmVuZGVyZXIucm93Q2xhc3NOYW1lKTtcblx0XHR9XG5cdFx0Y29uc3QgZWwgPSBhcHBlbmQoY29udGFpbmVyLCAkKCcubW9uYWNvLXRsLXJvdycpKTtcblx0XHRjb25zdCBpbmRlbnQgPSBhcHBlbmQoZWwsICQoJy5tb25hY28tdGwtaW5kZW50JykpO1xuXHRcdGNvbnN0IHR3aXN0aWUgPSBhcHBlbmQoZWwsICQoJy5tb25hY28tdGwtdHdpc3RpZScpKTtcblx0XHRjb25zdCBjb250ZW50cyA9IGFwcGVuZChlbCwgJCgnLm1vbmFjby10bC1jb250ZW50cycpKTtcblx0XHRjb25zdCB0ZW1wbGF0ZURhdGEgPSB0aGlzLnJlbmRlcmVyLnJlbmRlclRlbXBsYXRlKGNvbnRlbnRzKTtcblxuXHRcdHJldHVybiB7IGNvbnRhaW5lciwgaW5kZW50LCB0d2lzdGllLCBpbmRlbnRHdWlkZXNEaXNwb3NhYmxlOiBEaXNwb3NhYmxlLk5vbmUsIGluZGVudFNpemU6IDAsIHRlbXBsYXRlRGF0YSB9O1xuXHR9XG5cblx0cmVuZGVyRWxlbWVudChub2RlOiBJVHJlZU5vZGU8VCwgVEZpbHRlckRhdGE+LCBpbmRleDogbnVtYmVyLCB0ZW1wbGF0ZURhdGE6IElUcmVlTGlzdFRlbXBsYXRlRGF0YTxUVGVtcGxhdGVEYXRhPiwgZGV0YWlscz86IElMaXN0RWxlbWVudFJlbmRlckRldGFpbHMpOiB2b2lkIHtcblx0XHR0ZW1wbGF0ZURhdGEuaW5kZW50U2l6ZSA9IHRoaXMuZGVmYXVsdEluZGVudCArIChub2RlLmRlcHRoIC0gMSkgKiB0aGlzLmluZGVudDtcblxuXHRcdHRoaXMucmVuZGVyZWROb2Rlcy5zZXQobm9kZSwgdGVtcGxhdGVEYXRhKTtcblx0XHR0aGlzLnJlbmRlcmVkRWxlbWVudHMuc2V0KG5vZGUuZWxlbWVudCwgbm9kZSk7XG5cdFx0dGhpcy5yZW5kZXJUcmVlRWxlbWVudChub2RlLCB0ZW1wbGF0ZURhdGEpO1xuXHRcdHRoaXMucmVuZGVyZXIucmVuZGVyRWxlbWVudChub2RlLCBpbmRleCwgdGVtcGxhdGVEYXRhLnRlbXBsYXRlRGF0YSwgeyAuLi5kZXRhaWxzLCBpbmRlbnQ6IHRlbXBsYXRlRGF0YS5pbmRlbnRTaXplIH0pO1xuXHR9XG5cblx0ZGlzcG9zZUVsZW1lbnQobm9kZTogSVRyZWVOb2RlPFQsIFRGaWx0ZXJEYXRhPiwgaW5kZXg6IG51bWJlciwgdGVtcGxhdGVEYXRhOiBJVHJlZUxpc3RUZW1wbGF0ZURhdGE8VFRlbXBsYXRlRGF0YT4sIGRldGFpbHM/OiBJTGlzdEVsZW1lbnRSZW5kZXJEZXRhaWxzKTogdm9pZCB7XG5cdFx0dGVtcGxhdGVEYXRhLmluZGVudEd1aWRlc0Rpc3Bvc2FibGUuZGlzcG9zZSgpO1xuXG5cdFx0dGhpcy5yZW5kZXJlci5kaXNwb3NlRWxlbWVudD8uKG5vZGUsIGluZGV4LCB0ZW1wbGF0ZURhdGEudGVtcGxhdGVEYXRhLCB7IC4uLmRldGFpbHMsIGluZGVudDogdGVtcGxhdGVEYXRhLmluZGVudFNpemUgfSk7XG5cblx0XHRpZiAodHlwZW9mIGRldGFpbHM/LmhlaWdodCA9PT0gJ251bWJlcicpIHtcblx0XHRcdHRoaXMucmVuZGVyZWROb2Rlcy5kZWxldGUobm9kZSk7XG5cdFx0XHR0aGlzLnJlbmRlcmVkRWxlbWVudHMuZGVsZXRlKG5vZGUuZWxlbWVudCk7XG5cdFx0fVxuXHR9XG5cblx0ZGlzcG9zZVRlbXBsYXRlKHRlbXBsYXRlRGF0YTogSVRyZWVMaXN0VGVtcGxhdGVEYXRhPFRUZW1wbGF0ZURhdGE+KTogdm9pZCB7XG5cdFx0dGhpcy5yZW5kZXJlci5kaXNwb3NlVGVtcGxhdGUodGVtcGxhdGVEYXRhLnRlbXBsYXRlRGF0YSk7XG5cdH1cblxuXHRwcml2YXRlIG9uRGlkQ2hhbmdlVHdpc3RpZVN0YXRlKGVsZW1lbnQ6IFQpOiB2b2lkIHtcblx0XHRjb25zdCBub2RlID0gdGhpcy5yZW5kZXJlZEVsZW1lbnRzLmdldChlbGVtZW50KTtcblxuXHRcdGlmICghbm9kZSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdHRoaXMub25EaWRDaGFuZ2VOb2RlVHdpc3RpZVN0YXRlKG5vZGUpO1xuXHR9XG5cblx0cHJpdmF0ZSBvbkRpZENoYW5nZU5vZGVUd2lzdGllU3RhdGUobm9kZTogSVRyZWVOb2RlPFQsIFRGaWx0ZXJEYXRhPik6IHZvaWQge1xuXHRcdGNvbnN0IHRlbXBsYXRlRGF0YSA9IHRoaXMucmVuZGVyZWROb2Rlcy5nZXQobm9kZSk7XG5cblx0XHRpZiAoIXRlbXBsYXRlRGF0YSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdHRoaXMuX29uRGlkQ2hhbmdlQWN0aXZlTm9kZXModGhpcy5hY3RpdmVOb2Rlcy5lbGVtZW50cyk7XG5cdFx0dGhpcy5yZW5kZXJUcmVlRWxlbWVudChub2RlLCB0ZW1wbGF0ZURhdGEpO1xuXHR9XG5cblx0cHJpdmF0ZSByZW5kZXJUcmVlRWxlbWVudChub2RlOiBJVHJlZU5vZGU8VCwgVEZpbHRlckRhdGE+LCB0ZW1wbGF0ZURhdGE6IElUcmVlTGlzdFRlbXBsYXRlRGF0YTxUVGVtcGxhdGVEYXRhPik6IHZvaWQge1xuXHRcdHRlbXBsYXRlRGF0YS50d2lzdGllLmNsYXNzTmFtZSA9IHRlbXBsYXRlRGF0YS50d2lzdGllLmNsYXNzTGlzdC5pdGVtKDApITtcblx0XHR0ZW1wbGF0ZURhdGEudHdpc3RpZS5zdHlsZS5wYWRkaW5nTGVmdCA9IGAke3RlbXBsYXRlRGF0YS5pbmRlbnRTaXplfXB4YDtcblx0XHR0ZW1wbGF0ZURhdGEuaW5kZW50LnN0eWxlLndpZHRoID0gYCR7dGVtcGxhdGVEYXRhLmluZGVudFNpemUgKyB0aGlzLmluZGVudCAtIDE2fXB4YDtcblxuXHRcdGlmIChub2RlLmNvbGxhcHNpYmxlKSB7XG5cdFx0XHR0ZW1wbGF0ZURhdGEuY29udGFpbmVyLnNldEF0dHJpYnV0ZSgnYXJpYS1leHBhbmRlZCcsIFN0cmluZyghbm9kZS5jb2xsYXBzZWQpKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0dGVtcGxhdGVEYXRhLmNvbnRhaW5lci5yZW1vdmVBdHRyaWJ1dGUoJ2FyaWEtZXhwYW5kZWQnKTtcblx0XHR9XG5cblx0XHR0ZW1wbGF0ZURhdGEudHdpc3RpZS5jbGFzc0xpc3QucmVtb3ZlKC4uLlRoZW1lSWNvbi5hc0NsYXNzTmFtZUFycmF5KENvZGljb24udHJlZUl0ZW1FeHBhbmRlZCkpO1xuXG5cdFx0bGV0IHR3aXN0aWVSZW5kZXJlZCA9IGZhbHNlO1xuXG5cdFx0aWYgKHRoaXMucmVuZGVyZXIucmVuZGVyVHdpc3RpZSkge1xuXHRcdFx0dHdpc3RpZVJlbmRlcmVkID0gdGhpcy5yZW5kZXJlci5yZW5kZXJUd2lzdGllKG5vZGUuZWxlbWVudCwgdGVtcGxhdGVEYXRhLnR3aXN0aWUpO1xuXHRcdH1cblxuXHRcdGlmIChub2RlLmNvbGxhcHNpYmxlICYmICghdGhpcy5oaWRlVHdpc3RpZXNPZkNoaWxkbGVzc0VsZW1lbnRzIHx8IG5vZGUudmlzaWJsZUNoaWxkcmVuQ291bnQgPiAwKSkge1xuXHRcdFx0aWYgKCF0d2lzdGllUmVuZGVyZWQpIHtcblx0XHRcdFx0dGVtcGxhdGVEYXRhLnR3aXN0aWUuY2xhc3NMaXN0LmFkZCguLi5UaGVtZUljb24uYXNDbGFzc05hbWVBcnJheShDb2RpY29uLnRyZWVJdGVtRXhwYW5kZWQpKTtcblx0XHRcdH1cblxuXHRcdFx0dGVtcGxhdGVEYXRhLnR3aXN0aWUuY2xhc3NMaXN0LmFkZCgnY29sbGFwc2libGUnKTtcblx0XHRcdHRlbXBsYXRlRGF0YS50d2lzdGllLmNsYXNzTGlzdC50b2dnbGUoJ2NvbGxhcHNlZCcsIG5vZGUuY29sbGFwc2VkKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0dGVtcGxhdGVEYXRhLnR3aXN0aWUuY2xhc3NMaXN0LnJlbW92ZSgnY29sbGFwc2libGUnLCAnY29sbGFwc2VkJyk7XG5cdFx0fVxuXG5cdFx0Ly8gQWRkaXRpb25hbCB0d2lzdGllIGNsYXNzXG5cdFx0aWYgKHRoaXMudHdpc3RpZUFkZGl0aW9uYWxDc3NDbGFzcykge1xuXHRcdFx0Y29uc3QgYWRkaXRpb25hbENsYXNzID0gdGhpcy50d2lzdGllQWRkaXRpb25hbENzc0NsYXNzKG5vZGUuZWxlbWVudCk7XG5cdFx0XHRpZiAoYWRkaXRpb25hbENsYXNzKSB7XG5cdFx0XHRcdHRlbXBsYXRlRGF0YS50d2lzdGllLmNsYXNzTGlzdC5hZGQoYWRkaXRpb25hbENsYXNzKTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHR0aGlzLl9yZW5kZXJJbmRlbnRHdWlkZXMobm9kZSwgdGVtcGxhdGVEYXRhKTtcblx0fVxuXG5cdHByaXZhdGUgX3JlbmRlckluZGVudEd1aWRlcyhub2RlOiBJVHJlZU5vZGU8VCwgVEZpbHRlckRhdGE+LCB0ZW1wbGF0ZURhdGE6IElUcmVlTGlzdFRlbXBsYXRlRGF0YTxUVGVtcGxhdGVEYXRhPik6IHZvaWQge1xuXHRcdGNsZWFyTm9kZSh0ZW1wbGF0ZURhdGEuaW5kZW50KTtcblx0XHR0ZW1wbGF0ZURhdGEuaW5kZW50R3VpZGVzRGlzcG9zYWJsZS5kaXNwb3NlKCk7XG5cblx0XHRpZiAoIXRoaXMuc2hvdWxkUmVuZGVySW5kZW50R3VpZGVzKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29uc3QgZGlzcG9zYWJsZVN0b3JlID0gbmV3IERpc3Bvc2FibGVTdG9yZSgpO1xuXG5cdFx0d2hpbGUgKHRydWUpIHtcblx0XHRcdGNvbnN0IHJlZiA9IHRoaXMubW9kZWwuZ2V0Tm9kZUxvY2F0aW9uKG5vZGUpO1xuXHRcdFx0Y29uc3QgcGFyZW50UmVmID0gdGhpcy5tb2RlbC5nZXRQYXJlbnROb2RlTG9jYXRpb24ocmVmKTtcblxuXHRcdFx0aWYgKCFwYXJlbnRSZWYpIHtcblx0XHRcdFx0YnJlYWs7XG5cdFx0XHR9XG5cblx0XHRcdGNvbnN0IHBhcmVudCA9IHRoaXMubW9kZWwuZ2V0Tm9kZShwYXJlbnRSZWYpO1xuXHRcdFx0Y29uc3QgZ3VpZGUgPSAkPEhUTUxEaXZFbGVtZW50PignLmluZGVudC1ndWlkZScsIHsgc3R5bGU6IGB3aWR0aDogJHt0aGlzLmluZGVudH1weGAgfSk7XG5cblx0XHRcdGlmICh0aGlzLmFjdGl2ZUluZGVudE5vZGVzLmhhcyhwYXJlbnQpKSB7XG5cdFx0XHRcdGd1aWRlLmNsYXNzTGlzdC5hZGQoJ2FjdGl2ZScpO1xuXHRcdFx0fVxuXG5cdFx0XHRpZiAodGVtcGxhdGVEYXRhLmluZGVudC5jaGlsZEVsZW1lbnRDb3VudCA9PT0gMCkge1xuXHRcdFx0XHR0ZW1wbGF0ZURhdGEuaW5kZW50LmFwcGVuZENoaWxkKGd1aWRlKTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdHRlbXBsYXRlRGF0YS5pbmRlbnQuaW5zZXJ0QmVmb3JlKGd1aWRlLCB0ZW1wbGF0ZURhdGEuaW5kZW50LmZpcnN0RWxlbWVudENoaWxkKTtcblx0XHRcdH1cblxuXHRcdFx0dGhpcy5yZW5kZXJlZEluZGVudEd1aWRlcy5hZGQocGFyZW50LCBndWlkZSk7XG5cdFx0XHRkaXNwb3NhYmxlU3RvcmUuYWRkKHRvRGlzcG9zYWJsZSgoKSA9PiB0aGlzLnJlbmRlcmVkSW5kZW50R3VpZGVzLmRlbGV0ZShwYXJlbnQsIGd1aWRlKSkpO1xuXG5cdFx0XHRub2RlID0gcGFyZW50O1xuXHRcdH1cblxuXHRcdHRlbXBsYXRlRGF0YS5pbmRlbnRHdWlkZXNEaXNwb3NhYmxlID0gZGlzcG9zYWJsZVN0b3JlO1xuXHR9XG5cblx0cHJpdmF0ZSBfb25EaWRDaGFuZ2VBY3RpdmVOb2Rlcyhub2RlczogSVRyZWVOb2RlPFQsIFRGaWx0ZXJEYXRhPltdKTogdm9pZCB7XG5cdFx0aWYgKCF0aGlzLnNob3VsZFJlbmRlckluZGVudEd1aWRlcykge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IHNldCA9IG5ldyBTZXQ8SVRyZWVOb2RlPFQsIFRGaWx0ZXJEYXRhPj4oKTtcblxuXHRcdG5vZGVzLmZvckVhY2gobm9kZSA9PiB7XG5cdFx0XHRjb25zdCByZWYgPSB0aGlzLm1vZGVsLmdldE5vZGVMb2NhdGlvbihub2RlKTtcblx0XHRcdHRyeSB7XG5cdFx0XHRcdGNvbnN0IHBhcmVudFJlZiA9IHRoaXMubW9kZWwuZ2V0UGFyZW50Tm9kZUxvY2F0aW9uKHJlZik7XG5cblx0XHRcdFx0aWYgKG5vZGUuY29sbGFwc2libGUgJiYgbm9kZS5jaGlsZHJlbi5sZW5ndGggPiAwICYmICFub2RlLmNvbGxhcHNlZCkge1xuXHRcdFx0XHRcdHNldC5hZGQobm9kZSk7XG5cdFx0XHRcdH0gZWxzZSBpZiAocGFyZW50UmVmKSB7XG5cdFx0XHRcdFx0c2V0LmFkZCh0aGlzLm1vZGVsLmdldE5vZGUocGFyZW50UmVmKSk7XG5cdFx0XHRcdH1cblx0XHRcdH0gY2F0Y2gge1xuXHRcdFx0XHQvLyBub29wXG5cdFx0XHR9XG5cdFx0fSk7XG5cblx0XHR0aGlzLmFjdGl2ZUluZGVudE5vZGVzLmZvckVhY2gobm9kZSA9PiB7XG5cdFx0XHRpZiAoIXNldC5oYXMobm9kZSkpIHtcblx0XHRcdFx0dGhpcy5yZW5kZXJlZEluZGVudEd1aWRlcy5mb3JFYWNoKG5vZGUsIGxpbmUgPT4gbGluZS5jbGFzc0xpc3QucmVtb3ZlKCdhY3RpdmUnKSk7XG5cdFx0XHR9XG5cdFx0fSk7XG5cblx0XHRzZXQuZm9yRWFjaChub2RlID0+IHtcblx0XHRcdGlmICghdGhpcy5hY3RpdmVJbmRlbnROb2Rlcy5oYXMobm9kZSkpIHtcblx0XHRcdFx0dGhpcy5yZW5kZXJlZEluZGVudEd1aWRlcy5mb3JFYWNoKG5vZGUsIGxpbmUgPT4gbGluZS5jbGFzc0xpc3QuYWRkKCdhY3RpdmUnKSk7XG5cdFx0XHR9XG5cdFx0fSk7XG5cblx0XHR0aGlzLmFjdGl2ZUluZGVudE5vZGVzID0gc2V0O1xuXHR9XG5cblx0ZGlzcG9zZSgpOiB2b2lkIHtcblx0XHR0aGlzLnJlbmRlcmVkTm9kZXMuY2xlYXIoKTtcblx0XHR0aGlzLnJlbmRlcmVkRWxlbWVudHMuY2xlYXIoKTtcblx0XHR0aGlzLmluZGVudEd1aWRlc0Rpc3Bvc2FibGUuZGlzcG9zZSgpO1xuXHRcdGRpc3Bvc2UodGhpcy5kaXNwb3NhYmxlcyk7XG5cdH1cbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGNvbnRpZ3VvdXNGdXp6eVNjb3JlKHBhdHRlcm5Mb3dlcjogc3RyaW5nLCB3b3JkTG93ZXI6IHN0cmluZyk6IEZ1enp5U2NvcmUgfCB1bmRlZmluZWQge1xuXHRjb25zdCBpbmRleCA9IHdvcmRMb3dlci50b0xvd2VyQ2FzZSgpLmluZGV4T2YocGF0dGVybkxvd2VyKTtcblx0bGV0IHNjb3JlOiBGdXp6eVNjb3JlIHwgdW5kZWZpbmVkO1xuXHRpZiAoaW5kZXggPiAtMSkge1xuXHRcdHNjb3JlID0gW051bWJlci5NQVhfU0FGRV9JTlRFR0VSLCAwXTtcblx0XHRmb3IgKGxldCBpID0gcGF0dGVybkxvd2VyLmxlbmd0aDsgaSA+IDA7IGktLSkge1xuXHRcdFx0c2NvcmUucHVzaChpbmRleCArIGkgLSAxKTtcblx0XHR9XG5cdH1cblx0cmV0dXJuIHNjb3JlO1xufVxuXG5leHBvcnQgdHlwZSBMYWJlbEZ1enp5U2NvcmUgPSB7IGxhYmVsOiBzdHJpbmc7IHNjb3JlOiBGdXp6eVNjb3JlIH07XG5cbmV4cG9ydCBpbnRlcmZhY2UgSUZpbmRGaWx0ZXI8VD4gZXh0ZW5kcyBJVHJlZUZpbHRlcjxULCBGdXp6eVNjb3JlIHwgTGFiZWxGdXp6eVNjb3JlPiB7XG5cdGZpbHRlcihlbGVtZW50OiBULCBwYXJlbnRWaXNpYmlsaXR5OiBUcmVlVmlzaWJpbGl0eSk6IFRyZWVGaWx0ZXJSZXN1bHQ8RnV6enlTY29yZSB8IExhYmVsRnV6enlTY29yZT47XG5cdHBhdHRlcm46IHN0cmluZztcbn1cblxuZXhwb3J0IGNsYXNzIEZpbmRGaWx0ZXI8VD4gaW1wbGVtZW50cyBJRmluZEZpbHRlcjxUPiwgSURpc3Bvc2FibGUge1xuXHRwcml2YXRlIF90b3RhbENvdW50ID0gMDtcblx0Z2V0IHRvdGFsQ291bnQoKTogbnVtYmVyIHsgcmV0dXJuIHRoaXMuX3RvdGFsQ291bnQ7IH1cblx0cHJpdmF0ZSBfbWF0Y2hDb3VudCA9IDA7XG5cdGdldCBtYXRjaENvdW50KCk6IG51bWJlciB7IHJldHVybiB0aGlzLl9tYXRjaENvdW50OyB9XG5cblx0cHJpdmF0ZSBfZmluZE1hdGNoVHlwZTogVHJlZUZpbmRNYXRjaFR5cGUgPSBUcmVlRmluZE1hdGNoVHlwZS5GdXp6eTtcblx0c2V0IGZpbmRNYXRjaFR5cGUodHlwZTogVHJlZUZpbmRNYXRjaFR5cGUpIHsgdGhpcy5fZmluZE1hdGNoVHlwZSA9IHR5cGU7IH1cblx0Z2V0IGZpbmRNYXRjaFR5cGUoKTogVHJlZUZpbmRNYXRjaFR5cGUgeyByZXR1cm4gdGhpcy5fZmluZE1hdGNoVHlwZTsgfVxuXG5cdHByaXZhdGUgX2ZpbmRNb2RlOiBUcmVlRmluZE1vZGUgPSBUcmVlRmluZE1vZGUuSGlnaGxpZ2h0O1xuXHRzZXQgZmluZE1vZGUobW9kZTogVHJlZUZpbmRNb2RlKSB7IHRoaXMuX2ZpbmRNb2RlID0gbW9kZTsgfVxuXHRnZXQgZmluZE1vZGUoKTogVHJlZUZpbmRNb2RlIHsgcmV0dXJuIHRoaXMuX2ZpbmRNb2RlOyB9XG5cblx0cHJpdmF0ZSBfcGF0dGVybjogc3RyaW5nID0gJyc7XG5cdHByaXZhdGUgX2xvd2VyY2FzZVBhdHRlcm46IHN0cmluZyA9ICcnO1xuXHRwcml2YXRlIHJlYWRvbmx5IGRpc3Bvc2FibGVzID0gbmV3IERpc3Bvc2FibGVTdG9yZSgpO1xuXG5cdHNldCBwYXR0ZXJuKHBhdHRlcm46IHN0cmluZykge1xuXHRcdHRoaXMuX3BhdHRlcm4gPSBwYXR0ZXJuO1xuXHRcdHRoaXMuX2xvd2VyY2FzZVBhdHRlcm4gPSBwYXR0ZXJuLnRvTG93ZXJDYXNlKCk7XG5cdH1cblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRwcml2YXRlIHJlYWRvbmx5IF9rZXlib2FyZE5hdmlnYXRpb25MYWJlbFByb3ZpZGVyOiBJS2V5Ym9hcmROYXZpZ2F0aW9uTGFiZWxQcm92aWRlcjxUPixcblx0XHRwcml2YXRlIHJlYWRvbmx5IF9maWx0ZXI/OiBJVHJlZUZpbHRlcjxULCBGdXp6eVNjb3JlPixcblx0XHRwcml2YXRlIHJlYWRvbmx5IF9kZWZhdWx0RmluZFZpc2liaWxpdHk/OiBUcmVlVmlzaWJpbGl0eSB8ICgobm9kZTogVCkgPT4gVHJlZVZpc2liaWxpdHkpLFxuXHQpIHsgfVxuXG5cdGZpbHRlcihlbGVtZW50OiBULCBwYXJlbnRWaXNpYmlsaXR5OiBUcmVlVmlzaWJpbGl0eSk6IFRyZWVGaWx0ZXJSZXN1bHQ8RnV6enlTY29yZSB8IExhYmVsRnV6enlTY29yZT4ge1xuXHRcdGxldCB2aXNpYmlsaXR5ID0gVHJlZVZpc2liaWxpdHkuVmlzaWJsZTtcblxuXHRcdGlmICh0aGlzLl9maWx0ZXIpIHtcblx0XHRcdGNvbnN0IHJlc3VsdCA9IHRoaXMuX2ZpbHRlci5maWx0ZXIoZWxlbWVudCwgcGFyZW50VmlzaWJpbGl0eSk7XG5cblx0XHRcdGlmICh0eXBlb2YgcmVzdWx0ID09PSAnYm9vbGVhbicpIHtcblx0XHRcdFx0dmlzaWJpbGl0eSA9IHJlc3VsdCA/IFRyZWVWaXNpYmlsaXR5LlZpc2libGUgOiBUcmVlVmlzaWJpbGl0eS5IaWRkZW47XG5cdFx0XHR9IGVsc2UgaWYgKGlzRmlsdGVyUmVzdWx0KHJlc3VsdCkpIHtcblx0XHRcdFx0dmlzaWJpbGl0eSA9IGdldFZpc2libGVTdGF0ZShyZXN1bHQudmlzaWJpbGl0eSk7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHR2aXNpYmlsaXR5ID0gcmVzdWx0O1xuXHRcdFx0fVxuXG5cdFx0XHRpZiAodmlzaWJpbGl0eSA9PT0gVHJlZVZpc2liaWxpdHkuSGlkZGVuKSB7XG5cdFx0XHRcdHJldHVybiBmYWxzZTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHR0aGlzLl90b3RhbENvdW50Kys7XG5cblx0XHRpZiAoIXRoaXMuX3BhdHRlcm4pIHtcblx0XHRcdHRoaXMuX21hdGNoQ291bnQrKztcblx0XHRcdHJldHVybiB7IGRhdGE6IEZ1enp5U2NvcmUuRGVmYXVsdCwgdmlzaWJpbGl0eSB9O1xuXHRcdH1cblxuXHRcdGNvbnN0IGxhYmVsID0gdGhpcy5fa2V5Ym9hcmROYXZpZ2F0aW9uTGFiZWxQcm92aWRlci5nZXRLZXlib2FyZE5hdmlnYXRpb25MYWJlbChlbGVtZW50KTtcblx0XHRjb25zdCBsYWJlbHMgPSBBcnJheS5pc0FycmF5KGxhYmVsKSA/IGxhYmVsIDogW2xhYmVsXTtcblxuXHRcdGZvciAoY29uc3QgbCBvZiBsYWJlbHMpIHtcblx0XHRcdGNvbnN0IGxhYmVsU3RyOiBzdHJpbmcgPSBsICYmIGwudG9TdHJpbmcoKTtcblx0XHRcdGlmICh0eXBlb2YgbGFiZWxTdHIgPT09ICd1bmRlZmluZWQnKSB7XG5cdFx0XHRcdHJldHVybiB7IGRhdGE6IEZ1enp5U2NvcmUuRGVmYXVsdCwgdmlzaWJpbGl0eSB9O1xuXHRcdFx0fVxuXG5cdFx0XHRsZXQgc2NvcmU6IEZ1enp5U2NvcmUgfCB1bmRlZmluZWQ7XG5cdFx0XHRpZiAodGhpcy5fZmluZE1hdGNoVHlwZSA9PT0gVHJlZUZpbmRNYXRjaFR5cGUuQ29udGlndW91cykge1xuXHRcdFx0XHRzY29yZSA9IGNvbnRpZ3VvdXNGdXp6eVNjb3JlKHRoaXMuX2xvd2VyY2FzZVBhdHRlcm4sIGxhYmVsU3RyLnRvTG93ZXJDYXNlKCkpO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0c2NvcmUgPSBmdXp6eVNjb3JlKHRoaXMuX3BhdHRlcm4sIHRoaXMuX2xvd2VyY2FzZVBhdHRlcm4sIDAsIGxhYmVsU3RyLCBsYWJlbFN0ci50b0xvd2VyQ2FzZSgpLCAwLCB7IGZpcnN0TWF0Y2hDYW5CZVdlYWs6IHRydWUsIGJvb3N0RnVsbE1hdGNoOiB0cnVlIH0pO1xuXHRcdFx0fVxuXHRcdFx0aWYgKHNjb3JlKSB7XG5cdFx0XHRcdHRoaXMuX21hdGNoQ291bnQrKztcblx0XHRcdFx0cmV0dXJuIGxhYmVscy5sZW5ndGggPT09IDEgP1xuXHRcdFx0XHRcdHsgZGF0YTogc2NvcmUsIHZpc2liaWxpdHkgfSA6XG5cdFx0XHRcdFx0eyBkYXRhOiB7IGxhYmVsOiBsYWJlbFN0ciwgc2NvcmU6IHNjb3JlIH0sIHZpc2liaWxpdHkgfTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRpZiAodGhpcy5fZmluZE1vZGUgPT09IFRyZWVGaW5kTW9kZS5GaWx0ZXIpIHtcblx0XHRcdGlmICh0eXBlb2YgdGhpcy5fZGVmYXVsdEZpbmRWaXNpYmlsaXR5ID09PSAnbnVtYmVyJykge1xuXHRcdFx0XHRyZXR1cm4gdGhpcy5fZGVmYXVsdEZpbmRWaXNpYmlsaXR5O1xuXHRcdFx0fSBlbHNlIGlmICh0aGlzLl9kZWZhdWx0RmluZFZpc2liaWxpdHkpIHtcblx0XHRcdFx0cmV0dXJuIHRoaXMuX2RlZmF1bHRGaW5kVmlzaWJpbGl0eShlbGVtZW50KTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdHJldHVybiBUcmVlVmlzaWJpbGl0eS5SZWN1cnNlO1xuXHRcdFx0fVxuXHRcdH0gZWxzZSB7XG5cdFx0XHRyZXR1cm4geyBkYXRhOiBGdXp6eVNjb3JlLkRlZmF1bHQsIHZpc2liaWxpdHkgfTtcblx0XHR9XG5cdH1cblxuXHRyZXNldCgpOiB2b2lkIHtcblx0XHR0aGlzLl90b3RhbENvdW50ID0gMDtcblx0XHR0aGlzLl9tYXRjaENvdW50ID0gMDtcblx0fVxuXG5cdGRpc3Bvc2UoKTogdm9pZCB7XG5cdFx0ZGlzcG9zZSh0aGlzLmRpc3Bvc2FibGVzKTtcblx0fVxufVxuXG5leHBvcnQgaW50ZXJmYWNlIElUcmVlRmluZFRvZ2dsZUNvbnRyaWJ1dGlvbiB7XG5cdGlkOiBzdHJpbmc7XG5cdHRpdGxlOiBzdHJpbmc7XG5cdGljb246IFRoZW1lSWNvbjtcblx0aXNDaGVja2VkOiBib29sZWFuO1xufVxuXG5jbGFzcyBUcmVlRmluZFRvZ2dsZSBleHRlbmRzIFRvZ2dsZSB7XG5cblx0cmVhZG9ubHkgaWQ6IHN0cmluZztcblxuXHRjb25zdHJ1Y3Rvcihjb250cmlidXRpb246IElUcmVlRmluZFRvZ2dsZUNvbnRyaWJ1dGlvbiwgb3B0czogSVRvZ2dsZVN0eWxlcywgaG92ZXJMaWZlY3ljbGVPcHRpb25zPzogSUhvdmVyTGlmZWN5Y2xlT3B0aW9ucykge1xuXHRcdHN1cGVyKHtcblx0XHRcdGljb246IGNvbnRyaWJ1dGlvbi5pY29uLFxuXHRcdFx0dGl0bGU6IGNvbnRyaWJ1dGlvbi50aXRsZSxcblx0XHRcdGlzQ2hlY2tlZDogY29udHJpYnV0aW9uLmlzQ2hlY2tlZCxcblx0XHRcdGlucHV0QWN0aXZlT3B0aW9uQm9yZGVyOiBvcHRzLmlucHV0QWN0aXZlT3B0aW9uQm9yZGVyLFxuXHRcdFx0aW5wdXRBY3RpdmVPcHRpb25Gb3JlZ3JvdW5kOiBvcHRzLmlucHV0QWN0aXZlT3B0aW9uRm9yZWdyb3VuZCxcblx0XHRcdGlucHV0QWN0aXZlT3B0aW9uQmFja2dyb3VuZDogb3B0cy5pbnB1dEFjdGl2ZU9wdGlvbkJhY2tncm91bmQsXG5cdFx0XHRob3ZlckxpZmVjeWNsZU9wdGlvbnMsXG5cdFx0fSk7XG5cblx0XHR0aGlzLmlkID0gY29udHJpYnV0aW9uLmlkO1xuXHR9XG59XG5cbmV4cG9ydCBjbGFzcyBGaW5kVG9nZ2xlcyB7XG5cdHByaXZhdGUgc3RhdGVNYXA6IE1hcDxzdHJpbmcsIElUcmVlRmluZFRvZ2dsZUNvbnRyaWJ1dGlvbj47XG5cblx0Y29uc3RydWN0b3Ioc3RhcnRTdGF0ZXM6IElUcmVlRmluZFRvZ2dsZUNvbnRyaWJ1dGlvbltdKSB7XG5cdFx0dGhpcy5zdGF0ZU1hcCA9IG5ldyBNYXAoc3RhcnRTdGF0ZXMubWFwKHN0YXRlID0+IFtzdGF0ZS5pZCwgeyAuLi5zdGF0ZSB9XSkpO1xuXHR9XG5cblx0c3RhdGVzKCk6IElUcmVlRmluZFRvZ2dsZUNvbnRyaWJ1dGlvbltdIHtcblx0XHRyZXR1cm4gQXJyYXkuZnJvbSh0aGlzLnN0YXRlTWFwLnZhbHVlcygpKTtcblx0fVxuXG5cdGdldChpZDogc3RyaW5nKTogYm9vbGVhbiB7XG5cdFx0Y29uc3Qgc3RhdGUgPSB0aGlzLnN0YXRlTWFwLmdldChpZCk7XG5cdFx0aWYgKHN0YXRlID09PSB1bmRlZmluZWQpIHtcblx0XHRcdHRocm93IG5ldyBFcnJvcihgTm8gc3RhdGUgZm91bmQgZm9yIHRvZ2dsZSBpZCAke2lkfWApO1xuXHRcdH1cblx0XHRyZXR1cm4gc3RhdGUuaXNDaGVja2VkO1xuXHR9XG5cblx0c2V0KGlkOiBzdHJpbmcsIHZhbHVlOiBib29sZWFuKTogYm9vbGVhbiB7XG5cdFx0Y29uc3Qgc3RhdGUgPSB0aGlzLnN0YXRlTWFwLmdldChpZCk7XG5cdFx0aWYgKHN0YXRlID09PSB1bmRlZmluZWQpIHtcblx0XHRcdHRocm93IG5ldyBFcnJvcihgTm8gc3RhdGUgZm91bmQgZm9yIHRvZ2dsZSBpZCAke2lkfWApO1xuXHRcdH1cblx0XHRpZiAoc3RhdGUuaXNDaGVja2VkID09PSB2YWx1ZSkge1xuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH1cblx0XHRzdGF0ZS5pc0NoZWNrZWQgPSB2YWx1ZTtcblx0XHRyZXR1cm4gdHJ1ZTtcblx0fVxufVxuXG5leHBvcnQgaW50ZXJmYWNlIElUcmVlRmluZFRvZ2dsZUNoYW5nZUV2ZW50IHtcblx0cmVhZG9ubHkgaWQ6IHN0cmluZztcblx0cmVhZG9ubHkgaXNDaGVja2VkOiBib29sZWFuO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIElGaW5kV2lkZ2V0U3R5bGVzIHtcblx0bGlzdEZpbHRlcldpZGdldEJhY2tncm91bmQ6IHN0cmluZyB8IHVuZGVmaW5lZDtcblx0bGlzdEZpbHRlcldpZGdldE91dGxpbmU6IHN0cmluZyB8IHVuZGVmaW5lZDtcblx0bGlzdEZpbHRlcldpZGdldE5vTWF0Y2hlc091dGxpbmU6IHN0cmluZyB8IHVuZGVmaW5lZDtcblx0bGlzdEZpbHRlcldpZGdldFNoYWRvdzogc3RyaW5nIHwgdW5kZWZpbmVkO1xuXHRyZWFkb25seSB0b2dnbGVTdHlsZXM6IElUb2dnbGVTdHlsZXM7XG5cdHJlYWRvbmx5IGlucHV0Qm94U3R5bGVzOiBJSW5wdXRCb3hTdHlsZXM7XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgSUZpbmRXaWRnZXRPcHRpb25zIHtcblx0cmVhZG9ubHkgaGlzdG9yeT86IHN0cmluZ1tdO1xuXHRyZWFkb25seSBzdHlsZXM/OiBJRmluZFdpZGdldFN0eWxlcztcbn1cblxuY29uc3QgdW50aGVtZWRGaW5kV2lkZ2V0U3R5bGVzOiBJRmluZFdpZGdldFN0eWxlcyA9IHtcblx0aW5wdXRCb3hTdHlsZXM6IHVudGhlbWVkSW5ib3hTdHlsZXMsXG5cdHRvZ2dsZVN0eWxlczogdW50aGVtZWRUb2dnbGVTdHlsZXMsXG5cdGxpc3RGaWx0ZXJXaWRnZXRCYWNrZ3JvdW5kOiB1bmRlZmluZWQsXG5cdGxpc3RGaWx0ZXJXaWRnZXROb01hdGNoZXNPdXRsaW5lOiB1bmRlZmluZWQsXG5cdGxpc3RGaWx0ZXJXaWRnZXRPdXRsaW5lOiB1bmRlZmluZWQsXG5cdGxpc3RGaWx0ZXJXaWRnZXRTaGFkb3c6IHVuZGVmaW5lZFxufTtcblxuZXhwb3J0IGVudW0gVHJlZUZpbmRNb2RlIHtcblx0SGlnaGxpZ2h0LFxuXHRGaWx0ZXJcbn1cblxuZXhwb3J0IGVudW0gVHJlZUZpbmRNYXRjaFR5cGUge1xuXHRGdXp6eSxcblx0Q29udGlndW91c1xufVxuXG5jbGFzcyBGaW5kV2lkZ2V0PFQsIFRGaWx0ZXJEYXRhPiBleHRlbmRzIERpc3Bvc2FibGUge1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgZWxlbWVudHMgPSBoKCcubW9uYWNvLXRyZWUtdHlwZS1maWx0ZXInLCBbXG5cdFx0aCgnLm1vbmFjby10cmVlLXR5cGUtZmlsdGVyLWlucHV0QGZpbmRJbnB1dCcpLFxuXHRcdGgoJy5tb25hY28tdHJlZS10eXBlLWZpbHRlci1hY3Rpb25iYXJAYWN0aW9uYmFyJyksXG5cdF0pO1xuXG5cdGdldCB2YWx1ZSgpOiBzdHJpbmcge1xuXHRcdHJldHVybiB0aGlzLmZpbmRJbnB1dC5pbnB1dEJveC52YWx1ZTtcblx0fVxuXG5cdHNldCB2YWx1ZSh2YWx1ZTogc3RyaW5nKSB7XG5cdFx0dGhpcy5maW5kSW5wdXQuaW5wdXRCb3gudmFsdWUgPSB2YWx1ZTtcblx0fVxuXG5cdHByaXZhdGUgcmVhZG9ubHkgZmluZElucHV0OiBGaW5kSW5wdXQ7XG5cdHByaXZhdGUgcmVhZG9ubHkgYWN0aW9uYmFyOiBBY3Rpb25CYXI7XG5cdHByaXZhdGUgcmVhZG9ubHkgdG9nZ2xlczogVHJlZUZpbmRUb2dnbGVbXSA9IFtdO1xuXG5cdHJlYWRvbmx5IF9vbkRpZERpc2FibGUgPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjx2b2lkPigpKTtcblx0cmVhZG9ubHkgb25EaWREaXNhYmxlID0gdGhpcy5fb25EaWREaXNhYmxlLmV2ZW50O1xuXHRyZWFkb25seSBvbkRpZENoYW5nZVZhbHVlOiBFdmVudDxzdHJpbmc+O1xuXHRyZWFkb25seSBvbkRpZFRvZ2dsZUNoYW5nZTogRXZlbnQ8SVRyZWVGaW5kVG9nZ2xlQ2hhbmdlRXZlbnQ+O1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdGNvbnRhaW5lcjogSFRNTEVsZW1lbnQsXG5cdFx0cHJpdmF0ZSB0cmVlOiBBYnN0cmFjdFRyZWU8VCwgVEZpbHRlckRhdGEsIHVua25vd24+LFxuXHRcdGNvbnRleHRWaWV3UHJvdmlkZXI6IElDb250ZXh0Vmlld1Byb3ZpZGVyLFxuXHRcdHBsYWNlaG9sZGVyOiBzdHJpbmcsXG5cdFx0dG9nZ2xlQ29udHJpYnV0aW9uczogSVRyZWVGaW5kVG9nZ2xlQ29udHJpYnV0aW9uW10gPSBbXSxcblx0XHRvcHRpb25zPzogSUZpbmRXaWRnZXRPcHRpb25zXG5cdCkge1xuXHRcdHN1cGVyKCk7XG5cblx0XHRjb250YWluZXIuYXBwZW5kQ2hpbGQodGhpcy5lbGVtZW50cy5yb290KTtcblx0XHR0aGlzLl9yZWdpc3Rlcih0b0Rpc3Bvc2FibGUoKCkgPT4gdGhpcy5lbGVtZW50cy5yb290LnJlbW92ZSgpKSk7XG5cblx0XHRjb25zdCBzdHlsZXMgPSBvcHRpb25zPy5zdHlsZXMgPz8gdW50aGVtZWRGaW5kV2lkZ2V0U3R5bGVzO1xuXG5cdFx0aWYgKHN0eWxlcy5saXN0RmlsdGVyV2lkZ2V0QmFja2dyb3VuZCkge1xuXHRcdFx0dGhpcy5lbGVtZW50cy5yb290LnN0eWxlLmJhY2tncm91bmRDb2xvciA9IHN0eWxlcy5saXN0RmlsdGVyV2lkZ2V0QmFja2dyb3VuZDtcblx0XHR9XG5cblx0XHRpZiAoc3R5bGVzLmxpc3RGaWx0ZXJXaWRnZXRTaGFkb3cpIHtcblx0XHRcdHRoaXMuZWxlbWVudHMucm9vdC5zdHlsZS5ib3hTaGFkb3cgPSBgMCAwIDhweCAycHggJHtzdHlsZXMubGlzdEZpbHRlcldpZGdldFNoYWRvd31gO1xuXHRcdH1cblxuXHRcdC8vIGNvbnN0IHRvZ2dsZUhvdmVyRGVsZWdhdGUgPSB0aGlzLl9yZWdpc3RlcihjcmVhdGVJbnN0YW50SG92ZXJEZWxlZ2F0ZSgpKTtcblx0XHRjb25zdCBob3ZlckxpZmVjeWNsZU9wdGlvbnM6IElIb3ZlckxpZmVjeWNsZU9wdGlvbnMgPSB7IGdyb3VwSWQ6ICdhYnN0cmFjdC10cmVlJyB9O1xuXHRcdHRoaXMudG9nZ2xlcyA9IHRvZ2dsZUNvbnRyaWJ1dGlvbnMubWFwKGNvbnRyaWJ1dGlvbiA9PiB0aGlzLl9yZWdpc3RlcihuZXcgVHJlZUZpbmRUb2dnbGUoY29udHJpYnV0aW9uLCBzdHlsZXMudG9nZ2xlU3R5bGVzLCBob3ZlckxpZmVjeWNsZU9wdGlvbnMpKSk7XG5cdFx0dGhpcy5vbkRpZFRvZ2dsZUNoYW5nZSA9IEV2ZW50LmFueSguLi50aGlzLnRvZ2dsZXMubWFwKHRvZ2dsZSA9PiBFdmVudC5tYXAodG9nZ2xlLm9uQ2hhbmdlLCAoKSA9PiAoeyBpZDogdG9nZ2xlLmlkLCBpc0NoZWNrZWQ6IHRvZ2dsZS5jaGVja2VkIH0pKSkpO1xuXG5cdFx0Y29uc3QgaGlzdG9yeSA9IG9wdGlvbnM/Lmhpc3RvcnkgfHwgW107XG5cdFx0dGhpcy5maW5kSW5wdXQgPSB0aGlzLl9yZWdpc3RlcihuZXcgRmluZElucHV0KHRoaXMuZWxlbWVudHMuZmluZElucHV0LCBjb250ZXh0Vmlld1Byb3ZpZGVyLCB7XG5cdFx0XHRsYWJlbDogbG9jYWxpemUoJ3R5cGUgdG8gc2VhcmNoJywgXCJUeXBlIHRvIHNlYXJjaFwiKSxcblx0XHRcdHBsYWNlaG9sZGVyLFxuXHRcdFx0YWRkaXRpb25hbFRvZ2dsZXM6IHRoaXMudG9nZ2xlcyxcblx0XHRcdHNob3dDb21tb25GaW5kVG9nZ2xlczogZmFsc2UsXG5cdFx0XHRpbnB1dEJveFN0eWxlczogc3R5bGVzLmlucHV0Qm94U3R5bGVzLFxuXHRcdFx0dG9nZ2xlU3R5bGVzOiBzdHlsZXMudG9nZ2xlU3R5bGVzLFxuXHRcdFx0aGlzdG9yeTogbmV3IFNldChoaXN0b3J5KSxcblx0XHRcdGhvdmVyTGlmZWN5Y2xlT3B0aW9ucyxcblx0XHR9KSk7XG5cblx0XHR0aGlzLmFjdGlvbmJhciA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBBY3Rpb25CYXIodGhpcy5lbGVtZW50cy5hY3Rpb25iYXIpKTtcblxuXHRcdGNvbnN0IGVtaXR0ZXIgPSB0aGlzLl9yZWdpc3RlcihuZXcgRG9tRW1pdHRlcih0aGlzLmZpbmRJbnB1dC5pbnB1dEJveC5pbnB1dEVsZW1lbnQsICdrZXlkb3duJykpO1xuXHRcdGNvbnN0IG9uS2V5RG93biA9IEV2ZW50LmNoYWluKGVtaXR0ZXIuZXZlbnQsICQgPT4gJC5tYXAoZSA9PiBuZXcgU3RhbmRhcmRLZXlib2FyZEV2ZW50KGUpKSk7XG5cblx0XHR0aGlzLl9yZWdpc3RlcihvbktleURvd24oKGUpID0+IHtcblx0XHRcdC8vIFVzaW5nIGVxdWFscygpIHNvIHdlIHJlc2VydmUgbW9kaWZpZWQga2V5cyBmb3IgZnV0dXJlIHVzZVxuXHRcdFx0aWYgKGUuZXF1YWxzKEtleUNvZGUuRW50ZXIpKSB7XG5cdFx0XHRcdC8vIFRoaXMgaXMgdGhlIG9ubHkga2V5Ym9hcmQgd2F5IHRvIHJldHVybiB0byB0aGUgdHJlZSBmcm9tIGEgaGlzdG9yeSBpdGVtIHRoYXQgaXNuJ3QgdGhlIGxhc3Qgb25lXG5cdFx0XHRcdGUucHJldmVudERlZmF1bHQoKTtcblx0XHRcdFx0ZS5zdG9wUHJvcGFnYXRpb24oKTtcblx0XHRcdFx0dGhpcy5maW5kSW5wdXQuaW5wdXRCb3guYWRkVG9IaXN0b3J5KCk7XG5cdFx0XHRcdHRoaXMudHJlZS5kb21Gb2N1cygpO1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cdFx0XHRpZiAoZS5lcXVhbHMoS2V5Q29kZS5Eb3duQXJyb3cpKSB7XG5cdFx0XHRcdGUucHJldmVudERlZmF1bHQoKTtcblx0XHRcdFx0ZS5zdG9wUHJvcGFnYXRpb24oKTtcblx0XHRcdFx0aWYgKHRoaXMuZmluZElucHV0LmlucHV0Qm94LmlzQXRMYXN0SW5IaXN0b3J5KCkgfHwgdGhpcy5maW5kSW5wdXQuaW5wdXRCb3guaXNOb3doZXJlSW5IaXN0b3J5KCkpIHtcblx0XHRcdFx0XHQvLyBSZXRhaW4gb3JpZ2luYWwgcHJlLWhpc3RvcnkgRG93bkFycm93IGJlaGF2aW9yXG5cdFx0XHRcdFx0dGhpcy5maW5kSW5wdXQuaW5wdXRCb3guYWRkVG9IaXN0b3J5KCk7XG5cdFx0XHRcdFx0dGhpcy50cmVlLmRvbUZvY3VzKCk7XG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0Ly8gRG93bndhcmQgdGhyb3VnaCBoaXN0b3J5XG5cdFx0XHRcdFx0dGhpcy5maW5kSW5wdXQuaW5wdXRCb3guc2hvd05leHRWYWx1ZSgpO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblx0XHRcdGlmIChlLmVxdWFscyhLZXlDb2RlLlVwQXJyb3cpKSB7XG5cdFx0XHRcdGUucHJldmVudERlZmF1bHQoKTtcblx0XHRcdFx0ZS5zdG9wUHJvcGFnYXRpb24oKTtcblx0XHRcdFx0Ly8gVXB3YXJkIHRocm91Z2ggaGlzdG9yeVxuXHRcdFx0XHR0aGlzLmZpbmRJbnB1dC5pbnB1dEJveC5zaG93UHJldmlvdXNWYWx1ZSgpO1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cdFx0fSkpO1xuXG5cdFx0Y29uc3QgY2xvc2VBY3Rpb24gPSB0aGlzLl9yZWdpc3RlcihuZXcgQWN0aW9uKCdjbG9zZScsIGxvY2FsaXplKCdjbG9zZScsIFwiQ2xvc2VcIiksICdjb2RpY29uIGNvZGljb24tY2xvc2UnLCB0cnVlLCAoKSA9PiB0aGlzLmRpc3Bvc2UoKSkpO1xuXHRcdHRoaXMuYWN0aW9uYmFyLnB1c2goY2xvc2VBY3Rpb24sIHsgaWNvbjogdHJ1ZSwgbGFiZWw6IGZhbHNlIH0pO1xuXG5cdFx0dGhpcy5vbkRpZENoYW5nZVZhbHVlID0gdGhpcy5maW5kSW5wdXQub25EaWRDaGFuZ2U7XG5cdH1cblxuXHRzZXRUb2dnbGVTdGF0ZShpZDogc3RyaW5nLCBjaGVja2VkOiBib29sZWFuKTogdm9pZCB7XG5cdFx0Y29uc3QgdG9nZ2xlID0gdGhpcy50b2dnbGVzLmZpbmQodG9nZ2xlID0+IHRvZ2dsZS5pZCA9PT0gaWQpO1xuXHRcdGlmICh0b2dnbGUpIHtcblx0XHRcdHRvZ2dsZS5jaGVja2VkID0gY2hlY2tlZDtcblx0XHR9XG5cdH1cblxuXHRzZXRQbGFjZUhvbGRlcihwbGFjZUhvbGRlcjogc3RyaW5nKTogdm9pZCB7XG5cdFx0dGhpcy5maW5kSW5wdXQuaW5wdXRCb3guc2V0UGxhY2VIb2xkZXIocGxhY2VIb2xkZXIpO1xuXHR9XG5cblx0Z2V0SGlzdG9yeSgpOiBzdHJpbmdbXSB7XG5cdFx0cmV0dXJuIHRoaXMuZmluZElucHV0LmlucHV0Qm94LmdldEhpc3RvcnkoKTtcblx0fVxuXG5cdGZvY3VzKCkge1xuXHRcdHRoaXMuZmluZElucHV0LmZvY3VzKCk7XG5cdH1cblxuXHRzZWxlY3QoKSB7XG5cdFx0dGhpcy5maW5kSW5wdXQuc2VsZWN0KCk7XG5cblx0XHQvLyBSZXBvc2l0aW9uIHRvIGxhc3QgaW4gaGlzdG9yeVxuXHRcdHRoaXMuZmluZElucHV0LmlucHV0Qm94LmFkZFRvSGlzdG9yeSh0cnVlKTtcblx0fVxuXG5cdHNob3dNZXNzYWdlKG1lc3NhZ2U6IElNZXNzYWdlKTogdm9pZCB7XG5cdFx0dGhpcy5maW5kSW5wdXQuc2hvd01lc3NhZ2UobWVzc2FnZSk7XG5cdH1cblxuXHRjbGVhck1lc3NhZ2UoKTogdm9pZCB7XG5cdFx0dGhpcy5maW5kSW5wdXQuY2xlYXJNZXNzYWdlKCk7XG5cdH1cblxuXHRvdmVycmlkZSBhc3luYyBkaXNwb3NlKCk6IFByb21pc2U8dm9pZD4ge1xuXHRcdHRoaXMuX29uRGlkRGlzYWJsZS5maXJlKCk7XG5cdFx0dGhpcy5lbGVtZW50cy5yb290LmNsYXNzTGlzdC5hZGQoJ2Rpc2FibGVkJyk7XG5cdFx0YXdhaXQgdGltZW91dCgzMDApO1xuXHRcdHN1cGVyLmRpc3Bvc2UoKTtcblx0fVxufVxuXG5lbnVtIERlZmF1bHRUcmVlVG9nZ2xlcyB7XG5cdE1vZGUgPSAnbW9kZScsXG5cdE1hdGNoVHlwZSA9ICdtYXRjaFR5cGUnLFxufVxuXG5pbnRlcmZhY2UgSUFic3RyYWN0RmluZENvbnRyb2xsZXJPcHRpb25zIGV4dGVuZHMgSUZpbmRXaWRnZXRPcHRpb25zIHtcblx0cGxhY2Vob2xkZXI/OiBzdHJpbmc7XG5cdHRvZ2dsZXM/OiBJVHJlZUZpbmRUb2dnbGVDb250cmlidXRpb25bXTtcblx0c2hvd05vdEZvdW5kTWVzc2FnZT86IGJvb2xlYW47XG5cdGZpbmRXaWRnZXRDb250YWluZXI/OiBIVE1MRWxlbWVudDtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBJRmluZENvbnRyb2xsZXJPcHRpb25zIGV4dGVuZHMgSUFic3RyYWN0RmluZENvbnRyb2xsZXJPcHRpb25zIHtcblx0ZGVmYXVsdEZpbmRNb2RlPzogVHJlZUZpbmRNb2RlO1xuXHRkZWZhdWx0RmluZE1hdGNoVHlwZT86IFRyZWVGaW5kTWF0Y2hUeXBlO1xufVxuXG5leHBvcnQgYWJzdHJhY3QgY2xhc3MgQWJzdHJhY3RGaW5kQ29udHJvbGxlcjxULCBURmlsdGVyRGF0YT4gaW1wbGVtZW50cyBJRGlzcG9zYWJsZSB7XG5cblx0cHJpdmF0ZSBfaGlzdG9yeTogc3RyaW5nW10gfCB1bmRlZmluZWQ7XG5cblx0cHJpdmF0ZSBfcGF0dGVybiA9ICcnO1xuXHRnZXQgcGF0dGVybigpOiBzdHJpbmcgeyByZXR1cm4gdGhpcy5fcGF0dGVybjsgfVxuXHRwcml2YXRlIHByZXZpb3VzUGF0dGVybiA9ICcnO1xuXG5cdHByb3RlY3RlZCByZWFkb25seSB0b2dnbGVzOiBGaW5kVG9nZ2xlcztcblxuXHRwcml2YXRlIF9wbGFjZWhvbGRlcjogc3RyaW5nO1xuXHRwcm90ZWN0ZWQgZ2V0IHBsYWNlaG9sZGVyKCk6IHN0cmluZyB7IHJldHVybiB0aGlzLl9wbGFjZWhvbGRlcjsgfVxuXHRwcm90ZWN0ZWQgc2V0IHBsYWNlaG9sZGVyKHZhbHVlOiBzdHJpbmcpIHtcblx0XHR0aGlzLl9wbGFjZWhvbGRlciA9IHZhbHVlO1xuXHRcdHRoaXMud2lkZ2V0Py5zZXRQbGFjZUhvbGRlcih2YWx1ZSk7XG5cdH1cblxuXHRwcml2YXRlIHdpZGdldDogRmluZFdpZGdldDxULCBURmlsdGVyRGF0YT4gfCB1bmRlZmluZWQ7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfb25EaWRDaGFuZ2VQYXR0ZXJuID0gbmV3IEVtaXR0ZXI8c3RyaW5nPigpO1xuXHRyZWFkb25seSBvbkRpZENoYW5nZVBhdHRlcm4gPSB0aGlzLl9vbkRpZENoYW5nZVBhdHRlcm4uZXZlbnQ7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfb25EaWRDaGFuZ2VPcGVuU3RhdGUgPSBuZXcgRW1pdHRlcjxib29sZWFuPigpO1xuXHRyZWFkb25seSBvbkRpZENoYW5nZU9wZW5TdGF0ZSA9IHRoaXMuX29uRGlkQ2hhbmdlT3BlblN0YXRlLmV2ZW50O1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgZW5hYmxlZERpc3Bvc2FibGVzID0gbmV3IERpc3Bvc2FibGVTdG9yZSgpO1xuXHRwcm90ZWN0ZWQgcmVhZG9ubHkgZGlzcG9zYWJsZXMgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0cHJvdGVjdGVkIHRyZWU6IEFic3RyYWN0VHJlZTxULCBURmlsdGVyRGF0YSwgdW5rbm93bj4sXG5cdFx0cHJvdGVjdGVkIGZpbHRlcjogSUZpbmRGaWx0ZXI8VD4sXG5cdFx0cHJvdGVjdGVkIHJlYWRvbmx5IGNvbnRleHRWaWV3UHJvdmlkZXI6IElDb250ZXh0Vmlld1Byb3ZpZGVyLFxuXHRcdHByb3RlY3RlZCByZWFkb25seSBvcHRpb25zOiBJQWJzdHJhY3RGaW5kQ29udHJvbGxlck9wdGlvbnMgPSB7fVxuXHQpIHtcblx0XHR0aGlzLnRvZ2dsZXMgPSBuZXcgRmluZFRvZ2dsZXMob3B0aW9ucy50b2dnbGVzID8/IFtdKTtcblx0XHR0aGlzLl9wbGFjZWhvbGRlciA9IG9wdGlvbnMucGxhY2Vob2xkZXIgPz8gbG9jYWxpemUoJ3R5cGUgdG8gc2VhcmNoJywgXCJUeXBlIHRvIHNlYXJjaFwiKTtcblx0fVxuXG5cdGlzT3BlbmVkKCk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiAhIXRoaXMud2lkZ2V0O1xuXHR9XG5cblx0b3BlbigpOiB2b2lkIHtcblx0XHRpZiAodGhpcy53aWRnZXQpIHtcblx0XHRcdHRoaXMud2lkZ2V0LmZvY3VzKCk7XG5cdFx0XHR0aGlzLndpZGdldC5zZWxlY3QoKTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCB3aWRnZXRDb250YWluZXIgPSB0aGlzLm9wdGlvbnMuZmluZFdpZGdldENvbnRhaW5lciA/PyB0aGlzLnRyZWUuZ2V0SFRNTEVsZW1lbnQoKTtcblx0XHRpZiAoIXRoaXMub3B0aW9ucy5maW5kV2lkZ2V0Q29udGFpbmVyKSB7XG5cdFx0XHR0aGlzLnRyZWUudXBkYXRlT3B0aW9ucyh7IHBhZGRpbmdUb3A6IDMwIH0pO1xuXHRcdH1cblxuXHRcdHRoaXMud2lkZ2V0ID0gbmV3IEZpbmRXaWRnZXQod2lkZ2V0Q29udGFpbmVyLCB0aGlzLnRyZWUsIHRoaXMuY29udGV4dFZpZXdQcm92aWRlciwgdGhpcy5wbGFjZWhvbGRlciwgdGhpcy50b2dnbGVzLnN0YXRlcygpLCB7IC4uLnRoaXMub3B0aW9ucywgaGlzdG9yeTogdGhpcy5faGlzdG9yeSB9KTtcblx0XHR0aGlzLmVuYWJsZWREaXNwb3NhYmxlcy5hZGQodGhpcy53aWRnZXQpO1xuXG5cdFx0dGhpcy53aWRnZXQub25EaWRDaGFuZ2VWYWx1ZSh0aGlzLm9uRGlkQ2hhbmdlVmFsdWUsIHRoaXMsIHRoaXMuZW5hYmxlZERpc3Bvc2FibGVzKTtcblx0XHR0aGlzLndpZGdldC5vbkRpZERpc2FibGUodGhpcy5jbG9zZSwgdGhpcywgdGhpcy5lbmFibGVkRGlzcG9zYWJsZXMpO1xuXHRcdHRoaXMud2lkZ2V0Lm9uRGlkVG9nZ2xlQ2hhbmdlKHRoaXMub25EaWRUb2dnbGVDaGFuZ2UsIHRoaXMsIHRoaXMuZW5hYmxlZERpc3Bvc2FibGVzKTtcblxuXHRcdHRoaXMud2lkZ2V0LmZvY3VzKCk7XG5cblx0XHR0aGlzLndpZGdldC52YWx1ZSA9IHRoaXMucHJldmlvdXNQYXR0ZXJuO1xuXHRcdHRoaXMud2lkZ2V0LnNlbGVjdCgpO1xuXG5cdFx0dGhpcy5fb25EaWRDaGFuZ2VPcGVuU3RhdGUuZmlyZSh0cnVlKTtcblx0fVxuXG5cdGNsb3NlKCk6IHZvaWQge1xuXHRcdGlmICghdGhpcy53aWRnZXQpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRpZiAoIXRoaXMub3B0aW9ucy5maW5kV2lkZ2V0Q29udGFpbmVyKSB7XG5cdFx0XHR0aGlzLnRyZWUudXBkYXRlT3B0aW9ucyh7IHBhZGRpbmdUb3A6IDAgfSk7XG5cdFx0fVxuXG5cdFx0dGhpcy5faGlzdG9yeSA9IHRoaXMud2lkZ2V0LmdldEhpc3RvcnkoKTtcblx0XHR0aGlzLndpZGdldCA9IHVuZGVmaW5lZDtcblxuXHRcdHRoaXMuZW5hYmxlZERpc3Bvc2FibGVzLmNsZWFyKCk7XG5cblx0XHR0aGlzLnByZXZpb3VzUGF0dGVybiA9IHRoaXMucGF0dGVybjtcblx0XHR0aGlzLm9uRGlkQ2hhbmdlVmFsdWUoJycpO1xuXHRcdHRoaXMudHJlZS5kb21Gb2N1cygpO1xuXG5cdFx0dGhpcy5fb25EaWRDaGFuZ2VPcGVuU3RhdGUuZmlyZShmYWxzZSk7XG5cdH1cblxuXHRwcm90ZWN0ZWQgb25EaWRDaGFuZ2VWYWx1ZShwYXR0ZXJuOiBzdHJpbmcpOiB2b2lkIHtcblx0XHR0aGlzLl9wYXR0ZXJuID0gcGF0dGVybjtcblx0XHR0aGlzLl9vbkRpZENoYW5nZVBhdHRlcm4uZmlyZShwYXR0ZXJuKTtcblxuXHRcdHRoaXMuZmlsdGVyLnBhdHRlcm4gPSBwYXR0ZXJuO1xuXHRcdHRoaXMuYXBwbHlQYXR0ZXJuKHBhdHRlcm4pO1xuXHR9XG5cblx0cHJvdGVjdGVkIGFic3RyYWN0IGFwcGx5UGF0dGVybihwYXR0ZXJuOiBzdHJpbmcpOiB2b2lkO1xuXG5cdHByb3RlY3RlZCBvbkRpZFRvZ2dsZUNoYW5nZShlOiBJVHJlZUZpbmRUb2dnbGVDaGFuZ2VFdmVudCk6IHZvaWQge1xuXHRcdHRoaXMudG9nZ2xlcy5zZXQoZS5pZCwgZS5pc0NoZWNrZWQpO1xuXHR9XG5cblx0cHJvdGVjdGVkIHVwZGF0ZVRvZ2dsZVN0YXRlKGlkOiBzdHJpbmcsIGNoZWNrZWQ6IGJvb2xlYW4pOiB2b2lkIHtcblx0XHR0aGlzLnRvZ2dsZXMuc2V0KGlkLCBjaGVja2VkKTtcblx0XHR0aGlzLndpZGdldD8uc2V0VG9nZ2xlU3RhdGUoaWQsIGNoZWNrZWQpO1xuXHR9XG5cblx0cHJvdGVjdGVkIHJlbmRlck1lc3NhZ2Uoc2hvd05vdEZvdW5kOiBib29sZWFuLCB3YXJuaW5nTWVzc2FnZT86IHN0cmluZyk6IHZvaWQge1xuXHRcdGlmIChzaG93Tm90Rm91bmQpIHtcblx0XHRcdGlmICh0aGlzLnRyZWUub3B0aW9ucy5zaG93Tm90Rm91bmRNZXNzYWdlID8/IHRydWUpIHtcblx0XHRcdFx0dGhpcy53aWRnZXQ/LnNob3dNZXNzYWdlKHsgdHlwZTogTWVzc2FnZVR5cGUuV0FSTklORywgY29udGVudDogd2FybmluZ01lc3NhZ2UgPz8gbG9jYWxpemUoJ25vdCBmb3VuZCcsIFwiTm8gcmVzdWx0cyBmb3VuZC5cIikgfSk7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHR0aGlzLndpZGdldD8uc2hvd01lc3NhZ2UoeyB0eXBlOiBNZXNzYWdlVHlwZS5XQVJOSU5HIH0pO1xuXHRcdFx0fVxuXHRcdH0gZWxzZSB7XG5cdFx0XHR0aGlzLndpZGdldD8uY2xlYXJNZXNzYWdlKCk7XG5cdFx0fVxuXHR9XG5cblx0cHJvdGVjdGVkIGFsZXJ0UmVzdWx0cyhyZXN1bHRzOiBudW1iZXIpOiB2b2lkIHtcblx0XHRpZiAoIXJlc3VsdHMpIHtcblx0XHRcdGFsZXJ0KGxvY2FsaXplKCdyZXBsRmluZE5vUmVzdWx0cycsIFwiTm8gcmVzdWx0c1wiKSk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdGFsZXJ0KGxvY2FsaXplKCdmb3VuZFJlc3VsdHMnLCBcInswfSByZXN1bHRzXCIsIHJlc3VsdHMpKTtcblx0XHR9XG5cdH1cblxuXHRkaXNwb3NlKCkge1xuXHRcdHRoaXMuX2hpc3RvcnkgPSB1bmRlZmluZWQ7XG5cdFx0dGhpcy5fb25EaWRDaGFuZ2VQYXR0ZXJuLmRpc3Bvc2UoKTtcblx0XHR0aGlzLmVuYWJsZWREaXNwb3NhYmxlcy5kaXNwb3NlKCk7XG5cdFx0dGhpcy5kaXNwb3NhYmxlcy5kaXNwb3NlKCk7XG5cdH1cbn1cblxuZXhwb3J0IGNsYXNzIEZpbmRDb250cm9sbGVyPFQsIFRGaWx0ZXJEYXRhPiBleHRlbmRzIEFic3RyYWN0RmluZENvbnRyb2xsZXI8VCwgVEZpbHRlckRhdGE+IHtcblxuXHRnZXQgbW9kZSgpOiBUcmVlRmluZE1vZGUgeyByZXR1cm4gdGhpcy50b2dnbGVzLmdldChEZWZhdWx0VHJlZVRvZ2dsZXMuTW9kZSkgPyBUcmVlRmluZE1vZGUuRmlsdGVyIDogVHJlZUZpbmRNb2RlLkhpZ2hsaWdodDsgfVxuXHRzZXQgbW9kZShtb2RlOiBUcmVlRmluZE1vZGUpIHtcblx0XHRpZiAobW9kZSA9PT0gdGhpcy5tb2RlKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29uc3QgaXNGaWx0ZXJNb2RlID0gbW9kZSA9PT0gVHJlZUZpbmRNb2RlLkZpbHRlcjtcblx0XHR0aGlzLnVwZGF0ZVRvZ2dsZVN0YXRlKERlZmF1bHRUcmVlVG9nZ2xlcy5Nb2RlLCBpc0ZpbHRlck1vZGUpO1xuXHRcdHRoaXMucGxhY2Vob2xkZXIgPSBpc0ZpbHRlck1vZGUgPyBsb2NhbGl6ZSgndHlwZSB0byBmaWx0ZXInLCBcIlR5cGUgdG8gZmlsdGVyXCIpIDogbG9jYWxpemUoJ3R5cGUgdG8gc2VhcmNoJywgXCJUeXBlIHRvIHNlYXJjaFwiKTtcblxuXHRcdHRoaXMuZmlsdGVyLmZpbmRNb2RlID0gbW9kZTtcblx0XHR0aGlzLnRyZWUucmVmaWx0ZXIoKTtcblx0XHR0aGlzLnJlbmRlcigpO1xuXHRcdHRoaXMuX29uRGlkQ2hhbmdlTW9kZS5maXJlKG1vZGUpO1xuXHR9XG5cblx0Z2V0IG1hdGNoVHlwZSgpOiBUcmVlRmluZE1hdGNoVHlwZSB7IHJldHVybiB0aGlzLnRvZ2dsZXMuZ2V0KERlZmF1bHRUcmVlVG9nZ2xlcy5NYXRjaFR5cGUpID8gVHJlZUZpbmRNYXRjaFR5cGUuRnV6enkgOiBUcmVlRmluZE1hdGNoVHlwZS5Db250aWd1b3VzOyB9XG5cdHNldCBtYXRjaFR5cGUobWF0Y2hUeXBlOiBUcmVlRmluZE1hdGNoVHlwZSkge1xuXHRcdGlmIChtYXRjaFR5cGUgPT09IHRoaXMubWF0Y2hUeXBlKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0dGhpcy51cGRhdGVUb2dnbGVTdGF0ZShEZWZhdWx0VHJlZVRvZ2dsZXMuTWF0Y2hUeXBlLCBtYXRjaFR5cGUgPT09IFRyZWVGaW5kTWF0Y2hUeXBlLkZ1enp5KTtcblxuXHRcdHRoaXMuZmlsdGVyLmZpbmRNYXRjaFR5cGUgPSBtYXRjaFR5cGU7XG5cdFx0dGhpcy50cmVlLnJlZmlsdGVyKCk7XG5cdFx0dGhpcy5yZW5kZXIoKTtcblx0XHR0aGlzLl9vbkRpZENoYW5nZU1hdGNoVHlwZS5maXJlKG1hdGNoVHlwZSk7XG5cdH1cblxuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkRpZENoYW5nZU1vZGUgPSBuZXcgRW1pdHRlcjxUcmVlRmluZE1vZGU+KCk7XG5cdHJlYWRvbmx5IG9uRGlkQ2hhbmdlTW9kZSA9IHRoaXMuX29uRGlkQ2hhbmdlTW9kZS5ldmVudDtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkRpZENoYW5nZU1hdGNoVHlwZSA9IG5ldyBFbWl0dGVyPFRyZWVGaW5kTWF0Y2hUeXBlPigpO1xuXHRyZWFkb25seSBvbkRpZENoYW5nZU1hdGNoVHlwZSA9IHRoaXMuX29uRGlkQ2hhbmdlTWF0Y2hUeXBlLmV2ZW50O1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdHRyZWU6IEFic3RyYWN0VHJlZTxULCBURmlsdGVyRGF0YSwgdW5rbm93bj4sXG5cdFx0cHJvdGVjdGVkIG92ZXJyaWRlIGZpbHRlcjogRmluZEZpbHRlcjxUPixcblx0XHRjb250ZXh0Vmlld1Byb3ZpZGVyOiBJQ29udGV4dFZpZXdQcm92aWRlcixcblx0XHRvcHRpb25zOiBJRmluZENvbnRyb2xsZXJPcHRpb25zID0ge31cblx0KSB7XG5cdFx0Y29uc3QgZGVmYXVsdEZpbmRNb2RlID0gb3B0aW9ucy5kZWZhdWx0RmluZE1vZGUgPz8gVHJlZUZpbmRNb2RlLkhpZ2hsaWdodDtcblx0XHRjb25zdCBkZWZhdWx0RmluZE1hdGNoVHlwZSA9IG9wdGlvbnMuZGVmYXVsdEZpbmRNYXRjaFR5cGUgPz8gVHJlZUZpbmRNYXRjaFR5cGUuRnV6enk7XG5cblx0XHRjb25zdCB0b2dnbGVDb250cmlidXRpb25zOiBJVHJlZUZpbmRUb2dnbGVDb250cmlidXRpb25bXSA9IFt7XG5cdFx0XHRpZDogRGVmYXVsdFRyZWVUb2dnbGVzLk1vZGUsXG5cdFx0XHRpY29uOiBDb2RpY29uLmxpc3RGaWx0ZXIsXG5cdFx0XHR0aXRsZTogbG9jYWxpemUoJ2ZpbHRlcicsIFwiRmlsdGVyXCIpLFxuXHRcdFx0aXNDaGVja2VkOiBkZWZhdWx0RmluZE1vZGUgPT09IFRyZWVGaW5kTW9kZS5GaWx0ZXIsXG5cdFx0fSwge1xuXHRcdFx0aWQ6IERlZmF1bHRUcmVlVG9nZ2xlcy5NYXRjaFR5cGUsXG5cdFx0XHRpY29uOiBDb2RpY29uLnNlYXJjaEZ1enp5LFxuXHRcdFx0dGl0bGU6IGxvY2FsaXplKCdmdXp6eVNlYXJjaCcsIFwiRnV6enkgTWF0Y2hcIiksXG5cdFx0XHRpc0NoZWNrZWQ6IGRlZmF1bHRGaW5kTWF0Y2hUeXBlID09PSBUcmVlRmluZE1hdGNoVHlwZS5GdXp6eSxcblx0XHR9XTtcblxuXHRcdGZpbHRlci5maW5kTWF0Y2hUeXBlID0gZGVmYXVsdEZpbmRNYXRjaFR5cGU7XG5cdFx0ZmlsdGVyLmZpbmRNb2RlID0gZGVmYXVsdEZpbmRNb2RlO1xuXG5cdFx0c3VwZXIodHJlZSwgZmlsdGVyLCBjb250ZXh0Vmlld1Byb3ZpZGVyLCB7IC4uLm9wdGlvbnMsIHRvZ2dsZXM6IHRvZ2dsZUNvbnRyaWJ1dGlvbnMgfSk7XG5cblx0XHR0aGlzLmRpc3Bvc2FibGVzLmFkZCh0aGlzLnRyZWUub25EaWRDaGFuZ2VNb2RlbCgoKSA9PiB7XG5cdFx0XHRpZiAoIXRoaXMuaXNPcGVuZWQoKSkge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cblx0XHRcdGlmICh0aGlzLnBhdHRlcm4ubGVuZ3RoICE9PSAwKSB7XG5cdFx0XHRcdHRoaXMudHJlZS5yZWZpbHRlcigpO1xuXHRcdFx0fVxuXG5cdFx0XHR0aGlzLnJlbmRlcigpO1xuXHRcdH0pKTtcblxuXHRcdHRoaXMuZGlzcG9zYWJsZXMuYWRkKHRoaXMudHJlZS5vbldpbGxSZWZpbHRlcigoKSA9PiB0aGlzLmZpbHRlci5yZXNldCgpKSk7XG5cdH1cblxuXHR1cGRhdGVPcHRpb25zKG9wdGlvbnNVcGRhdGU6IElBYnN0cmFjdFRyZWVPcHRpb25zVXBkYXRlPFQ+ID0ge30pOiB2b2lkIHtcblx0XHRpZiAob3B0aW9uc1VwZGF0ZS5kZWZhdWx0RmluZE1vZGUgIT09IHVuZGVmaW5lZCkge1xuXHRcdFx0dGhpcy5tb2RlID0gb3B0aW9uc1VwZGF0ZS5kZWZhdWx0RmluZE1vZGU7XG5cdFx0fVxuXG5cdFx0aWYgKG9wdGlvbnNVcGRhdGUuZGVmYXVsdEZpbmRNYXRjaFR5cGUgIT09IHVuZGVmaW5lZCkge1xuXHRcdFx0dGhpcy5tYXRjaFR5cGUgPSBvcHRpb25zVXBkYXRlLmRlZmF1bHRGaW5kTWF0Y2hUeXBlO1xuXHRcdH1cblx0fVxuXG5cdHByb3RlY3RlZCBhcHBseVBhdHRlcm4ocGF0dGVybjogc3RyaW5nKTogdm9pZCB7XG5cdFx0dGhpcy50cmVlLnJlZmlsdGVyKCk7XG5cblx0XHRpZiAocGF0dGVybikge1xuXHRcdFx0dGhpcy50cmVlLmZvY3VzTmV4dCgwLCB0cnVlLCB1bmRlZmluZWQsIChub2RlKSA9PiAhRnV6enlTY29yZS5pc0RlZmF1bHQobm9kZS5maWx0ZXJEYXRhIGFzIHVua25vd24gYXMgRnV6enlTY29yZSkpO1xuXHRcdH1cblxuXHRcdGNvbnN0IGZvY3VzID0gdGhpcy50cmVlLmdldEZvY3VzKCk7XG5cblx0XHRpZiAoZm9jdXMubGVuZ3RoID4gMCkge1xuXHRcdFx0Y29uc3QgZWxlbWVudCA9IGZvY3VzWzBdO1xuXG5cdFx0XHRpZiAodGhpcy50cmVlLmdldFJlbGF0aXZlVG9wKGVsZW1lbnQpID09PSBudWxsKSB7XG5cdFx0XHRcdHRoaXMudHJlZS5yZXZlYWwoZWxlbWVudCwgMC41KTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHR0aGlzLnJlbmRlcigpO1xuXHR9XG5cblx0c2hvdWxkQWxsb3dGb2N1cyhub2RlOiBJVHJlZU5vZGU8VCwgVEZpbHRlckRhdGE+KTogYm9vbGVhbiB7XG5cdFx0aWYgKCF0aGlzLmlzT3BlbmVkKCkgfHwgIXRoaXMucGF0dGVybikge1xuXHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0fVxuXG5cdFx0aWYgKHRoaXMuZmlsdGVyLnRvdGFsQ291bnQgPiAwICYmIHRoaXMuZmlsdGVyLm1hdGNoQ291bnQgPD0gMSkge1xuXHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0fVxuXG5cdFx0cmV0dXJuICFGdXp6eVNjb3JlLmlzRGVmYXVsdChub2RlLmZpbHRlckRhdGEgYXMgdW5rbm93biBhcyBGdXp6eVNjb3JlKTtcblx0fVxuXG5cdHByb3RlY3RlZCBvdmVycmlkZSBvbkRpZFRvZ2dsZUNoYW5nZShlOiBJVHJlZUZpbmRUb2dnbGVDaGFuZ2VFdmVudCk6IHZvaWQge1xuXHRcdGlmIChlLmlkID09PSBEZWZhdWx0VHJlZVRvZ2dsZXMuTW9kZSkge1xuXHRcdFx0dGhpcy5tb2RlID0gZS5pc0NoZWNrZWQgPyBUcmVlRmluZE1vZGUuRmlsdGVyIDogVHJlZUZpbmRNb2RlLkhpZ2hsaWdodDtcblx0XHR9IGVsc2UgaWYgKGUuaWQgPT09IERlZmF1bHRUcmVlVG9nZ2xlcy5NYXRjaFR5cGUpIHtcblx0XHRcdHRoaXMubWF0Y2hUeXBlID0gZS5pc0NoZWNrZWQgPyBUcmVlRmluZE1hdGNoVHlwZS5GdXp6eSA6IFRyZWVGaW5kTWF0Y2hUeXBlLkNvbnRpZ3VvdXM7XG5cdFx0fVxuXHR9XG5cblx0cHJvdGVjdGVkIHJlbmRlcigpOiB2b2lkIHtcblx0XHRjb25zdCBub01hdGNoZXMgPSB0aGlzLmZpbHRlci5tYXRjaENvdW50ID09PSAwICYmIHRoaXMuZmlsdGVyLnRvdGFsQ291bnQgPiAwO1xuXHRcdGNvbnN0IHNob3dOb3RGb3VuZCA9IG5vTWF0Y2hlcyAmJiB0aGlzLnBhdHRlcm4ubGVuZ3RoID4gMDtcblxuXHRcdHRoaXMucmVuZGVyTWVzc2FnZShzaG93Tm90Rm91bmQpO1xuXG5cdFx0aWYgKHRoaXMucGF0dGVybi5sZW5ndGgpIHtcblx0XHRcdHRoaXMuYWxlcnRSZXN1bHRzKHRoaXMuZmlsdGVyLm1hdGNoQ291bnQpO1xuXHRcdH1cblx0fVxufVxuXG5leHBvcnQgaW50ZXJmYWNlIFN0aWNreVNjcm9sbE5vZGU8VCwgVEZpbHRlckRhdGE+IHtcblx0cmVhZG9ubHkgbm9kZTogSVRyZWVOb2RlPFQsIFRGaWx0ZXJEYXRhPjtcblx0cmVhZG9ubHkgc3RhcnRJbmRleDogbnVtYmVyO1xuXHRyZWFkb25seSBlbmRJbmRleDogbnVtYmVyO1xuXHRyZWFkb25seSBoZWlnaHQ6IG51bWJlcjtcblx0cmVhZG9ubHkgcG9zaXRpb246IG51bWJlcjtcbn1cblxuZnVuY3Rpb24gc3RpY2t5U2Nyb2xsTm9kZVN0YXRlRXF1YWxzPFQsIFRGaWx0ZXJEYXRhPihub2RlMTogU3RpY2t5U2Nyb2xsTm9kZTxULCBURmlsdGVyRGF0YT4sIG5vZGUyOiBTdGlja3lTY3JvbGxOb2RlPFQsIFRGaWx0ZXJEYXRhPikge1xuXHRyZXR1cm4gbm9kZTEucG9zaXRpb24gPT09IG5vZGUyLnBvc2l0aW9uICYmIHN0aWNreVNjcm9sbE5vZGVFcXVhbHMobm9kZTEsIG5vZGUyKTtcbn1cblxuZnVuY3Rpb24gc3RpY2t5U2Nyb2xsTm9kZUVxdWFsczxULCBURmlsdGVyRGF0YT4obm9kZTE6IFN0aWNreVNjcm9sbE5vZGU8VCwgVEZpbHRlckRhdGE+LCBub2RlMjogU3RpY2t5U2Nyb2xsTm9kZTxULCBURmlsdGVyRGF0YT4pIHtcblx0cmV0dXJuIG5vZGUxLm5vZGUuZWxlbWVudCA9PT0gbm9kZTIubm9kZS5lbGVtZW50ICYmXG5cdFx0bm9kZTEuc3RhcnRJbmRleCA9PT0gbm9kZTIuc3RhcnRJbmRleCAmJlxuXHRcdG5vZGUxLmhlaWdodCA9PT0gbm9kZTIuaGVpZ2h0ICYmXG5cdFx0bm9kZTEuZW5kSW5kZXggPT09IG5vZGUyLmVuZEluZGV4O1xufVxuXG5jbGFzcyBTdGlja3lTY3JvbGxTdGF0ZTxULCBURmlsdGVyRGF0YSwgVFJlZj4ge1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdHJlYWRvbmx5IHN0aWNreU5vZGVzOiBTdGlja3lTY3JvbGxOb2RlPFQsIFRGaWx0ZXJEYXRhPltdID0gW11cblx0KSB7IH1cblxuXHRnZXQgY291bnQoKTogbnVtYmVyIHsgcmV0dXJuIHRoaXMuc3RpY2t5Tm9kZXMubGVuZ3RoOyB9XG5cblx0ZXF1YWwoc3RhdGU6IFN0aWNreVNjcm9sbFN0YXRlPFQsIFRGaWx0ZXJEYXRhLCBUUmVmPik6IGJvb2xlYW4ge1xuXHRcdHJldHVybiBlcXVhbHModGhpcy5zdGlja3lOb2Rlcywgc3RhdGUuc3RpY2t5Tm9kZXMsIHN0aWNreVNjcm9sbE5vZGVTdGF0ZUVxdWFscyk7XG5cdH1cblxuXHRjb250YWlucyhlbGVtZW50OiBJVHJlZU5vZGU8VCwgVEZpbHRlckRhdGE+KTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuIHRoaXMuc3RpY2t5Tm9kZXMuc29tZShub2RlID0+IG5vZGUubm9kZS5lbGVtZW50ID09PSBlbGVtZW50LmVsZW1lbnQpO1xuXHR9XG5cblx0bGFzdE5vZGVQYXJ0aWFsbHlWaXNpYmxlKCk6IGJvb2xlYW4ge1xuXHRcdGlmICh0aGlzLmNvdW50ID09PSAwKSB7XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXG5cdFx0Y29uc3QgbGFzdFN0aWNreU5vZGUgPSB0aGlzLnN0aWNreU5vZGVzW3RoaXMuY291bnQgLSAxXTtcblx0XHRpZiAodGhpcy5jb3VudCA9PT0gMSkge1xuXHRcdFx0cmV0dXJuIGxhc3RTdGlja3lOb2RlLnBvc2l0aW9uICE9PSAwO1xuXHRcdH1cblxuXHRcdGNvbnN0IHNlY29uZExhc3RTdGlja3lOb2RlID0gdGhpcy5zdGlja3lOb2Rlc1t0aGlzLmNvdW50IC0gMl07XG5cdFx0cmV0dXJuIHNlY29uZExhc3RTdGlja3lOb2RlLnBvc2l0aW9uICsgc2Vjb25kTGFzdFN0aWNreU5vZGUuaGVpZ2h0ICE9PSBsYXN0U3RpY2t5Tm9kZS5wb3NpdGlvbjtcblx0fVxuXG5cdGFuaW1hdGlvblN0YXRlQ2hhbmdlZChwcmV2aW91c1N0YXRlOiBTdGlja3lTY3JvbGxTdGF0ZTxULCBURmlsdGVyRGF0YSwgVFJlZj4pOiBib29sZWFuIHtcblx0XHRpZiAoIWVxdWFscyh0aGlzLnN0aWNreU5vZGVzLCBwcmV2aW91c1N0YXRlLnN0aWNreU5vZGVzLCBzdGlja3lTY3JvbGxOb2RlRXF1YWxzKSkge1xuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH1cblxuXHRcdGlmICh0aGlzLmNvdW50ID09PSAwKSB7XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXG5cdFx0Y29uc3QgbGFzdFN0aWNreU5vZGUgPSB0aGlzLnN0aWNreU5vZGVzW3RoaXMuY291bnQgLSAxXTtcblx0XHRjb25zdCBwcmV2aW91c0xhc3RTdGlja3lOb2RlID0gcHJldmlvdXNTdGF0ZS5zdGlja3lOb2Rlc1twcmV2aW91c1N0YXRlLmNvdW50IC0gMV07XG5cblx0XHRyZXR1cm4gbGFzdFN0aWNreU5vZGUucG9zaXRpb24gIT09IHByZXZpb3VzTGFzdFN0aWNreU5vZGUucG9zaXRpb247XG5cdH1cbn1cblxuZXhwb3J0IGludGVyZmFjZSBJU3RpY2t5U2Nyb2xsRGVsZWdhdGU8VCwgVEZpbHRlckRhdGE+IHtcblx0Y29uc3RyYWluU3RpY2t5U2Nyb2xsTm9kZXMoc3RpY2t5Tm9kZXM6IFN0aWNreVNjcm9sbE5vZGU8VCwgVEZpbHRlckRhdGE+W10sIHN0aWNreVNjcm9sbE1heEl0ZW1Db3VudDogbnVtYmVyLCBtYXhXaWRnZXRIZWlnaHQ6IG51bWJlcik6IFN0aWNreVNjcm9sbE5vZGU8VCwgVEZpbHRlckRhdGE+W107XG59XG5cbmNsYXNzIERlZmF1bHRTdGlja3lTY3JvbGxEZWxlZ2F0ZTxULCBURmlsdGVyRGF0YT4gaW1wbGVtZW50cyBJU3RpY2t5U2Nyb2xsRGVsZWdhdGU8VCwgVEZpbHRlckRhdGE+IHtcblxuXHRjb25zdHJhaW5TdGlja3lTY3JvbGxOb2RlcyhzdGlja3lOb2RlczogU3RpY2t5U2Nyb2xsTm9kZTxULCBURmlsdGVyRGF0YT5bXSwgc3RpY2t5U2Nyb2xsTWF4SXRlbUNvdW50OiBudW1iZXIsIG1heFdpZGdldEhlaWdodDogbnVtYmVyKTogU3RpY2t5U2Nyb2xsTm9kZTxULCBURmlsdGVyRGF0YT5bXSB7XG5cblx0XHRmb3IgKGxldCBpID0gMDsgaSA8IHN0aWNreU5vZGVzLmxlbmd0aDsgaSsrKSB7XG5cdFx0XHRjb25zdCBzdGlja3lOb2RlID0gc3RpY2t5Tm9kZXNbaV07XG5cdFx0XHRjb25zdCBzdGlja3lOb2RlQm90dG9tID0gc3RpY2t5Tm9kZS5wb3NpdGlvbiArIHN0aWNreU5vZGUuaGVpZ2h0O1xuXHRcdFx0aWYgKHN0aWNreU5vZGVCb3R0b20gPiBtYXhXaWRnZXRIZWlnaHQgfHwgaSA+PSBzdGlja3lTY3JvbGxNYXhJdGVtQ291bnQpIHtcblx0XHRcdFx0cmV0dXJuIHN0aWNreU5vZGVzLnNsaWNlKDAsIGkpO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdHJldHVybiBzdGlja3lOb2Rlcztcblx0fVxufVxuXG5jbGFzcyBTdGlja3lTY3JvbGxDb250cm9sbGVyPFQsIFRGaWx0ZXJEYXRhLCBUUmVmPiBleHRlbmRzIERpc3Bvc2FibGUge1xuXG5cdHJlYWRvbmx5IG9uRGlkQ2hhbmdlSGFzRm9jdXM6IEV2ZW50PGJvb2xlYW4+O1xuXHRyZWFkb25seSBvbkNvbnRleHRNZW51OiBFdmVudDxJVHJlZUNvbnRleHRNZW51RXZlbnQ8VD4+O1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgc3RpY2t5U2Nyb2xsRGVsZWdhdGU6IElTdGlja3lTY3JvbGxEZWxlZ2F0ZTxULCBURmlsdGVyRGF0YT47XG5cblx0cHJpdmF0ZSBzdGlja3lTY3JvbGxNYXhJdGVtQ291bnQ6IG51bWJlcjtcblx0cHJpdmF0ZSByZWFkb25seSBtYXhXaWRnZXRWaWV3UmF0aW8gPSAwLjQ7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfd2lkZ2V0OiBTdGlja3lTY3JvbGxXaWRnZXQ8VCwgVEZpbHRlckRhdGEsIFRSZWY+O1xuXG5cdHByaXZhdGUgcGFkZGluZ1RvcDogbnVtYmVyO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgdHJlZTogQWJzdHJhY3RUcmVlPFQsIFRGaWx0ZXJEYXRhLCBUUmVmPixcblx0XHRwcml2YXRlIHJlYWRvbmx5IG1vZGVsOiBJVHJlZU1vZGVsPFQsIFRGaWx0ZXJEYXRhLCBUUmVmPixcblx0XHRwcml2YXRlIHJlYWRvbmx5IHZpZXc6IExpc3Q8SVRyZWVOb2RlPFQsIFRGaWx0ZXJEYXRhPj4sXG5cdFx0cmVuZGVyZXJzOiBUcmVlUmVuZGVyZXI8VCwgVEZpbHRlckRhdGEsIFRSZWYsIHVua25vd24+W10sXG5cdFx0cHJpdmF0ZSByZWFkb25seSB0cmVlRGVsZWdhdGU6IElMaXN0VmlydHVhbERlbGVnYXRlPElUcmVlTm9kZTxULCBURmlsdGVyRGF0YT4+LFxuXHRcdG9wdGlvbnM6IElBYnN0cmFjdFRyZWVPcHRpb25zPFQsIFRGaWx0ZXJEYXRhPiA9IHt9LFxuXHQpIHtcblx0XHRzdXBlcigpO1xuXG5cdFx0Y29uc3Qgc3RpY2t5U2Nyb2xsT3B0aW9ucyA9IHRoaXMudmFsaWRhdGVTdGlja3lTZXR0aW5ncyhvcHRpb25zKTtcblx0XHR0aGlzLnN0aWNreVNjcm9sbE1heEl0ZW1Db3VudCA9IHN0aWNreVNjcm9sbE9wdGlvbnMuc3RpY2t5U2Nyb2xsTWF4SXRlbUNvdW50O1xuXG5cdFx0dGhpcy5zdGlja3lTY3JvbGxEZWxlZ2F0ZSA9IG9wdGlvbnMuc3RpY2t5U2Nyb2xsRGVsZWdhdGUgPz8gbmV3IERlZmF1bHRTdGlja3lTY3JvbGxEZWxlZ2F0ZSgpO1xuXHRcdHRoaXMucGFkZGluZ1RvcCA9IG9wdGlvbnMucGFkZGluZ1RvcCA/PyAwO1xuXG5cdFx0dGhpcy5fd2lkZ2V0ID0gdGhpcy5fcmVnaXN0ZXIobmV3IFN0aWNreVNjcm9sbFdpZGdldCh2aWV3LmdldFNjcm9sbGFibGVFbGVtZW50KCksIHZpZXcsIHRyZWUsIHJlbmRlcmVycywgdHJlZURlbGVnYXRlLCBvcHRpb25zLmFjY2Vzc2liaWxpdHlQcm92aWRlcikpO1xuXHRcdHRoaXMub25EaWRDaGFuZ2VIYXNGb2N1cyA9IHRoaXMuX3dpZGdldC5vbkRpZENoYW5nZUhhc0ZvY3VzO1xuXHRcdHRoaXMub25Db250ZXh0TWVudSA9IHRoaXMuX3dpZGdldC5vbkNvbnRleHRNZW51O1xuXG5cdFx0dGhpcy5fcmVnaXN0ZXIodmlldy5vbkRpZFNjcm9sbCgoKSA9PiB0aGlzLnVwZGF0ZSgpKSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodmlldy5vbkRpZENoYW5nZUNvbnRlbnRIZWlnaHQoKCkgPT4gdGhpcy51cGRhdGUoKSkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRyZWUub25EaWRDaGFuZ2VDb2xsYXBzZVN0YXRlKCgpID0+IHRoaXMudXBkYXRlKCkpKTtcblx0XHR0aGlzLl9yZWdpc3Rlcihtb2RlbC5vbkRpZFNwbGljZVJlbmRlcmVkTm9kZXMoKGUpID0+IHtcblx0XHRcdGNvbnN0IHN0YXRlID0gdGhpcy5fd2lkZ2V0LnN0YXRlO1xuXHRcdFx0aWYgKCFzdGF0ZSkge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cblx0XHRcdC8vIElmIGEgc3RpY2t5IG5vZGUgaXMgcmVtb3ZlZCwgcmVjb21wdXRlIHRoZSBzdGF0ZVxuXHRcdFx0Y29uc3QgaGFzUmVtb3ZlZFN0aWNreU5vZGUgPSBlLmRlbGV0ZUNvdW50ID4gMCAmJiBzdGF0ZS5zdGlja3lOb2Rlcy5zb21lKHN0aWNreU5vZGUgPT4gIXRoaXMubW9kZWwuaGFzKHRoaXMubW9kZWwuZ2V0Tm9kZUxvY2F0aW9uKHN0aWNreU5vZGUubm9kZSkpKTtcblx0XHRcdGlmIChoYXNSZW1vdmVkU3RpY2t5Tm9kZSkge1xuXHRcdFx0XHR0aGlzLnVwZGF0ZSgpO1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cblx0XHRcdC8vIElmIGEgc3RpY2t5IG5vZGUgaXMgdXBkYXRlZCwgcmVyZW5kZXIgdGhlIHdpZGdldFxuXHRcdFx0Y29uc3Qgc2hvdWxkUmVyZW5kZXJTdGlja3lOb2RlcyA9IHN0YXRlLnN0aWNreU5vZGVzLnNvbWUoc3RpY2t5Tm9kZSA9PiB7XG5cdFx0XHRcdGNvbnN0IGxpc3RJbmRleCA9IHRoaXMubW9kZWwuZ2V0TGlzdEluZGV4KHRoaXMubW9kZWwuZ2V0Tm9kZUxvY2F0aW9uKHN0aWNreU5vZGUubm9kZSkpO1xuXHRcdFx0XHRyZXR1cm4gbGlzdEluZGV4ID49IGUuc3RhcnQgJiYgbGlzdEluZGV4IDwgZS5zdGFydCArIGUuZGVsZXRlQ291bnQgJiYgc3RhdGUuY29udGFpbnMoc3RpY2t5Tm9kZS5ub2RlKTtcblx0XHRcdH0pO1xuXG5cdFx0XHRpZiAoc2hvdWxkUmVyZW5kZXJTdGlja3lOb2Rlcykge1xuXHRcdFx0XHR0aGlzLl93aWRnZXQucmVyZW5kZXIoKTtcblx0XHRcdH1cblx0XHR9KSk7XG5cblx0XHR0aGlzLnVwZGF0ZSgpO1xuXHR9XG5cblx0Z2V0IGhlaWdodCgpOiBudW1iZXIge1xuXHRcdHJldHVybiB0aGlzLl93aWRnZXQuaGVpZ2h0O1xuXHR9XG5cblx0Z2V0IGNvdW50KCk6IG51bWJlciB7XG5cdFx0cmV0dXJuIHRoaXMuX3dpZGdldC5jb3VudDtcblx0fVxuXG5cdGdldE5vZGUobm9kZTogSVRyZWVOb2RlPFQsIFRGaWx0ZXJEYXRhPik6IFN0aWNreVNjcm9sbE5vZGU8VCwgVEZpbHRlckRhdGE+IHwgdW5kZWZpbmVkIHtcblx0XHRyZXR1cm4gdGhpcy5fd2lkZ2V0LmdldE5vZGUobm9kZSk7XG5cdH1cblxuXHRwcml2YXRlIGdldE5vZGVBdEhlaWdodChoZWlnaHQ6IG51bWJlcik6IElUcmVlTm9kZTxULCBURmlsdGVyRGF0YT4gfCB1bmRlZmluZWQge1xuXHRcdGxldCBpbmRleDtcblx0XHRpZiAoaGVpZ2h0ID09PSAwKSB7XG5cdFx0XHRpbmRleCA9IHRoaXMudmlldy5maXJzdFZpc2libGVJbmRleDtcblx0XHR9IGVsc2Uge1xuXHRcdFx0aW5kZXggPSB0aGlzLnZpZXcuaW5kZXhBdChoZWlnaHQgKyB0aGlzLnZpZXcuc2Nyb2xsVG9wKTtcblx0XHR9XG5cblx0XHRpZiAoaW5kZXggPCAwIHx8IGluZGV4ID49IHRoaXMudmlldy5sZW5ndGgpIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHRoaXMudmlldy5lbGVtZW50KGluZGV4KTtcblx0fVxuXG5cdHByaXZhdGUgdXBkYXRlKCkge1xuXHRcdGNvbnN0IGZpcnN0VmlzaWJsZU5vZGUgPSB0aGlzLmdldE5vZGVBdEhlaWdodCh0aGlzLnBhZGRpbmdUb3ApO1xuXG5cdFx0Ly8gRG9uJ3QgcmVuZGVyIGFueXRoaW5nIGlmIHRoZXJlIGFyZSBubyBlbGVtZW50c1xuXHRcdGlmICghZmlyc3RWaXNpYmxlTm9kZSB8fCB0aGlzLnRyZWUuc2Nyb2xsVG9wIDw9IHRoaXMucGFkZGluZ1RvcCB8fCB0aGlzLnZpZXcucmVuZGVySGVpZ2h0ID09PSAwKSB7XG5cdFx0XHR0aGlzLl93aWRnZXQuc2V0U3RhdGUodW5kZWZpbmVkKTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCBzdGlja3lTdGF0ZSA9IHRoaXMuZmluZFN0aWNreVN0YXRlKGZpcnN0VmlzaWJsZU5vZGUpO1xuXHRcdHRoaXMuX3dpZGdldC5zZXRTdGF0ZShzdGlja3lTdGF0ZSk7XG5cdH1cblxuXHRwcml2YXRlIGZpbmRTdGlja3lTdGF0ZShmaXJzdFZpc2libGVOb2RlOiBJVHJlZU5vZGU8VCwgVEZpbHRlckRhdGE+KTogU3RpY2t5U2Nyb2xsU3RhdGU8VCwgVEZpbHRlckRhdGEsIFRSZWY+IHwgdW5kZWZpbmVkIHtcblx0XHRjb25zdCBzdGlja3lOb2RlczogU3RpY2t5U2Nyb2xsTm9kZTxULCBURmlsdGVyRGF0YT5bXSA9IFtdO1xuXHRcdGxldCBmaXJzdFZpc2libGVOb2RlVW5kZXJXaWRnZXQ6IElUcmVlTm9kZTxULCBURmlsdGVyRGF0YT4gfCB1bmRlZmluZWQgPSBmaXJzdFZpc2libGVOb2RlO1xuXHRcdGxldCBzdGlja3lOb2Rlc0hlaWdodCA9IDA7XG5cblx0XHRsZXQgbmV4dFN0aWNreU5vZGUgPSB0aGlzLmdldE5leHRTdGlja3lOb2RlKGZpcnN0VmlzaWJsZU5vZGVVbmRlcldpZGdldCwgdW5kZWZpbmVkLCBzdGlja3lOb2Rlc0hlaWdodCk7XG5cdFx0d2hpbGUgKG5leHRTdGlja3lOb2RlKSB7XG5cblx0XHRcdHN0aWNreU5vZGVzLnB1c2gobmV4dFN0aWNreU5vZGUpO1xuXHRcdFx0c3RpY2t5Tm9kZXNIZWlnaHQgKz0gbmV4dFN0aWNreU5vZGUuaGVpZ2h0O1xuXG5cdFx0XHRpZiAoc3RpY2t5Tm9kZXMubGVuZ3RoIDw9IHRoaXMuc3RpY2t5U2Nyb2xsTWF4SXRlbUNvdW50KSB7XG5cdFx0XHRcdGZpcnN0VmlzaWJsZU5vZGVVbmRlcldpZGdldCA9IHRoaXMuZ2V0TmV4dFZpc2libGVOb2RlKG5leHRTdGlja3lOb2RlKTtcblx0XHRcdFx0aWYgKCFmaXJzdFZpc2libGVOb2RlVW5kZXJXaWRnZXQpIHtcblx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0fVxuXHRcdFx0fVxuXG5cdFx0XHRuZXh0U3RpY2t5Tm9kZSA9IHRoaXMuZ2V0TmV4dFN0aWNreU5vZGUoZmlyc3RWaXNpYmxlTm9kZVVuZGVyV2lkZ2V0LCBuZXh0U3RpY2t5Tm9kZS5ub2RlLCBzdGlja3lOb2Rlc0hlaWdodCk7XG5cdFx0fVxuXG5cdFx0Y29uc3QgY29udHJhaW5lZFN0aWNreU5vZGVzID0gdGhpcy5jb25zdHJhaW5TdGlja3lOb2RlcyhzdGlja3lOb2Rlcyk7XG5cdFx0cmV0dXJuIGNvbnRyYWluZWRTdGlja3lOb2Rlcy5sZW5ndGggPyBuZXcgU3RpY2t5U2Nyb2xsU3RhdGUoY29udHJhaW5lZFN0aWNreU5vZGVzKSA6IHVuZGVmaW5lZDtcblx0fVxuXG5cdHByaXZhdGUgZ2V0TmV4dFZpc2libGVOb2RlKHByZXZpb3VzU3RpY2t5Tm9kZTogU3RpY2t5U2Nyb2xsTm9kZTxULCBURmlsdGVyRGF0YT4pOiBJVHJlZU5vZGU8VCwgVEZpbHRlckRhdGE+IHwgdW5kZWZpbmVkIHtcblx0XHRyZXR1cm4gdGhpcy5nZXROb2RlQXRIZWlnaHQocHJldmlvdXNTdGlja3lOb2RlLnBvc2l0aW9uICsgcHJldmlvdXNTdGlja3lOb2RlLmhlaWdodCk7XG5cdH1cblxuXHRwcml2YXRlIGdldE5leHRTdGlja3lOb2RlKGZpcnN0VmlzaWJsZU5vZGVVbmRlcldpZGdldDogSVRyZWVOb2RlPFQsIFRGaWx0ZXJEYXRhPiwgcHJldmlvdXNTdGlja3lOb2RlOiBJVHJlZU5vZGU8VCwgVEZpbHRlckRhdGE+IHwgdW5kZWZpbmVkLCBzdGlja3lOb2Rlc0hlaWdodDogbnVtYmVyKTogU3RpY2t5U2Nyb2xsTm9kZTxULCBURmlsdGVyRGF0YT4gfCB1bmRlZmluZWQge1xuXHRcdGNvbnN0IG5leHRTdGlja3lOb2RlID0gdGhpcy5nZXRBbmNlc3RvclVuZGVyUHJldmlvdXMoZmlyc3RWaXNpYmxlTm9kZVVuZGVyV2lkZ2V0LCBwcmV2aW91c1N0aWNreU5vZGUpO1xuXHRcdGlmICghbmV4dFN0aWNreU5vZGUpIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXG5cdFx0aWYgKG5leHRTdGlja3lOb2RlID09PSBmaXJzdFZpc2libGVOb2RlVW5kZXJXaWRnZXQpIHtcblx0XHRcdGlmICghdGhpcy5ub2RlSXNVbmNvbGxhcHNlZFBhcmVudChmaXJzdFZpc2libGVOb2RlVW5kZXJXaWRnZXQpKSB7XG5cdFx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0XHR9XG5cblx0XHRcdGlmICh0aGlzLm5vZGVUb3BBbGlnbnNXaXRoU3RpY2t5Tm9kZXNCb3R0b20oZmlyc3RWaXNpYmxlTm9kZVVuZGVyV2lkZ2V0LCBzdGlja3lOb2Rlc0hlaWdodCkpIHtcblx0XHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRyZXR1cm4gdGhpcy5jcmVhdGVTdGlja3lTY3JvbGxOb2RlKG5leHRTdGlja3lOb2RlLCBzdGlja3lOb2Rlc0hlaWdodCk7XG5cdH1cblxuXHRwcml2YXRlIG5vZGVUb3BBbGlnbnNXaXRoU3RpY2t5Tm9kZXNCb3R0b20obm9kZTogSVRyZWVOb2RlPFQsIFRGaWx0ZXJEYXRhPiwgc3RpY2t5Tm9kZXNIZWlnaHQ6IG51bWJlcik6IGJvb2xlYW4ge1xuXHRcdGNvbnN0IG5vZGVJbmRleCA9IHRoaXMuZ2V0Tm9kZUluZGV4KG5vZGUpO1xuXHRcdGNvbnN0IGVsZW1lbnRUb3AgPSB0aGlzLnZpZXcuZ2V0RWxlbWVudFRvcChub2RlSW5kZXgpO1xuXHRcdGNvbnN0IHN0aWNreVBvc2l0aW9uID0gc3RpY2t5Tm9kZXNIZWlnaHQ7XG5cdFx0cmV0dXJuIHRoaXMudmlldy5zY3JvbGxUb3AgPT09IGVsZW1lbnRUb3AgLSBzdGlja3lQb3NpdGlvbjtcblx0fVxuXG5cdHByaXZhdGUgY3JlYXRlU3RpY2t5U2Nyb2xsTm9kZShub2RlOiBJVHJlZU5vZGU8VCwgVEZpbHRlckRhdGE+LCBjdXJyZW50U3RpY2t5Tm9kZXNIZWlnaHQ6IG51bWJlcik6IFN0aWNreVNjcm9sbE5vZGU8VCwgVEZpbHRlckRhdGE+IHtcblx0XHRjb25zdCBoZWlnaHQgPSB0aGlzLnRyZWVEZWxlZ2F0ZS5nZXRIZWlnaHQobm9kZSk7XG5cdFx0Y29uc3QgeyBzdGFydEluZGV4LCBlbmRJbmRleCB9ID0gdGhpcy5nZXROb2RlUmFuZ2Uobm9kZSk7XG5cblx0XHRjb25zdCBwb3NpdGlvbiA9IHRoaXMuY2FsY3VsYXRlU3RpY2t5Tm9kZVBvc2l0aW9uKGVuZEluZGV4LCBjdXJyZW50U3RpY2t5Tm9kZXNIZWlnaHQsIGhlaWdodCk7XG5cblx0XHRyZXR1cm4geyBub2RlLCBwb3NpdGlvbiwgaGVpZ2h0LCBzdGFydEluZGV4LCBlbmRJbmRleCB9O1xuXHR9XG5cblx0cHJpdmF0ZSBnZXRBbmNlc3RvclVuZGVyUHJldmlvdXMobm9kZTogSVRyZWVOb2RlPFQsIFRGaWx0ZXJEYXRhPiwgcHJldmlvdXNBbmNlc3RvcjogSVRyZWVOb2RlPFQsIFRGaWx0ZXJEYXRhPiB8IHVuZGVmaW5lZCA9IHVuZGVmaW5lZCk6IElUcmVlTm9kZTxULCBURmlsdGVyRGF0YT4gfCB1bmRlZmluZWQge1xuXHRcdGxldCBjdXJyZW50QW5jZXN0b3I6IElUcmVlTm9kZTxULCBURmlsdGVyRGF0YT4gPSBub2RlO1xuXHRcdGxldCBwYXJlbnRPZmN1cnJlbnRBbmNlc3RvcjogSVRyZWVOb2RlPFQsIFRGaWx0ZXJEYXRhPiB8IHVuZGVmaW5lZCA9IHRoaXMuZ2V0UGFyZW50Tm9kZShjdXJyZW50QW5jZXN0b3IpO1xuXG5cdFx0d2hpbGUgKHBhcmVudE9mY3VycmVudEFuY2VzdG9yKSB7XG5cdFx0XHRpZiAocGFyZW50T2ZjdXJyZW50QW5jZXN0b3IgPT09IHByZXZpb3VzQW5jZXN0b3IpIHtcblx0XHRcdFx0cmV0dXJuIGN1cnJlbnRBbmNlc3Rvcjtcblx0XHRcdH1cblx0XHRcdGN1cnJlbnRBbmNlc3RvciA9IHBhcmVudE9mY3VycmVudEFuY2VzdG9yO1xuXHRcdFx0cGFyZW50T2ZjdXJyZW50QW5jZXN0b3IgPSB0aGlzLmdldFBhcmVudE5vZGUoY3VycmVudEFuY2VzdG9yKTtcblx0XHR9XG5cblx0XHRpZiAocHJldmlvdXNBbmNlc3RvciA9PT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRyZXR1cm4gY3VycmVudEFuY2VzdG9yO1xuXHRcdH1cblxuXHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdH1cblxuXHRwcml2YXRlIGNhbGN1bGF0ZVN0aWNreU5vZGVQb3NpdGlvbihsYXN0RGVzY2VuZGFudEluZGV4OiBudW1iZXIsIHN0aWNreVJvd1Bvc2l0aW9uVG9wOiBudW1iZXIsIHN0aWNreU5vZGVIZWlnaHQ6IG51bWJlcik6IG51bWJlciB7XG5cdFx0bGV0IGxhc3RDaGlsZFJlbGF0aXZlVG9wID0gdGhpcy52aWV3LmdldFJlbGF0aXZlVG9wKGxhc3REZXNjZW5kYW50SW5kZXgpO1xuXG5cdFx0Ly8gSWYgdGhlIGxhc3QgZGVzY2VuZGFudCBpcyBvbmx5IHBhcnRpYWxseSB2aXNpYmxlIGF0IHRoZSB0b3Agb2YgdGhlIHZpZXcsIGdldFJlbGF0aXZlVG9wKCkgcmV0dXJucyBudWxsXG5cdFx0Ly8gSW4gdGhhdCBjYXNlLCB1dGlsaXplIHRoZSBuZXh0IG5vZGUncyByZWxhdGl2ZSB0b3AgdG8gY2FsY3VsYXRlIHRoZSBzdGlja3kgbm9kZSdzIHBvc2l0aW9uXG5cdFx0aWYgKGxhc3RDaGlsZFJlbGF0aXZlVG9wID09PSBudWxsICYmIHRoaXMudmlldy5maXJzdFZpc2libGVJbmRleCA9PT0gbGFzdERlc2NlbmRhbnRJbmRleCAmJiBsYXN0RGVzY2VuZGFudEluZGV4ICsgMSA8IHRoaXMudmlldy5sZW5ndGgpIHtcblx0XHRcdGNvbnN0IG5vZGVIZWlnaHQgPSB0aGlzLnRyZWVEZWxlZ2F0ZS5nZXRIZWlnaHQodGhpcy52aWV3LmVsZW1lbnQobGFzdERlc2NlbmRhbnRJbmRleCkpO1xuXHRcdFx0Y29uc3QgbmV4dE5vZGVSZWxhdGl2ZVRvcCA9IHRoaXMudmlldy5nZXRSZWxhdGl2ZVRvcChsYXN0RGVzY2VuZGFudEluZGV4ICsgMSk7XG5cdFx0XHRsYXN0Q2hpbGRSZWxhdGl2ZVRvcCA9IG5leHROb2RlUmVsYXRpdmVUb3AgPyBuZXh0Tm9kZVJlbGF0aXZlVG9wIC0gbm9kZUhlaWdodCAvIHRoaXMudmlldy5yZW5kZXJIZWlnaHQgOiBudWxsO1xuXHRcdH1cblxuXHRcdGlmIChsYXN0Q2hpbGRSZWxhdGl2ZVRvcCA9PT0gbnVsbCkge1xuXHRcdFx0cmV0dXJuIHN0aWNreVJvd1Bvc2l0aW9uVG9wO1xuXHRcdH1cblxuXHRcdGNvbnN0IGxhc3RDaGlsZE5vZGUgPSB0aGlzLnZpZXcuZWxlbWVudChsYXN0RGVzY2VuZGFudEluZGV4KTtcblx0XHRjb25zdCBsYXN0Q2hpbGRIZWlnaHQgPSB0aGlzLnRyZWVEZWxlZ2F0ZS5nZXRIZWlnaHQobGFzdENoaWxkTm9kZSk7XG5cdFx0Y29uc3QgdG9wT2ZMYXN0Q2hpbGQgPSBsYXN0Q2hpbGRSZWxhdGl2ZVRvcCAqIHRoaXMudmlldy5yZW5kZXJIZWlnaHQ7XG5cdFx0Y29uc3QgYm90dG9tT2ZMYXN0Q2hpbGQgPSB0b3BPZkxhc3RDaGlsZCArIGxhc3RDaGlsZEhlaWdodDtcblxuXHRcdGlmIChzdGlja3lSb3dQb3NpdGlvblRvcCArIHN0aWNreU5vZGVIZWlnaHQgPiBib3R0b21PZkxhc3RDaGlsZCAmJiBzdGlja3lSb3dQb3NpdGlvblRvcCA8PSBib3R0b21PZkxhc3RDaGlsZCkge1xuXHRcdFx0cmV0dXJuIGJvdHRvbU9mTGFzdENoaWxkIC0gc3RpY2t5Tm9kZUhlaWdodDtcblx0XHR9XG5cblx0XHRyZXR1cm4gc3RpY2t5Um93UG9zaXRpb25Ub3A7XG5cdH1cblxuXHRwcml2YXRlIGNvbnN0cmFpblN0aWNreU5vZGVzKHN0aWNreU5vZGVzOiBTdGlja3lTY3JvbGxOb2RlPFQsIFRGaWx0ZXJEYXRhPltdKTogU3RpY2t5U2Nyb2xsTm9kZTxULCBURmlsdGVyRGF0YT5bXSB7XG5cdFx0aWYgKHN0aWNreU5vZGVzLmxlbmd0aCA9PT0gMCkge1xuXHRcdFx0cmV0dXJuIFtdO1xuXHRcdH1cblxuXHRcdC8vIENoZWNrIGlmIHN0aWNreSBub2RlcyBuZWVkIHRvIGJlIGNvbnN0cmFpbmVkXG5cdFx0Y29uc3QgbWF4aW11bVN0aWNreVdpZGdldEhlaWdodCA9IHRoaXMudmlldy5yZW5kZXJIZWlnaHQgKiB0aGlzLm1heFdpZGdldFZpZXdSYXRpbztcblx0XHRjb25zdCBsYXN0U3RpY2t5Tm9kZSA9IHN0aWNreU5vZGVzW3N0aWNreU5vZGVzLmxlbmd0aCAtIDFdO1xuXHRcdGlmIChzdGlja3lOb2Rlcy5sZW5ndGggPD0gdGhpcy5zdGlja3lTY3JvbGxNYXhJdGVtQ291bnQgJiYgbGFzdFN0aWNreU5vZGUucG9zaXRpb24gKyBsYXN0U3RpY2t5Tm9kZS5oZWlnaHQgPD0gbWF4aW11bVN0aWNreVdpZGdldEhlaWdodCkge1xuXHRcdFx0cmV0dXJuIHN0aWNreU5vZGVzO1xuXHRcdH1cblxuXHRcdC8vIGNvbnN0cmFpbiBzdGlja3kgbm9kZXNcblx0XHRjb25zdCBjb25zdHJhaW5lZFN0aWNreU5vZGVzID0gdGhpcy5zdGlja3lTY3JvbGxEZWxlZ2F0ZS5jb25zdHJhaW5TdGlja3lTY3JvbGxOb2RlcyhzdGlja3lOb2RlcywgdGhpcy5zdGlja3lTY3JvbGxNYXhJdGVtQ291bnQsIG1heGltdW1TdGlja3lXaWRnZXRIZWlnaHQpO1xuXG5cdFx0aWYgKCFjb25zdHJhaW5lZFN0aWNreU5vZGVzLmxlbmd0aCkge1xuXHRcdFx0cmV0dXJuIFtdO1xuXHRcdH1cblxuXHRcdC8vIFZhbGlkYXRlIGNvbnN0cmFpbnRzXG5cdFx0Y29uc3QgbGFzdENvbnN0cmFpbmVkU3RpY2t5Tm9kZSA9IGNvbnN0cmFpbmVkU3RpY2t5Tm9kZXNbY29uc3RyYWluZWRTdGlja3lOb2Rlcy5sZW5ndGggLSAxXTtcblx0XHRpZiAoY29uc3RyYWluZWRTdGlja3lOb2Rlcy5sZW5ndGggPiB0aGlzLnN0aWNreVNjcm9sbE1heEl0ZW1Db3VudCB8fCBsYXN0Q29uc3RyYWluZWRTdGlja3lOb2RlLnBvc2l0aW9uICsgbGFzdENvbnN0cmFpbmVkU3RpY2t5Tm9kZS5oZWlnaHQgPiBtYXhpbXVtU3RpY2t5V2lkZ2V0SGVpZ2h0KSB7XG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IoJ3N0aWNreVNjcm9sbERlbGVnYXRlIHZpb2xhdGVzIGNvbnN0cmFpbnRzJyk7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIGNvbnN0cmFpbmVkU3RpY2t5Tm9kZXM7XG5cdH1cblxuXHRwcml2YXRlIGdldFBhcmVudE5vZGUobm9kZTogSVRyZWVOb2RlPFQsIFRGaWx0ZXJEYXRhPik6IElUcmVlTm9kZTxULCBURmlsdGVyRGF0YT4gfCB1bmRlZmluZWQge1xuXHRcdGNvbnN0IG5vZGVMb2NhdGlvbiA9IHRoaXMubW9kZWwuZ2V0Tm9kZUxvY2F0aW9uKG5vZGUpO1xuXHRcdGNvbnN0IHBhcmVudExvY2F0aW9uID0gdGhpcy5tb2RlbC5nZXRQYXJlbnROb2RlTG9jYXRpb24obm9kZUxvY2F0aW9uKTtcblx0XHRyZXR1cm4gcGFyZW50TG9jYXRpb24gPyB0aGlzLm1vZGVsLmdldE5vZGUocGFyZW50TG9jYXRpb24pIDogdW5kZWZpbmVkO1xuXHR9XG5cblx0cHJpdmF0ZSBub2RlSXNVbmNvbGxhcHNlZFBhcmVudChub2RlOiBJVHJlZU5vZGU8VCwgVEZpbHRlckRhdGE+KTogYm9vbGVhbiB7XG5cdFx0Y29uc3Qgbm9kZUxvY2F0aW9uID0gdGhpcy5tb2RlbC5nZXROb2RlTG9jYXRpb24obm9kZSk7XG5cdFx0cmV0dXJuIHRoaXMubW9kZWwuZ2V0TGlzdFJlbmRlckNvdW50KG5vZGVMb2NhdGlvbikgPiAxO1xuXHR9XG5cblx0cHJpdmF0ZSBnZXROb2RlSW5kZXgobm9kZTogSVRyZWVOb2RlPFQsIFRGaWx0ZXJEYXRhPik6IG51bWJlciB7XG5cdFx0Y29uc3Qgbm9kZUxvY2F0aW9uID0gdGhpcy5tb2RlbC5nZXROb2RlTG9jYXRpb24obm9kZSk7XG5cdFx0Y29uc3Qgbm9kZUluZGV4ID0gdGhpcy5tb2RlbC5nZXRMaXN0SW5kZXgobm9kZUxvY2F0aW9uKTtcblx0XHRyZXR1cm4gbm9kZUluZGV4O1xuXHR9XG5cblx0cHJpdmF0ZSBnZXROb2RlUmFuZ2Uobm9kZTogSVRyZWVOb2RlPFQsIFRGaWx0ZXJEYXRhPik6IHsgc3RhcnRJbmRleDogbnVtYmVyOyBlbmRJbmRleDogbnVtYmVyIH0ge1xuXHRcdGNvbnN0IG5vZGVMb2NhdGlvbiA9IHRoaXMubW9kZWwuZ2V0Tm9kZUxvY2F0aW9uKG5vZGUpO1xuXHRcdGNvbnN0IHN0YXJ0SW5kZXggPSB0aGlzLm1vZGVsLmdldExpc3RJbmRleChub2RlTG9jYXRpb24pO1xuXG5cdFx0aWYgKHN0YXJ0SW5kZXggPCAwKSB7XG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IoJ05vZGUgbm90IGZvdW5kIGluIHRyZWUnKTtcblx0XHR9XG5cblx0XHRjb25zdCByZW5kZXJDb3VudCA9IHRoaXMubW9kZWwuZ2V0TGlzdFJlbmRlckNvdW50KG5vZGVMb2NhdGlvbik7XG5cdFx0Y29uc3QgZW5kSW5kZXggPSBzdGFydEluZGV4ICsgcmVuZGVyQ291bnQgLSAxO1xuXG5cdFx0cmV0dXJuIHsgc3RhcnRJbmRleCwgZW5kSW5kZXggfTtcblx0fVxuXG5cdG5vZGVQb3NpdGlvblRvcEJlbG93V2lkZ2V0KG5vZGU6IElUcmVlTm9kZTxULCBURmlsdGVyRGF0YT4pOiBudW1iZXIge1xuXHRcdGNvbnN0IGFuY2VzdG9ycyA9IFtdO1xuXHRcdGxldCBjdXJyZW50QW5jZXN0b3IgPSB0aGlzLmdldFBhcmVudE5vZGUobm9kZSk7XG5cdFx0d2hpbGUgKGN1cnJlbnRBbmNlc3Rvcikge1xuXHRcdFx0YW5jZXN0b3JzLnB1c2goY3VycmVudEFuY2VzdG9yKTtcblx0XHRcdGN1cnJlbnRBbmNlc3RvciA9IHRoaXMuZ2V0UGFyZW50Tm9kZShjdXJyZW50QW5jZXN0b3IpO1xuXHRcdH1cblxuXHRcdGxldCB3aWRnZXRIZWlnaHQgPSAwO1xuXHRcdGZvciAobGV0IGkgPSAwOyBpIDwgYW5jZXN0b3JzLmxlbmd0aCAmJiBpIDwgdGhpcy5zdGlja3lTY3JvbGxNYXhJdGVtQ291bnQ7IGkrKykge1xuXHRcdFx0d2lkZ2V0SGVpZ2h0ICs9IHRoaXMudHJlZURlbGVnYXRlLmdldEhlaWdodChhbmNlc3RvcnNbaV0pO1xuXHRcdH1cblx0XHRyZXR1cm4gd2lkZ2V0SGVpZ2h0O1xuXHR9XG5cblx0Z2V0Rm9jdXMoKTogVCB8IHVuZGVmaW5lZCB7XG5cdFx0cmV0dXJuIHRoaXMuX3dpZGdldC5nZXRGb2N1cygpO1xuXHR9XG5cblx0ZG9tRm9jdXMoKTogdm9pZCB7XG5cdFx0dGhpcy5fd2lkZ2V0LmRvbUZvY3VzKCk7XG5cdH1cblxuXHQvLyBXaGV0aGVyIHN0aWNreSBzY3JvbGwgd2FzIHRoZSBsYXN0IGZvY3VzZWQgcGFydCBpbiB0aGUgdHJlZSBvciBub3Rcblx0Zm9jdXNlZExhc3QoKTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuIHRoaXMuX3dpZGdldC5mb2N1c2VkTGFzdCgpO1xuXHR9XG5cblx0dXBkYXRlT3B0aW9ucyhvcHRpb25zVXBkYXRlOiBJQWJzdHJhY3RUcmVlT3B0aW9uc1VwZGF0ZTxUPiA9IHt9KTogdm9pZCB7XG5cdFx0aWYgKG9wdGlvbnNVcGRhdGUucGFkZGluZ1RvcCAhPT0gdW5kZWZpbmVkKSB7XG5cdFx0XHR0aGlzLnBhZGRpbmdUb3AgPSBvcHRpb25zVXBkYXRlLnBhZGRpbmdUb3A7XG5cdFx0fVxuXG5cdFx0aWYgKG9wdGlvbnNVcGRhdGUuc3RpY2t5U2Nyb2xsTWF4SXRlbUNvdW50ICE9PSB1bmRlZmluZWQpIHtcblx0XHRcdGNvbnN0IHZhbGlkYXRlZE9wdGlvbnMgPSB0aGlzLnZhbGlkYXRlU3RpY2t5U2V0dGluZ3Mob3B0aW9uc1VwZGF0ZSk7XG5cdFx0XHRpZiAodGhpcy5zdGlja3lTY3JvbGxNYXhJdGVtQ291bnQgIT09IHZhbGlkYXRlZE9wdGlvbnMuc3RpY2t5U2Nyb2xsTWF4SXRlbUNvdW50KSB7XG5cdFx0XHRcdHRoaXMuc3RpY2t5U2Nyb2xsTWF4SXRlbUNvdW50ID0gdmFsaWRhdGVkT3B0aW9ucy5zdGlja3lTY3JvbGxNYXhJdGVtQ291bnQ7XG5cdFx0XHRcdHRoaXMudXBkYXRlKCk7XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG5cblx0dmFsaWRhdGVTdGlja3lTZXR0aW5ncyhvcHRpb25zOiBJQWJzdHJhY3RUcmVlT3B0aW9uc1VwZGF0ZTxUPik6IHsgc3RpY2t5U2Nyb2xsTWF4SXRlbUNvdW50OiBudW1iZXIgfSB7XG5cdFx0bGV0IHN0aWNreVNjcm9sbE1heEl0ZW1Db3VudCA9IDc7XG5cdFx0aWYgKHR5cGVvZiBvcHRpb25zLnN0aWNreVNjcm9sbE1heEl0ZW1Db3VudCA9PT0gJ251bWJlcicpIHtcblx0XHRcdHN0aWNreVNjcm9sbE1heEl0ZW1Db3VudCA9IE1hdGgubWF4KG9wdGlvbnMuc3RpY2t5U2Nyb2xsTWF4SXRlbUNvdW50LCAxKTtcblx0XHR9XG5cdFx0cmV0dXJuIHsgc3RpY2t5U2Nyb2xsTWF4SXRlbUNvdW50IH07XG5cdH1cbn1cblxuY2xhc3MgU3RpY2t5U2Nyb2xsV2lkZ2V0PFQsIFRGaWx0ZXJEYXRhLCBUUmVmPiBpbXBsZW1lbnRzIElEaXNwb3NhYmxlIHtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9yb290RG9tTm9kZTogSFRNTEVsZW1lbnQ7XG5cdHByaXZhdGUgX3ByZXZpb3VzU3RhdGU6IFN0aWNreVNjcm9sbFN0YXRlPFQsIFRGaWx0ZXJEYXRhLCBUUmVmPiB8IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSBfcHJldmlvdXNFbGVtZW50czogSFRNTEVsZW1lbnRbXSA9IFtdO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9wcmV2aW91c1N0YXRlRGlzcG9zYWJsZXM6IERpc3Bvc2FibGVTdG9yZSA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblx0Z2V0IHN0YXRlKCk6IFN0aWNreVNjcm9sbFN0YXRlPFQsIFRGaWx0ZXJEYXRhLCBUUmVmPiB8IHVuZGVmaW5lZCB7IHJldHVybiB0aGlzLl9wcmV2aW91c1N0YXRlOyB9XG5cblx0cHJpdmF0ZSBzdGlja3lTY3JvbGxGb2N1czogU3RpY2t5U2Nyb2xsRm9jdXM8VCwgVEZpbHRlckRhdGEsIFRSZWY+O1xuXHRyZWFkb25seSBvbkRpZENoYW5nZUhhc0ZvY3VzOiBFdmVudDxib29sZWFuPjtcblx0cmVhZG9ubHkgb25Db250ZXh0TWVudTogRXZlbnQ8SVRyZWVDb250ZXh0TWVudUV2ZW50PFQ+PjtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRjb250YWluZXI6IEhUTUxFbGVtZW50LFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgdmlldzogTGlzdDxJVHJlZU5vZGU8VCwgVEZpbHRlckRhdGE+Pixcblx0XHRwcml2YXRlIHJlYWRvbmx5IHRyZWU6IEFic3RyYWN0VHJlZTxULCBURmlsdGVyRGF0YSwgVFJlZj4sXG5cdFx0cHJpdmF0ZSByZWFkb25seSB0cmVlUmVuZGVyZXJzOiBUcmVlUmVuZGVyZXI8VCwgVEZpbHRlckRhdGEsIFRSZWYsIHVua25vd24+W10sXG5cdFx0cHJpdmF0ZSByZWFkb25seSB0cmVlRGVsZWdhdGU6IElMaXN0VmlydHVhbERlbGVnYXRlPElUcmVlTm9kZTxULCBURmlsdGVyRGF0YT4+LFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgYWNjZXNzaWJpbGl0eVByb3ZpZGVyOiBJTGlzdEFjY2Vzc2liaWxpdHlQcm92aWRlcjxUPiB8IHVuZGVmaW5lZCxcblx0KSB7XG5cblx0XHR0aGlzLl9yb290RG9tTm9kZSA9ICQoJy5tb25hY28tdHJlZS1zdGlja3ktY29udGFpbmVyLmVtcHR5Jyk7XG5cdFx0Y29udGFpbmVyLmFwcGVuZENoaWxkKHRoaXMuX3Jvb3REb21Ob2RlKTtcblxuXHRcdGNvbnN0IHNoYWRvdyA9ICQoJy5tb25hY28tdHJlZS1zdGlja3ktY29udGFpbmVyLXNoYWRvdycpO1xuXHRcdHRoaXMuX3Jvb3REb21Ob2RlLmFwcGVuZENoaWxkKHNoYWRvdyk7XG5cblx0XHR0aGlzLnN0aWNreVNjcm9sbEZvY3VzID0gbmV3IFN0aWNreVNjcm9sbEZvY3VzKHRoaXMuX3Jvb3REb21Ob2RlLCB2aWV3KTtcblx0XHR0aGlzLm9uRGlkQ2hhbmdlSGFzRm9jdXMgPSB0aGlzLnN0aWNreVNjcm9sbEZvY3VzLm9uRGlkQ2hhbmdlSGFzRm9jdXM7XG5cdFx0dGhpcy5vbkNvbnRleHRNZW51ID0gdGhpcy5zdGlja3lTY3JvbGxGb2N1cy5vbkNvbnRleHRNZW51O1xuXHR9XG5cblx0Z2V0IGhlaWdodCgpOiBudW1iZXIge1xuXHRcdGlmICghdGhpcy5fcHJldmlvdXNTdGF0ZSkge1xuXHRcdFx0cmV0dXJuIDA7XG5cdFx0fVxuXHRcdGNvbnN0IGxhc3RFbGVtZW50ID0gdGhpcy5fcHJldmlvdXNTdGF0ZS5zdGlja3lOb2Rlc1t0aGlzLl9wcmV2aW91c1N0YXRlLmNvdW50IC0gMV07XG5cdFx0cmV0dXJuIGxhc3RFbGVtZW50LnBvc2l0aW9uICsgbGFzdEVsZW1lbnQuaGVpZ2h0O1xuXHR9XG5cblx0Z2V0IGNvdW50KCk6IG51bWJlciB7XG5cdFx0cmV0dXJuIHRoaXMuX3ByZXZpb3VzU3RhdGU/LmNvdW50ID8/IDA7XG5cdH1cblxuXHRnZXROb2RlKG5vZGU6IElUcmVlTm9kZTxULCBURmlsdGVyRGF0YT4pOiBTdGlja3lTY3JvbGxOb2RlPFQsIFRGaWx0ZXJEYXRhPiB8IHVuZGVmaW5lZCB7XG5cdFx0cmV0dXJuIHRoaXMuX3ByZXZpb3VzU3RhdGU/LnN0aWNreU5vZGVzLmZpbmQoc3RpY2t5Tm9kZSA9PiBzdGlja3lOb2RlLm5vZGUgPT09IG5vZGUpO1xuXHR9XG5cblx0c2V0U3RhdGUoc3RhdGU6IFN0aWNreVNjcm9sbFN0YXRlPFQsIFRGaWx0ZXJEYXRhLCBUUmVmPiB8IHVuZGVmaW5lZCk6IHZvaWQge1xuXG5cdFx0Y29uc3Qgd2FzVmlzaWJsZSA9ICEhdGhpcy5fcHJldmlvdXNTdGF0ZSAmJiB0aGlzLl9wcmV2aW91c1N0YXRlLmNvdW50ID4gMDtcblx0XHRjb25zdCBpc1Zpc2libGUgPSAhIXN0YXRlICYmIHN0YXRlLmNvdW50ID4gMDtcblxuXHRcdC8vIElmIHN0YXRlIGhhcyBub3QgY2hhbmdlZCwgZG8gbm90aGluZ1xuXHRcdGlmICgoIXdhc1Zpc2libGUgJiYgIWlzVmlzaWJsZSkgfHwgKHdhc1Zpc2libGUgJiYgaXNWaXNpYmxlICYmIHRoaXMuX3ByZXZpb3VzU3RhdGUhLmVxdWFsKHN0YXRlKSkpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHQvLyBVcGRhdGUgdmlzaWJpbGl0eSBvZiB0aGUgd2lkZ2V0IGlmIGNoYW5nZWRcblx0XHRpZiAod2FzVmlzaWJsZSAhPT0gaXNWaXNpYmxlKSB7XG5cdFx0XHR0aGlzLnNldFZpc2libGUoaXNWaXNpYmxlKTtcblx0XHR9XG5cblx0XHRpZiAoIWlzVmlzaWJsZSkge1xuXHRcdFx0dGhpcy5fcHJldmlvdXNTdGF0ZSA9IHVuZGVmaW5lZDtcblx0XHRcdHRoaXMuX3ByZXZpb3VzRWxlbWVudHMgPSBbXTtcblx0XHRcdHRoaXMuX3ByZXZpb3VzU3RhdGVEaXNwb3NhYmxlcy5jbGVhcigpO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IGxhc3RTdGlja3lOb2RlID0gc3RhdGUuc3RpY2t5Tm9kZXNbc3RhdGUuY291bnQgLSAxXTtcblxuXHRcdC8vIElmIHRoZSBuZXcgc3RhdGUgaXMgb25seSBhIGNoYW5nZSBpbiB0aGUgbGFzdCBub2RlJ3MgcG9zaXRpb24sIHVwZGF0ZSB0aGUgcG9zaXRpb24gb2YgdGhlIGxhc3QgZWxlbWVudFxuXHRcdGlmICh0aGlzLl9wcmV2aW91c1N0YXRlICYmIHN0YXRlLmFuaW1hdGlvblN0YXRlQ2hhbmdlZCh0aGlzLl9wcmV2aW91c1N0YXRlKSkge1xuXHRcdFx0dGhpcy5fcHJldmlvdXNFbGVtZW50c1t0aGlzLl9wcmV2aW91c1N0YXRlLmNvdW50IC0gMV0uc3R5bGUudG9wID0gYCR7bGFzdFN0aWNreU5vZGUucG9zaXRpb259cHhgO1xuXHRcdH1cblx0XHQvLyBjcmVhdGUgbmV3IGRvbSBlbGVtZW50c1xuXHRcdGVsc2Uge1xuXHRcdFx0dGhpcy5yZW5kZXJTdGF0ZShzdGF0ZSk7XG5cdFx0fVxuXG5cdFx0dGhpcy5fcHJldmlvdXNTdGF0ZSA9IHN0YXRlO1xuXG5cdFx0Ly8gU2V0IHRoZSBoZWlnaHQgb2YgdGhlIHdpZGdldCB0byB0aGUgYm90dG9tIG9mIHRoZSBsYXN0IHN0aWNreSBub2RlXG5cdFx0dGhpcy5fcm9vdERvbU5vZGUuc3R5bGUuaGVpZ2h0ID0gYCR7bGFzdFN0aWNreU5vZGUucG9zaXRpb24gKyBsYXN0U3RpY2t5Tm9kZS5oZWlnaHR9cHhgO1xuXHR9XG5cblx0cHJpdmF0ZSByZW5kZXJTdGF0ZShzdGF0ZTogU3RpY2t5U2Nyb2xsU3RhdGU8VCwgVEZpbHRlckRhdGEsIFRSZWY+KTogdm9pZCB7XG5cdFx0dGhpcy5fcHJldmlvdXNTdGF0ZURpc3Bvc2FibGVzLmNsZWFyKCk7XG5cblx0XHRjb25zdCBlbGVtZW50cyA9IEFycmF5KHN0YXRlLmNvdW50KTtcblx0XHRmb3IgKGxldCBzdGlja3lJbmRleCA9IHN0YXRlLmNvdW50IC0gMTsgc3RpY2t5SW5kZXggPj0gMDsgc3RpY2t5SW5kZXgtLSkge1xuXHRcdFx0Y29uc3Qgc3RpY2t5Tm9kZSA9IHN0YXRlLnN0aWNreU5vZGVzW3N0aWNreUluZGV4XTtcblxuXHRcdFx0Y29uc3QgeyBlbGVtZW50LCBkaXNwb3NhYmxlIH0gPSB0aGlzLmNyZWF0ZUVsZW1lbnQoc3RpY2t5Tm9kZSwgc3RpY2t5SW5kZXgsIHN0YXRlLmNvdW50KTtcblx0XHRcdGVsZW1lbnRzW3N0aWNreUluZGV4XSA9IGVsZW1lbnQ7XG5cblx0XHRcdHRoaXMuX3Jvb3REb21Ob2RlLmFwcGVuZENoaWxkKGVsZW1lbnQpO1xuXHRcdFx0dGhpcy5fcHJldmlvdXNTdGF0ZURpc3Bvc2FibGVzLmFkZChkaXNwb3NhYmxlKTtcblx0XHR9XG5cblx0XHR0aGlzLnN0aWNreVNjcm9sbEZvY3VzLnVwZGF0ZUVsZW1lbnRzKGVsZW1lbnRzLCBzdGF0ZSk7XG5cblx0XHR0aGlzLl9wcmV2aW91c0VsZW1lbnRzID0gZWxlbWVudHM7XG5cdH1cblxuXHRyZXJlbmRlcigpOiB2b2lkIHtcblx0XHRpZiAodGhpcy5fcHJldmlvdXNTdGF0ZSkge1xuXHRcdFx0dGhpcy5yZW5kZXJTdGF0ZSh0aGlzLl9wcmV2aW91c1N0YXRlKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIGNyZWF0ZUVsZW1lbnQoc3RpY2t5Tm9kZTogU3RpY2t5U2Nyb2xsTm9kZTxULCBURmlsdGVyRGF0YT4sIHN0aWNreUluZGV4OiBudW1iZXIsIHN0aWNreU5vZGVzVG90YWw6IG51bWJlcik6IHsgZWxlbWVudDogSFRNTEVsZW1lbnQ7IGRpc3Bvc2FibGU6IElEaXNwb3NhYmxlIH0ge1xuXG5cdFx0Y29uc3Qgbm9kZUluZGV4ID0gc3RpY2t5Tm9kZS5zdGFydEluZGV4O1xuXG5cdFx0Ly8gU3RpY2t5IGVsZW1lbnQgY29udGFpbmVyXG5cdFx0Y29uc3Qgc3RpY2t5RWxlbWVudCA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2RpdicpO1xuXHRcdHN0aWNreUVsZW1lbnQuc3R5bGUudG9wID0gYCR7c3RpY2t5Tm9kZS5wb3NpdGlvbn1weGA7XG5cblx0XHRpZiAodGhpcy50cmVlLm9wdGlvbnMuc2V0Um93SGVpZ2h0ICE9PSBmYWxzZSkge1xuXHRcdFx0c3RpY2t5RWxlbWVudC5zdHlsZS5oZWlnaHQgPSBgJHtzdGlja3lOb2RlLmhlaWdodH1weGA7XG5cdFx0fVxuXG5cdFx0aWYgKHRoaXMudHJlZS5vcHRpb25zLnNldFJvd0xpbmVIZWlnaHQgIT09IGZhbHNlKSB7XG5cdFx0XHRzdGlja3lFbGVtZW50LnN0eWxlLmxpbmVIZWlnaHQgPSBgJHtzdGlja3lOb2RlLmhlaWdodH1weGA7XG5cdFx0fVxuXG5cdFx0c3RpY2t5RWxlbWVudC5jbGFzc0xpc3QuYWRkKCdtb25hY28tdHJlZS1zdGlja3ktcm93Jyk7XG5cdFx0c3RpY2t5RWxlbWVudC5jbGFzc0xpc3QuYWRkKCdtb25hY28tbGlzdC1yb3cnKTtcblxuXHRcdHN0aWNreUVsZW1lbnQuc2V0QXR0cmlidXRlKCdkYXRhLWluZGV4JywgYCR7bm9kZUluZGV4fWApO1xuXHRcdHN0aWNreUVsZW1lbnQuc2V0QXR0cmlidXRlKCdkYXRhLXBhcml0eScsIG5vZGVJbmRleCAlIDIgPT09IDAgPyAnZXZlbicgOiAnb2RkJyk7XG5cdFx0c3RpY2t5RWxlbWVudC5zZXRBdHRyaWJ1dGUoJ2lkJywgdGhpcy52aWV3LmdldEVsZW1lbnRJRChub2RlSW5kZXgpKTtcblx0XHRjb25zdCBhY2Nlc3NpYmlsaXR5RGlzcG9zYWJsZSA9IHRoaXMuc2V0QWNjZXNzaWJpbGl0eUF0dHJpYnV0ZXMoc3RpY2t5RWxlbWVudCwgc3RpY2t5Tm9kZS5ub2RlLmVsZW1lbnQsIHN0aWNreUluZGV4LCBzdGlja3lOb2Rlc1RvdGFsKTtcblxuXHRcdC8vIEdldCB0aGUgcmVuZGVyZXIgZm9yIHRoZSBub2RlXG5cdFx0Y29uc3Qgbm9kZVRlbXBsYXRlSWQgPSB0aGlzLnRyZWVEZWxlZ2F0ZS5nZXRUZW1wbGF0ZUlkKHN0aWNreU5vZGUubm9kZSk7XG5cdFx0Y29uc3QgcmVuZGVyZXIgPSB0aGlzLnRyZWVSZW5kZXJlcnMuZmluZCgocmVuZGVyZXIpID0+IHJlbmRlcmVyLnRlbXBsYXRlSWQgPT09IG5vZGVUZW1wbGF0ZUlkKTtcblx0XHRpZiAoIXJlbmRlcmVyKSB7XG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IoYE5vIHJlbmRlcmVyIGZvdW5kIGZvciB0ZW1wbGF0ZSBpZCAke25vZGVUZW1wbGF0ZUlkfWApO1xuXHRcdH1cblxuXHRcdC8vIFRvIG1ha2Ugc3VyZSB3ZSBkbyBub3QgaW5mbHVlbmNlIHRoZSBvcmlnaW5hbCBub2RlLCB3ZSBjcmVhdGUgYSBjb3B5IG9mIHRoZSBub2RlXG5cdFx0Ly8gV2UgbmVlZCB0byBjaGVjayBpZiBpdCBpcyBhbHJlYWR5IGEgdW5pcXVlIGluc3RhbmNlIG9mIHRoZSBub2RlIGJ5IHRoZSBkZWxlZ2F0ZVxuXHRcdGxldCBub2RlQ29weSA9IHN0aWNreU5vZGUubm9kZTtcblx0XHRpZiAobm9kZUNvcHkgPT09IHRoaXMudHJlZS5nZXROb2RlKHRoaXMudHJlZS5nZXROb2RlTG9jYXRpb24oc3RpY2t5Tm9kZS5ub2RlKSkpIHtcblx0XHRcdG5vZGVDb3B5ID0gbmV3IFByb3h5KHN0aWNreU5vZGUubm9kZSwge30pO1xuXHRcdH1cblxuXHRcdC8vIFJlbmRlciB0aGUgZWxlbWVudFxuXHRcdGNvbnN0IHRlbXBsYXRlRGF0YSA9IHJlbmRlcmVyLnJlbmRlclRlbXBsYXRlKHN0aWNreUVsZW1lbnQpO1xuXHRcdHJlbmRlcmVyLnJlbmRlckVsZW1lbnQobm9kZUNvcHksIHN0aWNreU5vZGUuc3RhcnRJbmRleCwgdGVtcGxhdGVEYXRhLCB7IGhlaWdodDogc3RpY2t5Tm9kZS5oZWlnaHQgfSk7XG5cblx0XHQvLyBSZW1vdmUgdGhlIGVsZW1lbnQgZnJvbSB0aGUgRE9NIHdoZW4gc3RhdGUgaXMgZGlzcG9zZWRcblx0XHRjb25zdCBkaXNwb3NhYmxlID0gdG9EaXNwb3NhYmxlKCgpID0+IHtcblx0XHRcdGFjY2Vzc2liaWxpdHlEaXNwb3NhYmxlLmRpc3Bvc2UoKTtcblx0XHRcdHJlbmRlcmVyLmRpc3Bvc2VFbGVtZW50KG5vZGVDb3B5LCBzdGlja3lOb2RlLnN0YXJ0SW5kZXgsIHRlbXBsYXRlRGF0YSwgeyBoZWlnaHQ6IHN0aWNreU5vZGUuaGVpZ2h0IH0pO1xuXHRcdFx0cmVuZGVyZXIuZGlzcG9zZVRlbXBsYXRlKHRlbXBsYXRlRGF0YSk7XG5cdFx0XHRzdGlja3lFbGVtZW50LnJlbW92ZSgpO1xuXHRcdH0pO1xuXG5cdFx0cmV0dXJuIHsgZWxlbWVudDogc3RpY2t5RWxlbWVudCwgZGlzcG9zYWJsZSB9O1xuXHR9XG5cblx0cHJpdmF0ZSBzZXRBY2Nlc3NpYmlsaXR5QXR0cmlidXRlcyhjb250YWluZXI6IEhUTUxFbGVtZW50LCBlbGVtZW50OiBULCBzdGlja3lJbmRleDogbnVtYmVyLCBzdGlja3lOb2Rlc1RvdGFsOiBudW1iZXIpOiBJRGlzcG9zYWJsZSB7XG5cdFx0aWYgKCF0aGlzLmFjY2Vzc2liaWxpdHlQcm92aWRlcikge1xuXHRcdFx0cmV0dXJuIERpc3Bvc2FibGUuTm9uZTtcblx0XHR9XG5cblx0XHRpZiAodGhpcy5hY2Nlc3NpYmlsaXR5UHJvdmlkZXIuZ2V0U2V0U2l6ZSkge1xuXHRcdFx0Y29udGFpbmVyLnNldEF0dHJpYnV0ZSgnYXJpYS1zZXRzaXplJywgU3RyaW5nKHRoaXMuYWNjZXNzaWJpbGl0eVByb3ZpZGVyLmdldFNldFNpemUoZWxlbWVudCwgc3RpY2t5SW5kZXgsIHN0aWNreU5vZGVzVG90YWwpKSk7XG5cdFx0fVxuXHRcdGlmICh0aGlzLmFjY2Vzc2liaWxpdHlQcm92aWRlci5nZXRQb3NJblNldCkge1xuXHRcdFx0Y29udGFpbmVyLnNldEF0dHJpYnV0ZSgnYXJpYS1wb3NpbnNldCcsIFN0cmluZyh0aGlzLmFjY2Vzc2liaWxpdHlQcm92aWRlci5nZXRQb3NJblNldChlbGVtZW50LCBzdGlja3lJbmRleCkpKTtcblx0XHR9XG5cdFx0aWYgKHRoaXMuYWNjZXNzaWJpbGl0eVByb3ZpZGVyLmdldFJvbGUpIHtcblx0XHRcdGNvbnRhaW5lci5zZXRBdHRyaWJ1dGUoJ3JvbGUnLCB0aGlzLmFjY2Vzc2liaWxpdHlQcm92aWRlci5nZXRSb2xlKGVsZW1lbnQpID8/ICd0cmVlaXRlbScpO1xuXHRcdH1cblxuXHRcdGNvbnN0IGFyaWFMYWJlbCA9IHRoaXMuYWNjZXNzaWJpbGl0eVByb3ZpZGVyLmdldEFyaWFMYWJlbChlbGVtZW50KTtcblx0XHRjb25zdCBvYnNlcnZhYmxlID0gKGFyaWFMYWJlbCAmJiB0eXBlb2YgYXJpYUxhYmVsICE9PSAnc3RyaW5nJykgPyBhcmlhTGFiZWwgOiBjb25zdE9ic2VydmFibGUoYXJpYUxhYmVsKTtcblx0XHRjb25zdCByZXN1bHQgPSBhdXRvcnVuKHJlYWRlciA9PiB7XG5cdFx0XHRjb25zdCB2YWx1ZSA9IHJlYWRlci5yZWFkT2JzZXJ2YWJsZShvYnNlcnZhYmxlKTtcblxuXHRcdFx0aWYgKHZhbHVlKSB7XG5cdFx0XHRcdGNvbnRhaW5lci5zZXRBdHRyaWJ1dGUoJ2FyaWEtbGFiZWwnLCB2YWx1ZSk7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRjb250YWluZXIucmVtb3ZlQXR0cmlidXRlKCdhcmlhLWxhYmVsJyk7XG5cdFx0XHR9XG5cdFx0fSk7XG5cblx0XHRpZiAodHlwZW9mIGFyaWFMYWJlbCA9PT0gJ3N0cmluZycpIHtcblx0XHR9IGVsc2UgaWYgKGFyaWFMYWJlbCkge1xuXHRcdFx0Y29udGFpbmVyLnNldEF0dHJpYnV0ZSgnYXJpYS1sYWJlbCcsIGFyaWFMYWJlbC5nZXQoKSk7XG5cdFx0fVxuXG5cdFx0Y29uc3QgYXJpYUxldmVsID0gdGhpcy5hY2Nlc3NpYmlsaXR5UHJvdmlkZXIuZ2V0QXJpYUxldmVsICYmIHRoaXMuYWNjZXNzaWJpbGl0eVByb3ZpZGVyLmdldEFyaWFMZXZlbChlbGVtZW50KTtcblx0XHRpZiAodHlwZW9mIGFyaWFMZXZlbCA9PT0gJ251bWJlcicpIHtcblx0XHRcdGNvbnRhaW5lci5zZXRBdHRyaWJ1dGUoJ2FyaWEtbGV2ZWwnLCBgJHthcmlhTGV2ZWx9YCk7XG5cdFx0fVxuXG5cdFx0Ly8gU3RpY2t5IFNjcm9sbCBlbGVtZW50cyBjYW4gbm90IGJlIHNlbGVjdGVkXG5cdFx0Y29udGFpbmVyLnNldEF0dHJpYnV0ZSgnYXJpYS1zZWxlY3RlZCcsIFN0cmluZyhmYWxzZSkpO1xuXG5cdFx0cmV0dXJuIHJlc3VsdDtcblx0fVxuXG5cdHByaXZhdGUgc2V0VmlzaWJsZSh2aXNpYmxlOiBib29sZWFuKTogdm9pZCB7XG5cdFx0dGhpcy5fcm9vdERvbU5vZGUuY2xhc3NMaXN0LnRvZ2dsZSgnZW1wdHknLCAhdmlzaWJsZSk7XG5cblx0XHRpZiAoIXZpc2libGUpIHtcblx0XHRcdHRoaXMuc3RpY2t5U2Nyb2xsRm9jdXMudXBkYXRlRWxlbWVudHMoW10sIHVuZGVmaW5lZCk7XG5cdFx0fVxuXHR9XG5cblx0Z2V0Rm9jdXMoKTogVCB8IHVuZGVmaW5lZCB7XG5cdFx0cmV0dXJuIHRoaXMuc3RpY2t5U2Nyb2xsRm9jdXMuZ2V0Rm9jdXMoKTtcblx0fVxuXG5cdGRvbUZvY3VzKCk6IHZvaWQge1xuXHRcdHRoaXMuc3RpY2t5U2Nyb2xsRm9jdXMuZG9tRm9jdXMoKTtcblx0fVxuXG5cdGZvY3VzZWRMYXN0KCk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiB0aGlzLnN0aWNreVNjcm9sbEZvY3VzLmZvY3VzZWRMYXN0KCk7XG5cdH1cblxuXHRkaXNwb3NlKCk6IHZvaWQge1xuXHRcdHRoaXMuc3RpY2t5U2Nyb2xsRm9jdXMuZGlzcG9zZSgpO1xuXHRcdHRoaXMuX3ByZXZpb3VzU3RhdGVEaXNwb3NhYmxlcy5kaXNwb3NlKCk7XG5cdFx0dGhpcy5fcm9vdERvbU5vZGUucmVtb3ZlKCk7XG5cdH1cbn1cblxuY2xhc3MgU3RpY2t5U2Nyb2xsRm9jdXM8VCwgVEZpbHRlckRhdGEsIFRSZWY+IGV4dGVuZHMgRGlzcG9zYWJsZSB7XG5cblx0cHJpdmF0ZSBmb2N1c2VkSW5kZXg6IG51bWJlciA9IC0xO1xuXHRwcml2YXRlIGVsZW1lbnRzOiBIVE1MRWxlbWVudFtdID0gW107XG5cdHByaXZhdGUgc3RhdGU6IFN0aWNreVNjcm9sbFN0YXRlPFQsIFRGaWx0ZXJEYXRhLCBUUmVmPiB8IHVuZGVmaW5lZDtcblxuXHRwcml2YXRlIF9vbkRpZENoYW5nZUhhc0ZvY3VzID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8Ym9vbGVhbj4oKSk7XG5cdHJlYWRvbmx5IG9uRGlkQ2hhbmdlSGFzRm9jdXMgPSB0aGlzLl9vbkRpZENoYW5nZUhhc0ZvY3VzLmV2ZW50O1xuXG5cdHByaXZhdGUgX29uQ29udGV4dE1lbnUgPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjxJVHJlZUNvbnRleHRNZW51RXZlbnQ8VD4+KCkpO1xuXHRyZWFkb25seSBvbkNvbnRleHRNZW51OiBFdmVudDxJVHJlZUNvbnRleHRNZW51RXZlbnQ8VD4+ID0gdGhpcy5fb25Db250ZXh0TWVudS5ldmVudDtcblxuXHRwcml2YXRlIF9kb21IYXNGb2N1czogYm9vbGVhbiA9IGZhbHNlO1xuXHRwcml2YXRlIGdldCBkb21IYXNGb2N1cygpOiBib29sZWFuIHsgcmV0dXJuIHRoaXMuX2RvbUhhc0ZvY3VzOyB9XG5cdHByaXZhdGUgc2V0IGRvbUhhc0ZvY3VzKGhhc0ZvY3VzOiBib29sZWFuKSB7XG5cdFx0aWYgKGhhc0ZvY3VzICE9PSB0aGlzLl9kb21IYXNGb2N1cykge1xuXHRcdFx0dGhpcy5fb25EaWRDaGFuZ2VIYXNGb2N1cy5maXJlKGhhc0ZvY3VzKTtcblx0XHRcdHRoaXMuX2RvbUhhc0ZvY3VzID0gaGFzRm9jdXM7XG5cdFx0fVxuXHR9XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0cHJpdmF0ZSByZWFkb25seSBjb250YWluZXI6IEhUTUxFbGVtZW50LFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgdmlldzogTGlzdDxJVHJlZU5vZGU8VCwgVEZpbHRlckRhdGE+PlxuXHQpIHtcblx0XHRzdXBlcigpO1xuXG5cdFx0dGhpcy5fcmVnaXN0ZXIoYWRkRGlzcG9zYWJsZUxpc3RlbmVyKHRoaXMuY29udGFpbmVyLCAnZm9jdXMnLCAoKSA9PiB0aGlzLm9uRm9jdXMoKSkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKGFkZERpc3Bvc2FibGVMaXN0ZW5lcih0aGlzLmNvbnRhaW5lciwgJ2JsdXInLCAoKSA9PiB0aGlzLm9uQmx1cigpKSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy52aWV3Lm9uRGlkRm9jdXMoKCkgPT4gdGhpcy50b2dnbGVTdGlja3lTY3JvbGxGb2N1c2VkKGZhbHNlKSkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMudmlldy5vbktleURvd24oKGUpID0+IHRoaXMub25LZXlEb3duKGUpKSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy52aWV3Lm9uTW91c2VEb3duKChlKSA9PiB0aGlzLm9uTW91c2VEb3duKGUpKSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy52aWV3Lm9uQ29udGV4dE1lbnUoKGUpID0+IHRoaXMuaGFuZGxlQ29udGV4dE1lbnUoZSkpKTtcblx0fVxuXG5cdHByaXZhdGUgaGFuZGxlQ29udGV4dE1lbnUoZTogSUxpc3RDb250ZXh0TWVudUV2ZW50PElUcmVlTm9kZTxULCBURmlsdGVyRGF0YT4+KTogdm9pZCB7XG5cdFx0Y29uc3QgdGFyZ2V0ID0gZS5icm93c2VyRXZlbnQudGFyZ2V0IGFzIEhUTUxFbGVtZW50O1xuXHRcdGlmICghaXNTdGlja3lTY3JvbGxDb250YWluZXIodGFyZ2V0KSAmJiAhaXNTdGlja3lTY3JvbGxFbGVtZW50KHRhcmdldCkpIHtcblx0XHRcdGlmICh0aGlzLmZvY3VzZWRMYXN0KCkpIHtcblx0XHRcdFx0dGhpcy52aWV3LmRvbUZvY3VzKCk7XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Ly8gVGhlIGxpc3QgaGFuZGxlcyB0aGUgY29udGV4dCBtZW51IHRyaWdnZXJlZCBieSBhIG1vdXNlIGV2ZW50XG5cdFx0Ly8gSW4gdGhhdCBjYXNlIG9ubHkgc2V0IHRoZSBmb2N1cyBvZiB0aGUgZWxlbWVudCBjbGlja2VkIGFuZCBsZWF2ZSB0aGUgcmVzdCB0byB0aGUgbGlzdCB0byBoYW5kbGVcblx0XHRpZiAoIWlzS2V5Ym9hcmRFdmVudChlLmJyb3dzZXJFdmVudCkpIHtcblx0XHRcdGlmICghdGhpcy5zdGF0ZSkge1xuXHRcdFx0XHR0aHJvdyBuZXcgRXJyb3IoJ0NvbnRleHQgbWVudSBzaG91bGQgbm90IGJlIHRyaWdnZXJlZCB3aGVuIHN0YXRlIGlzIHVuZGVmaW5lZCcpO1xuXHRcdFx0fVxuXG5cdFx0XHRjb25zdCBzdGlja3lJbmRleCA9IHRoaXMuc3RhdGUuc3RpY2t5Tm9kZXMuZmluZEluZGV4KHN0aWNreU5vZGUgPT4gc3RpY2t5Tm9kZS5ub2RlLmVsZW1lbnQgPT09IGUuZWxlbWVudD8uZWxlbWVudCk7XG5cblx0XHRcdGlmIChzdGlja3lJbmRleCA9PT0gLTEpIHtcblx0XHRcdFx0dGhyb3cgbmV3IEVycm9yKCdDb250ZXh0IG1lbnUgc2hvdWxkIG5vdCBiZSB0cmlnZ2VyZWQgd2hlbiBlbGVtZW50IGlzIG5vdCBpbiBzdGlja3kgc2Nyb2xsIHdpZGdldCcpO1xuXHRcdFx0fVxuXHRcdFx0dGhpcy5jb250YWluZXIuZm9jdXMoKTtcblx0XHRcdHRoaXMuc2V0Rm9jdXMoc3RpY2t5SW5kZXgpO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGlmICghdGhpcy5zdGF0ZSB8fCB0aGlzLmZvY3VzZWRJbmRleCA8IDApIHtcblx0XHRcdHRocm93IG5ldyBFcnJvcignQ29udGV4dCBtZW51IGtleSBzaG91bGQgbm90IGJlIHRyaWdnZXJlZCB3aGVuIGZvY3VzIGlzIG5vdCBpbiBzdGlja3kgc2Nyb2xsIHdpZGdldCcpO1xuXHRcdH1cblxuXHRcdGNvbnN0IHN0aWNreU5vZGUgPSB0aGlzLnN0YXRlLnN0aWNreU5vZGVzW3RoaXMuZm9jdXNlZEluZGV4XTtcblx0XHRjb25zdCBlbGVtZW50ID0gc3RpY2t5Tm9kZS5ub2RlLmVsZW1lbnQ7XG5cdFx0Y29uc3QgYW5jaG9yID0gdGhpcy5lbGVtZW50c1t0aGlzLmZvY3VzZWRJbmRleF07XG5cdFx0dGhpcy5fb25Db250ZXh0TWVudS5maXJlKHsgZWxlbWVudCwgYW5jaG9yLCBicm93c2VyRXZlbnQ6IGUuYnJvd3NlckV2ZW50LCBpc1N0aWNreVNjcm9sbDogdHJ1ZSB9KTtcblx0fVxuXG5cdHByaXZhdGUgb25LZXlEb3duKGU6IEtleWJvYXJkRXZlbnQpOiB2b2lkIHtcblx0XHQvLyBTdGlja3kgU2Nyb2xsIE5hdmlnYXRpb25cblx0XHRpZiAodGhpcy5kb21IYXNGb2N1cyAmJiB0aGlzLnN0YXRlKSB7XG5cdFx0XHQvLyBNb3ZlIHVwXG5cdFx0XHRpZiAoZS5rZXkgPT09ICdBcnJvd1VwJykge1xuXHRcdFx0XHR0aGlzLnNldEZvY3VzZWRFbGVtZW50KE1hdGgubWF4KDAsIHRoaXMuZm9jdXNlZEluZGV4IC0gMSkpO1xuXHRcdFx0XHRlLnByZXZlbnREZWZhdWx0KCk7XG5cdFx0XHRcdGUuc3RvcFByb3BhZ2F0aW9uKCk7XG5cdFx0XHR9XG5cdFx0XHQvLyBNb3ZlIGRvd24sIGlmIGxhc3Qgc3RpY2t5IG5vZGUgaXMgZm9jdXNlZCwgbW92ZSBmb2N1cyBpbnRvIGZpcnN0IGNoaWxkIG9mIGxhc3Qgc3RpY2t5IG5vZGVcblx0XHRcdGVsc2UgaWYgKGUua2V5ID09PSAnQXJyb3dEb3duJyB8fCBlLmtleSA9PT0gJ0Fycm93UmlnaHQnKSB7XG5cdFx0XHRcdGlmICh0aGlzLmZvY3VzZWRJbmRleCA+PSB0aGlzLnN0YXRlLmNvdW50IC0gMSkge1xuXHRcdFx0XHRcdGNvbnN0IG5vZGVJbmRleFRvRm9jdXMgPSB0aGlzLnN0YXRlLnN0aWNreU5vZGVzW3RoaXMuc3RhdGUuY291bnQgLSAxXS5zdGFydEluZGV4ICsgMTtcblx0XHRcdFx0XHR0aGlzLnZpZXcuZG9tRm9jdXMoKTtcblx0XHRcdFx0XHR0aGlzLnZpZXcuc2V0Rm9jdXMoW25vZGVJbmRleFRvRm9jdXNdKTtcblx0XHRcdFx0XHR0aGlzLnNjcm9sbE5vZGVVbmRlcldpZGdldChub2RlSW5kZXhUb0ZvY3VzLCB0aGlzLnN0YXRlKTtcblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHR0aGlzLnNldEZvY3VzZWRFbGVtZW50KHRoaXMuZm9jdXNlZEluZGV4ICsgMSk7XG5cdFx0XHRcdH1cblx0XHRcdFx0ZS5wcmV2ZW50RGVmYXVsdCgpO1xuXHRcdFx0XHRlLnN0b3BQcm9wYWdhdGlvbigpO1xuXHRcdFx0fVxuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgb25Nb3VzZURvd24oZTogSUxpc3RNb3VzZUV2ZW50PElUcmVlTm9kZTxULCBURmlsdGVyRGF0YT4+KTogdm9pZCB7XG5cdFx0Y29uc3QgdGFyZ2V0ID0gZS5icm93c2VyRXZlbnQudGFyZ2V0IGFzIEhUTUxFbGVtZW50O1xuXHRcdGlmICghaXNTdGlja3lTY3JvbGxDb250YWluZXIodGFyZ2V0KSAmJiAhaXNTdGlja3lTY3JvbGxFbGVtZW50KHRhcmdldCkpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRlLmJyb3dzZXJFdmVudC5wcmV2ZW50RGVmYXVsdCgpO1xuXHRcdGUuYnJvd3NlckV2ZW50LnN0b3BQcm9wYWdhdGlvbigpO1xuXHR9XG5cblx0dXBkYXRlRWxlbWVudHMoZWxlbWVudHM6IEhUTUxFbGVtZW50W10sIHN0YXRlOiBTdGlja3lTY3JvbGxTdGF0ZTxULCBURmlsdGVyRGF0YSwgVFJlZj4gfCB1bmRlZmluZWQpOiB2b2lkIHtcblx0XHRpZiAoc3RhdGUgJiYgc3RhdGUuY291bnQgPT09IDApIHtcblx0XHRcdHRocm93IG5ldyBFcnJvcignU3RpY2t5IHNjcm9sbCBzdGF0ZSBtdXN0IGJlIHVuZGVmaW5lZCB3aGVuIHRoZXJlIGFyZSBubyBzdGlja3kgbm9kZXMnKTtcblx0XHR9XG5cdFx0aWYgKHN0YXRlICYmIHN0YXRlLmNvdW50ICE9PSBlbGVtZW50cy5sZW5ndGgpIHtcblx0XHRcdHRocm93IG5ldyBFcnJvcignU3RpY2t5IHNjcm9sbCBmb2N1cyByZWNlaXZlZCBpbGxpZ2VsIHN0YXRlJyk7XG5cdFx0fVxuXG5cdFx0Y29uc3QgcHJldmlvdXNJbmRleCA9IHRoaXMuZm9jdXNlZEluZGV4O1xuXHRcdHRoaXMucmVtb3ZlRm9jdXMoKTtcblxuXHRcdHRoaXMuZWxlbWVudHMgPSBlbGVtZW50cztcblx0XHR0aGlzLnN0YXRlID0gc3RhdGU7XG5cblx0XHRpZiAoc3RhdGUpIHtcblx0XHRcdGNvbnN0IG5ld0ZvY3VzZWRJbmRleCA9IGNsYW1wKHByZXZpb3VzSW5kZXgsIDAsIHN0YXRlLmNvdW50IC0gMSk7XG5cdFx0XHR0aGlzLnNldEZvY3VzKG5ld0ZvY3VzZWRJbmRleCk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdGlmICh0aGlzLmRvbUhhc0ZvY3VzKSB7XG5cdFx0XHRcdHRoaXMudmlldy5kb21Gb2N1cygpO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdC8vIG11c3QgY29tZSBsYXN0IGFzIGl0IGNhbGxzIGJsdXIoKVxuXHRcdHRoaXMuY29udGFpbmVyLnRhYkluZGV4ID0gc3RhdGUgPyAwIDogLTE7XG5cdH1cblxuXHRwcml2YXRlIHNldEZvY3VzZWRFbGVtZW50KHN0aWNreUluZGV4OiBudW1iZXIpOiB2b2lkIHtcblx0XHQvLyBkb2Vzbid0IGltcGx5IHRoYXQgdGhlIHdpZGdldCBoYXMgKG9yIHdpbGwgaGF2ZSkgZm9jdXNcblxuXHRcdGNvbnN0IHN0YXRlID0gdGhpcy5zdGF0ZTtcblx0XHRpZiAoIXN0YXRlKSB7XG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IoJ0Nhbm5vdCBzZXQgZm9jdXMgd2hlbiBzdGF0ZSBpcyB1bmRlZmluZWQnKTtcblx0XHR9XG5cblx0XHR0aGlzLnNldEZvY3VzKHN0aWNreUluZGV4KTtcblxuXHRcdGlmIChzdGlja3lJbmRleCA8IHN0YXRlLmNvdW50IC0gMSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdC8vIElmIHRoZSBsYXN0IHN0aWNreSBub2RlIGlzIG5vdCBmdWxseSB2aXNpYmxlLCBzY3JvbGwgaXQgaW50byB2aWV3XG5cdFx0aWYgKHN0YXRlLmxhc3ROb2RlUGFydGlhbGx5VmlzaWJsZSgpKSB7XG5cdFx0XHRjb25zdCBsYXN0U3RpY2t5Tm9kZSA9IHN0YXRlLnN0aWNreU5vZGVzW3N0aWNreUluZGV4XTtcblx0XHRcdHRoaXMuc2Nyb2xsTm9kZVVuZGVyV2lkZ2V0KGxhc3RTdGlja3lOb2RlLmVuZEluZGV4ICsgMSwgc3RhdGUpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgc2Nyb2xsTm9kZVVuZGVyV2lkZ2V0KG5vZGVJbmRleDogbnVtYmVyLCBzdGF0ZTogU3RpY2t5U2Nyb2xsU3RhdGU8VCwgVEZpbHRlckRhdGEsIFRSZWY+KSB7XG5cdFx0Y29uc3QgbGFzdFN0aWNreU5vZGUgPSBzdGF0ZS5zdGlja3lOb2Rlc1tzdGF0ZS5jb3VudCAtIDFdO1xuXHRcdGNvbnN0IHNlY29uZExhc3RTdGlja3lOb2RlID0gc3RhdGUuY291bnQgPiAxID8gc3RhdGUuc3RpY2t5Tm9kZXNbc3RhdGUuY291bnQgLSAyXSA6IHVuZGVmaW5lZDtcblxuXHRcdGNvbnN0IGVsZW1lbnRTY3JvbGxUb3AgPSB0aGlzLnZpZXcuZ2V0RWxlbWVudFRvcChub2RlSW5kZXgpO1xuXHRcdGNvbnN0IGVsZW1lbnRUYXJnZXRWaWV3VG9wID0gc2Vjb25kTGFzdFN0aWNreU5vZGUgPyBzZWNvbmRMYXN0U3RpY2t5Tm9kZS5wb3NpdGlvbiArIHNlY29uZExhc3RTdGlja3lOb2RlLmhlaWdodCArIGxhc3RTdGlja3lOb2RlLmhlaWdodCA6IGxhc3RTdGlja3lOb2RlLmhlaWdodDtcblx0XHR0aGlzLnZpZXcuc2Nyb2xsVG9wID0gZWxlbWVudFNjcm9sbFRvcCAtIGVsZW1lbnRUYXJnZXRWaWV3VG9wO1xuXHR9XG5cblx0Z2V0Rm9jdXMoKTogVCB8IHVuZGVmaW5lZCB7XG5cdFx0aWYgKCF0aGlzLnN0YXRlIHx8IHRoaXMuZm9jdXNlZEluZGV4ID09PSAtMSkge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cdFx0cmV0dXJuIHRoaXMuc3RhdGUuc3RpY2t5Tm9kZXNbdGhpcy5mb2N1c2VkSW5kZXhdLm5vZGUuZWxlbWVudDtcblx0fVxuXG5cdGRvbUZvY3VzKCk6IHZvaWQge1xuXHRcdGlmICghdGhpcy5zdGF0ZSkge1xuXHRcdFx0dGhyb3cgbmV3IEVycm9yKCdDYW5ub3QgZm9jdXMgd2hlbiBzdGF0ZSBpcyB1bmRlZmluZWQnKTtcblx0XHR9XG5cblx0XHR0aGlzLmNvbnRhaW5lci5mb2N1cygpO1xuXHR9XG5cblx0Zm9jdXNlZExhc3QoKTogYm9vbGVhbiB7XG5cdFx0aWYgKCF0aGlzLnN0YXRlKSB7XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXHRcdHJldHVybiB0aGlzLnZpZXcuZ2V0SFRNTEVsZW1lbnQoKS5jbGFzc0xpc3QuY29udGFpbnMoJ3N0aWNreS1zY3JvbGwtZm9jdXNlZCcpO1xuXHR9XG5cblx0cHJpdmF0ZSByZW1vdmVGb2N1cygpOiB2b2lkIHtcblx0XHRpZiAodGhpcy5mb2N1c2VkSW5kZXggPT09IC0xKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdHRoaXMudG9nZ2xlRWxlbWVudEZvY3VzKHRoaXMuZWxlbWVudHNbdGhpcy5mb2N1c2VkSW5kZXhdLCBmYWxzZSk7XG5cdFx0dGhpcy5mb2N1c2VkSW5kZXggPSAtMTtcblx0fVxuXG5cdHByaXZhdGUgc2V0Rm9jdXMobmV3Rm9jdXNJbmRleDogbnVtYmVyKTogdm9pZCB7XG5cdFx0aWYgKDAgPiBuZXdGb2N1c0luZGV4KSB7XG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IoJ2FkZEZvY3VzKCkgY2FuIG5vdCByZW1vdmUgZm9jdXMnKTtcblx0XHR9XG5cdFx0aWYgKCF0aGlzLnN0YXRlICYmIG5ld0ZvY3VzSW5kZXggPj0gMCkge1xuXHRcdFx0dGhyb3cgbmV3IEVycm9yKCdDYW5ub3Qgc2V0IGZvY3VzIGluZGV4IHdoZW4gc3RhdGUgaXMgdW5kZWZpbmVkJyk7XG5cdFx0fVxuXHRcdGlmICh0aGlzLnN0YXRlICYmIG5ld0ZvY3VzSW5kZXggPj0gdGhpcy5zdGF0ZS5jb3VudCkge1xuXHRcdFx0dGhyb3cgbmV3IEVycm9yKCdDYW5ub3Qgc2V0IGZvY3VzIGluZGV4IHRvIGFuIGluZGV4IHRoYXQgZG9lcyBub3QgZXhpc3QnKTtcblx0XHR9XG5cblx0XHRjb25zdCBvbGRJbmRleCA9IHRoaXMuZm9jdXNlZEluZGV4O1xuXHRcdGlmIChvbGRJbmRleCA+PSAwKSB7XG5cdFx0XHR0aGlzLnRvZ2dsZUVsZW1lbnRGb2N1cyh0aGlzLmVsZW1lbnRzW29sZEluZGV4XSwgZmFsc2UpO1xuXHRcdH1cblx0XHRpZiAobmV3Rm9jdXNJbmRleCA+PSAwKSB7XG5cdFx0XHR0aGlzLnRvZ2dsZUVsZW1lbnRGb2N1cyh0aGlzLmVsZW1lbnRzW25ld0ZvY3VzSW5kZXhdLCB0cnVlKTtcblx0XHR9XG5cdFx0dGhpcy5mb2N1c2VkSW5kZXggPSBuZXdGb2N1c0luZGV4O1xuXHR9XG5cblx0cHJpdmF0ZSB0b2dnbGVFbGVtZW50Rm9jdXMoZWxlbWVudDogSFRNTEVsZW1lbnQsIGZvY3VzZWQ6IGJvb2xlYW4pOiB2b2lkIHtcblx0XHR0aGlzLnRvZ2dsZUVsZW1lbnRBY3RpdmVGb2N1cyhlbGVtZW50LCBmb2N1c2VkICYmIHRoaXMuZG9tSGFzRm9jdXMpO1xuXHRcdHRoaXMudG9nZ2xlRWxlbWVudFBhc3NpdmVGb2N1cyhlbGVtZW50LCBmb2N1c2VkKTtcblx0fVxuXG5cdHByaXZhdGUgdG9nZ2xlQ3VycmVudEVsZW1lbnRBY3RpdmVGb2N1cyhmb2N1c2VkOiBib29sZWFuKTogdm9pZCB7XG5cdFx0aWYgKHRoaXMuZm9jdXNlZEluZGV4ID09PSAtMSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHR0aGlzLnRvZ2dsZUVsZW1lbnRBY3RpdmVGb2N1cyh0aGlzLmVsZW1lbnRzW3RoaXMuZm9jdXNlZEluZGV4XSwgZm9jdXNlZCk7XG5cdH1cblxuXHRwcml2YXRlIHRvZ2dsZUVsZW1lbnRBY3RpdmVGb2N1cyhlbGVtZW50OiBIVE1MRWxlbWVudCwgZm9jdXNlZDogYm9vbGVhbikge1xuXHRcdC8vIGFjdGl2ZSBmb2N1cyBpcyBzZXQgd2hlbiBzdGlja3kgc2Nyb2xsIGhhcyBmb2N1c1xuXHRcdGVsZW1lbnQuY2xhc3NMaXN0LnRvZ2dsZSgnZm9jdXNlZCcsIGZvY3VzZWQpO1xuXHR9XG5cblx0cHJpdmF0ZSB0b2dnbGVFbGVtZW50UGFzc2l2ZUZvY3VzKGVsZW1lbnQ6IEhUTUxFbGVtZW50LCBmb2N1c2VkOiBib29sZWFuKSB7XG5cdFx0Ly8gcGFzc2l2ZSBmb2N1cyBhbGxvd3MgdG8gc2hvdyBmb2N1cyB3aGVuIHN0aWNreSBzY3JvbGwgZG9lcyBub3QgaGF2ZSBmb2N1c1xuXHRcdC8vIGZvciBleGFtcGxlIHdoZW4gdGhlIGNvbnRleHQgbWVudSBoYXMgZm9jdXNcblx0XHRlbGVtZW50LmNsYXNzTGlzdC50b2dnbGUoJ3Bhc3NpdmUtZm9jdXNlZCcsIGZvY3VzZWQpO1xuXHR9XG5cblx0cHJpdmF0ZSB0b2dnbGVTdGlja3lTY3JvbGxGb2N1c2VkKGZvY3VzZWQ6IGJvb2xlYW4pIHtcblx0XHQvLyBXZWF0aGVyIHRoZSBsYXN0IGZvY3VzIGluIHRoZSB2aWV3IHdhcyBzdGlja3kgc2Nyb2xsIGFuZCBub3QgdGhlIGxpc3Rcblx0XHQvLyBJcyBvbmx5IHJlbW92ZWQgd2hlbiB0aGUgZm9jdXMgaXMgYmFjayBpbiB0aGUgdHJlZSBhbiBubyBsb25nZXIgaW4gc3RpY2t5IHNjcm9sbFxuXHRcdHRoaXMudmlldy5nZXRIVE1MRWxlbWVudCgpLmNsYXNzTGlzdC50b2dnbGUoJ3N0aWNreS1zY3JvbGwtZm9jdXNlZCcsIGZvY3VzZWQpO1xuXHR9XG5cblx0cHJpdmF0ZSBvbkZvY3VzKCk6IHZvaWQge1xuXHRcdGlmICghdGhpcy5zdGF0ZSB8fCB0aGlzLmVsZW1lbnRzLmxlbmd0aCA9PT0gMCkge1xuXHRcdFx0dGhyb3cgbmV3IEVycm9yKCdDYW5ub3QgZm9jdXMgd2hlbiBzdGF0ZSBpcyB1bmRlZmluZWQgb3IgZWxlbWVudHMgYXJlIGVtcHR5Jyk7XG5cdFx0fVxuXHRcdHRoaXMuZG9tSGFzRm9jdXMgPSB0cnVlO1xuXHRcdHRoaXMudG9nZ2xlU3RpY2t5U2Nyb2xsRm9jdXNlZCh0cnVlKTtcblx0XHR0aGlzLnRvZ2dsZUN1cnJlbnRFbGVtZW50QWN0aXZlRm9jdXModHJ1ZSk7XG5cdFx0aWYgKHRoaXMuZm9jdXNlZEluZGV4ID09PSAtMSkge1xuXHRcdFx0dGhpcy5zZXRGb2N1cygwKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIG9uQmx1cigpOiB2b2lkIHtcblx0XHR0aGlzLmRvbUhhc0ZvY3VzID0gZmFsc2U7XG5cdFx0dGhpcy50b2dnbGVDdXJyZW50RWxlbWVudEFjdGl2ZUZvY3VzKGZhbHNlKTtcblx0fVxuXG5cdG92ZXJyaWRlIGRpc3Bvc2UoKTogdm9pZCB7XG5cdFx0dGhpcy50b2dnbGVTdGlja3lTY3JvbGxGb2N1c2VkKGZhbHNlKTtcblx0XHR0aGlzLl9vbkRpZENoYW5nZUhhc0ZvY3VzLmZpcmUoZmFsc2UpO1xuXHRcdHN1cGVyLmRpc3Bvc2UoKTtcblx0fVxufVxuXG5mdW5jdGlvbiBhc1RyZWVNb3VzZUV2ZW50PFQsIFRGaWx0ZXJEYXRhID0gdm9pZD4oZXZlbnQ6IElMaXN0TW91c2VFdmVudDxJVHJlZU5vZGU8VCwgVEZpbHRlckRhdGE+Pik6IElUcmVlTW91c2VFdmVudDxUPiB7XG5cdGxldCB0YXJnZXQ6IFRyZWVNb3VzZUV2ZW50VGFyZ2V0ID0gVHJlZU1vdXNlRXZlbnRUYXJnZXQuVW5rbm93bjtcblxuXHRpZiAoaGFzUGFyZW50V2l0aENsYXNzKGV2ZW50LmJyb3dzZXJFdmVudC50YXJnZXQgYXMgSFRNTEVsZW1lbnQsICdtb25hY28tdGwtdHdpc3RpZScsICdtb25hY28tdGwtcm93JykpIHtcblx0XHR0YXJnZXQgPSBUcmVlTW91c2VFdmVudFRhcmdldC5Ud2lzdGllO1xuXHR9IGVsc2UgaWYgKGhhc1BhcmVudFdpdGhDbGFzcyhldmVudC5icm93c2VyRXZlbnQudGFyZ2V0IGFzIEhUTUxFbGVtZW50LCAnbW9uYWNvLXRsLWNvbnRlbnRzJywgJ21vbmFjby10bC1yb3cnKSkge1xuXHRcdHRhcmdldCA9IFRyZWVNb3VzZUV2ZW50VGFyZ2V0LkVsZW1lbnQ7XG5cdH0gZWxzZSBpZiAoaGFzUGFyZW50V2l0aENsYXNzKGV2ZW50LmJyb3dzZXJFdmVudC50YXJnZXQgYXMgSFRNTEVsZW1lbnQsICdtb25hY28tdHJlZS10eXBlLWZpbHRlcicsICdtb25hY28tbGlzdCcpKSB7XG5cdFx0dGFyZ2V0ID0gVHJlZU1vdXNlRXZlbnRUYXJnZXQuRmlsdGVyO1xuXHR9XG5cblx0cmV0dXJuIHtcblx0XHRicm93c2VyRXZlbnQ6IGV2ZW50LmJyb3dzZXJFdmVudCxcblx0XHRlbGVtZW50OiBldmVudC5lbGVtZW50ID8gZXZlbnQuZWxlbWVudC5lbGVtZW50IDogbnVsbCxcblx0XHR0YXJnZXRcblx0fTtcbn1cblxuZnVuY3Rpb24gYXNUcmVlQ29udGV4dE1lbnVFdmVudDxULCBURmlsdGVyRGF0YSA9IHZvaWQ+KGV2ZW50OiBJTGlzdENvbnRleHRNZW51RXZlbnQ8SVRyZWVOb2RlPFQsIFRGaWx0ZXJEYXRhPj4pOiBJVHJlZUNvbnRleHRNZW51RXZlbnQ8VD4ge1xuXHRjb25zdCBpc1N0aWNreVNjcm9sbCA9IGlzU3RpY2t5U2Nyb2xsQ29udGFpbmVyKGV2ZW50LmJyb3dzZXJFdmVudC50YXJnZXQgYXMgSFRNTEVsZW1lbnQpO1xuXG5cdHJldHVybiB7XG5cdFx0ZWxlbWVudDogZXZlbnQuZWxlbWVudCA/IGV2ZW50LmVsZW1lbnQuZWxlbWVudCA6IG51bGwsXG5cdFx0YnJvd3NlckV2ZW50OiBldmVudC5icm93c2VyRXZlbnQsXG5cdFx0YW5jaG9yOiBldmVudC5hbmNob3IsXG5cdFx0aXNTdGlja3lTY3JvbGxcblx0fTtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBJQWJzdHJhY3RUcmVlT3B0aW9uc1VwZGF0ZTxUPiBleHRlbmRzIElUcmVlUmVuZGVyZXJPcHRpb25zPFQ+IHtcblx0cmVhZG9ubHkgZGVmYXVsdEluZGVudD86IG51bWJlcjsgLy8gT25seSByZWNvbW1lbmRlZCBmb3IgY29tcGFjdCBsYXlvdXRzLiBMZWF2ZSB1bmNoYW5nZWQgb3RoZXJ3aXNlXG5cdHJlYWRvbmx5IG11bHRpcGxlU2VsZWN0aW9uU3VwcG9ydD86IGJvb2xlYW47XG5cdHJlYWRvbmx5IHR5cGVOYXZpZ2F0aW9uRW5hYmxlZD86IGJvb2xlYW47XG5cdHJlYWRvbmx5IHR5cGVOYXZpZ2F0aW9uTW9kZT86IFR5cGVOYXZpZ2F0aW9uTW9kZTtcblx0cmVhZG9ubHkgZGVmYXVsdEZpbmRNb2RlPzogVHJlZUZpbmRNb2RlO1xuXHRyZWFkb25seSBkZWZhdWx0RmluZE1hdGNoVHlwZT86IFRyZWVGaW5kTWF0Y2hUeXBlO1xuXHRyZWFkb25seSBzaG93Tm90Rm91bmRNZXNzYWdlPzogYm9vbGVhbjtcblx0cmVhZG9ubHkgc21vb3RoU2Nyb2xsaW5nPzogYm9vbGVhbjtcblx0cmVhZG9ubHkgaG9yaXpvbnRhbFNjcm9sbGluZz86IGJvb2xlYW47XG5cdHJlYWRvbmx5IHNjcm9sbEJ5UGFnZT86IGJvb2xlYW47XG5cdHJlYWRvbmx5IG1vdXNlV2hlZWxTY3JvbGxTZW5zaXRpdml0eT86IG51bWJlcjtcblx0cmVhZG9ubHkgZmFzdFNjcm9sbFNlbnNpdGl2aXR5PzogbnVtYmVyO1xuXHRyZWFkb25seSBleHBhbmRPbkRvdWJsZUNsaWNrPzogYm9vbGVhbjtcblx0cmVhZG9ubHkgZXhwYW5kT25seU9uVHdpc3RpZUNsaWNrPzogYm9vbGVhbiB8ICgoZTogVCkgPT4gYm9vbGVhbik7XG5cdHJlYWRvbmx5IGVuYWJsZVN0aWNreVNjcm9sbD86IGJvb2xlYW47XG5cdHJlYWRvbmx5IHN0aWNreVNjcm9sbE1heEl0ZW1Db3VudD86IG51bWJlcjtcblx0cmVhZG9ubHkgcGFkZGluZ1RvcD86IG51bWJlcjtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBJQWJzdHJhY3RUcmVlT3B0aW9uczxULCBURmlsdGVyRGF0YSA9IHZvaWQ+IGV4dGVuZHMgSUFic3RyYWN0VHJlZU9wdGlvbnNVcGRhdGU8VD4sIElMaXN0T3B0aW9uczxUPiB7XG5cdHJlYWRvbmx5IGNvbnRleHRWaWV3UHJvdmlkZXI/OiBJQ29udGV4dFZpZXdQcm92aWRlcjtcblx0cmVhZG9ubHkgY29sbGFwc2VCeURlZmF1bHQ/OiBib29sZWFuOyAvLyBkZWZhdWx0cyB0byBmYWxzZVxuXHRyZWFkb25seSBhbGxvd05vbkNvbGxhcHNpYmxlUGFyZW50cz86IGJvb2xlYW47IC8vIGRlZmF1bHRzIHRvIGZhbHNlXG5cdHJlYWRvbmx5IGZpbHRlcj86IElUcmVlRmlsdGVyPFQsIFRGaWx0ZXJEYXRhPjtcblx0cmVhZG9ubHkgZG5kPzogSVRyZWVEcmFnQW5kRHJvcDxUPjtcblx0cmVhZG9ubHkgcGFkZGluZ0JvdHRvbT86IG51bWJlcjtcblx0cmVhZG9ubHkgZmluZFdpZGdldEVuYWJsZWQ/OiBib29sZWFuO1xuXHRyZWFkb25seSBmaW5kV2lkZ2V0U3R5bGVzPzogSUZpbmRXaWRnZXRTdHlsZXM7XG5cdHJlYWRvbmx5IGZpbmRXaWRnZXRDb250YWluZXI/OiBIVE1MRWxlbWVudDtcblx0cmVhZG9ubHkgZGVmYXVsdEZpbmRWaXNpYmlsaXR5PzogVHJlZVZpc2liaWxpdHkgfCAoKGU6IFQpID0+IFRyZWVWaXNpYmlsaXR5KTtcblx0cmVhZG9ubHkgc3RpY2t5U2Nyb2xsRGVsZWdhdGU/OiBJU3RpY2t5U2Nyb2xsRGVsZWdhdGU8VCwgVEZpbHRlckRhdGE+O1xuXHRyZWFkb25seSBkaXNhYmxlRXhwYW5kT25TcGFjZWJhcj86IGJvb2xlYW47IC8vIGRlZmF1bHRzIHRvIGZhbHNlXG59XG5cbmZ1bmN0aW9uIGRmczxULCBURmlsdGVyRGF0YT4obm9kZTogSVRyZWVOb2RlPFQsIFRGaWx0ZXJEYXRhPiwgZm46IChub2RlOiBJVHJlZU5vZGU8VCwgVEZpbHRlckRhdGE+KSA9PiB2b2lkKTogdm9pZCB7XG5cdGZuKG5vZGUpO1xuXHRub2RlLmNoaWxkcmVuLmZvckVhY2goY2hpbGQgPT4gZGZzKGNoaWxkLCBmbikpO1xufVxuXG4vKipcbiAqIFRoZSB0cmFpdCBjb25jZXB0IG5lZWRzIHRvIGV4aXN0IGF0IHRoZSB0cmVlIGxldmVsLCBiZWNhdXNlIGNvbGxhcHNlZFxuICogdHJlZSBub2RlcyB3aWxsIG5vdCBiZSBrbm93biBieSB0aGUgbGlzdC5cbiAqL1xuY2xhc3MgVHJhaXQ8VD4ge1xuXG5cdHByaXZhdGUgbm9kZXM6IElUcmVlTm9kZTxULCB1bmtub3duPltdID0gW107XG5cdHByaXZhdGUgZWxlbWVudHM6IFRbXSB8IHVuZGVmaW5lZDtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkRpZENoYW5nZSA9IG5ldyBFbWl0dGVyPElUcmVlRXZlbnQ8VD4+KCk7XG5cdHJlYWRvbmx5IG9uRGlkQ2hhbmdlID0gdGhpcy5fb25EaWRDaGFuZ2UuZXZlbnQ7XG5cblx0cHJpdmF0ZSBfbm9kZVNldDogU2V0PElUcmVlTm9kZTxULCB1bmtub3duPj4gfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgZ2V0IG5vZGVTZXQoKTogU2V0PElUcmVlTm9kZTxULCB1bmtub3duPj4ge1xuXHRcdGlmICghdGhpcy5fbm9kZVNldCkge1xuXHRcdFx0dGhpcy5fbm9kZVNldCA9IHRoaXMuY3JlYXRlTm9kZVNldCgpO1xuXHRcdH1cblxuXHRcdHJldHVybiB0aGlzLl9ub2RlU2V0O1xuXHR9XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0cHJpdmF0ZSBnZXRGaXJzdFZpZXdFbGVtZW50V2l0aFRyYWl0OiAoKSA9PiBJVHJlZU5vZGU8VCwgdW5rbm93bj4gfCB1bmRlZmluZWQsXG5cdFx0cHJpdmF0ZSBpZGVudGl0eVByb3ZpZGVyPzogSUlkZW50aXR5UHJvdmlkZXI8VD5cblx0KSB7IH1cblxuXHRzZXQobm9kZXM6IElUcmVlTm9kZTxULCB1bmtub3duPltdLCBicm93c2VyRXZlbnQ/OiBVSUV2ZW50KTogdm9pZCB7XG5cdFx0Y29uc3QgZXZlbnQgPSBicm93c2VyRXZlbnQgYXMgVUlFdmVudCAmIHsgX19mb3JjZUV2ZW50PzogYm9vbGVhbiB9O1xuXHRcdGlmICghKGV2ZW50Py5fX2ZvcmNlRXZlbnQpICYmIGVxdWFscyh0aGlzLm5vZGVzLCBub2RlcykpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHR0aGlzLl9zZXQobm9kZXMsIGZhbHNlLCBicm93c2VyRXZlbnQpO1xuXHR9XG5cblx0cHJpdmF0ZSBfc2V0KG5vZGVzOiBJVHJlZU5vZGU8VCwgdW5rbm93bj5bXSwgc2lsZW50OiBib29sZWFuLCBicm93c2VyRXZlbnQ/OiBVSUV2ZW50KTogdm9pZCB7XG5cdFx0dGhpcy5ub2RlcyA9IFsuLi5ub2Rlc107XG5cdFx0dGhpcy5lbGVtZW50cyA9IHVuZGVmaW5lZDtcblx0XHR0aGlzLl9ub2RlU2V0ID0gdW5kZWZpbmVkO1xuXG5cdFx0aWYgKCFzaWxlbnQpIHtcblx0XHRcdGNvbnN0IHRoYXQgPSB0aGlzO1xuXHRcdFx0dGhpcy5fb25EaWRDaGFuZ2UuZmlyZSh7IGdldCBlbGVtZW50cygpIHsgcmV0dXJuIHRoYXQuZ2V0KCk7IH0sIGJyb3dzZXJFdmVudCB9KTtcblx0XHR9XG5cdH1cblxuXHRnZXQoKTogVFtdIHtcblx0XHRpZiAoIXRoaXMuZWxlbWVudHMpIHtcblx0XHRcdHRoaXMuZWxlbWVudHMgPSB0aGlzLm5vZGVzLm1hcChub2RlID0+IG5vZGUuZWxlbWVudCk7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIFsuLi50aGlzLmVsZW1lbnRzXTtcblx0fVxuXG5cdGdldE5vZGVzKCk6IHJlYWRvbmx5IElUcmVlTm9kZTxULCB1bmtub3duPltdIHtcblx0XHRyZXR1cm4gdGhpcy5ub2Rlcztcblx0fVxuXG5cdGhhcyhub2RlOiBJVHJlZU5vZGU8VCwgdW5rbm93bj4pOiBib29sZWFuIHtcblx0XHRyZXR1cm4gdGhpcy5ub2RlU2V0Lmhhcyhub2RlKTtcblx0fVxuXG5cdG9uRGlkTW9kZWxTcGxpY2UoeyBpbnNlcnRlZE5vZGVzLCBkZWxldGVkTm9kZXMgfTogSVRyZWVNb2RlbFNwbGljZUV2ZW50PFQsIHVua25vd24+KTogdm9pZCB7XG5cdFx0aWYgKCF0aGlzLmlkZW50aXR5UHJvdmlkZXIpIHtcblx0XHRcdGNvbnN0IHNldCA9IHRoaXMuY3JlYXRlTm9kZVNldCgpO1xuXHRcdFx0Y29uc3QgdmlzaXQgPSAobm9kZTogSVRyZWVOb2RlPFQsIHVua25vd24+KSA9PiBzZXQuZGVsZXRlKG5vZGUpO1xuXHRcdFx0ZGVsZXRlZE5vZGVzLmZvckVhY2gobm9kZSA9PiBkZnMobm9kZSwgdmlzaXQpKTtcblx0XHRcdHRoaXMuc2V0KFsuLi5zZXQudmFsdWVzKCldKTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCBkZWxldGVkTm9kZXNJZFNldCA9IG5ldyBTZXQ8c3RyaW5nPigpO1xuXHRcdGNvbnN0IGRlbGV0ZWROb2Rlc1Zpc2l0b3IgPSAobm9kZTogSVRyZWVOb2RlPFQsIHVua25vd24+KSA9PiBkZWxldGVkTm9kZXNJZFNldC5hZGQodGhpcy5pZGVudGl0eVByb3ZpZGVyIS5nZXRJZChub2RlLmVsZW1lbnQpLnRvU3RyaW5nKCkpO1xuXHRcdGRlbGV0ZWROb2Rlcy5mb3JFYWNoKG5vZGUgPT4gZGZzKG5vZGUsIGRlbGV0ZWROb2Rlc1Zpc2l0b3IpKTtcblxuXHRcdGNvbnN0IGluc2VydGVkTm9kZXNNYXAgPSBuZXcgTWFwPHN0cmluZywgSVRyZWVOb2RlPFQsIHVua25vd24+PigpO1xuXHRcdGNvbnN0IGluc2VydGVkTm9kZXNWaXNpdG9yID0gKG5vZGU6IElUcmVlTm9kZTxULCB1bmtub3duPikgPT4gaW5zZXJ0ZWROb2Rlc01hcC5zZXQodGhpcy5pZGVudGl0eVByb3ZpZGVyIS5nZXRJZChub2RlLmVsZW1lbnQpLnRvU3RyaW5nKCksIG5vZGUpO1xuXHRcdGluc2VydGVkTm9kZXMuZm9yRWFjaChub2RlID0+IGRmcyhub2RlLCBpbnNlcnRlZE5vZGVzVmlzaXRvcikpO1xuXG5cdFx0Y29uc3Qgbm9kZXM6IElUcmVlTm9kZTxULCB1bmtub3duPltdID0gW107XG5cblx0XHRmb3IgKGNvbnN0IG5vZGUgb2YgdGhpcy5ub2Rlcykge1xuXHRcdFx0Y29uc3QgaWQgPSB0aGlzLmlkZW50aXR5UHJvdmlkZXIuZ2V0SWQobm9kZS5lbGVtZW50KS50b1N0cmluZygpO1xuXHRcdFx0Y29uc3Qgd2FzRGVsZXRlZCA9IGRlbGV0ZWROb2Rlc0lkU2V0LmhhcyhpZCk7XG5cblx0XHRcdGlmICghd2FzRGVsZXRlZCkge1xuXHRcdFx0XHRub2Rlcy5wdXNoKG5vZGUpO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0Y29uc3QgaW5zZXJ0ZWROb2RlID0gaW5zZXJ0ZWROb2Rlc01hcC5nZXQoaWQpO1xuXG5cdFx0XHRcdGlmIChpbnNlcnRlZE5vZGUgJiYgaW5zZXJ0ZWROb2RlLnZpc2libGUpIHtcblx0XHRcdFx0XHRub2Rlcy5wdXNoKGluc2VydGVkTm9kZSk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cblx0XHRpZiAodGhpcy5ub2Rlcy5sZW5ndGggPiAwICYmIG5vZGVzLmxlbmd0aCA9PT0gMCkge1xuXHRcdFx0Y29uc3Qgbm9kZSA9IHRoaXMuZ2V0Rmlyc3RWaWV3RWxlbWVudFdpdGhUcmFpdCgpO1xuXG5cdFx0XHRpZiAobm9kZSkge1xuXHRcdFx0XHRub2Rlcy5wdXNoKG5vZGUpO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdHRoaXMuX3NldChub2RlcywgdHJ1ZSk7XG5cdH1cblxuXHRwcml2YXRlIGNyZWF0ZU5vZGVTZXQoKTogU2V0PElUcmVlTm9kZTxULCB1bmtub3duPj4ge1xuXHRcdGNvbnN0IHNldCA9IG5ldyBTZXQ8SVRyZWVOb2RlPFQsIHVua25vd24+PigpO1xuXG5cdFx0Zm9yIChjb25zdCBub2RlIG9mIHRoaXMubm9kZXMpIHtcblx0XHRcdHNldC5hZGQobm9kZSk7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHNldDtcblx0fVxufVxuXG5jbGFzcyBUcmVlTm9kZUxpc3RNb3VzZUNvbnRyb2xsZXI8VCwgVEZpbHRlckRhdGEsIFRSZWY+IGV4dGVuZHMgTW91c2VDb250cm9sbGVyPElUcmVlTm9kZTxULCBURmlsdGVyRGF0YT4+IHtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRsaXN0OiBUcmVlTm9kZUxpc3Q8VCwgVEZpbHRlckRhdGEsIFRSZWY+LFxuXHRcdHByaXZhdGUgdHJlZTogQWJzdHJhY3RUcmVlPFQsIFRGaWx0ZXJEYXRhLCBUUmVmPixcblx0XHRwcml2YXRlIHN0aWNreVNjcm9sbFByb3ZpZGVyOiAoKSA9PiBTdGlja3lTY3JvbGxDb250cm9sbGVyPFQsIFRGaWx0ZXJEYXRhLCBUUmVmPiB8IHVuZGVmaW5lZFxuXHQpIHtcblx0XHRzdXBlcihsaXN0KTtcblx0fVxuXG5cdHByb3RlY3RlZCBvdmVycmlkZSBvblZpZXdQb2ludGVyKGU6IElMaXN0TW91c2VFdmVudDxJVHJlZU5vZGU8VCwgVEZpbHRlckRhdGE+Pik6IHZvaWQge1xuXHRcdGlmIChpc0J1dHRvbihlLmJyb3dzZXJFdmVudC50YXJnZXQgYXMgSFRNTEVsZW1lbnQpIHx8XG5cdFx0XHRpc0VkaXRhYmxlRWxlbWVudChlLmJyb3dzZXJFdmVudC50YXJnZXQgYXMgSFRNTEVsZW1lbnQpIHx8XG5cdFx0XHRpc01vbmFjb0VkaXRvcihlLmJyb3dzZXJFdmVudC50YXJnZXQgYXMgSFRNTEVsZW1lbnQpKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0aWYgKGUuYnJvd3NlckV2ZW50LmlzSGFuZGxlZEJ5TGlzdCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IG5vZGUgPSBlLmVsZW1lbnQ7XG5cblx0XHRpZiAoIW5vZGUpIHtcblx0XHRcdHJldHVybiBzdXBlci5vblZpZXdQb2ludGVyKGUpO1xuXHRcdH1cblxuXHRcdGlmICh0aGlzLmlzU2VsZWN0aW9uUmFuZ2VDaGFuZ2VFdmVudChlKSB8fCB0aGlzLmlzU2VsZWN0aW9uU2luZ2xlQ2hhbmdlRXZlbnQoZSkpIHtcblx0XHRcdHJldHVybiBzdXBlci5vblZpZXdQb2ludGVyKGUpO1xuXHRcdH1cblxuXHRcdGNvbnN0IHRhcmdldCA9IGUuYnJvd3NlckV2ZW50LnRhcmdldCBhcyBIVE1MRWxlbWVudDtcblx0XHRjb25zdCBvblR3aXN0aWUgPSB0YXJnZXQuY2xhc3NMaXN0LmNvbnRhaW5zKCdtb25hY28tdGwtdHdpc3RpZScpXG5cdFx0XHR8fCAodGFyZ2V0LmNsYXNzTGlzdC5jb250YWlucygnbW9uYWNvLWljb24tbGFiZWwnKSAmJiB0YXJnZXQuY2xhc3NMaXN0LmNvbnRhaW5zKCdmb2xkZXItaWNvbicpICYmIGUuYnJvd3NlckV2ZW50Lm9mZnNldFggPCAxNik7XG5cdFx0Y29uc3QgaXNTdGlja3lFbGVtZW50ID0gaXNTdGlja3lTY3JvbGxFbGVtZW50KGUuYnJvd3NlckV2ZW50LnRhcmdldCBhcyBIVE1MRWxlbWVudCk7XG5cblx0XHRsZXQgZXhwYW5kT25seU9uVHdpc3RpZUNsaWNrID0gZmFsc2U7XG5cblx0XHRpZiAoaXNTdGlja3lFbGVtZW50KSB7XG5cdFx0XHRleHBhbmRPbmx5T25Ud2lzdGllQ2xpY2sgPSB0cnVlO1xuXHRcdH1cblx0XHRlbHNlIGlmICh0eXBlb2YgdGhpcy50cmVlLmV4cGFuZE9ubHlPblR3aXN0aWVDbGljayA9PT0gJ2Z1bmN0aW9uJykge1xuXHRcdFx0ZXhwYW5kT25seU9uVHdpc3RpZUNsaWNrID0gdGhpcy50cmVlLmV4cGFuZE9ubHlPblR3aXN0aWVDbGljayhub2RlLmVsZW1lbnQpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRleHBhbmRPbmx5T25Ud2lzdGllQ2xpY2sgPSAhIXRoaXMudHJlZS5leHBhbmRPbmx5T25Ud2lzdGllQ2xpY2s7XG5cdFx0fVxuXG5cdFx0aWYgKCFpc1N0aWNreUVsZW1lbnQpIHtcblx0XHRcdGlmIChleHBhbmRPbmx5T25Ud2lzdGllQ2xpY2sgJiYgIW9uVHdpc3RpZSAmJiBlLmJyb3dzZXJFdmVudC5kZXRhaWwgIT09IDIpIHtcblx0XHRcdFx0cmV0dXJuIHN1cGVyLm9uVmlld1BvaW50ZXIoZSk7XG5cdFx0XHR9XG5cblx0XHRcdGlmICghdGhpcy50cmVlLmV4cGFuZE9uRG91YmxlQ2xpY2sgJiYgZS5icm93c2VyRXZlbnQuZGV0YWlsID09PSAyKSB7XG5cdFx0XHRcdHJldHVybiBzdXBlci5vblZpZXdQb2ludGVyKGUpO1xuXHRcdFx0fVxuXHRcdH0gZWxzZSB7XG5cdFx0XHR0aGlzLmhhbmRsZVN0aWNreVNjcm9sbE1vdXNlRXZlbnQoZSwgbm9kZSk7XG5cdFx0fVxuXG5cdFx0aWYgKG5vZGUuY29sbGFwc2libGUgJiYgKCFpc1N0aWNreUVsZW1lbnQgfHwgb25Ud2lzdGllKSkge1xuXHRcdFx0Y29uc3QgbG9jYXRpb24gPSB0aGlzLnRyZWUuZ2V0Tm9kZUxvY2F0aW9uKG5vZGUpO1xuXHRcdFx0Y29uc3QgcmVjdXJzaXZlID0gZS5icm93c2VyRXZlbnQuYWx0S2V5O1xuXHRcdFx0dGhpcy50cmVlLnNldEZvY3VzKFtsb2NhdGlvbl0pO1xuXHRcdFx0dGhpcy50cmVlLnRvZ2dsZUNvbGxhcHNlZChsb2NhdGlvbiwgcmVjdXJzaXZlKTtcblxuXHRcdFx0aWYgKG9uVHdpc3RpZSkge1xuXHRcdFx0XHQvLyBEbyBub3Qgc2V0IHRoaXMgYmVmb3JlIGNhbGxpbmcgYSBoYW5kbGVyIG9uIHRoZSBzdXBlciBjbGFzcywgYmVjYXVzZSBpdCB3aWxsIHJlamVjdCBpdCBhcyBoYW5kbGVkXG5cdFx0XHRcdGUuYnJvd3NlckV2ZW50LmlzSGFuZGxlZEJ5TGlzdCA9IHRydWU7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRpZiAoIWlzU3RpY2t5RWxlbWVudCkge1xuXHRcdFx0c3VwZXIub25WaWV3UG9pbnRlcihlKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIGhhbmRsZVN0aWNreVNjcm9sbE1vdXNlRXZlbnQoZTogSUxpc3RNb3VzZUV2ZW50PElUcmVlTm9kZTxULCBURmlsdGVyRGF0YT4+LCBub2RlOiBJVHJlZU5vZGU8VCwgVEZpbHRlckRhdGE+KTogdm9pZCB7XG5cdFx0aWYgKGlzTW9uYWNvQ3VzdG9tVG9nZ2xlKGUuYnJvd3NlckV2ZW50LnRhcmdldCBhcyBIVE1MRWxlbWVudCkgfHwgaXNBY3Rpb25JdGVtKGUuYnJvd3NlckV2ZW50LnRhcmdldCBhcyBIVE1MRWxlbWVudCkpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCBzdGlja3lTY3JvbGxDb250cm9sbGVyID0gdGhpcy5zdGlja3lTY3JvbGxQcm92aWRlcigpO1xuXHRcdGlmICghc3RpY2t5U2Nyb2xsQ29udHJvbGxlcikge1xuXHRcdFx0dGhyb3cgbmV3IEVycm9yKCdTdGlja3kgc2Nyb2xsIGNvbnRyb2xsZXIgbm90IGZvdW5kJyk7XG5cdFx0fVxuXG5cdFx0Y29uc3Qgbm9kZUluZGV4ID0gdGhpcy5saXN0LmluZGV4T2Yobm9kZSk7XG5cdFx0Y29uc3QgZWxlbWVudFNjcm9sbFRvcCA9IHRoaXMubGlzdC5nZXRFbGVtZW50VG9wKG5vZGVJbmRleCk7XG5cdFx0Y29uc3QgZWxlbWVudFRhcmdldFZpZXdUb3AgPSBzdGlja3lTY3JvbGxDb250cm9sbGVyLm5vZGVQb3NpdGlvblRvcEJlbG93V2lkZ2V0KG5vZGUpO1xuXHRcdHRoaXMudHJlZS5zY3JvbGxUb3AgPSBlbGVtZW50U2Nyb2xsVG9wIC0gZWxlbWVudFRhcmdldFZpZXdUb3A7XG5cdFx0dGhpcy5saXN0LmRvbUZvY3VzKCk7XG5cdFx0dGhpcy5saXN0LnNldEZvY3VzKFtub2RlSW5kZXhdKTtcblx0XHR0aGlzLmxpc3Quc2V0U2VsZWN0aW9uKFtub2RlSW5kZXhdKTtcblx0fVxuXG5cdHByb3RlY3RlZCBvdmVycmlkZSBvbkRvdWJsZUNsaWNrKGU6IElMaXN0TW91c2VFdmVudDxJVHJlZU5vZGU8VCwgVEZpbHRlckRhdGE+Pik6IHZvaWQge1xuXHRcdGNvbnN0IG9uVHdpc3RpZSA9IChlLmJyb3dzZXJFdmVudC50YXJnZXQgYXMgSFRNTEVsZW1lbnQpLmNsYXNzTGlzdC5jb250YWlucygnbW9uYWNvLXRsLXR3aXN0aWUnKTtcblxuXHRcdGlmIChvblR3aXN0aWUgfHwgIXRoaXMudHJlZS5leHBhbmRPbkRvdWJsZUNsaWNrKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0aWYgKGUuYnJvd3NlckV2ZW50LmlzSGFuZGxlZEJ5TGlzdCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdHN1cGVyLm9uRG91YmxlQ2xpY2soZSk7XG5cdH1cblxuXHQvLyB0byBtYWtlIHN1cmUgZG9tIGZvY3VzIGlzIG5vdCBzdG9sZW4gKGZvciBleGFtcGxlIHdpdGggY29udGV4dCBtZW51KVxuXHRwcm90ZWN0ZWQgb3ZlcnJpZGUgb25Nb3VzZURvd24oZTogSUxpc3RNb3VzZUV2ZW50PElUcmVlTm9kZTxULCBURmlsdGVyRGF0YT4+IHwgSUxpc3RUb3VjaEV2ZW50PElUcmVlTm9kZTxULCBURmlsdGVyRGF0YT4+KTogdm9pZCB7XG5cdFx0Y29uc3QgdGFyZ2V0ID0gZS5icm93c2VyRXZlbnQudGFyZ2V0IGFzIEhUTUxFbGVtZW50O1xuXHRcdGlmICghaXNTdGlja3lTY3JvbGxDb250YWluZXIodGFyZ2V0KSAmJiAhaXNTdGlja3lTY3JvbGxFbGVtZW50KHRhcmdldCkpIHtcblx0XHRcdHN1cGVyLm9uTW91c2VEb3duKGUpO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0fVxuXG5cdHByb3RlY3RlZCBvdmVycmlkZSBvbkNvbnRleHRNZW51KGU6IElMaXN0Q29udGV4dE1lbnVFdmVudDxJVHJlZU5vZGU8VCwgVEZpbHRlckRhdGE+Pik6IHZvaWQge1xuXHRcdGNvbnN0IHRhcmdldCA9IGUuYnJvd3NlckV2ZW50LnRhcmdldCBhcyBIVE1MRWxlbWVudDtcblx0XHRpZiAoIWlzU3RpY2t5U2Nyb2xsQ29udGFpbmVyKHRhcmdldCkgJiYgIWlzU3RpY2t5U2Nyb2xsRWxlbWVudCh0YXJnZXQpKSB7XG5cdFx0XHRzdXBlci5vbkNvbnRleHRNZW51KGUpO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0fVxufVxuXG5pbnRlcmZhY2UgSVRyZWVOb2RlTGlzdE9wdGlvbnM8VCwgVEZpbHRlckRhdGEsIFRSZWY+IGV4dGVuZHMgSUxpc3RPcHRpb25zPElUcmVlTm9kZTxULCBURmlsdGVyRGF0YT4+IHtcblx0cmVhZG9ubHkgdHJlZTogQWJzdHJhY3RUcmVlPFQsIFRGaWx0ZXJEYXRhLCBUUmVmPjtcblx0cmVhZG9ubHkgc3RpY2t5U2Nyb2xsUHJvdmlkZXI6ICgpID0+IFN0aWNreVNjcm9sbENvbnRyb2xsZXI8VCwgVEZpbHRlckRhdGEsIFRSZWY+IHwgdW5kZWZpbmVkO1xufVxuXG4vKipcbiAqIFdlIHVzZSB0aGlzIExpc3Qgc3ViY2xhc3MgdG8gcmVzdG9yZSBzZWxlY3Rpb24gYW5kIGZvY3VzIGFzIG5vZGVzXG4gKiBnZXQgcmVuZGVyZWQgaW4gdGhlIGxpc3QsIHBvc3NpYmx5IGR1ZSB0byBhIG5vZGUgZXhwYW5kKCkgY2FsbC5cbiAqL1xuY2xhc3MgVHJlZU5vZGVMaXN0PFQsIFRGaWx0ZXJEYXRhLCBUUmVmPiBleHRlbmRzIExpc3Q8SVRyZWVOb2RlPFQsIFRGaWx0ZXJEYXRhPj4ge1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdHVzZXI6IHN0cmluZyxcblx0XHRjb250YWluZXI6IEhUTUxFbGVtZW50LFxuXHRcdHZpcnR1YWxEZWxlZ2F0ZTogSUxpc3RWaXJ0dWFsRGVsZWdhdGU8SVRyZWVOb2RlPFQsIFRGaWx0ZXJEYXRhPj4sXG5cdFx0cmVuZGVyZXJzOiBJTGlzdFJlbmRlcmVyPElUcmVlTm9kZTxULCBURmlsdGVyRGF0YT4sIHVua25vd24+W10sXG5cdFx0cHJpdmF0ZSBmb2N1c1RyYWl0OiBUcmFpdDxUPixcblx0XHRwcml2YXRlIHNlbGVjdGlvblRyYWl0OiBUcmFpdDxUPixcblx0XHRwcml2YXRlIGFuY2hvclRyYWl0OiBUcmFpdDxUPixcblx0XHRvcHRpb25zOiBJVHJlZU5vZGVMaXN0T3B0aW9uczxULCBURmlsdGVyRGF0YSwgVFJlZj5cblx0KSB7XG5cdFx0c3VwZXIodXNlciwgY29udGFpbmVyLCB2aXJ0dWFsRGVsZWdhdGUsIHJlbmRlcmVycywgb3B0aW9ucyk7XG5cdH1cblxuXHRwcm90ZWN0ZWQgb3ZlcnJpZGUgY3JlYXRlTW91c2VDb250cm9sbGVyKG9wdGlvbnM6IElUcmVlTm9kZUxpc3RPcHRpb25zPFQsIFRGaWx0ZXJEYXRhLCBUUmVmPik6IE1vdXNlQ29udHJvbGxlcjxJVHJlZU5vZGU8VCwgVEZpbHRlckRhdGE+PiB7XG5cdFx0cmV0dXJuIG5ldyBUcmVlTm9kZUxpc3RNb3VzZUNvbnRyb2xsZXIodGhpcywgb3B0aW9ucy50cmVlLCBvcHRpb25zLnN0aWNreVNjcm9sbFByb3ZpZGVyKTtcblx0fVxuXG5cdG92ZXJyaWRlIHNwbGljZShzdGFydDogbnVtYmVyLCBkZWxldGVDb3VudDogbnVtYmVyLCBlbGVtZW50czogcmVhZG9ubHkgSVRyZWVOb2RlPFQsIFRGaWx0ZXJEYXRhPltdID0gW10pOiB2b2lkIHtcblx0XHRzdXBlci5zcGxpY2Uoc3RhcnQsIGRlbGV0ZUNvdW50LCBlbGVtZW50cyk7XG5cblx0XHRpZiAoZWxlbWVudHMubGVuZ3RoID09PSAwKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29uc3QgYWRkaXRpb25hbEZvY3VzOiBudW1iZXJbXSA9IFtdO1xuXHRcdGNvbnN0IGFkZGl0aW9uYWxTZWxlY3Rpb246IG51bWJlcltdID0gW107XG5cdFx0bGV0IGFuY2hvcjogbnVtYmVyIHwgdW5kZWZpbmVkO1xuXG5cdFx0ZWxlbWVudHMuZm9yRWFjaCgobm9kZSwgaW5kZXgpID0+IHtcblx0XHRcdGlmICh0aGlzLmZvY3VzVHJhaXQuaGFzKG5vZGUpKSB7XG5cdFx0XHRcdGFkZGl0aW9uYWxGb2N1cy5wdXNoKHN0YXJ0ICsgaW5kZXgpO1xuXHRcdFx0fVxuXG5cdFx0XHRpZiAodGhpcy5zZWxlY3Rpb25UcmFpdC5oYXMobm9kZSkpIHtcblx0XHRcdFx0YWRkaXRpb25hbFNlbGVjdGlvbi5wdXNoKHN0YXJ0ICsgaW5kZXgpO1xuXHRcdFx0fVxuXG5cdFx0XHRpZiAodGhpcy5hbmNob3JUcmFpdC5oYXMobm9kZSkpIHtcblx0XHRcdFx0YW5jaG9yID0gc3RhcnQgKyBpbmRleDtcblx0XHRcdH1cblx0XHR9KTtcblxuXHRcdGlmIChhZGRpdGlvbmFsRm9jdXMubGVuZ3RoID4gMCkge1xuXHRcdFx0c3VwZXIuc2V0Rm9jdXMoZGlzdGluY3QoWy4uLnN1cGVyLmdldEZvY3VzKCksIC4uLmFkZGl0aW9uYWxGb2N1c10pKTtcblx0XHR9XG5cblx0XHRpZiAoYWRkaXRpb25hbFNlbGVjdGlvbi5sZW5ndGggPiAwKSB7XG5cdFx0XHRzdXBlci5zZXRTZWxlY3Rpb24oZGlzdGluY3QoWy4uLnN1cGVyLmdldFNlbGVjdGlvbigpLCAuLi5hZGRpdGlvbmFsU2VsZWN0aW9uXSkpO1xuXHRcdH1cblxuXHRcdGlmICh0eXBlb2YgYW5jaG9yID09PSAnbnVtYmVyJykge1xuXHRcdFx0c3VwZXIuc2V0QW5jaG9yKGFuY2hvcik7XG5cdFx0fVxuXHR9XG5cblx0b3ZlcnJpZGUgc2V0Rm9jdXMoaW5kZXhlczogbnVtYmVyW10sIGJyb3dzZXJFdmVudD86IFVJRXZlbnQsIGZyb21BUEkgPSBmYWxzZSk6IHZvaWQge1xuXHRcdHN1cGVyLnNldEZvY3VzKGluZGV4ZXMsIGJyb3dzZXJFdmVudCk7XG5cblx0XHRpZiAoIWZyb21BUEkpIHtcblx0XHRcdHRoaXMuZm9jdXNUcmFpdC5zZXQoaW5kZXhlcy5tYXAoaSA9PiB0aGlzLmVsZW1lbnQoaSkpLCBicm93c2VyRXZlbnQpO1xuXHRcdH1cblx0fVxuXG5cdG92ZXJyaWRlIHNldFNlbGVjdGlvbihpbmRleGVzOiBudW1iZXJbXSwgYnJvd3NlckV2ZW50PzogVUlFdmVudCwgZnJvbUFQSSA9IGZhbHNlKTogdm9pZCB7XG5cdFx0c3VwZXIuc2V0U2VsZWN0aW9uKGluZGV4ZXMsIGJyb3dzZXJFdmVudCk7XG5cblx0XHRpZiAoIWZyb21BUEkpIHtcblx0XHRcdHRoaXMuc2VsZWN0aW9uVHJhaXQuc2V0KGluZGV4ZXMubWFwKGkgPT4gdGhpcy5lbGVtZW50KGkpKSwgYnJvd3NlckV2ZW50KTtcblx0XHR9XG5cdH1cblxuXHRvdmVycmlkZSBzZXRBbmNob3IoaW5kZXg6IG51bWJlciB8IHVuZGVmaW5lZCwgZnJvbUFQSSA9IGZhbHNlKTogdm9pZCB7XG5cdFx0c3VwZXIuc2V0QW5jaG9yKGluZGV4KTtcblxuXHRcdGlmICghZnJvbUFQSSkge1xuXHRcdFx0aWYgKHR5cGVvZiBpbmRleCA9PT0gJ3VuZGVmaW5lZCcpIHtcblx0XHRcdFx0dGhpcy5hbmNob3JUcmFpdC5zZXQoW10pO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0dGhpcy5hbmNob3JUcmFpdC5zZXQoW3RoaXMuZWxlbWVudChpbmRleCldKTtcblx0XHRcdH1cblx0XHR9XG5cdH1cbn1cblxuZXhwb3J0IGNvbnN0IGVudW0gQWJzdHJhY3RUcmVlUGFydCB7XG5cdFRyZWUsXG5cdFN0aWNreVNjcm9sbCxcbn1cblxuZXhwb3J0IGFic3RyYWN0IGNsYXNzIEFic3RyYWN0VHJlZTxULCBURmlsdGVyRGF0YSwgVFJlZj4gaW1wbGVtZW50cyBJRGlzcG9zYWJsZSB7XG5cblx0cHJvdGVjdGVkIHZpZXc6IFRyZWVOb2RlTGlzdDxULCBURmlsdGVyRGF0YSwgVFJlZj47XG5cdHByaXZhdGUgcmVuZGVyZXJzOiBUcmVlUmVuZGVyZXI8VCwgVEZpbHRlckRhdGEsIFRSZWYsIHVua25vd24+W107XG5cdHByb3RlY3RlZCBtb2RlbDogSVRyZWVNb2RlbDxULCBURmlsdGVyRGF0YSwgVFJlZj47XG5cdHByaXZhdGUgdHJlZURlbGVnYXRlOiBDb21wb3NlZFRyZWVEZWxlZ2F0ZTxULCBJVHJlZU5vZGU8VCwgVEZpbHRlckRhdGE+Pjtcblx0cHJpdmF0ZSBmb2N1czogVHJhaXQ8VD47XG5cdHByaXZhdGUgc2VsZWN0aW9uOiBUcmFpdDxUPjtcblx0cHJpdmF0ZSBhbmNob3I6IFRyYWl0PFQ+O1xuXHRwcml2YXRlIGV2ZW50QnVmZmVyZXIgPSBuZXcgRXZlbnRCdWZmZXJlcigpO1xuXHRwcml2YXRlIGZpbmRDb250cm9sbGVyPzogRmluZENvbnRyb2xsZXI8VCwgVEZpbHRlckRhdGE+O1xuXHRwcml2YXRlIGZpbmRGaWx0ZXI/OiBGaW5kRmlsdGVyPFQ+O1xuXHRyZWFkb25seSBvbkRpZENoYW5nZUZpbmRPcGVuU3RhdGU6IEV2ZW50PGJvb2xlYW4+ID0gRXZlbnQuTm9uZTtcblx0b25EaWRDaGFuZ2VTdGlja3lTY3JvbGxGb2N1c2VkOiBFdmVudDxib29sZWFuPiA9IEV2ZW50Lk5vbmU7XG5cdHByaXZhdGUgZm9jdXNOYXZpZ2F0aW9uRmlsdGVyOiAoKG5vZGU6IElUcmVlTm9kZTxULCBURmlsdGVyRGF0YT4pID0+IGJvb2xlYW4pIHwgdW5kZWZpbmVkO1xuXHRwcml2YXRlIHN0aWNreVNjcm9sbENvbnRyb2xsZXI/OiBTdGlja3lTY3JvbGxDb250cm9sbGVyPFQsIFRGaWx0ZXJEYXRhLCBUUmVmPjtcblx0cHJpdmF0ZSBzdHlsZUVsZW1lbnQ6IEhUTUxTdHlsZUVsZW1lbnQ7XG5cdHByb3RlY3RlZCByZWFkb25seSBkaXNwb3NhYmxlcyA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblxuXHRnZXQgb25EaWRTY3JvbGwoKTogRXZlbnQ8U2Nyb2xsRXZlbnQ+IHsgcmV0dXJuIHRoaXMudmlldy5vbkRpZFNjcm9sbDsgfVxuXG5cdGdldCBvbkRpZENoYW5nZUZvY3VzKCk6IEV2ZW50PElUcmVlRXZlbnQ8VD4+IHsgcmV0dXJuIHRoaXMuZXZlbnRCdWZmZXJlci53cmFwRXZlbnQodGhpcy5mb2N1cy5vbkRpZENoYW5nZSk7IH1cblx0Z2V0IG9uRGlkQ2hhbmdlU2VsZWN0aW9uKCk6IEV2ZW50PElUcmVlRXZlbnQ8VD4+IHsgcmV0dXJuIHRoaXMuZXZlbnRCdWZmZXJlci53cmFwRXZlbnQodGhpcy5zZWxlY3Rpb24ub25EaWRDaGFuZ2UpOyB9XG5cblx0Z2V0IG9uTW91c2VDbGljaygpOiBFdmVudDxJVHJlZU1vdXNlRXZlbnQ8VD4+IHsgcmV0dXJuIEV2ZW50Lm1hcCh0aGlzLnZpZXcub25Nb3VzZUNsaWNrLCBhc1RyZWVNb3VzZUV2ZW50KTsgfVxuXHRnZXQgb25Nb3VzZURibENsaWNrKCk6IEV2ZW50PElUcmVlTW91c2VFdmVudDxUPj4geyByZXR1cm4gRXZlbnQuZmlsdGVyKEV2ZW50Lm1hcCh0aGlzLnZpZXcub25Nb3VzZURibENsaWNrLCBhc1RyZWVNb3VzZUV2ZW50KSwgZSA9PiBlLnRhcmdldCAhPT0gVHJlZU1vdXNlRXZlbnRUYXJnZXQuRmlsdGVyKTsgfVxuXHRnZXQgb25Nb3VzZU1pZGRsZUNsaWNrKCk6IEV2ZW50PElUcmVlTW91c2VFdmVudDxUPj4geyByZXR1cm4gRXZlbnQuZmlsdGVyKEV2ZW50Lm1hcCh0aGlzLnZpZXcub25Nb3VzZU1pZGRsZUNsaWNrLCBhc1RyZWVNb3VzZUV2ZW50KSwgZSA9PiBlLnRhcmdldCAhPT0gVHJlZU1vdXNlRXZlbnRUYXJnZXQuRmlsdGVyKTsgfVxuXHRnZXQgb25Nb3VzZU92ZXIoKTogRXZlbnQ8SVRyZWVNb3VzZUV2ZW50PFQ+PiB7IHJldHVybiBFdmVudC5tYXAodGhpcy52aWV3Lm9uTW91c2VPdmVyLCBhc1RyZWVNb3VzZUV2ZW50KTsgfVxuXHRnZXQgb25Nb3VzZU91dCgpOiBFdmVudDxJVHJlZU1vdXNlRXZlbnQ8VD4+IHsgcmV0dXJuIEV2ZW50Lm1hcCh0aGlzLnZpZXcub25Nb3VzZU91dCwgYXNUcmVlTW91c2VFdmVudCk7IH1cblx0Z2V0IG9uQ29udGV4dE1lbnUoKTogRXZlbnQ8SVRyZWVDb250ZXh0TWVudUV2ZW50PFQ+PiB7IHJldHVybiBFdmVudC5hbnkoRXZlbnQuZmlsdGVyKEV2ZW50Lm1hcCh0aGlzLnZpZXcub25Db250ZXh0TWVudSwgYXNUcmVlQ29udGV4dE1lbnVFdmVudCksIGUgPT4gIWUuaXNTdGlja3lTY3JvbGwpLCB0aGlzLnN0aWNreVNjcm9sbENvbnRyb2xsZXI/Lm9uQ29udGV4dE1lbnUgPz8gRXZlbnQuTm9uZSk7IH1cblx0Z2V0IG9uVGFwKCk6IEV2ZW50PElUcmVlTW91c2VFdmVudDxUPj4geyByZXR1cm4gRXZlbnQubWFwKHRoaXMudmlldy5vblRhcCwgYXNUcmVlTW91c2VFdmVudCk7IH1cblx0Z2V0IG9uUG9pbnRlcigpOiBFdmVudDxJVHJlZU1vdXNlRXZlbnQ8VD4+IHsgcmV0dXJuIEV2ZW50Lm1hcCh0aGlzLnZpZXcub25Qb2ludGVyLCBhc1RyZWVNb3VzZUV2ZW50KTsgfVxuXG5cdGdldCBvbktleURvd24oKTogRXZlbnQ8S2V5Ym9hcmRFdmVudD4geyByZXR1cm4gdGhpcy52aWV3Lm9uS2V5RG93bjsgfVxuXHRnZXQgb25LZXlVcCgpOiBFdmVudDxLZXlib2FyZEV2ZW50PiB7IHJldHVybiB0aGlzLnZpZXcub25LZXlVcDsgfVxuXHRnZXQgb25LZXlQcmVzcygpOiBFdmVudDxLZXlib2FyZEV2ZW50PiB7IHJldHVybiB0aGlzLnZpZXcub25LZXlQcmVzczsgfVxuXG5cdGdldCBvbkRpZEZvY3VzKCk6IEV2ZW50PHZvaWQ+IHsgcmV0dXJuIHRoaXMudmlldy5vbkRpZEZvY3VzOyB9XG5cdGdldCBvbkRpZEJsdXIoKTogRXZlbnQ8dm9pZD4geyByZXR1cm4gdGhpcy52aWV3Lm9uRGlkQmx1cjsgfVxuXG5cdHByaXZhdGUgcmVhZG9ubHkgb25EaWRTd2FwTW9kZWwgPSB0aGlzLmRpc3Bvc2FibGVzLmFkZChuZXcgRW1pdHRlcjx2b2lkPigpKTtcblx0cHJpdmF0ZSByZWFkb25seSBvbkRpZENoYW5nZU1vZGVsUmVsYXkgPSB0aGlzLmRpc3Bvc2FibGVzLmFkZChuZXcgUmVsYXk8dm9pZD4oKSk7XG5cdHByaXZhdGUgcmVhZG9ubHkgb25EaWRTcGxpY2VNb2RlbFJlbGF5ID0gdGhpcy5kaXNwb3NhYmxlcy5hZGQobmV3IFJlbGF5PElUcmVlTW9kZWxTcGxpY2VFdmVudDxULCBURmlsdGVyRGF0YT4+KCkpO1xuXHRwcml2YXRlIHJlYWRvbmx5IG9uRGlkQ2hhbmdlQ29sbGFwc2VTdGF0ZVJlbGF5ID0gdGhpcy5kaXNwb3NhYmxlcy5hZGQobmV3IFJlbGF5PElDb2xsYXBzZVN0YXRlQ2hhbmdlRXZlbnQ8VCwgVEZpbHRlckRhdGE+PigpKTtcblx0cHJpdmF0ZSByZWFkb25seSBvbkRpZENoYW5nZVJlbmRlck5vZGVDb3VudFJlbGF5ID0gdGhpcy5kaXNwb3NhYmxlcy5hZGQobmV3IFJlbGF5PElUcmVlTm9kZTxULCBURmlsdGVyRGF0YT4+KCkpO1xuXHRwcml2YXRlIHJlYWRvbmx5IG9uRGlkQ2hhbmdlQWN0aXZlTm9kZXNSZWxheSA9IHRoaXMuZGlzcG9zYWJsZXMuYWRkKG5ldyBSZWxheTxJVHJlZU5vZGU8VCwgVEZpbHRlckRhdGE+W10+KCkpO1xuXG5cdGdldCBvbkRpZENoYW5nZU1vZGVsKCk6IEV2ZW50PHZvaWQ+IHsgcmV0dXJuIEV2ZW50LmFueSh0aGlzLm9uRGlkQ2hhbmdlTW9kZWxSZWxheS5ldmVudCwgdGhpcy5vbkRpZFN3YXBNb2RlbC5ldmVudCk7IH1cblx0Z2V0IG9uRGlkQ2hhbmdlQ29sbGFwc2VTdGF0ZSgpOiBFdmVudDxJQ29sbGFwc2VTdGF0ZUNoYW5nZUV2ZW50PFQsIFRGaWx0ZXJEYXRhPj4geyByZXR1cm4gdGhpcy5vbkRpZENoYW5nZUNvbGxhcHNlU3RhdGVSZWxheS5ldmVudDsgfVxuXHRnZXQgb25EaWRDaGFuZ2VSZW5kZXJOb2RlQ291bnQoKTogRXZlbnQ8SVRyZWVOb2RlPFQsIFRGaWx0ZXJEYXRhPj4geyByZXR1cm4gdGhpcy5vbkRpZENoYW5nZVJlbmRlck5vZGVDb3VudFJlbGF5LmV2ZW50OyB9XG5cblx0cHJpdmF0ZSByZWFkb25seSBfb25XaWxsUmVmaWx0ZXIgPSBuZXcgRW1pdHRlcjx2b2lkPigpO1xuXHRyZWFkb25seSBvbldpbGxSZWZpbHRlcjogRXZlbnQ8dm9pZD4gPSB0aGlzLl9vbldpbGxSZWZpbHRlci5ldmVudDtcblxuXHRnZXQgZmluZE1vZGUoKTogVHJlZUZpbmRNb2RlIHsgcmV0dXJuIHRoaXMuZmluZENvbnRyb2xsZXI/Lm1vZGUgPz8gVHJlZUZpbmRNb2RlLkhpZ2hsaWdodDsgfVxuXHRzZXQgZmluZE1vZGUoZmluZE1vZGU6IFRyZWVGaW5kTW9kZSkgeyBpZiAodGhpcy5maW5kQ29udHJvbGxlcikgeyB0aGlzLmZpbmRDb250cm9sbGVyLm1vZGUgPSBmaW5kTW9kZTsgfSB9XG5cdHJlYWRvbmx5IG9uRGlkQ2hhbmdlRmluZE1vZGU6IEV2ZW50PFRyZWVGaW5kTW9kZT47XG5cblx0Z2V0IGZpbmRNYXRjaFR5cGUoKTogVHJlZUZpbmRNYXRjaFR5cGUgeyByZXR1cm4gdGhpcy5maW5kQ29udHJvbGxlcj8ubWF0Y2hUeXBlID8/IFRyZWVGaW5kTWF0Y2hUeXBlLkZ1enp5OyB9XG5cdHNldCBmaW5kTWF0Y2hUeXBlKGZpbmRGdXp6eTogVHJlZUZpbmRNYXRjaFR5cGUpIHsgaWYgKHRoaXMuZmluZENvbnRyb2xsZXIpIHsgdGhpcy5maW5kQ29udHJvbGxlci5tYXRjaFR5cGUgPSBmaW5kRnV6enk7IH0gfVxuXHRyZWFkb25seSBvbkRpZENoYW5nZUZpbmRNYXRjaFR5cGU6IEV2ZW50PFRyZWVGaW5kTWF0Y2hUeXBlPjtcblxuXHRnZXQgb25EaWRDaGFuZ2VGaW5kUGF0dGVybigpOiBFdmVudDxzdHJpbmc+IHsgcmV0dXJuIHRoaXMuZmluZENvbnRyb2xsZXIgPyB0aGlzLmZpbmRDb250cm9sbGVyLm9uRGlkQ2hhbmdlUGF0dGVybiA6IEV2ZW50Lk5vbmU7IH1cblxuXHRnZXQgZXhwYW5kT25Eb3VibGVDbGljaygpOiBib29sZWFuIHsgcmV0dXJuIHR5cGVvZiB0aGlzLl9vcHRpb25zLmV4cGFuZE9uRG91YmxlQ2xpY2sgPT09ICd1bmRlZmluZWQnID8gdHJ1ZSA6IHRoaXMuX29wdGlvbnMuZXhwYW5kT25Eb3VibGVDbGljazsgfVxuXHRnZXQgZXhwYW5kT25seU9uVHdpc3RpZUNsaWNrKCk6IGJvb2xlYW4gfCAoKGU6IFQpID0+IGJvb2xlYW4pIHsgcmV0dXJuIHR5cGVvZiB0aGlzLl9vcHRpb25zLmV4cGFuZE9ubHlPblR3aXN0aWVDbGljayA9PT0gJ3VuZGVmaW5lZCcgPyB0cnVlIDogdGhpcy5fb3B0aW9ucy5leHBhbmRPbmx5T25Ud2lzdGllQ2xpY2s7IH1cblxuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkRpZFVwZGF0ZU9wdGlvbnMgPSBuZXcgRW1pdHRlcjxJQWJzdHJhY3RUcmVlT3B0aW9uczxULCBURmlsdGVyRGF0YT4+KCk7XG5cdHJlYWRvbmx5IG9uRGlkVXBkYXRlT3B0aW9uczogRXZlbnQ8SUFic3RyYWN0VHJlZU9wdGlvbnM8VCwgVEZpbHRlckRhdGE+PiA9IHRoaXMuX29uRGlkVXBkYXRlT3B0aW9ucy5ldmVudDtcblxuXHRnZXQgb25EaWREaXNwb3NlKCk6IEV2ZW50PHZvaWQ+IHsgcmV0dXJuIHRoaXMudmlldy5vbkRpZERpc3Bvc2U7IH1cblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRwcml2YXRlIHJlYWRvbmx5IF91c2VyOiBzdHJpbmcsXG5cdFx0Y29udGFpbmVyOiBIVE1MRWxlbWVudCxcblx0XHRkZWxlZ2F0ZTogSUxpc3RWaXJ0dWFsRGVsZWdhdGU8VD4sXG5cdFx0cmVuZGVyZXJzOiBJVHJlZVJlbmRlcmVyPFQsIFRGaWx0ZXJEYXRhLCB1bmtub3duPltdLFxuXHRcdHByaXZhdGUgX29wdGlvbnM6IElBYnN0cmFjdFRyZWVPcHRpb25zPFQsIFRGaWx0ZXJEYXRhPiA9IHt9XG5cdCkge1xuXHRcdGlmIChfb3B0aW9ucy5rZXlib2FyZE5hdmlnYXRpb25MYWJlbFByb3ZpZGVyICYmIChfb3B0aW9ucy5maW5kV2lkZ2V0RW5hYmxlZCA/PyB0cnVlKSkge1xuXHRcdFx0dGhpcy5maW5kRmlsdGVyID0gbmV3IEZpbmRGaWx0ZXIoX29wdGlvbnMua2V5Ym9hcmROYXZpZ2F0aW9uTGFiZWxQcm92aWRlciwgX29wdGlvbnMuZmlsdGVyIGFzIElUcmVlRmlsdGVyPFQsIEZ1enp5U2NvcmU+LCBfb3B0aW9ucy5kZWZhdWx0RmluZFZpc2liaWxpdHkpO1xuXHRcdFx0X29wdGlvbnMgPSB7IC4uLl9vcHRpb25zLCBmaWx0ZXI6IHRoaXMuZmluZEZpbHRlciBhcyBJVHJlZUZpbHRlcjxULCBURmlsdGVyRGF0YT4gfTsgLy8gVE9ETyBuZWVkIHR5cGVzY3JpcHQgaGVscCBoZXJlXG5cdFx0XHR0aGlzLmRpc3Bvc2FibGVzLmFkZCh0aGlzLmZpbmRGaWx0ZXIpO1xuXHRcdH1cblxuXHRcdHRoaXMubW9kZWwgPSB0aGlzLmNyZWF0ZU1vZGVsKF91c2VyLCBfb3B0aW9ucyk7XG5cdFx0dGhpcy50cmVlRGVsZWdhdGUgPSBuZXcgQ29tcG9zZWRUcmVlRGVsZWdhdGU8VCwgSVRyZWVOb2RlPFQsIFRGaWx0ZXJEYXRhPj4oZGVsZWdhdGUpO1xuXG5cdFx0Y29uc3QgYWN0aXZlTm9kZXMgPSB0aGlzLmRpc3Bvc2FibGVzLmFkZChuZXcgRXZlbnRDb2xsZWN0aW9uKHRoaXMub25EaWRDaGFuZ2VBY3RpdmVOb2Rlc1JlbGF5LmV2ZW50KSk7XG5cdFx0Y29uc3QgcmVuZGVyZWRJbmRlbnRHdWlkZXMgPSBuZXcgU2V0TWFwPElUcmVlTm9kZTxULCBURmlsdGVyRGF0YT4sIEhUTUxEaXZFbGVtZW50PigpO1xuXHRcdHRoaXMucmVuZGVyZXJzID0gcmVuZGVyZXJzLm1hcChyID0+IG5ldyBUcmVlUmVuZGVyZXI8VCwgVEZpbHRlckRhdGEsIFRSZWYsIHVua25vd24+KHIsIHRoaXMubW9kZWwsIHRoaXMub25EaWRDaGFuZ2VDb2xsYXBzZVN0YXRlUmVsYXkuZXZlbnQsIGFjdGl2ZU5vZGVzLCByZW5kZXJlZEluZGVudEd1aWRlcywgX29wdGlvbnMpKTtcblx0XHRmb3IgKGNvbnN0IHIgb2YgdGhpcy5yZW5kZXJlcnMpIHtcblx0XHRcdHRoaXMuZGlzcG9zYWJsZXMuYWRkKHIpO1xuXHRcdH1cblxuXHRcdHRoaXMuZm9jdXMgPSBuZXcgVHJhaXQoKCkgPT4gdGhpcy52aWV3LmdldEZvY3VzZWRFbGVtZW50cygpWzBdLCBfb3B0aW9ucy5pZGVudGl0eVByb3ZpZGVyKTtcblx0XHR0aGlzLnNlbGVjdGlvbiA9IG5ldyBUcmFpdCgoKSA9PiB0aGlzLnZpZXcuZ2V0U2VsZWN0ZWRFbGVtZW50cygpWzBdLCBfb3B0aW9ucy5pZGVudGl0eVByb3ZpZGVyKTtcblx0XHR0aGlzLmFuY2hvciA9IG5ldyBUcmFpdCgoKSA9PiB0aGlzLnZpZXcuZ2V0QW5jaG9yRWxlbWVudCgpLCBfb3B0aW9ucy5pZGVudGl0eVByb3ZpZGVyKTtcblx0XHR0aGlzLnZpZXcgPSBuZXcgVHJlZU5vZGVMaXN0KF91c2VyLCBjb250YWluZXIsIHRoaXMudHJlZURlbGVnYXRlLCB0aGlzLnJlbmRlcmVycywgdGhpcy5mb2N1cywgdGhpcy5zZWxlY3Rpb24sIHRoaXMuYW5jaG9yLCB7IC4uLmFzTGlzdE9wdGlvbnMoKCkgPT4gdGhpcy5tb2RlbCwgdGhpcy5kaXNwb3NhYmxlcywgX29wdGlvbnMpLCB0cmVlOiB0aGlzLCBzdGlja3lTY3JvbGxQcm92aWRlcjogKCkgPT4gdGhpcy5zdGlja3lTY3JvbGxDb250cm9sbGVyIH0pO1xuXG5cdFx0dGhpcy5zZXR1cE1vZGVsKHRoaXMubW9kZWwpOyAvLyBtb2RlbCBuZWVkcyB0byBiZSBzZXR1cCBhZnRlciB0aGUgdHJhaXRzIGhhdmUgYmVlbiBjcmVhdGVkXG5cblx0XHRpZiAoX29wdGlvbnMua2V5Ym9hcmRTdXBwb3J0ICE9PSBmYWxzZSkge1xuXHRcdFx0Y29uc3Qgb25LZXlEb3duID0gRXZlbnQuY2hhaW4odGhpcy52aWV3Lm9uS2V5RG93biwgJCA9PlxuXHRcdFx0XHQkLmZpbHRlcihlID0+ICFpc0VkaXRhYmxlRWxlbWVudChlLnRhcmdldCBhcyBIVE1MRWxlbWVudCkpXG5cdFx0XHRcdFx0Lm1hcChlID0+IG5ldyBTdGFuZGFyZEtleWJvYXJkRXZlbnQoZSkpXG5cdFx0XHQpO1xuXG5cdFx0XHRFdmVudC5jaGFpbihvbktleURvd24sICQgPT4gJC5maWx0ZXIoZSA9PiBlLmtleUNvZGUgPT09IEtleUNvZGUuTGVmdEFycm93KSkodGhpcy5vbkxlZnRBcnJvdywgdGhpcywgdGhpcy5kaXNwb3NhYmxlcyk7XG5cdFx0XHRFdmVudC5jaGFpbihvbktleURvd24sICQgPT4gJC5maWx0ZXIoZSA9PiBlLmtleUNvZGUgPT09IEtleUNvZGUuUmlnaHRBcnJvdykpKHRoaXMub25SaWdodEFycm93LCB0aGlzLCB0aGlzLmRpc3Bvc2FibGVzKTtcblx0XHRcdEV2ZW50LmNoYWluKG9uS2V5RG93biwgJCA9PiAkLmZpbHRlcihlID0+IGUua2V5Q29kZSA9PT0gS2V5Q29kZS5TcGFjZSkpKHRoaXMub25TcGFjZSwgdGhpcywgdGhpcy5kaXNwb3NhYmxlcyk7XG5cdFx0fVxuXG5cdFx0aWYgKChfb3B0aW9ucy5maW5kV2lkZ2V0RW5hYmxlZCA/PyB0cnVlKSAmJiBfb3B0aW9ucy5rZXlib2FyZE5hdmlnYXRpb25MYWJlbFByb3ZpZGVyICYmIF9vcHRpb25zLmNvbnRleHRWaWV3UHJvdmlkZXIpIHtcblx0XHRcdGNvbnN0IGZpbmRPcHRpb25zOiBJRmluZENvbnRyb2xsZXJPcHRpb25zID0ge1xuXHRcdFx0XHRzdHlsZXM6IF9vcHRpb25zLmZpbmRXaWRnZXRTdHlsZXMsXG5cdFx0XHRcdGRlZmF1bHRGaW5kTW9kZTogX29wdGlvbnMuZGVmYXVsdEZpbmRNb2RlLFxuXHRcdFx0XHRkZWZhdWx0RmluZE1hdGNoVHlwZTogX29wdGlvbnMuZGVmYXVsdEZpbmRNYXRjaFR5cGUsXG5cdFx0XHRcdHNob3dOb3RGb3VuZE1lc3NhZ2U6IF9vcHRpb25zLnNob3dOb3RGb3VuZE1lc3NhZ2UsXG5cdFx0XHRcdGZpbmRXaWRnZXRDb250YWluZXI6IF9vcHRpb25zLmZpbmRXaWRnZXRDb250YWluZXIsXG5cdFx0XHR9O1xuXHRcdFx0dGhpcy5maW5kQ29udHJvbGxlciA9IHRoaXMuZGlzcG9zYWJsZXMuYWRkKG5ldyBGaW5kQ29udHJvbGxlcih0aGlzLCB0aGlzLmZpbmRGaWx0ZXIhLCBfb3B0aW9ucy5jb250ZXh0Vmlld1Byb3ZpZGVyLCBmaW5kT3B0aW9ucykpO1xuXHRcdFx0dGhpcy5mb2N1c05hdmlnYXRpb25GaWx0ZXIgPSBub2RlID0+IHRoaXMuZmluZENvbnRyb2xsZXIhLnNob3VsZEFsbG93Rm9jdXMobm9kZSk7XG5cdFx0XHR0aGlzLm9uRGlkQ2hhbmdlRmluZE9wZW5TdGF0ZSA9IHRoaXMuZmluZENvbnRyb2xsZXIub25EaWRDaGFuZ2VPcGVuU3RhdGU7XG5cdFx0XHR0aGlzLm9uRGlkQ2hhbmdlRmluZE1vZGUgPSB0aGlzLmZpbmRDb250cm9sbGVyLm9uRGlkQ2hhbmdlTW9kZTtcblx0XHRcdHRoaXMub25EaWRDaGFuZ2VGaW5kTWF0Y2hUeXBlID0gdGhpcy5maW5kQ29udHJvbGxlci5vbkRpZENoYW5nZU1hdGNoVHlwZTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0dGhpcy5vbkRpZENoYW5nZUZpbmRNb2RlID0gRXZlbnQuTm9uZTtcblx0XHRcdHRoaXMub25EaWRDaGFuZ2VGaW5kTWF0Y2hUeXBlID0gRXZlbnQuTm9uZTtcblx0XHR9XG5cblx0XHRpZiAoX29wdGlvbnMuZW5hYmxlU3RpY2t5U2Nyb2xsKSB7XG5cdFx0XHR0aGlzLnN0aWNreVNjcm9sbENvbnRyb2xsZXIgPSBuZXcgU3RpY2t5U2Nyb2xsQ29udHJvbGxlcih0aGlzLCB0aGlzLm1vZGVsLCB0aGlzLnZpZXcsIHRoaXMucmVuZGVyZXJzLCB0aGlzLnRyZWVEZWxlZ2F0ZSwgX29wdGlvbnMpO1xuXHRcdFx0dGhpcy5vbkRpZENoYW5nZVN0aWNreVNjcm9sbEZvY3VzZWQgPSB0aGlzLnN0aWNreVNjcm9sbENvbnRyb2xsZXIub25EaWRDaGFuZ2VIYXNGb2N1cztcblx0XHR9XG5cblx0XHR0aGlzLnN0eWxlRWxlbWVudCA9IGNyZWF0ZVN0eWxlU2hlZXQodGhpcy52aWV3LmdldEhUTUxFbGVtZW50KCkpO1xuXHRcdHRoaXMuZ2V0SFRNTEVsZW1lbnQoKS5jbGFzc0xpc3QudG9nZ2xlKCdhbHdheXMnLCB0aGlzLl9vcHRpb25zLnJlbmRlckluZGVudEd1aWRlcyA9PT0gUmVuZGVySW5kZW50R3VpZGVzLkFsd2F5cyk7XG5cdH1cblxuXHR1cGRhdGVPcHRpb25zKG9wdGlvbnNVcGRhdGU6IElBYnN0cmFjdFRyZWVPcHRpb25zVXBkYXRlPFQ+ID0ge30pOiB2b2lkIHtcblx0XHR0aGlzLl9vcHRpb25zID0geyAuLi50aGlzLl9vcHRpb25zLCAuLi5vcHRpb25zVXBkYXRlIH07XG5cblx0XHRmb3IgKGNvbnN0IHJlbmRlcmVyIG9mIHRoaXMucmVuZGVyZXJzKSB7XG5cdFx0XHRyZW5kZXJlci51cGRhdGVPcHRpb25zKG9wdGlvbnNVcGRhdGUpO1xuXHRcdH1cblxuXHRcdHRoaXMudmlldy51cGRhdGVPcHRpb25zKG9wdGlvbnNVcGRhdGUpO1xuXHRcdHRoaXMuZmluZENvbnRyb2xsZXI/LnVwZGF0ZU9wdGlvbnMob3B0aW9uc1VwZGF0ZSk7XG5cdFx0dGhpcy51cGRhdGVTdGlja3lTY3JvbGwob3B0aW9uc1VwZGF0ZSk7XG5cblx0XHR0aGlzLl9vbkRpZFVwZGF0ZU9wdGlvbnMuZmlyZSh0aGlzLl9vcHRpb25zKTtcblxuXHRcdHRoaXMuZ2V0SFRNTEVsZW1lbnQoKS5jbGFzc0xpc3QudG9nZ2xlKCdhbHdheXMnLCB0aGlzLl9vcHRpb25zLnJlbmRlckluZGVudEd1aWRlcyA9PT0gUmVuZGVySW5kZW50R3VpZGVzLkFsd2F5cyk7XG5cdH1cblxuXHRnZXQgb3B0aW9ucygpOiBJQWJzdHJhY3RUcmVlT3B0aW9uczxULCBURmlsdGVyRGF0YT4ge1xuXHRcdHJldHVybiB0aGlzLl9vcHRpb25zO1xuXHR9XG5cblx0cHJpdmF0ZSB1cGRhdGVTdGlja3lTY3JvbGwob3B0aW9uc1VwZGF0ZTogSUFic3RyYWN0VHJlZU9wdGlvbnNVcGRhdGU8VD4pIHtcblx0XHRpZiAoIXRoaXMuc3RpY2t5U2Nyb2xsQ29udHJvbGxlciAmJiB0aGlzLl9vcHRpb25zLmVuYWJsZVN0aWNreVNjcm9sbCkge1xuXHRcdFx0dGhpcy5zdGlja3lTY3JvbGxDb250cm9sbGVyID0gbmV3IFN0aWNreVNjcm9sbENvbnRyb2xsZXIodGhpcywgdGhpcy5tb2RlbCwgdGhpcy52aWV3LCB0aGlzLnJlbmRlcmVycywgdGhpcy50cmVlRGVsZWdhdGUsIHRoaXMuX29wdGlvbnMpO1xuXHRcdFx0dGhpcy5vbkRpZENoYW5nZVN0aWNreVNjcm9sbEZvY3VzZWQgPSB0aGlzLnN0aWNreVNjcm9sbENvbnRyb2xsZXIub25EaWRDaGFuZ2VIYXNGb2N1cztcblx0XHR9IGVsc2UgaWYgKHRoaXMuc3RpY2t5U2Nyb2xsQ29udHJvbGxlciAmJiAhdGhpcy5fb3B0aW9ucy5lbmFibGVTdGlja3lTY3JvbGwpIHtcblx0XHRcdHRoaXMub25EaWRDaGFuZ2VTdGlja3lTY3JvbGxGb2N1c2VkID0gRXZlbnQuTm9uZTtcblx0XHRcdHRoaXMuc3RpY2t5U2Nyb2xsQ29udHJvbGxlci5kaXNwb3NlKCk7XG5cdFx0XHR0aGlzLnN0aWNreVNjcm9sbENvbnRyb2xsZXIgPSB1bmRlZmluZWQ7XG5cdFx0fVxuXHRcdHRoaXMuc3RpY2t5U2Nyb2xsQ29udHJvbGxlcj8udXBkYXRlT3B0aW9ucyhvcHRpb25zVXBkYXRlKTtcblx0fVxuXG5cdHVwZGF0ZVdpZHRoKGVsZW1lbnQ6IFRSZWYpOiB2b2lkIHtcblx0XHRjb25zdCBpbmRleCA9IHRoaXMubW9kZWwuZ2V0TGlzdEluZGV4KGVsZW1lbnQpO1xuXG5cdFx0aWYgKGluZGV4ID09PSAtMSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdHRoaXMudmlldy51cGRhdGVXaWR0aChpbmRleCk7XG5cdH1cblxuXHQvLyBXaWRnZXRcblxuXHRnZXRIVE1MRWxlbWVudCgpOiBIVE1MRWxlbWVudCB7XG5cdFx0cmV0dXJuIHRoaXMudmlldy5nZXRIVE1MRWxlbWVudCgpO1xuXHR9XG5cblx0Z2V0IGNvbnRlbnRIZWlnaHQoKTogbnVtYmVyIHtcblx0XHRyZXR1cm4gdGhpcy52aWV3LmNvbnRlbnRIZWlnaHQ7XG5cdH1cblxuXHRnZXQgY29udGVudFdpZHRoKCk6IG51bWJlciB7XG5cdFx0cmV0dXJuIHRoaXMudmlldy5jb250ZW50V2lkdGg7XG5cdH1cblxuXHRnZXQgb25EaWRDaGFuZ2VDb250ZW50SGVpZ2h0KCk6IEV2ZW50PG51bWJlcj4ge1xuXHRcdHJldHVybiB0aGlzLnZpZXcub25EaWRDaGFuZ2VDb250ZW50SGVpZ2h0O1xuXHR9XG5cblx0Z2V0IG9uRGlkQ2hhbmdlQ29udGVudFdpZHRoKCk6IEV2ZW50PG51bWJlcj4ge1xuXHRcdHJldHVybiB0aGlzLnZpZXcub25EaWRDaGFuZ2VDb250ZW50V2lkdGg7XG5cdH1cblxuXHRnZXQgc2Nyb2xsVG9wKCk6IG51bWJlciB7XG5cdFx0cmV0dXJuIHRoaXMudmlldy5zY3JvbGxUb3A7XG5cdH1cblxuXHRzZXQgc2Nyb2xsVG9wKHNjcm9sbFRvcDogbnVtYmVyKSB7XG5cdFx0dGhpcy52aWV3LnNjcm9sbFRvcCA9IHNjcm9sbFRvcDtcblx0fVxuXG5cdGdldCBzY3JvbGxMZWZ0KCk6IG51bWJlciB7XG5cdFx0cmV0dXJuIHRoaXMudmlldy5zY3JvbGxMZWZ0O1xuXHR9XG5cblx0c2V0IHNjcm9sbExlZnQoc2Nyb2xsTGVmdDogbnVtYmVyKSB7XG5cdFx0dGhpcy52aWV3LnNjcm9sbExlZnQgPSBzY3JvbGxMZWZ0O1xuXHR9XG5cblx0Z2V0IHNjcm9sbEhlaWdodCgpOiBudW1iZXIge1xuXHRcdHJldHVybiB0aGlzLnZpZXcuc2Nyb2xsSGVpZ2h0O1xuXHR9XG5cblx0Z2V0IHJlbmRlckhlaWdodCgpOiBudW1iZXIge1xuXHRcdHJldHVybiB0aGlzLnZpZXcucmVuZGVySGVpZ2h0O1xuXHR9XG5cblx0Z2V0IGZpcnN0VmlzaWJsZUVsZW1lbnQoKTogVCB8IHVuZGVmaW5lZCB7XG5cdFx0bGV0IGluZGV4ID0gdGhpcy52aWV3LmZpcnN0VmlzaWJsZUluZGV4O1xuXG5cdFx0aWYgKHRoaXMuc3RpY2t5U2Nyb2xsQ29udHJvbGxlcikge1xuXHRcdFx0aW5kZXggKz0gdGhpcy5zdGlja3lTY3JvbGxDb250cm9sbGVyLmNvdW50O1xuXHRcdH1cblxuXHRcdGlmIChpbmRleCA8IDAgfHwgaW5kZXggPj0gdGhpcy52aWV3Lmxlbmd0aCkge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cblx0XHRjb25zdCBub2RlID0gdGhpcy52aWV3LmVsZW1lbnQoaW5kZXgpO1xuXHRcdHJldHVybiBub2RlLmVsZW1lbnQ7XG5cdH1cblxuXHRnZXQgbGFzdFZpc2libGVFbGVtZW50KCk6IFQge1xuXHRcdGNvbnN0IGluZGV4ID0gdGhpcy52aWV3Lmxhc3RWaXNpYmxlSW5kZXg7XG5cdFx0Y29uc3Qgbm9kZSA9IHRoaXMudmlldy5lbGVtZW50KGluZGV4KTtcblx0XHRyZXR1cm4gbm9kZS5lbGVtZW50O1xuXHR9XG5cblx0Z2V0IGFyaWFMYWJlbCgpOiBzdHJpbmcge1xuXHRcdHJldHVybiB0aGlzLnZpZXcuYXJpYUxhYmVsO1xuXHR9XG5cblx0c2V0IGFyaWFMYWJlbCh2YWx1ZTogc3RyaW5nKSB7XG5cdFx0dGhpcy52aWV3LmFyaWFMYWJlbCA9IHZhbHVlO1xuXHR9XG5cblx0Z2V0IHNlbGVjdGlvblNpemUoKSB7XG5cdFx0cmV0dXJuIHRoaXMuc2VsZWN0aW9uLmdldE5vZGVzKCkubGVuZ3RoO1xuXHR9XG5cblx0ZG9tRm9jdXMoKTogdm9pZCB7XG5cdFx0aWYgKHRoaXMuc3RpY2t5U2Nyb2xsQ29udHJvbGxlcj8uZm9jdXNlZExhc3QoKSkge1xuXHRcdFx0dGhpcy5zdGlja3lTY3JvbGxDb250cm9sbGVyLmRvbUZvY3VzKCk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHRoaXMudmlldy5kb21Gb2N1cygpO1xuXHRcdH1cblx0fVxuXG5cdGlzRE9NRm9jdXNlZCgpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gaXNBY3RpdmVFbGVtZW50KHRoaXMuZ2V0SFRNTEVsZW1lbnQoKSk7XG5cdH1cblxuXHRsYXlvdXQoaGVpZ2h0PzogbnVtYmVyLCB3aWR0aD86IG51bWJlcik6IHZvaWQge1xuXHRcdHRoaXMudmlldy5sYXlvdXQoaGVpZ2h0LCB3aWR0aCk7XG5cdH1cblxuXHRzdHlsZShzdHlsZXM6IElMaXN0U3R5bGVzKTogdm9pZCB7XG5cdFx0Y29uc3Qgc3VmZml4ID0gYC4ke3RoaXMudmlldy5kb21JZH1gO1xuXHRcdGNvbnN0IGNvbnRlbnQ6IHN0cmluZ1tdID0gW107XG5cblx0XHRpZiAoc3R5bGVzLnRyZWVJbmRlbnRHdWlkZXNTdHJva2UpIHtcblx0XHRcdGNvbnRlbnQucHVzaChgLm1vbmFjby1saXN0JHtzdWZmaXh9OmhvdmVyIC5tb25hY28tdGwtaW5kZW50ID4gLmluZGVudC1ndWlkZSwgLm1vbmFjby1saXN0JHtzdWZmaXh9LmFsd2F5cyAubW9uYWNvLXRsLWluZGVudCA+IC5pbmRlbnQtZ3VpZGUgIHsgb3BhY2l0eTogMTsgYm9yZGVyLWNvbG9yOiAke3N0eWxlcy50cmVlSW5hY3RpdmVJbmRlbnRHdWlkZXNTdHJva2V9OyB9YCk7XG5cdFx0XHRjb250ZW50LnB1c2goYC5tb25hY28tbGlzdCR7c3VmZml4fSAubW9uYWNvLXRsLWluZGVudCA+IC5pbmRlbnQtZ3VpZGUuYWN0aXZlIHsgb3BhY2l0eTogMTsgYm9yZGVyLWNvbG9yOiAke3N0eWxlcy50cmVlSW5kZW50R3VpZGVzU3Ryb2tlfTsgfWApO1xuXHRcdH1cblxuXHRcdC8vIFN0aWNreSBTY3JvbGwgQmFja2dyb3VuZFxuXHRcdGNvbnN0IHN0aWNreVNjcm9sbEJhY2tncm91bmQgPSBzdHlsZXMudHJlZVN0aWNreVNjcm9sbEJhY2tncm91bmQgPz8gc3R5bGVzLmxpc3RCYWNrZ3JvdW5kO1xuXHRcdGlmIChzdGlja3lTY3JvbGxCYWNrZ3JvdW5kKSB7XG5cdFx0XHRjb250ZW50LnB1c2goYC5tb25hY28tbGlzdCR7c3VmZml4fSAubW9uYWNvLXNjcm9sbGFibGUtZWxlbWVudCAubW9uYWNvLXRyZWUtc3RpY2t5LWNvbnRhaW5lciB7IGJhY2tncm91bmQtY29sb3I6ICR7c3RpY2t5U2Nyb2xsQmFja2dyb3VuZH07IH1gKTtcblx0XHRcdGNvbnRlbnQucHVzaChgLm1vbmFjby1saXN0JHtzdWZmaXh9IC5tb25hY28tc2Nyb2xsYWJsZS1lbGVtZW50IC5tb25hY28tdHJlZS1zdGlja3ktY29udGFpbmVyIC5tb25hY28tdHJlZS1zdGlja3ktcm93IHsgYmFja2dyb3VuZC1jb2xvcjogJHtzdGlja3lTY3JvbGxCYWNrZ3JvdW5kfTsgfWApO1xuXHRcdH1cblxuXHRcdC8vIFN0aWNreSBTY3JvbGwgQm9yZGVyXG5cdFx0aWYgKHN0eWxlcy50cmVlU3RpY2t5U2Nyb2xsQm9yZGVyKSB7XG5cdFx0XHRjb250ZW50LnB1c2goYC5tb25hY28tbGlzdCR7c3VmZml4fSAubW9uYWNvLXNjcm9sbGFibGUtZWxlbWVudCAubW9uYWNvLXRyZWUtc3RpY2t5LWNvbnRhaW5lciB7IGJvcmRlci1ib3R0b206IDFweCBzb2xpZCAke3N0eWxlcy50cmVlU3RpY2t5U2Nyb2xsQm9yZGVyfTsgfWApO1xuXHRcdH1cblxuXHRcdC8vIFN0aWNreSBTY3JvbGwgU2hhZG93XG5cdFx0aWYgKHN0eWxlcy50cmVlU3RpY2t5U2Nyb2xsU2hhZG93KSB7XG5cdFx0XHRjb250ZW50LnB1c2goYC5tb25hY28tbGlzdCR7c3VmZml4fSAubW9uYWNvLXNjcm9sbGFibGUtZWxlbWVudCAubW9uYWNvLXRyZWUtc3RpY2t5LWNvbnRhaW5lciAubW9uYWNvLXRyZWUtc3RpY2t5LWNvbnRhaW5lci1zaGFkb3cgeyBib3gtc2hhZG93OiAke3N0eWxlcy50cmVlU3RpY2t5U2Nyb2xsU2hhZG93fSAwIDZweCA2cHggLTZweCBpbnNldDsgaGVpZ2h0OiAzcHg7IH1gKTtcblx0XHR9XG5cblx0XHQvLyBTdGlja3kgU2Nyb2xsIEZvY3VzXG5cdFx0aWYgKHN0eWxlcy5saXN0Rm9jdXNGb3JlZ3JvdW5kKSB7XG5cdFx0XHRjb250ZW50LnB1c2goYC5tb25hY28tbGlzdCR7c3VmZml4fS5zdGlja3ktc2Nyb2xsLWZvY3VzZWQgLm1vbmFjby1zY3JvbGxhYmxlLWVsZW1lbnQgLm1vbmFjby10cmVlLXN0aWNreS1jb250YWluZXI6Zm9jdXMgLm1vbmFjby1saXN0LXJvdy5mb2N1c2VkIHsgY29sb3I6ICR7c3R5bGVzLmxpc3RGb2N1c0ZvcmVncm91bmR9OyB9YCk7XG5cdFx0XHRjb250ZW50LnB1c2goYC5tb25hY28tbGlzdCR7c3VmZml4fTpub3QoLnN0aWNreS1zY3JvbGwtZm9jdXNlZCkgLm1vbmFjby1zY3JvbGxhYmxlLWVsZW1lbnQgLm1vbmFjby10cmVlLXN0aWNreS1jb250YWluZXIgLm1vbmFjby1saXN0LXJvdy5mb2N1c2VkIHsgY29sb3I6IGluaGVyaXQ7IH1gKTtcblx0XHR9XG5cblx0XHQvLyBTdGlja3kgU2Nyb2xsIEZvY3VzIE91dGxpbmVzXG5cdFx0Y29uc3QgZm9jdXNBbmRTZWxlY3Rpb25PdXRsaW5lID0gYXNDc3NWYWx1ZVdpdGhEZWZhdWx0KHN0eWxlcy5saXN0Rm9jdXNBbmRTZWxlY3Rpb25PdXRsaW5lLCBhc0Nzc1ZhbHVlV2l0aERlZmF1bHQoc3R5bGVzLmxpc3RTZWxlY3Rpb25PdXRsaW5lLCBzdHlsZXMubGlzdEZvY3VzT3V0bGluZSA/PyAnJykpO1xuXHRcdGlmIChmb2N1c0FuZFNlbGVjdGlvbk91dGxpbmUpIHsgLy8gZGVmYXVsdDogbGlzdEZvY3VzT3V0bGluZVxuXHRcdFx0Y29udGVudC5wdXNoKGAubW9uYWNvLWxpc3Qke3N1ZmZpeH0uc3RpY2t5LXNjcm9sbC1mb2N1c2VkIC5tb25hY28tc2Nyb2xsYWJsZS1lbGVtZW50IC5tb25hY28tdHJlZS1zdGlja3ktY29udGFpbmVyOmZvY3VzIC5tb25hY28tbGlzdC1yb3cuZm9jdXNlZC5zZWxlY3RlZCB7IG91dGxpbmU6IDFweCBzb2xpZCAke2ZvY3VzQW5kU2VsZWN0aW9uT3V0bGluZX07IG91dGxpbmUtb2Zmc2V0OiAtMXB4O31gKTtcblx0XHRcdGNvbnRlbnQucHVzaChgLm1vbmFjby1saXN0JHtzdWZmaXh9Om5vdCguc3RpY2t5LXNjcm9sbC1mb2N1c2VkKSAubW9uYWNvLXNjcm9sbGFibGUtZWxlbWVudCAubW9uYWNvLXRyZWUtc3RpY2t5LWNvbnRhaW5lciAubW9uYWNvLWxpc3Qtcm93LmZvY3VzZWQuc2VsZWN0ZWQgeyBvdXRsaW5lOiBpbmhlcml0O31gKTtcblx0XHR9XG5cblx0XHRpZiAoc3R5bGVzLmxpc3RGb2N1c091dGxpbmUpIHsgLy8gZGVmYXVsdDogc2V0XG5cdFx0XHRjb250ZW50LnB1c2goYC5tb25hY28tbGlzdCR7c3VmZml4fS5zdGlja3ktc2Nyb2xsLWZvY3VzZWQgLm1vbmFjby1zY3JvbGxhYmxlLWVsZW1lbnQgLm1vbmFjby10cmVlLXN0aWNreS1jb250YWluZXI6Zm9jdXMgLm1vbmFjby1saXN0LXJvdy5mb2N1c2VkIHsgb3V0bGluZTogMXB4IHNvbGlkICR7c3R5bGVzLmxpc3RGb2N1c091dGxpbmV9OyBvdXRsaW5lLW9mZnNldDogLTFweDsgfWApO1xuXHRcdFx0Y29udGVudC5wdXNoKGAubW9uYWNvLWxpc3Qke3N1ZmZpeH06bm90KC5zdGlja3ktc2Nyb2xsLWZvY3VzZWQpIC5tb25hY28tc2Nyb2xsYWJsZS1lbGVtZW50IC5tb25hY28tdHJlZS1zdGlja3ktY29udGFpbmVyIC5tb25hY28tbGlzdC1yb3cuZm9jdXNlZCB7IG91dGxpbmU6IGluaGVyaXQ7IH1gKTtcblxuXHRcdFx0Y29udGVudC5wdXNoKGAuY29udGV4dC1tZW51LXZpc2libGUgLm1vbmFjby1saXN0JHtzdWZmaXh9Lmxhc3QtZm9jdXNlZC5zdGlja3ktc2Nyb2xsLWZvY3VzZWQgLm1vbmFjby1zY3JvbGxhYmxlLWVsZW1lbnQgLm1vbmFjby10cmVlLXN0aWNreS1jb250YWluZXIgLm1vbmFjby1saXN0LXJvdy5wYXNzaXZlLWZvY3VzZWQgeyBvdXRsaW5lOiAxcHggc29saWQgJHtzdHlsZXMubGlzdEZvY3VzT3V0bGluZX07IG91dGxpbmUtb2Zmc2V0OiAtMXB4OyB9YCk7XG5cblx0XHRcdGNvbnRlbnQucHVzaChgLmNvbnRleHQtbWVudS12aXNpYmxlIC5tb25hY28tbGlzdCR7c3VmZml4fS5sYXN0LWZvY3VzZWQuc3RpY2t5LXNjcm9sbC1mb2N1c2VkIC5tb25hY28tbGlzdC1yb3dzIC5tb25hY28tbGlzdC1yb3cuZm9jdXNlZCB7IG91dGxpbmU6IGluaGVyaXQ7IH1gKTtcblx0XHRcdGNvbnRlbnQucHVzaChgLmNvbnRleHQtbWVudS12aXNpYmxlIC5tb25hY28tbGlzdCR7c3VmZml4fS5sYXN0LWZvY3VzZWQ6bm90KC5zdGlja3ktc2Nyb2xsLWZvY3VzZWQpIC5tb25hY28tdHJlZS1zdGlja3ktY29udGFpbmVyIC5tb25hY28tbGlzdC1yb3dzIC5tb25hY28tbGlzdC1yb3cuZm9jdXNlZCB7IG91dGxpbmU6IGluaGVyaXQ7IH1gKTtcblx0XHR9XG5cblx0XHR0aGlzLnN0eWxlRWxlbWVudC50ZXh0Q29udGVudCA9IGNvbnRlbnQuam9pbignXFxuJyk7XG5cblx0XHR0aGlzLnZpZXcuc3R5bGUoc3R5bGVzKTtcblx0fVxuXG5cdC8vIFRyZWUgbmF2aWdhdGlvblxuXG5cdGdldFBhcmVudEVsZW1lbnQobG9jYXRpb246IFRSZWYpOiBUIHtcblx0XHRjb25zdCBwYXJlbnRSZWYgPSB0aGlzLm1vZGVsLmdldFBhcmVudE5vZGVMb2NhdGlvbihsb2NhdGlvbik7XG5cdFx0Y29uc3QgcGFyZW50Tm9kZSA9IHRoaXMubW9kZWwuZ2V0Tm9kZShwYXJlbnRSZWYpO1xuXHRcdHJldHVybiBwYXJlbnROb2RlLmVsZW1lbnQ7XG5cdH1cblxuXHRnZXRGaXJzdEVsZW1lbnRDaGlsZChsb2NhdGlvbjogVFJlZik6IFQgfCB1bmRlZmluZWQge1xuXHRcdHJldHVybiB0aGlzLm1vZGVsLmdldEZpcnN0RWxlbWVudENoaWxkKGxvY2F0aW9uKTtcblx0fVxuXG5cdC8vIFRyZWVcblxuXHRnZXROb2RlKGxvY2F0aW9uPzogVFJlZik6IElUcmVlTm9kZTxULCBURmlsdGVyRGF0YT4ge1xuXHRcdHJldHVybiB0aGlzLm1vZGVsLmdldE5vZGUobG9jYXRpb24pO1xuXHR9XG5cblx0Z2V0Tm9kZUxvY2F0aW9uKG5vZGU6IElUcmVlTm9kZTxULCBURmlsdGVyRGF0YT4pOiBUUmVmIHtcblx0XHRyZXR1cm4gdGhpcy5tb2RlbC5nZXROb2RlTG9jYXRpb24obm9kZSk7XG5cdH1cblxuXHRjb2xsYXBzZShsb2NhdGlvbjogVFJlZiwgcmVjdXJzaXZlOiBib29sZWFuID0gZmFsc2UpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gdGhpcy5tb2RlbC5zZXRDb2xsYXBzZWQobG9jYXRpb24sIHRydWUsIHJlY3Vyc2l2ZSk7XG5cdH1cblxuXHRleHBhbmQobG9jYXRpb246IFRSZWYsIHJlY3Vyc2l2ZTogYm9vbGVhbiA9IGZhbHNlKTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuIHRoaXMubW9kZWwuc2V0Q29sbGFwc2VkKGxvY2F0aW9uLCBmYWxzZSwgcmVjdXJzaXZlKTtcblx0fVxuXG5cdHRvZ2dsZUNvbGxhcHNlZChsb2NhdGlvbjogVFJlZiwgcmVjdXJzaXZlOiBib29sZWFuID0gZmFsc2UpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gdGhpcy5tb2RlbC5zZXRDb2xsYXBzZWQobG9jYXRpb24sIHVuZGVmaW5lZCwgcmVjdXJzaXZlKTtcblx0fVxuXG5cdGV4cGFuZEFsbCgpOiB2b2lkIHtcblx0XHR0aGlzLm1vZGVsLnNldENvbGxhcHNlZCh0aGlzLm1vZGVsLnJvb3RSZWYsIGZhbHNlLCB0cnVlKTtcblx0fVxuXG5cdGNvbGxhcHNlQWxsKCk6IHZvaWQge1xuXHRcdHRoaXMubW9kZWwuc2V0Q29sbGFwc2VkKHRoaXMubW9kZWwucm9vdFJlZiwgdHJ1ZSwgdHJ1ZSk7XG5cdH1cblxuXHRpc0NvbGxhcHNpYmxlKGxvY2F0aW9uOiBUUmVmKTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuIHRoaXMubW9kZWwuaXNDb2xsYXBzaWJsZShsb2NhdGlvbik7XG5cdH1cblxuXHRzZXRDb2xsYXBzaWJsZShsb2NhdGlvbjogVFJlZiwgY29sbGFwc2libGU/OiBib29sZWFuKTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuIHRoaXMubW9kZWwuc2V0Q29sbGFwc2libGUobG9jYXRpb24sIGNvbGxhcHNpYmxlKTtcblx0fVxuXG5cdGlzQ29sbGFwc2VkKGxvY2F0aW9uOiBUUmVmKTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuIHRoaXMubW9kZWwuaXNDb2xsYXBzZWQobG9jYXRpb24pO1xuXHR9XG5cblx0ZXhwYW5kVG8obG9jYXRpb246IFRSZWYpOiB2b2lkIHtcblx0XHR0aGlzLm1vZGVsLmV4cGFuZFRvKGxvY2F0aW9uKTtcblx0fVxuXG5cdHRyaWdnZXJUeXBlTmF2aWdhdGlvbigpOiB2b2lkIHtcblx0XHR0aGlzLnZpZXcudHJpZ2dlclR5cGVOYXZpZ2F0aW9uKCk7XG5cdH1cblxuXHRvcGVuRmluZCgpOiB2b2lkIHtcblx0XHR0aGlzLmZpbmRDb250cm9sbGVyPy5vcGVuKCk7XG5cdH1cblxuXHRjbG9zZUZpbmQoKTogdm9pZCB7XG5cdFx0dGhpcy5maW5kQ29udHJvbGxlcj8uY2xvc2UoKTtcblx0fVxuXG5cdHJlZmlsdGVyKCk6IHZvaWQge1xuXHRcdHRoaXMuX29uV2lsbFJlZmlsdGVyLmZpcmUodW5kZWZpbmVkKTtcblx0XHR0aGlzLm1vZGVsLnJlZmlsdGVyKCk7XG5cdH1cblxuXHRzZXRBbmNob3IoZWxlbWVudDogVFJlZiB8IHVuZGVmaW5lZCk6IHZvaWQge1xuXHRcdGlmICh0eXBlb2YgZWxlbWVudCA9PT0gJ3VuZGVmaW5lZCcpIHtcblx0XHRcdHJldHVybiB0aGlzLnZpZXcuc2V0QW5jaG9yKHVuZGVmaW5lZCk7XG5cdFx0fVxuXG5cdFx0dGhpcy5ldmVudEJ1ZmZlcmVyLmJ1ZmZlckV2ZW50cygoKSA9PiB7XG5cdFx0XHRjb25zdCBub2RlID0gdGhpcy5tb2RlbC5nZXROb2RlKGVsZW1lbnQpO1xuXHRcdFx0dGhpcy5hbmNob3Iuc2V0KFtub2RlXSk7XG5cblx0XHRcdGNvbnN0IGluZGV4ID0gdGhpcy5tb2RlbC5nZXRMaXN0SW5kZXgoZWxlbWVudCk7XG5cblx0XHRcdGlmIChpbmRleCA+IC0xKSB7XG5cdFx0XHRcdHRoaXMudmlldy5zZXRBbmNob3IoaW5kZXgsIHRydWUpO1xuXHRcdFx0fVxuXHRcdH0pO1xuXHR9XG5cblx0Z2V0QW5jaG9yKCk6IFQgfCB1bmRlZmluZWQge1xuXHRcdHJldHVybiB0aGlzLmFuY2hvci5nZXQoKS5hdCgwKTtcblx0fVxuXG5cdHNldFNlbGVjdGlvbihlbGVtZW50czogVFJlZltdLCBicm93c2VyRXZlbnQ/OiBVSUV2ZW50KTogdm9pZCB7XG5cdFx0dGhpcy5ldmVudEJ1ZmZlcmVyLmJ1ZmZlckV2ZW50cygoKSA9PiB7XG5cdFx0XHRjb25zdCBub2RlcyA9IGVsZW1lbnRzLm1hcChlID0+IHRoaXMubW9kZWwuZ2V0Tm9kZShlKSk7XG5cdFx0XHR0aGlzLnNlbGVjdGlvbi5zZXQobm9kZXMsIGJyb3dzZXJFdmVudCk7XG5cblx0XHRcdGNvbnN0IGluZGV4ZXMgPSBlbGVtZW50cy5tYXAoZSA9PiB0aGlzLm1vZGVsLmdldExpc3RJbmRleChlKSkuZmlsdGVyKGkgPT4gaSA+IC0xKTtcblx0XHRcdHRoaXMudmlldy5zZXRTZWxlY3Rpb24oaW5kZXhlcywgYnJvd3NlckV2ZW50LCB0cnVlKTtcblx0XHR9KTtcblx0fVxuXG5cdGdldFNlbGVjdGlvbigpOiBUW10ge1xuXHRcdHJldHVybiB0aGlzLnNlbGVjdGlvbi5nZXQoKTtcblx0fVxuXG5cdHNldEZvY3VzKGVsZW1lbnRzOiBUUmVmW10sIGJyb3dzZXJFdmVudD86IFVJRXZlbnQpOiB2b2lkIHtcblx0XHR0aGlzLmV2ZW50QnVmZmVyZXIuYnVmZmVyRXZlbnRzKCgpID0+IHtcblx0XHRcdGNvbnN0IG5vZGVzID0gZWxlbWVudHMubWFwKGUgPT4gdGhpcy5tb2RlbC5nZXROb2RlKGUpKTtcblx0XHRcdHRoaXMuZm9jdXMuc2V0KG5vZGVzLCBicm93c2VyRXZlbnQpO1xuXG5cdFx0XHRjb25zdCBpbmRleGVzID0gZWxlbWVudHMubWFwKGUgPT4gdGhpcy5tb2RlbC5nZXRMaXN0SW5kZXgoZSkpLmZpbHRlcihpID0+IGkgPiAtMSk7XG5cdFx0XHR0aGlzLnZpZXcuc2V0Rm9jdXMoaW5kZXhlcywgYnJvd3NlckV2ZW50LCB0cnVlKTtcblx0XHR9KTtcblx0fVxuXG5cdGZvY3VzTmV4dChuID0gMSwgbG9vcCA9IGZhbHNlLCBicm93c2VyRXZlbnQ/OiBVSUV2ZW50LCBmaWx0ZXI6ICgobm9kZTogSVRyZWVOb2RlPFQsIFRGaWx0ZXJEYXRhPikgPT4gYm9vbGVhbikgfCB1bmRlZmluZWQgPSAoaXNLZXlib2FyZEV2ZW50KGJyb3dzZXJFdmVudCkgJiYgYnJvd3NlckV2ZW50LmFsdEtleSkgPyB1bmRlZmluZWQgOiB0aGlzLmZvY3VzTmF2aWdhdGlvbkZpbHRlcik6IHZvaWQge1xuXHRcdHRoaXMudmlldy5mb2N1c05leHQobiwgbG9vcCwgYnJvd3NlckV2ZW50LCBmaWx0ZXIpO1xuXHR9XG5cblx0Zm9jdXNQcmV2aW91cyhuID0gMSwgbG9vcCA9IGZhbHNlLCBicm93c2VyRXZlbnQ/OiBVSUV2ZW50LCBmaWx0ZXI6ICgobm9kZTogSVRyZWVOb2RlPFQsIFRGaWx0ZXJEYXRhPikgPT4gYm9vbGVhbikgfCB1bmRlZmluZWQgPSAoaXNLZXlib2FyZEV2ZW50KGJyb3dzZXJFdmVudCkgJiYgYnJvd3NlckV2ZW50LmFsdEtleSkgPyB1bmRlZmluZWQgOiB0aGlzLmZvY3VzTmF2aWdhdGlvbkZpbHRlcik6IHZvaWQge1xuXHRcdHRoaXMudmlldy5mb2N1c1ByZXZpb3VzKG4sIGxvb3AsIGJyb3dzZXJFdmVudCwgZmlsdGVyKTtcblx0fVxuXG5cdGZvY3VzTmV4dFBhZ2UoYnJvd3NlckV2ZW50PzogVUlFdmVudCwgZmlsdGVyOiAoKG5vZGU6IElUcmVlTm9kZTxULCBURmlsdGVyRGF0YT4pID0+IGJvb2xlYW4pIHwgdW5kZWZpbmVkID0gKGlzS2V5Ym9hcmRFdmVudChicm93c2VyRXZlbnQpICYmIGJyb3dzZXJFdmVudC5hbHRLZXkpID8gdW5kZWZpbmVkIDogdGhpcy5mb2N1c05hdmlnYXRpb25GaWx0ZXIpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRyZXR1cm4gdGhpcy52aWV3LmZvY3VzTmV4dFBhZ2UoYnJvd3NlckV2ZW50LCBmaWx0ZXIpO1xuXHR9XG5cblx0Zm9jdXNQcmV2aW91c1BhZ2UoYnJvd3NlckV2ZW50PzogVUlFdmVudCwgZmlsdGVyOiAoKG5vZGU6IElUcmVlTm9kZTxULCBURmlsdGVyRGF0YT4pID0+IGJvb2xlYW4pIHwgdW5kZWZpbmVkID0gKGlzS2V5Ym9hcmRFdmVudChicm93c2VyRXZlbnQpICYmIGJyb3dzZXJFdmVudC5hbHRLZXkpID8gdW5kZWZpbmVkIDogdGhpcy5mb2N1c05hdmlnYXRpb25GaWx0ZXIpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRyZXR1cm4gdGhpcy52aWV3LmZvY3VzUHJldmlvdXNQYWdlKGJyb3dzZXJFdmVudCwgZmlsdGVyLCAoKSA9PiB0aGlzLnN0aWNreVNjcm9sbENvbnRyb2xsZXI/LmhlaWdodCA/PyAwKTtcblx0fVxuXG5cdGZvY3VzTGFzdChicm93c2VyRXZlbnQ/OiBVSUV2ZW50LCBmaWx0ZXI6ICgobm9kZTogSVRyZWVOb2RlPFQsIFRGaWx0ZXJEYXRhPikgPT4gYm9vbGVhbikgfCB1bmRlZmluZWQgPSAoaXNLZXlib2FyZEV2ZW50KGJyb3dzZXJFdmVudCkgJiYgYnJvd3NlckV2ZW50LmFsdEtleSkgPyB1bmRlZmluZWQgOiB0aGlzLmZvY3VzTmF2aWdhdGlvbkZpbHRlcik6IHZvaWQge1xuXHRcdHRoaXMudmlldy5mb2N1c0xhc3QoYnJvd3NlckV2ZW50LCBmaWx0ZXIpO1xuXHR9XG5cblx0Zm9jdXNGaXJzdChicm93c2VyRXZlbnQ/OiBVSUV2ZW50LCBmaWx0ZXI6ICgobm9kZTogSVRyZWVOb2RlPFQsIFRGaWx0ZXJEYXRhPikgPT4gYm9vbGVhbikgfCB1bmRlZmluZWQgPSAoaXNLZXlib2FyZEV2ZW50KGJyb3dzZXJFdmVudCkgJiYgYnJvd3NlckV2ZW50LmFsdEtleSkgPyB1bmRlZmluZWQgOiB0aGlzLmZvY3VzTmF2aWdhdGlvbkZpbHRlcik6IHZvaWQge1xuXHRcdHRoaXMudmlldy5mb2N1c0ZpcnN0KGJyb3dzZXJFdmVudCwgZmlsdGVyKTtcblx0fVxuXG5cdGdldEZvY3VzKCk6IFRbXSB7XG5cdFx0cmV0dXJuIHRoaXMuZm9jdXMuZ2V0KCk7XG5cdH1cblxuXHRnZXRTdGlja3lTY3JvbGxGb2N1cygpOiBUW10ge1xuXHRcdGNvbnN0IGZvY3VzID0gdGhpcy5zdGlja3lTY3JvbGxDb250cm9sbGVyPy5nZXRGb2N1cygpO1xuXHRcdHJldHVybiBmb2N1cyAhPT0gdW5kZWZpbmVkID8gW2ZvY3VzXSA6IFtdO1xuXHR9XG5cblx0Z2V0Rm9jdXNlZFBhcnQoKTogQWJzdHJhY3RUcmVlUGFydCB7XG5cdFx0cmV0dXJuIHRoaXMuc3RpY2t5U2Nyb2xsQ29udHJvbGxlcj8uZm9jdXNlZExhc3QoKSA/IEFic3RyYWN0VHJlZVBhcnQuU3RpY2t5U2Nyb2xsIDogQWJzdHJhY3RUcmVlUGFydC5UcmVlO1xuXHR9XG5cblx0cmV2ZWFsKGxvY2F0aW9uOiBUUmVmLCByZWxhdGl2ZVRvcD86IG51bWJlcik6IHZvaWQge1xuXHRcdHRoaXMubW9kZWwuZXhwYW5kVG8obG9jYXRpb24pO1xuXG5cdFx0Y29uc3QgaW5kZXggPSB0aGlzLm1vZGVsLmdldExpc3RJbmRleChsb2NhdGlvbik7XG5cblx0XHRpZiAoaW5kZXggPT09IC0xKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0aWYgKCF0aGlzLnN0aWNreVNjcm9sbENvbnRyb2xsZXIpIHtcblx0XHRcdHRoaXMudmlldy5yZXZlYWwoaW5kZXgsIHJlbGF0aXZlVG9wKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0Y29uc3QgcGFkZGluZ1RvcCA9IHRoaXMuc3RpY2t5U2Nyb2xsQ29udHJvbGxlci5ub2RlUG9zaXRpb25Ub3BCZWxvd1dpZGdldCh0aGlzLmdldE5vZGUobG9jYXRpb24pKTtcblx0XHRcdHRoaXMudmlldy5yZXZlYWwoaW5kZXgsIHJlbGF0aXZlVG9wLCBwYWRkaW5nVG9wKTtcblx0XHR9XG5cdH1cblxuXHQvKipcblx0ICogUmV0dXJucyB0aGUgcmVsYXRpdmUgcG9zaXRpb24gb2YgYW4gZWxlbWVudCByZW5kZXJlZCBpbiB0aGUgbGlzdC5cblx0ICogUmV0dXJucyBgbnVsbGAgaWYgdGhlIGVsZW1lbnQgaXNuJ3QgKmVudGlyZWx5KiBpbiB0aGUgdmlzaWJsZSB2aWV3cG9ydC5cblx0ICovXG5cdGdldFJlbGF0aXZlVG9wKGxvY2F0aW9uOiBUUmVmKTogbnVtYmVyIHwgbnVsbCB7XG5cdFx0Y29uc3QgaW5kZXggPSB0aGlzLm1vZGVsLmdldExpc3RJbmRleChsb2NhdGlvbik7XG5cblx0XHRpZiAoaW5kZXggPT09IC0xKSB7XG5cdFx0XHRyZXR1cm4gbnVsbDtcblx0XHR9XG5cblx0XHRjb25zdCBzdGlja3lTY3JvbGxOb2RlID0gdGhpcy5zdGlja3lTY3JvbGxDb250cm9sbGVyPy5nZXROb2RlKHRoaXMuZ2V0Tm9kZShsb2NhdGlvbikpO1xuXHRcdHJldHVybiB0aGlzLnZpZXcuZ2V0UmVsYXRpdmVUb3AoaW5kZXgsIHN0aWNreVNjcm9sbE5vZGU/LnBvc2l0aW9uID8/IHRoaXMuc3RpY2t5U2Nyb2xsQ29udHJvbGxlcj8uaGVpZ2h0KTtcblx0fVxuXG5cdC8qKlxuXHQgKiBSZXR1cm5zIHRoZSBhYnNvbHV0ZSB0b3Agb2Zmc2V0IG9mIGFuIGVsZW1lbnQgaW4gdGhlIHRyZWUncyBzY3JvbGwvY29udGVudFxuXHQgKiBzcGFjZSwgb3IgYHVuZGVmaW5lZGAgd2hlbiB0aGUgZWxlbWVudCBpcyBub3QgaW4gdGhlIHRyZWUuIFVubGlrZVxuXHQgKiB7QGxpbmsgZ2V0UmVsYXRpdmVUb3B9LCB0aGlzIHJlYWRzIHRoZSBsYXlvdXQgaGVpZ2h0IG1vZGVsLCBzbyBpdCBhbHNvXG5cdCAqIHJlc29sdmVzIGVsZW1lbnRzIG91dHNpZGUgdGhlIHJlbmRlcmVkIHZpZXdwb3J0LlxuXHQgKi9cblx0Z2V0RWxlbWVudFRvcChsb2NhdGlvbjogVFJlZik6IG51bWJlciB8IHVuZGVmaW5lZCB7XG5cdFx0Y29uc3QgaW5kZXggPSB0aGlzLm1vZGVsLmdldExpc3RJbmRleChsb2NhdGlvbik7XG5cblx0XHRpZiAoaW5kZXggPT09IC0xKSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblxuXHRcdHJldHVybiB0aGlzLnZpZXcuZ2V0RWxlbWVudFRvcChpbmRleCk7XG5cdH1cblxuXHRnZXRWaWV3U3RhdGUoaWRlbnRpdHlQcm92aWRlciA9IHRoaXMub3B0aW9ucy5pZGVudGl0eVByb3ZpZGVyKTogQWJzdHJhY3RUcmVlVmlld1N0YXRlIHtcblx0XHRpZiAoIWlkZW50aXR5UHJvdmlkZXIpIHtcblx0XHRcdHRocm93IG5ldyBUcmVlRXJyb3IodGhpcy5fdXNlciwgJ0NhblxcJ3QgZ2V0IHRyZWUgdmlldyBzdGF0ZSB3aXRob3V0IGFuIGlkZW50aXR5IHByb3ZpZGVyJyk7XG5cdFx0fVxuXG5cdFx0Y29uc3QgZ2V0SWQgPSAoZWxlbWVudDogVCB8IG51bGwpID0+IGlkZW50aXR5UHJvdmlkZXIuZ2V0SWQoZWxlbWVudCEpLnRvU3RyaW5nKCk7XG5cdFx0Y29uc3Qgc3RhdGUgPSBBYnN0cmFjdFRyZWVWaWV3U3RhdGUuZW1wdHkodGhpcy5zY3JvbGxUb3ApO1xuXHRcdGZvciAoY29uc3QgZm9jdXMgb2YgdGhpcy5nZXRGb2N1cygpKSB7XG5cdFx0XHRzdGF0ZS5mb2N1cy5hZGQoZ2V0SWQoZm9jdXMpKTtcblx0XHR9XG5cdFx0Zm9yIChjb25zdCBzZWxlY3Rpb24gb2YgdGhpcy5nZXRTZWxlY3Rpb24oKSkge1xuXHRcdFx0c3RhdGUuc2VsZWN0aW9uLmFkZChnZXRJZChzZWxlY3Rpb24pKTtcblx0XHR9XG5cblx0XHRjb25zdCByb290ID0gdGhpcy5tb2RlbC5nZXROb2RlKCk7XG5cdFx0Y29uc3Qgc3RhY2sgPSBbcm9vdF07XG5cblx0XHR3aGlsZSAoc3RhY2subGVuZ3RoID4gMCkge1xuXHRcdFx0Y29uc3Qgbm9kZSA9IHN0YWNrLnBvcCgpITtcblxuXHRcdFx0aWYgKG5vZGUgIT09IHJvb3QgJiYgbm9kZS5jb2xsYXBzaWJsZSkge1xuXHRcdFx0XHRzdGF0ZS5leHBhbmRlZFtnZXRJZChub2RlLmVsZW1lbnQpXSA9IG5vZGUuY29sbGFwc2VkID8gMCA6IDE7XG5cdFx0XHR9XG5cblx0XHRcdGluc2VydEludG8oc3RhY2ssIHN0YWNrLmxlbmd0aCwgbm9kZS5jaGlsZHJlbik7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHN0YXRlO1xuXHR9XG5cblx0Ly8gTGlzdFxuXG5cdHByaXZhdGUgb25MZWZ0QXJyb3coZTogU3RhbmRhcmRLZXlib2FyZEV2ZW50KTogdm9pZCB7XG5cdFx0ZS5wcmV2ZW50RGVmYXVsdCgpO1xuXHRcdGUuc3RvcFByb3BhZ2F0aW9uKCk7XG5cblx0XHRjb25zdCBub2RlcyA9IHRoaXMudmlldy5nZXRGb2N1c2VkRWxlbWVudHMoKTtcblxuXHRcdGlmIChub2Rlcy5sZW5ndGggPT09IDApIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCBub2RlID0gbm9kZXNbMF07XG5cdFx0Y29uc3QgbG9jYXRpb24gPSB0aGlzLm1vZGVsLmdldE5vZGVMb2NhdGlvbihub2RlKTtcblx0XHRjb25zdCBkaWRDaGFuZ2UgPSB0aGlzLm1vZGVsLnNldENvbGxhcHNlZChsb2NhdGlvbiwgdHJ1ZSk7XG5cblx0XHRpZiAoIWRpZENoYW5nZSkge1xuXHRcdFx0Y29uc3QgcGFyZW50TG9jYXRpb24gPSB0aGlzLm1vZGVsLmdldFBhcmVudE5vZGVMb2NhdGlvbihsb2NhdGlvbik7XG5cblx0XHRcdGlmICghcGFyZW50TG9jYXRpb24pIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXG5cdFx0XHRjb25zdCBwYXJlbnRMaXN0SW5kZXggPSB0aGlzLm1vZGVsLmdldExpc3RJbmRleChwYXJlbnRMb2NhdGlvbik7XG5cblx0XHRcdHRoaXMudmlldy5yZXZlYWwocGFyZW50TGlzdEluZGV4KTtcblx0XHRcdHRoaXMudmlldy5zZXRGb2N1cyhbcGFyZW50TGlzdEluZGV4XSk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBvblJpZ2h0QXJyb3coZTogU3RhbmRhcmRLZXlib2FyZEV2ZW50KTogdm9pZCB7XG5cdFx0ZS5wcmV2ZW50RGVmYXVsdCgpO1xuXHRcdGUuc3RvcFByb3BhZ2F0aW9uKCk7XG5cblx0XHRjb25zdCBub2RlcyA9IHRoaXMudmlldy5nZXRGb2N1c2VkRWxlbWVudHMoKTtcblxuXHRcdGlmIChub2Rlcy5sZW5ndGggPT09IDApIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCBub2RlID0gbm9kZXNbMF07XG5cdFx0Y29uc3QgbG9jYXRpb24gPSB0aGlzLm1vZGVsLmdldE5vZGVMb2NhdGlvbihub2RlKTtcblx0XHRjb25zdCBkaWRDaGFuZ2UgPSB0aGlzLm1vZGVsLnNldENvbGxhcHNlZChsb2NhdGlvbiwgZmFsc2UpO1xuXG5cdFx0aWYgKCFkaWRDaGFuZ2UpIHtcblx0XHRcdGlmICghbm9kZS5jaGlsZHJlbi5zb21lKGNoaWxkID0+IGNoaWxkLnZpc2libGUpKSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblxuXHRcdFx0Y29uc3QgW2ZvY3VzZWRJbmRleF0gPSB0aGlzLnZpZXcuZ2V0Rm9jdXMoKTtcblx0XHRcdGNvbnN0IGZpcnN0Q2hpbGRJbmRleCA9IGZvY3VzZWRJbmRleCArIDE7XG5cblx0XHRcdHRoaXMudmlldy5yZXZlYWwoZmlyc3RDaGlsZEluZGV4KTtcblx0XHRcdHRoaXMudmlldy5zZXRGb2N1cyhbZmlyc3RDaGlsZEluZGV4XSk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBvblNwYWNlKGU6IFN0YW5kYXJkS2V5Ym9hcmRFdmVudCk6IHZvaWQge1xuXHRcdGUucHJldmVudERlZmF1bHQoKTtcblx0XHRlLnN0b3BQcm9wYWdhdGlvbigpO1xuXG5cdFx0Y29uc3Qgbm9kZXMgPSB0aGlzLnZpZXcuZ2V0Rm9jdXNlZEVsZW1lbnRzKCk7XG5cblx0XHRpZiAobm9kZXMubGVuZ3RoID09PSAwKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29uc3Qgbm9kZSA9IG5vZGVzWzBdO1xuXHRcdGNvbnN0IGxvY2F0aW9uID0gdGhpcy5tb2RlbC5nZXROb2RlTG9jYXRpb24obm9kZSk7XG5cdFx0Y29uc3QgcmVjdXJzaXZlID0gZS5icm93c2VyRXZlbnQuYWx0S2V5O1xuXG5cdFx0dGhpcy5tb2RlbC5zZXRDb2xsYXBzZWQobG9jYXRpb24sIHVuZGVmaW5lZCwgcmVjdXJzaXZlKTtcblx0fVxuXG5cdHByb3RlY3RlZCBhYnN0cmFjdCBjcmVhdGVNb2RlbCh1c2VyOiBzdHJpbmcsIG9wdGlvbnM6IElBYnN0cmFjdFRyZWVPcHRpb25zPFQsIFRGaWx0ZXJEYXRhPik6IElUcmVlTW9kZWw8VCwgVEZpbHRlckRhdGEsIFRSZWY+O1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgbW9kZWxEaXNwb3NhYmxlcyA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblx0cHJpdmF0ZSBzZXR1cE1vZGVsKG1vZGVsOiBJVHJlZU1vZGVsPFQsIFRGaWx0ZXJEYXRhLCBUUmVmPikge1xuXHRcdHRoaXMubW9kZWxEaXNwb3NhYmxlcy5jbGVhcigpO1xuXG5cdFx0dGhpcy5tb2RlbERpc3Bvc2FibGVzLmFkZChtb2RlbC5vbkRpZFNwbGljZVJlbmRlcmVkTm9kZXMoKHsgc3RhcnQsIGRlbGV0ZUNvdW50LCBlbGVtZW50cyB9KSA9PiB0aGlzLnZpZXcuc3BsaWNlKHN0YXJ0LCBkZWxldGVDb3VudCwgZWxlbWVudHMpKSk7XG5cblx0XHRjb25zdCBvbkRpZE1vZGVsU3BsaWNlID0gRXZlbnQuZm9yRWFjaChtb2RlbC5vbkRpZFNwbGljZU1vZGVsLCBlID0+IHtcblx0XHRcdHRoaXMuZXZlbnRCdWZmZXJlci5idWZmZXJFdmVudHMoKCkgPT4ge1xuXHRcdFx0XHR0aGlzLmZvY3VzLm9uRGlkTW9kZWxTcGxpY2UoZSk7XG5cdFx0XHRcdHRoaXMuc2VsZWN0aW9uLm9uRGlkTW9kZWxTcGxpY2UoZSk7XG5cdFx0XHR9KTtcblx0XHR9LCB0aGlzLm1vZGVsRGlzcG9zYWJsZXMpO1xuXG5cdFx0Ly8gTWFrZSBzdXJlIHRoZSBgZm9yRWFjaGAgYWx3YXlzIHJ1bnNcblx0XHRvbkRpZE1vZGVsU3BsaWNlKCgpID0+IG51bGwsIG51bGwsIHRoaXMubW9kZWxEaXNwb3NhYmxlcyk7XG5cblx0XHQvLyBBY3RpdmUgbm9kZXMgY2FuIGNoYW5nZSB3aGVuIHRoZSBtb2RlbCBjaGFuZ2VzIG9yIHdoZW4gZm9jdXMgb3Igc2VsZWN0aW9uIGNoYW5nZS5cblx0XHQvLyBXZSBkZWJvdW5jZSBpdCB3aXRoIDAgZGVsYXkgc2luY2UgdGhlc2UgZXZlbnRzIG1heSBmaXJlIGluIHRoZSBzYW1lIHN0YWNrIGFuZCB3ZSBvbmx5XG5cdFx0Ly8gd2FudCB0byBydW4gdGhpcyBvbmNlLiBJdCBhbHNvIGRvZXNuJ3QgbWF0dGVyIGlmIGl0IHJ1bnMgb24gdGhlIG5leHQgdGljayBzaW5jZSBpdCdzIG9ubHlcblx0XHQvLyBhIG5pY2UgdG8gaGF2ZSBVSSBmZWF0dXJlLlxuXHRcdGNvbnN0IGFjdGl2ZU5vZGVzRW1pdHRlciA9IHRoaXMubW9kZWxEaXNwb3NhYmxlcy5hZGQobmV3IEVtaXR0ZXI8SVRyZWVOb2RlPFQsIFRGaWx0ZXJEYXRhPltdPigpKTtcblx0XHRjb25zdCBhY3RpdmVOb2Rlc0RlYm91bmNlID0gdGhpcy5tb2RlbERpc3Bvc2FibGVzLmFkZChuZXcgRGVsYXllcigwKSk7XG5cdFx0dGhpcy5tb2RlbERpc3Bvc2FibGVzLmFkZChFdmVudC5hbnkob25EaWRNb2RlbFNwbGljZSwgdGhpcy5mb2N1cy5vbkRpZENoYW5nZSwgdGhpcy5zZWxlY3Rpb24ub25EaWRDaGFuZ2UpKCgpID0+IHtcblx0XHRcdGFjdGl2ZU5vZGVzRGVib3VuY2UudHJpZ2dlcigoKSA9PiB7XG5cdFx0XHRcdGNvbnN0IHNldCA9IG5ldyBTZXQ8SVRyZWVOb2RlPFQsIFRGaWx0ZXJEYXRhPj4oKTtcblxuXHRcdFx0XHRmb3IgKGNvbnN0IG5vZGUgb2YgdGhpcy5mb2N1cy5nZXROb2RlcygpKSB7XG5cdFx0XHRcdFx0c2V0LmFkZChub2RlIGFzIElUcmVlTm9kZTxULCBURmlsdGVyRGF0YT4pO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0Zm9yIChjb25zdCBub2RlIG9mIHRoaXMuc2VsZWN0aW9uLmdldE5vZGVzKCkpIHtcblx0XHRcdFx0XHRzZXQuYWRkKG5vZGUgYXMgSVRyZWVOb2RlPFQsIFRGaWx0ZXJEYXRhPik7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRhY3RpdmVOb2Rlc0VtaXR0ZXIuZmlyZShbLi4uc2V0LnZhbHVlcygpXSk7XG5cdFx0XHR9KTtcblx0XHR9KSk7XG5cblx0XHR0aGlzLm9uRGlkQ2hhbmdlQWN0aXZlTm9kZXNSZWxheS5pbnB1dCA9IGFjdGl2ZU5vZGVzRW1pdHRlci5ldmVudDtcblx0XHR0aGlzLm9uRGlkQ2hhbmdlTW9kZWxSZWxheS5pbnB1dCA9IEV2ZW50LnNpZ25hbChtb2RlbC5vbkRpZFNwbGljZU1vZGVsKTtcblx0XHR0aGlzLm9uRGlkQ2hhbmdlQ29sbGFwc2VTdGF0ZVJlbGF5LmlucHV0ID0gbW9kZWwub25EaWRDaGFuZ2VDb2xsYXBzZVN0YXRlO1xuXHRcdHRoaXMub25EaWRDaGFuZ2VSZW5kZXJOb2RlQ291bnRSZWxheS5pbnB1dCA9IG1vZGVsLm9uRGlkQ2hhbmdlUmVuZGVyTm9kZUNvdW50O1xuXHRcdHRoaXMub25EaWRTcGxpY2VNb2RlbFJlbGF5LmlucHV0ID0gbW9kZWwub25EaWRTcGxpY2VNb2RlbDtcblxuXHRcdC8vIEFubm91bmNlIGNvbGxhcHNlIHN0YXRlIGNoYW5nZXMgZm9yIHNjcmVlbiByZWFkZXJzIChWb2ljZU92ZXIgZG9lc24ndCByZWxpYWJseVxuXHRcdC8vIGFubm91bmNlIGFyaWEtZXhwYW5kZWQgY2hhbmdlcyBvbiBhbHJlYWR5LWZvY3VzZWQgZWxlbWVudHMpXG5cdFx0aWYgKGlzTWFjaW50b3NoKSB7XG5cdFx0XHR0aGlzLm1vZGVsRGlzcG9zYWJsZXMuYWRkKG1vZGVsLm9uRGlkQ2hhbmdlQ29sbGFwc2VTdGF0ZShlID0+IHtcblx0XHRcdFx0Y29uc3QgeyBub2RlLCBkZWVwIH0gPSBlO1xuXHRcdFx0XHRpZiAobm9kZS5jb2xsYXBzaWJsZSAmJiAhZGVlcCAmJiB0aGlzLmlzRE9NRm9jdXNlZCgpKSB7XG5cdFx0XHRcdFx0YWxlcnQobm9kZS5jb2xsYXBzZWQgPyBsb2NhbGl6ZSgndHJlZU5vZGVDb2xsYXBzZWQnLCBcImNvbGxhcHNlZFwiKSA6IGxvY2FsaXplKCd0cmVlTm9kZUV4cGFuZGVkJywgXCJleHBhbmRlZFwiKSk7XG5cdFx0XHRcdH1cblx0XHRcdH0pKTtcblx0XHR9XG5cdH1cblxuXHRuYXZpZ2F0ZShzdGFydD86IFRSZWYpOiBJVHJlZU5hdmlnYXRvcjxUPiB7XG5cdFx0cmV0dXJuIG5ldyBUcmVlTmF2aWdhdG9yKHRoaXMudmlldywgdGhpcy5tb2RlbCwgc3RhcnQpO1xuXHR9XG5cblx0ZGVsZWdhdGVTY3JvbGxGcm9tTW91c2VXaGVlbEV2ZW50KGJyb3dzZXJFdmVudDogSU1vdXNlV2hlZWxFdmVudCk6IHZvaWQge1xuXHRcdHRoaXMudmlldy5kZWxlZ2F0ZVNjcm9sbEZyb21Nb3VzZVdoZWVsRXZlbnQoYnJvd3NlckV2ZW50KTtcblx0fVxuXG5cdGRpc3Bvc2UoKTogdm9pZCB7XG5cdFx0ZGlzcG9zZSh0aGlzLmRpc3Bvc2FibGVzKTtcblx0XHR0aGlzLnN0aWNreVNjcm9sbENvbnRyb2xsZXI/LmRpc3Bvc2UoKTtcblx0XHR0aGlzLnZpZXcuZGlzcG9zZSgpO1xuXHRcdHRoaXMubW9kZWxEaXNwb3NhYmxlcy5kaXNwb3NlKCk7XG5cdH1cbn1cblxuaW50ZXJmYWNlIElUcmVlTmF2aWdhdG9yVmlldzxULCBURmlsdGVyRGF0YT4ge1xuXHRyZWFkb25seSBsZW5ndGg6IG51bWJlcjtcblx0ZWxlbWVudChpbmRleDogbnVtYmVyKTogSVRyZWVOb2RlPFQsIFRGaWx0ZXJEYXRhPjtcbn1cblxuY2xhc3MgVHJlZU5hdmlnYXRvcjxULCBURmlsdGVyRGF0YSwgVFJlZj4gaW1wbGVtZW50cyBJVHJlZU5hdmlnYXRvcjxUPiB7XG5cblx0cHJpdmF0ZSBpbmRleDogbnVtYmVyO1xuXG5cdGNvbnN0cnVjdG9yKHByaXZhdGUgdmlldzogSVRyZWVOYXZpZ2F0b3JWaWV3PFQsIFRGaWx0ZXJEYXRhPiwgcHJpdmF0ZSBtb2RlbDogSVRyZWVNb2RlbDxULCBURmlsdGVyRGF0YSwgVFJlZj4sIHN0YXJ0PzogVFJlZikge1xuXHRcdGlmIChzdGFydCkge1xuXHRcdFx0dGhpcy5pbmRleCA9IHRoaXMubW9kZWwuZ2V0TGlzdEluZGV4KHN0YXJ0KTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0dGhpcy5pbmRleCA9IC0xO1xuXHRcdH1cblx0fVxuXG5cdGN1cnJlbnQoKTogVCB8IG51bGwge1xuXHRcdGlmICh0aGlzLmluZGV4IDwgMCB8fCB0aGlzLmluZGV4ID49IHRoaXMudmlldy5sZW5ndGgpIHtcblx0XHRcdHJldHVybiBudWxsO1xuXHRcdH1cblxuXHRcdHJldHVybiB0aGlzLnZpZXcuZWxlbWVudCh0aGlzLmluZGV4KS5lbGVtZW50O1xuXHR9XG5cblx0cHJldmlvdXMoKTogVCB8IG51bGwge1xuXHRcdHRoaXMuaW5kZXgtLTtcblx0XHRyZXR1cm4gdGhpcy5jdXJyZW50KCk7XG5cdH1cblxuXHRuZXh0KCk6IFQgfCBudWxsIHtcblx0XHR0aGlzLmluZGV4Kys7XG5cdFx0cmV0dXJuIHRoaXMuY3VycmVudCgpO1xuXHR9XG5cblx0Zmlyc3QoKTogVCB8IG51bGwge1xuXHRcdHRoaXMuaW5kZXggPSAwO1xuXHRcdHJldHVybiB0aGlzLmN1cnJlbnQoKTtcblx0fVxuXG5cdGxhc3QoKTogVCB8IG51bGwge1xuXHRcdHRoaXMuaW5kZXggPSB0aGlzLnZpZXcubGVuZ3RoIC0gMTtcblx0XHRyZXR1cm4gdGhpcy5jdXJyZW50KCk7XG5cdH1cbn1cbiJdLAogICJtYXBwaW5ncyI6ICJBQU1BLFNBQVMsR0FBRyxRQUFRLFdBQVcsR0FBRyxvQkFBb0IsaUJBQWlCLGlCQUFpQix1QkFBdUIseUJBQXlCO0FBQ3hJLFNBQVMsd0JBQXdCO0FBQ2pDLFNBQVMsNkJBQTZCO0FBQ3RDLFNBQVMsa0JBQWtCO0FBQzNCLFNBQVMsNkJBQTZCO0FBQ3RDLFNBQVMsaUJBQWlCO0FBRTFCLFNBQVMsaUJBQWlCO0FBQzFCLFNBQW9DLGFBQWEsMkJBQTJCO0FBRTVFLFNBQVMsK0JBQXFEO0FBQzlELFNBQWdFLGNBQWMsVUFBVSxzQkFBc0IsZ0JBQWdCLHlCQUF5Qix1QkFBdUIsTUFBTSx1QkFBMkM7QUFDL04sU0FBd0IsUUFBUSw0QkFBNEI7QUFDNUQsU0FBUyxpQkFBaUIsc0JBQXNCO0FBQ2hELFNBQW9NLG9CQUFvQixXQUE2QixzQkFBc0Isc0JBQXNCO0FBQ2pTLFNBQVMsY0FBYztBQUN2QixTQUFTLFVBQVUsUUFBUSxZQUFZLGFBQWE7QUFDcEQsU0FBUyxTQUFTLG1CQUFtQixlQUFlO0FBQ3BELFNBQVMsZUFBZTtBQUN4QixTQUFTLGlCQUFpQjtBQUMxQixTQUFTLGNBQWM7QUFDdkIsU0FBUyxTQUFTLE9BQU8sZUFBZSxhQUFhO0FBQ3JELFNBQVMsWUFBWSxrQkFBa0I7QUFDdkMsU0FBUyxlQUFlO0FBQ3hCLFNBQVMsWUFBWSxpQkFBaUIsU0FBc0Isb0JBQW9CO0FBQ2hGLFNBQVMsbUJBQW1CO0FBQzVCLFNBQVMsYUFBYTtBQUV0QixPQUFPO0FBQ1AsU0FBUyxnQkFBZ0I7QUFDekIs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QUFZO0FBQUEsRUFDekQ7QUFBQSxFQUVBLFVBQWdCO0FBQ2YsWUFBUSxLQUFLLFdBQVc7QUFDeEIsU0FBSyx3QkFBd0IsUUFBUTtBQUNyQyxTQUFLLEtBQUssUUFBUTtBQUNsQixTQUFLLGlCQUFpQixRQUFRO0FBQUEsRUFDL0I7QUFDRDtBQU9BLE1BQU0sY0FBaUU7QUFBQSxFQUl0RSxZQUFvQixNQUFrRCxPQUF5QyxPQUFjO0FBQXpHO0FBQWtEO0FBQ3JFLFFBQUksT0FBTztBQUNWLFdBQUssUUFBUSxLQUFLLE1BQU0sYUFBYSxLQUFLO0FBQUEsSUFDM0MsT0FBTztBQUNOLFdBQUssUUFBUTtBQUFBLElBQ2Q7QUFBQSxFQUNEO0FBQUEsRUFFQSxVQUFvQjtBQUNuQixRQUFJLEtBQUssUUFBUSxLQUFLLEtBQUssU0FBUyxLQUFLLEtBQUssUUFBUTtBQUNyRCxhQUFPO0FBQUEsSUFDUjtBQUVBLFdBQU8sS0FBSyxLQUFLLFFBQVEsS0FBSyxLQUFLLEVBQUU7QUFBQSxFQUN0QztBQUFBLEVBRUEsV0FBcUI7QUFDcEIsU0FBSztBQUNMLFdBQU8sS0FBSyxRQUFRO0FBQUEsRUFDckI7QUFBQSxFQUVBLE9BQWlCO0FBQ2hCLFNBQUs7QUFDTCxXQUFPLEtBQUssUUFBUTtBQUFBLEVBQ3JCO0FBQUEsRUFFQSxRQUFrQjtBQUNqQixTQUFLLFFBQVE7QUFDYixXQUFPLEtBQUssUUFBUTtBQUFBLEVBQ3JCO0FBQUEsRUFFQSxPQUFpQjtBQUNoQixTQUFLLFFBQVEsS0FBSyxLQUFLLFNBQVM7QUFDaEMsV0FBTyxLQUFLLFFBQVE7QUFBQSxFQUNyQjtBQUNEOyIsCiAgIm5hbWVzIjogWyJtb2RlbCIsICJyZWYiLCAiUmVuZGVySW5kZW50R3VpZGVzIiwgIlRyZWVGaW5kTW9kZSIsICJUcmVlRmluZE1hdGNoVHlwZSIsICIkIiwgInRvZ2dsZSIsICJEZWZhdWx0VHJlZVRvZ2dsZXMiLCAicmVuZGVyZXIiLCAic3RpY2t5Tm9kZSIsICJBYnN0cmFjdFRyZWVQYXJ0Il0KfQo=
