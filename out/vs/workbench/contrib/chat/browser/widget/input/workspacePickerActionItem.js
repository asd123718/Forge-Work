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
import * as dom from "../../../../../../base/browser/dom.js";
import { renderLabelWithIcons } from "../../../../../../base/browser/ui/iconLabel/iconLabels.js";
import { basename } from "../../../../../../base/common/resources.js";
import { localize } from "../../../../../../nls.js";
import { IActionWidgetService } from "../../../../../../platform/actionWidget/browser/actionWidget.js";
import { ICommandService } from "../../../../../../platform/commands/common/commands.js";
import { IContextKeyService } from "../../../../../../platform/contextkey/common/contextkey.js";
import { IKeybindingService } from "../../../../../../platform/keybinding/common/keybinding.js";
import { ITelemetryService } from "../../../../../../platform/telemetry/common/telemetry.js";
import { ChatInputPickerActionViewItem } from "./chatInputPickerActionItem.js";
let WorkspacePickerActionItem = class extends ChatInputPickerActionViewItem {
  constructor(action, delegate, pickerOptions, actionWidgetService, keybindingService, contextKeyService, commandService, telemetryService) {
    const actionProvider = {
      getActions: () => {
        const currentWorkspace = this.delegate.getSelectedWorkspace();
        const workspaces = this.delegate.getWorkspaces();
        const actions = workspaces.map((workspace) => ({
          ...action,
          id: `workspace.${workspace.uri.toString()}`,
          label: workspace.label,
          checked: currentWorkspace?.uri.toString() === workspace.uri.toString(),
          icon: workspace.isFolder ? { id: "folder" } : { id: "file-symlink-directory" },
          enabled: true,
          tooltip: workspace.uri.fsPath,
          run: async () => {
            this.delegate.setSelectedWorkspace(workspace);
            if (this.element) {
              this.renderLabel(this.element);
            }
          }
        }));
        actions.push({
          ...action,
          id: "workspace.openFolder",
          label: localize("openFolder", "Open Folder..."),
          checked: false,
          enabled: true,
          tooltip: localize("openFolderTooltip", "Open Folder..."),
          run: async () => {
            this.commandService.executeCommand(this.delegate.openFolderCommand);
          }
        });
        return actions;
      }
    };
    const actionBarActionProvider = {
      getActions: () => []
    };
    const workspacePickerOptions = {
      actionProvider,
      actionBarActionProvider,
      showItemKeybindings: false,
      reporter: { id: "ChatWorkspacePicker", name: "ChatWorkspacePicker", includeOptions: false }
    };
    super(action, workspacePickerOptions, pickerOptions, actionWidgetService, keybindingService, contextKeyService, telemetryService);
    this.delegate = delegate;
    this.commandService = commandService;
    this._register(this.delegate.onDidChangeSelectedWorkspace(() => {
      if (this.element) {
        this.renderLabel(this.element);
      }
    }));
    this._register(this.delegate.onDidChangeWorkspaces(() => {
      if (this.element) {
        this.renderLabel(this.element);
      }
    }));
  }
  renderLabel(element) {
    this.setAriaLabelAttributes(element);
    const currentWorkspace = this.delegate.getSelectedWorkspace();
    const labelElements = [];
    if (currentWorkspace) {
      const label = currentWorkspace.label || basename(currentWorkspace.uri);
      labelElements.push(...renderLabelWithIcons(`$(folder)`));
      labelElements.push(dom.$("span.chat-input-picker-label", void 0, label));
    } else {
      labelElements.push(...renderLabelWithIcons(`$(folder)`));
      labelElements.push(dom.$("span.chat-input-picker-label", void 0, localize("selectWorkspace", "Workspace")));
    }
    dom.reset(element, ...labelElements);
    return null;
  }
};
WorkspacePickerActionItem = __decorateClass([
  __decorateParam(3, IActionWidgetService),
  __decorateParam(4, IKeybindingService),
  __decorateParam(5, IContextKeyService),
  __decorateParam(6, ICommandService),
  __decorateParam(7, ITelemetryService)
], WorkspacePickerActionItem);
export {
  WorkspacePickerActionItem
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXGNoYXRcXGJyb3dzZXJcXHdpZGdldFxcaW5wdXRcXHdvcmtzcGFjZVBpY2tlckFjdGlvbkl0ZW0udHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgKiBhcyBkb20gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL2RvbS5qcyc7XG5pbXBvcnQgeyByZW5kZXJMYWJlbFdpdGhJY29ucyB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci91aS9pY29uTGFiZWwvaWNvbkxhYmVscy5qcyc7XG5cbmltcG9ydCB7IElEaXNwb3NhYmxlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IGJhc2VuYW1lIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vcmVzb3VyY2VzLmpzJztcbmltcG9ydCB7IGxvY2FsaXplIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vbmxzLmpzJztcbmltcG9ydCB7IE1lbnVJdGVtQWN0aW9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vYWN0aW9ucy9jb21tb24vYWN0aW9ucy5qcyc7XG5pbXBvcnQgeyBJQWN0aW9uV2lkZ2V0U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2FjdGlvbldpZGdldC9icm93c2VyL2FjdGlvbldpZGdldC5qcyc7XG5pbXBvcnQgeyBJQWN0aW9uV2lkZ2V0RHJvcGRvd25BY3Rpb24sIElBY3Rpb25XaWRnZXREcm9wZG93bkFjdGlvblByb3ZpZGVyLCBJQWN0aW9uV2lkZ2V0RHJvcGRvd25PcHRpb25zIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vYWN0aW9uV2lkZ2V0L2Jyb3dzZXIvYWN0aW9uV2lkZ2V0RHJvcGRvd24uanMnO1xuaW1wb3J0IHsgSUNvbW1hbmRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29tbWFuZHMvY29tbW9uL2NvbW1hbmRzLmpzJztcbmltcG9ydCB7IElDb250ZXh0S2V5U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbnRleHRrZXkvY29tbW9uL2NvbnRleHRrZXkuanMnO1xuaW1wb3J0IHsgSUtleWJpbmRpbmdTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0va2V5YmluZGluZy9jb21tb24va2V5YmluZGluZy5qcyc7XG5pbXBvcnQgeyBJVGVsZW1ldHJ5U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL3RlbGVtZXRyeS9jb21tb24vdGVsZW1ldHJ5LmpzJztcbmltcG9ydCB7IENoYXRJbnB1dFBpY2tlckFjdGlvblZpZXdJdGVtLCBJQ2hhdElucHV0UGlja2VyT3B0aW9ucyB9IGZyb20gJy4vY2hhdElucHV0UGlja2VyQWN0aW9uSXRlbS5qcyc7XG5pbXBvcnQgeyBJV29ya3NwYWNlUGlja2VyRGVsZWdhdGUgfSBmcm9tICcuLi8uLi9jaGF0LmpzJztcbmltcG9ydCB7IElBY3Rpb25Qcm92aWRlciB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci91aS9kcm9wZG93bi9kcm9wZG93bi5qcyc7XG5cbi8qKlxuICogQWN0aW9uIHZpZXcgaXRlbSBmb3Igc2VsZWN0aW5nIGEgdGFyZ2V0IHdvcmtzcGFjZSBpbiB0aGUgY2hhdCBpbnRlcmZhY2UuXG4gKiBUaGlzIHBpY2tlciBhbGxvd3Mgc2VsZWN0aW5nIGEgcmVjZW50IHdvcmtzcGFjZSB0byBydW4gdGhlIGNoYXQgcmVxdWVzdCBpbixcbiAqIHdoaWNoIGlzIHVzZWZ1bCBmb3IgZW1wdHkgd2luZG93IGNvbnRleHRzLlxuICovXG5leHBvcnQgY2xhc3MgV29ya3NwYWNlUGlja2VyQWN0aW9uSXRlbSBleHRlbmRzIENoYXRJbnB1dFBpY2tlckFjdGlvblZpZXdJdGVtIHtcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRhY3Rpb246IE1lbnVJdGVtQWN0aW9uLFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgZGVsZWdhdGU6IElXb3Jrc3BhY2VQaWNrZXJEZWxlZ2F0ZSxcblx0XHRwaWNrZXJPcHRpb25zOiBJQ2hhdElucHV0UGlja2VyT3B0aW9ucyxcblx0XHRASUFjdGlvbldpZGdldFNlcnZpY2UgYWN0aW9uV2lkZ2V0U2VydmljZTogSUFjdGlvbldpZGdldFNlcnZpY2UsXG5cdFx0QElLZXliaW5kaW5nU2VydmljZSBrZXliaW5kaW5nU2VydmljZTogSUtleWJpbmRpbmdTZXJ2aWNlLFxuXHRcdEBJQ29udGV4dEtleVNlcnZpY2UgY29udGV4dEtleVNlcnZpY2U6IElDb250ZXh0S2V5U2VydmljZSxcblx0XHRASUNvbW1hbmRTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgY29tbWFuZFNlcnZpY2U6IElDb21tYW5kU2VydmljZSxcblx0XHRASVRlbGVtZXRyeVNlcnZpY2UgdGVsZW1ldHJ5U2VydmljZTogSVRlbGVtZXRyeVNlcnZpY2UsXG5cdCkge1xuXHRcdGNvbnN0IGFjdGlvblByb3ZpZGVyOiBJQWN0aW9uV2lkZ2V0RHJvcGRvd25BY3Rpb25Qcm92aWRlciA9IHtcblx0XHRcdGdldEFjdGlvbnM6ICgpID0+IHtcblx0XHRcdFx0Y29uc3QgY3VycmVudFdvcmtzcGFjZSA9IHRoaXMuZGVsZWdhdGUuZ2V0U2VsZWN0ZWRXb3Jrc3BhY2UoKTtcblx0XHRcdFx0Y29uc3Qgd29ya3NwYWNlcyA9IHRoaXMuZGVsZWdhdGUuZ2V0V29ya3NwYWNlcygpO1xuXG5cdFx0XHRcdGNvbnN0IGFjdGlvbnM6IElBY3Rpb25XaWRnZXREcm9wZG93bkFjdGlvbltdID0gd29ya3NwYWNlcy5tYXAod29ya3NwYWNlID0+ICh7XG5cdFx0XHRcdFx0Li4uYWN0aW9uLFxuXHRcdFx0XHRcdGlkOiBgd29ya3NwYWNlLiR7d29ya3NwYWNlLnVyaS50b1N0cmluZygpfWAsXG5cdFx0XHRcdFx0bGFiZWw6IHdvcmtzcGFjZS5sYWJlbCxcblx0XHRcdFx0XHRjaGVja2VkOiBjdXJyZW50V29ya3NwYWNlPy51cmkudG9TdHJpbmcoKSA9PT0gd29ya3NwYWNlLnVyaS50b1N0cmluZygpLFxuXHRcdFx0XHRcdGljb246IHdvcmtzcGFjZS5pc0ZvbGRlciA/IHsgaWQ6ICdmb2xkZXInIH0gOiB7IGlkOiAnZmlsZS1zeW1saW5rLWRpcmVjdG9yeScgfSxcblx0XHRcdFx0XHRlbmFibGVkOiB0cnVlLFxuXHRcdFx0XHRcdHRvb2x0aXA6IHdvcmtzcGFjZS51cmkuZnNQYXRoLFxuXHRcdFx0XHRcdHJ1bjogYXN5bmMgKCkgPT4ge1xuXHRcdFx0XHRcdFx0dGhpcy5kZWxlZ2F0ZS5zZXRTZWxlY3RlZFdvcmtzcGFjZSh3b3Jrc3BhY2UpO1xuXHRcdFx0XHRcdFx0aWYgKHRoaXMuZWxlbWVudCkge1xuXHRcdFx0XHRcdFx0XHR0aGlzLnJlbmRlckxhYmVsKHRoaXMuZWxlbWVudCk7XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0fSxcblx0XHRcdFx0fSkpO1xuXG5cdFx0XHRcdC8vIEFkZCBcIk9wZW4gRm9sZGVyLi4uXCIgb3B0aW9uXG5cdFx0XHRcdGFjdGlvbnMucHVzaCh7XG5cdFx0XHRcdFx0Li4uYWN0aW9uLFxuXHRcdFx0XHRcdGlkOiAnd29ya3NwYWNlLm9wZW5Gb2xkZXInLFxuXHRcdFx0XHRcdGxhYmVsOiBsb2NhbGl6ZSgnb3BlbkZvbGRlcicsIFwiT3BlbiBGb2xkZXIuLi5cIiksXG5cdFx0XHRcdFx0Y2hlY2tlZDogZmFsc2UsXG5cdFx0XHRcdFx0ZW5hYmxlZDogdHJ1ZSxcblx0XHRcdFx0XHR0b29sdGlwOiBsb2NhbGl6ZSgnb3BlbkZvbGRlclRvb2x0aXAnLCBcIk9wZW4gRm9sZGVyLi4uXCIpLFxuXHRcdFx0XHRcdHJ1bjogYXN5bmMgKCkgPT4ge1xuXHRcdFx0XHRcdFx0dGhpcy5jb21tYW5kU2VydmljZS5leGVjdXRlQ29tbWFuZCh0aGlzLmRlbGVnYXRlLm9wZW5Gb2xkZXJDb21tYW5kKTtcblx0XHRcdFx0XHR9LFxuXHRcdFx0XHR9KTtcblxuXHRcdFx0XHRyZXR1cm4gYWN0aW9ucztcblx0XHRcdH1cblx0XHR9O1xuXG5cdFx0Y29uc3QgYWN0aW9uQmFyQWN0aW9uUHJvdmlkZXI6IElBY3Rpb25Qcm92aWRlciA9IHtcblx0XHRcdGdldEFjdGlvbnM6ICgpID0+IFtdXG5cdFx0fTtcblxuXHRcdGNvbnN0IHdvcmtzcGFjZVBpY2tlck9wdGlvbnM6IE9taXQ8SUFjdGlvbldpZGdldERyb3Bkb3duT3B0aW9ucywgJ2xhYmVsJyB8ICdsYWJlbFJlbmRlcmVyJz4gPSB7XG5cdFx0XHRhY3Rpb25Qcm92aWRlcixcblx0XHRcdGFjdGlvbkJhckFjdGlvblByb3ZpZGVyLFxuXHRcdFx0c2hvd0l0ZW1LZXliaW5kaW5nczogZmFsc2UsXG5cdFx0XHRyZXBvcnRlcjogeyBpZDogJ0NoYXRXb3Jrc3BhY2VQaWNrZXInLCBuYW1lOiAnQ2hhdFdvcmtzcGFjZVBpY2tlcicsIGluY2x1ZGVPcHRpb25zOiBmYWxzZSB9LFxuXHRcdH07XG5cblx0XHRzdXBlcihhY3Rpb24sIHdvcmtzcGFjZVBpY2tlck9wdGlvbnMsIHBpY2tlck9wdGlvbnMsIGFjdGlvbldpZGdldFNlcnZpY2UsIGtleWJpbmRpbmdTZXJ2aWNlLCBjb250ZXh0S2V5U2VydmljZSwgdGVsZW1ldHJ5U2VydmljZSk7XG5cblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLmRlbGVnYXRlLm9uRGlkQ2hhbmdlU2VsZWN0ZWRXb3Jrc3BhY2UoKCkgPT4ge1xuXHRcdFx0aWYgKHRoaXMuZWxlbWVudCkge1xuXHRcdFx0XHR0aGlzLnJlbmRlckxhYmVsKHRoaXMuZWxlbWVudCk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5kZWxlZ2F0ZS5vbkRpZENoYW5nZVdvcmtzcGFjZXMoKCkgPT4ge1xuXHRcdFx0Ly8gUmUtcmVuZGVyIHdoZW4gd29ya3NwYWNlcyBsaXN0IGNoYW5nZXNcblx0XHRcdGlmICh0aGlzLmVsZW1lbnQpIHtcblx0XHRcdFx0dGhpcy5yZW5kZXJMYWJlbCh0aGlzLmVsZW1lbnQpO1xuXHRcdFx0fVxuXHRcdH0pKTtcblx0fVxuXG5cdHByb3RlY3RlZCBvdmVycmlkZSByZW5kZXJMYWJlbChlbGVtZW50OiBIVE1MRWxlbWVudCk6IElEaXNwb3NhYmxlIHwgbnVsbCB7XG5cdFx0dGhpcy5zZXRBcmlhTGFiZWxBdHRyaWJ1dGVzKGVsZW1lbnQpO1xuXHRcdGNvbnN0IGN1cnJlbnRXb3Jrc3BhY2UgPSB0aGlzLmRlbGVnYXRlLmdldFNlbGVjdGVkV29ya3NwYWNlKCk7XG5cblx0XHRjb25zdCBsYWJlbEVsZW1lbnRzOiAoc3RyaW5nIHwgSFRNTEVsZW1lbnQpW10gPSBbXTtcblxuXHRcdGlmIChjdXJyZW50V29ya3NwYWNlKSB7XG5cdFx0XHQvLyBTaG93IHRoZSB3b3Jrc3BhY2UgbGFiZWwgb3IgZm9sZGVyIG5hbWVcblx0XHRcdGNvbnN0IGxhYmVsID0gY3VycmVudFdvcmtzcGFjZS5sYWJlbCB8fCBiYXNlbmFtZShjdXJyZW50V29ya3NwYWNlLnVyaSk7XG5cdFx0XHRsYWJlbEVsZW1lbnRzLnB1c2goLi4ucmVuZGVyTGFiZWxXaXRoSWNvbnMoYCQoZm9sZGVyKWApKTtcblx0XHRcdGxhYmVsRWxlbWVudHMucHVzaChkb20uJCgnc3Bhbi5jaGF0LWlucHV0LXBpY2tlci1sYWJlbCcsIHVuZGVmaW5lZCwgbGFiZWwpKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0bGFiZWxFbGVtZW50cy5wdXNoKC4uLnJlbmRlckxhYmVsV2l0aEljb25zKGAkKGZvbGRlcilgKSk7XG5cdFx0XHRsYWJlbEVsZW1lbnRzLnB1c2goZG9tLiQoJ3NwYW4uY2hhdC1pbnB1dC1waWNrZXItbGFiZWwnLCB1bmRlZmluZWQsIGxvY2FsaXplKCdzZWxlY3RXb3Jrc3BhY2UnLCBcIldvcmtzcGFjZVwiKSkpO1xuXHRcdH1cblxuXHRcdGRvbS5yZXNldChlbGVtZW50LCAuLi5sYWJlbEVsZW1lbnRzKTtcblxuXHRcdHJldHVybiBudWxsO1xuXHR9XG59XG4iXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7OztBQUtBLFlBQVksU0FBUztBQUNyQixTQUFTLDRCQUE0QjtBQUdyQyxTQUFTLGdCQUFnQjtBQUN6QixTQUFTLGdCQUFnQjtBQUV6QixTQUFTLDRCQUE0QjtBQUVyQyxTQUFTLHVCQUF1QjtBQUNoQyxTQUFTLDBCQUEwQjtBQUNuQyxTQUFTLDBCQUEwQjtBQUNuQyxTQUFTLHlCQUF5QjtBQUNsQyxTQUFTLHFDQUE4RDtBQVNoRSxJQUFNLDRCQUFOLGNBQXdDLDhCQUE4QjtBQUFBLEVBRTVFLFlBQ0MsUUFDaUIsVUFDakIsZUFDc0IscUJBQ0YsbUJBQ0EsbUJBQ2MsZ0JBQ2Ysa0JBQ2xCO0FBQ0QsVUFBTSxpQkFBc0Q7QUFBQSxNQUMzRCxZQUFZLE1BQU07QUFDakIsY0FBTSxtQkFBbUIsS0FBSyxTQUFTLHFCQUFxQjtBQUM1RCxjQUFNLGFBQWEsS0FBSyxTQUFTLGNBQWM7QUFFL0MsY0FBTSxVQUF5QyxXQUFXLElBQUksZ0JBQWM7QUFBQSxVQUMzRSxHQUFHO0FBQUEsVUFDSCxJQUFJLGFB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
