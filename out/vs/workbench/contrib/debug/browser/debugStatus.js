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
import * as nls from "../../../../nls.js";
import { dispose } from "../../../../base/common/lifecycle.js";
import { IDebugService, State } from "../common/debug.js";
import { IConfigurationService } from "../../../../platform/configuration/common/configuration.js";
import { IStatusbarService, StatusbarAlignment } from "../../../services/statusbar/browser/statusbar.js";
let DebugStatusContribution = class {
  constructor(statusBarService, debugService, configurationService) {
    this.statusBarService = statusBarService;
    this.debugService = debugService;
    this.toDispose = [];
    const addStatusBarEntry = () => {
      this.entryAccessor = this.statusBarService.addEntry(
        this.entry,
        "status.debug",
        StatusbarAlignment.LEFT,
        30
        /* Low Priority */
      );
    };
    const setShowInStatusBar = () => {
      this.showInStatusBar = configurationService.getValue("debug").showInStatusBar;
      if (this.showInStatusBar === "always" && !this.entryAccessor) {
        addStatusBarEntry();
      }
    };
    setShowInStatusBar();
    this.toDispose.push(this.debugService.onDidChangeState((state) => {
      if (state !== State.Inactive && this.showInStatusBar === "onFirstSessionStart" && !this.entryAccessor) {
        addStatusBarEntry();
      }
    }));
    this.toDispose.push(configurationService.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration("debug.showInStatusBar")) {
        setShowInStatusBar();
        if (this.entryAccessor && this.showInStatusBar === "never") {
          this.entryAccessor.dispose();
          this.entryAccessor = void 0;
        }
      }
    }));
    this.toDispose.push(this.debugService.getConfigurationManager().onDidSelectConfiguration((e) => {
      this.entryAccessor?.update(this.entry);
    }));
  }
  get entry() {
    let text = "";
    const manager = this.debugService.getConfigurationManager();
    const name = manager.selectedConfiguration.name || "";
    const nameAndLaunchPresent = name && manager.selectedConfiguration.launch;
    if (nameAndLaunchPresent) {
      text = manager.getLaunches().length > 1 ? `${name} (${manager.selectedConfiguration.launch.name})` : name;
    }
    return {
      name: nls.localize("status.debug", "Debug"),
      text: "$(debug-alt-small) " + text,
      ariaLabel: nls.localize("debugTarget", "Debug: {0}", text),
      tooltip: nls.localize("selectAndStartDebug", "Select and Start Debug Configuration"),
      command: "workbench.action.debug.selectandstart"
    };
  }
  dispose() {
    this.entryAccessor?.dispose();
    dispose(this.toDispose);
  }
};
DebugStatusContribution = __decorateClass([
  __decorateParam(0, IStatusbarService),
  __decorateParam(1, IDebugService),
  __decorateParam(2, IConfigurationService)
], DebugStatusContribution);
export {
  DebugStatusContribution
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXGRlYnVnXFxicm93c2VyXFxkZWJ1Z1N0YXR1cy50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCAqIGFzIG5scyBmcm9tICcuLi8uLi8uLi8uLi9ubHMuanMnO1xuaW1wb3J0IHsgSURpc3Bvc2FibGUsIGRpc3Bvc2UgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgSURlYnVnU2VydmljZSwgU3RhdGUsIElEZWJ1Z0NvbmZpZ3VyYXRpb24gfSBmcm9tICcuLi9jb21tb24vZGVidWcuanMnO1xuaW1wb3J0IHsgSUNvbmZpZ3VyYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29uZmlndXJhdGlvbi9jb21tb24vY29uZmlndXJhdGlvbi5qcyc7XG5pbXBvcnQgeyBJU3RhdHVzYmFyRW50cnksIElTdGF0dXNiYXJTZXJ2aWNlLCBTdGF0dXNiYXJBbGlnbm1lbnQsIElTdGF0dXNiYXJFbnRyeUFjY2Vzc29yIH0gZnJvbSAnLi4vLi4vLi4vc2VydmljZXMvc3RhdHVzYmFyL2Jyb3dzZXIvc3RhdHVzYmFyLmpzJztcbmltcG9ydCB7IElXb3JrYmVuY2hDb250cmlidXRpb24gfSBmcm9tICcuLi8uLi8uLi9jb21tb24vY29udHJpYnV0aW9ucy5qcyc7XG5cbmV4cG9ydCBjbGFzcyBEZWJ1Z1N0YXR1c0NvbnRyaWJ1dGlvbiBpbXBsZW1lbnRzIElXb3JrYmVuY2hDb250cmlidXRpb24ge1xuXG5cdHByaXZhdGUgc2hvd0luU3RhdHVzQmFyITogJ25ldmVyJyB8ICdhbHdheXMnIHwgJ29uRmlyc3RTZXNzaW9uU3RhcnQnO1xuXHRwcml2YXRlIHRvRGlzcG9zZTogSURpc3Bvc2FibGVbXSA9IFtdO1xuXHRwcml2YXRlIGVudHJ5QWNjZXNzb3I6IElTdGF0dXNiYXJFbnRyeUFjY2Vzc29yIHwgdW5kZWZpbmVkO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdEBJU3RhdHVzYmFyU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IHN0YXR1c0JhclNlcnZpY2U6IElTdGF0dXNiYXJTZXJ2aWNlLFxuXHRcdEBJRGVidWdTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgZGVidWdTZXJ2aWNlOiBJRGVidWdTZXJ2aWNlLFxuXHRcdEBJQ29uZmlndXJhdGlvblNlcnZpY2UgY29uZmlndXJhdGlvblNlcnZpY2U6IElDb25maWd1cmF0aW9uU2VydmljZVxuXHQpIHtcblxuXHRcdGNvbnN0IGFkZFN0YXR1c0JhckVudHJ5ID0gKCkgPT4ge1xuXHRcdFx0dGhpcy5lbnRyeUFjY2Vzc29yID0gdGhpcy5zdGF0dXNCYXJTZXJ2aWNlLmFkZEVudHJ5KHRoaXMuZW50cnksICdzdGF0dXMuZGVidWcnLCBTdGF0dXNiYXJBbGlnbm1lbnQuTEVGVCwgMzAgLyogTG93IFByaW9yaXR5ICovKTtcblx0XHR9O1xuXG5cdFx0Y29uc3Qgc2V0U2hvd0luU3RhdHVzQmFyID0gKCkgPT4ge1xuXHRcdFx0dGhpcy5zaG93SW5TdGF0dXNCYXIgPSBjb25maWd1cmF0aW9uU2VydmljZS5nZXRWYWx1ZTxJRGVidWdDb25maWd1cmF0aW9uPignZGVidWcnKS5zaG93SW5TdGF0dXNCYXI7XG5cdFx0XHRpZiAodGhpcy5zaG93SW5TdGF0dXNCYXIgPT09ICdhbHdheXMnICYmICF0aGlzLmVudHJ5QWNjZXNzb3IpIHtcblx0XHRcdFx0YWRkU3RhdHVzQmFyRW50cnkoKTtcblx0XHRcdH1cblx0XHR9O1xuXHRcdHNldFNob3dJblN0YXR1c0JhcigpO1xuXG5cdFx0dGhpcy50b0Rpc3Bvc2UucHVzaCh0aGlzLmRlYnVnU2VydmljZS5vbkRpZENoYW5nZVN0YXRlKHN0YXRlID0+IHtcblx0XHRcdGlmIChzdGF0ZSAhPT0gU3RhdGUuSW5hY3RpdmUgJiYgdGhpcy5zaG93SW5TdGF0dXNCYXIgPT09ICdvbkZpcnN0U2Vzc2lvblN0YXJ0JyAmJiAhdGhpcy5lbnRyeUFjY2Vzc29yKSB7XG5cdFx0XHRcdGFkZFN0YXR1c0JhckVudHJ5KCk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXHRcdHRoaXMudG9EaXNwb3NlLnB1c2goY29uZmlndXJhdGlvblNlcnZpY2Uub25EaWRDaGFuZ2VDb25maWd1cmF0aW9uKGUgPT4ge1xuXHRcdFx0aWYgKGUuYWZmZWN0c0NvbmZpZ3VyYXRpb24oJ2RlYnVnLnNob3dJblN0YXR1c0JhcicpKSB7XG5cdFx0XHRcdHNldFNob3dJblN0YXR1c0JhcigpO1xuXHRcdFx0XHRpZiAodGhpcy5lbnRyeUFjY2Vzc29yICYmIHRoaXMuc2hvd0luU3RhdHVzQmFyID09PSAnbmV2ZXInKSB7XG5cdFx0XHRcdFx0dGhpcy5lbnRyeUFjY2Vzc29yLmRpc3Bvc2UoKTtcblx0XHRcdFx0XHR0aGlzLmVudHJ5QWNjZXNzb3IgPSB1bmRlZmluZWQ7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9KSk7XG5cdFx0dGhpcy50b0Rpc3Bvc2UucHVzaCh0aGlzLmRlYnVnU2VydmljZS5nZXRDb25maWd1cmF0aW9uTWFuYWdlcigpLm9uRGlkU2VsZWN0Q29uZmlndXJhdGlvbihlID0+IHtcblx0XHRcdHRoaXMuZW50cnlBY2Nlc3Nvcj8udXBkYXRlKHRoaXMuZW50cnkpO1xuXHRcdH0pKTtcblx0fVxuXG5cdHByaXZhdGUgZ2V0IGVudHJ5KCk6IElTdGF0dXNiYXJFbnRyeSB7XG5cdFx0bGV0IHRleHQgPSAnJztcblx0XHRjb25zdCBtYW5hZ2VyID0gdGhpcy5kZWJ1Z1NlcnZpY2UuZ2V0Q29uZmlndXJhdGlvbk1hbmFnZXIoKTtcblx0XHRjb25zdCBuYW1lID0gbWFuYWdlci5zZWxlY3RlZENvbmZpZ3VyYXRpb24ubmFtZSB8fCAnJztcblx0XHRjb25zdCBuYW1lQW5kTGF1bmNoUHJlc2VudCA9IG5hbWUgJiYgbWFuYWdlci5zZWxlY3RlZENvbmZpZ3VyYXRpb24ubGF1bmNoO1xuXHRcdGlmIChuYW1lQW5kTGF1bmNoUHJlc2VudCkge1xuXHRcdFx0dGV4dCA9IChtYW5hZ2VyLmdldExhdW5jaGVzKCkubGVuZ3RoID4gMSA/IGAke25hbWV9ICgke21hbmFnZXIuc2VsZWN0ZWRDb25maWd1cmF0aW9uLmxhdW5jaCEubmFtZX0pYCA6IG5hbWUpO1xuXHRcdH1cblxuXHRcdHJldHVybiB7XG5cdFx0XHRuYW1lOiBubHMubG9jYWxpemUoJ3N0YXR1cy5kZWJ1ZycsIFwiRGVidWdcIiksXG5cdFx0XHR0ZXh0OiAnJChkZWJ1Zy1hbHQtc21hbGwpICcgKyB0ZXh0LFxuXHRcdFx0YXJpYUxhYmVsOiBubHMubG9jYWxpemUoJ2RlYnVnVGFyZ2V0JywgXCJEZWJ1ZzogezB9XCIsIHRleHQpLFxuXHRcdFx0dG9vbHRpcDogbmxzLmxvY2FsaXplKCdzZWxlY3RBbmRTdGFydERlYnVnJywgXCJTZWxlY3QgYW5kIFN0YXJ0IERlYnVnIENvbmZpZ3VyYXRpb25cIiksXG5cdFx0XHRjb21tYW5kOiAnd29ya2JlbmNoLmFjdGlvbi5kZWJ1Zy5zZWxlY3RhbmRzdGFydCdcblx0XHR9O1xuXHR9XG5cblx0ZGlzcG9zZSgpOiB2b2lkIHtcblx0XHR0aGlzLmVudHJ5QWNjZXNzb3I/LmRpc3Bvc2Uo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
