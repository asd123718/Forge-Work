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
const ClickBrowserToolData = {
  id: "click_element",
  toolReferenceName: BrowserChatToolReferenceName.ClickElement,
  displayName: localize("clickBrowserTool.displayName", "Click Element"),
  userDescription: localize("clickBrowserTool.userDescription", "Click an element in a browser page"),
  modelDescription: "Click on an element in a browser page.",
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
        description: "Element reference to click."
      },
      selector: {
        type: "string",
        description: 'Playwright selector of the element to click when "ref" is not available.'
      },
      element: {
        type: "string",
        description: 'Human-readable description of the element to click (e.g., "submit button", "search icon").'
      },
      dblClick: {
        type: "boolean",
        description: "Set to true for double clicks. Default is false."
      },
      button: {
        type: "string",
        enum: ["left", "right", "middle"],
        description: 'Mouse button to click with. Default is "left".'
      }
    },
    required: ["pageId", "element"],
    $comment: 'One of "ref" or "selector" is required.'
  }
};
let ClickBrowserTool = class {
  constructor(playwrightService) {
    this.playwrightService = playwrightService;
  }
  async prepareToolInvocation(_context, _token) {
    const params = _context.parameters;
    const link = createBrowserPageLink(params.pageId);
    const element = escapeMarkdownSyntaxTokens(params.element ?? DEFAULT_ELEMENT_LABEL);
    return {
      invocationMessage: params.button === "right" ? new MarkdownString(localize("browser.click.invocation.right", "Right-clicking {0} in {1}", element, link)) : params.button === "middle" ? new MarkdownString(localize("browser.click.invocation.middle", "Middle-clicking {0} in {1}", element, link)) : params.dblClick ? new MarkdownString(localize("browser.dblClick.invocation", "Double-clicking {0} in {1}", element, link)) : new MarkdownString(localize("browser.click.invocation", "Clicking {0} in {1}", element, link)),
      pastTenseMessage: params.button === "right" ? new MarkdownString(localize("browser.click.past.right", "Right-clicked {0} in {1}", element, link)) : params.button === "middle" ? new MarkdownString(localize("browser.click.past.middle", "Middle-clicked {0} in {1}", element, link)) : params.dblClick ? new MarkdownString(localize("browser.dblClick.past", "Double-clicked {0} in {1}", element, link)) : new MarkdownString(localize("browser.click.past", "Clicked {0} in {1}", element, link))
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
    const button = params.button ?? "left";
    if (params.dblClick) {
      return playwrightInvoke(this.playwrightService, sessionId, params.pageId, (page, sel, btn) => page.locator(sel).dblclick({ button: btn }), selector, button);
    }
    return playwrightInvoke(this.playwrightService, sessionId, params.pageId, (page, sel, btn) => page.locator(sel).click({ button: btn }), selector, button);
  }
};
ClickBrowserTool = __decorateClass([
  __decorateParam(0, IPlaywrightService)
], ClickBrowserTool);
export {
  ClickBrowserTool,
  ClickBrowserToolData
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXGJyb3dzZXJWaWV3XFxlbGVjdHJvbi1icm93c2VyXFx0b29sc1xcY2xpY2tCcm93c2VyVG9vbC50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB0eXBlIHsgQ2FuY2VsbGF0aW9uVG9rZW4gfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9jYW5jZWxsYXRpb24uanMnO1xuaW1wb3J0IHsgQ29kaWNvbiB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2NvZGljb25zLmpzJztcbmltcG9ydCB7IGVzY2FwZU1hcmtkb3duU3ludGF4VG9rZW5zLCBNYXJrZG93blN0cmluZyB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2h0bWxDb250ZW50LmpzJztcbmltcG9ydCB7IGxvY2FsaXplIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vbmxzLmpzJztcbmltcG9ydCB7IElQbGF5d3JpZ2h0U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2Jyb3dzZXJWaWV3L2NvbW1vbi9wbGF5d3JpZ2h0U2VydmljZS5qcyc7XG5pbXBvcnQgeyBUb29sRGF0YVNvdXJjZSwgdHlwZSBDb3VudFRva2Vuc0NhbGxiYWNrLCB0eXBlIElQcmVwYXJlZFRvb2xJbnZvY2F0aW9uLCB0eXBlIElUb29sRGF0YSwgdHlwZSBJVG9vbEltcGwsIHR5cGUgSVRvb2xJbnZvY2F0aW9uLCB0eXBlIElUb29sSW52b2NhdGlvblByZXBhcmF0aW9uQ29udGV4dCwgdHlwZSBJVG9vbFJlc3VsdCwgdHlwZSBUb29sUHJvZ3Jlc3MgfSBmcm9tICcuLi8uLi8uLi9jaGF0L2NvbW1vbi90b29scy9sYW5ndWFnZU1vZGVsVG9vbHNTZXJ2aWNlLmpzJztcbmltcG9ydCB7IGNyZWF0ZUJyb3dzZXJQYWdlTGluaywgREVGQVVMVF9FTEVNRU5UX0xBQkVMLCBlcnJvclJlc3VsdCwgZ2V0U2Vzc2lvbklkLCBwbGF5d3JpZ2h0SW52b2tlIH0gZnJvbSAnLi9icm93c2VyVG9vbEhlbHBlcnMuanMnO1xuaW1wb3J0IHsgQnJvd3NlckNoYXRUb29sUmVmZXJlbmNlTmFtZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2Jyb3dzZXJWaWV3L2NvbW1vbi9icm93c2VyQ2hhdFRvb2xSZWZlcmVuY2VOYW1lcy5qcyc7XG5pbXBvcnQgeyBPcGVuUGFnZVRvb2xJZCB9IGZyb20gJy4vb3BlbkJyb3dzZXJUb29sLmpzJztcblxuZXhwb3J0IGNvbnN0IENsaWNrQnJvd3NlclRvb2xEYXRhOiBJVG9vbERhdGEgPSB7XG5cdGlkOiAnY2xpY2tfZWxlbWVudCcsXG5cdHRvb2xSZWZlcmVuY2VOYW1lOiBCcm93c2VyQ2hhdFRvb2xSZWZlcmVuY2VOYW1lLkNsaWNrRWxlbWVudCxcblx0ZGlzcGxheU5hbWU6IGxvY2FsaXplKCdjbGlja0Jyb3dzZXJUb29sLmRpc3BsYXlOYW1lJywgJ0NsaWNrIEVsZW1lbnQnKSxcblx0dXNlckRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgnY2xpY2tCcm93c2VyVG9vbC51c2VyRGVzY3JpcHRpb24nLCAnQ2xpY2sgYW4gZWxlbWVudCBpbiBhIGJyb3dzZXIgcGFnZScpLFxuXHRtb2RlbERlc2NyaXB0aW9uOiAnQ2xpY2sgb24gYW4gZWxlbWVudCBpbiBhIGJyb3dzZXIgcGFnZS4nLFxuXHRpY29uOiBDb2RpY29uLmN1cnNvcixcblx0c291cmNlOiBUb29sRGF0YVNvdXJjZS5JbnRlcm5hbCxcblx0aW5wdXRTY2hlbWE6IHtcblx0XHR0eXBlOiAnb2JqZWN0Jyxcblx0XHRwcm9wZXJ0aWVzOiB7XG5cdFx0XHRwYWdlSWQ6IHtcblx0XHRcdFx0dHlwZTogJ3N0cmluZycsXG5cdFx0XHRcdGRlc2NyaXB0aW9uOiBgVGhlIGJyb3dzZXIgcGFnZSBJRCwgYWNxdWlyZWQgZnJvbSBjb250ZXh0IG9yIHRoZSBvcGVuIHRvb2wuYFxuXHRcdFx0fSxcblx0XHRcdHJlZjoge1xuXHRcdFx0XHR0eXBlOiAnc3RyaW5nJyxcblx0XHRcdFx0ZGVzY3JpcHRpb246ICdFbGVtZW50IHJlZmVyZW5jZSB0byBjbGljay4nXG5cdFx0XHR9LFxuXHRcdFx0c2VsZWN0b3I6IHtcblx0XHRcdFx0dHlwZTogJ3N0cmluZycsXG5cdFx0XHRcdGRlc2NyaXB0aW9uOiAnUGxheXdyaWdodCBzZWxlY3RvciBvZiB0aGUgZWxlbWVudCB0byBjbGljayB3aGVuIFwicmVmXCIgaXMgbm90IGF2YWlsYWJsZS4nXG5cdFx0XHR9LFxuXHRcdFx0ZWxlbWVudDoge1xuXHRcdFx0XHR0eXBlOiAnc3RyaW5nJyxcblx0XHRcdFx0ZGVzY3JpcHRpb246ICdIdW1hbi1yZWFkYWJsZSBkZXNjcmlwdGlvbiBvZiB0aGUgZWxlbWVudCB0byBjbGljayAoZS5nLiwgXCJzdWJtaXQgYnV0dG9uXCIsIFwic2VhcmNoIGljb25cIikuJ1xuXHRcdFx0fSxcblx0XHRcdGRibENsaWNrOiB7XG5cdFx0XHRcdHR5cGU6ICdib29sZWFuJyxcblx0XHRcdFx0ZGVzY3JpcHRpb246ICdTZXQgdG8gdHJ1ZSBmb3IgZG91YmxlIGNsaWNrcy4gRGVmYXVsdCBpcyBmYWxzZS4nXG5cdFx0XHR9LFxuXHRcdFx0YnV0dG9uOiB7XG5cdFx0XHRcdHR5cGU6ICdzdHJpbmcnLFxuXHRcdFx0XHRlbnVtOiBbJ2xlZnQnLCAncmlnaHQnLCAnbWlkZGxlJ10sXG5cdFx0XHRcdGRlc2NyaXB0aW9uOiAnTW91c2UgYnV0dG9uIHRvIGNsaWNrIHdpdGguIERlZmF1bHQgaXMgXCJsZWZ0XCIuJ1xuXHRcdFx0fSxcblx0XHR9LFxuXHRcdHJlcXVpcmVkOiBbJ3BhZ2VJZCcsICdlbGVtZW50J10sXG5cdFx0JGNvbW1lbnQ6ICdPbmUgb2YgXCJyZWZcIiBvciBcInNlbGVjdG9yXCIgaXMgcmVxdWlyZWQuJyxcblx0fSxcbn07XG5cbmludGVyZmFjZSBJQ2xpY2tCcm93c2VyVG9vbFBhcmFtcyB7XG5cdHBhZ2VJZDogc3RyaW5nO1xuXHRyZWY/OiBzdHJpbmc7XG5cdHNlbGVjdG9yPzogc3RyaW5nO1xuXHRlbGVtZW50Pzogc3RyaW5nO1xuXHRkYmxDbGljaz86IGJvb2xlYW47XG5cdGJ1dHRvbj86ICdsZWZ0JyB8ICdyaWdodCcgfCAnbWlkZGxlJztcbn1cblxuZXhwb3J0IGNsYXNzIENsaWNrQnJvd3NlclRvb2wgaW1wbGVtZW50cyBJVG9vbEltcGwge1xuXHRjb25zdHJ1Y3Rvcihcblx0XHRASVBsYXl3cmlnaHRTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgcGxheXdyaWdodFNlcnZpY2U6IElQbGF5d3JpZ2h0U2VydmljZSxcblx0KSB7IH1cblxuXHRhc3luYyBwcmVwYXJlVG9vbEludm9jYXRpb24oX2NvbnRleHQ6IElUb29sSW52b2NhdGlvblByZXBhcmF0aW9uQ29udGV4dCwgX3Rva2VuOiBDYW5jZWxsYXRpb25Ub2tlbik6IFByb21pc2U8SVByZXBhcmVkVG9vbEludm9jYXRpb24gfCB1bmRlZmluZWQ+IHtcblx0XHRjb25zdCBwYXJhbXMgPSBfY29udGV4dC5wYXJhbWV0ZXJzIGFzIElDbGlja0Jyb3dzZXJUb29sUGFyYW1zO1xuXHRcdGNvbnN0IGxpbmsgPSBjcmVhdGVCcm93c2VyUGFnZUxpbmsocGFyYW1zLnBhZ2VJZCk7XG5cdFx0Y29uc3QgZWxlbWVudCA9IGVzY2FwZU1hcmtkb3duU3ludGF4VG9rZW5zKHBhcmFtcy5lbGVtZW50ID8/IERFRkFVTFRfRUxFTUVOVF9MQUJFTCk7XG5cdFx0cmV0dXJuIHtcblx0XHRcdGludm9jYXRpb25NZXNzYWdlOiBwYXJhbXMuYnV0dG9uID09PSAncmlnaHQnXG5cdFx0XHRcdD8gbmV3IE1hcmtkb3duU3RyaW5nKGxvY2FsaXplKCdicm93c2VyLmNsaWNrLmludm9jYXRpb24ucmlnaHQnLCBcIlJpZ2h0LWNsaWNraW5nIHswfSBpbiB7MX1cIiwgZWxlbWVudCwgbGluaykpXG5cdFx0XHRcdDogcGFyYW1zLmJ1dHRvbiA9PT0gJ21pZGRsZSdcblx0XHRcdFx0XHQ/IG5ldyBNYXJrZG93blN0cmluZyhsb2NhbGl6ZSgnYnJvd3Nlci5jbGljay5pbnZvY2F0aW9uLm1pZGRsZScsIFwiTWlkZGxlLWNsaWNraW5nIHswfSBpbiB7MX1cIiwgZWxlbWVudCwgbGluaykpXG5cdFx0XHRcdFx0OiBwYXJhbXMuZGJsQ2xpY2tcblx0XHRcdFx0XHRcdD8gbmV3IE1hcmtkb3duU3RyaW5nKGxvY2FsaXplKCdicm93c2VyLmRibENsaWNrLmludm9jYXRpb24nLCBcIkRvdWJsZS1jbGlja2luZyB7MH0gaW4gezF9XCIsIGVsZW1lbnQsIGxpbmspKVxuXHRcdFx0XHRcdFx0OiBuZXcgTWFya2Rvd25TdHJpbmcobG9jYWxpemUoJ2Jyb3dzZXIuY2xpY2suaW52b2NhdGlvbicsIFwiQ2xpY2tpbmcgezB9IGluIHsxfVwiLCBlbGVtZW50LCBsaW5rKSksXG5cdFx0XHRwYXN0VGVuc2VNZXNzYWdlOiBwYXJhbXMuYnV0dG9uID09PSAncmlnaHQnXG5cdFx0XHRcdD8gbmV3IE1hcmtkb3duU3RyaW5nKGxvY2FsaXplKCdicm93c2VyLmNsaWNrLnBhc3QucmlnaHQnLCBcIlJpZ2h0LWNsaWNrZWQgezB9IGluIHsxfVwiLCBlbGVtZW50LCBsaW5rKSlcblx0XHRcdFx0OiBwYXJhbXMuYnV0dG9uID09PSAnbWlkZGxlJ1xuXHRcdFx0XHRcdD8gbmV3IE1hcmtkb3duU3RyaW5nKGxvY2FsaXplKCdicm93c2VyLmNsaWNrLnBhc3QubWlkZGxlJywgXCJNaWRkbGUtY2xpY2tlZCB7MH0gaW4gezF9XCIsIGVsZW1lbnQsIGxpbmspKVxuXHRcdFx0XHRcdDogcGFyYW1zLmRibENsaWNrXG5cdFx0XHRcdFx0XHQ/IG5ldyBNYXJrZG93blN0cmluZyhsb2NhbGl6ZSgnYnJvd3Nlci5kYmxDbGljay5wYXN0JywgXCJEb3VibGUtY2xpY2tlZCB7MH0gaW4gezF9XCIsIGVsZW1lbnQsIGxpbmspKVxuXHRcdFx0XHRcdFx0OiBuZXcgTWFya2Rvd25TdHJpbmcobG9jYWxpemUoJ2Jyb3dzZXIuY2xpY2sucGFzdCcsIFwiQ2xpY2tlZCB7MH0gaW4gezF9XCIsIGVsZW1lbnQsIGxpbmspKSxcblx0XHR9O1xuXHR9XG5cblx0YXN5bmMgaW52b2tlKGludm9jYXRpb246IElUb29sSW52b2NhdGlvbiwgX2NvdW50VG9rZW5zOiBDb3VudFRva2Vuc0NhbGxiYWNrLCBfcHJvZ3Jlc3M6IFRvb2xQcm9ncmVzcywgX3Rva2VuOiBDYW5jZWxsYXRpb25Ub2tlbik6IFByb21pc2U8SVRvb2xSZXN1bHQ+IHtcblx0XHRjb25zdCBwYXJhbXMgPSBpbnZvY2F0aW9uLnBhcmFtZXRlcnMgYXMgSUNsaWNrQnJvd3NlclRvb2xQYXJhbXM7XG5cdFx0Y29uc3Qgc2Vzc2lvbklkID0gZ2V0U2Vzc2lvbklkKGludm9jYXRpb24pO1xuXG5cdFx0aWYgKCFwYXJhbXMucGFnZUlkKSB7XG5cdFx0XHRyZXR1cm4gZXJyb3JSZXN1bHQoYE5vIHBhZ2UgSUQgcHJvdmlkZWQuIFVzZSAnJHtPcGVuUGFnZVRvb2xJZH0nIGZpcnN0LmApO1xuXHRcdH1cblxuXHRcdGxldCBzZWxlY3RvciA9IHBhcmFtcy5zZWxlY3Rvcjtcblx0XHRpZiAocGFyYW1zLnJlZikge1xuXHRcdFx0c2VsZWN0b3IgPSBgYXJpYS1yZWY9JHtwYXJhbXMucmVmfWA7XG5cdFx0fVxuXG5cdFx0aWYgKCFzZWxlY3Rvcikge1xuXHRcdFx0cmV0dXJuIGVycm9yUmVzdWx0KCdFaXRoZXIgYSBcInJlZlwiIG9yIFwic2VsZWN0b3JcIiBwYXJhbWV0ZXIgaXMgcmVxdWlyZWQuJyk7XG5cdFx0fVxuXG5cdFx0Y29uc3QgYnV0dG9uID0gcGFyYW1zLmJ1dHRvbiA/PyAnbGVmdCc7XG5cblx0XHRpZiAocGFyYW1zLmRibENsaWNrKSB7XG5cdFx0XHRyZXR1cm4gcGxheXdyaWdodEludm9rZSh0aGlzLnBsYXl3cmlnaHRTZXJ2aWNlLCBzZXNzaW9uSWQsIHBhcmFtcy5wYWdlSWQsIChwYWdlLCBzZWwsIGJ0bikgPT4gcGFnZS5sb2NhdG9yKHNlbCkuZGJsY2xpY2soeyBidXR0b246IGJ0biB9KSwgc2VsZWN0b3IsIGJ1dHRvbik7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHBsYXl3cmlnaHRJbnZva2UodGhpcy5wbGF5d3JpZ2h0U2VydmljZSwgc2Vzc2lvbklkLCBwYXJhbXMucGFnZUlkLCAocGFnZSwgc2VsLCBidG4pID0+IHBhZ2UubG9jYXRvcihzZWwpLmNsaWNrKHsgYnV0dG9uOiBidG4gfSksIHNlbGVjdG9yLCBidXR0b24pO1xuXHR9XG59XG4iXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7OztBQU1BLFNBQVMsZUFBZTtBQUN4QixTQUFTLDRCQUE0QixzQkFBc0I7QUFDM0QsU0FBUyxnQkFBZ0I7QUFDekIsU0FBUywwQkFBMEI7QUFDbkMsU0FBUyxzQkFBaU47QUFDMU4sU0FBUyx1QkFBdUIsdUJBQXVCLGFBQWEsY0FBYyx3QkFBd0I7QUFDMUcsU0FBUyxvQ0FBb0M7QUFDN0MsU0FBUyxzQkFBc0I7QUFFeEIsTUFBTSx1QkFBa0M7QUFBQSxFQUM5QyxJQUFJO0FBQUEsRUFDSixtQkFBbUIsNkJBQTZCO0FBQUEsRUFDaEQsYUFBYSxTQUFTLGdDQUFnQyxlQUFlO0FBQUEsRUFDckUsaUJBQWlCLFNBQVMsb0NBQW9D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
