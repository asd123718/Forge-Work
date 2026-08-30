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
import { StandardKeyboardEvent } from "../../../../base/browser/keyboardEvent.js";
import * as aria from "../../../../base/browser/ui/aria/aria.js";
import { MessageType } from "../../../../base/browser/ui/inputbox/inputBox.js";
import { ObjectTreeElementCollapseState } from "../../../../base/browser/ui/tree/tree.js";
import { Delayer, RunOnceScheduler, Throttler } from "../../../../base/common/async.js";
import * as errors from "../../../../base/common/errors.js";
import { Event } from "../../../../base/common/event.js";
import { KeyCode, KeyMod } from "../../../../base/common/keyCodes.js";
import { Disposable, DisposableMap, DisposableStore, MutableDisposable } from "../../../../base/common/lifecycle.js";
import { isLinux } from "../../../../base/common/platform.js";
import * as strings from "../../../../base/common/strings.js";
import * as network from "../../../../base/common/network.js";
import "./media/searchview.css";
import { getCodeEditor, isCodeEditor, isDiffEditor } from "../../../../editor/browser/editorBrowser.js";
import { ICodeEditorService } from "../../../../editor/browser/services/codeEditorService.js";
import { EmbeddedCodeEditorWidget } from "../../../../editor/browser/widget/codeEditor/embeddedCodeEditorWidget.js";
import { Selection } from "../../../../editor/common/core/selection.js";
import { CommonFindController } from "../../../../editor/contrib/find/browser/findController.js";
import { MultiCursorSelectionController } from "../../../../editor/contrib/multicursor/browser/multicursor.js";
import * as nls from "../../../../nls.js";
import { IAccessibilityService } from "../../../../platform/accessibility/common/accessibility.js";
import { MenuId } from "../../../../platform/actions/common/actions.js";
import { ICommandService } from "../../../../platform/commands/common/commands.js";
import { IConfigurationService } from "../../../../platform/configuration/common/configuration.js";
import { IContextKeyService } from "../../../../platform/contextkey/common/contextkey.js";
import { IContextMenuService, IContextViewService } from "../../../../platform/contextview/browser/contextView.js";
import { IDialogService } from "../../../../platform/dialogs/common/dialogs.js";
import { FileChangeType, IFileService } from "../../../../platform/files/common/files.js";
import { IInstantiationService } from "../../../../platform/instantiation/common/instantiation.js";
import { ServiceCollection } from "../../../../platform/instantiation/common/serviceCollection.js";
import { IKeybindingService } from "../../../../platform/keybinding/common/keybinding.js";
import { getSelectionKeyboardEvent, WorkbenchCompressibleAsyncDataTree } from "../../../../platform/list/browser/listService.js";
import { INotificationService } from "../../../../platform/notification/common/notification.js";
import { IOpenerService, withSelection } from "../../../../platform/opener/common/opener.js";
import { IProgressService } from "../../../../platform/progress/common/progress.js";
import { IStorageService, StorageScope, StorageTarget } from "../../../../platform/storage/common/storage.js";
import { defaultInputBoxStyles, defaultToggleStyles } from "../../../../platform/theme/browser/defaultStyles.js";
import { IThemeService } from "../../../../platform/theme/common/themeService.js";
import { ThemeIcon } from "../../../../base/common/themables.js";
import { IWorkspaceContextService, WorkbenchState } from "../../../../platform/workspace/common/workspace.js";
import { OpenFolderAction } from "../../../browser/actions/workspaceActions.js";
import { ResourceListDnDHandler } from "../../../browser/dnd.js";
import { ResourceLabels } from "../../../browser/labels.js";
import { ViewPane } from "../../../browser/parts/views/viewPane.js";
import { Memento } from "../../../common/memento.js";
import { IViewDescriptorService } from "../../../common/views.js";
import { NotebookEditor } from "../../notebook/browser/notebookEditor.js";
import { ExcludePatternInputWidget, IncludePatternInputWidget } from "./patternInputWidget.js";
import { searchDetailsIcon } from "./searchIcons.js";
import { renderSearchMessage } from "./searchMessage.js";
import { FileMatchRenderer, FolderMatchRenderer, MatchRenderer, SearchAccessibilityProvider, SearchDelegate, TextSearchResultRenderer } from "./searchResultsView.js";
import { SearchWidget } from "./searchWidget.js";
import * as Constants from "../common/constants.js";
import { IReplaceService } from "./replace.js";
import { getOutOfWorkspaceEditorResources, SearchStateKey, SearchUIState } from "../common/search.js";
import { ISearchHistoryService, SearchHistoryService } from "../common/searchHistoryService.js";
import { createEditorFromSearchResult } from "../../searchEditor/browser/searchEditorActions.js";
import { ACTIVE_GROUP, IEditorService, SIDE_GROUP } from "../../../services/editor/common/editorService.js";
import { IPreferencesService } from "../../../services/preferences/common/preferences.js";
import { QueryBuilder } from "../../../services/search/common/queryBuilder.js";
import { SemanticSearchBehavior, SearchCompletionExitCode, SearchSortOrder, TextSearchCompleteMessageType, ViewMode, isAIKeyword } from "../../../services/search/common/search.js";
import { ITextFileService } from "../../../services/textfile/common/textfiles.js";
import { INotebookService } from "../../notebook/common/notebookService.js";
import { ISCMService } from "../../scm/common/scm.js";
import { ILogService } from "../../../../platform/log/common/log.js";
import { AccessibilitySignal, IAccessibilitySignalService } from "../../../../platform/accessibilitySignal/browser/accessibilitySignalService.js";
import { getDefaultHoverDelegate } from "../../../../base/browser/ui/hover/hoverDelegateFactory.js";
import { IHoverService } from "../../../../platform/hover/browser/hover.js";
import { ISearchViewModelWorkbenchService } from "./searchTreeModel/searchViewModelWorkbenchService.js";
import { isSearchTreeMatch, SearchModelLocation, isSearchTreeFileMatch, isSearchTreeFolderMatch, isSearchTreeFolderMatchNoRoot, isSearchTreeFolderMatchWithResource, isSearchTreeFolderMatchWorkspaceRoot, isSearchResult, isTextSearchHeading, isSearchHeader } from "./searchTreeModel/searchTreeCommon.js";
import { isIMatchInNotebook } from "./notebookSearch/notebookSearchModelBase.js";
import { searchMatchComparer } from "./searchCompare.js";
import { AIFolderMatchWorkspaceRootImpl } from "./AISearch/aiSearchModel.js";
import { ITelemetryService } from "../../../../platform/telemetry/common/telemetry.js";
import { forcedExpandRecursively } from "./searchActionsTopBar.js";
const $ = dom.$;
var SearchViewPosition = /* @__PURE__ */ ((SearchViewPosition2) => {
  SearchViewPosition2[SearchViewPosition2["SideBar"] = 0] = "SideBar";
  SearchViewPosition2[SearchViewPosition2["Panel"] = 1] = "Panel";
  return SearchViewPosition2;
})(SearchViewPosition || {});
const SEARCH_CANCELLED_MESSAGE = nls.localize("searchCanceled", "Search was canceled before any results could be found - ");
const DEBOUNCE_DELAY = 75;
let SearchView = class extends ViewPane {
  constructor(options, fileService, editorService, codeEditorService, progressService, notificationService, dialogService, commandService, contextViewService, instantiationService, viewDescriptorService, configurationService, contextService, searchViewModelWorkbenchService, contextKeyService, replaceService, textFileService, preferencesService, themeService, searchHistoryService, contextMenuService, accessibilityService, keybindingService, storageService, openerService, hoverService, notebookService, logService, accessibilitySignalService, telemetryService, scmService) {
    super(options, keybindingService, contextMenuService, configurationService, contextKeyService, viewDescriptorService, instantiationService, openerService, themeService, hoverService);
    this.fileService = fileService;
    this.editorService = editorService;
    this.codeEditorService = codeEditorService;
    this.progressService = progressService;
    this.notificationService = notificationService;
    this.dialogService = dialogService;
    this.commandService = commandService;
    this.contextViewService = contextViewService;
    this.contextService = contextService;
    this.searchViewModelWorkbenchService = searchViewModelWorkbenchService;
    this.replaceService = replaceService;
    this.textFileService = textFileService;
    this.preferencesService = preferencesService;
    this.searchHistoryService = searchHistoryService;
    this.accessibilityService = accessibilityService;
    this.storageService = storageService;
    this.notebookService = notebookService;
    this.logService = logService;
    this.accessibilitySignalService = accessibilitySignalService;
    this.telemetryService = telemetryService;
    this.scmService = scmService;
    this.isDisposed = false;
    this.lastFocusState = "input";
    this.messageDisposables = new DisposableStore();
    this.currentEditorCursorListener = this._register(new MutableDisposable());
    this.currentSearchQ = Promise.resolve();
    this.pauseSearching = false;
    this._visibleMatches = 0;
    this._cachedKeywords = [];
    this.container = dom.$(".search-view");
    this.viewletVisible = Constants.SearchContext.SearchViewVisibleKey.bindTo(this.contextKeyService);
    this.firstMatchFocused = Constants.SearchContext.FirstMatchFocusKey.bindTo(this.contextKeyService);
    this.fileMatchOrMatchFocused = Constants.SearchContext.FileMatchOrMatchFocusKey.bindTo(this.contextKeyService);
    this.fileMatchOrFolderMatchFocus = Constants.SearchContext.FileMatchOrFolderMatchFocusKey.bindTo(this.contextKeyService);
    this.fileMatchOrFolderMatchWithResourceFocus = Constants.SearchContext.FileMatchOrFolderMatchWithResourceFocusKey.bindTo(this.contextKeyService);
    this.fileMatchFocused = Constants.SearchContext.FileFocusKey.bindTo(this.contextKeyService);
    this.folderMatchFocused = Constants.SearchContext.FolderFocusKey.bindTo(this.contextKeyService);
    this.folderMatchWithResourceFocused = Constants.SearchContext.ResourceFolderFocusKey.bindTo(this.contextKeyService);
    this.searchResultHeaderFocused = Constants.SearchContext.SearchResultHeaderFocused.bindTo(this.contextKeyService);
    this.hasSearchResultsKey = Constants.SearchContext.HasSearchResults.bindTo(this.contextKeyService);
    this.matchFocused = Constants.SearchContext.MatchFocusKey.bindTo(this.contextKeyService);
    this.searchStateKey = SearchStateKey.bindTo(this.contextKeyService);
    this.hasSearchPatternKey = Constants.SearchContext.ViewHasSearchPatternKey.bindTo(this.contextKeyService);
    this.hasReplacePatternKey = Constants.SearchContext.ViewHasReplacePatternKey.bindTo(this.contextKeyService);
    this.hasFilePatternKey = Constants.SearchContext.ViewHasFilePatternKey.bindTo(this.contextKeyService);
    this.hasSomeCollapsibleResultKey = Constants.SearchContext.ViewHasSomeCollapsibleKey.bindTo(this.contextKeyService);
    this.treeViewKey = Constants.SearchContext.InTreeViewKey.bindTo(this.contextKeyService);
    this.refreshTreeController = this._register(this.instantiationService.createInstance(RefreshTreeController, this, () => this.searchConfig));
    this._register(this.contextKeyService.onDidChangeContext((e) => {
      const keys = Constants.SearchContext.hasAIResultProvider.keys();
      if (e.affectsSome(new Set(keys))) {
        this.refreshHasAISetting();
      }
    }));
    this.contextKeyService = this._register(this.contextKeyService.createScoped(this.container));
    Constants.SearchContext.SearchViewFocusedKey.bindTo(this.contextKeyService).set(true);
    this.inputBoxFocused = Constants.SearchContext.InputBoxFocusedKey.bindTo(this.contextKeyService);
    this.inputPatternIncludesFocused = Constants.SearchContext.PatternIncludesFocusedKey.bindTo(this.contextKeyService);
    this.inputPatternExclusionsFocused = Constants.SearchContext.PatternExcludesFocusedKey.bindTo(this.contextKeyService);
    this.isEditableItem = Constants.SearchContext.IsEditableItemKey.bindTo(this.contextKeyService);
    this.instantiationService = this._register(this.instantiationService.createChild(
      new ServiceCollection([IContextKeyService, this.contextKeyService])
    ));
    this._register(this.configurationService.onDidChangeConfiguration(async (e) => {
      if (e.affectsConfiguration("search.sortOrder")) {
        if (this.searchConfig.sortOrder === SearchSortOrder.Modified) {
          this.removeFileStats();
        }
        await this.refreshTreeController.queue();
      }
    }));
    this.viewModel = this.searchViewModelWorkbenchService.searchModel;
    this.queryBuilder = this.instantiationService.createInstance(QueryBuilder);
    this.memento = new Memento(this.id, storageService);
    this.viewletState = this.memento.getMemento(StorageScope.WORKSPACE, StorageTarget.MACHINE);
    this._register(this.fileService.onDidFilesChange((e) => this.onFilesChanged(e)));
    this._register(this.textFileService.untitled.onWillDispose((model) => this.onUntitledDidDispose(model.resource)));
    this._register(this.contextService.onDidChangeWorkbenchState(() => this.onDidChangeWorkbenchState()));
    this._register(this.searchHistoryService.onDidClearHistory(() => this.clearHistory()));
    this._register(this.configurationService.onDidChangeConfiguration((e) => this.onConfigurationUpdated(e)));
    const updateChangedFilesToggleEnabled = () => {
      const hasChanges = [...this.scmService.repositories].some(
        (repo) => repo.provider.groups.some((group) => group.resources.length > 0)
      );
      this.inputPatternIncludes?.setOnlySearchInChangedFilesEnabled(hasChanges);
    };
    const scmRepositoryListeners = this._register(new DisposableMap());
    const registerScmRepositoryListeners = (repository) => {
      scmRepositoryListeners.set(repository, repository.provider.onDidChangeResources(() => {
        updateChangedFilesToggleEnabled();
        if (this.inputPatternIncludes?.onlySearchInChangedFiles()) {
          this.triggerQueryChange();
        }
      }));
    };
    for (const repository of this.scmService.repositories) {
      registerScmRepositoryListeners(repository);
    }
    this._register(this.scmService.onDidAddRepository((repository) => {
      registerScmRepositoryListeners(repository);
      updateChangedFilesToggleEnabled();
    }));
    this._register(this.scmService.onDidRemoveRepository((repository) => {
      scmRepositoryListeners.deleteAndDispose(repository);
      updateChangedFilesToggleEnabled();
    }));
    this.delayedRefresh = this._register(new Delayer(250));
    this.addToSearchHistoryDelayer = this._register(new Delayer(2e3));
    this.toggleCollapseStateDelayer = this._register(new Delayer(100));
    this.triggerQueryDelayer = this._register(new Delayer(0));
    this.treeAccessibilityProvider = this.instantiationService.createInstance(SearchAccessibilityProvider, this);
    this.isTreeLayoutViewVisible = this.viewletState.view?.treeLayout ?? this.searchConfig.defaultViewMode === ViewMode.Tree;
    this._refreshResultsScheduler = this._register(new RunOnceScheduler(this._updateResults.bind(this), 80));
    this._register(this.storageService.onWillSaveState(() => {
      this._saveSearchHistoryService();
    }));
    this._register(this.storageService.onDidChangeValue(StorageScope.WORKSPACE, SearchHistoryService.SEARCH_HISTORY_KEY, this._store)(() => {
      const restoredHistory = this.searchHistoryService.load();
      if (restoredHistory.include) {
        this.inputPatternIncludes.prependHistory(restoredHistory.include);
      }
      if (restoredHistory.exclude) {
        this.inputPatternExcludes.prependHistory(restoredHistory.exclude);
      }
      if (restoredHistory.search) {
        this.searchWidget.prependSearchHistory(restoredHistory.search);
      }
      if (restoredHistory.replace) {
        this.searchWidget.prependReplaceHistory(restoredHistory.replace);
      }
    }));
    this.changedWhileHidden = this.hasSearchResults();
  }
  get cachedResults() {
    return this._cachedResults;
  }
  async queueRefreshTree() {
    return this.refreshTreeController.queue();
  }
  get isTreeLayoutViewVisible() {
    return this.treeViewKey.get() ?? false;
  }
  set isTreeLayoutViewVisible(visible) {
    this.treeViewKey.set(visible);
  }
  async setTreeView(visible) {
    if (visible === this.isTreeLayoutViewVisible) {
      return;
    }
    this.isTreeLayoutViewVisible = visible;
    this.updateIndentStyles(this.themeService.getFileIconTheme());
    return this.refreshTreeController.queue();
  }
  get state() {
    return this.searchStateKey.get() ?? SearchUIState.Idle;
  }
  set state(v) {
    this.searchStateKey.set(v);
  }
  getContainer() {
    return this.container;
  }
  get searchResult() {
    return this.viewModel && this.viewModel.searchResult;
  }
  get model() {
    return this.viewModel;
  }
  async refreshHasAISetting() {
    const shouldShowAI = this.shouldShowAIResults();
    if (!this.tree || !this.tree.hasNode(this.searchResult)) {
      return;
    }
    if (shouldShowAI && !this.tree.hasNode(this.searchResult.aiTextSearchResult)) {
      if (this.model.searchResult.getCachedSearchComplete(false)) {
        return this.refreshAndUpdateCount();
      }
    } else if (!shouldShowAI && this.tree.hasNode(this.searchResult.aiTextSearchResult)) {
      return this.refreshAndUpdateCount();
    }
  }
  onDidChangeWorkbenchState() {
    if (this.contextService.getWorkbenchState() !== WorkbenchState.EMPTY && this.searchWithoutFolderMessageElement) {
      dom.hide(this.searchWithoutFolderMessageElement);
    }
  }
  refreshInputs() {
    this.pauseSearching = true;
    this.searchWidget.setValue(this.viewModel.searchResult.query?.contentPattern.pattern ?? "");
    this.searchWidget.setReplaceAllActionState(false);
    this.searchWidget.toggleReplace(true);
    this.inputPatternIncludes.setOnlySearchInOpenEditors(this.viewModel.searchResult.query?.onlyOpenEditors || false);
    this.inputPatternExcludes.setUseExcludesAndIgnoreFiles(!this.viewModel.searchResult.query?.userDisabledExcludesAndIgnoreFiles || true);
    this.searchIncludePattern.setValue("");
    this.searchExcludePattern.setValue("");
    this.pauseSearching = false;
  }
  async replaceSearchModel(searchModel, asyncResults) {
    let progressComplete;
    this.progressService.withProgress({ location: this.getProgressLocation(), delay: 0 }, (_progress) => {
      return new Promise((resolve) => progressComplete = resolve);
    });
    const slowTimer = setTimeout(() => {
      this.state = SearchUIState.SlowSearch;
    }, 2e3);
    this._refreshResultsScheduler.schedule();
    searchModel.location = SearchModelLocation.PANEL;
    searchModel.replaceActive = this.viewModel.isReplaceActive();
    searchModel.replaceString = this.searchWidget.getReplaceValue();
    this._onSearchResultChangedDisposable?.dispose();
    this._onSearchResultChangedDisposable = this._register(searchModel.onSearchResultChanged(async (event) => this.onSearchResultsChanged(event)));
    this.searchViewModelWorkbenchService.searchModel = searchModel;
    this.viewModel = searchModel;
    this.tree.setInput(this.viewModel.searchResult);
    await this.onSearchResultsChanged();
    this.refreshInputs();
    asyncResults.then((complete) => {
      clearTimeout(slowTimer);
      return this.onSearchComplete(progressComplete, void 0, void 0, complete);
    }, (e) => {
      clearTimeout(slowTimer);
      return this.onSearchError(e, progressComplete, void 0, void 0);
    });
    await this.expandIfSingularResult();
  }
  renderBody(parent) {
    super.renderBody(parent);
    this.container = dom.append(parent, dom.$(".search-view"));
    this.searchWidgetsContainerElement = dom.append(this.container, $(".search-widgets-container"));
    this.createSearchWidget(this.searchWidgetsContainerElement);
    const history = this.searchHistoryService.load();
    const filePatterns = this.viewletState.query?.filePatterns || "";
    const patternExclusions = this.viewletState.query?.folderExclusions || "";
    const patternExclusionsHistory = history.exclude || [];
    const patternIncludes = this.viewletState.query?.folderIncludes || "";
    const patternIncludesHistory = history.include || [];
    const onlyOpenEditors = this.viewletState.query?.onlyOpenEditors || false;
    const queryDetailsExpanded = this.viewletState.query?.queryDetailsExpanded || "";
    const useExcludesAndIgnoreFiles = typeof this.viewletState.query?.useExcludesAndIgnoreFiles === "boolean" ? this.viewletState.query.useExcludesAndIgnoreFiles : true;
    this.queryDetails = dom.append(this.searchWidgetsContainerElement, $(".query-details"));
    const toggleQueryDetailsLabel = nls.localize("moreSearch", "Toggle Search Details");
    this.toggleQueryDetailsButton = dom.append(
      this.queryDetails,
      $(".more" + ThemeIcon.asCSSSelector(searchDetailsIcon), { tabindex: 0, role: "button", "aria-label": toggleQueryDetailsLabel })
    );
    this._register(this.hoverService.setupManagedHover(getDefaultHoverDelegate("element"), this.toggleQueryDetailsButton, this.keybindingService.appendKeybinding(toggleQueryDetailsLabel, Constants.SearchCommandIds.ToggleQueryDetailsActionId)));
    this._register(dom.addDisposableListener(this.toggleQueryDetailsButton, dom.EventType.CLICK, (e) => {
      dom.EventHelper.stop(e);
      this.toggleQueryDetails(!this.accessibilityService.isScreenReaderOptimized());
    }));
    this._register(dom.addDisposableListener(this.toggleQueryDetailsButton, dom.EventType.KEY_UP, (e) => {
      const event = new StandardKeyboardEvent(e);
      if (event.equals(KeyCode.Enter) || event.equals(KeyCode.Space)) {
        dom.EventHelper.stop(e);
        this.toggleQueryDetails(false);
      }
    }));
    this._register(dom.addDisposableListener(this.toggleQueryDetailsButton, dom.EventType.KEY_DOWN, (e) => {
      const event = new StandardKeyboardEvent(e);
      if (event.equals(KeyMod.Shift | KeyCode.Tab)) {
        if (this.searchWidget.isReplaceActive()) {
          this.searchWidget.focusReplaceAllAction();
        } else {
          this.searchWidget.isReplaceShown() ? this.searchWidget.replaceInput?.focusOnPreserve() : this.searchWidget.focusRegexAction();
        }
        dom.EventHelper.stop(e);
      }
    }));
    const folderIncludesList = dom.append(this.queryDetails, $(".file-types.includes"));
    const filesToIncludeTitle = nls.localize("searchScope.includes", "files to include");
    dom.append(folderIncludesList, $("h4", void 0, filesToIncludeTitle));
    this.inputPatternIncludes = this._register(this.instantiationService.createInstance(IncludePatternInputWidget, folderIncludesList, this.contextViewService, {
      ariaLabel: filesToIncludeTitle,
      placeholder: nls.localize("placeholder.includes", "e.g. *.ts, src/**/include"),
      showPlaceholderOnFocus: true,
      history: patternIncludesHistory,
      inputBoxStyles: defaultInputBoxStyles
    }));
    this.inputPatternIncludes.setValue(patternIncludes);
    this.inputPatternIncludes.setOnlySearchInOpenEditors(onlyOpenEditors);
    this.inputPatternIncludes.setOnlySearchInChangedFilesEnabled(
      [...this.scmService.repositories].some((repo) => repo.provider.groups.some((group) => group.resources.length > 0))
    );
    this._register(this.inputPatternIncludes.onCancel(() => this.cancelSearch(false)));
    this._register(this.inputPatternIncludes.onChangeSearchInEditorsBox(() => this.triggerQueryChange()));
    this._register(this.inputPatternIncludes.onChangeSearchInChangedFilesBox(() => this.triggerQueryChange()));
    this.trackInputBox(this.inputPatternIncludes.inputFocusTracker, this.inputPatternIncludesFocused);
    const excludesList = dom.append(this.queryDetails, $(".file-types.excludes"));
    const excludesTitle = nls.localize("searchScope.excludes", "files to exclude");
    dom.append(excludesList, $("h4", void 0, excludesTitle));
    this.inputPatternExcludes = this._register(this.instantiationService.createInstance(ExcludePatternInputWidget, excludesList, this.contextViewService, {
      ariaLabel: excludesTitle,
      placeholder: nls.localize("placeholder.excludes", "e.g. *.ts, src/**/exclude"),
      showPlaceholderOnFocus: true,
      history: patternExclusionsHistory,
      inputBoxStyles: defaultInputBoxStyles
    }));
    this.inputPatternExcludes.setValue(patternExclusions);
    this.inputPatternExcludes.setUseExcludesAndIgnoreFiles(useExcludesAndIgnoreFiles);
    this._register(this.inputPatternExcludes.onCancel(() => this.cancelSearch(false)));
    this._register(this.inputPatternExcludes.onChangeIgnoreBox(() => this.triggerQueryChange()));
    this.trackInputBox(this.inputPatternExcludes.inputFocusTracker, this.inputPatternExclusionsFocused);
    const updateHasFilePatternKey = () => this.hasFilePatternKey.set(this.inputPatternIncludes.getValue().length > 0 || this.inputPatternExcludes.getValue().length > 0);
    updateHasFilePatternKey();
    const onFilePatternSubmit = (triggeredOnType) => {
      this.triggerQueryChange({ triggeredOnType, delay: this.searchConfig.searchOnTypeDebouncePeriod });
      if (triggeredOnType) {
        updateHasFilePatternKey();
      }
    };
    this._register(this.inputPatternIncludes.onSubmit(onFilePatternSubmit));
    this._register(this.inputPatternExcludes.onSubmit(onFilePatternSubmit));
    this.messagesElement = dom.append(this.container, $(".messages.text-search-provider-messages"));
    if (this.contextService.getWorkbenchState() === WorkbenchState.EMPTY) {
      this.showSearchWithoutFolderMessage();
    }
    this.createSearchResultsView(this.container);
    if (filePatterns !== "" || patternExclusions !== "" || patternIncludes !== "" || queryDetailsExpanded !== "" || !useExcludesAndIgnoreFiles) {
      this.toggleQueryDetails(true, true, true);
    }
    this._onSearchResultChangedDisposable = this._register(this.viewModel.onSearchResultChanged(async (event) => await this.onSearchResultsChanged(event)));
    this._onAIResultChangedDisposable?.dispose();
    this._onAIResultChangedDisposable = this._register(
      this.viewModel.searchResult.aiTextSearchResult.onChange((e) => {
        if (this.tree && this.tree.hasNode(this.searchResult.aiTextSearchResult) && !e.removed) {
          this.tree.updateChildren(this.searchResult.aiTextSearchResult);
        }
      })
    );
    this._register(this.onDidChangeBodyVisibility((visible) => this.onVisibilityChanged(visible)));
    this.updateIndentStyles(this.themeService.getFileIconTheme());
    this._register(this.themeService.onDidFileIconThemeChange(this.updateIndentStyles, this));
  }
  updateIndentStyles(theme) {
    this.resultsElement.classList.toggle("hide-arrows", this.isTreeLayoutViewVisible && theme.hidesExplorerArrows);
  }
  async onVisibilityChanged(visible) {
    this.viewletVisible.set(visible);
    if (visible) {
      if (this.changedWhileHidden) {
        await this.refreshAndUpdateCount();
        this.changedWhileHidden = false;
      }
    } else {
      this.lastFocusState = "input";
    }
    this.viewModel?.searchResult.toggleHighlights(visible);
  }
  get searchAndReplaceWidget() {
    return this.searchWidget;
  }
  get searchIncludePattern() {
    return this.inputPatternIncludes;
  }
  get searchExcludePattern() {
    return this.inputPatternExcludes;
  }
  createSearchWidget(container) {
    const contentPattern = this.viewletState.query?.contentPattern || "";
    const replaceText = this.viewletState.query?.replaceText || "";
    const isRegex = this.viewletState.query?.regex === true;
    const isWholeWords = this.viewletState.query?.wholeWords === true;
    const isCaseSensitive = this.viewletState.query?.caseSensitive === true;
    const history = this.searchHistoryService.load();
    const searchHistory = history.search || this.viewletState.query?.searchHistory || [];
    const replaceHistory = history.replace || this.viewletState.query?.replaceHistory || [];
    const showReplace = typeof this.viewletState.view?.showReplace === "boolean" ? this.viewletState.view.showReplace : true;
    const preserveCase = this.viewletState.query?.preserveCase === true;
    const isInNotebookMarkdownInput = this.viewletState.query?.isInNotebookMarkdownInput ?? true;
    const isInNotebookMarkdownPreview = this.viewletState.query?.isInNotebookMarkdownPreview ?? true;
    const isInNotebookCellInput = this.viewletState.query?.isInNotebookCellInput ?? true;
    const isInNotebookCellOutput = this.viewletState.query?.isInNotebookCellOutput ?? true;
    this.searchWidget = this._register(this.instantiationService.createInstance(SearchWidget, container, {
      value: contentPattern,
      replaceValue: replaceText,
      isRegex,
      isCaseSensitive,
      isWholeWords,
      searchHistory,
      replaceHistory,
      preserveCase,
      inputBoxStyles: defaultInputBoxStyles,
      toggleStyles: defaultToggleStyles,
      notebookOptions: {
        isInNotebookMarkdownInput,
        isInNotebookMarkdownPreview,
        isInNotebookCellInput,
        isInNotebookCellOutput
      }
    }));
    if (!this.searchWidget.searchInput || !this.searchWidget.replaceInput) {
      this.logService.warn(`Cannot fully create search widget. Search or replace input undefined. SearchInput: ${this.searchWidget.searchInput}, ReplaceInput: ${this.searchWidget.replaceInput}`);
      return;
    }
    if (showReplace) {
      this.searchWidget.toggleReplace(true);
    }
    this._register(this.searchWidget.onSearchSubmit((options) => {
      const shouldRenderAIResults = this.configurationService.getValue("search").searchView.semanticSearchBehavior;
      if (shouldRenderAIResults === SemanticSearchBehavior.Auto) {
        this.logService.info(`SearchView: Automatically rendering AI results`);
      }
      this.triggerQueryChange({
        ...options,
        shouldKeepAIResults: false,
        shouldUpdateAISearch: shouldRenderAIResults === SemanticSearchBehavior.Auto
      });
    }));
    this._register(this.searchWidget.onSearchCancel(({ focus }) => this.cancelSearch(focus)));
    this._register(this.searchWidget.searchInput.onDidOptionChange(() => {
      this.triggerQueryChange({ shouldKeepAIResults: true });
    }));
    this._register(this.searchWidget.getNotebookFilters().onDidChange(() => this.triggerQueryChange({ shouldKeepAIResults: true })));
    const updateHasPatternKey = () => this.hasSearchPatternKey.set(this.searchWidget.searchInput ? this.searchWidget.searchInput.getValue().length > 0 : false);
    updateHasPatternKey();
    this._register(this.searchWidget.searchInput.onDidChange(() => updateHasPatternKey()));
    const updateHasReplacePatternKey = () => this.hasReplacePatternKey.set(this.searchWidget.getReplaceValue().length > 0);
    updateHasReplacePatternKey();
    this._register(this.searchWidget.replaceInput.inputBox.onDidChange(() => updateHasReplacePatternKey()));
    this._register(this.searchWidget.onDidHeightChange(() => this.reLayout()));
    this._register(this.searchWidget.onReplaceToggled(() => this.reLayout()));
    this._register(this.searchWidget.onReplaceStateChange(async (state) => {
      this.viewModel.replaceActive = state;
      await this.refreshTreeController.queue();
    }));
    this._register(this.searchWidget.onPreserveCaseChange(async (state) => {
      this.viewModel.preserveCase = state;
      await this.refreshTreeController.queue();
    }));
    this._register(this.searchWidget.onReplaceValueChanged(() => {
      this.viewModel.replaceString = this.searchWidget.getReplaceValue();
      this.delayedRefresh.trigger(async () => this.refreshTreeController.queue());
    }));
    this._register(this.searchWidget.onBlur(() => {
      this.toggleQueryDetailsButton.focus();
    }));
    this._register(this.searchWidget.onReplaceAll(() => this.replaceAll()));
    this.trackInputBox(this.searchWidget.searchInputFocusTracker);
    this.trackInputBox(this.searchWidget.replaceInputFocusTracker);
  }
  shouldShowAIResults() {
    const hasProvider = Constants.SearchContext.hasAIResultProvider.getValue(this.contextKeyService);
    return !!hasProvider;
  }
  async onConfigurationUpdated(event) {
    if (event && (event.affectsConfiguration("search.decorations.colors") || event.affectsConfiguration("search.decorations.badges"))) {
      return this.refreshTreeController.queue();
    }
  }
  trackInputBox(inputFocusTracker, contextKey) {
    if (!inputFocusTracker) {
      return;
    }
    this._register(inputFocusTracker.onDidFocus(() => {
      this.lastFocusState = "input";
      this.inputBoxFocused.set(true);
      contextKey?.set(true);
    }));
    this._register(inputFocusTracker.onDidBlur(() => {
      this.inputBoxFocused.set(this.searchWidget.searchInputHasFocus() || this.searchWidget.replaceInputHasFocus() || this.inputPatternIncludes.inputHasFocus() || this.inputPatternExcludes.inputHasFocus());
      contextKey?.set(false);
    }));
  }
  async onSearchResultsChanged(event) {
    if (this.isVisible()) {
      return this.refreshAndUpdateCount(event);
    } else {
      this.changedWhileHidden = true;
    }
  }
  async refreshAndUpdateCount(event) {
    this.searchWidget.setReplaceAllActionState(!this.viewModel.searchResult.isEmpty());
    this.updateSearchResultCount(this.viewModel.searchResult.query.userDisabledExcludesAndIgnoreFiles, this.viewModel.searchResult.query?.onlyOpenEditors, event?.clearingAll);
    return this.refreshTreeController.queue(event);
  }
  originalShouldCollapse(match) {
    const collapseResults = this.searchConfig.collapseResults;
    return collapseResults === "alwaysCollapse" || !isSearchTreeMatch(match) && match.count() > 10 && collapseResults !== "alwaysExpand" ? ObjectTreeElementCollapseState.PreserveOrCollapsed : ObjectTreeElementCollapseState.PreserveOrExpanded;
  }
  shouldCollapseAccordingToConfig(match) {
    const collapseResults = this.originalShouldCollapse(match);
    if (collapseResults === ObjectTreeElementCollapseState.PreserveOrCollapsed) {
      return true;
    }
    return false;
  }
  replaceAll() {
    if (this.viewModel.searchResult.count() === 0) {
      return;
    }
    const occurrences = this.viewModel.searchResult.count();
    const fileCount = this.viewModel.searchResult.fileCount();
    const replaceValue = this.searchWidget.getReplaceValue() || "";
    const afterReplaceAllMessage = this.buildAfterReplaceAllMessage(occurrences, fileCount, replaceValue);
    let progressComplete;
    let progressReporter;
    this.progressService.withProgress({ location: this.getProgressLocation(), delay: 100, total: occurrences }, (p) => {
      progressReporter = p;
      return new Promise((resolve) => progressComplete = resolve);
    });
    const confirmation = {
      title: nls.localize("replaceAll.confirmation.title", "Replace All"),
      message: this.buildReplaceAllConfirmationMessage(occurrences, fileCount, replaceValue),
      primaryButton: nls.localize({ key: "replaceAll.confirm.button", comment: ["&& denotes a mnemonic"] }, "&&Replace")
    };
    this.dialogService.confirm(confirmation).then((res) => {
      if (res.confirmed) {
        this.searchWidget.setReplaceAllActionState(false);
        this.viewModel.searchResult.replaceAll(progressReporter).then(() => {
          progressComplete();
          const messageEl = this.clearMessage();
          dom.append(messageEl, afterReplaceAllMessage);
          this.reLayout();
        }, (error) => {
          progressComplete();
          errors.isCancellationError(error);
          this.notificationService.error(error);
        });
      } else {
        progressComplete();
      }
    });
  }
  buildAfterReplaceAllMessage(occurrences, fileCount, replaceValue) {
    if (occurrences === 1) {
      if (fileCount === 1) {
        if (replaceValue) {
          return nls.localize("replaceAll.occurrence.file.message", "Replaced {0} occurrence across {1} file with '{2}'.", occurrences, fileCount, replaceValue);
        }
        return nls.localize("removeAll.occurrence.file.message", "Replaced {0} occurrence across {1} file.", occurrences, fileCount);
      }
      if (replaceValue) {
        return nls.localize("replaceAll.occurrence.files.message", "Replaced {0} occurrence across {1} files with '{2}'.", occurrences, fileCount, replaceValue);
      }
      return nls.localize("removeAll.occurrence.files.message", "Replaced {0} occurrence across {1} files.", occurrences, fileCount);
    }
    if (fileCount === 1) {
      if (replaceValue) {
        return nls.localize("replaceAll.occurrences.file.message", "Replaced {0} occurrences across {1} file with '{2}'.", occurrences, fileCount, replaceValue);
      }
      return nls.localize("removeAll.occurrences.file.message", "Replaced {0} occurrences across {1} file.", occurrences, fileCount);
    }
    if (replaceValue) {
      return nls.localize("replaceAll.occurrences.files.message", "Replaced {0} occurrences across {1} files with '{2}'.", occurrences, fileCount, replaceValue);
    }
    return nls.localize("removeAll.occurrences.files.message", "Replaced {0} occurrences across {1} files.", occurrences, fileCount);
  }
  buildReplaceAllConfirmationMessage(occurrences, fileCount, replaceValue) {
    const truncateValue = (value) => {
      if (!value) {
        return value;
      }
      const lines = value.split("\n");
      if (lines.length > 10) {
        return lines.slice(0, 10).join("\n") + "\n...";
      }
      return value;
    };
    const displayReplaceValue = truncateValue(replaceValue);
    if (occurrences === 1) {
      if (fileCount === 1) {
        if (displayReplaceValue) {
          return nls.localize("removeAll.occurrence.file.confirmation.message", "Replace {0} occurrence across {1} file with '{2}'?", occurrences, fileCount, displayReplaceValue);
        }
        return nls.localize("replaceAll.occurrence.file.confirmation.message", "Replace {0} occurrence across {1} file?", occurrences, fileCount);
      }
      if (displayReplaceValue) {
        return nls.localize("removeAll.occurrence.files.confirmation.message", "Replace {0} occurrence across {1} files with '{2}'?", occurrences, fileCount, displayReplaceValue);
      }
      return nls.localize("replaceAll.occurrence.files.confirmation.message", "Replace {0} occurrence across {1} files?", occurrences, fileCount);
    }
    if (fileCount === 1) {
      if (displayReplaceValue) {
        return nls.localize("removeAll.occurrences.file.confirmation.message", "Replace {0} occurrences across {1} file with '{2}'?", occurrences, fileCount, displayReplaceValue);
      }
      return nls.localize("replaceAll.occurrences.file.confirmation.message", "Replace {0} occurrences across {1} file?", occurrences, fileCount);
    }
    if (displayReplaceValue) {
      return nls.localize("removeAll.occurrences.files.confirmation.message", "Replace {0} occurrences across {1} files with '{2}'?", occurrences, fileCount, displayReplaceValue);
    }
    return nls.localize("replaceAll.occurrences.files.confirmation.message", "Replace {0} occurrences across {1} files?", occurrences, fileCount);
  }
  clearMessage() {
    this.searchWithoutFolderMessageElement = void 0;
    const wasHidden = this.messagesElement.style.display === "none";
    dom.clearNode(this.messagesElement);
    dom.show(this.messagesElement);
    this.messageDisposables.clear();
    const newMessage = dom.append(this.messagesElement, $(".message"));
    if (wasHidden) {
      this.reLayout();
    }
    return newMessage;
  }
  createSearchResultsView(container) {
    this.resultsElement = dom.append(container, $(".results.show-file-icons.file-icon-themable-tree"));
    const delegate = this.instantiationService.createInstance(SearchDelegate);
    const identityProvider = {
      getId(element) {
        return element.id();
      }
    };
    this.searchDataSource = this.instantiationService.createInstance(SearchViewDataSource, this);
    this.treeLabels = this._register(this.instantiationService.createInstance(ResourceLabels, { onDidChangeVisibility: this.onDidChangeBodyVisibility }));
    this.tree = this._register(this.instantiationService.createInstance(
      WorkbenchCompressibleAsyncDataTree,
      "SearchView",
      this.resultsElement,
      delegate,
      {
        isIncompressible: (element) => {
          if (isSearchTreeFolderMatch(element) && !isTextSearchHeading(element.parent()) && !isSearchTreeFolderMatchWorkspaceRoot(element.parent()) && !isSearchTreeFolderMatchNoRoot(element.parent())) {
            return false;
          }
          return true;
        }
      },
      [
        this._register(this.instantiationService.createInstance(FolderMatchRenderer, this, this.treeLabels)),
        this._register(this.instantiationService.createInstance(FileMatchRenderer, this, this.treeLabels)),
        this._register(this.instantiationService.createInstance(TextSearchResultRenderer, this.treeLabels)),
        this._register(this.instantiationService.createInstance(MatchRenderer, this))
      ],
      this.searchDataSource,
      {
        identityProvider,
        accessibilityProvider: this.treeAccessibilityProvider,
        dnd: this.instantiationService.createInstance(ResourceListDnDHandler, (element) => {
          if (isSearchTreeFileMatch(element)) {
            return element.resource;
          }
          if (isSearchTreeMatch(element)) {
            return withSelection(element.parent().resource, element.range());
          }
          return null;
        }),
        multipleSelectionSupport: true,
        selectionNavigation: true,
        overrideStyles: this.getLocationBasedColors().listOverrideStyles,
        paddingBottom: SearchDelegate.ITEM_HEIGHT,
        collapseByDefault: (e) => {
          if (isTextSearchHeading(e)) {
            return e.isAIContributed;
          }
          if (isSearchTreeFolderMatch(e) && e.matches().length === 1 && isSearchTreeFolderMatch(e.matches()[0])) {
            return false;
          }
          return this.shouldCollapseAccordingToConfig(e);
        }
      }
    ));
    Constants.SearchContext.SearchResultListFocusedKey.bindTo(this.tree.contextKeyService);
    this.tree.setInput(this.viewModel.searchResult);
    this._register(this.tree.onContextMenu((e) => this.onContextMenu(e)));
    const updateHasSomeCollapsible = () => this.toggleCollapseStateDelayer.trigger(() => this.hasSomeCollapsibleResultKey.set(this.hasSomeCollapsible()));
    updateHasSomeCollapsible();
    this._register(this.tree.onDidChangeCollapseState(() => updateHasSomeCollapsible()));
    this._register(this.tree.onDidChangeModel(() => updateHasSomeCollapsible()));
    this._register(Event.debounce(this.tree.onDidOpen, (last, event) => event, DEBOUNCE_DELAY, true)((options) => {
      if (isSearchTreeMatch(options.element)) {
        const selectedMatch = options.element;
        this.currentSelectedFileMatch?.setSelectedMatch(null);
        this.currentSelectedFileMatch = selectedMatch.parent();
        this.currentSelectedFileMatch.setSelectedMatch(selectedMatch);
        this.onFocus(selectedMatch, options.editorOptions.preserveFocus, options.sideBySide, options.editorOptions.pinned);
      }
    }));
    this._register(Event.debounce(this.tree.onDidChangeFocus, (last, event) => event, DEBOUNCE_DELAY, true)(() => {
      const selection = this.tree.getSelection();
      const focus = this.tree.getFocus()[0];
      if (selection.length > 1 && isSearchTreeMatch(focus)) {
        this.onFocus(focus, true);
      }
    }));
    this._register(Event.any(this.tree.onDidFocus, this.tree.onDidChangeFocus)(() => {
      const focus = this.tree.getFocus()[0];
      if (this.tree.isDOMFocused()) {
        const firstElem = this.tree.getFirstElementChild(this.tree.getInput());
        this.firstMatchFocused.set(firstElem === focus);
        this.fileMatchOrMatchFocused.set(!!focus);
        this.fileMatchFocused.set(isSearchTreeFileMatch(focus));
        this.folderMatchFocused.set(isSearchTreeFolderMatch(focus));
        this.matchFocused.set(isSearchTreeMatch(focus));
        this.fileMatchOrFolderMatchFocus.set(isSearchTreeFileMatch(focus) || isSearchTreeFolderMatch(focus));
        this.fileMatchOrFolderMatchWithResourceFocus.set(isSearchTreeFileMatch(focus) || isSearchTreeFolderMatchWithResource(focus));
        this.folderMatchWithResourceFocused.set(isSearchTreeFolderMatchWithResource(focus));
        this.searchResultHeaderFocused.set(isSearchHeader(focus));
        this.lastFocusState = "tree";
      }
      let editable = false;
      if (isSearchTreeMatch(focus)) {
        editable = !focus.isReadonly;
      } else if (isSearchTreeFileMatch(focus)) {
        editable = !focus.hasOnlyReadOnlyMatches();
      } else if (isSearchTreeFolderMatch(focus)) {
        editable = !focus.hasOnlyReadOnlyMatches();
      }
      this.isEditableItem.set(editable);
    }));
    this._register(this.tree.onDidBlur(() => {
      this.firstMatchFocused.reset();
      this.fileMatchOrMatchFocused.reset();
      this.fileMatchFocused.reset();
      this.folderMatchFocused.reset();
      this.matchFocused.reset();
      this.fileMatchOrFolderMatchFocus.reset();
      this.fileMatchOrFolderMatchWithResourceFocus.reset();
      this.folderMatchWithResourceFocused.reset();
      this.searchResultHeaderFocused.reset();
      this.isEditableItem.reset();
    }));
    this._register(this.editorService.onDidActiveEditorChange(() => {
      const editor = getCodeEditor(this.editorService.activeTextEditorControl);
      this.currentEditorCursorListener.value = editor?.onDidChangeCursorPosition(() => {
        this.currentSelectedFileMatch?.setSelectedMatch(null);
        this.currentSelectedFileMatch = void 0;
      });
    }));
  }
  onContextMenu(e) {
    e.browserEvent.preventDefault();
    e.browserEvent.stopPropagation();
    const selection = this.tree.getSelection();
    let arg;
    let context;
    if (selection && selection.length > 0) {
      arg = e.element;
      context = selection;
    } else {
      context = e.element;
    }
    this.contextMenuService.showContextMenu({
      menuId: MenuId.SearchContext,
      menuActionOptions: { shouldForwardArgs: true, arg },
      contextKeyService: this.contextKeyService,
      getAnchor: () => e.anchor,
      getActionsContext: () => context
    });
  }
  hasSomeCollapsible() {
    const viewer = this.getControl();
    const navigator = viewer.navigate();
    let node = navigator.first();
    const shouldShowAI = this.shouldShowAIResults();
    do {
      if (node && !viewer.isCollapsed(node) && (!shouldShowAI || !isTextSearchHeading(node))) {
        return true;
      }
    } while (node = navigator.next());
    return false;
  }
  async selectNextMatch() {
    if (!this.hasSearchResults()) {
      return;
    }
    const [selected] = this.tree.getSelection();
    if (selected && !isSearchTreeMatch(selected)) {
      if (this.tree.isCollapsed(selected)) {
        await this.tree.expand(selected);
      }
    }
    const navigator = this.tree.navigate(selected);
    let next = navigator.next();
    if (!next) {
      next = navigator.first();
    }
    while (next && !isSearchTreeMatch(next)) {
      if (this.tree.isCollapsed(next)) {
        await this.tree.expand(next);
      }
      next = navigator.next();
    }
    if (next) {
      if (next === selected) {
        this.tree.setFocus([]);
      }
      const event = getSelectionKeyboardEvent(void 0, false, false);
      this.tree.setFocus([next], event);
      this.tree.setSelection([next], event);
      this.tree.reveal(next);
      const ariaLabel = this.treeAccessibilityProvider.getAriaLabel(next);
      if (ariaLabel) {
        aria.status(ariaLabel);
      }
    }
  }
  async selectPreviousMatch() {
    if (!this.hasSearchResults()) {
      return;
    }
    const [selected] = this.tree.getSelection();
    let navigator = this.tree.navigate(selected);
    let prev = navigator.previous();
    while (!prev || !isSearchTreeMatch(prev) && !this.tree.isCollapsed(prev)) {
      const nextPrev = prev ? navigator.previous() : navigator.last();
      if (!prev && !nextPrev) {
        return;
      }
      prev = nextPrev;
    }
    while (prev && !isSearchTreeMatch(prev)) {
      const nextItem = navigator.next();
      if (!nextItem) {
        break;
      }
      await this.tree.expand(prev);
      navigator = this.tree.navigate(nextItem);
      prev = nextItem ? navigator.previous() : navigator.last();
    }
    if (prev) {
      if (prev === selected) {
        this.tree.setFocus([]);
      }
      const event = getSelectionKeyboardEvent(void 0, false, false);
      this.tree.setFocus([prev], event);
      this.tree.setSelection([prev], event);
      this.tree.reveal(prev);
      const ariaLabel = this.treeAccessibilityProvider.getAriaLabel(prev);
      if (ariaLabel) {
        aria.status(ariaLabel);
      }
    }
  }
  moveFocusToResults() {
    this.tree.domFocus();
  }
  focus() {
    super.focus();
    if (this.lastFocusState === "input" || !this.hasSearchResults()) {
      const updatedText = this.searchConfig.seedOnFocus ? this.updateTextFromSelection({ allowSearchOnType: false }) : false;
      this.searchWidget.focus(void 0, void 0, updatedText);
    } else {
      this.tree.domFocus();
    }
  }
  updateTextFromFindWidgetOrSelection({ allowUnselectedWord = true, allowSearchOnType = true }) {
    let activeEditor = this.editorService.activeTextEditorControl;
    if (isCodeEditor(activeEditor) && !activeEditor?.hasTextFocus()) {
      const controller = CommonFindController.get(activeEditor);
      if (controller && controller.isFindInputFocused()) {
        return this.updateTextFromFindWidget(controller, { allowSearchOnType });
      }
      const editors = this.codeEditorService.listCodeEditors();
      activeEditor = editors.find((editor) => editor instanceof EmbeddedCodeEditorWidget && editor.getParentEditor() === activeEditor && editor.hasTextFocus()) ?? activeEditor;
    }
    return this.updateTextFromSelection({ allowUnselectedWord, allowSearchOnType }, activeEditor);
  }
  updateTextFromFindWidget(controller, { allowSearchOnType = true }) {
    if (!this.searchConfig.seedWithNearestWord && (dom.getActiveWindow().getSelection()?.toString() ?? "") === "") {
      return false;
    }
    const searchString = controller.getState().searchString;
    if (searchString === "") {
      return false;
    }
    this.searchWidget.searchInput?.setCaseSensitive(controller.getState().matchCase);
    this.searchWidget.searchInput?.setWholeWords(controller.getState().wholeWord);
    this.searchWidget.searchInput?.setRegex(controller.getState().isRegex);
    this.updateText(searchString, allowSearchOnType);
    return true;
  }
  updateTextFromSelection({ allowUnselectedWord = true, allowSearchOnType = true }, editor) {
    const seedSearchStringFromSelection = this.configurationService.getValue("editor").find.seedSearchStringFromSelection;
    if (!seedSearchStringFromSelection || seedSearchStringFromSelection === "never") {
      return false;
    }
    let selectedText = this.getSearchTextFromEditor(allowUnselectedWord, editor);
    if (selectedText === null) {
      return false;
    }
    if (this.searchWidget.searchInput?.getRegex()) {
      selectedText = strings.escapeRegExpCharacters(selectedText);
    }
    this.updateText(selectedText, allowSearchOnType);
    return true;
  }
  updateText(text, allowSearchOnType = true) {
    if (allowSearchOnType && !this.viewModel.searchResult.isDirty) {
      this.searchWidget.setValue(text);
    } else {
      this.pauseSearching = true;
      this.searchWidget.setValue(text);
      this.pauseSearching = false;
    }
  }
  focusNextInputBox() {
    if (this.searchWidget.searchInputHasFocus()) {
      if (this.searchWidget.isReplaceShown()) {
        this.searchWidget.focus(true, true);
      } else {
        this.moveFocusFromSearchOrReplace();
      }
      return;
    }
    if (this.searchWidget.replaceInputHasFocus()) {
      this.moveFocusFromSearchOrReplace();
      return;
    }
    if (this.inputPatternIncludes.inputHasFocus()) {
      this.inputPatternExcludes.focus();
      this.inputPatternExcludes.select();
      return;
    }
    if (this.inputPatternExcludes.inputHasFocus()) {
      this.selectTreeIfNotSelected();
      return;
    }
  }
  moveFocusFromSearchOrReplace() {
    if (this.showsFileTypes()) {
      this.toggleQueryDetails(true, this.showsFileTypes());
    } else {
      this.selectTreeIfNotSelected();
    }
  }
  focusPreviousInputBox() {
    if (this.searchWidget.searchInputHasFocus()) {
      return;
    }
    if (this.searchWidget.replaceInputHasFocus()) {
      this.searchWidget.focus(true);
      return;
    }
    if (this.inputPatternIncludes.inputHasFocus()) {
      this.searchWidget.focus(true, true);
      return;
    }
    if (this.inputPatternExcludes.inputHasFocus()) {
      this.inputPatternIncludes.focus();
      this.inputPatternIncludes.select();
      return;
    }
    if (this.tree.isDOMFocused()) {
      this.moveFocusFromResults();
      return;
    }
  }
  moveFocusFromResults() {
    if (this.showsFileTypes()) {
      this.toggleQueryDetails(true, true, false, true);
    } else {
      this.searchWidget.focus(true, true);
    }
  }
  reLayout() {
    if (this.isDisposed || !this.size) {
      return;
    }
    const actionsPosition = this.searchConfig.actionsPosition;
    this.getContainer().classList.toggle(SearchView.ACTIONS_RIGHT_CLASS_NAME, actionsPosition === "right");
    this.searchWidget.setWidth(
      this.size.width - 28
      /* container margin */
    );
    this.inputPatternExcludes.setWidth(
      this.size.width - 28
      /* container margin */
    );
    this.inputPatternIncludes.setWidth(
      this.size.width - 28
      /* container margin */
    );
    const widgetHeight = dom.getTotalHeight(this.searchWidgetsContainerElement);
    const messagesHeight = dom.getTotalHeight(this.messagesElement);
    this.tree.layout(this.size.height - widgetHeight - messagesHeight, this.size.width - 28);
  }
  layoutBody(height, width) {
    super.layoutBody(height, width);
    this.size = new dom.Dimension(width, height);
    this.reLayout();
  }
  getControl() {
    return this.tree;
  }
  allSearchFieldsClear() {
    return this.searchWidget.getReplaceValue() === "" && (!this.searchWidget.searchInput || this.searchWidget.searchInput.getValue() === "");
  }
  allFilePatternFieldsClear() {
    return this.searchExcludePattern.getValue() === "" && this.searchIncludePattern.getValue() === "";
  }
  hasSearchResults() {
    return !this.viewModel.searchResult.isEmpty();
  }
  clearSearchResults(clearInput = true) {
    this.viewModel.searchResult.clear();
    this.showEmptyStage(true);
    if (this.contextService.getWorkbenchState() === WorkbenchState.EMPTY) {
      this.showSearchWithoutFolderMessage();
    }
    if (clearInput) {
      if (this.allSearchFieldsClear()) {
        this.clearFilePatternFields();
      }
      this.searchWidget.clear();
    }
    this.viewModel.cancelSearch();
    this.viewModel.cancelAISearch();
    this.tree.ariaLabel = nls.localize("emptySearch", "Empty Search");
    this.accessibilitySignalService.playSignal(AccessibilitySignal.clear);
    this.reLayout();
  }
  clearFilePatternFields() {
    this.searchExcludePattern.clear();
    this.searchIncludePattern.clear();
  }
  cancelSearch(focus = true) {
    if (this.viewModel.cancelSearch() && this.viewModel.cancelAISearch()) {
      if (focus) {
        this.searchWidget.focus();
      }
      return true;
    }
    return false;
  }
  selectTreeIfNotSelected() {
    if (this.tree.getNode(void 0)) {
      this.tree.domFocus();
      const selection = this.tree.getSelection();
      if (selection.length === 0) {
        const event = getSelectionKeyboardEvent();
        this.tree.focusNext(void 0, void 0, event);
        this.tree.setSelection(this.tree.getFocus(), event);
      }
    }
  }
  getSearchTextFromEditor(allowUnselectedWord, editor) {
    if (dom.isAncestorOfActiveElement(this.getContainer())) {
      return null;
    }
    editor = editor ?? this.editorService.activeTextEditorControl;
    if (!editor) {
      return null;
    }
    const allowUnselected = this.searchConfig.seedWithNearestWord && allowUnselectedWord;
    return getSelectionTextFromEditor(allowUnselected, editor);
  }
  showsFileTypes() {
    return this.queryDetails.classList.contains("more");
  }
  toggleCaseSensitive() {
    this.searchWidget.searchInput?.setCaseSensitive(!this.searchWidget.searchInput.getCaseSensitive());
    this.triggerQueryChange({ shouldKeepAIResults: true });
  }
  toggleWholeWords() {
    this.searchWidget.searchInput?.setWholeWords(!this.searchWidget.searchInput.getWholeWords());
    this.triggerQueryChange({ shouldKeepAIResults: true });
  }
  toggleRegex() {
    this.searchWidget.searchInput?.setRegex(!this.searchWidget.searchInput.getRegex());
    this.triggerQueryChange({ shouldKeepAIResults: true });
  }
  togglePreserveCase() {
    this.searchWidget.replaceInput?.setPreserveCase(!this.searchWidget.replaceInput.getPreserveCase());
    this.triggerQueryChange({ shouldKeepAIResults: true });
  }
  setSearchParameters(args = {}) {
    if (typeof args.isCaseSensitive === "boolean") {
      this.searchWidget.searchInput?.setCaseSensitive(args.isCaseSensitive);
    }
    if (typeof args.matchWholeWord === "boolean") {
      this.searchWidget.searchInput?.setWholeWords(args.matchWholeWord);
    }
    if (typeof args.isRegex === "boolean") {
      this.searchWidget.searchInput?.setRegex(args.isRegex);
    }
    if (typeof args.filesToInclude === "string") {
      this.searchIncludePattern.setValue(String(args.filesToInclude));
    }
    if (typeof args.filesToExclude === "string") {
      this.searchExcludePattern.setValue(String(args.filesToExclude));
    }
    if (typeof args.query === "string") {
      this.searchWidget.searchInput?.setValue(args.query);
    }
    if (typeof args.replace === "string") {
      this.searchWidget.replaceInput?.setValue(args.replace);
    } else {
      if (this.searchWidget.replaceInput && this.searchWidget.replaceInput.getValue() !== "") {
        this.searchWidget.replaceInput.setValue("");
      }
    }
    if (typeof args.triggerSearch === "boolean" && args.triggerSearch) {
      this.triggerQueryChange();
    }
    if (typeof args.preserveCase === "boolean") {
      this.searchWidget.replaceInput?.setPreserveCase(args.preserveCase);
    }
    if (typeof args.useExcludeSettingsAndIgnoreFiles === "boolean") {
      this.inputPatternExcludes.setUseExcludesAndIgnoreFiles(args.useExcludeSettingsAndIgnoreFiles);
    }
    if (typeof args.onlyOpenEditors === "boolean") {
      this.searchIncludePattern.setOnlySearchInOpenEditors(args.onlyOpenEditors);
    }
  }
  toggleQueryDetails(moveFocus = true, show, skipLayout, reverse) {
    show = typeof show === "undefined" ? !this.queryDetails.classList.contains("more") : Boolean(show);
    if (!this.viewletState.query) {
      this.viewletState.query = {};
    }
    this.viewletState.query.queryDetailsExpanded = show;
    skipLayout = Boolean(skipLayout);
    if (show) {
      this.toggleQueryDetailsButton.setAttribute("aria-expanded", "true");
      this.queryDetails.classList.add("more");
      if (moveFocus) {
        if (reverse) {
          this.inputPatternExcludes.focus();
          this.inputPatternExcludes.select();
        } else {
          this.inputPatternIncludes.focus();
          this.inputPatternIncludes.select();
        }
      }
    } else {
      this.toggleQueryDetailsButton.setAttribute("aria-expanded", "false");
      this.queryDetails.classList.remove("more");
      if (moveFocus) {
        this.searchWidget.focus();
      }
    }
    if (!skipLayout && this.size) {
      this.reLayout();
    }
  }
  searchInFolders(folderPaths = []) {
    this._searchWithIncludeOrExclude(true, folderPaths);
  }
  searchOutsideOfFolders(folderPaths = []) {
    this._searchWithIncludeOrExclude(false, folderPaths);
  }
  _searchWithIncludeOrExclude(include, folderPaths) {
    if (!folderPaths.length || folderPaths.some((folderPath) => folderPath === ".")) {
      this.inputPatternIncludes.setValue("");
      this.searchWidget.focus();
      return;
    }
    if (!this.showsFileTypes()) {
      this.toggleQueryDetails(true, true);
    }
    (include ? this.inputPatternIncludes : this.inputPatternExcludes).setValue(folderPaths.join(", "));
    this.searchWidget.focus(false);
  }
  triggerQueryChange(_options) {
    const options = { preserveFocus: true, triggeredOnType: false, delay: 0, ..._options };
    if (options.triggeredOnType && !this.searchConfig.searchOnType) {
      return;
    }
    if (!this.pauseSearching) {
      const delay = options.triggeredOnType ? options.delay : 0;
      this.triggerQueryDelayer.trigger(() => {
        this._onQueryChanged(options.preserveFocus, options.triggeredOnType, options.shouldKeepAIResults, options.shouldUpdateAISearch);
      }, delay);
    }
  }
  _getExcludePattern() {
    return this.inputPatternExcludes.getValue().trim();
  }
  _getIncludePattern() {
    return this.inputPatternIncludes.getValue().trim();
  }
  _onQueryChanged(preserveFocus, triggeredOnType = false, shouldKeepAIResults = false, shouldUpdateAISearch = false) {
    if (!this.searchWidget.searchInput?.inputBox.isInputValid()) {
      return;
    }
    const isRegex = this.searchWidget.searchInput.getRegex();
    const isInNotebookMarkdownInput = this.searchWidget.getNotebookFilters().markupInput;
    const isInNotebookMarkdownPreview = this.searchWidget.getNotebookFilters().markupPreview;
    const isInNotebookCellInput = this.searchWidget.getNotebookFilters().codeInput;
    const isInNotebookCellOutput = this.searchWidget.getNotebookFilters().codeOutput;
    const isWholeWords = this.searchWidget.searchInput.getWholeWords();
    const isCaseSensitive = this.searchWidget.searchInput.getCaseSensitive();
    const contentPattern = this.searchWidget.searchInput.getValue();
    const excludePatternText = this._getExcludePattern();
    const includePatternText = this._getIncludePattern();
    const useExcludesAndIgnoreFiles = this.inputPatternExcludes.useExcludesAndIgnoreFiles();
    const onlySearchInOpenEditors = this.inputPatternIncludes.onlySearchInOpenEditors();
    const onlySearchInChangedFiles = this.inputPatternIncludes.onlySearchInChangedFiles();
    if (contentPattern.length === 0) {
      this.clearSearchResults(false);
      this.clearMessage();
      this.clearAIResults();
      return;
    }
    const content = {
      pattern: contentPattern,
      isRegExp: isRegex,
      isCaseSensitive,
      isWordMatch: isWholeWords,
      notebookInfo: {
        isInNotebookMarkdownInput,
        isInNotebookMarkdownPreview,
        isInNotebookCellInput,
        isInNotebookCellOutput
      }
    };
    const excludePattern = [{ pattern: this.inputPatternExcludes.getValue() }];
    const includePattern = this.inputPatternIncludes.getValue();
    let changedFileUris;
    if (onlySearchInChangedFiles) {
      changedFileUris = [...this.scmService.repositories].flatMap((repository) => repository.provider.groups).flatMap((group) => group.resources).map((resource) => resource.sourceUri);
    }
    const charsPerLine = content.isRegExp ? 1e4 : 1e3;
    const options = {
      _reason: "searchView",
      extraFileResources: this.instantiationService.invokeFunction(getOutOfWorkspaceEditorResources),
      maxResults: this.searchConfig.maxResults ?? void 0,
      disregardIgnoreFiles: !useExcludesAndIgnoreFiles || void 0,
      disregardExcludeSettings: !useExcludesAndIgnoreFiles || void 0,
      ignoreGlobCase: !isLinux || void 0,
      onlyOpenEditors: onlySearchInOpenEditors,
      changedFileUris,
      excludePattern,
      includePattern,
      previewOptions: {
        matchLines: 1,
        charsPerLine
      },
      isSmartCase: this.searchConfig.smartCase,
      expandPatterns: true
    };
    const folderResources = this.contextService.getWorkspace().folders;
    const onQueryValidationError = (err) => {
      this.searchWidget.searchInput?.showMessage({ content: err.message, type: MessageType.ERROR });
      this.viewModel.searchResult.clear();
    };
    let query;
    try {
      query = this.queryBuilder.text(content, folderResources.map((folder) => folder.uri), options);
    } catch (err) {
      onQueryValidationError(err);
      return;
    }
    this.validateQuery(query).then(() => {
      if (!shouldKeepAIResults && shouldUpdateAISearch && this.tree.hasNode(this.searchResult.aiTextSearchResult)) {
        this.tree.collapse(this.searchResult.aiTextSearchResult);
      }
      this.onQueryTriggered(query, options, excludePatternText, includePatternText, triggeredOnType, shouldKeepAIResults, shouldUpdateAISearch);
      if (!preserveFocus) {
        this.searchWidget.focus(false, void 0, true);
      }
    }, onQueryValidationError);
  }
  validateQuery(query) {
    const folderQueriesExistP = query.folderQueries.map((fq) => {
      return this.fileService.exists(fq.folder).catch(() => false);
    });
    return Promise.all(folderQueriesExistP).then((existResults) => {
      const existingFolderQueries = query.folderQueries.filter((folderQuery, i) => existResults[i]);
      if (!query.folderQueries.length || existingFolderQueries.length) {
        query.folderQueries = existingFolderQueries;
      } else {
        const nonExistantPath = query.folderQueries[0].folder.fsPath;
        const searchPathNotFoundError = nls.localize("searchPathNotFoundError", "Search path not found: {0}", nonExistantPath);
        return Promise.reject(new Error(searchPathNotFoundError));
      }
      return void 0;
    });
  }
  onQueryTriggered(query, options, excludePatternText, includePatternText, triggeredOnType, shouldKeepAIResults, shouldUpdateAISearch) {
    this.addToSearchHistoryDelayer.trigger(() => {
      this.searchWidget.searchInput?.onSearchSubmit();
      this.inputPatternExcludes.onSearchSubmit();
      this.inputPatternIncludes.onSearchSubmit();
    });
    this.viewModel.cancelSearch(true);
    if (!shouldKeepAIResults) {
      this.clearAIResults();
    }
    this.currentSearchQ = this.currentSearchQ.then(() => this.doSearch(query, excludePatternText, includePatternText, triggeredOnType, shouldKeepAIResults, shouldUpdateAISearch)).then(() => void 0, () => void 0);
  }
  async _updateResults() {
    if (this.state === SearchUIState.Idle) {
      return;
    }
    try {
      const fileCount = this.viewModel.searchResult.fileCount();
      if (this._visibleMatches !== fileCount) {
        this._visibleMatches = fileCount;
        await this.refreshAndUpdateCount();
      }
    } finally {
      this._refreshResultsScheduler.schedule();
    }
  }
  async expandIfSingularResult() {
    const collapseResults = this.searchConfig.collapseResults;
    if (collapseResults !== "alwaysCollapse" && this.viewModel.searchResult.matches().length === 1) {
      const onlyMatch = this.viewModel.searchResult.matches()[0];
      await this.tree.expandTo(onlyMatch);
      if (onlyMatch.count() < 50) {
        await this.tree.expand(onlyMatch);
      }
    }
  }
  appendSearchWithAIButton(messageEl) {
    const searchWithAIButtonTooltip = this.keybindingService.appendKeybinding(
      nls.localize("triggerAISearch.tooltip", "Search with AI."),
      Constants.SearchCommandIds.SearchWithAIActionId
    );
    const searchWithAIButtonText = nls.localize("searchWithAIButtonTooltip", "Search with AI");
    const searchWithAIButton = this.messageDisposables.add(new SearchLinkButton(
      searchWithAIButtonText,
      () => {
        this.commandService.executeCommand(Constants.SearchCommandIds.SearchWithAIActionId);
      },
      this.hoverService,
      searchWithAIButtonTooltip
    ));
    dom.append(messageEl, searchWithAIButton.element);
  }
  async onSearchComplete(progressComplete, excludePatternText, includePatternText, completed, shouldDoFinalRefresh = true, keywords) {
    this.state = SearchUIState.Idle;
    progressComplete();
    if (shouldDoFinalRefresh) {
      await this.refreshAndUpdateCount();
    }
    const allResults = !this.viewModel.searchResult.isEmpty();
    const aiResults = this.searchResult.getCachedSearchComplete(true);
    if (completed?.exit === SearchCompletionExitCode.NewSearchStarted) {
      return;
    }
    Constants.SearchContext.AIResultsRequested.bindTo(this.contextKeyService).set(this.shouldShowAIResults() && !!aiResults);
    if (completed && this.tree.hasNode(this.searchResult.aiTextSearchResult) && this.tree.isCollapsed(this.searchResult.aiTextSearchResult)) {
      this.tree.expand(this.searchResult.aiTextSearchResult);
      return;
    }
    if (!allResults) {
      const hasExcludes = !!excludePatternText;
      const hasIncludes = !!includePatternText;
      let message;
      if (!completed) {
        message = SEARCH_CANCELLED_MESSAGE;
      } else if (this.inputPatternIncludes.onlySearchInOpenEditors()) {
        if (hasIncludes && hasExcludes) {
          message = nls.localize("noOpenEditorResultsIncludesExcludes", "No results found in open editors matching '{0}' excluding '{1}' - ", includePatternText, excludePatternText);
        } else if (hasIncludes) {
          message = nls.localize("noOpenEditorResultsIncludes", "No results found in open editors matching '{0}' - ", includePatternText);
        } else if (hasExcludes) {
          message = nls.localize("noOpenEditorResultsExcludes", "No results found in open editors excluding '{0}' - ", excludePatternText);
        } else {
          message = nls.localize("noOpenEditorResultsFound", "No results found in open editors. Review your configured exclusions and check your gitignore files - ");
        }
      } else {
        if (hasIncludes && hasExcludes) {
          message = nls.localize("noResultsIncludesExcludes", "No results found in '{0}' excluding '{1}' - ", includePatternText, excludePatternText);
        } else if (hasIncludes) {
          message = nls.localize("noResultsIncludes", "No results found in '{0}' - ", includePatternText);
        } else if (hasExcludes) {
          message = nls.localize("noResultsExcludes", "No results found excluding '{0}' - ", excludePatternText);
        } else {
          message = nls.localize("noResultsFound", "No results found. Review your configured exclusions and check your gitignore files - ");
        }
      }
      aria.status(message);
      const messageEl = this.clearMessage();
      dom.append(messageEl, message);
      if (this.shouldShowAIResults()) {
        this.appendSearchWithAIButton(messageEl);
        dom.append(messageEl, $("span", void 0, " - "));
      }
      if (!completed) {
        const searchAgainButton = this.messageDisposables.add(new SearchLinkButton(
          nls.localize("rerunSearch.message", "Search again"),
          () => this.triggerQueryChange({ preserveFocus: false }),
          this.hoverService
        ));
        dom.append(messageEl, searchAgainButton.element);
      } else if (hasIncludes || hasExcludes) {
        const searchAgainButton = this.messageDisposables.add(new SearchLinkButton(nls.localize("rerunSearchInAll.message", "Search again in all files"), this.onSearchAgain.bind(this), this.hoverService));
        dom.append(messageEl, searchAgainButton.element);
      } else {
        const openSettingsButton = this.messageDisposables.add(new SearchLinkButton(nls.localize("openSettings.message", "Open Settings"), this.onOpenSettings.bind(this), this.hoverService));
        dom.append(messageEl, openSettingsButton.element);
      }
      if (this.contextService.getWorkbenchState() === WorkbenchState.EMPTY) {
        this.showSearchWithoutFolderMessage();
      }
      this.reLayout();
    } else {
      this.viewModel.searchResult.toggleHighlights(this.isVisible());
      aria.status(nls.localize("ariaSearchResultsStatus", "Search returned {0} results in {1} files", this.viewModel.searchResult.count(), this.viewModel.searchResult.fileCount()));
    }
    if (completed && completed.limitHit) {
      completed.messages.push({ type: TextSearchCompleteMessageType.Warning, text: nls.localize("searchMaxResultsWarning", "The result set only contains a subset of all matches. Be more specific in your search to narrow down the results.") });
    }
    if (completed && completed.messages) {
      for (const message of completed.messages) {
        this.addMessage(message);
      }
    }
    this.reLayout();
  }
  async onSearchError(e, progressComplete, excludePatternText, includePatternText, completed, shouldDoFinalRefresh = true) {
    this.state = SearchUIState.Idle;
    if (errors.isCancellationError(e)) {
      return this.onSearchComplete(progressComplete, excludePatternText, includePatternText, completed, shouldDoFinalRefresh);
    } else {
      progressComplete();
      this.searchWidget.searchInput?.showMessage({ content: e.message, type: MessageType.ERROR });
      this.viewModel.searchResult.clear();
      return Promise.resolve();
    }
  }
  clearAIResults() {
    this.model.searchResult.aiTextSearchResult.hidden = true;
    this.refreshTreeController.clearAllPending();
    this._pendingSemanticSearchPromise = void 0;
    this._cachedResults = void 0;
    this._cachedKeywords = [];
    this.model.cancelAISearch(true);
    this.model.clearAiSearchResults();
  }
  async requestAIResults() {
    this.logService.info(`SearchView: Requesting semantic results from keybinding. Cached: ${!!this.cachedResults}`);
    if ((!this.cachedResults || this.cachedResults.results.length === 0) && !this._pendingSemanticSearchPromise) {
      this.clearAIResults();
    }
    this.model.searchResult.aiTextSearchResult.hidden = false;
    await this.queueRefreshTree();
    await forcedExpandRecursively(this.getControl(), this.model.searchResult.aiTextSearchResult);
  }
  async addAIResults() {
    const excludePatternText = this._getExcludePattern();
    const includePatternText = this._getIncludePattern();
    this.searchWidget.searchInput?.clearMessage();
    this.showEmptyStage();
    this._visibleMatches = 0;
    this.tree.setSelection([]);
    this.tree.setFocus([]);
    this.viewModel.replaceString = this.searchWidget.getReplaceValue();
    let aiSearchPromise = this._pendingSemanticSearchPromise;
    if (!aiSearchPromise) {
      this.viewModel.searchResult.setAIQueryUsingTextQuery();
      aiSearchPromise = this._pendingSemanticSearchPromise = this.viewModel.aiSearch(() => {
        if (this._pendingSemanticSearchPromise === aiSearchPromise) {
          this._pendingSemanticSearchPromise = void 0;
        }
      });
    }
    aiSearchPromise.then((complete) => {
      this.updateSearchResultCount(this.viewModel.searchResult.query?.userDisabledExcludesAndIgnoreFiles, this.viewModel.searchResult.query?.onlyOpenEditors, false);
      return this.onSearchComplete(() => {
      }, excludePatternText, includePatternText, complete, false, complete.aiKeywords);
    }, (e) => {
      return this.onSearchError(e, () => {
      }, excludePatternText, includePatternText, void 0, false);
    });
  }
  doSearch(query, excludePatternText, includePatternText, triggeredOnType, shouldKeepAIResults, shouldUpdateAISearch) {
    let progressComplete;
    this.progressService.withProgress({ location: this.getProgressLocation(), delay: triggeredOnType ? 300 : 0 }, (_progress) => {
      return new Promise((resolve) => progressComplete = resolve);
    });
    this.searchWidget.searchInput?.clearMessage();
    this.state = SearchUIState.Searching;
    this.showEmptyStage();
    if (this.model.searchResult.aiTextSearchResult.hidden && shouldUpdateAISearch) {
      this.logService.info(`SearchView: Semantic search visible. Keep semantic results: ${shouldKeepAIResults}. Update semantic search: ${shouldUpdateAISearch}`);
      this.model.searchResult.aiTextSearchResult.hidden = false;
    }
    const slowTimer = setTimeout(() => {
      this.state = SearchUIState.SlowSearch;
    }, 2e3);
    this._visibleMatches = 0;
    this._refreshResultsScheduler.schedule();
    this.searchWidget.setReplaceAllActionState(false);
    this.tree.setSelection([]);
    this.tree.setFocus([]);
    this.viewModel.replaceString = this.searchWidget.getReplaceValue();
    const result = this.viewModel.search(query);
    if (!shouldKeepAIResults || shouldUpdateAISearch) {
      this.viewModel.searchResult.setAIQueryUsingTextQuery(query);
    }
    if (this.configurationService.getValue("search").searchView.keywordSuggestions) {
      this.getKeywordSuggestions();
    }
    return result.asyncResults.then((complete) => {
      clearTimeout(slowTimer);
      const config = this.configurationService.getValue("search").searchView.semanticSearchBehavior;
      if (complete.results.length === 0 && config === SemanticSearchBehavior.RunOnEmpty) {
        this.logService.info(`SearchView: Requesting semantic results on empty search.`);
        this.model.searchResult.aiTextSearchResult.hidden = false;
      }
      return this.onSearchComplete(progressComplete, excludePatternText, includePatternText, complete);
    }, (e) => {
      clearTimeout(slowTimer);
      return this.onSearchError(e, progressComplete, excludePatternText, includePatternText);
    });
  }
  onOpenSettings(e) {
    dom.EventHelper.stop(e, false);
    this.openSettings("@id:files.exclude,search.exclude,search.useParentIgnoreFiles,search.useGlobalIgnoreFiles,search.useIgnoreFiles");
  }
  openSettings(query) {
    const options = { query };
    return this.contextService.getWorkbenchState() !== WorkbenchState.EMPTY ? this.preferencesService.openWorkspaceSettings(options) : this.preferencesService.openUserSettings(options);
  }
  onSearchAgain() {
    this.inputPatternExcludes.setValue("");
    this.inputPatternIncludes.setValue("");
    this.inputPatternIncludes.setOnlySearchInOpenEditors(false);
    this.inputPatternIncludes.setOnlySearchInChangedFiles(false);
    this.triggerQueryChange({ preserveFocus: false });
  }
  onEnableExcludes() {
    this.toggleQueryDetails(false, true);
    this.searchExcludePattern.setUseExcludesAndIgnoreFiles(true);
  }
  onDisableSearchInOpenEditors() {
    this.toggleQueryDetails(false, true);
    this.inputPatternIncludes.setOnlySearchInOpenEditors(false);
  }
  updateSearchResultCount(disregardExcludesAndIgnores, onlyOpenEditors, clear = false) {
    if (this._cachedKeywords.length > 0) {
      return;
    }
    const fileCount = this.viewModel.searchResult.fileCount(this.viewModel.searchResult.aiTextSearchResult.hidden);
    const resultCount = this.viewModel.searchResult.count(this.viewModel.searchResult.aiTextSearchResult.hidden);
    this.hasSearchResultsKey.set(fileCount > 0);
    const msgWasHidden = this.messagesElement.style.display === "none";
    const messageEl = this.clearMessage();
    const resultMsg = clear ? "" : this.buildResultCountMessage(resultCount, fileCount);
    this.tree.ariaLabel = resultMsg + nls.localize("forTerm", " - Search: {0}", this.searchResult.query?.contentPattern.pattern ?? "");
    dom.append(messageEl, resultMsg);
    if (fileCount > 0) {
      if (disregardExcludesAndIgnores) {
        const excludesDisabledMessage = " - " + nls.localize("useIgnoresAndExcludesDisabled", "exclude settings and ignore files are disabled") + " ";
        const enableExcludesButton = this.messageDisposables.add(new SearchLinkButton(nls.localize("excludes.enable", "enable"), this.onEnableExcludes.bind(this), this.hoverService, nls.localize("useExcludesAndIgnoreFilesDescription", "Use Exclude Settings and Ignore Files")));
        dom.append(messageEl, $("span", void 0, excludesDisabledMessage, "(", enableExcludesButton.element, ")"));
      }
      if (onlyOpenEditors) {
        const searchingInOpenMessage = " - " + nls.localize("onlyOpenEditors", "searching only in open files") + " ";
        const disableOpenEditorsButton = this.messageDisposables.add(new SearchLinkButton(nls.localize("openEditors.disable", "disable"), this.onDisableSearchInOpenEditors.bind(this), this.hoverService, nls.localize("disableOpenEditors", "Search in entire workspace")));
        dom.append(messageEl, $("span", void 0, searchingInOpenMessage, "(", disableOpenEditorsButton.element, ")"));
      }
      dom.append(messageEl, " - ");
      const openInEditorTooltip = this.keybindingService.appendKeybinding(
        nls.localize("openInEditor.tooltip", "Copy current search results to an editor"),
        Constants.SearchCommandIds.OpenInEditorCommandId
      );
      const openInEditorButton = this.messageDisposables.add(new SearchLinkButton(
        nls.localize("openInEditor.message", "Open in editor"),
        () => this.instantiationService.invokeFunction(createEditorFromSearchResult, this.searchResult, this.searchIncludePattern.getValue(), this.searchExcludePattern.getValue(), this.searchIncludePattern.onlySearchInOpenEditors()),
        this.hoverService,
        openInEditorTooltip
      ));
      dom.append(messageEl, openInEditorButton.element);
      if (this.shouldShowAIResults()) {
        dom.append(messageEl, " - ");
        this.appendSearchWithAIButton(messageEl);
      }
      this.reLayout();
    } else if (!msgWasHidden) {
      dom.hide(this.messagesElement);
    }
  }
  handleKeywordClick(keyword, index) {
    this.searchWidget.searchInput?.setValue(keyword);
    this.triggerQueryChange({ preserveFocus: false, triggeredOnType: false, shouldKeepAIResults: false });
    this.telemetryService.publicLog2("searchKeywordClick", {
      index,
      maxKeywords: this._cachedKeywords.length
    });
  }
  updateKeywordSuggestionUI(keyword) {
    const element = this.messagesElement.firstChild;
    if (this._cachedKeywords.length > 0) {
      if (this._cachedKeywords.length >= 3) {
        return;
      }
      dom.append(element, ", ");
      const index = this._cachedKeywords.length;
      const button = this.messageDisposables.add(new SearchLinkButton(
        keyword.keyword,
        () => this.handleKeywordClick(keyword.keyword, index),
        this.hoverService
      ));
      dom.append(element, button.element);
    } else {
      const messageEl = this.clearMessage();
      messageEl.classList.add("ai-keywords");
      const resultMsg = nls.localize("keywordSuggestion.message", "Search instead for: ");
      dom.append(messageEl, resultMsg);
      const button = this.messageDisposables.add(new SearchLinkButton(
        keyword.keyword,
        () => this.handleKeywordClick(keyword.keyword, 0),
        this.hoverService
      ));
      dom.append(messageEl, button.element);
    }
    this._cachedKeywords.push(keyword.keyword);
  }
  async getKeywordSuggestions() {
    let aiSearchPromise = this._pendingSemanticSearchPromise;
    if (!aiSearchPromise) {
      this.viewModel.searchResult.setAIQueryUsingTextQuery();
      aiSearchPromise = this._pendingSemanticSearchPromise = this.viewModel.aiSearch((result) => {
        if (result && isAIKeyword(result)) {
          this.updateKeywordSuggestionUI(result);
          return;
        }
        if (this._pendingSemanticSearchPromise === aiSearchPromise) {
          this._pendingSemanticSearchPromise = void 0;
        }
      });
    }
    this._cachedResults = await aiSearchPromise;
  }
  addMessage(message) {
    const messageBox = this.messagesElement.firstChild;
    if (!messageBox) {
      return;
    }
    dom.append(messageBox, renderSearchMessage(message, this.instantiationService, this.notificationService, this.openerService, this.commandService, this.messageDisposables, () => this.triggerQueryChange()));
  }
  buildResultCountMessage(resultCount, fileCount) {
    if (resultCount === 1 && fileCount === 1) {
      return nls.localize("search.file.result", "{0} result in {1} file", resultCount, fileCount);
    } else if (resultCount === 1) {
      return nls.localize("search.files.result", "{0} result in {1} files", resultCount, fileCount);
    } else if (fileCount === 1) {
      return nls.localize("search.file.results", "{0} results in {1} file", resultCount, fileCount);
    } else {
      return nls.localize("search.files.results", "{0} results in {1} files", resultCount, fileCount);
    }
  }
  showSearchWithoutFolderMessage() {
    this.searchWithoutFolderMessageElement = this.clearMessage();
    const textEl = dom.append(
      this.searchWithoutFolderMessageElement,
      $("p", void 0, nls.localize("searchWithoutFolder", "You have not opened or specified a folder. Only open files are currently searched - "))
    );
    const openFolderButton = this.messageDisposables.add(new SearchLinkButton(
      nls.localize("openFolder", "Open Folder"),
      () => {
        this.commandService.executeCommand(OpenFolderAction.ID).catch((err) => errors.onUnexpectedError(err));
      },
      this.hoverService
    ));
    dom.append(textEl, openFolderButton.element);
  }
  showEmptyStage(forceHideMessages = false) {
    const showingCancelled = (this.messagesElement.firstChild?.textContent?.indexOf(SEARCH_CANCELLED_MESSAGE) ?? -1) > -1;
    if (showingCancelled || forceHideMessages || !this.configurationService.getValue().search?.searchOnType) {
      dom.hide(this.messagesElement);
    }
    dom.show(this.resultsElement);
    this.currentSelectedFileMatch = void 0;
  }
  shouldOpenInNotebookEditor(match, uri) {
    return isIMatchInNotebook(match) || uri.scheme !== network.Schemas.untitled && this.notebookService.getContributedNotebookTypes(uri).length > 0;
  }
  onFocus(lineMatch, preserveFocus, sideBySide, pinned) {
    const useReplacePreview = this.configurationService.getValue().search?.useReplacePreview;
    const resource = isSearchTreeMatch(lineMatch) ? lineMatch.parent().resource : lineMatch.resource;
    return useReplacePreview && this.viewModel.isReplaceActive() && !!this.viewModel.replaceString && !this.shouldOpenInNotebookEditor(lineMatch, resource) ? this.replaceService.openReplacePreview(lineMatch, preserveFocus, sideBySide, pinned) : this.open(lineMatch, preserveFocus, sideBySide, pinned, resource);
  }
  async open(element, preserveFocus, sideBySide, pinned, resourceInput) {
    const selection = getEditorSelectionFromMatch(element, this.viewModel);
    const oldParentMatches = isSearchTreeMatch(element) ? element.parent().matches() : [];
    const resource = resourceInput ?? (isSearchTreeMatch(element) ? element.parent().resource : element.resource);
    let editor;
    const options = {
      preserveFocus,
      pinned,
      selection,
      revealIfVisible: true
    };
    try {
      editor = await this.editorService.openEditor({
        resource,
        options
      }, sideBySide ? SIDE_GROUP : ACTIVE_GROUP);
      const editorControl = editor?.getControl();
      if (isSearchTreeMatch(element) && preserveFocus && isCodeEditor(editorControl)) {
        this.viewModel.searchResult.getRangeHighlightDecorations().highlightRange(
          editorControl.getModel(),
          element.range()
        );
      } else {
        this.viewModel.searchResult.getRangeHighlightDecorations().removeHighlightRange();
      }
    } catch (err) {
      errors.onUnexpectedError(err);
      return;
    }
    if (editor instanceof NotebookEditor) {
      const elemParent = element.parent();
      if (isSearchTreeMatch(element)) {
        if (isIMatchInNotebook(element)) {
          element.parent().showMatch(element);
        } else {
          const editorWidget = editor.getControl();
          if (editorWidget) {
            elemParent.bindNotebookEditorWidget(editorWidget);
            await elemParent.updateMatchesForEditorWidget();
            const matchIndex = oldParentMatches.findIndex((e) => e.id() === element.id());
            const matches = elemParent.matches();
            const match = matchIndex >= matches.length ? matches[matches.length - 1] : matches[matchIndex];
            if (isIMatchInNotebook(match)) {
              elemParent.showMatch(match);
              if (!this.tree.getFocus().includes(match) || !this.tree.getSelection().includes(match)) {
                this.tree.setSelection([match], getSelectionKeyboardEvent());
                this.tree.setFocus([match]);
              }
            }
          }
        }
      }
    }
  }
  openEditorWithMultiCursor(element) {
    const resource = isSearchTreeMatch(element) ? element.parent().resource : element.resource;
    return this.editorService.openEditor({
      resource,
      options: {
        preserveFocus: false,
        pinned: true,
        revealIfVisible: true
      }
    }).then((editor) => {
      if (editor) {
        let fileMatch = null;
        if (isSearchTreeFileMatch(element)) {
          fileMatch = element;
        } else if (isSearchTreeMatch(element)) {
          fileMatch = element.parent();
        }
        if (fileMatch) {
          const selections = fileMatch.matches().map((m) => new Selection(m.range().startLineNumber, m.range().startColumn, m.range().endLineNumber, m.range().endColumn));
          const codeEditor = getCodeEditor(editor.getControl());
          if (codeEditor) {
            const multiCursorController = MultiCursorSelectionController.get(codeEditor);
            multiCursorController?.selectAllUsingSelections(selections);
          }
        }
      }
      this.viewModel.searchResult.getRangeHighlightDecorations().removeHighlightRange();
    }, errors.onUnexpectedError);
  }
  onUntitledDidDispose(resource) {
    if (!this.viewModel) {
      return;
    }
    let matches = this.viewModel.searchResult.matches();
    for (let i = 0, len = matches.length; i < len; i++) {
      if (resource.toString() === matches[i].resource.toString()) {
        this.viewModel.searchResult.remove(matches[i]);
      }
    }
    matches = this.viewModel.searchResult.matches(true);
    for (let i = 0, len = matches.length; i < len; i++) {
      if (resource.toString() === matches[i].resource.toString()) {
        this.viewModel.searchResult.remove(matches[i]);
      }
    }
  }
  onFilesChanged(e) {
    if (!this.viewModel || this.searchConfig.sortOrder !== SearchSortOrder.Modified && !e.gotDeleted()) {
      return;
    }
    const matches = this.viewModel.searchResult.matches();
    if (e.gotDeleted()) {
      const deletedMatches = matches.filter((m) => e.contains(m.resource, FileChangeType.DELETED));
      this.viewModel.searchResult.remove(deletedMatches);
    } else {
      const changedMatches = matches.filter((m) => e.contains(m.resource));
      if (changedMatches.length && this.searchConfig.sortOrder === SearchSortOrder.Modified) {
        this.updateFileStats(changedMatches).then(async () => this.refreshTreeController.queue());
      }
    }
  }
  get searchConfig() {
    return this.configurationService.getValue("search");
  }
  clearHistory() {
    this.searchWidget.clearHistory();
    this.inputPatternExcludes.clearHistory();
    this.inputPatternIncludes.clearHistory();
  }
  saveState() {
    if (!this.searchWidget) {
      return;
    }
    const patternExcludes = this.inputPatternExcludes?.getValue().trim() ?? "";
    const patternIncludes = this.inputPatternIncludes?.getValue().trim() ?? "";
    const onlyOpenEditors = this.inputPatternIncludes?.onlySearchInOpenEditors() ?? false;
    const useExcludesAndIgnoreFiles = this.inputPatternExcludes?.useExcludesAndIgnoreFiles() ?? true;
    const preserveCase = this.viewModel.preserveCase;
    if (!this.viewletState.query) {
      this.viewletState.query = {};
    }
    if (this.searchWidget.searchInput) {
      const isRegex = this.searchWidget.searchInput.getRegex();
      const isWholeWords = this.searchWidget.searchInput.getWholeWords();
      const isCaseSensitive = this.searchWidget.searchInput.getCaseSensitive();
      const contentPattern = this.searchWidget.searchInput.getValue();
      const isInNotebookCellInput = this.searchWidget.getNotebookFilters().codeInput;
      const isInNotebookCellOutput = this.searchWidget.getNotebookFilters().codeOutput;
      const isInNotebookMarkdownInput = this.searchWidget.getNotebookFilters().markupInput;
      const isInNotebookMarkdownPreview = this.searchWidget.getNotebookFilters().markupPreview;
      this.viewletState.query.contentPattern = contentPattern;
      this.viewletState.query.regex = isRegex;
      this.viewletState.query.wholeWords = isWholeWords;
      this.viewletState.query.caseSensitive = isCaseSensitive;
      this.viewletState.query.isInNotebookMarkdownInput = isInNotebookMarkdownInput;
      this.viewletState.query.isInNotebookMarkdownPreview = isInNotebookMarkdownPreview;
      this.viewletState.query.isInNotebookCellInput = isInNotebookCellInput;
      this.viewletState.query.isInNotebookCellOutput = isInNotebookCellOutput;
    }
    this.viewletState.query.folderExclusions = patternExcludes;
    this.viewletState.query.folderIncludes = patternIncludes;
    this.viewletState.query.useExcludesAndIgnoreFiles = useExcludesAndIgnoreFiles;
    this.viewletState.query.preserveCase = preserveCase;
    this.viewletState.query.onlyOpenEditors = onlyOpenEditors;
    const isReplaceShown = this.searchAndReplaceWidget.isReplaceShown();
    if (!this.viewletState.view) {
      this.viewletState.view = {};
    }
    this.viewletState.view.showReplace = isReplaceShown;
    this.viewletState.view.treeLayout = this.isTreeLayoutViewVisible;
    this.viewletState.query.replaceText = isReplaceShown && this.searchWidget.getReplaceValue();
    this._saveSearchHistoryService();
    this.memento.saveMemento();
    super.saveState();
  }
  _saveSearchHistoryService() {
    if (this.searchWidget === void 0) {
      return;
    }
    const history = /* @__PURE__ */ Object.create(null);
    const searchHistory = this.searchWidget.getSearchHistory();
    if (searchHistory && searchHistory.length) {
      history.search = searchHistory;
    }
    const replaceHistory = this.searchWidget.getReplaceHistory();
    if (replaceHistory && replaceHistory.length) {
      history.replace = replaceHistory;
    }
    const patternExcludesHistory = this.inputPatternExcludes.getHistory();
    if (patternExcludesHistory && patternExcludesHistory.length) {
      history.exclude = patternExcludesHistory;
    }
    const patternIncludesHistory = this.inputPatternIncludes.getHistory();
    if (patternIncludesHistory && patternIncludesHistory.length) {
      history.include = patternIncludesHistory;
    }
    this.searchHistoryService.save(history);
  }
  async updateFileStats(elements) {
    const files = elements.map((f) => f.resolveFileStat(this.fileService));
    await Promise.all(files);
  }
  removeFileStats() {
    for (const fileMatch of this.searchResult.matches()) {
      fileMatch.fileStat = void 0;
    }
    for (const fileMatch of this.searchResult.matches(true)) {
      fileMatch.fileStat = void 0;
    }
  }
  dispose() {
    this.isDisposed = true;
    this.saveState();
    super.dispose();
  }
};
SearchView.ACTIONS_RIGHT_CLASS_NAME = "actions-right";
SearchView = __decorateClass([
  __decorateParam(1, IFileService),
  __decorateParam(2, IEditorService),
  __decorateParam(3, ICodeEditorService),
  __decorateParam(4, IProgressService),
  __decorateParam(5, INotificationService),
  __decorateParam(6, IDialogService),
  __decorateParam(7, ICommandService),
  __decorateParam(8, IContextViewService),
  __decorateParam(9, IInstantiationService),
  __decorateParam(10, IViewDescriptorService),
  __decorateParam(11, IConfigurationService),
  __decorateParam(12, IWorkspaceContextService),
  __decorateParam(13, ISearchViewModelWorkbenchService),
  __decorateParam(14, IContextKeyService),
  __decorateParam(15, IReplaceService),
  __decorateParam(16, ITextFileService),
  __decorateParam(17, IPreferencesService),
  __decorateParam(18, IThemeService),
  __decorateParam(19, ISearchHistoryService),
  __decorateParam(20, IContextMenuService),
  __decorateParam(21, IAccessibilityService),
  __decorateParam(22, IKeybindingService),
  __decorateParam(23, IStorageService),
  __decorateParam(24, IOpenerService),
  __decorateParam(25, IHoverService),
  __decorateParam(26, INotebookService),
  __decorateParam(27, ILogService),
  __decorateParam(28, IAccessibilitySignalService),
  __decorateParam(29, ITelemetryService),
  __decorateParam(30, ISCMService)
], SearchView);
class SearchLinkButton extends Disposable {
  constructor(label, handler, hoverService, tooltip) {
    super();
    this.element = $("a.pointer", { tabindex: 0 }, label);
    this._register(hoverService.setupManagedHover(getDefaultHoverDelegate("mouse"), this.element, tooltip));
    this.addEventHandlers(handler);
  }
  addEventHandlers(handler) {
    const wrappedHandler = (e) => {
      dom.EventHelper.stop(e, false);
      handler(e);
    };
    this._register(dom.addDisposableListener(this.element, dom.EventType.CLICK, wrappedHandler));
    this._register(dom.addDisposableListener(this.element, dom.EventType.KEY_DOWN, (e) => {
      const event = new StandardKeyboardEvent(e);
      if (event.equals(KeyCode.Space) || event.equals(KeyCode.Enter)) {
        wrappedHandler(e);
        event.preventDefault();
        event.stopPropagation();
      }
    }));
  }
}
function getEditorSelectionFromMatch(element, viewModel) {
  let match = null;
  if (isSearchTreeMatch(element)) {
    match = element;
  }
  if (isSearchTreeFileMatch(element) && element.count() > 0) {
    match = element.matches()[element.matches().length - 1];
  }
  if (match) {
    const range = match.range();
    if (viewModel.isReplaceActive() && !!viewModel.replaceString) {
      const replaceString = match.replaceString;
      return {
        startLineNumber: range.startLineNumber,
        startColumn: range.startColumn,
        endLineNumber: range.startLineNumber,
        endColumn: range.startColumn + replaceString.length
      };
    }
    return range;
  }
  return void 0;
}
function getSelectionTextFromEditor(allowUnselectedWord, activeEditor) {
  let editor = activeEditor;
  if (isDiffEditor(editor)) {
    if (editor.getOriginalEditor().hasTextFocus()) {
      editor = editor.getOriginalEditor();
    } else {
      editor = editor.getModifiedEditor();
    }
  }
  if (!isCodeEditor(editor) || !editor.hasModel()) {
    return null;
  }
  const range = editor.getSelection();
  if (!range) {
    return null;
  }
  if (range.isEmpty()) {
    if (allowUnselectedWord) {
      const wordAtPosition = editor.getModel().getWordAtPosition(range.getStartPosition());
      return wordAtPosition?.word ?? null;
    } else {
      return null;
    }
  }
  let searchText = "";
  for (let i = range.startLineNumber; i <= range.endLineNumber; i++) {
    let lineText = editor.getModel().getLineContent(i);
    if (i === range.endLineNumber) {
      lineText = lineText.substring(0, range.endColumn - 1);
    }
    if (i === range.startLineNumber) {
      lineText = lineText.substring(range.startColumn - 1);
    }
    if (i !== range.startLineNumber) {
      lineText = "\n" + lineText;
    }
    searchText += lineText;
  }
  return searchText;
}
let SearchViewDataSource = class {
  constructor(searchView, configurationService) {
    this.searchView = searchView;
    this.configurationService = configurationService;
  }
  get searchConfig() {
    return this.configurationService.getValue("search");
  }
  createSearchResultIterator(searchResult) {
    const ret = [];
    if (this.searchView.shouldShowAIResults() && searchResult.searchModel.hasPlainResults && !searchResult.aiTextSearchResult.hidden) {
      ret.push(searchResult.aiTextSearchResult);
    }
    if (!searchResult.plainTextSearchResult.isEmpty()) {
      if (!this.searchView.shouldShowAIResults() || searchResult.aiTextSearchResult.hidden) {
        return this.createTextSearchResultIterator(searchResult.plainTextSearchResult);
      }
      ret.push(searchResult.plainTextSearchResult);
    }
    return ret;
  }
  createTextSearchResultIterator(textSearchResult) {
    const folderMatches = textSearchResult.folderMatches().filter((fm) => !fm.isEmpty()).sort(searchMatchComparer);
    if (folderMatches.length === 1) {
      return this.createFolderIterator(folderMatches[0]);
    }
    return folderMatches;
  }
  createFolderIterator(folderMatch) {
    const matchArray = this.searchView.isTreeLayoutViewVisible ? folderMatch.matches() : folderMatch.allDownstreamFileMatches();
    let matches = matchArray;
    if (!(folderMatch instanceof AIFolderMatchWorkspaceRootImpl)) {
      matches = matchArray.sort((a, b) => searchMatchComparer(a, b, this.searchConfig.sortOrder));
    }
    return matches;
  }
  createFileIterator(fileMatch) {
    const matches = fileMatch.matches().sort(searchMatchComparer);
    return matches;
  }
  hasChildren(element) {
    if (isSearchTreeMatch(element)) {
      return false;
    }
    if (isTextSearchHeading(element) && element.isAIContributed) {
      return true;
    }
    const hasChildren = element.hasChildren;
    return hasChildren;
  }
  getChildren(element) {
    if (isSearchResult(element)) {
      return this.createSearchResultIterator(element);
    } else if (isTextSearchHeading(element)) {
      if (element.isAIContributed && (!this.searchView.model.hasAIResults || !!this.searchView._pendingSemanticSearchPromise)) {
        if (this.searchView.cachedResults) {
          return this.createTextSearchResultIterator(element);
        }
        this.searchView.addAIResults();
        return new Promise((resolve) => {
          const disposable = element.onChange(() => {
            disposable.dispose();
            resolve(this.createTextSearchResultIterator(element));
          });
        });
      }
      return this.createTextSearchResultIterator(element);
    } else if (isSearchTreeFolderMatch(element)) {
      return this.createFolderIterator(element);
    } else if (isSearchTreeFileMatch(element)) {
      return this.createFileIterator(element);
    }
    return [];
  }
  getParent(element) {
    const parent = element.parent();
    if (isSearchResult(parent)) {
      throw new Error("Invalid element passed to getParent");
    }
    return parent;
  }
};
SearchViewDataSource = __decorateClass([
  __decorateParam(1, IConfigurationService)
], SearchViewDataSource);
let RefreshTreeController = class extends Disposable {
  constructor(searchView, geSearchConfig, fileService) {
    super();
    this.searchView = searchView;
    this.geSearchConfig = geSearchConfig;
    this.fileService = fileService;
    this.queuedIChangeEvents = [];
    this.refreshTreeThrottler = this._register(new Throttler());
  }
  clearAllPending() {
    this.searchView.getControl().cancelAllRefreshPromises(true);
  }
  async queue(e) {
    if (e) {
      this.queuedIChangeEvents.push(e);
    }
    return this.refreshTreeThrottler.queue(this.refreshTreeUsingQueue.bind(this));
  }
  async refreshTreeUsingQueue() {
    const aggregateChangeEvent = this.queuedIChangeEvents.length === 0 ? void 0 : {
      elements: this.queuedIChangeEvents.map((e) => e.elements).flat(),
      added: this.queuedIChangeEvents.some((e) => e.added),
      removed: this.queuedIChangeEvents.some((e) => e.removed),
      clearingAll: this.queuedIChangeEvents.some((e) => e.clearingAll)
    };
    this.queuedIChangeEvents = [];
    return this.refreshTree(aggregateChangeEvent);
  }
  async retrieveFileStats() {
    const files = this.searchView.model.searchResult.matches().filter((f) => !f.fileStat).map((f) => f.resolveFileStat(this.fileService));
    await Promise.all(files);
  }
  async refreshTree(event) {
    const searchConfig = this.geSearchConfig();
    if (!event || event.added || event.removed) {
      if (searchConfig.sortOrder === SearchSortOrder.Modified) {
        await this.retrieveFileStats().then(() => this.searchView.getControl().updateChildren(void 0));
      } else {
        await this.searchView.getControl().updateChildren(void 0);
      }
    } else {
      if (searchConfig.sortOrder === SearchSortOrder.CountAscending || searchConfig.sortOrder === SearchSortOrder.CountDescending) {
        await this.searchView.getControl().updateChildren(void 0);
      } else {
        const treeHasAllElements = event.elements.every((elem) => this.searchView.getControl().hasNode(elem));
        if (treeHasAllElements) {
          await Promise.all(event.elements.map(async (element) => {
            await this.searchView.getControl().updateChildren(element);
            this.searchView.getControl().rerender(element);
          }));
        } else {
          this.searchView.getControl().updateChildren(void 0);
        }
      }
    }
  }
};
RefreshTreeController = __decorateClass([
  __decorateParam(2, IFileService)
], RefreshTreeController);
export {
  SearchView,
  SearchViewPosition,
  getEditorSelectionFromMatch,
  getSelectionTextFromEditor
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXHNlYXJjaFxcYnJvd3Nlclxcc2VhcmNoVmlldy50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCAqIGFzIGRvbSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvZG9tLmpzJztcbmltcG9ydCB7IFN0YW5kYXJkS2V5Ym9hcmRFdmVudCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci9rZXlib2FyZEV2ZW50LmpzJztcbmltcG9ydCAqIGFzIGFyaWEgZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL3VpL2FyaWEvYXJpYS5qcyc7XG5pbXBvcnQgeyBNZXNzYWdlVHlwZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci91aS9pbnB1dGJveC9pbnB1dEJveC5qcyc7XG5pbXBvcnQgeyBJSWRlbnRpdHlQcm92aWRlciB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci91aS9saXN0L2xpc3QuanMnO1xuaW1wb3J0IHsgSUFzeW5jRGF0YVNvdXJjZSwgSVRyZWVDb250ZXh0TWVudUV2ZW50LCBPYmplY3RUcmVlRWxlbWVudENvbGxhcHNlU3RhdGUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvdWkvdHJlZS90cmVlLmpzJztcbmltcG9ydCB7IERlbGF5ZXIsIFJ1bk9uY2VTY2hlZHVsZXIsIFRocm90dGxlciB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2FzeW5jLmpzJztcbmltcG9ydCAqIGFzIGVycm9ycyBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9lcnJvcnMuanMnO1xuaW1wb3J0IHsgRXZlbnQgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9ldmVudC5qcyc7XG5pbXBvcnQgeyBLZXlDb2RlLCBLZXlNb2QgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9rZXlDb2Rlcy5qcyc7XG5pbXBvcnQgeyBEaXNwb3NhYmxlLCBEaXNwb3NhYmxlTWFwLCBEaXNwb3NhYmxlU3RvcmUsIElEaXNwb3NhYmxlLCBNdXRhYmxlRGlzcG9zYWJsZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBpc0xpbnV4IH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vcGxhdGZvcm0uanMnO1xuaW1wb3J0ICogYXMgc3RyaW5ncyBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9zdHJpbmdzLmpzJztcbmltcG9ydCB7IFVSSSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3VyaS5qcyc7XG5pbXBvcnQgKiBhcyBuZXR3b3JrIGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL25ldHdvcmsuanMnO1xuaW1wb3J0ICcuL21lZGlhL3NlYXJjaHZpZXcuY3NzJztcbmltcG9ydCB7IGdldENvZGVFZGl0b3IsIGlzQ29kZUVkaXRvciwgaXNEaWZmRWRpdG9yIH0gZnJvbSAnLi4vLi4vLi4vLi4vZWRpdG9yL2Jyb3dzZXIvZWRpdG9yQnJvd3Nlci5qcyc7XG5pbXBvcnQgeyBJQ29kZUVkaXRvclNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9lZGl0b3IvYnJvd3Nlci9zZXJ2aWNlcy9jb2RlRWRpdG9yU2VydmljZS5qcyc7XG5pbXBvcnQgeyBFbWJlZGRlZENvZGVFZGl0b3JXaWRnZXQgfSBmcm9tICcuLi8uLi8uLi8uLi9lZGl0b3IvYnJvd3Nlci93aWRnZXQvY29kZUVkaXRvci9lbWJlZGRlZENvZGVFZGl0b3JXaWRnZXQuanMnO1xuaW1wb3J0IHsgSUVkaXRvck9wdGlvbnMgfSBmcm9tICcuLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL2NvbmZpZy9lZGl0b3JPcHRpb25zLmpzJztcbmltcG9ydCB7IFNlbGVjdGlvbiB9IGZyb20gJy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vY29yZS9zZWxlY3Rpb24uanMnO1xuaW1wb3J0IHsgSUVkaXRvciB9IGZyb20gJy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vZWRpdG9yQ29tbW9uLmpzJztcbmltcG9ydCB7IENvbW1vbkZpbmRDb250cm9sbGVyIH0gZnJvbSAnLi4vLi4vLi4vLi4vZWRpdG9yL2NvbnRyaWIvZmluZC9icm93c2VyL2ZpbmRDb250cm9sbGVyLmpzJztcbmltcG9ydCB7IE11bHRpQ3Vyc29yU2VsZWN0aW9uQ29udHJvbGxlciB9IGZyb20gJy4uLy4uLy4uLy4uL2VkaXRvci9jb250cmliL211bHRpY3Vyc29yL2Jyb3dzZXIvbXVsdGljdXJzb3IuanMnO1xuaW1wb3J0ICogYXMgbmxzIGZyb20gJy4uLy4uLy4uLy4uL25scy5qcyc7XG5pbXBvcnQgeyBJQWNjZXNzaWJpbGl0eVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9hY2Nlc3NpYmlsaXR5L2NvbW1vbi9hY2Nlc3NpYmlsaXR5LmpzJztcbmltcG9ydCB7IE1lbnVJZCB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2FjdGlvbnMvY29tbW9uL2FjdGlvbnMuanMnO1xuaW1wb3J0IHsgSUNvbW1hbmRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29tbWFuZHMvY29tbW9uL2NvbW1hbmRzLmpzJztcbmltcG9ydCB7IElDb25maWd1cmF0aW9uQ2hhbmdlRXZlbnQsIElDb25maWd1cmF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbmZpZ3VyYXRpb24vY29tbW9uL2NvbmZpZ3VyYXRpb24uanMnO1xuaW1wb3J0IHsgSUNvbnRleHRLZXksIElDb250ZXh0S2V5U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbnRleHRrZXkvY29tbW9uL2NvbnRleHRrZXkuanMnO1xuaW1wb3J0IHsgSUNvbnRleHRNZW51U2VydmljZSwgSUNvbnRleHRWaWV3U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbnRleHR2aWV3L2Jyb3dzZXIvY29udGV4dFZpZXcuanMnO1xuaW1wb3J0IHsgSUNvbmZpcm1hdGlvbiwgSURpYWxvZ1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9kaWFsb2dzL2NvbW1vbi9kaWFsb2dzLmpzJztcbmltcG9ydCB7IEZpbGVDaGFuZ2VzRXZlbnQsIEZpbGVDaGFuZ2VUeXBlLCBJRmlsZVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9maWxlcy9jb21tb24vZmlsZXMuanMnO1xuaW1wb3J0IHsgSUluc3RhbnRpYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vaW5zdGFudGlhdGlvbi9jb21tb24vaW5zdGFudGlhdGlvbi5qcyc7XG5pbXBvcnQgeyBTZXJ2aWNlQ29sbGVjdGlvbiB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2luc3RhbnRpYXRpb24vY29tbW9uL3NlcnZpY2VDb2xsZWN0aW9uLmpzJztcbmltcG9ydCB7IElLZXliaW5kaW5nU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2tleWJpbmRpbmcvY29tbW9uL2tleWJpbmRpbmcuanMnO1xuaW1wb3J0IHsgZ2V0U2VsZWN0aW9uS2V5Ym9hcmRFdmVudCwgV29ya2JlbmNoQ29tcHJlc3NpYmxlQXN5bmNEYXRhVHJlZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2xpc3QvYnJvd3Nlci9saXN0U2VydmljZS5qcyc7XG5pbXBvcnQgeyBJTm90aWZpY2F0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL25vdGlmaWNhdGlvbi9jb21tb24vbm90aWZpY2F0aW9uLmpzJztcbmltcG9ydCB7IElPcGVuZXJTZXJ2aWNlLCB3aXRoU2VsZWN0aW9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vb3BlbmVyL2NvbW1vbi9vcGVuZXIuanMnO1xuaW1wb3J0IHsgSVByb2dyZXNzLCBJUHJvZ3Jlc3NTZXJ2aWNlLCBJUHJvZ3Jlc3NTdGVwIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vcHJvZ3Jlc3MvY29tbW9uL3Byb2dyZXNzLmpzJztcbmltcG9ydCB7IElTdG9yYWdlU2VydmljZSwgU3RvcmFnZVNjb3BlLCBTdG9yYWdlVGFyZ2V0IH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vc3RvcmFnZS9jb21tb24vc3RvcmFnZS5qcyc7XG5pbXBvcnQgeyBkZWZhdWx0SW5wdXRCb3hTdHlsZXMsIGRlZmF1bHRUb2dnbGVTdHlsZXMgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS90aGVtZS9icm93c2VyL2RlZmF1bHRTdHlsZXMuanMnO1xuaW1wb3J0IHsgSUZpbGVJY29uVGhlbWUsIElUaGVtZVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS90aGVtZS9jb21tb24vdGhlbWVTZXJ2aWNlLmpzJztcbmltcG9ydCB7IFRoZW1lSWNvbiB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3RoZW1hYmxlcy5qcyc7XG5pbXBvcnQgeyBJV29ya3NwYWNlQ29udGV4dFNlcnZpY2UsIFdvcmtiZW5jaFN0YXRlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vd29ya3NwYWNlL2NvbW1vbi93b3Jrc3BhY2UuanMnO1xuaW1wb3J0IHsgT3BlbkZvbGRlckFjdGlvbiB9IGZyb20gJy4uLy4uLy4uL2Jyb3dzZXIvYWN0aW9ucy93b3Jrc3BhY2VBY3Rpb25zLmpzJztcbmltcG9ydCB7IFJlc291cmNlTGlzdERuREhhbmRsZXIgfSBmcm9tICcuLi8uLi8uLi9icm93c2VyL2RuZC5qcyc7XG5pbXBvcnQgeyBSZXNvdXJjZUxhYmVscyB9IGZyb20gJy4uLy4uLy4uL2Jyb3dzZXIvbGFiZWxzLmpzJztcbmltcG9ydCB7IElWaWV3UGFuZU9wdGlvbnMsIFZpZXdQYW5lIH0gZnJvbSAnLi4vLi4vLi4vYnJvd3Nlci9wYXJ0cy92aWV3cy92aWV3UGFuZS5qcyc7XG5pbXBvcnQgeyBJRWRpdG9yUGFuZSB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9lZGl0b3IuanMnO1xuaW1wb3J0IHsgTWVtZW50byB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9tZW1lbnRvLmpzJztcbmltcG9ydCB7IElWaWV3RGVzY3JpcHRvclNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vdmlld3MuanMnO1xuaW1wb3J0IHsgTm90ZWJvb2tFZGl0b3IgfSBmcm9tICcuLi8uLi9ub3RlYm9vay9icm93c2VyL25vdGVib29rRWRpdG9yLmpzJztcbmltcG9ydCB7IEV4Y2x1ZGVQYXR0ZXJuSW5wdXRXaWRnZXQsIEluY2x1ZGVQYXR0ZXJuSW5wdXRXaWRnZXQgfSBmcm9tICcuL3BhdHRlcm5JbnB1dFdpZGdldC5qcyc7XG5pbXBvcnQgeyBJRmluZEluRmlsZXNBcmdzIH0gZnJvbSAnLi9zZWFyY2hBY3Rpb25zQmFzZS5qcyc7XG5pbXBvcnQgeyBzZWFyY2hEZXRhaWxzSWNvbiB9IGZyb20gJy4vc2VhcmNoSWNvbnMuanMnO1xuaW1wb3J0IHsgcmVuZGVyU2VhcmNoTWVzc2FnZSB9IGZyb20gJy4vc2VhcmNoTWVzc2FnZS5qcyc7XG5pbXBvcnQgeyBGaWxlTWF0Y2hSZW5kZXJlciwgRm9sZGVyTWF0Y2hSZW5kZXJlciwgTWF0Y2hSZW5kZXJlciwgU2VhcmNoQWNjZXNzaWJpbGl0eVByb3ZpZGVyLCBTZWFyY2hEZWxlZ2F0ZSwgVGV4dFNlYXJjaFJlc3VsdFJlbmRlcmVyIH0gZnJvbSAnLi9zZWFyY2hSZXN1bHRzVmlldy5qcyc7XG5pbXBvcnQgeyBTZWFyY2hXaWRnZXQgfSBmcm9tICcuL3NlYXJjaFdpZGdldC5qcyc7XG5pbXBvcnQgKiBhcyBDb25zdGFudHMgZnJvbSAnLi4vY29tbW9uL2NvbnN0YW50cy5qcyc7XG5pbXBvcnQgeyBJUmVwbGFjZVNlcnZpY2UgfSBmcm9tICcuL3JlcGxhY2UuanMnO1xuaW1wb3J0IHsgZ2V0T3V0T2ZXb3Jrc3BhY2VFZGl0b3JSZXNvdXJjZXMsIFNlYXJjaFN0YXRlS2V5LCBTZWFyY2hVSVN0YXRlIH0gZnJvbSAnLi4vY29tbW9uL3NlYXJjaC5qcyc7XG5pbXBvcnQgeyBJU2VhcmNoSGlzdG9yeVNlcnZpY2UsIElTZWFyY2hIaXN0b3J5VmFsdWVzLCBTZWFyY2hIaXN0b3J5U2VydmljZSB9IGZyb20gJy4uL2NvbW1vbi9zZWFyY2hIaXN0b3J5U2VydmljZS5qcyc7XG5pbXBvcnQgeyBjcmVhdGVFZGl0b3JGcm9tU2VhcmNoUmVzdWx0IH0gZnJvbSAnLi4vLi4vc2VhcmNoRWRpdG9yL2Jyb3dzZXIvc2VhcmNoRWRpdG9yQWN0aW9ucy5qcyc7XG5pbXBvcnQgeyBBQ1RJVkVfR1JPVVAsIElFZGl0b3JTZXJ2aWNlLCBTSURFX0dST1VQIH0gZnJvbSAnLi4vLi4vLi4vc2VydmljZXMvZWRpdG9yL2NvbW1vbi9lZGl0b3JTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElQcmVmZXJlbmNlc1NlcnZpY2UsIElTZXR0aW5nc0VkaXRvck9wdGlvbnMgfSBmcm9tICcuLi8uLi8uLi9zZXJ2aWNlcy9wcmVmZXJlbmNlcy9jb21tb24vcHJlZmVyZW5jZXMuanMnO1xuaW1wb3J0IHsgSVRleHRRdWVyeUJ1aWxkZXJPcHRpb25zLCBRdWVyeUJ1aWxkZXIgfSBmcm9tICcuLi8uLi8uLi9zZXJ2aWNlcy9zZWFyY2gvY29tbW9uL3F1ZXJ5QnVpbGRlci5qcyc7XG5pbXBvcnQgeyBTZW1hbnRpY1NlYXJjaEJlaGF2aW9yLCBJUGF0dGVybkluZm8sIElTZWFyY2hDb21wbGV0ZSwgSVNlYXJjaENvbmZpZ3VyYXRpb24sIElTZWFyY2hDb25maWd1cmF0aW9uUHJvcGVydGllcywgSVRleHRRdWVyeSwgU2VhcmNoQ29tcGxldGlvbkV4aXRDb2RlLCBTZWFyY2hTb3J0T3JkZXIsIFRleHRTZWFyY2hDb21wbGV0ZU1lc3NhZ2VUeXBlLCBWaWV3TW9kZSwgaXNBSUtleXdvcmQgfSBmcm9tICcuLi8uLi8uLi9zZXJ2aWNlcy9zZWFyY2gvY29tbW9uL3NlYXJjaC5qcyc7XG5pbXBvcnQgeyBBSVNlYXJjaEtleXdvcmQsIFRleHRTZWFyY2hDb21wbGV0ZU1lc3NhZ2UgfSBmcm9tICcuLi8uLi8uLi9zZXJ2aWNlcy9zZWFyY2gvY29tbW9uL3NlYXJjaEV4dFR5cGVzLmpzJztcbmltcG9ydCB7IElUZXh0RmlsZVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9zZXJ2aWNlcy90ZXh0ZmlsZS9jb21tb24vdGV4dGZpbGVzLmpzJztcbmltcG9ydCB7IElOb3RlYm9va1NlcnZpY2UgfSBmcm9tICcuLi8uLi9ub3RlYm9vay9jb21tb24vbm90ZWJvb2tTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElTQ01SZXBvc2l0b3J5LCBJU0NNU2VydmljZSB9IGZyb20gJy4uLy4uL3NjbS9jb21tb24vc2NtLmpzJztcbmltcG9ydCB7IElMb2dTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vbG9nL2NvbW1vbi9sb2cuanMnO1xuaW1wb3J0IHsgQWNjZXNzaWJpbGl0eVNpZ25hbCwgSUFjY2Vzc2liaWxpdHlTaWduYWxTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vYWNjZXNzaWJpbGl0eVNpZ25hbC9icm93c2VyL2FjY2Vzc2liaWxpdHlTaWduYWxTZXJ2aWNlLmpzJztcbmltcG9ydCB7IGdldERlZmF1bHRIb3ZlckRlbGVnYXRlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL3VpL2hvdmVyL2hvdmVyRGVsZWdhdGVGYWN0b3J5LmpzJztcbmltcG9ydCB7IElIb3ZlclNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9ob3Zlci9icm93c2VyL2hvdmVyLmpzJztcbmltcG9ydCB7IElTZWFyY2hWaWV3TW9kZWxXb3JrYmVuY2hTZXJ2aWNlIH0gZnJvbSAnLi9zZWFyY2hUcmVlTW9kZWwvc2VhcmNoVmlld01vZGVsV29ya2JlbmNoU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJU2VhcmNoVHJlZU1hdGNoLCBpc1NlYXJjaFRyZWVNYXRjaCwgUmVuZGVyYWJsZU1hdGNoLCBTZWFyY2hNb2RlbExvY2F0aW9uLCBJQ2hhbmdlRXZlbnQsIEZpbGVNYXRjaE9yTWF0Y2gsIElTZWFyY2hUcmVlRmlsZU1hdGNoLCBJU2VhcmNoVHJlZUZvbGRlck1hdGNoLCBJU2VhcmNoTW9kZWwsIElTZWFyY2hSZXN1bHQsIGlzU2VhcmNoVHJlZUZpbGVNYXRjaCwgaXNTZWFyY2hUcmVlRm9sZGVyTWF0Y2gsIGlzU2VhcmNoVHJlZUZvbGRlck1hdGNoTm9Sb290LCBpc1NlYXJjaFRyZWVGb2xkZXJNYXRjaFdpdGhSZXNvdXJjZSwgaXNTZWFyY2hUcmVlRm9sZGVyTWF0Y2hXb3Jrc3BhY2VSb290LCBpc1NlYXJjaFJlc3VsdCwgaXNUZXh0U2VhcmNoSGVhZGluZywgSVRleHRTZWFyY2hIZWFkaW5nLCBpc1NlYXJjaEhlYWRlciB9IGZyb20gJy4vc2VhcmNoVHJlZU1vZGVsL3NlYXJjaFRyZWVDb21tb24uanMnO1xuaW1wb3J0IHsgSU5vdGVib29rRmlsZUluc3RhbmNlTWF0Y2gsIGlzSU1hdGNoSW5Ob3RlYm9vayB9IGZyb20gJy4vbm90ZWJvb2tTZWFyY2gvbm90ZWJvb2tTZWFyY2hNb2RlbEJhc2UuanMnO1xuaW1wb3J0IHsgc2VhcmNoTWF0Y2hDb21wYXJlciB9IGZyb20gJy4vc2VhcmNoQ29tcGFyZS5qcyc7XG5pbXBvcnQgeyBBSUZvbGRlck1hdGNoV29ya3NwYWNlUm9vdEltcGwgfSBmcm9tICcuL0FJU2VhcmNoL2FpU2VhcmNoTW9kZWwuanMnO1xuaW1wb3J0IHsgSVRlbGVtZXRyeVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS90ZWxlbWV0cnkvY29tbW9uL3RlbGVtZXRyeS5qcyc7XG5pbXBvcnQgeyBmb3JjZWRFeHBhbmRSZWN1cnNpdmVseSB9IGZyb20gJy4vc2VhcmNoQWN0aW9uc1RvcEJhci5qcyc7XG5cbmNvbnN0ICQgPSBkb20uJDtcblxuZXhwb3J0IGVudW0gU2VhcmNoVmlld1Bvc2l0aW9uIHtcblx0U2lkZUJhcixcblx0UGFuZWxcbn1cblxuaW50ZXJmYWNlIElTZWFyY2hWaWV3U3RhdGVRdWVyeSB7XG5cdGNvbnRlbnRQYXR0ZXJuPzogc3RyaW5nO1xuXHRyZXBsYWNlVGV4dD86IHN0cmluZyB8IGZhbHNlO1xuXHRyZWdleD86IGJvb2xlYW47XG5cdHdob2xlV29yZHM/OiBib29sZWFuO1xuXHRjYXNlU2Vuc2l0aXZlPzogYm9vbGVhbjtcblx0ZmlsZVBhdHRlcm5zPzogc3RyaW5nO1xuXHRmb2xkZXJFeGNsdXNpb25zPzogc3RyaW5nO1xuXHRmb2xkZXJJbmNsdWRlcz86IHN0cmluZztcblx0b25seU9wZW5FZGl0b3JzPzogYm9vbGVhbjtcblx0cXVlcnlEZXRhaWxzRXhwYW5kZWQ/OiBzdHJpbmcgfCBib29sZWFuO1xuXHR1c2VFeGNsdWRlc0FuZElnbm9yZUZpbGVzPzogYm9vbGVhbjtcblx0cHJlc2VydmVDYXNlPzogYm9vbGVhbjtcblx0c2VhcmNoSGlzdG9yeT86IHN0cmluZ1tdO1xuXHRyZXBsYWNlSGlzdG9yeT86IHN0cmluZ1tdO1xuXHRpc0luTm90ZWJvb2tNYXJrZG93bklucHV0PzogYm9vbGVhbjtcblx0aXNJbk5vdGVib29rTWFya2Rvd25QcmV2aWV3PzogYm9vbGVhbjtcblx0aXNJbk5vdGVib29rQ2VsbElucHV0PzogYm9vbGVhbjtcblx0aXNJbk5vdGVib29rQ2VsbE91dHB1dD86IGJvb2xlYW47XG59XG5cbmludGVyZmFjZSBJU2VhcmNoVmlld1N0YXRlIHtcblx0cXVlcnk/OiBJU2VhcmNoVmlld1N0YXRlUXVlcnk7XG5cdHZpZXc/OiB7XG5cdFx0c2hvd1JlcGxhY2U/OiBib29sZWFuO1xuXHRcdHRyZWVMYXlvdXQ/OiBib29sZWFuO1xuXHR9O1xufVxuXG5jb25zdCBTRUFSQ0hfQ0FOQ0VMTEVEX01FU1NBR0UgPSBubHMubG9jYWxpemUoJ3NlYXJjaENhbmNlbGVkJywgXCJTZWFyY2ggd2FzIGNhbmNlbGVkIGJlZm9yZSBhbnkgcmVzdWx0cyBjb3VsZCBiZSBmb3VuZCAtIFwiKTtcbmNvbnN0IERFQk9VTkNFX0RFTEFZID0gNzU7XG5leHBvcnQgY2xhc3MgU2VhcmNoVmlldyBleHRlbmRzIFZpZXdQYW5lIHtcblxuXHRwcml2YXRlIHN0YXRpYyByZWFkb25seSBBQ1RJT05TX1JJR0hUX0NMQVNTX05BTUUgPSAnYWN0aW9ucy1yaWdodCc7XG5cblx0cHJpdmF0ZSBpc0Rpc3Bvc2VkID0gZmFsc2U7XG5cblx0cHJpdmF0ZSBjb250YWluZXIhOiBIVE1MRWxlbWVudDtcblx0cHJpdmF0ZSBxdWVyeUJ1aWxkZXI6IFF1ZXJ5QnVpbGRlcjtcblx0cHJpdmF0ZSB2aWV3TW9kZWw6IElTZWFyY2hNb2RlbDtcblx0cHJpdmF0ZSBtZW1lbnRvOiBNZW1lbnRvPElTZWFyY2hWaWV3U3RhdGU+O1xuXG5cdHByaXZhdGUgdmlld2xldFZpc2libGU6IElDb250ZXh0S2V5PGJvb2xlYW4+O1xuXHRwcml2YXRlIGlucHV0Qm94Rm9jdXNlZDogSUNvbnRleHRLZXk8Ym9vbGVhbj47XG5cdHByaXZhdGUgaW5wdXRQYXR0ZXJuSW5jbHVkZXNGb2N1c2VkOiBJQ29udGV4dEtleTxib29sZWFuPjtcblx0cHJpdmF0ZSBpbnB1dFBhdHRlcm5FeGNsdXNpb25zRm9jdXNlZDogSUNvbnRleHRLZXk8Ym9vbGVhbj47XG5cdHByaXZhdGUgZmlyc3RNYXRjaEZvY3VzZWQ6IElDb250ZXh0S2V5PGJvb2xlYW4+O1xuXHRwcml2YXRlIGZpbGVNYXRjaE9yTWF0Y2hGb2N1c2VkOiBJQ29udGV4dEtleTxib29sZWFuPjtcblx0cHJpdmF0ZSBmaWxlTWF0Y2hPckZvbGRlck1hdGNoRm9jdXM6IElDb250ZXh0S2V5PGJvb2xlYW4+O1xuXHRwcml2YXRlIGZpbGVNYXRjaE9yRm9sZGVyTWF0Y2hXaXRoUmVzb3VyY2VGb2N1czogSUNvbnRleHRLZXk8Ym9vbGVhbj47XG5cdHByaXZhdGUgZmlsZU1hdGNoRm9jdXNlZDogSUNvbnRleHRLZXk8Ym9vbGVhbj47XG5cdHByaXZhdGUgZm9sZGVyTWF0Y2hGb2N1c2VkOiBJQ29udGV4dEtleTxib29sZWFuPjtcblx0cHJpdmF0ZSBmb2xkZXJNYXRjaFdpdGhSZXNvdXJjZUZvY3VzZWQ6IElDb250ZXh0S2V5PGJvb2xlYW4+O1xuXHRwcml2YXRlIG1hdGNoRm9jdXNlZDogSUNvbnRleHRLZXk8Ym9vbGVhbj47XG5cdHByaXZhdGUgc2VhcmNoUmVzdWx0SGVhZGVyRm9jdXNlZDogSUNvbnRleHRLZXk8Ym9vbGVhbj47XG5cdHByaXZhdGUgaXNFZGl0YWJsZUl0ZW06IElDb250ZXh0S2V5PGJvb2xlYW4+O1xuXHRwcml2YXRlIGhhc1NlYXJjaFJlc3VsdHNLZXk6IElDb250ZXh0S2V5PGJvb2xlYW4+O1xuXHRwcml2YXRlIGxhc3RGb2N1c1N0YXRlOiAnaW5wdXQnIHwgJ3RyZWUnID0gJ2lucHV0JztcblxuXHRwcml2YXRlIHNlYXJjaFN0YXRlS2V5OiBJQ29udGV4dEtleTxTZWFyY2hVSVN0YXRlPjtcblx0cHJpdmF0ZSBoYXNTZWFyY2hQYXR0ZXJuS2V5OiBJQ29udGV4dEtleTxib29sZWFuPjtcblx0cHJpdmF0ZSBoYXNSZXBsYWNlUGF0dGVybktleTogSUNvbnRleHRLZXk8Ym9vbGVhbj47XG5cdHByaXZhdGUgaGFzRmlsZVBhdHRlcm5LZXk6IElDb250ZXh0S2V5PGJvb2xlYW4+O1xuXHRwcml2YXRlIGhhc1NvbWVDb2xsYXBzaWJsZVJlc3VsdEtleTogSUNvbnRleHRLZXk8Ym9vbGVhbj47XG5cblx0cHJpdmF0ZSB0cmVlITogV29ya2JlbmNoQ29tcHJlc3NpYmxlQXN5bmNEYXRhVHJlZTxJU2VhcmNoUmVzdWx0LCBSZW5kZXJhYmxlTWF0Y2g+O1xuXHRwcml2YXRlIHRyZWVMYWJlbHMhOiBSZXNvdXJjZUxhYmVscztcblx0cHJpdmF0ZSB2aWV3bGV0U3RhdGU6IElTZWFyY2hWaWV3U3RhdGU7XG5cdHByaXZhdGUgbWVzc2FnZXNFbGVtZW50ITogSFRNTEVsZW1lbnQ7XG5cdHByaXZhdGUgcmVhZG9ubHkgbWVzc2FnZURpc3Bvc2FibGVzOiBEaXNwb3NhYmxlU3RvcmUgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cdHByaXZhdGUgc2VhcmNoV2lkZ2V0c0NvbnRhaW5lckVsZW1lbnQhOiBIVE1MRWxlbWVudDtcblx0cHJpdmF0ZSBzZWFyY2hXaWRnZXQhOiBTZWFyY2hXaWRnZXQ7XG5cdHByaXZhdGUgc2l6ZSE6IGRvbS5EaW1lbnNpb247XG5cdHByaXZhdGUgcXVlcnlEZXRhaWxzITogSFRNTEVsZW1lbnQ7XG5cdHByaXZhdGUgdG9nZ2xlUXVlcnlEZXRhaWxzQnV0dG9uITogSFRNTEVsZW1lbnQ7XG5cdHByaXZhdGUgaW5wdXRQYXR0ZXJuRXhjbHVkZXMhOiBFeGNsdWRlUGF0dGVybklucHV0V2lkZ2V0O1xuXHRwcml2YXRlIGlucHV0UGF0dGVybkluY2x1ZGVzITogSW5jbHVkZVBhdHRlcm5JbnB1dFdpZGdldDtcblx0cHJpdmF0ZSByZXN1bHRzRWxlbWVudCE6IEhUTUxFbGVtZW50O1xuXG5cdHByaXZhdGUgY3VycmVudFNlbGVjdGVkRmlsZU1hdGNoOiBJU2VhcmNoVHJlZUZpbGVNYXRjaCB8IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSByZWFkb25seSBjdXJyZW50RWRpdG9yQ3Vyc29yTGlzdGVuZXIgPSB0aGlzLl9yZWdpc3RlcihuZXcgTXV0YWJsZURpc3Bvc2FibGUoKSk7XG5cblx0cHJpdmF0ZSBkZWxheWVkUmVmcmVzaDogRGVsYXllcjx2b2lkPjtcblx0cHJpdmF0ZSBjaGFuZ2VkV2hpbGVIaWRkZW46IGJvb2xlYW47XG5cblx0cHJpdmF0ZSBzZWFyY2hXaXRob3V0Rm9sZGVyTWVzc2FnZUVsZW1lbnQ6IEhUTUxFbGVtZW50IHwgdW5kZWZpbmVkO1xuXG5cdHByaXZhdGUgY3VycmVudFNlYXJjaFEgPSBQcm9taXNlLnJlc29sdmUoKTtcblx0cHJpdmF0ZSBhZGRUb1NlYXJjaEhpc3RvcnlEZWxheWVyOiBEZWxheWVyPHZvaWQ+O1xuXG5cdHByaXZhdGUgdG9nZ2xlQ29sbGFwc2VTdGF0ZURlbGF5ZXI6IERlbGF5ZXI8dm9pZD47XG5cblx0cHJpdmF0ZSB0cmlnZ2VyUXVlcnlEZWxheWVyOiBEZWxheWVyPHZvaWQ+O1xuXHRwcml2YXRlIHBhdXNlU2VhcmNoaW5nID0gZmFsc2U7XG5cblx0cHJpdmF0ZSB0cmVlQWNjZXNzaWJpbGl0eVByb3ZpZGVyOiBTZWFyY2hBY2Nlc3NpYmlsaXR5UHJvdmlkZXI7XG5cblx0cHJpdmF0ZSB0cmVlVmlld0tleTogSUNvbnRleHRLZXk8Ym9vbGVhbj47XG5cblx0cHJpdmF0ZSBfdmlzaWJsZU1hdGNoZXM6IG51bWJlciA9IDA7XG5cblx0cHJpdmF0ZSBfcmVmcmVzaFJlc3VsdHNTY2hlZHVsZXI6IFJ1bk9uY2VTY2hlZHVsZXI7XG5cblx0cHJpdmF0ZSBfb25TZWFyY2hSZXN1bHRDaGFuZ2VkRGlzcG9zYWJsZTogSURpc3Bvc2FibGUgfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgX29uQUlSZXN1bHRDaGFuZ2VkRGlzcG9zYWJsZTogSURpc3Bvc2FibGUgfCB1bmRlZmluZWQ7XG5cblx0cHJpdmF0ZSBzZWFyY2hEYXRhU291cmNlOiBTZWFyY2hWaWV3RGF0YVNvdXJjZSB8IHVuZGVmaW5lZDtcblxuXHRwcml2YXRlIHJlZnJlc2hUcmVlQ29udHJvbGxlcjogUmVmcmVzaFRyZWVDb250cm9sbGVyO1xuXG5cdHByaXZhdGUgX2NhY2hlZFJlc3VsdHM6IElTZWFyY2hDb21wbGV0ZSB8IHVuZGVmaW5lZDtcblx0cHJpdmF0ZSBfY2FjaGVkS2V5d29yZHM6IHN0cmluZ1tdID0gW107XG5cdHB1YmxpYyBfcGVuZGluZ1NlbWFudGljU2VhcmNoUHJvbWlzZTogUHJvbWlzZTxJU2VhcmNoQ29tcGxldGU+IHwgdW5kZWZpbmVkO1xuXHRjb25zdHJ1Y3Rvcihcblx0XHRvcHRpb25zOiBJVmlld1BhbmVPcHRpb25zLFxuXHRcdEBJRmlsZVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBmaWxlU2VydmljZTogSUZpbGVTZXJ2aWNlLFxuXHRcdEBJRWRpdG9yU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGVkaXRvclNlcnZpY2U6IElFZGl0b3JTZXJ2aWNlLFxuXHRcdEBJQ29kZUVkaXRvclNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBjb2RlRWRpdG9yU2VydmljZTogSUNvZGVFZGl0b3JTZXJ2aWNlLFxuXHRcdEBJUHJvZ3Jlc3NTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgcHJvZ3Jlc3NTZXJ2aWNlOiBJUHJvZ3Jlc3NTZXJ2aWNlLFxuXHRcdEBJTm90aWZpY2F0aW9uU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IG5vdGlmaWNhdGlvblNlcnZpY2U6IElOb3RpZmljYXRpb25TZXJ2aWNlLFxuXHRcdEBJRGlhbG9nU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGRpYWxvZ1NlcnZpY2U6IElEaWFsb2dTZXJ2aWNlLFxuXHRcdEBJQ29tbWFuZFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBjb21tYW5kU2VydmljZTogSUNvbW1hbmRTZXJ2aWNlLFxuXHRcdEBJQ29udGV4dFZpZXdTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgY29udGV4dFZpZXdTZXJ2aWNlOiBJQ29udGV4dFZpZXdTZXJ2aWNlLFxuXHRcdEBJSW5zdGFudGlhdGlvblNlcnZpY2UgaW5zdGFudGlhdGlvblNlcnZpY2U6IElJbnN0YW50aWF0aW9uU2VydmljZSxcblx0XHRASVZpZXdEZXNjcmlwdG9yU2VydmljZSB2aWV3RGVzY3JpcHRvclNlcnZpY2U6IElWaWV3RGVzY3JpcHRvclNlcnZpY2UsXG5cdFx0QElDb25maWd1cmF0aW9uU2VydmljZSBjb25maWd1cmF0aW9uU2VydmljZTogSUNvbmZpZ3VyYXRpb25TZXJ2aWNlLFxuXHRcdEBJV29ya3NwYWNlQ29udGV4dFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBjb250ZXh0U2VydmljZTogSVdvcmtzcGFjZUNvbnRleHRTZXJ2aWNlLFxuXHRcdEBJU2VhcmNoVmlld01vZGVsV29ya2JlbmNoU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IHNlYXJjaFZpZXdNb2RlbFdvcmtiZW5jaFNlcnZpY2U6IElTZWFyY2hWaWV3TW9kZWxXb3JrYmVuY2hTZXJ2aWNlLFxuXHRcdEBJQ29udGV4dEtleVNlcnZpY2UgY29udGV4dEtleVNlcnZpY2U6IElDb250ZXh0S2V5U2VydmljZSxcblx0XHRASVJlcGxhY2VTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgcmVwbGFjZVNlcnZpY2U6IElSZXBsYWNlU2VydmljZSxcblx0XHRASVRleHRGaWxlU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IHRleHRGaWxlU2VydmljZTogSVRleHRGaWxlU2VydmljZSxcblx0XHRASVByZWZlcmVuY2VzU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IHByZWZlcmVuY2VzU2VydmljZTogSVByZWZlcmVuY2VzU2VydmljZSxcblx0XHRASVRoZW1lU2VydmljZSB0aGVtZVNlcnZpY2U6IElUaGVtZVNlcnZpY2UsXG5cdFx0QElTZWFyY2hIaXN0b3J5U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IHNlYXJjaEhpc3RvcnlTZXJ2aWNlOiBJU2VhcmNoSGlzdG9yeVNlcnZpY2UsXG5cdFx0QElDb250ZXh0TWVudVNlcnZpY2UgY29udGV4dE1lbnVTZXJ2aWNlOiBJQ29udGV4dE1lbnVTZXJ2aWNlLFxuXHRcdEBJQWNjZXNzaWJpbGl0eVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBhY2Nlc3NpYmlsaXR5U2VydmljZTogSUFjY2Vzc2liaWxpdHlTZXJ2aWNlLFxuXHRcdEBJS2V5YmluZGluZ1NlcnZpY2Uga2V5YmluZGluZ1NlcnZpY2U6IElLZXliaW5kaW5nU2VydmljZSxcblx0XHRASVN0b3JhZ2VTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgc3RvcmFnZVNlcnZpY2U6IElTdG9yYWdlU2VydmljZSxcblx0XHRASU9wZW5lclNlcnZpY2Ugb3BlbmVyU2VydmljZTogSU9wZW5lclNlcnZpY2UsXG5cdFx0QElIb3ZlclNlcnZpY2UgaG92ZXJTZXJ2aWNlOiBJSG92ZXJTZXJ2aWNlLFxuXHRcdEBJTm90ZWJvb2tTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgbm90ZWJvb2tTZXJ2aWNlOiBJTm90ZWJvb2tTZXJ2aWNlLFxuXHRcdEBJTG9nU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGxvZ1NlcnZpY2U6IElMb2dTZXJ2aWNlLFxuXHRcdEBJQWNjZXNzaWJpbGl0eVNpZ25hbFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBhY2Nlc3NpYmlsaXR5U2lnbmFsU2VydmljZTogSUFjY2Vzc2liaWxpdHlTaWduYWxTZXJ2aWNlLFxuXHRcdEBJVGVsZW1ldHJ5U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IHRlbGVtZXRyeVNlcnZpY2U6IElUZWxlbWV0cnlTZXJ2aWNlLFxuXHRcdEBJU0NNU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IHNjbVNlcnZpY2U6IElTQ01TZXJ2aWNlLFxuXHQpIHtcblxuXHRcdHN1cGVyKG9wdGlvbnMsIGtleWJpbmRpbmdTZXJ2aWNlLCBjb250ZXh0TWVudVNlcnZpY2UsIGNvbmZpZ3VyYXRpb25TZXJ2aWNlLCBjb250ZXh0S2V5U2VydmljZSwgdmlld0Rlc2NyaXB0b3JTZXJ2aWNlLCBpbnN0YW50aWF0aW9uU2VydmljZSwgb3BlbmVyU2VydmljZSwgdGhlbWVTZXJ2aWNlLCBob3ZlclNlcnZpY2UpO1xuXG5cdFx0dGhpcy5jb250YWluZXIgPSBkb20uJCgnLnNlYXJjaC12aWV3Jyk7XG5cblx0XHQvLyBnbG9iYWxzXG5cdFx0dGhpcy52aWV3bGV0VmlzaWJsZSA9IENvbnN0YW50cy5TZWFyY2hDb250ZXh0LlNlYXJjaFZpZXdWaXNpYmxlS2V5LmJpbmRUbyh0aGlzLmNvbnRleHRLZXlTZXJ2aWNlKTtcblx0XHR0aGlzLmZpcnN0TWF0Y2hGb2N1c2VkID0gQ29uc3RhbnRzLlNlYXJjaENvbnRleHQuRmlyc3RNYXRjaEZvY3VzS2V5LmJpbmRUbyh0aGlzLmNvbnRleHRLZXlTZXJ2aWNlKTtcblx0XHR0aGlzLmZpbGVNYXRjaE9yTWF0Y2hGb2N1c2VkID0gQ29uc3RhbnRzLlNlYXJjaENvbnRleHQuRmlsZU1hdGNoT3JNYXRjaEZvY3VzS2V5LmJpbmRUbyh0aGlzLmNvbnRleHRLZXlTZXJ2aWNlKTtcblx0XHR0aGlzLmZpbGVNYXRjaE9yRm9sZGVyTWF0Y2hGb2N1cyA9IENvbnN0YW50cy5TZWFyY2hDb250ZXh0LkZpbGVNYXRjaE9yRm9sZGVyTWF0Y2hGb2N1c0tleS5iaW5kVG8odGhpcy5jb250ZXh0S2V5U2VydmljZSk7XG5cdFx0dGhpcy5maWxlTWF0Y2hPckZvbGRlck1hdGNoV2l0aFJlc291cmNlRm9jdXMgPSBDb25zdGFudHMuU2VhcmNoQ29udGV4dC5GaWxlTWF0Y2hPckZvbGRlck1hdGNoV2l0aFJlc291cmNlRm9jdXNLZXkuYmluZFRvKHRoaXMuY29udGV4dEtleVNlcnZpY2UpO1xuXHRcdHRoaXMuZmlsZU1hdGNoRm9jdXNlZCA9IENvbnN0YW50cy5TZWFyY2hDb250ZXh0LkZpbGVGb2N1c0tleS5iaW5kVG8odGhpcy5jb250ZXh0S2V5U2VydmljZSk7XG5cdFx0dGhpcy5mb2xkZXJNYXRjaEZvY3VzZWQgPSBDb25zdGFudHMuU2VhcmNoQ29udGV4dC5Gb2xkZXJGb2N1c0tleS5iaW5kVG8odGhpcy5jb250ZXh0S2V5U2VydmljZSk7XG5cdFx0dGhpcy5mb2xkZXJNYXRjaFdpdGhSZXNvdXJjZUZvY3VzZWQgPSBDb25zdGFudHMuU2VhcmNoQ29udGV4dC5SZXNvdXJjZUZvbGRlckZvY3VzS2V5LmJpbmRUbyh0aGlzLmNvbnRleHRLZXlTZXJ2aWNlKTtcblx0XHR0aGlzLnNlYXJjaFJlc3VsdEhlYWRlckZvY3VzZWQgPSBDb25zdGFudHMuU2VhcmNoQ29udGV4dC5TZWFyY2hSZXN1bHRIZWFkZXJGb2N1c2VkLmJpbmRUbyh0aGlzLmNvbnRleHRLZXlTZXJ2aWNlKTtcblx0XHR0aGlzLmhhc1NlYXJjaFJlc3VsdHNLZXkgPSBDb25zdGFudHMuU2VhcmNoQ29udGV4dC5IYXNTZWFyY2hSZXN1bHRzLmJpbmRUbyh0aGlzLmNvbnRleHRLZXlTZXJ2aWNlKTtcblx0XHR0aGlzLm1hdGNoRm9jdXNlZCA9IENvbnN0YW50cy5TZWFyY2hDb250ZXh0Lk1hdGNoRm9jdXNLZXkuYmluZFRvKHRoaXMuY29udGV4dEtleVNlcnZpY2UpO1xuXHRcdHRoaXMuc2VhcmNoU3RhdGVLZXkgPSBTZWFyY2hTdGF0ZUtleS5iaW5kVG8odGhpcy5jb250ZXh0S2V5U2VydmljZSk7XG5cdFx0dGhpcy5oYXNTZWFyY2hQYXR0ZXJuS2V5ID0gQ29uc3RhbnRzLlNlYXJjaENvbnRleHQuVmlld0hhc1NlYXJjaFBhdHRlcm5LZXkuYmluZFRvKHRoaXMuY29udGV4dEtleVNlcnZpY2UpO1xuXHRcdHRoaXMuaGFzUmVwbGFjZVBhdHRlcm5LZXkgPSBDb25zdGFudHMuU2VhcmNoQ29udGV4dC5WaWV3SGFzUmVwbGFjZVBhdHRlcm5LZXkuYmluZFRvKHRoaXMuY29udGV4dEtleVNlcnZpY2UpO1xuXHRcdHRoaXMuaGFzRmlsZVBhdHRlcm5LZXkgPSBDb25zdGFudHMuU2VhcmNoQ29udGV4dC5WaWV3SGFzRmlsZVBhdHRlcm5LZXkuYmluZFRvKHRoaXMuY29udGV4dEtleVNlcnZpY2UpO1xuXHRcdHRoaXMuaGFzU29tZUNvbGxhcHNpYmxlUmVzdWx0S2V5ID0gQ29uc3RhbnRzLlNlYXJjaENvbnRleHQuVmlld0hhc1NvbWVDb2xsYXBzaWJsZUtleS5iaW5kVG8odGhpcy5jb250ZXh0S2V5U2VydmljZSk7XG5cdFx0dGhpcy50cmVlVmlld0tleSA9IENvbnN0YW50cy5TZWFyY2hDb250ZXh0LkluVHJlZVZpZXdLZXkuYmluZFRvKHRoaXMuY29udGV4dEtleVNlcnZpY2UpO1xuXHRcdHRoaXMucmVmcmVzaFRyZWVDb250cm9sbGVyID0gdGhpcy5fcmVnaXN0ZXIodGhpcy5pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShSZWZyZXNoVHJlZUNvbnRyb2xsZXIsIHRoaXMsICgpID0+IHRoaXMuc2VhcmNoQ29uZmlnKSk7XG5cblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLmNvbnRleHRLZXlTZXJ2aWNlLm9uRGlkQ2hhbmdlQ29udGV4dChlID0+IHtcblx0XHRcdGNvbnN0IGtleXMgPSBDb25zdGFudHMuU2VhcmNoQ29udGV4dC5oYXNBSVJlc3VsdFByb3ZpZGVyLmtleXMoKTtcblx0XHRcdGlmIChlLmFmZmVjdHNTb21lKG5ldyBTZXQoa2V5cykpKSB7XG5cdFx0XHRcdHRoaXMucmVmcmVzaEhhc0FJU2V0dGluZygpO1xuXHRcdFx0fVxuXHRcdH0pKTtcblxuXHRcdC8vIHNjb3BlZFxuXHRcdHRoaXMuY29udGV4dEtleVNlcnZpY2UgPSB0aGlzLl9yZWdpc3Rlcih0aGlzLmNvbnRleHRLZXlTZXJ2aWNlLmNyZWF0ZVNjb3BlZCh0aGlzLmNvbnRhaW5lcikpO1xuXHRcdENvbnN0YW50cy5TZWFyY2hDb250ZXh0LlNlYXJjaFZpZXdGb2N1c2VkS2V5LmJpbmRUbyh0aGlzLmNvbnRleHRLZXlTZXJ2aWNlKS5zZXQodHJ1ZSk7XG5cdFx0dGhpcy5pbnB1dEJveEZvY3VzZWQgPSBDb25zdGFudHMuU2VhcmNoQ29udGV4dC5JbnB1dEJveEZvY3VzZWRLZXkuYmluZFRvKHRoaXMuY29udGV4dEtleVNlcnZpY2UpO1xuXHRcdHRoaXMuaW5wdXRQYXR0ZXJuSW5jbHVkZXNGb2N1c2VkID0gQ29uc3RhbnRzLlNlYXJjaENvbnRleHQuUGF0dGVybkluY2x1ZGVzRm9jdXNlZEtleS5iaW5kVG8odGhpcy5jb250ZXh0S2V5U2VydmljZSk7XG5cdFx0dGhpcy5pbnB1dFBhdHRlcm5FeGNsdXNpb25zRm9jdXNlZCA9IENvbnN0YW50cy5TZWFyY2hDb250ZXh0LlBhdHRlcm5FeGNsdWRlc0ZvY3VzZWRLZXkuYmluZFRvKHRoaXMuY29udGV4dEtleVNlcnZpY2UpO1xuXHRcdHRoaXMuaXNFZGl0YWJsZUl0ZW0gPSBDb25zdGFudHMuU2VhcmNoQ29udGV4dC5Jc0VkaXRhYmxlSXRlbUtleS5iaW5kVG8odGhpcy5jb250ZXh0S2V5U2VydmljZSk7XG5cblx0XHR0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlID0gdGhpcy5fcmVnaXN0ZXIodGhpcy5pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVDaGlsZChcblx0XHRcdG5ldyBTZXJ2aWNlQ29sbGVjdGlvbihbSUNvbnRleHRLZXlTZXJ2aWNlLCB0aGlzLmNvbnRleHRLZXlTZXJ2aWNlXSkpKTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuY29uZmlndXJhdGlvblNlcnZpY2Uub25EaWRDaGFuZ2VDb25maWd1cmF0aW9uKGFzeW5jIGUgPT4ge1xuXHRcdFx0aWYgKGUuYWZmZWN0c0NvbmZpZ3VyYXRpb24oJ3NlYXJjaC5zb3J0T3JkZXInKSkge1xuXHRcdFx0XHRpZiAodGhpcy5zZWFyY2hDb25maWcuc29ydE9yZGVyID09PSBTZWFyY2hTb3J0T3JkZXIuTW9kaWZpZWQpIHtcblx0XHRcdFx0XHQvLyBJZiBjaGFuZ2luZyBhd2F5IGZyb20gbW9kaWZpZWQsIHJlbW92ZSBhbGwgZmlsZVN0YXRzXG5cdFx0XHRcdFx0Ly8gc28gdGhhdCB1cGRhdGVkIGZpbGVzIGFyZSByZS1yZXRyaWV2ZWQgbmV4dCB0aW1lLlxuXHRcdFx0XHRcdHRoaXMucmVtb3ZlRmlsZVN0YXRzKCk7XG5cdFx0XHRcdH1cblx0XHRcdFx0YXdhaXQgdGhpcy5yZWZyZXNoVHJlZUNvbnRyb2xsZXIucXVldWUoKTtcblx0XHRcdH1cblx0XHR9KSk7XG5cblx0XHR0aGlzLnZpZXdNb2RlbCA9IHRoaXMuc2VhcmNoVmlld01vZGVsV29ya2JlbmNoU2VydmljZS5zZWFyY2hNb2RlbDtcblx0XHR0aGlzLnF1ZXJ5QnVpbGRlciA9IHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoUXVlcnlCdWlsZGVyKTtcblx0XHR0aGlzLm1lbWVudG8gPSBuZXcgTWVtZW50byh0aGlzLmlkLCBzdG9yYWdlU2VydmljZSk7XG5cdFx0dGhpcy52aWV3bGV0U3RhdGUgPSB0aGlzLm1lbWVudG8uZ2V0TWVtZW50byhTdG9yYWdlU2NvcGUuV09SS1NQQUNFLCBTdG9yYWdlVGFyZ2V0Lk1BQ0hJTkUpO1xuXG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5maWxlU2VydmljZS5vbkRpZEZpbGVzQ2hhbmdlKGUgPT4gdGhpcy5vbkZpbGVzQ2hhbmdlZChlKSkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMudGV4dEZpbGVTZXJ2aWNlLnVudGl0bGVkLm9uV2lsbERpc3Bvc2UobW9kZWwgPT4gdGhpcy5vblVudGl0bGVkRGlkRGlzcG9zZShtb2RlbC5yZXNvdXJjZSkpKTtcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLmNvbnRleHRTZXJ2aWNlLm9uRGlkQ2hhbmdlV29ya2JlbmNoU3RhdGUoKCkgPT4gdGhpcy5vbkRpZENoYW5nZVdvcmtiZW5jaFN0YXRlKCkpKTtcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLnNlYXJjaEhpc3RvcnlTZXJ2aWNlLm9uRGlkQ2xlYXJIaXN0b3J5KCgpID0+IHRoaXMuY2xlYXJIaXN0b3J5KCkpKTtcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLmNvbmZpZ3VyYXRpb25TZXJ2aWNlLm9uRGlkQ2hhbmdlQ29uZmlndXJhdGlvbihlID0+IHRoaXMub25Db25maWd1cmF0aW9uVXBkYXRlZChlKSkpO1xuXG5cdFx0Y29uc3QgdXBkYXRlQ2hhbmdlZEZpbGVzVG9nZ2xlRW5hYmxlZCA9ICgpID0+IHtcblx0XHRcdGNvbnN0IGhhc0NoYW5nZXMgPSBbLi4udGhpcy5zY21TZXJ2aWNlLnJlcG9zaXRvcmllc10uc29tZShcblx0XHRcdFx0cmVwbyA9PiByZXBvLnByb3ZpZGVyLmdyb3Vwcy5zb21lKGdyb3VwID0+IGdyb3VwLnJlc291cmNlcy5sZW5ndGggPiAwKVxuXHRcdFx0KTtcblx0XHRcdHRoaXMuaW5wdXRQYXR0ZXJuSW5jbHVkZXM/LnNldE9ubHlTZWFyY2hJbkNoYW5nZWRGaWxlc0VuYWJsZWQoaGFzQ2hhbmdlcyk7XG5cdFx0fTtcblx0XHRjb25zdCBzY21SZXBvc2l0b3J5TGlzdGVuZXJzID0gdGhpcy5fcmVnaXN0ZXIobmV3IERpc3Bvc2FibGVNYXA8SVNDTVJlcG9zaXRvcnk+KCkpO1xuXHRcdGNvbnN0IHJlZ2lzdGVyU2NtUmVwb3NpdG9yeUxpc3RlbmVycyA9IChyZXBvc2l0b3J5OiBJU0NNUmVwb3NpdG9yeSkgPT4ge1xuXHRcdFx0c2NtUmVwb3NpdG9yeUxpc3RlbmVycy5zZXQocmVwb3NpdG9yeSwgcmVwb3NpdG9yeS5wcm92aWRlci5vbkRpZENoYW5nZVJlc291cmNlcygoKSA9PiB7XG5cdFx0XHRcdHVwZGF0ZUNoYW5nZWRGaWxlc1RvZ2dsZUVuYWJsZWQoKTtcblx0XHRcdFx0aWYgKHRoaXMuaW5wdXRQYXR0ZXJuSW5jbHVkZXM/Lm9ubHlTZWFyY2hJbkNoYW5nZWRGaWxlcygpKSB7XG5cdFx0XHRcdFx0dGhpcy50cmlnZ2VyUXVlcnlDaGFuZ2UoKTtcblx0XHRcdFx0fVxuXHRcdFx0fSkpO1xuXHRcdH07XG5cdFx0Zm9yIChjb25zdCByZXBvc2l0b3J5IG9mIHRoaXMuc2NtU2VydmljZS5yZXBvc2l0b3JpZXMpIHtcblx0XHRcdHJlZ2lzdGVyU2NtUmVwb3NpdG9yeUxpc3RlbmVycyhyZXBvc2l0b3J5KTtcblx0XHR9XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5zY21TZXJ2aWNlLm9uRGlkQWRkUmVwb3NpdG9yeShyZXBvc2l0b3J5ID0+IHtcblx0XHRcdHJlZ2lzdGVyU2NtUmVwb3NpdG9yeUxpc3RlbmVycyhyZXBvc2l0b3J5KTtcblx0XHRcdHVwZGF0ZUNoYW5nZWRGaWxlc1RvZ2dsZUVuYWJsZWQoKTtcblx0XHR9KSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5zY21TZXJ2aWNlLm9uRGlkUmVtb3ZlUmVwb3NpdG9yeShyZXBvc2l0b3J5ID0+IHtcblx0XHRcdHNjbVJlcG9zaXRvcnlMaXN0ZW5lcnMuZGVsZXRlQW5kRGlzcG9zZShyZXBvc2l0b3J5KTtcblx0XHRcdHVwZGF0ZUNoYW5nZWRGaWxlc1RvZ2dsZUVuYWJsZWQoKTtcblx0XHR9KSk7XG5cblx0XHR0aGlzLmRlbGF5ZWRSZWZyZXNoID0gdGhpcy5fcmVnaXN0ZXIobmV3IERlbGF5ZXI8dm9pZD4oMjUwKSk7XG5cblx0XHR0aGlzLmFkZFRvU2VhcmNoSGlzdG9yeURlbGF5ZXIgPSB0aGlzLl9yZWdpc3RlcihuZXcgRGVsYXllcjx2b2lkPigyMDAwKSk7XG5cdFx0dGhpcy50b2dnbGVDb2xsYXBzZVN0YXRlRGVsYXllciA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBEZWxheWVyPHZvaWQ+KDEwMCkpO1xuXHRcdHRoaXMudHJpZ2dlclF1ZXJ5RGVsYXllciA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBEZWxheWVyPHZvaWQ+KDApKTtcblxuXHRcdHRoaXMudHJlZUFjY2Vzc2liaWxpdHlQcm92aWRlciA9IHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoU2VhcmNoQWNjZXNzaWJpbGl0eVByb3ZpZGVyLCB0aGlzKTtcblx0XHR0aGlzLmlzVHJlZUxheW91dFZpZXdWaXNpYmxlID0gdGhpcy52aWV3bGV0U3RhdGUudmlldz8udHJlZUxheW91dCA/PyAodGhpcy5zZWFyY2hDb25maWcuZGVmYXVsdFZpZXdNb2RlID09PSBWaWV3TW9kZS5UcmVlKTtcblxuXHRcdHRoaXMuX3JlZnJlc2hSZXN1bHRzU2NoZWR1bGVyID0gdGhpcy5fcmVnaXN0ZXIobmV3IFJ1bk9uY2VTY2hlZHVsZXIodGhpcy5fdXBkYXRlUmVzdWx0cy5iaW5kKHRoaXMpLCA4MCkpO1xuXG5cdFx0Ly8gc3RvcmFnZSBzZXJ2aWNlIGxpc3RlbmVyIGZvciBmb3Igcm9hbWluZyBjaGFuZ2VzXG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5zdG9yYWdlU2VydmljZS5vbldpbGxTYXZlU3RhdGUoKCkgPT4ge1xuXHRcdFx0dGhpcy5fc2F2ZVNlYXJjaEhpc3RvcnlTZXJ2aWNlKCk7XG5cdFx0fSkpO1xuXG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5zdG9yYWdlU2VydmljZS5vbkRpZENoYW5nZVZhbHVlKFN0b3JhZ2VTY29wZS5XT1JLU1BBQ0UsIFNlYXJjaEhpc3RvcnlTZXJ2aWNlLlNFQVJDSF9ISVNUT1JZX0tFWSwgdGhpcy5fc3RvcmUpKCgpID0+IHtcblx0XHRcdGNvbnN0IHJlc3RvcmVkSGlzdG9yeSA9IHRoaXMuc2VhcmNoSGlzdG9yeVNlcnZpY2UubG9hZCgpO1xuXG5cdFx0XHRpZiAocmVzdG9yZWRIaXN0b3J5LmluY2x1ZGUpIHtcblx0XHRcdFx0dGhpcy5pbnB1dFBhdHRlcm5JbmNsdWRlcy5wcmVwZW5kSGlzdG9yeShyZXN0b3JlZEhpc3RvcnkuaW5jbHVkZSk7XG5cdFx0XHR9XG5cdFx0XHRpZiAocmVzdG9yZWRIaXN0b3J5LmV4Y2x1ZGUpIHtcblx0XHRcdFx0dGhpcy5pbnB1dFBhdHRlcm5FeGNsdWRlcy5wcmVwZW5kSGlzdG9yeShyZXN0b3JlZEhpc3RvcnkuZXhjbHVkZSk7XG5cdFx0XHR9XG5cdFx0XHRpZiAocmVzdG9yZWRIaXN0b3J5LnNlYXJjaCkge1xuXHRcdFx0XHR0aGlzLnNlYXJjaFdpZGdldC5wcmVwZW5kU2VhcmNoSGlzdG9yeShyZXN0b3JlZEhpc3Rvcnkuc2VhcmNoKTtcblx0XHRcdH1cblx0XHRcdGlmIChyZXN0b3JlZEhpc3RvcnkucmVwbGFjZSkge1xuXHRcdFx0XHR0aGlzLnNlYXJjaFdpZGdldC5wcmVwZW5kUmVwbGFjZUhpc3RvcnkocmVzdG9yZWRIaXN0b3J5LnJlcGxhY2UpO1xuXHRcdFx0fVxuXHRcdH0pKTtcblxuXHRcdHRoaXMuY2hhbmdlZFdoaWxlSGlkZGVuID0gdGhpcy5oYXNTZWFyY2hSZXN1bHRzKCk7XG5cdH1cblxuXHRwdWJsaWMgZ2V0IGNhY2hlZFJlc3VsdHMoKSB7XG5cdFx0cmV0dXJuIHRoaXMuX2NhY2hlZFJlc3VsdHM7XG5cdH1cblxuXHRhc3luYyBxdWV1ZVJlZnJlc2hUcmVlKCk6IFByb21pc2U8dm9pZD4ge1xuXHRcdHJldHVybiB0aGlzLnJlZnJlc2hUcmVlQ29udHJvbGxlci5xdWV1ZSgpO1xuXHR9XG5cdGdldCBpc1RyZWVMYXlvdXRWaWV3VmlzaWJsZSgpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gdGhpcy50cmVlVmlld0tleS5nZXQoKSA/PyBmYWxzZTtcblx0fVxuXG5cdHByaXZhdGUgc2V0IGlzVHJlZUxheW91dFZpZXdWaXNpYmxlKHZpc2libGU6IGJvb2xlYW4pIHtcblx0XHR0aGlzLnRyZWVWaWV3S2V5LnNldCh2aXNpYmxlKTtcblx0fVxuXG5cdGFzeW5jIHNldFRyZWVWaWV3KHZpc2libGU6IGJvb2xlYW4pOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRpZiAodmlzaWJsZSA9PT0gdGhpcy5pc1RyZWVMYXlvdXRWaWV3VmlzaWJsZSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHR0aGlzLmlzVHJlZUxheW91dFZpZXdWaXNpYmxlID0gdmlzaWJsZTtcblx0XHR0aGlzLnVwZGF0ZUluZGVudFN0eWxlcyh0aGlzLnRoZW1lU2VydmljZS5nZXRGaWxlSWNvblRoZW1lKCkpO1xuXHRcdHJldHVybiB0aGlzLnJlZnJlc2hUcmVlQ29udHJvbGxlci5xdWV1ZSgpO1xuXHR9XG5cblx0cHJpdmF0ZSBnZXQgc3RhdGUoKTogU2VhcmNoVUlTdGF0ZSB7XG5cdFx0cmV0dXJuIHRoaXMuc2VhcmNoU3RhdGVLZXkuZ2V0KCkgPz8gU2VhcmNoVUlTdGF0ZS5JZGxlO1xuXHR9XG5cblx0cHJpdmF0ZSBzZXQgc3RhdGUodjogU2VhcmNoVUlTdGF0ZSkge1xuXHRcdHRoaXMuc2VhcmNoU3RhdGVLZXkuc2V0KHYpO1xuXHR9XG5cblx0Z2V0Q29udGFpbmVyKCk6IEhUTUxFbGVtZW50IHtcblx0XHRyZXR1cm4gdGhpcy5jb250YWluZXI7XG5cdH1cblxuXHRnZXQgc2VhcmNoUmVzdWx0KCk6IElTZWFyY2hSZXN1bHQge1xuXHRcdHJldHVybiB0aGlzLnZpZXdNb2RlbCAmJiB0aGlzLnZpZXdNb2RlbC5zZWFyY2hSZXN1bHQ7XG5cdH1cblxuXHRnZXQgbW9kZWwoKTogSVNlYXJjaE1vZGVsIHtcblx0XHRyZXR1cm4gdGhpcy52aWV3TW9kZWw7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIHJlZnJlc2hIYXNBSVNldHRpbmcoKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3Qgc2hvdWxkU2hvd0FJID0gdGhpcy5zaG91bGRTaG93QUlSZXN1bHRzKCk7XG5cdFx0aWYgKCF0aGlzLnRyZWUgfHwgIXRoaXMudHJlZS5oYXNOb2RlKHRoaXMuc2VhcmNoUmVzdWx0KSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRpZiAoc2hvdWxkU2hvd0FJICYmICF0aGlzLnRyZWUuaGFzTm9kZSh0aGlzLnNlYXJjaFJlc3VsdC5haVRleHRTZWFyY2hSZXN1bHQpKSB7XG5cdFx0XHRpZiAodGhpcy5tb2RlbC5zZWFyY2hSZXN1bHQuZ2V0Q2FjaGVkU2VhcmNoQ29tcGxldGUoZmFsc2UpKSB7XG5cdFx0XHRcdHJldHVybiB0aGlzLnJlZnJlc2hBbmRVcGRhdGVDb3VudCgpO1xuXHRcdFx0fVxuXHRcdH0gZWxzZSBpZiAoIXNob3VsZFNob3dBSSAmJiB0aGlzLnRyZWUuaGFzTm9kZSh0aGlzLnNlYXJjaFJlc3VsdC5haVRleHRTZWFyY2hSZXN1bHQpKSB7XG5cdFx0XHRyZXR1cm4gdGhpcy5yZWZyZXNoQW5kVXBkYXRlQ291bnQoKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIG9uRGlkQ2hhbmdlV29ya2JlbmNoU3RhdGUoKTogdm9pZCB7XG5cdFx0aWYgKHRoaXMuY29udGV4dFNlcnZpY2UuZ2V0V29ya2JlbmNoU3RhdGUoKSAhPT0gV29ya2JlbmNoU3RhdGUuRU1QVFkgJiYgdGhpcy5zZWFyY2hXaXRob3V0Rm9sZGVyTWVzc2FnZUVsZW1lbnQpIHtcblx0XHRcdGRvbS5oaWRlKHRoaXMuc2VhcmNoV2l0aG91dEZvbGRlck1lc3NhZ2VFbGVtZW50KTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIHJlZnJlc2hJbnB1dHMoKSB7XG5cdFx0dGhpcy5wYXVzZVNlYXJjaGluZyA9IHRydWU7XG5cdFx0dGhpcy5zZWFyY2hXaWRnZXQuc2V0VmFsdWUodGhpcy52aWV3TW9kZWwuc2VhcmNoUmVzdWx0LnF1ZXJ5Py5jb250ZW50UGF0dGVybi5wYXR0ZXJuID8/ICcnKTtcblx0XHR0aGlzLnNlYXJjaFdpZGdldC5zZXRSZXBsYWNlQWxsQWN0aW9uU3RhdGUoZmFsc2UpO1xuXHRcdHRoaXMuc2VhcmNoV2lkZ2V0LnRvZ2dsZVJlcGxhY2UodHJ1ZSk7XG5cdFx0dGhpcy5pbnB1dFBhdHRlcm5JbmNsdWRlcy5zZXRPbmx5U2VhcmNoSW5PcGVuRWRpdG9ycyh0aGlzLnZpZXdNb2RlbC5zZWFyY2hSZXN1bHQucXVlcnk/Lm9ubHlPcGVuRWRpdG9ycyB8fCBmYWxzZSk7XG5cdFx0dGhpcy5pbnB1dFBhdHRlcm5FeGNsdWRlcy5zZXRVc2VFeGNsdWRlc0FuZElnbm9yZUZpbGVzKCF0aGlzLnZpZXdNb2RlbC5zZWFyY2hSZXN1bHQucXVlcnk/LnVzZXJEaXNhYmxlZEV4Y2x1ZGVzQW5kSWdub3JlRmlsZXMgfHwgdHJ1ZSk7XG5cdFx0dGhpcy5zZWFyY2hJbmNsdWRlUGF0dGVybi5zZXRWYWx1ZSgnJyk7XG5cdFx0dGhpcy5zZWFyY2hFeGNsdWRlUGF0dGVybi5zZXRWYWx1ZSgnJyk7XG5cdFx0dGhpcy5wYXVzZVNlYXJjaGluZyA9IGZhbHNlO1xuXHR9XG5cblx0cHVibGljIGFzeW5jIHJlcGxhY2VTZWFyY2hNb2RlbChzZWFyY2hNb2RlbDogSVNlYXJjaE1vZGVsLCBhc3luY1Jlc3VsdHM6IFByb21pc2U8SVNlYXJjaENvbXBsZXRlPik6IFByb21pc2U8dm9pZD4ge1xuXHRcdGxldCBwcm9ncmVzc0NvbXBsZXRlOiAoKSA9PiB2b2lkO1xuXHRcdHRoaXMucHJvZ3Jlc3NTZXJ2aWNlLndpdGhQcm9ncmVzcyh7IGxvY2F0aW9uOiB0aGlzLmdldFByb2dyZXNzTG9jYXRpb24oKSwgZGVsYXk6IDAgfSwgX3Byb2dyZXNzID0+IHtcblx0XHRcdHJldHVybiBuZXcgUHJvbWlzZTx2b2lkPihyZXNvbHZlID0+IHByb2dyZXNzQ29tcGxldGUgPSByZXNvbHZlKTtcblx0XHR9KTtcblxuXHRcdGNvbnN0IHNsb3dUaW1lciA9IHNldFRpbWVvdXQoKCkgPT4ge1xuXHRcdFx0dGhpcy5zdGF0ZSA9IFNlYXJjaFVJU3RhdGUuU2xvd1NlYXJjaDtcblx0XHR9LCAyMDAwKTtcblxuXHRcdHRoaXMuX3JlZnJlc2hSZXN1bHRzU2NoZWR1bGVyLnNjaGVkdWxlKCk7XG5cblx0XHQvLyByZW1vdmUgb2xkIG1vZGVsIGFuZCB1c2UgdGhlIG5ldyBzZWFyY2hNb2RlbFxuXHRcdHNlYXJjaE1vZGVsLmxvY2F0aW9uID0gU2VhcmNoTW9kZWxMb2NhdGlvbi5QQU5FTDtcblx0XHRzZWFyY2hNb2RlbC5yZXBsYWNlQWN0aXZlID0gdGhpcy52aWV3TW9kZWwuaXNSZXBsYWNlQWN0aXZlKCk7XG5cdFx0c2VhcmNoTW9kZWwucmVwbGFjZVN0cmluZyA9IHRoaXMuc2VhcmNoV2lkZ2V0LmdldFJlcGxhY2VWYWx1ZSgpO1xuXHRcdHRoaXMuX29uU2VhcmNoUmVzdWx0Q2hhbmdlZERpc3Bvc2FibGU/LmRpc3Bvc2UoKTtcblx0XHR0aGlzLl9vblNlYXJjaFJlc3VsdENoYW5nZWREaXNwb3NhYmxlID0gdGhpcy5fcmVnaXN0ZXIoc2VhcmNoTW9kZWwub25TZWFyY2hSZXN1bHRDaGFuZ2VkKGFzeW5jIChldmVudCkgPT4gdGhpcy5vblNlYXJjaFJlc3VsdHNDaGFuZ2VkKGV2ZW50KSkpO1xuXG5cdFx0Ly8gdGhpcyBjYWxsIHdpbGwgYWxzbyBkaXNwb3NlIG9mIHRoZSBvbGQgbW9kZWxcblx0XHR0aGlzLnNlYXJjaFZpZXdNb2RlbFdvcmtiZW5jaFNlcnZpY2Uuc2VhcmNoTW9kZWwgPSBzZWFyY2hNb2RlbDtcblx0XHR0aGlzLnZpZXdNb2RlbCA9IHNlYXJjaE1vZGVsO1xuXHRcdHRoaXMudHJlZS5zZXRJbnB1dCh0aGlzLnZpZXdNb2RlbC5zZWFyY2hSZXN1bHQpO1xuXG5cdFx0YXdhaXQgdGhpcy5vblNlYXJjaFJlc3VsdHNDaGFuZ2VkKCk7XG5cdFx0dGhpcy5yZWZyZXNoSW5wdXRzKCk7XG5cblx0XHRhc3luY1Jlc3VsdHMudGhlbigoY29tcGxldGUpID0+IHtcblx0XHRcdGNsZWFyVGltZW91dChzbG93VGltZXIpO1xuXHRcdFx0cmV0dXJuIHRoaXMub25TZWFyY2hDb21wbGV0ZShwcm9ncmVzc0NvbXBsZXRlLCB1bmRlZmluZWQsIHVuZGVmaW5lZCwgY29tcGxldGUpO1xuXHRcdH0sIChlKSA9PiB7XG5cdFx0XHRjbGVhclRpbWVvdXQoc2xvd1RpbWVyKTtcblx0XHRcdHJldHVybiB0aGlzLm9uU2VhcmNoRXJyb3IoZSwgcHJvZ3Jlc3NDb21wbGV0ZSwgdW5kZWZpbmVkLCB1bmRlZmluZWQpO1xuXHRcdH0pO1xuXG5cdFx0YXdhaXQgdGhpcy5leHBhbmRJZlNpbmd1bGFyUmVzdWx0KCk7XG5cdH1cblxuXHRwcm90ZWN0ZWQgb3ZlcnJpZGUgcmVuZGVyQm9keShwYXJlbnQ6IEhUTUxFbGVtZW50KTogdm9pZCB7XG5cdFx0c3VwZXIucmVuZGVyQm9keShwYXJlbnQpO1xuXHRcdHRoaXMuY29udGFpbmVyID0gZG9tLmFwcGVuZChwYXJlbnQsIGRvbS4kKCcuc2VhcmNoLXZpZXcnKSk7XG5cblx0XHR0aGlzLnNlYXJjaFdpZGdldHNDb250YWluZXJFbGVtZW50ID0gZG9tLmFwcGVuZCh0aGlzLmNvbnRhaW5lciwgJCgnLnNlYXJjaC13aWRnZXRzLWNvbnRhaW5lcicpKTtcblx0XHR0aGlzLmNyZWF0ZVNlYXJjaFdpZGdldCh0aGlzLnNlYXJjaFdpZGdldHNDb250YWluZXJFbGVtZW50KTtcblxuXHRcdGNvbnN0IGhpc3RvcnkgPSB0aGlzLnNlYXJjaEhpc3RvcnlTZXJ2aWNlLmxvYWQoKTtcblx0XHRjb25zdCBmaWxlUGF0dGVybnMgPSB0aGlzLnZpZXdsZXRTdGF0ZS5xdWVyeT8uZmlsZVBhdHRlcm5zIHx8ICcnO1xuXHRcdGNvbnN0IHBhdHRlcm5FeGNsdXNpb25zID0gdGhpcy52aWV3bGV0U3RhdGUucXVlcnk/LmZvbGRlckV4Y2x1c2lvbnMgfHwgJyc7XG5cdFx0Y29uc3QgcGF0dGVybkV4Y2x1c2lvbnNIaXN0b3J5OiBzdHJpbmdbXSA9IGhpc3RvcnkuZXhjbHVkZSB8fCBbXTtcblx0XHRjb25zdCBwYXR0ZXJuSW5jbHVkZXMgPSB0aGlzLnZpZXdsZXRTdGF0ZS5xdWVyeT8uZm9sZGVySW5jbHVkZXMgfHwgJyc7XG5cdFx0Y29uc3QgcGF0dGVybkluY2x1ZGVzSGlzdG9yeTogc3RyaW5nW10gPSBoaXN0b3J5LmluY2x1ZGUgfHwgW107XG5cdFx0Y29uc3Qgb25seU9wZW5FZGl0b3JzID0gdGhpcy52aWV3bGV0U3RhdGUucXVlcnk/Lm9ubHlPcGVuRWRpdG9ycyB8fCBmYWxzZTtcblxuXHRcdGNvbnN0IHF1ZXJ5RGV0YWlsc0V4cGFuZGVkID0gdGhpcy52aWV3bGV0U3RhdGUucXVlcnk/LnF1ZXJ5RGV0YWlsc0V4cGFuZGVkIHx8ICcnO1xuXHRcdGNvbnN0IHVzZUV4Y2x1ZGVzQW5kSWdub3JlRmlsZXMgPSB0eXBlb2YgdGhpcy52aWV3bGV0U3RhdGUucXVlcnk/LnVzZUV4Y2x1ZGVzQW5kSWdub3JlRmlsZXMgPT09ICdib29sZWFuJyA/XG5cdFx0XHR0aGlzLnZpZXdsZXRTdGF0ZS5xdWVyeS51c2VFeGNsdWRlc0FuZElnbm9yZUZpbGVzIDogdHJ1ZTtcblxuXHRcdHRoaXMucXVlcnlEZXRhaWxzID0gZG9tLmFwcGVuZCh0aGlzLnNlYXJjaFdpZGdldHNDb250YWluZXJFbGVtZW50LCAkKCcucXVlcnktZGV0YWlscycpKTtcblxuXHRcdC8vIFRvZ2dsZSBxdWVyeSBkZXRhaWxzIGJ1dHRvblxuXHRcdGNvbnN0IHRvZ2dsZVF1ZXJ5RGV0YWlsc0xhYmVsID0gbmxzLmxvY2FsaXplKCdtb3JlU2VhcmNoJywgXCJUb2dnbGUgU2VhcmNoIERldGFpbHNcIik7XG5cdFx0dGhpcy50b2dnbGVRdWVyeURldGFpbHNCdXR0b24gPSBkb20uYXBwZW5kKHRoaXMucXVlcnlEZXRhaWxzLFxuXHRcdFx0JCgnLm1vcmUnICsgVGhlbWVJY29uLmFzQ1NTU2VsZWN0b3Ioc2VhcmNoRGV0YWlsc0ljb24pLCB7IHRhYmluZGV4OiAwLCByb2xlOiAnYnV0dG9uJywgJ2FyaWEtbGFiZWwnOiB0b2dnbGVRdWVyeURldGFpbHNMYWJlbCB9KSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5ob3ZlclNlcnZpY2Uuc2V0dXBNYW5hZ2VkSG92ZXIoZ2V0RGVmYXVsdEhvdmVyRGVsZWdhdGUoJ2VsZW1lbnQnKSwgdGhpcy50b2dnbGVRdWVyeURldGFpbHNCdXR0b24sIHRoaXMua2V5YmluZGluZ1NlcnZpY2UuYXBwZW5kS2V5YmluZGluZyh0b2dnbGVRdWVyeURldGFpbHNMYWJlbCwgQ29uc3RhbnRzLlNlYXJjaENvbW1hbmRJZHMuVG9nZ2xlUXVlcnlEZXRhaWxzQWN0aW9uSWQpKSk7XG5cblx0XHR0aGlzLl9yZWdpc3Rlcihkb20uYWRkRGlzcG9zYWJsZUxpc3RlbmVyKHRoaXMudG9nZ2xlUXVlcnlEZXRhaWxzQnV0dG9uLCBkb20uRXZlbnRUeXBlLkNMSUNLLCBlID0+IHtcblx0XHRcdGRvbS5FdmVudEhlbHBlci5zdG9wKGUpO1xuXHRcdFx0dGhpcy50b2dnbGVRdWVyeURldGFpbHMoIXRoaXMuYWNjZXNzaWJpbGl0eVNlcnZpY2UuaXNTY3JlZW5SZWFkZXJPcHRpbWl6ZWQoKSk7XG5cdFx0fSkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKGRvbS5hZGREaXNwb3NhYmxlTGlzdGVuZXIodGhpcy50b2dnbGVRdWVyeURldGFpbHNCdXR0b24sIGRvbS5FdmVudFR5cGUuS0VZX1VQLCAoZTogS2V5Ym9hcmRFdmVudCkgPT4ge1xuXHRcdFx0Y29uc3QgZXZlbnQgPSBuZXcgU3RhbmRhcmRLZXlib2FyZEV2ZW50KGUpO1xuXG5cdFx0XHRpZiAoZXZlbnQuZXF1YWxzKEtleUNvZGUuRW50ZXIpIHx8IGV2ZW50LmVxdWFscyhLZXlDb2RlLlNwYWNlKSkge1xuXHRcdFx0XHRkb20uRXZlbnRIZWxwZXIuc3RvcChlKTtcblx0XHRcdFx0dGhpcy50b2dnbGVRdWVyeURldGFpbHMoZmFsc2UpO1xuXHRcdFx0fVxuXHRcdH0pKTtcblx0XHR0aGlzLl9yZWdpc3Rlcihkb20uYWRkRGlzcG9zYWJsZUxpc3RlbmVyKHRoaXMudG9nZ2xlUXVlcnlEZXRhaWxzQnV0dG9uLCBkb20uRXZlbnRUeXBlLktFWV9ET1dOLCAoZTogS2V5Ym9hcmRFdmVudCkgPT4ge1xuXHRcdFx0Y29uc3QgZXZlbnQgPSBuZXcgU3RhbmRhcmRLZXlib2FyZEV2ZW50KGUpO1xuXG5cdFx0XHRpZiAoZXZlbnQuZXF1YWxzKEtleU1vZC5TaGlmdCB8IEtleUNvZGUuVGFiKSkge1xuXHRcdFx0XHRpZiAodGhpcy5zZWFyY2hXaWRnZXQuaXNSZXBsYWNlQWN0aXZlKCkpIHtcblx0XHRcdFx0XHR0aGlzLnNlYXJjaFdpZGdldC5mb2N1c1JlcGxhY2VBbGxBY3Rpb24oKTtcblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHR0aGlzLnNlYXJjaFdpZGdldC5pc1JlcGxhY2VTaG93bigpID8gdGhpcy5zZWFyY2hXaWRnZXQucmVwbGFjZUlucHV0Py5mb2N1c09uUHJlc2VydmUoKSA6IHRoaXMuc2VhcmNoV2lkZ2V0LmZvY3VzUmVnZXhBY3Rpb24oKTtcblx0XHRcdFx0fVxuXHRcdFx0XHRkb20uRXZlbnRIZWxwZXIuc3RvcChlKTtcblx0XHRcdH1cblx0XHR9KSk7XG5cblx0XHQvLyBmb2xkZXIgaW5jbHVkZXMgbGlzdFxuXHRcdGNvbnN0IGZvbGRlckluY2x1ZGVzTGlzdCA9IGRvbS5hcHBlbmQodGhpcy5xdWVyeURldGFpbHMsICQoJy5maWxlLXR5cGVzLmluY2x1ZGVzJykpO1xuXHRcdGNvbnN0IGZpbGVzVG9JbmNsdWRlVGl0bGUgPSBubHMubG9jYWxpemUoJ3NlYXJjaFNjb3BlLmluY2x1ZGVzJywgXCJmaWxlcyB0byBpbmNsdWRlXCIpO1xuXHRcdGRvbS5hcHBlbmQoZm9sZGVySW5jbHVkZXNMaXN0LCAkKCdoNCcsIHVuZGVmaW5lZCwgZmlsZXNUb0luY2x1ZGVUaXRsZSkpO1xuXG5cdFx0dGhpcy5pbnB1dFBhdHRlcm5JbmNsdWRlcyA9IHRoaXMuX3JlZ2lzdGVyKHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoSW5jbHVkZVBhdHRlcm5JbnB1dFdpZGdldCwgZm9sZGVySW5jbHVkZXNMaXN0LCB0aGlzLmNvbnRleHRWaWV3U2VydmljZSwge1xuXHRcdFx0YXJpYUxhYmVsOiBmaWxlc1RvSW5jbHVkZVRpdGxlLFxuXHRcdFx0cGxhY2Vob2xkZXI6IG5scy5sb2NhbGl6ZSgncGxhY2Vob2xkZXIuaW5jbHVkZXMnLCBcImUuZy4gKi50cywgc3JjLyoqL2luY2x1ZGVcIiksXG5cdFx0XHRzaG93UGxhY2Vob2xkZXJPbkZvY3VzOiB0cnVlLFxuXHRcdFx0aGlzdG9yeTogcGF0dGVybkluY2x1ZGVzSGlzdG9yeSxcblx0XHRcdGlucHV0Qm94U3R5bGVzOiBkZWZhdWx0SW5wdXRCb3hTdHlsZXNcblx0XHR9KSk7XG5cblx0XHR0aGlzLmlucHV0UGF0dGVybkluY2x1ZGVzLnNldFZhbHVlKHBhdHRlcm5JbmNsdWRlcyk7XG5cdFx0dGhpcy5pbnB1dFBhdHRlcm5JbmNsdWRlcy5zZXRPbmx5U2VhcmNoSW5PcGVuRWRpdG9ycyhvbmx5T3BlbkVkaXRvcnMpO1xuXHRcdHRoaXMuaW5wdXRQYXR0ZXJuSW5jbHVkZXMuc2V0T25seVNlYXJjaEluQ2hhbmdlZEZpbGVzRW5hYmxlZChcblx0XHRcdFsuLi50aGlzLnNjbVNlcnZpY2UucmVwb3NpdG9yaWVzXS5zb21lKHJlcG8gPT4gcmVwby5wcm92aWRlci5ncm91cHMuc29tZShncm91cCA9PiBncm91cC5yZXNvdXJjZXMubGVuZ3RoID4gMCkpXG5cdFx0KTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuaW5wdXRQYXR0ZXJuSW5jbHVkZXMub25DYW5jZWwoKCkgPT4gdGhpcy5jYW5jZWxTZWFyY2goZmFsc2UpKSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5pbnB1dFBhdHRlcm5JbmNsdWRlcy5vbkNoYW5nZVNlYXJjaEluRWRpdG9yc0JveCgoKSA9PiB0aGlzLnRyaWdnZXJRdWVyeUNoYW5nZSgpKSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5pbnB1dFBhdHRlcm5JbmNsdWRlcy5vbkNoYW5nZVNlYXJjaEluQ2hhbmdlZEZpbGVzQm94KCgpID0+IHRoaXMudHJpZ2dlclF1ZXJ5Q2hhbmdlKCkpKTtcblxuXHRcdHRoaXMudHJhY2tJbnB1dEJveCh0aGlzLmlucHV0UGF0dGVybkluY2x1ZGVzLmlucHV0Rm9jdXNUcmFja2VyLCB0aGlzLmlucHV0UGF0dGVybkluY2x1ZGVzRm9jdXNlZCk7XG5cblx0XHQvLyBleGNsdWRlcyBsaXN0XG5cdFx0Y29uc3QgZXhjbHVkZXNMaXN0ID0gZG9tLmFwcGVuZCh0aGlzLnF1ZXJ5RGV0YWlscywgJCgnLmZpbGUtdHlwZXMuZXhjbHVkZXMnKSk7XG5cdFx0Y29uc3QgZXhjbHVkZXNUaXRsZSA9IG5scy5sb2NhbGl6ZSgnc2VhcmNoU2NvcGUuZXhjbHVkZXMnLCBcImZpbGVzIHRvIGV4Y2x1ZGVcIik7XG5cdFx0ZG9tLmFwcGVuZChleGNsdWRlc0xpc3QsICQoJ2g0JywgdW5kZWZpbmVkLCBleGNsdWRlc1RpdGxlKSk7XG5cdFx0dGhpcy5pbnB1dFBhdHRlcm5FeGNsdWRlcyA9IHRoaXMuX3JlZ2lzdGVyKHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoRXhjbHVkZVBhdHRlcm5JbnB1dFdpZGdldCwgZXhjbHVkZXNMaXN0LCB0aGlzLmNvbnRleHRWaWV3U2VydmljZSwge1xuXHRcdFx0YXJpYUxhYmVsOiBleGNsdWRlc1RpdGxlLFxuXHRcdFx0cGxhY2Vob2xkZXI6IG5scy5sb2NhbGl6ZSgncGxhY2Vob2xkZXIuZXhjbHVkZXMnLCBcImUuZy4gKi50cywgc3JjLyoqL2V4Y2x1ZGVcIiksXG5cdFx0XHRzaG93UGxhY2Vob2xkZXJPbkZvY3VzOiB0cnVlLFxuXHRcdFx0aGlzdG9yeTogcGF0dGVybkV4Y2x1c2lvbnNIaXN0b3J5LFxuXHRcdFx0aW5wdXRCb3hTdHlsZXM6IGRlZmF1bHRJbnB1dEJveFN0eWxlc1xuXHRcdH0pKTtcblxuXHRcdHRoaXMuaW5wdXRQYXR0ZXJuRXhjbHVkZXMuc2V0VmFsdWUocGF0dGVybkV4Y2x1c2lvbnMpO1xuXHRcdHRoaXMuaW5wdXRQYXR0ZXJuRXhjbHVkZXMuc2V0VXNlRXhjbHVkZXNBbmRJZ25vcmVGaWxlcyh1c2VFeGNsdWRlc0FuZElnbm9yZUZpbGVzKTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuaW5wdXRQYXR0ZXJuRXhjbHVkZXMub25DYW5jZWwoKCkgPT4gdGhpcy5jYW5jZWxTZWFyY2goZmFsc2UpKSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5pbnB1dFBhdHRlcm5FeGNsdWRlcy5vbkNoYW5nZUlnbm9yZUJveCgoKSA9PiB0aGlzLnRyaWdnZXJRdWVyeUNoYW5nZSgpKSk7XG5cdFx0dGhpcy50cmFja0lucHV0Qm94KHRoaXMuaW5wdXRQYXR0ZXJuRXhjbHVkZXMuaW5wdXRGb2N1c1RyYWNrZXIsIHRoaXMuaW5wdXRQYXR0ZXJuRXhjbHVzaW9uc0ZvY3VzZWQpO1xuXG5cdFx0Y29uc3QgdXBkYXRlSGFzRmlsZVBhdHRlcm5LZXkgPSAoKSA9PiB0aGlzLmhhc0ZpbGVQYXR0ZXJuS2V5LnNldCh0aGlzLmlucHV0UGF0dGVybkluY2x1ZGVzLmdldFZhbHVlKCkubGVuZ3RoID4gMCB8fCB0aGlzLmlucHV0UGF0dGVybkV4Y2x1ZGVzLmdldFZhbHVlKCkubGVuZ3RoID4gMCk7XG5cdFx0dXBkYXRlSGFzRmlsZVBhdHRlcm5LZXkoKTtcblx0XHRjb25zdCBvbkZpbGVQYXR0ZXJuU3VibWl0ID0gKHRyaWdnZXJlZE9uVHlwZTogYm9vbGVhbikgPT4ge1xuXHRcdFx0dGhpcy50cmlnZ2VyUXVlcnlDaGFuZ2UoeyB0cmlnZ2VyZWRPblR5cGUsIGRlbGF5OiB0aGlzLnNlYXJjaENvbmZpZy5zZWFyY2hPblR5cGVEZWJvdW5jZVBlcmlvZCB9KTtcblx0XHRcdGlmICh0cmlnZ2VyZWRPblR5cGUpIHtcblx0XHRcdFx0dXBkYXRlSGFzRmlsZVBhdHRlcm5LZXkoKTtcblx0XHRcdH1cblx0XHR9O1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuaW5wdXRQYXR0ZXJuSW5jbHVkZXMub25TdWJtaXQob25GaWxlUGF0dGVyblN1Ym1pdCkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuaW5wdXRQYXR0ZXJuRXhjbHVkZXMub25TdWJtaXQob25GaWxlUGF0dGVyblN1Ym1pdCkpO1xuXG5cdFx0dGhpcy5tZXNzYWdlc0VsZW1lbnQgPSBkb20uYXBwZW5kKHRoaXMuY29udGFpbmVyLCAkKCcubWVzc2FnZXMudGV4dC1zZWFyY2gtcHJvdmlkZXItbWVzc2FnZXMnKSk7XG5cdFx0aWYgKHRoaXMuY29udGV4dFNlcnZpY2UuZ2V0V29ya2JlbmNoU3RhdGUoKSA9PT0gV29ya2JlbmNoU3RhdGUuRU1QVFkpIHtcblx0XHRcdHRoaXMuc2hvd1NlYXJjaFdpdGhvdXRGb2xkZXJNZXNzYWdlKCk7XG5cdFx0fVxuXG5cdFx0dGhpcy5jcmVhdGVTZWFyY2hSZXN1bHRzVmlldyh0aGlzLmNvbnRhaW5lcik7XG5cblx0XHRpZiAoZmlsZVBhdHRlcm5zICE9PSAnJyB8fCBwYXR0ZXJuRXhjbHVzaW9ucyAhPT0gJycgfHwgcGF0dGVybkluY2x1ZGVzICE9PSAnJyB8fCBxdWVyeURldGFpbHNFeHBhbmRlZCAhPT0gJycgfHwgIXVzZUV4Y2x1ZGVzQW5kSWdub3JlRmlsZXMpIHtcblx0XHRcdHRoaXMudG9nZ2xlUXVlcnlEZXRhaWxzKHRydWUsIHRydWUsIHRydWUpO1xuXHRcdH1cblxuXHRcdHRoaXMuX29uU2VhcmNoUmVzdWx0Q2hhbmdlZERpc3Bvc2FibGUgPSB0aGlzLl9yZWdpc3Rlcih0aGlzLnZpZXdNb2RlbC5vblNlYXJjaFJlc3VsdENoYW5nZWQoYXN5bmMgKGV2ZW50KSA9PiBhd2FpdCB0aGlzLm9uU2VhcmNoUmVzdWx0c0NoYW5nZWQoZXZlbnQpKSk7XG5cblx0XHQvLyBTdWJzY3JpYmUgdG8gQUkgc2VhcmNoIHJlc3VsdCBjaGFuZ2VzIGFuZCB1cGRhdGUgdGhlIHRyZWUgd2hlbiBuZXcgQUkgcmVzdWx0cyBhcmUgcmVwb3J0ZWRcblx0XHR0aGlzLl9vbkFJUmVzdWx0Q2hhbmdlZERpc3Bvc2FibGU/LmRpc3Bvc2UoKTtcblx0XHR0aGlzLl9vbkFJUmVzdWx0Q2hhbmdlZERpc3Bvc2FibGUgPSB0aGlzLl9yZWdpc3Rlcihcblx0XHRcdHRoaXMudmlld01vZGVsLnNlYXJjaFJlc3VsdC5haVRleHRTZWFyY2hSZXN1bHQub25DaGFuZ2UoKGUpID0+IHtcblx0XHRcdFx0Ly8gT25seSByZWZyZXNoIHRoZSBBSSBub2RlLCBub3QgdGhlIHdob2xlIHRyZWVcblx0XHRcdFx0aWYgKHRoaXMudHJlZSAmJiB0aGlzLnRyZWUuaGFzTm9kZSh0aGlzLnNlYXJjaFJlc3VsdC5haVRleHRTZWFyY2hSZXN1bHQpICYmICFlLnJlbW92ZWQpIHtcblx0XHRcdFx0XHR0aGlzLnRyZWUudXBkYXRlQ2hpbGRyZW4odGhpcy5zZWFyY2hSZXN1bHQuYWlUZXh0U2VhcmNoUmVzdWx0KTtcblx0XHRcdFx0fVxuXHRcdFx0fSlcblx0XHQpO1xuXG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5vbkRpZENoYW5nZUJvZHlWaXNpYmlsaXR5KHZpc2libGUgPT4gdGhpcy5vblZpc2liaWxpdHlDaGFuZ2VkKHZpc2libGUpKSk7XG5cblx0XHR0aGlzLnVwZGF0ZUluZGVudFN0eWxlcyh0aGlzLnRoZW1lU2VydmljZS5nZXRGaWxlSWNvblRoZW1lKCkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMudGhlbWVTZXJ2aWNlLm9uRGlkRmlsZUljb25UaGVtZUNoYW5nZSh0aGlzLnVwZGF0ZUluZGVudFN0eWxlcywgdGhpcykpO1xuXHR9XG5cblx0cHJpdmF0ZSB1cGRhdGVJbmRlbnRTdHlsZXModGhlbWU6IElGaWxlSWNvblRoZW1lKTogdm9pZCB7XG5cdFx0dGhpcy5yZXN1bHRzRWxlbWVudC5jbGFzc0xpc3QudG9nZ2xlKCdoaWRlLWFycm93cycsIHRoaXMuaXNUcmVlTGF5b3V0Vmlld1Zpc2libGUgJiYgdGhlbWUuaGlkZXNFeHBsb3JlckFycm93cyk7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIG9uVmlzaWJpbGl0eUNoYW5nZWQodmlzaWJsZTogYm9vbGVhbik6IFByb21pc2U8dm9pZD4ge1xuXHRcdHRoaXMudmlld2xldFZpc2libGUuc2V0KHZpc2libGUpO1xuXHRcdGlmICh2aXNpYmxlKSB7XG5cdFx0XHRpZiAodGhpcy5jaGFuZ2VkV2hpbGVIaWRkZW4pIHtcblx0XHRcdFx0Ly8gUmVuZGVyIGlmIHJlc3VsdHMgY2hhbmdlZCB3aGlsZSB2aWV3bGV0IHdhcyBoaWRkZW4gLSAjMzc4MThcblx0XHRcdFx0YXdhaXQgdGhpcy5yZWZyZXNoQW5kVXBkYXRlQ291bnQoKTtcblx0XHRcdFx0dGhpcy5jaGFuZ2VkV2hpbGVIaWRkZW4gPSBmYWxzZTtcblx0XHRcdH1cblx0XHR9IGVsc2Uge1xuXHRcdFx0Ly8gUmVzZXQgbGFzdCBmb2N1cyB0byBpbnB1dCB0byBwcmVzZXJ2ZSBvcGVuaW5nIHRoZSB2aWV3bGV0IGFsd2F5cyBmb2N1c2luZyB0aGUgcXVlcnkgZWRpdG9yLlxuXHRcdFx0dGhpcy5sYXN0Rm9jdXNTdGF0ZSA9ICdpbnB1dCc7XG5cdFx0fVxuXG5cdFx0Ly8gRW5hYmxlIGhpZ2hsaWdodHMgaWYgdGhlcmUgYXJlIHNlYXJjaHJlc3VsdHNcblx0XHR0aGlzLnZpZXdNb2RlbD8uc2VhcmNoUmVzdWx0LnRvZ2dsZUhpZ2hsaWdodHModmlzaWJsZSk7XG5cdH1cblxuXHRnZXQgc2VhcmNoQW5kUmVwbGFjZVdpZGdldCgpOiBTZWFyY2hXaWRnZXQge1xuXHRcdHJldHVybiB0aGlzLnNlYXJjaFdpZGdldDtcblx0fVxuXG5cdGdldCBzZWFyY2hJbmNsdWRlUGF0dGVybigpOiBJbmNsdWRlUGF0dGVybklucHV0V2lkZ2V0IHtcblx0XHRyZXR1cm4gdGhpcy5pbnB1dFBhdHRlcm5JbmNsdWRlcztcblx0fVxuXG5cdGdldCBzZWFyY2hFeGNsdWRlUGF0dGVybigpOiBFeGNsdWRlUGF0dGVybklucHV0V2lkZ2V0IHtcblx0XHRyZXR1cm4gdGhpcy5pbnB1dFBhdHRlcm5FeGNsdWRlcztcblx0fVxuXG5cdHByaXZhdGUgY3JlYXRlU2VhcmNoV2lkZ2V0KGNvbnRhaW5lcjogSFRNTEVsZW1lbnQpOiB2b2lkIHtcblx0XHRjb25zdCBjb250ZW50UGF0dGVybiA9IHRoaXMudmlld2xldFN0YXRlLnF1ZXJ5Py5jb250ZW50UGF0dGVybiB8fCAnJztcblx0XHRjb25zdCByZXBsYWNlVGV4dCA9IHRoaXMudmlld2xldFN0YXRlLnF1ZXJ5Py5yZXBsYWNlVGV4dCB8fCAnJztcblx0XHRjb25zdCBpc1JlZ2V4ID0gdGhpcy52aWV3bGV0U3RhdGUucXVlcnk/LnJlZ2V4ID09PSB0cnVlO1xuXHRcdGNvbnN0IGlzV2hvbGVXb3JkcyA9IHRoaXMudmlld2xldFN0YXRlLnF1ZXJ5Py53aG9sZVdvcmRzID09PSB0cnVlO1xuXHRcdGNvbnN0IGlzQ2FzZVNlbnNpdGl2ZSA9IHRoaXMudmlld2xldFN0YXRlLnF1ZXJ5Py5jYXNlU2Vuc2l0aXZlID09PSB0cnVlO1xuXHRcdGNvbnN0IGhpc3RvcnkgPSB0aGlzLnNlYXJjaEhpc3RvcnlTZXJ2aWNlLmxvYWQoKTtcblx0XHRjb25zdCBzZWFyY2hIaXN0b3J5ID0gaGlzdG9yeS5zZWFyY2ggfHwgdGhpcy52aWV3bGV0U3RhdGUucXVlcnk/LnNlYXJjaEhpc3RvcnkgfHwgW107XG5cdFx0Y29uc3QgcmVwbGFjZUhpc3RvcnkgPSBoaXN0b3J5LnJlcGxhY2UgfHwgdGhpcy52aWV3bGV0U3RhdGUucXVlcnk/LnJlcGxhY2VIaXN0b3J5IHx8IFtdO1xuXHRcdGNvbnN0IHNob3dSZXBsYWNlID0gdHlwZW9mIHRoaXMudmlld2xldFN0YXRlLnZpZXc/LnNob3dSZXBsYWNlID09PSAnYm9vbGVhbicgPyB0aGlzLnZpZXdsZXRTdGF0ZS52aWV3LnNob3dSZXBsYWNlIDogdHJ1ZTtcblx0XHRjb25zdCBwcmVzZXJ2ZUNhc2UgPSB0aGlzLnZpZXdsZXRTdGF0ZS5xdWVyeT8ucHJlc2VydmVDYXNlID09PSB0cnVlO1xuXG5cdFx0Y29uc3QgaXNJbk5vdGVib29rTWFya2Rvd25JbnB1dCA9IHRoaXMudmlld2xldFN0YXRlLnF1ZXJ5Py5pc0luTm90ZWJvb2tNYXJrZG93bklucHV0ID8/IHRydWU7XG5cdFx0Y29uc3QgaXNJbk5vdGVib29rTWFya2Rvd25QcmV2aWV3ID0gdGhpcy52aWV3bGV0U3RhdGUucXVlcnk/LmlzSW5Ob3RlYm9va01hcmtkb3duUHJldmlldyA/PyB0cnVlO1xuXHRcdGNvbnN0IGlzSW5Ob3RlYm9va0NlbGxJbnB1dCA9IHRoaXMudmlld2xldFN0YXRlLnF1ZXJ5Py5pc0luTm90ZWJvb2tDZWxsSW5wdXQgPz8gdHJ1ZTtcblx0XHRjb25zdCBpc0luTm90ZWJvb2tDZWxsT3V0cHV0ID0gdGhpcy52aWV3bGV0U3RhdGUucXVlcnk/LmlzSW5Ob3RlYm9va0NlbGxPdXRwdXQgPz8gdHJ1ZTtcblxuXHRcdHRoaXMuc2VhcmNoV2lkZ2V0ID0gdGhpcy5fcmVnaXN0ZXIodGhpcy5pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShTZWFyY2hXaWRnZXQsIGNvbnRhaW5lciwge1xuXHRcdFx0dmFsdWU6IGNvbnRlbnRQYXR0ZXJuLFxuXHRcdFx0cmVwbGFjZVZhbHVlOiByZXBsYWNlVGV4dCxcblx0XHRcdGlzUmVnZXg6IGlzUmVnZXgsXG5cdFx0XHRpc0Nhc2VTZW5zaXRpdmU6IGlzQ2FzZVNlbnNpdGl2ZSxcblx0XHRcdGlzV2hvbGVXb3JkczogaXNXaG9sZVdvcmRzLFxuXHRcdFx0c2VhcmNoSGlzdG9yeTogc2VhcmNoSGlzdG9yeSxcblx0XHRcdHJlcGxhY2VIaXN0b3J5OiByZXBsYWNlSGlzdG9yeSxcblx0XHRcdHByZXNlcnZlQ2FzZTogcHJlc2VydmVDYXNlLFxuXHRcdFx0aW5wdXRCb3hTdHlsZXM6IGRlZmF1bHRJbnB1dEJveFN0eWxlcyxcblx0XHRcdHRvZ2dsZVN0eWxlczogZGVmYXVsdFRvZ2dsZVN0eWxlcyxcblx0XHRcdG5vdGVib29rT3B0aW9uczoge1xuXHRcdFx0XHRpc0luTm90ZWJvb2tNYXJrZG93bklucHV0LFxuXHRcdFx0XHRpc0luTm90ZWJvb2tNYXJrZG93blByZXZpZXcsXG5cdFx0XHRcdGlzSW5Ob3RlYm9va0NlbGxJbnB1dCxcblx0XHRcdFx0aXNJbk5vdGVib29rQ2VsbE91dHB1dCxcblx0XHRcdH1cblx0XHR9KSk7XG5cblx0XHRpZiAoIXRoaXMuc2VhcmNoV2lkZ2V0LnNlYXJjaElucHV0IHx8ICF0aGlzLnNlYXJjaFdpZGdldC5yZXBsYWNlSW5wdXQpIHtcblx0XHRcdHRoaXMubG9nU2VydmljZS53YXJuKGBDYW5ub3QgZnVsbHkgY3JlYXRlIHNlYXJjaCB3aWRnZXQuIFNlYXJjaCBvciByZXBsYWNlIGlucHV0IHVuZGVmaW5lZC4gU2VhcmNoSW5wdXQ6ICR7dGhpcy5zZWFyY2hXaWRnZXQuc2VhcmNoSW5wdXR9LCBSZXBsYWNlSW5wdXQ6ICR7dGhpcy5zZWFyY2hXaWRnZXQucmVwbGFjZUlucHV0fWApO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGlmIChzaG93UmVwbGFjZSkge1xuXHRcdFx0dGhpcy5zZWFyY2hXaWRnZXQudG9nZ2xlUmVwbGFjZSh0cnVlKTtcblx0XHR9XG5cblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLnNlYXJjaFdpZGdldC5vblNlYXJjaFN1Ym1pdChvcHRpb25zID0+IHtcblx0XHRcdGNvbnN0IHNob3VsZFJlbmRlckFJUmVzdWx0cyA9IHRoaXMuY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0VmFsdWU8SVNlYXJjaENvbmZpZ3VyYXRpb25Qcm9wZXJ0aWVzPignc2VhcmNoJykuc2VhcmNoVmlldy5zZW1hbnRpY1NlYXJjaEJlaGF2aW9yO1xuXHRcdFx0aWYgKHNob3VsZFJlbmRlckFJUmVzdWx0cyA9PT0gU2VtYW50aWNTZWFyY2hCZWhhdmlvci5BdXRvKSB7XG5cdFx0XHRcdHRoaXMubG9nU2VydmljZS5pbmZvKGBTZWFyY2hWaWV3OiBBdXRvbWF0aWNhbGx5IHJlbmRlcmluZyBBSSByZXN1bHRzYCk7XG5cdFx0XHR9XG5cdFx0XHR0aGlzLnRyaWdnZXJRdWVyeUNoYW5nZSh7XG5cdFx0XHRcdC4uLm9wdGlvbnMsXG5cdFx0XHRcdHNob3VsZEtlZXBBSVJlc3VsdHM6IGZhbHNlLFxuXHRcdFx0XHRzaG91bGRVcGRhdGVBSVNlYXJjaDogc2hvdWxkUmVuZGVyQUlSZXN1bHRzID09PSBTZW1hbnRpY1NlYXJjaEJlaGF2aW9yLkF1dG8sXG5cdFx0XHR9KTtcblx0XHR9KSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5zZWFyY2hXaWRnZXQub25TZWFyY2hDYW5jZWwoKHsgZm9jdXMgfSkgPT4gdGhpcy5jYW5jZWxTZWFyY2goZm9jdXMpKSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5zZWFyY2hXaWRnZXQuc2VhcmNoSW5wdXQub25EaWRPcHRpb25DaGFuZ2UoKCkgPT4ge1xuXHRcdFx0dGhpcy50cmlnZ2VyUXVlcnlDaGFuZ2UoeyBzaG91bGRLZWVwQUlSZXN1bHRzOiB0cnVlIH0pO1xuXHRcdH0pKTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuc2VhcmNoV2lkZ2V0LmdldE5vdGVib29rRmlsdGVycygpLm9uRGlkQ2hhbmdlKCgpID0+IHRoaXMudHJpZ2dlclF1ZXJ5Q2hhbmdlKHsgc2hvdWxkS2VlcEFJUmVzdWx0czogdHJ1ZSB9KSkpO1xuXG5cdFx0Y29uc3QgdXBkYXRlSGFzUGF0dGVybktleSA9ICgpID0+IHRoaXMuaGFzU2VhcmNoUGF0dGVybktleS5zZXQodGhpcy5zZWFyY2hXaWRnZXQuc2VhcmNoSW5wdXQgPyAodGhpcy5zZWFyY2hXaWRnZXQuc2VhcmNoSW5wdXQuZ2V0VmFsdWUoKS5sZW5ndGggPiAwKSA6IGZhbHNlKTtcblx0XHR1cGRhdGVIYXNQYXR0ZXJuS2V5KCk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5zZWFyY2hXaWRnZXQuc2VhcmNoSW5wdXQub25EaWRDaGFuZ2UoKCkgPT4gdXBkYXRlSGFzUGF0dGVybktleSgpKSk7XG5cblx0XHRjb25zdCB1cGRhdGVIYXNSZXBsYWNlUGF0dGVybktleSA9ICgpID0+IHRoaXMuaGFzUmVwbGFjZVBhdHRlcm5LZXkuc2V0KHRoaXMuc2VhcmNoV2lkZ2V0LmdldFJlcGxhY2VWYWx1ZSgpLmxlbmd0aCA+IDApO1xuXHRcdHVwZGF0ZUhhc1JlcGxhY2VQYXR0ZXJuS2V5KCk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5zZWFyY2hXaWRnZXQucmVwbGFjZUlucHV0LmlucHV0Qm94Lm9uRGlkQ2hhbmdlKCgpID0+IHVwZGF0ZUhhc1JlcGxhY2VQYXR0ZXJuS2V5KCkpKTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuc2VhcmNoV2lkZ2V0Lm9uRGlkSGVpZ2h0Q2hhbmdlKCgpID0+IHRoaXMucmVMYXlvdXQoKSkpO1xuXG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5zZWFyY2hXaWRnZXQub25SZXBsYWNlVG9nZ2xlZCgoKSA9PiB0aGlzLnJlTGF5b3V0KCkpKTtcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLnNlYXJjaFdpZGdldC5vblJlcGxhY2VTdGF0ZUNoYW5nZShhc3luYyAoc3RhdGUpID0+IHtcblx0XHRcdHRoaXMudmlld01vZGVsLnJlcGxhY2VBY3RpdmUgPSBzdGF0ZTtcblx0XHRcdGF3YWl0IHRoaXMucmVmcmVzaFRyZWVDb250cm9sbGVyLnF1ZXVlKCk7XG5cdFx0fSkpO1xuXG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5zZWFyY2hXaWRnZXQub25QcmVzZXJ2ZUNhc2VDaGFuZ2UoYXN5bmMgKHN0YXRlKSA9PiB7XG5cdFx0XHR0aGlzLnZpZXdNb2RlbC5wcmVzZXJ2ZUNhc2UgPSBzdGF0ZTtcblx0XHRcdGF3YWl0IHRoaXMucmVmcmVzaFRyZWVDb250cm9sbGVyLnF1ZXVlKCk7XG5cdFx0fSkpO1xuXG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5zZWFyY2hXaWRnZXQub25SZXBsYWNlVmFsdWVDaGFuZ2VkKCgpID0+IHtcblx0XHRcdHRoaXMudmlld01vZGVsLnJlcGxhY2VTdHJpbmcgPSB0aGlzLnNlYXJjaFdpZGdldC5nZXRSZXBsYWNlVmFsdWUoKTtcblx0XHRcdHRoaXMuZGVsYXllZFJlZnJlc2gudHJpZ2dlcihhc3luYyAoKSA9PiB0aGlzLnJlZnJlc2hUcmVlQ29udHJvbGxlci5xdWV1ZSgpKTtcblx0XHR9KSk7XG5cblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLnNlYXJjaFdpZGdldC5vbkJsdXIoKCkgPT4ge1xuXHRcdFx0dGhpcy50b2dnbGVRdWVyeURldGFpbHNCdXR0b24uZm9jdXMoKTtcblx0XHR9KSk7XG5cblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLnNlYXJjaFdpZGdldC5vblJlcGxhY2VBbGwoKCkgPT4gdGhpcy5yZXBsYWNlQWxsKCkpKTtcblxuXHRcdHRoaXMudHJhY2tJbnB1dEJveCh0aGlzLnNlYXJjaFdpZGdldC5zZWFyY2hJbnB1dEZvY3VzVHJhY2tlcik7XG5cdFx0dGhpcy50cmFja0lucHV0Qm94KHRoaXMuc2VhcmNoV2lkZ2V0LnJlcGxhY2VJbnB1dEZvY3VzVHJhY2tlcik7XG5cdH1cblxuXHRwdWJsaWMgc2hvdWxkU2hvd0FJUmVzdWx0cygpOiBib29sZWFuIHtcblx0XHRjb25zdCBoYXNQcm92aWRlciA9IENvbnN0YW50cy5TZWFyY2hDb250ZXh0Lmhhc0FJUmVzdWx0UHJvdmlkZXIuZ2V0VmFsdWUodGhpcy5jb250ZXh0S2V5U2VydmljZSk7XG5cdFx0cmV0dXJuICEhaGFzUHJvdmlkZXI7XG5cdH1cblx0cHJpdmF0ZSBhc3luYyBvbkNvbmZpZ3VyYXRpb25VcGRhdGVkKGV2ZW50PzogSUNvbmZpZ3VyYXRpb25DaGFuZ2VFdmVudCk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGlmIChldmVudCAmJiAoZXZlbnQuYWZmZWN0c0NvbmZpZ3VyYXRpb24oJ3NlYXJjaC5kZWNvcmF0aW9ucy5jb2xvcnMnKSB8fCBldmVudC5hZmZlY3RzQ29uZmlndXJhdGlvbignc2VhcmNoLmRlY29yYXRpb25zLmJhZGdlcycpKSkge1xuXHRcdFx0cmV0dXJuIHRoaXMucmVmcmVzaFRyZWVDb250cm9sbGVyLnF1ZXVlKCk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSB0cmFja0lucHV0Qm94KGlucHV0Rm9jdXNUcmFja2VyOiBkb20uSUZvY3VzVHJhY2tlciB8IHVuZGVmaW5lZCwgY29udGV4dEtleT86IElDb250ZXh0S2V5PGJvb2xlYW4+KTogdm9pZCB7XG5cdFx0aWYgKCFpbnB1dEZvY3VzVHJhY2tlcikge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdHRoaXMuX3JlZ2lzdGVyKGlucHV0Rm9jdXNUcmFja2VyLm9uRGlkRm9jdXMoKCkgPT4ge1xuXHRcdFx0dGhpcy5sYXN0Rm9jdXNTdGF0ZSA9ICdpbnB1dCc7XG5cdFx0XHR0aGlzLmlucHV0Qm94Rm9jdXNlZC5zZXQodHJ1ZSk7XG5cdFx0XHRjb250ZXh0S2V5Py5zZXQodHJ1ZSk7XG5cdFx0fSkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKGlucHV0Rm9jdXNUcmFja2VyLm9uRGlkQmx1cigoKSA9PiB7XG5cdFx0XHR0aGlzLmlucHV0Qm94Rm9jdXNlZC5zZXQodGhpcy5zZWFyY2hXaWRnZXQuc2VhcmNoSW5wdXRIYXNGb2N1cygpXG5cdFx0XHRcdHx8IHRoaXMuc2VhcmNoV2lkZ2V0LnJlcGxhY2VJbnB1dEhhc0ZvY3VzKClcblx0XHRcdFx0fHwgdGhpcy5pbnB1dFBhdHRlcm5JbmNsdWRlcy5pbnB1dEhhc0ZvY3VzKClcblx0XHRcdFx0fHwgdGhpcy5pbnB1dFBhdHRlcm5FeGNsdWRlcy5pbnB1dEhhc0ZvY3VzKCkpO1xuXHRcdFx0Y29udGV4dEtleT8uc2V0KGZhbHNlKTtcblx0XHR9KSk7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIG9uU2VhcmNoUmVzdWx0c0NoYW5nZWQoZXZlbnQ/OiBJQ2hhbmdlRXZlbnQpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRpZiAodGhpcy5pc1Zpc2libGUoKSkge1xuXHRcdFx0cmV0dXJuIHRoaXMucmVmcmVzaEFuZFVwZGF0ZUNvdW50KGV2ZW50KTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0dGhpcy5jaGFuZ2VkV2hpbGVIaWRkZW4gPSB0cnVlO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgcmVmcmVzaEFuZFVwZGF0ZUNvdW50KGV2ZW50PzogSUNoYW5nZUV2ZW50KTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0dGhpcy5zZWFyY2hXaWRnZXQuc2V0UmVwbGFjZUFsbEFjdGlvblN0YXRlKCF0aGlzLnZpZXdNb2RlbC5zZWFyY2hSZXN1bHQuaXNFbXB0eSgpKTtcblx0XHR0aGlzLnVwZGF0ZVNlYXJjaFJlc3VsdENvdW50KHRoaXMudmlld01vZGVsLnNlYXJjaFJlc3VsdC5xdWVyeSEudXNlckRpc2FibGVkRXhjbHVkZXNBbmRJZ25vcmVGaWxlcywgdGhpcy52aWV3TW9kZWwuc2VhcmNoUmVzdWx0LnF1ZXJ5Py5vbmx5T3BlbkVkaXRvcnMsIGV2ZW50Py5jbGVhcmluZ0FsbCk7XG5cdFx0cmV0dXJuIHRoaXMucmVmcmVzaFRyZWVDb250cm9sbGVyLnF1ZXVlKGV2ZW50KTtcblx0fVxuXG5cdHByaXZhdGUgb3JpZ2luYWxTaG91bGRDb2xsYXBzZShtYXRjaDogUmVuZGVyYWJsZU1hdGNoKSB7XG5cdFx0Y29uc3QgY29sbGFwc2VSZXN1bHRzID0gdGhpcy5zZWFyY2hDb25maWcuY29sbGFwc2VSZXN1bHRzO1xuXHRcdHJldHVybiAoY29sbGFwc2VSZXN1bHRzID09PSAnYWx3YXlzQ29sbGFwc2UnIHx8XG5cdFx0XHQoIShpc1NlYXJjaFRyZWVNYXRjaChtYXRjaCkpICYmIG1hdGNoLmNvdW50KCkgPiAxMCAmJiBjb2xsYXBzZVJlc3VsdHMgIT09ICdhbHdheXNFeHBhbmQnKSkgP1xuXHRcdFx0T2JqZWN0VHJlZUVsZW1lbnRDb2xsYXBzZVN0YXRlLlByZXNlcnZlT3JDb2xsYXBzZWQgOiBPYmplY3RUcmVlRWxlbWVudENvbGxhcHNlU3RhdGUuUHJlc2VydmVPckV4cGFuZGVkO1xuXHR9XG5cblx0cHJpdmF0ZSBzaG91bGRDb2xsYXBzZUFjY29yZGluZ1RvQ29uZmlnKG1hdGNoOiBSZW5kZXJhYmxlTWF0Y2gpOiBib29sZWFuIHtcblx0XHRjb25zdCBjb2xsYXBzZVJlc3VsdHMgPSB0aGlzLm9yaWdpbmFsU2hvdWxkQ29sbGFwc2UobWF0Y2gpO1xuXHRcdGlmIChjb2xsYXBzZVJlc3VsdHMgPT09IE9iamVjdFRyZWVFbGVtZW50Q29sbGFwc2VTdGF0ZS5QcmVzZXJ2ZU9yQ29sbGFwc2VkKSB7XG5cdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHR9XG5cdFx0cmV0dXJuIGZhbHNlO1xuXHR9XG5cblx0cHJpdmF0ZSByZXBsYWNlQWxsKCk6IHZvaWQge1xuXHRcdGlmICh0aGlzLnZpZXdNb2RlbC5zZWFyY2hSZXN1bHQuY291bnQoKSA9PT0gMCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IG9jY3VycmVuY2VzID0gdGhpcy52aWV3TW9kZWwuc2VhcmNoUmVzdWx0LmNvdW50KCk7XG5cdFx0Y29uc3QgZmlsZUNvdW50ID0gdGhpcy52aWV3TW9kZWwuc2VhcmNoUmVzdWx0LmZpbGVDb3VudCgpO1xuXHRcdGNvbnN0IHJlcGxhY2VWYWx1ZSA9IHRoaXMuc2VhcmNoV2lkZ2V0LmdldFJlcGxhY2VWYWx1ZSgpIHx8ICcnO1xuXHRcdGNvbnN0IGFmdGVyUmVwbGFjZUFsbE1lc3NhZ2UgPSB0aGlzLmJ1aWxkQWZ0ZXJSZXBsYWNlQWxsTWVzc2FnZShvY2N1cnJlbmNlcywgZmlsZUNvdW50LCByZXBsYWNlVmFsdWUpO1xuXG5cdFx0bGV0IHByb2dyZXNzQ29tcGxldGU6ICgpID0+IHZvaWQ7XG5cdFx0bGV0IHByb2dyZXNzUmVwb3J0ZXI6IElQcm9ncmVzczxJUHJvZ3Jlc3NTdGVwPjtcblxuXHRcdHRoaXMucHJvZ3Jlc3NTZXJ2aWNlLndpdGhQcm9ncmVzcyh7IGxvY2F0aW9uOiB0aGlzLmdldFByb2dyZXNzTG9jYXRpb24oKSwgZGVsYXk6IDEwMCwgdG90YWw6IG9jY3VycmVuY2VzIH0sIHAgPT4ge1xuXHRcdFx0cHJvZ3Jlc3NSZXBvcnRlciA9IHA7XG5cblx0XHRcdHJldHVybiBuZXcgUHJvbWlzZTx2b2lkPihyZXNvbHZlID0+IHByb2dyZXNzQ29tcGxldGUgPSByZXNvbHZlKTtcblx0XHR9KTtcblxuXHRcdGNvbnN0IGNvbmZpcm1hdGlvbjogSUNvbmZpcm1hdGlvbiA9IHtcblx0XHRcdHRpdGxlOiBubHMubG9jYWxpemUoJ3JlcGxhY2VBbGwuY29uZmlybWF0aW9uLnRpdGxlJywgXCJSZXBsYWNlIEFsbFwiKSxcblx0XHRcdG1lc3NhZ2U6IHRoaXMuYnVpbGRSZXBsYWNlQWxsQ29uZmlybWF0aW9uTWVzc2FnZShvY2N1cnJlbmNlcywgZmlsZUNvdW50LCByZXBsYWNlVmFsdWUpLFxuXHRcdFx0cHJpbWFyeUJ1dHRvbjogbmxzLmxvY2FsaXplKHsga2V5OiAncmVwbGFjZUFsbC5jb25maXJtLmJ1dHRvbicsIGNvbW1lbnQ6IFsnJiYgZGVub3RlcyBhIG1uZW1vbmljJ10gfSwgXCImJlJlcGxhY2VcIilcblx0XHR9O1xuXG5cdFx0dGhpcy5kaWFsb2dTZXJ2aWNlLmNvbmZpcm0oY29uZmlybWF0aW9uKS50aGVuKHJlcyA9PiB7XG5cdFx0XHRpZiAocmVzLmNvbmZpcm1lZCkge1xuXHRcdFx0XHR0aGlzLnNlYXJjaFdpZGdldC5zZXRSZXBsYWNlQWxsQWN0aW9uU3RhdGUoZmFsc2UpO1xuXHRcdFx0XHR0aGlzLnZpZXdNb2RlbC5zZWFyY2hSZXN1bHQucmVwbGFjZUFsbChwcm9ncmVzc1JlcG9ydGVyKS50aGVuKCgpID0+IHtcblx0XHRcdFx0XHRwcm9ncmVzc0NvbXBsZXRlKCk7XG5cdFx0XHRcdFx0Y29uc3QgbWVzc2FnZUVsID0gdGhpcy5jbGVhck1lc3NhZ2UoKTtcblx0XHRcdFx0XHRkb20uYXBwZW5kKG1lc3NhZ2VFbCwgYWZ0ZXJSZXBsYWNlQWxsTWVzc2FnZSk7XG5cdFx0XHRcdFx0dGhpcy5yZUxheW91dCgpO1xuXHRcdFx0XHR9LCAoZXJyb3IpID0+IHtcblx0XHRcdFx0XHRwcm9ncmVzc0NvbXBsZXRlKCk7XG5cdFx0XHRcdFx0ZXJyb3JzLmlzQ2FuY2VsbGF0aW9uRXJyb3IoZXJyb3IpO1xuXHRcdFx0XHRcdHRoaXMubm90aWZpY2F0aW9uU2VydmljZS5lcnJvcihlcnJvcik7XG5cdFx0XHRcdH0pO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0cHJvZ3Jlc3NDb21wbGV0ZSgpO1xuXHRcdFx0fVxuXHRcdH0pO1xuXHR9XG5cblx0cHJpdmF0ZSBidWlsZEFmdGVyUmVwbGFjZUFsbE1lc3NhZ2Uob2NjdXJyZW5jZXM6IG51bWJlciwgZmlsZUNvdW50OiBudW1iZXIsIHJlcGxhY2VWYWx1ZT86IHN0cmluZykge1xuXHRcdGlmIChvY2N1cnJlbmNlcyA9PT0gMSkge1xuXHRcdFx0aWYgKGZpbGVDb3VudCA9PT0gMSkge1xuXHRcdFx0XHRpZiAocmVwbGFjZVZhbHVlKSB7XG5cdFx0XHRcdFx0cmV0dXJuIG5scy5sb2NhbGl6ZSgncmVwbGFjZUFsbC5vY2N1cnJlbmNlLmZpbGUubWVzc2FnZScsIFwiUmVwbGFjZWQgezB9IG9jY3VycmVuY2UgYWNyb3NzIHsxfSBmaWxlIHdpdGggJ3syfScuXCIsIG9jY3VycmVuY2VzLCBmaWxlQ291bnQsIHJlcGxhY2VWYWx1ZSk7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRyZXR1cm4gbmxzLmxvY2FsaXplKCdyZW1vdmVBbGwub2NjdXJyZW5jZS5maWxlLm1lc3NhZ2UnLCBcIlJlcGxhY2VkIHswfSBvY2N1cnJlbmNlIGFjcm9zcyB7MX0gZmlsZS5cIiwgb2NjdXJyZW5jZXMsIGZpbGVDb3VudCk7XG5cdFx0XHR9XG5cblx0XHRcdGlmIChyZXBsYWNlVmFsdWUpIHtcblx0XHRcdFx0cmV0dXJuIG5scy5sb2NhbGl6ZSgncmVwbGFjZUFsbC5vY2N1cnJlbmNlLmZpbGVzLm1lc3NhZ2UnLCBcIlJlcGxhY2VkIHswfSBvY2N1cnJlbmNlIGFjcm9zcyB7MX0gZmlsZXMgd2l0aCAnezJ9Jy5cIiwgb2NjdXJyZW5jZXMsIGZpbGVDb3VudCwgcmVwbGFjZVZhbHVlKTtcblx0XHRcdH1cblxuXHRcdFx0cmV0dXJuIG5scy5sb2NhbGl6ZSgncmVtb3ZlQWxsLm9jY3VycmVuY2UuZmlsZXMubWVzc2FnZScsIFwiUmVwbGFjZWQgezB9IG9jY3VycmVuY2UgYWNyb3NzIHsxfSBmaWxlcy5cIiwgb2NjdXJyZW5jZXMsIGZpbGVDb3VudCk7XG5cdFx0fVxuXG5cdFx0aWYgKGZpbGVDb3VudCA9PT0gMSkge1xuXHRcdFx0aWYgKHJlcGxhY2VWYWx1ZSkge1xuXHRcdFx0XHRyZXR1cm4gbmxzLmxvY2FsaXplKCdyZXBsYWNlQWxsLm9jY3VycmVuY2VzLmZpbGUubWVzc2FnZScsIFwiUmVwbGFjZWQgezB9IG9jY3VycmVuY2VzIGFjcm9zcyB7MX0gZmlsZSB3aXRoICd7Mn0nLlwiLCBvY2N1cnJlbmNlcywgZmlsZUNvdW50LCByZXBsYWNlVmFsdWUpO1xuXHRcdFx0fVxuXG5cdFx0XHRyZXR1cm4gbmxzLmxvY2FsaXplKCdyZW1vdmVBbGwub2NjdXJyZW5jZXMuZmlsZS5tZXNzYWdlJywgXCJSZXBsYWNlZCB7MH0gb2NjdXJyZW5jZXMgYWNyb3NzIHsxfSBmaWxlLlwiLCBvY2N1cnJlbmNlcywgZmlsZUNvdW50KTtcblx0XHR9XG5cblx0XHRpZiAocmVwbGFjZVZhbHVlKSB7XG5cdFx0XHRyZXR1cm4gbmxzLmxvY2FsaXplKCdyZXBsYWNlQWxsLm9jY3VycmVuY2VzLmZpbGVzLm1lc3NhZ2UnLCBcIlJlcGxhY2VkIHswfSBvY2N1cnJlbmNlcyBhY3Jvc3MgezF9IGZpbGVzIHdpdGggJ3syfScuXCIsIG9jY3VycmVuY2VzLCBmaWxlQ291bnQsIHJlcGxhY2VWYWx1ZSk7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIG5scy5sb2NhbGl6ZSgncmVtb3ZlQWxsLm9jY3VycmVuY2VzLmZpbGVzLm1lc3NhZ2UnLCBcIlJlcGxhY2VkIHswfSBvY2N1cnJlbmNlcyBhY3Jvc3MgezF9IGZpbGVzLlwiLCBvY2N1cnJlbmNlcywgZmlsZUNvdW50KTtcblx0fVxuXG5cdHByaXZhdGUgYnVpbGRSZXBsYWNlQWxsQ29uZmlybWF0aW9uTWVzc2FnZShvY2N1cnJlbmNlczogbnVtYmVyLCBmaWxlQ291bnQ6IG51bWJlciwgcmVwbGFjZVZhbHVlPzogc3RyaW5nKSB7XG5cdFx0Ly8gSGVscGVyIHRvIHRydW5jYXRlIGxvbmcgdmFsdWVzIHRvIDEwIGxpbmVzIG1heFxuXHRcdGNvbnN0IHRydW5jYXRlVmFsdWUgPSAodmFsdWU6IHN0cmluZyB8IHVuZGVmaW5lZCk6IHN0cmluZyB8IHVuZGVmaW5lZCA9PiB7XG5cdFx0XHRpZiAoIXZhbHVlKSB7XG5cdFx0XHRcdHJldHVybiB2YWx1ZTtcblx0XHRcdH1cblx0XHRcdGNvbnN0IGxpbmVzID0gdmFsdWUuc3BsaXQoJ1xcbicpO1xuXHRcdFx0aWYgKGxpbmVzLmxlbmd0aCA+IDEwKSB7XG5cdFx0XHRcdHJldHVybiBsaW5lcy5zbGljZSgwLCAxMCkuam9pbignXFxuJykgKyAnXFxuLi4uJztcblx0XHRcdH1cblx0XHRcdHJldHVybiB2YWx1ZTtcblx0XHR9O1xuXG5cdFx0Y29uc3QgZGlzcGxheVJlcGxhY2VWYWx1ZSA9IHRydW5jYXRlVmFsdWUocmVwbGFjZVZhbHVlKTtcblxuXHRcdGlmIChvY2N1cnJlbmNlcyA9PT0gMSkge1xuXHRcdFx0aWYgKGZpbGVDb3VudCA9PT0gMSkge1xuXHRcdFx0XHRpZiAoZGlzcGxheVJlcGxhY2VWYWx1ZSkge1xuXHRcdFx0XHRcdHJldHVybiBubHMubG9jYWxpemUoJ3JlbW92ZUFsbC5vY2N1cnJlbmNlLmZpbGUuY29uZmlybWF0aW9uLm1lc3NhZ2UnLCBcIlJlcGxhY2UgezB9IG9jY3VycmVuY2UgYWNyb3NzIHsxfSBmaWxlIHdpdGggJ3syfSc/XCIsIG9jY3VycmVuY2VzLCBmaWxlQ291bnQsIGRpc3BsYXlSZXBsYWNlVmFsdWUpO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0cmV0dXJuIG5scy5sb2NhbGl6ZSgncmVwbGFjZUFsbC5vY2N1cnJlbmNlLmZpbGUuY29uZmlybWF0aW9uLm1lc3NhZ2UnLCBcIlJlcGxhY2UgezB9IG9jY3VycmVuY2UgYWNyb3NzIHsxfSBmaWxlP1wiLCBvY2N1cnJlbmNlcywgZmlsZUNvdW50KTtcblx0XHRcdH1cblxuXHRcdFx0aWYgKGRpc3BsYXlSZXBsYWNlVmFsdWUpIHtcblx0XHRcdFx0cmV0dXJuIG5scy5sb2NhbGl6ZSgncmVtb3ZlQWxsLm9jY3VycmVuY2UuZmlsZXMuY29uZmlybWF0aW9uLm1lc3NhZ2UnLCBcIlJlcGxhY2UgezB9IG9jY3VycmVuY2UgYWNyb3NzIHsxfSBmaWxlcyB3aXRoICd7Mn0nP1wiLCBvY2N1cnJlbmNlcywgZmlsZUNvdW50LCBkaXNwbGF5UmVwbGFjZVZhbHVlKTtcblx0XHRcdH1cblxuXHRcdFx0cmV0dXJuIG5scy5sb2NhbGl6ZSgncmVwbGFjZUFsbC5vY2N1cnJlbmNlLmZpbGVzLmNvbmZpcm1hdGlvbi5tZXNzYWdlJywgXCJSZXBsYWNlIHswfSBvY2N1cnJlbmNlIGFjcm9zcyB7MX0gZmlsZXM/XCIsIG9jY3VycmVuY2VzLCBmaWxlQ291bnQpO1xuXHRcdH1cblxuXHRcdGlmIChmaWxlQ291bnQgPT09IDEpIHtcblx0XHRcdGlmIChkaXNwbGF5UmVwbGFjZVZhbHVlKSB7XG5cdFx0XHRcdHJldHVybiBubHMubG9jYWxpemUoJ3JlbW92ZUFsbC5vY2N1cnJlbmNlcy5maWxlLmNvbmZpcm1hdGlvbi5tZXNzYWdlJywgXCJSZXBsYWNlIHswfSBvY2N1cnJlbmNlcyBhY3Jvc3MgezF9IGZpbGUgd2l0aCAnezJ9Jz9cIiwgb2NjdXJyZW5jZXMsIGZpbGVDb3VudCwgZGlzcGxheVJlcGxhY2VWYWx1ZSk7XG5cdFx0XHR9XG5cblx0XHRcdHJldHVybiBubHMubG9jYWxpemUoJ3JlcGxhY2VBbGwub2NjdXJyZW5jZXMuZmlsZS5jb25maXJtYXRpb24ubWVzc2FnZScsIFwiUmVwbGFjZSB7MH0gb2NjdXJyZW5jZXMgYWNyb3NzIHsxfSBmaWxlP1wiLCBvY2N1cnJlbmNlcywgZmlsZUNvdW50KTtcblx0XHR9XG5cblx0XHRpZiAoZGlzcGxheVJlcGxhY2VWYWx1ZSkge1xuXHRcdFx0cmV0dXJuIG5scy5sb2NhbGl6ZSgncmVtb3ZlQWxsLm9jY3VycmVuY2VzLmZpbGVzLmNvbmZpcm1hdGlvbi5tZXNzYWdlJywgXCJSZXBsYWNlIHswfSBvY2N1cnJlbmNlcyBhY3Jvc3MgezF9IGZpbGVzIHdpdGggJ3syfSc/XCIsIG9jY3VycmVuY2VzLCBmaWxlQ291bnQsIGRpc3BsYXlSZXBsYWNlVmFsdWUpO1xuXHRcdH1cblxuXHRcdHJldHVybiBubHMubG9jYWxpemUoJ3JlcGxhY2VBbGwub2NjdXJyZW5jZXMuZmlsZXMuY29uZmlybWF0aW9uLm1lc3NhZ2UnLCBcIlJlcGxhY2UgezB9IG9jY3VycmVuY2VzIGFjcm9zcyB7MX0gZmlsZXM/XCIsIG9jY3VycmVuY2VzLCBmaWxlQ291bnQpO1xuXHR9XG5cblx0cHJpdmF0ZSBjbGVhck1lc3NhZ2UoKTogSFRNTEVsZW1lbnQge1xuXHRcdHRoaXMuc2VhcmNoV2l0aG91dEZvbGRlck1lc3NhZ2VFbGVtZW50ID0gdW5kZWZpbmVkO1xuXG5cdFx0Y29uc3Qgd2FzSGlkZGVuID0gdGhpcy5tZXNzYWdlc0VsZW1lbnQuc3R5bGUuZGlzcGxheSA9PT0gJ25vbmUnO1xuXHRcdGRvbS5jbGVhck5vZGUodGhpcy5tZXNzYWdlc0VsZW1lbnQpO1xuXHRcdGRvbS5zaG93KHRoaXMubWVzc2FnZXNFbGVtZW50KTtcblx0XHR0aGlzLm1lc3NhZ2VEaXNwb3NhYmxlcy5jbGVhcigpO1xuXG5cdFx0Y29uc3QgbmV3TWVzc2FnZSA9IGRvbS5hcHBlbmQodGhpcy5tZXNzYWdlc0VsZW1lbnQsICQoJy5tZXNzYWdlJykpO1xuXHRcdGlmICh3YXNIaWRkZW4pIHtcblx0XHRcdHRoaXMucmVMYXlvdXQoKTtcblx0XHR9XG5cblx0XHRyZXR1cm4gbmV3TWVzc2FnZTtcblx0fVxuXG5cdHByaXZhdGUgY3JlYXRlU2VhcmNoUmVzdWx0c1ZpZXcoY29udGFpbmVyOiBIVE1MRWxlbWVudCk6IHZvaWQge1xuXHRcdHRoaXMucmVzdWx0c0VsZW1lbnQgPSBkb20uYXBwZW5kKGNvbnRhaW5lciwgJCgnLnJlc3VsdHMuc2hvdy1maWxlLWljb25zLmZpbGUtaWNvbi10aGVtYWJsZS10cmVlJykpO1xuXHRcdGNvbnN0IGRlbGVnYXRlID0gdGhpcy5pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShTZWFyY2hEZWxlZ2F0ZSk7XG5cblx0XHRjb25zdCBpZGVudGl0eVByb3ZpZGVyOiBJSWRlbnRpdHlQcm92aWRlcjxSZW5kZXJhYmxlTWF0Y2g+ID0ge1xuXHRcdFx0Z2V0SWQoZWxlbWVudDogUmVuZGVyYWJsZU1hdGNoKSB7XG5cdFx0XHRcdHJldHVybiBlbGVtZW50LmlkKCk7XG5cdFx0XHR9XG5cdFx0fTtcblxuXHRcdHRoaXMuc2VhcmNoRGF0YVNvdXJjZSA9IHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoU2VhcmNoVmlld0RhdGFTb3VyY2UsIHRoaXMpO1xuXHRcdHRoaXMudHJlZUxhYmVscyA9IHRoaXMuX3JlZ2lzdGVyKHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoUmVzb3VyY2VMYWJlbHMsIHsgb25EaWRDaGFuZ2VWaXNpYmlsaXR5OiB0aGlzLm9uRGlkQ2hhbmdlQm9keVZpc2liaWxpdHkgfSkpO1xuXHRcdHRoaXMudHJlZSA9IHRoaXMuX3JlZ2lzdGVyKHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoV29ya2JlbmNoQ29tcHJlc3NpYmxlQXN5bmNEYXRhVHJlZTxJU2VhcmNoUmVzdWx0LCBSZW5kZXJhYmxlTWF0Y2g+LFxuXHRcdFx0J1NlYXJjaFZpZXcnLFxuXHRcdFx0dGhpcy5yZXN1bHRzRWxlbWVudCxcblx0XHRcdGRlbGVnYXRlLFxuXHRcdFx0e1xuXHRcdFx0XHRpc0luY29tcHJlc3NpYmxlOiAoZWxlbWVudDogUmVuZGVyYWJsZU1hdGNoKSA9PiB7XG5cblx0XHRcdFx0XHRpZiAoaXNTZWFyY2hUcmVlRm9sZGVyTWF0Y2goZWxlbWVudCkgJiYgIWlzVGV4dFNlYXJjaEhlYWRpbmcoZWxlbWVudC5wYXJlbnQoKSkgJiYgIShpc1NlYXJjaFRyZWVGb2xkZXJNYXRjaFdvcmtzcGFjZVJvb3QoZWxlbWVudC5wYXJlbnQoKSkpICYmICEoaXNTZWFyY2hUcmVlRm9sZGVyTWF0Y2hOb1Jvb3QoZWxlbWVudC5wYXJlbnQoKSkpKSB7XG5cdFx0XHRcdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdHJldHVybiB0cnVlO1xuXHRcdFx0XHR9XG5cdFx0XHR9LFxuXHRcdFx0W1xuXHRcdFx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKEZvbGRlck1hdGNoUmVuZGVyZXIsIHRoaXMsIHRoaXMudHJlZUxhYmVscykpLFxuXHRcdFx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKEZpbGVNYXRjaFJlbmRlcmVyLCB0aGlzLCB0aGlzLnRyZWVMYWJlbHMpKSxcblx0XHRcdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShUZXh0U2VhcmNoUmVzdWx0UmVuZGVyZXIsIHRoaXMudHJlZUxhYmVscykpLFxuXHRcdFx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKE1hdGNoUmVuZGVyZXIsIHRoaXMpKSxcblx0XHRcdF0sXG5cdFx0XHR0aGlzLnNlYXJjaERhdGFTb3VyY2UsXG5cdFx0XHR7XG5cdFx0XHRcdGlkZW50aXR5UHJvdmlkZXIsXG5cdFx0XHRcdGFjY2Vzc2liaWxpdHlQcm92aWRlcjogdGhpcy50cmVlQWNjZXNzaWJpbGl0eVByb3ZpZGVyLFxuXHRcdFx0XHRkbmQ6IHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoUmVzb3VyY2VMaXN0RG5ESGFuZGxlciwgZWxlbWVudCA9PiB7XG5cdFx0XHRcdFx0aWYgKGlzU2VhcmNoVHJlZUZpbGVNYXRjaChlbGVtZW50KSkge1xuXHRcdFx0XHRcdFx0cmV0dXJuIGVsZW1lbnQucmVzb3VyY2U7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdGlmIChpc1NlYXJjaFRyZWVNYXRjaChlbGVtZW50KSkge1xuXHRcdFx0XHRcdFx0cmV0dXJuIHdpdGhTZWxlY3Rpb24oZWxlbWVudC5wYXJlbnQoKS5yZXNvdXJjZSwgZWxlbWVudC5yYW5nZSgpKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0cmV0dXJuIG51bGw7XG5cdFx0XHRcdH0pLFxuXHRcdFx0XHRtdWx0aXBsZVNlbGVjdGlvblN1cHBvcnQ6IHRydWUsXG5cdFx0XHRcdHNlbGVjdGlvbk5hdmlnYXRpb246IHRydWUsXG5cdFx0XHRcdG92ZXJyaWRlU3R5bGVzOiB0aGlzLmdldExvY2F0aW9uQmFzZWRDb2xvcnMoKS5saXN0T3ZlcnJpZGVTdHlsZXMsXG5cdFx0XHRcdHBhZGRpbmdCb3R0b206IFNlYXJjaERlbGVnYXRlLklURU1fSEVJR0hULFxuXHRcdFx0XHRjb2xsYXBzZUJ5RGVmYXVsdDogKGU6IFJlbmRlcmFibGVNYXRjaCkgPT4ge1xuXHRcdFx0XHRcdGlmIChpc1RleHRTZWFyY2hIZWFkaW5nKGUpKSB7XG5cdFx0XHRcdFx0XHQvLyBhbHdheXMgY29sbGFwc2UgdGhlIGFpIHRleHQgc2VhcmNoIHJlc3VsdCwgYnV0IGFsd2F5cyBleHBhbmQgdGhlIHRleHQgcmVzdWx0XG5cdFx0XHRcdFx0XHRyZXR1cm4gZS5pc0FJQ29udHJpYnV0ZWQ7XG5cdFx0XHRcdFx0fVxuXG5cdFx0XHRcdFx0Ly8gYWx3YXlzIGV4cGFuZCBjb21wcmVzc2VkIG5vZGVzXG5cdFx0XHRcdFx0aWYgKGlzU2VhcmNoVHJlZUZvbGRlck1hdGNoKGUpICYmIGUubWF0Y2hlcygpLmxlbmd0aCA9PT0gMSAmJiBpc1NlYXJjaFRyZWVGb2xkZXJNYXRjaChlLm1hdGNoZXMoKVswXSkpIHtcblx0XHRcdFx0XHRcdHJldHVybiBmYWxzZTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0cmV0dXJuIHRoaXMuc2hvdWxkQ29sbGFwc2VBY2NvcmRpbmdUb0NvbmZpZyhlKTtcblx0XHRcdFx0fVxuXHRcdFx0fSkpO1xuXG5cdFx0Q29uc3RhbnRzLlNlYXJjaENvbnRleHQuU2VhcmNoUmVzdWx0TGlzdEZvY3VzZWRLZXkuYmluZFRvKHRoaXMudHJlZS5jb250ZXh0S2V5U2VydmljZSk7XG5cblx0XHR0aGlzLnRyZWUuc2V0SW5wdXQodGhpcy52aWV3TW9kZWwuc2VhcmNoUmVzdWx0KTtcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLnRyZWUub25Db250ZXh0TWVudShlID0+IHRoaXMub25Db250ZXh0TWVudShlKSkpO1xuXHRcdGNvbnN0IHVwZGF0ZUhhc1NvbWVDb2xsYXBzaWJsZSA9ICgpID0+IHRoaXMudG9nZ2xlQ29sbGFwc2VTdGF0ZURlbGF5ZXIudHJpZ2dlcigoKSA9PiB0aGlzLmhhc1NvbWVDb2xsYXBzaWJsZVJlc3VsdEtleS5zZXQodGhpcy5oYXNTb21lQ29sbGFwc2libGUoKSkpO1xuXHRcdHVwZGF0ZUhhc1NvbWVDb2xsYXBzaWJsZSgpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMudHJlZS5vbkRpZENoYW5nZUNvbGxhcHNlU3RhdGUoKCkgPT4gdXBkYXRlSGFzU29tZUNvbGxhcHNpYmxlKCkpKTtcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLnRyZWUub25EaWRDaGFuZ2VNb2RlbCgoKSA9PiB1cGRhdGVIYXNTb21lQ29sbGFwc2libGUoKSkpO1xuXG5cdFx0dGhpcy5fcmVnaXN0ZXIoRXZlbnQuZGVib3VuY2UodGhpcy50cmVlLm9uRGlkT3BlbiwgKGxhc3QsIGV2ZW50KSA9PiBldmVudCwgREVCT1VOQ0VfREVMQVksIHRydWUpKG9wdGlvbnMgPT4ge1xuXHRcdFx0aWYgKGlzU2VhcmNoVHJlZU1hdGNoKG9wdGlvbnMuZWxlbWVudCkpIHtcblx0XHRcdFx0Y29uc3Qgc2VsZWN0ZWRNYXRjaDogSVNlYXJjaFRyZWVNYXRjaCA9IG9wdGlvbnMuZWxlbWVudDtcblx0XHRcdFx0dGhpcy5jdXJyZW50U2VsZWN0ZWRGaWxlTWF0Y2g/LnNldFNlbGVjdGVkTWF0Y2gobnVsbCk7XG5cdFx0XHRcdHRoaXMuY3VycmVudFNlbGVjdGVkRmlsZU1hdGNoID0gc2VsZWN0ZWRNYXRjaC5wYXJlbnQoKTtcblx0XHRcdFx0dGhpcy5jdXJyZW50U2VsZWN0ZWRGaWxlTWF0Y2guc2V0U2VsZWN0ZWRNYXRjaChzZWxlY3RlZE1hdGNoKTtcblxuXHRcdFx0XHR0aGlzLm9uRm9jdXMoc2VsZWN0ZWRNYXRjaCwgb3B0aW9ucy5lZGl0b3JPcHRpb25zLnByZXNlcnZlRm9jdXMsIG9wdGlvbnMuc2lkZUJ5U2lkZSwgb3B0aW9ucy5lZGl0b3JPcHRpb25zLnBpbm5lZCk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXG5cdFx0dGhpcy5fcmVnaXN0ZXIoRXZlbnQuZGVib3VuY2UodGhpcy50cmVlLm9uRGlkQ2hhbmdlRm9jdXMsIChsYXN0LCBldmVudCkgPT4gZXZlbnQsIERFQk9VTkNFX0RFTEFZLCB0cnVlKSgoKSA9PiB7XG5cdFx0XHRjb25zdCBzZWxlY3Rpb24gPSB0aGlzLnRyZWUuZ2V0U2VsZWN0aW9uKCk7XG5cdFx0XHRjb25zdCBmb2N1cyA9IHRoaXMudHJlZS5nZXRGb2N1cygpWzBdO1xuXHRcdFx0aWYgKHNlbGVjdGlvbi5sZW5ndGggPiAxICYmIGlzU2VhcmNoVHJlZU1hdGNoKGZvY3VzKSkge1xuXHRcdFx0XHR0aGlzLm9uRm9jdXMoZm9jdXMsIHRydWUpO1xuXHRcdFx0fVxuXHRcdH0pKTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKEV2ZW50LmFueTxhbnk+KHRoaXMudHJlZS5vbkRpZEZvY3VzLCB0aGlzLnRyZWUub25EaWRDaGFuZ2VGb2N1cykoKCkgPT4ge1xuXHRcdFx0Y29uc3QgZm9jdXMgPSB0aGlzLnRyZWUuZ2V0Rm9jdXMoKVswXTtcblxuXHRcdFx0aWYgKHRoaXMudHJlZS5pc0RPTUZvY3VzZWQoKSkge1xuXHRcdFx0XHRjb25zdCBmaXJzdEVsZW0gPSB0aGlzLnRyZWUuZ2V0Rmlyc3RFbGVtZW50Q2hpbGQodGhpcy50cmVlLmdldElucHV0KCkpO1xuXHRcdFx0XHR0aGlzLmZpcnN0TWF0Y2hGb2N1c2VkLnNldChmaXJzdEVsZW0gPT09IGZvY3VzKTtcblx0XHRcdFx0dGhpcy5maWxlTWF0Y2hPck1hdGNoRm9jdXNlZC5zZXQoISFmb2N1cyk7XG5cdFx0XHRcdHRoaXMuZmlsZU1hdGNoRm9jdXNlZC5zZXQoaXNTZWFyY2hUcmVlRmlsZU1hdGNoKGZvY3VzKSk7XG5cdFx0XHRcdHRoaXMuZm9sZGVyTWF0Y2hGb2N1c2VkLnNldChpc1NlYXJjaFRyZWVGb2xkZXJNYXRjaChmb2N1cykpO1xuXHRcdFx0XHR0aGlzLm1hdGNoRm9jdXNlZC5zZXQoaXNTZWFyY2hUcmVlTWF0Y2goZm9jdXMpKTtcblx0XHRcdFx0dGhpcy5maWxlTWF0Y2hPckZvbGRlck1hdGNoRm9jdXMuc2V0KGlzU2VhcmNoVHJlZUZpbGVNYXRjaChmb2N1cykgfHwgaXNTZWFyY2hUcmVlRm9sZGVyTWF0Y2goZm9jdXMpKTtcblx0XHRcdFx0dGhpcy5maWxlTWF0Y2hPckZvbGRlck1hdGNoV2l0aFJlc291cmNlRm9jdXMuc2V0KGlzU2VhcmNoVHJlZUZpbGVNYXRjaChmb2N1cykgfHwgaXNTZWFyY2hUcmVlRm9sZGVyTWF0Y2hXaXRoUmVzb3VyY2UoZm9jdXMpKTtcblx0XHRcdFx0dGhpcy5mb2xkZXJNYXRjaFdpdGhSZXNvdXJjZUZvY3VzZWQuc2V0KGlzU2VhcmNoVHJlZUZvbGRlck1hdGNoV2l0aFJlc291cmNlKGZvY3VzKSk7XG5cdFx0XHRcdHRoaXMuc2VhcmNoUmVzdWx0SGVhZGVyRm9jdXNlZC5zZXQoaXNTZWFyY2hIZWFkZXIoZm9jdXMpKTtcblx0XHRcdFx0dGhpcy5sYXN0Rm9jdXNTdGF0ZSA9ICd0cmVlJztcblx0XHRcdH1cblxuXHRcdFx0bGV0IGVkaXRhYmxlID0gZmFsc2U7XG5cdFx0XHRpZiAoaXNTZWFyY2hUcmVlTWF0Y2goZm9jdXMpKSB7XG5cdFx0XHRcdGVkaXRhYmxlID0gIWZvY3VzLmlzUmVhZG9ubHk7XG5cdFx0XHR9IGVsc2UgaWYgKGlzU2VhcmNoVHJlZUZpbGVNYXRjaChmb2N1cykpIHtcblx0XHRcdFx0ZWRpdGFibGUgPSAhZm9jdXMuaGFzT25seVJlYWRPbmx5TWF0Y2hlcygpO1xuXHRcdFx0fSBlbHNlIGlmIChpc1NlYXJjaFRyZWVGb2xkZXJNYXRjaChmb2N1cykpIHtcblx0XHRcdFx0ZWRpdGFibGUgPSAhZm9jdXMuaGFzT25seVJlYWRPbmx5TWF0Y2hlcygpO1xuXHRcdFx0fVxuXHRcdFx0dGhpcy5pc0VkaXRhYmxlSXRlbS5zZXQoZWRpdGFibGUpO1xuXHRcdH0pKTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMudHJlZS5vbkRpZEJsdXIoKCkgPT4ge1xuXHRcdFx0dGhpcy5maXJzdE1hdGNoRm9jdXNlZC5yZXNldCgpO1xuXHRcdFx0dGhpcy5maWxlTWF0Y2hPck1hdGNoRm9jdXNlZC5yZXNldCgpO1xuXHRcdFx0dGhpcy5maWxlTWF0Y2hGb2N1c2VkLnJlc2V0KCk7XG5cdFx0XHR0aGlzLmZvbGRlck1hdGNoRm9jdXNlZC5yZXNldCgpO1xuXHRcdFx0dGhpcy5tYXRjaEZvY3VzZWQucmVzZXQoKTtcblx0XHRcdHRoaXMuZmlsZU1hdGNoT3JGb2xkZXJNYXRjaEZvY3VzLnJlc2V0KCk7XG5cdFx0XHR0aGlzLmZpbGVNYXRjaE9yRm9sZGVyTWF0Y2hXaXRoUmVzb3VyY2VGb2N1cy5yZXNldCgpO1xuXHRcdFx0dGhpcy5mb2xkZXJNYXRjaFdpdGhSZXNvdXJjZUZvY3VzZWQucmVzZXQoKTtcblx0XHRcdHRoaXMuc2VhcmNoUmVzdWx0SGVhZGVyRm9jdXNlZC5yZXNldCgpO1xuXHRcdFx0dGhpcy5pc0VkaXRhYmxlSXRlbS5yZXNldCgpO1xuXHRcdH0pKTtcblxuXHRcdC8vIFNldHVwIGN1cnNvciBwb3NpdGlvbiBtb25pdG9yaW5nIHRvIGNsZWFyIHNlbGVjdGVkIG1hdGNoIHdoZW4gY3Vyc29yIG1vdmVzXG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5lZGl0b3JTZXJ2aWNlLm9uRGlkQWN0aXZlRWRpdG9yQ2hhbmdlKCgpID0+IHtcblx0XHRcdGNvbnN0IGVkaXRvciA9IGdldENvZGVFZGl0b3IodGhpcy5lZGl0b3JTZXJ2aWNlLmFjdGl2ZVRleHRFZGl0b3JDb250cm9sKTtcblx0XHRcdHRoaXMuY3VycmVudEVkaXRvckN1cnNvckxpc3RlbmVyLnZhbHVlID0gZWRpdG9yPy5vbkRpZENoYW5nZUN1cnNvclBvc2l0aW9uKCgpID0+IHtcblx0XHRcdFx0dGhpcy5jdXJyZW50U2VsZWN0ZWRGaWxlTWF0Y2g/LnNldFNlbGVjdGVkTWF0Y2gobnVsbCk7XG5cdFx0XHRcdHRoaXMuY3VycmVudFNlbGVjdGVkRmlsZU1hdGNoID0gdW5kZWZpbmVkO1xuXHRcdFx0fSk7XG5cdFx0fSkpO1xuXHR9XG5cblx0cHJpdmF0ZSBvbkNvbnRleHRNZW51KGU6IElUcmVlQ29udGV4dE1lbnVFdmVudDxSZW5kZXJhYmxlTWF0Y2ggfCBudWxsPik6IHZvaWQge1xuXG5cdFx0ZS5icm93c2VyRXZlbnQucHJldmVudERlZmF1bHQoKTtcblx0XHRlLmJyb3dzZXJFdmVudC5zdG9wUHJvcGFnYXRpb24oKTtcblx0XHRjb25zdCBzZWxlY3Rpb24gPSB0aGlzLnRyZWUuZ2V0U2VsZWN0aW9uKCk7XG5cdFx0bGV0IGFyZzogYW55O1xuXHRcdGxldCBjb250ZXh0OiBhbnk7XG5cdFx0aWYgKHNlbGVjdGlvbiAmJiBzZWxlY3Rpb24ubGVuZ3RoID4gMCkge1xuXHRcdFx0YXJnID0gZS5lbGVtZW50O1xuXHRcdFx0Y29udGV4dCA9IHNlbGVjdGlvbjtcblx0XHR9IGVsc2Uge1xuXHRcdFx0Y29udGV4dCA9IGUuZWxlbWVudDtcblx0XHR9XG5cblx0XHR0aGlzLmNvbnRleHRNZW51U2VydmljZS5zaG93Q29udGV4dE1lbnUoe1xuXHRcdFx0bWVudUlkOiBNZW51SWQuU2VhcmNoQ29udGV4dCxcblx0XHRcdG1lbnVBY3Rpb25PcHRpb25zOiB7IHNob3VsZEZvcndhcmRBcmdzOiB0cnVlLCBhcmcgfSxcblx0XHRcdGNvbnRleHRLZXlTZXJ2aWNlOiB0aGlzLmNvbnRleHRLZXlTZXJ2aWNlLFxuXHRcdFx0Z2V0QW5jaG9yOiAoKSA9PiBlLmFuY2hvcixcblx0XHRcdGdldEFjdGlvbnNDb250ZXh0OiAoKSA9PiBjb250ZXh0LFxuXHRcdH0pO1xuXHR9XG5cblx0cHJpdmF0ZSBoYXNTb21lQ29sbGFwc2libGUoKTogYm9vbGVhbiB7XG5cdFx0Y29uc3Qgdmlld2VyID0gdGhpcy5nZXRDb250cm9sKCk7XG5cdFx0Y29uc3QgbmF2aWdhdG9yID0gdmlld2VyLm5hdmlnYXRlKCk7XG5cdFx0bGV0IG5vZGUgPSBuYXZpZ2F0b3IuZmlyc3QoKTtcblx0XHRjb25zdCBzaG91bGRTaG93QUkgPSB0aGlzLnNob3VsZFNob3dBSVJlc3VsdHMoKTtcblx0XHRkbyB7XG5cdFx0XHRpZiAobm9kZSAmJiAhdmlld2VyLmlzQ29sbGFwc2VkKG5vZGUpICYmICghc2hvdWxkU2hvd0FJIHx8ICEoaXNUZXh0U2VhcmNoSGVhZGluZyhub2RlKSkpKSB7XG5cdFx0XHRcdC8vIGlnbm9yZSB0aGUgYWkgdGV4dCBzZWFyY2ggcmVzdWx0IGlkXG5cdFx0XHRcdHJldHVybiB0cnVlO1xuXHRcdFx0fVxuXHRcdH0gd2hpbGUgKG5vZGUgPSBuYXZpZ2F0b3IubmV4dCgpKTtcblxuXHRcdHJldHVybiBmYWxzZTtcblx0fVxuXG5cdGFzeW5jIHNlbGVjdE5leHRNYXRjaCgpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRpZiAoIXRoaXMuaGFzU2VhcmNoUmVzdWx0cygpKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29uc3QgW3NlbGVjdGVkXSA9IHRoaXMudHJlZS5nZXRTZWxlY3Rpb24oKTtcblxuXHRcdC8vIEV4cGFuZCB0aGUgaW5pdGlhbCBzZWxlY3RlZCBub2RlLCBpZiBuZWVkZWRcblx0XHRpZiAoc2VsZWN0ZWQgJiYgIShpc1NlYXJjaFRyZWVNYXRjaChzZWxlY3RlZCkpKSB7XG5cdFx0XHRpZiAodGhpcy50cmVlLmlzQ29sbGFwc2VkKHNlbGVjdGVkKSkge1xuXHRcdFx0XHRhd2FpdCB0aGlzLnRyZWUuZXhwYW5kKHNlbGVjdGVkKTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRjb25zdCBuYXZpZ2F0b3IgPSB0aGlzLnRyZWUubmF2aWdhdGUoc2VsZWN0ZWQpO1xuXG5cdFx0bGV0IG5leHQgPSBuYXZpZ2F0b3IubmV4dCgpO1xuXHRcdGlmICghbmV4dCkge1xuXHRcdFx0bmV4dCA9IG5hdmlnYXRvci5maXJzdCgpO1xuXHRcdH1cblxuXHRcdC8vIEV4cGFuZCB1bnRpbCBmaXJzdCBjaGlsZCBpcyBhIE1hdGNoXG5cdFx0d2hpbGUgKG5leHQgJiYgIShpc1NlYXJjaFRyZWVNYXRjaChuZXh0KSkpIHtcblx0XHRcdGlmICh0aGlzLnRyZWUuaXNDb2xsYXBzZWQobmV4dCkpIHtcblx0XHRcdFx0YXdhaXQgdGhpcy50cmVlLmV4cGFuZChuZXh0KTtcblx0XHRcdH1cblxuXHRcdFx0Ly8gU2VsZWN0IHRoZSBmaXJzdCBjaGlsZFxuXHRcdFx0bmV4dCA9IG5hdmlnYXRvci5uZXh0KCk7XG5cdFx0fVxuXG5cdFx0Ly8gUmV2ZWFsIHRoZSBuZXdseSBzZWxlY3RlZCBlbGVtZW50XG5cdFx0aWYgKG5leHQpIHtcblx0XHRcdGlmIChuZXh0ID09PSBzZWxlY3RlZCkge1xuXHRcdFx0XHR0aGlzLnRyZWUuc2V0Rm9jdXMoW10pO1xuXHRcdFx0fVxuXHRcdFx0Y29uc3QgZXZlbnQgPSBnZXRTZWxlY3Rpb25LZXlib2FyZEV2ZW50KHVuZGVmaW5lZCwgZmFsc2UsIGZhbHNlKTtcblx0XHRcdHRoaXMudHJlZS5zZXRGb2N1cyhbbmV4dF0sIGV2ZW50KTtcblx0XHRcdHRoaXMudHJlZS5zZXRTZWxlY3Rpb24oW25leHRdLCBldmVudCk7XG5cdFx0XHR0aGlzLnRyZWUucmV2ZWFsKG5leHQpO1xuXHRcdFx0Y29uc3QgYXJpYUxhYmVsID0gdGhpcy50cmVlQWNjZXNzaWJpbGl0eVByb3ZpZGVyLmdldEFyaWFMYWJlbChuZXh0KTtcblx0XHRcdGlmIChhcmlhTGFiZWwpIHsgYXJpYS5zdGF0dXMoYXJpYUxhYmVsKTsgfVxuXHRcdH1cblx0fVxuXG5cdGFzeW5jIHNlbGVjdFByZXZpb3VzTWF0Y2goKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0aWYgKCF0aGlzLmhhc1NlYXJjaFJlc3VsdHMoKSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IFtzZWxlY3RlZF0gPSB0aGlzLnRyZWUuZ2V0U2VsZWN0aW9uKCk7XG5cdFx0bGV0IG5hdmlnYXRvciA9IHRoaXMudHJlZS5uYXZpZ2F0ZShzZWxlY3RlZCk7XG5cblx0XHRsZXQgcHJldiA9IG5hdmlnYXRvci5wcmV2aW91cygpO1xuXG5cdFx0Ly8gU2VsZWN0IHByZXZpb3VzIHVudGlsIGZpbmQgYSBNYXRjaCBvciBhIGNvbGxhcHNlZCBpdGVtXG5cdFx0d2hpbGUgKCFwcmV2IHx8ICghKGlzU2VhcmNoVHJlZU1hdGNoKHByZXYpKSAmJiAhdGhpcy50cmVlLmlzQ29sbGFwc2VkKHByZXYpKSkge1xuXHRcdFx0Y29uc3QgbmV4dFByZXYgPSBwcmV2ID8gbmF2aWdhdG9yLnByZXZpb3VzKCkgOiBuYXZpZ2F0b3IubGFzdCgpO1xuXG5cdFx0XHRpZiAoIXByZXYgJiYgIW5leHRQcmV2KSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblxuXHRcdFx0cHJldiA9IG5leHRQcmV2O1xuXHRcdH1cblxuXHRcdC8vIEV4cGFuZCB1bnRpbCBsYXN0IGNoaWxkIGlzIGEgTWF0Y2hcblx0XHR3aGlsZSAocHJldiAmJiAhKGlzU2VhcmNoVHJlZU1hdGNoKHByZXYpKSkge1xuXHRcdFx0Y29uc3QgbmV4dEl0ZW0gPSBuYXZpZ2F0b3IubmV4dCgpO1xuXHRcdFx0aWYgKCFuZXh0SXRlbSkge1xuXHRcdFx0XHRicmVhaztcblx0XHRcdH1cblx0XHRcdGF3YWl0IHRoaXMudHJlZS5leHBhbmQocHJldik7XG5cdFx0XHRuYXZpZ2F0b3IgPSB0aGlzLnRyZWUubmF2aWdhdGUobmV4dEl0ZW0pOyAvLyByZWNyZWF0ZSBuYXZpZ2F0b3IgYmVjYXVzZSBtb2RpZnlpbmcgdGhlIHRyZWUgY2FuIGludmFsaWRhdGUgaXRcblx0XHRcdHByZXYgPSBuZXh0SXRlbSA/IG5hdmlnYXRvci5wcmV2aW91cygpIDogbmF2aWdhdG9yLmxhc3QoKTsgLy8gc2VsZWN0IGxhc3QgY2hpbGRcblx0XHR9XG5cblx0XHQvLyBSZXZlYWwgdGhlIG5ld2x5IHNlbGVjdGVkIGVsZW1lbnRcblx0XHRpZiAocHJldikge1xuXHRcdFx0aWYgKHByZXYgPT09IHNlbGVjdGVkKSB7XG5cdFx0XHRcdHRoaXMudHJlZS5zZXRGb2N1cyhbXSk7XG5cdFx0XHR9XG5cdFx0XHRjb25zdCBldmVudCA9IGdldFNlbGVjdGlvbktleWJvYXJkRXZlbnQodW5kZWZpbmVkLCBmYWxzZSwgZmFsc2UpO1xuXHRcdFx0dGhpcy50cmVlLnNldEZvY3VzKFtwcmV2XSwgZXZlbnQpO1xuXHRcdFx0dGhpcy50cmVlLnNldFNlbGVjdGlvbihbcHJldl0sIGV2ZW50KTtcblx0XHRcdHRoaXMudHJlZS5yZXZlYWwocHJldik7XG5cdFx0XHRjb25zdCBhcmlhTGFiZWwgPSB0aGlzLnRyZWVBY2Nlc3NpYmlsaXR5UHJvdmlkZXIuZ2V0QXJpYUxhYmVsKHByZXYpO1xuXHRcdFx0aWYgKGFyaWFMYWJlbCkgeyBhcmlhLnN0YXR1cyhhcmlhTGFiZWwpOyB9XG5cdFx0fVxuXHR9XG5cblx0bW92ZUZvY3VzVG9SZXN1bHRzKCk6IHZvaWQge1xuXHRcdHRoaXMudHJlZS5kb21Gb2N1cygpO1xuXHR9XG5cblx0b3ZlcnJpZGUgZm9jdXMoKTogdm9pZCB7XG5cdFx0c3VwZXIuZm9jdXMoKTtcblx0XHRpZiAodGhpcy5sYXN0Rm9jdXNTdGF0ZSA9PT0gJ2lucHV0JyB8fCAhdGhpcy5oYXNTZWFyY2hSZXN1bHRzKCkpIHtcblx0XHRcdGNvbnN0IHVwZGF0ZWRUZXh0ID0gdGhpcy5zZWFyY2hDb25maWcuc2VlZE9uRm9jdXMgPyB0aGlzLnVwZGF0ZVRleHRGcm9tU2VsZWN0aW9uKHsgYWxsb3dTZWFyY2hPblR5cGU6IGZhbHNlIH0pIDogZmFsc2U7XG5cdFx0XHR0aGlzLnNlYXJjaFdpZGdldC5mb2N1cyh1bmRlZmluZWQsIHVuZGVmaW5lZCwgdXBkYXRlZFRleHQpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHR0aGlzLnRyZWUuZG9tRm9jdXMoKTtcblx0XHR9XG5cdH1cblxuXHR1cGRhdGVUZXh0RnJvbUZpbmRXaWRnZXRPclNlbGVjdGlvbih7IGFsbG93VW5zZWxlY3RlZFdvcmQgPSB0cnVlLCBhbGxvd1NlYXJjaE9uVHlwZSA9IHRydWUgfSk6IGJvb2xlYW4ge1xuXHRcdGxldCBhY3RpdmVFZGl0b3IgPSB0aGlzLmVkaXRvclNlcnZpY2UuYWN0aXZlVGV4dEVkaXRvckNvbnRyb2w7XG5cdFx0aWYgKGlzQ29kZUVkaXRvcihhY3RpdmVFZGl0b3IpICYmICFhY3RpdmVFZGl0b3I/Lmhhc1RleHRGb2N1cygpKSB7XG5cdFx0XHRjb25zdCBjb250cm9sbGVyID0gQ29tbW9uRmluZENvbnRyb2xsZXIuZ2V0KGFjdGl2ZUVkaXRvcik7XG5cdFx0XHRpZiAoY29udHJvbGxlciAmJiBjb250cm9sbGVyLmlzRmluZElucHV0Rm9jdXNlZCgpKSB7XG5cdFx0XHRcdHJldHVybiB0aGlzLnVwZGF0ZVRleHRGcm9tRmluZFdpZGdldChjb250cm9sbGVyLCB7IGFsbG93U2VhcmNoT25UeXBlIH0pO1xuXHRcdFx0fVxuXG5cdFx0XHRjb25zdCBlZGl0b3JzID0gdGhpcy5jb2RlRWRpdG9yU2VydmljZS5saXN0Q29kZUVkaXRvcnMoKTtcblx0XHRcdGFjdGl2ZUVkaXRvciA9IGVkaXRvcnMuZmluZChlZGl0b3IgPT4gZWRpdG9yIGluc3RhbmNlb2YgRW1iZWRkZWRDb2RlRWRpdG9yV2lkZ2V0ICYmIGVkaXRvci5nZXRQYXJlbnRFZGl0b3IoKSA9PT0gYWN0aXZlRWRpdG9yICYmIGVkaXRvci5oYXNUZXh0Rm9jdXMoKSlcblx0XHRcdFx0Pz8gYWN0aXZlRWRpdG9yO1xuXHRcdH1cblxuXHRcdHJldHVybiB0aGlzLnVwZGF0ZVRleHRGcm9tU2VsZWN0aW9uKHsgYWxsb3dVbnNlbGVjdGVkV29yZCwgYWxsb3dTZWFyY2hPblR5cGUgfSwgYWN0aXZlRWRpdG9yKTtcblx0fVxuXG5cdHByaXZhdGUgdXBkYXRlVGV4dEZyb21GaW5kV2lkZ2V0KGNvbnRyb2xsZXI6IENvbW1vbkZpbmRDb250cm9sbGVyLCB7IGFsbG93U2VhcmNoT25UeXBlID0gdHJ1ZSB9KTogYm9vbGVhbiB7XG5cdFx0aWYgKCF0aGlzLnNlYXJjaENvbmZpZy5zZWVkV2l0aE5lYXJlc3RXb3JkICYmIChkb20uZ2V0QWN0aXZlV2luZG93KCkuZ2V0U2VsZWN0aW9uKCk/LnRvU3RyaW5nKCkgPz8gJycpID09PSAnJykge1xuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH1cblxuXHRcdGNvbnN0IHNlYXJjaFN0cmluZyA9IGNvbnRyb2xsZXIuZ2V0U3RhdGUoKS5zZWFyY2hTdHJpbmc7XG5cdFx0aWYgKHNlYXJjaFN0cmluZyA9PT0gJycpIHtcblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cblx0XHR0aGlzLnNlYXJjaFdpZGdldC5zZWFyY2hJbnB1dD8uc2V0Q2FzZVNlbnNpdGl2ZShjb250cm9sbGVyLmdldFN0YXRlKCkubWF0Y2hDYXNlKTtcblx0XHR0aGlzLnNlYXJjaFdpZGdldC5zZWFyY2hJbnB1dD8uc2V0V2hvbGVXb3Jkcyhjb250cm9sbGVyLmdldFN0YXRlKCkud2hvbGVXb3JkKTtcblx0XHR0aGlzLnNlYXJjaFdpZGdldC5zZWFyY2hJbnB1dD8uc2V0UmVnZXgoY29udHJvbGxlci5nZXRTdGF0ZSgpLmlzUmVnZXgpO1xuXHRcdHRoaXMudXBkYXRlVGV4dChzZWFyY2hTdHJpbmcsIGFsbG93U2VhcmNoT25UeXBlKTtcblxuXHRcdHJldHVybiB0cnVlO1xuXHR9XG5cblx0cHJpdmF0ZSB1cGRhdGVUZXh0RnJvbVNlbGVjdGlvbih7IGFsbG93VW5zZWxlY3RlZFdvcmQgPSB0cnVlLCBhbGxvd1NlYXJjaE9uVHlwZSA9IHRydWUgfSwgZWRpdG9yPzogSUVkaXRvcik6IGJvb2xlYW4ge1xuXHRcdGNvbnN0IHNlZWRTZWFyY2hTdHJpbmdGcm9tU2VsZWN0aW9uID0gdGhpcy5jb25maWd1cmF0aW9uU2VydmljZS5nZXRWYWx1ZTxJRWRpdG9yT3B0aW9ucz4oJ2VkaXRvcicpLmZpbmQhLnNlZWRTZWFyY2hTdHJpbmdGcm9tU2VsZWN0aW9uO1xuXHRcdGlmICghc2VlZFNlYXJjaFN0cmluZ0Zyb21TZWxlY3Rpb24gfHwgc2VlZFNlYXJjaFN0cmluZ0Zyb21TZWxlY3Rpb24gPT09ICduZXZlcicpIHtcblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cblx0XHRsZXQgc2VsZWN0ZWRUZXh0ID0gdGhpcy5nZXRTZWFyY2hUZXh0RnJvbUVkaXRvcihhbGxvd1Vuc2VsZWN0ZWRXb3JkLCBlZGl0b3IpO1xuXHRcdGlmIChzZWxlY3RlZFRleHQgPT09IG51bGwpIHtcblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cblx0XHRpZiAodGhpcy5zZWFyY2hXaWRnZXQuc2VhcmNoSW5wdXQ/LmdldFJlZ2V4KCkpIHtcblx0XHRcdHNlbGVjdGVkVGV4dCA9IHN0cmluZ3MuZXNjYXBlUmVnRXhwQ2hhcmFjdGVycyhzZWxlY3RlZFRleHQpO1xuXHRcdH1cblxuXHRcdHRoaXMudXBkYXRlVGV4dChzZWxlY3RlZFRleHQsIGFsbG93U2VhcmNoT25UeXBlKTtcblx0XHRyZXR1cm4gdHJ1ZTtcblx0fVxuXG5cdHByaXZhdGUgdXBkYXRlVGV4dCh0ZXh0OiBzdHJpbmcsIGFsbG93U2VhcmNoT25UeXBlOiBib29sZWFuID0gdHJ1ZSkge1xuXHRcdGlmIChhbGxvd1NlYXJjaE9uVHlwZSAmJiAhdGhpcy52aWV3TW9kZWwuc2VhcmNoUmVzdWx0LmlzRGlydHkpIHtcblx0XHRcdHRoaXMuc2VhcmNoV2lkZ2V0LnNldFZhbHVlKHRleHQpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHR0aGlzLnBhdXNlU2VhcmNoaW5nID0gdHJ1ZTtcblx0XHRcdHRoaXMuc2VhcmNoV2lkZ2V0LnNldFZhbHVlKHRleHQpO1xuXHRcdFx0dGhpcy5wYXVzZVNlYXJjaGluZyA9IGZhbHNlO1xuXHRcdH1cblx0fVxuXG5cdGZvY3VzTmV4dElucHV0Qm94KCk6IHZvaWQge1xuXHRcdGlmICh0aGlzLnNlYXJjaFdpZGdldC5zZWFyY2hJbnB1dEhhc0ZvY3VzKCkpIHtcblx0XHRcdGlmICh0aGlzLnNlYXJjaFdpZGdldC5pc1JlcGxhY2VTaG93bigpKSB7XG5cdFx0XHRcdHRoaXMuc2VhcmNoV2lkZ2V0LmZvY3VzKHRydWUsIHRydWUpO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0dGhpcy5tb3ZlRm9jdXNGcm9tU2VhcmNoT3JSZXBsYWNlKCk7XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0aWYgKHRoaXMuc2VhcmNoV2lkZ2V0LnJlcGxhY2VJbnB1dEhhc0ZvY3VzKCkpIHtcblx0XHRcdHRoaXMubW92ZUZvY3VzRnJvbVNlYXJjaE9yUmVwbGFjZSgpO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGlmICh0aGlzLmlucHV0UGF0dGVybkluY2x1ZGVzLmlucHV0SGFzRm9jdXMoKSkge1xuXHRcdFx0dGhpcy5pbnB1dFBhdHRlcm5FeGNsdWRlcy5mb2N1cygpO1xuXHRcdFx0dGhpcy5pbnB1dFBhdHRlcm5FeGNsdWRlcy5zZWxlY3QoKTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRpZiAodGhpcy5pbnB1dFBhdHRlcm5FeGNsdWRlcy5pbnB1dEhhc0ZvY3VzKCkpIHtcblx0XHRcdHRoaXMuc2VsZWN0VHJlZUlmTm90U2VsZWN0ZWQoKTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIG1vdmVGb2N1c0Zyb21TZWFyY2hPclJlcGxhY2UoKSB7XG5cdFx0aWYgKHRoaXMuc2hvd3NGaWxlVHlwZXMoKSkge1xuXHRcdFx0dGhpcy50b2dnbGVRdWVyeURldGFpbHModHJ1ZSwgdGhpcy5zaG93c0ZpbGVUeXBlcygpKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0dGhpcy5zZWxlY3RUcmVlSWZOb3RTZWxlY3RlZCgpO1xuXHRcdH1cblx0fVxuXG5cdGZvY3VzUHJldmlvdXNJbnB1dEJveCgpOiB2b2lkIHtcblx0XHRpZiAodGhpcy5zZWFyY2hXaWRnZXQuc2VhcmNoSW5wdXRIYXNGb2N1cygpKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0aWYgKHRoaXMuc2VhcmNoV2lkZ2V0LnJlcGxhY2VJbnB1dEhhc0ZvY3VzKCkpIHtcblx0XHRcdHRoaXMuc2VhcmNoV2lkZ2V0LmZvY3VzKHRydWUpO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGlmICh0aGlzLmlucHV0UGF0dGVybkluY2x1ZGVzLmlucHV0SGFzRm9jdXMoKSkge1xuXHRcdFx0dGhpcy5zZWFyY2hXaWRnZXQuZm9jdXModHJ1ZSwgdHJ1ZSk7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0aWYgKHRoaXMuaW5wdXRQYXR0ZXJuRXhjbHVkZXMuaW5wdXRIYXNGb2N1cygpKSB7XG5cdFx0XHR0aGlzLmlucHV0UGF0dGVybkluY2x1ZGVzLmZvY3VzKCk7XG5cdFx0XHR0aGlzLmlucHV0UGF0dGVybkluY2x1ZGVzLnNlbGVjdCgpO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGlmICh0aGlzLnRyZWUuaXNET01Gb2N1c2VkKCkpIHtcblx0XHRcdHRoaXMubW92ZUZvY3VzRnJvbVJlc3VsdHMoKTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIG1vdmVGb2N1c0Zyb21SZXN1bHRzKCk6IHZvaWQge1xuXHRcdGlmICh0aGlzLnNob3dzRmlsZVR5cGVzKCkpIHtcblx0XHRcdHRoaXMudG9nZ2xlUXVlcnlEZXRhaWxzKHRydWUsIHRydWUsIGZhbHNlLCB0cnVlKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0dGhpcy5zZWFyY2hXaWRnZXQuZm9jdXModHJ1ZSwgdHJ1ZSk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSByZUxheW91dCgpOiB2b2lkIHtcblx0XHRpZiAodGhpcy5pc0Rpc3Bvc2VkIHx8ICF0aGlzLnNpemUpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCBhY3Rpb25zUG9zaXRpb24gPSB0aGlzLnNlYXJjaENvbmZpZy5hY3Rpb25zUG9zaXRpb247XG5cdFx0dGhpcy5nZXRDb250YWluZXIoKS5jbGFzc0xpc3QudG9nZ2xlKFNlYXJjaFZpZXcuQUNUSU9OU19SSUdIVF9DTEFTU19OQU1FLCBhY3Rpb25zUG9zaXRpb24gPT09ICdyaWdodCcpO1xuXG5cdFx0dGhpcy5zZWFyY2hXaWRnZXQuc2V0V2lkdGgodGhpcy5zaXplLndpZHRoIC0gMjggLyogY29udGFpbmVyIG1hcmdpbiAqLyk7XG5cblx0XHR0aGlzLmlucHV0UGF0dGVybkV4Y2x1ZGVzLnNldFdpZHRoKHRoaXMuc2l6ZS53aWR0aCAtIDI4IC8qIGNvbnRhaW5lciBtYXJnaW4gKi8pO1xuXHRcdHRoaXMuaW5wdXRQYXR0ZXJuSW5jbHVkZXMuc2V0V2lkdGgodGhpcy5zaXplLndpZHRoIC0gMjggLyogY29udGFpbmVyIG1hcmdpbiAqLyk7XG5cblx0XHRjb25zdCB3aWRnZXRIZWlnaHQgPSBkb20uZ2V0VG90YWxIZWlnaHQodGhpcy5zZWFyY2hXaWRnZXRzQ29udGFpbmVyRWxlbWVudCk7XG5cdFx0Y29uc3QgbWVzc2FnZXNIZWlnaHQgPSBkb20uZ2V0VG90YWxIZWlnaHQodGhpcy5tZXNzYWdlc0VsZW1lbnQpO1xuXHRcdHRoaXMudHJlZS5sYXlvdXQodGhpcy5zaXplLmhlaWdodCAtIHdpZGdldEhlaWdodCAtIG1lc3NhZ2VzSGVpZ2h0LCB0aGlzLnNpemUud2lkdGggLSAyOCk7XG5cdH1cblxuXHRwcm90ZWN0ZWQgb3ZlcnJpZGUgbGF5b3V0Qm9keShoZWlnaHQ6IG51bWJlciwgd2lkdGg6IG51bWJlcik6IHZvaWQge1xuXHRcdHN1cGVyLmxheW91dEJvZHkoaGVpZ2h0LCB3aWR0aCk7XG5cdFx0dGhpcy5zaXplID0gbmV3IGRvbS5EaW1lbnNpb24od2lkdGgsIGhlaWdodCk7XG5cdFx0dGhpcy5yZUxheW91dCgpO1xuXHR9XG5cblx0Z2V0Q29udHJvbCgpIHtcblx0XHRyZXR1cm4gdGhpcy50cmVlO1xuXHR9XG5cblx0YWxsU2VhcmNoRmllbGRzQ2xlYXIoKTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuIHRoaXMuc2VhcmNoV2lkZ2V0LmdldFJlcGxhY2VWYWx1ZSgpID09PSAnJyAmJlxuXHRcdFx0KCF0aGlzLnNlYXJjaFdpZGdldC5zZWFyY2hJbnB1dCB8fCB0aGlzLnNlYXJjaFdpZGdldC5zZWFyY2hJbnB1dC5nZXRWYWx1ZSgpID09PSAnJyk7XG5cdH1cblxuXHRhbGxGaWxlUGF0dGVybkZpZWxkc0NsZWFyKCk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiB0aGlzLnNlYXJjaEV4Y2x1ZGVQYXR0ZXJuLmdldFZhbHVlKCkgPT09ICcnICYmXG5cdFx0XHR0aGlzLnNlYXJjaEluY2x1ZGVQYXR0ZXJuLmdldFZhbHVlKCkgPT09ICcnO1xuXHR9XG5cblx0aGFzU2VhcmNoUmVzdWx0cygpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gIXRoaXMudmlld01vZGVsLnNlYXJjaFJlc3VsdC5pc0VtcHR5KCk7XG5cdH1cblxuXHRjbGVhclNlYXJjaFJlc3VsdHMoY2xlYXJJbnB1dCA9IHRydWUpOiB2b2lkIHtcblx0XHR0aGlzLnZpZXdNb2RlbC5zZWFyY2hSZXN1bHQuY2xlYXIoKTtcblx0XHR0aGlzLnNob3dFbXB0eVN0YWdlKHRydWUpO1xuXHRcdGlmICh0aGlzLmNvbnRleHRTZXJ2aWNlLmdldFdvcmtiZW5jaFN0YXRlKCkgPT09IFdvcmtiZW5jaFN0YXRlLkVNUFRZKSB7XG5cdFx0XHR0aGlzLnNob3dTZWFyY2hXaXRob3V0Rm9sZGVyTWVzc2FnZSgpO1xuXHRcdH1cblx0XHRpZiAoY2xlYXJJbnB1dCkge1xuXHRcdFx0aWYgKHRoaXMuYWxsU2VhcmNoRmllbGRzQ2xlYXIoKSkge1xuXHRcdFx0XHR0aGlzLmNsZWFyRmlsZVBhdHRlcm5GaWVsZHMoKTtcblx0XHRcdH1cblx0XHRcdHRoaXMuc2VhcmNoV2lkZ2V0LmNsZWFyKCk7XG5cdFx0fVxuXHRcdHRoaXMudmlld01vZGVsLmNhbmNlbFNlYXJjaCgpO1xuXHRcdHRoaXMudmlld01vZGVsLmNhbmNlbEFJU2VhcmNoKCk7XG5cdFx0dGhpcy50cmVlLmFyaWFMYWJlbCA9IG5scy5sb2NhbGl6ZSgnZW1wdHlTZWFyY2gnLCBcIkVtcHR5IFNlYXJjaFwiKTtcblxuXHRcdHRoaXMuYWNjZXNzaWJpbGl0eVNpZ25hbFNlcnZpY2UucGxheVNpZ25hbChBY2Nlc3NpYmlsaXR5U2lnbmFsLmNsZWFyKTtcblx0XHR0aGlzLnJlTGF5b3V0KCk7XG5cdH1cblxuXHRjbGVhckZpbGVQYXR0ZXJuRmllbGRzKCk6IHZvaWQge1xuXHRcdHRoaXMuc2VhcmNoRXhjbHVkZVBhdHRlcm4uY2xlYXIoKTtcblx0XHR0aGlzLnNlYXJjaEluY2x1ZGVQYXR0ZXJuLmNsZWFyKCk7XG5cdH1cblxuXHRjYW5jZWxTZWFyY2goZm9jdXM6IGJvb2xlYW4gPSB0cnVlKTogYm9vbGVhbiB7XG5cdFx0aWYgKHRoaXMudmlld01vZGVsLmNhbmNlbFNlYXJjaCgpICYmIHRoaXMudmlld01vZGVsLmNhbmNlbEFJU2VhcmNoKCkpIHtcblx0XHRcdGlmIChmb2N1cykgeyB0aGlzLnNlYXJjaFdpZGdldC5mb2N1cygpOyB9XG5cdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHR9XG5cdFx0cmV0dXJuIGZhbHNlO1xuXHR9XG5cblx0cHJpdmF0ZSBzZWxlY3RUcmVlSWZOb3RTZWxlY3RlZCgpOiB2b2lkIHtcblx0XHRpZiAodGhpcy50cmVlLmdldE5vZGUodW5kZWZpbmVkKSkge1xuXHRcdFx0dGhpcy50cmVlLmRvbUZvY3VzKCk7XG5cdFx0XHRjb25zdCBzZWxlY3Rpb24gPSB0aGlzLnRyZWUuZ2V0U2VsZWN0aW9uKCk7XG5cdFx0XHRpZiAoc2VsZWN0aW9uLmxlbmd0aCA9PT0gMCkge1xuXHRcdFx0XHRjb25zdCBldmVudCA9IGdldFNlbGVjdGlvbktleWJvYXJkRXZlbnQoKTtcblx0XHRcdFx0dGhpcy50cmVlLmZvY3VzTmV4dCh1bmRlZmluZWQsIHVuZGVmaW5lZCwgZXZlbnQpO1xuXHRcdFx0XHR0aGlzLnRyZWUuc2V0U2VsZWN0aW9uKHRoaXMudHJlZS5nZXRGb2N1cygpLCBldmVudCk7XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBnZXRTZWFyY2hUZXh0RnJvbUVkaXRvcihhbGxvd1Vuc2VsZWN0ZWRXb3JkOiBib29sZWFuLCBlZGl0b3I/OiBJRWRpdG9yKTogc3RyaW5nIHwgbnVsbCB7XG5cdFx0aWYgKGRvbS5pc0FuY2VzdG9yT2ZBY3RpdmVFbGVtZW50KHRoaXMuZ2V0Q29udGFpbmVyKCkpKSB7XG5cdFx0XHRyZXR1cm4gbnVsbDtcblx0XHR9XG5cblx0XHRlZGl0b3IgPSBlZGl0b3IgPz8gdGhpcy5lZGl0b3JTZXJ2aWNlLmFjdGl2ZVRleHRFZGl0b3JDb250cm9sO1xuXG5cdFx0aWYgKCFlZGl0b3IpIHtcblx0XHRcdHJldHVybiBudWxsO1xuXHRcdH1cblxuXHRcdGNvbnN0IGFsbG93VW5zZWxlY3RlZCA9IHRoaXMuc2VhcmNoQ29uZmlnLnNlZWRXaXRoTmVhcmVzdFdvcmQgJiYgYWxsb3dVbnNlbGVjdGVkV29yZDtcblx0XHRyZXR1cm4gZ2V0U2VsZWN0aW9uVGV4dEZyb21FZGl0b3IoYWxsb3dVbnNlbGVjdGVkLCBlZGl0b3IpO1xuXHR9XG5cblx0cHJpdmF0ZSBzaG93c0ZpbGVUeXBlcygpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gdGhpcy5xdWVyeURldGFpbHMuY2xhc3NMaXN0LmNvbnRhaW5zKCdtb3JlJyk7XG5cdH1cblxuXHR0b2dnbGVDYXNlU2Vuc2l0aXZlKCk6IHZvaWQge1xuXHRcdHRoaXMuc2VhcmNoV2lkZ2V0LnNlYXJjaElucHV0Py5zZXRDYXNlU2Vuc2l0aXZlKCF0aGlzLnNlYXJjaFdpZGdldC5zZWFyY2hJbnB1dC5nZXRDYXNlU2Vuc2l0aXZlKCkpO1xuXHRcdHRoaXMudHJpZ2dlclF1ZXJ5Q2hhbmdlKHsgc2hvdWxkS2VlcEFJUmVzdWx0czogdHJ1ZSB9KTtcblx0fVxuXG5cdHRvZ2dsZVdob2xlV29yZHMoKTogdm9pZCB7XG5cdFx0dGhpcy5zZWFyY2hXaWRnZXQuc2VhcmNoSW5wdXQ/LnNldFdob2xlV29yZHMoIXRoaXMuc2VhcmNoV2lkZ2V0LnNlYXJjaElucHV0LmdldFdob2xlV29yZHMoKSk7XG5cdFx0dGhpcy50cmlnZ2VyUXVlcnlDaGFuZ2UoeyBzaG91bGRLZWVwQUlSZXN1bHRzOiB0cnVlIH0pO1xuXHR9XG5cblx0dG9nZ2xlUmVnZXgoKTogdm9pZCB7XG5cdFx0dGhpcy5zZWFyY2hXaWRnZXQuc2VhcmNoSW5wdXQ/LnNldFJlZ2V4KCF0aGlzLnNlYXJjaFdpZGdldC5zZWFyY2hJbnB1dC5nZXRSZWdleCgpKTtcblx0XHR0aGlzLnRyaWdnZXJRdWVyeUNoYW5nZSh7IHNob3VsZEtlZXBBSVJlc3VsdHM6IHRydWUgfSk7XG5cdH1cblxuXHR0b2dnbGVQcmVzZXJ2ZUNhc2UoKTogdm9pZCB7XG5cdFx0dGhpcy5zZWFyY2hXaWRnZXQucmVwbGFjZUlucHV0Py5zZXRQcmVzZXJ2ZUNhc2UoIXRoaXMuc2VhcmNoV2lkZ2V0LnJlcGxhY2VJbnB1dC5nZXRQcmVzZXJ2ZUNhc2UoKSk7XG5cdFx0dGhpcy50cmlnZ2VyUXVlcnlDaGFuZ2UoeyBzaG91bGRLZWVwQUlSZXN1bHRzOiB0cnVlIH0pO1xuXHR9XG5cblx0c2V0U2VhcmNoUGFyYW1ldGVycyhhcmdzOiBJRmluZEluRmlsZXNBcmdzID0ge30pOiB2b2lkIHtcblx0XHRpZiAodHlwZW9mIGFyZ3MuaXNDYXNlU2Vuc2l0aXZlID09PSAnYm9vbGVhbicpIHtcblx0XHRcdHRoaXMuc2VhcmNoV2lkZ2V0LnNlYXJjaElucHV0Py5zZXRDYXNlU2Vuc2l0aXZlKGFyZ3MuaXNDYXNlU2Vuc2l0aXZlKTtcblx0XHR9XG5cdFx0aWYgKHR5cGVvZiBhcmdzLm1hdGNoV2hvbGVXb3JkID09PSAnYm9vbGVhbicpIHtcblx0XHRcdHRoaXMuc2VhcmNoV2lkZ2V0LnNlYXJjaElucHV0Py5zZXRXaG9sZVdvcmRzKGFyZ3MubWF0Y2hXaG9sZVdvcmQpO1xuXHRcdH1cblx0XHRpZiAodHlwZW9mIGFyZ3MuaXNSZWdleCA9PT0gJ2Jvb2xlYW4nKSB7XG5cdFx0XHR0aGlzLnNlYXJjaFdpZGdldC5zZWFyY2hJbnB1dD8uc2V0UmVnZXgoYXJncy5pc1JlZ2V4KTtcblx0XHR9XG5cdFx0aWYgKHR5cGVvZiBhcmdzLmZpbGVzVG9JbmNsdWRlID09PSAnc3RyaW5nJykge1xuXHRcdFx0dGhpcy5zZWFyY2hJbmNsdWRlUGF0dGVybi5zZXRWYWx1ZShTdHJpbmcoYXJncy5maWxlc1RvSW5jbHVkZSkpO1xuXHRcdH1cblx0XHRpZiAodHlwZW9mIGFyZ3MuZmlsZXNUb0V4Y2x1ZGUgPT09ICdzdHJpbmcnKSB7XG5cdFx0XHR0aGlzLnNlYXJjaEV4Y2x1ZGVQYXR0ZXJuLnNldFZhbHVlKFN0cmluZyhhcmdzLmZpbGVzVG9FeGNsdWRlKSk7XG5cdFx0fVxuXHRcdGlmICh0eXBlb2YgYXJncy5xdWVyeSA9PT0gJ3N0cmluZycpIHtcblx0XHRcdHRoaXMuc2VhcmNoV2lkZ2V0LnNlYXJjaElucHV0Py5zZXRWYWx1ZShhcmdzLnF1ZXJ5KTtcblx0XHR9XG5cdFx0aWYgKHR5cGVvZiBhcmdzLnJlcGxhY2UgPT09ICdzdHJpbmcnKSB7XG5cdFx0XHR0aGlzLnNlYXJjaFdpZGdldC5yZXBsYWNlSW5wdXQ/LnNldFZhbHVlKGFyZ3MucmVwbGFjZSk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdGlmICh0aGlzLnNlYXJjaFdpZGdldC5yZXBsYWNlSW5wdXQgJiYgdGhpcy5zZWFyY2hXaWRnZXQucmVwbGFjZUlucHV0LmdldFZhbHVlKCkgIT09ICcnKSB7XG5cdFx0XHRcdHRoaXMuc2VhcmNoV2lkZ2V0LnJlcGxhY2VJbnB1dC5zZXRWYWx1ZSgnJyk7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdGlmICh0eXBlb2YgYXJncy50cmlnZ2VyU2VhcmNoID09PSAnYm9vbGVhbicgJiYgYXJncy50cmlnZ2VyU2VhcmNoKSB7XG5cdFx0XHR0aGlzLnRyaWdnZXJRdWVyeUNoYW5nZSgpO1xuXHRcdH1cblx0XHRpZiAodHlwZW9mIGFyZ3MucHJlc2VydmVDYXNlID09PSAnYm9vbGVhbicpIHtcblx0XHRcdHRoaXMuc2VhcmNoV2lkZ2V0LnJlcGxhY2VJbnB1dD8uc2V0UHJlc2VydmVDYXNlKGFyZ3MucHJlc2VydmVDYXNlKTtcblx0XHR9XG5cdFx0aWYgKHR5cGVvZiBhcmdzLnVzZUV4Y2x1ZGVTZXR0aW5nc0FuZElnbm9yZUZpbGVzID09PSAnYm9vbGVhbicpIHtcblx0XHRcdHRoaXMuaW5wdXRQYXR0ZXJuRXhjbHVkZXMuc2V0VXNlRXhjbHVkZXNBbmRJZ25vcmVGaWxlcyhhcmdzLnVzZUV4Y2x1ZGVTZXR0aW5nc0FuZElnbm9yZUZpbGVzKTtcblx0XHR9XG5cdFx0aWYgKHR5cGVvZiBhcmdzLm9ubHlPcGVuRWRpdG9ycyA9PT0gJ2Jvb2xlYW4nKSB7XG5cdFx0XHR0aGlzLnNlYXJjaEluY2x1ZGVQYXR0ZXJuLnNldE9ubHlTZWFyY2hJbk9wZW5FZGl0b3JzKGFyZ3Mub25seU9wZW5FZGl0b3JzKTtcblx0XHR9XG5cdH1cblxuXHR0b2dnbGVRdWVyeURldGFpbHMobW92ZUZvY3VzID0gdHJ1ZSwgc2hvdz86IGJvb2xlYW4sIHNraXBMYXlvdXQ/OiBib29sZWFuLCByZXZlcnNlPzogYm9vbGVhbik6IHZvaWQge1xuXHRcdHNob3cgPSB0eXBlb2Ygc2hvdyA9PT0gJ3VuZGVmaW5lZCcgPyAhdGhpcy5xdWVyeURldGFpbHMuY2xhc3NMaXN0LmNvbnRhaW5zKCdtb3JlJykgOiBCb29sZWFuKHNob3cpO1xuXHRcdGlmICghdGhpcy52aWV3bGV0U3RhdGUucXVlcnkpIHtcblx0XHRcdHRoaXMudmlld2xldFN0YXRlLnF1ZXJ5ID0ge307XG5cdFx0fVxuXHRcdHRoaXMudmlld2xldFN0YXRlLnF1ZXJ5LnF1ZXJ5RGV0YWlsc0V4cGFuZGVkID0gc2hvdztcblx0XHRza2lwTGF5b3V0ID0gQm9vbGVhbihza2lwTGF5b3V0KTtcblx0XHRpZiAoc2hvdykge1xuXHRcdFx0dGhpcy50b2dnbGVRdWVyeURldGFpbHNCdXR0b24uc2V0QXR0cmlidXRlKCdhcmlhLWV4cGFuZGVkJywgJ3RydWUnKTtcblx0XHRcdHRoaXMucXVlcnlEZXRhaWxzLmNsYXNzTGlzdC5hZGQoJ21vcmUnKTtcblx0XHRcdGlmIChtb3ZlRm9jdXMpIHtcblx0XHRcdFx0aWYgKHJldmVyc2UpIHtcblx0XHRcdFx0XHR0aGlzLmlucHV0UGF0dGVybkV4Y2x1ZGVzLmZvY3VzKCk7XG5cdFx0XHRcdFx0dGhpcy5pbnB1dFBhdHRlcm5FeGNsdWRlcy5zZWxlY3QoKTtcblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHR0aGlzLmlucHV0UGF0dGVybkluY2x1ZGVzLmZvY3VzKCk7XG5cdFx0XHRcdFx0dGhpcy5pbnB1dFBhdHRlcm5JbmNsdWRlcy5zZWxlY3QoKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH0gZWxzZSB7XG5cdFx0XHR0aGlzLnRvZ2dsZVF1ZXJ5RGV0YWlsc0J1dHRvbi5zZXRBdHRyaWJ1dGUoJ2FyaWEtZXhwYW5kZWQnLCAnZmFsc2UnKTtcblx0XHRcdHRoaXMucXVlcnlEZXRhaWxzLmNsYXNzTGlzdC5yZW1vdmUoJ21vcmUnKTtcblx0XHRcdGlmIChtb3ZlRm9jdXMpIHtcblx0XHRcdFx0dGhpcy5zZWFyY2hXaWRnZXQuZm9jdXMoKTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRpZiAoIXNraXBMYXlvdXQgJiYgdGhpcy5zaXplKSB7XG5cdFx0XHR0aGlzLnJlTGF5b3V0KCk7XG5cdFx0fVxuXHR9XG5cblx0c2VhcmNoSW5Gb2xkZXJzKGZvbGRlclBhdGhzOiBzdHJpbmdbXSA9IFtdKTogdm9pZCB7XG5cdFx0dGhpcy5fc2VhcmNoV2l0aEluY2x1ZGVPckV4Y2x1ZGUodHJ1ZSwgZm9sZGVyUGF0aHMpO1xuXHR9XG5cblx0c2VhcmNoT3V0c2lkZU9mRm9sZGVycyhmb2xkZXJQYXRoczogc3RyaW5nW10gPSBbXSk6IHZvaWQge1xuXHRcdHRoaXMuX3NlYXJjaFdpdGhJbmNsdWRlT3JFeGNsdWRlKGZhbHNlLCBmb2xkZXJQYXRocyk7XG5cdH1cblxuXHRwcml2YXRlIF9zZWFyY2hXaXRoSW5jbHVkZU9yRXhjbHVkZShpbmNsdWRlOiBib29sZWFuLCBmb2xkZXJQYXRoczogc3RyaW5nW10pIHtcblx0XHRpZiAoIWZvbGRlclBhdGhzLmxlbmd0aCB8fCBmb2xkZXJQYXRocy5zb21lKGZvbGRlclBhdGggPT4gZm9sZGVyUGF0aCA9PT0gJy4nKSkge1xuXHRcdFx0dGhpcy5pbnB1dFBhdHRlcm5JbmNsdWRlcy5zZXRWYWx1ZSgnJyk7XG5cdFx0XHR0aGlzLnNlYXJjaFdpZGdldC5mb2N1cygpO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdC8vIFNob3cgJ2ZpbGVzIHRvIGluY2x1ZGUnIGJveFxuXHRcdGlmICghdGhpcy5zaG93c0ZpbGVUeXBlcygpKSB7XG5cdFx0XHR0aGlzLnRvZ2dsZVF1ZXJ5RGV0YWlscyh0cnVlLCB0cnVlKTtcblx0XHR9XG5cblx0XHQoaW5jbHVkZSA/IHRoaXMuaW5wdXRQYXR0ZXJuSW5jbHVkZXMgOiB0aGlzLmlucHV0UGF0dGVybkV4Y2x1ZGVzKS5zZXRWYWx1ZShmb2xkZXJQYXRocy5qb2luKCcsICcpKTtcblx0XHR0aGlzLnNlYXJjaFdpZGdldC5mb2N1cyhmYWxzZSk7XG5cdH1cblxuXHR0cmlnZ2VyUXVlcnlDaGFuZ2UoX29wdGlvbnM/OiB7IHByZXNlcnZlRm9jdXM/OiBib29sZWFuOyB0cmlnZ2VyZWRPblR5cGU/OiBib29sZWFuOyBkZWxheT86IG51bWJlcjsgc2hvdWxkS2VlcEFJUmVzdWx0cz86IGJvb2xlYW47IHNob3VsZFVwZGF0ZUFJU2VhcmNoPzogYm9vbGVhbiB9KTogdm9pZCB7XG5cdFx0Y29uc3Qgb3B0aW9ucyA9IHsgcHJlc2VydmVGb2N1czogdHJ1ZSwgdHJpZ2dlcmVkT25UeXBlOiBmYWxzZSwgZGVsYXk6IDAsIC4uLl9vcHRpb25zIH07XG5cblx0XHRpZiAob3B0aW9ucy50cmlnZ2VyZWRPblR5cGUgJiYgIXRoaXMuc2VhcmNoQ29uZmlnLnNlYXJjaE9uVHlwZSkgeyByZXR1cm47IH1cblxuXHRcdGlmICghdGhpcy5wYXVzZVNlYXJjaGluZykge1xuXG5cdFx0XHRjb25zdCBkZWxheSA9IG9wdGlvbnMudHJpZ2dlcmVkT25UeXBlID8gb3B0aW9ucy5kZWxheSA6IDA7XG5cdFx0XHR0aGlzLnRyaWdnZXJRdWVyeURlbGF5ZXIudHJpZ2dlcigoKSA9PiB7XG5cdFx0XHRcdHRoaXMuX29uUXVlcnlDaGFuZ2VkKG9wdGlvbnMucHJlc2VydmVGb2N1cywgb3B0aW9ucy50cmlnZ2VyZWRPblR5cGUsIG9wdGlvbnMuc2hvdWxkS2VlcEFJUmVzdWx0cywgb3B0aW9ucy5zaG91bGRVcGRhdGVBSVNlYXJjaCk7XG5cdFx0XHR9LCBkZWxheSk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBfZ2V0RXhjbHVkZVBhdHRlcm4oKTogc3RyaW5nIHtcblx0XHRyZXR1cm4gdGhpcy5pbnB1dFBhdHRlcm5FeGNsdWRlcy5nZXRWYWx1ZSgpLnRyaW0oKTtcblx0fVxuXG5cdHByaXZhdGUgX2dldEluY2x1ZGVQYXR0ZXJuKCk6IHN0cmluZyB7XG5cdFx0cmV0dXJuIHRoaXMuaW5wdXRQYXR0ZXJuSW5jbHVkZXMuZ2V0VmFsdWUoKS50cmltKCk7XG5cdH1cblxuXHRwcml2YXRlIF9vblF1ZXJ5Q2hhbmdlZChwcmVzZXJ2ZUZvY3VzOiBib29sZWFuLCB0cmlnZ2VyZWRPblR5cGUgPSBmYWxzZSwgc2hvdWxkS2VlcEFJUmVzdWx0cyA9IGZhbHNlLCBzaG91bGRVcGRhdGVBSVNlYXJjaCA9IGZhbHNlKTogdm9pZCB7XG5cdFx0aWYgKCEodGhpcy5zZWFyY2hXaWRnZXQuc2VhcmNoSW5wdXQ/LmlucHV0Qm94LmlzSW5wdXRWYWxpZCgpKSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IGlzUmVnZXggPSB0aGlzLnNlYXJjaFdpZGdldC5zZWFyY2hJbnB1dC5nZXRSZWdleCgpO1xuXHRcdGNvbnN0IGlzSW5Ob3RlYm9va01hcmtkb3duSW5wdXQgPSB0aGlzLnNlYXJjaFdpZGdldC5nZXROb3RlYm9va0ZpbHRlcnMoKS5tYXJrdXBJbnB1dDtcblx0XHRjb25zdCBpc0luTm90ZWJvb2tNYXJrZG93blByZXZpZXcgPSB0aGlzLnNlYXJjaFdpZGdldC5nZXROb3RlYm9va0ZpbHRlcnMoKS5tYXJrdXBQcmV2aWV3O1xuXHRcdGNvbnN0IGlzSW5Ob3RlYm9va0NlbGxJbnB1dCA9IHRoaXMuc2VhcmNoV2lkZ2V0LmdldE5vdGVib29rRmlsdGVycygpLmNvZGVJbnB1dDtcblx0XHRjb25zdCBpc0luTm90ZWJvb2tDZWxsT3V0cHV0ID0gdGhpcy5zZWFyY2hXaWRnZXQuZ2V0Tm90ZWJvb2tGaWx0ZXJzKCkuY29kZU91dHB1dDtcblxuXHRcdGNvbnN0IGlzV2hvbGVXb3JkcyA9IHRoaXMuc2VhcmNoV2lkZ2V0LnNlYXJjaElucHV0LmdldFdob2xlV29yZHMoKTtcblx0XHRjb25zdCBpc0Nhc2VTZW5zaXRpdmUgPSB0aGlzLnNlYXJjaFdpZGdldC5zZWFyY2hJbnB1dC5nZXRDYXNlU2Vuc2l0aXZlKCk7XG5cdFx0Y29uc3QgY29udGVudFBhdHRlcm4gPSB0aGlzLnNlYXJjaFdpZGdldC5zZWFyY2hJbnB1dC5nZXRWYWx1ZSgpO1xuXHRcdGNvbnN0IGV4Y2x1ZGVQYXR0ZXJuVGV4dCA9IHRoaXMuX2dldEV4Y2x1ZGVQYXR0ZXJuKCk7XG5cdFx0Y29uc3QgaW5jbHVkZVBhdHRlcm5UZXh0ID0gdGhpcy5fZ2V0SW5jbHVkZVBhdHRlcm4oKTtcblx0XHRjb25zdCB1c2VFeGNsdWRlc0FuZElnbm9yZUZpbGVzID0gdGhpcy5pbnB1dFBhdHRlcm5FeGNsdWRlcy51c2VFeGNsdWRlc0FuZElnbm9yZUZpbGVzKCk7XG5cdFx0Y29uc3Qgb25seVNlYXJjaEluT3BlbkVkaXRvcnMgPSB0aGlzLmlucHV0UGF0dGVybkluY2x1ZGVzLm9ubHlTZWFyY2hJbk9wZW5FZGl0b3JzKCk7XG5cdFx0Y29uc3Qgb25seVNlYXJjaEluQ2hhbmdlZEZpbGVzID0gdGhpcy5pbnB1dFBhdHRlcm5JbmNsdWRlcy5vbmx5U2VhcmNoSW5DaGFuZ2VkRmlsZXMoKTtcblxuXHRcdGlmIChjb250ZW50UGF0dGVybi5sZW5ndGggPT09IDApIHtcblx0XHRcdHRoaXMuY2xlYXJTZWFyY2hSZXN1bHRzKGZhbHNlKTtcblx0XHRcdHRoaXMuY2xlYXJNZXNzYWdlKCk7XG5cdFx0XHR0aGlzLmNsZWFyQUlSZXN1bHRzKCk7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29uc3QgY29udGVudDogSVBhdHRlcm5JbmZvID0ge1xuXHRcdFx0cGF0dGVybjogY29udGVudFBhdHRlcm4sXG5cdFx0XHRpc1JlZ0V4cDogaXNSZWdleCxcblx0XHRcdGlzQ2FzZVNlbnNpdGl2ZTogaXNDYXNlU2Vuc2l0aXZlLFxuXHRcdFx0aXNXb3JkTWF0Y2g6IGlzV2hvbGVXb3Jkcyxcblx0XHRcdG5vdGVib29rSW5mbzoge1xuXHRcdFx0XHRpc0luTm90ZWJvb2tNYXJrZG93bklucHV0LFxuXHRcdFx0XHRpc0luTm90ZWJvb2tNYXJrZG93blByZXZpZXcsXG5cdFx0XHRcdGlzSW5Ob3RlYm9va0NlbGxJbnB1dCxcblx0XHRcdFx0aXNJbk5vdGVib29rQ2VsbE91dHB1dFxuXHRcdFx0fVxuXHRcdH07XG5cblx0XHRjb25zdCBleGNsdWRlUGF0dGVybiA9IFt7IHBhdHRlcm46IHRoaXMuaW5wdXRQYXR0ZXJuRXhjbHVkZXMuZ2V0VmFsdWUoKSB9XTtcblx0XHRjb25zdCBpbmNsdWRlUGF0dGVybiA9IHRoaXMuaW5wdXRQYXR0ZXJuSW5jbHVkZXMuZ2V0VmFsdWUoKTtcblxuXHRcdGxldCBjaGFuZ2VkRmlsZVVyaXM6IFVSSVtdIHwgdW5kZWZpbmVkO1xuXHRcdGlmIChvbmx5U2VhcmNoSW5DaGFuZ2VkRmlsZXMpIHtcblx0XHRcdGNoYW5nZWRGaWxlVXJpcyA9IFsuLi50aGlzLnNjbVNlcnZpY2UucmVwb3NpdG9yaWVzXVxuXHRcdFx0XHQuZmxhdE1hcChyZXBvc2l0b3J5ID0+IHJlcG9zaXRvcnkucHJvdmlkZXIuZ3JvdXBzKVxuXHRcdFx0XHQuZmxhdE1hcChncm91cCA9PiBncm91cC5yZXNvdXJjZXMpXG5cdFx0XHRcdC5tYXAocmVzb3VyY2UgPT4gcmVzb3VyY2Uuc291cmNlVXJpKTtcblx0XHR9XG5cblx0XHQvLyBOZWVkIHRoZSBmdWxsIG1hdGNoIGxpbmUgdG8gY29ycmVjdGx5IGNhbGN1bGF0ZSByZXBsYWNlIHRleHQsIGlmIHRoaXMgaXMgYSBzZWFyY2gvcmVwbGFjZSB3aXRoIHJlZ2V4IGdyb3VwIHJlZmVyZW5jZXMgKCQxLCAkMiwgLi4uKS5cblx0XHQvLyAxMDAwMCBjaGFycyBpcyBlbm91Z2ggdG8gYXZvaWQgc2VuZGluZyBodWdlIGFtb3VudHMgb2YgdGV4dCBhcm91bmQsIGlmIHlvdSBkbyBhIHJlcGxhY2Ugd2l0aCBhIGxvbmdlciBtYXRjaCwgaXQgbWF5IG9yIG1heSBub3QgcmVzb2x2ZSB0aGUgZ3JvdXAgcmVmcyBjb3JyZWN0bHkuXG5cdFx0Ly8gaHR0cHM6Ly9naXRodWIuY29tL21pY3Jvc29mdC92c2NvZGUvaXNzdWVzLzU4Mzc0XG5cdFx0Y29uc3QgY2hhcnNQZXJMaW5lID0gY29udGVudC5pc1JlZ0V4cCA/IDEwMDAwIDogMTAwMDtcblxuXHRcdGNvbnN0IG9wdGlvbnM6IElUZXh0UXVlcnlCdWlsZGVyT3B0aW9ucyA9IHtcblx0XHRcdF9yZWFzb246ICdzZWFyY2hWaWV3Jyxcblx0XHRcdGV4dHJhRmlsZVJlc291cmNlczogdGhpcy5pbnN0YW50aWF0aW9uU2VydmljZS5pbnZva2VGdW5jdGlvbihnZXRPdXRPZldvcmtzcGFjZUVkaXRvclJlc291cmNlcyksXG5cdFx0XHRtYXhSZXN1bHRzOiB0aGlzLnNlYXJjaENvbmZpZy5tYXhSZXN1bHRzID8/IHVuZGVmaW5lZCxcblx0XHRcdGRpc3JlZ2FyZElnbm9yZUZpbGVzOiAhdXNlRXhjbHVkZXNBbmRJZ25vcmVGaWxlcyB8fCB1bmRlZmluZWQsXG5cdFx0XHRkaXNyZWdhcmRFeGNsdWRlU2V0dGluZ3M6ICF1c2VFeGNsdWRlc0FuZElnbm9yZUZpbGVzIHx8IHVuZGVmaW5lZCxcblx0XHRcdGlnbm9yZUdsb2JDYXNlOiAhaXNMaW51eCB8fCB1bmRlZmluZWQsXG5cdFx0XHRvbmx5T3BlbkVkaXRvcnM6IG9ubHlTZWFyY2hJbk9wZW5FZGl0b3JzLFxuXHRcdFx0Y2hhbmdlZEZpbGVVcmlzLFxuXHRcdFx0ZXhjbHVkZVBhdHRlcm4sXG5cdFx0XHRpbmNsdWRlUGF0dGVybixcblx0XHRcdHByZXZpZXdPcHRpb25zOiB7XG5cdFx0XHRcdG1hdGNoTGluZXM6IDEsXG5cdFx0XHRcdGNoYXJzUGVyTGluZVxuXHRcdFx0fSxcblx0XHRcdGlzU21hcnRDYXNlOiB0aGlzLnNlYXJjaENvbmZpZy5zbWFydENhc2UsXG5cdFx0XHRleHBhbmRQYXR0ZXJuczogdHJ1ZVxuXHRcdH07XG5cdFx0Y29uc3QgZm9sZGVyUmVzb3VyY2VzID0gdGhpcy5jb250ZXh0U2VydmljZS5nZXRXb3Jrc3BhY2UoKS5mb2xkZXJzO1xuXG5cdFx0Y29uc3Qgb25RdWVyeVZhbGlkYXRpb25FcnJvciA9IChlcnI6IEVycm9yKSA9PiB7XG5cdFx0XHR0aGlzLnNlYXJjaFdpZGdldC5zZWFyY2hJbnB1dD8uc2hvd01lc3NhZ2UoeyBjb250ZW50OiBlcnIubWVzc2FnZSwgdHlwZTogTWVzc2FnZVR5cGUuRVJST1IgfSk7XG5cdFx0XHR0aGlzLnZpZXdNb2RlbC5zZWFyY2hSZXN1bHQuY2xlYXIoKTtcblx0XHR9O1xuXG5cdFx0bGV0IHF1ZXJ5OiBJVGV4dFF1ZXJ5O1xuXHRcdHRyeSB7XG5cdFx0XHRxdWVyeSA9IHRoaXMucXVlcnlCdWlsZGVyLnRleHQoY29udGVudCwgZm9sZGVyUmVzb3VyY2VzLm1hcChmb2xkZXIgPT4gZm9sZGVyLnVyaSksIG9wdGlvbnMpO1xuXHRcdH0gY2F0Y2ggKGVycikge1xuXHRcdFx0b25RdWVyeVZhbGlkYXRpb25FcnJvcihlcnIpO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdHRoaXMudmFsaWRhdGVRdWVyeShxdWVyeSkudGhlbigoKSA9PiB7XG5cdFx0XHRpZiAoIXNob3VsZEtlZXBBSVJlc3VsdHMgJiYgc2hvdWxkVXBkYXRlQUlTZWFyY2ggJiYgdGhpcy50cmVlLmhhc05vZGUodGhpcy5zZWFyY2hSZXN1bHQuYWlUZXh0U2VhcmNoUmVzdWx0KSkge1xuXHRcdFx0XHR0aGlzLnRyZWUuY29sbGFwc2UodGhpcy5zZWFyY2hSZXN1bHQuYWlUZXh0U2VhcmNoUmVzdWx0KTtcblx0XHRcdH1cblxuXHRcdFx0dGhpcy5vblF1ZXJ5VHJpZ2dlcmVkKHF1ZXJ5LCBvcHRpb25zLCBleGNsdWRlUGF0dGVyblRleHQsIGluY2x1ZGVQYXR0ZXJuVGV4dCwgdHJpZ2dlcmVkT25UeXBlLCBzaG91bGRLZWVwQUlSZXN1bHRzLCBzaG91bGRVcGRhdGVBSVNlYXJjaCk7XG5cblx0XHRcdGlmICghcHJlc2VydmVGb2N1cykge1xuXHRcdFx0XHR0aGlzLnNlYXJjaFdpZGdldC5mb2N1cyhmYWxzZSwgdW5kZWZpbmVkLCB0cnVlKTsgLy8gZm9jdXMgYmFjayB0byBpbnB1dCBmaWVsZFxuXHRcdFx0fVxuXHRcdH0sIG9uUXVlcnlWYWxpZGF0aW9uRXJyb3IpO1xuXHR9XG5cblx0cHJpdmF0ZSB2YWxpZGF0ZVF1ZXJ5KHF1ZXJ5OiBJVGV4dFF1ZXJ5KTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Ly8gVmFsaWRhdGUgZm9sZGVyUXVlcmllc1xuXHRcdGNvbnN0IGZvbGRlclF1ZXJpZXNFeGlzdFAgPVxuXHRcdFx0cXVlcnkuZm9sZGVyUXVlcmllcy5tYXAoZnEgPT4ge1xuXHRcdFx0XHRyZXR1cm4gdGhpcy5maWxlU2VydmljZS5leGlzdHMoZnEuZm9sZGVyKS5jYXRjaCgoKSA9PiBmYWxzZSk7XG5cdFx0XHR9KTtcblxuXHRcdHJldHVybiBQcm9taXNlLmFsbChmb2xkZXJRdWVyaWVzRXhpc3RQKS50aGVuKGV4aXN0UmVzdWx0cyA9PiB7XG5cdFx0XHQvLyBJZiBubyBmb2xkZXJzIGV4aXN0LCBzaG93IGFuIGVycm9yIG1lc3NhZ2UgYWJvdXQgdGhlIGZpcnN0IG9uZVxuXHRcdFx0Y29uc3QgZXhpc3RpbmdGb2xkZXJRdWVyaWVzID0gcXVlcnkuZm9sZGVyUXVlcmllcy5maWx0ZXIoKGZvbGRlclF1ZXJ5LCBpKSA9PiBleGlzdFJlc3VsdHNbaV0pO1xuXHRcdFx0aWYgKCFxdWVyeS5mb2xkZXJRdWVyaWVzLmxlbmd0aCB8fCBleGlzdGluZ0ZvbGRlclF1ZXJpZXMubGVuZ3RoKSB7XG5cdFx0XHRcdHF1ZXJ5LmZvbGRlclF1ZXJpZXMgPSBleGlzdGluZ0ZvbGRlclF1ZXJpZXM7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRjb25zdCBub25FeGlzdGFudFBhdGggPSBxdWVyeS5mb2xkZXJRdWVyaWVzWzBdLmZvbGRlci5mc1BhdGg7XG5cdFx0XHRcdGNvbnN0IHNlYXJjaFBhdGhOb3RGb3VuZEVycm9yID0gbmxzLmxvY2FsaXplKCdzZWFyY2hQYXRoTm90Rm91bmRFcnJvcicsIFwiU2VhcmNoIHBhdGggbm90IGZvdW5kOiB7MH1cIiwgbm9uRXhpc3RhbnRQYXRoKTtcblx0XHRcdFx0cmV0dXJuIFByb21pc2UucmVqZWN0KG5ldyBFcnJvcihzZWFyY2hQYXRoTm90Rm91bmRFcnJvcikpO1xuXHRcdFx0fVxuXG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH0pO1xuXHR9XG5cblx0cHJpdmF0ZSBvblF1ZXJ5VHJpZ2dlcmVkKHF1ZXJ5OiBJVGV4dFF1ZXJ5LCBvcHRpb25zOiBJVGV4dFF1ZXJ5QnVpbGRlck9wdGlvbnMsIGV4Y2x1ZGVQYXR0ZXJuVGV4dDogc3RyaW5nLCBpbmNsdWRlUGF0dGVyblRleHQ6IHN0cmluZywgdHJpZ2dlcmVkT25UeXBlOiBib29sZWFuLCBzaG91bGRLZWVwQUlSZXN1bHRzOiBib29sZWFuLCBzaG91bGRVcGRhdGVBSVNlYXJjaDogYm9vbGVhbik6IHZvaWQge1xuXHRcdHRoaXMuYWRkVG9TZWFyY2hIaXN0b3J5RGVsYXllci50cmlnZ2VyKCgpID0+IHtcblx0XHRcdHRoaXMuc2VhcmNoV2lkZ2V0LnNlYXJjaElucHV0Py5vblNlYXJjaFN1Ym1pdCgpO1xuXHRcdFx0dGhpcy5pbnB1dFBhdHRlcm5FeGNsdWRlcy5vblNlYXJjaFN1Ym1pdCgpO1xuXHRcdFx0dGhpcy5pbnB1dFBhdHRlcm5JbmNsdWRlcy5vblNlYXJjaFN1Ym1pdCgpO1xuXHRcdH0pO1xuXG5cdFx0dGhpcy52aWV3TW9kZWwuY2FuY2VsU2VhcmNoKHRydWUpO1xuXHRcdGlmICghc2hvdWxkS2VlcEFJUmVzdWx0cykge1xuXHRcdFx0dGhpcy5jbGVhckFJUmVzdWx0cygpO1xuXHRcdH1cblxuXHRcdHRoaXMuY3VycmVudFNlYXJjaFEgPSB0aGlzLmN1cnJlbnRTZWFyY2hRXG5cdFx0XHQudGhlbigoKSA9PiB0aGlzLmRvU2VhcmNoKHF1ZXJ5LCBleGNsdWRlUGF0dGVyblRleHQsIGluY2x1ZGVQYXR0ZXJuVGV4dCwgdHJpZ2dlcmVkT25UeXBlLCBzaG91bGRLZWVwQUlSZXN1bHRzLCBzaG91bGRVcGRhdGVBSVNlYXJjaCkpXG5cdFx0XHQudGhlbigoKSA9PiB1bmRlZmluZWQsICgpID0+IHVuZGVmaW5lZCk7XG5cdH1cblxuXG5cdHByaXZhdGUgYXN5bmMgX3VwZGF0ZVJlc3VsdHMoKSB7XG5cdFx0aWYgKHRoaXMuc3RhdGUgPT09IFNlYXJjaFVJU3RhdGUuSWRsZSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHR0cnkge1xuXHRcdFx0Ly8gU2VhcmNoIHJlc3VsdCB0cmVlIHVwZGF0ZVxuXHRcdFx0Y29uc3QgZmlsZUNvdW50ID0gdGhpcy52aWV3TW9kZWwuc2VhcmNoUmVzdWx0LmZpbGVDb3VudCgpO1xuXHRcdFx0aWYgKHRoaXMuX3Zpc2libGVNYXRjaGVzICE9PSBmaWxlQ291bnQpIHtcblx0XHRcdFx0dGhpcy5fdmlzaWJsZU1hdGNoZXMgPSBmaWxlQ291bnQ7XG5cdFx0XHRcdGF3YWl0IHRoaXMucmVmcmVzaEFuZFVwZGF0ZUNvdW50KCk7XG5cdFx0XHR9XG5cdFx0fSBmaW5hbGx5IHtcblx0XHRcdC8vIHNob3cgZnJlcXVlbnQgcHJvZ3Jlc3MgYW5kIHJlc3VsdHMgYnkgc2NoZWR1bGluZyB1cGRhdGVzIDgwIG1zIGFmdGVyIHRoZSBsYXN0IG9uZVxuXHRcdFx0dGhpcy5fcmVmcmVzaFJlc3VsdHNTY2hlZHVsZXIuc2NoZWR1bGUoKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIGV4cGFuZElmU2luZ3VsYXJSZXN1bHQoKSB7XG5cdFx0Ly8gZXhwYW5kIGlmIGp1c3QgMSBmaWxlIHdpdGggbGVzcyB0aGFuIDUwIG1hdGNoZXNcblxuXHRcdGNvbnN0IGNvbGxhcHNlUmVzdWx0cyA9IHRoaXMuc2VhcmNoQ29uZmlnLmNvbGxhcHNlUmVzdWx0cztcblx0XHRpZiAoY29sbGFwc2VSZXN1bHRzICE9PSAnYWx3YXlzQ29sbGFwc2UnICYmIHRoaXMudmlld01vZGVsLnNlYXJjaFJlc3VsdC5tYXRjaGVzKCkubGVuZ3RoID09PSAxKSB7XG5cdFx0XHRjb25zdCBvbmx5TWF0Y2ggPSB0aGlzLnZpZXdNb2RlbC5zZWFyY2hSZXN1bHQubWF0Y2hlcygpWzBdO1xuXHRcdFx0YXdhaXQgdGhpcy50cmVlLmV4cGFuZFRvKG9ubHlNYXRjaCk7XG5cdFx0XHRpZiAob25seU1hdGNoLmNvdW50KCkgPCA1MCkge1xuXHRcdFx0XHRhd2FpdCB0aGlzLnRyZWUuZXhwYW5kKG9ubHlNYXRjaCk7XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBhcHBlbmRTZWFyY2hXaXRoQUlCdXR0b24obWVzc2FnZUVsOiBIVE1MRWxlbWVudCkge1xuXHRcdGNvbnN0IHNlYXJjaFdpdGhBSUJ1dHRvblRvb2x0aXAgPSB0aGlzLmtleWJpbmRpbmdTZXJ2aWNlLmFwcGVuZEtleWJpbmRpbmcoXG5cdFx0XHRubHMubG9jYWxpemUoJ3RyaWdnZXJBSVNlYXJjaC50b29sdGlwJywgXCJTZWFyY2ggd2l0aCBBSS5cIiksXG5cdFx0XHRDb25zdGFudHMuU2VhcmNoQ29tbWFuZElkcy5TZWFyY2hXaXRoQUlBY3Rpb25JZFxuXHRcdCk7XG5cdFx0Y29uc3Qgc2VhcmNoV2l0aEFJQnV0dG9uVGV4dCA9IG5scy5sb2NhbGl6ZSgnc2VhcmNoV2l0aEFJQnV0dG9uVG9vbHRpcCcsIFwiU2VhcmNoIHdpdGggQUlcIik7XG5cdFx0Y29uc3Qgc2VhcmNoV2l0aEFJQnV0dG9uID0gdGhpcy5tZXNzYWdlRGlzcG9zYWJsZXMuYWRkKG5ldyBTZWFyY2hMaW5rQnV0dG9uKFxuXHRcdFx0c2VhcmNoV2l0aEFJQnV0dG9uVGV4dCxcblx0XHRcdCgpID0+IHtcblx0XHRcdFx0dGhpcy5jb21tYW5kU2VydmljZS5leGVjdXRlQ29tbWFuZChDb25zdGFudHMuU2VhcmNoQ29tbWFuZElkcy5TZWFyY2hXaXRoQUlBY3Rpb25JZCk7XG5cdFx0XHR9LCB0aGlzLmhvdmVyU2VydmljZSwgc2VhcmNoV2l0aEFJQnV0dG9uVG9vbHRpcCkpO1xuXHRcdGRvbS5hcHBlbmQobWVzc2FnZUVsLCBzZWFyY2hXaXRoQUlCdXR0b24uZWxlbWVudCk7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIG9uU2VhcmNoQ29tcGxldGUoXG5cdFx0cHJvZ3Jlc3NDb21wbGV0ZTogKCkgPT4gdm9pZCxcblx0XHRleGNsdWRlUGF0dGVyblRleHQ/OiBzdHJpbmcsXG5cdFx0aW5jbHVkZVBhdHRlcm5UZXh0Pzogc3RyaW5nLFxuXHRcdGNvbXBsZXRlZD86IElTZWFyY2hDb21wbGV0ZSxcblx0XHRzaG91bGREb0ZpbmFsUmVmcmVzaCA9IHRydWUsXG5cdFx0a2V5d29yZHM/OiBBSVNlYXJjaEtleXdvcmRbXSxcblx0KSB7XG5cblx0XHR0aGlzLnN0YXRlID0gU2VhcmNoVUlTdGF0ZS5JZGxlO1xuXG5cdFx0Ly8gQ29tcGxldGUgdXAgdG8gMTAwJSBhcyBuZWVkZWRcblx0XHRwcm9ncmVzc0NvbXBsZXRlKCk7XG5cblx0XHRpZiAoc2hvdWxkRG9GaW5hbFJlZnJlc2gpIHtcblx0XHRcdC8vIGFueXRoaW5nIHRoYXQgZ2V0cyBjYWxsZWQgZnJvbSBgZ2V0Q2hpbGRyZW5gIHNob3VsZCBub3QgZG8gdGhpcywgc2luY2UgdGhlIHRyZWUgd2lsbCByZWZyZXNoIGFueXdheXMuXG5cdFx0XHRhd2FpdCB0aGlzLnJlZnJlc2hBbmRVcGRhdGVDb3VudCgpO1xuXHRcdH1cblxuXHRcdGNvbnN0IGFsbFJlc3VsdHMgPSAhdGhpcy52aWV3TW9kZWwuc2VhcmNoUmVzdWx0LmlzRW1wdHkoKTtcblx0XHRjb25zdCBhaVJlc3VsdHMgPSB0aGlzLnNlYXJjaFJlc3VsdC5nZXRDYWNoZWRTZWFyY2hDb21wbGV0ZSh0cnVlKTtcblx0XHRpZiAoY29tcGxldGVkPy5leGl0ID09PSBTZWFyY2hDb21wbGV0aW9uRXhpdENvZGUuTmV3U2VhcmNoU3RhcnRlZCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdC8vIFNwZWNpYWwgY2FzZSBmb3Igd2hlbiB3ZSBoYXZlIGFuIEFJIHByb3ZpZGVyIHJlZ2lzdGVyZWRcblx0XHRDb25zdGFudHMuU2VhcmNoQ29udGV4dC5BSVJlc3VsdHNSZXF1ZXN0ZWQuYmluZFRvKHRoaXMuY29udGV4dEtleVNlcnZpY2UpLnNldCh0aGlzLnNob3VsZFNob3dBSVJlc3VsdHMoKSAmJiAhIWFpUmVzdWx0cyk7XG5cblx0XHQvLyBFeHBhbmQgQUkgcmVzdWx0cyBpZiB0aGUgbm9kZSBpcyBjb2xsYXBzZWRcblx0XHRpZiAoY29tcGxldGVkICYmIHRoaXMudHJlZS5oYXNOb2RlKHRoaXMuc2VhcmNoUmVzdWx0LmFpVGV4dFNlYXJjaFJlc3VsdCkgJiYgdGhpcy50cmVlLmlzQ29sbGFwc2VkKHRoaXMuc2VhcmNoUmVzdWx0LmFpVGV4dFNlYXJjaFJlc3VsdCkpIHtcblx0XHRcdHRoaXMudHJlZS5leHBhbmQodGhpcy5zZWFyY2hSZXN1bHQuYWlUZXh0U2VhcmNoUmVzdWx0KTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblxuXHRcdGlmICghYWxsUmVzdWx0cykge1xuXHRcdFx0Y29uc3QgaGFzRXhjbHVkZXMgPSAhIWV4Y2x1ZGVQYXR0ZXJuVGV4dDtcblx0XHRcdGNvbnN0IGhhc0luY2x1ZGVzID0gISFpbmNsdWRlUGF0dGVyblRleHQ7XG5cdFx0XHRsZXQgbWVzc2FnZTogc3RyaW5nO1xuXG5cdFx0XHRpZiAoIWNvbXBsZXRlZCkge1xuXHRcdFx0XHRtZXNzYWdlID0gU0VBUkNIX0NBTkNFTExFRF9NRVNTQUdFO1xuXHRcdFx0fSBlbHNlIGlmICh0aGlzLmlucHV0UGF0dGVybkluY2x1ZGVzLm9ubHlTZWFyY2hJbk9wZW5FZGl0b3JzKCkpIHtcblx0XHRcdFx0aWYgKGhhc0luY2x1ZGVzICYmIGhhc0V4Y2x1ZGVzKSB7XG5cdFx0XHRcdFx0bWVzc2FnZSA9IG5scy5sb2NhbGl6ZSgnbm9PcGVuRWRpdG9yUmVzdWx0c0luY2x1ZGVzRXhjbHVkZXMnLCBcIk5vIHJlc3VsdHMgZm91bmQgaW4gb3BlbiBlZGl0b3JzIG1hdGNoaW5nICd7MH0nIGV4Y2x1ZGluZyAnezF9JyAtIFwiLCBpbmNsdWRlUGF0dGVyblRleHQsIGV4Y2x1ZGVQYXR0ZXJuVGV4dCk7XG5cdFx0XHRcdH0gZWxzZSBpZiAoaGFzSW5jbHVkZXMpIHtcblx0XHRcdFx0XHRtZXNzYWdlID0gbmxzLmxvY2FsaXplKCdub09wZW5FZGl0b3JSZXN1bHRzSW5jbHVkZXMnLCBcIk5vIHJlc3VsdHMgZm91bmQgaW4gb3BlbiBlZGl0b3JzIG1hdGNoaW5nICd7MH0nIC0gXCIsIGluY2x1ZGVQYXR0ZXJuVGV4dCk7XG5cdFx0XHRcdH0gZWxzZSBpZiAoaGFzRXhjbHVkZXMpIHtcblx0XHRcdFx0XHRtZXNzYWdlID0gbmxzLmxvY2FsaXplKCdub09wZW5FZGl0b3JSZXN1bHRzRXhjbHVkZXMnLCBcIk5vIHJlc3VsdHMgZm91bmQgaW4gb3BlbiBlZGl0b3JzIGV4Y2x1ZGluZyAnezB9JyAtIFwiLCBleGNsdWRlUGF0dGVyblRleHQpO1xuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdG1lc3NhZ2UgPSBubHMubG9jYWxpemUoJ25vT3BlbkVkaXRvclJlc3VsdHNGb3VuZCcsIFwiTm8gcmVzdWx0cyBmb3VuZCBpbiBvcGVuIGVkaXRvcnMuIFJldmlldyB5b3VyIGNvbmZpZ3VyZWQgZXhjbHVzaW9ucyBhbmQgY2hlY2sgeW91ciBnaXRpZ25vcmUgZmlsZXMgLSBcIik7XG5cdFx0XHRcdH1cblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdGlmIChoYXNJbmNsdWRlcyAmJiBoYXNFeGNsdWRlcykge1xuXHRcdFx0XHRcdG1lc3NhZ2UgPSBubHMubG9jYWxpemUoJ25vUmVzdWx0c0luY2x1ZGVzRXhjbHVkZXMnLCBcIk5vIHJlc3VsdHMgZm91bmQgaW4gJ3swfScgZXhjbHVkaW5nICd7MX0nIC0gXCIsIGluY2x1ZGVQYXR0ZXJuVGV4dCwgZXhjbHVkZVBhdHRlcm5UZXh0KTtcblx0XHRcdFx0fSBlbHNlIGlmIChoYXNJbmNsdWRlcykge1xuXHRcdFx0XHRcdG1lc3NhZ2UgPSBubHMubG9jYWxpemUoJ25vUmVzdWx0c0luY2x1ZGVzJywgXCJObyByZXN1bHRzIGZvdW5kIGluICd7MH0nIC0gXCIsIGluY2x1ZGVQYXR0ZXJuVGV4dCk7XG5cdFx0XHRcdH0gZWxzZSBpZiAoaGFzRXhjbHVkZXMpIHtcblx0XHRcdFx0XHRtZXNzYWdlID0gbmxzLmxvY2FsaXplKCdub1Jlc3VsdHNFeGNsdWRlcycsIFwiTm8gcmVzdWx0cyBmb3VuZCBleGNsdWRpbmcgJ3swfScgLSBcIiwgZXhjbHVkZVBhdHRlcm5UZXh0KTtcblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRtZXNzYWdlID0gbmxzLmxvY2FsaXplKCdub1Jlc3VsdHNGb3VuZCcsIFwiTm8gcmVzdWx0cyBmb3VuZC4gUmV2aWV3IHlvdXIgY29uZmlndXJlZCBleGNsdXNpb25zIGFuZCBjaGVjayB5b3VyIGdpdGlnbm9yZSBmaWxlcyAtIFwiKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXG5cdFx0XHQvLyBJbmRpY2F0ZSBhcyBzdGF0dXMgdG8gQVJJQVxuXHRcdFx0YXJpYS5zdGF0dXMobWVzc2FnZSk7XG5cblx0XHRcdGNvbnN0IG1lc3NhZ2VFbCA9IHRoaXMuY2xlYXJNZXNzYWdlKCk7XG5cdFx0XHRkb20uYXBwZW5kKG1lc3NhZ2VFbCwgbWVzc2FnZSk7XG5cblx0XHRcdGlmICh0aGlzLnNob3VsZFNob3dBSVJlc3VsdHMoKSkge1xuXHRcdFx0XHR0aGlzLmFwcGVuZFNlYXJjaFdpdGhBSUJ1dHRvbihtZXNzYWdlRWwpO1xuXHRcdFx0XHRkb20uYXBwZW5kKG1lc3NhZ2VFbCwgJCgnc3BhbicsIHVuZGVmaW5lZCwgJyAtICcpKTtcblx0XHRcdH1cblxuXHRcdFx0aWYgKCFjb21wbGV0ZWQpIHtcblx0XHRcdFx0Y29uc3Qgc2VhcmNoQWdhaW5CdXR0b24gPSB0aGlzLm1lc3NhZ2VEaXNwb3NhYmxlcy5hZGQobmV3IFNlYXJjaExpbmtCdXR0b24oXG5cdFx0XHRcdFx0bmxzLmxvY2FsaXplKCdyZXJ1blNlYXJjaC5tZXNzYWdlJywgXCJTZWFyY2ggYWdhaW5cIiksXG5cdFx0XHRcdFx0KCkgPT4gdGhpcy50cmlnZ2VyUXVlcnlDaGFuZ2UoeyBwcmVzZXJ2ZUZvY3VzOiBmYWxzZSB9KSwgdGhpcy5ob3ZlclNlcnZpY2UpKTtcblx0XHRcdFx0ZG9tLmFwcGVuZChtZXNzYWdlRWwsIHNlYXJjaEFnYWluQnV0dG9uLmVsZW1lbnQpO1xuXHRcdFx0fSBlbHNlIGlmIChoYXNJbmNsdWRlcyB8fCBoYXNFeGNsdWRlcykge1xuXHRcdFx0XHRjb25zdCBzZWFyY2hBZ2FpbkJ1dHRvbiA9IHRoaXMubWVzc2FnZURpc3Bvc2FibGVzLmFkZChuZXcgU2VhcmNoTGlua0J1dHRvbihubHMubG9jYWxpemUoJ3JlcnVuU2VhcmNoSW5BbGwubWVzc2FnZScsIFwiU2VhcmNoIGFnYWluIGluIGFsbCBmaWxlc1wiKSwgdGhpcy5vblNlYXJjaEFnYWluLmJpbmQodGhpcyksIHRoaXMuaG92ZXJTZXJ2aWNlKSk7XG5cdFx0XHRcdGRvbS5hcHBlbmQobWVzc2FnZUVsLCBzZWFyY2hBZ2FpbkJ1dHRvbi5lbGVtZW50KTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdGNvbnN0IG9wZW5TZXR0aW5nc0J1dHRvbiA9IHRoaXMubWVzc2FnZURpc3Bvc2FibGVzLmFkZChuZXcgU2VhcmNoTGlua0J1dHRvbihubHMubG9jYWxpemUoJ29wZW5TZXR0aW5ncy5tZXNzYWdlJywgXCJPcGVuIFNldHRpbmdzXCIpLCB0aGlzLm9uT3BlblNldHRpbmdzLmJpbmQodGhpcyksIHRoaXMuaG92ZXJTZXJ2aWNlKSk7XG5cdFx0XHRcdGRvbS5hcHBlbmQobWVzc2FnZUVsLCBvcGVuU2V0dGluZ3NCdXR0b24uZWxlbWVudCk7XG5cdFx0XHR9XG5cblx0XHRcdGlmICh0aGlzLmNvbnRleHRTZXJ2aWNlLmdldFdvcmtiZW5jaFN0YXRlKCkgPT09IFdvcmtiZW5jaFN0YXRlLkVNUFRZKSB7XG5cdFx0XHRcdHRoaXMuc2hvd1NlYXJjaFdpdGhvdXRGb2xkZXJNZXNzYWdlKCk7XG5cdFx0XHR9XG5cdFx0XHR0aGlzLnJlTGF5b3V0KCk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHRoaXMudmlld01vZGVsLnNlYXJjaFJlc3VsdC50b2dnbGVIaWdobGlnaHRzKHRoaXMuaXNWaXNpYmxlKCkpOyAvLyBzaG93IGhpZ2hsaWdodHNcblxuXHRcdFx0Ly8gSW5kaWNhdGUgZmluYWwgc2VhcmNoIHJlc3VsdCBjb3VudCBmb3IgQVJJQVxuXHRcdFx0YXJpYS5zdGF0dXMobmxzLmxvY2FsaXplKCdhcmlhU2VhcmNoUmVzdWx0c1N0YXR1cycsIFwiU2VhcmNoIHJldHVybmVkIHswfSByZXN1bHRzIGluIHsxfSBmaWxlc1wiLCB0aGlzLnZpZXdNb2RlbC5zZWFyY2hSZXN1bHQuY291bnQoKSwgdGhpcy52aWV3TW9kZWwuc2VhcmNoUmVzdWx0LmZpbGVDb3VudCgpKSk7XG5cdFx0fVxuXG5cblx0XHRpZiAoY29tcGxldGVkICYmIGNvbXBsZXRlZC5saW1pdEhpdCkge1xuXHRcdFx0Y29tcGxldGVkLm1lc3NhZ2VzLnB1c2goeyB0eXBlOiBUZXh0U2VhcmNoQ29tcGxldGVNZXNzYWdlVHlwZS5XYXJuaW5nLCB0ZXh0OiBubHMubG9jYWxpemUoJ3NlYXJjaE1heFJlc3VsdHNXYXJuaW5nJywgXCJUaGUgcmVzdWx0IHNldCBvbmx5IGNvbnRhaW5zIGEgc3Vic2V0IG9mIGFsbCBtYXRjaGVzLiBCZSBtb3JlIHNwZWNpZmljIGluIHlvdXIgc2VhcmNoIHRvIG5hcnJvdyBkb3duIHRoZSByZXN1bHRzLlwiKSB9KTtcblx0XHR9XG5cblx0XHRpZiAoY29tcGxldGVkICYmIGNvbXBsZXRlZC5tZXNzYWdlcykge1xuXHRcdFx0Zm9yIChjb25zdCBtZXNzYWdlIG9mIGNvbXBsZXRlZC5tZXNzYWdlcykge1xuXHRcdFx0XHR0aGlzLmFkZE1lc3NhZ2UobWVzc2FnZSk7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0dGhpcy5yZUxheW91dCgpO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBvblNlYXJjaEVycm9yKGU6IGFueSwgcHJvZ3Jlc3NDb21wbGV0ZTogKCkgPT4gdm9pZCwgZXhjbHVkZVBhdHRlcm5UZXh0Pzogc3RyaW5nLCBpbmNsdWRlUGF0dGVyblRleHQ/OiBzdHJpbmcsIGNvbXBsZXRlZD86IElTZWFyY2hDb21wbGV0ZSwgc2hvdWxkRG9GaW5hbFJlZnJlc2ggPSB0cnVlKSB7XG5cdFx0dGhpcy5zdGF0ZSA9IFNlYXJjaFVJU3RhdGUuSWRsZTtcblx0XHRpZiAoZXJyb3JzLmlzQ2FuY2VsbGF0aW9uRXJyb3IoZSkpIHtcblx0XHRcdHJldHVybiB0aGlzLm9uU2VhcmNoQ29tcGxldGUocHJvZ3Jlc3NDb21wbGV0ZSwgZXhjbHVkZVBhdHRlcm5UZXh0LCBpbmNsdWRlUGF0dGVyblRleHQsIGNvbXBsZXRlZCwgc2hvdWxkRG9GaW5hbFJlZnJlc2gpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRwcm9ncmVzc0NvbXBsZXRlKCk7XG5cdFx0XHR0aGlzLnNlYXJjaFdpZGdldC5zZWFyY2hJbnB1dD8uc2hvd01lc3NhZ2UoeyBjb250ZW50OiBlLm1lc3NhZ2UsIHR5cGU6IE1lc3NhZ2VUeXBlLkVSUk9SIH0pO1xuXHRcdFx0dGhpcy52aWV3TW9kZWwuc2VhcmNoUmVzdWx0LmNsZWFyKCk7XG5cblx0XHRcdHJldHVybiBQcm9taXNlLnJlc29sdmUoKTtcblx0XHR9XG5cdH1cblxuXHRwdWJsaWMgY2xlYXJBSVJlc3VsdHMoKSB7XG5cdFx0dGhpcy5tb2RlbC5zZWFyY2hSZXN1bHQuYWlUZXh0U2VhcmNoUmVzdWx0LmhpZGRlbiA9IHRydWU7XG5cdFx0dGhpcy5yZWZyZXNoVHJlZUNvbnRyb2xsZXIuY2xlYXJBbGxQZW5kaW5nKCk7XG5cdFx0dGhpcy5fcGVuZGluZ1NlbWFudGljU2VhcmNoUHJvbWlzZSA9IHVuZGVmaW5lZDtcblx0XHR0aGlzLl9jYWNoZWRSZXN1bHRzID0gdW5kZWZpbmVkO1xuXHRcdHRoaXMuX2NhY2hlZEtleXdvcmRzID0gW107XG5cdFx0dGhpcy5tb2RlbC5jYW5jZWxBSVNlYXJjaCh0cnVlKTtcblx0XHR0aGlzLm1vZGVsLmNsZWFyQWlTZWFyY2hSZXN1bHRzKCk7XG5cdH1cblxuXHRwdWJsaWMgYXN5bmMgcmVxdWVzdEFJUmVzdWx0cygpIHtcblx0XHR0aGlzLmxvZ1NlcnZpY2UuaW5mbyhgU2VhcmNoVmlldzogUmVxdWVzdGluZyBzZW1hbnRpYyByZXN1bHRzIGZyb20ga2V5YmluZGluZy4gQ2FjaGVkOiAkeyEhdGhpcy5jYWNoZWRSZXN1bHRzfWApO1xuXHRcdGlmICgoIXRoaXMuY2FjaGVkUmVzdWx0cyB8fCB0aGlzLmNhY2hlZFJlc3VsdHMucmVzdWx0cy5sZW5ndGggPT09IDApICYmICF0aGlzLl9wZW5kaW5nU2VtYW50aWNTZWFyY2hQcm9taXNlKSB7XG5cdFx0XHR0aGlzLmNsZWFyQUlSZXN1bHRzKCk7XG5cdFx0fVxuXHRcdHRoaXMubW9kZWwuc2VhcmNoUmVzdWx0LmFpVGV4dFNlYXJjaFJlc3VsdC5oaWRkZW4gPSBmYWxzZTtcblx0XHRhd2FpdCB0aGlzLnF1ZXVlUmVmcmVzaFRyZWUoKTtcblx0XHRhd2FpdCBmb3JjZWRFeHBhbmRSZWN1cnNpdmVseSh0aGlzLmdldENvbnRyb2woKSwgdGhpcy5tb2RlbC5zZWFyY2hSZXN1bHQuYWlUZXh0U2VhcmNoUmVzdWx0KTtcblx0fVxuXG5cdHB1YmxpYyBhc3luYyBhZGRBSVJlc3VsdHMoKSB7XG5cdFx0Y29uc3QgZXhjbHVkZVBhdHRlcm5UZXh0ID0gdGhpcy5fZ2V0RXhjbHVkZVBhdHRlcm4oKTtcblx0XHRjb25zdCBpbmNsdWRlUGF0dGVyblRleHQgPSB0aGlzLl9nZXRJbmNsdWRlUGF0dGVybigpO1xuXG5cdFx0dGhpcy5zZWFyY2hXaWRnZXQuc2VhcmNoSW5wdXQ/LmNsZWFyTWVzc2FnZSgpO1xuXHRcdHRoaXMuc2hvd0VtcHR5U3RhZ2UoKTtcblx0XHR0aGlzLl92aXNpYmxlTWF0Y2hlcyA9IDA7XG5cdFx0dGhpcy50cmVlLnNldFNlbGVjdGlvbihbXSk7XG5cdFx0dGhpcy50cmVlLnNldEZvY3VzKFtdKTtcblxuXHRcdHRoaXMudmlld01vZGVsLnJlcGxhY2VTdHJpbmcgPSB0aGlzLnNlYXJjaFdpZGdldC5nZXRSZXBsYWNlVmFsdWUoKTtcblx0XHQvLyBSZXVzZSBwZW5kaW5nIGFpU2VhcmNoIGlmIGF2YWlsYWJsZVxuXHRcdGxldCBhaVNlYXJjaFByb21pc2UgPSB0aGlzLl9wZW5kaW5nU2VtYW50aWNTZWFyY2hQcm9taXNlO1xuXHRcdGlmICghYWlTZWFyY2hQcm9taXNlKSB7XG5cdFx0XHR0aGlzLnZpZXdNb2RlbC5zZWFyY2hSZXN1bHQuc2V0QUlRdWVyeVVzaW5nVGV4dFF1ZXJ5KCk7XG5cdFx0XHRhaVNlYXJjaFByb21pc2UgPSB0aGlzLl9wZW5kaW5nU2VtYW50aWNTZWFyY2hQcm9taXNlID0gdGhpcy52aWV3TW9kZWwuYWlTZWFyY2goKCkgPT4ge1xuXHRcdFx0XHQvLyBDbGVhciBwZW5kaW5nIHByb21pc2Ugd2hlbiBmaXJzdCByZXN1bHQgY29tZXMgaW5cblx0XHRcdFx0aWYgKHRoaXMuX3BlbmRpbmdTZW1hbnRpY1NlYXJjaFByb21pc2UgPT09IGFpU2VhcmNoUHJvbWlzZSkge1xuXHRcdFx0XHRcdHRoaXMuX3BlbmRpbmdTZW1hbnRpY1NlYXJjaFByb21pc2UgPSB1bmRlZmluZWQ7XG5cdFx0XHRcdH1cblx0XHRcdH0pO1xuXHRcdH1cblxuXHRcdGFpU2VhcmNoUHJvbWlzZS50aGVuKChjb21wbGV0ZSkgPT4ge1xuXHRcdFx0dGhpcy51cGRhdGVTZWFyY2hSZXN1bHRDb3VudCh0aGlzLnZpZXdNb2RlbC5zZWFyY2hSZXN1bHQucXVlcnk/LnVzZXJEaXNhYmxlZEV4Y2x1ZGVzQW5kSWdub3JlRmlsZXMsIHRoaXMudmlld01vZGVsLnNlYXJjaFJlc3VsdC5xdWVyeT8ub25seU9wZW5FZGl0b3JzLCBmYWxzZSk7XG5cdFx0XHRyZXR1cm4gdGhpcy5vblNlYXJjaENvbXBsZXRlKCgpID0+IHsgfSwgZXhjbHVkZVBhdHRlcm5UZXh0LCBpbmNsdWRlUGF0dGVyblRleHQsIGNvbXBsZXRlLCBmYWxzZSwgY29tcGxldGUuYWlLZXl3b3Jkcyk7XG5cdFx0fSwgKGUpID0+IHtcblx0XHRcdHJldHVybiB0aGlzLm9uU2VhcmNoRXJyb3IoZSwgKCkgPT4geyB9LCBleGNsdWRlUGF0dGVyblRleHQsIGluY2x1ZGVQYXR0ZXJuVGV4dCwgdW5kZWZpbmVkLCBmYWxzZSk7XG5cdFx0fSk7XG5cdH1cblxuXHRwcml2YXRlIGRvU2VhcmNoKHF1ZXJ5OiBJVGV4dFF1ZXJ5LCBleGNsdWRlUGF0dGVyblRleHQ6IHN0cmluZywgaW5jbHVkZVBhdHRlcm5UZXh0OiBzdHJpbmcsIHRyaWdnZXJlZE9uVHlwZTogYm9vbGVhbiwgc2hvdWxkS2VlcEFJUmVzdWx0czogYm9vbGVhbiwgc2hvdWxkVXBkYXRlQUlTZWFyY2g6IGJvb2xlYW4pOiBUaGVuYWJsZTx2b2lkPiB7XG5cdFx0bGV0IHByb2dyZXNzQ29tcGxldGU6ICgpID0+IHZvaWQ7XG5cdFx0dGhpcy5wcm9ncmVzc1NlcnZpY2Uud2l0aFByb2dyZXNzKHsgbG9jYXRpb246IHRoaXMuZ2V0UHJvZ3Jlc3NMb2NhdGlvbigpLCBkZWxheTogdHJpZ2dlcmVkT25UeXBlID8gMzAwIDogMCB9LCBfcHJvZ3Jlc3MgPT4ge1xuXHRcdFx0cmV0dXJuIG5ldyBQcm9taXNlPHZvaWQ+KHJlc29sdmUgPT4gcHJvZ3Jlc3NDb21wbGV0ZSA9IHJlc29sdmUpO1xuXHRcdH0pO1xuXG5cdFx0dGhpcy5zZWFyY2hXaWRnZXQuc2VhcmNoSW5wdXQ/LmNsZWFyTWVzc2FnZSgpO1xuXHRcdHRoaXMuc3RhdGUgPSBTZWFyY2hVSVN0YXRlLlNlYXJjaGluZztcblx0XHR0aGlzLnNob3dFbXB0eVN0YWdlKCk7XG5cdFx0aWYgKHRoaXMubW9kZWwuc2VhcmNoUmVzdWx0LmFpVGV4dFNlYXJjaFJlc3VsdC5oaWRkZW4gJiYgc2hvdWxkVXBkYXRlQUlTZWFyY2gpIHtcblx0XHRcdHRoaXMubG9nU2VydmljZS5pbmZvKGBTZWFyY2hWaWV3OiBTZW1hbnRpYyBzZWFyY2ggdmlzaWJsZS4gS2VlcCBzZW1hbnRpYyByZXN1bHRzOiAke3Nob3VsZEtlZXBBSVJlc3VsdHN9LiBVcGRhdGUgc2VtYW50aWMgc2VhcmNoOiAke3Nob3VsZFVwZGF0ZUFJU2VhcmNofWApO1xuXHRcdFx0dGhpcy5tb2RlbC5zZWFyY2hSZXN1bHQuYWlUZXh0U2VhcmNoUmVzdWx0LmhpZGRlbiA9IGZhbHNlO1xuXHRcdH1cblxuXHRcdGNvbnN0IHNsb3dUaW1lciA9IHNldFRpbWVvdXQoKCkgPT4ge1xuXHRcdFx0dGhpcy5zdGF0ZSA9IFNlYXJjaFVJU3RhdGUuU2xvd1NlYXJjaDtcblx0XHR9LCAyMDAwKTtcblxuXHRcdHRoaXMuX3Zpc2libGVNYXRjaGVzID0gMDtcblxuXHRcdHRoaXMuX3JlZnJlc2hSZXN1bHRzU2NoZWR1bGVyLnNjaGVkdWxlKCk7XG5cblx0XHR0aGlzLnNlYXJjaFdpZGdldC5zZXRSZXBsYWNlQWxsQWN0aW9uU3RhdGUoZmFsc2UpO1xuXG5cdFx0dGhpcy50cmVlLnNldFNlbGVjdGlvbihbXSk7XG5cdFx0dGhpcy50cmVlLnNldEZvY3VzKFtdKTtcblxuXHRcdHRoaXMudmlld01vZGVsLnJlcGxhY2VTdHJpbmcgPSB0aGlzLnNlYXJjaFdpZGdldC5nZXRSZXBsYWNlVmFsdWUoKTtcblx0XHRjb25zdCByZXN1bHQgPSB0aGlzLnZpZXdNb2RlbC5zZWFyY2gocXVlcnkpO1xuXG5cdFx0aWYgKCFzaG91bGRLZWVwQUlSZXN1bHRzIHx8IHNob3VsZFVwZGF0ZUFJU2VhcmNoKSB7XG5cdFx0XHR0aGlzLnZpZXdNb2RlbC5zZWFyY2hSZXN1bHQuc2V0QUlRdWVyeVVzaW5nVGV4dFF1ZXJ5KHF1ZXJ5KTtcblx0XHR9XG5cblx0XHRpZiAodGhpcy5jb25maWd1cmF0aW9uU2VydmljZS5nZXRWYWx1ZTxJU2VhcmNoQ29uZmlndXJhdGlvblByb3BlcnRpZXM+KCdzZWFyY2gnKS5zZWFyY2hWaWV3LmtleXdvcmRTdWdnZXN0aW9ucykge1xuXHRcdFx0dGhpcy5nZXRLZXl3b3JkU3VnZ2VzdGlvbnMoKTtcblx0XHR9XG5cblx0XHRyZXR1cm4gcmVzdWx0LmFzeW5jUmVzdWx0cy50aGVuKChjb21wbGV0ZSkgPT4ge1xuXHRcdFx0Y2xlYXJUaW1lb3V0KHNsb3dUaW1lcik7XG5cdFx0XHRjb25zdCBjb25maWcgPSB0aGlzLmNvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldFZhbHVlPElTZWFyY2hDb25maWd1cmF0aW9uUHJvcGVydGllcz4oJ3NlYXJjaCcpLnNlYXJjaFZpZXcuc2VtYW50aWNTZWFyY2hCZWhhdmlvcjtcblx0XHRcdGlmIChjb21wbGV0ZS5yZXN1bHRzLmxlbmd0aCA9PT0gMCAmJiBjb25maWcgPT09IFNlbWFudGljU2VhcmNoQmVoYXZpb3IuUnVuT25FbXB0eSkge1xuXHRcdFx0XHR0aGlzLmxvZ1NlcnZpY2UuaW5mbyhgU2VhcmNoVmlldzogUmVxdWVzdGluZyBzZW1hbnRpYyByZXN1bHRzIG9uIGVtcHR5IHNlYXJjaC5gKTtcblx0XHRcdFx0dGhpcy5tb2RlbC5zZWFyY2hSZXN1bHQuYWlUZXh0U2VhcmNoUmVzdWx0LmhpZGRlbiA9IGZhbHNlO1xuXHRcdFx0fVxuXHRcdFx0cmV0dXJuIHRoaXMub25TZWFyY2hDb21wbGV0ZShwcm9ncmVzc0NvbXBsZXRlLCBleGNsdWRlUGF0dGVyblRleHQsIGluY2x1ZGVQYXR0ZXJuVGV4dCwgY29tcGxldGUpO1xuXHRcdH0sIChlKSA9PiB7XG5cdFx0XHRjbGVhclRpbWVvdXQoc2xvd1RpbWVyKTtcblx0XHRcdHJldHVybiB0aGlzLm9uU2VhcmNoRXJyb3IoZSwgcHJvZ3Jlc3NDb21wbGV0ZSwgZXhjbHVkZVBhdHRlcm5UZXh0LCBpbmNsdWRlUGF0dGVyblRleHQpO1xuXHRcdH0pO1xuXHR9XG5cblx0cHJpdmF0ZSBvbk9wZW5TZXR0aW5ncyhlOiBkb20uRXZlbnRMaWtlKTogdm9pZCB7XG5cdFx0ZG9tLkV2ZW50SGVscGVyLnN0b3AoZSwgZmFsc2UpO1xuXHRcdHRoaXMub3BlblNldHRpbmdzKCdAaWQ6ZmlsZXMuZXhjbHVkZSxzZWFyY2guZXhjbHVkZSxzZWFyY2gudXNlUGFyZW50SWdub3JlRmlsZXMsc2VhcmNoLnVzZUdsb2JhbElnbm9yZUZpbGVzLHNlYXJjaC51c2VJZ25vcmVGaWxlcycpO1xuXHR9XG5cblx0cHJpdmF0ZSBvcGVuU2V0dGluZ3MocXVlcnk6IHN0cmluZyk6IFByb21pc2U8SUVkaXRvclBhbmUgfCB1bmRlZmluZWQ+IHtcblx0XHRjb25zdCBvcHRpb25zOiBJU2V0dGluZ3NFZGl0b3JPcHRpb25zID0geyBxdWVyeSB9O1xuXHRcdHJldHVybiB0aGlzLmNvbnRleHRTZXJ2aWNlLmdldFdvcmtiZW5jaFN0YXRlKCkgIT09IFdvcmtiZW5jaFN0YXRlLkVNUFRZID9cblx0XHRcdHRoaXMucHJlZmVyZW5jZXNTZXJ2aWNlLm9wZW5Xb3Jrc3BhY2VTZXR0aW5ncyhvcHRpb25zKSA6XG5cdFx0XHR0aGlzLnByZWZlcmVuY2VzU2VydmljZS5vcGVuVXNlclNldHRpbmdzKG9wdGlvbnMpO1xuXHR9XG5cblx0cHJpdmF0ZSBvblNlYXJjaEFnYWluKCk6IHZvaWQge1xuXHRcdHRoaXMuaW5wdXRQYXR0ZXJuRXhjbHVkZXMuc2V0VmFsdWUoJycpO1xuXHRcdHRoaXMuaW5wdXRQYXR0ZXJuSW5jbHVkZXMuc2V0VmFsdWUoJycpO1xuXHRcdHRoaXMuaW5wdXRQYXR0ZXJuSW5jbHVkZXMuc2V0T25seVNlYXJjaEluT3BlbkVkaXRvcnMoZmFsc2UpO1xuXHRcdHRoaXMuaW5wdXRQYXR0ZXJuSW5jbHVkZXMuc2V0T25seVNlYXJjaEluQ2hhbmdlZEZpbGVzKGZhbHNlKTtcblxuXHRcdHRoaXMudHJpZ2dlclF1ZXJ5Q2hhbmdlKHsgcHJlc2VydmVGb2N1czogZmFsc2UgfSk7XG5cdH1cblxuXHRwcml2YXRlIG9uRW5hYmxlRXhjbHVkZXMoKTogdm9pZCB7XG5cdFx0dGhpcy50b2dnbGVRdWVyeURldGFpbHMoZmFsc2UsIHRydWUpO1xuXHRcdHRoaXMuc2VhcmNoRXhjbHVkZVBhdHRlcm4uc2V0VXNlRXhjbHVkZXNBbmRJZ25vcmVGaWxlcyh0cnVlKTtcblx0fVxuXG5cdHByaXZhdGUgb25EaXNhYmxlU2VhcmNoSW5PcGVuRWRpdG9ycygpOiB2b2lkIHtcblx0XHR0aGlzLnRvZ2dsZVF1ZXJ5RGV0YWlscyhmYWxzZSwgdHJ1ZSk7XG5cdFx0dGhpcy5pbnB1dFBhdHRlcm5JbmNsdWRlcy5zZXRPbmx5U2VhcmNoSW5PcGVuRWRpdG9ycyhmYWxzZSk7XG5cdH1cblxuXHRwcml2YXRlIHVwZGF0ZVNlYXJjaFJlc3VsdENvdW50KGRpc3JlZ2FyZEV4Y2x1ZGVzQW5kSWdub3Jlcz86IGJvb2xlYW4sIG9ubHlPcGVuRWRpdG9ycz86IGJvb2xlYW4sIGNsZWFyOiBib29sZWFuID0gZmFsc2UpOiB2b2lkIHtcblx0XHRpZiAodGhpcy5fY2FjaGVkS2V5d29yZHMubGVuZ3RoID4gMCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRjb25zdCBmaWxlQ291bnQgPSB0aGlzLnZpZXdNb2RlbC5zZWFyY2hSZXN1bHQuZmlsZUNvdW50KHRoaXMudmlld01vZGVsLnNlYXJjaFJlc3VsdC5haVRleHRTZWFyY2hSZXN1bHQuaGlkZGVuKTtcblx0XHRjb25zdCByZXN1bHRDb3VudCA9IHRoaXMudmlld01vZGVsLnNlYXJjaFJlc3VsdC5jb3VudCh0aGlzLnZpZXdNb2RlbC5zZWFyY2hSZXN1bHQuYWlUZXh0U2VhcmNoUmVzdWx0LmhpZGRlbik7XG5cdFx0dGhpcy5oYXNTZWFyY2hSZXN1bHRzS2V5LnNldChmaWxlQ291bnQgPiAwKTtcblxuXHRcdGNvbnN0IG1zZ1dhc0hpZGRlbiA9IHRoaXMubWVzc2FnZXNFbGVtZW50LnN0eWxlLmRpc3BsYXkgPT09ICdub25lJztcblxuXHRcdGNvbnN0IG1lc3NhZ2VFbCA9IHRoaXMuY2xlYXJNZXNzYWdlKCk7XG5cdFx0Y29uc3QgcmVzdWx0TXNnID0gY2xlYXIgPyAnJyA6IHRoaXMuYnVpbGRSZXN1bHRDb3VudE1lc3NhZ2UocmVzdWx0Q291bnQsIGZpbGVDb3VudCk7XG5cdFx0dGhpcy50cmVlLmFyaWFMYWJlbCA9IHJlc3VsdE1zZyArIG5scy5sb2NhbGl6ZSgnZm9yVGVybScsIFwiIC0gU2VhcmNoOiB7MH1cIiwgdGhpcy5zZWFyY2hSZXN1bHQucXVlcnk/LmNvbnRlbnRQYXR0ZXJuLnBhdHRlcm4gPz8gJycpO1xuXHRcdGRvbS5hcHBlbmQobWVzc2FnZUVsLCByZXN1bHRNc2cpO1xuXG5cdFx0aWYgKGZpbGVDb3VudCA+IDApIHtcblx0XHRcdGlmIChkaXNyZWdhcmRFeGNsdWRlc0FuZElnbm9yZXMpIHtcblx0XHRcdFx0Y29uc3QgZXhjbHVkZXNEaXNhYmxlZE1lc3NhZ2UgPSAnIC0gJyArIG5scy5sb2NhbGl6ZSgndXNlSWdub3Jlc0FuZEV4Y2x1ZGVzRGlzYWJsZWQnLCBcImV4Y2x1ZGUgc2V0dGluZ3MgYW5kIGlnbm9yZSBmaWxlcyBhcmUgZGlzYWJsZWRcIikgKyAnICc7XG5cdFx0XHRcdGNvbnN0IGVuYWJsZUV4Y2x1ZGVzQnV0dG9uID0gdGhpcy5tZXNzYWdlRGlzcG9zYWJsZXMuYWRkKG5ldyBTZWFyY2hMaW5rQnV0dG9uKG5scy5sb2NhbGl6ZSgnZXhjbHVkZXMuZW5hYmxlJywgXCJlbmFibGVcIiksIHRoaXMub25FbmFibGVFeGNsdWRlcy5iaW5kKHRoaXMpLCB0aGlzLmhvdmVyU2VydmljZSwgbmxzLmxvY2FsaXplKCd1c2VFeGNsdWRlc0FuZElnbm9yZUZpbGVzRGVzY3JpcHRpb24nLCBcIlVzZSBFeGNsdWRlIFNldHRpbmdzIGFuZCBJZ25vcmUgRmlsZXNcIikpKTtcblx0XHRcdFx0ZG9tLmFwcGVuZChtZXNzYWdlRWwsICQoJ3NwYW4nLCB1bmRlZmluZWQsIGV4Y2x1ZGVzRGlzYWJsZWRNZXNzYWdlLCAnKCcsIGVuYWJsZUV4Y2x1ZGVzQnV0dG9uLmVsZW1lbnQsICcpJykpO1xuXHRcdFx0fVxuXG5cdFx0XHRpZiAob25seU9wZW5FZGl0b3JzKSB7XG5cdFx0XHRcdGNvbnN0IHNlYXJjaGluZ0luT3Blbk1lc3NhZ2UgPSAnIC0gJyArIG5scy5sb2NhbGl6ZSgnb25seU9wZW5FZGl0b3JzJywgXCJzZWFyY2hpbmcgb25seSBpbiBvcGVuIGZpbGVzXCIpICsgJyAnO1xuXHRcdFx0XHRjb25zdCBkaXNhYmxlT3BlbkVkaXRvcnNCdXR0b24gPSB0aGlzLm1lc3NhZ2VEaXNwb3NhYmxlcy5hZGQobmV3IFNlYXJjaExpbmtCdXR0b24obmxzLmxvY2FsaXplKCdvcGVuRWRpdG9ycy5kaXNhYmxlJywgXCJkaXNhYmxlXCIpLCB0aGlzLm9uRGlzYWJsZVNlYXJjaEluT3BlbkVkaXRvcnMuYmluZCh0aGlzKSwgdGhpcy5ob3ZlclNlcnZpY2UsIG5scy5sb2NhbGl6ZSgnZGlzYWJsZU9wZW5FZGl0b3JzJywgXCJTZWFyY2ggaW4gZW50aXJlIHdvcmtzcGFjZVwiKSkpO1xuXHRcdFx0XHRkb20uYXBwZW5kKG1lc3NhZ2VFbCwgJCgnc3BhbicsIHVuZGVmaW5lZCwgc2VhcmNoaW5nSW5PcGVuTWVzc2FnZSwgJygnLCBkaXNhYmxlT3BlbkVkaXRvcnNCdXR0b24uZWxlbWVudCwgJyknKSk7XG5cdFx0XHR9XG5cblx0XHRcdGRvbS5hcHBlbmQobWVzc2FnZUVsLCAnIC0gJyk7XG5cblx0XHRcdGNvbnN0IG9wZW5JbkVkaXRvclRvb2x0aXAgPSB0aGlzLmtleWJpbmRpbmdTZXJ2aWNlLmFwcGVuZEtleWJpbmRpbmcoXG5cdFx0XHRcdG5scy5sb2NhbGl6ZSgnb3BlbkluRWRpdG9yLnRvb2x0aXAnLCBcIkNvcHkgY3VycmVudCBzZWFyY2ggcmVzdWx0cyB0byBhbiBlZGl0b3JcIiksXG5cdFx0XHRcdENvbnN0YW50cy5TZWFyY2hDb21tYW5kSWRzLk9wZW5JbkVkaXRvckNvbW1hbmRJZCk7XG5cdFx0XHRjb25zdCBvcGVuSW5FZGl0b3JCdXR0b24gPSB0aGlzLm1lc3NhZ2VEaXNwb3NhYmxlcy5hZGQobmV3IFNlYXJjaExpbmtCdXR0b24oXG5cdFx0XHRcdG5scy5sb2NhbGl6ZSgnb3BlbkluRWRpdG9yLm1lc3NhZ2UnLCBcIk9wZW4gaW4gZWRpdG9yXCIpLFxuXHRcdFx0XHQoKSA9PiB0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLmludm9rZUZ1bmN0aW9uKGNyZWF0ZUVkaXRvckZyb21TZWFyY2hSZXN1bHQsIHRoaXMuc2VhcmNoUmVzdWx0LCB0aGlzLnNlYXJjaEluY2x1ZGVQYXR0ZXJuLmdldFZhbHVlKCksIHRoaXMuc2VhcmNoRXhjbHVkZVBhdHRlcm4uZ2V0VmFsdWUoKSwgdGhpcy5zZWFyY2hJbmNsdWRlUGF0dGVybi5vbmx5U2VhcmNoSW5PcGVuRWRpdG9ycygpKSwgdGhpcy5ob3ZlclNlcnZpY2UsXG5cdFx0XHRcdG9wZW5JbkVkaXRvclRvb2x0aXApKTtcblx0XHRcdGRvbS5hcHBlbmQobWVzc2FnZUVsLCBvcGVuSW5FZGl0b3JCdXR0b24uZWxlbWVudCk7XG5cblx0XHRcdGlmICh0aGlzLnNob3VsZFNob3dBSVJlc3VsdHMoKSkge1xuXHRcdFx0XHRkb20uYXBwZW5kKG1lc3NhZ2VFbCwgJyAtICcpO1xuXHRcdFx0XHR0aGlzLmFwcGVuZFNlYXJjaFdpdGhBSUJ1dHRvbihtZXNzYWdlRWwpO1xuXHRcdFx0fVxuXG5cdFx0XHR0aGlzLnJlTGF5b3V0KCk7XG5cdFx0fSBlbHNlIGlmICghbXNnV2FzSGlkZGVuKSB7XG5cdFx0XHRkb20uaGlkZSh0aGlzLm1lc3NhZ2VzRWxlbWVudCk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBoYW5kbGVLZXl3b3JkQ2xpY2soa2V5d29yZDogc3RyaW5nLCBpbmRleDogbnVtYmVyKSB7XG5cdFx0dGhpcy5zZWFyY2hXaWRnZXQuc2VhcmNoSW5wdXQ/LnNldFZhbHVlKGtleXdvcmQpO1xuXHRcdHRoaXMudHJpZ2dlclF1ZXJ5Q2hhbmdlKHsgcHJlc2VydmVGb2N1czogZmFsc2UsIHRyaWdnZXJlZE9uVHlwZTogZmFsc2UsIHNob3VsZEtlZXBBSVJlc3VsdHM6IGZhbHNlIH0pO1xuXHRcdHR5cGUgS2V5d29yZENsaWNrQ2xhc3NpZmljYXRpb24gPSB7XG5cdFx0XHRvd25lcjogJ29zb3J0ZWdhJztcblx0XHRcdGNvbW1lbnQ6ICdGaXJlZCB3aGVuIHRoZSB1c2VyIGNsaWNrcyBvbiBhIGtleXdvcmQgc3VnZ2VzdGlvbic7XG5cdFx0XHRpbmRleDogeyBjbGFzc2lmaWNhdGlvbjogJ1N5c3RlbU1ldGFEYXRhJzsgcHVycG9zZTogJ1BlcmZvcm1hbmNlQW5kSGVhbHRoJzsgaXNNZWFzdXJlbWVudDogdHJ1ZTsgY29tbWVudDogJ1RoZSBpbmRleCBvZiB0aGUga2V5d29yZCBjbGlja2VkJyB9O1xuXHRcdFx0bWF4S2V5d29yZHM6IHsgY2xhc3NpZmljYXRpb246ICdTeXN0ZW1NZXRhRGF0YSc7IHB1cnBvc2U6ICdQZXJmb3JtYW5jZUFuZEhlYWx0aCc7IGlzTWVhc3VyZW1lbnQ6IHRydWU7IGNvbW1lbnQ6ICdUaGUgdG90YWwgbnVtYmVyIG9mIHN1Z2dlc3RlZCBrZXl3b3JkcycgfTtcblx0XHR9O1xuXHRcdHR5cGUgS2V5d29yZENsaWNrRXZlbnQgPSB7XG5cdFx0XHRpbmRleDogbnVtYmVyO1xuXHRcdFx0bWF4S2V5d29yZHM6IG51bWJlcjtcblx0XHR9O1xuXHRcdHRoaXMudGVsZW1ldHJ5U2VydmljZS5wdWJsaWNMb2cyPEtleXdvcmRDbGlja0V2ZW50LCBLZXl3b3JkQ2xpY2tDbGFzc2lmaWNhdGlvbj4oJ3NlYXJjaEtleXdvcmRDbGljaycsIHtcblx0XHRcdGluZGV4LFxuXHRcdFx0bWF4S2V5d29yZHM6IHRoaXMuX2NhY2hlZEtleXdvcmRzLmxlbmd0aFxuXHRcdH0pO1xuXHR9XG5cblx0cHJpdmF0ZSB1cGRhdGVLZXl3b3JkU3VnZ2VzdGlvblVJKGtleXdvcmQ6IEFJU2VhcmNoS2V5d29yZCkge1xuXHRcdGNvbnN0IGVsZW1lbnQgPSB0aGlzLm1lc3NhZ2VzRWxlbWVudC5maXJzdENoaWxkIGFzIEhUTUxEaXZFbGVtZW50O1xuXHRcdGlmICh0aGlzLl9jYWNoZWRLZXl3b3Jkcy5sZW5ndGggPiAwKSB7XG5cdFx0XHRpZiAodGhpcy5fY2FjaGVkS2V5d29yZHMubGVuZ3RoID49IDMpIHtcblx0XHRcdFx0Ly8gSWYgd2UgYWxyZWFkeSBoYXZlIDMga2V5d29yZHMsIGp1c3QgcmV0dXJuXG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblx0XHRcdGRvbS5hcHBlbmQoZWxlbWVudCwgJywgJyk7XG5cdFx0XHRjb25zdCBpbmRleCA9IHRoaXMuX2NhY2hlZEtleXdvcmRzLmxlbmd0aDtcblx0XHRcdGNvbnN0IGJ1dHRvbiA9IHRoaXMubWVzc2FnZURpc3Bvc2FibGVzLmFkZChuZXcgU2VhcmNoTGlua0J1dHRvbihcblx0XHRcdFx0a2V5d29yZC5rZXl3b3JkLFxuXHRcdFx0XHQoKSA9PiB0aGlzLmhhbmRsZUtleXdvcmRDbGljayhrZXl3b3JkLmtleXdvcmQsIGluZGV4KSxcblx0XHRcdFx0dGhpcy5ob3ZlclNlcnZpY2Vcblx0XHRcdCkpO1xuXHRcdFx0ZG9tLmFwcGVuZChlbGVtZW50LCBidXR0b24uZWxlbWVudCk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdGNvbnN0IG1lc3NhZ2VFbCA9IHRoaXMuY2xlYXJNZXNzYWdlKCk7XG5cdFx0XHRtZXNzYWdlRWwuY2xhc3NMaXN0LmFkZCgnYWkta2V5d29yZHMnKTtcblxuXHRcdFx0Ly8gQWRkIHVuY2xpY2thYmxlIG1lc3NhZ2Vcblx0XHRcdGNvbnN0IHJlc3VsdE1zZyA9IG5scy5sb2NhbGl6ZSgna2V5d29yZFN1Z2dlc3Rpb24ubWVzc2FnZScsIFwiU2VhcmNoIGluc3RlYWQgZm9yOiBcIik7XG5cdFx0XHRkb20uYXBwZW5kKG1lc3NhZ2VFbCwgcmVzdWx0TXNnKTtcblxuXHRcdFx0Y29uc3QgYnV0dG9uID0gdGhpcy5tZXNzYWdlRGlzcG9zYWJsZXMuYWRkKG5ldyBTZWFyY2hMaW5rQnV0dG9uKFxuXHRcdFx0XHRrZXl3b3JkLmtleXdvcmQsXG5cdFx0XHRcdCgpID0+IHRoaXMuaGFuZGxlS2V5d29yZENsaWNrKGtleXdvcmQua2V5d29yZCwgMCksXG5cdFx0XHRcdHRoaXMuaG92ZXJTZXJ2aWNlXG5cdFx0XHQpKTtcblx0XHRcdGRvbS5hcHBlbmQobWVzc2FnZUVsLCBidXR0b24uZWxlbWVudCk7XG5cdFx0fVxuXHRcdHRoaXMuX2NhY2hlZEtleXdvcmRzLnB1c2goa2V5d29yZC5rZXl3b3JkKTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgZ2V0S2V5d29yZFN1Z2dlc3Rpb25zKCkge1xuXHRcdC8vIFJldXNlIHBlbmRpbmcgYWlTZWFyY2ggaWYgYXZhaWxhYmxlXG5cdFx0bGV0IGFpU2VhcmNoUHJvbWlzZSA9IHRoaXMuX3BlbmRpbmdTZW1hbnRpY1NlYXJjaFByb21pc2U7XG5cdFx0aWYgKCFhaVNlYXJjaFByb21pc2UpIHtcblx0XHRcdHRoaXMudmlld01vZGVsLnNlYXJjaFJlc3VsdC5zZXRBSVF1ZXJ5VXNpbmdUZXh0UXVlcnkoKTtcblx0XHRcdGFpU2VhcmNoUHJvbWlzZSA9IHRoaXMuX3BlbmRpbmdTZW1hbnRpY1NlYXJjaFByb21pc2UgPSB0aGlzLnZpZXdNb2RlbC5haVNlYXJjaChyZXN1bHQgPT4ge1xuXHRcdFx0XHRpZiAocmVzdWx0ICYmIGlzQUlLZXl3b3JkKHJlc3VsdCkpIHtcblx0XHRcdFx0XHR0aGlzLnVwZGF0ZUtleXdvcmRTdWdnZXN0aW9uVUkocmVzdWx0KTtcblx0XHRcdFx0XHRyZXR1cm47XG5cdFx0XHRcdH1cblx0XHRcdFx0Ly8gQ2xlYXIgcGVuZGluZyBwcm9taXNlIHdoZW4gZmlyc3QgcmVzdWx0IGNvbWVzIGluXG5cdFx0XHRcdGlmICh0aGlzLl9wZW5kaW5nU2VtYW50aWNTZWFyY2hQcm9taXNlID09PSBhaVNlYXJjaFByb21pc2UpIHtcblx0XHRcdFx0XHR0aGlzLl9wZW5kaW5nU2VtYW50aWNTZWFyY2hQcm9taXNlID0gdW5kZWZpbmVkO1xuXHRcdFx0XHR9XG5cdFx0XHR9KTtcblx0XHR9XG5cdFx0dGhpcy5fY2FjaGVkUmVzdWx0cyA9IGF3YWl0IGFpU2VhcmNoUHJvbWlzZTtcblx0fVxuXG5cdHByaXZhdGUgYWRkTWVzc2FnZShtZXNzYWdlOiBUZXh0U2VhcmNoQ29tcGxldGVNZXNzYWdlKSB7XG5cdFx0Y29uc3QgbWVzc2FnZUJveCA9IHRoaXMubWVzc2FnZXNFbGVtZW50LmZpcnN0Q2hpbGQgYXMgSFRNTERpdkVsZW1lbnQ7XG5cdFx0aWYgKCFtZXNzYWdlQm94KSB7IHJldHVybjsgfVxuXHRcdGRvbS5hcHBlbmQobWVzc2FnZUJveCwgcmVuZGVyU2VhcmNoTWVzc2FnZShtZXNzYWdlLCB0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLCB0aGlzLm5vdGlmaWNhdGlvblNlcnZpY2UsIHRoaXMub3BlbmVyU2VydmljZSwgdGhpcy5jb21tYW5kU2VydmljZSwgdGhpcy5tZXNzYWdlRGlzcG9zYWJsZXMsICgpID0+IHRoaXMudHJpZ2dlclF1ZXJ5Q2hhbmdlKCkpKTtcblx0fVxuXG5cdHByaXZhdGUgYnVpbGRSZXN1bHRDb3VudE1lc3NhZ2UocmVzdWx0Q291bnQ6IG51bWJlciwgZmlsZUNvdW50OiBudW1iZXIpOiBzdHJpbmcge1xuXHRcdGlmIChyZXN1bHRDb3VudCA9PT0gMSAmJiBmaWxlQ291bnQgPT09IDEpIHtcblx0XHRcdHJldHVybiBubHMubG9jYWxpemUoJ3NlYXJjaC5maWxlLnJlc3VsdCcsIFwiezB9IHJlc3VsdCBpbiB7MX0gZmlsZVwiLCByZXN1bHRDb3VudCwgZmlsZUNvdW50KTtcblx0XHR9IGVsc2UgaWYgKHJlc3VsdENvdW50ID09PSAxKSB7XG5cdFx0XHRyZXR1cm4gbmxzLmxvY2FsaXplKCdzZWFyY2guZmlsZXMucmVzdWx0JywgXCJ7MH0gcmVzdWx0IGluIHsxfSBmaWxlc1wiLCByZXN1bHRDb3VudCwgZmlsZUNvdW50KTtcblx0XHR9IGVsc2UgaWYgKGZpbGVDb3VudCA9PT0gMSkge1xuXHRcdFx0cmV0dXJuIG5scy5sb2NhbGl6ZSgnc2VhcmNoLmZpbGUucmVzdWx0cycsIFwiezB9IHJlc3VsdHMgaW4gezF9IGZpbGVcIiwgcmVzdWx0Q291bnQsIGZpbGVDb3VudCk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHJldHVybiBubHMubG9jYWxpemUoJ3NlYXJjaC5maWxlcy5yZXN1bHRzJywgXCJ7MH0gcmVzdWx0cyBpbiB7MX0gZmlsZXNcIiwgcmVzdWx0Q291bnQsIGZpbGVDb3VudCk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBzaG93U2VhcmNoV2l0aG91dEZvbGRlck1lc3NhZ2UoKTogdm9pZCB7XG5cdFx0dGhpcy5zZWFyY2hXaXRob3V0Rm9sZGVyTWVzc2FnZUVsZW1lbnQgPSB0aGlzLmNsZWFyTWVzc2FnZSgpO1xuXG5cdFx0Y29uc3QgdGV4dEVsID0gZG9tLmFwcGVuZCh0aGlzLnNlYXJjaFdpdGhvdXRGb2xkZXJNZXNzYWdlRWxlbWVudCxcblx0XHRcdCQoJ3AnLCB1bmRlZmluZWQsIG5scy5sb2NhbGl6ZSgnc2VhcmNoV2l0aG91dEZvbGRlcicsIFwiWW91IGhhdmUgbm90IG9wZW5lZCBvciBzcGVjaWZpZWQgYSBmb2xkZXIuIE9ubHkgb3BlbiBmaWxlcyBhcmUgY3VycmVudGx5IHNlYXJjaGVkIC0gXCIpKSk7XG5cblx0XHRjb25zdCBvcGVuRm9sZGVyQnV0dG9uID0gdGhpcy5tZXNzYWdlRGlzcG9zYWJsZXMuYWRkKG5ldyBTZWFyY2hMaW5rQnV0dG9uKFxuXHRcdFx0bmxzLmxvY2FsaXplKCdvcGVuRm9sZGVyJywgXCJPcGVuIEZvbGRlclwiKSxcblx0XHRcdCgpID0+IHtcblx0XHRcdFx0dGhpcy5jb21tYW5kU2VydmljZS5leGVjdXRlQ29tbWFuZChPcGVuRm9sZGVyQWN0aW9uLklEKS5jYXRjaChlcnIgPT4gZXJyb3JzLm9uVW5leHBlY3RlZEVycm9yKGVycikpO1xuXHRcdFx0fSwgdGhpcy5ob3ZlclNlcnZpY2UpKTtcblx0XHRkb20uYXBwZW5kKHRleHRFbCwgb3BlbkZvbGRlckJ1dHRvbi5lbGVtZW50KTtcblx0fVxuXG5cdHByaXZhdGUgc2hvd0VtcHR5U3RhZ2UoZm9yY2VIaWRlTWVzc2FnZXMgPSBmYWxzZSk6IHZvaWQge1xuXHRcdGNvbnN0IHNob3dpbmdDYW5jZWxsZWQgPSAodGhpcy5tZXNzYWdlc0VsZW1lbnQuZmlyc3RDaGlsZD8udGV4dENvbnRlbnQ/LmluZGV4T2YoU0VBUkNIX0NBTkNFTExFRF9NRVNTQUdFKSA/PyAtMSkgPiAtMTtcblxuXHRcdC8vIGNsZWFuIHVwIHVpXG5cdFx0Ly8gdGhpcy5yZXBsYWNlU2VydmljZS5kaXNwb3NlQWxsUmVwbGFjZVByZXZpZXdzKCk7XG5cdFx0aWYgKHNob3dpbmdDYW5jZWxsZWQgfHwgZm9yY2VIaWRlTWVzc2FnZXMgfHwgIXRoaXMuY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0VmFsdWU8SVNlYXJjaENvbmZpZ3VyYXRpb24+KCkuc2VhcmNoPy5zZWFyY2hPblR5cGUpIHtcblx0XHRcdC8vIHdoZW4gaW4gc2VhcmNoIHRvIHR5cGUsIGRvbid0IHByZWVtcHRpdmVseSBoaWRlLCBhcyBpdCBjYXVzZXMgZmxpY2tlcmluZyBhbmQgc2hpZnRpbmcgb2YgdGhlIGxpdmUgcmVzdWx0c1xuXHRcdFx0ZG9tLmhpZGUodGhpcy5tZXNzYWdlc0VsZW1lbnQpO1xuXHRcdH1cblxuXHRcdGRvbS5zaG93KHRoaXMucmVzdWx0c0VsZW1lbnQpO1xuXHRcdHRoaXMuY3VycmVudFNlbGVjdGVkRmlsZU1hdGNoID0gdW5kZWZpbmVkO1xuXHR9XG5cblx0cHJpdmF0ZSBzaG91bGRPcGVuSW5Ob3RlYm9va0VkaXRvcihtYXRjaDogSVNlYXJjaFRyZWVNYXRjaCwgdXJpOiBVUkkpOiBib29sZWFuIHtcblx0XHQvLyBVbnRpdGxlZCBmaWxlcyB3aWxsIHJldHVybiBhIGZhbHNlIHBvc2l0aXZlIGZvciBnZXRDb250cmlidXRlZE5vdGVib29rVHlwZXMuXG5cdFx0Ly8gU2luY2UgdW50aXRsZWQgZmlsZXMgYXJlIGFscmVhZHkgb3BlbiwgdGhlbiB1bnRpdGxlZCBub3RlYm9va3Mgc2hvdWxkIHJldHVybiBOb3RlYm9va01hdGNoIHJlc3VsdHMuXG5cdFx0cmV0dXJuIGlzSU1hdGNoSW5Ob3RlYm9vayhtYXRjaCkgfHwgKHVyaS5zY2hlbWUgIT09IG5ldHdvcmsuU2NoZW1hcy51bnRpdGxlZCAmJiB0aGlzLm5vdGVib29rU2VydmljZS5nZXRDb250cmlidXRlZE5vdGVib29rVHlwZXModXJpKS5sZW5ndGggPiAwKTtcblx0fVxuXG5cdHByaXZhdGUgb25Gb2N1cyhsaW5lTWF0Y2g6IElTZWFyY2hUcmVlTWF0Y2gsIHByZXNlcnZlRm9jdXM/OiBib29sZWFuLCBzaWRlQnlTaWRlPzogYm9vbGVhbiwgcGlubmVkPzogYm9vbGVhbik6IFByb21pc2U8YW55PiB7XG5cdFx0Y29uc3QgdXNlUmVwbGFjZVByZXZpZXcgPSB0aGlzLmNvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldFZhbHVlPElTZWFyY2hDb25maWd1cmF0aW9uPigpLnNlYXJjaD8udXNlUmVwbGFjZVByZXZpZXc7XG5cblx0XHRjb25zdCByZXNvdXJjZSA9IGlzU2VhcmNoVHJlZU1hdGNoKGxpbmVNYXRjaCkgPyBsaW5lTWF0Y2gucGFyZW50KCkucmVzb3VyY2UgOiAoPElTZWFyY2hUcmVlRmlsZU1hdGNoPmxpbmVNYXRjaCkucmVzb3VyY2U7XG5cdFx0cmV0dXJuICh1c2VSZXBsYWNlUHJldmlldyAmJiB0aGlzLnZpZXdNb2RlbC5pc1JlcGxhY2VBY3RpdmUoKSAmJiAhIXRoaXMudmlld01vZGVsLnJlcGxhY2VTdHJpbmcgJiYgISh0aGlzLnNob3VsZE9wZW5Jbk5vdGVib29rRWRpdG9yKGxpbmVNYXRjaCwgcmVzb3VyY2UpKSkgP1xuXHRcdFx0dGhpcy5yZXBsYWNlU2VydmljZS5vcGVuUmVwbGFjZVByZXZpZXcobGluZU1hdGNoLCBwcmVzZXJ2ZUZvY3VzLCBzaWRlQnlTaWRlLCBwaW5uZWQpIDpcblx0XHRcdHRoaXMub3BlbihsaW5lTWF0Y2gsIHByZXNlcnZlRm9jdXMsIHNpZGVCeVNpZGUsIHBpbm5lZCwgcmVzb3VyY2UpO1xuXHR9XG5cblx0YXN5bmMgb3BlbihlbGVtZW50OiBGaWxlTWF0Y2hPck1hdGNoLCBwcmVzZXJ2ZUZvY3VzPzogYm9vbGVhbiwgc2lkZUJ5U2lkZT86IGJvb2xlYW4sIHBpbm5lZD86IGJvb2xlYW4sIHJlc291cmNlSW5wdXQ/OiBVUkkpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCBzZWxlY3Rpb24gPSBnZXRFZGl0b3JTZWxlY3Rpb25Gcm9tTWF0Y2goZWxlbWVudCwgdGhpcy52aWV3TW9kZWwpO1xuXHRcdGNvbnN0IG9sZFBhcmVudE1hdGNoZXMgPSBpc1NlYXJjaFRyZWVNYXRjaChlbGVtZW50KSA/IGVsZW1lbnQucGFyZW50KCkubWF0Y2hlcygpIDogW107XG5cdFx0Y29uc3QgcmVzb3VyY2UgPSByZXNvdXJjZUlucHV0ID8/IChpc1NlYXJjaFRyZWVNYXRjaChlbGVtZW50KSA/IGVsZW1lbnQucGFyZW50KCkucmVzb3VyY2UgOiAoPElTZWFyY2hUcmVlRmlsZU1hdGNoPmVsZW1lbnQpLnJlc291cmNlKTtcblx0XHRsZXQgZWRpdG9yOiBJRWRpdG9yUGFuZSB8IHVuZGVmaW5lZDtcblxuXHRcdGNvbnN0IG9wdGlvbnMgPSB7XG5cdFx0XHRwcmVzZXJ2ZUZvY3VzLFxuXHRcdFx0cGlubmVkLFxuXHRcdFx0c2VsZWN0aW9uLFxuXHRcdFx0cmV2ZWFsSWZWaXNpYmxlOiB0cnVlLFxuXHRcdH07XG5cblx0XHR0cnkge1xuXHRcdFx0ZWRpdG9yID0gYXdhaXQgdGhpcy5lZGl0b3JTZXJ2aWNlLm9wZW5FZGl0b3Ioe1xuXHRcdFx0XHRyZXNvdXJjZTogcmVzb3VyY2UsXG5cdFx0XHRcdG9wdGlvbnMsXG5cdFx0XHR9LCBzaWRlQnlTaWRlID8gU0lERV9HUk9VUCA6IEFDVElWRV9HUk9VUCk7XG5cblx0XHRcdGNvbnN0IGVkaXRvckNvbnRyb2wgPSBlZGl0b3I/LmdldENvbnRyb2woKTtcblx0XHRcdGlmIChpc1NlYXJjaFRyZWVNYXRjaChlbGVtZW50KSAmJiBwcmVzZXJ2ZUZvY3VzICYmIGlzQ29kZUVkaXRvcihlZGl0b3JDb250cm9sKSkge1xuXHRcdFx0XHR0aGlzLnZpZXdNb2RlbC5zZWFyY2hSZXN1bHQuZ2V0UmFuZ2VIaWdobGlnaHREZWNvcmF0aW9ucygpLmhpZ2hsaWdodFJhbmdlKFxuXHRcdFx0XHRcdGVkaXRvckNvbnRyb2wuZ2V0TW9kZWwoKSEsXG5cdFx0XHRcdFx0ZWxlbWVudC5yYW5nZSgpXG5cdFx0XHRcdCk7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHR0aGlzLnZpZXdNb2RlbC5zZWFyY2hSZXN1bHQuZ2V0UmFuZ2VIaWdobGlnaHREZWNvcmF0aW9ucygpLnJlbW92ZUhpZ2hsaWdodFJhbmdlKCk7XG5cdFx0XHR9XG5cdFx0fSBjYXRjaCAoZXJyKSB7XG5cdFx0XHRlcnJvcnMub25VbmV4cGVjdGVkRXJyb3IoZXJyKTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRpZiAoZWRpdG9yIGluc3RhbmNlb2YgTm90ZWJvb2tFZGl0b3IpIHtcblx0XHRcdGNvbnN0IGVsZW1QYXJlbnQgPSBlbGVtZW50LnBhcmVudCgpIGFzIElOb3RlYm9va0ZpbGVJbnN0YW5jZU1hdGNoO1xuXHRcdFx0aWYgKGlzU2VhcmNoVHJlZU1hdGNoKGVsZW1lbnQpKSB7XG5cdFx0XHRcdGlmIChpc0lNYXRjaEluTm90ZWJvb2soZWxlbWVudCkpIHtcblx0XHRcdFx0XHRlbGVtZW50LnBhcmVudCgpLnNob3dNYXRjaChlbGVtZW50KTtcblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRjb25zdCBlZGl0b3JXaWRnZXQgPSBlZGl0b3IuZ2V0Q29udHJvbCgpO1xuXHRcdFx0XHRcdGlmIChlZGl0b3JXaWRnZXQpIHtcblx0XHRcdFx0XHRcdC8vIEVuc3VyZSB0aGF0IHRoZSBlZGl0b3Igd2lkZ2V0IGlzIGJpbmRlZC4gSWYgaWYgaXMsIHRoZW4gdGhpcyBzaG91bGQgcmV0dXJuIGltbWVkaWF0ZWx5LlxuXHRcdFx0XHRcdFx0Ly8gT3RoZXJ3aXNlLCBpdCB3aWxsIGJpbmQgdGhlIHdpZGdldC5cblx0XHRcdFx0XHRcdGVsZW1QYXJlbnQuYmluZE5vdGVib29rRWRpdG9yV2lkZ2V0KGVkaXRvcldpZGdldCk7XG5cdFx0XHRcdFx0XHRhd2FpdCBlbGVtUGFyZW50LnVwZGF0ZU1hdGNoZXNGb3JFZGl0b3JXaWRnZXQoKTtcblxuXHRcdFx0XHRcdFx0Y29uc3QgbWF0Y2hJbmRleCA9IG9sZFBhcmVudE1hdGNoZXMuZmluZEluZGV4KGUgPT4gZS5pZCgpID09PSBlbGVtZW50LmlkKCkpO1xuXHRcdFx0XHRcdFx0Y29uc3QgbWF0Y2hlcyA9IGVsZW1QYXJlbnQubWF0Y2hlcygpO1xuXHRcdFx0XHRcdFx0Y29uc3QgbWF0Y2ggPSBtYXRjaEluZGV4ID49IG1hdGNoZXMubGVuZ3RoID8gbWF0Y2hlc1ttYXRjaGVzLmxlbmd0aCAtIDFdIDogbWF0Y2hlc1ttYXRjaEluZGV4XTtcblxuXHRcdFx0XHRcdFx0aWYgKGlzSU1hdGNoSW5Ob3RlYm9vayhtYXRjaCkpIHtcblx0XHRcdFx0XHRcdFx0ZWxlbVBhcmVudC5zaG93TWF0Y2gobWF0Y2gpO1xuXHRcdFx0XHRcdFx0XHRpZiAoIXRoaXMudHJlZS5nZXRGb2N1cygpLmluY2x1ZGVzKG1hdGNoKSB8fCAhdGhpcy50cmVlLmdldFNlbGVjdGlvbigpLmluY2x1ZGVzKG1hdGNoKSkge1xuXHRcdFx0XHRcdFx0XHRcdHRoaXMudHJlZS5zZXRTZWxlY3Rpb24oW21hdGNoXSwgZ2V0U2VsZWN0aW9uS2V5Ym9hcmRFdmVudCgpKTtcblx0XHRcdFx0XHRcdFx0XHR0aGlzLnRyZWUuc2V0Rm9jdXMoW21hdGNoXSk7XG5cdFx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cdH1cblxuXHRvcGVuRWRpdG9yV2l0aE11bHRpQ3Vyc29yKGVsZW1lbnQ6IEZpbGVNYXRjaE9yTWF0Y2gpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCByZXNvdXJjZSA9IGlzU2VhcmNoVHJlZU1hdGNoKGVsZW1lbnQpID8gZWxlbWVudC5wYXJlbnQoKS5yZXNvdXJjZSA6ICg8SVNlYXJjaFRyZWVGaWxlTWF0Y2g+ZWxlbWVudCkucmVzb3VyY2U7XG5cdFx0cmV0dXJuIHRoaXMuZWRpdG9yU2VydmljZS5vcGVuRWRpdG9yKHtcblx0XHRcdHJlc291cmNlOiByZXNvdXJjZSxcblx0XHRcdG9wdGlvbnM6IHtcblx0XHRcdFx0cHJlc2VydmVGb2N1czogZmFsc2UsXG5cdFx0XHRcdHBpbm5lZDogdHJ1ZSxcblx0XHRcdFx0cmV2ZWFsSWZWaXNpYmxlOiB0cnVlXG5cdFx0XHR9XG5cdFx0fSkudGhlbihlZGl0b3IgPT4ge1xuXHRcdFx0aWYgKGVkaXRvcikge1xuXHRcdFx0XHRsZXQgZmlsZU1hdGNoID0gbnVsbDtcblx0XHRcdFx0aWYgKGlzU2VhcmNoVHJlZUZpbGVNYXRjaChlbGVtZW50KSkge1xuXHRcdFx0XHRcdGZpbGVNYXRjaCA9IGVsZW1lbnQ7XG5cdFx0XHRcdH1cblx0XHRcdFx0ZWxzZSBpZiAoaXNTZWFyY2hUcmVlTWF0Y2goZWxlbWVudCkpIHtcblx0XHRcdFx0XHRmaWxlTWF0Y2ggPSBlbGVtZW50LnBhcmVudCgpO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0aWYgKGZpbGVNYXRjaCkge1xuXHRcdFx0XHRcdGNvbnN0IHNlbGVjdGlvbnMgPSBmaWxlTWF0Y2gubWF0Y2hlcygpLm1hcChtID0+IG5ldyBTZWxlY3Rpb24obS5yYW5nZSgpLnN0YXJ0TGluZU51bWJlciwgbS5yYW5nZSgpLnN0YXJ0Q29sdW1uLCBtLnJhbmdlKCkuZW5kTGluZU51bWJlciwgbS5yYW5nZSgpLmVuZENvbHVtbikpO1xuXHRcdFx0XHRcdGNvbnN0IGNvZGVFZGl0b3IgPSBnZXRDb2RlRWRpdG9yKGVkaXRvci5nZXRDb250cm9sKCkpO1xuXHRcdFx0XHRcdGlmIChjb2RlRWRpdG9yKSB7XG5cdFx0XHRcdFx0XHRjb25zdCBtdWx0aUN1cnNvckNvbnRyb2xsZXIgPSBNdWx0aUN1cnNvclNlbGVjdGlvbkNvbnRyb2xsZXIuZ2V0KGNvZGVFZGl0b3IpO1xuXHRcdFx0XHRcdFx0bXVsdGlDdXJzb3JDb250cm9sbGVyPy5zZWxlY3RBbGxVc2luZ1NlbGVjdGlvbnMoc2VsZWN0aW9ucyk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0XHR0aGlzLnZpZXdNb2RlbC5zZWFyY2hSZXN1bHQuZ2V0UmFuZ2VIaWdobGlnaHREZWNvcmF0aW9ucygpLnJlbW92ZUhpZ2hsaWdodFJhbmdlKCk7XG5cdFx0fSwgZXJyb3JzLm9uVW5leHBlY3RlZEVycm9yKTtcblx0fVxuXG5cdHByaXZhdGUgb25VbnRpdGxlZERpZERpc3Bvc2UocmVzb3VyY2U6IFVSSSk6IHZvaWQge1xuXHRcdGlmICghdGhpcy52aWV3TW9kZWwpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHQvLyByZW1vdmUgc2VhcmNoIHJlc3VsdHMgZnJvbSB0aGlzIHJlc291cmNlIGFzIGl0IGdvdCBkaXNwb3NlZFxuXHRcdGxldCBtYXRjaGVzID0gdGhpcy52aWV3TW9kZWwuc2VhcmNoUmVzdWx0Lm1hdGNoZXMoKTtcblx0XHRmb3IgKGxldCBpID0gMCwgbGVuID0gbWF0Y2hlcy5sZW5ndGg7IGkgPCBsZW47IGkrKykge1xuXHRcdFx0aWYgKHJlc291cmNlLnRvU3RyaW5nKCkgPT09IG1hdGNoZXNbaV0ucmVzb3VyY2UudG9TdHJpbmcoKSkge1xuXHRcdFx0XHR0aGlzLnZpZXdNb2RlbC5zZWFyY2hSZXN1bHQucmVtb3ZlKG1hdGNoZXNbaV0pO1xuXHRcdFx0fVxuXHRcdH1cblx0XHRtYXRjaGVzID0gdGhpcy52aWV3TW9kZWwuc2VhcmNoUmVzdWx0Lm1hdGNoZXModHJ1ZSk7XG5cdFx0Zm9yIChsZXQgaSA9IDAsIGxlbiA9IG1hdGNoZXMubGVuZ3RoOyBpIDwgbGVuOyBpKyspIHtcblx0XHRcdGlmIChyZXNvdXJjZS50b1N0cmluZygpID09PSBtYXRjaGVzW2ldLnJlc291cmNlLnRvU3RyaW5nKCkpIHtcblx0XHRcdFx0dGhpcy52aWV3TW9kZWwuc2VhcmNoUmVzdWx0LnJlbW92ZShtYXRjaGVzW2ldKTtcblx0XHRcdH1cblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIG9uRmlsZXNDaGFuZ2VkKGU6IEZpbGVDaGFuZ2VzRXZlbnQpOiB2b2lkIHtcblx0XHRpZiAoIXRoaXMudmlld01vZGVsIHx8ICh0aGlzLnNlYXJjaENvbmZpZy5zb3J0T3JkZXIgIT09IFNlYXJjaFNvcnRPcmRlci5Nb2RpZmllZCAmJiAhZS5nb3REZWxldGVkKCkpKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29uc3QgbWF0Y2hlcyA9IHRoaXMudmlld01vZGVsLnNlYXJjaFJlc3VsdC5tYXRjaGVzKCk7XG5cdFx0aWYgKGUuZ290RGVsZXRlZCgpKSB7XG5cdFx0XHRjb25zdCBkZWxldGVkTWF0Y2hlcyA9IG1hdGNoZXMuZmlsdGVyKG0gPT4gZS5jb250YWlucyhtLnJlc291cmNlLCBGaWxlQ2hhbmdlVHlwZS5ERUxFVEVEKSk7XG5cblx0XHRcdHRoaXMudmlld01vZGVsLnNlYXJjaFJlc3VsdC5yZW1vdmUoZGVsZXRlZE1hdGNoZXMpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHQvLyBDaGVjayBpZiB0aGUgY2hhbmdlZCBmaWxlIGNvbnRhaW5lZCBtYXRjaGVzXG5cdFx0XHRjb25zdCBjaGFuZ2VkTWF0Y2hlcyA9IG1hdGNoZXMuZmlsdGVyKG0gPT4gZS5jb250YWlucyhtLnJlc291cmNlKSk7XG5cdFx0XHRpZiAoY2hhbmdlZE1hdGNoZXMubGVuZ3RoICYmIHRoaXMuc2VhcmNoQ29uZmlnLnNvcnRPcmRlciA9PT0gU2VhcmNoU29ydE9yZGVyLk1vZGlmaWVkKSB7XG5cdFx0XHRcdC8vIE5vIG1hdGNoZXMgbmVlZCB0byBiZSByZW1vdmVkLCBidXQgbW9kaWZpZWQgZmlsZXMgbmVlZCB0byBoYXZlIHRoZWlyIGZpbGUgc3RhdCB1cGRhdGVkLlxuXHRcdFx0XHR0aGlzLnVwZGF0ZUZpbGVTdGF0cyhjaGFuZ2VkTWF0Y2hlcykudGhlbihhc3luYyAoKSA9PiB0aGlzLnJlZnJlc2hUcmVlQ29udHJvbGxlci5xdWV1ZSgpKTtcblx0XHRcdH1cblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIGdldCBzZWFyY2hDb25maWcoKTogSVNlYXJjaENvbmZpZ3VyYXRpb25Qcm9wZXJ0aWVzIHtcblx0XHRyZXR1cm4gdGhpcy5jb25maWd1cmF0aW9uU2VydmljZS5nZXRWYWx1ZTxJU2VhcmNoQ29uZmlndXJhdGlvblByb3BlcnRpZXM+KCdzZWFyY2gnKTtcblx0fVxuXG5cdHByaXZhdGUgY2xlYXJIaXN0b3J5KCk6IHZvaWQge1xuXHRcdHRoaXMuc2VhcmNoV2lkZ2V0LmNsZWFySGlzdG9yeSgpO1xuXHRcdHRoaXMuaW5wdXRQYXR0ZXJuRXhjbHVkZXMuY2xlYXJIaXN0b3J5KCk7XG5cdFx0dGhpcy5pbnB1dFBhdHRlcm5JbmNsdWRlcy5jbGVhckhpc3RvcnkoKTtcblx0fVxuXG5cdHB1YmxpYyBvdmVycmlkZSBzYXZlU3RhdGUoKTogdm9pZCB7XG5cdFx0Ly8gVGhpcyBjYW4gYmUgY2FsbGVkIGJlZm9yZSByZW5kZXJCb2R5KCkgbWV0aG9kIGdldHMgY2FsbGVkIGZvciB0aGUgZmlyc3QgdGltZVxuXHRcdC8vIGlmIHdlIG1vdmUgdGhlIHNlYXJjaFZpZXcgaW5zaWRlIGFub3RoZXIgdmlld1BhbmVDb250YWluZXJcblx0XHRpZiAoIXRoaXMuc2VhcmNoV2lkZ2V0KSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29uc3QgcGF0dGVybkV4Y2x1ZGVzID0gdGhpcy5pbnB1dFBhdHRlcm5FeGNsdWRlcz8uZ2V0VmFsdWUoKS50cmltKCkgPz8gJyc7XG5cdFx0Y29uc3QgcGF0dGVybkluY2x1ZGVzID0gdGhpcy5pbnB1dFBhdHRlcm5JbmNsdWRlcz8uZ2V0VmFsdWUoKS50cmltKCkgPz8gJyc7XG5cdFx0Y29uc3Qgb25seU9wZW5FZGl0b3JzID0gdGhpcy5pbnB1dFBhdHRlcm5JbmNsdWRlcz8ub25seVNlYXJjaEluT3BlbkVkaXRvcnMoKSA/PyBmYWxzZTtcblx0XHRjb25zdCB1c2VFeGNsdWRlc0FuZElnbm9yZUZpbGVzID0gdGhpcy5pbnB1dFBhdHRlcm5FeGNsdWRlcz8udXNlRXhjbHVkZXNBbmRJZ25vcmVGaWxlcygpID8/IHRydWU7XG5cdFx0Y29uc3QgcHJlc2VydmVDYXNlID0gdGhpcy52aWV3TW9kZWwucHJlc2VydmVDYXNlO1xuXG5cdFx0aWYgKCF0aGlzLnZpZXdsZXRTdGF0ZS5xdWVyeSkge1xuXHRcdFx0dGhpcy52aWV3bGV0U3RhdGUucXVlcnkgPSB7fTtcblx0XHR9XG5cblx0XHRpZiAodGhpcy5zZWFyY2hXaWRnZXQuc2VhcmNoSW5wdXQpIHtcblx0XHRcdGNvbnN0IGlzUmVnZXggPSB0aGlzLnNlYXJjaFdpZGdldC5zZWFyY2hJbnB1dC5nZXRSZWdleCgpO1xuXHRcdFx0Y29uc3QgaXNXaG9sZVdvcmRzID0gdGhpcy5zZWFyY2hXaWRnZXQuc2VhcmNoSW5wdXQuZ2V0V2hvbGVXb3JkcygpO1xuXHRcdFx0Y29uc3QgaXNDYXNlU2Vuc2l0aXZlID0gdGhpcy5zZWFyY2hXaWRnZXQuc2VhcmNoSW5wdXQuZ2V0Q2FzZVNlbnNpdGl2ZSgpO1xuXHRcdFx0Y29uc3QgY29udGVudFBhdHRlcm4gPSB0aGlzLnNlYXJjaFdpZGdldC5zZWFyY2hJbnB1dC5nZXRWYWx1ZSgpO1xuXG5cdFx0XHRjb25zdCBpc0luTm90ZWJvb2tDZWxsSW5wdXQgPSB0aGlzLnNlYXJjaFdpZGdldC5nZXROb3RlYm9va0ZpbHRlcnMoKS5jb2RlSW5wdXQ7XG5cdFx0XHRjb25zdCBpc0luTm90ZWJvb2tDZWxsT3V0cHV0ID0gdGhpcy5zZWFyY2hXaWRnZXQuZ2V0Tm90ZWJvb2tGaWx0ZXJzKCkuY29kZU91dHB1dDtcblx0XHRcdGNvbnN0IGlzSW5Ob3RlYm9va01hcmtkb3duSW5wdXQgPSB0aGlzLnNlYXJjaFdpZGdldC5nZXROb3RlYm9va0ZpbHRlcnMoKS5tYXJrdXBJbnB1dDtcblx0XHRcdGNvbnN0IGlzSW5Ob3RlYm9va01hcmtkb3duUHJldmlldyA9IHRoaXMuc2VhcmNoV2lkZ2V0LmdldE5vdGVib29rRmlsdGVycygpLm1hcmt1cFByZXZpZXc7XG5cblx0XHRcdHRoaXMudmlld2xldFN0YXRlLnF1ZXJ5LmNvbnRlbnRQYXR0ZXJuID0gY29udGVudFBhdHRlcm47XG5cdFx0XHR0aGlzLnZpZXdsZXRTdGF0ZS5xdWVyeS5yZWdleCA9IGlzUmVnZXg7XG5cdFx0XHR0aGlzLnZpZXdsZXRTdGF0ZS5xdWVyeS53aG9sZVdvcmRzID0gaXNXaG9sZVdvcmRzO1xuXHRcdFx0dGhpcy52aWV3bGV0U3RhdGUucXVlcnkuY2FzZVNlbnNpdGl2ZSA9IGlzQ2FzZVNlbnNpdGl2ZTtcblxuXHRcdFx0dGhpcy52aWV3bGV0U3RhdGUucXVlcnkuaXNJbk5vdGVib29rTWFya2Rvd25JbnB1dCA9IGlzSW5Ob3RlYm9va01hcmtkb3duSW5wdXQ7XG5cdFx0XHR0aGlzLnZpZXdsZXRTdGF0ZS5xdWVyeS5pc0luTm90ZWJvb2tNYXJrZG93blByZXZpZXcgPSBpc0luTm90ZWJvb2tNYXJrZG93blByZXZpZXc7XG5cdFx0XHR0aGlzLnZpZXdsZXRTdGF0ZS5xdWVyeS5pc0luTm90ZWJvb2tDZWxsSW5wdXQgPSBpc0luTm90ZWJvb2tDZWxsSW5wdXQ7XG5cdFx0XHR0aGlzLnZpZXdsZXRTdGF0ZS5xdWVyeS5pc0luTm90ZWJvb2tDZWxsT3V0cHV0ID0gaXNJbk5vdGVib29rQ2VsbE91dHB1dDtcblx0XHR9XG5cblx0XHR0aGlzLnZpZXdsZXRTdGF0ZS5xdWVyeS5mb2xkZXJFeGNsdXNpb25zID0gcGF0dGVybkV4Y2x1ZGVzO1xuXHRcdHRoaXMudmlld2xldFN0YXRlLnF1ZXJ5LmZvbGRlckluY2x1ZGVzID0gcGF0dGVybkluY2x1ZGVzO1xuXHRcdHRoaXMudmlld2xldFN0YXRlLnF1ZXJ5LnVzZUV4Y2x1ZGVzQW5kSWdub3JlRmlsZXMgPSB1c2VFeGNsdWRlc0FuZElnbm9yZUZpbGVzO1xuXHRcdHRoaXMudmlld2xldFN0YXRlLnF1ZXJ5LnByZXNlcnZlQ2FzZSA9IHByZXNlcnZlQ2FzZTtcblx0XHR0aGlzLnZpZXdsZXRTdGF0ZS5xdWVyeS5vbmx5T3BlbkVkaXRvcnMgPSBvbmx5T3BlbkVkaXRvcnM7XG5cblx0XHRjb25zdCBpc1JlcGxhY2VTaG93biA9IHRoaXMuc2VhcmNoQW5kUmVwbGFjZVdpZGdldC5pc1JlcGxhY2VTaG93bigpO1xuXG5cdFx0aWYgKCF0aGlzLnZpZXdsZXRTdGF0ZS52aWV3KSB7XG5cdFx0XHR0aGlzLnZpZXdsZXRTdGF0ZS52aWV3ID0ge307XG5cdFx0fVxuXG5cdFx0dGhpcy52aWV3bGV0U3RhdGUudmlldy5zaG93UmVwbGFjZSA9IGlzUmVwbGFjZVNob3duO1xuXHRcdHRoaXMudmlld2xldFN0YXRlLnZpZXcudHJlZUxheW91dCA9IHRoaXMuaXNUcmVlTGF5b3V0Vmlld1Zpc2libGU7XG5cdFx0dGhpcy52aWV3bGV0U3RhdGUucXVlcnkucmVwbGFjZVRleHQgPSBpc1JlcGxhY2VTaG93biAmJiB0aGlzLnNlYXJjaFdpZGdldC5nZXRSZXBsYWNlVmFsdWUoKTtcblxuXHRcdHRoaXMuX3NhdmVTZWFyY2hIaXN0b3J5U2VydmljZSgpO1xuXG5cdFx0dGhpcy5tZW1lbnRvLnNhdmVNZW1lbnRvKCk7XG5cblx0XHRzdXBlci5zYXZlU3RhdGUoKTtcblx0fVxuXG5cdHByaXZhdGUgX3NhdmVTZWFyY2hIaXN0b3J5U2VydmljZSgpIHtcblx0XHRpZiAodGhpcy5zZWFyY2hXaWRnZXQgPT09IHVuZGVmaW5lZCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRjb25zdCBoaXN0b3J5OiBJU2VhcmNoSGlzdG9yeVZhbHVlcyA9IE9iamVjdC5jcmVhdGUobnVsbCk7XG5cblx0XHRjb25zdCBzZWFyY2hIaXN0b3J5ID0gdGhpcy5zZWFyY2hXaWRnZXQuZ2V0U2VhcmNoSGlzdG9yeSgpO1xuXHRcdGlmIChzZWFyY2hIaXN0b3J5ICYmIHNlYXJjaEhpc3RvcnkubGVuZ3RoKSB7XG5cdFx0XHRoaXN0b3J5LnNlYXJjaCA9IHNlYXJjaEhpc3Rvcnk7XG5cdFx0fVxuXG5cdFx0Y29uc3QgcmVwbGFjZUhpc3RvcnkgPSB0aGlzLnNlYXJjaFdpZGdldC5nZXRSZXBsYWNlSGlzdG9yeSgpO1xuXHRcdGlmIChyZXBsYWNlSGlzdG9yeSAmJiByZXBsYWNlSGlzdG9yeS5sZW5ndGgpIHtcblx0XHRcdGhpc3RvcnkucmVwbGFjZSA9IHJlcGxhY2VIaXN0b3J5O1xuXHRcdH1cblxuXHRcdGNvbnN0IHBhdHRlcm5FeGNsdWRlc0hpc3RvcnkgPSB0aGlzLmlucHV0UGF0dGVybkV4Y2x1ZGVzLmdldEhpc3RvcnkoKTtcblx0XHRpZiAocGF0dGVybkV4Y2x1ZGVzSGlzdG9yeSAmJiBwYXR0ZXJuRXhjbHVkZXNIaXN0b3J5Lmxlbmd0aCkge1xuXHRcdFx0aGlzdG9yeS5leGNsdWRlID0gcGF0dGVybkV4Y2x1ZGVzSGlzdG9yeTtcblx0XHR9XG5cblx0XHRjb25zdCBwYXR0ZXJuSW5jbHVkZXNIaXN0b3J5ID0gdGhpcy5pbnB1dFBhdHRlcm5JbmNsdWRlcy5nZXRIaXN0b3J5KCk7XG5cdFx0aWYgKHBhdHRlcm5JbmNsdWRlc0hpc3RvcnkgJiYgcGF0dGVybkluY2x1ZGVzSGlzdG9yeS5sZW5ndGgpIHtcblx0XHRcdGhpc3RvcnkuaW5jbHVkZSA9IHBhdHRlcm5JbmNsdWRlc0hpc3Rvcnk7XG5cdFx0fVxuXG5cdFx0dGhpcy5zZWFyY2hIaXN0b3J5U2VydmljZS5zYXZlKGhpc3RvcnkpO1xuXHR9XG5cblxuXHRwcml2YXRlIGFzeW5jIHVwZGF0ZUZpbGVTdGF0cyhlbGVtZW50czogSVNlYXJjaFRyZWVGaWxlTWF0Y2hbXSk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGNvbnN0IGZpbGVzID0gZWxlbWVudHMubWFwKGYgPT4gZi5yZXNvbHZlRmlsZVN0YXQodGhpcy5maWxlU2VydmljZSkpO1xuXHRcdGF3YWl0IFByb21pc2UuYWxsKGZpbGVzKTtcblx0fVxuXG5cdHByaXZhdGUgcmVtb3ZlRmlsZVN0YXRzKCk6IHZvaWQge1xuXHRcdGZvciAoY29uc3QgZmlsZU1hdGNoIG9mIHRoaXMuc2VhcmNoUmVzdWx0Lm1hdGNoZXMoKSkge1xuXHRcdFx0ZmlsZU1hdGNoLmZpbGVTdGF0ID0gdW5kZWZpbmVkO1xuXHRcdH1cblx0XHRmb3IgKGNvbnN0IGZpbGVNYXRjaCBvZiB0aGlzLnNlYXJjaFJlc3VsdC5tYXRjaGVzKHRydWUpKSB7XG5cdFx0XHRmaWxlTWF0Y2guZmlsZVN0YXQgPSB1bmRlZmluZWQ7XG5cdFx0fVxuXHR9XG5cblx0b3ZlcnJpZGUgZGlzcG9zZSgpOiB2b2lkIHtcblx0XHR0aGlzLmlzRGlzcG9zZWQgPSB0cnVlO1xuXHRcdHRoaXMuc2F2ZVN0YXRlKCk7XG5cdFx0c3VwZXIuZGlzcG9zZSgpO1xuXHR9XG59XG5cblxuY2xhc3MgU2VhcmNoTGlua0J1dHRvbiBleHRlbmRzIERpc3Bvc2FibGUge1xuXHRwdWJsaWMgcmVhZG9ubHkgZWxlbWVudDogSFRNTEVsZW1lbnQ7XG5cblx0Y29uc3RydWN0b3IobGFiZWw6IHN0cmluZywgaGFuZGxlcjogKGU6IGRvbS5FdmVudExpa2UpID0+IHVua25vd24sIGhvdmVyU2VydmljZTogSUhvdmVyU2VydmljZSwgdG9vbHRpcD86IHN0cmluZykge1xuXHRcdHN1cGVyKCk7XG5cdFx0dGhpcy5lbGVtZW50ID0gJCgnYS5wb2ludGVyJywgeyB0YWJpbmRleDogMCB9LCBsYWJlbCk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIoaG92ZXJTZXJ2aWNlLnNldHVwTWFuYWdlZEhvdmVyKGdldERlZmF1bHRIb3ZlckRlbGVnYXRlKCdtb3VzZScpLCB0aGlzLmVsZW1lbnQsIHRvb2x0aXApKTtcblx0XHR0aGlzLmFkZEV2ZW50SGFuZGxlcnMoaGFuZGxlcik7XG5cdH1cblxuXHRwcml2YXRlIGFkZEV2ZW50SGFuZGxlcnMoaGFuZGxlcjogKGU6IGRvbS5FdmVudExpa2UpID0+IHVua25vd24pOiB2b2lkIHtcblx0XHRjb25zdCB3cmFwcGVkSGFuZGxlciA9IChlOiBkb20uRXZlbnRMaWtlKSA9PiB7XG5cdFx0XHRkb20uRXZlbnRIZWxwZXIuc3RvcChlLCBmYWxzZSk7XG5cdFx0XHRoYW5kbGVyKGUpO1xuXHRcdH07XG5cblx0XHR0aGlzLl9yZWdpc3Rlcihkb20uYWRkRGlzcG9zYWJsZUxpc3RlbmVyKHRoaXMuZWxlbWVudCwgZG9tLkV2ZW50VHlwZS5DTElDSywgd3JhcHBlZEhhbmRsZXIpKTtcblx0XHR0aGlzLl9yZWdpc3Rlcihkb20uYWRkRGlzcG9zYWJsZUxpc3RlbmVyKHRoaXMuZWxlbWVudCwgZG9tLkV2ZW50VHlwZS5LRVlfRE9XTiwgZSA9PiB7XG5cdFx0XHRjb25zdCBldmVudCA9IG5ldyBTdGFuZGFyZEtleWJvYXJkRXZlbnQoZSk7XG5cdFx0XHRpZiAoZXZlbnQuZXF1YWxzKEtleUNvZGUuU3BhY2UpIHx8IGV2ZW50LmVxdWFscyhLZXlDb2RlLkVudGVyKSkge1xuXHRcdFx0XHR3cmFwcGVkSGFuZGxlcihlKTtcblx0XHRcdFx0ZXZlbnQucHJldmVudERlZmF1bHQoKTtcblx0XHRcdFx0ZXZlbnQuc3RvcFByb3BhZ2F0aW9uKCk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXHR9XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBnZXRFZGl0b3JTZWxlY3Rpb25Gcm9tTWF0Y2goZWxlbWVudDogRmlsZU1hdGNoT3JNYXRjaCwgdmlld01vZGVsOiBJU2VhcmNoTW9kZWwpIHtcblx0bGV0IG1hdGNoOiBJU2VhcmNoVHJlZU1hdGNoIHwgbnVsbCA9IG51bGw7XG5cdGlmIChpc1NlYXJjaFRyZWVNYXRjaChlbGVtZW50KSkge1xuXHRcdG1hdGNoID0gZWxlbWVudDtcblx0fVxuXHRpZiAoaXNTZWFyY2hUcmVlRmlsZU1hdGNoKGVsZW1lbnQpICYmIGVsZW1lbnQuY291bnQoKSA+IDApIHtcblx0XHRtYXRjaCA9IGVsZW1lbnQubWF0Y2hlcygpW2VsZW1lbnQubWF0Y2hlcygpLmxlbmd0aCAtIDFdO1xuXHR9XG5cdGlmIChtYXRjaCkge1xuXHRcdGNvbnN0IHJhbmdlID0gbWF0Y2gucmFuZ2UoKTtcblx0XHRpZiAodmlld01vZGVsLmlzUmVwbGFjZUFjdGl2ZSgpICYmICEhdmlld01vZGVsLnJlcGxhY2VTdHJpbmcpIHtcblx0XHRcdGNvbnN0IHJlcGxhY2VTdHJpbmcgPSBtYXRjaC5yZXBsYWNlU3RyaW5nO1xuXHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0c3RhcnRMaW5lTnVtYmVyOiByYW5nZS5zdGFydExpbmVOdW1iZXIsXG5cdFx0XHRcdHN0YXJ0Q29sdW1uOiByYW5nZS5zdGFydENvbHVtbixcblx0XHRcdFx0ZW5kTGluZU51bWJlcjogcmFuZ2Uuc3RhcnRMaW5lTnVtYmVyLFxuXHRcdFx0XHRlbmRDb2x1bW46IHJhbmdlLnN0YXJ0Q29sdW1uICsgcmVwbGFjZVN0cmluZy5sZW5ndGhcblx0XHRcdH07XG5cdFx0fVxuXHRcdHJldHVybiByYW5nZTtcblx0fVxuXHRyZXR1cm4gdW5kZWZpbmVkO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gZ2V0U2VsZWN0aW9uVGV4dEZyb21FZGl0b3IoYWxsb3dVbnNlbGVjdGVkV29yZDogYm9vbGVhbiwgYWN0aXZlRWRpdG9yOiBJRWRpdG9yKTogc3RyaW5nIHwgbnVsbCB7XG5cblx0bGV0IGVkaXRvciA9IGFjdGl2ZUVkaXRvcjtcblxuXHRpZiAoaXNEaWZmRWRpdG9yKGVkaXRvcikpIHtcblx0XHRpZiAoZWRpdG9yLmdldE9yaWdpbmFsRWRpdG9yKCkuaGFzVGV4dEZvY3VzKCkpIHtcblx0XHRcdGVkaXRvciA9IGVkaXRvci5nZXRPcmlnaW5hbEVkaXRvcigpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRlZGl0b3IgPSBlZGl0b3IuZ2V0TW9kaWZpZWRFZGl0b3IoKTtcblx0XHR9XG5cdH1cblxuXHRpZiAoIWlzQ29kZUVkaXRvcihlZGl0b3IpIHx8ICFlZGl0b3IuaGFzTW9kZWwoKSkge1xuXHRcdHJldHVybiBudWxsO1xuXHR9XG5cblx0Y29uc3QgcmFuZ2UgPSBlZGl0b3IuZ2V0U2VsZWN0aW9uKCk7XG5cdGlmICghcmFuZ2UpIHtcblx0XHRyZXR1cm4gbnVsbDtcblx0fVxuXG5cdGlmIChyYW5nZS5pc0VtcHR5KCkpIHtcblx0XHRpZiAoYWxsb3dVbnNlbGVjdGVkV29yZCkge1xuXHRcdFx0Y29uc3Qgd29yZEF0UG9zaXRpb24gPSBlZGl0b3IuZ2V0TW9kZWwoKS5nZXRXb3JkQXRQb3NpdGlvbihyYW5nZS5nZXRTdGFydFBvc2l0aW9uKCkpO1xuXHRcdFx0cmV0dXJuIHdvcmRBdFBvc2l0aW9uPy53b3JkID8/IG51bGw7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHJldHVybiBudWxsO1xuXHRcdH1cblx0fVxuXG5cdGxldCBzZWFyY2hUZXh0ID0gJyc7XG5cdGZvciAobGV0IGkgPSByYW5nZS5zdGFydExpbmVOdW1iZXI7IGkgPD0gcmFuZ2UuZW5kTGluZU51bWJlcjsgaSsrKSB7XG5cdFx0bGV0IGxpbmVUZXh0ID0gZWRpdG9yLmdldE1vZGVsKCkuZ2V0TGluZUNvbnRlbnQoaSk7XG5cdFx0aWYgKGkgPT09IHJhbmdlLmVuZExpbmVOdW1iZXIpIHtcblx0XHRcdGxpbmVUZXh0ID0gbGluZVRleHQuc3Vic3RyaW5nKDAsIHJhbmdlLmVuZENvbHVtbiAtIDEpO1xuXHRcdH1cblxuXHRcdGlmIChpID09PSByYW5nZS5zdGFydExpbmVOdW1iZXIpIHtcblx0XHRcdGxpbmVUZXh0ID0gbGluZVRleHQuc3Vic3RyaW5nKHJhbmdlLnN0YXJ0Q29sdW1uIC0gMSk7XG5cdFx0fVxuXG5cdFx0aWYgKGkgIT09IHJhbmdlLnN0YXJ0TGluZU51bWJlcikge1xuXHRcdFx0bGluZVRleHQgPSAnXFxuJyArIGxpbmVUZXh0O1xuXHRcdH1cblxuXHRcdHNlYXJjaFRleHQgKz0gbGluZVRleHQ7XG5cdH1cblxuXHRyZXR1cm4gc2VhcmNoVGV4dDtcbn1cblxuY2xhc3MgU2VhcmNoVmlld0RhdGFTb3VyY2UgaW1wbGVtZW50cyBJQXN5bmNEYXRhU291cmNlPElTZWFyY2hSZXN1bHQsIFJlbmRlcmFibGVNYXRjaD4ge1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdHByaXZhdGUgc2VhcmNoVmlldzogU2VhcmNoVmlldyxcblx0XHRASUNvbmZpZ3VyYXRpb25TZXJ2aWNlIHByaXZhdGUgY29uZmlndXJhdGlvblNlcnZpY2U6IElDb25maWd1cmF0aW9uU2VydmljZSxcblx0KSB7IH1cblxuXG5cdHByaXZhdGUgZ2V0IHNlYXJjaENvbmZpZygpOiBJU2VhcmNoQ29uZmlndXJhdGlvblByb3BlcnRpZXMge1xuXHRcdHJldHVybiB0aGlzLmNvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldFZhbHVlPElTZWFyY2hDb25maWd1cmF0aW9uUHJvcGVydGllcz4oJ3NlYXJjaCcpO1xuXHR9XG5cblx0cHJpdmF0ZSBjcmVhdGVTZWFyY2hSZXN1bHRJdGVyYXRvcihzZWFyY2hSZXN1bHQ6IElTZWFyY2hSZXN1bHQpOiBJdGVyYWJsZTxSZW5kZXJhYmxlTWF0Y2g+IHtcblxuXHRcdGNvbnN0IHJldDogSVRleHRTZWFyY2hIZWFkaW5nW10gPSBbXTtcblxuXHRcdGlmICh0aGlzLnNlYXJjaFZpZXcuc2hvdWxkU2hvd0FJUmVzdWx0cygpICYmIHNlYXJjaFJlc3VsdC5zZWFyY2hNb2RlbC5oYXNQbGFpblJlc3VsdHMgJiYgIXNlYXJjaFJlc3VsdC5haVRleHRTZWFyY2hSZXN1bHQuaGlkZGVuKSB7XG5cdFx0XHQvLyBhcyBsb25nIGFzIHRoZXJlIGlzIGEgcXVlcnkgcHJlc2VudCwgd2UgY2FuIGxvYWQgQUkgcmVzdWx0c1xuXHRcdFx0cmV0LnB1c2goc2VhcmNoUmVzdWx0LmFpVGV4dFNlYXJjaFJlc3VsdCk7XG5cdFx0fVxuXG5cdFx0aWYgKCFzZWFyY2hSZXN1bHQucGxhaW5UZXh0U2VhcmNoUmVzdWx0LmlzRW1wdHkoKSkge1xuXHRcdFx0aWYgKCF0aGlzLnNlYXJjaFZpZXcuc2hvdWxkU2hvd0FJUmVzdWx0cygpIHx8IHNlYXJjaFJlc3VsdC5haVRleHRTZWFyY2hSZXN1bHQuaGlkZGVuKSB7XG5cdFx0XHRcdC8vIG9ubHkgb25lIHJvb3QsIHNvIGp1c3QgcmV0dXJuIHRoZSBjaGlsZHJlblxuXHRcdFx0XHRyZXR1cm4gdGhpcy5jcmVhdGVUZXh0U2VhcmNoUmVzdWx0SXRlcmF0b3Ioc2VhcmNoUmVzdWx0LnBsYWluVGV4dFNlYXJjaFJlc3VsdCk7XG5cdFx0XHR9XG5cdFx0XHRyZXQucHVzaChzZWFyY2hSZXN1bHQucGxhaW5UZXh0U2VhcmNoUmVzdWx0KTtcblxuXHRcdH1cblxuXHRcdHJldHVybiByZXQ7XG5cblx0fVxuXG5cdHByaXZhdGUgY3JlYXRlVGV4dFNlYXJjaFJlc3VsdEl0ZXJhdG9yKHRleHRTZWFyY2hSZXN1bHQ6IElUZXh0U2VhcmNoSGVhZGluZyk6IEl0ZXJhYmxlPElTZWFyY2hUcmVlRm9sZGVyTWF0Y2ggfCBJU2VhcmNoVHJlZUZpbGVNYXRjaD4ge1xuXHRcdGNvbnN0IGZvbGRlck1hdGNoZXMgPSB0ZXh0U2VhcmNoUmVzdWx0LmZvbGRlck1hdGNoZXMoKVxuXHRcdFx0LmZpbHRlcihmbSA9PiAhZm0uaXNFbXB0eSgpKVxuXHRcdFx0LnNvcnQoc2VhcmNoTWF0Y2hDb21wYXJlcik7XG5cblx0XHRpZiAoZm9sZGVyTWF0Y2hlcy5sZW5ndGggPT09IDEpIHtcblx0XHRcdHJldHVybiB0aGlzLmNyZWF0ZUZvbGRlckl0ZXJhdG9yKGZvbGRlck1hdGNoZXNbMF0pO1xuXHRcdH1cblx0XHRyZXR1cm4gZm9sZGVyTWF0Y2hlcztcblx0fVxuXG5cdHByaXZhdGUgY3JlYXRlRm9sZGVySXRlcmF0b3IoZm9sZGVyTWF0Y2g6IElTZWFyY2hUcmVlRm9sZGVyTWF0Y2gpOiBJdGVyYWJsZTxJU2VhcmNoVHJlZUZvbGRlck1hdGNoIHwgSVNlYXJjaFRyZWVGaWxlTWF0Y2g+IHtcblx0XHRjb25zdCBtYXRjaEFycmF5ID0gdGhpcy5zZWFyY2hWaWV3LmlzVHJlZUxheW91dFZpZXdWaXNpYmxlID8gZm9sZGVyTWF0Y2gubWF0Y2hlcygpIDogZm9sZGVyTWF0Y2guYWxsRG93bnN0cmVhbUZpbGVNYXRjaGVzKCk7XG5cdFx0bGV0IG1hdGNoZXMgPSBtYXRjaEFycmF5O1xuXHRcdGlmICghKGZvbGRlck1hdGNoIGluc3RhbmNlb2YgQUlGb2xkZXJNYXRjaFdvcmtzcGFjZVJvb3RJbXBsKSkge1xuXHRcdFx0bWF0Y2hlcyA9IG1hdGNoQXJyYXkuc29ydCgoYSwgYikgPT4gc2VhcmNoTWF0Y2hDb21wYXJlcihhLCBiLCB0aGlzLnNlYXJjaENvbmZpZy5zb3J0T3JkZXIpKTtcblx0XHR9XG5cblx0XHRyZXR1cm4gbWF0Y2hlcztcblx0fVxuXG5cdHByaXZhdGUgY3JlYXRlRmlsZUl0ZXJhdG9yKGZpbGVNYXRjaDogSVNlYXJjaFRyZWVGaWxlTWF0Y2gpOiBJdGVyYWJsZTxJU2VhcmNoVHJlZU1hdGNoPiB7XG5cdFx0Y29uc3QgbWF0Y2hlcyA9IGZpbGVNYXRjaC5tYXRjaGVzKCkuc29ydChzZWFyY2hNYXRjaENvbXBhcmVyKTtcblx0XHRyZXR1cm4gbWF0Y2hlcztcblx0fVxuXG5cdGhhc0NoaWxkcmVuKGVsZW1lbnQ6IFJlbmRlcmFibGVNYXRjaCk6IGJvb2xlYW4ge1xuXHRcdGlmIChpc1NlYXJjaFRyZWVNYXRjaChlbGVtZW50KSkge1xuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH1cblxuXHRcdGlmIChpc1RleHRTZWFyY2hIZWFkaW5nKGVsZW1lbnQpICYmIGVsZW1lbnQuaXNBSUNvbnRyaWJ1dGVkKSB7XG5cdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHR9XG5cblx0XHRjb25zdCBoYXNDaGlsZHJlbiA9IGVsZW1lbnQuaGFzQ2hpbGRyZW47XG5cdFx0cmV0dXJuIGhhc0NoaWxkcmVuO1xuXHR9XG5cblx0Z2V0Q2hpbGRyZW4oZWxlbWVudDogUmVuZGVyYWJsZU1hdGNoIHwgSVNlYXJjaFJlc3VsdCk6IEl0ZXJhYmxlPFJlbmRlcmFibGVNYXRjaD4gfCBQcm9taXNlPEl0ZXJhYmxlPFJlbmRlcmFibGVNYXRjaD4+IHtcblx0XHRpZiAoaXNTZWFyY2hSZXN1bHQoZWxlbWVudCkpIHtcblx0XHRcdHJldHVybiB0aGlzLmNyZWF0ZVNlYXJjaFJlc3VsdEl0ZXJhdG9yKGVsZW1lbnQpO1xuXHRcdH0gZWxzZSBpZiAoaXNUZXh0U2VhcmNoSGVhZGluZyhlbGVtZW50KSkge1xuXHRcdFx0aWYgKGVsZW1lbnQuaXNBSUNvbnRyaWJ1dGVkICYmICghdGhpcy5zZWFyY2hWaWV3Lm1vZGVsLmhhc0FJUmVzdWx0cyB8fCAhIXRoaXMuc2VhcmNoVmlldy5fcGVuZGluZ1NlbWFudGljU2VhcmNoUHJvbWlzZSkpIHtcblx0XHRcdFx0aWYgKHRoaXMuc2VhcmNoVmlldy5jYWNoZWRSZXN1bHRzKSB7XG5cdFx0XHRcdFx0cmV0dXJuIHRoaXMuY3JlYXRlVGV4dFNlYXJjaFJlc3VsdEl0ZXJhdG9yKGVsZW1lbnQpO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHRoaXMuc2VhcmNoVmlldy5hZGRBSVJlc3VsdHMoKTtcblx0XHRcdFx0cmV0dXJuIG5ldyBQcm9taXNlPEl0ZXJhYmxlPFJlbmRlcmFibGVNYXRjaD4+KHJlc29sdmUgPT4ge1xuXHRcdFx0XHRcdGNvbnN0IGRpc3Bvc2FibGUgPSBlbGVtZW50Lm9uQ2hhbmdlKCgpID0+IHtcblx0XHRcdFx0XHRcdGRpc3Bvc2FibGUuZGlzcG9zZSgpOyAvLyBDbGVhbiB1cCBsaXN0ZW5lciBhZnRlciBmaXJzdCByZXN1bHRcblx0XHRcdFx0XHRcdHJlc29sdmUodGhpcy5jcmVhdGVUZXh0U2VhcmNoUmVzdWx0SXRlcmF0b3IoZWxlbWVudCkpO1xuXHRcdFx0XHRcdH0pO1xuXHRcdFx0XHR9KTtcblx0XHRcdH1cblx0XHRcdHJldHVybiB0aGlzLmNyZWF0ZVRleHRTZWFyY2hSZXN1bHRJdGVyYXRvcihlbGVtZW50KTtcblx0XHR9IGVsc2UgaWYgKGlzU2VhcmNoVHJlZUZvbGRlck1hdGNoKGVsZW1lbnQpKSB7XG5cdFx0XHRyZXR1cm4gdGhpcy5jcmVhdGVGb2xkZXJJdGVyYXRvcihlbGVtZW50KTtcblx0XHR9IGVsc2UgaWYgKGlzU2VhcmNoVHJlZUZpbGVNYXRjaChlbGVtZW50KSkge1xuXHRcdFx0cmV0dXJuIHRoaXMuY3JlYXRlRmlsZUl0ZXJhdG9yKGVsZW1lbnQpO1xuXHRcdH1cblxuXHRcdHJldHVybiBbXTtcblxuXHR9XG5cdGdldFBhcmVudChlbGVtZW50OiBSZW5kZXJhYmxlTWF0Y2gpOiBSZW5kZXJhYmxlTWF0Y2gge1xuXHRcdGNvbnN0IHBhcmVudCA9IGVsZW1lbnQucGFyZW50KCk7XG5cdFx0aWYgKGlzU2VhcmNoUmVzdWx0KHBhcmVudCkpIHtcblx0XHRcdHRocm93IG5ldyBFcnJvcignSW52YWxpZCBlbGVtZW50IHBhc3NlZCB0byBnZXRQYXJlbnQnKTtcblx0XHR9XG5cdFx0cmV0dXJuIHBhcmVudDtcblx0fVxufVxuXG5jbGFzcyBSZWZyZXNoVHJlZUNvbnRyb2xsZXIgZXh0ZW5kcyBEaXNwb3NhYmxlIHtcblxuXHRwcml2YXRlIHJlZnJlc2hUcmVlVGhyb3R0bGVyOiBUaHJvdHRsZXI7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0cHJpdmF0ZSByZWFkb25seSBzZWFyY2hWaWV3OiBTZWFyY2hWaWV3LFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgZ2VTZWFyY2hDb25maWc6ICgpID0+IElTZWFyY2hDb25maWd1cmF0aW9uUHJvcGVydGllcyxcblx0XHRASUZpbGVTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgZmlsZVNlcnZpY2U6IElGaWxlU2VydmljZSxcblx0KSB7XG5cdFx0c3VwZXIoKTtcblx0XHR0aGlzLnJlZnJlc2hUcmVlVGhyb3R0bGVyID0gdGhpcy5fcmVnaXN0ZXIobmV3IFRocm90dGxlcigpKTtcblx0fVxuXG5cdHByaXZhdGUgcXVldWVkSUNoYW5nZUV2ZW50czogSUNoYW5nZUV2ZW50W10gPSBbXTtcblxuXHRwdWJsaWMgY2xlYXJBbGxQZW5kaW5nKCk6IHZvaWQge1xuXHRcdHRoaXMuc2VhcmNoVmlldy5nZXRDb250cm9sKCkuY2FuY2VsQWxsUmVmcmVzaFByb21pc2VzKHRydWUpO1xuXHR9XG5cblx0cHVibGljIGFzeW5jIHF1ZXVlKGU/OiBJQ2hhbmdlRXZlbnQpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRpZiAoZSkge1xuXHRcdFx0dGhpcy5xdWV1ZWRJQ2hhbmdlRXZlbnRzLnB1c2goZSk7XG5cdFx0fVxuXHRcdHJldHVybiB0aGlzLnJlZnJlc2hUcmVlVGhyb3R0bGVyLnF1ZXVlKHRoaXMucmVmcmVzaFRyZWVVc2luZ1F1ZXVlLmJpbmQodGhpcykpO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyByZWZyZXNoVHJlZVVzaW5nUXVldWUoKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3QgYWdncmVnYXRlQ2hhbmdlRXZlbnQ6IElDaGFuZ2VFdmVudCB8IHVuZGVmaW5lZCA9IHRoaXMucXVldWVkSUNoYW5nZUV2ZW50cy5sZW5ndGggPT09IDAgPyB1bmRlZmluZWQgOiB7XG5cdFx0XHRlbGVtZW50czogdGhpcy5xdWV1ZWRJQ2hhbmdlRXZlbnRzLm1hcChlID0+IGUuZWxlbWVudHMpLmZsYXQoKSxcblx0XHRcdGFkZGVkOiB0aGlzLnF1ZXVlZElDaGFuZ2VFdmVudHMuc29tZShlID0+IGUuYWRkZWQpLFxuXHRcdFx0cmVtb3ZlZDogdGhpcy5xdWV1ZWRJQ2hhbmdlRXZlbnRzLnNvbWUoZSA9PiBlLnJlbW92ZWQpLFxuXHRcdFx0Y2xlYXJpbmdBbGw6IHRoaXMucXVldWVkSUNoYW5nZUV2ZW50cy5zb21lKGUgPT4gZS5jbGVhcmluZ0FsbCksXG5cdFx0fTtcblx0XHR0aGlzLnF1ZXVlZElDaGFuZ2VFdmVudHMgPSBbXTtcblx0XHRyZXR1cm4gdGhpcy5yZWZyZXNoVHJlZShhZ2dyZWdhdGVDaGFuZ2VFdmVudCk7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIHJldHJpZXZlRmlsZVN0YXRzKCk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGNvbnN0IGZpbGVzID0gdGhpcy5zZWFyY2hWaWV3Lm1vZGVsLnNlYXJjaFJlc3VsdC5tYXRjaGVzKCkuZmlsdGVyKGYgPT4gIWYuZmlsZVN0YXQpLm1hcChmID0+IGYucmVzb2x2ZUZpbGVTdGF0KHRoaXMuZmlsZVNlcnZpY2UpKTtcblx0XHRhd2FpdCBQcm9taXNlLmFsbChmaWxlcyk7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIHJlZnJlc2hUcmVlKGV2ZW50PzogSUNoYW5nZUV2ZW50KTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3Qgc2VhcmNoQ29uZmlnID0gdGhpcy5nZVNlYXJjaENvbmZpZygpO1xuXHRcdGlmICghZXZlbnQgfHwgZXZlbnQuYWRkZWQgfHwgZXZlbnQucmVtb3ZlZCkge1xuXHRcdFx0Ly8gUmVmcmVzaCB3aG9sZSB0cmVlXG5cdFx0XHRpZiAoc2VhcmNoQ29uZmlnLnNvcnRPcmRlciA9PT0gU2VhcmNoU29ydE9yZGVyLk1vZGlmaWVkKSB7XG5cdFx0XHRcdC8vIEVuc3VyZSBhbGwgbWF0Y2hlcyBoYXZlIHJldHJpZXZlZCB0aGVpciBmaWxlIHN0YXRcblx0XHRcdFx0YXdhaXQgdGhpcy5yZXRyaWV2ZUZpbGVTdGF0cygpXG5cdFx0XHRcdFx0LnRoZW4oKCkgPT4gdGhpcy5zZWFyY2hWaWV3LmdldENvbnRyb2woKS51cGRhdGVDaGlsZHJlbih1bmRlZmluZWQpKTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdGF3YWl0IHRoaXMuc2VhcmNoVmlldy5nZXRDb250cm9sKCkudXBkYXRlQ2hpbGRyZW4odW5kZWZpbmVkKTtcblx0XHRcdH1cblx0XHR9IGVsc2Uge1xuXHRcdFx0Ly8gSWYgdXBkYXRlZCBjb3VudHMgYWZmZWN0IG91ciBzZWFyY2ggb3JkZXIsIHJlLXNvcnQgdGhlIHZpZXcuXG5cdFx0XHRpZiAoc2VhcmNoQ29uZmlnLnNvcnRPcmRlciA9PT0gU2VhcmNoU29ydE9yZGVyLkNvdW50QXNjZW5kaW5nIHx8XG5cdFx0XHRcdHNlYXJjaENvbmZpZy5zb3J0T3JkZXIgPT09IFNlYXJjaFNvcnRPcmRlci5Db3VudERlc2NlbmRpbmcpIHtcblxuXHRcdFx0XHRhd2FpdCB0aGlzLnNlYXJjaFZpZXcuZ2V0Q29udHJvbCgpLnVwZGF0ZUNoaWxkcmVuKHVuZGVmaW5lZCk7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRjb25zdCB0cmVlSGFzQWxsRWxlbWVudHMgPSBldmVudC5lbGVtZW50cy5ldmVyeShlbGVtID0+IHRoaXMuc2VhcmNoVmlldy5nZXRDb250cm9sKCkuaGFzTm9kZShlbGVtKSk7XG5cdFx0XHRcdGlmICh0cmVlSGFzQWxsRWxlbWVudHMpIHtcblx0XHRcdFx0XHQvLyBJRmlsZU1hdGNoSW5zdGFuY2UgbW9kaWZpZWQsIHJlZnJlc2ggdGhvc2UgZWxlbWVudHNcblx0XHRcdFx0XHRhd2FpdCBQcm9taXNlLmFsbChldmVudC5lbGVtZW50cy5tYXAoYXN5bmMgZWxlbWVudCA9PiB7XG5cdFx0XHRcdFx0XHRhd2FpdCB0aGlzLnNlYXJjaFZpZXcuZ2V0Q29udHJvbCgpLnVwZGF0ZUNoaWxkcmVuKGVsZW1lbnQpO1xuXHRcdFx0XHRcdFx0dGhpcy5zZWFyY2hWaWV3LmdldENvbnRyb2woKS5yZXJlbmRlcihlbGVtZW50KTtcblx0XHRcdFx0XHR9KSk7XG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0dGhpcy5zZWFyY2hWaWV3LmdldENvbnRyb2woKS51cGRhdGVDaGlsZHJlbih1bmRlZmluZWQpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG59XG4iXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7OztBQUtBLFlBQVksU0FBUztBQUNyQixTQUFTLDZCQUE2QjtBQUN0QyxZQUFZLFVBQVU7QUFDdEIsU0FBUyxtQkFBbUI7QUFFNUIsU0FBa0Qsc0NBQXNDO0FBQ3hGLFNBQVMsU0FBUyxrQkFBa0IsaUJBQWlCO0FBQ3JELFlBQVksWUFBWTtBQUN4QixTQUFTLGFBQWE7QUFDdEIsU0FBUyxTQUFTLGNBQWM7QUFDaEMsU0FBUyxZQUFZLGVBQWUsaUJBQThCLHlCQUF5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
