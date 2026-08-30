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
import { IModelService } from "../../../../editor/common/services/model.js";
import { IFileService } from "../../../../platform/files/common/files.js";
import { IInstantiationService } from "../../../../platform/instantiation/common/instantiation.js";
import { ILogService } from "../../../../platform/log/common/log.js";
import { ITelemetryService } from "../../../../platform/telemetry/common/telemetry.js";
import { IEditorService } from "../../editor/common/editorService.js";
import { IExtensionService } from "../../extensions/common/extensions.js";
import { ISearchService, SearchProviderType, TextSearchCompleteMessageType } from "../common/search.js";
import { SearchService } from "../common/searchService.js";
import { IUriIdentityService } from "../../../../platform/uriIdentity/common/uriIdentity.js";
import { logOnceWebWorkerWarning } from "../../../../base/common/worker/webWorker.js";
import { Disposable, DisposableStore } from "../../../../base/common/lifecycle.js";
import { WebWorkerDescriptor } from "../../../../platform/webWorker/browser/webWorkerDescriptor.js";
import { IWebWorkerService } from "../../../../platform/webWorker/browser/webWorkerService.js";
import { InstantiationType, registerSingleton } from "../../../../platform/instantiation/common/extensions.js";
import { LocalFileSearchWorkerHost } from "../common/localFileSearchWorkerTypes.js";
import { memoize } from "../../../../base/common/decorators.js";
import { FileAccess, Schemas } from "../../../../base/common/network.js";
import { URI } from "../../../../base/common/uri.js";
import { Emitter } from "../../../../base/common/event.js";
import { localize } from "../../../../nls.js";
import { WebFileSystemAccess } from "../../../../platform/files/browser/webFileSystemAccess.js";
import { revive } from "../../../../base/common/marshalling.js";
let RemoteSearchService = class extends SearchService {
  constructor(modelService, editorService, telemetryService, logService, extensionService, fileService, instantiationService, uriIdentityService) {
    super(modelService, editorService, telemetryService, logService, extensionService, fileService, uriIdentityService);
    this.instantiationService = instantiationService;
    const searchProvider = this.instantiationService.createInstance(LocalFileSearchWorkerClient);
    this.registerSearchResultProvider(Schemas.file, SearchProviderType.file, searchProvider);
    this.registerSearchResultProvider(Schemas.file, SearchProviderType.text, searchProvider);
  }
};
RemoteSearchService = __decorateClass([
  __decorateParam(0, IModelService),
  __decorateParam(1, IEditorService),
  __decorateParam(2, ITelemetryService),
  __decorateParam(3, ILogService),
  __decorateParam(4, IExtensionService),
  __decorateParam(5, IFileService),
  __decorateParam(6, IInstantiationService),
  __decorateParam(7, IUriIdentityService)
], RemoteSearchService);
let LocalFileSearchWorkerClient = class extends Disposable {
  constructor(fileService, uriIdentityService, webWorkerService) {
    super();
    this.fileService = fileService;
    this.uriIdentityService = uriIdentityService;
    this.webWorkerService = webWorkerService;
    this._onDidReceiveTextSearchMatch = this._register(new Emitter());
    this.onDidReceiveTextSearchMatch = this._onDidReceiveTextSearchMatch.event;
    this.queryId = 0;
    this._worker = null;
  }
  async getAIName() {
    return void 0;
  }
  sendTextSearchMatch(match, queryId) {
    this._onDidReceiveTextSearchMatch.fire({ match, queryId });
  }
  get fileSystemProvider() {
    return this.fileService.getProvider(Schemas.file);
  }
  async cancelQuery(queryId) {
    const proxy = this._getOrCreateWorker().proxy;
    proxy.$cancelQuery(queryId);
  }
  async textSearch(query, onProgress, token) {
    try {
      const queryDisposables = new DisposableStore();
      const proxy = this._getOrCreateWorker().proxy;
      const results = [];
      let limitHit = false;
      await Promise.all(query.folderQueries.map(async (fq) => {
        const queryId = this.queryId++;
        queryDisposables.add(token?.onCancellationRequested((e) => this.cancelQuery(queryId)) || Disposable.None);
        const handle = await this.fileSystemProvider.getHandle(fq.folder);
        if (!handle || !WebFileSystemAccess.isFileSystemDirectoryHandle(handle)) {
          console.error("Could not get directory handle for ", fq);
          return;
        }
        const reviveMatch = (result2) => ({
          resource: URI.revive(result2.resource),
          results: revive(result2.results)
        });
        queryDisposables.add(this.onDidReceiveTextSearchMatch((e) => {
          if (e.queryId === queryId) {
            onProgress?.(reviveMatch(e.match));
          }
        }));
        const ignorePathCasing = this.uriIdentityService.extUri.ignorePathCasing(fq.folder);
        const folderResults = await proxy.$searchDirectory(handle, query, fq, ignorePathCasing, queryId);
        for (const folderResult of folderResults.results) {
          results.push(revive(folderResult));
        }
        if (folderResults.limitHit) {
          limitHit = true;
        }
      }));
      queryDisposables.dispose();
      const result = { messages: [], results, limitHit };
      return result;
    } catch (e) {
      console.error("Error performing web worker text search", e);
      return {
        results: [],
        messages: [{
          text: localize("errorSearchText", "Unable to search with Web Worker text searcher"),
          type: TextSearchCompleteMessageType.Warning
        }]
      };
    }
  }
  async fileSearch(query, token) {
    try {
      const queryDisposables = new DisposableStore();
      let limitHit = false;
      const proxy = this._getOrCreateWorker().proxy;
      const results = [];
      await Promise.all(query.folderQueries.map(async (fq) => {
        const queryId = this.queryId++;
        queryDisposables.add(token?.onCancellationRequested((e) => this.cancelQuery(queryId)) || Disposable.None);
        const handle = await this.fileSystemProvider.getHandle(fq.folder);
        if (!handle || !WebFileSystemAccess.isFileSystemDirectoryHandle(handle)) {
          console.error("Could not get directory handle for ", fq);
          return;
        }
        const caseSensitive = this.uriIdentityService.extUri.ignorePathCasing(fq.folder);
        const folderResults = await proxy.$listDirectory(handle, query, fq, caseSensitive, queryId);
        for (const folderResult of folderResults.results) {
          results.push({ resource: URI.joinPath(fq.folder, folderResult) });
        }
        if (folderResults.limitHit) {
          limitHit = true;
        }
      }));
      queryDisposables.dispose();
      const result = { messages: [], results, limitHit };
      return result;
    } catch (e) {
      console.error("Error performing web worker file search", e);
      return {
        results: [],
        messages: [{
          text: localize("errorSearchFile", "Unable to search with Web Worker file searcher"),
          type: TextSearchCompleteMessageType.Warning
        }]
      };
    }
  }
  async clearCache(cacheKey) {
    if (this.cache?.key === cacheKey) {
      this.cache = void 0;
    }
  }
  _getOrCreateWorker() {
    if (!this._worker) {
      try {
        this._worker = this._register(this.webWorkerService.createWorkerClient(
          new WebWorkerDescriptor({
            esmModuleLocation: FileAccess.asBrowserUri("vs/workbench/services/search/worker/localFileSearchMain.js"),
            label: "LocalFileSearchWorker"
          })
        ));
        LocalFileSearchWorkerHost.setChannel(this._worker, {
          $sendTextSearchMatch: (match, queryId) => {
            return this.sendTextSearchMatch(match, queryId);
          }
        });
      } catch (err) {
        logOnceWebWorkerWarning(err);
        throw err;
      }
    }
    return this._worker;
  }
};
__decorateClass([
  memoize
], LocalFileSearchWorkerClient.prototype, "fileSystemProvider", 1);
LocalFileSearchWorkerClient = __decorateClass([
  __decorateParam(0, IFileService),
  __decorateParam(1, IUriIdentityService),
  __decorateParam(2, IWebWorkerService)
], LocalFileSearchWorkerClient);
registerSingleton(ISearchService, RemoteSearchService, InstantiationType.Delayed);
export {
  LocalFileSearchWorkerClient,
  RemoteSearchService
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXHNlcnZpY2VzXFxzZWFyY2hcXGJyb3dzZXJcXHNlYXJjaFNlcnZpY2UudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgeyBDYW5jZWxsYXRpb25Ub2tlbiB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2NhbmNlbGxhdGlvbi5qcyc7XG5pbXBvcnQgeyBJTW9kZWxTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9zZXJ2aWNlcy9tb2RlbC5qcyc7XG5pbXBvcnQgeyBJRmlsZVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9maWxlcy9jb21tb24vZmlsZXMuanMnO1xuaW1wb3J0IHsgSUluc3RhbnRpYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vaW5zdGFudGlhdGlvbi9jb21tb24vaW5zdGFudGlhdGlvbi5qcyc7XG5pbXBvcnQgeyBJTG9nU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2xvZy9jb21tb24vbG9nLmpzJztcbmltcG9ydCB7IElUZWxlbWV0cnlTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vdGVsZW1ldHJ5L2NvbW1vbi90ZWxlbWV0cnkuanMnO1xuaW1wb3J0IHsgSUVkaXRvclNlcnZpY2UgfSBmcm9tICcuLi8uLi9lZGl0b3IvY29tbW9uL2VkaXRvclNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSUV4dGVuc2lvblNlcnZpY2UgfSBmcm9tICcuLi8uLi9leHRlbnNpb25zL2NvbW1vbi9leHRlbnNpb25zLmpzJztcbmltcG9ydCB7IElGaWxlTWF0Y2gsIElGaWxlUXVlcnksIElTZWFyY2hDb21wbGV0ZSwgSVNlYXJjaFByb2dyZXNzSXRlbSwgSVNlYXJjaFJlc3VsdFByb3ZpZGVyLCBJU2VhcmNoU2VydmljZSwgSVRleHRRdWVyeSwgU2VhcmNoUHJvdmlkZXJUeXBlLCBUZXh0U2VhcmNoQ29tcGxldGVNZXNzYWdlVHlwZSB9IGZyb20gJy4uL2NvbW1vbi9zZWFyY2guanMnO1xuaW1wb3J0IHsgU2VhcmNoU2VydmljZSB9IGZyb20gJy4uL2NvbW1vbi9zZWFyY2hTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElVcmlJZGVudGl0eVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS91cmlJZGVudGl0eS9jb21tb24vdXJpSWRlbnRpdHkuanMnO1xuaW1wb3J0IHsgSVdlYldvcmtlckNsaWVudCwgbG9nT25jZVdlYldvcmtlcldhcm5pbmcgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi93b3JrZXIvd2ViV29ya2VyLmpzJztcbmltcG9ydCB7IERpc3Bvc2FibGUsIERpc3Bvc2FibGVTdG9yZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBXZWJXb3JrZXJEZXNjcmlwdG9yIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vd2ViV29ya2VyL2Jyb3dzZXIvd2ViV29ya2VyRGVzY3JpcHRvci5qcyc7XG5pbXBvcnQgeyBJV2ViV29ya2VyU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3dlYldvcmtlci9icm93c2VyL3dlYldvcmtlclNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSW5zdGFudGlhdGlvblR5cGUsIHJlZ2lzdGVyU2luZ2xldG9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vaW5zdGFudGlhdGlvbi9jb21tb24vZXh0ZW5zaW9ucy5qcyc7XG5pbXBvcnQgeyBJTG9jYWxGaWxlU2VhcmNoV29ya2VyLCBMb2NhbEZpbGVTZWFyY2hXb3JrZXJIb3N0IH0gZnJvbSAnLi4vY29tbW9uL2xvY2FsRmlsZVNlYXJjaFdvcmtlclR5cGVzLmpzJztcbmltcG9ydCB7IG1lbW9pemUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9kZWNvcmF0b3JzLmpzJztcbmltcG9ydCB7IEhUTUxGaWxlU3lzdGVtUHJvdmlkZXIgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9maWxlcy9icm93c2VyL2h0bWxGaWxlU3lzdGVtUHJvdmlkZXIuanMnO1xuaW1wb3J0IHsgRmlsZUFjY2VzcywgU2NoZW1hcyB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL25ldHdvcmsuanMnO1xuaW1wb3J0IHsgVVJJLCBVcmlDb21wb25lbnRzIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdXJpLmpzJztcbmltcG9ydCB7IEVtaXR0ZXIsIEV2ZW50IH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vZXZlbnQuanMnO1xuaW1wb3J0IHsgbG9jYWxpemUgfSBmcm9tICcuLi8uLi8uLi8uLi9ubHMuanMnO1xuaW1wb3J0IHsgV2ViRmlsZVN5c3RlbUFjY2VzcyB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2ZpbGVzL2Jyb3dzZXIvd2ViRmlsZVN5c3RlbUFjY2Vzcy5qcyc7XG5pbXBvcnQgeyByZXZpdmUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9tYXJzaGFsbGluZy5qcyc7XG5cbmV4cG9ydCBjbGFzcyBSZW1vdGVTZWFyY2hTZXJ2aWNlIGV4dGVuZHMgU2VhcmNoU2VydmljZSB7XG5cdGNvbnN0cnVjdG9yKFxuXHRcdEBJTW9kZWxTZXJ2aWNlIG1vZGVsU2VydmljZTogSU1vZGVsU2VydmljZSxcblx0XHRASUVkaXRvclNlcnZpY2UgZWRpdG9yU2VydmljZTogSUVkaXRvclNlcnZpY2UsXG5cdFx0QElUZWxlbWV0cnlTZXJ2aWNlIHRlbGVtZXRyeVNlcnZpY2U6IElUZWxlbWV0cnlTZXJ2aWNlLFxuXHRcdEBJTG9nU2VydmljZSBsb2dTZXJ2aWNlOiBJTG9nU2VydmljZSxcblx0XHRASUV4dGVuc2lvblNlcnZpY2UgZXh0ZW5zaW9uU2VydmljZTogSUV4dGVuc2lvblNlcnZpY2UsXG5cdFx0QElGaWxlU2VydmljZSBmaWxlU2VydmljZTogSUZpbGVTZXJ2aWNlLFxuXHRcdEBJSW5zdGFudGlhdGlvblNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBpbnN0YW50aWF0aW9uU2VydmljZTogSUluc3RhbnRpYXRpb25TZXJ2aWNlLFxuXHRcdEBJVXJpSWRlbnRpdHlTZXJ2aWNlIHVyaUlkZW50aXR5U2VydmljZTogSVVyaUlkZW50aXR5U2VydmljZSxcblx0KSB7XG5cdFx0c3VwZXIobW9kZWxTZXJ2aWNlLCBlZGl0b3JTZXJ2aWNlLCB0ZWxlbWV0cnlTZXJ2aWNlLCBsb2dTZXJ2aWNlLCBleHRlbnNpb25TZXJ2aWNlLCBmaWxlU2VydmljZSwgdXJpSWRlbnRpdHlTZXJ2aWNlKTtcblx0XHRjb25zdCBzZWFyY2hQcm92aWRlciA9IHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoTG9jYWxGaWxlU2VhcmNoV29ya2VyQ2xpZW50KTtcblx0XHR0aGlzLnJlZ2lzdGVyU2VhcmNoUmVzdWx0UHJvdmlkZXIoU2NoZW1hcy5maWxlLCBTZWFyY2hQcm92aWRlclR5cGUuZmlsZSwgc2VhcmNoUHJvdmlkZXIpO1xuXHRcdHRoaXMucmVnaXN0ZXJTZWFyY2hSZXN1bHRQcm92aWRlcihTY2hlbWFzLmZpbGUsIFNlYXJjaFByb3ZpZGVyVHlwZS50ZXh0LCBzZWFyY2hQcm92aWRlcik7XG5cdH1cbn1cblxuZXhwb3J0IGNsYXNzIExvY2FsRmlsZVNlYXJjaFdvcmtlckNsaWVudCBleHRlbmRzIERpc3Bvc2FibGUgaW1wbGVtZW50cyBJU2VhcmNoUmVzdWx0UHJvdmlkZXIge1xuXG5cdHByb3RlY3RlZCBfd29ya2VyOiBJV2ViV29ya2VyQ2xpZW50PElMb2NhbEZpbGVTZWFyY2hXb3JrZXI+IHwgbnVsbDtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkRpZFJlY2VpdmVUZXh0U2VhcmNoTWF0Y2ggPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjx7IG1hdGNoOiBJRmlsZU1hdGNoPFVyaUNvbXBvbmVudHM+OyBxdWVyeUlkOiBudW1iZXIgfT4oKSk7XG5cdHJlYWRvbmx5IG9uRGlkUmVjZWl2ZVRleHRTZWFyY2hNYXRjaDogRXZlbnQ8eyBtYXRjaDogSUZpbGVNYXRjaDxVcmlDb21wb25lbnRzPjsgcXVlcnlJZDogbnVtYmVyIH0+ID0gdGhpcy5fb25EaWRSZWNlaXZlVGV4dFNlYXJjaE1hdGNoLmV2ZW50O1xuXG5cdHByaXZhdGUgY2FjaGU6IHsga2V5OiBzdHJpbmc7IGNhY2hlOiBJU2VhcmNoQ29tcGxldGUgfSB8IHVuZGVmaW5lZDtcblxuXHRwcml2YXRlIHF1ZXJ5SWQ6IG51bWJlciA9IDA7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0QElGaWxlU2VydmljZSBwcml2YXRlIGZpbGVTZXJ2aWNlOiBJRmlsZVNlcnZpY2UsXG5cdFx0QElVcmlJZGVudGl0eVNlcnZpY2UgcHJpdmF0ZSB1cmlJZGVudGl0eVNlcnZpY2U6IElVcmlJZGVudGl0eVNlcnZpY2UsXG5cdFx0QElXZWJXb3JrZXJTZXJ2aWNlIHByaXZhdGUgd2ViV29ya2VyU2VydmljZTogSVdlYldvcmtlclNlcnZpY2UsXG5cdCkge1xuXHRcdHN1cGVyKCk7XG5cdFx0dGhpcy5fd29ya2VyID0gbnVsbDtcblx0fVxuXG5cdGFzeW5jIGdldEFJTmFtZSgpOiBQcm9taXNlPHN0cmluZyB8IHVuZGVmaW5lZD4ge1xuXHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdH1cblxuXHRzZW5kVGV4dFNlYXJjaE1hdGNoKG1hdGNoOiBJRmlsZU1hdGNoPFVyaUNvbXBvbmVudHM+LCBxdWVyeUlkOiBudW1iZXIpOiB2b2lkIHtcblx0XHR0aGlzLl9vbkRpZFJlY2VpdmVUZXh0U2VhcmNoTWF0Y2guZmlyZSh7IG1hdGNoLCBxdWVyeUlkIH0pO1xuXHR9XG5cblx0QG1lbW9pemVcblx0cHJpdmF0ZSBnZXQgZmlsZVN5c3RlbVByb3ZpZGVyKCk6IEhUTUxGaWxlU3lzdGVtUHJvdmlkZXIge1xuXHRcdHJldHVybiB0aGlzLmZpbGVTZXJ2aWNlLmdldFByb3ZpZGVyKFNjaGVtYXMuZmlsZSkgYXMgSFRNTEZpbGVTeXN0ZW1Qcm92aWRlcjtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgY2FuY2VsUXVlcnkocXVlcnlJZDogbnVtYmVyKSB7XG5cdFx0Y29uc3QgcHJveHkgPSB0aGlzLl9nZXRPckNyZWF0ZVdvcmtlcigpLnByb3h5O1xuXHRcdHByb3h5LiRjYW5jZWxRdWVyeShxdWVyeUlkKTtcblx0fVxuXG5cdGFzeW5jIHRleHRTZWFyY2gocXVlcnk6IElUZXh0UXVlcnksIG9uUHJvZ3Jlc3M/OiAocDogSVNlYXJjaFByb2dyZXNzSXRlbSkgPT4gdm9pZCwgdG9rZW4/OiBDYW5jZWxsYXRpb25Ub2tlbik6IFByb21pc2U8SVNlYXJjaENvbXBsZXRlPiB7XG5cdFx0dHJ5IHtcblx0XHRcdGNvbnN0IHF1ZXJ5RGlzcG9zYWJsZXMgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cblx0XHRcdGNvbnN0IHByb3h5ID0gdGhpcy5fZ2V0T3JDcmVhdGVXb3JrZXIoKS5wcm94eTtcblx0XHRcdGNvbnN0IHJlc3VsdHM6IElGaWxlTWF0Y2hbXSA9IFtdO1xuXG5cdFx0XHRsZXQgbGltaXRIaXQgPSBmYWxzZTtcblxuXHRcdFx0YXdhaXQgUHJvbWlzZS5hbGwocXVlcnkuZm9sZGVyUXVlcmllcy5tYXAoYXN5bmMgZnEgPT4ge1xuXHRcdFx0XHRjb25zdCBxdWVyeUlkID0gdGhpcy5xdWVyeUlkKys7XG5cdFx0XHRcdHF1ZXJ5RGlzcG9zYWJsZXMuYWRkKHRva2VuPy5vbkNhbmNlbGxhdGlvblJlcXVlc3RlZChlID0+IHRoaXMuY2FuY2VsUXVlcnkocXVlcnlJZCkpIHx8IERpc3Bvc2FibGUuTm9uZSk7XG5cblx0XHRcdFx0Y29uc3QgaGFuZGxlOiBGaWxlU3lzdGVtSGFuZGxlIHwgdW5kZWZpbmVkID0gYXdhaXQgdGhpcy5maWxlU3lzdGVtUHJvdmlkZXIuZ2V0SGFuZGxlKGZxLmZvbGRlcik7XG5cdFx0XHRcdGlmICghaGFuZGxlIHx8ICFXZWJGaWxlU3lzdGVtQWNjZXNzLmlzRmlsZVN5c3RlbURpcmVjdG9yeUhhbmRsZShoYW5kbGUpKSB7XG5cdFx0XHRcdFx0Y29uc29sZS5lcnJvcignQ291bGQgbm90IGdldCBkaXJlY3RvcnkgaGFuZGxlIGZvciAnLCBmcSk7XG5cdFx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0Ly8gZm9yY2UgcmVzb3VyY2UgdG8gcmV2aXZlIHVzaW5nIFVSSS5yZXZpdmUuXG5cdFx0XHRcdC8vIFRPRE8gQGFuZHJlYSBzZWUgd2h5IHdlIGNhbid0IGp1c3QgdXNlIGByZXZpdmUoKWAgYmVsb3cuIEZvciBzb21lIHJlYXNvbiwgKDxNYXJzaGFsbGVkT2JqZWN0Pm9iaikuJG1pZCB3YXMgdW5kZWZpbmVkIGZvciByZXN1bHQucmVzb3VyY2Vcblx0XHRcdFx0Y29uc3QgcmV2aXZlTWF0Y2ggPSAocmVzdWx0OiBJRmlsZU1hdGNoPFVyaUNvbXBvbmVudHM+KTogSUZpbGVNYXRjaCA9PiAoe1xuXHRcdFx0XHRcdHJlc291cmNlOiBVUkkucmV2aXZlKHJlc3VsdC5yZXNvdXJjZSksXG5cdFx0XHRcdFx0cmVzdWx0czogcmV2aXZlKHJlc3VsdC5yZXN1bHRzKVxuXHRcdFx0XHR9KTtcblxuXHRcdFx0XHRxdWVyeURpc3Bvc2FibGVzLmFkZCh0aGlzLm9uRGlkUmVjZWl2ZVRleHRTZWFyY2hNYXRjaChlID0+IHtcblx0XHRcdFx0XHRpZiAoZS5xdWVyeUlkID09PSBxdWVyeUlkKSB7XG5cdFx0XHRcdFx0XHRvblByb2dyZXNzPy4ocmV2aXZlTWF0Y2goZS5tYXRjaCkpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fSkpO1xuXG5cdFx0XHRcdGNvbnN0IGlnbm9yZVBhdGhDYXNpbmcgPSB0aGlzLnVyaUlkZW50aXR5U2VydmljZS5leHRVcmkuaWdub3JlUGF0aENhc2luZyhmcS5mb2xkZXIpO1xuXHRcdFx0XHRjb25zdCBmb2xkZXJSZXN1bHRzID0gYXdhaXQgcHJveHkuJHNlYXJjaERpcmVjdG9yeShoYW5kbGUsIHF1ZXJ5LCBmcSwgaWdub3JlUGF0aENhc2luZywgcXVlcnlJZCk7XG5cdFx0XHRcdGZvciAoY29uc3QgZm9sZGVyUmVzdWx0IG9mIGZvbGRlclJlc3VsdHMucmVzdWx0cykge1xuXHRcdFx0XHRcdHJlc3VsdHMucHVzaChyZXZpdmUoZm9sZGVyUmVzdWx0KSk7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRpZiAoZm9sZGVyUmVzdWx0cy5saW1pdEhpdCkge1xuXHRcdFx0XHRcdGxpbWl0SGl0ID0gdHJ1ZTtcblx0XHRcdFx0fVxuXG5cdFx0XHR9KSk7XG5cblx0XHRcdHF1ZXJ5RGlzcG9zYWJsZXMuZGlzcG9zZSgpO1xuXHRcdFx0Y29uc3QgcmVzdWx0ID0geyBtZXNzYWdlczogW10sIHJlc3VsdHMsIGxpbWl0SGl0IH07XG5cdFx0XHRyZXR1cm4gcmVzdWx0O1xuXHRcdH0gY2F0Y2ggKGUpIHtcblx0XHRcdGNvbnNvbGUuZXJyb3IoJ0Vycm9yIHBlcmZvcm1pbmcgd2ViIHdvcmtlciB0ZXh0IHNlYXJjaCcsIGUpO1xuXHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0cmVzdWx0czogW10sXG5cdFx0XHRcdG1lc3NhZ2VzOiBbe1xuXHRcdFx0XHRcdHRleHQ6IGxvY2FsaXplKCdlcnJvclNlYXJjaFRleHQnLCBcIlVuYWJsZSB0byBzZWFyY2ggd2l0aCBXZWIgV29ya2VyIHRleHQgc2VhcmNoZXJcIiksIHR5cGU6IFRleHRTZWFyY2hDb21wbGV0ZU1lc3NhZ2VUeXBlLldhcm5pbmdcblx0XHRcdFx0fV0sXG5cdFx0XHR9O1xuXHRcdH1cblx0fVxuXG5cdGFzeW5jIGZpbGVTZWFyY2gocXVlcnk6IElGaWxlUXVlcnksIHRva2VuPzogQ2FuY2VsbGF0aW9uVG9rZW4pOiBQcm9taXNlPElTZWFyY2hDb21wbGV0ZT4ge1xuXHRcdHRyeSB7XG5cdFx0XHRjb25zdCBxdWVyeURpc3Bvc2FibGVzID0gbmV3IERpc3Bvc2FibGVTdG9yZSgpO1xuXHRcdFx0bGV0IGxpbWl0SGl0ID0gZmFsc2U7XG5cblx0XHRcdGNvbnN0IHByb3h5ID0gdGhpcy5fZ2V0T3JDcmVhdGVXb3JrZXIoKS5wcm94eTtcblx0XHRcdGNvbnN0IHJlc3VsdHM6IElGaWxlTWF0Y2hbXSA9IFtdO1xuXHRcdFx0YXdhaXQgUHJvbWlzZS5hbGwocXVlcnkuZm9sZGVyUXVlcmllcy5tYXAoYXN5bmMgZnEgPT4ge1xuXHRcdFx0XHRjb25zdCBxdWVyeUlkID0gdGhpcy5xdWVyeUlkKys7XG5cdFx0XHRcdHF1ZXJ5RGlzcG9zYWJsZXMuYWRkKHRva2VuPy5vbkNhbmNlbGxhdGlvblJlcXVlc3RlZChlID0+IHRoaXMuY2FuY2VsUXVlcnkocXVlcnlJZCkpIHx8IERpc3Bvc2FibGUuTm9uZSk7XG5cblx0XHRcdFx0Y29uc3QgaGFuZGxlOiBGaWxlU3lzdGVtSGFuZGxlIHwgdW5kZWZpbmVkID0gYXdhaXQgdGhpcy5maWxlU3lzdGVtUHJvdmlkZXIuZ2V0SGFuZGxlKGZxLmZvbGRlcik7XG5cdFx0XHRcdGlmICghaGFuZGxlIHx8ICFXZWJGaWxlU3lzdGVtQWNjZXNzLmlzRmlsZVN5c3RlbURpcmVjdG9yeUhhbmRsZShoYW5kbGUpKSB7XG5cdFx0XHRcdFx0Y29uc29sZS5lcnJvcignQ291bGQgbm90IGdldCBkaXJlY3RvcnkgaGFuZGxlIGZvciAnLCBmcSk7XG5cdFx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGNvbnN0IGNhc2VTZW5zaXRpdmUgPSB0aGlzLnVyaUlkZW50aXR5U2VydmljZS5leHRVcmkuaWdub3JlUGF0aENhc2luZyhmcS5mb2xkZXIpO1xuXHRcdFx0XHRjb25zdCBmb2xkZXJSZXN1bHRzID0gYXdhaXQgcHJveHkuJGxpc3REaXJlY3RvcnkoaGFuZGxlLCBxdWVyeSwgZnEsIGNhc2VTZW5zaXRpdmUsIHF1ZXJ5SWQpO1xuXHRcdFx0XHRmb3IgKGNvbnN0IGZvbGRlclJlc3VsdCBvZiBmb2xkZXJSZXN1bHRzLnJlc3VsdHMpIHtcblx0XHRcdFx0XHRyZXN1bHRzLnB1c2goeyByZXNvdXJjZTogVVJJLmpvaW5QYXRoKGZxLmZvbGRlciwgZm9sZGVyUmVzdWx0KSB9KTtcblx0XHRcdFx0fVxuXHRcdFx0XHRpZiAoZm9sZGVyUmVzdWx0cy5saW1pdEhpdCkgeyBsaW1pdEhpdCA9IHRydWU7IH1cblx0XHRcdH0pKTtcblxuXHRcdFx0cXVlcnlEaXNwb3NhYmxlcy5kaXNwb3NlKCk7XG5cblx0XHRcdGNvbnN0IHJlc3VsdCA9IHsgbWVzc2FnZXM6IFtdLCByZXN1bHRzLCBsaW1pdEhpdCB9O1xuXHRcdFx0cmV0dXJuIHJlc3VsdDtcblx0XHR9IGNhdGNoIChlKSB7XG5cdFx0XHRjb25zb2xlLmVycm9yKCdFcnJvciBwZXJmb3JtaW5nIHdlYiB3b3JrZXIgZmlsZSBzZWFyY2gnLCBlKTtcblx0XHRcdHJldHVybiB7XG5cdFx0XHRcdHJlc3VsdHM6IFtdLFxuXHRcdFx0XHRtZXNzYWdlczogW3tcblx0XHRcdFx0XHR0ZXh0OiBsb2NhbGl6ZSgnZXJyb3JTZWFyY2hGaWxlJywgXCJVbmFibGUgdG8gc2VhcmNoIHdpdGggV2ViIFdvcmtlciBmaWxlIHNlYXJjaGVyXCIpLCB0eXBlOiBUZXh0U2VhcmNoQ29tcGxldGVNZXNzYWdlVHlwZS5XYXJuaW5nXG5cdFx0XHRcdH1dLFxuXHRcdFx0fTtcblx0XHR9XG5cdH1cblxuXHRhc3luYyBjbGVhckNhY2hlKGNhY2hlS2V5OiBzdHJpbmcpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRpZiAodGhpcy5jYWNoZT8ua2V5ID09PSBjYWNoZUtleSkgeyB0aGlzLmNhY2hlID0gdW5kZWZpbmVkOyB9XG5cdH1cblxuXHRwcml2YXRlIF9nZXRPckNyZWF0ZVdvcmtlcigpOiBJV2ViV29ya2VyQ2xpZW50PElMb2NhbEZpbGVTZWFyY2hXb3JrZXI+IHtcblx0XHRpZiAoIXRoaXMuX3dvcmtlcikge1xuXHRcdFx0dHJ5IHtcblx0XHRcdFx0dGhpcy5fd29ya2VyID0gdGhpcy5fcmVnaXN0ZXIodGhpcy53ZWJXb3JrZXJTZXJ2aWNlLmNyZWF0ZVdvcmtlckNsaWVudDxJTG9jYWxGaWxlU2VhcmNoV29ya2VyPihcblx0XHRcdFx0XHRuZXcgV2ViV29ya2VyRGVzY3JpcHRvcih7XG5cdFx0XHRcdFx0XHRlc21Nb2R1bGVMb2NhdGlvbjogRmlsZUFjY2Vzcy5hc0Jyb3dzZXJVcmkoJ3ZzL3dvcmtiZW5jaC9zZXJ2aWNlcy9zZWFyY2gvd29ya2VyL2xvY2FsRmlsZVNlYXJjaE1haW4uanMnKSxcblx0XHRcdFx0XHRcdGxhYmVsOiAnTG9jYWxGaWxlU2VhcmNoV29ya2VyJ1xuXHRcdFx0XHRcdH0pXG5cdFx0XHRcdCkpO1xuXHRcdFx0XHRMb2NhbEZpbGVTZWFyY2hXb3JrZXJIb3N0LnNldENoYW5uZWwodGhpcy5fd29ya2VyLCB7XG5cdFx0XHRcdFx0JHNlbmRUZXh0U2VhcmNoTWF0Y2g6IChtYXRjaCwgcXVlcnlJZCkgPT4ge1xuXHRcdFx0XHRcdFx0cmV0dXJuIHRoaXMuc2VuZFRleHRTZWFyY2hNYXRjaChtYXRjaCwgcXVlcnlJZCk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9KTtcblx0XHRcdH0gY2F0Y2ggKGVycikge1xuXHRcdFx0XHRsb2dPbmNlV2ViV29ya2VyV2FybmluZyhlcnIpO1xuXHRcdFx0XHR0aHJvdyBlcnI7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdHJldHVybiB0aGlzLl93b3JrZXI7XG5cdH1cbn1cblxucmVnaXN0ZXJTaW5nbGV0b24oSVNlYXJjaFNlcnZpY2UsIFJlbW90ZVNlYXJjaFNlcnZpY2UsIEluc3RhbnRpYXRpb25UeXBlLkRlbGF5ZWQpO1xuIl0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7Ozs7QUFNQSxTQUFTLHFCQUFxQjtBQUM5QixTQUFTLG9CQUFvQjtBQUM3QixTQUFTLDZCQUE2QjtBQUN0QyxTQUFTLG1CQUFtQjtBQUM1QixTQUFTLHlCQUF5QjtBQUNsQyxTQUFTLHNCQUFzQjtBQUMvQixTQUFTLHlCQUF5QjtBQUNsQyxTQUE4RixnQkFBNEIsb0JBQW9CLHFDQUFxQztBQUNuTCxTQUFTLHFCQUFxQjtBQUM5QixTQUFTLDJCQUEyQjtBQUNwQyxTQUEyQiwrQkFBK0I7QUFDMUQsU0FBUyxZQUFZLHVCQUF1QjtBQUM1QyxTQUFTLDJCQUEyQjtBQUNwQyxTQUFTLHlCQUF5QjtBQUNsQyxTQUFTLG1CQUFtQix5QkFBeUI7QUFDckQsU0FBaUMsaUNBQWlDO0FBQ2xFLFNBQVMsZUFBZTtBQUV4QixTQUFTLFlBQVksZUFBZTtBQUNwQyxTQUFTLFdBQTBCO0FBQ25DLFNBQVMsZUFBc0I7QUFDL0IsU0FBUyxnQkFBZ0I7QUFDekIsU0FBUywyQkFBMkI7QUFDcEMsU0FBUyxjQUFjO0FBRWhCLElBQU0sc0JBQU4sY0FBa0MsY0FBYztBQUFBLEVBQ3RELFlBQ2dCLGNBQ0MsZUFDRyxrQkFDTixZQUNNLGtCQUNMLGFBQzBCLHNCQUNuQixvQkFDcEI7QUFDRCxVQUFNLGNBQWMsZUFBZSxrQkFBa0IsWUFBWSxrQkFBa0IsYUFBYSxrQkFBa0I7QUFIMUU7QUFJeEMsVUFBTSxpQkFBaUIsS0FBSyxxQkFBcUIsZUFBZSwyQkFBMkI7QUFDM0YsU0FBSyw2QkFBNkIsUUFBUSxNQUFNLG1CQUFtQixNQUFNLGNBQWM7QUFDdkYsU0FBSyw2QkFBNkIsUUFBUSxNQUFNLG1CQUFtQixNQUFNLGNBQWM7QUFBQSxFQUN4RjtBQUNEO0FBaEJhLHNCQUFOO0FBQUEsRUFFSjtB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
