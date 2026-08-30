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
const HoverElementToolData = {
  id: "hover_element",
  toolReferenceName: BrowserChatToolReferenceName.HoverElement,
  displayName: localize("hoverElementTool.displayName", "Hover Element"),
  userDescription: localize("hoverElementTool.userDescription", "Hover over an element in a browser page"),
  modelDescription: "Hover over an element in a browser page. Provide either a Playwright selector or an element reference.",
  icon: Codicon.cursor,
  source: ToolDataSource.Internal,
  inputSchema: {
    type: "object",
    properties: {
      pageId: {
        type: "string",
        description: `The browser page ID, acquired from context or the open tool.`
      },
      ref: {
        type: "string",
        description: "Element reference to hover over."
      },
      selector: {
        type: "string",
        description: 'Playwright selector of the element to hover over when "ref" is not available.'
      },
      element: {
        type: "string",
        description: 'Human-readable description of the element to hover over (e.g., "navigation menu", "tooltip trigger").'
      }
    },
    required: ["pageId", "element"],
    $comment: 'One of "ref" or "selector" is required.'
  }
};
let HoverElementTool = class {
  constructor(playwrightService) {
    this.playwrightService = playwrightService;
  }
  async prepareToolInvocation(_context, _token) {
    const params = _context.parameters;
    const link = createBrowserPageLink(params.pageId);
    const element = escapeMarkdownSyntaxTokens(params.element ?? DEFAULT_ELEMENT_LABEL);
    return {
      invocationMessage: new MarkdownString(localize("browser.hover.invocation", "Hovering over {0} in {1}", element, link)),
      pastTenseMessage: new MarkdownString(localize("browser.hover.past", "Hovered over {0} in {1}", element, link))
    };
  }
  async invoke(invocation, _countTokens, _progress, _token) {
    const params = invocation.parameters;
    const sessionId = getSessionId(invocation);
    if (!params.pageId) {
      return errorResult(`No page ID provided. Use '${OpenPageToolId}' first.`);
    }
    let selector = params.selector;
    if (params.ref) {
      selector = `aria-ref=${params.ref}`;
    }
    if (!selector) {
      return errorResult('Either a "ref" or "selector" parameter is required.');
    }
    return playwrightInvoke(this.playwrightService, sessionId, params.pageId, (page, sel) => page.locator(sel).hover(), selector);
  }
};
HoverElementTool = __decorateClass([
  __decorateParam(0, IPlaywrightService)
], HoverElementTool);
export {
  HoverElementTool,
  HoverElementToolData
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXGJyb3dzZXJWaWV3XFxlbGVjdHJvbi1icm93c2VyXFx0b29sc1xcaG92ZXJFbGVtZW50VG9vbC50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB0eXBlIHsgQ2FuY2VsbGF0aW9uVG9rZW4gfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9jYW5jZWxsYXRpb24uanMnO1xuaW1wb3J0IHsgQ29kaWNvbiB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2NvZGljb25zLmpzJztcbmltcG9ydCB7IGVzY2FwZU1hcmtkb3duU3ludGF4VG9rZW5zLCBNYXJrZG93blN0cmluZyB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2h0bWxDb250ZW50LmpzJztcbmltcG9ydCB7IGxvY2FsaXplIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vbmxzLmpzJztcbmltcG9ydCB7IElQbGF5d3JpZ2h0U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2Jyb3dzZXJWaWV3L2NvbW1vbi9wbGF5d3JpZ2h0U2VydmljZS5qcyc7XG5pbXBvcnQgeyBUb29sRGF0YVNvdXJjZSwgdHlwZSBDb3VudFRva2Vuc0NhbGxiYWNrLCB0eXBlIElQcmVwYXJlZFRvb2xJbnZvY2F0aW9uLCB0eXBlIElUb29sRGF0YSwgdHlwZSBJVG9vbEltcGwsIHR5cGUgSVRvb2xJbnZvY2F0aW9uLCB0eXBlIElUb29sSW52b2NhdGlvblByZXBhcmF0aW9uQ29udGV4dCwgdHlwZSBJVG9vbFJlc3VsdCwgdHlwZSBUb29sUHJvZ3Jlc3MgfSBmcm9tICcuLi8uLi8uLi9jaGF0L2NvbW1vbi90b29scy9sYW5ndWFnZU1vZGVsVG9vbHNTZXJ2aWNlLmpzJztcbmltcG9ydCB7IGNyZWF0ZUJyb3dzZXJQYWdlTGluaywgREVGQVVMVF9FTEVNRU5UX0xBQkVMLCBlcnJvclJlc3VsdCwgZ2V0U2Vzc2lvbklkLCBwbGF5d3JpZ2h0SW52b2tlIH0gZnJvbSAnLi9icm93c2VyVG9vbEhlbHBlcnMuanMnO1xuaW1wb3J0IHsgQnJvd3NlckNoYXRUb29sUmVmZXJlbmNlTmFtZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2Jyb3dzZXJWaWV3L2NvbW1vbi9icm93c2VyQ2hhdFRvb2xSZWZlcmVuY2VOYW1lcy5qcyc7XG5pbXBvcnQgeyBPcGVuUGFnZVRvb2xJZCB9IGZyb20gJy4vb3BlbkJyb3dzZXJUb29sLmpzJztcblxuZXhwb3J0IGNvbnN0IEhvdmVyRWxlbWVudFRvb2xEYXRhOiBJVG9vbERhdGEgPSB7XG5cdGlkOiAnaG92ZXJfZWxlbWVudCcsXG5cdHRvb2xSZWZlcmVuY2VOYW1lOiBCcm93c2VyQ2hhdFRvb2xSZWZlcmVuY2VOYW1lLkhvdmVyRWxlbWVudCxcblx0ZGlzcGxheU5hbWU6IGxvY2FsaXplKCdob3ZlckVsZW1lbnRUb29sLmRpc3BsYXlOYW1lJywgJ0hvdmVyIEVsZW1lbnQnKSxcblx0dXNlckRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgnaG92ZXJFbGVtZW50VG9vbC51c2VyRGVzY3JpcHRpb24nLCAnSG92ZXIgb3ZlciBhbiBlbGVtZW50IGluIGEgYnJvd3NlciBwYWdlJyksXG5cdG1vZGVsRGVzY3JpcHRpb246ICdIb3ZlciBvdmVyIGFuIGVsZW1lbnQgaW4gYSBicm93c2VyIHBhZ2UuIFByb3ZpZGUgZWl0aGVyIGEgUGxheXdyaWdodCBzZWxlY3RvciBvciBhbiBlbGVtZW50IHJlZmVyZW5jZS4nLFxuXHRpY29uOiBDb2RpY29uLmN1cnNvcixcblx0c291cmNlOiBUb29sRGF0YVNvdXJjZS5JbnRlcm5hbCxcblx0aW5wdXRTY2hlbWE6IHtcblx0XHR0eXBlOiAnb2JqZWN0Jyxcblx0XHRwcm9wZXJ0aWVzOiB7XG5cdFx0XHRwYWdlSWQ6IHtcblx0XHRcdFx0dHlwZTogJ3N0cmluZycsXG5cdFx0XHRcdGRlc2NyaXB0aW9uOiBgVGhlIGJyb3dzZXIgcGFnZSBJRCwgYWNxdWlyZWQgZnJvbSBjb250ZXh0IG9yIHRoZSBvcGVuIHRvb2wuYFxuXHRcdFx0fSxcblx0XHRcdHJlZjoge1xuXHRcdFx0XHR0eXBlOiAnc3RyaW5nJyxcblx0XHRcdFx0ZGVzY3JpcHRpb246ICdFbGVtZW50IHJlZmVyZW5jZSB0byBob3ZlciBvdmVyLidcblx0XHRcdH0sXG5cdFx0XHRzZWxlY3Rvcjoge1xuXHRcdFx0XHR0eXBlOiAnc3RyaW5nJyxcblx0XHRcdFx0ZGVzY3JpcHRpb246ICdQbGF5d3JpZ2h0IHNlbGVjdG9yIG9mIHRoZSBlbGVtZW50IHRvIGhvdmVyIG92ZXIgd2hlbiBcInJlZlwiIGlzIG5vdCBhdmFpbGFibGUuJ1xuXHRcdFx0fSxcblx0XHRcdGVsZW1lbnQ6IHtcblx0XHRcdFx0dHlwZTogJ3N0cmluZycsXG5cdFx0XHRcdGRlc2NyaXB0aW9uOiAnSHVtYW4tcmVhZGFibGUgZGVzY3JpcHRpb24gb2YgdGhlIGVsZW1lbnQgdG8gaG92ZXIgb3ZlciAoZS5nLiwgXCJuYXZpZ2F0aW9uIG1lbnVcIiwgXCJ0b29sdGlwIHRyaWdnZXJcIikuJ1xuXHRcdFx0fSxcblx0XHR9LFxuXHRcdHJlcXVpcmVkOiBbJ3BhZ2VJZCcsICdlbGVtZW50J10sXG5cdFx0JGNvbW1lbnQ6ICdPbmUgb2YgXCJyZWZcIiBvciBcInNlbGVjdG9yXCIgaXMgcmVxdWlyZWQuJyxcblx0fSxcbn07XG5cbmludGVyZmFjZSBJSG92ZXJFbGVtZW50VG9vbFBhcmFtcyB7XG5cdHBhZ2VJZDogc3RyaW5nO1xuXHRyZWY/OiBzdHJpbmc7XG5cdHNlbGVjdG9yPzogc3RyaW5nO1xuXHRlbGVtZW50Pzogc3RyaW5nO1xufVxuXG5leHBvcnQgY2xhc3MgSG92ZXJFbGVtZW50VG9vbCBpbXBsZW1lbnRzIElUb29sSW1wbCB7XG5cdGNvbnN0cnVjdG9yKFxuXHRcdEBJUGxheXdyaWdodFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBwbGF5d3JpZ2h0U2VydmljZTogSVBsYXl3cmlnaHRTZXJ2aWNlLFxuXHQpIHsgfVxuXG5cdGFzeW5jIHByZXBhcmVUb29sSW52b2NhdGlvbihfY29udGV4dDogSVRvb2xJbnZvY2F0aW9uUHJlcGFyYXRpb25Db250ZXh0LCBfdG9rZW46IENhbmNlbGxhdGlvblRva2VuKTogUHJvbWlzZTxJUHJlcGFyZWRUb29sSW52b2NhdGlvbiB8IHVuZGVmaW5lZD4ge1xuXHRcdGNvbnN0IHBhcmFtcyA9IF9jb250ZXh0LnBhcmFtZXRlcnMgYXMgSUhvdmVyRWxlbWVudFRvb2xQYXJhbXM7XG5cdFx0Y29uc3QgbGluayA9IGNyZWF0ZUJyb3dzZXJQYWdlTGluayhwYXJhbXMucGFnZUlkKTtcblx0XHRjb25zdCBlbGVtZW50ID0gZXNjYXBlTWFya2Rvd25TeW50YXhUb2tlbnMocGFyYW1zLmVsZW1lbnQgPz8gREVGQVVMVF9FTEVNRU5UX0xBQkVMKTtcblx0XHRyZXR1cm4ge1xuXHRcdFx0aW52b2NhdGlvbk1lc3NhZ2U6IG5ldyBNYXJrZG93blN0cmluZyhsb2NhbGl6ZSgnYnJvd3Nlci5ob3Zlci5pbnZvY2F0aW9uJywgXCJIb3ZlcmluZyBvdmVyIHswfSBpbiB7MX1cIiwgZWxlbWVudCwgbGluaykpLFxuXHRcdFx0cGFzdFRlbnNlTWVzc2FnZTogbmV3IE1hcmtkb3duU3RyaW5nKGxvY2FsaXplKCdicm93c2VyLmhvdmVyLnBhc3QnLCBcIkhvdmVyZWQgb3ZlciB7MH0gaW4gezF9XCIsIGVsZW1lbnQsIGxpbmspKSxcblx0XHR9O1xuXHR9XG5cblx0YXN5bmMgaW52b2tlKGludm9jYXRpb246IElUb29sSW52b2NhdGlvbiwgX2NvdW50VG9rZW5zOiBDb3VudFRva2Vuc0NhbGxiYWNrLCBfcHJvZ3Jlc3M6IFRvb2xQcm9ncmVzcywgX3Rva2VuOiBDYW5jZWxsYXRpb25Ub2tlbik6IFByb21pc2U8SVRvb2xSZXN1bHQ+IHtcblx0XHRjb25zdCBwYXJhbXMgPSBpbnZvY2F0aW9uLnBhcmFtZXRlcnMgYXMgSUhvdmVyRWxlbWVudFRvb2xQYXJhbXM7XG5cdFx0Y29uc3Qgc2Vzc2lvbklkID0gZ2V0U2Vzc2lvbklkKGludm9jYXRpb24pO1xuXG5cdFx0aWYgKCFwYXJhbXMucGFnZUlkKSB7XG5cdFx0XHRyZXR1cm4gZXJyb3JSZXN1bHQoYE5vIHBhZ2UgSUQgcHJvdmlkZWQuIFVzZSAnJHtPcGVuUGFnZVRvb2xJZH0nIGZpcnN0LmApO1xuXHRcdH1cblxuXHRcdGxldCBzZWxlY3RvciA9IHBhcmFtcy5zZWxlY3Rvcjtcblx0XHRpZiAocGFyYW1zLnJlZikge1xuXHRcdFx0c2VsZWN0b3IgPSBgYXJpYS1yZWY9JHtwYXJhbXMucmVmfWA7XG5cdFx0fVxuXG5cdFx0aWYgKCFzZWxlY3Rvcikge1xuXHRcdFx0cmV0dXJuIGVycm9yUmVzdWx0KCdFaXRoZXIgYSBcInJlZlwiIG9yIFwic2VsZWN0b3JcIiBwYXJhbWV0ZXIgaXMgcmVxdWlyZWQuJyk7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHBsYXl3cmlnaHRJbnZva2UodGhpcy5wbGF5d3JpZ2h0U2VydmljZSwgc2Vzc2lvbklkLCBwYXJhbXMucGFnZUlkLCAocGFnZSwgc2VsKSA9PiBwYWdlLmxvY2F0b3Ioc2VsKS5ob3ZlcigpLCBzZWxlY3Rv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
