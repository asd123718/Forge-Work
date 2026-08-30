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
import { Disposable } from "../../../../base/common/lifecycle.js";
import { IBrowserWorkbenchEnvironmentService } from "../../../services/environment/browser/environmentService.js";
import { IRemoteExplorerService } from "../../../services/remote/common/remoteExplorerService.js";
let ShowCandidateContribution = class extends Disposable {
  constructor(remoteExplorerService, environmentService) {
    super();
    const showPortCandidate = environmentService.options?.tunnelProvider?.showPortCandidate;
    if (showPortCandidate) {
      this._register(remoteExplorerService.setCandidateFilter(async (candidates) => {
        const filters = await Promise.all(candidates.map((candidate) => showPortCandidate(candidate.host, candidate.port, candidate.detail ?? "")));
        const filteredCandidates = [];
        if (filters.length !== candidates.length) {
          return candidates;
        }
        for (let i = 0; i < candidates.length; i++) {
          if (filters[i]) {
            filteredCandidates.push(candidates[i]);
          }
        }
        return filteredCandidates;
      }));
    }
  }
};
ShowCandidateContribution.ID = "workbench.contrib.showPortCandidate";
ShowCandidateContribution = __decorateClass([
  __decorateParam(0, IRemoteExplorerService),
  __decorateParam(1, IBrowserWorkbenchEnvironmentService)
], ShowCandidateContribution);
export {
  ShowCandidateContribution
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXHJlbW90ZVxcYnJvd3Nlclxcc2hvd0NhbmRpZGF0ZS50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB7IERpc3Bvc2FibGUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgSVdvcmtiZW5jaENvbnRyaWJ1dGlvbiB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9jb250cmlidXRpb25zLmpzJztcbmltcG9ydCB7IElCcm93c2VyV29ya2JlbmNoRW52aXJvbm1lbnRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vc2VydmljZXMvZW52aXJvbm1lbnQvYnJvd3Nlci9lbnZpcm9ubWVudFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSVJlbW90ZUV4cGxvcmVyU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL3NlcnZpY2VzL3JlbW90ZS9jb21tb24vcmVtb3RlRXhwbG9yZXJTZXJ2aWNlLmpzJztcbmltcG9ydCB7IENhbmRpZGF0ZVBvcnQgfSBmcm9tICcuLi8uLi8uLi9zZXJ2aWNlcy9yZW1vdGUvY29tbW9uL3R1bm5lbE1vZGVsLmpzJztcblxuZXhwb3J0IGNsYXNzIFNob3dDYW5kaWRhdGVDb250cmlidXRpb24gZXh0ZW5kcyBEaXNwb3NhYmxlIGltcGxlbWVudHMgSVdvcmtiZW5jaENvbnRyaWJ1dGlvbiB7XG5cblx0c3RhdGljIHJlYWRvbmx5IElEID0gJ3dvcmtiZW5jaC5jb250cmliLnNob3dQb3J0Q2FuZGlkYXRlJztcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRASVJlbW90ZUV4cGxvcmVyU2VydmljZSByZW1vdGVFeHBsb3JlclNlcnZpY2U6IElSZW1vdGVFeHBsb3JlclNlcnZpY2UsXG5cdFx0QElCcm93c2VyV29ya2JlbmNoRW52aXJvbm1lbnRTZXJ2aWNlIGVudmlyb25tZW50U2VydmljZTogSUJyb3dzZXJXb3JrYmVuY2hFbnZpcm9ubWVudFNlcnZpY2UsXG5cdCkge1xuXHRcdHN1cGVyKCk7XG5cdFx0Y29uc3Qgc2hvd1BvcnRDYW5kaWRhdGUgPSBlbnZpcm9ubWVudFNlcnZpY2Uub3B0aW9ucz8udHVubmVsUHJvdmlkZXI/LnNob3dQb3J0Q2FuZGlkYXRlO1xuXHRcdGlmIChzaG93UG9ydENhbmRpZGF0ZSkge1xuXHRcdFx0dGhpcy5fcmVnaXN0ZXIocmVtb3RlRXhwbG9yZXJTZXJ2aWNlLnNldENhbmRpZGF0ZUZpbHRlcihhc3luYyAoY2FuZGlkYXRlczogQ2FuZGlkYXRlUG9ydFtdKTogUHJvbWlzZTxDYW5kaWRhdGVQb3J0W10+ID0+IHtcblx0XHRcdFx0Y29uc3QgZmlsdGVyczogYm9vbGVhbltdID0gYXdhaXQgUHJvbWlzZS5hbGwoY2FuZGlkYXRlcy5tYXAoY2FuZGlkYXRlID0+IHNob3dQb3J0Q2FuZGlkYXRlKGNhbmRpZGF0ZS5ob3N0LCBjYW5kaWRhdGUucG9ydCwgY2FuZGlkYXRlLmRldGFpbCA/PyAnJykpKTtcblx0XHRcdFx0Y29uc3QgZmlsdGVyZWRDYW5kaWRhdGVzOiBDYW5kaWRhdGVQb3J0W10gPSBbXTtcblx0XHRcdFx0aWYgKGZpbHRlcnMubGVuZ3RoICE9PSBjYW5kaWRhdGVzLmxlbmd0aCkge1xuXHRcdFx0XHRcdHJldHVybiBjYW5kaWRhdGVzO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGZvciAobGV0IGkgPSAwOyBpIDwgY2FuZGlkYXRlcy5sZW5ndGg7IGkrKykge1xuXHRcdFx0XHRcdGlmIChmaWx0ZXJzW2ldKSB7XG5cdFx0XHRcdFx0XHRmaWx0ZXJlZENhbmRpZGF0ZXMucHVzaChjYW5kaWRhdGVzW2ldKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdFx0cmV0dXJuIGZpbHRlcmVkQ2FuZGlkYXRlcztcblx0XHRcdH0pKTtcblx0XHR9XG5cdH1cbn1cbiJdLAogICJtYXBwaW5ncyI6ICI7Ozs7Ozs7Ozs7O0FBS0EsU0FBUyxrQkFBa0I7QUFFM0IsU0FBUywyQ0FBMkM7QUFDcEQsU0FBUyw4QkFBOEI7QUFHaEMsSUFBTSw0QkFBTixjQUF3QyxXQUE2QztBQUFBLEVBSTNGLFlBQ3lCLHVCQUNhLG9CQUNwQztBQUNELFVBQU07QUFDTixVQUFNLG9CQUFvQixtQkFBbUIsU0FBUyxnQkFBZ0I7QUFDdEUsUUFBSSxtQkFBbUI7QUFDdEIsV0FBSyxVQUFVLHNCQUFzQixtQkFBbUIsT0FBTyxlQUEwRDtBQUN4SCxjQUFNLFVBQXFCLE1BQU0sUUFBUSxJQUFJLFdBQVcsSUFBSSxlQUFhLGtCQUFrQixVQUFVLE1BQU0sVUFBVSxNQUFNLFVBQVUsVUFBVSxFQUFFLENBQUMsQ0FBQztBQUNuSixjQUFNLHFCQUFzQyxDQUFDO0FBQzdDLFlBQUksUUFBUSxXQUFXLFdBQVcsUUFBUTtBQUN6QyxpQkFBTztBQUFBLFFBQ1I7QUFDQSxpQkFBUyxJQUFJLEdBQUcsSUFBSSxXQUFXLFFBQVEsS0FBSztBQUMzQyxjQUFJLFFBQVEsQ0FBQyxHQUFHO0FBQ2YsK0JBQW1CLEtBQUssV0FBVyxDQUFDLENBQUM7QUFBQSxVQUN0QztBQUFBLFFBQ0Q7QUFDQSxlQUFPO0FBQUEsTUFDUixDQUFDLENBQUM7QUFBQSxJQUNIO0FBQUEsRUFDRDtBQUNEO0FBMUJhLDBCQUVJLEtBQUs7QUFGVCw0QkFBTjtBQUFBLEVBS0o7QUFBQSxFQUNBO0FBQUEsR0FOVTsiLAogICJuYW1lcyI6IFtdCn0K
