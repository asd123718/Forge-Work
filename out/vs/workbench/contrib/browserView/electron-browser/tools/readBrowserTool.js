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
import { Codicon } from "../../../../../base/common/codicons.js";
import { MarkdownString } from "../../../../../base/common/htmlContent.js";
import { localize } from "../../../../../nls.js";
import { IPlaywrightService } from "../../../../../platform/browserView/common/playwrightService.js";
import { ToolDataSource } from "../../../chat/common/tools/languageModelToolsService.js";
import { createBrowserPageLink, errorResult, getSessionId } from "./browserToolHelpers.js";
import { BrowserChatToolReferenceName } from "../../../../../platform/browserView/common/browserChatToolReferenceNames.js";
import { OpenPageToolId } from "./openBrowserTool.js";
const ReadBrowserToolData = {
  id: "read_page",
  toolReferenceName: BrowserChatToolReferenceName.ReadPage,
  displayName: localize("readBrowserTool.displayName", "Read Page"),
  userDescription: localize("readBrowserTool.userDescription", "Read the content of a browser page"),
  modelDescription: "Get a snapshot of the current browser page state. This is better than screenshot.",
  icon: Codicon.fileText,
  source: ToolDataSource.Internal,
  inputSchema: {
    type: "object",
    properties: {
      pageId: {
        type: "string",
        description: `The browser page ID to read, acquired from context or the open tool.`
      }
    },
    required: ["pageId"]
  }
};
let ReadBrowserTool = class {
  constructor(playwrightService) {
    this.playwrightService = playwrightService;
  }
  async prepareToolInvocation(_context, _token) {
    const link = createBrowserPageLink(_context.parameters.pageId);
    return {
      invocationMessage: new MarkdownString(localize("browser.read.invocation", "Reading {0}", link)),
      pastTenseMessage: new MarkdownString(localize("browser.read.past", "Read {0}", link))
    };
  }
  async invoke(invocation, _countTokens, _progress, _token) {
    const params = invocation.parameters;
    const sessionId = getSessionId(invocation);
    if (!params.pageId) {
      return errorResult(`No page ID provided. Use '${OpenPageToolId}' first.`);
    }
    const summary = await this.playwrightService.getSummary(sessionId, params.pageId);
    if (!summary) {
      return errorResult("No page summary available.");
    }
    return {
      content: [{
        kind: "text",
        value: summary
      }]
    };
  }
};
ReadBrowserTool = __decorateClass([
  __decorateParam(0, IPlaywrightService)
], ReadBrowserTool);
export {
  ReadBrowserTool,
  ReadBrowserToolData
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXGJyb3dzZXJWaWV3XFxlbGVjdHJvbi1icm93c2VyXFx0b29sc1xccmVhZEJyb3dzZXJUb29sLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IHR5cGUgeyBDYW5jZWxsYXRpb25Ub2tlbiB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2NhbmNlbGxhdGlvbi5qcyc7XG5pbXBvcnQgeyBDb2RpY29uIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vY29kaWNvbnMuanMnO1xuaW1wb3J0IHsgTWFya2Rvd25TdHJpbmcgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9odG1sQ29udGVudC5qcyc7XG5pbXBvcnQgeyBsb2NhbGl6ZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL25scy5qcyc7XG5pbXBvcnQgeyBJUGxheXdyaWdodFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9icm93c2VyVmlldy9jb21tb24vcGxheXdyaWdodFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgVG9vbERhdGFTb3VyY2UsIHR5cGUgQ291bnRUb2tlbnNDYWxsYmFjaywgdHlwZSBJUHJlcGFyZWRUb29sSW52b2NhdGlvbiwgdHlwZSBJVG9vbERhdGEsIHR5cGUgSVRvb2xJbXBsLCB0eXBlIElUb29sSW52b2NhdGlvbiwgdHlwZSBJVG9vbEludm9jYXRpb25QcmVwYXJhdGlvbkNvbnRleHQsIHR5cGUgSVRvb2xSZXN1bHQsIHR5cGUgVG9vbFByb2dyZXNzIH0gZnJvbSAnLi4vLi4vLi4vY2hhdC9jb21tb24vdG9vbHMvbGFuZ3VhZ2VNb2RlbFRvb2xzU2VydmljZS5qcyc7XG5pbXBvcnQgeyBjcmVhdGVCcm93c2VyUGFnZUxpbmssIGVycm9yUmVzdWx0LCBnZXRTZXNzaW9uSWQgfSBmcm9tICcuL2Jyb3dzZXJUb29sSGVscGVycy5qcyc7XG5pbXBvcnQgeyBCcm93c2VyQ2hhdFRvb2xSZWZlcmVuY2VOYW1lIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vYnJvd3NlclZpZXcvY29tbW9uL2Jyb3dzZXJDaGF0VG9vbFJlZmVyZW5jZU5hbWVzLmpzJztcbmltcG9ydCB7IE9wZW5QYWdlVG9vbElkIH0gZnJvbSAnLi9vcGVuQnJvd3NlclRvb2wuanMnO1xuXG5leHBvcnQgY29uc3QgUmVhZEJyb3dzZXJUb29sRGF0YTogSVRvb2xEYXRhID0ge1xuXHRpZDogJ3JlYWRfcGFnZScsXG5cdHRvb2xSZWZlcmVuY2VOYW1lOiBCcm93c2VyQ2hhdFRvb2xSZWZlcmVuY2VOYW1lLlJlYWRQYWdlLFxuXHRkaXNwbGF5TmFtZTogbG9jYWxpemUoJ3JlYWRCcm93c2VyVG9vbC5kaXNwbGF5TmFtZScsICdSZWFkIFBhZ2UnKSxcblx0dXNlckRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgncmVhZEJyb3dzZXJUb29sLnVzZXJEZXNjcmlwdGlvbicsICdSZWFkIHRoZSBjb250ZW50IG9mIGEgYnJvd3NlciBwYWdlJyksXG5cdG1vZGVsRGVzY3JpcHRpb246ICdHZXQgYSBzbmFwc2hvdCBvZiB0aGUgY3VycmVudCBicm93c2VyIHBhZ2Ugc3RhdGUuIFRoaXMgaXMgYmV0dGVyIHRoYW4gc2NyZWVuc2hvdC4nLFxuXHRpY29uOiBDb2RpY29uLmZpbGVUZXh0LFxuXHRzb3VyY2U6IFRvb2xEYXRhU291cmNlLkludGVybmFsLFxuXHRpbnB1dFNjaGVtYToge1xuXHRcdHR5cGU6ICdvYmplY3QnLFxuXHRcdHByb3BlcnRpZXM6IHtcblx0XHRcdHBhZ2VJZDoge1xuXHRcdFx0XHR0eXBlOiAnc3RyaW5nJyxcblx0XHRcdFx0ZGVzY3JpcHRpb246IGBUaGUgYnJvd3NlciBwYWdlIElEIHRvIHJlYWQsIGFjcXVpcmVkIGZyb20gY29udGV4dCBvciB0aGUgb3BlbiB0b29sLmBcblx0XHRcdH0sXG5cdFx0fSxcblx0XHRyZXF1aXJlZDogWydwYWdlSWQnXSxcblx0fSxcbn07XG5cbmludGVyZmFjZSBJUmVhZEJyb3dzZXJUb29sUGFyYW1zIHtcblx0cGFnZUlkOiBzdHJpbmc7XG59XG5cbmV4cG9ydCBjbGFzcyBSZWFkQnJvd3NlclRvb2wgaW1wbGVtZW50cyBJVG9vbEltcGwge1xuXHRjb25zdHJ1Y3Rvcihcblx0XHRASVBsYXl3cmlnaHRTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgcGxheXdyaWdodFNlcnZpY2U6IElQbGF5d3JpZ2h0U2VydmljZSxcblx0KSB7IH1cblxuXHRhc3luYyBwcmVwYXJlVG9vbEludm9jYXRpb24oX2NvbnRleHQ6IElUb29sSW52b2NhdGlvblByZXBhcmF0aW9uQ29udGV4dCwgX3Rva2VuOiBDYW5jZWxsYXRpb25Ub2tlbik6IFByb21pc2U8SVByZXBhcmVkVG9vbEludm9jYXRpb24gfCB1bmRlZmluZWQ+IHtcblx0XHRjb25zdCBsaW5rID0gY3JlYXRlQnJvd3NlclBhZ2VMaW5rKF9jb250ZXh0LnBhcmFtZXRlcnMucGFnZUlkKTtcblx0XHRyZXR1cm4ge1xuXHRcdFx0aW52b2NhdGlvbk1lc3NhZ2U6IG5ldyBNYXJrZG93blN0cmluZyhsb2NhbGl6ZSgnYnJvd3Nlci5yZWFkLmludm9jYXRpb24nLCBcIlJlYWRpbmcgezB9XCIsIGxpbmspKSxcblx0XHRcdHBhc3RUZW5zZU1lc3NhZ2U6IG5ldyBNYXJrZG93blN0cmluZyhsb2NhbGl6ZSgnYnJvd3Nlci5yZWFkLnBhc3QnLCBcIlJlYWQgezB9XCIsIGxpbmspKSxcblx0XHR9O1xuXHR9XG5cblx0YXN5bmMgaW52b2tlKGludm9jYXRpb246IElUb29sSW52b2NhdGlvbiwgX2NvdW50VG9rZW5zOiBDb3VudFRva2Vuc0NhbGxiYWNrLCBfcHJvZ3Jlc3M6IFRvb2xQcm9ncmVzcywgX3Rva2VuOiBDYW5jZWxsYXRpb25Ub2tlbik6IFByb21pc2U8SVRvb2xSZXN1bHQ+IHtcblx0XHRjb25zdCBwYXJhbXMgPSBpbnZvY2F0aW9uLnBhcmFtZXRlcnMgYXMgSVJlYWRCcm93c2VyVG9vbFBhcmFtcztcblx0XHRjb25zdCBzZXNzaW9uSWQgPSBnZXRTZXNzaW9uSWQoaW52b2NhdGlvbik7XG5cblx0XHRpZiAoIXBhcmFtcy5wYWdlSWQpIHtcblx0XHRcdHJldHVybiBlcnJvclJlc3VsdChgTm8gcGFnZSBJRCBwcm92aWRlZC4gVXNlICcke09wZW5QYWdlVG9vbElkfScgZmlyc3QuYCk7XG5cdFx0fVxuXG5cdFx0Y29uc3Qgc3VtbWFyeSA9IGF3YWl0IHRoaXMucGxheXdyaWdodFNlcnZpY2UuZ2V0U3VtbWFyeShzZXNzaW9uSWQsIHBhcmFtcy5wYWdlSWQpO1xuXHRcdGlmICghc3VtbWFyeSkge1xuXHRcdFx0cmV0dXJuIGVycm9yUmVzdWx0KCdObyBwYWdlIHN1bW1hcnkgYXZhaWxhYmxlLicpO1xuXHRcdH1cblxuXHRcdHJldHVybiB7XG5cdFx0XHRjb250ZW50OiBbe1xuXHRcdFx0XHRraW5kOiAndGV4dCcsXG5cdFx0XHRcdHZhbHVlOiBzdW1tYXJ5LFxuXHRcdFx0fV0sXG5cdFx0fTtcblx0fVxufVxuIl0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7Ozs7QUFNQSxTQUFTLGVBQWU7QUFDeEIsU0FBUyxzQkFBc0I7QUFDL0IsU0FBUyxnQkFBZ0I7QUFDekIsU0FBUywwQkFBMEI7QUFDbkMsU0FBUyxzQkFBaU47QUFDMU4sU0FBUyx1QkFBdUIsYUFBYSxvQkFBb0I7QUFDakUsU0FBUyxvQ0FBb0M7QUFDN0MsU0FBUyxzQkFBc0I7QUFFeEIsTUFBTSxzQkFBaUM7QUFBQSxFQUM3QyxJQUFJO0FBQUEsRUFDSixtQkFBbUIsNkJBQTZCO0FBQUEsRUFDaEQsYUFBYSxTQUFTLCtCQUErQixXQUFXO0FBQUEsRUFDaEUsaUJBQWlCLFNBQVMsbUNBQW1DLG9DQUFvQztBQUFBLEVBQ2pHLGtCQUFrQjtBQUFBLEVBQ2xCLE1BQU0sUUFBUTtBQUFBLEVBQ2QsUUFBUSxlQUFlO0FBQUEsRUFDdkIsYUFBYTtBQUFBLElBQ1osTUFBTTtBQUFBLElBQ04sWUFBWTtBQUFBLE1BQ1gsUUFBUTtBQUFBLFFBQ1AsTUFBTTtBQUFBLFFBQ04sYUFBYTtBQUFBLE1BQ2Q7QUFBQSxJQUNEO0FBQUEsSUFDQSxVQUFVLENBQUMsUUFBUTtBQUFBLEVBQ3BCO0FBQ0Q7QUFNTyxJQUFNLGtCQUFOLE1BQTJDO0FBQUEsRUFDakQsWUFDc0MsbUJBQ3BDO0FBRG9DO0FBQUEsRUFDbEM7QUFBQSxFQUVKLE1BQU0sc0JBQXNCLFVBQTZDLFFBQXlFO0FBQ2pKLFVBQU0sT0FBTyxzQkFBc0IsU0FBUyxXQUFXLE1BQU07QUFDN0QsV0FBTztBQUFBLE1BQ04sbUJBQW1CLElBQUksZUFBZSxTQUFTLDJCQUEyQixlQUFlLElBQUksQ0FBQztBQUFBLE1BQzlGLGtCQUFrQixJQUFJLGVBQWUsU0FBUyxxQkFBcUIsWUFBWSxJQUFJLENBQUM7QUFBQSxJQUNyRjtBQUFBLEVBQ0Q7QUFBQSxFQUVBLE1BQU0sT0FBTyxZQUE2QixjQUFtQyxXQUF5QixRQUFpRDtBQUN0SixVQUFNLFNBQVMsV0FBVztBQUMxQixVQUFNLFlBQVksYUFBYSxVQUFVO0FBRXpDLFFBQUksQ0FBQyxPQUFPLFFBQVE7QUFDbkIsYUFBTyxZQUFZLDZCQUE2QixjQUFjLFVBQVU7QUFBQSxJQUN6RTtBQUVBLFVBQU0sVUFBVSxNQUFNLEtBQUssa0JBQWtCLFdBQVcsV0FBVyxPQUFPLE1BQU07QUFDaEYsUUFBSSxDQUFDLFNBQVM7QUFDYixhQUFPLFlBQVksNEJBQTRCO0FBQUEsSUFDaEQ7QUFFQSxXQUFPO0FBQUEsTUFDTixTQUFTLENBQUM7QUFBQSxRQUNULE1BQU07QUFBQSxRQUNOLE9BQU87QUFBQSxNQUNSLENBQUM7QUFBQSxJQUNGO0FBQUEsRUFDRDtBQUNEO0FBakNhLGtCQUFOO0FBQUEsRUFFSjtBQUFBLEdBRlU7IiwKICAibmFtZXMiOiBbXQp9Cg==
