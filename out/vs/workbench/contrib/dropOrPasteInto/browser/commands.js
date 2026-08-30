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
import { toAction } from "../../../../base/common/actions.js";
import { CopyPasteController, pasteAsPreferenceConfig } from "../../../../editor/contrib/dropOrPasteInto/browser/copyPasteController.js";
import { DropIntoEditorController, dropAsPreferenceConfig } from "../../../../editor/contrib/dropOrPasteInto/browser/dropIntoEditorController.js";
import { localize } from "../../../../nls.js";
import { IPreferencesService } from "../../../services/preferences/common/preferences.js";
let DropOrPasteIntoCommands = class {
  constructor(_preferencesService) {
    this._preferencesService = _preferencesService;
    CopyPasteController.setConfigureDefaultAction(toAction({
      id: "workbench.action.configurePreferredPasteAction",
      label: localize("configureDefaultPaste.label", "Configure preferred paste action..."),
      run: () => this.configurePreferredPasteAction()
    }));
    DropIntoEditorController.setConfigureDefaultAction(toAction({
      id: "workbench.action.configurePreferredDropAction",
      label: localize("configureDefaultDrop.label", "Configure preferred drop action..."),
      run: () => this.configurePreferredDropAction()
    }));
  }
  configurePreferredPasteAction() {
    return this._preferencesService.openUserSettings({
      jsonEditor: true,
      revealSetting: { key: pasteAsPreferenceConfig, edit: true }
    });
  }
  configurePreferredDropAction() {
    return this._preferencesService.openUserSettings({
      jsonEditor: true,
      revealSetting: { key: dropAsPreferenceConfig, edit: true }
    });
  }
};
DropOrPasteIntoCommands.ID = "workbench.contrib.dropOrPasteInto";
DropOrPasteIntoCommands = __decorateClass([
  __decorateParam(0, IPreferencesService)
], DropOrPasteIntoCommands);
export {
  DropOrPasteIntoCommands
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXGRyb3BPclBhc3RlSW50b1xcYnJvd3NlclxcY29tbWFuZHMudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgeyB0b0FjdGlvbiB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2FjdGlvbnMuanMnO1xuaW1wb3J0IHsgQ29weVBhc3RlQ29udHJvbGxlciwgcGFzdGVBc1ByZWZlcmVuY2VDb25maWcgfSBmcm9tICcuLi8uLi8uLi8uLi9lZGl0b3IvY29udHJpYi9kcm9wT3JQYXN0ZUludG8vYnJvd3Nlci9jb3B5UGFzdGVDb250cm9sbGVyLmpzJztcbmltcG9ydCB7IERyb3BJbnRvRWRpdG9yQ29udHJvbGxlciwgZHJvcEFzUHJlZmVyZW5jZUNvbmZpZyB9IGZyb20gJy4uLy4uLy4uLy4uL2VkaXRvci9jb250cmliL2Ryb3BPclBhc3RlSW50by9icm93c2VyL2Ryb3BJbnRvRWRpdG9yQ29udHJvbGxlci5qcyc7XG5pbXBvcnQgeyBsb2NhbGl6ZSB9IGZyb20gJy4uLy4uLy4uLy4uL25scy5qcyc7XG5pbXBvcnQgeyBJV29ya2JlbmNoQ29udHJpYnV0aW9uIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2NvbnRyaWJ1dGlvbnMuanMnO1xuaW1wb3J0IHsgSVByZWZlcmVuY2VzU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL3NlcnZpY2VzL3ByZWZlcmVuY2VzL2NvbW1vbi9wcmVmZXJlbmNlcy5qcyc7XG5cbmV4cG9ydCBjbGFzcyBEcm9wT3JQYXN0ZUludG9Db21tYW5kcyBpbXBsZW1lbnRzIElXb3JrYmVuY2hDb250cmlidXRpb24ge1xuXHRwdWJsaWMgc3RhdGljIElEID0gJ3dvcmtiZW5jaC5jb250cmliLmRyb3BPclBhc3RlSW50byc7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0QElQcmVmZXJlbmNlc1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfcHJlZmVyZW5jZXNTZXJ2aWNlOiBJUHJlZmVyZW5jZXNTZXJ2aWNlXG5cdCkge1xuXHRcdENvcHlQYXN0ZUNvbnRyb2xsZXIuc2V0Q29uZmlndXJlRGVmYXVsdEFjdGlvbih0b0FjdGlvbih7XG5cdFx0XHRpZDogJ3dvcmtiZW5jaC5hY3Rpb24uY29uZmlndXJlUHJlZmVycmVkUGFzdGVBY3Rpb24nLFxuXHRcdFx0bGFiZWw6IGxvY2FsaXplKCdjb25maWd1cmVEZWZhdWx0UGFzdGUubGFiZWwnLCAnQ29uZmlndXJlIHByZWZlcnJlZCBwYXN0ZSBhY3Rpb24uLi4nKSxcblx0XHRcdHJ1bjogKCkgPT4gdGhpcy5jb25maWd1cmVQcmVmZXJyZWRQYXN0ZUFjdGlvbigpXG5cdFx0fSkpO1xuXG5cdFx0RHJvcEludG9FZGl0b3JDb250cm9sbGVyLnNldENvbmZpZ3VyZURlZmF1bHRBY3Rpb24odG9BY3Rpb24oe1xuXHRcdFx0aWQ6ICd3b3JrYmVuY2guYWN0aW9uLmNvbmZpZ3VyZVByZWZlcnJlZERyb3BBY3Rpb24nLFxuXHRcdFx0bGFiZWw6IGxvY2FsaXplKCdjb25maWd1cmVEZWZhdWx0RHJvcC5sYWJlbCcsICdDb25maWd1cmUgcHJlZmVycmVkIGRyb3AgYWN0aW9uLi4uJyksXG5cdFx0XHRydW46ICgpID0+IHRoaXMuY29uZmlndXJlUHJlZmVycmVkRHJvcEFjdGlvbigpXG5cdFx0fSkpO1xuXHR9XG5cblx0cHJpdmF0ZSBjb25maWd1cmVQcmVmZXJyZWRQYXN0ZUFjdGlvbigpIHtcblx0XHRyZXR1cm4gdGhpcy5fcHJlZmVyZW5jZXNTZXJ2aWNlLm9wZW5Vc2VyU2V0dGluZ3Moe1xuXHRcdFx0anNvbkVkaXRvcjogdHJ1ZSxcblx0XHRcdHJldmVhbFNldHRpbmc6IHsga2V5OiBwYXN0ZUFzUHJlZmVyZW5jZUNvbmZpZywgZWRpdDogdHJ1ZSB9XG5cdFx0fSk7XG5cdH1cblxuXHRwcml2YXRlIGNvbmZpZ3VyZVByZWZlcnJlZERyb3BBY3Rpb24oKSB7XG5cdFx0cmV0dXJuIHRoaXMuX3ByZWZlcmVuY2VzU2VydmljZS5vcGVuVXNlclNldHRpbmdzKHtcblx0XHRcdGpzb25FZGl0b3I6IHRydWUsXG5cdFx0XHRyZXZlYWxTZXR0aW5nOiB7IGtleTogZHJvcEFzUHJlZmVyZW5jZUNvbmZpZywgZWRpdDogdHJ1ZSB9XG5cdFx0fSk7XG5cdH1cbn1cbiJdLAogICJtYXBwaW5ncyI6ICI7Ozs7Ozs7Ozs7O0FBS0EsU0FBUyxnQkFBZ0I7QUFDekIsU0FBUyxxQkFBcUIsK0JBQStCO0FBQzdELFNBQVMsMEJBQTBCLDhCQUE4QjtBQUNqRSxTQUFTLGdCQUFnQjtBQUV6QixTQUFTLDJCQUEyQjtBQUU3QixJQUFNLDBCQUFOLE1BQWdFO0FBQUEsRUFHdEUsWUFDdUMscUJBQ3JDO0FBRHFDO0FBRXRDLHdCQUFvQiwwQkFBMEIsU0FBUztBQUFBLE1BQ3RELElBQUk7QUFBQSxNQUNKLE9BQU8sU0FBUywrQkFBK0IscUNBQXFDO0FBQUEsTUFDcEYsS0FBSyxNQUFNLEtBQUssOEJBQThCO0FBQUEsSUFDL0MsQ0FBQyxDQUFDO0FBRUYsNkJBQXlCLDBCQUEwQixTQUFTO0FBQUEsTUFDM0QsSUFBSTtBQUFBLE1BQ0osT0FBTyxTQUFTLDhCQUE4QixvQ0FBb0M7QUFBQSxNQUNsRixLQUFLLE1BQU0sS0FBSyw2QkFBNkI7QUFBQSxJQUM5QyxDQUFDLENBQUM7QUFBQSxFQUNIO0FBQUEsRUFFUSxnQ0FBZ0M7QUFDdkMsV0FBTyxLQUFLLG9CQUFvQixpQkFBaUI7QUFBQSxNQUNoRCxZQUFZO0FBQUEsTUFDWixlQUFlLEVBQUUsS0FBSyx5QkFBeUIsTUFBTSxLQUFLO0FBQUEsSUFDM0QsQ0FBQztBQUFBLEVBQ0Y7QUFBQSxFQUVRLCtCQUErQjtBQUN0QyxXQUFPLEtBQUssb0JBQW9CLGlCQUFpQjtBQUFBLE1BQ2hELFlBQVk7QUFBQSxNQUNaLGVBQWUsRUFBRSxLQUFLLHdCQUF3QixNQUFNLEtBQUs7QUFBQSxJQUMxRCxDQUFDO0FBQUEsRUFDRjtBQUNEO0FBaENhLHdCQUNFLEtBQUs7QUFEUCwwQkFBTjtBQUFBLEVBSUo7QUFBQSxHQUpVOyIsCiAgIm5hbWVzIjogW10KfQo=
