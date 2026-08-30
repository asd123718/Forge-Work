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
const HandleDialogBrowserToolData = {
  id: "handle_dialog",
  toolReferenceName: BrowserChatToolReferenceName.HandleDialog,
  displayName: localize("handleDialogBrowserTool.displayName", "Handle Dialog"),
  userDescription: localize("handleDialogBrowserTool.userDescription", "Respond to a dialog in a browser page"),
  modelDescription: "Respond to a pending modal (alert, confirm, prompt) or file chooser dialog on a browser page.",
  icon: Codicon.comment,
  source: ToolDataSource.Internal,
  inputSchema: {
    type: "object",
    properties: {
      pageId: {
        type: "string",
        description: `The browser page ID, acquired from context or the open tool.`
      },
      acceptModal: {
        type: "boolean",
        description: "Whether to accept (true) or dismiss (false) a modal dialog."
      },
      promptText: {
        type: "string",
        description: "Text to enter into a prompt dialog."
      },
      selectFiles: {
        type: "array",
        items: { type: "string" },
        description: "Absolute paths of files to select, or empty to dismiss. Required for file chooser dialogs."
      }
    },
    required: ["pageId"]
  }
};
let HandleDialogBrowserTool = class {
  constructor(playwrightService) {
    this.playwrightService = playwrightService;
  }
  async prepareToolInvocation(_context, _token) {
    const link = createBrowserPageLink(_context.parameters.pageId);
    return {
      invocationMessage: new MarkdownString(localize("browser.handleDialog.invocation", "Handling dialog in {0}", link)),
      pastTenseMessage: new MarkdownString(localize("browser.handleDialog.past", "Handled dialog in {0}", link))
    };
  }
  async invoke(invocation, _countTokens, _progress, _token) {
    const params = invocation.parameters;
    const sessionId = getSessionId(invocation);
    if (!params.pageId) {
      return errorResult(`No page ID provided. Use '${OpenPageToolId}' first.`);
    }
    if (params.selectFiles !== void 0 && (params.acceptModal !== void 0 || params.promptText !== void 0)) {
      return errorResult(`Invalid parameters. 'selectFiles' cannot be used with 'acceptModal' or 'promptText'.`);
    }
    if (!Array.isArray(params.selectFiles) && (params.acceptModal === void 0 || params.acceptModal === null)) {
      return errorResult(`Invalid parameters. Either 'selectFiles' or 'acceptModal' must be provided.`);
    }
    try {
      let result;
      if (params.selectFiles !== void 0) {
        result = await this.playwrightService.replyToFileChooser(sessionId, params.pageId, params.selectFiles);
      } else {
        result = await this.playwrightService.replyToDialog(sessionId, params.pageId, params.acceptModal, params.promptText);
      }
      return { content: [{ kind: "text", value: result.summary }] };
    } catch (e) {
      return errorResult(e instanceof Error ? e.message : String(e));
    }
  }
};
HandleDialogBrowserTool = __decorateClass([
  __decorateParam(0, IPlaywrightService)
], HandleDialogBrowserTool);
export {
  HandleDialogBrowserTool,
  HandleDialogBrowserToolData
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXGJyb3dzZXJWaWV3XFxlbGVjdHJvbi1icm93c2VyXFx0b29sc1xcaGFuZGxlRGlhbG9nQnJvd3NlclRvb2wudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgdHlwZSB7IENhbmNlbGxhdGlvblRva2VuIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vY2FuY2VsbGF0aW9uLmpzJztcbmltcG9ydCB7IENvZGljb24gfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9jb2RpY29ucy5qcyc7XG5pbXBvcnQgeyBNYXJrZG93blN0cmluZyB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2h0bWxDb250ZW50LmpzJztcbmltcG9ydCB7IGxvY2FsaXplIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vbmxzLmpzJztcbmltcG9ydCB7IElQbGF5d3JpZ2h0U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2Jyb3dzZXJWaWV3L2NvbW1vbi9wbGF5d3JpZ2h0U2VydmljZS5qcyc7XG5pbXBvcnQgeyBUb29sRGF0YVNvdXJjZSwgdHlwZSBDb3VudFRva2Vuc0NhbGxiYWNrLCB0eXBlIElQcmVwYXJlZFRvb2xJbnZvY2F0aW9uLCB0eXBlIElUb29sRGF0YSwgdHlwZSBJVG9vbEltcGwsIHR5cGUgSVRvb2xJbnZvY2F0aW9uLCB0eXBlIElUb29sSW52b2NhdGlvblByZXBhcmF0aW9uQ29udGV4dCwgdHlwZSBJVG9vbFJlc3VsdCwgdHlwZSBUb29sUHJvZ3Jlc3MgfSBmcm9tICcuLi8uLi8uLi9jaGF0L2NvbW1vbi90b29scy9sYW5ndWFnZU1vZGVsVG9vbHNTZXJ2aWNlLmpzJztcbmltcG9ydCB7IGNyZWF0ZUJyb3dzZXJQYWdlTGluaywgZXJyb3JSZXN1bHQsIGdldFNlc3Npb25JZCB9IGZyb20gJy4vYnJvd3NlclRvb2xIZWxwZXJzLmpzJztcbmltcG9ydCB7IEJyb3dzZXJDaGF0VG9vbFJlZmVyZW5jZU5hbWUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9icm93c2VyVmlldy9jb21tb24vYnJvd3NlckNoYXRUb29sUmVmZXJlbmNlTmFtZXMuanMnO1xuaW1wb3J0IHsgT3BlblBhZ2VUb29sSWQgfSBmcm9tICcuL29wZW5Ccm93c2VyVG9vbC5qcyc7XG5cbmV4cG9ydCBjb25zdCBIYW5kbGVEaWFsb2dCcm93c2VyVG9vbERhdGE6IElUb29sRGF0YSA9IHtcblx0aWQ6ICdoYW5kbGVfZGlhbG9nJyxcblx0dG9vbFJlZmVyZW5jZU5hbWU6IEJyb3dzZXJDaGF0VG9vbFJlZmVyZW5jZU5hbWUuSGFuZGxlRGlhbG9nLFxuXHRkaXNwbGF5TmFtZTogbG9jYWxpemUoJ2hhbmRsZURpYWxvZ0Jyb3dzZXJUb29sLmRpc3BsYXlOYW1lJywgJ0hhbmRsZSBEaWFsb2cnKSxcblx0dXNlckRlc2NyaXB0aW9uOiBsb2NhbGl6ZSgnaGFuZGxlRGlhbG9nQnJvd3NlclRvb2wudXNlckRlc2NyaXB0aW9uJywgJ1Jlc3BvbmQgdG8gYSBkaWFsb2cgaW4gYSBicm93c2VyIHBhZ2UnKSxcblx0bW9kZWxEZXNjcmlwdGlvbjogJ1Jlc3BvbmQgdG8gYSBwZW5kaW5nIG1vZGFsIChhbGVydCwgY29uZmlybSwgcHJvbXB0KSBvciBmaWxlIGNob29zZXIgZGlhbG9nIG9uIGEgYnJvd3NlciBwYWdlLicsXG5cdGljb246IENvZGljb24uY29tbWVudCxcblx0c291cmNlOiBUb29sRGF0YVNvdXJjZS5JbnRlcm5hbCxcblx0aW5wdXRTY2hlbWE6IHtcblx0XHR0eXBlOiAnb2JqZWN0Jyxcblx0XHRwcm9wZXJ0aWVzOiB7XG5cdFx0XHRwYWdlSWQ6IHtcblx0XHRcdFx0dHlwZTogJ3N0cmluZycsXG5cdFx0XHRcdGRlc2NyaXB0aW9uOiBgVGhlIGJyb3dzZXIgcGFnZSBJRCwgYWNxdWlyZWQgZnJvbSBjb250ZXh0IG9yIHRoZSBvcGVuIHRvb2wuYFxuXHRcdFx0fSxcblx0XHRcdGFjY2VwdE1vZGFsOiB7XG5cdFx0XHRcdHR5cGU6ICdib29sZWFuJyxcblx0XHRcdFx0ZGVzY3JpcHRpb246ICdXaGV0aGVyIHRvIGFjY2VwdCAodHJ1ZSkgb3IgZGlzbWlzcyAoZmFsc2UpIGEgbW9kYWwgZGlhbG9nLidcblx0XHRcdH0sXG5cdFx0XHRwcm9tcHRUZXh0OiB7XG5cdFx0XHRcdHR5cGU6ICdzdHJpbmcnLFxuXHRcdFx0XHRkZXNjcmlwdGlvbjogJ1RleHQgdG8gZW50ZXIgaW50byBhIHByb21wdCBkaWFsb2cuJ1xuXHRcdFx0fSxcblx0XHRcdHNlbGVjdEZpbGVzOiB7XG5cdFx0XHRcdHR5cGU6ICdhcnJheScsXG5cdFx0XHRcdGl0ZW1zOiB7IHR5cGU6ICdzdHJpbmcnIH0sXG5cdFx0XHRcdGRlc2NyaXB0aW9uOiAnQWJzb2x1dGUgcGF0aHMgb2YgZmlsZXMgdG8gc2VsZWN0LCBvciBlbXB0eSB0byBkaXNtaXNzLiBSZXF1aXJlZCBmb3IgZmlsZSBjaG9vc2VyIGRpYWxvZ3MuJ1xuXHRcdFx0fSxcblx0XHR9LFxuXHRcdHJlcXVpcmVkOiBbJ3BhZ2VJZCddLFxuXHR9LFxufTtcblxuaW50ZXJmYWNlIElIYW5kbGVEaWFsb2dCcm93c2VyVG9vbFBhcmFtcyB7XG5cdHBhZ2VJZDogc3RyaW5nO1xuXHRhY2NlcHRNb2RhbDogYm9vbGVhbjtcblx0cHJvbXB0VGV4dD86IHN0cmluZztcblx0c2VsZWN0RmlsZXM/OiBzdHJpbmdbXTtcbn1cblxuZXhwb3J0IGNsYXNzIEhhbmRsZURpYWxvZ0Jyb3dzZXJUb29sIGltcGxlbWVudHMgSVRvb2xJbXBsIHtcblx0Y29uc3RydWN0b3IoXG5cdFx0QElQbGF5d3JpZ2h0U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IHBsYXl3cmlnaHRTZXJ2aWNlOiBJUGxheXdyaWdodFNlcnZpY2UsXG5cdCkgeyB9XG5cblx0YXN5bmMgcHJlcGFyZVRvb2xJbnZvY2F0aW9uKF9jb250ZXh0OiBJVG9vbEludm9jYXRpb25QcmVwYXJhdGlvbkNvbnRleHQsIF90b2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4pOiBQcm9taXNlPElQcmVwYXJlZFRvb2xJbnZvY2F0aW9uIHwgdW5kZWZpbmVkPiB7XG5cdFx0Y29uc3QgbGluayA9IGNyZWF0ZUJyb3dzZXJQYWdlTGluayhfY29udGV4dC5wYXJhbWV0ZXJzLnBhZ2VJZCk7XG5cdFx0cmV0dXJuIHtcblx0XHRcdGludm9jYXRpb25NZXNzYWdlOiBuZXcgTWFya2Rvd25TdHJpbmcobG9jYWxpemUoJ2Jyb3dzZXIuaGFuZGxlRGlhbG9nLmludm9jYXRpb24nLCBcIkhhbmRsaW5nIGRpYWxvZyBpbiB7MH1cIiwgbGluaykpLFxuXHRcdFx0cGFzdFRlbnNlTWVzc2FnZTogbmV3IE1hcmtkb3duU3RyaW5nKGxvY2FsaXplKCdicm93c2VyLmhhbmRsZURpYWxvZy5wYXN0JywgXCJIYW5kbGVkIGRpYWxvZyBpbiB7MH1cIiwgbGluaykpLFxuXHRcdH07XG5cdH1cblxuXHRhc3luYyBpbnZva2UoaW52b2NhdGlvbjogSVRvb2xJbnZvY2F0aW9uLCBfY291bnRUb2tlbnM6IENvdW50VG9rZW5zQ2FsbGJhY2ssIF9wcm9ncmVzczogVG9vbFByb2dyZXNzLCBfdG9rZW46IENhbmNlbGxhdGlvblRva2VuKTogUHJvbWlzZTxJVG9vbFJlc3VsdD4ge1xuXHRcdGNvbnN0IHBhcmFtcyA9IGludm9jYXRpb24ucGFyYW1ldGVycyBhcyBJSGFuZGxlRGlhbG9nQnJvd3NlclRvb2xQYXJhbXM7XG5cdFx0Y29uc3Qgc2Vzc2lvbklkID0gZ2V0U2Vzc2lvbklkKGludm9jYXRpb24pO1xuXG5cdFx0aWYgKCFwYXJhbXMucGFnZUlkKSB7XG5cdFx0XHRyZXR1cm4gZXJyb3JSZXN1bHQoYE5vIHBhZ2UgSUQgcHJvdmlkZWQuIFVzZSAnJHtPcGVuUGFnZVRvb2xJZH0nIGZpcnN0LmApO1xuXHRcdH1cblxuXHRcdGlmIChwYXJhbXMuc2VsZWN0RmlsZXMgIT09IHVuZGVmaW5lZCAmJiAocGFyYW1zLmFjY2VwdE1vZGFsICE9PSB1bmRlZmluZWQgfHwgcGFyYW1zLnByb21wdFRleHQgIT09IHVuZGVmaW5lZCkpIHtcblx0XHRcdHJldHVybiBlcnJvclJlc3VsdChgSW52YWxpZCBwYXJhbWV0ZXJzLiAnc2VsZWN0RmlsZXMnIGNhbm5vdCBiZSB1c2VkIHdpdGggJ2FjY2VwdE1vZGFsJyBvciAncHJvbXB0VGV4dCcuYCk7XG5cdFx0fVxuXG5cdFx0aWYgKCFBcnJheS5pc0FycmF5KHBhcmFtcy5zZWxlY3RGaWxlcykgJiYgKHBhcmFtcy5hY2NlcHRNb2RhbCA9PT0gdW5kZWZpbmVkIHx8IHBhcmFtcy5hY2NlcHRNb2RhbCA9PT0gbnVsbCkpIHtcblx0XHRcdHJldHVybiBlcnJvclJlc3VsdChgSW52YWxpZCBwYXJhbWV0ZXJzLiBFaXRoZXIgJ3NlbGVjdEZpbGVzJyBvciAnYWNjZXB0TW9kYWwnIG11c3QgYmUgcHJvdmlkZWQuYCk7XG5cdFx0fVxuXG5cdFx0dHJ5IHtcblx0XHRcdGxldCByZXN1bHQ7XG5cdFx0XHRpZiAocGFyYW1zLnNlbGVjdEZpbGVzICE9PSB1bmRlZmluZWQpIHtcblx0XHRcdFx0cmVzdWx0ID0gYXdhaXQgdGhpcy5wbGF5d3JpZ2h0U2VydmljZS5yZXBseVRvRmlsZUNob29zZXIoc2Vzc2lvbklkLCBwYXJhbXMucGFnZUlkLCBwYXJhbXMuc2VsZWN0RmlsZXMpO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0cmVzdWx0ID0gYXdhaXQgdGhpcy5wbGF5d3JpZ2h0U2VydmljZS5yZXBseVRvRGlhbG9nKHNlc3Npb25JZCwgcGFyYW1zLnBhZ2VJZCwgcGFyYW1zLmFjY2VwdE1vZGFsLCBwYXJhbXMucHJvbXB0VGV4dCk7XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm4geyBjb250ZW50OiBbeyBraW5kOiAndGV4dCcsIHZhbHVlOiByZXN1bHQuc3VtbWFyeSB9XSB9O1xuXHRcdH0gY2F0Y2ggKGUpIHtcblx0XHRcdHJldHVybiBlcnJvclJlc3VsdChlIGluc3RhbmNlb2YgRXJyb3IgPyBlLm1lc3NhZ2UgOiBTdHJpbmcoZSkpO1xuXHRcdH1cblx0fVxufVxuIl0sCiAgIm1hcHBpbmdzIjogIjs7Ozs7Ozs7Ozs7QUFNQSxTQUFTLGVBQWU7QUFDeEIsU0FBUyxzQkFBc0I7QUFDL0IsU0FBUyxnQkFBZ0I7QUFDekIsU0FBUywwQkFBMEI7QUFDbkMsU0FBUyxzQkFBaU47QUFDMU4sU0FBUyx1QkFBdUIsYUFBYSxvQkFBb0I7QUFDakUsU0FBUyxvQ0FBb0M7QUFDN0MsU0FBUyxzQkFBc0I7QUFFeEIsTUFBTSw4QkFBeUM7QUFBQSxFQUNyRCxJQUFJO0FBQUEsRUFDSixtQkFBbUIsNkJBQTZCO0FBQUEsRUFDaEQsYUFBYSxTQUFTLHVDQUF1QyxlQUFlO0FBQUEsRUFDNUUsaUJBQWlCLFNBQVMsMkNBQTJDLHVDQUF1QztBQUFBLEVBQzVHLGtCQUFrQjtBQUFBLEVBQ2xCLE1BQU0sUUFBUTtBQUFBLEVBQ2QsUUFBUSxlQUFlO0FBQUEsRUFDdkIsYUFBYTtBQUFBLElBQ1osTUFBTTtBQUFBLElBQ04sWUFBWTtBQUFBLE1BQ1gsUUFBUTtBQUFBLFFBQ1AsTUFBTTtBQUFBLFFBQ04sYUFBYTtBQUFBLE1BQ2Q7QUFBQSxNQUNBLGFBQWE7QUFBQSxRQUNaLE1BQU07QUFBQSxRQUNOLGFBQWE7QUFBQSxNQUNkO0FBQUEsTUFDQSxZQUFZO0FBQUEsUUFDWCxNQUFNO0FBQUEsUUFDTixhQUFhO0FBQUEsTUFDZDtBQUFBLE1BQ0EsYUFBYTtBQUFBLFFBQ1osTUFBTTtBQUFBLFFBQ04sT0FBTyxFQUFFLE1BQU0sU0FBUztBQUFBLFFBQ3hCLGFBQWE7QUFBQSxNQUNkO0FBQUEsSUFDRDtBQUFBLElBQ0EsVUFBVSxDQUFDLFFBQVE7QUFBQSxFQUNwQjtBQUNEO0FBU08sSUFBTSwwQkFBTixNQUFtRDtBQUFBLEVBQ3pELFlBQ3NDLG1CQUNwQztBQURvQztBQUFBLEVBQ2xDO0FBQUEsRUFFSixNQUFNLHNCQUFzQixVQUE2QyxRQUF5RTtBQUNqSixVQUFNLE9BQU8sc0JBQXNCLFNBQVMsV0FBVyxNQUFNO0FBQzdELFdBQU87QUFBQSxNQUNOLG1CQUFtQixJQUFJLGVBQWUsU0FBUyxtQ0FBbUMsMEJBQTBCLElBQUksQ0FBQztBQUFBLE1BQ2pILGtCQUFrQixJQUFJLGVBQWUsU0FBUyw2QkFBNkIseUJBQXlCLElBQUksQ0FBQztBQUFBLElBQzFHO0FBQUEsRUFDRDtBQUFBLEVBRUEsTUFBTSxPQUFPLFlBQTZCLGNBQW1DLFdBQXlCLFFBQWlEO0FBQ3RKLFVBQU0sU0FBUyxXQUFXO0FBQzFCLFVBQU0sWUFBWSxhQUFhLFVBQVU7QUFFekMsUUFBSSxDQUFDLE9BQU8sUUFBUTtBQUNuQixhQUFPLFlBQVksNkJBQTZCLGNBQWMsVUFBVTtBQUFBLElBQ3pFO0FBRUEsUUFBSSxPQUFPLGdCQUFnQixXQUFjLE9BQU8sZ0JBQWdCLFVBQWEsT0FBTyxlQUFlLFNBQVk7QUFDOUcsYUFBTyxZQUFZLHNGQUFzRjtBQUFBLElBQzFHO0FBRUEsUUFBSSxDQUFDLE1BQU0sUUFBUSxPQUFPLFdBQVcsTUFBTSxPQUFPLGdCQUFnQixVQUFhLE9BQU8sZ0JBQWdCLE9BQU87QUFDNUcsYUFBTyxZQUFZLDZFQUE2RTtBQUFBLElBQ2pHO0FBRUEsUUFBSTtBQUNILFVBQUk7QUFDSixVQUFJLE9BQU8sZ0JBQWdCLFFBQVc7QUFDckMsaUJBQVMsTUFBTSxLQUFLLGtCQUFrQixtQkFBbUIsV0FBVyxPQUFPLFFBQVEsT0FBTyxXQUFXO0FBQUEsTUFDdEcsT0FBTztBQUNOLGlCQUFTLE1BQU0sS0FBSyxrQkFBa0IsY0FBYyxXQUFXLE9BQU8sUUFBUSxPQUFPLGFBQWEsT0FBTyxVQUFVO0FBQUEsTUFDcEg7QUFDQSxhQUFPLEVBQUUsU0FBUyxDQUFDLEVBQUUsTUFBTSxRQUFRLE9BQU8sT0FBTyxRQUFRLENBQUMsRUFBRTtBQUFBLElBQzdELFNBQVMsR0FBRztBQUNYLGFBQU8sWUFBWSxhQUFhLFFBQVEsRUFBRSxVQUFVLE9BQU8sQ0FBQyxDQUFDO0FBQUEsSUFDOUQ7QUFBQSxFQUNEO0FBQ0Q7QUF6Q2EsMEJBQU47QUFBQSxFQUVKO0FBQUEsR0FGVTsiLAogICJuYW1lcyI6IFtdCn0K
