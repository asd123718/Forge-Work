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
import { EventHelper, getActiveElement, getWindow, isActiveElement, isEditableElement, isHTMLElement, isMouseEvent } from "../../dom.js";
import { createStyleSheet } from "../../domStylesheets.js";
import { asCssValueWithDefault } from "../../cssValue.js";
import { DomEmitter } from "../../event.js";
import { StandardKeyboardEvent } from "../../keyboardEvent.js";
import { Gesture } from "../../touch.js";
import { alert } from "../aria/aria.js";
import { CombinedSpliceable } from "./splice.js";
import { binarySearch, range } from "../../../common/arrays.js";
import { timeout } from "../../../common/async.js";
import { Color } from "../../../common/color.js";
import { memoize } from "../../../common/decorators.js";
import { Emitter, Event, EventBufferer } from "../../../common/event.js";
import { matchesFuzzy2, matchesPrefix } from "../../../common/filters.js";
import { KeyCode } from "../../../common/keyCodes.js";
import { DisposableStore, dispose } from "../../../common/lifecycle.js";
import { clamp } from "../../../common/numbers.js";
import * as platform from "../../../common/platform.js";
import { isNumber } from "../../../common/types.js";
import "./list.css";
import { ListError, NotSelectableGroupId } from "./list.js";
import { ListView } from "./listView.js";
import { StandardMouseEvent } from "../../mouseEvent.js";
import { autorun, constObservable } from "../../../common/observable.js";
class TraitRenderer {
  constructor(trait) {
    this.trait = trait;
    this.renderedElements = [];
  }
  get templateId() {
    return `template:${this.trait.name}`;
  }
  renderTemplate(container) {
    return container;
  }
  renderElement(element, index, templateData) {
    const renderedElementIndex = this.renderedElements.findIndex((el) => el.templateData === templateData);
    if (renderedElementIndex >= 0) {
      const rendered = this.renderedElements[renderedElementIndex];
      this.trait.unrender(templateData);
      rendered.index = index;
    } else {
      const rendered = { index, templateData };
      this.renderedElements.push(rendered);
    }
    this.trait.renderIndex(index, templateData);
  }
  splice(start, deleteCount, insertCount) {
    const rendered = [];
    for (const renderedElement of this.renderedElements) {
      if (renderedElement.index < start) {
        rendered.push(renderedElement);
      } else if (renderedElement.index >= start + deleteCount) {
        rendered.push({
          index: renderedElement.index + insertCount - deleteCount,
          templateData: renderedElement.templateData
        });
      }
    }
    this.renderedElements = rendered;
  }
  renderIndexes(indexes) {
    for (const { index, templateData } of this.renderedElements) {
      if (indexes.indexOf(index) > -1) {
        this.trait.renderIndex(index, templateData);
      }
    }
  }
  disposeTemplate(templateData) {
    const index = this.renderedElements.findIndex((el) => el.templateData === templateData);
    if (index < 0) {
      return;
    }
    this.renderedElements.splice(index, 1);
  }
}
class Trait {
  constructor(_trait) {
    this._trait = _trait;
    this.indexes = [];
    this.sortedIndexes = [];
    this._onChange = new Emitter();
  }
  get onChange() {
    return this._onChange.event;
  }
  get name() {
    return this._trait;
  }
  get renderer() {
    return new TraitRenderer(this);
  }
  splice(start, deleteCount, elements) {
    const diff = elements.length - deleteCount;
    const end = start + deleteCount;
    const sortedIndexes = [];
    let i = 0;
    while (i < this.sortedIndexes.length && this.sortedIndexes[i] < start) {
      sortedIndexes.push(this.sortedIndexes[i++]);
    }
    for (let j = 0; j < elements.length; j++) {
      if (elements[j]) {
        sortedIndexes.push(j + start);
      }
    }
    while (i < this.sortedIndexes.length && this.sortedIndexes[i] >= end) {
      sortedIndexes.push(this.sortedIndexes[i++] + diff);
    }
    this.renderer.splice(start, deleteCount, elements.length);
    this._set(sortedIndexes, sortedIndexes);
  }
  renderIndex(index, container) {
    container.classList.toggle(this._trait, this.contains(index));
  }
  unrender(container) {
    container.classList.remove(this._trait);
  }
  /**
   * Sets the indexes which should have this trait.
   *
   * @param indexes Indexes which should have this trait.
   * @return The old indexes which had this trait.
   */
  set(indexes, browserEvent) {
    return this._set(indexes, [...indexes].sort(numericSort), browserEvent);
  }
  _set(indexes, sortedIndexes, browserEvent) {
    const result = this.indexes;
    const sortedResult = this.sortedIndexes;
    this.indexes = indexes;
    this.sortedIndexes = sortedIndexes;
    const toRender = disjunction(sortedResult, indexes);
    this.renderer.renderIndexes(toRender);
    this._onChange.fire({ indexes, browserEvent });
    return result;
  }
  get() {
    return this.indexes;
  }
  contains(index) {
    return binarySearch(this.sortedIndexes, index, numericSort) >= 0;
  }
  dispose() {
    dispose(this._onChange);
  }
}
__decorateClass([
  memoize
], Trait.prototype, "renderer", 1);
class SelectionTrait extends Trait {
  constructor(setAriaSelected) {
    super("selected");
    this.setAriaSelected = setAriaSelected;
  }
  renderIndex(index, container) {
    super.renderIndex(index, container);
    if (this.setAriaSelected) {
      if (this.contains(index)) {
        container.setAttribute("aria-selected", "true");
      } else {
        container.setAttribute("aria-selected", "false");
      }
    }
  }
}
class TraitSpliceable {
  constructor(trait, view, identityProvider) {
    this.trait = trait;
    this.view = view;
    this.identityProvider = identityProvider;
  }
  splice(start, deleteCount, elements) {
    if (!this.identityProvider) {
      return this.trait.splice(start, deleteCount, new Array(elements.length).fill(false));
    }
    const pastElementsWithTrait = this.trait.get().map((i) => this.identityProvider.getId(this.view.element(i)).toString());
    if (pastElementsWithTrait.length === 0) {
      return this.trait.splice(start, deleteCount, new Array(elements.length).fill(false));
    }
    const pastElementsWithTraitSet = new Set(pastElementsWithTrait);
    const elementsWithTrait = elements.map((e) => pastElementsWithTraitSet.has(this.identityProvider.getId(e).toString()));
    this.trait.splice(start, deleteCount, elementsWithTrait);
  }
}
function isListElementDescendantOfClass(e, className) {
  if (e.classList.contains(className)) {
    return true;
  }
  if (e.classList.contains("monaco-list")) {
    return false;
  }
  if (!e.parentElement) {
    return false;
  }
  return isListElementDescendantOfClass(e.parentElement, className);
}
function isMonacoEditor(e) {
  return isListElementDescendantOfClass(e, "monaco-editor");
}
function isMonacoCustomToggle(e) {
  return isListElementDescendantOfClass(e, "monaco-custom-toggle");
}
function isActionItem(e) {
  return isListElementDescendantOfClass(e, "action-item");
}
function isMonacoTwistie(e) {
  return isListElementDescendantOfClass(e, "monaco-tl-twistie");
}
function isStickyScrollElement(e) {
  return isListElementDescendantOfClass(e, "monaco-tree-sticky-row");
}
function isStickyScrollContainer(e) {
  return e.classList.contains("monaco-tree-sticky-container");
}
function isButton(e) {
  if (e.tagName === "A" && e.classList.contains("monaco-button") || e.tagName === "DIV" && e.classList.contains("monaco-button-dropdown")) {
    return true;
  }
  if (e.classList.contains("monaco-list")) {
    return false;
  }
  if (!e.parentElement) {
    return false;
  }
  return isButton(e.parentElement);
}
class KeyboardController {
  constructor(list, view, options) {
    this.list = list;
    this.view = view;
    this.disposables = new DisposableStore();
    this.multipleSelectionDisposables = new DisposableStore();
    this.multipleSelectionSupport = options.multipleSelectionSupport;
    this.disposables.add(this.onKeyDown((e) => {
      switch (e.keyCode) {
        case KeyCode.Enter:
          return this.onEnter(e);
        case KeyCode.UpArrow:
          return this.onUpArrow(e);
        case KeyCode.DownArrow:
          return this.onDownArrow(e);
        case KeyCode.PageUp:
          return this.onPageUpArrow(e);
        case KeyCode.PageDown:
          return this.onPageDownArrow(e);
        case KeyCode.Escape:
          return this.onEscape(e);
        case KeyCode.KeyA:
          if (this.multipleSelectionSupport && (platform.isMacintosh ? e.metaKey : e.ctrlKey)) {
            this.onCtrlA(e);
          }
      }
    }));
  }
  get onKeyDown() {
    return Event.chain(
      this.disposables.add(new DomEmitter(this.view.domNode, "keydown")).event,
      ($) => $.filter((e) => !isEditableElement(e.target)).map((e) => new StandardKeyboardEvent(e))
    );
  }
  updateOptions(optionsUpdate) {
    if (optionsUpdate.multipleSelectionSupport !== void 0) {
      this.multipleSelectionSupport = optionsUpdate.multipleSelectionSupport;
    }
  }
  onEnter(e) {
    e.preventDefault();
    e.stopPropagation();
    this.list.setSelection(this.list.getFocus(), e.browserEvent);
  }
  onUpArrow(e) {
    e.preventDefault();
    e.stopPropagation();
    this.list.focusPrevious(1, false, e.browserEvent);
    const el = this.list.getFocus()[0];
    this.list.setAnchor(el);
    this.list.reveal(el);
    this.view.domNode.focus();
  }
  onDownArrow(e) {
    e.preventDefault();
    e.stopPropagation();
    this.list.focusNext(1, false, e.browserEvent);
    const el = this.list.getFocus()[0];
    this.list.setAnchor(el);
    this.list.reveal(el);
    this.view.domNode.focus();
  }
  onPageUpArrow(e) {
    e.preventDefault();
    e.stopPropagation();
    this.list.focusPreviousPage(e.browserEvent);
    const el = this.list.getFocus()[0];
    this.list.setAnchor(el);
    this.list.reveal(el);
    this.view.domNode.focus();
  }
  onPageDownArrow(e) {
    e.preventDefault();
    e.stopPropagation();
    this.list.focusNextPage(e.browserEvent);
    const el = this.list.getFocus()[0];
    this.list.setAnchor(el);
    this.list.reveal(el);
    this.view.domNode.focus();
  }
  onCtrlA(e) {
    e.preventDefault();
    e.stopPropagation();
    let selection = range(this.list.length);
    const focusedElements = this.list.getFocus();
    const referenceGroupId = focusedElements.length > 0 ? this.list.getElementGroupId(focusedElements[0]) : void 0;
    if (referenceGroupId !== void 0) {
      selection = this.list.filterIndicesByGroup(selection, referenceGroupId);
    }
    this.list.setSelection(selection, e.browserEvent);
    this.list.setAnchor(void 0);
    this.view.domNode.focus();
  }
  onEscape(e) {
    if (this.list.getSelection().length) {
      e.preventDefault();
      e.stopPropagation();
      this.list.setSelection([], e.browserEvent);
      this.list.setAnchor(void 0);
      this.view.domNode.focus();
    }
  }
  dispose() {
    this.disposables.dispose();
    this.multipleSelectionDisposables.dispose();
  }
}
__decorateClass([
  memoize
], KeyboardController.prototype, "onKeyDown", 1);
var TypeNavigationMode = /* @__PURE__ */ ((TypeNavigationMode2) => {
  TypeNavigationMode2[TypeNavigationMode2["Automatic"] = 0] = "Automatic";
  TypeNavigationMode2[TypeNavigationMode2["Trigger"] = 1] = "Trigger";
  return TypeNavigationMode2;
})(TypeNavigationMode || {});
var TypeNavigationControllerState = /* @__PURE__ */ ((TypeNavigationControllerState2) => {
  TypeNavigationControllerState2[TypeNavigationControllerState2["Idle"] = 0] = "Idle";
  TypeNavigationControllerState2[TypeNavigationControllerState2["Typing"] = 1] = "Typing";
  return TypeNavigationControllerState2;
})(TypeNavigationControllerState || {});
const DefaultKeyboardNavigationDelegate = new class {
  mightProducePrintableCharacter(event) {
    if (event.ctrlKey || event.metaKey || event.altKey) {
      return false;
    }
    return event.keyCode >= KeyCode.KeyA && event.keyCode <= KeyCode.KeyZ || event.keyCode >= KeyCode.Digit0 && event.keyCode <= KeyCode.Digit9 || event.keyCode >= KeyCode.Numpad0 && event.keyCode <= KeyCode.Numpad9 || event.keyCode >= KeyCode.Semicolon && event.keyCode <= KeyCode.Quote;
  }
}();
class TypeNavigationController {
  constructor(list, view, keyboardNavigationLabelProvider, keyboardNavigationEventFilter, delegate) {
    this.list = list;
    this.view = view;
    this.keyboardNavigationLabelProvider = keyboardNavigationLabelProvider;
    this.keyboardNavigationEventFilter = keyboardNavigationEventFilter;
    this.delegate = delegate;
    this.enabled = false;
    this.state = 0 /* Idle */;
    this.mode = 0 /* Automatic */;
    this.triggered = false;
    this.previouslyFocused = -1;
    this.enabledDisposables = new DisposableStore();
    this.disposables = new DisposableStore();
    this.updateOptions(list.options);
  }
  updateOptions(options) {
    if (options.typeNavigationEnabled ?? true) {
      this.enable();
    } else {
      this.disable();
    }
    this.mode = options.typeNavigationMode ?? 0 /* Automatic */;
  }
  trigger() {
    this.triggered = !this.triggered;
  }
  enable() {
    if (this.enabled) {
      return;
    }
    let typing = false;
    const onChar = Event.chain(
      this.enabledDisposables.add(new DomEmitter(this.view.domNode, "keydown")).event,
      ($) => $.filter((e) => !isEditableElement(e.target)).filter(() => this.mode === 0 /* Automatic */ || this.triggered).map((event) => new StandardKeyboardEvent(event)).filter((e) => typing || this.keyboardNavigationEventFilter(e)).filter((e) => this.delegate.mightProducePrintableCharacter(e)).forEach((e) => EventHelper.stop(e, true)).map((event) => event.browserEvent.key)
    );
    const onClear = Event.debounce(onChar, () => null, 800, void 0, void 0, void 0, this.enabledDisposables);
    const onInput = Event.reduce(Event.any(onChar, onClear), (r, i) => i === null ? null : (r || "") + i, void 0, this.enabledDisposables);
    onInput(this.onInput, this, this.enabledDisposables);
    onClear(this.onClear, this, this.enabledDisposables);
    onChar(() => typing = true, void 0, this.enabledDisposables);
    onClear(() => typing = false, void 0, this.enabledDisposables);
    this.enabled = true;
    this.triggered = false;
  }
  disable() {
    if (!this.enabled) {
      return;
    }
    this.enabledDisposables.clear();
    this.enabled = false;
    this.triggered = false;
  }
  onClear() {
    const focus = this.list.getFocus();
    if (focus.length > 0 && focus[0] === this.previouslyFocused) {
      const ariaLabel = this.list.options.accessibilityProvider?.getAriaLabel(this.list.element(focus[0]));
      if (typeof ariaLabel === "string") {
        alert(ariaLabel);
      } else if (ariaLabel) {
        alert(ariaLabel.get());
      }
    }
    this.previouslyFocused = -1;
  }
  onInput(word) {
    if (!word) {
      this.state = 0 /* Idle */;
      this.triggered = false;
      return;
    }
    const focus = this.list.getFocus();
    const start = focus.length > 0 ? focus[0] : 0;
    const delta = this.state === 0 /* Idle */ ? 1 : 0;
    this.state = 1 /* Typing */;
    for (let i = 0; i < this.list.length; i++) {
      const index = (start + i + delta) % this.list.length;
      const label = this.keyboardNavigationLabelProvider.getKeyboardNavigationLabel(this.view.element(index));
      const labelStr = label && label.toString();
      if (this.list.options.typeNavigationEnabled) {
        if (typeof labelStr !== "undefined") {
          if (matchesPrefix(word, labelStr)) {
            this.previouslyFocused = start;
            this.list.setFocus([index]);
            this.list.reveal(index);
            return;
          }
          const fuzzy = matchesFuzzy2(word, labelStr);
          if (fuzzy) {
            const fuzzyScore = fuzzy[0].end - fuzzy[0].start;
            if (fuzzyScore > 1 && fuzzy.length === 1) {
              this.previouslyFocused = start;
              this.list.setFocus([index]);
              this.list.reveal(index);
              return;
            }
          }
        }
      } else if (typeof labelStr === "undefined" || matchesPrefix(word, labelStr)) {
        this.previouslyFocused = start;
        this.list.setFocus([index]);
        this.list.reveal(index);
        return;
      }
    }
  }
  dispose() {
    this.disable();
    this.enabledDisposables.dispose();
    this.disposables.dispose();
  }
}
class DOMFocusController {
  constructor(list, view) {
    this.list = list;
    this.view = view;
    this.disposables = new DisposableStore();
    const onKeyDown = Event.chain(
      this.disposables.add(new DomEmitter(view.domNode, "keydown")).event,
      ($) => $.filter((e) => !isEditableElement(e.target)).map((e) => new StandardKeyboardEvent(e))
    );
    const onTab = Event.chain(onKeyDown, ($) => $.filter((e) => e.keyCode === KeyCode.Tab && !e.ctrlKey && !e.metaKey && !e.shiftKey && !e.altKey));
    onTab(this.onTab, this, this.disposables);
  }
  onTab(e) {
    if (e.target !== this.view.domNode) {
      return;
    }
    const focus = this.list.getFocus();
    if (focus.length === 0) {
      return;
    }
    const focusedDomElement = this.view.domElement(focus[0]);
    if (!focusedDomElement) {
      return;
    }
    const tabIndexElement = focusedDomElement.querySelector("[tabIndex]");
    if (!tabIndexElement || !isHTMLElement(tabIndexElement) || tabIndexElement.tabIndex === -1) {
      return;
    }
    const style = getWindow(tabIndexElement).getComputedStyle(tabIndexElement);
    if (style.visibility === "hidden" || style.display === "none") {
      return;
    }
    e.preventDefault();
    e.stopPropagation();
    tabIndexElement.focus();
  }
  dispose() {
    this.disposables.dispose();
  }
}
function isSelectionSingleChangeEvent(event) {
  return platform.isMacintosh ? event.browserEvent.metaKey : event.browserEvent.ctrlKey;
}
function isSelectionRangeChangeEvent(event) {
  return event.browserEvent.shiftKey;
}
function isMouseRightClick(event) {
  return isMouseEvent(event) && event.button === 2;
}
const DefaultMultipleSelectionController = {
  isSelectionSingleChangeEvent,
  isSelectionRangeChangeEvent
};
class MouseController {
  constructor(list) {
    this.list = list;
    this.disposables = new DisposableStore();
    this._onPointer = this.disposables.add(new Emitter());
    if (list.options.multipleSelectionSupport !== false) {
      this.multipleSelectionController = this.list.options.multipleSelectionController || DefaultMultipleSelectionController;
    }
    this.mouseSupport = typeof list.options.mouseSupport === "undefined" || !!list.options.mouseSupport;
    if (this.mouseSupport) {
      list.onMouseDown(this.onMouseDown, this, this.disposables);
      list.onContextMenu(this.onContextMenu, this, this.disposables);
      list.onMouseDblClick(this.onDoubleClick, this, this.disposables);
      list.onTouchStart(this.onMouseDown, this, this.disposables);
      this.disposables.add(Gesture.addTarget(list.getHTMLElement()));
    }
    Event.any(list.onMouseClick, list.onMouseMiddleClick, list.onTap)(this.onViewPointer, this, this.disposables);
  }
  get onPointer() {
    return this._onPointer.event;
  }
  updateOptions(optionsUpdate) {
    if (optionsUpdate.multipleSelectionSupport !== void 0) {
      this.multipleSelectionController = void 0;
      if (optionsUpdate.multipleSelectionSupport) {
        this.multipleSelectionController = this.list.options.multipleSelectionController || DefaultMultipleSelectionController;
      }
    }
  }
  isSelectionSingleChangeEvent(event) {
    if (!this.multipleSelectionController) {
      return false;
    }
    return this.multipleSelectionController.isSelectionSingleChangeEvent(event);
  }
  isSelectionRangeChangeEvent(event) {
    if (!this.multipleSelectionController) {
      return false;
    }
    return this.multipleSelectionController.isSelectionRangeChangeEvent(event);
  }
  isSelectionChangeEvent(event) {
    return this.isSelectionSingleChangeEvent(event) || this.isSelectionRangeChangeEvent(event);
  }
  onMouseDown(e) {
    if (isMonacoEditor(e.browserEvent.target)) {
      return;
    }
    if (getActiveElement() !== e.browserEvent.target) {
      this.list.domFocus();
    }
  }
  onContextMenu(e) {
    if (isEditableElement(e.browserEvent.target) || isMonacoEditor(e.browserEvent.target)) {
      return;
    }
    const focus = typeof e.index === "undefined" ? [] : [e.index];
    this.list.setFocus(focus, e.browserEvent);
  }
  onViewPointer(e) {
    if (!this.mouseSupport) {
      return;
    }
    if (isEditableElement(e.browserEvent.target) || isMonacoEditor(e.browserEvent.target)) {
      return;
    }
    if (e.browserEvent.isHandledByList) {
      return;
    }
    e.browserEvent.isHandledByList = true;
    const focus = e.index;
    if (typeof focus === "undefined") {
      this.list.setFocus([], e.browserEvent);
      this.list.setSelection([], e.browserEvent);
      this.list.setAnchor(void 0);
      return;
    }
    if (this.isSelectionChangeEvent(e)) {
      return this.changeSelection(e);
    }
    this.list.setFocus([focus], e.browserEvent);
    this.list.setAnchor(focus);
    if (!isMouseRightClick(e.browserEvent)) {
      const focusGroupId = this.list.getElementGroupId(focus);
      if (focusGroupId !== NotSelectableGroupId) {
        this.list.setSelection([focus], e.browserEvent);
      }
    }
    this._onPointer.fire(e);
  }
  onDoubleClick(e) {
    if (isEditableElement(e.browserEvent.target) || isMonacoEditor(e.browserEvent.target)) {
      return;
    }
    if (this.isSelectionChangeEvent(e)) {
      return;
    }
    if (e.browserEvent.isHandledByList) {
      return;
    }
    e.browserEvent.isHandledByList = true;
    const focus = this.list.getFocus();
    this.list.setSelection(focus, e.browserEvent);
  }
  changeSelection(e) {
    const focus = e.index;
    let anchor = this.list.getAnchor();
    if (this.isSelectionRangeChangeEvent(e)) {
      if (typeof anchor === "undefined") {
        const currentFocus = this.list.getFocus()[0];
        anchor = currentFocus ?? focus;
        this.list.setAnchor(anchor);
      }
      const min = Math.min(anchor, focus);
      const max = Math.max(anchor, focus);
      let rangeSelection = range(min, max + 1);
      const selectedElement = this.list.getSelection()[0];
      if (selectedElement !== void 0) {
        const referenceGroupId = this.list.getElementGroupId(selectedElement);
        if (referenceGroupId !== void 0) {
          rangeSelection = this.list.filterIndicesByGroup(rangeSelection, referenceGroupId);
        }
      }
      const selection = this.list.getSelection();
      const contiguousRange = getContiguousRangeContaining(disjunction(selection, [anchor]), anchor);
      if (contiguousRange.length === 0) {
        return;
      }
      const newSelection = disjunction(rangeSelection, relativeComplement(selection, contiguousRange));
      this.list.setSelection(newSelection, e.browserEvent);
      this.list.setFocus([focus], e.browserEvent);
    } else if (this.isSelectionSingleChangeEvent(e)) {
      const selection = this.list.getSelection();
      const newSelection = selection.filter((i) => i !== focus);
      this.list.setFocus([focus]);
      this.list.setAnchor(focus);
      const focusGroupId = this.list.getElementGroupId(focus);
      if (focusGroupId === NotSelectableGroupId) {
        return;
      }
      if (selection.length === newSelection.length) {
        const itemsToBeSelected = focusGroupId !== void 0 ? this.list.filterIndicesByGroup([...newSelection, focus], focusGroupId) : [...newSelection, focus];
        this.list.setSelection(itemsToBeSelected, e.browserEvent);
      } else {
        this.list.setSelection(newSelection, e.browserEvent);
      }
    }
  }
  dispose() {
    this.disposables.dispose();
  }
}
class DefaultStyleController {
  constructor(styleElement, selectorSuffix) {
    this.styleElement = styleElement;
    this.selectorSuffix = selectorSuffix;
  }
  style(styles) {
    const suffix = this.selectorSuffix && `.${this.selectorSuffix}`;
    const content = [];
    if (styles.listBackground) {
      content.push(`.monaco-list${suffix} .monaco-list-rows { background: ${styles.listBackground}; }`);
    }
    if (styles.listFocusBackground) {
      content.push(`.monaco-list${suffix}:focus .monaco-list-row.focused { background-color: ${styles.listFocusBackground}; }`);
      content.push(`.monaco-list${suffix}:focus .monaco-list-row.focused:hover { background-color: ${styles.listFocusBackground}; }`);
    }
    if (styles.listFocusForeground) {
      content.push(`.monaco-list${suffix}:focus .monaco-list-row.focused { color: ${styles.listFocusForeground}; }`);
    }
    if (styles.listActiveSelectionBackground) {
      content.push(`.monaco-list${suffix}:focus .monaco-list-row.selected { background-color: ${styles.listActiveSelectionBackground}; }`);
      content.push(`.monaco-list${suffix}:focus .monaco-list-row.selected:hover { background-color: ${styles.listActiveSelectionBackground}; }`);
    }
    if (styles.listActiveSelectionForeground) {
      content.push(`.monaco-list${suffix}:focus .monaco-list-row.selected { color: ${styles.listActiveSelectionForeground}; }`);
    }
    if (styles.listActiveSelectionIconForeground) {
      content.push(`.monaco-list${suffix}:focus .monaco-list-row.selected .codicon { color: ${styles.listActiveSelectionIconForeground}; }`);
    }
    if (styles.listFocusAndSelectionBackground) {
      content.push(`
				.monaco-drag-image${suffix},
				.monaco-list${suffix}:focus .monaco-list-row.selected.focused { background-color: ${styles.listFocusAndSelectionBackground}; }
			`);
    }
    if (styles.listFocusAndSelectionForeground) {
      content.push(`
				.monaco-drag-image${suffix},
				.monaco-list${suffix}:focus .monaco-list-row.selected.focused { color: ${styles.listFocusAndSelectionForeground}; }
			`);
    }
    if (styles.listInactiveFocusForeground) {
      content.push(`.monaco-list${suffix} .monaco-list-row.focused { color:  ${styles.listInactiveFocusForeground}; }`);
      content.push(`.monaco-list${suffix} .monaco-list-row.focused:hover { color:  ${styles.listInactiveFocusForeground}; }`);
    }
    if (styles.listInactiveSelectionIconForeground) {
      content.push(`.monaco-list${suffix} .monaco-list-row.focused .codicon { color:  ${styles.listInactiveSelectionIconForeground}; }`);
    }
    if (styles.listInactiveFocusBackground) {
      content.push(`.monaco-list${suffix} .monaco-list-row.focused { background-color:  ${styles.listInactiveFocusBackground}; }`);
      content.push(`.monaco-list${suffix} .monaco-list-row.focused:hover { background-color:  ${styles.listInactiveFocusBackground}; }`);
    }
    if (styles.listInactiveSelectionBackground) {
      content.push(`.monaco-list${suffix} .monaco-list-row.selected { background-color:  ${styles.listInactiveSelectionBackground}; }`);
      content.push(`.monaco-list${suffix} .monaco-list-row.selected:hover { background-color:  ${styles.listInactiveSelectionBackground}; }`);
    }
    if (styles.listInactiveSelectionForeground) {
      content.push(`.monaco-list${suffix} .monaco-list-row.selected { color: ${styles.listInactiveSelectionForeground}; }`);
    }
    if (styles.listHoverBackground) {
      content.push(`.monaco-list${suffix}:not(.drop-target):not(.dragging) .monaco-list-row:hover:not(.selected):not(.focused) { background-color: ${styles.listHoverBackground}; }`);
    }
    if (styles.listHoverForeground) {
      content.push(`.monaco-list${suffix}:not(.drop-target):not(.dragging) .monaco-list-row:hover:not(.selected):not(.focused) { color:  ${styles.listHoverForeground}; }`);
    }
    const focusAndSelectionOutline = asCssValueWithDefault(styles.listFocusAndSelectionOutline, asCssValueWithDefault(styles.listSelectionOutline, styles.listFocusOutline ?? ""));
    if (focusAndSelectionOutline) {
      content.push(`.monaco-list${suffix}:focus .monaco-list-row.focused.selected { outline: 1px solid ${focusAndSelectionOutline}; outline-offset: -1px;}`);
    }
    if (styles.listFocusOutline) {
      content.push(`
				.monaco-drag-image${suffix},
				.monaco-list${suffix}:focus .monaco-list-row.focused,
				.context-menu-visible .monaco-list${suffix}.last-focused .monaco-list-row.focused { outline: 1px solid ${styles.listFocusOutline}; outline-offset: -1px; }
			`);
    }
    const inactiveFocusAndSelectionOutline = asCssValueWithDefault(styles.listSelectionOutline, styles.listInactiveFocusOutline ?? "");
    if (inactiveFocusAndSelectionOutline) {
      content.push(`.monaco-list${suffix} .monaco-list-row.focused.selected { outline: 1px dotted ${inactiveFocusAndSelectionOutline}; outline-offset: -1px; }`);
    }
    if (styles.listSelectionOutline) {
      content.push(`.monaco-list${suffix} .monaco-list-row.selected { outline: 1px dotted ${styles.listSelectionOutline}; outline-offset: -1px; }`);
    }
    if (styles.listInactiveFocusOutline) {
      content.push(`.monaco-list${suffix} .monaco-list-row.focused { outline: 1px dotted ${styles.listInactiveFocusOutline}; outline-offset: -1px; }`);
    }
    if (styles.listHoverOutline) {
      content.push(`.monaco-list${suffix} .monaco-list-row:hover { outline: 1px dashed ${styles.listHoverOutline}; outline-offset: -1px; }`);
    }
    if (styles.listDropOverBackground) {
      content.push(`
				.monaco-list${suffix}.drop-target,
				.monaco-list${suffix} .monaco-list-rows.drop-target,
				.monaco-list${suffix} .monaco-list-row.drop-target { background-color: ${styles.listDropOverBackground} !important; color: inherit !important; }
			`);
    }
    if (styles.listDropBetweenBackground) {
      content.push(`
			.monaco-list${suffix} .monaco-list-rows.drop-target-before .monaco-list-row:first-child::before,
			.monaco-list${suffix} .monaco-list-row.drop-target-before::before {
				content: ""; position: absolute; top: 0px; left: 0px; width: 100%; height: 1px;
				background-color: ${styles.listDropBetweenBackground};
			}`);
      content.push(`
			.monaco-list${suffix} .monaco-list-rows.drop-target-after .monaco-list-row:last-child::after,
			.monaco-list${suffix} .monaco-list-row.drop-target-after::after {
				content: ""; position: absolute; bottom: 0px; left: 0px; width: 100%; height: 1px;
				background-color: ${styles.listDropBetweenBackground};
			}`);
    }
    if (styles.tableColumnsBorder) {
      content.push(`
				.monaco-table > .monaco-split-view2,
				.monaco-table > .monaco-split-view2 .monaco-sash.vertical::before,
				.monaco-enable-motion .monaco-table:hover > .monaco-split-view2,
				.monaco-enable-motion .monaco-table:hover > .monaco-split-view2 .monaco-sash.vertical::before {
					border-color: ${styles.tableColumnsBorder};
				}

				.monaco-enable-motion .monaco-table > .monaco-split-view2,
				.monaco-enable-motion .monaco-table > .monaco-split-view2 .monaco-sash.vertical::before {
					border-color: transparent;
				}
			`);
    }
    if (styles.tableOddRowsBackgroundColor) {
      content.push(`
				.monaco-table .monaco-list-row[data-parity=odd]:not(.focused):not(.selected):not(:hover) .monaco-table-tr,
				.monaco-table .monaco-list:not(:focus) .monaco-list-row[data-parity=odd].focused:not(.selected):not(:hover) .monaco-table-tr,
				.monaco-table .monaco-list:not(.focused) .monaco-list-row[data-parity=odd].focused:not(.selected):not(:hover) .monaco-table-tr {
					background-color: ${styles.tableOddRowsBackgroundColor};
				}
			`);
    }
    this.styleElement.textContent = content.join("\n");
  }
}
const unthemedListStyles = {
  listFocusBackground: "#7FB0D0",
  listActiveSelectionBackground: "#0E639C",
  listActiveSelectionForeground: "#FFFFFF",
  listActiveSelectionIconForeground: "#FFFFFF",
  listFocusAndSelectionOutline: "#90C2F9",
  listFocusAndSelectionBackground: "#094771",
  listFocusAndSelectionForeground: "#FFFFFF",
  listInactiveSelectionBackground: "#3F3F46",
  listInactiveSelectionIconForeground: "#FFFFFF",
  listHoverBackground: "#2A2D2E",
  listDropOverBackground: "#383B3D",
  listDropBetweenBackground: "#EEEEEE",
  treeIndentGuidesStroke: "#a9a9a9",
  treeInactiveIndentGuidesStroke: Color.fromHex("#a9a9a9").transparent(0.4).toString(),
  tableColumnsBorder: Color.fromHex("#cccccc").transparent(0.2).toString(),
  tableOddRowsBackgroundColor: Color.fromHex("#cccccc").transparent(0.04).toString(),
  listBackground: void 0,
  listFocusForeground: void 0,
  listInactiveSelectionForeground: void 0,
  listInactiveFocusForeground: void 0,
  listInactiveFocusBackground: void 0,
  listHoverForeground: void 0,
  listFocusOutline: void 0,
  listInactiveFocusOutline: void 0,
  listSelectionOutline: void 0,
  listHoverOutline: void 0,
  treeStickyScrollBackground: void 0,
  treeStickyScrollBorder: void 0,
  treeStickyScrollShadow: void 0
};
const DefaultOptions = {
  keyboardSupport: true,
  mouseSupport: true,
  multipleSelectionSupport: true,
  dnd: {
    getDragURI() {
      return null;
    },
    onDragStart() {
    },
    onDragOver() {
      return false;
    },
    drop() {
    },
    dispose() {
    }
  }
};
function getContiguousRangeContaining(range2, value) {
  const index = range2.indexOf(value);
  if (index === -1) {
    return [];
  }
  const result = [];
  let i = index - 1;
  while (i >= 0 && range2[i] === value - (index - i)) {
    result.push(range2[i--]);
  }
  result.reverse();
  i = index;
  while (i < range2.length && range2[i] === value + (i - index)) {
    result.push(range2[i++]);
  }
  return result;
}
function disjunction(one, other) {
  const result = [];
  let i = 0, j = 0;
  while (i < one.length || j < other.length) {
    if (i >= one.length) {
      result.push(other[j++]);
    } else if (j >= other.length) {
      result.push(one[i++]);
    } else if (one[i] === other[j]) {
      result.push(one[i]);
      i++;
      j++;
      continue;
    } else if (one[i] < other[j]) {
      result.push(one[i++]);
    } else {
      result.push(other[j++]);
    }
  }
  return result;
}
function relativeComplement(one, other) {
  const result = [];
  let i = 0, j = 0;
  while (i < one.length || j < other.length) {
    if (i >= one.length) {
      result.push(other[j++]);
    } else if (j >= other.length) {
      result.push(one[i++]);
    } else if (one[i] === other[j]) {
      i++;
      j++;
      continue;
    } else if (one[i] < other[j]) {
      result.push(one[i++]);
    } else {
      j++;
    }
  }
  return result;
}
const numericSort = (a, b) => a - b;
class PipelineRenderer {
  constructor(_templateId, renderers) {
    this._templateId = _templateId;
    this.renderers = renderers;
  }
  get templateId() {
    return this._templateId;
  }
  renderTemplate(container) {
    return this.renderers.map((r) => r.renderTemplate(container));
  }
  renderElement(element, index, templateData, renderDetails) {
    let i = 0;
    for (const renderer of this.renderers) {
      renderer.renderElement(element, index, templateData[i++], renderDetails);
    }
  }
  disposeElement(element, index, templateData, renderDetails) {
    let i = 0;
    for (const renderer of this.renderers) {
      renderer.disposeElement?.(element, index, templateData[i], renderDetails);
      i += 1;
    }
  }
  disposeTemplate(templateData) {
    let i = 0;
    for (const renderer of this.renderers) {
      renderer.disposeTemplate(templateData[i++]);
    }
  }
}
class AccessibiltyRenderer {
  constructor(accessibilityProvider) {
    this.accessibilityProvider = accessibilityProvider;
    this.templateId = "a18n";
  }
  renderTemplate(container) {
    return { container, disposables: new DisposableStore() };
  }
  renderElement(element, index, data) {
    const ariaLabel = this.accessibilityProvider.getAriaLabel(element);
    const observable = ariaLabel && typeof ariaLabel !== "string" ? ariaLabel : constObservable(ariaLabel);
    data.disposables.add(autorun((reader) => {
      this.setAriaLabel(reader.readObservable(observable), data.container);
    }));
    const ariaLevel = this.accessibilityProvider.getAriaLevel && this.accessibilityProvider.getAriaLevel(element);
    if (typeof ariaLevel === "number") {
      data.container.setAttribute("aria-level", `${ariaLevel}`);
    } else {
      data.container.removeAttribute("aria-level");
    }
  }
  setAriaLabel(ariaLabel, element) {
    if (ariaLabel) {
      element.setAttribute("aria-label", ariaLabel);
    } else {
      element.removeAttribute("aria-label");
    }
  }
  disposeElement(element, index, templateData) {
    templateData.disposables.clear();
  }
  disposeTemplate(templateData) {
    templateData.disposables.dispose();
  }
}
class ListViewDragAndDrop {
  constructor(list, dnd) {
    this.list = list;
    this.dnd = dnd;
  }
  getDragElements(element) {
    const selection = this.list.getSelectedElements();
    const elements = selection.indexOf(element) > -1 ? selection : [element];
    return elements;
  }
  getDragURI(element) {
    return this.dnd.getDragURI(element);
  }
  getDragLabel(elements, originalEvent) {
    if (this.dnd.getDragLabel) {
      return this.dnd.getDragLabel(elements, originalEvent);
    }
    return void 0;
  }
  onDragStart(data, originalEvent) {
    this.dnd.onDragStart?.(data, originalEvent);
  }
  onDragOver(data, targetElement, targetIndex, targetSector, originalEvent) {
    return this.dnd.onDragOver(data, targetElement, targetIndex, targetSector, originalEvent);
  }
  onDragLeave(data, targetElement, targetIndex, originalEvent) {
    this.dnd.onDragLeave?.(data, targetElement, targetIndex, originalEvent);
  }
  onDragEnd(originalEvent) {
    this.dnd.onDragEnd?.(originalEvent);
  }
  drop(data, targetElement, targetIndex, targetSector, originalEvent) {
    this.dnd.drop(data, targetElement, targetIndex, targetSector, originalEvent);
  }
  dispose() {
    this.dnd.dispose();
  }
}
class List {
  constructor(user, container, virtualDelegate, renderers, _options = DefaultOptions) {
    this.user = user;
    this._options = _options;
    this.focus = new Trait("focused");
    this.anchor = new Trait("anchor");
    this.eventBufferer = new EventBufferer();
    this._ariaLabel = "";
    this.disposables = new DisposableStore();
    this._onDidDispose = new Emitter();
    this.onDidDispose = this._onDidDispose.event;
    const role = this._options.accessibilityProvider && this._options.accessibilityProvider.getWidgetRole ? this._options.accessibilityProvider?.getWidgetRole() : "list";
    this.selection = new SelectionTrait(role !== "listbox");
    const baseRenderers = [this.focus.renderer, this.selection.renderer];
    this.accessibilityProvider = _options.accessibilityProvider;
    if (this.accessibilityProvider) {
      baseRenderers.push(new AccessibiltyRenderer(this.accessibilityProvider));
      this.accessibilityProvider.onDidChangeActiveDescendant?.(this.onDidChangeActiveDescendant, this, this.disposables);
    }
    renderers = renderers.map((r) => new PipelineRenderer(r.templateId, [...baseRenderers, r]));
    const viewOptions = {
      ..._options,
      dnd: _options.dnd && new ListViewDragAndDrop(this, _options.dnd)
    };
    this.view = this.createListView(container, virtualDelegate, renderers, viewOptions);
    this.view.domNode.setAttribute("role", role);
    if (_options.styleController) {
      this.styleController = _options.styleController(this.view.domId);
    } else {
      const styleElement = createStyleSheet(this.view.domNode);
      this.styleController = new DefaultStyleController(styleElement, this.view.domId);
    }
    this.spliceable = new CombinedSpliceable([
      new TraitSpliceable(this.focus, this.view, _options.identityProvider),
      new TraitSpliceable(this.selection, this.view, _options.identityProvider),
      new TraitSpliceable(this.anchor, this.view, _options.identityProvider),
      this.view
    ]);
    this.disposables.add(this.focus);
    this.disposables.add(this.selection);
    this.disposables.add(this.anchor);
    this.disposables.add(this.view);
    this.disposables.add(this._onDidDispose);
    this.disposables.add(new DOMFocusController(this, this.view));
    if (typeof _options.keyboardSupport !== "boolean" || _options.keyboardSupport) {
      this.keyboardController = new KeyboardController(this, this.view, _options);
      this.disposables.add(this.keyboardController);
    }
    if (_options.keyboardNavigationLabelProvider) {
      const delegate = _options.keyboardNavigationDelegate || DefaultKeyboardNavigationDelegate;
      this.typeNavigationController = new TypeNavigationController(this, this.view, _options.keyboardNavigationLabelProvider, _options.keyboardNavigationEventFilter ?? (() => true), delegate);
      this.disposables.add(this.typeNavigationController);
    }
    this.mouseController = this.createMouseController(_options);
    this.disposables.add(this.mouseController);
    this.onDidChangeFocus(this._onFocusChange, this, this.disposables);
    this.onDidChangeSelection(this._onSelectionChange, this, this.disposables);
    if (this.accessibilityProvider) {
      const ariaLabel = this.accessibilityProvider.getWidgetAriaLabel();
      const observable = ariaLabel && typeof ariaLabel !== "string" ? ariaLabel : constObservable(ariaLabel);
      this.disposables.add(autorun((reader) => {
        this.ariaLabel = reader.readObservable(observable);
      }));
    }
    if (this._options.multipleSelectionSupport !== false) {
      this.view.domNode.setAttribute("aria-multiselectable", "true");
    }
  }
  get onDidChangeFocus() {
    return Event.map(this.eventBufferer.wrapEvent(this.focus.onChange), (e) => this.toListEvent(e), this.disposables);
  }
  get onDidChangeSelection() {
    return Event.map(this.eventBufferer.wrapEvent(this.selection.onChange), (e) => this.toListEvent(e), this.disposables);
  }
  get domId() {
    return this.view.domId;
  }
  get onDidScroll() {
    return this.view.onDidScroll;
  }
  get onMouseClick() {
    return this.view.onMouseClick;
  }
  get onMouseDblClick() {
    return this.view.onMouseDblClick;
  }
  get onMouseMiddleClick() {
    return this.view.onMouseMiddleClick;
  }
  get onPointer() {
    return this.mouseController.onPointer;
  }
  get onMouseUp() {
    return this.view.onMouseUp;
  }
  get onMouseDown() {
    return this.view.onMouseDown;
  }
  get onMouseOver() {
    return this.view.onMouseOver;
  }
  get onMouseMove() {
    return this.view.onMouseMove;
  }
  get onMouseOut() {
    return this.view.onMouseOut;
  }
  get onTouchStart() {
    return this.view.onTouchStart;
  }
  get onTap() {
    return this.view.onTap;
  }
  get onContextMenu() {
    let didJustPressContextMenuKey = false;
    const fromKeyDown = Event.chain(this.disposables.add(new DomEmitter(this.view.domNode, "keydown")).event, ($) => $.map((e) => new StandardKeyboardEvent(e)).filter((e) => didJustPressContextMenuKey = e.keyCode === KeyCode.ContextMenu || e.shiftKey && e.keyCode === KeyCode.F10).map((e) => EventHelper.stop(e, true)).filter(() => false));
    const fromKeyUp = Event.chain(this.disposables.add(new DomEmitter(this.view.domNode, "keyup")).event, ($) => $.forEach(() => didJustPressContextMenuKey = false).map((e) => new StandardKeyboardEvent(e)).filter((e) => e.keyCode === KeyCode.ContextMenu || e.shiftKey && e.keyCode === KeyCode.F10).map((e) => EventHelper.stop(e, true)).map(({ browserEvent }) => {
      const focus = this.getFocus();
      const index = focus.length ? focus[0] : void 0;
      const element = typeof index !== "undefined" ? this.view.element(index) : void 0;
      const anchor = typeof index !== "undefined" ? this.view.domElement(index) : this.view.domNode;
      return { index, element, anchor, browserEvent };
    }));
    const fromMouse = Event.chain(
      this.view.onContextMenu,
      ($) => $.filter((_) => !didJustPressContextMenuKey).map(({ element, index, browserEvent }) => ({ element, index, anchor: new StandardMouseEvent(getWindow(this.view.domNode), browserEvent), browserEvent }))
    );
    return Event.any(fromKeyDown, fromKeyUp, fromMouse);
  }
  get onKeyDown() {
    return this.disposables.add(new DomEmitter(this.view.domNode, "keydown")).event;
  }
  get onKeyUp() {
    return this.disposables.add(new DomEmitter(this.view.domNode, "keyup")).event;
  }
  get onKeyPress() {
    return this.disposables.add(new DomEmitter(this.view.domNode, "keypress")).event;
  }
  get onDidFocus() {
    return Event.signal(this.disposables.add(new DomEmitter(this.view.domNode, "focus", true)).event);
  }
  get onDidBlur() {
    return Event.signal(this.disposables.add(new DomEmitter(this.view.domNode, "blur", true)).event);
  }
  createListView(container, virtualDelegate, renderers, viewOptions) {
    return new ListView(container, virtualDelegate, renderers, viewOptions);
  }
  createMouseController(options) {
    return new MouseController(this);
  }
  updateOptions(optionsUpdate = {}) {
    this._options = { ...this._options, ...optionsUpdate };
    this.typeNavigationController?.updateOptions(this._options);
    if (this._options.multipleSelectionController !== void 0) {
      if (this._options.multipleSelectionSupport) {
        this.view.domNode.setAttribute("aria-multiselectable", "true");
      } else {
        this.view.domNode.removeAttribute("aria-multiselectable");
      }
    }
    this.mouseController.updateOptions(optionsUpdate);
    this.keyboardController?.updateOptions(optionsUpdate);
    this.view.updateOptions(optionsUpdate);
  }
  get options() {
    return this._options;
  }
  splice(start, deleteCount, elements = []) {
    if (start < 0 || start > this.view.length) {
      throw new ListError(this.user, `Invalid start index: ${start}`);
    }
    if (deleteCount < 0) {
      throw new ListError(this.user, `Invalid delete count: ${deleteCount}`);
    }
    if (deleteCount === 0 && elements.length === 0) {
      return;
    }
    this.eventBufferer.bufferEvents(() => this.spliceable.splice(start, deleteCount, elements));
  }
  updateWidth(index) {
    this.view.updateWidth(index);
  }
  updateElementHeight(index, size) {
    this.view.updateElementHeight(index, size, null);
  }
  rerender() {
    this.view.rerender();
  }
  element(index) {
    return this.view.element(index);
  }
  indexOf(element) {
    return this.view.indexOf(element);
  }
  indexAt(position) {
    return this.view.indexAt(position);
  }
  get length() {
    return this.view.length;
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
    return this.view.getScrollTop();
  }
  set scrollTop(scrollTop) {
    this.view.setScrollTop(scrollTop);
  }
  get scrollLeft() {
    return this.view.getScrollLeft();
  }
  set scrollLeft(scrollLeft) {
    this.view.setScrollLeft(scrollLeft);
  }
  get scrollHeight() {
    return this.view.scrollHeight;
  }
  get renderHeight() {
    return this.view.renderHeight;
  }
  get firstVisibleIndex() {
    return this.view.firstVisibleIndex;
  }
  get firstMostlyVisibleIndex() {
    return this.view.firstMostlyVisibleIndex;
  }
  get lastVisibleIndex() {
    return this.view.lastVisibleIndex;
  }
  get ariaLabel() {
    return this._ariaLabel;
  }
  set ariaLabel(value) {
    this._ariaLabel = value;
    this.view.domNode.setAttribute("aria-label", value);
  }
  domFocus() {
    this.view.domNode.focus({ preventScroll: true });
  }
  layout(height, width) {
    this.view.layout(height, width);
  }
  triggerTypeNavigation() {
    this.typeNavigationController?.trigger();
  }
  setSelection(indexes, browserEvent) {
    for (const index of indexes) {
      if (index < 0 || index >= this.length) {
        throw new ListError(this.user, `Invalid index ${index}`);
      }
    }
    indexes = indexes.filter((i) => this.getElementGroupId(i) !== NotSelectableGroupId);
    this.selection.set(indexes, browserEvent);
  }
  getSelection() {
    return this.selection.get();
  }
  getSelectedElements() {
    return this.getSelection().map((i) => this.view.element(i));
  }
  setAnchor(index) {
    if (typeof index === "undefined") {
      this.anchor.set([]);
      return;
    }
    if (index < 0 || index >= this.length) {
      throw new ListError(this.user, `Invalid index ${index}`);
    }
    this.anchor.set([index]);
  }
  getAnchor() {
    return this.anchor.get().at(0);
  }
  getAnchorElement() {
    const anchor = this.getAnchor();
    return typeof anchor === "undefined" ? void 0 : this.element(anchor);
  }
  /**
   * Gets the group ID for an element at the given index.
   * Returns undefined if no identity provider, no getGroupId method, or if the group ID is undefined.
   */
  getElementGroupId(index) {
    const identityProvider = this.options.identityProvider;
    if (!identityProvider?.getGroupId) {
      return void 0;
    }
    const element = this.element(index);
    return identityProvider.getGroupId(element);
  }
  /**
   * Filters the given indices to only include those with a matching group ID.
   * If no identity provider or getGroupId method exists, returns the original indices.
   * If referenceGroupId is undefined, returns an empty array (elements without group IDs are not selectable).
   */
  filterIndicesByGroup(indices, referenceGroupId) {
    const identityProvider = this.options.identityProvider;
    if (!identityProvider?.getGroupId) {
      return indices;
    }
    if (referenceGroupId === NotSelectableGroupId) {
      return [];
    }
    return indices.filter((index) => {
      const element = this.element(index);
      const groupId = identityProvider.getGroupId(element);
      return groupId === referenceGroupId;
    });
  }
  setFocus(indexes, browserEvent) {
    for (const index of indexes) {
      if (index < 0 || index >= this.length) {
        throw new ListError(this.user, `Invalid index ${index}`);
      }
    }
    this.focus.set(indexes, browserEvent);
  }
  focusNext(n = 1, loop = false, browserEvent, filter) {
    if (this.length === 0) {
      return;
    }
    const focus = this.focus.get();
    const index = this.findNextIndex(focus.length > 0 ? focus[0] + n : 0, loop, filter);
    if (index > -1) {
      this.setFocus([index], browserEvent);
    }
  }
  focusPrevious(n = 1, loop = false, browserEvent, filter) {
    if (this.length === 0) {
      return;
    }
    const focus = this.focus.get();
    const index = this.findPreviousIndex(focus.length > 0 ? focus[0] - n : 0, loop, filter);
    if (index > -1) {
      this.setFocus([index], browserEvent);
    }
  }
  async focusNextPage(browserEvent, filter) {
    let lastPageIndex = this.view.indexAt(this.view.getScrollTop() + this.view.renderHeight);
    lastPageIndex = lastPageIndex === 0 ? 0 : lastPageIndex - 1;
    const currentlyFocusedElementIndex = this.getFocus()[0];
    if (currentlyFocusedElementIndex !== lastPageIndex && (currentlyFocusedElementIndex === void 0 || lastPageIndex > currentlyFocusedElementIndex)) {
      const lastGoodPageIndex = this.findPreviousIndex(lastPageIndex, false, filter);
      if (lastGoodPageIndex > -1 && currentlyFocusedElementIndex !== lastGoodPageIndex) {
        this.setFocus([lastGoodPageIndex], browserEvent);
      } else {
        this.setFocus([lastPageIndex], browserEvent);
      }
    } else {
      const previousScrollTop = this.view.getScrollTop();
      let nextpageScrollTop = previousScrollTop + this.view.renderHeight;
      if (lastPageIndex > currentlyFocusedElementIndex) {
        nextpageScrollTop -= this.view.elementHeight(lastPageIndex);
      }
      this.view.setScrollTop(nextpageScrollTop);
      if (this.view.getScrollTop() !== previousScrollTop) {
        this.setFocus([]);
        await timeout(0);
        await this.focusNextPage(browserEvent, filter);
      }
    }
  }
  async focusPreviousPage(browserEvent, filter, getPaddingTop = () => 0) {
    let firstPageIndex;
    const paddingTop = getPaddingTop();
    const scrollTop = this.view.getScrollTop() + paddingTop;
    if (scrollTop === 0) {
      firstPageIndex = this.view.indexAt(scrollTop);
    } else {
      firstPageIndex = this.view.indexAfter(scrollTop - 1);
    }
    const currentlyFocusedElementIndex = this.getFocus()[0];
    if (currentlyFocusedElementIndex !== firstPageIndex && (currentlyFocusedElementIndex === void 0 || currentlyFocusedElementIndex >= firstPageIndex)) {
      const firstGoodPageIndex = this.findNextIndex(firstPageIndex, false, filter);
      if (firstGoodPageIndex > -1 && currentlyFocusedElementIndex !== firstGoodPageIndex) {
        this.setFocus([firstGoodPageIndex], browserEvent);
      } else {
        this.setFocus([firstPageIndex], browserEvent);
      }
    } else {
      const previousScrollTop = scrollTop;
      this.view.setScrollTop(scrollTop - this.view.renderHeight - paddingTop);
      if (this.view.getScrollTop() + getPaddingTop() !== previousScrollTop) {
        this.setFocus([]);
        await timeout(0);
        await this.focusPreviousPage(browserEvent, filter, getPaddingTop);
      }
    }
  }
  focusLast(browserEvent, filter) {
    if (this.length === 0) {
      return;
    }
    const index = this.findPreviousIndex(this.length - 1, false, filter);
    if (index > -1) {
      this.setFocus([index], browserEvent);
    }
  }
  focusFirst(browserEvent, filter) {
    this.focusNth(0, browserEvent, filter);
  }
  focusNth(n, browserEvent, filter) {
    if (this.length === 0) {
      return;
    }
    const index = this.findNextIndex(n, false, filter);
    if (index > -1) {
      this.setFocus([index], browserEvent);
    }
  }
  findNextIndex(index, loop = false, filter) {
    for (let i = 0; i < this.length; i++) {
      if (index >= this.length && !loop) {
        return -1;
      }
      index = index % this.length;
      if (!filter || filter(this.element(index))) {
        return index;
      }
      index++;
    }
    return -1;
  }
  findPreviousIndex(index, loop = false, filter) {
    for (let i = 0; i < this.length; i++) {
      if (index < 0 && !loop) {
        return -1;
      }
      index = (this.length + index % this.length) % this.length;
      if (!filter || filter(this.element(index))) {
        return index;
      }
      index--;
    }
    return -1;
  }
  getFocus() {
    return this.focus.get();
  }
  getFocusedElements() {
    return this.getFocus().map((i) => this.view.element(i));
  }
  reveal(index, relativeTop, paddingTop = 0) {
    if (index < 0 || index >= this.length) {
      throw new ListError(this.user, `Invalid index ${index}`);
    }
    const scrollTop = this.view.getScrollTop();
    const elementTop = this.view.elementTop(index);
    const elementHeight = this.view.elementHeight(index);
    if (isNumber(relativeTop)) {
      const m = elementHeight - this.view.renderHeight + paddingTop;
      this.view.setScrollTop(m * clamp(relativeTop, 0, 1) + elementTop - paddingTop);
    } else {
      const viewItemBottom = elementTop + elementHeight;
      const scrollBottom = scrollTop + this.view.renderHeight;
      if (elementTop < scrollTop + paddingTop && viewItemBottom >= scrollBottom) {
      } else if (elementTop < scrollTop + paddingTop || viewItemBottom >= scrollBottom && elementHeight >= this.view.renderHeight) {
        this.view.setScrollTop(elementTop - paddingTop);
      } else if (viewItemBottom >= scrollBottom) {
        this.view.setScrollTop(viewItemBottom - this.view.renderHeight);
      }
    }
  }
  /**
   * Returns the relative position of an element rendered in the list.
   * Returns `null` if the element isn't *entirely* in the visible viewport.
   */
  getRelativeTop(index, paddingTop = 0) {
    if (index < 0 || index >= this.length) {
      throw new ListError(this.user, `Invalid index ${index}`);
    }
    const scrollTop = this.view.getScrollTop();
    const elementTop = this.view.elementTop(index);
    const elementHeight = this.view.elementHeight(index);
    if (elementTop < scrollTop + paddingTop || elementTop + elementHeight > scrollTop + this.view.renderHeight) {
      return null;
    }
    const m = elementHeight - this.view.renderHeight + paddingTop;
    return Math.abs((scrollTop + paddingTop - elementTop) / m);
  }
  isDOMFocused() {
    return isActiveElement(this.view.domNode);
  }
  getHTMLElement() {
    return this.view.domNode;
  }
  getScrollableElement() {
    return this.view.scrollableElementDomNode;
  }
  getElementID(index) {
    return this.view.getElementDomId(index);
  }
  getElementTop(index) {
    return this.view.elementTop(index);
  }
  style(styles) {
    this.styleController.style(styles);
  }
  delegateScrollFromMouseWheelEvent(browserEvent) {
    this.view.delegateScrollFromMouseWheelEvent(browserEvent);
  }
  toListEvent({ indexes, browserEvent }) {
    return { indexes, elements: indexes.map((i) => this.view.element(i)), browserEvent };
  }
  _onFocusChange() {
    const focus = this.focus.get();
    this.view.domNode.classList.toggle("element-focused", focus.length > 0);
    this.onDidChangeActiveDescendant();
  }
  onDidChangeActiveDescendant() {
    const focus = this.focus.get();
    if (focus.length > 0) {
      let id;
      if (this.accessibilityProvider?.getActiveDescendantId) {
        id = this.accessibilityProvider.getActiveDescendantId(this.view.element(focus[0]));
      }
      this.view.domNode.setAttribute("aria-activedescendant", id || this.view.getElementDomId(focus[0]));
    } else {
      this.view.domNode.removeAttribute("aria-activedescendant");
    }
  }
  _onSelectionChange() {
    const selection = this.selection.get();
    this.view.domNode.classList.toggle("selection-none", selection.length === 0);
    this.view.domNode.classList.toggle("selection-single", selection.length === 1);
    this.view.domNode.classList.toggle("selection-multiple", selection.length > 1);
  }
  dispose() {
    this._onDidDispose.fire();
    this.disposables.dispose();
    this._onDidDispose.dispose();
  }
}
__decorateClass([
  memoize
], List.prototype, "onDidChangeFocus", 1);
__decorateClass([
  memoize
], List.prototype, "onDidChangeSelection", 1);
__decorateClass([
  memoize
], List.prototype, "onContextMenu", 1);
__decorateClass([
  memoize
], List.prototype, "onKeyDown", 1);
__decorateClass([
  memoize
], List.prototype, "onKeyUp", 1);
__decorateClass([
  memoize
], List.prototype, "onKeyPress", 1);
__decorateClass([
  memoize
], List.prototype, "onDidFocus", 1);
__decorateClass([
  memoize
], List.prototype, "onDidBlur", 1);
export {
  DefaultKeyboardNavigationDelegate,
  DefaultStyleController,
  List,
  MouseController,
  TypeNavigationMode,
  isActionItem,
  isButton,
  isMonacoCustomToggle,
  isMonacoEditor,
  isMonacoTwistie,
  isSelectionRangeChangeEvent,
  isSelectionSingleChangeEvent,
  isStickyScrollContainer,
  isStickyScrollElement,
  unthemedListStyles
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxiYXNlXFxicm93c2VyXFx1aVxcbGlzdFxcbGlzdFdpZGdldC50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB7IElEcmFnQW5kRHJvcERhdGEgfSBmcm9tICcuLi8uLi9kbmQuanMnO1xuaW1wb3J0IHsgRGltZW5zaW9uLCBFdmVudEhlbHBlciwgZ2V0QWN0aXZlRWxlbWVudCwgZ2V0V2luZG93LCBpc0FjdGl2ZUVsZW1lbnQsIGlzRWRpdGFibGVFbGVtZW50LCBpc0hUTUxFbGVtZW50LCBpc01vdXNlRXZlbnQgfSBmcm9tICcuLi8uLi9kb20uanMnO1xuaW1wb3J0IHsgY3JlYXRlU3R5bGVTaGVldCB9IGZyb20gJy4uLy4uL2RvbVN0eWxlc2hlZXRzLmpzJztcbmltcG9ydCB7IGFzQ3NzVmFsdWVXaXRoRGVmYXVsdCB9IGZyb20gJy4uLy4uL2Nzc1ZhbHVlLmpzJztcbmltcG9ydCB7IERvbUVtaXR0ZXIgfSBmcm9tICcuLi8uLi9ldmVudC5qcyc7XG5pbXBvcnQgeyBJS2V5Ym9hcmRFdmVudCwgU3RhbmRhcmRLZXlib2FyZEV2ZW50IH0gZnJvbSAnLi4vLi4va2V5Ym9hcmRFdmVudC5qcyc7XG5pbXBvcnQgeyBHZXN0dXJlIH0gZnJvbSAnLi4vLi4vdG91Y2guanMnO1xuaW1wb3J0IHsgYWxlcnQsIEFyaWFSb2xlIH0gZnJvbSAnLi4vYXJpYS9hcmlhLmpzJztcbmltcG9ydCB7IENvbWJpbmVkU3BsaWNlYWJsZSB9IGZyb20gJy4vc3BsaWNlLmpzJztcbmltcG9ydCB7IFNjcm9sbGFibGVFbGVtZW50Q2hhbmdlT3B0aW9ucyB9IGZyb20gJy4uL3Njcm9sbGJhci9zY3JvbGxhYmxlRWxlbWVudE9wdGlvbnMuanMnO1xuaW1wb3J0IHsgYmluYXJ5U2VhcmNoLCByYW5nZSB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9hcnJheXMuanMnO1xuaW1wb3J0IHsgdGltZW91dCB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9hc3luYy5qcyc7XG5pbXBvcnQgeyBDb2xvciB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9jb2xvci5qcyc7XG5pbXBvcnQgeyBtZW1vaXplIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2RlY29yYXRvcnMuanMnO1xuaW1wb3J0IHsgRW1pdHRlciwgRXZlbnQsIEV2ZW50QnVmZmVyZXIgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vZXZlbnQuanMnO1xuaW1wb3J0IHsgbWF0Y2hlc0Z1enp5MiwgbWF0Y2hlc1ByZWZpeCB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9maWx0ZXJzLmpzJztcbmltcG9ydCB7IEtleUNvZGUgfSBmcm9tICcuLi8uLi8uLi9jb21tb24va2V5Q29kZXMuanMnO1xuaW1wb3J0IHsgRGlzcG9zYWJsZVN0b3JlLCBkaXNwb3NlLCBJRGlzcG9zYWJsZSB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgY2xhbXAgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vbnVtYmVycy5qcyc7XG5pbXBvcnQgKiBhcyBwbGF0Zm9ybSBmcm9tICcuLi8uLi8uLi9jb21tb24vcGxhdGZvcm0uanMnO1xuaW1wb3J0IHsgU2Nyb2xsYmFyVmlzaWJpbGl0eSwgU2Nyb2xsRXZlbnQgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vc2Nyb2xsYWJsZS5qcyc7XG5pbXBvcnQgeyBJU3BsaWNlYWJsZSB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9zZXF1ZW5jZS5qcyc7XG5pbXBvcnQgeyBpc051bWJlciB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi90eXBlcy5qcyc7XG5pbXBvcnQgJy4vbGlzdC5jc3MnO1xuaW1wb3J0IHsgSUlkZW50aXR5UHJvdmlkZXIsIElLZXlib2FyZE5hdmlnYXRpb25EZWxlZ2F0ZSwgSUtleWJvYXJkTmF2aWdhdGlvbkxhYmVsUHJvdmlkZXIsIElMaXN0Q29udGV4dE1lbnVFdmVudCwgSUxpc3REcmFnQW5kRHJvcCwgSUxpc3REcmFnT3ZlclJlYWN0aW9uLCBJTGlzdEV2ZW50LCBJTGlzdEdlc3R1cmVFdmVudCwgSUxpc3RNb3VzZUV2ZW50LCBJTGlzdEVsZW1lbnRSZW5kZXJEZXRhaWxzLCBJTGlzdFJlbmRlcmVyLCBJTGlzdFRvdWNoRXZlbnQsIElMaXN0VmlydHVhbERlbGVnYXRlLCBMaXN0RXJyb3IsIE5vdFNlbGVjdGFibGVHcm91cElkLCBOb3RTZWxlY3RhYmxlR3JvdXBJZFR5cGUgfSBmcm9tICcuL2xpc3QuanMnO1xuaW1wb3J0IHsgSUxpc3RWaWV3LCBJTGlzdFZpZXdBY2Nlc3NpYmlsaXR5UHJvdmlkZXIsIElMaXN0Vmlld0RyYWdBbmREcm9wLCBJTGlzdFZpZXdPcHRpb25zLCBJTGlzdFZpZXdPcHRpb25zVXBkYXRlLCBMaXN0Vmlld1RhcmdldFNlY3RvciwgTGlzdFZpZXcgfSBmcm9tICcuL2xpc3RWaWV3LmpzJztcbmltcG9ydCB7IElNb3VzZVdoZWVsRXZlbnQsIFN0YW5kYXJkTW91c2VFdmVudCB9IGZyb20gJy4uLy4uL21vdXNlRXZlbnQuanMnO1xuaW1wb3J0IHsgYXV0b3J1biwgY29uc3RPYnNlcnZhYmxlLCBJT2JzZXJ2YWJsZSB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9vYnNlcnZhYmxlLmpzJztcblxuaW50ZXJmYWNlIElUcmFpdENoYW5nZUV2ZW50IHtcblx0aW5kZXhlczogbnVtYmVyW107XG5cdGJyb3dzZXJFdmVudD86IFVJRXZlbnQ7XG59XG5cbnR5cGUgSVRyYWl0VGVtcGxhdGVEYXRhID0gSFRNTEVsZW1lbnQ7XG5cbnR5cGUgSUFjY2Vzc2liaWxpdHlUZW1wbGF0ZURhdGEgPSB7XG5cdGNvbnRhaW5lcjogSFRNTEVsZW1lbnQ7XG5cdGRpc3Bvc2FibGVzOiBEaXNwb3NhYmxlU3RvcmU7XG59O1xuXG5pbnRlcmZhY2UgSVJlbmRlcmVkQ29udGFpbmVyIHtcblx0dGVtcGxhdGVEYXRhOiBJVHJhaXRUZW1wbGF0ZURhdGE7XG5cdGluZGV4OiBudW1iZXI7XG59XG5cbmNsYXNzIFRyYWl0UmVuZGVyZXI8VD4gaW1wbGVtZW50cyBJTGlzdFJlbmRlcmVyPFQsIElUcmFpdFRlbXBsYXRlRGF0YT4ge1xuXHRwcml2YXRlIHJlbmRlcmVkRWxlbWVudHM6IElSZW5kZXJlZENvbnRhaW5lcltdID0gW107XG5cblx0Y29uc3RydWN0b3IocHJpdmF0ZSB0cmFpdDogVHJhaXQ8VD4pIHsgfVxuXG5cdGdldCB0ZW1wbGF0ZUlkKCk6IHN0cmluZyB7XG5cdFx0cmV0dXJuIGB0ZW1wbGF0ZToke3RoaXMudHJhaXQubmFtZX1gO1xuXHR9XG5cblx0cmVuZGVyVGVtcGxhdGUoY29udGFpbmVyOiBIVE1MRWxlbWVudCk6IElUcmFpdFRlbXBsYXRlRGF0YSB7XG5cdFx0cmV0dXJuIGNvbnRhaW5lcjtcblx0fVxuXG5cdHJlbmRlckVsZW1lbnQoZWxlbWVudDogVCwgaW5kZXg6IG51bWJlciwgdGVtcGxhdGVEYXRhOiBJVHJhaXRUZW1wbGF0ZURhdGEpOiB2b2lkIHtcblx0XHRjb25zdCByZW5kZXJlZEVsZW1lbnRJbmRleCA9IHRoaXMucmVuZGVyZWRFbGVtZW50cy5maW5kSW5kZXgoZWwgPT4gZWwudGVtcGxhdGVEYXRhID09PSB0ZW1wbGF0ZURhdGEpO1xuXG5cdFx0aWYgKHJlbmRlcmVkRWxlbWVudEluZGV4ID49IDApIHtcblx0XHRcdGNvbnN0IHJlbmRlcmVkID0gdGhpcy5yZW5kZXJlZEVsZW1lbnRzW3JlbmRlcmVkRWxlbWVudEluZGV4XTtcblx0XHRcdHRoaXMudHJhaXQudW5yZW5kZXIodGVtcGxhdGVEYXRhKTtcblx0XHRcdHJlbmRlcmVkLmluZGV4ID0gaW5kZXg7XG5cdFx0fSBlbHNlIHtcblx0XHRcdGNvbnN0IHJlbmRlcmVkID0geyBpbmRleCwgdGVtcGxhdGVEYXRhIH07XG5cdFx0XHR0aGlzLnJlbmRlcmVkRWxlbWVudHMucHVzaChyZW5kZXJlZCk7XG5cdFx0fVxuXG5cdFx0dGhpcy50cmFpdC5yZW5kZXJJbmRleChpbmRleCwgdGVtcGxhdGVEYXRhKTtcblx0fVxuXG5cdHNwbGljZShzdGFydDogbnVtYmVyLCBkZWxldGVDb3VudDogbnVtYmVyLCBpbnNlcnRDb3VudDogbnVtYmVyKTogdm9pZCB7XG5cdFx0Y29uc3QgcmVuZGVyZWQ6IElSZW5kZXJlZENvbnRhaW5lcltdID0gW107XG5cblx0XHRmb3IgKGNvbnN0IHJlbmRlcmVkRWxlbWVudCBvZiB0aGlzLnJlbmRlcmVkRWxlbWVudHMpIHtcblxuXHRcdFx0aWYgKHJlbmRlcmVkRWxlbWVudC5pbmRleCA8IHN0YXJ0KSB7XG5cdFx0XHRcdHJlbmRlcmVkLnB1c2gocmVuZGVyZWRFbGVtZW50KTtcblx0XHRcdH0gZWxzZSBpZiAocmVuZGVyZWRFbGVtZW50LmluZGV4ID49IHN0YXJ0ICsgZGVsZXRlQ291bnQpIHtcblx0XHRcdFx0cmVuZGVyZWQucHVzaCh7XG5cdFx0XHRcdFx0aW5kZXg6IHJlbmRlcmVkRWxlbWVudC5pbmRleCArIGluc2VydENvdW50IC0gZGVsZXRlQ291bnQsXG5cdFx0XHRcdFx0dGVtcGxhdGVEYXRhOiByZW5kZXJlZEVsZW1lbnQudGVtcGxhdGVEYXRhXG5cdFx0XHRcdH0pO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdHRoaXMucmVuZGVyZWRFbGVtZW50cyA9IHJlbmRlcmVkO1xuXHR9XG5cblx0cmVuZGVySW5kZXhlcyhpbmRleGVzOiBudW1iZXJbXSk6IHZvaWQge1xuXHRcdGZvciAoY29uc3QgeyBpbmRleCwgdGVtcGxhdGVEYXRhIH0gb2YgdGhpcy5yZW5kZXJlZEVsZW1lbnRzKSB7XG5cdFx0XHRpZiAoaW5kZXhlcy5pbmRleE9mKGluZGV4KSA+IC0xKSB7XG5cdFx0XHRcdHRoaXMudHJhaXQucmVuZGVySW5kZXgoaW5kZXgsIHRlbXBsYXRlRGF0YSk7XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG5cblx0ZGlzcG9zZVRlbXBsYXRlKHRlbXBsYXRlRGF0YTogSVRyYWl0VGVtcGxhdGVEYXRhKTogdm9pZCB7XG5cdFx0Y29uc3QgaW5kZXggPSB0aGlzLnJlbmRlcmVkRWxlbWVudHMuZmluZEluZGV4KGVsID0+IGVsLnRlbXBsYXRlRGF0YSA9PT0gdGVtcGxhdGVEYXRhKTtcblxuXHRcdGlmIChpbmRleCA8IDApIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHR0aGlzLnJlbmRlcmVkRWxlbWVudHMuc3BsaWNlKGluZGV4LCAxKTtcblx0fVxufVxuXG5jbGFzcyBUcmFpdDxUPiBpbXBsZW1lbnRzIElTcGxpY2VhYmxlPGJvb2xlYW4+LCBJRGlzcG9zYWJsZSB7XG5cblx0cHJvdGVjdGVkIGluZGV4ZXM6IG51bWJlcltdID0gW107XG5cdHByb3RlY3RlZCBzb3J0ZWRJbmRleGVzOiBudW1iZXJbXSA9IFtdO1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX29uQ2hhbmdlID0gbmV3IEVtaXR0ZXI8SVRyYWl0Q2hhbmdlRXZlbnQ+KCk7XG5cdGdldCBvbkNoYW5nZSgpOiBFdmVudDxJVHJhaXRDaGFuZ2VFdmVudD4geyByZXR1cm4gdGhpcy5fb25DaGFuZ2UuZXZlbnQ7IH1cblxuXHRnZXQgbmFtZSgpOiBzdHJpbmcgeyByZXR1cm4gdGhpcy5fdHJhaXQ7IH1cblxuXHRAbWVtb2l6ZVxuXHRnZXQgcmVuZGVyZXIoKTogVHJhaXRSZW5kZXJlcjxUPiB7XG5cdFx0cmV0dXJuIG5ldyBUcmFpdFJlbmRlcmVyPFQ+KHRoaXMpO1xuXHR9XG5cblx0Y29uc3RydWN0b3IocHJpdmF0ZSBfdHJhaXQ6IHN0cmluZykgeyB9XG5cblx0c3BsaWNlKHN0YXJ0OiBudW1iZXIsIGRlbGV0ZUNvdW50OiBudW1iZXIsIGVsZW1lbnRzOiBib29sZWFuW10pOiB2b2lkIHtcblx0XHRjb25zdCBkaWZmID0gZWxlbWVudHMubGVuZ3RoIC0gZGVsZXRlQ291bnQ7XG5cdFx0Y29uc3QgZW5kID0gc3RhcnQgKyBkZWxldGVDb3VudDtcblx0XHRjb25zdCBzb3J0ZWRJbmRleGVzOiBudW1iZXJbXSA9IFtdO1xuXHRcdGxldCBpID0gMDtcblxuXHRcdHdoaWxlIChpIDwgdGhpcy5zb3J0ZWRJbmRleGVzLmxlbmd0aCAmJiB0aGlzLnNvcnRlZEluZGV4ZXNbaV0gPCBzdGFydCkge1xuXHRcdFx0c29ydGVkSW5kZXhlcy5wdXNoKHRoaXMuc29ydGVkSW5kZXhlc1tpKytdKTtcblx0XHR9XG5cblx0XHRmb3IgKGxldCBqID0gMDsgaiA8IGVsZW1lbnRzLmxlbmd0aDsgaisrKSB7XG5cdFx0XHRpZiAoZWxlbWVudHNbal0pIHtcblx0XHRcdFx0c29ydGVkSW5kZXhlcy5wdXNoKGogKyBzdGFydCk7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0d2hpbGUgKGkgPCB0aGlzLnNvcnRlZEluZGV4ZXMubGVuZ3RoICYmIHRoaXMuc29ydGVkSW5kZXhlc1tpXSA+PSBlbmQpIHtcblx0XHRcdHNvcnRlZEluZGV4ZXMucHVzaCh0aGlzLnNvcnRlZEluZGV4ZXNbaSsrXSArIGRpZmYpO1xuXHRcdH1cblxuXHRcdHRoaXMucmVuZGVyZXIuc3BsaWNlKHN0YXJ0LCBkZWxldGVDb3VudCwgZWxlbWVudHMubGVuZ3RoKTtcblx0XHR0aGlzLl9zZXQoc29ydGVkSW5kZXhlcywgc29ydGVkSW5kZXhlcyk7XG5cdH1cblxuXHRyZW5kZXJJbmRleChpbmRleDogbnVtYmVyLCBjb250YWluZXI6IEhUTUxFbGVtZW50KTogdm9pZCB7XG5cdFx0Y29udGFpbmVyLmNsYXNzTGlzdC50b2dnbGUodGhpcy5fdHJhaXQsIHRoaXMuY29udGFpbnMoaW5kZXgpKTtcblx0fVxuXG5cdHVucmVuZGVyKGNvbnRhaW5lcjogSFRNTEVsZW1lbnQpOiB2b2lkIHtcblx0XHRjb250YWluZXIuY2xhc3NMaXN0LnJlbW92ZSh0aGlzLl90cmFpdCk7XG5cdH1cblxuXHQvKipcblx0ICogU2V0cyB0aGUgaW5kZXhlcyB3aGljaCBzaG91bGQgaGF2ZSB0aGlzIHRyYWl0LlxuXHQgKlxuXHQgKiBAcGFyYW0gaW5kZXhlcyBJbmRleGVzIHdoaWNoIHNob3VsZCBoYXZlIHRoaXMgdHJhaXQuXG5cdCAqIEByZXR1cm4gVGhlIG9sZCBpbmRleGVzIHdoaWNoIGhhZCB0aGlzIHRyYWl0LlxuXHQgKi9cblx0c2V0KGluZGV4ZXM6IG51bWJlcltdLCBicm93c2VyRXZlbnQ/OiBVSUV2ZW50KTogbnVtYmVyW10ge1xuXHRcdHJldHVybiB0aGlzLl9zZXQoaW5kZXhlcywgWy4uLmluZGV4ZXNdLnNvcnQobnVtZXJpY1NvcnQpLCBicm93c2VyRXZlbnQpO1xuXHR9XG5cblx0cHJpdmF0ZSBfc2V0KGluZGV4ZXM6IG51bWJlcltdLCBzb3J0ZWRJbmRleGVzOiBudW1iZXJbXSwgYnJvd3NlckV2ZW50PzogVUlFdmVudCk6IG51bWJlcltdIHtcblx0XHRjb25zdCByZXN1bHQgPSB0aGlzLmluZGV4ZXM7XG5cdFx0Y29uc3Qgc29ydGVkUmVzdWx0ID0gdGhpcy5zb3J0ZWRJbmRleGVzO1xuXG5cdFx0dGhpcy5pbmRleGVzID0gaW5kZXhlcztcblx0XHR0aGlzLnNvcnRlZEluZGV4ZXMgPSBzb3J0ZWRJbmRleGVzO1xuXG5cdFx0Y29uc3QgdG9SZW5kZXIgPSBkaXNqdW5jdGlvbihzb3J0ZWRSZXN1bHQsIGluZGV4ZXMpO1xuXHRcdHRoaXMucmVuZGVyZXIucmVuZGVySW5kZXhlcyh0b1JlbmRlcik7XG5cblx0XHR0aGlzLl9vbkNoYW5nZS5maXJlKHsgaW5kZXhlcywgYnJvd3NlckV2ZW50IH0pO1xuXHRcdHJldHVybiByZXN1bHQ7XG5cdH1cblxuXHRnZXQoKTogbnVtYmVyW10ge1xuXHRcdHJldHVybiB0aGlzLmluZGV4ZXM7XG5cdH1cblxuXHRjb250YWlucyhpbmRleDogbnVtYmVyKTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuIGJpbmFyeVNlYXJjaCh0aGlzLnNvcnRlZEluZGV4ZXMsIGluZGV4LCBudW1lcmljU29ydCkgPj0gMDtcblx0fVxuXG5cdGRpc3Bvc2UoKSB7XG5cdFx0ZGlzcG9zZSh0aGlzLl9vbkNoYW5nZSk7XG5cdH1cbn1cblxuY2xhc3MgU2VsZWN0aW9uVHJhaXQ8VD4gZXh0ZW5kcyBUcmFpdDxUPiB7XG5cblx0Y29uc3RydWN0b3IocHJpdmF0ZSBzZXRBcmlhU2VsZWN0ZWQ6IGJvb2xlYW4pIHtcblx0XHRzdXBlcignc2VsZWN0ZWQnKTtcblx0fVxuXG5cdG92ZXJyaWRlIHJlbmRlckluZGV4KGluZGV4OiBudW1iZXIsIGNvbnRhaW5lcjogSFRNTEVsZW1lbnQpOiB2b2lkIHtcblx0XHRzdXBlci5yZW5kZXJJbmRleChpbmRleCwgY29udGFpbmVyKTtcblxuXHRcdGlmICh0aGlzLnNldEFyaWFTZWxlY3RlZCkge1xuXHRcdFx0aWYgKHRoaXMuY29udGFpbnMoaW5kZXgpKSB7XG5cdFx0XHRcdGNvbnRhaW5lci5zZXRBdHRyaWJ1dGUoJ2FyaWEtc2VsZWN0ZWQnLCAndHJ1ZScpO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0Y29udGFpbmVyLnNldEF0dHJpYnV0ZSgnYXJpYS1zZWxlY3RlZCcsICdmYWxzZScpO1xuXHRcdFx0fVxuXHRcdH1cblx0fVxufVxuXG4vKipcbiAqIFRoZSBUcmFpdFNwbGljZWFibGUgaXMgdXNlZCBhcyBhIHV0aWwgY2xhc3MgdG8gYmUgYWJsZVxuICogdG8gcHJlc2VydmUgdHJhaXRzIGFjcm9zcyBzcGxpY2UgY2FsbHMsIGdpdmVuIGFuIGlkZW50aXR5XG4gKiBwcm92aWRlci5cbiAqL1xuY2xhc3MgVHJhaXRTcGxpY2VhYmxlPFQ+IGltcGxlbWVudHMgSVNwbGljZWFibGU8VD4ge1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdHByaXZhdGUgdHJhaXQ6IFRyYWl0PFQ+LFxuXHRcdHByaXZhdGUgdmlldzogSUxpc3RWaWV3PFQ+LFxuXHRcdHByaXZhdGUgaWRlbnRpdHlQcm92aWRlcj86IElJZGVudGl0eVByb3ZpZGVyPFQ+XG5cdCkgeyB9XG5cblx0c3BsaWNlKHN0YXJ0OiBudW1iZXIsIGRlbGV0ZUNvdW50OiBudW1iZXIsIGVsZW1lbnRzOiBUW10pOiB2b2lkIHtcblx0XHRpZiAoIXRoaXMuaWRlbnRpdHlQcm92aWRlcikge1xuXHRcdFx0cmV0dXJuIHRoaXMudHJhaXQuc3BsaWNlKHN0YXJ0LCBkZWxldGVDb3VudCwgbmV3IEFycmF5KGVsZW1lbnRzLmxlbmd0aCkuZmlsbChmYWxzZSkpO1xuXHRcdH1cblxuXHRcdGNvbnN0IHBhc3RFbGVtZW50c1dpdGhUcmFpdCA9IHRoaXMudHJhaXQuZ2V0KCkubWFwKGkgPT4gdGhpcy5pZGVudGl0eVByb3ZpZGVyIS5nZXRJZCh0aGlzLnZpZXcuZWxlbWVudChpKSkudG9TdHJpbmcoKSk7XG5cdFx0aWYgKHBhc3RFbGVtZW50c1dpdGhUcmFpdC5sZW5ndGggPT09IDApIHtcblx0XHRcdHJldHVybiB0aGlzLnRyYWl0LnNwbGljZShzdGFydCwgZGVsZXRlQ291bnQsIG5ldyBBcnJheShlbGVtZW50cy5sZW5ndGgpLmZpbGwoZmFsc2UpKTtcblx0XHR9XG5cblx0XHRjb25zdCBwYXN0RWxlbWVudHNXaXRoVHJhaXRTZXQgPSBuZXcgU2V0KHBhc3RFbGVtZW50c1dpdGhUcmFpdCk7XG5cdFx0Y29uc3QgZWxlbWVudHNXaXRoVHJhaXQgPSBlbGVtZW50cy5tYXAoZSA9PiBwYXN0RWxlbWVudHNXaXRoVHJhaXRTZXQuaGFzKHRoaXMuaWRlbnRpdHlQcm92aWRlciEuZ2V0SWQoZSkudG9TdHJpbmcoKSkpO1xuXHRcdHRoaXMudHJhaXQuc3BsaWNlKHN0YXJ0LCBkZWxldGVDb3VudCwgZWxlbWVudHNXaXRoVHJhaXQpO1xuXHR9XG59XG5cbmZ1bmN0aW9uIGlzTGlzdEVsZW1lbnREZXNjZW5kYW50T2ZDbGFzcyhlOiBIVE1MRWxlbWVudCwgY2xhc3NOYW1lOiBzdHJpbmcpOiBib29sZWFuIHtcblx0aWYgKGUuY2xhc3NMaXN0LmNvbnRhaW5zKGNsYXNzTmFtZSkpIHtcblx0XHRyZXR1cm4gdHJ1ZTtcblx0fVxuXG5cdGlmIChlLmNsYXNzTGlzdC5jb250YWlucygnbW9uYWNvLWxpc3QnKSkge1xuXHRcdHJldHVybiBmYWxzZTtcblx0fVxuXG5cdGlmICghZS5wYXJlbnRFbGVtZW50KSB7XG5cdFx0cmV0dXJuIGZhbHNlO1xuXHR9XG5cblx0cmV0dXJuIGlzTGlzdEVsZW1lbnREZXNjZW5kYW50T2ZDbGFzcyhlLnBhcmVudEVsZW1lbnQsIGNsYXNzTmFtZSk7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBpc01vbmFjb0VkaXRvcihlOiBIVE1MRWxlbWVudCk6IGJvb2xlYW4ge1xuXHRyZXR1cm4gaXNMaXN0RWxlbWVudERlc2NlbmRhbnRPZkNsYXNzKGUsICdtb25hY28tZWRpdG9yJyk7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBpc01vbmFjb0N1c3RvbVRvZ2dsZShlOiBIVE1MRWxlbWVudCk6IGJvb2xlYW4ge1xuXHRyZXR1cm4gaXNMaXN0RWxlbWVudERlc2NlbmRhbnRPZkNsYXNzKGUsICdtb25hY28tY3VzdG9tLXRvZ2dsZScpO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gaXNBY3Rpb25JdGVtKGU6IEhUTUxFbGVtZW50KTogYm9vbGVhbiB7XG5cdHJldHVybiBpc0xpc3RFbGVtZW50RGVzY2VuZGFudE9mQ2xhc3MoZSwgJ2FjdGlvbi1pdGVtJyk7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBpc01vbmFjb1R3aXN0aWUoZTogSFRNTEVsZW1lbnQpOiBib29sZWFuIHtcblx0cmV0dXJuIGlzTGlzdEVsZW1lbnREZXNjZW5kYW50T2ZDbGFzcyhlLCAnbW9uYWNvLXRsLXR3aXN0aWUnKTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGlzU3RpY2t5U2Nyb2xsRWxlbWVudChlOiBIVE1MRWxlbWVudCk6IGJvb2xlYW4ge1xuXHRyZXR1cm4gaXNMaXN0RWxlbWVudERlc2NlbmRhbnRPZkNsYXNzKGUsICdtb25hY28tdHJlZS1zdGlja3ktcm93Jyk7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBpc1N0aWNreVNjcm9sbENvbnRhaW5lcihlOiBIVE1MRWxlbWVudCk6IGJvb2xlYW4ge1xuXHRyZXR1cm4gZS5jbGFzc0xpc3QuY29udGFpbnMoJ21vbmFjby10cmVlLXN0aWNreS1jb250YWluZXInKTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGlzQnV0dG9uKGU6IEhUTUxFbGVtZW50KTogYm9vbGVhbiB7XG5cdGlmICgoZS50YWdOYW1lID09PSAnQScgJiYgZS5jbGFzc0xpc3QuY29udGFpbnMoJ21vbmFjby1idXR0b24nKSkgfHxcblx0XHQoZS50YWdOYW1lID09PSAnRElWJyAmJiBlLmNsYXNzTGlzdC5jb250YWlucygnbW9uYWNvLWJ1dHRvbi1kcm9wZG93bicpKSkge1xuXHRcdHJldHVybiB0cnVlO1xuXHR9XG5cblx0aWYgKGUuY2xhc3NMaXN0LmNvbnRhaW5zKCdtb25hY28tbGlzdCcpKSB7XG5cdFx0cmV0dXJuIGZhbHNlO1xuXHR9XG5cblx0aWYgKCFlLnBhcmVudEVsZW1lbnQpIHtcblx0XHRyZXR1cm4gZmFsc2U7XG5cdH1cblxuXHRyZXR1cm4gaXNCdXR0b24oZS5wYXJlbnRFbGVtZW50KTtcbn1cblxuY2xhc3MgS2V5Ym9hcmRDb250cm9sbGVyPFQ+IGltcGxlbWVudHMgSURpc3Bvc2FibGUge1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgZGlzcG9zYWJsZXMgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cdHByaXZhdGUgcmVhZG9ubHkgbXVsdGlwbGVTZWxlY3Rpb25EaXNwb3NhYmxlcyA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblx0cHJpdmF0ZSBtdWx0aXBsZVNlbGVjdGlvblN1cHBvcnQ6IGJvb2xlYW4gfCB1bmRlZmluZWQ7XG5cblx0QG1lbW9pemVcblx0cHJpdmF0ZSBnZXQgb25LZXlEb3duKCk6IEV2ZW50PFN0YW5kYXJkS2V5Ym9hcmRFdmVudD4ge1xuXHRcdHJldHVybiBFdmVudC5jaGFpbihcblx0XHRcdHRoaXMuZGlzcG9zYWJsZXMuYWRkKG5ldyBEb21FbWl0dGVyKHRoaXMudmlldy5kb21Ob2RlLCAna2V5ZG93bicpKS5ldmVudCwgJCA9PlxuXHRcdFx0JC5maWx0ZXIoZSA9PiAhaXNFZGl0YWJsZUVsZW1lbnQoZS50YXJnZXQgYXMgSFRNTEVsZW1lbnQpKVxuXHRcdFx0XHQubWFwKGUgPT4gbmV3IFN0YW5kYXJkS2V5Ym9hcmRFdmVudChlKSlcblx0XHQpO1xuXHR9XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0cHJpdmF0ZSBsaXN0OiBMaXN0PFQ+LFxuXHRcdHByaXZhdGUgdmlldzogSUxpc3RWaWV3PFQ+LFxuXHRcdG9wdGlvbnM6IElMaXN0T3B0aW9uczxUPlxuXHQpIHtcblx0XHR0aGlzLm11bHRpcGxlU2VsZWN0aW9uU3VwcG9ydCA9IG9wdGlvbnMubXVsdGlwbGVTZWxlY3Rpb25TdXBwb3J0O1xuXHRcdHRoaXMuZGlzcG9zYWJsZXMuYWRkKHRoaXMub25LZXlEb3duKGUgPT4ge1xuXHRcdFx0c3dpdGNoIChlLmtleUNvZGUpIHtcblx0XHRcdFx0Y2FzZSBLZXlDb2RlLkVudGVyOlxuXHRcdFx0XHRcdHJldHVybiB0aGlzLm9uRW50ZXIoZSk7XG5cdFx0XHRcdGNhc2UgS2V5Q29kZS5VcEFycm93OlxuXHRcdFx0XHRcdHJldHVybiB0aGlzLm9uVXBBcnJvdyhlKTtcblx0XHRcdFx0Y2FzZSBLZXlDb2RlLkRvd25BcnJvdzpcblx0XHRcdFx0XHRyZXR1cm4gdGhpcy5vbkRvd25BcnJvdyhlKTtcblx0XHRcdFx0Y2FzZSBLZXlDb2RlLlBhZ2VVcDpcblx0XHRcdFx0XHRyZXR1cm4gdGhpcy5vblBhZ2VVcEFycm93KGUpO1xuXHRcdFx0XHRjYXNlIEtleUNvZGUuUGFnZURvd246XG5cdFx0XHRcdFx0cmV0dXJuIHRoaXMub25QYWdlRG93bkFycm93KGUpO1xuXHRcdFx0XHRjYXNlIEtleUNvZGUuRXNjYXBlOlxuXHRcdFx0XHRcdHJldHVybiB0aGlzLm9uRXNjYXBlKGUpO1xuXHRcdFx0XHRjYXNlIEtleUNvZGUuS2V5QTpcblx0XHRcdFx0XHRpZiAodGhpcy5tdWx0aXBsZVNlbGVjdGlvblN1cHBvcnQgJiYgKHBsYXRmb3JtLmlzTWFjaW50b3NoID8gZS5tZXRhS2V5IDogZS5jdHJsS2V5KSkge1xuXHRcdFx0XHRcdFx0dGhpcy5vbkN0cmxBKGUpO1xuXHRcdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9KSk7XG5cdH1cblxuXHR1cGRhdGVPcHRpb25zKG9wdGlvbnNVcGRhdGU6IElMaXN0T3B0aW9uc1VwZGF0ZSk6IHZvaWQge1xuXHRcdGlmIChvcHRpb25zVXBkYXRlLm11bHRpcGxlU2VsZWN0aW9uU3VwcG9ydCAhPT0gdW5kZWZpbmVkKSB7XG5cdFx0XHR0aGlzLm11bHRpcGxlU2VsZWN0aW9uU3VwcG9ydCA9IG9wdGlvbnNVcGRhdGUubXVsdGlwbGVTZWxlY3Rpb25TdXBwb3J0O1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgb25FbnRlcihlOiBTdGFuZGFyZEtleWJvYXJkRXZlbnQpOiB2b2lkIHtcblx0XHRlLnByZXZlbnREZWZhdWx0KCk7XG5cdFx0ZS5zdG9wUHJvcGFnYXRpb24oKTtcblx0XHR0aGlzLmxpc3Quc2V0U2VsZWN0aW9uKHRoaXMubGlzdC5nZXRGb2N1cygpLCBlLmJyb3dzZXJFdmVudCk7XG5cdH1cblxuXHRwcml2YXRlIG9uVXBBcnJvdyhlOiBTdGFuZGFyZEtleWJvYXJkRXZlbnQpOiB2b2lkIHtcblx0XHRlLnByZXZlbnREZWZhdWx0KCk7XG5cdFx0ZS5zdG9wUHJvcGFnYXRpb24oKTtcblx0XHR0aGlzLmxpc3QuZm9jdXNQcmV2aW91cygxLCBmYWxzZSwgZS5icm93c2VyRXZlbnQpO1xuXHRcdGNvbnN0IGVsID0gdGhpcy5saXN0LmdldEZvY3VzKClbMF07XG5cdFx0dGhpcy5saXN0LnNldEFuY2hvcihlbCk7XG5cdFx0dGhpcy5saXN0LnJldmVhbChlbCk7XG5cdFx0dGhpcy52aWV3LmRvbU5vZGUuZm9jdXMoKTtcblx0fVxuXG5cdHByaXZhdGUgb25Eb3duQXJyb3coZTogU3RhbmRhcmRLZXlib2FyZEV2ZW50KTogdm9pZCB7XG5cdFx0ZS5wcmV2ZW50RGVmYXVsdCgpO1xuXHRcdGUuc3RvcFByb3BhZ2F0aW9uKCk7XG5cdFx0dGhpcy5saXN0LmZvY3VzTmV4dCgxLCBmYWxzZSwgZS5icm93c2VyRXZlbnQpO1xuXHRcdGNvbnN0IGVsID0gdGhpcy5saXN0LmdldEZvY3VzKClbMF07XG5cdFx0dGhpcy5saXN0LnNldEFuY2hvcihlbCk7XG5cdFx0dGhpcy5saXN0LnJldmVhbChlbCk7XG5cdFx0dGhpcy52aWV3LmRvbU5vZGUuZm9jdXMoKTtcblx0fVxuXG5cdHByaXZhdGUgb25QYWdlVXBBcnJvdyhlOiBTdGFuZGFyZEtleWJvYXJkRXZlbnQpOiB2b2lkIHtcblx0XHRlLnByZXZlbnREZWZhdWx0KCk7XG5cdFx0ZS5zdG9wUHJvcGFnYXRpb24oKTtcblx0XHR0aGlzLmxpc3QuZm9jdXNQcmV2aW91c1BhZ2UoZS5icm93c2VyRXZlbnQpO1xuXHRcdGNvbnN0IGVsID0gdGhpcy5saXN0LmdldEZvY3VzKClbMF07XG5cdFx0dGhpcy5saXN0LnNldEFuY2hvcihlbCk7XG5cdFx0dGhpcy5saXN0LnJldmVhbChlbCk7XG5cdFx0dGhpcy52aWV3LmRvbU5vZGUuZm9jdXMoKTtcblx0fVxuXG5cdHByaXZhdGUgb25QYWdlRG93bkFycm93KGU6IFN0YW5kYXJkS2V5Ym9hcmRFdmVudCk6IHZvaWQge1xuXHRcdGUucHJldmVudERlZmF1bHQoKTtcblx0XHRlLnN0b3BQcm9wYWdhdGlvbigpO1xuXHRcdHRoaXMubGlzdC5mb2N1c05leHRQYWdlKGUuYnJvd3NlckV2ZW50KTtcblx0XHRjb25zdCBlbCA9IHRoaXMubGlzdC5nZXRGb2N1cygpWzBdO1xuXHRcdHRoaXMubGlzdC5zZXRBbmNob3IoZWwpO1xuXHRcdHRoaXMubGlzdC5yZXZlYWwoZWwpO1xuXHRcdHRoaXMudmlldy5kb21Ob2RlLmZvY3VzKCk7XG5cdH1cblxuXHRwcml2YXRlIG9uQ3RybEEoZTogU3RhbmRhcmRLZXlib2FyZEV2ZW50KTogdm9pZCB7XG5cdFx0ZS5wcmV2ZW50RGVmYXVsdCgpO1xuXHRcdGUuc3RvcFByb3BhZ2F0aW9uKCk7XG5cblx0XHRsZXQgc2VsZWN0aW9uID0gcmFuZ2UodGhpcy5saXN0Lmxlbmd0aCk7XG5cblx0XHQvLyBGaWx0ZXIgYnkgZ3JvdXAgaWYgaWRlbnRpdHkgcHJvdmlkZXIgaGFzIGdldEdyb3VwSWRcblx0XHRjb25zdCBmb2N1c2VkRWxlbWVudHMgPSB0aGlzLmxpc3QuZ2V0Rm9jdXMoKTtcblx0XHRjb25zdCByZWZlcmVuY2VHcm91cElkID0gZm9jdXNlZEVsZW1lbnRzLmxlbmd0aCA+IDAgPyB0aGlzLmxpc3QuZ2V0RWxlbWVudEdyb3VwSWQoZm9jdXNlZEVsZW1lbnRzWzBdKSA6IHVuZGVmaW5lZDtcblx0XHRpZiAocmVmZXJlbmNlR3JvdXBJZCAhPT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRzZWxlY3Rpb24gPSB0aGlzLmxpc3QuZmlsdGVySW5kaWNlc0J5R3JvdXAoc2VsZWN0aW9uLCByZWZlcmVuY2VHcm91cElkKTtcblx0XHR9XG5cblx0XHR0aGlzLmxpc3Quc2V0U2VsZWN0aW9uKHNlbGVjdGlvbiwgZS5icm93c2VyRXZlbnQpO1xuXHRcdHRoaXMubGlzdC5zZXRBbmNob3IodW5kZWZpbmVkKTtcblx0XHR0aGlzLnZpZXcuZG9tTm9kZS5mb2N1cygpO1xuXHR9XG5cblx0cHJpdmF0ZSBvbkVzY2FwZShlOiBTdGFuZGFyZEtleWJvYXJkRXZlbnQpOiB2b2lkIHtcblx0XHRpZiAodGhpcy5saXN0LmdldFNlbGVjdGlvbigpLmxlbmd0aCkge1xuXHRcdFx0ZS5wcmV2ZW50RGVmYXVsdCgpO1xuXHRcdFx0ZS5zdG9wUHJvcGFnYXRpb24oKTtcblx0XHRcdHRoaXMubGlzdC5zZXRTZWxlY3Rpb24oW10sIGUuYnJvd3NlckV2ZW50KTtcblx0XHRcdHRoaXMubGlzdC5zZXRBbmNob3IodW5kZWZpbmVkKTtcblx0XHRcdHRoaXMudmlldy5kb21Ob2RlLmZvY3VzKCk7XG5cdFx0fVxuXHR9XG5cblx0ZGlzcG9zZSgpIHtcblx0XHR0aGlzLmRpc3Bvc2FibGVzLmRpc3Bvc2UoKTtcblx0XHR0aGlzLm11bHRpcGxlU2VsZWN0aW9uRGlzcG9zYWJsZXMuZGlzcG9zZSgpO1xuXHR9XG59XG5cbmV4cG9ydCBlbnVtIFR5cGVOYXZpZ2F0aW9uTW9kZSB7XG5cdEF1dG9tYXRpYyxcblx0VHJpZ2dlclxufVxuXG5lbnVtIFR5cGVOYXZpZ2F0aW9uQ29udHJvbGxlclN0YXRlIHtcblx0SWRsZSxcblx0VHlwaW5nXG59XG5cbmV4cG9ydCBjb25zdCBEZWZhdWx0S2V5Ym9hcmROYXZpZ2F0aW9uRGVsZWdhdGUgPSBuZXcgY2xhc3MgaW1wbGVtZW50cyBJS2V5Ym9hcmROYXZpZ2F0aW9uRGVsZWdhdGUge1xuXHRtaWdodFByb2R1Y2VQcmludGFibGVDaGFyYWN0ZXIoZXZlbnQ6IElLZXlib2FyZEV2ZW50KTogYm9vbGVhbiB7XG5cdFx0aWYgKGV2ZW50LmN0cmxLZXkgfHwgZXZlbnQubWV0YUtleSB8fCBldmVudC5hbHRLZXkpIHtcblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cblx0XHRyZXR1cm4gKGV2ZW50LmtleUNvZGUgPj0gS2V5Q29kZS5LZXlBICYmIGV2ZW50LmtleUNvZGUgPD0gS2V5Q29kZS5LZXlaKVxuXHRcdFx0fHwgKGV2ZW50LmtleUNvZGUgPj0gS2V5Q29kZS5EaWdpdDAgJiYgZXZlbnQua2V5Q29kZSA8PSBLZXlDb2RlLkRpZ2l0OSlcblx0XHRcdHx8IChldmVudC5rZXlDb2RlID49IEtleUNvZGUuTnVtcGFkMCAmJiBldmVudC5rZXlDb2RlIDw9IEtleUNvZGUuTnVtcGFkOSlcblx0XHRcdHx8IChldmVudC5rZXlDb2RlID49IEtleUNvZGUuU2VtaWNvbG9uICYmIGV2ZW50LmtleUNvZGUgPD0gS2V5Q29kZS5RdW90ZSk7XG5cdH1cbn07XG5cbmNsYXNzIFR5cGVOYXZpZ2F0aW9uQ29udHJvbGxlcjxUPiBpbXBsZW1lbnRzIElEaXNwb3NhYmxlIHtcblxuXHRwcml2YXRlIGVuYWJsZWQgPSBmYWxzZTtcblx0cHJpdmF0ZSBzdGF0ZTogVHlwZU5hdmlnYXRpb25Db250cm9sbGVyU3RhdGUgPSBUeXBlTmF2aWdhdGlvbkNvbnRyb2xsZXJTdGF0ZS5JZGxlO1xuXG5cdHByaXZhdGUgbW9kZSA9IFR5cGVOYXZpZ2F0aW9uTW9kZS5BdXRvbWF0aWM7XG5cdHByaXZhdGUgdHJpZ2dlcmVkID0gZmFsc2U7XG5cdHByaXZhdGUgcHJldmlvdXNseUZvY3VzZWQgPSAtMTtcblxuXHRwcml2YXRlIHJlYWRvbmx5IGVuYWJsZWREaXNwb3NhYmxlcyA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblx0cHJpdmF0ZSByZWFkb25seSBkaXNwb3NhYmxlcyA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRwcml2YXRlIGxpc3Q6IExpc3Q8VD4sXG5cdFx0cHJpdmF0ZSB2aWV3OiBJTGlzdFZpZXc8VD4sXG5cdFx0cHJpdmF0ZSBrZXlib2FyZE5hdmlnYXRpb25MYWJlbFByb3ZpZGVyOiBJS2V5Ym9hcmROYXZpZ2F0aW9uTGFiZWxQcm92aWRlcjxUPixcblx0XHRwcml2YXRlIGtleWJvYXJkTmF2aWdhdGlvbkV2ZW50RmlsdGVyOiBJS2V5Ym9hcmROYXZpZ2F0aW9uRXZlbnRGaWx0ZXIsXG5cdFx0cHJpdmF0ZSBkZWxlZ2F0ZTogSUtleWJvYXJkTmF2aWdhdGlvbkRlbGVnYXRlXG5cdCkge1xuXHRcdHRoaXMudXBkYXRlT3B0aW9ucyhsaXN0Lm9wdGlvbnMpO1xuXHR9XG5cblx0dXBkYXRlT3B0aW9ucyhvcHRpb25zOiBJTGlzdE9wdGlvbnM8VD4pOiB2b2lkIHtcblx0XHRpZiAob3B0aW9ucy50eXBlTmF2aWdhdGlvbkVuYWJsZWQgPz8gdHJ1ZSkge1xuXHRcdFx0dGhpcy5lbmFibGUoKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0dGhpcy5kaXNhYmxlKCk7XG5cdFx0fVxuXG5cdFx0dGhpcy5tb2RlID0gb3B0aW9ucy50eXBlTmF2aWdhdGlvbk1vZGUgPz8gVHlwZU5hdmlnYXRpb25Nb2RlLkF1dG9tYXRpYztcblx0fVxuXG5cdHRyaWdnZXIoKTogdm9pZCB7XG5cdFx0dGhpcy50cmlnZ2VyZWQgPSAhdGhpcy50cmlnZ2VyZWQ7XG5cdH1cblxuXHRwcml2YXRlIGVuYWJsZSgpOiB2b2lkIHtcblx0XHRpZiAodGhpcy5lbmFibGVkKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0bGV0IHR5cGluZyA9IGZhbHNlO1xuXG5cdFx0Y29uc3Qgb25DaGFyID0gRXZlbnQuY2hhaW4odGhpcy5lbmFibGVkRGlzcG9zYWJsZXMuYWRkKG5ldyBEb21FbWl0dGVyKHRoaXMudmlldy5kb21Ob2RlLCAna2V5ZG93bicpKS5ldmVudCwgJCA9PlxuXHRcdFx0JC5maWx0ZXIoZSA9PiAhaXNFZGl0YWJsZUVsZW1lbnQoZS50YXJnZXQgYXMgSFRNTEVsZW1lbnQpKVxuXHRcdFx0XHQuZmlsdGVyKCgpID0+IHRoaXMubW9kZSA9PT0gVHlwZU5hdmlnYXRpb25Nb2RlLkF1dG9tYXRpYyB8fCB0aGlzLnRyaWdnZXJlZClcblx0XHRcdFx0Lm1hcChldmVudCA9PiBuZXcgU3RhbmRhcmRLZXlib2FyZEV2ZW50KGV2ZW50KSlcblx0XHRcdFx0LmZpbHRlcihlID0+IHR5cGluZyB8fCB0aGlzLmtleWJvYXJkTmF2aWdhdGlvbkV2ZW50RmlsdGVyKGUpKVxuXHRcdFx0XHQuZmlsdGVyKGUgPT4gdGhpcy5kZWxlZ2F0ZS5taWdodFByb2R1Y2VQcmludGFibGVDaGFyYWN0ZXIoZSkpXG5cdFx0XHRcdC5mb3JFYWNoKGUgPT4gRXZlbnRIZWxwZXIuc3RvcChlLCB0cnVlKSlcblx0XHRcdFx0Lm1hcChldmVudCA9PiBldmVudC5icm93c2VyRXZlbnQua2V5KVxuXHRcdCk7XG5cblx0XHRjb25zdCBvbkNsZWFyID0gRXZlbnQuZGVib3VuY2U8c3RyaW5nLCBudWxsPihvbkNoYXIsICgpID0+IG51bGwsIDgwMCwgdW5kZWZpbmVkLCB1bmRlZmluZWQsIHVuZGVmaW5lZCwgdGhpcy5lbmFibGVkRGlzcG9zYWJsZXMpO1xuXHRcdGNvbnN0IG9uSW5wdXQgPSBFdmVudC5yZWR1Y2U8c3RyaW5nIHwgbnVsbCwgc3RyaW5nIHwgbnVsbD4oRXZlbnQuYW55KG9uQ2hhciwgb25DbGVhciksIChyLCBpKSA9PiBpID09PSBudWxsID8gbnVsbCA6ICgociB8fCAnJykgKyBpKSwgdW5kZWZpbmVkLCB0aGlzLmVuYWJsZWREaXNwb3NhYmxlcyk7XG5cblx0XHRvbklucHV0KHRoaXMub25JbnB1dCwgdGhpcywgdGhpcy5lbmFibGVkRGlzcG9zYWJsZXMpO1xuXHRcdG9uQ2xlYXIodGhpcy5vbkNsZWFyLCB0aGlzLCB0aGlzLmVuYWJsZWREaXNwb3NhYmxlcyk7XG5cblx0XHRvbkNoYXIoKCkgPT4gdHlwaW5nID0gdHJ1ZSwgdW5kZWZpbmVkLCB0aGlzLmVuYWJsZWREaXNwb3NhYmxlcyk7XG5cdFx0b25DbGVhcigoKSA9PiB0eXBpbmcgPSBmYWxzZSwgdW5kZWZpbmVkLCB0aGlzLmVuYWJsZWREaXNwb3NhYmxlcyk7XG5cblx0XHR0aGlzLmVuYWJsZWQgPSB0cnVlO1xuXHRcdHRoaXMudHJpZ2dlcmVkID0gZmFsc2U7XG5cdH1cblxuXHRwcml2YXRlIGRpc2FibGUoKTogdm9pZCB7XG5cdFx0aWYgKCF0aGlzLmVuYWJsZWQpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHR0aGlzLmVuYWJsZWREaXNwb3NhYmxlcy5jbGVhcigpO1xuXHRcdHRoaXMuZW5hYmxlZCA9IGZhbHNlO1xuXHRcdHRoaXMudHJpZ2dlcmVkID0gZmFsc2U7XG5cdH1cblxuXHRwcml2YXRlIG9uQ2xlYXIoKTogdm9pZCB7XG5cdFx0Y29uc3QgZm9jdXMgPSB0aGlzLmxpc3QuZ2V0Rm9jdXMoKTtcblx0XHRpZiAoZm9jdXMubGVuZ3RoID4gMCAmJiBmb2N1c1swXSA9PT0gdGhpcy5wcmV2aW91c2x5Rm9jdXNlZCkge1xuXHRcdFx0Ly8gTGlzdDogcmUtYW5ub3VuY2UgZWxlbWVudCBvbiB0eXBpbmcgZW5kIHNpbmNlIHR5cGVkIGtleXMgd2lsbCBpbnRlcnJ1cHQgYXJpYSBsYWJlbCBvZiBmb2N1c2VkIGVsZW1lbnRcblx0XHRcdC8vIERvIG5vdCBhbm5vdW5jZSBpZiB0aGVyZSB3YXMgYSBmb2N1cyBjaGFuZ2UgYXQgdGhlIGVuZCB0byBwcmV2ZW50IGR1cGxpY2F0aW9uIGh0dHBzOi8vZ2l0aHViLmNvbS9taWNyb3NvZnQvdnNjb2RlL2lzc3Vlcy85NTk2MVxuXHRcdFx0Y29uc3QgYXJpYUxhYmVsID0gdGhpcy5saXN0Lm9wdGlvbnMuYWNjZXNzaWJpbGl0eVByb3ZpZGVyPy5nZXRBcmlhTGFiZWwodGhpcy5saXN0LmVsZW1lbnQoZm9jdXNbMF0pKTtcblxuXHRcdFx0aWYgKHR5cGVvZiBhcmlhTGFiZWwgPT09ICdzdHJpbmcnKSB7XG5cdFx0XHRcdGFsZXJ0KGFyaWFMYWJlbCk7XG5cdFx0XHR9IGVsc2UgaWYgKGFyaWFMYWJlbCkge1xuXHRcdFx0XHRhbGVydChhcmlhTGFiZWwuZ2V0KCkpO1xuXHRcdFx0fVxuXHRcdH1cblx0XHR0aGlzLnByZXZpb3VzbHlGb2N1c2VkID0gLTE7XG5cdH1cblxuXHRwcml2YXRlIG9uSW5wdXQod29yZDogc3RyaW5nIHwgbnVsbCk6IHZvaWQge1xuXHRcdGlmICghd29yZCkge1xuXHRcdFx0dGhpcy5zdGF0ZSA9IFR5cGVOYXZpZ2F0aW9uQ29udHJvbGxlclN0YXRlLklkbGU7XG5cdFx0XHR0aGlzLnRyaWdnZXJlZCA9IGZhbHNlO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IGZvY3VzID0gdGhpcy5saXN0LmdldEZvY3VzKCk7XG5cdFx0Y29uc3Qgc3RhcnQgPSBmb2N1cy5sZW5ndGggPiAwID8gZm9jdXNbMF0gOiAwO1xuXHRcdGNvbnN0IGRlbHRhID0gdGhpcy5zdGF0ZSA9PT0gVHlwZU5hdmlnYXRpb25Db250cm9sbGVyU3RhdGUuSWRsZSA/IDEgOiAwO1xuXHRcdHRoaXMuc3RhdGUgPSBUeXBlTmF2aWdhdGlvbkNvbnRyb2xsZXJTdGF0ZS5UeXBpbmc7XG5cblx0XHRmb3IgKGxldCBpID0gMDsgaSA8IHRoaXMubGlzdC5sZW5ndGg7IGkrKykge1xuXHRcdFx0Y29uc3QgaW5kZXggPSAoc3RhcnQgKyBpICsgZGVsdGEpICUgdGhpcy5saXN0Lmxlbmd0aDtcblx0XHRcdGNvbnN0IGxhYmVsID0gdGhpcy5rZXlib2FyZE5hdmlnYXRpb25MYWJlbFByb3ZpZGVyLmdldEtleWJvYXJkTmF2aWdhdGlvbkxhYmVsKHRoaXMudmlldy5lbGVtZW50KGluZGV4KSk7XG5cdFx0XHRjb25zdCBsYWJlbFN0ciA9IGxhYmVsICYmIGxhYmVsLnRvU3RyaW5nKCk7XG5cblx0XHRcdGlmICh0aGlzLmxpc3Qub3B0aW9ucy50eXBlTmF2aWdhdGlvbkVuYWJsZWQpIHtcblx0XHRcdFx0aWYgKHR5cGVvZiBsYWJlbFN0ciAhPT0gJ3VuZGVmaW5lZCcpIHtcblxuXHRcdFx0XHRcdC8vIElmIHByZWZpeCBpcyBmb3VuZCwgZm9jdXMgYW5kIHJldHVybiBlYXJseVxuXHRcdFx0XHRcdGlmIChtYXRjaGVzUHJlZml4KHdvcmQsIGxhYmVsU3RyKSkge1xuXHRcdFx0XHRcdFx0dGhpcy5wcmV2aW91c2x5Rm9jdXNlZCA9IHN0YXJ0O1xuXHRcdFx0XHRcdFx0dGhpcy5saXN0LnNldEZvY3VzKFtpbmRleF0pO1xuXHRcdFx0XHRcdFx0dGhpcy5saXN0LnJldmVhbChpbmRleCk7XG5cdFx0XHRcdFx0XHRyZXR1cm47XG5cdFx0XHRcdFx0fVxuXG5cdFx0XHRcdFx0Y29uc3QgZnV6enkgPSBtYXRjaGVzRnV6enkyKHdvcmQsIGxhYmVsU3RyKTtcblxuXHRcdFx0XHRcdGlmIChmdXp6eSkge1xuXHRcdFx0XHRcdFx0Y29uc3QgZnV6enlTY29yZSA9IGZ1enp5WzBdLmVuZCAtIGZ1enp5WzBdLnN0YXJ0O1xuXHRcdFx0XHRcdFx0Ly8gZW5zdXJlcyB0aGF0IHdoZW4gZnV6enkgbWF0Y2hpbmcsIGRvZXNuJ3QgY2xhc2ggd2l0aCBwcmVmaXggbWF0Y2hpbmcgKDEgaW5wdXQgdnMgMSsgc2hvdWxkIGJlIHByZWZpeCBhbmQgZnV6enkgcmVzcGVjaXR2ZWx5KS4gQWxzbyBtYWtlcyBzdXJlIHRoYXQgZXhhY3QgbWF0Y2hlcyBhcmUgcHJpb3JpdGl6ZWQuXG5cdFx0XHRcdFx0XHRpZiAoZnV6enlTY29yZSA+IDEgJiYgZnV6enkubGVuZ3RoID09PSAxKSB7XG5cdFx0XHRcdFx0XHRcdHRoaXMucHJldmlvdXNseUZvY3VzZWQgPSBzdGFydDtcblx0XHRcdFx0XHRcdFx0dGhpcy5saXN0LnNldEZvY3VzKFtpbmRleF0pO1xuXHRcdFx0XHRcdFx0XHR0aGlzLmxpc3QucmV2ZWFsKGluZGV4KTtcblx0XHRcdFx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0fSBlbHNlIGlmICh0eXBlb2YgbGFiZWxTdHIgPT09ICd1bmRlZmluZWQnIHx8IG1hdGNoZXNQcmVmaXgod29yZCwgbGFiZWxTdHIpKSB7XG5cdFx0XHRcdHRoaXMucHJldmlvdXNseUZvY3VzZWQgPSBzdGFydDtcblx0XHRcdFx0dGhpcy5saXN0LnNldEZvY3VzKFtpbmRleF0pO1xuXHRcdFx0XHR0aGlzLmxpc3QucmV2ZWFsKGluZGV4KTtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXHRcdH1cblx0fVxuXG5cdGRpc3Bvc2UoKSB7XG5cdFx0dGhpcy5kaXNhYmxlKCk7XG5cdFx0dGhpcy5lbmFibGVkRGlzcG9zYWJsZXMuZGlzcG9zZSgpO1xuXHRcdHRoaXMuZGlzcG9zYWJsZXMuZGlzcG9zZSgpO1xuXHR9XG59XG5cbmNsYXNzIERPTUZvY3VzQ29udHJvbGxlcjxUPiBpbXBsZW1lbnRzIElEaXNwb3NhYmxlIHtcblxuXHRwcml2YXRlIHJlYWRvbmx5IGRpc3Bvc2FibGVzID0gbmV3IERpc3Bvc2FibGVTdG9yZSgpO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdHByaXZhdGUgbGlzdDogTGlzdDxUPixcblx0XHRwcml2YXRlIHZpZXc6IElMaXN0VmlldzxUPlxuXHQpIHtcblx0XHRjb25zdCBvbktleURvd24gPSBFdmVudC5jaGFpbih0aGlzLmRpc3Bvc2FibGVzLmFkZChuZXcgRG9tRW1pdHRlcih2aWV3LmRvbU5vZGUsICdrZXlkb3duJykpLmV2ZW50LCAkID0+ICRcblx0XHRcdC5maWx0ZXIoZSA9PiAhaXNFZGl0YWJsZUVsZW1lbnQoZS50YXJnZXQgYXMgSFRNTEVsZW1lbnQpKVxuXHRcdFx0Lm1hcChlID0+IG5ldyBTdGFuZGFyZEtleWJvYXJkRXZlbnQoZSkpXG5cdFx0KTtcblxuXHRcdGNvbnN0IG9uVGFiID0gRXZlbnQuY2hhaW4ob25LZXlEb3duLCAkID0+ICQuZmlsdGVyKGUgPT4gZS5rZXlDb2RlID09PSBLZXlDb2RlLlRhYiAmJiAhZS5jdHJsS2V5ICYmICFlLm1ldGFLZXkgJiYgIWUuc2hpZnRLZXkgJiYgIWUuYWx0S2V5KSk7XG5cblx0XHRvblRhYih0aGlzLm9uVGFiLCB0aGlzLCB0aGlzLmRpc3Bvc2FibGVzKTtcblx0fVxuXG5cdHByaXZhdGUgb25UYWIoZTogU3RhbmRhcmRLZXlib2FyZEV2ZW50KTogdm9pZCB7XG5cdFx0aWYgKGUudGFyZ2V0ICE9PSB0aGlzLnZpZXcuZG9tTm9kZSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IGZvY3VzID0gdGhpcy5saXN0LmdldEZvY3VzKCk7XG5cblx0XHRpZiAoZm9jdXMubGVuZ3RoID09PSAwKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29uc3QgZm9jdXNlZERvbUVsZW1lbnQgPSB0aGlzLnZpZXcuZG9tRWxlbWVudChmb2N1c1swXSk7XG5cblx0XHRpZiAoIWZvY3VzZWREb21FbGVtZW50KSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Ly8gZXNsaW50LWRpc2FibGUtbmV4dC1saW5lIG5vLXJlc3RyaWN0ZWQtc3ludGF4XG5cdFx0Y29uc3QgdGFiSW5kZXhFbGVtZW50ID0gZm9jdXNlZERvbUVsZW1lbnQucXVlcnlTZWxlY3RvcignW3RhYkluZGV4XScpO1xuXG5cdFx0aWYgKCF0YWJJbmRleEVsZW1lbnQgfHwgIShpc0hUTUxFbGVtZW50KHRhYkluZGV4RWxlbWVudCkpIHx8IHRhYkluZGV4RWxlbWVudC50YWJJbmRleCA9PT0gLTEpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCBzdHlsZSA9IGdldFdpbmRvdyh0YWJJbmRleEVsZW1lbnQpLmdldENvbXB1dGVkU3R5bGUodGFiSW5kZXhFbGVtZW50KTtcblx0XHRpZiAoc3R5bGUudmlzaWJpbGl0eSA9PT0gJ2hpZGRlbicgfHwgc3R5bGUuZGlzcGxheSA9PT0gJ25vbmUnKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0ZS5wcmV2ZW50RGVmYXVsdCgpO1xuXHRcdGUuc3RvcFByb3BhZ2F0aW9uKCk7XG5cdFx0dGFiSW5kZXhFbGVtZW50LmZvY3VzKCk7XG5cdH1cblxuXHRkaXNwb3NlKCkge1xuXHRcdHRoaXMuZGlzcG9zYWJsZXMuZGlzcG9zZSgpO1xuXHR9XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBpc1NlbGVjdGlvblNpbmdsZUNoYW5nZUV2ZW50KGV2ZW50OiBJTGlzdE1vdXNlRXZlbnQ8YW55PiB8IElMaXN0VG91Y2hFdmVudDxhbnk+KTogYm9vbGVhbiB7XG5cdHJldHVybiBwbGF0Zm9ybS5pc01hY2ludG9zaCA/IGV2ZW50LmJyb3dzZXJFdmVudC5tZXRhS2V5IDogZXZlbnQuYnJvd3NlckV2ZW50LmN0cmxLZXk7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBpc1NlbGVjdGlvblJhbmdlQ2hhbmdlRXZlbnQoZXZlbnQ6IElMaXN0TW91c2VFdmVudDxhbnk+IHwgSUxpc3RUb3VjaEV2ZW50PGFueT4pOiBib29sZWFuIHtcblx0cmV0dXJuIGV2ZW50LmJyb3dzZXJFdmVudC5zaGlmdEtleTtcbn1cblxuZnVuY3Rpb24gaXNNb3VzZVJpZ2h0Q2xpY2soZXZlbnQ6IFVJRXZlbnQpOiBib29sZWFuIHtcblx0cmV0dXJuIGlzTW91c2VFdmVudChldmVudCkgJiYgZXZlbnQuYnV0dG9uID09PSAyO1xufVxuXG5jb25zdCBEZWZhdWx0TXVsdGlwbGVTZWxlY3Rpb25Db250cm9sbGVyID0ge1xuXHRpc1NlbGVjdGlvblNpbmdsZUNoYW5nZUV2ZW50LFxuXHRpc1NlbGVjdGlvblJhbmdlQ2hhbmdlRXZlbnRcbn07XG5cbmV4cG9ydCBjbGFzcyBNb3VzZUNvbnRyb2xsZXI8VD4gaW1wbGVtZW50cyBJRGlzcG9zYWJsZSB7XG5cblx0cHJpdmF0ZSBtdWx0aXBsZVNlbGVjdGlvbkNvbnRyb2xsZXI6IElNdWx0aXBsZVNlbGVjdGlvbkNvbnRyb2xsZXI8VD4gfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgcmVhZG9ubHkgbW91c2VTdXBwb3J0OiBib29sZWFuO1xuXHRwcml2YXRlIHJlYWRvbmx5IGRpc3Bvc2FibGVzID0gbmV3IERpc3Bvc2FibGVTdG9yZSgpO1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX29uUG9pbnRlciA9IHRoaXMuZGlzcG9zYWJsZXMuYWRkKG5ldyBFbWl0dGVyPElMaXN0TW91c2VFdmVudDxUPj4oKSk7XG5cdGdldCBvblBvaW50ZXIoKSB7IHJldHVybiB0aGlzLl9vblBvaW50ZXIuZXZlbnQ7IH1cblxuXHRjb25zdHJ1Y3Rvcihwcm90ZWN0ZWQgbGlzdDogTGlzdDxUPikge1xuXHRcdGlmIChsaXN0Lm9wdGlvbnMubXVsdGlwbGVTZWxlY3Rpb25TdXBwb3J0ICE9PSBmYWxzZSkge1xuXHRcdFx0dGhpcy5tdWx0aXBsZVNlbGVjdGlvbkNvbnRyb2xsZXIgPSB0aGlzLmxpc3Qub3B0aW9ucy5tdWx0aXBsZVNlbGVjdGlvbkNvbnRyb2xsZXIgfHwgRGVmYXVsdE11bHRpcGxlU2VsZWN0aW9uQ29udHJvbGxlcjtcblx0XHR9XG5cblx0XHR0aGlzLm1vdXNlU3VwcG9ydCA9IHR5cGVvZiBsaXN0Lm9wdGlvbnMubW91c2VTdXBwb3J0ID09PSAndW5kZWZpbmVkJyB8fCAhIWxpc3Qub3B0aW9ucy5tb3VzZVN1cHBvcnQ7XG5cblx0XHRpZiAodGhpcy5tb3VzZVN1cHBvcnQpIHtcblx0XHRcdGxpc3Qub25Nb3VzZURvd24odGhpcy5vbk1vdXNlRG93biwgdGhpcywgdGhpcy5kaXNwb3NhYmxlcyk7XG5cdFx0XHRsaXN0Lm9uQ29udGV4dE1lbnUodGhpcy5vbkNvbnRleHRNZW51LCB0aGlzLCB0aGlzLmRpc3Bvc2FibGVzKTtcblx0XHRcdGxpc3Qub25Nb3VzZURibENsaWNrKHRoaXMub25Eb3VibGVDbGljaywgdGhpcywgdGhpcy5kaXNwb3NhYmxlcyk7XG5cdFx0XHRsaXN0Lm9uVG91Y2hTdGFydCh0aGlzLm9uTW91c2VEb3duLCB0aGlzLCB0aGlzLmRpc3Bvc2FibGVzKTtcblx0XHRcdHRoaXMuZGlzcG9zYWJsZXMuYWRkKEdlc3R1cmUuYWRkVGFyZ2V0KGxpc3QuZ2V0SFRNTEVsZW1lbnQoKSkpO1xuXHRcdH1cblxuXHRcdEV2ZW50LmFueTxJTGlzdE1vdXNlRXZlbnQ8YW55PiB8IElMaXN0R2VzdHVyZUV2ZW50PGFueT4+KGxpc3Qub25Nb3VzZUNsaWNrLCBsaXN0Lm9uTW91c2VNaWRkbGVDbGljaywgbGlzdC5vblRhcCkodGhpcy5vblZpZXdQb2ludGVyLCB0aGlzLCB0aGlzLmRpc3Bvc2FibGVzKTtcblx0fVxuXG5cdHVwZGF0ZU9wdGlvbnMob3B0aW9uc1VwZGF0ZTogSUxpc3RPcHRpb25zVXBkYXRlKTogdm9pZCB7XG5cdFx0aWYgKG9wdGlvbnNVcGRhdGUubXVsdGlwbGVTZWxlY3Rpb25TdXBwb3J0ICE9PSB1bmRlZmluZWQpIHtcblx0XHRcdHRoaXMubXVsdGlwbGVTZWxlY3Rpb25Db250cm9sbGVyID0gdW5kZWZpbmVkO1xuXG5cdFx0XHRpZiAob3B0aW9uc1VwZGF0ZS5tdWx0aXBsZVNlbGVjdGlvblN1cHBvcnQpIHtcblx0XHRcdFx0dGhpcy5tdWx0aXBsZVNlbGVjdGlvbkNvbnRyb2xsZXIgPSB0aGlzLmxpc3Qub3B0aW9ucy5tdWx0aXBsZVNlbGVjdGlvbkNvbnRyb2xsZXIgfHwgRGVmYXVsdE11bHRpcGxlU2VsZWN0aW9uQ29udHJvbGxlcjtcblx0XHRcdH1cblx0XHR9XG5cdH1cblxuXHRwcm90ZWN0ZWQgaXNTZWxlY3Rpb25TaW5nbGVDaGFuZ2VFdmVudChldmVudDogSUxpc3RNb3VzZUV2ZW50PGFueT4gfCBJTGlzdFRvdWNoRXZlbnQ8YW55Pik6IGJvb2xlYW4ge1xuXHRcdGlmICghdGhpcy5tdWx0aXBsZVNlbGVjdGlvbkNvbnRyb2xsZXIpIHtcblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cblx0XHRyZXR1cm4gdGhpcy5tdWx0aXBsZVNlbGVjdGlvbkNvbnRyb2xsZXIuaXNTZWxlY3Rpb25TaW5nbGVDaGFuZ2VFdmVudChldmVudCk7XG5cdH1cblxuXHRwcm90ZWN0ZWQgaXNTZWxlY3Rpb25SYW5nZUNoYW5nZUV2ZW50KGV2ZW50OiBJTGlzdE1vdXNlRXZlbnQ8YW55PiB8IElMaXN0VG91Y2hFdmVudDxhbnk+KTogYm9vbGVhbiB7XG5cdFx0aWYgKCF0aGlzLm11bHRpcGxlU2VsZWN0aW9uQ29udHJvbGxlcikge1xuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH1cblxuXHRcdHJldHVybiB0aGlzLm11bHRpcGxlU2VsZWN0aW9uQ29udHJvbGxlci5pc1NlbGVjdGlvblJhbmdlQ2hhbmdlRXZlbnQoZXZlbnQpO1xuXHR9XG5cblx0cHJpdmF0ZSBpc1NlbGVjdGlvbkNoYW5nZUV2ZW50KGV2ZW50OiBJTGlzdE1vdXNlRXZlbnQ8YW55PiB8IElMaXN0VG91Y2hFdmVudDxhbnk+KTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuIHRoaXMuaXNTZWxlY3Rpb25TaW5nbGVDaGFuZ2VFdmVudChldmVudCkgfHwgdGhpcy5pc1NlbGVjdGlvblJhbmdlQ2hhbmdlRXZlbnQoZXZlbnQpO1xuXHR9XG5cblx0cHJvdGVjdGVkIG9uTW91c2VEb3duKGU6IElMaXN0TW91c2VFdmVudDxUPiB8IElMaXN0VG91Y2hFdmVudDxUPik6IHZvaWQge1xuXHRcdGlmIChpc01vbmFjb0VkaXRvcihlLmJyb3dzZXJFdmVudC50YXJnZXQgYXMgSFRNTEVsZW1lbnQpKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0aWYgKGdldEFjdGl2ZUVsZW1lbnQoKSAhPT0gZS5icm93c2VyRXZlbnQudGFyZ2V0KSB7XG5cdFx0XHR0aGlzLmxpc3QuZG9tRm9jdXMoKTtcblx0XHR9XG5cdH1cblxuXHRwcm90ZWN0ZWQgb25Db250ZXh0TWVudShlOiBJTGlzdENvbnRleHRNZW51RXZlbnQ8VD4pOiB2b2lkIHtcblx0XHRpZiAoaXNFZGl0YWJsZUVsZW1lbnQoZS5icm93c2VyRXZlbnQudGFyZ2V0IGFzIEhUTUxFbGVtZW50KSB8fCBpc01vbmFjb0VkaXRvcihlLmJyb3dzZXJFdmVudC50YXJnZXQgYXMgSFRNTEVsZW1lbnQpKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29uc3QgZm9jdXMgPSB0eXBlb2YgZS5pbmRleCA9PT0gJ3VuZGVmaW5lZCcgPyBbXSA6IFtlLmluZGV4XTtcblx0XHR0aGlzLmxpc3Quc2V0Rm9jdXMoZm9jdXMsIGUuYnJvd3NlckV2ZW50KTtcblx0fVxuXG5cdHByb3RlY3RlZCBvblZpZXdQb2ludGVyKGU6IElMaXN0TW91c2VFdmVudDxUPik6IHZvaWQge1xuXHRcdGlmICghdGhpcy5tb3VzZVN1cHBvcnQpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRpZiAoaXNFZGl0YWJsZUVsZW1lbnQoZS5icm93c2VyRXZlbnQudGFyZ2V0IGFzIEhUTUxFbGVtZW50KSB8fCBpc01vbmFjb0VkaXRvcihlLmJyb3dzZXJFdmVudC50YXJnZXQgYXMgSFRNTEVsZW1lbnQpKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0aWYgKGUuYnJvd3NlckV2ZW50LmlzSGFuZGxlZEJ5TGlzdCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGUuYnJvd3NlckV2ZW50LmlzSGFuZGxlZEJ5TGlzdCA9IHRydWU7XG5cdFx0Y29uc3QgZm9jdXMgPSBlLmluZGV4O1xuXG5cdFx0aWYgKHR5cGVvZiBmb2N1cyA9PT0gJ3VuZGVmaW5lZCcpIHtcblx0XHRcdHRoaXMubGlzdC5zZXRGb2N1cyhbXSwgZS5icm93c2VyRXZlbnQpO1xuXHRcdFx0dGhpcy5saXN0LnNldFNlbGVjdGlvbihbXSwgZS5icm93c2VyRXZlbnQpO1xuXHRcdFx0dGhpcy5saXN0LnNldEFuY2hvcih1bmRlZmluZWQpO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGlmICh0aGlzLmlzU2VsZWN0aW9uQ2hhbmdlRXZlbnQoZSkpIHtcblx0XHRcdHJldHVybiB0aGlzLmNoYW5nZVNlbGVjdGlvbihlKTtcblx0XHR9XG5cblx0XHR0aGlzLmxpc3Quc2V0Rm9jdXMoW2ZvY3VzXSwgZS5icm93c2VyRXZlbnQpO1xuXHRcdHRoaXMubGlzdC5zZXRBbmNob3IoZm9jdXMpO1xuXG5cdFx0aWYgKCFpc01vdXNlUmlnaHRDbGljayhlLmJyb3dzZXJFdmVudCkpIHtcblx0XHRcdC8vIENoZWNrIGlmIHRoZSBlbGVtZW50IGlzIHNlbGVjdGFibGUgKGdldEdyb3VwSWQgbXVzdCBub3QgcmV0dXJuIHVuZGVmaW5lZClcblx0XHRcdGNvbnN0IGZvY3VzR3JvdXBJZCA9IHRoaXMubGlzdC5nZXRFbGVtZW50R3JvdXBJZChmb2N1cyk7XG5cdFx0XHRpZiAoZm9jdXNHcm91cElkICE9PSBOb3RTZWxlY3RhYmxlR3JvdXBJZCkge1xuXHRcdFx0XHR0aGlzLmxpc3Quc2V0U2VsZWN0aW9uKFtmb2N1c10sIGUuYnJvd3NlckV2ZW50KTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHR0aGlzLl9vblBvaW50ZXIuZmlyZShlKTtcblx0fVxuXG5cdHByb3RlY3RlZCBvbkRvdWJsZUNsaWNrKGU6IElMaXN0TW91c2VFdmVudDxUPik6IHZvaWQge1xuXHRcdGlmIChpc0VkaXRhYmxlRWxlbWVudChlLmJyb3dzZXJFdmVudC50YXJnZXQgYXMgSFRNTEVsZW1lbnQpIHx8IGlzTW9uYWNvRWRpdG9yKGUuYnJvd3NlckV2ZW50LnRhcmdldCBhcyBIVE1MRWxlbWVudCkpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRpZiAodGhpcy5pc1NlbGVjdGlvbkNoYW5nZUV2ZW50KGUpKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0aWYgKGUuYnJvd3NlckV2ZW50LmlzSGFuZGxlZEJ5TGlzdCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGUuYnJvd3NlckV2ZW50LmlzSGFuZGxlZEJ5TGlzdCA9IHRydWU7XG5cdFx0Y29uc3QgZm9jdXMgPSB0aGlzLmxpc3QuZ2V0Rm9jdXMoKTtcblx0XHR0aGlzLmxpc3Quc2V0U2VsZWN0aW9uKGZvY3VzLCBlLmJyb3dzZXJFdmVudCk7XG5cdH1cblxuXHRwcml2YXRlIGNoYW5nZVNlbGVjdGlvbihlOiBJTGlzdE1vdXNlRXZlbnQ8VD4gfCBJTGlzdFRvdWNoRXZlbnQ8VD4pOiB2b2lkIHtcblx0XHRjb25zdCBmb2N1cyA9IGUuaW5kZXghO1xuXHRcdGxldCBhbmNob3IgPSB0aGlzLmxpc3QuZ2V0QW5jaG9yKCk7XG5cblx0XHRpZiAodGhpcy5pc1NlbGVjdGlvblJhbmdlQ2hhbmdlRXZlbnQoZSkpIHtcblx0XHRcdGlmICh0eXBlb2YgYW5jaG9yID09PSAndW5kZWZpbmVkJykge1xuXHRcdFx0XHRjb25zdCBjdXJyZW50Rm9jdXMgPSB0aGlzLmxpc3QuZ2V0Rm9jdXMoKVswXTtcblx0XHRcdFx0YW5jaG9yID0gY3VycmVudEZvY3VzID8/IGZvY3VzO1xuXHRcdFx0XHR0aGlzLmxpc3Quc2V0QW5jaG9yKGFuY2hvcik7XG5cdFx0XHR9XG5cblx0XHRcdGNvbnN0IG1pbiA9IE1hdGgubWluKGFuY2hvciwgZm9jdXMpO1xuXHRcdFx0Y29uc3QgbWF4ID0gTWF0aC5tYXgoYW5jaG9yLCBmb2N1cyk7XG5cdFx0XHRsZXQgcmFuZ2VTZWxlY3Rpb24gPSByYW5nZShtaW4sIG1heCArIDEpO1xuXG5cdFx0XHRjb25zdCBzZWxlY3RlZEVsZW1lbnQgPSB0aGlzLmxpc3QuZ2V0U2VsZWN0aW9uKClbMF07XG5cdFx0XHRpZiAoc2VsZWN0ZWRFbGVtZW50ICE9PSB1bmRlZmluZWQpIHtcblx0XHRcdFx0Y29uc3QgcmVmZXJlbmNlR3JvdXBJZCA9IHRoaXMubGlzdC5nZXRFbGVtZW50R3JvdXBJZChzZWxlY3RlZEVsZW1lbnQpO1xuXHRcdFx0XHRpZiAocmVmZXJlbmNlR3JvdXBJZCAhPT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRcdFx0cmFuZ2VTZWxlY3Rpb24gPSB0aGlzLmxpc3QuZmlsdGVySW5kaWNlc0J5R3JvdXAocmFuZ2VTZWxlY3Rpb24sIHJlZmVyZW5jZUdyb3VwSWQpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cblx0XHRcdGNvbnN0IHNlbGVjdGlvbiA9IHRoaXMubGlzdC5nZXRTZWxlY3Rpb24oKTtcblx0XHRcdGNvbnN0IGNvbnRpZ3VvdXNSYW5nZSA9IGdldENvbnRpZ3VvdXNSYW5nZUNvbnRhaW5pbmcoZGlzanVuY3Rpb24oc2VsZWN0aW9uLCBbYW5jaG9yXSksIGFuY2hvcik7XG5cblx0XHRcdGlmIChjb250aWd1b3VzUmFuZ2UubGVuZ3RoID09PSAwKSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblxuXHRcdFx0Y29uc3QgbmV3U2VsZWN0aW9uID0gZGlzanVuY3Rpb24ocmFuZ2VTZWxlY3Rpb24sIHJlbGF0aXZlQ29tcGxlbWVudChzZWxlY3Rpb24sIGNvbnRpZ3VvdXNSYW5nZSkpO1xuXHRcdFx0dGhpcy5saXN0LnNldFNlbGVjdGlvbihuZXdTZWxlY3Rpb24sIGUuYnJvd3NlckV2ZW50KTtcblx0XHRcdHRoaXMubGlzdC5zZXRGb2N1cyhbZm9jdXNdLCBlLmJyb3dzZXJFdmVudCk7XG5cblx0XHR9IGVsc2UgaWYgKHRoaXMuaXNTZWxlY3Rpb25TaW5nbGVDaGFuZ2VFdmVudChlKSkge1xuXHRcdFx0Y29uc3Qgc2VsZWN0aW9uID0gdGhpcy5saXN0LmdldFNlbGVjdGlvbigpO1xuXHRcdFx0Y29uc3QgbmV3U2VsZWN0aW9uID0gc2VsZWN0aW9uLmZpbHRlcihpID0+IGkgIT09IGZvY3VzKTtcblxuXHRcdFx0dGhpcy5saXN0LnNldEZvY3VzKFtmb2N1c10pO1xuXHRcdFx0dGhpcy5saXN0LnNldEFuY2hvcihmb2N1cyk7XG5cblx0XHRcdGNvbnN0IGZvY3VzR3JvdXBJZCA9IHRoaXMubGlzdC5nZXRFbGVtZW50R3JvdXBJZChmb2N1cyk7XG5cdFx0XHRpZiAoZm9jdXNHcm91cElkID09PSBOb3RTZWxlY3RhYmxlR3JvdXBJZCkge1xuXHRcdFx0XHRyZXR1cm47IC8vIENhbm5vdCBzZWxlY3QgdGhpcyBlbGVtZW50LCBkbyBub3RoaW5nXG5cdFx0XHR9XG5cblx0XHRcdGlmIChzZWxlY3Rpb24ubGVuZ3RoID09PSBuZXdTZWxlY3Rpb24ubGVuZ3RoKSB7XG5cdFx0XHRcdGNvbnN0IGl0ZW1zVG9CZVNlbGVjdGVkID0gZm9jdXNHcm91cElkICE9PSB1bmRlZmluZWQgP1xuXHRcdFx0XHRcdHRoaXMubGlzdC5maWx0ZXJJbmRpY2VzQnlHcm91cChbLi4ubmV3U2VsZWN0aW9uLCBmb2N1c10sIGZvY3VzR3JvdXBJZClcblx0XHRcdFx0XHQ6IFsuLi5uZXdTZWxlY3Rpb24sIGZvY3VzXTtcblx0XHRcdFx0dGhpcy5saXN0LnNldFNlbGVjdGlvbihpdGVtc1RvQmVTZWxlY3RlZCwgZS5icm93c2VyRXZlbnQpO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0dGhpcy5saXN0LnNldFNlbGVjdGlvbihuZXdTZWxlY3Rpb24sIGUuYnJvd3NlckV2ZW50KTtcblx0XHRcdH1cblx0XHR9XG5cdH1cblxuXHRkaXNwb3NlKCkge1xuXHRcdHRoaXMuZGlzcG9zYWJsZXMuZGlzcG9zZSgpO1xuXHR9XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgSU11bHRpcGxlU2VsZWN0aW9uQ29udHJvbGxlcjxUPiB7XG5cdGlzU2VsZWN0aW9uU2luZ2xlQ2hhbmdlRXZlbnQoZXZlbnQ6IElMaXN0TW91c2VFdmVudDxUPiB8IElMaXN0VG91Y2hFdmVudDxUPik6IGJvb2xlYW47XG5cdGlzU2VsZWN0aW9uUmFuZ2VDaGFuZ2VFdmVudChldmVudDogSUxpc3RNb3VzZUV2ZW50PFQ+IHwgSUxpc3RUb3VjaEV2ZW50PFQ+KTogYm9vbGVhbjtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBJU3R5bGVDb250cm9sbGVyIHtcblx0c3R5bGUoc3R5bGVzOiBJTGlzdFN0eWxlcyk6IHZvaWQ7XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgSUxpc3RBY2Nlc3NpYmlsaXR5UHJvdmlkZXI8VD4gZXh0ZW5kcyBJTGlzdFZpZXdBY2Nlc3NpYmlsaXR5UHJvdmlkZXI8VD4ge1xuXHRnZXRBcmlhTGFiZWwoZWxlbWVudDogVCk6IHN0cmluZyB8IElPYnNlcnZhYmxlPHN0cmluZz4gfCBudWxsO1xuXHRnZXRXaWRnZXRBcmlhTGFiZWwoKTogc3RyaW5nIHwgSU9ic2VydmFibGU8c3RyaW5nPjtcblx0Z2V0V2lkZ2V0Um9sZT8oKTogQXJpYVJvbGU7XG5cdGdldEFyaWFMZXZlbD8oZWxlbWVudDogVCk6IG51bWJlciB8IHVuZGVmaW5lZDtcblx0cmVhZG9ubHkgb25EaWRDaGFuZ2VBY3RpdmVEZXNjZW5kYW50PzogRXZlbnQ8dm9pZD47XG5cdGdldEFjdGl2ZURlc2NlbmRhbnRJZD8oZWxlbWVudDogVCk6IHN0cmluZyB8IHVuZGVmaW5lZDtcbn1cblxuZXhwb3J0IGNsYXNzIERlZmF1bHRTdHlsZUNvbnRyb2xsZXIgaW1wbGVtZW50cyBJU3R5bGVDb250cm9sbGVyIHtcblxuXHRjb25zdHJ1Y3Rvcihwcml2YXRlIHN0eWxlRWxlbWVudDogSFRNTFN0eWxlRWxlbWVudCwgcHJpdmF0ZSBzZWxlY3RvclN1ZmZpeDogc3RyaW5nKSB7IH1cblxuXHRzdHlsZShzdHlsZXM6IElMaXN0U3R5bGVzKTogdm9pZCB7XG5cdFx0Y29uc3Qgc3VmZml4ID0gdGhpcy5zZWxlY3RvclN1ZmZpeCAmJiBgLiR7dGhpcy5zZWxlY3RvclN1ZmZpeH1gO1xuXHRcdGNvbnN0IGNvbnRlbnQ6IHN0cmluZ1tdID0gW107XG5cblx0XHRpZiAoc3R5bGVzLmxpc3RCYWNrZ3JvdW5kKSB7XG5cdFx0XHRjb250ZW50LnB1c2goYC5tb25hY28tbGlzdCR7c3VmZml4fSAubW9uYWNvLWxpc3Qtcm93cyB7IGJhY2tncm91bmQ6ICR7c3R5bGVzLmxpc3RCYWNrZ3JvdW5kfTsgfWApO1xuXHRcdH1cblxuXHRcdGlmIChzdHlsZXMubGlzdEZvY3VzQmFja2dyb3VuZCkge1xuXHRcdFx0Y29udGVudC5wdXNoKGAubW9uYWNvLWxpc3Qke3N1ZmZpeH06Zm9jdXMgLm1vbmFjby1saXN0LXJvdy5mb2N1c2VkIHsgYmFja2dyb3VuZC1jb2xvcjogJHtzdHlsZXMubGlzdEZvY3VzQmFja2dyb3VuZH07IH1gKTtcblx0XHRcdGNvbnRlbnQucHVzaChgLm1vbmFjby1saXN0JHtzdWZmaXh9OmZvY3VzIC5tb25hY28tbGlzdC1yb3cuZm9jdXNlZDpob3ZlciB7IGJhY2tncm91bmQtY29sb3I6ICR7c3R5bGVzLmxpc3RGb2N1c0JhY2tncm91bmR9OyB9YCk7IC8vIG92ZXJ3cml0ZSA6aG92ZXIgc3R5bGUgaW4gdGhpcyBjYXNlIVxuXHRcdH1cblxuXHRcdGlmIChzdHlsZXMubGlzdEZvY3VzRm9yZWdyb3VuZCkge1xuXHRcdFx0Y29udGVudC5wdXNoKGAubW9uYWNvLWxpc3Qke3N1ZmZpeH06Zm9jdXMgLm1vbmFjby1saXN0LXJvdy5mb2N1c2VkIHsgY29sb3I6ICR7c3R5bGVzLmxpc3RGb2N1c0ZvcmVncm91bmR9OyB9YCk7XG5cdFx0fVxuXG5cdFx0aWYgKHN0eWxlcy5saXN0QWN0aXZlU2VsZWN0aW9uQmFja2dyb3VuZCkge1xuXHRcdFx0Y29udGVudC5wdXNoKGAubW9uYWNvLWxpc3Qke3N1ZmZpeH06Zm9jdXMgLm1vbmFjby1saXN0LXJvdy5zZWxlY3RlZCB7IGJhY2tncm91bmQtY29sb3I6ICR7c3R5bGVzLmxpc3RBY3RpdmVTZWxlY3Rpb25CYWNrZ3JvdW5kfTsgfWApO1xuXHRcdFx0Y29udGVudC5wdXNoKGAubW9uYWNvLWxpc3Qke3N1ZmZpeH06Zm9jdXMgLm1vbmFjby1saXN0LXJvdy5zZWxlY3RlZDpob3ZlciB7IGJhY2tncm91bmQtY29sb3I6ICR7c3R5bGVzLmxpc3RBY3RpdmVTZWxlY3Rpb25CYWNrZ3JvdW5kfTsgfWApOyAvLyBvdmVyd3JpdGUgOmhvdmVyIHN0eWxlIGluIHRoaXMgY2FzZSFcblx0XHR9XG5cblx0XHRpZiAoc3R5bGVzLmxpc3RBY3RpdmVTZWxlY3Rpb25Gb3JlZ3JvdW5kKSB7XG5cdFx0XHRjb250ZW50LnB1c2goYC5tb25hY28tbGlzdCR7c3VmZml4fTpmb2N1cyAubW9uYWNvLWxpc3Qtcm93LnNlbGVjdGVkIHsgY29sb3I6ICR7c3R5bGVzLmxpc3RBY3RpdmVTZWxlY3Rpb25Gb3JlZ3JvdW5kfTsgfWApO1xuXHRcdH1cblxuXHRcdGlmIChzdHlsZXMubGlzdEFjdGl2ZVNlbGVjdGlvbkljb25Gb3JlZ3JvdW5kKSB7XG5cdFx0XHRjb250ZW50LnB1c2goYC5tb25hY28tbGlzdCR7c3VmZml4fTpmb2N1cyAubW9uYWNvLWxpc3Qtcm93LnNlbGVjdGVkIC5jb2RpY29uIHsgY29sb3I6ICR7c3R5bGVzLmxpc3RBY3RpdmVTZWxlY3Rpb25JY29uRm9yZWdyb3VuZH07IH1gKTtcblx0XHR9XG5cblx0XHRpZiAoc3R5bGVzLmxpc3RGb2N1c0FuZFNlbGVjdGlvbkJhY2tncm91bmQpIHtcblx0XHRcdGNvbnRlbnQucHVzaChgXG5cdFx0XHRcdC5tb25hY28tZHJhZy1pbWFnZSR7c3VmZml4fSxcblx0XHRcdFx0Lm1vbmFjby1saXN0JHtzdWZmaXh9OmZvY3VzIC5tb25hY28tbGlzdC1yb3cuc2VsZWN0ZWQuZm9jdXNlZCB7IGJhY2tncm91bmQtY29sb3I6ICR7c3R5bGVzLmxpc3RGb2N1c0FuZFNlbGVjdGlvbkJhY2tncm91bmR9OyB9XG5cdFx0XHRgKTtcblx0XHR9XG5cblx0XHRpZiAoc3R5bGVzLmxpc3RGb2N1c0FuZFNlbGVjdGlvbkZvcmVncm91bmQpIHtcblx0XHRcdGNvbnRlbnQucHVzaChgXG5cdFx0XHRcdC5tb25hY28tZHJhZy1pbWFnZSR7c3VmZml4fSxcblx0XHRcdFx0Lm1vbmFjby1saXN0JHtzdWZmaXh9OmZvY3VzIC5tb25hY28tbGlzdC1yb3cuc2VsZWN0ZWQuZm9jdXNlZCB7IGNvbG9yOiAke3N0eWxlcy5saXN0Rm9jdXNBbmRTZWxlY3Rpb25Gb3JlZ3JvdW5kfTsgfVxuXHRcdFx0YCk7XG5cdFx0fVxuXG5cdFx0aWYgKHN0eWxlcy5saXN0SW5hY3RpdmVGb2N1c0ZvcmVncm91bmQpIHtcblx0XHRcdGNvbnRlbnQucHVzaChgLm1vbmFjby1saXN0JHtzdWZmaXh9IC5tb25hY28tbGlzdC1yb3cuZm9jdXNlZCB7IGNvbG9yOiAgJHtzdHlsZXMubGlzdEluYWN0aXZlRm9jdXNGb3JlZ3JvdW5kfTsgfWApO1xuXHRcdFx0Y29udGVudC5wdXNoKGAubW9uYWNvLWxpc3Qke3N1ZmZpeH0gLm1vbmFjby1saXN0LXJvdy5mb2N1c2VkOmhvdmVyIHsgY29sb3I6ICAke3N0eWxlcy5saXN0SW5hY3RpdmVGb2N1c0ZvcmVncm91bmR9OyB9YCk7IC8vIG92ZXJ3cml0ZSA6aG92ZXIgc3R5bGUgaW4gdGhpcyBjYXNlIVxuXHRcdH1cblxuXHRcdGlmIChzdHlsZXMubGlzdEluYWN0aXZlU2VsZWN0aW9uSWNvbkZvcmVncm91bmQpIHtcblx0XHRcdGNvbnRlbnQucHVzaChgLm1vbmFjby1saXN0JHtzdWZmaXh9IC5tb25hY28tbGlzdC1yb3cuZm9jdXNlZCAuY29kaWNvbiB7IGNvbG9yOiAgJHtzdHlsZXMubGlzdEluYWN0aXZlU2VsZWN0aW9uSWNvbkZvcmVncm91bmR9OyB9YCk7XG5cdFx0fVxuXG5cdFx0aWYgKHN0eWxlcy5saXN0SW5hY3RpdmVGb2N1c0JhY2tncm91bmQpIHtcblx0XHRcdGNvbnRlbnQucHVzaChgLm1vbmFjby1saXN0JHtzdWZmaXh9IC5tb25hY28tbGlzdC1yb3cuZm9jdXNlZCB7IGJhY2tncm91bmQtY29sb3I6ICAke3N0eWxlcy5saXN0SW5hY3RpdmVGb2N1c0JhY2tncm91bmR9OyB9YCk7XG5cdFx0XHRjb250ZW50LnB1c2goYC5tb25hY28tbGlzdCR7c3VmZml4fSAubW9uYWNvLWxpc3Qtcm93LmZvY3VzZWQ6aG92ZXIgeyBiYWNrZ3JvdW5kLWNvbG9yOiAgJHtzdHlsZXMubGlzdEluYWN0aXZlRm9jdXNCYWNrZ3JvdW5kfTsgfWApOyAvLyBvdmVyd3JpdGUgOmhvdmVyIHN0eWxlIGluIHRoaXMgY2FzZSFcblx0XHR9XG5cblx0XHRpZiAoc3R5bGVzLmxpc3RJbmFjdGl2ZVNlbGVjdGlvbkJhY2tncm91bmQpIHtcblx0XHRcdGNvbnRlbnQucHVzaChgLm1vbmFjby1saXN0JHtzdWZmaXh9IC5tb25hY28tbGlzdC1yb3cuc2VsZWN0ZWQgeyBiYWNrZ3JvdW5kLWNvbG9yOiAgJHtzdHlsZXMubGlzdEluYWN0aXZlU2VsZWN0aW9uQmFja2dyb3VuZH07IH1gKTtcblx0XHRcdGNvbnRlbnQucHVzaChgLm1vbmFjby1saXN0JHtzdWZmaXh9IC5tb25hY28tbGlzdC1yb3cuc2VsZWN0ZWQ6aG92ZXIgeyBiYWNrZ3JvdW5kLWNvbG9yOiAgJHtzdHlsZXMubGlzdEluYWN0aXZlU2VsZWN0aW9uQmFja2dyb3VuZH07IH1gKTsgLy8gb3ZlcndyaXRlIDpob3ZlciBzdHlsZSBpbiB0aGlzIGNhc2UhXG5cdFx0fVxuXG5cdFx0aWYgKHN0eWxlcy5saXN0SW5hY3RpdmVTZWxlY3Rpb25Gb3JlZ3JvdW5kKSB7XG5cdFx0XHRjb250ZW50LnB1c2goYC5tb25hY28tbGlzdCR7c3VmZml4fSAubW9uYWNvLWxpc3Qtcm93LnNlbGVjdGVkIHsgY29sb3I6ICR7c3R5bGVzLmxpc3RJbmFjdGl2ZVNlbGVjdGlvbkZvcmVncm91bmR9OyB9YCk7XG5cdFx0fVxuXG5cdFx0aWYgKHN0eWxlcy5saXN0SG92ZXJCYWNrZ3JvdW5kKSB7XG5cdFx0XHRjb250ZW50LnB1c2goYC5tb25hY28tbGlzdCR7c3VmZml4fTpub3QoLmRyb3AtdGFyZ2V0KTpub3QoLmRyYWdnaW5nKSAubW9uYWNvLWxpc3Qtcm93OmhvdmVyOm5vdCguc2VsZWN0ZWQpOm5vdCguZm9jdXNlZCkgeyBiYWNrZ3JvdW5kLWNvbG9yOiAke3N0eWxlcy5saXN0SG92ZXJCYWNrZ3JvdW5kfTsgfWApO1xuXHRcdH1cblxuXHRcdGlmIChzdHlsZXMubGlzdEhvdmVyRm9yZWdyb3VuZCkge1xuXHRcdFx0Y29udGVudC5wdXNoKGAubW9uYWNvLWxpc3Qke3N1ZmZpeH06bm90KC5kcm9wLXRhcmdldCk6bm90KC5kcmFnZ2luZykgLm1vbmFjby1saXN0LXJvdzpob3Zlcjpub3QoLnNlbGVjdGVkKTpub3QoLmZvY3VzZWQpIHsgY29sb3I6ICAke3N0eWxlcy5saXN0SG92ZXJGb3JlZ3JvdW5kfTsgfWApO1xuXHRcdH1cblxuXHRcdC8qKlxuXHRcdCAqIE91dGxpbmVzXG5cdFx0ICovXG5cdFx0Y29uc3QgZm9jdXNBbmRTZWxlY3Rpb25PdXRsaW5lID0gYXNDc3NWYWx1ZVdpdGhEZWZhdWx0KHN0eWxlcy5saXN0Rm9jdXNBbmRTZWxlY3Rpb25PdXRsaW5lLCBhc0Nzc1ZhbHVlV2l0aERlZmF1bHQoc3R5bGVzLmxpc3RTZWxlY3Rpb25PdXRsaW5lLCBzdHlsZXMubGlzdEZvY3VzT3V0bGluZSA/PyAnJykpO1xuXHRcdGlmIChmb2N1c0FuZFNlbGVjdGlvbk91dGxpbmUpIHsgLy8gZGVmYXVsdDogbGlzdEZvY3VzT3V0bGluZVxuXHRcdFx0Y29udGVudC5wdXNoKGAubW9uYWNvLWxpc3Qke3N1ZmZpeH06Zm9jdXMgLm1vbmFjby1saXN0LXJvdy5mb2N1c2VkLnNlbGVjdGVkIHsgb3V0bGluZTogMXB4IHNvbGlkICR7Zm9jdXNBbmRTZWxlY3Rpb25PdXRsaW5lfTsgb3V0bGluZS1vZmZzZXQ6IC0xcHg7fWApO1xuXHRcdH1cblxuXHRcdGlmIChzdHlsZXMubGlzdEZvY3VzT3V0bGluZSkgeyAvLyBkZWZhdWx0OiBzZXRcblx0XHRcdGNvbnRlbnQucHVzaChgXG5cdFx0XHRcdC5tb25hY28tZHJhZy1pbWFnZSR7c3VmZml4fSxcblx0XHRcdFx0Lm1vbmFjby1saXN0JHtzdWZmaXh9OmZvY3VzIC5tb25hY28tbGlzdC1yb3cuZm9jdXNlZCxcblx0XHRcdFx0LmNvbnRleHQtbWVudS12aXNpYmxlIC5tb25hY28tbGlzdCR7c3VmZml4fS5sYXN0LWZvY3VzZWQgLm1vbmFjby1saXN0LXJvdy5mb2N1c2VkIHsgb3V0bGluZTogMXB4IHNvbGlkICR7c3R5bGVzLmxpc3RGb2N1c091dGxpbmV9OyBvdXRsaW5lLW9mZnNldDogLTFweDsgfVxuXHRcdFx0YCk7XG5cdFx0fVxuXG5cdFx0Y29uc3QgaW5hY3RpdmVGb2N1c0FuZFNlbGVjdGlvbk91dGxpbmUgPSBhc0Nzc1ZhbHVlV2l0aERlZmF1bHQoc3R5bGVzLmxpc3RTZWxlY3Rpb25PdXRsaW5lLCBzdHlsZXMubGlzdEluYWN0aXZlRm9jdXNPdXRsaW5lID8/ICcnKTtcblx0XHRpZiAoaW5hY3RpdmVGb2N1c0FuZFNlbGVjdGlvbk91dGxpbmUpIHtcblx0XHRcdGNvbnRlbnQucHVzaChgLm1vbmFjby1saXN0JHtzdWZmaXh9IC5tb25hY28tbGlzdC1yb3cuZm9jdXNlZC5zZWxlY3RlZCB7IG91dGxpbmU6IDFweCBkb3R0ZWQgJHtpbmFjdGl2ZUZvY3VzQW5kU2VsZWN0aW9uT3V0bGluZX07IG91dGxpbmUtb2Zmc2V0OiAtMXB4OyB9YCk7XG5cdFx0fVxuXG5cdFx0aWYgKHN0eWxlcy5saXN0U2VsZWN0aW9uT3V0bGluZSkgeyAvLyBkZWZhdWx0OiBhY3RpdmVDb250cmFzdEJvcmRlclxuXHRcdFx0Y29udGVudC5wdXNoKGAubW9uYWNvLWxpc3Qke3N1ZmZpeH0gLm1vbmFjby1saXN0LXJvdy5zZWxlY3RlZCB7IG91dGxpbmU6IDFweCBkb3R0ZWQgJHtzdHlsZXMubGlzdFNlbGVjdGlvbk91dGxpbmV9OyBvdXRsaW5lLW9mZnNldDogLTFweDsgfWApO1xuXHRcdH1cblxuXHRcdGlmIChzdHlsZXMubGlzdEluYWN0aXZlRm9jdXNPdXRsaW5lKSB7IC8vIGRlZmF1bHQ6IG51bGxcblx0XHRcdGNvbnRlbnQucHVzaChgLm1vbmFjby1saXN0JHtzdWZmaXh9IC5tb25hY28tbGlzdC1yb3cuZm9jdXNlZCB7IG91dGxpbmU6IDFweCBkb3R0ZWQgJHtzdHlsZXMubGlzdEluYWN0aXZlRm9jdXNPdXRsaW5lfTsgb3V0bGluZS1vZmZzZXQ6IC0xcHg7IH1gKTtcblx0XHR9XG5cblx0XHRpZiAoc3R5bGVzLmxpc3RIb3Zlck91dGxpbmUpIHsgIC8vIGRlZmF1bHQ6IGFjdGl2ZUNvbnRyYXN0Qm9yZGVyXG5cdFx0XHRjb250ZW50LnB1c2goYC5tb25hY28tbGlzdCR7c3VmZml4fSAubW9uYWNvLWxpc3Qtcm93OmhvdmVyIHsgb3V0bGluZTogMXB4IGRhc2hlZCAke3N0eWxlcy5saXN0SG92ZXJPdXRsaW5lfTsgb3V0bGluZS1vZmZzZXQ6IC0xcHg7IH1gKTtcblx0XHR9XG5cblx0XHRpZiAoc3R5bGVzLmxpc3REcm9wT3ZlckJhY2tncm91bmQpIHtcblx0XHRcdGNvbnRlbnQucHVzaChgXG5cdFx0XHRcdC5tb25hY28tbGlzdCR7c3VmZml4fS5kcm9wLXRhcmdldCxcblx0XHRcdFx0Lm1vbmFjby1saXN0JHtzdWZmaXh9IC5tb25hY28tbGlzdC1yb3dzLmRyb3AtdGFyZ2V0LFxuXHRcdFx0XHQubW9uYWNvLWxpc3Qke3N1ZmZpeH0gLm1vbmFjby1saXN0LXJvdy5kcm9wLXRhcmdldCB7IGJhY2tncm91bmQtY29sb3I6ICR7c3R5bGVzLmxpc3REcm9wT3ZlckJhY2tncm91bmR9ICFpbXBvcnRhbnQ7IGNvbG9yOiBpbmhlcml0ICFpbXBvcnRhbnQ7IH1cblx0XHRcdGApO1xuXHRcdH1cblxuXHRcdGlmIChzdHlsZXMubGlzdERyb3BCZXR3ZWVuQmFja2dyb3VuZCkge1xuXHRcdFx0Y29udGVudC5wdXNoKGBcblx0XHRcdC5tb25hY28tbGlzdCR7c3VmZml4fSAubW9uYWNvLWxpc3Qtcm93cy5kcm9wLXRhcmdldC1iZWZvcmUgLm1vbmFjby1saXN0LXJvdzpmaXJzdC1jaGlsZDo6YmVmb3JlLFxuXHRcdFx0Lm1vbmFjby1saXN0JHtzdWZmaXh9IC5tb25hY28tbGlzdC1yb3cuZHJvcC10YXJnZXQtYmVmb3JlOjpiZWZvcmUge1xuXHRcdFx0XHRjb250ZW50OiBcIlwiOyBwb3NpdGlvbjogYWJzb2x1dGU7IHRvcDogMHB4OyBsZWZ0OiAwcHg7IHdpZHRoOiAxMDAlOyBoZWlnaHQ6IDFweDtcblx0XHRcdFx0YmFja2dyb3VuZC1jb2xvcjogJHtzdHlsZXMubGlzdERyb3BCZXR3ZWVuQmFja2dyb3VuZH07XG5cdFx0XHR9YCk7XG5cdFx0XHRjb250ZW50LnB1c2goYFxuXHRcdFx0Lm1vbmFjby1saXN0JHtzdWZmaXh9IC5tb25hY28tbGlzdC1yb3dzLmRyb3AtdGFyZ2V0LWFmdGVyIC5tb25hY28tbGlzdC1yb3c6bGFzdC1jaGlsZDo6YWZ0ZXIsXG5cdFx0XHQubW9uYWNvLWxpc3Qke3N1ZmZpeH0gLm1vbmFjby1saXN0LXJvdy5kcm9wLXRhcmdldC1hZnRlcjo6YWZ0ZXIge1xuXHRcdFx0XHRjb250ZW50OiBcIlwiOyBwb3NpdGlvbjogYWJzb2x1dGU7IGJvdHRvbTogMHB4OyBsZWZ0OiAwcHg7IHdpZHRoOiAxMDAlOyBoZWlnaHQ6IDFweDtcblx0XHRcdFx0YmFja2dyb3VuZC1jb2xvcjogJHtzdHlsZXMubGlzdERyb3BCZXR3ZWVuQmFja2dyb3VuZH07XG5cdFx0XHR9YCk7XG5cdFx0fVxuXG5cdFx0aWYgKHN0eWxlcy50YWJsZUNvbHVtbnNCb3JkZXIpIHtcblx0XHRcdGNvbnRlbnQucHVzaChgXG5cdFx0XHRcdC5tb25hY28tdGFibGUgPiAubW9uYWNvLXNwbGl0LXZpZXcyLFxuXHRcdFx0XHQubW9uYWNvLXRhYmxlID4gLm1vbmFjby1zcGxpdC12aWV3MiAubW9uYWNvLXNhc2gudmVydGljYWw6OmJlZm9yZSxcblx0XHRcdFx0Lm1vbmFjby1lbmFibGUtbW90aW9uIC5tb25hY28tdGFibGU6aG92ZXIgPiAubW9uYWNvLXNwbGl0LXZpZXcyLFxuXHRcdFx0XHQubW9uYWNvLWVuYWJsZS1tb3Rpb24gLm1vbmFjby10YWJsZTpob3ZlciA+IC5tb25hY28tc3BsaXQtdmlldzIgLm1vbmFjby1zYXNoLnZlcnRpY2FsOjpiZWZvcmUge1xuXHRcdFx0XHRcdGJvcmRlci1jb2xvcjogJHtzdHlsZXMudGFibGVDb2x1bW5zQm9yZGVyfTtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdC5tb25hY28tZW5hYmxlLW1vdGlvbiAubW9uYWNvLXRhYmxlID4gLm1vbmFjby1zcGxpdC12aWV3Mixcblx0XHRcdFx0Lm1vbmFjby1lbmFibGUtbW90aW9uIC5tb25hY28tdGFibGUgPiAubW9uYWNvLXNwbGl0LXZpZXcyIC5tb25hY28tc2FzaC52ZXJ0aWNhbDo6YmVmb3JlIHtcblx0XHRcdFx0XHRib3JkZXItY29sb3I6IHRyYW5zcGFyZW50O1xuXHRcdFx0XHR9XG5cdFx0XHRgKTtcblx0XHR9XG5cblx0XHRpZiAoc3R5bGVzLnRhYmxlT2RkUm93c0JhY2tncm91bmRDb2xvcikge1xuXHRcdFx0Y29udGVudC5wdXNoKGBcblx0XHRcdFx0Lm1vbmFjby10YWJsZSAubW9uYWNvLWxpc3Qtcm93W2RhdGEtcGFyaXR5PW9kZF06bm90KC5mb2N1c2VkKTpub3QoLnNlbGVjdGVkKTpub3QoOmhvdmVyKSAubW9uYWNvLXRhYmxlLXRyLFxuXHRcdFx0XHQubW9uYWNvLXRhYmxlIC5tb25hY28tbGlzdDpub3QoOmZvY3VzKSAubW9uYWNvLWxpc3Qtcm93W2RhdGEtcGFyaXR5PW9kZF0uZm9jdXNlZDpub3QoLnNlbGVjdGVkKTpub3QoOmhvdmVyKSAubW9uYWNvLXRhYmxlLXRyLFxuXHRcdFx0XHQubW9uYWNvLXRhYmxlIC5tb25hY28tbGlzdDpub3QoLmZvY3VzZWQpIC5tb25hY28tbGlzdC1yb3dbZGF0YS1wYXJpdHk9b2RkXS5mb2N1c2VkOm5vdCguc2VsZWN0ZWQpOm5vdCg6aG92ZXIpIC5tb25hY28tdGFibGUtdHIge1xuXHRcdFx0XHRcdGJhY2tncm91bmQtY29sb3I6ICR7c3R5bGVzLnRhYmxlT2RkUm93c0JhY2tncm91bmRDb2xvcn07XG5cdFx0XHRcdH1cblx0XHRcdGApO1xuXHRcdH1cblxuXHRcdHRoaXMuc3R5bGVFbGVtZW50LnRleHRDb250ZW50ID0gY29udGVudC5qb2luKCdcXG4nKTtcblx0fVxufVxuXG5leHBvcnQgaW50ZXJmYWNlIElLZXlib2FyZE5hdmlnYXRpb25FdmVudEZpbHRlciB7XG5cdChlOiBTdGFuZGFyZEtleWJvYXJkRXZlbnQpOiBib29sZWFuO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIElMaXN0T3B0aW9uc1VwZGF0ZSBleHRlbmRzIElMaXN0Vmlld09wdGlvbnNVcGRhdGUge1xuXHRyZWFkb25seSB0eXBlTmF2aWdhdGlvbkVuYWJsZWQ/OiBib29sZWFuO1xuXHRyZWFkb25seSB0eXBlTmF2aWdhdGlvbk1vZGU/OiBUeXBlTmF2aWdhdGlvbk1vZGU7XG5cdHJlYWRvbmx5IG11bHRpcGxlU2VsZWN0aW9uU3VwcG9ydD86IGJvb2xlYW47XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgSUxpc3RPcHRpb25zPFQ+IGV4dGVuZHMgSUxpc3RPcHRpb25zVXBkYXRlIHtcblx0cmVhZG9ubHkgaWRlbnRpdHlQcm92aWRlcj86IElJZGVudGl0eVByb3ZpZGVyPFQ+O1xuXHRyZWFkb25seSBkbmQ/OiBJTGlzdERyYWdBbmREcm9wPFQ+O1xuXHRyZWFkb25seSBrZXlib2FyZE5hdmlnYXRpb25MYWJlbFByb3ZpZGVyPzogSUtleWJvYXJkTmF2aWdhdGlvbkxhYmVsUHJvdmlkZXI8VD47XG5cdHJlYWRvbmx5IGtleWJvYXJkTmF2aWdhdGlvbkRlbGVnYXRlPzogSUtleWJvYXJkTmF2aWdhdGlvbkRlbGVnYXRlO1xuXHRyZWFkb25seSBrZXlib2FyZFN1cHBvcnQ/OiBib29sZWFuO1xuXHRyZWFkb25seSBtdWx0aXBsZVNlbGVjdGlvbkNvbnRyb2xsZXI/OiBJTXVsdGlwbGVTZWxlY3Rpb25Db250cm9sbGVyPFQ+O1xuXHRyZWFkb25seSBzdHlsZUNvbnRyb2xsZXI/OiAoc3VmZml4OiBzdHJpbmcpID0+IElTdHlsZUNvbnRyb2xsZXI7XG5cdHJlYWRvbmx5IGFjY2Vzc2liaWxpdHlQcm92aWRlcj86IElMaXN0QWNjZXNzaWJpbGl0eVByb3ZpZGVyPFQ+O1xuXHRyZWFkb25seSBrZXlib2FyZE5hdmlnYXRpb25FdmVudEZpbHRlcj86IElLZXlib2FyZE5hdmlnYXRpb25FdmVudEZpbHRlcjtcblxuXHQvLyBsaXN0IHZpZXcgb3B0aW9uc1xuXHRyZWFkb25seSB1c2VTaGFkb3dzPzogYm9vbGVhbjtcblx0cmVhZG9ubHkgdmVydGljYWxTY3JvbGxNb2RlPzogU2Nyb2xsYmFyVmlzaWJpbGl0eTtcblx0cmVhZG9ubHkgc2V0Um93TGluZUhlaWdodD86IGJvb2xlYW47XG5cdHJlYWRvbmx5IHNldFJvd0hlaWdodD86IGJvb2xlYW47XG5cdHJlYWRvbmx5IHN1cHBvcnREeW5hbWljSGVpZ2h0cz86IGJvb2xlYW47XG5cdHJlYWRvbmx5IG1vdXNlU3VwcG9ydD86IGJvb2xlYW47XG5cdHJlYWRvbmx5IHVzZXJTZWxlY3Rpb24/OiBib29sZWFuO1xuXHRyZWFkb25seSBob3Jpem9udGFsU2Nyb2xsaW5nPzogYm9vbGVhbjtcblx0cmVhZG9ubHkgc2Nyb2xsQnlQYWdlPzogYm9vbGVhbjtcblx0cmVhZG9ubHkgdHJhbnNmb3JtT3B0aW1pemF0aW9uPzogYm9vbGVhbjtcblx0cmVhZG9ubHkgc21vb3RoU2Nyb2xsaW5nPzogYm9vbGVhbjtcblx0cmVhZG9ubHkgc2Nyb2xsYWJsZUVsZW1lbnRDaGFuZ2VPcHRpb25zPzogU2Nyb2xsYWJsZUVsZW1lbnRDaGFuZ2VPcHRpb25zO1xuXHRyZWFkb25seSBhbHdheXNDb25zdW1lTW91c2VXaGVlbD86IGJvb2xlYW47XG5cdHJlYWRvbmx5IGluaXRpYWxTaXplPzogRGltZW5zaW9uO1xuXHRyZWFkb25seSBwYWRkaW5nVG9wPzogbnVtYmVyO1xuXHRyZWFkb25seSBwYWRkaW5nQm90dG9tPzogbnVtYmVyO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIElMaXN0U3R5bGVzIHtcblx0bGlzdEJhY2tncm91bmQ6IHN0cmluZyB8IHVuZGVmaW5lZDtcblx0bGlzdEZvY3VzQmFja2dyb3VuZDogc3RyaW5nIHwgdW5kZWZpbmVkO1xuXHRsaXN0Rm9jdXNGb3JlZ3JvdW5kOiBzdHJpbmcgfCB1bmRlZmluZWQ7XG5cdGxpc3RBY3RpdmVTZWxlY3Rpb25CYWNrZ3JvdW5kOiBzdHJpbmcgfCB1bmRlZmluZWQ7XG5cdGxpc3RBY3RpdmVTZWxlY3Rpb25Gb3JlZ3JvdW5kOiBzdHJpbmcgfCB1bmRlZmluZWQ7XG5cdGxpc3RBY3RpdmVTZWxlY3Rpb25JY29uRm9yZWdyb3VuZDogc3RyaW5nIHwgdW5kZWZpbmVkO1xuXHRsaXN0Rm9jdXNBbmRTZWxlY3Rpb25PdXRsaW5lOiBzdHJpbmcgfCB1bmRlZmluZWQ7XG5cdGxpc3RGb2N1c0FuZFNlbGVjdGlvbkJhY2tncm91bmQ6IHN0cmluZyB8IHVuZGVmaW5lZDtcblx0bGlzdEZvY3VzQW5kU2VsZWN0aW9uRm9yZWdyb3VuZDogc3RyaW5nIHwgdW5kZWZpbmVkO1xuXHRsaXN0SW5hY3RpdmVTZWxlY3Rpb25CYWNrZ3JvdW5kOiBzdHJpbmcgfCB1bmRlZmluZWQ7XG5cdGxpc3RJbmFjdGl2ZVNlbGVjdGlvbkljb25Gb3JlZ3JvdW5kOiBzdHJpbmcgfCB1bmRlZmluZWQ7XG5cdGxpc3RJbmFjdGl2ZVNlbGVjdGlvbkZvcmVncm91bmQ6IHN0cmluZyB8IHVuZGVmaW5lZDtcblx0bGlzdEluYWN0aXZlRm9jdXNGb3JlZ3JvdW5kOiBzdHJpbmcgfCB1bmRlZmluZWQ7XG5cdGxpc3RJbmFjdGl2ZUZvY3VzQmFja2dyb3VuZDogc3RyaW5nIHwgdW5kZWZpbmVkO1xuXHRsaXN0SG92ZXJCYWNrZ3JvdW5kOiBzdHJpbmcgfCB1bmRlZmluZWQ7XG5cdGxpc3RIb3ZlckZvcmVncm91bmQ6IHN0cmluZyB8IHVuZGVmaW5lZDtcblx0bGlzdERyb3BPdmVyQmFja2dyb3VuZDogc3RyaW5nIHwgdW5kZWZpbmVkO1xuXHRsaXN0RHJvcEJldHdlZW5CYWNrZ3JvdW5kOiBzdHJpbmcgfCB1bmRlZmluZWQ7XG5cdGxpc3RGb2N1c091dGxpbmU6IHN0cmluZyB8IHVuZGVmaW5lZDtcblx0bGlzdEluYWN0aXZlRm9jdXNPdXRsaW5lOiBzdHJpbmcgfCB1bmRlZmluZWQ7XG5cdGxpc3RTZWxlY3Rpb25PdXRsaW5lOiBzdHJpbmcgfCB1bmRlZmluZWQ7XG5cdGxpc3RIb3Zlck91dGxpbmU6IHN0cmluZyB8IHVuZGVmaW5lZDtcblx0dHJlZUluZGVudEd1aWRlc1N0cm9rZTogc3RyaW5nIHwgdW5kZWZpbmVkO1xuXHR0cmVlSW5hY3RpdmVJbmRlbnRHdWlkZXNTdHJva2U6IHN0cmluZyB8IHVuZGVmaW5lZDtcblx0dHJlZVN0aWNreVNjcm9sbEJhY2tncm91bmQ6IHN0cmluZyB8IHVuZGVmaW5lZDtcblx0dHJlZVN0aWNreVNjcm9sbEJvcmRlcjogc3RyaW5nIHwgdW5kZWZpbmVkO1xuXHR0cmVlU3RpY2t5U2Nyb2xsU2hhZG93OiBzdHJpbmcgfCB1bmRlZmluZWQ7XG5cdHRhYmxlQ29sdW1uc0JvcmRlcjogc3RyaW5nIHwgdW5kZWZpbmVkO1xuXHR0YWJsZU9kZFJvd3NCYWNrZ3JvdW5kQ29sb3I6IHN0cmluZyB8IHVuZGVmaW5lZDtcbn1cblxuZXhwb3J0IGNvbnN0IHVudGhlbWVkTGlzdFN0eWxlczogSUxpc3RTdHlsZXMgPSB7XG5cdGxpc3RGb2N1c0JhY2tncm91bmQ6ICcjN0ZCMEQwJyxcblx0bGlzdEFjdGl2ZVNlbGVjdGlvbkJhY2tncm91bmQ6ICcjMEU2MzlDJyxcblx0bGlzdEFjdGl2ZVNlbGVjdGlvbkZvcmVncm91bmQ6ICcjRkZGRkZGJyxcblx0bGlzdEFjdGl2ZVNlbGVjdGlvbkljb25Gb3JlZ3JvdW5kOiAnI0ZGRkZGRicsXG5cdGxpc3RGb2N1c0FuZFNlbGVjdGlvbk91dGxpbmU6ICcjOTBDMkY5Jyxcblx0bGlzdEZvY3VzQW5kU2VsZWN0aW9uQmFja2dyb3VuZDogJyMwOTQ3NzEnLFxuXHRsaXN0Rm9jdXNBbmRTZWxlY3Rpb25Gb3JlZ3JvdW5kOiAnI0ZGRkZGRicsXG5cdGxpc3RJbmFjdGl2ZVNlbGVjdGlvbkJhY2tncm91bmQ6ICcjM0YzRjQ2Jyxcblx0bGlzdEluYWN0aXZlU2VsZWN0aW9uSWNvbkZvcmVncm91bmQ6ICcjRkZGRkZGJyxcblx0bGlzdEhvdmVyQmFja2dyb3VuZDogJyMyQTJEMkUnLFxuXHRsaXN0RHJvcE92ZXJCYWNrZ3JvdW5kOiAnIzM4M0IzRCcsXG5cdGxpc3REcm9wQmV0d2VlbkJhY2tncm91bmQ6ICcjRUVFRUVFJyxcblx0dHJlZUluZGVudEd1aWRlc1N0cm9rZTogJyNhOWE5YTknLFxuXHR0cmVlSW5hY3RpdmVJbmRlbnRHdWlkZXNTdHJva2U6IENvbG9yLmZyb21IZXgoJyNhOWE5YTknKS50cmFuc3BhcmVudCgwLjQpLnRvU3RyaW5nKCksXG5cdHRhYmxlQ29sdW1uc0JvcmRlcjogQ29sb3IuZnJvbUhleCgnI2NjY2NjYycpLnRyYW5zcGFyZW50KDAuMikudG9TdHJpbmcoKSxcblx0dGFibGVPZGRSb3dzQmFja2dyb3VuZENvbG9yOiBDb2xvci5mcm9tSGV4KCcjY2NjY2NjJykudHJhbnNwYXJlbnQoMC4wNCkudG9TdHJpbmcoKSxcblx0bGlzdEJhY2tncm91bmQ6IHVuZGVmaW5lZCxcblx0bGlzdEZvY3VzRm9yZWdyb3VuZDogdW5kZWZpbmVkLFxuXHRsaXN0SW5hY3RpdmVTZWxlY3Rpb25Gb3JlZ3JvdW5kOiB1bmRlZmluZWQsXG5cdGxpc3RJbmFjdGl2ZUZvY3VzRm9yZWdyb3VuZDogdW5kZWZpbmVkLFxuXHRsaXN0SW5hY3RpdmVGb2N1c0JhY2tncm91bmQ6IHVuZGVmaW5lZCxcblx0bGlzdEhvdmVyRm9yZWdyb3VuZDogdW5kZWZpbmVkLFxuXHRsaXN0Rm9jdXNPdXRsaW5lOiB1bmRlZmluZWQsXG5cdGxpc3RJbmFjdGl2ZUZvY3VzT3V0bGluZTogdW5kZWZpbmVkLFxuXHRsaXN0U2VsZWN0aW9uT3V0bGluZTogdW5kZWZpbmVkLFxuXHRsaXN0SG92ZXJPdXRsaW5lOiB1bmRlZmluZWQsXG5cdHRyZWVTdGlja3lTY3JvbGxCYWNrZ3JvdW5kOiB1bmRlZmluZWQsXG5cdHRyZWVTdGlja3lTY3JvbGxCb3JkZXI6IHVuZGVmaW5lZCxcblx0dHJlZVN0aWNreVNjcm9sbFNoYWRvdzogdW5kZWZpbmVkXG59O1xuXG5jb25zdCBEZWZhdWx0T3B0aW9uczogSUxpc3RPcHRpb25zPGFueT4gPSB7XG5cdGtleWJvYXJkU3VwcG9ydDogdHJ1ZSxcblx0bW91c2VTdXBwb3J0OiB0cnVlLFxuXHRtdWx0aXBsZVNlbGVjdGlvblN1cHBvcnQ6IHRydWUsXG5cdGRuZDoge1xuXHRcdGdldERyYWdVUkkoKSB7IHJldHVybiBudWxsOyB9LFxuXHRcdG9uRHJhZ1N0YXJ0KCk6IHZvaWQgeyB9LFxuXHRcdG9uRHJhZ092ZXIoKSB7IHJldHVybiBmYWxzZTsgfSxcblx0XHRkcm9wKCkgeyB9LFxuXHRcdGRpc3Bvc2UoKSB7IH1cblx0fVxufTtcblxuLy8gVE9ET0BKb2FvOiBtb3ZlIHRoZXNlIHV0aWxzIGludG8gYSBTb3J0ZWRBcnJheSBjbGFzc1xuXG5mdW5jdGlvbiBnZXRDb250aWd1b3VzUmFuZ2VDb250YWluaW5nKHJhbmdlOiBudW1iZXJbXSwgdmFsdWU6IG51bWJlcik6IG51bWJlcltdIHtcblx0Y29uc3QgaW5kZXggPSByYW5nZS5pbmRleE9mKHZhbHVlKTtcblxuXHRpZiAoaW5kZXggPT09IC0xKSB7XG5cdFx0cmV0dXJuIFtdO1xuXHR9XG5cblx0Y29uc3QgcmVzdWx0OiBudW1iZXJbXSA9IFtdO1xuXHRsZXQgaSA9IGluZGV4IC0gMTtcblx0d2hpbGUgKGkgPj0gMCAmJiByYW5nZVtpXSA9PT0gdmFsdWUgLSAoaW5kZXggLSBpKSkge1xuXHRcdHJlc3VsdC5wdXNoKHJhbmdlW2ktLV0pO1xuXHR9XG5cblx0cmVzdWx0LnJldmVyc2UoKTtcblx0aSA9IGluZGV4O1xuXHR3aGlsZSAoaSA8IHJhbmdlLmxlbmd0aCAmJiByYW5nZVtpXSA9PT0gdmFsdWUgKyAoaSAtIGluZGV4KSkge1xuXHRcdHJlc3VsdC5wdXNoKHJhbmdlW2krK10pO1xuXHR9XG5cblx0cmV0dXJuIHJlc3VsdDtcbn1cblxuLyoqXG4gKiBHaXZlbiB0d28gc29ydGVkIGNvbGxlY3Rpb25zIG9mIG51bWJlcnMsIHJldHVybnMgdGhlIGludGVyc2VjdGlvblxuICogYmV0d2VlbiB0aGVtIChPUikuXG4gKi9cbmZ1bmN0aW9uIGRpc2p1bmN0aW9uKG9uZTogbnVtYmVyW10sIG90aGVyOiBudW1iZXJbXSk6IG51bWJlcltdIHtcblx0Y29uc3QgcmVzdWx0OiBudW1iZXJbXSA9IFtdO1xuXHRsZXQgaSA9IDAsIGogPSAwO1xuXG5cdHdoaWxlIChpIDwgb25lLmxlbmd0aCB8fCBqIDwgb3RoZXIubGVuZ3RoKSB7XG5cdFx0aWYgKGkgPj0gb25lLmxlbmd0aCkge1xuXHRcdFx0cmVzdWx0LnB1c2gob3RoZXJbaisrXSk7XG5cdFx0fSBlbHNlIGlmIChqID49IG90aGVyLmxlbmd0aCkge1xuXHRcdFx0cmVzdWx0LnB1c2gob25lW2krK10pO1xuXHRcdH0gZWxzZSBpZiAob25lW2ldID09PSBvdGhlcltqXSkge1xuXHRcdFx0cmVzdWx0LnB1c2gob25lW2ldKTtcblx0XHRcdGkrKztcblx0XHRcdGorKztcblx0XHRcdGNvbnRpbnVlO1xuXHRcdH0gZWxzZSBpZiAob25lW2ldIDwgb3RoZXJbal0pIHtcblx0XHRcdHJlc3VsdC5wdXNoKG9uZVtpKytdKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0cmVzdWx0LnB1c2gob3RoZXJbaisrXSk7XG5cdFx0fVxuXHR9XG5cblx0cmV0dXJuIHJlc3VsdDtcbn1cblxuLyoqXG4gKiBHaXZlbiB0d28gc29ydGVkIGNvbGxlY3Rpb25zIG9mIG51bWJlcnMsIHJldHVybnMgdGhlIHJlbGF0aXZlXG4gKiBjb21wbGVtZW50IGJldHdlZW4gdGhlbSAoWE9SKS5cbiAqL1xuZnVuY3Rpb24gcmVsYXRpdmVDb21wbGVtZW50KG9uZTogbnVtYmVyW10sIG90aGVyOiBudW1iZXJbXSk6IG51bWJlcltdIHtcblx0Y29uc3QgcmVzdWx0OiBudW1iZXJbXSA9IFtdO1xuXHRsZXQgaSA9IDAsIGogPSAwO1xuXG5cdHdoaWxlIChpIDwgb25lLmxlbmd0aCB8fCBqIDwgb3RoZXIubGVuZ3RoKSB7XG5cdFx0aWYgKGkgPj0gb25lLmxlbmd0aCkge1xuXHRcdFx0cmVzdWx0LnB1c2gob3RoZXJbaisrXSk7XG5cdFx0fSBlbHNlIGlmIChqID49IG90aGVyLmxlbmd0aCkge1xuXHRcdFx0cmVzdWx0LnB1c2gob25lW2krK10pO1xuXHRcdH0gZWxzZSBpZiAob25lW2ldID09PSBvdGhlcltqXSkge1xuXHRcdFx0aSsrO1xuXHRcdFx0aisrO1xuXHRcdFx0Y29udGludWU7XG5cdFx0fSBlbHNlIGlmIChvbmVbaV0gPCBvdGhlcltqXSkge1xuXHRcdFx0cmVzdWx0LnB1c2gob25lW2krK10pO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRqKys7XG5cdFx0fVxuXHR9XG5cblx0cmV0dXJuIHJlc3VsdDtcbn1cblxuY29uc3QgbnVtZXJpY1NvcnQgPSAoYTogbnVtYmVyLCBiOiBudW1iZXIpID0+IGEgLSBiO1xuXG5jbGFzcyBQaXBlbGluZVJlbmRlcmVyPFQ+IGltcGxlbWVudHMgSUxpc3RSZW5kZXJlcjxULCBhbnk+IHtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRwcml2YXRlIF90ZW1wbGF0ZUlkOiBzdHJpbmcsXG5cdFx0cHJpdmF0ZSByZW5kZXJlcnM6IElMaXN0UmVuZGVyZXI8YW55IC8qIFRPRE9Aam9hbyAqLywgYW55PltdXG5cdCkgeyB9XG5cblx0Z2V0IHRlbXBsYXRlSWQoKTogc3RyaW5nIHtcblx0XHRyZXR1cm4gdGhpcy5fdGVtcGxhdGVJZDtcblx0fVxuXG5cdHJlbmRlclRlbXBsYXRlKGNvbnRhaW5lcjogSFRNTEVsZW1lbnQpOiBhbnlbXSB7XG5cdFx0cmV0dXJuIHRoaXMucmVuZGVyZXJzLm1hcChyID0+IHIucmVuZGVyVGVtcGxhdGUoY29udGFpbmVyKSk7XG5cdH1cblxuXHRyZW5kZXJFbGVtZW50KGVsZW1lbnQ6IFQsIGluZGV4OiBudW1iZXIsIHRlbXBsYXRlRGF0YTogYW55W10sIHJlbmRlckRldGFpbHM/OiBJTGlzdEVsZW1lbnRSZW5kZXJEZXRhaWxzKTogdm9pZCB7XG5cdFx0bGV0IGkgPSAwO1xuXG5cdFx0Zm9yIChjb25zdCByZW5kZXJlciBvZiB0aGlzLnJlbmRlcmVycykge1xuXHRcdFx0cmVuZGVyZXIucmVuZGVyRWxlbWVudChlbGVtZW50LCBpbmRleCwgdGVtcGxhdGVEYXRhW2krK10sIHJlbmRlckRldGFpbHMpO1xuXHRcdH1cblx0fVxuXG5cdGRpc3Bvc2VFbGVtZW50KGVsZW1lbnQ6IFQsIGluZGV4OiBudW1iZXIsIHRlbXBsYXRlRGF0YTogYW55W10sIHJlbmRlckRldGFpbHM/OiBJTGlzdEVsZW1lbnRSZW5kZXJEZXRhaWxzKTogdm9pZCB7XG5cdFx0bGV0IGkgPSAwO1xuXG5cdFx0Zm9yIChjb25zdCByZW5kZXJlciBvZiB0aGlzLnJlbmRlcmVycykge1xuXHRcdFx0cmVuZGVyZXIuZGlzcG9zZUVsZW1lbnQ/LihlbGVtZW50LCBpbmRleCwgdGVtcGxhdGVEYXRhW2ldLCByZW5kZXJEZXRhaWxzKTtcblxuXHRcdFx0aSArPSAxO1xuXHRcdH1cblx0fVxuXG5cdGRpc3Bvc2VUZW1wbGF0ZSh0ZW1wbGF0ZURhdGE6IHVua25vd25bXSk6IHZvaWQge1xuXHRcdGxldCBpID0gMDtcblxuXHRcdGZvciAoY29uc3QgcmVuZGVyZXIgb2YgdGhpcy5yZW5kZXJlcnMpIHtcblx0XHRcdHJlbmRlcmVyLmRpc3Bvc2VUZW1wbGF0ZSh0ZW1wbGF0ZURhdGFbaSsrXSk7XG5cdFx0fVxuXHR9XG59XG5cbmNsYXNzIEFjY2Vzc2liaWx0eVJlbmRlcmVyPFQ+IGltcGxlbWVudHMgSUxpc3RSZW5kZXJlcjxULCBJQWNjZXNzaWJpbGl0eVRlbXBsYXRlRGF0YT4ge1xuXG5cdHRlbXBsYXRlSWQ6IHN0cmluZyA9ICdhMThuJztcblxuXHRjb25zdHJ1Y3Rvcihwcml2YXRlIGFjY2Vzc2liaWxpdHlQcm92aWRlcjogSUxpc3RBY2Nlc3NpYmlsaXR5UHJvdmlkZXI8VD4pIHsgfVxuXG5cdHJlbmRlclRlbXBsYXRlKGNvbnRhaW5lcjogSFRNTEVsZW1lbnQpOiBJQWNjZXNzaWJpbGl0eVRlbXBsYXRlRGF0YSB7XG5cdFx0cmV0dXJuIHsgY29udGFpbmVyLCBkaXNwb3NhYmxlczogbmV3IERpc3Bvc2FibGVTdG9yZSgpIH07XG5cdH1cblxuXHRyZW5kZXJFbGVtZW50KGVsZW1lbnQ6IFQsIGluZGV4OiBudW1iZXIsIGRhdGE6IElBY2Nlc3NpYmlsaXR5VGVtcGxhdGVEYXRhKTogdm9pZCB7XG5cdFx0Y29uc3QgYXJpYUxhYmVsID0gdGhpcy5hY2Nlc3NpYmlsaXR5UHJvdmlkZXIuZ2V0QXJpYUxhYmVsKGVsZW1lbnQpO1xuXHRcdGNvbnN0IG9ic2VydmFibGUgPSAoYXJpYUxhYmVsICYmIHR5cGVvZiBhcmlhTGFiZWwgIT09ICdzdHJpbmcnKSA/IGFyaWFMYWJlbCA6IGNvbnN0T2JzZXJ2YWJsZShhcmlhTGFiZWwpO1xuXG5cdFx0ZGF0YS5kaXNwb3NhYmxlcy5hZGQoYXV0b3J1bihyZWFkZXIgPT4ge1xuXHRcdFx0dGhpcy5zZXRBcmlhTGFiZWwocmVhZGVyLnJlYWRPYnNlcnZhYmxlKG9ic2VydmFibGUpLCBkYXRhLmNvbnRhaW5lcik7XG5cdFx0fSkpO1xuXG5cdFx0Y29uc3QgYXJpYUxldmVsID0gdGhpcy5hY2Nlc3NpYmlsaXR5UHJvdmlkZXIuZ2V0QXJpYUxldmVsICYmIHRoaXMuYWNjZXNzaWJpbGl0eVByb3ZpZGVyLmdldEFyaWFMZXZlbChlbGVtZW50KTtcblxuXHRcdGlmICh0eXBlb2YgYXJpYUxldmVsID09PSAnbnVtYmVyJykge1xuXHRcdFx0ZGF0YS5jb250YWluZXIuc2V0QXR0cmlidXRlKCdhcmlhLWxldmVsJywgYCR7YXJpYUxldmVsfWApO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRkYXRhLmNvbnRhaW5lci5yZW1vdmVBdHRyaWJ1dGUoJ2FyaWEtbGV2ZWwnKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIHNldEFyaWFMYWJlbChhcmlhTGFiZWw6IHN0cmluZyB8IG51bGwsIGVsZW1lbnQ6IEhUTUxFbGVtZW50KTogdm9pZCB7XG5cdFx0aWYgKGFyaWFMYWJlbCkge1xuXHRcdFx0ZWxlbWVudC5zZXRBdHRyaWJ1dGUoJ2FyaWEtbGFiZWwnLCBhcmlhTGFiZWwpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRlbGVtZW50LnJlbW92ZUF0dHJpYnV0ZSgnYXJpYS1sYWJlbCcpO1xuXHRcdH1cblx0fVxuXG5cdGRpc3Bvc2VFbGVtZW50KGVsZW1lbnQ6IFQsIGluZGV4OiBudW1iZXIsIHRlbXBsYXRlRGF0YTogSUFjY2Vzc2liaWxpdHlUZW1wbGF0ZURhdGEpOiB2b2lkIHtcblx0XHR0ZW1wbGF0ZURhdGEuZGlzcG9zYWJsZXMuY2xlYXIoKTtcblx0fVxuXG5cdGRpc3Bvc2VUZW1wbGF0ZSh0ZW1wbGF0ZURhdGE6IElBY2Nlc3NpYmlsaXR5VGVtcGxhdGVEYXRhKTogdm9pZCB7XG5cdFx0dGVtcGxhdGVEYXRhLmRpc3Bvc2FibGVzLmRpc3Bvc2UoKTtcblx0fVxufVxuXG5jbGFzcyBMaXN0Vmlld0RyYWdBbmREcm9wPFQ+IGltcGxlbWVudHMgSUxpc3RWaWV3RHJhZ0FuZERyb3A8VD4ge1xuXG5cdGNvbnN0cnVjdG9yKHByaXZhdGUgbGlzdDogTGlzdDxUPiwgcHJpdmF0ZSBkbmQ6IElMaXN0RHJhZ0FuZERyb3A8VD4pIHsgfVxuXG5cdGdldERyYWdFbGVtZW50cyhlbGVtZW50OiBUKTogVFtdIHtcblx0XHRjb25zdCBzZWxlY3Rpb24gPSB0aGlzLmxpc3QuZ2V0U2VsZWN0ZWRFbGVtZW50cygpO1xuXHRcdGNvbnN0IGVsZW1lbnRzID0gc2VsZWN0aW9uLmluZGV4T2YoZWxlbWVudCkgPiAtMSA/IHNlbGVjdGlvbiA6IFtlbGVtZW50XTtcblx0XHRyZXR1cm4gZWxlbWVudHM7XG5cdH1cblxuXHRnZXREcmFnVVJJKGVsZW1lbnQ6IFQpOiBzdHJpbmcgfCBudWxsIHtcblx0XHRyZXR1cm4gdGhpcy5kbmQuZ2V0RHJhZ1VSSShlbGVtZW50KTtcblx0fVxuXG5cdGdldERyYWdMYWJlbD8oZWxlbWVudHM6IFRbXSwgb3JpZ2luYWxFdmVudDogRHJhZ0V2ZW50KTogc3RyaW5nIHwgdW5kZWZpbmVkIHtcblx0XHRpZiAodGhpcy5kbmQuZ2V0RHJhZ0xhYmVsKSB7XG5cdFx0XHRyZXR1cm4gdGhpcy5kbmQuZ2V0RHJhZ0xhYmVsKGVsZW1lbnRzLCBvcmlnaW5hbEV2ZW50KTtcblx0XHR9XG5cblx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHR9XG5cblx0b25EcmFnU3RhcnQoZGF0YTogSURyYWdBbmREcm9wRGF0YSwgb3JpZ2luYWxFdmVudDogRHJhZ0V2ZW50KTogdm9pZCB7XG5cdFx0dGhpcy5kbmQub25EcmFnU3RhcnQ/LihkYXRhLCBvcmlnaW5hbEV2ZW50KTtcblx0fVxuXG5cdG9uRHJhZ092ZXIoZGF0YTogSURyYWdBbmREcm9wRGF0YSwgdGFyZ2V0RWxlbWVudDogVCwgdGFyZ2V0SW5kZXg6IG51bWJlciwgdGFyZ2V0U2VjdG9yOiBMaXN0Vmlld1RhcmdldFNlY3RvciB8IHVuZGVmaW5lZCwgb3JpZ2luYWxFdmVudDogRHJhZ0V2ZW50KTogYm9vbGVhbiB8IElMaXN0RHJhZ092ZXJSZWFjdGlvbiB7XG5cdFx0cmV0dXJuIHRoaXMuZG5kLm9uRHJhZ092ZXIoZGF0YSwgdGFyZ2V0RWxlbWVudCwgdGFyZ2V0SW5kZXgsIHRhcmdldFNlY3Rvciwgb3JpZ2luYWxFdmVudCk7XG5cdH1cblxuXHRvbkRyYWdMZWF2ZShkYXRhOiBJRHJhZ0FuZERyb3BEYXRhLCB0YXJnZXRFbGVtZW50OiBULCB0YXJnZXRJbmRleDogbnVtYmVyLCBvcmlnaW5hbEV2ZW50OiBEcmFnRXZlbnQpOiB2b2lkIHtcblx0XHR0aGlzLmRuZC5vbkRyYWdMZWF2ZT8uKGRhdGEsIHRhcmdldEVsZW1lbnQsIHRhcmdldEluZGV4LCBvcmlnaW5hbEV2ZW50KTtcblx0fVxuXG5cdG9uRHJhZ0VuZChvcmlnaW5hbEV2ZW50OiBEcmFnRXZlbnQpOiB2b2lkIHtcblx0XHR0aGlzLmRuZC5vbkRyYWdFbmQ/LihvcmlnaW5hbEV2ZW50KTtcblx0fVxuXG5cdGRyb3AoZGF0YTogSURyYWdBbmREcm9wRGF0YSwgdGFyZ2V0RWxlbWVudDogVCwgdGFyZ2V0SW5kZXg6IG51bWJlciwgdGFyZ2V0U2VjdG9yOiBMaXN0Vmlld1RhcmdldFNlY3RvciB8IHVuZGVmaW5lZCwgb3JpZ2luYWxFdmVudDogRHJhZ0V2ZW50KTogdm9pZCB7XG5cdFx0dGhpcy5kbmQuZHJvcChkYXRhLCB0YXJnZXRFbGVtZW50LCB0YXJnZXRJbmRleCwgdGFyZ2V0U2VjdG9yLCBvcmlnaW5hbEV2ZW50KTtcblx0fVxuXG5cdGRpc3Bvc2UoKTogdm9pZCB7XG5cdFx0dGhpcy5kbmQuZGlzcG9zZSgpO1xuXHR9XG59XG5cbi8qKlxuICogVGhlIHtAbGluayBMaXN0fSBpcyBhIHZpcnR1YWwgc2Nyb2xsaW5nIHdpZGdldCwgYnVpbHQgb24gdG9wIG9mIHRoZSB7QGxpbmsgTGlzdFZpZXd9XG4gKiB3aWRnZXQuXG4gKlxuICogRmVhdHVyZXM6XG4gKiAtIEN1c3RvbWl6YWJsZSBrZXlib2FyZCBhbmQgbW91c2Ugc3VwcG9ydFxuICogLSBFbGVtZW50IHRyYWl0czogZm9jdXMsIHNlbGVjdGlvbiwgYWNob3JcbiAqIC0gQWNjZXNzaWJpbGl0eSBzdXBwb3J0XG4gKiAtIFRvdWNoIHN1cHBvcnRcbiAqIC0gUGVyZm9ybWFudCB0ZW1wbGF0ZS1iYXNlZCByZW5kZXJpbmdcbiAqIC0gSG9yaXpvbnRhbCBzY3JvbGxpbmdcbiAqIC0gVmFyaWFibGUgZWxlbWVudCBoZWlnaHQgc3VwcG9ydFxuICogLSBEeW5hbWljIGVsZW1lbnQgaGVpZ2h0IHN1cHBvcnRcbiAqIC0gRHJhZy1hbmQtZHJvcCBzdXBwb3J0XG4gKi9cbmV4cG9ydCBjbGFzcyBMaXN0PFQ+IGltcGxlbWVudHMgSVNwbGljZWFibGU8VD4sIElEaXNwb3NhYmxlIHtcblxuXHRwcml2YXRlIGZvY3VzID0gbmV3IFRyYWl0PFQ+KCdmb2N1c2VkJyk7XG5cdHByaXZhdGUgc2VsZWN0aW9uOiBUcmFpdDxUPjtcblx0cHJpdmF0ZSBhbmNob3IgPSBuZXcgVHJhaXQ8VD4oJ2FuY2hvcicpO1xuXHRwcml2YXRlIGV2ZW50QnVmZmVyZXIgPSBuZXcgRXZlbnRCdWZmZXJlcigpO1xuXHRwcm90ZWN0ZWQgdmlldzogSUxpc3RWaWV3PFQ+O1xuXHRwcml2YXRlIHNwbGljZWFibGU6IElTcGxpY2VhYmxlPFQ+O1xuXHRwcml2YXRlIHN0eWxlQ29udHJvbGxlcjogSVN0eWxlQ29udHJvbGxlcjtcblx0cHJpdmF0ZSB0eXBlTmF2aWdhdGlvbkNvbnRyb2xsZXI/OiBUeXBlTmF2aWdhdGlvbkNvbnRyb2xsZXI8VD47XG5cdHByaXZhdGUgYWNjZXNzaWJpbGl0eVByb3ZpZGVyPzogSUxpc3RBY2Nlc3NpYmlsaXR5UHJvdmlkZXI8VD47XG5cdHByaXZhdGUga2V5Ym9hcmRDb250cm9sbGVyOiBLZXlib2FyZENvbnRyb2xsZXI8VD4gfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgbW91c2VDb250cm9sbGVyOiBNb3VzZUNvbnRyb2xsZXI8VD47XG5cdHByaXZhdGUgX2FyaWFMYWJlbDogc3RyaW5nID0gJyc7XG5cblx0cHJvdGVjdGVkIHJlYWRvbmx5IGRpc3Bvc2FibGVzID0gbmV3IERpc3Bvc2FibGVTdG9yZSgpO1xuXG5cdEBtZW1vaXplIGdldCBvbkRpZENoYW5nZUZvY3VzKCk6IEV2ZW50PElMaXN0RXZlbnQ8VD4+IHtcblx0XHRyZXR1cm4gRXZlbnQubWFwKHRoaXMuZXZlbnRCdWZmZXJlci53cmFwRXZlbnQodGhpcy5mb2N1cy5vbkNoYW5nZSksIGUgPT4gdGhpcy50b0xpc3RFdmVudChlKSwgdGhpcy5kaXNwb3NhYmxlcyk7XG5cdH1cblxuXHRAbWVtb2l6ZSBnZXQgb25EaWRDaGFuZ2VTZWxlY3Rpb24oKTogRXZlbnQ8SUxpc3RFdmVudDxUPj4ge1xuXHRcdHJldHVybiBFdmVudC5tYXAodGhpcy5ldmVudEJ1ZmZlcmVyLndyYXBFdmVudCh0aGlzLnNlbGVjdGlvbi5vbkNoYW5nZSksIGUgPT4gdGhpcy50b0xpc3RFdmVudChlKSwgdGhpcy5kaXNwb3NhYmxlcyk7XG5cdH1cblxuXHRnZXQgZG9tSWQoKTogc3RyaW5nIHsgcmV0dXJuIHRoaXMudmlldy5kb21JZDsgfVxuXHRnZXQgb25EaWRTY3JvbGwoKTogRXZlbnQ8U2Nyb2xsRXZlbnQ+IHsgcmV0dXJuIHRoaXMudmlldy5vbkRpZFNjcm9sbDsgfVxuXHRnZXQgb25Nb3VzZUNsaWNrKCk6IEV2ZW50PElMaXN0TW91c2VFdmVudDxUPj4geyByZXR1cm4gdGhpcy52aWV3Lm9uTW91c2VDbGljazsgfVxuXHRnZXQgb25Nb3VzZURibENsaWNrKCk6IEV2ZW50PElMaXN0TW91c2VFdmVudDxUPj4geyByZXR1cm4gdGhpcy52aWV3Lm9uTW91c2VEYmxDbGljazsgfVxuXHRnZXQgb25Nb3VzZU1pZGRsZUNsaWNrKCk6IEV2ZW50PElMaXN0TW91c2VFdmVudDxUPj4geyByZXR1cm4gdGhpcy52aWV3Lm9uTW91c2VNaWRkbGVDbGljazsgfVxuXHRnZXQgb25Qb2ludGVyKCk6IEV2ZW50PElMaXN0TW91c2VFdmVudDxUPj4geyByZXR1cm4gdGhpcy5tb3VzZUNvbnRyb2xsZXIub25Qb2ludGVyOyB9XG5cdGdldCBvbk1vdXNlVXAoKTogRXZlbnQ8SUxpc3RNb3VzZUV2ZW50PFQ+PiB7IHJldHVybiB0aGlzLnZpZXcub25Nb3VzZVVwOyB9XG5cdGdldCBvbk1vdXNlRG93bigpOiBFdmVudDxJTGlzdE1vdXNlRXZlbnQ8VD4+IHsgcmV0dXJuIHRoaXMudmlldy5vbk1vdXNlRG93bjsgfVxuXHRnZXQgb25Nb3VzZU92ZXIoKTogRXZlbnQ8SUxpc3RNb3VzZUV2ZW50PFQ+PiB7IHJldHVybiB0aGlzLnZpZXcub25Nb3VzZU92ZXI7IH1cblx0Z2V0IG9uTW91c2VNb3ZlKCk6IEV2ZW50PElMaXN0TW91c2VFdmVudDxUPj4geyByZXR1cm4gdGhpcy52aWV3Lm9uTW91c2VNb3ZlOyB9XG5cdGdldCBvbk1vdXNlT3V0KCk6IEV2ZW50PElMaXN0TW91c2VFdmVudDxUPj4geyByZXR1cm4gdGhpcy52aWV3Lm9uTW91c2VPdXQ7IH1cblx0Z2V0IG9uVG91Y2hTdGFydCgpOiBFdmVudDxJTGlzdFRvdWNoRXZlbnQ8VD4+IHsgcmV0dXJuIHRoaXMudmlldy5vblRvdWNoU3RhcnQ7IH1cblx0Z2V0IG9uVGFwKCk6IEV2ZW50PElMaXN0R2VzdHVyZUV2ZW50PFQ+PiB7IHJldHVybiB0aGlzLnZpZXcub25UYXA7IH1cblxuXHQvKipcblx0ICogUG9zc2libGUgY29udGV4dCBtZW51IHRyaWdnZXIgZXZlbnRzOlxuXHQgKiAtIENvbnRleHRNZW51IGtleVxuXHQgKiAtIFNoaWZ0IEYxMFxuXHQgKiAtIEN0cmwgT3B0aW9uIFNoaWZ0IE0gKG1hY09TIHdpdGggVm9pY2VPdmVyKVxuXHQgKiAtIE1vdXNlIHJpZ2h0IGNsaWNrXG5cdCAqL1xuXHRAbWVtb2l6ZSBnZXQgb25Db250ZXh0TWVudSgpOiBFdmVudDxJTGlzdENvbnRleHRNZW51RXZlbnQ8VD4+IHtcblx0XHRsZXQgZGlkSnVzdFByZXNzQ29udGV4dE1lbnVLZXkgPSBmYWxzZTtcblxuXHRcdGNvbnN0IGZyb21LZXlEb3duOiBFdmVudDxhbnk+ID0gRXZlbnQuY2hhaW4odGhpcy5kaXNwb3NhYmxlcy5hZGQobmV3IERvbUVtaXR0ZXIodGhpcy52aWV3LmRvbU5vZGUsICdrZXlkb3duJykpLmV2ZW50LCAkID0+XG5cdFx0XHQkLm1hcChlID0+IG5ldyBTdGFuZGFyZEtleWJvYXJkRXZlbnQoZSkpXG5cdFx0XHRcdC5maWx0ZXIoZSA9PiBkaWRKdXN0UHJlc3NDb250ZXh0TWVudUtleSA9IGUua2V5Q29kZSA9PT0gS2V5Q29kZS5Db250ZXh0TWVudSB8fCAoZS5zaGlmdEtleSAmJiBlLmtleUNvZGUgPT09IEtleUNvZGUuRjEwKSlcblx0XHRcdFx0Lm1hcChlID0+IEV2ZW50SGVscGVyLnN0b3AoZSwgdHJ1ZSkpXG5cdFx0XHRcdC5maWx0ZXIoKCkgPT4gZmFsc2UpKTtcblxuXHRcdGNvbnN0IGZyb21LZXlVcCA9IEV2ZW50LmNoYWluKHRoaXMuZGlzcG9zYWJsZXMuYWRkKG5ldyBEb21FbWl0dGVyKHRoaXMudmlldy5kb21Ob2RlLCAna2V5dXAnKSkuZXZlbnQsICQgPT5cblx0XHRcdCQuZm9yRWFjaCgoKSA9PiBkaWRKdXN0UHJlc3NDb250ZXh0TWVudUtleSA9IGZhbHNlKVxuXHRcdFx0XHQubWFwKGUgPT4gbmV3IFN0YW5kYXJkS2V5Ym9hcmRFdmVudChlKSlcblx0XHRcdFx0LmZpbHRlcihlID0+IGUua2V5Q29kZSA9PT0gS2V5Q29kZS5Db250ZXh0TWVudSB8fCAoZS5zaGlmdEtleSAmJiBlLmtleUNvZGUgPT09IEtleUNvZGUuRjEwKSlcblx0XHRcdFx0Lm1hcChlID0+IEV2ZW50SGVscGVyLnN0b3AoZSwgdHJ1ZSkpXG5cdFx0XHRcdC5tYXAoKHsgYnJvd3NlckV2ZW50IH0pID0+IHtcblx0XHRcdFx0XHRjb25zdCBmb2N1cyA9IHRoaXMuZ2V0Rm9jdXMoKTtcblx0XHRcdFx0XHRjb25zdCBpbmRleCA9IGZvY3VzLmxlbmd0aCA/IGZvY3VzWzBdIDogdW5kZWZpbmVkO1xuXHRcdFx0XHRcdGNvbnN0IGVsZW1lbnQgPSB0eXBlb2YgaW5kZXggIT09ICd1bmRlZmluZWQnID8gdGhpcy52aWV3LmVsZW1lbnQoaW5kZXgpIDogdW5kZWZpbmVkO1xuXHRcdFx0XHRcdGNvbnN0IGFuY2hvciA9IHR5cGVvZiBpbmRleCAhPT0gJ3VuZGVmaW5lZCcgPyB0aGlzLnZpZXcuZG9tRWxlbWVudChpbmRleCkgYXMgSFRNTEVsZW1lbnQgOiB0aGlzLnZpZXcuZG9tTm9kZTtcblx0XHRcdFx0XHRyZXR1cm4geyBpbmRleCwgZWxlbWVudCwgYW5jaG9yLCBicm93c2VyRXZlbnQgfTtcblx0XHRcdFx0fSkpO1xuXG5cdFx0Y29uc3QgZnJvbU1vdXNlID0gRXZlbnQuY2hhaW4odGhpcy52aWV3Lm9uQ29udGV4dE1lbnUsICQgPT5cblx0XHRcdCQuZmlsdGVyKF8gPT4gIWRpZEp1c3RQcmVzc0NvbnRleHRNZW51S2V5KVxuXHRcdFx0XHQubWFwKCh7IGVsZW1lbnQsIGluZGV4LCBicm93c2VyRXZlbnQgfSkgPT4gKHsgZWxlbWVudCwgaW5kZXgsIGFuY2hvcjogbmV3IFN0YW5kYXJkTW91c2VFdmVudChnZXRXaW5kb3codGhpcy52aWV3LmRvbU5vZGUpLCBicm93c2VyRXZlbnQpLCBicm93c2VyRXZlbnQgfSkpXG5cdFx0KTtcblxuXHRcdHJldHVybiBFdmVudC5hbnk8SUxpc3RDb250ZXh0TWVudUV2ZW50PFQ+Pihmcm9tS2V5RG93biwgZnJvbUtleVVwLCBmcm9tTW91c2UpO1xuXHR9XG5cblx0QG1lbW9pemUgZ2V0IG9uS2V5RG93bigpOiBFdmVudDxLZXlib2FyZEV2ZW50PiB7IHJldHVybiB0aGlzLmRpc3Bvc2FibGVzLmFkZChuZXcgRG9tRW1pdHRlcih0aGlzLnZpZXcuZG9tTm9kZSwgJ2tleWRvd24nKSkuZXZlbnQ7IH1cblx0QG1lbW9pemUgZ2V0IG9uS2V5VXAoKTogRXZlbnQ8S2V5Ym9hcmRFdmVudD4geyByZXR1cm4gdGhpcy5kaXNwb3NhYmxlcy5hZGQobmV3IERvbUVtaXR0ZXIodGhpcy52aWV3LmRvbU5vZGUsICdrZXl1cCcpKS5ldmVudDsgfVxuXHRAbWVtb2l6ZSBnZXQgb25LZXlQcmVzcygpOiBFdmVudDxLZXlib2FyZEV2ZW50PiB7IHJldHVybiB0aGlzLmRpc3Bvc2FibGVzLmFkZChuZXcgRG9tRW1pdHRlcih0aGlzLnZpZXcuZG9tTm9kZSwgJ2tleXByZXNzJykpLmV2ZW50OyB9XG5cblx0QG1lbW9pemUgZ2V0IG9uRGlkRm9jdXMoKTogRXZlbnQ8dm9pZD4geyByZXR1cm4gRXZlbnQuc2lnbmFsKHRoaXMuZGlzcG9zYWJsZXMuYWRkKG5ldyBEb21FbWl0dGVyKHRoaXMudmlldy5kb21Ob2RlLCAnZm9jdXMnLCB0cnVlKSkuZXZlbnQpOyB9XG5cdEBtZW1vaXplIGdldCBvbkRpZEJsdXIoKTogRXZlbnQ8dm9pZD4geyByZXR1cm4gRXZlbnQuc2lnbmFsKHRoaXMuZGlzcG9zYWJsZXMuYWRkKG5ldyBEb21FbWl0dGVyKHRoaXMudmlldy5kb21Ob2RlLCAnYmx1cicsIHRydWUpKS5ldmVudCk7IH1cblxuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkRpZERpc3Bvc2UgPSBuZXcgRW1pdHRlcjx2b2lkPigpO1xuXHRyZWFkb25seSBvbkRpZERpc3Bvc2U6IEV2ZW50PHZvaWQ+ID0gdGhpcy5fb25EaWREaXNwb3NlLmV2ZW50O1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdHByaXZhdGUgdXNlcjogc3RyaW5nLFxuXHRcdGNvbnRhaW5lcjogSFRNTEVsZW1lbnQsXG5cdFx0dmlydHVhbERlbGVnYXRlOiBJTGlzdFZpcnR1YWxEZWxlZ2F0ZTxUPixcblx0XHRyZW5kZXJlcnM6IElMaXN0UmVuZGVyZXI8YW55IC8qIFRPRE9Aam9hbyAqLywgYW55PltdLFxuXHRcdHByaXZhdGUgX29wdGlvbnM6IElMaXN0T3B0aW9uczxUPiA9IERlZmF1bHRPcHRpb25zXG5cdCkge1xuXHRcdGNvbnN0IHJvbGUgPSB0aGlzLl9vcHRpb25zLmFjY2Vzc2liaWxpdHlQcm92aWRlciAmJiB0aGlzLl9vcHRpb25zLmFjY2Vzc2liaWxpdHlQcm92aWRlci5nZXRXaWRnZXRSb2xlID8gdGhpcy5fb3B0aW9ucy5hY2Nlc3NpYmlsaXR5UHJvdmlkZXI/LmdldFdpZGdldFJvbGUoKSA6ICdsaXN0Jztcblx0XHR0aGlzLnNlbGVjdGlvbiA9IG5ldyBTZWxlY3Rpb25UcmFpdChyb2xlICE9PSAnbGlzdGJveCcpO1xuXG5cdFx0Y29uc3QgYmFzZVJlbmRlcmVyczogSUxpc3RSZW5kZXJlcjxULCB1bmtub3duPltdID0gW3RoaXMuZm9jdXMucmVuZGVyZXIsIHRoaXMuc2VsZWN0aW9uLnJlbmRlcmVyXTtcblxuXHRcdHRoaXMuYWNjZXNzaWJpbGl0eVByb3ZpZGVyID0gX29wdGlvbnMuYWNjZXNzaWJpbGl0eVByb3ZpZGVyO1xuXG5cdFx0aWYgKHRoaXMuYWNjZXNzaWJpbGl0eVByb3ZpZGVyKSB7XG5cdFx0XHRiYXNlUmVuZGVyZXJzLnB1c2gobmV3IEFjY2Vzc2liaWx0eVJlbmRlcmVyPFQ+KHRoaXMuYWNjZXNzaWJpbGl0eVByb3ZpZGVyKSk7XG5cblx0XHRcdHRoaXMuYWNjZXNzaWJpbGl0eVByb3ZpZGVyLm9uRGlkQ2hhbmdlQWN0aXZlRGVzY2VuZGFudD8uKHRoaXMub25EaWRDaGFuZ2VBY3RpdmVEZXNjZW5kYW50LCB0aGlzLCB0aGlzLmRpc3Bvc2FibGVzKTtcblx0XHR9XG5cblx0XHRyZW5kZXJlcnMgPSByZW5kZXJlcnMubWFwKHIgPT4gbmV3IFBpcGVsaW5lUmVuZGVyZXIoci50ZW1wbGF0ZUlkLCBbLi4uYmFzZVJlbmRlcmVycywgcl0pKTtcblxuXHRcdGNvbnN0IHZpZXdPcHRpb25zOiBJTGlzdFZpZXdPcHRpb25zPFQ+ID0ge1xuXHRcdFx0Li4uX29wdGlvbnMsXG5cdFx0XHRkbmQ6IF9vcHRpb25zLmRuZCAmJiBuZXcgTGlzdFZpZXdEcmFnQW5kRHJvcCh0aGlzLCBfb3B0aW9ucy5kbmQpXG5cdFx0fTtcblxuXHRcdHRoaXMudmlldyA9IHRoaXMuY3JlYXRlTGlzdFZpZXcoY29udGFpbmVyLCB2aXJ0dWFsRGVsZWdhdGUsIHJlbmRlcmVycywgdmlld09wdGlvbnMpO1xuXHRcdHRoaXMudmlldy5kb21Ob2RlLnNldEF0dHJpYnV0ZSgncm9sZScsIHJvbGUpO1xuXG5cdFx0aWYgKF9vcHRpb25zLnN0eWxlQ29udHJvbGxlcikge1xuXHRcdFx0dGhpcy5zdHlsZUNvbnRyb2xsZXIgPSBfb3B0aW9ucy5zdHlsZUNvbnRyb2xsZXIodGhpcy52aWV3LmRvbUlkKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0Y29uc3Qgc3R5bGVFbGVtZW50ID0gY3JlYXRlU3R5bGVTaGVldCh0aGlzLnZpZXcuZG9tTm9kZSk7XG5cdFx0XHR0aGlzLnN0eWxlQ29udHJvbGxlciA9IG5ldyBEZWZhdWx0U3R5bGVDb250cm9sbGVyKHN0eWxlRWxlbWVudCwgdGhpcy52aWV3LmRvbUlkKTtcblx0XHR9XG5cblx0XHR0aGlzLnNwbGljZWFibGUgPSBuZXcgQ29tYmluZWRTcGxpY2VhYmxlKFtcblx0XHRcdG5ldyBUcmFpdFNwbGljZWFibGUodGhpcy5mb2N1cywgdGhpcy52aWV3LCBfb3B0aW9ucy5pZGVudGl0eVByb3ZpZGVyKSxcblx0XHRcdG5ldyBUcmFpdFNwbGljZWFibGUodGhpcy5zZWxlY3Rpb24sIHRoaXMudmlldywgX29wdGlvbnMuaWRlbnRpdHlQcm92aWRlciksXG5cdFx0XHRuZXcgVHJhaXRTcGxpY2VhYmxlKHRoaXMuYW5jaG9yLCB0aGlzLnZpZXcsIF9vcHRpb25zLmlkZW50aXR5UHJvdmlkZXIpLFxuXHRcdFx0dGhpcy52aWV3XG5cdFx0XSk7XG5cblx0XHR0aGlzLmRpc3Bvc2FibGVzLmFkZCh0aGlzLmZvY3VzKTtcblx0XHR0aGlzLmRpc3Bvc2FibGVzLmFkZCh0aGlzLnNlbGVjdGlvbik7XG5cdFx0dGhpcy5kaXNwb3NhYmxlcy5hZGQodGhpcy5hbmNob3IpO1xuXHRcdHRoaXMuZGlzcG9zYWJsZXMuYWRkKHRoaXMudmlldyk7XG5cdFx0dGhpcy5kaXNwb3NhYmxlcy5hZGQodGhpcy5fb25EaWREaXNwb3NlKTtcblxuXHRcdHRoaXMuZGlzcG9zYWJsZXMuYWRkKG5ldyBET01Gb2N1c0NvbnRyb2xsZXIodGhpcywgdGhpcy52aWV3KSk7XG5cblx0XHRpZiAodHlwZW9mIF9vcHRpb25zLmtleWJvYXJkU3VwcG9ydCAhPT0gJ2Jvb2xlYW4nIHx8IF9vcHRpb25zLmtleWJvYXJkU3VwcG9ydCkge1xuXHRcdFx0dGhpcy5rZXlib2FyZENvbnRyb2xsZXIgPSBuZXcgS2V5Ym9hcmRDb250cm9sbGVyKHRoaXMsIHRoaXMudmlldywgX29wdGlvbnMpO1xuXHRcdFx0dGhpcy5kaXNwb3NhYmxlcy5hZGQodGhpcy5rZXlib2FyZENvbnRyb2xsZXIpO1xuXHRcdH1cblxuXHRcdGlmIChfb3B0aW9ucy5rZXlib2FyZE5hdmlnYXRpb25MYWJlbFByb3ZpZGVyKSB7XG5cdFx0XHRjb25zdCBkZWxlZ2F0ZSA9IF9vcHRpb25zLmtleWJvYXJkTmF2aWdhdGlvbkRlbGVnYXRlIHx8IERlZmF1bHRLZXlib2FyZE5hdmlnYXRpb25EZWxlZ2F0ZTtcblx0XHRcdHRoaXMudHlwZU5hdmlnYXRpb25Db250cm9sbGVyID0gbmV3IFR5cGVOYXZpZ2F0aW9uQ29udHJvbGxlcih0aGlzLCB0aGlzLnZpZXcsIF9vcHRpb25zLmtleWJvYXJkTmF2aWdhdGlvbkxhYmVsUHJvdmlkZXIsIF9vcHRpb25zLmtleWJvYXJkTmF2aWdhdGlvbkV2ZW50RmlsdGVyID8/ICgoKSA9PiB0cnVlKSwgZGVsZWdhdGUpO1xuXHRcdFx0dGhpcy5kaXNwb3NhYmxlcy5hZGQodGhpcy50eXBlTmF2aWdhdGlvbkNvbnRyb2xsZXIpO1xuXHRcdH1cblxuXHRcdHRoaXMubW91c2VDb250cm9sbGVyID0gdGhpcy5jcmVhdGVNb3VzZUNvbnRyb2xsZXIoX29wdGlvbnMpO1xuXHRcdHRoaXMuZGlzcG9zYWJsZXMuYWRkKHRoaXMubW91c2VDb250cm9sbGVyKTtcblxuXHRcdHRoaXMub25EaWRDaGFuZ2VGb2N1cyh0aGlzLl9vbkZvY3VzQ2hhbmdlLCB0aGlzLCB0aGlzLmRpc3Bvc2FibGVzKTtcblx0XHR0aGlzLm9uRGlkQ2hhbmdlU2VsZWN0aW9uKHRoaXMuX29uU2VsZWN0aW9uQ2hhbmdlLCB0aGlzLCB0aGlzLmRpc3Bvc2FibGVzKTtcblxuXHRcdGlmICh0aGlzLmFjY2Vzc2liaWxpdHlQcm92aWRlcikge1xuXHRcdFx0Y29uc3QgYXJpYUxhYmVsID0gdGhpcy5hY2Nlc3NpYmlsaXR5UHJvdmlkZXIuZ2V0V2lkZ2V0QXJpYUxhYmVsKCk7XG5cdFx0XHRjb25zdCBvYnNlcnZhYmxlID0gKGFyaWFMYWJlbCAmJiB0eXBlb2YgYXJpYUxhYmVsICE9PSAnc3RyaW5nJykgPyBhcmlhTGFiZWwgOiBjb25zdE9ic2VydmFibGUoYXJpYUxhYmVsKTtcblxuXHRcdFx0dGhpcy5kaXNwb3NhYmxlcy5hZGQoYXV0b3J1bihyZWFkZXIgPT4ge1xuXHRcdFx0XHR0aGlzLmFyaWFMYWJlbCA9IHJlYWRlci5yZWFkT2JzZXJ2YWJsZShvYnNlcnZhYmxlKTtcblx0XHRcdH0pKTtcblx0XHR9XG5cblx0XHRpZiAodGhpcy5fb3B0aW9ucy5tdWx0aXBsZVNlbGVjdGlvblN1cHBvcnQgIT09IGZhbHNlKSB7XG5cdFx0XHR0aGlzLnZpZXcuZG9tTm9kZS5zZXRBdHRyaWJ1dGUoJ2FyaWEtbXVsdGlzZWxlY3RhYmxlJywgJ3RydWUnKTtcblx0XHR9XG5cdH1cblxuXHRwcm90ZWN0ZWQgY3JlYXRlTGlzdFZpZXcoY29udGFpbmVyOiBIVE1MRWxlbWVudCwgdmlydHVhbERlbGVnYXRlOiBJTGlzdFZpcnR1YWxEZWxlZ2F0ZTxUPiwgcmVuZGVyZXJzOiBJTGlzdFJlbmRlcmVyPGFueSwgYW55PltdLCB2aWV3T3B0aW9uczogSUxpc3RWaWV3T3B0aW9uczxUPik6IElMaXN0VmlldzxUPiB7XG5cdFx0cmV0dXJuIG5ldyBMaXN0Vmlldyhjb250YWluZXIsIHZpcnR1YWxEZWxlZ2F0ZSwgcmVuZGVyZXJzLCB2aWV3T3B0aW9ucyk7XG5cdH1cblxuXHRwcm90ZWN0ZWQgY3JlYXRlTW91c2VDb250cm9sbGVyKG9wdGlvbnM6IElMaXN0T3B0aW9uczxUPik6IE1vdXNlQ29udHJvbGxlcjxUPiB7XG5cdFx0cmV0dXJuIG5ldyBNb3VzZUNvbnRyb2xsZXIodGhpcyk7XG5cdH1cblxuXHR1cGRhdGVPcHRpb25zKG9wdGlvbnNVcGRhdGU6IElMaXN0T3B0aW9uc1VwZGF0ZSA9IHt9KTogdm9pZCB7XG5cdFx0dGhpcy5fb3B0aW9ucyA9IHsgLi4udGhpcy5fb3B0aW9ucywgLi4ub3B0aW9uc1VwZGF0ZSB9O1xuXG5cdFx0dGhpcy50eXBlTmF2aWdhdGlvbkNvbnRyb2xsZXI/LnVwZGF0ZU9wdGlvbnModGhpcy5fb3B0aW9ucyk7XG5cblx0XHRpZiAodGhpcy5fb3B0aW9ucy5tdWx0aXBsZVNlbGVjdGlvbkNvbnRyb2xsZXIgIT09IHVuZGVmaW5lZCkge1xuXHRcdFx0aWYgKHRoaXMuX29wdGlvbnMubXVsdGlwbGVTZWxlY3Rpb25TdXBwb3J0KSB7XG5cdFx0XHRcdHRoaXMudmlldy5kb21Ob2RlLnNldEF0dHJpYnV0ZSgnYXJpYS1tdWx0aXNlbGVjdGFibGUnLCAndHJ1ZScpO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0dGhpcy52aWV3LmRvbU5vZGUucmVtb3ZlQXR0cmlidXRlKCdhcmlhLW11bHRpc2VsZWN0YWJsZScpO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdHRoaXMubW91c2VDb250cm9sbGVyLnVwZGF0ZU9wdGlvbnMob3B0aW9uc1VwZGF0ZSk7XG5cdFx0dGhpcy5rZXlib2FyZENvbnRyb2xsZXI/LnVwZGF0ZU9wdGlvbnMob3B0aW9uc1VwZGF0ZSk7XG5cdFx0dGhpcy52aWV3LnVwZGF0ZU9wdGlvbnMob3B0aW9uc1VwZGF0ZSk7XG5cdH1cblxuXHRnZXQgb3B0aW9ucygpOiBJTGlzdE9wdGlvbnM8VD4ge1xuXHRcdHJldHVybiB0aGlzLl9vcHRpb25zO1xuXHR9XG5cblx0c3BsaWNlKHN0YXJ0OiBudW1iZXIsIGRlbGV0ZUNvdW50OiBudW1iZXIsIGVsZW1lbnRzOiByZWFkb25seSBUW10gPSBbXSk6IHZvaWQge1xuXHRcdGlmIChzdGFydCA8IDAgfHwgc3RhcnQgPiB0aGlzLnZpZXcubGVuZ3RoKSB7XG5cdFx0XHR0aHJvdyBuZXcgTGlzdEVycm9yKHRoaXMudXNlciwgYEludmFsaWQgc3RhcnQgaW5kZXg6ICR7c3RhcnR9YCk7XG5cdFx0fVxuXG5cdFx0aWYgKGRlbGV0ZUNvdW50IDwgMCkge1xuXHRcdFx0dGhyb3cgbmV3IExpc3RFcnJvcih0aGlzLnVzZXIsIGBJbnZhbGlkIGRlbGV0ZSBjb3VudDogJHtkZWxldGVDb3VudH1gKTtcblx0XHR9XG5cblx0XHRpZiAoZGVsZXRlQ291bnQgPT09IDAgJiYgZWxlbWVudHMubGVuZ3RoID09PSAwKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0dGhpcy5ldmVudEJ1ZmZlcmVyLmJ1ZmZlckV2ZW50cygoKSA9PiB0aGlzLnNwbGljZWFibGUuc3BsaWNlKHN0YXJ0LCBkZWxldGVDb3VudCwgZWxlbWVudHMpKTtcblx0fVxuXG5cdHVwZGF0ZVdpZHRoKGluZGV4OiBudW1iZXIpOiB2b2lkIHtcblx0XHR0aGlzLnZpZXcudXBkYXRlV2lkdGgoaW5kZXgpO1xuXHR9XG5cblx0dXBkYXRlRWxlbWVudEhlaWdodChpbmRleDogbnVtYmVyLCBzaXplOiBudW1iZXIgfCB1bmRlZmluZWQpOiB2b2lkIHtcblx0XHR0aGlzLnZpZXcudXBkYXRlRWxlbWVudEhlaWdodChpbmRleCwgc2l6ZSwgbnVsbCk7XG5cdH1cblxuXHRyZXJlbmRlcigpOiB2b2lkIHtcblx0XHR0aGlzLnZpZXcucmVyZW5kZXIoKTtcblx0fVxuXG5cdGVsZW1lbnQoaW5kZXg6IG51bWJlcik6IFQge1xuXHRcdHJldHVybiB0aGlzLnZpZXcuZWxlbWVudChpbmRleCk7XG5cdH1cblxuXHRpbmRleE9mKGVsZW1lbnQ6IFQpOiBudW1iZXIge1xuXHRcdHJldHVybiB0aGlzLnZpZXcuaW5kZXhPZihlbGVtZW50KTtcblx0fVxuXG5cdGluZGV4QXQocG9zaXRpb246IG51bWJlcik6IG51bWJlciB7XG5cdFx0cmV0dXJuIHRoaXMudmlldy5pbmRleEF0KHBvc2l0aW9uKTtcblx0fVxuXG5cdGdldCBsZW5ndGgoKTogbnVtYmVyIHtcblx0XHRyZXR1cm4gdGhpcy52aWV3Lmxlbmd0aDtcblx0fVxuXG5cdGdldCBjb250ZW50SGVpZ2h0KCk6IG51bWJlciB7XG5cdFx0cmV0dXJuIHRoaXMudmlldy5jb250ZW50SGVpZ2h0O1xuXHR9XG5cblx0Z2V0IGNvbnRlbnRXaWR0aCgpOiBudW1iZXIge1xuXHRcdHJldHVybiB0aGlzLnZpZXcuY29udGVudFdpZHRoO1xuXHR9XG5cblx0Z2V0IG9uRGlkQ2hhbmdlQ29udGVudEhlaWdodCgpOiBFdmVudDxudW1iZXI+IHtcblx0XHRyZXR1cm4gdGhpcy52aWV3Lm9uRGlkQ2hhbmdlQ29udGVudEhlaWdodDtcblx0fVxuXG5cdGdldCBvbkRpZENoYW5nZUNvbnRlbnRXaWR0aCgpOiBFdmVudDxudW1iZXI+IHtcblx0XHRyZXR1cm4gdGhpcy52aWV3Lm9uRGlkQ2hhbmdlQ29udGVudFdpZHRoO1xuXHR9XG5cblx0Z2V0IHNjcm9sbFRvcCgpOiBudW1iZXIge1xuXHRcdHJldHVybiB0aGlzLnZpZXcuZ2V0U2Nyb2xsVG9wKCk7XG5cdH1cblxuXHRzZXQgc2Nyb2xsVG9wKHNjcm9sbFRvcDogbnVtYmVyKSB7XG5cdFx0dGhpcy52aWV3LnNldFNjcm9sbFRvcChzY3JvbGxUb3ApO1xuXHR9XG5cblx0Z2V0IHNjcm9sbExlZnQoKTogbnVtYmVyIHtcblx0XHRyZXR1cm4gdGhpcy52aWV3LmdldFNjcm9sbExlZnQoKTtcblx0fVxuXG5cdHNldCBzY3JvbGxMZWZ0KHNjcm9sbExlZnQ6IG51bWJlcikge1xuXHRcdHRoaXMudmlldy5zZXRTY3JvbGxMZWZ0KHNjcm9sbExlZnQpO1xuXHR9XG5cblx0Z2V0IHNjcm9sbEhlaWdodCgpOiBudW1iZXIge1xuXHRcdHJldHVybiB0aGlzLnZpZXcuc2Nyb2xsSGVpZ2h0O1xuXHR9XG5cblx0Z2V0IHJlbmRlckhlaWdodCgpOiBudW1iZXIge1xuXHRcdHJldHVybiB0aGlzLnZpZXcucmVuZGVySGVpZ2h0O1xuXHR9XG5cblx0Z2V0IGZpcnN0VmlzaWJsZUluZGV4KCk6IG51bWJlciB7XG5cdFx0cmV0dXJuIHRoaXMudmlldy5maXJzdFZpc2libGVJbmRleDtcblx0fVxuXG5cdGdldCBmaXJzdE1vc3RseVZpc2libGVJbmRleCgpOiBudW1iZXIge1xuXHRcdHJldHVybiB0aGlzLnZpZXcuZmlyc3RNb3N0bHlWaXNpYmxlSW5kZXg7XG5cdH1cblxuXHRnZXQgbGFzdFZpc2libGVJbmRleCgpOiBudW1iZXIge1xuXHRcdHJldHVybiB0aGlzLnZpZXcubGFzdFZpc2libGVJbmRleDtcblx0fVxuXG5cdGdldCBhcmlhTGFiZWwoKTogc3RyaW5nIHtcblx0XHRyZXR1cm4gdGhpcy5fYXJpYUxhYmVsO1xuXHR9XG5cblx0c2V0IGFyaWFMYWJlbCh2YWx1ZTogc3RyaW5nKSB7XG5cdFx0dGhpcy5fYXJpYUxhYmVsID0gdmFsdWU7XG5cdFx0dGhpcy52aWV3LmRvbU5vZGUuc2V0QXR0cmlidXRlKCdhcmlhLWxhYmVsJywgdmFsdWUpO1xuXHR9XG5cblx0ZG9tRm9jdXMoKTogdm9pZCB7XG5cdFx0dGhpcy52aWV3LmRvbU5vZGUuZm9jdXMoeyBwcmV2ZW50U2Nyb2xsOiB0cnVlIH0pO1xuXHR9XG5cblx0bGF5b3V0KGhlaWdodD86IG51bWJlciwgd2lkdGg/OiBudW1iZXIpOiB2b2lkIHtcblx0XHR0aGlzLnZpZXcubGF5b3V0KGhlaWdodCwgd2lkdGgpO1xuXHR9XG5cblx0dHJpZ2dlclR5cGVOYXZpZ2F0aW9uKCk6IHZvaWQge1xuXHRcdHRoaXMudHlwZU5hdmlnYXRpb25Db250cm9sbGVyPy50cmlnZ2VyKCk7XG5cdH1cblxuXHRzZXRTZWxlY3Rpb24oaW5kZXhlczogbnVtYmVyW10sIGJyb3dzZXJFdmVudD86IFVJRXZlbnQpOiB2b2lkIHtcblx0XHRmb3IgKGNvbnN0IGluZGV4IG9mIGluZGV4ZXMpIHtcblx0XHRcdGlmIChpbmRleCA8IDAgfHwgaW5kZXggPj0gdGhpcy5sZW5ndGgpIHtcblx0XHRcdFx0dGhyb3cgbmV3IExpc3RFcnJvcih0aGlzLnVzZXIsIGBJbnZhbGlkIGluZGV4ICR7aW5kZXh9YCk7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0aW5kZXhlcyA9IGluZGV4ZXMuZmlsdGVyKGkgPT4gdGhpcy5nZXRFbGVtZW50R3JvdXBJZChpKSAhPT0gTm90U2VsZWN0YWJsZUdyb3VwSWQpO1xuXG5cdFx0dGhpcy5zZWxlY3Rpb24uc2V0KGluZGV4ZXMsIGJyb3dzZXJFdmVudCk7XG5cdH1cblxuXHRnZXRTZWxlY3Rpb24oKTogbnVtYmVyW10ge1xuXHRcdHJldHVybiB0aGlzLnNlbGVjdGlvbi5nZXQoKTtcblx0fVxuXG5cdGdldFNlbGVjdGVkRWxlbWVudHMoKTogVFtdIHtcblx0XHRyZXR1cm4gdGhpcy5nZXRTZWxlY3Rpb24oKS5tYXAoaSA9PiB0aGlzLnZpZXcuZWxlbWVudChpKSk7XG5cdH1cblxuXHRzZXRBbmNob3IoaW5kZXg6IG51bWJlciB8IHVuZGVmaW5lZCk6IHZvaWQge1xuXHRcdGlmICh0eXBlb2YgaW5kZXggPT09ICd1bmRlZmluZWQnKSB7XG5cdFx0XHR0aGlzLmFuY2hvci5zZXQoW10pO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGlmIChpbmRleCA8IDAgfHwgaW5kZXggPj0gdGhpcy5sZW5ndGgpIHtcblx0XHRcdHRocm93IG5ldyBMaXN0RXJyb3IodGhpcy51c2VyLCBgSW52YWxpZCBpbmRleCAke2luZGV4fWApO1xuXHRcdH1cblxuXHRcdHRoaXMuYW5jaG9yLnNldChbaW5kZXhdKTtcblx0fVxuXG5cdGdldEFuY2hvcigpOiBudW1iZXIgfCB1bmRlZmluZWQge1xuXHRcdHJldHVybiB0aGlzLmFuY2hvci5nZXQoKS5hdCgwKTtcblx0fVxuXG5cdGdldEFuY2hvckVsZW1lbnQoKTogVCB8IHVuZGVmaW5lZCB7XG5cdFx0Y29uc3QgYW5jaG9yID0gdGhpcy5nZXRBbmNob3IoKTtcblx0XHRyZXR1cm4gdHlwZW9mIGFuY2hvciA9PT0gJ3VuZGVmaW5lZCcgPyB1bmRlZmluZWQgOiB0aGlzLmVsZW1lbnQoYW5jaG9yKTtcblx0fVxuXG5cdC8qKlxuXHQgKiBHZXRzIHRoZSBncm91cCBJRCBmb3IgYW4gZWxlbWVudCBhdCB0aGUgZ2l2ZW4gaW5kZXguXG5cdCAqIFJldHVybnMgdW5kZWZpbmVkIGlmIG5vIGlkZW50aXR5IHByb3ZpZGVyLCBubyBnZXRHcm91cElkIG1ldGhvZCwgb3IgaWYgdGhlIGdyb3VwIElEIGlzIHVuZGVmaW5lZC5cblx0ICovXG5cdGdldEVsZW1lbnRHcm91cElkKGluZGV4OiBudW1iZXIpOiBudW1iZXIgfCBOb3RTZWxlY3RhYmxlR3JvdXBJZFR5cGUgfCB1bmRlZmluZWQge1xuXHRcdGNvbnN0IGlkZW50aXR5UHJvdmlkZXIgPSB0aGlzLm9wdGlvbnMuaWRlbnRpdHlQcm92aWRlcjtcblx0XHRpZiAoIWlkZW50aXR5UHJvdmlkZXI/LmdldEdyb3VwSWQpIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXG5cdFx0Y29uc3QgZWxlbWVudCA9IHRoaXMuZWxlbWVudChpbmRleCk7XG5cdFx0cmV0dXJuIGlkZW50aXR5UHJvdmlkZXIuZ2V0R3JvdXBJZChlbGVtZW50KTtcblx0fVxuXG5cdC8qKlxuXHQgKiBGaWx0ZXJzIHRoZSBnaXZlbiBpbmRpY2VzIHRvIG9ubHkgaW5jbHVkZSB0aG9zZSB3aXRoIGEgbWF0Y2hpbmcgZ3JvdXAgSUQuXG5cdCAqIElmIG5vIGlkZW50aXR5IHByb3ZpZGVyIG9yIGdldEdyb3VwSWQgbWV0aG9kIGV4aXN0cywgcmV0dXJucyB0aGUgb3JpZ2luYWwgaW5kaWNlcy5cblx0ICogSWYgcmVmZXJlbmNlR3JvdXBJZCBpcyB1bmRlZmluZWQsIHJldHVybnMgYW4gZW1wdHkgYXJyYXkgKGVsZW1lbnRzIHdpdGhvdXQgZ3JvdXAgSURzIGFyZSBub3Qgc2VsZWN0YWJsZSkuXG5cdCAqL1xuXHRmaWx0ZXJJbmRpY2VzQnlHcm91cChpbmRpY2VzOiBudW1iZXJbXSwgcmVmZXJlbmNlR3JvdXBJZDogbnVtYmVyIHwgTm90U2VsZWN0YWJsZUdyb3VwSWRUeXBlKTogbnVtYmVyW10ge1xuXHRcdGNvbnN0IGlkZW50aXR5UHJvdmlkZXIgPSB0aGlzLm9wdGlvbnMuaWRlbnRpdHlQcm92aWRlcjtcblx0XHRpZiAoIWlkZW50aXR5UHJvdmlkZXI/LmdldEdyb3VwSWQpIHtcblx0XHRcdHJldHVybiBpbmRpY2VzO1xuXHRcdH1cblxuXHRcdGlmIChyZWZlcmVuY2VHcm91cElkID09PSBOb3RTZWxlY3RhYmxlR3JvdXBJZCkge1xuXHRcdFx0cmV0dXJuIFtdO1xuXHRcdH1cblxuXHRcdHJldHVybiBpbmRpY2VzLmZpbHRlcihpbmRleCA9PiB7XG5cdFx0XHRjb25zdCBlbGVtZW50ID0gdGhpcy5lbGVtZW50KGluZGV4KTtcblx0XHRcdGNvbnN0IGdyb3VwSWQgPSBpZGVudGl0eVByb3ZpZGVyLmdldEdyb3VwSWQhKGVsZW1lbnQpO1xuXHRcdFx0cmV0dXJuIGdyb3VwSWQgPT09IHJlZmVyZW5jZUdyb3VwSWQ7XG5cdFx0fSk7XG5cdH1cblxuXHRzZXRGb2N1cyhpbmRleGVzOiBudW1iZXJbXSwgYnJvd3NlckV2ZW50PzogVUlFdmVudCk6IHZvaWQge1xuXHRcdGZvciAoY29uc3QgaW5kZXggb2YgaW5kZXhlcykge1xuXHRcdFx0aWYgKGluZGV4IDwgMCB8fCBpbmRleCA+PSB0aGlzLmxlbmd0aCkge1xuXHRcdFx0XHR0aHJvdyBuZXcgTGlzdEVycm9yKHRoaXMudXNlciwgYEludmFsaWQgaW5kZXggJHtpbmRleH1gKTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHR0aGlzLmZvY3VzLnNldChpbmRleGVzLCBicm93c2VyRXZlbnQpO1xuXHR9XG5cblx0Zm9jdXNOZXh0KG4gPSAxLCBsb29wID0gZmFsc2UsIGJyb3dzZXJFdmVudD86IFVJRXZlbnQsIGZpbHRlcj86IChlbGVtZW50OiBUKSA9PiBib29sZWFuKTogdm9pZCB7XG5cdFx0aWYgKHRoaXMubGVuZ3RoID09PSAwKSB7IHJldHVybjsgfVxuXG5cdFx0Y29uc3QgZm9jdXMgPSB0aGlzLmZvY3VzLmdldCgpO1xuXHRcdGNvbnN0IGluZGV4ID0gdGhpcy5maW5kTmV4dEluZGV4KGZvY3VzLmxlbmd0aCA+IDAgPyBmb2N1c1swXSArIG4gOiAwLCBsb29wLCBmaWx0ZXIpO1xuXG5cdFx0aWYgKGluZGV4ID4gLTEpIHtcblx0XHRcdHRoaXMuc2V0Rm9jdXMoW2luZGV4XSwgYnJvd3NlckV2ZW50KTtcblx0XHR9XG5cdH1cblxuXHRmb2N1c1ByZXZpb3VzKG4gPSAxLCBsb29wID0gZmFsc2UsIGJyb3dzZXJFdmVudD86IFVJRXZlbnQsIGZpbHRlcj86IChlbGVtZW50OiBUKSA9PiBib29sZWFuKTogdm9pZCB7XG5cdFx0aWYgKHRoaXMubGVuZ3RoID09PSAwKSB7IHJldHVybjsgfVxuXG5cdFx0Y29uc3QgZm9jdXMgPSB0aGlzLmZvY3VzLmdldCgpO1xuXHRcdGNvbnN0IGluZGV4ID0gdGhpcy5maW5kUHJldmlvdXNJbmRleChmb2N1cy5sZW5ndGggPiAwID8gZm9jdXNbMF0gLSBuIDogMCwgbG9vcCwgZmlsdGVyKTtcblxuXHRcdGlmIChpbmRleCA+IC0xKSB7XG5cdFx0XHR0aGlzLnNldEZvY3VzKFtpbmRleF0sIGJyb3dzZXJFdmVudCk7XG5cdFx0fVxuXHR9XG5cblx0YXN5bmMgZm9jdXNOZXh0UGFnZShicm93c2VyRXZlbnQ/OiBVSUV2ZW50LCBmaWx0ZXI/OiAoZWxlbWVudDogVCkgPT4gYm9vbGVhbik6IFByb21pc2U8dm9pZD4ge1xuXHRcdGxldCBsYXN0UGFnZUluZGV4ID0gdGhpcy52aWV3LmluZGV4QXQodGhpcy52aWV3LmdldFNjcm9sbFRvcCgpICsgdGhpcy52aWV3LnJlbmRlckhlaWdodCk7XG5cdFx0bGFzdFBhZ2VJbmRleCA9IGxhc3RQYWdlSW5kZXggPT09IDAgPyAwIDogbGFzdFBhZ2VJbmRleCAtIDE7XG5cdFx0Y29uc3QgY3VycmVudGx5Rm9jdXNlZEVsZW1lbnRJbmRleCA9IHRoaXMuZ2V0Rm9jdXMoKVswXTtcblxuXHRcdGlmIChjdXJyZW50bHlGb2N1c2VkRWxlbWVudEluZGV4ICE9PSBsYXN0UGFnZUluZGV4ICYmIChjdXJyZW50bHlGb2N1c2VkRWxlbWVudEluZGV4ID09PSB1bmRlZmluZWQgfHwgbGFzdFBhZ2VJbmRleCA+IGN1cnJlbnRseUZvY3VzZWRFbGVtZW50SW5kZXgpKSB7XG5cdFx0XHRjb25zdCBsYXN0R29vZFBhZ2VJbmRleCA9IHRoaXMuZmluZFByZXZpb3VzSW5kZXgobGFzdFBhZ2VJbmRleCwgZmFsc2UsIGZpbHRlcik7XG5cblx0XHRcdGlmIChsYXN0R29vZFBhZ2VJbmRleCA+IC0xICYmIGN1cnJlbnRseUZvY3VzZWRFbGVtZW50SW5kZXggIT09IGxhc3RHb29kUGFnZUluZGV4KSB7XG5cdFx0XHRcdHRoaXMuc2V0Rm9jdXMoW2xhc3RHb29kUGFnZUluZGV4XSwgYnJvd3NlckV2ZW50KTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdHRoaXMuc2V0Rm9jdXMoW2xhc3RQYWdlSW5kZXhdLCBicm93c2VyRXZlbnQpO1xuXHRcdFx0fVxuXHRcdH0gZWxzZSB7XG5cdFx0XHRjb25zdCBwcmV2aW91c1Njcm9sbFRvcCA9IHRoaXMudmlldy5nZXRTY3JvbGxUb3AoKTtcblx0XHRcdGxldCBuZXh0cGFnZVNjcm9sbFRvcCA9IHByZXZpb3VzU2Nyb2xsVG9wICsgdGhpcy52aWV3LnJlbmRlckhlaWdodDtcblx0XHRcdGlmIChsYXN0UGFnZUluZGV4ID4gY3VycmVudGx5Rm9jdXNlZEVsZW1lbnRJbmRleCkge1xuXHRcdFx0XHQvLyBzY3JvbGwgbGFzdCBwYWdlIGVsZW1lbnQgdG8gdGhlIHRvcCBvbmx5IGlmIHRoZSBsYXN0IHBhZ2UgZWxlbWVudCBpcyBiZWxvdyB0aGUgZm9jdXNlZCBlbGVtZW50XG5cdFx0XHRcdG5leHRwYWdlU2Nyb2xsVG9wIC09IHRoaXMudmlldy5lbGVtZW50SGVpZ2h0KGxhc3RQYWdlSW5kZXgpO1xuXHRcdFx0fVxuXG5cdFx0XHR0aGlzLnZpZXcuc2V0U2Nyb2xsVG9wKG5leHRwYWdlU2Nyb2xsVG9wKTtcblxuXHRcdFx0aWYgKHRoaXMudmlldy5nZXRTY3JvbGxUb3AoKSAhPT0gcHJldmlvdXNTY3JvbGxUb3ApIHtcblx0XHRcdFx0dGhpcy5zZXRGb2N1cyhbXSk7XG5cblx0XHRcdFx0Ly8gTGV0IHRoZSBzY3JvbGwgZXZlbnQgbGlzdGVuZXIgcnVuXG5cdFx0XHRcdGF3YWl0IHRpbWVvdXQoMCk7XG5cdFx0XHRcdGF3YWl0IHRoaXMuZm9jdXNOZXh0UGFnZShicm93c2VyRXZlbnQsIGZpbHRlcik7XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG5cblx0YXN5bmMgZm9jdXNQcmV2aW91c1BhZ2UoYnJvd3NlckV2ZW50PzogVUlFdmVudCwgZmlsdGVyPzogKGVsZW1lbnQ6IFQpID0+IGJvb2xlYW4sIGdldFBhZGRpbmdUb3A6ICgpID0+IG51bWJlciA9ICgpID0+IDApOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRsZXQgZmlyc3RQYWdlSW5kZXg6IG51bWJlcjtcblx0XHRjb25zdCBwYWRkaW5nVG9wID0gZ2V0UGFkZGluZ1RvcCgpO1xuXHRcdGNvbnN0IHNjcm9sbFRvcCA9IHRoaXMudmlldy5nZXRTY3JvbGxUb3AoKSArIHBhZGRpbmdUb3A7XG5cblx0XHRpZiAoc2Nyb2xsVG9wID09PSAwKSB7XG5cdFx0XHRmaXJzdFBhZ2VJbmRleCA9IHRoaXMudmlldy5pbmRleEF0KHNjcm9sbFRvcCk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdGZpcnN0UGFnZUluZGV4ID0gdGhpcy52aWV3LmluZGV4QWZ0ZXIoc2Nyb2xsVG9wIC0gMSk7XG5cdFx0fVxuXG5cdFx0Y29uc3QgY3VycmVudGx5Rm9jdXNlZEVsZW1lbnRJbmRleCA9IHRoaXMuZ2V0Rm9jdXMoKVswXTtcblxuXHRcdGlmIChjdXJyZW50bHlGb2N1c2VkRWxlbWVudEluZGV4ICE9PSBmaXJzdFBhZ2VJbmRleCAmJiAoY3VycmVudGx5Rm9jdXNlZEVsZW1lbnRJbmRleCA9PT0gdW5kZWZpbmVkIHx8IGN1cnJlbnRseUZvY3VzZWRFbGVtZW50SW5kZXggPj0gZmlyc3RQYWdlSW5kZXgpKSB7XG5cdFx0XHRjb25zdCBmaXJzdEdvb2RQYWdlSW5kZXggPSB0aGlzLmZpbmROZXh0SW5kZXgoZmlyc3RQYWdlSW5kZXgsIGZhbHNlLCBmaWx0ZXIpO1xuXG5cdFx0XHRpZiAoZmlyc3RHb29kUGFnZUluZGV4ID4gLTEgJiYgY3VycmVudGx5Rm9jdXNlZEVsZW1lbnRJbmRleCAhPT0gZmlyc3RHb29kUGFnZUluZGV4KSB7XG5cdFx0XHRcdHRoaXMuc2V0Rm9jdXMoW2ZpcnN0R29vZFBhZ2VJbmRleF0sIGJyb3dzZXJFdmVudCk7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHR0aGlzLnNldEZvY3VzKFtmaXJzdFBhZ2VJbmRleF0sIGJyb3dzZXJFdmVudCk7XG5cdFx0XHR9XG5cdFx0fSBlbHNlIHtcblx0XHRcdGNvbnN0IHByZXZpb3VzU2Nyb2xsVG9wID0gc2Nyb2xsVG9wO1xuXHRcdFx0dGhpcy52aWV3LnNldFNjcm9sbFRvcChzY3JvbGxUb3AgLSB0aGlzLnZpZXcucmVuZGVySGVpZ2h0IC0gcGFkZGluZ1RvcCk7XG5cblx0XHRcdGlmICh0aGlzLnZpZXcuZ2V0U2Nyb2xsVG9wKCkgKyBnZXRQYWRkaW5nVG9wKCkgIT09IHByZXZpb3VzU2Nyb2xsVG9wKSB7XG5cdFx0XHRcdHRoaXMuc2V0Rm9jdXMoW10pO1xuXG5cdFx0XHRcdC8vIExldCB0aGUgc2Nyb2xsIGV2ZW50IGxpc3RlbmVyIHJ1blxuXHRcdFx0XHRhd2FpdCB0aW1lb3V0KDApO1xuXHRcdFx0XHRhd2FpdCB0aGlzLmZvY3VzUHJldmlvdXNQYWdlKGJyb3dzZXJFdmVudCwgZmlsdGVyLCBnZXRQYWRkaW5nVG9wKTtcblx0XHRcdH1cblx0XHR9XG5cdH1cblxuXHRmb2N1c0xhc3QoYnJvd3NlckV2ZW50PzogVUlFdmVudCwgZmlsdGVyPzogKGVsZW1lbnQ6IFQpID0+IGJvb2xlYW4pOiB2b2lkIHtcblx0XHRpZiAodGhpcy5sZW5ndGggPT09IDApIHsgcmV0dXJuOyB9XG5cblx0XHRjb25zdCBpbmRleCA9IHRoaXMuZmluZFByZXZpb3VzSW5kZXgodGhpcy5sZW5ndGggLSAxLCBmYWxzZSwgZmlsdGVyKTtcblxuXHRcdGlmIChpbmRleCA+IC0xKSB7XG5cdFx0XHR0aGlzLnNldEZvY3VzKFtpbmRleF0sIGJyb3dzZXJFdmVudCk7XG5cdFx0fVxuXHR9XG5cblx0Zm9jdXNGaXJzdChicm93c2VyRXZlbnQ/OiBVSUV2ZW50LCBmaWx0ZXI/OiAoZWxlbWVudDogVCkgPT4gYm9vbGVhbik6IHZvaWQge1xuXHRcdHRoaXMuZm9jdXNOdGgoMCwgYnJvd3NlckV2ZW50LCBmaWx0ZXIpO1xuXHR9XG5cblx0Zm9jdXNOdGgobjogbnVtYmVyLCBicm93c2VyRXZlbnQ/OiBVSUV2ZW50LCBmaWx0ZXI/OiAoZWxlbWVudDogVCkgPT4gYm9vbGVhbik6IHZvaWQge1xuXHRcdGlmICh0aGlzLmxlbmd0aCA9PT0gMCkgeyByZXR1cm47IH1cblxuXHRcdGNvbnN0IGluZGV4ID0gdGhpcy5maW5kTmV4dEluZGV4KG4sIGZhbHNlLCBmaWx0ZXIpO1xuXG5cdFx0aWYgKGluZGV4ID4gLTEpIHtcblx0XHRcdHRoaXMuc2V0Rm9jdXMoW2luZGV4XSwgYnJvd3NlckV2ZW50KTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIGZpbmROZXh0SW5kZXgoaW5kZXg6IG51bWJlciwgbG9vcCA9IGZhbHNlLCBmaWx0ZXI/OiAoZWxlbWVudDogVCkgPT4gYm9vbGVhbik6IG51bWJlciB7XG5cdFx0Zm9yIChsZXQgaSA9IDA7IGkgPCB0aGlzLmxlbmd0aDsgaSsrKSB7XG5cdFx0XHRpZiAoaW5kZXggPj0gdGhpcy5sZW5ndGggJiYgIWxvb3ApIHtcblx0XHRcdFx0cmV0dXJuIC0xO1xuXHRcdFx0fVxuXG5cdFx0XHRpbmRleCA9IGluZGV4ICUgdGhpcy5sZW5ndGg7XG5cblx0XHRcdGlmICghZmlsdGVyIHx8IGZpbHRlcih0aGlzLmVsZW1lbnQoaW5kZXgpKSkge1xuXHRcdFx0XHRyZXR1cm4gaW5kZXg7XG5cdFx0XHR9XG5cblx0XHRcdGluZGV4Kys7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIC0xO1xuXHR9XG5cblx0cHJpdmF0ZSBmaW5kUHJldmlvdXNJbmRleChpbmRleDogbnVtYmVyLCBsb29wID0gZmFsc2UsIGZpbHRlcj86IChlbGVtZW50OiBUKSA9PiBib29sZWFuKTogbnVtYmVyIHtcblx0XHRmb3IgKGxldCBpID0gMDsgaSA8IHRoaXMubGVuZ3RoOyBpKyspIHtcblx0XHRcdGlmIChpbmRleCA8IDAgJiYgIWxvb3ApIHtcblx0XHRcdFx0cmV0dXJuIC0xO1xuXHRcdFx0fVxuXG5cdFx0XHRpbmRleCA9ICh0aGlzLmxlbmd0aCArIChpbmRleCAlIHRoaXMubGVuZ3RoKSkgJSB0aGlzLmxlbmd0aDtcblxuXHRcdFx0aWYgKCFmaWx0ZXIgfHwgZmlsdGVyKHRoaXMuZWxlbWVudChpbmRleCkpKSB7XG5cdFx0XHRcdHJldHVybiBpbmRleDtcblx0XHRcdH1cblxuXHRcdFx0aW5kZXgtLTtcblx0XHR9XG5cblx0XHRyZXR1cm4gLTE7XG5cdH1cblxuXHRnZXRGb2N1cygpOiBudW1iZXJbXSB7XG5cdFx0cmV0dXJuIHRoaXMuZm9jdXMuZ2V0KCk7XG5cdH1cblxuXHRnZXRGb2N1c2VkRWxlbWVudHMoKTogVFtdIHtcblx0XHRyZXR1cm4gdGhpcy5nZXRGb2N1cygpLm1hcChpID0+IHRoaXMudmlldy5lbGVtZW50KGkpKTtcblx0fVxuXG5cdHJldmVhbChpbmRleDogbnVtYmVyLCByZWxhdGl2ZVRvcD86IG51bWJlciwgcGFkZGluZ1RvcDogbnVtYmVyID0gMCk6IHZvaWQge1xuXHRcdGlmIChpbmRleCA8IDAgfHwgaW5kZXggPj0gdGhpcy5sZW5ndGgpIHtcblx0XHRcdHRocm93IG5ldyBMaXN0RXJyb3IodGhpcy51c2VyLCBgSW52YWxpZCBpbmRleCAke2luZGV4fWApO1xuXHRcdH1cblxuXHRcdGNvbnN0IHNjcm9sbFRvcCA9IHRoaXMudmlldy5nZXRTY3JvbGxUb3AoKTtcblx0XHRjb25zdCBlbGVtZW50VG9wID0gdGhpcy52aWV3LmVsZW1lbnRUb3AoaW5kZXgpO1xuXHRcdGNvbnN0IGVsZW1lbnRIZWlnaHQgPSB0aGlzLnZpZXcuZWxlbWVudEhlaWdodChpbmRleCk7XG5cblx0XHRpZiAoaXNOdW1iZXIocmVsYXRpdmVUb3ApKSB7XG5cdFx0XHQvLyB5ID0gbXggKyBiXG5cdFx0XHRjb25zdCBtID0gZWxlbWVudEhlaWdodCAtIHRoaXMudmlldy5yZW5kZXJIZWlnaHQgKyBwYWRkaW5nVG9wO1xuXHRcdFx0dGhpcy52aWV3LnNldFNjcm9sbFRvcChtICogY2xhbXAocmVsYXRpdmVUb3AsIDAsIDEpICsgZWxlbWVudFRvcCAtIHBhZGRpbmdUb3ApO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRjb25zdCB2aWV3SXRlbUJvdHRvbSA9IGVsZW1lbnRUb3AgKyBlbGVtZW50SGVpZ2h0O1xuXHRcdFx0Y29uc3Qgc2Nyb2xsQm90dG9tID0gc2Nyb2xsVG9wICsgdGhpcy52aWV3LnJlbmRlckhlaWdodDtcblxuXHRcdFx0aWYgKGVsZW1lbnRUb3AgPCBzY3JvbGxUb3AgKyBwYWRkaW5nVG9wICYmIHZpZXdJdGVtQm90dG9tID49IHNjcm9sbEJvdHRvbSkge1xuXHRcdFx0XHQvLyBUaGUgZWxlbWVudCBpcyBhbHJlYWR5IG92ZXJmbG93aW5nIHRoZSB2aWV3cG9ydCwgbm8tb3Bcblx0XHRcdH0gZWxzZSBpZiAoZWxlbWVudFRvcCA8IHNjcm9sbFRvcCArIHBhZGRpbmdUb3AgfHwgKHZpZXdJdGVtQm90dG9tID49IHNjcm9sbEJvdHRvbSAmJiBlbGVtZW50SGVpZ2h0ID49IHRoaXMudmlldy5yZW5kZXJIZWlnaHQpKSB7XG5cdFx0XHRcdHRoaXMudmlldy5zZXRTY3JvbGxUb3AoZWxlbWVudFRvcCAtIHBhZGRpbmdUb3ApO1xuXHRcdFx0fSBlbHNlIGlmICh2aWV3SXRlbUJvdHRvbSA+PSBzY3JvbGxCb3R0b20pIHtcblx0XHRcdFx0dGhpcy52aWV3LnNldFNjcm9sbFRvcCh2aWV3SXRlbUJvdHRvbSAtIHRoaXMudmlldy5yZW5kZXJIZWlnaHQpO1xuXHRcdFx0fVxuXHRcdH1cblx0fVxuXG5cdC8qKlxuXHQgKiBSZXR1cm5zIHRoZSByZWxhdGl2ZSBwb3NpdGlvbiBvZiBhbiBlbGVtZW50IHJlbmRlcmVkIGluIHRoZSBsaXN0LlxuXHQgKiBSZXR1cm5zIGBudWxsYCBpZiB0aGUgZWxlbWVudCBpc24ndCAqZW50aXJlbHkqIGluIHRoZSB2aXNpYmxlIHZpZXdwb3J0LlxuXHQgKi9cblx0Z2V0UmVsYXRpdmVUb3AoaW5kZXg6IG51bWJlciwgcGFkZGluZ1RvcDogbnVtYmVyID0gMCk6IG51bWJlciB8IG51bGwge1xuXHRcdGlmIChpbmRleCA8IDAgfHwgaW5kZXggPj0gdGhpcy5sZW5ndGgpIHtcblx0XHRcdHRocm93IG5ldyBMaXN0RXJyb3IodGhpcy51c2VyLCBgSW52YWxpZCBpbmRleCAke2luZGV4fWApO1xuXHRcdH1cblxuXHRcdGNvbnN0IHNjcm9sbFRvcCA9IHRoaXMudmlldy5nZXRTY3JvbGxUb3AoKTtcblx0XHRjb25zdCBlbGVtZW50VG9wID0gdGhpcy52aWV3LmVsZW1lbnRUb3AoaW5kZXgpO1xuXHRcdGNvbnN0IGVsZW1lbnRIZWlnaHQgPSB0aGlzLnZpZXcuZWxlbWVudEhlaWdodChpbmRleCk7XG5cblx0XHRpZiAoZWxlbWVudFRvcCA8IHNjcm9sbFRvcCArIHBhZGRpbmdUb3AgfHwgZWxlbWVudFRvcCArIGVsZW1lbnRIZWlnaHQgPiBzY3JvbGxUb3AgKyB0aGlzLnZpZXcucmVuZGVySGVpZ2h0KSB7XG5cdFx0XHRyZXR1cm4gbnVsbDtcblx0XHR9XG5cblx0XHQvLyB5ID0gbXggKyBiXG5cdFx0Y29uc3QgbSA9IGVsZW1lbnRIZWlnaHQgLSB0aGlzLnZpZXcucmVuZGVySGVpZ2h0ICsgcGFkZGluZ1RvcDtcblx0XHRyZXR1cm4gTWF0aC5hYnMoKHNjcm9sbFRvcCArIHBhZGRpbmdUb3AgLSBlbGVtZW50VG9wKSAvIG0pO1xuXHR9XG5cblx0aXNET01Gb2N1c2VkKCk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiBpc0FjdGl2ZUVsZW1lbnQodGhpcy52aWV3LmRvbU5vZGUpO1xuXHR9XG5cblx0Z2V0SFRNTEVsZW1lbnQoKTogSFRNTEVsZW1lbnQge1xuXHRcdHJldHVybiB0aGlzLnZpZXcuZG9tTm9kZTtcblx0fVxuXG5cdGdldFNjcm9sbGFibGVFbGVtZW50KCk6IEhUTUxFbGVtZW50IHtcblx0XHRyZXR1cm4gdGhpcy52aWV3LnNjcm9sbGFibGVFbGVtZW50RG9tTm9kZTtcblx0fVxuXG5cdGdldEVsZW1lbnRJRChpbmRleDogbnVtYmVyKTogc3RyaW5nIHtcblx0XHRyZXR1cm4gdGhpcy52aWV3LmdldEVsZW1lbnREb21JZChpbmRleCk7XG5cdH1cblxuXHRnZXRFbGVtZW50VG9wKGluZGV4OiBudW1iZXIpOiBudW1iZXIge1xuXHRcdHJldHVybiB0aGlzLnZpZXcuZWxlbWVudFRvcChpbmRleCk7XG5cdH1cblxuXHRzdHlsZShzdHlsZXM6IElMaXN0U3R5bGVzKTogdm9pZCB7XG5cdFx0dGhpcy5zdHlsZUNvbnRyb2xsZXIuc3R5bGUoc3R5bGVzKTtcblx0fVxuXG5cdGRlbGVnYXRlU2Nyb2xsRnJvbU1vdXNlV2hlZWxFdmVudChicm93c2VyRXZlbnQ6IElNb3VzZVdoZWVsRXZlbnQpIHtcblx0XHR0aGlzLnZpZXcuZGVsZWdhdGVTY3JvbGxGcm9tTW91c2VXaGVlbEV2ZW50KGJyb3dzZXJFdmVudCk7XG5cdH1cblxuXHRwcml2YXRlIHRvTGlzdEV2ZW50KHsgaW5kZXhlcywgYnJvd3NlckV2ZW50IH06IElUcmFpdENoYW5nZUV2ZW50KSB7XG5cdFx0cmV0dXJuIHsgaW5kZXhlcywgZWxlbWVudHM6IGluZGV4ZXMubWFwKGkgPT4gdGhpcy52aWV3LmVsZW1lbnQoaSkpLCBicm93c2VyRXZlbnQgfTtcblx0fVxuXG5cdHByaXZhdGUgX29uRm9jdXNDaGFuZ2UoKTogdm9pZCB7XG5cdFx0Y29uc3QgZm9jdXMgPSB0aGlzLmZvY3VzLmdldCgpO1xuXHRcdHRoaXMudmlldy5kb21Ob2RlLmNsYXNzTGlzdC50b2dnbGUoJ2VsZW1lbnQtZm9jdXNlZCcsIGZvY3VzLmxlbmd0aCA+IDApO1xuXHRcdHRoaXMub25EaWRDaGFuZ2VBY3RpdmVEZXNjZW5kYW50KCk7XG5cdH1cblxuXHRwcml2YXRlIG9uRGlkQ2hhbmdlQWN0aXZlRGVzY2VuZGFudCgpOiB2b2lkIHtcblx0XHRjb25zdCBmb2N1cyA9IHRoaXMuZm9jdXMuZ2V0KCk7XG5cblx0XHRpZiAoZm9jdXMubGVuZ3RoID4gMCkge1xuXHRcdFx0bGV0IGlkOiBzdHJpbmcgfCB1bmRlZmluZWQ7XG5cblx0XHRcdGlmICh0aGlzLmFjY2Vzc2liaWxpdHlQcm92aWRlcj8uZ2V0QWN0aXZlRGVzY2VuZGFudElkKSB7XG5cdFx0XHRcdGlkID0gdGhpcy5hY2Nlc3NpYmlsaXR5UHJvdmlkZXIuZ2V0QWN0aXZlRGVzY2VuZGFudElkKHRoaXMudmlldy5lbGVtZW50KGZvY3VzWzBdKSk7XG5cdFx0XHR9XG5cblx0XHRcdHRoaXMudmlldy5kb21Ob2RlLnNldEF0dHJpYnV0ZSgnYXJpYS1hY3RpdmVkZXNjZW5kYW50JywgaWQgfHwgdGhpcy52aWV3LmdldEVsZW1lbnREb21JZChmb2N1c1swXSkpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHR0aGlzLnZpZXcuZG9tTm9kZS5yZW1vdmVBdHRyaWJ1dGUoJ2FyaWEtYWN0aXZlZGVzY2VuZGFudCcpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgX29uU2VsZWN0aW9uQ2hhbmdlKCk6IHZvaWQge1xuXHRcdGNvbnN0IHNlbGVjdGlvbiA9IHRoaXMuc2VsZWN0aW9uLmdldCgpO1xuXG5cdFx0dGhpcy52aWV3LmRvbU5vZGUuY2xhc3NMaXN0LnRvZ2dsZSgnc2VsZWN0aW9uLW5vbmUnLCBzZWxlY3Rpb24ubGVuZ3RoID09PSAwKTtcblx0XHR0aGlzLnZpZXcuZG9tTm9kZS5jbGFzc0xpc3QudG9nZ2xlKCdzZWxlY3Rpb24tc2luZ2xlJywgc2VsZWN0aW9uLmxlbmd0aCA9PT0gMSk7XG5cdFx0dGhpcy52aWV3LmRvbU5vZGUuY2xhc3NMaXN0LnRvZ2dsZSgnc2VsZWN0aW9uLW11bHRpcGxlJywgc2VsZWN0aW9uLmxlbmd0aCA+IDEpO1xuXHR9XG5cblx0ZGlzcG9zZSgpOiB2b2lkIHtcblx0XHR0aGlzLl9vbkRpZERpc3Bvc2UuZmlyZSgpO1xuXHRcdHRoaXMuZGlzcG9zYWJsZXMuZGlzcG9zZSgpO1xuXG5cdFx0dGhpcy5fb25EaWREaXNwb3NlLmRpc3Bvc2UoKTtcblx0fVxufVxuIl0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7OztBQU1BLFNBQW9CLGFBQWEsa0JBQWtCLFdBQVcsaUJBQWlCLG1CQUFtQixlQUFlLG9CQUFvQjtBQUNySSxTQUFTLHdCQUF3QjtBQUNqQyxTQUFTLDZCQUE2QjtBQUN0QyxTQUFTLGtCQUFrQjtBQUMzQixTQUF5Qiw2QkFBNkI7QUFDdEQsU0FBUyxlQUFlO0FBQ3hCLFNBQVMsYUFBdUI7QUFDaEMsU0FBUywwQkFB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
