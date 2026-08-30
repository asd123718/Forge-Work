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
import { Disposable } from "../../../../base/common/lifecycle.js";
import { autorunWithStore, observableFromEvent } from "../../../../base/common/observable.js";
import { registerDiffEditorContribution } from "../../../../editor/browser/editorExtensions.js";
import { EmbeddedDiffEditorWidget } from "../../../../editor/browser/widget/diffEditor/embeddedDiffEditorWidget.js";
import { ITextResourceConfigurationService } from "../../../../editor/common/services/textResourceConfiguration.js";
import { localize } from "../../../../nls.js";
import { AccessibleViewRegistry } from "../../../../platform/accessibility/browser/accessibleViewRegistry.js";
import { IInstantiationService } from "../../../../platform/instantiation/common/instantiation.js";
import { INotificationService, Severity } from "../../../../platform/notification/common/notification.js";
import { Registry } from "../../../../platform/registry/common/platform.js";
import { FloatingEditorClickWidget } from "../../../browser/codeeditor.js";
import { Extensions } from "../../../common/configuration.js";
import { DiffEditorAccessibilityHelp } from "./diffEditorAccessibilityHelp.js";
let DiffEditorHelperContribution = class extends Disposable {
  constructor(_diffEditor, _instantiationService, _textResourceConfigurationService, _notificationService) {
    super();
    this._diffEditor = _diffEditor;
    this._instantiationService = _instantiationService;
    this._textResourceConfigurationService = _textResourceConfigurationService;
    this._notificationService = _notificationService;
    const isEmbeddedDiffEditor = this._diffEditor instanceof EmbeddedDiffEditorWidget;
    if (!isEmbeddedDiffEditor) {
      const computationResult = observableFromEvent(this, (e) => this._diffEditor.onDidUpdateDiff(e), () => (
        /** @description diffEditor.diffComputationResult */
        this._diffEditor.getDiffComputationResult()
      ));
      const onlyWhiteSpaceChange = computationResult.map((r) => r && !r.identical && r.changes2.length === 0);
      this._register(autorunWithStore((reader, store) => {
        if (onlyWhiteSpaceChange.read(reader)) {
          const helperWidget = store.add(this._instantiationService.createInstance(
            FloatingEditorClickWidget,
            this._diffEditor.getModifiedEditor(),
            localize("hintWhitespace", "Show Whitespace Differences"),
            null
          ));
          store.add(helperWidget.onClick(() => {
            this._textResourceConfigurationService.updateValue(this._diffEditor.getModel().modified.uri, "diffEditor.ignoreTrimWhitespace", false);
          }));
          helperWidget.render();
        }
      }));
      this._register(this._diffEditor.onDidUpdateDiff(() => {
        const diffComputationResult = this._diffEditor.getDiffComputationResult();
        if (diffComputationResult && diffComputationResult.quitEarly) {
          this._notificationService.prompt(
            Severity.Warning,
            localize("hintTimeout", "The diff algorithm was stopped early (after {0} ms.)", this._diffEditor.maxComputationTime),
            [{
              label: localize("removeTimeout", "Remove Limit"),
              run: () => {
                this._textResourceConfigurationService.updateValue(this._diffEditor.getModel().modified.uri, "diffEditor.maxComputationTime", 0);
              }
            }],
            {}
          );
        }
      }));
    }
  }
};
DiffEditorHelperContribution.ID = "editor.contrib.diffEditorHelper";
DiffEditorHelperContribution = __decorateClass([
  __decorateParam(1, IInstantiationService),
  __decorateParam(2, ITextResourceConfigurationService),
  __decorateParam(3, INotificationService)
], DiffEditorHelperContribution);
registerDiffEditorContribution(DiffEditorHelperContribution.ID, DiffEditorHelperContribution);
Registry.as(Extensions.ConfigurationMigration).registerConfigurationMigrations([{
  key: "diffEditor.experimental.collapseUnchangedRegions",
  migrateFn: (value, accessor) => {
    return [
      ["diffEditor.hideUnchangedRegions.enabled", { value }],
      ["diffEditor.experimental.collapseUnchangedRegions", { value: void 0 }]
    ];
  }
}]);
AccessibleViewRegistry.register(new DiffEditorAccessibilityHelp());
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXGNvZGVFZGl0b3JcXGJyb3dzZXJcXGRpZmZFZGl0b3JIZWxwZXIudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgeyBEaXNwb3NhYmxlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IGF1dG9ydW5XaXRoU3RvcmUsIG9ic2VydmFibGVGcm9tRXZlbnQgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9vYnNlcnZhYmxlLmpzJztcbmltcG9ydCB7IElEaWZmRWRpdG9yIH0gZnJvbSAnLi4vLi4vLi4vLi4vZWRpdG9yL2Jyb3dzZXIvZWRpdG9yQnJvd3Nlci5qcyc7XG5pbXBvcnQgeyByZWdpc3RlckRpZmZFZGl0b3JDb250cmlidXRpb24gfSBmcm9tICcuLi8uLi8uLi8uLi9lZGl0b3IvYnJvd3Nlci9lZGl0b3JFeHRlbnNpb25zLmpzJztcbmltcG9ydCB7IEVtYmVkZGVkRGlmZkVkaXRvcldpZGdldCB9IGZyb20gJy4uLy4uLy4uLy4uL2VkaXRvci9icm93c2VyL3dpZGdldC9kaWZmRWRpdG9yL2VtYmVkZGVkRGlmZkVkaXRvcldpZGdldC5qcyc7XG5pbXBvcnQgeyBJRGlmZkVkaXRvckNvbnRyaWJ1dGlvbiB9IGZyb20gJy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vZWRpdG9yQ29tbW9uLmpzJztcbmltcG9ydCB7IElUZXh0UmVzb3VyY2VDb25maWd1cmF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL2VkaXRvci9jb21tb24vc2VydmljZXMvdGV4dFJlc291cmNlQ29uZmlndXJhdGlvbi5qcyc7XG5pbXBvcnQgeyBsb2NhbGl6ZSB9IGZyb20gJy4uLy4uLy4uLy4uL25scy5qcyc7XG5pbXBvcnQgeyBBY2Nlc3NpYmxlVmlld1JlZ2lzdHJ5IH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vYWNjZXNzaWJpbGl0eS9icm93c2VyL2FjY2Vzc2libGVWaWV3UmVnaXN0cnkuanMnO1xuaW1wb3J0IHsgSUluc3RhbnRpYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vaW5zdGFudGlhdGlvbi9jb21tb24vaW5zdGFudGlhdGlvbi5qcyc7XG5pbXBvcnQgeyBJTm90aWZpY2F0aW9uU2VydmljZSwgU2V2ZXJpdHkgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9ub3RpZmljYXRpb24vY29tbW9uL25vdGlmaWNhdGlvbi5qcyc7XG5pbXBvcnQgeyBSZWdpc3RyeSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3JlZ2lzdHJ5L2NvbW1vbi9wbGF0Zm9ybS5qcyc7XG5pbXBvcnQgeyBGbG9hdGluZ0VkaXRvckNsaWNrV2lkZ2V0IH0gZnJvbSAnLi4vLi4vLi4vYnJvd3Nlci9jb2RlZWRpdG9yLmpzJztcbmltcG9ydCB7IEV4dGVuc2lvbnMsIElDb25maWd1cmF0aW9uTWlncmF0aW9uUmVnaXN0cnkgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vY29uZmlndXJhdGlvbi5qcyc7XG5pbXBvcnQgeyBEaWZmRWRpdG9yQWNjZXNzaWJpbGl0eUhlbHAgfSBmcm9tICcuL2RpZmZFZGl0b3JBY2Nlc3NpYmlsaXR5SGVscC5qcyc7XG5cbmNsYXNzIERpZmZFZGl0b3JIZWxwZXJDb250cmlidXRpb24gZXh0ZW5kcyBEaXNwb3NhYmxlIGltcGxlbWVudHMgSURpZmZFZGl0b3JDb250cmlidXRpb24ge1xuXHRwdWJsaWMgc3RhdGljIHJlYWRvbmx5IElEID0gJ2VkaXRvci5jb250cmliLmRpZmZFZGl0b3JIZWxwZXInO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgX2RpZmZFZGl0b3I6IElEaWZmRWRpdG9yLFxuXHRcdEBJSW5zdGFudGlhdGlvblNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfaW5zdGFudGlhdGlvblNlcnZpY2U6IElJbnN0YW50aWF0aW9uU2VydmljZSxcblx0XHRASVRleHRSZXNvdXJjZUNvbmZpZ3VyYXRpb25TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX3RleHRSZXNvdXJjZUNvbmZpZ3VyYXRpb25TZXJ2aWNlOiBJVGV4dFJlc291cmNlQ29uZmlndXJhdGlvblNlcnZpY2UsXG5cdFx0QElOb3RpZmljYXRpb25TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX25vdGlmaWNhdGlvblNlcnZpY2U6IElOb3RpZmljYXRpb25TZXJ2aWNlLFxuXHQpIHtcblx0XHRzdXBlcigpO1xuXG5cdFx0Y29uc3QgaXNFbWJlZGRlZERpZmZFZGl0b3IgPSB0aGlzLl9kaWZmRWRpdG9yIGluc3RhbmNlb2YgRW1iZWRkZWREaWZmRWRpdG9yV2lkZ2V0O1xuXG5cdFx0aWYgKCFpc0VtYmVkZGVkRGlmZkVkaXRvcikge1xuXHRcdFx0Y29uc3QgY29tcHV0YXRpb25SZXN1bHQgPSBvYnNlcnZhYmxlRnJvbUV2ZW50KHRoaXMsIGUgPT4gdGhpcy5fZGlmZkVkaXRvci5vbkRpZFVwZGF0ZURpZmYoZSksICgpID0+IC8qKiBAZGVzY3JpcHRpb24gZGlmZkVkaXRvci5kaWZmQ29tcHV0YXRpb25SZXN1bHQgKi8gdGhpcy5fZGlmZkVkaXRvci5nZXREaWZmQ29tcHV0YXRpb25SZXN1bHQoKSk7XG5cdFx0XHRjb25zdCBvbmx5V2hpdGVTcGFjZUNoYW5nZSA9IGNvbXB1dGF0aW9uUmVzdWx0Lm1hcChyID0+IHIgJiYgIXIuaWRlbnRpY2FsICYmIHIuY2hhbmdlczIubGVuZ3RoID09PSAwKTtcblxuXHRcdFx0dGhpcy5fcmVnaXN0ZXIoYXV0b3J1bldpdGhTdG9yZSgocmVhZGVyLCBzdG9yZSkgPT4ge1xuXHRcdFx0XHQvKiogQGRlc2NyaXB0aW9uIHVwZGF0ZSBzdGF0ZSAqL1xuXHRcdFx0XHRpZiAob25seVdoaXRlU3BhY2VDaGFuZ2UucmVhZChyZWFkZXIpKSB7XG5cdFx0XHRcdFx0Y29uc3QgaGVscGVyV2lkZ2V0ID0gc3RvcmUuYWRkKHRoaXMuX2luc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFxuXHRcdFx0XHRcdFx0RmxvYXRpbmdFZGl0b3JDbGlja1dpZGdldCxcblx0XHRcdFx0XHRcdHRoaXMuX2RpZmZFZGl0b3IuZ2V0TW9kaWZpZWRFZGl0b3IoKSxcblx0XHRcdFx0XHRcdGxvY2FsaXplKCdoaW50V2hpdGVzcGFjZScsIFwiU2hvdyBXaGl0ZXNwYWNlIERpZmZlcmVuY2VzXCIpLFxuXHRcdFx0XHRcdFx0bnVsbFxuXHRcdFx0XHRcdCkpO1xuXHRcdFx0XHRcdHN0b3JlLmFkZChoZWxwZXJXaWRnZXQub25DbGljaygoKSA9PiB7XG5cdFx0XHRcdFx0XHR0aGlzLl90ZXh0UmVzb3VyY2VDb25maWd1cmF0aW9uU2VydmljZS51cGRhdGVWYWx1ZSh0aGlzLl9kaWZmRWRpdG9yLmdldE1vZGVsKCkhLm1vZGlmaWVkLnVyaSwgJ2RpZmZFZGl0b3IuaWdub3JlVHJpbVdoaXRlc3BhY2UnLCBmYWxzZSk7XG5cdFx0XHRcdFx0fSkpO1xuXHRcdFx0XHRcdGhlbHBlcldpZGdldC5yZW5kZXIoKTtcblx0XHRcdFx0fVxuXHRcdFx0fSkpO1xuXG5cdFx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLl9kaWZmRWRpdG9yLm9uRGlkVXBkYXRlRGlmZigoKSA9PiB7XG5cdFx0XHRcdGNvbnN0IGRpZmZDb21wdXRhdGlvblJlc3VsdCA9IHRoaXMuX2RpZmZFZGl0b3IuZ2V0RGlmZkNvbXB1dGF0aW9uUmVzdWx0KCk7XG5cblx0XHRcdFx0aWYgKGRpZmZDb21wdXRhdGlvblJlc3VsdCAmJiBkaWZmQ29tcHV0YXRpb25SZXN1bHQucXVpdEVhcmx5KSB7XG5cdFx0XHRcdFx0dGhpcy5fbm90aWZpY2F0aW9uU2VydmljZS5wcm9tcHQoXG5cdFx0XHRcdFx0XHRTZXZlcml0eS5XYXJuaW5nLFxuXHRcdFx0XHRcdFx0bG9jYWxpemUoJ2hpbnRUaW1lb3V0JywgXCJUaGUgZGlmZiBhbGdvcml0aG0gd2FzIHN0b3BwZWQgZWFybHkgKGFmdGVyIHswfSBtcy4pXCIsIHRoaXMuX2RpZmZFZGl0b3IubWF4Q29tcHV0YXRpb25UaW1lKSxcblx0XHRcdFx0XHRcdFt7XG5cdFx0XHRcdFx0XHRcdGxhYmVsOiBsb2NhbGl6ZSgncmVtb3ZlVGltZW91dCcsIFwiUmVtb3ZlIExpbWl0XCIpLFxuXHRcdFx0XHRcdFx0XHRydW46ICgpID0+IHtcblx0XHRcdFx0XHRcdFx0XHR0aGlzLl90ZXh0UmVzb3VyY2VDb25maWd1cmF0aW9uU2VydmljZS51cGRhdGVWYWx1ZSh0aGlzLl9kaWZmRWRpdG9yLmdldE1vZGVsKCkhLm1vZGlmaWVkLnVyaSwgJ2RpZmZFZGl0b3IubWF4Q29tcHV0YXRpb25UaW1lJywgMCk7XG5cdFx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdH1dLFxuXHRcdFx0XHRcdFx0e31cblx0XHRcdFx0XHQpO1xuXHRcdFx0XHR9XG5cdFx0XHR9KSk7XG5cdFx0fVxuXHR9XG59XG5cbnJlZ2lzdGVyRGlmZkVkaXRvckNvbnRyaWJ1dGlvbihEaWZmRWRpdG9ySGVscGVyQ29udHJpYnV0aW9uLklELCBEaWZmRWRpdG9ySGVscGVyQ29udHJpYnV0aW9uKTtcblxuUmVnaXN0cnkuYXM8SUNvbmZpZ3VyYXRpb25NaWdyYXRpb25SZWdpc3RyeT4oRXh0ZW5zaW9ucy5Db25maWd1cmF0aW9uTWlncmF0aW9uKVxuXHQucmVnaXN0ZXJDb25maWd1cmF0aW9uTWlncmF0aW9ucyhbe1xuXHRcdGtleTogJ2RpZmZFZGl0b3IuZXhwZXJpbWVudGFsLmNvbGxhcHNlVW5jaGFuZ2VkUmVnaW9ucycsXG5cdFx0bWlncmF0ZUZuOiAodmFsdWUsIGFjY2Vzc29yKSA9PiB7XG5cdFx0XHRyZXR1cm4gW1xuXHRcdFx0XHRbJ2RpZmZFZGl0b3IuaGlkZVVuY2hhbmdlZFJlZ2lvbnMuZW5hYmxlZCcsIHsgdmFsdWUgfV0sXG5cdFx0XHRcdFsnZGlmZkVkaXRvci5leHBlcmltZW50YWwuY29sbGFwc2VVbmNoYW5nZWRSZWdpb25zJywgeyB2YWx1ZTogdW5kZWZpbmVkIH1dXG5cdFx0XHRdO1xuXHRcdH1cblx0fV0pO1xuQWNjZXNzaWJsZVZpZXdSZWdpc3RyeS5yZWdpc3RlcihuZXcgRGlmZkVkaXRvckFjY2Vzc2liaWxpdHlIZWxwKCkpO1xuIl0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7Ozs7QUFLQSxTQUFTLGtCQUFrQjtBQUMzQixTQUFTLGtCQUFrQiwyQkFBMkI7QUFFdEQsU0FBUyxzQ0FBc0M7QUFDL0MsU0FBUyxnQ0FBZ0M7QUFFekMsU0FBUyx5Q0FBeUM7QUFDbEQsU0FBUyxnQkFBZ0I7QUFDekIsU0FBUyw4QkFBOEI7QUFDdkMsU0FBUyw2QkFBNkI7QUFDdEMsU0FBUyxzQkFBc0IsZ0JBQWdCO0FBQy9DLFNBQVMsZ0JBQWdCO0FBQ3pCLFNBQVMsaUNBQWlDO0FBQzFDLFNBQVMsa0JBQW1EO0FBQzVELFNBQVMsbUNBQW1DO0FBRTVDLElBQU0sK0JBQU4sY0FBMkMsV0FBOEM7QUFBQSxFQUd4RixZQUNrQixhQUN1Qix1QkFDWSxtQ0FDYixzQkFDdEM7QUFDRCxVQUFNO0FBTFc7QUFDdUI7QUFDWTtBQUNiO0FBSXZDLFVBQU0sdUJBQXVCLEtBQUssdUJBQXVCO0FBRXpELFFBQUksQ0FBQyxzQkFBc0I7QUFDMUIsWUFBTSxvQkFBb0Isb0JBQW9CLE1BQU0sT0FBSyxLQUFLLFlBQVksZ0JBQWdCLENBQUMsR0FBRztBQUFBO0FBQUEsUUFBMkQsS0FBSyxZQUFZLHlCQUF5QjtBQUFBLE9BQUM7QUFDcE0sWUFBTSx1QkFBdUIsa0JBQWtCLElBQUksT0FBSyxLQUFLLENBQUMsRUFBRSxhQUFhLEVBQUUsU0FBUyxXQUFXLENBQUM7QUFFcEcsV0FBSyxVQUFVLGlCQUFpQixDQUFDLFFBQVEsVUFBVTtBQUVsRCxZQUFJLHFCQUFxQixLQUFLLE1BQU0sR0FBRztBQUN0QyxnQkFBTSxlQUFlLE1BQU0sSUFBSSxLQUFLLHNCQUFzQjtBQUFBLFlBQ3pEO0FBQUEsWUFDQSxLQUFLLFlBQVksa0JBQWtCO0FBQUEsWUFDbkMsU0FBUyxrQkFBa0IsNkJBQTZCO0FBQUEsWUFDeEQ7QUFBQSxVQUNELENBQUM7QUFDRCxnQkFBTSxJQUFJLGFBQWEsUUFBUSxNQUFNO0FBQ3BDLGlCQUFLLGtDQUFrQyxZQUFZLEtBQUssWUFBWSxTQUFTLEVBQUcsU0FBUyxLQUFLLG1DQUFtQyxLQUFLO0FBQUEsVUFDdkksQ0FBQyxDQUFDO0FBQ0YsdUJBQWEsT0FBTztBQUFBLFFBQ3JCO0FBQUEsTUFDRCxDQUFDLENBQUM7QUFFRixXQUFLLFVBQVUsS0FBSyxZQUFZLGdCQUFnQixNQUFNO0FBQ3JELGNBQU0sd0JBQXdCLEtBQUssWUFBWSx5QkFBeUI7QUFFeEUsWUFBSSx5QkFBeUIsc0JBQXNCLFdBQVc7QUFDN0QsZUFBSyxxQkFBcUI7QUFBQSxZQUN6QixTQUFTO0FBQUEsWUFDVCxTQUFTLGVBQWUsd0RBQXdELEtBQUssWUFBWSxrQkFBa0I7QUFBQSxZQUNuSCxDQUFDO0FBQUEsY0FDQSxPQUFPLFNBQVMsaUJBQWlCLGNBQWM7QUFBQSxjQUMvQyxLQUFLLE1BQU07QUFDVixxQkFBSyxrQ0FBa0MsWUFBWSxLQUFLLFlBQVksU0FBUyxFQUFHLFNBQVMsS0FBSyxpQ0FBaUMsQ0FBQztBQUFBLGNBQ2pJO0FBQUEsWUFDRCxDQUFDO0FBQUEsWUFDRCxDQUFDO0FBQUEsVUFDRjtBQUFBLFFBQ0Q7QUFBQSxNQUNELENBQUMsQ0FBQztBQUFBLElBQ0g7QUFBQSxFQUNEO0FBQ0Q7QUFwRE0sNkJBQ2tCLEtBQUs7QUFEdkIsK0JBQU47QUFBQSxFQUtHO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxHQVBHO0FBc0ROLCtCQUErQiw2QkFBNkIsSUFBSSw0QkFBNEI7QUFFNUYsU0FBUyxHQUFvQyxXQUFXLHNCQUFzQixFQUM1RSxnQ0FBZ0MsQ0FBQztBQUFBLEVBQ2pDLEtBQUs7QUFBQSxFQUNMLFdBQVcsQ0FBQyxPQUFPLGFBQWE7QUFDL0IsV0FBTztBQUFBLE1BQ04sQ0FBQywyQ0FBMkMsRUFBRSxNQUFNLENBQUM7QUFBQSxNQUNyRCxDQUFDLG9EQUFvRCxFQUFFLE9BQU8sT0FBVSxDQUFDO0FBQUEsSUFDMUU7QUFBQSxFQUNEO0FBQ0QsQ0FBQyxDQUFDO0FBQ0gsdUJBQXVCLFNBQVMsSUFBSSw0QkFBNEIsQ0FBQzsiLAogICJuYW1lcyI6IFtdCn0K
