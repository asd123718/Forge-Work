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
import { Sequencer } from "../../../../../base/common/async.js";
import { onUnexpectedError } from "../../../../../base/common/errors.js";
import { Disposable } from "../../../../../base/common/lifecycle.js";
import { autorun } from "../../../../../base/common/observable.js";
import { IContextKeyService } from "../../../../../platform/contextkey/common/contextkey.js";
import { Parts } from "../../../../../workbench/services/layout/browser/layoutService.js";
import { IViewsService } from "../../../../../workbench/services/views/common/viewsService.js";
import { IAgentWorkbenchLayoutService } from "../../../../browser/workbench.js";
import { HasDockedDetailsContext } from "../../../../common/contextkeys.js";
import { ISessionsService } from "../../../../services/sessions/browser/sessionsService.js";
import { CHANGES_VIEW_CONTAINER_ID } from "../../../changes/common/changes.js";
import { SESSIONS_FILES_CONTAINER_ID } from "../../../files/browser/files.contribution.js";
var DetailPanelTarget = /* @__PURE__ */ ((DetailPanelTarget2) => {
  DetailPanelTarget2[DetailPanelTarget2["Hidden"] = 0] = "Hidden";
  DetailPanelTarget2[DetailPanelTarget2["BrowserHidden"] = 1] = "BrowserHidden";
  DetailPanelTarget2[DetailPanelTarget2["Changes"] = 2] = "Changes";
  DetailPanelTarget2[DetailPanelTarget2["ChangesForced"] = 3] = "ChangesForced";
  DetailPanelTarget2[DetailPanelTarget2["Files"] = 4] = "Files";
  DetailPanelTarget2[DetailPanelTarget2["FilesForced"] = 5] = "FilesForced";
  DetailPanelTarget2[DetailPanelTarget2["Preserve"] = 6] = "Preserve";
  return DetailPanelTarget2;
})(DetailPanelTarget || {});
let SinglePaneDetailPanelCoordinator = class extends Disposable {
  constructor(_layoutService, _viewsService, sessionsService, contextKeyService) {
    super();
    this._layoutService = _layoutService;
    this._viewsService = _viewsService;
    this._sequencer = new Sequencer();
    this._generation = 0;
    this._target = 6 /* Preserve */;
    this._hasDockedDetailsContext = HasDockedDetailsContext.bindTo(contextKeyService);
    this._register(this._layoutService.onDidChangePartVisibility((event) => {
      if (event.partId === Parts.AUXILIARYBAR_PART && event.visible) {
        this._queueTarget(this._target);
      }
    }));
    this._register(autorun((reader) => {
      const activeSession = sessionsService.activeSession.read(reader);
      if (!activeSession || !(activeSession.isQuickChat?.read(reader) ?? false) && !activeSession.workspace.read(reader)) {
        this.sync(6 /* Preserve */);
      }
    }));
  }
  /**
   * Publishes the target context and serializes Changes/Files container selection.
   */
  sync(target) {
    this._target = target;
    this._hasDockedDetailsContext.set(target === 2 /* Changes */ || target === 3 /* ChangesForced */ || target === 4 /* Files */ || target === 5 /* FilesForced */);
    this._queueTarget(target);
  }
  _queueTarget(target) {
    const generation = ++this._generation;
    void this._sequencer.queue(() => this._syncTarget(target, generation)).catch(onUnexpectedError);
  }
  async _syncTarget(target, generation) {
    if (generation !== this._generation || !this._layoutService.isVisible(Parts.AUXILIARYBAR_PART)) {
      return;
    }
    switch (target) {
      case 2 /* Changes */:
      case 3 /* ChangesForced */:
        await this._viewsService.openViewContainer(CHANGES_VIEW_CONTAINER_ID, false);
        return;
      case 4 /* Files */:
      case 5 /* FilesForced */:
        await this._viewsService.openViewContainer(SESSIONS_FILES_CONTAINER_ID, false);
        return;
      case 0 /* Hidden */:
      case 1 /* BrowserHidden */:
      case 6 /* Preserve */:
        return;
    }
  }
};
SinglePaneDetailPanelCoordinator = __decorateClass([
  __decorateParam(0, IAgentWorkbenchLayoutService),
  __decorateParam(1, IViewsService),
  __decorateParam(2, ISessionsService),
  __decorateParam(3, IContextKeyService)
], SinglePaneDetailPanelCoordinator);
export {
  DetailPanelTarget,
  SinglePaneDetailPanelCoordinator
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxzZXNzaW9uc1xcY29udHJpYlxcbGF5b3V0XFxicm93c2VyXFxzaW5nbGVQYW5lXFxzaW5nbGVQYW5lRGV0YWlsUGFuZWxDb29yZGluYXRvci50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB7IFNlcXVlbmNlciB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2FzeW5jLmpzJztcbmltcG9ydCB7IG9uVW5leHBlY3RlZEVycm9yIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vZXJyb3JzLmpzJztcbmltcG9ydCB7IERpc3Bvc2FibGUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgYXV0b3J1biB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL29ic2VydmFibGUuanMnO1xuaW1wb3J0IHsgSUNvbnRleHRLZXksIElDb250ZXh0S2V5U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbnRleHRrZXkvY29tbW9uL2NvbnRleHRrZXkuanMnO1xuaW1wb3J0IHsgUGFydHMgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi93b3JrYmVuY2gvc2VydmljZXMvbGF5b3V0L2Jyb3dzZXIvbGF5b3V0U2VydmljZS5qcyc7XG5pbXBvcnQgeyBJVmlld3NTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vd29ya2JlbmNoL3NlcnZpY2VzL3ZpZXdzL2NvbW1vbi92aWV3c1NlcnZpY2UuanMnO1xuaW1wb3J0IHsgSUFnZW50V29ya2JlbmNoTGF5b3V0U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jyb3dzZXIvd29ya2JlbmNoLmpzJztcbmltcG9ydCB7IEhhc0RvY2tlZERldGFpbHNDb250ZXh0IH0gZnJvbSAnLi4vLi4vLi4vLi4vY29tbW9uL2NvbnRleHRrZXlzLmpzJztcbmltcG9ydCB7IElTZXNzaW9uc1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9zZXJ2aWNlcy9zZXNzaW9ucy9icm93c2VyL3Nlc3Npb25zU2VydmljZS5qcyc7XG5pbXBvcnQgeyBDSEFOR0VTX1ZJRVdfQ09OVEFJTkVSX0lEIH0gZnJvbSAnLi4vLi4vLi4vY2hhbmdlcy9jb21tb24vY2hhbmdlcy5qcyc7XG5pbXBvcnQgeyBTRVNTSU9OU19GSUxFU19DT05UQUlORVJfSUQgfSBmcm9tICcuLi8uLi8uLi9maWxlcy9icm93c2VyL2ZpbGVzLmNvbnRyaWJ1dGlvbi5qcyc7XG5cbmV4cG9ydCBjb25zdCBlbnVtIERldGFpbFBhbmVsVGFyZ2V0IHtcblx0SGlkZGVuLFxuXHRCcm93c2VySGlkZGVuLFxuXHRDaGFuZ2VzLFxuXHRDaGFuZ2VzRm9yY2VkLFxuXHRGaWxlcyxcblx0RmlsZXNGb3JjZWQsXG5cdFByZXNlcnZlXG59XG5cbi8qKlxuICogU2hhcmVkIG1lY2hhbmljcyBmb3Igc2VsZWN0aW5nIHRoZSBzaW5nbGUtcGFuZSBkZXRhaWwgY29udGVudC5cbiAqL1xuZXhwb3J0IGNsYXNzIFNpbmdsZVBhbmVEZXRhaWxQYW5lbENvb3JkaW5hdG9yIGV4dGVuZHMgRGlzcG9zYWJsZSB7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfaGFzRG9ja2VkRGV0YWlsc0NvbnRleHQ6IElDb250ZXh0S2V5PGJvb2xlYW4+O1xuXHRwcml2YXRlIHJlYWRvbmx5IF9zZXF1ZW5jZXIgPSBuZXcgU2VxdWVuY2VyKCk7XG5cdHByaXZhdGUgX2dlbmVyYXRpb24gPSAwO1xuXHRwcml2YXRlIF90YXJnZXQgPSBEZXRhaWxQYW5lbFRhcmdldC5QcmVzZXJ2ZTtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRASUFnZW50V29ya2JlbmNoTGF5b3V0U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9sYXlvdXRTZXJ2aWNlOiBJQWdlbnRXb3JrYmVuY2hMYXlvdXRTZXJ2aWNlLFxuXHRcdEBJVmlld3NTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX3ZpZXdzU2VydmljZTogSVZpZXdzU2VydmljZSxcblx0XHRASVNlc3Npb25zU2VydmljZSBzZXNzaW9uc1NlcnZpY2U6IElTZXNzaW9uc1NlcnZpY2UsXG5cdFx0QElDb250ZXh0S2V5U2VydmljZSBjb250ZXh0S2V5U2VydmljZTogSUNvbnRleHRLZXlTZXJ2aWNlLFxuXHQpIHtcblx0XHRzdXBlcigpO1xuXHRcdHRoaXMuX2hhc0RvY2tlZERldGFpbHNDb250ZXh0ID0gSGFzRG9ja2VkRGV0YWlsc0NvbnRleHQuYmluZFRvKGNvbnRleHRLZXlTZXJ2aWNlKTtcblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLl9sYXlvdXRTZXJ2aWNlLm9uRGlkQ2hhbmdlUGFydFZpc2liaWxpdHkoZXZlbnQgPT4ge1xuXHRcdFx0aWYgKGV2ZW50LnBhcnRJZCA9PT0gUGFydHMuQVVYSUxJQVJZQkFSX1BBUlQgJiYgZXZlbnQudmlzaWJsZSkge1xuXHRcdFx0XHR0aGlzLl9xdWV1ZVRhcmdldCh0aGlzLl90YXJnZXQpO1xuXHRcdFx0fVxuXHRcdH0pKTtcblx0XHR0aGlzLl9yZWdpc3RlcihhdXRvcnVuKHJlYWRlciA9PiB7XG5cdFx0XHRjb25zdCBhY3RpdmVTZXNzaW9uID0gc2Vzc2lvbnNTZXJ2aWNlLmFjdGl2ZVNlc3Npb24ucmVhZChyZWFkZXIpO1xuXHRcdFx0aWYgKCFhY3RpdmVTZXNzaW9uIHx8ICghKGFjdGl2ZVNlc3Npb24uaXNRdWlja0NoYXQ/LnJlYWQocmVhZGVyKSA/PyBmYWxzZSkgJiYgIWFjdGl2ZVNlc3Npb24ud29ya3NwYWNlLnJlYWQocmVhZGVyKSkpIHtcblx0XHRcdFx0dGhpcy5zeW5jKERldGFpbFBhbmVsVGFyZ2V0LlByZXNlcnZlKTtcblx0XHRcdH1cblx0XHR9KSk7XG5cdH1cblxuXHQvKipcblx0ICogUHVibGlzaGVzIHRoZSB0YXJnZXQgY29udGV4dCBhbmQgc2VyaWFsaXplcyBDaGFuZ2VzL0ZpbGVzIGNvbnRhaW5lciBzZWxlY3Rpb24uXG5cdCAqL1xuXHRzeW5jKHRhcmdldDogRGV0YWlsUGFuZWxUYXJnZXQpOiB2b2lkIHtcblx0XHR0aGlzLl90YXJnZXQgPSB0YXJnZXQ7XG5cdFx0dGhpcy5faGFzRG9ja2VkRGV0YWlsc0NvbnRleHQuc2V0KHRhcmdldCA9PT0gRGV0YWlsUGFuZWxUYXJnZXQuQ2hhbmdlcyB8fCB0YXJnZXQgPT09IERldGFpbFBhbmVsVGFyZ2V0LkNoYW5nZXNGb3JjZWRcblx0XHRcdHx8IHRhcmdldCA9PT0gRGV0YWlsUGFuZWxUYXJnZXQuRmlsZXMgfHwgdGFyZ2V0ID09PSBEZXRhaWxQYW5lbFRhcmdldC5GaWxlc0ZvcmNlZCk7XG5cdFx0dGhpcy5fcXVldWVUYXJnZXQodGFyZ2V0KTtcblx0fVxuXG5cdHByaXZhdGUgX3F1ZXVlVGFyZ2V0KHRhcmdldDogRGV0YWlsUGFuZWxUYXJnZXQpOiB2b2lkIHtcblx0XHRjb25zdCBnZW5lcmF0aW9uID0gKyt0aGlzLl9nZW5lcmF0aW9uO1xuXHRcdHZvaWQgdGhpcy5fc2VxdWVuY2VyLnF1ZXVlKCgpID0+IHRoaXMuX3N5bmNUYXJnZXQodGFyZ2V0LCBnZW5lcmF0aW9uKSkuY2F0Y2gob25VbmV4cGVjdGVkRXJyb3IpO1xuXHR9XG5cblx0cHJpdmF0ZSBhc3luYyBfc3luY1RhcmdldCh0YXJnZXQ6IERldGFpbFBhbmVsVGFyZ2V0LCBnZW5lcmF0aW9uOiBudW1iZXIpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRpZiAoZ2VuZXJhdGlvbiAhPT0gdGhpcy5fZ2VuZXJhdGlvbiB8fCAhdGhpcy5fbGF5b3V0U2VydmljZS5pc1Zpc2libGUoUGFydHMuQVVYSUxJQVJZQkFSX1BBUlQpKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0c3dpdGNoICh0YXJnZXQpIHtcblx0XHRcdGNhc2UgRGV0YWlsUGFuZWxUYXJnZXQuQ2hhbmdlczpcblx0XHRcdGNhc2UgRGV0YWlsUGFuZWxUYXJnZXQuQ2hhbmdlc0ZvcmNlZDpcblx0XHRcdFx0YXdhaXQgdGhpcy5fdmlld3NTZXJ2aWNlLm9wZW5WaWV3Q29udGFpbmVyKENIQU5HRVNfVklFV19DT05UQUlORVJfSUQsIGZhbHNlKTtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0Y2FzZSBEZXRhaWxQYW5lbFRhcmdldC5GaWxlczpcblx0XHRcdGNhc2UgRGV0YWlsUGFuZWxUYXJnZXQuRmlsZXNGb3JjZWQ6XG5cdFx0XHRcdGF3YWl0IHRoaXMuX3ZpZXdzU2VydmljZS5vcGVuVmlld0NvbnRhaW5lcihTRVNTSU9OU19GSUxFU19DT05UQUlORVJfSUQsIGZhbHNlKTtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0Y2FzZSBEZXRhaWxQYW5lbFRhcmdldC5IaWRkZW46XG5cdFx0XHRjYXNlIERldGFpbFBhbmVsVGFyZ2V0LkJyb3dzZXJIaWRkZW46XG5cdFx0XHRjYXNlIERldGFpbFBhbmVsVGFyZ2V0LlByZXNlcnZlOlxuXHRcdFx0XHRyZXR1cm47XG5cdFx0fVxuXHR9XG59XG4iXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7OztBQUtBLFNBQVMsaUJBQWlCO0FBQzFCLFNBQVMseUJBQXlCO0FBQ2xDLFNBQVMsa0JBQWtCO0FBQzNCLFNBQVMsZUFBZTtBQUN4QixTQUFzQiwwQkFBMEI7QUFDaEQsU0FBUyxhQUFhO0FBQ3RCLFNBQVMscUJBQXFCO0FBQzlCLFNBQVMsb0NBQW9DO0FBQzdDLFNBQVMsK0JBQStCO0FBQ3hDLFNBQVMsd0JBQXdCO0FBQ2pDLFNBQVMsaUNBQWlDO0FBQzFDLFNBQVMsbUNBQW1DO0FBRXJDLElBQVcsb0JBQVgsa0JBQVdBLHVCQUFYO0FBQ04sRUFBQUEsc0NBQUE7QUFDQSxFQUFBQSxzQ0FBQTtBQUNBLEVBQUFBLHNDQUFBO0FBQ0EsRUFBQUEsc0NBQUE7QUFDQSxFQUFBQSxzQ0FBQTtBQUNBLEVBQUFBLHNDQUFBO0FBQ0EsRUFBQUEsc0NBQUE7QUFQaUIsU0FBQUE7QUFBQSxHQUFBO0FBYVgsSUFBTSxtQ0FBTixjQUErQyxXQUFXO0FBQUEsRUFPaEUsWUFDZ0QsZ0JBQ2YsZUFDZCxpQkFDRSxtQkFDbkI7QUFDRCxVQUFNO0FBTHlDO0FBQ2Y7QUFOakMsU0FBaUIsYUFBYSxJQUFJLFVBQVU7QUFDNUMsU0FBUSxjQUFjO0FBQ3RCLFNBQVEsVUFBVTtBQVNqQixTQUFLLDJCQUEyQix3QkFBd0IsT0FBTyxpQkFBaUI7QUFDaEYsU0FBSyxVQUFVLEtBQUssZUFBZSwwQkFBMEIsV0FBUztBQUNyRSxVQUFJLE1BQU0sV0FBVyxNQUFNLHFCQUFxQixNQUFNLFNBQVM7QUFDOUQsYUFBSyxhQUFhLEtBQUssT0FBTztBQUFBLE1BQy9CO0FBQUEsSUFDRCxDQUFDLENBQUM7QUFDRixTQUFLLFVBQVUsUUFBUSxZQUFVO0FBQ2hDLFlBQU0sZ0JBQWdCLGdCQUFnQixjQUFjLEtBQUssTUFBTTtBQUMvRCxVQUFJLENBQUMsaUJBQWtCLEVBQUUsY0FBYyxhQUFhLEtBQUssTUFBTSxLQUFLLFVBQVUsQ0FBQyxjQUFjLFVBQVUsS0FBSyxNQUFNLEdBQUk7QUFDckgsYUFBSyxLQUFLLGdCQUEwQjtBQUFBLE1BQ3JDO0FBQUEsSUFDRCxDQUFDLENBQUM7QUFBQSxFQUNIO0FBQUE7QUFBQTtBQUFBO0FBQUEsRUFLQSxLQUFLLFFBQWlDO0FBQ3JDLFNBQUssVUFBVTtBQUNmLFNBQUsseUJBQXlCLElBQUksV0FBVyxtQkFBNkIsV0FBVyx5QkFDakYsV0FBVyxpQkFBMkIsV0FBVyxtQkFBNkI7QUFDbEYsU0FBSyxhQUFhLE1BQU07QUFBQSxFQUN6QjtBQUFBLEVBRVEsYUFBYSxRQUFpQztBQUNyRCxVQUFNLGFBQWEsRUFBRSxLQUFLO0FBQzFCLFNBQUssS0FBSyxXQUFXLE1BQU0sTUFBTSxLQUFLLFlBQVksUUFBUSxVQUFVLENBQUMsRUFBRSxNQUFNLGlCQUFpQjtBQUFBLEVBQy9GO0FBQUEsRUFFQSxNQUFjLFlBQVksUUFBMkIsWUFBbUM7QUFDdkYsUUFBSSxlQUFlLEtBQUssZUFBZSxDQUFDLEtBQUssZUFBZSxVQUFVLE1BQU0saUJBQWlCLEdBQUc7QUFDL0Y7QUFBQSxJQUNEO0FBRUEsWUFBUSxRQUFRO0FBQUEsTUFDZixLQUFLO0FBQUEsTUFDTCxLQUFLO0FBQ0osY0FBTSxLQUFLLGNBQWMsa0JBQWtCLDJCQUEyQixLQUFLO0FBQzNFO0FBQUEsTUFDRCxLQUFLO0FBQUEsTUFDTCxLQUFLO0FBQ0osY0FBTSxLQUFLLGNBQWMsa0JBQWtCLDZCQUE2QixLQUFLO0FBQzdFO0FBQUEsTUFDRCxLQUFLO0FBQUEsTUFDTCxLQUFLO0FBQUEsTUFDTCxLQUFLO0FBQ0o7QUFBQSxJQUNGO0FBQUEsRUFDRDtBQUNEO0FBL0RhLG1DQUFOO0FBQUEsRUFRSjtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEdBWFU7IiwKICAibmFtZXMiOiBbIkRldGFpbFBhbmVsVGFyZ2V0Il0KfQo=
