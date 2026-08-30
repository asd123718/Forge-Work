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
import "./media/keybindingsEditor.css";
import { localize } from "../../../../nls.js";
import { Delayer } from "../../../../base/common/async.js";
import * as DOM from "../../../../base/browser/dom.js";
import { isIOS, OS } from "../../../../base/common/platform.js";
import { Disposable, DisposableStore, toDisposable } from "../../../../base/common/lifecycle.js";
import { ToggleActionViewItem } from "../../../../base/browser/ui/toggle/toggle.js";
import { HighlightedLabel } from "../../../../base/browser/ui/highlightedlabel/highlightedLabel.js";
import { KeybindingLabel } from "../../../../base/browser/ui/keybindingLabel/keybindingLabel.js";
import { Action, Separator } from "../../../../base/common/actions.js";
import { ActionBar } from "../../../../base/browser/ui/actionbar/actionbar.js";
import { EditorPane } from "../../../browser/parts/editor/editorPane.js";
import { ITelemetryService } from "../../../../platform/telemetry/common/telemetry.js";
import { IClipboardService } from "../../../../platform/clipboard/common/clipboardService.js";
import { KEYBINDING_ENTRY_TEMPLATE_ID } from "../../../services/preferences/browser/keybindingsEditorModel.js";
import { IInstantiationService } from "../../../../platform/instantiation/common/instantiation.js";
import { IKeybindingService } from "../../../../platform/keybinding/common/keybinding.js";
import { DefineKeybindingWidget, KeybindingsSearchWidget } from "./keybindingWidgets.js";
import { CONTEXT_KEYBINDING_FOCUS, CONTEXT_KEYBINDINGS_EDITOR, CONTEXT_KEYBINDINGS_SEARCH_FOCUS, CONTEXT_KEYBINDINGS_SEARCH_HAS_VALUE, KEYBINDINGS_EDITOR_COMMAND_RECORD_SEARCH_KEYS, KEYBINDINGS_EDITOR_COMMAND_SORTBY_PRECEDENCE, KEYBINDINGS_EDITOR_COMMAND_DEFINE, KEYBINDINGS_EDITOR_COMMAND_REMOVE, KEYBINDINGS_EDITOR_COMMAND_RESET, KEYBINDINGS_EDITOR_COMMAND_COPY, KEYBINDINGS_EDITOR_COMMAND_COPY_COMMAND, KEYBINDINGS_EDITOR_COMMAND_CLEAR_SEARCH_RESULTS, KEYBINDINGS_EDITOR_COMMAND_DEFINE_WHEN, KEYBINDINGS_EDITOR_COMMAND_SHOW_SIMILAR, KEYBINDINGS_EDITOR_COMMAND_ADD, KEYBINDINGS_EDITOR_COMMAND_COPY_COMMAND_TITLE, CONTEXT_WHEN_FOCUS } from "../common/preferences.js";
import { IContextMenuService } from "../../../../platform/contextview/browser/contextView.js";
import { IKeybindingEditingService } from "../../../services/keybinding/common/keybindingEditing.js";
import { IThemeService, registerThemingParticipant } from "../../../../platform/theme/common/themeService.js";
import { ThemeIcon } from "../../../../base/common/themables.js";
import { IContextKeyService, RawContextKey } from "../../../../platform/contextkey/common/contextkey.js";
import { KeyCode } from "../../../../base/common/keyCodes.js";
import { badgeBackground, contrastBorder, badgeForeground, listActiveSelectionForeground, listInactiveSelectionForeground, listHoverForeground, listFocusForeground, editorBackground, foreground, listActiveSelectionBackground, listInactiveSelectionBackground, listFocusBackground, listHoverBackground, registerColor, tableOddRowsBackgroundColor, asCssVariable } from "../../../../platform/theme/common/colorRegistry.js";
import { IEditorService } from "../../../services/editor/common/editorService.js";
import { EditorExtensionsRegistry } from "../../../../editor/browser/editorExtensions.js";
import { WorkbenchTable } from "../../../../platform/list/browser/listService.js";
import { INotificationService } from "../../../../platform/notification/common/notification.js";
import { IStorageService, StorageScope, StorageTarget } from "../../../../platform/storage/common/storage.js";
import { Emitter, Event } from "../../../../base/common/event.js";
import { MenuRegistry, MenuId, isIMenuItem } from "../../../../platform/actions/common/actions.js";
import { WORKBENCH_BACKGROUND } from "../../../common/theme.js";
import { keybindingsRecordKeysIcon, keybindingsSortIcon, keybindingsAddIcon, preferencesClearInputIcon, keybindingsEditIcon } from "./preferencesIcons.js";
import { ToolBar } from "../../../../base/browser/ui/toolbar/toolbar.js";
import { defaultKeybindingLabelStyles, defaultToggleStyles, getInputBoxStyle } from "../../../../platform/theme/browser/defaultStyles.js";
import { IExtensionsWorkbenchService } from "../../extensions/common/extensions.js";
import { StandardKeyboardEvent } from "../../../../base/browser/keyboardEvent.js";
import { isString } from "../../../../base/common/types.js";
import { SuggestEnabledInput } from "../../codeEditor/browser/suggestEnabledInput/suggestEnabledInput.js";
import { CompletionItemKind } from "../../../../editor/common/languages.js";
import { settingsTextInputBorder } from "../common/settingsEditorColorRegistry.js";
import { IConfigurationService } from "../../../../platform/configuration/common/configuration.js";
import { AccessibilityVerbositySettingId } from "../../accessibility/browser/accessibilityConfiguration.js";
import { registerNavigableContainer } from "../../../browser/actions/widgetNavigationCommands.js";
import { getDefaultHoverDelegate } from "../../../../base/browser/ui/hover/hoverDelegateFactory.js";
import { IHoverService } from "../../../../platform/hover/browser/hover.js";
import { IAccessibilityService } from "../../../../platform/accessibility/common/accessibility.js";
const $ = DOM.$;
let KeybindingsEditor = class extends EditorPane {
  constructor(group, telemetryService, themeService, keybindingsService, contextMenuService, keybindingEditingService, contextKeyService, notificationService, clipboardService, instantiationService, editorService, storageService, configurationService, accessibilityService) {
    super(KeybindingsEditor.ID, group, telemetryService, themeService, storageService);
    this.keybindingsService = keybindingsService;
    this.contextMenuService = contextMenuService;
    this.keybindingEditingService = keybindingEditingService;
    this.contextKeyService = contextKeyService;
    this.notificationService = notificationService;
    this.clipboardService = clipboardService;
    this.instantiationService = instantiationService;
    this.editorService = editorService;
    this.configurationService = configurationService;
    this.accessibilityService = accessibilityService;
    this._onDefineWhenExpression = this._register(new Emitter());
    this.onDefineWhenExpression = this._onDefineWhenExpression.event;
    this._onRejectWhenExpression = this._register(new Emitter());
    this.onRejectWhenExpression = this._onRejectWhenExpression.event;
    this._onAcceptWhenExpression = this._register(new Emitter());
    this.onAcceptWhenExpression = this._onAcceptWhenExpression.event;
    this._onLayout = this._register(new Emitter());
    this.onLayout = this._onLayout.event;
    this.keybindingsEditorModel = null;
    this.unAssignedKeybindingItemToRevealAndFocus = null;
    this.tableEntries = [];
    this.dimension = null;
    this.latestEmptyFilters = [];
    this.delayedFiltering = this._register(new Delayer(300));
    this._register(keybindingsService.onDidUpdateKeybindings(() => this.render(!!this.keybindingFocusContextKey.get())));
    this.keybindingsEditorContextKey = CONTEXT_KEYBINDINGS_EDITOR.bindTo(this.contextKeyService);
    this.searchFocusContextKey = CONTEXT_KEYBINDINGS_SEARCH_FOCUS.bindTo(this.contextKeyService);
    this.keybindingFocusContextKey = CONTEXT_KEYBINDING_FOCUS.bindTo(this.contextKeyService);
    this.searchHasValueContextKey = CONTEXT_KEYBINDINGS_SEARCH_HAS_VALUE.bindTo(this.contextKeyService);
    this.searchHistoryDelayer = this._register(new Delayer(500));
    this.recordKeysAction = this._register(new Action(KEYBINDINGS_EDITOR_COMMAND_RECORD_SEARCH_KEYS, localize("recordKeysLabel", "Record Keys"), ThemeIcon.asClassName(keybindingsRecordKeysIcon)));
    this.recordKeysAction.checked = false;
    this.sortByPrecedenceAction = this._register(new Action(KEYBINDINGS_EDITOR_COMMAND_SORTBY_PRECEDENCE, localize("sortByPrecedeneLabel", "Sort by Precedence (Highest first)"), ThemeIcon.asClassName(keybindingsSortIcon)));
    this.sortByPrecedenceAction.checked = false;
    this.overflowWidgetsDomNode = $(".keybindings-overflow-widgets-container.monaco-editor");
  }
  create(parent) {
    super.create(parent);
    this._register(registerNavigableContainer({
      name: "keybindingsEditor",
      focusNotifiers: [this],
      focusNextWidget: () => {
        if (this.searchWidget.hasFocus()) {
          this.focusKeybindings();
        }
      },
      focusPreviousWidget: () => {
        if (!this.searchWidget.hasFocus()) {
          this.focusSearch();
        }
      }
    }));
  }
  createEditor(parent) {
    const keybindingsEditorElement = DOM.append(parent, $("div", { class: "keybindings-editor" }));
    this.createAriaLabelElement(keybindingsEditorElement);
    this.createOverlayContainer(keybindingsEditorElement);
    this.createHeader(keybindingsEditorElement);
    this.createBody(keybindingsEditorElement);
  }
  setInput(input, options, context, token) {
    this.keybindingsEditorContextKey.set(true);
    return super.setInput(input, options, context, token).then(() => this.render(!!(options && options.preserveFocus)));
  }
  clearInput() {
    super.clearInput();
    this.keybindingsEditorContextKey.reset();
    this.keybindingFocusContextKey.reset();
  }
  layout(dimension) {
    this.dimension = dimension;
    this.layoutSearchWidget(dimension);
    this.overlayContainer.style.width = dimension.width + "px";
    this.overlayContainer.style.height = dimension.height + "px";
    this.defineKeybindingWidget.layout(this.dimension);
    this.layoutKeybindingsTable();
    this._onLayout.fire();
  }
  focus() {
    super.focus();
    const activeKeybindingEntry = this.activeKeybindingEntry;
    if (activeKeybindingEntry) {
      this.selectEntry(activeKeybindingEntry);
    } else if (!isIOS) {
      this.searchWidget.focus();
    }
  }
  get activeKeybindingEntry() {
    const focusedElement = this.keybindingsTable.getFocusedElements()[0];
    return focusedElement && focusedElement.templateId === KEYBINDING_ENTRY_TEMPLATE_ID ? focusedElement : null;
  }
  async defineKeybinding(keybindingEntry, add) {
    this.selectEntry(keybindingEntry);
    this.showOverlayContainer();
    try {
      const key = await this.defineKeybindingWidget.define();
      if (key) {
        await this.updateKeybinding(keybindingEntry, key, keybindingEntry.keybindingItem.when, add);
      }
    } catch (error) {
      this.onKeybindingEditingError(error);
    } finally {
      this.hideOverlayContainer();
      this.selectEntry(keybindingEntry);
    }
  }
  defineWhenExpression(keybindingEntry) {
    if (keybindingEntry.keybindingItem.keybinding) {
      this.selectEntry(keybindingEntry);
      this._onDefineWhenExpression.fire(keybindingEntry);
    }
  }
  rejectWhenExpression(keybindingEntry) {
    this._onRejectWhenExpression.fire(keybindingEntry);
  }
  acceptWhenExpression(keybindingEntry) {
    this._onAcceptWhenExpression.fire(keybindingEntry);
  }
  async updateKeybinding(keybindingEntry, key, when, add) {
    const currentKey = keybindingEntry.keybindingItem.keybinding ? keybindingEntry.keybindingItem.keybinding.getUserSettingsLabel() : "";
    if (currentKey !== key || keybindingEntry.keybindingItem.when !== when) {
      if (add) {
        await this.keybindingEditingService.addKeybinding(keybindingEntry.keybindingItem.keybindingItem, key, when || void 0);
      } else {
        await this.keybindingEditingService.editKeybinding(keybindingEntry.keybindingItem.keybindingItem, key, when || void 0);
      }
      if (!keybindingEntry.keybindingItem.keybinding) {
        this.unAssignedKeybindingItemToRevealAndFocus = keybindingEntry;
      }
    }
  }
  async removeKeybinding(keybindingEntry) {
    this.selectEntry(keybindingEntry);
    if (keybindingEntry.keybindingItem.keybinding) {
      try {
        await this.keybindingEditingService.removeKeybinding(keybindingEntry.keybindingItem.keybindingItem);
        this.focus();
      } catch (error) {
        this.onKeybindingEditingError(error);
        this.selectEntry(keybindingEntry);
      }
    }
  }
  async resetKeybinding(keybindingEntry) {
    this.selectEntry(keybindingEntry);
    try {
      await this.keybindingEditingService.resetKeybinding(keybindingEntry.keybindingItem.keybindingItem);
      if (!keybindingEntry.keybindingItem.keybinding) {
        this.unAssignedKeybindingItemToRevealAndFocus = keybindingEntry;
      }
      this.selectEntry(keybindingEntry);
    } catch (error) {
      this.onKeybindingEditingError(error);
      this.selectEntry(keybindingEntry);
    }
  }
  async copyKeybinding(keybinding) {
    this.selectEntry(keybinding);
    const userFriendlyKeybinding = {
      key: keybinding.keybindingItem.keybinding ? keybinding.keybindingItem.keybinding.getUserSettingsLabel() || "" : "",
      command: keybinding.keybindingItem.command
    };
    if (keybinding.keybindingItem.when) {
      userFriendlyKeybinding.when = keybinding.keybindingItem.when;
    }
    await this.clipboardService.writeText(JSON.stringify(userFriendlyKeybinding, null, "  "));
  }
  async copyKeybindingCommand(keybinding) {
    this.selectEntry(keybinding);
    await this.clipboardService.writeText(keybinding.keybindingItem.command);
  }
  async copyKeybindingCommandTitle(keybinding) {
    this.selectEntry(keybinding);
    await this.clipboardService.writeText(keybinding.keybindingItem.commandLabel);
  }
  focusSearch() {
    this.searchWidget.focus();
  }
  search(filter) {
    this.focusSearch();
    this.searchWidget.setValue(filter);
    this.selectEntry(0);
  }
  clearSearchResults() {
    this.searchWidget.clear();
    this.searchHasValueContextKey.set(false);
  }
  showSimilarKeybindings(keybindingEntry) {
    const value = `"${keybindingEntry.keybindingItem.keybinding.getAriaLabel()}"`;
    if (value !== this.searchWidget.getValue()) {
      this.searchWidget.setValue(value);
    }
  }
  createAriaLabelElement(parent) {
    this.ariaLabelElement = DOM.append(parent, DOM.$(""));
    this.ariaLabelElement.setAttribute("id", "keybindings-editor-aria-label-element");
    this.ariaLabelElement.setAttribute("aria-live", "assertive");
    this.ariaLabelElement.style.position = "absolute";
    this.ariaLabelElement.style.width = "1px";
    this.ariaLabelElement.style.height = "1px";
    this.ariaLabelElement.style.overflow = "hidden";
    this.ariaLabelElement.style.clip = "rect(1px, 1px, 1px, 1px)";
    this.ariaLabelElement.style.clipPath = "inset(50%)";
    this.ariaLabelElement.style.whiteSpace = "nowrap";
  }
  createOverlayContainer(parent) {
    this.overlayContainer = DOM.append(parent, $(".overlay-container"));
    this.overlayContainer.style.position = "absolute";
    this.overlayContainer.style.zIndex = "40";
    this.defineKeybindingWidget = this._register(this.instantiationService.createInstance(DefineKeybindingWidget, this.overlayContainer));
    this._register(this.defineKeybindingWidget.onDidChange((keybindingStr) => this.defineKeybindingWidget.printExisting(this.keybindingsEditorModel.fetch(`"${keybindingStr}"`).length)));
    this._register(this.defineKeybindingWidget.onShowExistingKeybidings((keybindingStr) => this.searchWidget.setValue(`"${keybindingStr}"`)));
    this.hideOverlayContainer();
  }
  showOverlayContainer() {
    this.overlayContainer.style.display = "block";
  }
  hideOverlayContainer() {
    this.overlayContainer.style.display = "none";
  }
  createHeader(parent) {
    this.headerContainer = DOM.append(parent, $(".keybindings-header"));
    const fullTextSearchPlaceholder = localize("SearchKeybindings.FullTextSearchPlaceholder", "Type to search in keybindings");
    const keybindingsSearchPlaceholder = localize("SearchKeybindings.KeybindingsSearchPlaceholder", "Recording Keys. Press Escape to exit");
    const clearInputAction = this._register(new Action(KEYBINDINGS_EDITOR_COMMAND_CLEAR_SEARCH_RESULTS, localize("clearInput", "Clear Keybindings Search Input"), ThemeIcon.asClassName(preferencesClearInputIcon), false, async () => this.clearSearchResults()));
    const searchContainer = DOM.append(this.headerContainer, $(".search-container"));
    this.searchWidget = this._register(this.instantiationService.createInstance(KeybindingsSearchWidget, searchContainer, {
      ariaLabel: fullTextSearchPlaceholder,
      placeholder: fullTextSearchPlaceholder,
      focusKey: this.searchFocusContextKey,
      ariaLabelledBy: "keybindings-editor-aria-label-element",
      recordEnter: true,
      quoteRecordedKeys: true,
      history: new Set(this.getMemento(StorageScope.PROFILE, StorageTarget.USER).searchHistory ?? []),
      inputBoxStyles: getInputBoxStyle({
        inputBorder: settingsTextInputBorder
      })
    }));
    this._register(this.searchWidget.onDidChange((searchValue) => {
      const hasValue = !!searchValue;
      clearInputAction.enabled = hasValue;
      this.searchHasValueContextKey.set(hasValue);
      this.delayedFiltering.trigger(() => this.filterKeybindings());
      this.updateSearchOptions();
    }));
    this._register(this.searchWidget.onEscape(() => this.recordKeysAction.checked = false));
    this.actionsContainer = DOM.append(searchContainer, DOM.$(".keybindings-search-actions-container"));
    const recordingBadge = this.createRecordingBadge(this.actionsContainer);
    this._register(this.sortByPrecedenceAction.onDidChange((e) => {
      if (e.checked !== void 0) {
        this.renderKeybindingsEntries(false);
      }
      this.updateSearchOptions();
    }));
    this._register(this.recordKeysAction.onDidChange((e) => {
      if (e.checked !== void 0) {
        recordingBadge.classList.toggle("disabled", !e.checked);
        if (e.checked) {
          this.searchWidget.inputBox.setPlaceHolder(keybindingsSearchPlaceholder);
          this.searchWidget.inputBox.setAriaLabel(keybindingsSearchPlaceholder);
          this.searchWidget.startRecordingKeys();
          this.searchWidget.focus();
        } else {
          this.searchWidget.inputBox.setPlaceHolder(fullTextSearchPlaceholder);
          this.searchWidget.inputBox.setAriaLabel(fullTextSearchPlaceholder);
          this.searchWidget.stopRecordingKeys();
          this.searchWidget.focus();
        }
        this.updateSearchOptions();
      }
    }));
    const actions = [this.recordKeysAction, this.sortByPrecedenceAction, clearInputAction];
    const toolBar = this._register(new ToolBar(this.actionsContainer, this.contextMenuService, {
      actionViewItemProvider: (action, options) => {
        if (action.id === this.sortByPrecedenceAction.id || action.id === this.recordKeysAction.id) {
          return new ToggleActionViewItem(null, action, { ...options, keybinding: this.keybindingsService.lookupKeybinding(action.id)?.getLabel(), toggleStyles: defaultToggleStyles });
        }
        return void 0;
      },
      getKeyBinding: (action) => this.keybindingsService.lookupKeybinding(action.id)
    }));
    toolBar.setActions(actions);
    this._register(this.keybindingsService.onDidUpdateKeybindings(() => toolBar.setActions(actions)));
  }
  updateSearchOptions() {
    const keybindingsEditorInput = this.input;
    if (keybindingsEditorInput) {
      keybindingsEditorInput.searchOptions = {
        searchValue: this.searchWidget.getValue(),
        recordKeybindings: !!this.recordKeysAction.checked,
        sortByPrecedence: !!this.sortByPrecedenceAction.checked
      };
    }
  }
  createRecordingBadge(container) {
    const recordingBadge = DOM.append(container, DOM.$(".recording-badge.monaco-count-badge.long.disabled"));
    recordingBadge.textContent = localize("recording", "Recording Keys");
    recordingBadge.style.backgroundColor = asCssVariable(badgeBackground);
    recordingBadge.style.color = asCssVariable(badgeForeground);
    recordingBadge.style.border = `1px solid ${asCssVariable(contrastBorder)}`;
    return recordingBadge;
  }
  layoutSearchWidget(dimension) {
    this.searchWidget.layout(dimension);
    this.headerContainer.classList.toggle("small", dimension.width < 400);
    this.searchWidget.inputBox.inputElement.style.paddingRight = `${DOM.getTotalWidth(this.actionsContainer) + 12}px`;
  }
  createBody(parent) {
    const bodyContainer = DOM.append(parent, $(".keybindings-body"));
    this.createTable(bodyContainer);
  }
  createTable(parent) {
    this.keybindingsTableContainer = DOM.append(parent, $(".keybindings-table-container"));
    this.keybindingsTable = this._register(this.instantiationService.createInstance(
      WorkbenchTable,
      "KeybindingsEditor",
      this.keybindingsTableContainer,
      new Delegate(),
      [
        {
          label: "",
          tooltip: "",
          weight: 0,
          minimumWidth: 40,
          maximumWidth: 40,
          templateId: ActionsColumnRenderer.TEMPLATE_ID,
          project(row) {
            return row;
          }
        },
        {
          label: localize("command", "Command"),
          tooltip: "",
          weight: 0.3,
          templateId: CommandColumnRenderer.TEMPLATE_ID,
          project(row) {
            return row;
          }
        },
        {
          label: localize("keybinding", "Keybinding"),
          tooltip: "",
          weight: 0.2,
          templateId: KeybindingColumnRenderer.TEMPLATE_ID,
          project(row) {
            return row;
          }
        },
        {
          label: localize("when", "When"),
          tooltip: "",
          weight: 0.35,
          templateId: WhenColumnRenderer.TEMPLATE_ID,
          project(row) {
            return row;
          }
        },
        {
          label: localize("source", "Source"),
          tooltip: "",
          weight: 0.15,
          templateId: SourceColumnRenderer.TEMPLATE_ID,
          project(row) {
            return row;
          }
        }
      ],
      [
        this.instantiationService.createInstance(ActionsColumnRenderer, this),
        this.instantiationService.createInstance(CommandColumnRenderer),
        this.instantiationService.createInstance(KeybindingColumnRenderer),
        this.instantiationService.createInstance(WhenColumnRenderer, this),
        this.instantiationService.createInstance(SourceColumnRenderer)
      ],
      {
        identityProvider: { getId: (e) => e.id },
        horizontalScrolling: false,
        accessibilityProvider: new AccessibilityProvider(this.configurationService),
        keyboardNavigationLabelProvider: { getKeyboardNavigationLabel: (e) => e.keybindingItem.commandLabel || e.keybindingItem.command },
        overrideStyles: {
          listBackground: editorBackground
        },
        multipleSelectionSupport: false,
        setRowLineHeight: false,
        openOnSingleClick: false,
        transformOptimization: false
        // disable transform optimization as it causes the editor overflow widgets to be mispositioned
      }
    ));
    this._register(this.keybindingsTable.onContextMenu((e) => this.onContextMenu(e)));
    this._register(this.keybindingsTable.onDidChangeFocus((e) => this.onFocusChange()));
    this._register(this.keybindingsTable.onDidFocus(() => {
      this.keybindingsTable.getHTMLElement().classList.add("focused");
      this.onFocusChange();
    }));
    this._register(this.keybindingsTable.onDidBlur(() => {
      this.keybindingsTable.getHTMLElement().classList.remove("focused");
      this.keybindingFocusContextKey.reset();
    }));
    this._register(this.keybindingsTable.onDidOpen((e) => {
      if (e.browserEvent?.defaultPrevented) {
        return;
      }
      const activeKeybindingEntry = this.activeKeybindingEntry;
      if (activeKeybindingEntry) {
        this.defineKeybinding(activeKeybindingEntry, false);
      }
    }));
    DOM.append(this.keybindingsTableContainer, this.overflowWidgetsDomNode);
  }
  async render(preserveFocus) {
    if (this.input) {
      const input = this.input;
      this.keybindingsEditorModel = await input.resolve();
      await this.keybindingsEditorModel.resolve(this.getActionsLabels());
      this.renderKeybindingsEntries(false, preserveFocus);
      if (input.searchOptions) {
        this.recordKeysAction.checked = input.searchOptions.recordKeybindings;
        this.sortByPrecedenceAction.checked = input.searchOptions.sortByPrecedence;
        this.searchWidget.setValue(input.searchOptions.searchValue);
      } else {
        this.updateSearchOptions();
      }
    }
  }
  getActionsLabels() {
    const actionsLabels = /* @__PURE__ */ new Map();
    for (const editorAction of EditorExtensionsRegistry.getEditorActions()) {
      actionsLabels.set(editorAction.id, editorAction.label);
    }
    for (const menuItem of MenuRegistry.getMenuItems(MenuId.CommandPalette)) {
      if (isIMenuItem(menuItem)) {
        const title = typeof menuItem.command.title === "string" ? menuItem.command.title : menuItem.command.title.value;
        const category = menuItem.command.category ? typeof menuItem.command.category === "string" ? menuItem.command.category : menuItem.command.category.value : void 0;
        actionsLabels.set(menuItem.command.id, category ? `${category}: ${title}` : title);
      }
    }
    return actionsLabels;
  }
  filterKeybindings() {
    this.renderKeybindingsEntries(this.searchWidget.hasFocus());
    this.searchHistoryDelayer.trigger(() => {
      this.searchWidget.inputBox.addToHistory();
      this.getMemento(StorageScope.PROFILE, StorageTarget.USER).searchHistory = this.searchWidget.inputBox.getHistory();
      this.saveState();
    });
  }
  clearKeyboardShortcutSearchHistory() {
    this.searchWidget.inputBox.clearHistory();
    this.getMemento(StorageScope.PROFILE, StorageTarget.USER).searchHistory = this.searchWidget.inputBox.getHistory();
    this.saveState();
  }
  renderKeybindingsEntries(reset, preserveFocus) {
    if (this.keybindingsEditorModel) {
      const filter = this.searchWidget.getValue();
      const keybindingsEntries = this.keybindingsEditorModel.fetch(filter, this.sortByPrecedenceAction.checked);
      const ariaLabel = this.getAriaLabel(keybindingsEntries);
      this.accessibilityService.alert(ariaLabel);
      this.ariaLabelElement.textContent = ariaLabel;
      if (keybindingsEntries.length === 0) {
        this.latestEmptyFilters.push(filter);
      }
      const currentSelectedIndex = this.keybindingsTable.getSelection()[0];
      this.tableEntries = keybindingsEntries;
      this.keybindingsTable.splice(0, this.keybindingsTable.length, this.tableEntries);
      this.layoutKeybindingsTable();
      if (reset) {
        this.keybindingsTable.setSelection([]);
        this.keybindingsTable.setFocus([]);
      } else {
        if (this.unAssignedKeybindingItemToRevealAndFocus) {
          const index = this.getNewIndexOfUnassignedKeybinding(this.unAssignedKeybindingItemToRevealAndFocus);
          if (index !== -1) {
            this.keybindingsTable.reveal(index, 0.2);
            this.selectEntry(index);
          }
          this.unAssignedKeybindingItemToRevealAndFocus = null;
        } else if (currentSelectedIndex !== -1 && currentSelectedIndex < this.tableEntries.length) {
          this.selectEntry(currentSelectedIndex, preserveFocus);
        } else if (this.editorService.activeEditorPane === this && !preserveFocus) {
          this.focus();
        }
      }
    }
  }
  getAriaLabel(keybindingsEntries) {
    let label;
    if (this.sortByPrecedenceAction.checked) {
      label = localize("show sorted keybindings", "Showing {0} Keybindings in precedence order", keybindingsEntries.length);
    } else {
      label = localize("show keybindings", "Showing {0} Keybindings in alphabetical order", keybindingsEntries.length);
    }
    if (this.configurationService.getValue(AccessibilityVerbositySettingId.KeybindingsEditor)) {
      const kb = this.keybindingsService.lookupKeybinding("widgetNavigation.focusNext")?.getAriaLabel();
      if (kb) {
        label += ". " + localize("navigateToResults", "Use {0} to navigate to the results table.", kb);
      }
    }
    return label;
  }
  layoutKeybindingsTable() {
    if (!this.dimension) {
      return;
    }
    const tableHeight = this.dimension.height - (DOM.getDomNodePagePosition(this.headerContainer).height + 12);
    this.keybindingsTableContainer.style.height = `${tableHeight}px`;
    this.keybindingsTable.layout(tableHeight);
  }
  getIndexOf(listEntry) {
    const index = this.tableEntries.indexOf(listEntry);
    if (index === -1) {
      for (let i = 0; i < this.tableEntries.length; i++) {
        if (this.tableEntries[i].id === listEntry.id) {
          return i;
        }
      }
    }
    return index;
  }
  getNewIndexOfUnassignedKeybinding(unassignedKeybinding) {
    for (let index = 0; index < this.tableEntries.length; index++) {
      const entry = this.tableEntries[index];
      if (entry.templateId === KEYBINDING_ENTRY_TEMPLATE_ID) {
        const keybindingItemEntry = entry;
        if (keybindingItemEntry.keybindingItem.command === unassignedKeybinding.keybindingItem.command) {
          return index;
        }
      }
    }
    return -1;
  }
  selectEntry(keybindingItemEntry, focus = true) {
    const index = typeof keybindingItemEntry === "number" ? keybindingItemEntry : this.getIndexOf(keybindingItemEntry);
    if (index !== -1 && index < this.keybindingsTable.length) {
      if (focus) {
        this.keybindingsTable.domFocus();
        this.keybindingsTable.setFocus([index]);
      }
      this.keybindingsTable.setSelection([index]);
    }
  }
  focusKeybindings() {
    this.keybindingsTable.domFocus();
    const currentFocusIndices = this.keybindingsTable.getFocus();
    this.keybindingsTable.setFocus([currentFocusIndices.length ? currentFocusIndices[0] : 0]);
  }
  selectKeybinding(keybindingItemEntry) {
    this.selectEntry(keybindingItemEntry);
  }
  recordSearchKeys() {
    this.recordKeysAction.checked = true;
  }
  toggleSortByPrecedence() {
    this.sortByPrecedenceAction.checked = !this.sortByPrecedenceAction.checked;
  }
  onContextMenu(e) {
    if (!e.element) {
      return;
    }
    if (e.element.templateId === KEYBINDING_ENTRY_TEMPLATE_ID) {
      const keybindingItemEntry = e.element;
      this.selectEntry(keybindingItemEntry);
      this.contextMenuService.showContextMenu({
        getAnchor: () => e.anchor,
        getActions: () => [
          this.createCopyAction(keybindingItemEntry),
          this.createCopyCommandAction(keybindingItemEntry),
          this.createCopyCommandTitleAction(keybindingItemEntry),
          new Separator(),
          ...keybindingItemEntry.keybindingItem.keybinding ? [this.createDefineKeybindingAction(keybindingItemEntry), this.createAddKeybindingAction(keybindingItemEntry)] : [this.createDefineKeybindingAction(keybindingItemEntry)],
          new Separator(),
          this.createRemoveAction(keybindingItemEntry),
          this.createResetAction(keybindingItemEntry),
          new Separator(),
          this.createDefineWhenExpressionAction(keybindingItemEntry),
          new Separator(),
          this.createShowConflictsAction(keybindingItemEntry)
        ]
      });
    }
  }
  onFocusChange() {
    this.keybindingFocusContextKey.reset();
    const element = this.keybindingsTable.getFocusedElements()[0];
    if (!element) {
      return;
    }
    if (element.templateId === KEYBINDING_ENTRY_TEMPLATE_ID) {
      this.keybindingFocusContextKey.set(true);
    }
  }
  createDefineKeybindingAction(keybindingItemEntry) {
    return {
      label: keybindingItemEntry.keybindingItem.keybinding ? localize("changeLabel", "Change Keybinding...") : localize("addLabel", "Add Keybinding..."),
      enabled: true,
      id: KEYBINDINGS_EDITOR_COMMAND_DEFINE,
      run: () => this.defineKeybinding(keybindingItemEntry, false)
    };
  }
  createAddKeybindingAction(keybindingItemEntry) {
    return {
      label: localize("addLabel", "Add Keybinding..."),
      enabled: true,
      id: KEYBINDINGS_EDITOR_COMMAND_ADD,
      run: () => this.defineKeybinding(keybindingItemEntry, true)
    };
  }
  createDefineWhenExpressionAction(keybindingItemEntry) {
    return {
      label: localize("editWhen", "Change When Expression"),
      enabled: !!keybindingItemEntry.keybindingItem.keybinding,
      id: KEYBINDINGS_EDITOR_COMMAND_DEFINE_WHEN,
      run: () => this.defineWhenExpression(keybindingItemEntry)
    };
  }
  createRemoveAction(keybindingItem) {
    return {
      label: localize("removeLabel", "Remove Keybinding"),
      enabled: !!keybindingItem.keybindingItem.keybinding,
      id: KEYBINDINGS_EDITOR_COMMAND_REMOVE,
      run: () => this.removeKeybinding(keybindingItem)
    };
  }
  createResetAction(keybindingItem) {
    return {
      label: localize("resetLabel", "Reset Keybinding"),
      enabled: !keybindingItem.keybindingItem.keybindingItem.isDefault,
      id: KEYBINDINGS_EDITOR_COMMAND_RESET,
      run: () => this.resetKeybinding(keybindingItem)
    };
  }
  createShowConflictsAction(keybindingItem) {
    return {
      label: localize("showSameKeybindings", "Show Same Keybindings"),
      enabled: !!keybindingItem.keybindingItem.keybinding,
      id: KEYBINDINGS_EDITOR_COMMAND_SHOW_SIMILAR,
      run: () => this.showSimilarKeybindings(keybindingItem)
    };
  }
  createCopyAction(keybindingItem) {
    return {
      label: localize("copyLabel", "Copy"),
      enabled: true,
      id: KEYBINDINGS_EDITOR_COMMAND_COPY,
      run: () => this.copyKeybinding(keybindingItem)
    };
  }
  createCopyCommandAction(keybinding) {
    return {
      label: localize("copyCommandLabel", "Copy Command ID"),
      enabled: true,
      id: KEYBINDINGS_EDITOR_COMMAND_COPY_COMMAND,
      run: () => this.copyKeybindingCommand(keybinding)
    };
  }
  createCopyCommandTitleAction(keybinding) {
    return {
      label: localize("copyCommandTitleLabel", "Copy Command Title"),
      enabled: !!keybinding.keybindingItem.commandLabel,
      id: KEYBINDINGS_EDITOR_COMMAND_COPY_COMMAND_TITLE,
      run: () => this.copyKeybindingCommandTitle(keybinding)
    };
  }
  onKeybindingEditingError(error) {
    this.notificationService.error(typeof error === "string" ? error : localize("error", "Error '{0}' while editing the keybinding. Please open 'keybindings.json' file and check for errors.", `${error}`));
  }
};
KeybindingsEditor.ID = "workbench.editor.keybindings";
KeybindingsEditor = __decorateClass([
  __decorateParam(1, ITelemetryService),
  __decorateParam(2, IThemeService),
  __decorateParam(3, IKeybindingService),
  __decorateParam(4, IContextMenuService),
  __decorateParam(5, IKeybindingEditingService),
  __decorateParam(6, IContextKeyService),
  __decorateParam(7, INotificationService),
  __decorateParam(8, IClipboardService),
  __decorateParam(9, IInstantiationService),
  __decorateParam(10, IEditorService),
  __decorateParam(11, IStorageService),
  __decorateParam(12, IConfigurationService),
  __decorateParam(13, IAccessibilityService)
], KeybindingsEditor);
class Delegate {
  constructor() {
    this.headerRowHeight = 30;
  }
  getHeight(element) {
    if (element.templateId === KEYBINDING_ENTRY_TEMPLATE_ID) {
      const commandIdMatched = element.keybindingItem.commandLabel && element.commandIdMatches;
      const commandDefaultLabelMatched = !!element.commandDefaultLabelMatches;
      const extensionIdMatched = !!element.extensionIdMatches;
      if (commandIdMatched && commandDefaultLabelMatched) {
        return 60;
      }
      if (extensionIdMatched || commandIdMatched || commandDefaultLabelMatched) {
        return 40;
      }
    }
    return 24;
  }
}
let ActionsColumnRenderer = class {
  constructor(keybindingsEditor, keybindingsService) {
    this.keybindingsEditor = keybindingsEditor;
    this.keybindingsService = keybindingsService;
    this.templateId = ActionsColumnRenderer.TEMPLATE_ID;
  }
  renderTemplate(container) {
    const element = DOM.append(container, $(".actions"));
    const actionBar = new ActionBar(element);
    return { actionBar };
  }
  renderElement(keybindingItemEntry, index, templateData) {
    templateData.actionBar.clear();
    const actions = [];
    if (keybindingItemEntry.keybindingItem.keybinding) {
      actions.push(this.createEditAction(keybindingItemEntry));
    } else {
      actions.push(this.createAddAction(keybindingItemEntry));
    }
    templateData.actionBar.push(actions, { icon: true });
  }
  createEditAction(keybindingItemEntry) {
    return {
      class: ThemeIcon.asClassName(keybindingsEditIcon),
      enabled: true,
      id: "editKeybinding",
      tooltip: this.keybindingsService.appendKeybinding(localize("editKeybindingLabel", "Change Keybinding"), KEYBINDINGS_EDITOR_COMMAND_DEFINE),
      run: () => this.keybindingsEditor.defineKeybinding(keybindingItemEntry, false)
    };
  }
  createAddAction(keybindingItemEntry) {
    return {
      class: ThemeIcon.asClassName(keybindingsAddIcon),
      enabled: true,
      id: "addKeybinding",
      tooltip: this.keybindingsService.appendKeybinding(localize("addKeybindingLabel", "Add Keybinding"), KEYBINDINGS_EDITOR_COMMAND_DEFINE),
      run: () => this.keybindingsEditor.defineKeybinding(keybindingItemEntry, false)
    };
  }
  disposeTemplate(templateData) {
    templateData.actionBar.dispose();
  }
};
ActionsColumnRenderer.TEMPLATE_ID = "actions";
ActionsColumnRenderer = __decorateClass([
  __decorateParam(1, IKeybindingService)
], ActionsColumnRenderer);
let CommandColumnRenderer = class {
  constructor(_hoverService) {
    this._hoverService = _hoverService;
    this.templateId = CommandColumnRenderer.TEMPLATE_ID;
  }
  renderTemplate(container) {
    const commandColumn = DOM.append(container, $(".command"));
    const commandColumnHover = this._hoverService.setupManagedHover(getDefaultHoverDelegate("mouse"), commandColumn, "");
    const commandLabelContainer = DOM.append(commandColumn, $(".command-label"));
    const commandLabel = new HighlightedLabel(commandLabelContainer);
    const commandDefaultLabelContainer = DOM.append(commandColumn, $(".command-default-label"));
    const commandDefaultLabel = new HighlightedLabel(commandDefaultLabelContainer);
    const commandIdLabelContainer = DOM.append(commandColumn, $(".command-id.code"));
    const commandIdLabel = new HighlightedLabel(commandIdLabelContainer);
    return { commandColumn, commandColumnHover, commandLabelContainer, commandLabel, commandDefaultLabelContainer, commandDefaultLabel, commandIdLabelContainer, commandIdLabel };
  }
  renderElement(keybindingItemEntry, index, templateData) {
    const keybindingItem = keybindingItemEntry.keybindingItem;
    const commandIdMatched = !!(keybindingItem.commandLabel && keybindingItemEntry.commandIdMatches);
    const commandDefaultLabelMatched = !!keybindingItemEntry.commandDefaultLabelMatches;
    templateData.commandColumn.classList.toggle("vertical-align-column", commandIdMatched || commandDefaultLabelMatched);
    const title = keybindingItem.commandLabel ? localize("title", "{0} ({1})", keybindingItem.commandLabel, keybindingItem.command) : keybindingItem.command;
    templateData.commandColumn.setAttribute("aria-label", title);
    templateData.commandColumnHover.update(title);
    if (keybindingItem.commandLabel) {
      templateData.commandLabelContainer.classList.remove("hide");
      templateData.commandLabel.set(keybindingItem.commandLabel, keybindingItemEntry.commandLabelMatches);
    } else {
      templateData.commandLabelContainer.classList.add("hide");
      templateData.commandLabel.set(void 0);
    }
    if (keybindingItemEntry.commandDefaultLabelMatches) {
      templateData.commandDefaultLabelContainer.classList.remove("hide");
      templateData.commandDefaultLabel.set(keybindingItem.commandDefaultLabel, keybindingItemEntry.commandDefaultLabelMatches);
    } else {
      templateData.commandDefaultLabelContainer.classList.add("hide");
      templateData.commandDefaultLabel.set(void 0);
    }
    if (keybindingItemEntry.commandIdMatches || !keybindingItem.commandLabel) {
      templateData.commandIdLabelContainer.classList.remove("hide");
      templateData.commandIdLabel.set(keybindingItem.command, keybindingItemEntry.commandIdMatches);
    } else {
      templateData.commandIdLabelContainer.classList.add("hide");
      templateData.commandIdLabel.set(void 0);
    }
  }
  disposeTemplate(templateData) {
    templateData.commandColumnHover.dispose();
    templateData.commandDefaultLabel.dispose();
    templateData.commandIdLabel.dispose();
    templateData.commandLabel.dispose();
  }
};
CommandColumnRenderer.TEMPLATE_ID = "commands";
CommandColumnRenderer = __decorateClass([
  __decorateParam(0, IHoverService)
], CommandColumnRenderer);
const _KeybindingColumnRenderer = class _KeybindingColumnRenderer {
  constructor() {
    this.templateId = _KeybindingColumnRenderer.TEMPLATE_ID;
  }
  renderTemplate(container) {
    const element = DOM.append(container, $(".keybinding"));
    const keybindingLabel = new KeybindingLabel(DOM.append(element, $("div.keybinding-label")), OS, defaultKeybindingLabelStyles);
    return { keybindingLabel };
  }
  renderElement(keybindingItemEntry, index, templateData) {
    if (keybindingItemEntry.keybindingItem.keybinding) {
      templateData.keybindingLabel.set(keybindingItemEntry.keybindingItem.keybinding, keybindingItemEntry.keybindingMatches);
    } else {
      templateData.keybindingLabel.set(void 0, void 0);
    }
  }
  disposeTemplate(templateData) {
    templateData.keybindingLabel.dispose();
  }
};
_KeybindingColumnRenderer.TEMPLATE_ID = "keybindings";
let KeybindingColumnRenderer = _KeybindingColumnRenderer;
function onClick(element, callback) {
  const disposables = new DisposableStore();
  disposables.add(DOM.addDisposableListener(element, DOM.EventType.CLICK, DOM.finalHandler(callback)));
  disposables.add(DOM.addDisposableListener(element, DOM.EventType.KEY_UP, (e) => {
    const keyboardEvent = new StandardKeyboardEvent(e);
    if (keyboardEvent.equals(KeyCode.Space) || keyboardEvent.equals(KeyCode.Enter)) {
      e.preventDefault();
      e.stopPropagation();
      callback();
    }
  }));
  return disposables;
}
let SourceColumnRenderer = class {
  constructor(extensionsWorkbenchService, hoverService) {
    this.extensionsWorkbenchService = extensionsWorkbenchService;
    this.hoverService = hoverService;
    this.templateId = SourceColumnRenderer.TEMPLATE_ID;
  }
  renderTemplate(container) {
    const sourceColumn = DOM.append(container, $(".source"));
    const sourceColumnHover = this.hoverService.setupManagedHover(getDefaultHoverDelegate("mouse"), sourceColumn, "");
    const sourceLabel = new HighlightedLabel(DOM.append(sourceColumn, $(".source-label")));
    const extensionContainer = DOM.append(sourceColumn, $(".extension-container"));
    const extensionLabel = DOM.append(extensionContainer, $("a.extension-label", { tabindex: 0 }));
    const extensionId = new HighlightedLabel(DOM.append(extensionContainer, $(".extension-id-container.code")));
    return { sourceColumn, sourceColumnHover, sourceLabel, extensionLabel, extensionContainer, extensionId, disposables: new DisposableStore() };
  }
  renderElement(keybindingItemEntry, index, templateData) {
    templateData.disposables.clear();
    if (isString(keybindingItemEntry.keybindingItem.source)) {
      templateData.extensionContainer.classList.add("hide");
      templateData.sourceLabel.element.classList.remove("hide");
      templateData.sourceColumnHover.update("");
      templateData.sourceLabel.set(keybindingItemEntry.keybindingItem.source || "-", keybindingItemEntry.sourceMatches);
    } else {
      templateData.extensionContainer.classList.remove("hide");
      templateData.sourceLabel.element.classList.add("hide");
      const extension = keybindingItemEntry.keybindingItem.source;
      const extensionLabel = extension.displayName ?? extension.identifier.value;
      templateData.sourceColumnHover.update(localize("extension label", "Extension ({0})", extensionLabel));
      templateData.extensionLabel.textContent = extensionLabel;
      templateData.disposables.add(onClick(templateData.extensionLabel, () => {
        this.extensionsWorkbenchService.open(extension.identifier.value);
      }));
      if (keybindingItemEntry.extensionIdMatches) {
        templateData.extensionId.element.classList.remove("hide");
        templateData.extensionId.set(extension.identifier.value, keybindingItemEntry.extensionIdMatches);
      } else {
        templateData.extensionId.element.classList.add("hide");
        templateData.extensionId.set(void 0);
      }
    }
  }
  disposeTemplate(templateData) {
    templateData.sourceColumnHover.dispose();
    templateData.disposables.dispose();
    templateData.sourceLabel.dispose();
    templateData.extensionId.dispose();
  }
};
SourceColumnRenderer.TEMPLATE_ID = "source";
SourceColumnRenderer = __decorateClass([
  __decorateParam(0, IExtensionsWorkbenchService),
  __decorateParam(1, IHoverService)
], SourceColumnRenderer);
let WhenInputWidget = class extends Disposable {
  constructor(parent, keybindingsEditor, instantiationService, contextKeyService) {
    super();
    this._onDidAccept = this._register(new Emitter());
    this.onDidAccept = this._onDidAccept.event;
    this._onDidReject = this._register(new Emitter());
    this.onDidReject = this._onDidReject.event;
    const focusContextKey = CONTEXT_WHEN_FOCUS.bindTo(contextKeyService);
    this.input = this._register(instantiationService.createInstance(SuggestEnabledInput, "keyboardshortcutseditor#wheninput", parent, {
      provideResults: () => {
        const result = [];
        for (const contextKey of RawContextKey.all()) {
          result.push({ label: contextKey.key, documentation: contextKey.description, detail: contextKey.type, kind: CompletionItemKind.Constant });
        }
        return result;
      },
      triggerCharacters: ["!", " "],
      wordDefinition: /[a-zA-Z.]+/,
      alwaysShowSuggestions: true
    }, "", `keyboardshortcutseditor#wheninput`, { focusContextKey, overflowWidgetsDomNode: keybindingsEditor.overflowWidgetsDomNode }));
    this._register(DOM.addDisposableListener(this.input.element, DOM.EventType.DBLCLICK, (e) => DOM.EventHelper.stop(e)));
    this._register(toDisposable(() => focusContextKey.reset()));
    this._register(keybindingsEditor.onAcceptWhenExpression(() => this._onDidAccept.fire(this.input.getValue())));
    this._register(Event.any(keybindingsEditor.onRejectWhenExpression, this.input.onDidBlur)(() => this._onDidReject.fire()));
  }
  layout(dimension) {
    this.input.layout(dimension);
  }
  show(value) {
    this.input.setValue(value);
    this.input.focus(true);
  }
};
WhenInputWidget = __decorateClass([
  __decorateParam(2, IInstantiationService),
  __decorateParam(3, IContextKeyService)
], WhenInputWidget);
let WhenColumnRenderer = class {
  constructor(keybindingsEditor, hoverService, instantiationService) {
    this.keybindingsEditor = keybindingsEditor;
    this.hoverService = hoverService;
    this.instantiationService = instantiationService;
    this.templateId = WhenColumnRenderer.TEMPLATE_ID;
  }
  renderTemplate(container) {
    const element = DOM.append(container, $(".when"));
    const whenLabelContainer = DOM.append(element, $("div.when-label"));
    const whenLabel = new HighlightedLabel(whenLabelContainer);
    const whenInputContainer = DOM.append(element, $("div.when-input-container"));
    return {
      element,
      whenLabelContainer,
      whenLabel,
      whenInputContainer,
      disposables: new DisposableStore()
    };
  }
  renderElement(keybindingItemEntry, index, templateData) {
    templateData.disposables.clear();
    const whenInputDisposables = templateData.disposables.add(new DisposableStore());
    templateData.disposables.add(this.keybindingsEditor.onDefineWhenExpression((e) => {
      if (keybindingItemEntry === e) {
        templateData.element.classList.add("input-mode");
        const inputWidget = whenInputDisposables.add(this.instantiationService.createInstance(WhenInputWidget, templateData.whenInputContainer, this.keybindingsEditor));
        inputWidget.layout(new DOM.Dimension(templateData.element.parentElement.clientWidth, 18));
        inputWidget.show(keybindingItemEntry.keybindingItem.when || "");
        const hideInputWidget = () => {
          whenInputDisposables.clear();
          templateData.element.classList.remove("input-mode");
          templateData.element.parentElement.style.paddingLeft = "10px";
          DOM.clearNode(templateData.whenInputContainer);
        };
        whenInputDisposables.add(inputWidget.onDidAccept((value) => {
          hideInputWidget();
          this.keybindingsEditor.updateKeybinding(keybindingItemEntry, keybindingItemEntry.keybindingItem.keybinding ? keybindingItemEntry.keybindingItem.keybinding.getUserSettingsLabel() || "" : "", value);
          this.keybindingsEditor.selectKeybinding(keybindingItemEntry);
        }));
        whenInputDisposables.add(inputWidget.onDidReject(() => {
          hideInputWidget();
          this.keybindingsEditor.selectKeybinding(keybindingItemEntry);
        }));
        templateData.element.parentElement.style.paddingLeft = "0px";
      }
    }));
    templateData.whenLabelContainer.classList.toggle("code", !!keybindingItemEntry.keybindingItem.when);
    templateData.whenLabelContainer.classList.toggle("empty", !keybindingItemEntry.keybindingItem.when);
    if (keybindingItemEntry.keybindingItem.when) {
      templateData.whenLabel.set(keybindingItemEntry.keybindingItem.when, keybindingItemEntry.whenMatches, keybindingItemEntry.keybindingItem.when);
      templateData.disposables.add(this.hoverService.setupManagedHover(getDefaultHoverDelegate("mouse"), templateData.element, keybindingItemEntry.keybindingItem.when));
    } else {
      templateData.whenLabel.set("-");
    }
  }
  disposeTemplate(templateData) {
    templateData.disposables.dispose();
    templateData.whenLabel.dispose();
  }
};
WhenColumnRenderer.TEMPLATE_ID = "when";
WhenColumnRenderer = __decorateClass([
  __decorateParam(1, IHoverService),
  __decorateParam(2, IInstantiationService)
], WhenColumnRenderer);
class AccessibilityProvider {
  constructor(configurationService) {
    this.configurationService = configurationService;
  }
  getWidgetAriaLabel() {
    return localize("keybindingsLabel", "Keybindings");
  }
  getAriaLabel({ keybindingItem }) {
    const ariaLabel = [
      keybindingItem.commandLabel ? keybindingItem.commandLabel : keybindingItem.command,
      keybindingItem.keybinding?.getAriaLabel() || localize("noKeybinding", "No keybinding assigned"),
      keybindingItem.when ? keybindingItem.when : localize("noWhen", "No when context"),
      isString(keybindingItem.source) ? keybindingItem.source : keybindingItem.source.description ?? keybindingItem.source.identifier.value
    ];
    if (this.configurationService.getValue(AccessibilityVerbositySettingId.KeybindingsEditor)) {
      const kbEditorAriaLabel = localize("keyboard shortcuts aria label", "use space or enter to change the keybinding.");
      ariaLabel.push(kbEditorAriaLabel);
    }
    return ariaLabel.join(", ");
  }
}
registerColor("keybindingTable.headerBackground", tableOddRowsBackgroundColor, "Background color for the keyboard shortcuts table header.");
registerColor("keybindingTable.rowsBackground", tableOddRowsBackgroundColor, "Background color for the keyboard shortcuts table alternating rows.");
registerThemingParticipant((theme, collector) => {
  const foregroundColor = theme.getColor(foreground);
  if (foregroundColor) {
    const whenForegroundColor = foregroundColor.transparent(0.8).makeOpaque(WORKBENCH_BACKGROUND(theme));
    collector.addRule(`.keybindings-editor > .keybindings-body > .keybindings-table-container .monaco-table .monaco-table-tr .monaco-table-td .code { color: ${whenForegroundColor}; }`);
  }
  const listActiveSelectionForegroundColor = theme.getColor(listActiveSelectionForeground);
  const listActiveSelectionBackgroundColor = theme.getColor(listActiveSelectionBackground);
  if (listActiveSelectionForegroundColor && listActiveSelectionBackgroundColor) {
    const whenForegroundColor = listActiveSelectionForegroundColor.transparent(0.8).makeOpaque(listActiveSelectionBackgroundColor);
    collector.addRule(`.keybindings-editor > .keybindings-body > .keybindings-table-container .monaco-table.focused .monaco-list-row.selected .monaco-table-tr .monaco-table-td .code { color: ${whenForegroundColor}; }`);
  }
  const listInactiveSelectionForegroundColor = theme.getColor(listInactiveSelectionForeground);
  const listInactiveSelectionBackgroundColor = theme.getColor(listInactiveSelectionBackground);
  if (listInactiveSelectionForegroundColor && listInactiveSelectionBackgroundColor) {
    const whenForegroundColor = listInactiveSelectionForegroundColor.transparent(0.8).makeOpaque(listInactiveSelectionBackgroundColor);
    collector.addRule(`.keybindings-editor > .keybindings-body > .keybindings-table-container .monaco-table .monaco-list-row.selected .monaco-table-tr .monaco-table-td .code { color: ${whenForegroundColor}; }`);
  }
  const listFocusForegroundColor = theme.getColor(listFocusForeground);
  const listFocusBackgroundColor = theme.getColor(listFocusBackground);
  if (listFocusForegroundColor && listFocusBackgroundColor) {
    const whenForegroundColor = listFocusForegroundColor.transparent(0.8).makeOpaque(listFocusBackgroundColor);
    collector.addRule(`.keybindings-editor > .keybindings-body > .keybindings-table-container .monaco-table.focused .monaco-list-row.focused .monaco-table-tr .monaco-table-td .code { color: ${whenForegroundColor}; }`);
  }
  const listHoverForegroundColor = theme.getColor(listHoverForeground);
  const listHoverBackgroundColor = theme.getColor(listHoverBackground);
  if (listHoverForegroundColor && listHoverBackgroundColor) {
    const whenForegroundColor = listHoverForegroundColor.transparent(0.8).makeOpaque(listHoverBackgroundColor);
    collector.addRule(`.keybindings-editor > .keybindings-body > .keybindings-table-container .monaco-table.focused .monaco-list-row:hover:not(.focused):not(.selected) .monaco-table-tr .monaco-table-td .code { color: ${whenForegroundColor}; }`);
  }
});
export {
  KeybindingsEditor
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXHByZWZlcmVuY2VzXFxicm93c2VyXFxrZXliaW5kaW5nc0VkaXRvci50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG4vKiBlc2xpbnQtZGlzYWJsZSBsb2NhbC9jb2RlLW5vLWRhbmdlcm91cy10eXBlLWFzc2VydGlvbnMgKi9cblxuaW1wb3J0ICcuL21lZGlhL2tleWJpbmRpbmdzRWRpdG9yLmNzcyc7XG5pbXBvcnQgeyBsb2NhbGl6ZSB9IGZyb20gJy4uLy4uLy4uLy4uL25scy5qcyc7XG5pbXBvcnQgeyBEZWxheWVyIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vYXN5bmMuanMnO1xuaW1wb3J0ICogYXMgRE9NIGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci9kb20uanMnO1xuaW1wb3J0IHsgaXNJT1MsIE9TIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vcGxhdGZvcm0uanMnO1xuaW1wb3J0IHsgRGlzcG9zYWJsZSwgRGlzcG9zYWJsZVN0b3JlLCBJRGlzcG9zYWJsZSwgdG9EaXNwb3NhYmxlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IFRvZ2dsZUFjdGlvblZpZXdJdGVtIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL3VpL3RvZ2dsZS90b2dnbGUuanMnO1xuaW1wb3J0IHsgSGlnaGxpZ2h0ZWRMYWJlbCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci91aS9oaWdobGlnaHRlZGxhYmVsL2hpZ2hsaWdodGVkTGFiZWwuanMnO1xuaW1wb3J0IHsgS2V5YmluZGluZ0xhYmVsIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL3VpL2tleWJpbmRpbmdMYWJlbC9rZXliaW5kaW5nTGFiZWwuanMnO1xuaW1wb3J0IHsgSUFjdGlvbiwgQWN0aW9uLCBTZXBhcmF0b3IgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9hY3Rpb25zLmpzJztcbmltcG9ydCB7IEFjdGlvbkJhciB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci91aS9hY3Rpb25iYXIvYWN0aW9uYmFyLmpzJztcbmltcG9ydCB7IEVkaXRvclBhbmUgfSBmcm9tICcuLi8uLi8uLi9icm93c2VyL3BhcnRzL2VkaXRvci9lZGl0b3JQYW5lLmpzJztcbmltcG9ydCB7IElFZGl0b3JPcGVuQ29udGV4dCB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9lZGl0b3IuanMnO1xuaW1wb3J0IHsgSVRlbGVtZXRyeVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS90ZWxlbWV0cnkvY29tbW9uL3RlbGVtZXRyeS5qcyc7XG5pbXBvcnQgeyBJQ2xpcGJvYXJkU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NsaXBib2FyZC9jb21tb24vY2xpcGJvYXJkU2VydmljZS5qcyc7XG5pbXBvcnQgeyBLZXliaW5kaW5nc0VkaXRvck1vZGVsLCBLRVlCSU5ESU5HX0VOVFJZX1RFTVBMQVRFX0lEIH0gZnJvbSAnLi4vLi4vLi4vc2VydmljZXMvcHJlZmVyZW5jZXMvYnJvd3Nlci9rZXliaW5kaW5nc0VkaXRvck1vZGVsLmpzJztcbmltcG9ydCB7IElJbnN0YW50aWF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2luc3RhbnRpYXRpb24vY29tbW9uL2luc3RhbnRpYXRpb24uanMnO1xuaW1wb3J0IHsgSUtleWJpbmRpbmdTZXJ2aWNlLCBJVXNlckZyaWVuZGx5S2V5YmluZGluZyB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2tleWJpbmRpbmcvY29tbW9uL2tleWJpbmRpbmcuanMnO1xuaW1wb3J0IHsgRGVmaW5lS2V5YmluZGluZ1dpZGdldCwgS2V5YmluZGluZ3NTZWFyY2hXaWRnZXQgfSBmcm9tICcuL2tleWJpbmRpbmdXaWRnZXRzLmpzJztcbmltcG9ydCB7IENPTlRFWFRfS0VZQklORElOR19GT0NVUywgQ09OVEVYVF9LRVlCSU5ESU5HU19FRElUT1IsIENPTlRFWFRfS0VZQklORElOR1NfU0VBUkNIX0ZPQ1VTLCBDT05URVhUX0tFWUJJTkRJTkdTX1NFQVJDSF9IQVNfVkFMVUUsIEtFWUJJTkRJTkdTX0VESVRPUl9DT01NQU5EX1JFQ09SRF9TRUFSQ0hfS0VZUywgS0VZQklORElOR1NfRURJVE9SX0NPTU1BTkRfU09SVEJZX1BSRUNFREVOQ0UsIEtFWUJJTkRJTkdTX0VESVRPUl9DT01NQU5EX0RFRklORSwgS0VZQklORElOR1NfRURJVE9SX0NPTU1BTkRfUkVNT1ZFLCBLRVlCSU5ESU5HU19FRElUT1JfQ09NTUFORF9SRVNFVCwgS0VZQklORElOR1NfRURJVE9SX0NPTU1BTkRfQ09QWSwgS0VZQklORElOR1NfRURJVE9SX0NPTU1BTkRfQ09QWV9DT01NQU5ELCBLRVlCSU5ESU5HU19FRElUT1JfQ09NTUFORF9DTEVBUl9TRUFSQ0hfUkVTVUxUUywgS0VZQklORElOR1NfRURJVE9SX0NPTU1BTkRfREVGSU5FX1dIRU4sIEtFWUJJTkRJTkdTX0VESVRPUl9DT01NQU5EX1NIT1dfU0lNSUxBUiwgS0VZQklORElOR1NfRURJVE9SX0NPTU1BTkRfQURELCBLRVlCSU5ESU5HU19FRElUT1JfQ09NTUFORF9DT1BZX0NPTU1BTkRfVElUTEUsIENPTlRFWFRfV0hFTl9GT0NVUyB9IGZyb20gJy4uL2NvbW1vbi9wcmVmZXJlbmNlcy5qcyc7XG5pbXBvcnQgeyBJQ29udGV4dE1lbnVTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29udGV4dHZpZXcvYnJvd3Nlci9jb250ZXh0Vmlldy5qcyc7XG5pbXBvcnQgeyBJS2V5YmluZGluZ0VkaXRpbmdTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vc2VydmljZXMva2V5YmluZGluZy9jb21tb24va2V5YmluZGluZ0VkaXRpbmcuanMnO1xuaW1wb3J0IHsgSUxpc3RDb250ZXh0TWVudUV2ZW50IH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL3VpL2xpc3QvbGlzdC5qcyc7XG5pbXBvcnQgeyBJVGhlbWVTZXJ2aWNlLCByZWdpc3RlclRoZW1pbmdQYXJ0aWNpcGFudCwgSUNvbG9yVGhlbWUsIElDc3NTdHlsZUNvbGxlY3RvciB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3RoZW1lL2NvbW1vbi90aGVtZVNlcnZpY2UuanMnO1xuaW1wb3J0IHsgVGhlbWVJY29uIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdGhlbWFibGVzLmpzJztcbmltcG9ydCB7IElDb250ZXh0S2V5U2VydmljZSwgSUNvbnRleHRLZXksIFJhd0NvbnRleHRLZXkgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb250ZXh0a2V5L2NvbW1vbi9jb250ZXh0a2V5LmpzJztcbmltcG9ydCB7IEtleUNvZGUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9rZXlDb2Rlcy5qcyc7XG5pbXBvcnQgeyBiYWRnZUJhY2tncm91bmQsIGNvbnRyYXN0Qm9yZGVyLCBiYWRnZUZvcmVncm91bmQsIGxpc3RBY3RpdmVTZWxlY3Rpb25Gb3JlZ3JvdW5kLCBsaXN0SW5hY3RpdmVTZWxlY3Rpb25Gb3JlZ3JvdW5kLCBsaXN0SG92ZXJGb3JlZ3JvdW5kLCBsaXN0Rm9jdXNGb3JlZ3JvdW5kLCBlZGl0b3JCYWNrZ3JvdW5kLCBmb3JlZ3JvdW5kLCBsaXN0QWN0aXZlU2VsZWN0aW9uQmFja2dyb3VuZCwgbGlzdEluYWN0aXZlU2VsZWN0aW9uQmFja2dyb3VuZCwgbGlzdEZvY3VzQmFja2dyb3VuZCwgbGlzdEhvdmVyQmFja2dyb3VuZCwgcmVnaXN0ZXJDb2xvciwgdGFibGVPZGRSb3dzQmFja2dyb3VuZENvbG9yLCBhc0Nzc1ZhcmlhYmxlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vdGhlbWUvY29tbW9uL2NvbG9yUmVnaXN0cnkuanMnO1xuaW1wb3J0IHsgSUVkaXRvclNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9zZXJ2aWNlcy9lZGl0b3IvY29tbW9uL2VkaXRvclNlcnZpY2UuanMnO1xuaW1wb3J0IHsgRWRpdG9yRXh0ZW5zaW9uc1JlZ2lzdHJ5IH0gZnJvbSAnLi4vLi4vLi4vLi4vZWRpdG9yL2Jyb3dzZXIvZWRpdG9yRXh0ZW5zaW9ucy5qcyc7XG5pbXBvcnQgeyBXb3JrYmVuY2hUYWJsZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2xpc3QvYnJvd3Nlci9saXN0U2VydmljZS5qcyc7XG5pbXBvcnQgeyBJTm90aWZpY2F0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL25vdGlmaWNhdGlvbi9jb21tb24vbm90aWZpY2F0aW9uLmpzJztcbmltcG9ydCB7IENhbmNlbGxhdGlvblRva2VuIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vY2FuY2VsbGF0aW9uLmpzJztcbmltcG9ydCB7IElTdG9yYWdlU2VydmljZSwgU3RvcmFnZVNjb3BlLCBTdG9yYWdlVGFyZ2V0IH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vc3RvcmFnZS9jb21tb24vc3RvcmFnZS5qcyc7XG5pbXBvcnQgeyBFbWl0dGVyLCBFdmVudCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2V2ZW50LmpzJztcbmltcG9ydCB7IE1lbnVSZWdpc3RyeSwgTWVudUlkLCBpc0lNZW51SXRlbSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2FjdGlvbnMvY29tbW9uL2FjdGlvbnMuanMnO1xuaW1wb3J0IHsgSUxpc3RBY2Nlc3NpYmlsaXR5UHJvdmlkZXIgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvdWkvbGlzdC9saXN0V2lkZ2V0LmpzJztcbmltcG9ydCB7IFdPUktCRU5DSF9CQUNLR1JPVU5EIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL3RoZW1lLmpzJztcbmltcG9ydCB7IElLZXliaW5kaW5nSXRlbUVudHJ5LCBJS2V5YmluZGluZ3NFZGl0b3JQYW5lIH0gZnJvbSAnLi4vLi4vLi4vc2VydmljZXMvcHJlZmVyZW5jZXMvY29tbW9uL3ByZWZlcmVuY2VzLmpzJztcbmltcG9ydCB7IGtleWJpbmRpbmdzUmVjb3JkS2V5c0ljb24sIGtleWJpbmRpbmdzU29ydEljb24sIGtleWJpbmRpbmdzQWRkSWNvbiwgcHJlZmVyZW5jZXNDbGVhcklucHV0SWNvbiwga2V5YmluZGluZ3NFZGl0SWNvbiB9IGZyb20gJy4vcHJlZmVyZW5jZXNJY29ucy5qcyc7XG5pbXBvcnQgeyBJVGFibGVSZW5kZXJlciwgSVRhYmxlVmlydHVhbERlbGVnYXRlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL3VpL3RhYmxlL3RhYmxlLmpzJztcbmltcG9ydCB7IEtleWJpbmRpbmdzRWRpdG9ySW5wdXQgfSBmcm9tICcuLi8uLi8uLi9zZXJ2aWNlcy9wcmVmZXJlbmNlcy9icm93c2VyL2tleWJpbmRpbmdzRWRpdG9ySW5wdXQuanMnO1xuaW1wb3J0IHsgSUVkaXRvck9wdGlvbnMgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9lZGl0b3IvY29tbW9uL2VkaXRvci5qcyc7XG5pbXBvcnQgeyBUb29sQmFyIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL3VpL3Rvb2xiYXIvdG9vbGJhci5qcyc7XG5pbXBvcnQgeyBkZWZhdWx0S2V5YmluZGluZ0xhYmVsU3R5bGVzLCBkZWZhdWx0VG9nZ2xlU3R5bGVzLCBnZXRJbnB1dEJveFN0eWxlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vdGhlbWUvYnJvd3Nlci9kZWZhdWx0U3R5bGVzLmpzJztcbmltcG9ydCB7IElFeHRlbnNpb25zV29ya2JlbmNoU2VydmljZSB9IGZyb20gJy4uLy4uL2V4dGVuc2lvbnMvY29tbW9uL2V4dGVuc2lvbnMuanMnO1xuaW1wb3J0IHsgU3RhbmRhcmRLZXlib2FyZEV2ZW50IH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL2tleWJvYXJkRXZlbnQuanMnO1xuaW1wb3J0IHsgaXNTdHJpbmcgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi90eXBlcy5qcyc7XG5pbXBvcnQgeyBTdWdnZXN0RW5hYmxlZElucHV0IH0gZnJvbSAnLi4vLi4vY29kZUVkaXRvci9icm93c2VyL3N1Z2dlc3RFbmFibGVkSW5wdXQvc3VnZ2VzdEVuYWJsZWRJbnB1dC5qcyc7XG5pbXBvcnQgeyBDb21wbGV0aW9uSXRlbUtpbmQgfSBmcm9tICcuLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL2xhbmd1YWdlcy5qcyc7XG5pbXBvcnQgeyBzZXR0aW5nc1RleHRJbnB1dEJvcmRlciB9IGZyb20gJy4uL2NvbW1vbi9zZXR0aW5nc0VkaXRvckNvbG9yUmVnaXN0cnkuanMnO1xuaW1wb3J0IHsgSUNvbmZpZ3VyYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29uZmlndXJhdGlvbi9jb21tb24vY29uZmlndXJhdGlvbi5qcyc7XG5pbXBvcnQgeyBBY2Nlc3NpYmlsaXR5VmVyYm9zaXR5U2V0dGluZ0lkIH0gZnJvbSAnLi4vLi4vYWNjZXNzaWJpbGl0eS9icm93c2VyL2FjY2Vzc2liaWxpdHlDb25maWd1cmF0aW9uLmpzJztcbmltcG9ydCB7IHJlZ2lzdGVyTmF2aWdhYmxlQ29udGFpbmVyIH0gZnJvbSAnLi4vLi4vLi4vYnJvd3Nlci9hY3Rpb25zL3dpZGdldE5hdmlnYXRpb25Db21tYW5kcy5qcyc7XG5pbXBvcnQgeyBJQWN0aW9uVmlld0l0ZW1PcHRpb25zIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL3VpL2FjdGlvbmJhci9hY3Rpb25WaWV3SXRlbXMuanMnO1xuaW1wb3J0IHsgZ2V0RGVmYXVsdEhvdmVyRGVsZWdhdGUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvdWkvaG92ZXIvaG92ZXJEZWxlZ2F0ZUZhY3RvcnkuanMnO1xuaW1wb3J0IHsgSUVkaXRvckdyb3VwIH0gZnJvbSAnLi4vLi4vLi4vc2VydmljZXMvZWRpdG9yL2NvbW1vbi9lZGl0b3JHcm91cHNTZXJ2aWNlLmpzJztcbmltcG9ydCB0eXBlIHsgSU1hbmFnZWRIb3ZlciB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci91aS9ob3Zlci9ob3Zlci5qcyc7XG5pbXBvcnQgeyBJSG92ZXJTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vaG92ZXIvYnJvd3Nlci9ob3Zlci5qcyc7XG5pbXBvcnQgeyBJQWNjZXNzaWJpbGl0eVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9hY2Nlc3NpYmlsaXR5L2NvbW1vbi9hY2Nlc3NpYmlsaXR5LmpzJztcblxuY29uc3QgJCA9IERPTS4kO1xuXG5pbnRlcmZhY2UgSUtleWJpbmRpbmdzRWRpdG9yTWVtZW50byB7XG5cdHNlYXJjaEhpc3Rvcnk/OiBzdHJpbmdbXTtcbn1cblxuZXhwb3J0IGNsYXNzIEtleWJpbmRpbmdzRWRpdG9yIGV4dGVuZHMgRWRpdG9yUGFuZTxJS2V5YmluZGluZ3NFZGl0b3JNZW1lbnRvPiBpbXBsZW1lbnRzIElLZXliaW5kaW5nc0VkaXRvclBhbmUge1xuXG5cdHN0YXRpYyByZWFkb25seSBJRDogc3RyaW5nID0gJ3dvcmtiZW5jaC5lZGl0b3Iua2V5YmluZGluZ3MnO1xuXG5cdHByaXZhdGUgX29uRGVmaW5lV2hlbkV4cHJlc3Npb246IEVtaXR0ZXI8SUtleWJpbmRpbmdJdGVtRW50cnk+ID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8SUtleWJpbmRpbmdJdGVtRW50cnk+KCkpO1xuXHRyZWFkb25seSBvbkRlZmluZVdoZW5FeHByZXNzaW9uOiBFdmVudDxJS2V5YmluZGluZ0l0ZW1FbnRyeT4gPSB0aGlzLl9vbkRlZmluZVdoZW5FeHByZXNzaW9uLmV2ZW50O1xuXG5cdHByaXZhdGUgX29uUmVqZWN0V2hlbkV4cHJlc3Npb24gPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjxJS2V5YmluZGluZ0l0ZW1FbnRyeT4oKSk7XG5cdHJlYWRvbmx5IG9uUmVqZWN0V2hlbkV4cHJlc3Npb24gPSB0aGlzLl9vblJlamVjdFdoZW5FeHByZXNzaW9uLmV2ZW50O1xuXG5cdHByaXZhdGUgX29uQWNjZXB0V2hlbkV4cHJlc3Npb24gPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjxJS2V5YmluZGluZ0l0ZW1FbnRyeT4oKSk7XG5cdHJlYWRvbmx5IG9uQWNjZXB0V2hlbkV4cHJlc3Npb24gPSB0aGlzLl9vbkFjY2VwdFdoZW5FeHByZXNzaW9uLmV2ZW50O1xuXG5cdHByaXZhdGUgX29uTGF5b3V0OiBFbWl0dGVyPHZvaWQ+ID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8dm9pZD4oKSk7XG5cdHJlYWRvbmx5IG9uTGF5b3V0OiBFdmVudDx2b2lkPiA9IHRoaXMuX29uTGF5b3V0LmV2ZW50O1xuXG5cdHByaXZhdGUga2V5YmluZGluZ3NFZGl0b3JNb2RlbDogS2V5YmluZGluZ3NFZGl0b3JNb2RlbCB8IG51bGwgPSBudWxsO1xuXG5cdHByaXZhdGUgaGVhZGVyQ29udGFpbmVyITogSFRNTEVsZW1lbnQ7XG5cdHByaXZhdGUgYWN0aW9uc0NvbnRhaW5lciE6IEhUTUxFbGVtZW50O1xuXHRwcml2YXRlIHNlYXJjaFdpZGdldCE6IEtleWJpbmRpbmdzU2VhcmNoV2lkZ2V0O1xuXHRwcml2YXRlIHNlYXJjaEhpc3RvcnlEZWxheWVyOiBEZWxheWVyPHZvaWQ+O1xuXG5cdHByaXZhdGUgb3ZlcmxheUNvbnRhaW5lciE6IEhUTUxFbGVtZW50O1xuXHRwcml2YXRlIGRlZmluZUtleWJpbmRpbmdXaWRnZXQhOiBEZWZpbmVLZXliaW5kaW5nV2lkZ2V0O1xuXG5cdHByaXZhdGUgdW5Bc3NpZ25lZEtleWJpbmRpbmdJdGVtVG9SZXZlYWxBbmRGb2N1czogSUtleWJpbmRpbmdJdGVtRW50cnkgfCBudWxsID0gbnVsbDtcblx0cHJpdmF0ZSB0YWJsZUVudHJpZXM6IElLZXliaW5kaW5nSXRlbUVudHJ5W10gPSBbXTtcblx0cHJpdmF0ZSBrZXliaW5kaW5nc1RhYmxlQ29udGFpbmVyITogSFRNTEVsZW1lbnQ7XG5cdHByaXZhdGUga2V5YmluZGluZ3NUYWJsZSE6IFdvcmtiZW5jaFRhYmxlPElLZXliaW5kaW5nSXRlbUVudHJ5PjtcblxuXHRwcml2YXRlIGRpbWVuc2lvbjogRE9NLkRpbWVuc2lvbiB8IG51bGwgPSBudWxsO1xuXHRwcml2YXRlIGRlbGF5ZWRGaWx0ZXJpbmc6IERlbGF5ZXI8dm9pZD47XG5cdHByaXZhdGUgbGF0ZXN0RW1wdHlGaWx0ZXJzOiBzdHJpbmdbXSA9IFtdO1xuXHRwcml2YXRlIGtleWJpbmRpbmdzRWRpdG9yQ29udGV4dEtleTogSUNvbnRleHRLZXk8Ym9vbGVhbj47XG5cdHByaXZhdGUga2V5YmluZGluZ0ZvY3VzQ29udGV4dEtleTogSUNvbnRleHRLZXk8Ym9vbGVhbj47XG5cdHByaXZhdGUgc2VhcmNoRm9jdXNDb250ZXh0S2V5OiBJQ29udGV4dEtleTxib29sZWFuPjtcblx0cHJpdmF0ZSBzZWFyY2hIYXNWYWx1ZUNvbnRleHRLZXk6IElDb250ZXh0S2V5PGJvb2xlYW4+O1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgc29ydEJ5UHJlY2VkZW5jZUFjdGlvbjogQWN0aW9uO1xuXHRwcml2YXRlIHJlYWRvbmx5IHJlY29yZEtleXNBY3Rpb246IEFjdGlvbjtcblxuXHRwcml2YXRlIGFyaWFMYWJlbEVsZW1lbnQhOiBIVE1MRWxlbWVudDtcblx0cmVhZG9ubHkgb3ZlcmZsb3dXaWRnZXRzRG9tTm9kZTogSFRNTEVsZW1lbnQ7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0Z3JvdXA6IElFZGl0b3JHcm91cCxcblx0XHRASVRlbGVtZXRyeVNlcnZpY2UgdGVsZW1ldHJ5U2VydmljZTogSVRlbGVtZXRyeVNlcnZpY2UsXG5cdFx0QElUaGVtZVNlcnZpY2UgdGhlbWVTZXJ2aWNlOiBJVGhlbWVTZXJ2aWNlLFxuXHRcdEBJS2V5YmluZGluZ1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBrZXliaW5kaW5nc1NlcnZpY2U6IElLZXliaW5kaW5nU2VydmljZSxcblx0XHRASUNvbnRleHRNZW51U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGNvbnRleHRNZW51U2VydmljZTogSUNvbnRleHRNZW51U2VydmljZSxcblx0XHRASUtleWJpbmRpbmdFZGl0aW5nU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGtleWJpbmRpbmdFZGl0aW5nU2VydmljZTogSUtleWJpbmRpbmdFZGl0aW5nU2VydmljZSxcblx0XHRASUNvbnRleHRLZXlTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgY29udGV4dEtleVNlcnZpY2U6IElDb250ZXh0S2V5U2VydmljZSxcblx0XHRASU5vdGlmaWNhdGlvblNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBub3RpZmljYXRpb25TZXJ2aWNlOiBJTm90aWZpY2F0aW9uU2VydmljZSxcblx0XHRASUNsaXBib2FyZFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBjbGlwYm9hcmRTZXJ2aWNlOiBJQ2xpcGJvYXJkU2VydmljZSxcblx0XHRASUluc3RhbnRpYXRpb25TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgaW5zdGFudGlhdGlvblNlcnZpY2U6IElJbnN0YW50aWF0aW9uU2VydmljZSxcblx0XHRASUVkaXRvclNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBlZGl0b3JTZXJ2aWNlOiBJRWRpdG9yU2VydmljZSxcblx0XHRASVN0b3JhZ2VTZXJ2aWNlIHN0b3JhZ2VTZXJ2aWNlOiBJU3RvcmFnZVNlcnZpY2UsXG5cdFx0QElDb25maWd1cmF0aW9uU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGNvbmZpZ3VyYXRpb25TZXJ2aWNlOiBJQ29uZmlndXJhdGlvblNlcnZpY2UsXG5cdFx0QElBY2Nlc3NpYmlsaXR5U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGFjY2Vzc2liaWxpdHlTZXJ2aWNlOiBJQWNjZXNzaWJpbGl0eVNlcnZpY2Vcblx0KSB7XG5cdFx0c3VwZXIoS2V5YmluZGluZ3NFZGl0b3IuSUQsIGdyb3VwLCB0ZWxlbWV0cnlTZXJ2aWNlLCB0aGVtZVNlcnZpY2UsIHN0b3JhZ2VTZXJ2aWNlKTtcblx0XHR0aGlzLmRlbGF5ZWRGaWx0ZXJpbmcgPSB0aGlzLl9yZWdpc3RlcihuZXcgRGVsYXllcjx2b2lkPigzMDApKTtcblx0XHR0aGlzLl9yZWdpc3RlcihrZXliaW5kaW5nc1NlcnZpY2Uub25EaWRVcGRhdGVLZXliaW5kaW5ncygoKSA9PiB0aGlzLnJlbmRlcighIXRoaXMua2V5YmluZGluZ0ZvY3VzQ29udGV4dEtleS5nZXQoKSkpKTtcblxuXHRcdHRoaXMua2V5YmluZGluZ3NFZGl0b3JDb250ZXh0S2V5ID0gQ09OVEVYVF9LRVlCSU5ESU5HU19FRElUT1IuYmluZFRvKHRoaXMuY29udGV4dEtleVNlcnZpY2UpO1xuXHRcdHRoaXMuc2VhcmNoRm9jdXNDb250ZXh0S2V5ID0gQ09OVEVYVF9LRVlCSU5ESU5HU19TRUFSQ0hfRk9DVVMuYmluZFRvKHRoaXMuY29udGV4dEtleVNlcnZpY2UpO1xuXHRcdHRoaXMua2V5YmluZGluZ0ZvY3VzQ29udGV4dEtleSA9IENPTlRFWFRfS0VZQklORElOR19GT0NVUy5iaW5kVG8odGhpcy5jb250ZXh0S2V5U2VydmljZSk7XG5cdFx0dGhpcy5zZWFyY2hIYXNWYWx1ZUNvbnRleHRLZXkgPSBDT05URVhUX0tFWUJJTkRJTkdTX1NFQVJDSF9IQVNfVkFMVUUuYmluZFRvKHRoaXMuY29udGV4dEtleVNlcnZpY2UpO1xuXHRcdHRoaXMuc2VhcmNoSGlzdG9yeURlbGF5ZXIgPSB0aGlzLl9yZWdpc3RlcihuZXcgRGVsYXllcjx2b2lkPig1MDApKTtcblxuXHRcdHRoaXMucmVjb3JkS2V5c0FjdGlvbiA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBBY3Rpb24oS0VZQklORElOR1NfRURJVE9SX0NPTU1BTkRfUkVDT1JEX1NFQVJDSF9LRVlTLCBsb2NhbGl6ZSgncmVjb3JkS2V5c0xhYmVsJywgXCJSZWNvcmQgS2V5c1wiKSwgVGhlbWVJY29uLmFzQ2xhc3NOYW1lKGtleWJpbmRpbmdzUmVjb3JkS2V5c0ljb24pKSk7XG5cdFx0dGhpcy5yZWNvcmRLZXlzQWN0aW9uLmNoZWNrZWQgPSBmYWxzZTtcblxuXHRcdHRoaXMuc29ydEJ5UHJlY2VkZW5jZUFjdGlvbiA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBBY3Rpb24oS0VZQklORElOR1NfRURJVE9SX0NPTU1BTkRfU09SVEJZX1BSRUNFREVOQ0UsIGxvY2FsaXplKCdzb3J0QnlQcmVjZWRlbmVMYWJlbCcsIFwiU29ydCBieSBQcmVjZWRlbmNlIChIaWdoZXN0IGZpcnN0KVwiKSwgVGhlbWVJY29uLmFzQ2xhc3NOYW1lKGtleWJpbmRpbmdzU29ydEljb24pKSk7XG5cdFx0dGhpcy5zb3J0QnlQcmVjZWRlbmNlQWN0aW9uLmNoZWNrZWQgPSBmYWxzZTtcblx0XHR0aGlzLm92ZXJmbG93V2lkZ2V0c0RvbU5vZGUgPSAkKCcua2V5YmluZGluZ3Mtb3ZlcmZsb3ctd2lkZ2V0cy1jb250YWluZXIubW9uYWNvLWVkaXRvcicpO1xuXHR9XG5cblx0b3ZlcnJpZGUgY3JlYXRlKHBhcmVudDogSFRNTEVsZW1lbnQpOiB2b2lkIHtcblx0XHRzdXBlci5jcmVhdGUocGFyZW50KTtcblx0XHR0aGlzLl9yZWdpc3RlcihyZWdpc3Rlck5hdmlnYWJsZUNvbnRhaW5lcih7XG5cdFx0XHRuYW1lOiAna2V5YmluZGluZ3NFZGl0b3InLFxuXHRcdFx0Zm9jdXNOb3RpZmllcnM6IFt0aGlzXSxcblx0XHRcdGZvY3VzTmV4dFdpZGdldDogKCkgPT4ge1xuXHRcdFx0XHRpZiAodGhpcy5zZWFyY2hXaWRnZXQuaGFzRm9jdXMoKSkge1xuXHRcdFx0XHRcdHRoaXMuZm9jdXNLZXliaW5kaW5ncygpO1xuXHRcdFx0XHR9XG5cdFx0XHR9LFxuXHRcdFx0Zm9jdXNQcmV2aW91c1dpZGdldDogKCkgPT4ge1xuXHRcdFx0XHRpZiAoIXRoaXMuc2VhcmNoV2lkZ2V0Lmhhc0ZvY3VzKCkpIHtcblx0XHRcdFx0XHR0aGlzLmZvY3VzU2VhcmNoKCk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9KSk7XG5cdH1cblxuXHRwcm90ZWN0ZWQgY3JlYXRlRWRpdG9yKHBhcmVudDogSFRNTEVsZW1lbnQpOiB2b2lkIHtcblx0XHRjb25zdCBrZXliaW5kaW5nc0VkaXRvckVsZW1lbnQgPSBET00uYXBwZW5kKHBhcmVudCwgJCgnZGl2JywgeyBjbGFzczogJ2tleWJpbmRpbmdzLWVkaXRvcicgfSkpO1xuXG5cdFx0dGhpcy5jcmVhdGVBcmlhTGFiZWxFbGVtZW50KGtleWJpbmRpbmdzRWRpdG9yRWxlbWVudCk7XG5cdFx0dGhpcy5jcmVhdGVPdmVybGF5Q29udGFpbmVyKGtleWJpbmRpbmdzRWRpdG9yRWxlbWVudCk7XG5cdFx0dGhpcy5jcmVhdGVIZWFkZXIoa2V5YmluZGluZ3NFZGl0b3JFbGVtZW50KTtcblx0XHR0aGlzLmNyZWF0ZUJvZHkoa2V5YmluZGluZ3NFZGl0b3JFbGVtZW50KTtcblx0fVxuXG5cdG92ZXJyaWRlIHNldElucHV0KGlucHV0OiBLZXliaW5kaW5nc0VkaXRvcklucHV0LCBvcHRpb25zOiBJRWRpdG9yT3B0aW9ucyB8IHVuZGVmaW5lZCwgY29udGV4dDogSUVkaXRvck9wZW5Db250ZXh0LCB0b2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4pOiBQcm9taXNlPHZvaWQ+IHtcblx0XHR0aGlzLmtleWJpbmRpbmdzRWRpdG9yQ29udGV4dEtleS5zZXQodHJ1ZSk7XG5cdFx0cmV0dXJuIHN1cGVyLnNldElucHV0KGlucHV0LCBvcHRpb25zLCBjb250ZXh0LCB0b2tlbilcblx0XHRcdC50aGVuKCgpID0+IHRoaXMucmVuZGVyKCEhKG9wdGlvbnMgJiYgb3B0aW9ucy5wcmVzZXJ2ZUZvY3VzKSkpO1xuXHR9XG5cblx0b3ZlcnJpZGUgY2xlYXJJbnB1dCgpOiB2b2lkIHtcblx0XHRzdXBlci5jbGVhcklucHV0KCk7XG5cdFx0dGhpcy5rZXliaW5kaW5nc0VkaXRvckNvbnRleHRLZXkucmVzZXQoKTtcblx0XHR0aGlzLmtleWJpbmRpbmdGb2N1c0NvbnRleHRLZXkucmVzZXQoKTtcblx0fVxuXG5cdGxheW91dChkaW1lbnNpb246IERPTS5EaW1lbnNpb24pOiB2b2lkIHtcblx0XHR0aGlzLmRpbWVuc2lvbiA9IGRpbWVuc2lvbjtcblx0XHR0aGlzLmxheW91dFNlYXJjaFdpZGdldChkaW1lbnNpb24pO1xuXG5cdFx0dGhpcy5vdmVybGF5Q29udGFpbmVyLnN0eWxlLndpZHRoID0gZGltZW5zaW9uLndpZHRoICsgJ3B4Jztcblx0XHR0aGlzLm92ZXJsYXlDb250YWluZXIuc3R5bGUuaGVpZ2h0ID0gZGltZW5zaW9uLmhlaWdodCArICdweCc7XG5cdFx0dGhpcy5kZWZpbmVLZXliaW5kaW5nV2lkZ2V0LmxheW91dCh0aGlzLmRpbWVuc2lvbik7XG5cblx0XHR0aGlzLmxheW91dEtleWJpbmRpbmdzVGFibGUoKTtcblx0XHR0aGlzLl9vbkxheW91dC5maXJlKCk7XG5cdH1cblxuXHRvdmVycmlkZSBmb2N1cygpOiB2b2lkIHtcblx0XHRzdXBlci5mb2N1cygpO1xuXG5cdFx0Y29uc3QgYWN0aXZlS2V5YmluZGluZ0VudHJ5ID0gdGhpcy5hY3RpdmVLZXliaW5kaW5nRW50cnk7XG5cdFx0aWYgKGFjdGl2ZUtleWJpbmRpbmdFbnRyeSkge1xuXHRcdFx0dGhpcy5zZWxlY3RFbnRyeShhY3RpdmVLZXliaW5kaW5nRW50cnkpO1xuXHRcdH0gZWxzZSBpZiAoIWlzSU9TKSB7XG5cdFx0XHR0aGlzLnNlYXJjaFdpZGdldC5mb2N1cygpO1xuXHRcdH1cblx0fVxuXG5cdGdldCBhY3RpdmVLZXliaW5kaW5nRW50cnkoKTogSUtleWJpbmRpbmdJdGVtRW50cnkgfCBudWxsIHtcblx0XHRjb25zdCBmb2N1c2VkRWxlbWVudCA9IHRoaXMua2V5YmluZGluZ3NUYWJsZS5nZXRGb2N1c2VkRWxlbWVudHMoKVswXTtcblx0XHRyZXR1cm4gZm9jdXNlZEVsZW1lbnQgJiYgZm9jdXNlZEVsZW1lbnQudGVtcGxhdGVJZCA9PT0gS0VZQklORElOR19FTlRSWV9URU1QTEFURV9JRCA/IDxJS2V5YmluZGluZ0l0ZW1FbnRyeT5mb2N1c2VkRWxlbWVudCA6IG51bGw7XG5cdH1cblxuXHRhc3luYyBkZWZpbmVLZXliaW5kaW5nKGtleWJpbmRpbmdFbnRyeTogSUtleWJpbmRpbmdJdGVtRW50cnksIGFkZDogYm9vbGVhbik6IFByb21pc2U8dm9pZD4ge1xuXHRcdHRoaXMuc2VsZWN0RW50cnkoa2V5YmluZGluZ0VudHJ5KTtcblx0XHR0aGlzLnNob3dPdmVybGF5Q29udGFpbmVyKCk7XG5cdFx0dHJ5IHtcblx0XHRcdGNvbnN0IGtleSA9IGF3YWl0IHRoaXMuZGVmaW5lS2V5YmluZGluZ1dpZGdldC5kZWZpbmUoKTtcblx0XHRcdGlmIChrZXkpIHtcblx0XHRcdFx0YXdhaXQgdGhpcy51cGRhdGVLZXliaW5kaW5nKGtleWJpbmRpbmdFbnRyeSwga2V5LCBrZXliaW5kaW5nRW50cnkua2V5YmluZGluZ0l0ZW0ud2hlbiwgYWRkKTtcblx0XHRcdH1cblx0XHR9IGNhdGNoIChlcnJvcikge1xuXHRcdFx0dGhpcy5vbktleWJpbmRpbmdFZGl0aW5nRXJyb3IoZXJyb3IpO1xuXHRcdH0gZmluYWxseSB7XG5cdFx0XHR0aGlzLmhpZGVPdmVybGF5Q29udGFpbmVyKCk7XG5cdFx0XHR0aGlzLnNlbGVjdEVudHJ5KGtleWJpbmRpbmdFbnRyeSk7XG5cdFx0fVxuXHR9XG5cblx0ZGVmaW5lV2hlbkV4cHJlc3Npb24oa2V5YmluZGluZ0VudHJ5OiBJS2V5YmluZGluZ0l0ZW1FbnRyeSk6IHZvaWQge1xuXHRcdGlmIChrZXliaW5kaW5nRW50cnkua2V5YmluZGluZ0l0ZW0ua2V5YmluZGluZykge1xuXHRcdFx0dGhpcy5zZWxlY3RFbnRyeShrZXliaW5kaW5nRW50cnkpO1xuXHRcdFx0dGhpcy5fb25EZWZpbmVXaGVuRXhwcmVzc2lvbi5maXJlKGtleWJpbmRpbmdFbnRyeSk7XG5cdFx0fVxuXHR9XG5cblx0cmVqZWN0V2hlbkV4cHJlc3Npb24oa2V5YmluZGluZ0VudHJ5OiBJS2V5YmluZGluZ0l0ZW1FbnRyeSk6IHZvaWQge1xuXHRcdHRoaXMuX29uUmVqZWN0V2hlbkV4cHJlc3Npb24uZmlyZShrZXliaW5kaW5nRW50cnkpO1xuXHR9XG5cblx0YWNjZXB0V2hlbkV4cHJlc3Npb24oa2V5YmluZGluZ0VudHJ5OiBJS2V5YmluZGluZ0l0ZW1FbnRyeSk6IHZvaWQge1xuXHRcdHRoaXMuX29uQWNjZXB0V2hlbkV4cHJlc3Npb24uZmlyZShrZXliaW5kaW5nRW50cnkpO1xuXHR9XG5cblx0YXN5bmMgdXBkYXRlS2V5YmluZGluZyhrZXliaW5kaW5nRW50cnk6IElLZXliaW5kaW5nSXRlbUVudHJ5LCBrZXk6IHN0cmluZywgd2hlbjogc3RyaW5nIHwgdW5kZWZpbmVkLCBhZGQ/OiBib29sZWFuKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3QgY3VycmVudEtleSA9IGtleWJpbmRpbmdFbnRyeS5rZXliaW5kaW5nSXRlbS5rZXliaW5kaW5nID8ga2V5YmluZGluZ0VudHJ5LmtleWJpbmRpbmdJdGVtLmtleWJpbmRpbmcuZ2V0VXNlclNldHRpbmdzTGFiZWwoKSA6ICcnO1xuXHRcdGlmIChjdXJyZW50S2V5ICE9PSBrZXkgfHwga2V5YmluZGluZ0VudHJ5LmtleWJpbmRpbmdJdGVtLndoZW4gIT09IHdoZW4pIHtcblx0XHRcdGlmIChhZGQpIHtcblx0XHRcdFx0YXdhaXQgdGhpcy5rZXliaW5kaW5nRWRpdGluZ1NlcnZpY2UuYWRkS2V5YmluZGluZyhrZXliaW5kaW5nRW50cnkua2V5YmluZGluZ0l0ZW0ua2V5YmluZGluZ0l0ZW0sIGtleSwgd2hlbiB8fCB1bmRlZmluZWQpO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0YXdhaXQgdGhpcy5rZXliaW5kaW5nRWRpdGluZ1NlcnZpY2UuZWRpdEtleWJpbmRpbmcoa2V5YmluZGluZ0VudHJ5LmtleWJpbmRpbmdJdGVtLmtleWJpbmRpbmdJdGVtLCBrZXksIHdoZW4gfHwgdW5kZWZpbmVkKTtcblx0XHRcdH1cblx0XHRcdGlmICgha2V5YmluZGluZ0VudHJ5LmtleWJpbmRpbmdJdGVtLmtleWJpbmRpbmcpIHsgLy8gcmV2ZWFsIG9ubHkgaWYga2V5YmluZGluZyB3YXMgYWRkZWQgdG8gdW5hc3NpbmdlZC4gQmVjYXVzZSB0aGUgZW50cnkgd2lsbCBiZSBwbGFjZWQgaW4gZGlmZmVyZW50IHBvc2l0aW9uIGFmdGVyIHJlbmRlcmluZ1xuXHRcdFx0XHR0aGlzLnVuQXNzaWduZWRLZXliaW5kaW5nSXRlbVRvUmV2ZWFsQW5kRm9jdXMgPSBrZXliaW5kaW5nRW50cnk7XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG5cblx0YXN5bmMgcmVtb3ZlS2V5YmluZGluZyhrZXliaW5kaW5nRW50cnk6IElLZXliaW5kaW5nSXRlbUVudHJ5KTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0dGhpcy5zZWxlY3RFbnRyeShrZXliaW5kaW5nRW50cnkpO1xuXHRcdGlmIChrZXliaW5kaW5nRW50cnkua2V5YmluZGluZ0l0ZW0ua2V5YmluZGluZykgeyAvLyBUaGlzIHNob3VsZCBiZSBhIHByZS1jb25kaXRpb25cblx0XHRcdHRyeSB7XG5cdFx0XHRcdGF3YWl0IHRoaXMua2V5YmluZGluZ0VkaXRpbmdTZXJ2aWNlLnJlbW92ZUtleWJpbmRpbmcoa2V5YmluZGluZ0VudHJ5LmtleWJpbmRpbmdJdGVtLmtleWJpbmRpbmdJdGVtKTtcblx0XHRcdFx0dGhpcy5mb2N1cygpO1xuXHRcdFx0fSBjYXRjaCAoZXJyb3IpIHtcblx0XHRcdFx0dGhpcy5vbktleWJpbmRpbmdFZGl0aW5nRXJyb3IoZXJyb3IpO1xuXHRcdFx0XHR0aGlzLnNlbGVjdEVudHJ5KGtleWJpbmRpbmdFbnRyeSk7XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG5cblx0YXN5bmMgcmVzZXRLZXliaW5kaW5nKGtleWJpbmRpbmdFbnRyeTogSUtleWJpbmRpbmdJdGVtRW50cnkpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHR0aGlzLnNlbGVjdEVudHJ5KGtleWJpbmRpbmdFbnRyeSk7XG5cdFx0dHJ5IHtcblx0XHRcdGF3YWl0IHRoaXMua2V5YmluZGluZ0VkaXRpbmdTZXJ2aWNlLnJlc2V0S2V5YmluZGluZyhrZXliaW5kaW5nRW50cnkua2V5YmluZGluZ0l0ZW0ua2V5YmluZGluZ0l0ZW0pO1xuXHRcdFx0aWYgKCFrZXliaW5kaW5nRW50cnkua2V5YmluZGluZ0l0ZW0ua2V5YmluZGluZykgeyAvLyByZXZlYWwgb25seSBpZiBrZXliaW5kaW5nIHdhcyBhZGRlZCB0byB1bmFzc2luZ2VkLiBCZWNhdXNlIHRoZSBlbnRyeSB3aWxsIGJlIHBsYWNlZCBpbiBkaWZmZXJlbnQgcG9zaXRpb24gYWZ0ZXIgcmVuZGVyaW5nXG5cdFx0XHRcdHRoaXMudW5Bc3NpZ25lZEtleWJpbmRpbmdJdGVtVG9SZXZlYWxBbmRGb2N1cyA9IGtleWJpbmRpbmdFbnRyeTtcblx0XHRcdH1cblx0XHRcdHRoaXMuc2VsZWN0RW50cnkoa2V5YmluZGluZ0VudHJ5KTtcblx0XHR9IGNhdGNoIChlcnJvcikge1xuXHRcdFx0dGhpcy5vbktleWJpbmRpbmdFZGl0aW5nRXJyb3IoZXJyb3IpO1xuXHRcdFx0dGhpcy5zZWxlY3RFbnRyeShrZXliaW5kaW5nRW50cnkpO1xuXHRcdH1cblx0fVxuXG5cdGFzeW5jIGNvcHlLZXliaW5kaW5nKGtleWJpbmRpbmc6IElLZXliaW5kaW5nSXRlbUVudHJ5KTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0dGhpcy5zZWxlY3RFbnRyeShrZXliaW5kaW5nKTtcblx0XHRjb25zdCB1c2VyRnJpZW5kbHlLZXliaW5kaW5nOiBJVXNlckZyaWVuZGx5S2V5YmluZGluZyA9IHtcblx0XHRcdGtleToga2V5YmluZGluZy5rZXliaW5kaW5nSXRlbS5rZXliaW5kaW5nID8ga2V5YmluZGluZy5rZXliaW5kaW5nSXRlbS5rZXliaW5kaW5nLmdldFVzZXJTZXR0aW5nc0xhYmVsKCkgfHwgJycgOiAnJyxcblx0XHRcdGNvbW1hbmQ6IGtleWJpbmRpbmcua2V5YmluZGluZ0l0ZW0uY29tbWFuZFxuXHRcdH07XG5cdFx0aWYgKGtleWJpbmRpbmcua2V5YmluZGluZ0l0ZW0ud2hlbikge1xuXHRcdFx0dXNlckZyaWVuZGx5S2V5YmluZGluZy53aGVuID0ga2V5YmluZGluZy5rZXliaW5kaW5nSXRlbS53aGVuO1xuXHRcdH1cblx0XHRhd2FpdCB0aGlzLmNsaXBib2FyZFNlcnZpY2Uud3JpdGVUZXh0KEpTT04uc3RyaW5naWZ5KHVzZXJGcmllbmRseUtleWJpbmRpbmcsIG51bGwsICcgICcpKTtcblx0fVxuXG5cdGFzeW5jIGNvcHlLZXliaW5kaW5nQ29tbWFuZChrZXliaW5kaW5nOiBJS2V5YmluZGluZ0l0ZW1FbnRyeSk6IFByb21pc2U8dm9pZD4ge1xuXHRcdHRoaXMuc2VsZWN0RW50cnkoa2V5YmluZGluZyk7XG5cdFx0YXdhaXQgdGhpcy5jbGlwYm9hcmRTZXJ2aWNlLndyaXRlVGV4dChrZXliaW5kaW5nLmtleWJpbmRpbmdJdGVtLmNvbW1hbmQpO1xuXHR9XG5cblx0YXN5bmMgY29weUtleWJpbmRpbmdDb21tYW5kVGl0bGUoa2V5YmluZGluZzogSUtleWJpbmRpbmdJdGVtRW50cnkpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHR0aGlzLnNlbGVjdEVudHJ5KGtleWJpbmRpbmcpO1xuXHRcdGF3YWl0IHRoaXMuY2xpcGJvYXJkU2VydmljZS53cml0ZVRleHQoa2V5YmluZGluZy5rZXliaW5kaW5nSXRlbS5jb21tYW5kTGFiZWwpO1xuXHR9XG5cblx0Zm9jdXNTZWFyY2goKTogdm9pZCB7XG5cdFx0dGhpcy5zZWFyY2hXaWRnZXQuZm9jdXMoKTtcblx0fVxuXG5cdHNlYXJjaChmaWx0ZXI6IHN0cmluZyk6IHZvaWQge1xuXHRcdHRoaXMuZm9jdXNTZWFyY2goKTtcblx0XHR0aGlzLnNlYXJjaFdpZGdldC5zZXRWYWx1ZShmaWx0ZXIpO1xuXHRcdHRoaXMuc2VsZWN0RW50cnkoMCk7XG5cdH1cblxuXHRjbGVhclNlYXJjaFJlc3VsdHMoKTogdm9pZCB7XG5cdFx0dGhpcy5zZWFyY2hXaWRnZXQuY2xlYXIoKTtcblx0XHR0aGlzLnNlYXJjaEhhc1ZhbHVlQ29udGV4dEtleS5zZXQoZmFsc2UpO1xuXHR9XG5cblx0c2hvd1NpbWlsYXJLZXliaW5kaW5ncyhrZXliaW5kaW5nRW50cnk6IElLZXliaW5kaW5nSXRlbUVudHJ5KTogdm9pZCB7XG5cdFx0Y29uc3QgdmFsdWUgPSBgXCIke2tleWJpbmRpbmdFbnRyeS5rZXliaW5kaW5nSXRlbS5rZXliaW5kaW5nLmdldEFyaWFMYWJlbCgpfVwiYDtcblx0XHRpZiAodmFsdWUgIT09IHRoaXMuc2VhcmNoV2lkZ2V0LmdldFZhbHVlKCkpIHtcblx0XHRcdHRoaXMuc2VhcmNoV2lkZ2V0LnNldFZhbHVlKHZhbHVlKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIGNyZWF0ZUFyaWFMYWJlbEVsZW1lbnQocGFyZW50OiBIVE1MRWxlbWVudCk6IHZvaWQge1xuXHRcdHRoaXMuYXJpYUxhYmVsRWxlbWVudCA9IERPTS5hcHBlbmQocGFyZW50LCBET00uJCgnJykpO1xuXHRcdHRoaXMuYXJpYUxhYmVsRWxlbWVudC5zZXRBdHRyaWJ1dGUoJ2lkJywgJ2tleWJpbmRpbmdzLWVkaXRvci1hcmlhLWxhYmVsLWVsZW1lbnQnKTtcblx0XHR0aGlzLmFyaWFMYWJlbEVsZW1lbnQuc2V0QXR0cmlidXRlKCdhcmlhLWxpdmUnLCAnYXNzZXJ0aXZlJyk7XG5cdFx0dGhpcy5hcmlhTGFiZWxFbGVtZW50LnN0eWxlLnBvc2l0aW9uID0gJ2Fic29sdXRlJztcblx0XHR0aGlzLmFyaWFMYWJlbEVsZW1lbnQuc3R5bGUud2lkdGggPSAnMXB4Jztcblx0XHR0aGlzLmFyaWFMYWJlbEVsZW1lbnQuc3R5bGUuaGVpZ2h0ID0gJzFweCc7XG5cdFx0dGhpcy5hcmlhTGFiZWxFbGVtZW50LnN0eWxlLm92ZXJmbG93ID0gJ2hpZGRlbic7XG5cdFx0dGhpcy5hcmlhTGFiZWxFbGVtZW50LnN0eWxlLmNsaXAgPSAncmVjdCgxcHgsIDFweCwgMXB4LCAxcHgpJztcblx0XHR0aGlzLmFyaWFMYWJlbEVsZW1lbnQuc3R5bGUuY2xpcFBhdGggPSAnaW5zZXQoNTAlKSc7XG5cdFx0dGhpcy5hcmlhTGFiZWxFbGVtZW50LnN0eWxlLndoaXRlU3BhY2UgPSAnbm93cmFwJztcblx0fVxuXG5cdHByaXZhdGUgY3JlYXRlT3ZlcmxheUNvbnRhaW5lcihwYXJlbnQ6IEhUTUxFbGVtZW50KTogdm9pZCB7XG5cdFx0dGhpcy5vdmVybGF5Q29udGFpbmVyID0gRE9NLmFwcGVuZChwYXJlbnQsICQoJy5vdmVybGF5LWNvbnRhaW5lcicpKTtcblx0XHR0aGlzLm92ZXJsYXlDb250YWluZXIuc3R5bGUucG9zaXRpb24gPSAnYWJzb2x1dGUnO1xuXHRcdHRoaXMub3ZlcmxheUNvbnRhaW5lci5zdHlsZS56SW5kZXggPSAnNDAnOyAvLyBoYXMgdG8gZ3JlYXRlciB0aGFuIHNhc2ggei1pbmRleCB3aGljaCBpcyAzNVxuXHRcdHRoaXMuZGVmaW5lS2V5YmluZGluZ1dpZGdldCA9IHRoaXMuX3JlZ2lzdGVyKHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoRGVmaW5lS2V5YmluZGluZ1dpZGdldCwgdGhpcy5vdmVybGF5Q29udGFpbmVyKSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5kZWZpbmVLZXliaW5kaW5nV2lkZ2V0Lm9uRGlkQ2hhbmdlKGtleWJpbmRpbmdTdHIgPT4gdGhpcy5kZWZpbmVLZXliaW5kaW5nV2lkZ2V0LnByaW50RXhpc3RpbmcodGhpcy5rZXliaW5kaW5nc0VkaXRvck1vZGVsIS5mZXRjaChgXCIke2tleWJpbmRpbmdTdHJ9XCJgKS5sZW5ndGgpKSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5kZWZpbmVLZXliaW5kaW5nV2lkZ2V0Lm9uU2hvd0V4aXN0aW5nS2V5YmlkaW5ncyhrZXliaW5kaW5nU3RyID0+IHRoaXMuc2VhcmNoV2lkZ2V0LnNldFZhbHVlKGBcIiR7a2V5YmluZGluZ1N0cn1cImApKSk7XG5cdFx0dGhpcy5oaWRlT3ZlcmxheUNvbnRhaW5lcigpO1xuXHR9XG5cblx0cHJpdmF0ZSBzaG93T3ZlcmxheUNvbnRhaW5lcigpIHtcblx0XHR0aGlzLm92ZXJsYXlDb250YWluZXIuc3R5bGUuZGlzcGxheSA9ICdibG9jayc7XG5cdH1cblxuXHRwcml2YXRlIGhpZGVPdmVybGF5Q29udGFpbmVyKCkge1xuXHRcdHRoaXMub3ZlcmxheUNvbnRhaW5lci5zdHlsZS5kaXNwbGF5ID0gJ25vbmUnO1xuXHR9XG5cblx0cHJpdmF0ZSBjcmVhdGVIZWFkZXIocGFyZW50OiBIVE1MRWxlbWVudCk6IHZvaWQge1xuXHRcdHRoaXMuaGVhZGVyQ29udGFpbmVyID0gRE9NLmFwcGVuZChwYXJlbnQsICQoJy5rZXliaW5kaW5ncy1oZWFkZXInKSk7XG5cdFx0Y29uc3QgZnVsbFRleHRTZWFyY2hQbGFjZWhvbGRlciA9IGxvY2FsaXplKCdTZWFyY2hLZXliaW5kaW5ncy5GdWxsVGV4dFNlYXJjaFBsYWNlaG9sZGVyJywgXCJUeXBlIHRvIHNlYXJjaCBpbiBrZXliaW5kaW5nc1wiKTtcblx0XHRjb25zdCBrZXliaW5kaW5nc1NlYXJjaFBsYWNlaG9sZGVyID0gbG9jYWxpemUoJ1NlYXJjaEtleWJpbmRpbmdzLktleWJpbmRpbmdzU2VhcmNoUGxhY2Vob2xkZXInLCBcIlJlY29yZGluZyBLZXlzLiBQcmVzcyBFc2NhcGUgdG8gZXhpdFwiKTtcblxuXHRcdGNvbnN0IGNsZWFySW5wdXRBY3Rpb24gPSB0aGlzLl9yZWdpc3RlcihuZXcgQWN0aW9uKEtFWUJJTkRJTkdTX0VESVRPUl9DT01NQU5EX0NMRUFSX1NFQVJDSF9SRVNVTFRTLCBsb2NhbGl6ZSgnY2xlYXJJbnB1dCcsIFwiQ2xlYXIgS2V5YmluZGluZ3MgU2VhcmNoIElucHV0XCIpLCBUaGVtZUljb24uYXNDbGFzc05hbWUocHJlZmVyZW5jZXNDbGVhcklucHV0SWNvbiksIGZhbHNlLCBhc3luYyAoKSA9PiB0aGlzLmNsZWFyU2VhcmNoUmVzdWx0cygpKSk7XG5cblx0XHRjb25zdCBzZWFyY2hDb250YWluZXIgPSBET00uYXBwZW5kKHRoaXMuaGVhZGVyQ29udGFpbmVyLCAkKCcuc2VhcmNoLWNvbnRhaW5lcicpKTtcblx0XHR0aGlzLnNlYXJjaFdpZGdldCA9IHRoaXMuX3JlZ2lzdGVyKHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoS2V5YmluZGluZ3NTZWFyY2hXaWRnZXQsIHNlYXJjaENvbnRhaW5lciwge1xuXHRcdFx0YXJpYUxhYmVsOiBmdWxsVGV4dFNlYXJjaFBsYWNlaG9sZGVyLFxuXHRcdFx0cGxhY2Vob2xkZXI6IGZ1bGxUZXh0U2VhcmNoUGxhY2Vob2xkZXIsXG5cdFx0XHRmb2N1c0tleTogdGhpcy5zZWFyY2hGb2N1c0NvbnRleHRLZXksXG5cdFx0XHRhcmlhTGFiZWxsZWRCeTogJ2tleWJpbmRpbmdzLWVkaXRvci1hcmlhLWxhYmVsLWVsZW1lbnQnLFxuXHRcdFx0cmVjb3JkRW50ZXI6IHRydWUsXG5cdFx0XHRxdW90ZVJlY29yZGVkS2V5czogdHJ1ZSxcblx0XHRcdGhpc3Rvcnk6IG5ldyBTZXQ8c3RyaW5nPigodGhpcy5nZXRNZW1lbnRvKFN0b3JhZ2VTY29wZS5QUk9GSUxFLCBTdG9yYWdlVGFyZ2V0LlVTRVIpKS5zZWFyY2hIaXN0b3J5ID8/IFtdKSxcblx0XHRcdGlucHV0Qm94U3R5bGVzOiBnZXRJbnB1dEJveFN0eWxlKHtcblx0XHRcdFx0aW5wdXRCb3JkZXI6IHNldHRpbmdzVGV4dElucHV0Qm9yZGVyXG5cdFx0XHR9KVxuXHRcdH0pKTtcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLnNlYXJjaFdpZGdldC5vbkRpZENoYW5nZShzZWFyY2hWYWx1ZSA9PiB7XG5cdFx0XHRjb25zdCBoYXNWYWx1ZSA9ICEhc2VhcmNoVmFsdWU7XG5cdFx0XHRjbGVhcklucHV0QWN0aW9uLmVuYWJsZWQgPSBoYXNWYWx1ZTtcblx0XHRcdHRoaXMuc2VhcmNoSGFzVmFsdWVDb250ZXh0S2V5LnNldChoYXNWYWx1ZSk7XG5cdFx0XHR0aGlzLmRlbGF5ZWRGaWx0ZXJpbmcudHJpZ2dlcigoKSA9PiB0aGlzLmZpbHRlcktleWJpbmRpbmdzKCkpO1xuXHRcdFx0dGhpcy51cGRhdGVTZWFyY2hPcHRpb25zKCk7XG5cdFx0fSkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuc2VhcmNoV2lkZ2V0Lm9uRXNjYXBlKCgpID0+IHRoaXMucmVjb3JkS2V5c0FjdGlvbi5jaGVja2VkID0gZmFsc2UpKTtcblxuXHRcdHRoaXMuYWN0aW9uc0NvbnRhaW5lciA9IERPTS5hcHBlbmQoc2VhcmNoQ29udGFpbmVyLCBET00uJCgnLmtleWJpbmRpbmdzLXNlYXJjaC1hY3Rpb25zLWNvbnRhaW5lcicpKTtcblx0XHRjb25zdCByZWNvcmRpbmdCYWRnZSA9IHRoaXMuY3JlYXRlUmVjb3JkaW5nQmFkZ2UodGhpcy5hY3Rpb25zQ29udGFpbmVyKTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuc29ydEJ5UHJlY2VkZW5jZUFjdGlvbi5vbkRpZENoYW5nZShlID0+IHtcblx0XHRcdGlmIChlLmNoZWNrZWQgIT09IHVuZGVmaW5lZCkge1xuXHRcdFx0XHR0aGlzLnJlbmRlcktleWJpbmRpbmdzRW50cmllcyhmYWxzZSk7XG5cdFx0XHR9XG5cdFx0XHR0aGlzLnVwZGF0ZVNlYXJjaE9wdGlvbnMoKTtcblx0XHR9KSk7XG5cblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLnJlY29yZEtleXNBY3Rpb24ub25EaWRDaGFuZ2UoZSA9PiB7XG5cdFx0XHRpZiAoZS5jaGVja2VkICE9PSB1bmRlZmluZWQpIHtcblx0XHRcdFx0cmVjb3JkaW5nQmFkZ2UuY2xhc3NMaXN0LnRvZ2dsZSgnZGlzYWJsZWQnLCAhZS5jaGVja2VkKTtcblx0XHRcdFx0aWYgKGUuY2hlY2tlZCkge1xuXHRcdFx0XHRcdHRoaXMuc2VhcmNoV2lkZ2V0LmlucHV0Qm94LnNldFBsYWNlSG9sZGVyKGtleWJpbmRpbmdzU2VhcmNoUGxhY2Vob2xkZXIpO1xuXHRcdFx0XHRcdHRoaXMuc2VhcmNoV2lkZ2V0LmlucHV0Qm94LnNldEFyaWFMYWJlbChrZXliaW5kaW5nc1NlYXJjaFBsYWNlaG9sZGVyKTtcblx0XHRcdFx0XHR0aGlzLnNlYXJjaFdpZGdldC5zdGFydFJlY29yZGluZ0tleXMoKTtcblx0XHRcdFx0XHR0aGlzLnNlYXJjaFdpZGdldC5mb2N1cygpO1xuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdHRoaXMuc2VhcmNoV2lkZ2V0LmlucHV0Qm94LnNldFBsYWNlSG9sZGVyKGZ1bGxUZXh0U2VhcmNoUGxhY2Vob2xkZXIpO1xuXHRcdFx0XHRcdHRoaXMuc2VhcmNoV2lkZ2V0LmlucHV0Qm94LnNldEFyaWFMYWJlbChmdWxsVGV4dFNlYXJjaFBsYWNlaG9sZGVyKTtcblx0XHRcdFx0XHR0aGlzLnNlYXJjaFdpZGdldC5zdG9wUmVjb3JkaW5nS2V5cygpO1xuXHRcdFx0XHRcdHRoaXMuc2VhcmNoV2lkZ2V0LmZvY3VzKCk7XG5cdFx0XHRcdH1cblx0XHRcdFx0dGhpcy51cGRhdGVTZWFyY2hPcHRpb25zKCk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXG5cdFx0Y29uc3QgYWN0aW9ucyA9IFt0aGlzLnJlY29yZEtleXNBY3Rpb24sIHRoaXMuc29ydEJ5UHJlY2VkZW5jZUFjdGlvbiwgY2xlYXJJbnB1dEFjdGlvbl07XG5cdFx0Y29uc3QgdG9vbEJhciA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBUb29sQmFyKHRoaXMuYWN0aW9uc0NvbnRhaW5lciwgdGhpcy5jb250ZXh0TWVudVNlcnZpY2UsIHtcblx0XHRcdGFjdGlvblZpZXdJdGVtUHJvdmlkZXI6IChhY3Rpb246IElBY3Rpb24sIG9wdGlvbnM6IElBY3Rpb25WaWV3SXRlbU9wdGlvbnMpID0+IHtcblx0XHRcdFx0aWYgKGFjdGlvbi5pZCA9PT0gdGhpcy5zb3J0QnlQcmVjZWRlbmNlQWN0aW9uLmlkIHx8IGFjdGlvbi5pZCA9PT0gdGhpcy5yZWNvcmRLZXlzQWN0aW9uLmlkKSB7XG5cdFx0XHRcdFx0cmV0dXJuIG5ldyBUb2dnbGVBY3Rpb25WaWV3SXRlbShudWxsLCBhY3Rpb24sIHsgLi4ub3B0aW9ucywga2V5YmluZGluZzogdGhpcy5rZXliaW5kaW5nc1NlcnZpY2UubG9va3VwS2V5YmluZGluZyhhY3Rpb24uaWQpPy5nZXRMYWJlbCgpLCB0b2dnbGVTdHlsZXM6IGRlZmF1bHRUb2dnbGVTdHlsZXMgfSk7XG5cdFx0XHRcdH1cblx0XHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHRcdH0sXG5cdFx0XHRnZXRLZXlCaW5kaW5nOiBhY3Rpb24gPT4gdGhpcy5rZXliaW5kaW5nc1NlcnZpY2UubG9va3VwS2V5YmluZGluZyhhY3Rpb24uaWQpXG5cdFx0fSkpO1xuXHRcdHRvb2xCYXIuc2V0QWN0aW9ucyhhY3Rpb25zKTtcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLmtleWJpbmRpbmdzU2VydmljZS5vbkRpZFVwZGF0ZUtleWJpbmRpbmdzKCgpID0+IHRvb2xCYXIuc2V0QWN0aW9ucyhhY3Rpb25zKSkpO1xuXHR9XG5cblx0cHJpdmF0ZSB1cGRhdGVTZWFyY2hPcHRpb25zKCk6IHZvaWQge1xuXHRcdGNvbnN0IGtleWJpbmRpbmdzRWRpdG9ySW5wdXQgPSB0aGlzLmlucHV0IGFzIEtleWJpbmRpbmdzRWRpdG9ySW5wdXQ7XG5cdFx0aWYgKGtleWJpbmRpbmdzRWRpdG9ySW5wdXQpIHtcblx0XHRcdGtleWJpbmRpbmdzRWRpdG9ySW5wdXQuc2VhcmNoT3B0aW9ucyA9IHtcblx0XHRcdFx0c2VhcmNoVmFsdWU6IHRoaXMuc2VhcmNoV2lkZ2V0LmdldFZhbHVlKCksXG5cdFx0XHRcdHJlY29yZEtleWJpbmRpbmdzOiAhIXRoaXMucmVjb3JkS2V5c0FjdGlvbi5jaGVja2VkLFxuXHRcdFx0XHRzb3J0QnlQcmVjZWRlbmNlOiAhIXRoaXMuc29ydEJ5UHJlY2VkZW5jZUFjdGlvbi5jaGVja2VkXG5cdFx0XHR9O1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgY3JlYXRlUmVjb3JkaW5nQmFkZ2UoY29udGFpbmVyOiBIVE1MRWxlbWVudCk6IEhUTUxFbGVtZW50IHtcblx0XHRjb25zdCByZWNvcmRpbmdCYWRnZSA9IERPTS5hcHBlbmQoY29udGFpbmVyLCBET00uJCgnLnJlY29yZGluZy1iYWRnZS5tb25hY28tY291bnQtYmFkZ2UubG9uZy5kaXNhYmxlZCcpKTtcblx0XHRyZWNvcmRpbmdCYWRnZS50ZXh0Q29udGVudCA9IGxvY2FsaXplKCdyZWNvcmRpbmcnLCBcIlJlY29yZGluZyBLZXlzXCIpO1xuXG5cdFx0cmVjb3JkaW5nQmFkZ2Uuc3R5bGUuYmFja2dyb3VuZENvbG9yID0gYXNDc3NWYXJpYWJsZShiYWRnZUJhY2tncm91bmQpO1xuXHRcdHJlY29yZGluZ0JhZGdlLnN0eWxlLmNvbG9yID0gYXNDc3NWYXJpYWJsZShiYWRnZUZvcmVncm91bmQpO1xuXHRcdHJlY29yZGluZ0JhZGdlLnN0eWxlLmJvcmRlciA9IGAxcHggc29saWQgJHthc0Nzc1ZhcmlhYmxlKGNvbnRyYXN0Qm9yZGVyKX1gO1xuXG5cdFx0cmV0dXJuIHJlY29yZGluZ0JhZGdlO1xuXHR9XG5cblx0cHJpdmF0ZSBsYXlvdXRTZWFyY2hXaWRnZXQoZGltZW5zaW9uOiBET00uRGltZW5zaW9uKTogdm9pZCB7XG5cdFx0dGhpcy5zZWFyY2hXaWRnZXQubGF5b3V0KGRpbWVuc2lvbik7XG5cdFx0dGhpcy5oZWFkZXJDb250YWluZXIuY2xhc3NMaXN0LnRvZ2dsZSgnc21hbGwnLCBkaW1lbnNpb24ud2lkdGggPCA0MDApO1xuXHRcdHRoaXMuc2VhcmNoV2lkZ2V0LmlucHV0Qm94LmlucHV0RWxlbWVudC5zdHlsZS5wYWRkaW5nUmlnaHQgPSBgJHtET00uZ2V0VG90YWxXaWR0aCh0aGlzLmFjdGlvbnNDb250YWluZXIpICsgMTJ9cHhgO1xuXHR9XG5cblx0cHJpdmF0ZSBjcmVhdGVCb2R5KHBhcmVudDogSFRNTEVsZW1lbnQpOiB2b2lkIHtcblx0XHRjb25zdCBib2R5Q29udGFpbmVyID0gRE9NLmFwcGVuZChwYXJlbnQsICQoJy5rZXliaW5kaW5ncy1ib2R5JykpO1xuXHRcdHRoaXMuY3JlYXRlVGFibGUoYm9keUNvbnRhaW5lcik7XG5cdH1cblxuXHRwcml2YXRlIGNyZWF0ZVRhYmxlKHBhcmVudDogSFRNTEVsZW1lbnQpOiB2b2lkIHtcblx0XHR0aGlzLmtleWJpbmRpbmdzVGFibGVDb250YWluZXIgPSBET00uYXBwZW5kKHBhcmVudCwgJCgnLmtleWJpbmRpbmdzLXRhYmxlLWNvbnRhaW5lcicpKTtcblx0XHR0aGlzLmtleWJpbmRpbmdzVGFibGUgPSB0aGlzLl9yZWdpc3Rlcih0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFdvcmtiZW5jaFRhYmxlLFxuXHRcdFx0J0tleWJpbmRpbmdzRWRpdG9yJyxcblx0XHRcdHRoaXMua2V5YmluZGluZ3NUYWJsZUNvbnRhaW5lcixcblx0XHRcdG5ldyBEZWxlZ2F0ZSgpLFxuXHRcdFx0W1xuXHRcdFx0XHR7XG5cdFx0XHRcdFx0bGFiZWw6ICcnLFxuXHRcdFx0XHRcdHRvb2x0aXA6ICcnLFxuXHRcdFx0XHRcdHdlaWdodDogMCxcblx0XHRcdFx0XHRtaW5pbXVtV2lkdGg6IDQwLFxuXHRcdFx0XHRcdG1heGltdW1XaWR0aDogNDAsXG5cdFx0XHRcdFx0dGVtcGxhdGVJZDogQWN0aW9uc0NvbHVtblJlbmRlcmVyLlRFTVBMQVRFX0lELFxuXHRcdFx0XHRcdHByb2plY3Qocm93OiBJS2V5YmluZGluZ0l0ZW1FbnRyeSk6IElLZXliaW5kaW5nSXRlbUVudHJ5IHsgcmV0dXJuIHJvdzsgfVxuXHRcdFx0XHR9LFxuXHRcdFx0XHR7XG5cdFx0XHRcdFx0bGFiZWw6IGxvY2FsaXplKCdjb21tYW5kJywgXCJDb21tYW5kXCIpLFxuXHRcdFx0XHRcdHRvb2x0aXA6ICcnLFxuXHRcdFx0XHRcdHdlaWdodDogMC4zLFxuXHRcdFx0XHRcdHRlbXBsYXRlSWQ6IENvbW1hbmRDb2x1bW5SZW5kZXJlci5URU1QTEFURV9JRCxcblx0XHRcdFx0XHRwcm9qZWN0KHJvdzogSUtleWJpbmRpbmdJdGVtRW50cnkpOiBJS2V5YmluZGluZ0l0ZW1FbnRyeSB7IHJldHVybiByb3c7IH1cblx0XHRcdFx0fSxcblx0XHRcdFx0e1xuXHRcdFx0XHRcdGxhYmVsOiBsb2NhbGl6ZSgna2V5YmluZGluZycsIFwiS2V5YmluZGluZ1wiKSxcblx0XHRcdFx0XHR0b29sdGlwOiAnJyxcblx0XHRcdFx0XHR3ZWlnaHQ6IDAuMixcblx0XHRcdFx0XHR0ZW1wbGF0ZUlkOiBLZXliaW5kaW5nQ29sdW1uUmVuZGVyZXIuVEVNUExBVEVfSUQsXG5cdFx0XHRcdFx0cHJvamVjdChyb3c6IElLZXliaW5kaW5nSXRlbUVudHJ5KTogSUtleWJpbmRpbmdJdGVtRW50cnkgeyByZXR1cm4gcm93OyB9XG5cdFx0XHRcdH0sXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRsYWJlbDogbG9jYWxpemUoJ3doZW4nLCBcIldoZW5cIiksXG5cdFx0XHRcdFx0dG9vbHRpcDogJycsXG5cdFx0XHRcdFx0d2VpZ2h0OiAwLjM1LFxuXHRcdFx0XHRcdHRlbXBsYXRlSWQ6IFdoZW5Db2x1bW5SZW5kZXJlci5URU1QTEFURV9JRCxcblx0XHRcdFx0XHRwcm9qZWN0KHJvdzogSUtleWJpbmRpbmdJdGVtRW50cnkpOiBJS2V5YmluZGluZ0l0ZW1FbnRyeSB7IHJldHVybiByb3c7IH1cblx0XHRcdFx0fSxcblx0XHRcdFx0e1xuXHRcdFx0XHRcdGxhYmVsOiBsb2NhbGl6ZSgnc291cmNlJywgXCJTb3VyY2VcIiksXG5cdFx0XHRcdFx0dG9vbHRpcDogJycsXG5cdFx0XHRcdFx0d2VpZ2h0OiAwLjE1LFxuXHRcdFx0XHRcdHRlbXBsYXRlSWQ6IFNvdXJjZUNvbHVtblJlbmRlcmVyLlRFTVBMQVRFX0lELFxuXHRcdFx0XHRcdHByb2plY3Qocm93OiBJS2V5YmluZGluZ0l0ZW1FbnRyeSk6IElLZXliaW5kaW5nSXRlbUVudHJ5IHsgcmV0dXJuIHJvdzsgfVxuXHRcdFx0XHR9LFxuXHRcdFx0XSxcblx0XHRcdFtcblx0XHRcdFx0dGhpcy5pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShBY3Rpb25zQ29sdW1uUmVuZGVyZXIsIHRoaXMpLFxuXHRcdFx0XHR0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKENvbW1hbmRDb2x1bW5SZW5kZXJlciksXG5cdFx0XHRcdHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoS2V5YmluZGluZ0NvbHVtblJlbmRlcmVyKSxcblx0XHRcdFx0dGhpcy5pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShXaGVuQ29sdW1uUmVuZGVyZXIsIHRoaXMpLFxuXHRcdFx0XHR0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFNvdXJjZUNvbHVtblJlbmRlcmVyKSxcblx0XHRcdF0sXG5cdFx0XHR7XG5cdFx0XHRcdGlkZW50aXR5UHJvdmlkZXI6IHsgZ2V0SWQ6IChlOiBJS2V5YmluZGluZ0l0ZW1FbnRyeSkgPT4gZS5pZCB9LFxuXHRcdFx0XHRob3Jpem9udGFsU2Nyb2xsaW5nOiBmYWxzZSxcblx0XHRcdFx0YWNjZXNzaWJpbGl0eVByb3ZpZGVyOiBuZXcgQWNjZXNzaWJpbGl0eVByb3ZpZGVyKHRoaXMuY29uZmlndXJhdGlvblNlcnZpY2UpLFxuXHRcdFx0XHRrZXlib2FyZE5hdmlnYXRpb25MYWJlbFByb3ZpZGVyOiB7IGdldEtleWJvYXJkTmF2aWdhdGlvbkxhYmVsOiAoZTogSUtleWJpbmRpbmdJdGVtRW50cnkpID0+IGUua2V5YmluZGluZ0l0ZW0uY29tbWFuZExhYmVsIHx8IGUua2V5YmluZGluZ0l0ZW0uY29tbWFuZCB9LFxuXHRcdFx0XHRvdmVycmlkZVN0eWxlczoge1xuXHRcdFx0XHRcdGxpc3RCYWNrZ3JvdW5kOiBlZGl0b3JCYWNrZ3JvdW5kXG5cdFx0XHRcdH0sXG5cdFx0XHRcdG11bHRpcGxlU2VsZWN0aW9uU3VwcG9ydDogZmFsc2UsXG5cdFx0XHRcdHNldFJvd0xpbmVIZWlnaHQ6IGZhbHNlLFxuXHRcdFx0XHRvcGVuT25TaW5nbGVDbGljazogZmFsc2UsXG5cdFx0XHRcdHRyYW5zZm9ybU9wdGltaXphdGlvbjogZmFsc2UgLy8gZGlzYWJsZSB0cmFuc2Zvcm0gb3B0aW1pemF0aW9uIGFzIGl0IGNhdXNlcyB0aGUgZWRpdG9yIG92ZXJmbG93IHdpZGdldHMgdG8gYmUgbWlzcG9zaXRpb25lZFxuXHRcdFx0fVxuXHRcdCkpIGFzIFdvcmtiZW5jaFRhYmxlPElLZXliaW5kaW5nSXRlbUVudHJ5PjtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMua2V5YmluZGluZ3NUYWJsZS5vbkNvbnRleHRNZW51KGUgPT4gdGhpcy5vbkNvbnRleHRNZW51KGUpKSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5rZXliaW5kaW5nc1RhYmxlLm9uRGlkQ2hhbmdlRm9jdXMoZSA9PiB0aGlzLm9uRm9jdXNDaGFuZ2UoKSkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMua2V5YmluZGluZ3NUYWJsZS5vbkRpZEZvY3VzKCgpID0+IHtcblx0XHRcdHRoaXMua2V5YmluZGluZ3NUYWJsZS5nZXRIVE1MRWxlbWVudCgpLmNsYXNzTGlzdC5hZGQoJ2ZvY3VzZWQnKTtcblx0XHRcdHRoaXMub25Gb2N1c0NoYW5nZSgpO1xuXHRcdH0pKTtcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLmtleWJpbmRpbmdzVGFibGUub25EaWRCbHVyKCgpID0+IHtcblx0XHRcdHRoaXMua2V5YmluZGluZ3NUYWJsZS5nZXRIVE1MRWxlbWVudCgpLmNsYXNzTGlzdC5yZW1vdmUoJ2ZvY3VzZWQnKTtcblx0XHRcdHRoaXMua2V5YmluZGluZ0ZvY3VzQ29udGV4dEtleS5yZXNldCgpO1xuXHRcdH0pKTtcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLmtleWJpbmRpbmdzVGFibGUub25EaWRPcGVuKChlKSA9PiB7XG5cdFx0XHQvLyBzdG9wIGRvdWJsZSBjbGljayBhY3Rpb24gb24gdGhlIGlucHV0ICMxNDg0OTNcblx0XHRcdGlmIChlLmJyb3dzZXJFdmVudD8uZGVmYXVsdFByZXZlbnRlZCkge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cdFx0XHRjb25zdCBhY3RpdmVLZXliaW5kaW5nRW50cnkgPSB0aGlzLmFjdGl2ZUtleWJpbmRpbmdFbnRyeTtcblx0XHRcdGlmIChhY3RpdmVLZXliaW5kaW5nRW50cnkpIHtcblx0XHRcdFx0dGhpcy5kZWZpbmVLZXliaW5kaW5nKGFjdGl2ZUtleWJpbmRpbmdFbnRyeSwgZmFsc2UpO1xuXHRcdFx0fVxuXHRcdH0pKTtcblxuXHRcdERPTS5hcHBlbmQodGhpcy5rZXliaW5kaW5nc1RhYmxlQ29udGFpbmVyLCB0aGlzLm92ZXJmbG93V2lkZ2V0c0RvbU5vZGUpO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyByZW5kZXIocHJlc2VydmVGb2N1czogYm9vbGVhbik6IFByb21pc2U8dm9pZD4ge1xuXHRcdGlmICh0aGlzLmlucHV0KSB7XG5cdFx0XHRjb25zdCBpbnB1dDogS2V5YmluZGluZ3NFZGl0b3JJbnB1dCA9IHRoaXMuaW5wdXQgYXMgS2V5YmluZGluZ3NFZGl0b3JJbnB1dDtcblx0XHRcdHRoaXMua2V5YmluZGluZ3NFZGl0b3JNb2RlbCA9IGF3YWl0IGlucHV0LnJlc29sdmUoKTtcblx0XHRcdGF3YWl0IHRoaXMua2V5YmluZGluZ3NFZGl0b3JNb2RlbC5yZXNvbHZlKHRoaXMuZ2V0QWN0aW9uc0xhYmVscygpKTtcblx0XHRcdHRoaXMucmVuZGVyS2V5YmluZGluZ3NFbnRyaWVzKGZhbHNlLCBwcmVzZXJ2ZUZvY3VzKTtcblx0XHRcdGlmIChpbnB1dC5zZWFyY2hPcHRpb25zKSB7XG5cdFx0XHRcdHRoaXMucmVjb3JkS2V5c0FjdGlvbi5jaGVja2VkID0gaW5wdXQuc2VhcmNoT3B0aW9ucy5yZWNvcmRLZXliaW5kaW5ncztcblx0XHRcdFx0dGhpcy5zb3J0QnlQcmVjZWRlbmNlQWN0aW9uLmNoZWNrZWQgPSBpbnB1dC5zZWFyY2hPcHRpb25zLnNvcnRCeVByZWNlZGVuY2U7XG5cdFx0XHRcdHRoaXMuc2VhcmNoV2lkZ2V0LnNldFZhbHVlKGlucHV0LnNlYXJjaE9wdGlvbnMuc2VhcmNoVmFsdWUpO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0dGhpcy51cGRhdGVTZWFyY2hPcHRpb25zKCk7XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBnZXRBY3Rpb25zTGFiZWxzKCk6IE1hcDxzdHJpbmcsIHN0cmluZz4ge1xuXHRcdGNvbnN0IGFjdGlvbnNMYWJlbHM6IE1hcDxzdHJpbmcsIHN0cmluZz4gPSBuZXcgTWFwPHN0cmluZywgc3RyaW5nPigpO1xuXHRcdGZvciAoY29uc3QgZWRpdG9yQWN0aW9uIG9mIEVkaXRvckV4dGVuc2lvbnNSZWdpc3RyeS5nZXRFZGl0b3JBY3Rpb25zKCkpIHtcblx0XHRcdGFjdGlvbnNMYWJlbHMuc2V0KGVkaXRvckFjdGlvbi5pZCwgZWRpdG9yQWN0aW9uLmxhYmVsKTtcblx0XHR9XG5cdFx0Zm9yIChjb25zdCBtZW51SXRlbSBvZiBNZW51UmVnaXN0cnkuZ2V0TWVudUl0ZW1zKE1lbnVJZC5Db21tYW5kUGFsZXR0ZSkpIHtcblx0XHRcdGlmIChpc0lNZW51SXRlbShtZW51SXRlbSkpIHtcblx0XHRcdFx0Y29uc3QgdGl0bGUgPSB0eXBlb2YgbWVudUl0ZW0uY29tbWFuZC50aXRsZSA9PT0gJ3N0cmluZycgPyBtZW51SXRlbS5jb21tYW5kLnRpdGxlIDogbWVudUl0ZW0uY29tbWFuZC50aXRsZS52YWx1ZTtcblx0XHRcdFx0Y29uc3QgY2F0ZWdvcnkgPSBtZW51SXRlbS5jb21tYW5kLmNhdGVnb3J5ID8gdHlwZW9mIG1lbnVJdGVtLmNvbW1hbmQuY2F0ZWdvcnkgPT09ICdzdHJpbmcnID8gbWVudUl0ZW0uY29tbWFuZC5jYXRlZ29yeSA6IG1lbnVJdGVtLmNvbW1hbmQuY2F0ZWdvcnkudmFsdWUgOiB1bmRlZmluZWQ7XG5cdFx0XHRcdGFjdGlvbnNMYWJlbHMuc2V0KG1lbnVJdGVtLmNvbW1hbmQuaWQsIGNhdGVnb3J5ID8gYCR7Y2F0ZWdvcnl9OiAke3RpdGxlfWAgOiB0aXRsZSk7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdHJldHVybiBhY3Rpb25zTGFiZWxzO1xuXHR9XG5cblx0cHJpdmF0ZSBmaWx0ZXJLZXliaW5kaW5ncygpOiB2b2lkIHtcblx0XHR0aGlzLnJlbmRlcktleWJpbmRpbmdzRW50cmllcyh0aGlzLnNlYXJjaFdpZGdldC5oYXNGb2N1cygpKTtcblx0XHR0aGlzLnNlYXJjaEhpc3RvcnlEZWxheWVyLnRyaWdnZXIoKCkgPT4ge1xuXHRcdFx0dGhpcy5zZWFyY2hXaWRnZXQuaW5wdXRCb3guYWRkVG9IaXN0b3J5KCk7XG5cdFx0XHQodGhpcy5nZXRNZW1lbnRvKFN0b3JhZ2VTY29wZS5QUk9GSUxFLCBTdG9yYWdlVGFyZ2V0LlVTRVIpKS5zZWFyY2hIaXN0b3J5ID0gdGhpcy5zZWFyY2hXaWRnZXQuaW5wdXRCb3guZ2V0SGlzdG9yeSgpO1xuXHRcdFx0dGhpcy5zYXZlU3RhdGUoKTtcblx0XHR9KTtcblx0fVxuXG5cdHB1YmxpYyBjbGVhcktleWJvYXJkU2hvcnRjdXRTZWFyY2hIaXN0b3J5KCk6IHZvaWQge1xuXHRcdHRoaXMuc2VhcmNoV2lkZ2V0LmlucHV0Qm94LmNsZWFySGlzdG9yeSgpO1xuXHRcdCh0aGlzLmdldE1lbWVudG8oU3RvcmFnZVNjb3BlLlBST0ZJTEUsIFN0b3JhZ2VUYXJnZXQuVVNFUikpLnNlYXJjaEhpc3RvcnkgPSB0aGlzLnNlYXJjaFdpZGdldC5pbnB1dEJveC5nZXRIaXN0b3J5KCk7XG5cdFx0dGhpcy5zYXZlU3RhdGUoKTtcblx0fVxuXG5cdHByaXZhdGUgcmVuZGVyS2V5YmluZGluZ3NFbnRyaWVzKHJlc2V0OiBib29sZWFuLCBwcmVzZXJ2ZUZvY3VzPzogYm9vbGVhbik6IHZvaWQge1xuXHRcdGlmICh0aGlzLmtleWJpbmRpbmdzRWRpdG9yTW9kZWwpIHtcblx0XHRcdGNvbnN0IGZpbHRlciA9IHRoaXMuc2VhcmNoV2lkZ2V0LmdldFZhbHVlKCk7XG5cdFx0XHRjb25zdCBrZXliaW5kaW5nc0VudHJpZXM6IElLZXliaW5kaW5nSXRlbUVudHJ5W10gPSB0aGlzLmtleWJpbmRpbmdzRWRpdG9yTW9kZWwuZmV0Y2goZmlsdGVyLCB0aGlzLnNvcnRCeVByZWNlZGVuY2VBY3Rpb24uY2hlY2tlZCk7XG5cdFx0XHRjb25zdCBhcmlhTGFiZWwgPSB0aGlzLmdldEFyaWFMYWJlbChrZXliaW5kaW5nc0VudHJpZXMpO1xuXHRcdFx0dGhpcy5hY2Nlc3NpYmlsaXR5U2VydmljZS5hbGVydChhcmlhTGFiZWwpO1xuXHRcdFx0dGhpcy5hcmlhTGFiZWxFbGVtZW50LnRleHRDb250ZW50ID0gYXJpYUxhYmVsO1xuXG5cdFx0XHRpZiAoa2V5YmluZGluZ3NFbnRyaWVzLmxlbmd0aCA9PT0gMCkge1xuXHRcdFx0XHR0aGlzLmxhdGVzdEVtcHR5RmlsdGVycy5wdXNoKGZpbHRlcik7XG5cdFx0XHR9XG5cdFx0XHRjb25zdCBjdXJyZW50U2VsZWN0ZWRJbmRleCA9IHRoaXMua2V5YmluZGluZ3NUYWJsZS5nZXRTZWxlY3Rpb24oKVswXTtcblx0XHRcdHRoaXMudGFibGVFbnRyaWVzID0ga2V5YmluZGluZ3NFbnRyaWVzO1xuXHRcdFx0dGhpcy5rZXliaW5kaW5nc1RhYmxlLnNwbGljZSgwLCB0aGlzLmtleWJpbmRpbmdzVGFibGUubGVuZ3RoLCB0aGlzLnRhYmxlRW50cmllcyk7XG5cdFx0XHR0aGlzLmxheW91dEtleWJpbmRpbmdzVGFibGUoKTtcblxuXHRcdFx0aWYgKHJlc2V0KSB7XG5cdFx0XHRcdHRoaXMua2V5YmluZGluZ3NUYWJsZS5zZXRTZWxlY3Rpb24oW10pO1xuXHRcdFx0XHR0aGlzLmtleWJpbmRpbmdzVGFibGUuc2V0Rm9jdXMoW10pO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0aWYgKHRoaXMudW5Bc3NpZ25lZEtleWJpbmRpbmdJdGVtVG9SZXZlYWxBbmRGb2N1cykge1xuXHRcdFx0XHRcdGNvbnN0IGluZGV4ID0gdGhpcy5nZXROZXdJbmRleE9mVW5hc3NpZ25lZEtleWJpbmRpbmcodGhpcy51bkFzc2lnbmVkS2V5YmluZGluZ0l0ZW1Ub1JldmVhbEFuZEZvY3VzKTtcblx0XHRcdFx0XHRpZiAoaW5kZXggIT09IC0xKSB7XG5cdFx0XHRcdFx0XHR0aGlzLmtleWJpbmRpbmdzVGFibGUucmV2ZWFsKGluZGV4LCAwLjIpO1xuXHRcdFx0XHRcdFx0dGhpcy5zZWxlY3RFbnRyeShpbmRleCk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdHRoaXMudW5Bc3NpZ25lZEtleWJpbmRpbmdJdGVtVG9SZXZlYWxBbmRGb2N1cyA9IG51bGw7XG5cdFx0XHRcdH0gZWxzZSBpZiAoY3VycmVudFNlbGVjdGVkSW5kZXggIT09IC0xICYmIGN1cnJlbnRTZWxlY3RlZEluZGV4IDwgdGhpcy50YWJsZUVudHJpZXMubGVuZ3RoKSB7XG5cdFx0XHRcdFx0dGhpcy5zZWxlY3RFbnRyeShjdXJyZW50U2VsZWN0ZWRJbmRleCwgcHJlc2VydmVGb2N1cyk7XG5cdFx0XHRcdH0gZWxzZSBpZiAodGhpcy5lZGl0b3JTZXJ2aWNlLmFjdGl2ZUVkaXRvclBhbmUgPT09IHRoaXMgJiYgIXByZXNlcnZlRm9jdXMpIHtcblx0XHRcdFx0XHR0aGlzLmZvY3VzKCk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIGdldEFyaWFMYWJlbChrZXliaW5kaW5nc0VudHJpZXM6IElLZXliaW5kaW5nSXRlbUVudHJ5W10pOiBzdHJpbmcge1xuXHRcdGxldCBsYWJlbDogc3RyaW5nO1xuXHRcdGlmICh0aGlzLnNvcnRCeVByZWNlZGVuY2VBY3Rpb24uY2hlY2tlZCkge1xuXHRcdFx0bGFiZWwgPSBsb2NhbGl6ZSgnc2hvdyBzb3J0ZWQga2V5YmluZGluZ3MnLCBcIlNob3dpbmcgezB9IEtleWJpbmRpbmdzIGluIHByZWNlZGVuY2Ugb3JkZXJcIiwga2V5YmluZGluZ3NFbnRyaWVzLmxlbmd0aCk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdGxhYmVsID0gbG9jYWxpemUoJ3Nob3cga2V5YmluZGluZ3MnLCBcIlNob3dpbmcgezB9IEtleWJpbmRpbmdzIGluIGFscGhhYmV0aWNhbCBvcmRlclwiLCBrZXliaW5kaW5nc0VudHJpZXMubGVuZ3RoKTtcblx0XHR9XG5cdFx0aWYgKHRoaXMuY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0VmFsdWUoQWNjZXNzaWJpbGl0eVZlcmJvc2l0eVNldHRpbmdJZC5LZXliaW5kaW5nc0VkaXRvcikpIHtcblx0XHRcdGNvbnN0IGtiID0gdGhpcy5rZXliaW5kaW5nc1NlcnZpY2UubG9va3VwS2V5YmluZGluZygnd2lkZ2V0TmF2aWdhdGlvbi5mb2N1c05leHQnKT8uZ2V0QXJpYUxhYmVsKCk7XG5cdFx0XHRpZiAoa2IpIHtcblx0XHRcdFx0bGFiZWwgKz0gJy4gJyArIGxvY2FsaXplKCduYXZpZ2F0ZVRvUmVzdWx0cycsIFwiVXNlIHswfSB0byBuYXZpZ2F0ZSB0byB0aGUgcmVzdWx0cyB0YWJsZS5cIiwga2IpO1xuXHRcdFx0fVxuXHRcdH1cblx0XHRyZXR1cm4gbGFiZWw7XG5cdH1cblxuXHRwcml2YXRlIGxheW91dEtleWJpbmRpbmdzVGFibGUoKTogdm9pZCB7XG5cdFx0aWYgKCF0aGlzLmRpbWVuc2lvbikge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IHRhYmxlSGVpZ2h0ID0gdGhpcy5kaW1lbnNpb24uaGVpZ2h0IC0gKERPTS5nZXREb21Ob2RlUGFnZVBvc2l0aW9uKHRoaXMuaGVhZGVyQ29udGFpbmVyKS5oZWlnaHQgKyAxMiAvKnBhZGRpbmcqLyk7XG5cdFx0dGhpcy5rZXliaW5kaW5nc1RhYmxlQ29udGFpbmVyLnN0eWxlLmhlaWdodCA9IGAke3RhYmxlSGVpZ2h0fXB4YDtcblx0XHR0aGlzLmtleWJpbmRpbmdzVGFibGUubGF5b3V0KHRhYmxlSGVpZ2h0KTtcblx0fVxuXG5cdHByaXZhdGUgZ2V0SW5kZXhPZihsaXN0RW50cnk6IElLZXliaW5kaW5nSXRlbUVudHJ5KTogbnVtYmVyIHtcblx0XHRjb25zdCBpbmRleCA9IHRoaXMudGFibGVFbnRyaWVzLmluZGV4T2YobGlzdEVudHJ5KTtcblx0XHRpZiAoaW5kZXggPT09IC0xKSB7XG5cdFx0XHRmb3IgKGxldCBpID0gMDsgaSA8IHRoaXMudGFibGVFbnRyaWVzLmxlbmd0aDsgaSsrKSB7XG5cdFx0XHRcdGlmICh0aGlzLnRhYmxlRW50cmllc1tpXS5pZCA9PT0gbGlzdEVudHJ5LmlkKSB7XG5cdFx0XHRcdFx0cmV0dXJuIGk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cdFx0cmV0dXJuIGluZGV4O1xuXHR9XG5cblx0cHJpdmF0ZSBnZXROZXdJbmRleE9mVW5hc3NpZ25lZEtleWJpbmRpbmcodW5hc3NpZ25lZEtleWJpbmRpbmc6IElLZXliaW5kaW5nSXRlbUVudHJ5KTogbnVtYmVyIHtcblx0XHRmb3IgKGxldCBpbmRleCA9IDA7IGluZGV4IDwgdGhpcy50YWJsZUVudHJpZXMubGVuZ3RoOyBpbmRleCsrKSB7XG5cdFx0XHRjb25zdCBlbnRyeSA9IHRoaXMudGFibGVFbnRyaWVzW2luZGV4XTtcblx0XHRcdGlmIChlbnRyeS50ZW1wbGF0ZUlkID09PSBLRVlCSU5ESU5HX0VOVFJZX1RFTVBMQVRFX0lEKSB7XG5cdFx0XHRcdGNvbnN0IGtleWJpbmRpbmdJdGVtRW50cnkgPSAoPElLZXliaW5kaW5nSXRlbUVudHJ5PmVudHJ5KTtcblx0XHRcdFx0aWYgKGtleWJpbmRpbmdJdGVtRW50cnkua2V5YmluZGluZ0l0ZW0uY29tbWFuZCA9PT0gdW5hc3NpZ25lZEtleWJpbmRpbmcua2V5YmluZGluZ0l0ZW0uY29tbWFuZCkge1xuXHRcdFx0XHRcdHJldHVybiBpbmRleDtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblx0XHRyZXR1cm4gLTE7XG5cdH1cblxuXHRwcml2YXRlIHNlbGVjdEVudHJ5KGtleWJpbmRpbmdJdGVtRW50cnk6IElLZXliaW5kaW5nSXRlbUVudHJ5IHwgbnVtYmVyLCBmb2N1czogYm9vbGVhbiA9IHRydWUpOiB2b2lkIHtcblx0XHRjb25zdCBpbmRleCA9IHR5cGVvZiBrZXliaW5kaW5nSXRlbUVudHJ5ID09PSAnbnVtYmVyJyA/IGtleWJpbmRpbmdJdGVtRW50cnkgOiB0aGlzLmdldEluZGV4T2Yoa2V5YmluZGluZ0l0ZW1FbnRyeSk7XG5cdFx0aWYgKGluZGV4ICE9PSAtMSAmJiBpbmRleCA8IHRoaXMua2V5YmluZGluZ3NUYWJsZS5sZW5ndGgpIHtcblx0XHRcdGlmIChmb2N1cykge1xuXHRcdFx0XHR0aGlzLmtleWJpbmRpbmdzVGFibGUuZG9tRm9jdXMoKTtcblx0XHRcdFx0dGhpcy5rZXliaW5kaW5nc1RhYmxlLnNldEZvY3VzKFtpbmRleF0pO1xuXHRcdFx0fVxuXHRcdFx0dGhpcy5rZXliaW5kaW5nc1RhYmxlLnNldFNlbGVjdGlvbihbaW5kZXhdKTtcblx0XHR9XG5cdH1cblxuXHRmb2N1c0tleWJpbmRpbmdzKCk6IHZvaWQge1xuXHRcdHRoaXMua2V5YmluZGluZ3NUYWJsZS5kb21Gb2N1cygpO1xuXHRcdGNvbnN0IGN1cnJlbnRGb2N1c0luZGljZXMgPSB0aGlzLmtleWJpbmRpbmdzVGFibGUuZ2V0Rm9jdXMoKTtcblx0XHR0aGlzLmtleWJpbmRpbmdzVGFibGUuc2V0Rm9jdXMoW2N1cnJlbnRGb2N1c0luZGljZXMubGVuZ3RoID8gY3VycmVudEZvY3VzSW5kaWNlc1swXSA6IDBdKTtcblx0fVxuXG5cdHNlbGVjdEtleWJpbmRpbmcoa2V5YmluZGluZ0l0ZW1FbnRyeTogSUtleWJpbmRpbmdJdGVtRW50cnkpOiB2b2lkIHtcblx0XHR0aGlzLnNlbGVjdEVudHJ5KGtleWJpbmRpbmdJdGVtRW50cnkpO1xuXHR9XG5cblx0cmVjb3JkU2VhcmNoS2V5cygpOiB2b2lkIHtcblx0XHR0aGlzLnJlY29yZEtleXNBY3Rpb24uY2hlY2tlZCA9IHRydWU7XG5cdH1cblxuXHR0b2dnbGVTb3J0QnlQcmVjZWRlbmNlKCk6IHZvaWQge1xuXHRcdHRoaXMuc29ydEJ5UHJlY2VkZW5jZUFjdGlvbi5jaGVja2VkID0gIXRoaXMuc29ydEJ5UHJlY2VkZW5jZUFjdGlvbi5jaGVja2VkO1xuXHR9XG5cblx0cHJpdmF0ZSBvbkNvbnRleHRNZW51KGU6IElMaXN0Q29udGV4dE1lbnVFdmVudDxJS2V5YmluZGluZ0l0ZW1FbnRyeT4pOiB2b2lkIHtcblx0XHRpZiAoIWUuZWxlbWVudCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGlmIChlLmVsZW1lbnQudGVtcGxhdGVJZCA9PT0gS0VZQklORElOR19FTlRSWV9URU1QTEFURV9JRCkge1xuXHRcdFx0Y29uc3Qga2V5YmluZGluZ0l0ZW1FbnRyeSA9IDxJS2V5YmluZGluZ0l0ZW1FbnRyeT5lLmVsZW1lbnQ7XG5cdFx0XHR0aGlzLnNlbGVjdEVudHJ5KGtleWJpbmRpbmdJdGVtRW50cnkpO1xuXHRcdFx0dGhpcy5jb250ZXh0TWVudVNlcnZpY2Uuc2hvd0NvbnRleHRNZW51KHtcblx0XHRcdFx0Z2V0QW5jaG9yOiAoKSA9PiBlLmFuY2hvcixcblx0XHRcdFx0Z2V0QWN0aW9uczogKCkgPT4gW1xuXHRcdFx0XHRcdHRoaXMuY3JlYXRlQ29weUFjdGlvbihrZXliaW5kaW5nSXRlbUVudHJ5KSxcblx0XHRcdFx0XHR0aGlzLmNyZWF0ZUNvcHlDb21tYW5kQWN0aW9uKGtleWJpbmRpbmdJdGVtRW50cnkpLFxuXHRcdFx0XHRcdHRoaXMuY3JlYXRlQ29weUNvbW1hbmRUaXRsZUFjdGlvbihrZXliaW5kaW5nSXRlbUVudHJ5KSxcblx0XHRcdFx0XHRuZXcgU2VwYXJhdG9yKCksXG5cdFx0XHRcdFx0Li4uKGtleWJpbmRpbmdJdGVtRW50cnkua2V5YmluZGluZ0l0ZW0ua2V5YmluZGluZ1xuXHRcdFx0XHRcdFx0PyBbdGhpcy5jcmVhdGVEZWZpbmVLZXliaW5kaW5nQWN0aW9uKGtleWJpbmRpbmdJdGVtRW50cnkpLCB0aGlzLmNyZWF0ZUFkZEtleWJpbmRpbmdBY3Rpb24oa2V5YmluZGluZ0l0ZW1FbnRyeSldXG5cdFx0XHRcdFx0XHQ6IFt0aGlzLmNyZWF0ZURlZmluZUtleWJpbmRpbmdBY3Rpb24oa2V5YmluZGluZ0l0ZW1FbnRyeSldKSxcblx0XHRcdFx0XHRuZXcgU2VwYXJhdG9yKCksXG5cdFx0XHRcdFx0dGhpcy5jcmVhdGVSZW1vdmVBY3Rpb24oa2V5YmluZGluZ0l0ZW1FbnRyeSksXG5cdFx0XHRcdFx0dGhpcy5jcmVhdGVSZXNldEFjdGlvbihrZXliaW5kaW5nSXRlbUVudHJ5KSxcblx0XHRcdFx0XHRuZXcgU2VwYXJhdG9yKCksXG5cdFx0XHRcdFx0dGhpcy5jcmVhdGVEZWZpbmVXaGVuRXhwcmVzc2lvbkFjdGlvbihrZXliaW5kaW5nSXRlbUVudHJ5KSxcblx0XHRcdFx0XHRuZXcgU2VwYXJhdG9yKCksXG5cdFx0XHRcdFx0dGhpcy5jcmVhdGVTaG93Q29uZmxpY3RzQWN0aW9uKGtleWJpbmRpbmdJdGVtRW50cnkpXVxuXHRcdFx0fSk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBvbkZvY3VzQ2hhbmdlKCk6IHZvaWQge1xuXHRcdHRoaXMua2V5YmluZGluZ0ZvY3VzQ29udGV4dEtleS5yZXNldCgpO1xuXHRcdGNvbnN0IGVsZW1lbnQgPSB0aGlzLmtleWJpbmRpbmdzVGFibGUuZ2V0Rm9jdXNlZEVsZW1lbnRzKClbMF07XG5cdFx0aWYgKCFlbGVtZW50KSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGlmIChlbGVtZW50LnRlbXBsYXRlSWQgPT09IEtFWUJJTkRJTkdfRU5UUllfVEVNUExBVEVfSUQpIHtcblx0XHRcdHRoaXMua2V5YmluZGluZ0ZvY3VzQ29udGV4dEtleS5zZXQodHJ1ZSk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBjcmVhdGVEZWZpbmVLZXliaW5kaW5nQWN0aW9uKGtleWJpbmRpbmdJdGVtRW50cnk6IElLZXliaW5kaW5nSXRlbUVudHJ5KTogSUFjdGlvbiB7XG5cdFx0cmV0dXJuIDxJQWN0aW9uPntcblx0XHRcdGxhYmVsOiBrZXliaW5kaW5nSXRlbUVudHJ5LmtleWJpbmRpbmdJdGVtLmtleWJpbmRpbmcgPyBsb2NhbGl6ZSgnY2hhbmdlTGFiZWwnLCBcIkNoYW5nZSBLZXliaW5kaW5nLi4uXCIpIDogbG9jYWxpemUoJ2FkZExhYmVsJywgXCJBZGQgS2V5YmluZGluZy4uLlwiKSxcblx0XHRcdGVuYWJsZWQ6IHRydWUsXG5cdFx0XHRpZDogS0VZQklORElOR1NfRURJVE9SX0NPTU1BTkRfREVGSU5FLFxuXHRcdFx0cnVuOiAoKSA9PiB0aGlzLmRlZmluZUtleWJpbmRpbmcoa2V5YmluZGluZ0l0ZW1FbnRyeSwgZmFsc2UpXG5cdFx0fTtcblx0fVxuXG5cdHByaXZhdGUgY3JlYXRlQWRkS2V5YmluZGluZ0FjdGlvbihrZXliaW5kaW5nSXRlbUVudHJ5OiBJS2V5YmluZGluZ0l0ZW1FbnRyeSk6IElBY3Rpb24ge1xuXHRcdHJldHVybiA8SUFjdGlvbj57XG5cdFx0XHRsYWJlbDogbG9jYWxpemUoJ2FkZExhYmVsJywgXCJBZGQgS2V5YmluZGluZy4uLlwiKSxcblx0XHRcdGVuYWJsZWQ6IHRydWUsXG5cdFx0XHRpZDogS0VZQklORElOR1NfRURJVE9SX0NPTU1BTkRfQURELFxuXHRcdFx0cnVuOiAoKSA9PiB0aGlzLmRlZmluZUtleWJpbmRpbmcoa2V5YmluZGluZ0l0ZW1FbnRyeSwgdHJ1ZSlcblx0XHR9O1xuXHR9XG5cblx0cHJpdmF0ZSBjcmVhdGVEZWZpbmVXaGVuRXhwcmVzc2lvbkFjdGlvbihrZXliaW5kaW5nSXRlbUVudHJ5OiBJS2V5YmluZGluZ0l0ZW1FbnRyeSk6IElBY3Rpb24ge1xuXHRcdHJldHVybiA8SUFjdGlvbj57XG5cdFx0XHRsYWJlbDogbG9jYWxpemUoJ2VkaXRXaGVuJywgXCJDaGFuZ2UgV2hlbiBFeHByZXNzaW9uXCIpLFxuXHRcdFx0ZW5hYmxlZDogISFrZXliaW5kaW5nSXRlbUVudHJ5LmtleWJpbmRpbmdJdGVtLmtleWJpbmRpbmcsXG5cdFx0XHRpZDogS0VZQklORElOR1NfRURJVE9SX0NPTU1BTkRfREVGSU5FX1dIRU4sXG5cdFx0XHRydW46ICgpID0+IHRoaXMuZGVmaW5lV2hlbkV4cHJlc3Npb24oa2V5YmluZGluZ0l0ZW1FbnRyeSlcblx0XHR9O1xuXHR9XG5cblx0cHJpdmF0ZSBjcmVhdGVSZW1vdmVBY3Rpb24oa2V5YmluZGluZ0l0ZW06IElLZXliaW5kaW5nSXRlbUVudHJ5KTogSUFjdGlvbiB7XG5cdFx0cmV0dXJuIDxJQWN0aW9uPntcblx0XHRcdGxhYmVsOiBsb2NhbGl6ZSgncmVtb3ZlTGFiZWwnLCBcIlJlbW92ZSBLZXliaW5kaW5nXCIpLFxuXHRcdFx0ZW5hYmxlZDogISFrZXliaW5kaW5nSXRlbS5rZXliaW5kaW5nSXRlbS5rZXliaW5kaW5nLFxuXHRcdFx0aWQ6IEtFWUJJTkRJTkdTX0VESVRPUl9DT01NQU5EX1JFTU9WRSxcblx0XHRcdHJ1bjogKCkgPT4gdGhpcy5yZW1vdmVLZXliaW5kaW5nKGtleWJpbmRpbmdJdGVtKVxuXHRcdH07XG5cdH1cblxuXHRwcml2YXRlIGNyZWF0ZVJlc2V0QWN0aW9uKGtleWJpbmRpbmdJdGVtOiBJS2V5YmluZGluZ0l0ZW1FbnRyeSk6IElBY3Rpb24ge1xuXHRcdHJldHVybiA8SUFjdGlvbj57XG5cdFx0XHRsYWJlbDogbG9jYWxpemUoJ3Jlc2V0TGFiZWwnLCBcIlJlc2V0IEtleWJpbmRpbmdcIiksXG5cdFx0XHRlbmFibGVkOiAha2V5YmluZGluZ0l0ZW0ua2V5YmluZGluZ0l0ZW0ua2V5YmluZGluZ0l0ZW0uaXNEZWZhdWx0LFxuXHRcdFx0aWQ6IEtFWUJJTkRJTkdTX0VESVRPUl9DT01NQU5EX1JFU0VULFxuXHRcdFx0cnVuOiAoKSA9PiB0aGlzLnJlc2V0S2V5YmluZGluZyhrZXliaW5kaW5nSXRlbSlcblx0XHR9O1xuXHR9XG5cblx0cHJpdmF0ZSBjcmVhdGVTaG93Q29uZmxpY3RzQWN0aW9uKGtleWJpbmRpbmdJdGVtOiBJS2V5YmluZGluZ0l0ZW1FbnRyeSk6IElBY3Rpb24ge1xuXHRcdHJldHVybiA8SUFjdGlvbj57XG5cdFx0XHRsYWJlbDogbG9jYWxpemUoJ3Nob3dTYW1lS2V5YmluZGluZ3MnLCBcIlNob3cgU2FtZSBLZXliaW5kaW5nc1wiKSxcblx0XHRcdGVuYWJsZWQ6ICEha2V5YmluZGluZ0l0ZW0ua2V5YmluZGluZ0l0ZW0ua2V5YmluZGluZyxcblx0XHRcdGlkOiBLRVlCSU5ESU5HU19FRElUT1JfQ09NTUFORF9TSE9XX1NJTUlMQVIsXG5cdFx0XHRydW46ICgpID0+IHRoaXMuc2hvd1NpbWlsYXJLZXliaW5kaW5ncyhrZXliaW5kaW5nSXRlbSlcblx0XHR9O1xuXHR9XG5cblx0cHJpdmF0ZSBjcmVhdGVDb3B5QWN0aW9uKGtleWJpbmRpbmdJdGVtOiBJS2V5YmluZGluZ0l0ZW1FbnRyeSk6IElBY3Rpb24ge1xuXHRcdHJldHVybiA8SUFjdGlvbj57XG5cdFx0XHRsYWJlbDogbG9jYWxpemUoJ2NvcHlMYWJlbCcsIFwiQ29weVwiKSxcblx0XHRcdGVuYWJsZWQ6IHRydWUsXG5cdFx0XHRpZDogS0VZQklORElOR1NfRURJVE9SX0NPTU1BTkRfQ09QWSxcblx0XHRcdHJ1bjogKCkgPT4gdGhpcy5jb3B5S2V5YmluZGluZyhrZXliaW5kaW5nSXRlbSlcblx0XHR9O1xuXHR9XG5cblx0cHJpdmF0ZSBjcmVhdGVDb3B5Q29tbWFuZEFjdGlvbihrZXliaW5kaW5nOiBJS2V5YmluZGluZ0l0ZW1FbnRyeSk6IElBY3Rpb24ge1xuXHRcdHJldHVybiA8SUFjdGlvbj57XG5cdFx0XHRsYWJlbDogbG9jYWxpemUoJ2NvcHlDb21tYW5kTGFiZWwnLCBcIkNvcHkgQ29tbWFuZCBJRFwiKSxcblx0XHRcdGVuYWJsZWQ6IHRydWUsXG5cdFx0XHRpZDogS0VZQklORElOR1NfRURJVE9SX0NPTU1BTkRfQ09QWV9DT01NQU5ELFxuXHRcdFx0cnVuOiAoKSA9PiB0aGlzLmNvcHlLZXliaW5kaW5nQ29tbWFuZChrZXliaW5kaW5nKVxuXHRcdH07XG5cdH1cblxuXHRwcml2YXRlIGNyZWF0ZUNvcHlDb21tYW5kVGl0bGVBY3Rpb24oa2V5YmluZGluZzogSUtleWJpbmRpbmdJdGVtRW50cnkpOiBJQWN0aW9uIHtcblx0XHRyZXR1cm4gPElBY3Rpb24+e1xuXHRcdFx0bGFiZWw6IGxvY2FsaXplKCdjb3B5Q29tbWFuZFRpdGxlTGFiZWwnLCBcIkNvcHkgQ29tbWFuZCBUaXRsZVwiKSxcblx0XHRcdGVuYWJsZWQ6ICEha2V5YmluZGluZy5rZXliaW5kaW5nSXRlbS5jb21tYW5kTGFiZWwsXG5cdFx0XHRpZDogS0VZQklORElOR1NfRURJVE9SX0NPTU1BTkRfQ09QWV9DT01NQU5EX1RJVExFLFxuXHRcdFx0cnVuOiAoKSA9PiB0aGlzLmNvcHlLZXliaW5kaW5nQ29tbWFuZFRpdGxlKGtleWJpbmRpbmcpXG5cdFx0fTtcblx0fVxuXG5cdHByaXZhdGUgb25LZXliaW5kaW5nRWRpdGluZ0Vycm9yKGVycm9yOiB1bmtub3duKTogdm9pZCB7XG5cdFx0dGhpcy5ub3RpZmljYXRpb25TZXJ2aWNlLmVycm9yKHR5cGVvZiBlcnJvciA9PT0gJ3N0cmluZycgPyBlcnJvciA6IGxvY2FsaXplKCdlcnJvcicsIFwiRXJyb3IgJ3swfScgd2hpbGUgZWRpdGluZyB0aGUga2V5YmluZGluZy4gUGxlYXNlIG9wZW4gJ2tleWJpbmRpbmdzLmpzb24nIGZpbGUgYW5kIGNoZWNrIGZvciBlcnJvcnMuXCIsIGAke2Vycm9yfWApKTtcblx0fVxufVxuXG5jbGFzcyBEZWxlZ2F0ZSBpbXBsZW1lbnRzIElUYWJsZVZpcnR1YWxEZWxlZ2F0ZTxJS2V5YmluZGluZ0l0ZW1FbnRyeT4ge1xuXG5cdHJlYWRvbmx5IGhlYWRlclJvd0hlaWdodCA9IDMwO1xuXG5cdGdldEhlaWdodChlbGVtZW50OiBJS2V5YmluZGluZ0l0ZW1FbnRyeSkge1xuXHRcdGlmIChlbGVtZW50LnRlbXBsYXRlSWQgPT09IEtFWUJJTkRJTkdfRU5UUllfVEVNUExBVEVfSUQpIHtcblx0XHRcdGNvbnN0IGNvbW1hbmRJZE1hdGNoZWQgPSAoPElLZXliaW5kaW5nSXRlbUVudHJ5PmVsZW1lbnQpLmtleWJpbmRpbmdJdGVtLmNvbW1hbmRMYWJlbCAmJiAoPElLZXliaW5kaW5nSXRlbUVudHJ5PmVsZW1lbnQpLmNvbW1hbmRJZE1hdGNoZXM7XG5cdFx0XHRjb25zdCBjb21tYW5kRGVmYXVsdExhYmVsTWF0Y2hlZCA9ICEhKDxJS2V5YmluZGluZ0l0ZW1FbnRyeT5lbGVtZW50KS5jb21tYW5kRGVmYXVsdExhYmVsTWF0Y2hlcztcblx0XHRcdGNvbnN0IGV4dGVuc2lvbklkTWF0Y2hlZCA9ICEhKDxJS2V5YmluZGluZ0l0ZW1FbnRyeT5lbGVtZW50KS5leHRlbnNpb25JZE1hdGNoZXM7XG5cdFx0XHRpZiAoY29tbWFuZElkTWF0Y2hlZCAmJiBjb21tYW5kRGVmYXVsdExhYmVsTWF0Y2hlZCkge1xuXHRcdFx0XHRyZXR1cm4gNjA7XG5cdFx0XHR9XG5cdFx0XHRpZiAoZXh0ZW5zaW9uSWRNYXRjaGVkIHx8IGNvbW1hbmRJZE1hdGNoZWQgfHwgY29tbWFuZERlZmF1bHRMYWJlbE1hdGNoZWQpIHtcblx0XHRcdFx0cmV0dXJuIDQwO1xuXHRcdFx0fVxuXHRcdH1cblx0XHRyZXR1cm4gMjQ7XG5cdH1cblxufVxuXG5pbnRlcmZhY2UgSUFjdGlvbnNDb2x1bW5UZW1wbGF0ZURhdGEge1xuXHRyZWFkb25seSBhY3Rpb25CYXI6IEFjdGlvbkJhcjtcbn1cblxuY2xhc3MgQWN0aW9uc0NvbHVtblJlbmRlcmVyIGltcGxlbWVudHMgSVRhYmxlUmVuZGVyZXI8SUtleWJpbmRpbmdJdGVtRW50cnksIElBY3Rpb25zQ29sdW1uVGVtcGxhdGVEYXRhPiB7XG5cblx0c3RhdGljIHJlYWRvbmx5IFRFTVBMQVRFX0lEID0gJ2FjdGlvbnMnO1xuXG5cdHJlYWRvbmx5IHRlbXBsYXRlSWQ6IHN0cmluZyA9IEFjdGlvbnNDb2x1bW5SZW5kZXJlci5URU1QTEFURV9JRDtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRwcml2YXRlIHJlYWRvbmx5IGtleWJpbmRpbmdzRWRpdG9yOiBLZXliaW5kaW5nc0VkaXRvcixcblx0XHRASUtleWJpbmRpbmdTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkga2V5YmluZGluZ3NTZXJ2aWNlOiBJS2V5YmluZGluZ1NlcnZpY2Vcblx0KSB7XG5cdH1cblxuXHRyZW5kZXJUZW1wbGF0ZShjb250YWluZXI6IEhUTUxFbGVtZW50KTogSUFjdGlvbnNDb2x1bW5UZW1wbGF0ZURhdGEge1xuXHRcdGNvbnN0IGVsZW1lbnQgPSBET00uYXBwZW5kKGNvbnRhaW5lciwgJCgnLmFjdGlvbnMnKSk7XG5cdFx0Y29uc3QgYWN0aW9uQmFyID0gbmV3IEFjdGlvbkJhcihlbGVtZW50KTtcblx0XHRyZXR1cm4geyBhY3Rpb25CYXIgfTtcblx0fVxuXG5cdHJlbmRlckVsZW1lbnQoa2V5YmluZGluZ0l0ZW1FbnRyeTogSUtleWJpbmRpbmdJdGVtRW50cnksIGluZGV4OiBudW1iZXIsIHRlbXBsYXRlRGF0YTogSUFjdGlvbnNDb2x1bW5UZW1wbGF0ZURhdGEpOiB2b2lkIHtcblx0XHR0ZW1wbGF0ZURhdGEuYWN0aW9uQmFyLmNsZWFyKCk7XG5cdFx0Y29uc3QgYWN0aW9uczogSUFjdGlvbltdID0gW107XG5cdFx0aWYgKGtleWJpbmRpbmdJdGVtRW50cnkua2V5YmluZGluZ0l0ZW0ua2V5YmluZGluZykge1xuXHRcdFx0YWN0aW9ucy5wdXNoKHRoaXMuY3JlYXRlRWRpdEFjdGlvbihrZXliaW5kaW5nSXRlbUVudHJ5KSk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdGFjdGlvbnMucHVzaCh0aGlzLmNyZWF0ZUFkZEFjdGlvbihrZXliaW5kaW5nSXRlbUVudHJ5KSk7XG5cdFx0fVxuXHRcdHRlbXBsYXRlRGF0YS5hY3Rpb25CYXIucHVzaChhY3Rpb25zLCB7IGljb246IHRydWUgfSk7XG5cdH1cblxuXHRwcml2YXRlIGNyZWF0ZUVkaXRBY3Rpb24oa2V5YmluZGluZ0l0ZW1FbnRyeTogSUtleWJpbmRpbmdJdGVtRW50cnkpOiBJQWN0aW9uIHtcblx0XHRyZXR1cm4gPElBY3Rpb24+e1xuXHRcdFx0Y2xhc3M6IFRoZW1lSWNvbi5hc0NsYXNzTmFtZShrZXliaW5kaW5nc0VkaXRJY29uKSxcblx0XHRcdGVuYWJsZWQ6IHRydWUsXG5cdFx0XHRpZDogJ2VkaXRLZXliaW5kaW5nJyxcblx0XHRcdHRvb2x0aXA6IHRoaXMua2V5YmluZGluZ3NTZXJ2aWNlLmFwcGVuZEtleWJpbmRpbmcobG9jYWxpemUoJ2VkaXRLZXliaW5kaW5nTGFiZWwnLCBcIkNoYW5nZSBLZXliaW5kaW5nXCIpLCBLRVlCSU5ESU5HU19FRElUT1JfQ09NTUFORF9ERUZJTkUpLFxuXHRcdFx0cnVuOiAoKSA9PiB0aGlzLmtleWJpbmRpbmdzRWRpdG9yLmRlZmluZUtleWJpbmRpbmcoa2V5YmluZGluZ0l0ZW1FbnRyeSwgZmFsc2UpXG5cdFx0fTtcblx0fVxuXG5cdHByaXZhdGUgY3JlYXRlQWRkQWN0aW9uKGtleWJpbmRpbmdJdGVtRW50cnk6IElLZXliaW5kaW5nSXRlbUVudHJ5KTogSUFjdGlvbiB7XG5cdFx0cmV0dXJuIDxJQWN0aW9uPntcblx0XHRcdGNsYXNzOiBUaGVtZUljb24uYXNDbGFzc05hbWUoa2V5YmluZGluZ3NBZGRJY29uKSxcblx0XHRcdGVuYWJsZWQ6IHRydWUsXG5cdFx0XHRpZDogJ2FkZEtleWJpbmRpbmcnLFxuXHRcdFx0dG9vbHRpcDogdGhpcy5rZXliaW5kaW5nc1NlcnZpY2UuYXBwZW5kS2V5YmluZGluZyhsb2NhbGl6ZSgnYWRkS2V5YmluZGluZ0xhYmVsJywgXCJBZGQgS2V5YmluZGluZ1wiKSwgS0VZQklORElOR1NfRURJVE9SX0NPTU1BTkRfREVGSU5FKSxcblx0XHRcdHJ1bjogKCkgPT4gdGhpcy5rZXliaW5kaW5nc0VkaXRvci5kZWZpbmVLZXliaW5kaW5nKGtleWJpbmRpbmdJdGVtRW50cnksIGZhbHNlKVxuXHRcdH07XG5cdH1cblxuXHRkaXNwb3NlVGVtcGxhdGUodGVtcGxhdGVEYXRhOiBJQWN0aW9uc0NvbHVtblRlbXBsYXRlRGF0YSk6IHZvaWQge1xuXHRcdHRlbXBsYXRlRGF0YS5hY3Rpb25CYXIuZGlzcG9zZSgpO1xuXHR9XG5cbn1cblxuaW50ZXJmYWNlIElDb21tYW5kQ29sdW1uVGVtcGxhdGVEYXRhIHtcblx0Y29tbWFuZENvbHVtbjogSFRNTEVsZW1lbnQ7XG5cdGNvbW1hbmRDb2x1bW5Ib3ZlcjogSU1hbmFnZWRIb3Zlcjtcblx0Y29tbWFuZExhYmVsQ29udGFpbmVyOiBIVE1MRWxlbWVudDtcblx0Y29tbWFuZExhYmVsOiBIaWdobGlnaHRlZExhYmVsO1xuXHRjb21tYW5kRGVmYXVsdExhYmVsQ29udGFpbmVyOiBIVE1MRWxlbWVudDtcblx0Y29tbWFuZERlZmF1bHRMYWJlbDogSGlnaGxpZ2h0ZWRMYWJlbDtcblx0Y29tbWFuZElkTGFiZWxDb250YWluZXI6IEhUTUxFbGVtZW50O1xuXHRjb21tYW5kSWRMYWJlbDogSGlnaGxpZ2h0ZWRMYWJlbDtcbn1cblxuY2xhc3MgQ29tbWFuZENvbHVtblJlbmRlcmVyIGltcGxlbWVudHMgSVRhYmxlUmVuZGVyZXI8SUtleWJpbmRpbmdJdGVtRW50cnksIElDb21tYW5kQ29sdW1uVGVtcGxhdGVEYXRhPiB7XG5cblx0c3RhdGljIHJlYWRvbmx5IFRFTVBMQVRFX0lEID0gJ2NvbW1hbmRzJztcblxuXHRyZWFkb25seSB0ZW1wbGF0ZUlkOiBzdHJpbmcgPSBDb21tYW5kQ29sdW1uUmVuZGVyZXIuVEVNUExBVEVfSUQ7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0QElIb3ZlclNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfaG92ZXJTZXJ2aWNlOiBJSG92ZXJTZXJ2aWNlXG5cdCkge1xuXHR9XG5cblx0cmVuZGVyVGVtcGxhdGUoY29udGFpbmVyOiBIVE1MRWxlbWVudCk6IElDb21tYW5kQ29sdW1uVGVtcGxhdGVEYXRhIHtcblx0XHRjb25zdCBjb21tYW5kQ29sdW1uID0gRE9NLmFwcGVuZChjb250YWluZXIsICQoJy5jb21tYW5kJykpO1xuXHRcdGNvbnN0IGNvbW1hbmRDb2x1bW5Ib3ZlciA9IHRoaXMuX2hvdmVyU2VydmljZS5zZXR1cE1hbmFnZWRIb3ZlcihnZXREZWZhdWx0SG92ZXJEZWxlZ2F0ZSgnbW91c2UnKSwgY29tbWFuZENvbHVtbiwgJycpO1xuXHRcdGNvbnN0IGNvbW1hbmRMYWJlbENvbnRhaW5lciA9IERPTS5hcHBlbmQoY29tbWFuZENvbHVtbiwgJCgnLmNvbW1hbmQtbGFiZWwnKSk7XG5cdFx0Y29uc3QgY29tbWFuZExhYmVsID0gbmV3IEhpZ2hsaWdodGVkTGFiZWwoY29tbWFuZExhYmVsQ29udGFpbmVyKTtcblx0XHRjb25zdCBjb21tYW5kRGVmYXVsdExhYmVsQ29udGFpbmVyID0gRE9NLmFwcGVuZChjb21tYW5kQ29sdW1uLCAkKCcuY29tbWFuZC1kZWZhdWx0LWxhYmVsJykpO1xuXHRcdGNvbnN0IGNvbW1hbmREZWZhdWx0TGFiZWwgPSBuZXcgSGlnaGxpZ2h0ZWRMYWJlbChjb21tYW5kRGVmYXVsdExhYmVsQ29udGFpbmVyKTtcblx0XHRjb25zdCBjb21tYW5kSWRMYWJlbENvbnRhaW5lciA9IERPTS5hcHBlbmQoY29tbWFuZENvbHVtbiwgJCgnLmNvbW1hbmQtaWQuY29kZScpKTtcblx0XHRjb25zdCBjb21tYW5kSWRMYWJlbCA9IG5ldyBIaWdobGlnaHRlZExhYmVsKGNvbW1hbmRJZExhYmVsQ29udGFpbmVyKTtcblx0XHRyZXR1cm4geyBjb21tYW5kQ29sdW1uLCBjb21tYW5kQ29sdW1uSG92ZXIsIGNvbW1hbmRMYWJlbENvbnRhaW5lciwgY29tbWFuZExhYmVsLCBjb21tYW5kRGVmYXVsdExhYmVsQ29udGFpbmVyLCBjb21tYW5kRGVmYXVsdExhYmVsLCBjb21tYW5kSWRMYWJlbENvbnRhaW5lciwgY29tbWFuZElkTGFiZWwgfTtcblx0fVxuXG5cdHJlbmRlckVsZW1lbnQoa2V5YmluZGluZ0l0ZW1FbnRyeTogSUtleWJpbmRpbmdJdGVtRW50cnksIGluZGV4OiBudW1iZXIsIHRlbXBsYXRlRGF0YTogSUNvbW1hbmRDb2x1bW5UZW1wbGF0ZURhdGEpOiB2b2lkIHtcblx0XHRjb25zdCBrZXliaW5kaW5nSXRlbSA9IGtleWJpbmRpbmdJdGVtRW50cnkua2V5YmluZGluZ0l0ZW07XG5cdFx0Y29uc3QgY29tbWFuZElkTWF0Y2hlZCA9ICEhKGtleWJpbmRpbmdJdGVtLmNvbW1hbmRMYWJlbCAmJiBrZXliaW5kaW5nSXRlbUVudHJ5LmNvbW1hbmRJZE1hdGNoZXMpO1xuXHRcdGNvbnN0IGNvbW1hbmREZWZhdWx0TGFiZWxNYXRjaGVkID0gISFrZXliaW5kaW5nSXRlbUVudHJ5LmNvbW1hbmREZWZhdWx0TGFiZWxNYXRjaGVzO1xuXG5cdFx0dGVtcGxhdGVEYXRhLmNvbW1hbmRDb2x1bW4uY2xhc3NMaXN0LnRvZ2dsZSgndmVydGljYWwtYWxpZ24tY29sdW1uJywgY29tbWFuZElkTWF0Y2hlZCB8fCBjb21tYW5kRGVmYXVsdExhYmVsTWF0Y2hlZCk7XG5cdFx0Y29uc3QgdGl0bGUgPSBrZXliaW5kaW5nSXRlbS5jb21tYW5kTGFiZWwgPyBsb2NhbGl6ZSgndGl0bGUnLCBcInswfSAoezF9KVwiLCBrZXliaW5kaW5nSXRlbS5jb21tYW5kTGFiZWwsIGtleWJpbmRpbmdJdGVtLmNvbW1hbmQpIDoga2V5YmluZGluZ0l0ZW0uY29tbWFuZDtcblx0XHR0ZW1wbGF0ZURhdGEuY29tbWFuZENvbHVtbi5zZXRBdHRyaWJ1dGUoJ2FyaWEtbGFiZWwnLCB0aXRsZSk7XG5cdFx0dGVtcGxhdGVEYXRhLmNvbW1hbmRDb2x1bW5Ib3Zlci51cGRhdGUodGl0bGUpO1xuXG5cdFx0aWYgKGtleWJpbmRpbmdJdGVtLmNvbW1hbmRMYWJlbCkge1xuXHRcdFx0dGVtcGxhdGVEYXRhLmNvbW1hbmRMYWJlbENvbnRhaW5lci5jbGFzc0xpc3QucmVtb3ZlKCdoaWRlJyk7XG5cdFx0XHR0ZW1wbGF0ZURhdGEuY29tbWFuZExhYmVsLnNldChrZXliaW5kaW5nSXRlbS5jb21tYW5kTGFiZWwsIGtleWJpbmRpbmdJdGVtRW50cnkuY29tbWFuZExhYmVsTWF0Y2hlcyk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHRlbXBsYXRlRGF0YS5jb21tYW5kTGFiZWxDb250YWluZXIuY2xhc3NMaXN0LmFkZCgnaGlkZScpO1xuXHRcdFx0dGVtcGxhdGVEYXRhLmNvbW1hbmRMYWJlbC5zZXQodW5kZWZpbmVkKTtcblx0XHR9XG5cblx0XHRpZiAoa2V5YmluZGluZ0l0ZW1FbnRyeS5jb21tYW5kRGVmYXVsdExhYmVsTWF0Y2hlcykge1xuXHRcdFx0dGVtcGxhdGVEYXRhLmNvbW1hbmREZWZhdWx0TGFiZWxDb250YWluZXIuY2xhc3NMaXN0LnJlbW92ZSgnaGlkZScpO1xuXHRcdFx0dGVtcGxhdGVEYXRhLmNvbW1hbmREZWZhdWx0TGFiZWwuc2V0KGtleWJpbmRpbmdJdGVtLmNvbW1hbmREZWZhdWx0TGFiZWwsIGtleWJpbmRpbmdJdGVtRW50cnkuY29tbWFuZERlZmF1bHRMYWJlbE1hdGNoZXMpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHR0ZW1wbGF0ZURhdGEuY29tbWFuZERlZmF1bHRMYWJlbENvbnRhaW5lci5jbGFzc0xpc3QuYWRkKCdoaWRlJyk7XG5cdFx0XHR0ZW1wbGF0ZURhdGEuY29tbWFuZERlZmF1bHRMYWJlbC5zZXQodW5kZWZpbmVkKTtcblx0XHR9XG5cblx0XHRpZiAoa2V5YmluZGluZ0l0ZW1FbnRyeS5jb21tYW5kSWRNYXRjaGVzIHx8ICFrZXliaW5kaW5nSXRlbS5jb21tYW5kTGFiZWwpIHtcblx0XHRcdHRlbXBsYXRlRGF0YS5jb21tYW5kSWRMYWJlbENvbnRhaW5lci5jbGFzc0xpc3QucmVtb3ZlKCdoaWRlJyk7XG5cdFx0XHR0ZW1wbGF0ZURhdGEuY29tbWFuZElkTGFiZWwuc2V0KGtleWJpbmRpbmdJdGVtLmNvbW1hbmQsIGtleWJpbmRpbmdJdGVtRW50cnkuY29tbWFuZElkTWF0Y2hlcyk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHRlbXBsYXRlRGF0YS5jb21tYW5kSWRMYWJlbENvbnRhaW5lci5jbGFzc0xpc3QuYWRkKCdoaWRlJyk7XG5cdFx0XHR0ZW1wbGF0ZURhdGEuY29tbWFuZElkTGFiZWwuc2V0KHVuZGVmaW5lZCk7XG5cdFx0fVxuXHR9XG5cblx0ZGlzcG9zZVRlbXBsYXRlKHRlbXBsYXRlRGF0YTogSUNvbW1hbmRDb2x1bW5UZW1wbGF0ZURhdGEpOiB2b2lkIHtcblx0XHR0ZW1wbGF0ZURhdGEuY29tbWFuZENvbHVtbkhvdmVyLmRpc3Bvc2UoKTtcblx0XHR0ZW1wbGF0ZURhdGEuY29tbWFuZERlZmF1bHRMYWJlbC5kaXNwb3NlKCk7XG5cdFx0dGVtcGxhdGVEYXRhLmNvbW1hbmRJZExhYmVsLmRpc3Bvc2UoKTtcblx0XHR0ZW1wbGF0ZURhdGEuY29tbWFuZExhYmVsLmRpc3Bvc2UoKTtcblx0fVxufVxuXG5pbnRlcmZhY2UgSUtleWJpbmRpbmdDb2x1bW5UZW1wbGF0ZURhdGEge1xuXHRrZXliaW5kaW5nTGFiZWw6IEtleWJpbmRpbmdMYWJlbDtcbn1cblxuY2xhc3MgS2V5YmluZGluZ0NvbHVtblJlbmRlcmVyIGltcGxlbWVudHMgSVRhYmxlUmVuZGVyZXI8SUtleWJpbmRpbmdJdGVtRW50cnksIElLZXliaW5kaW5nQ29sdW1uVGVtcGxhdGVEYXRhPiB7XG5cblx0c3RhdGljIHJlYWRvbmx5IFRFTVBMQVRFX0lEID0gJ2tleWJpbmRpbmdzJztcblxuXHRyZWFkb25seSB0ZW1wbGF0ZUlkOiBzdHJpbmcgPSBLZXliaW5kaW5nQ29sdW1uUmVuZGVyZXIuVEVNUExBVEVfSUQ7XG5cblx0Y29uc3RydWN0b3IoKSB7IH1cblxuXHRyZW5kZXJUZW1wbGF0ZShjb250YWluZXI6IEhUTUxFbGVtZW50KTogSUtleWJpbmRpbmdDb2x1bW5UZW1wbGF0ZURhdGEge1xuXHRcdGNvbnN0IGVsZW1lbnQgPSBET00uYXBwZW5kKGNvbnRhaW5lciwgJCgnLmtleWJpbmRpbmcnKSk7XG5cdFx0Y29uc3Qga2V5YmluZGluZ0xhYmVsID0gbmV3IEtleWJpbmRpbmdMYWJlbChET00uYXBwZW5kKGVsZW1lbnQsICQoJ2Rpdi5rZXliaW5kaW5nLWxhYmVsJykpLCBPUywgZGVmYXVsdEtleWJpbmRpbmdMYWJlbFN0eWxlcyk7XG5cdFx0cmV0dXJuIHsga2V5YmluZGluZ0xhYmVsIH07XG5cdH1cblxuXHRyZW5kZXJFbGVtZW50KGtleWJpbmRpbmdJdGVtRW50cnk6IElLZXliaW5kaW5nSXRlbUVudHJ5LCBpbmRleDogbnVtYmVyLCB0ZW1wbGF0ZURhdGE6IElLZXliaW5kaW5nQ29sdW1uVGVtcGxhdGVEYXRhKTogdm9pZCB7XG5cdFx0aWYgKGtleWJpbmRpbmdJdGVtRW50cnkua2V5YmluZGluZ0l0ZW0ua2V5YmluZGluZykge1xuXHRcdFx0dGVtcGxhdGVEYXRhLmtleWJpbmRpbmdMYWJlbC5zZXQoa2V5YmluZGluZ0l0ZW1FbnRyeS5rZXliaW5kaW5nSXRlbS5rZXliaW5kaW5nLCBrZXliaW5kaW5nSXRlbUVudHJ5LmtleWJpbmRpbmdNYXRjaGVzKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0dGVtcGxhdGVEYXRhLmtleWJpbmRpbmdMYWJlbC5zZXQodW5kZWZpbmVkLCB1bmRlZmluZWQpO1xuXHRcdH1cblx0fVxuXG5cdGRpc3Bvc2VUZW1wbGF0ZSh0ZW1wbGF0ZURhdGE6IElLZXliaW5kaW5nQ29sdW1uVGVtcGxhdGVEYXRhKTogdm9pZCB7XG5cdFx0dGVtcGxhdGVEYXRhLmtleWJpbmRpbmdMYWJlbC5kaXNwb3NlKCk7XG5cdH1cbn1cblxuaW50ZXJmYWNlIElTb3VyY2VDb2x1bW5UZW1wbGF0ZURhdGEge1xuXHRzb3VyY2VDb2x1bW46IEhUTUxFbGVtZW50O1xuXHRzb3VyY2VDb2x1bW5Ib3ZlcjogSU1hbmFnZWRIb3Zlcjtcblx0c291cmNlTGFiZWw6IEhpZ2hsaWdodGVkTGFiZWw7XG5cdGV4dGVuc2lvbkNvbnRhaW5lcjogSFRNTEVsZW1lbnQ7XG5cdGV4dGVuc2lvbkxhYmVsOiBIVE1MQW5jaG9yRWxlbWVudDtcblx0ZXh0ZW5zaW9uSWQ6IEhpZ2hsaWdodGVkTGFiZWw7XG5cdGRpc3Bvc2FibGVzOiBEaXNwb3NhYmxlU3RvcmU7XG59XG5cbmZ1bmN0aW9uIG9uQ2xpY2soZWxlbWVudDogSFRNTEVsZW1lbnQsIGNhbGxiYWNrOiAoKSA9PiB2b2lkKTogSURpc3Bvc2FibGUge1xuXHRjb25zdCBkaXNwb3NhYmxlcyA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblx0ZGlzcG9zYWJsZXMuYWRkKERPTS5hZGREaXNwb3NhYmxlTGlzdGVuZXIoZWxlbWVudCwgRE9NLkV2ZW50VHlwZS5DTElDSywgRE9NLmZpbmFsSGFuZGxlcihjYWxsYmFjaykpKTtcblx0ZGlzcG9zYWJsZXMuYWRkKERPTS5hZGREaXNwb3NhYmxlTGlzdGVuZXIoZWxlbWVudCwgRE9NLkV2ZW50VHlwZS5LRVlfVVAsIGUgPT4ge1xuXHRcdGNvbnN0IGtleWJvYXJkRXZlbnQgPSBuZXcgU3RhbmRhcmRLZXlib2FyZEV2ZW50KGUpO1xuXHRcdGlmIChrZXlib2FyZEV2ZW50LmVxdWFscyhLZXlDb2RlLlNwYWNlKSB8fCBrZXlib2FyZEV2ZW50LmVxdWFscyhLZXlDb2RlLkVudGVyKSkge1xuXHRcdFx0ZS5wcmV2ZW50RGVmYXVsdCgpO1xuXHRcdFx0ZS5zdG9wUHJvcGFnYXRpb24oKTtcblx0XHRcdGNhbGxiYWNrKCk7XG5cdFx0fVxuXHR9KSk7XG5cdHJldHVybiBkaXNwb3NhYmxlcztcbn1cblxuY2xhc3MgU291cmNlQ29sdW1uUmVuZGVyZXIgaW1wbGVtZW50cyBJVGFibGVSZW5kZXJlcjxJS2V5YmluZGluZ0l0ZW1FbnRyeSwgSVNvdXJjZUNvbHVtblRlbXBsYXRlRGF0YT4ge1xuXG5cdHN0YXRpYyByZWFkb25seSBURU1QTEFURV9JRCA9ICdzb3VyY2UnO1xuXG5cdHJlYWRvbmx5IHRlbXBsYXRlSWQ6IHN0cmluZyA9IFNvdXJjZUNvbHVtblJlbmRlcmVyLlRFTVBMQVRFX0lEO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdEBJRXh0ZW5zaW9uc1dvcmtiZW5jaFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBleHRlbnNpb25zV29ya2JlbmNoU2VydmljZTogSUV4dGVuc2lvbnNXb3JrYmVuY2hTZXJ2aWNlLFxuXHRcdEBJSG92ZXJTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgaG92ZXJTZXJ2aWNlOiBJSG92ZXJTZXJ2aWNlLFxuXHQpIHsgfVxuXG5cdHJlbmRlclRlbXBsYXRlKGNvbnRhaW5lcjogSFRNTEVsZW1lbnQpOiBJU291cmNlQ29sdW1uVGVtcGxhdGVEYXRhIHtcblx0XHRjb25zdCBzb3VyY2VDb2x1bW4gPSBET00uYXBwZW5kKGNvbnRhaW5lciwgJCgnLnNvdXJjZScpKTtcblx0XHRjb25zdCBzb3VyY2VDb2x1bW5Ib3ZlciA9IHRoaXMuaG92ZXJTZXJ2aWNlLnNldHVwTWFuYWdlZEhvdmVyKGdldERlZmF1bHRIb3ZlckRlbGVnYXRlKCdtb3VzZScpLCBzb3VyY2VDb2x1bW4sICcnKTtcblx0XHRjb25zdCBzb3VyY2VMYWJlbCA9IG5ldyBIaWdobGlnaHRlZExhYmVsKERPTS5hcHBlbmQoc291cmNlQ29sdW1uLCAkKCcuc291cmNlLWxhYmVsJykpKTtcblx0XHRjb25zdCBleHRlbnNpb25Db250YWluZXIgPSBET00uYXBwZW5kKHNvdXJjZUNvbHVtbiwgJCgnLmV4dGVuc2lvbi1jb250YWluZXInKSk7XG5cdFx0Y29uc3QgZXh0ZW5zaW9uTGFiZWwgPSBET00uYXBwZW5kPEhUTUxBbmNob3JFbGVtZW50PihleHRlbnNpb25Db250YWluZXIsICQoJ2EuZXh0ZW5zaW9uLWxhYmVsJywgeyB0YWJpbmRleDogMCB9KSk7XG5cdFx0Y29uc3QgZXh0ZW5zaW9uSWQgPSBuZXcgSGlnaGxpZ2h0ZWRMYWJlbChET00uYXBwZW5kKGV4dGVuc2lvbkNvbnRhaW5lciwgJCgnLmV4dGVuc2lvbi1pZC1jb250YWluZXIuY29kZScpKSk7XG5cdFx0cmV0dXJuIHsgc291cmNlQ29sdW1uLCBzb3VyY2VDb2x1bW5Ib3Zlciwgc291cmNlTGFiZWwsIGV4dGVuc2lvbkxhYmVsLCBleHRlbnNpb25Db250YWluZXIsIGV4dGVuc2lvbklkLCBkaXNwb3NhYmxlczogbmV3IERpc3Bvc2FibGVTdG9yZSgpIH07XG5cdH1cblxuXHRyZW5kZXJFbGVtZW50KGtleWJpbmRpbmdJdGVtRW50cnk6IElLZXliaW5kaW5nSXRlbUVudHJ5LCBpbmRleDogbnVtYmVyLCB0ZW1wbGF0ZURhdGE6IElTb3VyY2VDb2x1bW5UZW1wbGF0ZURhdGEpOiB2b2lkIHtcblx0XHR0ZW1wbGF0ZURhdGEuZGlzcG9zYWJsZXMuY2xlYXIoKTtcblx0XHRpZiAoaXNTdHJpbmcoa2V5YmluZGluZ0l0ZW1FbnRyeS5rZXliaW5kaW5nSXRlbS5zb3VyY2UpKSB7XG5cdFx0XHR0ZW1wbGF0ZURhdGEuZXh0ZW5zaW9uQ29udGFpbmVyLmNsYXNzTGlzdC5hZGQoJ2hpZGUnKTtcblx0XHRcdHRlbXBsYXRlRGF0YS5zb3VyY2VMYWJlbC5lbGVtZW50LmNsYXNzTGlzdC5yZW1vdmUoJ2hpZGUnKTtcblx0XHRcdHRlbXBsYXRlRGF0YS5zb3VyY2VDb2x1bW5Ib3Zlci51cGRhdGUoJycpO1xuXHRcdFx0dGVtcGxhdGVEYXRhLnNvdXJjZUxhYmVsLnNldChrZXliaW5kaW5nSXRlbUVudHJ5LmtleWJpbmRpbmdJdGVtLnNvdXJjZSB8fCAnLScsIGtleWJpbmRpbmdJdGVtRW50cnkuc291cmNlTWF0Y2hlcyk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHRlbXBsYXRlRGF0YS5leHRlbnNpb25Db250YWluZXIuY2xhc3NMaXN0LnJlbW92ZSgnaGlkZScpO1xuXHRcdFx0dGVtcGxhdGVEYXRhLnNvdXJjZUxhYmVsLmVsZW1lbnQuY2xhc3NMaXN0LmFkZCgnaGlkZScpO1xuXHRcdFx0Y29uc3QgZXh0ZW5zaW9uID0ga2V5YmluZGluZ0l0ZW1FbnRyeS5rZXliaW5kaW5nSXRlbS5zb3VyY2U7XG5cdFx0XHRjb25zdCBleHRlbnNpb25MYWJlbCA9IGV4dGVuc2lvbi5kaXNwbGF5TmFtZSA/PyBleHRlbnNpb24uaWRlbnRpZmllci52YWx1ZTtcblx0XHRcdHRlbXBsYXRlRGF0YS5zb3VyY2VDb2x1bW5Ib3Zlci51cGRhdGUobG9jYWxpemUoJ2V4dGVuc2lvbiBsYWJlbCcsIFwiRXh0ZW5zaW9uICh7MH0pXCIsIGV4dGVuc2lvbkxhYmVsKSk7XG5cdFx0XHR0ZW1wbGF0ZURhdGEuZXh0ZW5zaW9uTGFiZWwudGV4dENvbnRlbnQgPSBleHRlbnNpb25MYWJlbDtcblx0XHRcdHRlbXBsYXRlRGF0YS5kaXNwb3NhYmxlcy5hZGQob25DbGljayh0ZW1wbGF0ZURhdGEuZXh0ZW5zaW9uTGFiZWwsICgpID0+IHtcblx0XHRcdFx0dGhpcy5leHRlbnNpb25zV29ya2JlbmNoU2VydmljZS5vcGVuKGV4dGVuc2lvbi5pZGVudGlmaWVyLnZhbHVlKTtcblx0XHRcdH0pKTtcblx0XHRcdGlmIChrZXliaW5kaW5nSXRlbUVudHJ5LmV4dGVuc2lvbklkTWF0Y2hlcykge1xuXHRcdFx0XHR0ZW1wbGF0ZURhdGEuZXh0ZW5zaW9uSWQuZWxlbWVudC5jbGFzc0xpc3QucmVtb3ZlKCdoaWRlJyk7XG5cdFx0XHRcdHRlbXBsYXRlRGF0YS5leHRlbnNpb25JZC5zZXQoZXh0ZW5zaW9uLmlkZW50aWZpZXIudmFsdWUsIGtleWJpbmRpbmdJdGVtRW50cnkuZXh0ZW5zaW9uSWRNYXRjaGVzKTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdHRlbXBsYXRlRGF0YS5leHRlbnNpb25JZC5lbGVtZW50LmNsYXNzTGlzdC5hZGQoJ2hpZGUnKTtcblx0XHRcdFx0dGVtcGxhdGVEYXRhLmV4dGVuc2lvbklkLnNldCh1bmRlZmluZWQpO1xuXHRcdFx0fVxuXHRcdH1cblx0fVxuXG5cdGRpc3Bvc2VUZW1wbGF0ZSh0ZW1wbGF0ZURhdGE6IElTb3VyY2VDb2x1bW5UZW1wbGF0ZURhdGEpOiB2b2lkIHtcblx0XHR0ZW1wbGF0ZURhdGEuc291cmNlQ29sdW1uSG92ZXIuZGlzcG9zZSgpO1xuXHRcdHRlbXBsYXRlRGF0YS5kaXNwb3NhYmxlcy5kaXNwb3NlKCk7XG5cdFx0dGVtcGxhdGVEYXRhLnNvdXJjZUxhYmVsLmRpc3Bvc2UoKTtcblx0XHR0ZW1wbGF0ZURhdGEuZXh0ZW5zaW9uSWQuZGlzcG9zZSgpO1xuXHR9XG59XG5cbmNsYXNzIFdoZW5JbnB1dFdpZGdldCBleHRlbmRzIERpc3Bvc2FibGUge1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgaW5wdXQ6IFN1Z2dlc3RFbmFibGVkSW5wdXQ7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfb25EaWRBY2NlcHQgPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjxzdHJpbmc+KCkpO1xuXHRyZWFkb25seSBvbkRpZEFjY2VwdCA9IHRoaXMuX29uRGlkQWNjZXB0LmV2ZW50O1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX29uRGlkUmVqZWN0ID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8dm9pZD4oKSk7XG5cdHJlYWRvbmx5IG9uRGlkUmVqZWN0ID0gdGhpcy5fb25EaWRSZWplY3QuZXZlbnQ7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0cGFyZW50OiBIVE1MRWxlbWVudCxcblx0XHRrZXliaW5kaW5nc0VkaXRvcjogS2V5YmluZGluZ3NFZGl0b3IsXG5cdFx0QElJbnN0YW50aWF0aW9uU2VydmljZSBpbnN0YW50aWF0aW9uU2VydmljZTogSUluc3RhbnRpYXRpb25TZXJ2aWNlLFxuXHRcdEBJQ29udGV4dEtleVNlcnZpY2UgY29udGV4dEtleVNlcnZpY2U6IElDb250ZXh0S2V5U2VydmljZSxcblx0KSB7XG5cdFx0c3VwZXIoKTtcblx0XHRjb25zdCBmb2N1c0NvbnRleHRLZXkgPSBDT05URVhUX1dIRU5fRk9DVVMuYmluZFRvKGNvbnRleHRLZXlTZXJ2aWNlKTtcblx0XHR0aGlzLmlucHV0ID0gdGhpcy5fcmVnaXN0ZXIoaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoU3VnZ2VzdEVuYWJsZWRJbnB1dCwgJ2tleWJvYXJkc2hvcnRjdXRzZWRpdG9yI3doZW5pbnB1dCcsIHBhcmVudCwge1xuXHRcdFx0cHJvdmlkZVJlc3VsdHM6ICgpID0+IHtcblx0XHRcdFx0Y29uc3QgcmVzdWx0ID0gW107XG5cdFx0XHRcdGZvciAoY29uc3QgY29udGV4dEtleSBvZiBSYXdDb250ZXh0S2V5LmFsbCgpKSB7XG5cdFx0XHRcdFx0cmVzdWx0LnB1c2goeyBsYWJlbDogY29udGV4dEtleS5rZXksIGRvY3VtZW50YXRpb246IGNvbnRleHRLZXkuZGVzY3JpcHRpb24sIGRldGFpbDogY29udGV4dEtleS50eXBlLCBraW5kOiBDb21wbGV0aW9uSXRlbUtpbmQuQ29uc3RhbnQgfSk7XG5cdFx0XHRcdH1cblx0XHRcdFx0cmV0dXJuIHJlc3VsdDtcblx0XHRcdH0sXG5cdFx0XHR0cmlnZ2VyQ2hhcmFjdGVyczogWychJywgJyAnXSxcblx0XHRcdHdvcmREZWZpbml0aW9uOiAvW2EtekEtWi5dKy8sXG5cdFx0XHRhbHdheXNTaG93U3VnZ2VzdGlvbnM6IHRydWUsXG5cdFx0fSwgJycsIGBrZXlib2FyZHNob3J0Y3V0c2VkaXRvciN3aGVuaW5wdXRgLCB7IGZvY3VzQ29udGV4dEtleSwgb3ZlcmZsb3dXaWRnZXRzRG9tTm9kZToga2V5YmluZGluZ3NFZGl0b3Iub3ZlcmZsb3dXaWRnZXRzRG9tTm9kZSB9KSk7XG5cblx0XHR0aGlzLl9yZWdpc3RlcigoRE9NLmFkZERpc3Bvc2FibGVMaXN0ZW5lcih0aGlzLmlucHV0LmVsZW1lbnQsIERPTS5FdmVudFR5cGUuREJMQ0xJQ0ssIGUgPT4gRE9NLkV2ZW50SGVscGVyLnN0b3AoZSkpKSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodG9EaXNwb3NhYmxlKCgpID0+IGZvY3VzQ29udGV4dEtleS5yZXNldCgpKSk7XG5cblx0XHR0aGlzLl9yZWdpc3RlcihrZXliaW5kaW5nc0VkaXRvci5vbkFjY2VwdFdoZW5FeHByZXNzaW9uKCgpID0+IHRoaXMuX29uRGlkQWNjZXB0LmZpcmUodGhpcy5pbnB1dC5nZXRWYWx1ZSgpKSkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKEV2ZW50LmFueShrZXliaW5kaW5nc0VkaXRvci5vblJlamVjdFdoZW5FeHByZXNzaW9uLCB0aGlzLmlucHV0Lm9uRGlkQmx1cikoKCkgPT4gdGhpcy5fb25EaWRSZWplY3QuZmlyZSgpKSk7XG5cdH1cblxuXHRsYXlvdXQoZGltZW5zaW9uOiBET00uRGltZW5zaW9uKTogdm9pZCB7XG5cdFx0dGhpcy5pbnB1dC5sYXlvdXQoZGltZW5zaW9uKTtcblx0fVxuXG5cdHNob3codmFsdWU6IHN0cmluZyk6IHZvaWQge1xuXHRcdHRoaXMuaW5wdXQuc2V0VmFsdWUodmFsdWUpO1xuXHRcdHRoaXMuaW5wdXQuZm9jdXModHJ1ZSk7XG5cdH1cblxufVxuXG5pbnRlcmZhY2UgSVdoZW5Db2x1bW5UZW1wbGF0ZURhdGEge1xuXHRyZWFkb25seSBlbGVtZW50OiBIVE1MRWxlbWVudDtcblx0cmVhZG9ubHkgd2hlbkxhYmVsQ29udGFpbmVyOiBIVE1MRWxlbWVudDtcblx0cmVhZG9ubHkgd2hlbklucHV0Q29udGFpbmVyOiBIVE1MRWxlbWVudDtcblx0cmVhZG9ubHkgd2hlbkxhYmVsOiBIaWdobGlnaHRlZExhYmVsO1xuXHRyZWFkb25seSBkaXNwb3NhYmxlczogRGlzcG9zYWJsZVN0b3JlO1xufVxuXG5jbGFzcyBXaGVuQ29sdW1uUmVuZGVyZXIgaW1wbGVtZW50cyBJVGFibGVSZW5kZXJlcjxJS2V5YmluZGluZ0l0ZW1FbnRyeSwgSVdoZW5Db2x1bW5UZW1wbGF0ZURhdGE+IHtcblxuXHRzdGF0aWMgcmVhZG9ubHkgVEVNUExBVEVfSUQgPSAnd2hlbic7XG5cblx0cmVhZG9ubHkgdGVtcGxhdGVJZDogc3RyaW5nID0gV2hlbkNvbHVtblJlbmRlcmVyLlRFTVBMQVRFX0lEO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdHByaXZhdGUgcmVhZG9ubHkga2V5YmluZGluZ3NFZGl0b3I6IEtleWJpbmRpbmdzRWRpdG9yLFxuXHRcdEBJSG92ZXJTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgaG92ZXJTZXJ2aWNlOiBJSG92ZXJTZXJ2aWNlLFxuXHRcdEBJSW5zdGFudGlhdGlvblNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBpbnN0YW50aWF0aW9uU2VydmljZTogSUluc3RhbnRpYXRpb25TZXJ2aWNlLFxuXHQpIHsgfVxuXG5cdHJlbmRlclRlbXBsYXRlKGNvbnRhaW5lcjogSFRNTEVsZW1lbnQpOiBJV2hlbkNvbHVtblRlbXBsYXRlRGF0YSB7XG5cdFx0Y29uc3QgZWxlbWVudCA9IERPTS5hcHBlbmQoY29udGFpbmVyLCAkKCcud2hlbicpKTtcblxuXHRcdGNvbnN0IHdoZW5MYWJlbENvbnRhaW5lciA9IERPTS5hcHBlbmQoZWxlbWVudCwgJCgnZGl2LndoZW4tbGFiZWwnKSk7XG5cdFx0Y29uc3Qgd2hlbkxhYmVsID0gbmV3IEhpZ2hsaWdodGVkTGFiZWwod2hlbkxhYmVsQ29udGFpbmVyKTtcblxuXHRcdGNvbnN0IHdoZW5JbnB1dENvbnRhaW5lciA9IERPTS5hcHBlbmQoZWxlbWVudCwgJCgnZGl2LndoZW4taW5wdXQtY29udGFpbmVyJykpO1xuXG5cdFx0cmV0dXJuIHtcblx0XHRcdGVsZW1lbnQsXG5cdFx0XHR3aGVuTGFiZWxDb250YWluZXIsXG5cdFx0XHR3aGVuTGFiZWwsXG5cdFx0XHR3aGVuSW5wdXRDb250YWluZXIsXG5cdFx0XHRkaXNwb3NhYmxlczogbmV3IERpc3Bvc2FibGVTdG9yZSgpLFxuXHRcdH07XG5cdH1cblxuXHRyZW5kZXJFbGVtZW50KGtleWJpbmRpbmdJdGVtRW50cnk6IElLZXliaW5kaW5nSXRlbUVudHJ5LCBpbmRleDogbnVtYmVyLCB0ZW1wbGF0ZURhdGE6IElXaGVuQ29sdW1uVGVtcGxhdGVEYXRhKTogdm9pZCB7XG5cdFx0dGVtcGxhdGVEYXRhLmRpc3Bvc2FibGVzLmNsZWFyKCk7XG5cdFx0Y29uc3Qgd2hlbklucHV0RGlzcG9zYWJsZXMgPSB0ZW1wbGF0ZURhdGEuZGlzcG9zYWJsZXMuYWRkKG5ldyBEaXNwb3NhYmxlU3RvcmUoKSk7XG5cdFx0dGVtcGxhdGVEYXRhLmRpc3Bvc2FibGVzLmFkZCh0aGlzLmtleWJpbmRpbmdzRWRpdG9yLm9uRGVmaW5lV2hlbkV4cHJlc3Npb24oZSA9PiB7XG5cdFx0XHRpZiAoa2V5YmluZGluZ0l0ZW1FbnRyeSA9PT0gZSkge1xuXHRcdFx0XHR0ZW1wbGF0ZURhdGEuZWxlbWVudC5jbGFzc0xpc3QuYWRkKCdpbnB1dC1tb2RlJyk7XG5cblx0XHRcdFx0Y29uc3QgaW5wdXRXaWRnZXQgPSB3aGVuSW5wdXREaXNwb3NhYmxlcy5hZGQodGhpcy5pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShXaGVuSW5wdXRXaWRnZXQsIHRlbXBsYXRlRGF0YS53aGVuSW5wdXRDb250YWluZXIsIHRoaXMua2V5YmluZGluZ3NFZGl0b3IpKTtcblx0XHRcdFx0aW5wdXRXaWRnZXQubGF5b3V0KG5ldyBET00uRGltZW5zaW9uKHRlbXBsYXRlRGF0YS5lbGVtZW50LnBhcmVudEVsZW1lbnQhLmNsaWVudFdpZHRoLCAxOCkpO1xuXHRcdFx0XHRpbnB1dFdpZGdldC5zaG93KGtleWJpbmRpbmdJdGVtRW50cnkua2V5YmluZGluZ0l0ZW0ud2hlbiB8fCAnJyk7XG5cblx0XHRcdFx0Y29uc3QgaGlkZUlucHV0V2lkZ2V0ID0gKCkgPT4ge1xuXHRcdFx0XHRcdHdoZW5JbnB1dERpc3Bvc2FibGVzLmNsZWFyKCk7XG5cdFx0XHRcdFx0dGVtcGxhdGVEYXRhLmVsZW1lbnQuY2xhc3NMaXN0LnJlbW92ZSgnaW5wdXQtbW9kZScpO1xuXHRcdFx0XHRcdHRlbXBsYXRlRGF0YS5lbGVtZW50LnBhcmVudEVsZW1lbnQhLnN0eWxlLnBhZGRpbmdMZWZ0ID0gJzEwcHgnO1xuXHRcdFx0XHRcdERPTS5jbGVhck5vZGUodGVtcGxhdGVEYXRhLndoZW5JbnB1dENvbnRhaW5lcik7XG5cdFx0XHRcdH07XG5cblx0XHRcdFx0d2hlbklucHV0RGlzcG9zYWJsZXMuYWRkKGlucHV0V2lkZ2V0Lm9uRGlkQWNjZXB0KHZhbHVlID0+IHtcblx0XHRcdFx0XHRoaWRlSW5wdXRXaWRnZXQoKTtcblx0XHRcdFx0XHR0aGlzLmtleWJpbmRpbmdzRWRpdG9yLnVwZGF0ZUtleWJpbmRpbmcoa2V5YmluZGluZ0l0ZW1FbnRyeSwga2V5YmluZGluZ0l0ZW1FbnRyeS5rZXliaW5kaW5nSXRlbS5rZXliaW5kaW5nID8ga2V5YmluZGluZ0l0ZW1FbnRyeS5rZXliaW5kaW5nSXRlbS5rZXliaW5kaW5nLmdldFVzZXJTZXR0aW5nc0xhYmVsKCkgfHwgJycgOiAnJywgdmFsdWUpO1xuXHRcdFx0XHRcdHRoaXMua2V5YmluZGluZ3NFZGl0b3Iuc2VsZWN0S2V5YmluZGluZyhrZXliaW5kaW5nSXRlbUVudHJ5KTtcblx0XHRcdFx0fSkpO1xuXG5cdFx0XHRcdHdoZW5JbnB1dERpc3Bvc2FibGVzLmFkZChpbnB1dFdpZGdldC5vbkRpZFJlamVjdCgoKSA9PiB7XG5cdFx0XHRcdFx0aGlkZUlucHV0V2lkZ2V0KCk7XG5cdFx0XHRcdFx0dGhpcy5rZXliaW5kaW5nc0VkaXRvci5zZWxlY3RLZXliaW5kaW5nKGtleWJpbmRpbmdJdGVtRW50cnkpO1xuXHRcdFx0XHR9KSk7XG5cblx0XHRcdFx0dGVtcGxhdGVEYXRhLmVsZW1lbnQucGFyZW50RWxlbWVudCEuc3R5bGUucGFkZGluZ0xlZnQgPSAnMHB4Jztcblx0XHRcdH1cblx0XHR9KSk7XG5cblx0XHR0ZW1wbGF0ZURhdGEud2hlbkxhYmVsQ29udGFpbmVyLmNsYXNzTGlzdC50b2dnbGUoJ2NvZGUnLCAhIWtleWJpbmRpbmdJdGVtRW50cnkua2V5YmluZGluZ0l0ZW0ud2hlbik7XG5cdFx0dGVtcGxhdGVEYXRhLndoZW5MYWJlbENvbnRhaW5lci5jbGFzc0xpc3QudG9nZ2xlKCdlbXB0eScsICFrZXliaW5kaW5nSXRlbUVudHJ5LmtleWJpbmRpbmdJdGVtLndoZW4pO1xuXG5cdFx0aWYgKGtleWJpbmRpbmdJdGVtRW50cnkua2V5YmluZGluZ0l0ZW0ud2hlbikge1xuXHRcdFx0dGVtcGxhdGVEYXRhLndoZW5MYWJlbC5zZXQoa2V5YmluZGluZ0l0ZW1FbnRyeS5rZXliaW5kaW5nSXRlbS53aGVuLCBrZXliaW5kaW5nSXRlbUVudHJ5LndoZW5NYXRjaGVzLCBrZXliaW5kaW5nSXRlbUVudHJ5LmtleWJpbmRpbmdJdGVtLndoZW4pO1xuXHRcdFx0dGVtcGxhdGVEYXRhLmRpc3Bvc2FibGVzLmFkZCh0aGlzLmhvdmVyU2VydmljZS5zZXR1cE1hbmFnZWRIb3ZlcihnZXREZWZhdWx0SG92ZXJEZWxlZ2F0ZSgnbW91c2UnKSwgdGVtcGxhdGVEYXRhLmVsZW1lbnQsIGtleWJpbmRpbmdJdGVtRW50cnkua2V5YmluZGluZ0l0ZW0ud2hlbikpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHR0ZW1wbGF0ZURhdGEud2hlbkxhYmVsLnNldCgnLScpO1xuXHRcdH1cblx0fVxuXG5cdGRpc3Bvc2VUZW1wbGF0ZSh0ZW1wbGF0ZURhdGE6IElXaGVuQ29sdW1uVGVtcGxhdGVEYXRhKTogdm9pZCB7XG5cdFx0dGVtcGxhdGVEYXRhLmRpc3Bvc2FibGVzLmRpc3Bvc2UoKTtcblx0XHR0ZW1wbGF0ZURhdGEud2hlbkxhYmVsLmRpc3Bvc2UoKTtcblx0fVxufVxuXG5jbGFzcyBBY2Nlc3NpYmlsaXR5UHJvdmlkZXIgaW1wbGVtZW50cyBJTGlzdEFjY2Vzc2liaWxpdHlQcm92aWRlcjxJS2V5YmluZGluZ0l0ZW1FbnRyeT4ge1xuXG5cdGNvbnN0cnVjdG9yKHByaXZhdGUgcmVhZG9ubHkgY29uZmlndXJhdGlvblNlcnZpY2U6IElDb25maWd1cmF0aW9uU2VydmljZSkgeyB9XG5cblx0Z2V0V2lkZ2V0QXJpYUxhYmVsKCk6IHN0cmluZyB7XG5cdFx0cmV0dXJuIGxvY2FsaXplKCdrZXliaW5kaW5nc0xhYmVsJywgXCJLZXliaW5kaW5nc1wiKTtcblx0fVxuXG5cdGdldEFyaWFMYWJlbCh7IGtleWJpbmRpbmdJdGVtIH06IElLZXliaW5kaW5nSXRlbUVudHJ5KTogc3RyaW5nIHtcblx0XHRjb25zdCBhcmlhTGFiZWwgPSBbXG5cdFx0XHRrZXliaW5kaW5nSXRlbS5jb21tYW5kTGFiZWwgPyBrZXliaW5kaW5nSXRlbS5jb21tYW5kTGFiZWwgOiBrZXliaW5kaW5nSXRlbS5jb21tYW5kLFxuXHRcdFx0a2V5YmluZGluZ0l0ZW0ua2V5YmluZGluZz8uZ2V0QXJpYUxhYmVsKCkgfHwgbG9jYWxpemUoJ25vS2V5YmluZGluZycsIFwiTm8ga2V5YmluZGluZyBhc3NpZ25lZFwiKSxcblx0XHRcdGtleWJpbmRpbmdJdGVtLndoZW4gPyBrZXliaW5kaW5nSXRlbS53aGVuIDogbG9jYWxpemUoJ25vV2hlbicsIFwiTm8gd2hlbiBjb250ZXh0XCIpLFxuXHRcdFx0aXNTdHJpbmcoa2V5YmluZGluZ0l0ZW0uc291cmNlKSA/IGtleWJpbmRpbmdJdGVtLnNvdXJjZSA6IGtleWJpbmRpbmdJdGVtLnNvdXJjZS5kZXNjcmlwdGlvbiA/PyBrZXliaW5kaW5nSXRlbS5zb3VyY2UuaWRlbnRpZmllci52YWx1ZSxcblx0XHRdO1xuXHRcdGlmICh0aGlzLmNvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldFZhbHVlKEFjY2Vzc2liaWxpdHlWZXJib3NpdHlTZXR0aW5nSWQuS2V5YmluZGluZ3NFZGl0b3IpKSB7XG5cdFx0XHRjb25zdCBrYkVkaXRvckFyaWFMYWJlbCA9IGxvY2FsaXplKCdrZXlib2FyZCBzaG9ydGN1dHMgYXJpYSBsYWJlbCcsIFwidXNlIHNwYWNlIG9yIGVudGVyIHRvIGNoYW5nZSB0aGUga2V5YmluZGluZy5cIik7XG5cdFx0XHRhcmlhTGFiZWwucHVzaChrYkVkaXRvckFyaWFMYWJlbCk7XG5cdFx0fVxuXHRcdHJldHVybiBhcmlhTGFiZWwuam9pbignLCAnKTtcblx0fVxufVxuXG5yZWdpc3RlckNvbG9yKCdrZXliaW5kaW5nVGFibGUuaGVhZGVyQmFja2dyb3VuZCcsIHRhYmxlT2RkUm93c0JhY2tncm91bmRDb2xvciwgJ0JhY2tncm91bmQgY29sb3IgZm9yIHRoZSBrZXlib2FyZCBzaG9ydGN1dHMgdGFibGUgaGVhZGVyLicpO1xucmVnaXN0ZXJDb2xvcigna2V5YmluZGluZ1RhYmxlLnJvd3NCYWNrZ3JvdW5kJywgdGFibGVPZGRSb3dzQmFja2dyb3VuZENvbG9yLCAnQmFja2dyb3VuZCBjb2xvciBmb3IgdGhlIGtleWJvYXJkIHNob3J0Y3V0cyB0YWJsZSBhbHRlcm5hdGluZyByb3dzLicpO1xuXG5yZWdpc3RlclRoZW1pbmdQYXJ0aWNpcGFudCgodGhlbWU6IElDb2xvclRoZW1lLCBjb2xsZWN0b3I6IElDc3NTdHlsZUNvbGxlY3RvcikgPT4ge1xuXHRjb25zdCBmb3JlZ3JvdW5kQ29sb3IgPSB0aGVtZS5nZXRDb2xvcihmb3JlZ3JvdW5kKTtcblx0aWYgKGZvcmVncm91bmRDb2xvcikge1xuXHRcdGNvbnN0IHdoZW5Gb3JlZ3JvdW5kQ29sb3IgPSBmb3JlZ3JvdW5kQ29sb3IudHJhbnNwYXJlbnQoLjgpLm1ha2VPcGFxdWUoV09SS0JFTkNIX0JBQ0tHUk9VTkQodGhlbWUpKTtcblx0XHRjb2xsZWN0b3IuYWRkUnVsZShgLmtleWJpbmRpbmdzLWVkaXRvciA+IC5rZXliaW5kaW5ncy1ib2R5ID4gLmtleWJpbmRpbmdzLXRhYmxlLWNvbnRhaW5lciAubW9uYWNvLXRhYmxlIC5tb25hY28tdGFibGUtdHIgLm1vbmFjby10YWJsZS10ZCAuY29kZSB7IGNvbG9yOiAke3doZW5Gb3JlZ3JvdW5kQ29sb3J9OyB9YCk7XG5cdH1cblxuXHRjb25zdCBsaXN0QWN0aXZlU2VsZWN0aW9uRm9yZWdyb3VuZENvbG9yID0gdGhlbWUuZ2V0Q29sb3IobGlzdEFjdGl2ZVNlbGVjdGlvbkZvcmVncm91bmQpO1xuXHRjb25zdCBsaXN0QWN0aXZlU2VsZWN0aW9uQmFja2dyb3VuZENvbG9yID0gdGhlbWUuZ2V0Q29sb3IobGlzdEFjdGl2ZVNlbGVjdGlvbkJhY2tncm91bmQpO1xuXHRpZiAobGlzdEFjdGl2ZVNlbGVjdGlvbkZvcmVncm91bmRDb2xvciAmJiBsaXN0QWN0aXZlU2VsZWN0aW9uQmFja2dyb3VuZENvbG9yKSB7XG5cdFx0Y29uc3Qgd2hlbkZvcmVncm91bmRDb2xvciA9IGxpc3RBY3RpdmVTZWxlY3Rpb25Gb3JlZ3JvdW5kQ29sb3IudHJhbnNwYXJlbnQoLjgpLm1ha2VPcGFxdWUobGlzdEFjdGl2ZVNlbGVjdGlvbkJhY2tncm91bmRDb2xvcik7XG5cdFx0Y29sbGVjdG9yLmFkZFJ1bGUoYC5rZXliaW5kaW5ncy1lZGl0b3IgPiAua2V5YmluZGluZ3MtYm9keSA+IC5rZXliaW5kaW5ncy10YWJsZS1jb250YWluZXIgLm1vbmFjby10YWJsZS5mb2N1c2VkIC5tb25hY28tbGlzdC1yb3cuc2VsZWN0ZWQgLm1vbmFjby10YWJsZS10ciAubW9uYWNvLXRhYmxlLXRkIC5jb2RlIHsgY29sb3I6ICR7d2hlbkZvcmVncm91bmRDb2xvcn07IH1gKTtcblx0fVxuXG5cdGNvbnN0IGxpc3RJbmFjdGl2ZVNlbGVjdGlvbkZvcmVncm91bmRDb2xvciA9IHRoZW1lLmdldENvbG9yKGxpc3RJbmFjdGl2ZVNlbGVjdGlvbkZvcmVncm91bmQpO1xuXHRjb25zdCBsaXN0SW5hY3RpdmVTZWxlY3Rpb25CYWNrZ3JvdW5kQ29sb3IgPSB0aGVtZS5nZXRDb2xvcihsaXN0SW5hY3RpdmVTZWxlY3Rpb25CYWNrZ3JvdW5kKTtcblx0aWYgKGxpc3RJbmFjdGl2ZVNlbGVjdGlvbkZvcmVncm91bmRDb2xvciAmJiBsaXN0SW5hY3RpdmVTZWxlY3Rpb25CYWNrZ3JvdW5kQ29sb3IpIHtcblx0XHRjb25zdCB3aGVuRm9yZWdyb3VuZENvbG9yID0gbGlzdEluYWN0aXZlU2VsZWN0aW9uRm9yZWdyb3VuZENvbG9yLnRyYW5zcGFyZW50KC44KS5tYWtlT3BhcXVlKGxpc3RJbmFjdGl2ZVNlbGVjdGlvbkJhY2tncm91bmRDb2xvcik7XG5cdFx0Y29sbGVjdG9yLmFkZFJ1bGUoYC5rZXliaW5kaW5ncy1lZGl0b3IgPiAua2V5YmluZGluZ3MtYm9keSA+IC5rZXliaW5kaW5ncy10YWJsZS1jb250YWluZXIgLm1vbmFjby10YWJsZSAubW9uYWNvLWxpc3Qtcm93LnNlbGVjdGVkIC5tb25hY28tdGFibGUtdHIgLm1vbmFjby10YWJsZS10ZCAuY29kZSB7IGNvbG9yOiAke3doZW5Gb3JlZ3JvdW5kQ29sb3J9OyB9YCk7XG5cdH1cblxuXHRjb25zdCBsaXN0Rm9jdXNGb3JlZ3JvdW5kQ29sb3IgPSB0aGVtZS5nZXRDb2xvcihsaXN0Rm9jdXNGb3JlZ3JvdW5kKTtcblx0Y29uc3QgbGlzdEZvY3VzQmFja2dyb3VuZENvbG9yID0gdGhlbWUuZ2V0Q29sb3IobGlzdEZvY3VzQmFja2dyb3VuZCk7XG5cdGlmIChsaXN0Rm9jdXNGb3JlZ3JvdW5kQ29sb3IgJiYgbGlzdEZvY3VzQmFja2dyb3VuZENvbG9yKSB7XG5cdFx0Y29uc3Qgd2hlbkZvcmVncm91bmRDb2xvciA9IGxpc3RGb2N1c0ZvcmVncm91bmRDb2xvci50cmFuc3BhcmVudCguOCkubWFrZU9wYXF1ZShsaXN0Rm9jdXNCYWNrZ3JvdW5kQ29sb3IpO1xuXHRcdGNvbGxlY3Rvci5hZGRSdWxlKGAua2V5YmluZGluZ3MtZWRpdG9yID4gLmtleWJpbmRpbmdzLWJvZHkgPiAua2V5YmluZGluZ3MtdGFibGUtY29udGFpbmVyIC5tb25hY28tdGFibGUuZm9jdXNlZCAubW9uYWNvLWxpc3Qtcm93LmZvY3VzZWQgLm1vbmFjby10YWJsZS10ciAubW9uYWNvLXRhYmxlLXRkIC5jb2RlIHsgY29sb3I6ICR7d2hlbkZvcmVncm91bmRDb2xvcn07IH1gKTtcblx0fVxuXG5cdGNvbnN0IGxpc3RIb3ZlckZvcmVncm91bmRDb2xvciA9IHRoZW1lLmdldENvbG9yKGxpc3RIb3ZlckZvcmVncm91bmQpO1xuXHRjb25zdCBsaXN0SG92ZXJCYWNrZ3JvdW5kQ29sb3IgPSB0aGVtZS5nZXRDb2xvcihsaXN0SG92ZXJCYWNrZ3JvdW5kKTtcblx0aWYgKGxpc3RIb3ZlckZvcmVncm91bmRDb2xvciAmJiBsaXN0SG92ZXJCYWNrZ3JvdW5kQ29sb3IpIHtcblx0XHRjb25zdCB3aGVuRm9yZWdyb3VuZENvbG9yID0gbGlzdEhvdmVyRm9yZWdyb3VuZENvbG9yLnRyYW5zcGFyZW50KC44KS5tYWtlT3BhcXVlKGxpc3RIb3ZlckJhY2tncm91bmRDb2xvcik7XG5cdFx0Y29sbGVjdG9yLmFkZFJ1bGUoYC5rZXliaW5kaW5ncy1lZGl0b3IgPiAua2V5YmluZGluZ3MtYm9keSA+IC5rZXliaW5kaW5ncy10YWJsZS1jb250YWluZXIgLm1vbmFjby10YWJsZS5mb2N1c2VkIC5tb25hY28tbGlzdC1yb3c6aG92ZXI6bm90KC5mb2N1c2VkKTpub3QoLnNlbGVjdGVkKSAubW9uYWNvLXRhYmxlLXRyIC5tb25hY28tdGFibGUtdGQgLmNvZGUgeyBjb2xvcjogJHt3aGVuRm9yZWdyb3VuZENvbG9yfTsgfWApO1xuXHR9XG59KTtcbiJdLAogICJtYXBwaW5ncyI6ICI7Ozs7Ozs7Ozs7O0FBTUEsT0FBTztBQUNQLFNBQVMsZ0JBQWdCO0FBQ3pCLFNBQVMsZUFBZTtBQUN4QixZQUFZLFNBQVM7QUFDckIsU0FBUyxPQUFPLFVBQVU7QUFDMUIsU0FBUyxZQUFZLGlCQUE4QixvQkFBb0I7QUFDdkUsU0FBUyw0QkFBNEI7QUFDckMsU0FBUyx3QkFBd0I7QUFDakMsU0FBUyx1QkFBdUI7QUFDaEMsU0FBa0IsUUFBUSxpQkFBaUI7QUFDM0MsU0FBUyxpQkFBaUI7QUFDMUIsU0FBUyxrQkFBa0I7QUFFM0IsU0FBUyx5QkFBeUI7QUFDbEMsU0FBUyx5QkFBeUI7QUFDbEMsU0FBaUMsb0NBQW9DO0FBQ3JFLFNBQVMsNkJBQTZCO0FBQ3RDLFNBQVMsMEJBQW1EO0FBQzVELFNBQVMsd0JBQXdCLCtCQUErQjtBQUNoRSxTQUFTLDBCQUEwQiw0QkFBNEIsa0NBQWtDLHNDQUFzQywrQ0FBK0MsOENBQThDLG1DQUFtQyxtQ0FBbUMsa0NBQWtDLGlDQUFpQyx5Q0FBeUMsaURBQWlELHdDQUF3Qyx5Q0FBeUMsZ0NBQWdDLCtDQUErQywwQkFBMEI7QUFDam9CLFNBQVMsMkJBQTJCO0FBQ3BDLFNBQVMsaUNBQWlDO0FBRTFDLFNBQVMsZUFBZSxrQ0FBbUU7QUFDM0YsU0FBUyxpQkFBaUI7QUFDMUIsU0FBUyxvQkFBaUMscUJBQXFCO0FBQy9ELFNBQVMsZUFBZTtBQUN4QixTQUFTLGlCQUFpQixnQkFBZ0IsaUJBQWlCLCtCQUErQixpQ0FBaUMscUJBQXFCLHFCQUFxQixrQkFBa0Is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
