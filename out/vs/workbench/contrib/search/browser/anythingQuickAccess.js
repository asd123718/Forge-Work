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
import "./media/anythingQuickAccess.css";
import { quickPickItemScorerAccessor, QuickPickItemScorerAccessor, QuickInputHideReason, IQuickInputService } from "../../../../platform/quickinput/common/quickInput.js";
import { PickerQuickAccessProvider, TriggerAction } from "../../../../platform/quickinput/browser/pickerQuickAccess.js";
import { prepareQuery, compareItemsByFuzzyScore, scoreItemFuzzy } from "../../../../base/common/fuzzyScorer.js";
import { QueryBuilder } from "../../../services/search/common/queryBuilder.js";
import { IInstantiationService } from "../../../../platform/instantiation/common/instantiation.js";
import { getOutOfWorkspaceEditorResources, extractRangeFromFilter } from "../common/search.js";
import { ISearchService } from "../../../services/search/common/search.js";
import { IWorkspaceContextService } from "../../../../platform/workspace/common/workspace.js";
import { untildify } from "../../../../base/common/labels.js";
import { IPathService } from "../../../services/path/common/pathService.js";
import { URI } from "../../../../base/common/uri.js";
import { toLocalResource, dirname, basenameOrAuthority } from "../../../../base/common/resources.js";
import { IWorkbenchEnvironmentService } from "../../../services/environment/common/environmentService.js";
import { IFileService } from "../../../../platform/files/common/files.js";
import { DisposableStore, toDisposable, MutableDisposable, Disposable } from "../../../../base/common/lifecycle.js";
import { ILabelService } from "../../../../platform/label/common/label.js";
import { getIconClasses } from "../../../../editor/common/services/getIconClasses.js";
import { IModelService } from "../../../../editor/common/services/model.js";
import { ILanguageService } from "../../../../editor/common/languages/language.js";
import { localize } from "../../../../nls.js";
import { IWorkingCopyService } from "../../../services/workingCopy/common/workingCopyService.js";
import { IConfigurationService } from "../../../../platform/configuration/common/configuration.js";
import { EditorResourceAccessor, isEditorInput } from "../../../common/editor.js";
import { IEditorService, SIDE_GROUP, ACTIVE_GROUP } from "../../../services/editor/common/editorService.js";
import { ThrottledDelayer } from "../../../../base/common/async.js";
import { top } from "../../../../base/common/arrays.js";
import { FileQueryCacheState } from "../common/cacheState.js";
import { IHistoryService } from "../../../services/history/common/history.js";
import { Schemas } from "../../../../base/common/network.js";
import { IFilesConfigurationService } from "../../../services/filesConfiguration/common/filesConfigurationService.js";
import { ResourceMap } from "../../../../base/common/map.js";
import { SymbolsQuickAccessProvider } from "./symbolsQuickAccess.js";
import { DefaultQuickAccessFilterValue, Extensions } from "../../../../platform/quickinput/common/quickAccess.js";
import { PickerEditorState } from "../../../browser/quickaccess.js";
import { GotoSymbolQuickAccessProvider } from "../../codeEditor/browser/quickaccess/gotoSymbolQuickAccess.js";
import { ITextModelService } from "../../../../editor/common/services/resolverService.js";
import { ScrollType } from "../../../../editor/common/editorCommon.js";
import { Event } from "../../../../base/common/event.js";
import { Codicon } from "../../../../base/common/codicons.js";
import { ThemeIcon } from "../../../../base/common/themables.js";
import { IUriIdentityService } from "../../../../platform/uriIdentity/common/uriIdentity.js";
import { stripIcons } from "../../../../base/common/iconLabels.js";
import { Lazy } from "../../../../base/common/lazy.js";
import { IKeybindingService } from "../../../../platform/keybinding/common/keybinding.js";
import { IContextKeyService } from "../../../../platform/contextkey/common/contextkey.js";
import { Registry } from "../../../../platform/registry/common/platform.js";
import { ASK_QUICK_QUESTION_ACTION_ID } from "../../chat/browser/actions/chatQuickInputActions.js";
import { IChatWidgetService, IQuickChatService } from "../../chat/browser/chat.js";
import { ILogService } from "../../../../platform/log/common/log.js";
import { ICustomEditorLabelService } from "../../../services/editor/common/customEditorLabelService.js";
function isEditorSymbolQuickPickItem(pick) {
  const candidate = pick;
  return !!candidate?.range && !!candidate.resource;
}
let AnythingQuickAccessProvider = class extends PickerQuickAccessProvider {
  constructor(instantiationService, searchService, contextService, pathService, environmentService, fileService, labelService, modelService, languageService, workingCopyService, configurationService, editorService, historyService, filesConfigurationService, textModelService, uriIdentityService, quickInputService, keybindingService, contextKeyService, quickChatService, logService, customEditorLabelService, chatWidgetService) {
    super(AnythingQuickAccessProvider.PREFIX, {
      canAcceptInBackground: true,
      noResultsPick: AnythingQuickAccessProvider.NO_RESULTS_PICK
    });
    this.instantiationService = instantiationService;
    this.searchService = searchService;
    this.contextService = contextService;
    this.pathService = pathService;
    this.environmentService = environmentService;
    this.fileService = fileService;
    this.labelService = labelService;
    this.modelService = modelService;
    this.languageService = languageService;
    this.workingCopyService = workingCopyService;
    this.configurationService = configurationService;
    this.editorService = editorService;
    this.historyService = historyService;
    this.filesConfigurationService = filesConfigurationService;
    this.textModelService = textModelService;
    this.uriIdentityService = uriIdentityService;
    this.quickInputService = quickInputService;
    this.keybindingService = keybindingService;
    this.contextKeyService = contextKeyService;
    this.quickChatService = quickChatService;
    this.logService = logService;
    this.customEditorLabelService = customEditorLabelService;
    this.chatWidgetService = chatWidgetService;
    //#region Editor History
    this.labelOnlyEditorHistoryPickAccessor = new QuickPickItemScorerAccessor({ skipDescription: true });
    //#endregion
    //#region File Search
    this.fileQueryDelayer = this._register(new ThrottledDelayer(AnythingQuickAccessProvider.TYPING_SEARCH_DELAY));
    //#endregion
    //#region Command Center (if enabled)
    this.lazyRegistry = new Lazy(() => Registry.as(Extensions.Quickaccess));
    this.pickState = this._register(new class extends Disposable {
      constructor(provider, instantiationService2) {
        super();
        this.provider = provider;
        this.picker = void 0;
        this.scorerCache = /* @__PURE__ */ Object.create(null);
        this.fileQueryCache = void 0;
        this.lastOriginalFilter = void 0;
        this.lastFilter = void 0;
        this.lastRange = void 0;
        this.lastGlobalPicks = void 0;
        this.isQuickNavigating = void 0;
        this.editorViewState = this._register(instantiationService2.createInstance(PickerEditorState));
      }
      set(picker) {
        this.picker = picker;
        Event.once(picker.onDispose)(() => {
          if (picker === this.picker) {
            this.picker = void 0;
          }
        });
        const isQuickNavigating = !!picker.quickNavigate;
        if (!isQuickNavigating) {
          this.fileQueryCache = this.provider.createFileQueryCache();
          this.scorerCache = /* @__PURE__ */ Object.create(null);
        }
        this.isQuickNavigating = isQuickNavigating;
        this.lastOriginalFilter = void 0;
        this.lastFilter = void 0;
        this.lastRange = void 0;
        this.lastGlobalPicks = void 0;
        this.editorViewState.reset();
      }
    }(this, instantiationService));
    this.fileQueryBuilder = this.instantiationService.createInstance(QueryBuilder);
    this.workspaceSymbolsQuickAccess = this._register(instantiationService.createInstance(SymbolsQuickAccessProvider));
    this.editorSymbolsQuickAccess = this.instantiationService.createInstance(GotoSymbolQuickAccessProvider);
  }
  get defaultFilterValue() {
    if (this.configuration.preserveInput) {
      return DefaultQuickAccessFilterValue.LAST;
    }
    return void 0;
  }
  get configuration() {
    const editorConfig = this.configurationService.getValue().workbench?.editor;
    const searchConfig = this.configurationService.getValue().search;
    const quickAccessConfig = this.configurationService.getValue().workbench.quickOpen;
    return {
      openEditorPinned: !editorConfig?.enablePreviewFromQuickOpen || !editorConfig?.enablePreview,
      openSideBySideDirection: editorConfig?.openSideBySideDirection,
      includeSymbols: searchConfig?.quickOpen?.includeSymbols,
      includeHistory: searchConfig?.quickOpen?.includeHistory ?? true,
      historyFilterSortOrder: searchConfig?.quickOpen?.history?.filterSortOrder,
      preserveInput: quickAccessConfig?.preserveInput
    };
  }
  provide(picker, token, runOptions) {
    const disposables = new DisposableStore();
    this.pickState.set(picker);
    const editorDecorationsDisposable = disposables.add(new MutableDisposable());
    disposables.add(picker.onDidChangeActive(() => {
      editorDecorationsDisposable.value = void 0;
      const [item] = picker.activeItems;
      if (isEditorSymbolQuickPickItem(item)) {
        editorDecorationsDisposable.value = this.decorateAndRevealSymbolRange(item);
      }
    }));
    disposables.add(Event.once(picker.onDidHide)(({ reason }) => {
      if (reason === QuickInputHideReason.Gesture) {
        this.pickState.editorViewState.restore();
      }
    }));
    disposables.add(super.provide(picker, token, runOptions));
    return disposables;
  }
  decorateAndRevealSymbolRange(pick) {
    const activeEditor = this.editorService.activeEditor;
    if (!this.uriIdentityService.extUri.isEqual(pick.resource, activeEditor?.resource)) {
      return Disposable.None;
    }
    const activeEditorControl = this.editorService.activeTextEditorControl;
    if (!activeEditorControl) {
      return Disposable.None;
    }
    this.pickState.editorViewState.set();
    activeEditorControl.revealRangeInCenter(pick.range.selection, ScrollType.Smooth);
    this.addDecorations(activeEditorControl, pick.range.decoration);
    return toDisposable(() => this.clearDecorations(activeEditorControl));
  }
  _getPicks(originalFilter, disposables, token, runOptions) {
    const filterWithRange = extractRangeFromFilter(originalFilter, [GotoSymbolQuickAccessProvider.PREFIX]);
    let filter;
    if (filterWithRange) {
      filter = filterWithRange.filter;
    } else {
      filter = originalFilter;
    }
    this.pickState.lastRange = filterWithRange?.range;
    if (originalFilter !== this.pickState.lastOriginalFilter && filter === this.pickState.lastFilter) {
      return null;
    }
    const lastWasFiltering = !!this.pickState.lastOriginalFilter;
    this.pickState.lastOriginalFilter = originalFilter;
    this.pickState.lastFilter = filter;
    const picks = this.pickState.picker?.items;
    const activePick = this.pickState.picker?.activeItems[0];
    if (picks && activePick) {
      const activePickIsEditorSymbol = isEditorSymbolQuickPickItem(activePick);
      const activePickIsNoResultsInEditorSymbols = activePick === AnythingQuickAccessProvider.NO_RESULTS_PICK && filter.indexOf(GotoSymbolQuickAccessProvider.PREFIX) >= 0;
      if (!activePickIsEditorSymbol && !activePickIsNoResultsInEditorSymbols) {
        this.pickState.lastGlobalPicks = {
          items: picks,
          active: activePick
        };
      }
    }
    return this.doGetPicks(
      filter,
      {
        ...runOptions,
        enableEditorSymbolSearch: lastWasFiltering
      },
      disposables,
      token
    );
  }
  doGetPicks(filter, options, disposables, token) {
    const query = prepareQuery(filter);
    if (options.enableEditorSymbolSearch) {
      const editorSymbolPicks = this.getEditorSymbolPicks(query, disposables, token);
      if (editorSymbolPicks) {
        return editorSymbolPicks;
      }
    }
    const activePick = this.pickState.picker?.activeItems[0];
    if (isEditorSymbolQuickPickItem(activePick) && this.pickState.lastGlobalPicks) {
      return this.pickState.lastGlobalPicks;
    }
    const historyEditorPicks = this.getEditorHistoryPicks(query);
    let picks = new Array();
    if (options.additionPicks) {
      for (const pick of options.additionPicks) {
        if (pick.type === "separator") {
          picks.push(pick);
          continue;
        }
        if (!query.original) {
          pick.highlights = void 0;
          picks.push(pick);
          continue;
        }
        const { score, labelMatch, descriptionMatch } = scoreItemFuzzy(pick, query, true, quickPickItemScorerAccessor, this.pickState.scorerCache);
        if (!score) {
          continue;
        }
        pick.highlights = {
          label: labelMatch,
          description: descriptionMatch
        };
        picks.push(pick);
      }
    }
    if (this.pickState.isQuickNavigating) {
      if (picks.length > 0) {
        picks.push({ type: "separator", label: localize("recentlyOpenedSeparator", "recently opened") });
      }
      picks = historyEditorPicks;
    } else {
      if (options.includeHelp) {
        picks.push(...this.getHelpPicks(query, token, options));
      }
      if (historyEditorPicks.length !== 0) {
        picks.push({ type: "separator", label: localize("recentlyOpenedSeparator", "recently opened") });
        picks.push(...historyEditorPicks);
      }
    }
    return {
      // Fast picks: help (if included) & editor history
      picks: options.filter ? picks.filter((p) => options.filter?.(p)) : picks,
      // Slow picks: files and symbols
      additionalPicks: (async () => {
        const additionalPicksExcludes = new ResourceMap((uri) => this.uriIdentityService.extUri.getComparisonKey(uri));
        for (const historyEditorPick of historyEditorPicks) {
          if (historyEditorPick.resource) {
            additionalPicksExcludes.set(historyEditorPick.resource, true);
          }
        }
        let additionalPicks = await this.getAdditionalPicks(query, additionalPicksExcludes, Boolean(this.configuration?.includeSymbols), token);
        if (options.filter) {
          additionalPicks = additionalPicks.filter((p) => options.filter?.(p));
        }
        if (token.isCancellationRequested) {
          return [];
        }
        return additionalPicks.length > 0 ? [
          { type: "separator", label: this.configuration.includeSymbols ? localize("fileAndSymbolResultsSeparator", "file and symbol results") : localize("fileResultsSeparator", "file results") },
          ...additionalPicks
        ] : [];
      })(),
      // allow some time to merge files and symbols to reduce flickering
      mergeDelay: AnythingQuickAccessProvider.SYMBOL_PICKS_MERGE_DELAY
    };
  }
  async getAdditionalPicks(query, excludes, includeSymbols, token) {
    const [filePicks, symbolPicks] = await Promise.all([
      this.getFilePicks(query, excludes, token),
      this.getWorkspaceSymbolPicks(query, includeSymbols, token)
    ]);
    if (token.isCancellationRequested) {
      return [];
    }
    const sortedAnythingPicks = top(
      [...filePicks, ...symbolPicks],
      (anyPickA, anyPickB) => compareItemsByFuzzyScore(anyPickA, anyPickB, query, true, quickPickItemScorerAccessor, this.pickState.scorerCache),
      AnythingQuickAccessProvider.MAX_RESULTS
    );
    const filteredAnythingPicks = [];
    for (const anythingPick of sortedAnythingPicks) {
      if (anythingPick.highlights) {
        filteredAnythingPicks.push(anythingPick);
      } else {
        const { score, labelMatch, descriptionMatch } = scoreItemFuzzy(anythingPick, query, true, quickPickItemScorerAccessor, this.pickState.scorerCache);
        if (!score) {
          continue;
        }
        anythingPick.highlights = {
          label: labelMatch,
          description: descriptionMatch
        };
        filteredAnythingPicks.push(anythingPick);
      }
    }
    return filteredAnythingPicks;
  }
  getEditorHistoryPicks(query) {
    const configuration = this.configuration;
    if (!query.normalized) {
      return this.historyService.getHistory().map((editor) => this.createAnythingPick(editor, configuration));
    }
    if (!this.configuration.includeHistory) {
      return [];
    }
    const editorHistoryScorerAccessor = query.containsPathSeparator ? quickPickItemScorerAccessor : this.labelOnlyEditorHistoryPickAccessor;
    const editorHistoryPicks = [];
    for (const editor of this.historyService.getHistory()) {
      const resource = editor.resource;
      if (!resource) {
        continue;
      }
      const editorHistoryPick = this.createAnythingPick(editor, configuration);
      const { score, labelMatch, descriptionMatch } = scoreItemFuzzy(editorHistoryPick, query, false, editorHistoryScorerAccessor, this.pickState.scorerCache);
      if (!score) {
        continue;
      }
      editorHistoryPick.highlights = {
        label: labelMatch,
        description: descriptionMatch
      };
      editorHistoryPicks.push(editorHistoryPick);
    }
    if (this.configuration.historyFilterSortOrder === "recency") {
      return editorHistoryPicks;
    }
    return editorHistoryPicks.sort((editorA, editorB) => compareItemsByFuzzyScore(editorA, editorB, query, false, editorHistoryScorerAccessor, this.pickState.scorerCache));
  }
  createFileQueryCache() {
    return new FileQueryCacheState(
      (cacheKey) => this.fileQueryBuilder.file(this.contextService.getWorkspace().folders, this.getFileQueryOptions({ cacheKey })),
      (query) => this.searchService.fileSearch(query),
      (cacheKey) => this.searchService.clearCache(cacheKey),
      this.pickState.fileQueryCache
    ).load();
  }
  async getFilePicks(query, excludes, token) {
    if (!query.normalized) {
      return [];
    }
    const absolutePathResult = await this.getAbsolutePathFileResult(query, token);
    if (token.isCancellationRequested) {
      return [];
    }
    let fileMatches;
    if (absolutePathResult) {
      if (excludes.has(absolutePathResult)) {
        return [];
      }
      const absolutePathPick = this.createAnythingPick(absolutePathResult, this.configuration);
      absolutePathPick.highlights = {
        label: [{ start: 0, end: absolutePathPick.label.length }],
        description: absolutePathPick.description ? [{ start: 0, end: absolutePathPick.description.length }] : void 0
      };
      return [absolutePathPick];
    }
    if (this.pickState.fileQueryCache?.isLoaded) {
      fileMatches = await this.doFileSearch(query, token);
    } else {
      fileMatches = await this.fileQueryDelayer.trigger(async () => {
        if (token.isCancellationRequested) {
          return [];
        }
        return this.doFileSearch(query, token);
      });
    }
    if (token.isCancellationRequested) {
      return [];
    }
    const configuration = this.configuration;
    return fileMatches.filter((resource) => !excludes.has(resource)).map((resource) => this.createAnythingPick(resource, configuration));
  }
  async doFileSearch(query, token) {
    const [fileSearchResults, relativePathFileResults] = await Promise.all([
      // File search: this is a search over all files of the workspace using the provided pattern
      this.getFileSearchResults(query, token),
      // Relative path search: we also want to consider results that match files inside the workspace
      // by looking for relative paths that the user typed as query. This allows to return even excluded
      // results into the picker if found (e.g. helps for opening compilation results that are otherwise
      // excluded)
      this.getRelativePathFileResults(query, token)
    ]);
    if (token.isCancellationRequested) {
      return [];
    }
    if (!relativePathFileResults) {
      return fileSearchResults;
    }
    const relativePathFileResultsMap = new ResourceMap((uri) => this.uriIdentityService.extUri.getComparisonKey(uri));
    for (const relativePathFileResult of relativePathFileResults) {
      relativePathFileResultsMap.set(relativePathFileResult, true);
    }
    return [
      ...fileSearchResults.filter((result) => !relativePathFileResultsMap.has(result)),
      ...relativePathFileResults
    ];
  }
  async getFileSearchResults(query, token) {
    let filePattern = "";
    if (query.values && query.values.length > 1) {
      filePattern = query.values[0].original;
    } else {
      filePattern = query.original;
    }
    const fileSearchResults = await this.doGetFileSearchResults(filePattern, token);
    if (token.isCancellationRequested) {
      return [];
    }
    if (fileSearchResults.limitHit && query.values && query.values.length > 1) {
      const additionalFileSearchResults = await this.doGetFileSearchResults(query.original, token);
      if (token.isCancellationRequested) {
        return [];
      }
      const existingFileSearchResultsMap = new ResourceMap((uri) => this.uriIdentityService.extUri.getComparisonKey(uri));
      for (const fileSearchResult of fileSearchResults.results) {
        existingFileSearchResultsMap.set(fileSearchResult.resource, true);
      }
      for (const additionalFileSearchResult of additionalFileSearchResults.results) {
        if (!existingFileSearchResultsMap.has(additionalFileSearchResult.resource)) {
          fileSearchResults.results.push(additionalFileSearchResult);
        }
      }
    }
    return fileSearchResults.results.map((result) => result.resource);
  }
  doGetFileSearchResults(filePattern, token) {
    const start = Date.now();
    return this.searchService.fileSearch(
      this.fileQueryBuilder.file(
        this.contextService.getWorkspace().folders,
        this.getFileQueryOptions({
          filePattern,
          cacheKey: this.pickState.fileQueryCache?.cacheKey,
          maxResults: AnythingQuickAccessProvider.MAX_RESULTS
        })
      ),
      token
    ).finally(() => {
      this.logService.trace(`QuickAccess fileSearch ${Date.now() - start}ms`);
    });
  }
  getFileQueryOptions(input) {
    return {
      _reason: "openFileHandler",
      // used for telemetry - do not change
      extraFileResources: this.instantiationService.invokeFunction(getOutOfWorkspaceEditorResources),
      filePattern: input.filePattern || "",
      cacheKey: input.cacheKey,
      maxResults: input.maxResults || 0,
      sortByScore: true
    };
  }
  async getAbsolutePathFileResult(query, token) {
    if (!query.containsPathSeparator) {
      return;
    }
    const userHome = await this.pathService.userHome();
    const detildifiedQuery = untildify(query.original, userHome.scheme === Schemas.file ? userHome.fsPath : userHome.path);
    if (token.isCancellationRequested) {
      return;
    }
    const isAbsolutePathQuery = (await this.pathService.path).isAbsolute(detildifiedQuery);
    if (token.isCancellationRequested) {
      return;
    }
    if (isAbsolutePathQuery) {
      const resource = toLocalResource(
        await this.pathService.fileURI(detildifiedQuery),
        this.environmentService.remoteAuthority,
        this.pathService.defaultUriScheme
      );
      if (token.isCancellationRequested) {
        return;
      }
      try {
        const stat = await this.fileService.stat(resource);
        if (stat.isFile) {
          return await this.matchFilenameCasing(resource);
        }
      } catch (error) {
      }
    }
    return;
  }
  async getRelativePathFileResults(query, token) {
    if (!query.containsPathSeparator) {
      return;
    }
    const isAbsolutePathQuery = (await this.pathService.path).isAbsolute(query.original);
    if (!isAbsolutePathQuery) {
      const resources = [];
      for (const folder of this.contextService.getWorkspace().folders) {
        if (token.isCancellationRequested) {
          break;
        }
        const resource = toLocalResource(
          folder.toResource(query.original),
          this.environmentService.remoteAuthority,
          this.pathService.defaultUriScheme
        );
        try {
          const stat = await this.fileService.stat(resource);
          if (stat.isFile) {
            resources.push(await this.matchFilenameCasing(resource));
          }
        } catch (error) {
        }
      }
      return resources;
    }
    return;
  }
  /**
   * Attempts to match the filename casing to file system by checking the parent folder's children.
   */
  async matchFilenameCasing(resource) {
    const parent = dirname(resource);
    const stat = await this.fileService.resolve(parent, { resolveTo: [resource] });
    if (stat?.children) {
      const match = stat.children.find((child) => this.uriIdentityService.extUri.isEqual(child.resource, resource));
      if (match) {
        return URI.joinPath(parent, match.name);
      }
    }
    return resource;
  }
  getHelpPicks(query, token, runOptions) {
    if (query.normalized) {
      return [];
    }
    const providers = this.lazyRegistry.value.getQuickAccessProviders(this.contextKeyService).filter((p) => p.helpEntries.some((h) => h.commandCenterOrder !== void 0)).flatMap((provider) => provider.helpEntries.filter((h) => h.commandCenterOrder !== void 0).map((helpEntry) => {
      const providerSpecificOptions = {
        ...runOptions,
        includeHelp: provider.prefix === AnythingQuickAccessProvider.PREFIX ? false : runOptions?.includeHelp
      };
      const label = helpEntry.commandCenterLabel ?? helpEntry.description;
      return {
        label,
        description: helpEntry.prefix ?? provider.prefix,
        commandCenterOrder: helpEntry.commandCenterOrder,
        keybinding: helpEntry.commandId ? this.keybindingService.lookupKeybinding(helpEntry.commandId) : void 0,
        ariaLabel: localize("helpPickAriaLabel", "{0}, {1}", label, helpEntry.description),
        accept: () => {
          this.quickInputService.quickAccess.show(provider.prefix, {
            preserveValue: true,
            providerOptions: providerSpecificOptions
          });
        }
      };
    }));
    if (this.quickChatService.enabled) {
      providers.push({
        label: localize("chat", "Open Quick Chat"),
        commandCenterOrder: 30,
        keybinding: this.keybindingService.lookupKeybinding(ASK_QUICK_QUESTION_ACTION_ID),
        accept: () => this.quickChatService.toggle()
      });
    }
    return providers.sort((a, b) => a.commandCenterOrder - b.commandCenterOrder);
  }
  async getWorkspaceSymbolPicks(query, includeSymbols, token) {
    if (!query.normalized || // we need a value for search for
    !includeSymbols || // we need to enable symbols in search
    this.pickState.lastRange) {
      return [];
    }
    return this.workspaceSymbolsQuickAccess.getSymbolPicks(query.original, {
      skipLocal: true,
      skipSorting: true,
      delay: AnythingQuickAccessProvider.TYPING_SEARCH_DELAY
    }, token);
  }
  getEditorSymbolPicks(query, disposables, token) {
    const filterSegments = query.original.split(GotoSymbolQuickAccessProvider.PREFIX);
    const filter = filterSegments.length > 1 ? filterSegments[filterSegments.length - 1].trim() : void 0;
    if (typeof filter !== "string") {
      return null;
    }
    const activeGlobalPick = this.pickState.lastGlobalPicks?.active;
    if (!activeGlobalPick) {
      return null;
    }
    const activeGlobalResource = activeGlobalPick.resource;
    if (!activeGlobalResource || !this.fileService.hasProvider(activeGlobalResource) && activeGlobalResource.scheme !== Schemas.untitled) {
      return null;
    }
    if (activeGlobalPick.label.includes(GotoSymbolQuickAccessProvider.PREFIX) || activeGlobalPick.description?.includes(GotoSymbolQuickAccessProvider.PREFIX)) {
      if (filterSegments.length < 3) {
        return null;
      }
    }
    return this.doGetEditorSymbolPicks(activeGlobalPick, activeGlobalResource, filter, disposables, token);
  }
  async doGetEditorSymbolPicks(activeGlobalPick, activeGlobalResource, filter, disposables, token) {
    try {
      this.pickState.editorViewState.set();
      await this.pickState.editorViewState.openTransientEditor({
        resource: activeGlobalResource,
        options: { preserveFocus: true, revealIfOpened: true, ignoreError: true }
      });
    } catch (error) {
      return [];
    }
    if (token.isCancellationRequested) {
      return [];
    }
    let model = this.modelService.getModel(activeGlobalResource);
    if (!model) {
      try {
        const modelReference = disposables.add(await this.textModelService.createModelReference(activeGlobalResource));
        if (token.isCancellationRequested) {
          return [];
        }
        model = modelReference.object.textEditorModel;
      } catch (error) {
        return [];
      }
    }
    const editorSymbolPicks = await this.editorSymbolsQuickAccess.getSymbolPicks(model, filter, { extraContainerLabel: stripIcons(activeGlobalPick.label) }, disposables, token);
    if (token.isCancellationRequested) {
      return [];
    }
    return editorSymbolPicks.map((editorSymbolPick) => {
      if (editorSymbolPick.type === "separator") {
        return editorSymbolPick;
      }
      return {
        ...editorSymbolPick,
        resource: activeGlobalResource,
        description: editorSymbolPick.description,
        trigger: (buttonIndex, keyMods) => {
          this.openAnything(activeGlobalResource, { keyMods, range: editorSymbolPick.range?.selection, forceOpenSideBySide: true });
          return TriggerAction.CLOSE_PICKER;
        },
        accept: (keyMods, event) => this.openAnything(activeGlobalResource, { keyMods, range: editorSymbolPick.range?.selection, preserveFocus: event.inBackground, forcePinned: event.inBackground })
      };
    });
  }
  addDecorations(editor, range) {
    this.editorSymbolsQuickAccess.addDecorations(editor, range);
  }
  clearDecorations(editor) {
    this.editorSymbolsQuickAccess.clearDecorations(editor);
  }
  //#endregion
  //#region Helpers
  createAnythingPick(resourceOrEditor, configuration) {
    const isEditorHistoryEntry = !URI.isUri(resourceOrEditor);
    let resource;
    let label;
    let description = void 0;
    let isDirty = void 0;
    let extraClasses;
    let icon = void 0;
    if (isEditorInput(resourceOrEditor)) {
      resource = EditorResourceAccessor.getOriginalUri(resourceOrEditor);
      label = resourceOrEditor.getName();
      description = resourceOrEditor.getDescription();
      isDirty = resourceOrEditor.isDirty() && !resourceOrEditor.isSaving();
      extraClasses = resourceOrEditor.getLabelExtraClasses();
      icon = resourceOrEditor.getIcon();
    } else {
      resource = URI.isUri(resourceOrEditor) ? resourceOrEditor : resourceOrEditor.resource;
      const customLabel = this.customEditorLabelService.getName(resource);
      label = customLabel || basenameOrAuthority(resource);
      description = this.labelService.getUriLabel(!!customLabel ? resource : dirname(resource), { relative: true });
      isDirty = this.workingCopyService.isDirty(resource) && !this.filesConfigurationService.hasShortAutoSaveDelay(resource);
      extraClasses = [];
    }
    const labelAndDescription = description ? `${label} ${description}` : label;
    const iconClassesValue = new Lazy(() => getIconClasses(this.modelService, this.languageService, resource, void 0, icon).concat(extraClasses));
    const buttonsValue = new Lazy(() => {
      const openSideBySideDirection = configuration.openSideBySideDirection;
      const buttons = [];
      buttons.push({
        iconClass: openSideBySideDirection === "right" ? ThemeIcon.asClassName(Codicon.splitHorizontal) : ThemeIcon.asClassName(Codicon.splitVertical),
        tooltip: openSideBySideDirection === "right" ? localize({ key: "openToSide", comment: ["Open this file in a split editor on the left/right side"] }, "Open to the Side") : localize({ key: "openToBottom", comment: ["Open this file in a split editor on the bottom"] }, "Open to the Bottom")
      });
      if (isEditorHistoryEntry) {
        buttons.push({
          iconClass: isDirty ? "dirty-anything " + ThemeIcon.asClassName(Codicon.circleFilled) : ThemeIcon.asClassName(Codicon.close),
          tooltip: localize("closeEditor", "Remove from Recently Opened"),
          alwaysVisible: isDirty
        });
      }
      return buttons;
    });
    return {
      resource,
      editor: !URI.isUri(resourceOrEditor) ? resourceOrEditor : void 0,
      label,
      ariaLabel: isDirty ? localize("filePickAriaLabelDirty", "{0} unsaved changes", labelAndDescription) : labelAndDescription,
      description,
      iconPath: URI.isUri(icon) ? { dark: icon } : void 0,
      get iconClasses() {
        return iconClassesValue.value;
      },
      get buttons() {
        return buttonsValue.value;
      },
      trigger: (buttonIndex, keyMods) => {
        switch (buttonIndex) {
          // Open to side / below
          case 0:
            this.openAnything(resourceOrEditor, { keyMods, range: this.pickState.lastRange, forceOpenSideBySide: true });
            return TriggerAction.CLOSE_PICKER;
          // Remove from History
          case 1:
            if (!URI.isUri(resourceOrEditor)) {
              this.historyService.removeFromHistory(resourceOrEditor);
              return TriggerAction.REMOVE_ITEM;
            }
        }
        return TriggerAction.NO_ACTION;
      },
      accept: (keyMods, event) => this.openAnything(resourceOrEditor, { keyMods, range: this.pickState.lastRange, preserveFocus: event.inBackground, forcePinned: event.inBackground }),
      attach: (keyMods, event) => {
        if (keyMods.shift) {
          const widget = this.chatWidgetService.lastFocusedWidget;
          if (widget && resource) {
            widget.attachmentModel.addContext(widget.attachmentModel.asFileVariableEntry(resource));
          }
          return;
        }
        this.openAnything(resourceOrEditor, { keyMods, range: this.pickState.lastRange, preserveFocus: event.inBackground, forcePinned: event.inBackground });
      }
    };
  }
  async openAnything(resourceOrEditor, options) {
    const editorOptions = {
      preserveFocus: options.preserveFocus,
      pinned: options.keyMods?.ctrlCmd || options.forcePinned || this.configuration.openEditorPinned,
      selection: options.range
    };
    const targetGroup = options.keyMods?.alt || this.configuration.openEditorPinned && options.keyMods?.ctrlCmd || options.forceOpenSideBySide ? SIDE_GROUP : ACTIVE_GROUP;
    if (targetGroup === SIDE_GROUP) {
      await this.pickState.editorViewState.restore();
    }
    if (isEditorInput(resourceOrEditor)) {
      await this.editorService.openEditor(resourceOrEditor, editorOptions, targetGroup);
    } else {
      let resourceEditorInput;
      if (URI.isUri(resourceOrEditor)) {
        resourceEditorInput = {
          resource: resourceOrEditor,
          options: editorOptions
        };
      } else {
        resourceEditorInput = {
          ...resourceOrEditor,
          options: {
            ...resourceOrEditor.options,
            ...editorOptions
          }
        };
      }
      await this.editorService.openEditor(resourceEditorInput, targetGroup);
    }
  }
  //#endregion
};
AnythingQuickAccessProvider.PREFIX = "";
AnythingQuickAccessProvider.NO_RESULTS_PICK = {
  label: localize("noAnythingResults", "No matching results")
};
AnythingQuickAccessProvider.MAX_RESULTS = 512;
AnythingQuickAccessProvider.TYPING_SEARCH_DELAY = 200;
// this delay accommodates for the user typing a word and then stops typing to start searching
AnythingQuickAccessProvider.SYMBOL_PICKS_MERGE_DELAY = 200;
AnythingQuickAccessProvider = __decorateClass([
  __decorateParam(0, IInstantiationService),
  __decorateParam(1, ISearchService),
  __decorateParam(2, IWorkspaceContextService),
  __decorateParam(3, IPathService),
  __decorateParam(4, IWorkbenchEnvironmentService),
  __decorateParam(5, IFileService),
  __decorateParam(6, ILabelService),
  __decorateParam(7, IModelService),
  __decorateParam(8, ILanguageService),
  __decorateParam(9, IWorkingCopyService),
  __decorateParam(10, IConfigurationService),
  __decorateParam(11, IEditorService),
  __decorateParam(12, IHistoryService),
  __decorateParam(13, IFilesConfigurationService),
  __decorateParam(14, ITextModelService),
  __decorateParam(15, IUriIdentityService),
  __decorateParam(16, IQuickInputService),
  __decorateParam(17, IKeybindingService),
  __decorateParam(18, IContextKeyService),
  __decorateParam(19, IQuickChatService),
  __decorateParam(20, ILogService),
  __decorateParam(21, ICustomEditorLabelService),
  __decorateParam(22, IChatWidgetService)
], AnythingQuickAccessProvider);
export {
  AnythingQuickAccessProvider
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXHNlYXJjaFxcYnJvd3NlclxcYW55dGhpbmdRdWlja0FjY2Vzcy50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCAnLi9tZWRpYS9hbnl0aGluZ1F1aWNrQWNjZXNzLmNzcyc7XG5pbXBvcnQgeyBJUXVpY2tJbnB1dEJ1dHRvbiwgSUtleU1vZHMsIHF1aWNrUGlja0l0ZW1TY29yZXJBY2Nlc3NvciwgUXVpY2tQaWNrSXRlbVNjb3JlckFjY2Vzc29yLCBJUXVpY2tQaWNrLCBJUXVpY2tQaWNrSXRlbVdpdGhSZXNvdXJjZSwgUXVpY2tJbnB1dEhpZGVSZWFzb24sIElRdWlja0lucHV0U2VydmljZSwgSVF1aWNrUGlja1NlcGFyYXRvciB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3F1aWNraW5wdXQvY29tbW9uL3F1aWNrSW5wdXQuanMnO1xuaW1wb3J0IHsgSVBpY2tlclF1aWNrQWNjZXNzSXRlbSwgUGlja2VyUXVpY2tBY2Nlc3NQcm92aWRlciwgVHJpZ2dlckFjdGlvbiwgRmFzdEFuZFNsb3dQaWNrcywgUGlja3MsIFBpY2tzV2l0aEFjdGl2ZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3F1aWNraW5wdXQvYnJvd3Nlci9waWNrZXJRdWlja0FjY2Vzcy5qcyc7XG5pbXBvcnQgeyBwcmVwYXJlUXVlcnksIElQcmVwYXJlZFF1ZXJ5LCBjb21wYXJlSXRlbXNCeUZ1enp5U2NvcmUsIHNjb3JlSXRlbUZ1enp5LCBGdXp6eVNjb3JlckNhY2hlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vZnV6enlTY29yZXIuanMnO1xuaW1wb3J0IHsgSUZpbGVRdWVyeUJ1aWxkZXJPcHRpb25zLCBRdWVyeUJ1aWxkZXIgfSBmcm9tICcuLi8uLi8uLi9zZXJ2aWNlcy9zZWFyY2gvY29tbW9uL3F1ZXJ5QnVpbGRlci5qcyc7XG5pbXBvcnQgeyBJSW5zdGFudGlhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9pbnN0YW50aWF0aW9uL2NvbW1vbi9pbnN0YW50aWF0aW9uLmpzJztcbmltcG9ydCB7IGdldE91dE9mV29ya3NwYWNlRWRpdG9yUmVzb3VyY2VzLCBleHRyYWN0UmFuZ2VGcm9tRmlsdGVyLCBJV29ya2JlbmNoU2VhcmNoQ29uZmlndXJhdGlvbiB9IGZyb20gJy4uL2NvbW1vbi9zZWFyY2guanMnO1xuaW1wb3J0IHsgSVNlYXJjaFNlcnZpY2UsIElTZWFyY2hDb21wbGV0ZSB9IGZyb20gJy4uLy4uLy4uL3NlcnZpY2VzL3NlYXJjaC9jb21tb24vc2VhcmNoLmpzJztcbmltcG9ydCB7IElXb3Jrc3BhY2VDb250ZXh0U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3dvcmtzcGFjZS9jb21tb24vd29ya3NwYWNlLmpzJztcbmltcG9ydCB7IHVudGlsZGlmeSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xhYmVscy5qcyc7XG5pbXBvcnQgeyBJUGF0aFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9zZXJ2aWNlcy9wYXRoL2NvbW1vbi9wYXRoU2VydmljZS5qcyc7XG5pbXBvcnQgeyBVUkkgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi91cmkuanMnO1xuaW1wb3J0IHsgdG9Mb2NhbFJlc291cmNlLCBkaXJuYW1lLCBiYXNlbmFtZU9yQXV0aG9yaXR5IH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vcmVzb3VyY2VzLmpzJztcbmltcG9ydCB7IElXb3JrYmVuY2hFbnZpcm9ubWVudFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9zZXJ2aWNlcy9lbnZpcm9ubWVudC9jb21tb24vZW52aXJvbm1lbnRTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElGaWxlU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2ZpbGVzL2NvbW1vbi9maWxlcy5qcyc7XG5pbXBvcnQgeyBDYW5jZWxsYXRpb25Ub2tlbiB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2NhbmNlbGxhdGlvbi5qcyc7XG5pbXBvcnQgeyBEaXNwb3NhYmxlU3RvcmUsIElEaXNwb3NhYmxlLCB0b0Rpc3Bvc2FibGUsIE11dGFibGVEaXNwb3NhYmxlLCBEaXNwb3NhYmxlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IElMYWJlbFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9sYWJlbC9jb21tb24vbGFiZWwuanMnO1xuaW1wb3J0IHsgZ2V0SWNvbkNsYXNzZXMgfSBmcm9tICcuLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL3NlcnZpY2VzL2dldEljb25DbGFzc2VzLmpzJztcbmltcG9ydCB7IElNb2RlbFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL3NlcnZpY2VzL21vZGVsLmpzJztcbmltcG9ydCB7IElMYW5ndWFnZVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL2xhbmd1YWdlcy9sYW5ndWFnZS5qcyc7XG5pbXBvcnQgeyBsb2NhbGl6ZSB9IGZyb20gJy4uLy4uLy4uLy4uL25scy5qcyc7XG5pbXBvcnQgeyBJV29ya2luZ0NvcHlTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vc2VydmljZXMvd29ya2luZ0NvcHkvY29tbW9uL3dvcmtpbmdDb3B5U2VydmljZS5qcyc7XG5pbXBvcnQgeyBJQ29uZmlndXJhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb25maWd1cmF0aW9uL2NvbW1vbi9jb25maWd1cmF0aW9uLmpzJztcbmltcG9ydCB7IElXb3JrYmVuY2hFZGl0b3JDb25maWd1cmF0aW9uLCBFZGl0b3JSZXNvdXJjZUFjY2Vzc29yLCBpc0VkaXRvcklucHV0IH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2VkaXRvci5qcyc7XG5pbXBvcnQgeyBFZGl0b3JJbnB1dCB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9lZGl0b3IvZWRpdG9ySW5wdXQuanMnO1xuaW1wb3J0IHsgSUVkaXRvclNlcnZpY2UsIFNJREVfR1JPVVAsIEFDVElWRV9HUk9VUCB9IGZyb20gJy4uLy4uLy4uL3NlcnZpY2VzL2VkaXRvci9jb21tb24vZWRpdG9yU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJUmFuZ2UgfSBmcm9tICcuLi8uLi8uLi8uLi9lZGl0b3IvY29tbW9uL2NvcmUvcmFuZ2UuanMnO1xuaW1wb3J0IHsgVGhyb3R0bGVkRGVsYXllciB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2FzeW5jLmpzJztcbmltcG9ydCB7IHRvcCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2FycmF5cy5qcyc7XG5pbXBvcnQgeyBGaWxlUXVlcnlDYWNoZVN0YXRlIH0gZnJvbSAnLi4vY29tbW9uL2NhY2hlU3RhdGUuanMnO1xuaW1wb3J0IHsgSUhpc3RvcnlTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vc2VydmljZXMvaGlzdG9yeS9jb21tb24vaGlzdG9yeS5qcyc7XG5pbXBvcnQgeyBJUmVzb3VyY2VFZGl0b3JJbnB1dCwgSVRleHRFZGl0b3JPcHRpb25zIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vZWRpdG9yL2NvbW1vbi9lZGl0b3IuanMnO1xuaW1wb3J0IHsgU2NoZW1hcyB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL25ldHdvcmsuanMnO1xuaW1wb3J0IHsgSUZpbGVzQ29uZmlndXJhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9zZXJ2aWNlcy9maWxlc0NvbmZpZ3VyYXRpb24vY29tbW9uL2ZpbGVzQ29uZmlndXJhdGlvblNlcnZpY2UuanMnO1xuaW1wb3J0IHsgUmVzb3VyY2VNYXAgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9tYXAuanMnO1xuaW1wb3J0IHsgU3ltYm9sc1F1aWNrQWNjZXNzUHJvdmlkZXIgfSBmcm9tICcuL3N5bWJvbHNRdWlja0FjY2Vzcy5qcyc7XG5pbXBvcnQgeyBBbnl0aGluZ1F1aWNrQWNjZXNzUHJvdmlkZXJSdW5PcHRpb25zLCBEZWZhdWx0UXVpY2tBY2Nlc3NGaWx0ZXJWYWx1ZSwgRXh0ZW5zaW9ucywgSVF1aWNrQWNjZXNzUmVnaXN0cnkgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9xdWlja2lucHV0L2NvbW1vbi9xdWlja0FjY2Vzcy5qcyc7XG5pbXBvcnQgeyBQaWNrZXJFZGl0b3JTdGF0ZSwgSVdvcmtiZW5jaFF1aWNrQWNjZXNzQ29uZmlndXJhdGlvbiB9IGZyb20gJy4uLy4uLy4uL2Jyb3dzZXIvcXVpY2thY2Nlc3MuanMnO1xuaW1wb3J0IHsgR290b1N5bWJvbFF1aWNrQWNjZXNzUHJvdmlkZXIgfSBmcm9tICcuLi8uLi9jb2RlRWRpdG9yL2Jyb3dzZXIvcXVpY2thY2Nlc3MvZ290b1N5bWJvbFF1aWNrQWNjZXNzLmpzJztcbmltcG9ydCB7IElUZXh0TW9kZWxTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9zZXJ2aWNlcy9yZXNvbHZlclNlcnZpY2UuanMnO1xuaW1wb3J0IHsgU2Nyb2xsVHlwZSwgSUVkaXRvciB9IGZyb20gJy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vZWRpdG9yQ29tbW9uLmpzJztcbmltcG9ydCB7IEV2ZW50IH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vZXZlbnQuanMnO1xuaW1wb3J0IHsgQ29kaWNvbiB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2NvZGljb25zLmpzJztcbmltcG9ydCB7IFRoZW1lSWNvbiB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3RoZW1hYmxlcy5qcyc7XG5pbXBvcnQgeyBJVXJpSWRlbnRpdHlTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vdXJpSWRlbnRpdHkvY29tbW9uL3VyaUlkZW50aXR5LmpzJztcbmltcG9ydCB7IHN0cmlwSWNvbnMgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9pY29uTGFiZWxzLmpzJztcbmltcG9ydCB7IExhenkgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9sYXp5LmpzJztcbmltcG9ydCB7IElLZXliaW5kaW5nU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2tleWJpbmRpbmcvY29tbW9uL2tleWJpbmRpbmcuanMnO1xuaW1wb3J0IHsgSUNvbnRleHRLZXlTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29udGV4dGtleS9jb21tb24vY29udGV4dGtleS5qcyc7XG5pbXBvcnQgeyBSZWdpc3RyeSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3JlZ2lzdHJ5L2NvbW1vbi9wbGF0Zm9ybS5qcyc7XG5pbXBvcnQgeyBBU0tfUVVJQ0tfUVVFU1RJT05fQUNUSU9OX0lEIH0gZnJvbSAnLi4vLi4vY2hhdC9icm93c2VyL2FjdGlvbnMvY2hhdFF1aWNrSW5wdXRBY3Rpb25zLmpzJztcbmltcG9ydCB7IElDaGF0V2lkZ2V0U2VydmljZSwgSVF1aWNrQ2hhdFNlcnZpY2UgfSBmcm9tICcuLi8uLi9jaGF0L2Jyb3dzZXIvY2hhdC5qcyc7XG5pbXBvcnQgeyBJTG9nU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2xvZy9jb21tb24vbG9nLmpzJztcbmltcG9ydCB7IElDdXN0b21FZGl0b3JMYWJlbFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9zZXJ2aWNlcy9lZGl0b3IvY29tbW9uL2N1c3RvbUVkaXRvckxhYmVsU2VydmljZS5qcyc7XG5cbmV4cG9ydCBpbnRlcmZhY2UgSUFueXRoaW5nUXVpY2tQaWNrSXRlbSBleHRlbmRzIElQaWNrZXJRdWlja0FjY2Vzc0l0ZW0sIElRdWlja1BpY2tJdGVtV2l0aFJlc291cmNlIHtcblx0cmVhZG9ubHkgZWRpdG9yPzogRWRpdG9ySW5wdXQgfCBJUmVzb3VyY2VFZGl0b3JJbnB1dDtcbn1cblxuaW50ZXJmYWNlIElFZGl0b3JTeW1ib2xBbnl0aGluZ1F1aWNrUGlja0l0ZW0gZXh0ZW5kcyBJQW55dGhpbmdRdWlja1BpY2tJdGVtIHtcblx0cmVzb3VyY2U6IFVSSTtcblx0cmFuZ2U6IHsgZGVjb3JhdGlvbjogSVJhbmdlOyBzZWxlY3Rpb246IElSYW5nZSB9O1xufVxuXG5mdW5jdGlvbiBpc0VkaXRvclN5bWJvbFF1aWNrUGlja0l0ZW0ocGljaz86IElBbnl0aGluZ1F1aWNrUGlja0l0ZW0pOiBwaWNrIGlzIElFZGl0b3JTeW1ib2xBbnl0aGluZ1F1aWNrUGlja0l0ZW0ge1xuXHRjb25zdCBjYW5kaWRhdGUgPSBwaWNrIGFzIElFZGl0b3JTeW1ib2xBbnl0aGluZ1F1aWNrUGlja0l0ZW0gfCB1bmRlZmluZWQ7XG5cblx0cmV0dXJuICEhY2FuZGlkYXRlPy5yYW5nZSAmJiAhIWNhbmRpZGF0ZS5yZXNvdXJjZTtcbn1cblxuaW50ZXJmYWNlIElBbnl0aGluZ1BpY2tTdGF0ZSBleHRlbmRzIElEaXNwb3NhYmxlIHtcblx0cGlja2VyOiBJUXVpY2tQaWNrPElBbnl0aGluZ1F1aWNrUGlja0l0ZW0sIHsgdXNlU2VwYXJhdG9yczogdHJ1ZSB9PiB8IHVuZGVmaW5lZDtcblx0ZWRpdG9yVmlld1N0YXRlOiBQaWNrZXJFZGl0b3JTdGF0ZTtcblxuXHRzY29yZXJDYWNoZTogRnV6enlTY29yZXJDYWNoZTtcblx0ZmlsZVF1ZXJ5Q2FjaGU6IEZpbGVRdWVyeUNhY2hlU3RhdGUgfCB1bmRlZmluZWQ7XG5cblx0bGFzdE9yaWdpbmFsRmlsdGVyOiBzdHJpbmcgfCB1bmRlZmluZWQ7XG5cdGxhc3RGaWx0ZXI6IHN0cmluZyB8IHVuZGVmaW5lZDtcblx0bGFzdFJhbmdlOiBJUmFuZ2UgfCB1bmRlZmluZWQ7XG5cblx0bGFzdEdsb2JhbFBpY2tzOiBQaWNrc1dpdGhBY3RpdmU8SUFueXRoaW5nUXVpY2tQaWNrSXRlbT4gfCB1bmRlZmluZWQ7XG5cblx0aXNRdWlja05hdmlnYXRpbmc6IGJvb2xlYW4gfCB1bmRlZmluZWQ7XG5cblx0LyoqXG5cdCAqIFNldHMgdGhlIHBpY2tlciBmb3IgdGhpcyBwaWNrIHN0YXRlLlxuXHQgKi9cblx0c2V0KHBpY2tlcjogSVF1aWNrUGljazxJQW55dGhpbmdRdWlja1BpY2tJdGVtLCB7IHVzZVNlcGFyYXRvcnM6IHRydWUgfT4pOiB2b2lkO1xufVxuXG5cbmV4cG9ydCBjbGFzcyBBbnl0aGluZ1F1aWNrQWNjZXNzUHJvdmlkZXIgZXh0ZW5kcyBQaWNrZXJRdWlja0FjY2Vzc1Byb3ZpZGVyPElBbnl0aGluZ1F1aWNrUGlja0l0ZW0+IHtcblxuXHRzdGF0aWMgUFJFRklYID0gJyc7XG5cblx0cHJpdmF0ZSBzdGF0aWMgcmVhZG9ubHkgTk9fUkVTVUxUU19QSUNLOiBJQW55dGhpbmdRdWlja1BpY2tJdGVtID0ge1xuXHRcdGxhYmVsOiBsb2NhbGl6ZSgnbm9Bbnl0aGluZ1Jlc3VsdHMnLCBcIk5vIG1hdGNoaW5nIHJlc3VsdHNcIilcblx0fTtcblxuXHRwcml2YXRlIHN0YXRpYyByZWFkb25seSBNQVhfUkVTVUxUUyA9IDUxMjtcblxuXHRwcml2YXRlIHN0YXRpYyByZWFkb25seSBUWVBJTkdfU0VBUkNIX0RFTEFZID0gMjAwOyAvLyB0aGlzIGRlbGF5IGFjY29tbW9kYXRlcyBmb3IgdGhlIHVzZXIgdHlwaW5nIGEgd29yZCBhbmQgdGhlbiBzdG9wcyB0eXBpbmcgdG8gc3RhcnQgc2VhcmNoaW5nXG5cblx0cHJpdmF0ZSBzdGF0aWMgU1lNQk9MX1BJQ0tTX01FUkdFX0RFTEFZID0gMjAwOyAvLyBhbGxvdyBzb21lIHRpbWUgdG8gbWVyZ2UgZmFzdCBhbmQgc2xvdyBwaWNrcyB0byByZWR1Y2UgZmxpY2tlcmluZ1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgcGlja1N0YXRlOiBJQW55dGhpbmdQaWNrU3RhdGU7XG5cblx0Z2V0IGRlZmF1bHRGaWx0ZXJWYWx1ZSgpOiBEZWZhdWx0UXVpY2tBY2Nlc3NGaWx0ZXJWYWx1ZSB8IHVuZGVmaW5lZCB7XG5cdFx0aWYgKHRoaXMuY29uZmlndXJhdGlvbi5wcmVzZXJ2ZUlucHV0KSB7XG5cdFx0XHRyZXR1cm4gRGVmYXVsdFF1aWNrQWNjZXNzRmlsdGVyVmFsdWUuTEFTVDtcblx0XHR9XG5cblx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHR9XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0QElJbnN0YW50aWF0aW9uU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGluc3RhbnRpYXRpb25TZXJ2aWNlOiBJSW5zdGFudGlhdGlvblNlcnZpY2UsXG5cdFx0QElTZWFyY2hTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgc2VhcmNoU2VydmljZTogSVNlYXJjaFNlcnZpY2UsXG5cdFx0QElXb3Jrc3BhY2VDb250ZXh0U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGNvbnRleHRTZXJ2aWNlOiBJV29ya3NwYWNlQ29udGV4dFNlcnZpY2UsXG5cdFx0QElQYXRoU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IHBhdGhTZXJ2aWNlOiBJUGF0aFNlcnZpY2UsXG5cdFx0QElXb3JrYmVuY2hFbnZpcm9ubWVudFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBlbnZpcm9ubWVudFNlcnZpY2U6IElXb3JrYmVuY2hFbnZpcm9ubWVudFNlcnZpY2UsXG5cdFx0QElGaWxlU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGZpbGVTZXJ2aWNlOiBJRmlsZVNlcnZpY2UsXG5cdFx0QElMYWJlbFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBsYWJlbFNlcnZpY2U6IElMYWJlbFNlcnZpY2UsXG5cdFx0QElNb2RlbFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBtb2RlbFNlcnZpY2U6IElNb2RlbFNlcnZpY2UsXG5cdFx0QElMYW5ndWFnZVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBsYW5ndWFnZVNlcnZpY2U6IElMYW5ndWFnZVNlcnZpY2UsXG5cdFx0QElXb3JraW5nQ29weVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSB3b3JraW5nQ29weVNlcnZpY2U6IElXb3JraW5nQ29weVNlcnZpY2UsXG5cdFx0QElDb25maWd1cmF0aW9uU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGNvbmZpZ3VyYXRpb25TZXJ2aWNlOiBJQ29uZmlndXJhdGlvblNlcnZpY2UsXG5cdFx0QElFZGl0b3JTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgZWRpdG9yU2VydmljZTogSUVkaXRvclNlcnZpY2UsXG5cdFx0QElIaXN0b3J5U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGhpc3RvcnlTZXJ2aWNlOiBJSGlzdG9yeVNlcnZpY2UsXG5cdFx0QElGaWxlc0NvbmZpZ3VyYXRpb25TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgZmlsZXNDb25maWd1cmF0aW9uU2VydmljZTogSUZpbGVzQ29uZmlndXJhdGlvblNlcnZpY2UsXG5cdFx0QElUZXh0TW9kZWxTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgdGV4dE1vZGVsU2VydmljZTogSVRleHRNb2RlbFNlcnZpY2UsXG5cdFx0QElVcmlJZGVudGl0eVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSB1cmlJZGVudGl0eVNlcnZpY2U6IElVcmlJZGVudGl0eVNlcnZpY2UsXG5cdFx0QElRdWlja0lucHV0U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IHF1aWNrSW5wdXRTZXJ2aWNlOiBJUXVpY2tJbnB1dFNlcnZpY2UsXG5cdFx0QElLZXliaW5kaW5nU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGtleWJpbmRpbmdTZXJ2aWNlOiBJS2V5YmluZGluZ1NlcnZpY2UsXG5cdFx0QElDb250ZXh0S2V5U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGNvbnRleHRLZXlTZXJ2aWNlOiBJQ29udGV4dEtleVNlcnZpY2UsXG5cdFx0QElRdWlja0NoYXRTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgcXVpY2tDaGF0U2VydmljZTogSVF1aWNrQ2hhdFNlcnZpY2UsXG5cdFx0QElMb2dTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgbG9nU2VydmljZTogSUxvZ1NlcnZpY2UsXG5cdFx0QElDdXN0b21FZGl0b3JMYWJlbFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBjdXN0b21FZGl0b3JMYWJlbFNlcnZpY2U6IElDdXN0b21FZGl0b3JMYWJlbFNlcnZpY2UsXG5cdFx0QElDaGF0V2lkZ2V0U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGNoYXRXaWRnZXRTZXJ2aWNlOiBJQ2hhdFdpZGdldFNlcnZpY2Vcblx0KSB7XG5cdFx0c3VwZXIoQW55dGhpbmdRdWlja0FjY2Vzc1Byb3ZpZGVyLlBSRUZJWCwge1xuXHRcdFx0Y2FuQWNjZXB0SW5CYWNrZ3JvdW5kOiB0cnVlLFxuXHRcdFx0bm9SZXN1bHRzUGljazogQW55dGhpbmdRdWlja0FjY2Vzc1Byb3ZpZGVyLk5PX1JFU1VMVFNfUElDS1xuXHRcdH0pO1xuXG5cdFx0dGhpcy5waWNrU3RhdGUgPSB0aGlzLl9yZWdpc3RlcihuZXcgY2xhc3MgZXh0ZW5kcyBEaXNwb3NhYmxlIHtcblxuXHRcdFx0cGlja2VyOiBJUXVpY2tQaWNrPElBbnl0aGluZ1F1aWNrUGlja0l0ZW0sIHsgdXNlU2VwYXJhdG9yczogdHJ1ZSB9PiB8IHVuZGVmaW5lZCA9IHVuZGVmaW5lZDtcblxuXHRcdFx0ZWRpdG9yVmlld1N0YXRlOiBQaWNrZXJFZGl0b3JTdGF0ZTtcblxuXHRcdFx0c2NvcmVyQ2FjaGU6IEZ1enp5U2NvcmVyQ2FjaGUgPSBPYmplY3QuY3JlYXRlKG51bGwpO1xuXHRcdFx0ZmlsZVF1ZXJ5Q2FjaGU6IEZpbGVRdWVyeUNhY2hlU3RhdGUgfCB1bmRlZmluZWQgPSB1bmRlZmluZWQ7XG5cblx0XHRcdGxhc3RPcmlnaW5hbEZpbHRlcjogc3RyaW5nIHwgdW5kZWZpbmVkID0gdW5kZWZpbmVkO1xuXHRcdFx0bGFzdEZpbHRlcjogc3RyaW5nIHwgdW5kZWZpbmVkID0gdW5kZWZpbmVkO1xuXHRcdFx0bGFzdFJhbmdlOiBJUmFuZ2UgfCB1bmRlZmluZWQgPSB1bmRlZmluZWQ7XG5cblx0XHRcdGxhc3RHbG9iYWxQaWNrczogUGlja3NXaXRoQWN0aXZlPElBbnl0aGluZ1F1aWNrUGlja0l0ZW0+IHwgdW5kZWZpbmVkID0gdW5kZWZpbmVkO1xuXG5cdFx0XHRpc1F1aWNrTmF2aWdhdGluZzogYm9vbGVhbiB8IHVuZGVmaW5lZCA9IHVuZGVmaW5lZDtcblxuXHRcdFx0Y29uc3RydWN0b3IoXG5cdFx0XHRcdHByaXZhdGUgcmVhZG9ubHkgcHJvdmlkZXI6IEFueXRoaW5nUXVpY2tBY2Nlc3NQcm92aWRlcixcblx0XHRcdFx0aW5zdGFudGlhdGlvblNlcnZpY2U6IElJbnN0YW50aWF0aW9uU2VydmljZVxuXHRcdFx0KSB7XG5cdFx0XHRcdHN1cGVyKCk7XG5cdFx0XHRcdHRoaXMuZWRpdG9yVmlld1N0YXRlID0gdGhpcy5fcmVnaXN0ZXIoaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoUGlja2VyRWRpdG9yU3RhdGUpKTtcblx0XHRcdH1cblxuXHRcdFx0c2V0KHBpY2tlcjogSVF1aWNrUGljazxJQW55dGhpbmdRdWlja1BpY2tJdGVtLCB7IHVzZVNlcGFyYXRvcnM6IHRydWUgfT4pOiB2b2lkIHtcblxuXHRcdFx0XHQvLyBQaWNrZXIgZm9yIHRoaXMgcnVuXG5cdFx0XHRcdHRoaXMucGlja2VyID0gcGlja2VyO1xuXHRcdFx0XHRFdmVudC5vbmNlKHBpY2tlci5vbkRpc3Bvc2UpKCgpID0+IHtcblx0XHRcdFx0XHRpZiAocGlja2VyID09PSB0aGlzLnBpY2tlcikge1xuXHRcdFx0XHRcdFx0dGhpcy5waWNrZXIgPSB1bmRlZmluZWQ7IC8vIGNsZWFyIHRoZSBwaWNrZXIgd2hlbiBkaXNwb3NlZCB0byBub3Qga2VlcCBpdCBpbiBtZW1vcnkgZm9yIHRvbyBsb25nXG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9KTtcblxuXHRcdFx0XHQvLyBDYWNoZXNcblx0XHRcdFx0Y29uc3QgaXNRdWlja05hdmlnYXRpbmcgPSAhIXBpY2tlci5xdWlja05hdmlnYXRlO1xuXHRcdFx0XHRpZiAoIWlzUXVpY2tOYXZpZ2F0aW5nKSB7XG5cdFx0XHRcdFx0dGhpcy5maWxlUXVlcnlDYWNoZSA9IHRoaXMucHJvdmlkZXIuY3JlYXRlRmlsZVF1ZXJ5Q2FjaGUoKTtcblx0XHRcdFx0XHR0aGlzLnNjb3JlckNhY2hlID0gT2JqZWN0LmNyZWF0ZShudWxsKTtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdC8vIE90aGVyXG5cdFx0XHRcdHRoaXMuaXNRdWlja05hdmlnYXRpbmcgPSBpc1F1aWNrTmF2aWdhdGluZztcblx0XHRcdFx0dGhpcy5sYXN0T3JpZ2luYWxGaWx0ZXIgPSB1bmRlZmluZWQ7XG5cdFx0XHRcdHRoaXMubGFzdEZpbHRlciA9IHVuZGVmaW5lZDtcblx0XHRcdFx0dGhpcy5sYXN0UmFuZ2UgPSB1bmRlZmluZWQ7XG5cdFx0XHRcdHRoaXMubGFzdEdsb2JhbFBpY2tzID0gdW5kZWZpbmVkO1xuXHRcdFx0XHR0aGlzLmVkaXRvclZpZXdTdGF0ZS5yZXNldCgpO1xuXHRcdFx0fVxuXHRcdH0odGhpcywgaW5zdGFudGlhdGlvblNlcnZpY2UpKTtcblxuXHRcdHRoaXMuZmlsZVF1ZXJ5QnVpbGRlciA9IHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoUXVlcnlCdWlsZGVyKTtcblx0XHR0aGlzLndvcmtzcGFjZVN5bWJvbHNRdWlja0FjY2VzcyA9IHRoaXMuX3JlZ2lzdGVyKGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFN5bWJvbHNRdWlja0FjY2Vzc1Byb3ZpZGVyKSk7XG5cdFx0dGhpcy5lZGl0b3JTeW1ib2xzUXVpY2tBY2Nlc3MgPSB0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKEdvdG9TeW1ib2xRdWlja0FjY2Vzc1Byb3ZpZGVyKTtcblx0fVxuXG5cdHByaXZhdGUgZ2V0IGNvbmZpZ3VyYXRpb24oKSB7XG5cdFx0Y29uc3QgZWRpdG9yQ29uZmlnID0gdGhpcy5jb25maWd1cmF0aW9uU2VydmljZS5nZXRWYWx1ZTxJV29ya2JlbmNoRWRpdG9yQ29uZmlndXJhdGlvbj4oKS53b3JrYmVuY2g/LmVkaXRvcjtcblx0XHRjb25zdCBzZWFyY2hDb25maWcgPSB0aGlzLmNvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldFZhbHVlPElXb3JrYmVuY2hTZWFyY2hDb25maWd1cmF0aW9uPigpLnNlYXJjaDtcblx0XHRjb25zdCBxdWlja0FjY2Vzc0NvbmZpZyA9IHRoaXMuY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0VmFsdWU8SVdvcmtiZW5jaFF1aWNrQWNjZXNzQ29uZmlndXJhdGlvbj4oKS53b3JrYmVuY2gucXVpY2tPcGVuO1xuXG5cdFx0cmV0dXJuIHtcblx0XHRcdG9wZW5FZGl0b3JQaW5uZWQ6ICFlZGl0b3JDb25maWc/LmVuYWJsZVByZXZpZXdGcm9tUXVpY2tPcGVuIHx8ICFlZGl0b3JDb25maWc/LmVuYWJsZVByZXZpZXcsXG5cdFx0XHRvcGVuU2lkZUJ5U2lkZURpcmVjdGlvbjogZWRpdG9yQ29uZmlnPy5vcGVuU2lkZUJ5U2lkZURpcmVjdGlvbixcblx0XHRcdGluY2x1ZGVTeW1ib2xzOiBzZWFyY2hDb25maWc/LnF1aWNrT3Blbj8uaW5jbHVkZVN5bWJvbHMsXG5cdFx0XHRpbmNsdWRlSGlzdG9yeTogc2VhcmNoQ29uZmlnPy5xdWlja09wZW4/LmluY2x1ZGVIaXN0b3J5ID8/IHRydWUsXG5cdFx0XHRoaXN0b3J5RmlsdGVyU29ydE9yZGVyOiBzZWFyY2hDb25maWc/LnF1aWNrT3Blbj8uaGlzdG9yeT8uZmlsdGVyU29ydE9yZGVyLFxuXHRcdFx0cHJlc2VydmVJbnB1dDogcXVpY2tBY2Nlc3NDb25maWc/LnByZXNlcnZlSW5wdXRcblx0XHR9O1xuXHR9XG5cblx0b3ZlcnJpZGUgcHJvdmlkZShwaWNrZXI6IElRdWlja1BpY2s8SUFueXRoaW5nUXVpY2tQaWNrSXRlbSwgeyB1c2VTZXBhcmF0b3JzOiB0cnVlIH0+LCB0b2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4sIHJ1bk9wdGlvbnM/OiBBbnl0aGluZ1F1aWNrQWNjZXNzUHJvdmlkZXJSdW5PcHRpb25zKTogSURpc3Bvc2FibGUge1xuXHRcdGNvbnN0IGRpc3Bvc2FibGVzID0gbmV3IERpc3Bvc2FibGVTdG9yZSgpO1xuXG5cdFx0Ly8gVXBkYXRlIHRoZSBwaWNrIHN0YXRlIGZvciB0aGlzIHJ1blxuXHRcdHRoaXMucGlja1N0YXRlLnNldChwaWNrZXIpO1xuXG5cdFx0Ly8gQWRkIGVkaXRvciBkZWNvcmF0aW9ucyBmb3IgYWN0aXZlIGVkaXRvciBzeW1ib2wgcGlja3Ncblx0XHRjb25zdCBlZGl0b3JEZWNvcmF0aW9uc0Rpc3Bvc2FibGUgPSBkaXNwb3NhYmxlcy5hZGQobmV3IE11dGFibGVEaXNwb3NhYmxlKCkpO1xuXHRcdGRpc3Bvc2FibGVzLmFkZChwaWNrZXIub25EaWRDaGFuZ2VBY3RpdmUoKCkgPT4ge1xuXG5cdFx0XHQvLyBDbGVhciBvbGQgZGVjb3JhdGlvbnNcblx0XHRcdGVkaXRvckRlY29yYXRpb25zRGlzcG9zYWJsZS52YWx1ZSA9IHVuZGVmaW5lZDtcblxuXHRcdFx0Ly8gQWRkIG5ldyBkZWNvcmF0aW9uIGlmIGVkaXRvciBzeW1ib2wgaXMgYWN0aXZlXG5cdFx0XHRjb25zdCBbaXRlbV0gPSBwaWNrZXIuYWN0aXZlSXRlbXM7XG5cdFx0XHRpZiAoaXNFZGl0b3JTeW1ib2xRdWlja1BpY2tJdGVtKGl0ZW0pKSB7XG5cdFx0XHRcdGVkaXRvckRlY29yYXRpb25zRGlzcG9zYWJsZS52YWx1ZSA9IHRoaXMuZGVjb3JhdGVBbmRSZXZlYWxTeW1ib2xSYW5nZShpdGVtKTtcblx0XHRcdH1cblx0XHR9KSk7XG5cblx0XHQvLyBSZXN0b3JlIHZpZXcgc3RhdGUgdXBvbiBjYW5jZWxsYXRpb24gaWYgd2UgY2hhbmdlZCBpdFxuXHRcdC8vIGJ1dCBvbmx5IHdoZW4gdGhlIHBpY2tlciB3YXMgY2xvc2VkIHZpYSBleHBsaWNpdCB1c2VyXG5cdFx0Ly8gZ2VzdHVyZSBhbmQgbm90IGUuZy4gd2hlbiBmb2N1cyB3YXMgbG9zdCBiZWNhdXNlIHRoYXRcblx0XHQvLyBjb3VsZCBtZWFuIHRoZSB1c2VyIGNsaWNrZWQgaW50byB0aGUgZWRpdG9yIGRpcmVjdGx5LlxuXHRcdGRpc3Bvc2FibGVzLmFkZChFdmVudC5vbmNlKHBpY2tlci5vbkRpZEhpZGUpKCh7IHJlYXNvbiB9KSA9PiB7XG5cdFx0XHRpZiAocmVhc29uID09PSBRdWlja0lucHV0SGlkZVJlYXNvbi5HZXN0dXJlKSB7XG5cdFx0XHRcdHRoaXMucGlja1N0YXRlLmVkaXRvclZpZXdTdGF0ZS5yZXN0b3JlKCk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXG5cdFx0Ly8gU3RhcnQgcGlja2VyXG5cdFx0ZGlzcG9zYWJsZXMuYWRkKHN1cGVyLnByb3ZpZGUocGlja2VyLCB0b2tlbiwgcnVuT3B0aW9ucykpO1xuXG5cdFx0cmV0dXJuIGRpc3Bvc2FibGVzO1xuXHR9XG5cblx0cHJpdmF0ZSBkZWNvcmF0ZUFuZFJldmVhbFN5bWJvbFJhbmdlKHBpY2s6IElFZGl0b3JTeW1ib2xBbnl0aGluZ1F1aWNrUGlja0l0ZW0pOiBJRGlzcG9zYWJsZSB7XG5cdFx0Y29uc3QgYWN0aXZlRWRpdG9yID0gdGhpcy5lZGl0b3JTZXJ2aWNlLmFjdGl2ZUVkaXRvcjtcblx0XHRpZiAoIXRoaXMudXJpSWRlbnRpdHlTZXJ2aWNlLmV4dFVyaS5pc0VxdWFsKHBpY2sucmVzb3VyY2UsIGFjdGl2ZUVkaXRvcj8ucmVzb3VyY2UpKSB7XG5cdFx0XHRyZXR1cm4gRGlzcG9zYWJsZS5Ob25lOyAvLyBhY3RpdmUgZWRpdG9yIG5lZWRzIHRvIGJlIGZvciByZXNvdXJjZVxuXHRcdH1cblxuXHRcdGNvbnN0IGFjdGl2ZUVkaXRvckNvbnRyb2wgPSB0aGlzLmVkaXRvclNlcnZpY2UuYWN0aXZlVGV4dEVkaXRvckNvbnRyb2w7XG5cdFx0aWYgKCFhY3RpdmVFZGl0b3JDb250cm9sKSB7XG5cdFx0XHRyZXR1cm4gRGlzcG9zYWJsZS5Ob25lOyAvLyB3ZSBuZWVkIGEgdGV4dCBlZGl0b3IgY29udHJvbCB0byBkZWNvcmF0ZSBhbmQgcmV2ZWFsXG5cdFx0fVxuXG5cdFx0Ly8gd2UgbXVzdCByZW1lbWJlciBvdXIgY3VycmVudCB2aWV3IHN0YXRlIHRvIGJlIGFibGUgdG8gcmVzdG9yZVxuXHRcdHRoaXMucGlja1N0YXRlLmVkaXRvclZpZXdTdGF0ZS5zZXQoKTtcblxuXHRcdC8vIFJldmVhbFxuXHRcdGFjdGl2ZUVkaXRvckNvbnRyb2wucmV2ZWFsUmFuZ2VJbkNlbnRlcihwaWNrLnJhbmdlLnNlbGVjdGlvbiwgU2Nyb2xsVHlwZS5TbW9vdGgpO1xuXG5cdFx0Ly8gRGVjb3JhdGVcblx0XHR0aGlzLmFkZERlY29yYXRpb25zKGFjdGl2ZUVkaXRvckNvbnRyb2wsIHBpY2sucmFuZ2UuZGVjb3JhdGlvbik7XG5cblx0XHRyZXR1cm4gdG9EaXNwb3NhYmxlKCgpID0+IHRoaXMuY2xlYXJEZWNvcmF0aW9ucyhhY3RpdmVFZGl0b3JDb250cm9sKSk7XG5cdH1cblxuXHRwcm90ZWN0ZWQgX2dldFBpY2tzKG9yaWdpbmFsRmlsdGVyOiBzdHJpbmcsIGRpc3Bvc2FibGVzOiBEaXNwb3NhYmxlU3RvcmUsIHRva2VuOiBDYW5jZWxsYXRpb25Ub2tlbiwgcnVuT3B0aW9ucz86IEFueXRoaW5nUXVpY2tBY2Nlc3NQcm92aWRlclJ1bk9wdGlvbnMpOiBQaWNrczxJQW55dGhpbmdRdWlja1BpY2tJdGVtPiB8IFByb21pc2U8UGlja3M8SUFueXRoaW5nUXVpY2tQaWNrSXRlbT4+IHwgRmFzdEFuZFNsb3dQaWNrczxJQW55dGhpbmdRdWlja1BpY2tJdGVtPiB8IG51bGwge1xuXG5cdFx0Ly8gRmluZCBhIHN1aXRhYmxlIHJhbmdlIGZyb20gdGhlIHBhdHRlcm4gbG9va2luZyBmb3IgXCI6XCIsIFwiI1wiIG9yIFwiLFwiXG5cdFx0Ly8gdW5sZXNzIHdlIGhhdmUgdGhlIGBAYCBlZGl0b3Igc3ltYm9sIGNoYXJhY3RlciBpbnNpZGUgdGhlIGZpbHRlclxuXHRcdGNvbnN0IGZpbHRlcldpdGhSYW5nZSA9IGV4dHJhY3RSYW5nZUZyb21GaWx0ZXIob3JpZ2luYWxGaWx0ZXIsIFtHb3RvU3ltYm9sUXVpY2tBY2Nlc3NQcm92aWRlci5QUkVGSVhdKTtcblxuXHRcdC8vIFVwZGF0ZSBmaWx0ZXIgd2l0aCBub3JtYWxpemVkIHZhbHVlc1xuXHRcdGxldCBmaWx0ZXI6IHN0cmluZztcblx0XHRpZiAoZmlsdGVyV2l0aFJhbmdlKSB7XG5cdFx0XHRmaWx0ZXIgPSBmaWx0ZXJXaXRoUmFuZ2UuZmlsdGVyO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRmaWx0ZXIgPSBvcmlnaW5hbEZpbHRlcjtcblx0XHR9XG5cblx0XHQvLyBSZW1lbWJlciBhcyBsYXN0IHJhbmdlXG5cdFx0dGhpcy5waWNrU3RhdGUubGFzdFJhbmdlID0gZmlsdGVyV2l0aFJhbmdlPy5yYW5nZTtcblxuXHRcdC8vIElmIHRoZSBvcmlnaW5hbCBmaWx0ZXIgdmFsdWUgaGFzIGNoYW5nZWQgYnV0IHRoZSBub3JtYWxpemVkXG5cdFx0Ly8gb25lIGhhcyBub3QsIHdlIHJldHVybiBlYXJseSB3aXRoIGEgYG51bGxgIHJlc3VsdCBpbmRpY2F0aW5nXG5cdFx0Ly8gdGhhdCB0aGUgcmVzdWx0cyBzaG91bGQgcHJlc2VydmUgYmVjYXVzZSB0aGUgcmFuZ2UgaW5mb3JtYXRpb25cblx0XHQvLyAoOjxsaW5lPjo8Y29sdW1uPikgZG9lcyBub3QgbmVlZCB0byB0cmlnZ2VyIGFueSByZS1zb3J0aW5nLlxuXHRcdGlmIChvcmlnaW5hbEZpbHRlciAhPT0gdGhpcy5waWNrU3RhdGUubGFzdE9yaWdpbmFsRmlsdGVyICYmIGZpbHRlciA9PT0gdGhpcy5waWNrU3RhdGUubGFzdEZpbHRlcikge1xuXHRcdFx0cmV0dXJuIG51bGw7XG5cdFx0fVxuXG5cdFx0Ly8gUmVtZW1iZXIgYXMgbGFzdCBmaWx0ZXJcblx0XHRjb25zdCBsYXN0V2FzRmlsdGVyaW5nID0gISF0aGlzLnBpY2tTdGF0ZS5sYXN0T3JpZ2luYWxGaWx0ZXI7XG5cdFx0dGhpcy5waWNrU3RhdGUubGFzdE9yaWdpbmFsRmlsdGVyID0gb3JpZ2luYWxGaWx0ZXI7XG5cdFx0dGhpcy5waWNrU3RhdGUubGFzdEZpbHRlciA9IGZpbHRlcjtcblxuXHRcdC8vIFJlbWVtYmVyIG91ciBwaWNrIHN0YXRlIGJlZm9yZSByZXR1cm5pbmcgbmV3IHBpY2tzXG5cdFx0Ly8gdW5sZXNzIHdlIGFyZSBpbnNpZGUgYW4gZWRpdG9yIHN5bWJvbCBmaWx0ZXIgb3IgcmVzdWx0LlxuXHRcdC8vIFdlIGNhbiB1c2UgdGhpcyBzdGF0ZSB0byByZXR1cm4gYmFjayB0byB0aGUgZ2xvYmFsIHBpY2tcblx0XHQvLyB3aGVuIHRoZSB1c2VyIGlzIG5hcnJvd2luZyBiYWNrIG91dCBvZiBlZGl0b3Igc3ltYm9scy5cblx0XHRjb25zdCBwaWNrcyA9IHRoaXMucGlja1N0YXRlLnBpY2tlcj8uaXRlbXM7XG5cdFx0Y29uc3QgYWN0aXZlUGljayA9IHRoaXMucGlja1N0YXRlLnBpY2tlcj8uYWN0aXZlSXRlbXNbMF07XG5cdFx0aWYgKHBpY2tzICYmIGFjdGl2ZVBpY2spIHtcblx0XHRcdGNvbnN0IGFjdGl2ZVBpY2tJc0VkaXRvclN5bWJvbCA9IGlzRWRpdG9yU3ltYm9sUXVpY2tQaWNrSXRlbShhY3RpdmVQaWNrKTtcblx0XHRcdGNvbnN0IGFjdGl2ZVBpY2tJc05vUmVzdWx0c0luRWRpdG9yU3ltYm9scyA9IGFjdGl2ZVBpY2sgPT09IEFueXRoaW5nUXVpY2tBY2Nlc3NQcm92aWRlci5OT19SRVNVTFRTX1BJQ0sgJiYgZmlsdGVyLmluZGV4T2YoR290b1N5bWJvbFF1aWNrQWNjZXNzUHJvdmlkZXIuUFJFRklYKSA+PSAwO1xuXHRcdFx0aWYgKCFhY3RpdmVQaWNrSXNFZGl0b3JTeW1ib2wgJiYgIWFjdGl2ZVBpY2tJc05vUmVzdWx0c0luRWRpdG9yU3ltYm9scykge1xuXHRcdFx0XHR0aGlzLnBpY2tTdGF0ZS5sYXN0R2xvYmFsUGlja3MgPSB7XG5cdFx0XHRcdFx0aXRlbXM6IHBpY2tzLFxuXHRcdFx0XHRcdGFjdGl2ZTogYWN0aXZlUGlja1xuXHRcdFx0XHR9O1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdC8vIGBlbmFibGVFZGl0b3JTeW1ib2xTZWFyY2hgOiB0aGlzIHdpbGwgZW5hYmxlIGxvY2FsIGVkaXRvciBzeW1ib2xcblx0XHQvLyBzZWFyY2ggaWYgdGhlIGZpbHRlciB2YWx1ZSBpbmNsdWRlcyBgQGAgY2hhcmFjdGVyLiBXZSBvbmx5IHdhbnRcblx0XHQvLyB0byBlbmFibGUgdGhpcyBzdXBwb3J0IHRob3VnaCBpZiB0aGUgdXNlciB3YXMgZmlsdGVyaW5nIGluIHRoZVxuXHRcdC8vIHBpY2tlciBiZWNhdXNlIHRoaXMgZmVhdHVyZSBkZXBlbmRzIG9uIGFuIGFjdGl2ZSBpdGVtIGluIHRoZSByZXN1bHRcblx0XHQvLyBsaXN0IHRvIGdldCBzeW1ib2xzIGZyb20uIElmIHdlIHdvdWxkIHNpbXBseSB0cmlnZ2VyIGVkaXRvciBzeW1ib2xcblx0XHQvLyBzZWFyY2ggd2l0aG91dCBwcmlvciBmaWx0ZXJpbmcsIHlvdSBjb3VsZCBub3QgcGFzdGUgYSBmaWxlIG5hbWVcblx0XHQvLyBpbmNsdWRpbmcgdGhlIGBAYCBjaGFyYWN0ZXIgdG8gb3BlbiBpdCAoZS5nLiAvc29tZS9maWxlQHBhdGgpXG5cdFx0Ly8gcmVmczogaHR0cHM6Ly9naXRodWIuY29tL21pY3Jvc29mdC92c2NvZGUvaXNzdWVzLzkzODQ1XG5cdFx0cmV0dXJuIHRoaXMuZG9HZXRQaWNrcyhcblx0XHRcdGZpbHRlcixcblx0XHRcdHtcblx0XHRcdFx0Li4ucnVuT3B0aW9ucyxcblx0XHRcdFx0ZW5hYmxlRWRpdG9yU3ltYm9sU2VhcmNoOiBsYXN0V2FzRmlsdGVyaW5nXG5cdFx0XHR9LFxuXHRcdFx0ZGlzcG9zYWJsZXMsXG5cdFx0XHR0b2tlblxuXHRcdCk7XG5cdH1cblxuXHRwcml2YXRlIGRvR2V0UGlja3MoXG5cdFx0ZmlsdGVyOiBzdHJpbmcsXG5cdFx0b3B0aW9uczogQW55dGhpbmdRdWlja0FjY2Vzc1Byb3ZpZGVyUnVuT3B0aW9ucyAmIHsgZW5hYmxlRWRpdG9yU3ltYm9sU2VhcmNoOiBib29sZWFuIH0sXG5cdFx0ZGlzcG9zYWJsZXM6IERpc3Bvc2FibGVTdG9yZSxcblx0XHR0b2tlbjogQ2FuY2VsbGF0aW9uVG9rZW5cblx0KTogUGlja3M8SUFueXRoaW5nUXVpY2tQaWNrSXRlbT4gfCBQcm9taXNlPFBpY2tzPElBbnl0aGluZ1F1aWNrUGlja0l0ZW0+PiB8IEZhc3RBbmRTbG93UGlja3M8SUFueXRoaW5nUXVpY2tQaWNrSXRlbT4ge1xuXHRcdGNvbnN0IHF1ZXJ5ID0gcHJlcGFyZVF1ZXJ5KGZpbHRlcik7XG5cblx0XHQvLyBSZXR1cm4gZWFybHkgaWYgd2UgaGF2ZSBlZGl0b3Igc3ltYm9sIHBpY2tzLiBXZSBzdXBwb3J0IHRoaXMgYnk6XG5cdFx0Ly8gLSBoYXZpbmcgYSBwcmV2aW91c2x5IGFjdGl2ZSBnbG9iYWwgcGljayAoZS5nLiBhIGZpbGUpXG5cdFx0Ly8gLSB0aGUgdXNlciB0eXBpbmcgYEBgIHRvIHN0YXJ0IHRoZSBsb2NhbCBzeW1ib2wgcXVlcnlcblx0XHRpZiAob3B0aW9ucy5lbmFibGVFZGl0b3JTeW1ib2xTZWFyY2gpIHtcblx0XHRcdGNvbnN0IGVkaXRvclN5bWJvbFBpY2tzID0gdGhpcy5nZXRFZGl0b3JTeW1ib2xQaWNrcyhxdWVyeSwgZGlzcG9zYWJsZXMsIHRva2VuKTtcblx0XHRcdGlmIChlZGl0b3JTeW1ib2xQaWNrcykge1xuXHRcdFx0XHRyZXR1cm4gZWRpdG9yU3ltYm9sUGlja3M7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0Ly8gSWYgd2UgaGF2ZSBhIGtub3duIGxhc3QgYWN0aXZlIGVkaXRvciBzeW1ib2wgcGljaywgd2UgdHJ5IHRvIHJlc3RvcmVcblx0XHQvLyB0aGUgbGFzdCBnbG9iYWwgcGljayB0byBzdXBwb3J0IHRoZSBjYXNlIG9mIG5hcnJvd2luZyBvdXQgZnJvbSBhXG5cdFx0Ly8gZWRpdG9yIHN5bWJvbCBzZWFyY2ggYmFjayBpbnRvIHRoZSBnbG9iYWwgc2VhcmNoXG5cdFx0Y29uc3QgYWN0aXZlUGljayA9IHRoaXMucGlja1N0YXRlLnBpY2tlcj8uYWN0aXZlSXRlbXNbMF07XG5cdFx0aWYgKGlzRWRpdG9yU3ltYm9sUXVpY2tQaWNrSXRlbShhY3RpdmVQaWNrKSAmJiB0aGlzLnBpY2tTdGF0ZS5sYXN0R2xvYmFsUGlja3MpIHtcblx0XHRcdHJldHVybiB0aGlzLnBpY2tTdGF0ZS5sYXN0R2xvYmFsUGlja3M7XG5cdFx0fVxuXG5cdFx0Ly8gT3RoZXJ3aXNlIHJldHVybiBub3JtYWxseSB3aXRoIGhpc3RvcnkgYW5kIGZpbGUvc3ltYm9sIHJlc3VsdHNcblx0XHRjb25zdCBoaXN0b3J5RWRpdG9yUGlja3MgPSB0aGlzLmdldEVkaXRvckhpc3RvcnlQaWNrcyhxdWVyeSk7XG5cblx0XHRsZXQgcGlja3MgPSBuZXcgQXJyYXk8SUFueXRoaW5nUXVpY2tQaWNrSXRlbSB8IElRdWlja1BpY2tTZXBhcmF0b3I+KCk7XG5cdFx0aWYgKG9wdGlvbnMuYWRkaXRpb25QaWNrcykge1xuXHRcdFx0Zm9yIChjb25zdCBwaWNrIG9mIG9wdGlvbnMuYWRkaXRpb25QaWNrcykge1xuXHRcdFx0XHRpZiAocGljay50eXBlID09PSAnc2VwYXJhdG9yJykge1xuXHRcdFx0XHRcdHBpY2tzLnB1c2gocGljayk7XG5cdFx0XHRcdFx0Y29udGludWU7XG5cdFx0XHRcdH1cblx0XHRcdFx0aWYgKCFxdWVyeS5vcmlnaW5hbCkge1xuXHRcdFx0XHRcdHBpY2suaGlnaGxpZ2h0cyA9IHVuZGVmaW5lZDtcblx0XHRcdFx0XHRwaWNrcy5wdXNoKHBpY2spO1xuXHRcdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGNvbnN0IHsgc2NvcmUsIGxhYmVsTWF0Y2gsIGRlc2NyaXB0aW9uTWF0Y2ggfSA9IHNjb3JlSXRlbUZ1enp5KHBpY2ssIHF1ZXJ5LCB0cnVlLCBxdWlja1BpY2tJdGVtU2NvcmVyQWNjZXNzb3IsIHRoaXMucGlja1N0YXRlLnNjb3JlckNhY2hlKTtcblx0XHRcdFx0aWYgKCFzY29yZSkge1xuXHRcdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHBpY2suaGlnaGxpZ2h0cyA9IHtcblx0XHRcdFx0XHRsYWJlbDogbGFiZWxNYXRjaCxcblx0XHRcdFx0XHRkZXNjcmlwdGlvbjogZGVzY3JpcHRpb25NYXRjaFxuXHRcdFx0XHR9O1xuXHRcdFx0XHRwaWNrcy5wdXNoKHBpY2spO1xuXHRcdFx0fVxuXHRcdH1cblx0XHRpZiAodGhpcy5waWNrU3RhdGUuaXNRdWlja05hdmlnYXRpbmcpIHtcblx0XHRcdGlmIChwaWNrcy5sZW5ndGggPiAwKSB7XG5cdFx0XHRcdHBpY2tzLnB1c2goeyB0eXBlOiAnc2VwYXJhdG9yJywgbGFiZWw6IGxvY2FsaXplKCdyZWNlbnRseU9wZW5lZFNlcGFyYXRvcicsIFwicmVjZW50bHkgb3BlbmVkXCIpIH0gc2F0aXNmaWVzIElRdWlja1BpY2tTZXBhcmF0b3IpO1xuXHRcdFx0fVxuXHRcdFx0cGlja3MgPSBoaXN0b3J5RWRpdG9yUGlja3M7XG5cdFx0fSBlbHNlIHtcblx0XHRcdGlmIChvcHRpb25zLmluY2x1ZGVIZWxwKSB7XG5cdFx0XHRcdHBpY2tzLnB1c2goLi4udGhpcy5nZXRIZWxwUGlja3MocXVlcnksIHRva2VuLCBvcHRpb25zKSk7XG5cdFx0XHR9XG5cdFx0XHRpZiAoaGlzdG9yeUVkaXRvclBpY2tzLmxlbmd0aCAhPT0gMCkge1xuXHRcdFx0XHRwaWNrcy5wdXNoKHsgdHlwZTogJ3NlcGFyYXRvcicsIGxhYmVsOiBsb2NhbGl6ZSgncmVjZW50bHlPcGVuZWRTZXBhcmF0b3InLCBcInJlY2VudGx5IG9wZW5lZFwiKSB9IHNhdGlzZmllcyBJUXVpY2tQaWNrU2VwYXJhdG9yKTtcblx0XHRcdFx0cGlja3MucHVzaCguLi5oaXN0b3J5RWRpdG9yUGlja3MpO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdHJldHVybiB7XG5cblx0XHRcdC8vIEZhc3QgcGlja3M6IGhlbHAgKGlmIGluY2x1ZGVkKSAmIGVkaXRvciBoaXN0b3J5XG5cdFx0XHRwaWNrczogb3B0aW9ucy5maWx0ZXIgPyBwaWNrcy5maWx0ZXIoKHApID0+IG9wdGlvbnMuZmlsdGVyPy4ocCkpIDogcGlja3MsXG5cblx0XHRcdC8vIFNsb3cgcGlja3M6IGZpbGVzIGFuZCBzeW1ib2xzXG5cdFx0XHRhZGRpdGlvbmFsUGlja3M6IChhc3luYyAoKTogUHJvbWlzZTxQaWNrczxJQW55dGhpbmdRdWlja1BpY2tJdGVtPj4gPT4ge1xuXG5cdFx0XHRcdC8vIEV4Y2x1ZGUgYW55IHJlc3VsdCB0aGF0IGlzIGFscmVhZHkgcHJlc2VudCBpbiBlZGl0b3IgaGlzdG9yeS5cblx0XHRcdFx0Y29uc3QgYWRkaXRpb25hbFBpY2tzRXhjbHVkZXMgPSBuZXcgUmVzb3VyY2VNYXA8Ym9vbGVhbj4odXJpID0+IHRoaXMudXJpSWRlbnRpdHlTZXJ2aWNlLmV4dFVyaS5nZXRDb21wYXJpc29uS2V5KHVyaSkpO1xuXHRcdFx0XHRmb3IgKGNvbnN0IGhpc3RvcnlFZGl0b3JQaWNrIG9mIGhpc3RvcnlFZGl0b3JQaWNrcykge1xuXHRcdFx0XHRcdGlmIChoaXN0b3J5RWRpdG9yUGljay5yZXNvdXJjZSkge1xuXHRcdFx0XHRcdFx0YWRkaXRpb25hbFBpY2tzRXhjbHVkZXMuc2V0KGhpc3RvcnlFZGl0b3JQaWNrLnJlc291cmNlLCB0cnVlKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRsZXQgYWRkaXRpb25hbFBpY2tzID0gYXdhaXQgdGhpcy5nZXRBZGRpdGlvbmFsUGlja3MocXVlcnksIGFkZGl0aW9uYWxQaWNrc0V4Y2x1ZGVzLCBCb29sZWFuKHRoaXMuY29uZmlndXJhdGlvbj8uaW5jbHVkZVN5bWJvbHMpLCB0b2tlbik7XG5cdFx0XHRcdGlmIChvcHRpb25zLmZpbHRlcikge1xuXHRcdFx0XHRcdGFkZGl0aW9uYWxQaWNrcyA9IGFkZGl0aW9uYWxQaWNrcy5maWx0ZXIoKHApID0+IG9wdGlvbnMuZmlsdGVyPy4ocCkpO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGlmICh0b2tlbi5pc0NhbmNlbGxhdGlvblJlcXVlc3RlZCkge1xuXHRcdFx0XHRcdHJldHVybiBbXTtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdHJldHVybiBhZGRpdGlvbmFsUGlja3MubGVuZ3RoID4gMCA/IFtcblx0XHRcdFx0XHR7IHR5cGU6ICdzZXBhcmF0b3InLCBsYWJlbDogdGhpcy5jb25maWd1cmF0aW9uLmluY2x1ZGVTeW1ib2xzID8gbG9jYWxpemUoJ2ZpbGVBbmRTeW1ib2xSZXN1bHRzU2VwYXJhdG9yJywgXCJmaWxlIGFuZCBzeW1ib2wgcmVzdWx0c1wiKSA6IGxvY2FsaXplKCdmaWxlUmVzdWx0c1NlcGFyYXRvcicsIFwiZmlsZSByZXN1bHRzXCIpIH0sXG5cdFx0XHRcdFx0Li4uYWRkaXRpb25hbFBpY2tzXG5cdFx0XHRcdF0gOiBbXTtcblx0XHRcdH0pKCksXG5cblx0XHRcdC8vIGFsbG93IHNvbWUgdGltZSB0byBtZXJnZSBmaWxlcyBhbmQgc3ltYm9scyB0byByZWR1Y2UgZmxpY2tlcmluZ1xuXHRcdFx0bWVyZ2VEZWxheTogQW55dGhpbmdRdWlja0FjY2Vzc1Byb3ZpZGVyLlNZTUJPTF9QSUNLU19NRVJHRV9ERUxBWVxuXHRcdH07XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIGdldEFkZGl0aW9uYWxQaWNrcyhxdWVyeTogSVByZXBhcmVkUXVlcnksIGV4Y2x1ZGVzOiBSZXNvdXJjZU1hcDxib29sZWFuPiwgaW5jbHVkZVN5bWJvbHM6IGJvb2xlYW4sIHRva2VuOiBDYW5jZWxsYXRpb25Ub2tlbik6IFByb21pc2U8QXJyYXk8SUFueXRoaW5nUXVpY2tQaWNrSXRlbT4+IHtcblxuXHRcdC8vIFJlc29sdmUgZmlsZSBhbmQgc3ltYm9sIHBpY2tzIChpZiBlbmFibGVkKVxuXHRcdGNvbnN0IFtmaWxlUGlja3MsIHN5bWJvbFBpY2tzXSA9IGF3YWl0IFByb21pc2UuYWxsKFtcblx0XHRcdHRoaXMuZ2V0RmlsZVBpY2tzKHF1ZXJ5LCBleGNsdWRlcywgdG9rZW4pLFxuXHRcdFx0dGhpcy5nZXRXb3Jrc3BhY2VTeW1ib2xQaWNrcyhxdWVyeSwgaW5jbHVkZVN5bWJvbHMsIHRva2VuKVxuXHRcdF0pO1xuXG5cdFx0aWYgKHRva2VuLmlzQ2FuY2VsbGF0aW9uUmVxdWVzdGVkKSB7XG5cdFx0XHRyZXR1cm4gW107XG5cdFx0fVxuXG5cdFx0Ly8gUGVyZm9ybSBzb3J0aW5nICh0b3AgcmVzdWx0cyBieSBzY29yZSlcblx0XHRjb25zdCBzb3J0ZWRBbnl0aGluZ1BpY2tzID0gdG9wKFxuXHRcdFx0Wy4uLmZpbGVQaWNrcywgLi4uc3ltYm9sUGlja3NdLFxuXHRcdFx0KGFueVBpY2tBLCBhbnlQaWNrQikgPT4gY29tcGFyZUl0ZW1zQnlGdXp6eVNjb3JlKGFueVBpY2tBLCBhbnlQaWNrQiwgcXVlcnksIHRydWUsIHF1aWNrUGlja0l0ZW1TY29yZXJBY2Nlc3NvciwgdGhpcy5waWNrU3RhdGUuc2NvcmVyQ2FjaGUpLFxuXHRcdFx0QW55dGhpbmdRdWlja0FjY2Vzc1Byb3ZpZGVyLk1BWF9SRVNVTFRTXG5cdFx0KTtcblxuXHRcdC8vIFBlcmZvcm0gZmlsdGVyaW5nXG5cdFx0Y29uc3QgZmlsdGVyZWRBbnl0aGluZ1BpY2tzOiBJQW55dGhpbmdRdWlja1BpY2tJdGVtW10gPSBbXTtcblx0XHRmb3IgKGNvbnN0IGFueXRoaW5nUGljayBvZiBzb3J0ZWRBbnl0aGluZ1BpY2tzKSB7XG5cblx0XHRcdC8vIEFsd2F5cyBwcmVzZXJ2ZSBhbnkgZXhpc3RpbmcgaGlnaGxpZ2h0cyAoZS5nLiBmcm9tIHdvcmtzcGFjZSBzeW1ib2xzKVxuXHRcdFx0aWYgKGFueXRoaW5nUGljay5oaWdobGlnaHRzKSB7XG5cdFx0XHRcdGZpbHRlcmVkQW55dGhpbmdQaWNrcy5wdXNoKGFueXRoaW5nUGljayk7XG5cdFx0XHR9XG5cblx0XHRcdC8vIE90aGVyd2lzZSwgZG8gdGhlIHNjb3JpbmcgYW5kIG1hdGNoaW5nIGhlcmVcblx0XHRcdGVsc2Uge1xuXHRcdFx0XHRjb25zdCB7IHNjb3JlLCBsYWJlbE1hdGNoLCBkZXNjcmlwdGlvbk1hdGNoIH0gPSBzY29yZUl0ZW1GdXp6eShhbnl0aGluZ1BpY2ssIHF1ZXJ5LCB0cnVlLCBxdWlja1BpY2tJdGVtU2NvcmVyQWNjZXNzb3IsIHRoaXMucGlja1N0YXRlLnNjb3JlckNhY2hlKTtcblx0XHRcdFx0aWYgKCFzY29yZSkge1xuXHRcdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0YW55dGhpbmdQaWNrLmhpZ2hsaWdodHMgPSB7XG5cdFx0XHRcdFx0bGFiZWw6IGxhYmVsTWF0Y2gsXG5cdFx0XHRcdFx0ZGVzY3JpcHRpb246IGRlc2NyaXB0aW9uTWF0Y2hcblx0XHRcdFx0fTtcblxuXHRcdFx0XHRmaWx0ZXJlZEFueXRoaW5nUGlja3MucHVzaChhbnl0aGluZ1BpY2spO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdHJldHVybiBmaWx0ZXJlZEFueXRoaW5nUGlja3M7XG5cdH1cblxuXG5cdC8vI3JlZ2lvbiBFZGl0b3IgSGlzdG9yeVxuXG5cdHByaXZhdGUgcmVhZG9ubHkgbGFiZWxPbmx5RWRpdG9ySGlzdG9yeVBpY2tBY2Nlc3NvciA9IG5ldyBRdWlja1BpY2tJdGVtU2NvcmVyQWNjZXNzb3IoeyBza2lwRGVzY3JpcHRpb246IHRydWUgfSk7XG5cblx0cHJpdmF0ZSBnZXRFZGl0b3JIaXN0b3J5UGlja3MocXVlcnk6IElQcmVwYXJlZFF1ZXJ5KTogQXJyYXk8SUFueXRoaW5nUXVpY2tQaWNrSXRlbT4ge1xuXHRcdGNvbnN0IGNvbmZpZ3VyYXRpb24gPSB0aGlzLmNvbmZpZ3VyYXRpb247XG5cblx0XHQvLyBKdXN0IHJldHVybiBhbGwgaGlzdG9yeSBlbnRyaWVzIGlmIG5vdCBzZWFyY2hpbmdcblx0XHRpZiAoIXF1ZXJ5Lm5vcm1hbGl6ZWQpIHtcblx0XHRcdHJldHVybiB0aGlzLmhpc3RvcnlTZXJ2aWNlLmdldEhpc3RvcnkoKS5tYXAoZWRpdG9yID0+IHRoaXMuY3JlYXRlQW55dGhpbmdQaWNrKGVkaXRvciwgY29uZmlndXJhdGlvbikpO1xuXHRcdH1cblxuXHRcdGlmICghdGhpcy5jb25maWd1cmF0aW9uLmluY2x1ZGVIaXN0b3J5KSB7XG5cdFx0XHRyZXR1cm4gW107IC8vIGRpc2FibGVkIHdoZW4gc2VhcmNoaW5nXG5cdFx0fVxuXG5cdFx0Ly8gUGVyZm9ybSBmaWx0ZXJpbmdcblx0XHRjb25zdCBlZGl0b3JIaXN0b3J5U2NvcmVyQWNjZXNzb3IgPSBxdWVyeS5jb250YWluc1BhdGhTZXBhcmF0b3IgPyBxdWlja1BpY2tJdGVtU2NvcmVyQWNjZXNzb3IgOiB0aGlzLmxhYmVsT25seUVkaXRvckhpc3RvcnlQaWNrQWNjZXNzb3I7IC8vIE9ubHkgbWF0Y2ggb24gbGFiZWwgb2YgdGhlIGVkaXRvciB1bmxlc3MgdGhlIHNlYXJjaCBpbmNsdWRlcyBwYXRoIHNlcGFyYXRvcnNcblx0XHRjb25zdCBlZGl0b3JIaXN0b3J5UGlja3M6IEFycmF5PElBbnl0aGluZ1F1aWNrUGlja0l0ZW0+ID0gW107XG5cdFx0Zm9yIChjb25zdCBlZGl0b3Igb2YgdGhpcy5oaXN0b3J5U2VydmljZS5nZXRIaXN0b3J5KCkpIHtcblx0XHRcdGNvbnN0IHJlc291cmNlID0gZWRpdG9yLnJlc291cmNlO1xuXHRcdFx0aWYgKCFyZXNvdXJjZSkge1xuXHRcdFx0XHRjb250aW51ZTtcblx0XHRcdH1cblxuXHRcdFx0Y29uc3QgZWRpdG9ySGlzdG9yeVBpY2sgPSB0aGlzLmNyZWF0ZUFueXRoaW5nUGljayhlZGl0b3IsIGNvbmZpZ3VyYXRpb24pO1xuXG5cdFx0XHRjb25zdCB7IHNjb3JlLCBsYWJlbE1hdGNoLCBkZXNjcmlwdGlvbk1hdGNoIH0gPSBzY29yZUl0ZW1GdXp6eShlZGl0b3JIaXN0b3J5UGljaywgcXVlcnksIGZhbHNlLCBlZGl0b3JIaXN0b3J5U2NvcmVyQWNjZXNzb3IsIHRoaXMucGlja1N0YXRlLnNjb3JlckNhY2hlKTtcblx0XHRcdGlmICghc2NvcmUpIHtcblx0XHRcdFx0Y29udGludWU7IC8vIGV4Y2x1ZGUgZWRpdG9ycyBub3QgbWF0Y2hpbmcgcXVlcnlcblx0XHRcdH1cblxuXHRcdFx0ZWRpdG9ySGlzdG9yeVBpY2suaGlnaGxpZ2h0cyA9IHtcblx0XHRcdFx0bGFiZWw6IGxhYmVsTWF0Y2gsXG5cdFx0XHRcdGRlc2NyaXB0aW9uOiBkZXNjcmlwdGlvbk1hdGNoXG5cdFx0XHR9O1xuXG5cdFx0XHRlZGl0b3JIaXN0b3J5UGlja3MucHVzaChlZGl0b3JIaXN0b3J5UGljayk7XG5cdFx0fVxuXG5cdFx0Ly8gUmV0dXJuIHdpdGhvdXQgc29ydGluZyBpZiBzZXR0aW5ncyB0ZWxsIHRvIHNvcnQgYnkgcmVjZW5jeVxuXHRcdGlmICh0aGlzLmNvbmZpZ3VyYXRpb24uaGlzdG9yeUZpbHRlclNvcnRPcmRlciA9PT0gJ3JlY2VuY3knKSB7XG5cdFx0XHRyZXR1cm4gZWRpdG9ySGlzdG9yeVBpY2tzO1xuXHRcdH1cblxuXHRcdC8vIFBlcmZvcm0gc29ydGluZ1xuXHRcdHJldHVybiBlZGl0b3JIaXN0b3J5UGlja3Muc29ydCgoZWRpdG9yQSwgZWRpdG9yQikgPT4gY29tcGFyZUl0ZW1zQnlGdXp6eVNjb3JlKGVkaXRvckEsIGVkaXRvckIsIHF1ZXJ5LCBmYWxzZSwgZWRpdG9ySGlzdG9yeVNjb3JlckFjY2Vzc29yLCB0aGlzLnBpY2tTdGF0ZS5zY29yZXJDYWNoZSkpO1xuXHR9XG5cblx0Ly8jZW5kcmVnaW9uXG5cblxuXHQvLyNyZWdpb24gRmlsZSBTZWFyY2hcblxuXHRwcml2YXRlIHJlYWRvbmx5IGZpbGVRdWVyeURlbGF5ZXIgPSB0aGlzLl9yZWdpc3RlcihuZXcgVGhyb3R0bGVkRGVsYXllcjxVUklbXT4oQW55dGhpbmdRdWlja0FjY2Vzc1Byb3ZpZGVyLlRZUElOR19TRUFSQ0hfREVMQVkpKTtcblxuXHRwcml2YXRlIHJlYWRvbmx5IGZpbGVRdWVyeUJ1aWxkZXI6IFF1ZXJ5QnVpbGRlcjtcblxuXHRwcml2YXRlIGNyZWF0ZUZpbGVRdWVyeUNhY2hlKCk6IEZpbGVRdWVyeUNhY2hlU3RhdGUge1xuXHRcdHJldHVybiBuZXcgRmlsZVF1ZXJ5Q2FjaGVTdGF0ZShcblx0XHRcdGNhY2hlS2V5ID0+IHRoaXMuZmlsZVF1ZXJ5QnVpbGRlci5maWxlKHRoaXMuY29udGV4dFNlcnZpY2UuZ2V0V29ya3NwYWNlKCkuZm9sZGVycywgdGhpcy5nZXRGaWxlUXVlcnlPcHRpb25zKHsgY2FjaGVLZXkgfSkpLFxuXHRcdFx0cXVlcnkgPT4gdGhpcy5zZWFyY2hTZXJ2aWNlLmZpbGVTZWFyY2gocXVlcnkpLFxuXHRcdFx0Y2FjaGVLZXkgPT4gdGhpcy5zZWFyY2hTZXJ2aWNlLmNsZWFyQ2FjaGUoY2FjaGVLZXkpLFxuXHRcdFx0dGhpcy5waWNrU3RhdGUuZmlsZVF1ZXJ5Q2FjaGVcblx0XHQpLmxvYWQoKTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgZ2V0RmlsZVBpY2tzKHF1ZXJ5OiBJUHJlcGFyZWRRdWVyeSwgZXhjbHVkZXM6IFJlc291cmNlTWFwPGJvb2xlYW4+LCB0b2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4pOiBQcm9taXNlPEFycmF5PElBbnl0aGluZ1F1aWNrUGlja0l0ZW0+PiB7XG5cdFx0aWYgKCFxdWVyeS5ub3JtYWxpemVkKSB7XG5cdFx0XHRyZXR1cm4gW107XG5cdFx0fVxuXG5cdFx0Ly8gQWJzb2x1dGUgcGF0aCByZXN1bHRcblx0XHRjb25zdCBhYnNvbHV0ZVBhdGhSZXN1bHQgPSBhd2FpdCB0aGlzLmdldEFic29sdXRlUGF0aEZpbGVSZXN1bHQocXVlcnksIHRva2VuKTtcblx0XHRpZiAodG9rZW4uaXNDYW5jZWxsYXRpb25SZXF1ZXN0ZWQpIHtcblx0XHRcdHJldHVybiBbXTtcblx0XHR9XG5cblx0XHQvLyBVc2UgYWJzb2x1dGUgcGF0aCByZXN1bHQgYXMgb25seSByZXN1bHRzIGlmIHByZXNlbnRcblx0XHRsZXQgZmlsZU1hdGNoZXM6IEFycmF5PFVSST47XG5cdFx0aWYgKGFic29sdXRlUGF0aFJlc3VsdCkge1xuXHRcdFx0aWYgKGV4Y2x1ZGVzLmhhcyhhYnNvbHV0ZVBhdGhSZXN1bHQpKSB7XG5cdFx0XHRcdHJldHVybiBbXTsgLy8gZXhjbHVkZWRcblx0XHRcdH1cblxuXHRcdFx0Ly8gQ3JlYXRlIGEgc2luZ2xlIHJlc3VsdCBwaWNrIGFuZCBtYWtlIHN1cmUgdG8gYXBwbHkgZnVsbFxuXHRcdFx0Ly8gaGlnaGxpZ2h0cyB0byBlbnN1cmUgdGhlIHBpY2sgaXMgZGlzcGxheWVkLiBTaW5jZSBhXG5cdFx0XHQvLyB+IG1pZ2h0IGhhdmUgYmVlbiB1c2VkIGZvciBzZWFyY2hpbmcsIG91ciBmdXp6eSBzY29yZXJcblx0XHRcdC8vIG1heSBvdGhlcndpc2Ugbm90IHByb3Blcmx5IHJlc3BlY3QgdGhlIHBpY2sgYXMgYSByZXN1bHRcblx0XHRcdGNvbnN0IGFic29sdXRlUGF0aFBpY2sgPSB0aGlzLmNyZWF0ZUFueXRoaW5nUGljayhhYnNvbHV0ZVBhdGhSZXN1bHQsIHRoaXMuY29uZmlndXJhdGlvbik7XG5cdFx0XHRhYnNvbHV0ZVBhdGhQaWNrLmhpZ2hsaWdodHMgPSB7XG5cdFx0XHRcdGxhYmVsOiBbeyBzdGFydDogMCwgZW5kOiBhYnNvbHV0ZVBhdGhQaWNrLmxhYmVsLmxlbmd0aCB9XSxcblx0XHRcdFx0ZGVzY3JpcHRpb246IGFic29sdXRlUGF0aFBpY2suZGVzY3JpcHRpb24gPyBbeyBzdGFydDogMCwgZW5kOiBhYnNvbHV0ZVBhdGhQaWNrLmRlc2NyaXB0aW9uLmxlbmd0aCB9XSA6IHVuZGVmaW5lZFxuXHRcdFx0fTtcblxuXHRcdFx0cmV0dXJuIFthYnNvbHV0ZVBhdGhQaWNrXTtcblx0XHR9XG5cblx0XHQvLyBPdGhlcndpc2UgcnVuIHRoZSBmaWxlIHNlYXJjaCAod2l0aCBhIGRlbGF5ZXIgaWYgY2FjaGUgaXMgbm90IHJlYWR5IHlldClcblx0XHRpZiAodGhpcy5waWNrU3RhdGUuZmlsZVF1ZXJ5Q2FjaGU/LmlzTG9hZGVkKSB7XG5cdFx0XHRmaWxlTWF0Y2hlcyA9IGF3YWl0IHRoaXMuZG9GaWxlU2VhcmNoKHF1ZXJ5LCB0b2tlbik7XG5cdFx0fSBlbHNlIHtcblx0XHRcdGZpbGVNYXRjaGVzID0gYXdhaXQgdGhpcy5maWxlUXVlcnlEZWxheWVyLnRyaWdnZXIoYXN5bmMgKCkgPT4ge1xuXHRcdFx0XHRpZiAodG9rZW4uaXNDYW5jZWxsYXRpb25SZXF1ZXN0ZWQpIHtcblx0XHRcdFx0XHRyZXR1cm4gW107XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRyZXR1cm4gdGhpcy5kb0ZpbGVTZWFyY2gocXVlcnksIHRva2VuKTtcblx0XHRcdH0pO1xuXHRcdH1cblxuXHRcdGlmICh0b2tlbi5pc0NhbmNlbGxhdGlvblJlcXVlc3RlZCkge1xuXHRcdFx0cmV0dXJuIFtdO1xuXHRcdH1cblxuXHRcdC8vIEZpbHRlciBleGNsdWRlcyAmIGNvbnZlcnQgdG8gcGlja3Ncblx0XHRjb25zdCBjb25maWd1cmF0aW9uID0gdGhpcy5jb25maWd1cmF0aW9uO1xuXHRcdHJldHVybiBmaWxlTWF0Y2hlc1xuXHRcdFx0LmZpbHRlcihyZXNvdXJjZSA9PiAhZXhjbHVkZXMuaGFzKHJlc291cmNlKSlcblx0XHRcdC5tYXAocmVzb3VyY2UgPT4gdGhpcy5jcmVhdGVBbnl0aGluZ1BpY2socmVzb3VyY2UsIGNvbmZpZ3VyYXRpb24pKTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgZG9GaWxlU2VhcmNoKHF1ZXJ5OiBJUHJlcGFyZWRRdWVyeSwgdG9rZW46IENhbmNlbGxhdGlvblRva2VuKTogUHJvbWlzZTxVUklbXT4ge1xuXHRcdGNvbnN0IFtmaWxlU2VhcmNoUmVzdWx0cywgcmVsYXRpdmVQYXRoRmlsZVJlc3VsdHNdID0gYXdhaXQgUHJvbWlzZS5hbGwoW1xuXG5cdFx0XHQvLyBGaWxlIHNlYXJjaDogdGhpcyBpcyBhIHNlYXJjaCBvdmVyIGFsbCBmaWxlcyBvZiB0aGUgd29ya3NwYWNlIHVzaW5nIHRoZSBwcm92aWRlZCBwYXR0ZXJuXG5cdFx0XHR0aGlzLmdldEZpbGVTZWFyY2hSZXN1bHRzKHF1ZXJ5LCB0b2tlbiksXG5cblx0XHRcdC8vIFJlbGF0aXZlIHBhdGggc2VhcmNoOiB3ZSBhbHNvIHdhbnQgdG8gY29uc2lkZXIgcmVzdWx0cyB0aGF0IG1hdGNoIGZpbGVzIGluc2lkZSB0aGUgd29ya3NwYWNlXG5cdFx0XHQvLyBieSBsb29raW5nIGZvciByZWxhdGl2ZSBwYXRocyB0aGF0IHRoZSB1c2VyIHR5cGVkIGFzIHF1ZXJ5LiBUaGlzIGFsbG93cyB0byByZXR1cm4gZXZlbiBleGNsdWRlZFxuXHRcdFx0Ly8gcmVzdWx0cyBpbnRvIHRoZSBwaWNrZXIgaWYgZm91bmQgKGUuZy4gaGVscHMgZm9yIG9wZW5pbmcgY29tcGlsYXRpb24gcmVzdWx0cyB0aGF0IGFyZSBvdGhlcndpc2Vcblx0XHRcdC8vIGV4Y2x1ZGVkKVxuXHRcdFx0dGhpcy5nZXRSZWxhdGl2ZVBhdGhGaWxlUmVzdWx0cyhxdWVyeSwgdG9rZW4pXG5cdFx0XSk7XG5cblx0XHRpZiAodG9rZW4uaXNDYW5jZWxsYXRpb25SZXF1ZXN0ZWQpIHtcblx0XHRcdHJldHVybiBbXTtcblx0XHR9XG5cblx0XHQvLyBSZXR1cm4gcXVpY2tseSBpZiBubyByZWxhdGl2ZSByZXN1bHRzIGFyZSBwcmVzZW50XG5cdFx0aWYgKCFyZWxhdGl2ZVBhdGhGaWxlUmVzdWx0cykge1xuXHRcdFx0cmV0dXJuIGZpbGVTZWFyY2hSZXN1bHRzO1xuXHRcdH1cblxuXHRcdC8vIE90aGVyd2lzZSwgbWFrZSBzdXJlIHRvIGZpbHRlciByZWxhdGl2ZSBwYXRoIHJlc3VsdHMgZnJvbVxuXHRcdC8vIHRoZSBzZWFyY2ggcmVzdWx0cyB0byBwcmV2ZW50IGR1cGxpY2F0ZXNcblx0XHRjb25zdCByZWxhdGl2ZVBhdGhGaWxlUmVzdWx0c01hcCA9IG5ldyBSZXNvdXJjZU1hcDxib29sZWFuPih1cmkgPT4gdGhpcy51cmlJZGVudGl0eVNlcnZpY2UuZXh0VXJpLmdldENvbXBhcmlzb25LZXkodXJpKSk7XG5cdFx0Zm9yIChjb25zdCByZWxhdGl2ZVBhdGhGaWxlUmVzdWx0IG9mIHJlbGF0aXZlUGF0aEZpbGVSZXN1bHRzKSB7XG5cdFx0XHRyZWxhdGl2ZVBhdGhGaWxlUmVzdWx0c01hcC5zZXQocmVsYXRpdmVQYXRoRmlsZVJlc3VsdCwgdHJ1ZSk7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIFtcblx0XHRcdC4uLmZpbGVTZWFyY2hSZXN1bHRzLmZpbHRlcihyZXN1bHQgPT4gIXJlbGF0aXZlUGF0aEZpbGVSZXN1bHRzTWFwLmhhcyhyZXN1bHQpKSxcblx0XHRcdC4uLnJlbGF0aXZlUGF0aEZpbGVSZXN1bHRzXG5cdFx0XTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgZ2V0RmlsZVNlYXJjaFJlc3VsdHMocXVlcnk6IElQcmVwYXJlZFF1ZXJ5LCB0b2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4pOiBQcm9taXNlPFVSSVtdPiB7XG5cblx0XHQvLyBmaWxlUGF0dGVybiBmb3Igc2VhcmNoIGRlcGVuZHMgb24gdGhlIG51bWJlciBvZiBxdWVyaWVzIGluIGlucHV0OlxuXHRcdC8vIC0gd2l0aCBtdWx0aXBsZTogb25seSB0YWtlIHRoZSBmaXJzdCBvbmUgYW5kIGxldCB0aGUgZmlsdGVyIGxhdGVyIGRyb3Agbm9uLW1hdGNoaW5nIHJlc3VsdHNcblx0XHQvLyAtIHdpdGggc2luZ2xlOiBqdXN0IHRha2UgdGhlIG9yaWdpbmFsIGluIGZ1bGxcblx0XHQvL1xuXHRcdC8vIFRoaXMgZW5hYmxlcyB0byBlLmcuIHNlYXJjaCBmb3IgXCJzb21lRmlsZSBzb21lRm9sZGVyXCIgYnkgb25seSByZXR1cm5pbmdcblx0XHQvLyBzZWFyY2ggcmVzdWx0cyBmb3IgXCJzb21lRmlsZVwiIGFuZCBub3QgYm90aCB0aGF0IHdvdWxkIG5vcm1hbGx5IG5vdCBtYXRjaC5cblx0XHQvL1xuXHRcdGxldCBmaWxlUGF0dGVybiA9ICcnO1xuXHRcdGlmIChxdWVyeS52YWx1ZXMgJiYgcXVlcnkudmFsdWVzLmxlbmd0aCA+IDEpIHtcblx0XHRcdGZpbGVQYXR0ZXJuID0gcXVlcnkudmFsdWVzWzBdLm9yaWdpbmFsO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRmaWxlUGF0dGVybiA9IHF1ZXJ5Lm9yaWdpbmFsO1xuXHRcdH1cblxuXHRcdGNvbnN0IGZpbGVTZWFyY2hSZXN1bHRzID0gYXdhaXQgdGhpcy5kb0dldEZpbGVTZWFyY2hSZXN1bHRzKGZpbGVQYXR0ZXJuLCB0b2tlbik7XG5cdFx0aWYgKHRva2VuLmlzQ2FuY2VsbGF0aW9uUmVxdWVzdGVkKSB7XG5cdFx0XHRyZXR1cm4gW107XG5cdFx0fVxuXG5cdFx0Ly8gSWYgd2UgZGV0ZWN0IHRoYXQgdGhlIHNlYXJjaCBsaW1pdCBoYXMgYmVlbiBoaXQgYW5kIHdlIGhhdmUgYSBxdWVyeVxuXHRcdC8vIHRoYXQgd2FzIGNvbXBvc2VkIG9mIG11bHRpcGxlIGlucHV0cyB3aGVyZSB3ZSBvbmx5IHRvb2sgdGhlIGZpcnN0IHBhcnRcblx0XHQvLyB3ZSBydW4gYW5vdGhlciBzZWFyY2ggd2l0aCB0aGUgZnVsbCBvcmlnaW5hbCBxdWVyeSBpbmNsdWRlZCB0byBtYWtlXG5cdFx0Ly8gc3VyZSB3ZSBhcmUgaW5jbHVkaW5nIGFsbCBwb3NzaWJsZSByZXN1bHRzIHRoYXQgY291bGQgbWF0Y2guXG5cdFx0aWYgKGZpbGVTZWFyY2hSZXN1bHRzLmxpbWl0SGl0ICYmIHF1ZXJ5LnZhbHVlcyAmJiBxdWVyeS52YWx1ZXMubGVuZ3RoID4gMSkge1xuXHRcdFx0Y29uc3QgYWRkaXRpb25hbEZpbGVTZWFyY2hSZXN1bHRzID0gYXdhaXQgdGhpcy5kb0dldEZpbGVTZWFyY2hSZXN1bHRzKHF1ZXJ5Lm9yaWdpbmFsLCB0b2tlbik7XG5cdFx0XHRpZiAodG9rZW4uaXNDYW5jZWxsYXRpb25SZXF1ZXN0ZWQpIHtcblx0XHRcdFx0cmV0dXJuIFtdO1xuXHRcdFx0fVxuXG5cdFx0XHQvLyBSZW1lbWJlciB3aGljaCByZXN1bHQgd2UgYWxyZWFkeSBjb3ZlcmVkXG5cdFx0XHRjb25zdCBleGlzdGluZ0ZpbGVTZWFyY2hSZXN1bHRzTWFwID0gbmV3IFJlc291cmNlTWFwPGJvb2xlYW4+KHVyaSA9PiB0aGlzLnVyaUlkZW50aXR5U2VydmljZS5leHRVcmkuZ2V0Q29tcGFyaXNvbktleSh1cmkpKTtcblx0XHRcdGZvciAoY29uc3QgZmlsZVNlYXJjaFJlc3VsdCBvZiBmaWxlU2VhcmNoUmVzdWx0cy5yZXN1bHRzKSB7XG5cdFx0XHRcdGV4aXN0aW5nRmlsZVNlYXJjaFJlc3VsdHNNYXAuc2V0KGZpbGVTZWFyY2hSZXN1bHQucmVzb3VyY2UsIHRydWUpO1xuXHRcdFx0fVxuXG5cdFx0XHQvLyBBZGQgYWxsIGFkZGl0aW9uYWwgcmVzdWx0cyB0byB0aGUgb3JpZ2luYWwgc2V0IGZvciBpbmNsdXNpb25cblx0XHRcdGZvciAoY29uc3QgYWRkaXRpb25hbEZpbGVTZWFyY2hSZXN1bHQgb2YgYWRkaXRpb25hbEZpbGVTZWFyY2hSZXN1bHRzLnJlc3VsdHMpIHtcblx0XHRcdFx0aWYgKCFleGlzdGluZ0ZpbGVTZWFyY2hSZXN1bHRzTWFwLmhhcyhhZGRpdGlvbmFsRmlsZVNlYXJjaFJlc3VsdC5yZXNvdXJjZSkpIHtcblx0XHRcdFx0XHRmaWxlU2VhcmNoUmVzdWx0cy5yZXN1bHRzLnB1c2goYWRkaXRpb25hbEZpbGVTZWFyY2hSZXN1bHQpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0cmV0dXJuIGZpbGVTZWFyY2hSZXN1bHRzLnJlc3VsdHMubWFwKHJlc3VsdCA9PiByZXN1bHQucmVzb3VyY2UpO1xuXHR9XG5cblx0cHJpdmF0ZSBkb0dldEZpbGVTZWFyY2hSZXN1bHRzKGZpbGVQYXR0ZXJuOiBzdHJpbmcsIHRva2VuOiBDYW5jZWxsYXRpb25Ub2tlbik6IFByb21pc2U8SVNlYXJjaENvbXBsZXRlPiB7XG5cdFx0Y29uc3Qgc3RhcnQgPSBEYXRlLm5vdygpO1xuXHRcdHJldHVybiB0aGlzLnNlYXJjaFNlcnZpY2UuZmlsZVNlYXJjaChcblx0XHRcdHRoaXMuZmlsZVF1ZXJ5QnVpbGRlci5maWxlKFxuXHRcdFx0XHR0aGlzLmNvbnRleHRTZXJ2aWNlLmdldFdvcmtzcGFjZSgpLmZvbGRlcnMsXG5cdFx0XHRcdHRoaXMuZ2V0RmlsZVF1ZXJ5T3B0aW9ucyh7XG5cdFx0XHRcdFx0ZmlsZVBhdHRlcm4sXG5cdFx0XHRcdFx0Y2FjaGVLZXk6IHRoaXMucGlja1N0YXRlLmZpbGVRdWVyeUNhY2hlPy5jYWNoZUtleSxcblx0XHRcdFx0XHRtYXhSZXN1bHRzOiBBbnl0aGluZ1F1aWNrQWNjZXNzUHJvdmlkZXIuTUFYX1JFU1VMVFNcblx0XHRcdFx0fSlcblx0XHRcdCksIHRva2VuKS5maW5hbGx5KCgpID0+IHtcblx0XHRcdFx0dGhpcy5sb2dTZXJ2aWNlLnRyYWNlKGBRdWlja0FjY2VzcyBmaWxlU2VhcmNoICR7RGF0ZS5ub3coKSAtIHN0YXJ0fW1zYCk7XG5cdFx0XHR9KTtcblx0fVxuXG5cdHByaXZhdGUgZ2V0RmlsZVF1ZXJ5T3B0aW9ucyhpbnB1dDogeyBmaWxlUGF0dGVybj86IHN0cmluZzsgY2FjaGVLZXk/OiBzdHJpbmc7IG1heFJlc3VsdHM/OiBudW1iZXIgfSk6IElGaWxlUXVlcnlCdWlsZGVyT3B0aW9ucyB7XG5cdFx0cmV0dXJuIHtcblx0XHRcdF9yZWFzb246ICdvcGVuRmlsZUhhbmRsZXInLCAvLyB1c2VkIGZvciB0ZWxlbWV0cnkgLSBkbyBub3QgY2hhbmdlXG5cdFx0XHRleHRyYUZpbGVSZXNvdXJjZXM6IHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UuaW52b2tlRnVuY3Rpb24oZ2V0T3V0T2ZXb3Jrc3BhY2VFZGl0b3JSZXNvdXJjZXMpLFxuXHRcdFx0ZmlsZVBhdHRlcm46IGlucHV0LmZpbGVQYXR0ZXJuIHx8ICcnLFxuXHRcdFx0Y2FjaGVLZXk6IGlucHV0LmNhY2hlS2V5LFxuXHRcdFx0bWF4UmVzdWx0czogaW5wdXQubWF4UmVzdWx0cyB8fCAwLFxuXHRcdFx0c29ydEJ5U2NvcmU6IHRydWVcblx0XHR9O1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBnZXRBYnNvbHV0ZVBhdGhGaWxlUmVzdWx0KHF1ZXJ5OiBJUHJlcGFyZWRRdWVyeSwgdG9rZW46IENhbmNlbGxhdGlvblRva2VuKTogUHJvbWlzZTxVUkkgfCB1bmRlZmluZWQ+IHtcblx0XHRpZiAoIXF1ZXJ5LmNvbnRhaW5zUGF0aFNlcGFyYXRvcikge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IHVzZXJIb21lID0gYXdhaXQgdGhpcy5wYXRoU2VydmljZS51c2VySG9tZSgpO1xuXHRcdGNvbnN0IGRldGlsZGlmaWVkUXVlcnkgPSB1bnRpbGRpZnkocXVlcnkub3JpZ2luYWwsIHVzZXJIb21lLnNjaGVtZSA9PT0gU2NoZW1hcy5maWxlID8gdXNlckhvbWUuZnNQYXRoIDogdXNlckhvbWUucGF0aCk7XG5cdFx0aWYgKHRva2VuLmlzQ2FuY2VsbGF0aW9uUmVxdWVzdGVkKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29uc3QgaXNBYnNvbHV0ZVBhdGhRdWVyeSA9IChhd2FpdCB0aGlzLnBhdGhTZXJ2aWNlLnBhdGgpLmlzQWJzb2x1dGUoZGV0aWxkaWZpZWRRdWVyeSk7XG5cdFx0aWYgKHRva2VuLmlzQ2FuY2VsbGF0aW9uUmVxdWVzdGVkKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0aWYgKGlzQWJzb2x1dGVQYXRoUXVlcnkpIHtcblx0XHRcdGNvbnN0IHJlc291cmNlID0gdG9Mb2NhbFJlc291cmNlKFxuXHRcdFx0XHRhd2FpdCB0aGlzLnBhdGhTZXJ2aWNlLmZpbGVVUkkoZGV0aWxkaWZpZWRRdWVyeSksXG5cdFx0XHRcdHRoaXMuZW52aXJvbm1lbnRTZXJ2aWNlLnJlbW90ZUF1dGhvcml0eSxcblx0XHRcdFx0dGhpcy5wYXRoU2VydmljZS5kZWZhdWx0VXJpU2NoZW1lXG5cdFx0XHQpO1xuXG5cdFx0XHRpZiAodG9rZW4uaXNDYW5jZWxsYXRpb25SZXF1ZXN0ZWQpIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXG5cdFx0XHR0cnkge1xuXHRcdFx0XHRjb25zdCBzdGF0ID0gYXdhaXQgdGhpcy5maWxlU2VydmljZS5zdGF0KHJlc291cmNlKTtcblx0XHRcdFx0aWYgKHN0YXQuaXNGaWxlKSB7XG5cdFx0XHRcdFx0cmV0dXJuIGF3YWl0IHRoaXMubWF0Y2hGaWxlbmFtZUNhc2luZyhyZXNvdXJjZSk7XG5cdFx0XHRcdH1cblx0XHRcdH0gY2F0Y2ggKGVycm9yKSB7XG5cdFx0XHRcdC8vIGlnbm9yZSBpZiBmaWxlIGRvZXMgbm90IGV4aXN0XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0cmV0dXJuO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBnZXRSZWxhdGl2ZVBhdGhGaWxlUmVzdWx0cyhxdWVyeTogSVByZXBhcmVkUXVlcnksIHRva2VuOiBDYW5jZWxsYXRpb25Ub2tlbik6IFByb21pc2U8VVJJW10gfCB1bmRlZmluZWQ+IHtcblx0XHRpZiAoIXF1ZXJ5LmNvbnRhaW5zUGF0aFNlcGFyYXRvcikge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdC8vIENvbnZlcnQgcmVsYXRpdmUgcGF0aHMgdG8gYWJzb2x1dGUgcGF0aHMgb3ZlciBhbGwgZm9sZGVycyBvZiB0aGUgd29ya3NwYWNlXG5cdFx0Ly8gYW5kIHJldHVybiB0aGVtIGFzIHJlc3VsdHMgaWYgdGhlIGFic29sdXRlIHBhdGhzIGV4aXN0XG5cdFx0Y29uc3QgaXNBYnNvbHV0ZVBhdGhRdWVyeSA9IChhd2FpdCB0aGlzLnBhdGhTZXJ2aWNlLnBhdGgpLmlzQWJzb2x1dGUocXVlcnkub3JpZ2luYWwpO1xuXHRcdGlmICghaXNBYnNvbHV0ZVBhdGhRdWVyeSkge1xuXHRcdFx0Y29uc3QgcmVzb3VyY2VzOiBVUklbXSA9IFtdO1xuXHRcdFx0Zm9yIChjb25zdCBmb2xkZXIgb2YgdGhpcy5jb250ZXh0U2VydmljZS5nZXRXb3Jrc3BhY2UoKS5mb2xkZXJzKSB7XG5cdFx0XHRcdGlmICh0b2tlbi5pc0NhbmNlbGxhdGlvblJlcXVlc3RlZCkge1xuXHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0Y29uc3QgcmVzb3VyY2UgPSB0b0xvY2FsUmVzb3VyY2UoXG5cdFx0XHRcdFx0Zm9sZGVyLnRvUmVzb3VyY2UocXVlcnkub3JpZ2luYWwpLFxuXHRcdFx0XHRcdHRoaXMuZW52aXJvbm1lbnRTZXJ2aWNlLnJlbW90ZUF1dGhvcml0eSxcblx0XHRcdFx0XHR0aGlzLnBhdGhTZXJ2aWNlLmRlZmF1bHRVcmlTY2hlbWVcblx0XHRcdFx0KTtcblxuXHRcdFx0XHR0cnkge1xuXHRcdFx0XHRcdGNvbnN0IHN0YXQgPSBhd2FpdCB0aGlzLmZpbGVTZXJ2aWNlLnN0YXQocmVzb3VyY2UpO1xuXHRcdFx0XHRcdGlmIChzdGF0LmlzRmlsZSkge1xuXHRcdFx0XHRcdFx0cmVzb3VyY2VzLnB1c2goYXdhaXQgdGhpcy5tYXRjaEZpbGVuYW1lQ2FzaW5nKHJlc291cmNlKSk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9IGNhdGNoIChlcnJvcikge1xuXHRcdFx0XHRcdC8vIGlnbm9yZSBpZiBmaWxlIGRvZXMgbm90IGV4aXN0XG5cdFx0XHRcdH1cblx0XHRcdH1cblxuXHRcdFx0cmV0dXJuIHJlc291cmNlcztcblx0XHR9XG5cblx0XHRyZXR1cm47XG5cdH1cblxuXHQvKipcblx0ICogQXR0ZW1wdHMgdG8gbWF0Y2ggdGhlIGZpbGVuYW1lIGNhc2luZyB0byBmaWxlIHN5c3RlbSBieSBjaGVja2luZyB0aGUgcGFyZW50IGZvbGRlcidzIGNoaWxkcmVuLlxuXHQgKi9cblx0cHJpdmF0ZSBhc3luYyBtYXRjaEZpbGVuYW1lQ2FzaW5nKHJlc291cmNlOiBVUkkpOiBQcm9taXNlPFVSST4ge1xuXHRcdGNvbnN0IHBhcmVudCA9IGRpcm5hbWUocmVzb3VyY2UpO1xuXHRcdGNvbnN0IHN0YXQgPSBhd2FpdCB0aGlzLmZpbGVTZXJ2aWNlLnJlc29sdmUocGFyZW50LCB7IHJlc29sdmVUbzogW3Jlc291cmNlXSB9KTtcblx0XHRpZiAoc3RhdD8uY2hpbGRyZW4pIHtcblx0XHRcdGNvbnN0IG1hdGNoID0gc3RhdC5jaGlsZHJlbi5maW5kKGNoaWxkID0+IHRoaXMudXJpSWRlbnRpdHlTZXJ2aWNlLmV4dFVyaS5pc0VxdWFsKGNoaWxkLnJlc291cmNlLCByZXNvdXJjZSkpO1xuXHRcdFx0aWYgKG1hdGNoKSB7XG5cdFx0XHRcdHJldHVybiBVUkkuam9pblBhdGgocGFyZW50LCBtYXRjaC5uYW1lKTtcblx0XHRcdH1cblx0XHR9XG5cdFx0cmV0dXJuIHJlc291cmNlO1xuXHR9XG5cblx0Ly8jZW5kcmVnaW9uXG5cblx0Ly8jcmVnaW9uIENvbW1hbmQgQ2VudGVyIChpZiBlbmFibGVkKVxuXG5cdHByaXZhdGUgcmVhZG9ubHkgbGF6eVJlZ2lzdHJ5ID0gbmV3IExhenkoKCkgPT4gUmVnaXN0cnkuYXM8SVF1aWNrQWNjZXNzUmVnaXN0cnk+KEV4dGVuc2lvbnMuUXVpY2thY2Nlc3MpKTtcblxuXHRwcml2YXRlIGdldEhlbHBQaWNrcyhxdWVyeTogSVByZXBhcmVkUXVlcnksIHRva2VuOiBDYW5jZWxsYXRpb25Ub2tlbiwgcnVuT3B0aW9ucz86IEFueXRoaW5nUXVpY2tBY2Nlc3NQcm92aWRlclJ1bk9wdGlvbnMpOiBJQW55dGhpbmdRdWlja1BpY2tJdGVtW10ge1xuXHRcdGlmIChxdWVyeS5ub3JtYWxpemVkKSB7XG5cdFx0XHRyZXR1cm4gW107IC8vIElmIHRoZXJlJ3MgYSBmaWx0ZXIsIHdlIGRvbid0IHNob3cgdGhlIGhlbHBcblx0XHR9XG5cblx0XHR0eXBlIElIZWxwQW55dGhpbmdRdWlja1BpY2tJdGVtID0gSUFueXRoaW5nUXVpY2tQaWNrSXRlbSAmIHsgY29tbWFuZENlbnRlck9yZGVyOiBudW1iZXIgfTtcblx0XHRjb25zdCBwcm92aWRlcnM6IElIZWxwQW55dGhpbmdRdWlja1BpY2tJdGVtW10gPSB0aGlzLmxhenlSZWdpc3RyeS52YWx1ZS5nZXRRdWlja0FjY2Vzc1Byb3ZpZGVycyh0aGlzLmNvbnRleHRLZXlTZXJ2aWNlKVxuXHRcdFx0LmZpbHRlcihwID0+IHAuaGVscEVudHJpZXMuc29tZShoID0+IGguY29tbWFuZENlbnRlck9yZGVyICE9PSB1bmRlZmluZWQpKVxuXHRcdFx0LmZsYXRNYXAocHJvdmlkZXIgPT4gcHJvdmlkZXIuaGVscEVudHJpZXNcblx0XHRcdFx0LmZpbHRlcihoID0+IGguY29tbWFuZENlbnRlck9yZGVyICE9PSB1bmRlZmluZWQpXG5cdFx0XHRcdC5tYXAoaGVscEVudHJ5ID0+IHtcblx0XHRcdFx0XHRjb25zdCBwcm92aWRlclNwZWNpZmljT3B0aW9uczogQW55dGhpbmdRdWlja0FjY2Vzc1Byb3ZpZGVyUnVuT3B0aW9ucyB8IHVuZGVmaW5lZCA9IHtcblx0XHRcdFx0XHRcdC4uLnJ1bk9wdGlvbnMsXG5cdFx0XHRcdFx0XHRpbmNsdWRlSGVscDogcHJvdmlkZXIucHJlZml4ID09PSBBbnl0aGluZ1F1aWNrQWNjZXNzUHJvdmlkZXIuUFJFRklYID8gZmFsc2UgOiBydW5PcHRpb25zPy5pbmNsdWRlSGVscFxuXHRcdFx0XHRcdH07XG5cblx0XHRcdFx0XHRjb25zdCBsYWJlbCA9IGhlbHBFbnRyeS5jb21tYW5kQ2VudGVyTGFiZWwgPz8gaGVscEVudHJ5LmRlc2NyaXB0aW9uO1xuXHRcdFx0XHRcdHJldHVybiB7XG5cdFx0XHRcdFx0XHRsYWJlbCxcblx0XHRcdFx0XHRcdGRlc2NyaXB0aW9uOiBoZWxwRW50cnkucHJlZml4ID8/IHByb3ZpZGVyLnByZWZpeCxcblx0XHRcdFx0XHRcdGNvbW1hbmRDZW50ZXJPcmRlcjogaGVscEVudHJ5LmNvbW1hbmRDZW50ZXJPcmRlciEsXG5cdFx0XHRcdFx0XHRrZXliaW5kaW5nOiBoZWxwRW50cnkuY29tbWFuZElkID8gdGhpcy5rZXliaW5kaW5nU2VydmljZS5sb29rdXBLZXliaW5kaW5nKGhlbHBFbnRyeS5jb21tYW5kSWQpIDogdW5kZWZpbmVkLFxuXHRcdFx0XHRcdFx0YXJpYUxhYmVsOiBsb2NhbGl6ZSgnaGVscFBpY2tBcmlhTGFiZWwnLCBcInswfSwgezF9XCIsIGxhYmVsLCBoZWxwRW50cnkuZGVzY3JpcHRpb24pLFxuXHRcdFx0XHRcdFx0YWNjZXB0OiAoKSA9PiB7XG5cdFx0XHRcdFx0XHRcdHRoaXMucXVpY2tJbnB1dFNlcnZpY2UucXVpY2tBY2Nlc3Muc2hvdyhwcm92aWRlci5wcmVmaXgsIHtcblx0XHRcdFx0XHRcdFx0XHRwcmVzZXJ2ZVZhbHVlOiB0cnVlLFxuXHRcdFx0XHRcdFx0XHRcdHByb3ZpZGVyT3B0aW9uczogcHJvdmlkZXJTcGVjaWZpY09wdGlvbnNcblx0XHRcdFx0XHRcdFx0fSk7XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0fTtcblx0XHRcdFx0fSkpO1xuXG5cdFx0Ly8gVE9ETzogVGhlcmUgaGFzIHRvIGJlIGEgYmV0dGVyIHBsYWNlIGZvciB0aGlzLCBidXQgaXQncyB0aGUgZmlyc3QgdGltZSB3ZSBhcmUgYWRkaW5nIGEgbm9uLXF1aWNrIGFjY2VzcyBwcm92aWRlclxuXHRcdC8vIHRvIHRoZSBjb21tYW5kIGNlbnRlciwgc28gZm9yIG5vdywgbGV0J3MgZG8gdGhpcy5cblx0XHRpZiAodGhpcy5xdWlja0NoYXRTZXJ2aWNlLmVuYWJsZWQpIHtcblx0XHRcdHByb3ZpZGVycy5wdXNoKHtcblx0XHRcdFx0bGFiZWw6IGxvY2FsaXplKCdjaGF0JywgXCJPcGVuIFF1aWNrIENoYXRcIiksXG5cdFx0XHRcdGNvbW1hbmRDZW50ZXJPcmRlcjogMzAsXG5cdFx0XHRcdGtleWJpbmRpbmc6IHRoaXMua2V5YmluZGluZ1NlcnZpY2UubG9va3VwS2V5YmluZGluZyhBU0tfUVVJQ0tfUVVFU1RJT05fQUNUSU9OX0lEKSxcblx0XHRcdFx0YWNjZXB0OiAoKSA9PiB0aGlzLnF1aWNrQ2hhdFNlcnZpY2UudG9nZ2xlKClcblx0XHRcdH0pO1xuXHRcdH1cblxuXHRcdHJldHVybiBwcm92aWRlcnMuc29ydCgoYSwgYikgPT4gYS5jb21tYW5kQ2VudGVyT3JkZXIgLSBiLmNvbW1hbmRDZW50ZXJPcmRlcik7XG5cdH1cblxuXHQvLyNlbmRyZWdpb25cblxuXHQvLyNyZWdpb24gV29ya3NwYWNlIFN5bWJvbHMgKGlmIGVuYWJsZWQpXG5cblx0cHJpdmF0ZSB3b3Jrc3BhY2VTeW1ib2xzUXVpY2tBY2Nlc3M6IFN5bWJvbHNRdWlja0FjY2Vzc1Byb3ZpZGVyO1xuXG5cdHByaXZhdGUgYXN5bmMgZ2V0V29ya3NwYWNlU3ltYm9sUGlja3MocXVlcnk6IElQcmVwYXJlZFF1ZXJ5LCBpbmNsdWRlU3ltYm9sczogYm9vbGVhbiwgdG9rZW46IENhbmNlbGxhdGlvblRva2VuKTogUHJvbWlzZTxBcnJheTxJQW55dGhpbmdRdWlja1BpY2tJdGVtPj4ge1xuXHRcdGlmIChcblx0XHRcdCFxdWVyeS5ub3JtYWxpemVkIHx8XHQvLyB3ZSBuZWVkIGEgdmFsdWUgZm9yIHNlYXJjaCBmb3Jcblx0XHRcdCFpbmNsdWRlU3ltYm9scyB8fFx0XHQvLyB3ZSBuZWVkIHRvIGVuYWJsZSBzeW1ib2xzIGluIHNlYXJjaFxuXHRcdFx0dGhpcy5waWNrU3RhdGUubGFzdFJhbmdlXHRcdFx0XHQvLyBhIHJhbmdlIGlzIGFuIGluZGljYXRvciBmb3IganVzdCBzZWFyY2hpbmcgZm9yIGZpbGVzXG5cdFx0KSB7XG5cdFx0XHRyZXR1cm4gW107XG5cdFx0fVxuXG5cdFx0Ly8gRGVsZWdhdGUgdG8gdGhlIGV4aXN0aW5nIHN5bWJvbHMgcXVpY2sgYWNjZXNzXG5cdFx0Ly8gYnV0IHNraXAgbG9jYWwgcmVzdWx0cyBhbmQgYWxzbyBkbyBub3Qgc2NvcmVcblx0XHRyZXR1cm4gdGhpcy53b3Jrc3BhY2VTeW1ib2xzUXVpY2tBY2Nlc3MuZ2V0U3ltYm9sUGlja3MocXVlcnkub3JpZ2luYWwsIHtcblx0XHRcdHNraXBMb2NhbDogdHJ1ZSxcblx0XHRcdHNraXBTb3J0aW5nOiB0cnVlLFxuXHRcdFx0ZGVsYXk6IEFueXRoaW5nUXVpY2tBY2Nlc3NQcm92aWRlci5UWVBJTkdfU0VBUkNIX0RFTEFZXG5cdFx0fSwgdG9rZW4pO1xuXHR9XG5cblx0Ly8jZW5kcmVnaW9uXG5cblxuXHQvLyNyZWdpb24gRWRpdG9yIFN5bWJvbHMgKGlmIG5hcnJvd2luZyBkb3duIGludG8gYSBnbG9iYWwgcGljayB2aWEgYEBgKVxuXG5cdHByaXZhdGUgcmVhZG9ubHkgZWRpdG9yU3ltYm9sc1F1aWNrQWNjZXNzOiBHb3RvU3ltYm9sUXVpY2tBY2Nlc3NQcm92aWRlcjtcblxuXHRwcml2YXRlIGdldEVkaXRvclN5bWJvbFBpY2tzKHF1ZXJ5OiBJUHJlcGFyZWRRdWVyeSwgZGlzcG9zYWJsZXM6IERpc3Bvc2FibGVTdG9yZSwgdG9rZW46IENhbmNlbGxhdGlvblRva2VuKTogUHJvbWlzZTxQaWNrczxJQW55dGhpbmdRdWlja1BpY2tJdGVtPj4gfCBudWxsIHtcblx0XHRjb25zdCBmaWx0ZXJTZWdtZW50cyA9IHF1ZXJ5Lm9yaWdpbmFsLnNwbGl0KEdvdG9TeW1ib2xRdWlja0FjY2Vzc1Byb3ZpZGVyLlBSRUZJWCk7XG5cdFx0Y29uc3QgZmlsdGVyID0gZmlsdGVyU2VnbWVudHMubGVuZ3RoID4gMSA/IGZpbHRlclNlZ21lbnRzW2ZpbHRlclNlZ21lbnRzLmxlbmd0aCAtIDFdLnRyaW0oKSA6IHVuZGVmaW5lZDtcblx0XHRpZiAodHlwZW9mIGZpbHRlciAhPT0gJ3N0cmluZycpIHtcblx0XHRcdHJldHVybiBudWxsOyAvLyB3ZSBuZWVkIHRvIGJlIHNlYXJjaGVkIGZvciBlZGl0b3Igc3ltYm9scyB2aWEgYEBgXG5cdFx0fVxuXG5cdFx0Y29uc3QgYWN0aXZlR2xvYmFsUGljayA9IHRoaXMucGlja1N0YXRlLmxhc3RHbG9iYWxQaWNrcz8uYWN0aXZlO1xuXHRcdGlmICghYWN0aXZlR2xvYmFsUGljaykge1xuXHRcdFx0cmV0dXJuIG51bGw7IC8vIHdlIG5lZWQgYW4gYWN0aXZlIGdsb2JhbCBwaWNrIHRvIGZpbmQgc3ltYm9scyBmb3Jcblx0XHR9XG5cblx0XHRjb25zdCBhY3RpdmVHbG9iYWxSZXNvdXJjZSA9IGFjdGl2ZUdsb2JhbFBpY2sucmVzb3VyY2U7XG5cdFx0aWYgKCFhY3RpdmVHbG9iYWxSZXNvdXJjZSB8fCAoIXRoaXMuZmlsZVNlcnZpY2UuaGFzUHJvdmlkZXIoYWN0aXZlR2xvYmFsUmVzb3VyY2UpICYmIGFjdGl2ZUdsb2JhbFJlc291cmNlLnNjaGVtZSAhPT0gU2NoZW1hcy51bnRpdGxlZCkpIHtcblx0XHRcdHJldHVybiBudWxsOyAvLyB3ZSBuZWVkIGEgcmVzb3VyY2UgdGhhdCB3ZSBjYW4gcmVzb2x2ZVxuXHRcdH1cblxuXHRcdGlmIChhY3RpdmVHbG9iYWxQaWNrLmxhYmVsLmluY2x1ZGVzKEdvdG9TeW1ib2xRdWlja0FjY2Vzc1Byb3ZpZGVyLlBSRUZJWCkgfHwgYWN0aXZlR2xvYmFsUGljay5kZXNjcmlwdGlvbj8uaW5jbHVkZXMoR290b1N5bWJvbFF1aWNrQWNjZXNzUHJvdmlkZXIuUFJFRklYKSkge1xuXHRcdFx0aWYgKGZpbHRlclNlZ21lbnRzLmxlbmd0aCA8IDMpIHtcblx0XHRcdFx0cmV0dXJuIG51bGw7IC8vIHJlcXVpcmUgYXQgbGVhc3QgMiBgQGAgaWYgb3VyIGFjdGl2ZSBwaWNrIGNvbnRhaW5zIGBAYCBpbiBsYWJlbCBvciBkZXNjcmlwdGlvblxuXHRcdFx0fVxuXHRcdH1cblxuXHRcdHJldHVybiB0aGlzLmRvR2V0RWRpdG9yU3ltYm9sUGlja3MoYWN0aXZlR2xvYmFsUGljaywgYWN0aXZlR2xvYmFsUmVzb3VyY2UsIGZpbHRlciwgZGlzcG9zYWJsZXMsIHRva2VuKTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgZG9HZXRFZGl0b3JTeW1ib2xQaWNrcyhhY3RpdmVHbG9iYWxQaWNrOiBJQW55dGhpbmdRdWlja1BpY2tJdGVtLCBhY3RpdmVHbG9iYWxSZXNvdXJjZTogVVJJLCBmaWx0ZXI6IHN0cmluZywgZGlzcG9zYWJsZXM6IERpc3Bvc2FibGVTdG9yZSwgdG9rZW46IENhbmNlbGxhdGlvblRva2VuKTogUHJvbWlzZTxQaWNrczxJQW55dGhpbmdRdWlja1BpY2tJdGVtPj4ge1xuXG5cdFx0Ly8gQnJpbmcgdGhlIGVkaXRvciB0byBmcm9udCB0byByZXZpZXcgc3ltYm9scyB0byBnbyB0b1xuXHRcdHRyeSB7XG5cblx0XHRcdC8vIHdlIG11c3QgcmVtZW1iZXIgb3VyIGN1cnJlbnQgdmlldyBzdGF0ZSB0byBiZSBhYmxlIHRvIHJlc3RvcmVcblx0XHRcdHRoaXMucGlja1N0YXRlLmVkaXRvclZpZXdTdGF0ZS5zZXQoKTtcblxuXHRcdFx0Ly8gb3BlbiBpdFxuXHRcdFx0YXdhaXQgdGhpcy5waWNrU3RhdGUuZWRpdG9yVmlld1N0YXRlLm9wZW5UcmFuc2llbnRFZGl0b3Ioe1xuXHRcdFx0XHRyZXNvdXJjZTogYWN0aXZlR2xvYmFsUmVzb3VyY2UsXG5cdFx0XHRcdG9wdGlvbnM6IHsgcHJlc2VydmVGb2N1czogdHJ1ZSwgcmV2ZWFsSWZPcGVuZWQ6IHRydWUsIGlnbm9yZUVycm9yOiB0cnVlIH1cblx0XHRcdH0pO1xuXHRcdH0gY2F0Y2ggKGVycm9yKSB7XG5cdFx0XHRyZXR1cm4gW107IC8vIHJldHVybiBpZiByZXNvdXJjZSBjYW5ub3QgYmUgb3BlbmVkXG5cdFx0fVxuXG5cdFx0aWYgKHRva2VuLmlzQ2FuY2VsbGF0aW9uUmVxdWVzdGVkKSB7XG5cdFx0XHRyZXR1cm4gW107XG5cdFx0fVxuXG5cdFx0Ly8gT2J0YWluIG1vZGVsIGZyb20gcmVzb3VyY2Vcblx0XHRsZXQgbW9kZWwgPSB0aGlzLm1vZGVsU2VydmljZS5nZXRNb2RlbChhY3RpdmVHbG9iYWxSZXNvdXJjZSk7XG5cdFx0aWYgKCFtb2RlbCkge1xuXHRcdFx0dHJ5IHtcblx0XHRcdFx0Y29uc3QgbW9kZWxSZWZlcmVuY2UgPSBkaXNwb3NhYmxlcy5hZGQoYXdhaXQgdGhpcy50ZXh0TW9kZWxTZXJ2aWNlLmNyZWF0ZU1vZGVsUmVmZXJlbmNlKGFjdGl2ZUdsb2JhbFJlc291cmNlKSk7XG5cdFx0XHRcdGlmICh0b2tlbi5pc0NhbmNlbGxhdGlvblJlcXVlc3RlZCkge1xuXHRcdFx0XHRcdHJldHVybiBbXTtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdG1vZGVsID0gbW9kZWxSZWZlcmVuY2Uub2JqZWN0LnRleHRFZGl0b3JNb2RlbDtcblx0XHRcdH0gY2F0Y2ggKGVycm9yKSB7XG5cdFx0XHRcdHJldHVybiBbXTsgLy8gcmV0dXJuIGlmIG1vZGVsIGNhbm5vdCBiZSByZXNvbHZlZFxuXHRcdFx0fVxuXHRcdH1cblxuXHRcdC8vIEFzayBwcm92aWRlciBmb3IgZWRpdG9yIHN5bWJvbHNcblx0XHRjb25zdCBlZGl0b3JTeW1ib2xQaWNrcyA9IChhd2FpdCB0aGlzLmVkaXRvclN5bWJvbHNRdWlja0FjY2Vzcy5nZXRTeW1ib2xQaWNrcyhtb2RlbCwgZmlsdGVyLCB7IGV4dHJhQ29udGFpbmVyTGFiZWw6IHN0cmlwSWNvbnMoYWN0aXZlR2xvYmFsUGljay5sYWJlbCkgfSwgZGlzcG9zYWJsZXMsIHRva2VuKSk7XG5cdFx0aWYgKHRva2VuLmlzQ2FuY2VsbGF0aW9uUmVxdWVzdGVkKSB7XG5cdFx0XHRyZXR1cm4gW107XG5cdFx0fVxuXG5cdFx0cmV0dXJuIGVkaXRvclN5bWJvbFBpY2tzLm1hcChlZGl0b3JTeW1ib2xQaWNrID0+IHtcblxuXHRcdFx0Ly8gUHJlc2VydmUgc2VwYXJhdG9yc1xuXHRcdFx0aWYgKGVkaXRvclN5bWJvbFBpY2sudHlwZSA9PT0gJ3NlcGFyYXRvcicpIHtcblx0XHRcdFx0cmV0dXJuIGVkaXRvclN5bWJvbFBpY2s7XG5cdFx0XHR9XG5cblx0XHRcdC8vIENvbnZlcnQgZWRpdG9yIHN5bWJvbHMgdG8gYW55dGhpbmcgcGlja1xuXHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0Li4uZWRpdG9yU3ltYm9sUGljayxcblx0XHRcdFx0cmVzb3VyY2U6IGFjdGl2ZUdsb2JhbFJlc291cmNlLFxuXHRcdFx0XHRkZXNjcmlwdGlvbjogZWRpdG9yU3ltYm9sUGljay5kZXNjcmlwdGlvbixcblx0XHRcdFx0dHJpZ2dlcjogKGJ1dHRvbkluZGV4LCBrZXlNb2RzKSA9PiB7XG5cdFx0XHRcdFx0dGhpcy5vcGVuQW55dGhpbmcoYWN0aXZlR2xvYmFsUmVzb3VyY2UsIHsga2V5TW9kcywgcmFuZ2U6IGVkaXRvclN5bWJvbFBpY2sucmFuZ2U/LnNlbGVjdGlvbiwgZm9yY2VPcGVuU2lkZUJ5U2lkZTogdHJ1ZSB9KTtcblxuXHRcdFx0XHRcdHJldHVybiBUcmlnZ2VyQWN0aW9uLkNMT1NFX1BJQ0tFUjtcblx0XHRcdFx0fSxcblx0XHRcdFx0YWNjZXB0OiAoa2V5TW9kcywgZXZlbnQpID0+IHRoaXMub3BlbkFueXRoaW5nKGFjdGl2ZUdsb2JhbFJlc291cmNlLCB7IGtleU1vZHMsIHJhbmdlOiBlZGl0b3JTeW1ib2xQaWNrLnJhbmdlPy5zZWxlY3Rpb24sIHByZXNlcnZlRm9jdXM6IGV2ZW50LmluQmFja2dyb3VuZCwgZm9yY2VQaW5uZWQ6IGV2ZW50LmluQmFja2dyb3VuZCB9KVxuXHRcdFx0fTtcblx0XHR9KTtcblx0fVxuXG5cdGFkZERlY29yYXRpb25zKGVkaXRvcjogSUVkaXRvciwgcmFuZ2U6IElSYW5nZSk6IHZvaWQge1xuXHRcdHRoaXMuZWRpdG9yU3ltYm9sc1F1aWNrQWNjZXNzLmFkZERlY29yYXRpb25zKGVkaXRvciwgcmFuZ2UpO1xuXHR9XG5cblx0Y2xlYXJEZWNvcmF0aW9ucyhlZGl0b3I6IElFZGl0b3IpOiB2b2lkIHtcblx0XHR0aGlzLmVkaXRvclN5bWJvbHNRdWlja0FjY2Vzcy5jbGVhckRlY29yYXRpb25zKGVkaXRvcik7XG5cdH1cblxuXHQvLyNlbmRyZWdpb25cblxuXG5cdC8vI3JlZ2lvbiBIZWxwZXJzXG5cblx0cHJpdmF0ZSBjcmVhdGVBbnl0aGluZ1BpY2socmVzb3VyY2VPckVkaXRvcjogVVJJIHwgRWRpdG9ySW5wdXQgfCBJUmVzb3VyY2VFZGl0b3JJbnB1dCwgY29uZmlndXJhdGlvbjogeyBvcGVuU2lkZUJ5U2lkZURpcmVjdGlvbjogJ3JpZ2h0JyB8ICdkb3duJyB8IHVuZGVmaW5lZCB9KTogSUFueXRoaW5nUXVpY2tQaWNrSXRlbSB7XG5cdFx0Y29uc3QgaXNFZGl0b3JIaXN0b3J5RW50cnkgPSAhVVJJLmlzVXJpKHJlc291cmNlT3JFZGl0b3IpO1xuXG5cdFx0bGV0IHJlc291cmNlOiBVUkkgfCB1bmRlZmluZWQ7XG5cdFx0bGV0IGxhYmVsOiBzdHJpbmc7XG5cdFx0bGV0IGRlc2NyaXB0aW9uOiBzdHJpbmcgfCB1bmRlZmluZWQgPSB1bmRlZmluZWQ7XG5cdFx0bGV0IGlzRGlydHk6IGJvb2xlYW4gfCB1bmRlZmluZWQgPSB1bmRlZmluZWQ7XG5cdFx0bGV0IGV4dHJhQ2xhc3Nlczogc3RyaW5nW107XG5cdFx0bGV0IGljb246IFRoZW1lSWNvbiB8IFVSSSB8IHVuZGVmaW5lZCA9IHVuZGVmaW5lZDtcblxuXHRcdGlmIChpc0VkaXRvcklucHV0KHJlc291cmNlT3JFZGl0b3IpKSB7XG5cdFx0XHRyZXNvdXJjZSA9IEVkaXRvclJlc291cmNlQWNjZXNzb3IuZ2V0T3JpZ2luYWxVcmkocmVzb3VyY2VPckVkaXRvcik7XG5cdFx0XHRsYWJlbCA9IHJlc291cmNlT3JFZGl0b3IuZ2V0TmFtZSgpO1xuXHRcdFx0ZGVzY3JpcHRpb24gPSByZXNvdXJjZU9yRWRpdG9yLmdldERlc2NyaXB0aW9uKCk7XG5cdFx0XHRpc0RpcnR5ID0gcmVzb3VyY2VPckVkaXRvci5pc0RpcnR5KCkgJiYgIXJlc291cmNlT3JFZGl0b3IuaXNTYXZpbmcoKTtcblx0XHRcdGV4dHJhQ2xhc3NlcyA9IHJlc291cmNlT3JFZGl0b3IuZ2V0TGFiZWxFeHRyYUNsYXNzZXMoKTtcblx0XHRcdGljb24gPSByZXNvdXJjZU9yRWRpdG9yLmdldEljb24oKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0cmVzb3VyY2UgPSBVUkkuaXNVcmkocmVzb3VyY2VPckVkaXRvcikgPyByZXNvdXJjZU9yRWRpdG9yIDogcmVzb3VyY2VPckVkaXRvci5yZXNvdXJjZTtcblx0XHRcdGNvbnN0IGN1c3RvbUxhYmVsID0gdGhpcy5jdXN0b21FZGl0b3JMYWJlbFNlcnZpY2UuZ2V0TmFtZShyZXNvdXJjZSk7XG5cdFx0XHRsYWJlbCA9IGN1c3RvbUxhYmVsIHx8IGJhc2VuYW1lT3JBdXRob3JpdHkocmVzb3VyY2UpO1xuXHRcdFx0ZGVzY3JpcHRpb24gPSB0aGlzLmxhYmVsU2VydmljZS5nZXRVcmlMYWJlbCghIWN1c3RvbUxhYmVsID8gcmVzb3VyY2UgOiBkaXJuYW1lKHJlc291cmNlKSwgeyByZWxhdGl2ZTogdHJ1ZSB9KTtcblx0XHRcdGlzRGlydHkgPSB0aGlzLndvcmtpbmdDb3B5U2VydmljZS5pc0RpcnR5KHJlc291cmNlKSAmJiAhdGhpcy5maWxlc0NvbmZpZ3VyYXRpb25TZXJ2aWNlLmhhc1Nob3J0QXV0b1NhdmVEZWxheShyZXNvdXJjZSk7XG5cdFx0XHRleHRyYUNsYXNzZXMgPSBbXTtcblx0XHR9XG5cblx0XHRjb25zdCBsYWJlbEFuZERlc2NyaXB0aW9uID0gZGVzY3JpcHRpb24gPyBgJHtsYWJlbH0gJHtkZXNjcmlwdGlvbn1gIDogbGFiZWw7XG5cblx0XHRjb25zdCBpY29uQ2xhc3Nlc1ZhbHVlID0gbmV3IExhenkoKCkgPT4gZ2V0SWNvbkNsYXNzZXModGhpcy5tb2RlbFNlcnZpY2UsIHRoaXMubGFuZ3VhZ2VTZXJ2aWNlLCByZXNvdXJjZSwgdW5kZWZpbmVkLCBpY29uKS5jb25jYXQoZXh0cmFDbGFzc2VzKSk7XG5cblx0XHRjb25zdCBidXR0b25zVmFsdWUgPSBuZXcgTGF6eSgoKSA9PiB7XG5cdFx0XHRjb25zdCBvcGVuU2lkZUJ5U2lkZURpcmVjdGlvbiA9IGNvbmZpZ3VyYXRpb24ub3BlblNpZGVCeVNpZGVEaXJlY3Rpb247XG5cdFx0XHRjb25zdCBidXR0b25zOiBJUXVpY2tJbnB1dEJ1dHRvbltdID0gW107XG5cblx0XHRcdC8vIE9wZW4gdG8gc2lkZSAvIGJlbG93XG5cdFx0XHRidXR0b25zLnB1c2goe1xuXHRcdFx0XHRpY29uQ2xhc3M6IG9wZW5TaWRlQnlTaWRlRGlyZWN0aW9uID09PSAncmlnaHQnID8gVGhlbWVJY29uLmFzQ2xhc3NOYW1lKENvZGljb24uc3BsaXRIb3Jpem9udGFsKSA6IFRoZW1lSWNvbi5hc0NsYXNzTmFtZShDb2RpY29uLnNwbGl0VmVydGljYWwpLFxuXHRcdFx0XHR0b29sdGlwOiBvcGVuU2lkZUJ5U2lkZURpcmVjdGlvbiA9PT0gJ3JpZ2h0JyA/XG5cdFx0XHRcdFx0bG9jYWxpemUoeyBrZXk6ICdvcGVuVG9TaWRlJywgY29tbWVudDogWydPcGVuIHRoaXMgZmlsZSBpbiBhIHNwbGl0IGVkaXRvciBvbiB0aGUgbGVmdC9yaWdodCBzaWRlJ10gfSwgXCJPcGVuIHRvIHRoZSBTaWRlXCIpIDpcblx0XHRcdFx0XHRsb2NhbGl6ZSh7IGtleTogJ29wZW5Ub0JvdHRvbScsIGNvbW1lbnQ6IFsnT3BlbiB0aGlzIGZpbGUgaW4gYSBzcGxpdCBlZGl0b3Igb24gdGhlIGJvdHRvbSddIH0sIFwiT3BlbiB0byB0aGUgQm90dG9tXCIpXG5cdFx0XHR9KTtcblxuXHRcdFx0Ly8gUmVtb3ZlIGZyb20gSGlzdG9yeVxuXHRcdFx0aWYgKGlzRWRpdG9ySGlzdG9yeUVudHJ5KSB7XG5cdFx0XHRcdGJ1dHRvbnMucHVzaCh7XG5cdFx0XHRcdFx0aWNvbkNsYXNzOiBpc0RpcnR5ID8gKCdkaXJ0eS1hbnl0aGluZyAnICsgVGhlbWVJY29uLmFzQ2xhc3NOYW1lKENvZGljb24uY2lyY2xlRmlsbGVkKSkgOiBUaGVtZUljb24uYXNDbGFzc05hbWUoQ29kaWNvbi5jbG9zZSksXG5cdFx0XHRcdFx0dG9vbHRpcDogbG9jYWxpemUoJ2Nsb3NlRWRpdG9yJywgXCJSZW1vdmUgZnJvbSBSZWNlbnRseSBPcGVuZWRcIiksXG5cdFx0XHRcdFx0YWx3YXlzVmlzaWJsZTogaXNEaXJ0eVxuXHRcdFx0XHR9KTtcblx0XHRcdH1cblxuXHRcdFx0cmV0dXJuIGJ1dHRvbnM7XG5cdFx0fSk7XG5cblx0XHRyZXR1cm4ge1xuXHRcdFx0cmVzb3VyY2UsXG5cdFx0XHRlZGl0b3I6ICFVUkkuaXNVcmkocmVzb3VyY2VPckVkaXRvcikgPyByZXNvdXJjZU9yRWRpdG9yIDogdW5kZWZpbmVkLFxuXHRcdFx0bGFiZWwsXG5cdFx0XHRhcmlhTGFiZWw6IGlzRGlydHkgPyBsb2NhbGl6ZSgnZmlsZVBpY2tBcmlhTGFiZWxEaXJ0eScsIFwiezB9IHVuc2F2ZWQgY2hhbmdlc1wiLCBsYWJlbEFuZERlc2NyaXB0aW9uKSA6IGxhYmVsQW5kRGVzY3JpcHRpb24sXG5cdFx0XHRkZXNjcmlwdGlvbixcblx0XHRcdGljb25QYXRoOiBVUkkuaXNVcmkoaWNvbikgPyB7IGRhcms6IGljb24gfSA6IHVuZGVmaW5lZCxcblx0XHRcdGdldCBpY29uQ2xhc3NlcygpIHsgcmV0dXJuIGljb25DbGFzc2VzVmFsdWUudmFsdWU7IH0sXG5cdFx0XHRnZXQgYnV0dG9ucygpIHsgcmV0dXJuIGJ1dHRvbnNWYWx1ZS52YWx1ZTsgfSxcblx0XHRcdHRyaWdnZXI6IChidXR0b25JbmRleCwga2V5TW9kcykgPT4ge1xuXHRcdFx0XHRzd2l0Y2ggKGJ1dHRvbkluZGV4KSB7XG5cblx0XHRcdFx0XHQvLyBPcGVuIHRvIHNpZGUgLyBiZWxvd1xuXHRcdFx0XHRcdGNhc2UgMDpcblx0XHRcdFx0XHRcdHRoaXMub3BlbkFueXRoaW5nKHJlc291cmNlT3JFZGl0b3IsIHsga2V5TW9kcywgcmFuZ2U6IHRoaXMucGlja1N0YXRlLmxhc3RSYW5nZSwgZm9yY2VPcGVuU2lkZUJ5U2lkZTogdHJ1ZSB9KTtcblxuXHRcdFx0XHRcdFx0cmV0dXJuIFRyaWdnZXJBY3Rpb24uQ0xPU0VfUElDS0VSO1xuXG5cdFx0XHRcdFx0Ly8gUmVtb3ZlIGZyb20gSGlzdG9yeVxuXHRcdFx0XHRcdGNhc2UgMTpcblx0XHRcdFx0XHRcdGlmICghVVJJLmlzVXJpKHJlc291cmNlT3JFZGl0b3IpKSB7XG5cdFx0XHRcdFx0XHRcdHRoaXMuaGlzdG9yeVNlcnZpY2UucmVtb3ZlRnJvbUhpc3RvcnkocmVzb3VyY2VPckVkaXRvcik7XG5cblx0XHRcdFx0XHRcdFx0cmV0dXJuIFRyaWdnZXJBY3Rpb24uUkVNT1ZFX0lURU07XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRyZXR1cm4gVHJpZ2dlckFjdGlvbi5OT19BQ1RJT047XG5cdFx0XHR9LFxuXHRcdFx0YWNjZXB0OiAoa2V5TW9kcywgZXZlbnQpID0+IHRoaXMub3BlbkFueXRoaW5nKHJlc291cmNlT3JFZGl0b3IsIHsga2V5TW9kcywgcmFuZ2U6IHRoaXMucGlja1N0YXRlLmxhc3RSYW5nZSwgcHJlc2VydmVGb2N1czogZXZlbnQuaW5CYWNrZ3JvdW5kLCBmb3JjZVBpbm5lZDogZXZlbnQuaW5CYWNrZ3JvdW5kIH0pLFxuXHRcdFx0YXR0YWNoOiAoa2V5TW9kcywgZXZlbnQpID0+IHtcblx0XHRcdFx0Ly8gT25seSBzdXBwb3J0IGFkZGluZyBjb250ZXh0IHRvIGNoYXQgd2hlbiBzaGlmdCBpcyBwcmVzc2VkXG5cdFx0XHRcdGlmIChrZXlNb2RzLnNoaWZ0KSB7XG5cdFx0XHRcdFx0Y29uc3Qgd2lkZ2V0ID0gdGhpcy5jaGF0V2lkZ2V0U2VydmljZS5sYXN0Rm9jdXNlZFdpZGdldDtcblx0XHRcdFx0XHRpZiAod2lkZ2V0ICYmIHJlc291cmNlKSB7XG5cdFx0XHRcdFx0XHR3aWRnZXQuYXR0YWNobWVudE1vZGVsLmFkZENvbnRleHQod2lkZ2V0LmF0dGFjaG1lbnRNb2RlbC5hc0ZpbGVWYXJpYWJsZUVudHJ5KHJlc291cmNlKSk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdHJldHVybjtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdC8vIEZhbGxiYWNrIHRvIGFjY2VwdCBiZWhhdmlvci5cblx0XHRcdFx0dGhpcy5vcGVuQW55dGhpbmcocmVzb3VyY2VPckVkaXRvciwgeyBrZXlNb2RzLCByYW5nZTogdGhpcy5waWNrU3RhdGUubGFzdFJhbmdlLCBwcmVzZXJ2ZUZvY3VzOiBldmVudC5pbkJhY2tncm91bmQsIGZvcmNlUGlubmVkOiBldmVudC5pbkJhY2tncm91bmQgfSk7XG5cdFx0XHR9XG5cdFx0fTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgb3BlbkFueXRoaW5nKHJlc291cmNlT3JFZGl0b3I6IFVSSSB8IEVkaXRvcklucHV0IHwgSVJlc291cmNlRWRpdG9ySW5wdXQsIG9wdGlvbnM6IHsga2V5TW9kcz86IElLZXlNb2RzOyBwcmVzZXJ2ZUZvY3VzPzogYm9vbGVhbjsgcmFuZ2U/OiBJUmFuZ2U7IGZvcmNlT3BlblNpZGVCeVNpZGU/OiBib29sZWFuOyBmb3JjZVBpbm5lZD86IGJvb2xlYW4gfSk6IFByb21pc2U8dm9pZD4ge1xuXG5cdFx0Ly8gQ3JhZnQgc29tZSBlZGl0b3Igb3B0aW9ucyBiYXNlZCBvbiBxdWljayBhY2Nlc3MgdXNhZ2Vcblx0XHRjb25zdCBlZGl0b3JPcHRpb25zOiBJVGV4dEVkaXRvck9wdGlvbnMgPSB7XG5cdFx0XHRwcmVzZXJ2ZUZvY3VzOiBvcHRpb25zLnByZXNlcnZlRm9jdXMsXG5cdFx0XHRwaW5uZWQ6IG9wdGlvbnMua2V5TW9kcz8uY3RybENtZCB8fCBvcHRpb25zLmZvcmNlUGlubmVkIHx8IHRoaXMuY29uZmlndXJhdGlvbi5vcGVuRWRpdG9yUGlubmVkLFxuXHRcdFx0c2VsZWN0aW9uOiBvcHRpb25zLnJhbmdlXG5cdFx0fTtcblxuXHRcdGNvbnN0IHRhcmdldEdyb3VwID0gb3B0aW9ucy5rZXlNb2RzPy5hbHQgfHwgKHRoaXMuY29uZmlndXJhdGlvbi5vcGVuRWRpdG9yUGlubmVkICYmIG9wdGlvbnMua2V5TW9kcz8uY3RybENtZCkgfHwgb3B0aW9ucy5mb3JjZU9wZW5TaWRlQnlTaWRlID8gU0lERV9HUk9VUCA6IEFDVElWRV9HUk9VUDtcblxuXHRcdC8vIFJlc3RvcmUgYW55IHZpZXcgc3RhdGUgaWYgdGhlIHRhcmdldCBpcyB0aGUgc2lkZSBncm91cFxuXHRcdGlmICh0YXJnZXRHcm91cCA9PT0gU0lERV9HUk9VUCkge1xuXHRcdFx0YXdhaXQgdGhpcy5waWNrU3RhdGUuZWRpdG9yVmlld1N0YXRlLnJlc3RvcmUoKTtcblx0XHR9XG5cblx0XHQvLyBPcGVuIGVkaXRvciAodHlwZWQpXG5cdFx0aWYgKGlzRWRpdG9ySW5wdXQocmVzb3VyY2VPckVkaXRvcikpIHtcblx0XHRcdGF3YWl0IHRoaXMuZWRpdG9yU2VydmljZS5vcGVuRWRpdG9yKHJlc291cmNlT3JFZGl0b3IsIGVkaXRvck9wdGlvbnMsIHRhcmdldEdyb3VwKTtcblx0XHR9XG5cblx0XHQvLyBPcGVuIGVkaXRvciAodW50eXBlZClcblx0XHRlbHNlIHtcblx0XHRcdGxldCByZXNvdXJjZUVkaXRvcklucHV0OiBJUmVzb3VyY2VFZGl0b3JJbnB1dDtcblx0XHRcdGlmIChVUkkuaXNVcmkocmVzb3VyY2VPckVkaXRvcikpIHtcblx0XHRcdFx0cmVzb3VyY2VFZGl0b3JJbnB1dCA9IHtcblx0XHRcdFx0XHRyZXNvdXJjZTogcmVzb3VyY2VPckVkaXRvcixcblx0XHRcdFx0XHRvcHRpb25zOiBlZGl0b3JPcHRpb25zXG5cdFx0XHRcdH07XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRyZXNvdXJjZUVkaXRvcklucHV0ID0ge1xuXHRcdFx0XHRcdC4uLnJlc291cmNlT3JFZGl0b3IsXG5cdFx0XHRcdFx0b3B0aW9uczoge1xuXHRcdFx0XHRcdFx0Li4ucmVzb3VyY2VPckVkaXRvci5vcHRpb25zLFxuXHRcdFx0XHRcdFx0Li4uZWRpdG9yT3B0aW9uc1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fTtcblx0XHRcdH1cblxuXHRcdFx0YXdhaXQgdGhpcy5lZGl0b3JTZXJ2aWNlLm9wZW5FZGl0b3IocmVzb3VyY2VFZGl0b3JJbnB1dCwgdGFyZ2V0R3JvdXApO1xuXHRcdH1cblx0fVxuXG5cdC8vI2VuZHJlZ2lvblxufVxuIl0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7Ozs7QUFLQSxPQUFPO0FBQ1AsU0FBc0MsNkJBQTZCLDZCQUFxRSxzQkFBc0IsMEJBQStDO0FBQzdNLFNBQWlDLDJCQUEyQixxQkFBK0Q7QUFDM0gsU0FBUyxjQUE4QiwwQkFBMEIsc0JBQXdDO0FBQ3pHLFNBQW1DLG9CQUFvQjtBQUN2RCxTQUFTLDZCQUE2QjtBQUN0QyxTQUFTLGtDQUFrQyw4QkFBNkQ7QUFDeEcsU0FBUyxzQkFBdUM7QUFDaEQsU0FBUyxnQ0FBZ0M7QUFDekMsU0FB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
