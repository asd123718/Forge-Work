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
import { spawn } from "child_process";
import { relative } from "../../../base/common/path.js";
import { FileAccess } from "../../../base/common/network.js";
import { rgDiskPath } from "../../../base/node/ripgrep.js";
import { StopWatch } from "../../../base/common/stopwatch.js";
import { IEnvironmentService } from "../../environment/common/environment.js";
import { createDecorator } from "../../instantiation/common/instantiation.js";
import { ILogService } from "../../log/common/log.js";
const ICSSDevelopmentService = createDecorator("ICSSDevelopmentService");
let CSSDevelopmentService = class {
  constructor(envService, logService) {
    this.envService = envService;
    this.logService = logService;
  }
  get isEnabled() {
    return !this.envService.isBuilt;
  }
  getCssModules() {
    this._cssModules ??= this.computeCssModules();
    return this._cssModules;
  }
  async computeCssModules() {
    if (!this.isEnabled) {
      return [];
    }
    const rgBinPath = await rgDiskPath();
    return await new Promise((resolve) => {
      const sw = StopWatch.create();
      const chunks = [];
      const basePath = FileAccess.asFileUri("").fsPath;
      const process = spawn(rgBinPath, ["-g", "**/*.css", "--files", "--no-ignore", basePath], {});
      process.stdout.on("data", (data) => {
        chunks.push(data);
      });
      process.on("error", (err) => {
        this.logService.error("[CSS_DEV] FAILED to compute CSS data", err);
        resolve([]);
      });
      process.on("close", () => {
        const data = Buffer.concat(chunks).toString("utf8");
        const result = data.split("\n").filter(Boolean).map((path) => relative(basePath, path).replace(/\\/g, "/")).filter(Boolean).sort();
        if (result.some((path) => path.indexOf("vs/") !== 0)) {
          this.logService.error(`[CSS_DEV] Detected invalid paths in css modules, raw output: ${data}`);
        }
        resolve(result);
        this.logService.info(`[CSS_DEV] DONE, ${result.length} css modules (${Math.round(sw.elapsed())}ms)`);
      });
    });
  }
};
CSSDevelopmentService = __decorateClass([
  __decorateParam(0, IEnvironmentService),
  __decorateParam(1, ILogService)
], CSSDevelopmentService);
export {
  CSSDevelopmentService,
  ICSSDevelopmentService
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxwbGF0Zm9ybVxcY3NzRGV2XFxub2RlXFxjc3NEZXZTZXJ2aWNlLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IHsgc3Bhd24gfSBmcm9tICdjaGlsZF9wcm9jZXNzJztcbmltcG9ydCB7IHJlbGF0aXZlIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vcGF0aC5qcyc7XG5pbXBvcnQgeyBGaWxlQWNjZXNzIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vbmV0d29yay5qcyc7XG5pbXBvcnQgeyByZ0Rpc2tQYXRoIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9ub2RlL3JpcGdyZXAuanMnO1xuaW1wb3J0IHsgU3RvcFdhdGNoIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vc3RvcHdhdGNoLmpzJztcbmltcG9ydCB7IElFbnZpcm9ubWVudFNlcnZpY2UgfSBmcm9tICcuLi8uLi9lbnZpcm9ubWVudC9jb21tb24vZW52aXJvbm1lbnQuanMnO1xuaW1wb3J0IHsgY3JlYXRlRGVjb3JhdG9yIH0gZnJvbSAnLi4vLi4vaW5zdGFudGlhdGlvbi9jb21tb24vaW5zdGFudGlhdGlvbi5qcyc7XG5pbXBvcnQgeyBJTG9nU2VydmljZSB9IGZyb20gJy4uLy4uL2xvZy9jb21tb24vbG9nLmpzJztcblxuZXhwb3J0IGNvbnN0IElDU1NEZXZlbG9wbWVudFNlcnZpY2UgPSBjcmVhdGVEZWNvcmF0b3I8SUNTU0RldmVsb3BtZW50U2VydmljZT4oJ0lDU1NEZXZlbG9wbWVudFNlcnZpY2UnKTtcblxuZXhwb3J0IGludGVyZmFjZSBJQ1NTRGV2ZWxvcG1lbnRTZXJ2aWNlIHtcblx0X3NlcnZpY2VCcmFuZDogdW5kZWZpbmVkO1xuXHRpc0VuYWJsZWQ6IGJvb2xlYW47XG5cdGdldENzc01vZHVsZXMoKTogUHJvbWlzZTxzdHJpbmdbXT47XG59XG5cbmV4cG9ydCBjbGFzcyBDU1NEZXZlbG9wbWVudFNlcnZpY2UgaW1wbGVtZW50cyBJQ1NTRGV2ZWxvcG1lbnRTZXJ2aWNlIHtcblxuXHRkZWNsYXJlIF9zZXJ2aWNlQnJhbmQ6IHVuZGVmaW5lZDtcblxuXHRwcml2YXRlIF9jc3NNb2R1bGVzPzogUHJvbWlzZTxzdHJpbmdbXT47XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0QElFbnZpcm9ubWVudFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBlbnZTZXJ2aWNlOiBJRW52aXJvbm1lbnRTZXJ2aWNlLFxuXHRcdEBJTG9nU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGxvZ1NlcnZpY2U6IElMb2dTZXJ2aWNlXG5cdCkgeyB9XG5cblx0Z2V0IGlzRW5hYmxlZCgpOiBib29sZWFuIHtcblx0XHRyZXR1cm4gIXRoaXMuZW52U2VydmljZS5pc0J1aWx0O1xuXHR9XG5cblx0Z2V0Q3NzTW9kdWxlcygpOiBQcm9taXNlPHN0cmluZ1tdPiB7XG5cdFx0dGhpcy5fY3NzTW9kdWxlcyA/Pz0gdGhpcy5jb21wdXRlQ3NzTW9kdWxlcygpO1xuXHRcdHJldHVybiB0aGlzLl9jc3NNb2R1bGVzO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBjb21wdXRlQ3NzTW9kdWxlcygpOiBQcm9taXNlPHN0cmluZ1tdPiB7XG5cdFx0aWYgKCF0aGlzLmlzRW5hYmxlZCkge1xuXHRcdFx0cmV0dXJuIFtdO1xuXHRcdH1cblxuXHRcdGNvbnN0IHJnQmluUGF0aCA9IGF3YWl0IHJnRGlza1BhdGgoKTtcblx0XHRyZXR1cm4gYXdhaXQgbmV3IFByb21pc2U8c3RyaW5nW10+KChyZXNvbHZlKSA9PiB7XG5cblx0XHRcdGNvbnN0IHN3ID0gU3RvcFdhdGNoLmNyZWF0ZSgpO1xuXG5cdFx0XHRjb25zdCBjaHVua3M6IEJ1ZmZlcltdID0gW107XG5cdFx0XHRjb25zdCBiYXNlUGF0aCA9IEZpbGVBY2Nlc3MuYXNGaWxlVXJpKCcnKS5mc1BhdGg7XG5cdFx0XHRjb25zdCBwcm9jZXNzID0gc3Bhd24ocmdCaW5QYXRoLCBbJy1nJywgJyoqLyouY3NzJywgJy0tZmlsZXMnLCAnLS1uby1pZ25vcmUnLCBiYXNlUGF0aF0sIHt9KTtcblxuXHRcdFx0cHJvY2Vzcy5zdGRvdXQub24oJ2RhdGEnLCBkYXRhID0+IHtcblx0XHRcdFx0Y2h1bmtzLnB1c2goZGF0YSk7XG5cdFx0XHR9KTtcblx0XHRcdHByb2Nlc3Mub24oJ2Vycm9yJywgZXJyID0+IHtcblx0XHRcdFx0dGhpcy5sb2dTZXJ2aWNlLmVycm9yKCdbQ1NTX0RFVl0gRkFJTEVEIHRvIGNvbXB1dGUgQ1NTIGRhdGEnLCBlcnIpO1xuXHRcdFx0XHRyZXNvbHZlKFtdKTtcblx0XHRcdH0pO1xuXHRcdFx0cHJvY2Vzcy5vbignY2xvc2UnLCAoKSA9PiB7XG5cdFx0XHRcdGNvbnN0IGRhdGEgPSBCdWZmZXIuY29uY2F0KGNodW5rcykudG9TdHJpbmcoJ3V0ZjgnKTtcblx0XHRcdFx0Y29uc3QgcmVzdWx0ID0gZGF0YS5zcGxpdCgnXFxuJykuZmlsdGVyKEJvb2xlYW4pLm1hcChwYXRoID0+IHJlbGF0aXZlKGJhc2VQYXRoLCBwYXRoKS5yZXBsYWNlKC9cXFxcL2csICcvJykpLmZpbHRlcihCb29sZWFuKS5zb3J0KCk7XG5cdFx0XHRcdGlmIChyZXN1bHQuc29tZShwYXRoID0+IHBhdGguaW5kZXhPZigndnMvJykgIT09IDApKSB7XG5cdFx0XHRcdFx0dGhpcy5sb2dTZXJ2aWNlLmVycm9yKGBbQ1NTX0RFVl0gRGV0ZWN0ZWQgaW52YWxpZCBwYXRocyBpbiBjc3MgbW9kdWxlcywgcmF3IG91dHB1dDogJHtkYXRhfWApO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHJlc29sdmUocmVzdWx0KTtcblx0XHRcdFx0dGhpcy5sb2dTZXJ2aWNlLmluZm8oYFtDU1NfREVWXSBET05FLCAke3Jlc3VsdC5sZW5ndGh9IGNzcyBtb2R1bGVzICgke01hdGgucm91bmQoc3cuZWxhcHNlZCgpKX1tcylgKTtcblx0XHRcdH0pO1xuXHRcdH0pO1xuXHR9XG59XG4iXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7OztBQUtBLFNBQVMsYUFBYTtBQUN0QixTQUFTLGdCQUFnQjtBQUN6QixTQUFTLGtCQUFrQjtBQUMzQixTQUFTLGtCQUFrQjtBQUMzQixTQUFTLGlCQUFpQjtBQUMxQixTQUFTLDJCQUEyQjtBQUNwQyxTQUFTLHVCQUF1QjtBQUNoQyxTQUFTLG1CQUFtQjtBQUVyQixNQUFNLHlCQUF5QixnQkFBd0Msd0JBQXdCO0FBUS9GLElBQU0sd0JBQU4sTUFBOEQ7QUFBQSxFQU1wRSxZQUN1QyxZQUNSLFlBQzdCO0FBRnFDO0FBQ1I7QUFBQSxFQUMzQjtBQUFBLEVBRUosSUFBSSxZQUFxQjtBQUN4QixXQUFPLENBQUMsS0FBSyxXQUFXO0FBQUEsRUFDekI7QUFBQSxFQUVBLGdCQUFtQztBQUNsQyxTQUFLLGdCQUFnQixLQUFLLGtCQUFrQjtBQUM1QyxXQUFPLEtBQUs7QUFBQSxFQUNiO0FBQUEsRUFFQSxNQUFjLG9CQUF1QztBQUNwRCxRQUFJLENBQUMsS0FBSyxXQUFXO0FBQ3BCLGFBQU8sQ0FBQztBQUFBLElBQ1Q7QUFFQSxVQUFNLFlBQVksTUFBTSxXQUFXO0FBQ25DLFdBQU8sTUFBTSxJQUFJLFFBQWtCLENBQUMsWUFBWTtBQUUvQyxZQUFNLEtBQUssVUFBVSxPQUFPO0FBRTVCLFlBQU0sU0FBbUIsQ0FBQztBQUMxQixZQUFNLFdBQVcsV0FBVyxVQUFVLEVBQUUsRUFBRTtBQUMxQyxZQUFNLFVBQVUsTUFBTSxXQUFXLENBQUMsTUFBTSxZQUFZLFdBQVcsZUFBZSxRQUFRLEdBQUcsQ0FBQyxDQUFDO0FBRTNGLGNBQVEsT0FBTyxHQUFHLFFBQVEsVUFBUTtBQUNqQyxlQUFPLEtBQUssSUFBSTtBQUFBLE1BQ2pCLENBQUM7QUFDRCxjQUFRLEdBQUcsU0FBUyxTQUFPO0FBQzFCLGFBQUssV0FBVyxNQUFNLHdDQUF3QyxHQUFHO0FBQ2pFLGdCQUFRLENBQUMsQ0FBQztBQUFBLE1BQ1gsQ0FBQztBQUNELGNBQVEsR0FBRyxTQUFTLE1BQU07QUFDekIsY0FBTSxPQUFPLE9BQU8sT0FBTyxNQUFNLEVBQUUsU0FBUyxNQUFNO0FBQ2xELGNBQU0sU0FBUyxLQUFLLE1BQU0sSUFBSSxFQUFFLE9BQU8sT0FBTyxFQUFFLElBQUksVUFBUSxTQUFTLFVBQVUsSUFBSSxFQUFFLFFBQVEsT0FBTyxHQUFHLENBQUMsRUFBRSxPQUFPLE9BQU8sRUFBRSxLQUFLO0FBQy9ILFlBQUksT0FBTyxLQUFLLFVBQVEsS0FBSyxRQUFRLEtBQUssTUFBTSxDQUFDLEdBQUc7QUFDbkQsZUFBSyxXQUFXLE1BQU0sZ0VBQWdFLElBQUksRUFBRTtBQUFBLFFBQzdGO0FBQ0EsZ0JBQVEsTUFBTTtBQUNkLGFBQUssV0FBVyxLQUFLLG1CQUFtQixPQUFPLE1BQU0saUJBQWlCLEtBQUssTUFBTSxHQUFHLFFBQVEsQ0FBQyxDQUFDLEtBQUs7QUFBQSxNQUNwRyxDQUFDO0FBQUEsSUFDRixDQUFDO0FBQUEsRUFDRjtBQUNEO0FBcERhLHdCQUFOO0FBQUEsRUFPSjtBQUFBLEVBQ0E7QUFBQSxHQVJVOyIsCiAgIm5hbWVzIjogW10KfQo=
