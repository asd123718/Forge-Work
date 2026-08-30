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
import * as path from "../../../../base/common/path.js";
import { Disposable } from "../../../../base/common/lifecycle.js";
import { EditorContributionInstantiation, registerEditorContribution } from "../../../../editor/browser/editorExtensions.js";
import { IConfigurationService } from "../../../../platform/configuration/common/configuration.js";
import { INotificationService, Severity } from "../../../../platform/notification/common/notification.js";
let LargeFileOptimizationsWarner = class extends Disposable {
  constructor(_editor, _notificationService, _configurationService) {
    super();
    this._editor = _editor;
    this._notificationService = _notificationService;
    this._configurationService = _configurationService;
    this._register(this._editor.onDidChangeModel((e) => this._update()));
    this._update();
  }
  _update() {
    const model = this._editor.getModel();
    if (!model) {
      return;
    }
    if (model.isTooLargeForTokenization()) {
      const message = nls.localize(
        {
          key: "largeFile",
          comment: [
            "Variable 0 will be a file name."
          ]
        },
        "{0}: tokenization, wrapping, folding, codelens, word highlighting and sticky scroll have been turned off for this large file in order to reduce memory usage and avoid freezing or crashing.",
        path.basename(model.uri.path)
      );
      this._notificationService.prompt(Severity.Info, message, [
        {
          label: nls.localize("removeOptimizations", "Forcefully Enable Features"),
          run: () => {
            this._configurationService.updateValue(`editor.largeFileOptimizations`, false).then(() => {
              this._notificationService.info(nls.localize("reopenFilePrompt", "Please reopen file in order for this setting to take effect."));
            }, (err) => {
              this._notificationService.error(err);
            });
          }
        }
      ], { neverShowAgain: { id: "editor.contrib.largeFileOptimizationsWarner" } });
    }
  }
};
LargeFileOptimizationsWarner.ID = "editor.contrib.largeFileOptimizationsWarner";
LargeFileOptimizationsWarner = __decorateClass([
  __decorateParam(1, INotificationService),
  __decorateParam(2, IConfigurationService)
], LargeFileOptimizationsWarner);
registerEditorContribution(LargeFileOptimizationsWarner.ID, LargeFileOptimizationsWarner, EditorContributionInstantiation.AfterFirstRender);
export {
  LargeFileOptimizationsWarner
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXGNvZGVFZGl0b3JcXGJyb3dzZXJcXGxhcmdlRmlsZU9wdGltaXphdGlvbnMudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgKiBhcyBubHMgZnJvbSAnLi4vLi4vLi4vLi4vbmxzLmpzJztcbmltcG9ydCAqIGFzIHBhdGggZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vcGF0aC5qcyc7XG5pbXBvcnQgeyBEaXNwb3NhYmxlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IElDb2RlRWRpdG9yIH0gZnJvbSAnLi4vLi4vLi4vLi4vZWRpdG9yL2Jyb3dzZXIvZWRpdG9yQnJvd3Nlci5qcyc7XG5pbXBvcnQgeyBFZGl0b3JDb250cmlidXRpb25JbnN0YW50aWF0aW9uLCByZWdpc3RlckVkaXRvckNvbnRyaWJ1dGlvbiB9IGZyb20gJy4uLy4uLy4uLy4uL2VkaXRvci9icm93c2VyL2VkaXRvckV4dGVuc2lvbnMuanMnO1xuaW1wb3J0IHsgSUVkaXRvckNvbnRyaWJ1dGlvbiB9IGZyb20gJy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vZWRpdG9yQ29tbW9uLmpzJztcbmltcG9ydCB7IElDb25maWd1cmF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbmZpZ3VyYXRpb24vY29tbW9uL2NvbmZpZ3VyYXRpb24uanMnO1xuaW1wb3J0IHsgSU5vdGlmaWNhdGlvblNlcnZpY2UsIFNldmVyaXR5IH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vbm90aWZpY2F0aW9uL2NvbW1vbi9ub3RpZmljYXRpb24uanMnO1xuXG4vKipcbiAqIFNob3dzIGEgbWVzc2FnZSB3aGVuIG9wZW5pbmcgYSBsYXJnZSBmaWxlIHdoaWNoIGhhcyBiZWVuIG1lbW9yeSBvcHRpbWl6ZWQgKGFuZCBmZWF0dXJlcyBkaXNhYmxlZCkuXG4gKi9cbmV4cG9ydCBjbGFzcyBMYXJnZUZpbGVPcHRpbWl6YXRpb25zV2FybmVyIGV4dGVuZHMgRGlzcG9zYWJsZSBpbXBsZW1lbnRzIElFZGl0b3JDb250cmlidXRpb24ge1xuXG5cdHB1YmxpYyBzdGF0aWMgcmVhZG9ubHkgSUQgPSAnZWRpdG9yLmNvbnRyaWIubGFyZ2VGaWxlT3B0aW1pemF0aW9uc1dhcm5lcic7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0cHJpdmF0ZSByZWFkb25seSBfZWRpdG9yOiBJQ29kZUVkaXRvcixcblx0XHRASU5vdGlmaWNhdGlvblNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfbm90aWZpY2F0aW9uU2VydmljZTogSU5vdGlmaWNhdGlvblNlcnZpY2UsXG5cdFx0QElDb25maWd1cmF0aW9uU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9jb25maWd1cmF0aW9uU2VydmljZTogSUNvbmZpZ3VyYXRpb25TZXJ2aWNlLFxuXHQpIHtcblx0XHRzdXBlcigpO1xuXG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5fZWRpdG9yLm9uRGlkQ2hhbmdlTW9kZWwoKGUpID0+IHRoaXMuX3VwZGF0ZSgpKSk7XG5cdFx0dGhpcy5fdXBkYXRlKCk7XG5cdH1cblxuXHRwcml2YXRlIF91cGRhdGUoKTogdm9pZCB7XG5cdFx0Y29uc3QgbW9kZWwgPSB0aGlzLl9lZGl0b3IuZ2V0TW9kZWwoKTtcblx0XHRpZiAoIW1vZGVsKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0aWYgKG1vZGVsLmlzVG9vTGFyZ2VGb3JUb2tlbml6YXRpb24oKSkge1xuXHRcdFx0Y29uc3QgbWVzc2FnZSA9IG5scy5sb2NhbGl6ZShcblx0XHRcdFx0e1xuXHRcdFx0XHRcdGtleTogJ2xhcmdlRmlsZScsXG5cdFx0XHRcdFx0Y29tbWVudDogW1xuXHRcdFx0XHRcdFx0J1ZhcmlhYmxlIDAgd2lsbCBiZSBhIGZpbGUgbmFtZS4nXG5cdFx0XHRcdFx0XVxuXHRcdFx0XHR9LFxuXHRcdFx0XHRcInswfTogdG9rZW5pemF0aW9uLCB3cmFwcGluZywgZm9sZGluZywgY29kZWxlbnMsIHdvcmQgaGlnaGxpZ2h0aW5nIGFuZCBzdGlja3kgc2Nyb2xsIGhhdmUgYmVlbiB0dXJuZWQgb2ZmIGZvciB0aGlzIGxhcmdlIGZpbGUgaW4gb3JkZXIgdG8gcmVkdWNlIG1lbW9yeSB1c2FnZSBhbmQgYXZvaWQgZnJlZXppbmcgb3IgY3Jhc2hpbmcuXCIsXG5cdFx0XHRcdHBhdGguYmFzZW5hbWUobW9kZWwudXJpLnBhdGgpXG5cdFx0XHQpO1xuXG5cdFx0XHR0aGlzLl9ub3RpZmljYXRpb25TZXJ2aWNlLnByb21wdChTZXZlcml0eS5JbmZvLCBtZXNzYWdlLCBbXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRsYWJlbDogbmxzLmxvY2FsaXplKCdyZW1vdmVPcHRpbWl6YXRpb25zJywgXCJGb3JjZWZ1bGx5IEVuYWJsZSBGZWF0dXJlc1wiKSxcblx0XHRcdFx0XHRydW46ICgpID0+IHtcblx0XHRcdFx0XHRcdHRoaXMuX2NvbmZpZ3VyYXRpb25TZXJ2aWNlLnVwZGF0ZVZhbHVlKGBlZGl0b3IubGFyZ2VGaWxlT3B0aW1pemF0aW9uc2AsIGZhbHNlKS50aGVuKCgpID0+IHtcblx0XHRcdFx0XHRcdFx0dGhpcy5fbm90aWZpY2F0aW9uU2VydmljZS5pbmZvKG5scy5sb2NhbGl6ZSgncmVvcGVuRmlsZVByb21wdCcsIFwiUGxlYXNlIHJlb3BlbiBmaWxlIGluIG9yZGVyIGZvciB0aGlzIHNldHRpbmcgdG8gdGFrZSBlZmZlY3QuXCIpKTtcblx0XHRcdFx0XHRcdH0sIChlcnIpID0+IHtcblx0XHRcdFx0XHRcdFx0dGhpcy5fbm90aWZpY2F0aW9uU2VydmljZS5lcnJvcihlcnIpO1xuXHRcdFx0XHRcdFx0fSk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHRdLCB7IG5ldmVyU2hvd0FnYWluOiB7IGlkOiAnZWRpdG9yLmNvbnRyaWIubGFyZ2VGaWxlT3B0aW1pemF0aW9uc1dhcm5lcicgfSB9KTtcblx0XHR9XG5cdH1cbn1cblxucmVnaXN0ZXJFZGl0b3JDb250cmlidXRpb24oTGFyZ2VGaWxlT3B0aW1pemF0aW9uc1dhcm5lci5JRCwgTGFyZ2VGaWxlT3B0aW1pemF0aW9uc1dhcm5lciwgRWRpdG9yQ29udHJpYnV0aW9uSW5zdGFudGlhdGlvbi5BZnRlckZpcnN0UmVuZGVyKTtcbiJdLAogICJtYXBwaW5ncyI6ICI7Ozs7Ozs7Ozs7O0FBS0EsWUFBWSxTQUFTO0FBQ3JCLFlBQVksVUFBVTtBQUN0QixTQUFTLGtCQUFrQjtBQUUzQixTQUFTLGlDQUFpQyxrQ0FBa0M7QUFFNUUsU0FBUyw2QkFBNkI7QUFDdEMsU0FBUyxzQkFBc0IsZ0JBQWdCO0FBS3hDLElBQU0sK0JBQU4sY0FBMkMsV0FBMEM7QUFBQSxFQUkzRixZQUNrQixTQUNzQixzQkFDQyx1QkFDdkM7QUFDRCxVQUFNO0FBSlc7QUFDc0I7QUFDQztBQUl4QyxTQUFLLFVBQVUsS0FBSyxRQUFRLGlCQUFpQixDQUFDLE1BQU0sS0FBSyxRQUFRLENBQUMsQ0FBQztBQUNuRSxTQUFLLFFBQVE7QUFBQSxFQUNkO0FBQUEsRUFFUSxVQUFnQjtBQUN2QixVQUFNLFFBQVEsS0FBSyxRQUFRLFNBQVM7QUFDcEMsUUFBSSxDQUFDLE9BQU87QUFDWDtBQUFBLElBQ0Q7QUFFQSxRQUFJLE1BQU0sMEJBQTBCLEdBQUc7QUFDdEMsWUFBTSxVQUFVLElBQUk7QUFBQSxRQUNuQjtBQUFBLFVBQ0MsS0FBSztBQUFBLFVBQ0wsU0FBUztBQUFBLFlBQ1I7QUFBQSxVQUNEO0FBQUEsUUFDRDtBQUFBLFFBQ0E7QUFBQSxRQUNBLEtBQUssU0FBUyxNQUFNLElBQUksSUFBSTtBQUFBLE1BQzdCO0FBRUEsV0FBSyxxQkFBcUIsT0FBTyxTQUFTLE1BQU0sU0FBUztBQUFBLFFBQ3hEO0FBQUEsVUFDQyxPQUFPLElBQUksU0FBUyx1QkFBdUIsNEJBQTRCO0FBQUEsVUFDdkUsS0FBSyxNQUFNO0FBQ1YsaUJBQUssc0JBQXNCLFlBQVksaUNBQWlDLEtBQUssRUFBRSxLQUFLLE1BQU07QUFDekYsbUJBQUsscUJBQXFCLEtBQUssSUFBSSxTQUFTLG9CQUFvQiw4REFBOEQsQ0FBQztBQUFBLFlBQ2hJLEdBQUcsQ0FBQyxRQUFRO0FBQ1gsbUJBQUsscUJBQXFCLE1BQU0sR0FBRztBQUFBLFlBQ3BDLENBQUM7QUFBQSxVQUNGO0FBQUEsUUFDRDtBQUFBLE1BQ0QsR0FBRyxFQUFFLGdCQUFnQixFQUFFLElBQUksOENBQThDLEVBQUUsQ0FBQztBQUFBLElBQzdFO0FBQUEsRUFDRDtBQUNEO0FBL0NhLDZCQUVXLEtBQUs7QUFGaEIsK0JBQU47QUFBQSxFQU1KO0FBQUEsRUFDQTtBQUFBLEdBUFU7QUFpRGIsMkJBQTJCLDZCQUE2QixJQUFJLDhCQUE4QixnQ0FBZ0MsZ0JBQWdCOyIsCiAgIm5hbWVzIjogW10KfQo=
