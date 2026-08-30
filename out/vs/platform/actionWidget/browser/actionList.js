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
import * as dom from "../../../base/browser/dom.js";
import { renderMarkdown } from "../../../base/browser/markdownRenderer.js";
import { ActionBar } from "../../../base/browser/ui/actionbar/actionbar.js";
import { getAnchorRect } from "../../../base/browser/ui/contextview/contextview.js";
import { KeybindingLabel } from "../../../base/browser/ui/keybindingLabel/keybindingLabel.js";
import { Toggle } from "../../../base/browser/ui/toggle/toggle.js";
import { List } from "../../../base/browser/ui/list/listWidget.js";
import { SubmenuAction, toAction } from "../../../base/common/actions.js";
import { CancellationTokenSource } from "../../../base/common/cancellation.js";
import { Codicon } from "../../../base/common/codicons.js";
import { Emitter } from "../../../base/common/event.js";
import { isMarkdownString, MarkdownString } from "../../../base/common/htmlContent.js";
import { AnchorPosition } from "../../../base/common/layout.js";
import { Disposable, DisposableStore, MutableDisposable, toDisposable } from "../../../base/common/lifecycle.js";
import { OS } from "../../../base/common/platform.js";
import { ThemeIcon } from "../../../base/common/themables.js";
import { URI } from "../../../base/common/uri.js";
import "./actionWidget.css";
import { localize } from "../../../nls.js";
import { IContextViewService } from "../../contextview/browser/contextView.js";
import { IKeybindingService } from "../../keybinding/common/keybinding.js";
import { IOpenerService } from "../../opener/common/opener.js";
import { Link } from "../../opener/browser/link.js";
import { defaultListStyles } from "../../theme/browser/defaultStyles.js";
import { asCssVariable } from "../../theme/common/colorRegistry.js";
import { ILayoutService } from "../../layout/browser/layoutService.js";
import { IInstantiationService } from "../../instantiation/common/instantiation.js";
const acceptSelectedActionCommand = "acceptSelectedCodeAction";
const previewSelectedActionCommand = "previewSelectedCodeAction";
var ActionListItemKind = /* @__PURE__ */ ((ActionListItemKind2) => {
  ActionListItemKind2["Action"] = "action";
  ActionListItemKind2["Header"] = "header";
  ActionListItemKind2["Separator"] = "separator";
  return ActionListItemKind2;
})(ActionListItemKind || {});
class HeaderRenderer {
  get templateId() {
    return "header" /* Header */;
  }
  renderTemplate(container) {
    container.classList.add("group-header");
    const text = document.createElement("span");
    container.append(text);
    return { container, text };
  }
  renderElement(element, _index, templateData) {
    templateData.text.textContent = element.group?.title ?? element.label ?? "";
  }
  disposeTemplate(_templateData) {
  }
}
class SeparatorRenderer {
  get templateId() {
    return "separator" /* Separator */;
  }
  renderTemplate(container) {
    container.classList.add("separator");
    const text = document.createElement("span");
    container.append(text);
    return { container, text };
  }
  renderElement(element, _index, templateData) {
    templateData.text.textContent = element.label ?? "";
  }
  disposeTemplate(_templateData) {
  }
}
let ActionItemRenderer = class {
  constructor(_supportsPreview, _onRemoveItem, _onShowSubmenu, _hasAnySubmenuActions, _groupTitleByIndex, _linkHandler, _hideDefaultKeybindingTooltip, _keybindingService, _openerService) {
    this._supportsPreview = _supportsPreview;
    this._onRemoveItem = _onRemoveItem;
    this._onShowSubmenu = _onShowSubmenu;
    this._hasAnySubmenuActions = _hasAnySubmenuActions;
    this._groupTitleByIndex = _groupTitleByIndex;
    this._linkHandler = _linkHandler;
    this._hideDefaultKeybindingTooltip = _hideDefaultKeybindingTooltip;
    this._keybindingService = _keybindingService;
    this._openerService = _openerService;
  }
  get templateId() {
    return "action" /* Action */;
  }
  renderTemplate(container) {
    container.classList.add(this.templateId);
    const icon = document.createElement("div");
    icon.className = "icon";
    container.append(icon);
    const text = document.createElement("span");
    text.className = "title";
    container.append(text);
    const badge = document.createElement("span");
    badge.className = "action-item-badge";
    container.append(badge);
    const description = document.createElement("span");
    description.className = "description";
    container.append(description);
    const groupTitle = document.createElement("span");
    groupTitle.className = "group-title";
    container.append(groupTitle);
    const detail = document.createElement("span");
    detail.className = "detail";
    container.append(detail);
    const keybinding = new KeybindingLabel(container, OS);
    const toolbar = document.createElement("div");
    toolbar.className = "action-list-item-toolbar";
    container.append(toolbar);
    const submenuIndicator = document.createElement("div");
    submenuIndicator.className = "action-list-submenu-indicator";
    container.append(submenuIndicator);
    const inlineToggleContainer = document.createElement("div");
    inlineToggleContainer.className = "action-list-item-inline-toggle";
    container.append(inlineToggleContainer);
    const elementDisposables = new DisposableStore();
    return { container, icon, text, detail, badge, description, groupTitle, keybinding, toolbar, submenuIndicator, inlineToggleContainer, elementDisposables };
  }
  renderElement(element, _index, data) {
    data.elementDisposables.clear();
    if (element.group?.icon) {
      data.icon.className = ThemeIcon.asClassName(element.group.icon);
      if (element.group.icon.color) {
        data.icon.style.color = asCssVariable(element.group.icon.color.id);
      }
    } else {
      data.icon.className = ThemeIcon.asClassName(Codicon.lightBulb);
      data.icon.style.color = "var(--vscode-editorLightBulb-foreground)";
    }
    if (!element.item || !element.label) {
      return;
    }
    dom.setVisibility(!element.hideIcon, data.icon);
    if (element.isSectionToggle) {
      const expanded = element.group?.icon === Codicon.chevronDown;
      data.container.setAttribute("aria-expanded", String(expanded));
    } else {
      data.container.removeAttribute("aria-expanded");
    }
    if (data.previousClassName) {
      data.container.classList.remove(data.previousClassName);
    }
    data.container.classList.toggle("action-list-custom", !!element.className);
    if (element.className) {
      data.container.classList.add(element.className);
    }
    data.previousClassName = element.className;
    data.text.textContent = stripNewlines(element.label);
    if (element.badge) {
      data.badge.textContent = element.badge;
      data.badge.style.display = "";
    } else {
      data.badge.textContent = "";
      data.badge.style.display = "none";
    }
    if (element.keybinding) {
      data.description.textContent = element.keybinding.getLabel();
      data.description.style.display = "inline";
      data.description.style.letterSpacing = "0.5px";
    } else if (element.description) {
      dom.clearNode(data.description);
      if (typeof element.description === "string") {
        data.description.textContent = stripNewlines(element.description);
      } else {
        const rendered = renderMarkdown(element.description, {
          actionHandler: (content) => {
            const uri = URI.parse(content);
            if (this._linkHandler) {
              this._linkHandler(uri, element);
            } else {
              void this._openerService.open(uri, { allowCommands: true });
            }
          }
        });
        data.elementDisposables.add(rendered);
        data.description.appendChild(rendered.element);
      }
      data.description.style.display = "inline";
    } else {
      data.description.textContent = "";
      data.description.style.display = "none";
    }
    const groupTitleText = this._groupTitleByIndex.get(_index);
    if (groupTitleText) {
      data.groupTitle.textContent = groupTitleText;
      data.groupTitle.style.display = "";
    } else {
      data.groupTitle.textContent = "";
      data.groupTitle.style.display = "none";
    }
    if (element.detail) {
      data.detail.textContent = stripNewlines(element.detail);
      data.detail.style.display = "";
    } else {
      data.detail.textContent = "";
      data.detail.style.display = "none";
    }
    dom.clearNode(data.inlineToggleContainer);
    if (element.inlineToggle) {
      const inlineToggle = element.inlineToggle;
      const toggleLabel = document.createElement("span");
      toggleLabel.className = "action-list-item-inline-toggle-label";
      toggleLabel.textContent = stripNewlines(inlineToggle.label);
      data.inlineToggleContainer.append(toggleLabel);
      data.inlineToggleContainer.style.display = "";
      data.container.classList.add("has-inline-toggle");
      const toggle = data.elementDisposables.add(new Toggle({
        title: inlineToggle.title ?? inlineToggle.label,
        isChecked: inlineToggle.checked,
        actionClassName: "action-list-inline-switch",
        notFocusable: false,
        inputActiveOptionBorder: void 0,
        inputActiveOptionForeground: void 0,
        inputActiveOptionBackground: void 0
      }));
      data.inlineToggleContainer.append(toggle.domNode);
      data.elementDisposables.add(toggle.onChange(() => inlineToggle.onChange(toggle.checked)));
      data.elementDisposables.add(dom.addDisposableListener(data.inlineToggleContainer, dom.EventType.CLICK, (e) => e.stopPropagation()));
    } else {
      data.inlineToggleContainer.style.display = "none";
      data.container.classList.remove("has-inline-toggle");
    }
    const actionTitle = this._keybindingService.lookupKeybinding(acceptSelectedActionCommand)?.getLabel();
    const previewTitle = this._keybindingService.lookupKeybinding(previewSelectedActionCommand)?.getLabel();
    data.container.classList.toggle("option-disabled", !!element.disabled);
    if (element.hover !== void 0) {
      data.container.title = "";
    } else if (element.tooltip) {
      data.container.title = element.tooltip;
    } else if (element.disabled) {
      data.container.title = element.label;
    } else if (this._hideDefaultKeybindingTooltip) {
      data.container.title = "";
    } else if (actionTitle && previewTitle) {
      if (this._supportsPreview && element.canPreview) {
        data.container.title = localize({ key: "label-preview", comment: ['placeholders are keybindings, e.g "F2 to Apply, Shift+F2 to Preview"'] }, "{0} to Apply, {1} to Preview", actionTitle, previewTitle);
      } else {
        data.container.title = localize({ key: "label", comment: ['placeholder is a keybinding, e.g "F2 to Apply"'] }, "{0} to Apply", actionTitle);
      }
    } else {
      data.container.title = "";
    }
    dom.clearNode(data.toolbar);
    const toolbarActions = [...element.toolbarActions ?? []];
    if (element.onRemove) {
      toolbarActions.push(toAction({
        id: "actionList.remove",
        label: localize("actionList.remove", "Remove"),
        class: ThemeIcon.asClassName(Codicon.close),
        run: async () => {
          await element.onRemove();
          this._onRemoveItem?.(element);
        }
      }));
    }
    data.container.classList.toggle("has-toolbar", toolbarActions.length > 0);
    if (toolbarActions.length > 0) {
      const actionBar = new ActionBar(data.toolbar);
      data.elementDisposables.add(actionBar);
      actionBar.push(toolbarActions, { icon: true, label: false });
    }
    if (element.submenuActions?.length && !element.hover?.content) {
      data.submenuIndicator.className = "action-list-submenu-indicator has-submenu " + ThemeIcon.asClassName(Codicon.chevronRight);
      data.submenuIndicator.style.display = "";
      data.submenuIndicator.style.visibility = "";
      data.elementDisposables.add(dom.addDisposableListener(data.submenuIndicator, dom.EventType.CLICK, (e) => {
        e.stopPropagation();
        this._onShowSubmenu?.(element);
      }));
    } else if (this._hasAnySubmenuActions) {
      data.submenuIndicator.className = "action-list-submenu-indicator";
      data.submenuIndicator.style.display = "";
      data.submenuIndicator.style.visibility = "hidden";
    } else {
      data.submenuIndicator.className = "action-list-submenu-indicator";
      data.submenuIndicator.style.display = "none";
    }
  }
  disposeTemplate(templateData) {
    templateData.keybinding.dispose();
    templateData.elementDisposables.dispose();
  }
};
ActionItemRenderer = __decorateClass([
  __decorateParam(7, IKeybindingService),
  __decorateParam(8, IOpenerService)
], ActionItemRenderer);
class AcceptSelectedEvent extends UIEvent {
  constructor() {
    super("acceptSelectedAction");
  }
}
class PreviewSelectedEvent extends UIEvent {
  constructor() {
    super("previewSelectedAction");
  }
}
function getKeyboardNavigationLabel(item) {
  if (item.kind === "action") {
    return item.label;
  }
  return void 0;
}
let ActionListWidget = class extends Disposable {
  constructor(user, _supportsPreview, items, _delegate, accessibilityProvider, _options, _keybindingService, _openerService, _instantiationService) {
    super();
    this._supportsPreview = _supportsPreview;
    this._delegate = _delegate;
    this._options = _options;
    this._keybindingService = _keybindingService;
    this._openerService = _openerService;
    this._instantiationService = _instantiationService;
    this._headerLineHeight = 24;
    this._separatorLineHeight = 8;
    this.cts = this._register(new CancellationTokenSource());
    this._submenuDisposables = this._register(new DisposableStore());
    this._collapsedSections = /* @__PURE__ */ new Set();
    this._filterText = "";
    this._imeSessionInProgress = false;
    this._suppressHover = false;
    this._hasLaidOut = false;
    this._filterCts = this._register(new MutableDisposable());
    this._groupTitleByIndex = /* @__PURE__ */ new Map();
    this._onDidRequestLayout = this._register(new Emitter());
    /**
     * Fired when the widget's visible item set changes and the parent should
     * re-layout (e.g. after filtering or collapsing a section).
     */
    this.onDidRequestLayout = this._onDidRequestLayout.event;
    this._initialFocusItemId = this._options?.initialFocusItemId;
    this.domNode = document.createElement("div");
    this.domNode.classList.add("actionList");
    if (this._options?.inlineDescription) {
      this.domNode.classList.add("inline-description");
    }
    if (this._options?.className) {
      const classNames = this._options.className.split(/\s+/).filter((className) => className.length > 0);
      if (classNames.length > 0) {
        this.domNode.classList.add(...classNames);
      }
    }
    this._actionLineHeight = 24;
    this._submenuContainer = document.createElement("div");
    this._submenuContainer.className = "action-list-submenu-panel action-widget";
    this._submenuContainer.style.display = "none";
    this._submenuContainer.tabIndex = -1;
    this.domNode.append(this._submenuContainer);
    this._register(dom.addDisposableListener(this._submenuContainer, "mouseenter", () => {
      this._cancelSubmenuHide();
    }));
    this._register(dom.addDisposableListener(this._submenuContainer, "mouseleave", () => {
      this._scheduleSubmenuHide();
    }));
    this._register(dom.addDisposableListener(this.domNode, dom.EventType.MOUSE_LEAVE, () => {
      this._cancelSubmenuShow();
    }));
    this._register(toDisposable(() => {
      this._cancelSubmenuHide();
      this._cancelSubmenuShow();
    }));
    if (this._options?.collapsedByDefault) {
      for (const section of this._options.collapsedByDefault) {
        this._collapsedSections.add(section);
      }
    }
    const virtualDelegate = {
      getHeight: (element) => {
        return this._getItemHeight(element);
      },
      getTemplateId: (element) => element.kind
    };
    const reserveSubmenuSpace = this._options?.reserveSubmenuSpace ?? true;
    const hasAnySubmenuActions = reserveSubmenuSpace && items.some((item) => !!item.submenuActions?.length && !item.hover?.content);
    this._list = this._register(new List(user, this.domNode, virtualDelegate, [
      new ActionItemRenderer(this._supportsPreview, (item) => this._removeItem(item), (item) => this._showSubmenuForItem(item), hasAnySubmenuActions, this._groupTitleByIndex, this._options?.linkHandler, this._options?.hideDefaultKeybindingTooltip ?? false, this._keybindingService, this._openerService),
      new HeaderRenderer(),
      new SeparatorRenderer()
    ], {
      keyboardSupport: false,
      typeNavigationEnabled: !this._options?.showFilter,
      keyboardNavigationLabelProvider: { getKeyboardNavigationLabel },
      accessibilityProvider: {
        getAriaLabel: (element) => {
          if (element.kind === "action" /* Action */) {
            let label = element.label ? stripNewlines(element?.label) : "";
            if (element.detail) {
              label = label + ", " + stripNewlines(element.detail);
            }
            if (element.ariaDescription) {
              label = label + ", " + stripNewlines(element.ariaDescription);
            } else if (element.description) {
              const descText = typeof element.description === "string" ? element.description : element.description.value;
              label = label + ", " + stripNewlines(descText);
            }
            if (element.hover?.content && !element.ariaDescription && !element.description) {
              const hoverContent = element.hover.content;
              const hoverText = typeof hoverContent === "string" ? hoverContent : isMarkdownString(hoverContent) ? hoverContent.value : dom.isHTMLElement(hoverContent) ? hoverContent.textContent ?? void 0 : void 0;
              if (hoverText && (!element.detail || stripNewlines(element.detail) !== stripNewlines(hoverText))) {
                label = label + ", " + stripNewlines(hoverText);
              }
            }
            if (element.group?.title) {
              label = label + ", " + element.group.title;
            }
            if (element.inlineToggle) {
              label = label + ", " + (element.inlineToggle.checked ? localize("actionList.inlineToggle.on", "{0}, on", element.inlineToggle.label) : localize("actionList.inlineToggle.off", "{0}, off", element.inlineToggle.label));
            }
            if (element.disabled) {
              label = localize({ key: "customQuickFixWidget.labels", comment: [`Action widget labels for accessibility.`] }, "{0}, Disabled Reason: {1}", label, element.disabled);
            }
            if (element.submenuActions?.length) {
              label = localize("actionList.submenuHint", "{0}, use right arrow to access options", label);
            }
            return label;
          }
          return null;
        },
        getWidgetAriaLabel: () => localize({ key: "customQuickFixWidget", comment: [`An action widget option`] }, "Action Widget"),
        getRole: (e) => {
          switch (e.kind) {
            case "action" /* Action */:
              return "option";
            case "separator" /* Separator */:
              return "separator";
            default:
              return "separator";
          }
        },
        getWidgetRole: () => "listbox",
        ...accessibilityProvider
      }
    }));
    this._list.style(defaultListStyles);
    this._register(this._list.onMouseClick((e) => this.onListClick(e)));
    this._register(this._list.onMouseOver((e) => this.onListHover(e)));
    this._register(this._list.onDidChangeFocus(() => this.onFocus()));
    this._register(this._list.onDidChangeSelection((e) => this.onListSelection(e)));
    this._allMenuItems = [...items];
    if (this._options?.showFilter || this._options?.secondaryHeading) {
      this._filterContainer = document.createElement("div");
      this._filterContainer.className = "action-list-filter";
      const filterRow = dom.append(this._filterContainer, dom.$(".action-list-filter-row"));
      if (this._options?.showFilter) {
        this._filterInput = document.createElement("input");
        this._filterInput.type = "text";
        this._filterInput.className = "action-list-filter-input";
        this._filterInput.placeholder = this._options?.filterPlaceholder ?? localize("actionList.filter.placeholder", "Search...");
        this._filterInput.setAttribute("aria-label", localize("actionList.filter.ariaLabel", "Filter items"));
        filterRow.appendChild(this._filterInput);
        const filterActions = this._options?.filterActions ?? [];
        if (filterActions.length > 0) {
          const filterActionsContainer = dom.append(filterRow, dom.$(".action-list-filter-actions"));
          const filterActionBar = this._register(new ActionBar(filterActionsContainer));
          filterActionBar.push(filterActions, { icon: true, label: false });
        }
        const onFilterValueChanged = () => {
          const value = this._filterInput.value;
          if (this._imeSessionInProgress || value === this._filterText) {
            return;
          }
          this._filterText = value;
          this._applyOrUpdateFilter();
        };
        this._register(dom.addDisposableListener(this._filterInput, "compositionstart", () => {
          this._imeSessionInProgress = true;
          this._filterCts.value?.cancel();
        }));
        this._register(dom.addDisposableListener(this._filterInput, "compositionend", () => {
          this._imeSessionInProgress = false;
          onFilterValueChanged();
        }));
        this._register(dom.addDisposableListener(this._filterInput, "input", onFilterValueChanged));
      }
      if (this._options?.secondaryHeading) {
        const filterLabelEl = dom.append(filterRow, dom.$(".action-list-filter-label"));
        filterLabelEl.textContent = this._options.secondaryHeading;
      }
    }
    if (this._options?.footerText) {
      this._footerContainer = document.createElement("div");
      this._footerContainer.className = "action-list-footer";
      this._footerContainer.textContent = this._options.footerText;
    }
    if (this._options?.headerText) {
      this._headerContainer = document.createElement("div");
      this._headerContainer.className = "action-list-header";
      if (this._options.headerIcon) {
        const icon = dom.append(this._headerContainer, dom.$("span.action-list-header-icon"));
        icon.classList.add(...ThemeIcon.asClassNameArray(this._options.headerIcon));
        icon.setAttribute("aria-hidden", "true");
      }
      const text = dom.append(this._headerContainer, dom.$("span.action-list-header-text"));
      text.textContent = this._options.headerText;
      this._register(dom.addDisposableListener(this._headerContainer, dom.EventType.MOUSE_ENTER, () => this._hideSubmenu()));
      if (this._options.headerLink) {
        const { label, uri } = this._options.headerLink;
        text.textContent += " ";
        this._register(this._instantiationService.createInstance(Link, text, { label, href: uri.toString(true) }, {}));
      }
      if (this._options.headerDismiss) {
        const onDismiss = this._options.headerDismiss;
        const dismissButton = dom.append(this._headerContainer, dom.$("span.action-list-header-dismiss"));
        dismissButton.appendChild(dom.$(ThemeIcon.asCSSSelector(Codicon.close)));
        dismissButton.tabIndex = 0;
        dismissButton.setAttribute("role", "button");
        dismissButton.setAttribute("aria-label", localize("actionList.header.dismiss", "Dismiss"));
        const dismiss = () => {
          onDismiss();
          this.focus();
          this._headerContainer?.remove();
          this._headerContainer = void 0;
          this._onDidRequestLayout.fire();
        };
        this._register(dom.addDisposableGenericMouseUpListener(dismissButton, () => dismiss()));
        this._register(dom.addDisposableListener(dismissButton, dom.EventType.KEY_DOWN, (e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            dismiss();
          }
        }));
      }
    }
    this._applyFilter();
    if (this._list.length) {
      this._focusCheckedOrFirst();
    }
    this._register(dom.addDisposableListener(this.domNode, "keydown", (e) => {
      if (e.key === "ArrowRight" && !e.isComposing) {
        const focused = this._list.getFocus();
        if (focused.length > 0) {
          const element = this._list.element(focused[0]);
          if (element?.submenuActions?.length) {
            dom.EventHelper.stop(e, true);
            const rowElement = this._getRowElement(focused[0]);
            if (rowElement) {
              this._showSubmenuForElement(element, rowElement);
              this._currentSubmenuWidget?.focus();
            }
          }
        }
      }
    }));
    if (this._filterInput) {
      this._register(dom.addDisposableListener(this.domNode, "keydown", (e) => {
        if (this._filterInput && !dom.isActiveElement(this._filterInput) && !e.isComposing && e.key.length === 1 && e.key !== " " && !e.ctrlKey && !e.metaKey && !e.altKey) {
          this._filterInput.focus();
          this._filterInput.value = e.key;
          this._filterText = e.key;
          this._applyOrUpdateFilter();
          e.preventDefault();
          e.stopPropagation();
        }
      }));
    }
  }
  _toggleSection(section) {
    if (this._collapsedSections.has(section)) {
      this._collapsedSections.delete(section);
    } else {
      this._collapsedSections.add(section);
    }
    this._options?.onDidToggleSection?.(section, this._collapsedSections.has(section));
    this._applyFilter();
  }
  _applyOrUpdateFilter() {
    if (!this._delegate.onFilter) {
      this._applyFilter();
      return;
    }
    const filterText = this._filterText;
    this._filterCts.value?.cancel();
    const cts = new CancellationTokenSource();
    this._filterCts.value = cts;
    this._delegate.onFilter(filterText, cts.token).then((items) => {
      if (cts.token.isCancellationRequested) {
        return;
      }
      this._allMenuItems = [...items];
      this._applyFilter(true);
    }).catch(() => {
    });
  }
  _applyFilter(skipTextFilter = false, fireLayout = true) {
    const filterLower = skipTextFilter ? "" : this._filterText.toLowerCase();
    const isFiltering = !skipTextFilter && filterLower.length > 0;
    const visible = [];
    const focusedIndexes = this._list.getFocus();
    let focusedItem;
    if (focusedIndexes.length > 0) {
      focusedItem = this._list.element(focusedIndexes[0]);
    }
    if (isFiltering) {
      let pendingSeparator;
      let filteredSectionItems = [];
      let hasMatchingActionInSection = false;
      const flushFilteredSection = () => {
        if (pendingSeparator && hasMatchingActionInSection) {
          visible.push(pendingSeparator);
        }
        visible.push(...filteredSectionItems);
        pendingSeparator = void 0;
        filteredSectionItems = [];
        hasMatchingActionInSection = false;
      };
      const matchesFilter = (item) => {
        const label = (item.label ?? "").toLowerCase();
        const descValue = typeof item.description === "string" ? item.description : item.description?.value ?? "";
        return label.includes(filterLower) || descValue.toLowerCase().includes(filterLower);
      };
      for (const item of this._allMenuItems) {
        if (item.kind === "header" /* Header */) {
          continue;
        }
        if (item.kind === "separator" /* Separator */) {
          flushFilteredSection();
          pendingSeparator = item.label ? item : void 0;
          continue;
        }
        if (item.showAlways) {
          filteredSectionItems.push(item);
          continue;
        }
        if (item.isSectionToggle) {
          continue;
        }
        if (matchesFilter(item)) {
          hasMatchingActionInSection = true;
          filteredSectionItems.push(item);
        }
      }
      flushFilteredSection();
    } else {
      for (const item of this._allMenuItems) {
        if (item.kind === "header" /* Header */) {
          visible.push(item);
          continue;
        }
        if (item.kind === "separator" /* Separator */) {
          if (item.section && this._collapsedSections.has(item.section)) {
            continue;
          }
          visible.push(item);
          continue;
        }
        if (item.isSectionToggle && item.section) {
          const collapsed = this._collapsedSections.has(item.section);
          visible.push({
            ...item,
            group: { ...item.group, icon: collapsed ? Codicon.chevronRight : Codicon.chevronDown }
          });
          continue;
        }
        if (item.section && this._collapsedSections.has(item.section)) {
          continue;
        }
        visible.push(item);
      }
    }
    const hasActionBefore = [];
    let seenAction = false;
    for (let i = 0; i < visible.length; i++) {
      hasActionBefore[i] = seenAction;
      if (visible[i].kind === "action" /* Action */) {
        seenAction = true;
      }
    }
    const hasActionBeforeNextSeparator = [];
    let seenActionInSection = false;
    for (let i = visible.length - 1; i >= 0; i--) {
      if (visible[i].kind === "action" /* Action */) {
        seenActionInSection = true;
        continue;
      }
      if (visible[i].kind !== "separator" /* Separator */) {
        continue;
      }
      hasActionBeforeNextSeparator[i] = seenActionInSection;
      seenActionInSection = false;
    }
    for (let i = visible.length - 1; i >= 0; i--) {
      const item = visible[i];
      if (item.kind !== "separator" /* Separator */) {
        continue;
      }
      const hasFollowingActionInSection = hasActionBeforeNextSeparator[i];
      const isLeadingUnlabeledDivider = !item.label && !hasActionBefore[i];
      if (!hasFollowingActionInSection || isLeadingUnlabeledDivider) {
        visible.splice(i, 1);
      }
    }
    if (this._options?.showGroupTitleOnFirstItem) {
      this._recomputeGroupTitles(visible);
    }
    const filterInputHasFocus = this._filterInput && dom.isActiveElement(this._filterInput);
    this._list.splice(0, this._list.length, visible);
    if (fireLayout) {
      this._onDidRequestLayout.fire();
    }
    if (filterInputHasFocus) {
      this._filterInput?.focus();
      this._focusCheckedOrFirst();
    } else if (this._hasLaidOut) {
      if (focusedItem) {
        const focusedItemId = focusedItem.item?.id;
        if (focusedItemId) {
          for (let i = 0; i < this._list.length; i++) {
            const el = this._list.element(i);
            if (el.item?.id === focusedItemId) {
              this._list.setFocus([i]);
              this._list.reveal(i);
              this._list.domFocus();
              break;
            }
          }
        }
      }
    }
  }
  /**
   * Returns the filter container element, if filter is enabled.
   * The caller is responsible for appending it to the widget DOM.
   */
  get filterContainer() {
    return this._filterContainer;
  }
  get footerContainer() {
    return this._footerContainer;
  }
  get headerContainer() {
    return this._headerContainer;
  }
  get filterInput() {
    return this._filterInput;
  }
  get closeAnimation() {
    return this._options?.closeAnimation;
  }
  focusCondition(element) {
    return !element.disabled && element.kind === "action" /* Action */;
  }
  focus() {
    if (this._filterInput && this._options?.focusFilterOnOpen) {
      this._filterInput.focus();
      this._focusCheckedOrFirst();
      return;
    }
    this._list.domFocus();
    this._focusCheckedOrFirst();
  }
  clearFocus() {
    this._list.setFocus([]);
  }
  getFocusedElement() {
    const focused = this._list.getFocus();
    if (focused.length > 0) {
      return this._list.element(focused[0]);
    }
    return void 0;
  }
  /**
   * Replaces the items in the list in place, preserving the current filter,
   * without closing or repositioning the widget. When {@link focusItemId} is
   * provided, that item ({@link IActionListItem.item}'s `id`) is focused;
   * otherwise the previously focused item is preserved (matched by id).
   */
  updateItems(items, focusItemId) {
    this._allMenuItems = [...items];
    this._applyFilter(false, false);
    if (focusItemId !== void 0) {
      this.focusItemById(focusItemId);
    }
  }
  /**
   * Focuses the item whose {@link IActionListItem.item}'s `id` matches
   * {@link itemId}, without rebuilding the list. Re-applies the focus after the
   * current event so a mouse click's own pointer handling cannot reset it.
   */
  focusItemById(itemId) {
    const focusItem = () => {
      for (let i = 0; i < this._list.length; i++) {
        const el = this._list.element(i);
        if (el.item?.id === itemId) {
          this._list.setFocus([i]);
          this._list.reveal(i);
          this._list.domFocus();
          break;
        }
      }
    };
    focusItem();
    queueMicrotask(() => {
      if (this.domNode.isConnected) {
        focusItem();
      }
    });
  }
  _focusCheckedOrFirst() {
    this._suppressHover = true;
    try {
      const initialFocusItemId = this._initialFocusItemId;
      this._initialFocusItemId = void 0;
      if (initialFocusItemId) {
        for (let i = 0; i < this._list.length; i++) {
          const element = this._list.element(i);
          if (element.kind === "action" /* Action */ && element.item?.id === initialFocusItemId) {
            this._list.setFocus([i]);
            this._list.reveal(i);
            return;
          }
        }
      }
      const [focusedIndex] = this._list.getFocus();
      if (focusedIndex !== void 0) {
        const focusedElement = this._list.element(focusedIndex);
        if (focusedElement && this.focusCondition(focusedElement)) {
          this._list.reveal(focusedIndex);
          return;
        }
      }
      for (let i = 0; i < this._list.length; i++) {
        const element = this._list.element(i);
        if (element.kind === "action" /* Action */ && element.item?.checked) {
          this._list.setFocus([i]);
          this._list.reveal(i);
          return;
        }
      }
      this._list.focusFirst(void 0, this.focusCondition);
      const focused = this._list.getFocus();
      if (focused.length > 0) {
        this._list.reveal(focused[0]);
      }
    } finally {
      this._suppressHover = false;
    }
  }
  hide(didCancel) {
    this._delegate.onHide(didCancel);
    this.cts.cancel();
    this._filterCts.value?.cancel();
    this._filterCts.clear();
    this._hideSubmenu();
  }
  clearFilter() {
    if (this._filterInput && this._filterText) {
      this._filterInput.value = "";
      this._filterText = "";
      this._applyOrUpdateFilter();
      return true;
    }
    return false;
  }
  /**
   * Whether this widget uses dynamic height (has filter or collapsible sections).
   */
  get hasDynamicHeight() {
    if (this._options?.showFilter) {
      return true;
    }
    return this._allMenuItems.some((item) => item.isSectionToggle);
  }
  /**
   * The height of a single action row in pixels.
   */
  get lineHeight() {
    return this._actionLineHeight;
  }
  /**
   * Returns the height for an action item, using a taller line height
   * for items with a detail (second line).
   */
  _getItemHeight(item) {
    switch (item.kind) {
      case "header" /* Header */:
        return this._headerLineHeight;
      case "separator" /* Separator */:
        return item.label ? this._actionLineHeight : this._separatorLineHeight;
      default:
        if (item.inlineToggle) {
          return this._options?.inlineToggleItemHeight ?? 70;
        }
        return item.detail ? this._options?.detailItemHeight ?? 48 : this._actionLineHeight;
    }
  }
  /**
   * Computes the total height of all items (including collapsed/filtered items).
   */
  computeFullHeight() {
    let fullHeight = 0;
    for (const item of this._allMenuItems) {
      fullHeight += this._getItemHeight(item);
    }
    return fullHeight;
  }
  /**
   * Computes the total height of visible items in the list.
   */
  computeListHeight() {
    const visibleCount = this._list.length;
    let listHeight = 0;
    for (let i = 0; i < visibleCount; i++) {
      const element = this._list.element(i);
      listHeight += this._getItemHeight(element);
    }
    return listHeight;
  }
  /**
   * Lays out the list widget with the given explicit dimensions.
   */
  layout(height, width) {
    this._hasLaidOut = true;
    this._list.layout(height, width);
    this.domNode.style.height = `${height}px`;
    if (this._filterContainer && this._filterContainer.parentElement) {
      this._filterContainer.parentElement.insertBefore(this._filterContainer, this.domNode);
    }
  }
  computeMaxWidth(minWidth) {
    const visibleCount = this._list.length;
    const effectiveMinWidth = Math.max(minWidth, this._options?.minWidth ?? 0);
    const rawMaxWidthCap = this._options?.maxWidth ?? Number.POSITIVE_INFINITY;
    const maxWidthCap = Math.max(rawMaxWidthCap, effectiveMinWidth);
    const clamp = (w) => Math.min(Math.max(w, effectiveMinWidth), maxWidthCap);
    let maxWidth = effectiveMinWidth;
    const totalItemCount = this._allMenuItems.length;
    if (totalItemCount >= 50) {
      return clamp(380);
    }
    if (totalItemCount > visibleCount) {
      const visibleItems2 = [];
      for (let i = 0; i < visibleCount; i++) {
        visibleItems2.push(this._list.element(i));
      }
      const allItems = [...this._allMenuItems];
      this._list.splice(0, visibleCount, allItems);
      let allItemsHeight = 0;
      for (const item of allItems) {
        allItemsHeight += this._getItemHeight(item);
      }
      this._list.layout(allItemsHeight);
      const itemWidths2 = this._measureItemWidths(allItems);
      maxWidth = clamp(Math.max(...itemWidths2));
      this._list.splice(0, allItems.length, visibleItems2);
      return maxWidth;
    }
    const visibleItems = [];
    for (let i = 0; i < visibleCount; i++) {
      visibleItems.push(this._list.element(i));
    }
    const itemWidths = this._measureItemWidths(visibleItems);
    return clamp(Math.max(...itemWidths));
  }
  focusPrevious() {
    if (this._filterInput && dom.isActiveElement(this._filterInput)) {
      this._list.domFocus();
      const current = this._list.getFocus();
      if (current.length > 0) {
        this._list.focusPrevious(1, false, void 0, this.focusCondition);
        const focused2 = this._list.getFocus();
        if (focused2.length > 0 && focused2[0] >= current[0]) {
          this._filterInput.focus();
        } else if (focused2.length > 0) {
          this._list.reveal(focused2[0]);
        }
      } else {
        this._list.focusLast(void 0, this.focusCondition);
        const focused2 = this._list.getFocus();
        if (focused2.length > 0) {
          this._list.reveal(focused2[0]);
        }
      }
      return;
    }
    const previousFocus = this._list.getFocus();
    this._list.focusPrevious(1, true, void 0, this.focusCondition);
    const focused = this._list.getFocus();
    if (focused.length > 0) {
      if (this._filterInput && previousFocus.length > 0 && focused[0] > previousFocus[0]) {
        this._list.setFocus([]);
        this._filterInput.focus();
        return;
      }
      this._list.reveal(focused[0]);
    }
  }
  focusNext() {
    if (this._filterInput && dom.isActiveElement(this._filterInput)) {
      this._list.domFocus();
      const current = this._list.getFocus();
      if (current.length > 0) {
        this._list.focusNext(1, false, void 0, this.focusCondition);
        const focused2 = this._list.getFocus();
        if (focused2.length > 0) {
          this._list.reveal(focused2[0]);
        }
      } else {
        this._list.focusFirst(void 0, this.focusCondition);
        const focused2 = this._list.getFocus();
        if (focused2.length > 0) {
          this._list.reveal(focused2[0]);
        }
      }
      return;
    }
    const previousFocus = this._list.getFocus();
    this._list.focusNext(1, true, void 0, this.focusCondition);
    const focused = this._list.getFocus();
    if (focused.length > 0) {
      if (this._filterInput && previousFocus.length > 0 && focused[0] < previousFocus[0]) {
        this._list.setFocus([]);
        this._filterInput.focus();
        return;
      }
      this._list.reveal(focused[0]);
    }
  }
  collapseFocusedSection() {
    const section = this._getFocusedSection();
    if (section && !this._collapsedSections.has(section)) {
      this._toggleSection(section);
    }
  }
  expandFocusedSection() {
    const section = this._getFocusedSection();
    if (section && this._collapsedSections.has(section)) {
      this._toggleSection(section);
    }
  }
  toggleFocusedSection() {
    const focused = this._list.getFocus();
    if (focused.length === 0) {
      return false;
    }
    const element = this._list.element(focused[0]);
    if (element.isSectionToggle && element.section) {
      this._toggleSection(element.section);
      return true;
    }
    return false;
  }
  _getFocusedSection() {
    const focused = this._list.getFocus();
    if (focused.length === 0) {
      return void 0;
    }
    const element = this._list.element(focused[0]);
    if (element.isSectionToggle && element.section) {
      return element.section;
    }
    return element.section;
  }
  acceptSelected(preview) {
    const focused = this._list.getFocus();
    if (focused.length === 0) {
      return;
    }
    const focusIndex = focused[0];
    const element = this._list.element(focusIndex);
    if (!this.focusCondition(element)) {
      return;
    }
    const event = preview ? new PreviewSelectedEvent() : new AcceptSelectedEvent();
    this._list.setSelection([focusIndex], event);
  }
  onListSelection(e) {
    if (!e.elements.length) {
      return;
    }
    const element = e.elements[0];
    if (element.isSectionToggle && element.section) {
      this._list.setSelection([]);
      const section = element.section;
      queueMicrotask(() => {
        this._toggleSection(section);
      });
      return;
    }
    if (dom.isMouseEvent(e.browserEvent)) {
      const target = e.browserEvent.target;
      if (dom.isHTMLElement(target) && (target.closest(".action-list-item-toolbar") || target.closest(".action-list-submenu-indicator") || target.closest(".action-list-item-inline-toggle"))) {
        this._list.setSelection([]);
        return;
      }
    }
    if (element.item && this.focusCondition(element)) {
      const isPreviewEvent = e.browserEvent instanceof PreviewSelectedEvent;
      this._delegate.onSelect(element.item, isPreviewEvent && this._supportsPreview);
    } else {
      this._list.setSelection([]);
    }
  }
  onFocus() {
    const focused = this._list.getFocus();
    if (focused.length === 0) {
      return;
    }
    const focusIndex = focused[0];
    const element = this._list.element(focusIndex);
    this._delegate.onFocus?.(element.item);
    if (!this._suppressHover) {
      this._showHoverForElement(element, focusIndex);
    }
  }
  _removeItem(item) {
    const index = this._allMenuItems.indexOf(item);
    if (index >= 0) {
      this._allMenuItems.splice(index, 1);
      this._applyFilter();
    }
  }
  _recomputeGroupTitles(items) {
    this._groupTitleByIndex.clear();
    const seenTitles = /* @__PURE__ */ new Set();
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      if (item.kind === "action" /* Action */ && item.group?.title && !seenTitles.has(item.group.title)) {
        seenTitles.add(item.group.title);
        this._groupTitleByIndex.set(i, item.group.title);
      }
    }
  }
  _measureItemWidths(items) {
    const rows = [];
    for (let i = 0; i < items.length; i++) {
      const element = this._getRowElement(i);
      if (element) {
        element.style.width = "auto";
        rows.push({ element, item: items[i] });
      }
    }
    try {
      return rows.map(({ element, item }) => element.getBoundingClientRect().width + this._computeToolbarWidth(item));
    } finally {
      for (const { element } of rows) {
        element.style.width = "";
      }
    }
  }
  _computeToolbarWidth(item) {
    let actionCount = item.toolbarActions?.length ?? 0;
    if (item.onRemove) {
      actionCount++;
    }
    if (actionCount === 0) {
      return 0;
    }
    const actionButtonWidth = 22;
    return actionCount * actionButtonWidth + 6;
  }
  _getRowElement(index) {
    return this.domNode.ownerDocument.getElementById(this._list.getElementID(index));
  }
  _showHoverForElement(element, index) {
    if (this._currentSubmenuElement === element) {
      return;
    }
    const hasHoverContent = !!element.hover?.content;
    const hasSubmenuActions = !!element.submenuActions?.length;
    if (hasHoverContent || hasSubmenuActions) {
      const rowElement = this._getRowElement(index);
      if (rowElement) {
        this._showSubmenuForElement(element, rowElement);
      }
      return;
    }
    this._hideSubmenu();
  }
  _showSubmenuForItem(item) {
    const index = this._list.indexOf(item);
    if (index >= 0) {
      const rowElement = this._getRowElement(index);
      if (rowElement) {
        this._showSubmenuForElement(item, rowElement);
      }
    }
  }
  _showSubmenuForElement(element, anchor) {
    if (this._currentSubmenuElement === element) {
      return;
    }
    this._submenuDisposables.clear();
    this._currentSubmenuElement = element;
    this._clearSubmenuContainer();
    let hoverHeader;
    const hoverContent = element.hover?.content;
    if (hoverContent) {
      if (dom.isHTMLElement(hoverContent)) {
        hoverHeader = hoverContent;
        if (element.hover?.disposable) {
          this._register(element.hover.disposable);
        }
      } else {
        const markdown = typeof hoverContent === "string" ? new MarkdownString(hoverContent) : hoverContent;
        const linkHandler = this._options?.linkHandler;
        const rendered = renderMarkdown(markdown, {
          actionHandler: (url) => {
            const uri = URI.parse(url);
            if (linkHandler) {
              linkHandler(uri, element);
            } else {
              this._openerService.open(uri, { allowCommands: true });
            }
          }
        });
        this._submenuDisposables.add(rendered);
        hoverHeader = rendered.element;
      }
      hoverHeader.classList.add("action-list-submenu-hover-header");
      if (element.submenuActions?.length) {
        hoverHeader.classList.add("has-submenu");
      }
      this._submenuContainer.appendChild(hoverHeader);
    }
    const hasSubmenuActions = !!element.submenuActions?.length;
    this._submenuContainer.style.display = "";
    this._submenuContainer.style.position = "absolute";
    this._submenuContainer.removeAttribute("role");
    const anchorRect = anchor.getBoundingClientRect();
    const parentRect = this.domNode.getBoundingClientRect();
    const targetWindow = dom.getWindow(this.domNode);
    let totalHeight = 0;
    let maxWidth = hoverHeader ? hoverHeader.offsetWidth : 0;
    if (hasSubmenuActions) {
      const submenuItems = [];
      const submenuGroups = element.submenuActions.filter((a) => a instanceof SubmenuAction);
      const groupsWithActions = submenuGroups.filter((g) => g.actions.length > 0);
      for (let gi = 0; gi < groupsWithActions.length; gi++) {
        const group = groupsWithActions[gi];
        if (group.label) {
          submenuItems.push({
            kind: "header" /* Header */,
            group: { title: group.label },
            label: group.label
          });
        }
        for (let ci = 0; ci < group.actions.length; ci++) {
          const child = group.actions[ci];
          const extendedChild = child;
          const icon = extendedChild.icon ?? ThemeIcon.fromId(child.checked ? Codicon.check.id : Codicon.blank.id);
          const hoverContent2 = extendedChild.hoverContent;
          submenuItems.push({
            item: child,
            kind: "action" /* Action */,
            label: child.label,
            description: child.tooltip || void 0,
            group: { title: "", icon },
            hideIcon: false,
            hover: hoverContent2 ? { content: hoverContent2 } : {},
            onRemove: extendedChild.onRemove
          });
        }
        if (gi < groupsWithActions.length - 1) {
          submenuItems.push({ kind: "separator" /* Separator */, label: "" });
        }
      }
      for (const action of element.submenuActions) {
        if (!(action instanceof SubmenuAction)) {
          const extendedAction = action;
          submenuItems.push({
            item: action,
            kind: "action" /* Action */,
            label: action.label,
            description: action.tooltip || void 0,
            group: { title: "" },
            hideIcon: false,
            hover: {},
            onRemove: extendedAction.onRemove
          });
        }
      }
      const submenuDelegate = {
        onHide: () => {
        },
        onSelect: (action) => {
          action.run();
          const parentItem = this._currentSubmenuElement?.item;
          this._hideSubmenu();
          if (parentItem) {
            this._delegate.onSelect(parentItem);
          }
          this.hide();
        }
      };
      const submenuWidget = this._submenuDisposables.add(this._instantiationService.createInstance(
        ActionListWidget,
        "submenu",
        false,
        submenuItems,
        submenuDelegate,
        void 0,
        void 0
      ));
      this._submenuContainer.appendChild(submenuWidget.domNode);
      this._currentSubmenuWidget = submenuWidget;
      submenuWidget.clearFocus();
      totalHeight = submenuWidget.computeListHeight();
      submenuWidget.layout(totalHeight);
      const submenuMaxWidth = submenuWidget.computeMaxWidth(0);
      maxWidth = Math.max(maxWidth, submenuMaxWidth);
      submenuWidget.layout(totalHeight, maxWidth);
      submenuWidget.domNode.style.width = `${maxWidth}px`;
      this._submenuDisposables.add(dom.addDisposableListener(submenuWidget.domNode, "keydown", (e) => {
        if (e.key === "Escape") {
          dom.EventHelper.stop(e, true);
          this._hideSubmenu();
          this.hide();
        } else if (e.key === "ArrowLeft") {
          dom.EventHelper.stop(e, true);
          this._hideSubmenu();
          this._list.domFocus();
        } else if (e.key === "Enter") {
          dom.EventHelper.stop(e, true);
          const focused = submenuWidget.getFocusedElement();
          if (focused?.item) {
            focused.item.run();
            const parentItem = this._currentSubmenuElement?.item;
            this._hideSubmenu();
            if (parentItem) {
              this._delegate.onSelect(parentItem);
            }
            this.hide();
          }
        } else if (e.key === "ArrowDown") {
          dom.EventHelper.stop(e, true);
          submenuWidget.focusNext();
        } else if (e.key === "ArrowUp") {
          dom.EventHelper.stop(e, true);
          submenuWidget.focusPrevious();
        }
      }));
    }
    const viewportWidth = targetWindow.innerWidth;
    const spaceRight = viewportWidth - anchorRect.right;
    const spaceLeft = parentRect.left;
    const panelWidth = maxWidth + 10;
    const gap = 4;
    if (spaceRight >= panelWidth || spaceRight >= spaceLeft) {
      this._submenuContainer.style.left = `${parentRect.right - parentRect.left + gap}px`;
    } else {
      this._submenuContainer.style.left = `${-panelWidth - gap}px`;
    }
    const hoverHeaderHeight = hoverHeader ? hoverHeader.offsetHeight : 0;
    const totalPanelHeight = totalHeight + hoverHeaderHeight;
    const viewportHeight = targetWindow.innerHeight;
    const anchorHeight = anchorRect.height;
    let top = anchorRect.top - parentRect.top + (anchorHeight - totalPanelHeight) / 2;
    const panelBottom = parentRect.top + top + totalPanelHeight;
    if (panelBottom > viewportHeight) {
      top -= panelBottom - viewportHeight + 8;
    }
    if (parentRect.top + top < 0) {
      top = -parentRect.top;
    }
    this._submenuContainer.style.top = `${top}px`;
  }
  _hideSubmenu() {
    this._cancelSubmenuHide();
    this._cancelSubmenuShow();
    this._submenuDisposables.clear();
    this._currentSubmenuWidget = void 0;
    this._currentSubmenuElement = void 0;
    this._clearSubmenuContainer();
    this._submenuContainer.style.display = "none";
  }
  /**
   * Clears the submenu/hover panel. If focus currently lives inside the panel
   * (e.g. the user clicked a button in the hover content), focus is first moved
   * back to the list. Otherwise clearing the panel would drop focus to <body>,
   * which blurs the action widget and dismisses it.
   */
  _clearSubmenuContainer() {
    if (this._submenuContainer.contains(dom.getActiveElement())) {
      this._list.domFocus();
    }
    dom.clearNode(this._submenuContainer);
  }
  _scheduleSubmenuHide() {
    this._cancelSubmenuHide();
    this._submenuHideTimeout = setTimeout(() => {
      this._hideSubmenu();
    }, 300);
  }
  _cancelSubmenuHide() {
    if (this._submenuHideTimeout !== void 0) {
      clearTimeout(this._submenuHideTimeout);
      this._submenuHideTimeout = void 0;
    }
  }
  _scheduleSubmenuShow(element, index) {
    this._cancelSubmenuShow();
    this._submenuShowTimeout = setTimeout(() => {
      this._submenuShowTimeout = void 0;
      const rowElement = typeof index === "number" ? this._getRowElement(index) : null;
      if (rowElement) {
        this._showSubmenuForElement(element, rowElement);
      }
    }, 500);
  }
  _cancelSubmenuShow() {
    if (this._submenuShowTimeout !== void 0) {
      clearTimeout(this._submenuShowTimeout);
      this._submenuShowTimeout = void 0;
    }
  }
  async onListHover(e) {
    const element = e.element;
    if (element && element.item && this.focusCondition(element)) {
      const isHoveringToolbar = dom.isHTMLElement(e.browserEvent.target) && e.browserEvent.target.closest(".action-list-item-toolbar") !== null;
      if (isHoveringToolbar) {
        if (!element.submenuActions?.length) {
          this._cancelSubmenuShow();
        }
        this._list.setFocus([]);
        return;
      }
      const hasPanel = !!(element.submenuActions?.length || element.hover?.content);
      if (hasPanel) {
        this._suppressHover = true;
      }
      this._list.setFocus(typeof e.index === "number" ? [e.index] : []);
      if (hasPanel) {
        this._suppressHover = false;
      }
      if (hasPanel) {
        if (this._currentSubmenuElement === element) {
          this._cancelSubmenuHide();
          this._cancelSubmenuShow();
        } else {
          this._hideSubmenu();
          this._scheduleSubmenuShow(element, e.index);
        }
        return;
      }
      if (this._currentSubmenuElement === element) {
        this._cancelSubmenuHide();
      } else {
        this._cancelSubmenuShow();
        this._hideSubmenu();
      }
      if (this._delegate.onHover && !element.disabled && element.kind === "action" /* Action */ && this._currentSubmenuElement !== element) {
        const result = await this._delegate.onHover(element.item, this.cts.token);
        const canPreview = result ? result.canPreview : void 0;
        if (canPreview !== element.canPreview) {
          element.canPreview = canPreview;
          if (typeof e.index === "number") {
            this._list.splice(e.index, 1, [element]);
            this._list.setFocus([e.index]);
          }
        }
      }
    } else if (element && element.hover?.content && typeof e.index === "number") {
      if (this._currentSubmenuElement === element) {
        this._cancelSubmenuHide();
        this._cancelSubmenuShow();
      } else {
        this._hideSubmenu();
        this._scheduleSubmenuShow(element, e.index);
      }
    }
  }
  onListClick(e) {
    if (e.element && this.focusCondition(e.element)) {
      this._list.setFocus([]);
    }
  }
};
ActionListWidget = __decorateClass([
  __decorateParam(6, IKeybindingService),
  __decorateParam(7, IOpenerService),
  __decorateParam(8, IInstantiationService)
], ActionListWidget);
let ActionList = class extends Disposable {
  constructor(user, preview, items, _delegate, accessibilityProvider, options, anchor, _contextViewService, _layoutService, instantiationService) {
    super();
    this._contextViewService = _contextViewService;
    this._layoutService = _layoutService;
    this._lastMinWidth = 0;
    this._hasLaidOut = false;
    this._anchor = anchor;
    this._preferredAnchorPosition = options?.anchorPosition;
    this._widgetClassName = options?.widgetClassName;
    this._widget = this._register(instantiationService.createInstance(
      ActionListWidget,
      user,
      preview,
      items,
      _delegate,
      accessibilityProvider,
      options
    ));
    this._register(this._widget.onDidRequestLayout(() => {
      if (this._hasLaidOut) {
        this.layout(this._lastMinWidth);
        this._contextViewService.layout();
      }
    }));
  }
  get domNode() {
    return this._widget.domNode;
  }
  get filterContainer() {
    return this._widget.filterContainer;
  }
  get footerContainer() {
    return this._widget.footerContainer;
  }
  get headerContainer() {
    return this._widget.headerContainer;
  }
  get filterInput() {
    return this._widget.filterInput;
  }
  get closeAnimation() {
    return this._widget.closeAnimation;
  }
  get widgetClassName() {
    return this._widgetClassName;
  }
  /**
   * Returns the resolved anchor position after the first layout.
   * Used by the context view delegate to lock the dropdown direction.
   */
  get anchorPosition() {
    if (this._preferredAnchorPosition !== void 0) {
      return this._preferredAnchorPosition;
    }
    if (this._showAbove === void 0) {
      return void 0;
    }
    return this._showAbove ? AnchorPosition.ABOVE : AnchorPosition.BELOW;
  }
  focus() {
    this._widget.focus();
  }
  hide(didCancel, hideContextView = true) {
    this._widget.hide(didCancel);
    if (hideContextView) {
      this._contextViewService.hideContextView();
    }
  }
  clearFilter() {
    return this._widget.clearFilter();
  }
  focusPrevious() {
    this._widget.focusPrevious();
  }
  focusNext() {
    this._widget.focusNext();
  }
  collapseFocusedSection() {
    this._widget.collapseFocusedSection();
  }
  expandFocusedSection() {
    this._widget.expandFocusedSection();
  }
  toggleFocusedSection() {
    return this._widget.toggleFocusedSection();
  }
  acceptSelected(preview) {
    this._widget.acceptSelected(preview);
  }
  updateItems(items, focusItemId) {
    this._widget.updateItems(items, focusItemId);
  }
  focusItemById(itemId) {
    this._widget.focusItemById(itemId);
  }
  hasDynamicHeight() {
    return this._widget.hasDynamicHeight;
  }
  computeActionWidgetVerticalChromeHeight() {
    const widgetContainer = this.domNode.parentElement?.closest(".action-widget");
    if (!widgetContainer) {
      return 0;
    }
    const style = dom.getWindow(widgetContainer).getComputedStyle(widgetContainer);
    const toPixels = (value) => Number.parseFloat(value) || 0;
    return toPixels(style.paddingTop) + toPixels(style.paddingBottom) + toPixels(style.borderTopWidth) + toPixels(style.borderBottomWidth);
  }
  computeHeight() {
    const listHeight = this._widget.computeListHeight();
    const filterHeight = this._widget.filterContainer ? 36 : 0;
    const footerHeight = this._widget.footerContainer ? 32 : 0;
    const headerHeight = this._widget.headerContainer ? this._widget.headerContainer.offsetHeight || 36 : 0;
    const chromeHeight = filterHeight + footerHeight + headerHeight;
    const targetWindow = dom.getWindow(this.domNode);
    let availableHeight;
    if (this.hasDynamicHeight() || this._preferredAnchorPosition !== void 0) {
      const viewportHeight = targetWindow.innerHeight;
      const anchorRect = getAnchorRect(this._anchor);
      const anchorTopInViewport = anchorRect.top - targetWindow.pageYOffset;
      const bottomGap = 30;
      const spaceBelow = viewportHeight - anchorTopInViewport - anchorRect.height - bottomGap;
      const spaceAbove = anchorTopInViewport;
      if (this._showAbove === void 0) {
        this._showAbove = this._preferredAnchorPosition !== void 0 ? this._preferredAnchorPosition === AnchorPosition.ABOVE : chromeHeight + this._widget.computeFullHeight() > spaceBelow && spaceAbove > spaceBelow;
      }
      availableHeight = Math.max(0, (this._showAbove ? spaceAbove : spaceBelow) - this.computeActionWidgetVerticalChromeHeight());
    } else {
      const padding = 10;
      const windowHeight = this._layoutService.getContainer(targetWindow).clientHeight;
      const widgetTop = this.domNode.getBoundingClientRect().top;
      availableHeight = widgetTop > 0 ? windowHeight - widgetTop - padding : windowHeight * 0.7;
    }
    const viewportMaxHeight = Math.floor(targetWindow.innerHeight * 0.6);
    const actionLineHeight = this._widget.lineHeight;
    if (this._preferredAnchorPosition !== void 0) {
      const maxHeight2 = Math.min(availableHeight, viewportMaxHeight);
      const height2 = Math.min(listHeight + chromeHeight, Math.max(0, maxHeight2));
      return Math.max(0, height2 - chromeHeight);
    }
    const maxHeight = Math.min(Math.max(availableHeight, actionLineHeight * 3 + chromeHeight), viewportMaxHeight);
    const height = Math.min(listHeight + chromeHeight, maxHeight);
    return height - chromeHeight;
  }
  layout(minWidth) {
    this._hasLaidOut = true;
    this._lastMinWidth = minWidth;
    const listHeight = this.computeHeight();
    this._widget.layout(listHeight);
    const computedWidth = this._widget.computeMaxWidth(minWidth);
    this._cachedMaxWidth = computedWidth;
    this._widget.layout(listHeight, this._cachedMaxWidth);
    return this._cachedMaxWidth;
  }
};
ActionList = __decorateClass([
  __decorateParam(7, IContextViewService),
  __decorateParam(8, ILayoutService),
  __decorateParam(9, IInstantiationService)
], ActionList);
function stripNewlines(str) {
  return str.replace(/\r\n|\r|\n/g, " ");
}
export {
  ActionList,
  ActionListItemKind,
  ActionListWidget,
  acceptSelectedActionCommand,
  previewSelectedActionCommand
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxwbGF0Zm9ybVxcYWN0aW9uV2lkZ2V0XFxicm93c2VyXFxhY3Rpb25MaXN0LnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cbmltcG9ydCAqIGFzIGRvbSBmcm9tICcuLi8uLi8uLi9iYXNlL2Jyb3dzZXIvZG9tLmpzJztcbmltcG9ydCB7IFN0YW5kYXJkTW91c2VFdmVudCB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci9tb3VzZUV2ZW50LmpzJztcbmltcG9ydCB7IHJlbmRlck1hcmtkb3duIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9icm93c2VyL21hcmtkb3duUmVuZGVyZXIuanMnO1xuaW1wb3J0IHsgQWN0aW9uQmFyIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9icm93c2VyL3VpL2FjdGlvbmJhci9hY3Rpb25iYXIuanMnO1xuaW1wb3J0IHsgZ2V0QW5jaG9yUmVjdCwgSUFuY2hvciB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci91aS9jb250ZXh0dmlldy9jb250ZXh0dmlldy5qcyc7XG5pbXBvcnQgeyBLZXliaW5kaW5nTGFiZWwgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2Jyb3dzZXIvdWkva2V5YmluZGluZ0xhYmVsL2tleWJpbmRpbmdMYWJlbC5qcyc7XG5pbXBvcnQgeyBUb2dnbGUgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2Jyb3dzZXIvdWkvdG9nZ2xlL3RvZ2dsZS5qcyc7XG5pbXBvcnQgeyBJTGlzdEV2ZW50LCBJTGlzdE1vdXNlRXZlbnQsIElMaXN0UmVuZGVyZXIsIElMaXN0VmlydHVhbERlbGVnYXRlIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9icm93c2VyL3VpL2xpc3QvbGlzdC5qcyc7XG5pbXBvcnQgeyBJTGlzdEFjY2Vzc2liaWxpdHlQcm92aWRlciwgTGlzdCB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci91aS9saXN0L2xpc3RXaWRnZXQuanMnO1xuaW1wb3J0IHsgSUFjdGlvbiwgU3VibWVudUFjdGlvbiwgdG9BY3Rpb24gfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9hY3Rpb25zLmpzJztcbmltcG9ydCB7IENhbmNlbGxhdGlvblRva2VuLCBDYW5jZWxsYXRpb25Ub2tlblNvdXJjZSB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL2NhbmNlbGxhdGlvbi5qcyc7XG5pbXBvcnQgeyBDb2RpY29uIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vY29kaWNvbnMuanMnO1xuaW1wb3J0IHsgRW1pdHRlciB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL2V2ZW50LmpzJztcbmltcG9ydCB7IElNYXJrZG93blN0cmluZywgaXNNYXJrZG93blN0cmluZywgTWFya2Rvd25TdHJpbmcgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9odG1sQ29udGVudC5qcyc7XG5pbXBvcnQgeyBSZXNvbHZlZEtleWJpbmRpbmcgfSBmcm9tICcuLi8uLi8uLi9iYXNlL2NvbW1vbi9rZXliaW5kaW5ncy5qcyc7XG5pbXBvcnQgeyBBbmNob3JQb3NpdGlvbiB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xheW91dC5qcyc7XG5pbXBvcnQgeyBEaXNwb3NhYmxlLCBEaXNwb3NhYmxlU3RvcmUsIElEaXNwb3NhYmxlLCBNdXRhYmxlRGlzcG9zYWJsZSwgdG9EaXNwb3NhYmxlIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IE9TIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vcGxhdGZvcm0uanMnO1xuaW1wb3J0IHsgVGhlbWVJY29uIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vdGhlbWFibGVzLmpzJztcbmltcG9ydCB7IFVSSSB9IGZyb20gJy4uLy4uLy4uL2Jhc2UvY29tbW9uL3VyaS5qcyc7XG5pbXBvcnQgJy4vYWN0aW9uV2lkZ2V0LmNzcyc7XG5pbXBvcnQgeyBsb2NhbGl6ZSB9IGZyb20gJy4uLy4uLy4uL25scy5qcyc7XG5pbXBvcnQgeyBJQ29udGV4dFZpZXdTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vY29udGV4dHZpZXcvYnJvd3Nlci9jb250ZXh0Vmlldy5qcyc7XG5pbXBvcnQgeyBJS2V5YmluZGluZ1NlcnZpY2UgfSBmcm9tICcuLi8uLi9rZXliaW5kaW5nL2NvbW1vbi9rZXliaW5kaW5nLmpzJztcbmltcG9ydCB7IElPcGVuZXJTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vb3BlbmVyL2NvbW1vbi9vcGVuZXIuanMnO1xuaW1wb3J0IHsgTGluayB9IGZyb20gJy4uLy4uL29wZW5lci9icm93c2VyL2xpbmsuanMnO1xuaW1wb3J0IHsgZGVmYXVsdExpc3RTdHlsZXMgfSBmcm9tICcuLi8uLi90aGVtZS9icm93c2VyL2RlZmF1bHRTdHlsZXMuanMnO1xuaW1wb3J0IHsgYXNDc3NWYXJpYWJsZSB9IGZyb20gJy4uLy4uL3RoZW1lL2NvbW1vbi9jb2xvclJlZ2lzdHJ5LmpzJztcbmltcG9ydCB7IElMYXlvdXRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vbGF5b3V0L2Jyb3dzZXIvbGF5b3V0U2VydmljZS5qcyc7XG5pbXBvcnQgeyBJSW5zdGFudGlhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi9pbnN0YW50aWF0aW9uL2NvbW1vbi9pbnN0YW50aWF0aW9uLmpzJztcblxuZXhwb3J0IGNvbnN0IGFjY2VwdFNlbGVjdGVkQWN0aW9uQ29tbWFuZCA9ICdhY2NlcHRTZWxlY3RlZENvZGVBY3Rpb24nO1xuZXhwb3J0IGNvbnN0IHByZXZpZXdTZWxlY3RlZEFjdGlvbkNvbW1hbmQgPSAncHJldmlld1NlbGVjdGVkQ29kZUFjdGlvbic7XG5cbmV4cG9ydCBpbnRlcmZhY2UgSUFjdGlvbkxpc3REZWxlZ2F0ZTxUPiB7XG5cdG9uSGlkZShkaWRDYW5jZWw/OiBib29sZWFuKTogdm9pZDtcblx0b25TZWxlY3QoYWN0aW9uOiBULCBwcmV2aWV3PzogYm9vbGVhbik6IHZvaWQ7XG5cdG9uRmlsdGVyPyhmaWx0ZXI6IHN0cmluZywgY2FuY2VsbGF0aW9uVG9rZW46IENhbmNlbGxhdGlvblRva2VuKTogUHJvbWlzZTxyZWFkb25seSBJQWN0aW9uTGlzdEl0ZW08VD5bXT47XG5cdG9uSG92ZXI/KGFjdGlvbjogVCwgY2FuY2VsbGF0aW9uVG9rZW46IENhbmNlbGxhdGlvblRva2VuKTogUHJvbWlzZTx7IGNhblByZXZpZXc6IGJvb2xlYW4gfSB8IHZvaWQ+O1xuXHRvbkZvY3VzPyhhY3Rpb246IFQgfCB1bmRlZmluZWQpOiB2b2lkO1xufVxuXG4vKipcbiAqIE9wdGlvbmFsIGhvdmVyIGNvbmZpZ3VyYXRpb24gc2hvd24gd2hlbiBmb2N1c2luZy9ob3ZlcmluZyBvdmVyIGFuIGFjdGlvbiBsaXN0IGl0ZW0uXG4gKi9cbmV4cG9ydCBpbnRlcmZhY2UgSUFjdGlvbkxpc3RJdGVtSG92ZXIge1xuXHQvKipcblx0ICogQ29udGVudCB0byBkaXNwbGF5IGluIHRoZSBob3Zlci4gQ2FuIGJlIGEgbWFya2Rvd24gc3RyaW5nIG9yIGFuIEhUTUxFbGVtZW50IGZvciBmdWxsIERPTSBjb250cm9sLlxuXHQgKi9cblx0cmVhZG9ubHkgY29udGVudD86IHN0cmluZyB8IElNYXJrZG93blN0cmluZyB8IEhUTUxFbGVtZW50O1xuXHQvKipcblx0ICogT3B0aW9uYWwgZGlzcG9zYWJsZSBhc3NvY2lhdGVkIHdpdGggdGhlIGhvdmVyIGNvbnRlbnQgKGUuZy4gZnJvbSByZW5kZXJlZCBtYXJrZG93bikuXG5cdCAqL1xuXHRyZWFkb25seSBkaXNwb3NhYmxlPzogSURpc3Bvc2FibGU7XG59XG5cbi8qKlxuICogT3B0aW9uYWwgaW5saW5lIHRvZ2dsZSBzd2l0Y2ggcmVuZGVyZWQgaW5zaWRlIGFuIGFjdGlvbiBsaXN0IGl0ZW0sIHNob3duIG9uIGl0c1xuICogb3duIHJvdyBiZWxvdyB0aGUgbGFiZWwvZGV0YWlsLiBVc2VmdWwgZm9yIGFuIGFsd2F5cy12aXNpYmxlIGJvb2xlYW4gc3ViLWNvbnRyb2xcbiAqIChlLmcuIGEgc2FuZGJveCB0b2dnbGUpIHRoYXQgaXMgaW5kZXBlbmRlbnQgZnJvbSBzZWxlY3RpbmcgdGhlIGl0ZW0gaXRzZWxmLlxuICovXG5leHBvcnQgaW50ZXJmYWNlIElBY3Rpb25MaXN0SXRlbUlubGluZVRvZ2dsZSB7XG5cdC8qKiBMYWJlbCBzaG93biB0byB0aGUgbGVmdCBvZiB0aGUgc3dpdGNoLiAqL1xuXHRyZWFkb25seSBsYWJlbDogc3RyaW5nO1xuXHQvKiogQ3VycmVudCBjaGVja2VkIHN0YXRlIG9mIHRoZSBzd2l0Y2guICovXG5cdHJlYWRvbmx5IGNoZWNrZWQ6IGJvb2xlYW47XG5cdC8qKiBJbnZva2VkIHdoZW4gdGhlIHVzZXIgZmxpcHMgdGhlIHN3aXRjaC4gKi9cblx0cmVhZG9ubHkgb25DaGFuZ2U6IChjaGVja2VkOiBib29sZWFuKSA9PiB2b2lkO1xuXHQvKiogT3B0aW9uYWwgYWNjZXNzaWJsZS9ob3ZlciB0aXRsZSBmb3IgdGhlIHN3aXRjaC4gRGVmYXVsdHMgdG8ge0BsaW5rIGxhYmVsfS4gKi9cblx0cmVhZG9ubHkgdGl0bGU/OiBzdHJpbmc7XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgSUFjdGlvbkxpc3RJdGVtPFQ+IHtcblx0cmVhZG9ubHkgaXRlbT86IFQ7XG5cdHJlYWRvbmx5IGtpbmQ6IEFjdGlvbkxpc3RJdGVtS2luZDtcblx0cmVhZG9ubHkgZ3JvdXA/OiB7IGtpbmQ/OiB1bmtub3duOyBpY29uPzogVGhlbWVJY29uOyB0aXRsZTogc3RyaW5nIH07XG5cdHJlYWRvbmx5IGRpc2FibGVkPzogYm9vbGVhbjtcblx0cmVhZG9ubHkgbGFiZWw/OiBzdHJpbmc7XG5cdC8qKlxuXHQgKiBPcHRpb25hbCBkZXRhaWwgdGV4dCBkaXNwbGF5ZWQgYXMgYSBzZWNvbmQgbGluZSBiZWxvdyB0aGUgbGFiZWwuXG5cdCAqL1xuXHRyZWFkb25seSBkZXRhaWw/OiBzdHJpbmc7XG5cdC8qKlxuXHQgKiBPcHRpb25hbCBpbmxpbmUgdG9nZ2xlIHN3aXRjaCByZW5kZXJlZCBvbiBpdHMgb3duIHJvdyBpbnNpZGUgdGhlIGl0ZW0uXG5cdCAqL1xuXHRyZWFkb25seSBpbmxpbmVUb2dnbGU/OiBJQWN0aW9uTGlzdEl0ZW1JbmxpbmVUb2dnbGU7XG5cdHJlYWRvbmx5IGRlc2NyaXB0aW9uPzogc3RyaW5nIHwgSU1hcmtkb3duU3RyaW5nO1xuXHQvKipcblx0ICogT3B0aW9uYWwgYWNjZXNzaWJsZSBkZXNjcmlwdGlvbiB1c2VkIGluIHBsYWNlIG9mIHtAbGluayBkZXNjcmlwdGlvbn0gZm9yXG5cdCAqIHNjcmVlbiByZWFkZXIgbGFiZWxzLiBVc2VmdWwgd2hlbiB0aGUgdmlzdWFsIGRlc2NyaXB0aW9uIGNvbnRhaW5zIGljb25zXG5cdCAqIG9yIG90aGVyIG5vbi10ZXh0dWFsIGNvbnRlbnQuXG5cdCAqL1xuXHRyZWFkb25seSBhcmlhRGVzY3JpcHRpb24/OiBzdHJpbmc7XG5cdC8qKlxuXHQgKiBPcHRpb25hbCBob3ZlciBjb25maWd1cmF0aW9uIHNob3duIHdoZW4gZm9jdXNpbmcvaG92ZXJpbmcgb3ZlciB0aGUgaXRlbS5cblx0ICovXG5cdHJlYWRvbmx5IGhvdmVyPzogSUFjdGlvbkxpc3RJdGVtSG92ZXI7XG5cdC8qKlxuXHQgKiBPcHRpb25hbCBhY3Rpb25zIHNob3duIGluIGEgbmVzdGVkIHN1Ym1lbnUgcGFuZWwsIHRyaWdnZXJlZCBieSBhIGNoZXZyb25cblx0ICogaW5kaWNhdG9yIG9uIHRoZSByaWdodCBzaWRlIG9mIHRoZSBpdGVtLiBXaGVuIHNldCwgaG92ZXJpbmcgb3IgY2xpY2tpbmdcblx0ICogdGhlIGNoZXZyb24gb3BlbnMgYW4gaW5saW5lIHN1Ym1lbnUgd2l0aCB0aGVzZSBhY3Rpb25zLlxuXHQgKi9cblx0cmVhZG9ubHkgc3VibWVudUFjdGlvbnM/OiBJQWN0aW9uW107XG5cdHJlYWRvbmx5IGtleWJpbmRpbmc/OiBSZXNvbHZlZEtleWJpbmRpbmc7XG5cdGNhblByZXZpZXc/OiBib29sZWFuIHwgdW5kZWZpbmVkO1xuXHRyZWFkb25seSBoaWRlSWNvbj86IGJvb2xlYW47XG5cdHJlYWRvbmx5IHRvb2x0aXA/OiBzdHJpbmc7XG5cdC8qKlxuXHQgKiBPcHRpb25hbCB0b29sYmFyIGFjdGlvbnMgc2hvd24gd2hlbiB0aGUgaXRlbSBpcyBmb2N1c2VkIG9yIGhvdmVyZWQuXG5cdCAqL1xuXHRyZWFkb25seSB0b29sYmFyQWN0aW9ucz86IElBY3Rpb25bXTtcblx0LyoqXG5cdCAqIE9wdGlvbmFsIHNlY3Rpb24gaWRlbnRpZmllci4gSXRlbXMgd2l0aCB0aGUgc2FtZSBzZWN0aW9uIGJlbG9uZyB0byB0aGUgc2FtZVxuXHQgKiBjb2xsYXBzaWJsZSBncm91cC4gT25seSBtZWFuaW5nZnVsIHdoZW4gdGhlIEFjdGlvbkxpc3QgaXMgY3JlYXRlZCB3aXRoXG5cdCAqIGNvbGxhcHNpYmxlIHNlY3Rpb25zLlxuXHQgKi9cblx0cmVhZG9ubHkgc2VjdGlvbj86IHN0cmluZztcblx0LyoqXG5cdCAqIFdoZW4gdHJ1ZSwgY2xpY2tpbmcgdGhpcyBpdGVtIHRvZ2dsZXMgdGhlIHNlY3Rpb24ncyBjb2xsYXBzZWQgc3RhdGVcblx0ICogaW5zdGVhZCBvZiBzZWxlY3RpbmcgaXQuXG5cdCAqL1xuXHRyZWFkb25seSBpc1NlY3Rpb25Ub2dnbGU/OiBib29sZWFuO1xuXHQvKipcblx0ICogT3B0aW9uYWwgQ1NTIGNsYXNzIG5hbWUgdG8gYWRkIHRvIHRoZSByb3cgY29udGFpbmVyLlxuXHQgKi9cblx0cmVhZG9ubHkgY2xhc3NOYW1lPzogc3RyaW5nO1xuXHQvKipcblx0ICogT3B0aW9uYWwgYmFkZ2UgdGV4dCB0byBkaXNwbGF5IGFmdGVyIHRoZSBsYWJlbCAoZS5nLiwgXCJOZXdcIikuXG5cdCAqL1xuXHRyZWFkb25seSBiYWRnZT86IHN0cmluZztcblx0LyoqXG5cdCAqIFdoZW4gdHJ1ZSwgdGhpcyBpdGVtIGlzIGFsd2F5cyBzaG93biB3aGVuIGZpbHRlcmluZyBwcm9kdWNlcyBubyBvdGhlciByZXN1bHRzLlxuXHQgKi9cblx0cmVhZG9ubHkgc2hvd0Fsd2F5cz86IGJvb2xlYW47XG5cdC8qKlxuXHQgKiBPcHRpb25hbCBjYWxsYmFjayBpbnZva2VkIHdoZW4gdGhlIGl0ZW0gaXMgcmVtb3ZlZCB2aWEgdGhlIGJ1aWx0LWluIHJlbW92ZSBidXR0b24uXG5cdCAqIFdoZW4gc2V0LCBhIGNsb3NlIGJ1dHRvbiBpcyBhdXRvbWF0aWNhbGx5IGFkZGVkIHRvIHRoZSBpdGVtIHRvb2xiYXIuXG5cdCAqL1xuXHRyZWFkb25seSBvblJlbW92ZT86ICgpID0+IHZvaWQgfCBQcm9taXNlPHZvaWQ+O1xufVxuXG5pbnRlcmZhY2UgSUFjdGlvbk1lbnVUZW1wbGF0ZURhdGEge1xuXHRyZWFkb25seSBjb250YWluZXI6IEhUTUxFbGVtZW50O1xuXHRyZWFkb25seSBpY29uOiBIVE1MRWxlbWVudDtcblx0cmVhZG9ubHkgdGV4dDogSFRNTEVsZW1lbnQ7XG5cdHJlYWRvbmx5IGRldGFpbDogSFRNTEVsZW1lbnQ7XG5cdHJlYWRvbmx5IGJhZGdlOiBIVE1MRWxlbWVudDtcblx0cmVhZG9ubHkgZGVzY3JpcHRpb24/OiBIVE1MRWxlbWVudDtcblx0cmVhZG9ubHkgZ3JvdXBUaXRsZTogSFRNTEVsZW1lbnQ7XG5cdHJlYWRvbmx5IGtleWJpbmRpbmc6IEtleWJpbmRpbmdMYWJlbDtcblx0cmVhZG9ubHkgdG9vbGJhcjogSFRNTEVsZW1lbnQ7XG5cdHJlYWRvbmx5IHN1Ym1lbnVJbmRpY2F0b3I6IEhUTUxFbGVtZW50O1xuXHRyZWFkb25seSBpbmxpbmVUb2dnbGVDb250YWluZXI6IEhUTUxFbGVtZW50O1xuXHRyZWFkb25seSBlbGVtZW50RGlzcG9zYWJsZXM6IERpc3Bvc2FibGVTdG9yZTtcblx0cHJldmlvdXNDbGFzc05hbWU/OiBzdHJpbmc7XG59XG5cbmV4cG9ydCBjb25zdCBlbnVtIEFjdGlvbkxpc3RJdGVtS2luZCB7XG5cdEFjdGlvbiA9ICdhY3Rpb24nLFxuXHRIZWFkZXIgPSAnaGVhZGVyJyxcblx0U2VwYXJhdG9yID0gJ3NlcGFyYXRvcidcbn1cblxuaW50ZXJmYWNlIElIZWFkZXJUZW1wbGF0ZURhdGEge1xuXHRyZWFkb25seSBjb250YWluZXI6IEhUTUxFbGVtZW50O1xuXHRyZWFkb25seSB0ZXh0OiBIVE1MRWxlbWVudDtcbn1cblxuY2xhc3MgSGVhZGVyUmVuZGVyZXI8VD4gaW1wbGVtZW50cyBJTGlzdFJlbmRlcmVyPElBY3Rpb25MaXN0SXRlbTxUPiwgSUhlYWRlclRlbXBsYXRlRGF0YT4ge1xuXG5cdGdldCB0ZW1wbGF0ZUlkKCk6IHN0cmluZyB7IHJldHVybiBBY3Rpb25MaXN0SXRlbUtpbmQuSGVhZGVyOyB9XG5cblx0cmVuZGVyVGVtcGxhdGUoY29udGFpbmVyOiBIVE1MRWxlbWVudCk6IElIZWFkZXJUZW1wbGF0ZURhdGEge1xuXHRcdGNvbnRhaW5lci5jbGFzc0xpc3QuYWRkKCdncm91cC1oZWFkZXInKTtcblxuXHRcdGNvbnN0IHRleHQgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdzcGFuJyk7XG5cdFx0Y29udGFpbmVyLmFwcGVuZCh0ZXh0KTtcblxuXHRcdHJldHVybiB7IGNvbnRhaW5lciwgdGV4dCB9O1xuXHR9XG5cblx0cmVuZGVyRWxlbWVudChlbGVtZW50OiBJQWN0aW9uTGlzdEl0ZW08VD4sIF9pbmRleDogbnVtYmVyLCB0ZW1wbGF0ZURhdGE6IElIZWFkZXJUZW1wbGF0ZURhdGEpOiB2b2lkIHtcblx0XHR0ZW1wbGF0ZURhdGEudGV4dC50ZXh0Q29udGVudCA9IGVsZW1lbnQuZ3JvdXA/LnRpdGxlID8/IGVsZW1lbnQubGFiZWwgPz8gJyc7XG5cdH1cblxuXHRkaXNwb3NlVGVtcGxhdGUoX3RlbXBsYXRlRGF0YTogSUhlYWRlclRlbXBsYXRlRGF0YSk6IHZvaWQge1xuXHRcdC8vIG5vb3Bcblx0fVxufVxuXG5pbnRlcmZhY2UgSVNlcGFyYXRvclRlbXBsYXRlRGF0YSB7XG5cdHJlYWRvbmx5IGNvbnRhaW5lcjogSFRNTEVsZW1lbnQ7XG5cdHJlYWRvbmx5IHRleHQ6IEhUTUxFbGVtZW50O1xufVxuXG5jbGFzcyBTZXBhcmF0b3JSZW5kZXJlcjxUPiBpbXBsZW1lbnRzIElMaXN0UmVuZGVyZXI8SUFjdGlvbkxpc3RJdGVtPFQ+LCBJU2VwYXJhdG9yVGVtcGxhdGVEYXRhPiB7XG5cblx0Z2V0IHRlbXBsYXRlSWQoKTogc3RyaW5nIHsgcmV0dXJuIEFjdGlvbkxpc3RJdGVtS2luZC5TZXBhcmF0b3I7IH1cblxuXHRyZW5kZXJUZW1wbGF0ZShjb250YWluZXI6IEhUTUxFbGVtZW50KTogSVNlcGFyYXRvclRlbXBsYXRlRGF0YSB7XG5cdFx0Y29udGFpbmVyLmNsYXNzTGlzdC5hZGQoJ3NlcGFyYXRvcicpO1xuXG5cdFx0Y29uc3QgdGV4dCA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ3NwYW4nKTtcblx0XHRjb250YWluZXIuYXBwZW5kKHRleHQpO1xuXG5cdFx0cmV0dXJuIHsgY29udGFpbmVyLCB0ZXh0IH07XG5cdH1cblxuXHRyZW5kZXJFbGVtZW50KGVsZW1lbnQ6IElBY3Rpb25MaXN0SXRlbTxUPiwgX2luZGV4OiBudW1iZXIsIHRlbXBsYXRlRGF0YTogSVNlcGFyYXRvclRlbXBsYXRlRGF0YSk6IHZvaWQge1xuXHRcdHRlbXBsYXRlRGF0YS50ZXh0LnRleHRDb250ZW50ID0gZWxlbWVudC5sYWJlbCA/PyAnJztcblx0fVxuXG5cdGRpc3Bvc2VUZW1wbGF0ZShfdGVtcGxhdGVEYXRhOiBJU2VwYXJhdG9yVGVtcGxhdGVEYXRhKTogdm9pZCB7XG5cdFx0Ly8gbm9vcFxuXHR9XG59XG5cbmNsYXNzIEFjdGlvbkl0ZW1SZW5kZXJlcjxUPiBpbXBsZW1lbnRzIElMaXN0UmVuZGVyZXI8SUFjdGlvbkxpc3RJdGVtPFQ+LCBJQWN0aW9uTWVudVRlbXBsYXRlRGF0YT4ge1xuXG5cdGdldCB0ZW1wbGF0ZUlkKCk6IHN0cmluZyB7IHJldHVybiBBY3Rpb25MaXN0SXRlbUtpbmQuQWN0aW9uOyB9XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0cHJpdmF0ZSByZWFkb25seSBfc3VwcG9ydHNQcmV2aWV3OiBib29sZWFuLFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX29uUmVtb3ZlSXRlbTogKChpdGVtOiBJQWN0aW9uTGlzdEl0ZW08VD4pID0+IHZvaWQpIHwgdW5kZWZpbmVkLFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX29uU2hvd1N1Ym1lbnU6ICgoaXRlbTogSUFjdGlvbkxpc3RJdGVtPFQ+KSA9PiB2b2lkKSB8IHVuZGVmaW5lZCxcblx0XHRwcml2YXRlIHJlYWRvbmx5IF9oYXNBbnlTdWJtZW51QWN0aW9uczogYm9vbGVhbixcblx0XHRwcml2YXRlIHJlYWRvbmx5IF9ncm91cFRpdGxlQnlJbmRleDogUmVhZG9ubHlNYXA8bnVtYmVyLCBzdHJpbmc+LFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX2xpbmtIYW5kbGVyOiAoKHVyaTogVVJJLCBpdGVtOiBJQWN0aW9uTGlzdEl0ZW08VD4pID0+IHZvaWQpIHwgdW5kZWZpbmVkLFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX2hpZGVEZWZhdWx0S2V5YmluZGluZ1Rvb2x0aXA6IGJvb2xlYW4sXG5cdFx0QElLZXliaW5kaW5nU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9rZXliaW5kaW5nU2VydmljZTogSUtleWJpbmRpbmdTZXJ2aWNlLFxuXHRcdEBJT3BlbmVyU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9vcGVuZXJTZXJ2aWNlOiBJT3BlbmVyU2VydmljZSxcblx0KSB7IH1cblxuXHRyZW5kZXJUZW1wbGF0ZShjb250YWluZXI6IEhUTUxFbGVtZW50KTogSUFjdGlvbk1lbnVUZW1wbGF0ZURhdGEge1xuXHRcdGNvbnRhaW5lci5jbGFzc0xpc3QuYWRkKHRoaXMudGVtcGxhdGVJZCk7XG5cblx0XHRjb25zdCBpY29uID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnZGl2Jyk7XG5cdFx0aWNvbi5jbGFzc05hbWUgPSAnaWNvbic7XG5cdFx0Y29udGFpbmVyLmFwcGVuZChpY29uKTtcblxuXHRcdGNvbnN0IHRleHQgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdzcGFuJyk7XG5cdFx0dGV4dC5jbGFzc05hbWUgPSAndGl0bGUnO1xuXHRcdGNvbnRhaW5lci5hcHBlbmQodGV4dCk7XG5cblx0XHRjb25zdCBiYWRnZSA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ3NwYW4nKTtcblx0XHRiYWRnZS5jbGFzc05hbWUgPSAnYWN0aW9uLWl0ZW0tYmFkZ2UnO1xuXHRcdGNvbnRhaW5lci5hcHBlbmQoYmFkZ2UpO1xuXG5cdFx0Y29uc3QgZGVzY3JpcHRpb24gPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdzcGFuJyk7XG5cdFx0ZGVzY3JpcHRpb24uY2xhc3NOYW1lID0gJ2Rlc2NyaXB0aW9uJztcblx0XHRjb250YWluZXIuYXBwZW5kKGRlc2NyaXB0aW9uKTtcblxuXHRcdGNvbnN0IGdyb3VwVGl0bGUgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdzcGFuJyk7XG5cdFx0Z3JvdXBUaXRsZS5jbGFzc05hbWUgPSAnZ3JvdXAtdGl0bGUnO1xuXHRcdGNvbnRhaW5lci5hcHBlbmQoZ3JvdXBUaXRsZSk7XG5cblx0XHRjb25zdCBkZXRhaWwgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdzcGFuJyk7XG5cdFx0ZGV0YWlsLmNsYXNzTmFtZSA9ICdkZXRhaWwnO1xuXHRcdGNvbnRhaW5lci5hcHBlbmQoZGV0YWlsKTtcblxuXHRcdGNvbnN0IGtleWJpbmRpbmcgPSBuZXcgS2V5YmluZGluZ0xhYmVsKGNvbnRhaW5lciwgT1MpO1xuXG5cdFx0Y29uc3QgdG9vbGJhciA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2RpdicpO1xuXHRcdHRvb2xiYXIuY2xhc3NOYW1lID0gJ2FjdGlvbi1saXN0LWl0ZW0tdG9vbGJhcic7XG5cdFx0Y29udGFpbmVyLmFwcGVuZCh0b29sYmFyKTtcblxuXHRcdGNvbnN0IHN1Ym1lbnVJbmRpY2F0b3IgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdkaXYnKTtcblx0XHRzdWJtZW51SW5kaWNhdG9yLmNsYXNzTmFtZSA9ICdhY3Rpb24tbGlzdC1zdWJtZW51LWluZGljYXRvcic7XG5cdFx0Y29udGFpbmVyLmFwcGVuZChzdWJtZW51SW5kaWNhdG9yKTtcblxuXHRcdGNvbnN0IGlubGluZVRvZ2dsZUNvbnRhaW5lciA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2RpdicpO1xuXHRcdGlubGluZVRvZ2dsZUNvbnRhaW5lci5jbGFzc05hbWUgPSAnYWN0aW9uLWxpc3QtaXRlbS1pbmxpbmUtdG9nZ2xlJztcblx0XHRjb250YWluZXIuYXBwZW5kKGlubGluZVRvZ2dsZUNvbnRhaW5lcik7XG5cblx0XHRjb25zdCBlbGVtZW50RGlzcG9zYWJsZXMgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cblx0XHRyZXR1cm4geyBjb250YWluZXIsIGljb24sIHRleHQsIGRldGFpbCwgYmFkZ2UsIGRlc2NyaXB0aW9uLCBncm91cFRpdGxlLCBrZXliaW5kaW5nLCB0b29sYmFyLCBzdWJtZW51SW5kaWNhdG9yLCBpbmxpbmVUb2dnbGVDb250YWluZXIsIGVsZW1lbnREaXNwb3NhYmxlcyB9O1xuXHR9XG5cblx0cmVuZGVyRWxlbWVudChlbGVtZW50OiBJQWN0aW9uTGlzdEl0ZW08VD4sIF9pbmRleDogbnVtYmVyLCBkYXRhOiBJQWN0aW9uTWVudVRlbXBsYXRlRGF0YSk6IHZvaWQge1xuXHRcdC8vIENsZWFyIHByZXZpb3VzIGVsZW1lbnQgZGlzcG9zYWJsZXNcblx0XHRkYXRhLmVsZW1lbnREaXNwb3NhYmxlcy5jbGVhcigpO1xuXG5cdFx0aWYgKGVsZW1lbnQuZ3JvdXA/Lmljb24pIHtcblx0XHRcdGRhdGEuaWNvbi5jbGFzc05hbWUgPSBUaGVtZUljb24uYXNDbGFzc05hbWUoZWxlbWVudC5ncm91cC5pY29uKTtcblx0XHRcdGlmIChlbGVtZW50Lmdyb3VwLmljb24uY29sb3IpIHtcblx0XHRcdFx0ZGF0YS5pY29uLnN0eWxlLmNvbG9yID0gYXNDc3NWYXJpYWJsZShlbGVtZW50Lmdyb3VwLmljb24uY29sb3IuaWQpO1xuXHRcdFx0fVxuXHRcdH0gZWxzZSB7XG5cdFx0XHRkYXRhLmljb24uY2xhc3NOYW1lID0gVGhlbWVJY29uLmFzQ2xhc3NOYW1lKENvZGljb24ubGlnaHRCdWxiKTtcblx0XHRcdGRhdGEuaWNvbi5zdHlsZS5jb2xvciA9ICd2YXIoLS12c2NvZGUtZWRpdG9yTGlnaHRCdWxiLWZvcmVncm91bmQpJztcblx0XHR9XG5cblx0XHRpZiAoIWVsZW1lbnQuaXRlbSB8fCAhZWxlbWVudC5sYWJlbCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGRvbS5zZXRWaXNpYmlsaXR5KCFlbGVtZW50LmhpZGVJY29uLCBkYXRhLmljb24pO1xuXG5cdFx0Ly8gU2V0IGFyaWEtZXhwYW5kZWQgZm9yIHNlY3Rpb24gdG9nZ2xlIGl0ZW1zXG5cdFx0aWYgKGVsZW1lbnQuaXNTZWN0aW9uVG9nZ2xlKSB7XG5cdFx0XHRjb25zdCBleHBhbmRlZCA9IGVsZW1lbnQuZ3JvdXA/Lmljb24gPT09IENvZGljb24uY2hldnJvbkRvd247XG5cdFx0XHRkYXRhLmNvbnRhaW5lci5zZXRBdHRyaWJ1dGUoJ2FyaWEtZXhwYW5kZWQnLCBTdHJpbmcoZXhwYW5kZWQpKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0ZGF0YS5jb250YWluZXIucmVtb3ZlQXR0cmlidXRlKCdhcmlhLWV4cGFuZGVkJyk7XG5cdFx0fVxuXG5cdFx0Ly8gQXBwbHkgb3B0aW9uYWwgY2xhc3NOYW1lIC0gY2xlYW4gdXAgcHJldmlvdXMgdG8gYXZvaWQgc3RhbGUgY2xhc3Nlc1xuXHRcdC8vIGZyb20gdmlydHVhbGl6ZWQgcm93IHJldXNlXG5cdFx0aWYgKGRhdGEucHJldmlvdXNDbGFzc05hbWUpIHtcblx0XHRcdGRhdGEuY29udGFpbmVyLmNsYXNzTGlzdC5yZW1vdmUoZGF0YS5wcmV2aW91c0NsYXNzTmFtZSk7XG5cdFx0fVxuXHRcdGRhdGEuY29udGFpbmVyLmNsYXNzTGlzdC50b2dnbGUoJ2FjdGlvbi1saXN0LWN1c3RvbScsICEhZWxlbWVudC5jbGFzc05hbWUpO1xuXHRcdGlmIChlbGVtZW50LmNsYXNzTmFtZSkge1xuXHRcdFx0ZGF0YS5jb250YWluZXIuY2xhc3NMaXN0LmFkZChlbGVtZW50LmNsYXNzTmFtZSk7XG5cdFx0fVxuXHRcdGRhdGEucHJldmlvdXNDbGFzc05hbWUgPSBlbGVtZW50LmNsYXNzTmFtZTtcblxuXHRcdGRhdGEudGV4dC50ZXh0Q29udGVudCA9IHN0cmlwTmV3bGluZXMoZWxlbWVudC5sYWJlbCk7XG5cblx0XHQvLyBSZW5kZXIgb3B0aW9uYWwgYmFkZ2Vcblx0XHRpZiAoZWxlbWVudC5iYWRnZSkge1xuXHRcdFx0ZGF0YS5iYWRnZS50ZXh0Q29udGVudCA9IGVsZW1lbnQuYmFkZ2U7XG5cdFx0XHRkYXRhLmJhZGdlLnN0eWxlLmRpc3BsYXkgPSAnJztcblx0XHR9IGVsc2Uge1xuXHRcdFx0ZGF0YS5iYWRnZS50ZXh0Q29udGVudCA9ICcnO1xuXHRcdFx0ZGF0YS5iYWRnZS5zdHlsZS5kaXNwbGF5ID0gJ25vbmUnO1xuXHRcdH1cblxuXHRcdGlmIChlbGVtZW50LmtleWJpbmRpbmcpIHtcblx0XHRcdGRhdGEuZGVzY3JpcHRpb24hLnRleHRDb250ZW50ID0gZWxlbWVudC5rZXliaW5kaW5nLmdldExhYmVsKCk7XG5cdFx0XHRkYXRhLmRlc2NyaXB0aW9uIS5zdHlsZS5kaXNwbGF5ID0gJ2lubGluZSc7XG5cdFx0XHRkYXRhLmRlc2NyaXB0aW9uIS5zdHlsZS5sZXR0ZXJTcGFjaW5nID0gJzAuNXB4Jztcblx0XHR9IGVsc2UgaWYgKGVsZW1lbnQuZGVzY3JpcHRpb24pIHtcblx0XHRcdGRvbS5jbGVhck5vZGUoZGF0YS5kZXNjcmlwdGlvbiEpO1xuXHRcdFx0aWYgKHR5cGVvZiBlbGVtZW50LmRlc2NyaXB0aW9uID09PSAnc3RyaW5nJykge1xuXHRcdFx0XHRkYXRhLmRlc2NyaXB0aW9uIS50ZXh0Q29udGVudCA9IHN0cmlwTmV3bGluZXMoZWxlbWVudC5kZXNjcmlwdGlvbik7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRjb25zdCByZW5kZXJlZCA9IHJlbmRlck1hcmtkb3duKGVsZW1lbnQuZGVzY3JpcHRpb24sIHtcblx0XHRcdFx0XHRhY3Rpb25IYW5kbGVyOiAoY29udGVudDogc3RyaW5nKSA9PiB7XG5cdFx0XHRcdFx0XHRjb25zdCB1cmkgPSBVUkkucGFyc2UoY29udGVudCk7XG5cdFx0XHRcdFx0XHRpZiAodGhpcy5fbGlua0hhbmRsZXIpIHtcblx0XHRcdFx0XHRcdFx0dGhpcy5fbGlua0hhbmRsZXIodXJpLCBlbGVtZW50KTtcblx0XHRcdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0XHRcdHZvaWQgdGhpcy5fb3BlbmVyU2VydmljZS5vcGVuKHVyaSwgeyBhbGxvd0NvbW1hbmRzOiB0cnVlIH0pO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH1cblx0XHRcdFx0fSk7XG5cdFx0XHRcdGRhdGEuZWxlbWVudERpc3Bvc2FibGVzLmFkZChyZW5kZXJlZCk7XG5cdFx0XHRcdGRhdGEuZGVzY3JpcHRpb24hLmFwcGVuZENoaWxkKHJlbmRlcmVkLmVsZW1lbnQpO1xuXHRcdFx0fVxuXHRcdFx0ZGF0YS5kZXNjcmlwdGlvbiEuc3R5bGUuZGlzcGxheSA9ICdpbmxpbmUnO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRkYXRhLmRlc2NyaXB0aW9uIS50ZXh0Q29udGVudCA9ICcnO1xuXHRcdFx0ZGF0YS5kZXNjcmlwdGlvbiEuc3R5bGUuZGlzcGxheSA9ICdub25lJztcblx0XHR9XG5cblx0XHQvLyBSZW5kZXIgZ3JvdXAgdGl0bGUgKHNob3duIHRvIHRoZSByaWdodCwgc2VwYXJhdGUgZnJvbSBkZXNjcmlwdGlvbilcblx0XHRjb25zdCBncm91cFRpdGxlVGV4dCA9IHRoaXMuX2dyb3VwVGl0bGVCeUluZGV4LmdldChfaW5kZXgpO1xuXHRcdGlmIChncm91cFRpdGxlVGV4dCkge1xuXHRcdFx0ZGF0YS5ncm91cFRpdGxlLnRleHRDb250ZW50ID0gZ3JvdXBUaXRsZVRleHQ7XG5cdFx0XHRkYXRhLmdyb3VwVGl0bGUuc3R5bGUuZGlzcGxheSA9ICcnO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRkYXRhLmdyb3VwVGl0bGUudGV4dENvbnRlbnQgPSAnJztcblx0XHRcdGRhdGEuZ3JvdXBUaXRsZS5zdHlsZS5kaXNwbGF5ID0gJ25vbmUnO1xuXHRcdH1cblxuXHRcdC8vIFJlbmRlciBvcHRpb25hbCBkZXRhaWwgKHNob3duIGFzIHNlY29uZCBsaW5lIGJlbG93IHRoZSBsYWJlbClcblx0XHRpZiAoZWxlbWVudC5kZXRhaWwpIHtcblx0XHRcdGRhdGEuZGV0YWlsLnRleHRDb250ZW50ID0gc3RyaXBOZXdsaW5lcyhlbGVtZW50LmRldGFpbCk7XG5cdFx0XHRkYXRhLmRldGFpbC5zdHlsZS5kaXNwbGF5ID0gJyc7XG5cdFx0fSBlbHNlIHtcblx0XHRcdGRhdGEuZGV0YWlsLnRleHRDb250ZW50ID0gJyc7XG5cdFx0XHRkYXRhLmRldGFpbC5zdHlsZS5kaXNwbGF5ID0gJ25vbmUnO1xuXHRcdH1cblxuXHRcdC8vIFJlbmRlciBvcHRpb25hbCBpbmxpbmUgdG9nZ2xlIChzaG93biBhcyBpdHMgb3duIHJvdyBiZWxvdyB0aGUgZGV0YWlsKVxuXHRcdGRvbS5jbGVhck5vZGUoZGF0YS5pbmxpbmVUb2dnbGVDb250YWluZXIpO1xuXHRcdGlmIChlbGVtZW50LmlubGluZVRvZ2dsZSkge1xuXHRcdFx0Y29uc3QgaW5saW5lVG9nZ2xlID0gZWxlbWVudC5pbmxpbmVUb2dnbGU7XG5cdFx0XHRjb25zdCB0b2dnbGVMYWJlbCA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ3NwYW4nKTtcblx0XHRcdHRvZ2dsZUxhYmVsLmNsYXNzTmFtZSA9ICdhY3Rpb24tbGlzdC1pdGVtLWlubGluZS10b2dnbGUtbGFiZWwnO1xuXHRcdFx0dG9nZ2xlTGFiZWwudGV4dENvbnRlbnQgPSBzdHJpcE5ld2xpbmVzKGlubGluZVRvZ2dsZS5sYWJlbCk7XG5cdFx0XHRkYXRhLmlubGluZVRvZ2dsZUNvbnRhaW5lci5hcHBlbmQodG9nZ2xlTGFiZWwpO1xuXHRcdFx0ZGF0YS5pbmxpbmVUb2dnbGVDb250YWluZXIuc3R5bGUuZGlzcGxheSA9ICcnO1xuXHRcdFx0ZGF0YS5jb250YWluZXIuY2xhc3NMaXN0LmFkZCgnaGFzLWlubGluZS10b2dnbGUnKTtcblx0XHRcdGNvbnN0IHRvZ2dsZSA9IGRhdGEuZWxlbWVudERpc3Bvc2FibGVzLmFkZChuZXcgVG9nZ2xlKHtcblx0XHRcdFx0dGl0bGU6IGlubGluZVRvZ2dsZS50aXRsZSA/PyBpbmxpbmVUb2dnbGUubGFiZWwsXG5cdFx0XHRcdGlzQ2hlY2tlZDogaW5saW5lVG9nZ2xlLmNoZWNrZWQsXG5cdFx0XHRcdGFjdGlvbkNsYXNzTmFtZTogJ2FjdGlvbi1saXN0LWlubGluZS1zd2l0Y2gnLFxuXHRcdFx0XHRub3RGb2N1c2FibGU6IGZhbHNlLFxuXHRcdFx0XHRpbnB1dEFjdGl2ZU9wdGlvbkJvcmRlcjogdW5kZWZpbmVkLFxuXHRcdFx0XHRpbnB1dEFjdGl2ZU9wdGlvbkZvcmVncm91bmQ6IHVuZGVmaW5lZCxcblx0XHRcdFx0aW5wdXRBY3RpdmVPcHRpb25CYWNrZ3JvdW5kOiB1bmRlZmluZWQsXG5cdFx0XHR9KSk7XG5cdFx0XHRkYXRhLmlubGluZVRvZ2dsZUNvbnRhaW5lci5hcHBlbmQodG9nZ2xlLmRvbU5vZGUpO1xuXHRcdFx0ZGF0YS5lbGVtZW50RGlzcG9zYWJsZXMuYWRkKHRvZ2dsZS5vbkNoYW5nZSgoKSA9PiBpbmxpbmVUb2dnbGUub25DaGFuZ2UodG9nZ2xlLmNoZWNrZWQpKSk7XG5cdFx0XHQvLyBLZWVwIGNsaWNrcyBvbiB0aGUgdG9nZ2xlIHJvdyBmcm9tIHNlbGVjdGluZyB0aGUgaXRlbS5cblx0XHRcdGRhdGEuZWxlbWVudERpc3Bvc2FibGVzLmFkZChkb20uYWRkRGlzcG9zYWJsZUxpc3RlbmVyKGRhdGEuaW5saW5lVG9nZ2xlQ29udGFpbmVyLCBkb20uRXZlbnRUeXBlLkNMSUNLLCBlID0+IGUuc3RvcFByb3BhZ2F0aW9uKCkpKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0ZGF0YS5pbmxpbmVUb2dnbGVDb250YWluZXIuc3R5bGUuZGlzcGxheSA9ICdub25lJztcblx0XHRcdGRhdGEuY29udGFpbmVyLmNsYXNzTGlzdC5yZW1vdmUoJ2hhcy1pbmxpbmUtdG9nZ2xlJyk7XG5cdFx0fVxuXG5cdFx0Y29uc3QgYWN0aW9uVGl0bGUgPSB0aGlzLl9rZXliaW5kaW5nU2VydmljZS5sb29rdXBLZXliaW5kaW5nKGFjY2VwdFNlbGVjdGVkQWN0aW9uQ29tbWFuZCk/LmdldExhYmVsKCk7XG5cdFx0Y29uc3QgcHJldmlld1RpdGxlID0gdGhpcy5fa2V5YmluZGluZ1NlcnZpY2UubG9va3VwS2V5YmluZGluZyhwcmV2aWV3U2VsZWN0ZWRBY3Rpb25Db21tYW5kKT8uZ2V0TGFiZWwoKTtcblx0XHRkYXRhLmNvbnRhaW5lci5jbGFzc0xpc3QudG9nZ2xlKCdvcHRpb24tZGlzYWJsZWQnLCAhIWVsZW1lbnQuZGlzYWJsZWQpO1xuXHRcdGlmIChlbGVtZW50LmhvdmVyICE9PSB1bmRlZmluZWQpIHtcblx0XHRcdC8vIERvbid0IHNob3cgdG9vbHRpcCB3aGVuIGhvdmVyIGNvbnRlbnQgaXMgY29uZmlndXJlZCAtIHRoZSByaWNoIGhvdmVyIHdpbGwgc2hvdyBpbnN0ZWFkXG5cdFx0XHRkYXRhLmNvbnRhaW5lci50aXRsZSA9ICcnO1xuXHRcdH0gZWxzZSBpZiAoZWxlbWVudC50b29sdGlwKSB7XG5cdFx0XHRkYXRhLmNvbnRhaW5lci50aXRsZSA9IGVsZW1lbnQudG9vbHRpcDtcblx0XHR9IGVsc2UgaWYgKGVsZW1lbnQuZGlzYWJsZWQpIHtcblx0XHRcdGRhdGEuY29udGFpbmVyLnRpdGxlID0gZWxlbWVudC5sYWJlbDtcblx0XHR9IGVsc2UgaWYgKHRoaXMuX2hpZGVEZWZhdWx0S2V5YmluZGluZ1Rvb2x0aXApIHtcblx0XHRcdGRhdGEuY29udGFpbmVyLnRpdGxlID0gJyc7XG5cdFx0fSBlbHNlIGlmIChhY3Rpb25UaXRsZSAmJiBwcmV2aWV3VGl0bGUpIHtcblx0XHRcdGlmICh0aGlzLl9zdXBwb3J0c1ByZXZpZXcgJiYgZWxlbWVudC5jYW5QcmV2aWV3KSB7XG5cdFx0XHRcdGRhdGEuY29udGFpbmVyLnRpdGxlID0gbG9jYWxpemUoeyBrZXk6ICdsYWJlbC1wcmV2aWV3JywgY29tbWVudDogWydwbGFjZWhvbGRlcnMgYXJlIGtleWJpbmRpbmdzLCBlLmcgXCJGMiB0byBBcHBseSwgU2hpZnQrRjIgdG8gUHJldmlld1wiJ10gfSwgXCJ7MH0gdG8gQXBwbHksIHsxfSB0byBQcmV2aWV3XCIsIGFjdGlvblRpdGxlLCBwcmV2aWV3VGl0bGUpO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0ZGF0YS5jb250YWluZXIudGl0bGUgPSBsb2NhbGl6ZSh7IGtleTogJ2xhYmVsJywgY29tbWVudDogWydwbGFjZWhvbGRlciBpcyBhIGtleWJpbmRpbmcsIGUuZyBcIkYyIHRvIEFwcGx5XCInXSB9LCBcInswfSB0byBBcHBseVwiLCBhY3Rpb25UaXRsZSk7XG5cdFx0XHR9XG5cdFx0fSBlbHNlIHtcblx0XHRcdGRhdGEuY29udGFpbmVyLnRpdGxlID0gJyc7XG5cdFx0fVxuXG5cdFx0Ly8gQ2xlYXIgYW5kIHJlbmRlciB0b29sYmFyIGFjdGlvbnNcblx0XHRkb20uY2xlYXJOb2RlKGRhdGEudG9vbGJhcik7XG5cdFx0Y29uc3QgdG9vbGJhckFjdGlvbnMgPSBbLi4uKGVsZW1lbnQudG9vbGJhckFjdGlvbnMgPz8gW10pXTtcblx0XHRpZiAoZWxlbWVudC5vblJlbW92ZSkge1xuXHRcdFx0dG9vbGJhckFjdGlvbnMucHVzaCh0b0FjdGlvbih7XG5cdFx0XHRcdGlkOiAnYWN0aW9uTGlzdC5yZW1vdmUnLFxuXHRcdFx0XHRsYWJlbDogbG9jYWxpemUoJ2FjdGlvbkxpc3QucmVtb3ZlJywgXCJSZW1vdmVcIiksXG5cdFx0XHRcdGNsYXNzOiBUaGVtZUljb24uYXNDbGFzc05hbWUoQ29kaWNvbi5jbG9zZSksXG5cdFx0XHRcdHJ1bjogYXN5bmMgKCkgPT4ge1xuXHRcdFx0XHRcdGF3YWl0IGVsZW1lbnQub25SZW1vdmUhKCk7XG5cdFx0XHRcdFx0dGhpcy5fb25SZW1vdmVJdGVtPy4oZWxlbWVudCk7XG5cdFx0XHRcdH0sXG5cdFx0XHR9KSk7XG5cdFx0fVxuXHRcdGRhdGEuY29udGFpbmVyLmNsYXNzTGlzdC50b2dnbGUoJ2hhcy10b29sYmFyJywgdG9vbGJhckFjdGlvbnMubGVuZ3RoID4gMCk7XG5cdFx0aWYgKHRvb2xiYXJBY3Rpb25zLmxlbmd0aCA+IDApIHtcblx0XHRcdGNvbnN0IGFjdGlvbkJhciA9IG5ldyBBY3Rpb25CYXIoZGF0YS50b29sYmFyKTtcblx0XHRcdGRhdGEuZWxlbWVudERpc3Bvc2FibGVzLmFkZChhY3Rpb25CYXIpO1xuXHRcdFx0YWN0aW9uQmFyLnB1c2godG9vbGJhckFjdGlvbnMsIHsgaWNvbjogdHJ1ZSwgbGFiZWw6IGZhbHNlIH0pO1xuXHRcdH1cblxuXHRcdC8vIFNob3cgc3VibWVudSBpbmRpY2F0b3Igb25seSBmb3IgaXRlbXMgd2l0aCBzdWJtZW51IGFjdGlvbnNcblx0XHQvLyBidXQgbm90IHdoZW4gdGhlIGl0ZW0gYWxzbyBoYXMgaG92ZXIgY29udGVudCAocGFuZWwgYXV0by1zaG93cyBvbiBob3Zlcilcblx0XHRpZiAoZWxlbWVudC5zdWJtZW51QWN0aW9ucz8ubGVuZ3RoICYmICFlbGVtZW50LmhvdmVyPy5jb250ZW50KSB7XG5cdFx0XHRkYXRhLnN1Ym1lbnVJbmRpY2F0b3IuY2xhc3NOYW1lID0gJ2FjdGlvbi1saXN0LXN1Ym1lbnUtaW5kaWNhdG9yIGhhcy1zdWJtZW51ICcgKyBUaGVtZUljb24uYXNDbGFzc05hbWUoQ29kaWNvbi5jaGV2cm9uUmlnaHQpO1xuXHRcdFx0ZGF0YS5zdWJtZW51SW5kaWNhdG9yLnN0eWxlLmRpc3BsYXkgPSAnJztcblx0XHRcdGRhdGEuc3VibWVudUluZGljYXRvci5zdHlsZS52aXNpYmlsaXR5ID0gJyc7XG5cdFx0XHRkYXRhLmVsZW1lbnREaXNwb3NhYmxlcy5hZGQoZG9tLmFkZERpc3Bvc2FibGVMaXN0ZW5lcihkYXRhLnN1Ym1lbnVJbmRpY2F0b3IsIGRvbS5FdmVudFR5cGUuQ0xJQ0ssIChlKSA9PiB7XG5cdFx0XHRcdGUuc3RvcFByb3BhZ2F0aW9uKCk7XG5cdFx0XHRcdHRoaXMuX29uU2hvd1N1Ym1lbnU/LihlbGVtZW50KTtcblx0XHRcdH0pKTtcblx0XHR9IGVsc2UgaWYgKHRoaXMuX2hhc0FueVN1Ym1lbnVBY3Rpb25zKSB7XG5cdFx0XHQvLyBSZXNlcnZlIHNwYWNlIGZvciBhbGlnbm1lbnQgd2hlbiBvdGhlciBpdGVtcyBoYXZlIHN1Ym1lbnVzXG5cdFx0XHRkYXRhLnN1Ym1lbnVJbmRpY2F0b3IuY2xhc3NOYW1lID0gJ2FjdGlvbi1saXN0LXN1Ym1lbnUtaW5kaWNhdG9yJztcblx0XHRcdGRhdGEuc3VibWVudUluZGljYXRvci5zdHlsZS5kaXNwbGF5ID0gJyc7XG5cdFx0XHRkYXRhLnN1Ym1lbnVJbmRpY2F0b3Iuc3R5bGUudmlzaWJpbGl0eSA9ICdoaWRkZW4nO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRkYXRhLnN1Ym1lbnVJbmRpY2F0b3IuY2xhc3NOYW1lID0gJ2FjdGlvbi1saXN0LXN1Ym1lbnUtaW5kaWNhdG9yJztcblx0XHRcdGRhdGEuc3VibWVudUluZGljYXRvci5zdHlsZS5kaXNwbGF5ID0gJ25vbmUnO1xuXHRcdH1cblx0fVxuXG5cdGRpc3Bvc2VUZW1wbGF0ZSh0ZW1wbGF0ZURhdGE6IElBY3Rpb25NZW51VGVtcGxhdGVEYXRhKTogdm9pZCB7XG5cdFx0dGVtcGxhdGVEYXRhLmtleWJpbmRpbmcuZGlzcG9zZSgpO1xuXHRcdHRlbXBsYXRlRGF0YS5lbGVtZW50RGlzcG9zYWJsZXMuZGlzcG9zZSgpO1xuXHR9XG59XG5cbmNsYXNzIEFjY2VwdFNlbGVjdGVkRXZlbnQgZXh0ZW5kcyBVSUV2ZW50IHtcblx0Y29uc3RydWN0b3IoKSB7IHN1cGVyKCdhY2NlcHRTZWxlY3RlZEFjdGlvbicpOyB9XG59XG5cbmNsYXNzIFByZXZpZXdTZWxlY3RlZEV2ZW50IGV4dGVuZHMgVUlFdmVudCB7XG5cdGNvbnN0cnVjdG9yKCkgeyBzdXBlcigncHJldmlld1NlbGVjdGVkQWN0aW9uJyk7IH1cbn1cblxuZnVuY3Rpb24gZ2V0S2V5Ym9hcmROYXZpZ2F0aW9uTGFiZWw8VD4oaXRlbTogSUFjdGlvbkxpc3RJdGVtPFQ+KTogc3RyaW5nIHwgdW5kZWZpbmVkIHtcblx0Ly8gRmlsdGVyIG91dCBoZWFkZXIgdnMuIGFjdGlvbiB2cy4gc2VwYXJhdG9yXG5cdGlmIChpdGVtLmtpbmQgPT09ICdhY3Rpb24nKSB7XG5cdFx0cmV0dXJuIGl0ZW0ubGFiZWw7XG5cdH1cblx0cmV0dXJuIHVuZGVmaW5lZDtcbn1cblxuLyoqXG4gKiBBIFwiTGVhcm4gbW9yZVwiIHN0eWxlIGxpbmsgcmVuZGVyZWQgaW5saW5lIGluIHRoZSBhY3Rpb24gbGlzdCBoZWFkZXIgYmFubmVyLlxuICovXG5leHBvcnQgaW50ZXJmYWNlIElBY3Rpb25MaXN0SGVhZGVyTGluayB7XG5cdC8qKiBWaXNpYmxlIGxpbmsgdGV4dCAoZS5nLiBcIkxlYXJuIG1vcmVcIikuIFNob3VsZCBiZSBsb2NhbGl6ZWQuICovXG5cdHJlYWRvbmx5IGxhYmVsOiBzdHJpbmc7XG5cdC8qKiBUYXJnZXQgb3BlbmVkIHZpYSB0aGUgb3BlbmVyIHNlcnZpY2Ugd2hlbiB0aGUgbGluayBpcyBhY3RpdmF0ZWQuICovXG5cdHJlYWRvbmx5IHVyaTogVVJJO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIElBY3Rpb25MaXN0Q2xvc2VBbmltYXRpb24ge1xuXHRyZWFkb25seSBjbGFzc05hbWU6IHN0cmluZztcblx0cmVhZG9ubHkgZHVyYXRpb246IG51bWJlcjtcblx0cmVhZG9ubHkgcmVxdWlyZWRBbmNlc3RvckNsYXNzZXM/OiByZWFkb25seSBzdHJpbmdbXTtcbn1cblxuLyoqXG4gKiBPcHRpb25zIGZvciBjb25maWd1cmluZyB0aGUgYWN0aW9uIGxpc3QuXG4gKi9cbmV4cG9ydCBpbnRlcmZhY2UgSUFjdGlvbkxpc3RPcHRpb25zIHtcblx0LyoqXG5cdCAqIFdoZW4gdHJ1ZSwgc2hvd3MgYSBmaWx0ZXIgaW5wdXQuXG5cdCAqL1xuXHRyZWFkb25seSBzaG93RmlsdGVyPzogYm9vbGVhbjtcblxuXHQvKipcblx0ICogUGxhY2Vob2xkZXIgdGV4dCBmb3IgdGhlIGZpbHRlciBpbnB1dC5cblx0ICovXG5cdHJlYWRvbmx5IGZpbHRlclBsYWNlaG9sZGVyPzogc3RyaW5nO1xuXG5cdC8qKlxuXHQgKiBPcHRpb25hbCBhY3Rpb25zIHNob3duIGluIHRoZSBmaWx0ZXIgcm93LCB0byB0aGUgcmlnaHQgb2YgdGhlIGlucHV0LlxuXHQgKi9cblx0cmVhZG9ubHkgZmlsdGVyQWN0aW9ucz86IHJlYWRvbmx5IElBY3Rpb25bXTtcblxuXHQvKipcblx0ICogU2VjdGlvbiBJRHMgdGhhdCBzaG91bGQgYmUgY29sbGFwc2VkIGJ5IGRlZmF1bHQuXG5cdCAqL1xuXHRyZWFkb25seSBjb2xsYXBzZWRCeURlZmF1bHQ/OiBSZWFkb25seVNldDxzdHJpbmc+O1xuXG5cdC8qKlxuXHQgKiBNaW5pbXVtIHdpZHRoIGZvciB0aGUgYWN0aW9uIGxpc3QuXG5cdCAqL1xuXHRyZWFkb25seSBtaW5XaWR0aD86IG51bWJlcjtcblxuXHQvKipcblx0ICogTWF4aW11bSB3aWR0aCBmb3IgdGhlIGFjdGlvbiBsaXN0LiBXaGVuIHNldCwgaXRlbXMgd2lkZXIgdGhhbiB0aGlzIGFyZVxuXHQgKiB0cnVuY2F0ZWQgcmF0aGVyIHRoYW4gZXhwYW5kaW5nIHRoZSBwb3B1cC5cblx0ICovXG5cdHJlYWRvbmx5IG1heFdpZHRoPzogbnVtYmVyO1xuXG5cdC8qKlxuXHQgKiBPcHRpb25hbCBoYW5kbGVyIGZvciBtYXJrZG93biBsaW5rcyBhY3RpdmF0ZWQgaW4gaXRlbSBkZXNjcmlwdGlvbnMgb3IgaG92ZXJzLlxuXHQgKiBXaGVuIHVuc2V0LCBsaW5rcyBvcGVuIHZpYSB0aGUgb3BlbmVyIHNlcnZpY2Ugd2l0aCBjb21tYW5kIGxpbmtzIGFsbG93ZWQuXG5cdCAqL1xuXHRyZWFkb25seSBsaW5rSGFuZGxlcj86ICh1cmk6IFVSSSwgaXRlbTogSUFjdGlvbkxpc3RJdGVtPHVua25vd24+KSA9PiB2b2lkO1xuXG5cdC8qKlxuXHQgKiBPcHRpb25hbCBjYWxsYmFjayBmaXJlZCB3aGVuIGEgc2VjdGlvbidzIGNvbGxhcHNlZCBzdGF0ZSBjaGFuZ2VzLlxuXHQgKi9cblx0cmVhZG9ubHkgb25EaWRUb2dnbGVTZWN0aW9uPzogKHNlY3Rpb246IHN0cmluZywgY29sbGFwc2VkOiBib29sZWFuKSA9PiB2b2lkO1xuXG5cdC8qKlxuXHQgKiBXaGVuIHRydWUsIGRlc2NyaXB0aW9ucyBhcmUgcmVuZGVyZWQgaW5saW5lIHJpZ2h0IGFmdGVyIHRoZSBsYWJlbFxuXHQgKiBpbnN0ZWFkIG9mIGFsaWduZWQgdG8gdGhlIHJpZ2h0LlxuXHQgKi9cblx0cmVhZG9ubHkgaW5saW5lRGVzY3JpcHRpb24/OiBib29sZWFuO1xuXG5cdC8qKlxuXHQgKiBIZWlnaHQgKGluIHB4KSB1c2VkIGZvciBhY3Rpb24gaXRlbXMgdGhhdCBoYXZlIGEgYGRldGFpbGAgbGluZS5cblx0ICogRGVmYXVsdHMgdG8gNDguXG5cdCAqL1xuXHRyZWFkb25seSBkZXRhaWxJdGVtSGVpZ2h0PzogbnVtYmVyO1xuXG5cdC8qKlxuXHQgKiBIZWlnaHQgKGluIHB4KSB1c2VkIGZvciBhY3Rpb24gaXRlbXMgdGhhdCBoYXZlIGFuIGBpbmxpbmVUb2dnbGVgLlxuXHQgKiBEZWZhdWx0cyB0byA3MC5cblx0ICovXG5cdHJlYWRvbmx5IGlubGluZVRvZ2dsZUl0ZW1IZWlnaHQ/OiBudW1iZXI7XG5cblx0LyoqXG5cdCAqIFdoZW4gdHJ1ZSwgdGhlIGdyb3VwIHRpdGxlIGlzIHNob3duIG9uIHRoZSBmaXJzdCBpdGVtIG9mIGVhY2ggZ3JvdXBcblx0ICogaW4gdGhlIGRlc2NyaXB0aW9uIGFyZWEgKGFsaWduZWQgdG8gdGhlIHJpZ2h0KS5cblx0ICovXG5cdHJlYWRvbmx5IHNob3dHcm91cFRpdGxlT25GaXJzdEl0ZW0/OiBib29sZWFuO1xuXG5cdC8qKlxuXHQgKiBXaGVuIHRydWUgYW5kIGZpbHRlcmluZyBpcyBlbmFibGVkLCBmb2N1c2VzIHRoZSBmaWx0ZXIgaW5wdXQgd2hlbiB0aGUgbGlzdCBvcGVucy5cblx0ICovXG5cdHJlYWRvbmx5IGZvY3VzRmlsdGVyT25PcGVuPzogYm9vbGVhbjtcblxuXHQvKiogT3B0aW9uYWwgYWN0aW9uIGl0ZW0gaWQgdG8gZm9jdXMgd2hlbiB0aGUgbGlzdCBvcGVucy4gKi9cblx0cmVhZG9ubHkgaW5pdGlhbEZvY3VzSXRlbUlkPzogc3RyaW5nO1xuXG5cdC8qKlxuXHQgKiBXaGVuIGZhbHNlLCBub24tc3VibWVudSBpdGVtcyBkbyBub3QgcmVzZXJ2ZSBzcGFjZSBmb3IgdGhlIHN1Ym1lbnUgY2hldnJvbi5cblx0ICogRGVmYXVsdHMgdG8gdHJ1ZSBmb3IgYWxpZ25tZW50IGNvbnNpc3RlbmN5LlxuXHQgKi9cblx0cmVhZG9ubHkgcmVzZXJ2ZVN1Ym1lbnVTcGFjZT86IGJvb2xlYW47XG5cblx0LyoqXG5cdCAqIFdoZW4gdHJ1ZSwgaXRlbXMgd2l0aG91dCBhbiBleHBsaWNpdCBgdG9vbHRpcGAgb3IgYGhvdmVyYCBkbyBub3QgZ2V0IGFcblx0ICogZGVmYXVsdCBcIntrZXliaW5kaW5nfSB0byBBcHBseVwiIHRvb2x0aXAuIFVzZWZ1bCBmb3Igbm9uLWNvZGUtYWN0aW9uIGxpc3RzXG5cdCAqIHdoZXJlIHRoaXMgaGludCBpcyBtaXNsZWFkaW5nLlxuXHQgKi9cblx0cmVhZG9ubHkgaGlkZURlZmF1bHRLZXliaW5kaW5nVG9vbHRpcD86IGJvb2xlYW47XG5cblx0LyoqXG5cdCAqIE9wdGlvbmFsIGxhYmVsIHNob3duIG9uIHRoZSByaWdodCBzaWRlIG9mIHRoZSBmaWx0ZXIgcm93LlxuXHQgKi9cblx0cmVhZG9ubHkgc2Vjb25kYXJ5SGVhZGluZz86IHN0cmluZztcblxuXHQvKipcblx0ICogT3B0aW9uYWwgdGV4dCBzaG93biBiZWxvdyB0aGUgYWN0aW9uIGxpc3QgYXMgYSBmb290ZXIuXG5cdCAqL1xuXHRyZWFkb25seSBmb290ZXJUZXh0Pzogc3RyaW5nO1xuXG5cdC8qKlxuXHQgKiBPcHRpb25hbCB0ZXh0IHNob3duIGFib3ZlIHRoZSBhY3Rpb24gbGlzdCBhcyBhIGhlYWRlciBiYW5uZXIuIFdoZW4gc2V0LCBpdCBpc1xuXHQgKiByZW5kZXJlZCBhdCB0aGUgdG9wIG9mIHRoZSB3aWRnZXQsIG9wdGlvbmFsbHkgcHJlZml4ZWQgYnkge0BsaW5rIGhlYWRlckljb259LlxuXHQgKi9cblx0cmVhZG9ubHkgaGVhZGVyVGV4dD86IHN0cmluZztcblxuXHQvKipcblx0ICogT3B0aW9uYWwgaWNvbiBzaG93biB0byB0aGUgbGVmdCBvZiB7QGxpbmsgaGVhZGVyVGV4dH0gaW4gdGhlIGhlYWRlciBiYW5uZXIuXG5cdCAqL1xuXHRyZWFkb25seSBoZWFkZXJJY29uPzogVGhlbWVJY29uO1xuXG5cdC8qKiBPcHRpb25hbCBcIkxlYXJuIG1vcmVcIiBsaW5rIHJlbmRlcmVkIGlubGluZSBhZnRlciB7QGxpbmsgaGVhZGVyVGV4dH0sIG9wZW5lZCB2aWEgdGhlIG9wZW5lciBzZXJ2aWNlLiAqL1xuXHRyZWFkb25seSBoZWFkZXJMaW5rPzogSUFjdGlvbkxpc3RIZWFkZXJMaW5rO1xuXG5cdC8qKiBPcHRpb25hbCBkaXNtaXNzIChcInhcIikgYnV0dG9uIG9uIHRoZSBoZWFkZXIgYmFubmVyOyBpbnZva2VkIG9uIGNsaWNrLCBhbmQgdGhlIGJhbm5lciBpcyByZW1vdmVkLiAqL1xuXHRyZWFkb25seSBoZWFkZXJEaXNtaXNzPzogKCkgPT4gdm9pZDtcblxuXHQvKipcblx0ICogT3B0aW9uYWwgQ1NTIGNsYXNzIG5hbWUgYWRkZWQgdG8gdGhlIGFjdGlvbiBsaXN0IGNvbnRhaW5lciwgZm9yIHNjb3BlZCBzdHlsaW5nLlxuXHQgKi9cblx0cmVhZG9ubHkgY2xhc3NOYW1lPzogc3RyaW5nO1xuXG5cdC8qKlxuXHQgKiBPcHRpb25hbCBDU1MgY2xhc3MgbmFtZSBhZGRlZCB0byB0aGUgY29udGFpbmluZyBhY3Rpb24gd2lkZ2V0LlxuXHQgKi9cblx0cmVhZG9ubHkgd2lkZ2V0Q2xhc3NOYW1lPzogc3RyaW5nO1xuXG5cdC8qKlxuXHQgKiBPcHRpb25hbCBDU1MgY2xhc3MgYW5kIGR1cmF0aW9uIHVzZWQgdG8gYW5pbWF0ZSB0aGUgY29udGFpbmluZyBhY3Rpb24gd2lkZ2V0XG5cdCAqIGJlZm9yZSB0aGUgY29udGV4dCB2aWV3IGlzIGhpZGRlbi5cblx0ICovXG5cdHJlYWRvbmx5IGNsb3NlQW5pbWF0aW9uPzogSUFjdGlvbkxpc3RDbG9zZUFuaW1hdGlvbjtcblxuXHQvKipcblx0ICogT3B0aW9uYWwgZml4ZWQgc2lkZSBvZiB0aGUgYW5jaG9yIHdoZXJlIHRoZSBhY3Rpb24gbGlzdCBzaG91bGQgcmVuZGVyLlxuXHQgKi9cblx0cmVhZG9ubHkgYW5jaG9yUG9zaXRpb24/OiBBbmNob3JQb3NpdGlvbjtcbn1cblxuLyoqXG4gKiBBIHN0YW5kYWxvbmUgYWN0aW9uIGxpc3Qgd2lkZ2V0IHRoYXQgaGFuZGxlcyBjb3JlIGxpc3QgcmVuZGVyaW5nLCBmaWx0ZXJpbmcsXG4gKiBob3Zlciwgc3VibWVudSwgYW5kIHNlY3Rpb24gbWFuYWdlbWVudCB3aXRob3V0IGRlcGVuZGluZyBvbiBJQ29udGV4dFZpZXdTZXJ2aWNlXG4gKiBvciBhbmNob3ItYmFzZWQgcG9zaXRpb25pbmcuIFN1aXRhYmxlIGZvciBlbWJlZGRpbmcgZGlyZWN0bHkgaW4gYW55IGNvbnRhaW5lci5cbiAqL1xuZXhwb3J0IGNsYXNzIEFjdGlvbkxpc3RXaWRnZXQ8VD4gZXh0ZW5kcyBEaXNwb3NhYmxlIHtcblxuXHRwdWJsaWMgcmVhZG9ubHkgZG9tTm9kZTogSFRNTEVsZW1lbnQ7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfbGlzdDogTGlzdDxJQWN0aW9uTGlzdEl0ZW08VD4+O1xuXHRwcml2YXRlIF9pbml0aWFsRm9jdXNJdGVtSWQ6IHN0cmluZyB8IHVuZGVmaW5lZDtcblxuXHRwcm90ZWN0ZWQgcmVhZG9ubHkgX2FjdGlvbkxpbmVIZWlnaHQ6IG51bWJlcjtcblx0cHJvdGVjdGVkIHJlYWRvbmx5IF9oZWFkZXJMaW5lSGVpZ2h0ID0gMjQ7XG5cdHByb3RlY3RlZCByZWFkb25seSBfc2VwYXJhdG9yTGluZUhlaWdodCA9IDg7XG5cblx0cHJvdGVjdGVkIF9hbGxNZW51SXRlbXM6IElBY3Rpb25MaXN0SXRlbTxUPltdO1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgY3RzID0gdGhpcy5fcmVnaXN0ZXIobmV3IENhbmNlbGxhdGlvblRva2VuU291cmNlKCkpO1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX3N1Ym1lbnVEaXNwb3NhYmxlcyA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBEaXNwb3NhYmxlU3RvcmUoKSk7XG5cdHByaXZhdGUgcmVhZG9ubHkgX3N1Ym1lbnVDb250YWluZXI6IEhUTUxFbGVtZW50O1xuXHRwcml2YXRlIF9zdWJtZW51SGlkZVRpbWVvdXQ6IFJldHVyblR5cGU8dHlwZW9mIHNldFRpbWVvdXQ+IHwgdW5kZWZpbmVkO1xuXHRwcml2YXRlIF9zdWJtZW51U2hvd1RpbWVvdXQ6IFJldHVyblR5cGU8dHlwZW9mIHNldFRpbWVvdXQ+IHwgdW5kZWZpbmVkO1xuXHRwcml2YXRlIF9jdXJyZW50U3VibWVudVdpZGdldDogQWN0aW9uTGlzdFdpZGdldDxJQWN0aW9uPiB8IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSBfY3VycmVudFN1Ym1lbnVFbGVtZW50OiBJQWN0aW9uTGlzdEl0ZW08VD4gfCB1bmRlZmluZWQ7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfY29sbGFwc2VkU2VjdGlvbnMgPSBuZXcgU2V0PHN0cmluZz4oKTtcblx0cHJpdmF0ZSBfZmlsdGVyVGV4dCA9ICcnO1xuXHRwcml2YXRlIF9pbWVTZXNzaW9uSW5Qcm9ncmVzcyA9IGZhbHNlO1xuXHRwcml2YXRlIF9zdXBwcmVzc0hvdmVyID0gZmFsc2U7XG5cdHByaXZhdGUgX2hhc0xhaWRPdXQgPSBmYWxzZTtcblx0cHJpdmF0ZSByZWFkb25seSBfZmlsdGVySW5wdXQ6IEhUTUxJbnB1dEVsZW1lbnQgfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgcmVhZG9ubHkgX2ZpbHRlckNvbnRhaW5lcjogSFRNTEVsZW1lbnQgfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgcmVhZG9ubHkgX2Zvb3RlckNvbnRhaW5lcjogSFRNTEVsZW1lbnQgfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgX2hlYWRlckNvbnRhaW5lcjogSFRNTEVsZW1lbnQgfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgcmVhZG9ubHkgX2ZpbHRlckN0cyA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBNdXRhYmxlRGlzcG9zYWJsZTxDYW5jZWxsYXRpb25Ub2tlblNvdXJjZT4oKSk7XG5cdHByaXZhdGUgcmVhZG9ubHkgX2dyb3VwVGl0bGVCeUluZGV4ID0gbmV3IE1hcDxudW1iZXIsIHN0cmluZz4oKTtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkRpZFJlcXVlc3RMYXlvdXQgPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjx2b2lkPigpKTtcblxuXHQvKipcblx0ICogRmlyZWQgd2hlbiB0aGUgd2lkZ2V0J3MgdmlzaWJsZSBpdGVtIHNldCBjaGFuZ2VzIGFuZCB0aGUgcGFyZW50IHNob3VsZFxuXHQgKiByZS1sYXlvdXQgKGUuZy4gYWZ0ZXIgZmlsdGVyaW5nIG9yIGNvbGxhcHNpbmcgYSBzZWN0aW9uKS5cblx0ICovXG5cdHJlYWRvbmx5IG9uRGlkUmVxdWVzdExheW91dCA9IHRoaXMuX29uRGlkUmVxdWVzdExheW91dC5ldmVudDtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHR1c2VyOiBzdHJpbmcsXG5cdFx0cHJvdGVjdGVkIHJlYWRvbmx5IF9zdXBwb3J0c1ByZXZpZXc6IGJvb2xlYW4sXG5cdFx0aXRlbXM6IHJlYWRvbmx5IElBY3Rpb25MaXN0SXRlbTxUPltdLFxuXHRcdHByb3RlY3RlZCByZWFkb25seSBfZGVsZWdhdGU6IElBY3Rpb25MaXN0RGVsZWdhdGU8VD4sXG5cdFx0YWNjZXNzaWJpbGl0eVByb3ZpZGVyOiBQYXJ0aWFsPElMaXN0QWNjZXNzaWJpbGl0eVByb3ZpZGVyPElBY3Rpb25MaXN0SXRlbTxUPj4+IHwgdW5kZWZpbmVkLFxuXHRcdHByb3RlY3RlZCByZWFkb25seSBfb3B0aW9uczogSUFjdGlvbkxpc3RPcHRpb25zIHwgdW5kZWZpbmVkLFxuXHRcdEBJS2V5YmluZGluZ1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfa2V5YmluZGluZ1NlcnZpY2U6IElLZXliaW5kaW5nU2VydmljZSxcblx0XHRASU9wZW5lclNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfb3BlbmVyU2VydmljZTogSU9wZW5lclNlcnZpY2UsXG5cdFx0QElJbnN0YW50aWF0aW9uU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9pbnN0YW50aWF0aW9uU2VydmljZTogSUluc3RhbnRpYXRpb25TZXJ2aWNlLFxuXHQpIHtcblx0XHRzdXBlcigpO1xuXHRcdHRoaXMuX2luaXRpYWxGb2N1c0l0ZW1JZCA9IHRoaXMuX29wdGlvbnM/LmluaXRpYWxGb2N1c0l0ZW1JZDtcblx0XHR0aGlzLmRvbU5vZGUgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdkaXYnKTtcblx0XHR0aGlzLmRvbU5vZGUuY2xhc3NMaXN0LmFkZCgnYWN0aW9uTGlzdCcpO1xuXHRcdGlmICh0aGlzLl9vcHRpb25zPy5pbmxpbmVEZXNjcmlwdGlvbikge1xuXHRcdFx0dGhpcy5kb21Ob2RlLmNsYXNzTGlzdC5hZGQoJ2lubGluZS1kZXNjcmlwdGlvbicpO1xuXHRcdH1cblx0XHRpZiAodGhpcy5fb3B0aW9ucz8uY2xhc3NOYW1lKSB7XG5cdFx0XHRjb25zdCBjbGFzc05hbWVzID0gdGhpcy5fb3B0aW9ucy5jbGFzc05hbWUuc3BsaXQoL1xccysvKS5maWx0ZXIoY2xhc3NOYW1lID0+IGNsYXNzTmFtZS5sZW5ndGggPiAwKTtcblx0XHRcdGlmIChjbGFzc05hbWVzLmxlbmd0aCA+IDApIHtcblx0XHRcdFx0dGhpcy5kb21Ob2RlLmNsYXNzTGlzdC5hZGQoLi4uY2xhc3NOYW1lcyk7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdHRoaXMuX2FjdGlvbkxpbmVIZWlnaHQgPSAyNDtcblxuXHRcdC8vIENyZWF0ZSBzdWJtZW51IGNvbnRhaW5lciBhcHBlbmRlZCB0byBkb21Ob2RlXG5cdFx0dGhpcy5fc3VibWVudUNvbnRhaW5lciA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2RpdicpO1xuXHRcdHRoaXMuX3N1Ym1lbnVDb250YWluZXIuY2xhc3NOYW1lID0gJ2FjdGlvbi1saXN0LXN1Ym1lbnUtcGFuZWwgYWN0aW9uLXdpZGdldCc7XG5cdFx0dGhpcy5fc3VibWVudUNvbnRhaW5lci5zdHlsZS5kaXNwbGF5ID0gJ25vbmUnO1xuXHRcdC8vIE1ha2UgZm9jdXNhYmxlIHNvIGNsaWNraW5nIHRoZSBob3ZlciBwYW5lbCBrZWVwcyBmb2N1cyBpbnNpZGUgdGhlXG5cdFx0Ly8gdHJhY2tlZCBlbGVtZW50IGluc3RlYWQgb2YgbW92aW5nIGl0IHRvIGRvY3VtZW50LmJvZHkgKHdoaWNoIHdvdWxkXG5cdFx0Ly8gdHJpZ2dlciB0aGUgYmx1ciBoYW5kbGVyIGFuZCBkaXNtaXNzIHRoZSB3aWRnZXQpLlxuXHRcdHRoaXMuX3N1Ym1lbnVDb250YWluZXIudGFiSW5kZXggPSAtMTtcblx0XHR0aGlzLmRvbU5vZGUuYXBwZW5kKHRoaXMuX3N1Ym1lbnVDb250YWluZXIpO1xuXG5cdFx0dGhpcy5fcmVnaXN0ZXIoZG9tLmFkZERpc3Bvc2FibGVMaXN0ZW5lcih0aGlzLl9zdWJtZW51Q29udGFpbmVyLCAnbW91c2VlbnRlcicsICgpID0+IHtcblx0XHRcdHRoaXMuX2NhbmNlbFN1Ym1lbnVIaWRlKCk7XG5cdFx0fSkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKGRvbS5hZGREaXNwb3NhYmxlTGlzdGVuZXIodGhpcy5fc3VibWVudUNvbnRhaW5lciwgJ21vdXNlbGVhdmUnLCAoKSA9PiB7XG5cdFx0XHR0aGlzLl9zY2hlZHVsZVN1Ym1lbnVIaWRlKCk7XG5cdFx0fSkpO1xuXHRcdC8vIEEgcGFuZWwgc2NoZWR1bGVkIHdoaWxlIGNyb3NzaW5nIGEgcm93IG11c3Qgbm90IHBvcCB1cCBhZnRlciB0aGUgcG9pbnRlciBoYXMgbGVmdC5cblx0XHR0aGlzLl9yZWdpc3Rlcihkb20uYWRkRGlzcG9zYWJsZUxpc3RlbmVyKHRoaXMuZG9tTm9kZSwgZG9tLkV2ZW50VHlwZS5NT1VTRV9MRUFWRSwgKCkgPT4ge1xuXHRcdFx0dGhpcy5fY2FuY2VsU3VibWVudVNob3coKTtcblx0XHR9KSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodG9EaXNwb3NhYmxlKCgpID0+IHtcblx0XHRcdHRoaXMuX2NhbmNlbFN1Ym1lbnVIaWRlKCk7XG5cdFx0XHR0aGlzLl9jYW5jZWxTdWJtZW51U2hvdygpO1xuXHRcdH0pKTtcblxuXHRcdC8vIEluaXRpYWxpemUgY29sbGFwc2VkIHNlY3Rpb25zXG5cdFx0aWYgKHRoaXMuX29wdGlvbnM/LmNvbGxhcHNlZEJ5RGVmYXVsdCkge1xuXHRcdFx0Zm9yIChjb25zdCBzZWN0aW9uIG9mIHRoaXMuX29wdGlvbnMuY29sbGFwc2VkQnlEZWZhdWx0KSB7XG5cdFx0XHRcdHRoaXMuX2NvbGxhcHNlZFNlY3Rpb25zLmFkZChzZWN0aW9uKTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRjb25zdCB2aXJ0dWFsRGVsZWdhdGU6IElMaXN0VmlydHVhbERlbGVnYXRlPElBY3Rpb25MaXN0SXRlbTxUPj4gPSB7XG5cdFx0XHRnZXRIZWlnaHQ6IGVsZW1lbnQgPT4ge1xuXHRcdFx0XHRyZXR1cm4gdGhpcy5fZ2V0SXRlbUhlaWdodChlbGVtZW50KTtcblx0XHRcdH0sXG5cdFx0XHRnZXRUZW1wbGF0ZUlkOiBlbGVtZW50ID0+IGVsZW1lbnQua2luZFxuXHRcdH07XG5cblxuXHRcdGNvbnN0IHJlc2VydmVTdWJtZW51U3BhY2UgPSB0aGlzLl9vcHRpb25zPy5yZXNlcnZlU3VibWVudVNwYWNlID8/IHRydWU7XG5cdFx0Y29uc3QgaGFzQW55U3VibWVudUFjdGlvbnMgPSByZXNlcnZlU3VibWVudVNwYWNlICYmIGl0ZW1zLnNvbWUoaXRlbSA9PiAhIWl0ZW0uc3VibWVudUFjdGlvbnM/Lmxlbmd0aCAmJiAhaXRlbS5ob3Zlcj8uY29udGVudCk7XG5cblx0XHR0aGlzLl9saXN0ID0gdGhpcy5fcmVnaXN0ZXIobmV3IExpc3QodXNlciwgdGhpcy5kb21Ob2RlLCB2aXJ0dWFsRGVsZWdhdGUsIFtcblx0XHRcdG5ldyBBY3Rpb25JdGVtUmVuZGVyZXI8VD4odGhpcy5fc3VwcG9ydHNQcmV2aWV3LCAoaXRlbSkgPT4gdGhpcy5fcmVtb3ZlSXRlbShpdGVtKSwgKGl0ZW0pID0+IHRoaXMuX3Nob3dTdWJtZW51Rm9ySXRlbShpdGVtKSwgaGFzQW55U3VibWVudUFjdGlvbnMsIHRoaXMuX2dyb3VwVGl0bGVCeUluZGV4LCB0aGlzLl9vcHRpb25zPy5saW5rSGFuZGxlciwgdGhpcy5fb3B0aW9ucz8uaGlkZURlZmF1bHRLZXliaW5kaW5nVG9vbHRpcCA/PyBmYWxzZSwgdGhpcy5fa2V5YmluZGluZ1NlcnZpY2UsIHRoaXMuX29wZW5lclNlcnZpY2UpLFxuXHRcdFx0bmV3IEhlYWRlclJlbmRlcmVyKCksXG5cdFx0XHRuZXcgU2VwYXJhdG9yUmVuZGVyZXIoKSxcblx0XHRdLCB7XG5cdFx0XHRrZXlib2FyZFN1cHBvcnQ6IGZhbHNlLFxuXHRcdFx0dHlwZU5hdmlnYXRpb25FbmFibGVkOiAhdGhpcy5fb3B0aW9ucz8uc2hvd0ZpbHRlcixcblx0XHRcdGtleWJvYXJkTmF2aWdhdGlvbkxhYmVsUHJvdmlkZXI6IHsgZ2V0S2V5Ym9hcmROYXZpZ2F0aW9uTGFiZWwgfSxcblx0XHRcdGFjY2Vzc2liaWxpdHlQcm92aWRlcjoge1xuXHRcdFx0XHRnZXRBcmlhTGFiZWw6IGVsZW1lbnQgPT4ge1xuXHRcdFx0XHRcdGlmIChlbGVtZW50LmtpbmQgPT09IEFjdGlvbkxpc3RJdGVtS2luZC5BY3Rpb24pIHtcblx0XHRcdFx0XHRcdGxldCBsYWJlbCA9IGVsZW1lbnQubGFiZWwgPyBzdHJpcE5ld2xpbmVzKGVsZW1lbnQ/LmxhYmVsKSA6ICcnO1xuXHRcdFx0XHRcdFx0aWYgKGVsZW1lbnQuZGV0YWlsKSB7XG5cdFx0XHRcdFx0XHRcdGxhYmVsID0gbGFiZWwgKyAnLCAnICsgc3RyaXBOZXdsaW5lcyhlbGVtZW50LmRldGFpbCk7XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHRpZiAoZWxlbWVudC5hcmlhRGVzY3JpcHRpb24pIHtcblx0XHRcdFx0XHRcdFx0bGFiZWwgPSBsYWJlbCArICcsICcgKyBzdHJpcE5ld2xpbmVzKGVsZW1lbnQuYXJpYURlc2NyaXB0aW9uKTtcblx0XHRcdFx0XHRcdH0gZWxzZSBpZiAoZWxlbWVudC5kZXNjcmlwdGlvbikge1xuXHRcdFx0XHRcdFx0XHRjb25zdCBkZXNjVGV4dCA9IHR5cGVvZiBlbGVtZW50LmRlc2NyaXB0aW9uID09PSAnc3RyaW5nJyA/IGVsZW1lbnQuZGVzY3JpcHRpb24gOiBlbGVtZW50LmRlc2NyaXB0aW9uLnZhbHVlO1xuXHRcdFx0XHRcdFx0XHRsYWJlbCA9IGxhYmVsICsgJywgJyArIHN0cmlwTmV3bGluZXMoZGVzY1RleHQpO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0aWYgKGVsZW1lbnQuaG92ZXI/LmNvbnRlbnQgJiYgIWVsZW1lbnQuYXJpYURlc2NyaXB0aW9uICYmICFlbGVtZW50LmRlc2NyaXB0aW9uKSB7XG5cdFx0XHRcdFx0XHRcdGNvbnN0IGhvdmVyQ29udGVudCA9IGVsZW1lbnQuaG92ZXIuY29udGVudDtcblx0XHRcdFx0XHRcdFx0Y29uc3QgaG92ZXJUZXh0ID0gdHlwZW9mIGhvdmVyQ29udGVudCA9PT0gJ3N0cmluZycgPyBob3ZlckNvbnRlbnQgOiBpc01hcmtkb3duU3RyaW5nKGhvdmVyQ29udGVudCkgPyBob3ZlckNvbnRlbnQudmFsdWUgOiBkb20uaXNIVE1MRWxlbWVudChob3ZlckNvbnRlbnQpID8gaG92ZXJDb250ZW50LnRleHRDb250ZW50ID8/IHVuZGVmaW5lZCA6IHVuZGVmaW5lZDtcblx0XHRcdFx0XHRcdFx0aWYgKGhvdmVyVGV4dCAmJiAoIWVsZW1lbnQuZGV0YWlsIHx8IHN0cmlwTmV3bGluZXMoZWxlbWVudC5kZXRhaWwpICE9PSBzdHJpcE5ld2xpbmVzKGhvdmVyVGV4dCkpKSB7XG5cdFx0XHRcdFx0XHRcdFx0bGFiZWwgPSBsYWJlbCArICcsICcgKyBzdHJpcE5ld2xpbmVzKGhvdmVyVGV4dCk7XG5cdFx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdGlmIChlbGVtZW50Lmdyb3VwPy50aXRsZSkge1xuXHRcdFx0XHRcdFx0XHRsYWJlbCA9IGxhYmVsICsgJywgJyArIGVsZW1lbnQuZ3JvdXAudGl0bGU7XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHRpZiAoZWxlbWVudC5pbmxpbmVUb2dnbGUpIHtcblx0XHRcdFx0XHRcdFx0bGFiZWwgPSBsYWJlbCArICcsICcgKyAoZWxlbWVudC5pbmxpbmVUb2dnbGUuY2hlY2tlZFxuXHRcdFx0XHRcdFx0XHRcdD8gbG9jYWxpemUoJ2FjdGlvbkxpc3QuaW5saW5lVG9nZ2xlLm9uJywgXCJ7MH0sIG9uXCIsIGVsZW1lbnQuaW5saW5lVG9nZ2xlLmxhYmVsKVxuXHRcdFx0XHRcdFx0XHRcdDogbG9jYWxpemUoJ2FjdGlvbkxpc3QuaW5saW5lVG9nZ2xlLm9mZicsIFwiezB9LCBvZmZcIiwgZWxlbWVudC5pbmxpbmVUb2dnbGUubGFiZWwpKTtcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdGlmIChlbGVtZW50LmRpc2FibGVkKSB7XG5cdFx0XHRcdFx0XHRcdGxhYmVsID0gbG9jYWxpemUoeyBrZXk6ICdjdXN0b21RdWlja0ZpeFdpZGdldC5sYWJlbHMnLCBjb21tZW50OiBbYEFjdGlvbiB3aWRnZXQgbGFiZWxzIGZvciBhY2Nlc3NpYmlsaXR5LmBdIH0sIFwiezB9LCBEaXNhYmxlZCBSZWFzb246IHsxfVwiLCBsYWJlbCwgZWxlbWVudC5kaXNhYmxlZCk7XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHRpZiAoZWxlbWVudC5zdWJtZW51QWN0aW9ucz8ubGVuZ3RoKSB7XG5cdFx0XHRcdFx0XHRcdGxhYmVsID0gbG9jYWxpemUoJ2FjdGlvbkxpc3Quc3VibWVudUhpbnQnLCBcInswfSwgdXNlIHJpZ2h0IGFycm93IHRvIGFjY2VzcyBvcHRpb25zXCIsIGxhYmVsKTtcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdHJldHVybiBsYWJlbDtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0cmV0dXJuIG51bGw7XG5cdFx0XHRcdH0sXG5cdFx0XHRcdGdldFdpZGdldEFyaWFMYWJlbDogKCkgPT4gbG9jYWxpemUoeyBrZXk6ICdjdXN0b21RdWlja0ZpeFdpZGdldCcsIGNvbW1lbnQ6IFtgQW4gYWN0aW9uIHdpZGdldCBvcHRpb25gXSB9LCBcIkFjdGlvbiBXaWRnZXRcIiksXG5cdFx0XHRcdGdldFJvbGU6IChlKSA9PiB7XG5cdFx0XHRcdFx0c3dpdGNoIChlLmtpbmQpIHtcblx0XHRcdFx0XHRcdGNhc2UgQWN0aW9uTGlzdEl0ZW1LaW5kLkFjdGlvbjpcblx0XHRcdFx0XHRcdFx0cmV0dXJuICdvcHRpb24nO1xuXHRcdFx0XHRcdFx0Y2FzZSBBY3Rpb25MaXN0SXRlbUtpbmQuU2VwYXJhdG9yOlxuXHRcdFx0XHRcdFx0XHRyZXR1cm4gJ3NlcGFyYXRvcic7XG5cdFx0XHRcdFx0XHRkZWZhdWx0OlxuXHRcdFx0XHRcdFx0XHRyZXR1cm4gJ3NlcGFyYXRvcic7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9LFxuXHRcdFx0XHRnZXRXaWRnZXRSb2xlOiAoKSA9PiAnbGlzdGJveCcsXG5cdFx0XHRcdC4uLmFjY2Vzc2liaWxpdHlQcm92aWRlclxuXHRcdFx0fSxcblx0XHR9KSk7XG5cblx0XHR0aGlzLl9saXN0LnN0eWxlKGRlZmF1bHRMaXN0U3R5bGVzKTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuX2xpc3Qub25Nb3VzZUNsaWNrKGUgPT4gdGhpcy5vbkxpc3RDbGljayhlKSkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuX2xpc3Qub25Nb3VzZU92ZXIoZSA9PiB0aGlzLm9uTGlzdEhvdmVyKGUpKSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5fbGlzdC5vbkRpZENoYW5nZUZvY3VzKCgpID0+IHRoaXMub25Gb2N1cygpKSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5fbGlzdC5vbkRpZENoYW5nZVNlbGVjdGlvbihlID0+IHRoaXMub25MaXN0U2VsZWN0aW9uKGUpKSk7XG5cblx0XHR0aGlzLl9hbGxNZW51SXRlbXMgPSBbLi4uaXRlbXNdO1xuXG5cdFx0Ly8gQ3JlYXRlIGZpbHRlciBpbnB1dCBhbmQvb3Igc2Vjb25kYXJ5IGhlYWRpbmdcblx0XHRpZiAodGhpcy5fb3B0aW9ucz8uc2hvd0ZpbHRlciB8fCB0aGlzLl9vcHRpb25zPy5zZWNvbmRhcnlIZWFkaW5nKSB7XG5cdFx0XHR0aGlzLl9maWx0ZXJDb250YWluZXIgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdkaXYnKTtcblx0XHRcdHRoaXMuX2ZpbHRlckNvbnRhaW5lci5jbGFzc05hbWUgPSAnYWN0aW9uLWxpc3QtZmlsdGVyJztcblx0XHRcdGNvbnN0IGZpbHRlclJvdyA9IGRvbS5hcHBlbmQodGhpcy5fZmlsdGVyQ29udGFpbmVyLCBkb20uJCgnLmFjdGlvbi1saXN0LWZpbHRlci1yb3cnKSk7XG5cblx0XHRcdGlmICh0aGlzLl9vcHRpb25zPy5zaG93RmlsdGVyKSB7XG5cdFx0XHRcdHRoaXMuX2ZpbHRlcklucHV0ID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnaW5wdXQnKTtcblx0XHRcdFx0dGhpcy5fZmlsdGVySW5wdXQudHlwZSA9ICd0ZXh0Jztcblx0XHRcdFx0dGhpcy5fZmlsdGVySW5wdXQuY2xhc3NOYW1lID0gJ2FjdGlvbi1saXN0LWZpbHRlci1pbnB1dCc7XG5cdFx0XHRcdHRoaXMuX2ZpbHRlcklucHV0LnBsYWNlaG9sZGVyID0gdGhpcy5fb3B0aW9ucz8uZmlsdGVyUGxhY2Vob2xkZXIgPz8gbG9jYWxpemUoJ2FjdGlvbkxpc3QuZmlsdGVyLnBsYWNlaG9sZGVyJywgXCJTZWFyY2guLi5cIik7XG5cdFx0XHRcdHRoaXMuX2ZpbHRlcklucHV0LnNldEF0dHJpYnV0ZSgnYXJpYS1sYWJlbCcsIGxvY2FsaXplKCdhY3Rpb25MaXN0LmZpbHRlci5hcmlhTGFiZWwnLCBcIkZpbHRlciBpdGVtc1wiKSk7XG5cdFx0XHRcdGZpbHRlclJvdy5hcHBlbmRDaGlsZCh0aGlzLl9maWx0ZXJJbnB1dCk7XG5cblx0XHRcdFx0Y29uc3QgZmlsdGVyQWN0aW9ucyA9IHRoaXMuX29wdGlvbnM/LmZpbHRlckFjdGlvbnMgPz8gW107XG5cdFx0XHRcdGlmIChmaWx0ZXJBY3Rpb25zLmxlbmd0aCA+IDApIHtcblx0XHRcdFx0XHRjb25zdCBmaWx0ZXJBY3Rpb25zQ29udGFpbmVyID0gZG9tLmFwcGVuZChmaWx0ZXJSb3csIGRvbS4kKCcuYWN0aW9uLWxpc3QtZmlsdGVyLWFjdGlvbnMnKSk7XG5cdFx0XHRcdFx0Y29uc3QgZmlsdGVyQWN0aW9uQmFyID0gdGhpcy5fcmVnaXN0ZXIobmV3IEFjdGlvbkJhcihmaWx0ZXJBY3Rpb25zQ29udGFpbmVyKSk7XG5cdFx0XHRcdFx0ZmlsdGVyQWN0aW9uQmFyLnB1c2goZmlsdGVyQWN0aW9ucywgeyBpY29uOiB0cnVlLCBsYWJlbDogZmFsc2UgfSk7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHQvLyBXaGlsZSBhbiBJTUUgY29tcG9zaXRpb24gaXMgcnVubmluZyB0aGUgaW5wdXQgaG9sZHMgaW50ZXJtZWRpYXRlIHRleHQgKGUuZy4gcGlueWluKVxuXHRcdFx0XHQvLyB3aGljaCBtdXN0IG5vdCBkcml2ZSB0aGUgZmlsdGVyOiByZS1maWx0ZXJpbmcgc3BsaWNlcyB0aGUgbGlzdCwgcmUtaGlnaGxpZ2h0cyBhIHJvdyBhbmRcblx0XHRcdFx0Ly8gcmUtbGF5b3V0cyB0aGUgcG9wdXAsIGFsbCBvZiB3aGljaCBkaXNydXB0IHRoZSBjb21wb3NpdGlvbiBhbmQgdGhlIElNRSBjYW5kaWRhdGUgd2luZG93LlxuXHRcdFx0XHQvLyBGaWx0ZXIgb25jZSB0aGUgY29tcG9zaXRpb24gY29tbWl0cyBpbnN0ZWFkLlxuXHRcdFx0XHRjb25zdCBvbkZpbHRlclZhbHVlQ2hhbmdlZCA9ICgpID0+IHtcblx0XHRcdFx0XHRjb25zdCB2YWx1ZSA9IHRoaXMuX2ZpbHRlcklucHV0IS52YWx1ZTtcblx0XHRcdFx0XHQvLyBgY29tcG9zaXRpb25lbmRgIGFuZCB0aGUgYGlucHV0YCBldmVudCB0aGF0IGZvbGxvd3MgaXQgYm90aCBsYW5kIGhlcmUgKGFuZCBicm93c2Vyc1xuXHRcdFx0XHRcdC8vIGRpc2FncmVlIG9uIHRoZWlyIG9yZGVyKSwgc28gb25seSBmaWx0ZXIgd2hlbiB0aGUgdGV4dCBhY3R1YWxseSBjaGFuZ2VkLlxuXHRcdFx0XHRcdGlmICh0aGlzLl9pbWVTZXNzaW9uSW5Qcm9ncmVzcyB8fCB2YWx1ZSA9PT0gdGhpcy5fZmlsdGVyVGV4dCkge1xuXHRcdFx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHR0aGlzLl9maWx0ZXJUZXh0ID0gdmFsdWU7XG5cdFx0XHRcdFx0dGhpcy5fYXBwbHlPclVwZGF0ZUZpbHRlcigpO1xuXHRcdFx0XHR9O1xuXG5cdFx0XHRcdHRoaXMuX3JlZ2lzdGVyKGRvbS5hZGREaXNwb3NhYmxlTGlzdGVuZXIodGhpcy5fZmlsdGVySW5wdXQsICdjb21wb3NpdGlvbnN0YXJ0JywgKCkgPT4ge1xuXHRcdFx0XHRcdHRoaXMuX2ltZVNlc3Npb25JblByb2dyZXNzID0gdHJ1ZTtcblx0XHRcdFx0XHQvLyBBIGR5bmFtaWMgZmlsdGVyIHJlcXVlc3QgaXNzdWVkIGZvciB0aGUgcHJldmlvdXMgdmFsdWUgY2FuIHN0aWxsIGJlIGluIGZsaWdodC5cblx0XHRcdFx0XHQvLyBMZXR0aW5nIGl0IHJlc29sdmUgbm93IHdvdWxkIHNwbGljZSBhbmQgcmUtbGF5b3V0IHRoZSBsaXN0IHVuZGVybmVhdGggdGhlIElNRVxuXHRcdFx0XHRcdC8vIGNhbmRpZGF0ZSB3aW5kb3cgLSB0aGUgdmVyeSBkaXNydXB0aW9uIHRoaXMgZ3VhcmQgZXhpc3RzIHRvIHByZXZlbnQuIFRoZVxuXHRcdFx0XHRcdC8vIGNvbW1pdHRlZCB2YWx1ZSBzdGFydHMgYSBmcmVzaCByZXF1ZXN0IGZyb20gYGNvbXBvc2l0aW9uZW5kYC5cblx0XHRcdFx0XHR0aGlzLl9maWx0ZXJDdHMudmFsdWU/LmNhbmNlbCgpO1xuXHRcdFx0XHR9KSk7XG5cdFx0XHRcdHRoaXMuX3JlZ2lzdGVyKGRvbS5hZGREaXNwb3NhYmxlTGlzdGVuZXIodGhpcy5fZmlsdGVySW5wdXQsICdjb21wb3NpdGlvbmVuZCcsICgpID0+IHtcblx0XHRcdFx0XHR0aGlzLl9pbWVTZXNzaW9uSW5Qcm9ncmVzcyA9IGZhbHNlO1xuXHRcdFx0XHRcdG9uRmlsdGVyVmFsdWVDaGFuZ2VkKCk7XG5cdFx0XHRcdH0pKTtcblx0XHRcdFx0dGhpcy5fcmVnaXN0ZXIoZG9tLmFkZERpc3Bvc2FibGVMaXN0ZW5lcih0aGlzLl9maWx0ZXJJbnB1dCwgJ2lucHV0Jywgb25GaWx0ZXJWYWx1ZUNoYW5nZWQpKTtcblx0XHRcdH1cblxuXHRcdFx0aWYgKHRoaXMuX29wdGlvbnM/LnNlY29uZGFyeUhlYWRpbmcpIHtcblx0XHRcdFx0Y29uc3QgZmlsdGVyTGFiZWxFbCA9IGRvbS5hcHBlbmQoZmlsdGVyUm93LCBkb20uJCgnLmFjdGlvbi1saXN0LWZpbHRlci1sYWJlbCcpKTtcblx0XHRcdFx0ZmlsdGVyTGFiZWxFbC50ZXh0Q29udGVudCA9IHRoaXMuX29wdGlvbnMuc2Vjb25kYXJ5SGVhZGluZztcblx0XHRcdH1cblx0XHR9XG5cblx0XHQvLyBDcmVhdGUgZm9vdGVyIHRleHRcblx0XHRpZiAodGhpcy5fb3B0aW9ucz8uZm9vdGVyVGV4dCkge1xuXHRcdFx0dGhpcy5fZm9vdGVyQ29udGFpbmVyID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnZGl2Jyk7XG5cdFx0XHR0aGlzLl9mb290ZXJDb250YWluZXIuY2xhc3NOYW1lID0gJ2FjdGlvbi1saXN0LWZvb3Rlcic7XG5cdFx0XHR0aGlzLl9mb290ZXJDb250YWluZXIudGV4dENvbnRlbnQgPSB0aGlzLl9vcHRpb25zLmZvb3RlclRleHQ7XG5cdFx0fVxuXG5cdFx0Ly8gQ3JlYXRlIGhlYWRlciBiYW5uZXJcblx0XHRpZiAodGhpcy5fb3B0aW9ucz8uaGVhZGVyVGV4dCkge1xuXHRcdFx0dGhpcy5faGVhZGVyQ29udGFpbmVyID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnZGl2Jyk7XG5cdFx0XHR0aGlzLl9oZWFkZXJDb250YWluZXIuY2xhc3NOYW1lID0gJ2FjdGlvbi1saXN0LWhlYWRlcic7XG5cdFx0XHRpZiAodGhpcy5fb3B0aW9ucy5oZWFkZXJJY29uKSB7XG5cdFx0XHRcdGNvbnN0IGljb24gPSBkb20uYXBwZW5kKHRoaXMuX2hlYWRlckNvbnRhaW5lciwgZG9tLiQoJ3NwYW4uYWN0aW9uLWxpc3QtaGVhZGVyLWljb24nKSk7XG5cdFx0XHRcdGljb24uY2xhc3NMaXN0LmFkZCguLi5UaGVtZUljb24uYXNDbGFzc05hbWVBcnJheSh0aGlzLl9vcHRpb25zLmhlYWRlckljb24pKTtcblx0XHRcdFx0Ly8gRGVjb3JhdGl2ZTogdGhlIGhlYWRlciB0ZXh0IGFscmVhZHkgY29udmV5cyB0aGUgbWVhbmluZy5cblx0XHRcdFx0aWNvbi5zZXRBdHRyaWJ1dGUoJ2FyaWEtaGlkZGVuJywgJ3RydWUnKTtcblx0XHRcdH1cblx0XHRcdGNvbnN0IHRleHQgPSBkb20uYXBwZW5kKHRoaXMuX2hlYWRlckNvbnRhaW5lciwgZG9tLiQoJ3NwYW4uYWN0aW9uLWxpc3QtaGVhZGVyLXRleHQnKSk7XG5cdFx0XHR0ZXh0LnRleHRDb250ZW50ID0gdGhpcy5fb3B0aW9ucy5oZWFkZXJUZXh0O1xuXG5cdFx0XHQvLyBUaGUgYmFubmVyIGlzIGNocm9tZSwgbm90IGFuIGl0ZW06IHBvaW50aW5nIGF0IGl0IGRpc21pc3NlcyBhIHJvdydzIGhvdmVyIHBhbmVsLlxuXHRcdFx0dGhpcy5fcmVnaXN0ZXIoZG9tLmFkZERpc3Bvc2FibGVMaXN0ZW5lcih0aGlzLl9oZWFkZXJDb250YWluZXIsIGRvbS5FdmVudFR5cGUuTU9VU0VfRU5URVIsICgpID0+IHRoaXMuX2hpZGVTdWJtZW51KCkpKTtcblxuXHRcdFx0aWYgKHRoaXMuX29wdGlvbnMuaGVhZGVyTGluaykge1xuXHRcdFx0XHRjb25zdCB7IGxhYmVsLCB1cmkgfSA9IHRoaXMuX29wdGlvbnMuaGVhZGVyTGluaztcblx0XHRcdFx0Ly8gVHJhaWxpbmcgc3BhY2Ugc28gdGhlIGxpbmsgcmVhZHMgYXMgYSBjb250aW51YXRpb24gb2YgdGhlIGJhbm5lciB0ZXh0LlxuXHRcdFx0XHR0ZXh0LnRleHRDb250ZW50ICs9ICcgJztcblx0XHRcdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5faW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoTGluaywgdGV4dCwgeyBsYWJlbCwgaHJlZjogdXJpLnRvU3RyaW5nKHRydWUpIH0sIHt9KSk7XG5cdFx0XHR9XG5cblx0XHRcdGlmICh0aGlzLl9vcHRpb25zLmhlYWRlckRpc21pc3MpIHtcblx0XHRcdFx0Y29uc3Qgb25EaXNtaXNzID0gdGhpcy5fb3B0aW9ucy5oZWFkZXJEaXNtaXNzO1xuXHRcdFx0XHRjb25zdCBkaXNtaXNzQnV0dG9uID0gZG9tLmFwcGVuZCh0aGlzLl9oZWFkZXJDb250YWluZXIsIGRvbS4kKCdzcGFuLmFjdGlvbi1saXN0LWhlYWRlci1kaXNtaXNzJykpO1xuXHRcdFx0XHRkaXNtaXNzQnV0dG9uLmFwcGVuZENoaWxkKGRvbS4kKFRoZW1lSWNvbi5hc0NTU1NlbGVjdG9yKENvZGljb24uY2xvc2UpKSk7XG5cdFx0XHRcdGRpc21pc3NCdXR0b24udGFiSW5kZXggPSAwO1xuXHRcdFx0XHRkaXNtaXNzQnV0dG9uLnNldEF0dHJpYnV0ZSgncm9sZScsICdidXR0b24nKTtcblx0XHRcdFx0ZGlzbWlzc0J1dHRvbi5zZXRBdHRyaWJ1dGUoJ2FyaWEtbGFiZWwnLCBsb2NhbGl6ZSgnYWN0aW9uTGlzdC5oZWFkZXIuZGlzbWlzcycsIFwiRGlzbWlzc1wiKSk7XG5cdFx0XHRcdGNvbnN0IGRpc21pc3MgPSAoKSA9PiB7XG5cdFx0XHRcdFx0b25EaXNtaXNzKCk7XG5cdFx0XHRcdFx0Ly8gUmVmb2N1cyB0aGUgd2lkZ2V0IGZpcnN0IHNvIHJlbW92aW5nIHRoZSBmb2N1c2VkIGJ1dHRvbiBkb2Vzbid0IHRyaXAgY2xvc2Utb24tYmx1ci5cblx0XHRcdFx0XHR0aGlzLmZvY3VzKCk7XG5cdFx0XHRcdFx0dGhpcy5faGVhZGVyQ29udGFpbmVyPy5yZW1vdmUoKTtcblx0XHRcdFx0XHQvLyBEcm9wIHRoZSByZWZlcmVuY2Ugc28gdGhlIGJhbm5lciBubyBsb25nZXIgcmVzZXJ2ZXMgaGVhZGVyIGhlaWdodCwgdGhlblxuXHRcdFx0XHRcdC8vIHJlcXVlc3QgYSByZS1sYXlvdXQgc28gdGhlIHBvcHVwIHNocmlua3MgdG8gZml0IHRoZSByZW1haW5pbmcgY29udGVudC5cblx0XHRcdFx0XHR0aGlzLl9oZWFkZXJDb250YWluZXIgPSB1bmRlZmluZWQ7XG5cdFx0XHRcdFx0dGhpcy5fb25EaWRSZXF1ZXN0TGF5b3V0LmZpcmUoKTtcblx0XHRcdFx0fTtcblx0XHRcdFx0Ly8gR2VuZXJpYyBtb3VzZS11cCBtYXBzIHRvIHBvaW50ZXIgZXZlbnRzIG9uIGlPUywgc28gdGFwL3BlbiBhY3RpdmF0aW9uXG5cdFx0XHRcdC8vIHdvcmtzIHdpdGhvdXQgZXh0cmEgZ2VzdHVyZSBwbHVtYmluZyAocmF3ICdjbGljaycgaXMgdW5yZWxpYWJsZSB0aGVyZSkuXG5cdFx0XHRcdHRoaXMuX3JlZ2lzdGVyKGRvbS5hZGREaXNwb3NhYmxlR2VuZXJpY01vdXNlVXBMaXN0ZW5lcihkaXNtaXNzQnV0dG9uLCAoKSA9PiBkaXNtaXNzKCkpKTtcblx0XHRcdFx0dGhpcy5fcmVnaXN0ZXIoZG9tLmFkZERpc3Bvc2FibGVMaXN0ZW5lcihkaXNtaXNzQnV0dG9uLCBkb20uRXZlbnRUeXBlLktFWV9ET1dOLCAoZTogS2V5Ym9hcmRFdmVudCkgPT4ge1xuXHRcdFx0XHRcdGlmIChlLmtleSA9PT0gJ0VudGVyJyB8fCBlLmtleSA9PT0gJyAnKSB7XG5cdFx0XHRcdFx0XHRlLnByZXZlbnREZWZhdWx0KCk7XG5cdFx0XHRcdFx0XHRkaXNtaXNzKCk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9KSk7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0dGhpcy5fYXBwbHlGaWx0ZXIoKTtcblxuXHRcdGlmICh0aGlzLl9saXN0Lmxlbmd0aCkge1xuXHRcdFx0dGhpcy5fZm9jdXNDaGVja2VkT3JGaXJzdCgpO1xuXHRcdH1cblxuXHRcdC8vIEFycm93UmlnaHQgb3BlbnMgc3VibWVudSBmb3IgdGhlIGZvY3VzZWQgaXRlbSBhbmQgbW92ZXMgZm9jdXMgaW50byBpdFxuXHRcdHRoaXMuX3JlZ2lzdGVyKGRvbS5hZGREaXNwb3NhYmxlTGlzdGVuZXIodGhpcy5kb21Ob2RlLCAna2V5ZG93bicsIChlOiBLZXlib2FyZEV2ZW50KSA9PiB7XG5cdFx0XHRpZiAoZS5rZXkgPT09ICdBcnJvd1JpZ2h0JyAmJiAhZS5pc0NvbXBvc2luZykge1xuXHRcdFx0XHRjb25zdCBmb2N1c2VkID0gdGhpcy5fbGlzdC5nZXRGb2N1cygpO1xuXHRcdFx0XHRpZiAoZm9jdXNlZC5sZW5ndGggPiAwKSB7XG5cdFx0XHRcdFx0Y29uc3QgZWxlbWVudCA9IHRoaXMuX2xpc3QuZWxlbWVudChmb2N1c2VkWzBdKTtcblx0XHRcdFx0XHRpZiAoZWxlbWVudD8uc3VibWVudUFjdGlvbnM/Lmxlbmd0aCkge1xuXHRcdFx0XHRcdFx0ZG9tLkV2ZW50SGVscGVyLnN0b3AoZSwgdHJ1ZSk7XG5cdFx0XHRcdFx0XHRjb25zdCByb3dFbGVtZW50ID0gdGhpcy5fZ2V0Um93RWxlbWVudChmb2N1c2VkWzBdKTtcblx0XHRcdFx0XHRcdGlmIChyb3dFbGVtZW50KSB7XG5cdFx0XHRcdFx0XHRcdHRoaXMuX3Nob3dTdWJtZW51Rm9yRWxlbWVudChlbGVtZW50LCByb3dFbGVtZW50KTtcblx0XHRcdFx0XHRcdFx0dGhpcy5fY3VycmVudFN1Ym1lbnVXaWRnZXQ/LmZvY3VzKCk7XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fSkpO1xuXG5cdFx0Ly8gV2hlbiB0aGUgbGlzdCBoYXMgZm9jdXMgYW5kIHVzZXIgdHlwZXMgYSBwcmludGFibGUgY2hhcmFjdGVyLFxuXHRcdC8vIGZvcndhcmQgaXQgdG8gdGhlIGZpbHRlciBpbnB1dCBzbyBzZWFyY2ggYmVnaW5zIGF1dG9tYXRpY2FsbHkuXG5cdFx0aWYgKHRoaXMuX2ZpbHRlcklucHV0KSB7XG5cdFx0XHR0aGlzLl9yZWdpc3Rlcihkb20uYWRkRGlzcG9zYWJsZUxpc3RlbmVyKHRoaXMuZG9tTm9kZSwgJ2tleWRvd24nLCAoZTogS2V5Ym9hcmRFdmVudCkgPT4ge1xuXHRcdFx0XHRpZiAodGhpcy5fZmlsdGVySW5wdXQgJiYgIWRvbS5pc0FjdGl2ZUVsZW1lbnQodGhpcy5fZmlsdGVySW5wdXQpXG5cdFx0XHRcdFx0JiYgIWUuaXNDb21wb3NpbmcgJiYgZS5rZXkubGVuZ3RoID09PSAxICYmIGUua2V5ICE9PSAnICcgJiYgIWUuY3RybEtleSAmJiAhZS5tZXRhS2V5ICYmICFlLmFsdEtleSkge1xuXHRcdFx0XHRcdHRoaXMuX2ZpbHRlcklucHV0LmZvY3VzKCk7XG5cdFx0XHRcdFx0dGhpcy5fZmlsdGVySW5wdXQudmFsdWUgPSBlLmtleTtcblx0XHRcdFx0XHR0aGlzLl9maWx0ZXJUZXh0ID0gZS5rZXk7XG5cdFx0XHRcdFx0dGhpcy5fYXBwbHlPclVwZGF0ZUZpbHRlcigpO1xuXHRcdFx0XHRcdGUucHJldmVudERlZmF1bHQoKTtcblx0XHRcdFx0XHRlLnN0b3BQcm9wYWdhdGlvbigpO1xuXHRcdFx0XHR9XG5cdFx0XHR9KSk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBfdG9nZ2xlU2VjdGlvbihzZWN0aW9uOiBzdHJpbmcpOiB2b2lkIHtcblx0XHRpZiAodGhpcy5fY29sbGFwc2VkU2VjdGlvbnMuaGFzKHNlY3Rpb24pKSB7XG5cdFx0XHR0aGlzLl9jb2xsYXBzZWRTZWN0aW9ucy5kZWxldGUoc2VjdGlvbik7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHRoaXMuX2NvbGxhcHNlZFNlY3Rpb25zLmFkZChzZWN0aW9uKTtcblx0XHR9XG5cdFx0dGhpcy5fb3B0aW9ucz8ub25EaWRUb2dnbGVTZWN0aW9uPy4oc2VjdGlvbiwgdGhpcy5fY29sbGFwc2VkU2VjdGlvbnMuaGFzKHNlY3Rpb24pKTtcblx0XHR0aGlzLl9hcHBseUZpbHRlcigpO1xuXHR9XG5cblx0cHJpdmF0ZSBfYXBwbHlPclVwZGF0ZUZpbHRlcigpOiB2b2lkIHtcblx0XHRpZiAoIXRoaXMuX2RlbGVnYXRlLm9uRmlsdGVyKSB7XG5cdFx0XHR0aGlzLl9hcHBseUZpbHRlcigpO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IGZpbHRlclRleHQgPSB0aGlzLl9maWx0ZXJUZXh0O1xuXHRcdHRoaXMuX2ZpbHRlckN0cy52YWx1ZT8uY2FuY2VsKCk7XG5cdFx0Y29uc3QgY3RzID0gbmV3IENhbmNlbGxhdGlvblRva2VuU291cmNlKCk7XG5cdFx0dGhpcy5fZmlsdGVyQ3RzLnZhbHVlID0gY3RzO1xuXHRcdHRoaXMuX2RlbGVnYXRlLm9uRmlsdGVyKGZpbHRlclRleHQsIGN0cy50b2tlbikudGhlbihpdGVtcyA9PiB7XG5cdFx0XHRpZiAoY3RzLnRva2VuLmlzQ2FuY2VsbGF0aW9uUmVxdWVzdGVkKSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblx0XHRcdHRoaXMuX2FsbE1lbnVJdGVtcyA9IFsuLi5pdGVtc107XG5cdFx0XHR0aGlzLl9hcHBseUZpbHRlcih0cnVlKTtcblx0XHR9KS5jYXRjaCgoKSA9PiB7IC8qIGJlc3QtZWZmb3J0ICovIH0pO1xuXHR9XG5cblx0cHJpdmF0ZSBfYXBwbHlGaWx0ZXIoc2tpcFRleHRGaWx0ZXIgPSBmYWxzZSwgZmlyZUxheW91dCA9IHRydWUpOiB2b2lkIHtcblx0XHRjb25zdCBmaWx0ZXJMb3dlciA9IHNraXBUZXh0RmlsdGVyID8gJycgOiB0aGlzLl9maWx0ZXJUZXh0LnRvTG93ZXJDYXNlKCk7XG5cdFx0Y29uc3QgaXNGaWx0ZXJpbmcgPSAhc2tpcFRleHRGaWx0ZXIgJiYgZmlsdGVyTG93ZXIubGVuZ3RoID4gMDtcblx0XHRjb25zdCB2aXNpYmxlOiBJQWN0aW9uTGlzdEl0ZW08VD5bXSA9IFtdO1xuXG5cdFx0Ly8gUmVtZW1iZXIgdGhlIGZvY3VzZWQgaXRlbSBiZWZvcmUgc3BsaWNlXG5cdFx0Y29uc3QgZm9jdXNlZEluZGV4ZXMgPSB0aGlzLl9saXN0LmdldEZvY3VzKCk7XG5cdFx0bGV0IGZvY3VzZWRJdGVtOiBJQWN0aW9uTGlzdEl0ZW08VD4gfCB1bmRlZmluZWQ7XG5cdFx0aWYgKGZvY3VzZWRJbmRleGVzLmxlbmd0aCA+IDApIHtcblx0XHRcdGZvY3VzZWRJdGVtID0gdGhpcy5fbGlzdC5lbGVtZW50KGZvY3VzZWRJbmRleGVzWzBdKTtcblx0XHR9XG5cblx0XHRpZiAoaXNGaWx0ZXJpbmcpIHtcblx0XHRcdGxldCBwZW5kaW5nU2VwYXJhdG9yOiBJQWN0aW9uTGlzdEl0ZW08VD4gfCB1bmRlZmluZWQ7XG5cdFx0XHRsZXQgZmlsdGVyZWRTZWN0aW9uSXRlbXM6IElBY3Rpb25MaXN0SXRlbTxUPltdID0gW107XG5cdFx0XHRsZXQgaGFzTWF0Y2hpbmdBY3Rpb25JblNlY3Rpb24gPSBmYWxzZTtcblxuXHRcdFx0Y29uc3QgZmx1c2hGaWx0ZXJlZFNlY3Rpb24gPSAoKSA9PiB7XG5cdFx0XHRcdGlmIChwZW5kaW5nU2VwYXJhdG9yICYmIGhhc01hdGNoaW5nQWN0aW9uSW5TZWN0aW9uKSB7XG5cdFx0XHRcdFx0dmlzaWJsZS5wdXNoKHBlbmRpbmdTZXBhcmF0b3IpO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHZpc2libGUucHVzaCguLi5maWx0ZXJlZFNlY3Rpb25JdGVtcyk7XG5cdFx0XHRcdHBlbmRpbmdTZXBhcmF0b3IgPSB1bmRlZmluZWQ7XG5cdFx0XHRcdGZpbHRlcmVkU2VjdGlvbkl0ZW1zID0gW107XG5cdFx0XHRcdGhhc01hdGNoaW5nQWN0aW9uSW5TZWN0aW9uID0gZmFsc2U7XG5cdFx0XHR9O1xuXG5cdFx0XHRjb25zdCBtYXRjaGVzRmlsdGVyID0gKGl0ZW06IElBY3Rpb25MaXN0SXRlbTxUPikgPT4ge1xuXHRcdFx0XHRjb25zdCBsYWJlbCA9IChpdGVtLmxhYmVsID8/ICcnKS50b0xvd2VyQ2FzZSgpO1xuXHRcdFx0XHRjb25zdCBkZXNjVmFsdWUgPSB0eXBlb2YgaXRlbS5kZXNjcmlwdGlvbiA9PT0gJ3N0cmluZycgPyBpdGVtLmRlc2NyaXB0aW9uIDogKGl0ZW0uZGVzY3JpcHRpb24/LnZhbHVlID8/ICcnKTtcblx0XHRcdFx0cmV0dXJuIGxhYmVsLmluY2x1ZGVzKGZpbHRlckxvd2VyKSB8fCBkZXNjVmFsdWUudG9Mb3dlckNhc2UoKS5pbmNsdWRlcyhmaWx0ZXJMb3dlcik7XG5cdFx0XHR9O1xuXG5cdFx0XHRmb3IgKGNvbnN0IGl0ZW0gb2YgdGhpcy5fYWxsTWVudUl0ZW1zKSB7XG5cdFx0XHRcdGlmIChpdGVtLmtpbmQgPT09IEFjdGlvbkxpc3RJdGVtS2luZC5IZWFkZXIpIHtcblx0XHRcdFx0XHRjb250aW51ZTtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdGlmIChpdGVtLmtpbmQgPT09IEFjdGlvbkxpc3RJdGVtS2luZC5TZXBhcmF0b3IpIHtcblx0XHRcdFx0XHRmbHVzaEZpbHRlcmVkU2VjdGlvbigpO1xuXHRcdFx0XHRcdHBlbmRpbmdTZXBhcmF0b3IgPSBpdGVtLmxhYmVsID8gaXRlbSA6IHVuZGVmaW5lZDtcblx0XHRcdFx0XHRjb250aW51ZTtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdGlmIChpdGVtLnNob3dBbHdheXMpIHtcblx0XHRcdFx0XHRmaWx0ZXJlZFNlY3Rpb25JdGVtcy5wdXNoKGl0ZW0pO1xuXHRcdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0aWYgKGl0ZW0uaXNTZWN0aW9uVG9nZ2xlKSB7XG5cdFx0XHRcdFx0Y29udGludWU7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRpZiAobWF0Y2hlc0ZpbHRlcihpdGVtKSkge1xuXHRcdFx0XHRcdGhhc01hdGNoaW5nQWN0aW9uSW5TZWN0aW9uID0gdHJ1ZTtcblx0XHRcdFx0XHRmaWx0ZXJlZFNlY3Rpb25JdGVtcy5wdXNoKGl0ZW0pO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cblx0XHRcdGZsdXNoRmlsdGVyZWRTZWN0aW9uKCk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdGZvciAoY29uc3QgaXRlbSBvZiB0aGlzLl9hbGxNZW51SXRlbXMpIHtcblx0XHRcdFx0aWYgKGl0ZW0ua2luZCA9PT0gQWN0aW9uTGlzdEl0ZW1LaW5kLkhlYWRlcikge1xuXHRcdFx0XHRcdHZpc2libGUucHVzaChpdGVtKTtcblx0XHRcdFx0XHRjb250aW51ZTtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdGlmIChpdGVtLmtpbmQgPT09IEFjdGlvbkxpc3RJdGVtS2luZC5TZXBhcmF0b3IpIHtcblx0XHRcdFx0XHRpZiAoaXRlbS5zZWN0aW9uICYmIHRoaXMuX2NvbGxhcHNlZFNlY3Rpb25zLmhhcyhpdGVtLnNlY3Rpb24pKSB7XG5cdFx0XHRcdFx0XHRjb250aW51ZTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0dmlzaWJsZS5wdXNoKGl0ZW0pO1xuXHRcdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0Ly8gVXBkYXRlIGljb24gZm9yIHNlY3Rpb24gdG9nZ2xlIGl0ZW1zIGJhc2VkIG9uIGNvbGxhcHNlZCBzdGF0ZVxuXHRcdFx0XHRpZiAoaXRlbS5pc1NlY3Rpb25Ub2dnbGUgJiYgaXRlbS5zZWN0aW9uKSB7XG5cdFx0XHRcdFx0Y29uc3QgY29sbGFwc2VkID0gdGhpcy5fY29sbGFwc2VkU2VjdGlvbnMuaGFzKGl0ZW0uc2VjdGlvbik7XG5cdFx0XHRcdFx0dmlzaWJsZS5wdXNoKHtcblx0XHRcdFx0XHRcdC4uLml0ZW0sXG5cdFx0XHRcdFx0XHRncm91cDogeyAuLi5pdGVtLmdyb3VwISwgaWNvbjogY29sbGFwc2VkID8gQ29kaWNvbi5jaGV2cm9uUmlnaHQgOiBDb2RpY29uLmNoZXZyb25Eb3duIH0sXG5cdFx0XHRcdFx0fSk7XG5cdFx0XHRcdFx0Y29udGludWU7XG5cdFx0XHRcdH1cblx0XHRcdFx0Ly8gTm90IGZpbHRlcmluZyAtIGNoZWNrIGNvbGxhcHNlZCBzZWN0aW9uc1xuXHRcdFx0XHRpZiAoaXRlbS5zZWN0aW9uICYmIHRoaXMuX2NvbGxhcHNlZFNlY3Rpb25zLmhhcyhpdGVtLnNlY3Rpb24pKSB7XG5cdFx0XHRcdFx0Y29udGludWU7XG5cdFx0XHRcdH1cblx0XHRcdFx0dmlzaWJsZS5wdXNoKGl0ZW0pO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdC8vIFJlbW92ZSBvcnBoYW5lZCBzZXBhcmF0b3JzIHdoaWxlIGtlZXBpbmcgbGFiZWxlZCBzZXBhcmF0b3JzIHRoYXQgYWN0IGFzXG5cdFx0Ly8gc2VjdGlvbiBoZWFkZXJzIGFib3ZlIHRoZWlyIGZvbGxvd2luZyBhY3Rpb24gaXRlbXMuXG5cdFx0Y29uc3QgaGFzQWN0aW9uQmVmb3JlOiBib29sZWFuW10gPSBbXTtcblx0XHRsZXQgc2VlbkFjdGlvbiA9IGZhbHNlO1xuXHRcdGZvciAobGV0IGkgPSAwOyBpIDwgdmlzaWJsZS5sZW5ndGg7IGkrKykge1xuXHRcdFx0aGFzQWN0aW9uQmVmb3JlW2ldID0gc2VlbkFjdGlvbjtcblx0XHRcdGlmICh2aXNpYmxlW2ldLmtpbmQgPT09IEFjdGlvbkxpc3RJdGVtS2luZC5BY3Rpb24pIHtcblx0XHRcdFx0c2VlbkFjdGlvbiA9IHRydWU7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0Y29uc3QgaGFzQWN0aW9uQmVmb3JlTmV4dFNlcGFyYXRvcjogYm9vbGVhbltdID0gW107XG5cdFx0bGV0IHNlZW5BY3Rpb25JblNlY3Rpb24gPSBmYWxzZTtcblx0XHRmb3IgKGxldCBpID0gdmlzaWJsZS5sZW5ndGggLSAxOyBpID49IDA7IGktLSkge1xuXHRcdFx0aWYgKHZpc2libGVbaV0ua2luZCA9PT0gQWN0aW9uTGlzdEl0ZW1LaW5kLkFjdGlvbikge1xuXHRcdFx0XHRzZWVuQWN0aW9uSW5TZWN0aW9uID0gdHJ1ZTtcblx0XHRcdFx0Y29udGludWU7XG5cdFx0XHR9XG5cdFx0XHRpZiAodmlzaWJsZVtpXS5raW5kICE9PSBBY3Rpb25MaXN0SXRlbUtpbmQuU2VwYXJhdG9yKSB7XG5cdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0fVxuXHRcdFx0aGFzQWN0aW9uQmVmb3JlTmV4dFNlcGFyYXRvcltpXSA9IHNlZW5BY3Rpb25JblNlY3Rpb247XG5cdFx0XHRzZWVuQWN0aW9uSW5TZWN0aW9uID0gZmFsc2U7XG5cdFx0fVxuXG5cdFx0Zm9yIChsZXQgaSA9IHZpc2libGUubGVuZ3RoIC0gMTsgaSA+PSAwOyBpLS0pIHtcblx0XHRcdGNvbnN0IGl0ZW0gPSB2aXNpYmxlW2ldO1xuXHRcdFx0aWYgKGl0ZW0ua2luZCAhPT0gQWN0aW9uTGlzdEl0ZW1LaW5kLlNlcGFyYXRvcikge1xuXHRcdFx0XHRjb250aW51ZTtcblx0XHRcdH1cblx0XHRcdGNvbnN0IGhhc0ZvbGxvd2luZ0FjdGlvbkluU2VjdGlvbiA9IGhhc0FjdGlvbkJlZm9yZU5leHRTZXBhcmF0b3JbaV07XG5cdFx0XHRjb25zdCBpc0xlYWRpbmdVbmxhYmVsZWREaXZpZGVyID0gIWl0ZW0ubGFiZWwgJiYgIWhhc0FjdGlvbkJlZm9yZVtpXTtcblx0XHRcdGlmICghaGFzRm9sbG93aW5nQWN0aW9uSW5TZWN0aW9uIHx8IGlzTGVhZGluZ1VubGFiZWxlZERpdmlkZXIpIHtcblx0XHRcdFx0dmlzaWJsZS5zcGxpY2UoaSwgMSk7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0Ly8gUmVjb21wdXRlIGdyb3VwIHRpdGxlIHBvc2l0aW9ucyBiYXNlZCBvbiB2aXNpYmxlIGl0ZW1zXG5cdFx0aWYgKHRoaXMuX29wdGlvbnM/LnNob3dHcm91cFRpdGxlT25GaXJzdEl0ZW0pIHtcblx0XHRcdHRoaXMuX3JlY29tcHV0ZUdyb3VwVGl0bGVzKHZpc2libGUpO1xuXHRcdH1cblxuXHRcdC8vIENhcHR1cmUgd2hldGhlciB0aGUgZmlsdGVyIGlucHV0IGN1cnJlbnRseSBoYXMgZm9jdXMgYmVmb3JlIHNwbGljZVxuXHRcdC8vIHdoaWNoIG1heSBjYXVzZSBET00gY2hhbmdlcyB0aGF0IHNoaWZ0IGZvY3VzLlxuXHRcdGNvbnN0IGZpbHRlcklucHV0SGFzRm9jdXMgPSB0aGlzLl9maWx0ZXJJbnB1dCAmJiBkb20uaXNBY3RpdmVFbGVtZW50KHRoaXMuX2ZpbHRlcklucHV0KTtcblxuXHRcdHRoaXMuX2xpc3Quc3BsaWNlKDAsIHRoaXMuX2xpc3QubGVuZ3RoLCB2aXNpYmxlKTtcblxuXHRcdC8vIE5vdGlmeSB0aGUgcGFyZW50IHRoYXQgYSByZS1sYXlvdXQgaXMgbmVlZGVkXG5cdFx0aWYgKGZpcmVMYXlvdXQpIHtcblx0XHRcdHRoaXMuX29uRGlkUmVxdWVzdExheW91dC5maXJlKCk7XG5cdFx0fVxuXG5cdFx0Ly8gUmVzdG9yZSBmb2N1cyBhZnRlciBzcGxpY2UgZGVzdHJveWVkIERPTSBlbGVtZW50cyxcblx0XHQvLyBvdGhlcndpc2UgdGhlIGJsdXIgaGFuZGxlciBpbiBBY3Rpb25XaWRnZXRTZXJ2aWNlIGNsb3NlcyB0aGUgd2lkZ2V0LlxuXHRcdC8vIEtlZXAgZm9jdXMgb24gdGhlIGZpbHRlciBpbnB1dCBpZiB0aGUgdXNlciBpcyB0eXBpbmcgYSBmaWx0ZXIuXG5cdFx0aWYgKGZpbHRlcklucHV0SGFzRm9jdXMpIHtcblx0XHRcdHRoaXMuX2ZpbHRlcklucHV0Py5mb2N1cygpO1xuXHRcdFx0Ly8gS2VlcCBhIGhpZ2hsaWdodGVkIGl0ZW0gaW4gdGhlIGxpc3Qgc28gRW50ZXIgd29ya3Mgd2l0aG91dCBwcmVzc2luZyBEb3duQXJyb3cgZmlyc3Rcblx0XHRcdHRoaXMuX2ZvY3VzQ2hlY2tlZE9yRmlyc3QoKTtcblx0XHR9IGVsc2UgaWYgKHRoaXMuX2hhc0xhaWRPdXQpIHtcblx0XHRcdC8vIFJlc3RvcmUgZm9jdXMgdG8gdGhlIHByZXZpb3VzbHkgZm9jdXNlZCBpdGVtXG5cdFx0XHRpZiAoZm9jdXNlZEl0ZW0pIHtcblx0XHRcdFx0Y29uc3QgZm9jdXNlZEl0ZW1JZCA9IChmb2N1c2VkSXRlbS5pdGVtIGFzIHsgaWQ/OiBzdHJpbmcgfSk/LmlkO1xuXHRcdFx0XHRpZiAoZm9jdXNlZEl0ZW1JZCkge1xuXHRcdFx0XHRcdGZvciAobGV0IGkgPSAwOyBpIDwgdGhpcy5fbGlzdC5sZW5ndGg7IGkrKykge1xuXHRcdFx0XHRcdFx0Y29uc3QgZWwgPSB0aGlzLl9saXN0LmVsZW1lbnQoaSk7XG5cdFx0XHRcdFx0XHRpZiAoKGVsLml0ZW0gYXMgeyBpZD86IHN0cmluZyB9KT8uaWQgPT09IGZvY3VzZWRJdGVtSWQpIHtcblx0XHRcdFx0XHRcdFx0dGhpcy5fbGlzdC5zZXRGb2N1cyhbaV0pO1xuXHRcdFx0XHRcdFx0XHR0aGlzLl9saXN0LnJldmVhbChpKTtcblx0XHRcdFx0XHRcdFx0Ly8gTW92ZSBET00gZm9jdXMgYmFjayB0byB0aGUgbGlzdDogdGhlIHNwbGljZSBhYm92ZSBkZXN0cm95ZWRcblx0XHRcdFx0XHRcdFx0Ly8gdGhlIHByZXZpb3VzbHkgZm9jdXNlZCByb3csIGxlYXZpbmcgRE9NIGZvY3VzIG9uIHRoZSBib2R5LlxuXHRcdFx0XHRcdFx0XHR0aGlzLl9saXN0LmRvbUZvY3VzKCk7XG5cdFx0XHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblx0fVxuXG5cdC8qKlxuXHQgKiBSZXR1cm5zIHRoZSBmaWx0ZXIgY29udGFpbmVyIGVsZW1lbnQsIGlmIGZpbHRlciBpcyBlbmFibGVkLlxuXHQgKiBUaGUgY2FsbGVyIGlzIHJlc3BvbnNpYmxlIGZvciBhcHBlbmRpbmcgaXQgdG8gdGhlIHdpZGdldCBET00uXG5cdCAqL1xuXHRnZXQgZmlsdGVyQ29udGFpbmVyKCk6IEhUTUxFbGVtZW50IHwgdW5kZWZpbmVkIHtcblx0XHRyZXR1cm4gdGhpcy5fZmlsdGVyQ29udGFpbmVyO1xuXHR9XG5cblx0Z2V0IGZvb3RlckNvbnRhaW5lcigpOiBIVE1MRWxlbWVudCB8IHVuZGVmaW5lZCB7XG5cdFx0cmV0dXJuIHRoaXMuX2Zvb3RlckNvbnRhaW5lcjtcblx0fVxuXG5cdGdldCBoZWFkZXJDb250YWluZXIoKTogSFRNTEVsZW1lbnQgfCB1bmRlZmluZWQge1xuXHRcdHJldHVybiB0aGlzLl9oZWFkZXJDb250YWluZXI7XG5cdH1cblxuXHRnZXQgZmlsdGVySW5wdXQoKTogSFRNTElucHV0RWxlbWVudCB8IHVuZGVmaW5lZCB7XG5cdFx0cmV0dXJuIHRoaXMuX2ZpbHRlcklucHV0O1xuXHR9XG5cblx0Z2V0IGNsb3NlQW5pbWF0aW9uKCk6IElBY3Rpb25MaXN0Q2xvc2VBbmltYXRpb24gfCB1bmRlZmluZWQge1xuXHRcdHJldHVybiB0aGlzLl9vcHRpb25zPy5jbG9zZUFuaW1hdGlvbjtcblx0fVxuXG5cdHByaXZhdGUgZm9jdXNDb25kaXRpb24oZWxlbWVudDogSUFjdGlvbkxpc3RJdGVtPHVua25vd24+KTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuICFlbGVtZW50LmRpc2FibGVkICYmIGVsZW1lbnQua2luZCA9PT0gQWN0aW9uTGlzdEl0ZW1LaW5kLkFjdGlvbjtcblx0fVxuXG5cdGZvY3VzKCk6IHZvaWQge1xuXHRcdGlmICh0aGlzLl9maWx0ZXJJbnB1dCAmJiB0aGlzLl9vcHRpb25zPy5mb2N1c0ZpbHRlck9uT3Blbikge1xuXHRcdFx0dGhpcy5fZmlsdGVySW5wdXQuZm9jdXMoKTtcblx0XHRcdC8vIEhpZ2hsaWdodCB0aGUgZmlyc3QgaXRlbSBzbyBFbnRlciB3b3JrcyBpbW1lZGlhdGVseVxuXHRcdFx0dGhpcy5fZm9jdXNDaGVja2VkT3JGaXJzdCgpO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHR0aGlzLl9saXN0LmRvbUZvY3VzKCk7XG5cdFx0dGhpcy5fZm9jdXNDaGVja2VkT3JGaXJzdCgpO1xuXHR9XG5cblx0Y2xlYXJGb2N1cygpOiB2b2lkIHtcblx0XHR0aGlzLl9saXN0LnNldEZvY3VzKFtdKTtcblx0fVxuXG5cdGdldEZvY3VzZWRFbGVtZW50KCk6IElBY3Rpb25MaXN0SXRlbTxUPiB8IHVuZGVmaW5lZCB7XG5cdFx0Y29uc3QgZm9jdXNlZCA9IHRoaXMuX2xpc3QuZ2V0Rm9jdXMoKTtcblx0XHRpZiAoZm9jdXNlZC5sZW5ndGggPiAwKSB7XG5cdFx0XHRyZXR1cm4gdGhpcy5fbGlzdC5lbGVtZW50KGZvY3VzZWRbMF0pO1xuXHRcdH1cblx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHR9XG5cblx0LyoqXG5cdCAqIFJlcGxhY2VzIHRoZSBpdGVtcyBpbiB0aGUgbGlzdCBpbiBwbGFjZSwgcHJlc2VydmluZyB0aGUgY3VycmVudCBmaWx0ZXIsXG5cdCAqIHdpdGhvdXQgY2xvc2luZyBvciByZXBvc2l0aW9uaW5nIHRoZSB3aWRnZXQuIFdoZW4ge0BsaW5rIGZvY3VzSXRlbUlkfSBpc1xuXHQgKiBwcm92aWRlZCwgdGhhdCBpdGVtICh7QGxpbmsgSUFjdGlvbkxpc3RJdGVtLml0ZW19J3MgYGlkYCkgaXMgZm9jdXNlZDtcblx0ICogb3RoZXJ3aXNlIHRoZSBwcmV2aW91c2x5IGZvY3VzZWQgaXRlbSBpcyBwcmVzZXJ2ZWQgKG1hdGNoZWQgYnkgaWQpLlxuXHQgKi9cblx0dXBkYXRlSXRlbXMoaXRlbXM6IHJlYWRvbmx5IElBY3Rpb25MaXN0SXRlbTxUPltdLCBmb2N1c0l0ZW1JZD86IHN0cmluZyk6IHZvaWQge1xuXHRcdHRoaXMuX2FsbE1lbnVJdGVtcyA9IFsuLi5pdGVtc107XG5cdFx0Ly8gRG9uJ3QgZmlyZSBhIGxheW91dCByZXF1ZXN0OiB0aGUgaXRlbSBzZXQga2VlcHMgdGhlIHNhbWUgc2hhcGUsIHNvIHRoZVxuXHRcdC8vIHdpZGdldCBzaXplIGlzIHVuY2hhbmdlZCBhbmQgcmVwb3NpdGlvbmluZyBjb3VsZCBtaXMtYW5jaG9yIGlmIHRoZVxuXHRcdC8vIGFuY2hvciBlbGVtZW50IHdhcyByZS1yZW5kZXJlZCBieSB0aGUgYWN0aW9uIHRoYXQgdHJpZ2dlcmVkIHRoaXMgdXBkYXRlLlxuXHRcdHRoaXMuX2FwcGx5RmlsdGVyKGZhbHNlLCBmYWxzZSk7XG5cdFx0aWYgKGZvY3VzSXRlbUlkICE9PSB1bmRlZmluZWQpIHtcblx0XHRcdHRoaXMuZm9jdXNJdGVtQnlJZChmb2N1c0l0ZW1JZCk7XG5cdFx0fVxuXHR9XG5cblx0LyoqXG5cdCAqIEZvY3VzZXMgdGhlIGl0ZW0gd2hvc2Uge0BsaW5rIElBY3Rpb25MaXN0SXRlbS5pdGVtfSdzIGBpZGAgbWF0Y2hlc1xuXHQgKiB7QGxpbmsgaXRlbUlkfSwgd2l0aG91dCByZWJ1aWxkaW5nIHRoZSBsaXN0LiBSZS1hcHBsaWVzIHRoZSBmb2N1cyBhZnRlciB0aGVcblx0ICogY3VycmVudCBldmVudCBzbyBhIG1vdXNlIGNsaWNrJ3Mgb3duIHBvaW50ZXIgaGFuZGxpbmcgY2Fubm90IHJlc2V0IGl0LlxuXHQgKi9cblx0Zm9jdXNJdGVtQnlJZChpdGVtSWQ6IHN0cmluZyk6IHZvaWQge1xuXHRcdGNvbnN0IGZvY3VzSXRlbSA9ICgpID0+IHtcblx0XHRcdGZvciAobGV0IGkgPSAwOyBpIDwgdGhpcy5fbGlzdC5sZW5ndGg7IGkrKykge1xuXHRcdFx0XHRjb25zdCBlbCA9IHRoaXMuX2xpc3QuZWxlbWVudChpKTtcblx0XHRcdFx0aWYgKChlbC5pdGVtIGFzIHsgaWQ/OiBzdHJpbmcgfSk/LmlkID09PSBpdGVtSWQpIHtcblx0XHRcdFx0XHR0aGlzLl9saXN0LnNldEZvY3VzKFtpXSk7XG5cdFx0XHRcdFx0dGhpcy5fbGlzdC5yZXZlYWwoaSk7XG5cdFx0XHRcdFx0dGhpcy5fbGlzdC5kb21Gb2N1cygpO1xuXHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fTtcblx0XHRmb2N1c0l0ZW0oKTtcblx0XHQvLyBSZS1hcHBseSBhZnRlciB0aGUgY3VycmVudCBldmVudCBmaW5pc2hlczogd2hlbiB0cmlnZ2VyZWQgYnkgYSBtb3VzZVxuXHRcdC8vIGNsaWNrLCB0aGUgbGlzdCdzIG93biBwb2ludGVyIGhhbmRsaW5nIGNhbiByZXNldCBmb2N1cyBhZnRlciBvdXJcblx0XHQvLyBjYWxsYmFjayByZXR1cm5zLCB3aGljaCB3b3VsZCBvdGhlcndpc2UgZHJvcCB0aGUgZm9jdXMgaGlnaGxpZ2h0LlxuXHRcdHF1ZXVlTWljcm90YXNrKCgpID0+IHtcblx0XHRcdGlmICh0aGlzLmRvbU5vZGUuaXNDb25uZWN0ZWQpIHtcblx0XHRcdFx0Zm9jdXNJdGVtKCk7XG5cdFx0XHR9XG5cdFx0fSk7XG5cdH1cblxuXHRwcml2YXRlIF9mb2N1c0NoZWNrZWRPckZpcnN0KCk6IHZvaWQge1xuXHRcdHRoaXMuX3N1cHByZXNzSG92ZXIgPSB0cnVlO1xuXHRcdHRyeSB7XG5cdFx0XHRjb25zdCBpbml0aWFsRm9jdXNJdGVtSWQgPSB0aGlzLl9pbml0aWFsRm9jdXNJdGVtSWQ7XG5cdFx0XHR0aGlzLl9pbml0aWFsRm9jdXNJdGVtSWQgPSB1bmRlZmluZWQ7XG5cdFx0XHRpZiAoaW5pdGlhbEZvY3VzSXRlbUlkKSB7XG5cdFx0XHRcdGZvciAobGV0IGkgPSAwOyBpIDwgdGhpcy5fbGlzdC5sZW5ndGg7IGkrKykge1xuXHRcdFx0XHRcdGNvbnN0IGVsZW1lbnQgPSB0aGlzLl9saXN0LmVsZW1lbnQoaSk7XG5cdFx0XHRcdFx0aWYgKGVsZW1lbnQua2luZCA9PT0gQWN0aW9uTGlzdEl0ZW1LaW5kLkFjdGlvbiAmJiAoZWxlbWVudC5pdGVtIGFzIHsgaWQ/OiBzdHJpbmcgfSk/LmlkID09PSBpbml0aWFsRm9jdXNJdGVtSWQpIHtcblx0XHRcdFx0XHRcdHRoaXMuX2xpc3Quc2V0Rm9jdXMoW2ldKTtcblx0XHRcdFx0XHRcdHRoaXMuX2xpc3QucmV2ZWFsKGkpO1xuXHRcdFx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdFx0Y29uc3QgW2ZvY3VzZWRJbmRleF0gPSB0aGlzLl9saXN0LmdldEZvY3VzKCk7XG5cdFx0XHRpZiAoZm9jdXNlZEluZGV4ICE9PSB1bmRlZmluZWQpIHtcblx0XHRcdFx0Y29uc3QgZm9jdXNlZEVsZW1lbnQgPSB0aGlzLl9saXN0LmVsZW1lbnQoZm9jdXNlZEluZGV4KTtcblx0XHRcdFx0aWYgKGZvY3VzZWRFbGVtZW50ICYmIHRoaXMuZm9jdXNDb25kaXRpb24oZm9jdXNlZEVsZW1lbnQpKSB7XG5cdFx0XHRcdFx0dGhpcy5fbGlzdC5yZXZlYWwoZm9jdXNlZEluZGV4KTtcblx0XHRcdFx0XHRyZXR1cm47XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHRcdC8vIFRyeSB0byBmb2N1cyB0aGUgY2hlY2tlZCBpdGVtIGZpcnN0XG5cdFx0XHRmb3IgKGxldCBpID0gMDsgaSA8IHRoaXMuX2xpc3QubGVuZ3RoOyBpKyspIHtcblx0XHRcdFx0Y29uc3QgZWxlbWVudCA9IHRoaXMuX2xpc3QuZWxlbWVudChpKTtcblx0XHRcdFx0aWYgKGVsZW1lbnQua2luZCA9PT0gQWN0aW9uTGlzdEl0ZW1LaW5kLkFjdGlvbiAmJiAoZWxlbWVudC5pdGVtIGFzIHsgY2hlY2tlZD86IGJvb2xlYW4gfSk/LmNoZWNrZWQpIHtcblx0XHRcdFx0XHR0aGlzLl9saXN0LnNldEZvY3VzKFtpXSk7XG5cdFx0XHRcdFx0dGhpcy5fbGlzdC5yZXZlYWwoaSk7XG5cdFx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0XHQvLyBTZXQgZm9jdXMgb24gdGhlIGZpcnN0IGZvY3VzYWJsZSBpdGVtIHdpdGhvdXQgbW92aW5nIERPTSBmb2N1c1xuXHRcdFx0dGhpcy5fbGlzdC5mb2N1c0ZpcnN0KHVuZGVmaW5lZCwgdGhpcy5mb2N1c0NvbmRpdGlvbik7XG5cdFx0XHRjb25zdCBmb2N1c2VkID0gdGhpcy5fbGlzdC5nZXRGb2N1cygpO1xuXHRcdFx0aWYgKGZvY3VzZWQubGVuZ3RoID4gMCkge1xuXHRcdFx0XHR0aGlzLl9saXN0LnJldmVhbChmb2N1c2VkWzBdKTtcblx0XHRcdH1cblx0XHR9IGZpbmFsbHkge1xuXHRcdFx0dGhpcy5fc3VwcHJlc3NIb3ZlciA9IGZhbHNlO1xuXHRcdH1cblx0fVxuXG5cdGhpZGUoZGlkQ2FuY2VsPzogYm9vbGVhbik6IHZvaWQge1xuXHRcdHRoaXMuX2RlbGVnYXRlLm9uSGlkZShkaWRDYW5jZWwpO1xuXHRcdHRoaXMuY3RzLmNhbmNlbCgpO1xuXHRcdHRoaXMuX2ZpbHRlckN0cy52YWx1ZT8uY2FuY2VsKCk7XG5cdFx0dGhpcy5fZmlsdGVyQ3RzLmNsZWFyKCk7XG5cdFx0dGhpcy5faGlkZVN1Ym1lbnUoKTtcblx0fVxuXG5cdGNsZWFyRmlsdGVyKCk6IGJvb2xlYW4ge1xuXHRcdGlmICh0aGlzLl9maWx0ZXJJbnB1dCAmJiB0aGlzLl9maWx0ZXJUZXh0KSB7XG5cdFx0XHR0aGlzLl9maWx0ZXJJbnB1dC52YWx1ZSA9ICcnO1xuXHRcdFx0dGhpcy5fZmlsdGVyVGV4dCA9ICcnO1xuXHRcdFx0dGhpcy5fYXBwbHlPclVwZGF0ZUZpbHRlcigpO1xuXHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0fVxuXHRcdHJldHVybiBmYWxzZTtcblx0fVxuXG5cdC8qKlxuXHQgKiBXaGV0aGVyIHRoaXMgd2lkZ2V0IHVzZXMgZHluYW1pYyBoZWlnaHQgKGhhcyBmaWx0ZXIgb3IgY29sbGFwc2libGUgc2VjdGlvbnMpLlxuXHQgKi9cblx0Z2V0IGhhc0R5bmFtaWNIZWlnaHQoKTogYm9vbGVhbiB7XG5cdFx0aWYgKHRoaXMuX29wdGlvbnM/LnNob3dGaWx0ZXIpIHtcblx0XHRcdHJldHVybiB0cnVlO1xuXHRcdH1cblx0XHRyZXR1cm4gdGhpcy5fYWxsTWVudUl0ZW1zLnNvbWUoaXRlbSA9PiBpdGVtLmlzU2VjdGlvblRvZ2dsZSk7XG5cdH1cblxuXHQvKipcblx0ICogVGhlIGhlaWdodCBvZiBhIHNpbmdsZSBhY3Rpb24gcm93IGluIHBpeGVscy5cblx0ICovXG5cdGdldCBsaW5lSGVpZ2h0KCk6IG51bWJlciB7XG5cdFx0cmV0dXJuIHRoaXMuX2FjdGlvbkxpbmVIZWlnaHQ7XG5cdH1cblxuXHQvKipcblx0ICogUmV0dXJucyB0aGUgaGVpZ2h0IGZvciBhbiBhY3Rpb24gaXRlbSwgdXNpbmcgYSB0YWxsZXIgbGluZSBoZWlnaHRcblx0ICogZm9yIGl0ZW1zIHdpdGggYSBkZXRhaWwgKHNlY29uZCBsaW5lKS5cblx0ICovXG5cdHByb3RlY3RlZCBfZ2V0SXRlbUhlaWdodChpdGVtOiBJQWN0aW9uTGlzdEl0ZW08VD4pOiBudW1iZXIge1xuXHRcdHN3aXRjaCAoaXRlbS5raW5kKSB7XG5cdFx0XHRjYXNlIEFjdGlvbkxpc3RJdGVtS2luZC5IZWFkZXI6XG5cdFx0XHRcdHJldHVybiB0aGlzLl9oZWFkZXJMaW5lSGVpZ2h0O1xuXHRcdFx0Y2FzZSBBY3Rpb25MaXN0SXRlbUtpbmQuU2VwYXJhdG9yOlxuXHRcdFx0XHRyZXR1cm4gaXRlbS5sYWJlbCA/IHRoaXMuX2FjdGlvbkxpbmVIZWlnaHQgOiB0aGlzLl9zZXBhcmF0b3JMaW5lSGVpZ2h0O1xuXHRcdFx0ZGVmYXVsdDpcblx0XHRcdFx0aWYgKGl0ZW0uaW5saW5lVG9nZ2xlKSB7XG5cdFx0XHRcdFx0cmV0dXJuIHRoaXMuX29wdGlvbnM/LmlubGluZVRvZ2dsZUl0ZW1IZWlnaHQgPz8gNzA7XG5cdFx0XHRcdH1cblx0XHRcdFx0cmV0dXJuIGl0ZW0uZGV0YWlsID8gKHRoaXMuX29wdGlvbnM/LmRldGFpbEl0ZW1IZWlnaHQgPz8gNDgpIDogdGhpcy5fYWN0aW9uTGluZUhlaWdodDtcblx0XHR9XG5cdH1cblxuXHQvKipcblx0ICogQ29tcHV0ZXMgdGhlIHRvdGFsIGhlaWdodCBvZiBhbGwgaXRlbXMgKGluY2x1ZGluZyBjb2xsYXBzZWQvZmlsdGVyZWQgaXRlbXMpLlxuXHQgKi9cblx0Y29tcHV0ZUZ1bGxIZWlnaHQoKTogbnVtYmVyIHtcblx0XHRsZXQgZnVsbEhlaWdodCA9IDA7XG5cdFx0Zm9yIChjb25zdCBpdGVtIG9mIHRoaXMuX2FsbE1lbnVJdGVtcykge1xuXHRcdFx0ZnVsbEhlaWdodCArPSB0aGlzLl9nZXRJdGVtSGVpZ2h0KGl0ZW0pO1xuXHRcdH1cblx0XHRyZXR1cm4gZnVsbEhlaWdodDtcblx0fVxuXG5cdC8qKlxuXHQgKiBDb21wdXRlcyB0aGUgdG90YWwgaGVpZ2h0IG9mIHZpc2libGUgaXRlbXMgaW4gdGhlIGxpc3QuXG5cdCAqL1xuXHRjb21wdXRlTGlzdEhlaWdodCgpOiBudW1iZXIge1xuXHRcdGNvbnN0IHZpc2libGVDb3VudCA9IHRoaXMuX2xpc3QubGVuZ3RoO1xuXHRcdGxldCBsaXN0SGVpZ2h0ID0gMDtcblx0XHRmb3IgKGxldCBpID0gMDsgaSA8IHZpc2libGVDb3VudDsgaSsrKSB7XG5cdFx0XHRjb25zdCBlbGVtZW50ID0gdGhpcy5fbGlzdC5lbGVtZW50KGkpO1xuXHRcdFx0bGlzdEhlaWdodCArPSB0aGlzLl9nZXRJdGVtSGVpZ2h0KGVsZW1lbnQpO1xuXHRcdH1cblx0XHRyZXR1cm4gbGlzdEhlaWdodDtcblx0fVxuXG5cdC8qKlxuXHQgKiBMYXlzIG91dCB0aGUgbGlzdCB3aWRnZXQgd2l0aCB0aGUgZ2l2ZW4gZXhwbGljaXQgZGltZW5zaW9ucy5cblx0ICovXG5cdGxheW91dChoZWlnaHQ6IG51bWJlciwgd2lkdGg/OiBudW1iZXIpOiB2b2lkIHtcblx0XHR0aGlzLl9oYXNMYWlkT3V0ID0gdHJ1ZTtcblx0XHR0aGlzLl9saXN0LmxheW91dChoZWlnaHQsIHdpZHRoKTtcblx0XHR0aGlzLmRvbU5vZGUuc3R5bGUuaGVpZ2h0ID0gYCR7aGVpZ2h0fXB4YDtcblxuXHRcdC8vIFBsYWNlIGZpbHRlciBjb250YWluZXIgb24gdGhlIHByZWZlcnJlZCBzaWRlLlxuXHRcdGlmICh0aGlzLl9maWx0ZXJDb250YWluZXIgJiYgdGhpcy5fZmlsdGVyQ29udGFpbmVyLnBhcmVudEVsZW1lbnQpIHtcblx0XHRcdHRoaXMuX2ZpbHRlckNvbnRhaW5lci5wYXJlbnRFbGVtZW50Lmluc2VydEJlZm9yZSh0aGlzLl9maWx0ZXJDb250YWluZXIsIHRoaXMuZG9tTm9kZSk7XG5cdFx0fVxuXHR9XG5cblx0Y29tcHV0ZU1heFdpZHRoKG1pbldpZHRoOiBudW1iZXIpOiBudW1iZXIge1xuXHRcdGNvbnN0IHZpc2libGVDb3VudCA9IHRoaXMuX2xpc3QubGVuZ3RoO1xuXHRcdGNvbnN0IGVmZmVjdGl2ZU1pbldpZHRoID0gTWF0aC5tYXgobWluV2lkdGgsIHRoaXMuX29wdGlvbnM/Lm1pbldpZHRoID8/IDApO1xuXHRcdGNvbnN0IHJhd01heFdpZHRoQ2FwID0gdGhpcy5fb3B0aW9ucz8ubWF4V2lkdGggPz8gTnVtYmVyLlBPU0lUSVZFX0lORklOSVRZO1xuXHRcdGNvbnN0IG1heFdpZHRoQ2FwID0gTWF0aC5tYXgocmF3TWF4V2lkdGhDYXAsIGVmZmVjdGl2ZU1pbldpZHRoKTtcblx0XHRjb25zdCBjbGFtcCA9ICh3OiBudW1iZXIpID0+IE1hdGgubWluKE1hdGgubWF4KHcsIGVmZmVjdGl2ZU1pbldpZHRoKSwgbWF4V2lkdGhDYXApO1xuXHRcdGxldCBtYXhXaWR0aCA9IGVmZmVjdGl2ZU1pbldpZHRoO1xuXG5cdFx0Y29uc3QgdG90YWxJdGVtQ291bnQgPSB0aGlzLl9hbGxNZW51SXRlbXMubGVuZ3RoO1xuXHRcdGlmICh0b3RhbEl0ZW1Db3VudCA+PSA1MCkge1xuXHRcdFx0cmV0dXJuIGNsYW1wKDM4MCk7XG5cdFx0fVxuXG5cdFx0aWYgKHRvdGFsSXRlbUNvdW50ID4gdmlzaWJsZUNvdW50KSB7XG5cdFx0XHQvLyBUZW1wb3JhcmlseSBzcGxpY2UgaW4gYWxsIGl0ZW1zIHRvIG1lYXN1cmUgd2lkdGhzLFxuXHRcdFx0Ly8gcHJldmVudGluZyB3aWR0aCBqdW1wcyB3aGVuIGV4cGFuZGluZy9jb2xsYXBzaW5nIHNlY3Rpb25zLlxuXHRcdFx0Y29uc3QgdmlzaWJsZUl0ZW1zOiBJQWN0aW9uTGlzdEl0ZW08VD5bXSA9IFtdO1xuXHRcdFx0Zm9yIChsZXQgaSA9IDA7IGkgPCB2aXNpYmxlQ291bnQ7IGkrKykge1xuXHRcdFx0XHR2aXNpYmxlSXRlbXMucHVzaCh0aGlzLl9saXN0LmVsZW1lbnQoaSkpO1xuXHRcdFx0fVxuXG5cdFx0XHRjb25zdCBhbGxJdGVtcyA9IFsuLi50aGlzLl9hbGxNZW51SXRlbXNdO1xuXHRcdFx0dGhpcy5fbGlzdC5zcGxpY2UoMCwgdmlzaWJsZUNvdW50LCBhbGxJdGVtcyk7XG5cdFx0XHRsZXQgYWxsSXRlbXNIZWlnaHQgPSAwO1xuXHRcdFx0Zm9yIChjb25zdCBpdGVtIG9mIGFsbEl0ZW1zKSB7XG5cdFx0XHRcdGFsbEl0ZW1zSGVpZ2h0ICs9IHRoaXMuX2dldEl0ZW1IZWlnaHQoaXRlbSk7XG5cdFx0XHR9XG5cdFx0XHR0aGlzLl9saXN0LmxheW91dChhbGxJdGVtc0hlaWdodCk7XG5cblx0XHRcdGNvbnN0IGl0ZW1XaWR0aHMgPSB0aGlzLl9tZWFzdXJlSXRlbVdpZHRocyhhbGxJdGVtcyk7XG5cblx0XHRcdG1heFdpZHRoID0gY2xhbXAoTWF0aC5tYXgoLi4uaXRlbVdpZHRocykpO1xuXG5cdFx0XHQvLyBSZXN0b3JlIHZpc2libGUgaXRlbXNcblx0XHRcdHRoaXMuX2xpc3Quc3BsaWNlKDAsIGFsbEl0ZW1zLmxlbmd0aCwgdmlzaWJsZUl0ZW1zKTtcblx0XHRcdHJldHVybiBtYXhXaWR0aDtcblx0XHR9XG5cblx0XHQvLyBBbGwgaXRlbXMgYXJlIHZpc2libGUsIG1lYXN1cmUgdGhlbSBkaXJlY3RseVxuXHRcdGNvbnN0IHZpc2libGVJdGVtczogSUFjdGlvbkxpc3RJdGVtPFQ+W10gPSBbXTtcblx0XHRmb3IgKGxldCBpID0gMDsgaSA8IHZpc2libGVDb3VudDsgaSsrKSB7XG5cdFx0XHR2aXNpYmxlSXRlbXMucHVzaCh0aGlzLl9saXN0LmVsZW1lbnQoaSkpO1xuXHRcdH1cblx0XHRjb25zdCBpdGVtV2lkdGhzID0gdGhpcy5fbWVhc3VyZUl0ZW1XaWR0aHModmlzaWJsZUl0ZW1zKTtcblx0XHRyZXR1cm4gY2xhbXAoTWF0aC5tYXgoLi4uaXRlbVdpZHRocykpO1xuXHR9XG5cblx0Zm9jdXNQcmV2aW91cygpIHtcblx0XHRpZiAodGhpcy5fZmlsdGVySW5wdXQgJiYgZG9tLmlzQWN0aXZlRWxlbWVudCh0aGlzLl9maWx0ZXJJbnB1dCkpIHtcblx0XHRcdHRoaXMuX2xpc3QuZG9tRm9jdXMoKTtcblx0XHRcdC8vIEFuIGl0ZW0gaXMgYWxyZWFkeSBoaWdobGlnaHRlZDsgYWR2YW5jZSBmcm9tIGl0IGluc3RlYWQgb2YganVtcGluZyB0byBsYXN0XG5cdFx0XHRjb25zdCBjdXJyZW50ID0gdGhpcy5fbGlzdC5nZXRGb2N1cygpO1xuXHRcdFx0aWYgKGN1cnJlbnQubGVuZ3RoID4gMCkge1xuXHRcdFx0XHR0aGlzLl9saXN0LmZvY3VzUHJldmlvdXMoMSwgZmFsc2UsIHVuZGVmaW5lZCwgdGhpcy5mb2N1c0NvbmRpdGlvbik7XG5cdFx0XHRcdGNvbnN0IGZvY3VzZWQgPSB0aGlzLl9saXN0LmdldEZvY3VzKCk7XG5cdFx0XHRcdC8vIElmIHdlIGNvdWxkbid0IG1vdmUgKGFscmVhZHkgYXQgZmlyc3QpLCBnbyB0byBmaWx0ZXJcblx0XHRcdFx0aWYgKGZvY3VzZWQubGVuZ3RoID4gMCAmJiBmb2N1c2VkWzBdID49IGN1cnJlbnRbMF0pIHtcblx0XHRcdFx0XHR0aGlzLl9maWx0ZXJJbnB1dC5mb2N1cygpO1xuXHRcdFx0XHR9IGVsc2UgaWYgKGZvY3VzZWQubGVuZ3RoID4gMCkge1xuXHRcdFx0XHRcdHRoaXMuX2xpc3QucmV2ZWFsKGZvY3VzZWRbMF0pO1xuXHRcdFx0XHR9XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHR0aGlzLl9saXN0LmZvY3VzTGFzdCh1bmRlZmluZWQsIHRoaXMuZm9jdXNDb25kaXRpb24pO1xuXHRcdFx0XHRjb25zdCBmb2N1c2VkID0gdGhpcy5fbGlzdC5nZXRGb2N1cygpO1xuXHRcdFx0XHRpZiAoZm9jdXNlZC5sZW5ndGggPiAwKSB7XG5cdFx0XHRcdFx0dGhpcy5fbGlzdC5yZXZlYWwoZm9jdXNlZFswXSk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0Y29uc3QgcHJldmlvdXNGb2N1cyA9IHRoaXMuX2xpc3QuZ2V0Rm9jdXMoKTtcblx0XHR0aGlzLl9saXN0LmZvY3VzUHJldmlvdXMoMSwgdHJ1ZSwgdW5kZWZpbmVkLCB0aGlzLmZvY3VzQ29uZGl0aW9uKTtcblx0XHRjb25zdCBmb2N1c2VkID0gdGhpcy5fbGlzdC5nZXRGb2N1cygpO1xuXHRcdGlmIChmb2N1c2VkLmxlbmd0aCA+IDApIHtcblx0XHRcdC8vIElmIGZvY3VzIHdyYXBwZWQgKHdhcyBhdCBmaXJzdCBmb2N1c2FibGUsIG5vdyBhdCBsYXN0KSwgbW92ZSB0byBmaWx0ZXIgaW5zdGVhZFxuXHRcdFx0aWYgKHRoaXMuX2ZpbHRlcklucHV0ICYmIHByZXZpb3VzRm9jdXMubGVuZ3RoID4gMCAmJiBmb2N1c2VkWzBdID4gcHJldmlvdXNGb2N1c1swXSkge1xuXHRcdFx0XHR0aGlzLl9saXN0LnNldEZvY3VzKFtdKTtcblx0XHRcdFx0dGhpcy5fZmlsdGVySW5wdXQuZm9jdXMoKTtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXHRcdFx0dGhpcy5fbGlzdC5yZXZlYWwoZm9jdXNlZFswXSk7XG5cdFx0fVxuXHR9XG5cblx0Zm9jdXNOZXh0KCkge1xuXHRcdGlmICh0aGlzLl9maWx0ZXJJbnB1dCAmJiBkb20uaXNBY3RpdmVFbGVtZW50KHRoaXMuX2ZpbHRlcklucHV0KSkge1xuXHRcdFx0dGhpcy5fbGlzdC5kb21Gb2N1cygpO1xuXHRcdFx0Ly8gQW4gaXRlbSBpcyBhbHJlYWR5IGhpZ2hsaWdodGVkOyBhZHZhbmNlIGZyb20gaXQgaW5zdGVhZCBvZiBqdW1waW5nIHRvIGZpcnN0XG5cdFx0XHRjb25zdCBjdXJyZW50ID0gdGhpcy5fbGlzdC5nZXRGb2N1cygpO1xuXHRcdFx0aWYgKGN1cnJlbnQubGVuZ3RoID4gMCkge1xuXHRcdFx0XHR0aGlzLl9saXN0LmZvY3VzTmV4dCgxLCBmYWxzZSwgdW5kZWZpbmVkLCB0aGlzLmZvY3VzQ29uZGl0aW9uKTtcblx0XHRcdFx0Y29uc3QgZm9jdXNlZCA9IHRoaXMuX2xpc3QuZ2V0Rm9jdXMoKTtcblx0XHRcdFx0aWYgKGZvY3VzZWQubGVuZ3RoID4gMCkge1xuXHRcdFx0XHRcdHRoaXMuX2xpc3QucmV2ZWFsKGZvY3VzZWRbMF0pO1xuXHRcdFx0XHR9XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHR0aGlzLl9saXN0LmZvY3VzRmlyc3QodW5kZWZpbmVkLCB0aGlzLmZvY3VzQ29uZGl0aW9uKTtcblx0XHRcdFx0Y29uc3QgZm9jdXNlZCA9IHRoaXMuX2xpc3QuZ2V0Rm9jdXMoKTtcblx0XHRcdFx0aWYgKGZvY3VzZWQubGVuZ3RoID4gMCkge1xuXHRcdFx0XHRcdHRoaXMuX2xpc3QucmV2ZWFsKGZvY3VzZWRbMF0pO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGNvbnN0IHByZXZpb3VzRm9jdXMgPSB0aGlzLl9saXN0LmdldEZvY3VzKCk7XG5cdFx0dGhpcy5fbGlzdC5mb2N1c05leHQoMSwgdHJ1ZSwgdW5kZWZpbmVkLCB0aGlzLmZvY3VzQ29uZGl0aW9uKTtcblx0XHRjb25zdCBmb2N1c2VkID0gdGhpcy5fbGlzdC5nZXRGb2N1cygpO1xuXHRcdGlmIChmb2N1c2VkLmxlbmd0aCA+IDApIHtcblx0XHRcdC8vIElmIGZvY3VzIHdyYXBwZWQgKHdhcyBhdCBsYXN0IGZvY3VzYWJsZSwgbm93IGF0IGZpcnN0KSwgbW92ZSB0byBmaWx0ZXIgaW5zdGVhZFxuXHRcdFx0aWYgKHRoaXMuX2ZpbHRlcklucHV0ICYmIHByZXZpb3VzRm9jdXMubGVuZ3RoID4gMCAmJiBmb2N1c2VkWzBdIDwgcHJldmlvdXNGb2N1c1swXSkge1xuXHRcdFx0XHR0aGlzLl9saXN0LnNldEZvY3VzKFtdKTtcblx0XHRcdFx0dGhpcy5fZmlsdGVySW5wdXQuZm9jdXMoKTtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXHRcdFx0dGhpcy5fbGlzdC5yZXZlYWwoZm9jdXNlZFswXSk7XG5cdFx0fVxuXHR9XG5cblx0Y29sbGFwc2VGb2N1c2VkU2VjdGlvbigpIHtcblx0XHRjb25zdCBzZWN0aW9uID0gdGhpcy5fZ2V0Rm9jdXNlZFNlY3Rpb24oKTtcblx0XHRpZiAoc2VjdGlvbiAmJiAhdGhpcy5fY29sbGFwc2VkU2VjdGlvbnMuaGFzKHNlY3Rpb24pKSB7XG5cdFx0XHR0aGlzLl90b2dnbGVTZWN0aW9uKHNlY3Rpb24pO1xuXHRcdH1cblx0fVxuXG5cdGV4cGFuZEZvY3VzZWRTZWN0aW9uKCkge1xuXHRcdGNvbnN0IHNlY3Rpb24gPSB0aGlzLl9nZXRGb2N1c2VkU2VjdGlvbigpO1xuXHRcdGlmIChzZWN0aW9uICYmIHRoaXMuX2NvbGxhcHNlZFNlY3Rpb25zLmhhcyhzZWN0aW9uKSkge1xuXHRcdFx0dGhpcy5fdG9nZ2xlU2VjdGlvbihzZWN0aW9uKTtcblx0XHR9XG5cdH1cblxuXHR0b2dnbGVGb2N1c2VkU2VjdGlvbigpOiBib29sZWFuIHtcblx0XHRjb25zdCBmb2N1c2VkID0gdGhpcy5fbGlzdC5nZXRGb2N1cygpO1xuXHRcdGlmIChmb2N1c2VkLmxlbmd0aCA9PT0gMCkge1xuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH1cblx0XHRjb25zdCBlbGVtZW50ID0gdGhpcy5fbGlzdC5lbGVtZW50KGZvY3VzZWRbMF0pO1xuXHRcdGlmIChlbGVtZW50LmlzU2VjdGlvblRvZ2dsZSAmJiBlbGVtZW50LnNlY3Rpb24pIHtcblx0XHRcdHRoaXMuX3RvZ2dsZVNlY3Rpb24oZWxlbWVudC5zZWN0aW9uKTtcblx0XHRcdHJldHVybiB0cnVlO1xuXHRcdH1cblx0XHRyZXR1cm4gZmFsc2U7XG5cdH1cblxuXHRwcml2YXRlIF9nZXRGb2N1c2VkU2VjdGlvbigpOiBzdHJpbmcgfCB1bmRlZmluZWQge1xuXHRcdGNvbnN0IGZvY3VzZWQgPSB0aGlzLl9saXN0LmdldEZvY3VzKCk7XG5cdFx0aWYgKGZvY3VzZWQubGVuZ3RoID09PSAwKSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblx0XHRjb25zdCBlbGVtZW50ID0gdGhpcy5fbGlzdC5lbGVtZW50KGZvY3VzZWRbMF0pO1xuXHRcdGlmIChlbGVtZW50LmlzU2VjdGlvblRvZ2dsZSAmJiBlbGVtZW50LnNlY3Rpb24pIHtcblx0XHRcdHJldHVybiBlbGVtZW50LnNlY3Rpb247XG5cdFx0fVxuXHRcdHJldHVybiBlbGVtZW50LnNlY3Rpb247XG5cdH1cblxuXHRhY2NlcHRTZWxlY3RlZChwcmV2aWV3PzogYm9vbGVhbikge1xuXHRcdGNvbnN0IGZvY3VzZWQgPSB0aGlzLl9saXN0LmdldEZvY3VzKCk7XG5cdFx0aWYgKGZvY3VzZWQubGVuZ3RoID09PSAwKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29uc3QgZm9jdXNJbmRleCA9IGZvY3VzZWRbMF07XG5cdFx0Y29uc3QgZWxlbWVudCA9IHRoaXMuX2xpc3QuZWxlbWVudChmb2N1c0luZGV4KTtcblx0XHRpZiAoIXRoaXMuZm9jdXNDb25kaXRpb24oZWxlbWVudCkpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCBldmVudCA9IHByZXZpZXcgPyBuZXcgUHJldmlld1NlbGVjdGVkRXZlbnQoKSA6IG5ldyBBY2NlcHRTZWxlY3RlZEV2ZW50KCk7XG5cdFx0dGhpcy5fbGlzdC5zZXRTZWxlY3Rpb24oW2ZvY3VzSW5kZXhdLCBldmVudCk7XG5cdH1cblxuXHRwcml2YXRlIG9uTGlzdFNlbGVjdGlvbihlOiBJTGlzdEV2ZW50PElBY3Rpb25MaXN0SXRlbTxUPj4pOiB2b2lkIHtcblx0XHRpZiAoIWUuZWxlbWVudHMubGVuZ3RoKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29uc3QgZWxlbWVudCA9IGUuZWxlbWVudHNbMF07XG5cdFx0aWYgKGVsZW1lbnQuaXNTZWN0aW9uVG9nZ2xlICYmIGVsZW1lbnQuc2VjdGlvbikge1xuXHRcdFx0dGhpcy5fbGlzdC5zZXRTZWxlY3Rpb24oW10pO1xuXHRcdFx0Y29uc3Qgc2VjdGlvbiA9IGVsZW1lbnQuc2VjdGlvbjtcblx0XHRcdHF1ZXVlTWljcm90YXNrKCgpID0+IHtcblx0XHRcdFx0dGhpcy5fdG9nZ2xlU2VjdGlvbihzZWN0aW9uKTtcblx0XHRcdH0pO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHQvLyBEb24ndCBzZWxlY3Qgd2hlbiBjbGlja2luZyB0aGUgdG9vbGJhciwgc3VibWVudSBpbmRpY2F0b3IsIG9yIGlubGluZSB0b2dnbGVcblx0XHRpZiAoZG9tLmlzTW91c2VFdmVudChlLmJyb3dzZXJFdmVudCkpIHtcblx0XHRcdGNvbnN0IHRhcmdldCA9IGUuYnJvd3NlckV2ZW50LnRhcmdldDtcblx0XHRcdGlmIChkb20uaXNIVE1MRWxlbWVudCh0YXJnZXQpICYmICh0YXJnZXQuY2xvc2VzdCgnLmFjdGlvbi1saXN0LWl0ZW0tdG9vbGJhcicpIHx8IHRhcmdldC5jbG9zZXN0KCcuYWN0aW9uLWxpc3Qtc3VibWVudS1pbmRpY2F0b3InKSB8fCB0YXJnZXQuY2xvc2VzdCgnLmFjdGlvbi1saXN0LWl0ZW0taW5saW5lLXRvZ2dsZScpKSkge1xuXHRcdFx0XHR0aGlzLl9saXN0LnNldFNlbGVjdGlvbihbXSk7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblx0XHR9XG5cdFx0aWYgKGVsZW1lbnQuaXRlbSAmJiB0aGlzLmZvY3VzQ29uZGl0aW9uKGVsZW1lbnQpKSB7XG5cdFx0XHRjb25zdCBpc1ByZXZpZXdFdmVudCA9IGUuYnJvd3NlckV2ZW50IGluc3RhbmNlb2YgUHJldmlld1NlbGVjdGVkRXZlbnQ7XG5cdFx0XHR0aGlzLl9kZWxlZ2F0ZS5vblNlbGVjdChlbGVtZW50Lml0ZW0sIGlzUHJldmlld0V2ZW50ICYmIHRoaXMuX3N1cHBvcnRzUHJldmlldyk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHRoaXMuX2xpc3Quc2V0U2VsZWN0aW9uKFtdKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIG9uRm9jdXMoKSB7XG5cdFx0Y29uc3QgZm9jdXNlZCA9IHRoaXMuX2xpc3QuZ2V0Rm9jdXMoKTtcblx0XHRpZiAoZm9jdXNlZC5sZW5ndGggPT09IDApIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0Y29uc3QgZm9jdXNJbmRleCA9IGZvY3VzZWRbMF07XG5cdFx0Y29uc3QgZWxlbWVudCA9IHRoaXMuX2xpc3QuZWxlbWVudChmb2N1c0luZGV4KTtcblx0XHR0aGlzLl9kZWxlZ2F0ZS5vbkZvY3VzPy4oZWxlbWVudC5pdGVtKTtcblxuXHRcdC8vIFNob3cgaG92ZXIgb24gZm9jdXMgY2hhbmdlIChzdXBwcmVzcyBkdXJpbmcgcHJvZ3JhbW1hdGljIGluaXRpYWwgZm9jdXMpXG5cdFx0aWYgKCF0aGlzLl9zdXBwcmVzc0hvdmVyKSB7XG5cdFx0XHR0aGlzLl9zaG93SG92ZXJGb3JFbGVtZW50KGVsZW1lbnQsIGZvY3VzSW5kZXgpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgX3JlbW92ZUl0ZW0oaXRlbTogSUFjdGlvbkxpc3RJdGVtPFQ+KTogdm9pZCB7XG5cdFx0Y29uc3QgaW5kZXggPSB0aGlzLl9hbGxNZW51SXRlbXMuaW5kZXhPZihpdGVtKTtcblx0XHRpZiAoaW5kZXggPj0gMCkge1xuXHRcdFx0dGhpcy5fYWxsTWVudUl0ZW1zLnNwbGljZShpbmRleCwgMSk7XG5cdFx0XHR0aGlzLl9hcHBseUZpbHRlcigpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgX3JlY29tcHV0ZUdyb3VwVGl0bGVzKGl0ZW1zOiByZWFkb25seSBJQWN0aW9uTGlzdEl0ZW08VD5bXSk6IHZvaWQge1xuXHRcdHRoaXMuX2dyb3VwVGl0bGVCeUluZGV4LmNsZWFyKCk7XG5cdFx0Y29uc3Qgc2VlblRpdGxlcyA9IG5ldyBTZXQ8c3RyaW5nPigpO1xuXHRcdGZvciAobGV0IGkgPSAwOyBpIDwgaXRlbXMubGVuZ3RoOyBpKyspIHtcblx0XHRcdGNvbnN0IGl0ZW0gPSBpdGVtc1tpXTtcblx0XHRcdGlmIChpdGVtLmtpbmQgPT09IEFjdGlvbkxpc3RJdGVtS2luZC5BY3Rpb24gJiYgaXRlbS5ncm91cD8udGl0bGUgJiYgIXNlZW5UaXRsZXMuaGFzKGl0ZW0uZ3JvdXAudGl0bGUpKSB7XG5cdFx0XHRcdHNlZW5UaXRsZXMuYWRkKGl0ZW0uZ3JvdXAudGl0bGUpO1xuXHRcdFx0XHR0aGlzLl9ncm91cFRpdGxlQnlJbmRleC5zZXQoaSwgaXRlbS5ncm91cC50aXRsZSk7XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBfbWVhc3VyZUl0ZW1XaWR0aHMoaXRlbXM6IHJlYWRvbmx5IElBY3Rpb25MaXN0SXRlbTxUPltdKTogbnVtYmVyW10ge1xuXHRcdGNvbnN0IHJvd3M6IHsgZWxlbWVudDogSFRNTEVsZW1lbnQ7IGl0ZW06IElBY3Rpb25MaXN0SXRlbTxUPiB9W10gPSBbXTtcblx0XHRmb3IgKGxldCBpID0gMDsgaSA8IGl0ZW1zLmxlbmd0aDsgaSsrKSB7XG5cdFx0XHRjb25zdCBlbGVtZW50ID0gdGhpcy5fZ2V0Um93RWxlbWVudChpKTtcblx0XHRcdGlmIChlbGVtZW50KSB7XG5cdFx0XHRcdGVsZW1lbnQuc3R5bGUud2lkdGggPSAnYXV0byc7XG5cdFx0XHRcdHJvd3MucHVzaCh7IGVsZW1lbnQsIGl0ZW06IGl0ZW1zW2ldIH0pO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdHRyeSB7XG5cdFx0XHRyZXR1cm4gcm93cy5tYXAoKHsgZWxlbWVudCwgaXRlbSB9KSA9PiBlbGVtZW50LmdldEJvdW5kaW5nQ2xpZW50UmVjdCgpLndpZHRoICsgdGhpcy5fY29tcHV0ZVRvb2xiYXJXaWR0aChpdGVtKSk7XG5cdFx0fSBmaW5hbGx5IHtcblx0XHRcdGZvciAoY29uc3QgeyBlbGVtZW50IH0gb2Ygcm93cykge1xuXHRcdFx0XHRlbGVtZW50LnN0eWxlLndpZHRoID0gJyc7XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBfY29tcHV0ZVRvb2xiYXJXaWR0aChpdGVtOiBJQWN0aW9uTGlzdEl0ZW08VD4pOiBudW1iZXIge1xuXHRcdGxldCBhY3Rpb25Db3VudCA9IGl0ZW0udG9vbGJhckFjdGlvbnM/Lmxlbmd0aCA/PyAwO1xuXHRcdGlmIChpdGVtLm9uUmVtb3ZlKSB7XG5cdFx0XHRhY3Rpb25Db3VudCsrO1xuXHRcdH1cblx0XHRpZiAoYWN0aW9uQ291bnQgPT09IDApIHtcblx0XHRcdHJldHVybiAwO1xuXHRcdH1cblx0XHQvLyBFYWNoIHRvb2xiYXIgYWN0aW9uIGJ1dHRvbiBpcyB+MjJweCAoMTZweCBpY29uICsgcGFkZGluZykgcGx1cyA2cHggcm93IGdhcFxuXHRcdGNvbnN0IGFjdGlvbkJ1dHRvbldpZHRoID0gMjI7XG5cdFx0cmV0dXJuIGFjdGlvbkNvdW50ICogYWN0aW9uQnV0dG9uV2lkdGggKyA2O1xuXHR9XG5cblx0cHJpdmF0ZSBfZ2V0Um93RWxlbWVudChpbmRleDogbnVtYmVyKTogSFRNTEVsZW1lbnQgfCBudWxsIHtcblx0XHQvLyBlc2xpbnQtZGlzYWJsZS1uZXh0LWxpbmUgbm8tcmVzdHJpY3RlZC1zeW50YXhcblx0XHRyZXR1cm4gdGhpcy5kb21Ob2RlLm93bmVyRG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQodGhpcy5fbGlzdC5nZXRFbGVtZW50SUQoaW5kZXgpKTtcblx0fVxuXG5cdHByaXZhdGUgX3Nob3dIb3ZlckZvckVsZW1lbnQoZWxlbWVudDogSUFjdGlvbkxpc3RJdGVtPFQ+LCBpbmRleDogbnVtYmVyKTogdm9pZCB7XG5cdFx0aWYgKHRoaXMuX2N1cnJlbnRTdWJtZW51RWxlbWVudCA9PT0gZWxlbWVudCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IGhhc0hvdmVyQ29udGVudCA9ICEhZWxlbWVudC5ob3Zlcj8uY29udGVudDtcblx0XHRjb25zdCBoYXNTdWJtZW51QWN0aW9ucyA9ICEhZWxlbWVudC5zdWJtZW51QWN0aW9ucz8ubGVuZ3RoO1xuXG5cdFx0aWYgKGhhc0hvdmVyQ29udGVudCB8fCBoYXNTdWJtZW51QWN0aW9ucykge1xuXHRcdFx0Y29uc3Qgcm93RWxlbWVudCA9IHRoaXMuX2dldFJvd0VsZW1lbnQoaW5kZXgpO1xuXHRcdFx0aWYgKHJvd0VsZW1lbnQpIHtcblx0XHRcdFx0dGhpcy5fc2hvd1N1Ym1lbnVGb3JFbGVtZW50KGVsZW1lbnQsIHJvd0VsZW1lbnQpO1xuXHRcdFx0fVxuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdC8vIE5hdmlnYXRlZCB0byBhbiBpdGVtIHdpdGggbm8gaG92ZXIvc3VibWVudSBcdTIwMTQgZnVsbHkgdGVhciBkb3duIGFueVxuXHRcdC8vIHByZXZpb3VzIHN1Ym1lbnUgc28gYSBibGFuayBwYW5lbCBkb2Vzbid0IGxpbmdlci5cblx0XHR0aGlzLl9oaWRlU3VibWVudSgpO1xuXHR9XG5cblx0cHJpdmF0ZSBfc2hvd1N1Ym1lbnVGb3JJdGVtKGl0ZW06IElBY3Rpb25MaXN0SXRlbTxUPik6IHZvaWQge1xuXHRcdGNvbnN0IGluZGV4ID0gdGhpcy5fbGlzdC5pbmRleE9mKGl0ZW0pO1xuXHRcdGlmIChpbmRleCA+PSAwKSB7XG5cdFx0XHRjb25zdCByb3dFbGVtZW50ID0gdGhpcy5fZ2V0Um93RWxlbWVudChpbmRleCk7XG5cdFx0XHRpZiAocm93RWxlbWVudCkge1xuXHRcdFx0XHR0aGlzLl9zaG93U3VibWVudUZvckVsZW1lbnQoaXRlbSwgcm93RWxlbWVudCk7XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBfc2hvd1N1Ym1lbnVGb3JFbGVtZW50KGVsZW1lbnQ6IElBY3Rpb25MaXN0SXRlbTxUPiwgYW5jaG9yOiBIVE1MRWxlbWVudCk6IHZvaWQge1xuXHRcdGlmICh0aGlzLl9jdXJyZW50U3VibWVudUVsZW1lbnQgPT09IGVsZW1lbnQpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHR0aGlzLl9zdWJtZW51RGlzcG9zYWJsZXMuY2xlYXIoKTtcblx0XHR0aGlzLl9jdXJyZW50U3VibWVudUVsZW1lbnQgPSBlbGVtZW50O1xuXHRcdHRoaXMuX2NsZWFyU3VibWVudUNvbnRhaW5lcigpO1xuXG5cdFx0Ly8gV2hlbiB0aGUgaXRlbSBoYXMgaG92ZXIgY29udGVudCwgcmVuZGVyIGl0IGFzIGEgaGVhZGVyXG5cdFx0bGV0IGhvdmVySGVhZGVyOiBIVE1MRWxlbWVudCB8IHVuZGVmaW5lZDtcblx0XHRjb25zdCBob3ZlckNvbnRlbnQgPSBlbGVtZW50LmhvdmVyPy5jb250ZW50O1xuXHRcdGlmIChob3ZlckNvbnRlbnQpIHtcblx0XHRcdGlmIChkb20uaXNIVE1MRWxlbWVudChob3ZlckNvbnRlbnQpKSB7XG5cdFx0XHRcdGhvdmVySGVhZGVyID0gaG92ZXJDb250ZW50O1xuXHRcdFx0XHQvLyBUaGUgaG92ZXIgZWxlbWVudCBpcyBvd25lZCBieSB0aGUgY2FsbGVyIGFuZCByZXVzZWQgYWNyb3NzIHNob3dzLFxuXHRcdFx0XHQvLyBzbyBpdHMgZGlzcG9zYWJsZSBtdXN0IE5PVCBiZSB0aWVkIHRvIHRoZSBwZXItbmF2aWdhdGlvbiBzdWJtZW51XG5cdFx0XHRcdC8vIHN0b3JlICh3aGljaCBpcyBjbGVhcmVkIGV2ZXJ5IHRpbWUgdGhlIHN1Ym1lbnUgc3dpdGNoZXMpLiBUZWFyaW5nXG5cdFx0XHRcdC8vIGl0IGRvd24gdGhlcmUgd291bGQgZGVzdHJveSByZXVzZWQgY29udGVudCBcdTIwMTQgZS5nLiBCdXR0b24gd2lkZ2V0c1xuXHRcdFx0XHQvLyByZW1vdmUgdGhlaXIgRE9NIG9uIGRpc3Bvc2UsIGxlYXZpbmcgYW4gZW1wdHkgaG92ZXIuIFRyYWNrIGl0IGZvclxuXHRcdFx0XHQvLyB0aGUgd2lkZ2V0J3MgbGlmZXRpbWUgaW5zdGVhZC5cblx0XHRcdFx0aWYgKGVsZW1lbnQuaG92ZXI/LmRpc3Bvc2FibGUpIHtcblx0XHRcdFx0XHR0aGlzLl9yZWdpc3RlcihlbGVtZW50LmhvdmVyLmRpc3Bvc2FibGUpO1xuXHRcdFx0XHR9XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRjb25zdCBtYXJrZG93biA9IHR5cGVvZiBob3ZlckNvbnRlbnQgPT09ICdzdHJpbmcnID8gbmV3IE1hcmtkb3duU3RyaW5nKGhvdmVyQ29udGVudCkgOiBob3ZlckNvbnRlbnQ7XG5cdFx0XHRcdGNvbnN0IGxpbmtIYW5kbGVyID0gdGhpcy5fb3B0aW9ucz8ubGlua0hhbmRsZXI7XG5cdFx0XHRcdGNvbnN0IHJlbmRlcmVkID0gcmVuZGVyTWFya2Rvd24obWFya2Rvd24sIHtcblx0XHRcdFx0XHRhY3Rpb25IYW5kbGVyOiAodXJsOiBzdHJpbmcpID0+IHtcblx0XHRcdFx0XHRcdGNvbnN0IHVyaSA9IFVSSS5wYXJzZSh1cmwpO1xuXHRcdFx0XHRcdFx0aWYgKGxpbmtIYW5kbGVyKSB7XG5cdFx0XHRcdFx0XHRcdGxpbmtIYW5kbGVyKHVyaSwgZWxlbWVudCk7XG5cdFx0XHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdFx0XHR0aGlzLl9vcGVuZXJTZXJ2aWNlLm9wZW4odXJpLCB7IGFsbG93Q29tbWFuZHM6IHRydWUgfSk7XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0fSxcblx0XHRcdFx0fSk7XG5cdFx0XHRcdHRoaXMuX3N1Ym1lbnVEaXNwb3NhYmxlcy5hZGQocmVuZGVyZWQpO1xuXHRcdFx0XHRob3ZlckhlYWRlciA9IHJlbmRlcmVkLmVsZW1lbnQ7XG5cdFx0XHR9XG5cdFx0XHRob3ZlckhlYWRlci5jbGFzc0xpc3QuYWRkKCdhY3Rpb24tbGlzdC1zdWJtZW51LWhvdmVyLWhlYWRlcicpO1xuXHRcdFx0aWYgKGVsZW1lbnQuc3VibWVudUFjdGlvbnM/Lmxlbmd0aCkge1xuXHRcdFx0XHRob3ZlckhlYWRlci5jbGFzc0xpc3QuYWRkKCdoYXMtc3VibWVudScpO1xuXHRcdFx0fVxuXHRcdFx0dGhpcy5fc3VibWVudUNvbnRhaW5lci5hcHBlbmRDaGlsZChob3ZlckhlYWRlcik7XG5cdFx0fVxuXG5cdFx0Y29uc3QgaGFzU3VibWVudUFjdGlvbnMgPSAhIWVsZW1lbnQuc3VibWVudUFjdGlvbnM/Lmxlbmd0aDtcblxuXHRcdC8vIFNob3cgY29udGFpbmVyIGJlZm9yZSBjcmVhdGluZyB3aWRnZXQgc28gTGlzdCBjYW4gbWVhc3VyZSBkdXJpbmcgY29uc3RydWN0aW9uXG5cdFx0dGhpcy5fc3VibWVudUNvbnRhaW5lci5zdHlsZS5kaXNwbGF5ID0gJyc7XG5cdFx0dGhpcy5fc3VibWVudUNvbnRhaW5lci5zdHlsZS5wb3NpdGlvbiA9ICdhYnNvbHV0ZSc7XG5cdFx0dGhpcy5fc3VibWVudUNvbnRhaW5lci5yZW1vdmVBdHRyaWJ1dGUoJ3JvbGUnKTtcblxuXHRcdGNvbnN0IGFuY2hvclJlY3QgPSBhbmNob3IuZ2V0Qm91bmRpbmdDbGllbnRSZWN0KCk7XG5cdFx0Y29uc3QgcGFyZW50UmVjdCA9IHRoaXMuZG9tTm9kZS5nZXRCb3VuZGluZ0NsaWVudFJlY3QoKTtcblx0XHRjb25zdCB0YXJnZXRXaW5kb3cgPSBkb20uZ2V0V2luZG93KHRoaXMuZG9tTm9kZSk7XG5cblx0XHRsZXQgdG90YWxIZWlnaHQgPSAwO1xuXHRcdGxldCBtYXhXaWR0aCA9IGhvdmVySGVhZGVyID8gaG92ZXJIZWFkZXIub2Zmc2V0V2lkdGggOiAwO1xuXG5cdFx0aWYgKGhhc1N1Ym1lbnVBY3Rpb25zKSB7XG5cdFx0XHQvLyBDb252ZXJ0IHN1Ym1lbnUgYWN0aW9ucyBpbnRvIEFjdGlvbkxpc3RXaWRnZXQgaXRlbXNcblx0XHRcdGNvbnN0IHN1Ym1lbnVJdGVtczogSUFjdGlvbkxpc3RJdGVtPElBY3Rpb24+W10gPSBbXTtcblx0XHRcdGNvbnN0IHN1Ym1lbnVHcm91cHMgPSBlbGVtZW50LnN1Ym1lbnVBY3Rpb25zIS5maWx0ZXIoKGEpOiBhIGlzIFN1Ym1lbnVBY3Rpb24gPT4gYSBpbnN0YW5jZW9mIFN1Ym1lbnVBY3Rpb24pO1xuXHRcdFx0Y29uc3QgZ3JvdXBzV2l0aEFjdGlvbnMgPSBzdWJtZW51R3JvdXBzLmZpbHRlcihnID0+IGcuYWN0aW9ucy5sZW5ndGggPiAwKTtcblx0XHRcdGZvciAobGV0IGdpID0gMDsgZ2kgPCBncm91cHNXaXRoQWN0aW9ucy5sZW5ndGg7IGdpKyspIHtcblx0XHRcdFx0Y29uc3QgZ3JvdXAgPSBncm91cHNXaXRoQWN0aW9uc1tnaV07XG5cdFx0XHRcdGlmIChncm91cC5sYWJlbCkge1xuXHRcdFx0XHRcdHN1Ym1lbnVJdGVtcy5wdXNoKHtcblx0XHRcdFx0XHRcdGtpbmQ6IEFjdGlvbkxpc3RJdGVtS2luZC5IZWFkZXIsXG5cdFx0XHRcdFx0XHRncm91cDogeyB0aXRsZTogZ3JvdXAubGFiZWwgfSxcblx0XHRcdFx0XHRcdGxhYmVsOiBncm91cC5sYWJlbCxcblx0XHRcdFx0XHR9KTtcblx0XHRcdFx0fVxuXHRcdFx0XHRmb3IgKGxldCBjaSA9IDA7IGNpIDwgZ3JvdXAuYWN0aW9ucy5sZW5ndGg7IGNpKyspIHtcblx0XHRcdFx0XHRjb25zdCBjaGlsZCA9IGdyb3VwLmFjdGlvbnNbY2ldO1xuXHRcdFx0XHRcdGNvbnN0IGV4dGVuZGVkQ2hpbGQgPSBjaGlsZCBhcyBJQWN0aW9uICYgeyBpY29uPzogVGhlbWVJY29uOyBob3ZlckNvbnRlbnQ/OiBzdHJpbmc7IG9uUmVtb3ZlPzogKCkgPT4gdm9pZCB9O1xuXHRcdFx0XHRcdGNvbnN0IGljb24gPSBleHRlbmRlZENoaWxkLmljb25cblx0XHRcdFx0XHRcdD8/IFRoZW1lSWNvbi5mcm9tSWQoY2hpbGQuY2hlY2tlZCA/IENvZGljb24uY2hlY2suaWQgOiBDb2RpY29uLmJsYW5rLmlkKTtcblx0XHRcdFx0XHRjb25zdCBob3ZlckNvbnRlbnQgPSBleHRlbmRlZENoaWxkLmhvdmVyQ29udGVudDtcblx0XHRcdFx0XHRzdWJtZW51SXRlbXMucHVzaCh7XG5cdFx0XHRcdFx0XHRpdGVtOiBjaGlsZCxcblx0XHRcdFx0XHRcdGtpbmQ6IEFjdGlvbkxpc3RJdGVtS2luZC5BY3Rpb24sXG5cdFx0XHRcdFx0XHRsYWJlbDogY2hpbGQubGFiZWwsXG5cdFx0XHRcdFx0XHRkZXNjcmlwdGlvbjogY2hpbGQudG9vbHRpcCB8fCB1bmRlZmluZWQsXG5cdFx0XHRcdFx0XHRncm91cDogeyB0aXRsZTogJycsIGljb24gfSxcblx0XHRcdFx0XHRcdGhpZGVJY29uOiBmYWxzZSxcblx0XHRcdFx0XHRcdGhvdmVyOiBob3ZlckNvbnRlbnQgPyB7IGNvbnRlbnQ6IGhvdmVyQ29udGVudCB9IDoge30sXG5cdFx0XHRcdFx0XHRvblJlbW92ZTogZXh0ZW5kZWRDaGlsZC5vblJlbW92ZSxcblx0XHRcdFx0XHR9KTtcblx0XHRcdFx0fVxuXHRcdFx0XHRpZiAoZ2kgPCBncm91cHNXaXRoQWN0aW9ucy5sZW5ndGggLSAxKSB7XG5cdFx0XHRcdFx0c3VibWVudUl0ZW1zLnB1c2goeyBraW5kOiBBY3Rpb25MaXN0SXRlbUtpbmQuU2VwYXJhdG9yLCBsYWJlbDogJycgfSk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHRcdC8vIEFsc28gaW5jbHVkZSBub24tU3VibWVudUFjdGlvbiBpdGVtcyBkaXJlY3RseVxuXHRcdFx0Zm9yIChjb25zdCBhY3Rpb24gb2YgZWxlbWVudC5zdWJtZW51QWN0aW9ucyEpIHtcblx0XHRcdFx0aWYgKCEoYWN0aW9uIGluc3RhbmNlb2YgU3VibWVudUFjdGlvbikpIHtcblx0XHRcdFx0XHRjb25zdCBleHRlbmRlZEFjdGlvbiA9IGFjdGlvbiBhcyBJQWN0aW9uICYgeyBvblJlbW92ZT86ICgpID0+IHZvaWQgfTtcblx0XHRcdFx0XHRzdWJtZW51SXRlbXMucHVzaCh7XG5cdFx0XHRcdFx0XHRpdGVtOiBhY3Rpb24sXG5cdFx0XHRcdFx0XHRraW5kOiBBY3Rpb25MaXN0SXRlbUtpbmQuQWN0aW9uLFxuXHRcdFx0XHRcdFx0bGFiZWw6IGFjdGlvbi5sYWJlbCxcblx0XHRcdFx0XHRcdGRlc2NyaXB0aW9uOiBhY3Rpb24udG9vbHRpcCB8fCB1bmRlZmluZWQsXG5cdFx0XHRcdFx0XHRncm91cDogeyB0aXRsZTogJycgfSxcblx0XHRcdFx0XHRcdGhpZGVJY29uOiBmYWxzZSxcblx0XHRcdFx0XHRcdGhvdmVyOiB7fSxcblx0XHRcdFx0XHRcdG9uUmVtb3ZlOiBleHRlbmRlZEFjdGlvbi5vblJlbW92ZSxcblx0XHRcdFx0XHR9KTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXG5cdFx0XHRjb25zdCBzdWJtZW51RGVsZWdhdGU6IElBY3Rpb25MaXN0RGVsZWdhdGU8SUFjdGlvbj4gPSB7XG5cdFx0XHRcdG9uSGlkZTogKCkgPT4geyB9LFxuXHRcdFx0XHRvblNlbGVjdDogKGFjdGlvbikgPT4ge1xuXHRcdFx0XHRcdGFjdGlvbi5ydW4oKTtcblx0XHRcdFx0XHRjb25zdCBwYXJlbnRJdGVtID0gdGhpcy5fY3VycmVudFN1Ym1lbnVFbGVtZW50Py5pdGVtO1xuXHRcdFx0XHRcdHRoaXMuX2hpZGVTdWJtZW51KCk7XG5cdFx0XHRcdFx0aWYgKHBhcmVudEl0ZW0pIHtcblx0XHRcdFx0XHRcdHRoaXMuX2RlbGVnYXRlLm9uU2VsZWN0KHBhcmVudEl0ZW0pO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHR0aGlzLmhpZGUoKTtcblx0XHRcdFx0fSxcblx0XHRcdH07XG5cblx0XHRcdGNvbnN0IHN1Ym1lbnVXaWRnZXQgPSB0aGlzLl9zdWJtZW51RGlzcG9zYWJsZXMuYWRkKHRoaXMuX2luc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFxuXHRcdFx0XHRBY3Rpb25MaXN0V2lkZ2V0PElBY3Rpb24+LFxuXHRcdFx0XHQnc3VibWVudScsXG5cdFx0XHRcdGZhbHNlLFxuXHRcdFx0XHRzdWJtZW51SXRlbXMsXG5cdFx0XHRcdHN1Ym1lbnVEZWxlZ2F0ZSxcblx0XHRcdFx0dW5kZWZpbmVkLFxuXHRcdFx0XHR1bmRlZmluZWQsXG5cdFx0XHQpKTtcblx0XHRcdHRoaXMuX3N1Ym1lbnVDb250YWluZXIuYXBwZW5kQ2hpbGQoc3VibWVudVdpZGdldC5kb21Ob2RlKTtcblx0XHRcdHRoaXMuX2N1cnJlbnRTdWJtZW51V2lkZ2V0ID0gc3VibWVudVdpZGdldDtcblxuXHRcdFx0Ly8gVGhlIHN1Ym1lbnUgd2lkZ2V0J3MgY29uc3RydWN0b3IgZm9jdXNlcyBpdHMgZmlyc3QgaXRlbSBieVxuXHRcdFx0Ly8gZGVmYXVsdDsgY2xlYXIgdGhhdCB1bnRpbCB0aGUgdXNlciBhY3R1YWxseSBuYXZpZ2F0ZXMgaW50b1xuXHRcdFx0Ly8gdGhlIHN1Ym1lbnUgKHZpYSBBcnJvd1JpZ2h0KSBzbyBpdCBkb2Vzbid0IHJlbmRlciBhcyBpZlxuXHRcdFx0Ly8gc2VsZWN0ZWQgd2hpbGUgdGhlIHBhcmVudCBsaXN0IHN0aWxsIGhhcyBmb2N1cy5cblx0XHRcdHN1Ym1lbnVXaWRnZXQuY2xlYXJGb2N1cygpO1xuXG5cdFx0XHR0b3RhbEhlaWdodCA9IHN1Ym1lbnVXaWRnZXQuY29tcHV0ZUxpc3RIZWlnaHQoKTtcblx0XHRcdHN1Ym1lbnVXaWRnZXQubGF5b3V0KHRvdGFsSGVpZ2h0KTtcblx0XHRcdGNvbnN0IHN1Ym1lbnVNYXhXaWR0aCA9IHN1Ym1lbnVXaWRnZXQuY29tcHV0ZU1heFdpZHRoKDApO1xuXHRcdFx0bWF4V2lkdGggPSBNYXRoLm1heChtYXhXaWR0aCwgc3VibWVudU1heFdpZHRoKTtcblx0XHRcdHN1Ym1lbnVXaWRnZXQubGF5b3V0KHRvdGFsSGVpZ2h0LCBtYXhXaWR0aCk7XG5cdFx0XHRzdWJtZW51V2lkZ2V0LmRvbU5vZGUuc3R5bGUud2lkdGggPSBgJHttYXhXaWR0aH1weGA7XG5cblx0XHRcdC8vIEtleWJvYXJkIG5hdmlnYXRpb24gaW4gc3VibWVudVxuXHRcdFx0dGhpcy5fc3VibWVudURpc3Bvc2FibGVzLmFkZChkb20uYWRkRGlzcG9zYWJsZUxpc3RlbmVyKHN1Ym1lbnVXaWRnZXQuZG9tTm9kZSwgJ2tleWRvd24nLCAoZTogS2V5Ym9hcmRFdmVudCkgPT4ge1xuXHRcdFx0XHRpZiAoZS5rZXkgPT09ICdFc2NhcGUnKSB7XG5cdFx0XHRcdFx0ZG9tLkV2ZW50SGVscGVyLnN0b3AoZSwgdHJ1ZSk7XG5cdFx0XHRcdFx0dGhpcy5faGlkZVN1Ym1lbnUoKTtcblx0XHRcdFx0XHR0aGlzLmhpZGUoKTtcblx0XHRcdFx0fSBlbHNlIGlmIChlLmtleSA9PT0gJ0Fycm93TGVmdCcpIHtcblx0XHRcdFx0XHRkb20uRXZlbnRIZWxwZXIuc3RvcChlLCB0cnVlKTtcblx0XHRcdFx0XHR0aGlzLl9oaWRlU3VibWVudSgpO1xuXHRcdFx0XHRcdHRoaXMuX2xpc3QuZG9tRm9jdXMoKTtcblx0XHRcdFx0fSBlbHNlIGlmIChlLmtleSA9PT0gJ0VudGVyJykge1xuXHRcdFx0XHRcdGRvbS5FdmVudEhlbHBlci5zdG9wKGUsIHRydWUpO1xuXHRcdFx0XHRcdGNvbnN0IGZvY3VzZWQgPSBzdWJtZW51V2lkZ2V0LmdldEZvY3VzZWRFbGVtZW50KCk7XG5cdFx0XHRcdFx0aWYgKGZvY3VzZWQ/Lml0ZW0pIHtcblx0XHRcdFx0XHRcdGZvY3VzZWQuaXRlbS5ydW4oKTtcblx0XHRcdFx0XHRcdGNvbnN0IHBhcmVudEl0ZW0gPSB0aGlzLl9jdXJyZW50U3VibWVudUVsZW1lbnQ/Lml0ZW07XG5cdFx0XHRcdFx0XHR0aGlzLl9oaWRlU3VibWVudSgpO1xuXHRcdFx0XHRcdFx0aWYgKHBhcmVudEl0ZW0pIHtcblx0XHRcdFx0XHRcdFx0dGhpcy5fZGVsZWdhdGUub25TZWxlY3QocGFyZW50SXRlbSk7XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHR0aGlzLmhpZGUoKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH0gZWxzZSBpZiAoZS5rZXkgPT09ICdBcnJvd0Rvd24nKSB7XG5cdFx0XHRcdFx0ZG9tLkV2ZW50SGVscGVyLnN0b3AoZSwgdHJ1ZSk7XG5cdFx0XHRcdFx0c3VibWVudVdpZGdldC5mb2N1c05leHQoKTtcblx0XHRcdFx0fSBlbHNlIGlmIChlLmtleSA9PT0gJ0Fycm93VXAnKSB7XG5cdFx0XHRcdFx0ZG9tLkV2ZW50SGVscGVyLnN0b3AoZSwgdHJ1ZSk7XG5cdFx0XHRcdFx0c3VibWVudVdpZGdldC5mb2N1c1ByZXZpb3VzKCk7XG5cdFx0XHRcdH1cblx0XHRcdH0pKTtcblx0XHR9XG5cblx0XHQvLyBQb3NpdGlvbjogcHJlZmVyIHJpZ2h0IHNpZGUsIGZhbGwgYmFjayB0byBsZWZ0IGlmIG5vdCBlbm91Z2ggc3BhY2Vcblx0XHRjb25zdCB2aWV3cG9ydFdpZHRoID0gdGFyZ2V0V2luZG93LmlubmVyV2lkdGg7XG5cdFx0Y29uc3Qgc3BhY2VSaWdodCA9IHZpZXdwb3J0V2lkdGggLSBhbmNob3JSZWN0LnJpZ2h0O1xuXHRcdGNvbnN0IHNwYWNlTGVmdCA9IHBhcmVudFJlY3QubGVmdDtcblx0XHRjb25zdCBwYW5lbFdpZHRoID0gbWF4V2lkdGggKyAxMDsgLy8gYWNjb3VudCBmb3IgYm9yZGVyL3BhZGRpbmdcblxuXHRcdGNvbnN0IGdhcCA9IDQ7XG5cdFx0aWYgKHNwYWNlUmlnaHQgPj0gcGFuZWxXaWR0aCB8fCBzcGFjZVJpZ2h0ID49IHNwYWNlTGVmdCkge1xuXHRcdFx0dGhpcy5fc3VibWVudUNvbnRhaW5lci5zdHlsZS5sZWZ0ID0gYCR7cGFyZW50UmVjdC5yaWdodCAtIHBhcmVudFJlY3QubGVmdCArIGdhcH1weGA7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHRoaXMuX3N1Ym1lbnVDb250YWluZXIuc3R5bGUubGVmdCA9IGAkey1wYW5lbFdpZHRoIC0gZ2FwfXB4YDtcblx0XHR9XG5cdFx0Y29uc3QgaG92ZXJIZWFkZXJIZWlnaHQgPSBob3ZlckhlYWRlciA/IGhvdmVySGVhZGVyLm9mZnNldEhlaWdodCA6IDA7XG5cdFx0Y29uc3QgdG90YWxQYW5lbEhlaWdodCA9IHRvdGFsSGVpZ2h0ICsgaG92ZXJIZWFkZXJIZWlnaHQ7XG5cdFx0Y29uc3Qgdmlld3BvcnRIZWlnaHQgPSB0YXJnZXRXaW5kb3cuaW5uZXJIZWlnaHQ7XG5cdFx0Y29uc3QgYW5jaG9ySGVpZ2h0ID0gYW5jaG9yUmVjdC5oZWlnaHQ7XG5cdFx0bGV0IHRvcCA9IGFuY2hvclJlY3QudG9wIC0gcGFyZW50UmVjdC50b3AgKyAoYW5jaG9ySGVpZ2h0IC0gdG90YWxQYW5lbEhlaWdodCkgLyAyO1xuXHRcdGNvbnN0IHBhbmVsQm90dG9tID0gcGFyZW50UmVjdC50b3AgKyB0b3AgKyB0b3RhbFBhbmVsSGVpZ2h0O1xuXHRcdGlmIChwYW5lbEJvdHRvbSA+IHZpZXdwb3J0SGVpZ2h0KSB7XG5cdFx0XHR0b3AgLT0gKHBhbmVsQm90dG9tIC0gdmlld3BvcnRIZWlnaHQgKyA4KTtcblx0XHR9XG5cdFx0aWYgKHBhcmVudFJlY3QudG9wICsgdG9wIDwgMCkge1xuXHRcdFx0dG9wID0gLXBhcmVudFJlY3QudG9wO1xuXHRcdH1cblx0XHR0aGlzLl9zdWJtZW51Q29udGFpbmVyLnN0eWxlLnRvcCA9IGAke3RvcH1weGA7XG5cdH1cblxuXHRwcml2YXRlIF9oaWRlU3VibWVudSgpOiB2b2lkIHtcblx0XHR0aGlzLl9jYW5jZWxTdWJtZW51SGlkZSgpO1xuXHRcdHRoaXMuX2NhbmNlbFN1Ym1lbnVTaG93KCk7XG5cdFx0dGhpcy5fc3VibWVudURpc3Bvc2FibGVzLmNsZWFyKCk7XG5cdFx0dGhpcy5fY3VycmVudFN1Ym1lbnVXaWRnZXQgPSB1bmRlZmluZWQ7XG5cdFx0dGhpcy5fY3VycmVudFN1Ym1lbnVFbGVtZW50ID0gdW5kZWZpbmVkO1xuXHRcdHRoaXMuX2NsZWFyU3VibWVudUNvbnRhaW5lcigpO1xuXHRcdHRoaXMuX3N1Ym1lbnVDb250YWluZXIuc3R5bGUuZGlzcGxheSA9ICdub25lJztcblx0fVxuXG5cdC8qKlxuXHQgKiBDbGVhcnMgdGhlIHN1Ym1lbnUvaG92ZXIgcGFuZWwuIElmIGZvY3VzIGN1cnJlbnRseSBsaXZlcyBpbnNpZGUgdGhlIHBhbmVsXG5cdCAqIChlLmcuIHRoZSB1c2VyIGNsaWNrZWQgYSBidXR0b24gaW4gdGhlIGhvdmVyIGNvbnRlbnQpLCBmb2N1cyBpcyBmaXJzdCBtb3ZlZFxuXHQgKiBiYWNrIHRvIHRoZSBsaXN0LiBPdGhlcndpc2UgY2xlYXJpbmcgdGhlIHBhbmVsIHdvdWxkIGRyb3AgZm9jdXMgdG8gPGJvZHk+LFxuXHQgKiB3aGljaCBibHVycyB0aGUgYWN0aW9uIHdpZGdldCBhbmQgZGlzbWlzc2VzIGl0LlxuXHQgKi9cblx0cHJpdmF0ZSBfY2xlYXJTdWJtZW51Q29udGFpbmVyKCk6IHZvaWQge1xuXHRcdGlmICh0aGlzLl9zdWJtZW51Q29udGFpbmVyLmNvbnRhaW5zKGRvbS5nZXRBY3RpdmVFbGVtZW50KCkpKSB7XG5cdFx0XHR0aGlzLl9saXN0LmRvbUZvY3VzKCk7XG5cdFx0fVxuXHRcdGRvbS5jbGVhck5vZGUodGhpcy5fc3VibWVudUNvbnRhaW5lcik7XG5cdH1cblxuXHRwcml2YXRlIF9zY2hlZHVsZVN1Ym1lbnVIaWRlKCk6IHZvaWQge1xuXHRcdHRoaXMuX2NhbmNlbFN1Ym1lbnVIaWRlKCk7XG5cdFx0dGhpcy5fc3VibWVudUhpZGVUaW1lb3V0ID0gc2V0VGltZW91dCgoKSA9PiB7XG5cdFx0XHR0aGlzLl9oaWRlU3VibWVudSgpO1xuXHRcdH0sIDMwMCk7XG5cdH1cblxuXHRwcml2YXRlIF9jYW5jZWxTdWJtZW51SGlkZSgpOiB2b2lkIHtcblx0XHRpZiAodGhpcy5fc3VibWVudUhpZGVUaW1lb3V0ICE9PSB1bmRlZmluZWQpIHtcblx0XHRcdGNsZWFyVGltZW91dCh0aGlzLl9zdWJtZW51SGlkZVRpbWVvdXQpO1xuXHRcdFx0dGhpcy5fc3VibWVudUhpZGVUaW1lb3V0ID0gdW5kZWZpbmVkO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgX3NjaGVkdWxlU3VibWVudVNob3coZWxlbWVudDogSUFjdGlvbkxpc3RJdGVtPFQ+LCBpbmRleDogbnVtYmVyIHwgdW5kZWZpbmVkKTogdm9pZCB7XG5cdFx0dGhpcy5fY2FuY2VsU3VibWVudVNob3coKTtcblx0XHR0aGlzLl9zdWJtZW51U2hvd1RpbWVvdXQgPSBzZXRUaW1lb3V0KCgpID0+IHtcblx0XHRcdHRoaXMuX3N1Ym1lbnVTaG93VGltZW91dCA9IHVuZGVmaW5lZDtcblx0XHRcdGNvbnN0IHJvd0VsZW1lbnQgPSB0eXBlb2YgaW5kZXggPT09ICdudW1iZXInID8gdGhpcy5fZ2V0Um93RWxlbWVudChpbmRleCkgOiBudWxsO1xuXHRcdFx0aWYgKHJvd0VsZW1lbnQpIHtcblx0XHRcdFx0dGhpcy5fc2hvd1N1Ym1lbnVGb3JFbGVtZW50KGVsZW1lbnQsIHJvd0VsZW1lbnQpO1xuXHRcdFx0fVxuXHRcdH0sIDUwMCk7XG5cdH1cblxuXHRwcml2YXRlIF9jYW5jZWxTdWJtZW51U2hvdygpOiB2b2lkIHtcblx0XHRpZiAodGhpcy5fc3VibWVudVNob3dUaW1lb3V0ICE9PSB1bmRlZmluZWQpIHtcblx0XHRcdGNsZWFyVGltZW91dCh0aGlzLl9zdWJtZW51U2hvd1RpbWVvdXQpO1xuXHRcdFx0dGhpcy5fc3VibWVudVNob3dUaW1lb3V0ID0gdW5kZWZpbmVkO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgb25MaXN0SG92ZXIoZTogSUxpc3RNb3VzZUV2ZW50PElBY3Rpb25MaXN0SXRlbTxUPj4pIHtcblx0XHRjb25zdCBlbGVtZW50ID0gZS5lbGVtZW50O1xuXG5cdFx0aWYgKGVsZW1lbnQgJiYgZWxlbWVudC5pdGVtICYmIHRoaXMuZm9jdXNDb25kaXRpb24oZWxlbWVudCkpIHtcblx0XHRcdC8vIENoZWNrIGlmIHRoZSBob3ZlciB0YXJnZXQgaXMgaW5zaWRlIGEgdG9vbGJhciAtIGlmIHNvLCBza2lwIHRoZSBzcGxpY2Vcblx0XHRcdC8vIHRvIGF2b2lkIHJlLXJlbmRlcmluZyB3aGljaCB3b3VsZCBkZXN0cm95IHRoZSBlbGVtZW50IG1pZC1ob3Zlci5cblx0XHRcdC8vIEJ1dCBzdGlsbCBtYWludGFpbiBzdWJtZW51IHN0YXRlIGZvciBpdGVtcyB3aXRoIHN1Ym1lbnUgYWN0aW9ucy5cblx0XHRcdGNvbnN0IGlzSG92ZXJpbmdUb29sYmFyID0gZG9tLmlzSFRNTEVsZW1lbnQoZS5icm93c2VyRXZlbnQudGFyZ2V0KSAmJiBlLmJyb3dzZXJFdmVudC50YXJnZXQuY2xvc2VzdCgnLmFjdGlvbi1saXN0LWl0ZW0tdG9vbGJhcicpICE9PSBudWxsO1xuXHRcdFx0aWYgKGlzSG92ZXJpbmdUb29sYmFyKSB7XG5cdFx0XHRcdGlmICghZWxlbWVudC5zdWJtZW51QWN0aW9ucz8ubGVuZ3RoKSB7XG5cdFx0XHRcdFx0dGhpcy5fY2FuY2VsU3VibWVudVNob3coKTtcblx0XHRcdFx0fVxuXHRcdFx0XHR0aGlzLl9saXN0LnNldEZvY3VzKFtdKTtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXG5cdFx0XHQvLyBTZXQgZm9jdXMgaW1tZWRpYXRlbHkgZm9yIHJlc3BvbnNpdmUgaG92ZXIgZmVlZGJhY2tcblx0XHRcdGNvbnN0IGhhc1BhbmVsID0gISEoZWxlbWVudC5zdWJtZW51QWN0aW9ucz8ubGVuZ3RoIHx8IGVsZW1lbnQuaG92ZXI/LmNvbnRlbnQpO1xuXHRcdFx0aWYgKGhhc1BhbmVsKSB7XG5cdFx0XHRcdHRoaXMuX3N1cHByZXNzSG92ZXIgPSB0cnVlO1xuXHRcdFx0fVxuXHRcdFx0dGhpcy5fbGlzdC5zZXRGb2N1cyh0eXBlb2YgZS5pbmRleCA9PT0gJ251bWJlcicgPyBbZS5pbmRleF0gOiBbXSk7XG5cdFx0XHRpZiAoaGFzUGFuZWwpIHtcblx0XHRcdFx0dGhpcy5fc3VwcHJlc3NIb3ZlciA9IGZhbHNlO1xuXHRcdFx0fVxuXG5cdFx0XHQvLyBTaG93IGhvdmVyL3N1Ym1lbnUgcGFuZWwgb24gcm93IGhvdmVyIHdpdGggYSBkZWxheVxuXHRcdFx0aWYgKGhhc1BhbmVsKSB7XG5cdFx0XHRcdGlmICh0aGlzLl9jdXJyZW50U3VibWVudUVsZW1lbnQgPT09IGVsZW1lbnQpIHtcblx0XHRcdFx0XHR0aGlzLl9jYW5jZWxTdWJtZW51SGlkZSgpO1xuXHRcdFx0XHRcdHRoaXMuX2NhbmNlbFN1Ym1lbnVTaG93KCk7XG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0dGhpcy5faGlkZVN1Ym1lbnUoKTtcblx0XHRcdFx0XHR0aGlzLl9zY2hlZHVsZVN1Ym1lbnVTaG93KGVsZW1lbnQsIGUuaW5kZXgpO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblxuXHRcdFx0aWYgKHRoaXMuX2N1cnJlbnRTdWJtZW51RWxlbWVudCA9PT0gZWxlbWVudCkge1xuXHRcdFx0XHR0aGlzLl9jYW5jZWxTdWJtZW51SGlkZSgpO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0dGhpcy5fY2FuY2VsU3VibWVudVNob3coKTtcblx0XHRcdFx0dGhpcy5faGlkZVN1Ym1lbnUoKTtcblx0XHRcdH1cblxuXHRcdFx0aWYgKHRoaXMuX2RlbGVnYXRlLm9uSG92ZXIgJiYgIWVsZW1lbnQuZGlzYWJsZWQgJiYgZWxlbWVudC5raW5kID09PSBBY3Rpb25MaXN0SXRlbUtpbmQuQWN0aW9uICYmIHRoaXMuX2N1cnJlbnRTdWJtZW51RWxlbWVudCAhPT0gZWxlbWVudCkge1xuXHRcdFx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCB0aGlzLl9kZWxlZ2F0ZS5vbkhvdmVyKGVsZW1lbnQuaXRlbSwgdGhpcy5jdHMudG9rZW4pO1xuXHRcdFx0XHRjb25zdCBjYW5QcmV2aWV3ID0gcmVzdWx0ID8gcmVzdWx0LmNhblByZXZpZXcgOiB1bmRlZmluZWQ7XG5cdFx0XHRcdGlmIChjYW5QcmV2aWV3ICE9PSBlbGVtZW50LmNhblByZXZpZXcpIHtcblx0XHRcdFx0XHRlbGVtZW50LmNhblByZXZpZXcgPSBjYW5QcmV2aWV3O1xuXHRcdFx0XHRcdGlmICh0eXBlb2YgZS5pbmRleCA9PT0gJ251bWJlcicpIHtcblx0XHRcdFx0XHRcdHRoaXMuX2xpc3Quc3BsaWNlKGUuaW5kZXgsIDEsIFtlbGVtZW50XSk7XG5cdFx0XHRcdFx0XHR0aGlzLl9saXN0LnNldEZvY3VzKFtlLmluZGV4XSk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fSBlbHNlIGlmIChlbGVtZW50ICYmIGVsZW1lbnQuaG92ZXI/LmNvbnRlbnQgJiYgdHlwZW9mIGUuaW5kZXggPT09ICdudW1iZXInKSB7XG5cdFx0XHQvLyBTaG93IGhvdmVyIGZvciBkaXNhYmxlZCBpdGVtcyB0aGF0IGhhdmUgaG92ZXIgY29udGVudCAod2l0aCBkZWxheSlcblx0XHRcdGlmICh0aGlzLl9jdXJyZW50U3VibWVudUVsZW1lbnQgPT09IGVsZW1lbnQpIHtcblx0XHRcdFx0dGhpcy5fY2FuY2VsU3VibWVudUhpZGUoKTtcblx0XHRcdFx0dGhpcy5fY2FuY2VsU3VibWVudVNob3coKTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdHRoaXMuX2hpZGVTdWJtZW51KCk7XG5cdFx0XHRcdHRoaXMuX3NjaGVkdWxlU3VibWVudVNob3coZWxlbWVudCwgZS5pbmRleCk7XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBvbkxpc3RDbGljayhlOiBJTGlzdE1vdXNlRXZlbnQ8SUFjdGlvbkxpc3RJdGVtPFQ+Pik6IHZvaWQge1xuXHRcdGlmIChlLmVsZW1lbnQgJiYgdGhpcy5mb2N1c0NvbmRpdGlvbihlLmVsZW1lbnQpKSB7XG5cdFx0XHR0aGlzLl9saXN0LnNldEZvY3VzKFtdKTtcblx0XHR9XG5cdH1cbn1cblxuLyoqXG4gKiBBbiBhY3Rpb24gbGlzdCB0aGF0IHdyYXBzIHtAbGluayBBY3Rpb25MaXN0V2lkZ2V0fSB3aXRoIGNvbnRleHQtdmlldyBwb3NpdGlvbmluZ1xuICogYW5kIGFuY2hvci1iYXNlZCBoZWlnaHQgY29tcHV0YXRpb24uXG4gKi9cbmV4cG9ydCBjbGFzcyBBY3Rpb25MaXN0PFQ+IGV4dGVuZHMgRGlzcG9zYWJsZSB7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfd2lkZ2V0OiBBY3Rpb25MaXN0V2lkZ2V0PFQ+O1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX2FuY2hvcjogSFRNTEVsZW1lbnQgfCBTdGFuZGFyZE1vdXNlRXZlbnQgfCBJQW5jaG9yO1xuXHRwcml2YXRlIF9sYXN0TWluV2lkdGggPSAwO1xuXHRwcml2YXRlIF9jYWNoZWRNYXhXaWR0aDogbnVtYmVyIHwgdW5kZWZpbmVkO1xuXHRwcml2YXRlIF9oYXNMYWlkT3V0ID0gZmFsc2U7XG5cdHByaXZhdGUgX3Nob3dBYm92ZTogYm9vbGVhbiB8IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSByZWFkb25seSBfcHJlZmVycmVkQW5jaG9yUG9zaXRpb246IEFuY2hvclBvc2l0aW9uIHwgdW5kZWZpbmVkO1xuXHRwcml2YXRlIHJlYWRvbmx5IF93aWRnZXRDbGFzc05hbWU6IHN0cmluZyB8IHVuZGVmaW5lZDtcblxuXHRnZXQgZG9tTm9kZSgpOiBIVE1MRWxlbWVudCB7XG5cdFx0cmV0dXJuIHRoaXMuX3dpZGdldC5kb21Ob2RlO1xuXHR9XG5cblx0Z2V0IGZpbHRlckNvbnRhaW5lcigpOiBIVE1MRWxlbWVudCB8IHVuZGVmaW5lZCB7XG5cdFx0cmV0dXJuIHRoaXMuX3dpZGdldC5maWx0ZXJDb250YWluZXI7XG5cdH1cblxuXHRnZXQgZm9vdGVyQ29udGFpbmVyKCk6IEhUTUxFbGVtZW50IHwgdW5kZWZpbmVkIHtcblx0XHRyZXR1cm4gdGhpcy5fd2lkZ2V0LmZvb3RlckNvbnRhaW5lcjtcblx0fVxuXG5cdGdldCBoZWFkZXJDb250YWluZXIoKTogSFRNTEVsZW1lbnQgfCB1bmRlZmluZWQge1xuXHRcdHJldHVybiB0aGlzLl93aWRnZXQuaGVhZGVyQ29udGFpbmVyO1xuXHR9XG5cblx0Z2V0IGZpbHRlcklucHV0KCk6IEhUTUxJbnB1dEVsZW1lbnQgfCB1bmRlZmluZWQge1xuXHRcdHJldHVybiB0aGlzLl93aWRnZXQuZmlsdGVySW5wdXQ7XG5cdH1cblxuXHRnZXQgY2xvc2VBbmltYXRpb24oKTogSUFjdGlvbkxpc3RDbG9zZUFuaW1hdGlvbiB8IHVuZGVmaW5lZCB7XG5cdFx0cmV0dXJuIHRoaXMuX3dpZGdldC5jbG9zZUFuaW1hdGlvbjtcblx0fVxuXG5cdGdldCB3aWRnZXRDbGFzc05hbWUoKTogc3RyaW5nIHwgdW5kZWZpbmVkIHtcblx0XHRyZXR1cm4gdGhpcy5fd2lkZ2V0Q2xhc3NOYW1lO1xuXHR9XG5cblx0LyoqXG5cdCAqIFJldHVybnMgdGhlIHJlc29sdmVkIGFuY2hvciBwb3NpdGlvbiBhZnRlciB0aGUgZmlyc3QgbGF5b3V0LlxuXHQgKiBVc2VkIGJ5IHRoZSBjb250ZXh0IHZpZXcgZGVsZWdhdGUgdG8gbG9jayB0aGUgZHJvcGRvd24gZGlyZWN0aW9uLlxuXHQgKi9cblx0Z2V0IGFuY2hvclBvc2l0aW9uKCk6IEFuY2hvclBvc2l0aW9uIHwgdW5kZWZpbmVkIHtcblx0XHRpZiAodGhpcy5fcHJlZmVycmVkQW5jaG9yUG9zaXRpb24gIT09IHVuZGVmaW5lZCkge1xuXHRcdFx0cmV0dXJuIHRoaXMuX3ByZWZlcnJlZEFuY2hvclBvc2l0aW9uO1xuXHRcdH1cblx0XHRpZiAodGhpcy5fc2hvd0Fib3ZlID09PSB1bmRlZmluZWQpIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXHRcdHJldHVybiB0aGlzLl9zaG93QWJvdmUgPyBBbmNob3JQb3NpdGlvbi5BQk9WRSA6IEFuY2hvclBvc2l0aW9uLkJFTE9XO1xuXHR9XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0dXNlcjogc3RyaW5nLFxuXHRcdHByZXZpZXc6IGJvb2xlYW4sXG5cdFx0aXRlbXM6IHJlYWRvbmx5IElBY3Rpb25MaXN0SXRlbTxUPltdLFxuXHRcdF9kZWxlZ2F0ZTogSUFjdGlvbkxpc3REZWxlZ2F0ZTxUPixcblx0XHRhY2Nlc3NpYmlsaXR5UHJvdmlkZXI6IFBhcnRpYWw8SUxpc3RBY2Nlc3NpYmlsaXR5UHJvdmlkZXI8SUFjdGlvbkxpc3RJdGVtPFQ+Pj4gfCB1bmRlZmluZWQsXG5cdFx0b3B0aW9uczogSUFjdGlvbkxpc3RPcHRpb25zIHwgdW5kZWZpbmVkLFxuXHRcdGFuY2hvcjogSFRNTEVsZW1lbnQgfCBTdGFuZGFyZE1vdXNlRXZlbnQgfCBJQW5jaG9yLFxuXHRcdEBJQ29udGV4dFZpZXdTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2NvbnRleHRWaWV3U2VydmljZTogSUNvbnRleHRWaWV3U2VydmljZSxcblx0XHRASUxheW91dFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfbGF5b3V0U2VydmljZTogSUxheW91dFNlcnZpY2UsXG5cdFx0QElJbnN0YW50aWF0aW9uU2VydmljZSBpbnN0YW50aWF0aW9uU2VydmljZTogSUluc3RhbnRpYXRpb25TZXJ2aWNlLFxuXHQpIHtcblx0XHRzdXBlcigpO1xuXHRcdHRoaXMuX2FuY2hvciA9IGFuY2hvcjtcblx0XHR0aGlzLl9wcmVmZXJyZWRBbmNob3JQb3NpdGlvbiA9IG9wdGlvbnM/LmFuY2hvclBvc2l0aW9uO1xuXHRcdHRoaXMuX3dpZGdldENsYXNzTmFtZSA9IG9wdGlvbnM/LndpZGdldENsYXNzTmFtZTtcblxuXHRcdHRoaXMuX3dpZGdldCA9IHRoaXMuX3JlZ2lzdGVyKGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFxuXHRcdFx0QWN0aW9uTGlzdFdpZGdldDxUPixcblx0XHRcdHVzZXIsXG5cdFx0XHRwcmV2aWV3LFxuXHRcdFx0aXRlbXMsXG5cdFx0XHRfZGVsZWdhdGUsXG5cdFx0XHRhY2Nlc3NpYmlsaXR5UHJvdmlkZXIsXG5cdFx0XHRvcHRpb25zLFxuXHRcdCkpO1xuXG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5fd2lkZ2V0Lm9uRGlkUmVxdWVzdExheW91dCgoKSA9PiB7XG5cdFx0XHRpZiAodGhpcy5faGFzTGFpZE91dCkge1xuXHRcdFx0XHR0aGlzLmxheW91dCh0aGlzLl9sYXN0TWluV2lkdGgpO1xuXHRcdFx0XHR0aGlzLl9jb250ZXh0Vmlld1NlcnZpY2UubGF5b3V0KCk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXHR9XG5cblx0Zm9jdXMoKTogdm9pZCB7XG5cdFx0dGhpcy5fd2lkZ2V0LmZvY3VzKCk7XG5cdH1cblxuXHRoaWRlKGRpZENhbmNlbD86IGJvb2xlYW4sIGhpZGVDb250ZXh0VmlldyA9IHRydWUpOiB2b2lkIHtcblx0XHR0aGlzLl93aWRnZXQuaGlkZShkaWRDYW5jZWwpO1xuXHRcdGlmIChoaWRlQ29udGV4dFZpZXcpIHtcblx0XHRcdHRoaXMuX2NvbnRleHRWaWV3U2VydmljZS5oaWRlQ29udGV4dFZpZXcoKTtcblx0XHR9XG5cdH1cblxuXHRjbGVhckZpbHRlcigpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gdGhpcy5fd2lkZ2V0LmNsZWFyRmlsdGVyKCk7XG5cdH1cblxuXHRmb2N1c1ByZXZpb3VzKCk6IHZvaWQge1xuXHRcdHRoaXMuX3dpZGdldC5mb2N1c1ByZXZpb3VzKCk7XG5cdH1cblxuXHRmb2N1c05leHQoKTogdm9pZCB7XG5cdFx0dGhpcy5fd2lkZ2V0LmZvY3VzTmV4dCgpO1xuXHR9XG5cblx0Y29sbGFwc2VGb2N1c2VkU2VjdGlvbigpOiB2b2lkIHtcblx0XHR0aGlzLl93aWRnZXQuY29sbGFwc2VGb2N1c2VkU2VjdGlvbigpO1xuXHR9XG5cblx0ZXhwYW5kRm9jdXNlZFNlY3Rpb24oKTogdm9pZCB7XG5cdFx0dGhpcy5fd2lkZ2V0LmV4cGFuZEZvY3VzZWRTZWN0aW9uKCk7XG5cdH1cblxuXHR0b2dnbGVGb2N1c2VkU2VjdGlvbigpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gdGhpcy5fd2lkZ2V0LnRvZ2dsZUZvY3VzZWRTZWN0aW9uKCk7XG5cdH1cblxuXHRhY2NlcHRTZWxlY3RlZChwcmV2aWV3PzogYm9vbGVhbik6IHZvaWQge1xuXHRcdHRoaXMuX3dpZGdldC5hY2NlcHRTZWxlY3RlZChwcmV2aWV3KTtcblx0fVxuXG5cdHVwZGF0ZUl0ZW1zKGl0ZW1zOiByZWFkb25seSBJQWN0aW9uTGlzdEl0ZW08VD5bXSwgZm9jdXNJdGVtSWQ/OiBzdHJpbmcpOiB2b2lkIHtcblx0XHR0aGlzLl93aWRnZXQudXBkYXRlSXRlbXMoaXRlbXMsIGZvY3VzSXRlbUlkKTtcblx0fVxuXG5cdGZvY3VzSXRlbUJ5SWQoaXRlbUlkOiBzdHJpbmcpOiB2b2lkIHtcblx0XHR0aGlzLl93aWRnZXQuZm9jdXNJdGVtQnlJZChpdGVtSWQpO1xuXHR9XG5cblx0cHJpdmF0ZSBoYXNEeW5hbWljSGVpZ2h0KCk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiB0aGlzLl93aWRnZXQuaGFzRHluYW1pY0hlaWdodDtcblx0fVxuXG5cdHByaXZhdGUgY29tcHV0ZUFjdGlvbldpZGdldFZlcnRpY2FsQ2hyb21lSGVpZ2h0KCk6IG51bWJlciB7XG5cdFx0Y29uc3Qgd2lkZ2V0Q29udGFpbmVyID0gdGhpcy5kb21Ob2RlLnBhcmVudEVsZW1lbnQ/LmNsb3Nlc3QoJy5hY3Rpb24td2lkZ2V0Jyk7XG5cdFx0aWYgKCF3aWRnZXRDb250YWluZXIpIHtcblx0XHRcdHJldHVybiAwO1xuXHRcdH1cblxuXHRcdGNvbnN0IHN0eWxlID0gZG9tLmdldFdpbmRvdyh3aWRnZXRDb250YWluZXIpLmdldENvbXB1dGVkU3R5bGUod2lkZ2V0Q29udGFpbmVyKTtcblx0XHRjb25zdCB0b1BpeGVscyA9ICh2YWx1ZTogc3RyaW5nKTogbnVtYmVyID0+IE51bWJlci5wYXJzZUZsb2F0KHZhbHVlKSB8fCAwO1xuXHRcdHJldHVybiB0b1BpeGVscyhzdHlsZS5wYWRkaW5nVG9wKSArIHRvUGl4ZWxzKHN0eWxlLnBhZGRpbmdCb3R0b20pICsgdG9QaXhlbHMoc3R5bGUuYm9yZGVyVG9wV2lkdGgpICsgdG9QaXhlbHMoc3R5bGUuYm9yZGVyQm90dG9tV2lkdGgpO1xuXHR9XG5cblx0cHJpdmF0ZSBjb21wdXRlSGVpZ2h0KCk6IG51bWJlciB7XG5cdFx0Y29uc3QgbGlzdEhlaWdodCA9IHRoaXMuX3dpZGdldC5jb21wdXRlTGlzdEhlaWdodCgpO1xuXG5cdFx0Y29uc3QgZmlsdGVySGVpZ2h0ID0gdGhpcy5fd2lkZ2V0LmZpbHRlckNvbnRhaW5lciA/IDM2IDogMDtcblx0XHRjb25zdCBmb290ZXJIZWlnaHQgPSB0aGlzLl93aWRnZXQuZm9vdGVyQ29udGFpbmVyID8gMzIgOiAwO1xuXHRcdGNvbnN0IGhlYWRlckhlaWdodCA9IHRoaXMuX3dpZGdldC5oZWFkZXJDb250YWluZXIgPyB0aGlzLl93aWRnZXQuaGVhZGVyQ29udGFpbmVyLm9mZnNldEhlaWdodCB8fCAzNiA6IDA7XG5cdFx0Y29uc3QgY2hyb21lSGVpZ2h0ID0gZmlsdGVySGVpZ2h0ICsgZm9vdGVySGVpZ2h0ICsgaGVhZGVySGVpZ2h0O1xuXHRcdGNvbnN0IHRhcmdldFdpbmRvdyA9IGRvbS5nZXRXaW5kb3codGhpcy5kb21Ob2RlKTtcblx0XHRsZXQgYXZhaWxhYmxlSGVpZ2h0O1xuXG5cdFx0aWYgKHRoaXMuaGFzRHluYW1pY0hlaWdodCgpIHx8IHRoaXMuX3ByZWZlcnJlZEFuY2hvclBvc2l0aW9uICE9PSB1bmRlZmluZWQpIHtcblx0XHRcdGNvbnN0IHZpZXdwb3J0SGVpZ2h0ID0gdGFyZ2V0V2luZG93LmlubmVySGVpZ2h0O1xuXHRcdFx0Y29uc3QgYW5jaG9yUmVjdCA9IGdldEFuY2hvclJlY3QodGhpcy5fYW5jaG9yKTtcblx0XHRcdGNvbnN0IGFuY2hvclRvcEluVmlld3BvcnQgPSBhbmNob3JSZWN0LnRvcCAtIHRhcmdldFdpbmRvdy5wYWdlWU9mZnNldDtcblx0XHRcdGNvbnN0IGJvdHRvbUdhcCA9IDMwO1xuXHRcdFx0Y29uc3Qgc3BhY2VCZWxvdyA9IHZpZXdwb3J0SGVpZ2h0IC0gYW5jaG9yVG9wSW5WaWV3cG9ydCAtIGFuY2hvclJlY3QuaGVpZ2h0IC0gYm90dG9tR2FwO1xuXHRcdFx0Y29uc3Qgc3BhY2VBYm92ZSA9IGFuY2hvclRvcEluVmlld3BvcnQ7XG5cblx0XHRcdC8vIExvY2sgdGhlIGRpcmVjdGlvbiBvbiBmaXJzdCBsYXlvdXQgYmFzZWQgb24gd2hldGhlciB0aGUgZnVsbFxuXHRcdFx0Ly8gdW5jb25zdHJhaW5lZCBsaXN0IGZpdHMgYmVsb3cuIE9uY2UgZGVjaWRlZCwgdGhlIGRyb3Bkb3duIHN0YXlzXG5cdFx0XHQvLyBpbiB0aGUgc2FtZSBwb3NpdGlvbiBldmVuIHdoZW4gdGhlIHZpc2libGUgaXRlbSBjb3VudCBjaGFuZ2VzLlxuXHRcdFx0aWYgKHRoaXMuX3Nob3dBYm92ZSA9PT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRcdHRoaXMuX3Nob3dBYm92ZSA9IHRoaXMuX3ByZWZlcnJlZEFuY2hvclBvc2l0aW9uICE9PSB1bmRlZmluZWRcblx0XHRcdFx0XHQ/IHRoaXMuX3ByZWZlcnJlZEFuY2hvclBvc2l0aW9uID09PSBBbmNob3JQb3NpdGlvbi5BQk9WRVxuXHRcdFx0XHRcdDogKGNocm9tZUhlaWdodCArIHRoaXMuX3dpZGdldC5jb21wdXRlRnVsbEhlaWdodCgpID4gc3BhY2VCZWxvdyAmJiBzcGFjZUFib3ZlID4gc3BhY2VCZWxvdyk7XG5cdFx0XHR9XG5cdFx0XHRhdmFpbGFibGVIZWlnaHQgPSBNYXRoLm1heCgwLCAodGhpcy5fc2hvd0Fib3ZlID8gc3BhY2VBYm92ZSA6IHNwYWNlQmVsb3cpIC0gdGhpcy5jb21wdXRlQWN0aW9uV2lkZ2V0VmVydGljYWxDaHJvbWVIZWlnaHQoKSk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdGNvbnN0IHBhZGRpbmcgPSAxMDtcblx0XHRcdGNvbnN0IHdpbmRvd0hlaWdodCA9IHRoaXMuX2xheW91dFNlcnZpY2UuZ2V0Q29udGFpbmVyKHRhcmdldFdpbmRvdykuY2xpZW50SGVpZ2h0O1xuXHRcdFx0Y29uc3Qgd2lkZ2V0VG9wID0gdGhpcy5kb21Ob2RlLmdldEJvdW5kaW5nQ2xpZW50UmVjdCgpLnRvcDtcblx0XHRcdGF2YWlsYWJsZUhlaWdodCA9IHdpZGdldFRvcCA+IDAgPyB3aW5kb3dIZWlnaHQgLSB3aWRnZXRUb3AgLSBwYWRkaW5nIDogd2luZG93SGVpZ2h0ICogMC43O1xuXHRcdH1cblxuXHRcdGNvbnN0IHZpZXdwb3J0TWF4SGVpZ2h0ID0gTWF0aC5mbG9vcih0YXJnZXRXaW5kb3cuaW5uZXJIZWlnaHQgKiAwLjYpO1xuXHRcdGNvbnN0IGFjdGlvbkxpbmVIZWlnaHQgPSB0aGlzLl93aWRnZXQubGluZUhlaWdodDtcblx0XHRpZiAodGhpcy5fcHJlZmVycmVkQW5jaG9yUG9zaXRpb24gIT09IHVuZGVmaW5lZCkge1xuXHRcdFx0Y29uc3QgbWF4SGVpZ2h0ID0gTWF0aC5taW4oYXZhaWxhYmxlSGVpZ2h0LCB2aWV3cG9ydE1heEhlaWdodCk7XG5cdFx0XHRjb25zdCBoZWlnaHQgPSBNYXRoLm1pbihsaXN0SGVpZ2h0ICsgY2hyb21lSGVpZ2h0LCBNYXRoLm1heCgwLCBtYXhIZWlnaHQpKTtcblx0XHRcdHJldHVybiBNYXRoLm1heCgwLCBoZWlnaHQgLSBjaHJvbWVIZWlnaHQpO1xuXHRcdH1cblx0XHRjb25zdCBtYXhIZWlnaHQgPSBNYXRoLm1pbihNYXRoLm1heChhdmFpbGFibGVIZWlnaHQsIGFjdGlvbkxpbmVIZWlnaHQgKiAzICsgY2hyb21lSGVpZ2h0KSwgdmlld3BvcnRNYXhIZWlnaHQpO1xuXHRcdGNvbnN0IGhlaWdodCA9IE1hdGgubWluKGxpc3RIZWlnaHQgKyBjaHJvbWVIZWlnaHQsIG1heEhlaWdodCk7XG5cdFx0cmV0dXJuIGhlaWdodCAtIGNocm9tZUhlaWdodDtcblx0fVxuXG5cdGxheW91dChtaW5XaWR0aDogbnVtYmVyKTogbnVtYmVyIHtcblx0XHR0aGlzLl9oYXNMYWlkT3V0ID0gdHJ1ZTtcblx0XHR0aGlzLl9sYXN0TWluV2lkdGggPSBtaW5XaWR0aDtcblxuXHRcdGNvbnN0IGxpc3RIZWlnaHQgPSB0aGlzLmNvbXB1dGVIZWlnaHQoKTtcblx0XHR0aGlzLl93aWRnZXQubGF5b3V0KGxpc3RIZWlnaHQpO1xuXG5cdFx0Y29uc3QgY29tcHV0ZWRXaWR0aCA9IHRoaXMuX3dpZGdldC5jb21wdXRlTWF4V2lkdGgobWluV2lkdGgpO1xuXHRcdHRoaXMuX2NhY2hlZE1heFdpZHRoID0gY29tcHV0ZWRXaWR0aDtcblx0XHR0aGlzLl93aWRnZXQubGF5b3V0KGxpc3RIZWlnaHQsIHRoaXMuX2NhY2hlZE1heFdpZHRoKTtcblxuXHRcdHJldHVybiB0aGlzLl9jYWNoZWRNYXhXaWR0aDtcblx0fVxufVxuXG5mdW5jdGlvbiBzdHJpcE5ld2xpbmVzKHN0cjogc3RyaW5nKTogc3RyaW5nIHtcblx0cmV0dXJuIHN0ci5yZXBsYWNlKC9cXHJcXG58XFxyfFxcbi9nLCAnICcpO1xufVxuIl0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7Ozs7QUFJQSxZQUFZLFNBQVM7QUFFckIsU0FBUyxzQkFBc0I7QUFDL0IsU0FBUyxpQkFBaUI7QUFDMUIsU0FBUyxxQkFBOEI7QUFDdkMsU0FBUyx1QkFBdUI7QUFDaEMsU0FBUyxjQUFjO0FBRXZCLFNBQXFDLFlBQVk7QUFDakQsU0FBa0IsZUFBZSxnQkFBZ0I7QUFDakQsU0FBNEIsK0JBQStCO0FBQzNELFNBQVMsZUFBZTtBQUN4QixTQUFTLGVBQWU7QUFDeEIsU0FBMEIsa0JBQWtCLHNCQUFzQjtBQUVsRSxTQUFTLHNCQUFzQjtBQUMvQixTQUFTLFlBQVksaUJBQThCLG1CQUFtQixvQkFBb0I7QUFDMUYsU0FBUyxVQUFVO0FBQ25CLFNBQVMsaUJBQWlCO0FBQzFCLFNBQVMsV0FBVztBQUNwQixPQUFPO0FBQ1AsU0FBUyxnQkFBZ0I7QUFDekIsU0FBUywyQkFBMkI7QUFDcEMsU0FBUywwQkFBMEI7QUFDbkMsU0FBUyxzQkFBc0I7QUFDL0IsU0FBUyxZQUFZO0FBQ3JCLFNBQVMseUJBQXlCO0FBQ2xDLFNBQVMscUJBQXFCO0FBQzlCLFNBQVMsc0JBQXNCO0FBQy9CLFNBQVMsNkJBQTZCO0FBRS9CLE1BQU0sOEJBQThCO0FBQ3BDLE1BQU0sK0JBQStCO0FBNkhyQyxJQUFXLHFCQUFYLGtCQUFXQSx3QkFBWDtBQUNOLEVBQUFBLG9CQUFBLFlBQVM7QUFDVCxFQUFBQSxvQkFBQSxZQUFTO0FBQ1QsRUFBQUEsb0JBQUEsZUFBWTtBQUhLLFNBQUFBO0FBQUEsR0FBQTtBQVdsQixNQUFNLGVBQW9GO0FBQUEsRUFFekYsSUFBSSxhQUFxQjtBQUFFLFdBQU87QUFBQSxFQUEyQjtBQUFBLEVBRTdELGVBQWUsV0FBNkM7QUFDM0QsY0FBVSxVQUFVLElBQUksY0FBYztBQUV0QyxVQUFNLE9BQU8sU0FBUyxjQUFjLE1BQU07QUFDMUMsY0FBVSxPQUFPLElBQUk7QUFFckIsV0FBTyxFQUFFLFdBQVcsS0FBSztBQUFBLEVBQzFCO0FBQUEsRUFFQSxjQUFjLFNBQTZCLFFBQWdCLGNBQXlDO0FBQ25HLGlCQUFhLEtBQUssY0FBYyxRQUFRLE9BQU8sU0FBUyxRQUFRLFNBQVM7QUFBQSxFQUMxRTtBQUFBLEVBRUEsZ0JBQWdCLGVBQTBDO0FBQUEsRUFFMUQ7QUFDRDtBQU9BLE1BQU0sa0JBQTBGO0FBQUEsRUFFL0YsSUFBSSxhQUFxQjtBQUFFLFdBQU87QUFBQSxFQUE4QjtBQUFBLEVBRWhFLGVBQWUsV0FBZ0Q7QUFDOUQsY0FBVSxVQUFVLElBQUksV0FBVztBQUVuQyxVQUFNLE9BQU8sU0FBUyxjQUFjLE1BQU07QUFDMUMsY0FBVSxPQUFPLElBQUk7QUFFckIsV0FBTyxFQUFFLFdBQVcsS0FBSztBQUFBLEVBQzFCO0FBQUEsRUFFQSxjQUFjLFNBQTZCLFFBQWdCLGNBQTRDO0FBQ3RHLGlCQUFhLEtBQUssY0FBYyxRQUFRLFNBQVM7QUFBQSxFQUNsRDtBQUFBLEVBRUEsZ0JBQWdCLGVBQTZDO0FBQUEsRUFFN0Q7QUFDRDtBQUVBLElBQU0scUJBQU4sTUFBa0c7QUFBQSxFQUlqRyxZQUNrQixrQkFDQSxlQUNBLGdCQUNBLHVCQUNBLG9CQUNBLGNBQ0EsK0JBQ29CLG9CQUNKLGdCQUNoQztBQVRnQjtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNvQjtBQUNKO0FBQUEsRUFDOUI7QUFBQSxFQVpKLElBQUksYUFBcUI7QUFBRSxXQUFPO0FBQUEsRUFBMkI7QUFBQSxFQWM3RCxlQUFlLFdBQWlEO0FBQy9ELGNBQVUsVUFBVSxJQUFJLEtBQUssVUFBVTtBQUV2QyxVQUFNLE9BQU8sU0FBUyxjQUFjLEtBQUs7QUFDekMsU0FBSyxZQUFZO0FBQ2pCLGNBQVUsT0FBTyxJQUFJO0FBRXJCLFVBQU0sT0FBTyxTQUFTLGNBQWMsTUFBTTtBQUMxQyxTQUFLLFlBQVk7QUFDakIsY0FBVSxPQUFPLElBQUk7QUFFckIsVUFBTSxRQUFRLFNBQVMsY0FBYyxNQUFNO0FBQzNDLFVBQU0sWUFBWTtBQUNsQixjQUFVLE9BQU8sS0FBSztBQUV0QixVQUFNLGNBQWMsU0FBUyxjQUFjLE1BQU07QUFDakQsZ0JBQVksWUFBWTtBQUN4QixjQUFVLE9BQU8sV0FBVztBQUU1QixVQUFNLGFBQWEsU0FBUyxjQUFjLE1BQU07QUFDaEQsZUFBVyxZQUFZO0FBQ3ZCLGNBQVUsT0FBTyxVQUFVO0FBRTNCLFVBQU0sU0FBUyxTQUFTLGNBQWMsTUFBTTtBQUM1QyxXQUFPLFlBQVk7QUFDbkIsY0FBVSxPQUFPLE1BQU07QUFFdkIsVUFBTSxhQUFhLElBQUksZ0JBQWdCLFdBQVcsRUFBRTtBQUVwRCxVQUFNLFVBQVUsU0FBUyxjQUFjLEtBQUs7QUFDNUMsWUFBUSxZQUFZO0FBQ3BCLGNBQVUsT0FBTyxPQUFPO0FBRXhCLFVBQU0sbUJBQW1CLFNBQVMsY0FBYyxLQUFLO0FBQ3JELHFCQUFpQixZQUFZO0FBQzdCLGNBQVUsT0FBTyxnQkFBZ0I7QUFFakMsVUFBTSx3QkFBd0IsU0FBUyxjQUFjLEtBQUs7QUFDMUQsMEJBQXNCLFlBQVk7QUFDbEMsY0FBVSxPQUFPLHFCQUFxQjtBQUV0QyxVQUFNLHFCQUFxQixJQUFJLGdCQUFnQjtBQUUvQyxXQUFPLEVBQUUsV0FBVyxNQUFNLE1BQU0sUUFBUSxPQUFPLGFBQWEsWUFBWSxZQUFZLFNBQVMsa0JBQWtCLHVCQUF1QixtQkFBbUI7QUFBQSxFQUMxSjtBQUFBLEVBRUEsY0FBYyxTQUE2QixRQUFnQixNQUFxQztBQUUvRixTQUFLLG1CQUFtQixNQUFNO0FBRTlCLFFBQUksUUFBUSxPQUFPLE1BQU07QUFDeEIsV0FBSyxLQUFLLFlBQVksVUFBVSxZQUFZLFFBQVEsTUFBTSxJQUFJO0FBQzlELFVBQUksUUFBUSxNQUFNLEtBQUssT0FBTztBQUM3QixhQUFLLEtBQUssTUFBTSxRQUFRLGNBQWMsUUFBUSxNQUFNLEtBQUssTUFBTSxFQUFFO0FBQUEsTUFDbEU7QUFBQSxJQUNELE9BQU87QUFDTixXQUFLLEtBQUssWUFBWSxVQUFVLFlBQVksUUFBUSxTQUFTO0FBQzdELFdBQUssS0FBSyxNQUFNLFFBQVE7QUFBQSxJQUN6QjtBQUVBLFFBQUksQ0FBQyxRQUFRLFFBQVEsQ0FBQyxRQUFRLE9BQU87QUFDcEM7QUFBQSxJQUNEO0FBRUEsUUFBSSxjQUFjLENBQUMsUUFBUSxVQUFVLEtBQUssSUFBSTtBQUc5QyxRQUFJLFFBQVEsaUJBQWlCO0FBQzVCLFlBQU0sV0FBVyxRQUFRLE9BQU8sU0FBUyxRQUFRO0FBQ2pELFdBQUssVUFBVSxhQUFhLGlCQUFpQixPQUFPLFFBQVEsQ0FBQztBQUFBLElBQzlELE9BQU87QUFDTixXQUFLLFVBQVUsZ0JBQWdCLGVBQWU7QUFBQSxJQUMvQztBQUlBLFFBQUksS0FBSyxtQkFBbUI7QUFDM0IsV0FBSyxVQUFVLFVBQVUsT0FBTyxLQUFLLGlCQUFpQjtBQUFBLElBQ3ZEO0FBQ0EsU0FBSyxVQUFVLFVBQVUsT0FBTyxzQkFBc0IsQ0FBQyxDQUFDLFFBQVEsU0FBUztBQUN6RSxRQUFJLFFBQVEsV0FBVztBQUN0QixXQUFLLFVBQVUsVUFBVSxJQUFJLFFBQVEsU0FBUztBQUFBLElBQy9DO0FBQ0EsU0FBSyxvQkFBb0IsUUFBUTtBQUVqQyxTQUFLLEtBQUssY0FBYyxjQUFjLFFBQVEsS0FBSztBQUduRCxRQUFJLFFBQVEsT0FBTztBQUNsQixXQUFLLE1BQU0sY0FBYyxRQUFRO0FBQ2pDLFdBQUssTUFBTSxNQUFNLFVBQVU7QUFBQSxJQUM1QixPQUFPO0FBQ04sV0FBSyxNQUFNLGNBQWM7QUFDekIsV0FBSyxNQUFNLE1BQU0sVUFBVTtBQUFBLElBQzVCO0FBRUEsUUFBSSxRQUFRLFlBQVk7QUFDdkIsV0FBSyxZQUFhLGNBQWMsUUFBUSxXQUFXLFNBQVM7QUFDNUQsV0FBSyxZQUFhLE1BQU0sVUFBVTtBQUNsQyxXQUFLLFlBQWEsTUFBTSxnQkFBZ0I7QUFBQSxJQUN6QyxXQUFXLFFBQVEsYUFBYTtBQUMvQixVQUFJLFVBQVUsS0FBSyxXQUFZO0FBQy9CLFVBQUksT0FBTyxRQUFRLGdCQUFnQixVQUFVO0FBQzVDLGFBQUssWUFBYSxjQUFjLGNBQWMsUUFBUSxXQUFXO0FBQUEsTUFDbEUsT0FBTztBQUNOLGNBQU0sV0FBVyxlQUFlLFFBQVEsYUFBYTtBQUFBLFVBQ3BELGVBQWUsQ0FBQyxZQUFvQjtBQUNuQyxrQkFBTSxNQUFNLElBQUksTUFBTSxPQUFPO0FBQzdCLGdCQUFJLEtBQUssY0FBYztBQUN0QixtQkFBSyxhQUFhLEtBQUssT0FBTztBQUFBLFlBQy9CLE9BQU87QUFDTixtQkFBSyxLQUFLLGVBQWUsS0FBSyxLQUFLLEVBQUUsZUFBZSxLQUFLLENBQUM7QUFBQSxZQUMzRDtBQUFBLFVBQ0Q7QUFBQSxRQUNELENBQUM7QUFDRCxhQUFLLG1CQUFtQixJQUFJLFFBQVE7QUFDcEMsYUFBSyxZQUFhLFlBQVksU0FBUyxPQUFPO0FBQUEsTUFDL0M7QUFDQSxXQUFLLFlBQWEsTUFBTSxVQUFVO0FBQUEsSUFDbkMsT0FBTztBQUNOLFdBQUssWUFBYSxjQUFjO0FBQ2hDLFdBQUssWUFBYSxNQUFNLFVBQVU7QUFBQSxJQUNuQztBQUdBLFVBQU0saUJBQWlCLEtBQUssbUJBQW1CLElBQUksTUFBTTtBQUN6RCxRQUFJLGdCQUFnQjtBQUNuQixXQUFLLFdBQVcsY0FBYztBQUM5QixXQUFLLFdBQVcsTUFBTSxVQUFVO0FBQUEsSUFDakMsT0FBTztBQUNOLFdBQUssV0FBVyxjQUFjO0FBQzlCLFdBQUssV0FBVyxNQUFNLFVBQVU7QUFBQSxJQUNqQztBQUdBLFFBQUksUUFBUSxRQUFRO0FBQ25CLFdBQUssT0FBTyxjQUFjLGNBQWMsUUFBUSxNQUFNO0FBQ3RELFdBQUssT0FBTyxNQUFNLFVBQVU7QUFBQSxJQUM3QixPQUFPO0FBQ04sV0FBSyxPQUFPLGNBQWM7QUFDMUIsV0FBSyxPQUFPLE1BQU0sVUFBVTtBQUFBLElBQzdCO0FBR0EsUUFBSSxVQUFVLEtBQUsscUJBQXFCO0FBQ3hDLFFBQUksUUFBUSxjQUFjO0FBQ3pCLFlBQU0sZUFBZSxRQUFRO0FBQzdCLFlBQU0sY0FBYyxTQUFTLGNBQWMsTUFBTTtBQUNqRCxrQkFBWSxZQUFZO0FBQ3hCLGtCQUFZLGNBQWMsY0FBYyxhQUFhLEtBQUs7QUFDMUQsV0FBSyxzQkFBc0IsT0FBTyxXQUFXO0FBQzdDLFdBQUssc0JBQXNCLE1BQU0sVUFBVTtBQUMzQyxXQUFLLFVBQVUsVUFBVSxJQUFJLG1CQUFtQjtBQUNoRCxZQUFNLFNBQVMsS0FBSyxtQkFBbUIsSUFBSSxJQUFJLE9BQU87QUFBQSxRQUNyRCxPQUFPLGFBQWEsU0FBUyxhQUFhO0FBQUEsUUFDMUMsV0FBVyxhQUFhO0FBQUEsUUFDeEIsaUJBQWlCO0FBQUEsUUFDakIsY0FBYztBQUFBLFFBQ2QseUJBQXlCO0FBQUEsUUFDekIsNkJBQTZCO0FBQUEsUUFDN0IsNkJBQTZCO0FBQUEsTUFDOUIsQ0FBQyxDQUFDO0FBQ0YsV0FBSyxzQkFBc0IsT0FBTyxPQUFPLE9BQU87QUFDaEQsV0FBSyxtQkFBbUIsSUFBSSxPQUFPLFNBQVMsTUFBTSxhQUFhLFNBQVMsT0FBTyxPQUFPLENBQUMsQ0FBQztBQUV4RixXQUFLLG1CQUFtQixJQUFJLElBQUksc0JBQXNCLEtBQUssdUJBQXVCLElBQUksVUFBVSxPQUFPLE9BQUssRUFBRSxnQkFBZ0IsQ0FBQyxDQUFDO0FBQUEsSUFDakksT0FBTztBQUNOLFdBQUssc0JBQXNCLE1BQU0sVUFBVTtBQUMzQyxXQUFLLFVBQVUsVUFBVSxPQUFPLG1CQUFtQjtBQUFBLElBQ3BEO0FBRUEsVUFBTSxjQUFjLEtBQUssbUJBQW1CLGlCQUFpQiwyQkFBMkIsR0FBRyxTQUFTO0FBQ3BHLFVBQU0sZUFBZSxLQUFLLG1CQUFtQixpQkFBaUIsNEJBQTRCLEdBQUcsU0FBUztBQUN0RyxTQUFLLFVBQVUsVUFBVSxPQUFPLG1CQUFtQixDQUFDLENBQUMsUUFBUSxRQUFRO0FBQ3JFLFFBQUksUUFBUSxVQUFVLFFBQVc7QUFFaEMsV0FBSyxVQUFVLFFBQVE7QUFBQSxJQUN4QixXQUFXLFFBQVEsU0FBUztBQUMzQixXQUFLLFVBQVUsUUFBUSxRQUFRO0FBQUEsSUFDaEMsV0FBVyxRQUFRLFVBQVU7QUFDNUIsV0FBSyxVQUFVLFFBQVEsUUFBUTtBQUFBLElBQ2hDLFdBQVcsS0FBSywrQkFBK0I7QUFDOUMsV0FBSyxVQUFVLFFBQVE7QUFBQSxJQUN4QixXQUFXLGVBQWUsY0FBYztBQUN2QyxVQUFJLEtBQUssb0JBQW9CLFFBQVEsWUFBWTtBQUNoRCxhQUFLLFVBQVUsUUFBUSxTQUFTLEVBQUUsS0FBSyxpQkFBaUIsU0FBUyxDQUFDLHNFQUFzRSxFQUFFLEdBQUcsZ0NBQWdDLGFBQWEsWUFBWTtBQUFBLE1BQ3ZNLE9BQU87QUFDTixhQUFLLFVBQVUsUUFBUSxTQUFTLEVBQUUsS0FBSyxTQUFTLFNBQVMsQ0FBQyxnREFBZ0QsRUFBRSxHQUFHLGdCQUFnQixXQUFXO0FBQUEsTUFDM0k7QUFBQSxJQUNELE9BQU87QUFDTixXQUFLLFVBQVUsUUFBUTtBQUFBLElBQ3hCO0FBR0EsUUFBSSxVQUFVLEtBQUssT0FBTztBQUMxQixVQUFNLGlCQUFpQixDQUFDLEdBQUksUUFBUSxrQkFBa0IsQ0FBQyxDQUFFO0FBQ3pELFFBQUksUUFBUSxVQUFVO0FBQ3JCLHFCQUFlLEtBQUssU0FBUztBQUFBLFFBQzVCLElBQUk7QUFBQSxRQUNKLE9BQU8sU0FBUyxxQkFBcUIsUUFBUTtBQUFBLFFBQzdDLE9BQU8sVUFBVSxZQUFZLFFBQVEsS0FBSztBQUFBLFFBQzFDLEtBQUssWUFBWTtBQUNoQixnQkFBTSxRQUFRLFNBQVU7QUFDeEIsZUFBSyxnQkFBZ0IsT0FBTztBQUFBLFFBQzdCO0FBQUEsTUFDRCxDQUFDLENBQUM7QUFBQSxJQUNIO0FBQ0EsU0FBSyxVQUFVLFVBQVUsT0FBTyxlQUFlLGVBQWUsU0FBUyxDQUFDO0FBQ3hFLFFBQUksZUFBZSxTQUFTLEdBQUc7QUFDOUIsWUFBTSxZQUFZLElBQUksVUFBVSxLQUFLLE9BQU87QUFDNUMsV0FBSyxtQkFBbUIsSUFBSSxTQUFTO0FBQ3JDLGdCQUFVLEtBQUssZ0JBQWdCLEVBQUUsTUFBTSxNQUFNLE9BQU8sTUFBTSxDQUFDO0FBQUEsSUFDNUQ7QUFJQSxRQUFJLFFBQVEsZ0JBQWdCLFVBQVUsQ0FBQyxRQUFRLE9BQU8sU0FBUztBQUM5RCxXQUFLLGlCQUFpQixZQUFZLCtDQUErQyxVQUFVLFlBQVksUUFBUSxZQUFZO0FBQzNILFdBQUssaUJBQWlCLE1BQU0sVUFBVTtBQUN0QyxXQUFLLGlCQUFpQixNQUFNLGFBQWE7QUFDekMsV0FBSyxtQkFBbUIsSUFBSSxJQUFJLHNCQUFzQixLQUFLLGtCQUFrQixJQUFJLFVBQVUsT0FBTyxDQUFDLE1BQU07QUFDeEcsVUFBRSxnQkFBZ0I7QUFDbEIsYUFBSyxpQkFBaUIsT0FBTztBQUFBLE1BQzlCLENBQUMsQ0FBQztBQUFBLElBQ0gsV0FBVyxLQUFLLHVCQUF1QjtBQUV0QyxXQUFLLGlCQUFpQixZQUFZO0FBQ2xDLFdBQUssaUJBQWlCLE1BQU0sVUFBVTtBQUN0QyxXQUFLLGlCQUFpQixNQUFNLGFBQWE7QUFBQSxJQUMxQyxPQUFPO0FBQ04sV0FBSyxpQkFBaUIsWUFBWTtBQUNsQyxXQUFLLGlCQUFpQixNQUFNLFVBQVU7QUFBQSxJQUN2QztBQUFBLEVBQ0Q7QUFBQSxFQUVBLGdCQUFnQixjQUE2QztBQUM1RCxpQkFBYSxXQUFXLFFBQVE7QUFDaEMsaUJBQWEsbUJBQW1CLFFBQVE7QUFBQSxFQUN6QztBQUNEO0FBL1BNLHFCQUFOO0FBQUEsRUFZRztBQUFBLEVBQ0E7QUFBQSxHQWJHO0FBaVFOLE1BQU0sNEJBQTRCLFFBQVE7QUFBQSxFQUN6QyxjQUFjO0FBQUUsVUFBTSxzQkFBc0I7QUFBQSxFQUFHO0FBQ2hEO0FBRUEsTUFBTSw2QkFBNkIsUUFBUTtBQUFBLEVBQzFDLGNBQWM7QUFBRSxVQUFNLHVCQUF1QjtBQUFBLEVBQUc7QUFDakQ7QUFFQSxTQUFTLDJCQUE4QixNQUE4QztBQUVwRixNQUFJLEtBQUssU0FBUyxVQUFVO0FBQzNCLFdBQU8sS0FBSztBQUFBLEVBQ2I7QUFDQSxTQUFPO0FBQ1I7QUFtS08sSUFBTSxtQkFBTixjQUFrQyxXQUFXO0FBQUEsRUEwQ25ELFlBQ0MsTUFDbUIsa0JBQ25CLE9BQ21CLFdBQ25CLHVCQUNtQixVQUNrQixvQkFDSixnQkFDTyx1QkFDdkM7QUFDRCxVQUFNO0FBVGE7QUFFQTtBQUVBO0FBQ2tCO0FBQ0o7QUFDTztBQTNDekMsU0FBbUIsb0JBQW9CO0FBQ3ZDLFNBQW1CLHVCQUF1QjtBQUkxQyxTQUFpQixNQUFNLEtBQUssVUFBVSxJQUFJLHdCQUF3QixDQUFDO0FBRW5FLFNBQWlCLHNCQUFzQixLQUFLLFVBQVUsSUFBSSxnQkFBZ0IsQ0FBQztBQU8zRSxTQUFpQixxQkFBcUIsb0JBQUksSUFBWTtBQUN0RCxTQUFRLGNBQWM7QUFDdEIsU0FBUSx3QkFBd0I7QUFDaEMsU0FBUSxpQkFBaUI7QUFDekIsU0FBUSxjQUFjO0FBS3RCLFNBQWlCLGFBQWEsS0FBSyxVQUFVLElBQUksa0JBQTJDLENBQUM7QUFDN0YsU0FBaUIscUJBQXFCLG9CQUFJLElBQW9CO0FBRTlELFNBQWlCLHNCQUFzQixLQUFLLFVBQVUsSUFBSSxRQUFjLENBQUM7QUFNekU7QUFBQTtBQUFBO0FBQUE7QUFBQSxTQUFTLHFCQUFxQixLQUFLLG9CQUFvQjtBQWN0RCxTQUFLLHNCQUFzQixLQUFLLFVBQVU7QUFDMUMsU0FBSyxVQUFVLFNBQVMsY0FBYyxLQUFLO0FBQzNDLFNBQUssUUFBUSxVQUFVLElBQUksWUFBWTtBQUN2QyxRQUFJLEtBQUssVUFBVSxtQkFBbUI7QUFDckMsV0FBSyxRQUFRLFVBQVUsSUFBSSxvQkFBb0I7QUFBQSxJQUNoRDtBQUNBLFFBQUksS0FBSyxVQUFVLFdBQVc7QUFDN0IsWUFBTSxhQUFhLEtBQUssU0FBUyxVQUFVLE1BQU0sS0FBSyxFQUFFLE9BQU8sZUFBYSxVQUFVLFNBQVMsQ0FBQztBQUNoRyxVQUFJLFdBQVcsU0FBUyxHQUFHO0FBQzFCLGFBQUssUUFBUSxVQUFVLElBQUksR0FBRyxVQUFVO0FBQUEsTUFDekM7QUFBQSxJQUNEO0FBQ0EsU0FBSyxvQkFBb0I7QUFHekIsU0FBSyxvQkFBb0IsU0FBUyxjQUFjLEtBQUs7QUFDckQsU0FBSyxrQkFBa0IsWUFBWTtBQUNuQyxTQUFLLGtCQUFrQixNQUFNLFVBQVU7QUFJdkMsU0FBSyxrQkFBa0IsV0FBVztBQUNsQyxTQUFLLFFBQVEsT0FBTyxLQUFLLGlCQUFpQjtBQUUxQyxTQUFLLFVBQVUsSUFBSSxzQkFBc0IsS0FBSyxtQkFBbUIsY0FBYyxNQUFNO0FBQ3BGLFdBQUssbUJBQW1CO0FBQUEsSUFDekIsQ0FBQyxDQUFDO0FBQ0YsU0FBSyxVQUFVLElBQUksc0JBQXNCLEtBQUssbUJBQW1CLGNBQWMsTUFBTTtBQUNwRixXQUFLLHFCQUFxQjtBQUFBLElBQzNCLENBQUMsQ0FBQztBQUVGLFNBQUssVUFBVSxJQUFJLHNCQUFzQixLQUFLLFNBQVMsSUFBSSxVQUFVLGFBQWEsTUFBTTtBQUN2RixXQUFLLG1CQUFtQjtBQUFBLElBQ3pCLENBQUMsQ0FBQztBQUNGLFNBQUssVUFBVSxhQUFhLE1BQU07QUFDakMsV0FBSyxtQkFBbUI7QUFDeEIsV0FBSyxtQkFBbUI7QUFBQSxJQUN6QixDQUFDLENBQUM7QUFHRixRQUFJLEtBQUssVUFBVSxvQkFBb0I7QUFDdEMsaUJBQVcsV0FBVyxLQUFLLFNBQVMsb0JBQW9CO0FBQ3ZELGFBQUssbUJBQW1CLElBQUksT0FBTztBQUFBLE1BQ3BDO0FBQUEsSUFDRDtBQUVBLFVBQU0sa0JBQTREO0FBQUEsTUFDakUsV0FBVyxhQUFXO0FBQ3JCLGVBQU8sS0FBSyxlQUFlLE9BQU87QUFBQSxNQUNuQztBQUFBLE1BQ0EsZUFBZSxhQUFXLFFBQVE7QUFBQSxJQUNuQztBQUdBLFVBQU0sc0JBQXNCLEtBQUssVUFBVSx1QkFBdUI7QUFDbEUsVUFBTSx1QkFBdUIsdUJBQXVCLE1BQU0sS0FBSyxVQUFRLENBQUMsQ0FBQyxLQUFLLGdCQUFnQixVQUFVLENBQUMsS0FBSyxPQUFPLE9BQU87QUFFNUgsU0FBSyxRQUFRLEtBQUssVUFBVSxJQUFJLEtBQUssTUFBTSxLQUFLLFNBQVMsaUJBQWlCO0FBQUEsTUFDekUsSUFBSSxtQkFBc0IsS0FBSyxrQkFBa0IsQ0FBQyxTQUFTLEtBQUssWUFBWSxJQUFJLEdBQUcsQ0FBQyxTQUFTLEtBQUssb0JBQW9CLElBQUksR0FBRyxzQkFBc0IsS0FBSyxvQkFBb0IsS0FBSyxVQUFVLGFBQWEsS0FBSyxVQUFVLGdDQUFnQyxPQUFPLEtBQUssb0JBQW9CLEtBQUssY0FBYztBQUFBLE1BQzFTLElBQUksZUFBZTtBQUFBLE1BQ25CLElBQUksa0JBQWtCO0FBQUEsSUFDdkIsR0FBRztBQUFBLE1BQ0YsaUJBQWlCO0FBQUEsTUFDakIsdUJBQXVCLENBQUMsS0FBSyxVQUFVO0FBQUEsTUFDdkMsaUNBQWlDLEVBQUUsMkJBQTJCO0FBQUEsTUFDOUQsdUJBQXVCO0FBQUEsUUFDdEIsY0FBYyxhQUFXO0FBQ3hCLGNBQUksUUFBUSxTQUFTLHVCQUEyQjtBQUMvQyxnQkFBSSxRQUFRLFFBQVEsUUFBUSxjQUFjLFNBQVMsS0FBSyxJQUFJO0FBQzVELGdCQUFJLFFBQVEsUUFBUTtBQUNuQixzQkFBUSxRQUFRLE9BQU8sY0FBYyxRQUFRLE1BQU07QUFBQSxZQUNwRDtBQUNBLGdCQUFJLFFBQVEsaUJBQWlCO0FBQzVCLHNCQUFRLFFBQVEsT0FBTyxjQUFjLFFBQVEsZUFBZTtBQUFBLFlBQzdELFdBQVcsUUFBUSxhQUFhO0FBQy9CLG9CQUFNLFdBQVcsT0FBTyxRQUFRLGdCQUFnQixXQUFXLFFBQVEsY0FBYyxRQUFRLFlBQVk7QUFDckcsc0JBQVEsUUFBUSxPQUFPLGNBQWMsUUFBUTtBQUFBLFlBQzlDO0FBQ0EsZ0JBQUksUUFBUSxPQUFPLFdBQVcsQ0FBQyxRQUFRLG1CQUFtQixDQUFDLFFBQVEsYUFBYTtBQUMvRSxvQkFBTSxlQUFlLFFBQVEsTUFBTTtBQUNuQyxvQkFBTSxZQUFZLE9BQU8saUJBQWlCLFdBQVcsZUFBZSxpQkFBaUIsWUFBWSxJQUFJLGFBQWEsUUFBUSxJQUFJLGNBQWMsWUFBWSxJQUFJLGFBQWEsZUFBZSxTQUFZO0FBQ3BNLGtCQUFJLGNBQWMsQ0FBQyxRQUFRLFVBQVUsY0FBYyxRQUFRLE1BQU0sTUFBTSxjQUFjLFNBQVMsSUFBSTtBQUNqRyx3QkFBUSxRQUFRLE9BQU8sY0FBYyxTQUFTO0FBQUEsY0FDL0M7QUFBQSxZQUNEO0FBQ0EsZ0JBQUksUUFBUSxPQUFPLE9BQU87QUFDekIsc0JBQVEsUUFBUSxPQUFPLFFBQVEsTUFBTTtBQUFBLFlBQ3RDO0FBQ0EsZ0JBQUksUUFBUSxjQUFjO0FBQ3pCLHNCQUFRLFFBQVEsUUFBUSxRQUFRLGFBQWEsVUFDMUMsU0FBUyw4QkFBOEIsV0FBVyxRQUFRLGFBQWEsS0FBSyxJQUM1RSxTQUFTLCtCQUErQixZQUFZLFFBQVEsYUFBYSxLQUFLO0FBQUEsWUFDbEY7QUFDQSxnQkFBSSxRQUFRLFVBQVU7QUFDckIsc0JBQVEsU0FBUyxFQUFFLEtBQUssK0JBQStCLFNBQVMsQ0FBQyx5Q0FBeUMsRUFBRSxHQUFHLDZCQUE2QixPQUFPLFFBQVEsUUFBUTtBQUFBLFlBQ3BLO0FBQ0EsZ0JBQUksUUFBUSxnQkFBZ0IsUUFBUTtBQUNuQyxzQkFBUSxTQUFTLDBCQUEwQiwwQ0FBMEMsS0FBSztBQUFBLFlBQzNGO0FBQ0EsbUJBQU87QUFBQSxVQUNSO0FBQ0EsaUJBQU87QUFBQSxRQUNSO0FBQUEsUUFDQSxvQkFBb0IsTUFBTSxTQUFTLEVBQUUsS0FBSyx3QkFBd0IsU0FBUyxDQUFDLHlCQUF5QixFQUFFLEdBQUcsZUFBZTtBQUFBLFFBQ3pILFNBQVMsQ0FBQyxNQUFNO0FBQ2Ysa0JBQVEsRUFBRSxNQUFNO0FBQUEsWUFDZixLQUFLO0FBQ0oscUJBQU87QUFBQSxZQUNSLEtBQUs7QUFDSixxQkFBTztBQUFBLFlBQ1I7QUFDQyxxQkFBTztBQUFBLFVBQ1Q7QUFBQSxRQUNEO0FBQUEsUUFDQSxlQUFlLE1BQU07QUFBQSxRQUNyQixHQUFHO0FBQUEsTUFDSjtBQUFBLElBQ0QsQ0FBQyxDQUFDO0FBRUYsU0FBSyxNQUFNLE1BQU0saUJBQWlCO0FBRWxDLFNBQUssVUFBVSxLQUFLLE1BQU0sYUFBYSxPQUFLLEtBQUssWUFBWSxDQUFDLENBQUMsQ0FBQztBQUNoRSxTQUFLLFVBQVUsS0FBSyxNQUFNLFlBQVksT0FBSyxLQUFLLFlBQVksQ0FBQyxDQUFDLENBQUM7QUFDL0QsU0FBSyxVQUFVLEtBQUssTUFBTSxpQkFBaUIsTUFBTSxLQUFLLFFBQVEsQ0FBQyxDQUFDO0FBQ2hFLFNBQUssVUFBVSxLQUFLLE1BQU0scUJBQXFCLE9BQUssS0FBSyxnQkFBZ0IsQ0FBQyxDQUFDLENBQUM7QUFFNUUsU0FBSyxnQkFBZ0IsQ0FBQyxHQUFHLEtBQUs7QUFHOUIsUUFBSSxLQUFLLFVBQVUsY0FBYyxLQUFLLFVBQVUsa0JBQWtCO0FBQ2pFLFdBQUssbUJBQW1CLFNBQVMsY0FBYyxLQUFLO0FBQ3BELFdBQUssaUJBQWlCLFlBQVk7QUFDbEMsWUFBTSxZQUFZLElBQUksT0FBTyxLQUFLLGtCQUFrQixJQUFJLEVBQUUseUJBQXlCLENBQUM7QUFFcEYsVUFBSSxLQUFLLFVBQVUsWUFBWTtBQUM5QixhQUFLLGVBQWUsU0FBUyxjQUFjLE9BQU87QUFDbEQsYUFBSyxhQUFhLE9BQU87QUFDekIsYUFBSyxhQUFhLFlBQVk7QUFDOUIsYUFBSyxhQUFhLGNBQWMsS0FBSyxVQUFVLHFCQUFxQixTQUFTLGlDQUFpQyxXQUFXO0FBQ3pILGFBQUssYUFBYSxhQUFhLGNBQWMsU0FBUywrQkFBK0IsY0FBYyxDQUFDO0FBQ3BHLGtCQUFVLFlBQVksS0FBSyxZQUFZO0FBRXZDLGNBQU0sZ0JBQWdCLEtBQUssVUFBVSxpQkFBaUIsQ0FBQztBQUN2RCxZQUFJLGNBQWMsU0FBUyxHQUFHO0FBQzdCLGdCQUFNLHlCQUF5QixJQUFJLE9BQU8sV0FBVyxJQUFJLEVBQUUsNkJBQTZCLENBQUM7QUFDekYsZ0JBQU0sa0JBQWtCLEtBQUssVUFBVSxJQUFJLFVBQVUsc0JBQXNCLENBQUM7QUFDNUUsMEJBQWdCLEtBQUssZUFBZSxFQUFFLE1BQU0sTUFBTSxPQUFPLE1BQU0sQ0FBQztBQUFBLFFBQ2pFO0FBTUEsY0FBTSx1QkFBdUIsTUFBTTtBQUNsQyxnQkFBTSxRQUFRLEtBQUssYUFBYztBQUdqQyxjQUFJLEtBQUsseUJBQXlCLFVBQVUsS0FBSyxhQUFhO0FBQzdEO0FBQUEsVUFDRDtBQUNBLGVBQUssY0FBYztBQUNuQixlQUFLLHFCQUFxQjtBQUFBLFFBQzNCO0FBRUEsYUFBSyxVQUFVLElBQUksc0JBQXNCLEtBQUssY0FBYyxvQkFBb0IsTUFBTTtBQUNyRixlQUFLLHdCQUF3QjtBQUs3QixlQUFLLFdBQVcsT0FBTyxPQUFPO0FBQUEsUUFDL0IsQ0FBQyxDQUFDO0FBQ0YsYUFBSyxVQUFVLElBQUksc0JBQXNCLEtBQUssY0FBYyxrQkFBa0IsTUFBTTtBQUNuRixlQUFLLHdCQUF3QjtBQUM3QiwrQkFBcUI7QUFBQSxRQUN0QixDQUFDLENBQUM7QUFDRixhQUFLLFVBQVUsSUFBSSxzQkFBc0IsS0FBSyxjQUFjLFNBQVMsb0JBQW9CLENBQUM7QUFBQSxNQUMzRjtBQUVBLFVBQUksS0FBSyxVQUFVLGtCQUFrQjtBQUNwQyxjQUFNLGdCQUFnQixJQUFJLE9BQU8sV0FBVyxJQUFJLEVBQUUsMkJBQTJCLENBQUM7QUFDOUUsc0JBQWMsY0FBYyxLQUFLLFNBQVM7QUFBQSxNQUMzQztBQUFBLElBQ0Q7QUFHQSxRQUFJLEtBQUssVUFBVSxZQUFZO0FBQzlCLFdBQUssbUJBQW1CLFNBQVMsY0FBYyxLQUFLO0FBQ3BELFdBQUssaUJBQWlCLFlBQVk7QUFDbEMsV0FBSyxpQkFBaUIsY0FBYyxLQUFLLFNBQVM7QUFBQSxJQUNuRDtBQUdBLFFBQUksS0FBSyxVQUFVLFlBQVk7QUFDOUIsV0FBSyxtQkFBbUIsU0FBUyxjQUFjLEtBQUs7QUFDcEQsV0FBSyxpQkFBaUIsWUFBWTtBQUNsQyxVQUFJLEtBQUssU0FBUyxZQUFZO0FBQzdCLGNBQU0sT0FBTyxJQUFJLE9BQU8sS0FBSyxrQkFBa0IsSUFBSSxFQUFFLDhCQUE4QixDQUFDO0FBQ3BGLGFBQUssVUFBVSxJQUFJLEdBQUcsVUFBVSxpQkFBaUIsS0FBSyxTQUFTLFVBQVUsQ0FBQztBQUUxRSxhQUFLLGFBQWEsZUFBZSxNQUFNO0FBQUEsTUFDeEM7QUFDQSxZQUFNLE9BQU8sSUFBSSxPQUFPLEtBQUssa0JBQWtCLElBQUksRUFBRSw4QkFBOEIsQ0FBQztBQUNwRixXQUFLLGNBQWMsS0FBSyxTQUFTO0FBR2pDLFdBQUssVUFBVSxJQUFJLHNCQUFzQixLQUFLLGtCQUFrQixJQUFJLFVBQVUsYUFBYSxNQUFNLEtBQUssYUFBYSxDQUFDLENBQUM7QUFFckgsVUFBSSxLQUFLLFNBQVMsWUFBWTtBQUM3QixjQUFNLEVBQUUsT0FBTyxJQUFJLElBQUksS0FBSyxTQUFTO0FBRXJDLGFBQUssZUFBZTtBQUNwQixhQUFLLFVBQVUsS0FBSyxzQkFBc0IsZUFBZSxNQUFNLE1BQU0sRUFBRSxPQUFPLE1BQU0sSUFBSSxTQUFTLElBQUksRUFBRSxHQUFHLENBQUMsQ0FBQyxDQUFDO0FBQUEsTUFDOUc7QUFFQSxVQUFJLEtBQUssU0FBUyxlQUFlO0FBQ2hDLGNBQU0sWUFBWSxLQUFLLFNBQVM7QUFDaEMsY0FBTSxnQkFBZ0IsSUFBSSxPQUFPLEtBQUssa0JBQWtCLElBQUksRUFBRSxpQ0FBaUMsQ0FBQztBQUNoRyxzQkFBYyxZQUFZLElBQUksRUFBRSxVQUFVLGNBQWMsUUFBUSxLQUFLLENBQUMsQ0FBQztBQUN2RSxzQkFBYyxXQUFXO0FBQ3pCLHNCQUFjLGFBQWEsUUFBUSxRQUFRO0FBQzNDLHNCQUFjLGFBQWEsY0FBYyxTQUFTLDZCQUE2QixTQUFTLENBQUM7QUFDekYsY0FBTSxVQUFVLE1BQU07QUFDckIsb0JBQVU7QUFFVixlQUFLLE1BQU07QUFDWCxlQUFLLGtCQUFrQixPQUFPO0FBRzlCLGVBQUssbUJBQW1CO0FBQ3hCLGVBQUssb0JBQW9CLEtBQUs7QUFBQSxRQUMvQjtBQUdBLGFBQUssVUFBVSxJQUFJLG9DQUFvQyxlQUFlLE1BQU0sUUFBUSxDQUFDLENBQUM7QUFDdEYsYUFBSyxVQUFVLElBQUksc0JBQXNCLGVBQWUsSUFBSSxVQUFVLFVBQVUsQ0FBQyxNQUFxQjtBQUNyRyxjQUFJLEVBQUUsUUFBUSxXQUFXLEVBQUUsUUFBUSxLQUFLO0FBQ3ZDLGNBQUUsZUFBZTtBQUNqQixvQkFBUTtBQUFBLFVBQ1Q7QUFBQSxRQUNELENBQUMsQ0FBQztBQUFBLE1BQ0g7QUFBQSxJQUNEO0FBRUEsU0FBSyxhQUFhO0FBRWxCLFFBQUksS0FBSyxNQUFNLFFBQVE7QUFDdEIsV0FBSyxxQkFBcUI7QUFBQSxJQUMzQjtBQUdBLFNBQUssVUFBVSxJQUFJLHNCQUFzQixLQUFLLFNBQVMsV0FBVyxDQUFDLE1BQXFCO0FBQ3ZGLFVBQUksRUFBRSxRQUFRLGdCQUFnQixDQUFDLEVBQUUsYUFBYTtBQUM3QyxjQUFNLFVBQVUsS0FBSyxNQUFNLFNBQVM7QUFDcEMsWUFBSSxRQUFRLFNBQVMsR0FBRztBQUN2QixnQkFBTSxVQUFVLEtBQUssTUFBTSxRQUFRLFFBQVEsQ0FBQyxDQUFDO0FBQzdDLGNBQUksU0FBUyxnQkFBZ0IsUUFBUTtBQUNwQyxnQkFBSSxZQUFZLEtBQUssR0FBRyxJQUFJO0FBQzVCLGtCQUFNLGFBQWEsS0FBSyxlQUFlLFFBQVEsQ0FBQyxDQUFDO0FBQ2pELGdCQUFJLFlBQVk7QUFDZixtQkFBSyx1QkFBdUIsU0FBUyxVQUFVO0FBQy9DLG1CQUFLLHVCQUF1QixNQUFNO0FBQUEsWUFDbkM7QUFBQSxVQUNEO0FBQUEsUUFDRDtBQUFBLE1BQ0Q7QUFBQSxJQUNELENBQUMsQ0FBQztBQUlGLFFBQUksS0FBSyxjQUFjO0FBQ3RCLFdBQUssVUFBVSxJQUFJLHNCQUFzQixLQUFLLFNBQVMsV0FBVyxDQUFDLE1BQXFCO0FBQ3ZGLFlBQUksS0FBSyxnQkFBZ0IsQ0FBQyxJQUFJLGdCQUFnQixLQUFLLFlBQVksS0FDM0QsQ0FBQyxFQUFFLGVBQWUsRUFBRSxJQUFJLFdBQVcsS0FBSyxFQUFFLFFBQVEsT0FBTyxDQUFDLEVBQUUsV0FBVyxDQUFDLEVBQUUsV0FBVyxDQUFDLEVBQUUsUUFBUTtBQUNuRyxlQUFLLGFBQWEsTUFBTTtBQUN4QixlQUFLLGFBQWEsUUFBUSxFQUFFO0FBQzVCLGVBQUssY0FBYyxFQUFFO0FBQ3JCLGVBQUsscUJBQXFCO0FBQzFCLFlBQUUsZUFBZTtBQUNqQixZQUFFLGdCQUFnQjtBQUFBLFFBQ25CO0FBQUEsTUFDRCxDQUFDLENBQUM7QUFBQSxJQUNIO0FBQUEsRUFDRDtBQUFBLEVBRVEsZUFBZSxTQUF1QjtBQUM3QyxRQUFJLEtBQUssbUJBQW1CLElBQUksT0FBTyxHQUFHO0FBQ3pDLFdBQUssbUJBQW1CLE9BQU8sT0FBTztBQUFBLElBQ3ZDLE9BQU87QUFDTixXQUFLLG1CQUFtQixJQUFJLE9BQU87QUFBQSxJQUNwQztBQUNBLFNBQUssVUFBVSxxQkFBcUIsU0FBUyxLQUFLLG1CQUFtQixJQUFJLE9BQU8sQ0FBQztBQUNqRixTQUFLLGFBQWE7QUFBQSxFQUNuQjtBQUFBLEVBRVEsdUJBQTZCO0FBQ3BDLFFBQUksQ0FBQyxLQUFLLFVBQVUsVUFBVTtBQUM3QixXQUFLLGFBQWE7QUFDbEI7QUFBQSxJQUNEO0FBRUEsVUFBTSxhQUFhLEtBQUs7QUFDeEIsU0FBSyxXQUFXLE9BQU8sT0FBTztBQUM5QixVQUFNLE1BQU0sSUFBSSx3QkFBd0I7QUFDeEMsU0FBSyxXQUFXLFFBQVE7QUFDeEIsU0FBSyxVQUFVLFNBQVMsWUFBWSxJQUFJLEtBQUssRUFBRSxLQUFLLFdBQVM7QUFDNUQsVUFBSSxJQUFJLE1BQU0seUJBQXlCO0FBQ3RDO0FBQUEsTUFDRDtBQUNBLFdBQUssZ0JBQWdCLENBQUMsR0FBRyxLQUFLO0FBQzlCLFdBQUssYUFBYSxJQUFJO0FBQUEsSUFDdkIsQ0FBQyxFQUFFLE1BQU0sTUFBTTtBQUFBLElBQW9CLENBQUM7QUFBQSxFQUNyQztBQUFBLEVBRVEsYUFBYSxpQkFBaUIsT0FBTyxhQUFhLE1BQVk7QUFDckUsVUFBTSxjQUFjLGlCQUFpQixLQUFLLEtBQUssWUFBWSxZQUFZO0FBQ3ZFLFVBQU0sY0FBYyxDQUFDLGtCQUFrQixZQUFZLFNBQVM7QUFDNUQsVUFBTSxVQUFnQyxDQUFDO0FBR3ZDLFVBQU0saUJBQWlCLEtBQUssTUFBTSxTQUFTO0FBQzNDLFFBQUk7QUFDSixRQUFJLGVBQWUsU0FBUyxHQUFHO0FBQzlCLG9CQUFjLEtBQUssTUFBTSxRQUFRLGVBQWUsQ0FBQyxDQUFDO0FBQUEsSUFDbkQ7QUFFQSxRQUFJLGFBQWE7QUFDaEIsVUFBSTtBQUNKLFVBQUksdUJBQTZDLENBQUM7QUFDbEQsVUFBSSw2QkFBNkI7QUFFakMsWUFBTSx1QkFBdUIsTUFBTTtBQUNsQyxZQUFJLG9CQUFvQiw0QkFBNEI7QUFDbkQsa0JBQVEsS0FBSyxnQkFBZ0I7QUFBQSxRQUM5QjtBQUNBLGdCQUFRLEtBQUssR0FBRyxvQkFBb0I7QUFDcEMsMkJBQW1CO0FBQ25CLCtCQUF1QixDQUFDO0FBQ3hCLHFDQUE2QjtBQUFBLE1BQzlCO0FBRUEsWUFBTSxnQkFBZ0IsQ0FBQyxTQUE2QjtBQUNuRCxjQUFNLFNBQVMsS0FBSyxTQUFTLElBQUksWUFBWTtBQUM3QyxjQUFNLFlBQVksT0FBTyxLQUFLLGdCQUFnQixXQUFXLEtBQUssY0FBZSxLQUFLLGFBQWEsU0FBUztBQUN4RyxlQUFPLE1BQU0sU0FBUyxXQUFXLEtBQUssVUFBVSxZQUFZLEVBQUUsU0FBUyxXQUFXO0FBQUEsTUFDbkY7QUFFQSxpQkFBVyxRQUFRLEtBQUssZUFBZTtBQUN0QyxZQUFJLEtBQUssU0FBUyx1QkFBMkI7QUFDNUM7QUFBQSxRQUNEO0FBRUEsWUFBSSxLQUFLLFNBQVMsNkJBQThCO0FBQy9DLCtCQUFxQjtBQUNyQiw2QkFBbUIsS0FBSyxRQUFRLE9BQU87QUFDdkM7QUFBQSxRQUNEO0FBRUEsWUFBSSxLQUFLLFlBQVk7QUFDcEIsK0JBQXFCLEtBQUssSUFBSTtBQUM5QjtBQUFBLFFBQ0Q7QUFFQSxZQUFJLEtBQUssaUJBQWlCO0FBQ3pCO0FBQUEsUUFDRDtBQUVBLFlBQUksY0FBYyxJQUFJLEdBQUc7QUFDeEIsdUNBQTZCO0FBQzdCLCtCQUFxQixLQUFLLElBQUk7QUFBQSxRQUMvQjtBQUFBLE1BQ0Q7QUFFQSwyQkFBcUI7QUFBQSxJQUN0QixPQUFPO0FBQ04saUJBQVcsUUFBUSxLQUFLLGVBQWU7QUFDdEMsWUFBSSxLQUFLLFNBQVMsdUJBQTJCO0FBQzVDLGtCQUFRLEtBQUssSUFBSTtBQUNqQjtBQUFBLFFBQ0Q7QUFFQSxZQUFJLEtBQUssU0FBUyw2QkFBOEI7QUFDL0MsY0FBSSxLQUFLLFdBQVcsS0FBSyxtQkFBbUIsSUFBSSxLQUFLLE9BQU8sR0FBRztBQUM5RDtBQUFBLFVBQ0Q7QUFDQSxrQkFBUSxLQUFLLElBQUk7QUFDakI7QUFBQSxRQUNEO0FBR0EsWUFBSSxLQUFLLG1CQUFtQixLQUFLLFNBQVM7QUFDekMsZ0JBQU0sWUFBWSxLQUFLLG1CQUFtQixJQUFJLEtBQUssT0FBTztBQUMxRCxrQkFBUSxLQUFLO0FBQUEsWUFDWixHQUFHO0FBQUEsWUFDSCxPQUFPLEVBQUUsR0FBRyxLQUFLLE9BQVEsTUFBTSxZQUFZLFFBQVEsZUFBZSxRQUFRLFlBQVk7QUFBQSxVQUN2RixDQUFDO0FBQ0Q7QUFBQSxRQUNEO0FBRUEsWUFBSSxLQUFLLFdBQVcsS0FBSyxtQkFBbUIsSUFBSSxLQUFLLE9BQU8sR0FBRztBQUM5RDtBQUFBLFFBQ0Q7QUFDQSxnQkFBUSxLQUFLLElBQUk7QUFBQSxNQUNsQjtBQUFBLElBQ0Q7QUFJQSxVQUFNLGtCQUE2QixDQUFDO0FBQ3BDLFFBQUksYUFBYTtBQUNqQixhQUFTLElBQUksR0FBRyxJQUFJLFFBQVEsUUFBUSxLQUFLO0FBQ3hDLHNCQUFnQixDQUFDLElBQUk7QUFDckIsVUFBSSxRQUFRLENBQUMsRUFBRSxTQUFTLHVCQUEyQjtBQUNsRCxxQkFBYTtBQUFBLE1BQ2Q7QUFBQSxJQUNEO0FBRUEsVUFBTSwrQkFBMEMsQ0FBQztBQUNqRCxRQUFJLHNCQUFzQjtBQUMxQixhQUFTLElBQUksUUFBUSxTQUFTLEdBQUcsS0FBSyxHQUFHLEtBQUs7QUFDN0MsVUFBSSxRQUFRLENBQUMsRUFBRSxTQUFTLHVCQUEyQjtBQUNsRCw4QkFBc0I7QUFDdEI7QUFBQSxNQUNEO0FBQ0EsVUFBSSxRQUFRLENBQUMsRUFBRSxTQUFTLDZCQUE4QjtBQUNyRDtBQUFBLE1BQ0Q7QUFDQSxtQ0FBNkIsQ0FBQyxJQUFJO0FBQ2xDLDRCQUFzQjtBQUFBLElBQ3ZCO0FBRUEsYUFBUyxJQUFJLFFBQVEsU0FBUyxHQUFHLEtBQUssR0FBRyxLQUFLO0FBQzdDLFlBQU0sT0FBTyxRQUFRLENBQUM7QUFDdEIsVUFBSSxLQUFLLFNBQVMsNkJBQThCO0FBQy9DO0FBQUEsTUFDRDtBQUNBLFlBQU0sOEJBQThCLDZCQUE2QixDQUFDO0FBQ2xFLFlBQU0sNEJBQTRCLENBQUMsS0FBSyxTQUFTLENBQUMsZ0JBQWdCLENBQUM7QUFDbkUsVUFBSSxDQUFDLCtCQUErQiwyQkFBMkI7QUFDOUQsZ0JBQVEsT0FBTyxHQUFHLENBQUM7QUFBQSxNQUNwQjtBQUFBLElBQ0Q7QUFHQSxRQUFJLEtBQUssVUFBVSwyQkFBMkI7QUFDN0MsV0FBSyxzQkFBc0IsT0FBTztBQUFBLElBQ25DO0FBSUEsVUFBTSxzQkFBc0IsS0FBSyxnQkFBZ0IsSUFBSSxnQkFBZ0IsS0FBSyxZQUFZO0FBRXRGLFNBQUssTUFBTSxPQUFPLEdBQUcsS0FBSyxNQUFNLFFBQVEsT0FBTztBQUcvQyxRQUFJLFlBQVk7QUFDZixXQUFLLG9CQUFvQixLQUFLO0FBQUEsSUFDL0I7QUFLQSxRQUFJLHFCQUFxQjtBQUN4QixXQUFLLGNBQWMsTUFBTTtBQUV6QixXQUFLLHFCQUFxQjtBQUFBLElBQzNCLFdBQVcsS0FBSyxhQUFhO0FBRTVCLFVBQUksYUFBYTtBQUNoQixjQUFNLGdCQUFpQixZQUFZLE1BQTBCO0FBQzdELFlBQUksZUFBZTtBQUNsQixtQkFBUyxJQUFJLEdBQUcsSUFBSSxLQUFLLE1BQU0sUUFBUSxLQUFLO0FBQzNDLGtCQUFNLEtBQUssS0FBSyxNQUFNLFFBQVEsQ0FBQztBQUMvQixnQkFBSyxHQUFHLE1BQTBCLE9BQU8sZUFBZTtBQUN2RCxtQkFBSyxNQUFNLFNBQVMsQ0FBQyxDQUFDLENBQUM7QUFDdkIsbUJBQUssTUFBTSxPQUFPLENBQUM7QUFHbkIsbUJBQUssTUFBTSxTQUFTO0FBQ3BCO0FBQUEsWUFDRDtBQUFBLFVBQ0Q7QUFBQSxRQUNEO0FBQUEsTUFDRDtBQUFBLElBQ0Q7QUFBQSxFQUNEO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQSxFQU1BLElBQUksa0JBQTJDO0FBQzlDLFdBQU8sS0FBSztBQUFBLEVBQ2I7QUFBQSxFQUVBLElBQUksa0JBQTJDO0FBQzlDLFdBQU8sS0FBSztBQUFBLEVBQ2I7QUFBQSxFQUVBLElBQUksa0JBQTJDO0FBQzlDLFdBQU8sS0FBSztBQUFBLEVBQ2I7QUFBQSxFQUVBLElBQUksY0FBNEM7QUFDL0MsV0FBTyxLQUFLO0FBQUEsRUFDYjtBQUFBLEVBRUEsSUFBSSxpQkFBd0Q7QUFDM0QsV0FBTyxLQUFLLFVBQVU7QUFBQSxFQUN2QjtBQUFBLEVBRVEsZUFBZSxTQUE0QztBQUNsRSxXQUFPLENBQUMsUUFBUSxZQUFZLFFBQVEsU0FBUztBQUFBLEVBQzlDO0FBQUEsRUFFQSxRQUFjO0FBQ2IsUUFBSSxLQUFLLGdCQUFnQixLQUFLLFVBQVUsbUJBQW1CO0FBQzFELFdBQUssYUFBYSxNQUFNO0FBRXhCLFdBQUsscUJBQXFCO0FBQzFCO0FBQUEsSUFDRDtBQUNBLFNBQUssTUFBTSxTQUFTO0FBQ3BCLFNBQUsscUJBQXFCO0FBQUEsRUFDM0I7QUFBQSxFQUVBLGFBQW1CO0FBQ2xCLFNBQUssTUFBTSxTQUFTLENBQUMsQ0FBQztBQUFBLEVBQ3ZCO0FBQUEsRUFFQSxvQkFBb0Q7QUFDbkQsVUFBTSxVQUFVLEtBQUssTUFBTSxTQUFTO0FBQ3BDLFFBQUksUUFBUSxTQUFTLEdBQUc7QUFDdkIsYUFBTyxLQUFLLE1BQU0sUUFBUSxRQUFRLENBQUMsQ0FBQztBQUFBLElBQ3JDO0FBQ0EsV0FBTztBQUFBLEVBQ1I7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQSxFQVFBLFlBQVksT0FBc0MsYUFBNEI7QUFDN0UsU0FBSyxnQkFBZ0IsQ0FBQyxHQUFHLEtBQUs7QUFJOUIsU0FBSyxhQUFhLE9BQU8sS0FBSztBQUM5QixRQUFJLGdCQUFnQixRQUFXO0FBQzlCLFdBQUssY0FBYyxXQUFXO0FBQUEsSUFDL0I7QUFBQSxFQUNEO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBLEVBT0EsY0FBYyxRQUFzQjtBQUNuQyxVQUFNLFlBQVksTUFBTTtBQUN2QixlQUFTLElBQUksR0FBRyxJQUFJLEtBQUssTUFBTSxRQUFRLEtBQUs7QUFDM0MsY0FBTSxLQUFLLEtBQUssTUFBTSxRQUFRLENBQUM7QUFDL0IsWUFBSyxHQUFHLE1BQTBCLE9BQU8sUUFBUTtBQUNoRCxlQUFLLE1BQU0sU0FBUyxDQUFDLENBQUMsQ0FBQztBQUN2QixlQUFLLE1BQU0sT0FBTyxDQUFDO0FBQ25CLGVBQUssTUFBTSxTQUFTO0FBQ3BCO0FBQUEsUUFDRDtBQUFBLE1BQ0Q7QUFBQSxJQUNEO0FBQ0EsY0FBVTtBQUlWLG1CQUFlLE1BQU07QUFDcEIsVUFBSSxLQUFLLFFBQVEsYUFBYTtBQUM3QixrQkFBVTtBQUFBLE1BQ1g7QUFBQSxJQUNELENBQUM7QUFBQSxFQUNGO0FBQUEsRUFFUSx1QkFBNkI7QUFDcEMsU0FBSyxpQkFBaUI7QUFDdEIsUUFBSTtBQUNILFlBQU0scUJBQXFCLEtBQUs7QUFDaEMsV0FBSyxzQkFBc0I7QUFDM0IsVUFBSSxvQkFBb0I7QUFDdkIsaUJBQVMsSUFBSSxHQUFHLElBQUksS0FBSyxNQUFNLFFBQVEsS0FBSztBQUMzQyxnQkFBTSxVQUFVLEtBQUssTUFBTSxRQUFRLENBQUM7QUFDcEMsY0FBSSxRQUFRLFNBQVMseUJBQThCLFFBQVEsTUFBMEIsT0FBTyxvQkFBb0I7QUFDL0csaUJBQUssTUFBTSxTQUFTLENBQUMsQ0FBQyxDQUFDO0FBQ3ZCLGlCQUFLLE1BQU0sT0FBTyxDQUFDO0FBQ25CO0FBQUEsVUFDRDtBQUFBLFFBQ0Q7QUFBQSxNQUNEO0FBQ0EsWUFBTSxDQUFDLFlBQVksSUFBSSxLQUFLLE1BQU0sU0FBUztBQUMzQyxVQUFJLGlCQUFpQixRQUFXO0FBQy9CLGNBQU0saUJBQWlCLEtBQUssTUFBTSxRQUFRLFlBQVk7QUFDdEQsWUFBSSxrQkFBa0IsS0FBSyxlQUFlLGNBQWMsR0FBRztBQUMxRCxlQUFLLE1BQU0sT0FBTyxZQUFZO0FBQzlCO0FBQUEsUUFDRDtBQUFBLE1BQ0Q7QUFFQSxlQUFTLElBQUksR0FBRyxJQUFJLEtBQUssTUFBTSxRQUFRLEtBQUs7QUFDM0MsY0FBTSxVQUFVLEtBQUssTUFBTSxRQUFRLENBQUM7QUFDcEMsWUFBSSxRQUFRLFNBQVMseUJBQThCLFFBQVEsTUFBZ0MsU0FBUztBQUNuRyxlQUFLLE1BQU0sU0FBUyxDQUFDLENBQUMsQ0FBQztBQUN2QixlQUFLLE1BQU0sT0FBTyxDQUFDO0FBQ25CO0FBQUEsUUFDRDtBQUFBLE1BQ0Q7QUFFQSxXQUFLLE1BQU0sV0FBVyxRQUFXLEtBQUssY0FBYztBQUNwRCxZQUFNLFVBQVUsS0FBSyxNQUFNLFNBQVM7QUFDcEMsVUFBSSxRQUFRLFNBQVMsR0FBRztBQUN2QixhQUFLLE1BQU0sT0FBTyxRQUFRLENBQUMsQ0FBQztBQUFBLE1BQzdCO0FBQUEsSUFDRCxVQUFFO0FBQ0QsV0FBSyxpQkFBaUI7QUFBQSxJQUN2QjtBQUFBLEVBQ0Q7QUFBQSxFQUVBLEtBQUssV0FBMkI7QUFDL0IsU0FBSyxVQUFVLE9BQU8sU0FBUztBQUMvQixTQUFLLElBQUksT0FBTztBQUNoQixTQUFLLFdBQVcsT0FBTyxPQUFPO0FBQzlCLFNBQUssV0FBVyxNQUFNO0FBQ3RCLFNBQUssYUFBYTtBQUFBLEVBQ25CO0FBQUEsRUFFQSxjQUF1QjtBQUN0QixRQUFJLEtBQUssZ0JBQWdCLEtBQUssYUFBYTtBQUMxQyxXQUFLLGFBQWEsUUFBUTtBQUMxQixXQUFLLGNBQWM7QUFDbkIsV0FBSyxxQkFBcUI7QUFDMUIsYUFBTztBQUFBLElBQ1I7QUFDQSxXQUFPO0FBQUEsRUFDUjtBQUFBO0FBQUE7QUFBQTtBQUFBLEVBS0EsSUFBSSxtQkFBNEI7QUFDL0IsUUFBSSxLQUFLLFVBQVUsWUFBWTtBQUM5QixhQUFPO0FBQUEsSUFDUjtBQUNBLFdBQU8sS0FBSyxjQUFjLEtBQUssVUFBUSxLQUFLLGVBQWU7QUFBQSxFQUM1RDtBQUFBO0FBQUE7QUFBQTtBQUFBLEVBS0EsSUFBSSxhQUFxQjtBQUN4QixXQUFPLEtBQUs7QUFBQSxFQUNiO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQSxFQU1VLGVBQWUsTUFBa0M7QUFDMUQsWUFBUSxLQUFLLE1BQU07QUFBQSxNQUNsQixLQUFLO0FBQ0osZUFBTyxLQUFLO0FBQUEsTUFDYixLQUFLO0FBQ0osZUFBTyxLQUFLLFFBQVEsS0FBSyxvQkFBb0IsS0FBSztBQUFBLE1BQ25EO0FBQ0MsWUFBSSxLQUFLLGNBQWM7QUFDdEIsaUJBQU8sS0FBSyxVQUFVLDBCQUEwQjtBQUFBLFFBQ2pEO0FBQ0EsZUFBTyxLQUFLLFNBQVUsS0FBSyxVQUFVLG9CQUFvQixLQUFNLEtBQUs7QUFBQSxJQUN0RTtBQUFBLEVBQ0Q7QUFBQTtBQUFBO0FBQUE7QUFBQSxFQUtBLG9CQUE0QjtBQUMzQixRQUFJLGFBQWE7QUFDakIsZUFBVyxRQUFRLEtBQUssZUFBZTtBQUN0QyxvQkFBYyxLQUFLLGVBQWUsSUFBSTtBQUFBLElBQ3ZDO0FBQ0EsV0FBTztBQUFBLEVBQ1I7QUFBQTtBQUFBO0FBQUE7QUFBQSxFQUtBLG9CQUE0QjtBQUMzQixVQUFNLGVBQWUsS0FBSyxNQUFNO0FBQ2hDLFFBQUksYUFBYTtBQUNqQixhQUFTLElBQUksR0FBRyxJQUFJLGNBQWMsS0FBSztBQUN0QyxZQUFNLFVBQVUsS0FBSyxNQUFNLFFBQVEsQ0FBQztBQUNwQyxvQkFBYyxLQUFLLGVBQWUsT0FBTztBQUFBLElBQzFDO0FBQ0EsV0FBTztBQUFBLEVBQ1I7QUFBQTtBQUFBO0FBQUE7QUFBQSxFQUtBLE9BQU8sUUFBZ0IsT0FBc0I7QUFDNUMsU0FBSyxjQUFjO0FBQ25CLFNBQUssTUFBTSxPQUFPLFFBQVEsS0FBSztBQUMvQixTQUFLLFFBQVEsTUFBTSxTQUFTLEdBQUcsTUFBTTtBQUdyQyxRQUFJLEtBQUssb0JBQW9CLEtBQUssaUJBQWlCLGVBQWU7QUFDakUsV0FBSyxpQkFBaUIsY0FBYyxhQUFhLEtBQUssa0JBQWtCLEtBQUssT0FBTztBQUFBLElBQ3JGO0FBQUEsRUFDRDtBQUFBLEVBRUEsZ0JBQWdCLFVBQTBCO0FBQ3pDLFVBQU0sZUFBZSxLQUFLLE1BQU07QUFDaEMsVUFBTSxvQkFBb0IsS0FBSyxJQUFJLFVBQVUsS0FBSyxVQUFVLFlBQVksQ0FBQztBQUN6RSxVQUFNLGlCQUFpQixLQUFLLFVBQVUsWUFBWSxPQUFPO0FBQ3pELFVBQU0sY0FBYyxLQUFLLElBQUksZ0JBQWdCLGlCQUFpQjtBQUM5RCxVQUFNLFFBQVEsQ0FBQyxNQUFjLEtBQUssSUFBSSxLQUFLLElBQUksR0FBRyxpQkFBaUIsR0FBRyxXQUFXO0FBQ2pGLFFBQUksV0FBVztBQUVmLFVBQU0saUJBQWlCLEtBQUssY0FBYztBQUMxQyxRQUFJLGtCQUFrQixJQUFJO0FBQ3pCLGFBQU8sTUFBTSxHQUFHO0FBQUEsSUFDakI7QUFFQSxRQUFJLGlCQUFpQixjQUFjO0FBR2xDLFlBQU1DLGdCQUFxQyxDQUFDO0FBQzVDLGVBQVMsSUFBSSxHQUFHLElBQUksY0FBYyxLQUFLO0FBQ3RDLFFBQUFBLGNBQWEsS0FBSyxLQUFLLE1BQU0sUUFBUSxDQUFDLENBQUM7QUFBQSxNQUN4QztBQUVBLFlBQU0sV0FBVyxDQUFDLEdBQUcsS0FBSyxhQUFhO0FBQ3ZDLFdBQUssTUFBTSxPQUFPLEdBQUcsY0FBYyxRQUFRO0FBQzNDLFVBQUksaUJBQWlCO0FBQ3JCLGlCQUFXLFFBQVEsVUFBVTtBQUM1QiwwQkFBa0IsS0FBSyxlQUFlLElBQUk7QUFBQSxNQUMzQztBQUNBLFdBQUssTUFBTSxPQUFPLGNBQWM7QUFFaEMsWUFBTUMsY0FBYSxLQUFLLG1CQUFtQixRQUFRO0FBRW5ELGlCQUFXLE1BQU0sS0FBSyxJQUFJLEdBQUdBLFdBQVUsQ0FBQztBQUd4QyxXQUFLLE1BQU0sT0FBTyxHQUFHLFNBQVMsUUFBUUQsYUFBWTtBQUNsRCxhQUFPO0FBQUEsSUFDUjtBQUdBLFVBQU0sZUFBcUMsQ0FBQztBQUM1QyxhQUFTLElBQUksR0FBRyxJQUFJLGNBQWMsS0FBSztBQUN0QyxtQkFBYSxLQUFLLEtBQUssTUFBTSxRQUFRLENBQUMsQ0FBQztBQUFBLElBQ3hDO0FBQ0EsVUFBTSxhQUFhLEtBQUssbUJBQW1CLFlBQVk7QUFDdkQsV0FBTyxNQUFNLEtBQUssSUFBSSxHQUFHLFVBQVUsQ0FBQztBQUFBLEVBQ3JDO0FBQUEsRUFFQSxnQkFBZ0I7QUFDZixRQUFJLEtBQUssZ0JBQWdCLElBQUksZ0JBQWdCLEtBQUssWUFBWSxHQUFHO0FBQ2hFLFdBQUssTUFBTSxTQUFTO0FBRXBCLFlBQU0sVUFBVSxLQUFLLE1BQU0sU0FBUztBQUNwQyxVQUFJLFFBQVEsU0FBUyxHQUFHO0FBQ3ZCLGFBQUssTUFBTSxjQUFjLEdBQUcsT0FBTyxRQUFXLEtBQUssY0FBYztBQUNqRSxjQUFNRSxXQUFVLEtBQUssTUFBTSxTQUFTO0FBRXBDLFlBQUlBLFNBQVEsU0FBUyxLQUFLQSxTQUFRLENBQUMsS0FBSyxRQUFRLENBQUMsR0FBRztBQUNuRCxlQUFLLGFBQWEsTUFBTTtBQUFBLFFBQ3pCLFdBQVdBLFNBQVEsU0FBUyxHQUFHO0FBQzlCLGVBQUssTUFBTSxPQUFPQSxTQUFRLENBQUMsQ0FBQztBQUFBLFFBQzdCO0FBQUEsTUFDRCxPQUFPO0FBQ04sYUFBSyxNQUFNLFVBQVUsUUFBVyxLQUFLLGNBQWM7QUFDbkQsY0FBTUEsV0FBVSxLQUFLLE1BQU0sU0FBUztBQUNwQyxZQUFJQSxTQUFRLFNBQVMsR0FBRztBQUN2QixlQUFLLE1BQU0sT0FBT0EsU0FBUSxDQUFDLENBQUM7QUFBQSxRQUM3QjtBQUFBLE1BQ0Q7QUFDQTtBQUFBLElBQ0Q7QUFDQSxVQUFNLGdCQUFnQixLQUFLLE1BQU0sU0FBUztBQUMxQyxTQUFLLE1BQU0sY0FBYyxHQUFHLE1BQU0sUUFBVyxLQUFLLGNBQWM7QUFDaEUsVUFBTSxVQUFVLEtBQUssTUFBTSxTQUFTO0FBQ3BDLFFBQUksUUFBUSxTQUFTLEdBQUc7QUFFdkIsVUFBSSxLQUFLLGdCQUFnQixjQUFjLFNBQVMsS0FBSyxRQUFRLENBQUMsSUFBSSxjQUFjLENBQUMsR0FBRztBQUNuRixhQUFLLE1BQU0sU0FBUyxDQUFDLENBQUM7QUFDdEIsYUFBSyxhQUFhLE1BQU07QUFDeEI7QUFBQSxNQUNEO0FBQ0EsV0FBSyxNQUFNLE9BQU8sUUFBUSxDQUFDLENBQUM7QUFBQSxJQUM3QjtBQUFBLEVBQ0Q7QUFBQSxFQUVBLFlBQVk7QUFDWCxRQUFJLEtBQUssZ0JBQWdCLElBQUksZ0JBQWdCLEtBQUssWUFBWSxHQUFHO0FBQ2hFLFdBQUssTUFBTSxTQUFTO0FBRXBCLFlBQU0sVUFBVSxLQUFLLE1BQU0sU0FBUztBQUNwQyxVQUFJLFFBQVEsU0FBUyxHQUFHO0FBQ3ZCLGFBQUssTUFBTSxVQUFVLEdBQUcsT0FBTyxRQUFXLEtBQUssY0FBYztBQUM3RCxjQUFNQSxXQUFVLEtBQUssTUFBTSxTQUFTO0FBQ3BDLFlBQUlBLFNBQVEsU0FBUyxHQUFHO0FBQ3ZCLGVBQUssTUFBTSxPQUFPQSxTQUFRLENBQUMsQ0FBQztBQUFBLFFBQzdCO0FBQUEsTUFDRCxPQUFPO0FBQ04sYUFBSyxNQUFNLFdBQVcsUUFBVyxLQUFLLGNBQWM7QUFDcEQsY0FBTUEsV0FBVSxLQUFLLE1BQU0sU0FBUztBQUNwQyxZQUFJQSxTQUFRLFNBQVMsR0FBRztBQUN2QixlQUFLLE1BQU0sT0FBT0EsU0FBUSxDQUFDLENBQUM7QUFBQSxRQUM3QjtBQUFBLE1BQ0Q7QUFDQTtBQUFBLElBQ0Q7QUFDQSxVQUFNLGdCQUFnQixLQUFLLE1BQU0sU0FBUztBQUMxQyxTQUFLLE1BQU0sVUFBVSxHQUFHLE1BQU0sUUFBVyxLQUFLLGNBQWM7QUFDNUQsVUFBTSxVQUFVLEtBQUssTUFBTSxTQUFTO0FBQ3BDLFFBQUksUUFBUSxTQUFTLEdBQUc7QUFFdkIsVUFBSSxLQUFLLGdCQUFnQixjQUFjLFNBQVMsS0FBSyxRQUFRLENBQUMsSUFBSSxjQUFjLENBQUMsR0FBRztBQUNuRixhQUFLLE1BQU0sU0FBUyxDQUFDLENBQUM7QUFDdEIsYUFBSyxhQUFhLE1BQU07QUFDeEI7QUFBQSxNQUNEO0FBQ0EsV0FBSyxNQUFNLE9BQU8sUUFBUSxDQUFDLENBQUM7QUFBQSxJQUM3QjtBQUFBLEVBQ0Q7QUFBQSxFQUVBLHlCQUF5QjtBQUN4QixVQUFNLFVBQVUsS0FBSyxtQkFBbUI7QUFDeEMsUUFBSSxXQUFXLENBQUMsS0FBSyxtQkFBbUIsSUFBSSxPQUFPLEdBQUc7QUFDckQsV0FBSyxlQUFlLE9BQU87QUFBQSxJQUM1QjtBQUFBLEVBQ0Q7QUFBQSxFQUVBLHVCQUF1QjtBQUN0QixVQUFNLFVBQVUsS0FBSyxtQkFBbUI7QUFDeEMsUUFBSSxXQUFXLEtBQUssbUJBQW1CLElBQUksT0FBTyxHQUFHO0FBQ3BELFdBQUssZUFBZSxPQUFPO0FBQUEsSUFDNUI7QUFBQSxFQUNEO0FBQUEsRUFFQSx1QkFBZ0M7QUFDL0IsVUFBTSxVQUFVLEtBQUssTUFBTSxTQUFTO0FBQ3BDLFFBQUksUUFBUSxXQUFXLEdBQUc7QUFDekIsYUFBTztBQUFBLElBQ1I7QUFDQSxVQUFNLFVBQVUsS0FBSyxNQUFNLFFBQVEsUUFBUSxDQUFDLENBQUM7QUFDN0MsUUFBSSxRQUFRLG1CQUFtQixRQUFRLFNBQVM7QUFDL0MsV0FBSyxlQUFlLFFBQVEsT0FBTztBQUNuQyxhQUFPO0FBQUEsSUFDUjtBQUNBLFdBQU87QUFBQSxFQUNSO0FBQUEsRUFFUSxxQkFBeUM7QUFDaEQsVUFBTSxVQUFVLEtBQUssTUFBTSxTQUFTO0FBQ3BDLFFBQUksUUFBUSxXQUFXLEdBQUc7QUFDekIsYUFBTztBQUFBLElBQ1I7QUFDQSxVQUFNLFVBQVUsS0FBSyxNQUFNLFFBQVEsUUFBUSxDQUFDLENBQUM7QUFDN0MsUUFBSSxRQUFRLG1CQUFtQixRQUFRLFNBQVM7QUFDL0MsYUFBTyxRQUFRO0FBQUEsSUFDaEI7QUFDQSxXQUFPLFFBQVE7QUFBQSxFQUNoQjtBQUFBLEVBRUEsZUFBZSxTQUFtQjtBQUNqQyxVQUFNLFVBQVUsS0FBSyxNQUFNLFNBQVM7QUFDcEMsUUFBSSxRQUFRLFdBQVcsR0FBRztBQUN6QjtBQUFBLElBQ0Q7QUFFQSxVQUFNLGFBQWEsUUFBUSxDQUFDO0FBQzVCLFVBQU0sVUFBVSxLQUFLLE1BQU0sUUFBUSxVQUFVO0FBQzdDLFFBQUksQ0FBQyxLQUFLLGVBQWUsT0FBTyxHQUFHO0FBQ2xDO0FBQUEsSUFDRDtBQUVBLFVBQU0sUUFBUSxVQUFVLElBQUkscUJBQXFCLElBQUksSUFBSSxvQkFBb0I7QUFDN0UsU0FBSyxNQUFNLGFBQWEsQ0FBQyxVQUFVLEdBQUcsS0FBSztBQUFBLEVBQzVDO0FBQUEsRUFFUSxnQkFBZ0IsR0FBeUM7QUFDaEUsUUFBSSxDQUFDLEVBQUUsU0FBUyxRQUFRO0FBQ3ZCO0FBQUEsSUFDRDtBQUVBLFVBQU0sVUFBVSxFQUFFLFNBQVMsQ0FBQztBQUM1QixRQUFJLFFBQVEsbUJBQW1CLFFBQVEsU0FBUztBQUMvQyxXQUFLLE1BQU0sYUFBYSxDQUFDLENBQUM7QUFDMUIsWUFBTSxVQUFVLFFBQVE7QUFDeEIscUJBQWUsTUFBTTtBQUNwQixhQUFLLGVBQWUsT0FBTztBQUFBLE1BQzVCLENBQUM7QUFDRDtBQUFBLElBQ0Q7QUFFQSxRQUFJLElBQUksYUFBYSxFQUFFLFlBQVksR0FBRztBQUNyQyxZQUFNLFNBQVMsRUFBRSxhQUFhO0FBQzlCLFVBQUksSUFBSSxjQUFjLE1BQU0sTUFBTSxPQUFPLFFBQVEsMkJBQTJCLEtBQUssT0FBTyxRQUFRLGdDQUFnQyxLQUFLLE9BQU8sUUFBUSxpQ0FBaUMsSUFBSTtBQUN4TCxhQUFLLE1BQU0sYUFBYSxDQUFDLENBQUM7QUFDMUI7QUFBQSxNQUNEO0FBQUEsSUFDRDtBQUNBLFFBQUksUUFBUSxRQUFRLEtBQUssZUFBZSxPQUFPLEdBQUc7QUFDakQsWUFBTSxpQkFBaUIsRUFBRSx3QkFBd0I7QUFDakQsV0FBSyxVQUFVLFNBQVMsUUFBUSxNQUFNLGtCQUFrQixLQUFLLGdCQUFnQjtBQUFBLElBQzlFLE9BQU87QUFDTixXQUFLLE1BQU0sYUFBYSxDQUFDLENBQUM7QUFBQSxJQUMzQjtBQUFBLEVBQ0Q7QUFBQSxFQUVRLFVBQVU7QUFDakIsVUFBTSxVQUFVLEtBQUssTUFBTSxTQUFTO0FBQ3BDLFFBQUksUUFBUSxXQUFXLEdBQUc7QUFDekI7QUFBQSxJQUNEO0FBQ0EsVUFBTSxhQUFhLFFBQVEsQ0FBQztBQUM1QixVQUFNLFVBQVUsS0FBSyxNQUFNLFFBQVEsVUFBVTtBQUM3QyxTQUFLLFVBQVUsVUFBVSxRQUFRLElBQUk7QUFHckMsUUFBSSxDQUFDLEtBQUssZ0JBQWdCO0FBQ3pCLFdBQUsscUJBQXFCLFNBQVMsVUFBVTtBQUFBLElBQzlDO0FBQUEsRUFDRDtBQUFBLEVBRVEsWUFBWSxNQUFnQztBQUNuRCxVQUFNLFFBQVEsS0FBSyxjQUFjLFFBQVEsSUFBSTtBQUM3QyxRQUFJLFNBQVMsR0FBRztBQUNmLFdBQUssY0FBYyxPQUFPLE9BQU8sQ0FBQztBQUNsQyxXQUFLLGFBQWE7QUFBQSxJQUNuQjtBQUFBLEVBQ0Q7QUFBQSxFQUVRLHNCQUFzQixPQUE0QztBQUN6RSxTQUFLLG1CQUFtQixNQUFNO0FBQzlCLFVBQU0sYUFBYSxvQkFBSSxJQUFZO0FBQ25DLGFBQVMsSUFBSSxHQUFHLElBQUksTUFBTSxRQUFRLEtBQUs7QUFDdEMsWUFBTSxPQUFPLE1BQU0sQ0FBQztBQUNwQixVQUFJLEtBQUssU0FBUyx5QkFBNkIsS0FBSyxPQUFPLFNBQVMsQ0FBQyxXQUFXLElBQUksS0FBSyxNQUFNLEtBQUssR0FBRztBQUN0RyxtQkFBVyxJQUFJLEtBQUssTUFBTSxLQUFLO0FBQy9CLGFBQUssbUJBQW1CLElBQUksR0FBRyxLQUFLLE1BQU0sS0FBSztBQUFBLE1BQ2hEO0FBQUEsSUFDRDtBQUFBLEVBQ0Q7QUFBQSxFQUVRLG1CQUFtQixPQUFnRDtBQUMxRSxVQUFNLE9BQTZELENBQUM7QUFDcEUsYUFBUyxJQUFJLEdBQUcsSUFBSSxNQUFNLFFBQVEsS0FBSztBQUN0QyxZQUFNLFVBQVUsS0FBSyxlQUFlLENBQUM7QUFDckMsVUFBSSxTQUFTO0FBQ1osZ0JBQVEsTUFBTSxRQUFRO0FBQ3RCLGFBQUssS0FBSyxFQUFFLFNBQVMsTUFBTSxNQUFNLENBQUMsRUFBRSxDQUFDO0FBQUEsTUFDdEM7QUFBQSxJQUNEO0FBRUEsUUFBSTtBQUNILGFBQU8sS0FBSyxJQUFJLENBQUMsRUFBRSxTQUFTLEtBQUssTUFBTSxRQUFRLHNCQUFzQixFQUFFLFFBQVEsS0FBSyxxQkFBcUIsSUFBSSxDQUFDO0FBQUEsSUFDL0csVUFBRTtBQUNELGlCQUFXLEVBQUUsUUFBUSxLQUFLLE1BQU07QUFDL0IsZ0JBQVEsTUFBTSxRQUFRO0FBQUEsTUFDdkI7QUFBQSxJQUNEO0FBQUEsRUFDRDtBQUFBLEVBRVEscUJBQXFCLE1BQWtDO0FBQzlELFFBQUksY0FBYyxLQUFLLGdCQUFnQixVQUFVO0FBQ2pELFFBQUksS0FBSyxVQUFVO0FBQ2xCO0FBQUEsSUFDRDtBQUNBLFFBQUksZ0JBQWdCLEdBQUc7QUFDdEIsYUFBTztBQUFBLElBQ1I7QUFFQSxVQUFNLG9CQUFvQjtBQUMxQixXQUFPLGNBQWMsb0JBQW9CO0FBQUEsRUFDMUM7QUFBQSxFQUVRLGVBQWUsT0FBbUM7QUFFekQsV0FBTyxLQUFLLFFBQVEsY0FBYyxlQUFlLEtBQUssTUFBTSxhQUFhLEtBQUssQ0FBQztBQUFBLEVBQ2hGO0FBQUEsRUFFUSxxQkFBcUIsU0FBNkIsT0FBcUI7QUFDOUUsUUFBSSxLQUFLLDJCQUEyQixTQUFTO0FBQzVDO0FBQUEsSUFDRDtBQUVBLFVBQU0sa0JBQWtCLENBQUMsQ0FBQyxRQUFRLE9BQU87QUFDekMsVUFBTSxvQkFBb0IsQ0FBQyxDQUFDLFFBQVEsZ0JBQWdCO0FBRXBELFFBQUksbUJBQW1CLG1CQUFtQjtBQUN6QyxZQUFNLGFBQWEsS0FBSyxlQUFlLEtBQUs7QUFDNUMsVUFBSSxZQUFZO0FBQ2YsYUFBSyx1QkFBdUIsU0FBUyxVQUFVO0FBQUEsTUFDaEQ7QUFDQTtBQUFBLElBQ0Q7QUFJQSxTQUFLLGFBQWE7QUFBQSxFQUNuQjtBQUFBLEVBRVEsb0JBQW9CLE1BQWdDO0FBQzNELFVBQU0sUUFBUSxLQUFLLE1BQU0sUUFBUSxJQUFJO0FBQ3JDLFFBQUksU0FBUyxHQUFHO0FBQ2YsWUFBTSxhQUFhLEtBQUssZUFBZSxLQUFLO0FBQzVDLFVBQUksWUFBWTtBQUNmLGFBQUssdUJBQXVCLE1BQU0sVUFBVTtBQUFBLE1BQzdDO0FBQUEsSUFDRDtBQUFBLEVBQ0Q7QUFBQSxFQUVRLHVCQUF1QixTQUE2QixRQUEyQjtBQUN0RixRQUFJLEtBQUssMkJBQTJCLFNBQVM7QUFDNUM7QUFBQSxJQUNEO0FBRUEsU0FBSyxvQkFBb0IsTUFBTTtBQUMvQixTQUFLLHlCQUF5QjtBQUM5QixTQUFLLHVCQUF1QjtBQUc1QixRQUFJO0FBQ0osVUFBTSxlQUFlLFFBQVEsT0FBTztBQUNwQyxRQUFJLGNBQWM7QUFDakIsVUFBSSxJQUFJLGNBQWMsWUFBWSxHQUFHO0FBQ3BDLHNCQUFjO0FBT2QsWUFBSSxRQUFRLE9BQU8sWUFBWTtBQUM5QixlQUFLLFVBQVUsUUFBUSxNQUFNLFVBQVU7QUFBQSxRQUN4QztBQUFBLE1BQ0QsT0FBTztBQUNOLGNBQU0sV0FBVyxPQUFPLGlCQUFpQixXQUFXLElBQUksZUFBZSxZQUFZLElBQUk7QUFDdkYsY0FBTSxjQUFjLEtBQUssVUFBVTtBQUNuQyxjQUFNLFdBQVcsZUFBZSxVQUFVO0FBQUEsVUFDekMsZUFBZSxDQUFDLFFBQWdCO0FBQy9CLGtCQUFNLE1BQU0sSUFBSSxNQUFNLEdBQUc7QUFDekIsZ0JBQUksYUFBYTtBQUNoQiwwQkFBWSxLQUFLLE9BQU87QUFBQSxZQUN6QixPQUFPO0FBQ04sbUJBQUssZUFBZSxLQUFLLEtBQUssRUFBRSxlQUFlLEtBQUssQ0FBQztBQUFBLFlBQ3REO0FBQUEsVUFDRDtBQUFBLFFBQ0QsQ0FBQztBQUNELGFBQUssb0JBQW9CLElBQUksUUFBUTtBQUNyQyxzQkFBYyxTQUFTO0FBQUEsTUFDeEI7QUFDQSxrQkFBWSxVQUFVLElBQUksa0NBQWtDO0FBQzVELFVBQUksUUFBUSxnQkFBZ0IsUUFBUTtBQUNuQyxvQkFBWSxVQUFVLElBQUksYUFBYTtBQUFBLE1BQ3hDO0FBQ0EsV0FBSyxrQkFBa0IsWUFBWSxXQUFXO0FBQUEsSUFDL0M7QUFFQSxVQUFNLG9CQUFvQixDQUFDLENBQUMsUUFBUSxnQkFBZ0I7QUFHcEQsU0FBSyxrQkFBa0IsTUFBTSxVQUFVO0FBQ3ZDLFNBQUssa0JBQWtCLE1BQU0sV0FBVztBQUN4QyxTQUFLLGtCQUFrQixnQkFBZ0IsTUFBTTtBQUU3QyxVQUFNLGFBQWEsT0FBTyxzQkFBc0I7QUFDaEQsVUFBTSxhQUFhLEtBQUssUUFBUSxzQkFBc0I7QUFDdEQsVUFBTSxlQUFlLElBQUksVUFBVSxLQUFLLE9BQU87QUFFL0MsUUFBSSxjQUFjO0FBQ2xCLFFBQUksV0FBVyxjQUFjLFlBQVksY0FBYztBQUV2RCxRQUFJLG1CQUFtQjtBQUV0QixZQUFNLGVBQTJDLENBQUM7QUFDbEQsWUFBTSxnQkFBZ0IsUUFBUSxlQUFnQixPQUFPLENBQUMsTUFBMEIsYUFBYSxhQUFhO0FBQzFHLFlBQU0sb0JBQW9CLGNBQWMsT0FBTyxPQUFLLEVBQUUsUUFBUSxTQUFTLENBQUM7QUFDeEUsZUFBUyxLQUFLLEdBQUcsS0FBSyxrQkFBa0IsUUFBUSxNQUFNO0FBQ3JELGNBQU0sUUFBUSxrQkFBa0IsRUFBRTtBQUNsQyxZQUFJLE1BQU0sT0FBTztBQUNoQix1QkFBYSxLQUFLO0FBQUEsWUFDakIsTUFBTTtBQUFBLFlBQ04sT0FBTyxFQUFFLE9BQU8sTUFBTSxNQUFNO0FBQUEsWUFDNUIsT0FBTyxNQUFNO0FBQUEsVUFDZCxDQUFDO0FBQUEsUUFDRjtBQUNBLGlCQUFTLEtBQUssR0FBRyxLQUFLLE1BQU0sUUFBUSxRQUFRLE1BQU07QUFDakQsZ0JBQU0sUUFBUSxNQUFNLFFBQVEsRUFBRTtBQUM5QixnQkFBTSxnQkFBZ0I7QUFDdEIsZ0JBQU0sT0FBTyxjQUFjLFFBQ3ZCLFVBQVUsT0FBTyxNQUFNLFVBQVUsUUFBUSxNQUFNLEtBQUssUUFBUSxNQUFNLEVBQUU7QUFDeEUsZ0JBQU1DLGdCQUFlLGNBQWM7QUFDbkMsdUJBQWEsS0FBSztBQUFBLFlBQ2pCLE1BQU07QUFBQSxZQUNOLE1BQU07QUFBQSxZQUNOLE9BQU8sTUFBTTtBQUFBLFlBQ2IsYUFBYSxNQUFNLFdBQVc7QUFBQSxZQUM5QixPQUFPLEVBQUUsT0FBTyxJQUFJLEtBQUs7QUFBQSxZQUN6QixVQUFVO0FBQUEsWUFDVixPQUFPQSxnQkFBZSxFQUFFLFNBQVNBLGNBQWEsSUFBSSxDQUFDO0FBQUEsWUFDbkQsVUFBVSxjQUFjO0FBQUEsVUFDekIsQ0FBQztBQUFBLFFBQ0Y7QUFDQSxZQUFJLEtBQUssa0JBQWtCLFNBQVMsR0FBRztBQUN0Qyx1QkFBYSxLQUFLLEVBQUUsTUFBTSw2QkFBOEIsT0FBTyxHQUFHLENBQUM7QUFBQSxRQUNwRTtBQUFBLE1BQ0Q7QUFFQSxpQkFBVyxVQUFVLFFBQVEsZ0JBQWlCO0FBQzdDLFlBQUksRUFBRSxrQkFBa0IsZ0JBQWdCO0FBQ3ZDLGdCQUFNLGlCQUFpQjtBQUN2Qix1QkFBYSxLQUFLO0FBQUEsWUFDakIsTUFBTTtBQUFBLFlBQ04sTUFBTTtBQUFBLFlBQ04sT0FBTyxPQUFPO0FBQUEsWUFDZCxhQUFhLE9BQU8sV0FBVztBQUFBLFlBQy9CLE9BQU8sRUFBRSxPQUFPLEdBQUc7QUFBQSxZQUNuQixVQUFVO0FBQUEsWUFDVixPQUFPLENBQUM7QUFBQSxZQUNSLFVBQVUsZUFBZTtBQUFBLFVBQzFCLENBQUM7QUFBQSxRQUNGO0FBQUEsTUFDRDtBQUVBLFlBQU0sa0JBQWdEO0FBQUEsUUFDckQsUUFBUSxNQUFNO0FBQUEsUUFBRTtBQUFBLFFBQ2hCLFVBQVUsQ0FBQyxXQUFXO0FBQ3JCLGlCQUFPLElBQUk7QUFDWCxnQkFBTSxhQUFhLEtBQUssd0JBQXdCO0FBQ2hELGVBQUssYUFBYTtBQUNsQixjQUFJLFlBQVk7QUFDZixpQkFBSyxVQUFVLFNBQVMsVUFBVTtBQUFBLFVBQ25DO0FBQ0EsZUFBSyxLQUFLO0FBQUEsUUFDWDtBQUFBLE1BQ0Q7QUFFQSxZQUFNLGdCQUFnQixLQUFLLG9CQUFvQixJQUFJLEtBQUssc0JBQXNCO0FBQUEsUUFDN0U7QUFBQSxRQUNBO0FBQUEsUUFDQTtBQUFBLFFBQ0E7QUFBQSxRQUNBO0FBQUEsUUFDQTtBQUFBLFFBQ0E7QUFBQSxNQUNELENBQUM7QUFDRCxXQUFLLGtCQUFrQixZQUFZLGNBQWMsT0FBTztBQUN4RCxXQUFLLHdCQUF3QjtBQU03QixvQkFBYyxXQUFXO0FBRXpCLG9CQUFjLGNBQWMsa0JBQWtCO0FBQzlDLG9CQUFjLE9BQU8sV0FBVztBQUNoQyxZQUFNLGtCQUFrQixjQUFjLGdCQUFnQixDQUFDO0FBQ3ZELGlCQUFXLEtBQUssSUFBSSxVQUFVLGVBQWU7QUFDN0Msb0JBQWMsT0FBTyxhQUFhLFFBQVE7QUFDMUMsb0JBQWMsUUFBUSxNQUFNLFFBQVEsR0FBRyxRQUFRO0FBRy9DLFdBQUssb0JBQW9CLElBQUksSUFBSSxzQkFBc0IsY0FBYyxTQUFTLFdBQVcsQ0FBQyxNQUFxQjtBQUM5RyxZQUFJLEVBQUUsUUFBUSxVQUFVO0FBQ3ZCLGNBQUksWUFBWSxLQUFLLEdBQUcsSUFBSTtBQUM1QixlQUFLLGFBQWE7QUFDbEIsZUFBSyxLQUFLO0FBQUEsUUFDWCxXQUFXLEVBQUUsUUFBUSxhQUFhO0FBQ2pDLGNBQUksWUFBWSxLQUFLLEdBQUcsSUFBSTtBQUM1QixlQUFLLGFBQWE7QUFDbEIsZUFBSyxNQUFNLFNBQVM7QUFBQSxRQUNyQixXQUFXLEVBQUUsUUFBUSxTQUFTO0FBQzdCLGNBQUksWUFBWSxLQUFLLEdBQUcsSUFBSTtBQUM1QixnQkFBTSxVQUFVLGNBQWMsa0JBQWtCO0FBQ2hELGNBQUksU0FBUyxNQUFNO0FBQ2xCLG9CQUFRLEtBQUssSUFBSTtBQUNqQixrQkFBTSxhQUFhLEtBQUssd0JBQXdCO0FBQ2hELGlCQUFLLGFBQWE7QUFDbEIsZ0JBQUksWUFBWTtBQUNmLG1CQUFLLFVBQVUsU0FBUyxVQUFVO0FBQUEsWUFDbkM7QUFDQSxpQkFBSyxLQUFLO0FBQUEsVUFDWDtBQUFBLFFBQ0QsV0FBVyxFQUFFLFFBQVEsYUFBYTtBQUNqQyxjQUFJLFlBQVksS0FBSyxHQUFHLElBQUk7QUFDNUIsd0JBQWMsVUFBVTtBQUFBLFFBQ3pCLFdBQVcsRUFBRSxRQUFRLFdBQVc7QUFDL0IsY0FBSSxZQUFZLEtBQUssR0FBRyxJQUFJO0FBQzVCLHdCQUFjLGNBQWM7QUFBQSxRQUM3QjtBQUFBLE1BQ0QsQ0FBQyxDQUFDO0FBQUEsSUFDSDtBQUdBLFVBQU0sZ0JBQWdCLGFBQWE7QUFDbkMsVUFBTSxhQUFhLGdCQUFnQixXQUFXO0FBQzlDLFVBQU0sWUFBWSxXQUFXO0FBQzdCLFVBQU0sYUFBYSxXQUFXO0FBRTlCLFVBQU0sTUFBTTtBQUNaLFFBQUksY0FBYyxjQUFjLGNBQWMsV0FBVztBQUN4RCxXQUFLLGtCQUFrQixNQUFNLE9BQU8sR0FBRyxXQUFXLFFBQVEsV0FBVyxPQUFPLEdBQUc7QUFBQSxJQUNoRixPQUFPO0FBQ04sV0FBSyxrQkFBa0IsTUFBTSxPQUFPLEdBQUcsQ0FBQyxhQUFhLEdBQUc7QUFBQSxJQUN6RDtBQUNBLFVBQU0sb0JBQW9CLGNBQWMsWUFBWSxlQUFlO0FBQ25FLFVBQU0sbUJBQW1CLGNBQWM7QUFDdkMsVUFBTSxpQkFBaUIsYUFBYTtBQUNwQyxVQUFNLGVBQWUsV0FBVztBQUNoQyxRQUFJLE1BQU0sV0FBVyxNQUFNLFdBQVcsT0FBTyxlQUFlLG9CQUFvQjtBQUNoRixVQUFNLGNBQWMsV0FBVyxNQUFNLE1BQU07QUFDM0MsUUFBSSxjQUFjLGdCQUFnQjtBQUNqQyxhQUFRLGNBQWMsaUJBQWlCO0FBQUEsSUFDeEM7QUFDQSxRQUFJLFdBQVcsTUFBTSxNQUFNLEdBQUc7QUFDN0IsWUFBTSxDQUFDLFdBQVc7QUFBQSxJQUNuQjtBQUNBLFNBQUssa0JBQWtCLE1BQU0sTUFBTSxHQUFHLEdBQUc7QUFBQSxFQUMxQztBQUFBLEVBRVEsZUFBcUI7QUFDNUIsU0FBSyxtQkFBbUI7QUFDeEIsU0FBSyxtQkFBbUI7QUFDeEIsU0FBSyxvQkFBb0IsTUFBTTtBQUMvQixTQUFLLHdCQUF3QjtBQUM3QixTQUFLLHlCQUF5QjtBQUM5QixTQUFLLHVCQUF1QjtBQUM1QixTQUFLLGtCQUFrQixNQUFNLFVBQVU7QUFBQSxFQUN4QztBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBLEVBUVEseUJBQStCO0FBQ3RDLFFBQUksS0FBSyxrQkFBa0IsU0FBUyxJQUFJLGlCQUFpQixDQUFDLEdBQUc7QUFDNUQsV0FBSyxNQUFNLFNBQVM7QUFBQSxJQUNyQjtBQUNBLFFBQUksVUFBVSxLQUFLLGlCQUFpQjtBQUFBLEVBQ3JDO0FBQUEsRUFFUSx1QkFBNkI7QUFDcEMsU0FBSyxtQkFBbUI7QUFDeEIsU0FBSyxzQkFBc0IsV0FBVyxNQUFNO0FBQzNDLFdBQUssYUFBYTtBQUFBLElBQ25CLEdBQUcsR0FBRztBQUFBLEVBQ1A7QUFBQSxFQUVRLHFCQUEyQjtBQUNsQyxRQUFJLEtBQUssd0JBQXdCLFFBQVc7QUFDM0MsbUJBQWEsS0FBSyxtQkFBbUI7QUFDckMsV0FBSyxzQkFBc0I7QUFBQSxJQUM1QjtBQUFBLEVBQ0Q7QUFBQSxFQUVRLHFCQUFxQixTQUE2QixPQUFpQztBQUMxRixTQUFLLG1CQUFtQjtBQUN4QixTQUFLLHNCQUFzQixXQUFXLE1BQU07QUFDM0MsV0FBSyxzQkFBc0I7QUFDM0IsWUFBTSxhQUFhLE9BQU8sVUFBVSxXQUFXLEtBQUssZUFBZSxLQUFLLElBQUk7QUFDNUUsVUFBSSxZQUFZO0FBQ2YsYUFBSyx1QkFBdUIsU0FBUyxVQUFVO0FBQUEsTUFDaEQ7QUFBQSxJQUNELEdBQUcsR0FBRztBQUFBLEVBQ1A7QUFBQSxFQUVRLHFCQUEyQjtBQUNsQyxRQUFJLEtBQUssd0JBQXdCLFFBQVc7QUFDM0MsbUJBQWEsS0FBSyxtQkFBbUI7QUFDckMsV0FBSyxzQkFBc0I7QUFBQSxJQUM1QjtBQUFBLEVBQ0Q7QUFBQSxFQUVBLE1BQWMsWUFBWSxHQUF3QztBQUNqRSxVQUFNLFVBQVUsRUFBRTtBQUVsQixRQUFJLFdBQVcsUUFBUSxRQUFRLEtBQUssZUFBZSxPQUFPLEdBQUc7QUFJNUQsWUFBTSxvQkFBb0IsSUFBSSxjQUFjLEVBQUUsYUFBYSxNQUFNLEtBQUssRUFBRSxhQUFhLE9BQU8sUUFBUSwyQkFBMkIsTUFBTTtBQUNySSxVQUFJLG1CQUFtQjtBQUN0QixZQUFJLENBQUMsUUFBUSxnQkFBZ0IsUUFBUTtBQUNwQyxlQUFLLG1CQUFtQjtBQUFBLFFBQ3pCO0FBQ0EsYUFBSyxNQUFNLFNBQVMsQ0FBQyxDQUFDO0FBQ3RCO0FBQUEsTUFDRDtBQUdBLFlBQU0sV0FBVyxDQUFDLEVBQUUsUUFBUSxnQkFBZ0IsVUFBVSxRQUFRLE9BQU87QUFDckUsVUFBSSxVQUFVO0FBQ2IsYUFBSyxpQkFBaUI7QUFBQSxNQUN2QjtBQUNBLFdBQUssTUFBTSxTQUFTLE9BQU8sRUFBRSxVQUFVLFdBQVcsQ0FBQyxFQUFFLEtBQUssSUFBSSxDQUFDLENBQUM7QUFDaEUsVUFBSSxVQUFVO0FBQ2IsYUFBSyxpQkFBaUI7QUFBQSxNQUN2QjtBQUdBLFVBQUksVUFBVTtBQUNiLFlBQUksS0FBSywyQkFBMkIsU0FBUztBQUM1QyxlQUFLLG1CQUFtQjtBQUN4QixlQUFLLG1CQUFtQjtBQUFBLFFBQ3pCLE9BQU87QUFDTixlQUFLLGFBQWE7QUFDbEIsZUFBSyxxQkFBcUIsU0FBUyxFQUFFLEtBQUs7QUFBQSxRQUMzQztBQUNBO0FBQUEsTUFDRDtBQUVBLFVBQUksS0FBSywyQkFBMkIsU0FBUztBQUM1QyxhQUFLLG1CQUFtQjtBQUFBLE1BQ3pCLE9BQU87QUFDTixhQUFLLG1CQUFtQjtBQUN4QixhQUFLLGFBQWE7QUFBQSxNQUNuQjtBQUVBLFVBQUksS0FBSyxVQUFVLFdBQVcsQ0FBQyxRQUFRLFlBQVksUUFBUSxTQUFTLHlCQUE2QixLQUFLLDJCQUEyQixTQUFTO0FBQ3pJLGNBQU0sU0FBUyxNQUFNLEtBQUssVUFBVSxRQUFRLFFBQVEsTUFBTSxLQUFLLElBQUksS0FBSztBQUN4RSxjQUFNLGFBQWEsU0FBUyxPQUFPLGFBQWE7QUFDaEQsWUFBSSxlQUFlLFFBQVEsWUFBWTtBQUN0QyxrQkFBUSxhQUFhO0FBQ3JCLGNBQUksT0FBTyxFQUFFLFVBQVUsVUFBVTtBQUNoQyxpQkFBSyxNQUFNLE9BQU8sRUFBRSxPQUFPLEdBQUcsQ0FBQyxPQUFPLENBQUM7QUFDdkMsaUJBQUssTUFBTSxTQUFTLENBQUMsRUFBRSxLQUFLLENBQUM7QUFBQSxVQUM5QjtBQUFBLFFBQ0Q7QUFBQSxNQUNEO0FBQUEsSUFDRCxXQUFXLFdBQVcsUUFBUSxPQUFPLFdBQVcsT0FBTyxFQUFFLFVBQVUsVUFBVTtBQUU1RSxVQUFJLEtBQUssMkJBQTJCLFNBQVM7QUFDNUMsYUFBSyxtQkFBbUI7QUFDeEIsYUFBSyxtQkFBbUI7QUFBQSxNQUN6QixPQUFPO0FBQ04sYUFBSyxhQUFhO0FBQ2xCLGFBQUsscUJBQXFCLFNBQVMsRUFBRSxLQUFLO0FBQUEsTUFDM0M7QUFBQSxJQUNEO0FBQUEsRUFDRDtBQUFBLEVBRVEsWUFBWSxHQUE4QztBQUNqRSxRQUFJLEVBQUUsV0FBVyxLQUFLLGVBQWUsRUFBRSxPQUFPLEdBQUc7QUFDaEQsV0FBSyxNQUFNLFNBQVMsQ0FBQyxDQUFDO0FBQUEsSUFDdkI7QUFBQSxFQUNEO0FBQ0Q7QUF2NENhLG1CQUFOO0FBQUEsRUFpREo7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEdBbkRVO0FBNjRDTixJQUFNLGFBQU4sY0FBNEIsV0FBVztBQUFBLEVBc0Q3QyxZQUNDLE1BQ0EsU0FDQSxPQUNBLFdBQ0EsdUJBQ0EsU0FDQSxRQUNzQyxxQkFDTCxnQkFDVixzQkFDdEI7QUFDRCxVQUFNO0FBSmdDO0FBQ0w7QUExRGxDLFNBQVEsZ0JBQWdCO0FBRXhCLFNBQVEsY0FBYztBQTREckIsU0FBSyxVQUFVO0FBQ2YsU0FBSywyQkFBMkIsU0FBUztBQUN6QyxTQUFLLG1CQUFtQixTQUFTO0FBRWpDLFNBQUssVUFBVSxLQUFLLFVBQVUscUJBQXFCO0FBQUEsTUFDbEQ7QUFBQSxNQUNBO0FBQUEsTUFDQTtBQUFBLE1BQ0E7QUFBQSxNQUNBO0FBQUEsTUFDQTtBQUFBLE1BQ0E7QUFBQSxJQUNELENBQUM7QUFFRCxTQUFLLFVBQVUsS0FBSyxRQUFRLG1CQUFtQixNQUFNO0FBQ3BELFVBQUksS0FBSyxhQUFhO0FBQ3JCLGFBQUssT0FBTyxLQUFLLGFBQWE7QUFDOUIsYUFBSyxvQkFBb0IsT0FBTztBQUFBLE1BQ2pDO0FBQUEsSUFDRCxDQUFDLENBQUM7QUFBQSxFQUNIO0FBQUEsRUEzRUEsSUFBSSxVQUF1QjtBQUMxQixXQUFPLEtBQUssUUFBUTtBQUFBLEVBQ3JCO0FBQUEsRUFFQSxJQUFJLGtCQUEyQztBQUM5QyxXQUFPLEtBQUssUUFBUTtBQUFBLEVBQ3JCO0FBQUEsRUFFQSxJQUFJLGtCQUEyQztBQUM5QyxXQUFPLEtBQUssUUFBUTtBQUFBLEVBQ3JCO0FBQUEsRUFFQSxJQUFJLGtCQUEyQztBQUM5QyxXQUFPLEtBQUssUUFBUTtBQUFBLEVBQ3JCO0FBQUEsRUFFQSxJQUFJLGNBQTRDO0FBQy9DLFdBQU8sS0FBSyxRQUFRO0FBQUEsRUFDckI7QUFBQSxFQUVBLElBQUksaUJBQXdEO0FBQzNELFdBQU8sS0FBSyxRQUFRO0FBQUEsRUFDckI7QUFBQSxFQUVBLElBQUksa0JBQXNDO0FBQ3pDLFdBQU8sS0FBSztBQUFBLEVBQ2I7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBLEVBTUEsSUFBSSxpQkFBNkM7QUFDaEQsUUFBSSxLQUFLLDZCQUE2QixRQUFXO0FBQ2hELGFBQU8sS0FBSztBQUFBLElBQ2I7QUFDQSxRQUFJLEtBQUssZUFBZSxRQUFXO0FBQ2xDLGFBQU87QUFBQSxJQUNSO0FBQ0EsV0FBTyxLQUFLLGFBQWEsZUFBZSxRQUFRLGVBQWU7QUFBQSxFQUNoRTtBQUFBLEVBcUNBLFFBQWM7QUFDYixTQUFLLFFBQVEsTUFBTTtBQUFBLEVBQ3BCO0FBQUEsRUFFQSxLQUFLLFdBQXFCLGtCQUFrQixNQUFZO0FBQ3ZELFNBQUssUUFBUSxLQUFLLFNBQVM7QUFDM0IsUUFBSSxpQkFBaUI7QUFDcEIsV0FBSyxvQkFBb0IsZ0JBQWdCO0FBQUEsSUFDMUM7QUFBQSxFQUNEO0FBQUEsRUFFQSxjQUF1QjtBQUN0QixXQUFPLEtBQUssUUFBUSxZQUFZO0FBQUEsRUFDakM7QUFBQSxFQUVBLGdCQUFzQjtBQUNyQixTQUFLLFFBQVEsY0FBYztBQUFBLEVBQzVCO0FBQUEsRUFFQSxZQUFrQjtBQUNqQixTQUFLLFFBQVEsVUFBVTtBQUFBLEVBQ3hCO0FBQUEsRUFFQSx5QkFBK0I7QUFDOUIsU0FBSyxRQUFRLHVCQUF1QjtBQUFBLEVBQ3JDO0FBQUEsRUFFQSx1QkFBNkI7QUFDNUIsU0FBSyxRQUFRLHFCQUFxQjtBQUFBLEVBQ25DO0FBQUEsRUFFQSx1QkFBZ0M7QUFDL0IsV0FBTyxLQUFLLFFBQVEscUJBQXFCO0FBQUEsRUFDMUM7QUFBQSxFQUVBLGVBQWUsU0FBeUI7QUFDdkMsU0FBSyxRQUFRLGVBQWUsT0FBTztBQUFBLEVBQ3BDO0FBQUEsRUFFQSxZQUFZLE9BQXNDLGFBQTRCO0FBQzdFLFNBQUssUUFBUSxZQUFZLE9BQU8sV0FBVztBQUFBLEVBQzVDO0FBQUEsRUFFQSxjQUFjLFFBQXNCO0FBQ25DLFNBQUssUUFBUSxjQUFjLE1BQU07QUFBQSxFQUNsQztBQUFBLEVBRVEsbUJBQTRCO0FBQ25DLFdBQU8sS0FBSyxRQUFRO0FBQUEsRUFDckI7QUFBQSxFQUVRLDBDQUFrRDtBQUN6RCxVQUFNLGtCQUFrQixLQUFLLFFBQVEsZUFBZSxRQUFRLGdCQUFnQjtBQUM1RSxRQUFJLENBQUMsaUJBQWlCO0FBQ3JCLGFBQU87QUFBQSxJQUNSO0FBRUEsVUFBTSxRQUFRLElBQUksVUFBVSxlQUFlLEVBQUUsaUJBQWlCLGVBQWU7QUFDN0UsVUFBTSxXQUFXLENBQUMsVUFBMEIsT0FBTyxXQUFXLEtBQUssS0FBSztBQUN4RSxXQUFPLFNBQVMsTUFBTSxVQUFVLElBQUksU0FBUyxNQUFNLGFBQWEsSUFBSSxTQUFTLE1BQU0sY0FBYyxJQUFJLFNBQVMsTUFBTSxpQkFBaUI7QUFBQSxFQUN0STtBQUFBLEVBRVEsZ0JBQXdCO0FBQy9CLFVBQU0sYUFBYSxLQUFLLFFBQVEsa0JBQWtCO0FBRWxELFVBQU0sZUFBZSxLQUFLLFFBQVEsa0JBQWtCLEtBQUs7QUFDekQsVUFBTSxlQUFlLEtBQUssUUFBUSxrQkFBa0IsS0FBSztBQUN6RCxVQUFNLGVBQWUsS0FBSyxRQUFRLGtCQUFrQixLQUFLLFFBQVEsZ0JBQWdCLGdCQUFnQixLQUFLO0FBQ3RHLFVBQU0sZUFBZSxlQUFlLGVBQWU7QUFDbkQsVUFBTSxlQUFlLElBQUksVUFBVSxLQUFLLE9BQU87QUFDL0MsUUFBSTtBQUVKLFFBQUksS0FBSyxpQkFBaUIsS0FBSyxLQUFLLDZCQUE2QixRQUFXO0FBQzNFLFlBQU0saUJBQWlCLGFBQWE7QUFDcEMsWUFBTSxhQUFhLGNBQWMsS0FBSyxPQUFPO0FBQzdDLFlBQU0sc0JBQXNCLFdBQVcsTUFBTSxhQUFhO0FBQzFELFlBQU0sWUFBWTtBQUNsQixZQUFNLGFBQWEsaUJBQWlCLHNCQUFzQixXQUFXLFNBQVM7QUFDOUUsWUFBTSxhQUFhO0FBS25CLFVBQUksS0FBSyxlQUFlLFFBQVc7QUFDbEMsYUFBSyxhQUFhLEtBQUssNkJBQTZCLFNBQ2pELEtBQUssNkJBQTZCLGVBQWUsUUFDaEQsZUFBZSxLQUFLLFFBQVEsa0JBQWtCLElBQUksY0FBYyxhQUFhO0FBQUEsTUFDbEY7QUFDQSx3QkFBa0IsS0FBSyxJQUFJLElBQUksS0FBSyxhQUFhLGFBQWEsY0FBYyxLQUFLLHdDQUF3QyxDQUFDO0FBQUEsSUFDM0gsT0FBTztBQUNOLFlBQU0sVUFBVTtBQUNoQixZQUFNLGVBQWUsS0FBSyxlQUFlLGFBQWEsWUFBWSxFQUFFO0FBQ3BFLFlBQU0sWUFBWSxLQUFLLFFBQVEsc0JBQXNCLEVBQUU7QUFDdkQsd0JBQWtCLFlBQVksSUFBSSxlQUFlLFlBQVksVUFBVSxlQUFlO0FBQUEsSUFDdkY7QUFFQSxVQUFNLG9CQUFvQixLQUFLLE1BQU0sYUFBYSxjQUFjLEdBQUc7QUFDbkUsVUFBTSxtQkFBbUIsS0FBSyxRQUFRO0FBQ3RDLFFBQUksS0FBSyw2QkFBNkIsUUFBVztBQUNoRCxZQUFNQyxhQUFZLEtBQUssSUFBSSxpQkFBaUIsaUJBQWlCO0FBQzdELFlBQU1DLFVBQVMsS0FBSyxJQUFJLGFBQWEsY0FBYyxLQUFLLElBQUksR0FBR0QsVUFBUyxDQUFDO0FBQ3pFLGFBQU8sS0FBSyxJQUFJLEdBQUdDLFVBQVMsWUFBWTtBQUFBLElBQ3pDO0FBQ0EsVUFBTSxZQUFZLEtBQUssSUFBSSxLQUFLLElBQUksaUJBQWlCLG1CQUFtQixJQUFJLFlBQVksR0FBRyxpQkFBaUI7QUFDNUcsVUFBTSxTQUFTLEtBQUssSUFBSSxhQUFhLGNBQWMsU0FBUztBQUM1RCxXQUFPLFNBQVM7QUFBQSxFQUNqQjtBQUFBLEVBRUEsT0FBTyxVQUEwQjtBQUNoQyxTQUFLLGNBQWM7QUFDbkIsU0FBSyxnQkFBZ0I7QUFFckIsVUFBTSxhQUFhLEtBQUssY0FBYztBQUN0QyxTQUFLLFFBQVEsT0FBTyxVQUFVO0FBRTlCLFVBQU0sZ0JBQWdCLEtBQUssUUFBUSxnQkFBZ0IsUUFBUTtBQUMzRCxTQUFLLGtCQUFrQjtBQUN2QixTQUFLLFFBQVEsT0FBTyxZQUFZLEtBQUssZUFBZTtBQUVwRCxXQUFPLEtBQUs7QUFBQSxFQUNiO0FBQ0Q7QUFsTmEsYUFBTjtBQUFBLEVBOERKO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxHQWhFVTtBQW9OYixTQUFTLGNBQWMsS0FBcUI7QUFDM0MsU0FBTyxJQUFJLFFBQVEsZUFBZSxHQUFHO0FBQ3RDOyIsCiAgIm5hbWVzIjogWyJBY3Rpb25MaXN0SXRlbUtpbmQiLCAidmlzaWJsZUl0ZW1zIiwgIml0ZW1XaWR0aHMiLCAiZm9jdXNlZCIsICJob3ZlckNvbnRlbnQiLCAibWF4SGVpZ2h0IiwgImhlaWdodCJdCn0K
