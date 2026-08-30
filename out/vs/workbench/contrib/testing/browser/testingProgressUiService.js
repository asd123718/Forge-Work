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
import { Disposable, DisposableStore } from "../../../../base/common/lifecycle.js";
import { autorun } from "../../../../base/common/observable.js";
import { IConfigurationService } from "../../../../platform/configuration/common/configuration.js";
import { IViewsService } from "../../../services/views/common/viewsService.js";
import { AutoOpenTesting, getTestingConfiguration, TestingConfigKeys } from "../common/configuration.js";
import { Testing } from "../common/constants.js";
import { ITestCoverageService } from "../common/testCoverageService.js";
import { isFailedState } from "../common/testingStates.js";
import { TestResultItemChangeReason } from "../common/testResult.js";
import { ITestResultService } from "../common/testResultService.js";
import { ExplorerTestCoverageBars } from "./testCoverageBars.js";
let TestingProgressTrigger = class extends Disposable {
  constructor(resultService, testCoverageService, configurationService, viewsService) {
    super();
    this.configurationService = configurationService;
    this.viewsService = viewsService;
    this._register(resultService.onResultsChanged((e) => {
      if ("started" in e) {
        this.attachAutoOpenForNewResults(e.started);
      }
    }));
    const barContributionRegistration = autorun((reader) => {
      const hasCoverage = !!testCoverageService.selected.read(reader);
      if (!hasCoverage) {
        return;
      }
      barContributionRegistration.dispose();
      ExplorerTestCoverageBars.register();
    });
    this._register(barContributionRegistration);
  }
  attachAutoOpenForNewResults(result) {
    if (result.request.preserveFocus === true) {
      return;
    }
    const cfg = getTestingConfiguration(this.configurationService, TestingConfigKeys.OpenResults);
    if (cfg === AutoOpenTesting.NeverOpen) {
      return;
    }
    if (cfg === AutoOpenTesting.OpenExplorerOnTestStart) {
      return this.openExplorerView();
    }
    if (cfg === AutoOpenTesting.OpenOnTestStart) {
      return this.openResultsView();
    }
    const disposable = new DisposableStore();
    disposable.add(result.onComplete(() => disposable.dispose()));
    disposable.add(result.onChange((e) => {
      if (e.reason === TestResultItemChangeReason.OwnStateChange && isFailedState(e.item.ownComputedState)) {
        this.openResultsView();
        disposable.dispose();
      }
    }));
  }
  openExplorerView() {
    this.viewsService.openView(Testing.ExplorerViewId, false);
  }
  openResultsView() {
    this.viewsService.openView(Testing.ResultsViewId, false);
  }
};
TestingProgressTrigger.ID = "workbench.contrib.testing.progressTrigger";
TestingProgressTrigger = __decorateClass([
  __decorateParam(0, ITestResultService),
  __decorateParam(1, ITestCoverageService),
  __decorateParam(2, IConfigurationService),
  __decorateParam(3, IViewsService)
], TestingProgressTrigger);
export {
  TestingProgressTrigger
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXHRlc3RpbmdcXGJyb3dzZXJcXHRlc3RpbmdQcm9ncmVzc1VpU2VydmljZS50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB7IERpc3Bvc2FibGUsIERpc3Bvc2FibGVTdG9yZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBhdXRvcnVuIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vb2JzZXJ2YWJsZS5qcyc7XG5pbXBvcnQgeyBJQ29uZmlndXJhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb25maWd1cmF0aW9uL2NvbW1vbi9jb25maWd1cmF0aW9uLmpzJztcbmltcG9ydCB7IElWaWV3c1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9zZXJ2aWNlcy92aWV3cy9jb21tb24vdmlld3NTZXJ2aWNlLmpzJztcbmltcG9ydCB7IEF1dG9PcGVuVGVzdGluZywgZ2V0VGVzdGluZ0NvbmZpZ3VyYXRpb24sIFRlc3RpbmdDb25maWdLZXlzIH0gZnJvbSAnLi4vY29tbW9uL2NvbmZpZ3VyYXRpb24uanMnO1xuaW1wb3J0IHsgVGVzdGluZyB9IGZyb20gJy4uL2NvbW1vbi9jb25zdGFudHMuanMnO1xuaW1wb3J0IHsgSVRlc3RDb3ZlcmFnZVNlcnZpY2UgfSBmcm9tICcuLi9jb21tb24vdGVzdENvdmVyYWdlU2VydmljZS5qcyc7XG5pbXBvcnQgeyBpc0ZhaWxlZFN0YXRlIH0gZnJvbSAnLi4vY29tbW9uL3Rlc3RpbmdTdGF0ZXMuanMnO1xuaW1wb3J0IHsgTGl2ZVRlc3RSZXN1bHQsIFRlc3RSZXN1bHRJdGVtQ2hhbmdlUmVhc29uIH0gZnJvbSAnLi4vY29tbW9uL3Rlc3RSZXN1bHQuanMnO1xuaW1wb3J0IHsgSVRlc3RSZXN1bHRTZXJ2aWNlIH0gZnJvbSAnLi4vY29tbW9uL3Rlc3RSZXN1bHRTZXJ2aWNlLmpzJztcbmltcG9ydCB7IEV4cGxvcmVyVGVzdENvdmVyYWdlQmFycyB9IGZyb20gJy4vdGVzdENvdmVyYWdlQmFycy5qcyc7XG5cbi8qKiBXb3JrYmVuY2ggY29udHJpYnV0aW9uIHRoYXQgdHJpZ2dlcnMgdXBkYXRlcyBpbiB0aGUgVGVzdGluZ1Byb2dyZXNzVWkgc2VydmljZSAqL1xuZXhwb3J0IGNsYXNzIFRlc3RpbmdQcm9ncmVzc1RyaWdnZXIgZXh0ZW5kcyBEaXNwb3NhYmxlIHtcblx0cHVibGljIHN0YXRpYyByZWFkb25seSBJRCA9ICd3b3JrYmVuY2guY29udHJpYi50ZXN0aW5nLnByb2dyZXNzVHJpZ2dlcic7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0QElUZXN0UmVzdWx0U2VydmljZSByZXN1bHRTZXJ2aWNlOiBJVGVzdFJlc3VsdFNlcnZpY2UsXG5cdFx0QElUZXN0Q292ZXJhZ2VTZXJ2aWNlIHRlc3RDb3ZlcmFnZVNlcnZpY2U6IElUZXN0Q292ZXJhZ2VTZXJ2aWNlLFxuXHRcdEBJQ29uZmlndXJhdGlvblNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBjb25maWd1cmF0aW9uU2VydmljZTogSUNvbmZpZ3VyYXRpb25TZXJ2aWNlLFxuXHRcdEBJVmlld3NTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgdmlld3NTZXJ2aWNlOiBJVmlld3NTZXJ2aWNlLFxuXHQpIHtcblx0XHRzdXBlcigpO1xuXG5cdFx0dGhpcy5fcmVnaXN0ZXIocmVzdWx0U2VydmljZS5vblJlc3VsdHNDaGFuZ2VkKChlKSA9PiB7XG5cdFx0XHRpZiAoJ3N0YXJ0ZWQnIGluIGUpIHtcblx0XHRcdFx0dGhpcy5hdHRhY2hBdXRvT3BlbkZvck5ld1Jlc3VsdHMoZS5zdGFydGVkKTtcblx0XHRcdH1cblx0XHR9KSk7XG5cblx0XHRjb25zdCBiYXJDb250cmlidXRpb25SZWdpc3RyYXRpb24gPSBhdXRvcnVuKHJlYWRlciA9PiB7XG5cdFx0XHRjb25zdCBoYXNDb3ZlcmFnZSA9ICEhdGVzdENvdmVyYWdlU2VydmljZS5zZWxlY3RlZC5yZWFkKHJlYWRlcik7XG5cdFx0XHRpZiAoIWhhc0NvdmVyYWdlKSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblxuXHRcdFx0YmFyQ29udHJpYnV0aW9uUmVnaXN0cmF0aW9uLmRpc3Bvc2UoKTtcblx0XHRcdEV4cGxvcmVyVGVzdENvdmVyYWdlQmFycy5yZWdpc3RlcigpO1xuXHRcdH0pO1xuXG5cdFx0dGhpcy5fcmVnaXN0ZXIoYmFyQ29udHJpYnV0aW9uUmVnaXN0cmF0aW9uKTtcblx0fVxuXG5cdHByaXZhdGUgYXR0YWNoQXV0b09wZW5Gb3JOZXdSZXN1bHRzKHJlc3VsdDogTGl2ZVRlc3RSZXN1bHQpIHtcblx0XHRpZiAocmVzdWx0LnJlcXVlc3QucHJlc2VydmVGb2N1cyA9PT0gdHJ1ZSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IGNmZyA9IGdldFRlc3RpbmdDb25maWd1cmF0aW9uKHRoaXMuY29uZmlndXJhdGlvblNlcnZpY2UsIFRlc3RpbmdDb25maWdLZXlzLk9wZW5SZXN1bHRzKTtcblx0XHRpZiAoY2ZnID09PSBBdXRvT3BlblRlc3RpbmcuTmV2ZXJPcGVuKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0aWYgKGNmZyA9PT0gQXV0b09wZW5UZXN0aW5nLk9wZW5FeHBsb3Jlck9uVGVzdFN0YXJ0KSB7XG5cdFx0XHRyZXR1cm4gdGhpcy5vcGVuRXhwbG9yZXJWaWV3KCk7XG5cdFx0fVxuXG5cdFx0aWYgKGNmZyA9PT0gQXV0b09wZW5UZXN0aW5nLk9wZW5PblRlc3RTdGFydCkge1xuXHRcdFx0cmV0dXJuIHRoaXMub3BlblJlc3VsdHNWaWV3KCk7XG5cdFx0fVxuXG5cdFx0Ly8gb3BlbiBvbiBmYWlsdXJlXG5cdFx0Y29uc3QgZGlzcG9zYWJsZSA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblx0XHRkaXNwb3NhYmxlLmFkZChyZXN1bHQub25Db21wbGV0ZSgoKSA9PiBkaXNwb3NhYmxlLmRpc3Bvc2UoKSkpO1xuXHRcdGRpc3Bvc2FibGUuYWRkKHJlc3VsdC5vbkNoYW5nZShlID0+IHtcblx0XHRcdGlmIChlLnJlYXNvbiA9PT0gVGVzdFJlc3VsdEl0ZW1DaGFuZ2VSZWFzb24uT3duU3RhdGVDaGFuZ2UgJiYgaXNGYWlsZWRTdGF0ZShlLml0ZW0ub3duQ29tcHV0ZWRTdGF0ZSkpIHtcblx0XHRcdFx0dGhpcy5vcGVuUmVzdWx0c1ZpZXcoKTtcblx0XHRcdFx0ZGlzcG9zYWJsZS5kaXNwb3NlKCk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXHR9XG5cblx0cHJpdmF0ZSBvcGVuRXhwbG9yZXJWaWV3KCkge1xuXHRcdHRoaXMudmlld3NTZXJ2aWNlLm9wZW5WaWV3KFRlc3RpbmcuRXhwbG9yZXJWaWV3SWQsIGZhbHNlKTtcblx0fVxuXG5cdHByaXZhdGUgb3BlblJlc3VsdHNWaWV3KCkge1xuXHRcdHRoaXMudmlld3NTZXJ2aWNlLm9wZW5WaWV3KFRlc3RpbmcuUmVzdWx0c1ZpZXdJZCwgZmFsc2UpO1xuXHR9XG59XG4iXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7OztBQUtBLFNBQVMsWUFBWSx1QkFBdUI7QUFDNUMsU0FBUyxlQUFlO0FBQ3hCLFNBQVMsNkJBQTZCO0FBQ3RDLFNBQVMscUJBQXFCO0FBQzlCLFNBQVMsaUJBQWlCLHlCQUF5Qix5QkFBeUI7QUFDNUUsU0FBUyxlQUFlO0FBQ3hCLFNBQVMsNEJBQTRCO0FBQ3JDLFNBQVMscUJBQXFCO0FBQzlCLFNBQXlCLGtDQUFrQztBQUMzRCxTQUFTLDBCQUEwQjtBQUNuQyxTQUFTLGdDQUFnQztBQUdsQyxJQUFNLHlCQUFOLGNBQXFDLFdBQVc7QUFBQSxFQUd0RCxZQUNxQixlQUNFLHFCQUNrQixzQkFDUixjQUMvQjtBQUNELFVBQU07QUFIa0M7QUFDUjtBQUloQyxTQUFLLFVBQVUsY0FBYyxpQkFBaUIsQ0FBQyxNQUFNO0FBQ3BELFVBQUksYUFBYSxHQUFHO0FBQ25CLGFBQUssNEJBQTRCLEVBQUUsT0FBTztBQUFBLE1BQzNDO0FBQUEsSUFDRCxDQUFDLENBQUM7QUFFRixVQUFNLDhCQUE4QixRQUFRLFlBQVU7QUFDckQsWUFBTSxjQUFjLENBQUMsQ0FBQyxvQkFBb0IsU0FBUyxLQUFLLE1BQU07QUFDOUQsVUFBSSxDQUFDLGFBQWE7QUFDakI7QUFBQSxNQUNEO0FBRUEsa0NBQTRCLFFBQVE7QUFDcEMsK0JBQXlCLFNBQVM7QUFBQSxJQUNuQyxDQUFDO0FBRUQsU0FBSyxVQUFVLDJCQUEyQjtBQUFBLEVBQzNDO0FBQUEsRUFFUSw0QkFBNEIsUUFBd0I7QUFDM0QsUUFBSSxPQUFPLFFBQVEsa0JBQWtCLE1BQU07QUFDMUM7QUFBQSxJQUNEO0FBRUEsVUFBTSxNQUFNLHdCQUF3QixLQUFLLHNCQUFzQixrQkFBa0IsV0FBVztBQUM1RixRQUFJLFFBQVEsZ0JBQWdCLFdBQVc7QUFDdEM7QUFBQSxJQUNEO0FBRUEsUUFBSSxRQUFRLGdCQUFnQix5QkFBeUI7QUFDcEQsYUFBTyxLQUFLLGlCQUFpQjtBQUFBLElBQzlCO0FBRUEsUUFBSSxRQUFRLGdCQUFnQixpQkFBaUI7QUFDNUMsYUFBTyxLQUFLLGdCQUFnQjtBQUFBLElBQzdCO0FBR0EsVUFBTSxhQUFhLElBQUksZ0JBQWdCO0FBQ3ZDLGVBQVcsSUFBSSxPQUFPLFdBQVcsTUFBTSxXQUFXLFFBQVEsQ0FBQyxDQUFDO0FBQzVELGVBQVcsSUFBSSxPQUFPLFNBQVMsT0FBSztBQUNuQyxVQUFJLEVBQUUsV0FBVywyQkFBMkIsa0JBQWtCLGNBQWMsRUFBRSxLQUFLLGdCQUFnQixHQUFHO0FBQ3JHLGFBQUssZ0JBQWdCO0FBQ3JCLG1CQUFXLFFBQVE7QUFBQSxNQUNwQjtBQUFBLElBQ0QsQ0FBQyxDQUFDO0FBQUEsRUFDSDtBQUFBLEVBRVEsbUJBQW1CO0FBQzFCLFNBQUssYUFBYSxTQUFTLFFBQVEsZ0JBQWdCLEtBQUs7QUFBQSxFQUN6RDtBQUFBLEVBRVEsa0JBQWtCO0FBQ3pCLFNBQUssYUFBYSxTQUFTLFFBQVEsZUFBZSxLQUFLO0FBQUEsRUFDeEQ7QUFDRDtBQWxFYSx1QkFDVyxLQUFLO0FBRGhCLHlCQUFOO0FBQUEsRUFJSjtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEdBUFU7IiwKICAibmFtZXMiOiBbXQp9Cg==
