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
import { join } from "../../../../base/common/path.js";
import { Promises } from "../../../../base/node/pfs.js";
import { INativeEnvironmentService } from "../../../../platform/environment/common/environment.js";
import { ILogService } from "../../../../platform/log/common/log.js";
import { IProductService } from "../../../../platform/product/common/productService.js";
let LanguagePackCachedDataCleaner = class extends Disposable {
  constructor(environmentService, logService, productService) {
    super();
    this.environmentService = environmentService;
    this.logService = logService;
    this.dataMaxAge = productService.quality !== "stable" ? 1e3 * 60 * 60 * 24 * 7 : 1e3 * 60 * 60 * 24 * 30 * 3;
    if (this.environmentService.isBuilt) {
      const scheduler = this._register(new RunOnceScheduler(
        () => {
          this.cleanUpLanguagePackCache();
        },
        40 * 1e3
        /* after 40s */
      ));
      scheduler.schedule();
    }
  }
  async cleanUpLanguagePackCache() {
    this.logService.trace("[language pack cache cleanup]: Starting to clean up unused language packs.");
    try {
      const installed = /* @__PURE__ */ Object.create(null);
      const metaData = JSON.parse(await promises.readFile(join(this.environmentService.userDataPath, "languagepacks.json"), "utf8"));
      for (const locale of Object.keys(metaData)) {
        const entry = metaData[locale];
        installed[`${entry.hash}.${locale}`] = true;
      }
      const cacheDir = join(this.environmentService.userDataPath, "clp");
      const cacheDirExists = await Promises.exists(cacheDir);
      if (!cacheDirExists) {
        return;
      }
      const entries = await Promises.readdir(cacheDir);
      for (const entry of entries) {
        if (installed[entry]) {
          this.logService.trace(`[language pack cache cleanup]: Skipping folder ${entry}. Language pack still in use.`);
          continue;
        }
        this.logService.trace(`[language pack cache cleanup]: Removing unused language pack: ${entry}`);
        await Promises.rm(join(cacheDir, entry));
      }
      const now = Date.now();
      for (const packEntry of Object.keys(installed)) {
        const folder = join(cacheDir, packEntry);
        const entries2 = await Promises.readdir(folder);
        for (const entry of entries2) {
          if (entry === "tcf.json") {
            continue;
          }
          const candidate = join(folder, entry);
          const stat = await promises.stat(candidate);
          if (stat.isDirectory() && now - stat.mtime.getTime() > this.dataMaxAge) {
            this.logService.trace(`[language pack cache cleanup]: Removing language pack cache folder: ${join(packEntry, entry)}`);
            await Promises.rm(candidate);
          }
        }
      }
    } catch (error) {
      onUnexpectedError(error);
    }
  }
};
LanguagePackCachedDataCleaner = __decorateClass([
  __decorateParam(0, INativeEnvironmentService),
  __decorateParam(1, ILogService),
  __decorateParam(2, IProductService)
], LanguagePackCachedDataCleaner);
export {
  LanguagePackCachedDataCleaner
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxjb2RlXFxlbGVjdHJvbi11dGlsaXR5XFxzaGFyZWRQcm9jZXNzXFxjb250cmliXFxsYW5ndWFnZVBhY2tDYWNoZWREYXRhQ2xlYW5lci50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB7IHByb21pc2VzIH0gZnJvbSAnZnMnO1xuaW1wb3J0IHsgUnVuT25jZVNjaGVkdWxlciB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2FzeW5jLmpzJztcbmltcG9ydCB7IElTdHJpbmdEaWN0aW9uYXJ5IH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vY29sbGVjdGlvbnMuanMnO1xuaW1wb3J0IHsgb25VbmV4cGVjdGVkRXJyb3IgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9lcnJvcnMuanMnO1xuaW1wb3J0IHsgRGlzcG9zYWJsZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBqb2luIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vcGF0aC5qcyc7XG5pbXBvcnQgeyBQcm9taXNlcyB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2Uvbm9kZS9wZnMuanMnO1xuaW1wb3J0IHsgSU5hdGl2ZUVudmlyb25tZW50U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2Vudmlyb25tZW50L2NvbW1vbi9lbnZpcm9ubWVudC5qcyc7XG5pbXBvcnQgeyBJTG9nU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2xvZy9jb21tb24vbG9nLmpzJztcbmltcG9ydCB7IElQcm9kdWN0U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3Byb2R1Y3QvY29tbW9uL3Byb2R1Y3RTZXJ2aWNlLmpzJztcblxuaW50ZXJmYWNlIElFeHRlbnNpb25FbnRyeSB7XG5cdHZlcnNpb246IHN0cmluZztcblx0ZXh0ZW5zaW9uSWRlbnRpZmllcjoge1xuXHRcdGlkOiBzdHJpbmc7XG5cdFx0dXVpZDogc3RyaW5nO1xuXHR9O1xufVxuXG5pbnRlcmZhY2UgSUxhbmd1YWdlUGFja0VudHJ5IHtcblx0aGFzaDogc3RyaW5nO1xuXHRleHRlbnNpb25zOiBJRXh0ZW5zaW9uRW50cnlbXTtcbn1cblxuaW50ZXJmYWNlIElMYW5ndWFnZVBhY2tGaWxlIHtcblx0W2xvY2FsZTogc3RyaW5nXTogSUxhbmd1YWdlUGFja0VudHJ5O1xufVxuXG5leHBvcnQgY2xhc3MgTGFuZ3VhZ2VQYWNrQ2FjaGVkRGF0YUNsZWFuZXIgZXh0ZW5kcyBEaXNwb3NhYmxlIHtcblxuXHRwcml2YXRlIHJlYWRvbmx5IGRhdGFNYXhBZ2U6IG51bWJlcjtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRASU5hdGl2ZUVudmlyb25tZW50U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGVudmlyb25tZW50U2VydmljZTogSU5hdGl2ZUVudmlyb25tZW50U2VydmljZSxcblx0XHRASUxvZ1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBsb2dTZXJ2aWNlOiBJTG9nU2VydmljZSxcblx0XHRASVByb2R1Y3RTZXJ2aWNlIHByb2R1Y3RTZXJ2aWNlOiBJUHJvZHVjdFNlcnZpY2Vcblx0KSB7XG5cdFx0c3VwZXIoKTtcblxuXHRcdHRoaXMuZGF0YU1heEFnZSA9IHByb2R1Y3RTZXJ2aWNlLnF1YWxpdHkgIT09ICdzdGFibGUnXG5cdFx0XHQ/IDEwMDAgKiA2MCAqIDYwICogMjQgKiA3IFx0XHQvLyByb3VnaGx5IDEgd2VlayAoaW5zaWRlcnMpXG5cdFx0XHQ6IDEwMDAgKiA2MCAqIDYwICogMjQgKiAzMCAqIDM7IC8vIHJvdWdobHkgMyBtb250aHMgKHN0YWJsZSlcblxuXHRcdC8vIFdlIGhhdmUgbm8gTGFuZ3VhZ2UgcGFjayBzdXBwb3J0IGZvciBkZXYgdmVyc2lvbiAocnVuIGZyb20gc291cmNlKVxuXHRcdC8vIFNvIG9ubHkgY2xlYW51cCB3aGVuIHdlIGhhdmUgYSBidWlsZCB2ZXJzaW9uLlxuXHRcdGlmICh0aGlzLmVudmlyb25tZW50U2VydmljZS5pc0J1aWx0KSB7XG5cdFx0XHRjb25zdCBzY2hlZHVsZXIgPSB0aGlzLl9yZWdpc3RlcihuZXcgUnVuT25jZVNjaGVkdWxlcigoKSA9PiB7XG5cdFx0XHRcdHRoaXMuY2xlYW5VcExhbmd1YWdlUGFja0NhY2hlKCk7XG5cdFx0XHR9LCA0MCAqIDEwMDAgLyogYWZ0ZXIgNDBzICovKSk7XG5cdFx0XHRzY2hlZHVsZXIuc2NoZWR1bGUoKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIGNsZWFuVXBMYW5ndWFnZVBhY2tDYWNoZSgpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHR0aGlzLmxvZ1NlcnZpY2UudHJhY2UoJ1tsYW5ndWFnZSBwYWNrIGNhY2hlIGNsZWFudXBdOiBTdGFydGluZyB0byBjbGVhbiB1cCB1bnVzZWQgbGFuZ3VhZ2UgcGFja3MuJyk7XG5cblx0XHR0cnkge1xuXHRcdFx0Y29uc3QgaW5zdGFsbGVkOiBJU3RyaW5nRGljdGlvbmFyeTxib29sZWFuPiA9IE9iamVjdC5jcmVhdGUobnVsbCk7XG5cdFx0XHRjb25zdCBtZXRhRGF0YTogSUxhbmd1YWdlUGFja0ZpbGUgPSBKU09OLnBhcnNlKGF3YWl0IHByb21pc2VzLnJlYWRGaWxlKGpvaW4odGhpcy5lbnZpcm9ubWVudFNlcnZpY2UudXNlckRhdGFQYXRoLCAnbGFuZ3VhZ2VwYWNrcy5qc29uJyksICd1dGY4JykpO1xuXHRcdFx0Zm9yIChjb25zdCBsb2NhbGUgb2YgT2JqZWN0LmtleXMobWV0YURhdGEpKSB7XG5cdFx0XHRcdGNvbnN0IGVudHJ5ID0gbWV0YURhdGFbbG9jYWxlXTtcblx0XHRcdFx0aW5zdGFsbGVkW2Ake2VudHJ5Lmhhc2h9LiR7bG9jYWxlfWBdID0gdHJ1ZTtcblx0XHRcdH1cblxuXHRcdFx0Ly8gQ2xlYW51cCBlbnRyaWVzIGZvciBsYW5ndWFnZSBwYWNrcyB0aGF0IGFyZW4ndCBpbnN0YWxsZWQgYW55bW9yZVxuXHRcdFx0Y29uc3QgY2FjaGVEaXIgPSBqb2luKHRoaXMuZW52aXJvbm1lbnRTZXJ2aWNlLnVzZXJEYXRhUGF0aCwgJ2NscCcpO1xuXHRcdFx0Y29uc3QgY2FjaGVEaXJFeGlzdHMgPSBhd2FpdCBQcm9taXNlcy5leGlzdHMoY2FjaGVEaXIpO1xuXHRcdFx0aWYgKCFjYWNoZURpckV4aXN0cykge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cblx0XHRcdGNvbnN0IGVudHJpZXMgPSBhd2FpdCBQcm9taXNlcy5yZWFkZGlyKGNhY2hlRGlyKTtcblx0XHRcdGZvciAoY29uc3QgZW50cnkgb2YgZW50cmllcykge1xuXHRcdFx0XHRpZiAoaW5zdGFsbGVkW2VudHJ5XSkge1xuXHRcdFx0XHRcdHRoaXMubG9nU2VydmljZS50cmFjZShgW2xhbmd1YWdlIHBhY2sgY2FjaGUgY2xlYW51cF06IFNraXBwaW5nIGZvbGRlciAke2VudHJ5fS4gTGFuZ3VhZ2UgcGFjayBzdGlsbCBpbiB1c2UuYCk7XG5cdFx0XHRcdFx0Y29udGludWU7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHR0aGlzLmxvZ1NlcnZpY2UudHJhY2UoYFtsYW5ndWFnZSBwYWNrIGNhY2hlIGNsZWFudXBdOiBSZW1vdmluZyB1bnVzZWQgbGFuZ3VhZ2UgcGFjazogJHtlbnRyeX1gKTtcblxuXHRcdFx0XHRhd2FpdCBQcm9taXNlcy5ybShqb2luKGNhY2hlRGlyLCBlbnRyeSkpO1xuXHRcdFx0fVxuXG5cdFx0XHRjb25zdCBub3cgPSBEYXRlLm5vdygpO1xuXHRcdFx0Zm9yIChjb25zdCBwYWNrRW50cnkgb2YgT2JqZWN0LmtleXMoaW5zdGFsbGVkKSkge1xuXHRcdFx0XHRjb25zdCBmb2xkZXIgPSBqb2luKGNhY2hlRGlyLCBwYWNrRW50cnkpO1xuXHRcdFx0XHRjb25zdCBlbnRyaWVzID0gYXdhaXQgUHJvbWlzZXMucmVhZGRpcihmb2xkZXIpO1xuXHRcdFx0XHRmb3IgKGNvbnN0IGVudHJ5IG9mIGVudHJpZXMpIHtcblx0XHRcdFx0XHRpZiAoZW50cnkgPT09ICd0Y2YuanNvbicpIHtcblx0XHRcdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0XHRcdH1cblxuXHRcdFx0XHRcdGNvbnN0IGNhbmRpZGF0ZSA9IGpvaW4oZm9sZGVyLCBlbnRyeSk7XG5cdFx0XHRcdFx0Y29uc3Qgc3RhdCA9IGF3YWl0IHByb21pc2VzLnN0YXQoY2FuZGlkYXRlKTtcblx0XHRcdFx0XHRpZiAoc3RhdC5pc0RpcmVjdG9yeSgpICYmIChub3cgLSBzdGF0Lm10aW1lLmdldFRpbWUoKSkgPiB0aGlzLmRhdGFNYXhBZ2UpIHtcblx0XHRcdFx0XHRcdHRoaXMubG9nU2VydmljZS50cmFjZShgW2xhbmd1YWdlIHBhY2sgY2FjaGUgY2xlYW51cF06IFJlbW92aW5nIGxhbmd1YWdlIHBhY2sgY2FjaGUgZm9sZGVyOiAke2pvaW4ocGFja0VudHJ5LCBlbnRyeSl9YCk7XG5cblx0XHRcdFx0XHRcdGF3YWl0IFByb21pc2VzLnJtKGNhbmRpZGF0ZSk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fSBjYXRjaCAoZXJyb3IpIHtcblx0XHRcdG9uVW5leHBlY3RlZEVy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
