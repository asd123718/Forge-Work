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
import "./media/changesSummaryWidget.css";
import * as dom from "../../../../base/browser/dom.js";
import { structuralEquals } from "../../../../base/common/equals.js";
import { Disposable } from "../../../../base/common/lifecycle.js";
import { derived, derivedObservableWithCache, derivedOpts } from "../../../../base/common/observable.js";
import { IChangesViewService } from "../common/changesViewService.js";
import { IInstantiationService } from "../../../../platform/instantiation/common/instantiation.js";
import { AnimatedCounterWidget } from "../../../../workbench/browser/animatedCounterWidget.js";
let ChangesSummaryWidget = class extends Disposable {
  constructor(changesViewService, _instantiationService) {
    super();
    this._instantiationService = _instantiationService;
    const summaryRawObs = derivedObservableWithCache(this, (reader, lastValue) => {
      const isLoading = changesViewService.activeSessionLoadingObs.read(reader);
      if (isLoading) {
        return lastValue;
      }
      const entries = changesViewService.activeSessionChangesObs.read(reader);
      if (entries.length === 0) {
        return void 0;
      }
      let additions = 0, deletions = 0;
      for (const entry of entries) {
        additions += entry.insertions;
        deletions += entry.deletions;
      }
      return {
        additions,
        deletions,
        files: entries.length
      };
    });
    this._summaryObs = derivedOpts({
      equalsFn: structuralEquals
    }, (reader) => summaryRawObs.read(reader));
  }
  get summary() {
    return this._summaryObs;
  }
  render(container) {
    const element = dom.$("div.changes-summary-widget");
    container.appendChild(element);
    this._register(this._instantiationService.createInstance(AnimatedCounterWidget, element, {
      prefix: "+",
      direction: "topToBottom",
      cssClassName: "changes-summary-lines-added",
      count: derived(this, (reader) => {
        return this._summaryObs.read(reader)?.additions;
      })
    }));
    this._register(this._instantiationService.createInstance(AnimatedCounterWidget, element, {
      prefix: "-",
      direction: "bottomToTop",
      cssClassName: "changes-summary-lines-removed",
      count: derived(this, (reader) => {
        return this._summaryObs.read(reader)?.deletions;
      })
    }));
  }
};
ChangesSummaryWidget = __decorateClass([
  __decorateParam(0, IChangesViewService),
  __decorateParam(1, IInstantiationService)
], ChangesSummaryWidget);
export {
  ChangesSummaryWidget
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxzZXNzaW9uc1xcY29udHJpYlxcY2hhbmdlc1xcYnJvd3NlclxcY2hhbmdlc1N1bW1hcnlXaWRnZXQudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgJy4vbWVkaWEvY2hhbmdlc1N1bW1hcnlXaWRnZXQuY3NzJztcbmltcG9ydCAqIGFzIGRvbSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvZG9tLmpzJztcbmltcG9ydCB7IHN0cnVjdHVyYWxFcXVhbHMgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9lcXVhbHMuanMnO1xuaW1wb3J0IHsgRGlzcG9zYWJsZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBkZXJpdmVkLCBkZXJpdmVkT2JzZXJ2YWJsZVdpdGhDYWNoZSwgZGVyaXZlZE9wdHMsIElPYnNlcnZhYmxlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vb2JzZXJ2YWJsZS5qcyc7XG5pbXBvcnQgeyBJU2Vzc2lvbkNoYW5nZXNTdW1tYXJ5IH0gZnJvbSAnLi4vLi4vLi4vc2VydmljZXMvc2Vzc2lvbnMvY29tbW9uL3Nlc3Npb24uanMnO1xuaW1wb3J0IHsgSUNoYW5nZXNWaWV3U2VydmljZSB9IGZyb20gJy4uL2NvbW1vbi9jaGFuZ2VzVmlld1NlcnZpY2UuanMnO1xuaW1wb3J0IHsgSUluc3RhbnRpYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vaW5zdGFudGlhdGlvbi9jb21tb24vaW5zdGFudGlhdGlvbi5qcyc7XG5pbXBvcnQgeyBBbmltYXRlZENvdW50ZXJXaWRnZXQgfSBmcm9tICcuLi8uLi8uLi8uLi93b3JrYmVuY2gvYnJvd3Nlci9hbmltYXRlZENvdW50ZXJXaWRnZXQuanMnO1xuXG5leHBvcnQgY2xhc3MgQ2hhbmdlc1N1bW1hcnlXaWRnZXQgZXh0ZW5kcyBEaXNwb3NhYmxlIHtcblx0cHJpdmF0ZSByZWFkb25seSBfc3VtbWFyeU9iczogSU9ic2VydmFibGU8SVNlc3Npb25DaGFuZ2VzU3VtbWFyeSB8IHVuZGVmaW5lZD47XG5cdGdldCBzdW1tYXJ5KCkgeyByZXR1cm4gdGhpcy5fc3VtbWFyeU9iczsgfVxuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdEBJQ2hhbmdlc1ZpZXdTZXJ2aWNlIGNoYW5nZXNWaWV3U2VydmljZTogSUNoYW5nZXNWaWV3U2VydmljZSxcblx0XHRASUluc3RhbnRpYXRpb25TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2luc3RhbnRpYXRpb25TZXJ2aWNlOiBJSW5zdGFudGlhdGlvblNlcnZpY2UsXG5cdCkge1xuXHRcdHN1cGVyKCk7XG5cblx0XHRjb25zdCBzdW1tYXJ5UmF3T2JzID0gZGVyaXZlZE9ic2VydmFibGVXaXRoQ2FjaGU8SVNlc3Npb25DaGFuZ2VzU3VtbWFyeSB8IHVuZGVmaW5lZD4odGhpcywgKHJlYWRlciwgbGFzdFZhbHVlKSA9PiB7XG5cdFx0XHRjb25zdCBpc0xvYWRpbmcgPSBjaGFuZ2VzVmlld1NlcnZpY2UuYWN0aXZlU2Vzc2lvbkxvYWRpbmdPYnMucmVhZChyZWFkZXIpO1xuXHRcdFx0aWYgKGlzTG9hZGluZykge1xuXHRcdFx0XHRyZXR1cm4gbGFzdFZhbHVlO1xuXHRcdFx0fVxuXG5cdFx0XHRjb25zdCBlbnRyaWVzID0gY2hhbmdlc1ZpZXdTZXJ2aWNlLmFjdGl2ZVNlc3Npb25DaGFuZ2VzT2JzLnJlYWQocmVhZGVyKTtcblx0XHRcdGlmIChlbnRyaWVzLmxlbmd0aCA9PT0gMCkge1xuXHRcdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdFx0fVxuXG5cdFx0XHRsZXQgYWRkaXRpb25zID0gMCwgZGVsZXRpb25zID0gMDtcblx0XHRcdGZvciAoY29uc3QgZW50cnkgb2YgZW50cmllcykge1xuXHRcdFx0XHRhZGRpdGlvbnMgKz0gZW50cnkuaW5zZXJ0aW9ucztcblx0XHRcdFx0ZGVsZXRpb25zICs9IGVudHJ5LmRlbGV0aW9ucztcblx0XHRcdH1cblxuXHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0YWRkaXRpb25zLFxuXHRcdFx0XHRkZWxldGlvbnMsXG5cdFx0XHRcdGZpbGVzOiBlbnRyaWVzLmxlbmd0aCxcblx0XHRcdH0gc2F0aXNmaWVzIElTZXNzaW9uQ2hhbmdlc1N1bW1hcnk7XG5cdFx0fSk7XG5cblx0XHR0aGlzLl9zdW1tYXJ5T2JzID0gZGVyaXZlZE9wdHM8SVNlc3Npb25DaGFuZ2VzU3VtbWFyeSB8IHVuZGVmaW5lZD4oe1xuXHRcdFx0ZXF1YWxzRm46IHN0cnVjdHVyYWxFcXVhbHNcblx0XHR9LCByZWFkZXIgPT4gc3VtbWFyeVJhd09icy5yZWFkKHJlYWRlcikpO1xuXHR9XG5cblx0cmVuZGVyKGNvbnRhaW5lcjogSFRNTEVsZW1lbnQpIHtcblx0XHRjb25zdCBlbGVtZW50ID0gZG9tLiQoJ2Rpdi5jaGFuZ2VzLXN1bW1hcnktd2lkZ2V0Jyk7XG5cdFx0Y29udGFpbmVyLmFwcGVuZENoaWxkKGVsZW1lbnQpO1xuXG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5faW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoQW5pbWF0ZWRDb3VudGVyV2lkZ2V0LCBlbGVtZW50LCB7XG5cdFx0XHRwcmVmaXg6ICcrJyxcblx0XHRcdGRpcmVjdGlvbjogJ3RvcFRvQm90dG9tJyxcblx0XHRcdGNzc0NsYXNzTmFtZTogJ2NoYW5nZXMtc3VtbWFyeS1saW5lcy1hZGRlZCcsXG5cdFx0XHRjb3VudDogZGVyaXZlZCh0aGlzLCAocmVhZGVyKSA9PiB7XG5cdFx0XHRcdHJldHVybiB0aGlzLl9zdW1tYXJ5T2JzLnJlYWQocmVhZGVyKT8uYWRkaXRpb25zO1xuXHRcdFx0fSlcblx0XHR9KSk7XG5cblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLl9pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShBbmltYXRlZENvdW50ZXJXaWRnZXQsIGVsZW1lbnQsIHtcblx0XHRcdHByZWZpeDogJy0nLFxuXHRcdFx0ZGlyZWN0aW9uOiAnYm90dG9tVG9Ub3AnLFxuXHRcdFx0Y3NzQ2xhc3NOYW1lOiAnY2hhbmdlcy1zdW1tYXJ5LWxpbmVzLXJlbW92ZWQnLFxuXHRcdFx0Y291bnQ6IGRlcml2ZWQodGhpcywgKHJlYWRlcikgPT4ge1xuXHRcdFx0XHRyZXR1cm4gdGhpcy5fc3VtbWFyeU9icy5yZWFkKHJlYWRlcik/LmRlbGV0aW9ucztcblx0XHRcdH0pXG5cdFx0fSkpO1xuXHR9XG59XG4iXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7OztBQUtBLE9BQU87QUFDUCxZQUFZLFNBQVM7QUFDckIsU0FBUyx3QkFBd0I7QUFDakMsU0FBUyxrQkFBa0I7QUFDM0IsU0FBUyxTQUFTLDRCQUE0QixtQkFBZ0M7QUFFOUUsU0FBUywyQkFBMkI7QUFDcEMsU0FBUyw2QkFBNkI7QUFDdEMsU0FBUyw2QkFBNkI7QUFFL0IsSUFBTSx1QkFBTixjQUFtQyxXQUFXO0FBQUEsRUFJcEQsWUFDc0Isb0JBQ21CLHVCQUN2QztBQUNELFVBQU07QUFGa0M7QUFJeEMsVUFBTSxnQkFBZ0IsMkJBQStELE1BQU0sQ0FBQyxRQUFRLGNBQWM7QUFDakgsWUFBTSxZQUFZLG1CQUFtQix3QkFBd0IsS0FBSyxNQUFNO0FBQ3hFLFVBQUksV0FBVztBQUNkLGVBQU87QUFBQSxNQUNSO0FBRUEsWUFBTSxVQUFVLG1CQUFtQix3QkFBd0IsS0FBSyxNQUFNO0FBQ3RFLFVBQUksUUFBUSxXQUFXLEdBQUc7QUFDekIsZUFBTztBQUFBLE1BQ1I7QUFFQSxVQUFJLFlBQVksR0FBRyxZQUFZO0FBQy9CLGlCQUFXLFNBQVMsU0FBUztBQUM1QixxQkFBYSxNQUFNO0FBQ25CLHFCQUFhLE1BQU07QUFBQSxNQUNwQjtBQUVBLGFBQU87QUFBQSxRQUNOO0FBQUEsUUFDQTtBQUFBLFFBQ0EsT0FBTyxRQUFRO0FBQUEsTUFDaEI7QUFBQSxJQUNELENBQUM7QUFFRCxTQUFLLGNBQWMsWUFBZ0Q7QUFBQSxNQUNsRSxVQUFVO0FBQUEsSUFDWCxHQUFHLFlBQVUsY0FBYyxLQUFLLE1BQU0sQ0FBQztBQUFBLEVBQ3hDO0FBQUEsRUFuQ0EsSUFBSSxVQUFVO0FBQUUsV0FBTyxLQUFLO0FBQUEsRUFBYTtBQUFBLEVBcUN6QyxPQUFPLFdBQXdCO0FBQzlCLFVBQU0sVUFBVSxJQUFJLEVBQUUsNEJBQTRCO0FBQ2xELGNBQVUsWUFBWSxPQUFPO0FBRTdCLFNBQUssVUFBVSxLQUFLLHNCQUFzQixlQUFlLHVCQUF1QixTQUFTO0FBQUEsTUFDeEYsUUFBUTtBQUFBLE1BQ1IsV0FBVztBQUFBLE1BQ1gsY0FBYztBQUFBLE1BQ2QsT0FBTyxRQUFRLE1BQU0sQ0FBQyxXQUFXO0FBQ2hDLGVBQU8sS0FBSyxZQUFZLEtBQUssTUFBTSxHQUFHO0FBQUEsTUFDdkMsQ0FBQztBQUFBLElBQ0YsQ0FBQyxDQUFDO0FBRUYsU0FBSyxVQUFVLEtBQUssc0JBQXNCLGVBQWUsdUJBQXVCLFNBQVM7QUFBQSxNQUN4RixRQUFRO0FBQUEsTUFDUixXQUFXO0FBQUEsTUFDWCxjQUFjO0FBQUEsTUFDZCxPQUFPLFFBQVEsTUFBTSxDQUFDLFdBQVc7QUFDaEMsZUFBTyxLQUFLLFlBQVksS0FBSyxNQUFNLEdBQUc7QUFBQSxNQUN2QyxDQUFDO0FBQUEsSUFDRixDQUFDLENBQUM7QUFBQSxFQUNIO0FBQ0Q7QUE3RGEsdUJBQU47QUFBQSxFQUtKO0FBQUEsRUFDQTtBQUFBLEdBTlU7IiwKICAibmFtZXMiOiBbXQp9Cg==
