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
import { timeout } from "../../../../base/common/async.js";
import { onUnexpectedError } from "../../../../base/common/errors.js";
import { INativeWorkbenchEnvironmentService } from "../../../services/environment/electron-browser/environmentService.js";
import { ILifecycleService } from "../../../services/lifecycle/common/lifecycle.js";
import { IProductService } from "../../../../platform/product/common/productService.js";
import { ITelemetryService } from "../../../../platform/telemetry/common/telemetry.js";
import { IUpdateService } from "../../../../platform/update/common/update.js";
import { INativeHostService } from "../../../../platform/native/common/native.js";
import { IEditorService } from "../../../services/editor/common/editorService.js";
import { ITimerService } from "../../../services/timer/browser/timerService.js";
import { IFileService } from "../../../../platform/files/common/files.js";
import { URI } from "../../../../base/common/uri.js";
import { VSBuffer } from "../../../../base/common/buffer.js";
import { IWorkspaceTrustManagementService } from "../../../../platform/workspace/common/workspaceTrust.js";
import { IPaneCompositePartService } from "../../../services/panecomposite/browser/panecomposite.js";
import { StartupTimings } from "../browser/startupTimings.js";
import { coalesce } from "../../../../base/common/arrays.js";
let NativeStartupTimings = class extends StartupTimings {
  constructor(_fileService, _timerService, _nativeHostService, editorService, paneCompositeService, _telemetryService, lifecycleService, updateService, _environmentService, _productService, workspaceTrustService) {
    super(editorService, paneCompositeService, lifecycleService, updateService, workspaceTrustService);
    this._fileService = _fileService;
    this._timerService = _timerService;
    this._nativeHostService = _nativeHostService;
    this._telemetryService = _telemetryService;
    this._environmentService = _environmentService;
    this._productService = _productService;
    this._report().catch(onUnexpectedError);
  }
  async _report() {
    const standardStartupError = await this._isStandardStartup();
    this._appendStartupTimes(standardStartupError).catch(onUnexpectedError);
  }
  async _appendStartupTimes(standardStartupError) {
    const appendTo = this._environmentService.args["prof-append-timers"];
    const durationMarkers = this._environmentService.args["prof-duration-markers"];
    const durationMarkersFile = this._environmentService.args["prof-duration-markers-file"];
    if (!appendTo && !durationMarkers) {
      return;
    }
    try {
      await Promise.all([
        this._timerService.whenReady(),
        timeout(15e3)
        // wait: cached data creation, telemetry sending
      ]);
      const perfBaseline = await this._timerService.perfBaseline;
      const heapStatistics = await this._resolveStartupHeapStatistics();
      if (heapStatistics) {
        this._telemetryLogHeapStatistics(heapStatistics);
      }
      if (appendTo) {
        const content = coalesce([
          this._timerService.startupMetrics.ellapsed,
          this._productService.nameShort,
          (this._productService.commit || "").slice(0, 10) || "0000000000",
          this._telemetryService.sessionId,
          standardStartupError === void 0 ? "standard_start" : `NO_standard_start : ${standardStartupError}`,
          `${String(perfBaseline).padStart(4, "0")}ms`,
          heapStatistics ? this._printStartupHeapStatistics(heapStatistics) : void 0
        ]).join("	") + "\n";
        await this._appendContent(URI.file(appendTo), content);
      }
      if (durationMarkers?.length) {
        const durations = [];
        for (const durationMarker of durationMarkers) {
          let duration = 0;
          if (durationMarker === "ellapsed") {
            duration = this._timerService.startupMetrics.ellapsed;
          } else if (durationMarker.indexOf("-") !== -1) {
            const markers = durationMarker.split("-");
            if (markers.length === 2) {
              duration = this._timerService.getDuration(markers[0], markers[1]);
            }
          }
          if (duration) {
            durations.push(durationMarker);
            durations.push(`${duration}`);
          }
        }
        const durationsContent = `${durations.join("	")}
`;
        if (durationMarkersFile) {
          await this._appendContent(URI.file(durationMarkersFile), durationsContent);
        } else {
          console.log(durationsContent);
        }
      }
    } catch (err) {
      console.error(err);
    } finally {
      this._nativeHostService.exit(0);
    }
  }
  async _isStandardStartup() {
    const windowCount = await this._nativeHostService.getWindowCount();
    if (windowCount !== 1) {
      return `Expected window count : 1, Actual : ${windowCount}`;
    }
    return super._isStandardStartup();
  }
  async _appendContent(file, content) {
    const chunks = [];
    if (await this._fileService.exists(file)) {
      chunks.push((await this._fileService.readFile(file)).value);
    }
    chunks.push(VSBuffer.fromString(content));
    await this._fileService.writeFile(file, VSBuffer.concat(chunks));
  }
  async _resolveStartupHeapStatistics() {
    if (!this._environmentService.args["enable-tracing"] || !this._environmentService.args["trace-startup-file"] || this._environmentService.args["trace-startup-format"] !== "json" || !this._environmentService.args["trace-startup-duration"]) {
      return void 0;
    }
    const windowProcessId = await this._nativeHostService.getProcessId();
    const used = performance.memory?.usedJSHeapSize ?? 0;
    let minorGCs = 0;
    let majorGCs = 0;
    let garbage = 0;
    let duration = 0;
    try {
      const traceContents = JSON.parse((await this._fileService.readFile(URI.file(this._environmentService.args["trace-startup-file"]))).value.toString());
      for (const event of traceContents.traceEvents) {
        if (event.pid !== windowProcessId) {
          continue;
        }
        switch (event.name) {
          // Major/Minor GC Events
          case "MinorGC":
            minorGCs++;
            break;
          case "MajorGC":
            majorGCs++;
            break;
          // GC Events that block the main thread
          // Refs: https://v8.dev/blog/trash-talk
          case "V8.GCFinalizeMC":
          case "V8.GCScavenger":
            duration += event.dur;
            break;
        }
        if (event.name === "MajorGC" || event.name === "MinorGC") {
          if (typeof event.args?.usedHeapSizeAfter === "number" && typeof event.args.usedHeapSizeBefore === "number") {
            garbage += event.args.usedHeapSizeBefore - event.args.usedHeapSizeAfter;
          }
        }
      }
      return { minorGCs, majorGCs, used, garbage, duration: Math.round(duration / 1e3) };
    } catch (error) {
      console.error(error);
    }
    return void 0;
  }
  _telemetryLogHeapStatistics({ used, garbage, majorGCs, minorGCs, duration }) {
    this._telemetryService.publicLog2("startupHeapStatistics", {
      heapUsed: used,
      heapGarbage: garbage,
      majorGCs,
      minorGCs,
      gcsDuration: duration
    });
  }
  _printStartupHeapStatistics({ used, garbage, majorGCs, minorGCs, duration }) {
    const MB = 1024 * 1024;
    return `Heap: ${Math.round(used / MB)}MB (used) ${Math.round(garbage / MB)}MB (garbage) ${majorGCs} (MajorGC) ${minorGCs} (MinorGC) ${duration}ms (GC duration)`;
  }
};
NativeStartupTimings = __decorateClass([
  __decorateParam(0, IFileService),
  __decorateParam(1, ITimerService),
  __decorateParam(2, INativeHostService),
  __decorateParam(3, IEditorService),
  __decorateParam(4, IPaneCompositePartService),
  __decorateParam(5, ITelemetryService),
  __decorateParam(6, ILifecycleService),
  __decorateParam(7, IUpdateService),
  __decorateParam(8, INativeWorkbenchEnvironmentService),
  __decorateParam(9, IProductService),
  __decorateParam(10, IWorkspaceTrustManagementService)
], NativeStartupTimings);
export {
  NativeStartupTimings
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXHBlcmZvcm1hbmNlXFxlbGVjdHJvbi1icm93c2VyXFxzdGFydHVwVGltaW5ncy50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB7IElXb3JrYmVuY2hDb250cmlidXRpb24gfSBmcm9tICcuLi8uLi8uLi9jb21tb24vY29udHJpYnV0aW9ucy5qcyc7XG5pbXBvcnQgeyB0aW1lb3V0IH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vYXN5bmMuanMnO1xuaW1wb3J0IHsgb25VbmV4cGVjdGVkRXJyb3IgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9lcnJvcnMuanMnO1xuaW1wb3J0IHsgSU5hdGl2ZVdvcmtiZW5jaEVudmlyb25tZW50U2VydmljZSB9IGZyb20gJy4uLy4uLy4uL3NlcnZpY2VzL2Vudmlyb25tZW50L2VsZWN0cm9uLWJyb3dzZXIvZW52aXJvbm1lbnRTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElMaWZlY3ljbGVTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vc2VydmljZXMvbGlmZWN5Y2xlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgSVByb2R1Y3RTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vcHJvZHVjdC9jb21tb24vcHJvZHVjdFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSVRlbGVtZXRyeVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS90ZWxlbWV0cnkvY29tbW9uL3RlbGVtZXRyeS5qcyc7XG5pbXBvcnQgeyBJVXBkYXRlU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3VwZGF0ZS9jb21tb24vdXBkYXRlLmpzJztcbmltcG9ydCB7IElOYXRpdmVIb3N0U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL25hdGl2ZS9jb21tb24vbmF0aXZlLmpzJztcbmltcG9ydCB7IElFZGl0b3JTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vc2VydmljZXMvZWRpdG9yL2NvbW1vbi9lZGl0b3JTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElUaW1lclNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9zZXJ2aWNlcy90aW1lci9icm93c2VyL3RpbWVyU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJRmlsZVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9maWxlcy9jb21tb24vZmlsZXMuanMnO1xuaW1wb3J0IHsgVVJJIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdXJpLmpzJztcbmltcG9ydCB7IFZTQnVmZmVyIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vYnVmZmVyLmpzJztcbmltcG9ydCB7IElXb3Jrc3BhY2VUcnVzdE1hbmFnZW1lbnRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vd29ya3NwYWNlL2NvbW1vbi93b3Jrc3BhY2VUcnVzdC5qcyc7XG5pbXBvcnQgeyBJUGFuZUNvbXBvc2l0ZVBhcnRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vc2VydmljZXMvcGFuZWNvbXBvc2l0ZS9icm93c2VyL3BhbmVjb21wb3NpdGUuanMnO1xuaW1wb3J0IHsgU3RhcnR1cFRpbWluZ3MgfSBmcm9tICcuLi9icm93c2VyL3N0YXJ0dXBUaW1pbmdzLmpzJztcbmltcG9ydCB7IGNvYWxlc2NlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vYXJyYXlzLmpzJztcblxuaW50ZXJmYWNlIElUcmFjaW5nRGF0YSB7XG5cdHJlYWRvbmx5IGFyZ3M/OiB7XG5cdFx0cmVhZG9ubHkgdXNlZEhlYXBTaXplQWZ0ZXI/OiBudW1iZXI7XG5cdFx0cmVhZG9ubHkgdXNlZEhlYXBTaXplQmVmb3JlPzogbnVtYmVyO1xuXHR9O1xuXHRyZWFkb25seSBkdXI6IG51bWJlcjsgXHQvLyBpbiBtaWNyb3NlY29uZHNcblx0cmVhZG9ubHkgbmFtZTogc3RyaW5nO1x0Ly8gZS5nLiBNaW5vckdDIG9yIE1ham9yR0Ncblx0cmVhZG9ubHkgcGlkOiBudW1iZXI7XG59XG5cbmludGVyZmFjZSBJSGVhcFN0YXRpc3RpY3Mge1xuXHRyZWFkb25seSB1c2VkOiBudW1iZXI7XG5cdHJlYWRvbmx5IGdhcmJhZ2U6IG51bWJlcjtcblx0cmVhZG9ubHkgbWFqb3JHQ3M6IG51bWJlcjtcblx0cmVhZG9ubHkgbWlub3JHQ3M6IG51bWJlcjtcblx0cmVhZG9ubHkgZHVyYXRpb246IG51bWJlcjtcbn1cblxuZXhwb3J0IGNsYXNzIE5hdGl2ZVN0YXJ0dXBUaW1pbmdzIGV4dGVuZHMgU3RhcnR1cFRpbWluZ3MgaW1wbGVtZW50cyBJV29ya2JlbmNoQ29udHJpYnV0aW9uIHtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRASUZpbGVTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2ZpbGVTZXJ2aWNlOiBJRmlsZVNlcnZpY2UsXG5cdFx0QElUaW1lclNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfdGltZXJTZXJ2aWNlOiBJVGltZXJTZXJ2aWNlLFxuXHRcdEBJTmF0aXZlSG9zdFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfbmF0aXZlSG9zdFNlcnZpY2U6IElOYXRpdmVIb3N0U2VydmljZSxcblx0XHRASUVkaXRvclNlcnZpY2UgZWRpdG9yU2VydmljZTogSUVkaXRvclNlcnZpY2UsXG5cdFx0QElQYW5lQ29tcG9zaXRlUGFydFNlcnZpY2UgcGFuZUNvbXBvc2l0ZVNlcnZpY2U6IElQYW5lQ29tcG9zaXRlUGFydFNlcnZpY2UsXG5cdFx0QElUZWxlbWV0cnlTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX3RlbGVtZXRyeVNlcnZpY2U6IElUZWxlbWV0cnlTZXJ2aWNlLFxuXHRcdEBJTGlmZWN5Y2xlU2VydmljZSBsaWZlY3ljbGVTZXJ2aWNlOiBJTGlmZWN5Y2xlU2VydmljZSxcblx0XHRASVVwZGF0ZVNlcnZpY2UgdXBkYXRlU2VydmljZTogSVVwZGF0ZVNlcnZpY2UsXG5cdFx0QElOYXRpdmVXb3JrYmVuY2hFbnZpcm9ubWVudFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfZW52aXJvbm1lbnRTZXJ2aWNlOiBJTmF0aXZlV29ya2JlbmNoRW52aXJvbm1lbnRTZXJ2aWNlLFxuXHRcdEBJUHJvZHVjdFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfcHJvZHVjdFNlcnZpY2U6IElQcm9kdWN0U2VydmljZSxcblx0XHRASVdvcmtzcGFjZVRydXN0TWFuYWdlbWVudFNlcnZpY2Ugd29ya3NwYWNlVHJ1c3RTZXJ2aWNlOiBJV29ya3NwYWNlVHJ1c3RNYW5hZ2VtZW50U2VydmljZVxuXHQpIHtcblx0XHRzdXBlcihlZGl0b3JTZXJ2aWNlLCBwYW5lQ29tcG9zaXRlU2VydmljZSwgbGlmZWN5Y2xlU2VydmljZSwgdXBkYXRlU2VydmljZSwgd29ya3NwYWNlVHJ1c3RTZXJ2aWNlKTtcblxuXHRcdHRoaXMuX3JlcG9ydCgpLmNhdGNoKG9uVW5leHBlY3RlZEVycm9yKTtcblx0fVxuXG5cdHByaXZhdGUgYXN5bmMgX3JlcG9ydCgpIHtcblx0XHRjb25zdCBzdGFuZGFyZFN0YXJ0dXBFcnJvciA9IGF3YWl0IHRoaXMuX2lzU3RhbmRhcmRTdGFydHVwKCk7XG5cdFx0dGhpcy5fYXBwZW5kU3RhcnR1cFRpbWVzKHN0YW5kYXJkU3RhcnR1cEVycm9yKS5jYXRjaChvblVuZXhwZWN0ZWRFcnJvcik7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIF9hcHBlbmRTdGFydHVwVGltZXMoc3RhbmRhcmRTdGFydHVwRXJyb3I6IHN0cmluZyB8IHVuZGVmaW5lZCkge1xuXHRcdGNvbnN0IGFwcGVuZFRvID0gdGhpcy5fZW52aXJvbm1lbnRTZXJ2aWNlLmFyZ3NbJ3Byb2YtYXBwZW5kLXRpbWVycyddO1xuXHRcdGNvbnN0IGR1cmF0aW9uTWFya2VycyA9IHRoaXMuX2Vudmlyb25tZW50U2VydmljZS5hcmdzWydwcm9mLWR1cmF0aW9uLW1hcmtlcnMnXTtcblx0XHRjb25zdCBkdXJhdGlvbk1hcmtlcnNGaWxlID0gdGhpcy5fZW52aXJvbm1lbnRTZXJ2aWNlLmFyZ3NbJ3Byb2YtZHVyYXRpb24tbWFya2Vycy1maWxlJ107XG5cdFx0aWYgKCFhcHBlbmRUbyAmJiAhZHVyYXRpb25NYXJrZXJzKSB7XG5cdFx0XHQvLyBub3RoaW5nIHRvIGRvXG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0dHJ5IHtcblx0XHRcdGF3YWl0IFByb21pc2UuYWxsKFtcblx0XHRcdFx0dGhpcy5fdGltZXJTZXJ2aWNlLndoZW5SZWFkeSgpLFxuXHRcdFx0XHR0aW1lb3V0KDE1MDAwKSwgLy8gd2FpdDogY2FjaGVkIGRhdGEgY3JlYXRpb24sIHRlbGVtZXRyeSBzZW5kaW5nXG5cdFx0XHRdKTtcblxuXHRcdFx0Y29uc3QgcGVyZkJhc2VsaW5lID0gYXdhaXQgdGhpcy5fdGltZXJTZXJ2aWNlLnBlcmZCYXNlbGluZTtcblx0XHRcdGNvbnN0IGhlYXBTdGF0aXN0aWNzID0gYXdhaXQgdGhpcy5fcmVzb2x2ZVN0YXJ0dXBIZWFwU3RhdGlzdGljcygpO1xuXHRcdFx0aWYgKGhlYXBTdGF0aXN0aWNzKSB7XG5cdFx0XHRcdHRoaXMuX3RlbGVtZXRyeUxvZ0hlYXBTdGF0aXN0aWNzKGhlYXBTdGF0aXN0aWNzKTtcblx0XHRcdH1cblxuXHRcdFx0aWYgKGFwcGVuZFRvKSB7XG5cdFx0XHRcdGNvbnN0IGNvbnRlbnQgPSBjb2FsZXNjZShbXG5cdFx0XHRcdFx0dGhpcy5fdGltZXJTZXJ2aWNlLnN0YXJ0dXBNZXRyaWNzLmVsbGFwc2VkLFxuXHRcdFx0XHRcdHRoaXMuX3Byb2R1Y3RTZXJ2aWNlLm5hbWVTaG9ydCxcblx0XHRcdFx0XHQodGhpcy5fcHJvZHVjdFNlcnZpY2UuY29tbWl0IHx8ICcnKS5zbGljZSgwLCAxMCkgfHwgJzAwMDAwMDAwMDAnLFxuXHRcdFx0XHRcdHRoaXMuX3RlbGVtZXRyeVNlcnZpY2Uuc2Vzc2lvbklkLFxuXHRcdFx0XHRcdHN0YW5kYXJkU3RhcnR1cEVycm9yID09PSB1bmRlZmluZWQgPyAnc3RhbmRhcmRfc3RhcnQnIDogYE5PX3N0YW5kYXJkX3N0YXJ0IDogJHtzdGFuZGFyZFN0YXJ0dXBFcnJvcn1gLFxuXHRcdFx0XHRcdGAke1N0cmluZyhwZXJmQmFzZWxpbmUpLnBhZFN0YXJ0KDQsICcwJyl9bXNgLFxuXHRcdFx0XHRcdGhlYXBTdGF0aXN0aWNzID8gdGhpcy5fcHJpbnRTdGFydHVwSGVhcFN0YXRpc3RpY3MoaGVhcFN0YXRpc3RpY3MpIDogdW5kZWZpbmVkXG5cdFx0XHRcdF0pLmpvaW4oJ1xcdCcpICsgJ1xcbic7XG5cdFx0XHRcdGF3YWl0IHRoaXMuX2FwcGVuZENvbnRlbnQoVVJJLmZpbGUoYXBwZW5kVG8pLCBjb250ZW50KTtcblx0XHRcdH1cblxuXHRcdFx0aWYgKGR1cmF0aW9uTWFya2Vycz8ubGVuZ3RoKSB7XG5cdFx0XHRcdGNvbnN0IGR1cmF0aW9uczogc3RyaW5nW10gPSBbXTtcblx0XHRcdFx0Zm9yIChjb25zdCBkdXJhdGlvbk1hcmtlciBvZiBkdXJhdGlvbk1hcmtlcnMpIHtcblx0XHRcdFx0XHRsZXQgZHVyYXRpb246IG51bWJlciA9IDA7XG5cdFx0XHRcdFx0aWYgKGR1cmF0aW9uTWFya2VyID09PSAnZWxsYXBzZWQnKSB7XG5cdFx0XHRcdFx0XHRkdXJhdGlvbiA9IHRoaXMuX3RpbWVyU2VydmljZS5zdGFydHVwTWV0cmljcy5lbGxhcHNlZDtcblx0XHRcdFx0XHR9IGVsc2UgaWYgKGR1cmF0aW9uTWFya2VyLmluZGV4T2YoJy0nKSAhPT0gLTEpIHtcblx0XHRcdFx0XHRcdGNvbnN0IG1hcmtlcnMgPSBkdXJhdGlvbk1hcmtlci5zcGxpdCgnLScpO1xuXHRcdFx0XHRcdFx0aWYgKG1hcmtlcnMubGVuZ3RoID09PSAyKSB7XG5cdFx0XHRcdFx0XHRcdGR1cmF0aW9uID0gdGhpcy5fdGltZXJTZXJ2aWNlLmdldER1cmF0aW9uKG1hcmtlcnNbMF0sIG1hcmtlcnNbMV0pO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRpZiAoZHVyYXRpb24pIHtcblx0XHRcdFx0XHRcdGR1cmF0aW9ucy5wdXNoKGR1cmF0aW9uTWFya2VyKTtcblx0XHRcdFx0XHRcdGR1cmF0aW9ucy5wdXNoKGAke2R1cmF0aW9ufWApO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXG5cdFx0XHRcdGNvbnN0IGR1cmF0aW9uc0NvbnRlbnQgPSBgJHtkdXJhdGlvbnMuam9pbignXFx0Jyl9XFxuYDtcblx0XHRcdFx0aWYgKGR1cmF0aW9uTWFya2Vyc0ZpbGUpIHtcblx0XHRcdFx0XHRhd2FpdCB0aGlzLl9hcHBlbmRDb250ZW50KFVSSS5maWxlKGR1cmF0aW9uTWFya2Vyc0ZpbGUpLCBkdXJhdGlvbnNDb250ZW50KTtcblx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRjb25zb2xlLmxvZyhkdXJhdGlvbnNDb250ZW50KTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXG5cdFx0fSBjYXRjaCAoZXJyKSB7XG5cdFx0XHRjb25zb2xlLmVycm9yKGVycik7XG5cdFx0fSBmaW5hbGx5IHtcblx0XHRcdHRoaXMuX25hdGl2ZUhvc3RTZXJ2aWNlLmV4aXQoMCk7XG5cdFx0fVxuXHR9XG5cblx0cHJvdGVjdGVkIG92ZXJyaWRlIGFzeW5jIF9pc1N0YW5kYXJkU3RhcnR1cCgpOiBQcm9taXNlPHN0cmluZyB8IHVuZGVmaW5lZD4ge1xuXHRcdGNvbnN0IHdpbmRvd0NvdW50ID0gYXdhaXQgdGhpcy5fbmF0aXZlSG9zdFNlcnZpY2UuZ2V0V2luZG93Q291bnQoKTtcblx0XHRpZiAod2luZG93Q291bnQgIT09IDEpIHtcblx0XHRcdHJldHVybiBgRXhwZWN0ZWQgd2luZG93IGNvdW50IDogMSwgQWN0dWFsIDogJHt3aW5kb3dDb3VudH1gO1xuXHRcdH1cblx0XHRyZXR1cm4gc3VwZXIuX2lzU3RhbmRhcmRTdGFydHVwKCk7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIF9hcHBlbmRDb250ZW50KGZpbGU6IFVSSSwgY29udGVudDogc3RyaW5nKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3QgY2h1bmtzOiBWU0J1ZmZlcltdID0gW107XG5cdFx0aWYgKGF3YWl0IHRoaXMuX2ZpbGVTZXJ2aWNlLmV4aXN0cyhmaWxlKSkge1xuXHRcdFx0Y2h1bmtzLnB1c2goKGF3YWl0IHRoaXMuX2ZpbGVTZXJ2aWNlLnJlYWRGaWxlKGZpbGUpKS52YWx1ZSk7XG5cdFx0fVxuXHRcdGNodW5rcy5wdXNoKFZTQnVmZmVyLmZyb21TdHJpbmcoY29udGVudCkpO1xuXHRcdGF3YWl0IHRoaXMuX2ZpbGVTZXJ2aWNlLndyaXRlRmlsZShmaWxlLCBWU0J1ZmZlci5jb25jYXQoY2h1bmtzKSk7XG5cdH1cblxuXHRwcml2YXRlIGFzeW5jIF9yZXNvbHZlU3RhcnR1cEhlYXBTdGF0aXN0aWNzKCk6IFByb21pc2U8SUhlYXBTdGF0aXN0aWNzIHwgdW5kZWZpbmVkPiB7XG5cdFx0aWYgKFxuXHRcdFx0IXRoaXMuX2Vudmlyb25tZW50U2VydmljZS5hcmdzWydlbmFibGUtdHJhY2luZyddIHx8XG5cdFx0XHQhdGhpcy5fZW52aXJvbm1lbnRTZXJ2aWNlLmFyZ3NbJ3RyYWNlLXN0YXJ0dXAtZmlsZSddIHx8XG5cdFx0XHR0aGlzLl9lbnZpcm9ubWVudFNlcnZpY2UuYXJnc1sndHJhY2Utc3RhcnR1cC1mb3JtYXQnXSAhPT0gJ2pzb24nIHx8XG5cdFx0XHQhdGhpcy5fZW52aXJvbm1lbnRTZXJ2aWNlLmFyZ3NbJ3RyYWNlLXN0YXJ0dXAtZHVyYXRpb24nXVxuXHRcdCkge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDsgLy8gdW5leHBlY3RlZCBhcmd1bWVudHMgZm9yIHN0YXJ0dXAgaGVhcCBzdGF0aXN0aWNzXG5cdFx0fVxuXG5cdFx0Y29uc3Qgd2luZG93UHJvY2Vzc0lkID0gYXdhaXQgdGhpcy5fbmF0aXZlSG9zdFNlcnZpY2UuZ2V0UHJvY2Vzc0lkKCk7XG5cdFx0Y29uc3QgdXNlZCA9IChwZXJmb3JtYW5jZSBhcyB1bmtub3duIGFzIHsgbWVtb3J5PzogeyB1c2VkSlNIZWFwU2l6ZT86IG51bWJlciB9IH0pLm1lbW9yeT8udXNlZEpTSGVhcFNpemUgPz8gMDsgLy8gaHR0cHM6Ly9kZXZlbG9wZXIubW96aWxsYS5vcmcvZW4tVVMvZG9jcy9XZWIvQVBJL1BlcmZvcm1hbmNlL21lbW9yeVxuXG5cdFx0bGV0IG1pbm9yR0NzID0gMDtcblx0XHRsZXQgbWFqb3JHQ3MgPSAwO1xuXHRcdGxldCBnYXJiYWdlID0gMDtcblx0XHRsZXQgZHVyYXRpb24gPSAwO1xuXG5cdFx0dHJ5IHtcblx0XHRcdGNvbnN0IHRyYWNlQ29udGVudHM6IHsgdHJhY2VFdmVudHM6IElUcmFjaW5nRGF0YVtdIH0gPSBKU09OLnBhcnNlKChhd2FpdCB0aGlzLl9maWxlU2VydmljZS5yZWFkRmlsZShVUkkuZmlsZSh0aGlzLl9lbnZpcm9ubWVudFNlcnZpY2UuYXJnc1sndHJhY2Utc3RhcnR1cC1maWxlJ10pKSkudmFsdWUudG9TdHJpbmcoKSk7XG5cdFx0XHRmb3IgKGNvbnN0IGV2ZW50IG9mIHRyYWNlQ29udGVudHMudHJhY2VFdmVudHMpIHtcblx0XHRcdFx0aWYgKGV2ZW50LnBpZCAhPT0gd2luZG93UHJvY2Vzc0lkKSB7XG5cdFx0XHRcdFx0Y29udGludWU7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRzd2l0Y2ggKGV2ZW50Lm5hbWUpIHtcblxuXHRcdFx0XHRcdC8vIE1ham9yL01pbm9yIEdDIEV2ZW50c1xuXHRcdFx0XHRcdGNhc2UgJ01pbm9yR0MnOlxuXHRcdFx0XHRcdFx0bWlub3JHQ3MrKztcblx0XHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHRcdGNhc2UgJ01ham9yR0MnOlxuXHRcdFx0XHRcdFx0bWFqb3JHQ3MrKztcblx0XHRcdFx0XHRcdGJyZWFrO1xuXG5cdFx0XHRcdFx0Ly8gR0MgRXZlbnRzIHRoYXQgYmxvY2sgdGhlIG1haW4gdGhyZWFkXG5cdFx0XHRcdFx0Ly8gUmVmczogaHR0cHM6Ly92OC5kZXYvYmxvZy90cmFzaC10YWxrXG5cdFx0XHRcdFx0Y2FzZSAnVjguR0NGaW5hbGl6ZU1DJzpcblx0XHRcdFx0XHRjYXNlICdWOC5HQ1NjYXZlbmdlcic6XG5cdFx0XHRcdFx0XHRkdXJhdGlvbiArPSBldmVudC5kdXI7XG5cdFx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0fVxuXG5cdFx0XHRcdGlmIChldmVudC5uYW1lID09PSAnTWFqb3JHQycgfHwgZXZlbnQubmFtZSA9PT0gJ01pbm9yR0MnKSB7XG5cdFx0XHRcdFx0aWYgKHR5cGVvZiBldmVudC5hcmdzPy51c2VkSGVhcFNpemVBZnRlciA9PT0gJ251bWJlcicgJiYgdHlwZW9mIGV2ZW50LmFyZ3MudXNlZEhlYXBTaXplQmVmb3JlID09PSAnbnVtYmVyJykge1xuXHRcdFx0XHRcdFx0Z2FyYmFnZSArPSAoZXZlbnQuYXJncy51c2VkSGVhcFNpemVCZWZvcmUgLSBldmVudC5hcmdzLnVzZWRIZWFwU2l6ZUFmdGVyKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdH1cblxuXHRcdFx0cmV0dXJuIHsgbWlub3JHQ3MsIG1ham9yR0NzLCB1c2VkLCBnYXJiYWdlLCBkdXJhdGlvbjogTWF0aC5yb3VuZChkdXJhdGlvbiAvIDEwMDApIH07XG5cdFx0fSBjYXRjaCAoZXJyb3IpIHtcblx0XHRcdGNvbnNvbGUuZXJyb3IoZXJyb3IpO1xuXHRcdH1cblxuXHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdH1cblxuXHRwcml2YXRlIF90ZWxlbWV0cnlMb2dIZWFwU3RhdGlzdGljcyh7IHVzZWQsIGdhcmJhZ2UsIG1ham9yR0NzLCBtaW5vckdDcywgZHVyYXRpb24gfTogSUhlYXBTdGF0aXN0aWNzKTogdm9pZCB7XG5cdFx0dHlwZSBTdGFydHVwSGVhcFN0YXRpc3RpY3NDbGFzc2lmaWNhdGlvbiA9IHtcblx0XHRcdG93bmVyOiAnYnBhc2Vybyc7XG5cdFx0XHRjb21tZW50OiAnQW4gZXZlbnQgdGhhdCByZXBvcnRzIHN0YXJ0dXAgaGVhcCBzdGF0aXN0aWNzIGZvciBwZXJmb3JtYW5jZSBhbmFseXNpcy4nO1xuXHRcdFx0aGVhcFVzZWQ6IHsgY2xhc3NpZmljYXRpb246ICdTeXN0ZW1NZXRhRGF0YSc7IHB1cnBvc2U6ICdQZXJmb3JtYW5jZUFuZEhlYWx0aCc7IGNvbW1lbnQ6ICdVc2VkIGhlYXAnIH07XG5cdFx0XHRoZWFwR2FyYmFnZTogeyBjbGFzc2lmaWNhdGlvbjogJ1N5c3RlbU1ldGFEYXRhJzsgcHVycG9zZTogJ1BlcmZvcm1hbmNlQW5kSGVhbHRoJzsgY29tbWVudDogJ0dhcmJhZ2UgaGVhcCcgfTtcblx0XHRcdG1ham9yR0NzOiB7IGNsYXNzaWZpY2F0aW9uOiAnU3lzdGVtTWV0YURhdGEnOyBwdXJwb3NlOiAnUGVyZm9ybWFuY2VBbmRIZWFsdGgnOyBjb21tZW50OiAnTWFqb3IgR0NzIGNvdW50JyB9O1xuXHRcdFx0bWlub3JHQ3M6IHsgY2xhc3NpZmljYXRpb246ICdTeXN0ZW1NZXRhRGF0YSc7IHB1cnBvc2U6ICdQZXJmb3JtYW5jZUFuZEhlYWx0aCc7IGNvbW1lbnQ6ICdNaW5vciBHQ3MgY291bnQnIH07XG5cdFx0XHRnY3NEdXJhdGlvbjogeyBjbGFzc2lmaWNhdGlvbjogJ1N5c3RlbU1ldGFEYXRhJzsgcHVycG9zZTogJ1BlcmZvcm1hbmNlQW5kSGVhbHRoJzsgY29tbWVudDogJ0dDcyBkdXJhdGlvbicgfTtcblx0XHR9O1xuXHRcdHR5cGUgU3RhcnR1cEhlYXBTdGF0aXN0aWNzRXZlbnQgPSB7XG5cdFx0XHRoZWFwVXNlZDogbnVtYmVyO1xuXHRcdFx0aGVhcEdhcmJhZ2U6IG51bWJlcjtcblx0XHRcdG1ham9yR0NzOiBudW1iZXI7XG5cdFx0XHRtaW5vckdDczogbnVtYmVyO1xuXHRcdFx0Z2NzRHVyYXRpb246IG51bWJlcjtcblx0XHR9O1xuXHRcdHRoaXMuX3RlbGVtZXRyeVNlcnZpY2UucHVibGljTG9nMjxTdGFydHVwSGVhcFN0YXRpc3RpY3NFdmVudCwgU3RhcnR1cEhlYXBTdGF0aXN0aWNzQ2xhc3NpZmljYXRpb24+KCdzdGFydHVwSGVhcFN0YXRpc3RpY3MnLCB7XG5cdFx0XHRoZWFwVXNlZDogdXNlZCxcblx0XHRcdGhlYXBHYXJiYWdlOiBnYXJiYWdlLFxuXHRcdFx0bWFqb3JHQ3MsXG5cdFx0XHRtaW5vckdDcyxcblx0XHRcdGdjc0R1cmF0aW9uOiBkdXJhdGlvblxuXHRcdH0pO1xuXHR9XG5cblx0cHJpdmF0ZSBfcHJpbnRTdGFydHVwSGVhcFN0YXRpc3RpY3MoeyB1c2VkLCBnYXJiYWdlLCBtYWpvckdDcywgbWlub3JHQ3MsIGR1cmF0aW9uIH06IElIZWFwU3RhdGlzdGljcykge1xuXHRcdGNvbnN0IE1CID0gMTAyNCAqIDEwMjQ7XG5cdFx0cmV0dXJuIGBIZWFwOiAke01hdGgucm91bmQodXNlZCAvIE1CKX1NQiAodXNlZCkgJHtNYXRoLnJvdW5kKGdhcmJhZ2UgLyBNQil9TUIgKGdhcmJhZ2UpICR7bWFqb3JHQ3N9IChNYWpvckdDKSAke21pbm9yR0NzfSAoTWlub3JHQykgJHtkdXJhdGlvbn1tcyAoR0MgZHVyYXRpb24pYDtcblx0fVxufVxuIl0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7Ozs7QUFNQSxTQUFTLGVBQWU7QUFDeEIsU0FBUyx5QkFBeUI7QUFDbEMsU0FBUywwQ0FBMEM7QUFDbkQsU0FBUyx5QkFBeUI7QUFDbEMsU0FBUyx1QkFBdUI7QUFDaEMsU0FBUyx5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
