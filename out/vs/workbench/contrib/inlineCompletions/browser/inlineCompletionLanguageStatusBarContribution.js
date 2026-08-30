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
import { createHotClass } from "../../../../base/common/hotReloadHelpers.js";
import { Disposable } from "../../../../base/common/lifecycle.js";
import { autorunWithStore, debouncedObservable, derived, observableFromEvent } from "../../../../base/common/observable.js";
import Severity from "../../../../base/common/severity.js";
import { isCodeEditor } from "../../../../editor/browser/editorBrowser.js";
import { InlineCompletionsController } from "../../../../editor/contrib/inlineCompletions/browser/controller/inlineCompletionsController.js";
import { localize } from "../../../../nls.js";
import { IChatEntitlementService } from "../../../services/chat/common/chatEntitlementService.js";
import { IEditorService } from "../../../services/editor/common/editorService.js";
import { ILanguageStatusService } from "../../../services/languageStatus/common/languageStatusService.js";
let InlineCompletionLanguageStatusBarContribution = class extends Disposable {
  constructor(_languageStatusService, _editorService, _chatEntitlementService) {
    super();
    this._languageStatusService = _languageStatusService;
    this._editorService = _editorService;
    this._chatEntitlementService = _chatEntitlementService;
    this._activeEditor = observableFromEvent(this, _editorService.onDidActiveEditorChange, () => this._editorService.activeTextEditorControl);
    this._sentiment = this._chatEntitlementService.sentimentObs;
    this._state = derived(this, (reader) => {
      const editor = this._activeEditor.read(reader);
      if (!editor || !isCodeEditor(editor)) {
        return void 0;
      }
      const c = InlineCompletionsController.get(editor);
      const model = c?.model.read(reader);
      if (!model) {
        return void 0;
      }
      return {
        model,
        status: debouncedObservable(model.status, 300)
      };
    });
    this._register(autorunWithStore((reader, store) => {
      const sentiment = this._sentiment.read(reader);
      if (sentiment.hidden) {
        return;
      }
      const state = this._state.read(reader);
      if (!state) {
        return;
      }
      const status = state.status.read(reader);
      const statusMap = {
        loading: { shortLabel: "", label: localize("inlineSuggestionLoading", "Loading..."), loading: true },
        ghostText: { shortLabel: "$(lightbulb)", label: "$(copilot) " + localize("inlineCompletionAvailable", "Inline completion available"), loading: false },
        inlineEdit: { shortLabel: "$(lightbulb-sparkle)", label: "$(copilot) " + localize("inlineEditAvailable", "Inline edit available"), loading: false },
        noSuggestion: { shortLabel: "$(circle-slash)", label: "$(copilot) " + localize("noInlineSuggestionAvailable", "No inline suggestion available"), loading: false }
      };
      store.add(this._languageStatusService.addStatus({
        accessibilityInfo: void 0,
        busy: statusMap[status].loading,
        command: void 0,
        detail: localize("inlineSuggestionsSmall", "Inline suggestions"),
        id: "inlineSuggestions",
        label: { value: statusMap[status].label, shortValue: statusMap[status].shortLabel },
        name: localize("inlineSuggestions", "Inline Suggestions"),
        selector: { pattern: state.model.textModel.uri.fsPath },
        severity: Severity.Info,
        source: "inlineSuggestions"
      }));
    }));
  }
};
InlineCompletionLanguageStatusBarContribution.hot = createHotClass(InlineCompletionLanguageStatusBarContribution);
InlineCompletionLanguageStatusBarContribution.Id = "vs.contrib.inlineCompletionLanguageStatusBarContribution";
InlineCompletionLanguageStatusBarContribution.languageStatusBarDisposables = /* @__PURE__ */ new Set();
InlineCompletionLanguageStatusBarContribution = __decorateClass([
  __decorateParam(0, ILanguageStatusService),
  __decorateParam(1, IEditorService),
  __decorateParam(2, IChatEntitlementService)
], InlineCompletionLanguageStatusBarContribution);
export {
  InlineCompletionLanguageStatusBarContribution
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXGlubGluZUNvbXBsZXRpb25zXFxicm93c2VyXFxpbmxpbmVDb21wbGV0aW9uTGFuZ3VhZ2VTdGF0dXNCYXJDb250cmlidXRpb24udHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgeyBjcmVhdGVIb3RDbGFzcyB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2hvdFJlbG9hZEhlbHBlcnMuanMnO1xuaW1wb3J0IHsgRGlzcG9zYWJsZSwgRGlzcG9zYWJsZVN0b3JlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IGF1dG9ydW5XaXRoU3RvcmUsIGRlYm91bmNlZE9ic2VydmFibGUsIGRlcml2ZWQsIG9ic2VydmFibGVGcm9tRXZlbnQgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9vYnNlcnZhYmxlLmpzJztcbmltcG9ydCBTZXZlcml0eSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9zZXZlcml0eS5qcyc7XG5pbXBvcnQgeyBpc0NvZGVFZGl0b3IgfSBmcm9tICcuLi8uLi8uLi8uLi9lZGl0b3IvYnJvd3Nlci9lZGl0b3JCcm93c2VyLmpzJztcbmltcG9ydCB7IElubGluZUNvbXBsZXRpb25zQ29udHJvbGxlciB9IGZyb20gJy4uLy4uLy4uLy4uL2VkaXRvci9jb250cmliL2lubGluZUNvbXBsZXRpb25zL2Jyb3dzZXIvY29udHJvbGxlci9pbmxpbmVDb21wbGV0aW9uc0NvbnRyb2xsZXIuanMnO1xuaW1wb3J0IHsgbG9jYWxpemUgfSBmcm9tICcuLi8uLi8uLi8uLi9ubHMuanMnO1xuaW1wb3J0IHsgSVdvcmtiZW5jaENvbnRyaWJ1dGlvbiB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9jb250cmlidXRpb25zLmpzJztcbmltcG9ydCB7IElDaGF0RW50aXRsZW1lbnRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vc2VydmljZXMvY2hhdC9jb21tb24vY2hhdEVudGl0bGVtZW50U2VydmljZS5qcyc7XG5pbXBvcnQgeyBJRWRpdG9yU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL3NlcnZpY2VzL2VkaXRvci9jb21tb24vZWRpdG9yU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJTGFuZ3VhZ2VTdGF0dXNTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vc2VydmljZXMvbGFuZ3VhZ2VTdGF0dXMvY29tbW9uL2xhbmd1YWdlU3RhdHVzU2VydmljZS5qcyc7XG5cbmV4cG9ydCBjbGFzcyBJbmxpbmVDb21wbGV0aW9uTGFuZ3VhZ2VTdGF0dXNCYXJDb250cmlidXRpb24gZXh0ZW5kcyBEaXNwb3NhYmxlIGltcGxlbWVudHMgSVdvcmtiZW5jaENvbnRyaWJ1dGlvbiB7XG5cdHB1YmxpYyBzdGF0aWMgcmVhZG9ubHkgaG90ID0gY3JlYXRlSG90Q2xhc3ModGhpcyk7XG5cblx0cHVibGljIHN0YXRpYyBJZCA9ICd2cy5jb250cmliLmlubGluZUNvbXBsZXRpb25MYW5ndWFnZVN0YXR1c0JhckNvbnRyaWJ1dGlvbic7XG5cdHB1YmxpYyBzdGF0aWMgcmVhZG9ubHkgbGFuZ3VhZ2VTdGF0dXNCYXJEaXNwb3NhYmxlcyA9IG5ldyBTZXQ8RGlzcG9zYWJsZVN0b3JlPigpO1xuXG5cdHByaXZhdGUgX2FjdGl2ZUVkaXRvcjtcblx0cHJpdmF0ZSBfc3RhdGU7XG5cdHByaXZhdGUgX3NlbnRpbWVudDtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRASUxhbmd1YWdlU3RhdHVzU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9sYW5ndWFnZVN0YXR1c1NlcnZpY2U6IElMYW5ndWFnZVN0YXR1c1NlcnZpY2UsXG5cdFx0QElFZGl0b3JTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2VkaXRvclNlcnZpY2U6IElFZGl0b3JTZXJ2aWNlLFxuXHRcdEBJQ2hhdEVudGl0bGVtZW50U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9jaGF0RW50aXRsZW1lbnRTZXJ2aWNlOiBJQ2hhdEVudGl0bGVtZW50U2VydmljZSxcblx0KSB7XG5cdFx0c3VwZXIoKTtcblxuXG5cdFx0dGhpcy5fYWN0aXZlRWRpdG9yID0gb2JzZXJ2YWJsZUZyb21FdmVudCh0aGlzLCBfZWRpdG9yU2VydmljZS5vbkRpZEFjdGl2ZUVkaXRvckNoYW5nZSwgKCkgPT4gdGhpcy5fZWRpdG9yU2VydmljZS5hY3RpdmVUZXh0RWRpdG9yQ29udHJvbCk7XG5cdFx0dGhpcy5fc2VudGltZW50ID0gdGhpcy5fY2hhdEVudGl0bGVtZW50U2VydmljZS5zZW50aW1lbnRPYnM7XG5cdFx0dGhpcy5fc3RhdGUgPSBkZXJpdmVkKHRoaXMsIHJlYWRlciA9PiB7XG5cdFx0XHRjb25zdCBlZGl0b3IgPSB0aGlzLl9hY3RpdmVFZGl0b3IucmVhZChyZWFkZXIpO1xuXHRcdFx0aWYgKCFlZGl0b3IgfHwgIWlzQ29kZUVkaXRvcihlZGl0b3IpKSB7XG5cdFx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0XHR9XG5cblx0XHRcdGNvbnN0IGMgPSBJbmxpbmVDb21wbGV0aW9uc0NvbnRyb2xsZXIuZ2V0KGVkaXRvcik7XG5cdFx0XHRjb25zdCBtb2RlbCA9IGM/Lm1vZGVsLnJlYWQocmVhZGVyKTtcblx0XHRcdGlmICghbW9kZWwpIHtcblx0XHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHRcdH1cblxuXHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0bW9kZWwsXG5cdFx0XHRcdHN0YXR1czogZGVib3VuY2VkT2JzZXJ2YWJsZShtb2RlbC5zdGF0dXMsIDMwMCksXG5cdFx0XHR9O1xuXHRcdH0pO1xuXG5cdFx0dGhpcy5fcmVnaXN0ZXIoYXV0b3J1bldpdGhTdG9yZSgocmVhZGVyLCBzdG9yZSkgPT4ge1xuXHRcdFx0Ly8gRG8gbm90IHNob3cgdGhlIENvcGlsb3QgaWNvbiBpbiB0aGUgbGFuZ3VhZ2Ugc3RhdHVzIHdoZW4gQUkgZmVhdHVyZXMgYXJlIGRpc2FibGVkXG5cdFx0XHRjb25zdCBzZW50aW1lbnQgPSB0aGlzLl9zZW50aW1lbnQucmVhZChyZWFkZXIpO1xuXHRcdFx0aWYgKHNlbnRpbWVudC5oaWRkZW4pIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXG5cdFx0XHRjb25zdCBzdGF0ZSA9IHRoaXMuX3N0YXRlLnJlYWQocmVhZGVyKTtcblx0XHRcdGlmICghc3RhdGUpIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXG5cdFx0XHRjb25zdCBzdGF0dXMgPSBzdGF0ZS5zdGF0dXMucmVhZChyZWFkZXIpO1xuXG5cdFx0XHRjb25zdCBzdGF0dXNNYXA6IFJlY29yZDx0eXBlb2Ygc3RhdHVzLCB7IHNob3J0TGFiZWw6IHN0cmluZzsgbGFiZWw6IHN0cmluZzsgbG9hZGluZzogYm9vbGVhbiB9PiA9IHtcblx0XHRcdFx0bG9hZGluZzogeyBzaG9ydExhYmVsOiAnJywgbGFiZWw6IGxvY2FsaXplKCdpbmxpbmVTdWdnZXN0aW9uTG9hZGluZycsIFwiTG9hZGluZy4uLlwiKSwgbG9hZGluZzogdHJ1ZSwgfSxcblx0XHRcdFx0Z2hvc3RUZXh0OiB7IHNob3J0TGFiZWw6ICckKGxpZ2h0YnVsYiknLCBsYWJlbDogJyQoY29waWxvdCkgJyArIGxvY2FsaXplKCdpbmxpbmVDb21wbGV0aW9uQXZhaWxhYmxlJywgXCJJbmxpbmUgY29tcGxldGlvbiBhdmFpbGFibGVcIiksIGxvYWRpbmc6IGZhbHNlLCB9LFxuXHRcdFx0XHRpbmxpbmVFZGl0OiB7IHNob3J0TGFiZWw6ICckKGxpZ2h0YnVsYi1zcGFya2xlKScsIGxhYmVsOiAnJChjb3BpbG90KSAnICsgbG9jYWxpemUoJ2lubGluZUVkaXRBdmFpbGFibGUnLCBcIklubGluZSBlZGl0IGF2YWlsYWJsZVwiKSwgbG9hZGluZzogZmFsc2UsIH0sXG5cdFx0XHRcdG5vU3VnZ2VzdGlvbjogeyBzaG9ydExhYmVsOiAnJChjaXJjbGUtc2xhc2gpJywgbGFiZWw6ICckKGNvcGlsb3QpICcgKyBsb2NhbGl6ZSgnbm9JbmxpbmVTdWdnZXN0aW9uQXZhaWxhYmxlJywgXCJObyBpbmxpbmUgc3VnZ2VzdGlvbiBhdmFpbGFibGVcIiksIGxvYWRpbmc6IGZhbHNlLCB9LFxuXHRcdFx0fTtcblxuXHRcdFx0c3RvcmUuYWRkKHRoaXMuX2xhbmd1YWdlU3RhdHVzU2VydmljZS5hZGRTdGF0dXMoe1xuXHRcdFx0XHRhY2Nlc3NpYmlsaXR5SW5mbzogdW5kZWZpbmVkLFxuXHRcdFx0XHRidXN5OiBzdGF0dXNNYXBbc3RhdHVzXS5sb2FkaW5nLFxuXHRcdFx0XHRjb21tYW5kOiB1bmRlZmluZWQsXG5cdFx0XHRcdGRldGFpbDogbG9jYWxpemUoJ2lubGluZVN1Z2dlc3Rpb25zU21hbGwnLCBcIklubGluZSBzdWdnZXN0aW9uc1wiKSxcblx0XHRcdFx0aWQ6ICdpbmxpbmVTdWdnZXN0aW9ucycsXG5cdFx0XHRcdGxhYmVsOiB7IHZhbHVlOiBzdGF0dXNNYXBbc3RhdHVzXS5sYWJlbCwgc2hvcnRWYWx1ZTogc3RhdHVzTWFwW3N0YXR1c10uc2hvcnRMYWJlbCB9LFxuXHRcdFx0XHRuYW1lOiBsb2NhbGl6ZSgnaW5saW5lU3VnZ2VzdGlvbnMnLCBcIklubGluZSBTdWdnZXN0aW9uc1wiKSxcblx0XHRcdFx0c2VsZWN0b3I6IHsgcGF0dGVybjogc3RhdGUubW9kZWwudGV4dE1vZGVsLnVyaS5mc1BhdGggfSxcblx0XHRcdFx0c2V2ZXJpdHk6IFNldmVyaXR5LkluZm8sXG5cdFx0XHRcdHNvdXJjZTogJ2lubGluZVN1Z2dlc3Rpb25zJyxcblx0XHRcdH0pKTtcblx0XHR9KSk7XG5cdH1cbn1cbiJdLAogICJtYXBwaW5ncyI6ICI7Ozs7Ozs7Ozs7O0FBS0EsU0FBUyxzQkFBc0I7QUFDL0IsU0FBUyxrQkFBbUM7QUFDNUMsU0FBUyxrQkFBa0IscUJBQXFCLFNBQVMsMkJBQTJCO0FBQ3BGLE9BQU8sY0FBYztBQUNyQixTQUFTLG9CQUFvQjtBQUM3QixTQUFTLG1DQUFtQztBQUM1QyxTQUFTLGdCQUFnQjtBQUV6QixTQUFTLCtCQUErQjtBQUN4QyxTQUFTLHNCQUFzQjtBQUMvQixTQUFTLDhCQUE4QjtBQUVoQyxJQUFNLGdEQUFOLGNBQTRELFdBQTZDO0FBQUEsRUFVL0csWUFDMEMsd0JBQ1IsZ0JBQ1MseUJBQ3pDO0FBQ0QsVUFBTTtBQUptQztBQUNSO0FBQ1M7QUFLMUMsU0FBSyxnQkFBZ0Isb0JBQW9CLE1BQU0sZUFBZSx5QkFBeUIsTUFBTSxLQUFLLGVBQWUsdUJBQXVCO0FBQ3hJLFNBQUssYUFBYSxLQUFLLHdCQUF3QjtBQUMvQyxTQUFLLFNBQVMsUUFBUSxNQUFNLFlBQVU7QUFDckMsWUFBTSxTQUFTLEtBQUssY0FBYyxLQUFLLE1BQU07QUFDN0MsVUFBSSxDQUFDLFVBQVUsQ0FBQyxhQUFhLE1BQU0sR0FBRztBQUNyQyxlQUFPO0FBQUEsTUFDUjtBQUVBLFlBQU0sSUFBSSw0QkFBNEIsSUFBSSxNQUFNO0FBQ2hELFlBQU0sUUFBUSxHQUFHLE1BQU0sS0FBSyxNQUFNO0FBQ2xDLFVBQUksQ0FBQyxPQUFPO0FBQ1gsZUFBTztBQUFBLE1BQ1I7QUFFQSxhQUFPO0FBQUEsUUFDTjtBQUFBLFFBQ0EsUUFBUSxvQkFBb0IsTUFBTSxRQUFRLEdBQUc7QUFBQSxNQUM5QztBQUFBLElBQ0QsQ0FBQztBQUVELFNBQUssVUFBVSxpQkFBaUIsQ0FBQyxRQUFRLFVBQVU7QUFFbEQsWUFBTSxZQUFZLEtBQUssV0FBVyxLQUFLLE1BQU07QUFDN0MsVUFBSSxVQUFVLFFBQVE7QUFDckI7QUFBQSxNQUNEO0FBRUEsWUFBTSxRQUFRLEtBQUssT0FBTyxLQUFLLE1BQU07QUFDckMsVUFBSSxDQUFDLE9BQU87QUFDWDtBQUFBLE1BQ0Q7QUFFQSxZQUFNLFNBQVMsTUFBTSxPQUFPLEtBQUssTUFBTTtBQUV2QyxZQUFNLFlBQTRGO0FBQUEsUUFDakcsU0FBUyxFQUFFLFlBQVksSUFBSSxPQUFPLFNBQVMsMkJBQTJCLFlBQVksR0FBRyxTQUFTLEtBQU07QUFBQSxRQUNwRyxXQUFXLEVBQUUsWUFBWSxnQkFBZ0IsT0FBTyxnQkFBZ0IsU0FBUyw2QkFBNkIsNkJBQTZCLEdBQUcsU0FBUyxNQUFPO0FBQUEsUUFDdEosWUFBWSxFQUFFLFlBQVksd0JBQXdCLE9BQU8sZ0JBQWdCLFNBQVMsdUJBQXVCLHVCQUF1QixHQUFHLFNBQVMsTUFBTztBQUFBLFFBQ25KLGNBQWMsRUFBRSxZQUFZLG1CQUFtQixPQUFPLGdCQUFnQixTQUFTLCtCQUErQixnQ0FBZ0MsR0FBRyxTQUFTLE1BQU87QUFBQSxNQUNsSztBQUVBLFlBQU0sSUFBSSxLQUFLLHVCQUF1QixVQUFVO0FBQUEsUUFDL0MsbUJBQW1CO0FBQUEsUUFDbkIsTUFBTSxVQUFVLE1BQU0sRUFBRTtBQUFBLFFBQ3hCLFNBQVM7QUFBQSxRQUNULFFBQVEsU0FBUywwQkFBMEIsb0JBQW9CO0FBQUEsUUFDL0QsSUFBSTtBQUFBLFFBQ0osT0FBTyxFQUFFLE9BQU8sVUFBVSxNQUFNLEVBQUUsT0FBTyxZQUFZLFVBQVUsTUFBTSxFQUFFLFdBQVc7QUFBQSxRQUNsRixNQUFNLFNBQVMscUJBQXFCLG9CQUFvQjtBQUFBLFFBQ3hELFVBQVUsRUFBRSxTQUFTLE1BQU0sTUFBTSxVQUFVLElBQUksT0FBTztBQUFBLFFBQ3RELFVBQVUsU0FBUztBQUFBLFFBQ25CLFFBQVE7QUFBQSxNQUNULENBQUMsQ0FBQztBQUFBLElBQ0gsQ0FBQyxDQUFDO0FBQUEsRUFDSDtBQUNEO0FBekVhLDhDQUNXLE1BQU0sZUFBZSw2Q0FBSTtBQURwQyw4Q0FHRSxLQUFLO0FBSFAsOENBSVcsK0JBQStCLG9CQUFJLElBQXFCO0FBSm5FLGdEQUFOO0FBQUEsRUFXSjtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsR0FiVTsiLAogICJuYW1lcyI6IFtdCn0K
