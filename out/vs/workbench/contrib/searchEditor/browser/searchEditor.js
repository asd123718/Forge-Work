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
import { alert } from "../../../../base/browser/ui/aria/aria.js";
import { Delayer } from "../../../../base/common/async.js";
import { KeyCode, KeyMod } from "../../../../base/common/keyCodes.js";
import { DisposableStore } from "../../../../base/common/lifecycle.js";
import { assertReturnsDefined } from "../../../../base/common/types.js";
import "./media/searchEditor.css";
import { Position } from "../../../../editor/common/core/position.js";
import { Range } from "../../../../editor/common/core/range.js";
import { Selection } from "../../../../editor/common/core/selection.js";
import { IModelService } from "../../../../editor/common/services/model.js";
import { ITextResourceConfigurationService } from "../../../../editor/common/services/textResourceConfiguration.js";
import { ReferencesController } from "../../../../editor/contrib/gotoSymbol/browser/peek/referencesController.js";
import { localize } from "../../../../nls.js";
import { ICommandService } from "../../../../platform/commands/common/commands.js";
import { IConfigurationService } from "../../../../platform/configuration/common/configuration.js";
import { IContextKeyService } from "../../../../platform/contextkey/common/contextkey.js";
import { IContextViewService } from "../../../../platform/contextview/browser/contextView.js";
import { IInstantiationService } from "../../../../platform/instantiation/common/instantiation.js";
import { ServiceCollection } from "../../../../platform/instantiation/common/serviceCollection.js";
import { ILabelService } from "../../../../platform/label/common/label.js";
import { IEditorProgressService, LongRunningOperation } from "../../../../platform/progress/common/progress.js";
import { IStorageService } from "../../../../platform/storage/common/storage.js";
import { ITelemetryService } from "../../../../platform/telemetry/common/telemetry.js";
import { inputBorder, registerColor } from "../../../../platform/theme/common/colorRegistry.js";
import { IThemeService } from "../../../../platform/theme/common/themeService.js";
import { ThemeIcon } from "../../../../base/common/themables.js";
import { IWorkspaceContextService } from "../../../../platform/workspace/common/workspace.js";
import { AbstractTextCodeEditor } from "../../../browser/parts/editor/textCodeEditor.js";
import { EditorInputCapabilities } from "../../../common/editor.js";
import { ExcludePatternInputWidget, IncludePatternInputWidget } from "../../search/browser/patternInputWidget.js";
import { SearchWidget } from "../../search/browser/searchWidget.js";
import { QueryBuilder } from "../../../services/search/common/queryBuilder.js";
import { getOutOfWorkspaceEditorResources } from "../../search/common/search.js";
import { SearchModelImpl } from "../../search/browser/searchTreeModel/searchModel.js";
import { InSearchEditor, SearchEditorID, SearchEditorInputTypeId } from "./constants.js";
import { serializeSearchResultForEditor } from "./searchEditorSerialization.js";
import { IEditorGroupsService } from "../../../services/editor/common/editorGroupsService.js";
import { IEditorService } from "../../../services/editor/common/editorService.js";
import { SearchSortOrder } from "../../../services/search/common/search.js";
import { searchDetailsIcon } from "../../search/browser/searchIcons.js";
import { IFileService } from "../../../../platform/files/common/files.js";
import { IOpenerService } from "../../../../platform/opener/common/opener.js";
import { INotificationService } from "../../../../platform/notification/common/notification.js";
import { renderSearchMessage } from "../../search/browser/searchMessage.js";
import { EditorExtensionsRegistry } from "../../../../editor/browser/editorExtensions.js";
import { UnusualLineTerminatorsDetector } from "../../../../editor/contrib/unusualLineTerminators/browser/unusualLineTerminators.js";
import { defaultToggleStyles, getInputBoxStyle } from "../../../../platform/theme/browser/defaultStyles.js";
import { ILogService } from "../../../../platform/log/common/log.js";
import { SearchContext } from "../../search/common/constants.js";
import { getDefaultHoverDelegate } from "../../../../base/browser/ui/hover/hoverDelegateFactory.js";
import { IHoverService } from "../../../../platform/hover/browser/hover.js";
const RESULT_LINE_REGEX = /^(\s+)(\d+)(: |  )(\s*)(.*)$/;
const FILE_LINE_REGEX = /^(\S.*):$/;
let SearchEditor = class extends AbstractTextCodeEditor {
  constructor(group, telemetryService, themeService, storageService, modelService, contextService, labelService, instantiationService, contextViewService, commandService, openerService, notificationService, progressService, textResourceService, editorGroupService, editorService, configurationService, fileService, logService, hoverService) {
    super(SearchEditor.ID, group, telemetryService, instantiationService, storageService, textResourceService, themeService, editorService, editorGroupService, fileService);
    this.modelService = modelService;
    this.contextService = contextService;
    this.labelService = labelService;
    this.contextViewService = contextViewService;
    this.commandService = commandService;
    this.openerService = openerService;
    this.notificationService = notificationService;
    this.configurationService = configurationService;
    this.logService = logService;
    this.hoverService = hoverService;
    this.runSearchDelayer = this._register(new Delayer(0));
    this.pauseSearching = false;
    this.showingIncludesExcludes = false;
    this.ongoingOperations = 0;
    this.updatingModelForSearch = false;
    this.container = DOM.$(".search-editor");
    this.searchOperation = this._register(new LongRunningOperation(progressService));
    this._register(this.messageDisposables = new DisposableStore());
    this.searchHistoryDelayer = this._register(new Delayer(2e3));
    this.searchModel = this._register(this.instantiationService.createInstance(SearchModelImpl));
  }
  get searchResultEditor() {
    return this.editorControl;
  }
  createEditor(parent) {
    DOM.append(parent, this.container);
    this.queryEditorContainer = DOM.append(this.container, DOM.$(".query-container"));
    const searchResultContainer = DOM.append(this.container, DOM.$(".search-results"));
    super.createEditor(searchResultContainer);
    this.registerEditorListeners();
    const scopedContextKeyService = assertReturnsDefined(this.scopedContextKeyService);
    InSearchEditor.bindTo(scopedContextKeyService).set(true);
    this.createQueryEditor(
      this.queryEditorContainer,
      this._register(this.instantiationService.createChild(new ServiceCollection([IContextKeyService, scopedContextKeyService]))),
      SearchContext.InputBoxFocusedKey.bindTo(scopedContextKeyService)
    );
  }
  createQueryEditor(container, scopedInstantiationService, inputBoxFocusedContextKey) {
    const searchEditorInputboxStyles = getInputBoxStyle({ inputBorder: searchEditorTextInputBorder });
    this.queryEditorWidget = this._register(scopedInstantiationService.createInstance(SearchWidget, container, { _hideReplaceToggle: true, showContextToggle: true, inputBoxStyles: searchEditorInputboxStyles, toggleStyles: defaultToggleStyles }));
    this._register(this.queryEditorWidget.onReplaceToggled(() => this.reLayout()));
    this._register(this.queryEditorWidget.onDidHeightChange(() => this.reLayout()));
    this._register(this.queryEditorWidget.onSearchSubmit(({ delay }) => this.triggerSearch({ delay })));
    if (this.queryEditorWidget.searchInput) {
      this._register(this.queryEditorWidget.searchInput.onDidOptionChange(() => this.triggerSearch({ resetCursor: false })));
    } else {
      this.logService.warn("SearchEditor: SearchWidget.searchInput is undefined, cannot register onDidOptionChange listener");
    }
    this._register(this.queryEditorWidget.onDidToggleContext(() => this.triggerSearch({ resetCursor: false })));
    this.includesExcludesContainer = DOM.append(container, DOM.$(".includes-excludes"));
    const toggleQueryDetailsLabel = localize("moreSearch", "Toggle Search Details");
    this.toggleQueryDetailsButton = DOM.append(this.includesExcludesContainer, DOM.$(".expand" + ThemeIcon.asCSSSelector(searchDetailsIcon), { tabindex: 0, role: "button", "aria-label": toggleQueryDetailsLabel }));
    this._register(this.hoverService.setupManagedHover(getDefaultHoverDelegate("element"), this.toggleQueryDetailsButton, toggleQueryDetailsLabel));
    this._register(DOM.addDisposableListener(this.toggleQueryDetailsButton, DOM.EventType.CLICK, (e) => {
      DOM.EventHelper.stop(e);
      this.toggleIncludesExcludes();
    }));
    this._register(DOM.addDisposableListener(this.toggleQueryDetailsButton, DOM.EventType.KEY_UP, (e) => {
      const event = new StandardKeyboardEvent(e);
      if (event.equals(KeyCode.Enter) || event.equals(KeyCode.Space)) {
        DOM.EventHelper.stop(e);
        this.toggleIncludesExcludes();
      }
    }));
    this._register(DOM.addDisposableListener(this.toggleQueryDetailsButton, DOM.EventType.KEY_DOWN, (e) => {
      const event = new StandardKeyboardEvent(e);
      if (event.equals(KeyMod.Shift | KeyCode.Tab)) {
        if (this.queryEditorWidget.isReplaceActive()) {
          this.queryEditorWidget.focusReplaceAllAction();
        } else {
          this.queryEditorWidget.isReplaceShown() ? this.queryEditorWidget.replaceInput?.focusOnPreserve() : this.queryEditorWidget.focusRegexAction();
        }
        DOM.EventHelper.stop(e);
      }
    }));
    const folderIncludesList = DOM.append(this.includesExcludesContainer, DOM.$(".file-types.includes"));
    const filesToIncludeTitle = localize("searchScope.includes", "files to include");
    DOM.append(folderIncludesList, DOM.$("h4", void 0, filesToIncludeTitle));
    this.inputPatternIncludes = this._register(scopedInstantiationService.createInstance(IncludePatternInputWidget, folderIncludesList, this.contextViewService, {
      ariaLabel: localize("label.includes", "Search Include Patterns"),
      inputBoxStyles: searchEditorInputboxStyles
    }));
    this._register(this.inputPatternIncludes.onSubmit((triggeredOnType) => this.triggerSearch({ resetCursor: false, delay: triggeredOnType ? this.searchConfig.searchOnTypeDebouncePeriod : 0 })));
    this._register(this.inputPatternIncludes.onChangeSearchInEditorsBox(() => this.triggerSearch()));
    const excludesList = DOM.append(this.includesExcludesContainer, DOM.$(".file-types.excludes"));
    const excludesTitle = localize("searchScope.excludes", "files to exclude");
    DOM.append(excludesList, DOM.$("h4", void 0, excludesTitle));
    this.inputPatternExcludes = this._register(scopedInstantiationService.createInstance(ExcludePatternInputWidget, excludesList, this.contextViewService, {
      ariaLabel: localize("label.excludes", "Search Exclude Patterns"),
      inputBoxStyles: searchEditorInputboxStyles
    }));
    this._register(this.inputPatternExcludes.onSubmit((triggeredOnType) => this.triggerSearch({ resetCursor: false, delay: triggeredOnType ? this.searchConfig.searchOnTypeDebouncePeriod : 0 })));
    this._register(this.inputPatternExcludes.onChangeIgnoreBox(() => this.triggerSearch()));
    this.messageBox = DOM.append(container, DOM.$(".messages.text-search-provider-messages"));
    [this.queryEditorWidget.searchInputFocusTracker, this.queryEditorWidget.replaceInputFocusTracker, this.inputPatternExcludes.inputFocusTracker, this.inputPatternIncludes.inputFocusTracker].forEach((tracker) => {
      if (!tracker) {
        return;
      }
      this._register(tracker.onDidFocus(() => setTimeout(() => inputBoxFocusedContextKey.set(true), 0)));
      this._register(tracker.onDidBlur(() => inputBoxFocusedContextKey.set(false)));
    });
  }
  toggleRunAgainMessage(show) {
    DOM.clearNode(this.messageBox);
    this.messageDisposables.clear();
    if (show) {
      const runAgainLink = DOM.append(this.messageBox, DOM.$("a.pointer.prominent.message", {}, localize("runSearch", "Run Search")));
      this.messageDisposables.add(DOM.addDisposableListener(runAgainLink, DOM.EventType.CLICK, async () => {
        await this.triggerSearch();
        this.searchResultEditor.focus();
      }));
    }
  }
  _getContributions() {
    const skipContributions = [UnusualLineTerminatorsDetector.ID];
    return EditorExtensionsRegistry.getEditorContributions().filter((c) => skipContributions.indexOf(c.id) === -1);
  }
  getCodeEditorWidgetOptions() {
    return { contributions: this._getContributions() };
  }
  registerEditorListeners() {
    this._register(this.searchResultEditor.onMouseUp((e) => {
      if (e.event.detail === 1) {
        const behaviour = this.searchConfig.searchEditor.singleClickBehaviour;
        const position = e.target.position;
        if (position && behaviour === "peekDefinition") {
          const line = this.searchResultEditor.getModel()?.getLineContent(position.lineNumber) ?? "";
          if (line.match(FILE_LINE_REGEX) || line.match(RESULT_LINE_REGEX)) {
            this.searchResultEditor.setSelection(Range.fromPositions(position));
            this.commandService.executeCommand("editor.action.peekDefinition");
          }
        }
      } else if (e.event.detail === 2) {
        const behaviour = this.searchConfig.searchEditor.doubleClickBehaviour;
        const position = e.target.position;
        if (position && behaviour !== "selectWord") {
          const line = this.searchResultEditor.getModel()?.getLineContent(position.lineNumber) ?? "";
          if (line.match(RESULT_LINE_REGEX)) {
            this.searchResultEditor.setSelection(Range.fromPositions(position));
            this.commandService.executeCommand(behaviour === "goToLocation" ? "editor.action.goToDeclaration" : "editor.action.openDeclarationToTheSide");
          } else if (line.match(FILE_LINE_REGEX)) {
            this.searchResultEditor.setSelection(Range.fromPositions(position));
            this.commandService.executeCommand("editor.action.peekDefinition");
          }
        }
      }
    }));
    this._register(this.searchResultEditor.onDidChangeModelContent(() => {
      if (!this.updatingModelForSearch) {
        this.getInput()?.setDirty(true);
      }
    }));
  }
  getControl() {
    return this.searchResultEditor;
  }
  focus() {
    super.focus();
    const viewState = this.loadEditorViewState(this.getInput());
    if (viewState && viewState.focused === "editor") {
      this.searchResultEditor.focus();
    } else {
      this.queryEditorWidget.focus();
    }
  }
  focusSearchInput() {
    this.queryEditorWidget.searchInput?.focus();
  }
  focusFilesToIncludeInput() {
    if (!this.showingIncludesExcludes) {
      this.toggleIncludesExcludes(true);
    }
    this.inputPatternIncludes.focus();
  }
  focusFilesToExcludeInput() {
    if (!this.showingIncludesExcludes) {
      this.toggleIncludesExcludes(true);
    }
    this.inputPatternExcludes.focus();
  }
  focusNextInput() {
    if (this.queryEditorWidget.searchInputHasFocus()) {
      if (this.showingIncludesExcludes) {
        this.inputPatternIncludes.focus();
      } else {
        this.searchResultEditor.focus();
      }
    } else if (this.inputPatternIncludes.inputHasFocus()) {
      this.inputPatternExcludes.focus();
    } else if (this.inputPatternExcludes.inputHasFocus()) {
      this.searchResultEditor.focus();
    } else if (this.searchResultEditor.hasWidgetFocus()) {
    }
  }
  focusPrevInput() {
    if (this.queryEditorWidget.searchInputHasFocus()) {
      this.searchResultEditor.focus();
    } else if (this.inputPatternIncludes.inputHasFocus()) {
      this.queryEditorWidget.searchInput?.focus();
    } else if (this.inputPatternExcludes.inputHasFocus()) {
      this.inputPatternIncludes.focus();
    } else if (this.searchResultEditor.hasWidgetFocus()) {
    }
  }
  setQuery(query) {
    this.queryEditorWidget.searchInput?.setValue(query);
  }
  selectQuery() {
    this.queryEditorWidget.searchInput?.select();
  }
  toggleWholeWords() {
    this.queryEditorWidget.searchInput?.setWholeWords(!this.queryEditorWidget.searchInput.getWholeWords());
    this.triggerSearch({ resetCursor: false });
  }
  toggleRegex() {
    this.queryEditorWidget.searchInput?.setRegex(!this.queryEditorWidget.searchInput.getRegex());
    this.triggerSearch({ resetCursor: false });
  }
  toggleCaseSensitive() {
    this.queryEditorWidget.searchInput?.setCaseSensitive(!this.queryEditorWidget.searchInput.getCaseSensitive());
    this.triggerSearch({ resetCursor: false });
  }
  toggleContextLines() {
    this.queryEditorWidget.toggleContextLines();
  }
  modifyContextLines(increase) {
    this.queryEditorWidget.modifyContextLines(increase);
  }
  toggleQueryDetails(shouldShow) {
    this.toggleIncludesExcludes(shouldShow);
  }
  deleteResultBlock() {
    const linesToDelete = /* @__PURE__ */ new Set();
    const selections = this.searchResultEditor.getSelections();
    const model = this.searchResultEditor.getModel();
    if (!(selections && model)) {
      return;
    }
    const maxLine = model.getLineCount();
    const minLine = 1;
    const deleteUp = (start) => {
      for (let cursor = start; cursor >= minLine; cursor--) {
        const line = model.getLineContent(cursor);
        linesToDelete.add(cursor);
        if (line[0] !== void 0 && line[0] !== " ") {
          break;
        }
      }
    };
    const deleteDown = (start) => {
      linesToDelete.add(start);
      for (let cursor = start + 1; cursor <= maxLine; cursor++) {
        const line = model.getLineContent(cursor);
        if (line[0] !== void 0 && line[0] !== " ") {
          return cursor;
        }
        linesToDelete.add(cursor);
      }
      return;
    };
    const endingCursorLines = [];
    for (const selection of selections) {
      const lineNumber = selection.startLineNumber;
      endingCursorLines.push(deleteDown(lineNumber));
      deleteUp(lineNumber);
      for (let inner = selection.startLineNumber; inner <= selection.endLineNumber; inner++) {
        linesToDelete.add(inner);
      }
    }
    if (endingCursorLines.length === 0) {
      endingCursorLines.push(1);
    }
    const isDefined = (x) => x !== void 0;
    model.pushEditOperations(
      this.searchResultEditor.getSelections(),
      [...linesToDelete].map((line) => ({ range: new Range(line, 1, line + 1, 1), text: "" })),
      () => endingCursorLines.filter(isDefined).map((line) => new Selection(line, 1, line, 1))
    );
  }
  cleanState() {
    this.getInput()?.setDirty(false);
  }
  get searchConfig() {
    return this.configurationService.getValue("search");
  }
  iterateThroughMatches(reverse) {
    const model = this.searchResultEditor.getModel();
    if (!model) {
      return;
    }
    const lastLine = model.getLineCount() ?? 1;
    const lastColumn = model.getLineLength(lastLine);
    const fallbackStart = reverse ? new Position(lastLine, lastColumn) : new Position(1, 1);
    const currentPosition = this.searchResultEditor.getSelection()?.getStartPosition() ?? fallbackStart;
    const matchRanges = this.getInput()?.getMatchRanges();
    if (!matchRanges) {
      return;
    }
    const matchRange = (reverse ? findPrevRange : findNextRange)(matchRanges, currentPosition);
    if (!matchRange) {
      return;
    }
    this.searchResultEditor.setSelection(matchRange);
    this.searchResultEditor.revealLineInCenterIfOutsideViewport(matchRange.startLineNumber);
    this.searchResultEditor.focus();
    const matchLineText = model.getLineContent(matchRange.startLineNumber);
    const matchText = model.getValueInRange(matchRange);
    let file = "";
    for (let line = matchRange.startLineNumber; line >= 1; line--) {
      const lineText = model.getValueInRange(new Range(line, 1, line, 2));
      if (lineText !== " ") {
        file = model.getLineContent(line);
        break;
      }
    }
    alert(localize("searchResultItem", "Matched {0} at {1} in file {2}", matchText, matchLineText, file.slice(0, file.length - 1)));
  }
  focusNextResult() {
    this.iterateThroughMatches(false);
  }
  focusPreviousResult() {
    this.iterateThroughMatches(true);
  }
  focusAllResults() {
    this.searchResultEditor.setSelections((this.getInput()?.getMatchRanges() ?? []).map(
      (range) => new Selection(range.startLineNumber, range.startColumn, range.endLineNumber, range.endColumn)
    ));
    this.searchResultEditor.focus();
  }
  async triggerSearch(_options) {
    const focusResults = this.searchConfig.searchEditor.focusResultsOnSearch;
    if (_options === void 0) {
      _options = { focusResults };
    } else if (_options.focusResults === void 0) {
      _options.focusResults = focusResults;
    }
    const options = { resetCursor: true, delay: 0, ..._options };
    if (!this.queryEditorWidget.searchInput?.inputBox.isInputValid()) {
      return;
    }
    if (!this.pauseSearching) {
      await this.runSearchDelayer.trigger(async () => {
        this.toggleRunAgainMessage(false);
        await this.doRunSearch();
        if (options.resetCursor) {
          this.searchResultEditor.setPosition(new Position(1, 1));
          this.searchResultEditor.setScrollPosition({ scrollTop: 0, scrollLeft: 0 });
        }
        if (options.focusResults) {
          this.searchResultEditor.focus();
        }
      }, options.delay);
    }
  }
  readConfigFromWidget() {
    return {
      isCaseSensitive: this.queryEditorWidget.searchInput?.getCaseSensitive() ?? false,
      contextLines: this.queryEditorWidget.getContextLines(),
      filesToExclude: this.inputPatternExcludes.getValue(),
      filesToInclude: this.inputPatternIncludes.getValue(),
      query: this.queryEditorWidget.searchInput?.getValue() ?? "",
      isRegexp: this.queryEditorWidget.searchInput?.getRegex() ?? false,
      matchWholeWord: this.queryEditorWidget.searchInput?.getWholeWords() ?? false,
      useExcludeSettingsAndIgnoreFiles: this.inputPatternExcludes.useExcludesAndIgnoreFiles(),
      onlyOpenEditors: this.inputPatternIncludes.onlySearchInOpenEditors(),
      showIncludesExcludes: this.showingIncludesExcludes,
      notebookSearchConfig: {
        includeMarkupInput: this.queryEditorWidget.getNotebookFilters().markupInput,
        includeMarkupPreview: this.queryEditorWidget.getNotebookFilters().markupPreview,
        includeCodeInput: this.queryEditorWidget.getNotebookFilters().codeInput,
        includeOutput: this.queryEditorWidget.getNotebookFilters().codeOutput
      }
    };
  }
  async doRunSearch() {
    this.searchModel.cancelSearch(true);
    const startInput = this.getInput();
    if (!startInput) {
      return;
    }
    this.searchHistoryDelayer.trigger(() => {
      this.queryEditorWidget.searchInput?.onSearchSubmit();
      this.inputPatternExcludes.onSearchSubmit();
      this.inputPatternIncludes.onSearchSubmit();
    });
    const config = this.readConfigFromWidget();
    if (!config.query) {
      return;
    }
    const content = {
      pattern: config.query,
      isRegExp: config.isRegexp,
      isCaseSensitive: config.isCaseSensitive,
      isWordMatch: config.matchWholeWord
    };
    const options = {
      _reason: "searchEditor",
      extraFileResources: this.instantiationService.invokeFunction(getOutOfWorkspaceEditorResources),
      maxResults: this.searchConfig.maxResults ?? void 0,
      disregardIgnoreFiles: !config.useExcludeSettingsAndIgnoreFiles || void 0,
      disregardExcludeSettings: !config.useExcludeSettingsAndIgnoreFiles || void 0,
      excludePattern: [{ pattern: config.filesToExclude }],
      includePattern: config.filesToInclude,
      onlyOpenEditors: config.onlyOpenEditors,
      previewOptions: {
        matchLines: 1,
        charsPerLine: 1e3
      },
      surroundingContext: config.contextLines,
      isSmartCase: this.searchConfig.smartCase,
      expandPatterns: true,
      notebookSearchConfig: {
        includeMarkupInput: config.notebookSearchConfig.includeMarkupInput,
        includeMarkupPreview: config.notebookSearchConfig.includeMarkupPreview,
        includeCodeInput: config.notebookSearchConfig.includeCodeInput,
        includeOutput: config.notebookSearchConfig.includeOutput
      }
    };
    const folderResources = this.contextService.getWorkspace().folders;
    let query;
    try {
      const queryBuilder = this.instantiationService.createInstance(QueryBuilder);
      query = queryBuilder.text(content, folderResources.map((folder) => folder.uri), options);
    } catch (err) {
      return;
    }
    this.searchOperation.start(500);
    this.ongoingOperations++;
    const { configurationModel } = await startInput.resolveModels();
    configurationModel.updateConfig(config);
    const result = this.searchModel.search(query);
    startInput.ongoingSearchOperation = result.asyncResults.finally(() => {
      this.ongoingOperations--;
      if (this.ongoingOperations === 0) {
        this.searchOperation.stop();
      }
    });
    const searchOperation = await startInput.ongoingSearchOperation;
    await this.onSearchComplete(searchOperation, config, startInput);
  }
  async onSearchComplete(searchOperation, startConfig, startInput) {
    const input = this.getInput();
    if (!input || input !== startInput || JSON.stringify(startConfig) !== JSON.stringify(this.readConfigFromWidget())) {
      return;
    }
    input.ongoingSearchOperation = void 0;
    const sortOrder = this.searchConfig.sortOrder;
    if (sortOrder === SearchSortOrder.Modified) {
      await this.retrieveFileStats(this.searchModel.searchResult);
    }
    const controller = ReferencesController.get(this.searchResultEditor);
    controller?.closeWidget(false);
    const labelFormatter = (uri) => this.labelService.getUriLabel(uri, { relative: true });
    const results = serializeSearchResultForEditor(this.searchModel.searchResult, startConfig.filesToInclude, startConfig.filesToExclude, startConfig.contextLines, labelFormatter, sortOrder, searchOperation?.limitHit);
    const { resultsModel } = await input.resolveModels();
    this.updatingModelForSearch = true;
    this.modelService.updateModel(resultsModel, results.text);
    this.updatingModelForSearch = false;
    if (searchOperation && searchOperation.messages) {
      for (const message of searchOperation.messages) {
        this.addMessage(message);
      }
    }
    this.reLayout();
    input.setDirty(!input.hasCapability(EditorInputCapabilities.Untitled));
    input.setMatchRanges(results.matchRanges);
  }
  addMessage(message) {
    let messageBox;
    if (this.messageBox.firstChild) {
      messageBox = this.messageBox.firstChild;
    } else {
      messageBox = DOM.append(this.messageBox, DOM.$(".message"));
    }
    DOM.append(messageBox, renderSearchMessage(message, this.instantiationService, this.notificationService, this.openerService, this.commandService, this.messageDisposables, () => this.triggerSearch()));
  }
  async retrieveFileStats(searchResult) {
    const files = searchResult.matches().filter((f) => !f.fileStat).map((f) => f.resolveFileStat(this.fileService));
    await Promise.all(files);
  }
  layout(dimension) {
    this.dimension = dimension;
    this.reLayout();
  }
  getSelected() {
    const selection = this.searchResultEditor.getSelection();
    if (selection) {
      return this.searchResultEditor.getModel()?.getValueInRange(selection) ?? "";
    }
    return "";
  }
  reLayout() {
    if (this.dimension) {
      this.queryEditorWidget.setWidth(
        this.dimension.width - 28
        /* container margin */
      );
      this.searchResultEditor.layout({ height: this.dimension.height - DOM.getTotalHeight(this.queryEditorContainer), width: this.dimension.width });
      this.inputPatternExcludes.setWidth(
        this.dimension.width - 28
        /* container margin */
      );
      this.inputPatternIncludes.setWidth(
        this.dimension.width - 28
        /* container margin */
      );
    }
  }
  getInput() {
    return this.input;
  }
  setSearchConfig(config) {
    this.priorConfig = config;
    if (config.query !== void 0) {
      this.queryEditorWidget.setValue(config.query);
    }
    if (config.isCaseSensitive !== void 0) {
      this.queryEditorWidget.searchInput?.setCaseSensitive(config.isCaseSensitive);
    }
    if (config.isRegexp !== void 0) {
      this.queryEditorWidget.searchInput?.setRegex(config.isRegexp);
    }
    if (config.matchWholeWord !== void 0) {
      this.queryEditorWidget.searchInput?.setWholeWords(config.matchWholeWord);
    }
    if (config.contextLines !== void 0) {
      this.queryEditorWidget.setContextLines(config.contextLines);
    }
    if (config.filesToExclude !== void 0) {
      this.inputPatternExcludes.setValue(config.filesToExclude);
    }
    if (config.filesToInclude !== void 0) {
      this.inputPatternIncludes.setValue(config.filesToInclude);
    }
    if (config.onlyOpenEditors !== void 0) {
      this.inputPatternIncludes.setOnlySearchInOpenEditors(config.onlyOpenEditors);
    }
    if (config.useExcludeSettingsAndIgnoreFiles !== void 0) {
      this.inputPatternExcludes.setUseExcludesAndIgnoreFiles(config.useExcludeSettingsAndIgnoreFiles);
    }
    if (config.showIncludesExcludes !== void 0) {
      this.toggleIncludesExcludes(config.showIncludesExcludes);
    }
  }
  async setInput(newInput, options, context, token) {
    await super.setInput(newInput, options, context, token);
    if (token.isCancellationRequested) {
      return;
    }
    const { configurationModel, resultsModel } = await newInput.resolveModels();
    if (token.isCancellationRequested) {
      return;
    }
    this.searchResultEditor.setModel(resultsModel);
    this.pauseSearching = true;
    this.toggleRunAgainMessage(!newInput.ongoingSearchOperation && resultsModel.getLineCount() === 1 && resultsModel.getValueLength() === 0 && configurationModel.config.query !== "");
    this.setSearchConfig(configurationModel.config);
    this._register(configurationModel.onConfigDidUpdate((newConfig) => {
      if (newConfig !== this.priorConfig) {
        this.pauseSearching = true;
        this.setSearchConfig(newConfig);
        this.pauseSearching = false;
      }
    }));
    this.restoreViewState(context);
    if (!options?.preserveFocus) {
      this.focus();
    }
    this.pauseSearching = false;
    if (newInput.ongoingSearchOperation) {
      const existingConfig = this.readConfigFromWidget();
      newInput.ongoingSearchOperation.then((complete) => {
        this.onSearchComplete(complete, existingConfig, newInput);
      });
    }
  }
  toggleIncludesExcludes(_shouldShow) {
    const cls = "expanded";
    const shouldShow = _shouldShow ?? !this.includesExcludesContainer.classList.contains(cls);
    if (shouldShow) {
      this.toggleQueryDetailsButton.setAttribute("aria-expanded", "true");
      this.includesExcludesContainer.classList.add(cls);
    } else {
      this.toggleQueryDetailsButton.setAttribute("aria-expanded", "false");
      this.includesExcludesContainer.classList.remove(cls);
    }
    this.showingIncludesExcludes = this.includesExcludesContainer.classList.contains(cls);
    this.reLayout();
  }
  toEditorViewStateResource(input) {
    if (input.typeId === SearchEditorInputTypeId) {
      return input.modelUri;
    }
    return void 0;
  }
  computeEditorViewState(resource) {
    const control = this.getControl();
    const editorViewState = control.saveViewState();
    if (!editorViewState) {
      return void 0;
    }
    if (resource.toString() !== this.getInput()?.modelUri.toString()) {
      return void 0;
    }
    return { ...editorViewState, focused: this.searchResultEditor.hasWidgetFocus() ? "editor" : "input" };
  }
  tracksEditorViewState(input) {
    return input.typeId === SearchEditorInputTypeId;
  }
  restoreViewState(context) {
    const viewState = this.loadEditorViewState(this.getInput(), context);
    if (viewState) {
      this.searchResultEditor.restoreViewState(viewState);
    }
  }
  getAriaLabel() {
    return this.getInput()?.getName() ?? localize("searchEditor", "Search");
  }
};
SearchEditor.ID = SearchEditorID;
SearchEditor.SEARCH_EDITOR_VIEW_STATE_PREFERENCE_KEY = "searchEditorViewState";
SearchEditor = __decorateClass([
  __decorateParam(1, ITelemetryService),
  __decorateParam(2, IThemeService),
  __decorateParam(3, IStorageService),
  __decorateParam(4, IModelService),
  __decorateParam(5, IWorkspaceContextService),
  __decorateParam(6, ILabelService),
  __decorateParam(7, IInstantiationService),
  __decorateParam(8, IContextViewService),
  __decorateParam(9, ICommandService),
  __decorateParam(10, IOpenerService),
  __decorateParam(11, INotificationService),
  __decorateParam(12, IEditorProgressService),
  __decorateParam(13, ITextResourceConfigurationService),
  __decorateParam(14, IEditorGroupsService),
  __decorateParam(15, IEditorService),
  __decorateParam(16, IConfigurationService),
  __decorateParam(17, IFileService),
  __decorateParam(18, ILogService),
  __decorateParam(19, IHoverService)
], SearchEditor);
const searchEditorTextInputBorder = registerColor("searchEditor.textInputBorder", inputBorder, localize("textInputBoxBorder", "Search editor text input box border."));
function findNextRange(matchRanges, currentPosition) {
  for (const matchRange of matchRanges) {
    if (Position.isBefore(currentPosition, matchRange.getStartPosition())) {
      return matchRange;
    }
  }
  return matchRanges[0];
}
function findPrevRange(matchRanges, currentPosition) {
  for (let i = matchRanges.length - 1; i >= 0; i--) {
    const matchRange = matchRanges[i];
    if (Position.isBefore(matchRange.getStartPosition(), currentPosition)) {
      {
        return matchRange;
      }
    }
  }
  return matchRanges[matchRanges.length - 1];
}
export {
  SearchEditor
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXHNlYXJjaEVkaXRvclxcYnJvd3Nlclxcc2VhcmNoRWRpdG9yLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0ICogYXMgRE9NIGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci9kb20uanMnO1xuaW1wb3J0IHsgU3RhbmRhcmRLZXlib2FyZEV2ZW50IH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL2tleWJvYXJkRXZlbnQuanMnO1xuaW1wb3J0IHsgYWxlcnQgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvdWkvYXJpYS9hcmlhLmpzJztcbmltcG9ydCB7IERlbGF5ZXIgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9hc3luYy5qcyc7XG5pbXBvcnQgeyBDYW5jZWxsYXRpb25Ub2tlbiB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2NhbmNlbGxhdGlvbi5qcyc7XG5pbXBvcnQgeyBLZXlDb2RlLCBLZXlNb2QgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9rZXlDb2Rlcy5qcyc7XG5pbXBvcnQgeyBEaXNwb3NhYmxlU3RvcmUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgYXNzZXJ0UmV0dXJuc0RlZmluZWQgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi90eXBlcy5qcyc7XG5pbXBvcnQgeyBVUkkgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi91cmkuanMnO1xuaW1wb3J0ICcuL21lZGlhL3NlYXJjaEVkaXRvci5jc3MnO1xuaW1wb3J0IHsgSUNvZGVFZGl0b3JXaWRnZXRPcHRpb25zIH0gZnJvbSAnLi4vLi4vLi4vLi4vZWRpdG9yL2Jyb3dzZXIvd2lkZ2V0L2NvZGVFZGl0b3IvY29kZUVkaXRvcldpZGdldC5qcyc7XG5pbXBvcnQgeyBQb3NpdGlvbiB9IGZyb20gJy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vY29yZS9wb3NpdGlvbi5qcyc7XG5pbXBvcnQgeyBSYW5nZSB9IGZyb20gJy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vY29yZS9yYW5nZS5qcyc7XG5pbXBvcnQgeyBTZWxlY3Rpb24gfSBmcm9tICcuLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL2NvcmUvc2VsZWN0aW9uLmpzJztcbmltcG9ydCB7IElDb2RlRWRpdG9yVmlld1N0YXRlIH0gZnJvbSAnLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9lZGl0b3JDb21tb24uanMnO1xuaW1wb3J0IHsgSU1vZGVsU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vc2VydmljZXMvbW9kZWwuanMnO1xuaW1wb3J0IHsgSVRleHRSZXNvdXJjZUNvbmZpZ3VyYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9zZXJ2aWNlcy90ZXh0UmVzb3VyY2VDb25maWd1cmF0aW9uLmpzJztcbmltcG9ydCB7IFJlZmVyZW5jZXNDb250cm9sbGVyIH0gZnJvbSAnLi4vLi4vLi4vLi4vZWRpdG9yL2NvbnRyaWIvZ290b1N5bWJvbC9icm93c2VyL3BlZWsvcmVmZXJlbmNlc0NvbnRyb2xsZXIuanMnO1xuaW1wb3J0IHsgbG9jYWxpemUgfSBmcm9tICcuLi8uLi8uLi8uLi9ubHMuanMnO1xuaW1wb3J0IHsgSUNvbW1hbmRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29tbWFuZHMvY29tbW9uL2NvbW1hbmRzLmpzJztcbmltcG9ydCB7IElDb25maWd1cmF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbmZpZ3VyYXRpb24vY29tbW9uL2NvbmZpZ3VyYXRpb24uanMnO1xuaW1wb3J0IHsgSUNvbnRleHRLZXksIElDb250ZXh0S2V5U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbnRleHRrZXkvY29tbW9uL2NvbnRleHRrZXkuanMnO1xuaW1wb3J0IHsgSUNvbnRleHRWaWV3U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbnRleHR2aWV3L2Jyb3dzZXIvY29udGV4dFZpZXcuanMnO1xuaW1wb3J0IHsgSUluc3RhbnRpYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vaW5zdGFudGlhdGlvbi9jb21tb24vaW5zdGFudGlhdGlvbi5qcyc7XG5pbXBvcnQgeyBTZXJ2aWNlQ29sbGVjdGlvbiB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2luc3RhbnRpYXRpb24vY29tbW9uL3NlcnZpY2VDb2xsZWN0aW9uLmpzJztcbmltcG9ydCB7IElMYWJlbFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9sYWJlbC9jb21tb24vbGFiZWwuanMnO1xuaW1wb3J0IHsgSUVkaXRvclByb2dyZXNzU2VydmljZSwgTG9uZ1J1bm5pbmdPcGVyYXRpb24gfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9wcm9ncmVzcy9jb21tb24vcHJvZ3Jlc3MuanMnO1xuaW1wb3J0IHsgSVN0b3JhZ2VTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vc3RvcmFnZS9jb21tb24vc3RvcmFnZS5qcyc7XG5pbXBvcnQgeyBJVGVsZW1ldHJ5U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3RlbGVtZXRyeS9jb21tb24vdGVsZW1ldHJ5LmpzJztcbmltcG9ydCB7IGlucHV0Qm9yZGVyLCByZWdpc3RlckNvbG9yIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vdGhlbWUvY29tbW9uL2NvbG9yUmVnaXN0cnkuanMnO1xuaW1wb3J0IHsgSVRoZW1lU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3RoZW1lL2NvbW1vbi90aGVtZVNlcnZpY2UuanMnO1xuaW1wb3J0IHsgVGhlbWVJY29uIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdGhlbWFibGVzLmpzJztcbmltcG9ydCB7IElXb3Jrc3BhY2VDb250ZXh0U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3dvcmtzcGFjZS9jb21tb24vd29ya3NwYWNlLmpzJztcbmltcG9ydCB7IEFic3RyYWN0VGV4dENvZGVFZGl0b3IgfSBmcm9tICcuLi8uLi8uLi9icm93c2VyL3BhcnRzL2VkaXRvci90ZXh0Q29kZUVkaXRvci5qcyc7XG5pbXBvcnQgeyBFZGl0b3JJbnB1dENhcGFiaWxpdGllcywgSUVkaXRvck9wZW5Db250ZXh0IH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2VkaXRvci5qcyc7XG5pbXBvcnQgeyBFZGl0b3JJbnB1dCB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9lZGl0b3IvZWRpdG9ySW5wdXQuanMnO1xuaW1wb3J0IHsgRXhjbHVkZVBhdHRlcm5JbnB1dFdpZGdldCwgSW5jbHVkZVBhdHRlcm5JbnB1dFdpZGdldCB9IGZyb20gJy4uLy4uL3NlYXJjaC9icm93c2VyL3BhdHRlcm5JbnB1dFdpZGdldC5qcyc7XG5pbXBvcnQgeyBTZWFyY2hXaWRnZXQgfSBmcm9tICcuLi8uLi9zZWFyY2gvYnJvd3Nlci9zZWFyY2hXaWRnZXQuanMnO1xuaW1wb3J0IHsgSVRleHRRdWVyeUJ1aWxkZXJPcHRpb25zLCBRdWVyeUJ1aWxkZXIgfSBmcm9tICcuLi8uLi8uLi9zZXJ2aWNlcy9zZWFyY2gvY29tbW9uL3F1ZXJ5QnVpbGRlci5qcyc7XG5pbXBvcnQgeyBnZXRPdXRPZldvcmtzcGFjZUVkaXRvclJlc291cmNlcyB9IGZyb20gJy4uLy4uL3NlYXJjaC9jb21tb24vc2VhcmNoLmpzJztcbmltcG9ydCB7IFNlYXJjaE1vZGVsSW1wbCB9IGZyb20gJy4uLy4uL3NlYXJjaC9icm93c2VyL3NlYXJjaFRyZWVNb2RlbC9zZWFyY2hNb2RlbC5qcyc7XG5pbXBvcnQgeyBJblNlYXJjaEVkaXRvciwgU2VhcmNoRWRpdG9ySUQsIFNlYXJjaEVkaXRvcklucHV0VHlwZUlkLCBTZWFyY2hDb25maWd1cmF0aW9uIH0gZnJvbSAnLi9jb25zdGFudHMuanMnO1xuaW1wb3J0IHR5cGUgeyBTZWFyY2hFZGl0b3JJbnB1dCB9IGZyb20gJy4vc2VhcmNoRWRpdG9ySW5wdXQuanMnO1xuaW1wb3J0IHsgc2VyaWFsaXplU2VhcmNoUmVzdWx0Rm9yRWRpdG9yIH0gZnJvbSAnLi9zZWFyY2hFZGl0b3JTZXJpYWxpemF0aW9uLmpzJztcbmltcG9ydCB7IElFZGl0b3JHcm91cCwgSUVkaXRvckdyb3Vwc1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9zZXJ2aWNlcy9lZGl0b3IvY29tbW9uL2VkaXRvckdyb3Vwc1NlcnZpY2UuanMnO1xuaW1wb3J0IHsgSUVkaXRvclNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9zZXJ2aWNlcy9lZGl0b3IvY29tbW9uL2VkaXRvclNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSVBhdHRlcm5JbmZvLCBJU2VhcmNoQ29tcGxldGUsIElTZWFyY2hDb25maWd1cmF0aW9uUHJvcGVydGllcywgSVRleHRRdWVyeSwgU2VhcmNoU29ydE9yZGVyIH0gZnJvbSAnLi4vLi4vLi4vc2VydmljZXMvc2VhcmNoL2NvbW1vbi9zZWFyY2guanMnO1xuaW1wb3J0IHsgc2VhcmNoRGV0YWlsc0ljb24gfSBmcm9tICcuLi8uLi9zZWFyY2gvYnJvd3Nlci9zZWFyY2hJY29ucy5qcyc7XG5pbXBvcnQgeyBJRmlsZVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9maWxlcy9jb21tb24vZmlsZXMuanMnO1xuaW1wb3J0IHsgSU9wZW5lclNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9vcGVuZXIvY29tbW9uL29wZW5lci5qcyc7XG5pbXBvcnQgeyBUZXh0U2VhcmNoQ29tcGxldGVNZXNzYWdlIH0gZnJvbSAnLi4vLi4vLi4vc2VydmljZXMvc2VhcmNoL2NvbW1vbi9zZWFyY2hFeHRUeXBlcy5qcyc7XG5pbXBvcnQgeyBJTm90aWZpY2F0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL25vdGlmaWNhdGlvbi9jb21tb24vbm90aWZpY2F0aW9uLmpzJztcbmltcG9ydCB7IElFZGl0b3JPcHRpb25zIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vZWRpdG9yL2NvbW1vbi9lZGl0b3IuanMnO1xuaW1wb3J0IHsgcmVuZGVyU2VhcmNoTWVzc2FnZSB9IGZyb20gJy4uLy4uL3NlYXJjaC9icm93c2VyL3NlYXJjaE1lc3NhZ2UuanMnO1xuaW1wb3J0IHsgRWRpdG9yRXh0ZW5zaW9uc1JlZ2lzdHJ5LCBJRWRpdG9yQ29udHJpYnV0aW9uRGVzY3JpcHRpb24gfSBmcm9tICcuLi8uLi8uLi8uLi9lZGl0b3IvYnJvd3Nlci9lZGl0b3JFeHRlbnNpb25zLmpzJztcbmltcG9ydCB7IFVudXN1YWxMaW5lVGVybWluYXRvcnNEZXRlY3RvciB9IGZyb20gJy4uLy4uLy4uLy4uL2VkaXRvci9jb250cmliL3VudXN1YWxMaW5lVGVybWluYXRvcnMvYnJvd3Nlci91bnVzdWFsTGluZVRlcm1pbmF0b3JzLmpzJztcbmltcG9ydCB7IGRlZmF1bHRUb2dnbGVTdHlsZXMsIGdldElucHV0Qm94U3R5bGUgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS90aGVtZS9icm93c2VyL2RlZmF1bHRTdHlsZXMuanMnO1xuaW1wb3J0IHsgSUxvZ1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9sb2cvY29tbW9uL2xvZy5qcyc7XG5pbXBvcnQgeyBTZWFyY2hDb250ZXh0IH0gZnJvbSAnLi4vLi4vc2VhcmNoL2NvbW1vbi9jb25zdGFudHMuanMnO1xuaW1wb3J0IHsgZ2V0RGVmYXVsdEhvdmVyRGVsZWdhdGUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvdWkvaG92ZXIvaG92ZXJEZWxlZ2F0ZUZhY3RvcnkuanMnO1xuaW1wb3J0IHsgSUhvdmVyU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2hvdmVyL2Jyb3dzZXIvaG92ZXIuanMnO1xuaW1wb3J0IHsgSVNlYXJjaFJlc3VsdCB9IGZyb20gJy4uLy4uL3NlYXJjaC9icm93c2VyL3NlYXJjaFRyZWVNb2RlbC9zZWFyY2hUcmVlQ29tbW9uLmpzJztcblxuY29uc3QgUkVTVUxUX0xJTkVfUkVHRVggPSAvXihcXHMrKShcXGQrKSg6IHwgICkoXFxzKikoLiopJC87XG5jb25zdCBGSUxFX0xJTkVfUkVHRVggPSAvXihcXFMuKik6JC87XG5cbnR5cGUgU2VhcmNoRWRpdG9yVmlld1N0YXRlID0gSUNvZGVFZGl0b3JWaWV3U3RhdGUgJiB7IGZvY3VzZWQ6ICdpbnB1dCcgfCAnZWRpdG9yJyB9O1xuXG5leHBvcnQgY2xhc3MgU2VhcmNoRWRpdG9yIGV4dGVuZHMgQWJzdHJhY3RUZXh0Q29kZUVkaXRvcjxTZWFyY2hFZGl0b3JWaWV3U3RhdGU+IHtcblx0c3RhdGljIHJlYWRvbmx5IElEOiBzdHJpbmcgPSBTZWFyY2hFZGl0b3JJRDtcblxuXHRzdGF0aWMgcmVhZG9ubHkgU0VBUkNIX0VESVRPUl9WSUVXX1NUQVRFX1BSRUZFUkVOQ0VfS0VZID0gJ3NlYXJjaEVkaXRvclZpZXdTdGF0ZSc7XG5cblx0cHJpdmF0ZSBxdWVyeUVkaXRvcldpZGdldCE6IFNlYXJjaFdpZGdldDtcblx0cHJpdmF0ZSBnZXQgc2VhcmNoUmVzdWx0RWRpdG9yKCkgeyByZXR1cm4gdGhpcy5lZGl0b3JDb250cm9sITsgfVxuXHRwcml2YXRlIHF1ZXJ5RWRpdG9yQ29udGFpbmVyITogSFRNTEVsZW1lbnQ7XG5cdHByaXZhdGUgZGltZW5zaW9uPzogRE9NLkRpbWVuc2lvbjtcblx0cHJpdmF0ZSBpbnB1dFBhdHRlcm5JbmNsdWRlcyE6IEluY2x1ZGVQYXR0ZXJuSW5wdXRXaWRnZXQ7XG5cdHByaXZhdGUgaW5wdXRQYXR0ZXJuRXhjbHVkZXMhOiBFeGNsdWRlUGF0dGVybklucHV0V2lkZ2V0O1xuXHRwcml2YXRlIGluY2x1ZGVzRXhjbHVkZXNDb250YWluZXIhOiBIVE1MRWxlbWVudDtcblx0cHJpdmF0ZSB0b2dnbGVRdWVyeURldGFpbHNCdXR0b24hOiBIVE1MRWxlbWVudDtcblx0cHJpdmF0ZSBtZXNzYWdlQm94ITogSFRNTEVsZW1lbnQ7XG5cblx0cHJpdmF0ZSBydW5TZWFyY2hEZWxheWVyID0gdGhpcy5fcmVnaXN0ZXIobmV3IERlbGF5ZXIoMCkpO1xuXHRwcml2YXRlIHBhdXNlU2VhcmNoaW5nOiBib29sZWFuID0gZmFsc2U7XG5cdHByaXZhdGUgc2hvd2luZ0luY2x1ZGVzRXhjbHVkZXM6IGJvb2xlYW4gPSBmYWxzZTtcblx0cHJpdmF0ZSBzZWFyY2hPcGVyYXRpb246IExvbmdSdW5uaW5nT3BlcmF0aW9uO1xuXHRwcml2YXRlIHNlYXJjaEhpc3RvcnlEZWxheWVyOiBEZWxheWVyPHZvaWQ+O1xuXHRwcml2YXRlIHJlYWRvbmx5IG1lc3NhZ2VEaXNwb3NhYmxlczogRGlzcG9zYWJsZVN0b3JlO1xuXHRwcml2YXRlIGNvbnRhaW5lcjogSFRNTEVsZW1lbnQ7XG5cdHByaXZhdGUgc2VhcmNoTW9kZWw6IFNlYXJjaE1vZGVsSW1wbDtcblx0cHJpdmF0ZSBvbmdvaW5nT3BlcmF0aW9uczogbnVtYmVyID0gMDtcblx0cHJpdmF0ZSB1cGRhdGluZ01vZGVsRm9yU2VhcmNoOiBib29sZWFuID0gZmFsc2U7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0Z3JvdXA6IElFZGl0b3JHcm91cCxcblx0XHRASVRlbGVtZXRyeVNlcnZpY2UgdGVsZW1ldHJ5U2VydmljZTogSVRlbGVtZXRyeVNlcnZpY2UsXG5cdFx0QElUaGVtZVNlcnZpY2UgdGhlbWVTZXJ2aWNlOiBJVGhlbWVTZXJ2aWNlLFxuXHRcdEBJU3RvcmFnZVNlcnZpY2Ugc3RvcmFnZVNlcnZpY2U6IElTdG9yYWdlU2VydmljZSxcblx0XHRASU1vZGVsU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IG1vZGVsU2VydmljZTogSU1vZGVsU2VydmljZSxcblx0XHRASVdvcmtzcGFjZUNvbnRleHRTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgY29udGV4dFNlcnZpY2U6IElXb3Jrc3BhY2VDb250ZXh0U2VydmljZSxcblx0XHRASUxhYmVsU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGxhYmVsU2VydmljZTogSUxhYmVsU2VydmljZSxcblx0XHRASUluc3RhbnRpYXRpb25TZXJ2aWNlIGluc3RhbnRpYXRpb25TZXJ2aWNlOiBJSW5zdGFudGlhdGlvblNlcnZpY2UsXG5cdFx0QElDb250ZXh0Vmlld1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBjb250ZXh0Vmlld1NlcnZpY2U6IElDb250ZXh0Vmlld1NlcnZpY2UsXG5cdFx0QElDb21tYW5kU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGNvbW1hbmRTZXJ2aWNlOiBJQ29tbWFuZFNlcnZpY2UsXG5cdFx0QElPcGVuZXJTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgb3BlbmVyU2VydmljZTogSU9wZW5lclNlcnZpY2UsXG5cdFx0QElOb3RpZmljYXRpb25TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgbm90aWZpY2F0aW9uU2VydmljZTogSU5vdGlmaWNhdGlvblNlcnZpY2UsXG5cdFx0QElFZGl0b3JQcm9ncmVzc1NlcnZpY2UgcHJvZ3Jlc3NTZXJ2aWNlOiBJRWRpdG9yUHJvZ3Jlc3NTZXJ2aWNlLFxuXHRcdEBJVGV4dFJlc291cmNlQ29uZmlndXJhdGlvblNlcnZpY2UgdGV4dFJlc291cmNlU2VydmljZTogSVRleHRSZXNvdXJjZUNvbmZpZ3VyYXRpb25TZXJ2aWNlLFxuXHRcdEBJRWRpdG9yR3JvdXBzU2VydmljZSBlZGl0b3JHcm91cFNlcnZpY2U6IElFZGl0b3JHcm91cHNTZXJ2aWNlLFxuXHRcdEBJRWRpdG9yU2VydmljZSBlZGl0b3JTZXJ2aWNlOiBJRWRpdG9yU2VydmljZSxcblx0XHRASUNvbmZpZ3VyYXRpb25TZXJ2aWNlIHByb3RlY3RlZCBjb25maWd1cmF0aW9uU2VydmljZTogSUNvbmZpZ3VyYXRpb25TZXJ2aWNlLFxuXHRcdEBJRmlsZVNlcnZpY2UgZmlsZVNlcnZpY2U6IElGaWxlU2VydmljZSxcblx0XHRASUxvZ1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBsb2dTZXJ2aWNlOiBJTG9nU2VydmljZSxcblx0XHRASUhvdmVyU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGhvdmVyU2VydmljZTogSUhvdmVyU2VydmljZVxuXHQpIHtcblx0XHRzdXBlcihTZWFyY2hFZGl0b3IuSUQsIGdyb3VwLCB0ZWxlbWV0cnlTZXJ2aWNlLCBpbnN0YW50aWF0aW9uU2VydmljZSwgc3RvcmFnZVNlcnZpY2UsIHRleHRSZXNvdXJjZVNlcnZpY2UsIHRoZW1lU2VydmljZSwgZWRpdG9yU2VydmljZSwgZWRpdG9yR3JvdXBTZXJ2aWNlLCBmaWxlU2VydmljZSk7XG5cdFx0dGhpcy5jb250YWluZXIgPSBET00uJCgnLnNlYXJjaC1lZGl0b3InKTtcblxuXHRcdHRoaXMuc2VhcmNoT3BlcmF0aW9uID0gdGhpcy5fcmVnaXN0ZXIobmV3IExvbmdSdW5uaW5nT3BlcmF0aW9uKHByb2dyZXNzU2VydmljZSkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMubWVzc2FnZURpc3Bvc2FibGVzID0gbmV3IERpc3Bvc2FibGVTdG9yZSgpKTtcblxuXHRcdHRoaXMuc2VhcmNoSGlzdG9yeURlbGF5ZXIgPSB0aGlzLl9yZWdpc3RlcihuZXcgRGVsYXllcjx2b2lkPigyMDAwKSk7XG5cblx0XHR0aGlzLnNlYXJjaE1vZGVsID0gdGhpcy5fcmVnaXN0ZXIodGhpcy5pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShTZWFyY2hNb2RlbEltcGwpKTtcblx0fVxuXG5cdHByb3RlY3RlZCBvdmVycmlkZSBjcmVhdGVFZGl0b3IocGFyZW50OiBIVE1MRWxlbWVudCkge1xuXHRcdERPTS5hcHBlbmQocGFyZW50LCB0aGlzLmNvbnRhaW5lcik7XG5cdFx0dGhpcy5xdWVyeUVkaXRvckNvbnRhaW5lciA9IERPTS5hcHBlbmQodGhpcy5jb250YWluZXIsIERPTS4kKCcucXVlcnktY29udGFpbmVyJykpO1xuXHRcdGNvbnN0IHNlYXJjaFJlc3VsdENvbnRhaW5lciA9IERPTS5hcHBlbmQodGhpcy5jb250YWluZXIsIERPTS4kKCcuc2VhcmNoLXJlc3VsdHMnKSk7XG5cdFx0c3VwZXIuY3JlYXRlRWRpdG9yKHNlYXJjaFJlc3VsdENvbnRhaW5lcik7XG5cdFx0dGhpcy5yZWdpc3RlckVkaXRvckxpc3RlbmVycygpO1xuXG5cdFx0Y29uc3Qgc2NvcGVkQ29udGV4dEtleVNlcnZpY2UgPSBhc3NlcnRSZXR1cm5zRGVmaW5lZCh0aGlzLnNjb3BlZENvbnRleHRLZXlTZXJ2aWNlKTtcblx0XHRJblNlYXJjaEVkaXRvci5iaW5kVG8oc2NvcGVkQ29udGV4dEtleVNlcnZpY2UpLnNldCh0cnVlKTtcblxuXHRcdHRoaXMuY3JlYXRlUXVlcnlFZGl0b3IoXG5cdFx0XHR0aGlzLnF1ZXJ5RWRpdG9yQ29udGFpbmVyLFxuXHRcdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVDaGlsZChuZXcgU2VydmljZUNvbGxlY3Rpb24oW0lDb250ZXh0S2V5U2VydmljZSwgc2NvcGVkQ29udGV4dEtleVNlcnZpY2VdKSkpLFxuXHRcdFx0U2VhcmNoQ29udGV4dC5JbnB1dEJveEZvY3VzZWRLZXkuYmluZFRvKHNjb3BlZENvbnRleHRLZXlTZXJ2aWNlKVxuXHRcdCk7XG5cdH1cblxuXG5cdHByaXZhdGUgY3JlYXRlUXVlcnlFZGl0b3IoY29udGFpbmVyOiBIVE1MRWxlbWVudCwgc2NvcGVkSW5zdGFudGlhdGlvblNlcnZpY2U6IElJbnN0YW50aWF0aW9uU2VydmljZSwgaW5wdXRCb3hGb2N1c2VkQ29udGV4dEtleTogSUNvbnRleHRLZXk8Ym9vbGVhbj4pIHtcblx0XHRjb25zdCBzZWFyY2hFZGl0b3JJbnB1dGJveFN0eWxlcyA9IGdldElucHV0Qm94U3R5bGUoeyBpbnB1dEJvcmRlcjogc2VhcmNoRWRpdG9yVGV4dElucHV0Qm9yZGVyIH0pO1xuXG5cdFx0dGhpcy5xdWVyeUVkaXRvcldpZGdldCA9IHRoaXMuX3JlZ2lzdGVyKHNjb3BlZEluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFNlYXJjaFdpZGdldCwgY29udGFpbmVyLCB7IF9oaWRlUmVwbGFjZVRvZ2dsZTogdHJ1ZSwgc2hvd0NvbnRleHRUb2dnbGU6IHRydWUsIGlucHV0Qm94U3R5bGVzOiBzZWFyY2hFZGl0b3JJbnB1dGJveFN0eWxlcywgdG9nZ2xlU3R5bGVzOiBkZWZhdWx0VG9nZ2xlU3R5bGVzIH0pKTtcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLnF1ZXJ5RWRpdG9yV2lkZ2V0Lm9uUmVwbGFjZVRvZ2dsZWQoKCkgPT4gdGhpcy5yZUxheW91dCgpKSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5xdWVyeUVkaXRvcldpZGdldC5vbkRpZEhlaWdodENoYW5nZSgoKSA9PiB0aGlzLnJlTGF5b3V0KCkpKTtcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLnF1ZXJ5RWRpdG9yV2lkZ2V0Lm9uU2VhcmNoU3VibWl0KCh7IGRlbGF5IH0pID0+IHRoaXMudHJpZ2dlclNlYXJjaCh7IGRlbGF5IH0pKSk7XG5cdFx0aWYgKHRoaXMucXVlcnlFZGl0b3JXaWRnZXQuc2VhcmNoSW5wdXQpIHtcblx0XHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMucXVlcnlFZGl0b3JXaWRnZXQuc2VhcmNoSW5wdXQub25EaWRPcHRpb25DaGFuZ2UoKCkgPT4gdGhpcy50cmlnZ2VyU2VhcmNoKHsgcmVzZXRDdXJzb3I6IGZhbHNlIH0pKSk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHRoaXMubG9nU2VydmljZS53YXJuKCdTZWFyY2hFZGl0b3I6IFNlYXJjaFdpZGdldC5zZWFyY2hJbnB1dCBpcyB1bmRlZmluZWQsIGNhbm5vdCByZWdpc3RlciBvbkRpZE9wdGlvbkNoYW5nZSBsaXN0ZW5lcicpO1xuXHRcdH1cblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLnF1ZXJ5RWRpdG9yV2lkZ2V0Lm9uRGlkVG9nZ2xlQ29udGV4dCgoKSA9PiB0aGlzLnRyaWdnZXJTZWFyY2goeyByZXNldEN1cnNvcjogZmFsc2UgfSkpKTtcblxuXHRcdC8vIEluY2x1ZGVzL0V4Y2x1ZGVzIERyb3Bkb3duXG5cdFx0dGhpcy5pbmNsdWRlc0V4Y2x1ZGVzQ29udGFpbmVyID0gRE9NLmFwcGVuZChjb250YWluZXIsIERPTS4kKCcuaW5jbHVkZXMtZXhjbHVkZXMnKSk7XG5cblx0XHQvLyBUb2dnbGUgcXVlcnkgZGV0YWlscyBidXR0b25cblx0XHRjb25zdCB0b2dnbGVRdWVyeURldGFpbHNMYWJlbCA9IGxvY2FsaXplKCdtb3JlU2VhcmNoJywgXCJUb2dnbGUgU2VhcmNoIERldGFpbHNcIik7XG5cdFx0dGhpcy50b2dnbGVRdWVyeURldGFpbHNCdXR0b24gPSBET00uYXBwZW5kKHRoaXMuaW5jbHVkZXNFeGNsdWRlc0NvbnRhaW5lciwgRE9NLiQoJy5leHBhbmQnICsgVGhlbWVJY29uLmFzQ1NTU2VsZWN0b3Ioc2VhcmNoRGV0YWlsc0ljb24pLCB7IHRhYmluZGV4OiAwLCByb2xlOiAnYnV0dG9uJywgJ2FyaWEtbGFiZWwnOiB0b2dnbGVRdWVyeURldGFpbHNMYWJlbCB9KSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5ob3ZlclNlcnZpY2Uuc2V0dXBNYW5hZ2VkSG92ZXIoZ2V0RGVmYXVsdEhvdmVyRGVsZWdhdGUoJ2VsZW1lbnQnKSwgdGhpcy50b2dnbGVRdWVyeURldGFpbHNCdXR0b24sIHRvZ2dsZVF1ZXJ5RGV0YWlsc0xhYmVsKSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIoRE9NLmFkZERpc3Bvc2FibGVMaXN0ZW5lcih0aGlzLnRvZ2dsZVF1ZXJ5RGV0YWlsc0J1dHRvbiwgRE9NLkV2ZW50VHlwZS5DTElDSywgZSA9PiB7XG5cdFx0XHRET00uRXZlbnRIZWxwZXIuc3RvcChlKTtcblx0XHRcdHRoaXMudG9nZ2xlSW5jbHVkZXNFeGNsdWRlcygpO1xuXHRcdH0pKTtcblx0XHR0aGlzLl9yZWdpc3RlcihET00uYWRkRGlzcG9zYWJsZUxpc3RlbmVyKHRoaXMudG9nZ2xlUXVlcnlEZXRhaWxzQnV0dG9uLCBET00uRXZlbnRUeXBlLktFWV9VUCwgKGU6IEtleWJvYXJkRXZlbnQpID0+IHtcblx0XHRcdGNvbnN0IGV2ZW50ID0gbmV3IFN0YW5kYXJkS2V5Ym9hcmRFdmVudChlKTtcblx0XHRcdGlmIChldmVudC5lcXVhbHMoS2V5Q29kZS5FbnRlcikgfHwgZXZlbnQuZXF1YWxzKEtleUNvZGUuU3BhY2UpKSB7XG5cdFx0XHRcdERPTS5FdmVudEhlbHBlci5zdG9wKGUpO1xuXHRcdFx0XHR0aGlzLnRvZ2dsZUluY2x1ZGVzRXhjbHVkZXMoKTtcblx0XHRcdH1cblx0XHR9KSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIoRE9NLmFkZERpc3Bvc2FibGVMaXN0ZW5lcih0aGlzLnRvZ2dsZVF1ZXJ5RGV0YWlsc0J1dHRvbiwgRE9NLkV2ZW50VHlwZS5LRVlfRE9XTiwgKGU6IEtleWJvYXJkRXZlbnQpID0+IHtcblx0XHRcdGNvbnN0IGV2ZW50ID0gbmV3IFN0YW5kYXJkS2V5Ym9hcmRFdmVudChlKTtcblx0XHRcdGlmIChldmVudC5lcXVhbHMoS2V5TW9kLlNoaWZ0IHwgS2V5Q29kZS5UYWIpKSB7XG5cdFx0XHRcdGlmICh0aGlzLnF1ZXJ5RWRpdG9yV2lkZ2V0LmlzUmVwbGFjZUFjdGl2ZSgpKSB7XG5cdFx0XHRcdFx0dGhpcy5xdWVyeUVkaXRvcldpZGdldC5mb2N1c1JlcGxhY2VBbGxBY3Rpb24oKTtcblx0XHRcdFx0fVxuXHRcdFx0XHRlbHNlIHtcblx0XHRcdFx0XHR0aGlzLnF1ZXJ5RWRpdG9yV2lkZ2V0LmlzUmVwbGFjZVNob3duKCkgPyB0aGlzLnF1ZXJ5RWRpdG9yV2lkZ2V0LnJlcGxhY2VJbnB1dD8uZm9jdXNPblByZXNlcnZlKCkgOiB0aGlzLnF1ZXJ5RWRpdG9yV2lkZ2V0LmZvY3VzUmVnZXhBY3Rpb24oKTtcblx0XHRcdFx0fVxuXHRcdFx0XHRET00uRXZlbnRIZWxwZXIuc3RvcChlKTtcblx0XHRcdH1cblx0XHR9KSk7XG5cblx0XHQvLyBJbmNsdWRlc1xuXHRcdGNvbnN0IGZvbGRlckluY2x1ZGVzTGlzdCA9IERPTS5hcHBlbmQodGhpcy5pbmNsdWRlc0V4Y2x1ZGVzQ29udGFpbmVyLCBET00uJCgnLmZpbGUtdHlwZXMuaW5jbHVkZXMnKSk7XG5cdFx0Y29uc3QgZmlsZXNUb0luY2x1ZGVUaXRsZSA9IGxvY2FsaXplKCdzZWFyY2hTY29wZS5pbmNsdWRlcycsIFwiZmlsZXMgdG8gaW5jbHVkZVwiKTtcblx0XHRET00uYXBwZW5kKGZvbGRlckluY2x1ZGVzTGlzdCwgRE9NLiQoJ2g0JywgdW5kZWZpbmVkLCBmaWxlc1RvSW5jbHVkZVRpdGxlKSk7XG5cdFx0dGhpcy5pbnB1dFBhdHRlcm5JbmNsdWRlcyA9IHRoaXMuX3JlZ2lzdGVyKHNjb3BlZEluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKEluY2x1ZGVQYXR0ZXJuSW5wdXRXaWRnZXQsIGZvbGRlckluY2x1ZGVzTGlzdCwgdGhpcy5jb250ZXh0Vmlld1NlcnZpY2UsIHtcblx0XHRcdGFyaWFMYWJlbDogbG9jYWxpemUoJ2xhYmVsLmluY2x1ZGVzJywgJ1NlYXJjaCBJbmNsdWRlIFBhdHRlcm5zJyksXG5cdFx0XHRpbnB1dEJveFN0eWxlczogc2VhcmNoRWRpdG9ySW5wdXRib3hTdHlsZXNcblx0XHR9KSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5pbnB1dFBhdHRlcm5JbmNsdWRlcy5vblN1Ym1pdCh0cmlnZ2VyZWRPblR5cGUgPT4gdGhpcy50cmlnZ2VyU2VhcmNoKHsgcmVzZXRDdXJzb3I6IGZhbHNlLCBkZWxheTogdHJpZ2dlcmVkT25UeXBlID8gdGhpcy5zZWFyY2hDb25maWcuc2VhcmNoT25UeXBlRGVib3VuY2VQZXJpb2QgOiAwIH0pKSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5pbnB1dFBhdHRlcm5JbmNsdWRlcy5vbkNoYW5nZVNlYXJjaEluRWRpdG9yc0JveCgoKSA9PiB0aGlzLnRyaWdnZXJTZWFyY2goKSkpO1xuXG5cdFx0Ly8gRXhjbHVkZXNcblx0XHRjb25zdCBleGNsdWRlc0xpc3QgPSBET00uYXBwZW5kKHRoaXMuaW5jbHVkZXNFeGNsdWRlc0NvbnRhaW5lciwgRE9NLiQoJy5maWxlLXR5cGVzLmV4Y2x1ZGVzJykpO1xuXHRcdGNvbnN0IGV4Y2x1ZGVzVGl0bGUgPSBsb2NhbGl6ZSgnc2VhcmNoU2NvcGUuZXhjbHVkZXMnLCBcImZpbGVzIHRvIGV4Y2x1ZGVcIik7XG5cdFx0RE9NLmFwcGVuZChleGNsdWRlc0xpc3QsIERPTS4kKCdoNCcsIHVuZGVmaW5lZCwgZXhjbHVkZXNUaXRsZSkpO1xuXHRcdHRoaXMuaW5wdXRQYXR0ZXJuRXhjbHVkZXMgPSB0aGlzLl9yZWdpc3RlcihzY29wZWRJbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShFeGNsdWRlUGF0dGVybklucHV0V2lkZ2V0LCBleGNsdWRlc0xpc3QsIHRoaXMuY29udGV4dFZpZXdTZXJ2aWNlLCB7XG5cdFx0XHRhcmlhTGFiZWw6IGxvY2FsaXplKCdsYWJlbC5leGNsdWRlcycsICdTZWFyY2ggRXhjbHVkZSBQYXR0ZXJucycpLFxuXHRcdFx0aW5wdXRCb3hTdHlsZXM6IHNlYXJjaEVkaXRvcklucHV0Ym94U3R5bGVzXG5cdFx0fSkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuaW5wdXRQYXR0ZXJuRXhjbHVkZXMub25TdWJtaXQodHJpZ2dlcmVkT25UeXBlID0+IHRoaXMudHJpZ2dlclNlYXJjaCh7IHJlc2V0Q3Vyc29yOiBmYWxzZSwgZGVsYXk6IHRyaWdnZXJlZE9uVHlwZSA/IHRoaXMuc2VhcmNoQ29uZmlnLnNlYXJjaE9uVHlwZURlYm91bmNlUGVyaW9kIDogMCB9KSkpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuaW5wdXRQYXR0ZXJuRXhjbHVkZXMub25DaGFuZ2VJZ25vcmVCb3goKCkgPT4gdGhpcy50cmlnZ2VyU2VhcmNoKCkpKTtcblxuXHRcdC8vIE1lc3NhZ2VzXG5cdFx0dGhpcy5tZXNzYWdlQm94ID0gRE9NLmFwcGVuZChjb250YWluZXIsIERPTS4kKCcubWVzc2FnZXMudGV4dC1zZWFyY2gtcHJvdmlkZXItbWVzc2FnZXMnKSk7XG5cblx0XHRbdGhpcy5xdWVyeUVkaXRvcldpZGdldC5zZWFyY2hJbnB1dEZvY3VzVHJhY2tlciwgdGhpcy5xdWVyeUVkaXRvcldpZGdldC5yZXBsYWNlSW5wdXRGb2N1c1RyYWNrZXIsIHRoaXMuaW5wdXRQYXR0ZXJuRXhjbHVkZXMuaW5wdXRGb2N1c1RyYWNrZXIsIHRoaXMuaW5wdXRQYXR0ZXJuSW5jbHVkZXMuaW5wdXRGb2N1c1RyYWNrZXJdXG5cdFx0XHQuZm9yRWFjaCh0cmFja2VyID0+IHtcblx0XHRcdFx0aWYgKCF0cmFja2VyKSB7XG5cdFx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHRoaXMuX3JlZ2lzdGVyKHRyYWNrZXIub25EaWRGb2N1cygoKSA9PiBzZXRUaW1lb3V0KCgpID0+IGlucHV0Qm94Rm9jdXNlZENvbnRleHRLZXkuc2V0KHRydWUpLCAwKSkpO1xuXHRcdFx0XHR0aGlzLl9yZWdpc3Rlcih0cmFja2VyLm9uRGlkQmx1cigoKSA9PiBpbnB1dEJveEZvY3VzZWRDb250ZXh0S2V5LnNldChmYWxzZSkpKTtcblx0XHRcdH0pO1xuXHR9XG5cblx0cHJpdmF0ZSB0b2dnbGVSdW5BZ2Fpbk1lc3NhZ2Uoc2hvdzogYm9vbGVhbikge1xuXHRcdERPTS5jbGVhck5vZGUodGhpcy5tZXNzYWdlQm94KTtcblx0XHR0aGlzLm1lc3NhZ2VEaXNwb3NhYmxlcy5jbGVhcigpO1xuXG5cdFx0aWYgKHNob3cpIHtcblx0XHRcdGNvbnN0IHJ1bkFnYWluTGluayA9IERPTS5hcHBlbmQodGhpcy5tZXNzYWdlQm94LCBET00uJCgnYS5wb2ludGVyLnByb21pbmVudC5tZXNzYWdlJywge30sIGxvY2FsaXplKCdydW5TZWFyY2gnLCBcIlJ1biBTZWFyY2hcIikpKTtcblx0XHRcdHRoaXMubWVzc2FnZURpc3Bvc2FibGVzLmFkZChET00uYWRkRGlzcG9zYWJsZUxpc3RlbmVyKHJ1bkFnYWluTGluaywgRE9NLkV2ZW50VHlwZS5DTElDSywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0XHRhd2FpdCB0aGlzLnRyaWdnZXJTZWFyY2goKTtcblx0XHRcdFx0dGhpcy5zZWFyY2hSZXN1bHRFZGl0b3IuZm9jdXMoKTtcblx0XHRcdH0pKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIF9nZXRDb250cmlidXRpb25zKCk6IElFZGl0b3JDb250cmlidXRpb25EZXNjcmlwdGlvbltdIHtcblx0XHRjb25zdCBza2lwQ29udHJpYnV0aW9ucyA9IFtVbnVzdWFsTGluZVRlcm1pbmF0b3JzRGV0ZWN0b3IuSURdO1xuXHRcdHJldHVybiBFZGl0b3JFeHRlbnNpb25zUmVnaXN0cnkuZ2V0RWRpdG9yQ29udHJpYnV0aW9ucygpLmZpbHRlcihjID0+IHNraXBDb250cmlidXRpb25zLmluZGV4T2YoYy5pZCkgPT09IC0xKTtcblx0fVxuXG5cdHByb3RlY3RlZCBvdmVycmlkZSBnZXRDb2RlRWRpdG9yV2lkZ2V0T3B0aW9ucygpOiBJQ29kZUVkaXRvcldpZGdldE9wdGlvbnMge1xuXHRcdHJldHVybiB7IGNvbnRyaWJ1dGlvbnM6IHRoaXMuX2dldENvbnRyaWJ1dGlvbnMoKSB9O1xuXHR9XG5cblx0cHJpdmF0ZSByZWdpc3RlckVkaXRvckxpc3RlbmVycygpIHtcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLnNlYXJjaFJlc3VsdEVkaXRvci5vbk1vdXNlVXAoZSA9PiB7XG5cdFx0XHRpZiAoZS5ldmVudC5kZXRhaWwgPT09IDEpIHtcblx0XHRcdFx0Y29uc3QgYmVoYXZpb3VyID0gdGhpcy5zZWFyY2hDb25maWcuc2VhcmNoRWRpdG9yLnNpbmdsZUNsaWNrQmVoYXZpb3VyO1xuXHRcdFx0XHRjb25zdCBwb3NpdGlvbiA9IGUudGFyZ2V0LnBvc2l0aW9uO1xuXHRcdFx0XHRpZiAocG9zaXRpb24gJiYgYmVoYXZpb3VyID09PSAncGVla0RlZmluaXRpb24nKSB7XG5cdFx0XHRcdFx0Y29uc3QgbGluZSA9IHRoaXMuc2VhcmNoUmVzdWx0RWRpdG9yLmdldE1vZGVsKCk/LmdldExpbmVDb250ZW50KHBvc2l0aW9uLmxpbmVOdW1iZXIpID8/ICcnO1xuXHRcdFx0XHRcdGlmIChsaW5lLm1hdGNoKEZJTEVfTElORV9SRUdFWCkgfHwgbGluZS5tYXRjaChSRVNVTFRfTElORV9SRUdFWCkpIHtcblx0XHRcdFx0XHRcdHRoaXMuc2VhcmNoUmVzdWx0RWRpdG9yLnNldFNlbGVjdGlvbihSYW5nZS5mcm9tUG9zaXRpb25zKHBvc2l0aW9uKSk7XG5cdFx0XHRcdFx0XHR0aGlzLmNvbW1hbmRTZXJ2aWNlLmV4ZWN1dGVDb21tYW5kKCdlZGl0b3IuYWN0aW9uLnBlZWtEZWZpbml0aW9uJyk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHR9IGVsc2UgaWYgKGUuZXZlbnQuZGV0YWlsID09PSAyKSB7XG5cdFx0XHRcdGNvbnN0IGJlaGF2aW91ciA9IHRoaXMuc2VhcmNoQ29uZmlnLnNlYXJjaEVkaXRvci5kb3VibGVDbGlja0JlaGF2aW91cjtcblx0XHRcdFx0Y29uc3QgcG9zaXRpb24gPSBlLnRhcmdldC5wb3NpdGlvbjtcblx0XHRcdFx0aWYgKHBvc2l0aW9uICYmIGJlaGF2aW91ciAhPT0gJ3NlbGVjdFdvcmQnKSB7XG5cdFx0XHRcdFx0Y29uc3QgbGluZSA9IHRoaXMuc2VhcmNoUmVzdWx0RWRpdG9yLmdldE1vZGVsKCk/LmdldExpbmVDb250ZW50KHBvc2l0aW9uLmxpbmVOdW1iZXIpID8/ICcnO1xuXHRcdFx0XHRcdGlmIChsaW5lLm1hdGNoKFJFU1VMVF9MSU5FX1JFR0VYKSkge1xuXHRcdFx0XHRcdFx0dGhpcy5zZWFyY2hSZXN1bHRFZGl0b3Iuc2V0U2VsZWN0aW9uKFJhbmdlLmZyb21Qb3NpdGlvbnMocG9zaXRpb24pKTtcblx0XHRcdFx0XHRcdHRoaXMuY29tbWFuZFNlcnZpY2UuZXhlY3V0ZUNvbW1hbmQoYmVoYXZpb3VyID09PSAnZ29Ub0xvY2F0aW9uJyA/ICdlZGl0b3IuYWN0aW9uLmdvVG9EZWNsYXJhdGlvbicgOiAnZWRpdG9yLmFjdGlvbi5vcGVuRGVjbGFyYXRpb25Ub1RoZVNpZGUnKTtcblx0XHRcdFx0XHR9IGVsc2UgaWYgKGxpbmUubWF0Y2goRklMRV9MSU5FX1JFR0VYKSkge1xuXHRcdFx0XHRcdFx0dGhpcy5zZWFyY2hSZXN1bHRFZGl0b3Iuc2V0U2VsZWN0aW9uKFJhbmdlLmZyb21Qb3NpdGlvbnMocG9zaXRpb24pKTtcblx0XHRcdFx0XHRcdHRoaXMuY29tbWFuZFNlcnZpY2UuZXhlY3V0ZUNvbW1hbmQoJ2VkaXRvci5hY3Rpb24ucGVla0RlZmluaXRpb24nKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9KSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5zZWFyY2hSZXN1bHRFZGl0b3Iub25EaWRDaGFuZ2VNb2RlbENvbnRlbnQoKCkgPT4ge1xuXHRcdFx0aWYgKCF0aGlzLnVwZGF0aW5nTW9kZWxGb3JTZWFyY2gpIHtcblx0XHRcdFx0dGhpcy5nZXRJbnB1dCgpPy5zZXREaXJ0eSh0cnVlKTtcblx0XHRcdH1cblx0XHR9KSk7XG5cdH1cblxuXHRvdmVycmlkZSBnZXRDb250cm9sKCkge1xuXHRcdHJldHVybiB0aGlzLnNlYXJjaFJlc3VsdEVkaXRvcjtcblx0fVxuXG5cdG92ZXJyaWRlIGZvY3VzKCkge1xuXHRcdHN1cGVyLmZvY3VzKCk7XG5cblx0XHRjb25zdCB2aWV3U3RhdGUgPSB0aGlzLmxvYWRFZGl0b3JWaWV3U3RhdGUodGhpcy5nZXRJbnB1dCgpKTtcblx0XHRpZiAodmlld1N0YXRlICYmIHZpZXdTdGF0ZS5mb2N1c2VkID09PSAnZWRpdG9yJykge1xuXHRcdFx0dGhpcy5zZWFyY2hSZXN1bHRFZGl0b3IuZm9jdXMoKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0dGhpcy5xdWVyeUVkaXRvcldpZGdldC5mb2N1cygpO1xuXHRcdH1cblx0fVxuXG5cdGZvY3VzU2VhcmNoSW5wdXQoKSB7XG5cdFx0dGhpcy5xdWVyeUVkaXRvcldpZGdldC5zZWFyY2hJbnB1dD8uZm9jdXMoKTtcblx0fVxuXG5cdGZvY3VzRmlsZXNUb0luY2x1ZGVJbnB1dCgpIHtcblx0XHRpZiAoIXRoaXMuc2hvd2luZ0luY2x1ZGVzRXhjbHVkZXMpIHtcblx0XHRcdHRoaXMudG9nZ2xlSW5jbHVkZXNFeGNsdWRlcyh0cnVlKTtcblx0XHR9XG5cdFx0dGhpcy5pbnB1dFBhdHRlcm5JbmNsdWRlcy5mb2N1cygpO1xuXHR9XG5cblx0Zm9jdXNGaWxlc1RvRXhjbHVkZUlucHV0KCkge1xuXHRcdGlmICghdGhpcy5zaG93aW5nSW5jbHVkZXNFeGNsdWRlcykge1xuXHRcdFx0dGhpcy50b2dnbGVJbmNsdWRlc0V4Y2x1ZGVzKHRydWUpO1xuXHRcdH1cblx0XHR0aGlzLmlucHV0UGF0dGVybkV4Y2x1ZGVzLmZvY3VzKCk7XG5cdH1cblxuXHRmb2N1c05leHRJbnB1dCgpIHtcblx0XHRpZiAodGhpcy5xdWVyeUVkaXRvcldpZGdldC5zZWFyY2hJbnB1dEhhc0ZvY3VzKCkpIHtcblx0XHRcdGlmICh0aGlzLnNob3dpbmdJbmNsdWRlc0V4Y2x1ZGVzKSB7XG5cdFx0XHRcdHRoaXMuaW5wdXRQYXR0ZXJuSW5jbHVkZXMuZm9jdXMoKTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdHRoaXMuc2VhcmNoUmVzdWx0RWRpdG9yLmZvY3VzKCk7XG5cdFx0XHR9XG5cdFx0fSBlbHNlIGlmICh0aGlzLmlucHV0UGF0dGVybkluY2x1ZGVzLmlucHV0SGFzRm9jdXMoKSkge1xuXHRcdFx0dGhpcy5pbnB1dFBhdHRlcm5FeGNsdWRlcy5mb2N1cygpO1xuXHRcdH0gZWxzZSBpZiAodGhpcy5pbnB1dFBhdHRlcm5FeGNsdWRlcy5pbnB1dEhhc0ZvY3VzKCkpIHtcblx0XHRcdHRoaXMuc2VhcmNoUmVzdWx0RWRpdG9yLmZvY3VzKCk7XG5cdFx0fSBlbHNlIGlmICh0aGlzLnNlYXJjaFJlc3VsdEVkaXRvci5oYXNXaWRnZXRGb2N1cygpKSB7XG5cdFx0XHQvLyBwYXNzXG5cdFx0fVxuXHR9XG5cblx0Zm9jdXNQcmV2SW5wdXQoKSB7XG5cdFx0aWYgKHRoaXMucXVlcnlFZGl0b3JXaWRnZXQuc2VhcmNoSW5wdXRIYXNGb2N1cygpKSB7XG5cdFx0XHR0aGlzLnNlYXJjaFJlc3VsdEVkaXRvci5mb2N1cygpOyAvLyB3cmFwXG5cdFx0fSBlbHNlIGlmICh0aGlzLmlucHV0UGF0dGVybkluY2x1ZGVzLmlucHV0SGFzRm9jdXMoKSkge1xuXHRcdFx0dGhpcy5xdWVyeUVkaXRvcldpZGdldC5zZWFyY2hJbnB1dD8uZm9jdXMoKTtcblx0XHR9IGVsc2UgaWYgKHRoaXMuaW5wdXRQYXR0ZXJuRXhjbHVkZXMuaW5wdXRIYXNGb2N1cygpKSB7XG5cdFx0XHR0aGlzLmlucHV0UGF0dGVybkluY2x1ZGVzLmZvY3VzKCk7XG5cdFx0fSBlbHNlIGlmICh0aGlzLnNlYXJjaFJlc3VsdEVkaXRvci5oYXNXaWRnZXRGb2N1cygpKSB7XG5cdFx0XHQvLyB1bnJlYWNoYWJsZS5cblx0XHR9XG5cdH1cblxuXHRzZXRRdWVyeShxdWVyeTogc3RyaW5nKSB7XG5cdFx0dGhpcy5xdWVyeUVkaXRvcldpZGdldC5zZWFyY2hJbnB1dD8uc2V0VmFsdWUocXVlcnkpO1xuXHR9XG5cblx0c2VsZWN0UXVlcnkoKSB7XG5cdFx0dGhpcy5xdWVyeUVkaXRvcldpZGdldC5zZWFyY2hJbnB1dD8uc2VsZWN0KCk7XG5cdH1cblxuXHR0b2dnbGVXaG9sZVdvcmRzKCkge1xuXHRcdHRoaXMucXVlcnlFZGl0b3JXaWRnZXQuc2VhcmNoSW5wdXQ/LnNldFdob2xlV29yZHMoIXRoaXMucXVlcnlFZGl0b3JXaWRnZXQuc2VhcmNoSW5wdXQuZ2V0V2hvbGVXb3JkcygpKTtcblx0XHR0aGlzLnRyaWdnZXJTZWFyY2goeyByZXNldEN1cnNvcjogZmFsc2UgfSk7XG5cdH1cblxuXHR0b2dnbGVSZWdleCgpIHtcblx0XHR0aGlzLnF1ZXJ5RWRpdG9yV2lkZ2V0LnNlYXJjaElucHV0Py5zZXRSZWdleCghdGhpcy5xdWVyeUVkaXRvcldpZGdldC5zZWFyY2hJbnB1dC5nZXRSZWdleCgpKTtcblx0XHR0aGlzLnRyaWdnZXJTZWFyY2goeyByZXNldEN1cnNvcjogZmFsc2UgfSk7XG5cdH1cblxuXHR0b2dnbGVDYXNlU2Vuc2l0aXZlKCkge1xuXHRcdHRoaXMucXVlcnlFZGl0b3JXaWRnZXQuc2VhcmNoSW5wdXQ/LnNldENhc2VTZW5zaXRpdmUoIXRoaXMucXVlcnlFZGl0b3JXaWRnZXQuc2VhcmNoSW5wdXQuZ2V0Q2FzZVNlbnNpdGl2ZSgpKTtcblx0XHR0aGlzLnRyaWdnZXJTZWFyY2goeyByZXNldEN1cnNvcjogZmFsc2UgfSk7XG5cdH1cblxuXHR0b2dnbGVDb250ZXh0TGluZXMoKSB7XG5cdFx0dGhpcy5xdWVyeUVkaXRvcldpZGdldC50b2dnbGVDb250ZXh0TGluZXMoKTtcblx0fVxuXG5cdG1vZGlmeUNvbnRleHRMaW5lcyhpbmNyZWFzZTogYm9vbGVhbikge1xuXHRcdHRoaXMucXVlcnlFZGl0b3JXaWRnZXQubW9kaWZ5Q29udGV4dExpbmVzKGluY3JlYXNlKTtcblx0fVxuXG5cdHRvZ2dsZVF1ZXJ5RGV0YWlscyhzaG91bGRTaG93PzogYm9vbGVhbikge1xuXHRcdHRoaXMudG9nZ2xlSW5jbHVkZXNFeGNsdWRlcyhzaG91bGRTaG93KTtcblx0fVxuXG5cdGRlbGV0ZVJlc3VsdEJsb2NrKCkge1xuXHRcdGNvbnN0IGxpbmVzVG9EZWxldGUgPSBuZXcgU2V0PG51bWJlcj4oKTtcblxuXHRcdGNvbnN0IHNlbGVjdGlvbnMgPSB0aGlzLnNlYXJjaFJlc3VsdEVkaXRvci5nZXRTZWxlY3Rpb25zKCk7XG5cdFx0Y29uc3QgbW9kZWwgPSB0aGlzLnNlYXJjaFJlc3VsdEVkaXRvci5nZXRNb2RlbCgpO1xuXHRcdGlmICghKHNlbGVjdGlvbnMgJiYgbW9kZWwpKSB7IHJldHVybjsgfVxuXG5cdFx0Y29uc3QgbWF4TGluZSA9IG1vZGVsLmdldExpbmVDb3VudCgpO1xuXHRcdGNvbnN0IG1pbkxpbmUgPSAxO1xuXG5cdFx0Y29uc3QgZGVsZXRlVXAgPSAoc3RhcnQ6IG51bWJlcikgPT4ge1xuXHRcdFx0Zm9yIChsZXQgY3Vyc29yID0gc3RhcnQ7IGN1cnNvciA+PSBtaW5MaW5lOyBjdXJzb3ItLSkge1xuXHRcdFx0XHRjb25zdCBsaW5lID0gbW9kZWwuZ2V0TGluZUNvbnRlbnQoY3Vyc29yKTtcblx0XHRcdFx0bGluZXNUb0RlbGV0ZS5hZGQoY3Vyc29yKTtcblx0XHRcdFx0aWYgKGxpbmVbMF0gIT09IHVuZGVmaW5lZCAmJiBsaW5lWzBdICE9PSAnICcpIHtcblx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH07XG5cblx0XHRjb25zdCBkZWxldGVEb3duID0gKHN0YXJ0OiBudW1iZXIpOiBudW1iZXIgfCB1bmRlZmluZWQgPT4ge1xuXHRcdFx0bGluZXNUb0RlbGV0ZS5hZGQoc3RhcnQpO1xuXHRcdFx0Zm9yIChsZXQgY3Vyc29yID0gc3RhcnQgKyAxOyBjdXJzb3IgPD0gbWF4TGluZTsgY3Vyc29yKyspIHtcblx0XHRcdFx0Y29uc3QgbGluZSA9IG1vZGVsLmdldExpbmVDb250ZW50KGN1cnNvcik7XG5cdFx0XHRcdGlmIChsaW5lWzBdICE9PSB1bmRlZmluZWQgJiYgbGluZVswXSAhPT0gJyAnKSB7XG5cdFx0XHRcdFx0cmV0dXJuIGN1cnNvcjtcblx0XHRcdFx0fVxuXHRcdFx0XHRsaW5lc1RvRGVsZXRlLmFkZChjdXJzb3IpO1xuXHRcdFx0fVxuXHRcdFx0cmV0dXJuO1xuXHRcdH07XG5cblx0XHRjb25zdCBlbmRpbmdDdXJzb3JMaW5lczogQXJyYXk8bnVtYmVyIHwgdW5kZWZpbmVkPiA9IFtdO1xuXHRcdGZvciAoY29uc3Qgc2VsZWN0aW9uIG9mIHNlbGVjdGlvbnMpIHtcblx0XHRcdGNvbnN0IGxpbmVOdW1iZXIgPSBzZWxlY3Rpb24uc3RhcnRMaW5lTnVtYmVyO1xuXHRcdFx0ZW5kaW5nQ3Vyc29yTGluZXMucHVzaChkZWxldGVEb3duKGxpbmVOdW1iZXIpKTtcblx0XHRcdGRlbGV0ZVVwKGxpbmVOdW1iZXIpO1xuXHRcdFx0Zm9yIChsZXQgaW5uZXIgPSBzZWxlY3Rpb24uc3RhcnRMaW5lTnVtYmVyOyBpbm5lciA8PSBzZWxlY3Rpb24uZW5kTGluZU51bWJlcjsgaW5uZXIrKykge1xuXHRcdFx0XHRsaW5lc1RvRGVsZXRlLmFkZChpbm5lcik7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0aWYgKGVuZGluZ0N1cnNvckxpbmVzLmxlbmd0aCA9PT0gMCkgeyBlbmRpbmdDdXJzb3JMaW5lcy5wdXNoKDEpOyB9XG5cblx0XHRjb25zdCBpc0RlZmluZWQgPSA8VD4oeDogVCB8IHVuZGVmaW5lZCk6IHggaXMgVCA9PiB4ICE9PSB1bmRlZmluZWQ7XG5cblx0XHRtb2RlbC5wdXNoRWRpdE9wZXJhdGlvbnModGhpcy5zZWFyY2hSZXN1bHRFZGl0b3IuZ2V0U2VsZWN0aW9ucygpLFxuXHRcdFx0Wy4uLmxpbmVzVG9EZWxldGVdLm1hcChsaW5lID0+ICh7IHJhbmdlOiBuZXcgUmFuZ2UobGluZSwgMSwgbGluZSArIDEsIDEpLCB0ZXh0OiAnJyB9KSksXG5cdFx0XHQoKSA9PiBlbmRpbmdDdXJzb3JMaW5lcy5maWx0ZXIoaXNEZWZpbmVkKS5tYXAobGluZSA9PiBuZXcgU2VsZWN0aW9uKGxpbmUsIDEsIGxpbmUsIDEpKSk7XG5cdH1cblxuXHRjbGVhblN0YXRlKCkge1xuXHRcdHRoaXMuZ2V0SW5wdXQoKT8uc2V0RGlydHkoZmFsc2UpO1xuXHR9XG5cblx0cHJpdmF0ZSBnZXQgc2VhcmNoQ29uZmlnKCk6IElTZWFyY2hDb25maWd1cmF0aW9uUHJvcGVydGllcyB7XG5cdFx0cmV0dXJuIHRoaXMuY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0VmFsdWU8SVNlYXJjaENvbmZpZ3VyYXRpb25Qcm9wZXJ0aWVzPignc2VhcmNoJyk7XG5cdH1cblxuXHRwcml2YXRlIGl0ZXJhdGVUaHJvdWdoTWF0Y2hlcyhyZXZlcnNlOiBib29sZWFuKSB7XG5cdFx0Y29uc3QgbW9kZWwgPSB0aGlzLnNlYXJjaFJlc3VsdEVkaXRvci5nZXRNb2RlbCgpO1xuXHRcdGlmICghbW9kZWwpIHsgcmV0dXJuOyB9XG5cblx0XHRjb25zdCBsYXN0TGluZSA9IG1vZGVsLmdldExpbmVDb3VudCgpID8/IDE7XG5cdFx0Y29uc3QgbGFzdENvbHVtbiA9IG1vZGVsLmdldExpbmVMZW5ndGgobGFzdExpbmUpO1xuXG5cdFx0Y29uc3QgZmFsbGJhY2tTdGFydCA9IHJldmVyc2UgPyBuZXcgUG9zaXRpb24obGFzdExpbmUsIGxhc3RDb2x1bW4pIDogbmV3IFBvc2l0aW9uKDEsIDEpO1xuXG5cdFx0Y29uc3QgY3VycmVudFBvc2l0aW9uID0gdGhpcy5zZWFyY2hSZXN1bHRFZGl0b3IuZ2V0U2VsZWN0aW9uKCk/LmdldFN0YXJ0UG9zaXRpb24oKSA/PyBmYWxsYmFja1N0YXJ0O1xuXG5cdFx0Y29uc3QgbWF0Y2hSYW5nZXMgPSB0aGlzLmdldElucHV0KCk/LmdldE1hdGNoUmFuZ2VzKCk7XG5cdFx0aWYgKCFtYXRjaFJhbmdlcykgeyByZXR1cm47IH1cblxuXHRcdGNvbnN0IG1hdGNoUmFuZ2UgPSAocmV2ZXJzZSA/IGZpbmRQcmV2UmFuZ2UgOiBmaW5kTmV4dFJhbmdlKShtYXRjaFJhbmdlcywgY3VycmVudFBvc2l0aW9uKTtcblx0XHRpZiAoIW1hdGNoUmFuZ2UpIHsgcmV0dXJuOyB9XG5cblx0XHR0aGlzLnNlYXJjaFJlc3VsdEVkaXRvci5zZXRTZWxlY3Rpb24obWF0Y2hSYW5nZSk7XG5cdFx0dGhpcy5zZWFyY2hSZXN1bHRFZGl0b3IucmV2ZWFsTGluZUluQ2VudGVySWZPdXRzaWRlVmlld3BvcnQobWF0Y2hSYW5nZS5zdGFydExpbmVOdW1iZXIpO1xuXHRcdHRoaXMuc2VhcmNoUmVzdWx0RWRpdG9yLmZvY3VzKCk7XG5cblx0XHRjb25zdCBtYXRjaExpbmVUZXh0ID0gbW9kZWwuZ2V0TGluZUNvbnRlbnQobWF0Y2hSYW5nZS5zdGFydExpbmVOdW1iZXIpO1xuXHRcdGNvbnN0IG1hdGNoVGV4dCA9IG1vZGVsLmdldFZhbHVlSW5SYW5nZShtYXRjaFJhbmdlKTtcblx0XHRsZXQgZmlsZSA9ICcnO1xuXHRcdGZvciAobGV0IGxpbmUgPSBtYXRjaFJhbmdlLnN0YXJ0TGluZU51bWJlcjsgbGluZSA+PSAxOyBsaW5lLS0pIHtcblx0XHRcdGNvbnN0IGxpbmVUZXh0ID0gbW9kZWwuZ2V0VmFsdWVJblJhbmdlKG5ldyBSYW5nZShsaW5lLCAxLCBsaW5lLCAyKSk7XG5cdFx0XHRpZiAobGluZVRleHQgIT09ICcgJykgeyBmaWxlID0gbW9kZWwuZ2V0TGluZUNvbnRlbnQobGluZSk7IGJyZWFrOyB9XG5cdFx0fVxuXHRcdGFsZXJ0KGxvY2FsaXplKCdzZWFyY2hSZXN1bHRJdGVtJywgXCJNYXRjaGVkIHswfSBhdCB7MX0gaW4gZmlsZSB7Mn1cIiwgbWF0Y2hUZXh0LCBtYXRjaExpbmVUZXh0LCBmaWxlLnNsaWNlKDAsIGZpbGUubGVuZ3RoIC0gMSkpKTtcblx0fVxuXG5cdGZvY3VzTmV4dFJlc3VsdCgpIHtcblx0XHR0aGlzLml0ZXJhdGVUaHJvdWdoTWF0Y2hlcyhmYWxzZSk7XG5cdH1cblxuXHRmb2N1c1ByZXZpb3VzUmVzdWx0KCkge1xuXHRcdHRoaXMuaXRlcmF0ZVRocm91Z2hNYXRjaGVzKHRydWUpO1xuXHR9XG5cblx0Zm9jdXNBbGxSZXN1bHRzKCkge1xuXHRcdHRoaXMuc2VhcmNoUmVzdWx0RWRpdG9yXG5cdFx0XHQuc2V0U2VsZWN0aW9ucygodGhpcy5nZXRJbnB1dCgpPy5nZXRNYXRjaFJhbmdlcygpID8/IFtdKS5tYXAoXG5cdFx0XHRcdHJhbmdlID0+IG5ldyBTZWxlY3Rpb24ocmFuZ2Uuc3RhcnRMaW5lTnVtYmVyLCByYW5nZS5zdGFydENvbHVtbiwgcmFuZ2UuZW5kTGluZU51bWJlciwgcmFuZ2UuZW5kQ29sdW1uKSkpO1xuXHRcdHRoaXMuc2VhcmNoUmVzdWx0RWRpdG9yLmZvY3VzKCk7XG5cdH1cblxuXHRhc3luYyB0cmlnZ2VyU2VhcmNoKF9vcHRpb25zPzogeyByZXNldEN1cnNvcj86IGJvb2xlYW47IGRlbGF5PzogbnVtYmVyOyBmb2N1c1Jlc3VsdHM/OiBib29sZWFuIH0pIHtcblx0XHRjb25zdCBmb2N1c1Jlc3VsdHMgPSB0aGlzLnNlYXJjaENvbmZpZy5zZWFyY2hFZGl0b3IuZm9jdXNSZXN1bHRzT25TZWFyY2g7XG5cblx0XHQvLyBJZiBfb3B0aW9ucyBkb24ndCBkZWZpbmUgZm9jdXNSZXN1bHQgZmllbGQsIHRoZW4gdXNlIHRoZSBzZXR0aW5nXG5cdFx0aWYgKF9vcHRpb25zID09PSB1bmRlZmluZWQpIHtcblx0XHRcdF9vcHRpb25zID0geyBmb2N1c1Jlc3VsdHM6IGZvY3VzUmVzdWx0cyB9O1xuXHRcdH0gZWxzZSBpZiAoX29wdGlvbnMuZm9jdXNSZXN1bHRzID09PSB1bmRlZmluZWQpIHtcblx0XHRcdF9vcHRpb25zLmZvY3VzUmVzdWx0cyA9IGZvY3VzUmVzdWx0cztcblx0XHR9XG5cblx0XHRjb25zdCBvcHRpb25zID0geyByZXNldEN1cnNvcjogdHJ1ZSwgZGVsYXk6IDAsIC4uLl9vcHRpb25zIH07XG5cblx0XHRpZiAoISh0aGlzLnF1ZXJ5RWRpdG9yV2lkZ2V0LnNlYXJjaElucHV0Py5pbnB1dEJveC5pc0lucHV0VmFsaWQoKSkpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRpZiAoIXRoaXMucGF1c2VTZWFyY2hpbmcpIHtcblx0XHRcdGF3YWl0IHRoaXMucnVuU2VhcmNoRGVsYXllci50cmlnZ2VyKGFzeW5jICgpID0+IHtcblx0XHRcdFx0dGhpcy50b2dnbGVSdW5BZ2Fpbk1lc3NhZ2UoZmFsc2UpO1xuXHRcdFx0XHRhd2FpdCB0aGlzLmRvUnVuU2VhcmNoKCk7XG5cdFx0XHRcdGlmIChvcHRpb25zLnJlc2V0Q3Vyc29yKSB7XG5cdFx0XHRcdFx0dGhpcy5zZWFyY2hSZXN1bHRFZGl0b3Iuc2V0UG9zaXRpb24obmV3IFBvc2l0aW9uKDEsIDEpKTtcblx0XHRcdFx0XHR0aGlzLnNlYXJjaFJlc3VsdEVkaXRvci5zZXRTY3JvbGxQb3NpdGlvbih7IHNjcm9sbFRvcDogMCwgc2Nyb2xsTGVmdDogMCB9KTtcblx0XHRcdFx0fVxuXHRcdFx0XHRpZiAob3B0aW9ucy5mb2N1c1Jlc3VsdHMpIHtcblx0XHRcdFx0XHR0aGlzLnNlYXJjaFJlc3VsdEVkaXRvci5mb2N1cygpO1xuXHRcdFx0XHR9XG5cdFx0XHR9LCBvcHRpb25zLmRlbGF5KTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIHJlYWRDb25maWdGcm9tV2lkZ2V0KCk6IFNlYXJjaENvbmZpZ3VyYXRpb24ge1xuXHRcdHJldHVybiB7XG5cdFx0XHRpc0Nhc2VTZW5zaXRpdmU6IHRoaXMucXVlcnlFZGl0b3JXaWRnZXQuc2VhcmNoSW5wdXQ/LmdldENhc2VTZW5zaXRpdmUoKSA/PyBmYWxzZSxcblx0XHRcdGNvbnRleHRMaW5lczogdGhpcy5xdWVyeUVkaXRvcldpZGdldC5nZXRDb250ZXh0TGluZXMoKSxcblx0XHRcdGZpbGVzVG9FeGNsdWRlOiB0aGlzLmlucHV0UGF0dGVybkV4Y2x1ZGVzLmdldFZhbHVlKCksXG5cdFx0XHRmaWxlc1RvSW5jbHVkZTogdGhpcy5pbnB1dFBhdHRlcm5JbmNsdWRlcy5nZXRWYWx1ZSgpLFxuXHRcdFx0cXVlcnk6IHRoaXMucXVlcnlFZGl0b3JXaWRnZXQuc2VhcmNoSW5wdXQ/LmdldFZhbHVlKCkgPz8gJycsXG5cdFx0XHRpc1JlZ2V4cDogdGhpcy5xdWVyeUVkaXRvcldpZGdldC5zZWFyY2hJbnB1dD8uZ2V0UmVnZXgoKSA/PyBmYWxzZSxcblx0XHRcdG1hdGNoV2hvbGVXb3JkOiB0aGlzLnF1ZXJ5RWRpdG9yV2lkZ2V0LnNlYXJjaElucHV0Py5nZXRXaG9sZVdvcmRzKCkgPz8gZmFsc2UsXG5cdFx0XHR1c2VFeGNsdWRlU2V0dGluZ3NBbmRJZ25vcmVGaWxlczogdGhpcy5pbnB1dFBhdHRlcm5FeGNsdWRlcy51c2VFeGNsdWRlc0FuZElnbm9yZUZpbGVzKCksXG5cdFx0XHRvbmx5T3BlbkVkaXRvcnM6IHRoaXMuaW5wdXRQYXR0ZXJuSW5jbHVkZXMub25seVNlYXJjaEluT3BlbkVkaXRvcnMoKSxcblx0XHRcdHNob3dJbmNsdWRlc0V4Y2x1ZGVzOiB0aGlzLnNob3dpbmdJbmNsdWRlc0V4Y2x1ZGVzLFxuXHRcdFx0bm90ZWJvb2tTZWFyY2hDb25maWc6IHtcblx0XHRcdFx0aW5jbHVkZU1hcmt1cElucHV0OiB0aGlzLnF1ZXJ5RWRpdG9yV2lkZ2V0LmdldE5vdGVib29rRmlsdGVycygpLm1hcmt1cElucHV0LFxuXHRcdFx0XHRpbmNsdWRlTWFya3VwUHJldmlldzogdGhpcy5xdWVyeUVkaXRvcldpZGdldC5nZXROb3RlYm9va0ZpbHRlcnMoKS5tYXJrdXBQcmV2aWV3LFxuXHRcdFx0XHRpbmNsdWRlQ29kZUlucHV0OiB0aGlzLnF1ZXJ5RWRpdG9yV2lkZ2V0LmdldE5vdGVib29rRmlsdGVycygpLmNvZGVJbnB1dCxcblx0XHRcdFx0aW5jbHVkZU91dHB1dDogdGhpcy5xdWVyeUVkaXRvcldpZGdldC5nZXROb3RlYm9va0ZpbHRlcnMoKS5jb2RlT3V0cHV0LFxuXHRcdFx0fVxuXHRcdH07XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIGRvUnVuU2VhcmNoKCkge1xuXHRcdHRoaXMuc2VhcmNoTW9kZWwuY2FuY2VsU2VhcmNoKHRydWUpO1xuXG5cdFx0Y29uc3Qgc3RhcnRJbnB1dCA9IHRoaXMuZ2V0SW5wdXQoKTtcblx0XHRpZiAoIXN0YXJ0SW5wdXQpIHsgcmV0dXJuOyB9XG5cblx0XHR0aGlzLnNlYXJjaEhpc3RvcnlEZWxheWVyLnRyaWdnZXIoKCkgPT4ge1xuXHRcdFx0dGhpcy5xdWVyeUVkaXRvcldpZGdldC5zZWFyY2hJbnB1dD8ub25TZWFyY2hTdWJtaXQoKTtcblx0XHRcdHRoaXMuaW5wdXRQYXR0ZXJuRXhjbHVkZXMub25TZWFyY2hTdWJtaXQoKTtcblx0XHRcdHRoaXMuaW5wdXRQYXR0ZXJuSW5jbHVkZXMub25TZWFyY2hTdWJtaXQoKTtcblx0XHR9KTtcblxuXHRcdGNvbnN0IGNvbmZpZyA9IHRoaXMucmVhZENvbmZpZ0Zyb21XaWRnZXQoKTtcblxuXHRcdGlmICghY29uZmlnLnF1ZXJ5KSB7IHJldHVybjsgfVxuXG5cdFx0Y29uc3QgY29udGVudDogSVBhdHRlcm5JbmZvID0ge1xuXHRcdFx0cGF0dGVybjogY29uZmlnLnF1ZXJ5LFxuXHRcdFx0aXNSZWdFeHA6IGNvbmZpZy5pc1JlZ2V4cCxcblx0XHRcdGlzQ2FzZVNlbnNpdGl2ZTogY29uZmlnLmlzQ2FzZVNlbnNpdGl2ZSxcblx0XHRcdGlzV29yZE1hdGNoOiBjb25maWcubWF0Y2hXaG9sZVdvcmQsXG5cdFx0fTtcblxuXHRcdGNvbnN0IG9wdGlvbnM6IElUZXh0UXVlcnlCdWlsZGVyT3B0aW9ucyA9IHtcblx0XHRcdF9yZWFzb246ICdzZWFyY2hFZGl0b3InLFxuXHRcdFx0ZXh0cmFGaWxlUmVzb3VyY2VzOiB0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLmludm9rZUZ1bmN0aW9uKGdldE91dE9mV29ya3NwYWNlRWRpdG9yUmVzb3VyY2VzKSxcblx0XHRcdG1heFJlc3VsdHM6IHRoaXMuc2VhcmNoQ29uZmlnLm1heFJlc3VsdHMgPz8gdW5kZWZpbmVkLFxuXHRcdFx0ZGlzcmVnYXJkSWdub3JlRmlsZXM6ICFjb25maWcudXNlRXhjbHVkZVNldHRpbmdzQW5kSWdub3JlRmlsZXMgfHwgdW5kZWZpbmVkLFxuXHRcdFx0ZGlzcmVnYXJkRXhjbHVkZVNldHRpbmdzOiAhY29uZmlnLnVzZUV4Y2x1ZGVTZXR0aW5nc0FuZElnbm9yZUZpbGVzIHx8IHVuZGVmaW5lZCxcblx0XHRcdGV4Y2x1ZGVQYXR0ZXJuOiBbeyBwYXR0ZXJuOiBjb25maWcuZmlsZXNUb0V4Y2x1ZGUgfV0sXG5cdFx0XHRpbmNsdWRlUGF0dGVybjogY29uZmlnLmZpbGVzVG9JbmNsdWRlLFxuXHRcdFx0b25seU9wZW5FZGl0b3JzOiBjb25maWcub25seU9wZW5FZGl0b3JzLFxuXHRcdFx0cHJldmlld09wdGlvbnM6IHtcblx0XHRcdFx0bWF0Y2hMaW5lczogMSxcblx0XHRcdFx0Y2hhcnNQZXJMaW5lOiAxMDAwXG5cdFx0XHR9LFxuXHRcdFx0c3Vycm91bmRpbmdDb250ZXh0OiBjb25maWcuY29udGV4dExpbmVzLFxuXHRcdFx0aXNTbWFydENhc2U6IHRoaXMuc2VhcmNoQ29uZmlnLnNtYXJ0Q2FzZSxcblx0XHRcdGV4cGFuZFBhdHRlcm5zOiB0cnVlLFxuXHRcdFx0bm90ZWJvb2tTZWFyY2hDb25maWc6IHtcblx0XHRcdFx0aW5jbHVkZU1hcmt1cElucHV0OiBjb25maWcubm90ZWJvb2tTZWFyY2hDb25maWcuaW5jbHVkZU1hcmt1cElucHV0LFxuXHRcdFx0XHRpbmNsdWRlTWFya3VwUHJldmlldzogY29uZmlnLm5vdGVib29rU2VhcmNoQ29uZmlnLmluY2x1ZGVNYXJrdXBQcmV2aWV3LFxuXHRcdFx0XHRpbmNsdWRlQ29kZUlucHV0OiBjb25maWcubm90ZWJvb2tTZWFyY2hDb25maWcuaW5jbHVkZUNvZGVJbnB1dCxcblx0XHRcdFx0aW5jbHVkZU91dHB1dDogY29uZmlnLm5vdGVib29rU2VhcmNoQ29uZmlnLmluY2x1ZGVPdXRwdXQsXG5cdFx0XHR9XG5cdFx0fTtcblxuXHRcdGNvbnN0IGZvbGRlclJlc291cmNlcyA9IHRoaXMuY29udGV4dFNlcnZpY2UuZ2V0V29ya3NwYWNlKCkuZm9sZGVycztcblx0XHRsZXQgcXVlcnk6IElUZXh0UXVlcnk7XG5cdFx0dHJ5IHtcblx0XHRcdGNvbnN0IHF1ZXJ5QnVpbGRlciA9IHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoUXVlcnlCdWlsZGVyKTtcblx0XHRcdHF1ZXJ5ID0gcXVlcnlCdWlsZGVyLnRleHQoY29udGVudCwgZm9sZGVyUmVzb3VyY2VzLm1hcChmb2xkZXIgPT4gZm9sZGVyLnVyaSksIG9wdGlvbnMpO1xuXHRcdH1cblx0XHRjYXRjaCAoZXJyKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0dGhpcy5zZWFyY2hPcGVyYXRpb24uc3RhcnQoNTAwKTtcblx0XHR0aGlzLm9uZ29pbmdPcGVyYXRpb25zKys7XG5cblx0XHRjb25zdCB7IGNvbmZpZ3VyYXRpb25Nb2RlbCB9ID0gYXdhaXQgc3RhcnRJbnB1dC5yZXNvbHZlTW9kZWxzKCk7XG5cdFx0Y29uZmlndXJhdGlvbk1vZGVsLnVwZGF0ZUNvbmZpZyhjb25maWcpO1xuXHRcdGNvbnN0IHJlc3VsdCA9IHRoaXMuc2VhcmNoTW9kZWwuc2VhcmNoKHF1ZXJ5KTtcblx0XHRzdGFydElucHV0Lm9uZ29pbmdTZWFyY2hPcGVyYXRpb24gPSByZXN1bHQuYXN5bmNSZXN1bHRzLmZpbmFsbHkoKCkgPT4ge1xuXHRcdFx0dGhpcy5vbmdvaW5nT3BlcmF0aW9ucy0tO1xuXHRcdFx0aWYgKHRoaXMub25nb2luZ09wZXJhdGlvbnMgPT09IDApIHtcblx0XHRcdFx0dGhpcy5zZWFyY2hPcGVyYXRpb24uc3RvcCgpO1xuXHRcdFx0fVxuXHRcdH0pO1xuXG5cdFx0Y29uc3Qgc2VhcmNoT3BlcmF0aW9uID0gYXdhaXQgc3RhcnRJbnB1dC5vbmdvaW5nU2VhcmNoT3BlcmF0aW9uO1xuXHRcdGF3YWl0IHRoaXMub25TZWFyY2hDb21wbGV0ZShzZWFyY2hPcGVyYXRpb24sIGNvbmZpZywgc3RhcnRJbnB1dCk7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIG9uU2VhcmNoQ29tcGxldGUoc2VhcmNoT3BlcmF0aW9uOiBJU2VhcmNoQ29tcGxldGUsIHN0YXJ0Q29uZmlnOiBTZWFyY2hDb25maWd1cmF0aW9uLCBzdGFydElucHV0OiBTZWFyY2hFZGl0b3JJbnB1dCkge1xuXHRcdGNvbnN0IGlucHV0ID0gdGhpcy5nZXRJbnB1dCgpO1xuXHRcdGlmICghaW5wdXQgfHxcblx0XHRcdGlucHV0ICE9PSBzdGFydElucHV0IHx8XG5cdFx0XHRKU09OLnN0cmluZ2lmeShzdGFydENvbmZpZykgIT09IEpTT04uc3RyaW5naWZ5KHRoaXMucmVhZENvbmZpZ0Zyb21XaWRnZXQoKSkpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRpbnB1dC5vbmdvaW5nU2VhcmNoT3BlcmF0aW9uID0gdW5kZWZpbmVkO1xuXG5cdFx0Y29uc3Qgc29ydE9yZGVyID0gdGhpcy5zZWFyY2hDb25maWcuc29ydE9yZGVyO1xuXHRcdGlmIChzb3J0T3JkZXIgPT09IFNlYXJjaFNvcnRPcmRlci5Nb2RpZmllZCkge1xuXHRcdFx0YXdhaXQgdGhpcy5yZXRyaWV2ZUZpbGVTdGF0cyh0aGlzLnNlYXJjaE1vZGVsLnNlYXJjaFJlc3VsdCk7XG5cdFx0fVxuXG5cdFx0Y29uc3QgY29udHJvbGxlciA9IFJlZmVyZW5jZXNDb250cm9sbGVyLmdldCh0aGlzLnNlYXJjaFJlc3VsdEVkaXRvcik7XG5cdFx0Y29udHJvbGxlcj8uY2xvc2VXaWRnZXQoZmFsc2UpO1xuXHRcdGNvbnN0IGxhYmVsRm9ybWF0dGVyID0gKHVyaTogVVJJKTogc3RyaW5nID0+IHRoaXMubGFiZWxTZXJ2aWNlLmdldFVyaUxhYmVsKHVyaSwgeyByZWxhdGl2ZTogdHJ1ZSB9KTtcblx0XHRjb25zdCByZXN1bHRzID0gc2VyaWFsaXplU2VhcmNoUmVzdWx0Rm9yRWRpdG9yKHRoaXMuc2VhcmNoTW9kZWwuc2VhcmNoUmVzdWx0LCBzdGFydENvbmZpZy5maWxlc1RvSW5jbHVkZSwgc3RhcnRDb25maWcuZmlsZXNUb0V4Y2x1ZGUsIHN0YXJ0Q29uZmlnLmNvbnRleHRMaW5lcywgbGFiZWxGb3JtYXR0ZXIsIHNvcnRPcmRlciwgc2VhcmNoT3BlcmF0aW9uPy5saW1pdEhpdCk7XG5cdFx0Y29uc3QgeyByZXN1bHRzTW9kZWwgfSA9IGF3YWl0IGlucHV0LnJlc29sdmVNb2RlbHMoKTtcblx0XHR0aGlzLnVwZGF0aW5nTW9kZWxGb3JTZWFyY2ggPSB0cnVlO1xuXHRcdHRoaXMubW9kZWxTZXJ2aWNlLnVwZGF0ZU1vZGVsKHJlc3VsdHNNb2RlbCwgcmVzdWx0cy50ZXh0KTtcblx0XHR0aGlzLnVwZGF0aW5nTW9kZWxGb3JTZWFyY2ggPSBmYWxzZTtcblxuXHRcdGlmIChzZWFyY2hPcGVyYXRpb24gJiYgc2VhcmNoT3BlcmF0aW9uLm1lc3NhZ2VzKSB7XG5cdFx0XHRmb3IgKGNvbnN0IG1lc3NhZ2Ugb2Ygc2VhcmNoT3BlcmF0aW9uLm1lc3NhZ2VzKSB7XG5cdFx0XHRcdHRoaXMuYWRkTWVzc2FnZShtZXNzYWdlKTtcblx0XHRcdH1cblx0XHR9XG5cdFx0dGhpcy5yZUxheW91dCgpO1xuXG5cdFx0aW5wdXQuc2V0RGlydHkoIWlucHV0Lmhhc0NhcGFiaWxpdHkoRWRpdG9ySW5wdXRDYXBhYmlsaXRpZXMuVW50aXRsZWQpKTtcblx0XHRpbnB1dC5zZXRNYXRjaFJhbmdlcyhyZXN1bHRzLm1hdGNoUmFuZ2VzKTtcblx0fVxuXG5cdHByaXZhdGUgYWRkTWVzc2FnZShtZXNzYWdlOiBUZXh0U2VhcmNoQ29tcGxldGVNZXNzYWdlKSB7XG5cdFx0bGV0IG1lc3NhZ2VCb3g6IEhUTUxFbGVtZW50O1xuXHRcdGlmICh0aGlzLm1lc3NhZ2VCb3guZmlyc3RDaGlsZCkge1xuXHRcdFx0bWVzc2FnZUJveCA9IHRoaXMubWVzc2FnZUJveC5maXJzdENoaWxkIGFzIEhUTUxFbGVtZW50O1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRtZXNzYWdlQm94ID0gRE9NLmFwcGVuZCh0aGlzLm1lc3NhZ2VCb3gsIERPTS4kKCcubWVzc2FnZScpKTtcblx0XHR9XG5cblx0XHRET00uYXBwZW5kKG1lc3NhZ2VCb3gsIHJlbmRlclNlYXJjaE1lc3NhZ2UobWVzc2FnZSwgdGhpcy5pbnN0YW50aWF0aW9uU2VydmljZSwgdGhpcy5ub3RpZmljYXRpb25TZXJ2aWNlLCB0aGlzLm9wZW5lclNlcnZpY2UsIHRoaXMuY29tbWFuZFNlcnZpY2UsIHRoaXMubWVzc2FnZURpc3Bvc2FibGVzLCAoKSA9PiB0aGlzLnRyaWdnZXJTZWFyY2goKSkpO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyByZXRyaWV2ZUZpbGVTdGF0cyhzZWFyY2hSZXN1bHQ6IElTZWFyY2hSZXN1bHQpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCBmaWxlcyA9IHNlYXJjaFJlc3VsdC5tYXRjaGVzKCkuZmlsdGVyKGYgPT4gIWYuZmlsZVN0YXQpLm1hcChmID0+IGYucmVzb2x2ZUZpbGVTdGF0KHRoaXMuZmlsZVNlcnZpY2UpKTtcblx0XHRhd2FpdCBQcm9taXNlLmFsbChmaWxlcyk7XG5cdH1cblxuXHRvdmVycmlkZSBsYXlvdXQoZGltZW5zaW9uOiBET00uRGltZW5zaW9uKSB7XG5cdFx0dGhpcy5kaW1lbnNpb24gPSBkaW1lbnNpb247XG5cdFx0dGhpcy5yZUxheW91dCgpO1xuXHR9XG5cblx0Z2V0U2VsZWN0ZWQoKSB7XG5cdFx0Y29uc3Qgc2VsZWN0aW9uID0gdGhpcy5zZWFyY2hSZXN1bHRFZGl0b3IuZ2V0U2VsZWN0aW9uKCk7XG5cdFx0aWYgKHNlbGVjdGlvbikge1xuXHRcdFx0cmV0dXJuIHRoaXMuc2VhcmNoUmVzdWx0RWRpdG9yLmdldE1vZGVsKCk/LmdldFZhbHVlSW5SYW5nZShzZWxlY3Rpb24pID8/ICcnO1xuXHRcdH1cblx0XHRyZXR1cm4gJyc7XG5cdH1cblxuXHRwcml2YXRlIHJlTGF5b3V0KCkge1xuXHRcdGlmICh0aGlzLmRpbWVuc2lvbikge1xuXHRcdFx0dGhpcy5xdWVyeUVkaXRvcldpZGdldC5zZXRXaWR0aCh0aGlzLmRpbWVuc2lvbi53aWR0aCAtIDI4IC8qIGNvbnRhaW5lciBtYXJnaW4gKi8pO1xuXHRcdFx0dGhpcy5zZWFyY2hSZXN1bHRFZGl0b3IubGF5b3V0KHsgaGVpZ2h0OiB0aGlzLmRpbWVuc2lvbi5oZWlnaHQgLSBET00uZ2V0VG90YWxIZWlnaHQodGhpcy5xdWVyeUVkaXRvckNvbnRhaW5lciksIHdpZHRoOiB0aGlzLmRpbWVuc2lvbi53aWR0aCB9KTtcblx0XHRcdHRoaXMuaW5wdXRQYXR0ZXJuRXhjbHVkZXMuc2V0V2lkdGgodGhpcy5kaW1lbnNpb24ud2lkdGggLSAyOCAvKiBjb250YWluZXIgbWFyZ2luICovKTtcblx0XHRcdHRoaXMuaW5wdXRQYXR0ZXJuSW5jbHVkZXMuc2V0V2lkdGgodGhpcy5kaW1lbnNpb24ud2lkdGggLSAyOCAvKiBjb250YWluZXIgbWFyZ2luICovKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIGdldElucHV0KCk6IFNlYXJjaEVkaXRvcklucHV0IHwgdW5kZWZpbmVkIHtcblx0XHRyZXR1cm4gdGhpcy5pbnB1dCBhcyBTZWFyY2hFZGl0b3JJbnB1dDtcblx0fVxuXG5cdHByaXZhdGUgcHJpb3JDb25maWc6IFBhcnRpYWw8UmVhZG9ubHk8U2VhcmNoQ29uZmlndXJhdGlvbj4+IHwgdW5kZWZpbmVkO1xuXHRzZXRTZWFyY2hDb25maWcoY29uZmlnOiBQYXJ0aWFsPFJlYWRvbmx5PFNlYXJjaENvbmZpZ3VyYXRpb24+Pikge1xuXHRcdHRoaXMucHJpb3JDb25maWcgPSBjb25maWc7XG5cdFx0aWYgKGNvbmZpZy5xdWVyeSAhPT0gdW5kZWZpbmVkKSB7IHRoaXMucXVlcnlFZGl0b3JXaWRnZXQuc2V0VmFsdWUoY29uZmlnLnF1ZXJ5KTsgfVxuXHRcdGlmIChjb25maWcuaXNDYXNlU2Vuc2l0aXZlICE9PSB1bmRlZmluZWQpIHsgdGhpcy5xdWVyeUVkaXRvcldpZGdldC5zZWFyY2hJbnB1dD8uc2V0Q2FzZVNlbnNpdGl2ZShjb25maWcuaXNDYXNlU2Vuc2l0aXZlKTsgfVxuXHRcdGlmIChjb25maWcuaXNSZWdleHAgIT09IHVuZGVmaW5lZCkgeyB0aGlzLnF1ZXJ5RWRpdG9yV2lkZ2V0LnNlYXJjaElucHV0Py5zZXRSZWdleChjb25maWcuaXNSZWdleHApOyB9XG5cdFx0aWYgKGNvbmZpZy5tYXRjaFdob2xlV29yZCAhPT0gdW5kZWZpbmVkKSB7IHRoaXMucXVlcnlFZGl0b3JXaWRnZXQuc2VhcmNoSW5wdXQ/LnNldFdob2xlV29yZHMoY29uZmlnLm1hdGNoV2hvbGVXb3JkKTsgfVxuXHRcdGlmIChjb25maWcuY29udGV4dExpbmVzICE9PSB1bmRlZmluZWQpIHsgdGhpcy5xdWVyeUVkaXRvcldpZGdldC5zZXRDb250ZXh0TGluZXMoY29uZmlnLmNvbnRleHRMaW5lcyk7IH1cblx0XHRpZiAoY29uZmlnLmZpbGVzVG9FeGNsdWRlICE9PSB1bmRlZmluZWQpIHsgdGhpcy5pbnB1dFBhdHRlcm5FeGNsdWRlcy5zZXRWYWx1ZShjb25maWcuZmlsZXNUb0V4Y2x1ZGUpOyB9XG5cdFx0aWYgKGNvbmZpZy5maWxlc1RvSW5jbHVkZSAhPT0gdW5kZWZpbmVkKSB7IHRoaXMuaW5wdXRQYXR0ZXJuSW5jbHVkZXMuc2V0VmFsdWUoY29uZmlnLmZpbGVzVG9JbmNsdWRlKTsgfVxuXHRcdGlmIChjb25maWcub25seU9wZW5FZGl0b3JzICE9PSB1bmRlZmluZWQpIHsgdGhpcy5pbnB1dFBhdHRlcm5JbmNsdWRlcy5zZXRPbmx5U2VhcmNoSW5PcGVuRWRpdG9ycyhjb25maWcub25seU9wZW5FZGl0b3JzKTsgfVxuXHRcdGlmIChjb25maWcudXNlRXhjbHVkZVNldHRpbmdzQW5kSWdub3JlRmlsZXMgIT09IHVuZGVmaW5lZCkgeyB0aGlzLmlucHV0UGF0dGVybkV4Y2x1ZGVzLnNldFVzZUV4Y2x1ZGVzQW5kSWdub3JlRmlsZXMoY29uZmlnLnVzZUV4Y2x1ZGVTZXR0aW5nc0FuZElnbm9yZUZpbGVzKTsgfVxuXHRcdGlmIChjb25maWcuc2hvd0luY2x1ZGVzRXhjbHVkZXMgIT09IHVuZGVmaW5lZCkgeyB0aGlzLnRvZ2dsZUluY2x1ZGVzRXhjbHVkZXMoY29uZmlnLnNob3dJbmNsdWRlc0V4Y2x1ZGVzKTsgfVxuXHR9XG5cblx0b3ZlcnJpZGUgYXN5bmMgc2V0SW5wdXQobmV3SW5wdXQ6IFNlYXJjaEVkaXRvcklucHV0LCBvcHRpb25zOiBJRWRpdG9yT3B0aW9ucyB8IHVuZGVmaW5lZCwgY29udGV4dDogSUVkaXRvck9wZW5Db250ZXh0LCB0b2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4pOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRhd2FpdCBzdXBlci5zZXRJbnB1dChuZXdJbnB1dCwgb3B0aW9ucywgY29udGV4dCwgdG9rZW4pO1xuXHRcdGlmICh0b2tlbi5pc0NhbmNlbGxhdGlvblJlcXVlc3RlZCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IHsgY29uZmlndXJhdGlvbk1vZGVsLCByZXN1bHRzTW9kZWwgfSA9IGF3YWl0IG5ld0lucHV0LnJlc29sdmVNb2RlbHMoKTtcblx0XHRpZiAodG9rZW4uaXNDYW5jZWxsYXRpb25SZXF1ZXN0ZWQpIHsgcmV0dXJuOyB9XG5cblx0XHR0aGlzLnNlYXJjaFJlc3VsdEVkaXRvci5zZXRNb2RlbChyZXN1bHRzTW9kZWwpO1xuXHRcdHRoaXMucGF1c2VTZWFyY2hpbmcgPSB0cnVlO1xuXG5cdFx0dGhpcy50b2dnbGVSdW5BZ2Fpbk1lc3NhZ2UoIW5ld0lucHV0Lm9uZ29pbmdTZWFyY2hPcGVyYXRpb24gJiYgcmVzdWx0c01vZGVsLmdldExpbmVDb3VudCgpID09PSAxICYmIHJlc3VsdHNNb2RlbC5nZXRWYWx1ZUxlbmd0aCgpID09PSAwICYmIGNvbmZpZ3VyYXRpb25Nb2RlbC5jb25maWcucXVlcnkgIT09ICcnKTtcblxuXHRcdHRoaXMuc2V0U2VhcmNoQ29uZmlnKGNvbmZpZ3VyYXRpb25Nb2RlbC5jb25maWcpO1xuXG5cdFx0dGhpcy5fcmVnaXN0ZXIoY29uZmlndXJhdGlvbk1vZGVsLm9uQ29uZmlnRGlkVXBkYXRlKG5ld0NvbmZpZyA9PiB7XG5cdFx0XHRpZiAobmV3Q29uZmlnICE9PSB0aGlzLnByaW9yQ29uZmlnKSB7XG5cdFx0XHRcdHRoaXMucGF1c2VTZWFyY2hpbmcgPSB0cnVlO1xuXHRcdFx0XHR0aGlzLnNldFNlYXJjaENvbmZpZyhuZXdDb25maWcpO1xuXHRcdFx0XHR0aGlzLnBhdXNlU2VhcmNoaW5nID0gZmFsc2U7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXG5cdFx0dGhpcy5yZXN0b3JlVmlld1N0YXRlKGNvbnRleHQpO1xuXG5cdFx0aWYgKCFvcHRpb25zPy5wcmVzZXJ2ZUZvY3VzKSB7XG5cdFx0XHR0aGlzLmZvY3VzKCk7XG5cdFx0fVxuXG5cdFx0dGhpcy5wYXVzZVNlYXJjaGluZyA9IGZhbHNlO1xuXG5cdFx0aWYgKG5ld0lucHV0Lm9uZ29pbmdTZWFyY2hPcGVyYXRpb24pIHtcblx0XHRcdGNvbnN0IGV4aXN0aW5nQ29uZmlnID0gdGhpcy5yZWFkQ29uZmlnRnJvbVdpZGdldCgpO1xuXHRcdFx0bmV3SW5wdXQub25nb2luZ1NlYXJjaE9wZXJhdGlvbi50aGVuKGNvbXBsZXRlID0+IHtcblx0XHRcdFx0dGhpcy5vblNlYXJjaENvbXBsZXRlKGNvbXBsZXRlLCBleGlzdGluZ0NvbmZpZywgbmV3SW5wdXQpO1xuXHRcdFx0fSk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSB0b2dnbGVJbmNsdWRlc0V4Y2x1ZGVzKF9zaG91bGRTaG93PzogYm9vbGVhbik6IHZvaWQge1xuXHRcdGNvbnN0IGNscyA9ICdleHBhbmRlZCc7XG5cdFx0Y29uc3Qgc2hvdWxkU2hvdyA9IF9zaG91bGRTaG93ID8/ICF0aGlzLmluY2x1ZGVzRXhjbHVkZXNDb250YWluZXIuY2xhc3NMaXN0LmNvbnRhaW5zKGNscyk7XG5cblx0XHRpZiAoc2hvdWxkU2hvdykge1xuXHRcdFx0dGhpcy50b2dnbGVRdWVyeURldGFpbHNCdXR0b24uc2V0QXR0cmlidXRlKCdhcmlhLWV4cGFuZGVkJywgJ3RydWUnKTtcblx0XHRcdHRoaXMuaW5jbHVkZXNFeGNsdWRlc0NvbnRhaW5lci5jbGFzc0xpc3QuYWRkKGNscyk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHRoaXMudG9nZ2xlUXVlcnlEZXRhaWxzQnV0dG9uLnNldEF0dHJpYnV0ZSgnYXJpYS1leHBhbmRlZCcsICdmYWxzZScpO1xuXHRcdFx0dGhpcy5pbmNsdWRlc0V4Y2x1ZGVzQ29udGFpbmVyLmNsYXNzTGlzdC5yZW1vdmUoY2xzKTtcblx0XHR9XG5cblx0XHR0aGlzLnNob3dpbmdJbmNsdWRlc0V4Y2x1ZGVzID0gdGhpcy5pbmNsdWRlc0V4Y2x1ZGVzQ29udGFpbmVyLmNsYXNzTGlzdC5jb250YWlucyhjbHMpO1xuXG5cdFx0dGhpcy5yZUxheW91dCgpO1xuXHR9XG5cblx0cHJvdGVjdGVkIG92ZXJyaWRlIHRvRWRpdG9yVmlld1N0YXRlUmVzb3VyY2UoaW5wdXQ6IEVkaXRvcklucHV0KTogVVJJIHwgdW5kZWZpbmVkIHtcblx0XHRpZiAoaW5wdXQudHlwZUlkID09PSBTZWFyY2hFZGl0b3JJbnB1dFR5cGVJZCkge1xuXHRcdFx0cmV0dXJuIChpbnB1dCBhcyBTZWFyY2hFZGl0b3JJbnB1dCkubW9kZWxVcmk7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0fVxuXG5cdHByb3RlY3RlZCBvdmVycmlkZSBjb21wdXRlRWRpdG9yVmlld1N0YXRlKHJlc291cmNlOiBVUkkpOiBTZWFyY2hFZGl0b3JWaWV3U3RhdGUgfCB1bmRlZmluZWQge1xuXHRcdGNvbnN0IGNvbnRyb2wgPSB0aGlzLmdldENvbnRyb2woKTtcblx0XHRjb25zdCBlZGl0b3JWaWV3U3RhdGUgPSBjb250cm9sLnNhdmVWaWV3U3RhdGUoKTtcblx0XHRpZiAoIWVkaXRvclZpZXdTdGF0ZSkgeyByZXR1cm4gdW5kZWZpbmVkOyB9XG5cdFx0aWYgKHJlc291cmNlLnRvU3RyaW5nKCkgIT09IHRoaXMuZ2V0SW5wdXQoKT8ubW9kZWxVcmkudG9TdHJpbmcoKSkgeyByZXR1cm4gdW5kZWZpbmVkOyB9XG5cblx0XHRyZXR1cm4geyAuLi5lZGl0b3JWaWV3U3RhdGUsIGZvY3VzZWQ6IHRoaXMuc2VhcmNoUmVzdWx0RWRpdG9yLmhhc1dpZGdldEZvY3VzKCkgPyAnZWRpdG9yJyA6ICdpbnB1dCcgfTtcblx0fVxuXG5cdHByb3RlY3RlZCB0cmFja3NFZGl0b3JWaWV3U3RhdGUoaW5wdXQ6IEVkaXRvcklucHV0KTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuIGlucHV0LnR5cGVJZCA9PT0gU2VhcmNoRWRpdG9ySW5wdXRUeXBlSWQ7XG5cdH1cblxuXHRwcml2YXRlIHJlc3RvcmVWaWV3U3RhdGUoY29udGV4dDogSUVkaXRvck9wZW5Db250ZXh0KSB7XG5cdFx0Y29uc3Qgdmlld1N0YXRlID0gdGhpcy5sb2FkRWRpdG9yVmlld1N0YXRlKHRoaXMuZ2V0SW5wdXQoKSwgY29udGV4dCk7XG5cdFx0aWYgKHZpZXdTdGF0ZSkgeyB0aGlzLnNlYXJjaFJlc3VsdEVkaXRvci5yZXN0b3JlVmlld1N0YXRlKHZpZXdTdGF0ZSk7IH1cblx0fVxuXG5cdGdldEFyaWFMYWJlbCgpIHtcblx0XHRyZXR1cm4gdGhpcy5nZXRJbnB1dCgpPy5nZXROYW1lKCkgPz8gbG9jYWxpemUoJ3NlYXJjaEVkaXRvcicsIFwiU2VhcmNoXCIpO1xuXHR9XG59XG5cbmNvbnN0IHNlYXJjaEVkaXRvclRleHRJbnB1dEJvcmRlciA9IHJlZ2lzdGVyQ29sb3IoJ3NlYXJjaEVkaXRvci50ZXh0SW5wdXRCb3JkZXInLCBpbnB1dEJvcmRlciwgbG9jYWxpemUoJ3RleHRJbnB1dEJveEJvcmRlcicsIFwiU2VhcmNoIGVkaXRvciB0ZXh0IGlucHV0IGJveCBib3JkZXIuXCIpKTtcblxuZnVuY3Rpb24gZmluZE5leHRSYW5nZShtYXRjaFJhbmdlczogUmFuZ2VbXSwgY3VycmVudFBvc2l0aW9uOiBQb3NpdGlvbikge1xuXHRmb3IgKGNvbnN0IG1hdGNoUmFuZ2Ugb2YgbWF0Y2hSYW5nZXMpIHtcblx0XHRpZiAoUG9zaXRpb24uaXNCZWZvcmUoY3VycmVudFBvc2l0aW9uLCBtYXRjaFJhbmdlLmdldFN0YXJ0UG9zaXRpb24oKSkpIHtcblx0XHRcdHJldHVybiBtYXRjaFJhbmdlO1xuXHRcdH1cblx0fVxuXHRyZXR1cm4gbWF0Y2hSYW5nZXNbMF07XG59XG5cbmZ1bmN0aW9uIGZpbmRQcmV2UmFuZ2UobWF0Y2hSYW5nZXM6IFJhbmdlW10sIGN1cnJlbnRQb3NpdGlvbjogUG9zaXRpb24pIHtcblx0Zm9yIChsZXQgaSA9IG1hdGNoUmFuZ2VzLmxlbmd0aCAtIDE7IGkgPj0gMDsgaS0tKSB7XG5cdFx0Y29uc3QgbWF0Y2hSYW5nZSA9IG1hdGNoUmFuZ2VzW2ldO1xuXHRcdGlmIChQb3NpdGlvbi5pc0JlZm9yZShtYXRjaFJhbmdlLmdldFN0YXJ0UG9zaXRpb24oKSwgY3VycmVudFBvc2l0aW9uKSkge1xuXHRcdFx0e1xuXHRcdFx0XHRyZXR1cm4gbWF0Y2hSYW5nZTtcblx0XHRcdH1cblx0XHR9XG5cdH1cblx0cmV0dXJuIG1hdGNoUmFuZ2VzW21hdGNoUmFuZ2VzLmxlbmd0aCAtIDFdO1xufVxuIl0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7Ozs7QUFLQSxZQUFZLFNBQVM7QUFDckIsU0FBUyw2QkFBNkI7QUFDdEMsU0FBUyxhQUFhO0FBQ3RCLFNBQVMsZUFBZTtBQUV4QixTQUFTLFNBQVMsY0FBYztBQUNoQyxTQUFTLHVCQUF1QjtBQUNoQyxTQUFTLDRCQUE0QjtBQUVyQyxPQUFPO0FBRVAsU0FBUyxnQkFBZ0I7QUFDekIsU0FBUyxhQUFhO0FBQ3RCLFNBQVMsaUJBQWlCO0FBRTFCLFNBQVMscUJBQXFCO0FBQzlCLFNBQVMseUNBQXlDO0FBQ2xELFNBQVMsNEJBQTRCO0FBQ3JDLFNBQVMsZ0JBQWdCO0FBQ3pCLFNBQVMsdUJBQXVCO0FBQ2hDLFNBQVMsNkJBQTZCO0FBQ3RDLFNBQXNCLDBCQUEwQjtBQUNoRCxTQUFTLDJCQUEyQjtBQUNwQyxTQUFTLDZCQUE2QjtBQUN0QyxTQUFTLHlCQUF5QjtBQUNsQyxTQUFTLHFCQUFxQjtBQUM5QixTQUFTLHdCQUF3Qiw0QkFBNEI7QUFDN0QsU0FBUyx1QkFBdUI7QUFDaEMsU0FBUyx5QkFBeUI7QUFDbEMsU0FBUyxhQUFhLHFCQUFxQjtBQUMzQyxTQUFTLHFCQUFxQjtBQUM5QixTQUFTLGlCQUFpQjtBQUMxQixTQUFTLGdDQUFnQztBQUN6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
