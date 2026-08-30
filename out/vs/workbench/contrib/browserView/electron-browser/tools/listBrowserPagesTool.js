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
import { IAgentNetworkFilterService } from "../../../../../platform/networkFilter/common/networkFilterService.js";
import { IEditorService } from "../../../../services/editor/common/editorService.js";
import { ToolDataSource } from "../../../chat/common/tools/languageModelToolsService.js";
import { IBrowserViewWorkbenchService } from "../../common/browserView.js";
import { getBrowserPagesContext } from "./browserToolHelpers.js";
const ListBrowserPagesToolData = {
  id: "list_browser_pages",
  displayName: localize("listBrowserPagesTool.displayName", "List Browser Pages"),
  userDescription: localize("listBrowserPagesTool.userDescription", "List browser pages that are shared with the agent"),
  modelDescription: "Lists the browser pages that are currently shared with the agent.",
  source: ToolDataSource.Internal,
  // Note: this tool has no toolReferenceName and cannot be referenced in prompts.
  // It is not intended to be used by models directly since browser pages are supplied as context.
  canBeReferencedInPrompt: false,
  inputSchema: {
    type: "object",
    properties: {}
  }
};
let ListBrowserPagesTool = class {
  constructor(editorService, browserViewService, agentNetworkFilterService) {
    this.editorService = editorService;
    this.browserViewService = browserViewService;
    this.agentNetworkFilterService = agentNetworkFilterService;
  }
  async invoke(invocation, _countTokens, _progress, _token) {
    const activeSessionId = invocation.context?.sessionResource.toString();
    const value = getBrowserPagesContext(
      this.editorService,
      this.browserViewService,
      this.agentNetworkFilterService,
      {
        activeSessionId,
        canPromptUser: activeSessionId !== void 0
      }
    );
    return {
      content: [{
        kind: "text",
        value: value ?? "No browser pages are currently open."
      }]
    };
  }
};
ListBrowserPagesTool = __decorateClass([
  __decorateParam(0, IEditorService),
  __decorateParam(1, IBrowserViewWorkbenchService),
  __decorateParam(2, IAgentNetworkFilterService)
], ListBrowserPagesTool);
export {
  ListBrowserPagesTool,
  ListBrowserPagesToolData
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXGJyb3dzZXJWaWV3XFxlbGVjdHJvbi1icm93c2VyXFx0b29sc1xcbGlzdEJyb3dzZXJQYWdlc1Rvb2wudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgdHlwZSB7IENhbmNlbGxhdGlvblRva2VuIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vY2FuY2VsbGF0aW9uLmpzJztcbmltcG9ydCB7IGxvY2FsaXplIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vbmxzLmpzJztcbmltcG9ydCB7IElBZ2VudE5ldHdvcmtGaWx0ZXJTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vbmV0d29ya0ZpbHRlci9jb21tb24vbmV0d29ya0ZpbHRlclNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSUVkaXRvclNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9zZXJ2aWNlcy9lZGl0b3IvY29tbW9uL2VkaXRvclNlcnZpY2UuanMnO1xuaW1wb3J0IHsgQ291bnRUb2tlbnNDYWxsYmFjaywgSVRvb2xEYXRhLCBJVG9vbEltcGwsIElUb29sSW52b2NhdGlvbiwgSVRvb2xSZXN1bHQsIFRvb2xEYXRhU291cmNlLCBUb29sUHJvZ3Jlc3MgfSBmcm9tICcuLi8uLi8uLi9jaGF0L2NvbW1vbi90b29scy9sYW5ndWFnZU1vZGVsVG9vbHNTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElCcm93c2VyVmlld1dvcmtiZW5jaFNlcnZpY2UgfSBmcm9tICcuLi8uLi9jb21tb24vYnJvd3NlclZpZXcuanMnO1xuaW1wb3J0IHsgZ2V0QnJvd3NlclBhZ2VzQ29udGV4dCB9IGZyb20gJy4vYnJvd3NlclRvb2xIZWxwZXJzLmpzJztcblxuZXhwb3J0IGNvbnN0IExpc3RCcm93c2VyUGFnZXNUb29sRGF0YTogSVRvb2xEYXRhID0ge1xuXHRpZDogJ2xpc3RfYnJvd3Nlcl9wYWdlcycsXG5cdGRpc3BsYXlOYW1lOiBsb2NhbGl6ZSgnbGlzdEJyb3dzZXJQYWdlc1Rvb2wuZGlzcGxheU5hbWUnLCAnTGlzdCBCcm93c2VyIFBhZ2VzJyksXG5cdHVzZXJEZXNjcmlwdGlvbjogbG9jYWxpemUoJ2xpc3RCcm93c2VyUGFnZXNUb29sLnVzZXJEZXNjcmlwdGlvbicsICdMaXN0IGJyb3dzZXIgcGFnZXMgdGhhdCBhcmUgc2hhcmVkIHdpdGggdGhlIGFnZW50JyksXG5cdG1vZGVsRGVzY3JpcHRpb246ICdMaXN0cyB0aGUgYnJvd3NlciBwYWdlcyB0aGF0IGFyZSBjdXJyZW50bHkgc2hhcmVkIHdpdGggdGhlIGFnZW50LicsXG5cdHNvdXJjZTogVG9vbERhdGFTb3VyY2UuSW50ZXJuYWwsXG5cblx0Ly8gTm90ZTogdGhpcyB0b29sIGhhcyBubyB0b29sUmVmZXJlbmNlTmFtZSBhbmQgY2Fubm90IGJlIHJlZmVyZW5jZWQgaW4gcHJvbXB0cy5cblx0Ly8gSXQgaXMgbm90IGludGVuZGVkIHRvIGJlIHVzZWQgYnkgbW9kZWxzIGRpcmVjdGx5IHNpbmNlIGJyb3dzZXIgcGFnZXMgYXJlIHN1cHBsaWVkIGFzIGNvbnRleHQuXG5cdGNhbkJlUmVmZXJlbmNlZEluUHJvbXB0OiBmYWxzZSxcblxuXHRpbnB1dFNjaGVtYToge1xuXHRcdHR5cGU6ICdvYmplY3QnLFxuXHRcdHByb3BlcnRpZXM6IHt9LFxuXHR9LFxufTtcblxuZXhwb3J0IGNsYXNzIExpc3RCcm93c2VyUGFnZXNUb29sIGltcGxlbWVudHMgSVRvb2xJbXBsIHtcblx0Y29uc3RydWN0b3IoXG5cdFx0QElFZGl0b3JTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgZWRpdG9yU2VydmljZTogSUVkaXRvclNlcnZpY2UsXG5cdFx0QElCcm93c2VyVmlld1dvcmtiZW5jaFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBicm93c2VyVmlld1NlcnZpY2U6IElCcm93c2VyVmlld1dvcmtiZW5jaFNlcnZpY2UsXG5cdFx0QElBZ2VudE5ldHdvcmtGaWx0ZXJTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgYWdlbnROZXR3b3JrRmlsdGVyU2VydmljZTogSUFnZW50TmV0d29ya0ZpbHRlclNlcnZpY2UsXG5cdCkgeyB9XG5cblx0YXN5bmMgaW52b2tlKGludm9jYXRpb246IElUb29sSW52b2NhdGlvbiwgX2NvdW50VG9rZW5zOiBDb3VudFRva2Vuc0NhbGxiYWNrLCBfcHJvZ3Jlc3M6IFRvb2xQcm9ncmVzcywgX3Rva2VuOiBDYW5jZWxsYXRpb25Ub2tlbik6IFByb21pc2U8SVRvb2xSZXN1bHQ+IHtcblx0XHRjb25zdCBhY3RpdmVTZXNzaW9uSWQgPSBpbnZvY2F0aW9uLmNvbnRleHQ/LnNlc3Npb25SZXNvdXJjZS50b1N0cmluZygpO1xuXHRcdGNvbnN0IHZhbHVlID0gZ2V0QnJvd3NlclBhZ2VzQ29udGV4dChcblx0XHRcdHRoaXMuZWRpdG9yU2VydmljZSxcblx0XHRcdHRoaXMuYnJvd3NlclZpZXdTZXJ2aWNlLFxuXHRcdFx0dGhpcy5hZ2VudE5ldHdvcmtGaWx0ZXJTZXJ2aWNlLFxuXHRcdFx0e1xuXHRcdFx0XHRhY3RpdmVTZXNzaW9uSWQsXG5cdFx0XHRcdGNhblByb21wdFVzZXI6IGFjdGl2ZVNlc3Npb25JZCAhPT0gdW5kZWZpbmVkLFxuXHRcdFx0fSxcblx0XHQpO1xuXHRcdHJldHVybiB7XG5cdFx0XHRjb250ZW50OiBbe1xuXHRcdFx0XHRraW5kOiAndGV4dCcsXG5cdFx0XHRcdHZhbHVlOiB2YWx1ZSA/PyAnTm8gYnJvd3NlciBwYWdlcyBhcmUgY3VycmVudGx5IG9wZW4uJyxcblx0XHRcdH1dLFxuXHRcdH07XG5cdH1cbn1cbiJdLAogICJtYXBwaW5ncyI6ICI7Ozs7Ozs7Ozs7O0FBTUEsU0FBUyxnQkFBZ0I7QUFDekIsU0FBUyxrQ0FBa0M7QUFDM0MsU0FBUyxzQkFBc0I7QUFDL0IsU0FBa0Ysc0JBQW9DO0FBQ3RILFNBQVMsb0NBQW9DO0FBQzdDLFNBQVMsOEJBQThCO0FBRWhDLE1BQU0sMkJBQXNDO0FBQUEsRUFDbEQsSUFBSTtBQUFBLEVBQ0osYUFBYSxTQUFTLG9DQUFvQyxvQkFBb0I7QUFBQSxFQUM5RSxpQkFBaUIsU0FBUyx3Q0FBd0MsbURBQW1EO0FBQUEsRUFDckgsa0JBQWtCO0FBQUEsRUFDbEIsUUFBUSxlQUFlO0FBQUE7QUFBQTtBQUFBLEVBSXZCLHlCQUF5QjtBQUFBLEVBRXpCLGFBQWE7QUFBQSxJQUNaLE1BQU07QUFBQSxJQUNOLFlBQVksQ0FBQztBQUFBLEVBQ2Q7QUFDRDtBQUVPLElBQU0sdUJBQU4sTUFBZ0Q7QUFBQSxFQUN0RCxZQUNrQyxlQUNjLG9CQUNGLDJCQUM1QztBQUhnQztBQUNjO0FBQ0Y7QUFBQSxFQUMxQztBQUFBLEVBRUosTUFBTSxPQUFPLFlBQTZCLGNBQW1DLFdBQXlCLFFBQWlEO0FBQ3RKLFVBQU0sa0JBQWtCLFdBQVcsU0FBUyxnQkFBZ0IsU0FBUztBQUNyRSxVQUFNLFFBQVE7QUFBQSxNQUNiLEtBQUs7QUFBQSxNQUNMLEtBQUs7QUFBQSxNQUNMLEtBQUs7QUFBQSxNQUNMO0FBQUEsUUFDQztBQUFBLFFBQ0EsZUFBZSxvQkFBb0I7QUFBQSxNQUNwQztBQUFBLElBQ0Q7QUFDQSxXQUFPO0FBQUEsTUFDTixTQUFTLENBQUM7QUFBQSxRQUNULE1BQU07QUFBQSxRQUNOLE9BQU8sU0FBUztBQUFBLE1BQ2pCLENBQUM7QUFBQSxJQUNGO0FBQUEsRUFDRDtBQUNEO0FBekJhLHVCQUFOO0FBQUEsRUFFSjtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsR0FKVTsiLAogICJuYW1lcyI6IFtdCn0K
