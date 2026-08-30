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
import * as arrays from "../../../../base/common/arrays.js";
import { DeferredPromise, raceCancellationError } from "../../../../base/common/async.js";
import { CancellationError } from "../../../../base/common/errors.js";
import { Disposable, toDisposable } from "../../../../base/common/lifecycle.js";
import { ResourceMap, ResourceSet } from "../../../../base/common/map.js";
import { Schemas } from "../../../../base/common/network.js";
import { randomChance } from "../../../../base/common/numbers.js";
import { StopWatch } from "../../../../base/common/stopwatch.js";
import { isNumber } from "../../../../base/common/types.js";
import { IModelService } from "../../../../editor/common/services/model.js";
import { IFileService } from "../../../../platform/files/common/files.js";
import { ILogService } from "../../../../platform/log/common/log.js";
import { ITelemetryService } from "../../../../platform/telemetry/common/telemetry.js";
import { IUriIdentityService } from "../../../../platform/uriIdentity/common/uriIdentity.js";
import { EditorResourceAccessor, SideBySideEditor } from "../../../common/editor.js";
import { IEditorService } from "../../editor/common/editorService.js";
import { IExtensionService } from "../../extensions/common/extensions.js";
import { DEFAULT_MAX_SEARCH_RESULTS, deserializeSearchError, FileMatch, isAIKeyword, isFileMatch, isProgressMessage, pathIncludedInQuery, QueryType, SEARCH_RESULT_LANGUAGE_ID, SearchErrorCode, SearchProviderType } from "./search.js";
import { getTextSearchMatchWithModelContext, editorMatchesToTextSearchResults } from "./searchHelpers.js";
let SearchService = class extends Disposable {
  constructor(modelService, editorService, telemetryService, logService, extensionService, fileService, uriIdentityService) {
    super();
    this.modelService = modelService;
    this.editorService = editorService;
    this.telemetryService = telemetryService;
    this.logService = logService;
    this.extensionService = extensionService;
    this.fileService = fileService;
    this.uriIdentityService = uriIdentityService;
    this.fileSearchProviders = /* @__PURE__ */ new Map();
    this.textSearchProviders = /* @__PURE__ */ new Map();
    this.aiTextSearchProviders = /* @__PURE__ */ new Map();
    this.deferredFileSearchesByScheme = /* @__PURE__ */ new Map();
    this.deferredTextSearchesByScheme = /* @__PURE__ */ new Map();
    this.deferredAITextSearchesByScheme = /* @__PURE__ */ new Map();
    this.loggedSchemesMissingProviders = /* @__PURE__ */ new Set();
  }
  registerSearchResultProvider(scheme, type, provider) {
    let list;
    let deferredMap;
    if (type === SearchProviderType.file) {
      list = this.fileSearchProviders;
      deferredMap = this.deferredFileSearchesByScheme;
    } else if (type === SearchProviderType.text) {
      list = this.textSearchProviders;
      deferredMap = this.deferredTextSearchesByScheme;
    } else if (type === SearchProviderType.aiText) {
      list = this.aiTextSearchProviders;
      deferredMap = this.deferredAITextSearchesByScheme;
    } else {
      throw new Error("Unknown SearchProviderType");
    }
    list.set(scheme, provider);
    if (deferredMap.has(scheme)) {
      deferredMap.get(scheme).complete(provider);
      deferredMap.delete(scheme);
    }
    return toDisposable(() => {
      list.delete(scheme);
    });
  }
  async textSearch(query, token, onProgress) {
    const results = this.textSearchSplitSyncAsync(query, token, onProgress);
    const openEditorResults = results.syncResults;
    const otherResults = await results.asyncResults;
    return {
      limitHit: otherResults.limitHit || openEditorResults.limitHit,
      results: [...otherResults.results, ...openEditorResults.results],
      messages: [...otherResults.messages, ...openEditorResults.messages]
    };
  }
  async aiTextSearch(query, token, onProgress) {
    const onProviderProgress = (progress) => {
      if (onProgress) {
        if (isFileMatch(progress) || isAIKeyword(progress)) {
          onProgress(progress);
        } else {
          onProgress(progress);
        }
      }
      if (isProgressMessage(progress)) {
        this.logService.debug("SearchService#search", progress.message);
      }
    };
    return this.doSearch(query, token, onProviderProgress);
  }
  async getAIName() {
    const provider = this.getSearchProvider(QueryType.aiText).get(Schemas.file);
    return await provider?.getAIName();
  }
  textSearchSplitSyncAsync(query, token, onProgress, notebookFilesToIgnore, asyncNotebookFilesToIgnore) {
    const openEditorResults = this.getOpenEditorResults(query);
    if (onProgress) {
      arrays.coalesce([...openEditorResults.results.values()]).filter((e) => !(notebookFilesToIgnore && notebookFilesToIgnore.has(e.resource))).forEach(onProgress);
    }
    const syncResults = {
      results: arrays.coalesce([...openEditorResults.results.values()]),
      limitHit: openEditorResults.limitHit ?? false,
      messages: []
    };
    const getAsyncResults = async () => {
      const resolvedAsyncNotebookFilesToIgnore = await asyncNotebookFilesToIgnore ?? new ResourceSet();
      const onProviderProgress = (progress) => {
        if (isFileMatch(progress)) {
          if (!openEditorResults.results.has(progress.resource) && !resolvedAsyncNotebookFilesToIgnore.has(progress.resource) && onProgress) {
            onProgress(progress);
          }
        } else if (onProgress) {
          onProgress(progress);
        }
        if (isProgressMessage(progress)) {
          this.logService.debug("SearchService#search", progress.message);
        }
      };
      return await this.doSearch(query, token, onProviderProgress);
    };
    return {
      syncResults,
      asyncResults: getAsyncResults()
    };
  }
  fileSearch(query, token) {
    return this.doSearch(query, token);
  }
  schemeHasFileSearchProvider(scheme) {
    return this.fileSearchProviders.has(scheme);
  }
  doSearch(query, token, onProgress) {
    this.logService.trace("SearchService#search", JSON.stringify(query));
    const schemesInQuery = this.getSchemesInQuery(query);
    const providerActivations = [Promise.resolve(null)];
    schemesInQuery.forEach((scheme) => providerActivations.push(this.extensionService.activateByEvent(`onSearch:${scheme}`)));
    providerActivations.push(this.extensionService.activateByEvent("onSearch:file"));
    const providerPromise = (async () => {
      await Promise.all(providerActivations);
      await this.extensionService.whenInstalledExtensionsRegistered();
      if (token && token.isCancellationRequested) {
        return Promise.reject(new CancellationError());
      }
      const progressCallback = (item) => {
        if (token && token.isCancellationRequested) {
          return;
        }
        onProgress?.(item);
      };
      const exists = await Promise.all(query.folderQueries.map((query2) => this.fileService.exists(query2.folder)));
      query.folderQueries = query.folderQueries.filter((_, i) => exists[i]);
      let completes = await this.searchWithProviders(query, progressCallback, token);
      completes = arrays.coalesce(completes);
      if (!completes.length) {
        return {
          limitHit: false,
          results: [],
          messages: []
        };
      }
      return {
        limitHit: completes[0] && completes[0].limitHit,
        stats: completes[0].stats,
        messages: arrays.coalesce(completes.flatMap((i) => i.messages)).filter(arrays.uniqueFilter((message) => message.type + message.text + message.trusted)),
        results: completes.flatMap((c) => c.results),
        aiKeywords: completes.flatMap((c) => c.aiKeywords).filter((keyword) => keyword !== void 0)
      };
    })();
    return token ? raceCancellationError(providerPromise, token) : providerPromise;
  }
  getSchemesInQuery(query) {
    const schemes = /* @__PURE__ */ new Set();
    query.folderQueries?.forEach((fq) => schemes.add(fq.folder.scheme));
    query.extraFileResources?.forEach((extraFile) => schemes.add(extraFile.scheme));
    return schemes;
  }
  async waitForProvider(queryType, scheme) {
    const deferredMap = this.getDeferredTextSearchesByScheme(queryType);
    if (deferredMap.has(scheme)) {
      return deferredMap.get(scheme).p;
    } else {
      const deferred = new DeferredPromise();
      deferredMap.set(scheme, deferred);
      return deferred.p;
    }
  }
  getSearchProvider(type) {
    switch (type) {
      case QueryType.File:
        return this.fileSearchProviders;
      case QueryType.Text:
        return this.textSearchProviders;
      case QueryType.aiText:
        return this.aiTextSearchProviders;
      default:
        throw new Error(`Unknown query type: ${type}`);
    }
  }
  getDeferredTextSearchesByScheme(type) {
    switch (type) {
      case QueryType.File:
        return this.deferredFileSearchesByScheme;
      case QueryType.Text:
        return this.deferredTextSearchesByScheme;
      case QueryType.aiText:
        return this.deferredAITextSearchesByScheme;
      default:
        throw new Error(`Unknown query type: ${type}`);
    }
  }
  async searchWithProviders(query, onProviderProgress, token) {
    const e2eSW = StopWatch.create(false);
    const searchPs = [];
    const fqs = this.groupFolderQueriesByScheme(query);
    const someSchemeHasProvider = [...fqs.keys()].some((scheme) => {
      return this.getSearchProvider(query.type).has(scheme);
    });
    await Promise.all([...fqs.keys()].map(async (scheme) => {
      if (query.onlyFileScheme && scheme !== Schemas.file) {
        return;
      }
      const schemeFQs = fqs.get(scheme);
      let provider = this.getSearchProvider(query.type).get(scheme);
      if (!provider) {
        if (someSchemeHasProvider) {
          if (!this.loggedSchemesMissingProviders.has(scheme)) {
            this.logService.warn(`No search provider registered for scheme: ${scheme}. Another scheme has a provider, not waiting for ${scheme}`);
            this.loggedSchemesMissingProviders.add(scheme);
          }
          return;
        } else {
          if (!this.loggedSchemesMissingProviders.has(scheme)) {
            this.logService.warn(`No search provider registered for scheme: ${scheme}, waiting`);
            this.loggedSchemesMissingProviders.add(scheme);
          }
          provider = await this.waitForProvider(query.type, scheme);
        }
      }
      const oneSchemeQuery = {
        ...query,
        ...{
          folderQueries: schemeFQs
        }
      };
      const doProviderSearch = () => {
        switch (query.type) {
          case QueryType.File:
            return provider.fileSearch(oneSchemeQuery, token);
          case QueryType.Text:
            return provider.textSearch(oneSchemeQuery, onProviderProgress, token);
          default:
            return provider.textSearch(oneSchemeQuery, onProviderProgress, token);
        }
      };
      searchPs.push(doProviderSearch());
    }));
    return Promise.all(searchPs).then((completes) => {
      const endToEndTime = e2eSW.elapsed();
      this.logService.trace(`SearchService#search: ${endToEndTime}ms`);
      completes.forEach((complete) => {
        this.sendTelemetry(query, endToEndTime, complete);
      });
      return completes;
    }, (err) => {
      const endToEndTime = e2eSW.elapsed();
      this.logService.trace(`SearchService#search: ${endToEndTime}ms`);
      const searchError = deserializeSearchError(err);
      this.logService.trace(`SearchService#searchError: ${searchError.message}`);
      this.sendTelemetry(query, endToEndTime, void 0, searchError);
      throw searchError;
    });
  }
  groupFolderQueriesByScheme(query) {
    const queries = /* @__PURE__ */ new Map();
    query.folderQueries.forEach((fq) => {
      const schemeFQs = queries.get(fq.folder.scheme) || [];
      schemeFQs.push(fq);
      queries.set(fq.folder.scheme, schemeFQs);
    });
    return queries;
  }
  sendTelemetry(query, endToEndTime, complete, err) {
    if (!randomChance(5 / 100)) {
      return;
    }
    const fileSchemeOnly = query.folderQueries.every((fq) => fq.folder.scheme === Schemas.file);
    const otherSchemeOnly = query.folderQueries.every((fq) => fq.folder.scheme !== Schemas.file);
    const scheme = fileSchemeOnly ? Schemas.file : otherSchemeOnly ? "other" : "mixed";
    if (query.type === QueryType.File && complete && complete.stats) {
      const fileSearchStats = complete.stats;
      if (fileSearchStats.fromCache) {
        const cacheStats = fileSearchStats.detailStats;
        this.telemetryService.publicLog2("cachedSearchComplete", {
          reason: query._reason,
          resultCount: fileSearchStats.resultCount,
          workspaceFolderCount: query.folderQueries.length,
          endToEndTime,
          sortingTime: fileSearchStats.sortingTime,
          cacheWasResolved: cacheStats.cacheWasResolved,
          cacheLookupTime: cacheStats.cacheLookupTime,
          cacheFilterTime: cacheStats.cacheFilterTime,
          cacheEntryCount: cacheStats.cacheEntryCount,
          scheme
        });
      } else {
        const searchEngineStats = fileSearchStats.detailStats;
        this.telemetryService.publicLog2("searchComplete", {
          reason: query._reason,
          resultCount: fileSearchStats.resultCount,
          workspaceFolderCount: query.folderQueries.length,
          endToEndTime,
          sortingTime: fileSearchStats.sortingTime,
          fileWalkTime: searchEngineStats.fileWalkTime,
          directoriesWalked: searchEngineStats.directoriesWalked,
          filesWalked: searchEngineStats.filesWalked,
          cmdTime: searchEngineStats.cmdTime,
          cmdResultCount: searchEngineStats.cmdResultCount,
          scheme
        });
      }
    } else if (query.type === QueryType.Text) {
      let errorType;
      if (err) {
        errorType = err.code === SearchErrorCode.regexParseError ? "regex" : err.code === SearchErrorCode.unknownEncoding ? "encoding" : err.code === SearchErrorCode.globParseError ? "glob" : err.code === SearchErrorCode.invalidLiteral ? "literal" : err.code === SearchErrorCode.other ? "other" : err.code === SearchErrorCode.canceled ? "canceled" : "unknown";
      }
      this.telemetryService.publicLog2("textSearchComplete", {
        reason: query._reason,
        workspaceFolderCount: query.folderQueries.length,
        endToEndTime,
        scheme,
        error: errorType
      });
    }
  }
  getOpenEditorResults(query) {
    const openEditorResults = new ResourceMap((uri2) => this.uriIdentityService.extUri.getComparisonKey(uri2));
    let limitHit = false;
    if (query.type === QueryType.Text) {
      const canonicalToOriginalResources = new ResourceMap();
      for (const editorInput of this.editorService.editors) {
        const canonical = EditorResourceAccessor.getCanonicalUri(editorInput, { supportSideBySide: SideBySideEditor.PRIMARY });
        const original = EditorResourceAccessor.getOriginalUri(editorInput, { supportSideBySide: SideBySideEditor.PRIMARY });
        if (canonical) {
          canonicalToOriginalResources.set(canonical, original ?? canonical);
        }
      }
      const models = this.modelService.getModels();
      models.forEach((model) => {
        const resource = model.uri;
        if (!resource) {
          return;
        }
        if (limitHit) {
          return;
        }
        const originalResource = canonicalToOriginalResources.get(resource);
        if (!originalResource) {
          return;
        }
        if (model.getLanguageId() === SEARCH_RESULT_LANGUAGE_ID && !(query.includePattern && query.includePattern["**/*.code-search"])) {
          return;
        }
        if (originalResource.scheme !== Schemas.untitled && !this.fileService.hasProvider(originalResource)) {
          return;
        }
        if (originalResource.scheme === "git") {
          return;
        }
        if (!this.matches(originalResource, query)) {
          return;
        }
        const askMax = (isNumber(query.maxResults) ? query.maxResults : DEFAULT_MAX_SEARCH_RESULTS) + 1;
        let matches = model.findMatches(query.contentPattern.pattern, false, !!query.contentPattern.isRegExp, !!query.contentPattern.isCaseSensitive, query.contentPattern.isWordMatch ? query.contentPattern.wordSeparators : null, false, askMax);
        if (matches.length) {
          if (askMax && matches.length >= askMax) {
            limitHit = true;
            matches = matches.slice(0, askMax - 1);
          }
          const fileMatch = new FileMatch(originalResource);
          openEditorResults.set(originalResource, fileMatch);
          const textSearchResults = editorMatchesToTextSearchResults(matches, model, query.previewOptions);
          fileMatch.results = getTextSearchMatchWithModelContext(textSearchResults, model, query);
        } else {
          openEditorResults.set(originalResource, null);
        }
      });
    }
    return {
      results: openEditorResults,
      limitHit
    };
  }
  matches(resource, query) {
    return pathIncludedInQuery(query, resource.fsPath);
  }
  async clearCache(cacheKey) {
    const clearPs = Array.from(this.fileSearchProviders.values()).map((provider) => provider && provider.clearCache(cacheKey));
    await Promise.all(clearPs);
  }
};
SearchService = __decorateClass([
  __decorateParam(0, IModelService),
  __decorateParam(1, IEditorService),
  __decorateParam(2, ITelemetryService),
  __decorateParam(3, ILogService),
  __decorateParam(4, IExtensionService),
  __decorateParam(5, IFileService),
  __decorateParam(6, IUriIdentityService)
], SearchService);
export {
  SearchService
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXHNlcnZpY2VzXFxzZWFyY2hcXGNvbW1vblxcc2VhcmNoU2VydmljZS50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCAqIGFzIGFycmF5cyBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9hcnJheXMuanMnO1xuaW1wb3J0IHsgRGVmZXJyZWRQcm9taXNlLCByYWNlQ2FuY2VsbGF0aW9uRXJyb3IgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9hc3luYy5qcyc7XG5pbXBvcnQgeyBDYW5jZWxsYXRpb25Ub2tlbiB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2NhbmNlbGxhdGlvbi5qcyc7XG5pbXBvcnQgeyBDYW5jZWxsYXRpb25FcnJvciB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2Vycm9ycy5qcyc7XG5pbXBvcnQgeyBEaXNwb3NhYmxlLCBJRGlzcG9zYWJsZSwgdG9EaXNwb3NhYmxlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IFJlc291cmNlTWFwLCBSZXNvdXJjZVNldCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL21hcC5qcyc7XG5pbXBvcnQgeyBTY2hlbWFzIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbmV0d29yay5qcyc7XG5pbXBvcnQgeyByYW5kb21DaGFuY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9udW1iZXJzLmpzJztcbmltcG9ydCB7IFN0b3BXYXRjaCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3N0b3B3YXRjaC5qcyc7XG5pbXBvcnQgeyBpc051bWJlciB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3R5cGVzLmpzJztcbmltcG9ydCB7IFVSSSwgVVJJIGFzIHVyaSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3VyaS5qcyc7XG5pbXBvcnQgeyBJTW9kZWxTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9zZXJ2aWNlcy9tb2RlbC5qcyc7XG5pbXBvcnQgeyBJRmlsZVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9maWxlcy9jb21tb24vZmlsZXMuanMnO1xuaW1wb3J0IHsgSUxvZ1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9sb2cvY29tbW9uL2xvZy5qcyc7XG5pbXBvcnQgeyBJVGVsZW1ldHJ5U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3RlbGVtZXRyeS9jb21tb24vdGVsZW1ldHJ5LmpzJztcbmltcG9ydCB7IElVcmlJZGVudGl0eVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS91cmlJZGVudGl0eS9jb21tb24vdXJpSWRlbnRpdHkuanMnO1xuaW1wb3J0IHsgRWRpdG9yUmVzb3VyY2VBY2Nlc3NvciwgU2lkZUJ5U2lkZUVkaXRvciB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9lZGl0b3IuanMnO1xuaW1wb3J0IHsgSUVkaXRvclNlcnZpY2UgfSBmcm9tICcuLi8uLi9lZGl0b3IvY29tbW9uL2VkaXRvclNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSUV4dGVuc2lvblNlcnZpY2UgfSBmcm9tICcuLi8uLi9leHRlbnNpb25zL2NvbW1vbi9leHRlbnNpb25zLmpzJztcbmltcG9ydCB7IERFRkFVTFRfTUFYX1NFQVJDSF9SRVNVTFRTLCBkZXNlcmlhbGl6ZVNlYXJjaEVycm9yLCBGaWxlTWF0Y2gsIElBSVRleHRRdWVyeSwgSUNhY2hlZFNlYXJjaFN0YXRzLCBJRmlsZU1hdGNoLCBJRmlsZVF1ZXJ5LCBJRmlsZVNlYXJjaFN0YXRzLCBJRm9sZGVyUXVlcnksIElQcm9ncmVzc01lc3NhZ2UsIGlzQUlLZXl3b3JkLCBJU2VhcmNoQ29tcGxldGUsIElTZWFyY2hFbmdpbmVTdGF0cywgSVNlYXJjaFByb2dyZXNzSXRlbSwgSVNlYXJjaFF1ZXJ5LCBJU2VhcmNoUmVzdWx0UHJvdmlkZXIsIElTZWFyY2hTZXJ2aWNlLCBpc0ZpbGVNYXRjaCwgaXNQcm9ncmVzc01lc3NhZ2UsIElUZXh0UXVlcnksIHBhdGhJbmNsdWRlZEluUXVlcnksIFF1ZXJ5VHlwZSwgU0VBUkNIX1JFU1VMVF9MQU5HVUFHRV9JRCwgU2VhcmNoRXJyb3IsIFNlYXJjaEVycm9yQ29kZSwgU2VhcmNoUHJvdmlkZXJUeXBlIH0gZnJvbSAnLi9zZWFyY2guanMnO1xuaW1wb3J0IHsgZ2V0VGV4dFNlYXJjaE1hdGNoV2l0aE1vZGVsQ29udGV4dCwgZWRpdG9yTWF0Y2hlc1RvVGV4dFNlYXJjaFJlc3VsdHMgfSBmcm9tICcuL3NlYXJjaEhlbHBlcnMuanMnO1xuXG5leHBvcnQgY2xhc3MgU2VhcmNoU2VydmljZSBleHRlbmRzIERpc3Bvc2FibGUgaW1wbGVtZW50cyBJU2VhcmNoU2VydmljZSB7XG5cblx0ZGVjbGFyZSByZWFkb25seSBfc2VydmljZUJyYW5kOiB1bmRlZmluZWQ7XG5cblx0cHJpdmF0ZSByZWFkb25seSBmaWxlU2VhcmNoUHJvdmlkZXJzID0gbmV3IE1hcDxzdHJpbmcsIElTZWFyY2hSZXN1bHRQcm92aWRlcj4oKTtcblx0cHJpdmF0ZSByZWFkb25seSB0ZXh0U2VhcmNoUHJvdmlkZXJzID0gbmV3IE1hcDxzdHJpbmcsIElTZWFyY2hSZXN1bHRQcm92aWRlcj4oKTtcblx0cHJpdmF0ZSByZWFkb25seSBhaVRleHRTZWFyY2hQcm92aWRlcnMgPSBuZXcgTWFwPHN0cmluZywgSVNlYXJjaFJlc3VsdFByb3ZpZGVyPigpO1xuXG5cdHByaXZhdGUgZGVmZXJyZWRGaWxlU2VhcmNoZXNCeVNjaGVtZSA9IG5ldyBNYXA8c3RyaW5nLCBEZWZlcnJlZFByb21pc2U8SVNlYXJjaFJlc3VsdFByb3ZpZGVyPj4oKTtcblx0cHJpdmF0ZSBkZWZlcnJlZFRleHRTZWFyY2hlc0J5U2NoZW1lID0gbmV3IE1hcDxzdHJpbmcsIERlZmVycmVkUHJvbWlzZTxJU2VhcmNoUmVzdWx0UHJvdmlkZXI+PigpO1xuXHRwcml2YXRlIGRlZmVycmVkQUlUZXh0U2VhcmNoZXNCeVNjaGVtZSA9IG5ldyBNYXA8c3RyaW5nLCBEZWZlcnJlZFByb21pc2U8SVNlYXJjaFJlc3VsdFByb3ZpZGVyPj4oKTtcblxuXHRwcml2YXRlIGxvZ2dlZFNjaGVtZXNNaXNzaW5nUHJvdmlkZXJzID0gbmV3IFNldDxzdHJpbmc+KCk7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0QElNb2RlbFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBtb2RlbFNlcnZpY2U6IElNb2RlbFNlcnZpY2UsXG5cdFx0QElFZGl0b3JTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgZWRpdG9yU2VydmljZTogSUVkaXRvclNlcnZpY2UsXG5cdFx0QElUZWxlbWV0cnlTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgdGVsZW1ldHJ5U2VydmljZTogSVRlbGVtZXRyeVNlcnZpY2UsXG5cdFx0QElMb2dTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgbG9nU2VydmljZTogSUxvZ1NlcnZpY2UsXG5cdFx0QElFeHRlbnNpb25TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgZXh0ZW5zaW9uU2VydmljZTogSUV4dGVuc2lvblNlcnZpY2UsXG5cdFx0QElGaWxlU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGZpbGVTZXJ2aWNlOiBJRmlsZVNlcnZpY2UsXG5cdFx0QElVcmlJZGVudGl0eVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSB1cmlJZGVudGl0eVNlcnZpY2U6IElVcmlJZGVudGl0eVNlcnZpY2UsXG5cdCkge1xuXHRcdHN1cGVyKCk7XG5cdH1cblxuXHRyZWdpc3RlclNlYXJjaFJlc3VsdFByb3ZpZGVyKHNjaGVtZTogc3RyaW5nLCB0eXBlOiBTZWFyY2hQcm92aWRlclR5cGUsIHByb3ZpZGVyOiBJU2VhcmNoUmVzdWx0UHJvdmlkZXIpOiBJRGlzcG9zYWJsZSB7XG5cdFx0bGV0IGxpc3Q6IE1hcDxzdHJpbmcsIElTZWFyY2hSZXN1bHRQcm92aWRlcj47XG5cdFx0bGV0IGRlZmVycmVkTWFwOiBNYXA8c3RyaW5nLCBEZWZlcnJlZFByb21pc2U8SVNlYXJjaFJlc3VsdFByb3ZpZGVyPj47XG5cdFx0aWYgKHR5cGUgPT09IFNlYXJjaFByb3ZpZGVyVHlwZS5maWxlKSB7XG5cdFx0XHRsaXN0ID0gdGhpcy5maWxlU2VhcmNoUHJvdmlkZXJzO1xuXHRcdFx0ZGVmZXJyZWRNYXAgPSB0aGlzLmRlZmVycmVkRmlsZVNlYXJjaGVzQnlTY2hlbWU7XG5cdFx0fSBlbHNlIGlmICh0eXBlID09PSBTZWFyY2hQcm92aWRlclR5cGUudGV4dCkge1xuXHRcdFx0bGlzdCA9IHRoaXMudGV4dFNlYXJjaFByb3ZpZGVycztcblx0XHRcdGRlZmVycmVkTWFwID0gdGhpcy5kZWZlcnJlZFRleHRTZWFyY2hlc0J5U2NoZW1lO1xuXHRcdH0gZWxzZSBpZiAodHlwZSA9PT0gU2VhcmNoUHJvdmlkZXJUeXBlLmFpVGV4dCkge1xuXHRcdFx0bGlzdCA9IHRoaXMuYWlUZXh0U2VhcmNoUHJvdmlkZXJzO1xuXHRcdFx0ZGVmZXJyZWRNYXAgPSB0aGlzLmRlZmVycmVkQUlUZXh0U2VhcmNoZXNCeVNjaGVtZTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0dGhyb3cgbmV3IEVycm9yKCdVbmtub3duIFNlYXJjaFByb3ZpZGVyVHlwZScpO1xuXHRcdH1cblxuXHRcdGxpc3Quc2V0KHNjaGVtZSwgcHJvdmlkZXIpO1xuXG5cdFx0aWYgKGRlZmVycmVkTWFwLmhhcyhzY2hlbWUpKSB7XG5cdFx0XHRkZWZlcnJlZE1hcC5nZXQoc2NoZW1lKSEuY29tcGxldGUocHJvdmlkZXIpO1xuXHRcdFx0ZGVmZXJyZWRNYXAuZGVsZXRlKHNjaGVtZSk7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHRvRGlzcG9zYWJsZSgoKSA9PiB7XG5cdFx0XHRsaXN0LmRlbGV0ZShzY2hlbWUpO1xuXHRcdH0pO1xuXHR9XG5cblx0YXN5bmMgdGV4dFNlYXJjaChxdWVyeTogSVRleHRRdWVyeSwgdG9rZW4/OiBDYW5jZWxsYXRpb25Ub2tlbiwgb25Qcm9ncmVzcz86IChpdGVtOiBJU2VhcmNoUHJvZ3Jlc3NJdGVtKSA9PiB2b2lkKTogUHJvbWlzZTxJU2VhcmNoQ29tcGxldGU+IHtcblx0XHRjb25zdCByZXN1bHRzID0gdGhpcy50ZXh0U2VhcmNoU3BsaXRTeW5jQXN5bmMocXVlcnksIHRva2VuLCBvblByb2dyZXNzKTtcblx0XHRjb25zdCBvcGVuRWRpdG9yUmVzdWx0cyA9IHJlc3VsdHMuc3luY1Jlc3VsdHM7XG5cdFx0Y29uc3Qgb3RoZXJSZXN1bHRzID0gYXdhaXQgcmVzdWx0cy5hc3luY1Jlc3VsdHM7XG5cdFx0cmV0dXJuIHtcblx0XHRcdGxpbWl0SGl0OiBvdGhlclJlc3VsdHMubGltaXRIaXQgfHwgb3BlbkVkaXRvclJlc3VsdHMubGltaXRIaXQsXG5cdFx0XHRyZXN1bHRzOiBbLi4ub3RoZXJSZXN1bHRzLnJlc3VsdHMsIC4uLm9wZW5FZGl0b3JSZXN1bHRzLnJlc3VsdHNdLFxuXHRcdFx0bWVzc2FnZXM6IFsuLi5vdGhlclJlc3VsdHMubWVzc2FnZXMsIC4uLm9wZW5FZGl0b3JSZXN1bHRzLm1lc3NhZ2VzXVxuXHRcdH07XG5cdH1cblxuXHRhc3luYyBhaVRleHRTZWFyY2gocXVlcnk6IElBSVRleHRRdWVyeSwgdG9rZW4/OiBDYW5jZWxsYXRpb25Ub2tlbiwgb25Qcm9ncmVzcz86IChpdGVtOiBJU2VhcmNoUHJvZ3Jlc3NJdGVtKSA9PiB2b2lkKTogUHJvbWlzZTxJU2VhcmNoQ29tcGxldGU+IHtcblx0XHRjb25zdCBvblByb3ZpZGVyUHJvZ3Jlc3MgPSAocHJvZ3Jlc3M6IElTZWFyY2hQcm9ncmVzc0l0ZW0pID0+IHtcblx0XHRcdC8vIE1hdGNoXG5cdFx0XHRpZiAob25Qcm9ncmVzcykgeyAvLyBkb24ndCBvdmVycmlkZSBvcGVuIGVkaXRvciByZXN1bHRzXG5cdFx0XHRcdGlmIChpc0ZpbGVNYXRjaChwcm9ncmVzcykgfHwgaXNBSUtleXdvcmQocHJvZ3Jlc3MpKSB7XG5cdFx0XHRcdFx0b25Qcm9ncmVzcyhwcm9ncmVzcyk7XG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0b25Qcm9ncmVzcyg8SVByb2dyZXNzTWVzc2FnZT5wcm9ncmVzcyk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblxuXHRcdFx0aWYgKGlzUHJvZ3Jlc3NNZXNzYWdlKHByb2dyZXNzKSkge1xuXHRcdFx0XHR0aGlzLmxvZ1NlcnZpY2UuZGVidWcoJ1NlYXJjaFNlcnZpY2Ujc2VhcmNoJywgcHJvZ3Jlc3MubWVzc2FnZSk7XG5cdFx0XHR9XG5cdFx0fTtcblx0XHRyZXR1cm4gdGhpcy5kb1NlYXJjaChxdWVyeSwgdG9rZW4sIG9uUHJvdmlkZXJQcm9ncmVzcyk7XG5cdH1cblxuXHRhc3luYyBnZXRBSU5hbWUoKTogUHJvbWlzZTxzdHJpbmcgfCB1bmRlZmluZWQ+IHtcblx0XHRjb25zdCBwcm92aWRlciA9IHRoaXMuZ2V0U2VhcmNoUHJvdmlkZXIoUXVlcnlUeXBlLmFpVGV4dCkuZ2V0KFNjaGVtYXMuZmlsZSk7XG5cdFx0cmV0dXJuIGF3YWl0IHByb3ZpZGVyPy5nZXRBSU5hbWUoKTtcblx0fVxuXG5cdHRleHRTZWFyY2hTcGxpdFN5bmNBc3luYyhcblx0XHRxdWVyeTogSVRleHRRdWVyeSxcblx0XHR0b2tlbj86IENhbmNlbGxhdGlvblRva2VuIHwgdW5kZWZpbmVkLFxuXHRcdG9uUHJvZ3Jlc3M/OiAoKHJlc3VsdDogSVNlYXJjaFByb2dyZXNzSXRlbSkgPT4gdm9pZCkgfCB1bmRlZmluZWQsXG5cdFx0bm90ZWJvb2tGaWxlc1RvSWdub3JlPzogUmVzb3VyY2VTZXQsXG5cdFx0YXN5bmNOb3RlYm9va0ZpbGVzVG9JZ25vcmU/OiBQcm9taXNlPFJlc291cmNlU2V0PlxuXHQpOiB7XG5cdFx0c3luY1Jlc3VsdHM6IElTZWFyY2hDb21wbGV0ZTtcblx0XHRhc3luY1Jlc3VsdHM6IFByb21pc2U8SVNlYXJjaENvbXBsZXRlPjtcblx0fSB7XG5cdFx0Ly8gR2V0IG9wZW4gZWRpdG9yIHJlc3VsdHMgZnJvbSBkaXJ0eS91bnRpdGxlZFxuXHRcdGNvbnN0IG9wZW5FZGl0b3JSZXN1bHRzID0gdGhpcy5nZXRPcGVuRWRpdG9yUmVzdWx0cyhxdWVyeSk7XG5cblx0XHRpZiAob25Qcm9ncmVzcykge1xuXHRcdFx0YXJyYXlzLmNvYWxlc2NlKFsuLi5vcGVuRWRpdG9yUmVzdWx0cy5yZXN1bHRzLnZhbHVlcygpXSkuZmlsdGVyKGUgPT4gIShub3RlYm9va0ZpbGVzVG9JZ25vcmUgJiYgbm90ZWJvb2tGaWxlc1RvSWdub3JlLmhhcyhlLnJlc291cmNlKSkpLmZvckVhY2gob25Qcm9ncmVzcyk7XG5cdFx0fVxuXG5cdFx0Y29uc3Qgc3luY1Jlc3VsdHM6IElTZWFyY2hDb21wbGV0ZSA9IHtcblx0XHRcdHJlc3VsdHM6IGFycmF5cy5jb2FsZXNjZShbLi4ub3BlbkVkaXRvclJlc3VsdHMucmVzdWx0cy52YWx1ZXMoKV0pLFxuXHRcdFx0bGltaXRIaXQ6IG9wZW5FZGl0b3JSZXN1bHRzLmxpbWl0SGl0ID8/IGZhbHNlLFxuXHRcdFx0bWVzc2FnZXM6IFtdXG5cdFx0fTtcblxuXHRcdGNvbnN0IGdldEFzeW5jUmVzdWx0cyA9IGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IHJlc29sdmVkQXN5bmNOb3RlYm9va0ZpbGVzVG9JZ25vcmUgPSBhd2FpdCBhc3luY05vdGVib29rRmlsZXNUb0lnbm9yZSA/PyBuZXcgUmVzb3VyY2VTZXQoKTtcblx0XHRcdGNvbnN0IG9uUHJvdmlkZXJQcm9ncmVzcyA9IChwcm9ncmVzczogSVNlYXJjaFByb2dyZXNzSXRlbSkgPT4ge1xuXHRcdFx0XHRpZiAoaXNGaWxlTWF0Y2gocHJvZ3Jlc3MpKSB7XG5cdFx0XHRcdFx0Ly8gTWF0Y2hcblx0XHRcdFx0XHRpZiAoIW9wZW5FZGl0b3JSZXN1bHRzLnJlc3VsdHMuaGFzKHByb2dyZXNzLnJlc291cmNlKSAmJiAhcmVzb2x2ZWRBc3luY05vdGVib29rRmlsZXNUb0lnbm9yZS5oYXMocHJvZ3Jlc3MucmVzb3VyY2UpICYmIG9uUHJvZ3Jlc3MpIHsgLy8gZG9uJ3Qgb3ZlcnJpZGUgb3BlbiBlZGl0b3IgcmVzdWx0c1xuXHRcdFx0XHRcdFx0b25Qcm9ncmVzcyhwcm9ncmVzcyk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9IGVsc2UgaWYgKG9uUHJvZ3Jlc3MpIHtcblx0XHRcdFx0XHQvLyBQcm9ncmVzc1xuXHRcdFx0XHRcdG9uUHJvZ3Jlc3MoPElQcm9ncmVzc01lc3NhZ2U+cHJvZ3Jlc3MpO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0aWYgKGlzUHJvZ3Jlc3NNZXNzYWdlKHByb2dyZXNzKSkge1xuXHRcdFx0XHRcdHRoaXMubG9nU2VydmljZS5kZWJ1ZygnU2VhcmNoU2VydmljZSNzZWFyY2gnLCBwcm9ncmVzcy5tZXNzYWdlKTtcblx0XHRcdFx0fVxuXHRcdFx0fTtcblx0XHRcdHJldHVybiBhd2FpdCB0aGlzLmRvU2VhcmNoKHF1ZXJ5LCB0b2tlbiwgb25Qcm92aWRlclByb2dyZXNzKTtcblx0XHR9O1xuXG5cdFx0cmV0dXJuIHtcblx0XHRcdHN5bmNSZXN1bHRzLFxuXHRcdFx0YXN5bmNSZXN1bHRzOiBnZXRBc3luY1Jlc3VsdHMoKVxuXHRcdH07XG5cdH1cblxuXHRmaWxlU2VhcmNoKHF1ZXJ5OiBJRmlsZVF1ZXJ5LCB0b2tlbj86IENhbmNlbGxhdGlvblRva2VuKTogUHJvbWlzZTxJU2VhcmNoQ29tcGxldGU+IHtcblx0XHRyZXR1cm4gdGhpcy5kb1NlYXJjaChxdWVyeSwgdG9rZW4pO1xuXHR9XG5cblx0c2NoZW1lSGFzRmlsZVNlYXJjaFByb3ZpZGVyKHNjaGVtZTogc3RyaW5nKTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuIHRoaXMuZmlsZVNlYXJjaFByb3ZpZGVycy5oYXMoc2NoZW1lKTtcblx0fVxuXG5cdHByaXZhdGUgZG9TZWFyY2gocXVlcnk6IElTZWFyY2hRdWVyeSwgdG9rZW4/OiBDYW5jZWxsYXRpb25Ub2tlbiwgb25Qcm9ncmVzcz86IChpdGVtOiBJU2VhcmNoUHJvZ3Jlc3NJdGVtKSA9PiB2b2lkKTogUHJvbWlzZTxJU2VhcmNoQ29tcGxldGU+IHtcblx0XHR0aGlzLmxvZ1NlcnZpY2UudHJhY2UoJ1NlYXJjaFNlcnZpY2Ujc2VhcmNoJywgSlNPTi5zdHJpbmdpZnkocXVlcnkpKTtcblxuXHRcdGNvbnN0IHNjaGVtZXNJblF1ZXJ5ID0gdGhpcy5nZXRTY2hlbWVzSW5RdWVyeShxdWVyeSk7XG5cblx0XHRjb25zdCBwcm92aWRlckFjdGl2YXRpb25zOiBQcm9taXNlPHVua25vd24+W10gPSBbUHJvbWlzZS5yZXNvbHZlKG51bGwpXTtcblx0XHRzY2hlbWVzSW5RdWVyeS5mb3JFYWNoKHNjaGVtZSA9PiBwcm92aWRlckFjdGl2YXRpb25zLnB1c2godGhpcy5leHRlbnNpb25TZXJ2aWNlLmFjdGl2YXRlQnlFdmVudChgb25TZWFyY2g6JHtzY2hlbWV9YCkpKTtcblx0XHRwcm92aWRlckFjdGl2YXRpb25zLnB1c2godGhpcy5leHRlbnNpb25TZXJ2aWNlLmFjdGl2YXRlQnlFdmVudCgnb25TZWFyY2g6ZmlsZScpKTtcblxuXHRcdGNvbnN0IHByb3ZpZGVyUHJvbWlzZSA9IChhc3luYyAoKSA9PiB7XG5cdFx0XHRhd2FpdCBQcm9taXNlLmFsbChwcm92aWRlckFjdGl2YXRpb25zKTtcblx0XHRcdGF3YWl0IHRoaXMuZXh0ZW5zaW9uU2VydmljZS53aGVuSW5zdGFsbGVkRXh0ZW5zaW9uc1JlZ2lzdGVyZWQoKTtcblxuXHRcdFx0Ly8gQ2FuY2VsIGZhc3RlciBpZiBzZWFyY2ggd2FzIGNhbmNlbGVkIHdoaWxlIHdhaXRpbmcgZm9yIGV4dGVuc2lvbnNcblx0XHRcdGlmICh0b2tlbiAmJiB0b2tlbi5pc0NhbmNlbGxhdGlvblJlcXVlc3RlZCkge1xuXHRcdFx0XHRyZXR1cm4gUHJvbWlzZS5yZWplY3QobmV3IENhbmNlbGxhdGlvbkVycm9yKCkpO1xuXHRcdFx0fVxuXG5cdFx0XHRjb25zdCBwcm9ncmVzc0NhbGxiYWNrID0gKGl0ZW06IElTZWFyY2hQcm9ncmVzc0l0ZW0pID0+IHtcblx0XHRcdFx0aWYgKHRva2VuICYmIHRva2VuLmlzQ2FuY2VsbGF0aW9uUmVxdWVzdGVkKSB7XG5cdFx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0b25Qcm9ncmVzcz8uKGl0ZW0pO1xuXHRcdFx0fTtcblxuXHRcdFx0Y29uc3QgZXhpc3RzID0gYXdhaXQgUHJvbWlzZS5hbGwocXVlcnkuZm9sZGVyUXVlcmllcy5tYXAocXVlcnkgPT4gdGhpcy5maWxlU2VydmljZS5leGlzdHMocXVlcnkuZm9sZGVyKSkpO1xuXHRcdFx0cXVlcnkuZm9sZGVyUXVlcmllcyA9IHF1ZXJ5LmZvbGRlclF1ZXJpZXMuZmlsdGVyKChfLCBpKSA9PiBleGlzdHNbaV0pO1xuXG5cdFx0XHRsZXQgY29tcGxldGVzID0gYXdhaXQgdGhpcy5zZWFyY2hXaXRoUHJvdmlkZXJzKHF1ZXJ5LCBwcm9ncmVzc0NhbGxiYWNrLCB0b2tlbik7XG5cdFx0XHRjb21wbGV0ZXMgPSBhcnJheXMuY29hbGVzY2UoY29tcGxldGVzKTtcblx0XHRcdGlmICghY29tcGxldGVzLmxlbmd0aCkge1xuXHRcdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRcdGxpbWl0SGl0OiBmYWxzZSxcblx0XHRcdFx0XHRyZXN1bHRzOiBbXSxcblx0XHRcdFx0XHRtZXNzYWdlczogW10sXG5cdFx0XHRcdH07XG5cdFx0XHR9XG5cblx0XHRcdHJldHVybiB7XG5cdFx0XHRcdGxpbWl0SGl0OiBjb21wbGV0ZXNbMF0gJiYgY29tcGxldGVzWzBdLmxpbWl0SGl0LFxuXHRcdFx0XHRzdGF0czogY29tcGxldGVzWzBdLnN0YXRzLFxuXHRcdFx0XHRtZXNzYWdlczogYXJyYXlzLmNvYWxlc2NlKGNvbXBsZXRlcy5mbGF0TWFwKGkgPT4gaS5tZXNzYWdlcykpLmZpbHRlcihhcnJheXMudW5pcXVlRmlsdGVyKG1lc3NhZ2UgPT4gbWVzc2FnZS50eXBlICsgbWVzc2FnZS50ZXh0ICsgbWVzc2FnZS50cnVzdGVkKSksXG5cdFx0XHRcdHJlc3VsdHM6IGNvbXBsZXRlcy5mbGF0TWFwKChjOiBJU2VhcmNoQ29tcGxldGUpID0+IGMucmVzdWx0cyksXG5cdFx0XHRcdGFpS2V5d29yZHM6IGNvbXBsZXRlcy5mbGF0TWFwKChjOiBJU2VhcmNoQ29tcGxldGUpID0+IGMuYWlLZXl3b3JkcykuZmlsdGVyKGtleXdvcmQgPT4ga2V5d29yZCAhPT0gdW5kZWZpbmVkKSxcblx0XHRcdH07XG5cdFx0fSkoKTtcblxuXHRcdHJldHVybiB0b2tlbiA/IHJhY2VDYW5jZWxsYXRpb25FcnJvcjxJU2VhcmNoQ29tcGxldGU+KHByb3ZpZGVyUHJvbWlzZSwgdG9rZW4pIDogcHJvdmlkZXJQcm9taXNlO1xuXHR9XG5cblx0cHJpdmF0ZSBnZXRTY2hlbWVzSW5RdWVyeShxdWVyeTogSVNlYXJjaFF1ZXJ5KTogU2V0PHN0cmluZz4ge1xuXHRcdGNvbnN0IHNjaGVtZXMgPSBuZXcgU2V0PHN0cmluZz4oKTtcblx0XHRxdWVyeS5mb2xkZXJRdWVyaWVzPy5mb3JFYWNoKGZxID0+IHNjaGVtZXMuYWRkKGZxLmZvbGRlci5zY2hlbWUpKTtcblxuXHRcdHF1ZXJ5LmV4dHJhRmlsZVJlc291cmNlcz8uZm9yRWFjaChleHRyYUZpbGUgPT4gc2NoZW1lcy5hZGQoZXh0cmFGaWxlLnNjaGVtZSkpO1xuXG5cdFx0cmV0dXJuIHNjaGVtZXM7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIHdhaXRGb3JQcm92aWRlcihxdWVyeVR5cGU6IFF1ZXJ5VHlwZSwgc2NoZW1lOiBzdHJpbmcpOiBQcm9taXNlPElTZWFyY2hSZXN1bHRQcm92aWRlcj4ge1xuXHRcdGNvbnN0IGRlZmVycmVkTWFwOiBNYXA8c3RyaW5nLCBEZWZlcnJlZFByb21pc2U8SVNlYXJjaFJlc3VsdFByb3ZpZGVyPj4gPSB0aGlzLmdldERlZmVycmVkVGV4dFNlYXJjaGVzQnlTY2hlbWUocXVlcnlUeXBlKTtcblxuXHRcdGlmIChkZWZlcnJlZE1hcC5oYXMoc2NoZW1lKSkge1xuXHRcdFx0cmV0dXJuIGRlZmVycmVkTWFwLmdldChzY2hlbWUpIS5wO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRjb25zdCBkZWZlcnJlZCA9IG5ldyBEZWZlcnJlZFByb21pc2U8SVNlYXJjaFJlc3VsdFByb3ZpZGVyPigpO1xuXHRcdFx0ZGVmZXJyZWRNYXAuc2V0KHNjaGVtZSwgZGVmZXJyZWQpO1xuXHRcdFx0cmV0dXJuIGRlZmVycmVkLnA7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBnZXRTZWFyY2hQcm92aWRlcih0eXBlOiBRdWVyeVR5cGUpOiBNYXA8c3RyaW5nLCBJU2VhcmNoUmVzdWx0UHJvdmlkZXI+IHtcblx0XHRzd2l0Y2ggKHR5cGUpIHtcblx0XHRcdGNhc2UgUXVlcnlUeXBlLkZpbGU6XG5cdFx0XHRcdHJldHVybiB0aGlzLmZpbGVTZWFyY2hQcm92aWRlcnM7XG5cdFx0XHRjYXNlIFF1ZXJ5VHlwZS5UZXh0OlxuXHRcdFx0XHRyZXR1cm4gdGhpcy50ZXh0U2VhcmNoUHJvdmlkZXJzO1xuXHRcdFx0Y2FzZSBRdWVyeVR5cGUuYWlUZXh0OlxuXHRcdFx0XHRyZXR1cm4gdGhpcy5haVRleHRTZWFyY2hQcm92aWRlcnM7XG5cdFx0XHRkZWZhdWx0OlxuXHRcdFx0XHR0aHJvdyBuZXcgRXJyb3IoYFVua25vd24gcXVlcnkgdHlwZTogJHt0eXBlfWApO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgZ2V0RGVmZXJyZWRUZXh0U2VhcmNoZXNCeVNjaGVtZSh0eXBlOiBRdWVyeVR5cGUpOiBNYXA8c3RyaW5nLCBEZWZlcnJlZFByb21pc2U8SVNlYXJjaFJlc3VsdFByb3ZpZGVyPj4ge1xuXHRcdHN3aXRjaCAodHlwZSkge1xuXHRcdFx0Y2FzZSBRdWVyeVR5cGUuRmlsZTpcblx0XHRcdFx0cmV0dXJuIHRoaXMuZGVmZXJyZWRGaWxlU2VhcmNoZXNCeVNjaGVtZTtcblx0XHRcdGNhc2UgUXVlcnlUeXBlLlRleHQ6XG5cdFx0XHRcdHJldHVybiB0aGlzLmRlZmVycmVkVGV4dFNlYXJjaGVzQnlTY2hlbWU7XG5cdFx0XHRjYXNlIFF1ZXJ5VHlwZS5haVRleHQ6XG5cdFx0XHRcdHJldHVybiB0aGlzLmRlZmVycmVkQUlUZXh0U2VhcmNoZXNCeVNjaGVtZTtcblx0XHRcdGRlZmF1bHQ6XG5cdFx0XHRcdHRocm93IG5ldyBFcnJvcihgVW5rbm93biBxdWVyeSB0eXBlOiAke3R5cGV9YCk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBzZWFyY2hXaXRoUHJvdmlkZXJzKHF1ZXJ5OiBJU2VhcmNoUXVlcnksIG9uUHJvdmlkZXJQcm9ncmVzczogKHByb2dyZXNzOiBJU2VhcmNoUHJvZ3Jlc3NJdGVtKSA9PiB2b2lkLCB0b2tlbj86IENhbmNlbGxhdGlvblRva2VuKSB7XG5cdFx0Y29uc3QgZTJlU1cgPSBTdG9wV2F0Y2guY3JlYXRlKGZhbHNlKTtcblxuXHRcdGNvbnN0IHNlYXJjaFBzOiBQcm9taXNlPElTZWFyY2hDb21wbGV0ZT5bXSA9IFtdO1xuXG5cdFx0Y29uc3QgZnFzID0gdGhpcy5ncm91cEZvbGRlclF1ZXJpZXNCeVNjaGVtZShxdWVyeSk7XG5cdFx0Y29uc3Qgc29tZVNjaGVtZUhhc1Byb3ZpZGVyID0gWy4uLmZxcy5rZXlzKCldLnNvbWUoc2NoZW1lID0+IHtcblx0XHRcdHJldHVybiB0aGlzLmdldFNlYXJjaFByb3ZpZGVyKHF1ZXJ5LnR5cGUpLmhhcyhzY2hlbWUpO1xuXHRcdH0pO1xuXG5cdFx0YXdhaXQgUHJvbWlzZS5hbGwoWy4uLmZxcy5rZXlzKCldLm1hcChhc3luYyBzY2hlbWUgPT4ge1xuXHRcdFx0aWYgKHF1ZXJ5Lm9ubHlGaWxlU2NoZW1lICYmIHNjaGVtZSAhPT0gU2NoZW1hcy5maWxlKSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblx0XHRcdGNvbnN0IHNjaGVtZUZRcyA9IGZxcy5nZXQoc2NoZW1lKSE7XG5cdFx0XHRsZXQgcHJvdmlkZXIgPSB0aGlzLmdldFNlYXJjaFByb3ZpZGVyKHF1ZXJ5LnR5cGUpLmdldChzY2hlbWUpO1xuXG5cdFx0XHRpZiAoIXByb3ZpZGVyKSB7XG5cdFx0XHRcdGlmIChzb21lU2NoZW1lSGFzUHJvdmlkZXIpIHtcblx0XHRcdFx0XHRpZiAoIXRoaXMubG9nZ2VkU2NoZW1lc01pc3NpbmdQcm92aWRlcnMuaGFzKHNjaGVtZSkpIHtcblx0XHRcdFx0XHRcdHRoaXMubG9nU2VydmljZS53YXJuKGBObyBzZWFyY2ggcHJvdmlkZXIgcmVnaXN0ZXJlZCBmb3Igc2NoZW1lOiAke3NjaGVtZX0uIEFub3RoZXIgc2NoZW1lIGhhcyBhIHByb3ZpZGVyLCBub3Qgd2FpdGluZyBmb3IgJHtzY2hlbWV9YCk7XG5cdFx0XHRcdFx0XHR0aGlzLmxvZ2dlZFNjaGVtZXNNaXNzaW5nUHJvdmlkZXJzLmFkZChzY2hlbWUpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRyZXR1cm47XG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0aWYgKCF0aGlzLmxvZ2dlZFNjaGVtZXNNaXNzaW5nUHJvdmlkZXJzLmhhcyhzY2hlbWUpKSB7XG5cdFx0XHRcdFx0XHR0aGlzLmxvZ1NlcnZpY2Uud2FybihgTm8gc2VhcmNoIHByb3ZpZGVyIHJlZ2lzdGVyZWQgZm9yIHNjaGVtZTogJHtzY2hlbWV9LCB3YWl0aW5nYCk7XG5cdFx0XHRcdFx0XHR0aGlzLmxvZ2dlZFNjaGVtZXNNaXNzaW5nUHJvdmlkZXJzLmFkZChzY2hlbWUpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRwcm92aWRlciA9IGF3YWl0IHRoaXMud2FpdEZvclByb3ZpZGVyKHF1ZXJ5LnR5cGUsIHNjaGVtZSk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblxuXHRcdFx0Y29uc3Qgb25lU2NoZW1lUXVlcnk6IElTZWFyY2hRdWVyeSA9IHtcblx0XHRcdFx0Li4ucXVlcnksXG5cdFx0XHRcdC4uLntcblx0XHRcdFx0XHRmb2xkZXJRdWVyaWVzOiBzY2hlbWVGUXNcblx0XHRcdFx0fVxuXHRcdFx0fTtcblxuXHRcdFx0Y29uc3QgZG9Qcm92aWRlclNlYXJjaCA9ICgpID0+IHtcblx0XHRcdFx0c3dpdGNoIChxdWVyeS50eXBlKSB7XG5cdFx0XHRcdFx0Y2FzZSBRdWVyeVR5cGUuRmlsZTpcblx0XHRcdFx0XHRcdHJldHVybiBwcm92aWRlci5maWxlU2VhcmNoKDxJRmlsZVF1ZXJ5Pm9uZVNjaGVtZVF1ZXJ5LCB0b2tlbik7XG5cdFx0XHRcdFx0Y2FzZSBRdWVyeVR5cGUuVGV4dDpcblx0XHRcdFx0XHRcdHJldHVybiBwcm92aWRlci50ZXh0U2VhcmNoKDxJVGV4dFF1ZXJ5Pm9uZVNjaGVtZVF1ZXJ5LCBvblByb3ZpZGVyUHJvZ3Jlc3MsIHRva2VuKTtcblx0XHRcdFx0XHRkZWZhdWx0OlxuXHRcdFx0XHRcdFx0cmV0dXJuIHByb3ZpZGVyLnRleHRTZWFyY2goPElUZXh0UXVlcnk+b25lU2NoZW1lUXVlcnksIG9uUHJvdmlkZXJQcm9ncmVzcywgdG9rZW4pO1xuXHRcdFx0XHR9XG5cdFx0XHR9O1xuXG5cdFx0XHRzZWFyY2hQcy5wdXNoKGRvUHJvdmlkZXJTZWFyY2goKSk7XG5cdFx0fSkpO1xuXG5cdFx0cmV0dXJuIFByb21pc2UuYWxsKHNlYXJjaFBzKS50aGVuKGNvbXBsZXRlcyA9PiB7XG5cdFx0XHRjb25zdCBlbmRUb0VuZFRpbWUgPSBlMmVTVy5lbGFwc2VkKCk7XG5cdFx0XHR0aGlzLmxvZ1NlcnZpY2UudHJhY2UoYFNlYXJjaFNlcnZpY2Ujc2VhcmNoOiAke2VuZFRvRW5kVGltZX1tc2ApO1xuXHRcdFx0Y29tcGxldGVzLmZvckVhY2goY29tcGxldGUgPT4ge1xuXHRcdFx0XHR0aGlzLnNlbmRUZWxlbWV0cnkocXVlcnksIGVuZFRvRW5kVGltZSwgY29tcGxldGUpO1xuXHRcdFx0fSk7XG5cdFx0XHRyZXR1cm4gY29tcGxldGVzO1xuXHRcdH0sIGVyciA9PiB7XG5cdFx0XHRjb25zdCBlbmRUb0VuZFRpbWUgPSBlMmVTVy5lbGFwc2VkKCk7XG5cdFx0XHR0aGlzLmxvZ1NlcnZpY2UudHJhY2UoYFNlYXJjaFNlcnZpY2Ujc2VhcmNoOiAke2VuZFRvRW5kVGltZX1tc2ApO1xuXHRcdFx0Y29uc3Qgc2VhcmNoRXJyb3IgPSBkZXNlcmlhbGl6ZVNlYXJjaEVycm9yKGVycik7XG5cdFx0XHR0aGlzLmxvZ1NlcnZpY2UudHJhY2UoYFNlYXJjaFNlcnZpY2Ujc2VhcmNoRXJyb3I6ICR7c2VhcmNoRXJyb3IubWVzc2FnZX1gKTtcblx0XHRcdHRoaXMuc2VuZFRlbGVtZXRyeShxdWVyeSwgZW5kVG9FbmRUaW1lLCB1bmRlZmluZWQsIHNlYXJjaEVycm9yKTtcblxuXHRcdFx0dGhyb3cgc2VhcmNoRXJyb3I7XG5cdFx0fSk7XG5cdH1cblxuXHRwcml2YXRlIGdyb3VwRm9sZGVyUXVlcmllc0J5U2NoZW1lKHF1ZXJ5OiBJU2VhcmNoUXVlcnkpOiBNYXA8c3RyaW5nLCBJRm9sZGVyUXVlcnlbXT4ge1xuXHRcdGNvbnN0IHF1ZXJpZXMgPSBuZXcgTWFwPHN0cmluZywgSUZvbGRlclF1ZXJ5W10+KCk7XG5cblx0XHRxdWVyeS5mb2xkZXJRdWVyaWVzLmZvckVhY2goZnEgPT4ge1xuXHRcdFx0Y29uc3Qgc2NoZW1lRlFzID0gcXVlcmllcy5nZXQoZnEuZm9sZGVyLnNjaGVtZSkgfHwgW107XG5cdFx0XHRzY2hlbWVGUXMucHVzaChmcSk7XG5cblx0XHRcdHF1ZXJpZXMuc2V0KGZxLmZvbGRlci5zY2hlbWUsIHNjaGVtZUZRcyk7XG5cdFx0fSk7XG5cblx0XHRyZXR1cm4gcXVlcmllcztcblx0fVxuXG5cdHByaXZhdGUgc2VuZFRlbGVtZXRyeShxdWVyeTogSVNlYXJjaFF1ZXJ5LCBlbmRUb0VuZFRpbWU6IG51bWJlciwgY29tcGxldGU/OiBJU2VhcmNoQ29tcGxldGUsIGVycj86IFNlYXJjaEVycm9yKTogdm9pZCB7XG5cdFx0aWYgKCFyYW5kb21DaGFuY2UoNSAvIDEwMCkpIHtcblx0XHRcdC8vIE5vaXN5IGV2ZW50cywgb25seSBzZW5kIDUlIG9mIHRoZW1cblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCBmaWxlU2NoZW1lT25seSA9IHF1ZXJ5LmZvbGRlclF1ZXJpZXMuZXZlcnkoZnEgPT4gZnEuZm9sZGVyLnNjaGVtZSA9PT0gU2NoZW1hcy5maWxlKTtcblx0XHRjb25zdCBvdGhlclNjaGVtZU9ubHkgPSBxdWVyeS5mb2xkZXJRdWVyaWVzLmV2ZXJ5KGZxID0+IGZxLmZvbGRlci5zY2hlbWUgIT09IFNjaGVtYXMuZmlsZSk7XG5cdFx0Y29uc3Qgc2NoZW1lID0gZmlsZVNjaGVtZU9ubHkgPyBTY2hlbWFzLmZpbGUgOlxuXHRcdFx0b3RoZXJTY2hlbWVPbmx5ID8gJ290aGVyJyA6XG5cdFx0XHRcdCdtaXhlZCc7XG5cblx0XHRpZiAocXVlcnkudHlwZSA9PT0gUXVlcnlUeXBlLkZpbGUgJiYgY29tcGxldGUgJiYgY29tcGxldGUuc3RhdHMpIHtcblx0XHRcdGNvbnN0IGZpbGVTZWFyY2hTdGF0cyA9IGNvbXBsZXRlLnN0YXRzIGFzIElGaWxlU2VhcmNoU3RhdHM7XG5cdFx0XHRpZiAoZmlsZVNlYXJjaFN0YXRzLmZyb21DYWNoZSkge1xuXHRcdFx0XHRjb25zdCBjYWNoZVN0YXRzOiBJQ2FjaGVkU2VhcmNoU3RhdHMgPSBmaWxlU2VhcmNoU3RhdHMuZGV0YWlsU3RhdHMgYXMgSUNhY2hlZFNlYXJjaFN0YXRzO1xuXG5cdFx0XHRcdHR5cGUgQ2FjaGVkU2VhcmNoQ29tcGxldGVDbGFzc2lmY2F0aW9uID0ge1xuXHRcdFx0XHRcdG93bmVyOiAncm9ibG91cmVucyc7XG5cdFx0XHRcdFx0Y29tbWVudDogJ0ZpcmVkIHdoZW4gYSBmaWxlIHNlYXJjaCBpcyBjb21wbGV0ZWQgZnJvbSBwcmV2aW91c2x5IGNhY2hlZCByZXN1bHRzJztcblx0XHRcdFx0XHRyZWFzb24/OiB7IGNsYXNzaWZpY2F0aW9uOiAnU3lzdGVtTWV0YURhdGEnOyBwdXJwb3NlOiAnUGVyZm9ybWFuY2VBbmRIZWFsdGgnOyBjb21tZW50OiAnSW5kaWNhdGVzIHdoaWNoIGV4dGVuc2lvbiBvciBVSSBmZWF0dXJlIHRyaWdnZXJlZCB0aGlzIHNlYXJjaCcgfTtcblx0XHRcdFx0XHRyZXN1bHRDb3VudDogeyBjbGFzc2lmaWNhdGlvbjogJ1N5c3RlbU1ldGFEYXRhJzsgcHVycG9zZTogJ1BlcmZvcm1hbmNlQW5kSGVhbHRoJzsgY29tbWVudDogJ1RoZSBudW1iZXIgb2Ygc2VhcmNoIHJlc3VsdHMnIH07XG5cdFx0XHRcdFx0d29ya3NwYWNlRm9sZGVyQ291bnQ6IHsgY2xhc3NpZmljYXRpb246ICdTeXN0ZW1NZXRhRGF0YSc7IHB1cnBvc2U6ICdQZXJmb3JtYW5jZUFuZEhlYWx0aCc7IGNvbW1lbnQ6ICdUaGUgbnVtYmVyIG9mIGZvbGRlcnMgaW4gdGhlIHdvcmtzcGFjZScgfTtcblx0XHRcdFx0XHRlbmRUb0VuZFRpbWU6IHsgY2xhc3NpZmljYXRpb246ICdTeXN0ZW1NZXRhRGF0YSc7IHB1cnBvc2U6ICdQZXJmb3JtYW5jZUFuZEhlYWx0aCc7IGNvbW1lbnQ6ICdUaGUgdG90YWwgc2VhcmNoIHRpbWUnIH07XG5cdFx0XHRcdFx0c29ydGluZ1RpbWU/OiB7IGNsYXNzaWZpY2F0aW9uOiAnU3lzdGVtTWV0YURhdGEnOyBwdXJwb3NlOiAnUGVyZm9ybWFuY2VBbmRIZWFsdGgnOyBjb21tZW50OiAnVGhlIGFtb3VudCBvZiB0aW1lIHNwZW50IHNvcnRpbmcgcmVzdWx0cycgfTtcblx0XHRcdFx0XHRjYWNoZVdhc1Jlc29sdmVkOiB7IGNsYXNzaWZpY2F0aW9uOiAnU3lzdGVtTWV0YURhdGEnOyBwdXJwb3NlOiAnUGVyZm9ybWFuY2VBbmRIZWFsdGgnOyBjb21tZW50OiAnV2hldGhlciB0aGUgY2FjaGUgd2FzIGFscmVhZHkgcmVzb2x2ZWQgd2hlbiB0aGUgc2VhcmNoIGJlZ2FuJyB9O1xuXHRcdFx0XHRcdGNhY2hlTG9va3VwVGltZTogeyBjbGFzc2lmaWNhdGlvbjogJ1N5c3RlbU1ldGFEYXRhJzsgcHVycG9zZTogJ1BlcmZvcm1hbmNlQW5kSGVhbHRoJzsgY29tbWVudDogJ1RoZSBhbW91bnQgb2YgdGltZSBzcGVudCBsb29raW5nIHVwIHRoZSBjYWNoZSB0byB1c2UgZm9yIHRoZSBzZWFyY2gnIH07XG5cdFx0XHRcdFx0Y2FjaGVGaWx0ZXJUaW1lOiB7IGNsYXNzaWZpY2F0aW9uOiAnU3lzdGVtTWV0YURhdGEnOyBwdXJwb3NlOiAnUGVyZm9ybWFuY2VBbmRIZWFsdGgnOyBjb21tZW50OiAnVGhlIGFtb3VudCBvZiB0aW1lIHNwZW50IHNlYXJjaGluZyB3aXRoaW4gdGhlIGNhY2hlJyB9O1xuXHRcdFx0XHRcdGNhY2hlRW50cnlDb3VudDogeyBjbGFzc2lmaWNhdGlvbjogJ1N5c3RlbU1ldGFEYXRhJzsgcHVycG9zZTogJ1BlcmZvcm1hbmNlQW5kSGVhbHRoJzsgY29tbWVudDogJ1RoZSBudW1iZXIgb2YgZW50cmllcyBpbiB0aGUgc2VhcmNoZWQtaW4gY2FjaGUnIH07XG5cdFx0XHRcdFx0c2NoZW1lOiB7IGNsYXNzaWZpY2F0aW9uOiAnU3lzdGVtTWV0YURhdGEnOyBwdXJwb3NlOiAnUGVyZm9ybWFuY2VBbmRIZWFsdGgnOyBjb21tZW50OiAnVGhlIHVyaSBzY2hlbWUgb2YgdGhlIGZvbGRlciBzZWFyY2hlZCBpbicgfTtcblx0XHRcdFx0fTtcblx0XHRcdFx0dHlwZSBDYWNoZWRTZWFyY2hDb21wbGV0ZUV2ZW50ID0ge1xuXHRcdFx0XHRcdHJlYXNvbj86IHN0cmluZztcblx0XHRcdFx0XHRyZXN1bHRDb3VudDogbnVtYmVyO1xuXHRcdFx0XHRcdHdvcmtzcGFjZUZvbGRlckNvdW50OiBudW1iZXI7XG5cdFx0XHRcdFx0ZW5kVG9FbmRUaW1lOiBudW1iZXI7XG5cdFx0XHRcdFx0c29ydGluZ1RpbWU/OiBudW1iZXI7XG5cdFx0XHRcdFx0Y2FjaGVXYXNSZXNvbHZlZDogYm9vbGVhbjtcblx0XHRcdFx0XHRjYWNoZUxvb2t1cFRpbWU6IG51bWJlcjtcblx0XHRcdFx0XHRjYWNoZUZpbHRlclRpbWU6IG51bWJlcjtcblx0XHRcdFx0XHRjYWNoZUVudHJ5Q291bnQ6IG51bWJlcjtcblx0XHRcdFx0XHRzY2hlbWU6IHN0cmluZztcblx0XHRcdFx0fTtcblx0XHRcdFx0dGhpcy50ZWxlbWV0cnlTZXJ2aWNlLnB1YmxpY0xvZzI8Q2FjaGVkU2VhcmNoQ29tcGxldGVFdmVudCwgQ2FjaGVkU2VhcmNoQ29tcGxldGVDbGFzc2lmY2F0aW9uPignY2FjaGVkU2VhcmNoQ29tcGxldGUnLCB7XG5cdFx0XHRcdFx0cmVhc29uOiBxdWVyeS5fcmVhc29uLFxuXHRcdFx0XHRcdHJlc3VsdENvdW50OiBmaWxlU2VhcmNoU3RhdHMucmVzdWx0Q291bnQsXG5cdFx0XHRcdFx0d29ya3NwYWNlRm9sZGVyQ291bnQ6IHF1ZXJ5LmZvbGRlclF1ZXJpZXMubGVuZ3RoLFxuXHRcdFx0XHRcdGVuZFRvRW5kVGltZTogZW5kVG9FbmRUaW1lLFxuXHRcdFx0XHRcdHNvcnRpbmdUaW1lOiBmaWxlU2VhcmNoU3RhdHMuc29ydGluZ1RpbWUsXG5cdFx0XHRcdFx0Y2FjaGVXYXNSZXNvbHZlZDogY2FjaGVTdGF0cy5jYWNoZVdhc1Jlc29sdmVkLFxuXHRcdFx0XHRcdGNhY2hlTG9va3VwVGltZTogY2FjaGVTdGF0cy5jYWNoZUxvb2t1cFRpbWUsXG5cdFx0XHRcdFx0Y2FjaGVGaWx0ZXJUaW1lOiBjYWNoZVN0YXRzLmNhY2hlRmlsdGVyVGltZSxcblx0XHRcdFx0XHRjYWNoZUVudHJ5Q291bnQ6IGNhY2hlU3RhdHMuY2FjaGVFbnRyeUNvdW50LFxuXHRcdFx0XHRcdHNjaGVtZVxuXHRcdFx0XHR9KTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdGNvbnN0IHNlYXJjaEVuZ2luZVN0YXRzOiBJU2VhcmNoRW5naW5lU3RhdHMgPSBmaWxlU2VhcmNoU3RhdHMuZGV0YWlsU3RhdHMgYXMgSVNlYXJjaEVuZ2luZVN0YXRzO1xuXG5cdFx0XHRcdHR5cGUgU2VhcmNoQ29tcGxldGVDbGFzc2lmaWNhdGlvbiA9IHtcblx0XHRcdFx0XHRvd25lcjogJ3JvYmxvdXJlbnMnO1xuXHRcdFx0XHRcdGNvbW1lbnQ6ICdGaXJlZCB3aGVuIGEgZmlsZSBzZWFyY2ggaXMgY29tcGxldGVkJztcblx0XHRcdFx0XHRyZWFzb24/OiB7IGNsYXNzaWZpY2F0aW9uOiAnU3lzdGVtTWV0YURhdGEnOyBwdXJwb3NlOiAnUGVyZm9ybWFuY2VBbmRIZWFsdGgnOyBjb21tZW50OiAnSW5kaWNhdGVzIHdoaWNoIGV4dGVuc2lvbiBvciBVSSBmZWF0dXJlIHRyaWdnZXJlZCB0aGlzIHNlYXJjaCcgfTtcblx0XHRcdFx0XHRyZXN1bHRDb3VudDogeyBjbGFzc2lmaWNhdGlvbjogJ1N5c3RlbU1ldGFEYXRhJzsgcHVycG9zZTogJ1BlcmZvcm1hbmNlQW5kSGVhbHRoJzsgY29tbWVudDogJ1RoZSBudW1iZXIgb2Ygc2VhcmNoIHJlc3VsdHMnIH07XG5cdFx0XHRcdFx0d29ya3NwYWNlRm9sZGVyQ291bnQ6IHsgY2xhc3NpZmljYXRpb246ICdTeXN0ZW1NZXRhRGF0YSc7IHB1cnBvc2U6ICdQZXJmb3JtYW5jZUFuZEhlYWx0aCc7IGNvbW1lbnQ6ICdUaGUgbnVtYmVyIG9mIGZvbGRlcnMgaW4gdGhlIHdvcmtzcGFjZScgfTtcblx0XHRcdFx0XHRlbmRUb0VuZFRpbWU6IHsgY2xhc3NpZmljYXRpb246ICdTeXN0ZW1NZXRhRGF0YSc7IHB1cnBvc2U6ICdQZXJmb3JtYW5jZUFuZEhlYWx0aCc7IGNvbW1lbnQ6ICdUaGUgdG90YWwgc2VhcmNoIHRpbWUnIH07XG5cdFx0XHRcdFx0c29ydGluZ1RpbWU/OiB7IGNsYXNzaWZpY2F0aW9uOiAnU3lzdGVtTWV0YURhdGEnOyBwdXJwb3NlOiAnUGVyZm9ybWFuY2VBbmRIZWFsdGgnOyBjb21tZW50OiAnVGhlIGFtb3VudCBvZiB0aW1lIHNwZW50IHNvcnRpbmcgcmVzdWx0cycgfTtcblx0XHRcdFx0XHRmaWxlV2Fsa1RpbWU6IHsgY2xhc3NpZmljYXRpb246ICdTeXN0ZW1NZXRhRGF0YSc7IHB1cnBvc2U6ICdQZXJmb3JtYW5jZUFuZEhlYWx0aCc7IGNvbW1lbnQ6ICdUaGUgYW1vdW50IG9mIHRpbWUgc3BlbnQgd2Fsa2luZyBmaWxlIHN5c3RlbScgfTtcblx0XHRcdFx0XHRkaXJlY3Rvcmllc1dhbGtlZDogeyBjbGFzc2lmaWNhdGlvbjogJ1N5c3RlbU1ldGFEYXRhJzsgcHVycG9zZTogJ1BlcmZvcm1hbmNlQW5kSGVhbHRoJzsgY29tbWVudDogJ1RoZSBudW1iZXIgb2YgZGlyZWN0b3JpZXMgd2Fsa2VkJyB9O1xuXHRcdFx0XHRcdGZpbGVzV2Fsa2VkOiB7IGNsYXNzaWZpY2F0aW9uOiAnU3lzdGVtTWV0YURhdGEnOyBwdXJwb3NlOiAnUGVyZm9ybWFuY2VBbmRIZWFsdGgnOyBjb21tZW50OiAnVGhlIG51bWJlciBvZiBmaWxlcyB3YWxrZWQnIH07XG5cdFx0XHRcdFx0Y21kVGltZTogeyBjbGFzc2lmaWNhdGlvbjogJ1N5c3RlbU1ldGFEYXRhJzsgcHVycG9zZTogJ1BlcmZvcm1hbmNlQW5kSGVhbHRoJzsgY29tbWVudDogJ1RoZSBhbW91bnQgb2YgdGltZSBzcGVudCBydW5uaW5nIHRoZSBzZWFyY2ggY29tbWFuZCcgfTtcblx0XHRcdFx0XHRjbWRSZXN1bHRDb3VudD86IHsgY2xhc3NpZmljYXRpb246ICdTeXN0ZW1NZXRhRGF0YSc7IHB1cnBvc2U6ICdQZXJmb3JtYW5jZUFuZEhlYWx0aCc7IGNvbW1lbnQ6ICdUaGUgbnVtYmVyIG9mIHJlc3VsdHMgcmV0dXJuZWQgZnJvbSB0aGUgc2VhcmNoIGNvbW1hbmQnIH07XG5cdFx0XHRcdFx0c2NoZW1lOiB7IGNsYXNzaWZpY2F0aW9uOiAnU3lzdGVtTWV0YURhdGEnOyBwdXJwb3NlOiAnUGVyZm9ybWFuY2VBbmRIZWFsdGgnOyBjb21tZW50OiAnVGhlIHVyaSBzY2hlbWUgb2YgdGhlIGZvbGRlciBzZWFyY2hlZCBpbicgfTtcblx0XHRcdFx0fTtcblx0XHRcdFx0dHlwZSBTZWFyY2hDb21wbGV0ZUV2ZW50ID0ge1xuXHRcdFx0XHRcdHJlYXNvbj86IHN0cmluZztcblx0XHRcdFx0XHRyZXN1bHRDb3VudDogbnVtYmVyO1xuXHRcdFx0XHRcdHdvcmtzcGFjZUZvbGRlckNvdW50OiBudW1iZXI7XG5cdFx0XHRcdFx0ZW5kVG9FbmRUaW1lOiBudW1iZXI7XG5cdFx0XHRcdFx0c29ydGluZ1RpbWU/OiBudW1iZXI7XG5cdFx0XHRcdFx0ZmlsZVdhbGtUaW1lOiBudW1iZXI7XG5cdFx0XHRcdFx0ZGlyZWN0b3JpZXNXYWxrZWQ6IG51bWJlcjtcblx0XHRcdFx0XHRmaWxlc1dhbGtlZDogbnVtYmVyO1xuXHRcdFx0XHRcdGNtZFRpbWU6IG51bWJlcjtcblx0XHRcdFx0XHRjbWRSZXN1bHRDb3VudD86IG51bWJlcjtcblx0XHRcdFx0XHRzY2hlbWU6IHN0cmluZztcblxuXHRcdFx0XHR9O1xuXG5cdFx0XHRcdHRoaXMudGVsZW1ldHJ5U2VydmljZS5wdWJsaWNMb2cyPFNlYXJjaENvbXBsZXRlRXZlbnQsIFNlYXJjaENvbXBsZXRlQ2xhc3NpZmljYXRpb24+KCdzZWFyY2hDb21wbGV0ZScsIHtcblx0XHRcdFx0XHRyZWFzb246IHF1ZXJ5Ll9yZWFzb24sXG5cdFx0XHRcdFx0cmVzdWx0Q291bnQ6IGZpbGVTZWFyY2hTdGF0cy5yZXN1bHRDb3VudCxcblx0XHRcdFx0XHR3b3Jrc3BhY2VGb2xkZXJDb3VudDogcXVlcnkuZm9sZGVyUXVlcmllcy5sZW5ndGgsXG5cdFx0XHRcdFx0ZW5kVG9FbmRUaW1lOiBlbmRUb0VuZFRpbWUsXG5cdFx0XHRcdFx0c29ydGluZ1RpbWU6IGZpbGVTZWFyY2hTdGF0cy5zb3J0aW5nVGltZSxcblx0XHRcdFx0XHRmaWxlV2Fsa1RpbWU6IHNlYXJjaEVuZ2luZVN0YXRzLmZpbGVXYWxrVGltZSxcblx0XHRcdFx0XHRkaXJlY3Rvcmllc1dhbGtlZDogc2VhcmNoRW5naW5lU3RhdHMuZGlyZWN0b3JpZXNXYWxrZWQsXG5cdFx0XHRcdFx0ZmlsZXNXYWxrZWQ6IHNlYXJjaEVuZ2luZVN0YXRzLmZpbGVzV2Fsa2VkLFxuXHRcdFx0XHRcdGNtZFRpbWU6IHNlYXJjaEVuZ2luZVN0YXRzLmNtZFRpbWUsXG5cdFx0XHRcdFx0Y21kUmVzdWx0Q291bnQ6IHNlYXJjaEVuZ2luZVN0YXRzLmNtZFJlc3VsdENvdW50LFxuXHRcdFx0XHRcdHNjaGVtZVxuXHRcdFx0XHR9KTtcblx0XHRcdH1cblx0XHR9IGVsc2UgaWYgKHF1ZXJ5LnR5cGUgPT09IFF1ZXJ5VHlwZS5UZXh0KSB7XG5cdFx0XHRsZXQgZXJyb3JUeXBlOiBzdHJpbmcgfCB1bmRlZmluZWQ7XG5cdFx0XHRpZiAoZXJyKSB7XG5cdFx0XHRcdGVycm9yVHlwZSA9IGVyci5jb2RlID09PSBTZWFyY2hFcnJvckNvZGUucmVnZXhQYXJzZUVycm9yID8gJ3JlZ2V4JyA6XG5cdFx0XHRcdFx0ZXJyLmNvZGUgPT09IFNlYXJjaEVycm9yQ29kZS51bmtub3duRW5jb2RpbmcgPyAnZW5jb2RpbmcnIDpcblx0XHRcdFx0XHRcdGVyci5jb2RlID09PSBTZWFyY2hFcnJvckNvZGUuZ2xvYlBhcnNlRXJyb3IgPyAnZ2xvYicgOlxuXHRcdFx0XHRcdFx0XHRlcnIuY29kZSA9PT0gU2VhcmNoRXJyb3JDb2RlLmludmFsaWRMaXRlcmFsID8gJ2xpdGVyYWwnIDpcblx0XHRcdFx0XHRcdFx0XHRlcnIuY29kZSA9PT0gU2VhcmNoRXJyb3JDb2RlLm90aGVyID8gJ290aGVyJyA6XG5cdFx0XHRcdFx0XHRcdFx0XHRlcnIuY29kZSA9PT0gU2VhcmNoRXJyb3JDb2RlLmNhbmNlbGVkID8gJ2NhbmNlbGVkJyA6XG5cdFx0XHRcdFx0XHRcdFx0XHRcdCd1bmtub3duJztcblx0XHRcdH1cblxuXHRcdFx0dHlwZSBUZXh0U2VhcmNoQ29tcGxldGVDbGFzc2lmaWNhdGlvbiA9IHtcblx0XHRcdFx0b3duZXI6ICdyb2Jsb3VyZW5zJztcblx0XHRcdFx0Y29tbWVudDogJ0ZpcmVkIHdoZW4gYSB0ZXh0IHNlYXJjaCBpcyBjb21wbGV0ZWQnO1xuXHRcdFx0XHRyZWFzb24/OiB7IGNsYXNzaWZpY2F0aW9uOiAnU3lzdGVtTWV0YURhdGEnOyBwdXJwb3NlOiAnUGVyZm9ybWFuY2VBbmRIZWFsdGgnOyBjb21tZW50OiAnSW5kaWNhdGVzIHdoaWNoIGV4dGVuc2lvbiBvciBVSSBmZWF0dXJlIHRyaWdnZXJlZCB0aGlzIHNlYXJjaCcgfTtcblx0XHRcdFx0d29ya3NwYWNlRm9sZGVyQ291bnQ6IHsgY2xhc3NpZmljYXRpb246ICdTeXN0ZW1NZXRhRGF0YSc7IHB1cnBvc2U6ICdQZXJmb3JtYW5jZUFuZEhlYWx0aCc7IGNvbW1lbnQ6ICdUaGUgbnVtYmVyIG9mIGZvbGRlcnMgaW4gdGhlIHdvcmtzcGFjZScgfTtcblx0XHRcdFx0ZW5kVG9FbmRUaW1lOiB7IGNsYXNzaWZpY2F0aW9uOiAnU3lzdGVtTWV0YURhdGEnOyBwdXJwb3NlOiAnUGVyZm9ybWFuY2VBbmRIZWFsdGgnOyBjb21tZW50OiAnVGhlIHRvdGFsIHNlYXJjaCB0aW1lJyB9O1xuXHRcdFx0XHRzY2hlbWU6IHsgY2xhc3NpZmljYXRpb246ICdTeXN0ZW1NZXRhRGF0YSc7IHB1cnBvc2U6ICdQZXJmb3JtYW5jZUFuZEhlYWx0aCc7IGNvbW1lbnQ6ICdUaGUgdXJpIHNjaGVtZSBvZiB0aGUgZm9sZGVyIHNlYXJjaGVkIGluJyB9O1xuXHRcdFx0XHRlcnJvcj86IHsgY2xhc3NpZmljYXRpb246ICdTeXN0ZW1NZXRhRGF0YSc7IHB1cnBvc2U6ICdQZXJmb3JtYW5jZUFuZEhlYWx0aCc7IGNvbW1lbnQ6ICdUaGUgdHlwZSBvZiB0aGUgZXJyb3IsIGlmIGFueScgfTtcblx0XHRcdH07XG5cdFx0XHR0eXBlIFRleHRTZWFyY2hDb21wbGV0ZUV2ZW50ID0ge1xuXHRcdFx0XHRyZWFzb24/OiBzdHJpbmc7XG5cdFx0XHRcdHdvcmtzcGFjZUZvbGRlckNvdW50OiBudW1iZXI7XG5cdFx0XHRcdGVuZFRvRW5kVGltZTogbnVtYmVyO1xuXHRcdFx0XHRzY2hlbWU6IHN0cmluZztcblx0XHRcdFx0ZXJyb3I/OiBzdHJpbmc7XG5cdFx0XHR9O1xuXHRcdFx0dGhpcy50ZWxlbWV0cnlTZXJ2aWNlLnB1YmxpY0xvZzI8VGV4dFNlYXJjaENvbXBsZXRlRXZlbnQsIFRleHRTZWFyY2hDb21wbGV0ZUNsYXNzaWZpY2F0aW9uPigndGV4dFNlYXJjaENvbXBsZXRlJywge1xuXHRcdFx0XHRyZWFzb246IHF1ZXJ5Ll9yZWFzb24sXG5cdFx0XHRcdHdvcmtzcGFjZUZvbGRlckNvdW50OiBxdWVyeS5mb2xkZXJRdWVyaWVzLmxlbmd0aCxcblx0XHRcdFx0ZW5kVG9FbmRUaW1lOiBlbmRUb0VuZFRpbWUsXG5cdFx0XHRcdHNjaGVtZSxcblx0XHRcdFx0ZXJyb3I6IGVycm9yVHlwZSxcblx0XHRcdH0pO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgZ2V0T3BlbkVkaXRvclJlc3VsdHMocXVlcnk6IElUZXh0UXVlcnkpOiB7IHJlc3VsdHM6IFJlc291cmNlTWFwPElGaWxlTWF0Y2ggfCBudWxsPjsgbGltaXRIaXQ6IGJvb2xlYW4gfSB7XG5cdFx0Y29uc3Qgb3BlbkVkaXRvclJlc3VsdHMgPSBuZXcgUmVzb3VyY2VNYXA8SUZpbGVNYXRjaCB8IG51bGw+KHVyaSA9PiB0aGlzLnVyaUlkZW50aXR5U2VydmljZS5leHRVcmkuZ2V0Q29tcGFyaXNvbktleSh1cmkpKTtcblx0XHRsZXQgbGltaXRIaXQgPSBmYWxzZTtcblxuXHRcdGlmIChxdWVyeS50eXBlID09PSBRdWVyeVR5cGUuVGV4dCkge1xuXHRcdFx0Y29uc3QgY2Fub25pY2FsVG9PcmlnaW5hbFJlc291cmNlcyA9IG5ldyBSZXNvdXJjZU1hcDxVUkk+KCk7XG5cdFx0XHRmb3IgKGNvbnN0IGVkaXRvcklucHV0IG9mIHRoaXMuZWRpdG9yU2VydmljZS5lZGl0b3JzKSB7XG5cdFx0XHRcdGNvbnN0IGNhbm9uaWNhbCA9IEVkaXRvclJlc291cmNlQWNjZXNzb3IuZ2V0Q2Fub25pY2FsVXJpKGVkaXRvcklucHV0LCB7IHN1cHBvcnRTaWRlQnlTaWRlOiBTaWRlQnlTaWRlRWRpdG9yLlBSSU1BUlkgfSk7XG5cdFx0XHRcdGNvbnN0IG9yaWdpbmFsID0gRWRpdG9yUmVzb3VyY2VBY2Nlc3Nvci5nZXRPcmlnaW5hbFVyaShlZGl0b3JJbnB1dCwgeyBzdXBwb3J0U2lkZUJ5U2lkZTogU2lkZUJ5U2lkZUVkaXRvci5QUklNQVJZIH0pO1xuXG5cdFx0XHRcdGlmIChjYW5vbmljYWwpIHtcblx0XHRcdFx0XHRjYW5vbmljYWxUb09yaWdpbmFsUmVzb3VyY2VzLnNldChjYW5vbmljYWwsIG9yaWdpbmFsID8/IGNhbm9uaWNhbCk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblxuXHRcdFx0Y29uc3QgbW9kZWxzID0gdGhpcy5tb2RlbFNlcnZpY2UuZ2V0TW9kZWxzKCk7XG5cdFx0XHRtb2RlbHMuZm9yRWFjaCgobW9kZWwpID0+IHtcblx0XHRcdFx0Y29uc3QgcmVzb3VyY2UgPSBtb2RlbC51cmk7XG5cdFx0XHRcdGlmICghcmVzb3VyY2UpIHtcblx0XHRcdFx0XHRyZXR1cm47XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRpZiAobGltaXRIaXQpIHtcblx0XHRcdFx0XHRyZXR1cm47XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRjb25zdCBvcmlnaW5hbFJlc291cmNlID0gY2Fub25pY2FsVG9PcmlnaW5hbFJlc291cmNlcy5nZXQocmVzb3VyY2UpO1xuXHRcdFx0XHRpZiAoIW9yaWdpbmFsUmVzb3VyY2UpIHtcblx0XHRcdFx0XHRyZXR1cm47XG5cdFx0XHRcdH1cblxuXHRcdFx0XHQvLyBTa2lwIHNlYXJjaCByZXN1bHRzXG5cdFx0XHRcdGlmIChtb2RlbC5nZXRMYW5ndWFnZUlkKCkgPT09IFNFQVJDSF9SRVNVTFRfTEFOR1VBR0VfSUQgJiYgIShxdWVyeS5pbmNsdWRlUGF0dGVybiAmJiBxdWVyeS5pbmNsdWRlUGF0dGVyblsnKiovKi5jb2RlLXNlYXJjaCddKSkge1xuXHRcdFx0XHRcdC8vIFRPRE86IHVudGl0bGVkIHNlYXJjaCBlZGl0b3JzIHdpbGwgYmUgZXhjbHVkZWQgZnJvbSBzZWFyY2ggZXZlbiB3aGVuIGluY2x1ZGUgKi5jb2RlLXNlYXJjaCBpcyBzcGVjaWZpZWRcblx0XHRcdFx0XHRyZXR1cm47XG5cdFx0XHRcdH1cblxuXHRcdFx0XHQvLyBCbG9jayB3YWxrdGhyb3VnaCwgd2VidmlldywgZXRjLlxuXHRcdFx0XHRpZiAob3JpZ2luYWxSZXNvdXJjZS5zY2hlbWUgIT09IFNjaGVtYXMudW50aXRsZWQgJiYgIXRoaXMuZmlsZVNlcnZpY2UuaGFzUHJvdmlkZXIob3JpZ2luYWxSZXNvdXJjZSkpIHtcblx0XHRcdFx0XHRyZXR1cm47XG5cdFx0XHRcdH1cblxuXHRcdFx0XHQvLyBFeGNsdWRlIGZpbGVzIGZyb20gdGhlIGdpdCBGaWxlU3lzdGVtUHJvdmlkZXIsIGUuZy4gdG8gcHJldmVudCBvcGVuIHN0YWdlZCBmaWxlcyBmcm9tIHNob3dpbmcgaW4gc2VhcmNoIHJlc3VsdHNcblx0XHRcdFx0aWYgKG9yaWdpbmFsUmVzb3VyY2Uuc2NoZW1lID09PSAnZ2l0Jykge1xuXHRcdFx0XHRcdHJldHVybjtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdGlmICghdGhpcy5tYXRjaGVzKG9yaWdpbmFsUmVzb3VyY2UsIHF1ZXJ5KSkge1xuXHRcdFx0XHRcdHJldHVybjsgLy8gcmVzcGVjdCB1c2VyIGZpbHRlcnNcblx0XHRcdFx0fVxuXG5cdFx0XHRcdC8vIFVzZSBlZGl0b3IgQVBJIHRvIGZpbmQgbWF0Y2hlc1xuXHRcdFx0XHRjb25zdCBhc2tNYXggPSAoaXNOdW1iZXIocXVlcnkubWF4UmVzdWx0cykgPyBxdWVyeS5tYXhSZXN1bHRzIDogREVGQVVMVF9NQVhfU0VBUkNIX1JFU1VMVFMpICsgMTtcblx0XHRcdFx0bGV0IG1hdGNoZXMgPSBtb2RlbC5maW5kTWF0Y2hlcyhxdWVyeS5jb250ZW50UGF0dGVybi5wYXR0ZXJuLCBmYWxzZSwgISFxdWVyeS5jb250ZW50UGF0dGVybi5pc1JlZ0V4cCwgISFxdWVyeS5jb250ZW50UGF0dGVybi5pc0Nhc2VTZW5zaXRpdmUsIHF1ZXJ5LmNvbnRlbnRQYXR0ZXJuLmlzV29yZE1hdGNoID8gcXVlcnkuY29udGVudFBhdHRlcm4ud29yZFNlcGFyYXRvcnMhIDogbnVsbCwgZmFsc2UsIGFza01heCk7XG5cdFx0XHRcdGlmIChtYXRjaGVzLmxlbmd0aCkge1xuXHRcdFx0XHRcdGlmIChhc2tNYXggJiYgbWF0Y2hlcy5sZW5ndGggPj0gYXNrTWF4KSB7XG5cdFx0XHRcdFx0XHRsaW1pdEhpdCA9IHRydWU7XG5cdFx0XHRcdFx0XHRtYXRjaGVzID0gbWF0Y2hlcy5zbGljZSgwLCBhc2tNYXggLSAxKTtcblx0XHRcdFx0XHR9XG5cblx0XHRcdFx0XHRjb25zdCBmaWxlTWF0Y2ggPSBuZXcgRmlsZU1hdGNoKG9yaWdpbmFsUmVzb3VyY2UpO1xuXHRcdFx0XHRcdG9wZW5FZGl0b3JSZXN1bHRzLnNldChvcmlnaW5hbFJlc291cmNlLCBmaWxlTWF0Y2gpO1xuXG5cdFx0XHRcdFx0Y29uc3QgdGV4dFNlYXJjaFJlc3VsdHMgPSBlZGl0b3JNYXRjaGVzVG9UZXh0U2VhcmNoUmVzdWx0cyhtYXRjaGVzLCBtb2RlbCwgcXVlcnkucHJldmlld09wdGlvbnMpO1xuXHRcdFx0XHRcdGZpbGVNYXRjaC5yZXN1bHRzID0gZ2V0VGV4dFNlYXJjaE1hdGNoV2l0aE1vZGVsQ29udGV4dCh0ZXh0U2VhcmNoUmVzdWx0cywgbW9kZWwsIHF1ZXJ5KTtcblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRvcGVuRWRpdG9yUmVzdWx0cy5zZXQob3JpZ2luYWxSZXNvdXJjZSwgbnVsbCk7XG5cdFx0XHRcdH1cblx0XHRcdH0pO1xuXHRcdH1cblxuXHRcdHJldHVybiB7XG5cdFx0XHRyZXN1bHRzOiBvcGVuRWRpdG9yUmVzdWx0cyxcblx0XHRcdGxpbWl0SGl0XG5cdFx0fTtcblx0fVxuXG5cdHByaXZhdGUgbWF0Y2hlcyhyZXNvdXJjZTogdXJpLCBxdWVyeTogSVRleHRRdWVyeSk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiBwYXRoSW5jbHVkZWRJblF1ZXJ5KHF1ZXJ5LCByZXNvdXJjZS5mc1BhdGgpO1xuXHR9XG5cblx0YXN5bmMgY2xlYXJDYWNoZShjYWNoZUtleTogc3RyaW5nKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3QgY2xlYXJQcyA9IEFycmF5LmZyb20odGhpcy5maWxlU2VhcmNoUHJvdmlkZXJzLnZhbHVlcygpKVxuXHRcdFx0Lm1hcChwcm92aWRlciA9PiBwcm92aWRlciAmJiBwcm92aWRlci5jbGVhckNhY2hlKGNhY2hlS2V5KSk7XG5cdFx0YXdhaXQgUHJvbWlzZS5hbGwoY2xlYXJQcyk7XG5cdH1cbn1cbiJdLAogICJtYXBwaW5ncyI6ICI7Ozs7Ozs7Ozs7O0FBS0EsWUFBWSxZQUFZO0FBQ3hCLFNBQVMsaUJBQWlCLDZCQUE2QjtBQUV2RCxTQUFTLHlCQUF5QjtBQUNsQyxTQUFTLFlBQXlCLG9CQUFvQjtBQUN0RCxTQUFTLGFBQWEsbUJBQW1CO0FBQ3pDLFNBQVMsZUFBZTtBQUN4QixTQUFTLG9CQUFvQjtBQUM3QixTQUFTLGlCQUFpQjtBQUMxQixTQUFTLGdCQUFnQjtBQUV6QixTQUFTLHFCQUFxQjtBQUM5QixTQUFTLG9CQUFvQjtBQUM3QixTQUFTLG1CQUFtQjtBQUM1QixTQUFTLHlCQUF5QjtBQUNsQyxTQUFTLDJCQUEyQjtBQUNwQyxTQUFTLHdCQUF3Qix3QkFBd0I7QUFDekQsU0FBUyxzQkFBc0I7QUFDL0IsU0FBUyx5QkFBeUI7QUFDbEMsU0FBUyw0QkFBNEIsd0JBQXdCLFdBQXVILGFBQTRILGFBQWEsbUJBQStCLHFCQUFxQixXQUFXLDJCQUF3QyxpQkFBaUIsMEJBQTBCO0FBQy9jLFNBQVMsb0NBQW9DLHdDQUF3QztBQUU5RSxJQUFNLGdCQUFOLGNBQTRCLFdBQXFDO0FBQUEsRUFjdkUsWUFDaUMsY0FDQyxlQUNHLGtCQUNOLFlBQ00s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
