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
import { DisposableStore } from "../../../../../base/common/lifecycle.js";
import { autorun, observableFromEvent } from "../../../../../base/common/observable.js";
import { AccessibilitySignal, IAccessibilitySignalService } from "../../../../../platform/accessibilitySignal/browser/accessibilitySignalService.js";
import { IEditorService } from "../../../../services/editor/common/editorService.js";
import { IChatEditingService } from "../../common/editing/chatEditingService.js";
let ChatEditingEditorAccessibility = class {
  constructor(chatEditingService, editorService, accessibilityService) {
    this._store = new DisposableStore();
    const activeUri = observableFromEvent(this, editorService.onDidActiveEditorChange, () => editorService.activeEditorPane?.input?.resource);
    this._store.add(autorun((r) => {
      const editor = activeUri.read(r);
      if (!editor) {
        return;
      }
      const entry = chatEditingService.editingSessionsObs.read(r).find((session) => session.readEntry(editor, r));
      if (entry) {
        accessibilityService.playSignal(AccessibilitySignal.chatEditModifiedFile);
      }
    }));
  }
  dispose() {
    this._store.dispose();
  }
};
ChatEditingEditorAccessibility.ID = "chat.edits.accessibilty";
ChatEditingEditorAccessibility = __decorateClass([
  __decorateParam(0, IChatEditingService),
  __decorateParam(1, IEditorService),
  __decorateParam(2, IAccessibilitySignalService)
], ChatEditingEditorAccessibility);
export {
  ChatEditingEditorAccessibility
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXGNoYXRcXGJyb3dzZXJcXGNoYXRFZGl0aW5nXFxjaGF0RWRpdGluZ0VkaXRvckFjY2Vzc2liaWxpdHkudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgeyBEaXNwb3NhYmxlU3RvcmUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgYXV0b3J1biwgb2JzZXJ2YWJsZUZyb21FdmVudCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL29ic2VydmFibGUuanMnO1xuaW1wb3J0IHsgQWNjZXNzaWJpbGl0eVNpZ25hbCwgSUFjY2Vzc2liaWxpdHlTaWduYWxTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vYWNjZXNzaWJpbGl0eVNpZ25hbC9icm93c2VyL2FjY2Vzc2liaWxpdHlTaWduYWxTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElXb3JrYmVuY2hDb250cmlidXRpb24gfSBmcm9tICcuLi8uLi8uLi8uLi9jb21tb24vY29udHJpYnV0aW9ucy5qcyc7XG5pbXBvcnQgeyBJRWRpdG9yU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3NlcnZpY2VzL2VkaXRvci9jb21tb24vZWRpdG9yU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJQ2hhdEVkaXRpbmdTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vY29tbW9uL2VkaXRpbmcvY2hhdEVkaXRpbmdTZXJ2aWNlLmpzJztcblxuZXhwb3J0IGNsYXNzIENoYXRFZGl0aW5nRWRpdG9yQWNjZXNzaWJpbGl0eSBpbXBsZW1lbnRzIElXb3JrYmVuY2hDb250cmlidXRpb24ge1xuXG5cdHN0YXRpYyByZWFkb25seSBJRCA9ICdjaGF0LmVkaXRzLmFjY2Vzc2liaWx0eSc7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfc3RvcmUgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0QElDaGF0RWRpdGluZ1NlcnZpY2UgY2hhdEVkaXRpbmdTZXJ2aWNlOiBJQ2hhdEVkaXRpbmdTZXJ2aWNlLFxuXHRcdEBJRWRpdG9yU2VydmljZSBlZGl0b3JTZXJ2aWNlOiBJRWRpdG9yU2VydmljZSxcblx0XHRASUFjY2Vzc2liaWxpdHlTaWduYWxTZXJ2aWNlIGFjY2Vzc2liaWxpdHlTZXJ2aWNlOiBJQWNjZXNzaWJpbGl0eVNpZ25hbFNlcnZpY2Vcblx0KSB7XG5cblx0XHRjb25zdCBhY3RpdmVVcmkgPSBvYnNlcnZhYmxlRnJvbUV2ZW50KHRoaXMsIGVkaXRvclNlcnZpY2Uub25EaWRBY3RpdmVFZGl0b3JDaGFuZ2UsICgpID0+IGVkaXRvclNlcnZpY2UuYWN0aXZlRWRpdG9yUGFuZT8uaW5wdXQ/LnJlc291cmNlKTtcblxuXHRcdHRoaXMuX3N0b3JlLmFkZChhdXRvcnVuKHIgPT4ge1xuXG5cdFx0XHRjb25zdCBlZGl0b3IgPSBhY3RpdmVVcmkucmVhZChyKTtcblx0XHRcdGlmICghZWRpdG9yKSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblxuXHRcdFx0Y29uc3QgZW50cnkgPSBjaGF0RWRpdGluZ1NlcnZpY2UuZWRpdGluZ1Nlc3Npb25zT2JzLnJlYWQocikuZmluZChzZXNzaW9uID0+IHNlc3Npb24ucmVhZEVudHJ5KGVkaXRvciwgcikpO1xuXHRcdFx0aWYgKGVudHJ5KSB7XG5cdFx0XHRcdGFjY2Vzc2liaWxpdHlTZXJ2aWNlLnBsYXlTaWduYWwoQWNjZXNzaWJpbGl0eVNpZ25hbC5jaGF0RWRpdE1vZGlmaWVkRmlsZSk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXHR9XG5cblx0ZGlzcG9zZSgpOiB2b2lkIHtcblx0XHR0aGlzLl9zdG9yZS5kaXNwb3NlKCk7XG5cdH1cbn1cbiJdLAogICJtYXBwaW5ncyI6ICI7Ozs7Ozs7Ozs7O0FBS0EsU0FBUyx1QkFBdUI7QUFDaEMsU0FBUyxTQUFTLDJCQUEyQjtBQUM3QyxTQUFTLHFCQUFxQixtQ0FBbUM7QUFFakUsU0FBUyxzQkFBc0I7QUFDL0IsU0FBUywyQkFBMkI7QUFFN0IsSUFBTSxpQ0FBTixNQUF1RTtBQUFBLEVBTTdFLFlBQ3NCLG9CQUNMLGVBQ2Esc0JBQzVCO0FBTkYsU0FBaUIsU0FBUyxJQUFJLGdCQUFnQjtBQVE3QyxVQUFNLFlBQVksb0JBQW9CLE1BQU0sY0FBYyx5QkFBeUIsTUFBTSxjQUFjLGtCQUFrQixPQUFPLFFBQVE7QUFFeEksU0FBSyxPQUFPLElBQUksUUFBUSxPQUFLO0FBRTVCLFlBQU0sU0FBUyxVQUFVLEtBQUssQ0FBQztBQUMvQixVQUFJLENBQUMsUUFBUTtBQUNaO0FBQUEsTUFDRDtBQUVBLFlBQU0sUUFBUSxtQkFBbUIsbUJBQW1CLEtBQUssQ0FBQyxFQUFFLEtBQUssYUFBVyxRQUFRLFVBQVUsUUFBUSxDQUFDLENBQUM7QUFDeEcsVUFBSSxPQUFPO0FBQ1YsNkJBQXFCLFdBQVcsb0JBQW9CLG9CQUFvQjtBQUFBLE1BQ3pFO0FBQUEsSUFDRCxDQUFDLENBQUM7QUFBQSxFQUNIO0FBQUEsRUFFQSxVQUFnQjtBQUNmLFNBQUssT0FBTyxRQUFRO0FBQUEsRUFDckI7QUFDRDtBQS9CYSwrQkFFSSxLQUFLO0FBRlQsaUNBQU47QUFBQSxFQU9KO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxHQVRVOyIsCiAgIm5hbWVzIjogW10KfQo=
