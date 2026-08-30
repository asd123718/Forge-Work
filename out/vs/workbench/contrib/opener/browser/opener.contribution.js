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
import { URI } from "../../../../base/common/uri.js";
import { ICommandService } from "../../../../platform/commands/common/commands.js";
import { IFileService } from "../../../../platform/files/common/files.js";
import { IOpenerService } from "../../../../platform/opener/common/opener.js";
import { IWorkspaceContextService } from "../../../../platform/workspace/common/workspace.js";
import { registerWorkbenchContribution2, WorkbenchPhase } from "../../../common/contributions.js";
import { REVEAL_IN_EXPLORER_COMMAND_ID } from "../../files/browser/fileConstants.js";
let WorkbenchOpenerContribution = class extends Disposable {
  constructor(openerService, commandService, fileService, workspaceContextService) {
    super();
    this.commandService = commandService;
    this.fileService = fileService;
    this.workspaceContextService = workspaceContextService;
    this._register(openerService.registerOpener(this));
  }
  async open(link, options) {
    try {
      if (options?.openExternal) {
        return false;
      }
      const uri = typeof link === "string" ? URI.parse(link) : link;
      if (this.workspaceContextService.isInsideWorkspace(uri)) {
        if ((await this.fileService.stat(uri)).isDirectory) {
          await this.commandService.executeCommand(REVEAL_IN_EXPLORER_COMMAND_ID, uri);
          return true;
        }
      }
    } catch {
    }
    return false;
  }
};
WorkbenchOpenerContribution.ID = "workbench.contrib.opener";
WorkbenchOpenerContribution = __decorateClass([
  __decorateParam(0, IOpenerService),
  __decorateParam(1, ICommandService),
  __decorateParam(2, IFileService),
  __decorateParam(3, IWorkspaceContextService)
], WorkbenchOpenerContribution);
registerWorkbenchContribution2(WorkbenchOpenerContribution.ID, WorkbenchOpenerContribution, WorkbenchPhase.Eventually);
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXG9wZW5lclxcYnJvd3Nlclxcb3BlbmVyLmNvbnRyaWJ1dGlvbi50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB7IERpc3Bvc2FibGUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgVVJJIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdXJpLmpzJztcbmltcG9ydCB7IElDb21tYW5kU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbW1hbmRzL2NvbW1vbi9jb21tYW5kcy5qcyc7XG5pbXBvcnQgeyBJRmlsZVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9maWxlcy9jb21tb24vZmlsZXMuanMnO1xuaW1wb3J0IHsgSU9wZW5lciwgSU9wZW5lclNlcnZpY2UsIE9wZW5FeHRlcm5hbE9wdGlvbnMsIE9wZW5JbnRlcm5hbE9wdGlvbnMgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS9vcGVuZXIvY29tbW9uL29wZW5lci5qcyc7XG5pbXBvcnQgeyBJV29ya3NwYWNlQ29udGV4dFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9wbGF0Zm9ybS93b3Jrc3BhY2UvY29tbW9uL3dvcmtzcGFjZS5qcyc7XG5pbXBvcnQgeyByZWdpc3RlcldvcmtiZW5jaENvbnRyaWJ1dGlvbjIsIFdvcmtiZW5jaFBoYXNlIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2NvbnRyaWJ1dGlvbnMuanMnO1xuaW1wb3J0IHsgUkVWRUFMX0lOX0VYUExPUkVSX0NPTU1BTkRfSUQgfSBmcm9tICcuLi8uLi9maWxlcy9icm93c2VyL2ZpbGVDb25zdGFudHMuanMnO1xuXG5jbGFzcyBXb3JrYmVuY2hPcGVuZXJDb250cmlidXRpb24gZXh0ZW5kcyBEaXNwb3NhYmxlIGltcGxlbWVudHMgSU9wZW5lciB7XG5cdHB1YmxpYyBzdGF0aWMgcmVhZG9ubHkgSUQgPSAnd29ya2JlbmNoLmNvbnRyaWIub3BlbmVyJztcblxuXHRjb25zdHJ1Y3Rvcihcblx0XHRASU9wZW5lclNlcnZpY2Ugb3BlbmVyU2VydmljZTogSU9wZW5lclNlcnZpY2UsXG5cdFx0QElDb21tYW5kU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGNvbW1hbmRTZXJ2aWNlOiBJQ29tbWFuZFNlcnZpY2UsXG5cdFx0QElGaWxlU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGZpbGVTZXJ2aWNlOiBJRmlsZVNlcnZpY2UsXG5cdFx0QElXb3Jrc3BhY2VDb250ZXh0U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IHdvcmtzcGFjZUNvbnRleHRTZXJ2aWNlOiBJV29ya3NwYWNlQ29udGV4dFNlcnZpY2UsXG5cdCkge1xuXHRcdHN1cGVyKCk7XG5cblx0XHR0aGlzLl9yZWdpc3RlcihvcGVuZXJTZXJ2aWNlLnJlZ2lzdGVyT3BlbmVyKHRoaXMpKTtcblx0fVxuXG5cdGFzeW5jIG9wZW4obGluazogVVJJIHwgc3RyaW5nLCBvcHRpb25zPzogT3BlbkludGVybmFsT3B0aW9ucyB8IE9wZW5FeHRlcm5hbE9wdGlvbnMpOiBQcm9taXNlPGJvb2xlYW4+IHtcblx0XHR0cnkge1xuXHRcdFx0aWYgKChvcHRpb25zIGFzIE9wZW5FeHRlcm5hbE9wdGlvbnMpPy5vcGVuRXh0ZXJuYWwpIHtcblx0XHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdFx0fVxuXG5cdFx0XHRjb25zdCB1cmkgPSB0eXBlb2YgbGluayA9PT0gJ3N0cmluZycgPyBVUkkucGFyc2UobGluaykgOiBsaW5rO1xuXHRcdFx0aWYgKHRoaXMud29ya3NwYWNlQ29udGV4dFNlcnZpY2UuaXNJbnNpZGVXb3Jrc3BhY2UodXJpKSkge1xuXHRcdFx0XHRpZiAoKGF3YWl0IHRoaXMuZmlsZVNlcnZpY2Uuc3RhdCh1cmkpKS5pc0RpcmVjdG9yeSkge1xuXHRcdFx0XHRcdGF3YWl0IHRoaXMuY29tbWFuZFNlcnZpY2UuZXhlY3V0ZUNvbW1hbmQoUkVWRUFMX0lOX0VYUExPUkVSX0NPTU1BTkRfSUQsIHVyaSk7XG5cdFx0XHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9IGNhdGNoIHtcblx0XHRcdC8vIG5vb3Bcblx0XHR9XG5cblx0XHRyZXR1cm4gZmFsc2U7XG5cdH1cbn1cblxuXG5yZWdpc3RlcldvcmtiZW5jaENvbnRyaWJ1dGlvbjIoV29ya2JlbmNoT3BlbmVyQ29udHJpYnV0aW9uLklELCBXb3JrYmVuY2hPcGVuZXJDb250cmlidXRpb24sIFdvcmtiZW5jaFBoYXNlLkV2ZW50dWFsbHkpO1xuIl0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7Ozs7QUFLQSxTQUFTLGtCQUFrQjtBQUMzQixTQUFTLFdBQVc7QUFDcEIsU0FBUyx1QkFBdUI7QUFDaEMsU0FBUyxvQkFBb0I7QUFDN0IsU0FBa0Isc0JBQWdFO0FBQ2xGLFNBQVMsZ0NBQWdDO0FBQ3pDLFNBQVMsZ0NBQWdDLHNCQUFzQjtBQUMvRCxTQUFTLHFDQUFxQztBQUU5QyxJQUFNLDhCQUFOLGNBQTBDLFdBQThCO0FBQUEsRUFHdkUsWUFDaUIsZUFDa0IsZ0JBQ0gsYUFDWSx5QkFDMUM7QUFDRCxVQUFNO0FBSjRCO0FBQ0g7QUFDWTtBQUkzQyxTQUFLLFVBQVUsY0FBYyxlQUFlLElBQUksQ0FBQztBQUFBLEVBQ2xEO0FBQUEsRUFFQSxNQUFNLEtBQUssTUFBb0IsU0FBdUU7QUFDckcsUUFBSTtBQUNILFVBQUssU0FBaUMsY0FBYztBQUNuRCxlQUFPO0FBQUEsTUFDUjtBQUVBLFlBQU0sTUFBTSxPQUFPLFNBQVMsV0FBVyxJQUFJLE1BQU0sSUFBSSxJQUFJO0FBQ3pELFVBQUksS0FBSyx3QkFBd0Isa0JBQWtCLEdBQUcsR0FBRztBQUN4RCxhQUFLLE1BQU0sS0FBSyxZQUFZLEtBQUssR0FBRyxHQUFHLGFBQWE7QUFDbkQsZ0JBQU0sS0FBSyxlQUFlLGVBQWUsK0JBQStCLEdBQUc7QUFDM0UsaUJBQU87QUFBQSxRQUNSO0FBQUEsTUFDRDtBQUFBLElBQ0QsUUFBUTtBQUFBLElBRVI7QUFFQSxXQUFPO0FBQUEsRUFDUjtBQUNEO0FBakNNLDRCQUNrQixLQUFLO0FBRHZCLDhCQUFOO0FBQUEsRUFJRztBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEdBUEc7QUFvQ04sK0JBQStCLDRCQUE0QixJQUFJLDZCQUE2QixlQUFlLFVBQVU7IiwKICAibmFtZXMiOiBbXQp9Cg==
