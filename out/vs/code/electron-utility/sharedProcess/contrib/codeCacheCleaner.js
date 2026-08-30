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
import { promises } from "fs";
import { RunOnceScheduler } from "../../../../base/common/async.js";
import { onUnexpectedError } from "../../../../base/common/errors.js";
import { Disposable } from "../../../../base/common/lifecycle.js";
import { basename, dirname, join } from "../../../../base/common/path.js";
import { Promises } from "../../../../base/node/pfs.js";
import { ILogService } from "../../../../platform/log/common/log.js";
import { IProductService } from "../../../../platform/product/common/productService.js";
let CodeCacheCleaner = class extends Disposable {
  constructor(currentCodeCachePath, productService, logService) {
    super();
    this.logService = logService;
    this.dataMaxAge = productService.quality !== "stable" ? 1e3 * 60 * 60 * 24 * 7 : 1e3 * 60 * 60 * 24 * 30 * 3;
    if (currentCodeCachePath) {
      const scheduler = this._register(new RunOnceScheduler(
        () => {
          this.cleanUpCodeCaches(currentCodeCachePath);
        },
        30 * 1e3
        /* after 30s */
      ));
      scheduler.schedule();
    }
  }
  async cleanUpCodeCaches(currentCodeCachePath) {
    this.logService.trace("[code cache cleanup]: Starting to clean up old code cache folders.");
    try {
      const now = Date.now();
      const codeCacheRootPath = dirname(currentCodeCachePath);
      const currentCodeCache = basename(currentCodeCachePath);
      const codeCaches = await Promises.readdir(codeCacheRootPath);
      await Promise.all(codeCaches.map(async (codeCache) => {
        if (codeCache === currentCodeCache) {
          return;
        }
        const codeCacheEntryPath = join(codeCacheRootPath, codeCache);
        const codeCacheEntryStat = await promises.stat(codeCacheEntryPath);
        if (codeCacheEntryStat.isDirectory() && now - codeCacheEntryStat.mtime.getTime() > this.dataMaxAge) {
          this.logService.trace(`[code cache cleanup]: Removing code cache folder ${codeCache}.`);
          return Promises.rm(codeCacheEntryPath);
        }
      }));
    } catch (error) {
      onUnexpectedError(error);
    }
  }
};
CodeCacheCleaner = __decorateClass([
  __decorateParam(1, IProductService),
  __decorateParam(2, ILogService)
], CodeCacheCleaner);
export {
  CodeCacheCleaner
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxjb2RlXFxlbGVjdHJvbi11dGlsaXR5XFxzaGFyZWRQcm9jZXNzXFxjb250cmliXFxjb2RlQ2FjaGVDbGVhbmVyLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IHsgcHJvbWlzZXMgfSBmcm9tICdmcyc7XG5pbXBvcnQgeyBSdW5PbmNlU2NoZWR1bGVyIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vYXN5bmMuanMnO1xuaW1wb3J0IHsgb25VbmV4cGVjdGVkRXJyb3IgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9lcnJvcnMuanMnO1xuaW1wb3J0IHsgRGlzcG9zYWJsZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBiYXNlbmFtZSwgZGlybmFtZSwgam9pbiB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3BhdGguanMnO1xuaW1wb3J0IHsgUHJvbWlzZXMgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL25vZGUvcGZzLmpzJztcbmltcG9ydCB7IElMb2dTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vbG9nL2NvbW1vbi9sb2cuanMnO1xuaW1wb3J0IHsgSVByb2R1Y3RTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vcHJvZHVjdC9jb21tb24vcHJvZHVjdFNlcnZpY2UuanMnO1xuXG5leHBvcnQgY2xhc3MgQ29kZUNhY2hlQ2xlYW5lciBleHRlbmRzIERpc3Bvc2FibGUge1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgZGF0YU1heEFnZTogbnVtYmVyO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdGN1cnJlbnRDb2RlQ2FjaGVQYXRoOiBzdHJpbmcgfCB1bmRlZmluZWQsXG5cdFx0QElQcm9kdWN0U2VydmljZSBwcm9kdWN0U2VydmljZTogSVByb2R1Y3RTZXJ2aWNlLFxuXHRcdEBJTG9nU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGxvZ1NlcnZpY2U6IElMb2dTZXJ2aWNlXG5cdCkge1xuXHRcdHN1cGVyKCk7XG5cblx0XHR0aGlzLmRhdGFNYXhBZ2UgPSBwcm9kdWN0U2VydmljZS5xdWFsaXR5ICE9PSAnc3RhYmxlJ1xuXHRcdFx0PyAxMDAwICogNjAgKiA2MCAqIDI0ICogNyBcdFx0Ly8gcm91Z2hseSAxIHdlZWsgKGluc2lkZXJzKVxuXHRcdFx0OiAxMDAwICogNjAgKiA2MCAqIDI0ICogMzAgKiAzOyAvLyByb3VnaGx5IDMgbW9udGhzIChzdGFibGUpXG5cblx0XHQvLyBDYWNoZWQgZGF0YSBpcyBzdG9yZWQgYXMgdXNlciBkYXRhIGFuZCB3ZSBydW4gYSBjbGVhbnVwIHRhc2sgZXZlcnkgdGltZVxuXHRcdC8vIHRoZSBlZGl0b3Igc3RhcnRzLiBUaGUgc3RyYXRlZ3kgaXMgdG8gZGVsZXRlIGFsbCBmaWxlcyB0aGF0IGFyZSBvbGRlciB0aGFuXG5cdFx0Ly8gMyBtb250aHMgKDEgd2VlayByZXNwZWN0aXZlbHkpXG5cdFx0aWYgKGN1cnJlbnRDb2RlQ2FjaGVQYXRoKSB7XG5cdFx0XHRjb25zdCBzY2hlZHVsZXIgPSB0aGlzLl9yZWdpc3RlcihuZXcgUnVuT25jZVNjaGVkdWxlcigoKSA9PiB7XG5cdFx0XHRcdHRoaXMuY2xlYW5VcENvZGVDYWNoZXMoY3VycmVudENvZGVDYWNoZVBhdGgpO1xuXHRcdFx0fSwgMzAgKiAxMDAwIC8qIGFmdGVyIDMwcyAqLykpO1xuXHRcdFx0c2NoZWR1bGVyLnNjaGVkdWxlKCk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBjbGVhblVwQ29kZUNhY2hlcyhjdXJyZW50Q29kZUNhY2hlUGF0aDogc3RyaW5nKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0dGhpcy5sb2dTZXJ2aWNlLnRyYWNlKCdbY29kZSBjYWNoZSBjbGVhbnVwXTogU3RhcnRpbmcgdG8gY2xlYW4gdXAgb2xkIGNvZGUgY2FjaGUgZm9sZGVycy4nKTtcblxuXHRcdHRyeSB7XG5cdFx0XHRjb25zdCBub3cgPSBEYXRlLm5vdygpO1xuXG5cdFx0XHQvLyBUaGUgZm9sZGVyIHdoaWNoIGNvbnRhaW5zIGZvbGRlcnMgb2YgY2FjaGVkIGRhdGEuXG5cdFx0XHQvLyBFYWNoIG9mIHRoZXNlIGZvbGRlcnMgaXMgcGFydGlvbmVkIHBlciBjb21taXRcblx0XHRcdGNvbnN0IGNvZGVDYWNoZVJvb3RQYXRoID0gZGlybmFtZShjdXJyZW50Q29kZUNhY2hlUGF0aCk7XG5cdFx0XHRjb25zdCBjdXJyZW50Q29kZUNhY2hlID0gYmFzZW5hbWUoY3VycmVudENvZGVDYWNoZVBhdGgpO1xuXG5cdFx0XHRjb25zdCBjb2RlQ2FjaGVzID0gYXdhaXQgUHJvbWlzZXMucmVhZGRpcihjb2RlQ2FjaGVSb290UGF0aCk7XG5cdFx0XHRhd2FpdCBQcm9taXNlLmFsbChjb2RlQ2FjaGVzLm1hcChhc3luYyBjb2RlQ2FjaGUgPT4ge1xuXHRcdFx0XHRpZiAoY29kZUNhY2hlID09PSBjdXJyZW50Q29kZUNhY2hlKSB7XG5cdFx0XHRcdFx0cmV0dXJuOyAvLyBub3QgdGhlIGN1cnJlbnQgY2FjaGUgZm9sZGVyXG5cdFx0XHRcdH1cblxuXHRcdFx0XHQvLyBEZWxldGUgY2FjaGUgZm9sZGVyIGlmIG9sZCBlbm91Z2hcblx0XHRcdFx0Y29uc3QgY29kZUNhY2hlRW50cnlQYXRoID0gam9pbihjb2RlQ2FjaGVSb290UGF0aCwgY29kZUNhY2hlKTtcblx0XHRcdFx0Y29uc3QgY29kZUNhY2hlRW50cnlTdGF0ID0gYXdhaXQgcHJvbWlzZXMuc3RhdChjb2RlQ2FjaGVFbnRyeVBhdGgpO1xuXHRcdFx0XHRpZiAoY29kZUNhY2hlRW50cnlTdGF0LmlzRGlyZWN0b3J5KCkgJiYgKG5vdyAtIGNvZGVDYWNoZUVudHJ5U3RhdC5tdGltZS5nZXRUaW1lKCkpID4gdGhpcy5kYXRhTWF4QWdlKSB7XG5cdFx0XHRcdFx0dGhpcy5sb2dTZXJ2aWNlLnRyYWNlKGBbY29kZSBjYWNoZSBjbGVhbnVwXTogUmVtb3ZpbmcgY29kZSBjYWNoZSBmb2xkZXIgJHtjb2RlQ2FjaGV9LmApO1xuXG5cdFx0XHRcdFx0cmV0dXJuIFByb21pc2VzLnJtKGNvZGVDYWNoZUVudHJ5UGF0aCk7XG5cdFx0XHRcdH1cblx0XHRcdH0pKTtcblx0XHR9IGNhdGNoIChlcnJvcikge1xuXHRcdFx0b25VbmV4cGVjdGVkRXJyb3IoZXJyb3IpO1xuXHRcdH1cblx0fVxufVxuIl0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7Ozs7QUFLQSxTQUFTLGdCQUFnQjtBQUN6QixTQUFTLHdCQUF3QjtBQUNqQyxTQUFTLHlCQUF5QjtBQUNsQyxTQUFTLGtCQUFrQjtBQUMzQixTQUFTLFVBQVUsU0FBUyxZQUFZO0FBQ3hDLFNBQVMsZ0JBQWdCO0FBQ3pCLFNBQVMsbUJBQW1CO0FBQzVCLFNBQVMsdUJBQXVCO0FBRXpCLElBQU0sbUJBQU4sY0FBK0IsV0FBVztBQUFBLEVBSWhELFlBQ0Msc0JBQ2lCLGdCQUNhLFlBQzdCO0FBQ0QsVUFBTTtBQUZ3QjtBQUk5QixTQUFLLGFBQWEsZUFBZSxZQUFZLFdBQzFDLE1BQU8sS0FBSyxLQUFLLEtBQUssSUFDdEIsTUFBTyxLQUFLLEtBQUssS0FBSyxLQUFLO0FBSzlCLFFBQUksc0JBQXNCO0FBQ3pCLFlBQU0sWUFBWSxLQUFLLFVBQVUsSUFBSTtBQUFBLFFBQWlCLE1BQU07QUFDM0QsZUFBSyxrQkFBa0Isb0JBQW9CO0FBQUEsUUFDNUM7QUFBQSxRQUFHLEtBQUs7QUFBQTtBQUFBLE1BQW9CLENBQUM7QUFDN0IsZ0JBQVUsU0FBUztBQUFBLElBQ3BCO0FBQUEsRUFDRDtBQUFBLEVBRUEsTUFBYyxrQkFBa0Isc0JBQTZDO0FBQzVFLFNBQUssV0FBVyxNQUFNLG9FQUFvRTtBQUUxRixRQUFJO0FBQ0gsWUFBTSxNQUFNLEtBQUssSUFBSTtBQUlyQixZQUFNLG9CQUFvQixRQUFRLG9CQUFvQjtBQUN0RCxZQUFNLG1CQUFtQixTQUFTLG9CQUFvQjtBQUV0RCxZQUFNLGFBQWEsTUFBTSxTQUFTLFFBQVEsaUJBQWlCO0FBQzNELFlBQU0sUUFBUSxJQUFJLFdBQVcsSUFBSSxPQUFNLGNBQWE7QUFDbkQsWUFBSSxjQUFjLGtCQUFrQjtBQUNuQztBQUFBLFFBQ0Q7QUFHQSxjQUFNLHFCQUFxQixLQUFLLG1CQUFtQixTQUFTO0FBQzVELGNBQU0scUJBQXFCLE1BQU0sU0FBUyxLQUFLLGtCQUFrQjtBQUNqRSxZQUFJLG1CQUFtQixZQUFZLEtBQU0sTUFBTSxtQkFBbUIsTUFBTSxRQUFRLElBQUssS0FBSyxZQUFZO0FBQ3JHLGVBQUssV0FBVyxNQUFNLG9EQUFvRCxTQUFTLEdBQUc7QUFFdEYsaUJBQU8sU0FBUyxHQUFHLGtCQUFrQjtBQUFBLFFBQ3RDO0FBQUEsTUFDRCxDQUFDLENBQUM7QUFBQSxJQUNILFNBQVMsT0FBTztBQUNmLHdCQUFrQixLQUFLO0FBQUEsSUFDeEI7QUFBQSxFQUNEO0FBQ0Q7QUF4RGEsbUJBQU47QUFBQSxFQU1KO0FBQUEsRUFDQTtBQUFBLEdBUFU7IiwKICAibmFtZXMiOiBbXQp9Cg==
