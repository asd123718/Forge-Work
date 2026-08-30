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
import { Extensions as WorkbenchExtensions } from "../../../common/contributions.js";
import { IMarkerService, MarkerSeverity } from "../../../../platform/markers/common/markers.js";
import { IDecorationsService } from "../../../services/decorations/common/decorations.js";
import { dispose } from "../../../../base/common/lifecycle.js";
import { localize } from "../../../../nls.js";
import { Registry } from "../../../../platform/registry/common/platform.js";
import { listErrorForeground, listWarningForeground } from "../../../../platform/theme/common/colorRegistry.js";
import { IConfigurationService } from "../../../../platform/configuration/common/configuration.js";
import { Extensions as ConfigurationExtensions } from "../../../../platform/configuration/common/configurationRegistry.js";
import { LifecyclePhase } from "../../../services/lifecycle/common/lifecycle.js";
class MarkersDecorationsProvider {
  constructor(_markerService) {
    this._markerService = _markerService;
    this.label = localize("label", "Problems");
    this.onDidChange = _markerService.onMarkerChanged;
  }
  provideDecorations(resource) {
    const markers = this._markerService.read({
      resource,
      severities: MarkerSeverity.Error | MarkerSeverity.Warning
    });
    let first;
    for (const marker of markers) {
      if (!first || marker.severity > first.severity) {
        first = marker;
      }
    }
    if (!first) {
      return void 0;
    }
    return {
      weight: 100 * first.severity,
      bubble: true,
      tooltip: markers.length === 1 ? localize("tooltip.1", "1 problem in this file") : localize("tooltip.N", "{0} problems in this file", markers.length),
      letter: markers.length < 10 ? markers.length.toString() : "9+",
      color: first.severity === MarkerSeverity.Error ? listErrorForeground : listWarningForeground
    };
  }
}
let MarkersFileDecorations = class {
  constructor(_markerService, _decorationsService, _configurationService) {
    this._markerService = _markerService;
    this._decorationsService = _decorationsService;
    this._configurationService = _configurationService;
    this._disposables = [
      this._configurationService.onDidChangeConfiguration((e) => {
        if (e.affectsConfiguration("problems.visibility")) {
          this._updateEnablement();
        }
      })
    ];
    this._updateEnablement();
  }
  dispose() {
    dispose(this._provider);
    dispose(this._disposables);
  }
  _updateEnablement() {
    const problem = this._configurationService.getValue("problems.visibility");
    if (problem === void 0) {
      return;
    }
    const value = this._configurationService.getValue("problems");
    const shouldEnable = problem && value.decorations.enabled;
    if (shouldEnable === this._enabled) {
      if (!problem || !value.decorations.enabled) {
        this._provider?.dispose();
        this._provider = void 0;
      }
      return;
    }
    this._enabled = shouldEnable;
    if (this._enabled) {
      const provider = new MarkersDecorationsProvider(this._markerService);
      this._provider = this._decorationsService.registerDecorationsProvider(provider);
    } else if (this._provider) {
      this._provider.dispose();
    }
  }
};
MarkersFileDecorations = __decorateClass([
  __decorateParam(0, IMarkerService),
  __decorateParam(1, IDecorationsService),
  __decorateParam(2, IConfigurationService)
], MarkersFileDecorations);
Registry.as(ConfigurationExtensions.Configuration).registerConfiguration({
  "id": "problems",
  "order": 101,
  "type": "object",
  "properties": {
    "problems.decorations.enabled": {
      "markdownDescription": localize("markers.showOnFile", "Show Errors & Warnings on files and folder. Overwritten by {0} when it is off.", "`#problems.visibility#`"),
      "type": "boolean",
      "default": true
    }
  }
});
Registry.as(WorkbenchExtensions.Workbench).registerWorkbenchContribution(MarkersFileDecorations, LifecyclePhase.Restored);
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXG1hcmtlcnNcXGJyb3dzZXJcXG1hcmtlcnNGaWxlRGVjb3JhdGlvbnMudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgeyBJV29ya2JlbmNoQ29udHJpYnV0aW9uLCBJV29ya2JlbmNoQ29udHJpYnV0aW9uc1JlZ2lzdHJ5LCBFeHRlbnNpb25zIGFzIFdvcmtiZW5jaEV4dGVuc2lvbnMgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vY29udHJpYnV0aW9ucy5qcyc7XG5pbXBvcnQgeyBJTWFya2VyU2VydmljZSwgSU1hcmtlciwgTWFya2VyU2V2ZXJpdHkgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9tYXJrZXJzL2NvbW1vbi9tYXJrZXJzLmpzJztcbmltcG9ydCB7IElEZWNvcmF0aW9uc1NlcnZpY2UsIElEZWNvcmF0aW9uc1Byb3ZpZGVyLCBJRGVjb3JhdGlvbkRhdGEgfSBmcm9tICcuLi8uLi8uLi9zZXJ2aWNlcy9kZWNvcmF0aW9ucy9jb21tb24vZGVjb3JhdGlvbnMuanMnO1xuaW1wb3J0IHsgSURpc3Bvc2FibGUsIGRpc3Bvc2UgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgVVJJIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdXJpLmpzJztcbmltcG9ydCB7IEV2ZW50IH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vZXZlbnQuanMnO1xuaW1wb3J0IHsgbG9jYWxpemUgfSBmcm9tICcuLi8uLi8uLi8uLi9ubHMuanMnO1xuaW1wb3J0IHsgUmVnaXN0cnkgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9yZWdpc3RyeS9jb21tb24vcGxhdGZvcm0uanMnO1xuaW1wb3J0IHsgbGlzdEVycm9yRm9yZWdyb3VuZCwgbGlzdFdhcm5pbmdGb3JlZ3JvdW5kIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vdGhlbWUvY29tbW9uL2NvbG9yUmVnaXN0cnkuanMnO1xuaW1wb3J0IHsgSUNvbmZpZ3VyYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29uZmlndXJhdGlvbi9jb21tb24vY29uZmlndXJhdGlvbi5qcyc7XG5pbXBvcnQgeyBJQ29uZmlndXJhdGlvblJlZ2lzdHJ5LCBFeHRlbnNpb25zIGFzIENvbmZpZ3VyYXRpb25FeHRlbnNpb25zIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29uZmlndXJhdGlvbi9jb21tb24vY29uZmlndXJhdGlvblJlZ2lzdHJ5LmpzJztcbmltcG9ydCB7IExpZmVjeWNsZVBoYXNlIH0gZnJvbSAnLi4vLi4vLi4vc2VydmljZXMvbGlmZWN5Y2xlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuXG5jbGFzcyBNYXJrZXJzRGVjb3JhdGlvbnNQcm92aWRlciBpbXBsZW1lbnRzIElEZWNvcmF0aW9uc1Byb3ZpZGVyIHtcblxuXHRyZWFkb25seSBsYWJlbDogc3RyaW5nID0gbG9jYWxpemUoJ2xhYmVsJywgXCJQcm9ibGVtc1wiKTtcblx0cmVhZG9ubHkgb25EaWRDaGFuZ2U6IEV2ZW50PHJlYWRvbmx5IFVSSVtdPjtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRwcml2YXRlIHJlYWRvbmx5IF9tYXJrZXJTZXJ2aWNlOiBJTWFya2VyU2VydmljZVxuXHQpIHtcblx0XHR0aGlzLm9uRGlkQ2hhbmdlID0gX21hcmtlclNlcnZpY2Uub25NYXJrZXJDaGFuZ2VkO1xuXHR9XG5cblx0cHJvdmlkZURlY29yYXRpb25zKHJlc291cmNlOiBVUkkpOiBJRGVjb3JhdGlvbkRhdGEgfCB1bmRlZmluZWQge1xuXHRcdGNvbnN0IG1hcmtlcnMgPSB0aGlzLl9tYXJrZXJTZXJ2aWNlLnJlYWQoe1xuXHRcdFx0cmVzb3VyY2UsXG5cdFx0XHRzZXZlcml0aWVzOiBNYXJrZXJTZXZlcml0eS5FcnJvciB8IE1hcmtlclNldmVyaXR5Lldhcm5pbmdcblx0XHR9KTtcblx0XHRsZXQgZmlyc3Q6IElNYXJrZXIgfCB1bmRlZmluZWQ7XG5cdFx0Zm9yIChjb25zdCBtYXJrZXIgb2YgbWFya2Vycykge1xuXHRcdFx0aWYgKCFmaXJzdCB8fCBtYXJrZXIuc2V2ZXJpdHkgPiBmaXJzdC5zZXZlcml0eSkge1xuXHRcdFx0XHRmaXJzdCA9IG1hcmtlcjtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRpZiAoIWZpcnN0KSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblxuXHRcdHJldHVybiB7XG5cdFx0XHR3ZWlnaHQ6IDEwMCAqIGZpcnN0LnNldmVyaXR5LFxuXHRcdFx0YnViYmxlOiB0cnVlLFxuXHRcdFx0dG9vbHRpcDogbWFya2Vycy5sZW5ndGggPT09IDEgPyBsb2NhbGl6ZSgndG9vbHRpcC4xJywgXCIxIHByb2JsZW0gaW4gdGhpcyBmaWxlXCIpIDogbG9jYWxpemUoJ3Rvb2x0aXAuTicsIFwiezB9IHByb2JsZW1zIGluIHRoaXMgZmlsZVwiLCBtYXJrZXJzLmxlbmd0aCksXG5cdFx0XHRsZXR0ZXI6IG1hcmtlcnMubGVuZ3RoIDwgMTAgPyBtYXJrZXJzLmxlbmd0aC50b1N0cmluZygpIDogJzkrJyxcblx0XHRcdGNvbG9yOiBmaXJzdC5zZXZlcml0eSA9PT0gTWFya2VyU2V2ZXJpdHkuRXJyb3IgPyBsaXN0RXJyb3JGb3JlZ3JvdW5kIDogbGlzdFdhcm5pbmdGb3JlZ3JvdW5kLFxuXHRcdH07XG5cdH1cbn1cblxuY2xhc3MgTWFya2Vyc0ZpbGVEZWNvcmF0aW9ucyBpbXBsZW1lbnRzIElXb3JrYmVuY2hDb250cmlidXRpb24ge1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX2Rpc3Bvc2FibGVzOiBJRGlzcG9zYWJsZVtdO1xuXHRwcml2YXRlIF9wcm92aWRlcj86IElEaXNwb3NhYmxlO1xuXHRwcml2YXRlIF9lbmFibGVkPzogYm9vbGVhbjtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRASU1hcmtlclNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfbWFya2VyU2VydmljZTogSU1hcmtlclNlcnZpY2UsXG5cdFx0QElEZWNvcmF0aW9uc1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfZGVjb3JhdGlvbnNTZXJ2aWNlOiBJRGVjb3JhdGlvbnNTZXJ2aWNlLFxuXHRcdEBJQ29uZmlndXJhdGlvblNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfY29uZmlndXJhdGlvblNlcnZpY2U6IElDb25maWd1cmF0aW9uU2VydmljZVxuXHQpIHtcblx0XHR0aGlzLl9kaXNwb3NhYmxlcyA9IFtcblx0XHRcdHRoaXMuX2NvbmZpZ3VyYXRpb25TZXJ2aWNlLm9uRGlkQ2hhbmdlQ29uZmlndXJhdGlvbihlID0+IHtcblx0XHRcdFx0aWYgKGUuYWZmZWN0c0NvbmZpZ3VyYXRpb24oJ3Byb2JsZW1zLnZpc2liaWxpdHknKSkge1xuXHRcdFx0XHRcdHRoaXMuX3VwZGF0ZUVuYWJsZW1lbnQoKTtcblx0XHRcdFx0fVxuXHRcdFx0fSksXG5cdFx0XTtcblx0XHR0aGlzLl91cGRhdGVFbmFibGVtZW50KCk7XG5cdH1cblxuXHRkaXNwb3NlKCk6IHZvaWQge1xuXHRcdGRpc3Bvc2UodGhpcy5fcHJvdmlkZXIpO1xuXHRcdGRpc3Bvc2UodGhpcy5fZGlzcG9zYWJsZXMpO1xuXHR9XG5cblx0cHJpdmF0ZSBfdXBkYXRlRW5hYmxlbWVudCgpOiB2b2lkIHtcblx0XHRjb25zdCBwcm9ibGVtID0gdGhpcy5fY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0VmFsdWUoJ3Byb2JsZW1zLnZpc2liaWxpdHknKTtcblx0XHRpZiAocHJvYmxlbSA9PT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGNvbnN0IHZhbHVlID0gdGhpcy5fY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0VmFsdWU8eyBkZWNvcmF0aW9uczogeyBlbmFibGVkOiBib29sZWFuIH0gfT4oJ3Byb2JsZW1zJyk7XG5cdFx0Y29uc3Qgc2hvdWxkRW5hYmxlID0gKHByb2JsZW0gJiYgdmFsdWUuZGVjb3JhdGlvbnMuZW5hYmxlZCk7XG5cblx0XHRpZiAoc2hvdWxkRW5hYmxlID09PSB0aGlzLl9lbmFibGVkKSB7XG5cdFx0XHRpZiAoIXByb2JsZW0gfHwgIXZhbHVlLmRlY29yYXRpb25zLmVuYWJsZWQpIHtcblx0XHRcdFx0dGhpcy5fcHJvdmlkZXI/LmRpc3Bvc2UoKTtcblx0XHRcdFx0dGhpcy5fcHJvdmlkZXIgPSB1bmRlZmluZWQ7XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0dGhpcy5fZW5hYmxlZCA9IHNob3VsZEVuYWJsZSBhcyBib29sZWFuO1xuXHRcdGlmICh0aGlzLl9lbmFibGVkKSB7XG5cdFx0XHRjb25zdCBwcm92aWRlciA9IG5ldyBNYXJrZXJzRGVjb3JhdGlvbnNQcm92aWRlcih0aGlzLl9tYXJrZXJTZXJ2aWNlKTtcblx0XHRcdHRoaXMuX3Byb3ZpZGVyID0gdGhpcy5fZGVjb3JhdGlvbnNTZXJ2aWNlLnJlZ2lzdGVyRGVjb3JhdGlvbnNQcm92aWRlcihwcm92aWRlcik7XG5cdFx0fSBlbHNlIGlmICh0aGlzLl9wcm92aWRlcikge1xuXHRcdFx0dGhpcy5fcHJvdmlkZXIuZGlzcG9zZSgpO1xuXHRcdH1cblx0fVxufVxuXG5SZWdpc3RyeS5hczxJQ29uZmlndXJhdGlvblJlZ2lzdHJ5PihDb25maWd1cmF0aW9uRXh0ZW5zaW9ucy5Db25maWd1cmF0aW9uKS5yZWdpc3RlckNvbmZpZ3VyYXRpb24oe1xuXHQnaWQnOiAncHJvYmxlbXMnLFxuXHQnb3JkZXInOiAxMDEsXG5cdCd0eXBlJzogJ29iamVjdCcsXG5cdCdwcm9wZXJ0aWVzJzoge1xuXHRcdCdwcm9ibGVtcy5kZWNvcmF0aW9ucy5lbmFibGVkJzoge1xuXHRcdFx0J21hcmtkb3duRGVzY3JpcHRpb24nOiBsb2NhbGl6ZSgnbWFya2Vycy5zaG93T25GaWxlJywgXCJTaG93IEVycm9ycyAmIFdhcm5pbmdzIG9uIGZpbGVzIGFuZCBmb2xkZXIuIE92ZXJ3cml0dGVuIGJ5IHswfSB3aGVuIGl0IGlzIG9mZi5cIiwgJ2AjcHJvYmxlbXMudmlzaWJpbGl0eSNgJyksXG5cdFx0XHQndHlwZSc6ICdib29sZWFuJyxcblx0XHRcdCdkZWZhdWx0JzogdHJ1ZVxuXHRcdH1cblx0fVxufSk7XG5cbi8vIHJlZ2lzdGVyIGZpbGUgZGVjb3JhdGlvbnNcblJlZ2lzdHJ5LmFzPElXb3JrYmVuY2hDb250cmlidXRpb25zUmVnaXN0cnk+KFdvcmtiZW5jaEV4dGVuc2lvbnMuV29ya2JlbmNoKVxuXHQucmVnaXN0ZXJXb3JrYmVuY2hDb250cmlidXRpb24oTWFya2Vyc0ZpbGVEZWNvcmF0aW9ucywgTGlmZWN5Y2xlUGhhc2UuUmVzdG9yZWQpO1xuIl0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7Ozs7QUFLQSxTQUFrRSxjQUFjLDJCQUEyQjtBQUMzRyxTQUFTLGdCQUF5QixzQkFBc0I7QUFDeEQsU0FBUywyQkFBa0U7QUFDM0UsU0FBc0IsZUFBZTtBQUdyQyxTQUFTLGdCQUFnQjtBQUN6QixTQUFTLGdCQUFnQjtBQUN6QixTQUFTLHFCQUFxQiw2QkFBNkI7QUFDM0QsU0FBUyw2QkFBNkI7QUFDdEMsU0FBaUMsY0FBYywrQkFBK0I7QUFD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
