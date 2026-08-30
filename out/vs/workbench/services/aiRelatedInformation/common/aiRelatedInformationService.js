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
import { createCancelablePromise, raceTimeout } from "../../../../base/common/async.js";
import { InstantiationType, registerSingleton } from "../../../../platform/instantiation/common/extensions.js";
import { StopWatch } from "../../../../base/common/stopwatch.js";
import { ILogService } from "../../../../platform/log/common/log.js";
import { IAiRelatedInformationService } from "./aiRelatedInformation.js";
let AiRelatedInformationService = class {
  constructor(logService) {
    this.logService = logService;
    // 10 seconds
    this._providers = /* @__PURE__ */ new Map();
  }
  isEnabled() {
    return this._providers.size > 0;
  }
  registerAiRelatedInformationProvider(type, provider) {
    const providers = this._providers.get(type) ?? [];
    providers.push(provider);
    this._providers.set(type, providers);
    return {
      dispose: () => {
        const providers2 = this._providers.get(type) ?? [];
        const index = providers2.indexOf(provider);
        if (index !== -1) {
          providers2.splice(index, 1);
        }
        if (providers2.length === 0) {
          this._providers.delete(type);
        }
      }
    };
  }
  async getRelatedInformation(query, types, token) {
    if (this._providers.size === 0) {
      throw new Error("No related information providers registered");
    }
    const providers = [];
    for (const type of types) {
      const typeProviders = this._providers.get(type);
      if (typeProviders) {
        providers.push(...typeProviders);
      }
    }
    if (providers.length === 0) {
      throw new Error("No related information providers registered for the given types");
    }
    const stopwatch = StopWatch.create();
    const cancellablePromises = providers.map((provider) => {
      return createCancelablePromise(async (t) => {
        try {
          const result = await provider.provideAiRelatedInformation(query, t);
          return result.filter((r) => types.includes(r.type));
        } catch (e) {
        }
        return [];
      });
    });
    try {
      const results = await raceTimeout(
        Promise.allSettled(cancellablePromises),
        AiRelatedInformationService.DEFAULT_TIMEOUT,
        () => {
          cancellablePromises.forEach((p) => p.cancel());
          this.logService.warn("[AiRelatedInformationService]: Related information provider timed out");
        }
      );
      if (!results) {
        return [];
      }
      const result = results.filter((r) => r.status === "fulfilled").flatMap((r) => r.value);
      return result;
    } finally {
      stopwatch.stop();
      this.logService.trace(`[AiRelatedInformationService]: getRelatedInformation took ${stopwatch.elapsed()}ms`);
    }
  }
};
AiRelatedInformationService.DEFAULT_TIMEOUT = 1e3 * 10;
AiRelatedInformationService = __decorateClass([
  __decorateParam(0, ILogService)
], AiRelatedInformationService);
registerSingleton(IAiRelatedInformationService, AiRelatedInformationService, InstantiationType.Delayed);
export {
  AiRelatedInformationService
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXHNlcnZpY2VzXFxhaVJlbGF0ZWRJbmZvcm1hdGlvblxcY29tbW9uXFxhaVJlbGF0ZWRJbmZvcm1hdGlvblNlcnZpY2UudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgeyBDYW5jZWxsYXRpb25Ub2tlbiB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2NhbmNlbGxhdGlvbi5qcyc7XG5pbXBvcnQgeyBDYW5jZWxhYmxlUHJvbWlzZSwgY3JlYXRlQ2FuY2VsYWJsZVByb21pc2UsIHJhY2VUaW1lb3V0IH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vYXN5bmMuanMnO1xuaW1wb3J0IHsgSURpc3Bvc2FibGUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgSW5zdGFudGlhdGlvblR5cGUsIHJlZ2lzdGVyU2luZ2xldG9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vaW5zdGFudGlhdGlvbi9jb21tb24vZXh0ZW5zaW9ucy5qcyc7XG5pbXBvcnQgeyBTdG9wV2F0Y2ggfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9zdG9wd2F0Y2guanMnO1xuaW1wb3J0IHsgSUxvZ1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9sb2cvY29tbW9uL2xvZy5qcyc7XG5pbXBvcnQgeyBJQWlSZWxhdGVkSW5mb3JtYXRpb25TZXJ2aWNlLCBJQWlSZWxhdGVkSW5mb3JtYXRpb25Qcm92aWRlciwgUmVsYXRlZEluZm9ybWF0aW9uVHlwZSwgUmVsYXRlZEluZm9ybWF0aW9uUmVzdWx0IH0gZnJvbSAnLi9haVJlbGF0ZWRJbmZvcm1hdGlvbi5qcyc7XG5cbmV4cG9ydCBjbGFzcyBBaVJlbGF0ZWRJbmZvcm1hdGlvblNlcnZpY2UgaW1wbGVtZW50cyBJQWlSZWxhdGVkSW5mb3JtYXRpb25TZXJ2aWNlIHtcblx0cmVhZG9ubHkgX3NlcnZpY2VCcmFuZDogdW5kZWZpbmVkO1xuXG5cdHN0YXRpYyByZWFkb25seSBERUZBVUxUX1RJTUVPVVQgPSAxMDAwICogMTA7IC8vIDEwIHNlY29uZHNcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9wcm92aWRlcnM6IE1hcDxSZWxhdGVkSW5mb3JtYXRpb25UeXBlLCBJQWlSZWxhdGVkSW5mb3JtYXRpb25Qcm92aWRlcltdPiA9IG5ldyBNYXAoKTtcblxuXHRjb25zdHJ1Y3RvcihASUxvZ1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBsb2dTZXJ2aWNlOiBJTG9nU2VydmljZSkgeyB9XG5cblx0aXNFbmFibGVkKCk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiB0aGlzLl9wcm92aWRlcnMuc2l6ZSA+IDA7XG5cdH1cblxuXHRyZWdpc3RlckFpUmVsYXRlZEluZm9ybWF0aW9uUHJvdmlkZXIodHlwZTogUmVsYXRlZEluZm9ybWF0aW9uVHlwZSwgcHJvdmlkZXI6IElBaVJlbGF0ZWRJbmZvcm1hdGlvblByb3ZpZGVyKTogSURpc3Bvc2FibGUge1xuXHRcdGNvbnN0IHByb3ZpZGVycyA9IHRoaXMuX3Byb3ZpZGVycy5nZXQodHlwZSkgPz8gW107XG5cdFx0cHJvdmlkZXJzLnB1c2gocHJvdmlkZXIpO1xuXHRcdHRoaXMuX3Byb3ZpZGVycy5zZXQodHlwZSwgcHJvdmlkZXJzKTtcblxuXG5cdFx0cmV0dXJuIHtcblx0XHRcdGRpc3Bvc2U6ICgpID0+IHtcblx0XHRcdFx0Y29uc3QgcHJvdmlkZXJzID0gdGhpcy5fcHJvdmlkZXJzLmdldCh0eXBlKSA/PyBbXTtcblx0XHRcdFx0Y29uc3QgaW5kZXggPSBwcm92aWRlcnMuaW5kZXhPZihwcm92aWRlcik7XG5cdFx0XHRcdGlmIChpbmRleCAhPT0gLTEpIHtcblx0XHRcdFx0XHRwcm92aWRlcnMuc3BsaWNlKGluZGV4LCAxKTtcblx0XHRcdFx0fVxuXHRcdFx0XHRpZiAocHJvdmlkZXJzLmxlbmd0aCA9PT0gMCkge1xuXHRcdFx0XHRcdHRoaXMuX3Byb3ZpZGVycy5kZWxldGUodHlwZSk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9O1xuXHR9XG5cblx0YXN5bmMgZ2V0UmVsYXRlZEluZm9ybWF0aW9uKHF1ZXJ5OiBzdHJpbmcsIHR5cGVzOiBSZWxhdGVkSW5mb3JtYXRpb25UeXBlW10sIHRva2VuOiBDYW5jZWxsYXRpb25Ub2tlbik6IFByb21pc2U8UmVsYXRlZEluZm9ybWF0aW9uUmVzdWx0W10+IHtcblx0XHRpZiAodGhpcy5fcHJvdmlkZXJzLnNpemUgPT09IDApIHtcblx0XHRcdHRocm93IG5ldyBFcnJvcignTm8gcmVsYXRlZCBpbmZvcm1hdGlvbiBwcm92aWRlcnMgcmVnaXN0ZXJlZCcpO1xuXHRcdH1cblxuXHRcdC8vIGdldCBwcm92aWRlcnMgZm9yIGVhY2ggdHlwZVxuXHRcdGNvbnN0IHByb3ZpZGVyczogSUFpUmVsYXRlZEluZm9ybWF0aW9uUHJvdmlkZXJbXSA9IFtdO1xuXHRcdGZvciAoY29uc3QgdHlwZSBvZiB0eXBlcykge1xuXHRcdFx0Y29uc3QgdHlwZVByb3ZpZGVycyA9IHRoaXMuX3Byb3ZpZGVycy5nZXQodHlwZSk7XG5cdFx0XHRpZiAodHlwZVByb3ZpZGVycykge1xuXHRcdFx0XHRwcm92aWRlcnMucHVzaCguLi50eXBlUHJvdmlkZXJzKTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRpZiAocHJvdmlkZXJzLmxlbmd0aCA9PT0gMCkge1xuXHRcdFx0dGhyb3cgbmV3IEVycm9yKCdObyByZWxhdGVkIGluZm9ybWF0aW9uIHByb3ZpZGVycyByZWdpc3RlcmVkIGZvciB0aGUgZ2l2ZW4gdHlwZXMnKTtcblx0XHR9XG5cblx0XHRjb25zdCBzdG9wd2F0Y2ggPSBTdG9wV2F0Y2guY3JlYXRlKCk7XG5cblx0XHRjb25zdCBjYW5jZWxsYWJsZVByb21pc2VzOiBBcnJheTxDYW5jZWxhYmxlUHJvbWlzZTxSZWxhdGVkSW5mb3JtYXRpb25SZXN1bHRbXT4+ID0gcHJvdmlkZXJzLm1hcCgocHJvdmlkZXIpID0+IHtcblx0XHRcdHJldHVybiBjcmVhdGVDYW5jZWxhYmxlUHJvbWlzZShhc3luYyB0ID0+IHtcblx0XHRcdFx0dHJ5IHtcblx0XHRcdFx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCBwcm92aWRlci5wcm92aWRlQWlSZWxhdGVkSW5mb3JtYXRpb24ocXVlcnksIHQpO1xuXHRcdFx0XHRcdC8vIGRvdWJsZSBmaWx0ZXIganVzdCBpbiBjYXNlXG5cdFx0XHRcdFx0cmV0dXJuIHJlc3VsdC5maWx0ZXIociA9PiB0eXBlcy5pbmNsdWRlcyhyLnR5cGUpKTtcblx0XHRcdFx0fSBjYXRjaCAoZSkge1xuXHRcdFx0XHRcdC8vIGxvZ2dlZCBpbiBleHRlbnNpb24gaG9zdFxuXHRcdFx0XHR9XG5cdFx0XHRcdHJldHVybiBbXTtcblx0XHRcdH0pO1xuXHRcdH0pO1xuXG5cdFx0dHJ5IHtcblx0XHRcdGNvbnN0IHJlc3VsdHMgPSBhd2FpdCByYWNlVGltZW91dChcblx0XHRcdFx0UHJvbWlzZS5hbGxTZXR0bGVkKGNhbmNlbGxhYmxlUHJvbWlzZXMpLFxuXHRcdFx0XHRBaVJlbGF0ZWRJbmZvcm1hdGlvblNlcnZpY2UuREVGQVVMVF9USU1FT1VULFxuXHRcdFx0XHQoKSA9PiB7XG5cdFx0XHRcdFx0Y2FuY2VsbGFibGVQcm9taXNlcy5mb3JFYWNoKHAgPT4gcC5jYW5jZWwoKSk7XG5cdFx0XHRcdFx0dGhpcy5sb2dTZXJ2aWNlLndhcm4oJ1tBaVJlbGF0ZWRJbmZvcm1hdGlvblNlcnZpY2VdOiBSZWxhdGVkIGluZm9ybWF0aW9uIHByb3ZpZGVyIHRpbWVkIG91dCcpO1xuXHRcdFx0XHR9XG5cdFx0XHQpO1xuXHRcdFx0aWYgKCFyZXN1bHRzKSB7XG5cdFx0XHRcdHJldHVybiBbXTtcblx0XHRcdH1cblx0XHRcdGNvbnN0IHJlc3VsdCA9IHJlc3VsdHNcblx0XHRcdFx0LmZpbHRlcihyID0+IHIuc3RhdHVzID09PSAnZnVsZmlsbGVkJylcblx0XHRcdFx0LmZsYXRNYXAociA9PiAociBhcyBQcm9taXNlRnVsZmlsbGVkUmVzdWx0PFJlbGF0ZWRJbmZvcm1hdGlvblJlc3VsdFtdPikudmFsdWUpO1xuXHRcdFx0cmV0dXJuIHJlc3VsdDtcblx0XHR9IGZpbmFsbHkge1xuXHRcdFx0c3RvcHdhdGNoLnN0b3AoKTtcblx0XHRcdHRoaXMubG9nU2VydmljZS50cmFjZShgW0FpUmVsYXRlZEluZm9ybWF0aW9uU2VydmljZV06IGdldFJlbGF0ZWRJbmZvcm1hdGlvbiB0b29rICR7c3RvcHdhdGNoLmVsYXBzZWQoKX1tc2ApO1xuXHRcdH1cblx0fVxufVxuXG5yZWdpc3RlclNpbmdsZXRvbihJQWlSZWxhdGVkSW5mb3JtYXRpb25TZXJ2aWNlLCBBaVJlbGF0ZWRJbmZvcm1hdGlvblNlcnZpY2UsIEluc3RhbnRpYXRpb25UeXBlLkRlbGF5ZWQpO1xuIl0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7Ozs7QUFNQSxTQUE0Qix5QkFBeUIsbUJBQW1CO0FBRXhFLFNBQVMsbUJBQW1CLHlCQUF5QjtBQUNyRCxTQUFTLGlCQUFpQjtBQUMxQixTQUFTLG1CQUFtQjtBQUM1QixTQUFTLG9DQUFxSDtBQUV2SCxJQUFNLDhCQUFOLE1BQTBFO0FBQUEsRUFP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
