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
import { matchesFuzzy } from "../../../../base/common/filters.js";
import { localize } from "../../../../nls.js";
import { ICommandService } from "../../../../platform/commands/common/commands.js";
import { PickerQuickAccessProvider } from "../../../../platform/quickinput/browser/pickerQuickAccess.js";
import { IViewsService } from "../../../services/views/common/viewsService.js";
import { DEBUG_CONSOLE_QUICK_ACCESS_PREFIX, SELECT_AND_START_ID } from "./debugCommands.js";
import { IDebugService, REPL_VIEW_ID } from "../common/debug.js";
let DebugConsoleQuickAccess = class extends PickerQuickAccessProvider {
  constructor(_debugService, _viewsService, _commandService) {
    super(DEBUG_CONSOLE_QUICK_ACCESS_PREFIX, { canAcceptInBackground: true });
    this._debugService = _debugService;
    this._viewsService = _viewsService;
    this._commandService = _commandService;
  }
  _getPicks(filter, disposables, token) {
    const debugConsolePicks = [];
    this._debugService.getModel().getSessions(true).filter((s) => s.hasSeparateRepl()).forEach((session, index) => {
      const pick = this._createPick(session, index, filter);
      if (pick) {
        debugConsolePicks.push(pick);
      }
    });
    if (debugConsolePicks.length > 0) {
      debugConsolePicks.push({ type: "separator" });
    }
    const createTerminalLabel = localize("workbench.action.debug.startDebug", "Start a New Debug Session");
    debugConsolePicks.push({
      label: `$(plus) ${createTerminalLabel}`,
      ariaLabel: createTerminalLabel,
      accept: () => this._commandService.executeCommand(SELECT_AND_START_ID)
    });
    return debugConsolePicks;
  }
  _createPick(session, sessionIndex, filter) {
    const label = session.name;
    const highlights = matchesFuzzy(filter, label, true);
    if (highlights) {
      return {
        label,
        highlights: { label: highlights },
        accept: (keyMod, event) => {
          this._debugService.focusStackFrame(void 0, void 0, session, { explicit: true });
          if (!this._viewsService.isViewVisible(REPL_VIEW_ID)) {
            this._viewsService.openView(REPL_VIEW_ID, true);
          }
        }
      };
    }
    return void 0;
  }
};
DebugConsoleQuickAccess = __decorateClass([
  __decorateParam(0, IDebugService),
  __decorateParam(1, IViewsService),
  __decorateParam(2, ICommandService)
], DebugConsoleQuickAccess);
export {
  DebugConsoleQuickAccess
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXGRlYnVnXFxicm93c2VyXFxkZWJ1Z0NvbnNvbGVRdWlja0FjY2Vzcy50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5pbXBvcnQgeyBDYW5jZWxsYXRpb25Ub2tlbiB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2NhbmNlbGxhdGlvbi5qcyc7XG5pbXBvcnQgeyBtYXRjaGVzRnV6enkgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9maWx0ZXJzLmpzJztcbmltcG9ydCB7IERpc3Bvc2FibGVTdG9yZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBsb2NhbGl6ZSB9IGZyb20gJy4uLy4uLy4uLy4uL25scy5qcyc7XG5pbXBvcnQgeyBJQ29tbWFuZFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb21tYW5kcy9jb21tb24vY29tbWFuZHMuanMnO1xuaW1wb3J0IHsgRmFzdEFuZFNsb3dQaWNrcywgSVBpY2tlclF1aWNrQWNjZXNzSXRlbSwgUGlja2VyUXVpY2tBY2Nlc3NQcm92aWRlciwgUGlja3MgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9xdWlja2lucHV0L2Jyb3dzZXIvcGlja2VyUXVpY2tBY2Nlc3MuanMnO1xuaW1wb3J0IHsgSVF1aWNrUGlja1NlcGFyYXRvciB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL3F1aWNraW5wdXQvY29tbW9uL3F1aWNrSW5wdXQuanMnO1xuaW1wb3J0IHsgSVZpZXdzU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL3NlcnZpY2VzL3ZpZXdzL2NvbW1vbi92aWV3c1NlcnZpY2UuanMnO1xuaW1wb3J0IHsgREVCVUdfQ09OU09MRV9RVUlDS19BQ0NFU1NfUFJFRklYLCBTRUxFQ1RfQU5EX1NUQVJUX0lEIH0gZnJvbSAnLi9kZWJ1Z0NvbW1hbmRzLmpzJztcbmltcG9ydCB7IElEZWJ1Z1NlcnZpY2UsIElEZWJ1Z1Nlc3Npb24sIFJFUExfVklFV19JRCB9IGZyb20gJy4uL2NvbW1vbi9kZWJ1Zy5qcyc7XG5cbmV4cG9ydCBjbGFzcyBEZWJ1Z0NvbnNvbGVRdWlja0FjY2VzcyBleHRlbmRzIFBpY2tlclF1aWNrQWNjZXNzUHJvdmlkZXI8SVBpY2tlclF1aWNrQWNjZXNzSXRlbT4ge1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdEBJRGVidWdTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgX2RlYnVnU2VydmljZTogSURlYnVnU2VydmljZSxcblx0XHRASVZpZXdzU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF92aWV3c1NlcnZpY2U6IElWaWV3c1NlcnZpY2UsXG5cdFx0QElDb21tYW5kU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IF9jb21tYW5kU2VydmljZTogSUNvbW1hbmRTZXJ2aWNlLFxuXHQpIHtcblx0XHRzdXBlcihERUJVR19DT05TT0xFX1FVSUNLX0FDQ0VTU19QUkVGSVgsIHsgY2FuQWNjZXB0SW5CYWNrZ3JvdW5kOiB0cnVlIH0pO1xuXHR9XG5cblx0cHJvdGVjdGVkIF9nZXRQaWNrcyhmaWx0ZXI6IHN0cmluZywgZGlzcG9zYWJsZXM6IERpc3Bvc2FibGVTdG9yZSwgdG9rZW46IENhbmNlbGxhdGlvblRva2VuKTogUGlja3M8SVBpY2tlclF1aWNrQWNjZXNzSXRlbT4gfCBQcm9taXNlPFBpY2tzPElQaWNrZXJRdWlja0FjY2Vzc0l0ZW0+PiB8IEZhc3RBbmRTbG93UGlja3M8SVBpY2tlclF1aWNrQWNjZXNzSXRlbT4gfCBudWxsIHtcblx0XHRjb25zdCBkZWJ1Z0NvbnNvbGVQaWNrczogQXJyYXk8SVBpY2tlclF1aWNrQWNjZXNzSXRlbSB8IElRdWlja1BpY2tTZXBhcmF0b3I+ID0gW107XG5cblx0XHR0aGlzLl9kZWJ1Z1NlcnZpY2UuZ2V0TW9kZWwoKS5nZXRTZXNzaW9ucyh0cnVlKS5maWx0ZXIocyA9PiBzLmhhc1NlcGFyYXRlUmVwbCgpKS5mb3JFYWNoKChzZXNzaW9uLCBpbmRleCkgPT4ge1xuXHRcdFx0Y29uc3QgcGljayA9IHRoaXMuX2NyZWF0ZVBpY2soc2Vzc2lvbiwgaW5kZXgsIGZpbHRlcik7XG5cdFx0XHRpZiAocGljaykge1xuXHRcdFx0XHRkZWJ1Z0NvbnNvbGVQaWNrcy5wdXNoKHBpY2spO1xuXHRcdFx0fVxuXHRcdH0pO1xuXG5cblx0XHRpZiAoZGVidWdDb25zb2xlUGlja3MubGVuZ3RoID4gMCkge1xuXHRcdFx0ZGVidWdDb25zb2xlUGlja3MucHVzaCh7IHR5cGU6ICdzZXBhcmF0b3InIH0pO1xuXHRcdH1cblxuXHRcdGNvbnN0IGNyZWF0ZVRlcm1pbmFsTGFiZWwgPSBsb2NhbGl6ZShcIndvcmtiZW5jaC5hY3Rpb24uZGVidWcuc3RhcnREZWJ1Z1wiLCBcIlN0YXJ0IGEgTmV3IERlYnVnIFNlc3Npb25cIik7XG5cdFx0ZGVidWdDb25zb2xlUGlja3MucHVzaCh7XG5cdFx0XHRsYWJlbDogYCQocGx1cykgJHtjcmVhdGVUZXJtaW5hbExhYmVsfWAsXG5cdFx0XHRhcmlhTGFiZWw6IGNyZWF0ZVRlcm1pbmFsTGFiZWwsXG5cdFx0XHRhY2NlcHQ6ICgpID0+IHRoaXMuX2NvbW1hbmRTZXJ2aWNlLmV4ZWN1dGVDb21tYW5kKFNFTEVDVF9BTkRfU1RBUlRfSUQpXG5cdFx0fSk7XG5cdFx0cmV0dXJuIGRlYnVnQ29uc29sZVBpY2tzO1xuXHR9XG5cblx0cHJpdmF0ZSBfY3JlYXRlUGljayhzZXNzaW9uOiBJRGVidWdTZXNzaW9uLCBzZXNzaW9uSW5kZXg6IG51bWJlciwgZmlsdGVyOiBzdHJpbmcpOiBJUGlja2VyUXVpY2tBY2Nlc3NJdGVtIHwgdW5kZWZpbmVkIHtcblx0XHRjb25zdCBsYWJlbCA9IHNlc3Npb24ubmFtZTtcblxuXHRcdGNvbnN0IGhpZ2hsaWdodHMgPSBtYXRjaGVzRnV6enkoZmlsdGVyLCBsYWJlbCwgdHJ1ZSk7XG5cdFx0aWYgKGhpZ2hsaWdodHMpIHtcblx0XHRcdHJldHVybiB7XG5cdFx0XHRcdGxhYmVsLFxuXHRcdFx0XHRoaWdobGlnaHRzOiB7IGxhYmVsOiBoaWdobGlnaHRzIH0sXG5cdFx0XHRcdGFjY2VwdDogKGtleU1vZCwgZXZlbnQpID0+IHtcblx0XHRcdFx0XHR0aGlzLl9kZWJ1Z1NlcnZpY2UuZm9jdXNTdGFja0ZyYW1lKHVuZGVmaW5lZCwgdW5kZWZpbmVkLCBzZXNzaW9uLCB7IGV4cGxpY2l0OiB0cnVlIH0pO1xuXHRcdFx0XHRcdGlmICghdGhpcy5fdmlld3NTZXJ2aWNlLmlzVmlld1Zpc2libGUoUkVQTF9WSUVXX0lEKSkge1xuXHRcdFx0XHRcdFx0dGhpcy5fdmlld3NTZXJ2aWNlLm9wZW5WaWV3KFJFUExfVklFV19JRCwgdHJ1ZSk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHR9O1xuXHRcdH1cblx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHR9XG59XG4iXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7OztBQUtBLFNBQVMsb0JBQW9CO0FBRTdCLFNBQVMsZ0JBQWdCO0FBQ3pCLFNBQVMsdUJBQXVCO0FBQ2hDLFNBQW1ELGlDQUF3QztBQUUzRixTQUFTLHFCQUFxQjtBQUM5QixTQUFTLG1DQUFtQywyQkFBMkI7QUFDdkUsU0FBUyxlQUE4QixvQkFBb0I7QUFFcEQsSUFBTSwwQkFBTixjQUFzQywwQkFBa0Q7QUFBQSxFQUU5RixZQUNpQyxlQUNBLGVBQ0UsaUJBQ2pDO0FBQ0QsVUFBTSxtQ0FBbUMsRUFBRSx1QkFBdUIsS0FBSyxDQUFDO0FBSnhDO0FBQ0E7QUFDRTtBQUFBLEVBR25DO0FBQUEsRUFFVSxVQUFVLFFBQWdCLGFBQThCLE9BQW9KO0FBQ3JOLFVBQU0sb0JBQXlFLENBQUM7QUFFaEYsU0FBSyxjQUFjLFNBQVMsRUFBRSxZQUFZLElBQUksRUFBRSxPQUFPLE9BQUssRUFBRSxnQkFBZ0IsQ0FBQyxFQUFFLFFBQVEsQ0FBQyxTQUFTLFVBQVU7QUFDNUcsWUFBTSxPQUFPLEtBQUssWUFBWSxTQUFTLE9BQU8sTUFBTTtBQUNwRCxVQUFJLE1BQU07QUFDVCwwQkFBa0IsS0FBSyxJQUFJO0FBQUEsTUFDNUI7QUFBQSxJQUNELENBQUM7QUFHRCxRQUFJLGtCQUFrQixTQUFTLEdBQUc7QUFDakMsd0JBQWtCLEtBQUssRUFBRSxNQUFNLFlBQVksQ0FBQztBQUFBLElBQzdDO0FBRUEsVUFBTSxzQkFBc0IsU0FBUyxxQ0FBcUMsMkJBQTJCO0FBQ3JHLHNCQUFrQixLQUFLO0FBQUEsTUFDdEIsT0FBTyxXQUFXLG1CQUFtQjtBQUFBLE1BQ3JDLFdBQVc7QUFBQSxNQUNYLFFBQVEsTUFBTSxLQUFLLGdCQUFnQixlQUFlLG1CQUFtQjtBQUFBLElBQ3RFLENBQUM7QUFDRCxXQUFPO0FBQUEsRUFDUjtBQUFBLEVBRVEsWUFBWSxTQUF3QixjQUFzQixRQUFvRDtBQUNySCxVQUFNLFFBQVEsUUFBUTtBQUV0QixVQUFNLGFBQWEsYUFBYSxRQUFRLE9BQU8sSUFBSTtBQUNuRCxRQUFJLFlBQVk7QUFDZixhQUFPO0FBQUEsUUFDTjtBQUFBLFFBQ0EsWUFBWSxFQUFFLE9BQU8sV0FBVztBQUFBLFFBQ2hDLFFBQVEsQ0FBQyxRQUFRLFVBQVU7QUFDMUIsZUFBSyxjQUFjLGdCQUFnQixRQUFXLFFBQVcsU0FBUyxFQUFFLFVBQVUsS0FBSyxDQUFDO0FBQ3BGLGNBQUksQ0FBQyxLQUFLLGNBQWMsY0FBYyxZQUFZLEdBQUc7QUFDcEQsaUJBQUssY0FBYyxTQUFTLGNBQWMsSUFBSTtBQUFBLFVBQy9DO0FBQUEsUUFDRDtBQUFBLE1BQ0Q7QUFBQSxJQUNEO0FBQ0EsV0FBTztBQUFBLEVBQ1I7QUFDRDtBQXBEYSwwQkFBTjtBQUFBLEVBR0o7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEdBTFU7IiwKICAibmFtZXMiOiBbXQp9Cg==
