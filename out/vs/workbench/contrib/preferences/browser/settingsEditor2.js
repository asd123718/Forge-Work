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
import * as DOM from "../../../../base/browser/dom.js";
import { StandardKeyboardEvent } from "../../../../base/browser/keyboardEvent.js";
import { ActionBar } from "../../../../base/browser/ui/actionbar/actionbar.js";
import * as aria from "../../../../base/browser/ui/aria/aria.js";
import { Button } from "../../../../base/browser/ui/button/button.js";
import { Orientation, Sizing, SplitView } from "../../../../base/browser/ui/splitview/splitview.js";
import { ToggleActionViewItem } from "../../../../base/browser/ui/toggle/toggle.js";
import { Action } from "../../../../base/common/actions.js";
import { createCancelablePromise, Delayer, raceTimeout } from "../../../../base/common/async.js";
import { CancellationToken, CancellationTokenSource } from "../../../../base/common/cancellation.js";
import { Color } from "../../../../base/common/color.js";
import { fromNow } from "../../../../base/common/date.js";
import { isCancellationError } from "../../../../base/common/errors.js";
import { Emitter, Event } from "../../../../base/common/event.js";
import { Iterable } from "../../../../base/common/iterator.js";
import { KeyCode } from "../../../../base/common/keyCodes.js";
import { Disposable, DisposableStore, dispose, MutableDisposable } from "../../../../base/common/lifecycle.js";
import * as platform from "../../../../base/common/platform.js";
import { StopWatch } from "../../../../base/common/stopwatch.js";
import { ThemeIcon } from "../../../../base/common/themables.js";
import { URI } from "../../../../base/common/uri.js";
import { ILanguageService } from "../../../../editor/common/languages/language.js";
import { ITextResourceConfigurationService } from "../../../../editor/common/services/textResourceConfiguration.js";
import { localize } from "../../../../nls.js";
import { ICommandService } from "../../../../platform/commands/common/commands.js";
import { ConfigurationTarget } from "../../../../platform/configuration/common/configuration.js";
import { ConfigurationScope, Extensions } from "../../../../platform/configuration/common/configurationRegistry.js";
import { IContextKeyService } from "../../../../platform/contextkey/common/contextkey.js";
import { IExtensionGalleryService, IExtensionManagementService } from "../../../../platform/extensionManagement/common/extensionManagement.js";
import { IInstantiationService } from "../../../../platform/instantiation/common/instantiation.js";
import { IKeybindingService } from "../../../../platform/keybinding/common/keybinding.js";
import { ILogService } from "../../../../platform/log/common/log.js";
import { IProductService } from "../../../../platform/product/common/productService.js";
import { IEditorProgressService } from "../../../../platform/progress/common/progress.js";
import { Registry } from "../../../../platform/registry/common/platform.js";
import { IStorageService, StorageScope, StorageTarget } from "../../../../platform/storage/common/storage.js";
import { ITelemetryService } from "../../../../platform/telemetry/common/telemetry.js";
import { defaultButtonStyles, defaultToggleStyles } from "../../../../platform/theme/browser/defaultStyles.js";
import { asCssVariable, editorForeground } from "../../../../platform/theme/common/colorRegistry.js";
import { IThemeService } from "../../../../platform/theme/common/themeService.js";
import { IUserDataSyncEnablementService, IUserDataSyncService, SyncStatus } from "../../../../platform/userDataSync/common/userDataSync.js";
import { IWorkspaceTrustManagementService } from "../../../../platform/workspace/common/workspaceTrust.js";
import { registerNavigableContainer } from "../../../browser/actions/widgetNavigationCommands.js";
import { EditorPane } from "../../../browser/parts/editor/editorPane.js";
import { IChatEntitlementService } from "../../../services/chat/common/chatEntitlementService.js";
import { APPLICATION_SCOPES, IWorkbenchConfigurationService } from "../../../services/configuration/common/configuration.js";
import { IEditorGroupsService } from "../../../services/editor/common/editorGroupsService.js";
import { IExtensionService } from "../../../services/extensions/common/extensions.js";
import { ALWAYS_SHOW_ADVANCED_SETTINGS_SETTING, IPreferencesService, SettingMatchType, SettingValueType, validateSettingsEditorOptions } from "../../../services/preferences/common/preferences.js";
import { nullRange, Settings2EditorModel } from "../../../services/preferences/common/preferencesModels.js";
import { IUserDataProfileService } from "../../../services/userDataProfile/common/userDataProfile.js";
import { IUserDataSyncWorkbenchService } from "../../../services/userDataSync/common/userDataSync.js";
import { SuggestEnabledInputWithHistory } from "../../codeEditor/browser/suggestEnabledInput/suggestEnabledInput.js";
import { ADVANCED_SETTING_TAG, AGENTS_WINDOW_SETTING_TAG, CONTEXT_AI_SETTING_RESULTS_AVAILABLE, CONTEXT_SETTINGS_EDITOR, CONTEXT_SETTINGS_FIRST_ROW_FOCUS, CONTEXT_SETTINGS_ROW_FOCUS, CONTEXT_SETTINGS_SEARCH_FOCUS, CONTEXT_TOC_ROW_FOCUS, EMBEDDINGS_SEARCH_PROVIDER_NAME, ENABLE_LANGUAGE_FILTER, EXTENSION_FETCH_TIMEOUT_MS, EXTENSION_SETTING_TAG, FEATURE_SETTING_TAG, FILTER_MODEL_SEARCH_PROVIDER_NAME, getExperimentalExtensionToggleData, ID_SETTING_TAG, IPreferencesSearchService, LANGUAGE_SETTING_TAG, LLM_RANKED_SEARCH_PROVIDER_NAME, MODIFIED_SETTING_TAG, POLICY_SETTING_TAG, REQUIRE_TRUSTED_WORKSPACE_SETTING_TAG, SETTINGS_EDITOR_COMMAND_CLEAR_SEARCH_RESULTS, SETTINGS_EDITOR_COMMAND_SHOW_AI_RESULTS, SETTINGS_EDITOR_COMMAND_SUGGEST_FILTERS, SETTINGS_EDITOR_COMMAND_TOGGLE_AI_SEARCH, STRING_MATCH_SEARCH_PROVIDER_NAME, TF_IDF_SEARCH_PROVIDER_NAME, WorkbenchSettingsEditorSettings, WORKSPACE_TRUST_SETTING_TAG } from "../common/preferences.js";
import { settingsHeaderBorder, settingsSashBorder, settingsTextInputBorder } from "../common/settingsEditorColorRegistry.js";
import { IWorkbenchEnvironmentService } from "../../../services/environment/common/environmentService.js";
import "./media/settingsEditor2.css";
import { preferencesAiResultsIcon, preferencesClearInputIcon, preferencesFilterIcon } from "./preferencesIcons.js";
import { SettingsTargetsWidget } from "./preferencesWidgets.js";
import { getCommonlyUsedData, tocData } from "./settingsLayout.js";
import { SettingsSearchFilterDropdownMenuActionViewItem } from "./settingsSearchMenu.js";
import { AbstractSettingRenderer, createTocTreeForExtensionSettings, resolveConfiguredUntrustedSettings, resolveSettingsTree, SettingsTree, SettingTreeRenderers } from "./settingsTree.js";
import { parseQuery, SearchResultIdx, SearchResultModel, SettingsTreeGroupElement, SettingsTreeModel, SettingsTreeSettingElement } from "./settingsTreeModels.js";
import { createTOCIterator, TOCTree, TOCTreeModel } from "./tocTree.js";
var SettingsFocusContext = /* @__PURE__ */ ((SettingsFocusContext2) => {
  SettingsFocusContext2[SettingsFocusContext2["Search"] = 0] = "Search";
  SettingsFocusContext2[SettingsFocusContext2["TableOfContents"] = 1] = "TableOfContents";
  SettingsFocusContext2[SettingsFocusContext2["SettingTree"] = 2] = "SettingTree";
  SettingsFocusContext2[SettingsFocusContext2["SettingControl"] = 3] = "SettingControl";
  return SettingsFocusContext2;
})(SettingsFocusContext || {});
function createGroupIterator(group) {
  return Iterable.map(group.children, (g) => {
    return {
      element: g,
      children: g instanceof SettingsTreeGroupElement ? createGroupIterator(g) : void 0
    };
  });
}
function isSettingsSearchUpToDate(searchPending, renderedSearchQuery, currentSearchValue) {
  return !searchPending && renderedSearchQuery === currentSearchValue.trim();
}
const $ = DOM.$;
const searchBoxLabel = localize("SearchSettings.AriaLabel", "Search settings");
const searchBoxPlaceholderWithHistory = localize({
  key: "SearchSettings.PlaceholderWithHistory",
  comment: ["Placeholder for the settings search input hinting that the up and down arrow keys navigate the search history. The character inserted for {0} is \u21C5 to represent the up and down arrow keys."]
}, "Search settings ({0} for history)", "\u21C5");
const SEARCH_TOC_BEHAVIOR_KEY = "workbench.settings.settingsSearchTocBehavior";
const SHOW_AI_RESULTS_ENABLED_LABEL = localize("showAiResultsEnabled", "Show AI-recommended results");
const SHOW_AI_RESULTS_DISABLED_LABEL = localize("showAiResultsDisabled", "No AI results available at this time...");
const SETTINGS_EDITOR_STATE_KEY = "settingsEditorState";
let SettingsEditor2 = class extends EditorPane {
  constructor(group, telemetryService, configurationService, textResourceConfigurationService, themeService, preferencesService, instantiationService, preferencesSearchService, logService, contextKeyService, storageService, editorGroupService, userDataSyncWorkbenchService, userDataSyncEnablementService, workspaceTrustManagementService, extensionService, languageService, extensionManagementService, productService, extensionGalleryService, editorProgressService, userDataProfileService, keybindingService, chatEntitlementService, environmentService) {
    super(SettingsEditor2.ID, group, telemetryService, themeService, storageService);
    this.configurationService = configurationService;
    this.preferencesService = preferencesService;
    this.instantiationService = instantiationService;
    this.preferencesSearchService = preferencesSearchService;
    this.logService = logService;
    this.storageService = storageService;
    this.editorGroupService = editorGroupService;
    this.userDataSyncWorkbenchService = userDataSyncWorkbenchService;
    this.userDataSyncEnablementService = userDataSyncEnablementService;
    this.workspaceTrustManagementService = workspaceTrustManagementService;
    this.extensionService = extensionService;
    this.languageService = languageService;
    this.extensionManagementService = extensionManagementService;
    this.productService = productService;
    this.extensionGalleryService = extensionGalleryService;
    this.editorProgressService = editorProgressService;
    this.keybindingService = keybindingService;
    this.chatEntitlementService = chatEntitlementService;
    this.environmentService = environmentService;
    this.searchContainer = null;
    this.settingsTreeModel = this._register(new MutableDisposable());
    this.searchInProgress = null;
    this.aiSearchPromise = null;
    /**
     * The trimmed query value that the currently rendered results reflect. Used to determine
     * whether the displayed results are up to date with the current search input value before
     * moving focus into the results.
     */
    this.renderedSearchQuery = "";
    this.showAiResultsAction = null;
    this.pendingSettingUpdate = null;
    this._searchResultModel = this._register(new MutableDisposable());
    this.searchResultLabel = null;
    this.lastSyncedLabel = null;
    this.settingsOrderByTocIndex = null;
    this._currentFocusContext = 0 /* Search */;
    /** Don't spam warnings */
    this.hasWarnedMissingSettings = false;
    this.tocTreeDisposed = false;
    this.tocFocusedElement = null;
    this.treeFocusedElement = null;
    this.settingsTreeScrollTop = 0;
    this.installedExtensionIds = [];
    this.dismissedExtensionSettings = [];
    this.DISMISSED_EXTENSION_SETTINGS_STORAGE_KEY = "settingsEditor2.dismissedExtensionSettings";
    this.DISMISSED_EXTENSION_SETTINGS_DELIMITER = "	";
    this.SEARCH_HISTORY_STORAGE_KEY = "settingsEditor2.searchHistory";
    this.searchInputActionBar = null;
    this.searchDelayer = this._register(new Delayer(200));
    this.viewState = { settingsTarget: ConfigurationTarget.USER_LOCAL };
    this.settingFastUpdateDelayer = this._register(new Delayer(SettingsEditor2.SETTING_UPDATE_FAST_DEBOUNCE));
    this.settingSlowUpdateDelayer = this._register(new Delayer(SettingsEditor2.SETTING_UPDATE_SLOW_DEBOUNCE));
    this.searchInputDelayer = this._register(new Delayer(SettingsEditor2.SEARCH_DEBOUNCE));
    this.updatedConfigSchemaDelayer = this._register(new Delayer(SettingsEditor2.CONFIG_SCHEMA_UPDATE_DELAYER));
    this.inSettingsEditorContextKey = CONTEXT_SETTINGS_EDITOR.bindTo(contextKeyService);
    this.searchFocusContextKey = CONTEXT_SETTINGS_SEARCH_FOCUS.bindTo(contextKeyService);
    this.tocRowFocused = CONTEXT_TOC_ROW_FOCUS.bindTo(contextKeyService);
    this.settingRowFocused = CONTEXT_SETTINGS_ROW_FOCUS.bindTo(contextKeyService);
    this.settingFirstRowFocused = CONTEXT_SETTINGS_FIRST_ROW_FOCUS.bindTo(contextKeyService);
    this.aiResultsAvailable = CONTEXT_AI_SETTING_RESULTS_AVAILABLE.bindTo(contextKeyService);
    this.scheduledRefreshes = /* @__PURE__ */ new Map();
    this.editorMemento = this.getEditorMemento(editorGroupService, textResourceConfigurationService, SETTINGS_EDITOR_STATE_KEY);
    this.dismissedExtensionSettings = this.storageService.get(this.DISMISSED_EXTENSION_SETTINGS_STORAGE_KEY, StorageScope.PROFILE, "").split(this.DISMISSED_EXTENSION_SETTINGS_DELIMITER);
    this._register(configurationService.onDidChangeConfiguration((e) => {
      if (e.affectedKeys.has(WorkbenchSettingsEditorSettings.ShowAISearchToggle) || e.affectedKeys.has(WorkbenchSettingsEditorSettings.EnableNaturalLanguageSearch)) {
        this.updateAiSearchToggleVisibility();
      }
      if (e.affectsConfiguration(ALWAYS_SHOW_ADVANCED_SETTINGS_SETTING)) {
        this.onConfigUpdate(void 0, true, true);
      }
      if (e.source !== ConfigurationTarget.DEFAULT) {
        this.onConfigUpdate(e.affectedKeys);
      }
    }));
    this._register(chatEntitlementService.onDidChangeSentiment(() => {
      this.updateAiSearchToggleVisibility();
    }));
    this._register(userDataProfileService.onDidChangeCurrentProfile((e) => {
      e.join(this.whenCurrentProfileChanged());
    }));
    this._register(workspaceTrustManagementService.onDidChangeTrust(() => {
      this.searchResultModel?.updateWorkspaceTrust(workspaceTrustManagementService.isWorkspaceTrusted());
      if (this.settingsTreeModel.value) {
        this.settingsTreeModel.value.updateWorkspaceTrust(workspaceTrustManagementService.isWorkspaceTrusted());
        this.renderTree();
      }
    }));
    this._register(configurationService.onDidChangeRestrictedSettings((e) => {
      if (e.default.length && this.currentSettingsModel) {
        this.updateElementsByKey(new Set(e.default));
      }
    }));
    this._register(extensionManagementService.onDidInstallExtensions(() => {
      this.refreshInstalledExtensionsList();
    }));
    this._register(extensionManagementService.onDidUninstallExtension(() => {
      this.refreshInstalledExtensionsList();
    }));
    this.modelDisposables = this._register(new DisposableStore());
    if (ENABLE_LANGUAGE_FILTER && !SettingsEditor2.SUGGESTIONS.includes(`@${LANGUAGE_SETTING_TAG}`)) {
      SettingsEditor2.SUGGESTIONS.push(`@${LANGUAGE_SETTING_TAG}`);
    }
    if (this.environmentService.isSessionsWindow && !SettingsEditor2.SUGGESTIONS.includes(`@${AGENTS_WINDOW_SETTING_TAG}`)) {
      SettingsEditor2.SUGGESTIONS.push(`@${AGENTS_WINDOW_SETTING_TAG}`);
    }
    this.inputChangeListener = this._register(new MutableDisposable());
  }
  static shouldSettingUpdateFast(type) {
    if (Array.isArray(type)) {
      return false;
    }
    return type === SettingValueType.Enum || type === SettingValueType.Array || type === SettingValueType.BooleanObject || type === SettingValueType.Object || type === SettingValueType.Complex || type === SettingValueType.Boolean || type === SettingValueType.Exclude || type === SettingValueType.Include;
  }
  async whenCurrentProfileChanged() {
    this.updatedConfigSchemaDelayer.trigger(() => {
      this.dismissedExtensionSettings = this.storageService.get(this.DISMISSED_EXTENSION_SETTINGS_STORAGE_KEY, StorageScope.PROFILE, "").split(this.DISMISSED_EXTENSION_SETTINGS_DELIMITER);
      this.onConfigUpdate(void 0, true);
    });
  }
  canShowAdvancedSettings() {
    if (this.configurationService.getValue(ALWAYS_SHOW_ADVANCED_SETTINGS_SETTING) ?? false) {
      return true;
    }
    return this.viewState.tagFilters?.has(ADVANCED_SETTING_TAG) ?? false;
  }
  /**
   * Determines whether a setting should be shown even when advanced settings are filtered out.
   * Returns true if:
   * - The setting is not tagged as advanced, OR
   * - The setting matches an ID filter (@id:settingKey), OR
   * - The setting key appears in the search query, OR
   * - The @hasPolicy filter is active (policy settings should always be shown when filtering by policy)
   */
  shouldShowSetting(setting) {
    if (!setting.tags?.includes(ADVANCED_SETTING_TAG)) {
      return true;
    }
    if (this.viewState.idFilters?.has(setting.key)) {
      return true;
    }
    if (this.viewState.query?.toLowerCase().includes(setting.key.toLowerCase())) {
      return true;
    }
    if (this.viewState.tagFilters?.has(POLICY_SETTING_TAG)) {
      return true;
    }
    return false;
  }
  disableAiSearchToggle() {
    if (this.showAiResultsAction) {
      this.showAiResultsAction.checked = false;
      this.showAiResultsAction.enabled = false;
      this.aiResultsAvailable.set(false);
      this.showAiResultsAction.label = SHOW_AI_RESULTS_DISABLED_LABEL;
    }
  }
  updateAiSearchToggleVisibility() {
    if (!this.searchContainer || !this.showAiResultsAction || !this.searchInputActionBar) {
      return;
    }
    const showAiToggle = this.configurationService.getValue(WorkbenchSettingsEditorSettings.ShowAISearchToggle);
    const enableNaturalLanguageSearch = this.configurationService.getValue(WorkbenchSettingsEditorSettings.EnableNaturalLanguageSearch);
    const chatHidden = this.chatEntitlementService.sentiment.hidden || this.chatEntitlementService.sentiment.disabled;
    const canShowToggle = showAiToggle && enableNaturalLanguageSearch && !chatHidden;
    const alreadyVisible = this.searchInputActionBar.hasAction(this.showAiResultsAction);
    if (!alreadyVisible && canShowToggle) {
      this.searchInputActionBar.push(this.showAiResultsAction, {
        index: 0,
        label: false,
        icon: true
      });
      this.searchContainer.classList.add("with-ai-toggle");
    } else if (alreadyVisible) {
      this.searchInputActionBar.pull(0);
      this.searchContainer.classList.remove("with-ai-toggle");
      this.showAiResultsAction.checked = false;
    }
  }
  get minimumWidth() {
    return SettingsEditor2.EDITOR_MIN_WIDTH;
  }
  get maximumWidth() {
    return Number.POSITIVE_INFINITY;
  }
  get minimumHeight() {
    return 180;
  }
  // these setters need to exist because this extends from EditorPane
  set minimumWidth(value) {
  }
  set maximumWidth(value) {
  }
  get currentSettingsModel() {
    return this.searchResultModel || this.settingsTreeModel.value;
  }
  get searchResultModel() {
    return this._searchResultModel.value ?? null;
  }
  set searchResultModel(value) {
    this._searchResultModel.value = value ?? void 0;
    this.rootElement.classList.toggle("search-mode", !!this._searchResultModel.value);
  }
  get focusedSettingDOMElement() {
    const focused = this.settingsTree.getFocus()[0];
    if (!(focused instanceof SettingsTreeSettingElement)) {
      return;
    }
    return this.settingRenderers.getDOMElementsForSettingKey(this.settingsTree.getHTMLElement(), focused.setting.key)[0];
  }
  get currentFocusContext() {
    return this._currentFocusContext;
  }
  createEditor(parent) {
    parent.setAttribute("tabindex", "-1");
    this.rootElement = DOM.append(parent, $(".settings-editor", { tabindex: "-1" }));
    this.createHeader(this.rootElement);
    this.createBody(this.rootElement);
    this.addCtrlAInterceptor(this.rootElement);
    this.updateStyles();
    this._register(registerNavigableContainer({
      name: "settingsEditor2",
      focusNotifiers: [this],
      focusNextWidget: () => {
        if (this.searchWidget.inputWidget.hasWidgetFocus()) {
          this.focusTOC();
        }
      },
      focusPreviousWidget: () => {
        if (!this.searchWidget.inputWidget.hasWidgetFocus()) {
          this.focusSearch();
        }
      }
    }));
  }
  async setInput(input, options, context, token) {
    this.inSettingsEditorContextKey.set(true);
    await super.setInput(input, options, context, token);
    if (!this.input) {
      return;
    }
    const model = await this.input.resolve();
    if (token.isCancellationRequested || !(model instanceof Settings2EditorModel)) {
      return;
    }
    this.modelDisposables.clear();
    this.modelDisposables.add(model.onDidChangeGroups(() => {
      this.updatedConfigSchemaDelayer.trigger(() => {
        this.onConfigUpdate(void 0, false, true);
      });
    }));
    this.defaultSettingsEditorModel = model;
    options = options || validateSettingsEditorOptions({});
    if (!this.viewState.settingsTarget || !this.settingsTargetsWidget.settingsTarget) {
      const optionsHasViewStateTarget = options.viewState && options.viewState.settingsTarget;
      if (!options.target && !optionsHasViewStateTarget) {
        options.target = ConfigurationTarget.USER_LOCAL;
      }
    }
    this._setOptions(options);
    this.onConfigUpdate(void 0, true).then(() => {
      this.inputChangeListener.value = input.onWillDispose(() => {
        this.searchWidget.setValue("");
      });
      this.updateTreeScrollSync();
    });
    await this.refreshInstalledExtensionsList();
  }
  async refreshInstalledExtensionsList() {
    const installedExtensions = await this.extensionManagementService.getInstalled();
    this.installedExtensionIds = installedExtensions.filter((ext) => ext.manifest.contributes?.configuration).map((ext) => ext.identifier.id);
  }
  restoreCachedState() {
    const cachedState = this.input && this.editorMemento.loadEditorState(this.group, this.input);
    if (cachedState && typeof cachedState.target === "object") {
      cachedState.target = URI.revive(cachedState.target);
    }
    if (cachedState) {
      const settingsTarget = cachedState.target;
      this.settingsTargetsWidget.settingsTarget = settingsTarget;
      this.viewState.settingsTarget = settingsTarget;
      if (!this.searchWidget.getValue()) {
        this.searchWidget.setValue(cachedState.searchQuery);
      }
    }
    if (this.input) {
      this.editorMemento.clearEditorState(this.input, this.group);
    }
    return cachedState ?? null;
  }
  getViewState() {
    return this.viewState;
  }
  setOptions(options) {
    super.setOptions(options);
    if (options) {
      this._setOptions(options);
    }
  }
  _setOptions(options) {
    if (options.focusSearch && !platform.isIOS) {
      this.focusSearch();
    }
    const recoveredViewState = options.viewState ? options.viewState : void 0;
    const query = recoveredViewState?.query ?? options.query;
    if (query !== void 0) {
      this.searchWidget.setValue(query);
      this.viewState.query = query;
    }
    const target = options.folderUri ?? recoveredViewState?.settingsTarget ?? options.target;
    if (target) {
      this.settingsTargetsWidget.updateTarget(target);
    }
  }
  clearInput() {
    this.inSettingsEditorContextKey.set(false);
    super.clearInput();
  }
  layout(dimension) {
    this.dimension = dimension;
    if (!this.isVisible()) {
      return;
    }
    this.layoutSplitView(dimension);
    const innerWidth = Math.min(this.headerContainer.clientWidth, dimension.width) - 24 * 2;
    const monacoWidth = innerWidth - 10 - this.controlsElement.clientWidth - 12;
    this.searchWidget.layout(new DOM.Dimension(monacoWidth, 20));
    this.rootElement.classList.toggle("narrow-width", dimension.width < SettingsEditor2.NARROW_TOTAL_WIDTH);
  }
  focus() {
    super.focus();
    if (this._currentFocusContext === 0 /* Search */) {
      if (!platform.isIOS) {
        this.focusSearch();
      }
    } else if (this._currentFocusContext === 3 /* SettingControl */) {
      const element = this.focusedSettingDOMElement;
      if (element) {
        const control = element.querySelector(AbstractSettingRenderer.CONTROL_SELECTOR);
        if (control) {
          control.focus();
          return;
        }
      }
    } else if (this._currentFocusContext === 2 /* SettingTree */) {
      this.settingsTree.domFocus();
    } else if (this._currentFocusContext === 1 /* TableOfContents */) {
      this.tocTree.domFocus();
    }
  }
  setEditorVisible(visible) {
    super.setEditorVisible(visible);
    if (!visible) {
      setTimeout(() => {
        this.searchWidget.onHide();
        this.settingRenderers.cancelSuggesters();
      }, 0);
    }
  }
  focusSettings(focusSettingInput = false) {
    const focused = this.settingsTree.getFocus();
    if (!focused.length) {
      this.settingsTree.focusFirst();
    }
    this.settingsTree.domFocus();
    if (focusSettingInput) {
      const controlInFocusedRow = this.settingsTree.getHTMLElement().querySelector(`.focused ${AbstractSettingRenderer.CONTROL_SELECTOR}`);
      if (controlInFocusedRow) {
        controlInFocusedRow.focus();
      }
    }
  }
  focusTOC() {
    this.tocTree.domFocus();
  }
  /**
   * Invoked when the user presses the down arrow while the search input is focused.
   * Navigates forward through the search history first; only once there are no more
   * recent history entries does focus move down into the settings results.
   */
  navigateSearchHistoryNextOrFocusSettings() {
    if (this.searchWidget.isNavigatingHistory()) {
      this.searchWidget.showNextValue();
    } else {
      this.focusFirstSettingFromSearch();
    }
  }
  /**
   * Invoked when the user presses the up arrow while the search input is focused.
   * Navigates backward through the search history.
   */
  navigateSearchHistoryPrevious() {
    this.searchWidget.showPreviousValue();
  }
  /**
   * Whether the currently rendered results reflect the current search input value.
   * Returns false while a search is still pending (debounced) or in progress, so that
   * focus is not moved into stale results.
   */
  isSearchUpToDate() {
    return isSettingsSearchUpToDate(this.searchInputDelayer.isTriggered(), this.renderedSearchQuery, this.searchWidget.getValue());
  }
  /**
   * Moves focus from the search input into the first settings result, but only when the
   * displayed results are up to date with the current search input. If the results are
   * stale (a search is still pending or in progress), this does nothing so that focus does
   * not land on results from a previous query.
   */
  focusFirstSettingFromSearch() {
    if (!this.isSearchUpToDate()) {
      return;
    }
    this.focusSettings();
  }
  updateSettingFirstRowFocusedContext(element) {
    this.settingFirstRowFocused.set(!!element && element === this.settingsTree.navigate().first());
  }
  showContextMenu() {
    const focused = this.settingsTree.getFocus()[0];
    const rowElement = this.focusedSettingDOMElement;
    if (rowElement && focused instanceof SettingsTreeSettingElement) {
      this.settingRenderers.showContextMenu(focused, rowElement);
    }
  }
  focusSearch(filter, selectAll = true) {
    if (filter && this.searchWidget) {
      this.searchWidget.setValue(filter);
    }
    this.searchWidget.focus(selectAll && !this.searchInputDelayer.isTriggered());
  }
  clearSearchResults() {
    this.disableAiSearchToggle();
    this.searchWidget.setValue("");
    this.focusSearch();
  }
  clearSearchFilters() {
    const query = this.searchWidget.getValue();
    const splitQuery = query.split(" ").filter((word) => {
      return word.length && !SettingsEditor2.SUGGESTIONS.some((suggestion) => word.startsWith(suggestion));
    });
    this.searchWidget.setValue(splitQuery.join(" "));
  }
  /**
   * Updates the search input placeholder so that it hints at history navigation
   * (up/down arrows) once the user has search history, similar to the keyboard
   * shortcuts editor.
   */
  updateSearchPlaceholder() {
    const hasHistory = this.searchWidget.getHistory().length > 0;
    this.searchWidget.setPlaceHolder(hasHistory ? searchBoxPlaceholderWithHistory : searchBoxLabel);
  }
  updateInputAriaLabel() {
    let label = searchBoxLabel;
    if (this.searchResultLabel) {
      label += `. ${this.searchResultLabel}`;
    }
    if (this.lastSyncedLabel) {
      label += `. ${this.lastSyncedLabel}`;
    }
    this.searchWidget.updateAriaLabel(label);
  }
  /**
   * Render the header of the Settings editor, which includes the content above the splitview.
   */
  createHeader(parent) {
    this.headerContainer = DOM.append(parent, $(".settings-header"));
    this.searchContainer = DOM.append(this.headerContainer, $(".search-container"));
    const clearInputAction = this._register(new Action(
      SETTINGS_EDITOR_COMMAND_CLEAR_SEARCH_RESULTS,
      localize("clearInput", "Clear Settings Search Input"),
      ThemeIcon.asClassName(preferencesClearInputIcon),
      false,
      async () => this.clearSearchResults()
    ));
    const showAiResultActionClassNames = ["action-label", ThemeIcon.asClassName(preferencesAiResultsIcon)];
    this.showAiResultsAction = this._register(new Action(
      SETTINGS_EDITOR_COMMAND_SHOW_AI_RESULTS,
      SHOW_AI_RESULTS_DISABLED_LABEL,
      showAiResultActionClassNames.join(" "),
      true
    ));
    this._register(this.showAiResultsAction.onDidChange(async () => {
      await this.onDidToggleAiSearch();
    }));
    const filterAction = this._register(new Action(
      SETTINGS_EDITOR_COMMAND_SUGGEST_FILTERS,
      localize("filterInput", "Filter Settings"),
      ThemeIcon.asClassName(preferencesFilterIcon)
    ));
    this.searchWidget = this._register(this.instantiationService.createInstance(SuggestEnabledInputWithHistory, {
      id: `${SettingsEditor2.ID}.searchbox`,
      parent: this.searchContainer,
      ariaLabel: searchBoxLabel,
      resourceHandle: "settingseditor:searchinput" + SettingsEditor2.NUM_INSTANCES++,
      suggestionProvider: {
        triggerCharacters: ["@", ":"],
        provideResults: (query) => {
          const queryParts = query.split(/\s/g);
          if (queryParts[queryParts.length - 1].startsWith(`@${LANGUAGE_SETTING_TAG}`)) {
            const sortedLanguages = this.languageService.getRegisteredLanguageIds().map((languageId) => {
              return `@${LANGUAGE_SETTING_TAG}${languageId} `;
            }).sort();
            return sortedLanguages.filter((langFilter) => !query.includes(langFilter));
          } else if (queryParts[queryParts.length - 1].startsWith(`@${EXTENSION_SETTING_TAG}`)) {
            const installedExtensionsTags = this.installedExtensionIds.map((extensionId) => {
              return `@${EXTENSION_SETTING_TAG}${extensionId} `;
            }).sort();
            return installedExtensionsTags.filter((extFilter) => !query.includes(extFilter));
          } else if (query === "" || queryParts[queryParts.length - 1].startsWith("@")) {
            return SettingsEditor2.SUGGESTIONS.filter((tag) => !query.includes(tag)).map((tag) => tag.endsWith(":") ? tag : tag + " ");
          }
          return [];
        }
      },
      suggestOptions: {
        placeholderText: searchBoxLabel,
        focusContextKey: this.searchFocusContextKey,
        styleOverrides: {
          inputBorder: settingsTextInputBorder
        }
        // TODO: Aria-live
      },
      history: this.loadSearchHistory()
    }));
    this._register(this.searchWidget.onDidFocus(() => {
      this._currentFocusContext = 0 /* Search */;
    }));
    this.updateSearchPlaceholder();
    this._register(this.searchWidget.onInputDidChange(() => {
      const searchVal = this.searchWidget.getValue();
      clearInputAction.enabled = !!searchVal;
      this.searchInputDelayer.trigger(() => this.onSearchInputChanged(true));
    }));
    const headerControlsContainer = DOM.append(this.headerContainer, $(".settings-header-controls"));
    headerControlsContainer.style.borderColor = asCssVariable(settingsHeaderBorder);
    const targetWidgetContainer = DOM.append(headerControlsContainer, $(".settings-target-container"));
    this.settingsTargetsWidget = this._register(this.instantiationService.createInstance(SettingsTargetsWidget, targetWidgetContainer, { enableRemoteSettings: true }));
    this.settingsTargetsWidget.settingsTarget = ConfigurationTarget.USER_LOCAL;
    this._register(this.settingsTargetsWidget.onDidTargetChange((target) => this.onDidSettingsTargetChange(target)));
    this._register(DOM.addDisposableListener(targetWidgetContainer, DOM.EventType.KEY_DOWN, (e) => {
      const event = new StandardKeyboardEvent(e);
      if (event.keyCode === KeyCode.DownArrow) {
        this.focusSettings();
      }
    }));
    if (this.userDataSyncWorkbenchService.enabled && this.userDataSyncEnablementService.canToggleEnablement()) {
      const syncControls = this._register(this.instantiationService.createInstance(SyncControls, this.window, headerControlsContainer));
      this._register(syncControls.onDidChangeLastSyncedLabel((lastSyncedLabel) => {
        this.lastSyncedLabel = lastSyncedLabel;
        this.updateInputAriaLabel();
      }));
    }
    this.controlsElement = DOM.append(this.searchContainer, DOM.$(".search-container-widgets"));
    this.countElement = DOM.append(this.controlsElement, DOM.$(".settings-count-widget.monaco-count-badge.long"));
    this.searchInputActionBar = this._register(new ActionBar(this.controlsElement, {
      actionViewItemProvider: (action, options) => {
        if (action.id === filterAction.id) {
          return this.instantiationService.createInstance(SettingsSearchFilterDropdownMenuActionViewItem, action, options, this.actionRunner, this.searchWidget);
        }
        if (this.showAiResultsAction && action.id === this.showAiResultsAction.id) {
          const keybindingLabel = this.keybindingService.lookupKeybinding(SETTINGS_EDITOR_COMMAND_TOGGLE_AI_SEARCH)?.getLabel();
          return new ToggleActionViewItem(null, action, { ...options, keybinding: keybindingLabel, toggleStyles: defaultToggleStyles });
        }
        return void 0;
      }
    }));
    const actionsToPush = [clearInputAction, filterAction];
    this.searchInputActionBar.push(actionsToPush, { label: false, icon: true });
    this.disableAiSearchToggle();
    this.updateAiSearchToggleVisibility();
  }
  toggleAiSearch() {
    if (this.searchInputActionBar && this.showAiResultsAction && this.searchInputActionBar.hasAction(this.showAiResultsAction)) {
      if (!this.showAiResultsAction.enabled) {
        aria.status(localize("noAiResults", "No AI results available at this time."));
      }
      this.showAiResultsAction.checked = !this.showAiResultsAction.checked;
    }
  }
  async onDidToggleAiSearch() {
    if (this.searchResultModel && this.showAiResultsAction) {
      this.searchResultModel.showAiResults = this.showAiResultsAction.checked ?? false;
      this.renderResultCountMessages(false);
      this.onDidFinishSearch(true, void 0);
    }
  }
  onDidSettingsTargetChange(target) {
    this.viewState.settingsTarget = target;
    this.onConfigUpdate(void 0, true);
  }
  onDidDismissExtensionSetting(extensionId) {
    if (!this.dismissedExtensionSettings.includes(extensionId)) {
      this.dismissedExtensionSettings.push(extensionId);
    }
    this.storageService.store(
      this.DISMISSED_EXTENSION_SETTINGS_STORAGE_KEY,
      this.dismissedExtensionSettings.join(this.DISMISSED_EXTENSION_SETTINGS_DELIMITER),
      StorageScope.PROFILE,
      StorageTarget.USER
    );
    this.onConfigUpdate(void 0, true);
  }
  onDidClickSetting(evt, recursed) {
    const targetElement = this.currentSettingsModel?.getElementsByName(evt.targetKey)?.[0];
    let revealFailed = false;
    if (targetElement) {
      let sourceTop = 0.5;
      try {
        const _sourceTop = this.settingsTree.getRelativeTop(evt.source);
        if (_sourceTop !== null) {
          sourceTop = _sourceTop;
        }
      } catch {
      }
      if (this.viewState.categoryFilter && evt.source.displayCategory !== targetElement.displayCategory) {
        this.tocTree.setFocus([]);
      }
      try {
        this.settingsTree.reveal(targetElement, sourceTop);
      } catch (_) {
        revealFailed = true;
      }
      if (!revealFailed) {
        setTimeout(() => {
          this.settingsTree.setFocus([targetElement]);
        }, 50);
        const domElements = this.settingRenderers.getDOMElementsForSettingKey(this.settingsTree.getHTMLElement(), evt.targetKey);
        if (domElements && domElements[0]) {
          const control = domElements[0].querySelector(AbstractSettingRenderer.CONTROL_SELECTOR);
          if (control) {
            control.focus();
          }
        }
      }
    }
    if (!recursed && (!targetElement || revealFailed)) {
      const idQuery = `@id:${evt.targetKey}`;
      this.searchWidget.setValue(idQuery);
      this.searchInputDelayer.cancel();
      const p = this.triggerSearch(idQuery, true);
      p.then(() => {
        this.onDidClickSetting(evt, true);
      });
    }
  }
  switchToSettingsFile() {
    const query = parseQuery(this.searchWidget.getValue()).query;
    return this.openSettingsFile({ query });
  }
  async openSettingsFile(options) {
    const currentSettingsTarget = this.settingsTargetsWidget.settingsTarget;
    const openOptions = { jsonEditor: true, groupId: this.group.id, ...options };
    if (currentSettingsTarget === ConfigurationTarget.USER_LOCAL) {
      if (options?.revealSetting) {
        const configurationProperties = Registry.as(Extensions.Configuration).getConfigurationProperties();
        const configurationScope = configurationProperties[options?.revealSetting.key]?.scope;
        if (configurationScope && APPLICATION_SCOPES.includes(configurationScope)) {
          return this.preferencesService.openApplicationSettings(openOptions);
        }
      }
      return this.preferencesService.openUserSettings(openOptions);
    } else if (currentSettingsTarget === ConfigurationTarget.USER_REMOTE) {
      return this.preferencesService.openRemoteSettings(openOptions);
    } else if (currentSettingsTarget === ConfigurationTarget.WORKSPACE) {
      return this.preferencesService.openWorkspaceSettings(openOptions);
    } else if (URI.isUri(currentSettingsTarget)) {
      return this.preferencesService.openFolderSettings({ folderUri: currentSettingsTarget, ...openOptions });
    }
    return void 0;
  }
  createBody(parent) {
    this.bodyContainer = DOM.append(parent, $(".settings-body"));
    this.noResultsMessage = DOM.append(this.bodyContainer, $(".no-results-message"));
    this.noResultsMessage.innerText = localize("noResults", "No Settings Found");
    this.clearFilterLinkContainer = $("span.clear-search-filters");
    this.clearFilterLinkContainer.textContent = " - ";
    const clearFilterLink = DOM.append(this.clearFilterLinkContainer, $("a.pointer.prominent", { tabindex: 0 }, localize("clearSearchFilters", "Clear Filters")));
    this._register(DOM.addDisposableListener(clearFilterLink, DOM.EventType.CLICK, (e) => {
      DOM.EventHelper.stop(e, false);
      this.clearSearchFilters();
    }));
    DOM.append(this.noResultsMessage, this.clearFilterLinkContainer);
    this.noResultsMessage.style.color = asCssVariable(editorForeground);
    this.tocTreeContainer = $(".settings-toc-container");
    this.settingsTreeContainer = $(".settings-tree-container");
    this.createTOC(this.tocTreeContainer);
    this.createSettingsTree(this.settingsTreeContainer);
    this.splitView = this._register(new SplitView(this.bodyContainer, {
      orientation: Orientation.HORIZONTAL,
      proportionalLayout: true
    }));
    const startingWidth = this.storageService.getNumber("settingsEditor2.splitViewWidth", StorageScope.PROFILE, SettingsEditor2.TOC_RESET_WIDTH);
    this.splitView.addView({
      onDidChange: Event.None,
      element: this.tocTreeContainer,
      minimumSize: SettingsEditor2.TOC_MIN_WIDTH,
      maximumSize: Number.POSITIVE_INFINITY,
      layout: (width, _, height) => {
        this.tocTreeContainer.style.width = `${width}px`;
        this.tocTree.layout(height, width);
      }
    }, startingWidth, void 0, true);
    this.splitView.addView({
      onDidChange: Event.None,
      element: this.settingsTreeContainer,
      minimumSize: SettingsEditor2.EDITOR_MIN_WIDTH,
      maximumSize: Number.POSITIVE_INFINITY,
      layout: (width, _, height) => {
        this.settingsTreeContainer.style.width = `${width}px`;
        this.settingsTree.layout(height, width);
      }
    }, Sizing.Distribute, void 0, true);
    this._register(this.splitView.onDidSashReset(() => {
      const totalSize = this.splitView.getViewSize(0) + this.splitView.getViewSize(1);
      this.splitView.resizeView(0, SettingsEditor2.TOC_RESET_WIDTH);
      this.splitView.resizeView(1, totalSize - SettingsEditor2.TOC_RESET_WIDTH);
    }));
    this._register(this.splitView.onDidSashChange(() => {
      const width = this.splitView.getViewSize(0);
      this.storageService.store("settingsEditor2.splitViewWidth", width, StorageScope.PROFILE, StorageTarget.USER);
    }));
    const borderColor = this.theme.getColor(settingsSashBorder);
    this.splitView.style({ separatorBorder: borderColor });
  }
  addCtrlAInterceptor(container) {
    this._register(DOM.addStandardDisposableListener(container, DOM.EventType.KEY_DOWN, (e) => {
      if (e.keyCode === KeyCode.KeyA && (platform.isMacintosh ? e.metaKey : e.ctrlKey) && !DOM.isEditableElement(e.target)) {
        e.browserEvent.stopPropagation();
        e.browserEvent.preventDefault();
      }
    }));
  }
  createTOC(container) {
    this.tocTreeModel = this.instantiationService.createInstance(TOCTreeModel, this.viewState);
    this.tocTree = this._register(this.instantiationService.createInstance(
      TOCTree,
      DOM.append(container, $(".settings-toc-wrapper", {
        "role": "navigation",
        "aria-label": localize("settings", "Settings")
      })),
      this.viewState
    ));
    this.tocTreeDisposed = false;
    this._register(this.tocTree.onDidFocus(() => {
      this._currentFocusContext = 1 /* TableOfContents */;
    }));
    this._register(this.tocTree.onDidChangeFocus((e) => {
      const element = e.elements?.[0] ?? null;
      if (this.tocFocusedElement === element) {
        return;
      }
      this.tocFocusedElement = element;
      this.tocTree.setSelection(element ? [element] : []);
      if (this.viewState.categoryFilter !== element) {
        this.viewState.categoryFilter = element ?? void 0;
        this.renderTree(void 0, true);
        this.settingsTree.scrollTop = 0;
      }
    }));
    this._register(this.tocTree.onDidFocus(() => {
      this.tocRowFocused.set(true);
    }));
    this._register(this.tocTree.onDidBlur(() => {
      this.tocRowFocused.set(false);
    }));
    this._register(this.tocTree.onDidDispose(() => {
      this.tocTreeDisposed = true;
    }));
  }
  applyFilter(filter) {
    if (this.searchWidget && !this.searchWidget.getValue().includes(filter)) {
      const newQuery = `${filter} ${this.searchWidget.getValue().trimStart()}`;
      this.focusSearch(newQuery, false);
    }
  }
  removeLanguageFilters() {
    if (this.searchWidget && this.searchWidget.getValue().includes(`@${LANGUAGE_SETTING_TAG}`)) {
      const query = this.searchWidget.getValue().split(" ");
      const newQuery = query.filter((word) => !word.startsWith(`@${LANGUAGE_SETTING_TAG}`)).join(" ");
      this.focusSearch(newQuery, false);
    }
  }
  createSettingsTree(container) {
    this.settingRenderers = this._register(this.instantiationService.createInstance(SettingTreeRenderers));
    this._register(this.settingRenderers.onDidChangeSetting((e) => this.onDidChangeSetting(e.key, e.value, e.type, e.manualReset, e.scope)));
    this._register(this.settingRenderers.onDidDismissExtensionSetting((e) => this.onDidDismissExtensionSetting(e)));
    this._register(this.settingRenderers.onDidOpenSettings((settingKey) => {
      this.openSettingsFile({ revealSetting: { key: settingKey, edit: true } });
    }));
    this._register(this.settingRenderers.onDidClickSettingLink((settingName) => this.onDidClickSetting(settingName)));
    this._register(this.settingRenderers.onDidFocusSetting((element) => {
      this.settingsTree.setFocus([element]);
      this._currentFocusContext = 3 /* SettingControl */;
      this.settingRowFocused.set(false);
    }));
    this._register(this.settingRenderers.onDidChangeSettingHeight((params) => {
      const { element, height } = params;
      try {
        this.settingsTree.updateElementHeight(element, height);
      } catch (e) {
      }
    }));
    this._register(this.settingRenderers.onApplyFilter((filter) => this.applyFilter(filter)));
    this._register(this.settingRenderers.onDidClickOverrideElement((element) => {
      this.removeLanguageFilters();
      if (element.language) {
        this.applyFilter(`@${LANGUAGE_SETTING_TAG}${element.language}`);
      }
      if (element.scope === "workspace") {
        this.settingsTargetsWidget.updateTarget(ConfigurationTarget.WORKSPACE);
      } else if (element.scope === "user") {
        this.settingsTargetsWidget.updateTarget(ConfigurationTarget.USER_LOCAL);
      } else if (element.scope === "remote") {
        this.settingsTargetsWidget.updateTarget(ConfigurationTarget.USER_REMOTE);
      }
      this.applyFilter(`@${ID_SETTING_TAG}${element.settingKey}`);
    }));
    this.settingsTree = this._register(this.instantiationService.createInstance(
      SettingsTree,
      container,
      this.viewState,
      this.settingRenderers.allRenderers
    ));
    this._register(this.settingsTree.onDidScroll(() => {
      if (this.settingsTree.scrollTop === this.settingsTreeScrollTop) {
        return;
      }
      this.settingsTreeScrollTop = this.settingsTree.scrollTop;
      setTimeout(() => {
        this.updateTreeScrollSync();
      }, 0);
    }));
    this._register(this.settingsTree.onDidFocus(() => {
      const classList = container.ownerDocument.activeElement?.classList;
      if (classList && classList.contains("monaco-list") && classList.contains("settings-editor-tree")) {
        this._currentFocusContext = 2 /* SettingTree */;
        this.settingRowFocused.set(true);
        this.treeFocusedElement ??= this.settingsTree.firstVisibleElement ?? null;
        if (this.treeFocusedElement) {
          this.treeFocusedElement.tabbable = true;
        }
        this.updateSettingFirstRowFocusedContext(this.treeFocusedElement);
      }
    }));
    this._register(this.settingsTree.onDidBlur(() => {
      this.settingRowFocused.set(false);
      this.settingFirstRowFocused.set(false);
      this.treeFocusedElement = null;
    }));
    this._register(this.settingsTree.onDidChangeFocus((e) => {
      const element = e.elements[0];
      this.updateSettingFirstRowFocusedContext(element ?? null);
      if (this.treeFocusedElement === element) {
        return;
      }
      if (this.treeFocusedElement) {
        this.treeFocusedElement.tabbable = false;
      }
      this.treeFocusedElement = element;
      if (this.treeFocusedElement) {
        this.treeFocusedElement.tabbable = true;
      }
      this.settingsTree.setSelection(element ? [element] : []);
    }));
  }
  onDidChangeSetting(key, value, type, manualReset, scope) {
    const parsedQuery = parseQuery(this.searchWidget.getValue());
    const languageFilter = parsedQuery.languageFilter;
    if (manualReset || this.pendingSettingUpdate && this.pendingSettingUpdate.key !== key) {
      this.updateChangedSetting(key, value, manualReset, languageFilter, scope);
    }
    this.pendingSettingUpdate = { key, value, languageFilter };
    if (SettingsEditor2.shouldSettingUpdateFast(type)) {
      this.settingFastUpdateDelayer.trigger(() => this.updateChangedSetting(key, value, manualReset, languageFilter, scope));
    } else {
      this.settingSlowUpdateDelayer.trigger(() => this.updateChangedSetting(key, value, manualReset, languageFilter, scope));
    }
  }
  updateTreeScrollSync() {
    this.settingRenderers.cancelSuggesters();
  }
  updateChangedSetting(key, value, manualReset, languageFilter, scope) {
    const settingsTarget = this.settingsTargetsWidget.settingsTarget;
    const resource = URI.isUri(settingsTarget) ? settingsTarget : void 0;
    const configurationTarget = (resource ? ConfigurationTarget.WORKSPACE_FOLDER : settingsTarget) ?? ConfigurationTarget.USER_LOCAL;
    const overrides = { resource, overrideIdentifiers: languageFilter ? [languageFilter] : void 0 };
    const configurationTargetIsWorkspace = configurationTarget === ConfigurationTarget.WORKSPACE || configurationTarget === ConfigurationTarget.WORKSPACE_FOLDER;
    const userPassedInManualReset = configurationTargetIsWorkspace || !!languageFilter;
    const isManualReset = userPassedInManualReset ? manualReset : value === void 0;
    const inspected = this.configurationService.inspect(key, overrides);
    if (!userPassedInManualReset && inspected.defaultValue === value) {
      value = void 0;
    }
    return this.configurationService.updateValue(key, value, overrides, configurationTarget, { handleDirtyFile: "save" }).then(() => {
      const query = this.searchWidget.getValue();
      if (query.includes(`@${MODIFIED_SETTING_TAG}`)) {
        this.refreshTOCTree();
      }
      this.renderTree(key, isManualReset);
      this.pendingSettingUpdate = null;
      const reportModifiedProps = {
        key,
        query,
        searchResults: this.searchResultModel?.getUniqueSearchResults() ?? null,
        rawResults: this.searchResultModel?.getRawResults() ?? null,
        showConfiguredOnly: !!this.viewState.tagFilters && this.viewState.tagFilters.has(MODIFIED_SETTING_TAG),
        isReset: typeof value === "undefined",
        settingsTarget: this.settingsTargetsWidget.settingsTarget
      };
      return this.reportModifiedSetting(reportModifiedProps);
    });
  }
  reportModifiedSetting(props) {
    let groupId = void 0;
    let providerName = void 0;
    let nlpIndex = void 0;
    let displayIndex = void 0;
    if (props.searchResults) {
      displayIndex = props.searchResults.filterMatches.findIndex((m) => m.setting.key === props.key);
      if (this.searchResultModel) {
        providerName = props.searchResults.filterMatches.find((m) => m.setting.key === props.key)?.providerName;
        const rawResults = this.searchResultModel.getRawResults();
        if (rawResults[SearchResultIdx.Local] && displayIndex >= 0) {
          const settingInLocalResults = rawResults[SearchResultIdx.Local].filterMatches.some((m) => m.setting.key === props.key);
          groupId = settingInLocalResults ? "local" : "remote";
        }
        if (rawResults[SearchResultIdx.Remote]) {
          const _nlpIndex = rawResults[SearchResultIdx.Remote].filterMatches.findIndex((m) => m.setting.key === props.key);
          nlpIndex = _nlpIndex >= 0 ? _nlpIndex : void 0;
        }
      }
    }
    const reportedTarget = props.settingsTarget === ConfigurationTarget.USER_LOCAL ? "user" : props.settingsTarget === ConfigurationTarget.USER_REMOTE ? "user_remote" : props.settingsTarget === ConfigurationTarget.WORKSPACE ? "workspace" : "folder";
    const data = {
      key: props.key,
      groupId,
      providerName,
      nlpIndex,
      displayIndex,
      showConfiguredOnly: props.showConfiguredOnly,
      isReset: props.isReset,
      target: reportedTarget
    };
    this.telemetryService.publicLog2("settingsEditor.settingModified", data);
  }
  scheduleRefresh(element, key = "") {
    if (key && this.scheduledRefreshes.has(key)) {
      return;
    }
    if (!key) {
      dispose(this.scheduledRefreshes.values());
      this.scheduledRefreshes.clear();
    }
    const store = new DisposableStore();
    const scheduledRefreshTracker = DOM.trackFocus(element);
    store.add(scheduledRefreshTracker);
    store.add(scheduledRefreshTracker.onDidBlur(() => {
      this.scheduledRefreshes.get(key)?.dispose();
      this.scheduledRefreshes.delete(key);
      this.onConfigUpdate(/* @__PURE__ */ new Set([key]));
    }));
    this.scheduledRefreshes.set(key, store);
  }
  createSettingsOrderByTocIndex(resolvedSettingsRoot) {
    const index = /* @__PURE__ */ new Map();
    function indexSettings(resolvedSettingsRoot2, counter = 0) {
      if (resolvedSettingsRoot2.settings) {
        for (const setting of resolvedSettingsRoot2.settings) {
          if (!index.has(setting.key)) {
            index.set(setting.key, counter++);
          }
        }
      }
      if (resolvedSettingsRoot2.children) {
        for (const child of resolvedSettingsRoot2.children) {
          counter = indexSettings(child, counter);
        }
      }
      return counter;
    }
    indexSettings(resolvedSettingsRoot);
    return index;
  }
  refreshModels(resolvedSettingsRoot) {
    this.settingsTreeModel.value.update(resolvedSettingsRoot);
    this.tocTreeModel.settingsTreeRoot = this.settingsTreeModel.value.root;
    this.settingsOrderByTocIndex = this.createSettingsOrderByTocIndex(resolvedSettingsRoot);
  }
  async onConfigUpdate(keys, forceRefresh = false, triggerSearch = false) {
    if (keys && this.settingsTreeModel) {
      return this.updateElementsByKey(keys);
    }
    if (!this.defaultSettingsEditorModel) {
      return;
    }
    const groups = this.defaultSettingsEditorModel.settingsGroups.slice(1);
    const coreSettingsGroups = [], extensionSettingsGroups = [];
    for (const group of groups) {
      if (group.extensionInfo) {
        extensionSettingsGroups.push(group);
      } else {
        coreSettingsGroups.push(group);
      }
    }
    const filter = this.canShowAdvancedSettings() ? void 0 : { exclude: { tags: [ADVANCED_SETTING_TAG] } };
    const settingsResult = resolveSettingsTree(tocData, coreSettingsGroups, filter, this.logService);
    const resolvedSettingsRoot = settingsResult.tree;
    if (settingsResult.leftoverSettings.size && !this.hasWarnedMissingSettings) {
      const settingKeyList = [];
      settingsResult.leftoverSettings.forEach((s) => {
        settingKeyList.push(s.key);
      });
      this.logService.warn(`SettingsEditor2: Settings not included in settingsLayout.ts: ${settingKeyList.join(", ")}`);
      this.hasWarnedMissingSettings = true;
    }
    const additionalGroups = [];
    let setAdditionalGroups = false;
    const toggleData = await getExperimentalExtensionToggleData(this.chatEntitlementService, this.extensionGalleryService, this.productService);
    if (toggleData && groups.filter((g) => g.extensionInfo).length && Object.keys(toggleData.settingsEditorRecommendedExtensions).length) {
      await this.refreshInstalledExtensionsList();
      for (const key in toggleData.settingsEditorRecommendedExtensions) {
        const extension = toggleData.recommendedExtensionsGalleryInfo[key];
        if (!extension) {
          continue;
        }
        const extensionId = extension.identifier.id;
        const extensionInstalled = this.installedExtensionIds.includes(extensionId);
        const matchingGroupIndex = groups.findIndex(
          (g) => g.extensionInfo && g.extensionInfo.id.toLowerCase() === extensionId.toLowerCase() && g.sections.length === 1 && g.sections[0].settings.length === 1 && g.sections[0].settings[0].displayExtensionId
        );
        if (extensionInstalled || this.dismissedExtensionSettings.includes(extensionId)) {
          if (matchingGroupIndex !== -1) {
            groups.splice(matchingGroupIndex, 1);
            setAdditionalGroups = true;
          }
          continue;
        }
        if (matchingGroupIndex !== -1) {
          continue;
        }
        let manifest = null;
        try {
          manifest = await raceTimeout(
            this.extensionGalleryService.getManifest(extension, CancellationToken.None),
            EXTENSION_FETCH_TIMEOUT_MS
          ) ?? null;
        } catch (e) {
          continue;
        }
        if (manifest === null) {
          continue;
        }
        const contributesConfiguration = manifest?.contributes?.configuration;
        let groupTitle;
        if (!Array.isArray(contributesConfiguration)) {
          groupTitle = contributesConfiguration?.title;
        } else if (contributesConfiguration.length === 1) {
          groupTitle = contributesConfiguration[0].title;
        }
        const recommendationInfo = toggleData.settingsEditorRecommendedExtensions[key];
        const extensionName = extension.displayName ?? extension.name ?? extensionId;
        const settingKey = `${key}.manageExtension`;
        const setting = {
          range: nullRange,
          key: settingKey,
          keyRange: nullRange,
          value: null,
          valueRange: nullRange,
          description: [recommendationInfo.onSettingsEditorOpen?.descriptionOverride ?? extension.description],
          descriptionIsMarkdown: false,
          descriptionRanges: [],
          scope: ConfigurationScope.WINDOW,
          type: "null",
          displayExtensionId: extensionId,
          extensionGroupTitle: groupTitle ?? extensionName,
          categoryLabel: "Extensions",
          title: extensionName
        };
        const additionalGroup = {
          sections: [{
            settings: [setting]
          }],
          id: extensionId,
          title: setting.extensionGroupTitle,
          titleRange: nullRange,
          range: nullRange,
          extensionInfo: {
            id: extensionId,
            displayName: extension.displayName
          }
        };
        groups.push(additionalGroup);
        additionalGroups.push(additionalGroup);
        setAdditionalGroups = true;
      }
    }
    resolvedSettingsRoot.children.push(await createTocTreeForExtensionSettings(this.extensionService, extensionSettingsGroups, filter));
    resolvedSettingsRoot.children.unshift(getCommonlyUsedData(groups));
    if (toggleData && setAdditionalGroups) {
      this.defaultSettingsEditorModel.setAdditionalGroups(additionalGroups);
    }
    if (!this.workspaceTrustManagementService.isWorkspaceTrusted() && (this.viewState.settingsTarget instanceof URI || this.viewState.settingsTarget === ConfigurationTarget.WORKSPACE)) {
      const configuredUntrustedWorkspaceSettings = resolveConfiguredUntrustedSettings(groups, this.viewState.settingsTarget, this.viewState.languageFilter, this.configurationService);
      if (configuredUntrustedWorkspaceSettings.length) {
        resolvedSettingsRoot.children.unshift({
          id: "workspaceTrust",
          label: localize("settings require trust", "Workspace Trust"),
          settings: configuredUntrustedWorkspaceSettings
        });
      }
    }
    this.searchResultModel?.updateChildren();
    const firstVisibleElement = this.settingsTree.firstVisibleElement;
    let anchorId;
    if (firstVisibleElement instanceof SettingsTreeSettingElement) {
      anchorId = firstVisibleElement.setting.key;
    } else if (firstVisibleElement instanceof SettingsTreeGroupElement) {
      anchorId = firstVisibleElement.id;
    }
    if (this.settingsTreeModel.value) {
      this.refreshModels(resolvedSettingsRoot);
      if (triggerSearch && this.searchResultModel) {
        return await this.onSearchInputChanged(false);
      }
      this.refreshTOCTree();
      this.renderTree(void 0, forceRefresh);
      if (anchorId) {
        const newModel = this.settingsTreeModel.value;
        let newElement;
        const settings = newModel.getElementsByName(anchorId);
        if (settings && settings.length > 0) {
          newElement = settings[0];
        } else {
          const findGroup = (roots) => {
            for (const g of roots) {
              if (g.id === anchorId) {
                return g;
              }
              if (g.children) {
                for (const child of g.children) {
                  if (child instanceof SettingsTreeGroupElement) {
                    const found = findGroup([child]);
                    if (found) {
                      return found;
                    }
                  }
                }
              }
            }
            return void 0;
          };
          newElement = findGroup([newModel.root]);
        }
        if (newElement) {
          try {
            this.settingsTree.reveal(newElement, 0);
          } catch (e) {
          }
        }
      }
    } else {
      this.settingsTreeModel.value = this.instantiationService.createInstance(SettingsTreeModel, this.viewState, this.workspaceTrustManagementService.isWorkspaceTrusted());
      this.refreshModels(resolvedSettingsRoot);
      const cachedState = !this.viewState.query ? this.restoreCachedState() : void 0;
      if (cachedState?.searchQuery || this.searchWidget.getValue()) {
        await this.onSearchInputChanged(true);
      } else {
        this.refreshTOCTree();
        const rootChildren = this.settingsTreeModel.value.root.children;
        if (Array.isArray(rootChildren) && rootChildren.length > 0) {
          const firstCategory = rootChildren[0];
          if (firstCategory instanceof SettingsTreeGroupElement) {
            this.viewState.categoryFilter = firstCategory;
            this.tocTree.setFocus([firstCategory]);
            this.tocTree.setSelection([firstCategory]);
          }
        }
        this.refreshTree();
        this.tocTree.collapseAll();
      }
    }
  }
  updateElementsByKey(keys) {
    if (keys.size) {
      if (this.searchResultModel) {
        keys.forEach((key) => this.searchResultModel.updateElementsByName(key));
      }
      if (this.settingsTreeModel.value) {
        keys.forEach((key) => this.settingsTreeModel.value.updateElementsByName(key));
      }
      keys.forEach((key) => this.renderTree(key));
    } else {
      this.renderTree();
    }
  }
  getActiveControlInSettingsTree() {
    const element = this.settingsTree.getHTMLElement();
    const activeElement = element.ownerDocument.activeElement;
    return activeElement && DOM.isAncestorOfActiveElement(element) ? activeElement : null;
  }
  renderTree(key, force = false) {
    if (!force && key && this.scheduledRefreshes.has(key)) {
      this.updateModifiedLabelForKey(key);
      return;
    }
    if (this.contextViewFocused()) {
      const element = this.window.document.querySelector(".context-view");
      if (element) {
        this.scheduleRefresh(element, key);
      }
      return;
    }
    const activeElement = this.getActiveControlInSettingsTree();
    const focusedSetting = activeElement && this.settingRenderers.getSettingDOMElementForDOMElement(activeElement);
    if (focusedSetting && !force) {
      if (key) {
        const focusedKey = focusedSetting.getAttribute(AbstractSettingRenderer.SETTING_KEY_ATTR);
        if (focusedKey === key && // update `list`s live, as they have a separate "submit edit" step built in before this
        (focusedSetting.parentElement && !focusedSetting.parentElement.classList.contains("setting-item-list"))) {
          this.updateModifiedLabelForKey(key);
          this.scheduleRefresh(focusedSetting, key);
          return;
        }
      } else {
        this.scheduleRefresh(focusedSetting);
        return;
      }
    }
    this.renderResultCountMessages(false);
    if (key) {
      const elements = this.currentSettingsModel?.getElementsByName(key);
      if (elements?.length) {
        if (elements.length >= 2) {
          console.warn("More than one setting with key " + key + " found");
        }
        this.refreshSingleElement(elements[0]);
      } else {
        return;
      }
    } else {
      this.refreshTree();
    }
    return;
  }
  contextViewFocused() {
    return !!DOM.findParentWithClass(this.rootElement.ownerDocument.activeElement, "context-view");
  }
  refreshSingleElement(element) {
    if (this.isVisible() && this.settingsTree.hasElement(element) && (!element.setting.deprecationMessage || element.isConfigured)) {
      this.settingsTree.rerender(element);
    }
  }
  refreshTree() {
    if (this.isVisible() && this.currentSettingsModel) {
      this.settingsTree.setChildren(null, createGroupIterator(this.currentSettingsModel.root));
    }
  }
  refreshTOCTree() {
    if (this.isVisible()) {
      this.tocTreeModel.update();
      this.tocTree.setChildren(null, createTOCIterator(this.tocTreeModel, this.tocTree));
    }
  }
  updateModifiedLabelForKey(key) {
    if (!this.currentSettingsModel) {
      return;
    }
    const dataElements = this.currentSettingsModel.getElementsByName(key);
    const isModified = dataElements && dataElements[0] && dataElements[0].isConfigured;
    const elements = this.settingRenderers.getDOMElementsForSettingKey(this.settingsTree.getHTMLElement(), key);
    if (elements && elements[0]) {
      elements[0].classList.toggle("is-configured", !!isModified);
    }
  }
  async onSearchInputChanged(expandResults) {
    if (!this.currentSettingsModel) {
      return;
    }
    const query = this.searchWidget.getValue().trim();
    this.viewState.query = query;
    if (query) {
      this.searchWidget.addToHistory();
      this.updateSearchPlaceholder();
      this.saveSearchHistory();
    }
    await this.triggerSearch(query.replace(/\u203A/g, " "), expandResults);
  }
  loadSearchHistory() {
    const raw = this.storageService.get(this.SEARCH_HISTORY_STORAGE_KEY, StorageScope.PROFILE);
    if (!raw) {
      return [];
    }
    try {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed.filter((entry) => typeof entry === "string") : [];
    } catch {
      return [];
    }
  }
  saveSearchHistory() {
    if (!this.searchWidget) {
      return;
    }
    const history = this.searchWidget.getHistory();
    if (history.length) {
      this.storageService.store(this.SEARCH_HISTORY_STORAGE_KEY, JSON.stringify(history), StorageScope.PROFILE, StorageTarget.MACHINE);
    } else {
      this.storageService.remove(this.SEARCH_HISTORY_STORAGE_KEY, StorageScope.PROFILE);
    }
  }
  parseSettingFromJSON(query) {
    const match = query.match(/"([a-zA-Z.]+)": /);
    return match && match[1];
  }
  /**
   * Toggles the visibility of the Settings editor table of contents during a search
   * depending on the behavior.
   */
  toggleTocBySearchBehaviorType() {
    const tocBehavior = this.configurationService.getValue(SEARCH_TOC_BEHAVIOR_KEY);
    const hideToc = tocBehavior === "hide";
    if (hideToc) {
      this.splitView.setViewVisible(0, false);
      this.splitView.style({
        separatorBorder: Color.transparent
      });
    } else {
      this.layoutSplitView(this.dimension);
    }
  }
  async triggerSearch(query, expandResults) {
    const progressRunner = this.editorProgressService.show(true, 800);
    const showAdvanced = this.viewState.tagFilters?.has(ADVANCED_SETTING_TAG);
    this.viewState.tagFilters = /* @__PURE__ */ new Set();
    this.viewState.extensionFilters = /* @__PURE__ */ new Set();
    this.viewState.featureFilters = /* @__PURE__ */ new Set();
    this.viewState.idFilters = /* @__PURE__ */ new Set();
    this.viewState.languageFilter = void 0;
    if (query) {
      const parsedQuery = parseQuery(query);
      query = parsedQuery.query;
      parsedQuery.tags.forEach((tag) => this.viewState.tagFilters.add(tag));
      parsedQuery.extensionFilters.forEach((extensionId) => this.viewState.extensionFilters.add(extensionId));
      parsedQuery.featureFilters.forEach((feature) => this.viewState.featureFilters.add(feature));
      parsedQuery.idFilters.forEach((id) => this.viewState.idFilters.add(id));
      this.viewState.languageFilter = parsedQuery.languageFilter;
    }
    if (showAdvanced !== this.viewState.tagFilters?.has(ADVANCED_SETTING_TAG)) {
      await this.onConfigUpdate();
    }
    this.settingsTargetsWidget.updateLanguageFilterIndicators(this.viewState.languageFilter);
    if (query && query !== "@") {
      query = this.parseSettingFromJSON(query) || query;
      await this.triggerFilterPreferences(query, expandResults, progressRunner);
      this.toggleTocBySearchBehaviorType();
    } else {
      if (this.viewState.tagFilters.size || this.viewState.extensionFilters.size || this.viewState.featureFilters.size || this.viewState.idFilters.size || this.viewState.languageFilter) {
        this.searchResultModel = this.createFilterModel();
      } else {
        this.searchResultModel = null;
      }
      this.searchDelayer.cancel();
      if (this.searchInProgress) {
        this.searchInProgress.dispose(true);
        this.searchInProgress = null;
      }
      if (expandResults) {
        this.tocTree.setFocus([]);
        this.viewState.categoryFilter = void 0;
      }
      this.tocTreeModel.currentSearchModel = this.searchResultModel;
      this.renderedSearchQuery = this.viewState.query;
      if (this.searchResultModel) {
        if (expandResults) {
          this.tocTree.setSelection([]);
          this.tocTree.expandAll();
        }
        this.refreshTOCTree();
        this.renderResultCountMessages(false);
        this.refreshTree();
        this.toggleTocBySearchBehaviorType();
      } else if (!this.tocTreeDisposed) {
        this.tocTree.collapseAll();
        this.refreshTOCTree();
        this.renderResultCountMessages(false);
        this.refreshTree();
        this.layoutSplitView(this.dimension);
      }
      progressRunner.done();
    }
  }
  /**
   * Return a fake SearchResultModel which can hold a flat list of all settings, to be filtered (@modified etc)
   */
  createFilterModel() {
    const filterModel = this.instantiationService.createInstance(SearchResultModel, this.viewState, this.settingsOrderByTocIndex, this.workspaceTrustManagementService.isWorkspaceTrusted());
    const fullResult = {
      filterMatches: [],
      exactMatch: false
    };
    const shouldShowAdvanced = this.canShowAdvancedSettings();
    for (const g of this.defaultSettingsEditorModel.settingsGroups.slice(1)) {
      for (const sect of g.sections) {
        for (const setting of sect.settings) {
          if (!shouldShowAdvanced && !this.shouldShowSetting(setting)) {
            continue;
          }
          fullResult.filterMatches.push({
            setting,
            matches: [],
            matchType: SettingMatchType.None,
            keyMatchScore: 0,
            score: 0,
            providerName: FILTER_MODEL_SEARCH_PROVIDER_NAME
          });
        }
      }
    }
    filterModel.setResult(0, fullResult);
    return filterModel;
  }
  async triggerFilterPreferences(query, expandResults, progressRunner) {
    if (this.searchInProgress) {
      this.searchInProgress.dispose(true);
      this.searchInProgress = null;
    }
    const searchInProgress = this.searchInProgress = new CancellationTokenSource();
    return this.searchDelayer.trigger(async () => {
      if (searchInProgress.token.isCancellationRequested) {
        return;
      }
      this.disableAiSearchToggle();
      const localResults = await this.doLocalSearch(query, searchInProgress.token);
      if (!this.searchResultModel || searchInProgress.token.isCancellationRequested) {
        return;
      }
      this.searchResultModel.showAiResults = false;
      if (localResults && localResults.filterMatches.length > 0) {
        this.onDidFinishSearch(expandResults, void 0);
      }
      if (!localResults || !localResults.exactMatch) {
        await this.doRemoteSearch(query, searchInProgress.token);
      }
      if (searchInProgress.token.isCancellationRequested) {
        return;
      }
      if (this.aiSearchPromise) {
        this.aiSearchPromise.cancel();
      }
      if (this.searchInputActionBar && this.showAiResultsAction && this.searchInputActionBar.hasAction(this.showAiResultsAction)) {
        this.aiSearchPromise = createCancelablePromise((token) => {
          return this.doAiSearch(query, token).then((results) => {
            if (results && this.showAiResultsAction) {
              this.showAiResultsAction.enabled = true;
              this.aiResultsAvailable.set(true);
              this.showAiResultsAction.label = SHOW_AI_RESULTS_ENABLED_LABEL;
              this.renderResultCountMessages(true);
            }
          }).catch((e) => {
            if (!isCancellationError(e)) {
              this.logService.trace("Error during AI settings search:", e);
            }
          });
        });
      }
      this.onDidFinishSearch(expandResults, progressRunner);
    });
  }
  onDidFinishSearch(expandResults, progressRunner) {
    this.tocTreeModel.currentSearchModel = this.searchResultModel;
    this.renderedSearchQuery = this.viewState.query;
    if (expandResults) {
      this.tocTree.setFocus([]);
      this.viewState.categoryFilter = void 0;
      this.tocTree.expandAll();
      this.settingsTree.scrollTop = 0;
    }
    this.refreshTOCTree();
    this.renderTree(void 0, true);
    progressRunner?.done();
  }
  doLocalSearch(query, token) {
    const localSearchProvider = this.preferencesSearchService.getLocalSearchProvider(query);
    return this.searchWithProvider(SearchResultIdx.Local, localSearchProvider, STRING_MATCH_SEARCH_PROVIDER_NAME, token);
  }
  doRemoteSearch(query, token) {
    const remoteSearchProvider = this.preferencesSearchService.getRemoteSearchProvider(query);
    if (!remoteSearchProvider) {
      return Promise.resolve(null);
    }
    return this.searchWithProvider(SearchResultIdx.Remote, remoteSearchProvider, TF_IDF_SEARCH_PROVIDER_NAME, token);
  }
  async doAiSearch(query, token) {
    const aiSearchProvider = this.preferencesSearchService.getAiSearchProvider(query);
    if (!aiSearchProvider) {
      return null;
    }
    const embeddingsResults = await this.searchWithProvider(SearchResultIdx.Embeddings, aiSearchProvider, EMBEDDINGS_SEARCH_PROVIDER_NAME, token);
    if (!embeddingsResults || token.isCancellationRequested) {
      return null;
    }
    const llmResults = await this.getLLMRankedResults(query, token);
    if (token.isCancellationRequested) {
      return null;
    }
    return {
      filterMatches: embeddingsResults.filterMatches.concat(llmResults?.filterMatches ?? []),
      exactMatch: false
    };
  }
  async getLLMRankedResults(query, token) {
    const aiSearchProvider = this.preferencesSearchService.getAiSearchProvider(query);
    if (!aiSearchProvider) {
      return null;
    }
    const stopWatch = new StopWatch(false);
    const result = await aiSearchProvider.getLLMRankedResults(token);
    stopWatch.stop();
    if (token.isCancellationRequested) {
      return null;
    }
    if (result && result.filterMatches.length > 0) {
      const elapsed = stopWatch.elapsed();
      this.logSearchPerformance(LLM_RANKED_SEARCH_PROVIDER_NAME, elapsed);
    }
    this.searchResultModel.setResult(SearchResultIdx.AiSelected, result);
    return result;
  }
  async searchWithProvider(type, searchProvider, providerName, token) {
    const stopWatch = new StopWatch(false);
    const result = await this._searchPreferencesModel(this.defaultSettingsEditorModel, searchProvider, token);
    stopWatch.stop();
    if (token.isCancellationRequested) {
      return null;
    }
    if (result && !this.canShowAdvancedSettings()) {
      result.filterMatches = result.filterMatches.filter((match) => this.shouldShowSetting(match.setting));
    }
    if (result && result.filterMatches.length > 0) {
      const elapsed = stopWatch.elapsed();
      this.logSearchPerformance(providerName, elapsed);
    }
    this.searchResultModel ??= this.instantiationService.createInstance(SearchResultModel, this.viewState, this.settingsOrderByTocIndex, this.workspaceTrustManagementService.isWorkspaceTrusted());
    this.searchResultModel.setResult(type, result);
    return result;
  }
  logSearchPerformance(providerName, elapsed) {
    this.telemetryService.publicLog2("settingsEditor.searchPerformance", {
      providerName,
      elapsedMs: elapsed
    });
  }
  renderResultCountMessages(showAiResultsMessage) {
    if (!this.currentSettingsModel) {
      return;
    }
    this.clearFilterLinkContainer.style.display = this.viewState.tagFilters && this.viewState.tagFilters.size > 0 ? "initial" : "none";
    if (!this.searchResultModel) {
      if (this.countElement.style.display !== "none") {
        this.searchResultLabel = null;
        this.updateInputAriaLabel();
        this.countElement.style.display = "none";
        this.countElement.innerText = "";
        this.layout(this.dimension);
      }
      this.rootElement.classList.remove("no-results");
      this.splitView.el.style.visibility = "visible";
      return;
    } else {
      const count = this.searchResultModel.getUniqueResultsCount();
      let resultString;
      if (showAiResultsMessage) {
        switch (count) {
          case 0:
            resultString = localize("noResultsWithAiAvailable", "No Settings Found. AI Results Available");
            break;
          case 1:
            resultString = localize("oneResultWithAiAvailable", "1 Setting Found. AI Results Available");
            break;
          default:
            resultString = localize("moreThanOneResultWithAiAvailable", "{0} Settings Found. AI Results Available", count);
        }
      } else {
        switch (count) {
          case 0:
            resultString = localize("noResults", "No Settings Found");
            break;
          case 1:
            resultString = localize("oneResult", "1 Setting Found");
            break;
          default:
            resultString = localize("moreThanOneResult", "{0} Settings Found", count);
        }
      }
      this.searchResultLabel = resultString;
      this.updateInputAriaLabel();
      this.countElement.innerText = resultString;
      aria.status(resultString);
      if (this.countElement.style.display !== "block") {
        this.countElement.style.display = "block";
      }
      this.layout(this.dimension);
      this.rootElement.classList.toggle("no-results", count === 0);
      this.splitView.el.style.visibility = count === 0 ? "hidden" : "visible";
    }
  }
  async _searchPreferencesModel(model, provider, token) {
    try {
      return await provider.searchModel(model, token);
    } catch (err) {
      if (isCancellationError(err)) {
        return Promise.reject(err);
      } else {
        return null;
      }
    }
  }
  layoutSplitView(dimension) {
    if (!this.isVisible()) {
      return;
    }
    const listHeight = dimension.height - (72 + 11 + 14);
    this.splitView.el.style.height = `${listHeight}px`;
    this.splitView.layout(this.bodyContainer.clientWidth, listHeight);
    const tocBehavior = this.configurationService.getValue(SEARCH_TOC_BEHAVIOR_KEY);
    const hideTocForSearch = tocBehavior === "hide" && this.searchResultModel;
    if (!hideTocForSearch) {
      const firstViewWasVisible = this.splitView.isViewVisible(0);
      const firstViewVisible = this.bodyContainer.clientWidth >= SettingsEditor2.NARROW_TOTAL_WIDTH;
      this.splitView.setViewVisible(0, firstViewVisible);
      if (!firstViewWasVisible && firstViewVisible && this.bodyContainer.clientWidth >= SettingsEditor2.EDITOR_MIN_WIDTH + SettingsEditor2.TOC_RESET_WIDTH) {
        this.splitView.resizeView(0, SettingsEditor2.TOC_RESET_WIDTH);
      }
      this.splitView.style({
        separatorBorder: firstViewVisible ? this.theme.getColor(settingsSashBorder) : Color.transparent
      });
    }
  }
  saveState() {
    this.saveSearchHistory();
    if (this.isVisible()) {
      const searchQuery = this.searchWidget.getValue().trim();
      const target = this.settingsTargetsWidget.settingsTarget;
      if (this.input) {
        this.editorMemento.saveEditorState(this.group, this.input, { searchQuery, target });
      }
    } else if (this.input) {
      this.editorMemento.clearEditorState(this.input, this.group);
    }
    super.saveState();
  }
};
SettingsEditor2.ID = "workbench.editor.settings2";
SettingsEditor2.NUM_INSTANCES = 0;
SettingsEditor2.SEARCH_DEBOUNCE = 200;
SettingsEditor2.SETTING_UPDATE_FAST_DEBOUNCE = 200;
SettingsEditor2.SETTING_UPDATE_SLOW_DEBOUNCE = 1e3;
SettingsEditor2.CONFIG_SCHEMA_UPDATE_DELAYER = 500;
SettingsEditor2.TOC_MIN_WIDTH = 100;
SettingsEditor2.TOC_RESET_WIDTH = 200;
SettingsEditor2.EDITOR_MIN_WIDTH = 500;
// Below NARROW_TOTAL_WIDTH, we only render the editor rather than the ToC.
SettingsEditor2.NARROW_TOTAL_WIDTH = SettingsEditor2.TOC_RESET_WIDTH + SettingsEditor2.EDITOR_MIN_WIDTH;
SettingsEditor2.SUGGESTIONS = [
  `@${MODIFIED_SETTING_TAG}`,
  "@tag:notebookLayout",
  "@tag:notebookOutputLayout",
  `@tag:${REQUIRE_TRUSTED_WORKSPACE_SETTING_TAG}`,
  `@tag:${WORKSPACE_TRUST_SETTING_TAG}`,
  "@tag:sync",
  "@tag:usesOnlineServices",
  "@tag:telemetry",
  "@tag:accessibility",
  "@tag:preview",
  "@tag:experimental",
  `@tag:${ADVANCED_SETTING_TAG}`,
  `@${ID_SETTING_TAG}`,
  `@${EXTENSION_SETTING_TAG}`,
  `@${FEATURE_SETTING_TAG}scm`,
  `@${FEATURE_SETTING_TAG}explorer`,
  `@${FEATURE_SETTING_TAG}search`,
  `@${FEATURE_SETTING_TAG}debug`,
  `@${FEATURE_SETTING_TAG}extensions`,
  `@${FEATURE_SETTING_TAG}terminal`,
  `@${FEATURE_SETTING_TAG}task`,
  `@${FEATURE_SETTING_TAG}problems`,
  `@${FEATURE_SETTING_TAG}output`,
  `@${FEATURE_SETTING_TAG}comments`,
  `@${FEATURE_SETTING_TAG}remote`,
  `@${FEATURE_SETTING_TAG}timeline`,
  `@${FEATURE_SETTING_TAG}notebook`,
  `@${FEATURE_SETTING_TAG}chat`,
  `@${POLICY_SETTING_TAG}`
];
SettingsEditor2 = __decorateClass([
  __decorateParam(1, ITelemetryService),
  __decorateParam(2, IWorkbenchConfigurationService),
  __decorateParam(3, ITextResourceConfigurationService),
  __decorateParam(4, IThemeService),
  __decorateParam(5, IPreferencesService),
  __decorateParam(6, IInstantiationService),
  __decorateParam(7, IPreferencesSearchService),
  __decorateParam(8, ILogService),
  __decorateParam(9, IContextKeyService),
  __decorateParam(10, IStorageService),
  __decorateParam(11, IEditorGroupsService),
  __decorateParam(12, IUserDataSyncWorkbenchService),
  __decorateParam(13, IUserDataSyncEnablementService),
  __decorateParam(14, IWorkspaceTrustManagementService),
  __decorateParam(15, IExtensionService),
  __decorateParam(16, ILanguageService),
  __decorateParam(17, IExtensionManagementService),
  __decorateParam(18, IProductService),
  __decorateParam(19, IExtensionGalleryService),
  __decorateParam(20, IEditorProgressService),
  __decorateParam(21, IUserDataProfileService),
  __decorateParam(22, IKeybindingService),
  __decorateParam(23, IChatEntitlementService),
  __decorateParam(24, IWorkbenchEnvironmentService)
], SettingsEditor2);
let SyncControls = class extends Disposable {
  constructor(window, container, commandService, userDataSyncService, userDataSyncEnablementService, telemetryService) {
    super();
    this.commandService = commandService;
    this.userDataSyncService = userDataSyncService;
    this.userDataSyncEnablementService = userDataSyncEnablementService;
    this._onDidChangeLastSyncedLabel = this._register(new Emitter());
    this.onDidChangeLastSyncedLabel = this._onDidChangeLastSyncedLabel.event;
    const headerRightControlsContainer = DOM.append(container, $(".settings-right-controls"));
    const turnOnSyncButtonContainer = DOM.append(headerRightControlsContainer, $(".turn-on-sync"));
    this.turnOnSyncButton = this._register(new Button(turnOnSyncButtonContainer, { title: true, ...defaultButtonStyles }));
    this.lastSyncedLabel = DOM.append(headerRightControlsContainer, $(".last-synced-label"));
    DOM.hide(this.lastSyncedLabel);
    this.turnOnSyncButton.enabled = true;
    this.turnOnSyncButton.label = localize("turnOnSyncButton", "Backup and Sync Settings");
    DOM.hide(this.turnOnSyncButton.element);
    this._register(this.turnOnSyncButton.onDidClick(async () => {
      await this.commandService.executeCommand("workbench.userDataSync.actions.turnOn");
    }));
    this.updateLastSyncedTime();
    this._register(this.userDataSyncService.onDidChangeLastSyncTime(() => {
      this.updateLastSyncedTime();
    }));
    const updateLastSyncedTimer = this._register(new DOM.WindowIntervalTimer());
    updateLastSyncedTimer.cancelAndSet(() => this.updateLastSyncedTime(), 60 * 1e3, window);
    this.update();
    this._register(this.userDataSyncService.onDidChangeStatus(() => {
      this.update();
    }));
    this._register(this.userDataSyncEnablementService.onDidChangeEnablement(() => {
      this.update();
    }));
  }
  updateLastSyncedTime() {
    const last = this.userDataSyncService.lastSyncTime;
    let label;
    if (typeof last === "number") {
      const d = fromNow(last, true, void 0, true);
      label = localize("lastSyncedLabel", "Last synced: {0}", d);
    } else {
      label = "";
    }
    this.lastSyncedLabel.textContent = label;
    this._onDidChangeLastSyncedLabel.fire(label);
  }
  update() {
    if (this.userDataSyncService.status === SyncStatus.Uninitialized) {
      return;
    }
    if (this.userDataSyncEnablementService.isEnabled() || this.userDataSyncService.status !== SyncStatus.Idle) {
      DOM.show(this.lastSyncedLabel);
      DOM.hide(this.turnOnSyncButton.element);
    } else {
      DOM.hide(this.lastSyncedLabel);
      DOM.show(this.turnOnSyncButton.element);
    }
  }
};
SyncControls = __decorateClass([
  __decorateParam(2, ICommandService),
  __decorateParam(3, IUserDataSyncService),
  __decorateParam(4, IUserDataSyncEnablementService),
  __decorateParam(5, ITelemetryService)
], SyncControls);
export {
  SettingsEditor2,
  SettingsFocusContext,
  createGroupIterator,
  isSettingsSearchUpToDate
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXHByZWZlcmVuY2VzXFxicm93c2VyXFxzZXR0aW5nc0VkaXRvcjIudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgKiBhcyBET00gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL2RvbS5qcyc7XG5pbXBvcnQgeyBTdGFuZGFyZEtleWJvYXJkRXZlbnQgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIva2V5Ym9hcmRFdmVudC5qcyc7XG5pbXBvcnQgeyBBY3Rpb25CYXIgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvdWkvYWN0aW9uYmFyL2FjdGlvbmJhci5qcyc7XG5pbXBvcnQgKiBhcyBhcmlhIGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci91aS9hcmlhL2FyaWEuanMnO1xuaW1wb3J0IHsgQnV0dG9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL3VpL2J1dHRvbi9idXR0b24uanMnO1xuaW1wb3J0IHsgT3JpZW50YXRpb24sIFNpemluZywgU3BsaXRWaWV3IH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL3VpL3NwbGl0dmlldy9zcGxpdHZpZXcuanMnO1xuaW1wb3J0IHsgVG9nZ2xlQWN0aW9uVmlld0l0ZW0gfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvdWkvdG9nZ2xlL3RvZ2dsZS5qcyc7XG5pbXBvcnQgeyBJVHJlZUVsZW1lbnQgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvdWkvdHJlZS90cmVlLmpzJztcbmltcG9ydCB7IENvZGVXaW5kb3cgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvd2luZG93LmpzJztcbmltcG9ydCB7IEFjdGlvbiB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2FjdGlvbnMuanMnO1xuaW1wb3J0IHsgQ2FuY2VsYWJsZVByb21pc2UsIGNyZWF0ZUNhbmNlbGFibGVQcm9taXNlLCBEZWxheWVyLCByYWNlVGltZW91dCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2FzeW5jLmpzJztcbmltcG9ydCB7IENhbmNlbGxhdGlvblRva2VuLCBDYW5jZWxsYXRpb25Ub2tlblNvdXJjZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2NhbmNlbGxhdGlvbi5qcyc7XG5pbXBvcnQgeyBDb2xvciB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2NvbG9yLmpzJztcbmltcG9ydCB7IGZyb21Ob3cgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9kYXRlLmpzJztcbmltcG9ydCB7IGlzQ2FuY2VsbGF0aW9uRXJyb3IgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9lcnJvcnMuanMnO1xuaW1wb3J0IHsgRW1pdHRlciwgRXZlbnQgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9ldmVudC5qcyc7XG5pbXBvcnQgeyBJdGVyYWJsZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2l0ZXJhdG9yLmpzJztcbmltcG9ydCB7IEtleUNvZGUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9rZXlDb2Rlcy5qcyc7XG5pbXBvcnQgeyBEaXNwb3NhYmxlLCBEaXNwb3NhYmxlU3RvcmUsIGRpc3Bvc2UsIHR5cGUgSURpc3Bvc2FibGUsIE11dGFibGVEaXNwb3NhYmxlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCAqIGFzIHBsYXRmb3JtIGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3BsYXRmb3JtLmpzJztcbmltcG9ydCB7IFN0b3BXYXRjaCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3N0b3B3YXRjaC5qcyc7XG5pbXBvcnQgeyBUaGVtZUljb24gfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi90aGVtYWJsZXMuanMnO1xuaW1wb3J0IHsgVVJJIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdXJpLmpzJztcbmltcG9ydCB7IElMYW5ndWFnZVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL2xhbmd1YWdlcy9sYW5ndWFnZS5qcyc7XG5pbXBvcnQgeyBJVGV4dFJlc291cmNlQ29uZmlndXJhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL3NlcnZpY2VzL3RleHRSZXNvdXJjZUNvbmZpZ3VyYXRpb24uanMnO1xuaW1wb3J0IHsgbG9jYWxpemUgfSBmcm9tICcuLi8uLi8uLi8uLi9ubHMuanMnO1xuaW1wb3J0IHsgSUNvbW1hbmRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29tbWFuZHMvY29tbW9uL2NvbW1hbmRzLmpzJztcbmltcG9ydCB7IENvbmZpZ3VyYXRpb25UYXJnZXQsIElDb25maWd1cmF0aW9uVXBkYXRlT3ZlcnJpZGVzIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29uZmlndXJhdGlvbi9jb21tb24vY29uZmlndXJhdGlvbi5qcyc7XG5pbXBvcnQgeyBDb25maWd1cmF0aW9uU2NvcGUsIEV4dGVuc2lvbnMsIElDb25maWd1cmF0aW9uUmVnaXN0cnkgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb25maWd1cmF0aW9uL2NvbW1vbi9jb25maWd1cmF0aW9uUmVnaXN0cnkuanMnO1xuaW1wb3J0IHsgSUNvbnRleHRLZXksIElDb250ZXh0S2V5U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbnRleHRrZXkvY29tbW9uL2NvbnRleHRrZXkuanMnO1xuaW1wb3J0IHsgSUV4dGVuc2lvbkdhbGxlcnlTZXJ2aWNlLCBJRXh0ZW5zaW9uTWFuYWdlbWVudFNlcnZpY2UsIElHYWxsZXJ5RXh0ZW5zaW9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vZXh0ZW5zaW9uTWFuYWdlbWVudC9jb21tb24vZXh0ZW5zaW9uTWFuYWdlbWVudC5qcyc7XG5pbXBvcnQgeyBJRXh0ZW5zaW9uTWFuaWZlc3QgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9leHRlbnNpb25zL2NvbW1vbi9leHRlbnNpb25zLmpzJztcbmltcG9ydCB7IElJbnN0YW50aWF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2luc3RhbnRpYXRpb24vY29tbW9uL2luc3RhbnRpYXRpb24uanMnO1xuaW1wb3J0IHsgSUtleWJpbmRpbmdTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0va2V5YmluZGluZy9jb21tb24va2V5YmluZGluZy5qcyc7XG5pbXBvcnQgeyBJTG9nU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2xvZy9jb21tb24vbG9nLmpzJztcbmltcG9ydCB7IElQcm9kdWN0U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3Byb2R1Y3QvY29tbW9uL3Byb2R1Y3RTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElFZGl0b3JQcm9ncmVzc1NlcnZpY2UsIElQcm9ncmVzc1J1bm5lciB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3Byb2dyZXNzL2NvbW1vbi9wcm9ncmVzcy5qcyc7XG5pbXBvcnQgeyBSZWdpc3RyeSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3JlZ2lzdHJ5L2NvbW1vbi9wbGF0Zm9ybS5qcyc7XG5pbXBvcnQgeyBJU3RvcmFnZVNlcnZpY2UsIFN0b3JhZ2VTY29wZSwgU3RvcmFnZVRhcmdldCB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3N0b3JhZ2UvY29tbW9uL3N0b3JhZ2UuanMnO1xuaW1wb3J0IHsgSVRlbGVtZXRyeVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS90ZWxlbWV0cnkvY29tbW9uL3RlbGVtZXRyeS5qcyc7XG5pbXBvcnQgeyBkZWZhdWx0QnV0dG9uU3R5bGVzLCBkZWZhdWx0VG9nZ2xlU3R5bGVzIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vdGhlbWUvYnJvd3Nlci9kZWZhdWx0U3R5bGVzLmpzJztcbmltcG9ydCB7IGFzQ3NzVmFyaWFibGUsIGVkaXRvckZvcmVncm91bmQgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS90aGVtZS9jb21tb24vY29sb3JSZWdpc3RyeS5qcyc7XG5pbXBvcnQgeyBJVGhlbWVTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vdGhlbWUvY29tbW9uL3RoZW1lU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJVXNlckRhdGFTeW5jRW5hYmxlbWVudFNlcnZpY2UsIElVc2VyRGF0YVN5bmNTZXJ2aWNlLCBTeW5jU3RhdHVzIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vdXNlckRhdGFTeW5jL2NvbW1vbi91c2VyRGF0YVN5bmMuanMnO1xuaW1wb3J0IHsgSVdvcmtzcGFjZVRydXN0TWFuYWdlbWVudFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS93b3Jrc3BhY2UvY29tbW9uL3dvcmtzcGFjZVRydXN0LmpzJztcbmltcG9ydCB7IHJlZ2lzdGVyTmF2aWdhYmxlQ29udGFpbmVyIH0gZnJvbSAnLi4vLi4vLi4vYnJvd3Nlci9hY3Rpb25zL3dpZGdldE5hdmlnYXRpb25Db21tYW5kcy5qcyc7XG5pbXBvcnQgeyBFZGl0b3JQYW5lIH0gZnJvbSAnLi4vLi4vLi4vYnJvd3Nlci9wYXJ0cy9lZGl0b3IvZWRpdG9yUGFuZS5qcyc7XG5pbXBvcnQgeyBJRWRpdG9yTWVtZW50bywgSUVkaXRvck9wZW5Db250ZXh0LCBJRWRpdG9yUGFuZSB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9lZGl0b3IuanMnO1xuaW1wb3J0IHsgSUNoYXRFbnRpdGxlbWVudFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9zZXJ2aWNlcy9jaGF0L2NvbW1vbi9jaGF0RW50aXRsZW1lbnRTZXJ2aWNlLmpzJztcbmltcG9ydCB7IEFQUExJQ0FUSU9OX1NDT1BFUywgSVdvcmtiZW5jaENvbmZpZ3VyYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vc2VydmljZXMvY29uZmlndXJhdGlvbi9jb21tb24vY29uZmlndXJhdGlvbi5qcyc7XG5pbXBvcnQgeyBJRWRpdG9yR3JvdXAsIElFZGl0b3JHcm91cHNTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vc2VydmljZXMvZWRpdG9yL2NvbW1vbi9lZGl0b3JHcm91cHNTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElFeHRlbnNpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vc2VydmljZXMvZXh0ZW5zaW9ucy9jb21tb24vZXh0ZW5zaW9ucy5qcyc7XG5pbXBvcnQgeyBBTFdBWVNfU0hPV19BRFZBTkNFRF9TRVRUSU5HU19TRVRUSU5HLCBJT3BlblNldHRpbmdzT3B0aW9ucywgSVByZWZlcmVuY2VzU2VydmljZSwgSVNlYXJjaFJlc3VsdCwgSVNldHRpbmcsIElTZXR0aW5nc0VkaXRvck1vZGVsLCBJU2V0dGluZ3NFZGl0b3JPcHRpb25zLCBJU2V0dGluZ3NHcm91cCwgU2V0dGluZ01hdGNoVHlwZSwgU2V0dGluZ1ZhbHVlVHlwZSwgdmFsaWRhdGVTZXR0aW5nc0VkaXRvck9wdGlvbnMgfSBmcm9tICcuLi8uLi8uLi9zZXJ2aWNlcy9wcmVmZXJlbmNlcy9jb21tb24vcHJlZmVyZW5jZXMuanMnO1xuaW1wb3J0IHsgU2V0dGluZ3NFZGl0b3IySW5wdXQgfSBmcm9tICcuLi8uLi8uLi9zZXJ2aWNlcy9wcmVmZXJlbmNlcy9jb21tb24vcHJlZmVyZW5jZXNFZGl0b3JJbnB1dC5qcyc7XG5pbXBvcnQgeyBudWxsUmFuZ2UsIFNldHRpbmdzMkVkaXRvck1vZGVsIH0gZnJvbSAnLi4vLi4vLi4vc2VydmljZXMvcHJlZmVyZW5jZXMvY29tbW9uL3ByZWZlcmVuY2VzTW9kZWxzLmpzJztcbmltcG9ydCB7IElVc2VyRGF0YVByb2ZpbGVTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vc2VydmljZXMvdXNlckRhdGFQcm9maWxlL2NvbW1vbi91c2VyRGF0YVByb2ZpbGUuanMnO1xuaW1wb3J0IHsgSVVzZXJEYXRhU3luY1dvcmtiZW5jaFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9zZXJ2aWNlcy91c2VyRGF0YVN5bmMvY29tbW9uL3VzZXJEYXRhU3luYy5qcyc7XG5pbXBvcnQgeyBTdWdnZXN0RW5hYmxlZElucHV0V2l0aEhpc3RvcnkgfSBmcm9tICcuLi8uLi9jb2RlRWRpdG9yL2Jyb3dzZXIvc3VnZ2VzdEVuYWJsZWRJbnB1dC9zdWdnZXN0RW5hYmxlZElucHV0LmpzJztcbmltcG9ydCB7IEFEVkFOQ0VEX1NFVFRJTkdfVEFHLCBBR0VOVFNfV0lORE9XX1NFVFRJTkdfVEFHLCBDT05URVhUX0FJX1NFVFRJTkdfUkVTVUxUU19BVkFJTEFCTEUsIENPTlRFWFRfU0VUVElOR1NfRURJVE9SLCBDT05URVhUX1NFVFRJTkdTX0ZJUlNUX1JPV19GT0NVUywgQ09OVEVYVF9TRVRUSU5HU19ST1dfRk9DVVMsIENPTlRFWFRfU0VUVElOR1NfU0VBUkNIX0ZPQ1VTLCBDT05URVhUX1RPQ19ST1dfRk9DVVMsIEVNQkVERElOR1NfU0VBUkNIX1BST1ZJREVSX05BTUUsIEVOQUJMRV9MQU5HVUFHRV9GSUxURVIsIEVYVEVOU0lPTl9GRVRDSF9USU1FT1VUX01TLCBFWFRFTlNJT05fU0VUVElOR19UQUcsIEZFQVRVUkVfU0VUVElOR19UQUcsIEZJTFRFUl9NT0RFTF9TRUFSQ0hfUFJPVklERVJfTkFNRSwgZ2V0RXhwZXJpbWVudGFsRXh0ZW5zaW9uVG9nZ2xlRGF0YSwgSURfU0VUVElOR19UQUcsIElQcmVmZXJlbmNlc1NlYXJjaFNlcnZpY2UsIElTZWFyY2hQcm92aWRlciwgTEFOR1VBR0VfU0VUVElOR19UQUcsIExMTV9SQU5LRURfU0VBUkNIX1BST1ZJREVSX05BTUUsIE1PRElGSUVEX1NFVFRJTkdfVEFHLCBQT0xJQ1lfU0VUVElOR19UQUcsIFJFUVVJUkVfVFJVU1RFRF9XT1JLU1BBQ0VfU0VUVElOR19UQUcsIFNFVFRJTkdTX0VESVRPUl9DT01NQU5EX0NMRUFSX1NFQVJDSF9SRVNVTFRTLCBTRVRUSU5HU19FRElUT1JfQ09NTUFORF9TSE9XX0FJX1JFU1VMVFMsIFNFVFRJTkdTX0VESVRPUl9DT01NQU5EX1NVR0dFU1RfRklMVEVSUywgU0VUVElOR1NfRURJVE9SX0NPTU1BTkRfVE9HR0xFX0FJX1NFQVJDSCwgU1RSSU5HX01BVENIX1NFQVJDSF9QUk9WSURFUl9OQU1FLCBURl9JREZfU0VBUkNIX1BST1ZJREVSX05BTUUsIFdvcmtiZW5jaFNldHRpbmdzRWRpdG9yU2V0dGluZ3MsIFdPUktTUEFDRV9UUlVTVF9TRVRUSU5HX1RBRyB9IGZyb20gJy4uL2NvbW1vbi9wcmVmZXJlbmNlcy5qcyc7XG5pbXBvcnQgeyBzZXR0aW5nc0hlYWRlckJvcmRlciwgc2V0dGluZ3NTYXNoQm9yZGVyLCBzZXR0aW5nc1RleHRJbnB1dEJvcmRlciB9IGZyb20gJy4uL2NvbW1vbi9zZXR0aW5nc0VkaXRvckNvbG9yUmVnaXN0cnkuanMnO1xuaW1wb3J0IHsgSVdvcmtiZW5jaEVudmlyb25tZW50U2VydmljZSB9IGZyb20gJy4uLy4uLy4uL3NlcnZpY2VzL2Vudmlyb25tZW50L2NvbW1vbi9lbnZpcm9ubWVudFNlcnZpY2UuanMnO1xuaW1wb3J0ICcuL21lZGlhL3NldHRpbmdzRWRpdG9yMi5jc3MnO1xuaW1wb3J0IHsgcHJlZmVyZW5jZXNBaVJlc3VsdHNJY29uLCBwcmVmZXJlbmNlc0NsZWFySW5wdXRJY29uLCBwcmVmZXJlbmNlc0ZpbHRlckljb24gfSBmcm9tICcuL3ByZWZlcmVuY2VzSWNvbnMuanMnO1xuaW1wb3J0IHsgU2V0dGluZ3NUYXJnZXQsIFNldHRpbmdzVGFyZ2V0c1dpZGdldCB9IGZyb20gJy4vcHJlZmVyZW5jZXNXaWRnZXRzLmpzJztcbmltcG9ydCB7IElTZXR0aW5nT3ZlcnJpZGVDbGlja0V2ZW50IH0gZnJvbSAnLi9zZXR0aW5nc0VkaXRvclNldHRpbmdJbmRpY2F0b3JzLmpzJztcbmltcG9ydCB7IGdldENvbW1vbmx5VXNlZERhdGEsIElUT0NFbnRyeSwgdG9jRGF0YSB9IGZyb20gJy4vc2V0dGluZ3NMYXlvdXQuanMnO1xuaW1wb3J0IHsgU2V0dGluZ3NTZWFyY2hGaWx0ZXJEcm9wZG93bk1lbnVBY3Rpb25WaWV3SXRlbSB9IGZyb20gJy4vc2V0dGluZ3NTZWFyY2hNZW51LmpzJztcbmltcG9ydCB7IEFic3RyYWN0U2V0dGluZ1JlbmRlcmVyLCBjcmVhdGVUb2NUcmVlRm9yRXh0ZW5zaW9uU2V0dGluZ3MsIEhlaWdodENoYW5nZVBhcmFtcywgSVNldHRpbmdMaW5rQ2xpY2tFdmVudCwgcmVzb2x2ZUNvbmZpZ3VyZWRVbnRydXN0ZWRTZXR0aW5ncywgcmVzb2x2ZVNldHRpbmdzVHJlZSwgU2V0dGluZ3NUcmVlLCBTZXR0aW5nVHJlZVJlbmRlcmVycyB9IGZyb20gJy4vc2V0dGluZ3NUcmVlLmpzJztcbmltcG9ydCB7IElTZXR0aW5nc0VkaXRvclZpZXdTdGF0ZSwgcGFyc2VRdWVyeSwgU2VhcmNoUmVzdWx0SWR4LCBTZWFyY2hSZXN1bHRNb2RlbCwgU2V0dGluZ3NUcmVlRWxlbWVudCwgU2V0dGluZ3NUcmVlR3JvdXBDaGlsZCwgU2V0dGluZ3NUcmVlR3JvdXBFbGVtZW50LCBTZXR0aW5nc1RyZWVNb2RlbCwgU2V0dGluZ3NUcmVlU2V0dGluZ0VsZW1lbnQgfSBmcm9tICcuL3NldHRpbmdzVHJlZU1vZGVscy5qcyc7XG5pbXBvcnQgeyBjcmVhdGVUT0NJdGVyYXRvciwgVE9DVHJlZSwgVE9DVHJlZU1vZGVsIH0gZnJvbSAnLi90b2NUcmVlLmpzJztcblxuZXhwb3J0IGNvbnN0IGVudW0gU2V0dGluZ3NGb2N1c0NvbnRleHQge1xuXHRTZWFyY2gsXG5cdFRhYmxlT2ZDb250ZW50cyxcblx0U2V0dGluZ1RyZWUsXG5cdFNldHRpbmdDb250cm9sXG59XG5cbmV4cG9ydCBmdW5jdGlvbiBjcmVhdGVHcm91cEl0ZXJhdG9yKGdyb3VwOiBTZXR0aW5nc1RyZWVHcm91cEVsZW1lbnQpOiBJdGVyYWJsZTxJVHJlZUVsZW1lbnQ8U2V0dGluZ3NUcmVlR3JvdXBDaGlsZD4+IHtcblx0cmV0dXJuIEl0ZXJhYmxlLm1hcChncm91cC5jaGlsZHJlbiwgZyA9PiB7XG5cdFx0cmV0dXJuIHtcblx0XHRcdGVsZW1lbnQ6IGcsXG5cdFx0XHRjaGlsZHJlbjogZyBpbnN0YW5jZW9mIFNldHRpbmdzVHJlZUdyb3VwRWxlbWVudCA/XG5cdFx0XHRcdGNyZWF0ZUdyb3VwSXRlcmF0b3IoZykgOlxuXHRcdFx0XHR1bmRlZmluZWRcblx0XHR9O1xuXHR9KTtcbn1cblxuLyoqXG4gKiBXaGV0aGVyIFNldHRpbmdzIHNlYXJjaCByZXN1bHRzIGFyZSBzYWZlIHRvIGZvY3VzIGZyb20gdGhlIHNlYXJjaCBpbnB1dC5cbiAqIGBzZWFyY2hQZW5kaW5nYCBtdXN0IGJlIHRoZSBib29sZWFuIGZyb20ge0BsaW5rIERlbGF5ZXIuaXNUcmlnZ2VyZWR9IChjYWxsIHRoZSBtZXRob2QgXHUyMDE0XG4gKiBhIGJhcmUgbWV0aG9kIHJlZmVyZW5jZSBpcyBhbHdheXMgdHJ1dGh5IGFuZCB3b3VsZCBpbmNvcnJlY3RseSBibG9jayBmb2N1cyBmb3JldmVyKS5cbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIGlzU2V0dGluZ3NTZWFyY2hVcFRvRGF0ZShzZWFyY2hQZW5kaW5nOiBib29sZWFuLCByZW5kZXJlZFNlYXJjaFF1ZXJ5OiBzdHJpbmcgfCB1bmRlZmluZWQsIGN1cnJlbnRTZWFyY2hWYWx1ZTogc3RyaW5nKTogYm9vbGVhbiB7XG5cdHJldHVybiAhc2VhcmNoUGVuZGluZyAmJiByZW5kZXJlZFNlYXJjaFF1ZXJ5ID09PSBjdXJyZW50U2VhcmNoVmFsdWUudHJpbSgpO1xufVxuXG5jb25zdCAkID0gRE9NLiQ7XG5cbmNvbnN0IHNlYXJjaEJveExhYmVsID0gbG9jYWxpemUoJ1NlYXJjaFNldHRpbmdzLkFyaWFMYWJlbCcsIFwiU2VhcmNoIHNldHRpbmdzXCIpO1xuY29uc3Qgc2VhcmNoQm94UGxhY2Vob2xkZXJXaXRoSGlzdG9yeSA9IGxvY2FsaXplKHtcblx0a2V5OiAnU2VhcmNoU2V0dGluZ3MuUGxhY2Vob2xkZXJXaXRoSGlzdG9yeScsXG5cdGNvbW1lbnQ6IFsnUGxhY2Vob2xkZXIgZm9yIHRoZSBzZXR0aW5ncyBzZWFyY2ggaW5wdXQgaGludGluZyB0aGF0IHRoZSB1cCBhbmQgZG93biBhcnJvdyBrZXlzIG5hdmlnYXRlIHRoZSBzZWFyY2ggaGlzdG9yeS4gVGhlIGNoYXJhY3RlciBpbnNlcnRlZCBmb3IgezB9IGlzIFxcdTIxQzUgdG8gcmVwcmVzZW50IHRoZSB1cCBhbmQgZG93biBhcnJvdyBrZXlzLiddXG59LCBcIlNlYXJjaCBzZXR0aW5ncyAoezB9IGZvciBoaXN0b3J5KVwiLCAnXFx1MjFDNScpO1xuY29uc3QgU0VBUkNIX1RPQ19CRUhBVklPUl9LRVkgPSAnd29ya2JlbmNoLnNldHRpbmdzLnNldHRpbmdzU2VhcmNoVG9jQmVoYXZpb3InO1xuXG5jb25zdCBTSE9XX0FJX1JFU1VMVFNfRU5BQkxFRF9MQUJFTCA9IGxvY2FsaXplKCdzaG93QWlSZXN1bHRzRW5hYmxlZCcsIFwiU2hvdyBBSS1yZWNvbW1lbmRlZCByZXN1bHRzXCIpO1xuY29uc3QgU0hPV19BSV9SRVNVTFRTX0RJU0FCTEVEX0xBQkVMID0gbG9jYWxpemUoJ3Nob3dBaVJlc3VsdHNEaXNhYmxlZCcsIFwiTm8gQUkgcmVzdWx0cyBhdmFpbGFibGUgYXQgdGhpcyB0aW1lLi4uXCIpO1xuXG5jb25zdCBTRVRUSU5HU19FRElUT1JfU1RBVEVfS0VZID0gJ3NldHRpbmdzRWRpdG9yU3RhdGUnO1xuXG5leHBvcnQgY2xhc3MgU2V0dGluZ3NFZGl0b3IyIGV4dGVuZHMgRWRpdG9yUGFuZSB7XG5cblx0c3RhdGljIHJlYWRvbmx5IElEOiBzdHJpbmcgPSAnd29ya2JlbmNoLmVkaXRvci5zZXR0aW5nczInO1xuXHRwcml2YXRlIHN0YXRpYyBOVU1fSU5TVEFOQ0VTOiBudW1iZXIgPSAwO1xuXHRwcml2YXRlIHN0YXRpYyBTRUFSQ0hfREVCT1VOQ0U6IG51bWJlciA9IDIwMDtcblx0cHJpdmF0ZSBzdGF0aWMgU0VUVElOR19VUERBVEVfRkFTVF9ERUJPVU5DRTogbnVtYmVyID0gMjAwO1xuXHRwcml2YXRlIHN0YXRpYyBTRVRUSU5HX1VQREFURV9TTE9XX0RFQk9VTkNFOiBudW1iZXIgPSAxMDAwO1xuXHRwcml2YXRlIHN0YXRpYyBDT05GSUdfU0NIRU1BX1VQREFURV9ERUxBWUVSID0gNTAwO1xuXHRwcml2YXRlIHN0YXRpYyBUT0NfTUlOX1dJRFRIOiBudW1iZXIgPSAxMDA7XG5cdHByaXZhdGUgc3RhdGljIFRPQ19SRVNFVF9XSURUSDogbnVtYmVyID0gMjAwO1xuXHRwcml2YXRlIHN0YXRpYyBFRElUT1JfTUlOX1dJRFRIOiBudW1iZXIgPSA1MDA7XG5cdC8vIEJlbG93IE5BUlJPV19UT1RBTF9XSURUSCwgd2Ugb25seSByZW5kZXIgdGhlIGVkaXRvciByYXRoZXIgdGhhbiB0aGUgVG9DLlxuXHRwcml2YXRlIHN0YXRpYyBOQVJST1dfVE9UQUxfV0lEVEg6IG51bWJlciA9IHRoaXMuVE9DX1JFU0VUX1dJRFRIICsgdGhpcy5FRElUT1JfTUlOX1dJRFRIO1xuXG5cdHByaXZhdGUgc3RhdGljIFNVR0dFU1RJT05TOiBzdHJpbmdbXSA9IFtcblx0XHRgQCR7TU9ESUZJRURfU0VUVElOR19UQUd9YCxcblx0XHQnQHRhZzpub3RlYm9va0xheW91dCcsXG5cdFx0J0B0YWc6bm90ZWJvb2tPdXRwdXRMYXlvdXQnLFxuXHRcdGBAdGFnOiR7UkVRVUlSRV9UUlVTVEVEX1dPUktTUEFDRV9TRVRUSU5HX1RBR31gLFxuXHRcdGBAdGFnOiR7V09SS1NQQUNFX1RSVVNUX1NFVFRJTkdfVEFHfWAsXG5cdFx0J0B0YWc6c3luYycsXG5cdFx0J0B0YWc6dXNlc09ubGluZVNlcnZpY2VzJyxcblx0XHQnQHRhZzp0ZWxlbWV0cnknLFxuXHRcdCdAdGFnOmFjY2Vzc2liaWxpdHknLFxuXHRcdCdAdGFnOnByZXZpZXcnLFxuXHRcdCdAdGFnOmV4cGVyaW1lbnRhbCcsXG5cdFx0YEB0YWc6JHtBRFZBTkNFRF9TRVRUSU5HX1RBR31gLFxuXHRcdGBAJHtJRF9TRVRUSU5HX1RBR31gLFxuXHRcdGBAJHtFWFRFTlNJT05fU0VUVElOR19UQUd9YCxcblx0XHRgQCR7RkVBVFVSRV9TRVRUSU5HX1RBR31zY21gLFxuXHRcdGBAJHtGRUFUVVJFX1NFVFRJTkdfVEFHfWV4cGxvcmVyYCxcblx0XHRgQCR7RkVBVFVSRV9TRVRUSU5HX1RBR31zZWFyY2hgLFxuXHRcdGBAJHtGRUFUVVJFX1NFVFRJTkdfVEFHfWRlYnVnYCxcblx0XHRgQCR7RkVBVFVSRV9TRVRUSU5HX1RBR31leHRlbnNpb25zYCxcblx0XHRgQCR7RkVBVFVSRV9TRVRUSU5HX1RBR310ZXJtaW5hbGAsXG5cdFx0YEAke0ZFQVRVUkVfU0VUVElOR19UQUd9dGFza2AsXG5cdFx0YEAke0ZFQVRVUkVfU0VUVElOR19UQUd9cHJvYmxlbXNgLFxuXHRcdGBAJHtGRUFUVVJFX1NFVFRJTkdfVEFHfW91dHB1dGAsXG5cdFx0YEAke0ZFQVRVUkVfU0VUVElOR19UQUd9Y29tbWVudHNgLFxuXHRcdGBAJHtGRUFUVVJFX1NFVFRJTkdfVEFHfXJlbW90ZWAsXG5cdFx0YEAke0ZFQVRVUkVfU0VUVElOR19UQUd9dGltZWxpbmVgLFxuXHRcdGBAJHtGRUFUVVJFX1NFVFRJTkdfVEFHfW5vdGVib29rYCxcblx0XHRgQCR7RkVBVFVSRV9TRVRUSU5HX1RBR31jaGF0YCxcblx0XHRgQCR7UE9MSUNZX1NFVFRJTkdfVEFHfWBcblx0XTtcblxuXHRwcml2YXRlIHN0YXRpYyBzaG91bGRTZXR0aW5nVXBkYXRlRmFzdCh0eXBlOiBTZXR0aW5nVmFsdWVUeXBlIHwgU2V0dGluZ1ZhbHVlVHlwZVtdKTogYm9vbGVhbiB7XG5cdFx0aWYgKEFycmF5LmlzQXJyYXkodHlwZSkpIHtcblx0XHRcdC8vIG51bGxhYmxlIGludGVnZXIvbnVtYmVyIG9yIGNvbXBsZXhcblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cdFx0cmV0dXJuIHR5cGUgPT09IFNldHRpbmdWYWx1ZVR5cGUuRW51bSB8fFxuXHRcdFx0dHlwZSA9PT0gU2V0dGluZ1ZhbHVlVHlwZS5BcnJheSB8fFxuXHRcdFx0dHlwZSA9PT0gU2V0dGluZ1ZhbHVlVHlwZS5Cb29sZWFuT2JqZWN0IHx8XG5cdFx0XHR0eXBlID09PSBTZXR0aW5nVmFsdWVUeXBlLk9iamVjdCB8fFxuXHRcdFx0dHlwZSA9PT0gU2V0dGluZ1ZhbHVlVHlwZS5Db21wbGV4IHx8XG5cdFx0XHR0eXBlID09PSBTZXR0aW5nVmFsdWVUeXBlLkJvb2xlYW4gfHxcblx0XHRcdHR5cGUgPT09IFNldHRpbmdWYWx1ZVR5cGUuRXhjbHVkZSB8fFxuXHRcdFx0dHlwZSA9PT0gU2V0dGluZ1ZhbHVlVHlwZS5JbmNsdWRlO1xuXHR9XG5cblx0Ly8gKCEpIExvdHMgb2YgcHJvcHMgdGhhdCBhcmUgc2V0IG9uY2Ugb24gdGhlIGZpcnN0IHJlbmRlclxuXHRwcml2YXRlIGRlZmF1bHRTZXR0aW5nc0VkaXRvck1vZGVsITogU2V0dGluZ3MyRWRpdG9yTW9kZWw7XG5cdHByaXZhdGUgcmVhZG9ubHkgbW9kZWxEaXNwb3NhYmxlczogRGlzcG9zYWJsZVN0b3JlO1xuXG5cdHByaXZhdGUgcm9vdEVsZW1lbnQhOiBIVE1MRWxlbWVudDtcblx0cHJpdmF0ZSBoZWFkZXJDb250YWluZXIhOiBIVE1MRWxlbWVudDtcblx0cHJpdmF0ZSBzZWFyY2hDb250YWluZXI6IEhUTUxFbGVtZW50IHwgbnVsbCA9IG51bGw7XG5cdHByaXZhdGUgYm9keUNvbnRhaW5lciE6IEhUTUxFbGVtZW50O1xuXHRwcml2YXRlIHNlYXJjaFdpZGdldCE6IFN1Z2dlc3RFbmFibGVkSW5wdXRXaXRoSGlzdG9yeTtcblx0cHJpdmF0ZSBjb3VudEVsZW1lbnQhOiBIVE1MRWxlbWVudDtcblx0cHJpdmF0ZSBjb250cm9sc0VsZW1lbnQhOiBIVE1MRWxlbWVudDtcblx0cHJpdmF0ZSBzZXR0aW5nc1RhcmdldHNXaWRnZXQhOiBTZXR0aW5nc1RhcmdldHNXaWRnZXQ7XG5cblx0cHJpdmF0ZSBzcGxpdFZpZXchOiBTcGxpdFZpZXc8bnVtYmVyPjtcblxuXHRwcml2YXRlIHNldHRpbmdzVHJlZUNvbnRhaW5lciE6IEhUTUxFbGVtZW50O1xuXHRwcml2YXRlIHNldHRpbmdzVHJlZSE6IFNldHRpbmdzVHJlZTtcblx0cHJpdmF0ZSBzZXR0aW5nUmVuZGVyZXJzITogU2V0dGluZ1RyZWVSZW5kZXJlcnM7XG5cdHByaXZhdGUgdG9jVHJlZU1vZGVsITogVE9DVHJlZU1vZGVsO1xuXHRwcml2YXRlIHJlYWRvbmx5IHNldHRpbmdzVHJlZU1vZGVsID0gdGhpcy5fcmVnaXN0ZXIobmV3IE11dGFibGVEaXNwb3NhYmxlPFNldHRpbmdzVHJlZU1vZGVsPigpKTtcblx0cHJpdmF0ZSBub1Jlc3VsdHNNZXNzYWdlITogSFRNTEVsZW1lbnQ7XG5cdHByaXZhdGUgY2xlYXJGaWx0ZXJMaW5rQ29udGFpbmVyITogSFRNTEVsZW1lbnQ7XG5cblx0cHJpdmF0ZSB0b2NUcmVlQ29udGFpbmVyITogSFRNTEVsZW1lbnQ7XG5cdHByaXZhdGUgdG9jVHJlZSE6IFRPQ1RyZWU7XG5cblx0cHJpdmF0ZSBzZWFyY2hEZWxheWVyOiBEZWxheWVyPHZvaWQ+O1xuXHRwcml2YXRlIHNlYXJjaEluUHJvZ3Jlc3M6IENhbmNlbGxhdGlvblRva2VuU291cmNlIHwgbnVsbCA9IG51bGw7XG5cdHByaXZhdGUgYWlTZWFyY2hQcm9taXNlOiBDYW5jZWxhYmxlUHJvbWlzZTx2b2lkPiB8IG51bGwgPSBudWxsO1xuXG5cdC8qKlxuXHQgKiBUaGUgdHJpbW1lZCBxdWVyeSB2YWx1ZSB0aGF0IHRoZSBjdXJyZW50bHkgcmVuZGVyZWQgcmVzdWx0cyByZWZsZWN0LiBVc2VkIHRvIGRldGVybWluZVxuXHQgKiB3aGV0aGVyIHRoZSBkaXNwbGF5ZWQgcmVzdWx0cyBhcmUgdXAgdG8gZGF0ZSB3aXRoIHRoZSBjdXJyZW50IHNlYXJjaCBpbnB1dCB2YWx1ZSBiZWZvcmVcblx0ICogbW92aW5nIGZvY3VzIGludG8gdGhlIHJlc3VsdHMuXG5cdCAqL1xuXHRwcml2YXRlIHJlbmRlcmVkU2VhcmNoUXVlcnk6IHN0cmluZyB8IHVuZGVmaW5lZCA9ICcnO1xuXG5cdHByaXZhdGUgc2hvd0FpUmVzdWx0c0FjdGlvbjogQWN0aW9uIHwgbnVsbCA9IG51bGw7XG5cblx0cHJpdmF0ZSBzZWFyY2hJbnB1dERlbGF5ZXI6IERlbGF5ZXI8dm9pZD47XG5cdHByaXZhdGUgdXBkYXRlZENvbmZpZ1NjaGVtYURlbGF5ZXI6IERlbGF5ZXI8dm9pZD47XG5cblx0cHJpdmF0ZSBzZXR0aW5nRmFzdFVwZGF0ZURlbGF5ZXI6IERlbGF5ZXI8dm9pZD47XG5cdHByaXZhdGUgc2V0dGluZ1Nsb3dVcGRhdGVEZWxheWVyOiBEZWxheWVyPHZvaWQ+O1xuXHRwcml2YXRlIHBlbmRpbmdTZXR0aW5nVXBkYXRlOiB7IGtleTogc3RyaW5nOyB2YWx1ZTogdW5rbm93bjsgbGFuZ3VhZ2VGaWx0ZXI6IHN0cmluZyB8IHVuZGVmaW5lZCB9IHwgbnVsbCA9IG51bGw7XG5cblx0cHJpdmF0ZSByZWFkb25seSB2aWV3U3RhdGU6IElTZXR0aW5nc0VkaXRvclZpZXdTdGF0ZTtcblx0cHJpdmF0ZSByZWFkb25seSBfc2VhcmNoUmVzdWx0TW9kZWwgPSB0aGlzLl9yZWdpc3RlcihuZXcgTXV0YWJsZURpc3Bvc2FibGU8U2VhcmNoUmVzdWx0TW9kZWw+KCkpO1xuXHRwcml2YXRlIHNlYXJjaFJlc3VsdExhYmVsOiBzdHJpbmcgfCBudWxsID0gbnVsbDtcblx0cHJpdmF0ZSBsYXN0U3luY2VkTGFiZWw6IHN0cmluZyB8IG51bGwgPSBudWxsO1xuXHRwcml2YXRlIHNldHRpbmdzT3JkZXJCeVRvY0luZGV4OiBNYXA8c3RyaW5nLCBudW1iZXI+IHwgbnVsbCA9IG51bGw7XG5cblx0cHJpdmF0ZSB0b2NSb3dGb2N1c2VkOiBJQ29udGV4dEtleTxib29sZWFuPjtcblx0cHJpdmF0ZSBzZXR0aW5nUm93Rm9jdXNlZDogSUNvbnRleHRLZXk8Ym9vbGVhbj47XG5cdHByaXZhdGUgc2V0dGluZ0ZpcnN0Um93Rm9jdXNlZDogSUNvbnRleHRLZXk8Ym9vbGVhbj47XG5cdHByaXZhdGUgaW5TZXR0aW5nc0VkaXRvckNvbnRleHRLZXk6IElDb250ZXh0S2V5PGJvb2xlYW4+O1xuXHRwcml2YXRlIHNlYXJjaEZvY3VzQ29udGV4dEtleTogSUNvbnRleHRLZXk8Ym9vbGVhbj47XG5cdHByaXZhdGUgYWlSZXN1bHRzQXZhaWxhYmxlOiBJQ29udGV4dEtleTxib29sZWFuPjtcblxuXHRwcml2YXRlIHNjaGVkdWxlZFJlZnJlc2hlczogTWFwPHN0cmluZywgRGlzcG9zYWJsZVN0b3JlPjtcblx0cHJpdmF0ZSBfY3VycmVudEZvY3VzQ29udGV4dDogU2V0dGluZ3NGb2N1c0NvbnRleHQgPSBTZXR0aW5nc0ZvY3VzQ29udGV4dC5TZWFyY2g7XG5cblx0LyoqIERvbid0IHNwYW0gd2FybmluZ3MgKi9cblx0cHJpdmF0ZSBoYXNXYXJuZWRNaXNzaW5nU2V0dGluZ3MgPSBmYWxzZTtcblx0cHJpdmF0ZSB0b2NUcmVlRGlzcG9zZWQgPSBmYWxzZTtcblxuXHQvKiogUGVyc2lzdCB0aGUgc2VhcmNoIHF1ZXJ5IHVwb24gcmVsb2FkcyAqL1xuXHRwcml2YXRlIGVkaXRvck1lbWVudG86IElFZGl0b3JNZW1lbnRvPElTZXR0aW5nc0VkaXRvcjJTdGF0ZT47XG5cblx0cHJpdmF0ZSB0b2NGb2N1c2VkRWxlbWVudDogU2V0dGluZ3NUcmVlR3JvdXBFbGVtZW50IHwgbnVsbCA9IG51bGw7XG5cdHByaXZhdGUgdHJlZUZvY3VzZWRFbGVtZW50OiBTZXR0aW5nc1RyZWVFbGVtZW50IHwgbnVsbCA9IG51bGw7XG5cdHByaXZhdGUgc2V0dGluZ3NUcmVlU2Nyb2xsVG9wID0gMDtcblx0cHJpdmF0ZSBkaW1lbnNpb24hOiBET00uRGltZW5zaW9uO1xuXG5cdHByaXZhdGUgaW5zdGFsbGVkRXh0ZW5zaW9uSWRzOiBzdHJpbmdbXSA9IFtdO1xuXHRwcml2YXRlIGRpc21pc3NlZEV4dGVuc2lvblNldHRpbmdzOiBzdHJpbmdbXSA9IFtdO1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgRElTTUlTU0VEX0VYVEVOU0lPTl9TRVRUSU5HU19TVE9SQUdFX0tFWSA9ICdzZXR0aW5nc0VkaXRvcjIuZGlzbWlzc2VkRXh0ZW5zaW9uU2V0dGluZ3MnO1xuXHRwcml2YXRlIHJlYWRvbmx5IERJU01JU1NFRF9FWFRFTlNJT05fU0VUVElOR1NfREVMSU1JVEVSID0gJ1xcdCc7XG5cblx0cHJpdmF0ZSByZWFkb25seSBTRUFSQ0hfSElTVE9SWV9TVE9SQUdFX0tFWSA9ICdzZXR0aW5nc0VkaXRvcjIuc2VhcmNoSGlzdG9yeSc7XG5cblx0cHJpdmF0ZSByZWFkb25seSBpbnB1dENoYW5nZUxpc3RlbmVyOiBNdXRhYmxlRGlzcG9zYWJsZTxJRGlzcG9zYWJsZT47XG5cblx0cHJpdmF0ZSBzZWFyY2hJbnB1dEFjdGlvbkJhcjogQWN0aW9uQmFyIHwgbnVsbCA9IG51bGw7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0Z3JvdXA6IElFZGl0b3JHcm91cCxcblx0XHRASVRlbGVtZXRyeVNlcnZpY2UgdGVsZW1ldHJ5U2VydmljZTogSVRlbGVtZXRyeVNlcnZpY2UsXG5cdFx0QElXb3JrYmVuY2hDb25maWd1cmF0aW9uU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGNvbmZpZ3VyYXRpb25TZXJ2aWNlOiBJV29ya2JlbmNoQ29uZmlndXJhdGlvblNlcnZpY2UsXG5cdFx0QElUZXh0UmVzb3VyY2VDb25maWd1cmF0aW9uU2VydmljZSB0ZXh0UmVzb3VyY2VDb25maWd1cmF0aW9uU2VydmljZTogSVRleHRSZXNvdXJjZUNvbmZpZ3VyYXRpb25TZXJ2aWNlLFxuXHRcdEBJVGhlbWVTZXJ2aWNlIHRoZW1lU2VydmljZTogSVRoZW1lU2VydmljZSxcblx0XHRASVByZWZlcmVuY2VzU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IHByZWZlcmVuY2VzU2VydmljZTogSVByZWZlcmVuY2VzU2VydmljZSxcblx0XHRASUluc3RhbnRpYXRpb25TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgaW5zdGFudGlhdGlvblNlcnZpY2U6IElJbnN0YW50aWF0aW9uU2VydmljZSxcblx0XHRASVByZWZlcmVuY2VzU2VhcmNoU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IHByZWZlcmVuY2VzU2VhcmNoU2VydmljZTogSVByZWZlcmVuY2VzU2VhcmNoU2VydmljZSxcblx0XHRASUxvZ1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBsb2dTZXJ2aWNlOiBJTG9nU2VydmljZSxcblx0XHRASUNvbnRleHRLZXlTZXJ2aWNlIGNvbnRleHRLZXlTZXJ2aWNlOiBJQ29udGV4dEtleVNlcnZpY2UsXG5cdFx0QElTdG9yYWdlU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IHN0b3JhZ2VTZXJ2aWNlOiBJU3RvcmFnZVNlcnZpY2UsXG5cdFx0QElFZGl0b3JHcm91cHNTZXJ2aWNlIHByb3RlY3RlZCBlZGl0b3JHcm91cFNlcnZpY2U6IElFZGl0b3JHcm91cHNTZXJ2aWNlLFxuXHRcdEBJVXNlckRhdGFTeW5jV29ya2JlbmNoU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IHVzZXJEYXRhU3luY1dvcmtiZW5jaFNlcnZpY2U6IElVc2VyRGF0YVN5bmNXb3JrYmVuY2hTZXJ2aWNlLFxuXHRcdEBJVXNlckRhdGFTeW5jRW5hYmxlbWVudFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSB1c2VyRGF0YVN5bmNFbmFibGVtZW50U2VydmljZTogSVVzZXJEYXRhU3luY0VuYWJsZW1lbnRTZXJ2aWNlLFxuXHRcdEBJV29ya3NwYWNlVHJ1c3RNYW5hZ2VtZW50U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IHdvcmtzcGFjZVRydXN0TWFuYWdlbWVudFNlcnZpY2U6IElXb3Jrc3BhY2VUcnVzdE1hbmFnZW1lbnRTZXJ2aWNlLFxuXHRcdEBJRXh0ZW5zaW9uU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGV4dGVuc2lvblNlcnZpY2U6IElFeHRlbnNpb25TZXJ2aWNlLFxuXHRcdEBJTGFuZ3VhZ2VTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgbGFuZ3VhZ2VTZXJ2aWNlOiBJTGFuZ3VhZ2VTZXJ2aWNlLFxuXHRcdEBJRXh0ZW5zaW9uTWFuYWdlbWVudFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBleHRlbnNpb25NYW5hZ2VtZW50U2VydmljZTogSUV4dGVuc2lvbk1hbmFnZW1lbnRTZXJ2aWNlLFxuXHRcdEBJUHJvZHVjdFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBwcm9kdWN0U2VydmljZTogSVByb2R1Y3RTZXJ2aWNlLFxuXHRcdEBJRXh0ZW5zaW9uR2FsbGVyeVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBleHRlbnNpb25HYWxsZXJ5U2VydmljZTogSUV4dGVuc2lvbkdhbGxlcnlTZXJ2aWNlLFxuXHRcdEBJRWRpdG9yUHJvZ3Jlc3NTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgZWRpdG9yUHJvZ3Jlc3NTZXJ2aWNlOiBJRWRpdG9yUHJvZ3Jlc3NTZXJ2aWNlLFxuXHRcdEBJVXNlckRhdGFQcm9maWxlU2VydmljZSB1c2VyRGF0YVByb2ZpbGVTZXJ2aWNlOiBJVXNlckRhdGFQcm9maWxlU2VydmljZSxcblx0XHRASUtleWJpbmRpbmdTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkga2V5YmluZGluZ1NlcnZpY2U6IElLZXliaW5kaW5nU2VydmljZSxcblx0XHRASUNoYXRFbnRpdGxlbWVudFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBjaGF0RW50aXRsZW1lbnRTZXJ2aWNlOiBJQ2hhdEVudGl0bGVtZW50U2VydmljZSxcblx0XHRASVdvcmtiZW5jaEVudmlyb25tZW50U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGVudmlyb25tZW50U2VydmljZTogSVdvcmtiZW5jaEVudmlyb25tZW50U2VydmljZSxcblx0KSB7XG5cdFx0c3VwZXIoU2V0dGluZ3NFZGl0b3IyLklELCBncm91cCwgdGVsZW1ldHJ5U2VydmljZSwgdGhlbWVTZXJ2aWNlLCBzdG9yYWdlU2VydmljZSk7XG5cdFx0dGhpcy5zZWFyY2hEZWxheWVyID0gdGhpcy5fcmVnaXN0ZXIobmV3IERlbGF5ZXIoMjAwKSk7XG5cdFx0dGhpcy52aWV3U3RhdGUgPSB7IHNldHRpbmdzVGFyZ2V0OiBDb25maWd1cmF0aW9uVGFyZ2V0LlVTRVJfTE9DQUwgfTtcblxuXHRcdHRoaXMuc2V0dGluZ0Zhc3RVcGRhdGVEZWxheWVyID0gdGhpcy5fcmVnaXN0ZXIobmV3IERlbGF5ZXI8dm9pZD4oU2V0dGluZ3NFZGl0b3IyLlNFVFRJTkdfVVBEQVRFX0ZBU1RfREVCT1VOQ0UpKTtcblx0XHR0aGlzLnNldHRpbmdTbG93VXBkYXRlRGVsYXllciA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBEZWxheWVyPHZvaWQ+KFNldHRpbmdzRWRpdG9yMi5TRVRUSU5HX1VQREFURV9TTE9XX0RFQk9VTkNFKSk7XG5cblx0XHR0aGlzLnNlYXJjaElucHV0RGVsYXllciA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBEZWxheWVyPHZvaWQ+KFNldHRpbmdzRWRpdG9yMi5TRUFSQ0hfREVCT1VOQ0UpKTtcblx0XHR0aGlzLnVwZGF0ZWRDb25maWdTY2hlbWFEZWxheWVyID0gdGhpcy5fcmVnaXN0ZXIobmV3IERlbGF5ZXI8dm9pZD4oU2V0dGluZ3NFZGl0b3IyLkNPTkZJR19TQ0hFTUFfVVBEQVRFX0RFTEFZRVIpKTtcblxuXHRcdHRoaXMuaW5TZXR0aW5nc0VkaXRvckNvbnRleHRLZXkgPSBDT05URVhUX1NFVFRJTkdTX0VESVRPUi5iaW5kVG8oY29udGV4dEtleVNlcnZpY2UpO1xuXHRcdHRoaXMuc2VhcmNoRm9jdXNDb250ZXh0S2V5ID0gQ09OVEVYVF9TRVRUSU5HU19TRUFSQ0hfRk9DVVMuYmluZFRvKGNvbnRleHRLZXlTZXJ2aWNlKTtcblx0XHR0aGlzLnRvY1Jvd0ZvY3VzZWQgPSBDT05URVhUX1RPQ19ST1dfRk9DVVMuYmluZFRvKGNvbnRleHRLZXlTZXJ2aWNlKTtcblx0XHR0aGlzLnNldHRpbmdSb3dGb2N1c2VkID0gQ09OVEVYVF9TRVRUSU5HU19ST1dfRk9DVVMuYmluZFRvKGNvbnRleHRLZXlTZXJ2aWNlKTtcblx0XHR0aGlzLnNldHRpbmdGaXJzdFJvd0ZvY3VzZWQgPSBDT05URVhUX1NFVFRJTkdTX0ZJUlNUX1JPV19GT0NVUy5iaW5kVG8oY29udGV4dEtleVNlcnZpY2UpO1xuXHRcdHRoaXMuYWlSZXN1bHRzQXZhaWxhYmxlID0gQ09OVEVYVF9BSV9TRVRUSU5HX1JFU1VMVFNfQVZBSUxBQkxFLmJpbmRUbyhjb250ZXh0S2V5U2VydmljZSk7XG5cblx0XHR0aGlzLnNjaGVkdWxlZFJlZnJlc2hlcyA9IG5ldyBNYXA8c3RyaW5nLCBEaXNwb3NhYmxlU3RvcmU+KCk7XG5cblx0XHR0aGlzLmVkaXRvck1lbWVudG8gPSB0aGlzLmdldEVkaXRvck1lbWVudG88SVNldHRpbmdzRWRpdG9yMlN0YXRlPihlZGl0b3JHcm91cFNlcnZpY2UsIHRleHRSZXNvdXJjZUNvbmZpZ3VyYXRpb25TZXJ2aWNlLCBTRVRUSU5HU19FRElUT1JfU1RBVEVfS0VZKTtcblxuXHRcdHRoaXMuZGlzbWlzc2VkRXh0ZW5zaW9uU2V0dGluZ3MgPSB0aGlzLnN0b3JhZ2VTZXJ2aWNlXG5cdFx0XHQuZ2V0KHRoaXMuRElTTUlTU0VEX0VYVEVOU0lPTl9TRVRUSU5HU19TVE9SQUdFX0tFWSwgU3RvcmFnZVNjb3BlLlBST0ZJTEUsICcnKVxuXHRcdFx0LnNwbGl0KHRoaXMuRElTTUlTU0VEX0VYVEVOU0lPTl9TRVRUSU5HU19ERUxJTUlURVIpO1xuXG5cdFx0dGhpcy5fcmVnaXN0ZXIoY29uZmlndXJhdGlvblNlcnZpY2Uub25EaWRDaGFuZ2VDb25maWd1cmF0aW9uKGUgPT4ge1xuXHRcdFx0aWYgKGUuYWZmZWN0ZWRLZXlzLmhhcyhXb3JrYmVuY2hTZXR0aW5nc0VkaXRvclNldHRpbmdzLlNob3dBSVNlYXJjaFRvZ2dsZSlcblx0XHRcdFx0fHwgZS5hZmZlY3RlZEtleXMuaGFzKFdvcmtiZW5jaFNldHRpbmdzRWRpdG9yU2V0dGluZ3MuRW5hYmxlTmF0dXJhbExhbmd1YWdlU2VhcmNoKSkge1xuXHRcdFx0XHR0aGlzLnVwZGF0ZUFpU2VhcmNoVG9nZ2xlVmlzaWJpbGl0eSgpO1xuXHRcdFx0fVxuXHRcdFx0aWYgKGUuYWZmZWN0c0NvbmZpZ3VyYXRpb24oQUxXQVlTX1NIT1dfQURWQU5DRURfU0VUVElOR1NfU0VUVElORykpIHtcblx0XHRcdFx0dGhpcy5vbkNvbmZpZ1VwZGF0ZSh1bmRlZmluZWQsIHRydWUsIHRydWUpO1xuXHRcdFx0fVxuXHRcdFx0aWYgKGUuc291cmNlICE9PSBDb25maWd1cmF0aW9uVGFyZ2V0LkRFRkFVTFQpIHtcblx0XHRcdFx0dGhpcy5vbkNvbmZpZ1VwZGF0ZShlLmFmZmVjdGVkS2V5cyk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXG5cdFx0dGhpcy5fcmVnaXN0ZXIoY2hhdEVudGl0bGVtZW50U2VydmljZS5vbkRpZENoYW5nZVNlbnRpbWVudCgoKSA9PiB7XG5cdFx0XHR0aGlzLnVwZGF0ZUFpU2VhcmNoVG9nZ2xlVmlzaWJpbGl0eSgpO1xuXHRcdH0pKTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKHVzZXJEYXRhUHJvZmlsZVNlcnZpY2Uub25EaWRDaGFuZ2VDdXJyZW50UHJvZmlsZShlID0+IHtcblx0XHRcdGUuam9pbih0aGlzLndoZW5DdXJyZW50UHJvZmlsZUNoYW5nZWQoKSk7XG5cdFx0fSkpO1xuXG5cdFx0dGhpcy5fcmVnaXN0ZXIod29ya3NwYWNlVHJ1c3RNYW5hZ2VtZW50U2VydmljZS5vbkRpZENoYW5nZVRydXN0KCgpID0+IHtcblx0XHRcdHRoaXMuc2VhcmNoUmVzdWx0TW9kZWw/LnVwZGF0ZVdvcmtzcGFjZVRydXN0KHdvcmtzcGFjZVRydXN0TWFuYWdlbWVudFNlcnZpY2UuaXNXb3Jrc3BhY2VUcnVzdGVkKCkpO1xuXG5cdFx0XHRpZiAodGhpcy5zZXR0aW5nc1RyZWVNb2RlbC52YWx1ZSkge1xuXHRcdFx0XHR0aGlzLnNldHRpbmdzVHJlZU1vZGVsLnZhbHVlLnVwZGF0ZVdvcmtzcGFjZVRydXN0KHdvcmtzcGFjZVRydXN0TWFuYWdlbWVudFNlcnZpY2UuaXNXb3Jrc3BhY2VUcnVzdGVkKCkpO1xuXHRcdFx0XHR0aGlzLnJlbmRlclRyZWUoKTtcblx0XHRcdH1cblx0XHR9KSk7XG5cblx0XHR0aGlzLl9yZWdpc3Rlcihjb25maWd1cmF0aW9uU2VydmljZS5vbkRpZENoYW5nZVJlc3RyaWN0ZWRTZXR0aW5ncyhlID0+IHtcblx0XHRcdGlmIChlLmRlZmF1bHQubGVuZ3RoICYmIHRoaXMuY3VycmVudFNldHRpbmdzTW9kZWwpIHtcblx0XHRcdFx0dGhpcy51cGRhdGVFbGVtZW50c0J5S2V5KG5ldyBTZXQoZS5kZWZhdWx0KSk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXG5cdFx0dGhpcy5fcmVnaXN0ZXIoZXh0ZW5zaW9uTWFuYWdlbWVudFNlcnZpY2Uub25EaWRJbnN0YWxsRXh0ZW5zaW9ucygoKSA9PiB7XG5cdFx0XHR0aGlzLnJlZnJlc2hJbnN0YWxsZWRFeHRlbnNpb25zTGlzdCgpO1xuXHRcdH0pKTtcblx0XHR0aGlzLl9yZWdpc3RlcihleHRlbnNpb25NYW5hZ2VtZW50U2VydmljZS5vbkRpZFVuaW5zdGFsbEV4dGVuc2lvbigoKSA9PiB7XG5cdFx0XHR0aGlzLnJlZnJlc2hJbnN0YWxsZWRFeHRlbnNpb25zTGlzdCgpO1xuXHRcdH0pKTtcblxuXHRcdHRoaXMubW9kZWxEaXNwb3NhYmxlcyA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBEaXNwb3NhYmxlU3RvcmUoKSk7XG5cblx0XHRpZiAoRU5BQkxFX0xBTkdVQUdFX0ZJTFRFUiAmJiAhU2V0dGluZ3NFZGl0b3IyLlNVR0dFU1RJT05TLmluY2x1ZGVzKGBAJHtMQU5HVUFHRV9TRVRUSU5HX1RBR31gKSkge1xuXHRcdFx0U2V0dGluZ3NFZGl0b3IyLlNVR0dFU1RJT05TLnB1c2goYEAke0xBTkdVQUdFX1NFVFRJTkdfVEFHfWApO1xuXHRcdH1cblx0XHRpZiAodGhpcy5lbnZpcm9ubWVudFNlcnZpY2UuaXNTZXNzaW9uc1dpbmRvdyAmJiAhU2V0dGluZ3NFZGl0b3IyLlNVR0dFU1RJT05TLmluY2x1ZGVzKGBAJHtBR0VOVFNfV0lORE9XX1NFVFRJTkdfVEFHfWApKSB7XG5cdFx0XHRTZXR0aW5nc0VkaXRvcjIuU1VHR0VTVElPTlMucHVzaChgQCR7QUdFTlRTX1dJTkRPV19TRVRUSU5HX1RBR31gKTtcblx0XHR9XG5cdFx0dGhpcy5pbnB1dENoYW5nZUxpc3RlbmVyID0gdGhpcy5fcmVnaXN0ZXIobmV3IE11dGFibGVEaXNwb3NhYmxlKCkpO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyB3aGVuQ3VycmVudFByb2ZpbGVDaGFuZ2VkKCk6IFByb21pc2U8dm9pZD4ge1xuXHRcdHRoaXMudXBkYXRlZENvbmZpZ1NjaGVtYURlbGF5ZXIudHJpZ2dlcigoKSA9PiB7XG5cdFx0XHR0aGlzLmRpc21pc3NlZEV4dGVuc2lvblNldHRpbmdzID0gdGhpcy5zdG9yYWdlU2VydmljZVxuXHRcdFx0XHQuZ2V0KHRoaXMuRElTTUlTU0VEX0VYVEVOU0lPTl9TRVRUSU5HU19TVE9SQUdFX0tFWSwgU3RvcmFnZVNjb3BlLlBST0ZJTEUsICcnKVxuXHRcdFx0XHQuc3BsaXQodGhpcy5ESVNNSVNTRURfRVhURU5TSU9OX1NFVFRJTkdTX0RFTElNSVRFUik7XG5cdFx0XHR0aGlzLm9uQ29uZmlnVXBkYXRlKHVuZGVmaW5lZCwgdHJ1ZSk7XG5cdFx0fSk7XG5cdH1cblxuXHRwcml2YXRlIGNhblNob3dBZHZhbmNlZFNldHRpbmdzKCk6IGJvb2xlYW4ge1xuXHRcdGlmICh0aGlzLmNvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldFZhbHVlPGJvb2xlYW4+KEFMV0FZU19TSE9XX0FEVkFOQ0VEX1NFVFRJTkdTX1NFVFRJTkcpID8/IGZhbHNlKSB7XG5cdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHR9XG5cdFx0cmV0dXJuIHRoaXMudmlld1N0YXRlLnRhZ0ZpbHRlcnM/LmhhcyhBRFZBTkNFRF9TRVRUSU5HX1RBRykgPz8gZmFsc2U7XG5cdH1cblxuXHQvKipcblx0ICogRGV0ZXJtaW5lcyB3aGV0aGVyIGEgc2V0dGluZyBzaG91bGQgYmUgc2hvd24gZXZlbiB3aGVuIGFkdmFuY2VkIHNldHRpbmdzIGFyZSBmaWx0ZXJlZCBvdXQuXG5cdCAqIFJldHVybnMgdHJ1ZSBpZjpcblx0ICogLSBUaGUgc2V0dGluZyBpcyBub3QgdGFnZ2VkIGFzIGFkdmFuY2VkLCBPUlxuXHQgKiAtIFRoZSBzZXR0aW5nIG1hdGNoZXMgYW4gSUQgZmlsdGVyIChAaWQ6c2V0dGluZ0tleSksIE9SXG5cdCAqIC0gVGhlIHNldHRpbmcga2V5IGFwcGVhcnMgaW4gdGhlIHNlYXJjaCBxdWVyeSwgT1Jcblx0ICogLSBUaGUgQGhhc1BvbGljeSBmaWx0ZXIgaXMgYWN0aXZlIChwb2xpY3kgc2V0dGluZ3Mgc2hvdWxkIGFsd2F5cyBiZSBzaG93biB3aGVuIGZpbHRlcmluZyBieSBwb2xpY3kpXG5cdCAqL1xuXHRwcml2YXRlIHNob3VsZFNob3dTZXR0aW5nKHNldHRpbmc6IElTZXR0aW5nKTogYm9vbGVhbiB7XG5cdFx0aWYgKCFzZXR0aW5nLnRhZ3M/LmluY2x1ZGVzKEFEVkFOQ0VEX1NFVFRJTkdfVEFHKSkge1xuXHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0fVxuXHRcdGlmICh0aGlzLnZpZXdTdGF0ZS5pZEZpbHRlcnM/LmhhcyhzZXR0aW5nLmtleSkpIHtcblx0XHRcdHJldHVybiB0cnVlO1xuXHRcdH1cblx0XHRpZiAodGhpcy52aWV3U3RhdGUucXVlcnk/LnRvTG93ZXJDYXNlKCkuaW5jbHVkZXMoc2V0dGluZy5rZXkudG9Mb3dlckNhc2UoKSkpIHtcblx0XHRcdHJldHVybiB0cnVlO1xuXHRcdH1cblx0XHRpZiAodGhpcy52aWV3U3RhdGUudGFnRmlsdGVycz8uaGFzKFBPTElDWV9TRVRUSU5HX1RBRykpIHtcblx0XHRcdHJldHVybiB0cnVlO1xuXHRcdH1cblx0XHRyZXR1cm4gZmFsc2U7XG5cdH1cblxuXHRwcml2YXRlIGRpc2FibGVBaVNlYXJjaFRvZ2dsZSgpOiB2b2lkIHtcblx0XHRpZiAodGhpcy5zaG93QWlSZXN1bHRzQWN0aW9uKSB7XG5cdFx0XHR0aGlzLnNob3dBaVJlc3VsdHNBY3Rpb24uY2hlY2tlZCA9IGZhbHNlO1xuXHRcdFx0dGhpcy5zaG93QWlSZXN1bHRzQWN0aW9uLmVuYWJsZWQgPSBmYWxzZTtcblx0XHRcdHRoaXMuYWlSZXN1bHRzQXZhaWxhYmxlLnNldChmYWxzZSk7XG5cdFx0XHR0aGlzLnNob3dBaVJlc3VsdHNBY3Rpb24ubGFiZWwgPSBTSE9XX0FJX1JFU1VMVFNfRElTQUJMRURfTEFCRUw7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSB1cGRhdGVBaVNlYXJjaFRvZ2dsZVZpc2liaWxpdHkoKTogdm9pZCB7XG5cdFx0aWYgKCF0aGlzLnNlYXJjaENvbnRhaW5lciB8fCAhdGhpcy5zaG93QWlSZXN1bHRzQWN0aW9uIHx8ICF0aGlzLnNlYXJjaElucHV0QWN0aW9uQmFyKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29uc3Qgc2hvd0FpVG9nZ2xlID0gdGhpcy5jb25maWd1cmF0aW9uU2VydmljZS5nZXRWYWx1ZTxib29sZWFuPihXb3JrYmVuY2hTZXR0aW5nc0VkaXRvclNldHRpbmdzLlNob3dBSVNlYXJjaFRvZ2dsZSk7XG5cdFx0Y29uc3QgZW5hYmxlTmF0dXJhbExhbmd1YWdlU2VhcmNoID0gdGhpcy5jb25maWd1cmF0aW9uU2VydmljZS5nZXRWYWx1ZTxib29sZWFuPihXb3JrYmVuY2hTZXR0aW5nc0VkaXRvclNldHRpbmdzLkVuYWJsZU5hdHVyYWxMYW5ndWFnZVNlYXJjaCk7XG5cdFx0Y29uc3QgY2hhdEhpZGRlbiA9IHRoaXMuY2hhdEVudGl0bGVtZW50U2VydmljZS5zZW50aW1lbnQuaGlkZGVuIHx8IHRoaXMuY2hhdEVudGl0bGVtZW50U2VydmljZS5zZW50aW1lbnQuZGlzYWJsZWQ7XG5cdFx0Y29uc3QgY2FuU2hvd1RvZ2dsZSA9IHNob3dBaVRvZ2dsZSAmJiBlbmFibGVOYXR1cmFsTGFuZ3VhZ2VTZWFyY2ggJiYgIWNoYXRIaWRkZW47XG5cblx0XHRjb25zdCBhbHJlYWR5VmlzaWJsZSA9IHRoaXMuc2VhcmNoSW5wdXRBY3Rpb25CYXIuaGFzQWN0aW9uKHRoaXMuc2hvd0FpUmVzdWx0c0FjdGlvbik7XG5cdFx0aWYgKCFhbHJlYWR5VmlzaWJsZSAmJiBjYW5TaG93VG9nZ2xlKSB7XG5cdFx0XHR0aGlzLnNlYXJjaElucHV0QWN0aW9uQmFyLnB1c2godGhpcy5zaG93QWlSZXN1bHRzQWN0aW9uLCB7XG5cdFx0XHRcdGluZGV4OiAwLFxuXHRcdFx0XHRsYWJlbDogZmFsc2UsXG5cdFx0XHRcdGljb246IHRydWVcblx0XHRcdH0pO1xuXHRcdFx0dGhpcy5zZWFyY2hDb250YWluZXIuY2xhc3NMaXN0LmFkZCgnd2l0aC1haS10b2dnbGUnKTtcblx0XHR9IGVsc2UgaWYgKGFscmVhZHlWaXNpYmxlKSB7XG5cdFx0XHR0aGlzLnNlYXJjaElucHV0QWN0aW9uQmFyLnB1bGwoMCk7XG5cdFx0XHR0aGlzLnNlYXJjaENvbnRhaW5lci5jbGFzc0xpc3QucmVtb3ZlKCd3aXRoLWFpLXRvZ2dsZScpO1xuXHRcdFx0dGhpcy5zaG93QWlSZXN1bHRzQWN0aW9uLmNoZWNrZWQgPSBmYWxzZTtcblx0XHR9XG5cdH1cblxuXHRvdmVycmlkZSBnZXQgbWluaW11bVdpZHRoKCk6IG51bWJlciB7IHJldHVybiBTZXR0aW5nc0VkaXRvcjIuRURJVE9SX01JTl9XSURUSDsgfVxuXHRvdmVycmlkZSBnZXQgbWF4aW11bVdpZHRoKCk6IG51bWJlciB7IHJldHVybiBOdW1iZXIuUE9TSVRJVkVfSU5GSU5JVFk7IH1cblx0b3ZlcnJpZGUgZ2V0IG1pbmltdW1IZWlnaHQoKSB7IHJldHVybiAxODA7IH1cblxuXHQvLyB0aGVzZSBzZXR0ZXJzIG5lZWQgdG8gZXhpc3QgYmVjYXVzZSB0aGlzIGV4dGVuZHMgZnJvbSBFZGl0b3JQYW5lXG5cdG92ZXJyaWRlIHNldCBtaW5pbXVtV2lkdGgodmFsdWU6IG51bWJlcikgeyAvKm5vb3AqLyB9XG5cdG92ZXJyaWRlIHNldCBtYXhpbXVtV2lkdGgodmFsdWU6IG51bWJlcikgeyAvKm5vb3AqLyB9XG5cblx0cHJpdmF0ZSBnZXQgY3VycmVudFNldHRpbmdzTW9kZWwoKTogU2V0dGluZ3NUcmVlTW9kZWwgfCB1bmRlZmluZWQge1xuXHRcdHJldHVybiB0aGlzLnNlYXJjaFJlc3VsdE1vZGVsIHx8IHRoaXMuc2V0dGluZ3NUcmVlTW9kZWwudmFsdWU7XG5cdH1cblxuXHRwcml2YXRlIGdldCBzZWFyY2hSZXN1bHRNb2RlbCgpOiBTZWFyY2hSZXN1bHRNb2RlbCB8IG51bGwge1xuXHRcdHJldHVybiB0aGlzLl9zZWFyY2hSZXN1bHRNb2RlbC52YWx1ZSA/PyBudWxsO1xuXHR9XG5cblx0cHJpdmF0ZSBzZXQgc2VhcmNoUmVzdWx0TW9kZWwodmFsdWU6IFNlYXJjaFJlc3VsdE1vZGVsIHwgbnVsbCkge1xuXHRcdHRoaXMuX3NlYXJjaFJlc3VsdE1vZGVsLnZhbHVlID0gdmFsdWUgPz8gdW5kZWZpbmVkO1xuXG5cdFx0dGhpcy5yb290RWxlbWVudC5jbGFzc0xpc3QudG9nZ2xlKCdzZWFyY2gtbW9kZScsICEhdGhpcy5fc2VhcmNoUmVzdWx0TW9kZWwudmFsdWUpO1xuXHR9XG5cblx0cHJpdmF0ZSBnZXQgZm9jdXNlZFNldHRpbmdET01FbGVtZW50KCk6IEhUTUxFbGVtZW50IHwgdW5kZWZpbmVkIHtcblx0XHRjb25zdCBmb2N1c2VkID0gdGhpcy5zZXR0aW5nc1RyZWUuZ2V0Rm9jdXMoKVswXTtcblx0XHRpZiAoIShmb2N1c2VkIGluc3RhbmNlb2YgU2V0dGluZ3NUcmVlU2V0dGluZ0VsZW1lbnQpKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHRoaXMuc2V0dGluZ1JlbmRlcmVycy5nZXRET01FbGVtZW50c0ZvclNldHRpbmdLZXkodGhpcy5zZXR0aW5nc1RyZWUuZ2V0SFRNTEVsZW1lbnQoKSwgZm9jdXNlZC5zZXR0aW5nLmtleSlbMF07XG5cdH1cblxuXHRnZXQgY3VycmVudEZvY3VzQ29udGV4dCgpIHtcblx0XHRyZXR1cm4gdGhpcy5fY3VycmVudEZvY3VzQ29udGV4dDtcblx0fVxuXG5cdHByb3RlY3RlZCBjcmVhdGVFZGl0b3IocGFyZW50OiBIVE1MRWxlbWVudCk6IHZvaWQge1xuXHRcdHBhcmVudC5zZXRBdHRyaWJ1dGUoJ3RhYmluZGV4JywgJy0xJyk7XG5cdFx0dGhpcy5yb290RWxlbWVudCA9IERPTS5hcHBlbmQocGFyZW50LCAkKCcuc2V0dGluZ3MtZWRpdG9yJywgeyB0YWJpbmRleDogJy0xJyB9KSk7XG5cblx0XHR0aGlzLmNyZWF0ZUhlYWRlcih0aGlzLnJvb3RFbGVtZW50KTtcblx0XHR0aGlzLmNyZWF0ZUJvZHkodGhpcy5yb290RWxlbWVudCk7XG5cdFx0dGhpcy5hZGRDdHJsQUludGVyY2VwdG9yKHRoaXMucm9vdEVsZW1lbnQpO1xuXHRcdHRoaXMudXBkYXRlU3R5bGVzKCk7XG5cblx0XHR0aGlzLl9yZWdpc3RlcihyZWdpc3Rlck5hdmlnYWJsZUNvbnRhaW5lcih7XG5cdFx0XHRuYW1lOiAnc2V0dGluZ3NFZGl0b3IyJyxcblx0XHRcdGZvY3VzTm90aWZpZXJzOiBbdGhpc10sXG5cdFx0XHRmb2N1c05leHRXaWRnZXQ6ICgpID0+IHtcblx0XHRcdFx0aWYgKHRoaXMuc2VhcmNoV2lkZ2V0LmlucHV0V2lkZ2V0Lmhhc1dpZGdldEZvY3VzKCkpIHtcblx0XHRcdFx0XHR0aGlzLmZvY3VzVE9DKCk7XG5cdFx0XHRcdH1cblx0XHRcdH0sXG5cdFx0XHRmb2N1c1ByZXZpb3VzV2lkZ2V0OiAoKSA9PiB7XG5cdFx0XHRcdGlmICghdGhpcy5zZWFyY2hXaWRnZXQuaW5wdXRXaWRnZXQuaGFzV2lkZ2V0Rm9jdXMoKSkge1xuXHRcdFx0XHRcdHRoaXMuZm9jdXNTZWFyY2goKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH0pKTtcblx0fVxuXG5cdG92ZXJyaWRlIGFzeW5jIHNldElucHV0KGlucHV0OiBTZXR0aW5nc0VkaXRvcjJJbnB1dCwgb3B0aW9uczogSVNldHRpbmdzRWRpdG9yT3B0aW9ucyB8IHVuZGVmaW5lZCwgY29udGV4dDogSUVkaXRvck9wZW5Db250ZXh0LCB0b2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4pOiBQcm9taXNlPHZvaWQ+IHtcblx0XHR0aGlzLmluU2V0dGluZ3NFZGl0b3JDb250ZXh0S2V5LnNldCh0cnVlKTtcblx0XHRhd2FpdCBzdXBlci5zZXRJbnB1dChpbnB1dCwgb3B0aW9ucywgY29udGV4dCwgdG9rZW4pO1xuXHRcdGlmICghdGhpcy5pbnB1dCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IG1vZGVsID0gYXdhaXQgdGhpcy5pbnB1dC5yZXNvbHZlKCk7XG5cdFx0aWYgKHRva2VuLmlzQ2FuY2VsbGF0aW9uUmVxdWVzdGVkIHx8ICEobW9kZWwgaW5zdGFuY2VvZiBTZXR0aW5nczJFZGl0b3JNb2RlbCkpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHR0aGlzLm1vZGVsRGlzcG9zYWJsZXMuY2xlYXIoKTtcblx0XHR0aGlzLm1vZGVsRGlzcG9zYWJsZXMuYWRkKG1vZGVsLm9uRGlkQ2hhbmdlR3JvdXBzKCgpID0+IHtcblx0XHRcdHRoaXMudXBkYXRlZENvbmZpZ1NjaGVtYURlbGF5ZXIudHJpZ2dlcigoKSA9PiB7XG5cdFx0XHRcdHRoaXMub25Db25maWdVcGRhdGUodW5kZWZpbmVkLCBmYWxzZSwgdHJ1ZSk7XG5cdFx0XHR9KTtcblx0XHR9KSk7XG5cdFx0dGhpcy5kZWZhdWx0U2V0dGluZ3NFZGl0b3JNb2RlbCA9IG1vZGVsO1xuXG5cdFx0b3B0aW9ucyA9IG9wdGlvbnMgfHwgdmFsaWRhdGVTZXR0aW5nc0VkaXRvck9wdGlvbnMoe30pO1xuXHRcdGlmICghdGhpcy52aWV3U3RhdGUuc2V0dGluZ3NUYXJnZXQgfHwgIXRoaXMuc2V0dGluZ3NUYXJnZXRzV2lkZ2V0LnNldHRpbmdzVGFyZ2V0KSB7XG5cdFx0XHRjb25zdCBvcHRpb25zSGFzVmlld1N0YXRlVGFyZ2V0ID0gb3B0aW9ucy52aWV3U3RhdGUgJiYgKG9wdGlvbnMudmlld1N0YXRlIGFzIElTZXR0aW5nc0VkaXRvclZpZXdTdGF0ZSkuc2V0dGluZ3NUYXJnZXQ7XG5cdFx0XHRpZiAoIW9wdGlvbnMudGFyZ2V0ICYmICFvcHRpb25zSGFzVmlld1N0YXRlVGFyZ2V0KSB7XG5cdFx0XHRcdG9wdGlvbnMudGFyZ2V0ID0gQ29uZmlndXJhdGlvblRhcmdldC5VU0VSX0xPQ0FMO1xuXHRcdFx0fVxuXHRcdH1cblx0XHR0aGlzLl9zZXRPcHRpb25zKG9wdGlvbnMpO1xuXG5cdFx0Ly8gRG9uJ3QgYmxvY2sgc2V0SW5wdXQgb24gcmVuZGVyICh3aGljaCBjYW4gdHJpZ2dlciBhbiBhc3luYyBzZWFyY2gpXG5cdFx0dGhpcy5vbkNvbmZpZ1VwZGF0ZSh1bmRlZmluZWQsIHRydWUpLnRoZW4oKCkgPT4ge1xuXHRcdFx0Ly8gVGhpcyBldmVudCBydW5zIHdoZW4gdGhlIGVkaXRvciBjbG9zZXMuXG5cdFx0XHR0aGlzLmlucHV0Q2hhbmdlTGlzdGVuZXIudmFsdWUgPSBpbnB1dC5vbldpbGxEaXNwb3NlKCgpID0+IHtcblx0XHRcdFx0dGhpcy5zZWFyY2hXaWRnZXQuc2V0VmFsdWUoJycpO1xuXHRcdFx0fSk7XG5cblx0XHRcdC8vIEluaXQgVE9DIHNlbGVjdGlvblxuXHRcdFx0dGhpcy51cGRhdGVUcmVlU2Nyb2xsU3luYygpO1xuXHRcdH0pO1xuXG5cdFx0YXdhaXQgdGhpcy5yZWZyZXNoSW5zdGFsbGVkRXh0ZW5zaW9uc0xpc3QoKTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgcmVmcmVzaEluc3RhbGxlZEV4dGVuc2lvbnNMaXN0KCk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGNvbnN0IGluc3RhbGxlZEV4dGVuc2lvbnMgPSBhd2FpdCB0aGlzLmV4dGVuc2lvbk1hbmFnZW1lbnRTZXJ2aWNlLmdldEluc3RhbGxlZCgpO1xuXHRcdHRoaXMuaW5zdGFsbGVkRXh0ZW5zaW9uSWRzID0gaW5zdGFsbGVkRXh0ZW5zaW9uc1xuXHRcdFx0LmZpbHRlcihleHQgPT4gZXh0Lm1hbmlmZXN0LmNvbnRyaWJ1dGVzPy5jb25maWd1cmF0aW9uKVxuXHRcdFx0Lm1hcChleHQgPT4gZXh0LmlkZW50aWZpZXIuaWQpO1xuXHR9XG5cblx0cHJpdmF0ZSByZXN0b3JlQ2FjaGVkU3RhdGUoKTogSVNldHRpbmdzRWRpdG9yMlN0YXRlIHwgbnVsbCB7XG5cdFx0Y29uc3QgY2FjaGVkU3RhdGUgPSB0aGlzLmlucHV0ICYmIHRoaXMuZWRpdG9yTWVtZW50by5sb2FkRWRpdG9yU3RhdGUodGhpcy5ncm91cCwgdGhpcy5pbnB1dCk7XG5cdFx0aWYgKGNhY2hlZFN0YXRlICYmIHR5cGVvZiBjYWNoZWRTdGF0ZS50YXJnZXQgPT09ICdvYmplY3QnKSB7XG5cdFx0XHRjYWNoZWRTdGF0ZS50YXJnZXQgPSBVUkkucmV2aXZlKGNhY2hlZFN0YXRlLnRhcmdldCk7XG5cdFx0fVxuXG5cdFx0aWYgKGNhY2hlZFN0YXRlKSB7XG5cdFx0XHRjb25zdCBzZXR0aW5nc1RhcmdldCA9IGNhY2hlZFN0YXRlLnRhcmdldDtcblx0XHRcdHRoaXMuc2V0dGluZ3NUYXJnZXRzV2lkZ2V0LnNldHRpbmdzVGFyZ2V0ID0gc2V0dGluZ3NUYXJnZXQ7XG5cdFx0XHR0aGlzLnZpZXdTdGF0ZS5zZXR0aW5nc1RhcmdldCA9IHNldHRpbmdzVGFyZ2V0O1xuXHRcdFx0aWYgKCF0aGlzLnNlYXJjaFdpZGdldC5nZXRWYWx1ZSgpKSB7XG5cdFx0XHRcdHRoaXMuc2VhcmNoV2lkZ2V0LnNldFZhbHVlKGNhY2hlZFN0YXRlLnNlYXJjaFF1ZXJ5KTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRpZiAodGhpcy5pbnB1dCkge1xuXHRcdFx0dGhpcy5lZGl0b3JNZW1lbnRvLmNsZWFyRWRpdG9yU3RhdGUodGhpcy5pbnB1dCwgdGhpcy5ncm91cCk7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIGNhY2hlZFN0YXRlID8/IG51bGw7XG5cdH1cblxuXHRvdmVycmlkZSBnZXRWaWV3U3RhdGUoKTogb2JqZWN0IHwgdW5kZWZpbmVkIHtcblx0XHRyZXR1cm4gdGhpcy52aWV3U3RhdGU7XG5cdH1cblxuXHRvdmVycmlkZSBzZXRPcHRpb25zKG9wdGlvbnM6IElTZXR0aW5nc0VkaXRvck9wdGlvbnMgfCB1bmRlZmluZWQpOiB2b2lkIHtcblx0XHRzdXBlci5zZXRPcHRpb25zKG9wdGlvbnMpO1xuXG5cdFx0aWYgKG9wdGlvbnMpIHtcblx0XHRcdHRoaXMuX3NldE9wdGlvbnMob3B0aW9ucyk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBfc2V0T3B0aW9ucyhvcHRpb25zOiBJU2V0dGluZ3NFZGl0b3JPcHRpb25zKTogdm9pZCB7XG5cdFx0aWYgKG9wdGlvbnMuZm9jdXNTZWFyY2ggJiYgIXBsYXRmb3JtLmlzSU9TKSB7XG5cdFx0XHQvLyBpc0lPUyAtICMxMjIwNDRcblx0XHRcdHRoaXMuZm9jdXNTZWFyY2goKTtcblx0XHR9XG5cblx0XHRjb25zdCByZWNvdmVyZWRWaWV3U3RhdGUgPSBvcHRpb25zLnZpZXdTdGF0ZSA/XG5cdFx0XHRvcHRpb25zLnZpZXdTdGF0ZSBhcyBJU2V0dGluZ3NFZGl0b3JWaWV3U3RhdGUgOiB1bmRlZmluZWQ7XG5cblx0XHRjb25zdCBxdWVyeTogc3RyaW5nIHwgdW5kZWZpbmVkID0gcmVjb3ZlcmVkVmlld1N0YXRlPy5xdWVyeSA/PyBvcHRpb25zLnF1ZXJ5O1xuXHRcdGlmIChxdWVyeSAhPT0gdW5kZWZpbmVkKSB7XG5cdFx0XHR0aGlzLnNlYXJjaFdpZGdldC5zZXRWYWx1ZShxdWVyeSk7XG5cdFx0XHR0aGlzLnZpZXdTdGF0ZS5xdWVyeSA9IHF1ZXJ5O1xuXHRcdH1cblxuXHRcdGNvbnN0IHRhcmdldDogU2V0dGluZ3NUYXJnZXQgfCB1bmRlZmluZWQgPSBvcHRpb25zLmZvbGRlclVyaSA/PyByZWNvdmVyZWRWaWV3U3RhdGU/LnNldHRpbmdzVGFyZ2V0ID8/IDxTZXR0aW5nc1RhcmdldCB8IHVuZGVmaW5lZD5vcHRpb25zLnRhcmdldDtcblx0XHRpZiAodGFyZ2V0KSB7XG5cdFx0XHR0aGlzLnNldHRpbmdzVGFyZ2V0c1dpZGdldC51cGRhdGVUYXJnZXQodGFyZ2V0KTtcblx0XHR9XG5cdH1cblxuXHRvdmVycmlkZSBjbGVhcklucHV0KCk6IHZvaWQge1xuXHRcdHRoaXMuaW5TZXR0aW5nc0VkaXRvckNvbnRleHRLZXkuc2V0KGZhbHNlKTtcblx0XHRzdXBlci5jbGVhcklucHV0KCk7XG5cdH1cblxuXHRsYXlvdXQoZGltZW5zaW9uOiBET00uRGltZW5zaW9uKTogdm9pZCB7XG5cdFx0dGhpcy5kaW1lbnNpb24gPSBkaW1lbnNpb247XG5cblx0XHRpZiAoIXRoaXMuaXNWaXNpYmxlKCkpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHR0aGlzLmxheW91dFNwbGl0VmlldyhkaW1lbnNpb24pO1xuXG5cdFx0Y29uc3QgaW5uZXJXaWR0aCA9IE1hdGgubWluKHRoaXMuaGVhZGVyQ29udGFpbmVyLmNsaWVudFdpZHRoLCBkaW1lbnNpb24ud2lkdGgpIC0gMjQgKiAyOyAvLyAyNHB4IHBhZGRpbmcgb24gbGVmdCBhbmQgcmlnaHQ7XG5cdFx0Ly8gbWludXMgcGFkZGluZyBpbnNpZGUgaW5wdXRib3gsIGNvbnRyb2xzIHdpZHRoLCBhbmQgZXh0cmEgcGFkZGluZyBiZWZvcmUgY291bnRFbGVtZW50XG5cdFx0Y29uc3QgbW9uYWNvV2lkdGggPSBpbm5lcldpZHRoIC0gMTAgLSB0aGlzLmNvbnRyb2xzRWxlbWVudC5jbGllbnRXaWR0aCAtIDEyO1xuXHRcdHRoaXMuc2VhcmNoV2lkZ2V0LmxheW91dChuZXcgRE9NLkRpbWVuc2lvbihtb25hY29XaWR0aCwgMjApKTtcblxuXHRcdHRoaXMucm9vdEVsZW1lbnQuY2xhc3NMaXN0LnRvZ2dsZSgnbmFycm93LXdpZHRoJywgZGltZW5zaW9uLndpZHRoIDwgU2V0dGluZ3NFZGl0b3IyLk5BUlJPV19UT1RBTF9XSURUSCk7XG5cdH1cblxuXHRvdmVycmlkZSBmb2N1cygpOiB2b2lkIHtcblx0XHRzdXBlci5mb2N1cygpO1xuXG5cdFx0aWYgKHRoaXMuX2N1cnJlbnRGb2N1c0NvbnRleHQgPT09IFNldHRpbmdzRm9jdXNDb250ZXh0LlNlYXJjaCkge1xuXHRcdFx0aWYgKCFwbGF0Zm9ybS5pc0lPUykge1xuXHRcdFx0XHQvLyAjMTIyMDQ0XG5cdFx0XHRcdHRoaXMuZm9jdXNTZWFyY2goKTtcblx0XHRcdH1cblx0XHR9IGVsc2UgaWYgKHRoaXMuX2N1cnJlbnRGb2N1c0NvbnRleHQgPT09IFNldHRpbmdzRm9jdXNDb250ZXh0LlNldHRpbmdDb250cm9sKSB7XG5cdFx0XHRjb25zdCBlbGVtZW50ID0gdGhpcy5mb2N1c2VkU2V0dGluZ0RPTUVsZW1lbnQ7XG5cdFx0XHRpZiAoZWxlbWVudCkge1xuXHRcdFx0XHQvLyBlc2xpbnQtZGlzYWJsZS1uZXh0LWxpbmUgbm8tcmVzdHJpY3RlZC1zeW50YXhcblx0XHRcdFx0Y29uc3QgY29udHJvbCA9IGVsZW1lbnQucXVlcnlTZWxlY3RvcihBYnN0cmFjdFNldHRpbmdSZW5kZXJlci5DT05UUk9MX1NFTEVDVE9SKTtcblx0XHRcdFx0aWYgKGNvbnRyb2wpIHtcblx0XHRcdFx0XHQoPEhUTUxFbGVtZW50PmNvbnRyb2wpLmZvY3VzKCk7XG5cdFx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fSBlbHNlIGlmICh0aGlzLl9jdXJyZW50Rm9jdXNDb250ZXh0ID09PSBTZXR0aW5nc0ZvY3VzQ29udGV4dC5TZXR0aW5nVHJlZSkge1xuXHRcdFx0dGhpcy5zZXR0aW5nc1RyZWUuZG9tRm9jdXMoKTtcblx0XHR9IGVsc2UgaWYgKHRoaXMuX2N1cnJlbnRGb2N1c0NvbnRleHQgPT09IFNldHRpbmdzRm9jdXNDb250ZXh0LlRhYmxlT2ZDb250ZW50cykge1xuXHRcdFx0dGhpcy50b2NUcmVlLmRvbUZvY3VzKCk7XG5cdFx0fVxuXHR9XG5cblx0cHJvdGVjdGVkIG92ZXJyaWRlIHNldEVkaXRvclZpc2libGUodmlzaWJsZTogYm9vbGVhbik6IHZvaWQge1xuXHRcdHN1cGVyLnNldEVkaXRvclZpc2libGUodmlzaWJsZSk7XG5cblx0XHRpZiAoIXZpc2libGUpIHtcblx0XHRcdC8vIFdhaXQgZm9yIGVkaXRvciB0byBiZSByZW1vdmVkIGZyb20gRE9NICMxMDYzMDNcblx0XHRcdHNldFRpbWVvdXQoKCkgPT4ge1xuXHRcdFx0XHR0aGlzLnNlYXJjaFdpZGdldC5vbkhpZGUoKTtcblx0XHRcdFx0dGhpcy5zZXR0aW5nUmVuZGVyZXJzLmNhbmNlbFN1Z2dlc3RlcnMoKTtcblx0XHRcdH0sIDApO1xuXHRcdH1cblx0fVxuXG5cdGZvY3VzU2V0dGluZ3MoZm9jdXNTZXR0aW5nSW5wdXQgPSBmYWxzZSk6IHZvaWQge1xuXHRcdGNvbnN0IGZvY3VzZWQgPSB0aGlzLnNldHRpbmdzVHJlZS5nZXRGb2N1cygpO1xuXHRcdGlmICghZm9jdXNlZC5sZW5ndGgpIHtcblx0XHRcdHRoaXMuc2V0dGluZ3NUcmVlLmZvY3VzRmlyc3QoKTtcblx0XHR9XG5cblx0XHR0aGlzLnNldHRpbmdzVHJlZS5kb21Gb2N1cygpO1xuXG5cdFx0aWYgKGZvY3VzU2V0dGluZ0lucHV0KSB7XG5cdFx0XHQvLyBlc2xpbnQtZGlzYWJsZS1uZXh0LWxpbmUgbm8tcmVzdHJpY3RlZC1zeW50YXhcblx0XHRcdGNvbnN0IGNvbnRyb2xJbkZvY3VzZWRSb3cgPSB0aGlzLnNldHRpbmdzVHJlZS5nZXRIVE1MRWxlbWVudCgpLnF1ZXJ5U2VsZWN0b3IoYC5mb2N1c2VkICR7QWJzdHJhY3RTZXR0aW5nUmVuZGVyZXIuQ09OVFJPTF9TRUxFQ1RPUn1gKTtcblx0XHRcdGlmIChjb250cm9sSW5Gb2N1c2VkUm93KSB7XG5cdFx0XHRcdCg8SFRNTEVsZW1lbnQ+Y29udHJvbEluRm9jdXNlZFJvdykuZm9jdXMoKTtcblx0XHRcdH1cblx0XHR9XG5cdH1cblxuXHRmb2N1c1RPQygpOiB2b2lkIHtcblx0XHR0aGlzLnRvY1RyZWUuZG9tRm9jdXMoKTtcblx0fVxuXG5cdC8qKlxuXHQgKiBJbnZva2VkIHdoZW4gdGhlIHVzZXIgcHJlc3NlcyB0aGUgZG93biBhcnJvdyB3aGlsZSB0aGUgc2VhcmNoIGlucHV0IGlzIGZvY3VzZWQuXG5cdCAqIE5hdmlnYXRlcyBmb3J3YXJkIHRocm91Z2ggdGhlIHNlYXJjaCBoaXN0b3J5IGZpcnN0OyBvbmx5IG9uY2UgdGhlcmUgYXJlIG5vIG1vcmVcblx0ICogcmVjZW50IGhpc3RvcnkgZW50cmllcyBkb2VzIGZvY3VzIG1vdmUgZG93biBpbnRvIHRoZSBzZXR0aW5ncyByZXN1bHRzLlxuXHQgKi9cblx0bmF2aWdhdGVTZWFyY2hIaXN0b3J5TmV4dE9yRm9jdXNTZXR0aW5ncygpOiB2b2lkIHtcblx0XHRpZiAodGhpcy5zZWFyY2hXaWRnZXQuaXNOYXZpZ2F0aW5nSGlzdG9yeSgpKSB7XG5cdFx0XHR0aGlzLnNlYXJjaFdpZGdldC5zaG93TmV4dFZhbHVlKCk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHRoaXMuZm9jdXNGaXJzdFNldHRpbmdGcm9tU2VhcmNoKCk7XG5cdFx0fVxuXHR9XG5cblx0LyoqXG5cdCAqIEludm9rZWQgd2hlbiB0aGUgdXNlciBwcmVzc2VzIHRoZSB1cCBhcnJvdyB3aGlsZSB0aGUgc2VhcmNoIGlucHV0IGlzIGZvY3VzZWQuXG5cdCAqIE5hdmlnYXRlcyBiYWNrd2FyZCB0aHJvdWdoIHRoZSBzZWFyY2ggaGlzdG9yeS5cblx0ICovXG5cdG5hdmlnYXRlU2VhcmNoSGlzdG9yeVByZXZpb3VzKCk6IHZvaWQge1xuXHRcdHRoaXMuc2VhcmNoV2lkZ2V0LnNob3dQcmV2aW91c1ZhbHVlKCk7XG5cdH1cblxuXHQvKipcblx0ICogV2hldGhlciB0aGUgY3VycmVudGx5IHJlbmRlcmVkIHJlc3VsdHMgcmVmbGVjdCB0aGUgY3VycmVudCBzZWFyY2ggaW5wdXQgdmFsdWUuXG5cdCAqIFJldHVybnMgZmFsc2Ugd2hpbGUgYSBzZWFyY2ggaXMgc3RpbGwgcGVuZGluZyAoZGVib3VuY2VkKSBvciBpbiBwcm9ncmVzcywgc28gdGhhdFxuXHQgKiBmb2N1cyBpcyBub3QgbW92ZWQgaW50byBzdGFsZSByZXN1bHRzLlxuXHQgKi9cblx0cHJpdmF0ZSBpc1NlYXJjaFVwVG9EYXRlKCk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiBpc1NldHRpbmdzU2VhcmNoVXBUb0RhdGUodGhpcy5zZWFyY2hJbnB1dERlbGF5ZXIuaXNUcmlnZ2VyZWQoKSwgdGhpcy5yZW5kZXJlZFNlYXJjaFF1ZXJ5LCB0aGlzLnNlYXJjaFdpZGdldC5nZXRWYWx1ZSgpKTtcblx0fVxuXG5cdC8qKlxuXHQgKiBNb3ZlcyBmb2N1cyBmcm9tIHRoZSBzZWFyY2ggaW5wdXQgaW50byB0aGUgZmlyc3Qgc2V0dGluZ3MgcmVzdWx0LCBidXQgb25seSB3aGVuIHRoZVxuXHQgKiBkaXNwbGF5ZWQgcmVzdWx0cyBhcmUgdXAgdG8gZGF0ZSB3aXRoIHRoZSBjdXJyZW50IHNlYXJjaCBpbnB1dC4gSWYgdGhlIHJlc3VsdHMgYXJlXG5cdCAqIHN0YWxlIChhIHNlYXJjaCBpcyBzdGlsbCBwZW5kaW5nIG9yIGluIHByb2dyZXNzKSwgdGhpcyBkb2VzIG5vdGhpbmcgc28gdGhhdCBmb2N1cyBkb2VzXG5cdCAqIG5vdCBsYW5kIG9uIHJlc3VsdHMgZnJvbSBhIHByZXZpb3VzIHF1ZXJ5LlxuXHQgKi9cblx0Zm9jdXNGaXJzdFNldHRpbmdGcm9tU2VhcmNoKCk6IHZvaWQge1xuXHRcdGlmICghdGhpcy5pc1NlYXJjaFVwVG9EYXRlKCkpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0dGhpcy5mb2N1c1NldHRpbmdzKCk7XG5cdH1cblxuXHRwcml2YXRlIHVwZGF0ZVNldHRpbmdGaXJzdFJvd0ZvY3VzZWRDb250ZXh0KGVsZW1lbnQ6IFNldHRpbmdzVHJlZUVsZW1lbnQgfCBudWxsKTogdm9pZCB7XG5cdFx0dGhpcy5zZXR0aW5nRmlyc3RSb3dGb2N1c2VkLnNldCghIWVsZW1lbnQgJiYgZWxlbWVudCA9PT0gdGhpcy5zZXR0aW5nc1RyZWUubmF2aWdhdGUoKS5maXJzdCgpKTtcblx0fVxuXG5cdHNob3dDb250ZXh0TWVudSgpOiB2b2lkIHtcblx0XHRjb25zdCBmb2N1c2VkID0gdGhpcy5zZXR0aW5nc1RyZWUuZ2V0Rm9jdXMoKVswXTtcblx0XHRjb25zdCByb3dFbGVtZW50ID0gdGhpcy5mb2N1c2VkU2V0dGluZ0RPTUVsZW1lbnQ7XG5cdFx0aWYgKHJvd0VsZW1lbnQgJiYgZm9jdXNlZCBpbnN0YW5jZW9mIFNldHRpbmdzVHJlZVNldHRpbmdFbGVtZW50KSB7XG5cdFx0XHR0aGlzLnNldHRpbmdSZW5kZXJlcnMuc2hvd0NvbnRleHRNZW51KGZvY3VzZWQsIHJvd0VsZW1lbnQpO1xuXHRcdH1cblx0fVxuXG5cdGZvY3VzU2VhcmNoKGZpbHRlcj86IHN0cmluZywgc2VsZWN0QWxsID0gdHJ1ZSk6IHZvaWQge1xuXHRcdGlmIChmaWx0ZXIgJiYgdGhpcy5zZWFyY2hXaWRnZXQpIHtcblx0XHRcdHRoaXMuc2VhcmNoV2lkZ2V0LnNldFZhbHVlKGZpbHRlcik7XG5cdFx0fVxuXG5cdFx0Ly8gRG8gbm90IHNlbGVjdCBhbGwgaWYgdGhlIHVzZXIgaXMgYWxyZWFkeSBzZWFyY2hpbmcuXG5cdFx0dGhpcy5zZWFyY2hXaWRnZXQuZm9jdXMoc2VsZWN0QWxsICYmICF0aGlzLnNlYXJjaElucHV0RGVsYXllci5pc1RyaWdnZXJlZCgpKTtcblx0fVxuXG5cdGNsZWFyU2VhcmNoUmVzdWx0cygpOiB2b2lkIHtcblx0XHR0aGlzLmRpc2FibGVBaVNlYXJjaFRvZ2dsZSgpO1xuXHRcdHRoaXMuc2VhcmNoV2lkZ2V0LnNldFZhbHVlKCcnKTtcblx0XHR0aGlzLmZvY3VzU2VhcmNoKCk7XG5cdH1cblxuXHRjbGVhclNlYXJjaEZpbHRlcnMoKTogdm9pZCB7XG5cdFx0Y29uc3QgcXVlcnkgPSB0aGlzLnNlYXJjaFdpZGdldC5nZXRWYWx1ZSgpO1xuXG5cdFx0Y29uc3Qgc3BsaXRRdWVyeSA9IHF1ZXJ5LnNwbGl0KCcgJykuZmlsdGVyKHdvcmQgPT4ge1xuXHRcdFx0cmV0dXJuIHdvcmQubGVuZ3RoICYmICFTZXR0aW5nc0VkaXRvcjIuU1VHR0VTVElPTlMuc29tZShzdWdnZXN0aW9uID0+IHdvcmQuc3RhcnRzV2l0aChzdWdnZXN0aW9uKSk7XG5cdFx0fSk7XG5cblx0XHR0aGlzLnNlYXJjaFdpZGdldC5zZXRWYWx1ZShzcGxpdFF1ZXJ5LmpvaW4oJyAnKSk7XG5cdH1cblxuXHQvKipcblx0ICogVXBkYXRlcyB0aGUgc2VhcmNoIGlucHV0IHBsYWNlaG9sZGVyIHNvIHRoYXQgaXQgaGludHMgYXQgaGlzdG9yeSBuYXZpZ2F0aW9uXG5cdCAqICh1cC9kb3duIGFycm93cykgb25jZSB0aGUgdXNlciBoYXMgc2VhcmNoIGhpc3RvcnksIHNpbWlsYXIgdG8gdGhlIGtleWJvYXJkXG5cdCAqIHNob3J0Y3V0cyBlZGl0b3IuXG5cdCAqL1xuXHRwcml2YXRlIHVwZGF0ZVNlYXJjaFBsYWNlaG9sZGVyKCk6IHZvaWQge1xuXHRcdGNvbnN0IGhhc0hpc3RvcnkgPSB0aGlzLnNlYXJjaFdpZGdldC5nZXRIaXN0b3J5KCkubGVuZ3RoID4gMDtcblx0XHR0aGlzLnNlYXJjaFdpZGdldC5zZXRQbGFjZUhvbGRlcihoYXNIaXN0b3J5ID8gc2VhcmNoQm94UGxhY2Vob2xkZXJXaXRoSGlzdG9yeSA6IHNlYXJjaEJveExhYmVsKTtcblx0fVxuXG5cdHByaXZhdGUgdXBkYXRlSW5wdXRBcmlhTGFiZWwoKSB7XG5cdFx0bGV0IGxhYmVsID0gc2VhcmNoQm94TGFiZWw7XG5cdFx0aWYgKHRoaXMuc2VhcmNoUmVzdWx0TGFiZWwpIHtcblx0XHRcdGxhYmVsICs9IGAuICR7dGhpcy5zZWFyY2hSZXN1bHRMYWJlbH1gO1xuXHRcdH1cblxuXHRcdGlmICh0aGlzLmxhc3RTeW5jZWRMYWJlbCkge1xuXHRcdFx0bGFiZWwgKz0gYC4gJHt0aGlzLmxhc3RTeW5jZWRMYWJlbH1gO1xuXHRcdH1cblxuXHRcdHRoaXMuc2VhcmNoV2lkZ2V0LnVwZGF0ZUFyaWFMYWJlbChsYWJlbCk7XG5cdH1cblxuXHQvKipcblx0ICogUmVuZGVyIHRoZSBoZWFkZXIgb2YgdGhlIFNldHRpbmdzIGVkaXRvciwgd2hpY2ggaW5jbHVkZXMgdGhlIGNvbnRlbnQgYWJvdmUgdGhlIHNwbGl0dmlldy5cblx0ICovXG5cdHByaXZhdGUgY3JlYXRlSGVhZGVyKHBhcmVudDogSFRNTEVsZW1lbnQpOiB2b2lkIHtcblx0XHR0aGlzLmhlYWRlckNvbnRhaW5lciA9IERPTS5hcHBlbmQocGFyZW50LCAkKCcuc2V0dGluZ3MtaGVhZGVyJykpO1xuXHRcdHRoaXMuc2VhcmNoQ29udGFpbmVyID0gRE9NLmFwcGVuZCh0aGlzLmhlYWRlckNvbnRhaW5lciwgJCgnLnNlYXJjaC1jb250YWluZXInKSk7XG5cblx0XHRjb25zdCBjbGVhcklucHV0QWN0aW9uID0gdGhpcy5fcmVnaXN0ZXIobmV3IEFjdGlvbihTRVRUSU5HU19FRElUT1JfQ09NTUFORF9DTEVBUl9TRUFSQ0hfUkVTVUxUUyxcblx0XHRcdGxvY2FsaXplKCdjbGVhcklucHV0JywgXCJDbGVhciBTZXR0aW5ncyBTZWFyY2ggSW5wdXRcIiksIFRoZW1lSWNvbi5hc0NsYXNzTmFtZShwcmVmZXJlbmNlc0NsZWFySW5wdXRJY29uKSwgZmFsc2UsXG5cdFx0XHRhc3luYyAoKSA9PiB0aGlzLmNsZWFyU2VhcmNoUmVzdWx0cygpXG5cdFx0KSk7XG5cblx0XHRjb25zdCBzaG93QWlSZXN1bHRBY3Rpb25DbGFzc05hbWVzID0gWydhY3Rpb24tbGFiZWwnLCBUaGVtZUljb24uYXNDbGFzc05hbWUocHJlZmVyZW5jZXNBaVJlc3VsdHNJY29uKV07XG5cdFx0dGhpcy5zaG93QWlSZXN1bHRzQWN0aW9uID0gdGhpcy5fcmVnaXN0ZXIobmV3IEFjdGlvbihTRVRUSU5HU19FRElUT1JfQ09NTUFORF9TSE9XX0FJX1JFU1VMVFMsXG5cdFx0XHRTSE9XX0FJX1JFU1VMVFNfRElTQUJMRURfTEFCRUwsIHNob3dBaVJlc3VsdEFjdGlvbkNsYXNzTmFtZXMuam9pbignICcpLCB0cnVlXG5cdFx0KSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5zaG93QWlSZXN1bHRzQWN0aW9uLm9uRGlkQ2hhbmdlKGFzeW5jICgpID0+IHtcblx0XHRcdGF3YWl0IHRoaXMub25EaWRUb2dnbGVBaVNlYXJjaCgpO1xuXHRcdH0pKTtcblxuXHRcdGNvbnN0IGZpbHRlckFjdGlvbiA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBBY3Rpb24oU0VUVElOR1NfRURJVE9SX0NPTU1BTkRfU1VHR0VTVF9GSUxURVJTLFxuXHRcdFx0bG9jYWxpemUoJ2ZpbHRlcklucHV0JywgXCJGaWx0ZXIgU2V0dGluZ3NcIiksIFRoZW1lSWNvbi5hc0NsYXNzTmFtZShwcmVmZXJlbmNlc0ZpbHRlckljb24pXG5cdFx0KSk7XG5cblx0XHR0aGlzLnNlYXJjaFdpZGdldCA9IHRoaXMuX3JlZ2lzdGVyKHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoU3VnZ2VzdEVuYWJsZWRJbnB1dFdpdGhIaXN0b3J5LCB7XG5cdFx0XHRpZDogYCR7U2V0dGluZ3NFZGl0b3IyLklEfS5zZWFyY2hib3hgLFxuXHRcdFx0cGFyZW50OiB0aGlzLnNlYXJjaENvbnRhaW5lcixcblx0XHRcdGFyaWFMYWJlbDogc2VhcmNoQm94TGFiZWwsXG5cdFx0XHRyZXNvdXJjZUhhbmRsZTogJ3NldHRpbmdzZWRpdG9yOnNlYXJjaGlucHV0JyArIFNldHRpbmdzRWRpdG9yMi5OVU1fSU5TVEFOQ0VTKyssXG5cdFx0XHRzdWdnZXN0aW9uUHJvdmlkZXI6IHtcblx0XHRcdFx0dHJpZ2dlckNoYXJhY3RlcnM6IFsnQCcsICc6J10sXG5cdFx0XHRcdHByb3ZpZGVSZXN1bHRzOiAocXVlcnk6IHN0cmluZykgPT4ge1xuXHRcdFx0XHRcdC8vIEJhc2VkIG9uIHRlc3RpbmcsIHRoZSB0cmlnZ2VyIGNoYXJhY3RlciBpcyBhbHdheXMgYXQgdGhlIGVuZCBvZiB0aGUgcXVlcnkuXG5cdFx0XHRcdFx0Ly8gZm9yIHRoZSAnOicgdHJpZ2dlciwgb25seSByZXR1cm4gc3VnZ2VzdGlvbnMgaWYgdGhlcmUgd2FzIGEgJ0AnIGJlZm9yZSBpdCBpbiB0aGUgc2FtZSB3b3JkLlxuXHRcdFx0XHRcdGNvbnN0IHF1ZXJ5UGFydHMgPSBxdWVyeS5zcGxpdCgvXFxzL2cpO1xuXHRcdFx0XHRcdGlmIChxdWVyeVBhcnRzW3F1ZXJ5UGFydHMubGVuZ3RoIC0gMV0uc3RhcnRzV2l0aChgQCR7TEFOR1VBR0VfU0VUVElOR19UQUd9YCkpIHtcblx0XHRcdFx0XHRcdGNvbnN0IHNvcnRlZExhbmd1YWdlcyA9IHRoaXMubGFuZ3VhZ2VTZXJ2aWNlLmdldFJlZ2lzdGVyZWRMYW5ndWFnZUlkcygpLm1hcChsYW5ndWFnZUlkID0+IHtcblx0XHRcdFx0XHRcdFx0cmV0dXJuIGBAJHtMQU5HVUFHRV9TRVRUSU5HX1RBR30ke2xhbmd1YWdlSWR9IGA7XG5cdFx0XHRcdFx0XHR9KS5zb3J0KCk7XG5cdFx0XHRcdFx0XHRyZXR1cm4gc29ydGVkTGFuZ3VhZ2VzLmZpbHRlcihsYW5nRmlsdGVyID0+ICFxdWVyeS5pbmNsdWRlcyhsYW5nRmlsdGVyKSk7XG5cdFx0XHRcdFx0fSBlbHNlIGlmIChxdWVyeVBhcnRzW3F1ZXJ5UGFydHMubGVuZ3RoIC0gMV0uc3RhcnRzV2l0aChgQCR7RVhURU5TSU9OX1NFVFRJTkdfVEFHfWApKSB7XG5cdFx0XHRcdFx0XHRjb25zdCBpbnN0YWxsZWRFeHRlbnNpb25zVGFncyA9IHRoaXMuaW5zdGFsbGVkRXh0ZW5zaW9uSWRzLm1hcChleHRlbnNpb25JZCA9PiB7XG5cdFx0XHRcdFx0XHRcdHJldHVybiBgQCR7RVhURU5TSU9OX1NFVFRJTkdfVEFHfSR7ZXh0ZW5zaW9uSWR9IGA7XG5cdFx0XHRcdFx0XHR9KS5zb3J0KCk7XG5cdFx0XHRcdFx0XHRyZXR1cm4gaW5zdGFsbGVkRXh0ZW5zaW9uc1RhZ3MuZmlsdGVyKGV4dEZpbHRlciA9PiAhcXVlcnkuaW5jbHVkZXMoZXh0RmlsdGVyKSk7XG5cdFx0XHRcdFx0fSBlbHNlIGlmIChxdWVyeSA9PT0gJycgfHwgcXVlcnlQYXJ0c1txdWVyeVBhcnRzLmxlbmd0aCAtIDFdLnN0YXJ0c1dpdGgoJ0AnKSkge1xuXHRcdFx0XHRcdFx0cmV0dXJuIFNldHRpbmdzRWRpdG9yMi5TVUdHRVNUSU9OUy5maWx0ZXIodGFnID0+ICFxdWVyeS5pbmNsdWRlcyh0YWcpKS5tYXAodGFnID0+IHRhZy5lbmRzV2l0aCgnOicpID8gdGFnIDogdGFnICsgJyAnKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0cmV0dXJuIFtdO1xuXHRcdFx0XHR9XG5cdFx0XHR9LFxuXHRcdFx0c3VnZ2VzdE9wdGlvbnM6IHtcblx0XHRcdFx0cGxhY2Vob2xkZXJUZXh0OiBzZWFyY2hCb3hMYWJlbCxcblx0XHRcdFx0Zm9jdXNDb250ZXh0S2V5OiB0aGlzLnNlYXJjaEZvY3VzQ29udGV4dEtleSxcblx0XHRcdFx0c3R5bGVPdmVycmlkZXM6IHtcblx0XHRcdFx0XHRpbnB1dEJvcmRlcjogc2V0dGluZ3NUZXh0SW5wdXRCb3JkZXJcblx0XHRcdFx0fVxuXHRcdFx0XHQvLyBUT0RPOiBBcmlhLWxpdmVcblx0XHRcdH0sXG5cdFx0XHRoaXN0b3J5OiB0aGlzLmxvYWRTZWFyY2hIaXN0b3J5KClcblx0XHR9KSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5zZWFyY2hXaWRnZXQub25EaWRGb2N1cygoKSA9PiB7XG5cdFx0XHR0aGlzLl9jdXJyZW50Rm9jdXNDb250ZXh0ID0gU2V0dGluZ3NGb2N1c0NvbnRleHQuU2VhcmNoO1xuXHRcdH0pKTtcblx0XHR0aGlzLnVwZGF0ZVNlYXJjaFBsYWNlaG9sZGVyKCk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5zZWFyY2hXaWRnZXQub25JbnB1dERpZENoYW5nZSgoKSA9PiB7XG5cdFx0XHRjb25zdCBzZWFyY2hWYWwgPSB0aGlzLnNlYXJjaFdpZGdldC5nZXRWYWx1ZSgpO1xuXHRcdFx0Y2xlYXJJbnB1dEFjdGlvbi5lbmFibGVkID0gISFzZWFyY2hWYWw7XG5cdFx0XHR0aGlzLnNlYXJjaElucHV0RGVsYXllci50cmlnZ2VyKCgpID0+IHRoaXMub25TZWFyY2hJbnB1dENoYW5nZWQodHJ1ZSkpO1xuXHRcdH0pKTtcblxuXHRcdGNvbnN0IGhlYWRlckNvbnRyb2xzQ29udGFpbmVyID0gRE9NLmFwcGVuZCh0aGlzLmhlYWRlckNvbnRhaW5lciwgJCgnLnNldHRpbmdzLWhlYWRlci1jb250cm9scycpKTtcblx0XHRoZWFkZXJDb250cm9sc0NvbnRhaW5lci5zdHlsZS5ib3JkZXJDb2xvciA9IGFzQ3NzVmFyaWFibGUoc2V0dGluZ3NIZWFkZXJCb3JkZXIpO1xuXG5cdFx0Y29uc3QgdGFyZ2V0V2lkZ2V0Q29udGFpbmVyID0gRE9NLmFwcGVuZChoZWFkZXJDb250cm9sc0NvbnRhaW5lciwgJCgnLnNldHRpbmdzLXRhcmdldC1jb250YWluZXInKSk7XG5cdFx0dGhpcy5zZXR0aW5nc1RhcmdldHNXaWRnZXQgPSB0aGlzLl9yZWdpc3Rlcih0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFNldHRpbmdzVGFyZ2V0c1dpZGdldCwgdGFyZ2V0V2lkZ2V0Q29udGFpbmVyLCB7IGVuYWJsZVJlbW90ZVNldHRpbmdzOiB0cnVlIH0pKTtcblx0XHR0aGlzLnNldHRpbmdzVGFyZ2V0c1dpZGdldC5zZXR0aW5nc1RhcmdldCA9IENvbmZpZ3VyYXRpb25UYXJnZXQuVVNFUl9MT0NBTDtcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLnNldHRpbmdzVGFyZ2V0c1dpZGdldC5vbkRpZFRhcmdldENoYW5nZSh0YXJnZXQgPT4gdGhpcy5vbkRpZFNldHRpbmdzVGFyZ2V0Q2hhbmdlKHRhcmdldCkpKTtcblx0XHR0aGlzLl9yZWdpc3RlcihET00uYWRkRGlzcG9zYWJsZUxpc3RlbmVyKHRhcmdldFdpZGdldENvbnRhaW5lciwgRE9NLkV2ZW50VHlwZS5LRVlfRE9XTiwgZSA9PiB7XG5cdFx0XHRjb25zdCBldmVudCA9IG5ldyBTdGFuZGFyZEtleWJvYXJkRXZlbnQoZSk7XG5cdFx0XHRpZiAoZXZlbnQua2V5Q29kZSA9PT0gS2V5Q29kZS5Eb3duQXJyb3cpIHtcblx0XHRcdFx0dGhpcy5mb2N1c1NldHRpbmdzKCk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXG5cdFx0aWYgKHRoaXMudXNlckRhdGFTeW5jV29ya2JlbmNoU2VydmljZS5lbmFibGVkICYmIHRoaXMudXNlckRhdGFTeW5jRW5hYmxlbWVudFNlcnZpY2UuY2FuVG9nZ2xlRW5hYmxlbWVudCgpKSB7XG5cdFx0XHRjb25zdCBzeW5jQ29udHJvbHMgPSB0aGlzLl9yZWdpc3Rlcih0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFN5bmNDb250cm9scywgdGhpcy53aW5kb3csIGhlYWRlckNvbnRyb2xzQ29udGFpbmVyKSk7XG5cdFx0XHR0aGlzLl9yZWdpc3RlcihzeW5jQ29udHJvbHMub25EaWRDaGFuZ2VMYXN0U3luY2VkTGFiZWwobGFzdFN5bmNlZExhYmVsID0+IHtcblx0XHRcdFx0dGhpcy5sYXN0U3luY2VkTGFiZWwgPSBsYXN0U3luY2VkTGFiZWw7XG5cdFx0XHRcdHRoaXMudXBkYXRlSW5wdXRBcmlhTGFiZWwoKTtcblx0XHRcdH0pKTtcblx0XHR9XG5cblx0XHR0aGlzLmNvbnRyb2xzRWxlbWVudCA9IERPTS5hcHBlbmQodGhpcy5zZWFyY2hDb250YWluZXIsIERPTS4kKCcuc2VhcmNoLWNvbnRhaW5lci13aWRnZXRzJykpO1xuXG5cdFx0dGhpcy5jb3VudEVsZW1lbnQgPSBET00uYXBwZW5kKHRoaXMuY29udHJvbHNFbGVtZW50LCBET00uJCgnLnNldHRpbmdzLWNvdW50LXdpZGdldC5tb25hY28tY291bnQtYmFkZ2UubG9uZycpKTtcblxuXHRcdHRoaXMuc2VhcmNoSW5wdXRBY3Rpb25CYXIgPSB0aGlzLl9yZWdpc3RlcihuZXcgQWN0aW9uQmFyKHRoaXMuY29udHJvbHNFbGVtZW50LCB7XG5cdFx0XHRhY3Rpb25WaWV3SXRlbVByb3ZpZGVyOiAoYWN0aW9uLCBvcHRpb25zKSA9PiB7XG5cdFx0XHRcdGlmIChhY3Rpb24uaWQgPT09IGZpbHRlckFjdGlvbi5pZCkge1xuXHRcdFx0XHRcdHJldHVybiB0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFNldHRpbmdzU2VhcmNoRmlsdGVyRHJvcGRvd25NZW51QWN0aW9uVmlld0l0ZW0sIGFjdGlvbiwgb3B0aW9ucywgdGhpcy5hY3Rpb25SdW5uZXIsIHRoaXMuc2VhcmNoV2lkZ2V0KTtcblx0XHRcdFx0fVxuXHRcdFx0XHRpZiAodGhpcy5zaG93QWlSZXN1bHRzQWN0aW9uICYmIGFjdGlvbi5pZCA9PT0gdGhpcy5zaG93QWlSZXN1bHRzQWN0aW9uLmlkKSB7XG5cdFx0XHRcdFx0Y29uc3Qga2V5YmluZGluZ0xhYmVsID0gdGhpcy5rZXliaW5kaW5nU2VydmljZS5sb29rdXBLZXliaW5kaW5nKFNFVFRJTkdTX0VESVRPUl9DT01NQU5EX1RPR0dMRV9BSV9TRUFSQ0gpPy5nZXRMYWJlbCgpO1xuXHRcdFx0XHRcdHJldHVybiBuZXcgVG9nZ2xlQWN0aW9uVmlld0l0ZW0obnVsbCwgYWN0aW9uLCB7IC4uLm9wdGlvbnMsIGtleWJpbmRpbmc6IGtleWJpbmRpbmdMYWJlbCwgdG9nZ2xlU3R5bGVzOiBkZWZhdWx0VG9nZ2xlU3R5bGVzIH0pO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXG5cdFx0Y29uc3QgYWN0aW9uc1RvUHVzaCA9IFtjbGVhcklucHV0QWN0aW9uLCBmaWx0ZXJBY3Rpb25dO1xuXHRcdHRoaXMuc2VhcmNoSW5wdXRBY3Rpb25CYXIucHVzaChhY3Rpb25zVG9QdXNoLCB7IGxhYmVsOiBmYWxzZSwgaWNvbjogdHJ1ZSB9KTtcblxuXHRcdHRoaXMuZGlzYWJsZUFpU2VhcmNoVG9nZ2xlKCk7XG5cdFx0dGhpcy51cGRhdGVBaVNlYXJjaFRvZ2dsZVZpc2liaWxpdHkoKTtcblx0fVxuXG5cdHRvZ2dsZUFpU2VhcmNoKCk6IHZvaWQge1xuXHRcdGlmICh0aGlzLnNlYXJjaElucHV0QWN0aW9uQmFyICYmIHRoaXMuc2hvd0FpUmVzdWx0c0FjdGlvbiAmJiB0aGlzLnNlYXJjaElucHV0QWN0aW9uQmFyLmhhc0FjdGlvbih0aGlzLnNob3dBaVJlc3VsdHNBY3Rpb24pKSB7XG5cdFx0XHRpZiAoIXRoaXMuc2hvd0FpUmVzdWx0c0FjdGlvbi5lbmFibGVkKSB7XG5cdFx0XHRcdGFyaWEuc3RhdHVzKGxvY2FsaXplKCdub0FpUmVzdWx0cycsIFwiTm8gQUkgcmVzdWx0cyBhdmFpbGFibGUgYXQgdGhpcyB0aW1lLlwiKSk7XG5cdFx0XHR9XG5cdFx0XHR0aGlzLnNob3dBaVJlc3VsdHNBY3Rpb24uY2hlY2tlZCA9ICF0aGlzLnNob3dBaVJlc3VsdHNBY3Rpb24uY2hlY2tlZDtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIG9uRGlkVG9nZ2xlQWlTZWFyY2goKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0aWYgKHRoaXMuc2VhcmNoUmVzdWx0TW9kZWwgJiYgdGhpcy5zaG93QWlSZXN1bHRzQWN0aW9uKSB7XG5cdFx0XHR0aGlzLnNlYXJjaFJlc3VsdE1vZGVsLnNob3dBaVJlc3VsdHMgPSB0aGlzLnNob3dBaVJlc3VsdHNBY3Rpb24uY2hlY2tlZCA/PyBmYWxzZTtcblx0XHRcdHRoaXMucmVuZGVyUmVzdWx0Q291bnRNZXNzYWdlcyhmYWxzZSk7XG5cdFx0XHR0aGlzLm9uRGlkRmluaXNoU2VhcmNoKHRydWUsIHVuZGVmaW5lZCk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBvbkRpZFNldHRpbmdzVGFyZ2V0Q2hhbmdlKHRhcmdldDogU2V0dGluZ3NUYXJnZXQpOiB2b2lkIHtcblx0XHR0aGlzLnZpZXdTdGF0ZS5zZXR0aW5nc1RhcmdldCA9IHRhcmdldDtcblxuXHRcdC8vIFRPRE8gSW5zdGVhZCBvZiByZWJ1aWxkaW5nIHRoZSB3aG9sZSBtb2RlbCwgcmVmcmVzaCBhbmQgdW5jYWNoZSB0aGUgaW5zcGVjdGVkIHNldHRpbmcgdmFsdWVcblx0XHR0aGlzLm9uQ29uZmlnVXBkYXRlKHVuZGVmaW5lZCwgdHJ1ZSk7XG5cdH1cblxuXHRwcml2YXRlIG9uRGlkRGlzbWlzc0V4dGVuc2lvblNldHRpbmcoZXh0ZW5zaW9uSWQ6IHN0cmluZyk6IHZvaWQge1xuXHRcdGlmICghdGhpcy5kaXNtaXNzZWRFeHRlbnNpb25TZXR0aW5ncy5pbmNsdWRlcyhleHRlbnNpb25JZCkpIHtcblx0XHRcdHRoaXMuZGlzbWlzc2VkRXh0ZW5zaW9uU2V0dGluZ3MucHVzaChleHRlbnNpb25JZCk7XG5cdFx0fVxuXHRcdHRoaXMuc3RvcmFnZVNlcnZpY2Uuc3RvcmUoXG5cdFx0XHR0aGlzLkRJU01JU1NFRF9FWFRFTlNJT05fU0VUVElOR1NfU1RPUkFHRV9LRVksXG5cdFx0XHR0aGlzLmRpc21pc3NlZEV4dGVuc2lvblNldHRpbmdzLmpvaW4odGhpcy5ESVNNSVNTRURfRVhURU5TSU9OX1NFVFRJTkdTX0RFTElNSVRFUiksXG5cdFx0XHRTdG9yYWdlU2NvcGUuUFJPRklMRSxcblx0XHRcdFN0b3JhZ2VUYXJnZXQuVVNFUlxuXHRcdCk7XG5cdFx0dGhpcy5vbkNvbmZpZ1VwZGF0ZSh1bmRlZmluZWQsIHRydWUpO1xuXHR9XG5cblx0cHJpdmF0ZSBvbkRpZENsaWNrU2V0dGluZyhldnQ6IElTZXR0aW5nTGlua0NsaWNrRXZlbnQsIHJlY3Vyc2VkPzogYm9vbGVhbik6IHZvaWQge1xuXHRcdC8vIGVzbGludC1kaXNhYmxlLW5leHQtbGluZSBuby1yZXN0cmljdGVkLXN5bnRheFxuXHRcdGNvbnN0IHRhcmdldEVsZW1lbnQgPSB0aGlzLmN1cnJlbnRTZXR0aW5nc01vZGVsPy5nZXRFbGVtZW50c0J5TmFtZShldnQudGFyZ2V0S2V5KT8uWzBdO1xuXHRcdGxldCByZXZlYWxGYWlsZWQgPSBmYWxzZTtcblx0XHRpZiAodGFyZ2V0RWxlbWVudCkge1xuXHRcdFx0bGV0IHNvdXJjZVRvcCA9IDAuNTtcblx0XHRcdHRyeSB7XG5cdFx0XHRcdGNvbnN0IF9zb3VyY2VUb3AgPSB0aGlzLnNldHRpbmdzVHJlZS5nZXRSZWxhdGl2ZVRvcChldnQuc291cmNlKTtcblx0XHRcdFx0aWYgKF9zb3VyY2VUb3AgIT09IG51bGwpIHtcblx0XHRcdFx0XHRzb3VyY2VUb3AgPSBfc291cmNlVG9wO1xuXHRcdFx0XHR9XG5cdFx0XHR9IGNhdGNoIHtcblx0XHRcdFx0Ly8gZS5nLiBjbGlja2VkIGEgc2VhcmNoZWQgZWxlbWVudCwgbm93IHRoZSBzZWFyY2ggaGFzIGJlZW4gY2xlYXJlZFxuXHRcdFx0fVxuXG5cdFx0XHQvLyBJZiB3ZSBzZWFyY2ggZm9yIHNvbWV0aGluZyBhbmQgZm9jdXMgb24gYSBjYXRlZ29yeSwgdGhlIHNldHRpbmdzIHRyZWVcblx0XHRcdC8vIG9ubHkgcmVuZGVycyBzZXR0aW5ncyBpbiB0aGF0IGNhdGVnb3J5LlxuXHRcdFx0Ly8gSWYgdGhlIHRhcmdldCBkaXNwbGF5IGNhdGVnb3J5IGlzIGRpZmZlcmVudCB0aGFuIHRoZSBzb3VyY2UncywgdW5mb2N1cyB0aGUgY2F0ZWdvcnlcblx0XHRcdC8vIHNvIHRoYXQgd2UgY2FuIHJlbmRlciBhbGwgZm91bmQgc2V0dGluZ3MgYWdhaW4uXG5cdFx0XHQvLyBUaGVuLCB0aGUgcmV2ZWFsIGNhbGwgd2lsbCBjb3JyZWN0bHkgZmluZCB0aGUgdGFyZ2V0IHNldHRpbmcuXG5cdFx0XHRpZiAodGhpcy52aWV3U3RhdGUuY2F0ZWdvcnlGaWx0ZXIgJiYgZXZ0LnNvdXJjZS5kaXNwbGF5Q2F0ZWdvcnkgIT09IHRhcmdldEVsZW1lbnQuZGlzcGxheUNhdGVnb3J5KSB7XG5cdFx0XHRcdHRoaXMudG9jVHJlZS5zZXRGb2N1cyhbXSk7XG5cdFx0XHR9XG5cdFx0XHR0cnkge1xuXHRcdFx0XHR0aGlzLnNldHRpbmdzVHJlZS5yZXZlYWwodGFyZ2V0RWxlbWVudCwgc291cmNlVG9wKTtcblx0XHRcdH0gY2F0Y2ggKF8pIHtcblx0XHRcdFx0Ly8gVGhlIGxpc3R3aWRnZXQgY291bGRuJ3QgZmluZCB0aGUgc2V0dGluZyB0byByZXZlYWwsXG5cdFx0XHRcdC8vIGV2ZW4gdGhvdWdoIGl0J3MgaW4gdGhlIG1vZGVsLCBtZWFuaW5nIHRoZXJlIG1pZ2h0IGJlIGEgZmlsdGVyXG5cdFx0XHRcdC8vIHByZXZlbnRpbmcgaXQgZnJvbSBzaG93aW5nIHVwLlxuXHRcdFx0XHRyZXZlYWxGYWlsZWQgPSB0cnVlO1xuXHRcdFx0fVxuXG5cdFx0XHRpZiAoIXJldmVhbEZhaWxlZCkge1xuXHRcdFx0XHQvLyBXZSBuZWVkIHRvIHNoaWZ0IGZvY3VzIGZyb20gdGhlIHNldHRpbmcgdGhhdCBjb250YWlucyB0aGUgbGluayB0byB0aGUgc2V0dGluZyB0aGF0J3Ncblx0XHRcdFx0Ly8gbGlua2VkLiBDbGlja2luZyBvbiB0aGUgbGluayBzZXRzIGZvY3VzIG9uIHRoZSBzZXR0aW5nIHRoYXQgY29udGFpbnMgdGhlIGxpbmssXG5cdFx0XHRcdC8vIHdoaWNoIGlzIHdoeSB3ZSBuZWVkIHRoZSBzZXRUaW1lb3V0LlxuXHRcdFx0XHRzZXRUaW1lb3V0KCgpID0+IHtcblx0XHRcdFx0XHR0aGlzLnNldHRpbmdzVHJlZS5zZXRGb2N1cyhbdGFyZ2V0RWxlbWVudF0pO1xuXHRcdFx0XHR9LCA1MCk7XG5cblx0XHRcdFx0Y29uc3QgZG9tRWxlbWVudHMgPSB0aGlzLnNldHRpbmdSZW5kZXJlcnMuZ2V0RE9NRWxlbWVudHNGb3JTZXR0aW5nS2V5KHRoaXMuc2V0dGluZ3NUcmVlLmdldEhUTUxFbGVtZW50KCksIGV2dC50YXJnZXRLZXkpO1xuXHRcdFx0XHRpZiAoZG9tRWxlbWVudHMgJiYgZG9tRWxlbWVudHNbMF0pIHtcblx0XHRcdFx0XHQvLyBlc2xpbnQtZGlzYWJsZS1uZXh0LWxpbmUgbm8tcmVzdHJpY3RlZC1zeW50YXhcblx0XHRcdFx0XHRjb25zdCBjb250cm9sID0gZG9tRWxlbWVudHNbMF0ucXVlcnlTZWxlY3RvcihBYnN0cmFjdFNldHRpbmdSZW5kZXJlci5DT05UUk9MX1NFTEVDVE9SKTtcblx0XHRcdFx0XHRpZiAoY29udHJvbCkge1xuXHRcdFx0XHRcdFx0KDxIVE1MRWxlbWVudD5jb250cm9sKS5mb2N1cygpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblxuXHRcdGlmICghcmVjdXJzZWQgJiYgKCF0YXJnZXRFbGVtZW50IHx8IHJldmVhbEZhaWxlZCkpIHtcblx0XHRcdC8vIFNlYXJjaCBmb3IgdGhlIHRhcmdldCBzZXR0aW5nIGJ5IElEIHNvIGl0IGJlY29tZXMgdmlzaWJsZSxcblx0XHRcdC8vIGV2ZW4gaWYgaXQncyBhbiBhZHZhbmNlZCBzZXR0aW5nIHRoYXQgd291bGQgYmUgaGlkZGVuIHdpdGggYW4gZW1wdHkgcXVlcnkuXG5cdFx0XHRjb25zdCBpZFF1ZXJ5ID0gYEBpZDoke2V2dC50YXJnZXRLZXl9YDtcblx0XHRcdC8vIFNldCB0aGUgd2lkZ2V0IHZhbHVlIGZpcnN0LCB0aGVuIGNhbmNlbCB0aGUgZGVib3VuY2VkIHNlYXJjaCBpdCB0cmlnZ2Vycyxcblx0XHRcdC8vIHNvIHRoYXQgb25seSB0aGUgZGlyZWN0IHRyaWdnZXJTZWFyY2ggY2FsbCBiZWxvdyBydW5zLlxuXHRcdFx0dGhpcy5zZWFyY2hXaWRnZXQuc2V0VmFsdWUoaWRRdWVyeSk7XG5cdFx0XHR0aGlzLnNlYXJjaElucHV0RGVsYXllci5jYW5jZWwoKTtcblx0XHRcdGNvbnN0IHAgPSB0aGlzLnRyaWdnZXJTZWFyY2goaWRRdWVyeSwgdHJ1ZSk7XG5cdFx0XHRwLnRoZW4oKCkgPT4ge1xuXHRcdFx0XHR0aGlzLm9uRGlkQ2xpY2tTZXR0aW5nKGV2dCwgdHJ1ZSk7XG5cdFx0XHR9KTtcblx0XHR9XG5cdH1cblxuXHRzd2l0Y2hUb1NldHRpbmdzRmlsZSgpOiBQcm9taXNlPElFZGl0b3JQYW5lIHwgdW5kZWZpbmVkPiB7XG5cdFx0Y29uc3QgcXVlcnkgPSBwYXJzZVF1ZXJ5KHRoaXMuc2VhcmNoV2lkZ2V0LmdldFZhbHVlKCkpLnF1ZXJ5O1xuXHRcdHJldHVybiB0aGlzLm9wZW5TZXR0aW5nc0ZpbGUoeyBxdWVyeSB9KTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgb3BlblNldHRpbmdzRmlsZShvcHRpb25zPzogSVNldHRpbmdzRWRpdG9yT3B0aW9ucyk6IFByb21pc2U8SUVkaXRvclBhbmUgfCB1bmRlZmluZWQ+IHtcblx0XHRjb25zdCBjdXJyZW50U2V0dGluZ3NUYXJnZXQgPSB0aGlzLnNldHRpbmdzVGFyZ2V0c1dpZGdldC5zZXR0aW5nc1RhcmdldDtcblxuXHRcdGNvbnN0IG9wZW5PcHRpb25zOiBJT3BlblNldHRpbmdzT3B0aW9ucyA9IHsganNvbkVkaXRvcjogdHJ1ZSwgZ3JvdXBJZDogdGhpcy5ncm91cC5pZCwgLi4ub3B0aW9ucyB9O1xuXHRcdGlmIChjdXJyZW50U2V0dGluZ3NUYXJnZXQgPT09IENvbmZpZ3VyYXRpb25UYXJnZXQuVVNFUl9MT0NBTCkge1xuXHRcdFx0aWYgKG9wdGlvbnM/LnJldmVhbFNldHRpbmcpIHtcblx0XHRcdFx0Y29uc3QgY29uZmlndXJhdGlvblByb3BlcnRpZXMgPSBSZWdpc3RyeS5hczxJQ29uZmlndXJhdGlvblJlZ2lzdHJ5PihFeHRlbnNpb25zLkNvbmZpZ3VyYXRpb24pLmdldENvbmZpZ3VyYXRpb25Qcm9wZXJ0aWVzKCk7XG5cdFx0XHRcdGNvbnN0IGNvbmZpZ3VyYXRpb25TY29wZSA9IGNvbmZpZ3VyYXRpb25Qcm9wZXJ0aWVzW29wdGlvbnM/LnJldmVhbFNldHRpbmcua2V5XT8uc2NvcGU7XG5cdFx0XHRcdGlmIChjb25maWd1cmF0aW9uU2NvcGUgJiYgQVBQTElDQVRJT05fU0NPUEVTLmluY2x1ZGVzKGNvbmZpZ3VyYXRpb25TY29wZSkpIHtcblx0XHRcdFx0XHRyZXR1cm4gdGhpcy5wcmVmZXJlbmNlc1NlcnZpY2Uub3BlbkFwcGxpY2F0aW9uU2V0dGluZ3Mob3Blbk9wdGlvbnMpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm4gdGhpcy5wcmVmZXJlbmNlc1NlcnZpY2Uub3BlblVzZXJTZXR0aW5ncyhvcGVuT3B0aW9ucyk7XG5cdFx0fSBlbHNlIGlmIChjdXJyZW50U2V0dGluZ3NUYXJnZXQgPT09IENvbmZpZ3VyYXRpb25UYXJnZXQuVVNFUl9SRU1PVEUpIHtcblx0XHRcdHJldHVybiB0aGlzLnByZWZlcmVuY2VzU2VydmljZS5vcGVuUmVtb3RlU2V0dGluZ3Mob3Blbk9wdGlvbnMpO1xuXHRcdH0gZWxzZSBpZiAoY3VycmVudFNldHRpbmdzVGFyZ2V0ID09PSBDb25maWd1cmF0aW9uVGFyZ2V0LldPUktTUEFDRSkge1xuXHRcdFx0cmV0dXJuIHRoaXMucHJlZmVyZW5jZXNTZXJ2aWNlLm9wZW5Xb3Jrc3BhY2VTZXR0aW5ncyhvcGVuT3B0aW9ucyk7XG5cdFx0fSBlbHNlIGlmIChVUkkuaXNVcmkoY3VycmVudFNldHRpbmdzVGFyZ2V0KSkge1xuXHRcdFx0cmV0dXJuIHRoaXMucHJlZmVyZW5jZXNTZXJ2aWNlLm9wZW5Gb2xkZXJTZXR0aW5ncyh7IGZvbGRlclVyaTogY3VycmVudFNldHRpbmdzVGFyZ2V0LCAuLi5vcGVuT3B0aW9ucyB9KTtcblx0XHR9XG5cblx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHR9XG5cblx0cHJpdmF0ZSBjcmVhdGVCb2R5KHBhcmVudDogSFRNTEVsZW1lbnQpOiB2b2lkIHtcblx0XHR0aGlzLmJvZHlDb250YWluZXIgPSBET00uYXBwZW5kKHBhcmVudCwgJCgnLnNldHRpbmdzLWJvZHknKSk7XG5cblx0XHR0aGlzLm5vUmVzdWx0c01lc3NhZ2UgPSBET00uYXBwZW5kKHRoaXMuYm9keUNvbnRhaW5lciwgJCgnLm5vLXJlc3VsdHMtbWVzc2FnZScpKTtcblxuXHRcdHRoaXMubm9SZXN1bHRzTWVzc2FnZS5pbm5lclRleHQgPSBsb2NhbGl6ZSgnbm9SZXN1bHRzJywgXCJObyBTZXR0aW5ncyBGb3VuZFwiKTtcblxuXHRcdHRoaXMuY2xlYXJGaWx0ZXJMaW5rQ29udGFpbmVyID0gJCgnc3Bhbi5jbGVhci1zZWFyY2gtZmlsdGVycycpO1xuXG5cdFx0dGhpcy5jbGVhckZpbHRlckxpbmtDb250YWluZXIudGV4dENvbnRlbnQgPSAnIC0gJztcblx0XHRjb25zdCBjbGVhckZpbHRlckxpbmsgPSBET00uYXBwZW5kKHRoaXMuY2xlYXJGaWx0ZXJMaW5rQ29udGFpbmVyLCAkKCdhLnBvaW50ZXIucHJvbWluZW50JywgeyB0YWJpbmRleDogMCB9LCBsb2NhbGl6ZSgnY2xlYXJTZWFyY2hGaWx0ZXJzJywgJ0NsZWFyIEZpbHRlcnMnKSkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKERPTS5hZGREaXNwb3NhYmxlTGlzdGVuZXIoY2xlYXJGaWx0ZXJMaW5rLCBET00uRXZlbnRUeXBlLkNMSUNLLCAoZTogTW91c2VFdmVudCkgPT4ge1xuXHRcdFx0RE9NLkV2ZW50SGVscGVyLnN0b3AoZSwgZmFsc2UpO1xuXHRcdFx0dGhpcy5jbGVhclNlYXJjaEZpbHRlcnMoKTtcblx0XHR9KSk7XG5cblx0XHRET00uYXBwZW5kKHRoaXMubm9SZXN1bHRzTWVzc2FnZSwgdGhpcy5jbGVhckZpbHRlckxpbmtDb250YWluZXIpO1xuXG5cdFx0dGhpcy5ub1Jlc3VsdHNNZXNzYWdlLnN0eWxlLmNvbG9yID0gYXNDc3NWYXJpYWJsZShlZGl0b3JGb3JlZ3JvdW5kKTtcblxuXHRcdHRoaXMudG9jVHJlZUNvbnRhaW5lciA9ICQoJy5zZXR0aW5ncy10b2MtY29udGFpbmVyJyk7XG5cdFx0dGhpcy5zZXR0aW5nc1RyZWVDb250YWluZXIgPSAkKCcuc2V0dGluZ3MtdHJlZS1jb250YWluZXInKTtcblxuXHRcdHRoaXMuY3JlYXRlVE9DKHRoaXMudG9jVHJlZUNvbnRhaW5lcik7XG5cdFx0dGhpcy5jcmVhdGVTZXR0aW5nc1RyZWUodGhpcy5zZXR0aW5nc1RyZWVDb250YWluZXIpO1xuXG5cdFx0dGhpcy5zcGxpdFZpZXcgPSB0aGlzLl9yZWdpc3RlcihuZXcgU3BsaXRWaWV3KHRoaXMuYm9keUNvbnRhaW5lciwge1xuXHRcdFx0b3JpZW50YXRpb246IE9yaWVudGF0aW9uLkhPUklaT05UQUwsXG5cdFx0XHRwcm9wb3J0aW9uYWxMYXlvdXQ6IHRydWVcblx0XHR9KSk7XG5cdFx0Y29uc3Qgc3RhcnRpbmdXaWR0aCA9IHRoaXMuc3RvcmFnZVNlcnZpY2UuZ2V0TnVtYmVyKCdzZXR0aW5nc0VkaXRvcjIuc3BsaXRWaWV3V2lkdGgnLCBTdG9yYWdlU2NvcGUuUFJPRklMRSwgU2V0dGluZ3NFZGl0b3IyLlRPQ19SRVNFVF9XSURUSCk7XG5cdFx0dGhpcy5zcGxpdFZpZXcuYWRkVmlldyh7XG5cdFx0XHRvbkRpZENoYW5nZTogRXZlbnQuTm9uZSxcblx0XHRcdGVsZW1lbnQ6IHRoaXMudG9jVHJlZUNvbnRhaW5lcixcblx0XHRcdG1pbmltdW1TaXplOiBTZXR0aW5nc0VkaXRvcjIuVE9DX01JTl9XSURUSCxcblx0XHRcdG1heGltdW1TaXplOiBOdW1iZXIuUE9TSVRJVkVfSU5GSU5JVFksXG5cdFx0XHRsYXlvdXQ6ICh3aWR0aCwgXywgaGVpZ2h0KSA9PiB7XG5cdFx0XHRcdHRoaXMudG9jVHJlZUNvbnRhaW5lci5zdHlsZS53aWR0aCA9IGAke3dpZHRofXB4YDtcblx0XHRcdFx0dGhpcy50b2NUcmVlLmxheW91dChoZWlnaHQsIHdpZHRoKTtcblx0XHRcdH1cblx0XHR9LCBzdGFydGluZ1dpZHRoLCB1bmRlZmluZWQsIHRydWUpO1xuXHRcdHRoaXMuc3BsaXRWaWV3LmFkZFZpZXcoe1xuXHRcdFx0b25EaWRDaGFuZ2U6IEV2ZW50Lk5vbmUsXG5cdFx0XHRlbGVtZW50OiB0aGlzLnNldHRpbmdzVHJlZUNvbnRhaW5lcixcblx0XHRcdG1pbmltdW1TaXplOiBTZXR0aW5nc0VkaXRvcjIuRURJVE9SX01JTl9XSURUSCxcblx0XHRcdG1heGltdW1TaXplOiBOdW1iZXIuUE9TSVRJVkVfSU5GSU5JVFksXG5cdFx0XHRsYXlvdXQ6ICh3aWR0aCwgXywgaGVpZ2h0KSA9PiB7XG5cdFx0XHRcdHRoaXMuc2V0dGluZ3NUcmVlQ29udGFpbmVyLnN0eWxlLndpZHRoID0gYCR7d2lkdGh9cHhgO1xuXHRcdFx0XHR0aGlzLnNldHRpbmdzVHJlZS5sYXlvdXQoaGVpZ2h0LCB3aWR0aCk7XG5cdFx0XHR9XG5cdFx0fSwgU2l6aW5nLkRpc3RyaWJ1dGUsIHVuZGVmaW5lZCwgdHJ1ZSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5zcGxpdFZpZXcub25EaWRTYXNoUmVzZXQoKCkgPT4ge1xuXHRcdFx0Y29uc3QgdG90YWxTaXplID0gdGhpcy5zcGxpdFZpZXcuZ2V0Vmlld1NpemUoMCkgKyB0aGlzLnNwbGl0Vmlldy5nZXRWaWV3U2l6ZSgxKTtcblx0XHRcdHRoaXMuc3BsaXRWaWV3LnJlc2l6ZVZpZXcoMCwgU2V0dGluZ3NFZGl0b3IyLlRPQ19SRVNFVF9XSURUSCk7XG5cdFx0XHR0aGlzLnNwbGl0Vmlldy5yZXNpemVWaWV3KDEsIHRvdGFsU2l6ZSAtIFNldHRpbmdzRWRpdG9yMi5UT0NfUkVTRVRfV0lEVEgpO1xuXHRcdH0pKTtcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLnNwbGl0Vmlldy5vbkRpZFNhc2hDaGFuZ2UoKCkgPT4ge1xuXHRcdFx0Y29uc3Qgd2lkdGggPSB0aGlzLnNwbGl0Vmlldy5nZXRWaWV3U2l6ZSgwKTtcblx0XHRcdHRoaXMuc3RvcmFnZVNlcnZpY2Uuc3RvcmUoJ3NldHRpbmdzRWRpdG9yMi5zcGxpdFZpZXdXaWR0aCcsIHdpZHRoLCBTdG9yYWdlU2NvcGUuUFJPRklMRSwgU3RvcmFnZVRhcmdldC5VU0VSKTtcblx0XHR9KSk7XG5cdFx0Y29uc3QgYm9yZGVyQ29sb3IgPSB0aGlzLnRoZW1lLmdldENvbG9yKHNldHRpbmdzU2FzaEJvcmRlcikhO1xuXHRcdHRoaXMuc3BsaXRWaWV3LnN0eWxlKHsgc2VwYXJhdG9yQm9yZGVyOiBib3JkZXJDb2xvciB9KTtcblx0fVxuXG5cdHByaXZhdGUgYWRkQ3RybEFJbnRlcmNlcHRvcihjb250YWluZXI6IEhUTUxFbGVtZW50KTogdm9pZCB7XG5cdFx0dGhpcy5fcmVnaXN0ZXIoRE9NLmFkZFN0YW5kYXJkRGlzcG9zYWJsZUxpc3RlbmVyKGNvbnRhaW5lciwgRE9NLkV2ZW50VHlwZS5LRVlfRE9XTiwgKGU6IFN0YW5kYXJkS2V5Ym9hcmRFdmVudCkgPT4ge1xuXHRcdFx0aWYgKFxuXHRcdFx0XHRlLmtleUNvZGUgPT09IEtleUNvZGUuS2V5QSAmJlxuXHRcdFx0XHQocGxhdGZvcm0uaXNNYWNpbnRvc2ggPyBlLm1ldGFLZXkgOiBlLmN0cmxLZXkpICYmXG5cdFx0XHRcdCFET00uaXNFZGl0YWJsZUVsZW1lbnQoZS50YXJnZXQpXG5cdFx0XHQpIHtcblx0XHRcdFx0Ly8gQXZvaWQgYnJvd3NlciBjdHJsK2Fcblx0XHRcdFx0ZS5icm93c2VyRXZlbnQuc3RvcFByb3BhZ2F0aW9uKCk7XG5cdFx0XHRcdGUuYnJvd3NlckV2ZW50LnByZXZlbnREZWZhdWx0KCk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXHR9XG5cblx0cHJpdmF0ZSBjcmVhdGVUT0MoY29udGFpbmVyOiBIVE1MRWxlbWVudCk6IHZvaWQge1xuXHRcdHRoaXMudG9jVHJlZU1vZGVsID0gdGhpcy5pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShUT0NUcmVlTW9kZWwsIHRoaXMudmlld1N0YXRlKTtcblxuXHRcdHRoaXMudG9jVHJlZSA9IHRoaXMuX3JlZ2lzdGVyKHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoVE9DVHJlZSxcblx0XHRcdERPTS5hcHBlbmQoY29udGFpbmVyLCAkKCcuc2V0dGluZ3MtdG9jLXdyYXBwZXInLCB7XG5cdFx0XHRcdCdyb2xlJzogJ25hdmlnYXRpb24nLFxuXHRcdFx0XHQnYXJpYS1sYWJlbCc6IGxvY2FsaXplKCdzZXR0aW5ncycsIFwiU2V0dGluZ3NcIiksXG5cdFx0XHR9KSksXG5cdFx0XHR0aGlzLnZpZXdTdGF0ZSkpO1xuXHRcdHRoaXMudG9jVHJlZURpc3Bvc2VkID0gZmFsc2U7XG5cblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLnRvY1RyZWUub25EaWRGb2N1cygoKSA9PiB7XG5cdFx0XHR0aGlzLl9jdXJyZW50Rm9jdXNDb250ZXh0ID0gU2V0dGluZ3NGb2N1c0NvbnRleHQuVGFibGVPZkNvbnRlbnRzO1xuXHRcdH0pKTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMudG9jVHJlZS5vbkRpZENoYW5nZUZvY3VzKGUgPT4ge1xuXHRcdFx0Y29uc3QgZWxlbWVudDogU2V0dGluZ3NUcmVlR3JvdXBFbGVtZW50IHwgbnVsbCA9IGUuZWxlbWVudHM/LlswXSA/PyBudWxsO1xuXHRcdFx0aWYgKHRoaXMudG9jRm9jdXNlZEVsZW1lbnQgPT09IGVsZW1lbnQpIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXG5cdFx0XHR0aGlzLnRvY0ZvY3VzZWRFbGVtZW50ID0gZWxlbWVudDtcblx0XHRcdHRoaXMudG9jVHJlZS5zZXRTZWxlY3Rpb24oZWxlbWVudCA/IFtlbGVtZW50XSA6IFtdKTtcblxuXHRcdFx0Ly8gRmlsdGVyIHRvIHNob3cgb25seSB0aGUgc2VsZWN0ZWQgY2F0ZWdvcnlcblx0XHRcdGlmICh0aGlzLnZpZXdTdGF0ZS5jYXRlZ29yeUZpbHRlciAhPT0gZWxlbWVudCkge1xuXHRcdFx0XHR0aGlzLnZpZXdTdGF0ZS5jYXRlZ29yeUZpbHRlciA9IGVsZW1lbnQgPz8gdW5kZWZpbmVkO1xuXHRcdFx0XHQvLyBGb3JjZSByZW5kZXIgaW4gdGhpcyBjYXNlLCBiZWNhdXNlXG5cdFx0XHRcdC8vIG9uRGlkQ2xpY2tTZXR0aW5nIHJlbGllcyBvbiB0aGUgdXBkYXRlZCB2aWV3LlxuXHRcdFx0XHR0aGlzLnJlbmRlclRyZWUodW5kZWZpbmVkLCB0cnVlKTtcblx0XHRcdFx0dGhpcy5zZXR0aW5nc1RyZWUuc2Nyb2xsVG9wID0gMDtcblx0XHRcdH1cblx0XHR9KSk7XG5cblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLnRvY1RyZWUub25EaWRGb2N1cygoKSA9PiB7XG5cdFx0XHR0aGlzLnRvY1Jvd0ZvY3VzZWQuc2V0KHRydWUpO1xuXHRcdH0pKTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMudG9jVHJlZS5vbkRpZEJsdXIoKCkgPT4ge1xuXHRcdFx0dGhpcy50b2NSb3dGb2N1c2VkLnNldChmYWxzZSk7XG5cdFx0fSkpO1xuXG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy50b2NUcmVlLm9uRGlkRGlzcG9zZSgoKSA9PiB7XG5cdFx0XHR0aGlzLnRvY1RyZWVEaXNwb3NlZCA9IHRydWU7XG5cdFx0fSkpO1xuXHR9XG5cblx0cHJpdmF0ZSBhcHBseUZpbHRlcihmaWx0ZXI6IHN0cmluZykge1xuXHRcdGlmICh0aGlzLnNlYXJjaFdpZGdldCAmJiAhdGhpcy5zZWFyY2hXaWRnZXQuZ2V0VmFsdWUoKS5pbmNsdWRlcyhmaWx0ZXIpKSB7XG5cdFx0XHQvLyBQcmVwZW5kIHRoZSBmaWx0ZXIgdG8gdGhlIHF1ZXJ5LlxuXHRcdFx0Y29uc3QgbmV3UXVlcnkgPSBgJHtmaWx0ZXJ9ICR7dGhpcy5zZWFyY2hXaWRnZXQuZ2V0VmFsdWUoKS50cmltU3RhcnQoKX1gO1xuXHRcdFx0dGhpcy5mb2N1c1NlYXJjaChuZXdRdWVyeSwgZmFsc2UpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgcmVtb3ZlTGFuZ3VhZ2VGaWx0ZXJzKCkge1xuXHRcdGlmICh0aGlzLnNlYXJjaFdpZGdldCAmJiB0aGlzLnNlYXJjaFdpZGdldC5nZXRWYWx1ZSgpLmluY2x1ZGVzKGBAJHtMQU5HVUFHRV9TRVRUSU5HX1RBR31gKSkge1xuXHRcdFx0Y29uc3QgcXVlcnkgPSB0aGlzLnNlYXJjaFdpZGdldC5nZXRWYWx1ZSgpLnNwbGl0KCcgJyk7XG5cdFx0XHRjb25zdCBuZXdRdWVyeSA9IHF1ZXJ5LmZpbHRlcih3b3JkID0+ICF3b3JkLnN0YXJ0c1dpdGgoYEAke0xBTkdVQUdFX1NFVFRJTkdfVEFHfWApKS5qb2luKCcgJyk7XG5cdFx0XHR0aGlzLmZvY3VzU2VhcmNoKG5ld1F1ZXJ5LCBmYWxzZSk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBjcmVhdGVTZXR0aW5nc1RyZWUoY29udGFpbmVyOiBIVE1MRWxlbWVudCk6IHZvaWQge1xuXHRcdHRoaXMuc2V0dGluZ1JlbmRlcmVycyA9IHRoaXMuX3JlZ2lzdGVyKHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoU2V0dGluZ1RyZWVSZW5kZXJlcnMpKTtcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLnNldHRpbmdSZW5kZXJlcnMub25EaWRDaGFuZ2VTZXR0aW5nKGUgPT4gdGhpcy5vbkRpZENoYW5nZVNldHRpbmcoZS5rZXksIGUudmFsdWUsIGUudHlwZSwgZS5tYW51YWxSZXNldCwgZS5zY29wZSkpKTtcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLnNldHRpbmdSZW5kZXJlcnMub25EaWREaXNtaXNzRXh0ZW5zaW9uU2V0dGluZygoZSkgPT4gdGhpcy5vbkRpZERpc21pc3NFeHRlbnNpb25TZXR0aW5nKGUpKSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5zZXR0aW5nUmVuZGVyZXJzLm9uRGlkT3BlblNldHRpbmdzKHNldHRpbmdLZXkgPT4ge1xuXHRcdFx0dGhpcy5vcGVuU2V0dGluZ3NGaWxlKHsgcmV2ZWFsU2V0dGluZzogeyBrZXk6IHNldHRpbmdLZXksIGVkaXQ6IHRydWUgfSB9KTtcblx0XHR9KSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5zZXR0aW5nUmVuZGVyZXJzLm9uRGlkQ2xpY2tTZXR0aW5nTGluayhzZXR0aW5nTmFtZSA9PiB0aGlzLm9uRGlkQ2xpY2tTZXR0aW5nKHNldHRpbmdOYW1lKSkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuc2V0dGluZ1JlbmRlcmVycy5vbkRpZEZvY3VzU2V0dGluZyhlbGVtZW50ID0+IHtcblx0XHRcdHRoaXMuc2V0dGluZ3NUcmVlLnNldEZvY3VzKFtlbGVtZW50XSk7XG5cdFx0XHR0aGlzLl9jdXJyZW50Rm9jdXNDb250ZXh0ID0gU2V0dGluZ3NGb2N1c0NvbnRleHQuU2V0dGluZ0NvbnRyb2w7XG5cdFx0XHR0aGlzLnNldHRpbmdSb3dGb2N1c2VkLnNldChmYWxzZSk7XG5cdFx0fSkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuc2V0dGluZ1JlbmRlcmVycy5vbkRpZENoYW5nZVNldHRpbmdIZWlnaHQoKHBhcmFtczogSGVpZ2h0Q2hhbmdlUGFyYW1zKSA9PiB7XG5cdFx0XHRjb25zdCB7IGVsZW1lbnQsIGhlaWdodCB9ID0gcGFyYW1zO1xuXHRcdFx0dHJ5IHtcblx0XHRcdFx0dGhpcy5zZXR0aW5nc1RyZWUudXBkYXRlRWxlbWVudEhlaWdodChlbGVtZW50LCBoZWlnaHQpO1xuXHRcdFx0fSBjYXRjaCAoZSkge1xuXHRcdFx0XHQvLyB0aGUgZWxlbWVudCB3YXMgbm90IGZvdW5kXG5cdFx0XHR9XG5cdFx0fSkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuc2V0dGluZ1JlbmRlcmVycy5vbkFwcGx5RmlsdGVyKChmaWx0ZXIpID0+IHRoaXMuYXBwbHlGaWx0ZXIoZmlsdGVyKSkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuc2V0dGluZ1JlbmRlcmVycy5vbkRpZENsaWNrT3ZlcnJpZGVFbGVtZW50KChlbGVtZW50OiBJU2V0dGluZ092ZXJyaWRlQ2xpY2tFdmVudCkgPT4ge1xuXHRcdFx0dGhpcy5yZW1vdmVMYW5ndWFnZUZpbHRlcnMoKTtcblx0XHRcdGlmIChlbGVtZW50Lmxhbmd1YWdlKSB7XG5cdFx0XHRcdHRoaXMuYXBwbHlGaWx0ZXIoYEAke0xBTkdVQUdFX1NFVFRJTkdfVEFHfSR7ZWxlbWVudC5sYW5ndWFnZX1gKTtcblx0XHRcdH1cblxuXHRcdFx0aWYgKGVsZW1lbnQuc2NvcGUgPT09ICd3b3Jrc3BhY2UnKSB7XG5cdFx0XHRcdHRoaXMuc2V0dGluZ3NUYXJnZXRzV2lkZ2V0LnVwZGF0ZVRhcmdldChDb25maWd1cmF0aW9uVGFyZ2V0LldPUktTUEFDRSk7XG5cdFx0XHR9IGVsc2UgaWYgKGVsZW1lbnQuc2NvcGUgPT09ICd1c2VyJykge1xuXHRcdFx0XHR0aGlzLnNldHRpbmdzVGFyZ2V0c1dpZGdldC51cGRhdGVUYXJnZXQoQ29uZmlndXJhdGlvblRhcmdldC5VU0VSX0xPQ0FMKTtcblx0XHRcdH0gZWxzZSBpZiAoZWxlbWVudC5zY29wZSA9PT0gJ3JlbW90ZScpIHtcblx0XHRcdFx0dGhpcy5zZXR0aW5nc1RhcmdldHNXaWRnZXQudXBkYXRlVGFyZ2V0KENvbmZpZ3VyYXRpb25UYXJnZXQuVVNFUl9SRU1PVEUpO1xuXHRcdFx0fVxuXHRcdFx0dGhpcy5hcHBseUZpbHRlcihgQCR7SURfU0VUVElOR19UQUd9JHtlbGVtZW50LnNldHRpbmdLZXl9YCk7XG5cdFx0fSkpO1xuXG5cdFx0dGhpcy5zZXR0aW5nc1RyZWUgPSB0aGlzLl9yZWdpc3Rlcih0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFNldHRpbmdzVHJlZSxcblx0XHRcdGNvbnRhaW5lcixcblx0XHRcdHRoaXMudmlld1N0YXRlLFxuXHRcdFx0dGhpcy5zZXR0aW5nUmVuZGVyZXJzLmFsbFJlbmRlcmVycykpO1xuXG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5zZXR0aW5nc1RyZWUub25EaWRTY3JvbGwoKCkgPT4ge1xuXHRcdFx0aWYgKHRoaXMuc2V0dGluZ3NUcmVlLnNjcm9sbFRvcCA9PT0gdGhpcy5zZXR0aW5nc1RyZWVTY3JvbGxUb3ApIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXG5cdFx0XHR0aGlzLnNldHRpbmdzVHJlZVNjcm9sbFRvcCA9IHRoaXMuc2V0dGluZ3NUcmVlLnNjcm9sbFRvcDtcblxuXHRcdFx0Ly8gc2V0VGltZW91dCBiZWNhdXNlIGNhbGxpbmcgc2V0Q2hpbGRyZW4gb24gdGhlIHNldHRpbmdzVHJlZSBjYW4gdHJpZ2dlciBvbkRpZFNjcm9sbCwgc28gaXQgZmlyZXMgd2hlblxuXHRcdFx0Ly8gc2V0Q2hpbGRyZW4gaGFzIGNhbGxlZCBvbiB0aGUgc2V0dGluZ3MgdHJlZSBidXQgbm90IHRoZSB0b2MgdHJlZSB5ZXQsIHNvIHRoZWlyIHJlbmRlcmVkIGVsZW1lbnRzIGFyZSBvdXQgb2Ygc3luY1xuXHRcdFx0c2V0VGltZW91dCgoKSA9PiB7XG5cdFx0XHRcdHRoaXMudXBkYXRlVHJlZVNjcm9sbFN5bmMoKTtcblx0XHRcdH0sIDApO1xuXHRcdH0pKTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuc2V0dGluZ3NUcmVlLm9uRGlkRm9jdXMoKCkgPT4ge1xuXHRcdFx0Y29uc3QgY2xhc3NMaXN0ID0gY29udGFpbmVyLm93bmVyRG9jdW1lbnQuYWN0aXZlRWxlbWVudD8uY2xhc3NMaXN0O1xuXHRcdFx0aWYgKGNsYXNzTGlzdCAmJiBjbGFzc0xpc3QuY29udGFpbnMoJ21vbmFjby1saXN0JykgJiYgY2xhc3NMaXN0LmNvbnRhaW5zKCdzZXR0aW5ncy1lZGl0b3ItdHJlZScpKSB7XG5cdFx0XHRcdHRoaXMuX2N1cnJlbnRGb2N1c0NvbnRleHQgPSBTZXR0aW5nc0ZvY3VzQ29udGV4dC5TZXR0aW5nVHJlZTtcblx0XHRcdFx0dGhpcy5zZXR0aW5nUm93Rm9jdXNlZC5zZXQodHJ1ZSk7XG5cdFx0XHRcdHRoaXMudHJlZUZvY3VzZWRFbGVtZW50ID8/PSB0aGlzLnNldHRpbmdzVHJlZS5maXJzdFZpc2libGVFbGVtZW50ID8/IG51bGw7XG5cdFx0XHRcdGlmICh0aGlzLnRyZWVGb2N1c2VkRWxlbWVudCkge1xuXHRcdFx0XHRcdHRoaXMudHJlZUZvY3VzZWRFbGVtZW50LnRhYmJhYmxlID0gdHJ1ZTtcblx0XHRcdFx0fVxuXHRcdFx0XHR0aGlzLnVwZGF0ZVNldHRpbmdGaXJzdFJvd0ZvY3VzZWRDb250ZXh0KHRoaXMudHJlZUZvY3VzZWRFbGVtZW50KTtcblx0XHRcdH1cblx0XHR9KSk7XG5cblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLnNldHRpbmdzVHJlZS5vbkRpZEJsdXIoKCkgPT4ge1xuXHRcdFx0dGhpcy5zZXR0aW5nUm93Rm9jdXNlZC5zZXQoZmFsc2UpO1xuXHRcdFx0dGhpcy5zZXR0aW5nRmlyc3RSb3dGb2N1c2VkLnNldChmYWxzZSk7XG5cdFx0XHQvLyBDbGVhciBvdXQgdGhlIGZvY3VzZWQgZWxlbWVudCwgb3RoZXJ3aXNlIGl0IGNvdWxkIGJlXG5cdFx0XHQvLyBvdXQgb2YgZGF0ZSBkdXJpbmcgdGhlIG5leHQgb25EaWRGb2N1cyBldmVudC5cblx0XHRcdHRoaXMudHJlZUZvY3VzZWRFbGVtZW50ID0gbnVsbDtcblx0XHR9KSk7XG5cblx0XHQvLyBUaGVyZSBpcyBubyBkaWZmZXJlbnQgc2VsZWN0IHN0YXRlIGluIHRoZSBzZXR0aW5ncyB0cmVlXG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5zZXR0aW5nc1RyZWUub25EaWRDaGFuZ2VGb2N1cyhlID0+IHtcblx0XHRcdGNvbnN0IGVsZW1lbnQgPSBlLmVsZW1lbnRzWzBdO1xuXHRcdFx0dGhpcy51cGRhdGVTZXR0aW5nRmlyc3RSb3dGb2N1c2VkQ29udGV4dChlbGVtZW50ID8/IG51bGwpO1xuXHRcdFx0aWYgKHRoaXMudHJlZUZvY3VzZWRFbGVtZW50ID09PSBlbGVtZW50KSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblxuXHRcdFx0aWYgKHRoaXMudHJlZUZvY3VzZWRFbGVtZW50KSB7XG5cdFx0XHRcdHRoaXMudHJlZUZvY3VzZWRFbGVtZW50LnRhYmJhYmxlID0gZmFsc2U7XG5cdFx0XHR9XG5cblx0XHRcdHRoaXMudHJlZUZvY3VzZWRFbGVtZW50ID0gZWxlbWVudDtcblxuXHRcdFx0aWYgKHRoaXMudHJlZUZvY3VzZWRFbGVtZW50KSB7XG5cdFx0XHRcdHRoaXMudHJlZUZvY3VzZWRFbGVtZW50LnRhYmJhYmxlID0gdHJ1ZTtcblx0XHRcdH1cblxuXHRcdFx0dGhpcy5zZXR0aW5nc1RyZWUuc2V0U2VsZWN0aW9uKGVsZW1lbnQgPyBbZWxlbWVudF0gOiBbXSk7XG5cdFx0fSkpO1xuXHR9XG5cblx0cHJpdmF0ZSBvbkRpZENoYW5nZVNldHRpbmcoa2V5OiBzdHJpbmcsIHZhbHVlOiB1bmtub3duLCB0eXBlOiBTZXR0aW5nVmFsdWVUeXBlIHwgU2V0dGluZ1ZhbHVlVHlwZVtdLCBtYW51YWxSZXNldDogYm9vbGVhbiwgc2NvcGU6IENvbmZpZ3VyYXRpb25TY29wZSB8IHVuZGVmaW5lZCk6IHZvaWQge1xuXHRcdGNvbnN0IHBhcnNlZFF1ZXJ5ID0gcGFyc2VRdWVyeSh0aGlzLnNlYXJjaFdpZGdldC5nZXRWYWx1ZSgpKTtcblx0XHRjb25zdCBsYW5ndWFnZUZpbHRlciA9IHBhcnNlZFF1ZXJ5Lmxhbmd1YWdlRmlsdGVyO1xuXHRcdGlmIChtYW51YWxSZXNldCB8fCAodGhpcy5wZW5kaW5nU2V0dGluZ1VwZGF0ZSAmJiB0aGlzLnBlbmRpbmdTZXR0aW5nVXBkYXRlLmtleSAhPT0ga2V5KSkge1xuXHRcdFx0dGhpcy51cGRhdGVDaGFuZ2VkU2V0dGluZyhrZXksIHZhbHVlLCBtYW51YWxSZXNldCwgbGFuZ3VhZ2VGaWx0ZXIsIHNjb3BlKTtcblx0XHR9XG5cblx0XHR0aGlzLnBlbmRpbmdTZXR0aW5nVXBkYXRlID0geyBrZXksIHZhbHVlLCBsYW5ndWFnZUZpbHRlciB9O1xuXHRcdGlmIChTZXR0aW5nc0VkaXRvcjIuc2hvdWxkU2V0dGluZ1VwZGF0ZUZhc3QodHlwZSkpIHtcblx0XHRcdHRoaXMuc2V0dGluZ0Zhc3RVcGRhdGVEZWxheWVyLnRyaWdnZXIoKCkgPT4gdGhpcy51cGRhdGVDaGFuZ2VkU2V0dGluZyhrZXksIHZhbHVlLCBtYW51YWxSZXNldCwgbGFuZ3VhZ2VGaWx0ZXIsIHNjb3BlKSk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHRoaXMuc2V0dGluZ1Nsb3dVcGRhdGVEZWxheWVyLnRyaWdnZXIoKCkgPT4gdGhpcy51cGRhdGVDaGFuZ2VkU2V0dGluZyhrZXksIHZhbHVlLCBtYW51YWxSZXNldCwgbGFuZ3VhZ2VGaWx0ZXIsIHNjb3BlKSk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSB1cGRhdGVUcmVlU2Nyb2xsU3luYygpOiB2b2lkIHtcblx0XHR0aGlzLnNldHRpbmdSZW5kZXJlcnMuY2FuY2VsU3VnZ2VzdGVycygpO1xuXHR9XG5cblx0cHJpdmF0ZSB1cGRhdGVDaGFuZ2VkU2V0dGluZyhrZXk6IHN0cmluZywgdmFsdWU6IHVua25vd24sIG1hbnVhbFJlc2V0OiBib29sZWFuLCBsYW5ndWFnZUZpbHRlcjogc3RyaW5nIHwgdW5kZWZpbmVkLCBzY29wZTogQ29uZmlndXJhdGlvblNjb3BlIHwgdW5kZWZpbmVkKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Ly8gQ29uZmlndXJhdGlvblNlcnZpY2UgZGlzcGxheXMgdGhlIGVycm9yIGlmIHRoaXMgZmFpbHMuXG5cdFx0Ly8gRm9yY2UgYSByZW5kZXIgYWZ0ZXJ3YXJkcyBiZWNhdXNlIG9uRGlkQ29uZmlndXJhdGlvblVwZGF0ZSBkb2Vzbid0IGZpcmUgaWYgdGhlIHVwZGF0ZSBkb2Vzbid0IHJlc3VsdCBpbiBhbiBlZmZlY3RpdmUgc2V0dGluZyB2YWx1ZSBjaGFuZ2UuXG5cdFx0Y29uc3Qgc2V0dGluZ3NUYXJnZXQgPSB0aGlzLnNldHRpbmdzVGFyZ2V0c1dpZGdldC5zZXR0aW5nc1RhcmdldDtcblx0XHRjb25zdCByZXNvdXJjZSA9IFVSSS5pc1VyaShzZXR0aW5nc1RhcmdldCkgPyBzZXR0aW5nc1RhcmdldCA6IHVuZGVmaW5lZDtcblx0XHRjb25zdCBjb25maWd1cmF0aW9uVGFyZ2V0ID0gPENvbmZpZ3VyYXRpb25UYXJnZXQgfCBudWxsPihyZXNvdXJjZSA/IENvbmZpZ3VyYXRpb25UYXJnZXQuV09SS1NQQUNFX0ZPTERFUiA6IHNldHRpbmdzVGFyZ2V0KSA/PyBDb25maWd1cmF0aW9uVGFyZ2V0LlVTRVJfTE9DQUw7XG5cdFx0Y29uc3Qgb3ZlcnJpZGVzOiBJQ29uZmlndXJhdGlvblVwZGF0ZU92ZXJyaWRlcyA9IHsgcmVzb3VyY2UsIG92ZXJyaWRlSWRlbnRpZmllcnM6IGxhbmd1YWdlRmlsdGVyID8gW2xhbmd1YWdlRmlsdGVyXSA6IHVuZGVmaW5lZCB9O1xuXG5cdFx0Y29uc3QgY29uZmlndXJhdGlvblRhcmdldElzV29ya3NwYWNlID0gY29uZmlndXJhdGlvblRhcmdldCA9PT0gQ29uZmlndXJhdGlvblRhcmdldC5XT1JLU1BBQ0UgfHwgY29uZmlndXJhdGlvblRhcmdldCA9PT0gQ29uZmlndXJhdGlvblRhcmdldC5XT1JLU1BBQ0VfRk9MREVSO1xuXG5cdFx0Y29uc3QgdXNlclBhc3NlZEluTWFudWFsUmVzZXQgPSBjb25maWd1cmF0aW9uVGFyZ2V0SXNXb3Jrc3BhY2UgfHwgISFsYW5ndWFnZUZpbHRlcjtcblx0XHRjb25zdCBpc01hbnVhbFJlc2V0ID0gdXNlclBhc3NlZEluTWFudWFsUmVzZXQgPyBtYW51YWxSZXNldCA6IHZhbHVlID09PSB1bmRlZmluZWQ7XG5cblx0XHQvLyBJZiB0aGUgdXNlciBpcyBjaGFuZ2luZyB0aGUgdmFsdWUgYmFjayB0byB0aGUgZGVmYXVsdCwgYW5kIHdlJ3JlIG5vdCB0YXJnZXRpbmcgYSB3b3Jrc3BhY2Ugc2NvcGUsIGRvIGEgJ3Jlc2V0JyBpbnN0ZWFkXG5cdFx0Y29uc3QgaW5zcGVjdGVkID0gdGhpcy5jb25maWd1cmF0aW9uU2VydmljZS5pbnNwZWN0KGtleSwgb3ZlcnJpZGVzKTtcblx0XHRpZiAoIXVzZXJQYXNzZWRJbk1hbnVhbFJlc2V0ICYmIGluc3BlY3RlZC5kZWZhdWx0VmFsdWUgPT09IHZhbHVlKSB7XG5cdFx0XHR2YWx1ZSA9IHVuZGVmaW5lZDtcblx0XHR9XG5cblx0XHRyZXR1cm4gdGhpcy5jb25maWd1cmF0aW9uU2VydmljZS51cGRhdGVWYWx1ZShrZXksIHZhbHVlLCBvdmVycmlkZXMsIGNvbmZpZ3VyYXRpb25UYXJnZXQsIHsgaGFuZGxlRGlydHlGaWxlOiAnc2F2ZScgfSlcblx0XHRcdC50aGVuKCgpID0+IHtcblx0XHRcdFx0Y29uc3QgcXVlcnkgPSB0aGlzLnNlYXJjaFdpZGdldC5nZXRWYWx1ZSgpO1xuXHRcdFx0XHRpZiAocXVlcnkuaW5jbHVkZXMoYEAke01PRElGSUVEX1NFVFRJTkdfVEFHfWApKSB7XG5cdFx0XHRcdFx0Ly8gVGhlIHVzZXIgbWlnaHQgaGF2ZSByZXNldCBhIHNldHRpbmcuXG5cdFx0XHRcdFx0dGhpcy5yZWZyZXNoVE9DVHJlZSgpO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHRoaXMucmVuZGVyVHJlZShrZXksIGlzTWFudWFsUmVzZXQpO1xuXHRcdFx0XHR0aGlzLnBlbmRpbmdTZXR0aW5nVXBkYXRlID0gbnVsbDtcblxuXHRcdFx0XHRjb25zdCByZXBvcnRNb2RpZmllZFByb3BzID0ge1xuXHRcdFx0XHRcdGtleSxcblx0XHRcdFx0XHRxdWVyeSxcblx0XHRcdFx0XHRzZWFyY2hSZXN1bHRzOiB0aGlzLnNlYXJjaFJlc3VsdE1vZGVsPy5nZXRVbmlxdWVTZWFyY2hSZXN1bHRzKCkgPz8gbnVsbCxcblx0XHRcdFx0XHRyYXdSZXN1bHRzOiB0aGlzLnNlYXJjaFJlc3VsdE1vZGVsPy5nZXRSYXdSZXN1bHRzKCkgPz8gbnVsbCxcblx0XHRcdFx0XHRzaG93Q29uZmlndXJlZE9ubHk6ICEhdGhpcy52aWV3U3RhdGUudGFnRmlsdGVycyAmJiB0aGlzLnZpZXdTdGF0ZS50YWdGaWx0ZXJzLmhhcyhNT0RJRklFRF9TRVRUSU5HX1RBRyksXG5cdFx0XHRcdFx0aXNSZXNldDogdHlwZW9mIHZhbHVlID09PSAndW5kZWZpbmVkJyxcblx0XHRcdFx0XHRzZXR0aW5nc1RhcmdldDogdGhpcy5zZXR0aW5nc1RhcmdldHNXaWRnZXQuc2V0dGluZ3NUYXJnZXQgYXMgU2V0dGluZ3NUYXJnZXRcblx0XHRcdFx0fTtcblx0XHRcdFx0cmV0dXJuIHRoaXMucmVwb3J0TW9kaWZpZWRTZXR0aW5nKHJlcG9ydE1vZGlmaWVkUHJvcHMpO1xuXHRcdFx0fSk7XG5cdH1cblxuXHRwcml2YXRlIHJlcG9ydE1vZGlmaWVkU2V0dGluZyhwcm9wczogeyBrZXk6IHN0cmluZzsgcXVlcnk6IHN0cmluZzsgc2VhcmNoUmVzdWx0czogSVNlYXJjaFJlc3VsdCB8IG51bGw7IHJhd1Jlc3VsdHM6IElTZWFyY2hSZXN1bHRbXSB8IG51bGw7IHNob3dDb25maWd1cmVkT25seTogYm9vbGVhbjsgaXNSZXNldDogYm9vbGVhbjsgc2V0dGluZ3NUYXJnZXQ6IFNldHRpbmdzVGFyZ2V0IH0pOiB2b2lkIHtcblx0XHR0eXBlIFNldHRpbmdzRWRpdG9yTW9kaWZpZWRTZXR0aW5nRXZlbnQgPSB7XG5cdFx0XHRrZXk6IHN0cmluZztcblx0XHRcdGdyb3VwSWQ6IHN0cmluZyB8IHVuZGVmaW5lZDtcblx0XHRcdHByb3ZpZGVyTmFtZTogc3RyaW5nIHwgdW5kZWZpbmVkO1xuXHRcdFx0bmxwSW5kZXg6IG51bWJlciB8IHVuZGVmaW5lZDtcblx0XHRcdGRpc3BsYXlJbmRleDogbnVtYmVyIHwgdW5kZWZpbmVkO1xuXHRcdFx0c2hvd0NvbmZpZ3VyZWRPbmx5OiBib29sZWFuO1xuXHRcdFx0aXNSZXNldDogYm9vbGVhbjtcblx0XHRcdHRhcmdldDogc3RyaW5nO1xuXHRcdH07XG5cdFx0dHlwZSBTZXR0aW5nc0VkaXRvck1vZGlmaWVkU2V0dGluZ0NsYXNzaWZpY2F0aW9uID0ge1xuXHRcdFx0a2V5OiB7IGNsYXNzaWZpY2F0aW9uOiAnU3lzdGVtTWV0YURhdGEnOyBwdXJwb3NlOiAnRmVhdHVyZUluc2lnaHQnOyBjb21tZW50OiAnVGhlIHNldHRpbmcgdGhhdCBpcyBiZWluZyBtb2RpZmllZC4nIH07XG5cdFx0XHRncm91cElkOiB7IGNsYXNzaWZpY2F0aW9uOiAnU3lzdGVtTWV0YURhdGEnOyBwdXJwb3NlOiAnRmVhdHVyZUluc2lnaHQnOyBjb21tZW50OiAnV2hldGhlciB0aGUgc2V0dGluZyBpcyBmcm9tIHRoZSBsb2NhbCBzZWFyY2ggb3IgcmVtb3RlIHNlYXJjaCBwcm92aWRlciwgaWYgYXBwbGljYWJsZS4nIH07XG5cdFx0XHRwcm92aWRlck5hbWU6IHsgY2xhc3NpZmljYXRpb246ICdTeXN0ZW1NZXRhRGF0YSc7IHB1cnBvc2U6ICdGZWF0dXJlSW5zaWdodCc7IGNvbW1lbnQ6ICdUaGUgbmFtZSBvZiB0aGUgc2VhcmNoIHByb3ZpZGVyLCBpZiBhcHBsaWNhYmxlLicgfTtcblx0XHRcdG5scEluZGV4OiB7IGNsYXNzaWZpY2F0aW9uOiAnU3lzdGVtTWV0YURhdGEnOyBwdXJwb3NlOiAnRmVhdHVyZUluc2lnaHQnOyBjb21tZW50OiAnVGhlIGluZGV4IG9mIHRoZSBzZXR0aW5nIGluIHRoZSByZW1vdGUgc2VhcmNoIHByb3ZpZGVyIHJlc3VsdHMsIGlmIGFwcGxpY2FibGUuJyB9O1xuXHRcdFx0ZGlzcGxheUluZGV4OiB7IGNsYXNzaWZpY2F0aW9uOiAnU3lzdGVtTWV0YURhdGEnOyBwdXJwb3NlOiAnRmVhdHVyZUluc2lnaHQnOyBjb21tZW50OiAnVGhlIGluZGV4IG9mIHRoZSBzZXR0aW5nIGluIHRoZSBjb21iaW5lZCBzZWFyY2ggcmVzdWx0cywgaWYgYXBwbGljYWJsZS4nIH07XG5cdFx0XHRzaG93Q29uZmlndXJlZE9ubHk6IHsgY2xhc3NpZmljYXRpb246ICdTeXN0ZW1NZXRhRGF0YSc7IHB1cnBvc2U6ICdGZWF0dXJlSW5zaWdodCc7IGNvbW1lbnQ6ICdXaGV0aGVyIHRoZSB1c2VyIGlzIGluIHRoZSBtb2RpZmllZCB2aWV3LCB3aGljaCBzaG93cyBjb25maWd1cmVkIHNldHRpbmdzIG9ubHkuJyB9O1xuXHRcdFx0aXNSZXNldDogeyBjbGFzc2lmaWNhdGlvbjogJ1N5c3RlbU1ldGFEYXRhJzsgcHVycG9zZTogJ0ZlYXR1cmVJbnNpZ2h0JzsgY29tbWVudDogJ0lkZW50aWZpZXMgd2hldGhlciBhIHNldHRpbmcgd2FzIHJlc2V0IHRvIGl0cyBkZWZhdWx0IHZhbHVlLicgfTtcblx0XHRcdHRhcmdldDogeyBjbGFzc2lmaWNhdGlvbjogJ1N5c3RlbU1ldGFEYXRhJzsgcHVycG9zZTogJ0ZlYXR1cmVJbnNpZ2h0JzsgY29tbWVudDogJ1RoZSBzY29wZSBvZiB0aGUgc2V0dGluZywgc3VjaCBhcyB1c2VyIG9yIHdvcmtzcGFjZS4nIH07XG5cdFx0XHRvd25lcjogJ3J6aGFvMjcxJztcblx0XHRcdGNvbW1lbnQ6ICdFdmVudCBlbWl0dGVkIHdoZW4gdGhlIHVzZXIgbW9kaWZpZXMgYSBzZXR0aW5nIGluIHRoZSBTZXR0aW5ncyBlZGl0b3InO1xuXHRcdH07XG5cblx0XHRsZXQgZ3JvdXBJZDogc3RyaW5nIHwgdW5kZWZpbmVkID0gdW5kZWZpbmVkO1xuXHRcdGxldCBwcm92aWRlck5hbWU6IHN0cmluZyB8IHVuZGVmaW5lZCA9IHVuZGVmaW5lZDtcblx0XHRsZXQgbmxwSW5kZXg6IG51bWJlciB8IHVuZGVmaW5lZCA9IHVuZGVmaW5lZDtcblx0XHRsZXQgZGlzcGxheUluZGV4OiBudW1iZXIgfCB1bmRlZmluZWQgPSB1bmRlZmluZWQ7XG5cdFx0aWYgKHByb3BzLnNlYXJjaFJlc3VsdHMpIHtcblx0XHRcdGRpc3BsYXlJbmRleCA9IHByb3BzLnNlYXJjaFJlc3VsdHMuZmlsdGVyTWF0Y2hlcy5maW5kSW5kZXgobSA9PiBtLnNldHRpbmcua2V5ID09PSBwcm9wcy5rZXkpO1xuXG5cdFx0XHRpZiAodGhpcy5zZWFyY2hSZXN1bHRNb2RlbCkge1xuXHRcdFx0XHRwcm92aWRlck5hbWUgPSBwcm9wcy5zZWFyY2hSZXN1bHRzLmZpbHRlck1hdGNoZXMuZmluZChtID0+IG0uc2V0dGluZy5rZXkgPT09IHByb3BzLmtleSk/LnByb3ZpZGVyTmFtZTtcblx0XHRcdFx0Y29uc3QgcmF3UmVzdWx0cyA9IHRoaXMuc2VhcmNoUmVzdWx0TW9kZWwuZ2V0UmF3UmVzdWx0cygpO1xuXHRcdFx0XHRpZiAocmF3UmVzdWx0c1tTZWFyY2hSZXN1bHRJZHguTG9jYWxdICYmIGRpc3BsYXlJbmRleCA+PSAwKSB7XG5cdFx0XHRcdFx0Y29uc3Qgc2V0dGluZ0luTG9jYWxSZXN1bHRzID0gcmF3UmVzdWx0c1tTZWFyY2hSZXN1bHRJZHguTG9jYWxdLmZpbHRlck1hdGNoZXMuc29tZShtID0+IG0uc2V0dGluZy5rZXkgPT09IHByb3BzLmtleSk7XG5cdFx0XHRcdFx0Z3JvdXBJZCA9IHNldHRpbmdJbkxvY2FsUmVzdWx0cyA/ICdsb2NhbCcgOiAncmVtb3RlJztcblx0XHRcdFx0fVxuXHRcdFx0XHRpZiAocmF3UmVzdWx0c1tTZWFyY2hSZXN1bHRJZHguUmVtb3RlXSkge1xuXHRcdFx0XHRcdGNvbnN0IF9ubHBJbmRleCA9IHJhd1Jlc3VsdHNbU2VhcmNoUmVzdWx0SWR4LlJlbW90ZV0uZmlsdGVyTWF0Y2hlcy5maW5kSW5kZXgobSA9PiBtLnNldHRpbmcua2V5ID09PSBwcm9wcy5rZXkpO1xuXHRcdFx0XHRcdG5scEluZGV4ID0gX25scEluZGV4ID49IDAgPyBfbmxwSW5kZXggOiB1bmRlZmluZWQ7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cblx0XHRjb25zdCByZXBvcnRlZFRhcmdldCA9IHByb3BzLnNldHRpbmdzVGFyZ2V0ID09PSBDb25maWd1cmF0aW9uVGFyZ2V0LlVTRVJfTE9DQUwgPyAndXNlcicgOlxuXHRcdFx0cHJvcHMuc2V0dGluZ3NUYXJnZXQgPT09IENvbmZpZ3VyYXRpb25UYXJnZXQuVVNFUl9SRU1PVEUgPyAndXNlcl9yZW1vdGUnIDpcblx0XHRcdFx0cHJvcHMuc2V0dGluZ3NUYXJnZXQgPT09IENvbmZpZ3VyYXRpb25UYXJnZXQuV09SS1NQQUNFID8gJ3dvcmtzcGFjZScgOlxuXHRcdFx0XHRcdCdmb2xkZXInO1xuXG5cdFx0Y29uc3QgZGF0YSA9IHtcblx0XHRcdGtleTogcHJvcHMua2V5LFxuXHRcdFx0Z3JvdXBJZCxcblx0XHRcdHByb3ZpZGVyTmFtZSxcblx0XHRcdG5scEluZGV4LFxuXHRcdFx0ZGlzcGxheUluZGV4LFxuXHRcdFx0c2hvd0NvbmZpZ3VyZWRPbmx5OiBwcm9wcy5zaG93Q29uZmlndXJlZE9ubHksXG5cdFx0XHRpc1Jlc2V0OiBwcm9wcy5pc1Jlc2V0LFxuXHRcdFx0dGFyZ2V0OiByZXBvcnRlZFRhcmdldFxuXHRcdH07XG5cblx0XHR0aGlzLnRlbGVtZXRyeVNlcnZpY2UucHVibGljTG9nMjxTZXR0aW5nc0VkaXRvck1vZGlmaWVkU2V0dGluZ0V2ZW50LCBTZXR0aW5nc0VkaXRvck1vZGlmaWVkU2V0dGluZ0NsYXNzaWZpY2F0aW9uPignc2V0dGluZ3NFZGl0b3Iuc2V0dGluZ01vZGlmaWVkJywgZGF0YSk7XG5cdH1cblxuXHRwcml2YXRlIHNjaGVkdWxlUmVmcmVzaChlbGVtZW50OiBIVE1MRWxlbWVudCwga2V5ID0gJycpOiB2b2lkIHtcblx0XHRpZiAoa2V5ICYmIHRoaXMuc2NoZWR1bGVkUmVmcmVzaGVzLmhhcyhrZXkpKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0aWYgKCFrZXkpIHtcblx0XHRcdGRpc3Bvc2UodGhpcy5zY2hlZHVsZWRSZWZyZXNoZXMudmFsdWVzKCkpO1xuXHRcdFx0dGhpcy5zY2hlZHVsZWRSZWZyZXNoZXMuY2xlYXIoKTtcblx0XHR9XG5cblx0XHRjb25zdCBzdG9yZSA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblx0XHRjb25zdCBzY2hlZHVsZWRSZWZyZXNoVHJhY2tlciA9IERPTS50cmFja0ZvY3VzKGVsZW1lbnQpO1xuXHRcdHN0b3JlLmFkZChzY2hlZHVsZWRSZWZyZXNoVHJhY2tlcik7XG5cdFx0c3RvcmUuYWRkKHNjaGVkdWxlZFJlZnJlc2hUcmFja2VyLm9uRGlkQmx1cigoKSA9PiB7XG5cdFx0XHR0aGlzLnNjaGVkdWxlZFJlZnJlc2hlcy5nZXQoa2V5KT8uZGlzcG9zZSgpO1xuXHRcdFx0dGhpcy5zY2hlZHVsZWRSZWZyZXNoZXMuZGVsZXRlKGtleSk7XG5cdFx0XHR0aGlzLm9uQ29uZmlnVXBkYXRlKG5ldyBTZXQoW2tleV0pKTtcblx0XHR9KSk7XG5cdFx0dGhpcy5zY2hlZHVsZWRSZWZyZXNoZXMuc2V0KGtleSwgc3RvcmUpO1xuXHR9XG5cblx0cHJpdmF0ZSBjcmVhdGVTZXR0aW5nc09yZGVyQnlUb2NJbmRleChyZXNvbHZlZFNldHRpbmdzUm9vdDogSVRPQ0VudHJ5PElTZXR0aW5nPik6IE1hcDxzdHJpbmcsIG51bWJlcj4ge1xuXHRcdGNvbnN0IGluZGV4ID0gbmV3IE1hcDxzdHJpbmcsIG51bWJlcj4oKTtcblx0XHRmdW5jdGlvbiBpbmRleFNldHRpbmdzKHJlc29sdmVkU2V0dGluZ3NSb290OiBJVE9DRW50cnk8SVNldHRpbmc+LCBjb3VudGVyID0gMCk6IG51bWJlciB7XG5cdFx0XHRpZiAocmVzb2x2ZWRTZXR0aW5nc1Jvb3Quc2V0dGluZ3MpIHtcblx0XHRcdFx0Zm9yIChjb25zdCBzZXR0aW5nIG9mIHJlc29sdmVkU2V0dGluZ3NSb290LnNldHRpbmdzKSB7XG5cdFx0XHRcdFx0aWYgKCFpbmRleC5oYXMoc2V0dGluZy5rZXkpKSB7XG5cdFx0XHRcdFx0XHRpbmRleC5zZXQoc2V0dGluZy5rZXksIGNvdW50ZXIrKyk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0XHRpZiAocmVzb2x2ZWRTZXR0aW5nc1Jvb3QuY2hpbGRyZW4pIHtcblx0XHRcdFx0Zm9yIChjb25zdCBjaGlsZCBvZiByZXNvbHZlZFNldHRpbmdzUm9vdC5jaGlsZHJlbikge1xuXHRcdFx0XHRcdGNvdW50ZXIgPSBpbmRleFNldHRpbmdzKGNoaWxkLCBjb3VudGVyKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdFx0cmV0dXJuIGNvdW50ZXI7XG5cdFx0fVxuXHRcdGluZGV4U2V0dGluZ3MocmVzb2x2ZWRTZXR0aW5nc1Jvb3QpO1xuXHRcdHJldHVybiBpbmRleDtcblx0fVxuXG5cdHByaXZhdGUgcmVmcmVzaE1vZGVscyhyZXNvbHZlZFNldHRpbmdzUm9vdDogSVRPQ0VudHJ5PElTZXR0aW5nPikge1xuXHRcdC8vIEJvdGggY2FsbHMgdG8gcmVmcmVzaE1vZGVscyByZXF1aXJlIGEgdmFsaWQgc2V0dGluZ3NUcmVlTW9kZWwuXG5cdFx0dGhpcy5zZXR0aW5nc1RyZWVNb2RlbC52YWx1ZSEudXBkYXRlKHJlc29sdmVkU2V0dGluZ3NSb290KTtcblx0XHR0aGlzLnRvY1RyZWVNb2RlbC5zZXR0aW5nc1RyZWVSb290ID0gdGhpcy5zZXR0aW5nc1RyZWVNb2RlbC52YWx1ZSEucm9vdDtcblx0XHR0aGlzLnNldHRpbmdzT3JkZXJCeVRvY0luZGV4ID0gdGhpcy5jcmVhdGVTZXR0aW5nc09yZGVyQnlUb2NJbmRleChyZXNvbHZlZFNldHRpbmdzUm9vdCk7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIG9uQ29uZmlnVXBkYXRlKGtleXM/OiBSZWFkb25seVNldDxzdHJpbmc+LCBmb3JjZVJlZnJlc2ggPSBmYWxzZSwgdHJpZ2dlclNlYXJjaCA9IGZhbHNlKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0aWYgKGtleXMgJiYgdGhpcy5zZXR0aW5nc1RyZWVNb2RlbCkge1xuXHRcdFx0cmV0dXJuIHRoaXMudXBkYXRlRWxlbWVudHNCeUtleShrZXlzKTtcblx0XHR9XG5cblx0XHRpZiAoIXRoaXMuZGVmYXVsdFNldHRpbmdzRWRpdG9yTW9kZWwpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCBncm91cHMgPSB0aGlzLmRlZmF1bHRTZXR0aW5nc0VkaXRvck1vZGVsLnNldHRpbmdzR3JvdXBzLnNsaWNlKDEpOyAvLyBXaXRob3V0IGNvbW1vbmx5VXNlZFxuXHRcdGNvbnN0IGNvcmVTZXR0aW5nc0dyb3VwcyA9IFtdLCBleHRlbnNpb25TZXR0aW5nc0dyb3VwcyA9IFtdO1xuXHRcdGZvciAoY29uc3QgZ3JvdXAgb2YgZ3JvdXBzKSB7XG5cdFx0XHRpZiAoZ3JvdXAuZXh0ZW5zaW9uSW5mbykge1xuXHRcdFx0XHRleHRlbnNpb25TZXR0aW5nc0dyb3Vwcy5wdXNoKGdyb3VwKTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdGNvcmVTZXR0aW5nc0dyb3Vwcy5wdXNoKGdyb3VwKTtcblx0XHRcdH1cblx0XHR9XG5cdFx0Y29uc3QgZmlsdGVyID0gdGhpcy5jYW5TaG93QWR2YW5jZWRTZXR0aW5ncygpID8gdW5kZWZpbmVkIDogeyBleGNsdWRlOiB7IHRhZ3M6IFtBRFZBTkNFRF9TRVRUSU5HX1RBR10gfSB9O1xuXG5cdFx0Y29uc3Qgc2V0dGluZ3NSZXN1bHQgPSByZXNvbHZlU2V0dGluZ3NUcmVlKHRvY0RhdGEsIGNvcmVTZXR0aW5nc0dyb3VwcywgZmlsdGVyLCB0aGlzLmxvZ1NlcnZpY2UpO1xuXHRcdGNvbnN0IHJlc29sdmVkU2V0dGluZ3NSb290ID0gc2V0dGluZ3NSZXN1bHQudHJlZTtcblxuXHRcdC8vIFdhcm4gZm9yIHNldHRpbmdzIG5vdCBpbmNsdWRlZCBpbiBsYXlvdXRcblx0XHRpZiAoc2V0dGluZ3NSZXN1bHQubGVmdG92ZXJTZXR0aW5ncy5zaXplICYmICF0aGlzLmhhc1dhcm5lZE1pc3NpbmdTZXR0aW5ncykge1xuXHRcdFx0Y29uc3Qgc2V0dGluZ0tleUxpc3Q6IHN0cmluZ1tdID0gW107XG5cdFx0XHRzZXR0aW5nc1Jlc3VsdC5sZWZ0b3ZlclNldHRpbmdzLmZvckVhY2gocyA9PiB7XG5cdFx0XHRcdHNldHRpbmdLZXlMaXN0LnB1c2gocy5rZXkpO1xuXHRcdFx0fSk7XG5cblx0XHRcdHRoaXMubG9nU2VydmljZS53YXJuKGBTZXR0aW5nc0VkaXRvcjI6IFNldHRpbmdzIG5vdCBpbmNsdWRlZCBpbiBzZXR0aW5nc0xheW91dC50czogJHtzZXR0aW5nS2V5TGlzdC5qb2luKCcsICcpfWApO1xuXHRcdFx0dGhpcy5oYXNXYXJuZWRNaXNzaW5nU2V0dGluZ3MgPSB0cnVlO1xuXHRcdH1cblxuXHRcdGNvbnN0IGFkZGl0aW9uYWxHcm91cHM6IElTZXR0aW5nc0dyb3VwW10gPSBbXTtcblx0XHRsZXQgc2V0QWRkaXRpb25hbEdyb3VwcyA9IGZhbHNlO1xuXHRcdGNvbnN0IHRvZ2dsZURhdGEgPSBhd2FpdCBnZXRFeHBlcmltZW50YWxFeHRlbnNpb25Ub2dnbGVEYXRhKHRoaXMuY2hhdEVudGl0bGVtZW50U2VydmljZSwgdGhpcy5leHRlbnNpb25HYWxsZXJ5U2VydmljZSwgdGhpcy5wcm9kdWN0U2VydmljZSk7XG5cdFx0aWYgKHRvZ2dsZURhdGEgJiYgZ3JvdXBzLmZpbHRlcihnID0+IGcuZXh0ZW5zaW9uSW5mbykubGVuZ3RoICYmIE9iamVjdC5rZXlzKHRvZ2dsZURhdGEuc2V0dGluZ3NFZGl0b3JSZWNvbW1lbmRlZEV4dGVuc2lvbnMpLmxlbmd0aCkge1xuXHRcdFx0Ly8gUmVmcmVzaCBpbnN0YWxsZWQgZXh0ZW5zaW9ucyBvbmNlIHBlciBvbkNvbmZpZ1VwZGF0ZSBpbnZvY2F0aW9uIGZvciBwZXJmb3JtYW5jZSxcblx0XHRcdC8vIGluc3RlYWQgb2YgcGVyIGV4dGVuc2lvbi4gVGhlIGluc3RhbGxlZCBsaXN0IG1heSBzdGlsbCBjaGFuZ2Ugd2hpbGUgaXRlcmF0aW5nLlxuXHRcdFx0YXdhaXQgdGhpcy5yZWZyZXNoSW5zdGFsbGVkRXh0ZW5zaW9uc0xpc3QoKTtcblx0XHRcdGZvciAoY29uc3Qga2V5IGluIHRvZ2dsZURhdGEuc2V0dGluZ3NFZGl0b3JSZWNvbW1lbmRlZEV4dGVuc2lvbnMpIHtcblx0XHRcdFx0Y29uc3QgZXh0ZW5zaW9uOiBJR2FsbGVyeUV4dGVuc2lvbiA9IHRvZ2dsZURhdGEucmVjb21tZW5kZWRFeHRlbnNpb25zR2FsbGVyeUluZm9ba2V5XTtcblx0XHRcdFx0aWYgKCFleHRlbnNpb24pIHtcblx0XHRcdFx0XHRjb250aW51ZTtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdGNvbnN0IGV4dGVuc2lvbklkID0gZXh0ZW5zaW9uLmlkZW50aWZpZXIuaWQ7XG5cdFx0XHRcdGNvbnN0IGV4dGVuc2lvbkluc3RhbGxlZCA9IHRoaXMuaW5zdGFsbGVkRXh0ZW5zaW9uSWRzLmluY2x1ZGVzKGV4dGVuc2lvbklkKTtcblxuXHRcdFx0XHQvLyBEcmlsbCBkb3duIHRvIHNlZSB3aGV0aGVyIHRoZSBncm91cCBhbmQgc2V0dGluZyBhbHJlYWR5IGV4aXN0XG5cdFx0XHRcdC8vIGFuZCBuZWVkIHRvIGJlIHJlbW92ZWQuXG5cdFx0XHRcdGNvbnN0IG1hdGNoaW5nR3JvdXBJbmRleCA9IGdyb3Vwcy5maW5kSW5kZXgoZyA9PlxuXHRcdFx0XHRcdGcuZXh0ZW5zaW9uSW5mbyAmJiBnLmV4dGVuc2lvbkluZm8hLmlkLnRvTG93ZXJDYXNlKCkgPT09IGV4dGVuc2lvbklkLnRvTG93ZXJDYXNlKCkgJiZcblx0XHRcdFx0XHRnLnNlY3Rpb25zLmxlbmd0aCA9PT0gMSAmJiBnLnNlY3Rpb25zWzBdLnNldHRpbmdzLmxlbmd0aCA9PT0gMSAmJiBnLnNlY3Rpb25zWzBdLnNldHRpbmdzWzBdLmRpc3BsYXlFeHRlbnNpb25JZFxuXHRcdFx0XHQpO1xuXHRcdFx0XHRpZiAoZXh0ZW5zaW9uSW5zdGFsbGVkIHx8IHRoaXMuZGlzbWlzc2VkRXh0ZW5zaW9uU2V0dGluZ3MuaW5jbHVkZXMoZXh0ZW5zaW9uSWQpKSB7XG5cdFx0XHRcdFx0aWYgKG1hdGNoaW5nR3JvdXBJbmRleCAhPT0gLTEpIHtcblx0XHRcdFx0XHRcdGdyb3Vwcy5zcGxpY2UobWF0Y2hpbmdHcm91cEluZGV4LCAxKTtcblx0XHRcdFx0XHRcdHNldEFkZGl0aW9uYWxHcm91cHMgPSB0cnVlO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRjb250aW51ZTtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdGlmIChtYXRjaGluZ0dyb3VwSW5kZXggIT09IC0xKSB7XG5cdFx0XHRcdFx0Y29udGludWU7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHQvLyBDcmVhdGUgdGhlIGVudHJ5LiBleHRlbnNpb25JbnN0YWxsZWQgaXMgZmFsc2UgaW4gdGhpcyBjYXNlLlxuXHRcdFx0XHRsZXQgbWFuaWZlc3Q6IElFeHRlbnNpb25NYW5pZmVzdCB8IG51bGwgPSBudWxsO1xuXHRcdFx0XHR0cnkge1xuXHRcdFx0XHRcdG1hbmlmZXN0ID0gYXdhaXQgcmFjZVRpbWVvdXQoXG5cdFx0XHRcdFx0XHR0aGlzLmV4dGVuc2lvbkdhbGxlcnlTZXJ2aWNlLmdldE1hbmlmZXN0KGV4dGVuc2lvbiwgQ2FuY2VsbGF0aW9uVG9rZW4uTm9uZSksXG5cdFx0XHRcdFx0XHRFWFRFTlNJT05fRkVUQ0hfVElNRU9VVF9NU1xuXHRcdFx0XHRcdCkgPz8gbnVsbDtcblx0XHRcdFx0fSBjYXRjaCAoZSkge1xuXHRcdFx0XHRcdC8vIExpa2VseSBhIG5ldHdvcmtpbmcgaXNzdWUuXG5cdFx0XHRcdFx0Ly8gU2tpcCBhZGRpbmcgYSBidXR0b24gZm9yIHRoaXMgZXh0ZW5zaW9uIHRvIHRoZSBTZXR0aW5ncyBlZGl0b3IuXG5cdFx0XHRcdFx0Y29udGludWU7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRpZiAobWFuaWZlc3QgPT09IG51bGwpIHtcblx0XHRcdFx0XHRjb250aW51ZTtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdGNvbnN0IGNvbnRyaWJ1dGVzQ29uZmlndXJhdGlvbiA9IG1hbmlmZXN0Py5jb250cmlidXRlcz8uY29uZmlndXJhdGlvbjtcblxuXHRcdFx0XHRsZXQgZ3JvdXBUaXRsZTogc3RyaW5nIHwgdW5kZWZpbmVkO1xuXHRcdFx0XHRpZiAoIUFycmF5LmlzQXJyYXkoY29udHJpYnV0ZXNDb25maWd1cmF0aW9uKSkge1xuXHRcdFx0XHRcdGdyb3VwVGl0bGUgPSBjb250cmlidXRlc0NvbmZpZ3VyYXRpb24/LnRpdGxlO1xuXHRcdFx0XHR9IGVsc2UgaWYgKGNvbnRyaWJ1dGVzQ29uZmlndXJhdGlvbi5sZW5ndGggPT09IDEpIHtcblx0XHRcdFx0XHRncm91cFRpdGxlID0gY29udHJpYnV0ZXNDb25maWd1cmF0aW9uWzBdLnRpdGxlO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0Y29uc3QgcmVjb21tZW5kYXRpb25JbmZvID0gdG9nZ2xlRGF0YS5zZXR0aW5nc0VkaXRvclJlY29tbWVuZGVkRXh0ZW5zaW9uc1trZXldO1xuXHRcdFx0XHRjb25zdCBleHRlbnNpb25OYW1lID0gZXh0ZW5zaW9uLmRpc3BsYXlOYW1lID8/IGV4dGVuc2lvbi5uYW1lID8/IGV4dGVuc2lvbklkO1xuXHRcdFx0XHRjb25zdCBzZXR0aW5nS2V5ID0gYCR7a2V5fS5tYW5hZ2VFeHRlbnNpb25gO1xuXHRcdFx0XHRjb25zdCBzZXR0aW5nOiBJU2V0dGluZyA9IHtcblx0XHRcdFx0XHRyYW5nZTogbnVsbFJhbmdlLFxuXHRcdFx0XHRcdGtleTogc2V0dGluZ0tleSxcblx0XHRcdFx0XHRrZXlSYW5nZTogbnVsbFJhbmdlLFxuXHRcdFx0XHRcdHZhbHVlOiBudWxsLFxuXHRcdFx0XHRcdHZhbHVlUmFuZ2U6IG51bGxSYW5nZSxcblx0XHRcdFx0XHRkZXNjcmlwdGlvbjogW3JlY29tbWVuZGF0aW9uSW5mby5vblNldHRpbmdzRWRpdG9yT3Blbj8uZGVzY3JpcHRpb25PdmVycmlkZSA/PyBleHRlbnNpb24uZGVzY3JpcHRpb25dLFxuXHRcdFx0XHRcdGRlc2NyaXB0aW9uSXNNYXJrZG93bjogZmFsc2UsXG5cdFx0XHRcdFx0ZGVzY3JpcHRpb25SYW5nZXM6IFtdLFxuXHRcdFx0XHRcdHNjb3BlOiBDb25maWd1cmF0aW9uU2NvcGUuV0lORE9XLFxuXHRcdFx0XHRcdHR5cGU6ICdudWxsJyxcblx0XHRcdFx0XHRkaXNwbGF5RXh0ZW5zaW9uSWQ6IGV4dGVuc2lvbklkLFxuXHRcdFx0XHRcdGV4dGVuc2lvbkdyb3VwVGl0bGU6IGdyb3VwVGl0bGUgPz8gZXh0ZW5zaW9uTmFtZSxcblx0XHRcdFx0XHRjYXRlZ29yeUxhYmVsOiAnRXh0ZW5zaW9ucycsXG5cdFx0XHRcdFx0dGl0bGU6IGV4dGVuc2lvbk5hbWVcblx0XHRcdFx0fTtcblx0XHRcdFx0Y29uc3QgYWRkaXRpb25hbEdyb3VwOiBJU2V0dGluZ3NHcm91cCA9IHtcblx0XHRcdFx0XHRzZWN0aW9uczogW3tcblx0XHRcdFx0XHRcdHNldHRpbmdzOiBbc2V0dGluZ10sXG5cdFx0XHRcdFx0fV0sXG5cdFx0XHRcdFx0aWQ6IGV4dGVuc2lvbklkLFxuXHRcdFx0XHRcdHRpdGxlOiBzZXR0aW5nLmV4dGVuc2lvbkdyb3VwVGl0bGUhLFxuXHRcdFx0XHRcdHRpdGxlUmFuZ2U6IG51bGxSYW5nZSxcblx0XHRcdFx0XHRyYW5nZTogbnVsbFJhbmdlLFxuXHRcdFx0XHRcdGV4dGVuc2lvbkluZm86IHtcblx0XHRcdFx0XHRcdGlkOiBleHRlbnNpb25JZCxcblx0XHRcdFx0XHRcdGRpc3BsYXlOYW1lOiBleHRlbnNpb24uZGlzcGxheU5hbWUsXG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9O1xuXHRcdFx0XHRncm91cHMucHVzaChhZGRpdGlvbmFsR3JvdXApO1xuXHRcdFx0XHRhZGRpdGlvbmFsR3JvdXBzLnB1c2goYWRkaXRpb25hbEdyb3VwKTtcblx0XHRcdFx0c2V0QWRkaXRpb25hbEdyb3VwcyA9IHRydWU7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0cmVzb2x2ZWRTZXR0aW5nc1Jvb3QuY2hpbGRyZW4hLnB1c2goYXdhaXQgY3JlYXRlVG9jVHJlZUZvckV4dGVuc2lvblNldHRpbmdzKHRoaXMuZXh0ZW5zaW9uU2VydmljZSwgZXh0ZW5zaW9uU2V0dGluZ3NHcm91cHMsIGZpbHRlcikpO1xuXG5cdFx0cmVzb2x2ZWRTZXR0aW5nc1Jvb3QuY2hpbGRyZW4hLnVuc2hpZnQoZ2V0Q29tbW9ubHlVc2VkRGF0YShncm91cHMpKTtcblxuXHRcdGlmICh0b2dnbGVEYXRhICYmIHNldEFkZGl0aW9uYWxHcm91cHMpIHtcblx0XHRcdC8vIEFkZCB0aGUgYWRkaXRpb25hbCBncm91cHMgdG8gdGhlIG1vZGVsIHRvIGhlbHAgd2l0aCBzZWFyY2hpbmcuXG5cdFx0XHR0aGlzLmRlZmF1bHRTZXR0aW5nc0VkaXRvck1vZGVsLnNldEFkZGl0aW9uYWxHcm91cHMoYWRkaXRpb25hbEdyb3Vwcyk7XG5cdFx0fVxuXG5cdFx0aWYgKCF0aGlzLndvcmtzcGFjZVRydXN0TWFuYWdlbWVudFNlcnZpY2UuaXNXb3Jrc3BhY2VUcnVzdGVkKCkgJiYgKHRoaXMudmlld1N0YXRlLnNldHRpbmdzVGFyZ2V0IGluc3RhbmNlb2YgVVJJIHx8IHRoaXMudmlld1N0YXRlLnNldHRpbmdzVGFyZ2V0ID09PSBDb25maWd1cmF0aW9uVGFyZ2V0LldPUktTUEFDRSkpIHtcblx0XHRcdGNvbnN0IGNvbmZpZ3VyZWRVbnRydXN0ZWRXb3Jrc3BhY2VTZXR0aW5ncyA9IHJlc29sdmVDb25maWd1cmVkVW50cnVzdGVkU2V0dGluZ3MoZ3JvdXBzLCB0aGlzLnZpZXdTdGF0ZS5zZXR0aW5nc1RhcmdldCwgdGhpcy52aWV3U3RhdGUubGFuZ3VhZ2VGaWx0ZXIsIHRoaXMuY29uZmlndXJhdGlvblNlcnZpY2UpO1xuXHRcdFx0aWYgKGNvbmZpZ3VyZWRVbnRydXN0ZWRXb3Jrc3BhY2VTZXR0aW5ncy5sZW5ndGgpIHtcblx0XHRcdFx0cmVzb2x2ZWRTZXR0aW5nc1Jvb3QuY2hpbGRyZW4hLnVuc2hpZnQoe1xuXHRcdFx0XHRcdGlkOiAnd29ya3NwYWNlVHJ1c3QnLFxuXHRcdFx0XHRcdGxhYmVsOiBsb2NhbGl6ZSgnc2V0dGluZ3MgcmVxdWlyZSB0cnVzdCcsIFwiV29ya3NwYWNlIFRydXN0XCIpLFxuXHRcdFx0XHRcdHNldHRpbmdzOiBjb25maWd1cmVkVW50cnVzdGVkV29ya3NwYWNlU2V0dGluZ3Ncblx0XHRcdFx0fSk7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0dGhpcy5zZWFyY2hSZXN1bHRNb2RlbD8udXBkYXRlQ2hpbGRyZW4oKTtcblxuXHRcdGNvbnN0IGZpcnN0VmlzaWJsZUVsZW1lbnQgPSB0aGlzLnNldHRpbmdzVHJlZS5maXJzdFZpc2libGVFbGVtZW50O1xuXHRcdGxldCBhbmNob3JJZDogc3RyaW5nIHwgdW5kZWZpbmVkO1xuXG5cdFx0aWYgKGZpcnN0VmlzaWJsZUVsZW1lbnQgaW5zdGFuY2VvZiBTZXR0aW5nc1RyZWVTZXR0aW5nRWxlbWVudCkge1xuXHRcdFx0YW5jaG9ySWQgPSBmaXJzdFZpc2libGVFbGVtZW50LnNldHRpbmcua2V5O1xuXHRcdH0gZWxzZSBpZiAoZmlyc3RWaXNpYmxlRWxlbWVudCBpbnN0YW5jZW9mIFNldHRpbmdzVHJlZUdyb3VwRWxlbWVudCkge1xuXHRcdFx0YW5jaG9ySWQgPSBmaXJzdFZpc2libGVFbGVtZW50LmlkO1xuXHRcdH1cblxuXHRcdGlmICh0aGlzLnNldHRpbmdzVHJlZU1vZGVsLnZhbHVlKSB7XG5cdFx0XHR0aGlzLnJlZnJlc2hNb2RlbHMocmVzb2x2ZWRTZXR0aW5nc1Jvb3QpO1xuXG5cdFx0XHRpZiAodHJpZ2dlclNlYXJjaCAmJiB0aGlzLnNlYXJjaFJlc3VsdE1vZGVsKSB7XG5cdFx0XHRcdC8vIElmIGFuIGV4dGVuc2lvbidzIHNldHRpbmdzIHdlcmUganVzdCBsb2FkZWQgYW5kIGEgc2VhcmNoIGlzIGFjdGl2ZSwgcmV0cmlnZ2VyIHRoZSBzZWFyY2ggc28gaXQgc2hvd3MgdXBcblx0XHRcdFx0cmV0dXJuIGF3YWl0IHRoaXMub25TZWFyY2hJbnB1dENoYW5nZWQoZmFsc2UpO1xuXHRcdFx0fVxuXG5cdFx0XHR0aGlzLnJlZnJlc2hUT0NUcmVlKCk7XG5cdFx0XHR0aGlzLnJlbmRlclRyZWUodW5kZWZpbmVkLCBmb3JjZVJlZnJlc2gpO1xuXG5cdFx0XHRpZiAoYW5jaG9ySWQpIHtcblx0XHRcdFx0Y29uc3QgbmV3TW9kZWwgPSB0aGlzLnNldHRpbmdzVHJlZU1vZGVsLnZhbHVlO1xuXHRcdFx0XHRsZXQgbmV3RWxlbWVudDogU2V0dGluZ3NUcmVlRWxlbWVudCB8IHVuZGVmaW5lZDtcblxuXHRcdFx0XHQvLyBlc2xpbnQtZGlzYWJsZS1uZXh0LWxpbmUgbm8tcmVzdHJpY3RlZC1zeW50YXhcblx0XHRcdFx0Y29uc3Qgc2V0dGluZ3MgPSBuZXdNb2RlbC5nZXRFbGVtZW50c0J5TmFtZShhbmNob3JJZCk7XG5cdFx0XHRcdGlmIChzZXR0aW5ncyAmJiBzZXR0aW5ncy5sZW5ndGggPiAwKSB7XG5cdFx0XHRcdFx0bmV3RWxlbWVudCA9IHNldHRpbmdzWzBdO1xuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdGNvbnN0IGZpbmRHcm91cCA9IChyb290czogU2V0dGluZ3NUcmVlR3JvdXBFbGVtZW50W10pOiBTZXR0aW5nc1RyZWVHcm91cEVsZW1lbnQgfCB1bmRlZmluZWQgPT4ge1xuXHRcdFx0XHRcdFx0Zm9yIChjb25zdCBnIG9mIHJvb3RzKSB7XG5cdFx0XHRcdFx0XHRcdGlmIChnLmlkID09PSBhbmNob3JJZCkge1xuXHRcdFx0XHRcdFx0XHRcdHJldHVybiBnO1xuXHRcdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHRcdGlmIChnLmNoaWxkcmVuKSB7XG5cdFx0XHRcdFx0XHRcdFx0Zm9yIChjb25zdCBjaGlsZCBvZiBnLmNoaWxkcmVuKSB7XG5cdFx0XHRcdFx0XHRcdFx0XHRpZiAoY2hpbGQgaW5zdGFuY2VvZiBTZXR0aW5nc1RyZWVHcm91cEVsZW1lbnQpIHtcblx0XHRcdFx0XHRcdFx0XHRcdFx0Y29uc3QgZm91bmQgPSBmaW5kR3JvdXAoW2NoaWxkXSk7XG5cdFx0XHRcdFx0XHRcdFx0XHRcdGlmIChmb3VuZCkge1xuXHRcdFx0XHRcdFx0XHRcdFx0XHRcdHJldHVybiBmb3VuZDtcblx0XHRcdFx0XHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHRcdFx0XHR9O1xuXHRcdFx0XHRcdG5ld0VsZW1lbnQgPSBmaW5kR3JvdXAoW25ld01vZGVsLnJvb3RdKTtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdGlmIChuZXdFbGVtZW50KSB7XG5cdFx0XHRcdFx0dHJ5IHtcblx0XHRcdFx0XHRcdHRoaXMuc2V0dGluZ3NUcmVlLnJldmVhbChuZXdFbGVtZW50LCAwKTtcblx0XHRcdFx0XHR9IGNhdGNoIChlKSB7XG5cdFx0XHRcdFx0XHQvLyBJZ25vcmUgdGhlIGVycm9yXG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fSBlbHNlIHtcblx0XHRcdHRoaXMuc2V0dGluZ3NUcmVlTW9kZWwudmFsdWUgPSB0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFNldHRpbmdzVHJlZU1vZGVsLCB0aGlzLnZpZXdTdGF0ZSwgdGhpcy53b3Jrc3BhY2VUcnVzdE1hbmFnZW1lbnRTZXJ2aWNlLmlzV29ya3NwYWNlVHJ1c3RlZCgpKTtcblx0XHRcdHRoaXMucmVmcmVzaE1vZGVscyhyZXNvbHZlZFNldHRpbmdzUm9vdCk7XG5cblx0XHRcdC8vIERvbid0IHJlc3RvcmUgdGhlIGNhY2hlZCBzdGF0ZSBpZiB3ZSBhbHJlYWR5IGhhdmUgYSBxdWVyeSB2YWx1ZSBmcm9tIGNhbGxpbmcgX3NldE9wdGlvbnMoKS5cblx0XHRcdGNvbnN0IGNhY2hlZFN0YXRlID0gIXRoaXMudmlld1N0YXRlLnF1ZXJ5ID8gdGhpcy5yZXN0b3JlQ2FjaGVkU3RhdGUoKSA6IHVuZGVmaW5lZDtcblx0XHRcdGlmIChjYWNoZWRTdGF0ZT8uc2VhcmNoUXVlcnkgfHwgdGhpcy5zZWFyY2hXaWRnZXQuZ2V0VmFsdWUoKSkge1xuXHRcdFx0XHRhd2FpdCB0aGlzLm9uU2VhcmNoSW5wdXRDaGFuZ2VkKHRydWUpO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0dGhpcy5yZWZyZXNoVE9DVHJlZSgpO1xuXG5cdFx0XHRcdC8vIFNldCBpbml0aWFsIGNhdGVnb3J5IHRvIHRoZSBmaXJzdCBvbmUgKENvbW1vbmx5IFVzZWQpXG5cdFx0XHRcdGNvbnN0IHJvb3RDaGlsZHJlbiA9IHRoaXMuc2V0dGluZ3NUcmVlTW9kZWwudmFsdWUucm9vdC5jaGlsZHJlbjtcblx0XHRcdFx0aWYgKEFycmF5LmlzQXJyYXkocm9vdENoaWxkcmVuKSAmJiByb290Q2hpbGRyZW4ubGVuZ3RoID4gMCkge1xuXHRcdFx0XHRcdGNvbnN0IGZpcnN0Q2F0ZWdvcnkgPSByb290Q2hpbGRyZW5bMF07XG5cdFx0XHRcdFx0aWYgKGZpcnN0Q2F0ZWdvcnkgaW5zdGFuY2VvZiBTZXR0aW5nc1RyZWVHcm91cEVsZW1lbnQpIHtcblx0XHRcdFx0XHRcdHRoaXMudmlld1N0YXRlLmNhdGVnb3J5RmlsdGVyID0gZmlyc3RDYXRlZ29yeTtcblx0XHRcdFx0XHRcdHRoaXMudG9jVHJlZS5zZXRGb2N1cyhbZmlyc3RDYXRlZ29yeV0pO1xuXHRcdFx0XHRcdFx0dGhpcy50b2NUcmVlLnNldFNlbGVjdGlvbihbZmlyc3RDYXRlZ29yeV0pO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXG5cdFx0XHRcdHRoaXMucmVmcmVzaFRyZWUoKTtcblx0XHRcdFx0dGhpcy50b2NUcmVlLmNvbGxhcHNlQWxsKCk7XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSB1cGRhdGVFbGVtZW50c0J5S2V5KGtleXM6IFJlYWRvbmx5U2V0PHN0cmluZz4pOiB2b2lkIHtcblx0XHRpZiAoa2V5cy5zaXplKSB7XG5cdFx0XHRpZiAodGhpcy5zZWFyY2hSZXN1bHRNb2RlbCkge1xuXHRcdFx0XHRrZXlzLmZvckVhY2goa2V5ID0+IHRoaXMuc2VhcmNoUmVzdWx0TW9kZWwhLnVwZGF0ZUVsZW1lbnRzQnlOYW1lKGtleSkpO1xuXHRcdFx0fVxuXG5cdFx0XHRpZiAodGhpcy5zZXR0aW5nc1RyZWVNb2RlbC52YWx1ZSkge1xuXHRcdFx0XHRrZXlzLmZvckVhY2goa2V5ID0+IHRoaXMuc2V0dGluZ3NUcmVlTW9kZWwudmFsdWUhLnVwZGF0ZUVsZW1lbnRzQnlOYW1lKGtleSkpO1xuXHRcdFx0fVxuXG5cdFx0XHRrZXlzLmZvckVhY2goa2V5ID0+IHRoaXMucmVuZGVyVHJlZShrZXkpKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0dGhpcy5yZW5kZXJUcmVlKCk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBnZXRBY3RpdmVDb250cm9sSW5TZXR0aW5nc1RyZWUoKTogSFRNTEVsZW1lbnQgfCBudWxsIHtcblx0XHRjb25zdCBlbGVtZW50ID0gdGhpcy5zZXR0aW5nc1RyZWUuZ2V0SFRNTEVsZW1lbnQoKTtcblx0XHRjb25zdCBhY3RpdmVFbGVtZW50ID0gZWxlbWVudC5vd25lckRvY3VtZW50LmFjdGl2ZUVsZW1lbnQ7XG5cdFx0cmV0dXJuIChhY3RpdmVFbGVtZW50ICYmIERPTS5pc0FuY2VzdG9yT2ZBY3RpdmVFbGVtZW50KGVsZW1lbnQpKSA/XG5cdFx0XHQ8SFRNTEVsZW1lbnQ+YWN0aXZlRWxlbWVudCA6XG5cdFx0XHRudWxsO1xuXHR9XG5cblx0cHJpdmF0ZSByZW5kZXJUcmVlKGtleT86IHN0cmluZywgZm9yY2UgPSBmYWxzZSk6IHZvaWQge1xuXHRcdGlmICghZm9yY2UgJiYga2V5ICYmIHRoaXMuc2NoZWR1bGVkUmVmcmVzaGVzLmhhcyhrZXkpKSB7XG5cdFx0XHR0aGlzLnVwZGF0ZU1vZGlmaWVkTGFiZWxGb3JLZXkoa2V5KTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHQvLyBJZiB0aGUgY29udGV4dCB2aWV3IGlzIGZvY3VzZWQsIGRlbGF5IHJlbmRlcmluZyBzZXR0aW5nc1xuXHRcdGlmICh0aGlzLmNvbnRleHRWaWV3Rm9jdXNlZCgpKSB7XG5cdFx0XHQvLyBlc2xpbnQtZGlzYWJsZS1uZXh0LWxpbmUgbm8tcmVzdHJpY3RlZC1zeW50YXhcblx0XHRcdGNvbnN0IGVsZW1lbnQgPSB0aGlzLndpbmRvdy5kb2N1bWVudC5xdWVyeVNlbGVjdG9yKCcuY29udGV4dC12aWV3Jyk7XG5cdFx0XHRpZiAoZWxlbWVudCkge1xuXHRcdFx0XHR0aGlzLnNjaGVkdWxlUmVmcmVzaChlbGVtZW50IGFzIEhUTUxFbGVtZW50LCBrZXkpO1xuXHRcdFx0fVxuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdC8vIElmIGEgc2V0dGluZyBjb250cm9sIGlzIGN1cnJlbnRseSBmb2N1c2VkLCBzY2hlZHVsZSBhIHJlZnJlc2ggZm9yIGxhdGVyXG5cdFx0Y29uc3QgYWN0aXZlRWxlbWVudCA9IHRoaXMuZ2V0QWN0aXZlQ29udHJvbEluU2V0dGluZ3NUcmVlKCk7XG5cdFx0Y29uc3QgZm9jdXNlZFNldHRpbmcgPSBhY3RpdmVFbGVtZW50ICYmIHRoaXMuc2V0dGluZ1JlbmRlcmVycy5nZXRTZXR0aW5nRE9NRWxlbWVudEZvckRPTUVsZW1lbnQoYWN0aXZlRWxlbWVudCk7XG5cdFx0aWYgKGZvY3VzZWRTZXR0aW5nICYmICFmb3JjZSkge1xuXHRcdFx0Ly8gSWYgYSBzaW5nbGUgc2V0dGluZyBpcyBiZWluZyByZWZyZXNoZWQsIGl0J3Mgb2sgdG8gcmVmcmVzaCBub3cgaWYgdGhhdCBpcyBub3QgdGhlIGZvY3VzZWQgc2V0dGluZ1xuXHRcdFx0aWYgKGtleSkge1xuXHRcdFx0XHRjb25zdCBmb2N1c2VkS2V5ID0gZm9jdXNlZFNldHRpbmcuZ2V0QXR0cmlidXRlKEFic3RyYWN0U2V0dGluZ1JlbmRlcmVyLlNFVFRJTkdfS0VZX0FUVFIpO1xuXHRcdFx0XHRpZiAoZm9jdXNlZEtleSA9PT0ga2V5ICYmXG5cdFx0XHRcdFx0Ly8gdXBkYXRlIGBsaXN0YHMgbGl2ZSwgYXMgdGhleSBoYXZlIGEgc2VwYXJhdGUgXCJzdWJtaXQgZWRpdFwiIHN0ZXAgYnVpbHQgaW4gYmVmb3JlIHRoaXNcblx0XHRcdFx0XHQoZm9jdXNlZFNldHRpbmcucGFyZW50RWxlbWVudCAmJiAhZm9jdXNlZFNldHRpbmcucGFyZW50RWxlbWVudC5jbGFzc0xpc3QuY29udGFpbnMoJ3NldHRpbmctaXRlbS1saXN0JykpXG5cdFx0XHRcdCkge1xuXHRcdFx0XHRcdHRoaXMudXBkYXRlTW9kaWZpZWRMYWJlbEZvcktleShrZXkpO1xuXHRcdFx0XHRcdHRoaXMuc2NoZWR1bGVSZWZyZXNoKGZvY3VzZWRTZXR0aW5nLCBrZXkpO1xuXHRcdFx0XHRcdHJldHVybjtcblx0XHRcdFx0fVxuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0dGhpcy5zY2hlZHVsZVJlZnJlc2goZm9jdXNlZFNldHRpbmcpO1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0dGhpcy5yZW5kZXJSZXN1bHRDb3VudE1lc3NhZ2VzKGZhbHNlKTtcblxuXHRcdGlmIChrZXkpIHtcblx0XHRcdC8vIGVzbGludC1kaXNhYmxlLW5leHQtbGluZSBuby1yZXN0cmljdGVkLXN5bnRheFxuXHRcdFx0Y29uc3QgZWxlbWVudHMgPSB0aGlzLmN1cnJlbnRTZXR0aW5nc01vZGVsPy5nZXRFbGVtZW50c0J5TmFtZShrZXkpO1xuXHRcdFx0aWYgKGVsZW1lbnRzPy5sZW5ndGgpIHtcblx0XHRcdFx0aWYgKGVsZW1lbnRzLmxlbmd0aCA+PSAyKSB7XG5cdFx0XHRcdFx0Y29uc29sZS53YXJuKCdNb3JlIHRoYW4gb25lIHNldHRpbmcgd2l0aCBrZXkgJyArIGtleSArICcgZm91bmQnKTtcblx0XHRcdFx0fVxuXHRcdFx0XHR0aGlzLnJlZnJlc2hTaW5nbGVFbGVtZW50KGVsZW1lbnRzWzBdKTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdC8vIFJlZnJlc2ggcmVxdWVzdGVkIGZvciBhIGtleSB0aGF0IHdlIGRvbid0IGtub3cgYWJvdXRcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXHRcdH0gZWxzZSB7XG5cdFx0XHR0aGlzLnJlZnJlc2hUcmVlKCk7XG5cdFx0fVxuXG5cdFx0cmV0dXJuO1xuXHR9XG5cblx0cHJpdmF0ZSBjb250ZXh0Vmlld0ZvY3VzZWQoKTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuICEhRE9NLmZpbmRQYXJlbnRXaXRoQ2xhc3MoPEhUTUxFbGVtZW50PnRoaXMucm9vdEVsZW1lbnQub3duZXJEb2N1bWVudC5hY3RpdmVFbGVtZW50LCAnY29udGV4dC12aWV3Jyk7XG5cdH1cblxuXHRwcml2YXRlIHJlZnJlc2hTaW5nbGVFbGVtZW50KGVsZW1lbnQ6IFNldHRpbmdzVHJlZVNldHRpbmdFbGVtZW50KTogdm9pZCB7XG5cdFx0aWYgKHRoaXMuaXNWaXNpYmxlKClcblx0XHRcdCYmIHRoaXMuc2V0dGluZ3NUcmVlLmhhc0VsZW1lbnQoZWxlbWVudClcblx0XHRcdCYmICghZWxlbWVudC5zZXR0aW5nLmRlcHJlY2F0aW9uTWVzc2FnZSB8fCBlbGVtZW50LmlzQ29uZmlndXJlZCkpIHtcblx0XHRcdHRoaXMuc2V0dGluZ3NUcmVlLnJlcmVuZGVyKGVsZW1lbnQpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgcmVmcmVzaFRyZWUoKTogdm9pZCB7XG5cdFx0aWYgKHRoaXMuaXNWaXNpYmxlKCkgJiYgdGhpcy5jdXJyZW50U2V0dGluZ3NNb2RlbCkge1xuXHRcdFx0dGhpcy5zZXR0aW5nc1RyZWUuc2V0Q2hpbGRyZW4obnVsbCwgY3JlYXRlR3JvdXBJdGVyYXRvcih0aGlzLmN1cnJlbnRTZXR0aW5nc01vZGVsLnJvb3QpKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIHJlZnJlc2hUT0NUcmVlKCk6IHZvaWQge1xuXHRcdGlmICh0aGlzLmlzVmlzaWJsZSgpKSB7XG5cdFx0XHR0aGlzLnRvY1RyZWVNb2RlbC51cGRhdGUoKTtcblx0XHRcdHRoaXMudG9jVHJlZS5zZXRDaGlsZHJlbihudWxsLCBjcmVhdGVUT0NJdGVyYXRvcih0aGlzLnRvY1RyZWVNb2RlbCwgdGhpcy50b2NUcmVlKSk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSB1cGRhdGVNb2RpZmllZExhYmVsRm9yS2V5KGtleTogc3RyaW5nKTogdm9pZCB7XG5cdFx0aWYgKCF0aGlzLmN1cnJlbnRTZXR0aW5nc01vZGVsKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdC8vIGVzbGludC1kaXNhYmxlLW5leHQtbGluZSBuby1yZXN0cmljdGVkLXN5bnRheFxuXHRcdGNvbnN0IGRhdGFFbGVtZW50cyA9IHRoaXMuY3VycmVudFNldHRpbmdzTW9kZWwuZ2V0RWxlbWVudHNCeU5hbWUoa2V5KTtcblx0XHRjb25zdCBpc01vZGlmaWVkID0gZGF0YUVsZW1lbnRzICYmIGRhdGFFbGVtZW50c1swXSAmJiBkYXRhRWxlbWVudHNbMF0uaXNDb25maWd1cmVkOyAvLyBhbGwgZWxlbWVudHMgYXJlIGVpdGhlciBjb25maWd1cmVkIG9yIG5vdFxuXHRcdGNvbnN0IGVsZW1lbnRzID0gdGhpcy5zZXR0aW5nUmVuZGVyZXJzLmdldERPTUVsZW1lbnRzRm9yU2V0dGluZ0tleSh0aGlzLnNldHRpbmdzVHJlZS5nZXRIVE1MRWxlbWVudCgpLCBrZXkpO1xuXHRcdGlmIChlbGVtZW50cyAmJiBlbGVtZW50c1swXSkge1xuXHRcdFx0ZWxlbWVudHNbMF0uY2xhc3NMaXN0LnRvZ2dsZSgnaXMtY29uZmlndXJlZCcsICEhaXNNb2RpZmllZCk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBvblNlYXJjaElucHV0Q2hhbmdlZChleHBhbmRSZXN1bHRzOiBib29sZWFuKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0aWYgKCF0aGlzLmN1cnJlbnRTZXR0aW5nc01vZGVsKSB7XG5cdFx0XHQvLyBJbml0aWFsaXppbmcgc2VhcmNoIHdpZGdldCB2YWx1ZVxuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IHF1ZXJ5ID0gdGhpcy5zZWFyY2hXaWRnZXQuZ2V0VmFsdWUoKS50cmltKCk7XG5cdFx0dGhpcy52aWV3U3RhdGUucXVlcnkgPSBxdWVyeTtcblx0XHRpZiAocXVlcnkpIHtcblx0XHRcdHRoaXMuc2VhcmNoV2lkZ2V0LmFkZFRvSGlzdG9yeSgpO1xuXHRcdFx0dGhpcy51cGRhdGVTZWFyY2hQbGFjZWhvbGRlcigpO1xuXHRcdFx0dGhpcy5zYXZlU2VhcmNoSGlzdG9yeSgpO1xuXHRcdH1cblx0XHRhd2FpdCB0aGlzLnRyaWdnZXJTZWFyY2gocXVlcnkucmVwbGFjZSgvXFx1MjAzQS9nLCAnICcpLCBleHBhbmRSZXN1bHRzKTtcblx0fVxuXG5cdHByaXZhdGUgbG9hZFNlYXJjaEhpc3RvcnkoKTogc3RyaW5nW10ge1xuXHRcdGNvbnN0IHJhdyA9IHRoaXMuc3RvcmFnZVNlcnZpY2UuZ2V0KHRoaXMuU0VBUkNIX0hJU1RPUllfU1RPUkFHRV9LRVksIFN0b3JhZ2VTY29wZS5QUk9GSUxFKTtcblx0XHRpZiAoIXJhdykge1xuXHRcdFx0cmV0dXJuIFtdO1xuXHRcdH1cblx0XHR0cnkge1xuXHRcdFx0Y29uc3QgcGFyc2VkID0gSlNPTi5wYXJzZShyYXcpO1xuXHRcdFx0cmV0dXJuIEFycmF5LmlzQXJyYXkocGFyc2VkKSA/IHBhcnNlZC5maWx0ZXIoKGVudHJ5KTogZW50cnkgaXMgc3RyaW5nID0+IHR5cGVvZiBlbnRyeSA9PT0gJ3N0cmluZycpIDogW107XG5cdFx0fSBjYXRjaCB7XG5cdFx0XHRyZXR1cm4gW107XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBzYXZlU2VhcmNoSGlzdG9yeSgpOiB2b2lkIHtcblx0XHRpZiAoIXRoaXMuc2VhcmNoV2lkZ2V0KSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGNvbnN0IGhpc3RvcnkgPSB0aGlzLnNlYXJjaFdpZGdldC5nZXRIaXN0b3J5KCk7XG5cdFx0aWYgKGhpc3RvcnkubGVuZ3RoKSB7XG5cdFx0XHR0aGlzLnN0b3JhZ2VTZXJ2aWNlLnN0b3JlKHRoaXMuU0VBUkNIX0hJU1RPUllfU1RPUkFHRV9LRVksIEpTT04uc3RyaW5naWZ5KGhpc3RvcnkpLCBTdG9yYWdlU2NvcGUuUFJPRklMRSwgU3RvcmFnZVRhcmdldC5NQUNISU5FKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0dGhpcy5zdG9yYWdlU2VydmljZS5yZW1vdmUodGhpcy5TRUFSQ0hfSElTVE9SWV9TVE9SQUdFX0tFWSwgU3RvcmFnZVNjb3BlLlBST0ZJTEUpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgcGFyc2VTZXR0aW5nRnJvbUpTT04ocXVlcnk6IHN0cmluZyk6IHN0cmluZyB8IG51bGwge1xuXHRcdGNvbnN0IG1hdGNoID0gcXVlcnkubWF0Y2goL1wiKFthLXpBLVouXSspXCI6IC8pO1xuXHRcdHJldHVybiBtYXRjaCAmJiBtYXRjaFsxXTtcblx0fVxuXG5cdC8qKlxuXHQgKiBUb2dnbGVzIHRoZSB2aXNpYmlsaXR5IG9mIHRoZSBTZXR0aW5ncyBlZGl0b3IgdGFibGUgb2YgY29udGVudHMgZHVyaW5nIGEgc2VhcmNoXG5cdCAqIGRlcGVuZGluZyBvbiB0aGUgYmVoYXZpb3IuXG5cdCAqL1xuXHRwcml2YXRlIHRvZ2dsZVRvY0J5U2VhcmNoQmVoYXZpb3JUeXBlKCkge1xuXHRcdGNvbnN0IHRvY0JlaGF2aW9yID0gdGhpcy5jb25maWd1cmF0aW9uU2VydmljZS5nZXRWYWx1ZTwnZmlsdGVyJyB8ICdoaWRlJz4oU0VBUkNIX1RPQ19CRUhBVklPUl9LRVkpO1xuXHRcdGNvbnN0IGhpZGVUb2MgPSB0b2NCZWhhdmlvciA9PT0gJ2hpZGUnO1xuXHRcdGlmIChoaWRlVG9jKSB7XG5cdFx0XHR0aGlzLnNwbGl0Vmlldy5zZXRWaWV3VmlzaWJsZSgwLCBmYWxzZSk7XG5cdFx0XHR0aGlzLnNwbGl0Vmlldy5zdHlsZSh7XG5cdFx0XHRcdHNlcGFyYXRvckJvcmRlcjogQ29sb3IudHJhbnNwYXJlbnRcblx0XHRcdH0pO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHR0aGlzLmxheW91dFNwbGl0Vmlldyh0aGlzLmRpbWVuc2lvbik7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyB0cmlnZ2VyU2VhcmNoKHF1ZXJ5OiBzdHJpbmcsIGV4cGFuZFJlc3VsdHM6IGJvb2xlYW4pOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCBwcm9ncmVzc1J1bm5lciA9IHRoaXMuZWRpdG9yUHJvZ3Jlc3NTZXJ2aWNlLnNob3codHJ1ZSwgODAwKTtcblx0XHRjb25zdCBzaG93QWR2YW5jZWQgPSB0aGlzLnZpZXdTdGF0ZS50YWdGaWx0ZXJzPy5oYXMoQURWQU5DRURfU0VUVElOR19UQUcpO1xuXHRcdHRoaXMudmlld1N0YXRlLnRhZ0ZpbHRlcnMgPSBuZXcgU2V0PHN0cmluZz4oKTtcblx0XHR0aGlzLnZpZXdTdGF0ZS5leHRlbnNpb25GaWx0ZXJzID0gbmV3IFNldDxzdHJpbmc+KCk7XG5cdFx0dGhpcy52aWV3U3RhdGUuZmVhdHVyZUZpbHRlcnMgPSBuZXcgU2V0PHN0cmluZz4oKTtcblx0XHR0aGlzLnZpZXdTdGF0ZS5pZEZpbHRlcnMgPSBuZXcgU2V0PHN0cmluZz4oKTtcblx0XHR0aGlzLnZpZXdTdGF0ZS5sYW5ndWFnZUZpbHRlciA9IHVuZGVmaW5lZDtcblx0XHRpZiAocXVlcnkpIHtcblx0XHRcdGNvbnN0IHBhcnNlZFF1ZXJ5ID0gcGFyc2VRdWVyeShxdWVyeSk7XG5cdFx0XHRxdWVyeSA9IHBhcnNlZFF1ZXJ5LnF1ZXJ5O1xuXHRcdFx0cGFyc2VkUXVlcnkudGFncy5mb3JFYWNoKHRhZyA9PiB0aGlzLnZpZXdTdGF0ZS50YWdGaWx0ZXJzIS5hZGQodGFnKSk7XG5cdFx0XHRwYXJzZWRRdWVyeS5leHRlbnNpb25GaWx0ZXJzLmZvckVhY2goZXh0ZW5zaW9uSWQgPT4gdGhpcy52aWV3U3RhdGUuZXh0ZW5zaW9uRmlsdGVycyEuYWRkKGV4dGVuc2lvbklkKSk7XG5cdFx0XHRwYXJzZWRRdWVyeS5mZWF0dXJlRmlsdGVycy5mb3JFYWNoKGZlYXR1cmUgPT4gdGhpcy52aWV3U3RhdGUuZmVhdHVyZUZpbHRlcnMhLmFkZChmZWF0dXJlKSk7XG5cdFx0XHRwYXJzZWRRdWVyeS5pZEZpbHRlcnMuZm9yRWFjaChpZCA9PiB0aGlzLnZpZXdTdGF0ZS5pZEZpbHRlcnMhLmFkZChpZCkpO1xuXHRcdFx0dGhpcy52aWV3U3RhdGUubGFuZ3VhZ2VGaWx0ZXIgPSBwYXJzZWRRdWVyeS5sYW5ndWFnZUZpbHRlcjtcblx0XHR9XG5cblx0XHRpZiAoc2hvd0FkdmFuY2VkICE9PSB0aGlzLnZpZXdTdGF0ZS50YWdGaWx0ZXJzPy5oYXMoQURWQU5DRURfU0VUVElOR19UQUcpKSB7XG5cdFx0XHRhd2FpdCB0aGlzLm9uQ29uZmlnVXBkYXRlKCk7XG5cdFx0fVxuXG5cdFx0dGhpcy5zZXR0aW5nc1RhcmdldHNXaWRnZXQudXBkYXRlTGFuZ3VhZ2VGaWx0ZXJJbmRpY2F0b3JzKHRoaXMudmlld1N0YXRlLmxhbmd1YWdlRmlsdGVyKTtcblxuXHRcdGlmIChxdWVyeSAmJiBxdWVyeSAhPT0gJ0AnKSB7XG5cdFx0XHRxdWVyeSA9IHRoaXMucGFyc2VTZXR0aW5nRnJvbUpTT04ocXVlcnkpIHx8IHF1ZXJ5O1xuXHRcdFx0YXdhaXQgdGhpcy50cmlnZ2VyRmlsdGVyUHJlZmVyZW5jZXMocXVlcnksIGV4cGFuZFJlc3VsdHMsIHByb2dyZXNzUnVubmVyKTtcblx0XHRcdHRoaXMudG9nZ2xlVG9jQnlTZWFyY2hCZWhhdmlvclR5cGUoKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0aWYgKHRoaXMudmlld1N0YXRlLnRhZ0ZpbHRlcnMuc2l6ZSB8fCB0aGlzLnZpZXdTdGF0ZS5leHRlbnNpb25GaWx0ZXJzLnNpemUgfHwgdGhpcy52aWV3U3RhdGUuZmVhdHVyZUZpbHRlcnMuc2l6ZSB8fCB0aGlzLnZpZXdTdGF0ZS5pZEZpbHRlcnMuc2l6ZSB8fCB0aGlzLnZpZXdTdGF0ZS5sYW5ndWFnZUZpbHRlcikge1xuXHRcdFx0XHR0aGlzLnNlYXJjaFJlc3VsdE1vZGVsID0gdGhpcy5jcmVhdGVGaWx0ZXJNb2RlbCgpO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0dGhpcy5zZWFyY2hSZXN1bHRNb2RlbCA9IG51bGw7XG5cdFx0XHR9XG5cblx0XHRcdHRoaXMuc2VhcmNoRGVsYXllci5jYW5jZWwoKTtcblx0XHRcdGlmICh0aGlzLnNlYXJjaEluUHJvZ3Jlc3MpIHtcblx0XHRcdFx0dGhpcy5zZWFyY2hJblByb2dyZXNzLmRpc3Bvc2UodHJ1ZSk7XG5cdFx0XHRcdHRoaXMuc2VhcmNoSW5Qcm9ncmVzcyA9IG51bGw7XG5cdFx0XHR9XG5cblx0XHRcdGlmIChleHBhbmRSZXN1bHRzKSB7XG5cdFx0XHRcdHRoaXMudG9jVHJlZS5zZXRGb2N1cyhbXSk7XG5cdFx0XHRcdHRoaXMudmlld1N0YXRlLmNhdGVnb3J5RmlsdGVyID0gdW5kZWZpbmVkO1xuXHRcdFx0fVxuXHRcdFx0dGhpcy50b2NUcmVlTW9kZWwuY3VycmVudFNlYXJjaE1vZGVsID0gdGhpcy5zZWFyY2hSZXN1bHRNb2RlbDtcblx0XHRcdHRoaXMucmVuZGVyZWRTZWFyY2hRdWVyeSA9IHRoaXMudmlld1N0YXRlLnF1ZXJ5O1xuXG5cdFx0XHRpZiAodGhpcy5zZWFyY2hSZXN1bHRNb2RlbCkge1xuXHRcdFx0XHQvLyBBZGRlZCBhIGZpbHRlciBtb2RlbFxuXHRcdFx0XHRpZiAoZXhwYW5kUmVzdWx0cykge1xuXHRcdFx0XHRcdHRoaXMudG9jVHJlZS5zZXRTZWxlY3Rpb24oW10pO1xuXHRcdFx0XHRcdHRoaXMudG9jVHJlZS5leHBhbmRBbGwoKTtcblx0XHRcdFx0fVxuXHRcdFx0XHR0aGlzLnJlZnJlc2hUT0NUcmVlKCk7XG5cdFx0XHRcdHRoaXMucmVuZGVyUmVzdWx0Q291bnRNZXNzYWdlcyhmYWxzZSk7XG5cdFx0XHRcdHRoaXMucmVmcmVzaFRyZWUoKTtcblx0XHRcdFx0dGhpcy50b2dnbGVUb2NCeVNlYXJjaEJlaGF2aW9yVHlwZSgpO1xuXHRcdFx0fSBlbHNlIGlmICghdGhpcy50b2NUcmVlRGlzcG9zZWQpIHtcblx0XHRcdFx0Ly8gTGVhdmluZyBzZWFyY2ggbW9kZVxuXHRcdFx0XHR0aGlzLnRvY1RyZWUuY29sbGFwc2VBbGwoKTtcblx0XHRcdFx0dGhpcy5yZWZyZXNoVE9DVHJlZSgpO1xuXHRcdFx0XHR0aGlzLnJlbmRlclJlc3VsdENvdW50TWVzc2FnZXMoZmFsc2UpO1xuXHRcdFx0XHR0aGlzLnJlZnJlc2hUcmVlKCk7XG5cdFx0XHRcdHRoaXMubGF5b3V0U3BsaXRWaWV3KHRoaXMuZGltZW5zaW9uKTtcblx0XHRcdH1cblx0XHRcdHByb2dyZXNzUnVubmVyLmRvbmUoKTtcblx0XHR9XG5cdH1cblxuXHQvKipcblx0ICogUmV0dXJuIGEgZmFrZSBTZWFyY2hSZXN1bHRNb2RlbCB3aGljaCBjYW4gaG9sZCBhIGZsYXQgbGlzdCBvZiBhbGwgc2V0dGluZ3MsIHRvIGJlIGZpbHRlcmVkIChAbW9kaWZpZWQgZXRjKVxuXHQgKi9cblx0cHJpdmF0ZSBjcmVhdGVGaWx0ZXJNb2RlbCgpOiBTZWFyY2hSZXN1bHRNb2RlbCB7XG5cdFx0Y29uc3QgZmlsdGVyTW9kZWwgPSB0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFNlYXJjaFJlc3VsdE1vZGVsLCB0aGlzLnZpZXdTdGF0ZSwgdGhpcy5zZXR0aW5nc09yZGVyQnlUb2NJbmRleCwgdGhpcy53b3Jrc3BhY2VUcnVzdE1hbmFnZW1lbnRTZXJ2aWNlLmlzV29ya3NwYWNlVHJ1c3RlZCgpKTtcblxuXHRcdGNvbnN0IGZ1bGxSZXN1bHQ6IElTZWFyY2hSZXN1bHQgPSB7XG5cdFx0XHRmaWx0ZXJNYXRjaGVzOiBbXSxcblx0XHRcdGV4YWN0TWF0Y2g6IGZhbHNlLFxuXHRcdH07XG5cdFx0Y29uc3Qgc2hvdWxkU2hvd0FkdmFuY2VkID0gdGhpcy5jYW5TaG93QWR2YW5jZWRTZXR0aW5ncygpO1xuXHRcdGZvciAoY29uc3QgZyBvZiB0aGlzLmRlZmF1bHRTZXR0aW5nc0VkaXRvck1vZGVsLnNldHRpbmdzR3JvdXBzLnNsaWNlKDEpKSB7XG5cdFx0XHRmb3IgKGNvbnN0IHNlY3Qgb2YgZy5zZWN0aW9ucykge1xuXHRcdFx0XHRmb3IgKGNvbnN0IHNldHRpbmcgb2Ygc2VjdC5zZXR0aW5ncykge1xuXHRcdFx0XHRcdGlmICghc2hvdWxkU2hvd0FkdmFuY2VkICYmICF0aGlzLnNob3VsZFNob3dTZXR0aW5nKHNldHRpbmcpKSB7XG5cdFx0XHRcdFx0XHRjb250aW51ZTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0ZnVsbFJlc3VsdC5maWx0ZXJNYXRjaGVzLnB1c2goe1xuXHRcdFx0XHRcdFx0c2V0dGluZyxcblx0XHRcdFx0XHRcdG1hdGNoZXM6IFtdLFxuXHRcdFx0XHRcdFx0bWF0Y2hUeXBlOiBTZXR0aW5nTWF0Y2hUeXBlLk5vbmUsXG5cdFx0XHRcdFx0XHRrZXlNYXRjaFNjb3JlOiAwLFxuXHRcdFx0XHRcdFx0c2NvcmU6IDAsXG5cdFx0XHRcdFx0XHRwcm92aWRlck5hbWU6IEZJTFRFUl9NT0RFTF9TRUFSQ0hfUFJPVklERVJfTkFNRVxuXHRcdFx0XHRcdH0pO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0ZmlsdGVyTW9kZWwuc2V0UmVzdWx0KDAsIGZ1bGxSZXN1bHQpO1xuXHRcdHJldHVybiBmaWx0ZXJNb2RlbDtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgdHJpZ2dlckZpbHRlclByZWZlcmVuY2VzKHF1ZXJ5OiBzdHJpbmcsIGV4cGFuZFJlc3VsdHM6IGJvb2xlYW4sIHByb2dyZXNzUnVubmVyOiBJUHJvZ3Jlc3NSdW5uZXIpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRpZiAodGhpcy5zZWFyY2hJblByb2dyZXNzKSB7XG5cdFx0XHR0aGlzLnNlYXJjaEluUHJvZ3Jlc3MuZGlzcG9zZSh0cnVlKTtcblx0XHRcdHRoaXMuc2VhcmNoSW5Qcm9ncmVzcyA9IG51bGw7XG5cdFx0fVxuXG5cdFx0Y29uc3Qgc2VhcmNoSW5Qcm9ncmVzcyA9IHRoaXMuc2VhcmNoSW5Qcm9ncmVzcyA9IG5ldyBDYW5jZWxsYXRpb25Ub2tlblNvdXJjZSgpO1xuXHRcdHJldHVybiB0aGlzLnNlYXJjaERlbGF5ZXIudHJpZ2dlcihhc3luYyAoKSA9PiB7XG5cdFx0XHRpZiAoc2VhcmNoSW5Qcm9ncmVzcy50b2tlbi5pc0NhbmNlbGxhdGlvblJlcXVlc3RlZCkge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cdFx0XHR0aGlzLmRpc2FibGVBaVNlYXJjaFRvZ2dsZSgpO1xuXHRcdFx0Y29uc3QgbG9jYWxSZXN1bHRzID0gYXdhaXQgdGhpcy5kb0xvY2FsU2VhcmNoKHF1ZXJ5LCBzZWFyY2hJblByb2dyZXNzLnRva2VuKTtcblx0XHRcdGlmICghdGhpcy5zZWFyY2hSZXN1bHRNb2RlbCB8fCBzZWFyY2hJblByb2dyZXNzLnRva2VuLmlzQ2FuY2VsbGF0aW9uUmVxdWVzdGVkKSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblx0XHRcdHRoaXMuc2VhcmNoUmVzdWx0TW9kZWwuc2hvd0FpUmVzdWx0cyA9IGZhbHNlO1xuXG5cdFx0XHRpZiAobG9jYWxSZXN1bHRzICYmIGxvY2FsUmVzdWx0cy5maWx0ZXJNYXRjaGVzLmxlbmd0aCA+IDApIHtcblx0XHRcdFx0Ly8gVGhlIHJlbW90ZSByZXN1bHRzIG1pZ2h0IHRha2UgYSB3aGlsZSBhbmRcblx0XHRcdFx0Ly8gYXJlIGFsd2F5cyBhcHBlbmRlZCB0byB0aGUgZW5kIGFueXdheSwgc29cblx0XHRcdFx0Ly8gc2hvdyBzb21lIHJlc3VsdHMgbm93LlxuXHRcdFx0XHR0aGlzLm9uRGlkRmluaXNoU2VhcmNoKGV4cGFuZFJlc3VsdHMsIHVuZGVmaW5lZCk7XG5cdFx0XHR9XG5cblx0XHRcdGlmICghbG9jYWxSZXN1bHRzIHx8ICFsb2NhbFJlc3VsdHMuZXhhY3RNYXRjaCkge1xuXHRcdFx0XHRhd2FpdCB0aGlzLmRvUmVtb3RlU2VhcmNoKHF1ZXJ5LCBzZWFyY2hJblByb2dyZXNzLnRva2VuKTtcblx0XHRcdH1cblx0XHRcdGlmIChzZWFyY2hJblByb2dyZXNzLnRva2VuLmlzQ2FuY2VsbGF0aW9uUmVxdWVzdGVkKSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblxuXHRcdFx0aWYgKHRoaXMuYWlTZWFyY2hQcm9taXNlKSB7XG5cdFx0XHRcdHRoaXMuYWlTZWFyY2hQcm9taXNlLmNhbmNlbCgpO1xuXHRcdFx0fVxuXG5cdFx0XHQvLyBLaWNrIG9mZiBhbiBBSSBzZWFyY2ggaW4gdGhlIGJhY2tncm91bmQgaWYgdGhlIHRvZ2dsZSBpcyBzaG93bi5cblx0XHRcdC8vIFdlIHB1cnBvc2VseSBkbyBub3QgYXdhaXQgaXQuXG5cdFx0XHRpZiAodGhpcy5zZWFyY2hJbnB1dEFjdGlvbkJhciAmJiB0aGlzLnNob3dBaVJlc3VsdHNBY3Rpb24gJiYgdGhpcy5zZWFyY2hJbnB1dEFjdGlvbkJhci5oYXNBY3Rpb24odGhpcy5zaG93QWlSZXN1bHRzQWN0aW9uKSkge1xuXHRcdFx0XHR0aGlzLmFpU2VhcmNoUHJvbWlzZSA9IGNyZWF0ZUNhbmNlbGFibGVQcm9taXNlKHRva2VuID0+IHtcblx0XHRcdFx0XHRyZXR1cm4gdGhpcy5kb0FpU2VhcmNoKHF1ZXJ5LCB0b2tlbikudGhlbigocmVzdWx0cykgPT4ge1xuXHRcdFx0XHRcdFx0aWYgKHJlc3VsdHMgJiYgdGhpcy5zaG93QWlSZXN1bHRzQWN0aW9uKSB7XG5cdFx0XHRcdFx0XHRcdHRoaXMuc2hvd0FpUmVzdWx0c0FjdGlvbi5lbmFibGVkID0gdHJ1ZTtcblx0XHRcdFx0XHRcdFx0dGhpcy5haVJlc3VsdHNBdmFpbGFibGUuc2V0KHRydWUpO1xuXHRcdFx0XHRcdFx0XHR0aGlzLnNob3dBaVJlc3VsdHNBY3Rpb24ubGFiZWwgPSBTSE9XX0FJX1JFU1VMVFNfRU5BQkxFRF9MQUJFTDtcblx0XHRcdFx0XHRcdFx0dGhpcy5yZW5kZXJSZXN1bHRDb3VudE1lc3NhZ2VzKHRydWUpO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH0pLmNhdGNoKGUgPT4ge1xuXHRcdFx0XHRcdFx0aWYgKCFpc0NhbmNlbGxhdGlvbkVycm9yKGUpKSB7XG5cdFx0XHRcdFx0XHRcdHRoaXMubG9nU2VydmljZS50cmFjZSgnRXJyb3IgZHVyaW5nIEFJIHNldHRpbmdzIHNlYXJjaDonLCBlKTtcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHR9KTtcblx0XHRcdFx0fSk7XG5cdFx0XHR9XG5cblx0XHRcdHRoaXMub25EaWRGaW5pc2hTZWFyY2goZXhwYW5kUmVzdWx0cywgcHJvZ3Jlc3NSdW5uZXIpO1xuXHRcdH0pO1xuXHR9XG5cblx0cHJpdmF0ZSBvbkRpZEZpbmlzaFNlYXJjaChleHBhbmRSZXN1bHRzOiBib29sZWFuLCBwcm9ncmVzc1J1bm5lcjogSVByb2dyZXNzUnVubmVyIHwgdW5kZWZpbmVkKTogdm9pZCB7XG5cdFx0dGhpcy50b2NUcmVlTW9kZWwuY3VycmVudFNlYXJjaE1vZGVsID0gdGhpcy5zZWFyY2hSZXN1bHRNb2RlbDtcblx0XHR0aGlzLnJlbmRlcmVkU2VhcmNoUXVlcnkgPSB0aGlzLnZpZXdTdGF0ZS5xdWVyeTtcblx0XHRpZiAoZXhwYW5kUmVzdWx0cykge1xuXHRcdFx0dGhpcy50b2NUcmVlLnNldEZvY3VzKFtdKTtcblx0XHRcdHRoaXMudmlld1N0YXRlLmNhdGVnb3J5RmlsdGVyID0gdW5kZWZpbmVkO1xuXHRcdFx0dGhpcy50b2NUcmVlLmV4cGFuZEFsbCgpO1xuXHRcdFx0dGhpcy5zZXR0aW5nc1RyZWUuc2Nyb2xsVG9wID0gMDtcblx0XHR9XG5cdFx0dGhpcy5yZWZyZXNoVE9DVHJlZSgpO1xuXHRcdHRoaXMucmVuZGVyVHJlZSh1bmRlZmluZWQsIHRydWUpO1xuXHRcdHByb2dyZXNzUnVubmVyPy5kb25lKCk7XG5cdH1cblxuXHRwcml2YXRlIGRvTG9jYWxTZWFyY2gocXVlcnk6IHN0cmluZywgdG9rZW46IENhbmNlbGxhdGlvblRva2VuKTogUHJvbWlzZTxJU2VhcmNoUmVzdWx0IHwgbnVsbD4ge1xuXHRcdGNvbnN0IGxvY2FsU2VhcmNoUHJvdmlkZXIgPSB0aGlzLnByZWZlcmVuY2VzU2VhcmNoU2VydmljZS5nZXRMb2NhbFNlYXJjaFByb3ZpZGVyKHF1ZXJ5KTtcblx0XHRyZXR1cm4gdGhpcy5zZWFyY2hXaXRoUHJvdmlkZXIoU2VhcmNoUmVzdWx0SWR4LkxvY2FsLCBsb2NhbFNlYXJjaFByb3ZpZGVyLCBTVFJJTkdfTUFUQ0hfU0VBUkNIX1BST1ZJREVSX05BTUUsIHRva2VuKTtcblx0fVxuXG5cdHByaXZhdGUgZG9SZW1vdGVTZWFyY2gocXVlcnk6IHN0cmluZywgdG9rZW46IENhbmNlbGxhdGlvblRva2VuKTogUHJvbWlzZTxJU2VhcmNoUmVzdWx0IHwgbnVsbD4ge1xuXHRcdGNvbnN0IHJlbW90ZVNlYXJjaFByb3ZpZGVyID0gdGhpcy5wcmVmZXJlbmNlc1NlYXJjaFNlcnZpY2UuZ2V0UmVtb3RlU2VhcmNoUHJvdmlkZXIocXVlcnkpO1xuXHRcdGlmICghcmVtb3RlU2VhcmNoUHJvdmlkZXIpIHtcblx0XHRcdHJldHVybiBQcm9taXNlLnJlc29sdmUobnVsbCk7XG5cdFx0fVxuXHRcdHJldHVybiB0aGlzLnNlYXJjaFdpdGhQcm92aWRlcihTZWFyY2hSZXN1bHRJZHguUmVtb3RlLCByZW1vdGVTZWFyY2hQcm92aWRlciwgVEZfSURGX1NFQVJDSF9QUk9WSURFUl9OQU1FLCB0b2tlbik7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIGRvQWlTZWFyY2gocXVlcnk6IHN0cmluZywgdG9rZW46IENhbmNlbGxhdGlvblRva2VuKTogUHJvbWlzZTxJU2VhcmNoUmVzdWx0IHwgbnVsbD4ge1xuXHRcdGNvbnN0IGFpU2VhcmNoUHJvdmlkZXIgPSB0aGlzLnByZWZlcmVuY2VzU2VhcmNoU2VydmljZS5nZXRBaVNlYXJjaFByb3ZpZGVyKHF1ZXJ5KTtcblx0XHRpZiAoIWFpU2VhcmNoUHJvdmlkZXIpIHtcblx0XHRcdHJldHVybiBudWxsO1xuXHRcdH1cblxuXHRcdGNvbnN0IGVtYmVkZGluZ3NSZXN1bHRzID0gYXdhaXQgdGhpcy5zZWFyY2hXaXRoUHJvdmlkZXIoU2VhcmNoUmVzdWx0SWR4LkVtYmVkZGluZ3MsIGFpU2VhcmNoUHJvdmlkZXIsIEVNQkVERElOR1NfU0VBUkNIX1BST1ZJREVSX05BTUUsIHRva2VuKTtcblx0XHRpZiAoIWVtYmVkZGluZ3NSZXN1bHRzIHx8IHRva2VuLmlzQ2FuY2VsbGF0aW9uUmVxdWVzdGVkKSB7XG5cdFx0XHRyZXR1cm4gbnVsbDtcblx0XHR9XG5cblx0XHRjb25zdCBsbG1SZXN1bHRzID0gYXdhaXQgdGhpcy5nZXRMTE1SYW5rZWRSZXN1bHRzKHF1ZXJ5LCB0b2tlbik7XG5cdFx0aWYgKHRva2VuLmlzQ2FuY2VsbGF0aW9uUmVxdWVzdGVkKSB7XG5cdFx0XHRyZXR1cm4gbnVsbDtcblx0XHR9XG5cblx0XHRyZXR1cm4ge1xuXHRcdFx0ZmlsdGVyTWF0Y2hlczogZW1iZWRkaW5nc1Jlc3VsdHMuZmlsdGVyTWF0Y2hlcy5jb25jYXQobGxtUmVzdWx0cz8uZmlsdGVyTWF0Y2hlcyA/PyBbXSksXG5cdFx0XHRleGFjdE1hdGNoOiBmYWxzZVxuXHRcdH07XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIGdldExMTVJhbmtlZFJlc3VsdHMocXVlcnk6IHN0cmluZywgdG9rZW46IENhbmNlbGxhdGlvblRva2VuKTogUHJvbWlzZTxJU2VhcmNoUmVzdWx0IHwgbnVsbD4ge1xuXHRcdGNvbnN0IGFpU2VhcmNoUHJvdmlkZXIgPSB0aGlzLnByZWZlcmVuY2VzU2VhcmNoU2VydmljZS5nZXRBaVNlYXJjaFByb3ZpZGVyKHF1ZXJ5KTtcblx0XHRpZiAoIWFpU2VhcmNoUHJvdmlkZXIpIHtcblx0XHRcdHJldHVybiBudWxsO1xuXHRcdH1cblxuXHRcdGNvbnN0IHN0b3BXYXRjaCA9IG5ldyBTdG9wV2F0Y2goZmFsc2UpO1xuXHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IGFpU2VhcmNoUHJvdmlkZXIuZ2V0TExNUmFua2VkUmVzdWx0cyh0b2tlbik7XG5cdFx0c3RvcFdhdGNoLnN0b3AoKTtcblxuXHRcdGlmICh0b2tlbi5pc0NhbmNlbGxhdGlvblJlcXVlc3RlZCkge1xuXHRcdFx0cmV0dXJuIG51bGw7XG5cdFx0fVxuXG5cdFx0Ly8gT25seSBsb2cgdGhlIGVsYXBzZWQgdGltZSBpZiB0aGVyZSBhcmUgYWN0dWFsIHJlc3VsdHMuXG5cdFx0aWYgKHJlc3VsdCAmJiByZXN1bHQuZmlsdGVyTWF0Y2hlcy5sZW5ndGggPiAwKSB7XG5cdFx0XHRjb25zdCBlbGFwc2VkID0gc3RvcFdhdGNoLmVsYXBzZWQoKTtcblx0XHRcdHRoaXMubG9nU2VhcmNoUGVyZm9ybWFuY2UoTExNX1JBTktFRF9TRUFSQ0hfUFJPVklERVJfTkFNRSwgZWxhcHNlZCk7XG5cdFx0fVxuXG5cdFx0dGhpcy5zZWFyY2hSZXN1bHRNb2RlbCEuc2V0UmVzdWx0KFNlYXJjaFJlc3VsdElkeC5BaVNlbGVjdGVkLCByZXN1bHQpO1xuXHRcdHJldHVybiByZXN1bHQ7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIHNlYXJjaFdpdGhQcm92aWRlcih0eXBlOiBTZWFyY2hSZXN1bHRJZHgsIHNlYXJjaFByb3ZpZGVyOiBJU2VhcmNoUHJvdmlkZXIsIHByb3ZpZGVyTmFtZTogc3RyaW5nLCB0b2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4pOiBQcm9taXNlPElTZWFyY2hSZXN1bHQgfCBudWxsPiB7XG5cdFx0Y29uc3Qgc3RvcFdhdGNoID0gbmV3IFN0b3BXYXRjaChmYWxzZSk7XG5cdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgdGhpcy5fc2VhcmNoUHJlZmVyZW5jZXNNb2RlbCh0aGlzLmRlZmF1bHRTZXR0aW5nc0VkaXRvck1vZGVsLCBzZWFyY2hQcm92aWRlciwgdG9rZW4pO1xuXHRcdHN0b3BXYXRjaC5zdG9wKCk7XG5cblx0XHRpZiAodG9rZW4uaXNDYW5jZWxsYXRpb25SZXF1ZXN0ZWQpIHtcblx0XHRcdC8vIEhhbmRsZSBjYW5jZWxsYXRpb24gbGlrZSB0aGlzIGJlY2F1c2UgY2FuY2VsbGF0aW9uIGlzIGxvc3QgaW5zaWRlIHRoZSBzZWFyY2ggcHJvdmlkZXIgZHVlIHRvIGFzeW5jL2F3YWl0XG5cdFx0XHRyZXR1cm4gbnVsbDtcblx0XHR9XG5cblx0XHQvLyBGaWx0ZXIgb3V0IGFkdmFuY2VkIHNldHRpbmdzIHVubGVzcyB0aGUgYWR2YW5jZWQgdGFnIGlzIGV4cGxpY2l0bHkgc2V0IG9yIHNldHRpbmcgbWF0Y2hlcyBhbiBJRCBmaWx0ZXJcblx0XHRpZiAocmVzdWx0ICYmICF0aGlzLmNhblNob3dBZHZhbmNlZFNldHRpbmdzKCkpIHtcblx0XHRcdHJlc3VsdC5maWx0ZXJNYXRjaGVzID0gcmVzdWx0LmZpbHRlck1hdGNoZXMuZmlsdGVyKG1hdGNoID0+IHRoaXMuc2hvdWxkU2hvd1NldHRpbmcobWF0Y2guc2V0dGluZykpO1xuXHRcdH1cblxuXHRcdC8vIE9ubHkgbG9nIHRoZSBlbGFwc2VkIHRpbWUgaWYgdGhlcmUgYXJlIGFjdHVhbCByZXN1bHRzLlxuXHRcdGlmIChyZXN1bHQgJiYgcmVzdWx0LmZpbHRlck1hdGNoZXMubGVuZ3RoID4gMCkge1xuXHRcdFx0Y29uc3QgZWxhcHNlZCA9IHN0b3BXYXRjaC5lbGFwc2VkKCk7XG5cdFx0XHR0aGlzLmxvZ1NlYXJjaFBlcmZvcm1hbmNlKHByb3ZpZGVyTmFtZSwgZWxhcHNlZCk7XG5cdFx0fVxuXG5cdFx0dGhpcy5zZWFyY2hSZXN1bHRNb2RlbCA/Pz0gdGhpcy5pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShTZWFyY2hSZXN1bHRNb2RlbCwgdGhpcy52aWV3U3RhdGUsIHRoaXMuc2V0dGluZ3NPcmRlckJ5VG9jSW5kZXgsIHRoaXMud29ya3NwYWNlVHJ1c3RNYW5hZ2VtZW50U2VydmljZS5pc1dvcmtzcGFjZVRydXN0ZWQoKSk7XG5cdFx0dGhpcy5zZWFyY2hSZXN1bHRNb2RlbC5zZXRSZXN1bHQodHlwZSwgcmVzdWx0KTtcblx0XHRyZXR1cm4gcmVzdWx0O1xuXHR9XG5cblx0cHJpdmF0ZSBsb2dTZWFyY2hQZXJmb3JtYW5jZShwcm92aWRlck5hbWU6IHN0cmluZywgZWxhcHNlZDogbnVtYmVyKTogdm9pZCB7XG5cdFx0dHlwZSBTZXR0aW5nc0VkaXRvclNlYXJjaFBlcmZvcm1hbmNlRXZlbnQgPSB7XG5cdFx0XHRwcm92aWRlck5hbWU6IHN0cmluZyB8IHVuZGVmaW5lZDtcblx0XHRcdGVsYXBzZWRNczogbnVtYmVyO1xuXHRcdH07XG5cdFx0dHlwZSBTZXR0aW5nc0VkaXRvclNlYXJjaFBlcmZvcm1hbmNlQ2xhc3NpZmljYXRpb24gPSB7XG5cdFx0XHRwcm92aWRlck5hbWU6IHsgY2xhc3NpZmljYXRpb246ICdTeXN0ZW1NZXRhRGF0YSc7IHB1cnBvc2U6ICdGZWF0dXJlSW5zaWdodCc7IGNvbW1lbnQ6ICdUaGUgbmFtZSBvZiB0aGUgc2VhcmNoIHByb3ZpZGVyLCBpZiBhcHBsaWNhYmxlLicgfTtcblx0XHRcdGVsYXBzZWRNczogeyBjbGFzc2lmaWNhdGlvbjogJ1N5c3RlbU1ldGFEYXRhJzsgcHVycG9zZTogJ0ZlYXR1cmVJbnNpZ2h0JzsgY29tbWVudDogJ1RoZSB0aW1lIHRha2VuIHRvIHBlcmZvcm0gdGhlIHNlYXJjaCwgaW4gbWlsbGlzZWNvbmRzLicgfTtcblx0XHRcdG93bmVyOiAncnpoYW8yNzEnO1xuXHRcdFx0Y29tbWVudDogJ0V2ZW50IGVtaXR0ZWQgd2hlbiB0aGUgU2V0dGluZ3MgZWRpdG9yIGNhbGxzIGEgc2VhcmNoIHByb3ZpZGVyIHRvIHNlYXJjaCBmb3IgYSBzZXR0aW5nJztcblx0XHR9O1xuXHRcdHRoaXMudGVsZW1ldHJ5U2VydmljZS5wdWJsaWNMb2cyPFNldHRpbmdzRWRpdG9yU2VhcmNoUGVyZm9ybWFuY2VFdmVudCwgU2V0dGluZ3NFZGl0b3JTZWFyY2hQZXJmb3JtYW5jZUNsYXNzaWZpY2F0aW9uPignc2V0dGluZ3NFZGl0b3Iuc2VhcmNoUGVyZm9ybWFuY2UnLCB7XG5cdFx0XHRwcm92aWRlck5hbWUsXG5cdFx0XHRlbGFwc2VkTXM6IGVsYXBzZWQsXG5cdFx0fSk7XG5cdH1cblxuXHRwcml2YXRlIHJlbmRlclJlc3VsdENvdW50TWVzc2FnZXMoc2hvd0FpUmVzdWx0c01lc3NhZ2U6IGJvb2xlYW4pIHtcblx0XHRpZiAoIXRoaXMuY3VycmVudFNldHRpbmdzTW9kZWwpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHR0aGlzLmNsZWFyRmlsdGVyTGlua0NvbnRhaW5lci5zdHlsZS5kaXNwbGF5ID0gdGhpcy52aWV3U3RhdGUudGFnRmlsdGVycyAmJiB0aGlzLnZpZXdTdGF0ZS50YWdGaWx0ZXJzLnNpemUgPiAwXG5cdFx0XHQ/ICdpbml0aWFsJ1xuXHRcdFx0OiAnbm9uZSc7XG5cblx0XHRpZiAoIXRoaXMuc2VhcmNoUmVzdWx0TW9kZWwpIHtcblx0XHRcdGlmICh0aGlzLmNvdW50RWxlbWVudC5zdHlsZS5kaXNwbGF5ICE9PSAnbm9uZScpIHtcblx0XHRcdFx0dGhpcy5zZWFyY2hSZXN1bHRMYWJlbCA9IG51bGw7XG5cdFx0XHRcdHRoaXMudXBkYXRlSW5wdXRBcmlhTGFiZWwoKTtcblx0XHRcdFx0dGhpcy5jb3VudEVsZW1lbnQuc3R5bGUuZGlzcGxheSA9ICdub25lJztcblx0XHRcdFx0dGhpcy5jb3VudEVsZW1lbnQuaW5uZXJUZXh0ID0gJyc7XG5cdFx0XHRcdHRoaXMubGF5b3V0KHRoaXMuZGltZW5zaW9uKTtcblx0XHRcdH1cblxuXHRcdFx0dGhpcy5yb290RWxlbWVudC5jbGFzc0xpc3QucmVtb3ZlKCduby1yZXN1bHRzJyk7XG5cdFx0XHR0aGlzLnNwbGl0Vmlldy5lbC5zdHlsZS52aXNpYmlsaXR5ID0gJ3Zpc2libGUnO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRjb25zdCBjb3VudCA9IHRoaXMuc2VhcmNoUmVzdWx0TW9kZWwuZ2V0VW5pcXVlUmVzdWx0c0NvdW50KCk7XG5cdFx0XHRsZXQgcmVzdWx0U3RyaW5nOiBzdHJpbmc7XG5cblx0XHRcdGlmIChzaG93QWlSZXN1bHRzTWVzc2FnZSkge1xuXHRcdFx0XHRzd2l0Y2ggKGNvdW50KSB7XG5cdFx0XHRcdFx0Y2FzZSAwOiByZXN1bHRTdHJpbmcgPSBsb2NhbGl6ZSgnbm9SZXN1bHRzV2l0aEFpQXZhaWxhYmxlJywgXCJObyBTZXR0aW5ncyBGb3VuZC4gQUkgUmVzdWx0cyBBdmFpbGFibGVcIik7IGJyZWFrO1xuXHRcdFx0XHRcdGNhc2UgMTogcmVzdWx0U3RyaW5nID0gbG9jYWxpemUoJ29uZVJlc3VsdFdpdGhBaUF2YWlsYWJsZScsIFwiMSBTZXR0aW5nIEZvdW5kLiBBSSBSZXN1bHRzIEF2YWlsYWJsZVwiKTsgYnJlYWs7XG5cdFx0XHRcdFx0ZGVmYXVsdDogcmVzdWx0U3RyaW5nID0gbG9jYWxpemUoJ21vcmVUaGFuT25lUmVzdWx0V2l0aEFpQXZhaWxhYmxlJywgXCJ7MH0gU2V0dGluZ3MgRm91bmQuIEFJIFJlc3VsdHMgQXZhaWxhYmxlXCIsIGNvdW50KTtcblx0XHRcdFx0fVxuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0c3dpdGNoIChjb3VudCkge1xuXHRcdFx0XHRcdGNhc2UgMDogcmVzdWx0U3RyaW5nID0gbG9jYWxpemUoJ25vUmVzdWx0cycsIFwiTm8gU2V0dGluZ3MgRm91bmRcIik7IGJyZWFrO1xuXHRcdFx0XHRcdGNhc2UgMTogcmVzdWx0U3RyaW5nID0gbG9jYWxpemUoJ29uZVJlc3VsdCcsIFwiMSBTZXR0aW5nIEZvdW5kXCIpOyBicmVhaztcblx0XHRcdFx0XHRkZWZhdWx0OiByZXN1bHRTdHJpbmcgPSBsb2NhbGl6ZSgnbW9yZVRoYW5PbmVSZXN1bHQnLCBcInswfSBTZXR0aW5ncyBGb3VuZFwiLCBjb3VudCk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblxuXHRcdFx0dGhpcy5zZWFyY2hSZXN1bHRMYWJlbCA9IHJlc3VsdFN0cmluZztcblx0XHRcdHRoaXMudXBkYXRlSW5wdXRBcmlhTGFiZWwoKTtcblx0XHRcdHRoaXMuY291bnRFbGVtZW50LmlubmVyVGV4dCA9IHJlc3VsdFN0cmluZztcblx0XHRcdGFyaWEuc3RhdHVzKHJlc3VsdFN0cmluZyk7XG5cblx0XHRcdGlmICh0aGlzLmNvdW50RWxlbWVudC5zdHlsZS5kaXNwbGF5ICE9PSAnYmxvY2snKSB7XG5cdFx0XHRcdHRoaXMuY291bnRFbGVtZW50LnN0eWxlLmRpc3BsYXkgPSAnYmxvY2snO1xuXHRcdFx0fVxuXHRcdFx0dGhpcy5sYXlvdXQodGhpcy5kaW1lbnNpb24pO1xuXHRcdFx0dGhpcy5yb290RWxlbWVudC5jbGFzc0xpc3QudG9nZ2xlKCduby1yZXN1bHRzJywgY291bnQgPT09IDApO1xuXHRcdFx0dGhpcy5zcGxpdFZpZXcuZWwuc3R5bGUudmlzaWJpbGl0eSA9IGNvdW50ID09PSAwID8gJ2hpZGRlbicgOiAndmlzaWJsZSc7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBfc2VhcmNoUHJlZmVyZW5jZXNNb2RlbChtb2RlbDogSVNldHRpbmdzRWRpdG9yTW9kZWwsIHByb3ZpZGVyOiBJU2VhcmNoUHJvdmlkZXIsIHRva2VuOiBDYW5jZWxsYXRpb25Ub2tlbik6IFByb21pc2U8SVNlYXJjaFJlc3VsdCB8IG51bGw+IHtcblx0XHR0cnkge1xuXHRcdFx0cmV0dXJuIGF3YWl0IHByb3ZpZGVyLnNlYXJjaE1vZGVsKG1vZGVsLCB0b2tlbik7XG5cdFx0fSBjYXRjaCAoZXJyKSB7XG5cdFx0XHRpZiAoaXNDYW5jZWxsYXRpb25FcnJvcihlcnIpKSB7XG5cdFx0XHRcdHJldHVybiBQcm9taXNlLnJlamVjdChlcnIpO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0cmV0dXJuIG51bGw7XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBsYXlvdXRTcGxpdFZpZXcoZGltZW5zaW9uOiBET00uRGltZW5zaW9uKTogdm9pZCB7XG5cdFx0aWYgKCF0aGlzLmlzVmlzaWJsZSgpKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGNvbnN0IGxpc3RIZWlnaHQgPSBkaW1lbnNpb24uaGVpZ2h0IC0gKDcyICsgMTEgKyAxNCAvKiBoZWFkZXIgaGVpZ2h0ICsgZWRpdG9yIHBhZGRpbmcgKi8pO1xuXG5cdFx0dGhpcy5zcGxpdFZpZXcuZWwuc3R5bGUuaGVpZ2h0ID0gYCR7bGlzdEhlaWdodH1weGA7XG5cblx0XHQvLyBXZSBjYWxsIGxheW91dCBmaXJzdCBzbyB0aGUgc3BsaXRWaWV3IGhhcyBhbiBpZGVhIG9mIGhvdyBtdWNoXG5cdFx0Ly8gc3BhY2UgaXQgaGFzLCBvdGhlcndpc2Ugc2V0Vmlld1Zpc2libGUgcmVzdWx0cyBpbiB0aGUgZmlyc3QgcGFuZWxcblx0XHQvLyBzaG93aW5nIHVwIGF0IHRoZSBtaW5pbXVtIHNpemUgd2hlbmV2ZXIgdGhlIFNldHRpbmdzIGVkaXRvclxuXHRcdC8vIG9wZW5zIGZvciB0aGUgZmlyc3QgdGltZS5cblx0XHR0aGlzLnNwbGl0Vmlldy5sYXlvdXQodGhpcy5ib2R5Q29udGFpbmVyLmNsaWVudFdpZHRoLCBsaXN0SGVpZ2h0KTtcblxuXHRcdGNvbnN0IHRvY0JlaGF2aW9yID0gdGhpcy5jb25maWd1cmF0aW9uU2VydmljZS5nZXRWYWx1ZTwnZmlsdGVyJyB8ICdoaWRlJz4oU0VBUkNIX1RPQ19CRUhBVklPUl9LRVkpO1xuXHRcdGNvbnN0IGhpZGVUb2NGb3JTZWFyY2ggPSB0b2NCZWhhdmlvciA9PT0gJ2hpZGUnICYmIHRoaXMuc2VhcmNoUmVzdWx0TW9kZWw7XG5cdFx0aWYgKCFoaWRlVG9jRm9yU2VhcmNoKSB7XG5cdFx0XHRjb25zdCBmaXJzdFZpZXdXYXNWaXNpYmxlID0gdGhpcy5zcGxpdFZpZXcuaXNWaWV3VmlzaWJsZSgwKTtcblx0XHRcdGNvbnN0IGZpcnN0Vmlld1Zpc2libGUgPSB0aGlzLmJvZHlDb250YWluZXIuY2xpZW50V2lkdGggPj0gU2V0dGluZ3NFZGl0b3IyLk5BUlJPV19UT1RBTF9XSURUSDtcblxuXHRcdFx0dGhpcy5zcGxpdFZpZXcuc2V0Vmlld1Zpc2libGUoMCwgZmlyc3RWaWV3VmlzaWJsZSk7XG5cdFx0XHQvLyBJZiB0aGUgZmlyc3QgdmlldyBpcyBhZ2FpbiB2aXNpYmxlLCBhbmQgd2UgaGF2ZSBlbm91Z2ggc3BhY2UsIGltbWVkaWF0ZWx5IHNldCB0aGVcblx0XHRcdC8vIGVkaXRvciB0byB1c2UgdGhlIHJlc2V0IHdpZHRoIHJhdGhlciB0aGFuIHRoZSBjYWNoZWQgbWluIHdpZHRoXG5cdFx0XHRpZiAoIWZpcnN0Vmlld1dhc1Zpc2libGUgJiYgZmlyc3RWaWV3VmlzaWJsZSAmJiB0aGlzLmJvZHlDb250YWluZXIuY2xpZW50V2lkdGggPj0gU2V0dGluZ3NFZGl0b3IyLkVESVRPUl9NSU5fV0lEVEggKyBTZXR0aW5nc0VkaXRvcjIuVE9DX1JFU0VUX1dJRFRIKSB7XG5cdFx0XHRcdHRoaXMuc3BsaXRWaWV3LnJlc2l6ZVZpZXcoMCwgU2V0dGluZ3NFZGl0b3IyLlRPQ19SRVNFVF9XSURUSCk7XG5cdFx0XHR9XG5cdFx0XHR0aGlzLnNwbGl0Vmlldy5zdHlsZSh7XG5cdFx0XHRcdHNlcGFyYXRvckJvcmRlcjogZmlyc3RWaWV3VmlzaWJsZSA/IHRoaXMudGhlbWUuZ2V0Q29sb3Ioc2V0dGluZ3NTYXNoQm9yZGVyKSEgOiBDb2xvci50cmFuc3BhcmVudFxuXHRcdFx0fSk7XG5cdFx0fVxuXHR9XG5cblx0cHJvdGVjdGVkIG92ZXJyaWRlIHNhdmVTdGF0ZSgpOiB2b2lkIHtcblx0XHR0aGlzLnNhdmVTZWFyY2hIaXN0b3J5KCk7XG5cdFx0aWYgKHRoaXMuaXNWaXNpYmxlKCkpIHtcblx0XHRcdGNvbnN0IHNlYXJjaFF1ZXJ5ID0gdGhpcy5zZWFyY2hXaWRnZXQuZ2V0VmFsdWUoKS50cmltKCk7XG5cdFx0XHRjb25zdCB0YXJnZXQgPSB0aGlzLnNldHRpbmdzVGFyZ2V0c1dpZGdldC5zZXR0aW5nc1RhcmdldCBhcyBTZXR0aW5nc1RhcmdldDtcblx0XHRcdGlmICh0aGlzLmlucHV0KSB7XG5cdFx0XHRcdHRoaXMuZWRpdG9yTWVtZW50by5zYXZlRWRpdG9yU3RhdGUodGhpcy5ncm91cCwgdGhpcy5pbnB1dCwgeyBzZWFyY2hRdWVyeSwgdGFyZ2V0IH0pO1xuXHRcdFx0fVxuXHRcdH0gZWxzZSBpZiAodGhpcy5pbnB1dCkge1xuXHRcdFx0dGhpcy5lZGl0b3JNZW1lbnRvLmNsZWFyRWRpdG9yU3RhdGUodGhpcy5pbnB1dCwgdGhpcy5ncm91cCk7XG5cdFx0fVxuXG5cdFx0c3VwZXIuc2F2ZVN0YXRlKCk7XG5cdH1cbn1cblxuY2xhc3MgU3luY0NvbnRyb2xzIGV4dGVuZHMgRGlzcG9zYWJsZSB7XG5cdHByaXZhdGUgcmVhZG9ubHkgbGFzdFN5bmNlZExhYmVsITogSFRNTEVsZW1lbnQ7XG5cdHByaXZhdGUgcmVhZG9ubHkgdHVybk9uU3luY0J1dHRvbiE6IEJ1dHRvbjtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkRpZENoYW5nZUxhc3RTeW5jZWRMYWJlbCA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPHN0cmluZz4oKSk7XG5cdHB1YmxpYyByZWFkb25seSBvbkRpZENoYW5nZUxhc3RTeW5jZWRMYWJlbCA9IHRoaXMuX29uRGlkQ2hhbmdlTGFzdFN5bmNlZExhYmVsLmV2ZW50O1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdHdpbmRvdzogQ29kZVdpbmRvdyxcblx0XHRjb250YWluZXI6IEhUTUxFbGVtZW50LFxuXHRcdEBJQ29tbWFuZFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBjb21tYW5kU2VydmljZTogSUNvbW1hbmRTZXJ2aWNlLFxuXHRcdEBJVXNlckRhdGFTeW5jU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IHVzZXJEYXRhU3luY1NlcnZpY2U6IElVc2VyRGF0YVN5bmNTZXJ2aWNlLFxuXHRcdEBJVXNlckRhdGFTeW5jRW5hYmxlbWVudFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSB1c2VyRGF0YVN5bmNFbmFibGVtZW50U2VydmljZTogSVVzZXJEYXRhU3luY0VuYWJsZW1lbnRTZXJ2aWNlLFxuXHRcdEBJVGVsZW1ldHJ5U2VydmljZSB0ZWxlbWV0cnlTZXJ2aWNlOiBJVGVsZW1ldHJ5U2VydmljZSxcblx0KSB7XG5cdFx0c3VwZXIoKTtcblxuXHRcdGNvbnN0IGhlYWRlclJpZ2h0Q29udHJvbHNDb250YWluZXIgPSBET00uYXBwZW5kKGNvbnRhaW5lciwgJCgnLnNldHRpbmdzLXJpZ2h0LWNvbnRyb2xzJykpO1xuXHRcdGNvbnN0IHR1cm5PblN5bmNCdXR0b25Db250YWluZXIgPSBET00uYXBwZW5kKGhlYWRlclJpZ2h0Q29udHJvbHNDb250YWluZXIsICQoJy50dXJuLW9uLXN5bmMnKSk7XG5cdFx0dGhpcy50dXJuT25TeW5jQnV0dG9uID0gdGhpcy5fcmVnaXN0ZXIobmV3IEJ1dHRvbih0dXJuT25TeW5jQnV0dG9uQ29udGFpbmVyLCB7IHRpdGxlOiB0cnVlLCAuLi5kZWZhdWx0QnV0dG9uU3R5bGVzIH0pKTtcblx0XHR0aGlzLmxhc3RTeW5jZWRMYWJlbCA9IERPTS5hcHBlbmQoaGVhZGVyUmlnaHRDb250cm9sc0NvbnRhaW5lciwgJCgnLmxhc3Qtc3luY2VkLWxhYmVsJykpO1xuXHRcdERPTS5oaWRlKHRoaXMubGFzdFN5bmNlZExhYmVsKTtcblxuXHRcdHRoaXMudHVybk9uU3luY0J1dHRvbi5lbmFibGVkID0gdHJ1ZTtcblx0XHR0aGlzLnR1cm5PblN5bmNCdXR0b24ubGFiZWwgPSBsb2NhbGl6ZSgndHVybk9uU3luY0J1dHRvbicsIFwiQmFja3VwIGFuZCBTeW5jIFNldHRpbmdzXCIpO1xuXHRcdERPTS5oaWRlKHRoaXMudHVybk9uU3luY0J1dHRvbi5lbGVtZW50KTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMudHVybk9uU3luY0J1dHRvbi5vbkRpZENsaWNrKGFzeW5jICgpID0+IHtcblx0XHRcdGF3YWl0IHRoaXMuY29tbWFuZFNlcnZpY2UuZXhlY3V0ZUNvbW1hbmQoJ3dvcmtiZW5jaC51c2VyRGF0YVN5bmMuYWN0aW9ucy50dXJuT24nKTtcblx0XHR9KSk7XG5cblx0XHR0aGlzLnVwZGF0ZUxhc3RTeW5jZWRUaW1lKCk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy51c2VyRGF0YVN5bmNTZXJ2aWNlLm9uRGlkQ2hhbmdlTGFzdFN5bmNUaW1lKCgpID0+IHtcblx0XHRcdHRoaXMudXBkYXRlTGFzdFN5bmNlZFRpbWUoKTtcblx0XHR9KSk7XG5cblx0XHRjb25zdCB1cGRhdGVMYXN0U3luY2VkVGltZXIgPSB0aGlzLl9yZWdpc3RlcihuZXcgRE9NLldpbmRvd0ludGVydmFsVGltZXIoKSk7XG5cdFx0dXBkYXRlTGFzdFN5bmNlZFRpbWVyLmNhbmNlbEFuZFNldCgoKSA9PiB0aGlzLnVwZGF0ZUxhc3RTeW5jZWRUaW1lKCksIDYwICogMTAwMCwgd2luZG93KTtcblxuXHRcdHRoaXMudXBkYXRlKCk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy51c2VyRGF0YVN5bmNTZXJ2aWNlLm9uRGlkQ2hhbmdlU3RhdHVzKCgpID0+IHtcblx0XHRcdHRoaXMudXBkYXRlKCk7XG5cdFx0fSkpO1xuXG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy51c2VyRGF0YVN5bmNFbmFibGVtZW50U2VydmljZS5vbkRpZENoYW5nZUVuYWJsZW1lbnQoKCkgPT4ge1xuXHRcdFx0dGhpcy51cGRhdGUoKTtcblx0XHR9KSk7XG5cdH1cblxuXHRwcml2YXRlIHVwZGF0ZUxhc3RTeW5jZWRUaW1lKCk6IHZvaWQge1xuXHRcdGNvbnN0IGxhc3QgPSB0aGlzLnVzZXJEYXRhU3luY1NlcnZpY2UubGFzdFN5bmNUaW1lO1xuXHRcdGxldCBsYWJlbDogc3RyaW5nO1xuXHRcdGlmICh0eXBlb2YgbGFzdCA9PT0gJ251bWJlcicpIHtcblx0XHRcdGNvbnN0IGQgPSBmcm9tTm93KGxhc3QsIHRydWUsIHVuZGVmaW5lZCwgdHJ1ZSk7XG5cdFx0XHRsYWJlbCA9IGxvY2FsaXplKCdsYXN0U3luY2VkTGFiZWwnLCBcIkxhc3Qgc3luY2VkOiB7MH1cIiwgZCk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdGxhYmVsID0gJyc7XG5cdFx0fVxuXG5cdFx0dGhpcy5sYXN0U3luY2VkTGFiZWwudGV4dENvbnRlbnQgPSBsYWJlbDtcblx0XHR0aGlzLl9vbkRpZENoYW5nZUxhc3RTeW5jZWRMYWJlbC5maXJlKGxhYmVsKTtcblx0fVxuXG5cdHByaXZhdGUgdXBkYXRlKCk6IHZvaWQge1xuXHRcdGlmICh0aGlzLnVzZXJEYXRhU3luY1NlcnZpY2Uuc3RhdHVzID09PSBTeW5jU3RhdHVzLlVuaW5pdGlhbGl6ZWQpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRpZiAodGhpcy51c2VyRGF0YVN5bmNFbmFibGVtZW50U2VydmljZS5pc0VuYWJsZWQoKSB8fCB0aGlzLnVzZXJEYXRhU3luY1NlcnZpY2Uuc3RhdHVzICE9PSBTeW5jU3RhdHVzLklkbGUpIHtcblx0XHRcdERPTS5zaG93KHRoaXMubGFzdFN5bmNlZExhYmVsKTtcblx0XHRcdERPTS5oaWRlKHRoaXMudHVybk9uU3luY0J1dHRvbi5lbGVtZW50KTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0RE9NLmhpZGUodGhpcy5sYXN0U3luY2VkTGFiZWwpO1xuXHRcdFx0RE9NLnNob3codGhpcy50dXJuT25TeW5jQnV0dG9uLmVsZW1lbnQpO1xuXHRcdH1cblx0fVxufVxuXG5pbnRlcmZhY2UgSVNldHRpbmdzRWRpdG9yMlN0YXRlIHtcblx0c2VhcmNoUXVlcnk6IHN0cmluZztcblx0dGFyZ2V0OiBTZXR0aW5nc1RhcmdldDtcbn1cbiJdLAogICJtYXBwaW5ncyI6ICI7Ozs7Ozs7Ozs7O0FBS0EsWUFBWSxTQUFTO0FBQ3JCLFNBQVMsNkJBQTZCO0FBQ3RDLFNBQVMsaUJBQWlCO0FBQzFCLFlBQVksVUFBVTtBQUN0QixTQUFTLGNBQWM7QUFDdkIsU0FBUyxhQUFhLFFBQVEsaUJBQWlCO0FBQy9DLFNBQVMsNEJBQTRCO0FBR3JDLFNBQVMsY0FBYztBQUN2QixTQUE0Qix5QkFBeUIsU0FBUyxtQkFBbUI7QUFDakYsU0FBUyxtQkFBbUIsK0JBQStCO0FBQzNELFNBQVMsYUFBYTtBQUN0QixTQUFTLGVBQWU7QUFDeEIsU0FBUywyQkFBMkI7QUFDcEMsU0FBUyxTQUFTLGFBQWE7QUFDL0IsU0FBUyxnQkFBZ0I7QUFDekIsU0FBUyxlQUFlO0FBQ3hCLFNBQVMsWUFBWSxpQkFBaUIsU0FBMkIseUJBQXlCO0FBQzFGLFlBQVksY0FBYztBQUMxQixTQUFTLGlCQUFpQjtBQUMxQixTQUFTLGlCQUFpQjtBQUMxQixTQUFTLFdB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
