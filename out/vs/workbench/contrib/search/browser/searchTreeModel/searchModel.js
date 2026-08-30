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
import { CancellationTokenSource } from "../../../../../base/common/cancellation.js";
import * as errors from "../../../../../base/common/errors.js";
import { Emitter, Event, PauseableEmitter } from "../../../../../base/common/event.js";
import { Lazy } from "../../../../../base/common/lazy.js";
import { Disposable } from "../../../../../base/common/lifecycle.js";
import { Schemas } from "../../../../../base/common/network.js";
import { IConfigurationService } from "../../../../../platform/configuration/common/configuration.js";
import { IInstantiationService } from "../../../../../platform/instantiation/common/instantiation.js";
import { ILogService } from "../../../../../platform/log/common/log.js";
import { ITelemetryService } from "../../../../../platform/telemetry/common/telemetry.js";
import { INotebookSearchService } from "../../common/notebookSearch.js";
import { ReplacePattern } from "../../../../services/search/common/replace.js";
import { ISearchService, QueryType, SearchCompletionExitCode } from "../../../../services/search/common/search.js";
import { mergeSearchResultEvents, SearchModelLocation, SEARCH_MODEL_PREFIX } from "./searchTreeCommon.js";
import { SearchResultImpl } from "./searchResult.js";
let SearchModelImpl = class extends Disposable {
  constructor(searchService, telemetryService, configurationService, instantiationService, logService, notebookSearchService) {
    super();
    this.searchService = searchService;
    this.telemetryService = telemetryService;
    this.configurationService = configurationService;
    this.instantiationService = instantiationService;
    this.logService = logService;
    this.notebookSearchService = notebookSearchService;
    this._searchQuery = null;
    this._replaceActive = false;
    this._replaceString = null;
    this._replacePattern = null;
    this._preserveCase = false;
    this._startStreamDelay = Promise.resolve();
    this._resultQueue = [];
    this._aiResultQueue = [];
    this._onReplaceTermChanged = this._register(new Emitter());
    this.onReplaceTermChanged = this._onReplaceTermChanged.event;
    this._onSearchResultChanged = this._register(new PauseableEmitter({
      merge: mergeSearchResultEvents
    }));
    this.onSearchResultChanged = this._onSearchResultChanged.event;
    this.currentCancelTokenSource = null;
    this.currentAICancelTokenSource = null;
    this.searchCancelledForNewSearch = false;
    this.aiSearchCancelledForNewSearch = false;
    this.location = SearchModelLocation.PANEL;
    this._searchResult = this.instantiationService.createInstance(SearchResultImpl, this);
    this._register(this._searchResult.onChange((e) => this._onSearchResultChanged.fire(e)));
    this._aiTextResultProviderName = new Lazy(async () => this.searchService.getAIName());
    this._id = SEARCH_MODEL_PREFIX + Date.now().toString();
  }
  id() {
    return this._id;
  }
  async getAITextResultProviderName() {
    const result = await this._aiTextResultProviderName.value;
    if (!result) {
      throw Error("Fetching AI name when no provider present.");
    }
    return result;
  }
  isReplaceActive() {
    return this._replaceActive;
  }
  set replaceActive(replaceActive) {
    this._replaceActive = replaceActive;
  }
  get replacePattern() {
    return this._replacePattern;
  }
  get replaceString() {
    return this._replaceString || "";
  }
  set preserveCase(value) {
    this._preserveCase = value;
  }
  get preserveCase() {
    return this._preserveCase;
  }
  set replaceString(replaceString) {
    this._replaceString = replaceString;
    if (this._searchQuery) {
      this._replacePattern = new ReplacePattern(replaceString, this._searchQuery.contentPattern);
    }
    this._onReplaceTermChanged.fire();
  }
  get searchResult() {
    return this._searchResult;
  }
  aiSearch(onResult) {
    if (this.hasAIResults) {
      throw Error("AI results already exist");
    }
    if (!this._searchQuery) {
      throw Error("No search query");
    }
    const searchInstanceID = Date.now().toString();
    const tokenSource = new CancellationTokenSource();
    this.currentAICancelTokenSource = tokenSource;
    const start = Date.now();
    const asyncAIResults = this.searchService.aiTextSearch(
      { ...this._searchQuery, contentPattern: this._searchQuery.contentPattern.pattern, type: QueryType.aiText },
      tokenSource.token,
      async (p) => {
        onResult(p);
        this.onSearchProgress(p, searchInstanceID, false, true);
      }
    ).finally(() => {
      tokenSource.dispose(true);
    }).then(
      (value) => {
        if (value.results.length === 0) {
          onResult(void 0);
        }
        this.onSearchCompleted(value, Date.now() - start, searchInstanceID, true);
        return value;
      },
      (e) => {
        this.onSearchError(e, Date.now() - start, true);
        throw e;
      }
    );
    return asyncAIResults;
  }
  doSearch(query, progressEmitter, searchQuery, searchInstanceID, onProgress, callerToken) {
    const asyncGenerateOnProgress = async (p) => {
      progressEmitter.fire();
      this.onSearchProgress(p, searchInstanceID, false, false);
      onProgress?.(p);
    };
    const syncGenerateOnProgress = (p) => {
      progressEmitter.fire();
      this.onSearchProgress(p, searchInstanceID, true);
      onProgress?.(p);
    };
    const tokenSource = this.currentCancelTokenSource = new CancellationTokenSource(callerToken);
    const notebookResult = this.notebookSearchService.notebookSearch(query, tokenSource.token, searchInstanceID, asyncGenerateOnProgress);
    const textResult = this.searchService.textSearchSplitSyncAsync(
      searchQuery,
      tokenSource.token,
      asyncGenerateOnProgress,
      notebookResult.openFilesToScan,
      notebookResult.allScannedFiles
    );
    const syncResults = textResult.syncResults.results;
    syncResults.forEach((p) => {
      if (p) {
        syncGenerateOnProgress(p);
      }
    });
    const getAsyncResults = async () => {
      const searchStart = Date.now();
      const allClosedEditorResults = await textResult.asyncResults;
      const resolvedNotebookResults = await notebookResult.completeData;
      const searchLength = Date.now() - searchStart;
      const resolvedResult = {
        results: [...allClosedEditorResults.results, ...resolvedNotebookResults.results],
        messages: [...allClosedEditorResults.messages, ...resolvedNotebookResults.messages],
        limitHit: allClosedEditorResults.limitHit || resolvedNotebookResults.limitHit,
        exit: allClosedEditorResults.exit,
        stats: allClosedEditorResults.stats
      };
      this.logService.trace(`whole search time | ${searchLength}ms`);
      return resolvedResult;
    };
    return {
      asyncResults: getAsyncResults().finally(() => tokenSource.dispose(true)),
      syncResults
    };
  }
  get hasAIResults() {
    return !!this.searchResult.getCachedSearchComplete(true) || !!this.currentAICancelTokenSource && !this.currentAICancelTokenSource.token.isCancellationRequested;
  }
  get hasPlainResults() {
    return !!this.searchResult.getCachedSearchComplete(false) || !!this.currentCancelTokenSource && !this.currentCancelTokenSource.token.isCancellationRequested;
  }
  search(query, onProgress, callerToken) {
    this.cancelSearch(true);
    this._searchQuery = query;
    if (!this.searchConfig.searchOnType) {
      this.searchResult.clear();
    }
    const searchInstanceID = Date.now().toString();
    this._searchResult.query = this._searchQuery;
    const progressEmitter = this._register(new Emitter());
    this._replacePattern = new ReplacePattern(this.replaceString, this._searchQuery.contentPattern);
    this._startStreamDelay = new Promise((resolve) => setTimeout(resolve, this.searchConfig.searchOnType ? 150 : 0));
    const req = this.doSearch(query, progressEmitter, this._searchQuery, searchInstanceID, onProgress, callerToken);
    const asyncResults = req.asyncResults;
    const syncResults = req.syncResults;
    if (onProgress) {
      syncResults.forEach((p) => {
        if (p) {
          onProgress(p);
        }
      });
    }
    const start = Date.now();
    let event;
    const progressEmitterPromise = new Promise((resolve) => {
      event = Event.once(progressEmitter.event)(resolve);
      return event;
    });
    Promise.race([asyncResults, progressEmitterPromise]).finally(() => {
      event?.dispose();
      this.telemetryService.publicLog("searchResultsFirstRender", { duration: Date.now() - start });
    });
    try {
      return {
        asyncResults: asyncResults.then(
          (value) => {
            this.onSearchCompleted(value, Date.now() - start, searchInstanceID, false);
            return value;
          },
          (e) => {
            this.onSearchError(e, Date.now() - start, false);
            throw e;
          }
        ),
        syncResults
      };
    } finally {
      this.telemetryService.publicLog("searchResultsFinished", { duration: Date.now() - start });
    }
  }
  onSearchCompleted(completed, duration, searchInstanceID, ai) {
    if (!this._searchQuery) {
      throw new Error("onSearchCompleted must be called after a search is started");
    }
    if (ai) {
      this._searchResult.add(this._aiResultQueue, searchInstanceID, true);
      this._aiResultQueue.length = 0;
    } else {
      this._searchResult.add(this._resultQueue, searchInstanceID, false);
      this._resultQueue.length = 0;
    }
    this.searchResult.setCachedSearchComplete(completed, ai);
    const options = Object.assign({}, this._searchQuery.contentPattern);
    delete options.pattern;
    const stats = completed && completed.stats;
    const fileSchemeOnly = this._searchQuery.folderQueries.every((fq) => fq.folder.scheme === Schemas.file);
    const otherSchemeOnly = this._searchQuery.folderQueries.every((fq) => fq.folder.scheme !== Schemas.file);
    const scheme = fileSchemeOnly ? Schemas.file : otherSchemeOnly ? "other" : "mixed";
    this.telemetryService.publicLog("searchResultsShown", {
      count: this._searchResult.count(),
      fileCount: this._searchResult.fileCount(),
      options,
      duration,
      type: stats && stats.type,
      scheme,
      searchOnTypeEnabled: this.searchConfig.searchOnType
    });
    return completed;
  }
  onSearchError(e, duration, ai) {
    if (errors.isCancellationError(e)) {
      this.onSearchCompleted(
        (ai ? this.aiSearchCancelledForNewSearch : this.searchCancelledForNewSearch) ? { exit: SearchCompletionExitCode.NewSearchStarted, results: [], messages: [] } : void 0,
        duration,
        "",
        ai
      );
      if (ai) {
        this.aiSearchCancelledForNewSearch = false;
      } else {
        this.searchCancelledForNewSearch = false;
      }
    }
  }
  onSearchProgress(p, searchInstanceID, sync = true, ai = false) {
    const targetQueue = ai ? this._aiResultQueue : this._resultQueue;
    if (p.resource) {
      targetQueue.push(p);
      if (sync) {
        if (targetQueue.length) {
          this._searchResult.add(targetQueue, searchInstanceID, false, true);
          targetQueue.length = 0;
        }
      } else {
        this._startStreamDelay.then(() => {
          if (targetQueue.length) {
            this._searchResult.add(targetQueue, searchInstanceID, ai, !ai);
            targetQueue.length = 0;
          }
        });
      }
    }
  }
  get searchConfig() {
    return this.configurationService.getValue("search");
  }
  cancelSearch(cancelledForNewSearch = false) {
    if (this.currentCancelTokenSource) {
      this.searchCancelledForNewSearch = cancelledForNewSearch;
      this.currentCancelTokenSource.cancel();
      return true;
    }
    return false;
  }
  cancelAISearch(cancelledForNewSearch = false) {
    if (this.currentAICancelTokenSource) {
      this.aiSearchCancelledForNewSearch = cancelledForNewSearch;
      this.currentAICancelTokenSource.cancel();
      return true;
    }
    return false;
  }
  clearAiSearchResults() {
    this._aiResultQueue.length = 0;
    this._searchResult.aiTextSearchResult.clear(false);
  }
  dispose() {
    this.cancelSearch();
    this.cancelAISearch();
    this.searchResult.dispose();
    super.dispose();
  }
};
SearchModelImpl = __decorateClass([
  __decorateParam(0, ISearchService),
  __decorateParam(1, ITelemetryService),
  __decorateParam(2, IConfigurationService),
  __decorateParam(3, IInstantiationService),
  __decorateParam(4, ILogService),
  __decorateParam(5, INotebookSearchService)
], SearchModelImpl);
let SearchViewModelWorkbenchService = class {
  constructor(instantiationService) {
    this.instantiationService = instantiationService;
    this._searchModel = null;
  }
  get searchModel() {
    if (!this._searchModel) {
      this._searchModel = this.instantiationService.createInstance(SearchModelImpl);
    }
    return this._searchModel;
  }
  set searchModel(searchModel) {
    this._searchModel?.dispose();
    this._searchModel = searchModel;
  }
};
SearchViewModelWorkbenchService = __decorateClass([
  __decorateParam(0, IInstantiationService)
], SearchViewModelWorkbenchService);
export {
  SearchModelImpl,
  SearchViewModelWorkbenchService
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXHNlYXJjaFxcYnJvd3Nlclxcc2VhcmNoVHJlZU1vZGVsXFxzZWFyY2hNb2RlbC50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cblxuaW1wb3J0IHsgQ2FuY2VsbGF0aW9uVG9rZW4sIENhbmNlbGxhdGlvblRva2VuU291cmNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vY2FuY2VsbGF0aW9uLmpzJztcbmltcG9ydCAqIGFzIGVycm9ycyBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9lcnJvcnMuanMnO1xuaW1wb3J0IHsgRW1pdHRlciwgRXZlbnQsIFBhdXNlYWJsZUVtaXR0ZXIgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9ldmVudC5qcyc7XG5pbXBvcnQgeyBMYXp5IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbGF6eS5qcyc7XG5pbXBvcnQgeyBEaXNwb3NhYmxlLCBJRGlzcG9zYWJsZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBTY2hlbWFzIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbmV0d29yay5qcyc7XG5pbXBvcnQgeyBVUkkgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi91cmkuanMnO1xuaW1wb3J0IHsgSUNvbmZpZ3VyYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29uZmlndXJhdGlvbi9jb21tb24vY29uZmlndXJhdGlvbi5qcyc7XG5pbXBvcnQgeyBJSW5zdGFudGlhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9pbnN0YW50aWF0aW9uL2NvbW1vbi9pbnN0YW50aWF0aW9uLmpzJztcbmltcG9ydCB7IElMb2dTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vbG9nL2NvbW1vbi9sb2cuanMnO1xuaW1wb3J0IHsgSVRlbGVtZXRyeVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS90ZWxlbWV0cnkvY29tbW9uL3RlbGVtZXRyeS5qcyc7XG5pbXBvcnQgeyBJTm90ZWJvb2tTZWFyY2hTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vY29tbW9uL25vdGVib29rU2VhcmNoLmpzJztcbmltcG9ydCB7IFJlcGxhY2VQYXR0ZXJuIH0gZnJvbSAnLi4vLi4vLi4vLi4vc2VydmljZXMvc2VhcmNoL2NvbW1vbi9yZXBsYWNlLmpzJztcbmltcG9ydCB7IElGaWxlTWF0Y2gsIElQYXR0ZXJuSW5mbywgSVNlYXJjaENvbXBsZXRlLCBJU2VhcmNoQ29uZmlndXJhdGlvblByb3BlcnRpZXMsIElTZWFyY2hQcm9ncmVzc0l0ZW0sIElTZWFyY2hTZXJ2aWNlLCBJVGV4dFF1ZXJ5LCBJVGV4dFNlYXJjaFN0YXRzLCBRdWVyeVR5cGUsIFNlYXJjaENvbXBsZXRpb25FeGl0Q29kZSB9IGZyb20gJy4uLy4uLy4uLy4uL3NlcnZpY2VzL3NlYXJjaC9jb21tb24vc2VhcmNoLmpzJztcbmltcG9ydCB7IElDaGFuZ2VFdmVudCwgbWVyZ2VTZWFyY2hSZXN1bHRFdmVudHMsIFNlYXJjaE1vZGVsTG9jYXRpb24sIElTZWFyY2hNb2RlbCwgSVNlYXJjaFJlc3VsdCwgU0VBUkNIX01PREVMX1BSRUZJWCB9IGZyb20gJy4vc2VhcmNoVHJlZUNvbW1vbi5qcyc7XG5pbXBvcnQgeyBTZWFyY2hSZXN1bHRJbXBsIH0gZnJvbSAnLi9zZWFyY2hSZXN1bHQuanMnO1xuaW1wb3J0IHsgSVNlYXJjaFZpZXdNb2RlbFdvcmtiZW5jaFNlcnZpY2UgfSBmcm9tICcuL3NlYXJjaFZpZXdNb2RlbFdvcmtiZW5jaFNlcnZpY2UuanMnO1xuXG5leHBvcnQgY2xhc3MgU2VhcmNoTW9kZWxJbXBsIGV4dGVuZHMgRGlzcG9zYWJsZSBpbXBsZW1lbnRzIElTZWFyY2hNb2RlbCB7XG5cblx0cHJpdmF0ZSBfc2VhcmNoUmVzdWx0OiBJU2VhcmNoUmVzdWx0O1xuXHRwcml2YXRlIF9zZWFyY2hRdWVyeTogSVRleHRRdWVyeSB8IG51bGwgPSBudWxsO1xuXHRwcml2YXRlIF9yZXBsYWNlQWN0aXZlOiBib29sZWFuID0gZmFsc2U7XG5cdHByaXZhdGUgX3JlcGxhY2VTdHJpbmc6IHN0cmluZyB8IG51bGwgPSBudWxsO1xuXHRwcml2YXRlIF9yZXBsYWNlUGF0dGVybjogUmVwbGFjZVBhdHRlcm4gfCBudWxsID0gbnVsbDtcblx0cHJpdmF0ZSBfcHJlc2VydmVDYXNlOiBib29sZWFuID0gZmFsc2U7XG5cdHByaXZhdGUgX3N0YXJ0U3RyZWFtRGVsYXk6IFByb21pc2U8dm9pZD4gPSBQcm9taXNlLnJlc29sdmUoKTtcblx0cHJpdmF0ZSByZWFkb25seSBfcmVzdWx0UXVldWU6IElGaWxlTWF0Y2hbXSA9IFtdO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9haVJlc3VsdFF1ZXVlOiBJRmlsZU1hdGNoW10gPSBbXTtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9vblJlcGxhY2VUZXJtQ2hhbmdlZDogRW1pdHRlcjx2b2lkPiA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPHZvaWQ+KCkpO1xuXHRyZWFkb25seSBvblJlcGxhY2VUZXJtQ2hhbmdlZDogRXZlbnQ8dm9pZD4gPSB0aGlzLl9vblJlcGxhY2VUZXJtQ2hhbmdlZC5ldmVudDtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9vblNlYXJjaFJlc3VsdENoYW5nZWQgPSB0aGlzLl9yZWdpc3RlcihuZXcgUGF1c2VhYmxlRW1pdHRlcjxJQ2hhbmdlRXZlbnQ+KHtcblx0XHRtZXJnZTogbWVyZ2VTZWFyY2hSZXN1bHRFdmVudHNcblx0fSkpO1xuXHRyZWFkb25seSBvblNlYXJjaFJlc3VsdENoYW5nZWQ6IEV2ZW50PElDaGFuZ2VFdmVudD4gPSB0aGlzLl9vblNlYXJjaFJlc3VsdENoYW5nZWQuZXZlbnQ7XG5cblx0cHJpdmF0ZSBjdXJyZW50Q2FuY2VsVG9rZW5Tb3VyY2U6IENhbmNlbGxhdGlvblRva2VuU291cmNlIHwgbnVsbCA9IG51bGw7XG5cdHByaXZhdGUgY3VycmVudEFJQ2FuY2VsVG9rZW5Tb3VyY2U6IENhbmNlbGxhdGlvblRva2VuU291cmNlIHwgbnVsbCA9IG51bGw7XG5cdHByaXZhdGUgc2VhcmNoQ2FuY2VsbGVkRm9yTmV3U2VhcmNoOiBib29sZWFuID0gZmFsc2U7XG5cdHByaXZhdGUgYWlTZWFyY2hDYW5jZWxsZWRGb3JOZXdTZWFyY2g6IGJvb2xlYW4gPSBmYWxzZTtcblx0cHVibGljIGxvY2F0aW9uOiBTZWFyY2hNb2RlbExvY2F0aW9uID0gU2VhcmNoTW9kZWxMb2NhdGlvbi5QQU5FTDtcblx0cHJpdmF0ZSByZWFkb25seSBfYWlUZXh0UmVzdWx0UHJvdmlkZXJOYW1lOiBMYXp5PFByb21pc2U8c3RyaW5nIHwgdW5kZWZpbmVkPj47XG5cblx0cHJpdmF0ZSByZWFkb25seSBfaWQ6IHN0cmluZztcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRASVNlYXJjaFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBzZWFyY2hTZXJ2aWNlOiBJU2VhcmNoU2VydmljZSxcblx0XHRASVRlbGVtZXRyeVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSB0ZWxlbWV0cnlTZXJ2aWNlOiBJVGVsZW1ldHJ5U2VydmljZSxcblx0XHRASUNvbmZpZ3VyYXRpb25TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgY29uZmlndXJhdGlvblNlcnZpY2U6IElDb25maWd1cmF0aW9uU2VydmljZSxcblx0XHRASUluc3RhbnRpYXRpb25TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgaW5zdGFudGlhdGlvblNlcnZpY2U6IElJbnN0YW50aWF0aW9uU2VydmljZSxcblx0XHRASUxvZ1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBsb2dTZXJ2aWNlOiBJTG9nU2VydmljZSxcblx0XHRASU5vdGVib29rU2VhcmNoU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IG5vdGVib29rU2VhcmNoU2VydmljZTogSU5vdGVib29rU2VhcmNoU2VydmljZSxcblx0KSB7XG5cdFx0c3VwZXIoKTtcblx0XHR0aGlzLl9zZWFyY2hSZXN1bHQgPSB0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFNlYXJjaFJlc3VsdEltcGwsIHRoaXMpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuX3NlYXJjaFJlc3VsdC5vbkNoYW5nZSgoZSkgPT4gdGhpcy5fb25TZWFyY2hSZXN1bHRDaGFuZ2VkLmZpcmUoZSkpKTtcblxuXHRcdHRoaXMuX2FpVGV4dFJlc3VsdFByb3ZpZGVyTmFtZSA9IG5ldyBMYXp5KGFzeW5jICgpID0+IHRoaXMuc2VhcmNoU2VydmljZS5nZXRBSU5hbWUoKSk7XG5cdFx0dGhpcy5faWQgPSBTRUFSQ0hfTU9ERUxfUFJFRklYICsgRGF0ZS5ub3coKS50b1N0cmluZygpO1xuXHR9XG5cblx0aWQoKTogc3RyaW5nIHtcblx0XHRyZXR1cm4gdGhpcy5faWQ7XG5cdH1cblxuXHRhc3luYyBnZXRBSVRleHRSZXN1bHRQcm92aWRlck5hbWUoKTogUHJvbWlzZTxzdHJpbmc+IHtcblx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCB0aGlzLl9haVRleHRSZXN1bHRQcm92aWRlck5hbWUudmFsdWU7XG5cdFx0aWYgKCFyZXN1bHQpIHtcblx0XHRcdHRocm93IEVycm9yKCdGZXRjaGluZyBBSSBuYW1lIHdoZW4gbm8gcHJvdmlkZXIgcHJlc2VudC4nKTtcblx0XHR9XG5cdFx0cmV0dXJuIHJlc3VsdDtcblx0fVxuXG5cdGlzUmVwbGFjZUFjdGl2ZSgpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gdGhpcy5fcmVwbGFjZUFjdGl2ZTtcblx0fVxuXG5cdHNldCByZXBsYWNlQWN0aXZlKHJlcGxhY2VBY3RpdmU6IGJvb2xlYW4pIHtcblx0XHR0aGlzLl9yZXBsYWNlQWN0aXZlID0gcmVwbGFjZUFjdGl2ZTtcblx0fVxuXG5cdGdldCByZXBsYWNlUGF0dGVybigpOiBSZXBsYWNlUGF0dGVybiB8IG51bGwge1xuXHRcdHJldHVybiB0aGlzLl9yZXBsYWNlUGF0dGVybjtcblx0fVxuXG5cdGdldCByZXBsYWNlU3RyaW5nKCk6IHN0cmluZyB7XG5cdFx0cmV0dXJuIHRoaXMuX3JlcGxhY2VTdHJpbmcgfHwgJyc7XG5cdH1cblxuXHRzZXQgcHJlc2VydmVDYXNlKHZhbHVlOiBib29sZWFuKSB7XG5cdFx0dGhpcy5fcHJlc2VydmVDYXNlID0gdmFsdWU7XG5cdH1cblxuXHRnZXQgcHJlc2VydmVDYXNlKCk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiB0aGlzLl9wcmVzZXJ2ZUNhc2U7XG5cdH1cblxuXHRzZXQgcmVwbGFjZVN0cmluZyhyZXBsYWNlU3RyaW5nOiBzdHJpbmcpIHtcblx0XHR0aGlzLl9yZXBsYWNlU3RyaW5nID0gcmVwbGFjZVN0cmluZztcblx0XHRpZiAodGhpcy5fc2VhcmNoUXVlcnkpIHtcblx0XHRcdHRoaXMuX3JlcGxhY2VQYXR0ZXJuID0gbmV3IFJlcGxhY2VQYXR0ZXJuKHJlcGxhY2VTdHJpbmcsIHRoaXMuX3NlYXJjaFF1ZXJ5LmNvbnRlbnRQYXR0ZXJuKTtcblx0XHR9XG5cdFx0dGhpcy5fb25SZXBsYWNlVGVybUNoYW5nZWQuZmlyZSgpO1xuXHR9XG5cblx0Z2V0IHNlYXJjaFJlc3VsdCgpOiBJU2VhcmNoUmVzdWx0IHtcblx0XHRyZXR1cm4gdGhpcy5fc2VhcmNoUmVzdWx0O1xuXHR9XG5cblx0YWlTZWFyY2gob25SZXN1bHQ6IChyZXN1bHQ6IElTZWFyY2hQcm9ncmVzc0l0ZW0gfCB1bmRlZmluZWQpID0+IHZvaWQpOiBQcm9taXNlPElTZWFyY2hDb21wbGV0ZT4ge1xuXHRcdGlmICh0aGlzLmhhc0FJUmVzdWx0cykge1xuXHRcdFx0Ly8gYWxyZWFkeSBoYXMgbWF0Y2hlcyBvciBwZW5kaW5nIG1hdGNoZXNcblx0XHRcdHRocm93IEVycm9yKCdBSSByZXN1bHRzIGFscmVhZHkgZXhpc3QnKTtcblx0XHR9XG5cdFx0aWYgKCF0aGlzLl9zZWFyY2hRdWVyeSkge1xuXHRcdFx0dGhyb3cgRXJyb3IoJ05vIHNlYXJjaCBxdWVyeScpO1xuXHRcdH1cblxuXHRcdGNvbnN0IHNlYXJjaEluc3RhbmNlSUQgPSBEYXRlLm5vdygpLnRvU3RyaW5nKCk7XG5cdFx0Y29uc3QgdG9rZW5Tb3VyY2UgPSBuZXcgQ2FuY2VsbGF0aW9uVG9rZW5Tb3VyY2UoKTtcblx0XHR0aGlzLmN1cnJlbnRBSUNhbmNlbFRva2VuU291cmNlID0gdG9rZW5Tb3VyY2U7XG5cdFx0Y29uc3Qgc3RhcnQgPSBEYXRlLm5vdygpO1xuXHRcdGNvbnN0IGFzeW5jQUlSZXN1bHRzID0gdGhpcy5zZWFyY2hTZXJ2aWNlLmFpVGV4dFNlYXJjaChcblx0XHRcdHsgLi4udGhpcy5fc2VhcmNoUXVlcnksIGNvbnRlbnRQYXR0ZXJuOiB0aGlzLl9zZWFyY2hRdWVyeS5jb250ZW50UGF0dGVybi5wYXR0ZXJuLCB0eXBlOiBRdWVyeVR5cGUuYWlUZXh0IH0sXG5cdFx0XHR0b2tlblNvdXJjZS50b2tlbixcblx0XHRcdGFzeW5jIChwOiBJU2VhcmNoUHJvZ3Jlc3NJdGVtKSA9PiB7XG5cdFx0XHRcdG9uUmVzdWx0KHApO1xuXHRcdFx0XHR0aGlzLm9uU2VhcmNoUHJvZ3Jlc3MocCwgc2VhcmNoSW5zdGFuY2VJRCwgZmFsc2UsIHRydWUpO1xuXHRcdFx0fSkuZmluYWxseSgoKSA9PiB7XG5cdFx0XHRcdHRva2VuU291cmNlLmRpc3Bvc2UodHJ1ZSk7XG5cdFx0XHR9KS50aGVuKFxuXHRcdFx0XHR2YWx1ZSA9PiB7XG5cdFx0XHRcdFx0aWYgKHZhbHVlLnJlc3VsdHMubGVuZ3RoID09PSAwKSB7XG5cdFx0XHRcdFx0XHQvLyBhbGVydCBvZiBubyByZXN1bHRzIHNpbmNlIG9uUHJvZ3Jlc3Mgd29uJ3QgYmUgY2FsbGVkXG5cdFx0XHRcdFx0XHRvblJlc3VsdCh1bmRlZmluZWQpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHR0aGlzLm9uU2VhcmNoQ29tcGxldGVkKHZhbHVlLCBEYXRlLm5vdygpIC0gc3RhcnQsIHNlYXJjaEluc3RhbmNlSUQsIHRydWUpO1xuXHRcdFx0XHRcdHJldHVybiB2YWx1ZTtcblx0XHRcdFx0fSxcblx0XHRcdFx0ZSA9PiB7XG5cdFx0XHRcdFx0dGhpcy5vblNlYXJjaEVycm9yKGUsIERhdGUubm93KCkgLSBzdGFydCwgdHJ1ZSk7XG5cdFx0XHRcdFx0dGhyb3cgZTtcblx0XHRcdFx0fSk7XG5cdFx0cmV0dXJuIGFzeW5jQUlSZXN1bHRzO1xuXHR9XG5cblx0cHJpdmF0ZSBkb1NlYXJjaChxdWVyeTogSVRleHRRdWVyeSwgcHJvZ3Jlc3NFbWl0dGVyOiBFbWl0dGVyPHZvaWQ+LCBzZWFyY2hRdWVyeTogSVRleHRRdWVyeSwgc2VhcmNoSW5zdGFuY2VJRDogc3RyaW5nLCBvblByb2dyZXNzPzogKHJlc3VsdDogSVNlYXJjaFByb2dyZXNzSXRlbSkgPT4gdm9pZCwgY2FsbGVyVG9rZW4/OiBDYW5jZWxsYXRpb25Ub2tlbik6IHtcblx0XHRhc3luY1Jlc3VsdHM6IFByb21pc2U8SVNlYXJjaENvbXBsZXRlPjtcblx0XHRzeW5jUmVzdWx0czogSUZpbGVNYXRjaDxVUkk+W107XG5cdH0ge1xuXHRcdGNvbnN0IGFzeW5jR2VuZXJhdGVPblByb2dyZXNzID0gYXN5bmMgKHA6IElTZWFyY2hQcm9ncmVzc0l0ZW0pID0+IHtcblx0XHRcdHByb2dyZXNzRW1pdHRlci5maXJlKCk7XG5cdFx0XHR0aGlzLm9uU2VhcmNoUHJvZ3Jlc3MocCwgc2VhcmNoSW5zdGFuY2VJRCwgZmFsc2UsIGZhbHNlKTtcblx0XHRcdG9uUHJvZ3Jlc3M/LihwKTtcblx0XHR9O1xuXG5cdFx0Y29uc3Qgc3luY0dlbmVyYXRlT25Qcm9ncmVzcyA9IChwOiBJU2VhcmNoUHJvZ3Jlc3NJdGVtKSA9PiB7XG5cdFx0XHRwcm9ncmVzc0VtaXR0ZXIuZmlyZSgpO1xuXHRcdFx0dGhpcy5vblNlYXJjaFByb2dyZXNzKHAsIHNlYXJjaEluc3RhbmNlSUQsIHRydWUpO1xuXHRcdFx0b25Qcm9ncmVzcz8uKHApO1xuXHRcdH07XG5cdFx0Y29uc3QgdG9rZW5Tb3VyY2UgPSB0aGlzLmN1cnJlbnRDYW5jZWxUb2tlblNvdXJjZSA9IG5ldyBDYW5jZWxsYXRpb25Ub2tlblNvdXJjZShjYWxsZXJUb2tlbik7XG5cblx0XHRjb25zdCBub3RlYm9va1Jlc3VsdCA9IHRoaXMubm90ZWJvb2tTZWFyY2hTZXJ2aWNlLm5vdGVib29rU2VhcmNoKHF1ZXJ5LCB0b2tlblNvdXJjZS50b2tlbiwgc2VhcmNoSW5zdGFuY2VJRCwgYXN5bmNHZW5lcmF0ZU9uUHJvZ3Jlc3MpO1xuXHRcdGNvbnN0IHRleHRSZXN1bHQgPSB0aGlzLnNlYXJjaFNlcnZpY2UudGV4dFNlYXJjaFNwbGl0U3luY0FzeW5jKFxuXHRcdFx0c2VhcmNoUXVlcnksXG5cdFx0XHR0b2tlblNvdXJjZS50b2tlbiwgYXN5bmNHZW5lcmF0ZU9uUHJvZ3Jlc3MsXG5cdFx0XHRub3RlYm9va1Jlc3VsdC5vcGVuRmlsZXNUb1NjYW4sXG5cdFx0XHRub3RlYm9va1Jlc3VsdC5hbGxTY2FubmVkRmlsZXMsXG5cdFx0KTtcblxuXHRcdGNvbnN0IHN5bmNSZXN1bHRzID0gdGV4dFJlc3VsdC5zeW5jUmVzdWx0cy5yZXN1bHRzO1xuXHRcdHN5bmNSZXN1bHRzLmZvckVhY2gocCA9PiB7IGlmIChwKSB7IHN5bmNHZW5lcmF0ZU9uUHJvZ3Jlc3MocCk7IH0gfSk7XG5cblx0XHRjb25zdCBnZXRBc3luY1Jlc3VsdHMgPSBhc3luYyAoKTogUHJvbWlzZTxJU2VhcmNoQ29tcGxldGU+ID0+IHtcblx0XHRcdGNvbnN0IHNlYXJjaFN0YXJ0ID0gRGF0ZS5ub3coKTtcblxuXHRcdFx0Ly8gcmVzb2x2ZSBhc3luYyBwYXJ0cyBvZiBzZWFyY2hcblx0XHRcdGNvbnN0IGFsbENsb3NlZEVkaXRvclJlc3VsdHMgPSBhd2FpdCB0ZXh0UmVzdWx0LmFzeW5jUmVzdWx0cztcblx0XHRcdGNvbnN0IHJlc29sdmVkTm90ZWJvb2tSZXN1bHRzID0gYXdhaXQgbm90ZWJvb2tSZXN1bHQuY29tcGxldGVEYXRhO1xuXHRcdFx0Y29uc3Qgc2VhcmNoTGVuZ3RoID0gRGF0ZS5ub3coKSAtIHNlYXJjaFN0YXJ0O1xuXHRcdFx0Y29uc3QgcmVzb2x2ZWRSZXN1bHQ6IElTZWFyY2hDb21wbGV0ZSA9IHtcblx0XHRcdFx0cmVzdWx0czogWy4uLmFsbENsb3NlZEVkaXRvclJlc3VsdHMucmVzdWx0cywgLi4ucmVzb2x2ZWROb3RlYm9va1Jlc3VsdHMucmVzdWx0c10sXG5cdFx0XHRcdG1lc3NhZ2VzOiBbLi4uYWxsQ2xvc2VkRWRpdG9yUmVzdWx0cy5tZXNzYWdlcywgLi4ucmVzb2x2ZWROb3RlYm9va1Jlc3VsdHMubWVzc2FnZXNdLFxuXHRcdFx0XHRsaW1pdEhpdDogYWxsQ2xvc2VkRWRpdG9yUmVzdWx0cy5saW1pdEhpdCB8fCByZXNvbHZlZE5vdGVib29rUmVzdWx0cy5saW1pdEhpdCxcblx0XHRcdFx0ZXhpdDogYWxsQ2xvc2VkRWRpdG9yUmVzdWx0cy5leGl0LFxuXHRcdFx0XHRzdGF0czogYWxsQ2xvc2VkRWRpdG9yUmVzdWx0cy5zdGF0cyxcblx0XHRcdH07XG5cdFx0XHR0aGlzLmxvZ1NlcnZpY2UudHJhY2UoYHdob2xlIHNlYXJjaCB0aW1lIHwgJHtzZWFyY2hMZW5ndGh9bXNgKTtcblx0XHRcdHJldHVybiByZXNvbHZlZFJlc3VsdDtcblx0XHR9O1xuXHRcdHJldHVybiB7XG5cdFx0XHRhc3luY1Jlc3VsdHM6IGdldEFzeW5jUmVzdWx0cygpXG5cdFx0XHRcdC5maW5hbGx5KCgpID0+IHRva2VuU291cmNlLmRpc3Bvc2UodHJ1ZSkpLFxuXHRcdFx0c3luY1Jlc3VsdHNcblx0XHR9O1xuXHR9XG5cblx0Z2V0IGhhc0FJUmVzdWx0cygpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gISEodGhpcy5zZWFyY2hSZXN1bHQuZ2V0Q2FjaGVkU2VhcmNoQ29tcGxldGUodHJ1ZSkpIHx8ICghIXRoaXMuY3VycmVudEFJQ2FuY2VsVG9rZW5Tb3VyY2UgJiYgIXRoaXMuY3VycmVudEFJQ2FuY2VsVG9rZW5Tb3VyY2UudG9rZW4uaXNDYW5jZWxsYXRpb25SZXF1ZXN0ZWQpO1xuXHR9XG5cblx0Z2V0IGhhc1BsYWluUmVzdWx0cygpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gISEodGhpcy5zZWFyY2hSZXN1bHQuZ2V0Q2FjaGVkU2VhcmNoQ29tcGxldGUoZmFsc2UpKSB8fCAoISF0aGlzLmN1cnJlbnRDYW5jZWxUb2tlblNvdXJjZSAmJiAhdGhpcy5jdXJyZW50Q2FuY2VsVG9rZW5Tb3VyY2UudG9rZW4uaXNDYW5jZWxsYXRpb25SZXF1ZXN0ZWQpO1xuXHR9XG5cblx0c2VhcmNoKHF1ZXJ5OiBJVGV4dFF1ZXJ5LCBvblByb2dyZXNzPzogKHJlc3VsdDogSVNlYXJjaFByb2dyZXNzSXRlbSkgPT4gdm9pZCwgY2FsbGVyVG9rZW4/OiBDYW5jZWxsYXRpb25Ub2tlbik6IHtcblx0XHRhc3luY1Jlc3VsdHM6IFByb21pc2U8SVNlYXJjaENvbXBsZXRlPjtcblx0XHRzeW5jUmVzdWx0czogSUZpbGVNYXRjaDxVUkk+W107XG5cdH0ge1xuXHRcdHRoaXMuY2FuY2VsU2VhcmNoKHRydWUpO1xuXG5cdFx0dGhpcy5fc2VhcmNoUXVlcnkgPSBxdWVyeTtcblx0XHRpZiAoIXRoaXMuc2VhcmNoQ29uZmlnLnNlYXJjaE9uVHlwZSkge1xuXHRcdFx0dGhpcy5zZWFyY2hSZXN1bHQuY2xlYXIoKTtcblx0XHR9XG5cdFx0Y29uc3Qgc2VhcmNoSW5zdGFuY2VJRCA9IERhdGUubm93KCkudG9TdHJpbmcoKTtcblxuXHRcdHRoaXMuX3NlYXJjaFJlc3VsdC5xdWVyeSA9IHRoaXMuX3NlYXJjaFF1ZXJ5O1xuXG5cdFx0Y29uc3QgcHJvZ3Jlc3NFbWl0dGVyID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8dm9pZD4oKSk7XG5cdFx0dGhpcy5fcmVwbGFjZVBhdHRlcm4gPSBuZXcgUmVwbGFjZVBhdHRlcm4odGhpcy5yZXBsYWNlU3RyaW5nLCB0aGlzLl9zZWFyY2hRdWVyeS5jb250ZW50UGF0dGVybik7XG5cblx0XHQvLyBJbiBzZWFyY2ggb24gdHlwZSBjYXNlLCBkZWxheSB0aGUgc3RyZWFtaW5nIG9mIHJlc3VsdHMganVzdCBhIGJpdCwgc28gdGhhdCB3ZSBkb24ndCBmbGFzaCB0aGUgb25seSBcImxvY2FsIHJlc3VsdHNcIiBmYXN0IHBhdGhcblx0XHR0aGlzLl9zdGFydFN0cmVhbURlbGF5ID0gbmV3IFByb21pc2UocmVzb2x2ZSA9PiBzZXRUaW1lb3V0KHJlc29sdmUsIHRoaXMuc2VhcmNoQ29uZmlnLnNlYXJjaE9uVHlwZSA/IDE1MCA6IDApKTtcblxuXHRcdGNvbnN0IHJlcSA9IHRoaXMuZG9TZWFyY2gocXVlcnksIHByb2dyZXNzRW1pdHRlciwgdGhpcy5fc2VhcmNoUXVlcnksIHNlYXJjaEluc3RhbmNlSUQsIG9uUHJvZ3Jlc3MsIGNhbGxlclRva2VuKTtcblx0XHRjb25zdCBhc3luY1Jlc3VsdHMgPSByZXEuYXN5bmNSZXN1bHRzO1xuXHRcdGNvbnN0IHN5bmNSZXN1bHRzID0gcmVxLnN5bmNSZXN1bHRzO1xuXG5cdFx0aWYgKG9uUHJvZ3Jlc3MpIHtcblx0XHRcdHN5bmNSZXN1bHRzLmZvckVhY2gocCA9PiB7XG5cdFx0XHRcdGlmIChwKSB7XG5cdFx0XHRcdFx0b25Qcm9ncmVzcyhwKTtcblx0XHRcdFx0fVxuXHRcdFx0fSk7XG5cdFx0fVxuXG5cdFx0Y29uc3Qgc3RhcnQgPSBEYXRlLm5vdygpO1xuXHRcdGxldCBldmVudDogSURpc3Bvc2FibGUgfCB1bmRlZmluZWQ7XG5cblx0XHRjb25zdCBwcm9ncmVzc0VtaXR0ZXJQcm9taXNlID0gbmV3IFByb21pc2UocmVzb2x2ZSA9PiB7XG5cdFx0XHRldmVudCA9IEV2ZW50Lm9uY2UocHJvZ3Jlc3NFbWl0dGVyLmV2ZW50KShyZXNvbHZlKTtcblx0XHRcdHJldHVybiBldmVudDtcblx0XHR9KTtcblxuXHRcdFByb21pc2UucmFjZShbYXN5bmNSZXN1bHRzLCBwcm9ncmVzc0VtaXR0ZXJQcm9taXNlXSkuZmluYWxseSgoKSA9PiB7XG5cdFx0XHQvKiBfX0dEUFJfX1xuXHRcdFx0XHRcInNlYXJjaFJlc3VsdHNGaXJzdFJlbmRlclwiIDoge1xuXHRcdFx0XHRcdFwib3duZXJcIjogXCJyb2Jsb3VyZW5zXCIsXG5cdFx0XHRcdFx0XCJkdXJhdGlvblwiIDogeyBcImNsYXNzaWZpY2F0aW9uXCI6IFwiU3lzdGVtTWV0YURhdGFcIiwgXCJwdXJwb3NlXCI6IFwiUGVyZm9ybWFuY2VBbmRIZWFsdGhcIiwgXCJpc01lYXN1cmVtZW50XCI6IHRydWUgfVxuXHRcdFx0XHR9XG5cdFx0XHQqL1xuXHRcdFx0ZXZlbnQ/LmRpc3Bvc2UoKTtcblx0XHRcdHRoaXMudGVsZW1ldHJ5U2VydmljZS5wdWJsaWNMb2coJ3NlYXJjaFJlc3VsdHNGaXJzdFJlbmRlcicsIHsgZHVyYXRpb246IERhdGUubm93KCkgLSBzdGFydCB9KTtcblx0XHR9KTtcblxuXHRcdHRyeSB7XG5cdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRhc3luY1Jlc3VsdHM6IGFzeW5jUmVzdWx0cy50aGVuKFxuXHRcdFx0XHRcdHZhbHVlID0+IHtcblx0XHRcdFx0XHRcdHRoaXMub25TZWFyY2hDb21wbGV0ZWQodmFsdWUsIERhdGUubm93KCkgLSBzdGFydCwgc2VhcmNoSW5zdGFuY2VJRCwgZmFsc2UpO1xuXHRcdFx0XHRcdFx0cmV0dXJuIHZhbHVlO1xuXHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0ZSA9PiB7XG5cdFx0XHRcdFx0XHR0aGlzLm9uU2VhcmNoRXJyb3IoZSwgRGF0ZS5ub3coKSAtIHN0YXJ0LCBmYWxzZSk7XG5cdFx0XHRcdFx0XHR0aHJvdyBlO1xuXHRcdFx0XHRcdH0pLFxuXHRcdFx0XHRzeW5jUmVzdWx0c1xuXHRcdFx0fTtcblx0XHR9IGZpbmFsbHkge1xuXHRcdFx0LyogX19HRFBSX19cblx0XHRcdFx0XCJzZWFyY2hSZXN1bHRzRmluaXNoZWRcIiA6IHtcblx0XHRcdFx0XHRcIm93bmVyXCI6IFwicm9ibG91cmVuc1wiLFxuXHRcdFx0XHRcdFwiZHVyYXRpb25cIiA6IHsgXCJjbGFzc2lmaWNhdGlvblwiOiBcIlN5c3RlbU1ldGFEYXRhXCIsIFwicHVycG9zZVwiOiBcIlBlcmZvcm1hbmNlQW5kSGVhbHRoXCIsIFwiaXNNZWFzdXJlbWVudFwiOiB0cnVlIH1cblx0XHRcdFx0fVxuXHRcdFx0Ki9cblx0XHRcdHRoaXMudGVsZW1ldHJ5U2VydmljZS5wdWJsaWNMb2coJ3NlYXJjaFJlc3VsdHNGaW5pc2hlZCcsIHsgZHVyYXRpb246IERhdGUubm93KCkgLSBzdGFydCB9KTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIG9uU2VhcmNoQ29tcGxldGVkKGNvbXBsZXRlZDogSVNlYXJjaENvbXBsZXRlIHwgdW5kZWZpbmVkLCBkdXJhdGlvbjogbnVtYmVyLCBzZWFyY2hJbnN0YW5jZUlEOiBzdHJpbmcsIGFpOiBib29sZWFuKTogSVNlYXJjaENvbXBsZXRlIHwgdW5kZWZpbmVkIHtcblx0XHRpZiAoIXRoaXMuX3NlYXJjaFF1ZXJ5KSB7XG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IoJ29uU2VhcmNoQ29tcGxldGVkIG11c3QgYmUgY2FsbGVkIGFmdGVyIGEgc2VhcmNoIGlzIHN0YXJ0ZWQnKTtcblx0XHR9XG5cblx0XHRpZiAoYWkpIHtcblx0XHRcdHRoaXMuX3NlYXJjaFJlc3VsdC5hZGQodGhpcy5fYWlSZXN1bHRRdWV1ZSwgc2VhcmNoSW5zdGFuY2VJRCwgdHJ1ZSk7XG5cdFx0XHR0aGlzLl9haVJlc3VsdFF1ZXVlLmxlbmd0aCA9IDA7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHRoaXMuX3NlYXJjaFJlc3VsdC5hZGQodGhpcy5fcmVzdWx0UXVldWUsIHNlYXJjaEluc3RhbmNlSUQsIGZhbHNlKTtcblx0XHRcdHRoaXMuX3Jlc3VsdFF1ZXVlLmxlbmd0aCA9IDA7XG5cdFx0fVxuXG5cdFx0dGhpcy5zZWFyY2hSZXN1bHQuc2V0Q2FjaGVkU2VhcmNoQ29tcGxldGUoY29tcGxldGVkLCBhaSk7XG5cblx0XHRjb25zdCBvcHRpb25zOiBJUGF0dGVybkluZm8gPSBPYmplY3QuYXNzaWduKHt9LCB0aGlzLl9zZWFyY2hRdWVyeS5jb250ZW50UGF0dGVybik7XG5cdFx0Ly8gZXNsaW50LWRpc2FibGUtbmV4dC1saW5lIGxvY2FsL2NvZGUtbm8tYW55LWNhc3RzXG5cdFx0ZGVsZXRlIChvcHRpb25zIGFzIGFueSkucGF0dGVybjtcblxuXHRcdGNvbnN0IHN0YXRzID0gY29tcGxldGVkICYmIGNvbXBsZXRlZC5zdGF0cyBhcyBJVGV4dFNlYXJjaFN0YXRzO1xuXG5cdFx0Y29uc3QgZmlsZVNjaGVtZU9ubHkgPSB0aGlzLl9zZWFyY2hRdWVyeS5mb2xkZXJRdWVyaWVzLmV2ZXJ5KGZxID0+IGZxLmZvbGRlci5zY2hlbWUgPT09IFNjaGVtYXMuZmlsZSk7XG5cdFx0Y29uc3Qgb3RoZXJTY2hlbWVPbmx5ID0gdGhpcy5fc2VhcmNoUXVlcnkuZm9sZGVyUXVlcmllcy5ldmVyeShmcSA9PiBmcS5mb2xkZXIuc2NoZW1lICE9PSBTY2hlbWFzLmZpbGUpO1xuXHRcdGNvbnN0IHNjaGVtZSA9IGZpbGVTY2hlbWVPbmx5ID8gU2NoZW1hcy5maWxlIDpcblx0XHRcdG90aGVyU2NoZW1lT25seSA/ICdvdGhlcicgOlxuXHRcdFx0XHQnbWl4ZWQnO1xuXG5cdFx0LyogX19HRFBSX19cblx0XHRcdFwic2VhcmNoUmVzdWx0c1Nob3duXCIgOiB7XG5cdFx0XHRcdFwib3duZXJcIjogXCJyb2Jsb3VyZW5zXCIsXG5cdFx0XHRcdFwiY291bnRcIiA6IHsgXCJjbGFzc2lmaWNhdGlvblwiOiBcIlN5c3RlbU1ldGFEYXRhXCIsIFwicHVycG9zZVwiOiBcIkZlYXR1cmVJbnNpZ2h0XCIsIFwiaXNNZWFzdXJlbWVudFwiOiB0cnVlIH0sXG5cdFx0XHRcdFwiZmlsZUNvdW50XCI6IHsgXCJjbGFzc2lmaWNhdGlvblwiOiBcIlN5c3RlbU1ldGFEYXRhXCIsIFwicHVycG9zZVwiOiBcIkZlYXR1cmVJbnNpZ2h0XCIsIFwiaXNNZWFzdXJlbWVudFwiOiB0cnVlIH0sXG5cdFx0XHRcdFwib3B0aW9uc1wiOiB7IFwiJHtpbmxpbmV9XCI6IFsgXCIke0lQYXR0ZXJuSW5mb31cIiBdIH0sXG5cdFx0XHRcdFwiZHVyYXRpb25cIjogeyBcImNsYXNzaWZpY2F0aW9uXCI6IFwiU3lzdGVtTWV0YURhdGFcIiwgXCJwdXJwb3NlXCI6IFwiUGVyZm9ybWFuY2VBbmRIZWFsdGhcIiwgXCJpc01lYXN1cmVtZW50XCI6IHRydWUgfSxcblx0XHRcdFx0XCJ0eXBlXCIgOiB7IFwiY2xhc3NpZmljYXRpb25cIjogXCJTeXN0ZW1NZXRhRGF0YVwiLCBcInB1cnBvc2VcIjogXCJQZXJmb3JtYW5jZUFuZEhlYWx0aFwiIH0sXG5cdFx0XHRcdFwic2NoZW1lXCIgOiB7IFwiY2xhc3NpZmljYXRpb25cIjogXCJTeXN0ZW1NZXRhRGF0YVwiLCBcInB1cnBvc2VcIjogXCJQZXJmb3JtYW5jZUFuZEhlYWx0aFwiIH0sXG5cdFx0XHRcdFwic2VhcmNoT25UeXBlRW5hYmxlZFwiIDogeyBcImNsYXNzaWZpY2F0aW9uXCI6IFwiU3lzdGVtTWV0YURhdGFcIiwgXCJwdXJwb3NlXCI6IFwiRmVhdHVyZUluc2lnaHRcIiB9XG5cdFx0XHR9XG5cdFx0Ki9cblx0XHR0aGlzLnRlbGVtZXRyeVNlcnZpY2UucHVibGljTG9nKCdzZWFyY2hSZXN1bHRzU2hvd24nLCB7XG5cdFx0XHRjb3VudDogdGhpcy5fc2VhcmNoUmVzdWx0LmNvdW50KCksXG5cdFx0XHRmaWxlQ291bnQ6IHRoaXMuX3NlYXJjaFJlc3VsdC5maWxlQ291bnQoKSxcblx0XHRcdG9wdGlvbnMsXG5cdFx0XHRkdXJhdGlvbixcblx0XHRcdHR5cGU6IHN0YXRzICYmIHN0YXRzLnR5cGUsXG5cdFx0XHRzY2hlbWUsXG5cdFx0XHRzZWFyY2hPblR5cGVFbmFibGVkOiB0aGlzLnNlYXJjaENvbmZpZy5zZWFyY2hPblR5cGVcblx0XHR9KTtcblx0XHRyZXR1cm4gY29tcGxldGVkO1xuXHR9XG5cblx0cHJpdmF0ZSBvblNlYXJjaEVycm9yKGU6IGFueSwgZHVyYXRpb246IG51bWJlciwgYWk6IGJvb2xlYW4pOiB2b2lkIHtcblx0XHRpZiAoZXJyb3JzLmlzQ2FuY2VsbGF0aW9uRXJyb3IoZSkpIHtcblx0XHRcdHRoaXMub25TZWFyY2hDb21wbGV0ZWQoXG5cdFx0XHRcdChhaSA/IHRoaXMuYWlTZWFyY2hDYW5jZWxsZWRGb3JOZXdTZWFyY2ggOiB0aGlzLnNlYXJjaENhbmNlbGxlZEZvck5ld1NlYXJjaClcblx0XHRcdFx0XHQ/IHsgZXhpdDogU2VhcmNoQ29tcGxldGlvbkV4aXRDb2RlLk5ld1NlYXJjaFN0YXJ0ZWQsIHJlc3VsdHM6IFtdLCBtZXNzYWdlczogW10gfVxuXHRcdFx0XHRcdDogdW5kZWZpbmVkLFxuXHRcdFx0XHRkdXJhdGlvbiwgJycsIGFpKTtcblx0XHRcdGlmIChhaSkge1xuXHRcdFx0XHR0aGlzLmFpU2VhcmNoQ2FuY2VsbGVkRm9yTmV3U2VhcmNoID0gZmFsc2U7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHR0aGlzLnNlYXJjaENhbmNlbGxlZEZvck5ld1NlYXJjaCA9IGZhbHNlO1xuXHRcdFx0fVxuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgb25TZWFyY2hQcm9ncmVzcyhwOiBJU2VhcmNoUHJvZ3Jlc3NJdGVtLCBzZWFyY2hJbnN0YW5jZUlEOiBzdHJpbmcsIHN5bmMgPSB0cnVlLCBhaTogYm9vbGVhbiA9IGZhbHNlKSB7XG5cdFx0Y29uc3QgdGFyZ2V0UXVldWUgPSBhaSA/IHRoaXMuX2FpUmVzdWx0UXVldWUgOiB0aGlzLl9yZXN1bHRRdWV1ZTtcblx0XHRpZiAoKDxJRmlsZU1hdGNoPnApLnJlc291cmNlKSB7XG5cdFx0XHR0YXJnZXRRdWV1ZS5wdXNoKDxJRmlsZU1hdGNoPnApO1xuXHRcdFx0aWYgKHN5bmMpIHtcblx0XHRcdFx0aWYgKHRhcmdldFF1ZXVlLmxlbmd0aCkge1xuXHRcdFx0XHRcdHRoaXMuX3NlYXJjaFJlc3VsdC5hZGQodGFyZ2V0UXVldWUsIHNlYXJjaEluc3RhbmNlSUQsIGZhbHNlLCB0cnVlKTtcblx0XHRcdFx0XHR0YXJnZXRRdWV1ZS5sZW5ndGggPSAwO1xuXHRcdFx0XHR9XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHR0aGlzLl9zdGFydFN0cmVhbURlbGF5LnRoZW4oKCkgPT4ge1xuXHRcdFx0XHRcdGlmICh0YXJnZXRRdWV1ZS5sZW5ndGgpIHtcblx0XHRcdFx0XHRcdHRoaXMuX3NlYXJjaFJlc3VsdC5hZGQodGFyZ2V0UXVldWUsIHNlYXJjaEluc3RhbmNlSUQsIGFpLCAhYWkpO1xuXHRcdFx0XHRcdFx0dGFyZ2V0UXVldWUubGVuZ3RoID0gMDtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH0pO1xuXHRcdFx0fVxuXG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBnZXQgc2VhcmNoQ29uZmlnKCkge1xuXHRcdHJldHVybiB0aGlzLmNvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldFZhbHVlPElTZWFyY2hDb25maWd1cmF0aW9uUHJvcGVydGllcz4oJ3NlYXJjaCcpO1xuXHR9XG5cblx0Y2FuY2VsU2VhcmNoKGNhbmNlbGxlZEZvck5ld1NlYXJjaCA9IGZhbHNlKTogYm9vbGVhbiB7XG5cdFx0aWYgKHRoaXMuY3VycmVudENhbmNlbFRva2VuU291cmNlKSB7XG5cdFx0XHR0aGlzLnNlYXJjaENhbmNlbGxlZEZvck5ld1NlYXJjaCA9IGNhbmNlbGxlZEZvck5ld1NlYXJjaDtcblx0XHRcdHRoaXMuY3VycmVudENhbmNlbFRva2VuU291cmNlLmNhbmNlbCgpO1xuXHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0fVxuXHRcdHJldHVybiBmYWxzZTtcblx0fVxuXHRjYW5jZWxBSVNlYXJjaChjYW5jZWxsZWRGb3JOZXdTZWFyY2ggPSBmYWxzZSk6IGJvb2xlYW4ge1xuXHRcdGlmICh0aGlzLmN1cnJlbnRBSUNhbmNlbFRva2VuU291cmNlKSB7XG5cdFx0XHR0aGlzLmFpU2VhcmNoQ2FuY2VsbGVkRm9yTmV3U2VhcmNoID0gY2FuY2VsbGVkRm9yTmV3U2VhcmNoO1xuXHRcdFx0dGhpcy5jdXJyZW50QUlDYW5jZWxUb2tlblNvdXJjZS5jYW5jZWwoKTtcblx0XHRcdHJldHVybiB0cnVlO1xuXHRcdH1cblx0XHRyZXR1cm4gZmFsc2U7XG5cdH1cblx0Y2xlYXJBaVNlYXJjaFJlc3VsdHMoKTogdm9pZCB7XG5cdFx0dGhpcy5fYWlSZXN1bHRRdWV1ZS5sZW5ndGggPSAwO1xuXHRcdC8vIGl0J3Mgbm90IGNsZWFyIGFsbCBhcyB3ZSBhcmUgb25seSBjbGVhcmluZyB0aGUgQUkgcmVzdWx0c1xuXHRcdHRoaXMuX3NlYXJjaFJlc3VsdC5haVRleHRTZWFyY2hSZXN1bHQuY2xlYXIoZmFsc2UpO1xuXHR9XG5cdG92ZXJyaWRlIGRpc3Bvc2UoKTogdm9pZCB7XG5cdFx0dGhpcy5jYW5jZWxTZWFyY2goKTtcblx0XHR0aGlzLmNhbmNlbEFJU2VhcmNoKCk7XG5cdFx0dGhpcy5zZWFyY2hSZXN1bHQuZGlzcG9zZSgpO1xuXHRcdHN1cGVyLmRpc3Bvc2UoKTtcblx0fVxuXG59XG5cblxuZXhwb3J0IGNsYXNzIFNlYXJjaFZpZXdNb2RlbFdvcmtiZW5jaFNlcnZpY2UgaW1wbGVtZW50cyBJU2VhcmNoVmlld01vZGVsV29ya2JlbmNoU2VydmljZSB7XG5cblx0ZGVjbGFyZSByZWFkb25seSBfc2VydmljZUJyYW5kOiB1bmRlZmluZWQ7XG5cdHByaXZhdGUgX3NlYXJjaE1vZGVsOiBTZWFyY2hNb2RlbEltcGwgfCBudWxsID0gbnVsbDtcblxuXHRjb25zdHJ1Y3RvcihASUluc3RhbnRpYXRpb25TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgaW5zdGFudGlhdGlvblNlcnZpY2U6IElJbnN0YW50aWF0aW9uU2VydmljZSkge1xuXHR9XG5cblx0Z2V0IHNlYXJjaE1vZGVsKCk6IFNlYXJjaE1vZGVsSW1wbCB7XG5cdFx0aWYgKCF0aGlzLl9zZWFyY2hNb2RlbCkge1xuXHRcdFx0dGhpcy5fc2VhcmNoTW9kZWwgPSB0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFNlYXJjaE1vZGVsSW1wbCk7XG5cdFx0fVxuXHRcdHJldHVybiB0aGlzLl9zZWFyY2hNb2RlbDtcblx0fVxuXG5cdHNldCBzZWFyY2hNb2RlbChzZWFyY2hNb2RlbDogU2VhcmNoTW9kZWxJbXBsKSB7XG5cdFx0dGhpcy5fc2VhcmNoTW9kZWw/LmRpc3Bvc2UoKTtcblx0XHR0aGlzLl9zZWFyY2hNb2RlbCA9IHNlYXJjaE1vZGVsO1xuXHR9XG59XG5cbiJdLAogICJtYXBwaW5ncyI6ICI7Ozs7Ozs7Ozs7O0FBTUEsU0FBNEIsK0JBQStCO0FBQzNELFlBQVksWUFBWTtBQUN4QixTQUFTLFNBQVMsT0FBTyx3QkFBd0I7QUFDakQsU0FBUyxZQUFZO0FBQ3JCLFNBQVMsa0JBQStCO0FBQ3hDLFNBQVMsZUFBZTtBQUV4QixTQUFTLDZCQUE2QjtBQUN0QyxTQUFTLDZCQUE2QjtBQUN0QyxTQUFTLG1CQUFtQjtBQUM1QixTQUFTLHlCQUF5QjtBQUNsQyxTQUFTLDhCQUE4QjtBQUN2QyxTQUFTLHNCQUFzQjtBQUMvQixTQUF5RyxnQkFBOEMsV0FBVyxnQ0FBZ0M7QUFDbE0sU0FBdUIseUJBQXlCLHFCQUFrRCwyQkFBMkI7QUFDN0gsU0FBUyx3QkFBd0I7QUFHMUIsSUFBTSxrQkFBTixjQUE4QixXQUFtQztBQUFBLEVBNkJ2RSxZQUNrQyxlQUNHLGtCQUNJLHNCQUNBLHNCQUNWLFlBQ1csdUJBQ3hDO0FB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
