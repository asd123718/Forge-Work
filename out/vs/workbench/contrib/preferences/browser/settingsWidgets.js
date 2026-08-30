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
import { BrowserFeatures } from "../../../../base/browser/canIUse.js";
import * as DOM from "../../../../base/browser/dom.js";
import { ActionBar } from "../../../../base/browser/ui/actionbar/actionbar.js";
import { Button } from "../../../../base/browser/ui/button/button.js";
import { applyDragImage } from "../../../../base/browser/ui/dnd/dnd.js";
import { InputBox } from "../../../../base/browser/ui/inputbox/inputBox.js";
import { SelectBox } from "../../../../base/browser/ui/selectBox/selectBox.js";
import { Toggle, unthemedToggleStyles } from "../../../../base/browser/ui/toggle/toggle.js";
import { disposableTimeout } from "../../../../base/common/async.js";
import { Codicon } from "../../../../base/common/codicons.js";
import { Emitter } from "../../../../base/common/event.js";
import { MarkdownString } from "../../../../base/common/htmlContent.js";
import { KeyCode } from "../../../../base/common/keyCodes.js";
import { Disposable, DisposableStore } from "../../../../base/common/lifecycle.js";
import { isIOS } from "../../../../base/common/platform.js";
import { ThemeIcon } from "../../../../base/common/themables.js";
import { isDefined, isUndefinedOrNull } from "../../../../base/common/types.js";
import { localize } from "../../../../nls.js";
import { IConfigurationService } from "../../../../platform/configuration/common/configuration.js";
import { IContextViewService } from "../../../../platform/contextview/browser/contextView.js";
import { IHoverService } from "../../../../platform/hover/browser/hover.js";
import { defaultButtonStyles, getInputBoxStyle, getSelectBoxStyles } from "../../../../platform/theme/browser/defaultStyles.js";
import { IThemeService } from "../../../../platform/theme/common/themeService.js";
import { hasNativeContextMenu } from "../../../../platform/window/common/window.js";
import { validatePropertyName } from "../../../services/preferences/common/preferencesValidation.js";
import { settingsSelectBackground, settingsSelectBorder, settingsSelectForeground, settingsSelectListBorder, settingsTextInputBackground, settingsTextInputBorder, settingsTextInputForeground } from "../common/settingsEditorColorRegistry.js";
import "./media/settingsWidgets.css";
import { settingsDiscardIcon, settingsEditIcon, settingsRemoveIcon } from "./preferencesIcons.js";
const $ = DOM.$;
class ListSettingListModel {
  constructor(newItem) {
    this._dataItems = [];
    this._editKey = null;
    this._selectedIdx = null;
    this._newDataItem = newItem;
  }
  get items() {
    const items = this._dataItems.map((item, i) => {
      const editing = typeof this._editKey === "number" && this._editKey === i;
      return {
        ...item,
        editing,
        selected: i === this._selectedIdx || editing
      };
    });
    if (this._editKey === "create") {
      items.push({
        editing: true,
        selected: true,
        ...this._newDataItem
      });
    }
    return items;
  }
  setEditKey(key) {
    this._editKey = key;
  }
  setValue(listData) {
    this._dataItems = listData;
  }
  select(idx) {
    this._selectedIdx = idx;
  }
  getSelected() {
    return this._selectedIdx;
  }
  selectNext() {
    if (typeof this._selectedIdx === "number") {
      this._selectedIdx = Math.min(this._selectedIdx + 1, this._dataItems.length - 1);
    } else {
      this._selectedIdx = 0;
    }
  }
  selectPrevious() {
    if (typeof this._selectedIdx === "number") {
      this._selectedIdx = Math.max(this._selectedIdx - 1, 0);
    } else {
      this._selectedIdx = 0;
    }
  }
}
let AbstractListSettingWidget = class extends Disposable {
  constructor(container, themeService, contextViewService, configurationService) {
    super();
    this.container = container;
    this.themeService = themeService;
    this.contextViewService = contextViewService;
    this.configurationService = configurationService;
    this.rowElements = [];
    this._onDidChangeList = this._register(new Emitter());
    this.model = new ListSettingListModel(this.getEmptyItem());
    this.listDisposables = this._register(new DisposableStore());
    this.onDidChangeList = this._onDidChangeList.event;
    this.listElement = DOM.append(container, $("div"));
    this.listElement.setAttribute("role", "list");
    this.getContainerClasses().forEach((c) => this.listElement.classList.add(c));
    DOM.append(container, this.renderAddButton());
    this.renderList();
    this._register(DOM.addDisposableListener(this.listElement, DOM.EventType.POINTER_DOWN, (e) => this.onListClick(e)));
    this._register(DOM.addDisposableListener(this.listElement, DOM.EventType.DBLCLICK, (e) => this.onListDoubleClick(e)));
    this._register(DOM.addStandardDisposableListener(this.listElement, "keydown", (e) => {
      if (e.equals(KeyCode.UpArrow)) {
        this.selectPreviousRow();
      } else if (e.equals(KeyCode.DownArrow)) {
        this.selectNextRow();
      } else {
        return;
      }
      e.preventDefault();
      e.stopPropagation();
    }));
  }
  get domNode() {
    return this.listElement;
  }
  get items() {
    return this.model.items;
  }
  get isReadOnly() {
    return false;
  }
  setValue(listData) {
    this.model.setValue(listData);
    this.renderList();
  }
  renderHeader() {
    return;
  }
  isAddButtonVisible() {
    return true;
  }
  renderList() {
    const focused = DOM.isAncestorOfActiveElement(this.listElement);
    DOM.clearNode(this.listElement);
    this.listDisposables.clear();
    const newMode = this.model.items.some((item) => !!(item.editing && this.isItemNew(item)));
    this.container.classList.toggle("setting-list-hide-add-button", !this.isAddButtonVisible() || newMode);
    if (this.model.items.length) {
      this.listElement.tabIndex = 0;
    } else {
      this.listElement.removeAttribute("tabIndex");
    }
    const header = this.renderHeader();
    if (header) {
      this.listElement.appendChild(header);
    }
    this.rowElements = this.model.items.map((item, i) => this.renderDataOrEditItem(item, i, focused));
    this.rowElements.forEach((rowElement) => this.listElement.appendChild(rowElement));
  }
  createBasicSelectBox(value) {
    const selectBoxOptions = value.options.map(({ value: value2, description }) => ({ text: value2, description }));
    const selected = value.options.findIndex((option) => value.data === option.value);
    const styles = getSelectBoxStyles({
      selectBackground: settingsSelectBackground,
      selectForeground: settingsSelectForeground,
      selectBorder: settingsSelectBorder,
      selectListBorder: settingsSelectListBorder
    });
    const selectBox = new SelectBox(selectBoxOptions, selected, this.contextViewService, styles, {
      useCustomDrawn: !hasNativeContextMenu(this.configurationService) || !(isIOS && BrowserFeatures.pointerEvents)
    });
    return selectBox;
  }
  editSetting(idx) {
    this.model.setEditKey(idx);
    this.renderList();
  }
  cancelEdit() {
    this.model.setEditKey("none");
    this.renderList();
  }
  handleItemChange(originalItem, changedItem, idx) {
    this.model.setEditKey("none");
    if (this.isItemNew(originalItem)) {
      this._onDidChangeList.fire({
        type: "add",
        newItem: changedItem,
        targetIndex: idx
      });
    } else {
      this._onDidChangeList.fire({
        type: "change",
        originalItem,
        newItem: changedItem,
        targetIndex: idx
      });
    }
    this.renderList();
  }
  renderDataOrEditItem(item, idx, listFocused) {
    const rowElement = item.editing ? this.renderEdit(item, idx) : this.renderDataItem(item, idx, listFocused);
    rowElement.setAttribute("role", "listitem");
    return rowElement;
  }
  renderDataItem(item, idx, listFocused) {
    const rowElementGroup = this.renderItem(item, idx);
    const rowElement = rowElementGroup.rowElement;
    rowElement.setAttribute("data-index", idx + "");
    rowElement.setAttribute("tabindex", item.selected ? "0" : "-1");
    rowElement.classList.toggle("selected", item.selected);
    const actionBar = new ActionBar(rowElement);
    this.listDisposables.add(actionBar);
    actionBar.push(this.getActionsForItem(item, idx), { icon: true, label: true });
    this.addTooltipsToRow(rowElementGroup, item);
    if (item.selected && listFocused) {
      disposableTimeout(() => rowElement.focus(), void 0, this.listDisposables);
    }
    this.listDisposables.add(DOM.addDisposableListener(rowElement, "click", (e) => {
      e.stopPropagation();
    }));
    return rowElement;
  }
  renderAddButton() {
    const rowElement = $(".setting-list-new-row");
    const startAddButton = this._register(new Button(rowElement, defaultButtonStyles));
    startAddButton.label = this.getLocalizedStrings().addButtonLabel;
    startAddButton.element.classList.add("setting-list-addButton");
    this._register(startAddButton.onDidClick(() => {
      this.model.setEditKey("create");
      this.renderList();
    }));
    return rowElement;
  }
  onListClick(e) {
    const targetIdx = this.getClickedItemIndex(e);
    if (targetIdx < 0) {
      return;
    }
    e.preventDefault();
    e.stopImmediatePropagation();
    if (this.model.getSelected() === targetIdx) {
      return;
    }
    this.selectRow(targetIdx);
  }
  onListDoubleClick(e) {
    const targetIdx = this.getClickedItemIndex(e);
    if (targetIdx < 0) {
      return;
    }
    if (this.isReadOnly) {
      return;
    }
    const item = this.model.items[targetIdx];
    if (item) {
      this.editSetting(targetIdx);
      e.preventDefault();
      e.stopPropagation();
    }
  }
  getClickedItemIndex(e) {
    if (!e.target) {
      return -1;
    }
    const actionbar = DOM.findParentWithClass(e.target, "monaco-action-bar");
    if (actionbar) {
      return -1;
    }
    const element = DOM.findParentWithClass(e.target, "setting-list-row");
    if (!element) {
      return -1;
    }
    const targetIdxStr = element.getAttribute("data-index");
    if (!targetIdxStr) {
      return -1;
    }
    const targetIdx = parseInt(targetIdxStr);
    return targetIdx;
  }
  selectRow(idx) {
    this.model.select(idx);
    this.rowElements.forEach((row) => row.classList.remove("selected"));
    const selectedRow = this.rowElements[this.model.getSelected()];
    selectedRow.classList.add("selected");
    selectedRow.focus();
  }
  selectNextRow() {
    this.model.selectNext();
    this.selectRow(this.model.getSelected());
  }
  selectPreviousRow() {
    this.model.selectPrevious();
    this.selectRow(this.model.getSelected());
  }
};
AbstractListSettingWidget = __decorateClass([
  __decorateParam(1, IThemeService),
  __decorateParam(2, IContextViewService),
  __decorateParam(3, IConfigurationService)
], AbstractListSettingWidget);
let ListSettingWidget = class extends AbstractListSettingWidget {
  constructor(container, themeService, contextViewService, hoverService, configurationService) {
    super(container, themeService, contextViewService, configurationService);
    this.hoverService = hoverService;
    this.showAddButton = true;
    this.isEditable = true;
  }
  setValue(listData, options) {
    this.keyValueSuggester = options?.keySuggester;
    this.isEditable = options?.isReadOnly === void 0 ? true : !options.isReadOnly;
    this.showAddButton = this.isEditable ? options?.showAddButton ?? true : false;
    super.setValue(listData);
  }
  getEmptyItem() {
    return {
      value: {
        type: "string",
        data: ""
      }
    };
  }
  isAddButtonVisible() {
    return this.showAddButton;
  }
  getContainerClasses() {
    return ["setting-list-widget"];
  }
  getActionsForItem(item, idx) {
    if (this.isReadOnly) {
      return [];
    }
    return [
      {
        class: ThemeIcon.asClassName(settingsEditIcon),
        enabled: true,
        id: "workbench.action.editListItem",
        tooltip: this.getLocalizedStrings().editActionTooltip,
        run: () => this.editSetting(idx)
      },
      {
        class: ThemeIcon.asClassName(settingsRemoveIcon),
        enabled: true,
        id: "workbench.action.removeListItem",
        tooltip: this.getLocalizedStrings().deleteActionTooltip,
        run: () => this._onDidChangeList.fire({ type: "remove", originalItem: item, targetIndex: idx })
      }
    ];
  }
  renderItem(item, idx) {
    const rowElement = $(".setting-list-row");
    const valueElement = DOM.append(rowElement, $(".setting-list-value"));
    const siblingElement = DOM.append(rowElement, $(".setting-list-sibling"));
    valueElement.textContent = item.value.data.toString();
    if (item.sibling) {
      siblingElement.textContent = `when: ${item.sibling}`;
    } else {
      siblingElement.textContent = null;
      valueElement.classList.add("no-sibling");
    }
    this.addDragAndDrop(rowElement, item, idx);
    return { rowElement, keyElement: valueElement, valueElement: siblingElement };
  }
  addDragAndDrop(rowElement, item, idx) {
    if (this.model.items.every((item2) => !item2.editing)) {
      rowElement.draggable = true;
      rowElement.classList.add("draggable");
    } else {
      rowElement.draggable = false;
      rowElement.classList.remove("draggable");
    }
    this.listDisposables.add(DOM.addDisposableListener(rowElement, DOM.EventType.DRAG_START, (ev) => {
      this.dragDetails = {
        element: rowElement,
        item,
        itemIndex: idx
      };
      applyDragImage(ev, rowElement, item.value.data);
    }));
    this.listDisposables.add(DOM.addDisposableListener(rowElement, DOM.EventType.DRAG_OVER, (ev) => {
      if (!this.dragDetails) {
        return false;
      }
      ev.preventDefault();
      if (ev.dataTransfer) {
        ev.dataTransfer.dropEffect = "move";
      }
      return true;
    }));
    let counter = 0;
    this.listDisposables.add(DOM.addDisposableListener(rowElement, DOM.EventType.DRAG_ENTER, (ev) => {
      counter++;
      rowElement.classList.add("drag-hover");
    }));
    this.listDisposables.add(DOM.addDisposableListener(rowElement, DOM.EventType.DRAG_LEAVE, (ev) => {
      counter--;
      if (!counter) {
        rowElement.classList.remove("drag-hover");
      }
    }));
    this.listDisposables.add(DOM.addDisposableListener(rowElement, DOM.EventType.DROP, (ev) => {
      if (!this.dragDetails) {
        return false;
      }
      ev.preventDefault();
      counter = 0;
      if (this.dragDetails.element !== rowElement) {
        this._onDidChangeList.fire({
          type: "move",
          originalItem: this.dragDetails.item,
          sourceIndex: this.dragDetails.itemIndex,
          newItem: item,
          targetIndex: idx
        });
      }
      return true;
    }));
    this.listDisposables.add(DOM.addDisposableListener(rowElement, DOM.EventType.DRAG_END, (ev) => {
      counter = 0;
      rowElement.classList.remove("drag-hover");
      ev.dataTransfer?.clearData();
      if (this.dragDetails) {
        this.dragDetails = void 0;
      }
    }));
  }
  renderEdit(item, idx) {
    const rowElement = $(".setting-list-edit-row");
    let valueInput;
    let currentDisplayValue;
    let currentEnumOptions;
    if (this.keyValueSuggester) {
      const enumData = this.keyValueSuggester(this.model.items.map(({ value: { data } }) => data), idx);
      item = {
        ...item,
        value: {
          type: "enum",
          data: item.value.data,
          options: enumData ? enumData.options : []
        }
      };
    }
    switch (item.value.type) {
      case "string":
        valueInput = this.renderInputBox(item.value, rowElement);
        break;
      case "enum":
        valueInput = this.renderDropdown(item.value, rowElement);
        currentEnumOptions = item.value.options;
        if (item.value.options.length) {
          currentDisplayValue = this.isItemNew(item) ? currentEnumOptions[0].value : item.value.data;
        }
        break;
    }
    const updatedInputBoxItem = () => {
      const inputBox = valueInput;
      return {
        value: {
          type: "string",
          data: inputBox.value
        },
        sibling: siblingInput?.value
      };
    };
    const updatedSelectBoxItem = (selectedValue) => {
      return {
        value: {
          type: "enum",
          data: selectedValue,
          options: currentEnumOptions ?? []
        }
      };
    };
    const onKeyDown = (e) => {
      if (e.equals(KeyCode.Enter)) {
        this.handleItemChange(item, updatedInputBoxItem(), idx);
      } else if (e.equals(KeyCode.Escape)) {
        this.cancelEdit();
        e.preventDefault();
        e.stopPropagation();
      }
      rowElement?.focus();
    };
    if (item.value.type !== "string") {
      const selectBox = valueInput;
      this.listDisposables.add(
        selectBox.onDidSelect(({ selected }) => {
          currentDisplayValue = selected;
        })
      );
    } else {
      const inputBox = valueInput;
      this.listDisposables.add(
        DOM.addStandardDisposableListener(inputBox.inputElement, DOM.EventType.KEY_DOWN, onKeyDown)
      );
    }
    let siblingInput;
    if (!isUndefinedOrNull(item.sibling)) {
      siblingInput = new InputBox(rowElement, this.contextViewService, {
        placeholder: this.getLocalizedStrings().siblingInputPlaceholder,
        inputBoxStyles: getInputBoxStyle({
          inputBackground: settingsTextInputBackground,
          inputForeground: settingsTextInputForeground,
          inputBorder: settingsTextInputBorder
        })
      });
      siblingInput.element.classList.add("setting-list-siblingInput");
      this.listDisposables.add(siblingInput);
      siblingInput.value = item.sibling;
      this.listDisposables.add(
        DOM.addStandardDisposableListener(siblingInput.inputElement, DOM.EventType.KEY_DOWN, onKeyDown)
      );
    } else if (valueInput instanceof InputBox) {
      valueInput.element.classList.add("no-sibling");
    }
    const okButton = this.listDisposables.add(new Button(rowElement, defaultButtonStyles));
    okButton.label = localize("okButton", "OK");
    okButton.element.classList.add("setting-list-ok-button");
    this.listDisposables.add(okButton.onDidClick(() => {
      if (item.value.type === "string") {
        this.handleItemChange(item, updatedInputBoxItem(), idx);
      } else {
        this.handleItemChange(item, updatedSelectBoxItem(currentDisplayValue), idx);
      }
    }));
    const cancelButton = this.listDisposables.add(new Button(rowElement, { secondary: true, ...defaultButtonStyles }));
    cancelButton.label = localize("cancelButton", "Cancel");
    cancelButton.element.classList.add("setting-list-cancel-button");
    this.listDisposables.add(cancelButton.onDidClick(() => this.cancelEdit()));
    this.listDisposables.add(
      disposableTimeout(() => {
        valueInput.focus();
        if (valueInput instanceof InputBox) {
          valueInput.select();
        }
      })
    );
    return rowElement;
  }
  isItemNew(item) {
    return item.value.data === "";
  }
  addTooltipsToRow(rowElementGroup, { value, sibling }) {
    const title = isUndefinedOrNull(sibling) ? localize("listValueHintLabel", "List item `{0}`", value.data) : localize("listSiblingHintLabel", "List item `{0}` with sibling `${1}`", value.data, sibling);
    const { rowElement } = rowElementGroup;
    this.listDisposables.add(this.hoverService.setupDelayedHover(rowElement, { content: title }));
    rowElement.setAttribute("aria-label", title);
  }
  getLocalizedStrings() {
    return {
      deleteActionTooltip: localize("removeItem", "Remove Item"),
      editActionTooltip: localize("editItem", "Edit Item"),
      addButtonLabel: localize("addItem", "Add Item"),
      inputPlaceholder: localize("itemInputPlaceholder", "Item..."),
      siblingInputPlaceholder: localize("listSiblingInputPlaceholder", "Sibling...")
    };
  }
  renderInputBox(value, rowElement) {
    const valueInput = new InputBox(rowElement, this.contextViewService, {
      placeholder: this.getLocalizedStrings().inputPlaceholder,
      inputBoxStyles: getInputBoxStyle({
        inputBackground: settingsTextInputBackground,
        inputForeground: settingsTextInputForeground,
        inputBorder: settingsTextInputBorder
      })
    });
    valueInput.element.classList.add("setting-list-valueInput");
    this.listDisposables.add(valueInput);
    valueInput.value = value.data.toString();
    return valueInput;
  }
  renderDropdown(value, rowElement) {
    if (value.type !== "enum") {
      throw new Error("Valuetype must be enum.");
    }
    const selectBox = this.createBasicSelectBox(value);
    const wrapper = $(".setting-list-object-list-row");
    selectBox.render(wrapper);
    rowElement.appendChild(wrapper);
    return selectBox;
  }
};
ListSettingWidget = __decorateClass([
  __decorateParam(1, IThemeService),
  __decorateParam(2, IContextViewService),
  __decorateParam(3, IHoverService),
  __decorateParam(4, IConfigurationService)
], ListSettingWidget);
class ExcludeSettingWidget extends ListSettingWidget {
  getContainerClasses() {
    return ["setting-list-include-exclude-widget"];
  }
  addDragAndDrop(rowElement, item, idx) {
    return;
  }
  addTooltipsToRow(rowElementGroup, item) {
    let title = isUndefinedOrNull(item.sibling) ? localize("excludePatternHintLabel", "Exclude files matching `{0}`", item.value.data) : localize("excludeSiblingHintLabel", "Exclude files matching `{0}`, only when a file matching `{1}` is present", item.value.data, item.sibling);
    if (item.source) {
      title += localize("excludeIncludeSource", ". Default value provided by `{0}`", item.source);
    }
    const markdownTitle = new MarkdownString().appendMarkdown(title);
    const { rowElement } = rowElementGroup;
    this.listDisposables.add(this.hoverService.setupDelayedHover(rowElement, { content: markdownTitle }));
    rowElement.setAttribute("aria-label", title);
  }
  getLocalizedStrings() {
    return {
      deleteActionTooltip: localize("removeExcludeItem", "Remove Exclude Item"),
      editActionTooltip: localize("editExcludeItem", "Edit Exclude Item"),
      addButtonLabel: localize("addPattern", "Add Pattern"),
      inputPlaceholder: localize("excludePatternInputPlaceholder", "Exclude Pattern..."),
      siblingInputPlaceholder: localize("excludeSiblingInputPlaceholder", "When Pattern Is Present...")
    };
  }
}
class IncludeSettingWidget extends ListSettingWidget {
  getContainerClasses() {
    return ["setting-list-include-exclude-widget"];
  }
  addDragAndDrop(rowElement, item, idx) {
    return;
  }
  addTooltipsToRow(rowElementGroup, item) {
    let title = isUndefinedOrNull(item.sibling) ? localize("includePatternHintLabel", "Include files matching `{0}`", item.value.data) : localize("includeSiblingHintLabel", "Include files matching `{0}`, only when a file matching `{1}` is present", item.value.data, item.sibling);
    if (item.source) {
      title += localize("excludeIncludeSource", ". Default value provided by `{0}`", item.source);
    }
    const markdownTitle = new MarkdownString().appendMarkdown(title);
    const { rowElement } = rowElementGroup;
    this.listDisposables.add(this.hoverService.setupDelayedHover(rowElement, { content: markdownTitle }));
    rowElement.setAttribute("aria-label", title);
  }
  getLocalizedStrings() {
    return {
      deleteActionTooltip: localize("removeIncludeItem", "Remove Include Item"),
      editActionTooltip: localize("editIncludeItem", "Edit Include Item"),
      addButtonLabel: localize("addPattern", "Add Pattern"),
      inputPlaceholder: localize("includePatternInputPlaceholder", "Include Pattern..."),
      siblingInputPlaceholder: localize("includeSiblingInputPlaceholder", "When Pattern Is Present...")
    };
  }
}
let ObjectSettingDropdownWidget = class extends AbstractListSettingWidget {
  constructor(container, themeService, contextViewService, hoverService, configurationService) {
    super(container, themeService, contextViewService, configurationService);
    this.hoverService = hoverService;
    this.editable = true;
    this.currentSettingKey = "";
    this.showAddButton = true;
    this.keySuggester = () => void 0;
    this.valueSuggester = () => void 0;
  }
  setValue(listData, options) {
    this.editable = !options?.isReadOnly;
    this.showAddButton = options?.showAddButton ?? this.showAddButton;
    this.keySuggester = options?.keySuggester ?? this.keySuggester;
    this.valueSuggester = options?.valueSuggester ?? this.valueSuggester;
    this.propertyNames = options?.propertyNames;
    if (isDefined(options) && options.settingKey !== this.currentSettingKey) {
      this.model.setEditKey("none");
      this.model.select(null);
      this.currentSettingKey = options.settingKey;
    }
    super.setValue(listData);
  }
  isItemNew(item) {
    return item.key.data === "" && item.value.data === "";
  }
  isAddButtonVisible() {
    return this.showAddButton;
  }
  get isReadOnly() {
    return !this.editable;
  }
  getEmptyItem() {
    return {
      key: { type: "string", data: "" },
      value: { type: "string", data: "" },
      removable: true,
      resetable: false
    };
  }
  getContainerClasses() {
    return ["setting-list-object-widget"];
  }
  getActionsForItem(item, idx) {
    if (this.isReadOnly) {
      return [];
    }
    const actions = [
      {
        class: ThemeIcon.asClassName(settingsEditIcon),
        enabled: true,
        id: "workbench.action.editListItem",
        label: "",
        tooltip: this.getLocalizedStrings().editActionTooltip,
        run: () => this.editSetting(idx)
      }
    ];
    if (item.resetable) {
      actions.push({
        class: ThemeIcon.asClassName(settingsDiscardIcon),
        enabled: true,
        id: "workbench.action.resetListItem",
        label: "",
        tooltip: this.getLocalizedStrings().resetActionTooltip,
        run: () => this._onDidChangeList.fire({ type: "reset", originalItem: item, targetIndex: idx })
      });
    }
    if (item.removable) {
      actions.push({
        class: ThemeIcon.asClassName(settingsRemoveIcon),
        enabled: true,
        id: "workbench.action.removeListItem",
        label: "",
        tooltip: this.getLocalizedStrings().deleteActionTooltip,
        run: () => this._onDidChangeList.fire({ type: "remove", originalItem: item, targetIndex: idx })
      });
    }
    return actions;
  }
  renderHeader() {
    const header = $(".setting-list-row-header");
    const keyHeader = DOM.append(header, $(".setting-list-object-key"));
    const valueHeader = DOM.append(header, $(".setting-list-object-value"));
    const { keyHeaderText, valueHeaderText } = this.getLocalizedStrings();
    keyHeader.textContent = keyHeaderText;
    valueHeader.textContent = valueHeaderText;
    return header;
  }
  renderItem(item, idx) {
    const rowElement = $(".setting-list-row");
    rowElement.classList.add("setting-list-object-row");
    if (this.propertyNames && item.key.data && !validatePropertyName(this.propertyNames, item.key.data)) {
      rowElement.classList.add("invalid-key");
    }
    const keyElement = DOM.append(rowElement, $(".setting-list-object-key"));
    const valueElement = DOM.append(rowElement, $(".setting-list-object-value"));
    keyElement.textContent = item.key.data;
    valueElement.textContent = item.value.data.toString();
    return { rowElement, keyElement, valueElement };
  }
  renderEdit(item, idx) {
    const rowElement = $(".setting-list-edit-row.setting-list-object-row");
    const changedItem = { ...item };
    const onKeyChange = (key) => {
      changedItem.key = key;
      okButton.enabled = key.data !== "";
      const suggestedValue = this.valueSuggester(key.data) ?? item.value;
      if (this.shouldUseSuggestion(item.value, changedItem.value, suggestedValue)) {
        onValueChange(suggestedValue);
        renderLatestValue();
      }
    };
    const onValueChange = (value) => {
      changedItem.value = value;
    };
    let keyWidget;
    let keyElement;
    if (this.showAddButton) {
      if (this.isItemNew(item)) {
        const suggestedKey = this.keySuggester(this.model.items.map(({ key: { data } }) => data));
        if (isDefined(suggestedKey)) {
          changedItem.key = suggestedKey;
          const suggestedValue = this.valueSuggester(changedItem.key.data);
          onValueChange(suggestedValue ?? changedItem.value);
        }
      }
      const { widget, element } = this.renderEditWidget(changedItem.key, {
        idx,
        isKey: true,
        originalItem: item,
        changedItem,
        update: onKeyChange
      });
      keyWidget = widget;
      keyElement = element;
    } else {
      keyElement = $(".setting-list-object-key");
      keyElement.textContent = item.key.data;
    }
    let valueWidget;
    const valueContainer = $(".setting-list-object-value-container");
    const renderLatestValue = () => {
      const { widget, element } = this.renderEditWidget(changedItem.value, {
        idx,
        isKey: false,
        originalItem: item,
        changedItem,
        update: onValueChange
      });
      valueWidget = widget;
      DOM.clearNode(valueContainer);
      valueContainer.append(element);
    };
    renderLatestValue();
    rowElement.append(keyElement, valueContainer);
    const okButton = this.listDisposables.add(new Button(rowElement, defaultButtonStyles));
    okButton.enabled = changedItem.key.data !== "";
    okButton.label = localize("okButton", "OK");
    okButton.element.classList.add("setting-list-ok-button");
    this.listDisposables.add(okButton.onDidClick(() => this.handleItemChange(item, changedItem, idx)));
    const cancelButton = this.listDisposables.add(new Button(rowElement, { secondary: true, ...defaultButtonStyles }));
    cancelButton.label = localize("cancelButton", "Cancel");
    cancelButton.element.classList.add("setting-list-cancel-button");
    this.listDisposables.add(cancelButton.onDidClick(() => this.cancelEdit()));
    this.listDisposables.add(
      disposableTimeout(() => {
        const widget = keyWidget ?? valueWidget;
        widget.focus();
        if (widget instanceof InputBox) {
          widget.select();
        }
      })
    );
    return rowElement;
  }
  renderEditWidget(keyOrValue, options) {
    switch (keyOrValue.type) {
      case "string":
        return this.renderStringEditWidget(keyOrValue, options);
      case "enum":
        return this.renderEnumEditWidget(keyOrValue, options);
      case "boolean":
        return this.renderEnumEditWidget(
          {
            type: "enum",
            data: keyOrValue.data.toString(),
            options: [{ value: "true" }, { value: "false" }]
          },
          options
        );
    }
  }
  renderStringEditWidget(keyOrValue, { idx, isKey, originalItem, changedItem, update }) {
    const wrapper = $(isKey ? ".setting-list-object-input-key" : ".setting-list-object-input-value");
    const inputBox = new InputBox(wrapper, this.contextViewService, {
      placeholder: isKey ? localize("objectKeyInputPlaceholder", "Key") : localize("objectValueInputPlaceholder", "Value"),
      inputBoxStyles: getInputBoxStyle({
        inputBackground: settingsTextInputBackground,
        inputForeground: settingsTextInputForeground,
        inputBorder: settingsTextInputBorder
      })
    });
    inputBox.element.classList.add("setting-list-object-input");
    this.listDisposables.add(inputBox);
    inputBox.value = keyOrValue.data;
    this.listDisposables.add(inputBox.onDidChange((value) => update({ ...keyOrValue, data: value })));
    const onKeyDown = (e) => {
      if (e.equals(KeyCode.Enter)) {
        this.handleItemChange(originalItem, changedItem, idx);
      } else if (e.equals(KeyCode.Escape)) {
        this.cancelEdit();
        e.preventDefault();
        e.stopPropagation();
      }
    };
    this.listDisposables.add(
      DOM.addStandardDisposableListener(inputBox.inputElement, DOM.EventType.KEY_DOWN, onKeyDown)
    );
    return { widget: inputBox, element: wrapper };
  }
  renderEnumEditWidget(keyOrValue, { isKey, changedItem, update }) {
    const selectBox = this.createBasicSelectBox(keyOrValue);
    const changedKeyOrValue = isKey ? changedItem.key : changedItem.value;
    this.listDisposables.add(
      selectBox.onDidSelect(
        ({ selected: selected2 }) => update(
          changedKeyOrValue.type === "boolean" ? { ...changedKeyOrValue, data: selected2 === "true" ? true : false } : { ...changedKeyOrValue, data: selected2 }
        )
      )
    );
    const wrapper = $(".setting-list-object-input");
    wrapper.classList.add(
      isKey ? "setting-list-object-input-key" : "setting-list-object-input-value"
    );
    selectBox.render(wrapper);
    const selected = keyOrValue.options.findIndex((option) => keyOrValue.data === option.value);
    if (selected === -1 && keyOrValue.options.length) {
      update(
        changedKeyOrValue.type === "boolean" ? { ...changedKeyOrValue, data: true } : { ...changedKeyOrValue, data: keyOrValue.options[0].value }
      );
    } else if (changedKeyOrValue.type === "boolean") {
      update({ ...changedKeyOrValue, data: keyOrValue.data === "true" });
    }
    return { widget: selectBox, element: wrapper };
  }
  shouldUseSuggestion(originalValue, previousValue, newValue) {
    if (newValue.type !== "enum" && newValue.type === previousValue.type && newValue.data === previousValue.data) {
      return false;
    }
    if (originalValue.data === "") {
      return true;
    }
    if (previousValue.type === newValue.type && newValue.type !== "enum") {
      return false;
    }
    if (previousValue.type === "enum" && newValue.type === "enum") {
      const previousEnums = new Set(previousValue.options.map(({ value }) => value));
      newValue.options.forEach(({ value }) => previousEnums.delete(value));
      if (previousEnums.size === 0) {
        return false;
      }
    }
    return true;
  }
  addTooltipsToRow(rowElementGroup, item) {
    const { keyElement, valueElement, rowElement } = rowElementGroup;
    let accessibleDescription;
    if (item.source) {
      accessibleDescription = localize("objectPairHintLabelWithSource", "The property `{0}` is set to `{1}` by `{2}`.", item.key.data, item.value.data, item.source);
    } else {
      accessibleDescription = localize("objectPairHintLabel", "The property `{0}` is set to `{1}`.", item.key.data, item.value.data);
    }
    const markdownString = new MarkdownString().appendMarkdown(accessibleDescription);
    const keyDescription = this.getEnumDescription(item.key) ?? item.keyDescription ?? markdownString;
    this.listDisposables.add(this.hoverService.setupDelayedHover(keyElement, { content: keyDescription }));
    const valueDescription = this.getEnumDescription(item.value) ?? markdownString;
    this.listDisposables.add(this.hoverService.setupDelayedHover(valueElement, { content: valueDescription }));
    rowElement.setAttribute("aria-label", accessibleDescription);
  }
  getEnumDescription(keyOrValue) {
    const enumDescription = keyOrValue.type === "enum" ? keyOrValue.options.find(({ value }) => keyOrValue.data === value)?.description : void 0;
    return enumDescription;
  }
  getLocalizedStrings() {
    return {
      deleteActionTooltip: localize("removeItem", "Remove Item"),
      resetActionTooltip: localize("resetItem", "Reset Item"),
      editActionTooltip: localize("editItem", "Edit Item"),
      addButtonLabel: localize("addItem", "Add Item"),
      keyHeaderText: localize("objectKeyHeader", "Item"),
      valueHeaderText: localize("objectValueHeader", "Value")
    };
  }
};
ObjectSettingDropdownWidget = __decorateClass([
  __decorateParam(1, IThemeService),
  __decorateParam(2, IContextViewService),
  __decorateParam(3, IHoverService),
  __decorateParam(4, IConfigurationService)
], ObjectSettingDropdownWidget);
let ObjectSettingCheckboxWidget = class extends AbstractListSettingWidget {
  constructor(container, themeService, contextViewService, hoverService, configurationService) {
    super(container, themeService, contextViewService, configurationService);
    this.hoverService = hoverService;
    this.currentSettingKey = "";
  }
  setValue(listData, options) {
    if (isDefined(options) && options.settingKey !== this.currentSettingKey) {
      this.model.setEditKey("none");
      this.model.select(null);
      this.currentSettingKey = options.settingKey;
    }
    super.setValue(listData);
  }
  isItemNew(item) {
    return !item.key.data && !item.value.data;
  }
  getEmptyItem() {
    return {
      key: { type: "string", data: "" },
      value: { type: "boolean", data: false },
      removable: false,
      resetable: true
    };
  }
  getContainerClasses() {
    return ["setting-list-object-widget"];
  }
  getActionsForItem(item, idx) {
    return [];
  }
  isAddButtonVisible() {
    return false;
  }
  renderHeader() {
    return void 0;
  }
  renderDataOrEditItem(item, idx, listFocused) {
    const rowElement = this.renderEdit(item, idx);
    rowElement.setAttribute("role", "listitem");
    return rowElement;
  }
  renderItem(item, idx) {
    const rowElement = $(".blank-row");
    const keyElement = $(".blank-row-key");
    return { rowElement, keyElement };
  }
  renderEdit(item, idx) {
    const rowElement = $(".setting-list-edit-row.setting-list-object-row.setting-item-bool");
    const changedItem = { ...item };
    const onValueChange = (newValue) => {
      changedItem.value.data = newValue;
      this.handleItemChange(item, changedItem, idx);
    };
    const checkboxDescription = item.keyDescription ? `${item.keyDescription} (${item.key.data})` : item.key.data;
    const { element, widget: checkbox } = this.renderEditWidget(changedItem.value.data, checkboxDescription, onValueChange);
    rowElement.appendChild(element);
    const valueElement = DOM.append(rowElement, $(".setting-list-object-value"));
    valueElement.textContent = checkboxDescription;
    const rowElementGroup = { rowElement, keyElement: valueElement, valueElement: checkbox.domNode };
    this.addTooltipsToRow(rowElementGroup, item);
    this.listDisposables.add(DOM.addDisposableListener(valueElement, DOM.EventType.MOUSE_DOWN, (e) => {
      const targetElement = e.target;
      if (targetElement.tagName.toLowerCase() !== "a") {
        checkbox.checked = !checkbox.checked;
        onValueChange(checkbox.checked);
      }
      DOM.EventHelper.stop(e);
    }));
    return rowElement;
  }
  renderEditWidget(value, checkboxDescription, onValueChange) {
    const checkbox = new Toggle({
      icon: Codicon.check,
      actionClassName: "setting-value-checkbox",
      isChecked: value,
      title: checkboxDescription,
      ...unthemedToggleStyles
    });
    this.listDisposables.add(checkbox);
    const wrapper = $(".setting-list-object-input");
    wrapper.classList.add("setting-list-object-input-key-checkbox");
    checkbox.domNode.classList.add("setting-value-checkbox");
    wrapper.appendChild(checkbox.domNode);
    this.listDisposables.add(DOM.addDisposableListener(wrapper, DOM.EventType.MOUSE_DOWN, (e) => {
      checkbox.checked = !checkbox.checked;
      onValueChange(checkbox.checked);
      e.stopImmediatePropagation();
    }));
    return { widget: checkbox, element: wrapper };
  }
  addTooltipsToRow(rowElementGroup, item) {
    const accessibleDescription = localize("objectPairHintLabel", "The property `{0}` is set to `{1}`.", item.key.data, item.value.data);
    const title = item.keyDescription ?? accessibleDescription;
    const { rowElement, keyElement, valueElement } = rowElementGroup;
    this.listDisposables.add(this.hoverService.setupDelayedHover(keyElement, { content: title }));
    valueElement.setAttribute("aria-label", accessibleDescription);
    rowElement.setAttribute("aria-label", accessibleDescription);
  }
  getLocalizedStrings() {
    return {
      deleteActionTooltip: localize("removeItem", "Remove Item"),
      resetActionTooltip: localize("resetItem", "Reset Item"),
      editActionTooltip: localize("editItem", "Edit Item"),
      addButtonLabel: localize("addItem", "Add Item"),
      keyHeaderText: localize("objectKeyHeader", "Item"),
      valueHeaderText: localize("objectValueHeader", "Value")
    };
  }
};
ObjectSettingCheckboxWidget = __decorateClass([
  __decorateParam(1, IThemeService),
  __decorateParam(2, IContextViewService),
  __decorateParam(3, IHoverService),
  __decorateParam(4, IConfigurationService)
], ObjectSettingCheckboxWidget);
export {
  AbstractListSettingWidget,
  ExcludeSettingWidget,
  IncludeSettingWidget,
  ListSettingListModel,
  ListSettingWidget,
  ObjectSettingCheckboxWidget,
  ObjectSettingDropdownWidget
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXHByZWZlcmVuY2VzXFxicm93c2VyXFxzZXR0aW5nc1dpZGdldHMudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgeyBCcm93c2VyRmVhdHVyZXMgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvY2FuSVVzZS5qcyc7XG5pbXBvcnQgKiBhcyBET00gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL2RvbS5qcyc7XG5pbXBvcnQgeyBTdGFuZGFyZEtleWJvYXJkRXZlbnQgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIva2V5Ym9hcmRFdmVudC5qcyc7XG5pbXBvcnQgeyBBY3Rpb25CYXIgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvdWkvYWN0aW9uYmFyL2FjdGlvbmJhci5qcyc7XG5pbXBvcnQgeyBCdXR0b24gfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvdWkvYnV0dG9uL2J1dHRvbi5qcyc7XG5pbXBvcnQgeyBhcHBseURyYWdJbWFnZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci91aS9kbmQvZG5kLmpzJztcbmltcG9ydCB7IElucHV0Qm94IH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL3VpL2lucHV0Ym94L2lucHV0Qm94LmpzJztcbmltcG9ydCB7IFNlbGVjdEJveCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci91aS9zZWxlY3RCb3gvc2VsZWN0Qm94LmpzJztcbmltcG9ydCB7IFRvZ2dsZSwgdW50aGVtZWRUb2dnbGVTdHlsZXMgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvdWkvdG9nZ2xlL3RvZ2dsZS5qcyc7XG5pbXBvcnQgeyBJQWN0aW9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vYWN0aW9ucy5qcyc7XG5pbXBvcnQgeyBkaXNwb3NhYmxlVGltZW91dCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2FzeW5jLmpzJztcbmltcG9ydCB7IENvZGljb24gfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9jb2RpY29ucy5qcyc7XG5pbXBvcnQgeyBFbWl0dGVyLCBFdmVudCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2V2ZW50LmpzJztcbmltcG9ydCB7IE1hcmtkb3duU3RyaW5nIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vaHRtbENvbnRlbnQuanMnO1xuaW1wb3J0IHsgS2V5Q29kZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2tleUNvZGVzLmpzJztcbmltcG9ydCB7IERpc3Bvc2FibGUsIERpc3Bvc2FibGVTdG9yZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBpc0lPUyB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3BsYXRmb3JtLmpzJztcbmltcG9ydCB7IFRoZW1lSWNvbiB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3RoZW1hYmxlcy5qcyc7XG5pbXBvcnQgeyBpc0RlZmluZWQsIGlzVW5kZWZpbmVkT3JOdWxsIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdHlwZXMuanMnO1xuaW1wb3J0IHsgbG9jYWxpemUgfSBmcm9tICcuLi8uLi8uLi8uLi9ubHMuanMnO1xuaW1wb3J0IHsgSUNvbmZpZ3VyYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29uZmlndXJhdGlvbi9jb21tb24vY29uZmlndXJhdGlvbi5qcyc7XG5pbXBvcnQgeyBJQ29udGV4dFZpZXdTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29udGV4dHZpZXcvYnJvd3Nlci9jb250ZXh0Vmlldy5qcyc7XG5pbXBvcnQgeyBJSG92ZXJTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vaG92ZXIvYnJvd3Nlci9ob3Zlci5qcyc7XG5pbXBvcnQgeyBkZWZhdWx0QnV0dG9uU3R5bGVzLCBnZXRJbnB1dEJveFN0eWxlLCBnZXRTZWxlY3RCb3hTdHlsZXMgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS90aGVtZS9icm93c2VyL2RlZmF1bHRTdHlsZXMuanMnO1xuaW1wb3J0IHsgSVRoZW1lU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3RoZW1lL2NvbW1vbi90aGVtZVNlcnZpY2UuanMnO1xuaW1wb3J0IHsgaGFzTmF0aXZlQ29udGV4dE1lbnUgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS93aW5kb3cvY29tbW9uL3dpbmRvdy5qcyc7XG5pbXBvcnQgeyBTZXR0aW5nVmFsdWVUeXBlIH0gZnJvbSAnLi4vLi4vLi4vc2VydmljZXMvcHJlZmVyZW5jZXMvY29tbW9uL3ByZWZlcmVuY2VzLmpzJztcbmltcG9ydCB7IHZhbGlkYXRlUHJvcGVydHlOYW1lIH0gZnJvbSAnLi4vLi4vLi4vc2VydmljZXMvcHJlZmVyZW5jZXMvY29tbW9uL3ByZWZlcmVuY2VzVmFsaWRhdGlvbi5qcyc7XG5pbXBvcnQgeyBJSlNPTlNjaGVtYSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2pzb25TY2hlbWEuanMnO1xuaW1wb3J0IHsgc2V0dGluZ3NTZWxlY3RCYWNrZ3JvdW5kLCBzZXR0aW5nc1NlbGVjdEJvcmRlciwgc2V0dGluZ3NTZWxlY3RGb3JlZ3JvdW5kLCBzZXR0aW5nc1NlbGVjdExpc3RCb3JkZXIsIHNldHRpbmdzVGV4dElucHV0QmFja2dyb3VuZCwgc2V0dGluZ3NUZXh0SW5wdXRCb3JkZXIsIHNldHRpbmdzVGV4dElucHV0Rm9yZWdyb3VuZCB9IGZyb20gJy4uL2NvbW1vbi9zZXR0aW5nc0VkaXRvckNvbG9yUmVnaXN0cnkuanMnO1xuaW1wb3J0ICcuL21lZGlhL3NldHRpbmdzV2lkZ2V0cy5jc3MnO1xuaW1wb3J0IHsgc2V0dGluZ3NEaXNjYXJkSWNvbiwgc2V0dGluZ3NFZGl0SWNvbiwgc2V0dGluZ3NSZW1vdmVJY29uIH0gZnJvbSAnLi9wcmVmZXJlbmNlc0ljb25zLmpzJztcblxuY29uc3QgJCA9IERPTS4kO1xuXG50eXBlIEVkaXRLZXkgPSAnbm9uZScgfCAnY3JlYXRlJyB8IG51bWJlcjtcblxudHlwZSBSb3dFbGVtZW50R3JvdXAgPSB7XG5cdHJvd0VsZW1lbnQ6IEhUTUxFbGVtZW50O1xuXHRrZXlFbGVtZW50OiBIVE1MRWxlbWVudDtcblx0dmFsdWVFbGVtZW50PzogSFRNTEVsZW1lbnQ7XG59O1xuXG50eXBlIElMaXN0Vmlld0l0ZW08VERhdGFJdGVtIGV4dGVuZHMgb2JqZWN0PiA9IFREYXRhSXRlbSAmIHtcblx0ZWRpdGluZz86IGJvb2xlYW47XG5cdHNlbGVjdGVkPzogYm9vbGVhbjtcbn07XG5cbmV4cG9ydCBjbGFzcyBMaXN0U2V0dGluZ0xpc3RNb2RlbDxURGF0YUl0ZW0gZXh0ZW5kcyBvYmplY3Q+IHtcblx0cHJvdGVjdGVkIF9kYXRhSXRlbXM6IFREYXRhSXRlbVtdID0gW107XG5cdHByaXZhdGUgX2VkaXRLZXk6IEVkaXRLZXkgfCBudWxsID0gbnVsbDtcblx0cHJpdmF0ZSBfc2VsZWN0ZWRJZHg6IG51bWJlciB8IG51bGwgPSBudWxsO1xuXHRwcml2YXRlIF9uZXdEYXRhSXRlbTogVERhdGFJdGVtO1xuXG5cdGdldCBpdGVtcygpOiBJTGlzdFZpZXdJdGVtPFREYXRhSXRlbT5bXSB7XG5cdFx0Y29uc3QgaXRlbXMgPSB0aGlzLl9kYXRhSXRlbXMubWFwKChpdGVtLCBpKSA9PiB7XG5cdFx0XHRjb25zdCBlZGl0aW5nID0gdHlwZW9mIHRoaXMuX2VkaXRLZXkgPT09ICdudW1iZXInICYmIHRoaXMuX2VkaXRLZXkgPT09IGk7XG5cdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHQuLi5pdGVtLFxuXHRcdFx0XHRlZGl0aW5nLFxuXHRcdFx0XHRzZWxlY3RlZDogaSA9PT0gdGhpcy5fc2VsZWN0ZWRJZHggfHwgZWRpdGluZ1xuXHRcdFx0fTtcblx0XHR9KTtcblxuXHRcdGlmICh0aGlzLl9lZGl0S2V5ID09PSAnY3JlYXRlJykge1xuXHRcdFx0aXRlbXMucHVzaCh7XG5cdFx0XHRcdGVkaXRpbmc6IHRydWUsXG5cdFx0XHRcdHNlbGVjdGVkOiB0cnVlLFxuXHRcdFx0XHQuLi50aGlzLl9uZXdEYXRhSXRlbSxcblx0XHRcdH0pO1xuXHRcdH1cblxuXHRcdHJldHVybiBpdGVtcztcblx0fVxuXG5cdGNvbnN0cnVjdG9yKG5ld0l0ZW06IFREYXRhSXRlbSkge1xuXHRcdHRoaXMuX25ld0RhdGFJdGVtID0gbmV3SXRlbTtcblx0fVxuXG5cdHNldEVkaXRLZXkoa2V5OiBFZGl0S2V5KTogdm9pZCB7XG5cdFx0dGhpcy5fZWRpdEtleSA9IGtleTtcblx0fVxuXG5cdHNldFZhbHVlKGxpc3REYXRhOiBURGF0YUl0ZW1bXSk6IHZvaWQge1xuXHRcdHRoaXMuX2RhdGFJdGVtcyA9IGxpc3REYXRhO1xuXHR9XG5cblx0c2VsZWN0KGlkeDogbnVtYmVyIHwgbnVsbCk6IHZvaWQge1xuXHRcdHRoaXMuX3NlbGVjdGVkSWR4ID0gaWR4O1xuXHR9XG5cblx0Z2V0U2VsZWN0ZWQoKTogbnVtYmVyIHwgbnVsbCB7XG5cdFx0cmV0dXJuIHRoaXMuX3NlbGVjdGVkSWR4O1xuXHR9XG5cblx0c2VsZWN0TmV4dCgpOiB2b2lkIHtcblx0XHRpZiAodHlwZW9mIHRoaXMuX3NlbGVjdGVkSWR4ID09PSAnbnVtYmVyJykge1xuXHRcdFx0dGhpcy5fc2VsZWN0ZWRJZHggPSBNYXRoLm1pbih0aGlzLl9zZWxlY3RlZElkeCArIDEsIHRoaXMuX2RhdGFJdGVtcy5sZW5ndGggLSAxKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0dGhpcy5fc2VsZWN0ZWRJZHggPSAwO1xuXHRcdH1cblx0fVxuXG5cdHNlbGVjdFByZXZpb3VzKCk6IHZvaWQge1xuXHRcdGlmICh0eXBlb2YgdGhpcy5fc2VsZWN0ZWRJZHggPT09ICdudW1iZXInKSB7XG5cdFx0XHR0aGlzLl9zZWxlY3RlZElkeCA9IE1hdGgubWF4KHRoaXMuX3NlbGVjdGVkSWR4IC0gMSwgMCk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHRoaXMuX3NlbGVjdGVkSWR4ID0gMDtcblx0XHR9XG5cdH1cbn1cblxuZXhwb3J0IGludGVyZmFjZSBJU2V0dGluZ0xpc3RDaGFuZ2VFdmVudDxURGF0YUl0ZW0gZXh0ZW5kcyBvYmplY3Q+IHtcblx0dHlwZTogJ2NoYW5nZSc7XG5cdG9yaWdpbmFsSXRlbTogVERhdGFJdGVtO1xuXHRuZXdJdGVtOiBURGF0YUl0ZW07XG5cdHRhcmdldEluZGV4OiBudW1iZXI7XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgSVNldHRpbmdMaXN0QWRkRXZlbnQ8VERhdGFJdGVtIGV4dGVuZHMgb2JqZWN0PiB7XG5cdHR5cGU6ICdhZGQnO1xuXHRuZXdJdGVtOiBURGF0YUl0ZW07XG5cdHRhcmdldEluZGV4OiBudW1iZXI7XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgSVNldHRpbmdMaXN0TW92ZUV2ZW50PFREYXRhSXRlbSBleHRlbmRzIG9iamVjdD4ge1xuXHR0eXBlOiAnbW92ZSc7XG5cdG9yaWdpbmFsSXRlbTogVERhdGFJdGVtO1xuXHRuZXdJdGVtOiBURGF0YUl0ZW07XG5cdHRhcmdldEluZGV4OiBudW1iZXI7XG5cdHNvdXJjZUluZGV4OiBudW1iZXI7XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgSVNldHRpbmdMaXN0UmVtb3ZlRXZlbnQ8VERhdGFJdGVtIGV4dGVuZHMgb2JqZWN0PiB7XG5cdHR5cGU6ICdyZW1vdmUnO1xuXHRvcmlnaW5hbEl0ZW06IFREYXRhSXRlbTtcblx0dGFyZ2V0SW5kZXg6IG51bWJlcjtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBJU2V0dGluZ0xpc3RSZXNldEV2ZW50PFREYXRhSXRlbSBleHRlbmRzIG9iamVjdD4ge1xuXHR0eXBlOiAncmVzZXQnO1xuXHRvcmlnaW5hbEl0ZW06IFREYXRhSXRlbTtcblx0dGFyZ2V0SW5kZXg6IG51bWJlcjtcbn1cblxuZXhwb3J0IHR5cGUgU2V0dGluZ0xpc3RFdmVudDxURGF0YUl0ZW0gZXh0ZW5kcyBvYmplY3Q+ID0gSVNldHRpbmdMaXN0Q2hhbmdlRXZlbnQ8VERhdGFJdGVtPiB8IElTZXR0aW5nTGlzdEFkZEV2ZW50PFREYXRhSXRlbT4gfCBJU2V0dGluZ0xpc3RNb3ZlRXZlbnQ8VERhdGFJdGVtPiB8IElTZXR0aW5nTGlzdFJlbW92ZUV2ZW50PFREYXRhSXRlbT4gfCBJU2V0dGluZ0xpc3RSZXNldEV2ZW50PFREYXRhSXRlbT47XG5cbmV4cG9ydCBhYnN0cmFjdCBjbGFzcyBBYnN0cmFjdExpc3RTZXR0aW5nV2lkZ2V0PFREYXRhSXRlbSBleHRlbmRzIG9iamVjdD4gZXh0ZW5kcyBEaXNwb3NhYmxlIHtcblx0cHJpdmF0ZSBsaXN0RWxlbWVudDogSFRNTEVsZW1lbnQ7XG5cdHByaXZhdGUgcm93RWxlbWVudHM6IEhUTUxFbGVtZW50W10gPSBbXTtcblxuXHRwcm90ZWN0ZWQgcmVhZG9ubHkgX29uRGlkQ2hhbmdlTGlzdCA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPFNldHRpbmdMaXN0RXZlbnQ8VERhdGFJdGVtPj4oKSk7XG5cdHByb3RlY3RlZCByZWFkb25seSBtb2RlbCA9IG5ldyBMaXN0U2V0dGluZ0xpc3RNb2RlbDxURGF0YUl0ZW0+KHRoaXMuZ2V0RW1wdHlJdGVtKCkpO1xuXHRwcm90ZWN0ZWQgcmVhZG9ubHkgbGlzdERpc3Bvc2FibGVzID0gdGhpcy5fcmVnaXN0ZXIobmV3IERpc3Bvc2FibGVTdG9yZSgpKTtcblxuXHRyZWFkb25seSBvbkRpZENoYW5nZUxpc3Q6IEV2ZW50PFNldHRpbmdMaXN0RXZlbnQ8VERhdGFJdGVtPj4gPSB0aGlzLl9vbkRpZENoYW5nZUxpc3QuZXZlbnQ7XG5cblx0Z2V0IGRvbU5vZGUoKTogSFRNTEVsZW1lbnQge1xuXHRcdHJldHVybiB0aGlzLmxpc3RFbGVtZW50O1xuXHR9XG5cblx0Z2V0IGl0ZW1zKCk6IFREYXRhSXRlbVtdIHtcblx0XHRyZXR1cm4gdGhpcy5tb2RlbC5pdGVtcztcblx0fVxuXG5cdHByb3RlY3RlZCBnZXQgaXNSZWFkT25seSgpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gZmFsc2U7XG5cdH1cblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRwcml2YXRlIGNvbnRhaW5lcjogSFRNTEVsZW1lbnQsXG5cdFx0QElUaGVtZVNlcnZpY2UgcHJvdGVjdGVkIHJlYWRvbmx5IHRoZW1lU2VydmljZTogSVRoZW1lU2VydmljZSxcblx0XHRASUNvbnRleHRWaWV3U2VydmljZSBwcm90ZWN0ZWQgcmVhZG9ubHkgY29udGV4dFZpZXdTZXJ2aWNlOiBJQ29udGV4dFZpZXdTZXJ2aWNlLFxuXHRcdEBJQ29uZmlndXJhdGlvblNlcnZpY2UgcHJvdGVjdGVkIHJlYWRvbmx5IGNvbmZpZ3VyYXRpb25TZXJ2aWNlOiBJQ29uZmlndXJhdGlvblNlcnZpY2UsXG5cdCkge1xuXHRcdHN1cGVyKCk7XG5cblx0XHR0aGlzLmxpc3RFbGVtZW50ID0gRE9NLmFwcGVuZChjb250YWluZXIsICQoJ2RpdicpKTtcblx0XHR0aGlzLmxpc3RFbGVtZW50LnNldEF0dHJpYnV0ZSgncm9sZScsICdsaXN0Jyk7XG5cdFx0dGhpcy5nZXRDb250YWluZXJDbGFzc2VzKCkuZm9yRWFjaChjID0+IHRoaXMubGlzdEVsZW1lbnQuY2xhc3NMaXN0LmFkZChjKSk7XG5cdFx0RE9NLmFwcGVuZChjb250YWluZXIsIHRoaXMucmVuZGVyQWRkQnV0dG9uKCkpO1xuXHRcdHRoaXMucmVuZGVyTGlzdCgpO1xuXG5cdFx0dGhpcy5fcmVnaXN0ZXIoRE9NLmFkZERpc3Bvc2FibGVMaXN0ZW5lcih0aGlzLmxpc3RFbGVtZW50LCBET00uRXZlbnRUeXBlLlBPSU5URVJfRE9XTiwgZSA9PiB0aGlzLm9uTGlzdENsaWNrKGUpKSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIoRE9NLmFkZERpc3Bvc2FibGVMaXN0ZW5lcih0aGlzLmxpc3RFbGVtZW50LCBET00uRXZlbnRUeXBlLkRCTENMSUNLLCBlID0+IHRoaXMub25MaXN0RG91YmxlQ2xpY2soZSkpKTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKERPTS5hZGRTdGFuZGFyZERpc3Bvc2FibGVMaXN0ZW5lcih0aGlzLmxpc3RFbGVtZW50LCAna2V5ZG93bicsIChlOiBTdGFuZGFyZEtleWJvYXJkRXZlbnQpID0+IHtcblx0XHRcdGlmIChlLmVxdWFscyhLZXlDb2RlLlVwQXJyb3cpKSB7XG5cdFx0XHRcdHRoaXMuc2VsZWN0UHJldmlvdXNSb3coKTtcblx0XHRcdH0gZWxzZSBpZiAoZS5lcXVhbHMoS2V5Q29kZS5Eb3duQXJyb3cpKSB7XG5cdFx0XHRcdHRoaXMuc2VsZWN0TmV4dFJvdygpO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXG5cdFx0XHRlLnByZXZlbnREZWZhdWx0KCk7XG5cdFx0XHRlLnN0b3BQcm9wYWdhdGlvbigpO1xuXHRcdH0pKTtcblx0fVxuXG5cdHNldFZhbHVlKGxpc3REYXRhOiBURGF0YUl0ZW1bXSk6IHZvaWQge1xuXHRcdHRoaXMubW9kZWwuc2V0VmFsdWUobGlzdERhdGEpO1xuXHRcdHRoaXMucmVuZGVyTGlzdCgpO1xuXHR9XG5cblx0YWJzdHJhY3QgaXNJdGVtTmV3KGl0ZW06IFREYXRhSXRlbSk6IGJvb2xlYW47XG5cdHByb3RlY3RlZCBhYnN0cmFjdCBnZXRFbXB0eUl0ZW0oKTogVERhdGFJdGVtO1xuXHRwcm90ZWN0ZWQgYWJzdHJhY3QgZ2V0Q29udGFpbmVyQ2xhc3NlcygpOiBzdHJpbmdbXTtcblx0cHJvdGVjdGVkIGFic3RyYWN0IGdldEFjdGlvbnNGb3JJdGVtKGl0ZW06IFREYXRhSXRlbSwgaWR4OiBudW1iZXIpOiBJQWN0aW9uW107XG5cdHByb3RlY3RlZCBhYnN0cmFjdCByZW5kZXJJdGVtKGl0ZW06IFREYXRhSXRlbSwgaWR4OiBudW1iZXIpOiBSb3dFbGVtZW50R3JvdXA7XG5cdHByb3RlY3RlZCBhYnN0cmFjdCByZW5kZXJFZGl0KGl0ZW06IFREYXRhSXRlbSwgaWR4OiBudW1iZXIpOiBIVE1MRWxlbWVudDtcblx0cHJvdGVjdGVkIGFic3RyYWN0IGFkZFRvb2x0aXBzVG9Sb3cocm93RWxlbWVudDogUm93RWxlbWVudEdyb3VwLCBpdGVtOiBURGF0YUl0ZW0pOiB2b2lkO1xuXHRwcm90ZWN0ZWQgYWJzdHJhY3QgZ2V0TG9jYWxpemVkU3RyaW5ncygpOiB7XG5cdFx0ZGVsZXRlQWN0aW9uVG9vbHRpcDogc3RyaW5nO1xuXHRcdGVkaXRBY3Rpb25Ub29sdGlwOiBzdHJpbmc7XG5cdFx0YWRkQnV0dG9uTGFiZWw6IHN0cmluZztcblx0fTtcblxuXHRwcm90ZWN0ZWQgcmVuZGVySGVhZGVyKCk6IEhUTUxFbGVtZW50IHwgdW5kZWZpbmVkIHtcblx0XHRyZXR1cm47XG5cdH1cblxuXHRwcm90ZWN0ZWQgaXNBZGRCdXR0b25WaXNpYmxlKCk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiB0cnVlO1xuXHR9XG5cblx0cHJvdGVjdGVkIHJlbmRlckxpc3QoKTogdm9pZCB7XG5cdFx0Y29uc3QgZm9jdXNlZCA9IERPTS5pc0FuY2VzdG9yT2ZBY3RpdmVFbGVtZW50KHRoaXMubGlzdEVsZW1lbnQpO1xuXG5cdFx0RE9NLmNsZWFyTm9kZSh0aGlzLmxpc3RFbGVtZW50KTtcblx0XHR0aGlzLmxpc3REaXNwb3NhYmxlcy5jbGVhcigpO1xuXG5cdFx0Y29uc3QgbmV3TW9kZSA9IHRoaXMubW9kZWwuaXRlbXMuc29tZShpdGVtID0+ICEhKGl0ZW0uZWRpdGluZyAmJiB0aGlzLmlzSXRlbU5ldyhpdGVtKSkpO1xuXHRcdHRoaXMuY29udGFpbmVyLmNsYXNzTGlzdC50b2dnbGUoJ3NldHRpbmctbGlzdC1oaWRlLWFkZC1idXR0b24nLCAhdGhpcy5pc0FkZEJ1dHRvblZpc2libGUoKSB8fCBuZXdNb2RlKTtcblxuXHRcdGlmICh0aGlzLm1vZGVsLml0ZW1zLmxlbmd0aCkge1xuXHRcdFx0dGhpcy5saXN0RWxlbWVudC50YWJJbmRleCA9IDA7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHRoaXMubGlzdEVsZW1lbnQucmVtb3ZlQXR0cmlidXRlKCd0YWJJbmRleCcpO1xuXHRcdH1cblxuXHRcdGNvbnN0IGhlYWRlciA9IHRoaXMucmVuZGVySGVhZGVyKCk7XG5cblx0XHRpZiAoaGVhZGVyKSB7XG5cdFx0XHR0aGlzLmxpc3RFbGVtZW50LmFwcGVuZENoaWxkKGhlYWRlcik7XG5cdFx0fVxuXG5cdFx0dGhpcy5yb3dFbGVtZW50cyA9IHRoaXMubW9kZWwuaXRlbXMubWFwKChpdGVtLCBpKSA9PiB0aGlzLnJlbmRlckRhdGFPckVkaXRJdGVtKGl0ZW0sIGksIGZvY3VzZWQpKTtcblx0XHR0aGlzLnJvd0VsZW1lbnRzLmZvckVhY2gocm93RWxlbWVudCA9PiB0aGlzLmxpc3RFbGVtZW50LmFwcGVuZENoaWxkKHJvd0VsZW1lbnQpKTtcblxuXHR9XG5cblx0cHJvdGVjdGVkIGNyZWF0ZUJhc2ljU2VsZWN0Qm94KHZhbHVlOiBJT2JqZWN0RW51bURhdGEpOiBTZWxlY3RCb3gge1xuXHRcdGNvbnN0IHNlbGVjdEJveE9wdGlvbnMgPSB2YWx1ZS5vcHRpb25zLm1hcCgoeyB2YWx1ZSwgZGVzY3JpcHRpb24gfSkgPT4gKHsgdGV4dDogdmFsdWUsIGRlc2NyaXB0aW9uIH0pKTtcblx0XHRjb25zdCBzZWxlY3RlZCA9IHZhbHVlLm9wdGlvbnMuZmluZEluZGV4KG9wdGlvbiA9PiB2YWx1ZS5kYXRhID09PSBvcHRpb24udmFsdWUpO1xuXG5cdFx0Y29uc3Qgc3R5bGVzID0gZ2V0U2VsZWN0Qm94U3R5bGVzKHtcblx0XHRcdHNlbGVjdEJhY2tncm91bmQ6IHNldHRpbmdzU2VsZWN0QmFja2dyb3VuZCxcblx0XHRcdHNlbGVjdEZvcmVncm91bmQ6IHNldHRpbmdzU2VsZWN0Rm9yZWdyb3VuZCxcblx0XHRcdHNlbGVjdEJvcmRlcjogc2V0dGluZ3NTZWxlY3RCb3JkZXIsXG5cdFx0XHRzZWxlY3RMaXN0Qm9yZGVyOiBzZXR0aW5nc1NlbGVjdExpc3RCb3JkZXJcblx0XHR9KTtcblxuXG5cdFx0Y29uc3Qgc2VsZWN0Qm94ID0gbmV3IFNlbGVjdEJveChzZWxlY3RCb3hPcHRpb25zLCBzZWxlY3RlZCwgdGhpcy5jb250ZXh0Vmlld1NlcnZpY2UsIHN0eWxlcywge1xuXHRcdFx0dXNlQ3VzdG9tRHJhd246ICFoYXNOYXRpdmVDb250ZXh0TWVudSh0aGlzLmNvbmZpZ3VyYXRpb25TZXJ2aWNlKSB8fCAhKGlzSU9TICYmIEJyb3dzZXJGZWF0dXJlcy5wb2ludGVyRXZlbnRzKVxuXHRcdH0pO1xuXHRcdHJldHVybiBzZWxlY3RCb3g7XG5cdH1cblxuXHRwcm90ZWN0ZWQgZWRpdFNldHRpbmcoaWR4OiBudW1iZXIpOiB2b2lkIHtcblx0XHR0aGlzLm1vZGVsLnNldEVkaXRLZXkoaWR4KTtcblx0XHR0aGlzLnJlbmRlckxpc3QoKTtcblx0fVxuXG5cdHB1YmxpYyBjYW5jZWxFZGl0KCk6IHZvaWQge1xuXHRcdHRoaXMubW9kZWwuc2V0RWRpdEtleSgnbm9uZScpO1xuXHRcdHRoaXMucmVuZGVyTGlzdCgpO1xuXHR9XG5cblx0cHJvdGVjdGVkIGhhbmRsZUl0ZW1DaGFuZ2Uob3JpZ2luYWxJdGVtOiBURGF0YUl0ZW0sIGNoYW5nZWRJdGVtOiBURGF0YUl0ZW0sIGlkeDogbnVtYmVyKSB7XG5cdFx0dGhpcy5tb2RlbC5zZXRFZGl0S2V5KCdub25lJyk7XG5cblx0XHRpZiAodGhpcy5pc0l0ZW1OZXcob3JpZ2luYWxJdGVtKSkge1xuXHRcdFx0dGhpcy5fb25EaWRDaGFuZ2VMaXN0LmZpcmUoe1xuXHRcdFx0XHR0eXBlOiAnYWRkJyxcblx0XHRcdFx0bmV3SXRlbTogY2hhbmdlZEl0ZW0sXG5cdFx0XHRcdHRhcmdldEluZGV4OiBpZHgsXG5cdFx0XHR9KTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0dGhpcy5fb25EaWRDaGFuZ2VMaXN0LmZpcmUoe1xuXHRcdFx0XHR0eXBlOiAnY2hhbmdlJyxcblx0XHRcdFx0b3JpZ2luYWxJdGVtLFxuXHRcdFx0XHRuZXdJdGVtOiBjaGFuZ2VkSXRlbSxcblx0XHRcdFx0dGFyZ2V0SW5kZXg6IGlkeCxcblx0XHRcdH0pO1xuXHRcdH1cblxuXHRcdHRoaXMucmVuZGVyTGlzdCgpO1xuXHR9XG5cblx0cHJvdGVjdGVkIHJlbmRlckRhdGFPckVkaXRJdGVtKGl0ZW06IElMaXN0Vmlld0l0ZW08VERhdGFJdGVtPiwgaWR4OiBudW1iZXIsIGxpc3RGb2N1c2VkOiBib29sZWFuKTogSFRNTEVsZW1lbnQge1xuXHRcdGNvbnN0IHJvd0VsZW1lbnQgPSBpdGVtLmVkaXRpbmcgP1xuXHRcdFx0dGhpcy5yZW5kZXJFZGl0KGl0ZW0sIGlkeCkgOlxuXHRcdFx0dGhpcy5yZW5kZXJEYXRhSXRlbShpdGVtLCBpZHgsIGxpc3RGb2N1c2VkKTtcblxuXHRcdHJvd0VsZW1lbnQuc2V0QXR0cmlidXRlKCdyb2xlJywgJ2xpc3RpdGVtJyk7XG5cblx0XHRyZXR1cm4gcm93RWxlbWVudDtcblx0fVxuXG5cdHByaXZhdGUgcmVuZGVyRGF0YUl0ZW0oaXRlbTogSUxpc3RWaWV3SXRlbTxURGF0YUl0ZW0+LCBpZHg6IG51bWJlciwgbGlzdEZvY3VzZWQ6IGJvb2xlYW4pOiBIVE1MRWxlbWVudCB7XG5cdFx0Y29uc3Qgcm93RWxlbWVudEdyb3VwID0gdGhpcy5yZW5kZXJJdGVtKGl0ZW0sIGlkeCk7XG5cdFx0Y29uc3Qgcm93RWxlbWVudCA9IHJvd0VsZW1lbnRHcm91cC5yb3dFbGVtZW50O1xuXG5cdFx0cm93RWxlbWVudC5zZXRBdHRyaWJ1dGUoJ2RhdGEtaW5kZXgnLCBpZHggKyAnJyk7XG5cdFx0cm93RWxlbWVudC5zZXRBdHRyaWJ1dGUoJ3RhYmluZGV4JywgaXRlbS5zZWxlY3RlZCA/ICcwJyA6ICctMScpO1xuXHRcdHJvd0VsZW1lbnQuY2xhc3NMaXN0LnRvZ2dsZSgnc2VsZWN0ZWQnLCBpdGVtLnNlbGVjdGVkKTtcblxuXHRcdGNvbnN0IGFjdGlvbkJhciA9IG5ldyBBY3Rpb25CYXIocm93RWxlbWVudCk7XG5cdFx0dGhpcy5saXN0RGlzcG9zYWJsZXMuYWRkKGFjdGlvbkJhcik7XG5cblx0XHRhY3Rpb25CYXIucHVzaCh0aGlzLmdldEFjdGlvbnNGb3JJdGVtKGl0ZW0sIGlkeCksIHsgaWNvbjogdHJ1ZSwgbGFiZWw6IHRydWUgfSk7XG5cdFx0dGhpcy5hZGRUb29sdGlwc1RvUm93KHJvd0VsZW1lbnRHcm91cCwgaXRlbSk7XG5cblx0XHRpZiAoaXRlbS5zZWxlY3RlZCAmJiBsaXN0Rm9jdXNlZCkge1xuXHRcdFx0ZGlzcG9zYWJsZVRpbWVvdXQoKCkgPT4gcm93RWxlbWVudC5mb2N1cygpLCB1bmRlZmluZWQsIHRoaXMubGlzdERpc3Bvc2FibGVzKTtcblx0XHR9XG5cblx0XHR0aGlzLmxpc3REaXNwb3NhYmxlcy5hZGQoRE9NLmFkZERpc3Bvc2FibGVMaXN0ZW5lcihyb3dFbGVtZW50LCAnY2xpY2snLCAoZSkgPT4ge1xuXHRcdFx0Ly8gVGhlcmUgaXMgYSBwYXJlbnQgbGlzdCB3aWRnZXQsIHdoaWNoIGlzIHRoZSBvbmUgdGhhdCBob2xkcyB0aGUgbGlzdCBvZiBzZXR0aW5ncy5cblx0XHRcdC8vIFByZXZlbnQgdGhlIHBhcmVudCB3aWRnZXQgZnJvbSB0cnlpbmcgdG8gaW50ZXJwcmV0IHRoaXMgY2xpY2sgZXZlbnQuXG5cdFx0XHRlLnN0b3BQcm9wYWdhdGlvbigpO1xuXHRcdH0pKTtcblxuXHRcdHJldHVybiByb3dFbGVtZW50O1xuXHR9XG5cblx0cHJpdmF0ZSByZW5kZXJBZGRCdXR0b24oKTogSFRNTEVsZW1lbnQge1xuXHRcdGNvbnN0IHJvd0VsZW1lbnQgPSAkKCcuc2V0dGluZy1saXN0LW5ldy1yb3cnKTtcblxuXHRcdGNvbnN0IHN0YXJ0QWRkQnV0dG9uID0gdGhpcy5fcmVnaXN0ZXIobmV3IEJ1dHRvbihyb3dFbGVtZW50LCBkZWZhdWx0QnV0dG9uU3R5bGVzKSk7XG5cdFx0c3RhcnRBZGRCdXR0b24ubGFiZWwgPSB0aGlzLmdldExvY2FsaXplZFN0cmluZ3MoKS5hZGRCdXR0b25MYWJlbDtcblx0XHRzdGFydEFkZEJ1dHRvbi5lbGVtZW50LmNsYXNzTGlzdC5hZGQoJ3NldHRpbmctbGlzdC1hZGRCdXR0b24nKTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKHN0YXJ0QWRkQnV0dG9uLm9uRGlkQ2xpY2soKCkgPT4ge1xuXHRcdFx0dGhpcy5tb2RlbC5zZXRFZGl0S2V5KCdjcmVhdGUnKTtcblx0XHRcdHRoaXMucmVuZGVyTGlzdCgpO1xuXHRcdH0pKTtcblxuXHRcdHJldHVybiByb3dFbGVtZW50O1xuXHR9XG5cblx0cHJpdmF0ZSBvbkxpc3RDbGljayhlOiBQb2ludGVyRXZlbnQpOiB2b2lkIHtcblx0XHRjb25zdCB0YXJnZXRJZHggPSB0aGlzLmdldENsaWNrZWRJdGVtSW5kZXgoZSk7XG5cdFx0aWYgKHRhcmdldElkeCA8IDApIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRlLnByZXZlbnREZWZhdWx0KCk7XG5cdFx0ZS5zdG9wSW1tZWRpYXRlUHJvcGFnYXRpb24oKTtcblx0XHRpZiAodGhpcy5tb2RlbC5nZXRTZWxlY3RlZCgpID09PSB0YXJnZXRJZHgpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHR0aGlzLnNlbGVjdFJvdyh0YXJnZXRJZHgpO1xuXHR9XG5cblx0cHJpdmF0ZSBvbkxpc3REb3VibGVDbGljayhlOiBNb3VzZUV2ZW50KTogdm9pZCB7XG5cdFx0Y29uc3QgdGFyZ2V0SWR4ID0gdGhpcy5nZXRDbGlja2VkSXRlbUluZGV4KGUpO1xuXHRcdGlmICh0YXJnZXRJZHggPCAwKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0aWYgKHRoaXMuaXNSZWFkT25seSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IGl0ZW0gPSB0aGlzLm1vZGVsLml0ZW1zW3RhcmdldElkeF07XG5cdFx0aWYgKGl0ZW0pIHtcblx0XHRcdHRoaXMuZWRpdFNldHRpbmcodGFyZ2V0SWR4KTtcblx0XHRcdGUucHJldmVudERlZmF1bHQoKTtcblx0XHRcdGUuc3RvcFByb3BhZ2F0aW9uKCk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBnZXRDbGlja2VkSXRlbUluZGV4KGU6IE1vdXNlRXZlbnQpOiBudW1iZXIge1xuXHRcdGlmICghZS50YXJnZXQpIHtcblx0XHRcdHJldHVybiAtMTtcblx0XHR9XG5cblx0XHRjb25zdCBhY3Rpb25iYXIgPSBET00uZmluZFBhcmVudFdpdGhDbGFzcyhlLnRhcmdldCBhcyBIVE1MRWxlbWVudCwgJ21vbmFjby1hY3Rpb24tYmFyJyk7XG5cdFx0aWYgKGFjdGlvbmJhcikge1xuXHRcdFx0Ly8gRG9uJ3QgaGFuZGxlIGRvdWJsZWNsaWNrcyBpbnNpZGUgdGhlIGFjdGlvbiBiYXJcblx0XHRcdHJldHVybiAtMTtcblx0XHR9XG5cblx0XHRjb25zdCBlbGVtZW50ID0gRE9NLmZpbmRQYXJlbnRXaXRoQ2xhc3MoZS50YXJnZXQgYXMgSFRNTEVsZW1lbnQsICdzZXR0aW5nLWxpc3Qtcm93Jyk7XG5cdFx0aWYgKCFlbGVtZW50KSB7XG5cdFx0XHRyZXR1cm4gLTE7XG5cdFx0fVxuXG5cdFx0Y29uc3QgdGFyZ2V0SWR4U3RyID0gZWxlbWVudC5nZXRBdHRyaWJ1dGUoJ2RhdGEtaW5kZXgnKTtcblx0XHRpZiAoIXRhcmdldElkeFN0cikge1xuXHRcdFx0cmV0dXJuIC0xO1xuXHRcdH1cblxuXHRcdGNvbnN0IHRhcmdldElkeCA9IHBhcnNlSW50KHRhcmdldElkeFN0cik7XG5cdFx0cmV0dXJuIHRhcmdldElkeDtcblx0fVxuXG5cdHByaXZhdGUgc2VsZWN0Um93KGlkeDogbnVtYmVyKTogdm9pZCB7XG5cdFx0dGhpcy5tb2RlbC5zZWxlY3QoaWR4KTtcblx0XHR0aGlzLnJvd0VsZW1lbnRzLmZvckVhY2gocm93ID0+IHJvdy5jbGFzc0xpc3QucmVtb3ZlKCdzZWxlY3RlZCcpKTtcblxuXHRcdGNvbnN0IHNlbGVjdGVkUm93ID0gdGhpcy5yb3dFbGVtZW50c1t0aGlzLm1vZGVsLmdldFNlbGVjdGVkKCkhXTtcblxuXHRcdHNlbGVjdGVkUm93LmNsYXNzTGlzdC5hZGQoJ3NlbGVjdGVkJyk7XG5cdFx0c2VsZWN0ZWRSb3cuZm9jdXMoKTtcblx0fVxuXG5cdHByaXZhdGUgc2VsZWN0TmV4dFJvdygpOiB2b2lkIHtcblx0XHR0aGlzLm1vZGVsLnNlbGVjdE5leHQoKTtcblx0XHR0aGlzLnNlbGVjdFJvdyh0aGlzLm1vZGVsLmdldFNlbGVjdGVkKCkhKTtcblx0fVxuXG5cdHByaXZhdGUgc2VsZWN0UHJldmlvdXNSb3coKTogdm9pZCB7XG5cdFx0dGhpcy5tb2RlbC5zZWxlY3RQcmV2aW91cygpO1xuXHRcdHRoaXMuc2VsZWN0Um93KHRoaXMubW9kZWwuZ2V0U2VsZWN0ZWQoKSEpO1xuXHR9XG59XG5cbmludGVyZmFjZSBJTGlzdFNldFZhbHVlT3B0aW9ucyB7XG5cdHNob3dBZGRCdXR0b24/OiBib29sZWFuO1xuXHRrZXlTdWdnZXN0ZXI/OiBJT2JqZWN0S2V5U3VnZ2VzdGVyO1xuXHRpc1JlYWRPbmx5PzogYm9vbGVhbjtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBJTGlzdERhdGFJdGVtIHtcblx0dmFsdWU6IE9iamVjdEtleTtcblx0c2libGluZz86IHN0cmluZztcbn1cblxuaW50ZXJmYWNlIExpc3RTZXR0aW5nV2lkZ2V0RHJhZ0RldGFpbHM8VExpc3REYXRhSXRlbSBleHRlbmRzIElMaXN0RGF0YUl0ZW0+IHtcblx0ZWxlbWVudDogSFRNTEVsZW1lbnQ7XG5cdGl0ZW06IFRMaXN0RGF0YUl0ZW07XG5cdGl0ZW1JbmRleDogbnVtYmVyO1xufVxuXG5leHBvcnQgY2xhc3MgTGlzdFNldHRpbmdXaWRnZXQ8VExpc3REYXRhSXRlbSBleHRlbmRzIElMaXN0RGF0YUl0ZW0+IGV4dGVuZHMgQWJzdHJhY3RMaXN0U2V0dGluZ1dpZGdldDxUTGlzdERhdGFJdGVtPiB7XG5cdHByaXZhdGUga2V5VmFsdWVTdWdnZXN0ZXI6IElPYmplY3RLZXlTdWdnZXN0ZXIgfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgc2hvd0FkZEJ1dHRvbjogYm9vbGVhbiA9IHRydWU7XG5cdHByaXZhdGUgaXNFZGl0YWJsZTogYm9vbGVhbiA9IHRydWU7XG5cblx0b3ZlcnJpZGUgc2V0VmFsdWUobGlzdERhdGE6IFRMaXN0RGF0YUl0ZW1bXSwgb3B0aW9ucz86IElMaXN0U2V0VmFsdWVPcHRpb25zKSB7XG5cdFx0dGhpcy5rZXlWYWx1ZVN1Z2dlc3RlciA9IG9wdGlvbnM/LmtleVN1Z2dlc3Rlcjtcblx0XHR0aGlzLmlzRWRpdGFibGUgPSBvcHRpb25zPy5pc1JlYWRPbmx5ID09PSB1bmRlZmluZWQgPyB0cnVlIDogIW9wdGlvbnMuaXNSZWFkT25seTtcblx0XHR0aGlzLnNob3dBZGRCdXR0b24gPSB0aGlzLmlzRWRpdGFibGUgPyAob3B0aW9ucz8uc2hvd0FkZEJ1dHRvbiA/PyB0cnVlKSA6IGZhbHNlO1xuXHRcdHN1cGVyLnNldFZhbHVlKGxpc3REYXRhKTtcblx0fVxuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdGNvbnRhaW5lcjogSFRNTEVsZW1lbnQsXG5cdFx0QElUaGVtZVNlcnZpY2UgdGhlbWVTZXJ2aWNlOiBJVGhlbWVTZXJ2aWNlLFxuXHRcdEBJQ29udGV4dFZpZXdTZXJ2aWNlIGNvbnRleHRWaWV3U2VydmljZTogSUNvbnRleHRWaWV3U2VydmljZSxcblx0XHRASUhvdmVyU2VydmljZSBwcm90ZWN0ZWQgcmVhZG9ubHkgaG92ZXJTZXJ2aWNlOiBJSG92ZXJTZXJ2aWNlLFxuXHRcdEBJQ29uZmlndXJhdGlvblNlcnZpY2UgY29uZmlndXJhdGlvblNlcnZpY2U6IElDb25maWd1cmF0aW9uU2VydmljZSxcblx0KSB7XG5cdFx0c3VwZXIoY29udGFpbmVyLCB0aGVtZVNlcnZpY2UsIGNvbnRleHRWaWV3U2VydmljZSwgY29uZmlndXJhdGlvblNlcnZpY2UpO1xuXHR9XG5cblx0cHJvdGVjdGVkIGdldEVtcHR5SXRlbSgpOiBUTGlzdERhdGFJdGVtIHtcblx0XHQvLyBlc2xpbnQtZGlzYWJsZS1uZXh0LWxpbmUgbG9jYWwvY29kZS1uby1kYW5nZXJvdXMtdHlwZS1hc3NlcnRpb25zXG5cdFx0cmV0dXJuIHtcblx0XHRcdHZhbHVlOiB7XG5cdFx0XHRcdHR5cGU6ICdzdHJpbmcnLFxuXHRcdFx0XHRkYXRhOiAnJ1xuXHRcdFx0fVxuXHRcdH0gYXMgVExpc3REYXRhSXRlbTtcblx0fVxuXG5cdHByb3RlY3RlZCBvdmVycmlkZSBpc0FkZEJ1dHRvblZpc2libGUoKTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuIHRoaXMuc2hvd0FkZEJ1dHRvbjtcblx0fVxuXG5cdHByb3RlY3RlZCBnZXRDb250YWluZXJDbGFzc2VzKCk6IHN0cmluZ1tdIHtcblx0XHRyZXR1cm4gWydzZXR0aW5nLWxpc3Qtd2lkZ2V0J107XG5cdH1cblxuXHRwcm90ZWN0ZWQgZ2V0QWN0aW9uc0Zvckl0ZW0oaXRlbTogVExpc3REYXRhSXRlbSwgaWR4OiBudW1iZXIpOiBJQWN0aW9uW10ge1xuXHRcdGlmICh0aGlzLmlzUmVhZE9ubHkpIHtcblx0XHRcdHJldHVybiBbXTtcblx0XHR9XG5cdFx0cmV0dXJuIFtcblx0XHRcdHtcblx0XHRcdFx0Y2xhc3M6IFRoZW1lSWNvbi5hc0NsYXNzTmFtZShzZXR0aW5nc0VkaXRJY29uKSxcblx0XHRcdFx0ZW5hYmxlZDogdHJ1ZSxcblx0XHRcdFx0aWQ6ICd3b3JrYmVuY2guYWN0aW9uLmVkaXRMaXN0SXRlbScsXG5cdFx0XHRcdHRvb2x0aXA6IHRoaXMuZ2V0TG9jYWxpemVkU3RyaW5ncygpLmVkaXRBY3Rpb25Ub29sdGlwLFxuXHRcdFx0XHRydW46ICgpID0+IHRoaXMuZWRpdFNldHRpbmcoaWR4KVxuXHRcdFx0fSxcblx0XHRcdHtcblx0XHRcdFx0Y2xhc3M6IFRoZW1lSWNvbi5hc0NsYXNzTmFtZShzZXR0aW5nc1JlbW92ZUljb24pLFxuXHRcdFx0XHRlbmFibGVkOiB0cnVlLFxuXHRcdFx0XHRpZDogJ3dvcmtiZW5jaC5hY3Rpb24ucmVtb3ZlTGlzdEl0ZW0nLFxuXHRcdFx0XHR0b29sdGlwOiB0aGlzLmdldExvY2FsaXplZFN0cmluZ3MoKS5kZWxldGVBY3Rpb25Ub29sdGlwLFxuXHRcdFx0XHRydW46ICgpID0+IHRoaXMuX29uRGlkQ2hhbmdlTGlzdC5maXJlKHsgdHlwZTogJ3JlbW92ZScsIG9yaWdpbmFsSXRlbTogaXRlbSwgdGFyZ2V0SW5kZXg6IGlkeCB9KVxuXHRcdFx0fVxuXHRcdF0gYXMgSUFjdGlvbltdO1xuXHR9XG5cblx0cHJpdmF0ZSBkcmFnRGV0YWlsczogTGlzdFNldHRpbmdXaWRnZXREcmFnRGV0YWlsczxUTGlzdERhdGFJdGVtPiB8IHVuZGVmaW5lZDtcblxuXHRwcm90ZWN0ZWQgcmVuZGVySXRlbShpdGVtOiBUTGlzdERhdGFJdGVtLCBpZHg6IG51bWJlcik6IFJvd0VsZW1lbnRHcm91cCB7XG5cdFx0Y29uc3Qgcm93RWxlbWVudCA9ICQoJy5zZXR0aW5nLWxpc3Qtcm93Jyk7XG5cdFx0Y29uc3QgdmFsdWVFbGVtZW50ID0gRE9NLmFwcGVuZChyb3dFbGVtZW50LCAkKCcuc2V0dGluZy1saXN0LXZhbHVlJykpO1xuXHRcdGNvbnN0IHNpYmxpbmdFbGVtZW50ID0gRE9NLmFwcGVuZChyb3dFbGVtZW50LCAkKCcuc2V0dGluZy1saXN0LXNpYmxpbmcnKSk7XG5cblx0XHR2YWx1ZUVsZW1lbnQudGV4dENvbnRlbnQgPSBpdGVtLnZhbHVlLmRhdGEudG9TdHJpbmcoKTtcblx0XHRpZiAoaXRlbS5zaWJsaW5nKSB7XG5cdFx0XHRzaWJsaW5nRWxlbWVudC50ZXh0Q29udGVudCA9IGB3aGVuOiAke2l0ZW0uc2libGluZ31gO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRzaWJsaW5nRWxlbWVudC50ZXh0Q29udGVudCA9IG51bGw7XG5cdFx0XHR2YWx1ZUVsZW1lbnQuY2xhc3NMaXN0LmFkZCgnbm8tc2libGluZycpO1xuXHRcdH1cblxuXHRcdHRoaXMuYWRkRHJhZ0FuZERyb3Aocm93RWxlbWVudCwgaXRlbSwgaWR4KTtcblx0XHRyZXR1cm4geyByb3dFbGVtZW50LCBrZXlFbGVtZW50OiB2YWx1ZUVsZW1lbnQsIHZhbHVlRWxlbWVudDogc2libGluZ0VsZW1lbnQgfTtcblx0fVxuXG5cdHByb3RlY3RlZCBhZGREcmFnQW5kRHJvcChyb3dFbGVtZW50OiBIVE1MRWxlbWVudCwgaXRlbTogVExpc3REYXRhSXRlbSwgaWR4OiBudW1iZXIpIHtcblx0XHRpZiAodGhpcy5tb2RlbC5pdGVtcy5ldmVyeShpdGVtID0+ICFpdGVtLmVkaXRpbmcpKSB7XG5cdFx0XHRyb3dFbGVtZW50LmRyYWdnYWJsZSA9IHRydWU7XG5cdFx0XHRyb3dFbGVtZW50LmNsYXNzTGlzdC5hZGQoJ2RyYWdnYWJsZScpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRyb3dFbGVtZW50LmRyYWdnYWJsZSA9IGZhbHNlO1xuXHRcdFx0cm93RWxlbWVudC5jbGFzc0xpc3QucmVtb3ZlKCdkcmFnZ2FibGUnKTtcblx0XHR9XG5cblx0XHR0aGlzLmxpc3REaXNwb3NhYmxlcy5hZGQoRE9NLmFkZERpc3Bvc2FibGVMaXN0ZW5lcihyb3dFbGVtZW50LCBET00uRXZlbnRUeXBlLkRSQUdfU1RBUlQsIChldikgPT4ge1xuXHRcdFx0dGhpcy5kcmFnRGV0YWlscyA9IHtcblx0XHRcdFx0ZWxlbWVudDogcm93RWxlbWVudCxcblx0XHRcdFx0aXRlbSxcblx0XHRcdFx0aXRlbUluZGV4OiBpZHhcblx0XHRcdH07XG5cblx0XHRcdGFwcGx5RHJhZ0ltYWdlKGV2LCByb3dFbGVtZW50LCBpdGVtLnZhbHVlLmRhdGEpO1xuXHRcdH0pKTtcblx0XHR0aGlzLmxpc3REaXNwb3NhYmxlcy5hZGQoRE9NLmFkZERpc3Bvc2FibGVMaXN0ZW5lcihyb3dFbGVtZW50LCBET00uRXZlbnRUeXBlLkRSQUdfT1ZFUiwgKGV2KSA9PiB7XG5cdFx0XHRpZiAoIXRoaXMuZHJhZ0RldGFpbHMpIHtcblx0XHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdFx0fVxuXHRcdFx0ZXYucHJldmVudERlZmF1bHQoKTtcblx0XHRcdGlmIChldi5kYXRhVHJhbnNmZXIpIHtcblx0XHRcdFx0ZXYuZGF0YVRyYW5zZmVyLmRyb3BFZmZlY3QgPSAnbW92ZSc7XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHR9KSk7XG5cdFx0bGV0IGNvdW50ZXIgPSAwO1xuXHRcdHRoaXMubGlzdERpc3Bvc2FibGVzLmFkZChET00uYWRkRGlzcG9zYWJsZUxpc3RlbmVyKHJvd0VsZW1lbnQsIERPTS5FdmVudFR5cGUuRFJBR19FTlRFUiwgKGV2KSA9PiB7XG5cdFx0XHRjb3VudGVyKys7XG5cdFx0XHRyb3dFbGVtZW50LmNsYXNzTGlzdC5hZGQoJ2RyYWctaG92ZXInKTtcblx0XHR9KSk7XG5cdFx0dGhpcy5saXN0RGlzcG9zYWJsZXMuYWRkKERPTS5hZGREaXNwb3NhYmxlTGlzdGVuZXIocm93RWxlbWVudCwgRE9NLkV2ZW50VHlwZS5EUkFHX0xFQVZFLCAoZXYpID0+IHtcblx0XHRcdGNvdW50ZXItLTtcblx0XHRcdGlmICghY291bnRlcikge1xuXHRcdFx0XHRyb3dFbGVtZW50LmNsYXNzTGlzdC5yZW1vdmUoJ2RyYWctaG92ZXInKTtcblx0XHRcdH1cblx0XHR9KSk7XG5cdFx0dGhpcy5saXN0RGlzcG9zYWJsZXMuYWRkKERPTS5hZGREaXNwb3NhYmxlTGlzdGVuZXIocm93RWxlbWVudCwgRE9NLkV2ZW50VHlwZS5EUk9QLCAoZXYpID0+IHtcblx0XHRcdC8vIGNhbmNlbCB0aGUgb3AgaWYgd2UgZHJhZ2dlZCB0byBhIGNvbXBsZXRlbHkgZGlmZmVyZW50IHNldHRpbmdcblx0XHRcdGlmICghdGhpcy5kcmFnRGV0YWlscykge1xuXHRcdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0XHR9XG5cdFx0XHRldi5wcmV2ZW50RGVmYXVsdCgpO1xuXHRcdFx0Y291bnRlciA9IDA7XG5cdFx0XHRpZiAodGhpcy5kcmFnRGV0YWlscy5lbGVtZW50ICE9PSByb3dFbGVtZW50KSB7XG5cdFx0XHRcdHRoaXMuX29uRGlkQ2hhbmdlTGlzdC5maXJlKHtcblx0XHRcdFx0XHR0eXBlOiAnbW92ZScsXG5cdFx0XHRcdFx0b3JpZ2luYWxJdGVtOiB0aGlzLmRyYWdEZXRhaWxzLml0ZW0sXG5cdFx0XHRcdFx0c291cmNlSW5kZXg6IHRoaXMuZHJhZ0RldGFpbHMuaXRlbUluZGV4LFxuXHRcdFx0XHRcdG5ld0l0ZW06IGl0ZW0sXG5cdFx0XHRcdFx0dGFyZ2V0SW5kZXg6IGlkeFxuXHRcdFx0XHR9KTtcblx0XHRcdH1cblx0XHRcdHJldHVybiB0cnVlO1xuXHRcdH0pKTtcblx0XHR0aGlzLmxpc3REaXNwb3NhYmxlcy5hZGQoRE9NLmFkZERpc3Bvc2FibGVMaXN0ZW5lcihyb3dFbGVtZW50LCBET00uRXZlbnRUeXBlLkRSQUdfRU5ELCAoZXYpID0+IHtcblx0XHRcdGNvdW50ZXIgPSAwO1xuXHRcdFx0cm93RWxlbWVudC5jbGFzc0xpc3QucmVtb3ZlKCdkcmFnLWhvdmVyJyk7XG5cdFx0XHRldi5kYXRhVHJhbnNmZXI/LmNsZWFyRGF0YSgpO1xuXHRcdFx0aWYgKHRoaXMuZHJhZ0RldGFpbHMpIHtcblx0XHRcdFx0dGhpcy5kcmFnRGV0YWlscyA9IHVuZGVmaW5lZDtcblx0XHRcdH1cblx0XHR9KSk7XG5cdH1cblxuXHRwcm90ZWN0ZWQgcmVuZGVyRWRpdChpdGVtOiBUTGlzdERhdGFJdGVtLCBpZHg6IG51bWJlcik6IEhUTUxFbGVtZW50IHtcblx0XHRjb25zdCByb3dFbGVtZW50ID0gJCgnLnNldHRpbmctbGlzdC1lZGl0LXJvdycpO1xuXHRcdGxldCB2YWx1ZUlucHV0OiBJbnB1dEJveCB8IFNlbGVjdEJveDtcblx0XHRsZXQgY3VycmVudERpc3BsYXlWYWx1ZTogc3RyaW5nO1xuXHRcdGxldCBjdXJyZW50RW51bU9wdGlvbnM6IElPYmplY3RFbnVtT3B0aW9uW10gfCB1bmRlZmluZWQ7XG5cblx0XHRpZiAodGhpcy5rZXlWYWx1ZVN1Z2dlc3Rlcikge1xuXHRcdFx0Y29uc3QgZW51bURhdGEgPSB0aGlzLmtleVZhbHVlU3VnZ2VzdGVyKHRoaXMubW9kZWwuaXRlbXMubWFwKCh7IHZhbHVlOiB7IGRhdGEgfSB9KSA9PiBkYXRhKSwgaWR4KTtcblx0XHRcdGl0ZW0gPSB7XG5cdFx0XHRcdC4uLml0ZW0sXG5cdFx0XHRcdHZhbHVlOiB7XG5cdFx0XHRcdFx0dHlwZTogJ2VudW0nLFxuXHRcdFx0XHRcdGRhdGE6IGl0ZW0udmFsdWUuZGF0YSxcblx0XHRcdFx0XHRvcHRpb25zOiBlbnVtRGF0YSA/IGVudW1EYXRhLm9wdGlvbnMgOiBbXVxuXHRcdFx0XHR9XG5cdFx0XHR9O1xuXHRcdH1cblxuXHRcdHN3aXRjaCAoaXRlbS52YWx1ZS50eXBlKSB7XG5cdFx0XHRjYXNlICdzdHJpbmcnOlxuXHRcdFx0XHR2YWx1ZUlucHV0ID0gdGhpcy5yZW5kZXJJbnB1dEJveChpdGVtLnZhbHVlLCByb3dFbGVtZW50KTtcblx0XHRcdFx0YnJlYWs7XG5cdFx0XHRjYXNlICdlbnVtJzpcblx0XHRcdFx0dmFsdWVJbnB1dCA9IHRoaXMucmVuZGVyRHJvcGRvd24oaXRlbS52YWx1ZSwgcm93RWxlbWVudCk7XG5cdFx0XHRcdGN1cnJlbnRFbnVtT3B0aW9ucyA9IGl0ZW0udmFsdWUub3B0aW9ucztcblx0XHRcdFx0aWYgKGl0ZW0udmFsdWUub3B0aW9ucy5sZW5ndGgpIHtcblx0XHRcdFx0XHRjdXJyZW50RGlzcGxheVZhbHVlID0gdGhpcy5pc0l0ZW1OZXcoaXRlbSkgP1xuXHRcdFx0XHRcdFx0Y3VycmVudEVudW1PcHRpb25zWzBdLnZhbHVlIDogaXRlbS52YWx1ZS5kYXRhO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGJyZWFrO1xuXHRcdH1cblxuXHRcdGNvbnN0IHVwZGF0ZWRJbnB1dEJveEl0ZW0gPSAoKTogVExpc3REYXRhSXRlbSA9PiB7XG5cdFx0XHRjb25zdCBpbnB1dEJveCA9IHZhbHVlSW5wdXQgYXMgSW5wdXRCb3g7XG5cdFx0XHQvLyBlc2xpbnQtZGlzYWJsZS1uZXh0LWxpbmUgbG9jYWwvY29kZS1uby1kYW5nZXJvdXMtdHlwZS1hc3NlcnRpb25zXG5cdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHR2YWx1ZToge1xuXHRcdFx0XHRcdHR5cGU6ICdzdHJpbmcnLFxuXHRcdFx0XHRcdGRhdGE6IGlucHV0Qm94LnZhbHVlXG5cdFx0XHRcdH0sXG5cdFx0XHRcdHNpYmxpbmc6IHNpYmxpbmdJbnB1dD8udmFsdWVcblx0XHRcdH0gYXMgVExpc3REYXRhSXRlbTtcblx0XHR9O1xuXHRcdGNvbnN0IHVwZGF0ZWRTZWxlY3RCb3hJdGVtID0gKHNlbGVjdGVkVmFsdWU6IHN0cmluZyk6IFRMaXN0RGF0YUl0ZW0gPT4ge1xuXHRcdFx0Ly8gZXNsaW50LWRpc2FibGUtbmV4dC1saW5lIGxvY2FsL2NvZGUtbm8tZGFuZ2Vyb3VzLXR5cGUtYXNzZXJ0aW9uc1xuXHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0dmFsdWU6IHtcblx0XHRcdFx0XHR0eXBlOiAnZW51bScsXG5cdFx0XHRcdFx0ZGF0YTogc2VsZWN0ZWRWYWx1ZSxcblx0XHRcdFx0XHRvcHRpb25zOiBjdXJyZW50RW51bU9wdGlvbnMgPz8gW11cblx0XHRcdFx0fVxuXHRcdFx0fSBhcyBUTGlzdERhdGFJdGVtO1xuXHRcdH07XG5cdFx0Y29uc3Qgb25LZXlEb3duID0gKGU6IFN0YW5kYXJkS2V5Ym9hcmRFdmVudCkgPT4ge1xuXHRcdFx0aWYgKGUuZXF1YWxzKEtleUNvZGUuRW50ZXIpKSB7XG5cdFx0XHRcdHRoaXMuaGFuZGxlSXRlbUNoYW5nZShpdGVtLCB1cGRhdGVkSW5wdXRCb3hJdGVtKCksIGlkeCk7XG5cdFx0XHR9IGVsc2UgaWYgKGUuZXF1YWxzKEtleUNvZGUuRXNjYXBlKSkge1xuXHRcdFx0XHR0aGlzLmNhbmNlbEVkaXQoKTtcblx0XHRcdFx0ZS5wcmV2ZW50RGVmYXVsdCgpO1xuXHRcdFx0XHRlLnN0b3BQcm9wYWdhdGlvbigpO1xuXHRcdFx0fVxuXHRcdFx0cm93RWxlbWVudD8uZm9jdXMoKTtcblx0XHR9O1xuXG5cdFx0aWYgKGl0ZW0udmFsdWUudHlwZSAhPT0gJ3N0cmluZycpIHtcblx0XHRcdGNvbnN0IHNlbGVjdEJveCA9IHZhbHVlSW5wdXQgYXMgU2VsZWN0Qm94O1xuXHRcdFx0dGhpcy5saXN0RGlzcG9zYWJsZXMuYWRkKFxuXHRcdFx0XHRzZWxlY3RCb3gub25EaWRTZWxlY3QoKHsgc2VsZWN0ZWQgfSkgPT4ge1xuXHRcdFx0XHRcdGN1cnJlbnREaXNwbGF5VmFsdWUgPSBzZWxlY3RlZDtcblx0XHRcdFx0fSlcblx0XHRcdCk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdGNvbnN0IGlucHV0Qm94ID0gdmFsdWVJbnB1dCBhcyBJbnB1dEJveDtcblx0XHRcdHRoaXMubGlzdERpc3Bvc2FibGVzLmFkZChcblx0XHRcdFx0RE9NLmFkZFN0YW5kYXJkRGlzcG9zYWJsZUxpc3RlbmVyKGlucHV0Qm94LmlucHV0RWxlbWVudCwgRE9NLkV2ZW50VHlwZS5LRVlfRE9XTiwgb25LZXlEb3duKVxuXHRcdFx0KTtcblx0XHR9XG5cblx0XHRsZXQgc2libGluZ0lucHV0OiBJbnB1dEJveCB8IHVuZGVmaW5lZDtcblx0XHRpZiAoIWlzVW5kZWZpbmVkT3JOdWxsKGl0ZW0uc2libGluZykpIHtcblx0XHRcdHNpYmxpbmdJbnB1dCA9IG5ldyBJbnB1dEJveChyb3dFbGVtZW50LCB0aGlzLmNvbnRleHRWaWV3U2VydmljZSwge1xuXHRcdFx0XHRwbGFjZWhvbGRlcjogdGhpcy5nZXRMb2NhbGl6ZWRTdHJpbmdzKCkuc2libGluZ0lucHV0UGxhY2Vob2xkZXIsXG5cdFx0XHRcdGlucHV0Qm94U3R5bGVzOiBnZXRJbnB1dEJveFN0eWxlKHtcblx0XHRcdFx0XHRpbnB1dEJhY2tncm91bmQ6IHNldHRpbmdzVGV4dElucHV0QmFja2dyb3VuZCxcblx0XHRcdFx0XHRpbnB1dEZvcmVncm91bmQ6IHNldHRpbmdzVGV4dElucHV0Rm9yZWdyb3VuZCxcblx0XHRcdFx0XHRpbnB1dEJvcmRlcjogc2V0dGluZ3NUZXh0SW5wdXRCb3JkZXJcblx0XHRcdFx0fSlcblx0XHRcdH0pO1xuXHRcdFx0c2libGluZ0lucHV0LmVsZW1lbnQuY2xhc3NMaXN0LmFkZCgnc2V0dGluZy1saXN0LXNpYmxpbmdJbnB1dCcpO1xuXHRcdFx0dGhpcy5saXN0RGlzcG9zYWJsZXMuYWRkKHNpYmxpbmdJbnB1dCk7XG5cdFx0XHRzaWJsaW5nSW5wdXQudmFsdWUgPSBpdGVtLnNpYmxpbmc7XG5cblx0XHRcdHRoaXMubGlzdERpc3Bvc2FibGVzLmFkZChcblx0XHRcdFx0RE9NLmFkZFN0YW5kYXJkRGlzcG9zYWJsZUxpc3RlbmVyKHNpYmxpbmdJbnB1dC5pbnB1dEVsZW1lbnQsIERPTS5FdmVudFR5cGUuS0VZX0RPV04sIG9uS2V5RG93bilcblx0XHRcdCk7XG5cdFx0fSBlbHNlIGlmICh2YWx1ZUlucHV0IGluc3RhbmNlb2YgSW5wdXRCb3gpIHtcblx0XHRcdHZhbHVlSW5wdXQuZWxlbWVudC5jbGFzc0xpc3QuYWRkKCduby1zaWJsaW5nJyk7XG5cdFx0fVxuXG5cdFx0Y29uc3Qgb2tCdXR0b24gPSB0aGlzLmxpc3REaXNwb3NhYmxlcy5hZGQobmV3IEJ1dHRvbihyb3dFbGVtZW50LCBkZWZhdWx0QnV0dG9uU3R5bGVzKSk7XG5cdFx0b2tCdXR0b24ubGFiZWwgPSBsb2NhbGl6ZSgnb2tCdXR0b24nLCBcIk9LXCIpO1xuXHRcdG9rQnV0dG9uLmVsZW1lbnQuY2xhc3NMaXN0LmFkZCgnc2V0dGluZy1saXN0LW9rLWJ1dHRvbicpO1xuXG5cdFx0dGhpcy5saXN0RGlzcG9zYWJsZXMuYWRkKG9rQnV0dG9uLm9uRGlkQ2xpY2soKCkgPT4ge1xuXHRcdFx0aWYgKGl0ZW0udmFsdWUudHlwZSA9PT0gJ3N0cmluZycpIHtcblx0XHRcdFx0dGhpcy5oYW5kbGVJdGVtQ2hhbmdlKGl0ZW0sIHVwZGF0ZWRJbnB1dEJveEl0ZW0oKSwgaWR4KTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdHRoaXMuaGFuZGxlSXRlbUNoYW5nZShpdGVtLCB1cGRhdGVkU2VsZWN0Qm94SXRlbShjdXJyZW50RGlzcGxheVZhbHVlKSwgaWR4KTtcblx0XHRcdH1cblx0XHR9KSk7XG5cblx0XHRjb25zdCBjYW5jZWxCdXR0b24gPSB0aGlzLmxpc3REaXNwb3NhYmxlcy5hZGQobmV3IEJ1dHRvbihyb3dFbGVtZW50LCB7IHNlY29uZGFyeTogdHJ1ZSwgLi4uZGVmYXVsdEJ1dHRvblN0eWxlcyB9KSk7XG5cdFx0Y2FuY2VsQnV0dG9uLmxhYmVsID0gbG9jYWxpemUoJ2NhbmNlbEJ1dHRvbicsIFwiQ2FuY2VsXCIpO1xuXHRcdGNhbmNlbEJ1dHRvbi5lbGVtZW50LmNsYXNzTGlzdC5hZGQoJ3NldHRpbmctbGlzdC1jYW5jZWwtYnV0dG9uJyk7XG5cblx0XHR0aGlzLmxpc3REaXNwb3NhYmxlcy5hZGQoY2FuY2VsQnV0dG9uLm9uRGlkQ2xpY2soKCkgPT4gdGhpcy5jYW5jZWxFZGl0KCkpKTtcblxuXHRcdHRoaXMubGlzdERpc3Bvc2FibGVzLmFkZChcblx0XHRcdGRpc3Bvc2FibGVUaW1lb3V0KCgpID0+IHtcblx0XHRcdFx0dmFsdWVJbnB1dC5mb2N1cygpO1xuXHRcdFx0XHRpZiAodmFsdWVJbnB1dCBpbnN0YW5jZW9mIElucHV0Qm94KSB7XG5cdFx0XHRcdFx0dmFsdWVJbnB1dC5zZWxlY3QoKTtcblx0XHRcdFx0fVxuXHRcdFx0fSlcblx0XHQpO1xuXG5cdFx0cmV0dXJuIHJvd0VsZW1lbnQ7XG5cdH1cblxuXHRvdmVycmlkZSBpc0l0ZW1OZXcoaXRlbTogVExpc3REYXRhSXRlbSk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiBpdGVtLnZhbHVlLmRhdGEgPT09ICcnO1xuXHR9XG5cblx0cHJvdGVjdGVkIGFkZFRvb2x0aXBzVG9Sb3cocm93RWxlbWVudEdyb3VwOiBSb3dFbGVtZW50R3JvdXAsIHsgdmFsdWUsIHNpYmxpbmcgfTogVExpc3REYXRhSXRlbSkge1xuXHRcdGNvbnN0IHRpdGxlID0gaXNVbmRlZmluZWRPck51bGwoc2libGluZylcblx0XHRcdD8gbG9jYWxpemUoJ2xpc3RWYWx1ZUhpbnRMYWJlbCcsIFwiTGlzdCBpdGVtIGB7MH1gXCIsIHZhbHVlLmRhdGEpXG5cdFx0XHQ6IGxvY2FsaXplKCdsaXN0U2libGluZ0hpbnRMYWJlbCcsIFwiTGlzdCBpdGVtIGB7MH1gIHdpdGggc2libGluZyBgJHsxfWBcIiwgdmFsdWUuZGF0YSwgc2libGluZyk7XG5cblx0XHRjb25zdCB7IHJvd0VsZW1lbnQgfSA9IHJvd0VsZW1lbnRHcm91cDtcblx0XHR0aGlzLmxpc3REaXNwb3NhYmxlcy5hZGQodGhpcy5ob3ZlclNlcnZpY2Uuc2V0dXBEZWxheWVkSG92ZXIocm93RWxlbWVudCwgeyBjb250ZW50OiB0aXRsZSB9KSk7XG5cdFx0cm93RWxlbWVudC5zZXRBdHRyaWJ1dGUoJ2FyaWEtbGFiZWwnLCB0aXRsZSk7XG5cdH1cblxuXHRwcm90ZWN0ZWQgZ2V0TG9jYWxpemVkU3RyaW5ncygpIHtcblx0XHRyZXR1cm4ge1xuXHRcdFx0ZGVsZXRlQWN0aW9uVG9vbHRpcDogbG9jYWxpemUoJ3JlbW92ZUl0ZW0nLCBcIlJlbW92ZSBJdGVtXCIpLFxuXHRcdFx0ZWRpdEFjdGlvblRvb2x0aXA6IGxvY2FsaXplKCdlZGl0SXRlbScsIFwiRWRpdCBJdGVtXCIpLFxuXHRcdFx0YWRkQnV0dG9uTGFiZWw6IGxvY2FsaXplKCdhZGRJdGVtJywgXCJBZGQgSXRlbVwiKSxcblx0XHRcdGlucHV0UGxhY2Vob2xkZXI6IGxvY2FsaXplKCdpdGVtSW5wdXRQbGFjZWhvbGRlcicsIFwiSXRlbS4uLlwiKSxcblx0XHRcdHNpYmxpbmdJbnB1dFBsYWNlaG9sZGVyOiBsb2NhbGl6ZSgnbGlzdFNpYmxpbmdJbnB1dFBsYWNlaG9sZGVyJywgXCJTaWJsaW5nLi4uXCIpLFxuXHRcdH07XG5cdH1cblxuXHRwcml2YXRlIHJlbmRlcklucHV0Qm94KHZhbHVlOiBPYmplY3RWYWx1ZSwgcm93RWxlbWVudDogSFRNTEVsZW1lbnQpOiBJbnB1dEJveCB7XG5cdFx0Y29uc3QgdmFsdWVJbnB1dCA9IG5ldyBJbnB1dEJveChyb3dFbGVtZW50LCB0aGlzLmNvbnRleHRWaWV3U2VydmljZSwge1xuXHRcdFx0cGxhY2Vob2xkZXI6IHRoaXMuZ2V0TG9jYWxpemVkU3RyaW5ncygpLmlucHV0UGxhY2Vob2xkZXIsXG5cdFx0XHRpbnB1dEJveFN0eWxlczogZ2V0SW5wdXRCb3hTdHlsZSh7XG5cdFx0XHRcdGlucHV0QmFja2dyb3VuZDogc2V0dGluZ3NUZXh0SW5wdXRCYWNrZ3JvdW5kLFxuXHRcdFx0XHRpbnB1dEZvcmVncm91bmQ6IHNldHRpbmdzVGV4dElucHV0Rm9yZWdyb3VuZCxcblx0XHRcdFx0aW5wdXRCb3JkZXI6IHNldHRpbmdzVGV4dElucHV0Qm9yZGVyXG5cdFx0XHR9KVxuXHRcdH0pO1xuXG5cdFx0dmFsdWVJbnB1dC5lbGVtZW50LmNsYXNzTGlzdC5hZGQoJ3NldHRpbmctbGlzdC12YWx1ZUlucHV0Jyk7XG5cdFx0dGhpcy5saXN0RGlzcG9zYWJsZXMuYWRkKHZhbHVlSW5wdXQpO1xuXHRcdHZhbHVlSW5wdXQudmFsdWUgPSB2YWx1ZS5kYXRhLnRvU3RyaW5nKCk7XG5cblx0XHRyZXR1cm4gdmFsdWVJbnB1dDtcblx0fVxuXG5cdHByaXZhdGUgcmVuZGVyRHJvcGRvd24odmFsdWU6IE9iamVjdEtleSwgcm93RWxlbWVudDogSFRNTEVsZW1lbnQpOiBTZWxlY3RCb3gge1xuXHRcdGlmICh2YWx1ZS50eXBlICE9PSAnZW51bScpIHtcblx0XHRcdHRocm93IG5ldyBFcnJvcignVmFsdWV0eXBlIG11c3QgYmUgZW51bS4nKTtcblx0XHR9XG5cdFx0Y29uc3Qgc2VsZWN0Qm94ID0gdGhpcy5jcmVhdGVCYXNpY1NlbGVjdEJveCh2YWx1ZSk7XG5cblx0XHRjb25zdCB3cmFwcGVyID0gJCgnLnNldHRpbmctbGlzdC1vYmplY3QtbGlzdC1yb3cnKTtcblx0XHRzZWxlY3RCb3gucmVuZGVyKHdyYXBwZXIpO1xuXHRcdHJvd0VsZW1lbnQuYXBwZW5kQ2hpbGQod3JhcHBlcik7XG5cblx0XHRyZXR1cm4gc2VsZWN0Qm94O1xuXHR9XG59XG5cbmV4cG9ydCBjbGFzcyBFeGNsdWRlU2V0dGluZ1dpZGdldCBleHRlbmRzIExpc3RTZXR0aW5nV2lkZ2V0PElJbmNsdWRlRXhjbHVkZURhdGFJdGVtPiB7XG5cdHByb3RlY3RlZCBvdmVycmlkZSBnZXRDb250YWluZXJDbGFzc2VzKCkge1xuXHRcdHJldHVybiBbJ3NldHRpbmctbGlzdC1pbmNsdWRlLWV4Y2x1ZGUtd2lkZ2V0J107XG5cdH1cblxuXHRwcm90ZWN0ZWQgb3ZlcnJpZGUgYWRkRHJhZ0FuZERyb3Aocm93RWxlbWVudDogSFRNTEVsZW1lbnQsIGl0ZW06IElJbmNsdWRlRXhjbHVkZURhdGFJdGVtLCBpZHg6IG51bWJlcikge1xuXHRcdHJldHVybjtcblx0fVxuXG5cdHByb3RlY3RlZCBvdmVycmlkZSBhZGRUb29sdGlwc1RvUm93KHJvd0VsZW1lbnRHcm91cDogUm93RWxlbWVudEdyb3VwLCBpdGVtOiBJSW5jbHVkZUV4Y2x1ZGVEYXRhSXRlbSk6IHZvaWQge1xuXHRcdGxldCB0aXRsZSA9IGlzVW5kZWZpbmVkT3JOdWxsKGl0ZW0uc2libGluZylcblx0XHRcdD8gbG9jYWxpemUoJ2V4Y2x1ZGVQYXR0ZXJuSGludExhYmVsJywgXCJFeGNsdWRlIGZpbGVzIG1hdGNoaW5nIGB7MH1gXCIsIGl0ZW0udmFsdWUuZGF0YSlcblx0XHRcdDogbG9jYWxpemUoJ2V4Y2x1ZGVTaWJsaW5nSGludExhYmVsJywgXCJFeGNsdWRlIGZpbGVzIG1hdGNoaW5nIGB7MH1gLCBvbmx5IHdoZW4gYSBmaWxlIG1hdGNoaW5nIGB7MX1gIGlzIHByZXNlbnRcIiwgaXRlbS52YWx1ZS5kYXRhLCBpdGVtLnNpYmxpbmcpO1xuXG5cdFx0aWYgKGl0ZW0uc291cmNlKSB7XG5cdFx0XHR0aXRsZSArPSBsb2NhbGl6ZSgnZXhjbHVkZUluY2x1ZGVTb3VyY2UnLCBcIi4gRGVmYXVsdCB2YWx1ZSBwcm92aWRlZCBieSBgezB9YFwiLCBpdGVtLnNvdXJjZSk7XG5cdFx0fVxuXG5cdFx0Y29uc3QgbWFya2Rvd25UaXRsZSA9IG5ldyBNYXJrZG93blN0cmluZygpLmFwcGVuZE1hcmtkb3duKHRpdGxlKTtcblxuXHRcdGNvbnN0IHsgcm93RWxlbWVudCB9ID0gcm93RWxlbWVudEdyb3VwO1xuXHRcdHRoaXMubGlzdERpc3Bvc2FibGVzLmFkZCh0aGlzLmhvdmVyU2VydmljZS5zZXR1cERlbGF5ZWRIb3Zlcihyb3dFbGVtZW50LCB7IGNvbnRlbnQ6IG1hcmtkb3duVGl0bGUgfSkpO1xuXHRcdHJvd0VsZW1lbnQuc2V0QXR0cmlidXRlKCdhcmlhLWxhYmVsJywgdGl0bGUpO1xuXHR9XG5cblx0cHJvdGVjdGVkIG92ZXJyaWRlIGdldExvY2FsaXplZFN0cmluZ3MoKSB7XG5cdFx0cmV0dXJuIHtcblx0XHRcdGRlbGV0ZUFjdGlvblRvb2x0aXA6IGxvY2FsaXplKCdyZW1vdmVFeGNsdWRlSXRlbScsIFwiUmVtb3ZlIEV4Y2x1ZGUgSXRlbVwiKSxcblx0XHRcdGVkaXRBY3Rpb25Ub29sdGlwOiBsb2NhbGl6ZSgnZWRpdEV4Y2x1ZGVJdGVtJywgXCJFZGl0IEV4Y2x1ZGUgSXRlbVwiKSxcblx0XHRcdGFkZEJ1dHRvbkxhYmVsOiBsb2NhbGl6ZSgnYWRkUGF0dGVybicsIFwiQWRkIFBhdHRlcm5cIiksXG5cdFx0XHRpbnB1dFBsYWNlaG9sZGVyOiBsb2NhbGl6ZSgnZXhjbHVkZVBhdHRlcm5JbnB1dFBsYWNlaG9sZGVyJywgXCJFeGNsdWRlIFBhdHRlcm4uLi5cIiksXG5cdFx0XHRzaWJsaW5nSW5wdXRQbGFjZWhvbGRlcjogbG9jYWxpemUoJ2V4Y2x1ZGVTaWJsaW5nSW5wdXRQbGFjZWhvbGRlcicsIFwiV2hlbiBQYXR0ZXJuIElzIFByZXNlbnQuLi5cIiksXG5cdFx0fTtcblx0fVxufVxuXG5leHBvcnQgY2xhc3MgSW5jbHVkZVNldHRpbmdXaWRnZXQgZXh0ZW5kcyBMaXN0U2V0dGluZ1dpZGdldDxJSW5jbHVkZUV4Y2x1ZGVEYXRhSXRlbT4ge1xuXHRwcm90ZWN0ZWQgb3ZlcnJpZGUgZ2V0Q29udGFpbmVyQ2xhc3NlcygpIHtcblx0XHRyZXR1cm4gWydzZXR0aW5nLWxpc3QtaW5jbHVkZS1leGNsdWRlLXdpZGdldCddO1xuXHR9XG5cblx0cHJvdGVjdGVkIG92ZXJyaWRlIGFkZERyYWdBbmREcm9wKHJvd0VsZW1lbnQ6IEhUTUxFbGVtZW50LCBpdGVtOiBJSW5jbHVkZUV4Y2x1ZGVEYXRhSXRlbSwgaWR4OiBudW1iZXIpIHtcblx0XHRyZXR1cm47XG5cdH1cblxuXHRwcm90ZWN0ZWQgb3ZlcnJpZGUgYWRkVG9vbHRpcHNUb1Jvdyhyb3dFbGVtZW50R3JvdXA6IFJvd0VsZW1lbnRHcm91cCwgaXRlbTogSUluY2x1ZGVFeGNsdWRlRGF0YUl0ZW0pOiB2b2lkIHtcblx0XHRsZXQgdGl0bGUgPSBpc1VuZGVmaW5lZE9yTnVsbChpdGVtLnNpYmxpbmcpXG5cdFx0XHQ/IGxvY2FsaXplKCdpbmNsdWRlUGF0dGVybkhpbnRMYWJlbCcsIFwiSW5jbHVkZSBmaWxlcyBtYXRjaGluZyBgezB9YFwiLCBpdGVtLnZhbHVlLmRhdGEpXG5cdFx0XHQ6IGxvY2FsaXplKCdpbmNsdWRlU2libGluZ0hpbnRMYWJlbCcsIFwiSW5jbHVkZSBmaWxlcyBtYXRjaGluZyBgezB9YCwgb25seSB3aGVuIGEgZmlsZSBtYXRjaGluZyBgezF9YCBpcyBwcmVzZW50XCIsIGl0ZW0udmFsdWUuZGF0YSwgaXRlbS5zaWJsaW5nKTtcblxuXHRcdGlmIChpdGVtLnNvdXJjZSkge1xuXHRcdFx0dGl0bGUgKz0gbG9jYWxpemUoJ2V4Y2x1ZGVJbmNsdWRlU291cmNlJywgXCIuIERlZmF1bHQgdmFsdWUgcHJvdmlkZWQgYnkgYHswfWBcIiwgaXRlbS5zb3VyY2UpO1xuXHRcdH1cblxuXHRcdGNvbnN0IG1hcmtkb3duVGl0bGUgPSBuZXcgTWFya2Rvd25TdHJpbmcoKS5hcHBlbmRNYXJrZG93bih0aXRsZSk7XG5cblx0XHRjb25zdCB7IHJvd0VsZW1lbnQgfSA9IHJvd0VsZW1lbnRHcm91cDtcblx0XHR0aGlzLmxpc3REaXNwb3NhYmxlcy5hZGQodGhpcy5ob3ZlclNlcnZpY2Uuc2V0dXBEZWxheWVkSG92ZXIocm93RWxlbWVudCwgeyBjb250ZW50OiBtYXJrZG93blRpdGxlIH0pKTtcblx0XHRyb3dFbGVtZW50LnNldEF0dHJpYnV0ZSgnYXJpYS1sYWJlbCcsIHRpdGxlKTtcblx0fVxuXG5cdHByb3RlY3RlZCBvdmVycmlkZSBnZXRMb2NhbGl6ZWRTdHJpbmdzKCkge1xuXHRcdHJldHVybiB7XG5cdFx0XHRkZWxldGVBY3Rpb25Ub29sdGlwOiBsb2NhbGl6ZSgncmVtb3ZlSW5jbHVkZUl0ZW0nLCBcIlJlbW92ZSBJbmNsdWRlIEl0ZW1cIiksXG5cdFx0XHRlZGl0QWN0aW9uVG9vbHRpcDogbG9jYWxpemUoJ2VkaXRJbmNsdWRlSXRlbScsIFwiRWRpdCBJbmNsdWRlIEl0ZW1cIiksXG5cdFx0XHRhZGRCdXR0b25MYWJlbDogbG9jYWxpemUoJ2FkZFBhdHRlcm4nLCBcIkFkZCBQYXR0ZXJuXCIpLFxuXHRcdFx0aW5wdXRQbGFjZWhvbGRlcjogbG9jYWxpemUoJ2luY2x1ZGVQYXR0ZXJuSW5wdXRQbGFjZWhvbGRlcicsIFwiSW5jbHVkZSBQYXR0ZXJuLi4uXCIpLFxuXHRcdFx0c2libGluZ0lucHV0UGxhY2Vob2xkZXI6IGxvY2FsaXplKCdpbmNsdWRlU2libGluZ0lucHV0UGxhY2Vob2xkZXInLCBcIldoZW4gUGF0dGVybiBJcyBQcmVzZW50Li4uXCIpLFxuXHRcdH07XG5cdH1cbn1cblxuaW50ZXJmYWNlIElPYmplY3RTdHJpbmdEYXRhIHtcblx0dHlwZTogJ3N0cmluZyc7XG5cdGRhdGE6IHN0cmluZztcbn1cblxuZXhwb3J0IGludGVyZmFjZSBJT2JqZWN0RW51bU9wdGlvbiB7XG5cdHZhbHVlOiBzdHJpbmc7XG5cdGRlc2NyaXB0aW9uPzogc3RyaW5nO1xufVxuXG5pbnRlcmZhY2UgSU9iamVjdEVudW1EYXRhIHtcblx0dHlwZTogJ2VudW0nO1xuXHRkYXRhOiBzdHJpbmc7XG5cdG9wdGlvbnM6IElPYmplY3RFbnVtT3B0aW9uW107XG59XG5cbmludGVyZmFjZSBJT2JqZWN0Qm9vbERhdGEge1xuXHR0eXBlOiAnYm9vbGVhbic7XG5cdGRhdGE6IGJvb2xlYW47XG59XG5cbnR5cGUgT2JqZWN0S2V5ID0gSU9iamVjdFN0cmluZ0RhdGEgfCBJT2JqZWN0RW51bURhdGE7XG5leHBvcnQgdHlwZSBPYmplY3RWYWx1ZSA9IElPYmplY3RTdHJpbmdEYXRhIHwgSU9iamVjdEVudW1EYXRhIHwgSU9iamVjdEJvb2xEYXRhO1xudHlwZSBPYmplY3RXaWRnZXQgPSBJbnB1dEJveCB8IFNlbGVjdEJveDtcblxuZXhwb3J0IGludGVyZmFjZSBJT2JqZWN0RGF0YUl0ZW0ge1xuXHRrZXk6IE9iamVjdEtleTtcblx0dmFsdWU6IE9iamVjdFZhbHVlO1xuXHRrZXlEZXNjcmlwdGlvbj86IHN0cmluZztcblx0c291cmNlPzogc3RyaW5nO1xuXHRyZW1vdmFibGU6IGJvb2xlYW47XG5cdHJlc2V0YWJsZTogYm9vbGVhbjtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBJSW5jbHVkZUV4Y2x1ZGVEYXRhSXRlbSB7XG5cdHZhbHVlOiBPYmplY3RLZXk7XG5cdGVsZW1lbnRUeXBlOiBTZXR0aW5nVmFsdWVUeXBlO1xuXHRzaWJsaW5nPzogc3RyaW5nO1xuXHRzb3VyY2U/OiBzdHJpbmc7XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgSU9iamVjdFZhbHVlU3VnZ2VzdGVyIHtcblx0KGtleTogc3RyaW5nKTogT2JqZWN0VmFsdWUgfCB1bmRlZmluZWQ7XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgSU9iamVjdEtleVN1Z2dlc3RlciB7XG5cdChleGlzdGluZ0tleXM6IHN0cmluZ1tdLCBpZHg/OiBudW1iZXIpOiBJT2JqZWN0RW51bURhdGEgfCB1bmRlZmluZWQ7XG59XG5cbmludGVyZmFjZSBJT2JqZWN0U2V0VmFsdWVPcHRpb25zIHtcblx0c2V0dGluZ0tleTogc3RyaW5nO1xuXHRzaG93QWRkQnV0dG9uOiBib29sZWFuO1xuXHRpc1JlYWRPbmx5PzogYm9vbGVhbjtcblx0a2V5U3VnZ2VzdGVyPzogSU9iamVjdEtleVN1Z2dlc3Rlcjtcblx0dmFsdWVTdWdnZXN0ZXI/OiBJT2JqZWN0VmFsdWVTdWdnZXN0ZXI7XG5cdHByb3BlcnR5TmFtZXM/OiBJSlNPTlNjaGVtYTtcbn1cblxuaW50ZXJmYWNlIElPYmplY3RSZW5kZXJFZGl0V2lkZ2V0T3B0aW9ucyB7XG5cdGlzS2V5OiBib29sZWFuO1xuXHRpZHg6IG51bWJlcjtcblx0cmVhZG9ubHkgb3JpZ2luYWxJdGVtOiBJT2JqZWN0RGF0YUl0ZW07XG5cdHJlYWRvbmx5IGNoYW5nZWRJdGVtOiBJT2JqZWN0RGF0YUl0ZW07XG5cdHVwZGF0ZShrZXlPclZhbHVlOiBPYmplY3RLZXkgfCBPYmplY3RWYWx1ZSk6IHZvaWQ7XG59XG5cbmV4cG9ydCBjbGFzcyBPYmplY3RTZXR0aW5nRHJvcGRvd25XaWRnZXQgZXh0ZW5kcyBBYnN0cmFjdExpc3RTZXR0aW5nV2lkZ2V0PElPYmplY3REYXRhSXRlbT4ge1xuXHRwcml2YXRlIGVkaXRhYmxlOiBib29sZWFuID0gdHJ1ZTtcblx0cHJpdmF0ZSBjdXJyZW50U2V0dGluZ0tleTogc3RyaW5nID0gJyc7XG5cdHByaXZhdGUgc2hvd0FkZEJ1dHRvbjogYm9vbGVhbiA9IHRydWU7XG5cdHByaXZhdGUga2V5U3VnZ2VzdGVyOiBJT2JqZWN0S2V5U3VnZ2VzdGVyID0gKCkgPT4gdW5kZWZpbmVkO1xuXHRwcml2YXRlIHZhbHVlU3VnZ2VzdGVyOiBJT2JqZWN0VmFsdWVTdWdnZXN0ZXIgPSAoKSA9PiB1bmRlZmluZWQ7XG5cdHByaXZhdGUgcHJvcGVydHlOYW1lczogSUpTT05TY2hlbWEgfCB1bmRlZmluZWQ7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0Y29udGFpbmVyOiBIVE1MRWxlbWVudCxcblx0XHRASVRoZW1lU2VydmljZSB0aGVtZVNlcnZpY2U6IElUaGVtZVNlcnZpY2UsXG5cdFx0QElDb250ZXh0Vmlld1NlcnZpY2UgY29udGV4dFZpZXdTZXJ2aWNlOiBJQ29udGV4dFZpZXdTZXJ2aWNlLFxuXHRcdEBJSG92ZXJTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgaG92ZXJTZXJ2aWNlOiBJSG92ZXJTZXJ2aWNlLFxuXHRcdEBJQ29uZmlndXJhdGlvblNlcnZpY2UgY29uZmlndXJhdGlvblNlcnZpY2U6IElDb25maWd1cmF0aW9uU2VydmljZSxcblx0KSB7XG5cdFx0c3VwZXIoY29udGFpbmVyLCB0aGVtZVNlcnZpY2UsIGNvbnRleHRWaWV3U2VydmljZSwgY29uZmlndXJhdGlvblNlcnZpY2UpO1xuXHR9XG5cblx0b3ZlcnJpZGUgc2V0VmFsdWUobGlzdERhdGE6IElPYmplY3REYXRhSXRlbVtdLCBvcHRpb25zPzogSU9iamVjdFNldFZhbHVlT3B0aW9ucyk6IHZvaWQge1xuXHRcdHRoaXMuZWRpdGFibGUgPSAhb3B0aW9ucz8uaXNSZWFkT25seTtcblx0XHR0aGlzLnNob3dBZGRCdXR0b24gPSBvcHRpb25zPy5zaG93QWRkQnV0dG9uID8/IHRoaXMuc2hvd0FkZEJ1dHRvbjtcblx0XHR0aGlzLmtleVN1Z2dlc3RlciA9IG9wdGlvbnM/LmtleVN1Z2dlc3RlciA/PyB0aGlzLmtleVN1Z2dlc3Rlcjtcblx0XHR0aGlzLnZhbHVlU3VnZ2VzdGVyID0gb3B0aW9ucz8udmFsdWVTdWdnZXN0ZXIgPz8gdGhpcy52YWx1ZVN1Z2dlc3Rlcjtcblx0XHR0aGlzLnByb3BlcnR5TmFtZXMgPSBvcHRpb25zPy5wcm9wZXJ0eU5hbWVzO1xuXG5cdFx0aWYgKGlzRGVmaW5lZChvcHRpb25zKSAmJiBvcHRpb25zLnNldHRpbmdLZXkgIT09IHRoaXMuY3VycmVudFNldHRpbmdLZXkpIHtcblx0XHRcdHRoaXMubW9kZWwuc2V0RWRpdEtleSgnbm9uZScpO1xuXHRcdFx0dGhpcy5tb2RlbC5zZWxlY3QobnVsbCk7XG5cdFx0XHR0aGlzLmN1cnJlbnRTZXR0aW5nS2V5ID0gb3B0aW9ucy5zZXR0aW5nS2V5O1xuXHRcdH1cblxuXHRcdHN1cGVyLnNldFZhbHVlKGxpc3REYXRhKTtcblx0fVxuXG5cdG92ZXJyaWRlIGlzSXRlbU5ldyhpdGVtOiBJT2JqZWN0RGF0YUl0ZW0pOiBib29sZWFuIHtcblx0XHRyZXR1cm4gaXRlbS5rZXkuZGF0YSA9PT0gJycgJiYgaXRlbS52YWx1ZS5kYXRhID09PSAnJztcblx0fVxuXG5cdHByb3RlY3RlZCBvdmVycmlkZSBpc0FkZEJ1dHRvblZpc2libGUoKTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuIHRoaXMuc2hvd0FkZEJ1dHRvbjtcblx0fVxuXG5cdHByb3RlY3RlZCBvdmVycmlkZSBnZXQgaXNSZWFkT25seSgpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gIXRoaXMuZWRpdGFibGU7XG5cdH1cblxuXHRwcm90ZWN0ZWQgZ2V0RW1wdHlJdGVtKCk6IElPYmplY3REYXRhSXRlbSB7XG5cdFx0cmV0dXJuIHtcblx0XHRcdGtleTogeyB0eXBlOiAnc3RyaW5nJywgZGF0YTogJycgfSxcblx0XHRcdHZhbHVlOiB7IHR5cGU6ICdzdHJpbmcnLCBkYXRhOiAnJyB9LFxuXHRcdFx0cmVtb3ZhYmxlOiB0cnVlLFxuXHRcdFx0cmVzZXRhYmxlOiBmYWxzZVxuXHRcdH07XG5cdH1cblxuXHRwcm90ZWN0ZWQgZ2V0Q29udGFpbmVyQ2xhc3NlcygpIHtcblx0XHRyZXR1cm4gWydzZXR0aW5nLWxpc3Qtb2JqZWN0LXdpZGdldCddO1xuXHR9XG5cblx0cHJvdGVjdGVkIGdldEFjdGlvbnNGb3JJdGVtKGl0ZW06IElPYmplY3REYXRhSXRlbSwgaWR4OiBudW1iZXIpOiBJQWN0aW9uW10ge1xuXHRcdGlmICh0aGlzLmlzUmVhZE9ubHkpIHtcblx0XHRcdHJldHVybiBbXTtcblx0XHR9XG5cblx0XHRjb25zdCBhY3Rpb25zOiBJQWN0aW9uW10gPSBbXG5cdFx0XHR7XG5cdFx0XHRcdGNsYXNzOiBUaGVtZUljb24uYXNDbGFzc05hbWUoc2V0dGluZ3NFZGl0SWNvbiksXG5cdFx0XHRcdGVuYWJsZWQ6IHRydWUsXG5cdFx0XHRcdGlkOiAnd29ya2JlbmNoLmFjdGlvbi5lZGl0TGlzdEl0ZW0nLFxuXHRcdFx0XHRsYWJlbDogJycsXG5cdFx0XHRcdHRvb2x0aXA6IHRoaXMuZ2V0TG9jYWxpemVkU3RyaW5ncygpLmVkaXRBY3Rpb25Ub29sdGlwLFxuXHRcdFx0XHRydW46ICgpID0+IHRoaXMuZWRpdFNldHRpbmcoaWR4KVxuXHRcdFx0fSxcblx0XHRdO1xuXG5cdFx0aWYgKGl0ZW0ucmVzZXRhYmxlKSB7XG5cdFx0XHRhY3Rpb25zLnB1c2goe1xuXHRcdFx0XHRjbGFzczogVGhlbWVJY29uLmFzQ2xhc3NOYW1lKHNldHRpbmdzRGlzY2FyZEljb24pLFxuXHRcdFx0XHRlbmFibGVkOiB0cnVlLFxuXHRcdFx0XHRpZDogJ3dvcmtiZW5jaC5hY3Rpb24ucmVzZXRMaXN0SXRlbScsXG5cdFx0XHRcdGxhYmVsOiAnJyxcblx0XHRcdFx0dG9vbHRpcDogdGhpcy5nZXRMb2NhbGl6ZWRTdHJpbmdzKCkucmVzZXRBY3Rpb25Ub29sdGlwLFxuXHRcdFx0XHRydW46ICgpID0+IHRoaXMuX29uRGlkQ2hhbmdlTGlzdC5maXJlKHsgdHlwZTogJ3Jlc2V0Jywgb3JpZ2luYWxJdGVtOiBpdGVtLCB0YXJnZXRJbmRleDogaWR4IH0pXG5cdFx0XHR9KTtcblx0XHR9XG5cblx0XHRpZiAoaXRlbS5yZW1vdmFibGUpIHtcblx0XHRcdGFjdGlvbnMucHVzaCh7XG5cdFx0XHRcdGNsYXNzOiBUaGVtZUljb24uYXNDbGFzc05hbWUoc2V0dGluZ3NSZW1vdmVJY29uKSxcblx0XHRcdFx0ZW5hYmxlZDogdHJ1ZSxcblx0XHRcdFx0aWQ6ICd3b3JrYmVuY2guYWN0aW9uLnJlbW92ZUxpc3RJdGVtJyxcblx0XHRcdFx0bGFiZWw6ICcnLFxuXHRcdFx0XHR0b29sdGlwOiB0aGlzLmdldExvY2FsaXplZFN0cmluZ3MoKS5kZWxldGVBY3Rpb25Ub29sdGlwLFxuXHRcdFx0XHRydW46ICgpID0+IHRoaXMuX29uRGlkQ2hhbmdlTGlzdC5maXJlKHsgdHlwZTogJ3JlbW92ZScsIG9yaWdpbmFsSXRlbTogaXRlbSwgdGFyZ2V0SW5kZXg6IGlkeCB9KVxuXHRcdFx0fSk7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIGFjdGlvbnM7XG5cdH1cblxuXHRwcm90ZWN0ZWQgb3ZlcnJpZGUgcmVuZGVySGVhZGVyKCkge1xuXHRcdGNvbnN0IGhlYWRlciA9ICQoJy5zZXR0aW5nLWxpc3Qtcm93LWhlYWRlcicpO1xuXHRcdGNvbnN0IGtleUhlYWRlciA9IERPTS5hcHBlbmQoaGVhZGVyLCAkKCcuc2V0dGluZy1saXN0LW9iamVjdC1rZXknKSk7XG5cdFx0Y29uc3QgdmFsdWVIZWFkZXIgPSBET00uYXBwZW5kKGhlYWRlciwgJCgnLnNldHRpbmctbGlzdC1vYmplY3QtdmFsdWUnKSk7XG5cdFx0Y29uc3QgeyBrZXlIZWFkZXJUZXh0LCB2YWx1ZUhlYWRlclRleHQgfSA9IHRoaXMuZ2V0TG9jYWxpemVkU3RyaW5ncygpO1xuXG5cdFx0a2V5SGVhZGVyLnRleHRDb250ZW50ID0ga2V5SGVhZGVyVGV4dDtcblx0XHR2YWx1ZUhlYWRlci50ZXh0Q29udGVudCA9IHZhbHVlSGVhZGVyVGV4dDtcblxuXHRcdHJldHVybiBoZWFkZXI7XG5cdH1cblxuXHRwcm90ZWN0ZWQgcmVuZGVySXRlbShpdGVtOiBJT2JqZWN0RGF0YUl0ZW0sIGlkeDogbnVtYmVyKTogUm93RWxlbWVudEdyb3VwIHtcblx0XHRjb25zdCByb3dFbGVtZW50ID0gJCgnLnNldHRpbmctbGlzdC1yb3cnKTtcblx0XHRyb3dFbGVtZW50LmNsYXNzTGlzdC5hZGQoJ3NldHRpbmctbGlzdC1vYmplY3Qtcm93Jyk7XG5cblx0XHQvLyBNYXJrIHJvdyBhcyBpbnZhbGlkIGlmIHRoZSBrZXkgZG9lc24ndCBtYXRjaCBwcm9wZXJ0eU5hbWVzLnBhdHRlcm5cblx0XHRpZiAodGhpcy5wcm9wZXJ0eU5hbWVzICYmIGl0ZW0ua2V5LmRhdGEgJiYgIXZhbGlkYXRlUHJvcGVydHlOYW1lKHRoaXMucHJvcGVydHlOYW1lcywgaXRlbS5rZXkuZGF0YSkpIHtcblx0XHRcdHJvd0VsZW1lbnQuY2xhc3NMaXN0LmFkZCgnaW52YWxpZC1rZXknKTtcblx0XHR9XG5cblx0XHRjb25zdCBrZXlFbGVtZW50ID0gRE9NLmFwcGVuZChyb3dFbGVtZW50LCAkKCcuc2V0dGluZy1saXN0LW9iamVjdC1rZXknKSk7XG5cdFx0Y29uc3QgdmFsdWVFbGVtZW50ID0gRE9NLmFwcGVuZChyb3dFbGVtZW50LCAkKCcuc2V0dGluZy1saXN0LW9iamVjdC12YWx1ZScpKTtcblxuXHRcdGtleUVsZW1lbnQudGV4dENvbnRlbnQgPSBpdGVtLmtleS5kYXRhO1xuXHRcdHZhbHVlRWxlbWVudC50ZXh0Q29udGVudCA9IGl0ZW0udmFsdWUuZGF0YS50b1N0cmluZygpO1xuXG5cdFx0cmV0dXJuIHsgcm93RWxlbWVudCwga2V5RWxlbWVudCwgdmFsdWVFbGVtZW50IH07XG5cdH1cblxuXHRwcm90ZWN0ZWQgcmVuZGVyRWRpdChpdGVtOiBJT2JqZWN0RGF0YUl0ZW0sIGlkeDogbnVtYmVyKTogSFRNTEVsZW1lbnQge1xuXHRcdGNvbnN0IHJvd0VsZW1lbnQgPSAkKCcuc2V0dGluZy1saXN0LWVkaXQtcm93LnNldHRpbmctbGlzdC1vYmplY3Qtcm93Jyk7XG5cblx0XHRjb25zdCBjaGFuZ2VkSXRlbSA9IHsgLi4uaXRlbSB9O1xuXHRcdGNvbnN0IG9uS2V5Q2hhbmdlID0gKGtleTogT2JqZWN0S2V5KSA9PiB7XG5cdFx0XHRjaGFuZ2VkSXRlbS5rZXkgPSBrZXk7XG5cdFx0XHRva0J1dHRvbi5lbmFibGVkID0ga2V5LmRhdGEgIT09ICcnO1xuXG5cdFx0XHRjb25zdCBzdWdnZXN0ZWRWYWx1ZSA9IHRoaXMudmFsdWVTdWdnZXN0ZXIoa2V5LmRhdGEpID8/IGl0ZW0udmFsdWU7XG5cblx0XHRcdGlmICh0aGlzLnNob3VsZFVzZVN1Z2dlc3Rpb24oaXRlbS52YWx1ZSwgY2hhbmdlZEl0ZW0udmFsdWUsIHN1Z2dlc3RlZFZhbHVlKSkge1xuXHRcdFx0XHRvblZhbHVlQ2hhbmdlKHN1Z2dlc3RlZFZhbHVlKTtcblx0XHRcdFx0cmVuZGVyTGF0ZXN0VmFsdWUoKTtcblx0XHRcdH1cblx0XHR9O1xuXHRcdGNvbnN0IG9uVmFsdWVDaGFuZ2UgPSAodmFsdWU6IE9iamVjdFZhbHVlKSA9PiB7XG5cdFx0XHRjaGFuZ2VkSXRlbS52YWx1ZSA9IHZhbHVlO1xuXHRcdH07XG5cblx0XHRsZXQga2V5V2lkZ2V0OiBPYmplY3RXaWRnZXQgfCB1bmRlZmluZWQ7XG5cdFx0bGV0IGtleUVsZW1lbnQ6IEhUTUxFbGVtZW50O1xuXG5cdFx0aWYgKHRoaXMuc2hvd0FkZEJ1dHRvbikge1xuXHRcdFx0aWYgKHRoaXMuaXNJdGVtTmV3KGl0ZW0pKSB7XG5cdFx0XHRcdGNvbnN0IHN1Z2dlc3RlZEtleSA9IHRoaXMua2V5U3VnZ2VzdGVyKHRoaXMubW9kZWwuaXRlbXMubWFwKCh7IGtleTogeyBkYXRhIH0gfSkgPT4gZGF0YSkpO1xuXG5cdFx0XHRcdGlmIChpc0RlZmluZWQoc3VnZ2VzdGVkS2V5KSkge1xuXHRcdFx0XHRcdGNoYW5nZWRJdGVtLmtleSA9IHN1Z2dlc3RlZEtleTtcblx0XHRcdFx0XHRjb25zdCBzdWdnZXN0ZWRWYWx1ZSA9IHRoaXMudmFsdWVTdWdnZXN0ZXIoY2hhbmdlZEl0ZW0ua2V5LmRhdGEpO1xuXHRcdFx0XHRcdG9uVmFsdWVDaGFuZ2Uoc3VnZ2VzdGVkVmFsdWUgPz8gY2hhbmdlZEl0ZW0udmFsdWUpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cblx0XHRcdGNvbnN0IHsgd2lkZ2V0LCBlbGVtZW50IH0gPSB0aGlzLnJlbmRlckVkaXRXaWRnZXQoY2hhbmdlZEl0ZW0ua2V5LCB7XG5cdFx0XHRcdGlkeCxcblx0XHRcdFx0aXNLZXk6IHRydWUsXG5cdFx0XHRcdG9yaWdpbmFsSXRlbTogaXRlbSxcblx0XHRcdFx0Y2hhbmdlZEl0ZW0sXG5cdFx0XHRcdHVwZGF0ZTogb25LZXlDaGFuZ2UsXG5cdFx0XHR9KTtcblx0XHRcdGtleVdpZGdldCA9IHdpZGdldDtcblx0XHRcdGtleUVsZW1lbnQgPSBlbGVtZW50O1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRrZXlFbGVtZW50ID0gJCgnLnNldHRpbmctbGlzdC1vYmplY3Qta2V5Jyk7XG5cdFx0XHRrZXlFbGVtZW50LnRleHRDb250ZW50ID0gaXRlbS5rZXkuZGF0YTtcblx0XHR9XG5cblx0XHRsZXQgdmFsdWVXaWRnZXQ6IE9iamVjdFdpZGdldDtcblx0XHRjb25zdCB2YWx1ZUNvbnRhaW5lciA9ICQoJy5zZXR0aW5nLWxpc3Qtb2JqZWN0LXZhbHVlLWNvbnRhaW5lcicpO1xuXG5cdFx0Y29uc3QgcmVuZGVyTGF0ZXN0VmFsdWUgPSAoKSA9PiB7XG5cdFx0XHRjb25zdCB7IHdpZGdldCwgZWxlbWVudCB9ID0gdGhpcy5yZW5kZXJFZGl0V2lkZ2V0KGNoYW5nZWRJdGVtLnZhbHVlLCB7XG5cdFx0XHRcdGlkeCxcblx0XHRcdFx0aXNLZXk6IGZhbHNlLFxuXHRcdFx0XHRvcmlnaW5hbEl0ZW06IGl0ZW0sXG5cdFx0XHRcdGNoYW5nZWRJdGVtLFxuXHRcdFx0XHR1cGRhdGU6IG9uVmFsdWVDaGFuZ2UsXG5cdFx0XHR9KTtcblxuXHRcdFx0dmFsdWVXaWRnZXQgPSB3aWRnZXQ7XG5cblx0XHRcdERPTS5jbGVhck5vZGUodmFsdWVDb250YWluZXIpO1xuXHRcdFx0dmFsdWVDb250YWluZXIuYXBwZW5kKGVsZW1lbnQpO1xuXHRcdH07XG5cblx0XHRyZW5kZXJMYXRlc3RWYWx1ZSgpO1xuXG5cdFx0cm93RWxlbWVudC5hcHBlbmQoa2V5RWxlbWVudCwgdmFsdWVDb250YWluZXIpO1xuXG5cdFx0Y29uc3Qgb2tCdXR0b24gPSB0aGlzLmxpc3REaXNwb3NhYmxlcy5hZGQobmV3IEJ1dHRvbihyb3dFbGVtZW50LCBkZWZhdWx0QnV0dG9uU3R5bGVzKSk7XG5cdFx0b2tCdXR0b24uZW5hYmxlZCA9IGNoYW5nZWRJdGVtLmtleS5kYXRhICE9PSAnJztcblx0XHRva0J1dHRvbi5sYWJlbCA9IGxvY2FsaXplKCdva0J1dHRvbicsIFwiT0tcIik7XG5cdFx0b2tCdXR0b24uZWxlbWVudC5jbGFzc0xpc3QuYWRkKCdzZXR0aW5nLWxpc3Qtb2stYnV0dG9uJyk7XG5cblx0XHR0aGlzLmxpc3REaXNwb3NhYmxlcy5hZGQob2tCdXR0b24ub25EaWRDbGljaygoKSA9PiB0aGlzLmhhbmRsZUl0ZW1DaGFuZ2UoaXRlbSwgY2hhbmdlZEl0ZW0sIGlkeCkpKTtcblxuXHRcdGNvbnN0IGNhbmNlbEJ1dHRvbiA9IHRoaXMubGlzdERpc3Bvc2FibGVzLmFkZChuZXcgQnV0dG9uKHJvd0VsZW1lbnQsIHsgc2Vjb25kYXJ5OiB0cnVlLCAuLi5kZWZhdWx0QnV0dG9uU3R5bGVzIH0pKTtcblx0XHRjYW5jZWxCdXR0b24ubGFiZWwgPSBsb2NhbGl6ZSgnY2FuY2VsQnV0dG9uJywgXCJDYW5jZWxcIik7XG5cdFx0Y2FuY2VsQnV0dG9uLmVsZW1lbnQuY2xhc3NMaXN0LmFkZCgnc2V0dGluZy1saXN0LWNhbmNlbC1idXR0b24nKTtcblxuXHRcdHRoaXMubGlzdERpc3Bvc2FibGVzLmFkZChjYW5jZWxCdXR0b24ub25EaWRDbGljaygoKSA9PiB0aGlzLmNhbmNlbEVkaXQoKSkpO1xuXG5cdFx0dGhpcy5saXN0RGlzcG9zYWJsZXMuYWRkKFxuXHRcdFx0ZGlzcG9zYWJsZVRpbWVvdXQoKCkgPT4ge1xuXHRcdFx0XHRjb25zdCB3aWRnZXQgPSBrZXlXaWRnZXQgPz8gdmFsdWVXaWRnZXQ7XG5cblx0XHRcdFx0d2lkZ2V0LmZvY3VzKCk7XG5cblx0XHRcdFx0aWYgKHdpZGdldCBpbnN0YW5jZW9mIElucHV0Qm94KSB7XG5cdFx0XHRcdFx0d2lkZ2V0LnNlbGVjdCgpO1xuXHRcdFx0XHR9XG5cdFx0XHR9KVxuXHRcdCk7XG5cblx0XHRyZXR1cm4gcm93RWxlbWVudDtcblx0fVxuXG5cdHByaXZhdGUgcmVuZGVyRWRpdFdpZGdldChcblx0XHRrZXlPclZhbHVlOiBPYmplY3RLZXkgfCBPYmplY3RWYWx1ZSxcblx0XHRvcHRpb25zOiBJT2JqZWN0UmVuZGVyRWRpdFdpZGdldE9wdGlvbnMsXG5cdCkge1xuXHRcdHN3aXRjaCAoa2V5T3JWYWx1ZS50eXBlKSB7XG5cdFx0XHRjYXNlICdzdHJpbmcnOlxuXHRcdFx0XHRyZXR1cm4gdGhpcy5yZW5kZXJTdHJpbmdFZGl0V2lkZ2V0KGtleU9yVmFsdWUsIG9wdGlvbnMpO1xuXHRcdFx0Y2FzZSAnZW51bSc6XG5cdFx0XHRcdHJldHVybiB0aGlzLnJlbmRlckVudW1FZGl0V2lkZ2V0KGtleU9yVmFsdWUsIG9wdGlvbnMpO1xuXHRcdFx0Y2FzZSAnYm9vbGVhbic6XG5cdFx0XHRcdHJldHVybiB0aGlzLnJlbmRlckVudW1FZGl0V2lkZ2V0KFxuXHRcdFx0XHRcdHtcblx0XHRcdFx0XHRcdHR5cGU6ICdlbnVtJyxcblx0XHRcdFx0XHRcdGRhdGE6IGtleU9yVmFsdWUuZGF0YS50b1N0cmluZygpLFxuXHRcdFx0XHRcdFx0b3B0aW9uczogW3sgdmFsdWU6ICd0cnVlJyB9LCB7IHZhbHVlOiAnZmFsc2UnIH1dLFxuXHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0b3B0aW9ucyxcblx0XHRcdFx0KTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIHJlbmRlclN0cmluZ0VkaXRXaWRnZXQoXG5cdFx0a2V5T3JWYWx1ZTogSU9iamVjdFN0cmluZ0RhdGEsXG5cdFx0eyBpZHgsIGlzS2V5LCBvcmlnaW5hbEl0ZW0sIGNoYW5nZWRJdGVtLCB1cGRhdGUgfTogSU9iamVjdFJlbmRlckVkaXRXaWRnZXRPcHRpb25zLFxuXHQpIHtcblx0XHRjb25zdCB3cmFwcGVyID0gJChpc0tleSA/ICcuc2V0dGluZy1saXN0LW9iamVjdC1pbnB1dC1rZXknIDogJy5zZXR0aW5nLWxpc3Qtb2JqZWN0LWlucHV0LXZhbHVlJyk7XG5cdFx0Y29uc3QgaW5wdXRCb3ggPSBuZXcgSW5wdXRCb3god3JhcHBlciwgdGhpcy5jb250ZXh0Vmlld1NlcnZpY2UsIHtcblx0XHRcdHBsYWNlaG9sZGVyOiBpc0tleVxuXHRcdFx0XHQ/IGxvY2FsaXplKCdvYmplY3RLZXlJbnB1dFBsYWNlaG9sZGVyJywgXCJLZXlcIilcblx0XHRcdFx0OiBsb2NhbGl6ZSgnb2JqZWN0VmFsdWVJbnB1dFBsYWNlaG9sZGVyJywgXCJWYWx1ZVwiKSxcblx0XHRcdGlucHV0Qm94U3R5bGVzOiBnZXRJbnB1dEJveFN0eWxlKHtcblx0XHRcdFx0aW5wdXRCYWNrZ3JvdW5kOiBzZXR0aW5nc1RleHRJbnB1dEJhY2tncm91bmQsXG5cdFx0XHRcdGlucHV0Rm9yZWdyb3VuZDogc2V0dGluZ3NUZXh0SW5wdXRGb3JlZ3JvdW5kLFxuXHRcdFx0XHRpbnB1dEJvcmRlcjogc2V0dGluZ3NUZXh0SW5wdXRCb3JkZXJcblx0XHRcdH0pXG5cdFx0fSk7XG5cblx0XHRpbnB1dEJveC5lbGVtZW50LmNsYXNzTGlzdC5hZGQoJ3NldHRpbmctbGlzdC1vYmplY3QtaW5wdXQnKTtcblxuXHRcdHRoaXMubGlzdERpc3Bvc2FibGVzLmFkZChpbnB1dEJveCk7XG5cdFx0aW5wdXRCb3gudmFsdWUgPSBrZXlPclZhbHVlLmRhdGE7XG5cblx0XHR0aGlzLmxpc3REaXNwb3NhYmxlcy5hZGQoaW5wdXRCb3gub25EaWRDaGFuZ2UodmFsdWUgPT4gdXBkYXRlKHsgLi4ua2V5T3JWYWx1ZSwgZGF0YTogdmFsdWUgfSkpKTtcblxuXHRcdGNvbnN0IG9uS2V5RG93biA9IChlOiBTdGFuZGFyZEtleWJvYXJkRXZlbnQpID0+IHtcblx0XHRcdGlmIChlLmVxdWFscyhLZXlDb2RlLkVudGVyKSkge1xuXHRcdFx0XHR0aGlzLmhhbmRsZUl0ZW1DaGFuZ2Uob3JpZ2luYWxJdGVtLCBjaGFuZ2VkSXRlbSwgaWR4KTtcblx0XHRcdH0gZWxzZSBpZiAoZS5lcXVhbHMoS2V5Q29kZS5Fc2NhcGUpKSB7XG5cdFx0XHRcdHRoaXMuY2FuY2VsRWRpdCgpO1xuXHRcdFx0XHRlLnByZXZlbnREZWZhdWx0KCk7XG5cdFx0XHRcdGUuc3RvcFByb3BhZ2F0aW9uKCk7XG5cdFx0XHR9XG5cdFx0fTtcblxuXHRcdHRoaXMubGlzdERpc3Bvc2FibGVzLmFkZChcblx0XHRcdERPTS5hZGRTdGFuZGFyZERpc3Bvc2FibGVMaXN0ZW5lcihpbnB1dEJveC5pbnB1dEVsZW1lbnQsIERPTS5FdmVudFR5cGUuS0VZX0RPV04sIG9uS2V5RG93bilcblx0XHQpO1xuXG5cdFx0cmV0dXJuIHsgd2lkZ2V0OiBpbnB1dEJveCwgZWxlbWVudDogd3JhcHBlciB9O1xuXHR9XG5cblx0cHJpdmF0ZSByZW5kZXJFbnVtRWRpdFdpZGdldChcblx0XHRrZXlPclZhbHVlOiBJT2JqZWN0RW51bURhdGEsXG5cdFx0eyBpc0tleSwgY2hhbmdlZEl0ZW0sIHVwZGF0ZSB9OiBJT2JqZWN0UmVuZGVyRWRpdFdpZGdldE9wdGlvbnMsXG5cdCkge1xuXHRcdGNvbnN0IHNlbGVjdEJveCA9IHRoaXMuY3JlYXRlQmFzaWNTZWxlY3RCb3goa2V5T3JWYWx1ZSk7XG5cblx0XHRjb25zdCBjaGFuZ2VkS2V5T3JWYWx1ZSA9IGlzS2V5ID8gY2hhbmdlZEl0ZW0ua2V5IDogY2hhbmdlZEl0ZW0udmFsdWU7XG5cdFx0dGhpcy5saXN0RGlzcG9zYWJsZXMuYWRkKFxuXHRcdFx0c2VsZWN0Qm94Lm9uRGlkU2VsZWN0KCh7IHNlbGVjdGVkIH0pID0+XG5cdFx0XHRcdHVwZGF0ZShcblx0XHRcdFx0XHRjaGFuZ2VkS2V5T3JWYWx1ZS50eXBlID09PSAnYm9vbGVhbidcblx0XHRcdFx0XHRcdD8geyAuLi5jaGFuZ2VkS2V5T3JWYWx1ZSwgZGF0YTogc2VsZWN0ZWQgPT09ICd0cnVlJyA/IHRydWUgOiBmYWxzZSB9XG5cdFx0XHRcdFx0XHQ6IHsgLi4uY2hhbmdlZEtleU9yVmFsdWUsIGRhdGE6IHNlbGVjdGVkIH0sXG5cdFx0XHRcdClcblx0XHRcdClcblx0XHQpO1xuXG5cdFx0Y29uc3Qgd3JhcHBlciA9ICQoJy5zZXR0aW5nLWxpc3Qtb2JqZWN0LWlucHV0Jyk7XG5cdFx0d3JhcHBlci5jbGFzc0xpc3QuYWRkKFxuXHRcdFx0aXNLZXkgPyAnc2V0dGluZy1saXN0LW9iamVjdC1pbnB1dC1rZXknIDogJ3NldHRpbmctbGlzdC1vYmplY3QtaW5wdXQtdmFsdWUnLFxuXHRcdCk7XG5cblx0XHRzZWxlY3RCb3gucmVuZGVyKHdyYXBwZXIpO1xuXG5cdFx0Ly8gU3dpdGNoIHRvIHRoZSBmaXJzdCBpdGVtIGlmIHRoZSB1c2VyIHNldCBzb21ldGhpbmcgaW52YWxpZCBpbiB0aGUganNvblxuXHRcdGNvbnN0IHNlbGVjdGVkID0ga2V5T3JWYWx1ZS5vcHRpb25zLmZpbmRJbmRleChvcHRpb24gPT4ga2V5T3JWYWx1ZS5kYXRhID09PSBvcHRpb24udmFsdWUpO1xuXHRcdGlmIChzZWxlY3RlZCA9PT0gLTEgJiYga2V5T3JWYWx1ZS5vcHRpb25zLmxlbmd0aCkge1xuXHRcdFx0dXBkYXRlKFxuXHRcdFx0XHRjaGFuZ2VkS2V5T3JWYWx1ZS50eXBlID09PSAnYm9vbGVhbidcblx0XHRcdFx0XHQ/IHsgLi4uY2hhbmdlZEtleU9yVmFsdWUsIGRhdGE6IHRydWUgfVxuXHRcdFx0XHRcdDogeyAuLi5jaGFuZ2VkS2V5T3JWYWx1ZSwgZGF0YToga2V5T3JWYWx1ZS5vcHRpb25zWzBdLnZhbHVlIH1cblx0XHRcdCk7XG5cdFx0fSBlbHNlIGlmIChjaGFuZ2VkS2V5T3JWYWx1ZS50eXBlID09PSAnYm9vbGVhbicpIHtcblx0XHRcdC8vIGh0dHBzOi8vZ2l0aHViLmNvbS9taWNyb3NvZnQvdnNjb2RlL2lzc3Vlcy8xMjk1ODFcblx0XHRcdHVwZGF0ZSh7IC4uLmNoYW5nZWRLZXlPclZhbHVlLCBkYXRhOiBrZXlPclZhbHVlLmRhdGEgPT09ICd0cnVlJyB9KTtcblx0XHR9XG5cblx0XHRyZXR1cm4geyB3aWRnZXQ6IHNlbGVjdEJveCwgZWxlbWVudDogd3JhcHBlciB9O1xuXHR9XG5cblx0cHJpdmF0ZSBzaG91bGRVc2VTdWdnZXN0aW9uKG9yaWdpbmFsVmFsdWU6IE9iamVjdFZhbHVlLCBwcmV2aW91c1ZhbHVlOiBPYmplY3RWYWx1ZSwgbmV3VmFsdWU6IE9iamVjdFZhbHVlKTogYm9vbGVhbiB7XG5cdFx0Ly8gc3VnZ2VzdGlvbiBpcyBleGFjdGx5IHRoZSBzYW1lXG5cdFx0aWYgKG5ld1ZhbHVlLnR5cGUgIT09ICdlbnVtJyAmJiBuZXdWYWx1ZS50eXBlID09PSBwcmV2aW91c1ZhbHVlLnR5cGUgJiYgbmV3VmFsdWUuZGF0YSA9PT0gcHJldmlvdXNWYWx1ZS5kYXRhKSB7XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXG5cdFx0Ly8gaXRlbSBpcyBuZXcsIHVzZSBzdWdnZXN0aW9uXG5cdFx0aWYgKG9yaWdpbmFsVmFsdWUuZGF0YSA9PT0gJycpIHtcblx0XHRcdHJldHVybiB0cnVlO1xuXHRcdH1cblxuXHRcdGlmIChwcmV2aW91c1ZhbHVlLnR5cGUgPT09IG5ld1ZhbHVlLnR5cGUgJiYgbmV3VmFsdWUudHlwZSAhPT0gJ2VudW0nKSB7XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXG5cdFx0Ly8gY2hlY2sgaWYgYWxsIGVudW0gb3B0aW9ucyBhcmUgdGhlIHNhbWVcblx0XHRpZiAocHJldmlvdXNWYWx1ZS50eXBlID09PSAnZW51bScgJiYgbmV3VmFsdWUudHlwZSA9PT0gJ2VudW0nKSB7XG5cdFx0XHRjb25zdCBwcmV2aW91c0VudW1zID0gbmV3IFNldChwcmV2aW91c1ZhbHVlLm9wdGlvbnMubWFwKCh7IHZhbHVlIH0pID0+IHZhbHVlKSk7XG5cdFx0XHRuZXdWYWx1ZS5vcHRpb25zLmZvckVhY2goKHsgdmFsdWUgfSkgPT4gcHJldmlvdXNFbnVtcy5kZWxldGUodmFsdWUpKTtcblxuXHRcdFx0Ly8gYWxsIG9wdGlvbnMgYXJlIHRoZSBzYW1lXG5cdFx0XHRpZiAocHJldmlvdXNFbnVtcy5zaXplID09PSAwKSB7XG5cdFx0XHRcdHJldHVybiBmYWxzZTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRyZXR1cm4gdHJ1ZTtcblx0fVxuXG5cdHByb3RlY3RlZCBhZGRUb29sdGlwc1RvUm93KHJvd0VsZW1lbnRHcm91cDogUm93RWxlbWVudEdyb3VwLCBpdGVtOiBJT2JqZWN0RGF0YUl0ZW0pOiB2b2lkIHtcblx0XHRjb25zdCB7IGtleUVsZW1lbnQsIHZhbHVlRWxlbWVudCwgcm93RWxlbWVudCB9ID0gcm93RWxlbWVudEdyb3VwO1xuXG5cdFx0bGV0IGFjY2Vzc2libGVEZXNjcmlwdGlvbjtcblx0XHRpZiAoaXRlbS5zb3VyY2UpIHtcblx0XHRcdGFjY2Vzc2libGVEZXNjcmlwdGlvbiA9IGxvY2FsaXplKCdvYmplY3RQYWlySGludExhYmVsV2l0aFNvdXJjZScsIFwiVGhlIHByb3BlcnR5IGB7MH1gIGlzIHNldCB0byBgezF9YCBieSBgezJ9YC5cIiwgaXRlbS5rZXkuZGF0YSwgaXRlbS52YWx1ZS5kYXRhLCBpdGVtLnNvdXJjZSk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdGFjY2Vzc2libGVEZXNjcmlwdGlvbiA9IGxvY2FsaXplKCdvYmplY3RQYWlySGludExhYmVsJywgXCJUaGUgcHJvcGVydHkgYHswfWAgaXMgc2V0IHRvIGB7MX1gLlwiLCBpdGVtLmtleS5kYXRhLCBpdGVtLnZhbHVlLmRhdGEpO1xuXHRcdH1cblxuXHRcdGNvbnN0IG1hcmtkb3duU3RyaW5nID0gbmV3IE1hcmtkb3duU3RyaW5nKCkuYXBwZW5kTWFya2Rvd24oYWNjZXNzaWJsZURlc2NyaXB0aW9uKTtcblxuXHRcdGNvbnN0IGtleURlc2NyaXB0aW9uOiBzdHJpbmcgfCBNYXJrZG93blN0cmluZyA9IHRoaXMuZ2V0RW51bURlc2NyaXB0aW9uKGl0ZW0ua2V5KSA/PyBpdGVtLmtleURlc2NyaXB0aW9uID8/IG1hcmtkb3duU3RyaW5nO1xuXHRcdHRoaXMubGlzdERpc3Bvc2FibGVzLmFkZCh0aGlzLmhvdmVyU2VydmljZS5zZXR1cERlbGF5ZWRIb3ZlcihrZXlFbGVtZW50LCB7IGNvbnRlbnQ6IGtleURlc2NyaXB0aW9uIH0pKTtcblxuXHRcdGNvbnN0IHZhbHVlRGVzY3JpcHRpb246IHN0cmluZyB8IE1hcmtkb3duU3RyaW5nID0gdGhpcy5nZXRFbnVtRGVzY3JpcHRpb24oaXRlbS52YWx1ZSkgPz8gbWFya2Rvd25TdHJpbmc7XG5cdFx0dGhpcy5saXN0RGlzcG9zYWJsZXMuYWRkKHRoaXMuaG92ZXJTZXJ2aWNlLnNldHVwRGVsYXllZEhvdmVyKHZhbHVlRWxlbWVudCEsIHsgY29udGVudDogdmFsdWVEZXNjcmlwdGlvbiB9KSk7XG5cblx0XHRyb3dFbGVtZW50LnNldEF0dHJpYnV0ZSgnYXJpYS1sYWJlbCcsIGFjY2Vzc2libGVEZXNjcmlwdGlvbik7XG5cdH1cblxuXHRwcml2YXRlIGdldEVudW1EZXNjcmlwdGlvbihrZXlPclZhbHVlOiBPYmplY3RLZXkgfCBPYmplY3RWYWx1ZSk6IHN0cmluZyB8IHVuZGVmaW5lZCB7XG5cdFx0Y29uc3QgZW51bURlc2NyaXB0aW9uID0ga2V5T3JWYWx1ZS50eXBlID09PSAnZW51bSdcblx0XHRcdD8ga2V5T3JWYWx1ZS5vcHRpb25zLmZpbmQoKHsgdmFsdWUgfSkgPT4ga2V5T3JWYWx1ZS5kYXRhID09PSB2YWx1ZSk/LmRlc2NyaXB0aW9uXG5cdFx0XHQ6IHVuZGVmaW5lZDtcblx0XHRyZXR1cm4gZW51bURlc2NyaXB0aW9uO1xuXHR9XG5cblx0cHJvdGVjdGVkIGdldExvY2FsaXplZFN0cmluZ3MoKSB7XG5cdFx0cmV0dXJuIHtcblx0XHRcdGRlbGV0ZUFjdGlvblRvb2x0aXA6IGxvY2FsaXplKCdyZW1vdmVJdGVtJywgXCJSZW1vdmUgSXRlbVwiKSxcblx0XHRcdHJlc2V0QWN0aW9uVG9vbHRpcDogbG9jYWxpemUoJ3Jlc2V0SXRlbScsIFwiUmVzZXQgSXRlbVwiKSxcblx0XHRcdGVkaXRBY3Rpb25Ub29sdGlwOiBsb2NhbGl6ZSgnZWRpdEl0ZW0nLCBcIkVkaXQgSXRlbVwiKSxcblx0XHRcdGFkZEJ1dHRvbkxhYmVsOiBsb2NhbGl6ZSgnYWRkSXRlbScsIFwiQWRkIEl0ZW1cIiksXG5cdFx0XHRrZXlIZWFkZXJUZXh0OiBsb2NhbGl6ZSgnb2JqZWN0S2V5SGVhZGVyJywgXCJJdGVtXCIpLFxuXHRcdFx0dmFsdWVIZWFkZXJUZXh0OiBsb2NhbGl6ZSgnb2JqZWN0VmFsdWVIZWFkZXInLCBcIlZhbHVlXCIpLFxuXHRcdH07XG5cdH1cbn1cblxuaW50ZXJmYWNlIElCb29sT2JqZWN0U2V0VmFsdWVPcHRpb25zIHtcblx0c2V0dGluZ0tleTogc3RyaW5nO1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIElCb29sT2JqZWN0RGF0YUl0ZW0ge1xuXHRrZXk6IElPYmplY3RTdHJpbmdEYXRhO1xuXHR2YWx1ZTogSU9iamVjdEJvb2xEYXRhO1xuXHRrZXlEZXNjcmlwdGlvbj86IHN0cmluZztcblx0c291cmNlPzogc3RyaW5nO1xuXHRyZW1vdmFibGU6IGZhbHNlO1xuXHRyZXNldGFibGU6IGJvb2xlYW47XG59XG5cbmV4cG9ydCBjbGFzcyBPYmplY3RTZXR0aW5nQ2hlY2tib3hXaWRnZXQgZXh0ZW5kcyBBYnN0cmFjdExpc3RTZXR0aW5nV2lkZ2V0PElCb29sT2JqZWN0RGF0YUl0ZW0+IHtcblx0cHJpdmF0ZSBjdXJyZW50U2V0dGluZ0tleTogc3RyaW5nID0gJyc7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0Y29udGFpbmVyOiBIVE1MRWxlbWVudCxcblx0XHRASVRoZW1lU2VydmljZSB0aGVtZVNlcnZpY2U6IElUaGVtZVNlcnZpY2UsXG5cdFx0QElDb250ZXh0Vmlld1NlcnZpY2UgY29udGV4dFZpZXdTZXJ2aWNlOiBJQ29udGV4dFZpZXdTZXJ2aWNlLFxuXHRcdEBJSG92ZXJTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgaG92ZXJTZXJ2aWNlOiBJSG92ZXJTZXJ2aWNlLFxuXHRcdEBJQ29uZmlndXJhdGlvblNlcnZpY2UgY29uZmlndXJhdGlvblNlcnZpY2U6IElDb25maWd1cmF0aW9uU2VydmljZSxcblx0KSB7XG5cdFx0c3VwZXIoY29udGFpbmVyLCB0aGVtZVNlcnZpY2UsIGNvbnRleHRWaWV3U2VydmljZSwgY29uZmlndXJhdGlvblNlcnZpY2UpO1xuXHR9XG5cblx0b3ZlcnJpZGUgc2V0VmFsdWUobGlzdERhdGE6IElCb29sT2JqZWN0RGF0YUl0ZW1bXSwgb3B0aW9ucz86IElCb29sT2JqZWN0U2V0VmFsdWVPcHRpb25zKTogdm9pZCB7XG5cdFx0aWYgKGlzRGVmaW5lZChvcHRpb25zKSAmJiBvcHRpb25zLnNldHRpbmdLZXkgIT09IHRoaXMuY3VycmVudFNldHRpbmdLZXkpIHtcblx0XHRcdHRoaXMubW9kZWwuc2V0RWRpdEtleSgnbm9uZScpO1xuXHRcdFx0dGhpcy5tb2RlbC5zZWxlY3QobnVsbCk7XG5cdFx0XHR0aGlzLmN1cnJlbnRTZXR0aW5nS2V5ID0gb3B0aW9ucy5zZXR0aW5nS2V5O1xuXHRcdH1cblxuXHRcdHN1cGVyLnNldFZhbHVlKGxpc3REYXRhKTtcblx0fVxuXG5cdG92ZXJyaWRlIGlzSXRlbU5ldyhpdGVtOiBJQm9vbE9iamVjdERhdGFJdGVtKTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuICFpdGVtLmtleS5kYXRhICYmICFpdGVtLnZhbHVlLmRhdGE7XG5cdH1cblxuXHRwcm90ZWN0ZWQgZ2V0RW1wdHlJdGVtKCk6IElCb29sT2JqZWN0RGF0YUl0ZW0ge1xuXHRcdHJldHVybiB7XG5cdFx0XHRrZXk6IHsgdHlwZTogJ3N0cmluZycsIGRhdGE6ICcnIH0sXG5cdFx0XHR2YWx1ZTogeyB0eXBlOiAnYm9vbGVhbicsIGRhdGE6IGZhbHNlIH0sXG5cdFx0XHRyZW1vdmFibGU6IGZhbHNlLFxuXHRcdFx0cmVzZXRhYmxlOiB0cnVlXG5cdFx0fTtcblx0fVxuXG5cdHByb3RlY3RlZCBnZXRDb250YWluZXJDbGFzc2VzKCkge1xuXHRcdHJldHVybiBbJ3NldHRpbmctbGlzdC1vYmplY3Qtd2lkZ2V0J107XG5cdH1cblxuXHRwcm90ZWN0ZWQgZ2V0QWN0aW9uc0Zvckl0ZW0oaXRlbTogSUJvb2xPYmplY3REYXRhSXRlbSwgaWR4OiBudW1iZXIpOiBJQWN0aW9uW10ge1xuXHRcdHJldHVybiBbXTtcblx0fVxuXG5cdHByb3RlY3RlZCBvdmVycmlkZSBpc0FkZEJ1dHRvblZpc2libGUoKTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuIGZhbHNlO1xuXHR9XG5cblx0cHJvdGVjdGVkIG92ZXJyaWRlIHJlbmRlckhlYWRlcigpIHtcblx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHR9XG5cblx0cHJvdGVjdGVkIG92ZXJyaWRlIHJlbmRlckRhdGFPckVkaXRJdGVtKGl0ZW06IElMaXN0Vmlld0l0ZW08SUJvb2xPYmplY3REYXRhSXRlbT4sIGlkeDogbnVtYmVyLCBsaXN0Rm9jdXNlZDogYm9vbGVhbik6IEhUTUxFbGVtZW50IHtcblx0XHRjb25zdCByb3dFbGVtZW50ID0gdGhpcy5yZW5kZXJFZGl0KGl0ZW0sIGlkeCk7XG5cdFx0cm93RWxlbWVudC5zZXRBdHRyaWJ1dGUoJ3JvbGUnLCAnbGlzdGl0ZW0nKTtcblx0XHRyZXR1cm4gcm93RWxlbWVudDtcblx0fVxuXG5cdHByb3RlY3RlZCByZW5kZXJJdGVtKGl0ZW06IElCb29sT2JqZWN0RGF0YUl0ZW0sIGlkeDogbnVtYmVyKTogUm93RWxlbWVudEdyb3VwIHtcblx0XHQvLyBSZXR1cm4ganVzdCB0aGUgY29udGFpbmVycywgc2luY2Ugd2UgYWx3YXlzIHJlbmRlciBpbiBlZGl0IG1vZGUgYW55d2F5XG5cdFx0Y29uc3Qgcm93RWxlbWVudCA9ICQoJy5ibGFuay1yb3cnKTtcblx0XHRjb25zdCBrZXlFbGVtZW50ID0gJCgnLmJsYW5rLXJvdy1rZXknKTtcblx0XHRyZXR1cm4geyByb3dFbGVtZW50LCBrZXlFbGVtZW50IH07XG5cdH1cblxuXHRwcm90ZWN0ZWQgcmVuZGVyRWRpdChpdGVtOiBJQm9vbE9iamVjdERhdGFJdGVtLCBpZHg6IG51bWJlcik6IEhUTUxFbGVtZW50IHtcblx0XHRjb25zdCByb3dFbGVtZW50ID0gJCgnLnNldHRpbmctbGlzdC1lZGl0LXJvdy5zZXR0aW5nLWxpc3Qtb2JqZWN0LXJvdy5zZXR0aW5nLWl0ZW0tYm9vbCcpO1xuXG5cdFx0Y29uc3QgY2hhbmdlZEl0ZW0gPSB7IC4uLml0ZW0gfTtcblx0XHRjb25zdCBvblZhbHVlQ2hhbmdlID0gKG5ld1ZhbHVlOiBib29sZWFuKSA9PiB7XG5cdFx0XHRjaGFuZ2VkSXRlbS52YWx1ZS5kYXRhID0gbmV3VmFsdWU7XG5cdFx0XHR0aGlzLmhhbmRsZUl0ZW1DaGFuZ2UoaXRlbSwgY2hhbmdlZEl0ZW0sIGlkeCk7XG5cdFx0fTtcblx0XHRjb25zdCBjaGVja2JveERlc2NyaXB0aW9uID0gaXRlbS5rZXlEZXNjcmlwdGlvbiA/IGAke2l0ZW0ua2V5RGVzY3JpcHRpb259ICgke2l0ZW0ua2V5LmRhdGF9KWAgOiBpdGVtLmtleS5kYXRhO1xuXHRcdGNvbnN0IHsgZWxlbWVudCwgd2lkZ2V0OiBjaGVja2JveCB9ID0gdGhpcy5yZW5kZXJFZGl0V2lkZ2V0KChjaGFuZ2VkSXRlbS52YWx1ZSBhcyBJT2JqZWN0Qm9vbERhdGEpLmRhdGEsIGNoZWNrYm94RGVzY3JpcHRpb24sIG9uVmFsdWVDaGFuZ2UpO1xuXHRcdHJvd0VsZW1lbnQuYXBwZW5kQ2hpbGQoZWxlbWVudCk7XG5cblx0XHRjb25zdCB2YWx1ZUVsZW1lbnQgPSBET00uYXBwZW5kKHJvd0VsZW1lbnQsICQoJy5zZXR0aW5nLWxpc3Qtb2JqZWN0LXZhbHVlJykpO1xuXHRcdHZhbHVlRWxlbWVudC50ZXh0Q29udGVudCA9IGNoZWNrYm94RGVzY3JpcHRpb247XG5cblx0XHQvLyBXZSBhZGQgdGhlIHRvb2x0aXBzIGhlcmUsIGJlY2F1c2UgdGhlIG1ldGhvZCBpcyBub3QgY2FsbGVkIGJ5IGRlZmF1bHRcblx0XHQvLyBmb3Igd2lkZ2V0cyBpbiBlZGl0IG1vZGVcblx0XHRjb25zdCByb3dFbGVtZW50R3JvdXAgPSB7IHJvd0VsZW1lbnQsIGtleUVsZW1lbnQ6IHZhbHVlRWxlbWVudCwgdmFsdWVFbGVtZW50OiBjaGVja2JveC5kb21Ob2RlIH07XG5cdFx0dGhpcy5hZGRUb29sdGlwc1RvUm93KHJvd0VsZW1lbnRHcm91cCwgaXRlbSk7XG5cblx0XHR0aGlzLmxpc3REaXNwb3NhYmxlcy5hZGQoRE9NLmFkZERpc3Bvc2FibGVMaXN0ZW5lcih2YWx1ZUVsZW1lbnQsIERPTS5FdmVudFR5cGUuTU9VU0VfRE9XTiwgZSA9PiB7XG5cdFx0XHRjb25zdCB0YXJnZXRFbGVtZW50ID0gPEhUTUxFbGVtZW50PmUudGFyZ2V0O1xuXHRcdFx0aWYgKHRhcmdldEVsZW1lbnQudGFnTmFtZS50b0xvd2VyQ2FzZSgpICE9PSAnYScpIHtcblx0XHRcdFx0Y2hlY2tib3guY2hlY2tlZCA9ICFjaGVja2JveC5jaGVja2VkO1xuXHRcdFx0XHRvblZhbHVlQ2hhbmdlKGNoZWNrYm94LmNoZWNrZWQpO1xuXHRcdFx0fVxuXHRcdFx0RE9NLkV2ZW50SGVscGVyLnN0b3AoZSk7XG5cdFx0fSkpO1xuXG5cdFx0cmV0dXJuIHJvd0VsZW1lbnQ7XG5cdH1cblxuXHRwcml2YXRlIHJlbmRlckVkaXRXaWRnZXQoXG5cdFx0dmFsdWU6IGJvb2xlYW4sXG5cdFx0Y2hlY2tib3hEZXNjcmlwdGlvbjogc3RyaW5nLFxuXHRcdG9uVmFsdWVDaGFuZ2U6IChuZXdWYWx1ZTogYm9vbGVhbikgPT4gdm9pZFxuXHQpIHtcblx0XHRjb25zdCBjaGVja2JveCA9IG5ldyBUb2dnbGUoe1xuXHRcdFx0aWNvbjogQ29kaWNvbi5jaGVjayxcblx0XHRcdGFjdGlvbkNsYXNzTmFtZTogJ3NldHRpbmctdmFsdWUtY2hlY2tib3gnLFxuXHRcdFx0aXNDaGVja2VkOiB2YWx1ZSxcblx0XHRcdHRpdGxlOiBjaGVja2JveERlc2NyaXB0aW9uLFxuXHRcdFx0Li4udW50aGVtZWRUb2dnbGVTdHlsZXNcblx0XHR9KTtcblxuXHRcdHRoaXMubGlzdERpc3Bvc2FibGVzLmFkZChjaGVja2JveCk7XG5cblx0XHRjb25zdCB3cmFwcGVyID0gJCgnLnNldHRpbmctbGlzdC1vYmplY3QtaW5wdXQnKTtcblx0XHR3cmFwcGVyLmNsYXNzTGlzdC5hZGQoJ3NldHRpbmctbGlzdC1vYmplY3QtaW5wdXQta2V5LWNoZWNrYm94Jyk7XG5cdFx0Y2hlY2tib3guZG9tTm9kZS5jbGFzc0xpc3QuYWRkKCdzZXR0aW5nLXZhbHVlLWNoZWNrYm94Jyk7XG5cdFx0d3JhcHBlci5hcHBlbmRDaGlsZChjaGVja2JveC5kb21Ob2RlKTtcblxuXHRcdHRoaXMubGlzdERpc3Bvc2FibGVzLmFkZChET00uYWRkRGlzcG9zYWJsZUxpc3RlbmVyKHdyYXBwZXIsIERPTS5FdmVudFR5cGUuTU9VU0VfRE9XTiwgZSA9PiB7XG5cdFx0XHRjaGVja2JveC5jaGVja2VkID0gIWNoZWNrYm94LmNoZWNrZWQ7XG5cdFx0XHRvblZhbHVlQ2hhbmdlKGNoZWNrYm94LmNoZWNrZWQpO1xuXG5cdFx0XHQvLyBXaXRob3V0IHRoaXMgbGluZSwgdGhlIHNldHRpbmdzIGVkaXRvciBhc3N1bWVzXG5cdFx0XHQvLyB3ZSBsb3N0IGZvY3VzIG9uIHRoaXMgc2V0dGluZyBjb21wbGV0ZWx5LlxuXHRcdFx0ZS5zdG9wSW1tZWRpYXRlUHJvcGFnYXRpb24oKTtcblx0XHR9KSk7XG5cblx0XHRyZXR1cm4geyB3aWRnZXQ6IGNoZWNrYm94LCBlbGVtZW50OiB3cmFwcGVyIH07XG5cdH1cblxuXHRwcm90ZWN0ZWQgYWRkVG9vbHRpcHNUb1Jvdyhyb3dFbGVtZW50R3JvdXA6IFJvd0VsZW1lbnRHcm91cCwgaXRlbTogSUJvb2xPYmplY3REYXRhSXRlbSk6IHZvaWQge1xuXHRcdGNvbnN0IGFjY2Vzc2libGVEZXNjcmlwdGlvbiA9IGxvY2FsaXplKCdvYmplY3RQYWlySGludExhYmVsJywgXCJUaGUgcHJvcGVydHkgYHswfWAgaXMgc2V0IHRvIGB7MX1gLlwiLCBpdGVtLmtleS5kYXRhLCBpdGVtLnZhbHVlLmRhdGEpO1xuXHRcdGNvbnN0IHRpdGxlID0gaXRlbS5rZXlEZXNjcmlwdGlvbiA/PyBhY2Nlc3NpYmxlRGVzY3JpcHRpb247XG5cdFx0Y29uc3QgeyByb3dFbGVtZW50LCBrZXlFbGVtZW50LCB2YWx1ZUVsZW1lbnQgfSA9IHJvd0VsZW1lbnRHcm91cDtcblxuXHRcdHRoaXMubGlzdERpc3Bvc2FibGVzLmFkZCh0aGlzLmhvdmVyU2VydmljZS5zZXR1cERlbGF5ZWRIb3ZlcihrZXlFbGVtZW50LCB7IGNvbnRlbnQ6IHRpdGxlIH0pKTtcblx0XHR2YWx1ZUVsZW1lbnQhLnNldEF0dHJpYnV0ZSgnYXJpYS1sYWJlbCcsIGFjY2Vzc2libGVEZXNjcmlwdGlvbik7XG5cdFx0cm93RWxlbWVudC5zZXRBdHRyaWJ1dGUoJ2FyaWEtbGFiZWwnLCBhY2Nlc3NpYmxlRGVzY3JpcHRpb24pO1xuXHR9XG5cblx0cHJvdGVjdGVkIGdldExvY2FsaXplZFN0cmluZ3MoKSB7XG5cdFx0cmV0dXJuIHtcblx0XHRcdGRlbGV0ZUFjdGlvblRvb2x0aXA6IGxvY2FsaXplKCdyZW1vdmVJdGVtJywgXCJSZW1vdmUgSXRlbVwiKSxcblx0XHRcdHJlc2V0QWN0aW9uVG9vbHRpcDogbG9jYWxpemUoJ3Jlc2V0SXRlbScsIFwiUmVzZXQgSXRlbVwiKSxcblx0XHRcdGVkaXRBY3Rpb25Ub29sdGlwOiBsb2NhbGl6ZSgnZWRpdEl0ZW0nLCBcIkVkaXQgSXRlbVwiKSxcblx0XHRcdGFkZEJ1dHRvbkxhYmVsOiBsb2NhbGl6ZSgnYWRkSXRlbScsIFwiQWRkIEl0ZW1cIiksXG5cdFx0XHRrZXlIZWFkZXJUZXh0OiBsb2NhbGl6ZSgnb2JqZWN0S2V5SGVhZGVyJywgXCJJdGVtXCIpLFxuXHRcdFx0dmFsdWVIZWFkZXJUZXh0OiBsb2NhbGl6ZSgnb2JqZWN0VmFsdWVIZWFkZXInLCBcIlZhbHVlXCIpLFxuXHRcdH07XG5cdH1cbn1cbiJdLAogICJtYXBwaW5ncyI6ICI7Ozs7Ozs7Ozs7O0FBS0EsU0FBUyx1QkFBdUI7QUFDaEMsWUFBWSxTQUFTO0FBRXJCLFNBQVMsaUJBQWlCO0FBQzFCLFNBQVMsY0FBYztBQUN2QixTQUFTLHNCQUFzQjtBQUMvQixTQUFTLGdCQUFnQjtBQUN6QixTQUFTLGlCQUFpQjtBQUMxQixTQUFTLFFBQVEsNEJBQTRCO0FBRTdDLFNBQVMseUJBQXlCO0FBQ2xDLFNBQVMsZUFBZTtBQUN4QixTQUFTLGVBQXNCO0FBQy9CLFNB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
