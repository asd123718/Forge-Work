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
import { escapeMarkdownSyntaxTokens, MarkdownString } from "../../../../../base/common/htmlContent.js";
import { localize } from "../../../../../nls.js";
import { IPlaywrightService } from "../../../../../platform/browserView/common/playwrightService.js";
import { ToolDataSource } from "../../../chat/common/tools/languageModelToolsService.js";
import { createBrowserPageLink, DEFAULT_ELEMENT_LABEL, errorResult, getSessionId, playwrightInvoke } from "./browserToolHelpers.js";
import { BrowserChatToolReferenceName } from "../../../../../platform/browserView/common/browserChatToolReferenceNames.js";
import { OpenPageToolId } from "./openBrowserTool.js";
const DragElementToolData = {
  id: "drag_element",
  toolReferenceName: BrowserChatToolReferenceName.DragElement,
  displayName: localize("dragElementTool.displayName", "Drag Element"),
  userDescription: localize("dragElementTool.userDescription", "Drag an element over another element"),
  modelDescription: "Drag an element over another element in a browser page.",
  icon: Codicon.move,
  source: ToolDataSource.Internal,
  inputSchema: {
    type: "object",
    properties: {
      pageId: {
        type: "string",
        description: `The browser page ID, acquired from context or the open tool.`
      },
      fromRef: {
        type: "string",
        description: "Element reference of the element to drag."
      },
      fromSelector: {
        type: "string",
        description: 'Playwright selector of the element to drag when "fromRef" is not available.'
      },
      fromElement: {
        type: "string",
        description: 'Human-readable description of the element to drag (e.g., "file item", "draggable card").'
      },
      toRef: {
        type: "string",
        description: "Element reference of the element to drop onto."
      },
      toSelector: {
        type: "string",
        description: 'Playwright selector of the element to drop onto when "toRef" is not available.'
      },
      toElement: {
        type: "string",
        description: 'Human-readable description of the element to drop onto (e.g., "drop zone", "target folder").'
      }
    },
    required: ["pageId", "fromElement", "toElement"],
    $comment: 'One of "fromRef" or "fromSelector" is required, and one of "toRef" or "toSelector" is required.'
  }
};
let DragElementTool = class {
  constructor(playwrightService) {
    this.playwrightService = playwrightService;
  }
  async prepareToolInvocation(_context, _token) {
    const params = _context.parameters;
    const link = createBrowserPageLink(params.pageId);
    const fromElement = escapeMarkdownSyntaxTokens(params.fromElement ?? DEFAULT_ELEMENT_LABEL);
    const toElement = escapeMarkdownSyntaxTokens(params.toElement ?? DEFAULT_ELEMENT_LABEL);
    return {
      invocationMessage: new MarkdownString(localize("browser.drag.invocation", "Dragging {0} to {1} in {2}", fromElement, toElement, link)),
      pastTenseMessage: new MarkdownString(localize("browser.drag.past", "Dragged {0} to {1} in {2}", fromElement, toElement, link))
    };
  }
  async invoke(invocation, _countTokens, _progress, _token) {
    const params = invocation.parameters;
    const sessionId = getSessionId(invocation);
    if (!params.pageId) {
      return errorResult(`No page ID provided. Use '${OpenPageToolId}' first.`);
    }
    let fromSelector = params.fromSelector;
    if (params.fromRef) {
      fromSelector = `aria-ref=${params.fromRef}`;
    }
    if (!fromSelector) {
      return errorResult('Either a "fromRef" or "fromSelector" parameter is required for the source element.');
    }
    let toSelector = params.toSelector;
    if (params.toRef) {
      toSelector = `aria-ref=${params.toRef}`;
    }
    if (!toSelector) {
      return errorResult('Either a "toRef" or "toSelector" parameter is required for the target element.');
    }
    return playwrightInvoke(this.playwrightService, sessionId, params.pageId, (page, from, to) => page.dragAndDrop(from, to), fromSelector, toSelector);
  }
};
DragElementTool = __decorateClass([
  __decorateParam(0, IPlaywrightService)
], DragElementTool);
export {
  DragElementTool,
  DragElementToolData
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXGJyb3dzZXJWaWV3XFxlbGVjdHJvbi1icm93c2VyXFx0b29sc1xcZHJhZ0VsZW1lbnRUb29sLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IHR5cGUgeyBDYW5jZWxsYXRpb25Ub2tlbiB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2NhbmNlbGxhdGlvbi5qcyc7XG5pbXBvcnQgeyBDb2RpY29uIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vY29kaWNvbnMuanMnO1xuaW1wb3J0IHsgZXNjYXBlTWFya2Rvd25TeW50YXhUb2tlbnMsIE1hcmtkb3duU3RyaW5nIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vaHRtbENvbnRlbnQuanMnO1xuaW1wb3J0IHsgbG9jYWxpemUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9ubHMuanMnO1xuaW1wb3J0IHsgSVBsYXl3cmlnaHRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vYnJvd3NlclZpZXcvY29tbW9uL3BsYXl3cmlnaHRTZXJ2aWNlLmpzJztcbmltcG9ydCB7IFRvb2xEYXRhU291cmNlLCB0eXBlIENvdW50VG9rZW5zQ2FsbGJhY2ssIHR5cGUgSVByZXBhcmVkVG9vbEludm9jYXRpb24sIHR5cGUgSVRvb2xEYXRhLCB0eXBlIElUb29sSW1wbCwgdHlwZSBJVG9vbEludm9jYXRpb24sIHR5cGUgSVRvb2xJbnZvY2F0aW9uUHJlcGFyYXRpb25Db250ZXh0LCB0eXBlIElUb29sUmVzdWx0LCB0eXBlIFRvb2xQcm9ncmVzcyB9IGZyb20gJy4uLy4uLy4uL2NoYXQvY29tbW9uL3Rvb2xzL2xhbmd1YWdlTW9kZWxUb29sc1NlcnZpY2UuanMnO1xuaW1wb3J0IHsgY3JlYXRlQnJvd3NlclBhZ2VMaW5rLCBERUZBVUxUX0VMRU1FTlRfTEFCRUwsIGVycm9yUmVzdWx0LCBnZXRTZXNzaW9uSWQsIHBsYXl3cmlnaHRJbnZva2UgfSBmcm9tICcuL2Jyb3dzZXJUb29sSGVscGVycy5qcyc7XG5pbXBvcnQgeyBCcm93c2VyQ2hhdFRvb2xSZWZlcmVuY2VOYW1lIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vYnJvd3NlclZpZXcvY29tbW9uL2Jyb3dzZXJDaGF0VG9vbFJlZmVyZW5jZU5hbWVzLmpzJztcbmltcG9ydCB7IE9wZW5QYWdlVG9vbElkIH0gZnJvbSAnLi9vcGVuQnJvd3NlclRvb2wuanMnO1xuXG5leHBvcnQgY29uc3QgRHJhZ0VsZW1lbnRUb29sRGF0YTogSVRvb2xEYXRhID0ge1xuXHRpZDogJ2RyYWdfZWxlbWVudCcsXG5cdHRvb2xSZWZlcmVuY2VOYW1lOiBCcm93c2VyQ2hhdFRvb2xSZWZlcmVuY2VOYW1lLkRyYWdFbGVtZW50LFxuXHRkaXNwbGF5TmFtZTogbG9jYWxpemUoJ2RyYWdFbGVtZW50VG9vbC5kaXNwbGF5TmFtZScsICdEcmFnIEVsZW1lbnQnKSxcblx0dXNlckRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgnZHJhZ0VsZW1lbnRUb29sLnVzZXJEZXNjcmlwdGlvbicsICdEcmFnIGFuIGVsZW1lbnQgb3ZlciBhbm90aGVyIGVsZW1lbnQnKSxcblx0bW9kZWxEZXNjcmlwdGlvbjogJ0RyYWcgYW4gZWxlbWVudCBvdmVyIGFub3RoZXIgZWxlbWVudCBpbiBhIGJyb3dzZXIgcGFnZS4nLFxuXHRpY29uOiBDb2RpY29uLm1vdmUsXG5cdHNvdXJjZTogVG9vbERhdGFTb3VyY2UuSW50ZXJuYWwsXG5cdGlucHV0U2NoZW1hOiB7XG5cdFx0dHlwZTogJ29iamVjdCcsXG5cdFx0cHJvcGVydGllczoge1xuXHRcdFx0cGFnZUlkOiB7XG5cdFx0XHRcdHR5cGU6ICdzdHJpbmcnLFxuXHRcdFx0XHRkZXNjcmlwdGlvbjogYFRoZSBicm93c2VyIHBhZ2UgSUQsIGFjcXVpcmVkIGZyb20gY29udGV4dCBvciB0aGUgb3BlbiB0b29sLmBcblx0XHRcdH0sXG5cdFx0XHRmcm9tUmVmOiB7XG5cdFx0XHRcdHR5cGU6ICdzdHJpbmcnLFxuXHRcdFx0XHRkZXNjcmlwdGlvbjogJ0VsZW1lbnQgcmVmZXJlbmNlIG9mIHRoZSBlbGVtZW50IHRvIGRyYWcuJ1xuXHRcdFx0fSxcblx0XHRcdGZyb21TZWxlY3Rvcjoge1xuXHRcdFx0XHR0eXBlOiAnc3RyaW5nJyxcblx0XHRcdFx0ZGVzY3JpcHRpb246ICdQbGF5d3JpZ2h0IHNlbGVjdG9yIG9mIHRoZSBlbGVtZW50IHRvIGRyYWcgd2hlbiBcImZyb21SZWZcIiBpcyBub3QgYXZhaWxhYmxlLidcblx0XHRcdH0sXG5cdFx0XHRmcm9tRWxlbWVudDoge1xuXHRcdFx0XHR0eXBlOiAnc3RyaW5nJyxcblx0XHRcdFx0ZGVzY3JpcHRpb246ICdIdW1hbi1yZWFkYWJsZSBkZXNjcmlwdGlvbiBvZiB0aGUgZWxlbWVudCB0byBkcmFnIChlLmcuLCBcImZpbGUgaXRlbVwiLCBcImRyYWdnYWJsZSBjYXJkXCIpLidcblx0XHRcdH0sXG5cdFx0XHR0b1JlZjoge1xuXHRcdFx0XHR0eXBlOiAnc3RyaW5nJyxcblx0XHRcdFx0ZGVzY3JpcHRpb246ICdFbGVtZW50IHJlZmVyZW5jZSBvZiB0aGUgZWxlbWVudCB0byBkcm9wIG9udG8uJ1xuXHRcdFx0fSxcblx0XHRcdHRvU2VsZWN0b3I6IHtcblx0XHRcdFx0dHlwZTogJ3N0cmluZycsXG5cdFx0XHRcdGRlc2NyaXB0aW9uOiAnUGxheXdyaWdodCBzZWxlY3RvciBvZiB0aGUgZWxlbWVudCB0byBkcm9wIG9udG8gd2hlbiBcInRvUmVmXCIgaXMgbm90IGF2YWlsYWJsZS4nXG5cdFx0XHR9LFxuXHRcdFx0dG9FbGVtZW50OiB7XG5cdFx0XHRcdHR5cGU6ICdzdHJpbmcnLFxuXHRcdFx0XHRkZXNjcmlwdGlvbjogJ0h1bWFuLXJlYWRhYmxlIGRlc2NyaXB0aW9uIG9mIHRoZSBlbGVtZW50IHRvIGRyb3Agb250byAoZS5nLiwgXCJkcm9wIHpvbmVcIiwgXCJ0YXJnZXQgZm9sZGVyXCIpLidcblx0XHRcdH0sXG5cdFx0fSxcblx0XHRyZXF1aXJlZDogWydwYWdlSWQnLCAnZnJvbUVsZW1lbnQnLCAndG9FbGVtZW50J10sXG5cdFx0JGNvbW1lbnQ6ICdPbmUgb2YgXCJmcm9tUmVmXCIgb3IgXCJmcm9tU2VsZWN0b3JcIiBpcyByZXF1aXJlZCwgYW5kIG9uZSBvZiBcInRvUmVmXCIgb3IgXCJ0b1NlbGVjdG9yXCIgaXMgcmVxdWlyZWQuJyxcblx0fSxcbn07XG5cbmludGVyZmFjZSBJRHJhZ0VsZW1lbnRUb29sUGFyYW1zIHtcblx0cGFnZUlkOiBzdHJpbmc7XG5cdGZyb21SZWY/OiBzdHJpbmc7XG5cdGZyb21TZWxlY3Rvcj86IHN0cmluZztcblx0ZnJvbUVsZW1lbnQ/OiBzdHJpbmc7XG5cdHRvUmVmPzogc3RyaW5nO1xuXHR0b1NlbGVjdG9yPzogc3RyaW5nO1xuXHR0b0VsZW1lbnQ/OiBzdHJpbmc7XG59XG5cbmV4cG9ydCBjbGFzcyBEcmFnRWxlbWVudFRvb2wgaW1wbGVtZW50cyBJVG9vbEltcGwge1xuXHRjb25zdHJ1Y3Rvcihcblx0XHRASVBsYXl3cmlnaHRTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgcGxheXdyaWdodFNlcnZpY2U6IElQbGF5d3JpZ2h0U2VydmljZSxcblx0KSB7IH1cblxuXHRhc3luYyBwcmVwYXJlVG9vbEludm9jYXRpb24oX2NvbnRleHQ6IElUb29sSW52b2NhdGlvblByZXBhcmF0aW9uQ29udGV4dCwgX3Rva2VuOiBDYW5jZWxsYXRpb25Ub2tlbik6IFByb21pc2U8SVByZXBhcmVkVG9vbEludm9jYXRpb24gfCB1bmRlZmluZWQ+IHtcblx0XHRjb25zdCBwYXJhbXMgPSBfY29udGV4dC5wYXJhbWV0ZXJzIGFzIElEcmFnRWxlbWVudFRvb2xQYXJhbXM7XG5cdFx0Y29uc3QgbGluayA9IGNyZWF0ZUJyb3dzZXJQYWdlTGluayhwYXJhbXMucGFnZUlkKTtcblx0XHRjb25zdCBmcm9tRWxlbWVudCA9IGVzY2FwZU1hcmtkb3duU3ludGF4VG9rZW5zKHBhcmFtcy5mcm9tRWxlbWVudCA/PyBERUZBVUxUX0VMRU1FTlRfTEFCRUwpO1xuXHRcdGNvbnN0IHRvRWxlbWVudCA9IGVzY2FwZU1hcmtkb3duU3ludGF4VG9rZW5zKHBhcmFtcy50b0VsZW1lbnQgPz8gREVGQVVMVF9FTEVNRU5UX0xBQkVMKTtcblx0XHRyZXR1cm4ge1xuXHRcdFx0aW52b2NhdGlvbk1lc3NhZ2U6IG5ldyBNYXJrZG93blN0cmluZyhsb2NhbGl6ZSgnYnJvd3Nlci5kcmFnLmludm9jYXRpb24nLCBcIkRyYWdnaW5nIHswfSB0byB7MX0gaW4gezJ9XCIsIGZyb21FbGVtZW50LCB0b0VsZW1lbnQsIGxpbmspKSxcblx0XHRcdHBhc3RUZW5zZU1lc3NhZ2U6IG5ldyBNYXJrZG93blN0cmluZyhsb2NhbGl6ZSgnYnJvd3Nlci5kcmFnLnBhc3QnLCBcIkRyYWdnZWQgezB9IHRvIHsxfSBpbiB7Mn1cIiwgZnJvbUVsZW1lbnQsIHRvRWxlbWVudCwgbGluaykpLFxuXHRcdH07XG5cdH1cblxuXHRhc3luYyBpbnZva2UoaW52b2NhdGlvbjogSVRvb2xJbnZvY2F0aW9uLCBfY291bnRUb2tlbnM6IENvdW50VG9rZW5zQ2FsbGJhY2ssIF9wcm9ncmVzczogVG9vbFByb2dyZXNzLCBfdG9rZW46IENhbmNlbGxhdGlvblRva2VuKTogUHJvbWlzZTxJVG9vbFJlc3VsdD4ge1xuXHRcdGNvbnN0IHBhcmFtcyA9IGludm9jYXRpb24ucGFyYW1ldGVycyBhcyBJRHJhZ0VsZW1lbnRUb29sUGFyYW1zO1xuXHRcdGNvbnN0IHNlc3Npb25JZCA9IGdldFNlc3Npb25JZChpbnZvY2F0aW9uKTtcblxuXHRcdGlmICghcGFyYW1zLnBhZ2VJZCkge1xuXHRcdFx0cmV0dXJuIGVycm9yUmVzdWx0KGBObyBwYWdlIElEIHByb3ZpZGVkLiBVc2UgJyR7T3BlblBhZ2VUb29sSWR9JyBmaXJzdC5gKTtcblx0XHR9XG5cblx0XHRsZXQgZnJvbVNlbGVjdG9yID0gcGFyYW1zLmZyb21TZWxlY3Rvcjtcblx0XHRpZiAocGFyYW1zLmZyb21SZWYpIHtcblx0XHRcdGZyb21TZWxlY3RvciA9IGBhcmlhLXJlZj0ke3BhcmFtcy5mcm9tUmVmfWA7XG5cdFx0fVxuXHRcdGlmICghZnJvbVNlbGVjdG9yKSB7XG5cdFx0XHRyZXR1cm4gZXJyb3JSZXN1bHQoJ0VpdGhlciBhIFwiZnJvbVJlZlwiIG9yIFwiZnJvbVNlbGVjdG9yXCIgcGFyYW1ldGVyIGlzIHJlcXVpcmVkIGZvciB0aGUgc291cmNlIGVsZW1lbnQuJyk7XG5cdFx0fVxuXG5cdFx0bGV0IHRvU2VsZWN0b3IgPSBwYXJhbXMudG9TZWxlY3Rvcjtcblx0XHRpZiAocGFyYW1zLnRvUmVmKSB7XG5cdFx0XHR0b1NlbGVjdG9yID0gYGFyaWEtcmVmPSR7cGFyYW1zLnRvUmVmfWA7XG5cdFx0fVxuXHRcdGlmICghdG9TZWxlY3Rvcikge1xuXHRcdFx0cmV0dXJuIGVycm9yUmVzdWx0KCdFaXRoZXIgYSBcInRvUmVmXCIgb3IgXCJ0b1NlbGVjdG9yXCIgcGFyYW1ldGVyIGlzIHJlcXVpcmVkIGZvciB0aGUgdGFyZ2V0IGVsZW1lbnQuJyk7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHBsYXl3cmlnaHRJbnZva2UodGhpcy5wbGF5d3JpZ2h0U2VydmljZSwgc2Vzc2lvbklkLCBwYXJhbXMucGFnZUlkLCAocGFnZSwgZnJvbSwgdG8pID0+IHBhZ2UuZHJhZ0FuZERyb3AoZnJvbSwgdG8pLCBmcm9tU2VsZWN0b3IsIHRvU2VsZWN0b3IpO1xuXHR9XG59XG4iXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7OztBQU1BLFNBQVMsZUFBZTtBQUN4QixTQUFTLDRCQUE0QixzQkFBc0I7QUFDM0QsU0FBUyxnQkFBZ0I7QUFDekIsU0FBUywwQkFBMEI7QUFDbkMsU0FBUyxzQkFBaU47QUFDMU4sU0FBUyx1QkFBdUIsdUJBQXVCLGFBQWEsY0FBYyx3QkFBd0I7QUFDMUcsU0FBUyxvQ0FBb0M7QUFDN0MsU0FBUyxzQkFBc0I7QUFFeEIsTUFBTSxzQkFBaUM7QUFBQSxFQUM3QyxJQUFJO0FBQUEsRUFDSixtQkFBbUIsNkJBQTZCO0FBQUEsRUFDaEQsYUFBYSxTQUFTLCtCQUErQixjQUFjO0FBQUEsRUFDbkUsaUJBQWlCLFNBQVMsbUNBQW1DLHNDQUFzQztBQUFBLEVBQ25HLGtCQUFrQjtBQUFBLEVBQ2xCLE1BQU0sUUFBUTtBQUFBLEVBQ2QsUUFBUSxlQUFlO0FBQUEsRUFDdkIsYUFBYTtBQUFBLElBQ1osTUFBTTtBQUFBLElBQ04sWUFBWTtBQUFBLE1BQ1gsUUFBUTtBQUFBLFFBQ1AsTUFBTTtBQUFBLFFBQ04sYUFBYTtBQUFBLE1BQ2Q7QUFBQSxNQUNBLFNBQVM7QUFBQSxRQUNSLE1BQU07QUFBQSxRQUNOLGFBQWE7QUFBQSxNQUNkO0FBQUEsTUFDQSxjQUFjO0FBQUEsUUFDYixNQUFNO0FBQUEsUUFDTixhQUFhO0FBQUEsTUFDZDtBQUFBLE1BQ0EsYUFBYTtBQUFBLFFBQ1osTUFBTTtBQUFBLFFBQ04sYUFBYTtBQUFBLE1BQ2Q7QUFBQSxNQUNBLE9BQU87QUFBQSxRQUNOLE1BQU07QUFBQSxRQUNOLGFBQWE7QUFBQSxNQUNkO0FBQUEsTUFDQSxZQUFZO0FBQUEsUUFDWCxNQUFNO0FBQUEsUUFDTixhQUFhO0FBQUEsTUFDZDtBQUFBLE1BQ0EsV0FBVztBQUFBLFFBQ1YsTUFBTTtBQUFBLFFBQ04sYUFBYTtBQUFBLE1BQ2Q7QUFBQSxJQUNEO0FBQUEsSUFDQSxVQUFVLENBQUMsVUFBVSxlQUFlLFdBQVc7QUFBQSxJQUMvQyxVQUFVO0FBQUEsRUFDWDtBQUNEO0FBWU8sSUFBTSxrQkFBTixNQUEyQztBQUFBLEVBQ2pELFlBQ3NDLG1CQUNwQztBQURvQztBQUFBLEVBQ2xDO0FBQUEsRUFFSixNQUFNLHNCQUFzQixVQUE2QyxRQUF5RTtBQUNqSixVQUFNLFNBQVMsU0FBUztBQUN4QixVQUFNLE9BQU8sc0JBQXNCLE9BQU8sTUFBTTtBQUNoRCxVQUFNLGNBQWMsMkJBQTJCLE9BQU8sZUFBZSxxQkFBcUI7QUFDMUYsVUFBTSxZQUFZLDJCQUEyQixPQUFPLGFBQWEscUJBQXFCO0FBQ3RGLFdBQU87QUFBQSxNQUNOLG1CQUFtQixJQUFJLGVBQWUsU0FBUywyQkFBMkIsOEJBQThCLGFBQWEsV0FBVyxJQUFJLENBQUM7QUFBQSxNQUNySSxrQkFBa0IsSUFBSSxlQUFlLFNBQVMscUJBQXFCLDZCQUE2QixhQUFhLFdBQVcsSUFBSSxDQUFDO0FBQUEsSUFDOUg7QUFBQSxFQUNEO0FBQUEsRUFFQSxNQUFNLE9BQU8sWUFBNkIsY0FBbUMsV0FBeUIsUUFBaUQ7QUFDdEosVUFBTSxTQUFTLFdBQVc7QUFDMUIsVUFBTSxZQUFZLGFBQWEsVUFBVTtBQUV6QyxRQUFJLENBQUMsT0FBTyxRQUFRO0FBQ25CLGFBQU8sWUFBWSw2QkFBNkIsY0FBYyxVQUFVO0FBQUEsSUFDekU7QUFFQSxRQUFJLGVBQWUsT0FBTztBQUMxQixRQUFJLE9BQU8sU0FBUztBQUNuQixxQkFBZSxZQUFZLE9BQU8sT0FBTztBQUFBLElBQzFDO0FBQ0EsUUFBSSxDQUFDLGNBQWM7QUFDbEIsYUFBTyxZQUFZLG9GQUFvRjtBQUFBLElBQ3hHO0FBRUEsUUFBSSxhQUFhLE9BQU87QUFDeEIsUUFBSSxPQUFPLE9BQU87QUFDakIsbUJBQWEsWUFBWSxPQUFPLEtBQUs7QUFBQSxJQUN0QztBQUNBLFFBQUksQ0FBQyxZQUFZO0FBQ2hCLGFBQU8sWUFBWSxnRkFBZ0Y7QUFBQSxJQUNwRztBQUVBLFdBQU8saUJBQWlCLEtBQUssbUJBQW1CLFdBQVcsT0FBTyxRQUFRLENBQUMsTUFBTSxNQUFNLE9BQU8sS0FBSyxZQUFZLE1BQU0sRUFBRSxHQUFHLGNBQWMsVUFBVTtBQUFBLEVBQ25KO0FBQ0Q7QUExQ2Esa0JBQU47QUFBQSxFQUVKO0FBQUEsR0FGVTsiLAogICJuYW1lcyI6IFtdCn0K
