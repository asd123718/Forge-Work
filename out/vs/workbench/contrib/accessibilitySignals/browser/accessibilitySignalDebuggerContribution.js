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
import { Disposable, toDisposable } from "../../../../base/common/lifecycle.js";
import { autorunWithStore, observableFromEvent } from "../../../../base/common/observable.js";
import { IAccessibilitySignalService, AccessibilitySignal } from "../../../../platform/accessibilitySignal/browser/accessibilitySignalService.js";
import { IDebugService } from "../../debug/common/debug.js";
let AccessibilitySignalLineDebuggerContribution = class extends Disposable {
  constructor(debugService, accessibilitySignalService) {
    super();
    this.accessibilitySignalService = accessibilitySignalService;
    const isEnabled = observableFromEvent(
      this,
      accessibilitySignalService.onSoundEnabledChanged(AccessibilitySignal.onDebugBreak),
      () => accessibilitySignalService.isSoundEnabled(AccessibilitySignal.onDebugBreak)
    );
    this._register(autorunWithStore((reader, store) => {
      if (!isEnabled.read(reader)) {
        return;
      }
      const sessionDisposables = /* @__PURE__ */ new Map();
      store.add(toDisposable(() => {
        sessionDisposables.forEach((d) => d.dispose());
        sessionDisposables.clear();
      }));
      store.add(
        debugService.onDidNewSession(
          (session) => sessionDisposables.set(session, this.handleSession(session))
        )
      );
      store.add(debugService.onDidEndSession(({ session }) => {
        sessionDisposables.get(session)?.dispose();
        sessionDisposables.delete(session);
      }));
      debugService.getModel().getSessions().forEach(
        (session) => sessionDisposables.set(session, this.handleSession(session))
      );
    }));
  }
  handleSession(session) {
    return session.onDidChangeState((e) => {
      const stoppedDetails = session.getStoppedDetails();
      const BREAKPOINT_STOP_REASON = "breakpoint";
      if (stoppedDetails && stoppedDetails.reason === BREAKPOINT_STOP_REASON) {
        this.accessibilitySignalService.playSignal(AccessibilitySignal.onDebugBreak);
      }
    });
  }
};
AccessibilitySignalLineDebuggerContribution = __decorateClass([
  __decorateParam(0, IDebugService),
  __decorateParam(1, IAccessibilitySignalService)
], AccessibilitySignalLineDebuggerContribution);
export {
  AccessibilitySignalLineDebuggerContribution
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXGFjY2Vzc2liaWxpdHlTaWduYWxzXFxicm93c2VyXFxhY2Nlc3NpYmlsaXR5U2lnbmFsRGVidWdnZXJDb250cmlidXRpb24udHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgeyBEaXNwb3NhYmxlLCBJRGlzcG9zYWJsZSwgdG9EaXNwb3NhYmxlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IGF1dG9ydW5XaXRoU3RvcmUsIG9ic2VydmFibGVGcm9tRXZlbnQgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9vYnNlcnZhYmxlLmpzJztcbmltcG9ydCB7IElBY2Nlc3NpYmlsaXR5U2lnbmFsU2VydmljZSwgQWNjZXNzaWJpbGl0eVNpZ25hbCwgQWNjZXNzaWJpbGl0eVNpZ25hbFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9hY2Nlc3NpYmlsaXR5U2lnbmFsL2Jyb3dzZXIvYWNjZXNzaWJpbGl0eVNpZ25hbFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSVdvcmtiZW5jaENvbnRyaWJ1dGlvbiB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9jb250cmlidXRpb25zLmpzJztcbmltcG9ydCB7IElEZWJ1Z1NlcnZpY2UsIElEZWJ1Z1Nlc3Npb24gfSBmcm9tICcuLi8uLi9kZWJ1Zy9jb21tb24vZGVidWcuanMnO1xuXG5leHBvcnQgY2xhc3MgQWNjZXNzaWJpbGl0eVNpZ25hbExpbmVEZWJ1Z2dlckNvbnRyaWJ1dGlvblxuXHRleHRlbmRzIERpc3Bvc2FibGVcblx0aW1wbGVtZW50cyBJV29ya2JlbmNoQ29udHJpYnV0aW9uIHtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRASURlYnVnU2VydmljZSBkZWJ1Z1NlcnZpY2U6IElEZWJ1Z1NlcnZpY2UsXG5cdFx0QElBY2Nlc3NpYmlsaXR5U2lnbmFsU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGFjY2Vzc2liaWxpdHlTaWduYWxTZXJ2aWNlOiBBY2Nlc3NpYmlsaXR5U2lnbmFsU2VydmljZSxcblx0KSB7XG5cdFx0c3VwZXIoKTtcblxuXHRcdGNvbnN0IGlzRW5hYmxlZCA9IG9ic2VydmFibGVGcm9tRXZlbnQodGhpcyxcblx0XHRcdGFjY2Vzc2liaWxpdHlTaWduYWxTZXJ2aWNlLm9uU291bmRFbmFibGVkQ2hhbmdlZChBY2Nlc3NpYmlsaXR5U2lnbmFsLm9uRGVidWdCcmVhayksXG5cdFx0XHQoKSA9PiBhY2Nlc3NpYmlsaXR5U2lnbmFsU2VydmljZS5pc1NvdW5kRW5hYmxlZChBY2Nlc3NpYmlsaXR5U2lnbmFsLm9uRGVidWdCcmVhaylcblx0XHQpO1xuXHRcdHRoaXMuX3JlZ2lzdGVyKGF1dG9ydW5XaXRoU3RvcmUoKHJlYWRlciwgc3RvcmUpID0+IHtcblx0XHRcdC8qKiBAZGVzY3JpcHRpb24gc3Vic2NyaWJlIHRvIGRlYnVnIHNlc3Npb25zICovXG5cdFx0XHRpZiAoIWlzRW5hYmxlZC5yZWFkKHJlYWRlcikpIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXG5cdFx0XHRjb25zdCBzZXNzaW9uRGlzcG9zYWJsZXMgPSBuZXcgTWFwPElEZWJ1Z1Nlc3Npb24sIElEaXNwb3NhYmxlPigpO1xuXHRcdFx0c3RvcmUuYWRkKHRvRGlzcG9zYWJsZSgoKSA9PiB7XG5cdFx0XHRcdHNlc3Npb25EaXNwb3NhYmxlcy5mb3JFYWNoKGQgPT4gZC5kaXNwb3NlKCkpO1xuXHRcdFx0XHRzZXNzaW9uRGlzcG9zYWJsZXMuY2xlYXIoKTtcblx0XHRcdH0pKTtcblxuXHRcdFx0c3RvcmUuYWRkKFxuXHRcdFx0XHRkZWJ1Z1NlcnZpY2Uub25EaWROZXdTZXNzaW9uKChzZXNzaW9uKSA9PlxuXHRcdFx0XHRcdHNlc3Npb25EaXNwb3NhYmxlcy5zZXQoc2Vzc2lvbiwgdGhpcy5oYW5kbGVTZXNzaW9uKHNlc3Npb24pKVxuXHRcdFx0XHQpXG5cdFx0XHQpO1xuXG5cdFx0XHRzdG9yZS5hZGQoZGVidWdTZXJ2aWNlLm9uRGlkRW5kU2Vzc2lvbigoeyBzZXNzaW9uIH0pID0+IHtcblx0XHRcdFx0c2Vzc2lvbkRpc3Bvc2FibGVzLmdldChzZXNzaW9uKT8uZGlzcG9zZSgpO1xuXHRcdFx0XHRzZXNzaW9uRGlzcG9zYWJsZXMuZGVsZXRlKHNlc3Npb24pO1xuXHRcdFx0fSkpO1xuXG5cdFx0XHRkZWJ1Z1NlcnZpY2Vcblx0XHRcdFx0LmdldE1vZGVsKClcblx0XHRcdFx0LmdldFNlc3Npb25zKClcblx0XHRcdFx0LmZvckVhY2goKHNlc3Npb24pID0+XG5cdFx0XHRcdFx0c2Vzc2lvbkRpc3Bvc2FibGVzLnNldChzZXNzaW9uLCB0aGlzLmhhbmRsZVNlc3Npb24oc2Vzc2lvbikpXG5cdFx0XHRcdCk7XG5cdFx0fSkpO1xuXHR9XG5cblx0cHJpdmF0ZSBoYW5kbGVTZXNzaW9uKHNlc3Npb246IElEZWJ1Z1Nlc3Npb24pOiBJRGlzcG9zYWJsZSB7XG5cdFx0cmV0dXJuIHNlc3Npb24ub25EaWRDaGFuZ2VTdGF0ZShlID0+IHtcblx0XHRcdGNvbnN0IHN0b3BwZWREZXRhaWxzID0gc2Vzc2lvbi5nZXRTdG9wcGVkRGV0YWlscygpO1xuXHRcdFx0Y29uc3QgQlJFQUtQT0lOVF9TVE9QX1JFQVNPTiA9ICdicmVha3BvaW50Jztcblx0XHRcdGlmIChzdG9wcGVkRGV0YWlscyAmJiBzdG9wcGVkRGV0YWlscy5yZWFzb24gPT09IEJSRUFLUE9JTlRfU1RPUF9SRUFTT04pIHtcblx0XHRcdFx0dGhpcy5hY2Nlc3NpYmlsaXR5U2lnbmFsU2VydmljZS5wbGF5U2lnbmFsKEFjY2Vzc2liaWxpdHlTaWduYWwub25EZWJ1Z0JyZWFrKTtcblx0XHRcdH1cblx0XHR9KTtcblx0fVxufVxuIl0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7Ozs7QUFLQSxTQUFTLFlBQXlCLG9CQUFvQjtBQUN0RCxTQUFTLGtCQUFrQiwyQkFBMkI7QUFDdEQsU0FBUyw2QkFBNkIsMkJBQXVEO0FBRTdGLFNBQVMscUJBQW9DO0FBRXRDLElBQU0sOENBQU4sY0FDRSxXQUMwQjtBQUFBLEVBRWxDLFlBQ2dCLGNBQytCLDRCQUM3QztBQUNELFVBQU07QUFGd0M7QUFJOUMsVUFBTSxZQUFZO0FBQUEsTUFBb0I7QUFBQSxNQUNyQywyQkFBMkIsc0JBQXNCLG9CQUFvQixZQUFZO0FBQUEsTUFDakYsTUFBTSwyQkFBMkIsZUFBZSxvQkFBb0IsWUFBWTtBQUFBLElBQ2pGO0FBQ0EsU0FBSyxVQUFVLGlCQUFpQixDQUFDLFFBQVEsVUFBVTtBQUVsRCxVQUFJLENBQUMsVUFBVSxLQUFLLE1BQU0sR0FBRztBQUM1QjtBQUFBLE1BQ0Q7QUFFQSxZQUFNLHFCQUFxQixvQkFBSSxJQUFnQztBQUMvRCxZQUFNLElBQUksYUFBYSxNQUFNO0FBQzVCLDJCQUFtQixRQUFRLE9BQUssRUFBRSxRQUFRLENBQUM7QUFDM0MsMkJBQW1CLE1BQU07QUFBQSxNQUMxQixDQUFDLENBQUM7QUFFRixZQUFNO0FBQUEsUUFDTCxhQUFhO0FBQUEsVUFBZ0IsQ0FBQyxZQUM3QixtQkFBbUIsSUFBSSxTQUFTLEtBQUssY0FBYyxPQUFPLENBQUM7QUFBQSxRQUM1RDtBQUFBLE1BQ0Q7QUFFQSxZQUFNLElBQUksYUFBYSxnQkFBZ0IsQ0FBQyxFQUFFLFFBQVEsTUFBTTtBQUN2RCwyQkFBbUIsSUFBSSxPQUFPLEdBQUcsUUFBUTtBQUN6QywyQkFBbUIsT0FBTyxPQUFPO0FBQUEsTUFDbEMsQ0FBQyxDQUFDO0FBRUYsbUJBQ0UsU0FBUyxFQUNULFlBQVksRUFDWjtBQUFBLFFBQVEsQ0FBQyxZQUNULG1CQUFtQixJQUFJLFNBQVMsS0FBSyxjQUFjLE9BQU8sQ0FBQztBQUFBLE1BQzVEO0FBQUEsSUFDRixDQUFDLENBQUM7QUFBQSxFQUNIO0FBQUEsRUFFUSxjQUFjLFNBQXFDO0FBQzFELFdBQU8sUUFBUSxpQkFBaUIsT0FBSztBQUNwQyxZQUFNLGlCQUFpQixRQUFRLGtCQUFrQjtBQUNqRCxZQUFNLHlCQUF5QjtBQUMvQixVQUFJLGtCQUFrQixlQUFlLFdBQVcsd0JBQXdCO0FBQ3ZFLGFBQUssMkJBQTJCLFdBQVcsb0JBQW9CLFlBQVk7QUFBQSxNQUM1RTtBQUFBLElBQ0QsQ0FBQztBQUFBLEVBQ0Y7QUFDRDtBQXZEYSw4Q0FBTjtBQUFBLEVBS0o7QUFBQSxFQUNBO0FBQUEsR0FOVTsiLAogICJuYW1lcyI6IFtdCn0K
