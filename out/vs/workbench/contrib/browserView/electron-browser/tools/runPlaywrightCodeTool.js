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
import { errorResult, getSessionId, invokeFunctionResultToToolResult } from "./browserToolHelpers.js";
import { BrowserChatToolReferenceName } from "../../../../../platform/browserView/common/browserChatToolReferenceNames.js";
import { OpenPageToolId } from "./openBrowserTool.js";
const RunPlaywrightCodeToolData = {
  id: "run_playwright_code",
  toolReferenceName: BrowserChatToolReferenceName.RunPlaywrightCode,
  displayName: localize("runPlaywrightCodeTool.displayName", "Run Playwright Code"),
  userDescription: localize("runPlaywrightCodeTool.userDescription", "Run a Playwright code snippet against a browser page"),
  modelDescription: `Run a Playwright code snippet to control a browser page. Only use this if other browser tools are insufficient.`,
  icon: Codicon.terminal,
  source: ToolDataSource.Internal,
  inputSchema: {
    type: "object",
    properties: {
      pageId: {
        type: "string",
        description: `The browser page ID, acquired from context or the open tool.`
      },
      code: {
        type: "string",
        description: `The Playwright code to execute. The code must be concise, serve one clear purpose, and be self-contained. You **must not** directly access \`document\` or \`window\` using this tool. You must access it via the provided \`page\` object, e.g. "return page.evaluate(() => document.title)". Omit this when resuming a deferred execution via deferredResultId.`
      },
      deferredResultId: {
        type: "string",
        description: `If a previous call returned a deferredResultId, pass it here to continue waiting for that execution to complete.`
      },
      timeoutMs: {
        type: "number",
        description: `Maximum time in milliseconds to wait for the code to complete. Defaults to 5000 (5 seconds).`
      }
    },
    required: ["pageId"],
    $comment: 'Either "code" or "deferredResultId" must be provided.'
  }
};
let RunPlaywrightCodeTool = class {
  constructor(playwrightService) {
    this.playwrightService = playwrightService;
  }
  async prepareToolInvocation(context, _token) {
    const params = context.parameters;
    if (params.deferredResultId) {
      return {
        invocationMessage: new MarkdownString(localize("browser.runCode.waitInvocation", "Waiting for Playwright code to complete...")),
        pastTenseMessage: new MarkdownString(localize("browser.runCode.waitPast", "Waited for Playwright code"))
      };
    }
    const code = params.code ?? "";
    return {
      invocationMessage: new MarkdownString(localize("browser.runCode.invocation", "Running Playwright code...")),
      pastTenseMessage: new MarkdownString(localize("browser.runCode.past", "Ran Playwright code")),
      confirmationMessages: {
        title: localize("browser.runCode.confirmTitle", "Run Playwright Code?"),
        message: new MarkdownString(`\`\`\`javascript
${code.trim()}
\`\`\``),
        disclaimer: localize("browser.runCode.confirmDisclaimer", "Make sure you trust the code before continuing."),
        allowAutoConfirm: true
      }
    };
  }
  async invoke(invocation, _countTokens, _progress, _token) {
    const params = invocation.parameters;
    const sessionId = getSessionId(invocation);
    if (!params.pageId) {
      return errorResult(`No page ID provided. Use '${OpenPageToolId}' first.`);
    }
    if (params.deferredResultId) {
      try {
        const result2 = await this.playwrightService.waitForDeferredResult(sessionId, params.deferredResultId, params.timeoutMs ?? 5e3);
        return invokeFunctionResultToToolResult(result2);
      } catch (e) {
        return errorResult(e instanceof Error ? e.message : String(e));
      }
    }
    if (!params.code) {
      return errorResult('Either "code" or "deferredResultId" must be provided.');
    }
    let result;
    try {
      result = await this.playwrightService.invokeFunction(sessionId, params.pageId, `async (page) => { ${params.code} }`, void 0, params.timeoutMs ?? 5e3);
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      return errorResult(`Code execution failed: ${message}`);
    }
    return invokeFunctionResultToToolResult(result, params.code.trim());
  }
};
RunPlaywrightCodeTool = __decorateClass([
  __decorateParam(0, IPlaywrightService)
], RunPlaywrightCodeTool);
export {
  RunPlaywrightCodeTool,
  RunPlaywrightCodeToolData
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXGJyb3dzZXJWaWV3XFxlbGVjdHJvbi1icm93c2VyXFx0b29sc1xccnVuUGxheXdyaWdodENvZGVUb29sLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IHR5cGUgeyBDYW5jZWxsYXRpb25Ub2tlbiB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2NhbmNlbGxhdGlvbi5qcyc7XG5pbXBvcnQgeyBDb2RpY29uIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vY29kaWNvbnMuanMnO1xuaW1wb3J0IHsgTWFya2Rvd25TdHJpbmcgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9odG1sQ29udGVudC5qcyc7XG5pbXBvcnQgeyBsb2NhbGl6ZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL25scy5qcyc7XG5pbXBvcnQgeyBJUGxheXdyaWdodFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9icm93c2VyVmlldy9jb21tb24vcGxheXdyaWdodFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgVG9vbERhdGFTb3VyY2UsIHR5cGUgQ291bnRUb2tlbnNDYWxsYmFjaywgdHlwZSBJUHJlcGFyZWRUb29sSW52b2NhdGlvbiwgdHlwZSBJVG9vbERhdGEsIHR5cGUgSVRvb2xJbXBsLCB0eXBlIElUb29sSW52b2NhdGlvbiwgdHlwZSBJVG9vbEludm9jYXRpb25QcmVwYXJhdGlvbkNvbnRleHQsIHR5cGUgSVRvb2xSZXN1bHQsIHR5cGUgVG9vbFByb2dyZXNzIH0gZnJvbSAnLi4vLi4vLi4vY2hhdC9jb21tb24vdG9vbHMvbGFuZ3VhZ2VNb2RlbFRvb2xzU2VydmljZS5qcyc7XG5pbXBvcnQgeyBlcnJvclJlc3VsdCwgZ2V0U2Vzc2lvbklkLCBpbnZva2VGdW5jdGlvblJlc3VsdFRvVG9vbFJlc3VsdCB9IGZyb20gJy4vYnJvd3NlclRvb2xIZWxwZXJzLmpzJztcbmltcG9ydCB7IEJyb3dzZXJDaGF0VG9vbFJlZmVyZW5jZU5hbWUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9icm93c2VyVmlldy9jb21tb24vYnJvd3NlckNoYXRUb29sUmVmZXJlbmNlTmFtZXMuanMnO1xuaW1wb3J0IHsgT3BlblBhZ2VUb29sSWQgfSBmcm9tICcuL29wZW5Ccm93c2VyVG9vbC5qcyc7XG5cbmV4cG9ydCBjb25zdCBSdW5QbGF5d3JpZ2h0Q29kZVRvb2xEYXRhOiBJVG9vbERhdGEgPSB7XG5cdGlkOiAncnVuX3BsYXl3cmlnaHRfY29kZScsXG5cdHRvb2xSZWZlcmVuY2VOYW1lOiBCcm93c2VyQ2hhdFRvb2xSZWZlcmVuY2VOYW1lLlJ1blBsYXl3cmlnaHRDb2RlLFxuXHRkaXNwbGF5TmFtZTogbG9jYWxpemUoJ3J1blBsYXl3cmlnaHRDb2RlVG9vbC5kaXNwbGF5TmFtZScsICdSdW4gUGxheXdyaWdodCBDb2RlJyksXG5cdHVzZXJEZXNjcmlwdGlvbjogbG9jYWxpemUoJ3J1blBsYXl3cmlnaHRDb2RlVG9vbC51c2VyRGVzY3JpcHRpb24nLCAnUnVuIGEgUGxheXdyaWdodCBjb2RlIHNuaXBwZXQgYWdhaW5zdCBhIGJyb3dzZXIgcGFnZScpLFxuXHRtb2RlbERlc2NyaXB0aW9uOiBgUnVuIGEgUGxheXdyaWdodCBjb2RlIHNuaXBwZXQgdG8gY29udHJvbCBhIGJyb3dzZXIgcGFnZS4gT25seSB1c2UgdGhpcyBpZiBvdGhlciBicm93c2VyIHRvb2xzIGFyZSBpbnN1ZmZpY2llbnQuYCxcblx0aWNvbjogQ29kaWNvbi50ZXJtaW5hbCxcblx0c291cmNlOiBUb29sRGF0YVNvdXJjZS5JbnRlcm5hbCxcblx0aW5wdXRTY2hlbWE6IHtcblx0XHR0eXBlOiAnb2JqZWN0Jyxcblx0XHRwcm9wZXJ0aWVzOiB7XG5cdFx0XHRwYWdlSWQ6IHtcblx0XHRcdFx0dHlwZTogJ3N0cmluZycsXG5cdFx0XHRcdGRlc2NyaXB0aW9uOiBgVGhlIGJyb3dzZXIgcGFnZSBJRCwgYWNxdWlyZWQgZnJvbSBjb250ZXh0IG9yIHRoZSBvcGVuIHRvb2wuYFxuXHRcdFx0fSxcblx0XHRcdGNvZGU6IHtcblx0XHRcdFx0dHlwZTogJ3N0cmluZycsXG5cdFx0XHRcdGRlc2NyaXB0aW9uOiBgVGhlIFBsYXl3cmlnaHQgY29kZSB0byBleGVjdXRlLiBUaGUgY29kZSBtdXN0IGJlIGNvbmNpc2UsIHNlcnZlIG9uZSBjbGVhciBwdXJwb3NlLCBhbmQgYmUgc2VsZi1jb250YWluZWQuIFlvdSAqKm11c3Qgbm90KiogZGlyZWN0bHkgYWNjZXNzIFxcYGRvY3VtZW50XFxgIG9yIFxcYHdpbmRvd1xcYCB1c2luZyB0aGlzIHRvb2wuIFlvdSBtdXN0IGFjY2VzcyBpdCB2aWEgdGhlIHByb3ZpZGVkIFxcYHBhZ2VcXGAgb2JqZWN0LCBlLmcuIFwicmV0dXJuIHBhZ2UuZXZhbHVhdGUoKCkgPT4gZG9jdW1lbnQudGl0bGUpXCIuIE9taXQgdGhpcyB3aGVuIHJlc3VtaW5nIGEgZGVmZXJyZWQgZXhlY3V0aW9uIHZpYSBkZWZlcnJlZFJlc3VsdElkLmBcblx0XHRcdH0sXG5cdFx0XHRkZWZlcnJlZFJlc3VsdElkOiB7XG5cdFx0XHRcdHR5cGU6ICdzdHJpbmcnLFxuXHRcdFx0XHRkZXNjcmlwdGlvbjogYElmIGEgcHJldmlvdXMgY2FsbCByZXR1cm5lZCBhIGRlZmVycmVkUmVzdWx0SWQsIHBhc3MgaXQgaGVyZSB0byBjb250aW51ZSB3YWl0aW5nIGZvciB0aGF0IGV4ZWN1dGlvbiB0byBjb21wbGV0ZS5gXG5cdFx0XHR9LFxuXHRcdFx0dGltZW91dE1zOiB7XG5cdFx0XHRcdHR5cGU6ICdudW1iZXInLFxuXHRcdFx0XHRkZXNjcmlwdGlvbjogYE1heGltdW0gdGltZSBpbiBtaWxsaXNlY29uZHMgdG8gd2FpdCBmb3IgdGhlIGNvZGUgdG8gY29tcGxldGUuIERlZmF1bHRzIHRvIDUwMDAgKDUgc2Vjb25kcykuYFxuXHRcdFx0fSxcblx0XHR9LFxuXHRcdHJlcXVpcmVkOiBbJ3BhZ2VJZCddLFxuXHRcdCRjb21tZW50OiAnRWl0aGVyIFwiY29kZVwiIG9yIFwiZGVmZXJyZWRSZXN1bHRJZFwiIG11c3QgYmUgcHJvdmlkZWQuJyxcblx0fSxcbn07XG5cbmludGVyZmFjZSBJUnVuUGxheXdyaWdodENvZGVUb29sUGFyYW1zIHtcblx0cGFnZUlkOiBzdHJpbmc7XG5cdGNvZGU/OiBzdHJpbmc7XG5cdGRlZmVycmVkUmVzdWx0SWQ/OiBzdHJpbmc7XG5cdHRpbWVvdXRNcz86IG51bWJlcjtcbn1cblxuZXhwb3J0IGNsYXNzIFJ1blBsYXl3cmlnaHRDb2RlVG9vbCBpbXBsZW1lbnRzIElUb29sSW1wbCB7XG5cdGNvbnN0cnVjdG9yKFxuXHRcdEBJUGxheXdyaWdodFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBwbGF5d3JpZ2h0U2VydmljZTogSVBsYXl3cmlnaHRTZXJ2aWNlLFxuXHQpIHsgfVxuXG5cdGFzeW5jIHByZXBhcmVUb29sSW52b2NhdGlvbihjb250ZXh0OiBJVG9vbEludm9jYXRpb25QcmVwYXJhdGlvbkNvbnRleHQsIF90b2tlbjogQ2FuY2VsbGF0aW9uVG9rZW4pOiBQcm9taXNlPElQcmVwYXJlZFRvb2xJbnZvY2F0aW9uIHwgdW5kZWZpbmVkPiB7XG5cdFx0Y29uc3QgcGFyYW1zID0gY29udGV4dC5wYXJhbWV0ZXJzIGFzIElSdW5QbGF5d3JpZ2h0Q29kZVRvb2xQYXJhbXM7XG5cblx0XHRpZiAocGFyYW1zLmRlZmVycmVkUmVzdWx0SWQpIHtcblx0XHRcdHJldHVybiB7XG5cdFx0XHRcdGludm9jYXRpb25NZXNzYWdlOiBuZXcgTWFya2Rvd25TdHJpbmcobG9jYWxpemUoJ2Jyb3dzZXIucnVuQ29kZS53YWl0SW52b2NhdGlvbicsIFwiV2FpdGluZyBmb3IgUGxheXdyaWdodCBjb2RlIHRvIGNvbXBsZXRlLi4uXCIpKSxcblx0XHRcdFx0cGFzdFRlbnNlTWVzc2FnZTogbmV3IE1hcmtkb3duU3RyaW5nKGxvY2FsaXplKCdicm93c2VyLnJ1bkNvZGUud2FpdFBhc3QnLCBcIldhaXRlZCBmb3IgUGxheXdyaWdodCBjb2RlXCIpKSxcblx0XHRcdH07XG5cdFx0fVxuXG5cdFx0Y29uc3QgY29kZSA9IHBhcmFtcy5jb2RlID8/ICcnO1xuXHRcdHJldHVybiB7XG5cdFx0XHRpbnZvY2F0aW9uTWVzc2FnZTogbmV3IE1hcmtkb3duU3RyaW5nKGxvY2FsaXplKCdicm93c2VyLnJ1bkNvZGUuaW52b2NhdGlvbicsIFwiUnVubmluZyBQbGF5d3JpZ2h0IGNvZGUuLi5cIikpLFxuXHRcdFx0cGFzdFRlbnNlTWVzc2FnZTogbmV3IE1hcmtkb3duU3RyaW5nKGxvY2FsaXplKCdicm93c2VyLnJ1bkNvZGUucGFzdCcsIFwiUmFuIFBsYXl3cmlnaHQgY29kZVwiKSksXG5cdFx0XHRjb25maXJtYXRpb25NZXNzYWdlczoge1xuXHRcdFx0XHR0aXRsZTogbG9jYWxpemUoJ2Jyb3dzZXIucnVuQ29kZS5jb25maXJtVGl0bGUnLCAnUnVuIFBsYXl3cmlnaHQgQ29kZT8nKSxcblx0XHRcdFx0bWVzc2FnZTogbmV3IE1hcmtkb3duU3RyaW5nKGBcXGBcXGBcXGBqYXZhc2NyaXB0XFxuJHtjb2RlLnRyaW0oKX1cXG5cXGBcXGBcXGBgKSxcblx0XHRcdFx0ZGlzY2xhaW1lcjogbG9jYWxpemUoJ2Jyb3dzZXIucnVuQ29kZS5jb25maXJtRGlzY2xhaW1lcicsICdNYWtlIHN1cmUgeW91IHRydXN0IHRoZSBjb2RlIGJlZm9yZSBjb250aW51aW5nLicpLFxuXHRcdFx0XHRhbGxvd0F1dG9Db25maXJtOiB0cnVlLFxuXHRcdFx0fVxuXHRcdH07XG5cdH1cblxuXHRhc3luYyBpbnZva2UoaW52b2NhdGlvbjogSVRvb2xJbnZvY2F0aW9uLCBfY291bnRUb2tlbnM6IENvdW50VG9rZW5zQ2FsbGJhY2ssIF9wcm9ncmVzczogVG9vbFByb2dyZXNzLCBfdG9rZW46IENhbmNlbGxhdGlvblRva2VuKTogUHJvbWlzZTxJVG9vbFJlc3VsdD4ge1xuXHRcdGNvbnN0IHBhcmFtcyA9IGludm9jYXRpb24ucGFyYW1ldGVycyBhcyBJUnVuUGxheXdyaWdodENvZGVUb29sUGFyYW1zO1xuXHRcdGNvbnN0IHNlc3Npb25JZCA9IGdldFNlc3Npb25JZChpbnZvY2F0aW9uKTtcblxuXHRcdGlmICghcGFyYW1zLnBhZ2VJZCkge1xuXHRcdFx0cmV0dXJuIGVycm9yUmVzdWx0KGBObyBwYWdlIElEIHByb3ZpZGVkLiBVc2UgJyR7T3BlblBhZ2VUb29sSWR9JyBmaXJzdC5gKTtcblx0XHR9XG5cblx0XHQvLyBSZXN1bWUgd2FpdGluZyBmb3IgYSBkZWZlcnJlZCBleGVjdXRpb25cblx0XHRpZiAocGFyYW1zLmRlZmVycmVkUmVzdWx0SWQpIHtcblx0XHRcdHRyeSB7XG5cdFx0XHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IHRoaXMucGxheXdyaWdodFNlcnZpY2Uud2FpdEZvckRlZmVycmVkUmVzdWx0KHNlc3Npb25JZCwgcGFyYW1zLmRlZmVycmVkUmVzdWx0SWQsIHBhcmFtcy50aW1lb3V0TXMgPz8gNV8wMDApO1xuXHRcdFx0XHRyZXR1cm4gaW52b2tlRnVuY3Rpb25SZXN1bHRUb1Rvb2xSZXN1bHQocmVzdWx0KTtcblx0XHRcdH0gY2F0Y2ggKGUpIHtcblx0XHRcdFx0cmV0dXJuIGVycm9yUmVzdWx0KGUgaW5zdGFuY2VvZiBFcnJvciA/IGUubWVzc2FnZSA6IFN0cmluZyhlKSk7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0aWYgKCFwYXJhbXMuY29kZSkge1xuXHRcdFx0cmV0dXJuIGVycm9yUmVzdWx0KCdFaXRoZXIgXCJjb2RlXCIgb3IgXCJkZWZlcnJlZFJlc3VsdElkXCIgbXVzdCBiZSBwcm92aWRlZC4nKTtcblx0XHR9XG5cblx0XHRsZXQgcmVzdWx0O1xuXHRcdHRyeSB7XG5cdFx0XHRyZXN1bHQgPSBhd2FpdCB0aGlzLnBsYXl3cmlnaHRTZXJ2aWNlLmludm9rZUZ1bmN0aW9uKHNlc3Npb25JZCwgcGFyYW1zLnBhZ2VJZCwgYGFzeW5jIChwYWdlKSA9PiB7ICR7cGFyYW1zLmNvZGV9IH1gLCB1bmRlZmluZWQsIHBhcmFtcy50aW1lb3V0TXMgPz8gNV8wMDApO1xuXHRcdH0gY2F0Y2ggKGUpIHtcblx0XHRcdGNvbnN0IG1lc3NhZ2UgPSBlIGluc3RhbmNlb2YgRXJyb3IgPyBlLm1lc3NhZ2UgOiBTdHJpbmcoZSk7XG5cdFx0XHRyZXR1cm4gZXJyb3JSZXN1bHQoYENvZGUgZXhlY3V0aW9uIGZhaWxlZDogJHttZXNzYWdlfWApO1xuXHRcdH1cblxuXHRcdHJldHVybiBpbnZva2VGdW5jdGlvblJlc3VsdFRvVG9vbFJlc3VsdChyZXN1bHQsIHBhcmFtcy5jb2RlLnRyaW0oKSk7XG5cdH1cbn1cbiJdLAogICJtYXBwaW5ncyI6ICI7Ozs7Ozs7Ozs7O0FBTUEsU0FBUyxlQUFlO0FBQ3hCLFNBQVMsc0JBQXNCO0FBQy9CLFNBQVMsZ0JBQWdCO0FBQ3pCLFNBQVMsMEJBQTBCO0FBQ25DLFNBQVMsc0JBQWlOO0FBQzFOLFNBQVMsYUFBYSxjQUFjLHdDQUF3QztBQUM1RSxTQUFTLG9DQUFvQztBQUM3QyxTQUFTLHNCQUFzQjtBQUV4QixNQUFNLDRCQUF1QztBQUFBLEVBQ25ELElBQUk7QUFBQSxFQUNKLG1CQUFtQiw2QkFBNkI7QUFBQSxF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
