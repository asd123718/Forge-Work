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
import { createStyleSheet } from "../../../../base/browser/domStylesheets.js";
import { Event } from "../../../../base/common/event.js";
import { Disposable, DisposableStore, toDisposable } from "../../../../base/common/lifecycle.js";
import { clamp } from "../../../../base/common/numbers.js";
import { IConfigurationService } from "../../../../platform/configuration/common/configuration.js";
import { AccessibilityWorkbenchSettingId, ViewDimUnfocusedOpacityProperties } from "./accessibilityConfiguration.js";
let UnfocusedViewDimmingContribution = class extends Disposable {
  constructor(configurationService) {
    super();
    this._styleElementDisposables = void 0;
    this._register(toDisposable(() => this._removeStyleElement()));
    this._register(Event.runAndSubscribe(configurationService.onDidChangeConfiguration, (e) => {
      if (e && !e.affectsConfiguration(AccessibilityWorkbenchSettingId.DimUnfocusedEnabled) && !e.affectsConfiguration(AccessibilityWorkbenchSettingId.DimUnfocusedOpacity)) {
        return;
      }
      let cssTextContent = "";
      const enabled = ensureBoolean(configurationService.getValue(AccessibilityWorkbenchSettingId.DimUnfocusedEnabled), false);
      if (enabled) {
        const opacity = clamp(
          ensureNumber(configurationService.getValue(AccessibilityWorkbenchSettingId.DimUnfocusedOpacity), ViewDimUnfocusedOpacityProperties.Default),
          ViewDimUnfocusedOpacityProperties.Minimum,
          ViewDimUnfocusedOpacityProperties.Maximum
        );
        if (opacity !== 1) {
          const rules = /* @__PURE__ */ new Set();
          const filterRule = `filter: opacity(${opacity});`;
          rules.add(`.monaco-workbench .pane-body.integrated-terminal:not(:focus-within) .tabs-container { ${filterRule} }`);
          rules.add(`.monaco-workbench .pane-body.integrated-terminal .terminal-wrapper:not(:focus-within) { ${filterRule} }`);
          rules.add(`.monaco-workbench .editor-instance:not(:focus-within) .monaco-editor { ${filterRule} }`);
          rules.add(`.monaco-workbench .editor-instance:not(:focus-within) .breadcrumbs-below-tabs { ${filterRule} }`);
          rules.add(`.monaco-workbench .editor-instance:not(:focus-within) .terminal-wrapper { ${filterRule} }`);
          rules.add(`.monaco-workbench .editor-instance:not(:focus-within) .settings-editor { ${filterRule} }`);
          rules.add(`.monaco-workbench .editor-instance:not(:focus-within) .keybindings-editor { ${filterRule} }`);
          rules.add(`.monaco-workbench .editor-instance:not(:focus-within) .monaco-editor-pane-placeholder { ${filterRule} }`);
          rules.add(`.monaco-workbench .editor-instance:not(:focus-within) .gettingStartedContainer { ${filterRule} }`);
          cssTextContent = [...rules].join("\n");
        }
      }
      if (cssTextContent.length === 0) {
        this._removeStyleElement();
      } else {
        this._getStyleElement().textContent = cssTextContent;
      }
    }));
  }
  _getStyleElement() {
    if (!this._styleElement) {
      this._styleElementDisposables = new DisposableStore();
      this._styleElement = createStyleSheet(void 0, void 0, this._styleElementDisposables);
      this._styleElement.className = "accessibilityUnfocusedViewOpacity";
    }
    return this._styleElement;
  }
  _removeStyleElement() {
    this._styleElementDisposables?.dispose();
    this._styleElementDisposables = void 0;
    this._styleElement = void 0;
  }
};
UnfocusedViewDimmingContribution = __decorateClass([
  __decorateParam(0, IConfigurationService)
], UnfocusedViewDimmingContribution);
function ensureBoolean(value, defaultValue) {
  return typeof value === "boolean" ? value : defaultValue;
}
function ensureNumber(value, defaultValue) {
  return typeof value === "number" ? value : defaultValue;
}
export {
  UnfocusedViewDimmingContribution
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXGFjY2Vzc2liaWxpdHlcXGJyb3dzZXJcXHVuZm9jdXNlZFZpZXdEaW1taW5nQ29udHJpYnV0aW9uLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IHsgY3JlYXRlU3R5bGVTaGVldCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci9kb21TdHlsZXNoZWV0cy5qcyc7XG5pbXBvcnQgeyBFdmVudCB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2V2ZW50LmpzJztcbmltcG9ydCB7IERpc3Bvc2FibGUsIERpc3Bvc2FibGVTdG9yZSwgdG9EaXNwb3NhYmxlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IGNsYW1wIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbnVtYmVycy5qcyc7XG5pbXBvcnQgeyBJQ29uZmlndXJhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb25maWd1cmF0aW9uL2NvbW1vbi9jb25maWd1cmF0aW9uLmpzJztcbmltcG9ydCB7IElXb3JrYmVuY2hDb250cmlidXRpb24gfSBmcm9tICcuLi8uLi8uLi9jb21tb24vY29udHJpYnV0aW9ucy5qcyc7XG5pbXBvcnQgeyBBY2Nlc3NpYmlsaXR5V29ya2JlbmNoU2V0dGluZ0lkLCBWaWV3RGltVW5mb2N1c2VkT3BhY2l0eVByb3BlcnRpZXMgfSBmcm9tICcuL2FjY2Vzc2liaWxpdHlDb25maWd1cmF0aW9uLmpzJztcblxuZXhwb3J0IGNsYXNzIFVuZm9jdXNlZFZpZXdEaW1taW5nQ29udHJpYnV0aW9uIGV4dGVuZHMgRGlzcG9zYWJsZSBpbXBsZW1lbnRzIElXb3JrYmVuY2hDb250cmlidXRpb24ge1xuXHRwcml2YXRlIF9zdHlsZUVsZW1lbnQ/OiBIVE1MU3R5bGVFbGVtZW50O1xuXHRwcml2YXRlIF9zdHlsZUVsZW1lbnREaXNwb3NhYmxlczogRGlzcG9zYWJsZVN0b3JlIHwgdW5kZWZpbmVkID0gdW5kZWZpbmVkO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdEBJQ29uZmlndXJhdGlvblNlcnZpY2UgY29uZmlndXJhdGlvblNlcnZpY2U6IElDb25maWd1cmF0aW9uU2VydmljZSxcblx0KSB7XG5cdFx0c3VwZXIoKTtcblxuXHRcdHRoaXMuX3JlZ2lzdGVyKHRvRGlzcG9zYWJsZSgoKSA9PiB0aGlzLl9yZW1vdmVTdHlsZUVsZW1lbnQoKSkpO1xuXG5cdFx0dGhpcy5fcmVnaXN0ZXIoRXZlbnQucnVuQW5kU3Vic2NyaWJlKGNvbmZpZ3VyYXRpb25TZXJ2aWNlLm9uRGlkQ2hhbmdlQ29uZmlndXJhdGlvbiwgZSA9PiB7XG5cdFx0XHRpZiAoZSAmJiAhZS5hZmZlY3RzQ29uZmlndXJhdGlvbihBY2Nlc3NpYmlsaXR5V29ya2JlbmNoU2V0dGluZ0lkLkRpbVVuZm9jdXNlZEVuYWJsZWQpICYmICFlLmFmZmVjdHNDb25maWd1cmF0aW9uKEFjY2Vzc2liaWxpdHlXb3JrYmVuY2hTZXR0aW5nSWQuRGltVW5mb2N1c2VkT3BhY2l0eSkpIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXG5cdFx0XHRsZXQgY3NzVGV4dENvbnRlbnQgPSAnJztcblxuXHRcdFx0Y29uc3QgZW5hYmxlZCA9IGVuc3VyZUJvb2xlYW4oY29uZmlndXJhdGlvblNlcnZpY2UuZ2V0VmFsdWUoQWNjZXNzaWJpbGl0eVdvcmtiZW5jaFNldHRpbmdJZC5EaW1VbmZvY3VzZWRFbmFibGVkKSwgZmFsc2UpO1xuXHRcdFx0aWYgKGVuYWJsZWQpIHtcblx0XHRcdFx0Y29uc3Qgb3BhY2l0eSA9IGNsYW1wKFxuXHRcdFx0XHRcdGVuc3VyZU51bWJlcihjb25maWd1cmF0aW9uU2VydmljZS5nZXRWYWx1ZShBY2Nlc3NpYmlsaXR5V29ya2JlbmNoU2V0dGluZ0lkLkRpbVVuZm9jdXNlZE9wYWNpdHkpLCBWaWV3RGltVW5mb2N1c2VkT3BhY2l0eVByb3BlcnRpZXMuRGVmYXVsdCksXG5cdFx0XHRcdFx0Vmlld0RpbVVuZm9jdXNlZE9wYWNpdHlQcm9wZXJ0aWVzLk1pbmltdW0sXG5cdFx0XHRcdFx0Vmlld0RpbVVuZm9jdXNlZE9wYWNpdHlQcm9wZXJ0aWVzLk1heGltdW1cblx0XHRcdFx0KTtcblxuXHRcdFx0XHRpZiAob3BhY2l0eSAhPT0gMSkge1xuXHRcdFx0XHRcdC8vIFRoZXNlIGZpbHRlciBydWxlcyBhcmUgbW9yZSBzcGVjaWZpYyB0aGFuIG1heSBiZSBleHBlY3RlZCBhcyB0aGUgYGZpbHRlcmBcblx0XHRcdFx0XHQvLyBydWxlIGNhbiBjYXVzZSBwcm9ibGVtcyBpZiBpdCdzIHVzZWQgaW5zaWRlIHRoZSBlbGVtZW50IGxpa2Ugb24gZWRpdG9yIGhvdmVyc1xuXHRcdFx0XHRcdGNvbnN0IHJ1bGVzID0gbmV3IFNldDxzdHJpbmc+KCk7XG5cdFx0XHRcdFx0Y29uc3QgZmlsdGVyUnVsZSA9IGBmaWx0ZXI6IG9wYWNpdHkoJHtvcGFjaXR5fSk7YDtcblx0XHRcdFx0XHQvLyBUZXJtaW5hbCB0YWJzXG5cdFx0XHRcdFx0cnVsZXMuYWRkKGAubW9uYWNvLXdvcmtiZW5jaCAucGFuZS1ib2R5LmludGVncmF0ZWQtdGVybWluYWw6bm90KDpmb2N1cy13aXRoaW4pIC50YWJzLWNvbnRhaW5lciB7ICR7ZmlsdGVyUnVsZX0gfWApO1xuXHRcdFx0XHRcdC8vIFRlcm1pbmFsc1xuXHRcdFx0XHRcdHJ1bGVzLmFkZChgLm1vbmFjby13b3JrYmVuY2ggLnBhbmUtYm9keS5pbnRlZ3JhdGVkLXRlcm1pbmFsIC50ZXJtaW5hbC13cmFwcGVyOm5vdCg6Zm9jdXMtd2l0aGluKSB7ICR7ZmlsdGVyUnVsZX0gfWApO1xuXHRcdFx0XHRcdC8vIFRleHQgZWRpdG9yc1xuXHRcdFx0XHRcdHJ1bGVzLmFkZChgLm1vbmFjby13b3JrYmVuY2ggLmVkaXRvci1pbnN0YW5jZTpub3QoOmZvY3VzLXdpdGhpbikgLm1vbmFjby1lZGl0b3IgeyAke2ZpbHRlclJ1bGV9IH1gKTtcblx0XHRcdFx0XHQvLyBCcmVhZGNydW1ic1xuXHRcdFx0XHRcdHJ1bGVzLmFkZChgLm1vbmFjby13b3JrYmVuY2ggLmVkaXRvci1pbnN0YW5jZTpub3QoOmZvY3VzLXdpdGhpbikgLmJyZWFkY3J1bWJzLWJlbG93LXRhYnMgeyAke2ZpbHRlclJ1bGV9IH1gKTtcblx0XHRcdFx0XHQvLyBUZXJtaW5hbCBlZGl0b3JzXG5cdFx0XHRcdFx0cnVsZXMuYWRkKGAubW9uYWNvLXdvcmtiZW5jaCAuZWRpdG9yLWluc3RhbmNlOm5vdCg6Zm9jdXMtd2l0aGluKSAudGVybWluYWwtd3JhcHBlciB7ICR7ZmlsdGVyUnVsZX0gfWApO1xuXHRcdFx0XHRcdC8vIFNldHRpbmdzIGVkaXRvclxuXHRcdFx0XHRcdHJ1bGVzLmFkZChgLm1vbmFjby13b3JrYmVuY2ggLmVkaXRvci1pbnN0YW5jZTpub3QoOmZvY3VzLXdpdGhpbikgLnNldHRpbmdzLWVkaXRvciB7ICR7ZmlsdGVyUnVsZX0gfWApO1xuXHRcdFx0XHRcdC8vIEtleWJpbmRpbmdzIGVkaXRvclxuXHRcdFx0XHRcdHJ1bGVzLmFkZChgLm1vbmFjby13b3JrYmVuY2ggLmVkaXRvci1pbnN0YW5jZTpub3QoOmZvY3VzLXdpdGhpbikgLmtleWJpbmRpbmdzLWVkaXRvciB7ICR7ZmlsdGVyUnVsZX0gfWApO1xuXHRcdFx0XHRcdC8vIEVkaXRvciBwbGFjZWhvbGRlciAoZXJyb3IgY2FzZSlcblx0XHRcdFx0XHRydWxlcy5hZGQoYC5tb25hY28td29ya2JlbmNoIC5lZGl0b3ItaW5zdGFuY2U6bm90KDpmb2N1cy13aXRoaW4pIC5tb25hY28tZWRpdG9yLXBhbmUtcGxhY2Vob2xkZXIgeyAke2ZpbHRlclJ1bGV9IH1gKTtcblx0XHRcdFx0XHQvLyBXZWxjb21lIGVkaXRvclxuXHRcdFx0XHRcdHJ1bGVzLmFkZChgLm1vbmFjby13b3JrYmVuY2ggLmVkaXRvci1pbnN0YW5jZTpub3QoOmZvY3VzLXdpdGhpbikgLmdldHRpbmdTdGFydGVkQ29udGFpbmVyIHsgJHtmaWx0ZXJSdWxlfSB9YCk7XG5cdFx0XHRcdFx0Y3NzVGV4dENvbnRlbnQgPSBbLi4ucnVsZXNdLmpvaW4oJ1xcbicpO1xuXHRcdFx0XHR9XG5cblx0XHRcdH1cblxuXHRcdFx0aWYgKGNzc1RleHRDb250ZW50Lmxlbmd0aCA9PT0gMCkge1xuXHRcdFx0XHR0aGlzLl9yZW1vdmVTdHlsZUVsZW1lbnQoKTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdHRoaXMuX2dldFN0eWxlRWxlbWVudCgpLnRleHRDb250ZW50ID0gY3NzVGV4dENvbnRlbnQ7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXHR9XG5cblx0cHJpdmF0ZSBfZ2V0U3R5bGVFbGVtZW50KCk6IEhUTUxTdHlsZUVsZW1lbnQge1xuXHRcdGlmICghdGhpcy5fc3R5bGVFbGVtZW50KSB7XG5cdFx0XHR0aGlzLl9zdHlsZUVsZW1lbnREaXNwb3NhYmxlcyA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblx0XHRcdHRoaXMuX3N0eWxlRWxlbWVudCA9IGNyZWF0ZVN0eWxlU2hlZXQodW5kZWZpbmVkLCB1bmRlZmluZWQsIHRoaXMuX3N0eWxlRWxlbWVudERpc3Bvc2FibGVzKTtcblx0XHRcdHRoaXMuX3N0eWxlRWxlbWVudC5jbGFzc05hbWUgPSAnYWNjZXNzaWJpbGl0eVVuZm9jdXNlZFZpZXdPcGFjaXR5Jztcblx0XHR9XG5cdFx0cmV0dXJuIHRoaXMuX3N0eWxlRWxlbWVudDtcblx0fVxuXG5cdHByaXZhdGUgX3JlbW92ZVN0eWxlRWxlbWVudCgpOiB2b2lkIHtcblx0XHR0aGlzLl9zdHlsZUVsZW1lbnREaXNwb3NhYmxlcz8uZGlzcG9zZSgpO1xuXHRcdHRoaXMuX3N0eWxlRWxlbWVudERpc3Bvc2FibGVzID0gdW5kZWZpbmVkO1xuXHRcdHRoaXMuX3N0eWxlRWxlbWVudCA9IHVuZGVmaW5lZDtcblx0fVxufVxuXG5cbmZ1bmN0aW9uIGVuc3VyZUJvb2xlYW4odmFsdWU6IHVua25vd24sIGRlZmF1bHRWYWx1ZTogYm9vbGVhbik6IGJvb2xlYW4ge1xuXHRyZXR1cm4gdHlwZW9mIHZhbHVlID09PSAnYm9vbGVhbicgPyB2YWx1ZSA6IGRlZmF1bHRWYWx1ZTtcbn1cblxuZnVuY3Rpb24gZW5zdXJlTnVtYmVyKHZhbHVlOiB1bmtub3duLCBkZWZhdWx0VmFsdWU6IG51bWJlcik6IG51bWJlciB7XG5cdHJldHVybiB0eXBlb2YgdmFsdWUgPT09ICdudW1iZXInID8gdmFsdWUgOiBkZWZhdWx0VmFsdWU7XG59XG4iXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7OztBQUtBLFNBQVMsd0JBQXdCO0FBQ2pDLFNBQVMsYUFBYTtBQUN0QixTQUFTLFlBQVksaUJBQWlCLG9CQUFvQjtBQUMxRCxTQUFTLGFBQWE7QUFDdEIsU0FBUyw2QkFBNkI7QUFFdEMsU0FBUyxpQ0FBaUMseUNBQXlDO0FBRTVFLElBQU0sbUNBQU4sY0FBK0MsV0FBNkM7QUFBQSxFQUlsRyxZQUN3QixzQkFDdEI7QUFDRCxVQUFNO0FBTFAsU0FBUSwyQkFBd0Q7QUFPL0QsU0FBSyxVQUFVLGFBQWEsTUFBTSxLQUFLLG9CQUFvQixDQUFDLENBQUM7QUFFN0QsU0FBSyxVQUFVLE1BQU0sZ0JBQWdCLHFCQUFxQiwwQkFBMEIsT0FBSztBQUN4RixVQUFJLEtBQUssQ0FBQyxFQUFFLHFCQUFxQixnQ0FBZ0MsbUJBQW1CLEtBQUssQ0FBQyxFQUFFLHFCQUFxQixnQ0FBZ0MsbUJBQW1CLEdBQUc7QUFDdEs7QUFBQSxNQUNEO0FBRUEsVUFBSSxpQkFBaUI7QUFFckIsWUFBTSxVQUFVLGNBQWMscUJBQXFCLFNBQVMsZ0NBQWdDLG1CQUFtQixHQUFHLEtBQUs7QUFDdkgsVUFBSSxTQUFTO0FBQ1osY0FBTSxVQUFVO0FBQUEsVUFDZixhQUFhLHFCQUFxQixTQUFTLGdDQUFnQyxtQkFBbUIsR0FBRyxrQ0FBa0MsT0FBTztBQUFBLFVBQzFJLGtDQUFrQztBQUFBLFVBQ2xDLGtDQUFrQztBQUFBLFFBQ25DO0FBRUEsWUFBSSxZQUFZLEdBQUc7QUFHbEIsZ0JBQU0sUUFBUSxvQkFBSSxJQUFZO0FBQzlCLGdCQUFNLGFBQWEsbUJBQW1CLE9BQU87QUFFN0MsZ0JBQU0sSUFBSSx5RkFBeUYsVUFBVSxJQUFJO0FBRWpILGdCQUFNLElBQUksMkZBQTJGLFVBQVUsSUFBSTtBQUVuSCxnQkFBTSxJQUFJLDBFQUEwRSxVQUFVLElBQUk7QUFFbEcsZ0JBQU0sSUFBSSxtRkFBbUYsVUFBVSxJQUFJO0FBRTNHLGdCQUFNLElBQUksNkVBQTZFLFVBQVUsSUFBSTtBQUVyRyxnQkFBTSxJQUFJLDRFQUE0RSxVQUFVLElBQUk7QUFFcEcsZ0JBQU0sSUFBSSwrRUFBK0UsVUFBVSxJQUFJO0FBRXZHLGdCQUFNLElBQUksMkZBQTJGLFVBQVUsSUFBSTtBQUVuSCxnQkFBTSxJQUFJLG9GQUFvRixVQUFVLElBQUk7QUFDNUcsMkJBQWlCLENBQUMsR0FBRyxLQUFLLEVBQUUsS0FBSyxJQUFJO0FBQUEsUUFDdEM7QUFBQSxNQUVEO0FBRUEsVUFBSSxlQUFlLFdBQVcsR0FBRztBQUNoQyxhQUFLLG9CQUFvQjtBQUFBLE1BQzFCLE9BQU87QUFDTixhQUFLLGlCQUFpQixFQUFFLGNBQWM7QUFBQSxNQUN2QztBQUFBLElBQ0QsQ0FBQyxDQUFDO0FBQUEsRUFDSDtBQUFBLEVBRVEsbUJBQXFDO0FBQzVDLFFBQUksQ0FBQyxLQUFLLGVBQWU7QUFDeEIsV0FBSywyQkFBMkIsSUFBSSxnQkFBZ0I7QUFDcEQsV0FBSyxnQkFBZ0IsaUJBQWlCLFFBQVcsUUFBVyxLQUFLLHdCQUF3QjtBQUN6RixXQUFLLGNBQWMsWUFBWTtBQUFBLElBQ2hDO0FBQ0EsV0FBTyxLQUFLO0FBQUEsRUFDYjtBQUFBLEVBRVEsc0JBQTRCO0FBQ25DLFNBQUssMEJBQTBCLFFBQVE7QUFDdkMsU0FBSywyQkFBMkI7QUFDaEMsU0FBSyxnQkFBZ0I7QUFBQSxFQUN0QjtBQUNEO0FBNUVhLG1DQUFOO0FBQUEsRUFLSjtBQUFBLEdBTFU7QUErRWIsU0FBUyxjQUFjLE9BQWdCLGNBQWdDO0FBQ3RFLFNBQU8sT0FBTyxVQUFVLFlBQVksUUFBUTtBQUM3QztBQUVBLFNBQVMsYUFBYSxPQUFnQixjQUE4QjtBQUNuRSxTQUFPLE9BQU8sVUFBVSxXQUFXLFFBQVE7QUFDNUM7IiwKICAibmFtZXMiOiBbXQp9Cg==
