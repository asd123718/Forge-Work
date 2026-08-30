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
import * as cssJs from "../../../base/browser/cssValue.js";
import * as dom from "../../../base/browser/dom.js";
import { ToolBar } from "../../../base/browser/ui/toolbar/toolbar.js";
import { HoverPosition } from "../../../base/browser/ui/hover/hoverWidget.js";
import { IconLabel } from "../../../base/browser/ui/iconLabel/iconLabel.js";
import { KeybindingLabel } from "../../../base/browser/ui/keybindingLabel/keybindingLabel.js";
import { Checkbox, createToggleActionViewItemProvider } from "../../../base/browser/ui/toggle/toggle.js";
import { RenderIndentGuides } from "../../../base/browser/ui/tree/abstractTree.js";
import { TreeVisibility } from "../../../base/browser/ui/tree/tree.js";
import { equals } from "../../../base/common/arrays.js";
import { disposableTimeout, ThrottledDelayer } from "../../../base/common/async.js";
import { compareAnything } from "../../../base/common/comparers.js";
import { memoize } from "../../../base/common/decorators.js";
import { isCancellationError } from "../../../base/common/errors.js";
import { Emitter, Event, EventBufferer } from "../../../base/common/event.js";
import { getCodiconAriaLabel, matchesFuzzyIconAware, parseLabelWithIcons } from "../../../base/common/iconLabels.js";
import { Lazy } from "../../../base/common/lazy.js";
import { Disposable, DisposableStore, MutableDisposable } from "../../../base/common/lifecycle.js";
import { observableValue, observableValueOpts, transaction } from "../../../base/common/observable.js";
import { OS } from "../../../base/common/platform.js";
import { escape, ltrim } from "../../../base/common/strings.js";
import { URI } from "../../../base/common/uri.js";
import { localize } from "../../../nls.js";
import { IAccessibilityService } from "../../accessibility/common/accessibility.js";
import { IContextMenuService } from "../../contextview/browser/contextView.js";
import { IInstantiationService } from "../../instantiation/common/instantiation.js";
import { WorkbenchObjectTree } from "../../list/browser/listService.js";
import { defaultCheckboxStyles } from "../../theme/browser/defaultStyles.js";
import { isDark } from "../../theme/common/theme.js";
import { IThemeService } from "../../theme/common/themeService.js";
import { asCssVariable } from "../../theme/common/colorUtils.js";
import { QuickPickFocus } from "../common/quickInput.js";
import { quickInputButtonsToActionArrays } from "./quickInputUtils.js";
const $ = dom.$;
class BaseQuickPickItemElement {
  constructor(index, hasCheckbox, mainItem) {
    this.index = index;
    this.hasCheckbox = hasCheckbox;
    this._hidden = false;
    this._init = new Lazy(() => {
      const saneLabel = mainItem.label ?? "";
      const saneSortLabel = parseLabelWithIcons(saneLabel).text.trim();
      const saneAriaLabel = mainItem.ariaLabel || [saneLabel, this.saneDescription, this.saneDetail].map((s) => getCodiconAriaLabel(s)).filter((s) => !!s).join(", ");
      return {
        saneLabel,
        saneSortLabel,
        saneAriaLabel
      };
    });
    this._saneDescription = mainItem.description;
    this._saneTooltip = mainItem.tooltip;
  }
  // #region Lazy Getters
  get saneLabel() {
    return this._init.value.saneLabel;
  }
  get saneSortLabel() {
    return this._init.value.saneSortLabel;
  }
  get saneAriaLabel() {
    return this._init.value.saneAriaLabel;
  }
  get element() {
    return this._element;
  }
  set element(value) {
    this._element = value;
  }
  get hidden() {
    return this._hidden;
  }
  set hidden(value) {
    this._hidden = value;
  }
  get saneDescription() {
    return this._saneDescription;
  }
  set saneDescription(value) {
    this._saneDescription = value;
  }
  get saneDetail() {
    return this._saneDetail;
  }
  set saneDetail(value) {
    this._saneDetail = value;
  }
  get saneTooltip() {
    return this._saneTooltip;
  }
  set saneTooltip(value) {
    this._saneTooltip = value;
  }
  get labelHighlights() {
    return this._labelHighlights;
  }
  set labelHighlights(value) {
    this._labelHighlights = value;
  }
  get descriptionHighlights() {
    return this._descriptionHighlights;
  }
  set descriptionHighlights(value) {
    this._descriptionHighlights = value;
  }
  get detailHighlights() {
    return this._detailHighlights;
  }
  set detailHighlights(value) {
    this._detailHighlights = value;
  }
}
class QuickPickItemElement extends BaseQuickPickItemElement {
  constructor(index, childIndex, hasCheckbox, fireButtonTriggered, _onChecked, item, _separator) {
    super(index, hasCheckbox, item);
    this.childIndex = childIndex;
    this.fireButtonTriggered = fireButtonTriggered;
    this._onChecked = _onChecked;
    this.item = item;
    this._separator = _separator;
    this._checked = false;
    this.onChecked = hasCheckbox ? Event.map(Event.filter(this._onChecked.event, (e) => e.element === this), (e) => e.checked) : Event.None;
    this._saneDetail = item.detail;
    this._labelHighlights = item.highlights?.label;
    this._descriptionHighlights = item.highlights?.description;
    this._detailHighlights = item.highlights?.detail;
  }
  get separator() {
    return this._separator;
  }
  set separator(value) {
    this._separator = value;
  }
  get checked() {
    return this._checked;
  }
  set checked(value) {
    if (value !== this._checked) {
      this._checked = value;
      this._onChecked.fire({ element: this, checked: value });
    }
  }
  get checkboxDisabled() {
    return !!this.item.disabled;
  }
}
var QuickPickSeparatorFocusReason = /* @__PURE__ */ ((QuickPickSeparatorFocusReason2) => {
  QuickPickSeparatorFocusReason2[QuickPickSeparatorFocusReason2["NONE"] = 0] = "NONE";
  QuickPickSeparatorFocusReason2[QuickPickSeparatorFocusReason2["MOUSE_HOVER"] = 1] = "MOUSE_HOVER";
  QuickPickSeparatorFocusReason2[QuickPickSeparatorFocusReason2["ACTIVE_ITEM"] = 2] = "ACTIVE_ITEM";
  return QuickPickSeparatorFocusReason2;
})(QuickPickSeparatorFocusReason || {});
class QuickPickSeparatorElement extends BaseQuickPickItemElement {
  constructor(index, fireSeparatorButtonTriggered, separator) {
    super(index, false, separator);
    this.fireSeparatorButtonTriggered = fireSeparatorButtonTriggered;
    this.separator = separator;
    this.children = new Array();
    /**
     * If this item is >0, it means that there is some item in the list that is either:
     * * hovered over
     * * active
     */
    this.focusInsideSeparator = 0 /* NONE */;
  }
}
class QuickInputItemDelegate {
  getHeight(element) {
    if (element instanceof QuickPickSeparatorElement) {
      return 30;
    }
    return element.saneDetail ? 44 : 22;
  }
  getTemplateId(element) {
    if (element instanceof QuickPickItemElement) {
      return QuickPickItemElementRenderer.ID;
    } else {
      return QuickPickSeparatorElementRenderer.ID;
    }
  }
}
class QuickInputAccessibilityProvider {
  getWidgetAriaLabel() {
    return localize("quickInput", "Quick Input");
  }
  getAriaLabel(element) {
    return element.separator?.label ? `${element.saneAriaLabel}, ${element.separator.label}` : element.saneAriaLabel;
  }
  getWidgetRole() {
    return "listbox";
  }
  getRole(element) {
    return element.hasCheckbox ? "checkbox" : "option";
  }
  isChecked(element) {
    if (!element.hasCheckbox || !(element instanceof QuickPickItemElement)) {
      return void 0;
    }
    return {
      get value() {
        return element.checked;
      },
      onDidChange: (e) => element.onChecked(() => e())
    };
  }
}
class BaseQuickInputListRenderer extends Disposable {
  constructor(hoverDelegate, toggleStyles, contextMenuService) {
    super();
    this.hoverDelegate = hoverDelegate;
    this.toggleStyles = toggleStyles;
    this.contextMenuService = contextMenuService;
    this._onDidDisposeFocusedElement = this._register(new Emitter());
    /**
     * This event is emitted when the renderer disposes an element that has focus.
     * This allows the list to re-focus itself and prevent focus from being lost
     * (potentially causing quickinput to dismiss itself) when an element is
     * removed while focused.
     */
    this.onDidDisposeFocusedElement = this._onDidDisposeFocusedElement.event;
  }
  // TODO: only do the common stuff here and have a subclass handle their specific stuff
  renderTemplate(container) {
    const data = /* @__PURE__ */ Object.create(null);
    data.toDisposeElement = new DisposableStore();
    data.toDisposeTemplate = new DisposableStore();
    data.entry = dom.append(container, $(".quick-input-list-entry"));
    const label = dom.append(data.entry, $("label.quick-input-list-label"));
    data.outerLabel = label;
    data.checkbox = data.toDisposeTemplate.add(new MutableDisposable());
    data.toDisposeTemplate.add(dom.addStandardDisposableListener(label, dom.EventType.CLICK, (e) => {
      if (data.checkbox.value && !e.defaultPrevented && data.checkbox.value.enabled) {
        const checked = !data.checkbox.value.checked;
        data.checkbox.value.checked = checked;
        data.element.checked = checked;
      }
    }));
    const rows = dom.append(label, $(".quick-input-list-rows"));
    const row1 = dom.append(rows, $(".quick-input-list-row"));
    const row2 = dom.append(rows, $(".quick-input-list-row"));
    data.label = new IconLabel(row1, { supportHighlights: true, supportDescriptionHighlights: true, supportIcons: true, hoverDelegate: this.hoverDelegate });
    data.toDisposeTemplate.add(data.label);
    data.icon = dom.prepend(data.label.element, $(".quick-input-list-icon"));
    const keybindingContainer = dom.append(row1, $(".quick-input-list-entry-keybinding"));
    data.keybinding = new KeybindingLabel(keybindingContainer, OS);
    data.toDisposeTemplate.add(data.keybinding);
    const detailContainer = dom.append(row2, $(".quick-input-list-label-meta"));
    data.detail = new IconLabel(detailContainer, { supportHighlights: true, supportIcons: true, hoverDelegate: this.hoverDelegate });
    data.toDisposeTemplate.add(data.detail);
    data.separator = dom.append(data.entry, $(".quick-input-list-separator"));
    data.toolBar = new ToolBar(data.entry, this.contextMenuService, {
      ...this.hoverDelegate ? { hoverDelegate: this.hoverDelegate } : void 0,
      actionViewItemProvider: createToggleActionViewItemProvider(this.toggleStyles),
      icon: true,
      label: false
    });
    data.toolBar.getElement().classList.add("quick-input-list-entry-action-bar");
    data.toDisposeTemplate.add(data.toolBar);
    return data;
  }
  disposeTemplate(data) {
    data.toDisposeElement.dispose();
    data.toDisposeTemplate.dispose();
  }
  disposeElement(_element, _index, data) {
    if (dom.isAncestorOfActiveElement(data.entry)) {
      this._onDidDisposeFocusedElement.fire();
    }
    data.toDisposeElement.clear();
    data.toolBar.setActions([]);
  }
}
let QuickPickItemElementRenderer = class extends BaseQuickInputListRenderer {
  constructor(hoverDelegate, toggleStyles, contextMenuService, themeService) {
    super(hoverDelegate, toggleStyles, contextMenuService);
    this.themeService = themeService;
    // Follow what we do in the separator renderer
    this._itemsWithSeparatorsFrequency = /* @__PURE__ */ new Map();
  }
  get templateId() {
    return QuickPickItemElementRenderer.ID;
  }
  ensureCheckbox(element, data) {
    if (!element.hasCheckbox) {
      data.checkbox.value?.domNode.remove();
      data.checkbox.clear();
      return;
    }
    let checkbox = data.checkbox.value;
    if (!checkbox) {
      checkbox = new Checkbox(element.saneLabel, element.checked, { ...defaultCheckboxStyles, size: 15 });
      data.checkbox.value = checkbox;
      data.outerLabel.prepend(checkbox.domNode);
      checkbox.domNode.tabIndex = -1;
    } else {
      checkbox.setTitle(element.saneLabel);
    }
    if (element.checkboxDisabled) {
      checkbox.disable();
    } else {
      checkbox.enable();
    }
    checkbox.checked = element.checked;
    data.toDisposeElement.add(element.onChecked((checked) => checkbox.checked = checked));
    data.toDisposeElement.add(checkbox.onChange(() => element.checked = checkbox.checked));
  }
  renderElement(node, index, data) {
    const element = node.element;
    data.element = element;
    element.element = data.entry ?? void 0;
    const mainItem = element.item;
    element.element.classList.toggle("not-pickable", element.item.pickable === false);
    this.ensureCheckbox(element, data);
    const { labelHighlights, descriptionHighlights, detailHighlights } = element;
    if (mainItem.iconPath) {
      const icon = isDark(this.themeService.getColorTheme().type) ? mainItem.iconPath.dark : mainItem.iconPath.light ?? mainItem.iconPath.dark;
      const iconUrl = URI.revive(icon);
      data.icon.className = "quick-input-list-icon";
      data.icon.style.backgroundImage = cssJs.asCSSUrl(iconUrl);
    } else {
      data.icon.style.backgroundImage = "";
      data.icon.className = mainItem.iconClass ? `quick-input-list-icon ${mainItem.iconClass}` : "";
    }
    data.icon.style.color = mainItem.iconColor ? asCssVariable(mainItem.iconColor.id) : "";
    let descriptionTitle;
    if (!element.saneTooltip && element.saneDescription) {
      descriptionTitle = {
        markdown: {
          value: escape(element.saneDescription),
          supportThemeIcons: true
        },
        markdownNotSupportedFallback: element.saneDescription
      };
    }
    const options = {
      matches: labelHighlights || [],
      // If we have a tooltip, we want that to be shown and not any other hover
      descriptionTitle,
      descriptionMatches: descriptionHighlights || [],
      labelEscapeNewLines: true
    };
    options.extraClasses = mainItem.iconClasses;
    options.italic = mainItem.italic;
    options.strikethrough = mainItem.strikethrough;
    data.entry.classList.remove("quick-input-list-separator-as-item");
    data.label.setLabel(element.saneLabel, element.saneDescription, options);
    data.keybinding.set(mainItem.keybinding);
    if (element.saneDetail) {
      let title;
      if (!element.saneTooltip) {
        title = {
          markdown: {
            value: escape(element.saneDetail),
            supportThemeIcons: true
          },
          markdownNotSupportedFallback: element.saneDetail
        };
      }
      data.detail.element.style.display = "";
      data.detail.setLabel(element.saneDetail, void 0, {
        matches: detailHighlights,
        title,
        labelEscapeNewLines: true
      });
    } else {
      data.detail.element.style.display = "none";
    }
    if (element.separator?.label) {
      data.separator.textContent = element.separator.label;
      data.separator.style.display = "";
      this.addItemWithSeparator(element);
    } else {
      data.separator.style.display = "none";
    }
    data.entry.classList.toggle("quick-input-list-separator-border", !!element.separator && element.childIndex !== 0);
    const buttons = mainItem.buttons;
    if (buttons && buttons.length) {
      const { primary, secondary } = quickInputButtonsToActionArrays(
        buttons,
        "quick-input-item",
        (button) => element.fireButtonTriggered({ button, item: element.item })
      );
      data.toolBar.setActions(primary, secondary);
      data.entry.classList.add("has-actions");
    } else {
      data.toolBar.setActions([]);
      data.entry.classList.remove("has-actions");
    }
  }
  disposeElement(element, _index, data) {
    this.removeItemWithSeparator(element.element);
    super.disposeElement(element, _index, data);
  }
  isItemWithSeparatorVisible(item) {
    return this._itemsWithSeparatorsFrequency.has(item);
  }
  addItemWithSeparator(item) {
    this._itemsWithSeparatorsFrequency.set(item, (this._itemsWithSeparatorsFrequency.get(item) || 0) + 1);
  }
  removeItemWithSeparator(item) {
    const frequency = this._itemsWithSeparatorsFrequency.get(item) || 0;
    if (frequency > 1) {
      this._itemsWithSeparatorsFrequency.set(item, frequency - 1);
    } else {
      this._itemsWithSeparatorsFrequency.delete(item);
    }
  }
};
QuickPickItemElementRenderer.ID = "quickpickitem";
QuickPickItemElementRenderer = __decorateClass([
  __decorateParam(2, IContextMenuService),
  __decorateParam(3, IThemeService)
], QuickPickItemElementRenderer);
let QuickPickSeparatorElementRenderer = class extends BaseQuickInputListRenderer {
  constructor(hoverDelegate, toggleStyles, contextMenuService) {
    super(hoverDelegate, toggleStyles, contextMenuService);
    // This is a frequency map because sticky scroll re-uses the same renderer to render a second
    // instance of the same separator.
    this._visibleSeparatorsFrequency = /* @__PURE__ */ new Map();
  }
  get templateId() {
    return QuickPickSeparatorElementRenderer.ID;
  }
  get visibleSeparators() {
    return [...this._visibleSeparatorsFrequency.keys()];
  }
  isSeparatorVisible(separator) {
    return this._visibleSeparatorsFrequency.has(separator);
  }
  renderElement(node, index, data) {
    const element = node.element;
    data.element = element;
    element.element = data.entry ?? void 0;
    element.element.classList.toggle("focus-inside", !!element.focusInsideSeparator);
    const mainItem = element.separator;
    const { labelHighlights, descriptionHighlights } = element;
    data.icon.style.backgroundImage = "";
    data.icon.className = "";
    let descriptionTitle;
    if (!element.saneTooltip && element.saneDescription) {
      descriptionTitle = {
        markdown: {
          value: escape(element.saneDescription),
          supportThemeIcons: true
        },
        markdownNotSupportedFallback: element.saneDescription
      };
    }
    const options = {
      matches: labelHighlights || [],
      // If we have a tooltip, we want that to be shown and not any other hover
      descriptionTitle,
      descriptionMatches: descriptionHighlights || [],
      labelEscapeNewLines: true
    };
    data.entry.classList.add("quick-input-list-separator-as-item");
    data.label.setLabel(element.saneLabel, element.saneDescription, options);
    data.separator.style.display = "none";
    data.entry.classList.add("quick-input-list-separator-border");
    const buttons = mainItem.buttons;
    if (buttons && buttons.length) {
      const { primary, secondary } = quickInputButtonsToActionArrays(
        buttons,
        "quick-input-separator",
        (button) => element.fireSeparatorButtonTriggered({ button, separator: element.separator })
      );
      data.toolBar.setActions(primary, secondary);
      data.entry.classList.add("has-actions");
    } else {
      data.toolBar.setActions([]);
      data.entry.classList.remove("has-actions");
    }
    this.addSeparator(element);
  }
  disposeElement(element, _index, data) {
    this.removeSeparator(element.element);
    if (!this.isSeparatorVisible(element.element)) {
      element.element.element?.classList.remove("focus-inside");
    }
    super.disposeElement(element, _index, data);
  }
  addSeparator(separator) {
    this._visibleSeparatorsFrequency.set(separator, (this._visibleSeparatorsFrequency.get(separator) || 0) + 1);
  }
  removeSeparator(separator) {
    const frequency = this._visibleSeparatorsFrequency.get(separator) || 0;
    if (frequency > 1) {
      this._visibleSeparatorsFrequency.set(separator, frequency - 1);
    } else {
      this._visibleSeparatorsFrequency.delete(separator);
    }
  }
};
QuickPickSeparatorElementRenderer.ID = "quickpickseparator";
QuickPickSeparatorElementRenderer = __decorateClass([
  __decorateParam(2, IContextMenuService)
], QuickPickSeparatorElementRenderer);
let QuickInputList = class extends Disposable {
  constructor(parent, hoverDelegate, linkOpenerDelegate, id, styles, instantiationService, accessibilityService) {
    super();
    this.parent = parent;
    this.hoverDelegate = hoverDelegate;
    this.linkOpenerDelegate = linkOpenerDelegate;
    this.styles = styles;
    this.accessibilityService = accessibilityService;
    //#region QuickInputList Events
    this._onKeyDown = this._register(new Emitter());
    /**
     * Event that is fired when the tree receives a keydown.
    */
    this.onKeyDown = this._onKeyDown.event;
    this._onLeave = this._register(new Emitter());
    /**
     * Event that is fired when the tree would no longer have focus.
    */
    this.onLeave = this._onLeave.event;
    this._visibleCountObservable = observableValue("VisibleCount", 0);
    this.onChangedVisibleCount = Event.fromObservable(this._visibleCountObservable, this._store);
    this._allVisibleCheckedObservable = observableValue("AllVisibleChecked", false);
    this.onChangedAllVisibleChecked = Event.fromObservable(this._allVisibleCheckedObservable, this._store);
    this._checkedCountObservable = observableValue("CheckedCount", 0);
    this.onChangedCheckedCount = Event.fromObservable(this._checkedCountObservable, this._store);
    this._checkedElementsObservable = observableValueOpts({ equalsFn: equals }, new Array());
    this.onChangedCheckedElements = Event.fromObservable(this._checkedElementsObservable, this._store);
    this._onButtonTriggered = this._register(new Emitter());
    this.onButtonTriggered = this._onButtonTriggered.event;
    this._onSeparatorButtonTriggered = this._register(new Emitter());
    this.onSeparatorButtonTriggered = this._onSeparatorButtonTriggered.event;
    this._elementChecked = this._register(new Emitter());
    this._elementCheckedEventBufferer = new EventBufferer();
    //#endregion
    this._hasCheckboxes = false;
    this._inputElements = new Array();
    this._elementTree = new Array();
    this._itemElements = new Array();
    // Elements that apply to the current set of elements
    this._elementDisposable = this._register(new DisposableStore());
    this._matchOnDescription = false;
    this._matchOnDetail = false;
    this._matchOnLabel = true;
    this._matchOnLabelMode = "fuzzy";
    this._matchOnMeta = true;
    this._sortByLabel = true;
    this._shouldLoop = true;
    this._container = dom.append(this.parent, $(".quick-input-list"));
    this._separatorRenderer = this._register(instantiationService.createInstance(QuickPickSeparatorElementRenderer, hoverDelegate, this.styles.toggle));
    this._itemRenderer = this._register(instantiationService.createInstance(QuickPickItemElementRenderer, hoverDelegate, this.styles.toggle));
    this._tree = this._register(instantiationService.createInstance(
      WorkbenchObjectTree,
      "QuickInput",
      this._container,
      new QuickInputItemDelegate(),
      [this._itemRenderer, this._separatorRenderer],
      {
        filter: {
          filter(element) {
            return element.hidden ? TreeVisibility.Hidden : element instanceof QuickPickSeparatorElement ? TreeVisibility.Recurse : TreeVisibility.Visible;
          }
        },
        sorter: {
          compare: (element, otherElement) => {
            if (!this.sortByLabel || !this._lastQueryString) {
              return 0;
            }
            const normalizedSearchValue = this._lastQueryString.toLowerCase();
            return compareEntries(element, otherElement, normalizedSearchValue);
          }
        },
        accessibilityProvider: new QuickInputAccessibilityProvider(),
        setRowLineHeight: false,
        multipleSelectionSupport: false,
        hideTwistiesOfChildlessElements: true,
        renderIndentGuides: RenderIndentGuides.None,
        findWidgetEnabled: false,
        indent: 0,
        horizontalScrolling: false,
        allowNonCollapsibleParents: true,
        alwaysConsumeMouseWheel: true
      }
    ));
    this._tree.getHTMLElement().id = id;
    this._register(this._itemRenderer.onDidDisposeFocusedElement(() => this._tree.domFocus()));
    this._register(this._separatorRenderer.onDidDisposeFocusedElement(() => this._tree.domFocus()));
    this._registerListeners();
  }
  get onDidChangeFocus() {
    return Event.map(
      this._tree.onDidChangeFocus,
      (e) => e.elements.filter((e2) => e2 instanceof QuickPickItemElement).map((e2) => e2.item),
      this._store
    );
  }
  get onDidChangeSelection() {
    return Event.map(
      this._tree.onDidChangeSelection,
      (e) => ({
        items: e.elements.filter((e2) => e2 instanceof QuickPickItemElement).map((e2) => e2.item),
        event: e.browserEvent
      }),
      this._store
    );
  }
  get displayed() {
    return this._container.style.display !== "none";
  }
  set displayed(value) {
    this._container.style.display = value ? "" : "none";
  }
  get scrollTop() {
    return this._tree.scrollTop;
  }
  set scrollTop(scrollTop) {
    this._tree.scrollTop = scrollTop;
  }
  get ariaLabel() {
    return this._tree.ariaLabel;
  }
  set ariaLabel(label) {
    this._tree.ariaLabel = label ?? "";
  }
  set enabled(value) {
    this._tree.getHTMLElement().style.pointerEvents = value ? "" : "none";
  }
  get matchOnDescription() {
    return this._matchOnDescription;
  }
  set matchOnDescription(value) {
    this._matchOnDescription = value;
  }
  get matchOnDetail() {
    return this._matchOnDetail;
  }
  set matchOnDetail(value) {
    this._matchOnDetail = value;
  }
  get matchOnLabel() {
    return this._matchOnLabel;
  }
  set matchOnLabel(value) {
    this._matchOnLabel = value;
  }
  get matchOnLabelMode() {
    return this._matchOnLabelMode;
  }
  set matchOnLabelMode(value) {
    this._matchOnLabelMode = value;
  }
  get matchOnMeta() {
    return this._matchOnMeta;
  }
  set matchOnMeta(value) {
    this._matchOnMeta = value;
  }
  get sortByLabel() {
    return this._sortByLabel;
  }
  set sortByLabel(value) {
    this._sortByLabel = value;
  }
  get shouldLoop() {
    return this._shouldLoop;
  }
  set shouldLoop(value) {
    this._shouldLoop = value;
  }
  //#endregion
  //#region register listeners
  _registerListeners() {
    this._registerOnContainerClick();
    this._registerOnMouseMiddleClick();
    this._registerOnTreeModelChanged();
    this._registerOnElementChecked();
    this._registerOnContextMenu();
    this._registerHoverListeners();
    this._registerSelectionChangeListener();
    this._registerSeparatorActionShowingListeners();
  }
  _registerOnContainerClick() {
    this._register(dom.addDisposableListener(this._container, dom.EventType.CLICK, (e) => {
      if (e.x || e.y) {
        this._onLeave.fire();
      }
    }));
  }
  _registerOnMouseMiddleClick() {
    this._register(dom.addDisposableListener(this._container, dom.EventType.AUXCLICK, (e) => {
      if (e.button === 1) {
        this._onLeave.fire();
      }
    }));
  }
  _registerOnTreeModelChanged() {
    this._register(this._tree.onDidChangeModel(() => {
      const visibleCount = this._itemElements.filter((e) => !e.hidden).length;
      this._visibleCountObservable.set(visibleCount, void 0);
      if (this._hasCheckboxes) {
        this._updateCheckedObservables();
      }
    }));
  }
  _registerOnElementChecked() {
    this._register(this._elementCheckedEventBufferer.wrapEvent(this._elementChecked.event, (_, e) => e)((_) => this._updateCheckedObservables()));
  }
  _registerOnContextMenu() {
    this._register(this._tree.onContextMenu((e) => {
      if (e.element) {
        e.browserEvent.preventDefault();
        this._tree.setSelection([e.element]);
      }
    }));
  }
  _registerHoverListeners() {
    const delayer = this._register(new ThrottledDelayer(typeof this.hoverDelegate.delay === "function" ? this.hoverDelegate.delay() : this.hoverDelegate.delay));
    this._register(this._tree.onMouseOver(async (e) => {
      if (dom.isHTMLAnchorElement(e.browserEvent.target)) {
        delayer.cancel();
        return;
      }
      if (
        // anchors are an exception as called out above so we skip them here
        !dom.isHTMLAnchorElement(e.browserEvent.relatedTarget) && // check if the mouse is still over the same element
        dom.isAncestor(e.browserEvent.relatedTarget, e.element?.element)
      ) {
        return;
      }
      try {
        await delayer.trigger(async () => {
          if (e.element instanceof QuickPickItemElement) {
            this.showHover(e.element);
          }
        });
      } catch (e2) {
        if (!isCancellationError(e2)) {
          throw e2;
        }
      }
    }));
    this._register(this._tree.onMouseOut((e) => {
      if (dom.isAncestor(e.browserEvent.relatedTarget, e.element?.element)) {
        return;
      }
      delayer.cancel();
    }));
  }
  /**
   * Register's focus change and mouse events so that we can track when items inside of a
   * separator's section are focused or hovered so that we can display the separator's actions
   */
  _registerSeparatorActionShowingListeners() {
    this._register(this._tree.onDidChangeFocus((e) => {
      const parent = e.elements[0] ? this._tree.getParentElement(e.elements[0]) : null;
      for (const separator of this._separatorRenderer.visibleSeparators) {
        const value = separator === parent;
        const currentActive = !!(separator.focusInsideSeparator & 2 /* ACTIVE_ITEM */);
        if (currentActive !== value) {
          if (value) {
            separator.focusInsideSeparator |= 2 /* ACTIVE_ITEM */;
          } else {
            separator.focusInsideSeparator &= ~2 /* ACTIVE_ITEM */;
          }
          this._tree.rerender(separator);
        }
      }
    }));
    this._register(this._tree.onMouseOver((e) => {
      const parent = e.element ? this._tree.getParentElement(e.element) : null;
      for (const separator of this._separatorRenderer.visibleSeparators) {
        if (separator !== parent) {
          continue;
        }
        const currentMouse = !!(separator.focusInsideSeparator & 1 /* MOUSE_HOVER */);
        if (!currentMouse) {
          separator.focusInsideSeparator |= 1 /* MOUSE_HOVER */;
          this._tree.rerender(separator);
        }
      }
    }));
    this._register(this._tree.onMouseOut((e) => {
      const parent = e.element ? this._tree.getParentElement(e.element) : null;
      for (const separator of this._separatorRenderer.visibleSeparators) {
        if (separator !== parent) {
          continue;
        }
        const currentMouse = !!(separator.focusInsideSeparator & 1 /* MOUSE_HOVER */);
        if (currentMouse) {
          separator.focusInsideSeparator &= ~1 /* MOUSE_HOVER */;
          this._tree.rerender(separator);
        }
      }
    }));
  }
  _registerSelectionChangeListener() {
    this._register(this._tree.onDidChangeSelection((e) => {
      const elementsWithoutSeparators = e.elements.filter((e2) => e2 instanceof QuickPickItemElement);
      if (elementsWithoutSeparators.length !== e.elements.length) {
        if (e.elements.length === 1 && e.elements[0] instanceof QuickPickSeparatorElement) {
          this._tree.setFocus([e.elements[0].children[0]]);
          this._tree.reveal(e.elements[0], 0);
        }
        this._tree.setSelection(elementsWithoutSeparators);
      }
    }));
  }
  //#endregion
  //#region public methods
  setAllVisibleChecked(checked) {
    this._elementCheckedEventBufferer.bufferEvents(() => {
      this._itemElements.forEach((element) => {
        if (!element.hidden && !element.checkboxDisabled && element.item.pickable !== false) {
          element.checked = checked;
        }
      });
    });
  }
  setElements(inputElements) {
    this._elementDisposable.clear();
    this._lastQueryString = void 0;
    this._inputElements = inputElements;
    this._hasCheckboxes = this.parent.classList.contains("show-checkboxes");
    let currentSeparatorElement;
    this._itemElements = new Array();
    this._elementTree = inputElements.reduce((result, item, index) => {
      let element;
      if (item.type === "separator") {
        if (!item.buttons) {
          return result;
        }
        currentSeparatorElement = new QuickPickSeparatorElement(
          index,
          (e) => this._onSeparatorButtonTriggered.fire(e),
          item
        );
        element = currentSeparatorElement;
      } else {
        const previous = index > 0 ? inputElements[index - 1] : void 0;
        let separator;
        if (previous && previous.type === "separator" && !previous.buttons) {
          separator = previous;
        }
        const qpi = new QuickPickItemElement(
          index,
          currentSeparatorElement?.children ? currentSeparatorElement.children.length : index,
          this._hasCheckboxes && item.pickable !== false,
          (e) => this._onButtonTriggered.fire(e),
          this._elementChecked,
          item,
          separator
        );
        this._itemElements.push(qpi);
        if (currentSeparatorElement) {
          currentSeparatorElement.children.push(qpi);
          return result;
        }
        element = qpi;
      }
      result.push(element);
      return result;
    }, new Array());
    this._setElementsToTree(this._elementTree);
    if (this.accessibilityService.isScreenReaderOptimized()) {
      disposableTimeout(() => {
        const focusedElement = this._tree.getHTMLElement().querySelector(`.monaco-list-row.focused`);
        const parent = focusedElement?.parentNode;
        if (focusedElement && parent) {
          const nextSibling = focusedElement.nextSibling;
          focusedElement.remove();
          parent.insertBefore(focusedElement, nextSibling);
        }
      }, 0, this._elementDisposable);
    }
  }
  setFocusedElements(items) {
    const elements = items.map((item) => this._itemElements.find((e) => e.item === item)).filter((e) => !!e).filter((e) => !e.hidden);
    this._tree.setFocus(elements);
    if (items.length > 0) {
      const focused = this._tree.getFocus()[0];
      if (focused) {
        this._tree.reveal(focused);
      }
    }
  }
  getActiveDescendant() {
    return this._tree.getHTMLElement().getAttribute("aria-activedescendant");
  }
  setSelectedElements(items) {
    const elements = items.map((item) => this._itemElements.find((e) => e.item === item)).filter((e) => !!e);
    this._tree.setSelection(elements);
  }
  getCheckedElements() {
    return this._itemElements.filter((e) => e.checked).map((e) => e.item);
  }
  setCheckedElements(items) {
    this._elementCheckedEventBufferer.bufferEvents(() => {
      const checked = /* @__PURE__ */ new Set();
      for (const item of items) {
        checked.add(item);
      }
      for (const element of this._itemElements) {
        element.checked = checked.has(element.item);
      }
    });
  }
  focus(what) {
    if (!this._itemElements.length) {
      return;
    }
    if (what === QuickPickFocus.Second && this._itemElements.length < 2) {
      what = QuickPickFocus.First;
    }
    switch (what) {
      case QuickPickFocus.First:
        this._tree.scrollTop = 0;
        this._tree.focusFirst(void 0, (e) => e.element instanceof QuickPickItemElement);
        break;
      case QuickPickFocus.Second: {
        this._tree.scrollTop = 0;
        let isSecondItem = false;
        this._tree.focusFirst(void 0, (e) => {
          if (!(e.element instanceof QuickPickItemElement)) {
            return false;
          }
          if (isSecondItem) {
            return true;
          }
          isSecondItem = !isSecondItem;
          return false;
        });
        break;
      }
      case QuickPickFocus.Last:
        this._tree.scrollTop = this._tree.scrollHeight;
        this._tree.focusLast(void 0, (e) => e.element instanceof QuickPickItemElement);
        break;
      case QuickPickFocus.Next: {
        const prevFocus = this._tree.getFocus();
        this._tree.focusNext(void 0, this._shouldLoop, void 0, (e) => {
          if (!(e.element instanceof QuickPickItemElement)) {
            return false;
          }
          this._tree.reveal(e.element);
          return true;
        });
        const currentFocus = this._tree.getFocus();
        if (prevFocus.length && prevFocus[0] === currentFocus[0]) {
          this._onLeave.fire();
        }
        break;
      }
      case QuickPickFocus.Previous: {
        const prevFocus = this._tree.getFocus();
        this._tree.focusPrevious(void 0, this._shouldLoop, void 0, (e) => {
          if (!(e.element instanceof QuickPickItemElement)) {
            return false;
          }
          const parent = this._tree.getParentElement(e.element);
          if (parent === null || parent.children[0] !== e.element) {
            this._tree.reveal(e.element);
          } else {
            this._tree.reveal(parent);
          }
          return true;
        });
        const currentFocus = this._tree.getFocus();
        if (prevFocus.length && prevFocus[0] === currentFocus[0]) {
          this._onLeave.fire();
        }
        break;
      }
      case QuickPickFocus.NextPage:
        this._tree.focusNextPage(void 0, (e) => {
          if (!(e.element instanceof QuickPickItemElement)) {
            return false;
          }
          this._tree.reveal(e.element);
          return true;
        });
        break;
      case QuickPickFocus.PreviousPage:
        this._tree.focusPreviousPage(void 0, (e) => {
          if (!(e.element instanceof QuickPickItemElement)) {
            return false;
          }
          const parent = this._tree.getParentElement(e.element);
          if (parent === null || parent.children[0] !== e.element) {
            this._tree.reveal(e.element);
          } else {
            this._tree.reveal(parent);
          }
          return true;
        });
        break;
      case QuickPickFocus.NextSeparator: {
        let foundSeparatorAsItem = false;
        const before = this._tree.getFocus()[0];
        this._tree.focusNext(void 0, true, void 0, (e) => {
          if (foundSeparatorAsItem) {
            return true;
          }
          if (e.element instanceof QuickPickSeparatorElement) {
            foundSeparatorAsItem = true;
            if (this._separatorRenderer.isSeparatorVisible(e.element)) {
              this._tree.reveal(e.element.children[0]);
            } else {
              this._tree.reveal(e.element, 0);
            }
          } else if (e.element instanceof QuickPickItemElement) {
            if (e.element.separator) {
              if (this._itemRenderer.isItemWithSeparatorVisible(e.element)) {
                this._tree.reveal(e.element);
              } else {
                this._tree.reveal(e.element, 0);
              }
              return true;
            } else if (e.element === this._elementTree[0]) {
              this._tree.reveal(e.element, 0);
              return true;
            }
          }
          return false;
        });
        const after = this._tree.getFocus()[0];
        if (before === after) {
          this._tree.scrollTop = this._tree.scrollHeight;
          this._tree.focusLast(void 0, (e) => e.element instanceof QuickPickItemElement);
        }
        break;
      }
      case QuickPickFocus.PreviousSeparator: {
        let focusElement;
        let foundSeparator = !!this._tree.getFocus()[0]?.separator;
        this._tree.focusPrevious(void 0, true, void 0, (e) => {
          if (e.element instanceof QuickPickSeparatorElement) {
            if (foundSeparator) {
              if (!focusElement) {
                if (this._separatorRenderer.isSeparatorVisible(e.element)) {
                  this._tree.reveal(e.element);
                } else {
                  this._tree.reveal(e.element, 0);
                }
                focusElement = e.element.children[0];
              }
            } else {
              foundSeparator = true;
            }
          } else if (e.element instanceof QuickPickItemElement) {
            if (!focusElement) {
              if (e.element.separator) {
                if (this._itemRenderer.isItemWithSeparatorVisible(e.element)) {
                  this._tree.reveal(e.element);
                } else {
                  this._tree.reveal(e.element, 0);
                }
                focusElement = e.element;
              } else if (e.element === this._elementTree[0]) {
                this._tree.reveal(e.element, 0);
                return true;
              }
            }
          }
          return false;
        });
        if (focusElement) {
          this._tree.setFocus([focusElement]);
        }
        break;
      }
    }
  }
  clearFocus() {
    this._tree.setFocus([]);
  }
  domFocus() {
    this._tree.domFocus();
  }
  layout(maxHeight) {
    this._tree.getHTMLElement().style.maxHeight = maxHeight ? `${// Make sure height aligns with list item heights
    Math.floor(maxHeight / 44) * 44 + 6}px` : "";
    this._tree.layout();
  }
  filter(query) {
    this._lastQueryString = query;
    if (!(this._sortByLabel || this._matchOnLabel || this._matchOnDescription || this._matchOnDetail)) {
      this._tree.layout();
      return false;
    }
    const queryWithWhitespace = query;
    query = query.trim();
    if (!query || !(this.matchOnLabel || this.matchOnDescription || this.matchOnDetail)) {
      this._itemElements.forEach((element) => {
        element.labelHighlights = void 0;
        element.descriptionHighlights = void 0;
        element.detailHighlights = void 0;
        element.hidden = false;
        const previous = element.index && this._inputElements[element.index - 1];
        if (element.item) {
          element.separator = previous && previous.type === "separator" && !previous.buttons ? previous : void 0;
        }
      });
    } else {
      let currentSeparator;
      this._itemElements.forEach((element) => {
        let labelHighlights;
        if (this.matchOnLabelMode === "fuzzy") {
          labelHighlights = this.matchOnLabel ? matchesFuzzyIconAware(query, parseLabelWithIcons(element.saneLabel)) ?? void 0 : void 0;
        } else {
          labelHighlights = this.matchOnLabel ? matchesContiguousIconAware(queryWithWhitespace, parseLabelWithIcons(element.saneLabel)) ?? void 0 : void 0;
        }
        const descriptionHighlights = this.matchOnDescription ? matchesFuzzyIconAware(query, parseLabelWithIcons(element.saneDescription || "")) ?? void 0 : void 0;
        const detailHighlights = this.matchOnDetail ? matchesFuzzyIconAware(query, parseLabelWithIcons(element.saneDetail || "")) ?? void 0 : void 0;
        if (labelHighlights || descriptionHighlights || detailHighlights) {
          element.labelHighlights = labelHighlights;
          element.descriptionHighlights = descriptionHighlights;
          element.detailHighlights = detailHighlights;
          element.hidden = false;
        } else {
          element.labelHighlights = void 0;
          element.descriptionHighlights = void 0;
          element.detailHighlights = void 0;
          element.hidden = element.item ? !element.item.alwaysShow : true;
        }
        if (element.item) {
          element.separator = void 0;
        } else if (element.separator) {
          element.hidden = true;
        }
        if (!this.sortByLabel) {
          const previous = element.index && this._inputElements[element.index - 1] || void 0;
          if (previous?.type === "separator" && !previous.buttons) {
            currentSeparator = previous;
          }
          if (currentSeparator && !element.hidden) {
            element.separator = currentSeparator;
            currentSeparator = void 0;
          }
        }
      });
    }
    this._setElementsToTree(
      this._sortByLabel && query ? this._itemElements : this._elementTree
    );
    this._tree.layout();
    return true;
  }
  toggleCheckbox() {
    this._elementCheckedEventBufferer.bufferEvents(() => {
      const elements = this._tree.getFocus().filter((e) => e instanceof QuickPickItemElement);
      const allChecked = this._allVisibleChecked(elements);
      for (const element of elements) {
        if (!element.checkboxDisabled) {
          element.checked = !allChecked;
        }
      }
    });
  }
  style(styles) {
    this._tree.style(styles);
  }
  toggleHover() {
    const focused = this._tree.getFocus()[0];
    if (!focused?.saneTooltip || !(focused instanceof QuickPickItemElement)) {
      return;
    }
    if (this._lastHover && !this._lastHover.isDisposed) {
      this._lastHover.dispose();
      return;
    }
    this.showHover(focused);
    const store = new DisposableStore();
    store.add(this._tree.onDidChangeFocus((e) => {
      if (e.elements[0] instanceof QuickPickItemElement) {
        this.showHover(e.elements[0]);
      }
    }));
    if (this._lastHover) {
      store.add(this._lastHover);
    }
    this._elementDisposable.add(store);
  }
  //#endregion
  //#region private methods
  _setElementsToTree(elements) {
    const treeElements = new Array();
    for (const element of elements) {
      if (element instanceof QuickPickSeparatorElement) {
        treeElements.push({
          element,
          collapsible: false,
          collapsed: false,
          children: element.children.map((e) => ({
            element: e,
            collapsible: false,
            collapsed: false
          }))
        });
      } else {
        treeElements.push({
          element,
          collapsible: false,
          collapsed: false
        });
      }
    }
    this._tree.setChildren(null, treeElements);
  }
  _allVisibleChecked(elements, whenNoneVisible = true) {
    for (let i = 0, n = elements.length; i < n; i++) {
      const element = elements[i];
      if (!element.hidden && element.item.pickable !== false) {
        if (!element.checked) {
          return false;
        } else {
          whenNoneVisible = true;
        }
      }
    }
    return whenNoneVisible;
  }
  _updateCheckedObservables() {
    transaction((tx) => {
      this._allVisibleCheckedObservable.set(this._allVisibleChecked(this._itemElements, false), tx);
      const checkedCount = this._itemElements.filter((element) => element.checked).length;
      this._checkedCountObservable.set(checkedCount, tx);
      this._checkedElementsObservable.set(this.getCheckedElements(), tx);
    });
  }
  /**
   * Disposes of the hover and shows a new one for the given index if it has a tooltip.
   * @param element The element to show the hover for
   */
  showHover(element) {
    if (this._lastHover && !this._lastHover.isDisposed) {
      this.hoverDelegate.onDidHideHover?.();
      this._lastHover?.dispose();
    }
    if (!element.element || !element.saneTooltip) {
      return;
    }
    this._lastHover = this.hoverDelegate.showHover({
      content: element.saneTooltip,
      target: element.element,
      linkHandler: (url) => {
        this.linkOpenerDelegate(url);
      },
      appearance: {
        showPointer: true
      },
      container: this._container,
      position: {
        hoverPosition: HoverPosition.RIGHT
      }
    }, false);
  }
};
__decorateClass([
  memoize
], QuickInputList.prototype, "onDidChangeFocus", 1);
__decorateClass([
  memoize
], QuickInputList.prototype, "onDidChangeSelection", 1);
QuickInputList = __decorateClass([
  __decorateParam(5, IInstantiationService),
  __decorateParam(6, IAccessibilityService)
], QuickInputList);
function matchesContiguousIconAware(query, target) {
  const { text, iconOffsets } = target;
  if (!iconOffsets || iconOffsets.length === 0) {
    return matchesContiguous(query, text);
  }
  const wordToMatchAgainstWithoutIconsTrimmed = ltrim(text, " ");
  const leadingWhitespaceOffset = text.length - wordToMatchAgainstWithoutIconsTrimmed.length;
  const matches = matchesContiguous(query, wordToMatchAgainstWithoutIconsTrimmed);
  if (matches) {
    for (const match of matches) {
      const iconOffset = iconOffsets[match.start + leadingWhitespaceOffset] + leadingWhitespaceOffset;
      match.start += iconOffset;
      match.end += iconOffset;
    }
  }
  return matches;
}
function matchesContiguous(word, wordToMatchAgainst) {
  const matchIndex = wordToMatchAgainst.toLowerCase().indexOf(word.toLowerCase());
  if (matchIndex !== -1) {
    return [{ start: matchIndex, end: matchIndex + word.length }];
  }
  return null;
}
function compareEntries(elementA, elementB, lookFor) {
  const labelHighlightsA = elementA.labelHighlights || [];
  const labelHighlightsB = elementB.labelHighlights || [];
  if (labelHighlightsA.length && !labelHighlightsB.length) {
    return -1;
  }
  if (!labelHighlightsA.length && labelHighlightsB.length) {
    return 1;
  }
  if (labelHighlightsA.length === 0 && labelHighlightsB.length === 0) {
    return 0;
  }
  return compareAnything(elementA.saneSortLabel, elementB.saneSortLabel, lookFor);
}
export {
  QuickInputList
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxwbGF0Zm9ybVxccXVpY2tpbnB1dFxcYnJvd3NlclxccXVpY2tJbnB1dExpc3QudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgKiBhcyBjc3NKcyBmcm9tICcuLi8uLi8uLi9iYXNlL2Jyb3dzZXIvY3NzVmFsdWUuanMnO1xuaW1wb3J0ICogYXMgZG9tIGZyb20gJy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci9kb20uanMnO1xuaW1wb3J0IHsgU3RhbmRhcmRLZXlib2FyZEV2ZW50IH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9icm93c2VyL2tleWJvYXJkRXZlbnQuanMnO1xuaW1wb3J0IHsgVG9vbEJhciB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci91aS90b29sYmFyL3Rvb2xiYXIuanMnO1xuaW1wb3J0IHsgQXJpYVJvbGUgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2Jyb3dzZXIvdWkvYXJpYS9hcmlhLmpzJztcbmltcG9ydCB0eXBlIHsgSUhvdmVyV2lkZ2V0LCBJTWFuYWdlZEhvdmVyVG9vbHRpcE1hcmtkb3duU3RyaW5nIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9icm93c2VyL3VpL2hvdmVyL2hvdmVyLmpzJztcbmltcG9ydCB7IElIb3ZlckRlbGVnYXRlIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9icm93c2VyL3VpL2hvdmVyL2hvdmVyRGVsZWdhdGUuanMnO1xuaW1wb3J0IHsgSG92ZXJQb3NpdGlvbiB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci91aS9ob3Zlci9ob3ZlcldpZGdldC5qcyc7XG5pbXBvcnQgeyBJSWNvbkxhYmVsVmFsdWVPcHRpb25zLCBJY29uTGFiZWwgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2Jyb3dzZXIvdWkvaWNvbkxhYmVsL2ljb25MYWJlbC5qcyc7XG5pbXBvcnQgeyBLZXliaW5kaW5nTGFiZWwgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2Jyb3dzZXIvdWkva2V5YmluZGluZ0xhYmVsL2tleWJpbmRpbmdMYWJlbC5qcyc7XG5pbXBvcnQgeyBJTGlzdFZpcnR1YWxEZWxlZ2F0ZSB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci91aS9saXN0L2xpc3QuanMnO1xuaW1wb3J0IHsgSUxpc3RBY2Nlc3NpYmlsaXR5UHJvdmlkZXIsIElMaXN0U3R5bGVzIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9icm93c2VyL3VpL2xpc3QvbGlzdFdpZGdldC5qcyc7XG5pbXBvcnQgeyBDaGVja2JveCwgY3JlYXRlVG9nZ2xlQWN0aW9uVmlld0l0ZW1Qcm92aWRlciwgSVRvZ2dsZVN0eWxlcyB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci91aS90b2dnbGUvdG9nZ2xlLmpzJztcbmltcG9ydCB7IFJlbmRlckluZGVudEd1aWRlcyB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci91aS90cmVlL2Fic3RyYWN0VHJlZS5qcyc7XG5pbXBvcnQgeyBJT2JqZWN0VHJlZUVsZW1lbnQsIElUcmVlTm9kZSwgSVRyZWVSZW5kZXJlciwgVHJlZVZpc2liaWxpdHkgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2Jyb3dzZXIvdWkvdHJlZS90cmVlLmpzJztcbmltcG9ydCB7IGVxdWFscyB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL2FycmF5cy5qcyc7XG5pbXBvcnQgeyBkaXNwb3NhYmxlVGltZW91dCwgVGhyb3R0bGVkRGVsYXllciB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL2FzeW5jLmpzJztcbmltcG9ydCB7IGNvbXBhcmVBbnl0aGluZyB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL2NvbXBhcmVycy5qcyc7XG5pbXBvcnQgeyBtZW1vaXplIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vZGVjb3JhdG9ycy5qcyc7XG5pbXBvcnQgeyBpc0NhbmNlbGxhdGlvbkVycm9yIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vZXJyb3JzLmpzJztcbmltcG9ydCB7IEVtaXR0ZXIsIEV2ZW50LCBFdmVudEJ1ZmZlcmVyLCBJVmFsdWVXaXRoQ2hhbmdlRXZlbnQgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9ldmVudC5qcyc7XG5pbXBvcnQgeyBJTWF0Y2ggfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9maWx0ZXJzLmpzJztcbmltcG9ydCB7IElNYXJrZG93blN0cmluZyB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL2h0bWxDb250ZW50LmpzJztcbmltcG9ydCB7IElQYXJzZWRMYWJlbFdpdGhJY29ucywgZ2V0Q29kaWNvbkFyaWFMYWJlbCwgbWF0Y2hlc0Z1enp5SWNvbkF3YXJlLCBwYXJzZUxhYmVsV2l0aEljb25zIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vaWNvbkxhYmVscy5qcyc7XG5pbXBvcnQgeyBMYXp5IH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vbGF6eS5qcyc7XG5pbXBvcnQgeyBEaXNwb3NhYmxlLCBEaXNwb3NhYmxlU3RvcmUsIE11dGFibGVEaXNwb3NhYmxlIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IG9ic2VydmFibGVWYWx1ZSwgb2JzZXJ2YWJsZVZhbHVlT3B0cywgdHJhbnNhY3Rpb24gfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9vYnNlcnZhYmxlLmpzJztcbmltcG9ydCB7IE9TIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vcGxhdGZvcm0uanMnO1xuaW1wb3J0IHsgZXNjYXBlLCBsdHJpbSB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL3N0cmluZ3MuanMnO1xuaW1wb3J0IHsgVVJJIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vdXJpLmpzJztcbmltcG9ydCB7IGxvY2FsaXplIH0gZnJvbSAnLi4vLi4vLi4vbmxzLmpzJztcbmltcG9ydCB7IElBY2Nlc3NpYmlsaXR5U2VydmljZSB9IGZyb20gJy4uLy4uL2FjY2Vzc2liaWxpdHkvY29tbW9uL2FjY2Vzc2liaWxpdHkuanMnO1xuaW1wb3J0IHsgSUNvbnRleHRNZW51U2VydmljZSB9IGZyb20gJy4uLy4uL2NvbnRleHR2aWV3L2Jyb3dzZXIvY29udGV4dFZpZXcuanMnO1xuaW1wb3J0IHsgSUluc3RhbnRpYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vaW5zdGFudGlhdGlvbi9jb21tb24vaW5zdGFudGlhdGlvbi5qcyc7XG5pbXBvcnQgeyBXb3JrYmVuY2hPYmplY3RUcmVlIH0gZnJvbSAnLi4vLi4vbGlzdC9icm93c2VyL2xpc3RTZXJ2aWNlLmpzJztcbmltcG9ydCB7IGRlZmF1bHRDaGVja2JveFN0eWxlcyB9IGZyb20gJy4uLy4uL3RoZW1lL2Jyb3dzZXIvZGVmYXVsdFN0eWxlcy5qcyc7XG5pbXBvcnQgeyBpc0RhcmsgfSBmcm9tICcuLi8uLi90aGVtZS9jb21tb24vdGhlbWUuanMnO1xuaW1wb3J0IHsgSVRoZW1lU2VydmljZSB9IGZyb20gJy4uLy4uL3RoZW1lL2NvbW1vbi90aGVtZVNlcnZpY2UuanMnO1xuaW1wb3J0IHsgYXNDc3NWYXJpYWJsZSB9IGZyb20gJy4uLy4uL3RoZW1lL2NvbW1vbi9jb2xvclV0aWxzLmpzJztcbmltcG9ydCB7IElRdWlja1BpY2tJdGVtLCBJUXVpY2tQaWNrSXRlbUJ1dHRvbkV2ZW50LCBJUXVpY2tQaWNrU2VwYXJhdG9yLCBJUXVpY2tQaWNrU2VwYXJhdG9yQnV0dG9uRXZlbnQsIFF1aWNrUGlja0ZvY3VzLCBRdWlja1BpY2tJdGVtIH0gZnJvbSAnLi4vY29tbW9uL3F1aWNrSW5wdXQuanMnO1xuaW1wb3J0IHsgSVF1aWNrSW5wdXRTdHlsZXMgfSBmcm9tICcuL3F1aWNrSW5wdXQuanMnO1xuaW1wb3J0IHsgcXVpY2tJbnB1dEJ1dHRvbnNUb0FjdGlvbkFycmF5cyB9IGZyb20gJy4vcXVpY2tJbnB1dFV0aWxzLmpzJztcblxuY29uc3QgJCA9IGRvbS4kO1xuXG5pbnRlcmZhY2UgSVF1aWNrSW5wdXRJdGVtTGF6eVBhcnRzIHtcblx0cmVhZG9ubHkgc2FuZUxhYmVsOiBzdHJpbmc7XG5cdHJlYWRvbmx5IHNhbmVTb3J0TGFiZWw6IHN0cmluZztcblx0cmVhZG9ubHkgc2FuZUFyaWFMYWJlbDogc3RyaW5nO1xufVxuXG5pbnRlcmZhY2UgSVF1aWNrUGlja0VsZW1lbnQgZXh0ZW5kcyBJUXVpY2tJbnB1dEl0ZW1MYXp5UGFydHMge1xuXHRyZWFkb25seSBoYXNDaGVja2JveDogYm9vbGVhbjtcblx0cmVhZG9ubHkgaW5kZXg6IG51bWJlcjtcblx0cmVhZG9ubHkgaXRlbT86IElRdWlja1BpY2tJdGVtO1xuXHRyZWFkb25seSBzYW5lRGVzY3JpcHRpb24/OiBzdHJpbmc7XG5cdHJlYWRvbmx5IHNhbmVEZXRhaWw/OiBzdHJpbmc7XG5cdHJlYWRvbmx5IHNhbmVUb29sdGlwPzogc3RyaW5nIHwgSU1hcmtkb3duU3RyaW5nIHwgSFRNTEVsZW1lbnQ7XG5cdGhpZGRlbjogYm9vbGVhbjtcblx0ZWxlbWVudD86IEhUTUxFbGVtZW50O1xuXHRsYWJlbEhpZ2hsaWdodHM/OiBJTWF0Y2hbXTtcblx0ZGVzY3JpcHRpb25IaWdobGlnaHRzPzogSU1hdGNoW107XG5cdGRldGFpbEhpZ2hsaWdodHM/OiBJTWF0Y2hbXTtcblx0c2VwYXJhdG9yPzogSVF1aWNrUGlja1NlcGFyYXRvcjtcbn1cblxuaW50ZXJmYWNlIElRdWlja0lucHV0SXRlbVRlbXBsYXRlRGF0YSB7XG5cdGVudHJ5OiBIVE1MRGl2RWxlbWVudDtcblx0Y2hlY2tib3g6IE11dGFibGVEaXNwb3NhYmxlPENoZWNrYm94Pjtcblx0aWNvbjogSFRNTERpdkVsZW1lbnQ7XG5cdG91dGVyTGFiZWw6IEhUTUxFbGVtZW50O1xuXHRsYWJlbDogSWNvbkxhYmVsO1xuXHRrZXliaW5kaW5nOiBLZXliaW5kaW5nTGFiZWw7XG5cdGRldGFpbDogSWNvbkxhYmVsO1xuXHRzZXBhcmF0b3I6IEhUTUxEaXZFbGVtZW50O1xuXHR0b29sQmFyOiBUb29sQmFyO1xuXHRlbGVtZW50OiBJUXVpY2tQaWNrRWxlbWVudDtcblx0dG9EaXNwb3NlRWxlbWVudDogRGlzcG9zYWJsZVN0b3JlO1xuXHR0b0Rpc3Bvc2VUZW1wbGF0ZTogRGlzcG9zYWJsZVN0b3JlO1xufVxuXG5jbGFzcyBCYXNlUXVpY2tQaWNrSXRlbUVsZW1lbnQgaW1wbGVtZW50cyBJUXVpY2tQaWNrRWxlbWVudCB7XG5cdHByaXZhdGUgcmVhZG9ubHkgX2luaXQ6IExhenk8SVF1aWNrSW5wdXRJdGVtTGF6eVBhcnRzPjtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRyZWFkb25seSBpbmRleDogbnVtYmVyLFxuXHRcdHJlYWRvbmx5IGhhc0NoZWNrYm94OiBib29sZWFuLFxuXHRcdG1haW5JdGVtOiBRdWlja1BpY2tJdGVtXG5cdCkge1xuXHRcdHRoaXMuX2luaXQgPSBuZXcgTGF6eSgoKSA9PiB7XG5cdFx0XHRjb25zdCBzYW5lTGFiZWwgPSBtYWluSXRlbS5sYWJlbCA/PyAnJztcblx0XHRcdGNvbnN0IHNhbmVTb3J0TGFiZWwgPSBwYXJzZUxhYmVsV2l0aEljb25zKHNhbmVMYWJlbCkudGV4dC50cmltKCk7XG5cblx0XHRcdGNvbnN0IHNhbmVBcmlhTGFiZWwgPSBtYWluSXRlbS5hcmlhTGFiZWwgfHwgW3NhbmVMYWJlbCwgdGhpcy5zYW5lRGVzY3JpcHRpb24sIHRoaXMuc2FuZURldGFpbF1cblx0XHRcdFx0Lm1hcChzID0+IGdldENvZGljb25BcmlhTGFiZWwocykpXG5cdFx0XHRcdC5maWx0ZXIocyA9PiAhIXMpXG5cdFx0XHRcdC5qb2luKCcsICcpO1xuXG5cdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRzYW5lTGFiZWwsXG5cdFx0XHRcdHNhbmVTb3J0TGFiZWwsXG5cdFx0XHRcdHNhbmVBcmlhTGFiZWxcblx0XHRcdH07XG5cdFx0fSk7XG5cdFx0dGhpcy5fc2FuZURlc2NyaXB0aW9uID0gbWFpbkl0ZW0uZGVzY3JpcHRpb247XG5cdFx0dGhpcy5fc2FuZVRvb2x0aXAgPSBtYWluSXRlbS50b29sdGlwO1xuXHR9XG5cblx0Ly8gI3JlZ2lvbiBMYXp5IEdldHRlcnNcblxuXHRnZXQgc2FuZUxhYmVsKCkge1xuXHRcdHJldHVybiB0aGlzLl9pbml0LnZhbHVlLnNhbmVMYWJlbDtcblx0fVxuXHRnZXQgc2FuZVNvcnRMYWJlbCgpIHtcblx0XHRyZXR1cm4gdGhpcy5faW5pdC52YWx1ZS5zYW5lU29ydExhYmVsO1xuXHR9XG5cdGdldCBzYW5lQXJpYUxhYmVsKCkge1xuXHRcdHJldHVybiB0aGlzLl9pbml0LnZhbHVlLnNhbmVBcmlhTGFiZWw7XG5cdH1cblxuXHQvLyAjZW5kcmVnaW9uXG5cblx0Ly8gI3JlZ2lvbiBHZXR0ZXJzIGFuZCBTZXR0ZXJzXG5cblx0cHJpdmF0ZSBfZWxlbWVudD86IEhUTUxFbGVtZW50O1xuXHRnZXQgZWxlbWVudCgpIHtcblx0XHRyZXR1cm4gdGhpcy5fZWxlbWVudDtcblx0fVxuXHRzZXQgZWxlbWVudCh2YWx1ZTogSFRNTEVsZW1lbnQgfCB1bmRlZmluZWQpIHtcblx0XHR0aGlzLl9lbGVtZW50ID0gdmFsdWU7XG5cdH1cblxuXHRwcml2YXRlIF9oaWRkZW4gPSBmYWxzZTtcblx0Z2V0IGhpZGRlbigpIHtcblx0XHRyZXR1cm4gdGhpcy5faGlkZGVuO1xuXHR9XG5cdHNldCBoaWRkZW4odmFsdWU6IGJvb2xlYW4pIHtcblx0XHR0aGlzLl9oaWRkZW4gPSB2YWx1ZTtcblx0fVxuXG5cdHByaXZhdGUgX3NhbmVEZXNjcmlwdGlvbj86IHN0cmluZztcblx0Z2V0IHNhbmVEZXNjcmlwdGlvbigpIHtcblx0XHRyZXR1cm4gdGhpcy5fc2FuZURlc2NyaXB0aW9uO1xuXHR9XG5cdHNldCBzYW5lRGVzY3JpcHRpb24odmFsdWU6IHN0cmluZyB8IHVuZGVmaW5lZCkge1xuXHRcdHRoaXMuX3NhbmVEZXNjcmlwdGlvbiA9IHZhbHVlO1xuXHR9XG5cblx0cHJvdGVjdGVkIF9zYW5lRGV0YWlsPzogc3RyaW5nO1xuXHRnZXQgc2FuZURldGFpbCgpIHtcblx0XHRyZXR1cm4gdGhpcy5fc2FuZURldGFpbDtcblx0fVxuXHRzZXQgc2FuZURldGFpbCh2YWx1ZTogc3RyaW5nIHwgdW5kZWZpbmVkKSB7XG5cdFx0dGhpcy5fc2FuZURldGFpbCA9IHZhbHVlO1xuXHR9XG5cblx0cHJpdmF0ZSBfc2FuZVRvb2x0aXA/OiBzdHJpbmcgfCBJTWFya2Rvd25TdHJpbmcgfCBIVE1MRWxlbWVudDtcblx0Z2V0IHNhbmVUb29sdGlwKCkge1xuXHRcdHJldHVybiB0aGlzLl9zYW5lVG9vbHRpcDtcblx0fVxuXHRzZXQgc2FuZVRvb2x0aXAodmFsdWU6IHN0cmluZyB8IElNYXJrZG93blN0cmluZyB8IEhUTUxFbGVtZW50IHwgdW5kZWZpbmVkKSB7XG5cdFx0dGhpcy5fc2FuZVRvb2x0aXAgPSB2YWx1ZTtcblx0fVxuXG5cdHByb3RlY3RlZCBfbGFiZWxIaWdobGlnaHRzPzogSU1hdGNoW107XG5cdGdldCBsYWJlbEhpZ2hsaWdodHMoKSB7XG5cdFx0cmV0dXJuIHRoaXMuX2xhYmVsSGlnaGxpZ2h0cztcblx0fVxuXHRzZXQgbGFiZWxIaWdobGlnaHRzKHZhbHVlOiBJTWF0Y2hbXSB8IHVuZGVmaW5lZCkge1xuXHRcdHRoaXMuX2xhYmVsSGlnaGxpZ2h0cyA9IHZhbHVlO1xuXHR9XG5cblx0cHJvdGVjdGVkIF9kZXNjcmlwdGlvbkhpZ2hsaWdodHM/OiBJTWF0Y2hbXTtcblx0Z2V0IGRlc2NyaXB0aW9uSGlnaGxpZ2h0cygpIHtcblx0XHRyZXR1cm4gdGhpcy5fZGVzY3JpcHRpb25IaWdobGlnaHRzO1xuXHR9XG5cdHNldCBkZXNjcmlwdGlvbkhpZ2hsaWdodHModmFsdWU6IElNYXRjaFtdIHwgdW5kZWZpbmVkKSB7XG5cdFx0dGhpcy5fZGVzY3JpcHRpb25IaWdobGlnaHRzID0gdmFsdWU7XG5cdH1cblxuXHRwcm90ZWN0ZWQgX2RldGFpbEhpZ2hsaWdodHM/OiBJTWF0Y2hbXTtcblx0Z2V0IGRldGFpbEhpZ2hsaWdodHMoKSB7XG5cdFx0cmV0dXJuIHRoaXMuX2RldGFpbEhpZ2hsaWdodHM7XG5cdH1cblx0c2V0IGRldGFpbEhpZ2hsaWdodHModmFsdWU6IElNYXRjaFtdIHwgdW5kZWZpbmVkKSB7XG5cdFx0dGhpcy5fZGV0YWlsSGlnaGxpZ2h0cyA9IHZhbHVlO1xuXHR9XG59XG5cbmNsYXNzIFF1aWNrUGlja0l0ZW1FbGVtZW50IGV4dGVuZHMgQmFzZVF1aWNrUGlja0l0ZW1FbGVtZW50IHtcblx0cmVhZG9ubHkgb25DaGVja2VkOiBFdmVudDxib29sZWFuPjtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRpbmRleDogbnVtYmVyLFxuXHRcdHJlYWRvbmx5IGNoaWxkSW5kZXg6IG51bWJlcixcblx0XHRoYXNDaGVja2JveDogYm9vbGVhbixcblx0XHRyZWFkb25seSBmaXJlQnV0dG9uVHJpZ2dlcmVkOiAoZXZlbnQ6IElRdWlja1BpY2tJdGVtQnV0dG9uRXZlbnQ8SVF1aWNrUGlja0l0ZW0+KSA9PiB2b2lkLFxuXHRcdHByaXZhdGUgX29uQ2hlY2tlZDogRW1pdHRlcjx7IGVsZW1lbnQ6IElRdWlja1BpY2tFbGVtZW50OyBjaGVja2VkOiBib29sZWFuIH0+LFxuXHRcdHJlYWRvbmx5IGl0ZW06IElRdWlja1BpY2tJdGVtLFxuXHRcdHByaXZhdGUgX3NlcGFyYXRvcjogSVF1aWNrUGlja1NlcGFyYXRvciB8IHVuZGVmaW5lZCxcblx0KSB7XG5cdFx0c3VwZXIoaW5kZXgsIGhhc0NoZWNrYm94LCBpdGVtKTtcblxuXHRcdHRoaXMub25DaGVja2VkID0gaGFzQ2hlY2tib3hcblx0XHRcdD8gRXZlbnQubWFwKEV2ZW50LmZpbHRlcjx7IGVsZW1lbnQ6IElRdWlja1BpY2tFbGVtZW50OyBjaGVja2VkOiBib29sZWFuIH0+KHRoaXMuX29uQ2hlY2tlZC5ldmVudCwgZSA9PiBlLmVsZW1lbnQgPT09IHRoaXMpLCBlID0+IGUuY2hlY2tlZClcblx0XHRcdDogRXZlbnQuTm9uZTtcblxuXHRcdHRoaXMuX3NhbmVEZXRhaWwgPSBpdGVtLmRldGFpbDtcblx0XHR0aGlzLl9sYWJlbEhpZ2hsaWdodHMgPSBpdGVtLmhpZ2hsaWdodHM/LmxhYmVsO1xuXHRcdHRoaXMuX2Rlc2NyaXB0aW9uSGlnaGxpZ2h0cyA9IGl0ZW0uaGlnaGxpZ2h0cz8uZGVzY3JpcHRpb247XG5cdFx0dGhpcy5fZGV0YWlsSGlnaGxpZ2h0cyA9IGl0ZW0uaGlnaGxpZ2h0cz8uZGV0YWlsO1xuXHR9XG5cblx0Z2V0IHNlcGFyYXRvcigpIHtcblx0XHRyZXR1cm4gdGhpcy5fc2VwYXJhdG9yO1xuXHR9XG5cdHNldCBzZXBhcmF0b3IodmFsdWU6IElRdWlja1BpY2tTZXBhcmF0b3IgfCB1bmRlZmluZWQpIHtcblx0XHR0aGlzLl9zZXBhcmF0b3IgPSB2YWx1ZTtcblx0fVxuXG5cdHByaXZhdGUgX2NoZWNrZWQgPSBmYWxzZTtcblx0Z2V0IGNoZWNrZWQoKSB7XG5cdFx0cmV0dXJuIHRoaXMuX2NoZWNrZWQ7XG5cdH1cblx0c2V0IGNoZWNrZWQodmFsdWU6IGJvb2xlYW4pIHtcblx0XHRpZiAodmFsdWUgIT09IHRoaXMuX2NoZWNrZWQpIHtcblx0XHRcdHRoaXMuX2NoZWNrZWQgPSB2YWx1ZTtcblx0XHRcdHRoaXMuX29uQ2hlY2tlZC5maXJlKHsgZWxlbWVudDogdGhpcywgY2hlY2tlZDogdmFsdWUgfSk7XG5cdFx0fVxuXHR9XG5cblx0Z2V0IGNoZWNrYm94RGlzYWJsZWQoKSB7XG5cdFx0cmV0dXJuICEhdGhpcy5pdGVtLmRpc2FibGVkO1xuXHR9XG59XG5cbmVudW0gUXVpY2tQaWNrU2VwYXJhdG9yRm9jdXNSZWFzb24ge1xuXHQvKipcblx0ICogTm8gaXRlbSBpcyBob3ZlcmVkIG9yIGFjdGl2ZVxuXHQgKi9cblx0Tk9ORSA9IDAsXG5cdC8qKlxuXHQgKiBTb21lIGl0ZW0gd2l0aGluIHRoaXMgc2VjdGlvbiBpcyBob3ZlcmVkXG5cdCAqL1xuXHRNT1VTRV9IT1ZFUiA9IDEsXG5cdC8qKlxuXHQgKiBTb21lIGl0ZW0gd2l0aGluIHRoaXMgc2VjdGlvbiBpcyBhY3RpdmVcblx0ICovXG5cdEFDVElWRV9JVEVNID0gMlxufVxuXG5jbGFzcyBRdWlja1BpY2tTZXBhcmF0b3JFbGVtZW50IGV4dGVuZHMgQmFzZVF1aWNrUGlja0l0ZW1FbGVtZW50IHtcblx0Y2hpbGRyZW4gPSBuZXcgQXJyYXk8UXVpY2tQaWNrSXRlbUVsZW1lbnQ+KCk7XG5cdC8qKlxuXHQgKiBJZiB0aGlzIGl0ZW0gaXMgPjAsIGl0IG1lYW5zIHRoYXQgdGhlcmUgaXMgc29tZSBpdGVtIGluIHRoZSBsaXN0IHRoYXQgaXMgZWl0aGVyOlxuXHQgKiAqIGhvdmVyZWQgb3ZlclxuXHQgKiAqIGFjdGl2ZVxuXHQgKi9cblx0Zm9jdXNJbnNpZGVTZXBhcmF0b3IgPSBRdWlja1BpY2tTZXBhcmF0b3JGb2N1c1JlYXNvbi5OT05FO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdGluZGV4OiBudW1iZXIsXG5cdFx0cmVhZG9ubHkgZmlyZVNlcGFyYXRvckJ1dHRvblRyaWdnZXJlZDogKGV2ZW50OiBJUXVpY2tQaWNrU2VwYXJhdG9yQnV0dG9uRXZlbnQpID0+IHZvaWQsXG5cdFx0cmVhZG9ubHkgc2VwYXJhdG9yOiBJUXVpY2tQaWNrU2VwYXJhdG9yLFxuXHQpIHtcblx0XHRzdXBlcihpbmRleCwgZmFsc2UsIHNlcGFyYXRvcik7XG5cdH1cbn1cblxuY2xhc3MgUXVpY2tJbnB1dEl0ZW1EZWxlZ2F0ZSBpbXBsZW1lbnRzIElMaXN0VmlydHVhbERlbGVnYXRlPElRdWlja1BpY2tFbGVtZW50PiB7XG5cdGdldEhlaWdodChlbGVtZW50OiBJUXVpY2tQaWNrRWxlbWVudCk6IG51bWJlciB7XG5cblx0XHRpZiAoZWxlbWVudCBpbnN0YW5jZW9mIFF1aWNrUGlja1NlcGFyYXRvckVsZW1lbnQpIHtcblx0XHRcdHJldHVybiAzMDtcblx0XHR9XG5cdFx0cmV0dXJuIGVsZW1lbnQuc2FuZURldGFpbCA/IDQ0IDogMjI7XG5cdH1cblxuXHRnZXRUZW1wbGF0ZUlkKGVsZW1lbnQ6IElRdWlja1BpY2tFbGVtZW50KTogc3RyaW5nIHtcblx0XHRpZiAoZWxlbWVudCBpbnN0YW5jZW9mIFF1aWNrUGlja0l0ZW1FbGVtZW50KSB7XG5cdFx0XHRyZXR1cm4gUXVpY2tQaWNrSXRlbUVsZW1lbnRSZW5kZXJlci5JRDtcblx0XHR9IGVsc2Uge1xuXHRcdFx0cmV0dXJuIFF1aWNrUGlja1NlcGFyYXRvckVsZW1lbnRSZW5kZXJlci5JRDtcblx0XHR9XG5cdH1cbn1cblxuY2xhc3MgUXVpY2tJbnB1dEFjY2Vzc2liaWxpdHlQcm92aWRlciBpbXBsZW1lbnRzIElMaXN0QWNjZXNzaWJpbGl0eVByb3ZpZGVyPElRdWlja1BpY2tFbGVtZW50PiB7XG5cblx0Z2V0V2lkZ2V0QXJpYUxhYmVsKCk6IHN0cmluZyB7XG5cdFx0cmV0dXJuIGxvY2FsaXplKCdxdWlja0lucHV0JywgXCJRdWljayBJbnB1dFwiKTtcblx0fVxuXG5cdGdldEFyaWFMYWJlbChlbGVtZW50OiBJUXVpY2tQaWNrRWxlbWVudCk6IHN0cmluZyB8IG51bGwge1xuXHRcdHJldHVybiBlbGVtZW50LnNlcGFyYXRvcj8ubGFiZWxcblx0XHRcdD8gYCR7ZWxlbWVudC5zYW5lQXJpYUxhYmVsfSwgJHtlbGVtZW50LnNlcGFyYXRvci5sYWJlbH1gXG5cdFx0XHQ6IGVsZW1lbnQuc2FuZUFyaWFMYWJlbDtcblx0fVxuXG5cdGdldFdpZGdldFJvbGUoKTogQXJpYVJvbGUge1xuXHRcdHJldHVybiAnbGlzdGJveCc7XG5cdH1cblxuXHRnZXRSb2xlKGVsZW1lbnQ6IElRdWlja1BpY2tFbGVtZW50KSB7XG5cdFx0cmV0dXJuIGVsZW1lbnQuaGFzQ2hlY2tib3ggPyAnY2hlY2tib3gnIDogJ29wdGlvbic7XG5cdH1cblxuXHRpc0NoZWNrZWQoZWxlbWVudDogSVF1aWNrUGlja0VsZW1lbnQpOiBJVmFsdWVXaXRoQ2hhbmdlRXZlbnQ8Ym9vbGVhbj4gfCB1bmRlZmluZWQge1xuXHRcdGlmICghZWxlbWVudC5oYXNDaGVja2JveCB8fCAhKGVsZW1lbnQgaW5zdGFuY2VvZiBRdWlja1BpY2tJdGVtRWxlbWVudCkpIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHtcblx0XHRcdGdldCB2YWx1ZSgpIHsgcmV0dXJuIGVsZW1lbnQuY2hlY2tlZDsgfSxcblx0XHRcdG9uRGlkQ2hhbmdlOiBlID0+IGVsZW1lbnQub25DaGVja2VkKCgpID0+IGUoKSksXG5cdFx0fTtcblx0fVxufVxuXG5hYnN0cmFjdCBjbGFzcyBCYXNlUXVpY2tJbnB1dExpc3RSZW5kZXJlcjxUIGV4dGVuZHMgSVF1aWNrUGlja0VsZW1lbnQ+IGV4dGVuZHMgRGlzcG9zYWJsZSBpbXBsZW1lbnRzIElUcmVlUmVuZGVyZXI8VCwgdm9pZCwgSVF1aWNrSW5wdXRJdGVtVGVtcGxhdGVEYXRhPiB7XG5cdGFic3RyYWN0IHRlbXBsYXRlSWQ6IHN0cmluZztcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkRpZERpc3Bvc2VGb2N1c2VkRWxlbWVudCA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPHZvaWQ+KCkpO1xuXG5cdC8qKlxuXHQgKiBUaGlzIGV2ZW50IGlzIGVtaXR0ZWQgd2hlbiB0aGUgcmVuZGVyZXIgZGlzcG9zZXMgYW4gZWxlbWVudCB0aGF0IGhhcyBmb2N1cy5cblx0ICogVGhpcyBhbGxvd3MgdGhlIGxpc3QgdG8gcmUtZm9jdXMgaXRzZWxmIGFuZCBwcmV2ZW50IGZvY3VzIGZyb20gYmVpbmcgbG9zdFxuXHQgKiAocG90ZW50aWFsbHkgY2F1c2luZyBxdWlja2lucHV0IHRvIGRpc21pc3MgaXRzZWxmKSB3aGVuIGFuIGVsZW1lbnQgaXNcblx0ICogcmVtb3ZlZCB3aGlsZSBmb2N1c2VkLlxuXHQgKi9cblx0cmVhZG9ubHkgb25EaWREaXNwb3NlRm9jdXNlZEVsZW1lbnQgPSB0aGlzLl9vbkRpZERpc3Bvc2VGb2N1c2VkRWxlbWVudC5ldmVudDtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRwcml2YXRlIHJlYWRvbmx5IGhvdmVyRGVsZWdhdGU6IElIb3ZlckRlbGVnYXRlIHwgdW5kZWZpbmVkLFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgdG9nZ2xlU3R5bGVzOiBJVG9nZ2xlU3R5bGVzLFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgY29udGV4dE1lbnVTZXJ2aWNlOiBJQ29udGV4dE1lbnVTZXJ2aWNlXG5cdCkge1xuXHRcdHN1cGVyKCk7XG5cdH1cblxuXHQvLyBUT0RPOiBvbmx5IGRvIHRoZSBjb21tb24gc3R1ZmYgaGVyZSBhbmQgaGF2ZSBhIHN1YmNsYXNzIGhhbmRsZSB0aGVpciBzcGVjaWZpYyBzdHVmZlxuXHRyZW5kZXJUZW1wbGF0ZShjb250YWluZXI6IEhUTUxFbGVtZW50KTogSVF1aWNrSW5wdXRJdGVtVGVtcGxhdGVEYXRhIHtcblx0XHRjb25zdCBkYXRhOiBJUXVpY2tJbnB1dEl0ZW1UZW1wbGF0ZURhdGEgPSBPYmplY3QuY3JlYXRlKG51bGwpO1xuXHRcdGRhdGEudG9EaXNwb3NlRWxlbWVudCA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblx0XHRkYXRhLnRvRGlzcG9zZVRlbXBsYXRlID0gbmV3IERpc3Bvc2FibGVTdG9yZSgpO1xuXHRcdGRhdGEuZW50cnkgPSBkb20uYXBwZW5kKGNvbnRhaW5lciwgJCgnLnF1aWNrLWlucHV0LWxpc3QtZW50cnknKSk7XG5cblx0XHQvLyBDaGVja2JveFxuXHRcdGNvbnN0IGxhYmVsID0gZG9tLmFwcGVuZChkYXRhLmVudHJ5LCAkKCdsYWJlbC5xdWljay1pbnB1dC1saXN0LWxhYmVsJykpO1xuXHRcdGRhdGEub3V0ZXJMYWJlbCA9IGxhYmVsO1xuXHRcdGRhdGEuY2hlY2tib3ggPSBkYXRhLnRvRGlzcG9zZVRlbXBsYXRlLmFkZChuZXcgTXV0YWJsZURpc3Bvc2FibGUoKSk7XG5cdFx0ZGF0YS50b0Rpc3Bvc2VUZW1wbGF0ZS5hZGQoZG9tLmFkZFN0YW5kYXJkRGlzcG9zYWJsZUxpc3RlbmVyKGxhYmVsLCBkb20uRXZlbnRUeXBlLkNMSUNLLCBlID0+IHtcblx0XHRcdC8vIGBsYWJlbGAgZWxlbWVudHMgd2l0aCByb2xlPWNoZWNrYm94ZXMgZG9uJ3QgYXV0b21hdGljYWxseSB0b2dnbGUgdGhlbSBsaWtlIG5vcm1hbCA8Y2hlY2tib3g+IGVsZW1lbnRzXG5cdFx0XHRpZiAoZGF0YS5jaGVja2JveC52YWx1ZSAmJiAhZS5kZWZhdWx0UHJldmVudGVkICYmIGRhdGEuY2hlY2tib3gudmFsdWUuZW5hYmxlZCkge1xuXHRcdFx0XHRjb25zdCBjaGVja2VkID0gIWRhdGEuY2hlY2tib3gudmFsdWUuY2hlY2tlZDtcblx0XHRcdFx0ZGF0YS5jaGVja2JveC52YWx1ZS5jaGVja2VkID0gY2hlY2tlZDtcblx0XHRcdFx0KGRhdGEuZWxlbWVudCBhcyBRdWlja1BpY2tJdGVtRWxlbWVudCkuY2hlY2tlZCA9IGNoZWNrZWQ7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXG5cdFx0Ly8gUm93c1xuXHRcdGNvbnN0IHJvd3MgPSBkb20uYXBwZW5kKGxhYmVsLCAkKCcucXVpY2staW5wdXQtbGlzdC1yb3dzJykpO1xuXHRcdGNvbnN0IHJvdzEgPSBkb20uYXBwZW5kKHJvd3MsICQoJy5xdWljay1pbnB1dC1saXN0LXJvdycpKTtcblx0XHRjb25zdCByb3cyID0gZG9tLmFwcGVuZChyb3dzLCAkKCcucXVpY2staW5wdXQtbGlzdC1yb3cnKSk7XG5cblx0XHQvLyBMYWJlbFxuXHRcdGRhdGEubGFiZWwgPSBuZXcgSWNvbkxhYmVsKHJvdzEsIHsgc3VwcG9ydEhpZ2hsaWdodHM6IHRydWUsIHN1cHBvcnREZXNjcmlwdGlvbkhpZ2hsaWdodHM6IHRydWUsIHN1cHBvcnRJY29uczogdHJ1ZSwgaG92ZXJEZWxlZ2F0ZTogdGhpcy5ob3ZlckRlbGVnYXRlIH0pO1xuXHRcdGRhdGEudG9EaXNwb3NlVGVtcGxhdGUuYWRkKGRhdGEubGFiZWwpO1xuXHRcdGRhdGEuaWNvbiA9IGRvbS5wcmVwZW5kKGRhdGEubGFiZWwuZWxlbWVudCwgJCgnLnF1aWNrLWlucHV0LWxpc3QtaWNvbicpKTtcblxuXHRcdC8vIEtleWJpbmRpbmdcblx0XHRjb25zdCBrZXliaW5kaW5nQ29udGFpbmVyID0gZG9tLmFwcGVuZChyb3cxLCAkKCcucXVpY2staW5wdXQtbGlzdC1lbnRyeS1rZXliaW5kaW5nJykpO1xuXHRcdGRhdGEua2V5YmluZGluZyA9IG5ldyBLZXliaW5kaW5nTGFiZWwoa2V5YmluZGluZ0NvbnRhaW5lciwgT1MpO1xuXHRcdGRhdGEudG9EaXNwb3NlVGVtcGxhdGUuYWRkKGRhdGEua2V5YmluZGluZyk7XG5cblx0XHQvLyBEZXRhaWxcblx0XHRjb25zdCBkZXRhaWxDb250YWluZXIgPSBkb20uYXBwZW5kKHJvdzIsICQoJy5xdWljay1pbnB1dC1saXN0LWxhYmVsLW1ldGEnKSk7XG5cdFx0ZGF0YS5kZXRhaWwgPSBuZXcgSWNvbkxhYmVsKGRldGFpbENvbnRhaW5lciwgeyBzdXBwb3J0SGlnaGxpZ2h0czogdHJ1ZSwgc3VwcG9ydEljb25zOiB0cnVlLCBob3ZlckRlbGVnYXRlOiB0aGlzLmhvdmVyRGVsZWdhdGUgfSk7XG5cdFx0ZGF0YS50b0Rpc3Bvc2VUZW1wbGF0ZS5hZGQoZGF0YS5kZXRhaWwpO1xuXG5cdFx0Ly8gU2VwYXJhdG9yXG5cdFx0ZGF0YS5zZXBhcmF0b3IgPSBkb20uYXBwZW5kKGRhdGEuZW50cnksICQoJy5xdWljay1pbnB1dC1saXN0LXNlcGFyYXRvcicpKTtcblxuXHRcdC8vIEFjdGlvbnNcblx0XHRkYXRhLnRvb2xCYXIgPSBuZXcgVG9vbEJhcihkYXRhLmVudHJ5LCB0aGlzLmNvbnRleHRNZW51U2VydmljZSwge1xuXHRcdFx0Li4uKHRoaXMuaG92ZXJEZWxlZ2F0ZSA/IHsgaG92ZXJEZWxlZ2F0ZTogdGhpcy5ob3ZlckRlbGVnYXRlIH0gOiB1bmRlZmluZWQpLFxuXHRcdFx0YWN0aW9uVmlld0l0ZW1Qcm92aWRlcjogY3JlYXRlVG9nZ2xlQWN0aW9uVmlld0l0ZW1Qcm92aWRlcih0aGlzLnRvZ2dsZVN0eWxlcyksXG5cdFx0XHRpY29uOiB0cnVlLFxuXHRcdFx0bGFiZWw6IGZhbHNlXG5cdFx0fSk7XG5cdFx0ZGF0YS50b29sQmFyLmdldEVsZW1lbnQoKS5jbGFzc0xpc3QuYWRkKCdxdWljay1pbnB1dC1saXN0LWVudHJ5LWFjdGlvbi1iYXInKTtcblx0XHRkYXRhLnRvRGlzcG9zZVRlbXBsYXRlLmFkZChkYXRhLnRvb2xCYXIpO1xuXG5cdFx0cmV0dXJuIGRhdGE7XG5cdH1cblxuXHRkaXNwb3NlVGVtcGxhdGUoZGF0YTogSVF1aWNrSW5wdXRJdGVtVGVtcGxhdGVEYXRhKTogdm9pZCB7XG5cdFx0ZGF0YS50b0Rpc3Bvc2VFbGVtZW50LmRpc3Bvc2UoKTtcblx0XHRkYXRhLnRvRGlzcG9zZVRlbXBsYXRlLmRpc3Bvc2UoKTtcblx0fVxuXG5cdGRpc3Bvc2VFbGVtZW50KF9lbGVtZW50OiBJVHJlZU5vZGU8SVF1aWNrUGlja0VsZW1lbnQsIHZvaWQ+LCBfaW5kZXg6IG51bWJlciwgZGF0YTogSVF1aWNrSW5wdXRJdGVtVGVtcGxhdGVEYXRhKTogdm9pZCB7XG5cdFx0aWYgKGRvbS5pc0FuY2VzdG9yT2ZBY3RpdmVFbGVtZW50KGRhdGEuZW50cnkpKSB7XG5cdFx0XHR0aGlzLl9vbkRpZERpc3Bvc2VGb2N1c2VkRWxlbWVudC5maXJlKCk7XG5cdFx0fVxuXHRcdGRhdGEudG9EaXNwb3NlRWxlbWVudC5jbGVhcigpO1xuXHRcdGRhdGEudG9vbEJhci5zZXRBY3Rpb25zKFtdKTtcblx0fVxuXG5cdC8vIFRPRE86IG9ubHkgZG8gdGhlIGNvbW1vbiBzdHVmZiBoZXJlIGFuZCBoYXZlIGEgc3ViY2xhc3MgaGFuZGxlIHRoZWlyIHNwZWNpZmljIHN0dWZmXG5cdGFic3RyYWN0IHJlbmRlckVsZW1lbnQobm9kZTogSVRyZWVOb2RlPElRdWlja1BpY2tFbGVtZW50LCB2b2lkPiwgaW5kZXg6IG51bWJlciwgZGF0YTogSVF1aWNrSW5wdXRJdGVtVGVtcGxhdGVEYXRhKTogdm9pZDtcbn1cblxuY2xhc3MgUXVpY2tQaWNrSXRlbUVsZW1lbnRSZW5kZXJlciBleHRlbmRzIEJhc2VRdWlja0lucHV0TGlzdFJlbmRlcmVyPFF1aWNrUGlja0l0ZW1FbGVtZW50PiB7XG5cdHN0YXRpYyByZWFkb25seSBJRCA9ICdxdWlja3BpY2tpdGVtJztcblxuXHQvLyBGb2xsb3cgd2hhdCB3ZSBkbyBpbiB0aGUgc2VwYXJhdG9yIHJlbmRlcmVyXG5cdHByaXZhdGUgcmVhZG9ubHkgX2l0ZW1zV2l0aFNlcGFyYXRvcnNGcmVxdWVuY3kgPSBuZXcgTWFwPFF1aWNrUGlja0l0ZW1FbGVtZW50LCBudW1iZXI+KCk7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0aG92ZXJEZWxlZ2F0ZTogSUhvdmVyRGVsZWdhdGUgfCB1bmRlZmluZWQsXG5cdFx0dG9nZ2xlU3R5bGVzOiBJVG9nZ2xlU3R5bGVzLFxuXHRcdEBJQ29udGV4dE1lbnVTZXJ2aWNlIGNvbnRleHRNZW51U2VydmljZTogSUNvbnRleHRNZW51U2VydmljZSxcblx0XHRASVRoZW1lU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IHRoZW1lU2VydmljZTogSVRoZW1lU2VydmljZSxcblx0KSB7XG5cdFx0c3VwZXIoaG92ZXJEZWxlZ2F0ZSwgdG9nZ2xlU3R5bGVzLCBjb250ZXh0TWVudVNlcnZpY2UpO1xuXHR9XG5cblx0Z2V0IHRlbXBsYXRlSWQoKSB7XG5cdFx0cmV0dXJuIFF1aWNrUGlja0l0ZW1FbGVtZW50UmVuZGVyZXIuSUQ7XG5cdH1cblxuXHRwcml2YXRlIGVuc3VyZUNoZWNrYm94KGVsZW1lbnQ6IFF1aWNrUGlja0l0ZW1FbGVtZW50LCBkYXRhOiBJUXVpY2tJbnB1dEl0ZW1UZW1wbGF0ZURhdGEpIHtcblx0XHRpZiAoIWVsZW1lbnQuaGFzQ2hlY2tib3gpIHtcblx0XHRcdGRhdGEuY2hlY2tib3gudmFsdWU/LmRvbU5vZGUucmVtb3ZlKCk7XG5cdFx0XHRkYXRhLmNoZWNrYm94LmNsZWFyKCk7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0bGV0IGNoZWNrYm94ID0gZGF0YS5jaGVja2JveC52YWx1ZTtcblx0XHRpZiAoIWNoZWNrYm94KSB7XG5cdFx0XHRjaGVja2JveCA9IG5ldyBDaGVja2JveChlbGVtZW50LnNhbmVMYWJlbCwgZWxlbWVudC5jaGVja2VkLCB7IC4uLmRlZmF1bHRDaGVja2JveFN0eWxlcywgc2l6ZTogMTUgfSk7XG5cdFx0XHRkYXRhLmNoZWNrYm94LnZhbHVlID0gY2hlY2tib3g7XG5cdFx0XHRkYXRhLm91dGVyTGFiZWwucHJlcGVuZChjaGVja2JveC5kb21Ob2RlKTtcblx0XHRcdC8vIFJlbW92ZSBjaGVja2JveCBmcm9tIHRhYiBvcmRlciBzaW5jZSB0cmVlIGl0ZW1zIGFyZSBuYXZpZ2FibGUgd2l0aCBhcnJvdyBrZXlzXG5cdFx0XHQvLyBUaGlzIHByZXZlbnRzIHRoZSBpc3N1ZSB3aGVyZSBwcmVzc2luZyBTcGFjZSB0b2dnbGVzIGJvdGggdGhlIHRhYmJlZCBjaGVja2JveCBhbmQgdGhlIGZvY3VzZWQgaXRlbVxuXHRcdFx0Y2hlY2tib3guZG9tTm9kZS50YWJJbmRleCA9IC0xO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRjaGVja2JveC5zZXRUaXRsZShlbGVtZW50LnNhbmVMYWJlbCk7XG5cdFx0fVxuXG5cdFx0aWYgKGVsZW1lbnQuY2hlY2tib3hEaXNhYmxlZCkge1xuXHRcdFx0Y2hlY2tib3guZGlzYWJsZSgpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRjaGVja2JveC5lbmFibGUoKTtcblx0XHR9XG5cblx0XHRjaGVja2JveC5jaGVja2VkID0gZWxlbWVudC5jaGVja2VkO1xuXHRcdGRhdGEudG9EaXNwb3NlRWxlbWVudC5hZGQoZWxlbWVudC5vbkNoZWNrZWQoY2hlY2tlZCA9PiBjaGVja2JveC5jaGVja2VkID0gY2hlY2tlZCkpO1xuXHRcdGRhdGEudG9EaXNwb3NlRWxlbWVudC5hZGQoY2hlY2tib3gub25DaGFuZ2UoKCkgPT4gZWxlbWVudC5jaGVja2VkID0gY2hlY2tib3guY2hlY2tlZCkpO1xuXHR9XG5cblx0cmVuZGVyRWxlbWVudChub2RlOiBJVHJlZU5vZGU8UXVpY2tQaWNrSXRlbUVsZW1lbnQsIHZvaWQ+LCBpbmRleDogbnVtYmVyLCBkYXRhOiBJUXVpY2tJbnB1dEl0ZW1UZW1wbGF0ZURhdGEpOiB2b2lkIHtcblx0XHRjb25zdCBlbGVtZW50ID0gbm9kZS5lbGVtZW50O1xuXHRcdGRhdGEuZWxlbWVudCA9IGVsZW1lbnQ7XG5cdFx0ZWxlbWVudC5lbGVtZW50ID0gZGF0YS5lbnRyeSA/PyB1bmRlZmluZWQ7XG5cdFx0Y29uc3QgbWFpbkl0ZW06IElRdWlja1BpY2tJdGVtID0gZWxlbWVudC5pdGVtO1xuXG5cdFx0ZWxlbWVudC5lbGVtZW50LmNsYXNzTGlzdC50b2dnbGUoJ25vdC1waWNrYWJsZScsIGVsZW1lbnQuaXRlbS5waWNrYWJsZSA9PT0gZmFsc2UpO1xuXG5cdFx0dGhpcy5lbnN1cmVDaGVja2JveChlbGVtZW50LCBkYXRhKTtcblxuXHRcdGNvbnN0IHsgbGFiZWxIaWdobGlnaHRzLCBkZXNjcmlwdGlvbkhpZ2hsaWdodHMsIGRldGFpbEhpZ2hsaWdodHMgfSA9IGVsZW1lbnQ7XG5cblx0XHQvLyBJY29uXG5cdFx0aWYgKG1haW5JdGVtLmljb25QYXRoKSB7XG5cdFx0XHRjb25zdCBpY29uID0gaXNEYXJrKHRoaXMudGhlbWVTZXJ2aWNlLmdldENvbG9yVGhlbWUoKS50eXBlKSA/IG1haW5JdGVtLmljb25QYXRoLmRhcmsgOiAobWFpbkl0ZW0uaWNvblBhdGgubGlnaHQgPz8gbWFpbkl0ZW0uaWNvblBhdGguZGFyayk7XG5cdFx0XHRjb25zdCBpY29uVXJsID0gVVJJLnJldml2ZShpY29uKTtcblx0XHRcdGRhdGEuaWNvbi5jbGFzc05hbWUgPSAncXVpY2staW5wdXQtbGlzdC1pY29uJztcblx0XHRcdGRhdGEuaWNvbi5zdHlsZS5iYWNrZ3JvdW5kSW1hZ2UgPSBjc3NKcy5hc0NTU1VybChpY29uVXJsKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0ZGF0YS5pY29uLnN0eWxlLmJhY2tncm91bmRJbWFnZSA9ICcnO1xuXHRcdFx0ZGF0YS5pY29uLmNsYXNzTmFtZSA9IG1haW5JdGVtLmljb25DbGFzcyA/IGBxdWljay1pbnB1dC1saXN0LWljb24gJHttYWluSXRlbS5pY29uQ2xhc3N9YCA6ICcnO1xuXHRcdH1cblx0XHRkYXRhLmljb24uc3R5bGUuY29sb3IgPSBtYWluSXRlbS5pY29uQ29sb3IgPyBhc0Nzc1ZhcmlhYmxlKG1haW5JdGVtLmljb25Db2xvci5pZCkgOiAnJztcblxuXHRcdC8vIExhYmVsXG5cdFx0bGV0IGRlc2NyaXB0aW9uVGl0bGU6IElNYW5hZ2VkSG92ZXJUb29sdGlwTWFya2Rvd25TdHJpbmcgfCB1bmRlZmluZWQ7XG5cdFx0Ly8gaWYgd2UgaGF2ZSBhIHRvb2x0aXAsIHRoYXQgd2lsbCBiZSB0aGUgaG92ZXIsXG5cdFx0Ly8gd2l0aCB0aGUgc2FuZURlc2NyaXB0aW9uIGFzIGZhbGxiYWNrIGlmIGl0XG5cdFx0Ly8gaXMgZGVmaW5lZFxuXHRcdGlmICghZWxlbWVudC5zYW5lVG9vbHRpcCAmJiBlbGVtZW50LnNhbmVEZXNjcmlwdGlvbikge1xuXHRcdFx0ZGVzY3JpcHRpb25UaXRsZSA9IHtcblx0XHRcdFx0bWFya2Rvd246IHtcblx0XHRcdFx0XHR2YWx1ZTogZXNjYXBlKGVsZW1lbnQuc2FuZURlc2NyaXB0aW9uKSxcblx0XHRcdFx0XHRzdXBwb3J0VGhlbWVJY29uczogdHJ1ZVxuXHRcdFx0XHR9LFxuXHRcdFx0XHRtYXJrZG93bk5vdFN1cHBvcnRlZEZhbGxiYWNrOiBlbGVtZW50LnNhbmVEZXNjcmlwdGlvblxuXHRcdFx0fTtcblx0XHR9XG5cdFx0Y29uc3Qgb3B0aW9uczogSUljb25MYWJlbFZhbHVlT3B0aW9ucyA9IHtcblx0XHRcdG1hdGNoZXM6IGxhYmVsSGlnaGxpZ2h0cyB8fCBbXSxcblx0XHRcdC8vIElmIHdlIGhhdmUgYSB0b29sdGlwLCB3ZSB3YW50IHRoYXQgdG8gYmUgc2hvd24gYW5kIG5vdCBhbnkgb3RoZXIgaG92ZXJcblx0XHRcdGRlc2NyaXB0aW9uVGl0bGUsXG5cdFx0XHRkZXNjcmlwdGlvbk1hdGNoZXM6IGRlc2NyaXB0aW9uSGlnaGxpZ2h0cyB8fCBbXSxcblx0XHRcdGxhYmVsRXNjYXBlTmV3TGluZXM6IHRydWVcblx0XHR9O1xuXHRcdG9wdGlvbnMuZXh0cmFDbGFzc2VzID0gbWFpbkl0ZW0uaWNvbkNsYXNzZXM7XG5cdFx0b3B0aW9ucy5pdGFsaWMgPSBtYWluSXRlbS5pdGFsaWM7XG5cdFx0b3B0aW9ucy5zdHJpa2V0aHJvdWdoID0gbWFpbkl0ZW0uc3RyaWtldGhyb3VnaDtcblx0XHRkYXRhLmVudHJ5LmNsYXNzTGlzdC5yZW1vdmUoJ3F1aWNrLWlucHV0LWxpc3Qtc2VwYXJhdG9yLWFzLWl0ZW0nKTtcblx0XHRkYXRhLmxhYmVsLnNldExhYmVsKGVsZW1lbnQuc2FuZUxhYmVsLCBlbGVtZW50LnNhbmVEZXNjcmlwdGlvbiwgb3B0aW9ucyk7XG5cblx0XHQvLyBLZXliaW5kaW5nXG5cdFx0ZGF0YS5rZXliaW5kaW5nLnNldChtYWluSXRlbS5rZXliaW5kaW5nKTtcblxuXHRcdC8vIERldGFpbFxuXHRcdGlmIChlbGVtZW50LnNhbmVEZXRhaWwpIHtcblx0XHRcdGxldCB0aXRsZTogSU1hbmFnZWRIb3ZlclRvb2x0aXBNYXJrZG93blN0cmluZyB8IHVuZGVmaW5lZDtcblx0XHRcdC8vIElmIHdlIGhhdmUgYSB0b29sdGlwLCB3ZSB3YW50IHRoYXQgdG8gYmUgc2hvd24gYW5kIG5vdCBhbnkgb3RoZXIgaG92ZXJcblx0XHRcdGlmICghZWxlbWVudC5zYW5lVG9vbHRpcCkge1xuXHRcdFx0XHR0aXRsZSA9IHtcblx0XHRcdFx0XHRtYXJrZG93bjoge1xuXHRcdFx0XHRcdFx0dmFsdWU6IGVzY2FwZShlbGVtZW50LnNhbmVEZXRhaWwpLFxuXHRcdFx0XHRcdFx0c3VwcG9ydFRoZW1lSWNvbnM6IHRydWVcblx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdG1hcmtkb3duTm90U3VwcG9ydGVkRmFsbGJhY2s6IGVsZW1lbnQuc2FuZURldGFpbFxuXHRcdFx0XHR9O1xuXHRcdFx0fVxuXHRcdFx0ZGF0YS5kZXRhaWwuZWxlbWVudC5zdHlsZS5kaXNwbGF5ID0gJyc7XG5cdFx0XHRkYXRhLmRldGFpbC5zZXRMYWJlbChlbGVtZW50LnNhbmVEZXRhaWwsIHVuZGVmaW5lZCwge1xuXHRcdFx0XHRtYXRjaGVzOiBkZXRhaWxIaWdobGlnaHRzLFxuXHRcdFx0XHR0aXRsZSxcblx0XHRcdFx0bGFiZWxFc2NhcGVOZXdMaW5lczogdHJ1ZVxuXHRcdFx0fSk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdGRhdGEuZGV0YWlsLmVsZW1lbnQuc3R5bGUuZGlzcGxheSA9ICdub25lJztcblx0XHR9XG5cblx0XHQvLyBTZXBhcmF0b3Jcblx0XHRpZiAoZWxlbWVudC5zZXBhcmF0b3I/LmxhYmVsKSB7XG5cdFx0XHRkYXRhLnNlcGFyYXRvci50ZXh0Q29udGVudCA9IGVsZW1lbnQuc2VwYXJhdG9yLmxhYmVsO1xuXHRcdFx0ZGF0YS5zZXBhcmF0b3Iuc3R5bGUuZGlzcGxheSA9ICcnO1xuXHRcdFx0dGhpcy5hZGRJdGVtV2l0aFNlcGFyYXRvcihlbGVtZW50KTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0ZGF0YS5zZXBhcmF0b3Iuc3R5bGUuZGlzcGxheSA9ICdub25lJztcblx0XHR9XG5cdFx0ZGF0YS5lbnRyeS5jbGFzc0xpc3QudG9nZ2xlKCdxdWljay1pbnB1dC1saXN0LXNlcGFyYXRvci1ib3JkZXInLCAhIWVsZW1lbnQuc2VwYXJhdG9yICYmIGVsZW1lbnQuY2hpbGRJbmRleCAhPT0gMCk7XG5cblx0XHQvLyBBY3Rpb25zXG5cdFx0Y29uc3QgYnV0dG9ucyA9IG1haW5JdGVtLmJ1dHRvbnM7XG5cdFx0aWYgKGJ1dHRvbnMgJiYgYnV0dG9ucy5sZW5ndGgpIHtcblx0XHRcdGNvbnN0IHsgcHJpbWFyeSwgc2Vjb25kYXJ5IH0gPSBxdWlja0lucHV0QnV0dG9uc1RvQWN0aW9uQXJyYXlzKFxuXHRcdFx0XHRidXR0b25zLFxuXHRcdFx0XHQncXVpY2staW5wdXQtaXRlbScsXG5cdFx0XHRcdChidXR0b24pID0+IGVsZW1lbnQuZmlyZUJ1dHRvblRyaWdnZXJlZCh7IGJ1dHRvbiwgaXRlbTogZWxlbWVudC5pdGVtIH0pXG5cdFx0XHQpO1xuXHRcdFx0ZGF0YS50b29sQmFyLnNldEFjdGlvbnMocHJpbWFyeSwgc2Vjb25kYXJ5KTtcblx0XHRcdGRhdGEuZW50cnkuY2xhc3NMaXN0LmFkZCgnaGFzLWFjdGlvbnMnKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0ZGF0YS50b29sQmFyLnNldEFjdGlvbnMoW10pO1xuXHRcdFx0ZGF0YS5lbnRyeS5jbGFzc0xpc3QucmVtb3ZlKCdoYXMtYWN0aW9ucycpO1xuXHRcdH1cblx0fVxuXG5cdG92ZXJyaWRlIGRpc3Bvc2VFbGVtZW50KGVsZW1lbnQ6IElUcmVlTm9kZTxRdWlja1BpY2tJdGVtRWxlbWVudCwgdm9pZD4sIF9pbmRleDogbnVtYmVyLCBkYXRhOiBJUXVpY2tJbnB1dEl0ZW1UZW1wbGF0ZURhdGEpOiB2b2lkIHtcblx0XHR0aGlzLnJlbW92ZUl0ZW1XaXRoU2VwYXJhdG9yKGVsZW1lbnQuZWxlbWVudCk7XG5cdFx0c3VwZXIuZGlzcG9zZUVsZW1lbnQoZWxlbWVudCwgX2luZGV4LCBkYXRhKTtcblx0fVxuXG5cdGlzSXRlbVdpdGhTZXBhcmF0b3JWaXNpYmxlKGl0ZW06IFF1aWNrUGlja0l0ZW1FbGVtZW50KTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuIHRoaXMuX2l0ZW1zV2l0aFNlcGFyYXRvcnNGcmVxdWVuY3kuaGFzKGl0ZW0pO1xuXHR9XG5cblx0cHJpdmF0ZSBhZGRJdGVtV2l0aFNlcGFyYXRvcihpdGVtOiBRdWlja1BpY2tJdGVtRWxlbWVudCk6IHZvaWQge1xuXHRcdHRoaXMuX2l0ZW1zV2l0aFNlcGFyYXRvcnNGcmVxdWVuY3kuc2V0KGl0ZW0sICh0aGlzLl9pdGVtc1dpdGhTZXBhcmF0b3JzRnJlcXVlbmN5LmdldChpdGVtKSB8fCAwKSArIDEpO1xuXHR9XG5cblx0cHJpdmF0ZSByZW1vdmVJdGVtV2l0aFNlcGFyYXRvcihpdGVtOiBRdWlja1BpY2tJdGVtRWxlbWVudCk6IHZvaWQge1xuXHRcdGNvbnN0IGZyZXF1ZW5jeSA9IHRoaXMuX2l0ZW1zV2l0aFNlcGFyYXRvcnNGcmVxdWVuY3kuZ2V0KGl0ZW0pIHx8IDA7XG5cdFx0aWYgKGZyZXF1ZW5jeSA+IDEpIHtcblx0XHRcdHRoaXMuX2l0ZW1zV2l0aFNlcGFyYXRvcnNGcmVxdWVuY3kuc2V0KGl0ZW0sIGZyZXF1ZW5jeSAtIDEpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHR0aGlzLl9pdGVtc1dpdGhTZXBhcmF0b3JzRnJlcXVlbmN5LmRlbGV0ZShpdGVtKTtcblx0XHR9XG5cdH1cbn1cblxuY2xhc3MgUXVpY2tQaWNrU2VwYXJhdG9yRWxlbWVudFJlbmRlcmVyIGV4dGVuZHMgQmFzZVF1aWNrSW5wdXRMaXN0UmVuZGVyZXI8UXVpY2tQaWNrU2VwYXJhdG9yRWxlbWVudD4ge1xuXHRzdGF0aWMgcmVhZG9ubHkgSUQgPSAncXVpY2twaWNrc2VwYXJhdG9yJztcblxuXHQvLyBUaGlzIGlzIGEgZnJlcXVlbmN5IG1hcCBiZWNhdXNlIHN0aWNreSBzY3JvbGwgcmUtdXNlcyB0aGUgc2FtZSByZW5kZXJlciB0byByZW5kZXIgYSBzZWNvbmRcblx0Ly8gaW5zdGFuY2Ugb2YgdGhlIHNhbWUgc2VwYXJhdG9yLlxuXHRwcml2YXRlIHJlYWRvbmx5IF92aXNpYmxlU2VwYXJhdG9yc0ZyZXF1ZW5jeSA9IG5ldyBNYXA8UXVpY2tQaWNrU2VwYXJhdG9yRWxlbWVudCwgbnVtYmVyPigpO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdGhvdmVyRGVsZWdhdGU6IElIb3ZlckRlbGVnYXRlIHwgdW5kZWZpbmVkLFxuXHRcdHRvZ2dsZVN0eWxlczogSVRvZ2dsZVN0eWxlcyxcblx0XHRASUNvbnRleHRNZW51U2VydmljZSBjb250ZXh0TWVudVNlcnZpY2U6IElDb250ZXh0TWVudVNlcnZpY2Vcblx0KSB7XG5cdFx0c3VwZXIoaG92ZXJEZWxlZ2F0ZSwgdG9nZ2xlU3R5bGVzLCBjb250ZXh0TWVudVNlcnZpY2UpO1xuXHR9XG5cblx0Z2V0IHRlbXBsYXRlSWQoKSB7XG5cdFx0cmV0dXJuIFF1aWNrUGlja1NlcGFyYXRvckVsZW1lbnRSZW5kZXJlci5JRDtcblx0fVxuXG5cdGdldCB2aXNpYmxlU2VwYXJhdG9ycygpOiBRdWlja1BpY2tTZXBhcmF0b3JFbGVtZW50W10ge1xuXHRcdHJldHVybiBbLi4udGhpcy5fdmlzaWJsZVNlcGFyYXRvcnNGcmVxdWVuY3kua2V5cygpXTtcblx0fVxuXG5cdGlzU2VwYXJhdG9yVmlzaWJsZShzZXBhcmF0b3I6IFF1aWNrUGlja1NlcGFyYXRvckVsZW1lbnQpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gdGhpcy5fdmlzaWJsZVNlcGFyYXRvcnNGcmVxdWVuY3kuaGFzKHNlcGFyYXRvcik7XG5cdH1cblxuXHRvdmVycmlkZSByZW5kZXJFbGVtZW50KG5vZGU6IElUcmVlTm9kZTxRdWlja1BpY2tTZXBhcmF0b3JFbGVtZW50LCB2b2lkPiwgaW5kZXg6IG51bWJlciwgZGF0YTogSVF1aWNrSW5wdXRJdGVtVGVtcGxhdGVEYXRhKTogdm9pZCB7XG5cdFx0Y29uc3QgZWxlbWVudCA9IG5vZGUuZWxlbWVudDtcblx0XHRkYXRhLmVsZW1lbnQgPSBlbGVtZW50O1xuXHRcdGVsZW1lbnQuZWxlbWVudCA9IGRhdGEuZW50cnkgPz8gdW5kZWZpbmVkO1xuXHRcdGVsZW1lbnQuZWxlbWVudC5jbGFzc0xpc3QudG9nZ2xlKCdmb2N1cy1pbnNpZGUnLCAhIWVsZW1lbnQuZm9jdXNJbnNpZGVTZXBhcmF0b3IpO1xuXHRcdGNvbnN0IG1haW5JdGVtOiBJUXVpY2tQaWNrU2VwYXJhdG9yID0gZWxlbWVudC5zZXBhcmF0b3I7XG5cblx0XHRjb25zdCB7IGxhYmVsSGlnaGxpZ2h0cywgZGVzY3JpcHRpb25IaWdobGlnaHRzIH0gPSBlbGVtZW50O1xuXG5cdFx0Ly8gSWNvblxuXHRcdGRhdGEuaWNvbi5zdHlsZS5iYWNrZ3JvdW5kSW1hZ2UgPSAnJztcblx0XHRkYXRhLmljb24uY2xhc3NOYW1lID0gJyc7XG5cblx0XHQvLyBMYWJlbFxuXHRcdGxldCBkZXNjcmlwdGlvblRpdGxlOiBJTWFuYWdlZEhvdmVyVG9vbHRpcE1hcmtkb3duU3RyaW5nIHwgdW5kZWZpbmVkO1xuXHRcdC8vIGlmIHdlIGhhdmUgYSB0b29sdGlwLCB0aGF0IHdpbGwgYmUgdGhlIGhvdmVyLFxuXHRcdC8vIHdpdGggdGhlIHNhbmVEZXNjcmlwdGlvbiBhcyBmYWxsYmFjayBpZiBpdFxuXHRcdC8vIGlzIGRlZmluZWRcblx0XHRpZiAoIWVsZW1lbnQuc2FuZVRvb2x0aXAgJiYgZWxlbWVudC5zYW5lRGVzY3JpcHRpb24pIHtcblx0XHRcdGRlc2NyaXB0aW9uVGl0bGUgPSB7XG5cdFx0XHRcdG1hcmtkb3duOiB7XG5cdFx0XHRcdFx0dmFsdWU6IGVzY2FwZShlbGVtZW50LnNhbmVEZXNjcmlwdGlvbiksXG5cdFx0XHRcdFx0c3VwcG9ydFRoZW1lSWNvbnM6IHRydWVcblx0XHRcdFx0fSxcblx0XHRcdFx0bWFya2Rvd25Ob3RTdXBwb3J0ZWRGYWxsYmFjazogZWxlbWVudC5zYW5lRGVzY3JpcHRpb25cblx0XHRcdH07XG5cdFx0fVxuXHRcdGNvbnN0IG9wdGlvbnM6IElJY29uTGFiZWxWYWx1ZU9wdGlvbnMgPSB7XG5cdFx0XHRtYXRjaGVzOiBsYWJlbEhpZ2hsaWdodHMgfHwgW10sXG5cdFx0XHQvLyBJZiB3ZSBoYXZlIGEgdG9vbHRpcCwgd2Ugd2FudCB0aGF0IHRvIGJlIHNob3duIGFuZCBub3QgYW55IG90aGVyIGhvdmVyXG5cdFx0XHRkZXNjcmlwdGlvblRpdGxlLFxuXHRcdFx0ZGVzY3JpcHRpb25NYXRjaGVzOiBkZXNjcmlwdGlvbkhpZ2hsaWdodHMgfHwgW10sXG5cdFx0XHRsYWJlbEVzY2FwZU5ld0xpbmVzOiB0cnVlXG5cdFx0fTtcblx0XHRkYXRhLmVudHJ5LmNsYXNzTGlzdC5hZGQoJ3F1aWNrLWlucHV0LWxpc3Qtc2VwYXJhdG9yLWFzLWl0ZW0nKTtcblx0XHRkYXRhLmxhYmVsLnNldExhYmVsKGVsZW1lbnQuc2FuZUxhYmVsLCBlbGVtZW50LnNhbmVEZXNjcmlwdGlvbiwgb3B0aW9ucyk7XG5cblx0XHQvLyBTZXBhcmF0b3Jcblx0XHRkYXRhLnNlcGFyYXRvci5zdHlsZS5kaXNwbGF5ID0gJ25vbmUnO1xuXHRcdGRhdGEuZW50cnkuY2xhc3NMaXN0LmFkZCgncXVpY2staW5wdXQtbGlzdC1zZXBhcmF0b3ItYm9yZGVyJyk7XG5cblx0XHQvLyBBY3Rpb25zXG5cdFx0Y29uc3QgYnV0dG9ucyA9IG1haW5JdGVtLmJ1dHRvbnM7XG5cdFx0aWYgKGJ1dHRvbnMgJiYgYnV0dG9ucy5sZW5ndGgpIHtcblx0XHRcdGNvbnN0IHsgcHJpbWFyeSwgc2Vjb25kYXJ5IH0gPSBxdWlja0lucHV0QnV0dG9uc1RvQWN0aW9uQXJyYXlzKFxuXHRcdFx0XHRidXR0b25zLFxuXHRcdFx0XHQncXVpY2staW5wdXQtc2VwYXJhdG9yJyxcblx0XHRcdFx0KGJ1dHRvbikgPT4gZWxlbWVudC5maXJlU2VwYXJhdG9yQnV0dG9uVHJpZ2dlcmVkKHsgYnV0dG9uLCBzZXBhcmF0b3I6IGVsZW1lbnQuc2VwYXJhdG9yIH0pXG5cdFx0XHQpO1xuXHRcdFx0ZGF0YS50b29sQmFyLnNldEFjdGlvbnMocHJpbWFyeSwgc2Vjb25kYXJ5KTtcblx0XHRcdGRhdGEuZW50cnkuY2xhc3NMaXN0LmFkZCgnaGFzLWFjdGlvbnMnKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0ZGF0YS50b29sQmFyLnNldEFjdGlvbnMoW10pO1xuXHRcdFx0ZGF0YS5lbnRyeS5jbGFzc0xpc3QucmVtb3ZlKCdoYXMtYWN0aW9ucycpO1xuXHRcdH1cblxuXHRcdHRoaXMuYWRkU2VwYXJhdG9yKGVsZW1lbnQpO1xuXHR9XG5cblx0b3ZlcnJpZGUgZGlzcG9zZUVsZW1lbnQoZWxlbWVudDogSVRyZWVOb2RlPFF1aWNrUGlja1NlcGFyYXRvckVsZW1lbnQsIHZvaWQ+LCBfaW5kZXg6IG51bWJlciwgZGF0YTogSVF1aWNrSW5wdXRJdGVtVGVtcGxhdGVEYXRhKTogdm9pZCB7XG5cdFx0dGhpcy5yZW1vdmVTZXBhcmF0b3IoZWxlbWVudC5lbGVtZW50KTtcblx0XHRpZiAoIXRoaXMuaXNTZXBhcmF0b3JWaXNpYmxlKGVsZW1lbnQuZWxlbWVudCkpIHtcblx0XHRcdGVsZW1lbnQuZWxlbWVudC5lbGVtZW50Py5jbGFzc0xpc3QucmVtb3ZlKCdmb2N1cy1pbnNpZGUnKTtcblx0XHR9XG5cdFx0c3VwZXIuZGlzcG9zZUVsZW1lbnQoZWxlbWVudCwgX2luZGV4LCBkYXRhKTtcblx0fVxuXG5cdHByaXZhdGUgYWRkU2VwYXJhdG9yKHNlcGFyYXRvcjogUXVpY2tQaWNrU2VwYXJhdG9yRWxlbWVudCk6IHZvaWQge1xuXHRcdHRoaXMuX3Zpc2libGVTZXBhcmF0b3JzRnJlcXVlbmN5LnNldChzZXBhcmF0b3IsICh0aGlzLl92aXNpYmxlU2VwYXJhdG9yc0ZyZXF1ZW5jeS5nZXQoc2VwYXJhdG9yKSB8fCAwKSArIDEpO1xuXHR9XG5cblx0cHJpdmF0ZSByZW1vdmVTZXBhcmF0b3Ioc2VwYXJhdG9yOiBRdWlja1BpY2tTZXBhcmF0b3JFbGVtZW50KTogdm9pZCB7XG5cdFx0Y29uc3QgZnJlcXVlbmN5ID0gdGhpcy5fdmlzaWJsZVNlcGFyYXRvcnNGcmVxdWVuY3kuZ2V0KHNlcGFyYXRvcikgfHwgMDtcblx0XHRpZiAoZnJlcXVlbmN5ID4gMSkge1xuXHRcdFx0dGhpcy5fdmlzaWJsZVNlcGFyYXRvcnNGcmVxdWVuY3kuc2V0KHNlcGFyYXRvciwgZnJlcXVlbmN5IC0gMSk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHRoaXMuX3Zpc2libGVTZXBhcmF0b3JzRnJlcXVlbmN5LmRlbGV0ZShzZXBhcmF0b3IpO1xuXHRcdH1cblx0fVxufVxuXG5leHBvcnQgY2xhc3MgUXVpY2tJbnB1dExpc3QgZXh0ZW5kcyBEaXNwb3NhYmxlIHtcblxuXHQvLyNyZWdpb24gUXVpY2tJbnB1dExpc3QgRXZlbnRzXG5cblx0cHJpdmF0ZSByZWFkb25seSBfb25LZXlEb3duID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8U3RhbmRhcmRLZXlib2FyZEV2ZW50PigpKTtcblx0LyoqXG5cdCAqIEV2ZW50IHRoYXQgaXMgZmlyZWQgd2hlbiB0aGUgdHJlZSByZWNlaXZlcyBhIGtleWRvd24uXG5cdCovXG5cdHJlYWRvbmx5IG9uS2V5RG93bjogRXZlbnQ8U3RhbmRhcmRLZXlib2FyZEV2ZW50PiA9IHRoaXMuX29uS2V5RG93bi5ldmVudDtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkxlYXZlID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8dm9pZD4oKSk7XG5cdC8qKlxuXHQgKiBFdmVudCB0aGF0IGlzIGZpcmVkIHdoZW4gdGhlIHRyZWUgd291bGQgbm8gbG9uZ2VyIGhhdmUgZm9jdXMuXG5cdCovXG5cdHJlYWRvbmx5IG9uTGVhdmU6IEV2ZW50PHZvaWQ+ID0gdGhpcy5fb25MZWF2ZS5ldmVudDtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF92aXNpYmxlQ291bnRPYnNlcnZhYmxlID0gb2JzZXJ2YWJsZVZhbHVlKCdWaXNpYmxlQ291bnQnLCAwKTtcblx0cmVhZG9ubHkgb25DaGFuZ2VkVmlzaWJsZUNvdW50OiBFdmVudDxudW1iZXI+ID0gRXZlbnQuZnJvbU9ic2VydmFibGUodGhpcy5fdmlzaWJsZUNvdW50T2JzZXJ2YWJsZSwgdGhpcy5fc3RvcmUpO1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX2FsbFZpc2libGVDaGVja2VkT2JzZXJ2YWJsZSA9IG9ic2VydmFibGVWYWx1ZSgnQWxsVmlzaWJsZUNoZWNrZWQnLCBmYWxzZSk7XG5cdHJlYWRvbmx5IG9uQ2hhbmdlZEFsbFZpc2libGVDaGVja2VkOiBFdmVudDxib29sZWFuPiA9IEV2ZW50LmZyb21PYnNlcnZhYmxlKHRoaXMuX2FsbFZpc2libGVDaGVja2VkT2JzZXJ2YWJsZSwgdGhpcy5fc3RvcmUpO1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX2NoZWNrZWRDb3VudE9ic2VydmFibGUgPSBvYnNlcnZhYmxlVmFsdWUoJ0NoZWNrZWRDb3VudCcsIDApO1xuXHRyZWFkb25seSBvbkNoYW5nZWRDaGVja2VkQ291bnQ6IEV2ZW50PG51bWJlcj4gPSBFdmVudC5mcm9tT2JzZXJ2YWJsZSh0aGlzLl9jaGVja2VkQ291bnRPYnNlcnZhYmxlLCB0aGlzLl9zdG9yZSk7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfY2hlY2tlZEVsZW1lbnRzT2JzZXJ2YWJsZSA9IG9ic2VydmFibGVWYWx1ZU9wdHMoeyBlcXVhbHNGbjogZXF1YWxzIH0sIG5ldyBBcnJheTxJUXVpY2tQaWNrSXRlbT4oKSk7XG5cdHJlYWRvbmx5IG9uQ2hhbmdlZENoZWNrZWRFbGVtZW50czogRXZlbnQ8SVF1aWNrUGlja0l0ZW1bXT4gPSBFdmVudC5mcm9tT2JzZXJ2YWJsZSh0aGlzLl9jaGVja2VkRWxlbWVudHNPYnNlcnZhYmxlLCB0aGlzLl9zdG9yZSk7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfb25CdXR0b25UcmlnZ2VyZWQgPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjxJUXVpY2tQaWNrSXRlbUJ1dHRvbkV2ZW50PElRdWlja1BpY2tJdGVtPj4oKSk7XG5cdG9uQnV0dG9uVHJpZ2dlcmVkID0gdGhpcy5fb25CdXR0b25UcmlnZ2VyZWQuZXZlbnQ7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfb25TZXBhcmF0b3JCdXR0b25UcmlnZ2VyZWQgPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjxJUXVpY2tQaWNrU2VwYXJhdG9yQnV0dG9uRXZlbnQ+KCkpO1xuXHRvblNlcGFyYXRvckJ1dHRvblRyaWdnZXJlZCA9IHRoaXMuX29uU2VwYXJhdG9yQnV0dG9uVHJpZ2dlcmVkLmV2ZW50O1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX2VsZW1lbnRDaGVja2VkID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8eyBlbGVtZW50OiBJUXVpY2tQaWNrRWxlbWVudDsgY2hlY2tlZDogYm9vbGVhbiB9PigpKTtcblx0cHJpdmF0ZSByZWFkb25seSBfZWxlbWVudENoZWNrZWRFdmVudEJ1ZmZlcmVyID0gbmV3IEV2ZW50QnVmZmVyZXIoKTtcblxuXHQvLyNlbmRyZWdpb25cblxuXHRwcml2YXRlIF9oYXNDaGVja2JveGVzID0gZmFsc2U7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfY29udGFpbmVyOiBIVE1MRWxlbWVudDtcblx0cHJpdmF0ZSByZWFkb25seSBfdHJlZTogV29ya2JlbmNoT2JqZWN0VHJlZTxJUXVpY2tQaWNrRWxlbWVudCwgdm9pZD47XG5cdHByaXZhdGUgcmVhZG9ubHkgX3NlcGFyYXRvclJlbmRlcmVyOiBRdWlja1BpY2tTZXBhcmF0b3JFbGVtZW50UmVuZGVyZXI7XG5cdHByaXZhdGUgcmVhZG9ubHkgX2l0ZW1SZW5kZXJlcjogUXVpY2tQaWNrSXRlbUVsZW1lbnRSZW5kZXJlcjtcblx0cHJpdmF0ZSBfaW5wdXRFbGVtZW50cyA9IG5ldyBBcnJheTxRdWlja1BpY2tJdGVtPigpO1xuXHRwcml2YXRlIF9lbGVtZW50VHJlZSA9IG5ldyBBcnJheTxJUXVpY2tQaWNrRWxlbWVudD4oKTtcblx0cHJpdmF0ZSBfaXRlbUVsZW1lbnRzID0gbmV3IEFycmF5PFF1aWNrUGlja0l0ZW1FbGVtZW50PigpO1xuXHQvLyBFbGVtZW50cyB0aGF0IGFwcGx5IHRvIHRoZSBjdXJyZW50IHNldCBvZiBlbGVtZW50c1xuXHRwcml2YXRlIHJlYWRvbmx5IF9lbGVtZW50RGlzcG9zYWJsZSA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBEaXNwb3NhYmxlU3RvcmUoKSk7XG5cdHByaXZhdGUgX2xhc3RIb3ZlcjogSUhvdmVyV2lkZ2V0IHwgdW5kZWZpbmVkO1xuXHRwcml2YXRlIF9sYXN0UXVlcnlTdHJpbmc6IHN0cmluZyB8IHVuZGVmaW5lZDtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRwcml2YXRlIHBhcmVudDogSFRNTEVsZW1lbnQsXG5cdFx0cHJpdmF0ZSBob3ZlckRlbGVnYXRlOiBJSG92ZXJEZWxlZ2F0ZSxcblx0XHRwcml2YXRlIGxpbmtPcGVuZXJEZWxlZ2F0ZTogKGNvbnRlbnQ6IHN0cmluZykgPT4gdm9pZCxcblx0XHRpZDogc3RyaW5nLFxuXHRcdHByaXZhdGUgc3R5bGVzOiBJUXVpY2tJbnB1dFN0eWxlcyxcblx0XHRASUluc3RhbnRpYXRpb25TZXJ2aWNlIGluc3RhbnRpYXRpb25TZXJ2aWNlOiBJSW5zdGFudGlhdGlvblNlcnZpY2UsXG5cdFx0QElBY2Nlc3NpYmlsaXR5U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGFjY2Vzc2liaWxpdHlTZXJ2aWNlOiBJQWNjZXNzaWJpbGl0eVNlcnZpY2Vcblx0KSB7XG5cdFx0c3VwZXIoKTtcblx0XHR0aGlzLl9jb250YWluZXIgPSBkb20uYXBwZW5kKHRoaXMucGFyZW50LCAkKCcucXVpY2staW5wdXQtbGlzdCcpKTtcblx0XHR0aGlzLl9zZXBhcmF0b3JSZW5kZXJlciA9IHRoaXMuX3JlZ2lzdGVyKGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFF1aWNrUGlja1NlcGFyYXRvckVsZW1lbnRSZW5kZXJlciwgaG92ZXJEZWxlZ2F0ZSwgdGhpcy5zdHlsZXMudG9nZ2xlKSk7XG5cdFx0dGhpcy5faXRlbVJlbmRlcmVyID0gdGhpcy5fcmVnaXN0ZXIoaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoUXVpY2tQaWNrSXRlbUVsZW1lbnRSZW5kZXJlciwgaG92ZXJEZWxlZ2F0ZSwgdGhpcy5zdHlsZXMudG9nZ2xlKSk7XG5cdFx0dGhpcy5fdHJlZSA9IHRoaXMuX3JlZ2lzdGVyKGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFxuXHRcdFx0V29ya2JlbmNoT2JqZWN0VHJlZTxJUXVpY2tQaWNrRWxlbWVudCwgdm9pZD4sXG5cdFx0XHQnUXVpY2tJbnB1dCcsXG5cdFx0XHR0aGlzLl9jb250YWluZXIsXG5cdFx0XHRuZXcgUXVpY2tJbnB1dEl0ZW1EZWxlZ2F0ZSgpLFxuXHRcdFx0W3RoaXMuX2l0ZW1SZW5kZXJlciwgdGhpcy5fc2VwYXJhdG9yUmVuZGVyZXJdLFxuXHRcdFx0e1xuXHRcdFx0XHRmaWx0ZXI6IHtcblx0XHRcdFx0XHRmaWx0ZXIoZWxlbWVudCkge1xuXHRcdFx0XHRcdFx0cmV0dXJuIGVsZW1lbnQuaGlkZGVuXG5cdFx0XHRcdFx0XHRcdD8gVHJlZVZpc2liaWxpdHkuSGlkZGVuXG5cdFx0XHRcdFx0XHRcdDogZWxlbWVudCBpbnN0YW5jZW9mIFF1aWNrUGlja1NlcGFyYXRvckVsZW1lbnRcblx0XHRcdFx0XHRcdFx0XHQ/IFRyZWVWaXNpYmlsaXR5LlJlY3Vyc2Vcblx0XHRcdFx0XHRcdFx0XHQ6IFRyZWVWaXNpYmlsaXR5LlZpc2libGU7XG5cdFx0XHRcdFx0fSxcblx0XHRcdFx0fSxcblx0XHRcdFx0c29ydGVyOiB7XG5cdFx0XHRcdFx0Y29tcGFyZTogKGVsZW1lbnQsIG90aGVyRWxlbWVudCkgPT4ge1xuXHRcdFx0XHRcdFx0aWYgKCF0aGlzLnNvcnRCeUxhYmVsIHx8ICF0aGlzLl9sYXN0UXVlcnlTdHJpbmcpIHtcblx0XHRcdFx0XHRcdFx0cmV0dXJuIDA7XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHRjb25zdCBub3JtYWxpemVkU2VhcmNoVmFsdWUgPSB0aGlzLl9sYXN0UXVlcnlTdHJpbmcudG9Mb3dlckNhc2UoKTtcblx0XHRcdFx0XHRcdHJldHVybiBjb21wYXJlRW50cmllcyhlbGVtZW50LCBvdGhlckVsZW1lbnQsIG5vcm1hbGl6ZWRTZWFyY2hWYWx1ZSk7XG5cdFx0XHRcdFx0fSxcblx0XHRcdFx0fSxcblx0XHRcdFx0YWNjZXNzaWJpbGl0eVByb3ZpZGVyOiBuZXcgUXVpY2tJbnB1dEFjY2Vzc2liaWxpdHlQcm92aWRlcigpLFxuXHRcdFx0XHRzZXRSb3dMaW5lSGVpZ2h0OiBmYWxzZSxcblx0XHRcdFx0bXVsdGlwbGVTZWxlY3Rpb25TdXBwb3J0OiBmYWxzZSxcblx0XHRcdFx0aGlkZVR3aXN0aWVzT2ZDaGlsZGxlc3NFbGVtZW50czogdHJ1ZSxcblx0XHRcdFx0cmVuZGVySW5kZW50R3VpZGVzOiBSZW5kZXJJbmRlbnRHdWlkZXMuTm9uZSxcblx0XHRcdFx0ZmluZFdpZGdldEVuYWJsZWQ6IGZhbHNlLFxuXHRcdFx0XHRpbmRlbnQ6IDAsXG5cdFx0XHRcdGhvcml6b250YWxTY3JvbGxpbmc6IGZhbHNlLFxuXHRcdFx0XHRhbGxvd05vbkNvbGxhcHNpYmxlUGFyZW50czogdHJ1ZSxcblx0XHRcdFx0YWx3YXlzQ29uc3VtZU1vdXNlV2hlZWw6IHRydWVcblx0XHRcdH1cblx0XHQpKTtcblx0XHR0aGlzLl90cmVlLmdldEhUTUxFbGVtZW50KCkuaWQgPSBpZDtcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLl9pdGVtUmVuZGVyZXIub25EaWREaXNwb3NlRm9jdXNlZEVsZW1lbnQoKCkgPT4gdGhpcy5fdHJlZS5kb21Gb2N1cygpKSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5fc2VwYXJhdG9yUmVuZGVyZXIub25EaWREaXNwb3NlRm9jdXNlZEVsZW1lbnQoKCkgPT4gdGhpcy5fdHJlZS5kb21Gb2N1cygpKSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXJMaXN0ZW5lcnMoKTtcblx0fVxuXG5cdC8vI3JlZ2lvbiBwdWJsaWMgZ2V0dGVycy9zZXR0ZXJzXG5cblx0QG1lbW9pemVcblx0Z2V0IG9uRGlkQ2hhbmdlRm9jdXMoKSB7XG5cdFx0cmV0dXJuIEV2ZW50Lm1hcChcblx0XHRcdHRoaXMuX3RyZWUub25EaWRDaGFuZ2VGb2N1cyxcblx0XHRcdGUgPT4gZS5lbGVtZW50cy5maWx0ZXIoKGUpOiBlIGlzIFF1aWNrUGlja0l0ZW1FbGVtZW50ID0+IGUgaW5zdGFuY2VvZiBRdWlja1BpY2tJdGVtRWxlbWVudCkubWFwKGUgPT4gZS5pdGVtKSxcblx0XHRcdHRoaXMuX3N0b3JlXG5cdFx0KTtcblx0fVxuXG5cdEBtZW1vaXplXG5cdGdldCBvbkRpZENoYW5nZVNlbGVjdGlvbigpIHtcblx0XHRyZXR1cm4gRXZlbnQubWFwKFxuXHRcdFx0dGhpcy5fdHJlZS5vbkRpZENoYW5nZVNlbGVjdGlvbixcblx0XHRcdGUgPT4gKHtcblx0XHRcdFx0aXRlbXM6IGUuZWxlbWVudHMuZmlsdGVyKChlKTogZSBpcyBRdWlja1BpY2tJdGVtRWxlbWVudCA9PiBlIGluc3RhbmNlb2YgUXVpY2tQaWNrSXRlbUVsZW1lbnQpLm1hcChlID0+IGUuaXRlbSksXG5cdFx0XHRcdGV2ZW50OiBlLmJyb3dzZXJFdmVudFxuXHRcdFx0fSksXG5cdFx0XHR0aGlzLl9zdG9yZVxuXHRcdCk7XG5cdH1cblxuXHRnZXQgZGlzcGxheWVkKCkge1xuXHRcdHJldHVybiB0aGlzLl9jb250YWluZXIuc3R5bGUuZGlzcGxheSAhPT0gJ25vbmUnO1xuXHR9XG5cblx0c2V0IGRpc3BsYXllZCh2YWx1ZTogYm9vbGVhbikge1xuXHRcdHRoaXMuX2NvbnRhaW5lci5zdHlsZS5kaXNwbGF5ID0gdmFsdWUgPyAnJyA6ICdub25lJztcblx0fVxuXG5cdGdldCBzY3JvbGxUb3AoKSB7XG5cdFx0cmV0dXJuIHRoaXMuX3RyZWUuc2Nyb2xsVG9wO1xuXHR9XG5cblx0c2V0IHNjcm9sbFRvcChzY3JvbGxUb3A6IG51bWJlcikge1xuXHRcdHRoaXMuX3RyZWUuc2Nyb2xsVG9wID0gc2Nyb2xsVG9wO1xuXHR9XG5cblx0Z2V0IGFyaWFMYWJlbCgpIHtcblx0XHRyZXR1cm4gdGhpcy5fdHJlZS5hcmlhTGFiZWw7XG5cdH1cblxuXHRzZXQgYXJpYUxhYmVsKGxhYmVsOiBzdHJpbmcgfCBudWxsKSB7XG5cdFx0dGhpcy5fdHJlZS5hcmlhTGFiZWwgPSBsYWJlbCA/PyAnJztcblx0fVxuXG5cdHNldCBlbmFibGVkKHZhbHVlOiBib29sZWFuKSB7XG5cdFx0dGhpcy5fdHJlZS5nZXRIVE1MRWxlbWVudCgpLnN0eWxlLnBvaW50ZXJFdmVudHMgPSB2YWx1ZSA/ICcnIDogJ25vbmUnO1xuXHR9XG5cblx0cHJpdmF0ZSBfbWF0Y2hPbkRlc2NyaXB0aW9uID0gZmFsc2U7XG5cdGdldCBtYXRjaE9uRGVzY3JpcHRpb24oKSB7XG5cdFx0cmV0dXJuIHRoaXMuX21hdGNoT25EZXNjcmlwdGlvbjtcblx0fVxuXHRzZXQgbWF0Y2hPbkRlc2NyaXB0aW9uKHZhbHVlOiBib29sZWFuKSB7XG5cdFx0dGhpcy5fbWF0Y2hPbkRlc2NyaXB0aW9uID0gdmFsdWU7XG5cdH1cblxuXHRwcml2YXRlIF9tYXRjaE9uRGV0YWlsID0gZmFsc2U7XG5cdGdldCBtYXRjaE9uRGV0YWlsKCkge1xuXHRcdHJldHVybiB0aGlzLl9tYXRjaE9uRGV0YWlsO1xuXHR9XG5cdHNldCBtYXRjaE9uRGV0YWlsKHZhbHVlOiBib29sZWFuKSB7XG5cdFx0dGhpcy5fbWF0Y2hPbkRldGFpbCA9IHZhbHVlO1xuXHR9XG5cblx0cHJpdmF0ZSBfbWF0Y2hPbkxhYmVsID0gdHJ1ZTtcblx0Z2V0IG1hdGNoT25MYWJlbCgpIHtcblx0XHRyZXR1cm4gdGhpcy5fbWF0Y2hPbkxhYmVsO1xuXHR9XG5cdHNldCBtYXRjaE9uTGFiZWwodmFsdWU6IGJvb2xlYW4pIHtcblx0XHR0aGlzLl9tYXRjaE9uTGFiZWwgPSB2YWx1ZTtcblx0fVxuXG5cdHByaXZhdGUgX21hdGNoT25MYWJlbE1vZGU6ICdmdXp6eScgfCAnY29udGlndW91cycgPSAnZnV6enknO1xuXHRnZXQgbWF0Y2hPbkxhYmVsTW9kZSgpIHtcblx0XHRyZXR1cm4gdGhpcy5fbWF0Y2hPbkxhYmVsTW9kZTtcblx0fVxuXHRzZXQgbWF0Y2hPbkxhYmVsTW9kZSh2YWx1ZTogJ2Z1enp5JyB8ICdjb250aWd1b3VzJykge1xuXHRcdHRoaXMuX21hdGNoT25MYWJlbE1vZGUgPSB2YWx1ZTtcblx0fVxuXG5cdHByaXZhdGUgX21hdGNoT25NZXRhID0gdHJ1ZTtcblx0Z2V0IG1hdGNoT25NZXRhKCkge1xuXHRcdHJldHVybiB0aGlzLl9tYXRjaE9uTWV0YTtcblx0fVxuXHRzZXQgbWF0Y2hPbk1ldGEodmFsdWU6IGJvb2xlYW4pIHtcblx0XHR0aGlzLl9tYXRjaE9uTWV0YSA9IHZhbHVlO1xuXHR9XG5cblx0cHJpdmF0ZSBfc29ydEJ5TGFiZWwgPSB0cnVlO1xuXHRnZXQgc29ydEJ5TGFiZWwoKSB7XG5cdFx0cmV0dXJuIHRoaXMuX3NvcnRCeUxhYmVsO1xuXHR9XG5cdHNldCBzb3J0QnlMYWJlbCh2YWx1ZTogYm9vbGVhbikge1xuXHRcdHRoaXMuX3NvcnRCeUxhYmVsID0gdmFsdWU7XG5cdH1cblxuXHRwcml2YXRlIF9zaG91bGRMb29wID0gdHJ1ZTtcblx0Z2V0IHNob3VsZExvb3AoKSB7XG5cdFx0cmV0dXJuIHRoaXMuX3Nob3VsZExvb3A7XG5cdH1cblx0c2V0IHNob3VsZExvb3AodmFsdWU6IGJvb2xlYW4pIHtcblx0XHR0aGlzLl9zaG91bGRMb29wID0gdmFsdWU7XG5cdH1cblxuXHQvLyNlbmRyZWdpb25cblxuXHQvLyNyZWdpb24gcmVnaXN0ZXIgbGlzdGVuZXJzXG5cblx0cHJpdmF0ZSBfcmVnaXN0ZXJMaXN0ZW5lcnMoKSB7XG5cdFx0dGhpcy5fcmVnaXN0ZXJPbkNvbnRhaW5lckNsaWNrKCk7XG5cdFx0dGhpcy5fcmVnaXN0ZXJPbk1vdXNlTWlkZGxlQ2xpY2soKTtcblx0XHR0aGlzLl9yZWdpc3Rlck9uVHJlZU1vZGVsQ2hhbmdlZCgpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyT25FbGVtZW50Q2hlY2tlZCgpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyT25Db250ZXh0TWVudSgpO1xuXHRcdHRoaXMuX3JlZ2lzdGVySG92ZXJMaXN0ZW5lcnMoKTtcblx0XHR0aGlzLl9yZWdpc3RlclNlbGVjdGlvbkNoYW5nZUxpc3RlbmVyKCk7XG5cdFx0dGhpcy5fcmVnaXN0ZXJTZXBhcmF0b3JBY3Rpb25TaG93aW5nTGlzdGVuZXJzKCk7XG5cdH1cblxuXHRwcml2YXRlIF9yZWdpc3Rlck9uQ29udGFpbmVyQ2xpY2soKSB7XG5cdFx0dGhpcy5fcmVnaXN0ZXIoZG9tLmFkZERpc3Bvc2FibGVMaXN0ZW5lcih0aGlzLl9jb250YWluZXIsIGRvbS5FdmVudFR5cGUuQ0xJQ0ssIGUgPT4ge1xuXHRcdFx0aWYgKGUueCB8fCBlLnkpIHsgLy8gQXZvaWQgJ2NsaWNrJyB0cmlnZ2VyZWQgYnkgJ3NwYWNlJyBvbiBjaGVja2JveC5cblx0XHRcdFx0dGhpcy5fb25MZWF2ZS5maXJlKCk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXHR9XG5cblx0cHJpdmF0ZSBfcmVnaXN0ZXJPbk1vdXNlTWlkZGxlQ2xpY2soKSB7XG5cdFx0dGhpcy5fcmVnaXN0ZXIoZG9tLmFkZERpc3Bvc2FibGVMaXN0ZW5lcih0aGlzLl9jb250YWluZXIsIGRvbS5FdmVudFR5cGUuQVVYQ0xJQ0ssIGUgPT4ge1xuXHRcdFx0aWYgKGUuYnV0dG9uID09PSAxKSB7XG5cdFx0XHRcdHRoaXMuX29uTGVhdmUuZmlyZSgpO1xuXHRcdFx0fVxuXHRcdH0pKTtcblx0fVxuXG5cdHByaXZhdGUgX3JlZ2lzdGVyT25UcmVlTW9kZWxDaGFuZ2VkKCkge1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuX3RyZWUub25EaWRDaGFuZ2VNb2RlbCgoKSA9PiB7XG5cdFx0XHRjb25zdCB2aXNpYmxlQ291bnQgPSB0aGlzLl9pdGVtRWxlbWVudHMuZmlsdGVyKGUgPT4gIWUuaGlkZGVuKS5sZW5ndGg7XG5cdFx0XHR0aGlzLl92aXNpYmxlQ291bnRPYnNlcnZhYmxlLnNldCh2aXNpYmxlQ291bnQsIHVuZGVmaW5lZCk7XG5cdFx0XHRpZiAodGhpcy5faGFzQ2hlY2tib3hlcykge1xuXHRcdFx0XHR0aGlzLl91cGRhdGVDaGVja2VkT2JzZXJ2YWJsZXMoKTtcblx0XHRcdH1cblx0XHR9KSk7XG5cdH1cblxuXHRwcml2YXRlIF9yZWdpc3Rlck9uRWxlbWVudENoZWNrZWQoKSB7XG5cdFx0Ly8gT25seSBmaXJlIHRoZSBsYXN0IGV2ZW50IHdoZW4gYnVmZmVyZWRcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLl9lbGVtZW50Q2hlY2tlZEV2ZW50QnVmZmVyZXIud3JhcEV2ZW50KHRoaXMuX2VsZW1lbnRDaGVja2VkLmV2ZW50LCAoXywgZSkgPT4gZSkoXyA9PiB0aGlzLl91cGRhdGVDaGVja2VkT2JzZXJ2YWJsZXMoKSkpO1xuXHR9XG5cblx0cHJpdmF0ZSBfcmVnaXN0ZXJPbkNvbnRleHRNZW51KCkge1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuX3RyZWUub25Db250ZXh0TWVudShlID0+IHtcblx0XHRcdGlmIChlLmVsZW1lbnQpIHtcblx0XHRcdFx0ZS5icm93c2VyRXZlbnQucHJldmVudERlZmF1bHQoKTtcblxuXHRcdFx0XHQvLyB3ZSB3YW50IHRvIHRyZWF0IGEgY29udGV4dCBtZW51IGV2ZW50IGFzXG5cdFx0XHRcdC8vIGEgZ2VzdHVyZSB0byBvcGVuIHRoZSBpdGVtIGF0IHRoZSBpbmRleFxuXHRcdFx0XHQvLyBzaW5jZSB3ZSBkbyBub3QgaGF2ZSBhbnkgY29udGV4dCBtZW51XG5cdFx0XHRcdC8vIHRoaXMgZW5hYmxlcyBmb3IgZXhhbXBsZSBtYWNPUyB0byBDdHJsLVxuXHRcdFx0XHQvLyBjbGljayBvbiBhbiBpdGVtIHRvIG9wZW4gaXQuXG5cdFx0XHRcdHRoaXMuX3RyZWUuc2V0U2VsZWN0aW9uKFtlLmVsZW1lbnRdKTtcblx0XHRcdH1cblx0XHR9KSk7XG5cdH1cblxuXHRwcml2YXRlIF9yZWdpc3RlckhvdmVyTGlzdGVuZXJzKCkge1xuXHRcdGNvbnN0IGRlbGF5ZXIgPSB0aGlzLl9yZWdpc3RlcihuZXcgVGhyb3R0bGVkRGVsYXllcih0eXBlb2YgdGhpcy5ob3ZlckRlbGVnYXRlLmRlbGF5ID09PSAnZnVuY3Rpb24nID8gdGhpcy5ob3ZlckRlbGVnYXRlLmRlbGF5KCkgOiB0aGlzLmhvdmVyRGVsZWdhdGUuZGVsYXkpKTtcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLl90cmVlLm9uTW91c2VPdmVyKGFzeW5jIGUgPT4ge1xuXHRcdFx0Ly8gSWYgd2UgaG92ZXIgb3ZlciBhbiBhbmNob3IgZWxlbWVudCwgd2UgZG9uJ3Qgd2FudCB0byBzaG93IHRoZSBob3ZlciBiZWNhdXNlXG5cdFx0XHQvLyB0aGUgYW5jaG9yIG1heSBoYXZlIGEgdG9vbHRpcCB0aGF0IHdlIHdhbnQgdG8gc2hvdyBpbnN0ZWFkLlxuXHRcdFx0aWYgKGRvbS5pc0hUTUxBbmNob3JFbGVtZW50KGUuYnJvd3NlckV2ZW50LnRhcmdldCkpIHtcblx0XHRcdFx0ZGVsYXllci5jYW5jZWwoKTtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXHRcdFx0aWYgKFxuXHRcdFx0XHQvLyBhbmNob3JzIGFyZSBhbiBleGNlcHRpb24gYXMgY2FsbGVkIG91dCBhYm92ZSBzbyB3ZSBza2lwIHRoZW0gaGVyZVxuXHRcdFx0XHQhKGRvbS5pc0hUTUxBbmNob3JFbGVtZW50KGUuYnJvd3NlckV2ZW50LnJlbGF0ZWRUYXJnZXQpKSAmJlxuXHRcdFx0XHQvLyBjaGVjayBpZiB0aGUgbW91c2UgaXMgc3RpbGwgb3ZlciB0aGUgc2FtZSBlbGVtZW50XG5cdFx0XHRcdGRvbS5pc0FuY2VzdG9yKGUuYnJvd3NlckV2ZW50LnJlbGF0ZWRUYXJnZXQgYXMgTm9kZSwgZS5lbGVtZW50Py5lbGVtZW50IGFzIE5vZGUpXG5cdFx0XHQpIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXHRcdFx0dHJ5IHtcblx0XHRcdFx0YXdhaXQgZGVsYXllci50cmlnZ2VyKGFzeW5jICgpID0+IHtcblx0XHRcdFx0XHRpZiAoZS5lbGVtZW50IGluc3RhbmNlb2YgUXVpY2tQaWNrSXRlbUVsZW1lbnQpIHtcblx0XHRcdFx0XHRcdHRoaXMuc2hvd0hvdmVyKGUuZWxlbWVudCk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9KTtcblx0XHRcdH0gY2F0Y2ggKGUpIHtcblx0XHRcdFx0Ly8gSWdub3JlIGNhbmNlbGxhdGlvbiBlcnJvcnMgZHVlIHRvIG1vdXNlIG91dFxuXHRcdFx0XHRpZiAoIWlzQ2FuY2VsbGF0aW9uRXJyb3IoZSkpIHtcblx0XHRcdFx0XHR0aHJvdyBlO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fSkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuX3RyZWUub25Nb3VzZU91dChlID0+IHtcblx0XHRcdC8vIG9uTW91c2VPdXQgdHJpZ2dlcnMgZXZlcnkgdGltZSBhIG5ldyBlbGVtZW50IGhhcyBiZWVuIG1vdXNlZCBvdmVyXG5cdFx0XHQvLyBldmVuIGlmIGl0J3Mgb24gdGhlIHNhbWUgbGlzdCBpdGVtLiBXZSBvbmx5IHdhbnQgb25lIGV2ZW50LCBzbyB3ZVxuXHRcdFx0Ly8gY2hlY2sgaWYgdGhlIG1vdXNlIGlzIHN0aWxsIG92ZXIgdGhlIHNhbWUgZWxlbWVudC5cblx0XHRcdGlmIChkb20uaXNBbmNlc3RvcihlLmJyb3dzZXJFdmVudC5yZWxhdGVkVGFyZ2V0IGFzIE5vZGUsIGUuZWxlbWVudD8uZWxlbWVudCBhcyBOb2RlKSkge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cdFx0XHRkZWxheWVyLmNhbmNlbCgpO1xuXHRcdH0pKTtcblx0fVxuXG5cdC8qKlxuXHQgKiBSZWdpc3RlcidzIGZvY3VzIGNoYW5nZSBhbmQgbW91c2UgZXZlbnRzIHNvIHRoYXQgd2UgY2FuIHRyYWNrIHdoZW4gaXRlbXMgaW5zaWRlIG9mIGFcblx0ICogc2VwYXJhdG9yJ3Mgc2VjdGlvbiBhcmUgZm9jdXNlZCBvciBob3ZlcmVkIHNvIHRoYXQgd2UgY2FuIGRpc3BsYXkgdGhlIHNlcGFyYXRvcidzIGFjdGlvbnNcblx0ICovXG5cdHByaXZhdGUgX3JlZ2lzdGVyU2VwYXJhdG9yQWN0aW9uU2hvd2luZ0xpc3RlbmVycygpIHtcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLl90cmVlLm9uRGlkQ2hhbmdlRm9jdXMoZSA9PiB7XG5cdFx0XHRjb25zdCBwYXJlbnQgPSBlLmVsZW1lbnRzWzBdXG5cdFx0XHRcdD8gdGhpcy5fdHJlZS5nZXRQYXJlbnRFbGVtZW50KGUuZWxlbWVudHNbMF0pIGFzIFF1aWNrUGlja1NlcGFyYXRvckVsZW1lbnRcblx0XHRcdFx0Ly8gdHJlYXQgbnVsbCBhcyBmb2N1cyBsb3N0IGFuZCB3aGVuIHdlIGhhdmUgbm8gc2VwYXJhdG9yc1xuXHRcdFx0XHQ6IG51bGw7XG5cdFx0XHRmb3IgKGNvbnN0IHNlcGFyYXRvciBvZiB0aGlzLl9zZXBhcmF0b3JSZW5kZXJlci52aXNpYmxlU2VwYXJhdG9ycykge1xuXHRcdFx0XHRjb25zdCB2YWx1ZSA9IHNlcGFyYXRvciA9PT0gcGFyZW50O1xuXHRcdFx0XHQvLyBnZXQgYml0bmVzcyBvZiBBQ1RJVkVfSVRFTSBhbmQgY2hlY2sgaWYgaXQgY2hhbmdlZFxuXHRcdFx0XHRjb25zdCBjdXJyZW50QWN0aXZlID0gISEoc2VwYXJhdG9yLmZvY3VzSW5zaWRlU2VwYXJhdG9yICYgUXVpY2tQaWNrU2VwYXJhdG9yRm9jdXNSZWFzb24uQUNUSVZFX0lURU0pO1xuXHRcdFx0XHRpZiAoY3VycmVudEFjdGl2ZSAhPT0gdmFsdWUpIHtcblx0XHRcdFx0XHRpZiAodmFsdWUpIHtcblx0XHRcdFx0XHRcdHNlcGFyYXRvci5mb2N1c0luc2lkZVNlcGFyYXRvciB8PSBRdWlja1BpY2tTZXBhcmF0b3JGb2N1c1JlYXNvbi5BQ1RJVkVfSVRFTTtcblx0XHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdFx0c2VwYXJhdG9yLmZvY3VzSW5zaWRlU2VwYXJhdG9yICY9IH5RdWlja1BpY2tTZXBhcmF0b3JGb2N1c1JlYXNvbi5BQ1RJVkVfSVRFTTtcblx0XHRcdFx0XHR9XG5cblx0XHRcdFx0XHR0aGlzLl90cmVlLnJlcmVuZGVyKHNlcGFyYXRvcik7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9KSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5fdHJlZS5vbk1vdXNlT3ZlcihlID0+IHtcblx0XHRcdGNvbnN0IHBhcmVudCA9IGUuZWxlbWVudFxuXHRcdFx0XHQ/IHRoaXMuX3RyZWUuZ2V0UGFyZW50RWxlbWVudChlLmVsZW1lbnQpIGFzIFF1aWNrUGlja1NlcGFyYXRvckVsZW1lbnRcblx0XHRcdFx0OiBudWxsO1xuXHRcdFx0Zm9yIChjb25zdCBzZXBhcmF0b3Igb2YgdGhpcy5fc2VwYXJhdG9yUmVuZGVyZXIudmlzaWJsZVNlcGFyYXRvcnMpIHtcblx0XHRcdFx0aWYgKHNlcGFyYXRvciAhPT0gcGFyZW50KSB7XG5cdFx0XHRcdFx0Y29udGludWU7XG5cdFx0XHRcdH1cblx0XHRcdFx0Y29uc3QgY3VycmVudE1vdXNlID0gISEoc2VwYXJhdG9yLmZvY3VzSW5zaWRlU2VwYXJhdG9yICYgUXVpY2tQaWNrU2VwYXJhdG9yRm9jdXNSZWFzb24uTU9VU0VfSE9WRVIpO1xuXHRcdFx0XHRpZiAoIWN1cnJlbnRNb3VzZSkge1xuXHRcdFx0XHRcdHNlcGFyYXRvci5mb2N1c0luc2lkZVNlcGFyYXRvciB8PSBRdWlja1BpY2tTZXBhcmF0b3JGb2N1c1JlYXNvbi5NT1VTRV9IT1ZFUjtcblx0XHRcdFx0XHR0aGlzLl90cmVlLnJlcmVuZGVyKHNlcGFyYXRvcik7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9KSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5fdHJlZS5vbk1vdXNlT3V0KGUgPT4ge1xuXHRcdFx0Y29uc3QgcGFyZW50ID0gZS5lbGVtZW50XG5cdFx0XHRcdD8gdGhpcy5fdHJlZS5nZXRQYXJlbnRFbGVtZW50KGUuZWxlbWVudCkgYXMgUXVpY2tQaWNrU2VwYXJhdG9yRWxlbWVudFxuXHRcdFx0XHQ6IG51bGw7XG5cdFx0XHRmb3IgKGNvbnN0IHNlcGFyYXRvciBvZiB0aGlzLl9zZXBhcmF0b3JSZW5kZXJlci52aXNpYmxlU2VwYXJhdG9ycykge1xuXHRcdFx0XHRpZiAoc2VwYXJhdG9yICE9PSBwYXJlbnQpIHtcblx0XHRcdFx0XHRjb250aW51ZTtcblx0XHRcdFx0fVxuXHRcdFx0XHRjb25zdCBjdXJyZW50TW91c2UgPSAhIShzZXBhcmF0b3IuZm9jdXNJbnNpZGVTZXBhcmF0b3IgJiBRdWlja1BpY2tTZXBhcmF0b3JGb2N1c1JlYXNvbi5NT1VTRV9IT1ZFUik7XG5cdFx0XHRcdGlmIChjdXJyZW50TW91c2UpIHtcblx0XHRcdFx0XHRzZXBhcmF0b3IuZm9jdXNJbnNpZGVTZXBhcmF0b3IgJj0gflF1aWNrUGlja1NlcGFyYXRvckZvY3VzUmVhc29uLk1PVVNFX0hPVkVSO1xuXHRcdFx0XHRcdHRoaXMuX3RyZWUucmVyZW5kZXIoc2VwYXJhdG9yKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH0pKTtcblx0fVxuXG5cdHByaXZhdGUgX3JlZ2lzdGVyU2VsZWN0aW9uQ2hhbmdlTGlzdGVuZXIoKSB7XG5cdFx0Ly8gV2hlbiB0aGUgdXNlciBzZWxlY3RzIGEgc2VwYXJhdG9yLCB0aGUgc2VwYXJhdG9yIHdpbGwgbW92ZSB0byB0aGUgdG9wIGFuZCBmb2N1cyB3aWxsIGJlXG5cdFx0Ly8gc2V0IHRvIHRoZSBmaXJzdCBlbGVtZW50IGFmdGVyIHRoZSBzZXBhcmF0b3IuXG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5fdHJlZS5vbkRpZENoYW5nZVNlbGVjdGlvbihlID0+IHtcblx0XHRcdGNvbnN0IGVsZW1lbnRzV2l0aG91dFNlcGFyYXRvcnMgPSBlLmVsZW1lbnRzLmZpbHRlcigoZSk6IGUgaXMgUXVpY2tQaWNrSXRlbUVsZW1lbnQgPT4gZSBpbnN0YW5jZW9mIFF1aWNrUGlja0l0ZW1FbGVtZW50KTtcblx0XHRcdGlmIChlbGVtZW50c1dpdGhvdXRTZXBhcmF0b3JzLmxlbmd0aCAhPT0gZS5lbGVtZW50cy5sZW5ndGgpIHtcblx0XHRcdFx0aWYgKGUuZWxlbWVudHMubGVuZ3RoID09PSAxICYmIGUuZWxlbWVudHNbMF0gaW5zdGFuY2VvZiBRdWlja1BpY2tTZXBhcmF0b3JFbGVtZW50KSB7XG5cdFx0XHRcdFx0dGhpcy5fdHJlZS5zZXRGb2N1cyhbZS5lbGVtZW50c1swXS5jaGlsZHJlblswXV0pO1xuXHRcdFx0XHRcdHRoaXMuX3RyZWUucmV2ZWFsKGUuZWxlbWVudHNbMF0sIDApO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHRoaXMuX3RyZWUuc2V0U2VsZWN0aW9uKGVsZW1lbnRzV2l0aG91dFNlcGFyYXRvcnMpO1xuXHRcdFx0fVxuXHRcdH0pKTtcblx0fVxuXG5cdC8vI2VuZHJlZ2lvblxuXG5cdC8vI3JlZ2lvbiBwdWJsaWMgbWV0aG9kc1xuXG5cdHNldEFsbFZpc2libGVDaGVja2VkKGNoZWNrZWQ6IGJvb2xlYW4pIHtcblx0XHR0aGlzLl9lbGVtZW50Q2hlY2tlZEV2ZW50QnVmZmVyZXIuYnVmZmVyRXZlbnRzKCgpID0+IHtcblx0XHRcdHRoaXMuX2l0ZW1FbGVtZW50cy5mb3JFYWNoKGVsZW1lbnQgPT4ge1xuXHRcdFx0XHRpZiAoIWVsZW1lbnQuaGlkZGVuICYmICFlbGVtZW50LmNoZWNrYm94RGlzYWJsZWQgJiYgZWxlbWVudC5pdGVtLnBpY2thYmxlICE9PSBmYWxzZSkge1xuXHRcdFx0XHRcdC8vIFdvdWxkIGZpcmUgYW4gZXZlbnQgaWYgd2UgZGlkbid0IGJlZmZlciB0aGUgZXZlbnRzXG5cdFx0XHRcdFx0ZWxlbWVudC5jaGVja2VkID0gY2hlY2tlZDtcblx0XHRcdFx0fVxuXHRcdFx0fSk7XG5cdFx0fSk7XG5cdH1cblxuXHRzZXRFbGVtZW50cyhpbnB1dEVsZW1lbnRzOiBRdWlja1BpY2tJdGVtW10pOiB2b2lkIHtcblx0XHR0aGlzLl9lbGVtZW50RGlzcG9zYWJsZS5jbGVhcigpO1xuXHRcdHRoaXMuX2xhc3RRdWVyeVN0cmluZyA9IHVuZGVmaW5lZDtcblx0XHR0aGlzLl9pbnB1dEVsZW1lbnRzID0gaW5wdXRFbGVtZW50cztcblx0XHR0aGlzLl9oYXNDaGVja2JveGVzID0gdGhpcy5wYXJlbnQuY2xhc3NMaXN0LmNvbnRhaW5zKCdzaG93LWNoZWNrYm94ZXMnKTtcblx0XHRsZXQgY3VycmVudFNlcGFyYXRvckVsZW1lbnQ6IFF1aWNrUGlja1NlcGFyYXRvckVsZW1lbnQgfCB1bmRlZmluZWQ7XG5cdFx0dGhpcy5faXRlbUVsZW1lbnRzID0gbmV3IEFycmF5PFF1aWNrUGlja0l0ZW1FbGVtZW50PigpO1xuXHRcdHRoaXMuX2VsZW1lbnRUcmVlID0gaW5wdXRFbGVtZW50cy5yZWR1Y2UoKHJlc3VsdCwgaXRlbSwgaW5kZXgpID0+IHtcblx0XHRcdGxldCBlbGVtZW50OiBJUXVpY2tQaWNrRWxlbWVudDtcblx0XHRcdGlmIChpdGVtLnR5cGUgPT09ICdzZXBhcmF0b3InKSB7XG5cdFx0XHRcdGlmICghaXRlbS5idXR0b25zKSB7XG5cdFx0XHRcdFx0Ly8gVGhpcyBzZXBhcmF0b3Igd2lsbCBiZSByZW5kZXJlZCBhcyBhIHBhcnQgb2YgdGhlIGxpc3QgaXRlbVxuXHRcdFx0XHRcdHJldHVybiByZXN1bHQ7XG5cdFx0XHRcdH1cblx0XHRcdFx0Y3VycmVudFNlcGFyYXRvckVsZW1lbnQgPSBuZXcgUXVpY2tQaWNrU2VwYXJhdG9yRWxlbWVudChcblx0XHRcdFx0XHRpbmRleCxcblx0XHRcdFx0XHRlID0+IHRoaXMuX29uU2VwYXJhdG9yQnV0dG9uVHJpZ2dlcmVkLmZpcmUoZSksXG5cdFx0XHRcdFx0aXRlbVxuXHRcdFx0XHQpO1xuXHRcdFx0XHRlbGVtZW50ID0gY3VycmVudFNlcGFyYXRvckVsZW1lbnQ7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRjb25zdCBwcmV2aW91cyA9IGluZGV4ID4gMCA/IGlucHV0RWxlbWVudHNbaW5kZXggLSAxXSA6IHVuZGVmaW5lZDtcblx0XHRcdFx0bGV0IHNlcGFyYXRvcjogSVF1aWNrUGlja1NlcGFyYXRvciB8IHVuZGVmaW5lZDtcblx0XHRcdFx0aWYgKHByZXZpb3VzICYmIHByZXZpb3VzLnR5cGUgPT09ICdzZXBhcmF0b3InICYmICFwcmV2aW91cy5idXR0b25zKSB7XG5cdFx0XHRcdFx0c2VwYXJhdG9yID0gcHJldmlvdXM7XG5cdFx0XHRcdH1cblx0XHRcdFx0Y29uc3QgcXBpID0gbmV3IFF1aWNrUGlja0l0ZW1FbGVtZW50KFxuXHRcdFx0XHRcdGluZGV4LFxuXHRcdFx0XHRcdGN1cnJlbnRTZXBhcmF0b3JFbGVtZW50Py5jaGlsZHJlblxuXHRcdFx0XHRcdFx0PyBjdXJyZW50U2VwYXJhdG9yRWxlbWVudC5jaGlsZHJlbi5sZW5ndGhcblx0XHRcdFx0XHRcdDogaW5kZXgsXG5cdFx0XHRcdFx0dGhpcy5faGFzQ2hlY2tib3hlcyAmJiBpdGVtLnBpY2thYmxlICE9PSBmYWxzZSxcblx0XHRcdFx0XHRlID0+IHRoaXMuX29uQnV0dG9uVHJpZ2dlcmVkLmZpcmUoZSksXG5cdFx0XHRcdFx0dGhpcy5fZWxlbWVudENoZWNrZWQsXG5cdFx0XHRcdFx0aXRlbSxcblx0XHRcdFx0XHRzZXBhcmF0b3IsXG5cdFx0XHRcdCk7XG5cdFx0XHRcdHRoaXMuX2l0ZW1FbGVtZW50cy5wdXNoKHFwaSk7XG5cblx0XHRcdFx0aWYgKGN1cnJlbnRTZXBhcmF0b3JFbGVtZW50KSB7XG5cdFx0XHRcdFx0Y3VycmVudFNlcGFyYXRvckVsZW1lbnQuY2hpbGRyZW4ucHVzaChxcGkpO1xuXHRcdFx0XHRcdHJldHVybiByZXN1bHQ7XG5cdFx0XHRcdH1cblx0XHRcdFx0ZWxlbWVudCA9IHFwaTtcblx0XHRcdH1cblxuXHRcdFx0cmVzdWx0LnB1c2goZWxlbWVudCk7XG5cdFx0XHRyZXR1cm4gcmVzdWx0O1xuXHRcdH0sIG5ldyBBcnJheTxJUXVpY2tQaWNrRWxlbWVudD4oKSk7XG5cblx0XHR0aGlzLl9zZXRFbGVtZW50c1RvVHJlZSh0aGlzLl9lbGVtZW50VHJlZSk7XG5cblx0XHQvLyBBY2Nlc3NpYmlsaXR5IGhhY2ssIHVuZm9ydHVuYXRlbHkgb24gbmV4dCB0aWNrXG5cdFx0Ly8gaHR0cHM6Ly9naXRodWIuY29tL21pY3Jvc29mdC92c2NvZGUvaXNzdWVzLzIxMTk3NlxuXHRcdGlmICh0aGlzLmFjY2Vzc2liaWxpdHlTZXJ2aWNlLmlzU2NyZWVuUmVhZGVyT3B0aW1pemVkKCkpIHtcblx0XHRcdGRpc3Bvc2FibGVUaW1lb3V0KCgpID0+IHtcblx0XHRcdFx0Ly8gZXNsaW50LWRpc2FibGUtbmV4dC1saW5lIG5vLXJlc3RyaWN0ZWQtc3ludGF4XG5cdFx0XHRcdGNvbnN0IGZvY3VzZWRFbGVtZW50ID0gdGhpcy5fdHJlZS5nZXRIVE1MRWxlbWVudCgpLnF1ZXJ5U2VsZWN0b3IoYC5tb25hY28tbGlzdC1yb3cuZm9jdXNlZGApO1xuXHRcdFx0XHRjb25zdCBwYXJlbnQgPSBmb2N1c2VkRWxlbWVudD8ucGFyZW50Tm9kZTtcblx0XHRcdFx0aWYgKGZvY3VzZWRFbGVtZW50ICYmIHBhcmVudCkge1xuXHRcdFx0XHRcdGNvbnN0IG5leHRTaWJsaW5nID0gZm9jdXNlZEVsZW1lbnQubmV4dFNpYmxpbmc7XG5cdFx0XHRcdFx0Zm9jdXNlZEVsZW1lbnQucmVtb3ZlKCk7XG5cdFx0XHRcdFx0cGFyZW50Lmluc2VydEJlZm9yZShmb2N1c2VkRWxlbWVudCwgbmV4dFNpYmxpbmcpO1xuXHRcdFx0XHR9XG5cdFx0XHR9LCAwLCB0aGlzLl9lbGVtZW50RGlzcG9zYWJsZSk7XG5cdFx0fVxuXHR9XG5cblx0c2V0Rm9jdXNlZEVsZW1lbnRzKGl0ZW1zOiBJUXVpY2tQaWNrSXRlbVtdKSB7XG5cdFx0Y29uc3QgZWxlbWVudHMgPSBpdGVtcy5tYXAoaXRlbSA9PiB0aGlzLl9pdGVtRWxlbWVudHMuZmluZChlID0+IGUuaXRlbSA9PT0gaXRlbSkpXG5cdFx0XHQuZmlsdGVyKChlKTogZSBpcyBRdWlja1BpY2tJdGVtRWxlbWVudCA9PiAhIWUpXG5cdFx0XHQuZmlsdGVyKGUgPT4gIWUuaGlkZGVuKTtcblx0XHR0aGlzLl90cmVlLnNldEZvY3VzKGVsZW1lbnRzKTtcblx0XHRpZiAoaXRlbXMubGVuZ3RoID4gMCkge1xuXHRcdFx0Y29uc3QgZm9jdXNlZCA9IHRoaXMuX3RyZWUuZ2V0Rm9jdXMoKVswXTtcblx0XHRcdGlmIChmb2N1c2VkKSB7XG5cdFx0XHRcdHRoaXMuX3RyZWUucmV2ZWFsKGZvY3VzZWQpO1xuXHRcdFx0fVxuXHRcdH1cblx0fVxuXG5cdGdldEFjdGl2ZURlc2NlbmRhbnQoKSB7XG5cdFx0cmV0dXJuIHRoaXMuX3RyZWUuZ2V0SFRNTEVsZW1lbnQoKS5nZXRBdHRyaWJ1dGUoJ2FyaWEtYWN0aXZlZGVzY2VuZGFudCcpO1xuXHR9XG5cblx0c2V0U2VsZWN0ZWRFbGVtZW50cyhpdGVtczogSVF1aWNrUGlja0l0ZW1bXSkge1xuXHRcdGNvbnN0IGVsZW1lbnRzID0gaXRlbXMubWFwKGl0ZW0gPT4gdGhpcy5faXRlbUVsZW1lbnRzLmZpbmQoZSA9PiBlLml0ZW0gPT09IGl0ZW0pKVxuXHRcdFx0LmZpbHRlcigoZSk6IGUgaXMgUXVpY2tQaWNrSXRlbUVsZW1lbnQgPT4gISFlKTtcblx0XHR0aGlzLl90cmVlLnNldFNlbGVjdGlvbihlbGVtZW50cyk7XG5cdH1cblxuXHRnZXRDaGVja2VkRWxlbWVudHMoKSB7XG5cdFx0cmV0dXJuIHRoaXMuX2l0ZW1FbGVtZW50cy5maWx0ZXIoZSA9PiBlLmNoZWNrZWQpXG5cdFx0XHQubWFwKGUgPT4gZS5pdGVtKTtcblx0fVxuXG5cdHNldENoZWNrZWRFbGVtZW50cyhpdGVtczogSVF1aWNrUGlja0l0ZW1bXSkge1xuXHRcdHRoaXMuX2VsZW1lbnRDaGVja2VkRXZlbnRCdWZmZXJlci5idWZmZXJFdmVudHMoKCkgPT4ge1xuXHRcdFx0Y29uc3QgY2hlY2tlZCA9IG5ldyBTZXQoKTtcblx0XHRcdGZvciAoY29uc3QgaXRlbSBvZiBpdGVtcykge1xuXHRcdFx0XHRjaGVja2VkLmFkZChpdGVtKTtcblx0XHRcdH1cblx0XHRcdGZvciAoY29uc3QgZWxlbWVudCBvZiB0aGlzLl9pdGVtRWxlbWVudHMpIHtcblx0XHRcdFx0Ly8gV291bGQgZmlyZSBhbiBldmVudCBpZiB3ZSBkaWRuJ3QgYmVmZmVyIHRoZSBldmVudHNcblx0XHRcdFx0ZWxlbWVudC5jaGVja2VkID0gY2hlY2tlZC5oYXMoZWxlbWVudC5pdGVtKTtcblx0XHRcdH1cblx0XHR9KTtcblx0fVxuXG5cdGZvY3VzKHdoYXQ6IFF1aWNrUGlja0ZvY3VzKTogdm9pZCB7XG5cdFx0aWYgKCF0aGlzLl9pdGVtRWxlbWVudHMubGVuZ3RoKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0aWYgKHdoYXQgPT09IFF1aWNrUGlja0ZvY3VzLlNlY29uZCAmJiB0aGlzLl9pdGVtRWxlbWVudHMubGVuZ3RoIDwgMikge1xuXHRcdFx0d2hhdCA9IFF1aWNrUGlja0ZvY3VzLkZpcnN0O1xuXHRcdH1cblxuXHRcdHN3aXRjaCAod2hhdCkge1xuXHRcdFx0Y2FzZSBRdWlja1BpY2tGb2N1cy5GaXJzdDpcblx0XHRcdFx0dGhpcy5fdHJlZS5zY3JvbGxUb3AgPSAwO1xuXHRcdFx0XHR0aGlzLl90cmVlLmZvY3VzRmlyc3QodW5kZWZpbmVkLCAoZSkgPT4gZS5lbGVtZW50IGluc3RhbmNlb2YgUXVpY2tQaWNrSXRlbUVsZW1lbnQpO1xuXHRcdFx0XHRicmVhaztcblx0XHRcdGNhc2UgUXVpY2tQaWNrRm9jdXMuU2Vjb25kOiB7XG5cdFx0XHRcdHRoaXMuX3RyZWUuc2Nyb2xsVG9wID0gMDtcblx0XHRcdFx0bGV0IGlzU2Vjb25kSXRlbSA9IGZhbHNlO1xuXHRcdFx0XHR0aGlzLl90cmVlLmZvY3VzRmlyc3QodW5kZWZpbmVkLCAoZSkgPT4ge1xuXHRcdFx0XHRcdGlmICghKGUuZWxlbWVudCBpbnN0YW5jZW9mIFF1aWNrUGlja0l0ZW1FbGVtZW50KSkge1xuXHRcdFx0XHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRpZiAoaXNTZWNvbmRJdGVtKSB7XG5cdFx0XHRcdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0aXNTZWNvbmRJdGVtID0gIWlzU2Vjb25kSXRlbTtcblx0XHRcdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0XHRcdH0pO1xuXHRcdFx0XHRicmVhaztcblx0XHRcdH1cblx0XHRcdGNhc2UgUXVpY2tQaWNrRm9jdXMuTGFzdDpcblx0XHRcdFx0dGhpcy5fdHJlZS5zY3JvbGxUb3AgPSB0aGlzLl90cmVlLnNjcm9sbEhlaWdodDtcblx0XHRcdFx0dGhpcy5fdHJlZS5mb2N1c0xhc3QodW5kZWZpbmVkLCAoZSkgPT4gZS5lbGVtZW50IGluc3RhbmNlb2YgUXVpY2tQaWNrSXRlbUVsZW1lbnQpO1xuXHRcdFx0XHRicmVhaztcblx0XHRcdGNhc2UgUXVpY2tQaWNrRm9jdXMuTmV4dDoge1xuXHRcdFx0XHRjb25zdCBwcmV2Rm9jdXMgPSB0aGlzLl90cmVlLmdldEZvY3VzKCk7XG5cdFx0XHRcdHRoaXMuX3RyZWUuZm9jdXNOZXh0KHVuZGVmaW5lZCwgdGhpcy5fc2hvdWxkTG9vcCwgdW5kZWZpbmVkLCAoZSkgPT4ge1xuXHRcdFx0XHRcdGlmICghKGUuZWxlbWVudCBpbnN0YW5jZW9mIFF1aWNrUGlja0l0ZW1FbGVtZW50KSkge1xuXHRcdFx0XHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHR0aGlzLl90cmVlLnJldmVhbChlLmVsZW1lbnQpO1xuXHRcdFx0XHRcdHJldHVybiB0cnVlO1xuXHRcdFx0XHR9KTtcblx0XHRcdFx0Y29uc3QgY3VycmVudEZvY3VzID0gdGhpcy5fdHJlZS5nZXRGb2N1cygpO1xuXHRcdFx0XHRpZiAocHJldkZvY3VzLmxlbmd0aCAmJiBwcmV2Rm9jdXNbMF0gPT09IGN1cnJlbnRGb2N1c1swXSkge1xuXHRcdFx0XHRcdHRoaXMuX29uTGVhdmUuZmlyZSgpO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGJyZWFrO1xuXHRcdFx0fVxuXHRcdFx0Y2FzZSBRdWlja1BpY2tGb2N1cy5QcmV2aW91czoge1xuXHRcdFx0XHRjb25zdCBwcmV2Rm9jdXMgPSB0aGlzLl90cmVlLmdldEZvY3VzKCk7XG5cdFx0XHRcdHRoaXMuX3RyZWUuZm9jdXNQcmV2aW91cyh1bmRlZmluZWQsIHRoaXMuX3Nob3VsZExvb3AsIHVuZGVmaW5lZCwgKGUpID0+IHtcblx0XHRcdFx0XHRpZiAoIShlLmVsZW1lbnQgaW5zdGFuY2VvZiBRdWlja1BpY2tJdGVtRWxlbWVudCkpIHtcblx0XHRcdFx0XHRcdHJldHVybiBmYWxzZTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0Y29uc3QgcGFyZW50ID0gdGhpcy5fdHJlZS5nZXRQYXJlbnRFbGVtZW50KGUuZWxlbWVudCk7XG5cdFx0XHRcdFx0aWYgKHBhcmVudCA9PT0gbnVsbCB8fCAocGFyZW50IGFzIFF1aWNrUGlja1NlcGFyYXRvckVsZW1lbnQpLmNoaWxkcmVuWzBdICE9PSBlLmVsZW1lbnQpIHtcblx0XHRcdFx0XHRcdHRoaXMuX3RyZWUucmV2ZWFsKGUuZWxlbWVudCk7XG5cdFx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRcdC8vIE9ubHkgaWYgd2UgYXJlIHRoZSBmaXJzdCBjaGlsZCBvZiBhIHNlcGFyYXRvciBkbyB3ZSByZXZlYWwgdGhlIHNlcGFyYXRvclxuXHRcdFx0XHRcdFx0dGhpcy5fdHJlZS5yZXZlYWwocGFyZW50KTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0XHRcdH0pO1xuXHRcdFx0XHRjb25zdCBjdXJyZW50Rm9jdXMgPSB0aGlzLl90cmVlLmdldEZvY3VzKCk7XG5cdFx0XHRcdGlmIChwcmV2Rm9jdXMubGVuZ3RoICYmIHByZXZGb2N1c1swXSA9PT0gY3VycmVudEZvY3VzWzBdKSB7XG5cdFx0XHRcdFx0dGhpcy5fb25MZWF2ZS5maXJlKCk7XG5cdFx0XHRcdH1cblx0XHRcdFx0YnJlYWs7XG5cdFx0XHR9XG5cdFx0XHRjYXNlIFF1aWNrUGlja0ZvY3VzLk5leHRQYWdlOlxuXHRcdFx0XHR0aGlzLl90cmVlLmZvY3VzTmV4dFBhZ2UodW5kZWZpbmVkLCAoZSkgPT4ge1xuXHRcdFx0XHRcdGlmICghKGUuZWxlbWVudCBpbnN0YW5jZW9mIFF1aWNrUGlja0l0ZW1FbGVtZW50KSkge1xuXHRcdFx0XHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHR0aGlzLl90cmVlLnJldmVhbChlLmVsZW1lbnQpO1xuXHRcdFx0XHRcdHJldHVybiB0cnVlO1xuXHRcdFx0XHR9KTtcblx0XHRcdFx0YnJlYWs7XG5cdFx0XHRjYXNlIFF1aWNrUGlja0ZvY3VzLlByZXZpb3VzUGFnZTpcblx0XHRcdFx0dGhpcy5fdHJlZS5mb2N1c1ByZXZpb3VzUGFnZSh1bmRlZmluZWQsIChlKSA9PiB7XG5cdFx0XHRcdFx0aWYgKCEoZS5lbGVtZW50IGluc3RhbmNlb2YgUXVpY2tQaWNrSXRlbUVsZW1lbnQpKSB7XG5cdFx0XHRcdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdGNvbnN0IHBhcmVudCA9IHRoaXMuX3RyZWUuZ2V0UGFyZW50RWxlbWVudChlLmVsZW1lbnQpO1xuXHRcdFx0XHRcdGlmIChwYXJlbnQgPT09IG51bGwgfHwgKHBhcmVudCBhcyBRdWlja1BpY2tTZXBhcmF0b3JFbGVtZW50KS5jaGlsZHJlblswXSAhPT0gZS5lbGVtZW50KSB7XG5cdFx0XHRcdFx0XHR0aGlzLl90cmVlLnJldmVhbChlLmVsZW1lbnQpO1xuXHRcdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0XHR0aGlzLl90cmVlLnJldmVhbChwYXJlbnQpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHRcdFx0fSk7XG5cdFx0XHRcdGJyZWFrO1xuXHRcdFx0Y2FzZSBRdWlja1BpY2tGb2N1cy5OZXh0U2VwYXJhdG9yOiB7XG5cdFx0XHRcdGxldCBmb3VuZFNlcGFyYXRvckFzSXRlbSA9IGZhbHNlO1xuXHRcdFx0XHRjb25zdCBiZWZvcmUgPSB0aGlzLl90cmVlLmdldEZvY3VzKClbMF07XG5cdFx0XHRcdHRoaXMuX3RyZWUuZm9jdXNOZXh0KHVuZGVmaW5lZCwgdHJ1ZSwgdW5kZWZpbmVkLCAoZSkgPT4ge1xuXHRcdFx0XHRcdGlmIChmb3VuZFNlcGFyYXRvckFzSXRlbSkge1xuXHRcdFx0XHRcdFx0Ly8gVGhpcyBzaG91bGQgYmUgdGhlIGluZGV4IHJpZ2h0IGFmdGVyIHRoZSBzZXBhcmF0b3Igc28gaXRcblx0XHRcdFx0XHRcdC8vIGlzIHRoZSBpdGVtIHdlIHdhbnQgdG8gZm9jdXMuXG5cdFx0XHRcdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHRcdFx0XHR9XG5cblx0XHRcdFx0XHRpZiAoZS5lbGVtZW50IGluc3RhbmNlb2YgUXVpY2tQaWNrU2VwYXJhdG9yRWxlbWVudCkge1xuXHRcdFx0XHRcdFx0Zm91bmRTZXBhcmF0b3JBc0l0ZW0gPSB0cnVlO1xuXHRcdFx0XHRcdFx0Ly8gSWYgdGhlIHNlcGFyYXRvciBpcyB2aXNpYmxlLCB0aGVuIHdlIHNob3VsZCBqdXN0IHJldmVhbCBpdHMgZmlyc3QgY2hpbGQgc28gaXQncyBub3QgYXMgamFycmluZy5cblx0XHRcdFx0XHRcdGlmICh0aGlzLl9zZXBhcmF0b3JSZW5kZXJlci5pc1NlcGFyYXRvclZpc2libGUoZS5lbGVtZW50KSkge1xuXHRcdFx0XHRcdFx0XHR0aGlzLl90cmVlLnJldmVhbChlLmVsZW1lbnQuY2hpbGRyZW5bMF0pO1xuXHRcdFx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRcdFx0Ly8gSWYgdGhlIHNlcGFyYXRvciBpcyBub3QgdmlzaWJsZSwgdGhlbiB3ZSBzaG91bGRcblx0XHRcdFx0XHRcdFx0Ly8gcHVzaCBpdCB1cCB0byB0aGUgdG9wIG9mIHRoZSBsaXN0LlxuXHRcdFx0XHRcdFx0XHR0aGlzLl90cmVlLnJldmVhbChlLmVsZW1lbnQsIDApO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH0gZWxzZSBpZiAoZS5lbGVtZW50IGluc3RhbmNlb2YgUXVpY2tQaWNrSXRlbUVsZW1lbnQpIHtcblx0XHRcdFx0XHRcdGlmIChlLmVsZW1lbnQuc2VwYXJhdG9yKSB7XG5cdFx0XHRcdFx0XHRcdGlmICh0aGlzLl9pdGVtUmVuZGVyZXIuaXNJdGVtV2l0aFNlcGFyYXRvclZpc2libGUoZS5lbGVtZW50KSkge1xuXHRcdFx0XHRcdFx0XHRcdHRoaXMuX3RyZWUucmV2ZWFsKGUuZWxlbWVudCk7XG5cdFx0XHRcdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0XHRcdFx0dGhpcy5fdHJlZS5yZXZlYWwoZS5lbGVtZW50LCAwKTtcblx0XHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHRcdFx0XHRcdH0gZWxzZSBpZiAoZS5lbGVtZW50ID09PSB0aGlzLl9lbGVtZW50VHJlZVswXSkge1xuXHRcdFx0XHRcdFx0XHQvLyBXZSBzaG91bGQgc3RvcCBhdCB0aGUgZmlyc3QgaXRlbSBpbiB0aGUgbGlzdCBpZiBpdCdzIGEgcmVndWxhciBpdGVtLlxuXHRcdFx0XHRcdFx0XHR0aGlzLl90cmVlLnJldmVhbChlLmVsZW1lbnQsIDApO1xuXHRcdFx0XHRcdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdFx0XHR9KTtcblx0XHRcdFx0Y29uc3QgYWZ0ZXIgPSB0aGlzLl90cmVlLmdldEZvY3VzKClbMF07XG5cdFx0XHRcdGlmIChiZWZvcmUgPT09IGFmdGVyKSB7XG5cdFx0XHRcdFx0Ly8gSWYgd2UgZGlkbid0IG1vdmUsIHRoZW4gd2Ugc2hvdWxkIGp1c3QgbW92ZSB0byB0aGUgZW5kXG5cdFx0XHRcdFx0Ly8gb2YgdGhlIGxpc3QuXG5cdFx0XHRcdFx0dGhpcy5fdHJlZS5zY3JvbGxUb3AgPSB0aGlzLl90cmVlLnNjcm9sbEhlaWdodDtcblx0XHRcdFx0XHR0aGlzLl90cmVlLmZvY3VzTGFzdCh1bmRlZmluZWQsIChlKSA9PiBlLmVsZW1lbnQgaW5zdGFuY2VvZiBRdWlja1BpY2tJdGVtRWxlbWVudCk7XG5cdFx0XHRcdH1cblx0XHRcdFx0YnJlYWs7XG5cdFx0XHR9XG5cdFx0XHRjYXNlIFF1aWNrUGlja0ZvY3VzLlByZXZpb3VzU2VwYXJhdG9yOiB7XG5cdFx0XHRcdGxldCBmb2N1c0VsZW1lbnQ6IElRdWlja1BpY2tFbGVtZW50IHwgdW5kZWZpbmVkO1xuXHRcdFx0XHQvLyBJZiB3ZSBhcmUgYWxyZWFkeSBzaXR0aW5nIG9uIGFuIGlubGluZSBzZXBhcmF0b3IsIHRoZW4gd2Vcblx0XHRcdFx0Ly8gaGF2ZSBhbHJlYWR5IGZvdW5kIHRoZSBfY3VycmVudF8gc2VwYXJhdG9yIGFuZCBuZWVkIHRvXG5cdFx0XHRcdC8vIG1vdmUgdG8gdGhlIHByZXZpb3VzIG9uZS5cblx0XHRcdFx0bGV0IGZvdW5kU2VwYXJhdG9yID0gISF0aGlzLl90cmVlLmdldEZvY3VzKClbMF0/LnNlcGFyYXRvcjtcblx0XHRcdFx0dGhpcy5fdHJlZS5mb2N1c1ByZXZpb3VzKHVuZGVmaW5lZCwgdHJ1ZSwgdW5kZWZpbmVkLCAoZSkgPT4ge1xuXHRcdFx0XHRcdGlmIChlLmVsZW1lbnQgaW5zdGFuY2VvZiBRdWlja1BpY2tTZXBhcmF0b3JFbGVtZW50KSB7XG5cdFx0XHRcdFx0XHRpZiAoZm91bmRTZXBhcmF0b3IpIHtcblx0XHRcdFx0XHRcdFx0aWYgKCFmb2N1c0VsZW1lbnQpIHtcblx0XHRcdFx0XHRcdFx0XHRpZiAodGhpcy5fc2VwYXJhdG9yUmVuZGVyZXIuaXNTZXBhcmF0b3JWaXNpYmxlKGUuZWxlbWVudCkpIHtcblx0XHRcdFx0XHRcdFx0XHRcdHRoaXMuX3RyZWUucmV2ZWFsKGUuZWxlbWVudCk7XG5cdFx0XHRcdFx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRcdFx0XHRcdHRoaXMuX3RyZWUucmV2ZWFsKGUuZWxlbWVudCwgMCk7XG5cdFx0XHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0XHRcdGZvY3VzRWxlbWVudCA9IGUuZWxlbWVudC5jaGlsZHJlblswXTtcblx0XHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRcdFx0Zm91bmRTZXBhcmF0b3IgPSB0cnVlO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH0gZWxzZSBpZiAoZS5lbGVtZW50IGluc3RhbmNlb2YgUXVpY2tQaWNrSXRlbUVsZW1lbnQpIHtcblx0XHRcdFx0XHRcdGlmICghZm9jdXNFbGVtZW50KSB7XG5cdFx0XHRcdFx0XHRcdGlmIChlLmVsZW1lbnQuc2VwYXJhdG9yKSB7XG5cdFx0XHRcdFx0XHRcdFx0aWYgKHRoaXMuX2l0ZW1SZW5kZXJlci5pc0l0ZW1XaXRoU2VwYXJhdG9yVmlzaWJsZShlLmVsZW1lbnQpKSB7XG5cdFx0XHRcdFx0XHRcdFx0XHR0aGlzLl90cmVlLnJldmVhbChlLmVsZW1lbnQpO1xuXHRcdFx0XHRcdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0XHRcdFx0XHR0aGlzLl90cmVlLnJldmVhbChlLmVsZW1lbnQsIDApO1xuXHRcdFx0XHRcdFx0XHRcdH1cblxuXHRcdFx0XHRcdFx0XHRcdGZvY3VzRWxlbWVudCA9IGUuZWxlbWVudDtcblx0XHRcdFx0XHRcdFx0fSBlbHNlIGlmIChlLmVsZW1lbnQgPT09IHRoaXMuX2VsZW1lbnRUcmVlWzBdKSB7XG5cdFx0XHRcdFx0XHRcdFx0Ly8gV2Ugc2hvdWxkIHN0b3AgYXQgdGhlIGZpcnN0IGl0ZW0gaW4gdGhlIGxpc3QgaWYgaXQncyBhIHJlZ3VsYXIgaXRlbS5cblx0XHRcdFx0XHRcdFx0XHR0aGlzLl90cmVlLnJldmVhbChlLmVsZW1lbnQsIDApO1xuXHRcdFx0XHRcdFx0XHRcdHJldHVybiB0cnVlO1xuXHRcdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdHJldHVybiBmYWxzZTtcblx0XHRcdFx0fSk7XG5cdFx0XHRcdGlmIChmb2N1c0VsZW1lbnQpIHtcblx0XHRcdFx0XHR0aGlzLl90cmVlLnNldEZvY3VzKFtmb2N1c0VsZW1lbnRdKTtcblx0XHRcdFx0fVxuXHRcdFx0XHRicmVhaztcblx0XHRcdH1cblx0XHR9XG5cdH1cblxuXHRjbGVhckZvY3VzKCkge1xuXHRcdHRoaXMuX3RyZWUuc2V0Rm9jdXMoW10pO1xuXHR9XG5cblx0ZG9tRm9jdXMoKSB7XG5cdFx0dGhpcy5fdHJlZS5kb21Gb2N1cygpO1xuXHR9XG5cblx0bGF5b3V0KG1heEhlaWdodD86IG51bWJlcik6IHZvaWQge1xuXHRcdHRoaXMuX3RyZWUuZ2V0SFRNTEVsZW1lbnQoKS5zdHlsZS5tYXhIZWlnaHQgPSBtYXhIZWlnaHQgPyBgJHtcblx0XHRcdC8vIE1ha2Ugc3VyZSBoZWlnaHQgYWxpZ25zIHdpdGggbGlzdCBpdGVtIGhlaWdodHNcblx0XHRcdE1hdGguZmxvb3IobWF4SGVpZ2h0IC8gNDQpICogNDRcblx0XHRcdC8vIEFkZCBzb21lIGV4dHJhIGhlaWdodCBzbyB0aGF0IGl0J3MgY2xlYXIgdGhlcmUncyBtb3JlIHRvIHNjcm9sbFxuXHRcdFx0KyA2XG5cdFx0XHR9cHhgIDogJyc7XG5cdFx0dGhpcy5fdHJlZS5sYXlvdXQoKTtcblx0fVxuXG5cdGZpbHRlcihxdWVyeTogc3RyaW5nKTogYm9vbGVhbiB7XG5cdFx0dGhpcy5fbGFzdFF1ZXJ5U3RyaW5nID0gcXVlcnk7XG5cdFx0aWYgKCEodGhpcy5fc29ydEJ5TGFiZWwgfHwgdGhpcy5fbWF0Y2hPbkxhYmVsIHx8IHRoaXMuX21hdGNoT25EZXNjcmlwdGlvbiB8fCB0aGlzLl9tYXRjaE9uRGV0YWlsKSkge1xuXHRcdFx0dGhpcy5fdHJlZS5sYXlvdXQoKTtcblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cblx0XHRjb25zdCBxdWVyeVdpdGhXaGl0ZXNwYWNlID0gcXVlcnk7XG5cdFx0cXVlcnkgPSBxdWVyeS50cmltKCk7XG5cblx0XHQvLyBSZXNldCBmaWx0ZXJpbmdcblx0XHRpZiAoIXF1ZXJ5IHx8ICEodGhpcy5tYXRjaE9uTGFiZWwgfHwgdGhpcy5tYXRjaE9uRGVzY3JpcHRpb24gfHwgdGhpcy5tYXRjaE9uRGV0YWlsKSkge1xuXHRcdFx0dGhpcy5faXRlbUVsZW1lbnRzLmZvckVhY2goZWxlbWVudCA9PiB7XG5cdFx0XHRcdGVsZW1lbnQubGFiZWxIaWdobGlnaHRzID0gdW5kZWZpbmVkO1xuXHRcdFx0XHRlbGVtZW50LmRlc2NyaXB0aW9uSGlnaGxpZ2h0cyA9IHVuZGVmaW5lZDtcblx0XHRcdFx0ZWxlbWVudC5kZXRhaWxIaWdobGlnaHRzID0gdW5kZWZpbmVkO1xuXHRcdFx0XHRlbGVtZW50LmhpZGRlbiA9IGZhbHNlO1xuXHRcdFx0XHRjb25zdCBwcmV2aW91cyA9IGVsZW1lbnQuaW5kZXggJiYgdGhpcy5faW5wdXRFbGVtZW50c1tlbGVtZW50LmluZGV4IC0gMV07XG5cdFx0XHRcdGlmIChlbGVtZW50Lml0ZW0pIHtcblx0XHRcdFx0XHRlbGVtZW50LnNlcGFyYXRvciA9IHByZXZpb3VzICYmIHByZXZpb3VzLnR5cGUgPT09ICdzZXBhcmF0b3InICYmICFwcmV2aW91cy5idXR0b25zID8gcHJldmlvdXMgOiB1bmRlZmluZWQ7XG5cdFx0XHRcdH1cblx0XHRcdH0pO1xuXHRcdH1cblxuXHRcdC8vIEZpbHRlciBieSB2YWx1ZSAoc2luY2Ugd2Ugc3VwcG9ydCBpY29ucyBpbiBsYWJlbHMsIHVzZSAkKC4uKSBhd2FyZSBmdXp6eSBtYXRjaGluZylcblx0XHRlbHNlIHtcblx0XHRcdGxldCBjdXJyZW50U2VwYXJhdG9yOiBJUXVpY2tQaWNrU2VwYXJhdG9yIHwgdW5kZWZpbmVkO1xuXHRcdFx0dGhpcy5faXRlbUVsZW1lbnRzLmZvckVhY2goZWxlbWVudCA9PiB7XG5cdFx0XHRcdGxldCBsYWJlbEhpZ2hsaWdodHM6IElNYXRjaFtdIHwgdW5kZWZpbmVkO1xuXHRcdFx0XHRpZiAodGhpcy5tYXRjaE9uTGFiZWxNb2RlID09PSAnZnV6enknKSB7XG5cdFx0XHRcdFx0bGFiZWxIaWdobGlnaHRzID0gdGhpcy5tYXRjaE9uTGFiZWwgPyBtYXRjaGVzRnV6enlJY29uQXdhcmUocXVlcnksIHBhcnNlTGFiZWxXaXRoSWNvbnMoZWxlbWVudC5zYW5lTGFiZWwpKSA/PyB1bmRlZmluZWQgOiB1bmRlZmluZWQ7XG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0bGFiZWxIaWdobGlnaHRzID0gdGhpcy5tYXRjaE9uTGFiZWwgPyBtYXRjaGVzQ29udGlndW91c0ljb25Bd2FyZShxdWVyeVdpdGhXaGl0ZXNwYWNlLCBwYXJzZUxhYmVsV2l0aEljb25zKGVsZW1lbnQuc2FuZUxhYmVsKSkgPz8gdW5kZWZpbmVkIDogdW5kZWZpbmVkO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGNvbnN0IGRlc2NyaXB0aW9uSGlnaGxpZ2h0cyA9IHRoaXMubWF0Y2hPbkRlc2NyaXB0aW9uID8gbWF0Y2hlc0Z1enp5SWNvbkF3YXJlKHF1ZXJ5LCBwYXJzZUxhYmVsV2l0aEljb25zKGVsZW1lbnQuc2FuZURlc2NyaXB0aW9uIHx8ICcnKSkgPz8gdW5kZWZpbmVkIDogdW5kZWZpbmVkO1xuXHRcdFx0XHRjb25zdCBkZXRhaWxIaWdobGlnaHRzID0gdGhpcy5tYXRjaE9uRGV0YWlsID8gbWF0Y2hlc0Z1enp5SWNvbkF3YXJlKHF1ZXJ5LCBwYXJzZUxhYmVsV2l0aEljb25zKGVsZW1lbnQuc2FuZURldGFpbCB8fCAnJykpID8/IHVuZGVmaW5lZCA6IHVuZGVmaW5lZDtcblxuXHRcdFx0XHRpZiAobGFiZWxIaWdobGlnaHRzIHx8IGRlc2NyaXB0aW9uSGlnaGxpZ2h0cyB8fCBkZXRhaWxIaWdobGlnaHRzKSB7XG5cdFx0XHRcdFx0ZWxlbWVudC5sYWJlbEhpZ2hsaWdodHMgPSBsYWJlbEhpZ2hsaWdodHM7XG5cdFx0XHRcdFx0ZWxlbWVudC5kZXNjcmlwdGlvbkhpZ2hsaWdodHMgPSBkZXNjcmlwdGlvbkhpZ2hsaWdodHM7XG5cdFx0XHRcdFx0ZWxlbWVudC5kZXRhaWxIaWdobGlnaHRzID0gZGV0YWlsSGlnaGxpZ2h0cztcblx0XHRcdFx0XHRlbGVtZW50LmhpZGRlbiA9IGZhbHNlO1xuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdGVsZW1lbnQubGFiZWxIaWdobGlnaHRzID0gdW5kZWZpbmVkO1xuXHRcdFx0XHRcdGVsZW1lbnQuZGVzY3JpcHRpb25IaWdobGlnaHRzID0gdW5kZWZpbmVkO1xuXHRcdFx0XHRcdGVsZW1lbnQuZGV0YWlsSGlnaGxpZ2h0cyA9IHVuZGVmaW5lZDtcblx0XHRcdFx0XHRlbGVtZW50LmhpZGRlbiA9IGVsZW1lbnQuaXRlbSA/ICFlbGVtZW50Lml0ZW0uYWx3YXlzU2hvdyA6IHRydWU7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHQvLyBFbnN1cmUgc2VwYXJhdG9ycyBhcmUgZmlsdGVyZWQgb3V0IGZpcnN0IGJlZm9yZSBkZWNpZGluZyBpZiB3ZSBuZWVkIHRvIGJyaW5nIHRoZW0gYmFja1xuXHRcdFx0XHRpZiAoZWxlbWVudC5pdGVtKSB7XG5cdFx0XHRcdFx0ZWxlbWVudC5zZXBhcmF0b3IgPSB1bmRlZmluZWQ7XG5cdFx0XHRcdH0gZWxzZSBpZiAoZWxlbWVudC5zZXBhcmF0b3IpIHtcblx0XHRcdFx0XHRlbGVtZW50LmhpZGRlbiA9IHRydWU7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHQvLyB3ZSBjYW4gc2hvdyB0aGUgc2VwYXJhdG9yIHVubGVzcyB0aGUgbGlzdCBnZXRzIHNvcnRlZCBieSBtYXRjaFxuXHRcdFx0XHRpZiAoIXRoaXMuc29ydEJ5TGFiZWwpIHtcblx0XHRcdFx0XHRjb25zdCBwcmV2aW91cyA9IGVsZW1lbnQuaW5kZXggJiYgdGhpcy5faW5wdXRFbGVtZW50c1tlbGVtZW50LmluZGV4IC0gMV0gfHwgdW5kZWZpbmVkO1xuXHRcdFx0XHRcdGlmIChwcmV2aW91cz8udHlwZSA9PT0gJ3NlcGFyYXRvcicgJiYgIXByZXZpb3VzLmJ1dHRvbnMpIHtcblx0XHRcdFx0XHRcdGN1cnJlbnRTZXBhcmF0b3IgPSBwcmV2aW91cztcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0aWYgKGN1cnJlbnRTZXBhcmF0b3IgJiYgIWVsZW1lbnQuaGlkZGVuKSB7XG5cdFx0XHRcdFx0XHRlbGVtZW50LnNlcGFyYXRvciA9IGN1cnJlbnRTZXBhcmF0b3I7XG5cdFx0XHRcdFx0XHRjdXJyZW50U2VwYXJhdG9yID0gdW5kZWZpbmVkO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0fSk7XG5cdFx0fVxuXG5cdFx0dGhpcy5fc2V0RWxlbWVudHNUb1RyZWUodGhpcy5fc29ydEJ5TGFiZWwgJiYgcXVlcnlcblx0XHRcdC8vIFdlIGRvbid0IHJlbmRlciBhbnkgc2VwYXJhdG9ycyBpZiB3ZSdyZSBzb3J0aW5nIHNvIGp1c3QgcmVuZGVyIHRoZSBlbGVtZW50c1xuXHRcdFx0PyB0aGlzLl9pdGVtRWxlbWVudHNcblx0XHRcdC8vIFJlbmRlciB0aGUgZnVsbCB0cmVlXG5cdFx0XHQ6IHRoaXMuX2VsZW1lbnRUcmVlXG5cdFx0KTtcblx0XHR0aGlzLl90cmVlLmxheW91dCgpO1xuXHRcdHJldHVybiB0cnVlO1xuXHR9XG5cblx0dG9nZ2xlQ2hlY2tib3goKSB7XG5cdFx0dGhpcy5fZWxlbWVudENoZWNrZWRFdmVudEJ1ZmZlcmVyLmJ1ZmZlckV2ZW50cygoKSA9PiB7XG5cdFx0XHRjb25zdCBlbGVtZW50cyA9IHRoaXMuX3RyZWUuZ2V0Rm9jdXMoKS5maWx0ZXIoKGUpOiBlIGlzIFF1aWNrUGlja0l0ZW1FbGVtZW50ID0+IGUgaW5zdGFuY2VvZiBRdWlja1BpY2tJdGVtRWxlbWVudCk7XG5cdFx0XHRjb25zdCBhbGxDaGVja2VkID0gdGhpcy5fYWxsVmlzaWJsZUNoZWNrZWQoZWxlbWVudHMpO1xuXHRcdFx0Zm9yIChjb25zdCBlbGVtZW50IG9mIGVsZW1lbnRzKSB7XG5cdFx0XHRcdGlmICghZWxlbWVudC5jaGVja2JveERpc2FibGVkKSB7XG5cdFx0XHRcdFx0Ly8gV291bGQgZmlyZSBhbiBldmVudCBpZiB3ZSBkaWRuJ3QgaGF2ZSB0aGUgZmxhZyBzZXRcblx0XHRcdFx0XHRlbGVtZW50LmNoZWNrZWQgPSAhYWxsQ2hlY2tlZDtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH0pO1xuXHR9XG5cblx0c3R5bGUoc3R5bGVzOiBJTGlzdFN0eWxlcykge1xuXHRcdHRoaXMuX3RyZWUuc3R5bGUoc3R5bGVzKTtcblx0fVxuXG5cdHRvZ2dsZUhvdmVyKCkge1xuXHRcdGNvbnN0IGZvY3VzZWQ6IElRdWlja1BpY2tFbGVtZW50IHwgbnVsbCA9IHRoaXMuX3RyZWUuZ2V0Rm9jdXMoKVswXTtcblx0XHRpZiAoIWZvY3VzZWQ/LnNhbmVUb29sdGlwIHx8ICEoZm9jdXNlZCBpbnN0YW5jZW9mIFF1aWNrUGlja0l0ZW1FbGVtZW50KSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdC8vIGlmIHRoZXJlJ3MgYSBob3ZlciBhbHJlYWR5LCBoaWRlIGl0ICh0b2dnbGUgb2ZmKVxuXHRcdGlmICh0aGlzLl9sYXN0SG92ZXIgJiYgIXRoaXMuX2xhc3RIb3Zlci5pc0Rpc3Bvc2VkKSB7XG5cdFx0XHR0aGlzLl9sYXN0SG92ZXIuZGlzcG9zZSgpO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdC8vIElmIHRoZXJlIGlzIG5vIGhvdmVyLCBzaG93IGl0ICh0b2dnbGUgb24pXG5cdFx0dGhpcy5zaG93SG92ZXIoZm9jdXNlZCk7XG5cdFx0Y29uc3Qgc3RvcmUgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cdFx0c3RvcmUuYWRkKHRoaXMuX3RyZWUub25EaWRDaGFuZ2VGb2N1cyhlID0+IHtcblx0XHRcdGlmIChlLmVsZW1lbnRzWzBdIGluc3RhbmNlb2YgUXVpY2tQaWNrSXRlbUVsZW1lbnQpIHtcblx0XHRcdFx0dGhpcy5zaG93SG92ZXIoZS5lbGVtZW50c1swXSk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXHRcdGlmICh0aGlzLl9sYXN0SG92ZXIpIHtcblx0XHRcdHN0b3JlLmFkZCh0aGlzLl9sYXN0SG92ZXIpO1xuXHRcdH1cblx0XHR0aGlzLl9lbGVtZW50RGlzcG9zYWJsZS5hZGQoc3RvcmUpO1xuXHR9XG5cblx0Ly8jZW5kcmVnaW9uXG5cblx0Ly8jcmVnaW9uIHByaXZhdGUgbWV0aG9kc1xuXG5cdHByaXZhdGUgX3NldEVsZW1lbnRzVG9UcmVlKGVsZW1lbnRzOiBJUXVpY2tQaWNrRWxlbWVudFtdKSB7XG5cdFx0Y29uc3QgdHJlZUVsZW1lbnRzID0gbmV3IEFycmF5PElPYmplY3RUcmVlRWxlbWVudDxJUXVpY2tQaWNrRWxlbWVudD4+KCk7XG5cdFx0Zm9yIChjb25zdCBlbGVtZW50IG9mIGVsZW1lbnRzKSB7XG5cdFx0XHRpZiAoZWxlbWVudCBpbnN0YW5jZW9mIFF1aWNrUGlja1NlcGFyYXRvckVsZW1lbnQpIHtcblx0XHRcdFx0dHJlZUVsZW1lbnRzLnB1c2goe1xuXHRcdFx0XHRcdGVsZW1lbnQsXG5cdFx0XHRcdFx0Y29sbGFwc2libGU6IGZhbHNlLFxuXHRcdFx0XHRcdGNvbGxhcHNlZDogZmFsc2UsXG5cdFx0XHRcdFx0Y2hpbGRyZW46IGVsZW1lbnQuY2hpbGRyZW4ubWFwKGUgPT4gKHtcblx0XHRcdFx0XHRcdGVsZW1lbnQ6IGUsXG5cdFx0XHRcdFx0XHRjb2xsYXBzaWJsZTogZmFsc2UsXG5cdFx0XHRcdFx0XHRjb2xsYXBzZWQ6IGZhbHNlLFxuXHRcdFx0XHRcdH0pKSxcblx0XHRcdFx0fSk7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHR0cmVlRWxlbWVudHMucHVzaCh7XG5cdFx0XHRcdFx0ZWxlbWVudCxcblx0XHRcdFx0XHRjb2xsYXBzaWJsZTogZmFsc2UsXG5cdFx0XHRcdFx0Y29sbGFwc2VkOiBmYWxzZSxcblx0XHRcdFx0fSk7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdHRoaXMuX3RyZWUuc2V0Q2hpbGRyZW4obnVsbCwgdHJlZUVsZW1lbnRzKTtcblx0fVxuXG5cdHByaXZhdGUgX2FsbFZpc2libGVDaGVja2VkKGVsZW1lbnRzOiBRdWlja1BpY2tJdGVtRWxlbWVudFtdLCB3aGVuTm9uZVZpc2libGUgPSB0cnVlKSB7XG5cdFx0Zm9yIChsZXQgaSA9IDAsIG4gPSBlbGVtZW50cy5sZW5ndGg7IGkgPCBuOyBpKyspIHtcblx0XHRcdGNvbnN0IGVsZW1lbnQgPSBlbGVtZW50c1tpXTtcblx0XHRcdGlmICghZWxlbWVudC5oaWRkZW4gJiYgZWxlbWVudC5pdGVtLnBpY2thYmxlICE9PSBmYWxzZSkge1xuXHRcdFx0XHRpZiAoIWVsZW1lbnQuY2hlY2tlZCkge1xuXHRcdFx0XHRcdHJldHVybiBmYWxzZTtcblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHR3aGVuTm9uZVZpc2libGUgPSB0cnVlO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fVxuXHRcdHJldHVybiB3aGVuTm9uZVZpc2libGU7XG5cdH1cblxuXHRwcml2YXRlIF91cGRhdGVDaGVja2VkT2JzZXJ2YWJsZXMoKSB7XG5cdFx0dHJhbnNhY3Rpb24oKHR4KSA9PiB7XG5cdFx0XHR0aGlzLl9hbGxWaXNpYmxlQ2hlY2tlZE9ic2VydmFibGUuc2V0KHRoaXMuX2FsbFZpc2libGVDaGVja2VkKHRoaXMuX2l0ZW1FbGVtZW50cywgZmFsc2UpLCB0eCk7XG5cdFx0XHRjb25zdCBjaGVja2VkQ291bnQgPSB0aGlzLl9pdGVtRWxlbWVudHMuZmlsdGVyKGVsZW1lbnQgPT4gZWxlbWVudC5jaGVja2VkKS5sZW5ndGg7XG5cdFx0XHR0aGlzLl9jaGVja2VkQ291bnRPYnNlcnZhYmxlLnNldChjaGVja2VkQ291bnQsIHR4KTtcblx0XHRcdHRoaXMuX2NoZWNrZWRFbGVtZW50c09ic2VydmFibGUuc2V0KHRoaXMuZ2V0Q2hlY2tlZEVsZW1lbnRzKCksIHR4KTtcblx0XHR9KTtcblx0fVxuXG5cdC8qKlxuXHQgKiBEaXNwb3NlcyBvZiB0aGUgaG92ZXIgYW5kIHNob3dzIGEgbmV3IG9uZSBmb3IgdGhlIGdpdmVuIGluZGV4IGlmIGl0IGhhcyBhIHRvb2x0aXAuXG5cdCAqIEBwYXJhbSBlbGVtZW50IFRoZSBlbGVtZW50IHRvIHNob3cgdGhlIGhvdmVyIGZvclxuXHQgKi9cblx0cHJpdmF0ZSBzaG93SG92ZXIoZWxlbWVudDogUXVpY2tQaWNrSXRlbUVsZW1lbnQpOiB2b2lkIHtcblx0XHRpZiAodGhpcy5fbGFzdEhvdmVyICYmICF0aGlzLl9sYXN0SG92ZXIuaXNEaXNwb3NlZCkge1xuXHRcdFx0dGhpcy5ob3ZlckRlbGVnYXRlLm9uRGlkSGlkZUhvdmVyPy4oKTtcblx0XHRcdHRoaXMuX2xhc3RIb3Zlcj8uZGlzcG9zZSgpO1xuXHRcdH1cblxuXHRcdGlmICghZWxlbWVudC5lbGVtZW50IHx8ICFlbGVtZW50LnNhbmVUb29sdGlwKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdHRoaXMuX2xhc3RIb3ZlciA9IHRoaXMuaG92ZXJEZWxlZ2F0ZS5zaG93SG92ZXIoe1xuXHRcdFx0Y29udGVudDogZWxlbWVudC5zYW5lVG9vbHRpcCxcblx0XHRcdHRhcmdldDogZWxlbWVudC5lbGVtZW50LFxuXHRcdFx0bGlua0hhbmRsZXI6ICh1cmwpID0+IHtcblx0XHRcdFx0dGhpcy5saW5rT3BlbmVyRGVsZWdhdGUodXJsKTtcblx0XHRcdH0sXG5cdFx0XHRhcHBlYXJhbmNlOiB7XG5cdFx0XHRcdHNob3dQb2ludGVyOiB0cnVlLFxuXHRcdFx0fSxcblx0XHRcdGNvbnRhaW5lcjogdGhpcy5fY29udGFpbmVyLFxuXHRcdFx0cG9zaXRpb246IHtcblx0XHRcdFx0aG92ZXJQb3NpdGlvbjogSG92ZXJQb3NpdGlvbi5SSUdIVFxuXHRcdFx0fVxuXHRcdH0sIGZhbHNlKTtcblx0fVxufVxuXG5mdW5jdGlvbiBtYXRjaGVzQ29udGlndW91c0ljb25Bd2FyZShxdWVyeTogc3RyaW5nLCB0YXJnZXQ6IElQYXJzZWRMYWJlbFdpdGhJY29ucyk6IElNYXRjaFtdIHwgbnVsbCB7XG5cblx0Y29uc3QgeyB0ZXh0LCBpY29uT2Zmc2V0cyB9ID0gdGFyZ2V0O1xuXG5cdC8vIFJldHVybiBlYXJseSBpZiB0aGVyZSBhcmUgbm8gaWNvbiBtYXJrZXJzIGluIHRoZSB3b3JkIHRvIG1hdGNoIGFnYWluc3Rcblx0aWYgKCFpY29uT2Zmc2V0cyB8fCBpY29uT2Zmc2V0cy5sZW5ndGggPT09IDApIHtcblx0XHRyZXR1cm4gbWF0Y2hlc0NvbnRpZ3VvdXMocXVlcnksIHRleHQpO1xuXHR9XG5cblx0Ly8gVHJpbSB0aGUgd29yZCB0byBtYXRjaCBhZ2FpbnN0IGJlY2F1c2UgaXQgY291bGQgaGF2ZSBsZWFkaW5nXG5cdC8vIHdoaXRlc3BhY2Ugbm93IGlmIHRoZSB3b3JkIHN0YXJ0ZWQgd2l0aCBhbiBpY29uXG5cdGNvbnN0IHdvcmRUb01hdGNoQWdhaW5zdFdpdGhvdXRJY29uc1RyaW1tZWQgPSBsdHJpbSh0ZXh0LCAnICcpO1xuXHRjb25zdCBsZWFkaW5nV2hpdGVzcGFjZU9mZnNldCA9IHRleHQubGVuZ3RoIC0gd29yZFRvTWF0Y2hBZ2FpbnN0V2l0aG91dEljb25zVHJpbW1lZC5sZW5ndGg7XG5cblx0Ly8gbWF0Y2ggb24gdmFsdWUgd2l0aG91dCBpY29uXG5cdGNvbnN0IG1hdGNoZXMgPSBtYXRjaGVzQ29udGlndW91cyhxdWVyeSwgd29yZFRvTWF0Y2hBZ2FpbnN0V2l0aG91dEljb25zVHJpbW1lZCk7XG5cblx0Ly8gTWFwIG1hdGNoZXMgYmFjayB0byBvZmZzZXRzIHdpdGggaWNvbiBhbmQgdHJpbW1pbmdcblx0aWYgKG1hdGNoZXMpIHtcblx0XHRmb3IgKGNvbnN0IG1hdGNoIG9mIG1hdGNoZXMpIHtcblx0XHRcdGNvbnN0IGljb25PZmZzZXQgPSBpY29uT2Zmc2V0c1ttYXRjaC5zdGFydCArIGxlYWRpbmdXaGl0ZXNwYWNlT2Zmc2V0XSAvKiBpY29uIG9mZnNldHMgYXQgaW5kZXggKi8gKyBsZWFkaW5nV2hpdGVzcGFjZU9mZnNldCAvKiBvdmVyYWxsIGxlYWRpbmcgd2hpdGVzcGFjZSBvZmZzZXQgKi87XG5cdFx0XHRtYXRjaC5zdGFydCArPSBpY29uT2Zmc2V0O1xuXHRcdFx0bWF0Y2guZW5kICs9IGljb25PZmZzZXQ7XG5cdFx0fVxuXHR9XG5cblx0cmV0dXJuIG1hdGNoZXM7XG59XG5cbmZ1bmN0aW9uIG1hdGNoZXNDb250aWd1b3VzKHdvcmQ6IHN0cmluZywgd29yZFRvTWF0Y2hBZ2FpbnN0OiBzdHJpbmcpOiBJTWF0Y2hbXSB8IG51bGwge1xuXHRjb25zdCBtYXRjaEluZGV4ID0gd29yZFRvTWF0Y2hBZ2FpbnN0LnRvTG93ZXJDYXNlKCkuaW5kZXhPZih3b3JkLnRvTG93ZXJDYXNlKCkpO1xuXHRpZiAobWF0Y2hJbmRleCAhPT0gLTEpIHtcblx0XHRyZXR1cm4gW3sgc3RhcnQ6IG1hdGNoSW5kZXgsIGVuZDogbWF0Y2hJbmRleCArIHdvcmQubGVuZ3RoIH1dO1xuXHR9XG5cdHJldHVybiBudWxsO1xufVxuXG5mdW5jdGlvbiBjb21wYXJlRW50cmllcyhlbGVtZW50QTogSVF1aWNrUGlja0VsZW1lbnQsIGVsZW1lbnRCOiBJUXVpY2tQaWNrRWxlbWVudCwgbG9va0Zvcjogc3RyaW5nKTogbnVtYmVyIHtcblxuXHRjb25zdCBsYWJlbEhpZ2hsaWdodHNBID0gZWxlbWVudEEubGFiZWxIaWdobGlnaHRzIHx8IFtdO1xuXHRjb25zdCBsYWJlbEhpZ2hsaWdodHNCID0gZWxlbWVudEIubGFiZWxIaWdobGlnaHRzIHx8IFtdO1xuXHRpZiAobGFiZWxIaWdobGlnaHRzQS5sZW5ndGggJiYgIWxhYmVsSGlnaGxpZ2h0c0IubGVuZ3RoKSB7XG5cdFx0cmV0dXJuIC0xO1xuXHR9XG5cblx0aWYgKCFsYWJlbEhpZ2hsaWdodHNBLmxlbmd0aCAmJiBsYWJlbEhpZ2hsaWdodHNCLmxlbmd0aCkge1xuXHRcdHJldHVybiAxO1xuXHR9XG5cblx0aWYgKGxhYmVsSGlnaGxpZ2h0c0EubGVuZ3RoID09PSAwICYmIGxhYmVsSGlnaGxpZ2h0c0IubGVuZ3RoID09PSAwKSB7XG5cdFx0cmV0dXJuIDA7XG5cdH1cblxuXHRyZXR1cm4gY29tcGFyZUFueXRoaW5nKGVsZW1lbnRBLnNhbmVTb3J0TGFiZWwsIGVsZW1lbnRCLnNhbmVTb3J0TGFiZWwsIGxvb2tGb3IpO1xufVxuIl0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7Ozs7QUFLQSxZQUFZLFdBQVc7QUFDdkIsWUFBWSxTQUFTO0FBRXJCLFNBQVMsZUFBZTtBQUl4QixTQUFTLHFCQUFxQjtBQUM5QixTQUFpQyxpQkFBaUI7QUFDbEQsU0FBUyx1QkFBdUI7QUFHaEMsU0FBUyxVQUFVLDBDQUF5RDtBQUM1RSxTQUFTLDBCQUEwQjtBQUNuQyxTQUF1RCxzQkFBc0I7QUFDN0UsU0FBUyxjQUFjO0FBQ3ZCLFNBQVMsbUJBQW1CLHdCQUF3QjtBQUNwRCxTQUFTLHVCQUF1QjtBQUNoQyxTQUFTLGVBQWU7QUFDeEIsU0FBUywyQkFBMkI7QUFDcEMsU0FBUyxTQUFTLE9BQU8scUJBQTRDO0FBR3JFLFNBQWdDLHFCQUFxQix1QkFBdUIsMkJBQTJCO0FBQ3ZHLFNBQVMsWUFBWTtBQUNyQixTQUFTLFlBQVksaUJBQWlCLHlCQUF5QjtBQUMvRCxTQUFTLGlCQUFpQixxQkFBcUIsbUJBQW1CO0FBQ2xFLFNBQVMsVUFBVTtBQUNuQixTQUFTLFFBQVEs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
