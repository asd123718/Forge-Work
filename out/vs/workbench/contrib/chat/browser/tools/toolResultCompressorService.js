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
import { Disposable } from "../../../../../base/common/lifecycle.js";
import { getErrorMessage } from "../../../../../base/common/errors.js";
import { IConfigurationService } from "../../../../../platform/configuration/common/configuration.js";
import { ILogService } from "../../../../../platform/log/common/log.js";
import { ITelemetryService } from "../../../../../platform/telemetry/common/telemetry.js";
import { ChatConfiguration } from "../../common/constants.js";
import { formatCompressionBanner, isProtectedFromCompression, MIN_COMPRESSIBLE_LENGTH } from "../../common/tools/toolResultCompressor.js";
let ToolResultCompressorService = class extends Disposable {
  constructor(_configurationService, _telemetryService, _logService) {
    super();
    this._configurationService = _configurationService;
    this._telemetryService = _telemetryService;
    this._logService = _logService;
    this._filters = /* @__PURE__ */ new Map();
    this._caches = /* @__PURE__ */ new Map();
  }
  registerFilter(filter) {
    for (const id of filter.toolIds) {
      let bucket = this._filters.get(id);
      if (!bucket) {
        bucket = [];
        this._filters.set(id, bucket);
      }
      bucket.push(filter);
    }
  }
  registerCache(cache) {
    for (const id of cache.toolIds) {
      let bucket = this._caches.get(id);
      if (!bucket) {
        bucket = [];
        this._caches.set(id, bucket);
      }
      bucket.push(cache);
    }
  }
  maybeCompress(toolId, input, result) {
    if (!this._configurationService.getValue(ChatConfiguration.CompressOutputEnabled)) {
      return void 0;
    }
    const caches = this._caches.get(toolId);
    if (caches && caches.length > 0) {
      for (const c of caches) {
        try {
          c.observe(toolId, input);
        } catch (err) {
          this._logService.warn(`[ToolResultCompressor] cache ${c.id} threw in observe on tool ${toolId}: ${getErrorMessage(err)}`, err);
        }
      }
      for (const c of caches) {
        let hit;
        try {
          hit = c.lookup(toolId, input);
        } catch (err) {
          this._logService.warn(`[ToolResultCompressor] cache ${c.id} threw in lookup on tool ${toolId}: ${getErrorMessage(err)}`, err);
          continue;
        }
        if (hit) {
          const totalBefore2 = result.content.reduce((acc, p) => acc + (p.kind === "text" ? p.value.length : 0), 0);
          if (totalBefore2 < MIN_COMPRESSIBLE_LENGTH) {
            continue;
          }
          const hasProtectedContent = result.content.some((p) => p.kind === "text" && isProtectedFromCompression(p.value));
          if (hasProtectedContent) {
            continue;
          }
          const cachedResult = this._buildCacheHitResult(result, hit);
          const totalAfter2 = cachedResult.content.reduce((acc, p) => acc + (p.kind === "text" ? p.value.length : 0), 0);
          if (totalAfter2 >= totalBefore2) {
            continue;
          }
          this._sendTelemetry(toolId, [`cache:${c.id}`], totalBefore2, totalAfter2, true);
          return cachedResult;
        }
      }
    }
    const filters = this._filters.get(toolId);
    const matchingFilters = filters?.filter((f) => {
      try {
        return f.matches(toolId, input);
      } catch (err) {
        this._logService.warn(`[ToolResultCompressor] filter ${f.id} threw in matches on tool ${toolId}: ${getErrorMessage(err)}`, err);
        return false;
      }
    }) ?? [];
    if (matchingFilters.length === 0) {
      this._recordInCaches(toolId, input, result, caches);
      return void 0;
    }
    const activeFilters = matchingFilters.slice();
    const disabledFilterIds = /* @__PURE__ */ new Set();
    let totalBefore = 0;
    let totalAfter = 0;
    let anyCompressed = false;
    const usedFilterIds = /* @__PURE__ */ new Set();
    const newContent = result.content.map((part) => {
      if (part.kind !== "text") {
        return part;
      }
      const original = part.value;
      totalBefore += original.length;
      if (original.length < MIN_COMPRESSIBLE_LENGTH) {
        totalAfter += original.length;
        return part;
      }
      if (isProtectedFromCompression(original)) {
        totalAfter += original.length;
        return part;
      }
      let current = original;
      const partFilterIds = [];
      for (let i = 0; i < activeFilters.length; ) {
        const filter = activeFilters[i];
        try {
          const out = filter.apply(current, input);
          if (out.compressed && out.text.length < current.length) {
            current = out.text;
            usedFilterIds.add(filter.id);
            partFilterIds.push(filter.id);
          }
          i++;
        } catch (err) {
          activeFilters.splice(i, 1);
          if (!disabledFilterIds.has(filter.id)) {
            disabledFilterIds.add(filter.id);
            this._logService.warn(`[ToolResultCompressor] filter ${filter.id} threw on tool ${toolId}; disabled for this pass: ${getErrorMessage(err)}`, err);
          }
        }
      }
      totalAfter += current.length;
      if (current !== original) {
        anyCompressed = true;
        const banner = formatCompressionBanner(partFilterIds, original.length, current.length);
        const annotated = `${banner}
${current}`;
        const rewritten = {
          kind: "text",
          value: annotated,
          audience: part.audience,
          title: part.title
        };
        return rewritten;
      }
      return part;
    });
    if (!anyCompressed) {
      this._recordInCaches(toolId, input, result, caches);
      return void 0;
    }
    this._sendTelemetry(toolId, [...usedFilterIds], totalBefore, totalAfter, false);
    const finalResult = {
      ...result,
      content: newContent
    };
    this._recordInCaches(toolId, input, finalResult, caches);
    return finalResult;
  }
  _buildCacheHitResult(original, hit) {
    const iso = new Date(hit.timestamp).toISOString();
    const text = `Same output as last run (${iso}). To disable, set ${ChatConfiguration.CompressOutputEnabled} to false.`;
    const firstText = original.content.find((p) => p.kind === "text");
    const replacement = {
      kind: "text",
      value: text,
      audience: firstText?.audience,
      title: firstText?.title
    };
    const nonText = original.content.filter((p) => p.kind !== "text");
    return { ...original, content: [replacement, ...nonText] };
  }
  _recordInCaches(toolId, input, result, caches) {
    if (!caches || caches.length === 0) {
      return;
    }
    const text = result.content.filter((p) => p.kind === "text").map((p) => p.value).join("\n");
    if (!text) {
      return;
    }
    for (const c of caches) {
      try {
        c.record(toolId, input, text);
      } catch (err) {
        this._logService.warn(`[ToolResultCompressor] cache ${c.id} threw in record on tool ${toolId}: ${getErrorMessage(err)}`, err);
      }
    }
  }
  _sendTelemetry(toolId, filterIds, beforeChars, afterChars, cacheHit) {
    this._telemetryService.publicLog2(
      "toolResultCompressed",
      {
        toolId,
        filters: filterIds.join(","),
        beforeChars,
        afterChars,
        cacheHit
      }
    );
  }
};
ToolResultCompressorService = __decorateClass([
  __decorateParam(0, IConfigurationService),
  __decorateParam(1, ITelemetryService),
  __decorateParam(2, ILogService)
], ToolResultCompressorService);
export {
  ToolResultCompressorService
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXGNoYXRcXGJyb3dzZXJcXHRvb2xzXFx0b29sUmVzdWx0Q29tcHJlc3NvclNlcnZpY2UudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgeyBEaXNwb3NhYmxlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IGdldEVycm9yTWVzc2FnZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2Vycm9ycy5qcyc7XG5pbXBvcnQgeyBJQ29uZmlndXJhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb25maWd1cmF0aW9uL2NvbW1vbi9jb25maWd1cmF0aW9uLmpzJztcbmltcG9ydCB7IElMb2dTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vbG9nL2NvbW1vbi9sb2cuanMnO1xuaW1wb3J0IHsgSVRlbGVtZXRyeVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS90ZWxlbWV0cnkvY29tbW9uL3RlbGVtZXRyeS5qcyc7XG5pbXBvcnQgeyBDaGF0Q29uZmlndXJhdGlvbiB9IGZyb20gJy4uLy4uL2NvbW1vbi9jb25zdGFudHMuanMnO1xuaW1wb3J0IHsgSVRvb2xSZXN1bHQsIElUb29sUmVzdWx0VGV4dFBhcnQgfSBmcm9tICcuLi8uLi9jb21tb24vdG9vbHMvbGFuZ3VhZ2VNb2RlbFRvb2xzU2VydmljZS5qcyc7XG5pbXBvcnQgeyBmb3JtYXRDb21wcmVzc2lvbkJhbm5lciwgSVRvb2xSZXN1bHRDYWNoZSwgSVRvb2xSZXN1bHRDb21wcmVzc29yLCBJVG9vbFJlc3VsdEZpbHRlciwgaXNQcm90ZWN0ZWRGcm9tQ29tcHJlc3Npb24sIE1JTl9DT01QUkVTU0lCTEVfTEVOR1RIIH0gZnJvbSAnLi4vLi4vY29tbW9uL3Rvb2xzL3Rvb2xSZXN1bHRDb21wcmVzc29yLmpzJztcblxudHlwZSBUb29sUmVzdWx0Q29tcHJlc3NlZENsYXNzaWZpY2F0aW9uID0ge1xuXHRvd25lcjogJ21lZ2Fucm9nZ2UnO1xuXHRjb21tZW50OiAnUmVwb3J0cyB0b29sIG91dHB1dCBjb21wcmVzc2lvbiBzYXZpbmdzLic7XG5cdHRvb2xJZDogeyBjbGFzc2lmaWNhdGlvbjogJ1N5c3RlbU1ldGFEYXRhJzsgcHVycG9zZTogJ0ZlYXR1cmVJbnNpZ2h0JzsgY29tbWVudDogJ1RoZSB0b29sIHdob3NlIG91dHB1dCB3YXMgY29tcHJlc3NlZC4nIH07XG5cdGZpbHRlcnM6IHsgY2xhc3NpZmljYXRpb246ICdTeXN0ZW1NZXRhRGF0YSc7IHB1cnBvc2U6ICdGZWF0dXJlSW5zaWdodCc7IGNvbW1lbnQ6ICdDb21tYS1zZXBhcmF0ZWQgZmlsdGVyIGlkcyB0aGF0IGZpcmVkLicgfTtcblx0YmVmb3JlQ2hhcnM6IHsgY2xhc3NpZmljYXRpb246ICdTeXN0ZW1NZXRhRGF0YSc7IHB1cnBvc2U6ICdQZXJmb3JtYW5jZUFuZEhlYWx0aCc7IGlzTWVhc3VyZW1lbnQ6IHRydWU7IGNvbW1lbnQ6ICdUb3RhbCB0ZXh0IHBhcnQgbGVuZ3RoIGluIFVURi0xNiBjb2RlIHVuaXRzIGJlZm9yZSBjb21wcmVzc2lvbi4nIH07XG5cdGFmdGVyQ2hhcnM6IHsgY2xhc3NpZmljYXRpb246ICdTeXN0ZW1NZXRhRGF0YSc7IHB1cnBvc2U6ICdQZXJmb3JtYW5jZUFuZEhlYWx0aCc7IGlzTWVhc3VyZW1lbnQ6IHRydWU7IGNvbW1lbnQ6ICdUb3RhbCB0ZXh0IHBhcnQgbGVuZ3RoIGluIFVURi0xNiBjb2RlIHVuaXRzIGFmdGVyIGNvbXByZXNzaW9uLicgfTtcblx0Y2FjaGVIaXQ6IHsgY2xhc3NpZmljYXRpb246ICdTeXN0ZW1NZXRhRGF0YSc7IHB1cnBvc2U6ICdGZWF0dXJlSW5zaWdodCc7IGNvbW1lbnQ6ICdUcnVlIHdoZW4gdGhlIGNvbXByZXNzZWQgcmVzdWx0IGNhbWUgZnJvbSBhIHNlc3Npb24tbWVtb3J5IGNhY2hlIGhpdCAocmVzcG9uc2UgZGVkdXApIHJhdGhlciB0aGFuIGZyb20gZmlsdGVycy4nIH07XG59O1xuXG50eXBlIFRvb2xSZXN1bHRDb21wcmVzc2VkRXZlbnQgPSB7XG5cdHRvb2xJZDogc3RyaW5nO1xuXHRmaWx0ZXJzOiBzdHJpbmc7XG5cdGJlZm9yZUNoYXJzOiBudW1iZXI7XG5cdGFmdGVyQ2hhcnM6IG51bWJlcjtcblx0Y2FjaGVIaXQ6IGJvb2xlYW47XG59O1xuXG5leHBvcnQgY2xhc3MgVG9vbFJlc3VsdENvbXByZXNzb3JTZXJ2aWNlIGV4dGVuZHMgRGlzcG9zYWJsZSBpbXBsZW1lbnRzIElUb29sUmVzdWx0Q29tcHJlc3NvciB7XG5cdGRlY2xhcmUgcmVhZG9ubHkgX3NlcnZpY2VCcmFuZDogdW5kZWZpbmVkO1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX2ZpbHRlcnMgPSBuZXcgTWFwPHN0cmluZywgSVRvb2xSZXN1bHRGaWx0ZXJbXT4oKTtcblx0cHJpdmF0ZSByZWFkb25seSBfY2FjaGVzID0gbmV3IE1hcDxzdHJpbmcsIElUb29sUmVzdWx0Q2FjaGVbXT4oKTtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRASUNvbmZpZ3VyYXRpb25TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2NvbmZpZ3VyYXRpb25TZXJ2aWNlOiBJQ29uZmlndXJhdGlvblNlcnZpY2UsXG5cdFx0QElUZWxlbWV0cnlTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX3RlbGVtZXRyeVNlcnZpY2U6IElUZWxlbWV0cnlTZXJ2aWNlLFxuXHRcdEBJTG9nU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9sb2dTZXJ2aWNlOiBJTG9nU2VydmljZSxcblx0KSB7XG5cdFx0c3VwZXIoKTtcblx0fVxuXG5cdHJlZ2lzdGVyRmlsdGVyKGZpbHRlcjogSVRvb2xSZXN1bHRGaWx0ZXIpOiB2b2lkIHtcblx0XHRmb3IgKGNvbnN0IGlkIG9mIGZpbHRlci50b29sSWRzKSB7XG5cdFx0XHRsZXQgYnVja2V0ID0gdGhpcy5fZmlsdGVycy5nZXQoaWQpO1xuXHRcdFx0aWYgKCFidWNrZXQpIHtcblx0XHRcdFx0YnVja2V0ID0gW107XG5cdFx0XHRcdHRoaXMuX2ZpbHRlcnMuc2V0KGlkLCBidWNrZXQpO1xuXHRcdFx0fVxuXHRcdFx0YnVja2V0LnB1c2goZmlsdGVyKTtcblx0XHR9XG5cdH1cblxuXHRyZWdpc3RlckNhY2hlKGNhY2hlOiBJVG9vbFJlc3VsdENhY2hlKTogdm9pZCB7XG5cdFx0Zm9yIChjb25zdCBpZCBvZiBjYWNoZS50b29sSWRzKSB7XG5cdFx0XHRsZXQgYnVja2V0ID0gdGhpcy5fY2FjaGVzLmdldChpZCk7XG5cdFx0XHRpZiAoIWJ1Y2tldCkge1xuXHRcdFx0XHRidWNrZXQgPSBbXTtcblx0XHRcdFx0dGhpcy5fY2FjaGVzLnNldChpZCwgYnVja2V0KTtcblx0XHRcdH1cblx0XHRcdGJ1Y2tldC5wdXNoKGNhY2hlKTtcblx0XHR9XG5cdH1cblxuXHRtYXliZUNvbXByZXNzKHRvb2xJZDogc3RyaW5nLCBpbnB1dDogdW5rbm93biwgcmVzdWx0OiBJVG9vbFJlc3VsdCk6IElUb29sUmVzdWx0IHwgdW5kZWZpbmVkIHtcblx0XHRpZiAoIXRoaXMuX2NvbmZpZ3VyYXRpb25TZXJ2aWNlLmdldFZhbHVlPGJvb2xlYW4+KENoYXRDb25maWd1cmF0aW9uLkNvbXByZXNzT3V0cHV0RW5hYmxlZCkpIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXG5cdFx0Ly8gQ2FjaGVzIHJ1biBpbmRlcGVuZGVudGx5IG9mIGZpbHRlcnMuIEV2ZW4gaWYgbm8gZmlsdGVycyBtYXRjaCwgYVxuXHRcdC8vIGNhY2hlIGhpdCBjYW4gcmVwbGFjZSB0aGUgb3V0cHV0IHdpdGggYSBvbmUtbGluZXIuXG5cdFx0Y29uc3QgY2FjaGVzID0gdGhpcy5fY2FjaGVzLmdldCh0b29sSWQpO1xuXHRcdGlmIChjYWNoZXMgJiYgY2FjaGVzLmxlbmd0aCA+IDApIHtcblx0XHRcdGZvciAoY29uc3QgYyBvZiBjYWNoZXMpIHtcblx0XHRcdFx0dHJ5IHsgYy5vYnNlcnZlKHRvb2xJZCwgaW5wdXQpOyB9IGNhdGNoIChlcnIpIHtcblx0XHRcdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLndhcm4oYFtUb29sUmVzdWx0Q29tcHJlc3Nvcl0gY2FjaGUgJHtjLmlkfSB0aHJldyBpbiBvYnNlcnZlIG9uIHRvb2wgJHt0b29sSWR9OiAke2dldEVycm9yTWVzc2FnZShlcnIpfWAsIGVycik7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHRcdGZvciAoY29uc3QgYyBvZiBjYWNoZXMpIHtcblx0XHRcdFx0bGV0IGhpdDtcblx0XHRcdFx0dHJ5IHsgaGl0ID0gYy5sb29rdXAodG9vbElkLCBpbnB1dCk7IH0gY2F0Y2ggKGVycikge1xuXHRcdFx0XHRcdHRoaXMuX2xvZ1NlcnZpY2Uud2FybihgW1Rvb2xSZXN1bHRDb21wcmVzc29yXSBjYWNoZSAke2MuaWR9IHRocmV3IGluIGxvb2t1cCBvbiB0b29sICR7dG9vbElkfTogJHtnZXRFcnJvck1lc3NhZ2UoZXJyKX1gLCBlcnIpO1xuXHRcdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGlmIChoaXQpIHtcblx0XHRcdFx0XHRjb25zdCB0b3RhbEJlZm9yZSA9IHJlc3VsdC5jb250ZW50LnJlZHVjZSgoYWNjLCBwKSA9PiBhY2MgKyAocC5raW5kID09PSAndGV4dCcgPyBwLnZhbHVlLmxlbmd0aCA6IDApLCAwKTtcblx0XHRcdFx0XHQvLyBHdWFyZDogZG9uJ3QgcmVwbGFjZSBzbWFsbCBvdXRwdXRzIG9yIHN0cnVjdHVyZWQgZGF0YS5cblx0XHRcdFx0XHRpZiAodG90YWxCZWZvcmUgPCBNSU5fQ09NUFJFU1NJQkxFX0xFTkdUSCkge1xuXHRcdFx0XHRcdFx0Y29udGludWU7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdGNvbnN0IGhhc1Byb3RlY3RlZENvbnRlbnQgPSByZXN1bHQuY29udGVudC5zb21lKHAgPT4gcC5raW5kID09PSAndGV4dCcgJiYgaXNQcm90ZWN0ZWRGcm9tQ29tcHJlc3Npb24ocC52YWx1ZSkpO1xuXHRcdFx0XHRcdGlmIChoYXNQcm90ZWN0ZWRDb250ZW50KSB7XG5cdFx0XHRcdFx0XHRjb250aW51ZTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0Y29uc3QgY2FjaGVkUmVzdWx0ID0gdGhpcy5fYnVpbGRDYWNoZUhpdFJlc3VsdChyZXN1bHQsIGhpdCk7XG5cdFx0XHRcdFx0Y29uc3QgdG90YWxBZnRlciA9IGNhY2hlZFJlc3VsdC5jb250ZW50LnJlZHVjZSgoYWNjLCBwKSA9PiBhY2MgKyAocC5raW5kID09PSAndGV4dCcgPyBwLnZhbHVlLmxlbmd0aCA6IDApLCAwKTtcblx0XHRcdFx0XHRpZiAodG90YWxBZnRlciA+PSB0b3RhbEJlZm9yZSkge1xuXHRcdFx0XHRcdFx0Y29udGludWU7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdHRoaXMuX3NlbmRUZWxlbWV0cnkodG9vbElkLCBbYGNhY2hlOiR7Yy5pZH1gXSwgdG90YWxCZWZvcmUsIHRvdGFsQWZ0ZXIsIHRydWUpO1xuXHRcdFx0XHRcdHJldHVybiBjYWNoZWRSZXN1bHQ7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cblx0XHRjb25zdCBmaWx0ZXJzID0gdGhpcy5fZmlsdGVycy5nZXQodG9vbElkKTtcblx0XHRjb25zdCBtYXRjaGluZ0ZpbHRlcnMgPSBmaWx0ZXJzPy5maWx0ZXIoZiA9PiB7XG5cdFx0XHR0cnkge1xuXHRcdFx0XHRyZXR1cm4gZi5tYXRjaGVzKHRvb2xJZCwgaW5wdXQpO1xuXHRcdFx0fSBjYXRjaCAoZXJyKSB7XG5cdFx0XHRcdHRoaXMuX2xvZ1NlcnZpY2Uud2FybihgW1Rvb2xSZXN1bHRDb21wcmVzc29yXSBmaWx0ZXIgJHtmLmlkfSB0aHJldyBpbiBtYXRjaGVzIG9uIHRvb2wgJHt0b29sSWR9OiAke2dldEVycm9yTWVzc2FnZShlcnIpfWAsIGVycik7XG5cdFx0XHRcdHJldHVybiBmYWxzZTtcblx0XHRcdH1cblx0XHR9KSA/PyBbXTtcblx0XHRpZiAobWF0Y2hpbmdGaWx0ZXJzLmxlbmd0aCA9PT0gMCkge1xuXHRcdFx0Ly8gTm8gZmlsdGVycyBtYXRjaGVkLCBidXQgd2UgbWF5IHN0aWxsIHdhbnQgdG8gcmVjb3JkIHRoZSByYXcgb3V0cHV0XG5cdFx0XHQvLyBpbiB0aGUgY2FjaGVzIHNvIHRoZSBuZXh0IHJlYWQtb25seSBjYWxsIGNhbiBoaXQuXG5cdFx0XHR0aGlzLl9yZWNvcmRJbkNhY2hlcyh0b29sSWQsIGlucHV0LCByZXN1bHQsIGNhY2hlcyk7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblxuXHRcdC8vIE11dGFibGUgY29weTogZmlsdGVycyB0aGF0IHRocm93IGdldCBzcGxpY2VkIG91dCBzbyB3ZSBkb24ndCByZXBlYXRlZGx5XG5cdFx0Ly8gaW52b2tlIGEgYnJva2VuIGZpbHRlciBvbiBldmVyeSBzdWJzZXF1ZW50IHRleHQgcGFydCBpbiB0aGlzIHBhc3MuXG5cdFx0Y29uc3QgYWN0aXZlRmlsdGVycyA9IG1hdGNoaW5nRmlsdGVycy5zbGljZSgpO1xuXHRcdGNvbnN0IGRpc2FibGVkRmlsdGVySWRzID0gbmV3IFNldDxzdHJpbmc+KCk7XG5cblx0XHRsZXQgdG90YWxCZWZvcmUgPSAwO1xuXHRcdGxldCB0b3RhbEFmdGVyID0gMDtcblx0XHRsZXQgYW55Q29tcHJlc3NlZCA9IGZhbHNlO1xuXHRcdGNvbnN0IHVzZWRGaWx0ZXJJZHMgPSBuZXcgU2V0PHN0cmluZz4oKTtcblxuXHRcdGNvbnN0IG5ld0NvbnRlbnQgPSByZXN1bHQuY29udGVudC5tYXAocGFydCA9PiB7XG5cdFx0XHRpZiAocGFydC5raW5kICE9PSAndGV4dCcpIHtcblx0XHRcdFx0cmV0dXJuIHBhcnQ7XG5cdFx0XHR9XG5cdFx0XHRjb25zdCBvcmlnaW5hbCA9IHBhcnQudmFsdWU7XG5cdFx0XHR0b3RhbEJlZm9yZSArPSBvcmlnaW5hbC5sZW5ndGg7XG5cdFx0XHRpZiAob3JpZ2luYWwubGVuZ3RoIDwgTUlOX0NPTVBSRVNTSUJMRV9MRU5HVEgpIHtcblx0XHRcdFx0dG90YWxBZnRlciArPSBvcmlnaW5hbC5sZW5ndGg7XG5cdFx0XHRcdHJldHVybiBwYXJ0O1xuXHRcdFx0fVxuXHRcdFx0Ly8gUmVnaXN0cnktbGV2ZWwgXCJuZXZlciBtYWtlIGl0IHdvcnNlXCIgZ3VhcmQ6IGRvbid0IHBhc3Mgc3RydWN0dXJlZFxuXHRcdFx0Ly8gZGF0YSAoSlNPTiAvIFRPTUwgLyBZQU1MIGhlYWRlcnMpIHRocm91Z2ggZmlsdGVycyBldmVuIGlmIHRoZXkgc2F5XG5cdFx0XHQvLyB0aGV5IG1hdGNoLlxuXHRcdFx0aWYgKGlzUHJvdGVjdGVkRnJvbUNvbXByZXNzaW9uKG9yaWdpbmFsKSkge1xuXHRcdFx0XHR0b3RhbEFmdGVyICs9IG9yaWdpbmFsLmxlbmd0aDtcblx0XHRcdFx0cmV0dXJuIHBhcnQ7XG5cdFx0XHR9XG5cblx0XHRcdGxldCBjdXJyZW50ID0gb3JpZ2luYWw7XG5cdFx0XHRjb25zdCBwYXJ0RmlsdGVySWRzOiBzdHJpbmdbXSA9IFtdO1xuXHRcdFx0Zm9yIChsZXQgaSA9IDA7IGkgPCBhY3RpdmVGaWx0ZXJzLmxlbmd0aDsgLyogbWFudWFsIGluY3JlbWVudCAqLykge1xuXHRcdFx0XHRjb25zdCBmaWx0ZXIgPSBhY3RpdmVGaWx0ZXJzW2ldO1xuXHRcdFx0XHR0cnkge1xuXHRcdFx0XHRcdGNvbnN0IG91dCA9IGZpbHRlci5hcHBseShjdXJyZW50LCBpbnB1dCk7XG5cdFx0XHRcdFx0aWYgKG91dC5jb21wcmVzc2VkICYmIG91dC50ZXh0Lmxlbmd0aCA8IGN1cnJlbnQubGVuZ3RoKSB7XG5cdFx0XHRcdFx0XHRjdXJyZW50ID0gb3V0LnRleHQ7XG5cdFx0XHRcdFx0XHR1c2VkRmlsdGVySWRzLmFkZChmaWx0ZXIuaWQpO1xuXHRcdFx0XHRcdFx0cGFydEZpbHRlcklkcy5wdXNoKGZpbHRlci5pZCk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdGkrKztcblx0XHRcdFx0fSBjYXRjaCAoZXJyKSB7XG5cdFx0XHRcdFx0Ly8gXCJOZXZlciBtYWtlIGl0IHdvcnNlLlwiIERpc2FibGUgdGhlIGZpbHRlciBmb3IgdGhlIHJlc3Qgb2YgdGhpc1xuXHRcdFx0XHRcdC8vIGNvbXByZXNzaW9uIHBhc3Mgc28gaXQgY2FuJ3QgcmVwZWF0ZWRseSB0aHJvdyBvbiBsYXRlciB0ZXh0IHBhcnRzLFxuXHRcdFx0XHRcdC8vIGFuZCB3YXJuIGF0IG1vc3Qgb25jZSBwZXIgZmlsdGVyLlxuXHRcdFx0XHRcdGFjdGl2ZUZpbHRlcnMuc3BsaWNlKGksIDEpO1xuXHRcdFx0XHRcdGlmICghZGlzYWJsZWRGaWx0ZXJJZHMuaGFzKGZpbHRlci5pZCkpIHtcblx0XHRcdFx0XHRcdGRpc2FibGVkRmlsdGVySWRzLmFkZChmaWx0ZXIuaWQpO1xuXHRcdFx0XHRcdFx0dGhpcy5fbG9nU2VydmljZS53YXJuKGBbVG9vbFJlc3VsdENvbXByZXNzb3JdIGZpbHRlciAke2ZpbHRlci5pZH0gdGhyZXcgb24gdG9vbCAke3Rvb2xJZH07IGRpc2FibGVkIGZvciB0aGlzIHBhc3M6ICR7Z2V0RXJyb3JNZXNzYWdlKGVycil9YCwgZXJyKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdH1cblxuXHRcdFx0dG90YWxBZnRlciArPSBjdXJyZW50Lmxlbmd0aDtcblx0XHRcdGlmIChjdXJyZW50ICE9PSBvcmlnaW5hbCkge1xuXHRcdFx0XHRhbnlDb21wcmVzc2VkID0gdHJ1ZTtcblx0XHRcdFx0Ly8gUHJlcGVuZCBhIGJhbm5lciBzbyB0aGUgbW9kZWwga25vd3MgdGhlIG91dHB1dCB3YXMgZmlsdGVyZWQsIGJ5XG5cdFx0XHRcdC8vIHdoaWNoIGZpbHRlcnMsIGFuZCBob3cgdG8gZGlzYWJsZSBjb21wcmVzc2lvbi4gV2Ugb25seSBhbm5vdGF0ZVxuXHRcdFx0XHQvLyB0aGUgcGFydHMgd2UgYWN0dWFsbHkgY2hhbmdlZCBcdTIwMTQgbm9uLWNvbXByZXNzZWQgcGFydHMgcGFzcyB0aHJvdWdoXG5cdFx0XHRcdC8vIHVudG91Y2hlZC5cblx0XHRcdFx0Y29uc3QgYmFubmVyID0gZm9ybWF0Q29tcHJlc3Npb25CYW5uZXIocGFydEZpbHRlcklkcywgb3JpZ2luYWwubGVuZ3RoLCBjdXJyZW50Lmxlbmd0aCk7XG5cdFx0XHRcdGNvbnN0IGFubm90YXRlZCA9IGAke2Jhbm5lcn1cXG4ke2N1cnJlbnR9YDtcblx0XHRcdFx0Y29uc3QgcmV3cml0dGVuOiBJVG9vbFJlc3VsdFRleHRQYXJ0ID0ge1xuXHRcdFx0XHRcdGtpbmQ6ICd0ZXh0Jyxcblx0XHRcdFx0XHR2YWx1ZTogYW5ub3RhdGVkLFxuXHRcdFx0XHRcdGF1ZGllbmNlOiBwYXJ0LmF1ZGllbmNlLFxuXHRcdFx0XHRcdHRpdGxlOiBwYXJ0LnRpdGxlLFxuXHRcdFx0XHR9O1xuXHRcdFx0XHRyZXR1cm4gcmV3cml0dGVuO1xuXHRcdFx0fVxuXHRcdFx0cmV0dXJuIHBhcnQ7XG5cdFx0fSk7XG5cblx0XHRpZiAoIWFueUNvbXByZXNzZWQpIHtcblx0XHRcdHRoaXMuX3JlY29yZEluQ2FjaGVzKHRvb2xJZCwgaW5wdXQsIHJlc3VsdCwgY2FjaGVzKTtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXG5cdFx0dGhpcy5fc2VuZFRlbGVtZXRyeSh0b29sSWQsIFsuLi51c2VkRmlsdGVySWRzXSwgdG90YWxCZWZvcmUsIHRvdGFsQWZ0ZXIsIGZhbHNlKTtcblxuXHRcdGNvbnN0IGZpbmFsUmVzdWx0OiBJVG9vbFJlc3VsdCA9IHtcblx0XHRcdC4uLnJlc3VsdCxcblx0XHRcdGNvbnRlbnQ6IG5ld0NvbnRlbnQsXG5cdFx0fTtcblx0XHR0aGlzLl9yZWNvcmRJbkNhY2hlcyh0b29sSWQsIGlucHV0LCBmaW5hbFJlc3VsdCwgY2FjaGVzKTtcblx0XHRyZXR1cm4gZmluYWxSZXN1bHQ7XG5cdH1cblxuXHRwcml2YXRlIF9idWlsZENhY2hlSGl0UmVzdWx0KG9yaWdpbmFsOiBJVG9vbFJlc3VsdCwgaGl0OiB7IHRleHQ6IHN0cmluZzsgdGltZXN0YW1wOiBudW1iZXIgfSk6IElUb29sUmVzdWx0IHtcblx0XHRjb25zdCBpc28gPSBuZXcgRGF0ZShoaXQudGltZXN0YW1wKS50b0lTT1N0cmluZygpO1xuXHRcdGNvbnN0IHRleHQgPSBgU2FtZSBvdXRwdXQgYXMgbGFzdCBydW4gKCR7aXNvfSkuIFRvIGRpc2FibGUsIHNldCAke0NoYXRDb25maWd1cmF0aW9uLkNvbXByZXNzT3V0cHV0RW5hYmxlZH0gdG8gZmFsc2UuYDtcblx0XHQvLyBQcmVzZXJ2ZSB0aGUgZmlyc3QgdGV4dCBwYXJ0J3MgYXVkaWVuY2UgbWV0YWRhdGEgc28gZG93bnN0cmVhbVxuXHRcdC8vIG1vZGVsLXJvdXRpbmcgbG9naWMgc3RpbGwgYmVoYXZlcyB0aGUgc2FtZSB3YXkuXG5cdFx0Y29uc3QgZmlyc3RUZXh0ID0gb3JpZ2luYWwuY29udGVudC5maW5kKChwKTogcCBpcyBJVG9vbFJlc3VsdFRleHRQYXJ0ID0+IHAua2luZCA9PT0gJ3RleHQnKTtcblx0XHRjb25zdCByZXBsYWNlbWVudDogSVRvb2xSZXN1bHRUZXh0UGFydCA9IHtcblx0XHRcdGtpbmQ6ICd0ZXh0Jyxcblx0XHRcdHZhbHVlOiB0ZXh0LFxuXHRcdFx0YXVkaWVuY2U6IGZpcnN0VGV4dD8uYXVkaWVuY2UsXG5cdFx0XHR0aXRsZTogZmlyc3RUZXh0Py50aXRsZSxcblx0XHR9O1xuXHRcdC8vIERyb3Agb3RoZXIgdGV4dCBwYXJ0cyBidXQga2VlcCBub24tdGV4dCBwYXJ0cyAoZS5nLiBiaW5hcnkgZGF0YSkgc29cblx0XHQvLyBkb3duc3RyZWFtIGNvbnN1bWVycyBkb24ndCBsb3NlIGF0dGFjaG1lbnRzLlxuXHRcdGNvbnN0IG5vblRleHQgPSBvcmlnaW5hbC5jb250ZW50LmZpbHRlcihwID0+IHAua2luZCAhPT0gJ3RleHQnKTtcblx0XHRyZXR1cm4geyAuLi5vcmlnaW5hbCwgY29udGVudDogW3JlcGxhY2VtZW50LCAuLi5ub25UZXh0XSB9O1xuXHR9XG5cblx0cHJpdmF0ZSBfcmVjb3JkSW5DYWNoZXModG9vbElkOiBzdHJpbmcsIGlucHV0OiB1bmtub3duLCByZXN1bHQ6IElUb29sUmVzdWx0LCBjYWNoZXM6IHJlYWRvbmx5IElUb29sUmVzdWx0Q2FjaGVbXSB8IHVuZGVmaW5lZCk6IHZvaWQge1xuXHRcdGlmICghY2FjaGVzIHx8IGNhY2hlcy5sZW5ndGggPT09IDApIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0Y29uc3QgdGV4dCA9IHJlc3VsdC5jb250ZW50XG5cdFx0XHQuZmlsdGVyKChwKTogcCBpcyBJVG9vbFJlc3VsdFRleHRQYXJ0ID0+IHAua2luZCA9PT0gJ3RleHQnKVxuXHRcdFx0Lm1hcChwID0+IHAudmFsdWUpXG5cdFx0XHQuam9pbignXFxuJyk7XG5cdFx0aWYgKCF0ZXh0KSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGZvciAoY29uc3QgYyBvZiBjYWNoZXMpIHtcblx0XHRcdHRyeSB7XG5cdFx0XHRcdGMucmVjb3JkKHRvb2xJZCwgaW5wdXQsIHRleHQpO1xuXHRcdFx0fSBjYXRjaCAoZXJyKSB7XG5cdFx0XHRcdHRoaXMuX2xvZ1NlcnZpY2Uud2FybihgW1Rvb2xSZXN1bHRDb21wcmVzc29yXSBjYWNoZSAke2MuaWR9IHRocmV3IGluIHJlY29yZCBvbiB0b29sICR7dG9vbElkfTogJHtnZXRFcnJvck1lc3NhZ2UoZXJyKX1gLCBlcnIpO1xuXHRcdFx0fVxuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgX3NlbmRUZWxlbWV0cnkodG9vbElkOiBzdHJpbmcsIGZpbHRlcklkczogc3RyaW5nW10sIGJlZm9yZUNoYXJzOiBudW1iZXIsIGFmdGVyQ2hhcnM6IG51bWJlciwgY2FjaGVIaXQ6IGJvb2xlYW4pIHtcblx0XHR0aGlzLl90ZWxlbWV0cnlTZXJ2aWNlLnB1YmxpY0xvZzI8VG9vbFJlc3VsdENvbXByZXNzZWRFdmVudCwgVG9vbFJlc3VsdENvbXByZXNzZWRDbGFzc2lmaWNhdGlvbj4oXG5cdFx0XHQndG9vbFJlc3VsdENvbXByZXNzZWQnLFxuXHRcdFx0e1xuXHRcdFx0XHR0b29sSWQsXG5cdFx0XHRcdGZpbHRlcnM6IGZpbHRlcklkcy5qb2luKCcsJyksXG5cdFx0XHRcdGJlZm9yZUNoYXJzLFxuXHRcdFx0XHRhZnRlckNoYXJzLFxuXHRcdFx0XHRjYWNoZUhpdCxcblx0XHRcdH0sXG5cdFx0KTtcblx0fVxufVxuIl0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7Ozs7QUFLQSxTQUFTLGtCQUFrQjtBQUMzQixTQUFTLHVCQUF1QjtBQUNoQyxTQUFTLDZCQUE2QjtBQUN0QyxTQUFTLG1CQUFtQjtBQUM1QixTQUFTLHlCQUF5QjtBQUNsQyxTQUFTLHlCQUF5QjtBQUVsQyxTQUFTLHlCQUFxRiw0QkFBNEIsK0JBQStCO0FBb0JsSixJQUFNLDhCQUFOLGNBQTBDLFdBQTRDO0FBQUEsRUFNNUYsWUFDeUMsdUJBQ0osbUJBQ04sYUFDN0I7QUFDRCxVQUFNO0FBSmtDO0FBQ0o7QUFDTjtBQU4vQixTQUFpQixXQUFXLG9CQUFJLElBQWlDO0FBQ2pFLFNBQWlCLFVBQVUsb0JBQUksSUFBZ0M7QUFBQSxFQVEvRDtBQUFBLEVBRUEsZUFBZSxRQUFpQztBQUMvQyxlQUFXLE1BQU0sT0FBTyxTQUFTO0FBQ2hDLFVBQUksU0FBUyxLQUFLLFNBQVMsSUFBSSxFQUFFO0FB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
