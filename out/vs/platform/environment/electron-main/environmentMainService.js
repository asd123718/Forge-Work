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
import { memoize } from "../../../base/common/decorators.js";
import { join } from "../../../base/common/path.js";
import { isLinux } from "../../../base/common/platform.js";
import { createStaticIPCHandle } from "../../../base/parts/ipc/node/ipc.net.js";
import { IEnvironmentService } from "../common/environment.js";
import { NativeEnvironmentService } from "../node/environmentService.js";
import { refineServiceDecorator } from "../../instantiation/common/instantiation.js";
const IEnvironmentMainService = refineServiceDecorator(IEnvironmentService);
class EnvironmentMainService extends NativeEnvironmentService {
  constructor() {
    super(...arguments);
    this._snapEnv = {};
  }
  get backupHome() {
    return join(this.userDataPath, "Backups");
  }
  get mainIPCHandle() {
    return createStaticIPCHandle(this.userDataPath, "main", this.productService.version);
  }
  get mainLockfile() {
    return join(this.userDataPath, "code.lock");
  }
  get disableUpdates() {
    return !!this.args["disable-updates"];
  }
  get isPortable() {
    return !!process.env["VSCODE_PORTABLE"];
  }
  get crossOriginIsolated() {
    return !!this.args["enable-coi"];
  }
  get enableRDPDisplayTracking() {
    return !!this.args["enable-rdp-display-tracking"];
  }
  get codeCachePath() {
    return process.env["VSCODE_CODE_CACHE_PATH"] || void 0;
  }
  get useCodeCache() {
    return !!this.codeCachePath;
  }
  unsetSnapExportedVariables() {
    if (!isLinux) {
      return;
    }
    for (const key in process.env) {
      if (key.endsWith("_VSCODE_SNAP_ORIG")) {
        const originalKey = key.slice(0, -17);
        if (this._snapEnv[originalKey]) {
          continue;
        }
        if (process.env[originalKey]) {
          this._snapEnv[originalKey] = process.env[originalKey];
        }
        if (process.env[key]) {
          process.env[originalKey] = process.env[key];
        } else {
          delete process.env[originalKey];
        }
      }
    }
  }
  restoreSnapExportedVariables() {
    if (!isLinux) {
      return;
    }
    for (const key in this._snapEnv) {
      process.env[key] = this._snapEnv[key];
      delete this._snapEnv[key];
    }
  }
}
__decorateClass([
  memoize
], EnvironmentMainService.prototype, "backupHome", 1);
__decorateClass([
  memoize
], EnvironmentMainService.prototype, "mainIPCHandle", 1);
__decorateClass([
  memoize
], EnvironmentMainService.prototype, "mainLockfile", 1);
__decorateClass([
  memoize
], EnvironmentMainService.prototype, "disableUpdates", 1);
__decorateClass([
  memoize
], EnvironmentMainService.prototype, "isPortable", 1);
__decorateClass([
  memoize
], EnvironmentMainService.prototype, "crossOriginIsolated", 1);
__decorateClass([
  memoize
], EnvironmentMainService.prototype, "enableRDPDisplayTracking", 1);
__decorateClass([
  memoize
], EnvironmentMainService.prototype, "codeCachePath", 1);
__decorateClass([
  memoize
], EnvironmentMainService.prototype, "useCodeCache", 1);
export {
  EnvironmentMainService,
  IEnvironmentMainService
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxwbGF0Zm9ybVxcZW52aXJvbm1lbnRcXGVsZWN0cm9uLW1haW5cXGVudmlyb25tZW50TWFpblNlcnZpY2UudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgeyBtZW1vaXplIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vZGVjb3JhdG9ycy5qcyc7XG5pbXBvcnQgeyBqb2luIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vcGF0aC5qcyc7XG5pbXBvcnQgeyBpc0xpbnV4IH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9jb21tb24vcGxhdGZvcm0uanMnO1xuaW1wb3J0IHsgY3JlYXRlU3RhdGljSVBDSGFuZGxlIH0gZnJvbSAnLi4vLi4vLi4vYmFzZS9wYXJ0cy9pcGMvbm9kZS9pcGMubmV0LmpzJztcbmltcG9ydCB7IElFbnZpcm9ubWVudFNlcnZpY2UsIElOYXRpdmVFbnZpcm9ubWVudFNlcnZpY2UgfSBmcm9tICcuLi9jb21tb24vZW52aXJvbm1lbnQuanMnO1xuaW1wb3J0IHsgTmF0aXZlRW52aXJvbm1lbnRTZXJ2aWNlIH0gZnJvbSAnLi4vbm9kZS9lbnZpcm9ubWVudFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgcmVmaW5lU2VydmljZURlY29yYXRvciB9IGZyb20gJy4uLy4uL2luc3RhbnRpYXRpb24vY29tbW9uL2luc3RhbnRpYXRpb24uanMnO1xuXG5leHBvcnQgY29uc3QgSUVudmlyb25tZW50TWFpblNlcnZpY2UgPSByZWZpbmVTZXJ2aWNlRGVjb3JhdG9yPElFbnZpcm9ubWVudFNlcnZpY2UsIElFbnZpcm9ubWVudE1haW5TZXJ2aWNlPihJRW52aXJvbm1lbnRTZXJ2aWNlKTtcblxuLyoqXG4gKiBBIHN1YmNsYXNzIG9mIHRoZSBgSU5hdGl2ZUVudmlyb25tZW50U2VydmljZWAgdG8gYmUgdXNlZCBvbmx5IGluIGVsZWN0cm9uLW1haW5cbiAqIGVudmlyb25tZW50cy5cbiAqL1xuZXhwb3J0IGludGVyZmFjZSBJRW52aXJvbm1lbnRNYWluU2VydmljZSBleHRlbmRzIElOYXRpdmVFbnZpcm9ubWVudFNlcnZpY2Uge1xuXG5cdC8vIC0tLSBiYWNrdXAgcGF0aHNcblx0cmVhZG9ubHkgYmFja3VwSG9tZTogc3RyaW5nO1xuXG5cdC8vIC0tLSBWOCBjb2RlIGNhY2hpbmdcblx0cmVhZG9ubHkgY29kZUNhY2hlUGF0aDogc3RyaW5nIHwgdW5kZWZpbmVkO1xuXHRyZWFkb25seSB1c2VDb2RlQ2FjaGU6IGJvb2xlYW47XG5cblx0Ly8gLS0tIElQQ1xuXHRyZWFkb25seSBtYWluSVBDSGFuZGxlOiBzdHJpbmc7XG5cdHJlYWRvbmx5IG1haW5Mb2NrZmlsZTogc3RyaW5nO1xuXG5cdC8vIC0tLSBjb25maWdcblx0cmVhZG9ubHkgZGlzYWJsZVVwZGF0ZXM6IGJvb2xlYW47XG5cdHJlYWRvbmx5IGlzUG9ydGFibGU6IGJvb2xlYW47XG5cblx0Ly8gVE9ET0BkZWVwYWsxNTU2IHRlbXBvcmFyeSB1bnRpbCBhIHJlYWwgZml4IGxhbmRzIHVwc3RyZWFtXG5cdHJlYWRvbmx5IGVuYWJsZVJEUERpc3BsYXlUcmFja2luZzogYm9vbGVhbjtcblxuXHR1bnNldFNuYXBFeHBvcnRlZFZhcmlhYmxlcygpOiB2b2lkO1xuXHRyZXN0b3JlU25hcEV4cG9ydGVkVmFyaWFibGVzKCk6IHZvaWQ7XG59XG5cbmV4cG9ydCBjbGFzcyBFbnZpcm9ubWVudE1haW5TZXJ2aWNlIGV4dGVuZHMgTmF0aXZlRW52aXJvbm1lbnRTZXJ2aWNlIGltcGxlbWVudHMgSUVudmlyb25tZW50TWFpblNlcnZpY2Uge1xuXG5cdHByaXZhdGUgX3NuYXBFbnY6IFJlY29yZDxzdHJpbmcsIHN0cmluZz4gPSB7fTtcblxuXHRAbWVtb2l6ZVxuXHRnZXQgYmFja3VwSG9tZSgpOiBzdHJpbmcgeyByZXR1cm4gam9pbih0aGlzLnVzZXJEYXRhUGF0aCwgJ0JhY2t1cHMnKTsgfVxuXG5cdEBtZW1vaXplXG5cdGdldCBtYWluSVBDSGFuZGxlKCk6IHN0cmluZyB7IHJldHVybiBjcmVhdGVTdGF0aWNJUENIYW5kbGUodGhpcy51c2VyRGF0YVBhdGgsICdtYWluJywgdGhpcy5wcm9kdWN0U2VydmljZS52ZXJzaW9uKTsgfVxuXG5cdEBtZW1vaXplXG5cdGdldCBtYWluTG9ja2ZpbGUoKTogc3RyaW5nIHsgcmV0dXJuIGpvaW4odGhpcy51c2VyRGF0YVBhdGgsICdjb2RlLmxvY2snKTsgfVxuXG5cdEBtZW1vaXplXG5cdGdldCBkaXNhYmxlVXBkYXRlcygpOiBib29sZWFuIHsgcmV0dXJuICEhdGhpcy5hcmdzWydkaXNhYmxlLXVwZGF0ZXMnXTsgfVxuXG5cdEBtZW1vaXplXG5cdGdldCBpc1BvcnRhYmxlKCk6IGJvb2xlYW4geyByZXR1cm4gISFwcm9jZXNzLmVudlsnVlNDT0RFX1BPUlRBQkxFJ107IH1cblxuXHRAbWVtb2l6ZVxuXHRnZXQgY3Jvc3NPcmlnaW5Jc29sYXRlZCgpOiBib29sZWFuIHsgcmV0dXJuICEhdGhpcy5hcmdzWydlbmFibGUtY29pJ107IH1cblxuXHRAbWVtb2l6ZVxuXHRnZXQgZW5hYmxlUkRQRGlzcGxheVRyYWNraW5nKCk6IGJvb2xlYW4geyByZXR1cm4gISF0aGlzLmFyZ3NbJ2VuYWJsZS1yZHAtZGlzcGxheS10cmFja2luZyddOyB9XG5cblx0QG1lbW9pemVcblx0Z2V0IGNvZGVDYWNoZVBhdGgoKTogc3RyaW5nIHwgdW5kZWZpbmVkIHsgcmV0dXJuIHByb2Nlc3MuZW52WydWU0NPREVfQ09ERV9DQUNIRV9QQVRIJ10gfHwgdW5kZWZpbmVkOyB9XG5cblx0QG1lbW9pemVcblx0Z2V0IHVzZUNvZGVDYWNoZSgpOiBib29sZWFuIHsgcmV0dXJuICEhdGhpcy5jb2RlQ2FjaGVQYXRoOyB9XG5cblx0dW5zZXRTbmFwRXhwb3J0ZWRWYXJpYWJsZXMoKSB7XG5cdFx0aWYgKCFpc0xpbnV4KSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGZvciAoY29uc3Qga2V5IGluIHByb2Nlc3MuZW52KSB7XG5cdFx0XHRpZiAoa2V5LmVuZHNXaXRoKCdfVlNDT0RFX1NOQVBfT1JJRycpKSB7XG5cdFx0XHRcdGNvbnN0IG9yaWdpbmFsS2V5ID0ga2V5LnNsaWNlKDAsIC0xNyk7IC8vIFJlbW92ZSB0aGUgX1ZTQ09ERV9TTkFQX09SSUcgc3VmZml4XG5cdFx0XHRcdGlmICh0aGlzLl9zbmFwRW52W29yaWdpbmFsS2V5XSkge1xuXHRcdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0XHR9XG5cdFx0XHRcdC8vIFByZXNlcnZlIHRoZSBvcmlnaW5hbCB2YWx1ZSBpbiBjYXNlIHRoZSBzbmFwIGVudiBpcyByZS1lbnRlcmVkXG5cdFx0XHRcdGlmIChwcm9jZXNzLmVudltvcmlnaW5hbEtleV0pIHtcblx0XHRcdFx0XHR0aGlzLl9zbmFwRW52W29yaWdpbmFsS2V5XSA9IHByb2Nlc3MuZW52W29yaWdpbmFsS2V5XSE7XG5cdFx0XHRcdH1cblx0XHRcdFx0Ly8gQ29weSB0aGUgb3JpZ2luYWwgdmFsdWUgZnJvbSBiZWZvcmUgZW50ZXJpbmcgdGhlIHNuYXAgZW52IGlmIGF2YWlsYWJsZSxcblx0XHRcdFx0Ly8gaWYgbm90IGRlbGV0ZSB0aGUgZW52IHZhcmlhYmxlLlxuXHRcdFx0XHRpZiAocHJvY2Vzcy5lbnZba2V5XSkge1xuXHRcdFx0XHRcdHByb2Nlc3MuZW52W29yaWdpbmFsS2V5XSA9IHByb2Nlc3MuZW52W2tleV07XG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0ZGVsZXRlIHByb2Nlc3MuZW52W29yaWdpbmFsS2V5XTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblx0fVxuXG5cdHJlc3RvcmVTbmFwRXhwb3J0ZWRWYXJpYWJsZXMoKSB7XG5cdFx0aWYgKCFpc0xpbnV4KSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGZvciAoY29uc3Qga2V5IGluIHRoaXMuX3NuYXBFbnYpIHtcblx0XHRcdHByb2Nlc3MuZW52W2tleV0gPSB0aGlzLl9zbmFwRW52W2tleV07XG5cdFx0XHRkZWxldGUgdGhpcy5fc25hcEVudltrZXldO1xuXHRcdH1cblx0fVxufVxuIl0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7OztBQUtBLFNBQVMsZUFBZTtBQUN4QixTQUFTLFlBQVk7QUFDckIsU0FBUyxlQUFlO0FBQ3hCLFNBQVMsNkJBQTZCO0FBQ3RDLFNBQVMsMkJBQXNEO0FBQy9ELFNBQVMsZ0NBQWdDO0FBQ3pDLFNBQVMsOEJBQThCO0FBRWhDLE1BQU0sMEJBQTBCLHVCQUFxRSxtQkFBbUI7QUE4QnhILE1BQU0sK0JBQStCLHlCQUE0RDtBQUFBLEVBQWpHO0FBQUE7QUFFTixTQUFRLFdBQW1DLENBQUM7QUFBQTtBQUFBLEVBRzVDLElBQUksYUFBcUI7QUFBRSxXQUFPLEtBQUssS0FBSyxjQUFjLFNBQVM7QUFBQSxFQUFHO0FBQUEsRUFHdEUsSUFBSSxnQkFBd0I7QUFBRSxXQUFPLHNCQUFzQixLQUFLLGNBQWMsUUFBUSxLQUFLLGVBQWUsT0FBTztBQUFBLEVBQUc7QUFBQSxFQUdwSCxJQUFJLGVBQXVCO0FBQUUsV0FBTyxLQUFLLEtBQUssY0FBYyxXQUFXO0FBQUEsRUFBRztBQUFBLEVBRzFFLElBQUksaUJBQTBCO0FBQUUsV0FBTyxDQUFDLENBQUMsS0FBSyxLQUFLLGlCQUFpQjtBQUFBLEVBQUc7QUFBQSxFQUd2RSxJQUFJLGFBQXNCO0FBQUUsV0FBTyxDQUFDLENBQUMsUUFBUSxJQUFJLGlCQUFpQjtBQUFBLEVBQUc7QUFBQSxFQUdyRSxJQUFJLHNCQUErQjtBQUFFLFdBQU8sQ0FBQyxDQUFDLEtBQUssS0FBSyxZQUFZO0FBQUEsRUFBRztBQUFBLEVBR3ZFLElBQUksMkJBQW9DO0FBQUUsV0FBTyxDQUFDLENBQUMsS0FBSyxLQUFLLDZCQUE2QjtBQUFBLEVBQUc7QUFBQSxFQUc3RixJQUFJLGdCQUFvQztBQUFFLFdBQU8sUUFBUSxJQUFJLHdCQUF3QixLQUFLO0FBQUEsRUFBVztBQUFBLEVBR3JHLElBQUksZUFBd0I7QUFBRSxXQUFPLENBQUMsQ0FBQyxLQUFLO0FBQUEsRUFBZTtBQUFBLEVBRTNELDZCQUE2QjtBQUM1QixRQUFJLENBQUMsU0FBUztBQUNiO0FBQUEsSUFDRDtBQUNBLGVBQVcsT0FBTyxRQUFRLEtBQUs7QUFDOUIsVUFBSSxJQUFJLFNBQVMsbUJBQW1CLEdBQUc7QUFDdEMsY0FBTSxjQUFjLElBQUksTUFBTSxHQUFHLEdBQUc7QUFDcEMsWUFBSSxLQUFLLFNBQVMsV0FBVyxHQUFHO0FBQy9CO0FBQUEsUUFDRDtBQUVBLFlBQUksUUFBUSxJQUFJLFdBQVcsR0FBRztBQUM3QixlQUFLLFNBQVMsV0FBVyxJQUFJLFFBQVEsSUFBSSxXQUFXO0FBQUEsUUFDckQ7QUFHQSxZQUFJLFFBQVEsSUFBSSxHQUFHLEdBQUc7QUFDckIsa0JBQVEsSUFBSSxXQUFXLElBQUksUUFBUSxJQUFJLEdBQUc7QUFBQSxRQUMzQyxPQUFPO0FBQ04saUJBQU8sUUFBUSxJQUFJLFdBQVc7QUFBQSxRQUMvQjtBQUFBLE1BQ0Q7QUFBQSxJQUNEO0FBQUEsRUFDRDtBQUFBLEVBRUEsK0JBQStCO0FBQzlCLFFBQUksQ0FBQyxTQUFTO0FBQ2I7QUFBQSxJQUNEO0FBQ0EsZUFBVyxPQUFPLEtBQUssVUFBVTtBQUNoQyxjQUFRLElBQUksR0FBRyxJQUFJLEtBQUssU0FBUyxHQUFHO0FBQ3BDLGFBQU8sS0FBSyxTQUFTLEdBQUc7QUFBQSxJQUN6QjtBQUFBLEVBQ0Q7QUFDRDtBQTVESztBQUFBLEVBREg7QUFBQSxHQUpXLHVCQUtSO0FBR0E7QUFBQSxFQURIO0FBQUEsR0FQVyx1QkFRUjtBQUdBO0FBQUEsRUFESDtBQUFBLEdBVlcsdUJBV1I7QUFHQTtBQUFBLEVBREg7QUFBQSxHQWJXLHVCQWNSO0FBR0E7QUFBQSxFQURIO0FBQUEsR0FoQlcsdUJBaUJSO0FBR0E7QUFBQSxFQURIO0FBQUEsR0FuQlcsdUJBb0JSO0FBR0E7QUFBQSxFQURIO0FBQUEsR0F0QlcsdUJBdUJSO0FBR0E7QUFBQSxFQURIO0FBQUEsR0F6QlcsdUJBMEJSO0FBR0E7QUFBQSxFQURIO0FBQUEsR0E1QlcsdUJBNkJSOyIsCiAgIm5hbWVzIjogW10KfQo=
