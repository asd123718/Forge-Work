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
import { localize } from "../../../../../nls.js";
import { PickerQuickAccessProvider, TriggerAction } from "../../../../../platform/quickinput/browser/pickerQuickAccess.js";
import { matchesFuzzyIconAware, parseLabelWithIcons } from "../../../../../base/common/iconLabels.js";
import { ITerminalEditorService, ITerminalGroupService, ITerminalService } from "../../../terminal/browser/terminal.js";
import { ICommandService } from "../../../../../platform/commands/common/commands.js";
import { TerminalCommandId } from "../../../terminal/common/terminal.js";
import { IThemeService } from "../../../../../platform/theme/common/themeService.js";
import { ThemeIcon } from "../../../../../base/common/themables.js";
import { killTerminalIcon, renameTerminalIcon } from "../../../terminal/browser/terminalIcons.js";
import { getColorClass, getIconId, getUriClasses } from "../../../terminal/browser/terminalIcon.js";
import { terminalStrings } from "../../../terminal/common/terminalStrings.js";
import { TerminalLocation } from "../../../../../platform/terminal/common/terminal.js";
import { IEditorService } from "../../../../services/editor/common/editorService.js";
import { IInstantiationService } from "../../../../../platform/instantiation/common/instantiation.js";
let terminalPicks = [];
let TerminalQuickAccessProvider = class extends PickerQuickAccessProvider {
  constructor(_commandService, _editorService, _instantiationService, _terminalEditorService, _terminalGroupService, _terminalService, _themeService) {
    super(TerminalQuickAccessProvider.PREFIX, { canAcceptInBackground: true });
    this._commandService = _commandService;
    this._editorService = _editorService;
    this._instantiationService = _instantiationService;
    this._terminalEditorService = _terminalEditorService;
    this._terminalGroupService = _terminalGroupService;
    this._terminalService = _terminalService;
    this._themeService = _themeService;
  }
  _getPicks(filter) {
    terminalPicks = [];
    terminalPicks.push({ type: "separator", label: "panel" });
    const terminalGroups = this._terminalGroupService.groups;
    for (let groupIndex = 0; groupIndex < terminalGroups.length; groupIndex++) {
      const terminalGroup = terminalGroups[groupIndex];
      for (let terminalIndex = 0; terminalIndex < terminalGroup.terminalInstances.length; terminalIndex++) {
        const terminal = terminalGroup.terminalInstances[terminalIndex];
        const pick = this._createPick(terminal, terminalIndex, filter, { groupIndex, groupSize: terminalGroup.terminalInstances.length });
        if (pick) {
          terminalPicks.push(pick);
        }
      }
    }
    if (terminalPicks.length > 0) {
      terminalPicks.push({ type: "separator", label: "editor" });
    }
    const terminalEditors = this._terminalEditorService.instances;
    for (let editorIndex = 0; editorIndex < terminalEditors.length; editorIndex++) {
      const term = terminalEditors[editorIndex];
      term.target = TerminalLocation.Editor;
      const pick = this._createPick(term, editorIndex, filter);
      if (pick) {
        terminalPicks.push(pick);
      }
    }
    if (terminalPicks.length > 0) {
      terminalPicks.push({ type: "separator" });
    }
    const createTerminalLabel = localize("workbench.action.terminal.newplus", "Create New Terminal");
    terminalPicks.push({
      label: `$(plus) ${createTerminalLabel}`,
      ariaLabel: createTerminalLabel,
      accept: () => this._commandService.executeCommand(TerminalCommandId.New)
    });
    const createWithProfileLabel = localize("workbench.action.terminal.newWithProfilePlus", "Create New Terminal With Profile...");
    terminalPicks.push({
      label: `$(plus) ${createWithProfileLabel}`,
      ariaLabel: createWithProfileLabel,
      accept: () => this._commandService.executeCommand(TerminalCommandId.NewWithProfile)
    });
    return terminalPicks;
  }
  _createPick(terminal, terminalIndex, filter, groupInfo) {
    const iconId = this._instantiationService.invokeFunction(getIconId, terminal);
    const index = groupInfo ? groupInfo.groupSize > 1 ? `${groupInfo.groupIndex + 1}.${terminalIndex + 1}` : `${groupInfo.groupIndex + 1}` : `${terminalIndex + 1}`;
    const label = `$(${iconId}) ${index}: ${terminal.title}`;
    const iconClasses = [];
    const colorClass = getColorClass(terminal);
    if (colorClass) {
      iconClasses.push(colorClass);
    }
    const uriClasses = getUriClasses(terminal, this._themeService.getColorTheme().type);
    if (uriClasses) {
      iconClasses.push(...uriClasses);
    }
    const highlights = matchesFuzzyIconAware(filter, parseLabelWithIcons(label), true);
    if (highlights) {
      return {
        label,
        description: terminal.description,
        highlights: { label: highlights },
        buttons: [
          {
            iconClass: ThemeIcon.asClassName(renameTerminalIcon),
            tooltip: localize("renameTerminal", "Rename Terminal")
          },
          {
            iconClass: ThemeIcon.asClassName(killTerminalIcon),
            tooltip: terminalStrings.kill.value
          }
        ],
        iconClasses,
        trigger: (buttonIndex) => {
          switch (buttonIndex) {
            case 0:
              this._commandService.executeCommand(TerminalCommandId.Rename, terminal);
              return TriggerAction.NO_ACTION;
            case 1:
              this._terminalService.safeDisposeTerminal(terminal);
              return TriggerAction.REMOVE_ITEM;
          }
          return TriggerAction.NO_ACTION;
        },
        accept: (keyMod, event) => {
          if (terminal.target === TerminalLocation.Editor) {
            const existingEditors = this._editorService.findEditors(terminal.resource);
            this._terminalEditorService.openEditor(terminal, { viewColumn: existingEditors?.[0].groupId });
            this._terminalEditorService.setActiveInstance(terminal);
          } else {
            this._terminalGroupService.showPanel(!event.inBackground);
            this._terminalGroupService.setActiveInstance(terminal);
          }
        }
      };
    }
    return void 0;
  }
};
TerminalQuickAccessProvider.PREFIX = "term ";
TerminalQuickAccessProvider = __decorateClass([
  __decorateParam(0, ICommandService),
  __decorateParam(1, IEditorService),
  __decorateParam(2, IInstantiationService),
  __decorateParam(3, ITerminalEditorService),
  __decorateParam(4, ITerminalGroupService),
  __decorateParam(5, ITerminalService),
  __decorateParam(6, IThemeService)
], TerminalQuickAccessProvider);
export {
  TerminalQuickAccessProvider
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXHRlcm1pbmFsQ29udHJpYlxccXVpY2tBY2Nlc3NcXGJyb3dzZXJcXHRlcm1pbmFsUXVpY2tBY2Nlc3MudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgeyBsb2NhbGl6ZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL25scy5qcyc7XG5pbXBvcnQgeyBJUXVpY2tQaWNrU2VwYXJhdG9yIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vcXVpY2tpbnB1dC9jb21tb24vcXVpY2tJbnB1dC5qcyc7XG5pbXBvcnQgeyBJUGlja2VyUXVpY2tBY2Nlc3NJdGVtLCBQaWNrZXJRdWlja0FjY2Vzc1Byb3ZpZGVyLCBUcmlnZ2VyQWN0aW9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vcXVpY2tpbnB1dC9icm93c2VyL3BpY2tlclF1aWNrQWNjZXNzLmpzJztcbmltcG9ydCB7IG1hdGNoZXNGdXp6eUljb25Bd2FyZSwgcGFyc2VMYWJlbFdpdGhJY29ucyB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2ljb25MYWJlbHMuanMnO1xuaW1wb3J0IHsgSVRlcm1pbmFsRWRpdG9yU2VydmljZSwgSVRlcm1pbmFsR3JvdXBTZXJ2aWNlLCBJVGVybWluYWxJbnN0YW5jZSwgSVRlcm1pbmFsU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL3Rlcm1pbmFsL2Jyb3dzZXIvdGVybWluYWwuanMnO1xuaW1wb3J0IHsgSUNvbW1hbmRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29tbWFuZHMvY29tbW9uL2NvbW1hbmRzLmpzJztcbmltcG9ydCB7IFRlcm1pbmFsQ29tbWFuZElkIH0gZnJvbSAnLi4vLi4vLi4vdGVybWluYWwvY29tbW9uL3Rlcm1pbmFsLmpzJztcbmltcG9ydCB7IElUaGVtZVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS90aGVtZS9jb21tb24vdGhlbWVTZXJ2aWNlLmpzJztcbmltcG9ydCB7IFRoZW1lSWNvbiB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3RoZW1hYmxlcy5qcyc7XG5pbXBvcnQgeyBraWxsVGVybWluYWxJY29uLCByZW5hbWVUZXJtaW5hbEljb24gfSBmcm9tICcuLi8uLi8uLi90ZXJtaW5hbC9icm93c2VyL3Rlcm1pbmFsSWNvbnMuanMnO1xuaW1wb3J0IHsgZ2V0Q29sb3JDbGFzcywgZ2V0SWNvbklkLCBnZXRVcmlDbGFzc2VzIH0gZnJvbSAnLi4vLi4vLi4vdGVybWluYWwvYnJvd3Nlci90ZXJtaW5hbEljb24uanMnO1xuaW1wb3J0IHsgdGVybWluYWxTdHJpbmdzIH0gZnJvbSAnLi4vLi4vLi4vdGVybWluYWwvY29tbW9uL3Rlcm1pbmFsU3RyaW5ncy5qcyc7XG5pbXBvcnQgeyBUZXJtaW5hbExvY2F0aW9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vdGVybWluYWwvY29tbW9uL3Rlcm1pbmFsLmpzJztcbmltcG9ydCB7IElFZGl0b3JTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vc2VydmljZXMvZWRpdG9yL2NvbW1vbi9lZGl0b3JTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElJbnN0YW50aWF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2luc3RhbnRpYXRpb24vY29tbW9uL2luc3RhbnRpYXRpb24uanMnO1xubGV0IHRlcm1pbmFsUGlja3M6IEFycmF5PElQaWNrZXJRdWlja0FjY2Vzc0l0ZW0gfCBJUXVpY2tQaWNrU2VwYXJhdG9yPiA9IFtdO1xuXG5leHBvcnQgY2xhc3MgVGVybWluYWxRdWlja0FjY2Vzc1Byb3ZpZGVyIGV4dGVuZHMgUGlja2VyUXVpY2tBY2Nlc3NQcm92aWRlcjxJUGlja2VyUXVpY2tBY2Nlc3NJdGVtPiB7XG5cblx0c3RhdGljIFBSRUZJWCA9ICd0ZXJtICc7XG5cblx0Y29uc3RydWN0b3IoXG5cdFx0QElDb21tYW5kU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9jb21tYW5kU2VydmljZTogSUNvbW1hbmRTZXJ2aWNlLFxuXHRcdEBJRWRpdG9yU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9lZGl0b3JTZXJ2aWNlOiBJRWRpdG9yU2VydmljZSxcblx0XHRASUluc3RhbnRpYXRpb25TZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2luc3RhbnRpYXRpb25TZXJ2aWNlOiBJSW5zdGFudGlhdGlvblNlcnZpY2UsXG5cdFx0QElUZXJtaW5hbEVkaXRvclNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfdGVybWluYWxFZGl0b3JTZXJ2aWNlOiBJVGVybWluYWxFZGl0b3JTZXJ2aWNlLFxuXHRcdEBJVGVybWluYWxHcm91cFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfdGVybWluYWxHcm91cFNlcnZpY2U6IElUZXJtaW5hbEdyb3VwU2VydmljZSxcblx0XHRASVRlcm1pbmFsU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF90ZXJtaW5hbFNlcnZpY2U6IElUZXJtaW5hbFNlcnZpY2UsXG5cdFx0QElUaGVtZVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBfdGhlbWVTZXJ2aWNlOiBJVGhlbWVTZXJ2aWNlLFxuXHQpIHtcblx0XHRzdXBlcihUZXJtaW5hbFF1aWNrQWNjZXNzUHJvdmlkZXIuUFJFRklYLCB7IGNhbkFjY2VwdEluQmFja2dyb3VuZDogdHJ1ZSB9KTtcblx0fVxuXG5cdHByb3RlY3RlZCBfZ2V0UGlja3MoZmlsdGVyOiBzdHJpbmcpOiBBcnJheTxJUGlja2VyUXVpY2tBY2Nlc3NJdGVtIHwgSVF1aWNrUGlja1NlcGFyYXRvcj4ge1xuXHRcdHRlcm1pbmFsUGlja3MgPSBbXTtcblx0XHR0ZXJtaW5hbFBpY2tzLnB1c2goeyB0eXBlOiAnc2VwYXJhdG9yJywgbGFiZWw6ICdwYW5lbCcgfSk7XG5cdFx0Y29uc3QgdGVybWluYWxHcm91cHMgPSB0aGlzLl90ZXJtaW5hbEdyb3VwU2VydmljZS5ncm91cHM7XG5cdFx0Zm9yIChsZXQgZ3JvdXBJbmRleCA9IDA7IGdyb3VwSW5kZXggPCB0ZXJtaW5hbEdyb3Vwcy5sZW5ndGg7IGdyb3VwSW5kZXgrKykge1xuXHRcdFx0Y29uc3QgdGVybWluYWxHcm91cCA9IHRlcm1pbmFsR3JvdXBzW2dyb3VwSW5kZXhdO1xuXHRcdFx0Zm9yIChsZXQgdGVybWluYWxJbmRleCA9IDA7IHRlcm1pbmFsSW5kZXggPCB0ZXJtaW5hbEdyb3VwLnRlcm1pbmFsSW5zdGFuY2VzLmxlbmd0aDsgdGVybWluYWxJbmRleCsrKSB7XG5cdFx0XHRcdGNvbnN0IHRlcm1pbmFsID0gdGVybWluYWxHcm91cC50ZXJtaW5hbEluc3RhbmNlc1t0ZXJtaW5hbEluZGV4XTtcblx0XHRcdFx0Y29uc3QgcGljayA9IHRoaXMuX2NyZWF0ZVBpY2sodGVybWluYWwsIHRlcm1pbmFsSW5kZXgsIGZpbHRlciwgeyBncm91cEluZGV4LCBncm91cFNpemU6IHRlcm1pbmFsR3JvdXAudGVybWluYWxJbnN0YW5jZXMubGVuZ3RoIH0pO1xuXHRcdFx0XHRpZiAocGljaykge1xuXHRcdFx0XHRcdHRlcm1pbmFsUGlja3MucHVzaChwaWNrKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblxuXHRcdGlmICh0ZXJtaW5hbFBpY2tzLmxlbmd0aCA+IDApIHtcblx0XHRcdHRlcm1pbmFsUGlja3MucHVzaCh7IHR5cGU6ICdzZXBhcmF0b3InLCBsYWJlbDogJ2VkaXRvcicgfSk7XG5cdFx0fVxuXG5cdFx0Y29uc3QgdGVybWluYWxFZGl0b3JzID0gdGhpcy5fdGVybWluYWxFZGl0b3JTZXJ2aWNlLmluc3RhbmNlcztcblx0XHRmb3IgKGxldCBlZGl0b3JJbmRleCA9IDA7IGVkaXRvckluZGV4IDwgdGVybWluYWxFZGl0b3JzLmxlbmd0aDsgZWRpdG9ySW5kZXgrKykge1xuXHRcdFx0Y29uc3QgdGVybSA9IHRlcm1pbmFsRWRpdG9yc1tlZGl0b3JJbmRleF07XG5cdFx0XHR0ZXJtLnRhcmdldCA9IFRlcm1pbmFsTG9jYXRpb24uRWRpdG9yO1xuXHRcdFx0Y29uc3QgcGljayA9IHRoaXMuX2NyZWF0ZVBpY2sodGVybSwgZWRpdG9ySW5kZXgsIGZpbHRlcik7XG5cdFx0XHRpZiAocGljaykge1xuXHRcdFx0XHR0ZXJtaW5hbFBpY2tzLnB1c2gocGljayk7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0aWYgKHRlcm1pbmFsUGlja3MubGVuZ3RoID4gMCkge1xuXHRcdFx0dGVybWluYWxQaWNrcy5wdXNoKHsgdHlwZTogJ3NlcGFyYXRvcicgfSk7XG5cdFx0fVxuXG5cdFx0Y29uc3QgY3JlYXRlVGVybWluYWxMYWJlbCA9IGxvY2FsaXplKFwid29ya2JlbmNoLmFjdGlvbi50ZXJtaW5hbC5uZXdwbHVzXCIsIFwiQ3JlYXRlIE5ldyBUZXJtaW5hbFwiKTtcblx0XHR0ZXJtaW5hbFBpY2tzLnB1c2goe1xuXHRcdFx0bGFiZWw6IGAkKHBsdXMpICR7Y3JlYXRlVGVybWluYWxMYWJlbH1gLFxuXHRcdFx0YXJpYUxhYmVsOiBjcmVhdGVUZXJtaW5hbExhYmVsLFxuXHRcdFx0YWNjZXB0OiAoKSA9PiB0aGlzLl9jb21tYW5kU2VydmljZS5leGVjdXRlQ29tbWFuZChUZXJtaW5hbENvbW1hbmRJZC5OZXcpXG5cdFx0fSk7XG5cdFx0Y29uc3QgY3JlYXRlV2l0aFByb2ZpbGVMYWJlbCA9IGxvY2FsaXplKFwid29ya2JlbmNoLmFjdGlvbi50ZXJtaW5hbC5uZXdXaXRoUHJvZmlsZVBsdXNcIiwgXCJDcmVhdGUgTmV3IFRlcm1pbmFsIFdpdGggUHJvZmlsZS4uLlwiKTtcblx0XHR0ZXJtaW5hbFBpY2tzLnB1c2goe1xuXHRcdFx0bGFiZWw6IGAkKHBsdXMpICR7Y3JlYXRlV2l0aFByb2ZpbGVMYWJlbH1gLFxuXHRcdFx0YXJpYUxhYmVsOiBjcmVhdGVXaXRoUHJvZmlsZUxhYmVsLFxuXHRcdFx0YWNjZXB0OiAoKSA9PiB0aGlzLl9jb21tYW5kU2VydmljZS5leGVjdXRlQ29tbWFuZChUZXJtaW5hbENvbW1hbmRJZC5OZXdXaXRoUHJvZmlsZSlcblx0XHR9KTtcblx0XHRyZXR1cm4gdGVybWluYWxQaWNrcztcblx0fVxuXG5cdHByaXZhdGUgX2NyZWF0ZVBpY2sodGVybWluYWw6IElUZXJtaW5hbEluc3RhbmNlLCB0ZXJtaW5hbEluZGV4OiBudW1iZXIsIGZpbHRlcjogc3RyaW5nLCBncm91cEluZm8/OiB7IGdyb3VwSW5kZXg6IG51bWJlcjsgZ3JvdXBTaXplOiBudW1iZXIgfSk6IElQaWNrZXJRdWlja0FjY2Vzc0l0ZW0gfCB1bmRlZmluZWQge1xuXHRcdGNvbnN0IGljb25JZCA9IHRoaXMuX2luc3RhbnRpYXRpb25TZXJ2aWNlLmludm9rZUZ1bmN0aW9uKGdldEljb25JZCwgdGVybWluYWwpO1xuXHRcdGNvbnN0IGluZGV4ID0gZ3JvdXBJbmZvXG5cdFx0XHQ/IChncm91cEluZm8uZ3JvdXBTaXplID4gMVxuXHRcdFx0XHQ/IGAke2dyb3VwSW5mby5ncm91cEluZGV4ICsgMX0uJHt0ZXJtaW5hbEluZGV4ICsgMX1gXG5cdFx0XHRcdDogYCR7Z3JvdXBJbmZvLmdyb3VwSW5kZXggKyAxfWApXG5cdFx0XHQ6IGAke3Rlcm1pbmFsSW5kZXggKyAxfWA7XG5cdFx0Y29uc3QgbGFiZWwgPSBgJCgke2ljb25JZH0pICR7aW5kZXh9OiAke3Rlcm1pbmFsLnRpdGxlfWA7XG5cdFx0Y29uc3QgaWNvbkNsYXNzZXM6IHN0cmluZ1tdID0gW107XG5cdFx0Y29uc3QgY29sb3JDbGFzcyA9IGdldENvbG9yQ2xhc3ModGVybWluYWwpO1xuXHRcdGlmIChjb2xvckNsYXNzKSB7XG5cdFx0XHRpY29uQ2xhc3Nlcy5wdXNoKGNvbG9yQ2xhc3MpO1xuXHRcdH1cblx0XHRjb25zdCB1cmlDbGFzc2VzID0gZ2V0VXJpQ2xhc3Nlcyh0ZXJtaW5hbCwgdGhpcy5fdGhlbWVTZXJ2aWNlLmdldENvbG9yVGhlbWUoKS50eXBlKTtcblx0XHRpZiAodXJpQ2xhc3Nlcykge1xuXHRcdFx0aWNvbkNsYXNzZXMucHVzaCguLi51cmlDbGFzc2VzKTtcblx0XHR9XG5cdFx0Y29uc3QgaGlnaGxpZ2h0cyA9IG1hdGNoZXNGdXp6eUljb25Bd2FyZShmaWx0ZXIsIHBhcnNlTGFiZWxXaXRoSWNvbnMobGFiZWwpLCB0cnVlKTtcblx0XHRpZiAoaGlnaGxpZ2h0cykge1xuXHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0bGFiZWwsXG5cdFx0XHRcdGRlc2NyaXB0aW9uOiB0ZXJtaW5hbC5kZXNjcmlwdGlvbixcblx0XHRcdFx0aGlnaGxpZ2h0czogeyBsYWJlbDogaGlnaGxpZ2h0cyB9LFxuXHRcdFx0XHRidXR0b25zOiBbXG5cdFx0XHRcdFx0e1xuXHRcdFx0XHRcdFx0aWNvbkNsYXNzOiBUaGVtZUljb24uYXNDbGFzc05hbWUocmVuYW1lVGVybWluYWxJY29uKSxcblx0XHRcdFx0XHRcdHRvb2x0aXA6IGxvY2FsaXplKCdyZW5hbWVUZXJtaW5hbCcsIFwiUmVuYW1lIFRlcm1pbmFsXCIpXG5cdFx0XHRcdFx0fSxcblx0XHRcdFx0XHR7XG5cdFx0XHRcdFx0XHRpY29uQ2xhc3M6IFRoZW1lSWNvbi5hc0NsYXNzTmFtZShraWxsVGVybWluYWxJY29uKSxcblx0XHRcdFx0XHRcdHRvb2x0aXA6IHRlcm1pbmFsU3RyaW5ncy5raWxsLnZhbHVlXG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRdLFxuXHRcdFx0XHRpY29uQ2xhc3Nlcyxcblx0XHRcdFx0dHJpZ2dlcjogYnV0dG9uSW5kZXggPT4ge1xuXHRcdFx0XHRcdHN3aXRjaCAoYnV0dG9uSW5kZXgpIHtcblx0XHRcdFx0XHRcdGNhc2UgMDpcblx0XHRcdFx0XHRcdFx0dGhpcy5fY29tbWFuZFNlcnZpY2UuZXhlY3V0ZUNvbW1hbmQoVGVybWluYWxDb21tYW5kSWQuUmVuYW1lLCB0ZXJtaW5hbCk7XG5cdFx0XHRcdFx0XHRcdHJldHVybiBUcmlnZ2VyQWN0aW9uLk5PX0FDVElPTjtcblx0XHRcdFx0XHRcdGNhc2UgMTpcblx0XHRcdFx0XHRcdFx0dGhpcy5fdGVybWluYWxTZXJ2aWNlLnNhZmVEaXNwb3NlVGVybWluYWwodGVybWluYWwpO1xuXHRcdFx0XHRcdFx0XHRyZXR1cm4gVHJpZ2dlckFjdGlvbi5SRU1PVkVfSVRFTTtcblx0XHRcdFx0XHR9XG5cblx0XHRcdFx0XHRyZXR1cm4gVHJpZ2dlckFjdGlvbi5OT19BQ1RJT047XG5cdFx0XHRcdH0sXG5cdFx0XHRcdGFjY2VwdDogKGtleU1vZCwgZXZlbnQpID0+IHtcblx0XHRcdFx0XHRpZiAodGVybWluYWwudGFyZ2V0ID09PSBUZXJtaW5hbExvY2F0aW9uLkVkaXRvcikge1xuXHRcdFx0XHRcdFx0Y29uc3QgZXhpc3RpbmdFZGl0b3JzID0gdGhpcy5fZWRpdG9yU2VydmljZS5maW5kRWRpdG9ycyh0ZXJtaW5hbC5yZXNvdXJjZSk7XG5cdFx0XHRcdFx0XHR0aGlzLl90ZXJtaW5hbEVkaXRvclNlcnZpY2Uub3BlbkVkaXRvcih0ZXJtaW5hbCwgeyB2aWV3Q29sdW1uOiBleGlzdGluZ0VkaXRvcnM/LlswXS5ncm91cElkIH0pO1xuXHRcdFx0XHRcdFx0dGhpcy5fdGVybWluYWxFZGl0b3JTZXJ2aWNlLnNldEFjdGl2ZUluc3RhbmNlKHRlcm1pbmFsKTtcblx0XHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdFx0dGhpcy5fdGVybWluYWxHcm91cFNlcnZpY2Uuc2hvd1BhbmVsKCFldmVudC5pbkJhY2tncm91bmQpO1xuXHRcdFx0XHRcdFx0dGhpcy5fdGVybWluYWxHcm91cFNlcnZpY2Uuc2V0QWN0aXZlSW5zdGFuY2UodGVybWluYWwpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0fTtcblx0XHR9XG5cdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0fVxufVxuIl0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7Ozs7QUFLQSxTQUFTLGdCQUFnQjtBQUV6QixTQUFpQywyQkFBMkIscUJBQXFCO0FBQ2pGLFNBQVMsdUJBQXVCLDJCQUEyQjtBQUMzRCxTQUFTLHdCQUF3Qix1QkFBMEMsd0JBQXdCO0FBQ25HLFNBQVMsdUJBQXVCO0FBQ2hDLFNBQVMseUJBQXlCO0FBQ2xDLFNBQVMscUJBQXFCO0FBQzlCLFNBQVMsaUJBQWlCO0FBQzFCLFNBQVMsa0JBQWtCLDBCQUEwQjtBQUNyRCxTQUFTLGVBQWUsV0FBVyxxQkFBcUI7QUFDeEQsU0FBUyx1QkFBdUI7QUFDaEMsU0FBUyx3QkFBd0I7QUFDakMsU0FBUyxzQkFBc0I7QUFDL0IsU0FBUyw2QkFBNkI7QUFDdEMsSUFBSSxnQkFBcUUsQ0FBQztBQUVuRSxJQUFNLDhCQUFOLGNBQTBDLDBCQUFrRDtBQUFBLEVBSWxHLFlBQ21DLGlCQUNELGdCQUNPLHVCQUNDLHdCQUNELHVCQUNMLGtCQUNILGVBQy9CO0FBQ0QsVUFBTSw0QkFBNEIsUUFBUSxFQUFFLHVCQUF1QixLQUFLLENBQUM7QUFSdkM7QUFDRDtBQUNPO0FBQ0M7QUFDRDtBQUNMO0FBQ0g7QUFBQSxFQUdqQztBQUFBLEVBRVUsVUFBVSxRQUFxRTtBQUN4RixvQkFBZ0IsQ0FBQztBQUNqQixrQkFBYyxLQUFLLEVBQUUsTUFBTSxhQUFhLE9BQU8sUUFBUSxDQUFDO0FBQ3hELFVBQU0saUJBQWlCLEtBQUssc0JBQXNCO0FBQ2xELGFBQVMsYUFBYSxHQUFHLGFBQWEsZUFBZSxRQUFRLGNB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
