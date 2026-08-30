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
import {
  escapeMarkdownSyntaxTokens,
  MarkdownString
} from "../../../../../base/common/htmlContent.js";
import { localize } from "../../../../../nls.js";
import { IPlaywrightService } from "../../../../../platform/browserView/common/playwrightService.js";
import { ToolDataSource } from "../../../chat/common/tools/languageModelToolsService.js";
import { createBrowserPageLink, errorResult, getSessionId, playwrightInvoke } from "./browserToolHelpers.js";
import { BrowserChatToolReferenceName } from "../../../../../platform/browserView/common/browserChatToolReferenceNames.js";
import { OpenPageToolId } from "./openBrowserTool.js";
const TypeBrowserToolData = {
  id: "type_in_page",
  toolReferenceName: BrowserChatToolReferenceName.TypeInPage,
  displayName: localize("typeBrowserTool.displayName", "Type in Page"),
  userDescription: localize("typeBrowserTool.userDescription", "Type text or press keys in a browser page"),
  modelDescription: "Type text or press keys in a browser page.",
  icon: Codicon.symbolText,
  source: ToolDataSource.Internal,
  inputSchema: {
    type: "object",
    properties: {
      pageId: {
        type: "string",
        description: `The browser page ID, acquired from context or the open tool.`
      },
      text: {
        type: "string",
        description: 'The text to type. One of "text" or "key" must be provided.'
      },
      submit: {
        type: "boolean",
        description: 'Whether to press Enter after typing text. Ignored when "key" is provided. Default is false.'
      },
      key: {
        type: "string",
        description: 'A key or key combination to press (e.g., "Enter", "Tab", "Control+c"). One of "text" or "key" must be provided.'
      },
      ref: {
        type: "string",
        description: "Element reference to focus and type into. If omitted, types into the focused element."
      },
      selector: {
        type: "string",
        description: 'Playwright selector of element to focus and type into. Use if "ref" is not available. If omitted, types into the focused element.'
      },
      element: {
        type: "string",
        description: 'Human-readable description of the element to type into (e.g., "search box", "comment field"). Required when "ref" or "selector" is specified.'
      }
    },
    required: ["pageId"]
  }
};
let TypeBrowserTool = class {
  constructor(playwrightService) {
    this.playwrightService = playwrightService;
  }
  async prepareToolInvocation(context, _token) {
    const params = context.parameters;
    const link = createBrowserPageLink(params.pageId);
    const hasTarget = params.ref || params.selector;
    if (params.key) {
      const key = escapeMarkdownSyntaxTokens(params.key);
      if (hasTarget && params.element) {
        const element = escapeMarkdownSyntaxTokens(params.element);
        return {
          invocationMessage: new MarkdownString(localize("browser.pressKey.invocation.element", "Pressing key `{0}` in {1} in {2}", key, element, link)),
          pastTenseMessage: new MarkdownString(localize("browser.pressKey.past.element", "Pressed key `{0}` in {1} in {2}", key, element, link))
        };
      }
      return {
        invocationMessage: new MarkdownString(localize("browser.pressKey.invocation", "Pressing key `{0}` in {1}", key, link)),
        pastTenseMessage: new MarkdownString(localize("browser.pressKey.past", "Pressed key `{0}` in {1}", key, link))
      };
    }
    if (hasTarget && params.element) {
      const element = escapeMarkdownSyntaxTokens(params.element);
      return {
        invocationMessage: params.submit ? new MarkdownString(localize("browser.typeAndSubmit.invocation.element", "Typing text in {0} in {1} and pressing Enter", element, link)) : new MarkdownString(localize("browser.type.invocation.element", "Typing text in {0} in {1}", element, link)),
        pastTenseMessage: params.submit ? new MarkdownString(localize("browser.typeAndSubmit.past.element", "Typed text in {0} in {1} and pressed Enter", element, link)) : new MarkdownString(localize("browser.type.past.element", "Typed text in {0} in {1}", element, link))
      };
    }
    return {
      invocationMessage: params.submit ? new MarkdownString(localize("browser.typeAndSubmit.invocation", "Typing text in {0} and pressing Enter", link)) : new MarkdownString(localize("browser.type.invocation", "Typing text in {0}", link)),
      pastTenseMessage: params.submit ? new MarkdownString(localize("browser.typeAndSubmit.past", "Typed text in {0} and pressed Enter", link)) : new MarkdownString(localize("browser.type.past", "Typed text in {0}", link))
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
    if (!params.text && !params.key) {
      return errorResult('Either a "text" or "key" parameter is required.');
    }
    if (params.key) {
      if (selector) {
        return playwrightInvoke(this.playwrightService, sessionId, params.pageId, (page, sel, key) => page.locator(sel).press(key), selector, params.key);
      }
      return playwrightInvoke(this.playwrightService, sessionId, params.pageId, (page, key) => page.keyboard.press(key), params.key);
    }
    if (selector) {
      return playwrightInvoke(this.playwrightService, sessionId, params.pageId, async (page, sel, text, submit) => {
        const locator = page.locator(sel);
        await locator.fill(text);
        if (submit) {
          await locator.press("Enter");
        }
      }, selector, params.text, params.submit ?? false);
    }
    return playwrightInvoke(this.playwrightService, sessionId, params.pageId, async (page, text, submit) => {
      await page.keyboard.type(text);
      if (submit) {
        await page.keyboard.press("Enter");
      }
    }, params.text, params.submit ?? false);
  }
};
TypeBrowserTool = __decorateClass([
  __decorateParam(0, IPlaywrightService)
], TypeBrowserTool);
export {
  TypeBrowserTool,
  TypeBrowserToolData
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXGJyb3dzZXJWaWV3XFxlbGVjdHJvbi1icm93c2VyXFx0b29sc1xcdHlwZUJyb3dzZXJUb29sLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IHR5cGUgeyBDYW5jZWxsYXRpb25Ub2tlbiB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2NhbmNlbGxhdGlvbi5qcyc7XG5pbXBvcnQgeyBDb2RpY29uIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vY29kaWNvbnMuanMnO1xuaW1wb3J0IHtcblx0ZXNjYXBlTWFya2Rvd25TeW50YXhUb2tlbnMsXG5cdE1hcmtkb3duU3RyaW5nXG59IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2h0bWxDb250ZW50LmpzJztcbmltcG9ydCB7IGxvY2FsaXplIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vbmxzLmpzJztcbmltcG9ydCB7IElQbGF5d3JpZ2h0U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2Jyb3dzZXJWaWV3L2NvbW1vbi9wbGF5d3JpZ2h0U2VydmljZS5qcyc7XG5pbXBvcnQgeyBUb29sRGF0YVNvdXJjZSwgdHlwZSBDb3VudFRva2Vuc0NhbGxiYWNrLCB0eXBlIElQcmVwYXJlZFRvb2xJbnZvY2F0aW9uLCB0eXBlIElUb29sRGF0YSwgdHlwZSBJVG9vbEltcGwsIHR5cGUgSVRvb2xJbnZvY2F0aW9uLCB0eXBlIElUb29sSW52b2NhdGlvblByZXBhcmF0aW9uQ29udGV4dCwgdHlwZSBJVG9vbFJlc3VsdCwgdHlwZSBUb29sUHJvZ3Jlc3MgfSBmcm9tICcuLi8uLi8uLi9jaGF0L2NvbW1vbi90b29scy9sYW5ndWFnZU1vZGVsVG9vbHNTZXJ2aWNlLmpzJztcbmltcG9ydCB7IGNyZWF0ZUJyb3dzZXJQYWdlTGluaywgZXJyb3JSZXN1bHQsIGdldFNlc3Npb25JZCwgcGxheXdyaWdodEludm9rZSB9IGZyb20gJy4vYnJvd3NlclRvb2xIZWxwZXJzLmpzJztcbmltcG9ydCB7IEJyb3dzZXJDaGF0VG9vbFJlZmVyZW5jZU5hbWUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9icm93c2VyVmlldy9jb21tb24vYnJvd3NlckNoYXRUb29sUmVmZXJlbmNlTmFtZXMuanMnO1xuaW1wb3J0IHsgT3BlblBhZ2VUb29sSWQgfSBmcm9tICcuL29wZW5Ccm93c2VyVG9vbC5qcyc7XG5cbmV4cG9ydCBjb25zdCBUeXBlQnJvd3NlclRvb2xEYXRhOiBJVG9vbERhdGEgPSB7XG5cdGlkOiAndHlwZV9pbl9wYWdlJyxcblx0dG9vbFJlZmVyZW5jZU5hbWU6IEJyb3dzZXJDaGF0VG9vbFJlZmVyZW5jZU5hbWUuVHlwZUluUGFnZSxcblx0ZGlzcGxheU5hbWU6IGxvY2FsaXplKCd0eXBlQnJvd3NlclRvb2wuZGlzcGxheU5hbWUnLCAnVHlwZSBpbiBQYWdlJyksXG5cdHVzZXJEZXNjcmlwdGlvbjogbG9jYWxpemUoJ3R5cGVCcm93c2VyVG9vbC51c2VyRGVzY3JpcHRpb24nLCAnVHlwZSB0ZXh0IG9yIHByZXNzIGtleXMgaW4gYSBicm93c2VyIHBhZ2UnKSxcblx0bW9kZWxEZXNjcmlwdGlvbjogJ1R5cGUgdGV4dCBvciBwcmVzcyBrZXlzIGluIGEgYnJvd3NlciBwYWdlLicsXG5cdGljb246IENvZGljb24uc3ltYm9sVGV4dCxcblx0c291cmNlOiBUb29sRGF0YVNvdXJjZS5JbnRlcm5hbCxcblx0aW5wdXRTY2hlbWE6IHtcblx0XHR0eXBlOiAnb2JqZWN0Jyxcblx0XHRwcm9wZXJ0aWVzOiB7XG5cdFx0XHRwYWdlSWQ6IHtcblx0XHRcdFx0dHlwZTogJ3N0cmluZycsXG5cdFx0XHRcdGRlc2NyaXB0aW9uOiBgVGhlIGJyb3dzZXIgcGFnZSBJRCwgYWNxdWlyZWQgZnJvbSBjb250ZXh0IG9yIHRoZSBvcGVuIHRvb2wuYFxuXHRcdFx0fSxcblx0XHRcdHRleHQ6IHtcblx0XHRcdFx0dHlwZTogJ3N0cmluZycsXG5cdFx0XHRcdGRlc2NyaXB0aW9uOiAnVGhlIHRleHQgdG8gdHlwZS4gT25lIG9mIFwidGV4dFwiIG9yIFwia2V5XCIgbXVzdCBiZSBwcm92aWRlZC4nXG5cdFx0XHR9LFxuXHRcdFx0c3VibWl0OiB7XG5cdFx0XHRcdHR5cGU6ICdib29sZWFuJyxcblx0XHRcdFx0ZGVzY3JpcHRpb246ICdXaGV0aGVyIHRvIHByZXNzIEVudGVyIGFmdGVyIHR5cGluZyB0ZXh0LiBJZ25vcmVkIHdoZW4gXCJrZXlcIiBpcyBwcm92aWRlZC4gRGVmYXVsdCBpcyBmYWxzZS4nXG5cdFx0XHR9LFxuXHRcdFx0a2V5OiB7XG5cdFx0XHRcdHR5cGU6ICdzdHJpbmcnLFxuXHRcdFx0XHRkZXNjcmlwdGlvbjogJ0Ega2V5IG9yIGtleSBjb21iaW5hdGlvbiB0byBwcmVzcyAoZS5nLiwgXCJFbnRlclwiLCBcIlRhYlwiLCBcIkNvbnRyb2wrY1wiKS4gT25lIG9mIFwidGV4dFwiIG9yIFwia2V5XCIgbXVzdCBiZSBwcm92aWRlZC4nXG5cdFx0XHR9LFxuXHRcdFx0cmVmOiB7XG5cdFx0XHRcdHR5cGU6ICdzdHJpbmcnLFxuXHRcdFx0XHRkZXNjcmlwdGlvbjogJ0VsZW1lbnQgcmVmZXJlbmNlIHRvIGZvY3VzIGFuZCB0eXBlIGludG8uIElmIG9taXR0ZWQsIHR5cGVzIGludG8gdGhlIGZvY3VzZWQgZWxlbWVudC4nXG5cdFx0XHR9LFxuXHRcdFx0c2VsZWN0b3I6IHtcblx0XHRcdFx0dHlwZTogJ3N0cmluZycsXG5cdFx0XHRcdGRlc2NyaXB0aW9uOiAnUGxheXdyaWdodCBzZWxlY3RvciBvZiBlbGVtZW50IHRvIGZvY3VzIGFuZCB0eXBlIGludG8uIFVzZSBpZiBcInJlZlwiIGlzIG5vdCBhdmFpbGFibGUuIElmIG9taXR0ZWQsIHR5cGVzIGludG8gdGhlIGZvY3VzZWQgZWxlbWVudC4nXG5cdFx0XHR9LFxuXHRcdFx0ZWxlbWVudDoge1xuXHRcdFx0XHR0eXBlOiAnc3RyaW5nJyxcblx0XHRcdFx0ZGVzY3JpcHRpb246ICdIdW1hbi1yZWFkYWJsZSBkZXNjcmlwdGlvbiBvZiB0aGUgZWxlbWVudCB0byB0eXBlIGludG8gKGUuZy4sIFwic2VhcmNoIGJveFwiLCBcImNvbW1lbnQgZmllbGRcIikuIFJlcXVpcmVkIHdoZW4gXCJyZWZcIiBvciBcInNlbGVjdG9yXCIgaXMgc3BlY2lmaWVkLidcblx0XHRcdH0sXG5cdFx0fSxcblx0XHRyZXF1aXJlZDogWydwYWdlSWQnXVxuXHR9LFxufTtcblxuaW50ZXJmYWNlIElUeXBlQnJvd3NlclRvb2xQYXJhbXMge1xuXHRwYWdlSWQ6IHN0cmluZztcblx0dGV4dD86IHN0cmluZztcblx0c3VibWl0PzogYm9vbGVhbjtcblx0a2V5Pzogc3RyaW5nO1xuXHRyZWY/OiBzdHJpbmc7XG5cdHNlbGVjdG9yPzogc3RyaW5nO1xuXHRlbGVtZW50Pzogc3RyaW5nO1xufVxuXG5leHBvcnQgY2xhc3MgVHlwZUJyb3dzZXJUb29sIGltcGxlbWVudHMgSVRvb2xJbXBsIHtcblx0Y29uc3RydWN0b3IoXG5cdFx0QElQbGF5d3JpZ2h0U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IHBsYXl3cmlnaHRTZXJ2aWNlOiBJUGxheXdyaWdodFNlcnZpY2UsXG5cdCkgeyB9XG5cblx0YXN5bmMgcHJlcGFyZVRvb2xJbnZvY2F0aW9uKGNvbnRleHQ6IElUb29sSW52b2NhdGlvblByZXBhcmF0aW9uQ29udGV4dCwgX3Rva2VuOiBDYW5jZWxsYXRpb25Ub2tlbik6IFByb21pc2U8SVByZXBhcmVkVG9vbEludm9jYXRpb24gfCB1bmRlZmluZWQ+IHtcblx0XHRjb25zdCBwYXJhbXMgPSBjb250ZXh0LnBhcmFtZXRlcnMgYXMgSVR5cGVCcm93c2VyVG9vbFBhcmFtcztcblx0XHRjb25zdCBsaW5rID0gY3JlYXRlQnJvd3NlclBhZ2VMaW5rKHBhcmFtcy5wYWdlSWQpO1xuXHRcdGNvbnN0IGhhc1RhcmdldCA9IHBhcmFtcy5yZWYgfHwgcGFyYW1zLnNlbGVjdG9yO1xuXG5cdFx0aWYgKHBhcmFtcy5rZXkpIHtcblx0XHRcdGNvbnN0IGtleSA9IGVzY2FwZU1hcmtkb3duU3ludGF4VG9rZW5zKHBhcmFtcy5rZXkpO1xuXHRcdFx0aWYgKGhhc1RhcmdldCAmJiBwYXJhbXMuZWxlbWVudCkge1xuXHRcdFx0XHRjb25zdCBlbGVtZW50ID0gZXNjYXBlTWFya2Rvd25TeW50YXhUb2tlbnMocGFyYW1zLmVsZW1lbnQpO1xuXHRcdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRcdGludm9jYXRpb25NZXNzYWdlOiBuZXcgTWFya2Rvd25TdHJpbmcobG9jYWxpemUoJ2Jyb3dzZXIucHJlc3NLZXkuaW52b2NhdGlvbi5lbGVtZW50JywgXCJQcmVzc2luZyBrZXkgYHswfWAgaW4gezF9IGluIHsyfVwiLCBrZXksIGVsZW1lbnQsIGxpbmspKSxcblx0XHRcdFx0XHRwYXN0VGVuc2VNZXNzYWdlOiBuZXcgTWFya2Rvd25TdHJpbmcobG9jYWxpemUoJ2Jyb3dzZXIucHJlc3NLZXkucGFzdC5lbGVtZW50JywgXCJQcmVzc2VkIGtleSBgezB9YCBpbiB7MX0gaW4gezJ9XCIsIGtleSwgZWxlbWVudCwgbGluaykpLFxuXHRcdFx0XHR9O1xuXHRcdFx0fVxuXHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0aW52b2NhdGlvbk1lc3NhZ2U6IG5ldyBNYXJrZG93blN0cmluZyhsb2NhbGl6ZSgnYnJvd3Nlci5wcmVzc0tleS5pbnZvY2F0aW9uJywgXCJQcmVzc2luZyBrZXkgYHswfWAgaW4gezF9XCIsIGtleSwgbGluaykpLFxuXHRcdFx0XHRwYXN0VGVuc2VNZXNzYWdlOiBuZXcgTWFya2Rvd25TdHJpbmcobG9jYWxpemUoJ2Jyb3dzZXIucHJlc3NLZXkucGFzdCcsIFwiUHJlc3NlZCBrZXkgYHswfWAgaW4gezF9XCIsIGtleSwgbGluaykpLFxuXHRcdFx0fTtcblx0XHR9XG5cblx0XHRpZiAoaGFzVGFyZ2V0ICYmIHBhcmFtcy5lbGVtZW50KSB7XG5cdFx0XHRjb25zdCBlbGVtZW50ID0gZXNjYXBlTWFya2Rvd25TeW50YXhUb2tlbnMocGFyYW1zLmVsZW1lbnQpO1xuXHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0aW52b2NhdGlvbk1lc3NhZ2U6IHBhcmFtcy5zdWJtaXRcblx0XHRcdFx0XHQ/IG5ldyBNYXJrZG93blN0cmluZyhsb2NhbGl6ZSgnYnJvd3Nlci50eXBlQW5kU3VibWl0Lmludm9jYXRpb24uZWxlbWVudCcsIFwiVHlwaW5nIHRleHQgaW4gezB9IGluIHsxfSBhbmQgcHJlc3NpbmcgRW50ZXJcIiwgZWxlbWVudCwgbGluaykpXG5cdFx0XHRcdFx0OiBuZXcgTWFya2Rvd25TdHJpbmcobG9jYWxpemUoJ2Jyb3dzZXIudHlwZS5pbnZvY2F0aW9uLmVsZW1lbnQnLCBcIlR5cGluZyB0ZXh0IGluIHswfSBpbiB7MX1cIiwgZWxlbWVudCwgbGluaykpLFxuXHRcdFx0XHRwYXN0VGVuc2VNZXNzYWdlOiBwYXJhbXMuc3VibWl0XG5cdFx0XHRcdFx0PyBuZXcgTWFya2Rvd25TdHJpbmcobG9jYWxpemUoJ2Jyb3dzZXIudHlwZUFuZFN1Ym1pdC5wYXN0LmVsZW1lbnQnLCBcIlR5cGVkIHRleHQgaW4gezB9IGluIHsxfSBhbmQgcHJlc3NlZCBFbnRlclwiLCBlbGVtZW50LCBsaW5rKSlcblx0XHRcdFx0XHQ6IG5ldyBNYXJrZG93blN0cmluZyhsb2NhbGl6ZSgnYnJvd3Nlci50eXBlLnBhc3QuZWxlbWVudCcsIFwiVHlwZWQgdGV4dCBpbiB7MH0gaW4gezF9XCIsIGVsZW1lbnQsIGxpbmspKSxcblx0XHRcdH07XG5cdFx0fVxuXHRcdHJldHVybiB7XG5cdFx0XHRpbnZvY2F0aW9uTWVzc2FnZTogcGFyYW1zLnN1Ym1pdFxuXHRcdFx0XHQ/IG5ldyBNYXJrZG93blN0cmluZyhsb2NhbGl6ZSgnYnJvd3Nlci50eXBlQW5kU3VibWl0Lmludm9jYXRpb24nLCBcIlR5cGluZyB0ZXh0IGluIHswfSBhbmQgcHJlc3NpbmcgRW50ZXJcIiwgbGluaykpXG5cdFx0XHRcdDogbmV3IE1hcmtkb3duU3RyaW5nKGxvY2FsaXplKCdicm93c2VyLnR5cGUuaW52b2NhdGlvbicsIFwiVHlwaW5nIHRleHQgaW4gezB9XCIsIGxpbmspKSxcblx0XHRcdHBhc3RUZW5zZU1lc3NhZ2U6IHBhcmFtcy5zdWJtaXRcblx0XHRcdFx0PyBuZXcgTWFya2Rvd25TdHJpbmcobG9jYWxpemUoJ2Jyb3dzZXIudHlwZUFuZFN1Ym1pdC5wYXN0JywgXCJUeXBlZCB0ZXh0IGluIHswfSBhbmQgcHJlc3NlZCBFbnRlclwiLCBsaW5rKSlcblx0XHRcdFx0OiBuZXcgTWFya2Rvd25TdHJpbmcobG9jYWxpemUoJ2Jyb3dzZXIudHlwZS5wYXN0JywgXCJUeXBlZCB0ZXh0IGluIHswfVwiLCBsaW5rKSksXG5cdFx0fTtcblx0fVxuXG5cdGFzeW5jIGludm9rZShpbnZvY2F0aW9uOiBJVG9vbEludm9jYXRpb24sIF9jb3VudFRva2VuczogQ291bnRUb2tlbnNDYWxsYmFjaywgX3Byb2dyZXNzOiBUb29sUHJvZ3Jlc3MsIF90b2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4pOiBQcm9taXNlPElUb29sUmVzdWx0PiB7XG5cdFx0Y29uc3QgcGFyYW1zID0gaW52b2NhdGlvbi5wYXJhbWV0ZXJzIGFzIElUeXBlQnJvd3NlclRvb2xQYXJhbXM7XG5cdFx0Y29uc3Qgc2Vzc2lvbklkID0gZ2V0U2Vzc2lvbklkKGludm9jYXRpb24pO1xuXG5cdFx0aWYgKCFwYXJhbXMucGFnZUlkKSB7XG5cdFx0XHRyZXR1cm4gZXJyb3JSZXN1bHQoYE5vIHBhZ2UgSUQgcHJvdmlkZWQuIFVzZSAnJHtPcGVuUGFnZVRvb2xJZH0nIGZpcnN0LmApO1xuXHRcdH1cblxuXHRcdGxldCBzZWxlY3RvciA9IHBhcmFtcy5zZWxlY3Rvcjtcblx0XHRpZiAocGFyYW1zLnJlZikge1xuXHRcdFx0c2VsZWN0b3IgPSBgYXJpYS1yZWY9JHtwYXJhbXMucmVmfWA7XG5cdFx0fVxuXG5cdFx0aWYgKCFwYXJhbXMudGV4dCAmJiAhcGFyYW1zLmtleSkge1xuXHRcdFx0cmV0dXJuIGVycm9yUmVzdWx0KCdFaXRoZXIgYSBcInRleHRcIiBvciBcImtleVwiIHBhcmFtZXRlciBpcyByZXF1aXJlZC4nKTtcblx0XHR9XG5cblx0XHQvLyBQcmVzcyBrZXlcblx0XHRpZiAocGFyYW1zLmtleSkge1xuXHRcdFx0aWYgKHNlbGVjdG9yKSB7XG5cdFx0XHRcdHJldHVybiBwbGF5d3JpZ2h0SW52b2tlKHRoaXMucGxheXdyaWdodFNlcnZpY2UsIHNlc3Npb25JZCwgcGFyYW1zLnBhZ2VJZCwgKHBhZ2UsIHNlbCwga2V5KSA9PiBwYWdlLmxvY2F0b3Ioc2VsKS5wcmVzcyhrZXkpLCBzZWxlY3RvciwgcGFyYW1zLmtleSk7XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm4gcGxheXdyaWdodEludm9rZSh0aGlzLnBsYXl3cmlnaHRTZXJ2aWNlLCBzZXNzaW9uSWQsIHBhcmFtcy5wYWdlSWQsIChwYWdlLCBrZXkpID0+IHBhZ2Uua2V5Ym9hcmQucHJlc3Moa2V5KSwgcGFyYW1zLmtleSk7XG5cdFx0fVxuXG5cdFx0Ly8gVHlwZSB0ZXh0XG5cdFx0aWYgKHNlbGVjdG9yKSB7XG5cdFx0XHRyZXR1cm4gcGxheXdyaWdodEludm9rZSh0aGlzLnBsYXl3cmlnaHRTZXJ2aWNlLCBzZXNzaW9uSWQsIHBhcmFtcy5wYWdlSWQsIGFzeW5jIChwYWdlLCBzZWwsIHRleHQsIHN1Ym1pdCkgPT4ge1xuXHRcdFx0XHRjb25zdCBsb2NhdG9yID0gcGFnZS5sb2NhdG9yKHNlbCk7XG5cdFx0XHRcdGF3YWl0IGxvY2F0b3IuZmlsbCh0ZXh0KTtcblx0XHRcdFx0aWYgKHN1Ym1pdCkge1xuXHRcdFx0XHRcdGF3YWl0IGxvY2F0b3IucHJlc3MoJ0VudGVyJyk7XG5cdFx0XHRcdH1cblx0XHRcdH0sIHNlbGVjdG9yLCBwYXJhbXMudGV4dCEsIHBhcmFtcy5zdWJtaXQgPz8gZmFsc2UpO1xuXHRcdH1cblx0XHRyZXR1cm4gcGxheXdyaWdodEludm9rZSh0aGlzLnBsYXl3cmlnaHRTZXJ2aWNlLCBzZXNzaW9uSWQsIHBhcmFtcy5wYWdlSWQsIGFzeW5jIChwYWdlLCB0ZXh0LCBzdWJtaXQpID0+IHtcblx0XHRcdGF3YWl0IHBhZ2Uua2V5Ym9hcmQudHlwZSh0ZXh0KTtcblx0XHRcdGlmIChzdWJtaXQpIHtcblx0XHRcdFx0YXdhaXQgcGFnZS5rZXlib2FyZC5wcmVzcygnRW50ZXInKTtcblx0XHRcdH1cblx0XHR9LCBwYXJhbXMudGV4dCEsIHBhcmFtcy5zdWJtaXQgPz8gZmFsc2UpO1xuXHR9XG59XG4iXSwKICAibWFwcGluZ3MiOiAiOzs7Ozs7Ozs7OztBQU1BLFNBQVMsZUFBZTtBQUN4QjtBQUFBLEVBQ0M7QUFBQSxFQUNBO0FBQUEsT0FDTTtBQUNQLFNBQVMsZ0JBQWdCO0FBQ3pCLFNBQVMsMEJBQTBCO0FBQ25DLFNBQVMsc0JBQWlOO0FBQzFOLFNBQVMsdUJBQXVCLGFBQWEsY0FBYyx3QkFBd0I7QUFDbkYsU0FBUyxvQ0FBb0M7QUFDN0MsU0FBUyxzQkFBc0I7QUFFeEIsTUFBTSxzQkFBaUM7QUFBQSxFQUM3QyxJQUFJO0FBQUEsRUFDSixtQkFBbUIsNkJBQTZCO0FBQUEsRUFDaEQsYUFBYSxTQUFTLCtCQUErQixjQUFjO0FBQUEsRUFDbkUsaUJBQWlCLFNBQVMsbUNB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
