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
import { Action } from "../../../../base/common/actions.js";
import { IWorkbenchIssueService } from "../../issue/common/issue.js";
let ReportExtensionIssueAction = class extends Action {
  // TODO: Consider passing in IExtensionStatus or IExtensionHostProfile for additional data
  constructor(extension, issueService) {
    super(ReportExtensionIssueAction._id, ReportExtensionIssueAction._label, "extension-action report-issue");
    this.extension = extension;
    this.issueService = issueService;
    this.enabled = extension.isBuiltin || !!extension.repository && !!extension.repository.url;
  }
  async run() {
    await this.issueService.openReporter({
      extensionId: this.extension.identifier.value
    });
  }
};
ReportExtensionIssueAction._id = "workbench.extensions.action.reportExtensionIssue";
ReportExtensionIssueAction._label = nls.localize("reportExtensionIssue", "Report Issue");
ReportExtensionIssueAction = __decorateClass([
  __decorateParam(1, IWorkbenchIssueService)
], ReportExtensionIssueAction);
export {
  ReportExtensionIssueAction
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXGV4dGVuc2lvbnNcXGNvbW1vblxccmVwb3J0RXh0ZW5zaW9uSXNzdWVBY3Rpb24udHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgKiBhcyBubHMgZnJvbSAnLi4vLi4vLi4vLi4vbmxzLmpzJztcbmltcG9ydCB7IEFjdGlvbiB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2FjdGlvbnMuanMnO1xuaW1wb3J0IHsgSUV4dGVuc2lvbkRlc2NyaXB0aW9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vcGxhdGZvcm0vZXh0ZW5zaW9ucy9jb21tb24vZXh0ZW5zaW9ucy5qcyc7XG5pbXBvcnQgeyBJV29ya2JlbmNoSXNzdWVTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vaXNzdWUvY29tbW9uL2lzc3VlLmpzJztcblxuZXhwb3J0IGNsYXNzIFJlcG9ydEV4dGVuc2lvbklzc3VlQWN0aW9uIGV4dGVuZHMgQWN0aW9uIHtcblxuXHRwcml2YXRlIHN0YXRpYyByZWFkb25seSBfaWQgPSAnd29ya2JlbmNoLmV4dGVuc2lvbnMuYWN0aW9uLnJlcG9ydEV4dGVuc2lvbklzc3VlJztcblx0cHJpdmF0ZSBzdGF0aWMgcmVhZG9ubHkgX2xhYmVsID0gbmxzLmxvY2FsaXplKCdyZXBvcnRFeHRlbnNpb25Jc3N1ZScsIFwiUmVwb3J0IElzc3VlXCIpO1xuXG5cdC8vIFRPRE86IENvbnNpZGVyIHBhc3NpbmcgaW4gSUV4dGVuc2lvblN0YXR1cyBvciBJRXh0ZW5zaW9uSG9zdFByb2ZpbGUgZm9yIGFkZGl0aW9uYWwgZGF0YVxuXHRjb25zdHJ1Y3Rvcihcblx0XHRwcml2YXRlIGV4dGVuc2lvbjogSUV4dGVuc2lvbkRlc2NyaXB0aW9uLFxuXHRcdEBJV29ya2JlbmNoSXNzdWVTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgaXNzdWVTZXJ2aWNlOiBJV29ya2JlbmNoSXNzdWVTZXJ2aWNlXG5cdCkge1xuXHRcdHN1cGVyKFJlcG9ydEV4dGVuc2lvbklzc3VlQWN0aW9uLl9pZCwgUmVwb3J0RXh0ZW5zaW9uSXNzdWVBY3Rpb24uX2xhYmVsLCAnZXh0ZW5zaW9uLWFjdGlvbiByZXBvcnQtaXNzdWUnKTtcblxuXHRcdHRoaXMuZW5hYmxlZCA9IGV4dGVuc2lvbi5pc0J1aWx0aW4gfHwgKCEhZXh0ZW5zaW9uLnJlcG9zaXRvcnkgJiYgISFleHRlbnNpb24ucmVwb3NpdG9yeS51cmwpO1xuXHR9XG5cblx0b3ZlcnJpZGUgYXN5bmMgcnVuKCk6IFByb21pc2U8dm9pZD4ge1xuXHRcdGF3YWl0IHRoaXMuaXNzdWVTZXJ2aWNlLm9wZW5SZXBvcnRlcih7XG5cdFx0XHRleHRlbnNpb25JZDogdGhpcy5leHRlbnNpb24uaWRlbnRpZmllci52YWx1ZSxcblx0XHR9KTtcblx0fVxufVxuIl0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7Ozs7QUFLQSxZQUFZLFNBQVM7QUFDckIsU0FBUyxjQUFjO0FBRXZCLFNBQVMsOEJBQThCO0FBRWhDLElBQU0sNkJBQU4sY0FBeUMsT0FBTztBQUFBO0FBQUEsRUFNdEQsWUFDUyxXQUNpQyxjQUN4QztBQUNELFVBQU0sMkJBQTJCLEtBQUssMkJBQTJCLFFBQVEsK0JBQStCO0FBSGhHO0FBQ2lDO0FBSXpDLFNBQUssVUFBVSxVQUFVLGFBQWMsQ0FBQyxDQUFDLFVBQVUsY0FBYyxDQUFDLENBQUMsVUFBVSxXQUFXO0FBQUEsRUFDekY7QUFBQSxFQUVBLE1BQWUsTUFBcUI7QUFDbkMsVUFBTSxLQUFLLGFBQWEsYUFBYTtBQUFBLE1BQ3BDLGFBQWEsS0FBSyxVQUFVLFdBQVc7QUFBQSxJQUN4QyxDQUFDO0FBQUEsRUFDRjtBQUNEO0FBcEJhLDJCQUVZLE1BQU07QUFGbEIsMkJBR1ksU0FBUyxJQUFJLFNBQVMsd0JBQXdCLGNBQWM7QUFIeEUsNkJBQU47QUFBQSxFQVFKO0FBQUEsR0FSVTsiLAogICJuYW1lcyI6IFtdCn0K
