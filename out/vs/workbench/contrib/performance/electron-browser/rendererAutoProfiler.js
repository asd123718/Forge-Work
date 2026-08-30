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
import { VSBuffer } from "../../../../base/common/buffer.js";
import { joinPath } from "../../../../base/common/resources.js";
import { generateUuid } from "../../../../base/common/uuid.js";
import { IConfigurationService } from "../../../../platform/configuration/common/configuration.js";
import { IFileService } from "../../../../platform/files/common/files.js";
import { ILogService } from "../../../../platform/log/common/log.js";
import { INativeHostService } from "../../../../platform/native/common/native.js";
import { IProfileAnalysisWorkerService, ProfilingOutput } from "../../../../platform/profiling/electron-browser/profileAnalysisWorkerService.js";
import { INativeWorkbenchEnvironmentService } from "../../../services/environment/electron-browser/environmentService.js";
import { parseExtensionDevOptions } from "../../../services/extensions/common/extensionDevOptions.js";
import { ITimerService } from "../../../services/timer/browser/timerService.js";
let RendererProfiling = class {
  constructor(_environmentService, _fileService, _logService, nativeHostService, timerService, configService, profileAnalysisService) {
    this._environmentService = _environmentService;
    this._fileService = _fileService;
    this._logService = _logService;
    const devOpts = parseExtensionDevOptions(_environmentService);
    if (devOpts.isExtensionDevTestFromCli) {
      return;
    }
    timerService.perfBaseline.then((perfBaseline) => {
      (_environmentService.isBuilt ? _logService.info : _logService.trace).apply(_logService, [`[perf] Render performance baseline is ${perfBaseline}ms`]);
      if (perfBaseline < 0) {
        return;
      }
      const slowThreshold = perfBaseline * 10;
      const obs = new PerformanceObserver(async (list) => {
        obs.takeRecords();
        const maxDuration = list.getEntries().map((e) => e.duration).reduce((p, c) => Math.max(p, c), 0);
        if (maxDuration < slowThreshold) {
          return;
        }
        if (!configService.getValue("application.experimental.rendererProfiling")) {
          _logService.debug(`[perf] SLOW task detected (${maxDuration}ms) but renderer profiling is disabled via 'application.experimental.rendererProfiling'`);
          return;
        }
        const sessionId = generateUuid();
        _logService.warn(`[perf] Renderer reported VERY LONG TASK (${maxDuration}ms), starting profiling session '${sessionId}'`);
        obs.disconnect();
        for (let i = 0; i < 3; i++) {
          try {
            const profile = await nativeHostService.profileRenderer(sessionId, 5e3);
            const output = await profileAnalysisService.analyseBottomUp(profile, (_url) => "<<renderer>>", perfBaseline, true);
            if (output === ProfilingOutput.Interesting) {
              this._store(profile, sessionId);
              break;
            }
            timeout(15e3);
          } catch (err) {
            _logService.error(err);
            break;
          }
        }
        obs.observe({ entryTypes: ["longtask"] });
      });
      obs.observe({ entryTypes: ["longtask"] });
      this._observer = obs;
    });
  }
  dispose() {
    this._observer?.disconnect();
  }
  async _store(profile, sessionId) {
    const path = joinPath(this._environmentService.tmpDir, `renderer-${Math.random().toString(16).slice(2, 8)}.cpuprofile.json`);
    await this._fileService.writeFile(path, VSBuffer.fromString(JSON.stringify(profile)));
    this._logService.info(`[perf] stored profile to DISK '${path}'`, sessionId);
  }
};
RendererProfiling = __decorateClass([
  __decorateParam(0, INativeWorkbenchEnvironmentService),
  __decorateParam(1, IFileService),
  __decorateParam(2, ILogService),
  __decorateParam(3, INativeHostService),
  __decorateParam(4, ITimerService),
  __decorateParam(5, IConfigurationService),
  __decorateParam(6, IProfileAnalysisWorkerService)
], RendererProfiling);
export {
  RendererProfiling
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXHBlcmZvcm1hbmNlXFxlbGVjdHJvbi1icm93c2VyXFxyZW5kZXJlckF1dG9Qcm9maWxlci50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB7IHRpbWVvdXQgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9hc3luYy5qcyc7XG5pbXBvcnQgeyBWU0J1ZmZlciB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2J1ZmZlci5qcyc7XG5pbXBvcnQgeyBqb2luUGF0aCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3Jlc291cmNlcy5qcyc7XG5pbXBvcnQgeyBnZW5lcmF0ZVV1aWQgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi91dWlkLmpzJztcbmltcG9ydCB7IElDb25maWd1cmF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbmZpZ3VyYXRpb24vY29tbW9uL2NvbmZpZ3VyYXRpb24uanMnO1xuaW1wb3J0IHsgSUZpbGVTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vZmlsZXMvY29tbW9uL2ZpbGVzLmpzJztcbmltcG9ydCB7IElMb2dTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vbG9nL2NvbW1vbi9sb2cuanMnO1xuaW1wb3J0IHsgSU5hdGl2ZUhvc3RTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vbmF0aXZlL2NvbW1vbi9uYXRpdmUuanMnO1xuaW1wb3J0IHsgSVY4UHJvZmlsZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3Byb2ZpbGluZy9jb21tb24vcHJvZmlsaW5nLmpzJztcbmltcG9ydCB7IElQcm9maWxlQW5hbHlzaXNXb3JrZXJTZXJ2aWNlLCBQcm9maWxpbmdPdXRwdXQgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9wcm9maWxpbmcvZWxlY3Ryb24tYnJvd3Nlci9wcm9maWxlQW5hbHlzaXNXb3JrZXJTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElOYXRpdmVXb3JrYmVuY2hFbnZpcm9ubWVudFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9zZXJ2aWNlcy9lbnZpcm9ubWVudC9lbGVjdHJvbi1icm93c2VyL2Vudmlyb25tZW50U2VydmljZS5qcyc7XG5pbXBvcnQgeyBwYXJzZUV4dGVuc2lvbkRldk9wdGlvbnMgfSBmcm9tICcuLi8uLi8uLi9zZXJ2aWNlcy9leHRlbnNpb25zL2NvbW1vbi9leHRlbnNpb25EZXZPcHRpb25zLmpzJztcbmltcG9ydCB7IElUaW1lclNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9zZXJ2aWNlcy90aW1lci9icm93c2VyL3RpbWVyU2VydmljZS5qcyc7XG5cbmV4cG9ydCBjbGFzcyBSZW5kZXJlclByb2ZpbGluZyB7XG5cblx0cHJpdmF0ZSBfb2JzZXJ2ZXI/OiBQZXJmb3JtYW5jZU9ic2VydmVyO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdEBJTmF0aXZlV29ya2JlbmNoRW52aXJvbm1lbnRTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2Vudmlyb25tZW50U2VydmljZTogSU5hdGl2ZVdvcmtiZW5jaEVudmlyb25tZW50U2VydmljZSxcblx0XHRASUZpbGVTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2ZpbGVTZXJ2aWNlOiBJRmlsZVNlcnZpY2UsXG5cdFx0QElMb2dTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2xvZ1NlcnZpY2U6IElMb2dTZXJ2aWNlLFxuXHRcdEBJTmF0aXZlSG9zdFNlcnZpY2UgbmF0aXZlSG9zdFNlcnZpY2U6IElOYXRpdmVIb3N0U2VydmljZSxcblx0XHRASVRpbWVyU2VydmljZSB0aW1lclNlcnZpY2U6IElUaW1lclNlcnZpY2UsXG5cdFx0QElDb25maWd1cmF0aW9uU2VydmljZSBjb25maWdTZXJ2aWNlOiBJQ29uZmlndXJhdGlvblNlcnZpY2UsXG5cdFx0QElQcm9maWxlQW5hbHlzaXNXb3JrZXJTZXJ2aWNlIHByb2ZpbGVBbmFseXNpc1NlcnZpY2U6IElQcm9maWxlQW5hbHlzaXNXb3JrZXJTZXJ2aWNlXG5cdCkge1xuXG5cdFx0Y29uc3QgZGV2T3B0cyA9IHBhcnNlRXh0ZW5zaW9uRGV2T3B0aW9ucyhfZW52aXJvbm1lbnRTZXJ2aWNlKTtcblx0XHRpZiAoZGV2T3B0cy5pc0V4dGVuc2lvbkRldlRlc3RGcm9tQ2xpKSB7XG5cdFx0XHQvLyBkaXNhYmxlZCB3aGVuIHJ1bm5pbmcgZXh0ZW5zaW9uIHRlc3RzXG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0dGltZXJTZXJ2aWNlLnBlcmZCYXNlbGluZS50aGVuKHBlcmZCYXNlbGluZSA9PiB7XG5cdFx0XHQoX2Vudmlyb25tZW50U2VydmljZS5pc0J1aWx0ID8gX2xvZ1NlcnZpY2UuaW5mbyA6IF9sb2dTZXJ2aWNlLnRyYWNlKS5hcHBseShfbG9nU2VydmljZSwgW2BbcGVyZl0gUmVuZGVyIHBlcmZvcm1hbmNlIGJhc2VsaW5lIGlzICR7cGVyZkJhc2VsaW5lfW1zYF0pO1xuXG5cdFx0XHRpZiAocGVyZkJhc2VsaW5lIDwgMCkge1xuXHRcdFx0XHQvLyB0b28gc2xvd1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cblx0XHRcdC8vIFNMT1cgdGhyZXNob2xkXG5cdFx0XHRjb25zdCBzbG93VGhyZXNob2xkID0gcGVyZkJhc2VsaW5lICogMTA7IC8vIH4xMCBmcmFtZXMgYXQgNjRmcHMgb24gTVkgbWFjaGluZVxuXG5cdFx0XHRjb25zdCBvYnMgPSBuZXcgUGVyZm9ybWFuY2VPYnNlcnZlcihhc3luYyBsaXN0ID0+IHtcblxuXHRcdFx0XHRvYnMudGFrZVJlY29yZHMoKTtcblx0XHRcdFx0Y29uc3QgbWF4RHVyYXRpb24gPSBsaXN0LmdldEVudHJpZXMoKVxuXHRcdFx0XHRcdC5tYXAoZSA9PiBlLmR1cmF0aW9uKVxuXHRcdFx0XHRcdC5yZWR1Y2UoKHAsIGMpID0+IE1hdGgubWF4KHAsIGMpLCAwKTtcblxuXHRcdFx0XHRpZiAobWF4RHVyYXRpb24gPCBzbG93VGhyZXNob2xkKSB7XG5cdFx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0aWYgKCFjb25maWdTZXJ2aWNlLmdldFZhbHVlKCdhcHBsaWNhdGlvbi5leHBlcmltZW50YWwucmVuZGVyZXJQcm9maWxpbmcnKSkge1xuXHRcdFx0XHRcdF9sb2dTZXJ2aWNlLmRlYnVnKGBbcGVyZl0gU0xPVyB0YXNrIGRldGVjdGVkICgke21heER1cmF0aW9ufW1zKSBidXQgcmVuZGVyZXIgcHJvZmlsaW5nIGlzIGRpc2FibGVkIHZpYSAnYXBwbGljYXRpb24uZXhwZXJpbWVudGFsLnJlbmRlcmVyUHJvZmlsaW5nJ2ApO1xuXHRcdFx0XHRcdHJldHVybjtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdGNvbnN0IHNlc3Npb25JZCA9IGdlbmVyYXRlVXVpZCgpO1xuXG5cdFx0XHRcdF9sb2dTZXJ2aWNlLndhcm4oYFtwZXJmXSBSZW5kZXJlciByZXBvcnRlZCBWRVJZIExPTkcgVEFTSyAoJHttYXhEdXJhdGlvbn1tcyksIHN0YXJ0aW5nIHByb2ZpbGluZyBzZXNzaW9uICcke3Nlc3Npb25JZH0nYCk7XG5cblx0XHRcdFx0Ly8gcGF1c2Ugb2JzZXJ2YXRpb24sIHdlJ2xsIHRha2UgYSBkZXRhaWxlZCBsb29rXG5cdFx0XHRcdG9icy5kaXNjb25uZWN0KCk7XG5cblx0XHRcdFx0Ly8gcHJvZmlsZSByZW5kZXJlciBmb3IgNXNlY3MsIGFuYWx5c2UsIGFuZCB0YWtlIGFjdGlvbiBkZXBlbmRpbmcgb24gdGhlIHJlc3VsdFxuXHRcdFx0XHRmb3IgKGxldCBpID0gMDsgaSA8IDM7IGkrKykge1xuXG5cdFx0XHRcdFx0dHJ5IHtcblx0XHRcdFx0XHRcdGNvbnN0IHByb2ZpbGUgPSBhd2FpdCBuYXRpdmVIb3N0U2VydmljZS5wcm9maWxlUmVuZGVyZXIoc2Vzc2lvbklkLCA1MDAwKTtcblx0XHRcdFx0XHRcdGNvbnN0IG91dHB1dCA9IGF3YWl0IHByb2ZpbGVBbmFseXNpc1NlcnZpY2UuYW5hbHlzZUJvdHRvbVVwKHByb2ZpbGUsIF91cmwgPT4gJzw8cmVuZGVyZXI+PicsIHBlcmZCYXNlbGluZSwgdHJ1ZSk7XG5cdFx0XHRcdFx0XHRpZiAob3V0cHV0ID09PSBQcm9maWxpbmdPdXRwdXQuSW50ZXJlc3RpbmcpIHtcblx0XHRcdFx0XHRcdFx0dGhpcy5fc3RvcmUocHJvZmlsZSwgc2Vzc2lvbklkKTtcblx0XHRcdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdFx0XHR9XG5cblx0XHRcdFx0XHRcdHRpbWVvdXQoMTUwMDApOyAvLyB3YWl0IDE1c1xuXG5cdFx0XHRcdFx0fSBjYXRjaCAoZXJyKSB7XG5cdFx0XHRcdFx0XHRfbG9nU2VydmljZS5lcnJvcihlcnIpO1xuXHRcdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cblx0XHRcdFx0Ly8gcmVjb25uZWN0IHRoZSBvYnNlcnZlclxuXHRcdFx0XHRvYnMub2JzZXJ2ZSh7IGVudHJ5VHlwZXM6IFsnbG9uZ3Rhc2snXSB9KTtcblx0XHRcdH0pO1xuXG5cdFx0XHRvYnMub2JzZXJ2ZSh7IGVudHJ5VHlwZXM6IFsnbG9uZ3Rhc2snXSB9KTtcblx0XHRcdHRoaXMuX29ic2VydmVyID0gb2JzO1xuXG5cdFx0fSk7XG5cdH1cblxuXHRkaXNwb3NlKCk6IHZvaWQge1xuXHRcdHRoaXMuX29ic2VydmVyPy5kaXNjb25uZWN0KCk7XG5cdH1cblxuXG5cdHByaXZhdGUgYXN5bmMgX3N0b3JlKHByb2ZpbGU6IElWOFByb2ZpbGUsIHNlc3Npb25JZDogc3RyaW5nKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0Y29uc3QgcGF0aCA9IGpvaW5QYXRoKHRoaXMuX2Vudmlyb25tZW50U2VydmljZS50bXBEaXIsIGByZW5kZXJlci0ke01hdGgucmFuZG9tKCkudG9TdHJpbmcoMTYpLnNsaWNlKDIsIDgpfS5jcHVwcm9maWxlLmpzb25gKTtcblx0XHRhd2FpdCB0aGlzLl9maWxlU2VydmljZS53cml0ZUZpbGUocGF0aCwgVlNCdWZmZXIuZnJvbVN0cmluZyhKU09OLnN0cmluZ2lmeShwcm9maWxlKSkpO1xuXHRcdHRoaXMuX2xvZ1NlcnZpY2UuaW5mbyhgW3BlcmZdIHN0b3JlZCBwcm9maWxlIHRvIERJU0sgJyR7cGF0aH0nYCwgc2Vzc2lvbklkKTtcblx0fVxufVxuIl0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7Ozs7QUFLQSxTQUFTLGVBQWU7QUFDeEIsU0FBUyxnQkFBZ0I7QUFDekIsU0FBUyxnQkFBZ0I7QUFDekIsU0FBUyxvQkFBb0I7QUFDN0IsU0FBUyw2QkFBNkI7QUFDdEMsU0FBUyxvQkFBb0I7QUFDN0IsU0FBUyxtQkFBbUI7QUFDNUIsU0FBUywwQkFBMEI7QUFFbkMsU0FBUywrQkFBK0IsdUJBQXVCO0FBQy9ELFNBQVMsMENBQTBDO0FBQ25ELFNBQVMsZ0NBQWdDO0FBQ3pDLFNBQVMscUJBQXFCO0FBRXZCLElBQU0sb0JBQU4sTUFBd0I7QUFBQSxFQUk5QixZQUNzRCxxQkFDdEIsY0FDRCxhQUNWLG1CQUNMLGNBQ1EsZUFDUSx3QkFDOUI7QUFQb0Q7QUFDdEI7QUFDRDtBQU85QixVQUFNLFVBQVUseUJBQXlCLG1CQUFtQjtBQUM1RCxRQUFJLFFBQVEsMkJBQTJCO0FBRXRDO0FBQUEsSUFDRDtBQUVBLGlCQUFhLGFBQWEsS0FBSyxrQkFBZ0I7QUFDOUMsT0FBQyxvQkFBb0IsVUFBVSxZQUFZLE9BQU8sWUFBWSxPQUFPLE1BQU0sYUFBYSxDQUFDLHlDQUF5QyxZQUFZLElBQUksQ0FBQztBQUVuSixVQUFJLGVBQWUsR0FBRztBQUVyQjtBQUFBLE1BQ0Q7QUFHQSxZQUFNLGdCQUFnQixlQUFlO0FBRXJDLFlBQU0sTUFBTSxJQUFJLG9CQUFvQixPQUFNLFNBQVE7QUFFakQsWUFBSSxZQUFZO0FBQ2hCLGNBQU0sY0FBYyxLQUFLLFdBQVcsRUFDbEMsSUFBSSxPQUFLLEVBQUUsUUFBUSxFQUNuQixPQUFPLENBQUMsR0FBRyxNQUFNLEtBQUssSUFBSSxHQUFHLENBQUMsR0FBRyxDQUFDO0FBRXBDLFlBQUksY0FBYyxlQUFlO0FBQ2hDO0FBQUEsUUFDRDtBQUVBLFlBQUksQ0FBQyxjQUFjLFNBQVMsNENBQTRDLEdBQUc7QUFDMUUsc0JBQVksTUFBTSw4QkFBOEIsV0FBVyx5RkFBeUY7QUFDcEo7QUFBQSxRQUNEO0FBRUEsY0FBTSxZQUFZLGFBQWE7QUFFL0Isb0JBQVksS0FBSyw0Q0FBNEMsV0FBVyxvQ0FBb0MsU0FBUyxHQUFHO0FBR3hILFlBQUksV0FBVztBQUdmLGlCQUFTLElBQUksR0FBRyxJQUFJLEdBQUcsS0FBSztBQUUzQixjQUFJO0FBQ0gsa0JBQU0sVUFBVSxNQUFNLGtCQUFrQixnQkFBZ0IsV0FBVyxHQUFJO0FBQ3ZFLGtCQUFNLFNBQVMsTUFBTSx1QkFBdUIsZ0JBQWdCLFNBQVMsVUFBUSxnQkFBZ0IsY0FBYyxJQUFJO0FBQy9HLGdCQUFJLFdBQVcsZ0JBQWdCLGFBQWE7QUFDM0MsbUJBQUssT0FBTyxTQUFTLFNBQVM7QUFDOUI7QUFBQSxZQUNEO0FBRUEsb0JBQVEsSUFBSztBQUFBLFVBRWQsU0FBUyxLQUFLO0FBQ2Isd0JBQVksTUFBTSxHQUFHO0FBQ3JCO0FBQUEsVUFDRDtBQUFBLFFBQ0Q7QUFHQSxZQUFJLFFBQVEsRUFBRSxZQUFZLENBQUMsVUFBVSxFQUFFLENBQUM7QUFBQSxNQUN6QyxDQUFDO0FBRUQsVUFBSSxRQUFRLEVBQUUsWUFBWSxDQUFDLFVBQVUsRUFBRSxDQUFDO0FBQ3hDLFdBQUssWUFBWTtBQUFBLElBRWxCLENBQUM7QUFBQSxFQUNGO0FBQUEsRUFFQSxVQUFnQjtBQUNmLFNBQUssV0FBVyxXQUFXO0FBQUEsRUFDNUI7QUFBQSxFQUdBLE1BQWMsT0FBTyxTQUFxQixXQUFrQztBQUMzRSxVQUFNLE9BQU8sU0FBUyxLQUFLLG9CQUFvQixRQUFRLFlBQVksS0FBSyxPQUFPLEVBQUUsU0FBUyxFQUFFLEVBQUUsTUFBTSxHQUFHLENBQUMsQ0FBQyxrQkFBa0I7QUFDM0gsVUFBTSxLQUFLLGFBQWEsVUFBVSxNQUFNLFNBQVMsV0FBVyxLQUFLLFVBQVUsT0FBTyxDQUFDLENBQUM7QUFDcEYsU0FBSyxZQUFZLEtBQUssa0NBQWtDLElBQUksS0FBSyxTQUFTO0FBQUEsRUFDM0U7QUFDRDtBQTdGYSxvQkFBTjtBQUFBLEVBS0o7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxHQVhVOyIsCiAgIm5hbWVzIjogW10KfQo=
