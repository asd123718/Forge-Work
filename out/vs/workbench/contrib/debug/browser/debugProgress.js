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
import { Event } from "../../../../base/common/event.js";
import { dispose } from "../../../../base/common/lifecycle.js";
import { IProgressService, ProgressLocation } from "../../../../platform/progress/common/progress.js";
import { IDebugService, VIEWLET_ID } from "../common/debug.js";
import { IViewsService } from "../../../services/views/common/viewsService.js";
let DebugProgressContribution = class {
  constructor(debugService, progressService, viewsService) {
    this.toDispose = [];
    let progressListener;
    const listenOnProgress = (session) => {
      if (progressListener) {
        progressListener.dispose();
        progressListener = void 0;
      }
      if (session) {
        progressListener = session.onDidProgressStart(async (progressStartEvent) => {
          const promise = new Promise((r) => {
            const listener = Event.any(
              Event.filter(session.onDidProgressEnd, (e) => e.body.progressId === progressStartEvent.body.progressId),
              session.onDidEndAdapter
            )(() => {
              listener.dispose();
              r();
            });
          });
          if (viewsService.isViewContainerVisible(VIEWLET_ID)) {
            progressService.withProgress({ location: VIEWLET_ID }, () => promise);
          }
          const source = debugService.getAdapterManager().getDebuggerLabel(session.configuration.type);
          progressService.withProgress({
            location: ProgressLocation.Notification,
            title: progressStartEvent.body.title,
            cancellable: progressStartEvent.body.cancellable,
            source,
            delay: 500
          }, (progressStep) => {
            let total = 0;
            const reportProgress = (progress) => {
              let increment = void 0;
              if (typeof progress.percentage === "number") {
                increment = progress.percentage - total;
                total += increment;
              }
              progressStep.report({
                message: progress.message,
                increment,
                total: typeof increment === "number" ? 100 : void 0
              });
            };
            if (progressStartEvent.body.message) {
              reportProgress(progressStartEvent.body);
            }
            const progressUpdateListener = session.onDidProgressUpdate((e) => {
              if (e.body.progressId === progressStartEvent.body.progressId) {
                reportProgress(e.body);
              }
            });
            return promise.then(() => progressUpdateListener.dispose());
          }, () => session.cancel(progressStartEvent.body.progressId));
        });
      }
    };
    this.toDispose.push(debugService.getViewModel().onDidFocusSession(listenOnProgress));
    listenOnProgress(debugService.getViewModel().focusedSession);
    this.toDispose.push(debugService.onWillNewSession((session) => {
      if (!progressListener) {
        listenOnProgress(session);
      }
    }));
  }
  dispose() {
    dispose(this.toDispose);
  }
};
DebugProgressContribution = __decorateClass([
  __decorateParam(0, IDebugService),
  __decorateParam(1, IProgressService),
  __decorateParam(2, IViewsService)
], DebugProgressContribution);
export {
  DebugProgressContribution
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXGRlYnVnXFxicm93c2VyXFxkZWJ1Z1Byb2dyZXNzLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IHsgRXZlbnQgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9ldmVudC5qcyc7XG5pbXBvcnQgeyBJRGlzcG9zYWJsZSwgZGlzcG9zZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBJUHJvZ3Jlc3NTZXJ2aWNlLCBQcm9ncmVzc0xvY2F0aW9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vcHJvZ3Jlc3MvY29tbW9uL3Byb2dyZXNzLmpzJztcbmltcG9ydCB7IElXb3JrYmVuY2hDb250cmlidXRpb24gfSBmcm9tICcuLi8uLi8uLi9jb21tb24vY29udHJpYnV0aW9ucy5qcyc7XG5pbXBvcnQgeyBJRGVidWdTZXJ2aWNlLCBJRGVidWdTZXNzaW9uLCBWSUVXTEVUX0lEIH0gZnJvbSAnLi4vY29tbW9uL2RlYnVnLmpzJztcbmltcG9ydCB7IElWaWV3c1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9zZXJ2aWNlcy92aWV3cy9jb21tb24vdmlld3NTZXJ2aWNlLmpzJztcblxuZXhwb3J0IGNsYXNzIERlYnVnUHJvZ3Jlc3NDb250cmlidXRpb24gaW1wbGVtZW50cyBJV29ya2JlbmNoQ29udHJpYnV0aW9uIHtcblxuXHRwcml2YXRlIHRvRGlzcG9zZTogSURpc3Bvc2FibGVbXSA9IFtdO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdEBJRGVidWdTZXJ2aWNlIGRlYnVnU2VydmljZTogSURlYnVnU2VydmljZSxcblx0XHRASVByb2dyZXNzU2VydmljZSBwcm9ncmVzc1NlcnZpY2U6IElQcm9ncmVzc1NlcnZpY2UsXG5cdFx0QElWaWV3c1NlcnZpY2Ugdmlld3NTZXJ2aWNlOiBJVmlld3NTZXJ2aWNlXG5cdCkge1xuXHRcdGxldCBwcm9ncmVzc0xpc3RlbmVyOiBJRGlzcG9zYWJsZSB8IHVuZGVmaW5lZDtcblx0XHRjb25zdCBsaXN0ZW5PblByb2dyZXNzID0gKHNlc3Npb246IElEZWJ1Z1Nlc3Npb24gfCB1bmRlZmluZWQpID0+IHtcblx0XHRcdGlmIChwcm9ncmVzc0xpc3RlbmVyKSB7XG5cdFx0XHRcdHByb2dyZXNzTGlzdGVuZXIuZGlzcG9zZSgpO1xuXHRcdFx0XHRwcm9ncmVzc0xpc3RlbmVyID0gdW5kZWZpbmVkO1xuXHRcdFx0fVxuXHRcdFx0aWYgKHNlc3Npb24pIHtcblx0XHRcdFx0cHJvZ3Jlc3NMaXN0ZW5lciA9IHNlc3Npb24ub25EaWRQcm9ncmVzc1N0YXJ0KGFzeW5jIHByb2dyZXNzU3RhcnRFdmVudCA9PiB7XG5cdFx0XHRcdFx0Y29uc3QgcHJvbWlzZSA9IG5ldyBQcm9taXNlPHZvaWQ+KHIgPT4ge1xuXHRcdFx0XHRcdFx0Ly8gU2hvdyBwcm9ncmVzcyB1bnRpbCBhIHByb2dyZXNzIGVuZCBldmVudCBjb21lcyBvciB0aGUgc2Vzc2lvbiBlbmRzXG5cdFx0XHRcdFx0XHRjb25zdCBsaXN0ZW5lciA9IEV2ZW50LmFueShFdmVudC5maWx0ZXIoc2Vzc2lvbi5vbkRpZFByb2dyZXNzRW5kLCBlID0+IGUuYm9keS5wcm9ncmVzc0lkID09PSBwcm9ncmVzc1N0YXJ0RXZlbnQuYm9keS5wcm9ncmVzc0lkKSxcblx0XHRcdFx0XHRcdFx0c2Vzc2lvbi5vbkRpZEVuZEFkYXB0ZXIpKCgpID0+IHtcblx0XHRcdFx0XHRcdFx0XHRsaXN0ZW5lci5kaXNwb3NlKCk7XG5cdFx0XHRcdFx0XHRcdFx0cigpO1xuXHRcdFx0XHRcdFx0XHR9KTtcblx0XHRcdFx0XHR9KTtcblxuXHRcdFx0XHRcdGlmICh2aWV3c1NlcnZpY2UuaXNWaWV3Q29udGFpbmVyVmlzaWJsZShWSUVXTEVUX0lEKSkge1xuXHRcdFx0XHRcdFx0cHJvZ3Jlc3NTZXJ2aWNlLndpdGhQcm9ncmVzcyh7IGxvY2F0aW9uOiBWSUVXTEVUX0lEIH0sICgpID0+IHByb21pc2UpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRjb25zdCBzb3VyY2UgPSBkZWJ1Z1NlcnZpY2UuZ2V0QWRhcHRlck1hbmFnZXIoKS5nZXREZWJ1Z2dlckxhYmVsKHNlc3Npb24uY29uZmlndXJhdGlvbi50eXBlKTtcblx0XHRcdFx0XHRwcm9ncmVzc1NlcnZpY2Uud2l0aFByb2dyZXNzKHtcblx0XHRcdFx0XHRcdGxvY2F0aW9uOiBQcm9ncmVzc0xvY2F0aW9uLk5vdGlmaWNhdGlvbixcblx0XHRcdFx0XHRcdHRpdGxlOiBwcm9ncmVzc1N0YXJ0RXZlbnQuYm9keS50aXRsZSxcblx0XHRcdFx0XHRcdGNhbmNlbGxhYmxlOiBwcm9ncmVzc1N0YXJ0RXZlbnQuYm9keS5jYW5jZWxsYWJsZSxcblx0XHRcdFx0XHRcdHNvdXJjZSxcblx0XHRcdFx0XHRcdGRlbGF5OiA1MDBcblx0XHRcdFx0XHR9LCBwcm9ncmVzc1N0ZXAgPT4ge1xuXHRcdFx0XHRcdFx0bGV0IHRvdGFsID0gMDtcblx0XHRcdFx0XHRcdGNvbnN0IHJlcG9ydFByb2dyZXNzID0gKHByb2dyZXNzOiB7IG1lc3NhZ2U/OiBzdHJpbmc7IHBlcmNlbnRhZ2U/OiBudW1iZXIgfSkgPT4ge1xuXHRcdFx0XHRcdFx0XHRsZXQgaW5jcmVtZW50ID0gdW5kZWZpbmVkO1xuXHRcdFx0XHRcdFx0XHRpZiAodHlwZW9mIHByb2dyZXNzLnBlcmNlbnRhZ2UgPT09ICdudW1iZXInKSB7XG5cdFx0XHRcdFx0XHRcdFx0aW5jcmVtZW50ID0gcHJvZ3Jlc3MucGVyY2VudGFnZSAtIHRvdGFsO1xuXHRcdFx0XHRcdFx0XHRcdHRvdGFsICs9IGluY3JlbWVudDtcblx0XHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0XHRwcm9ncmVzc1N0ZXAucmVwb3J0KHtcblx0XHRcdFx0XHRcdFx0XHRtZXNzYWdlOiBwcm9ncmVzcy5tZXNzYWdlLFxuXHRcdFx0XHRcdFx0XHRcdGluY3JlbWVudCxcblx0XHRcdFx0XHRcdFx0XHR0b3RhbDogdHlwZW9mIGluY3JlbWVudCA9PT0gJ251bWJlcicgPyAxMDAgOiB1bmRlZmluZWQsXG5cdFx0XHRcdFx0XHRcdH0pO1xuXHRcdFx0XHRcdFx0fTtcblxuXHRcdFx0XHRcdFx0aWYgKHByb2dyZXNzU3RhcnRFdmVudC5ib2R5Lm1lc3NhZ2UpIHtcblx0XHRcdFx0XHRcdFx0cmVwb3J0UHJvZ3Jlc3MocHJvZ3Jlc3NTdGFydEV2ZW50LmJvZHkpO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0Y29uc3QgcHJvZ3Jlc3NVcGRhdGVMaXN0ZW5lciA9IHNlc3Npb24ub25EaWRQcm9ncmVzc1VwZGF0ZShlID0+IHtcblx0XHRcdFx0XHRcdFx0aWYgKGUuYm9keS5wcm9ncmVzc0lkID09PSBwcm9ncmVzc1N0YXJ0RXZlbnQuYm9keS5wcm9ncmVzc0lkKSB7XG5cdFx0XHRcdFx0XHRcdFx0cmVwb3J0UHJvZ3Jlc3MoZS5ib2R5KTtcblx0XHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0fSk7XG5cblx0XHRcdFx0XHRcdHJldHVybiBwcm9taXNlLnRoZW4oKCkgPT4gcHJvZ3Jlc3NVcGRhdGVMaXN0ZW5lci5kaXNwb3NlKCkpO1xuXHRcdFx0XHRcdH0sICgpID0+IHNlc3Npb24uY2FuY2VsKHByb2dyZXNzU3RhcnRFdmVudC5ib2R5LnByb2dyZXNzSWQpKTtcblx0XHRcdFx0fSk7XG5cdFx0XHR9XG5cdFx0fTtcblx0XHR0aGlzLnRvRGlzcG9zZS5wdXNoKGRlYnVnU2VydmljZS5nZXRWaWV3TW9kZWwoKS5vbkRpZEZvY3VzU2Vzc2lvbihsaXN0ZW5PblByb2dyZXNzKSk7XG5cdFx0bGlzdGVuT25Qcm9ncmVzcyhkZWJ1Z1NlcnZpY2UuZ2V0Vmlld01vZGVsKCkuZm9jdXNlZFNlc3Npb24pO1xuXHRcdHRoaXMudG9EaXNwb3NlLnB1c2goZGVidWdTZXJ2aWNlLm9uV2lsbE5ld1Nlc3Npb24oc2Vzc2lvbiA9PiB7XG5cdFx0XHRpZiAoIXByb2dyZXNzTGlzdGVuZXIpIHtcblx0XHRcdFx0bGlzdGVuT25Qcm9ncmVzcyhzZXNzaW9uKTtcblx0XHRcdH1cblx0XHR9KSk7XG5cdH1cblxuXHRkaXNwb3NlKCk6IHZvaWQge1xuXHRcdGRpc3Bvc2UodGhpcy50b0Rpc3Bvc2UpO1xuXHR9XG59XG4iXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7OztBQUtBLFNBQVMsYUFBYTtBQUN0QixTQUFzQixlQUFlO0FBQ3JDLFNBQVMsa0JBQWtCLHdCQUF3QjtBQUVuRCxTQUFTLGVBQThCLGtCQUFrQjtBQUN6RCxTQUFTLHFCQUFxQjtBQUV2QixJQUFNLDRCQUFOLE1BQWtFO0FBQUEsRUFJeEUsWUFDZ0IsY0FDRyxpQkFDSCxjQUNkO0FBTkYsU0FBUSxZQUEyQixDQUFDO0FBT25DLFFBQUk7QUFDSixVQUFNLG1CQUFtQixDQUFDLFlBQXVDO0FBQ2hFLFVBQUksa0JBQWtCO0FBQ3JCLHlCQUFpQixRQUFRO0FBQ3pCLDJCQUFtQjtBQUFBLE1BQ3BCO0FBQ0EsVUFBSSxTQUFTO0FBQ1osMkJBQW1CLFFBQVEsbUJBQW1CLE9BQU0sdUJBQXNCO0FBQ3pFLGdCQUFNLFVBQVUsSUFBSSxRQUFjLE9BQUs7QUFFdEMsa0JBQU0sV0FBVyxNQUFNO0FBQUEsY0FBSSxNQUFNLE9BQU8sUUFBUSxrQkFBa0IsT0FBSyxFQUFFLEtBQUssZUFBZSxtQkFBbUIsS0FBSyxVQUFVO0FBQUEsY0FDOUgsUUFBUTtBQUFBLFlBQWUsRUFBRSxNQUFNO0FBQzlCLHVCQUFTLFFBQVE7QUFDakIsZ0JBQUU7QUFBQSxZQUNILENBQUM7QUFBQSxVQUNILENBQUM7QUFFRCxjQUFJLGFBQWEsdUJBQXVCLFVBQVUsR0FBRztBQUNwRCw0QkFBZ0IsYUFBYSxFQUFFLFVBQVUsV0FBVyxHQUFHLE1BQU0sT0FBTztBQUFBLFVBQ3JFO0FBQ0EsZ0JBQU0sU0FBUyxhQUFhLGtCQUFrQixFQUFFLGlCQUFpQixRQUFRLGNBQWMsSUFBSTtBQUMzRiwwQkFBZ0IsYUFBYTtBQUFBLFlBQzVCLFVBQVUsaUJBQWlCO0FBQUEsWUFDM0IsT0FBTyxtQkFBbUIsS0FBSztBQUFBLFlBQy9CLGFBQWEsbUJBQW1CLEtBQUs7QUFBQSxZQUNyQztBQUFBLFlBQ0EsT0FBTztBQUFBLFVBQ1IsR0FBRyxrQkFBZ0I7QUFDbEIsZ0JBQUksUUFBUTtBQUNaLGtCQUFNLGlCQUFpQixDQUFDLGFBQXdEO0FBQy9FLGtCQUFJLFlBQVk7QUFDaEIsa0JBQUksT0FBTyxTQUFTLGVBQWUsVUFBVTtBQUM1Qyw0QkFBWSxTQUFTLGFBQWE7QUFDbEMseUJBQVM7QUFBQSxjQUNWO0FBQ0EsMkJBQWEsT0FBTztBQUFBLGdCQUNuQixTQUFTLFNBQVM7QUFBQSxnQkFDbEI7QUFBQSxnQkFDQSxPQUFPLE9BQU8sY0FBYyxXQUFXLE1BQU07QUFBQSxjQUM5QyxDQUFDO0FBQUEsWUFDRjtBQUVBLGdCQUFJLG1CQUFtQixLQUFLLFNBQVM7QUFDcEMsNkJBQWUsbUJBQW1CLElBQUk7QUFBQSxZQUN2QztBQUNBLGtCQUFNLHlCQUF5QixRQUFRLG9CQUFvQixPQUFLO0FBQy9ELGtCQUFJLEVBQUUsS0FBSyxlQUFlLG1CQUFtQixLQUFLLFlBQVk7QUFDN0QsK0JBQWUsRUFBRSxJQUFJO0FBQUEsY0FDdEI7QUFBQSxZQUNELENBQUM7QUFFRCxtQkFBTyxRQUFRLEtBQUssTUFBTSx1QkFBdUIsUUFBUSxDQUFDO0FBQUEsVUFDM0QsR0FBRyxNQUFNLFFBQVEsT0FBTyxtQkFBbUIsS0FBSyxVQUFVLENBQUM7QUFBQSxRQUM1RCxDQUFDO0FBQUEsTUFDRjtBQUFBLElBQ0Q7QUFDQSxTQUFLLFVBQVUsS0FBSyxhQUFhLGFBQWEsRUFBRSxrQkFBa0IsZ0JBQWdCLENBQUM7QUFDbkYscUJBQWlCLGFBQWEsYUFBYSxFQUFFLGNBQWM7QUFDM0QsU0FBSyxVQUFVLEtBQUssYUFBYSxpQkFBaUIsYUFBVztBQUM1RCxVQUFJLENBQUMsa0JBQWtCO0FBQ3RCLHlCQUFpQixPQUFPO0FBQUEsTUFDekI7QUFBQSxJQUNELENBQUMsQ0FBQztBQUFBLEVBQ0g7QUFBQSxFQUVBLFVBQWdCO0FBQ2YsWUFBUSxLQUFLLFNBQVM7QUFBQSxFQUN2QjtBQUNEO0FBN0VhLDRCQUFOO0FBQUEsRUFLSjtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsR0FQVTsiLAogICJuYW1lcyI6IFtdCn0K
