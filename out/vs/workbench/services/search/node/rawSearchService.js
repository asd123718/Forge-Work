import * as arrays from "../../../../base/common/arrays.js";
import { createCancelablePromise } from "../../../../base/common/async.js";
import { canceled } from "../../../../base/common/errors.js";
import { Emitter } from "../../../../base/common/event.js";
import { compareItemsByFuzzyScore, prepareQuery } from "../../../../base/common/fuzzyScorer.js";
import { revive } from "../../../../base/common/marshalling.js";
import { basename, dirname, join, sep } from "../../../../base/common/path.js";
import { StopWatch } from "../../../../base/common/stopwatch.js";
import { URI } from "../../../../base/common/uri.js";
import { ByteSize } from "../../../../platform/files/common/files.js";
import { DEFAULT_MAX_SEARCH_RESULTS, isFilePatternMatch } from "../common/search.js";
import { Engine as FileSearchEngine } from "./fileSearch.js";
import { TextSearchEngineAdapter } from "./textSearchAdapter.js";
const _SearchService = class _SearchService {
  constructor(processType = "searchProcess", getNumThreads) {
    this.processType = processType;
    this.getNumThreads = getNumThreads;
    this.caches = /* @__PURE__ */ Object.create(null);
  }
  fileSearch(config) {
    let promise;
    const query = reviveQuery(config);
    const emitter = new Emitter({
      onDidAddFirstListener: () => {
        promise = createCancelablePromise(async (token) => {
          const numThreads = await this.getNumThreads?.();
          return this.doFileSearchWithEngine(FileSearchEngine, query, (p) => emitter.fire(p), token, _SearchService.BATCH_SIZE, numThreads);
        });
        promise.then(
          (c) => emitter.fire(c),
          (err) => emitter.fire({ type: "error", error: { message: err.message, stack: err.stack } })
        );
      },
      onDidRemoveLastListener: () => {
        promise.cancel();
      }
    });
    return emitter.event;
  }
  textSearch(rawQuery) {
    let promise;
    const query = reviveQuery(rawQuery);
    const emitter = new Emitter({
      onDidAddFirstListener: () => {
        promise = createCancelablePromise((token) => {
          return this.ripgrepTextSearch(query, (p) => emitter.fire(p), token);
        });
        promise.then(
          (c) => emitter.fire(c),
          (err) => emitter.fire({ type: "error", error: { message: err.message, stack: err.stack } })
        );
      },
      onDidRemoveLastListener: () => {
        promise.cancel();
      }
    });
    return emitter.event;
  }
  async ripgrepTextSearch(config, progressCallback, token) {
    config.maxFileSize = this.getPlatformFileLimits().maxFileSize;
    const numThreads = await this.getNumThreads?.();
    const engine = new TextSearchEngineAdapter(config, numThreads);
    return engine.search(token, progressCallback, progressCallback);
  }
  getPlatformFileLimits() {
    return {
      maxFileSize: 16 * ByteSize.GB
    };
  }
  doFileSearch(config, numThreads, progressCallback, token) {
    return this.doFileSearchWithEngine(FileSearchEngine, config, progressCallback, token, _SearchService.BATCH_SIZE, numThreads);
  }
  doFileSearchWithEngine(EngineClass, config, progressCallback, token, batchSize = _SearchService.BATCH_SIZE, threads) {
    let resultCount = 0;
    const fileProgressCallback = (progress) => {
      if (Array.isArray(progress)) {
        resultCount += progress.length;
        progressCallback(progress.map((m) => this.rawMatchToSearchItem(m)));
      } else if (progress.relativePath) {
        resultCount++;
        progressCallback(this.rawMatchToSearchItem(progress));
      } else {
        progressCallback(progress);
      }
    };
    if (config.sortByScore) {
      let sortedSearch = this.trySortedSearchFromCache(config, fileProgressCallback, token);
      if (!sortedSearch) {
        const walkerConfig = config.maxResults ? Object.assign({}, config, { maxResults: null }) : config;
        const engine2 = new EngineClass(walkerConfig, threads);
        sortedSearch = this.doSortedSearch(engine2, config, progressCallback, fileProgressCallback, token);
      }
      return new Promise((c, e) => {
        sortedSearch.then(([result, rawMatches]) => {
          const serializedMatches = rawMatches.map((rawMatch) => this.rawMatchToSearchItem(rawMatch));
          this.sendProgress(serializedMatches, progressCallback, batchSize);
          c(result);
        }, e);
      });
    }
    const engine = new EngineClass(config, threads);
    return this.doSearch(engine, fileProgressCallback, batchSize, token).then((complete) => {
      return {
        limitHit: complete.limitHit,
        type: "success",
        stats: {
          detailStats: complete.stats,
          type: this.processType,
          fromCache: false,
          resultCount,
          sortingTime: void 0
        },
        messages: []
      };
    });
  }
  rawMatchToSearchItem(match) {
    return { path: match.base ? join(match.base, match.relativePath) : match.relativePath };
  }
  doSortedSearch(engine, config, progressCallback, fileProgressCallback, token) {
    const emitter = new Emitter();
    let allResultsPromise = createCancelablePromise((token2) => {
      let results = [];
      const innerProgressCallback = (progress) => {
        if (Array.isArray(progress)) {
          results = progress;
        } else {
          fileProgressCallback(progress);
          emitter.fire(progress);
        }
      };
      return this.doSearch(engine, innerProgressCallback, -1, token2).then((result) => {
        return [result, results];
      });
    });
    let cache;
    if (config.cacheKey) {
      cache = this.getOrCreateCache(config.cacheKey);
      const cacheRow = {
        promise: allResultsPromise,
        event: emitter.event,
        resolved: false
      };
      cache.resultsToSearchCache[config.filePattern || ""] = cacheRow;
      allResultsPromise.then(() => {
        cacheRow.resolved = true;
      }, (err) => {
        delete cache.resultsToSearchCache[config.filePattern || ""];
      });
      allResultsPromise = this.preventCancellation(allResultsPromise);
    }
    return allResultsPromise.then(([result, results]) => {
      const scorerCache = cache ? cache.scorerCache : /* @__PURE__ */ Object.create(null);
      const sortSW = (typeof config.maxResults !== "number" || config.maxResults > 0) && StopWatch.create(false);
      return this.sortResults(config, results, scorerCache, token).then((sortedResults) => {
        const sortingTime = sortSW ? sortSW.elapsed() : -1;
        return [{
          type: "success",
          stats: {
            detailStats: result.stats,
            sortingTime,
            fromCache: false,
            type: this.processType,
            resultCount: sortedResults.length
          },
          messages: result.messages,
          limitHit: result.limitHit || typeof config.maxResults === "number" && results.length > config.maxResults
        }, sortedResults];
      });
    });
  }
  getOrCreateCache(cacheKey) {
    const existing = this.caches[cacheKey];
    if (existing) {
      return existing;
    }
    return this.caches[cacheKey] = new Cache();
  }
  trySortedSearchFromCache(config, progressCallback, token) {
    const cache = config.cacheKey && this.caches[config.cacheKey];
    if (!cache) {
      return void 0;
    }
    const cached = this.getResultsFromCache(cache, config.filePattern || "", progressCallback, token);
    if (cached) {
      return cached.then(([result, results, cacheStats]) => {
        const sortSW = StopWatch.create(false);
        return this.sortResults(config, results, cache.scorerCache, token).then((sortedResults) => {
          const sortingTime = sortSW.elapsed();
          const stats = {
            fromCache: true,
            detailStats: cacheStats,
            type: this.processType,
            resultCount: results.length,
            sortingTime
          };
          return [
            {
              type: "success",
              limitHit: result.limitHit || typeof config.maxResults === "number" && results.length > config.maxResults,
              stats,
              messages: []
            },
            sortedResults
          ];
        });
      });
    }
    return void 0;
  }
  sortResults(config, results, scorerCache, token) {
    const query = prepareQuery(config.filePattern || "");
    const compare = (matchA, matchB) => compareItemsByFuzzyScore(matchA, matchB, query, true, FileMatchItemAccessor, scorerCache);
    const maxResults = typeof config.maxResults === "number" ? config.maxResults : DEFAULT_MAX_SEARCH_RESULTS;
    return arrays.topAsync(results, compare, maxResults, 1e4, token);
  }
  sendProgress(results, progressCb, batchSize) {
    if (batchSize && batchSize > 0) {
      for (let i = 0; i < results.length; i += batchSize) {
        progressCb(results.slice(i, i + batchSize));
      }
    } else {
      progressCb(results);
    }
  }
  getResultsFromCache(cache, searchValue, progressCallback, token) {
    const cacheLookupSW = StopWatch.create(false);
    const hasPathSep = searchValue.indexOf(sep) >= 0;
    let cachedRow;
    for (const previousSearch in cache.resultsToSearchCache) {
      if (searchValue.startsWith(previousSearch)) {
        if (hasPathSep && previousSearch.indexOf(sep) < 0 && previousSearch !== "") {
          continue;
        }
        const row = cache.resultsToSearchCache[previousSearch];
        cachedRow = {
          promise: this.preventCancellation(row.promise),
          event: row.event,
          resolved: row.resolved
        };
        break;
      }
    }
    if (!cachedRow) {
      return null;
    }
    const cacheLookupTime = cacheLookupSW.elapsed();
    const cacheFilterSW = StopWatch.create(false);
    const listener = cachedRow.event(progressCallback);
    if (token) {
      token.onCancellationRequested(() => {
        listener.dispose();
      });
    }
    return cachedRow.promise.then(([complete, cachedEntries]) => {
      if (token && token.isCancellationRequested) {
        throw canceled();
      }
      const results = [];
      const normalizedSearchValueLowercase = prepareQuery(searchValue).normalizedLowercase;
      for (const entry of cachedEntries) {
        if (!isFilePatternMatch(entry, normalizedSearchValueLowercase)) {
          continue;
        }
        results.push(entry);
      }
      return [complete, results, {
        cacheWasResolved: cachedRow.resolved,
        cacheLookupTime,
        cacheFilterTime: cacheFilterSW.elapsed(),
        cacheEntryCount: cachedEntries.length
      }];
    });
  }
  doSearch(engine, progressCallback, batchSize, token) {
    return new Promise((c, e) => {
      let batch = [];
      token?.onCancellationRequested(() => engine.cancel());
      engine.search((match) => {
        if (match) {
          if (batchSize) {
            batch.push(match);
            if (batchSize > 0 && batch.length >= batchSize) {
              progressCallback(batch);
              batch = [];
            }
          } else {
            progressCallback(match);
          }
        }
      }, (progress) => {
        progressCallback(progress);
      }, (error, complete) => {
        if (batch.length) {
          progressCallback(batch);
        }
        if (error) {
          progressCallback({ message: "Search finished. Error: " + error.message });
          e(error);
        } else {
          progressCallback({ message: "Search finished. Stats: " + JSON.stringify(complete.stats) });
          c(complete);
        }
      });
    });
  }
  clearCache(cacheKey) {
    delete this.caches[cacheKey];
    return Promise.resolve(void 0);
  }
  /**
   * Return a CancelablePromise which is not actually cancelable
   * TODO@rob - Is this really needed?
   */
  preventCancellation(promise) {
    return new class {
      get [Symbol.toStringTag]() {
        return this.toString();
      }
      cancel() {
      }
      then(resolve, reject) {
        return promise.then(resolve, reject);
      }
      catch(reject) {
        return this.then(void 0, reject);
      }
      finally(onFinally) {
        return promise.finally(onFinally);
      }
    }();
  }
};
_SearchService.BATCH_SIZE = 512;
let SearchService = _SearchService;
class Cache {
  constructor() {
    this.resultsToSearchCache = /* @__PURE__ */ Object.create(null);
    this.scorerCache = /* @__PURE__ */ Object.create(null);
  }
}
const FileMatchItemAccessor = new class {
  getItemLabel(match) {
    return basename(match.relativePath);
  }
  getItemDescription(match) {
    return dirname(match.relativePath);
  }
  getItemPath(match) {
    return match.relativePath;
  }
}();
function reviveQuery(rawQuery) {
  return {
    // eslint-disable-next-line local/code-no-any-casts
    ...rawQuery,
    // TODO
    ...{
      folderQueries: rawQuery.folderQueries && rawQuery.folderQueries.map(reviveFolderQuery),
      extraFileResources: rawQuery.extraFileResources && rawQuery.extraFileResources.map((components) => URI.revive(components))
    }
  };
}
function reviveFolderQuery(rawFolderQuery) {
  return revive(rawFolderQuery);
}
export {
  SearchService
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXHNlcnZpY2VzXFxzZWFyY2hcXG5vZGVcXHJhd1NlYXJjaFNlcnZpY2UudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgKiBhcyBhcnJheXMgZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vYXJyYXlzLmpzJztcbmltcG9ydCB7IENhbmNlbGFibGVQcm9taXNlLCBjcmVhdGVDYW5jZWxhYmxlUHJvbWlzZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2FzeW5jLmpzJztcbmltcG9ydCB7IENhbmNlbGxhdGlvblRva2VuIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vY2FuY2VsbGF0aW9uLmpzJztcbmltcG9ydCB7IGNhbmNlbGVkIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vZXJyb3JzLmpzJztcbmltcG9ydCB7IEVtaXR0ZXIsIEV2ZW50IH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vZXZlbnQuanMnO1xuaW1wb3J0IHsgY29tcGFyZUl0ZW1zQnlGdXp6eVNjb3JlLCBGdXp6eVNjb3JlckNhY2hlLCBJSXRlbUFjY2Vzc29yLCBwcmVwYXJlUXVlcnkgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9mdXp6eVNjb3Jlci5qcyc7XG5pbXBvcnQgeyByZXZpdmUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9tYXJzaGFsbGluZy5qcyc7XG5pbXBvcnQgeyBiYXNlbmFtZSwgZGlybmFtZSwgam9pbiwgc2VwIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vcGF0aC5qcyc7XG5pbXBvcnQgeyBTdG9wV2F0Y2ggfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9zdG9wd2F0Y2guanMnO1xuaW1wb3J0IHsgVVJJLCBVcmlDb21wb25lbnRzIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdXJpLmpzJztcbmltcG9ydCB7IEJ5dGVTaXplIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vZmlsZXMvY29tbW9uL2ZpbGVzLmpzJztcbmltcG9ydCB7IERFRkFVTFRfTUFYX1NFQVJDSF9SRVNVTFRTLCBJQ2FjaGVkU2VhcmNoU3RhdHMsIElGaWxlUXVlcnksIElGaWxlU2VhcmNoUHJvZ3Jlc3NJdGVtLCBJRmlsZVNlYXJjaFN0YXRzLCBJRm9sZGVyUXVlcnksIElQcm9ncmVzc01lc3NhZ2UsIElSYXdGaWxlTWF0Y2gsIElSYXdGaWxlUXVlcnksIElSYXdRdWVyeSwgSVJhd1NlYXJjaFNlcnZpY2UsIElSYXdUZXh0UXVlcnksIElTZWFyY2hFbmdpbmUsIElTZWFyY2hFbmdpbmVTdWNjZXNzLCBJU2VyaWFsaXplZEZpbGVNYXRjaCwgSVNlcmlhbGl6ZWRTZWFyY2hDb21wbGV0ZSwgSVNlcmlhbGl6ZWRTZWFyY2hQcm9ncmVzc0l0ZW0sIElTZXJpYWxpemVkU2VhcmNoU3VjY2VzcywgaXNGaWxlUGF0dGVybk1hdGNoLCBJVGV4dFF1ZXJ5IH0gZnJvbSAnLi4vY29tbW9uL3NlYXJjaC5qcyc7XG5pbXBvcnQgeyBFbmdpbmUgYXMgRmlsZVNlYXJjaEVuZ2luZSB9IGZyb20gJy4vZmlsZVNlYXJjaC5qcyc7XG5pbXBvcnQgeyBUZXh0U2VhcmNoRW5naW5lQWRhcHRlciB9IGZyb20gJy4vdGV4dFNlYXJjaEFkYXB0ZXIuanMnO1xuXG5leHBvcnQgdHlwZSBJUHJvZ3Jlc3NDYWxsYmFjayA9IChwOiBJU2VyaWFsaXplZFNlYXJjaFByb2dyZXNzSXRlbSkgPT4gdm9pZDtcbnR5cGUgSUZpbGVQcm9ncmVzc0NhbGxiYWNrID0gKHA6IElGaWxlU2VhcmNoUHJvZ3Jlc3NJdGVtKSA9PiB2b2lkO1xuXG5leHBvcnQgY2xhc3MgU2VhcmNoU2VydmljZSBpbXBsZW1lbnRzIElSYXdTZWFyY2hTZXJ2aWNlIHtcblxuXHRwcml2YXRlIHN0YXRpYyByZWFkb25seSBCQVRDSF9TSVpFID0gNTEyO1xuXG5cdHByaXZhdGUgY2FjaGVzOiB7IFtjYWNoZUtleTogc3RyaW5nXTogQ2FjaGUgfSA9IE9iamVjdC5jcmVhdGUobnVsbCk7XG5cblx0Y29uc3RydWN0b3IocHJpdmF0ZSByZWFkb25seSBwcm9jZXNzVHlwZTogSUZpbGVTZWFyY2hTdGF0c1sndHlwZSddID0gJ3NlYXJjaFByb2Nlc3MnLCBwcml2YXRlIHJlYWRvbmx5IGdldE51bVRocmVhZHM/OiAoKSA9PiBQcm9taXNlPG51bWJlciB8IHVuZGVmaW5lZD4pIHsgfVxuXG5cdGZpbGVTZWFyY2goY29uZmlnOiBJUmF3RmlsZVF1ZXJ5KTogRXZlbnQ8SVNlcmlhbGl6ZWRTZWFyY2hQcm9ncmVzc0l0ZW0gfCBJU2VyaWFsaXplZFNlYXJjaENvbXBsZXRlPiB7XG5cdFx0bGV0IHByb21pc2U6IENhbmNlbGFibGVQcm9taXNlPElTZXJpYWxpemVkU2VhcmNoU3VjY2Vzcz47XG5cblx0XHRjb25zdCBxdWVyeSA9IHJldml2ZVF1ZXJ5KGNvbmZpZyk7XG5cdFx0Y29uc3QgZW1pdHRlciA9IG5ldyBFbWl0dGVyPElTZXJpYWxpemVkU2VhcmNoUHJvZ3Jlc3NJdGVtIHwgSVNlcmlhbGl6ZWRTZWFyY2hDb21wbGV0ZT4oe1xuXHRcdFx0b25EaWRBZGRGaXJzdExpc3RlbmVyOiAoKSA9PiB7XG5cdFx0XHRcdHByb21pc2UgPSBjcmVhdGVDYW5jZWxhYmxlUHJvbWlzZShhc3luYyB0b2tlbiA9PiB7XG5cdFx0XHRcdFx0Y29uc3QgbnVtVGhyZWFkcyA9IGF3YWl0IHRoaXMuZ2V0TnVtVGhyZWFkcz8uKCk7XG5cdFx0XHRcdFx0cmV0dXJuIHRoaXMuZG9GaWxlU2VhcmNoV2l0aEVuZ2luZShGaWxlU2VhcmNoRW5naW5lLCBxdWVyeSwgcCA9PiBlbWl0dGVyLmZpcmUocCksIHRva2VuLCBTZWFyY2hTZXJ2aWNlLkJBVENIX1NJWkUsIG51bVRocmVhZHMpO1xuXHRcdFx0XHR9KTtcblxuXHRcdFx0XHRwcm9taXNlLnRoZW4oXG5cdFx0XHRcdFx0YyA9PiBlbWl0dGVyLmZpcmUoYyksXG5cdFx0XHRcdFx0ZXJyID0+IGVtaXR0ZXIuZmlyZSh7IHR5cGU6ICdlcnJvcicsIGVycm9yOiB7IG1lc3NhZ2U6IGVyci5tZXNzYWdlLCBzdGFjazogZXJyLnN0YWNrIH0gfSkpO1xuXHRcdFx0fSxcblx0XHRcdG9uRGlkUmVtb3ZlTGFzdExpc3RlbmVyOiAoKSA9PiB7XG5cdFx0XHRcdHByb21pc2UuY2FuY2VsKCk7XG5cdFx0XHR9XG5cdFx0fSk7XG5cblx0XHRyZXR1cm4gZW1pdHRlci5ldmVudDtcblx0fVxuXG5cdHRleHRTZWFyY2gocmF3UXVlcnk6IElSYXdUZXh0UXVlcnkpOiBFdmVudDxJU2VyaWFsaXplZFNlYXJjaFByb2dyZXNzSXRlbSB8IElTZXJpYWxpemVkU2VhcmNoQ29tcGxldGU+IHtcblx0XHRsZXQgcHJvbWlzZTogQ2FuY2VsYWJsZVByb21pc2U8SVNlcmlhbGl6ZWRTZWFyY2hDb21wbGV0ZT47XG5cblx0XHRjb25zdCBxdWVyeSA9IHJldml2ZVF1ZXJ5KHJhd1F1ZXJ5KTtcblx0XHRjb25zdCBlbWl0dGVyID0gbmV3IEVtaXR0ZXI8SVNlcmlhbGl6ZWRTZWFyY2hQcm9ncmVzc0l0ZW0gfCBJU2VyaWFsaXplZFNlYXJjaENvbXBsZXRlPih7XG5cdFx0XHRvbkRpZEFkZEZpcnN0TGlzdGVuZXI6ICgpID0+IHtcblx0XHRcdFx0cHJvbWlzZSA9IGNyZWF0ZUNhbmNlbGFibGVQcm9taXNlKHRva2VuID0+IHtcblx0XHRcdFx0XHRyZXR1cm4gdGhpcy5yaXBncmVwVGV4dFNlYXJjaChxdWVyeSwgcCA9PiBlbWl0dGVyLmZpcmUocCksIHRva2VuKTtcblx0XHRcdFx0fSk7XG5cblx0XHRcdFx0cHJvbWlzZS50aGVuKFxuXHRcdFx0XHRcdGMgPT4gZW1pdHRlci5maXJlKGMpLFxuXHRcdFx0XHRcdGVyciA9PiBlbWl0dGVyLmZpcmUoeyB0eXBlOiAnZXJyb3InLCBlcnJvcjogeyBtZXNzYWdlOiBlcnIubWVzc2FnZSwgc3RhY2s6IGVyci5zdGFjayB9IH0pKTtcblx0XHRcdH0sXG5cdFx0XHRvbkRpZFJlbW92ZUxhc3RMaXN0ZW5lcjogKCkgPT4ge1xuXHRcdFx0XHRwcm9taXNlLmNhbmNlbCgpO1xuXHRcdFx0fVxuXHRcdH0pO1xuXG5cdFx0cmV0dXJuIGVtaXR0ZXIuZXZlbnQ7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIHJpcGdyZXBUZXh0U2VhcmNoKGNvbmZpZzogSVRleHRRdWVyeSwgcHJvZ3Jlc3NDYWxsYmFjazogSVByb2dyZXNzQ2FsbGJhY2ssIHRva2VuOiBDYW5jZWxsYXRpb25Ub2tlbik6IFByb21pc2U8SVNlcmlhbGl6ZWRTZWFyY2hTdWNjZXNzPiB7XG5cdFx0Y29uZmlnLm1heEZpbGVTaXplID0gdGhpcy5nZXRQbGF0Zm9ybUZpbGVMaW1pdHMoKS5tYXhGaWxlU2l6ZTtcblx0XHRjb25zdCBudW1UaHJlYWRzID0gYXdhaXQgdGhpcy5nZXROdW1UaHJlYWRzPy4oKTtcblx0XHRjb25zdCBlbmdpbmUgPSBuZXcgVGV4dFNlYXJjaEVuZ2luZUFkYXB0ZXIoY29uZmlnLCBudW1UaHJlYWRzKTtcblxuXHRcdHJldHVybiBlbmdpbmUuc2VhcmNoKHRva2VuLCBwcm9ncmVzc0NhbGxiYWNrLCBwcm9ncmVzc0NhbGxiYWNrKTtcblx0fVxuXG5cdHByaXZhdGUgZ2V0UGxhdGZvcm1GaWxlTGltaXRzKCk6IHsgcmVhZG9ubHkgbWF4RmlsZVNpemU6IG51bWJlciB9IHtcblx0XHRyZXR1cm4ge1xuXHRcdFx0bWF4RmlsZVNpemU6IDE2ICogQnl0ZVNpemUuR0Jcblx0XHR9O1xuXHR9XG5cblx0ZG9GaWxlU2VhcmNoKGNvbmZpZzogSUZpbGVRdWVyeSwgbnVtVGhyZWFkczogbnVtYmVyIHwgdW5kZWZpbmVkLCBwcm9ncmVzc0NhbGxiYWNrOiBJUHJvZ3Jlc3NDYWxsYmFjaywgdG9rZW4/OiBDYW5jZWxsYXRpb25Ub2tlbik6IFByb21pc2U8SVNlcmlhbGl6ZWRTZWFyY2hTdWNjZXNzPiB7XG5cdFx0cmV0dXJuIHRoaXMuZG9GaWxlU2VhcmNoV2l0aEVuZ2luZShGaWxlU2VhcmNoRW5naW5lLCBjb25maWcsIHByb2dyZXNzQ2FsbGJhY2ssIHRva2VuLCBTZWFyY2hTZXJ2aWNlLkJBVENIX1NJWkUsIG51bVRocmVhZHMpO1xuXHR9XG5cblx0ZG9GaWxlU2VhcmNoV2l0aEVuZ2luZShFbmdpbmVDbGFzczogeyBuZXcoY29uZmlnOiBJRmlsZVF1ZXJ5LCBudW1UaHJlYWRzPzogbnVtYmVyIHwgdW5kZWZpbmVkKTogSVNlYXJjaEVuZ2luZTxJUmF3RmlsZU1hdGNoPiB9LCBjb25maWc6IElGaWxlUXVlcnksIHByb2dyZXNzQ2FsbGJhY2s6IElQcm9ncmVzc0NhbGxiYWNrLCB0b2tlbj86IENhbmNlbGxhdGlvblRva2VuLCBiYXRjaFNpemUgPSBTZWFyY2hTZXJ2aWNlLkJBVENIX1NJWkUsIHRocmVhZHM/OiBudW1iZXIpOiBQcm9taXNlPElTZXJpYWxpemVkU2VhcmNoU3VjY2Vzcz4ge1xuXHRcdGxldCByZXN1bHRDb3VudCA9IDA7XG5cdFx0Y29uc3QgZmlsZVByb2dyZXNzQ2FsbGJhY2s6IElGaWxlUHJvZ3Jlc3NDYWxsYmFjayA9IHByb2dyZXNzID0+IHtcblx0XHRcdGlmIChBcnJheS5pc0FycmF5KHByb2dyZXNzKSkge1xuXHRcdFx0XHRyZXN1bHRDb3VudCArPSBwcm9ncmVzcy5sZW5ndGg7XG5cdFx0XHRcdHByb2dyZXNzQ2FsbGJhY2socHJvZ3Jlc3MubWFwKG0gPT4gdGhpcy5yYXdNYXRjaFRvU2VhcmNoSXRlbShtKSkpO1xuXHRcdFx0fSBlbHNlIGlmICgoPElSYXdGaWxlTWF0Y2g+cHJvZ3Jlc3MpLnJlbGF0aXZlUGF0aCkge1xuXHRcdFx0XHRyZXN1bHRDb3VudCsrO1xuXHRcdFx0XHRwcm9ncmVzc0NhbGxiYWNrKHRoaXMucmF3TWF0Y2hUb1NlYXJjaEl0ZW0oPElSYXdGaWxlTWF0Y2g+cHJvZ3Jlc3MpKTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdHByb2dyZXNzQ2FsbGJhY2soPElQcm9ncmVzc01lc3NhZ2U+cHJvZ3Jlc3MpO1xuXHRcdFx0fVxuXHRcdH07XG5cblx0XHRpZiAoY29uZmlnLnNvcnRCeVNjb3JlKSB7XG5cdFx0XHRsZXQgc29ydGVkU2VhcmNoID0gdGhpcy50cnlTb3J0ZWRTZWFyY2hGcm9tQ2FjaGUoY29uZmlnLCBmaWxlUHJvZ3Jlc3NDYWxsYmFjaywgdG9rZW4pO1xuXHRcdFx0aWYgKCFzb3J0ZWRTZWFyY2gpIHtcblx0XHRcdFx0Y29uc3Qgd2Fsa2VyQ29uZmlnID0gY29uZmlnLm1heFJlc3VsdHMgPyBPYmplY3QuYXNzaWduKHt9LCBjb25maWcsIHsgbWF4UmVzdWx0czogbnVsbCB9KSA6IGNvbmZpZztcblx0XHRcdFx0Y29uc3QgZW5naW5lID0gbmV3IEVuZ2luZUNsYXNzKHdhbGtlckNvbmZpZywgdGhyZWFkcyk7XG5cdFx0XHRcdHNvcnRlZFNlYXJjaCA9IHRoaXMuZG9Tb3J0ZWRTZWFyY2goZW5naW5lLCBjb25maWcsIHByb2dyZXNzQ2FsbGJhY2ssIGZpbGVQcm9ncmVzc0NhbGxiYWNrLCB0b2tlbik7XG5cdFx0XHR9XG5cblx0XHRcdHJldHVybiBuZXcgUHJvbWlzZTxJU2VyaWFsaXplZFNlYXJjaFN1Y2Nlc3M+KChjLCBlKSA9PiB7XG5cdFx0XHRcdHNvcnRlZFNlYXJjaC50aGVuKChbcmVzdWx0LCByYXdNYXRjaGVzXSkgPT4ge1xuXHRcdFx0XHRcdGNvbnN0IHNlcmlhbGl6ZWRNYXRjaGVzID0gcmF3TWF0Y2hlcy5tYXAocmF3TWF0Y2ggPT4gdGhpcy5yYXdNYXRjaFRvU2VhcmNoSXRlbShyYXdNYXRjaCkpO1xuXHRcdFx0XHRcdHRoaXMuc2VuZFByb2dyZXNzKHNlcmlhbGl6ZWRNYXRjaGVzLCBwcm9ncmVzc0NhbGxiYWNrLCBiYXRjaFNpemUpO1xuXHRcdFx0XHRcdGMocmVzdWx0KTtcblx0XHRcdFx0fSwgZSk7XG5cdFx0XHR9KTtcblx0XHR9XG5cblx0XHRjb25zdCBlbmdpbmUgPSBuZXcgRW5naW5lQ2xhc3MoY29uZmlnLCB0aHJlYWRzKTtcblxuXHRcdHJldHVybiB0aGlzLmRvU2VhcmNoKGVuZ2luZSwgZmlsZVByb2dyZXNzQ2FsbGJhY2ssIGJhdGNoU2l6ZSwgdG9rZW4pLnRoZW4oY29tcGxldGUgPT4ge1xuXHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0bGltaXRIaXQ6IGNvbXBsZXRlLmxpbWl0SGl0LFxuXHRcdFx0XHR0eXBlOiAnc3VjY2VzcycsXG5cdFx0XHRcdHN0YXRzOiB7XG5cdFx0XHRcdFx0ZGV0YWlsU3RhdHM6IGNvbXBsZXRlLnN0YXRzLFxuXHRcdFx0XHRcdHR5cGU6IHRoaXMucHJvY2Vzc1R5cGUsXG5cdFx0XHRcdFx0ZnJvbUNhY2hlOiBmYWxzZSxcblx0XHRcdFx0XHRyZXN1bHRDb3VudCxcblx0XHRcdFx0XHRzb3J0aW5nVGltZTogdW5kZWZpbmVkXG5cdFx0XHRcdH0sXG5cdFx0XHRcdG1lc3NhZ2VzOiBbXVxuXHRcdFx0fTtcblx0XHR9KTtcblx0fVxuXG5cdHByaXZhdGUgcmF3TWF0Y2hUb1NlYXJjaEl0ZW0obWF0Y2g6IElSYXdGaWxlTWF0Y2gpOiBJU2VyaWFsaXplZEZpbGVNYXRjaCB7XG5cdFx0cmV0dXJuIHsgcGF0aDogbWF0Y2guYmFzZSA/IGpvaW4obWF0Y2guYmFzZSwgbWF0Y2gucmVsYXRpdmVQYXRoKSA6IG1hdGNoLnJlbGF0aXZlUGF0aCB9O1xuXHR9XG5cblx0cHJpdmF0ZSBkb1NvcnRlZFNlYXJjaChlbmdpbmU6IElTZWFyY2hFbmdpbmU8SVJhd0ZpbGVNYXRjaD4sIGNvbmZpZzogSUZpbGVRdWVyeSwgcHJvZ3Jlc3NDYWxsYmFjazogSVByb2dyZXNzQ2FsbGJhY2ssIGZpbGVQcm9ncmVzc0NhbGxiYWNrOiBJRmlsZVByb2dyZXNzQ2FsbGJhY2ssIHRva2VuPzogQ2FuY2VsbGF0aW9uVG9rZW4pOiBQcm9taXNlPFtJU2VyaWFsaXplZFNlYXJjaFN1Y2Nlc3MsIElSYXdGaWxlTWF0Y2hbXV0+IHtcblx0XHRjb25zdCBlbWl0dGVyID0gbmV3IEVtaXR0ZXI8SUZpbGVTZWFyY2hQcm9ncmVzc0l0ZW0+KCk7XG5cblx0XHRsZXQgYWxsUmVzdWx0c1Byb21pc2UgPSBjcmVhdGVDYW5jZWxhYmxlUHJvbWlzZSh0b2tlbiA9PiB7XG5cdFx0XHRsZXQgcmVzdWx0czogSVJhd0ZpbGVNYXRjaFtdID0gW107XG5cblx0XHRcdGNvbnN0IGlubmVyUHJvZ3Jlc3NDYWxsYmFjazogSUZpbGVQcm9ncmVzc0NhbGxiYWNrID0gcHJvZ3Jlc3MgPT4ge1xuXHRcdFx0XHRpZiAoQXJyYXkuaXNBcnJheShwcm9ncmVzcykpIHtcblx0XHRcdFx0XHRyZXN1bHRzID0gcHJvZ3Jlc3M7XG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0ZmlsZVByb2dyZXNzQ2FsbGJhY2socHJvZ3Jlc3MpO1xuXHRcdFx0XHRcdGVtaXR0ZXIuZmlyZShwcm9ncmVzcyk7XG5cdFx0XHRcdH1cblx0XHRcdH07XG5cblx0XHRcdHJldHVybiB0aGlzLmRvU2VhcmNoKGVuZ2luZSwgaW5uZXJQcm9ncmVzc0NhbGxiYWNrLCAtMSwgdG9rZW4pXG5cdFx0XHRcdC50aGVuPFtJU2VhcmNoRW5naW5lU3VjY2VzcywgSVJhd0ZpbGVNYXRjaFtdXT4ocmVzdWx0ID0+IHtcblx0XHRcdFx0XHRyZXR1cm4gW3Jlc3VsdCwgcmVzdWx0c107XG5cdFx0XHRcdH0pO1xuXHRcdH0pO1xuXG5cdFx0bGV0IGNhY2hlOiBDYWNoZTtcblx0XHRpZiAoY29uZmlnLmNhY2hlS2V5KSB7XG5cdFx0XHRjYWNoZSA9IHRoaXMuZ2V0T3JDcmVhdGVDYWNoZShjb25maWcuY2FjaGVLZXkpO1xuXHRcdFx0Y29uc3QgY2FjaGVSb3c6IElDYWNoZVJvdyA9IHtcblx0XHRcdFx0cHJvbWlzZTogYWxsUmVzdWx0c1Byb21pc2UsXG5cdFx0XHRcdGV2ZW50OiBlbWl0dGVyLmV2ZW50LFxuXHRcdFx0XHRyZXNvbHZlZDogZmFsc2Vcblx0XHRcdH07XG5cdFx0XHRjYWNoZS5yZXN1bHRzVG9TZWFyY2hDYWNoZVtjb25maWcuZmlsZVBhdHRlcm4gfHwgJyddID0gY2FjaGVSb3c7XG5cdFx0XHRhbGxSZXN1bHRzUHJvbWlzZS50aGVuKCgpID0+IHtcblx0XHRcdFx0Y2FjaGVSb3cucmVzb2x2ZWQgPSB0cnVlO1xuXHRcdFx0fSwgZXJyID0+IHtcblx0XHRcdFx0ZGVsZXRlIGNhY2hlLnJlc3VsdHNUb1NlYXJjaENhY2hlW2NvbmZpZy5maWxlUGF0dGVybiB8fCAnJ107XG5cdFx0XHR9KTtcblxuXHRcdFx0YWxsUmVzdWx0c1Byb21pc2UgPSB0aGlzLnByZXZlbnRDYW5jZWxsYXRpb24oYWxsUmVzdWx0c1Byb21pc2UpO1xuXHRcdH1cblxuXHRcdHJldHVybiBhbGxSZXN1bHRzUHJvbWlzZS50aGVuKChbcmVzdWx0LCByZXN1bHRzXSkgPT4ge1xuXHRcdFx0Y29uc3Qgc2NvcmVyQ2FjaGU6IEZ1enp5U2NvcmVyQ2FjaGUgPSBjYWNoZSA/IGNhY2hlLnNjb3JlckNhY2hlIDogT2JqZWN0LmNyZWF0ZShudWxsKTtcblx0XHRcdGNvbnN0IHNvcnRTVyA9ICh0eXBlb2YgY29uZmlnLm1heFJlc3VsdHMgIT09ICdudW1iZXInIHx8IGNvbmZpZy5tYXhSZXN1bHRzID4gMCkgJiYgU3RvcFdhdGNoLmNyZWF0ZShmYWxzZSk7XG5cdFx0XHRyZXR1cm4gdGhpcy5zb3J0UmVzdWx0cyhjb25maWcsIHJlc3VsdHMsIHNjb3JlckNhY2hlLCB0b2tlbilcblx0XHRcdFx0LnRoZW48W0lTZXJpYWxpemVkU2VhcmNoU3VjY2VzcywgSVJhd0ZpbGVNYXRjaFtdXT4oc29ydGVkUmVzdWx0cyA9PiB7XG5cdFx0XHRcdFx0Ly8gc29ydGluZ1RpbWU6IC0xIGluZGljYXRlcyBhIFwic29ydGVkXCIgc2VhcmNoIHRoYXQgd2FzIG5vdCBzb3J0ZWQsIGkuZS4gcG9wdWxhdGluZyB0aGUgY2FjaGUgd2hlbiBxdWlja2FjY2VzcyBpcyBvcGVuZWQuXG5cdFx0XHRcdFx0Ly8gQ29udHJhc3Rpbmcgd2l0aCBmaW5kRmlsZXMgd2hpY2ggaXMgbm90IHNvcnRlZCBhbmQgd2lsbCBoYXZlIHNvcnRpbmdUaW1lOiB1bmRlZmluZWRcblx0XHRcdFx0XHRjb25zdCBzb3J0aW5nVGltZSA9IHNvcnRTVyA/IHNvcnRTVy5lbGFwc2VkKCkgOiAtMTtcblxuXHRcdFx0XHRcdHJldHVybiBbe1xuXHRcdFx0XHRcdFx0dHlwZTogJ3N1Y2Nlc3MnLFxuXHRcdFx0XHRcdFx0c3RhdHM6IHtcblx0XHRcdFx0XHRcdFx0ZGV0YWlsU3RhdHM6IHJlc3VsdC5zdGF0cyxcblx0XHRcdFx0XHRcdFx0c29ydGluZ1RpbWUsXG5cdFx0XHRcdFx0XHRcdGZyb21DYWNoZTogZmFsc2UsXG5cdFx0XHRcdFx0XHRcdHR5cGU6IHRoaXMucHJvY2Vzc1R5cGUsXG5cdFx0XHRcdFx0XHRcdHJlc3VsdENvdW50OiBzb3J0ZWRSZXN1bHRzLmxlbmd0aFxuXHRcdFx0XHRcdFx0fSxcblx0XHRcdFx0XHRcdG1lc3NhZ2VzOiByZXN1bHQubWVzc2FnZXMsXG5cdFx0XHRcdFx0XHRsaW1pdEhpdDogcmVzdWx0LmxpbWl0SGl0IHx8IHR5cGVvZiBjb25maWcubWF4UmVzdWx0cyA9PT0gJ251bWJlcicgJiYgcmVzdWx0cy5sZW5ndGggPiBjb25maWcubWF4UmVzdWx0c1xuXHRcdFx0XHRcdH0sIHNvcnRlZFJlc3VsdHNdO1xuXHRcdFx0XHR9KTtcblx0XHR9KTtcblx0fVxuXG5cdHByaXZhdGUgZ2V0T3JDcmVhdGVDYWNoZShjYWNoZUtleTogc3RyaW5nKTogQ2FjaGUge1xuXHRcdGNvbnN0IGV4aXN0aW5nID0gdGhpcy5jYWNoZXNbY2FjaGVLZXldO1xuXHRcdGlmIChleGlzdGluZykge1xuXHRcdFx0cmV0dXJuIGV4aXN0aW5nO1xuXHRcdH1cblx0XHRyZXR1cm4gdGhpcy5jYWNoZXNbY2FjaGVLZXldID0gbmV3IENhY2hlKCk7XG5cdH1cblxuXHRwcml2YXRlIHRyeVNvcnRlZFNlYXJjaEZyb21DYWNoZShjb25maWc6IElGaWxlUXVlcnksIHByb2dyZXNzQ2FsbGJhY2s6IElGaWxlUHJvZ3Jlc3NDYWxsYmFjaywgdG9rZW4/OiBDYW5jZWxsYXRpb25Ub2tlbik6IFByb21pc2U8W0lTZXJpYWxpemVkU2VhcmNoU3VjY2VzcywgSVJhd0ZpbGVNYXRjaFtdXT4gfCB1bmRlZmluZWQge1xuXHRcdGNvbnN0IGNhY2hlID0gY29uZmlnLmNhY2hlS2V5ICYmIHRoaXMuY2FjaGVzW2NvbmZpZy5jYWNoZUtleV07XG5cdFx0aWYgKCFjYWNoZSkge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cblx0XHRjb25zdCBjYWNoZWQgPSB0aGlzLmdldFJlc3VsdHNGcm9tQ2FjaGUoY2FjaGUsIGNvbmZpZy5maWxlUGF0dGVybiB8fCAnJywgcHJvZ3Jlc3NDYWxsYmFjaywgdG9rZW4pO1xuXHRcdGlmIChjYWNoZWQpIHtcblx0XHRcdHJldHVybiBjYWNoZWQudGhlbigoW3Jlc3VsdCwgcmVzdWx0cywgY2FjaGVTdGF0c10pID0+IHtcblx0XHRcdFx0Y29uc3Qgc29ydFNXID0gU3RvcFdhdGNoLmNyZWF0ZShmYWxzZSk7XG5cdFx0XHRcdHJldHVybiB0aGlzLnNvcnRSZXN1bHRzKGNvbmZpZywgcmVzdWx0cywgY2FjaGUuc2NvcmVyQ2FjaGUsIHRva2VuKVxuXHRcdFx0XHRcdC50aGVuPFtJU2VyaWFsaXplZFNlYXJjaFN1Y2Nlc3MsIElSYXdGaWxlTWF0Y2hbXV0+KHNvcnRlZFJlc3VsdHMgPT4ge1xuXHRcdFx0XHRcdFx0Y29uc3Qgc29ydGluZ1RpbWUgPSBzb3J0U1cuZWxhcHNlZCgpO1xuXHRcdFx0XHRcdFx0Y29uc3Qgc3RhdHM6IElGaWxlU2VhcmNoU3RhdHMgPSB7XG5cdFx0XHRcdFx0XHRcdGZyb21DYWNoZTogdHJ1ZSxcblx0XHRcdFx0XHRcdFx0ZGV0YWlsU3RhdHM6IGNhY2hlU3RhdHMsXG5cdFx0XHRcdFx0XHRcdHR5cGU6IHRoaXMucHJvY2Vzc1R5cGUsXG5cdFx0XHRcdFx0XHRcdHJlc3VsdENvdW50OiByZXN1bHRzLmxlbmd0aCxcblx0XHRcdFx0XHRcdFx0c29ydGluZ1RpbWVcblx0XHRcdFx0XHRcdH07XG5cblx0XHRcdFx0XHRcdHJldHVybiBbXG5cdFx0XHRcdFx0XHRcdHtcblx0XHRcdFx0XHRcdFx0XHR0eXBlOiAnc3VjY2VzcycsXG5cdFx0XHRcdFx0XHRcdFx0bGltaXRIaXQ6IHJlc3VsdC5saW1pdEhpdCB8fCB0eXBlb2YgY29uZmlnLm1heFJlc3VsdHMgPT09ICdudW1iZXInICYmIHJlc3VsdHMubGVuZ3RoID4gY29uZmlnLm1heFJlc3VsdHMsXG5cdFx0XHRcdFx0XHRcdFx0c3RhdHMsXG5cdFx0XHRcdFx0XHRcdFx0bWVzc2FnZXM6IFtdLFxuXHRcdFx0XHRcdFx0XHR9IHNhdGlzZmllcyBJU2VyaWFsaXplZFNlYXJjaFN1Y2Nlc3MsXG5cdFx0XHRcdFx0XHRcdHNvcnRlZFJlc3VsdHNcblx0XHRcdFx0XHRcdF07XG5cdFx0XHRcdFx0fSk7XG5cdFx0XHR9KTtcblx0XHR9XG5cdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0fVxuXG5cdHByaXZhdGUgc29ydFJlc3VsdHMoY29uZmlnOiBJRmlsZVF1ZXJ5LCByZXN1bHRzOiBJUmF3RmlsZU1hdGNoW10sIHNjb3JlckNhY2hlOiBGdXp6eVNjb3JlckNhY2hlLCB0b2tlbj86IENhbmNlbGxhdGlvblRva2VuKTogUHJvbWlzZTxJUmF3RmlsZU1hdGNoW10+IHtcblx0XHQvLyB3ZSB1c2UgdGhlIHNhbWUgY29tcGFyZSBmdW5jdGlvbiB0aGF0IGlzIHVzZWQgbGF0ZXIgd2hlbiBzaG93aW5nIHRoZSByZXN1bHRzIHVzaW5nIGZ1enp5IHNjb3Jpbmdcblx0XHQvLyB0aGlzIGlzIHZlcnkgaW1wb3J0YW50IGJlY2F1c2Ugd2UgYXJlIGFsc28gbGltaXRpbmcgdGhlIG51bWJlciBvZiByZXN1bHRzIGJ5IGNvbmZpZy5tYXhSZXN1bHRzXG5cdFx0Ly8gYW5kIGFzIHN1Y2ggd2Ugd2FudCB0aGUgdG9wIGl0ZW1zIHRvIGJlIGluY2x1ZGVkIGluIHRoaXMgcmVzdWx0IHNldCBpZiB0aGUgbnVtYmVyIG9mIGl0ZW1zXG5cdFx0Ly8gZXhjZWVkcyBjb25maWcubWF4UmVzdWx0cy5cblx0XHRjb25zdCBxdWVyeSA9IHByZXBhcmVRdWVyeShjb25maWcuZmlsZVBhdHRlcm4gfHwgJycpO1xuXHRcdGNvbnN0IGNvbXBhcmUgPSAobWF0Y2hBOiBJUmF3RmlsZU1hdGNoLCBtYXRjaEI6IElSYXdGaWxlTWF0Y2gpID0+IGNvbXBhcmVJdGVtc0J5RnV6enlTY29yZShtYXRjaEEsIG1hdGNoQiwgcXVlcnksIHRydWUsIEZpbGVNYXRjaEl0ZW1BY2Nlc3Nvciwgc2NvcmVyQ2FjaGUpO1xuXG5cdFx0Y29uc3QgbWF4UmVzdWx0cyA9IHR5cGVvZiBjb25maWcubWF4UmVzdWx0cyA9PT0gJ251bWJlcicgPyBjb25maWcubWF4UmVzdWx0cyA6IERFRkFVTFRfTUFYX1NFQVJDSF9SRVNVTFRTO1xuXHRcdHJldHVybiBhcnJheXMudG9wQXN5bmMocmVzdWx0cywgY29tcGFyZSwgbWF4UmVzdWx0cywgMTAwMDAsIHRva2VuKTtcblx0fVxuXG5cdHByaXZhdGUgc2VuZFByb2dyZXNzKHJlc3VsdHM6IElTZXJpYWxpemVkRmlsZU1hdGNoW10sIHByb2dyZXNzQ2I6IElQcm9ncmVzc0NhbGxiYWNrLCBiYXRjaFNpemU6IG51bWJlcikge1xuXHRcdGlmIChiYXRjaFNpemUgJiYgYmF0Y2hTaXplID4gMCkge1xuXHRcdFx0Zm9yIChsZXQgaSA9IDA7IGkgPCByZXN1bHRzLmxlbmd0aDsgaSArPSBiYXRjaFNpemUpIHtcblx0XHRcdFx0cHJvZ3Jlc3NDYihyZXN1bHRzLnNsaWNlKGksIGkgKyBiYXRjaFNpemUpKTtcblx0XHRcdH1cblx0XHR9IGVsc2Uge1xuXHRcdFx0cHJvZ3Jlc3NDYihyZXN1bHRzKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIGdldFJlc3VsdHNGcm9tQ2FjaGUoY2FjaGU6IENhY2hlLCBzZWFyY2hWYWx1ZTogc3RyaW5nLCBwcm9ncmVzc0NhbGxiYWNrOiBJRmlsZVByb2dyZXNzQ2FsbGJhY2ssIHRva2VuPzogQ2FuY2VsbGF0aW9uVG9rZW4pOiBQcm9taXNlPFtJU2VhcmNoRW5naW5lU3VjY2VzcywgSVJhd0ZpbGVNYXRjaFtdLCBJQ2FjaGVkU2VhcmNoU3RhdHNdPiB8IG51bGwge1xuXHRcdGNvbnN0IGNhY2hlTG9va3VwU1cgPSBTdG9wV2F0Y2guY3JlYXRlKGZhbHNlKTtcblxuXHRcdC8vIEZpbmQgY2FjaGUgZW50cmllcyBieSBwcmVmaXggb2Ygc2VhcmNoIHZhbHVlXG5cdFx0Y29uc3QgaGFzUGF0aFNlcCA9IHNlYXJjaFZhbHVlLmluZGV4T2Yoc2VwKSA+PSAwO1xuXHRcdGxldCBjYWNoZWRSb3c6IElDYWNoZVJvdyB8IHVuZGVmaW5lZDtcblx0XHRmb3IgKGNvbnN0IHByZXZpb3VzU2VhcmNoIGluIGNhY2hlLnJlc3VsdHNUb1NlYXJjaENhY2hlKSB7XG5cdFx0XHQvLyBJZiB3ZSBuYXJyb3cgZG93biwgd2UgbWlnaHQgYmUgYWJsZSB0byByZXVzZSB0aGUgY2FjaGVkIHJlc3VsdHNcblx0XHRcdGlmIChzZWFyY2hWYWx1ZS5zdGFydHNXaXRoKHByZXZpb3VzU2VhcmNoKSkge1xuXHRcdFx0XHRpZiAoaGFzUGF0aFNlcCAmJiBwcmV2aW91c1NlYXJjaC5pbmRleE9mKHNlcCkgPCAwICYmIHByZXZpb3VzU2VhcmNoICE9PSAnJykge1xuXHRcdFx0XHRcdGNvbnRpbnVlOyAvLyBzaW5jZSBhIHBhdGggY2hhcmFjdGVyIHdpZGVucyB0aGUgc2VhcmNoIGZvciBwb3RlbnRpYWwgbW9yZSBtYXRjaGVzLCByZXF1aXJlIGl0IGluIHByZXZpb3VzIHNlYXJjaCB0b29cblx0XHRcdFx0fVxuXG5cdFx0XHRcdGNvbnN0IHJvdyA9IGNhY2hlLnJlc3VsdHNUb1NlYXJjaENhY2hlW3ByZXZpb3VzU2VhcmNoXTtcblx0XHRcdFx0Y2FjaGVkUm93ID0ge1xuXHRcdFx0XHRcdHByb21pc2U6IHRoaXMucHJldmVudENhbmNlbGxhdGlvbihyb3cucHJvbWlzZSksXG5cdFx0XHRcdFx0ZXZlbnQ6IHJvdy5ldmVudCxcblx0XHRcdFx0XHRyZXNvbHZlZDogcm93LnJlc29sdmVkXG5cdFx0XHRcdH07XG5cdFx0XHRcdGJyZWFrO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdGlmICghY2FjaGVkUm93KSB7XG5cdFx0XHRyZXR1cm4gbnVsbDtcblx0XHR9XG5cblx0XHRjb25zdCBjYWNoZUxvb2t1cFRpbWUgPSBjYWNoZUxvb2t1cFNXLmVsYXBzZWQoKTtcblx0XHRjb25zdCBjYWNoZUZpbHRlclNXID0gU3RvcFdhdGNoLmNyZWF0ZShmYWxzZSk7XG5cblx0XHRjb25zdCBsaXN0ZW5lciA9IGNhY2hlZFJvdy5ldmVudChwcm9ncmVzc0NhbGxiYWNrKTtcblx0XHRpZiAodG9rZW4pIHtcblx0XHRcdHRva2VuLm9uQ2FuY2VsbGF0aW9uUmVxdWVzdGVkKCgpID0+IHtcblx0XHRcdFx0bGlzdGVuZXIuZGlzcG9zZSgpO1xuXHRcdFx0fSk7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIGNhY2hlZFJvdy5wcm9taXNlLnRoZW48W0lTZWFyY2hFbmdpbmVTdWNjZXNzLCBJUmF3RmlsZU1hdGNoW10sIElDYWNoZWRTZWFyY2hTdGF0c10+KChbY29tcGxldGUsIGNhY2hlZEVudHJpZXNdKSA9PiB7XG5cdFx0XHRpZiAodG9rZW4gJiYgdG9rZW4uaXNDYW5jZWxsYXRpb25SZXF1ZXN0ZWQpIHtcblx0XHRcdFx0dGhyb3cgY2FuY2VsZWQoKTtcblx0XHRcdH1cblxuXHRcdFx0Ly8gUGF0dGVybiBtYXRjaCBvbiByZXN1bHRzXG5cdFx0XHRjb25zdCByZXN1bHRzOiBJUmF3RmlsZU1hdGNoW10gPSBbXTtcblx0XHRcdGNvbnN0IG5vcm1hbGl6ZWRTZWFyY2hWYWx1ZUxvd2VyY2FzZSA9IHByZXBhcmVRdWVyeShzZWFyY2hWYWx1ZSkubm9ybWFsaXplZExvd2VyY2FzZTtcblx0XHRcdGZvciAoY29uc3QgZW50cnkgb2YgY2FjaGVkRW50cmllcykge1xuXG5cdFx0XHRcdC8vIENoZWNrIGlmIHRoaXMgZW50cnkgaXMgYSBtYXRjaCBmb3IgdGhlIHNlYXJjaCB2YWx1ZVxuXHRcdFx0XHRpZiAoIWlzRmlsZVBhdHRlcm5NYXRjaChlbnRyeSwgbm9ybWFsaXplZFNlYXJjaFZhbHVlTG93ZXJjYXNlKSkge1xuXHRcdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0cmVzdWx0cy5wdXNoKGVudHJ5KTtcblx0XHRcdH1cblxuXHRcdFx0cmV0dXJuIFtjb21wbGV0ZSwgcmVzdWx0cywge1xuXHRcdFx0XHRjYWNoZVdhc1Jlc29sdmVkOiBjYWNoZWRSb3cucmVzb2x2ZWQsXG5cdFx0XHRcdGNhY2hlTG9va3VwVGltZSxcblx0XHRcdFx0Y2FjaGVGaWx0ZXJUaW1lOiBjYWNoZUZpbHRlclNXLmVsYXBzZWQoKSxcblx0XHRcdFx0Y2FjaGVFbnRyeUNvdW50OiBjYWNoZWRFbnRyaWVzLmxlbmd0aFxuXHRcdFx0fV07XG5cdFx0fSk7XG5cdH1cblxuXG5cblx0cHJpdmF0ZSBkb1NlYXJjaChlbmdpbmU6IElTZWFyY2hFbmdpbmU8SVJhd0ZpbGVNYXRjaD4sIHByb2dyZXNzQ2FsbGJhY2s6IElGaWxlUHJvZ3Jlc3NDYWxsYmFjaywgYmF0Y2hTaXplOiBudW1iZXIsIHRva2VuPzogQ2FuY2VsbGF0aW9uVG9rZW4pOiBQcm9taXNlPElTZWFyY2hFbmdpbmVTdWNjZXNzPiB7XG5cdFx0cmV0dXJuIG5ldyBQcm9taXNlPElTZWFyY2hFbmdpbmVTdWNjZXNzPigoYywgZSkgPT4ge1xuXHRcdFx0bGV0IGJhdGNoOiBJUmF3RmlsZU1hdGNoW10gPSBbXTtcblx0XHRcdHRva2VuPy5vbkNhbmNlbGxhdGlvblJlcXVlc3RlZCgoKSA9PiBlbmdpbmUuY2FuY2VsKCkpO1xuXG5cdFx0XHRlbmdpbmUuc2VhcmNoKChtYXRjaCkgPT4ge1xuXHRcdFx0XHRpZiAobWF0Y2gpIHtcblx0XHRcdFx0XHRpZiAoYmF0Y2hTaXplKSB7XG5cdFx0XHRcdFx0XHRiYXRjaC5wdXNoKG1hdGNoKTtcblx0XHRcdFx0XHRcdGlmIChiYXRjaFNpemUgPiAwICYmIGJhdGNoLmxlbmd0aCA+PSBiYXRjaFNpemUpIHtcblx0XHRcdFx0XHRcdFx0cHJvZ3Jlc3NDYWxsYmFjayhiYXRjaCk7XG5cdFx0XHRcdFx0XHRcdGJhdGNoID0gW107XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRcdHByb2dyZXNzQ2FsbGJhY2sobWF0Y2gpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0fSwgKHByb2dyZXNzKSA9PiB7XG5cdFx0XHRcdHByb2dyZXNzQ2FsbGJhY2socHJvZ3Jlc3MpO1xuXHRcdFx0fSwgKGVycm9yLCBjb21wbGV0ZSkgPT4ge1xuXHRcdFx0XHRpZiAoYmF0Y2gubGVuZ3RoKSB7XG5cdFx0XHRcdFx0cHJvZ3Jlc3NDYWxsYmFjayhiYXRjaCk7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRpZiAoZXJyb3IpIHtcblx0XHRcdFx0XHRwcm9ncmVzc0NhbGxiYWNrKHsgbWVzc2FnZTogJ1NlYXJjaCBmaW5pc2hlZC4gRXJyb3I6ICcgKyBlcnJvci5tZXNzYWdlIH0pO1xuXHRcdFx0XHRcdGUoZXJyb3IpO1xuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdHByb2dyZXNzQ2FsbGJhY2soeyBtZXNzYWdlOiAnU2VhcmNoIGZpbmlzaGVkLiBTdGF0czogJyArIEpTT04uc3RyaW5naWZ5KGNvbXBsZXRlLnN0YXRzKSB9KTtcblx0XHRcdFx0XHRjKGNvbXBsZXRlKTtcblx0XHRcdFx0fVxuXHRcdFx0fSk7XG5cdFx0fSk7XG5cdH1cblxuXHRjbGVhckNhY2hlKGNhY2hlS2V5OiBzdHJpbmcpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRkZWxldGUgdGhpcy5jYWNoZXNbY2FjaGVLZXldO1xuXHRcdHJldHVybiBQcm9taXNlLnJlc29sdmUodW5kZWZpbmVkKTtcblx0fVxuXG5cdC8qKlxuXHQgKiBSZXR1cm4gYSBDYW5jZWxhYmxlUHJvbWlzZSB3aGljaCBpcyBub3QgYWN0dWFsbHkgY2FuY2VsYWJsZVxuXHQgKiBUT0RPQHJvYiAtIElzIHRoaXMgcmVhbGx5IG5lZWRlZD9cblx0ICovXG5cdHByaXZhdGUgcHJldmVudENhbmNlbGxhdGlvbjxDPihwcm9taXNlOiBDYW5jZWxhYmxlUHJvbWlzZTxDPik6IENhbmNlbGFibGVQcm9taXNlPEM+IHtcblx0XHRyZXR1cm4gbmV3IGNsYXNzIGltcGxlbWVudHMgQ2FuY2VsYWJsZVByb21pc2U8Qz4ge1xuXHRcdFx0Z2V0IFtTeW1ib2wudG9TdHJpbmdUYWddKCkgeyByZXR1cm4gdGhpcy50b1N0cmluZygpOyB9XG5cdFx0XHRjYW5jZWwoKSB7XG5cdFx0XHRcdC8vIERvIG5vdGhpbmdcblx0XHRcdH1cblx0XHRcdHRoZW48VFJlc3VsdDEgPSBDLCBUUmVzdWx0MiA9IG5ldmVyPihyZXNvbHZlPzogKCh2YWx1ZTogQykgPT4gVFJlc3VsdDEgfCBQcm9taXNlPFRSZXN1bHQxPikgfCB1bmRlZmluZWQgfCBudWxsLCByZWplY3Q/OiAoKHJlYXNvbjogYW55KSA9PiBUUmVzdWx0MiB8IFByb21pc2U8VFJlc3VsdDI+KSB8IHVuZGVmaW5lZCB8IG51bGwpOiBQcm9taXNlPFRSZXN1bHQxIHwgVFJlc3VsdDI+IHtcblx0XHRcdFx0cmV0dXJuIHByb21pc2UudGhlbihyZXNvbHZlLCByZWplY3QpO1xuXHRcdFx0fVxuXHRcdFx0Y2F0Y2gocmVqZWN0PzogYW55KSB7XG5cdFx0XHRcdHJldHVybiB0aGlzLnRoZW4odW5kZWZpbmVkLCByZWplY3QpO1xuXHRcdFx0fVxuXHRcdFx0ZmluYWxseShvbkZpbmFsbHk6IGFueSkge1xuXHRcdFx0XHRyZXR1cm4gcHJvbWlzZS5maW5hbGx5KG9uRmluYWxseSk7XG5cdFx0XHR9XG5cdFx0fTtcblx0fVxufVxuXG5pbnRlcmZhY2UgSUNhY2hlUm93IHtcblx0Ly8gVE9ET0Byb2Jsb3UgLSBuZXZlciBhY3R1YWxseSBjYW5jZWxlZFxuXHRwcm9taXNlOiBDYW5jZWxhYmxlUHJvbWlzZTxbSVNlYXJjaEVuZ2luZVN1Y2Nlc3MsIElSYXdGaWxlTWF0Y2hbXV0+O1xuXHRyZXNvbHZlZDogYm9vbGVhbjtcblx0cmVhZG9ubHkgZXZlbnQ6IEV2ZW50PElGaWxlU2VhcmNoUHJvZ3Jlc3NJdGVtPjtcbn1cblxuY2xhc3MgQ2FjaGUge1xuXG5cdHJlc3VsdHNUb1NlYXJjaENhY2hlOiB7IFtzZWFyY2hWYWx1ZTogc3RyaW5nXTogSUNhY2hlUm93IH0gPSBPYmplY3QuY3JlYXRlKG51bGwpO1xuXG5cdHNjb3JlckNhY2hlOiBGdXp6eVNjb3JlckNhY2hlID0gT2JqZWN0LmNyZWF0ZShudWxsKTtcbn1cblxuY29uc3QgRmlsZU1hdGNoSXRlbUFjY2Vzc29yID0gbmV3IGNsYXNzIGltcGxlbWVudHMgSUl0ZW1BY2Nlc3NvcjxJUmF3RmlsZU1hdGNoPiB7XG5cblx0Z2V0SXRlbUxhYmVsKG1hdGNoOiBJUmF3RmlsZU1hdGNoKTogc3RyaW5nIHtcblx0XHRyZXR1cm4gYmFzZW5hbWUobWF0Y2gucmVsYXRpdmVQYXRoKTsgLy8gZS5nLiBteUZpbGUudHh0XG5cdH1cblxuXHRnZXRJdGVtRGVzY3JpcHRpb24obWF0Y2g6IElSYXdGaWxlTWF0Y2gpOiBzdHJpbmcge1xuXHRcdHJldHVybiBkaXJuYW1lKG1hdGNoLnJlbGF0aXZlUGF0aCk7IC8vIGUuZy4gc29tZS9wYXRoL3RvL2ZpbGVcblx0fVxuXG5cdGdldEl0ZW1QYXRoKG1hdGNoOiBJUmF3RmlsZU1hdGNoKTogc3RyaW5nIHtcblx0XHRyZXR1cm4gbWF0Y2gucmVsYXRpdmVQYXRoOyAvLyBlLmcuIHNvbWUvcGF0aC90by9maWxlL215RmlsZS50eHRcblx0fVxufTtcblxuZnVuY3Rpb24gcmV2aXZlUXVlcnk8VSBleHRlbmRzIElSYXdRdWVyeT4ocmF3UXVlcnk6IFUpOiBVIGV4dGVuZHMgSVJhd1RleHRRdWVyeSA/IElUZXh0UXVlcnkgOiBJRmlsZVF1ZXJ5IHtcblx0cmV0dXJuIHtcblx0XHQvLyBlc2xpbnQtZGlzYWJsZS1uZXh0LWxpbmUgbG9jYWwvY29kZS1uby1hbnktY2FzdHNcblx0XHQuLi48YW55PnJhd1F1ZXJ5LCAvLyBUT0RPXG5cdFx0Li4ue1xuXHRcdFx0Zm9sZGVyUXVlcmllczogcmF3UXVlcnkuZm9sZGVyUXVlcmllcyAmJiByYXdRdWVyeS5mb2xkZXJRdWVyaWVzLm1hcChyZXZpdmVGb2xkZXJRdWVyeSksXG5cdFx0XHRleHRyYUZpbGVSZXNvdXJjZXM6IHJhd1F1ZXJ5LmV4dHJhRmlsZVJlc291cmNlcyAmJiByYXdRdWVyeS5leHRyYUZpbGVSZXNvdXJjZXMubWFwKGNvbXBvbmVudHMgPT4gVVJJLnJldml2ZShjb21wb25lbnRzKSlcblx0XHR9XG5cdH07XG59XG5cbmZ1bmN0aW9uIHJldml2ZUZvbGRlclF1ZXJ5KHJhd0ZvbGRlclF1ZXJ5OiBJRm9sZGVyUXVlcnk8VXJpQ29tcG9uZW50cz4pOiBJRm9sZGVyUXVlcnk8VVJJPiB7XG5cdHJldHVybiByZXZpdmUocmF3Rm9sZGVyUXVlcnkpO1xufVxuIl0sCiAgIm1hcHBpbmdzIjogIkFBS0EsWUFBWSxZQUFZO0FBQ3hCLFNBQTRCLCtCQUErQjtBQUUzRCxTQUFTLGdCQUFnQjtBQUN6QixTQUFTLGVBQXNCO0FBQy9CLFNBQVMsMEJBQTJELG9CQUFvQjtBQUN4RixTQUFTLGNBQWM7QUFDdkIsU0FBUyxVQUFVLFNBQVMsTUFBTSxXQUFXO0FBQzdDLFNBQVMsaUJBQWlCO0FBQzFCLFNBQVMsV0FBMEI7QUFDbkMsU0FBUyxnQkFBZ0I7QUFDekIsU0FBUyw0QkFBaVcsMEJBQXNDO0FB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
