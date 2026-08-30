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
import { Disposable, MutableDisposable } from "../../../../base/common/lifecycle.js";
import { localize } from "../../../../nls.js";
import { IMeteredConnectionService } from "../../../../platform/meteredConnection/common/meteredConnection.js";
import { IStatusbarService, StatusbarAlignment } from "../../../services/statusbar/browser/statusbar.js";
let MeteredConnectionStatusContribution = class extends Disposable {
  constructor(meteredConnectionService, statusbarService) {
    super();
    this.meteredConnectionService = meteredConnectionService;
    this.statusbarService = statusbarService;
    this.statusBarEntry = this._register(new MutableDisposable());
    this.updateStatusBarEntry(this.meteredConnectionService.isConnectionMetered);
    this._register(this.meteredConnectionService.onDidChangeIsConnectionMetered((isMetered) => {
      this.updateStatusBarEntry(isMetered);
    }));
  }
  updateStatusBarEntry(isMetered) {
    if (isMetered) {
      if (!this.statusBarEntry.value) {
        this.statusBarEntry.value = this.statusbarService.addEntry(
          this.getStatusBarEntry(),
          MeteredConnectionStatusContribution.ID,
          StatusbarAlignment.RIGHT,
          -Number.MAX_VALUE
          // Show at the far right
        );
      }
    } else {
      this.statusBarEntry.clear();
    }
  }
  getStatusBarEntry() {
    return {
      name: localize("status.meteredConnection", "Metered Connection"),
      text: "$(radio-tower)",
      ariaLabel: localize("status.meteredConnection.ariaLabel", "Metered Connection Enabled"),
      tooltip: localize("status.meteredConnection.tooltip", "Metered connection enabled. Some automatic features like extension updates, Settings Sync, and automatic Git operations are paused to reduce data usage."),
      command: {
        id: "workbench.action.configureMeteredConnection",
        title: localize("status.meteredConnection.configure", "Configure")
      },
      showInAllWindows: true
    };
  }
};
MeteredConnectionStatusContribution.ID = "workbench.contrib.meteredConnectionStatus";
MeteredConnectionStatusContribution = __decorateClass([
  __decorateParam(0, IMeteredConnectionService),
  __decorateParam(1, IStatusbarService)
], MeteredConnectionStatusContribution);
export {
  MeteredConnectionStatusContribution
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXG1ldGVyZWRDb25uZWN0aW9uXFxicm93c2VyXFxtZXRlcmVkQ29ubmVjdGlvblN0YXR1cy50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB7IERpc3Bvc2FibGUsIE11dGFibGVEaXNwb3NhYmxlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IGxvY2FsaXplIH0gZnJvbSAnLi4vLi4vLi4vLi4vbmxzLmpzJztcbmltcG9ydCB7IElNZXRlcmVkQ29ubmVjdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9tZXRlcmVkQ29ubmVjdGlvbi9jb21tb24vbWV0ZXJlZENvbm5lY3Rpb24uanMnO1xuaW1wb3J0IHsgSVN0YXR1c2JhckVudHJ5LCBJU3RhdHVzYmFyRW50cnlBY2Nlc3NvciwgSVN0YXR1c2JhclNlcnZpY2UsIFN0YXR1c2JhckFsaWdubWVudCB9IGZyb20gJy4uLy4uLy4uL3NlcnZpY2VzL3N0YXR1c2Jhci9icm93c2VyL3N0YXR1c2Jhci5qcyc7XG5pbXBvcnQgeyBJV29ya2JlbmNoQ29udHJpYnV0aW9uIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2NvbnRyaWJ1dGlvbnMuanMnO1xuXG5leHBvcnQgY2xhc3MgTWV0ZXJlZENvbm5lY3Rpb25TdGF0dXNDb250cmlidXRpb24gZXh0ZW5kcyBEaXNwb3NhYmxlIGltcGxlbWVudHMgSVdvcmtiZW5jaENvbnRyaWJ1dGlvbiB7XG5cblx0c3RhdGljIHJlYWRvbmx5IElEID0gJ3dvcmtiZW5jaC5jb250cmliLm1ldGVyZWRDb25uZWN0aW9uU3RhdHVzJztcblxuXHRwcml2YXRlIHJlYWRvbmx5IHN0YXR1c0JhckVudHJ5ID0gdGhpcy5fcmVnaXN0ZXIobmV3IE11dGFibGVEaXNwb3NhYmxlPElTdGF0dXNiYXJFbnRyeUFjY2Vzc29yPigpKTtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRASU1ldGVyZWRDb25uZWN0aW9uU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IG1ldGVyZWRDb25uZWN0aW9uU2VydmljZTogSU1ldGVyZWRDb25uZWN0aW9uU2VydmljZSxcblx0XHRASVN0YXR1c2JhclNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBzdGF0dXNiYXJTZXJ2aWNlOiBJU3RhdHVzYmFyU2VydmljZSxcblx0KSB7XG5cdFx0c3VwZXIoKTtcblxuXHRcdHRoaXMudXBkYXRlU3RhdHVzQmFyRW50cnkodGhpcy5tZXRlcmVkQ29ubmVjdGlvblNlcnZpY2UuaXNDb25uZWN0aW9uTWV0ZXJlZCk7XG5cblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLm1ldGVyZWRDb25uZWN0aW9uU2VydmljZS5vbkRpZENoYW5nZUlzQ29ubmVjdGlvbk1ldGVyZWQoaXNNZXRlcmVkID0+IHtcblx0XHRcdHRoaXMudXBkYXRlU3RhdHVzQmFyRW50cnkoaXNNZXRlcmVkKTtcblx0XHR9KSk7XG5cdH1cblxuXHRwcml2YXRlIHVwZGF0ZVN0YXR1c0JhckVudHJ5KGlzTWV0ZXJlZDogYm9vbGVhbik6IHZvaWQge1xuXHRcdGlmIChpc01ldGVyZWQpIHtcblx0XHRcdGlmICghdGhpcy5zdGF0dXNCYXJFbnRyeS52YWx1ZSkge1xuXHRcdFx0XHR0aGlzLnN0YXR1c0JhckVudHJ5LnZhbHVlID0gdGhpcy5zdGF0dXNiYXJTZXJ2aWNlLmFkZEVudHJ5KFxuXHRcdFx0XHRcdHRoaXMuZ2V0U3RhdHVzQmFyRW50cnkoKSxcblx0XHRcdFx0XHRNZXRlcmVkQ29ubmVjdGlvblN0YXR1c0NvbnRyaWJ1dGlvbi5JRCxcblx0XHRcdFx0XHRTdGF0dXNiYXJBbGlnbm1lbnQuUklHSFQsXG5cdFx0XHRcdFx0LU51bWJlci5NQVhfVkFMVUUgLy8gU2hvdyBhdCB0aGUgZmFyIHJpZ2h0XG5cdFx0XHRcdCk7XG5cdFx0XHR9XG5cdFx0fSBlbHNlIHtcblx0XHRcdHRoaXMuc3RhdHVzQmFyRW50cnkuY2xlYXIoKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIGdldFN0YXR1c0JhckVudHJ5KCk6IElTdGF0dXNiYXJFbnRyeSB7XG5cdFx0cmV0dXJuIHtcblx0XHRcdG5hbWU6IGxvY2FsaXplKCdzdGF0dXMubWV0ZXJlZENvbm5lY3Rpb24nLCBcIk1ldGVyZWQgQ29ubmVjdGlvblwiKSxcblx0XHRcdHRleHQ6ICckKHJhZGlvLXRvd2VyKScsXG5cdFx0XHRhcmlhTGFiZWw6IGxvY2FsaXplKCdzdGF0dXMubWV0ZXJlZENvbm5lY3Rpb24uYXJpYUxhYmVsJywgXCJNZXRlcmVkIENvbm5lY3Rpb24gRW5hYmxlZFwiKSxcblx0XHRcdHRvb2x0aXA6IGxvY2FsaXplKCdzdGF0dXMubWV0ZXJlZENvbm5lY3Rpb24udG9vbHRpcCcsIFwiTWV0ZXJlZCBjb25uZWN0aW9uIGVuYWJsZWQuIFNvbWUgYXV0b21hdGljIGZlYXR1cmVzIGxpa2UgZXh0ZW5zaW9uIHVwZGF0ZXMsIFNldHRpbmdzIFN5bmMsIGFuZCBhdXRvbWF0aWMgR2l0IG9wZXJhdGlvbnMgYXJlIHBhdXNlZCB0byByZWR1Y2UgZGF0YSB1c2FnZS5cIiksXG5cdFx0XHRjb21tYW5kOiB7XG5cdFx0XHRcdGlkOiAnd29ya2JlbmNoLmFjdGlvbi5jb25maWd1cmVNZXRlcmVkQ29ubmVjdGlvbicsXG5cdFx0XHRcdHRpdGxlOiBsb2NhbGl6ZSgnc3RhdHVzLm1ldGVyZWRDb25uZWN0aW9uLmNvbmZpZ3VyZScsIFwiQ29uZmlndXJlXCIpXG5cdFx0XHR9LFxuXHRcdFx0c2hvd0luQWxsV2luZG93czogdHJ1ZVxuXHRcdH07XG5cdH1cbn1cbiJdLAogICJtYXBwaW5ncyI6ICI7Ozs7Ozs7Ozs7O0FBS0EsU0FBUyxZQUFZLHlCQUF5QjtBQUM5QyxTQUFTLGdCQUFnQjtBQUN6QixTQUFTLGlDQUFpQztBQUMxQyxTQUFtRCxtQkFBbUIsMEJBQTBCO0FBR3pGLElBQU0sc0NBQU4sY0FBa0QsV0FBNkM7QUFBQSxFQU1yRyxZQUM2QywwQkFDUixrQkFDbkM7QUFDRCxVQUFNO0FBSHNDO0FBQ1I7QUFKckMsU0FBaUIsaUJBQWlCLEtBQUssVUFBVSxJQUFJLGtCQUEyQyxDQUFDO0FBUWhHLFNBQUsscUJBQXFCLEtBQUsseUJBQXlCLG1CQUFtQjtBQUUzRSxTQUFLLFVBQVUsS0FBSyx5QkFBeUIsK0JBQStCLGVBQWE7QUFDeEYsV0FBSyxxQkFBcUIsU0FBUztBQUFBLElBQ3BDLENBQUMsQ0FBQztBQUFBLEVBQ0g7QUFBQSxFQUVRLHFCQUFxQixXQUEwQjtBQUN0RCxRQUFJLFdBQVc7QUFDZCxVQUFJLENBQUMsS0FBSyxlQUFlLE9BQU87QUFDL0IsYUFBSyxlQUFlLFFBQVEsS0FBSyxpQkFBaUI7QUFBQSxVQUNqRCxLQUFLLGtCQUFrQjtBQUFBLFVBQ3ZCLG9DQUFvQztBQUFBLFVBQ3BDLG1CQUFtQjtBQUFBLFVBQ25CLENBQUMsT0FBTztBQUFBO0FBQUEsUUFDVDtBQUFBLE1BQ0Q7QUFBQSxJQUNELE9BQU87QUFDTixXQUFLLGVBQWUsTUFBTTtBQUFBLElBQzNCO0FBQUEsRUFDRDtBQUFBLEVBRVEsb0JBQXFDO0FBQzVDLFdBQU87QUFBQSxNQUNOLE1BQU0sU0FBUyw0QkFBNEIsb0JBQW9CO0FBQUEsTUFDL0QsTUFBTTtBQUFBLE1BQ04sV0FBVyxTQUFTLHNDQUFzQyw0QkFBNEI7QUFBQSxNQUN0RixTQUFTLFNBQVMsb0NBQW9DLDBKQUEwSjtBQUFBLE1BQ2hOLFNBQVM7QUFBQSxRQUNSLElBQUk7QUFBQSxRQUNKLE9BQU8sU0FBUyxzQ0FBc0MsV0FBVztBQUFBLE1BQ2xFO0FBQUEsTUFDQSxrQkFBa0I7QUFBQSxJQUNuQjtBQUFBLEVBQ0Q7QUFDRDtBQS9DYSxvQ0FFSSxLQUFLO0FBRlQsc0NBQU47QUFBQSxFQU9KO0FBQUEsRUFDQTtBQUFBLEdBUlU7IiwKICAibmFtZXMiOiBbXQp9Cg==
